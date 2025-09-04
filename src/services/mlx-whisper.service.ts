import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';
import {
  TranscriptionSegment,
  TranscriptionWord,
  generateSrtFromSegments,
  generateSrtContent,
  formatSrtTime
} from '../domain/entities';

// Legacy interfaces for backward compatibility
export interface MLXWhisperWord extends TranscriptionWord {}
export interface MLXWhisperSegment extends TranscriptionSegment {}

export interface MLXWhisperResult {
  text: string;
  language: string;
  segments: TranscriptionSegment[];
}

export interface WordSegment {
  text: string;
  t0: number;    // 開始時間（秒）
  t1: number;    // 結束時間（秒）
}

export interface SentenceSegment {
  text: string;
  start: number;
  end: number;
  index: number;
  srt_timestamp: string;  // 格式：00:00:01,000 --> 00:00:03,500
  start_time: string;     // 格式：00:00:01,000
  end_time: string;       // 格式：00:00:03,500
}

export interface MLXTranscriptionResult {
  success: boolean;
  text: string;
  language: string;
  segments: MLXWhisperSegment[];
  sentences: SentenceSegment[];
  srtContent: string;
  srtPath?: string;
  error?: string;
}

export interface MLXWhisperResponse {
  success?: boolean;
  result?: MLXWhisperResult;
  error?: string;
}

export interface MLXWhisperOptions {
  model?: string;
  language?: string;
  outputFile?: string;
}

export interface MLXWhisperConfig {
  pythonPath: string;
  scriptPath: string;
  venvPath: string;
}

// 設定工廠函數
const createMLXWhisperConfig = (): MLXWhisperConfig => {
  const venvPath = join(__dirname, '../../.venv');
  const pythonPath = join(venvPath, 'bin', 'python');
  const scriptPath = join(__dirname, '../../scripts/mlx_whisper_wrapper.py');
  
  return {
    pythonPath,
    scriptPath,
    venvPath
  };
};

// 執行 Python 腳本的純函數
const executePythonScript = (
  config: MLXWhisperConfig
) => async (
  args: string[],
  options: { timeout?: number } = {}
): Promise<MLXWhisperResponse> => {
  const { timeout = 300000 } = options; // 5分鐘預設超時

  return new Promise((resolve, reject) => {
    const childProcess = spawn(config.pythonPath, args, {
      cwd: join(__dirname, '../..'),
      env: {
        ...process.env,
        PYTHONPATH: join(config.venvPath, 'lib/python3.11/site-packages')
      }
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: any) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data: any) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      childProcess.kill('SIGTERM');
      reject(new Error(`執行超時 (${timeout}ms)`));
    }, timeout);

    childProcess.on('close', (code: any) => {
      clearTimeout(timeoutId);

      if (code !== 0) {
        console.error('Python 腳本執行錯誤:', stderr);
        reject(new Error(`Python 腳本執行失敗 (exit code: ${code}): ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout) as MLXWhisperResponse;
        resolve(result);
      } catch (parseError) {
        console.error('解析 JSON 結果失敗:', stdout);
        reject(new Error(`解析結果失敗: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
      }
    });

    childProcess.on('error', (error: any) => {
      clearTimeout(timeoutId);
      reject(new Error(`啟動 Python 進程失敗: ${error.message}`));
    });
  });
};

// 使用 Domain Entity 的時間格式化函數 (formatSrtTime)

// 將 word-level segments 組合成完整句子的純函數
const combineWordsToSentences = (wordSegments: WordSegment[]): SentenceSegment[] => {
  if (!wordSegments.length) {
    return [];
  }

  const sentences: SentenceSegment[] = [];
  let currentWords: WordSegment[] = [];
  let sentenceIndex = 1;

  // 句子結束標點
  const sentenceEndPunctuation = '.!?。！？；;';

  for (let i = 0; i < wordSegments.length; i++) {
    const wordSegment = wordSegments[i];
    
    // 跳過空白的 segments
    if (!wordSegment.text.trim()) {
      continue;
    }

    currentWords.push(wordSegment);

    // 檢查是否需要結束當前句子
    let shouldEndSentence = false;

    // 檢查句子結束標點
    if (sentenceEndPunctuation.split('').some(punct => wordSegment.text.includes(punct))) {
      shouldEndSentence = true;
    }

    // 如果是最後一個詞，也要結束句子
    if (i === wordSegments.length - 1) {
      shouldEndSentence = true;
    }

    if (shouldEndSentence && currentWords.length > 0) {
      // 建立句子
      const sentenceText = currentWords.map(word => word.text).join(' ')
        .replace(/\s+/g, ' ').trim();

      const startTime = currentWords[0].t0;
      const endTime = currentWords[currentWords.length - 1].t1;

      const startTimeStr = formatSrtTime(startTime);
      const endTimeStr = formatSrtTime(endTime);
      const srtTimestamp = `${startTimeStr} --> ${endTimeStr}`;

      const sentence: SentenceSegment = {
        text: sentenceText,
        start: startTime,
        end: endTime,
        index: sentenceIndex,
        srt_timestamp: srtTimestamp,
        start_time: startTimeStr,
        end_time: endTimeStr
      };

      sentences.push(sentence);
      sentenceIndex++;
      currentWords = [];
    }
  }

  return sentences;
};

// 使用 Domain Entity 的 SRT 生成函數
const generateSRT = (result: MLXWhisperResult): string => {
  return generateSrtFromSegments(result.segments);
};

// 轉錄音頻檔案並返回逐字時間戳
export const transcribeWithWordTimestamps = async (
  audioPath: string,
  options: MLXWhisperOptions = {}
): Promise<MLXWhisperResult> => {
  const config = createMLXWhisperConfig();
  const executeScript = executePythonScript(config);
  
  const {
    model = 'mlx-community/whisper-large-v3-turbo',
    language,
    outputFile
  } = options;

  try {
    // 檢查音頻檔案是否存在
    await fs.access(audioPath);

    // 構建命令參數
    const args = [config.scriptPath, audioPath, '--model', model];
    
    if (language) {
      args.push('--language', language);
    }
    
    if (outputFile) {
      args.push('--output', outputFile);
    }

    console.log(`執行 MLX Whisper 轉錄: ${audioPath}`);
    console.log(`使用模型: ${model}`);
    if (language) {
      console.log(`指定語言: ${language}`);
    }

    const result = await executeScript(args);
    
    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.success || !result.result) {
      throw new Error('轉錄失敗：未收到有效結果');
    }

    console.log('MLX Whisper 轉錄完成');
    return result.result;

  } catch (error) {
    console.error('MLX Whisper 轉錄錯誤:', error);
    throw new Error(`MLX Whisper 轉錄失敗: ${error instanceof Error ? error.message : String(error)}`);
  }
};

// 檢查 MLX Whisper 環境是否可用
export const checkEnvironment = async (): Promise<{ available: boolean; error?: string }> => {
  const config = createMLXWhisperConfig();
  const executeScript = executePythonScript(config);
  
  try {
    // 檢查 Python 路徑
    await fs.access(config.pythonPath);
    
    // 檢查腳本檔案
    await fs.access(config.scriptPath);
    
    // 簡單測試：執行 Python 腳本但不提供音頻檔案
    await executeScript(['--help'], { timeout: 5000 });
    
    return { available: true };
  } catch (error) {
    return {
      available: false,
      error: `MLX Whisper 環境不可用: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

// 完整的 MLX Whisper 轉錄處理（包含 word-level 重組和 SRT 生成）
export const processTranscription = async (
  audioPath: string,
  options: MLXWhisperOptions & { saveSrt?: boolean; outputDir?: string } = {}
): Promise<MLXTranscriptionResult> => {
  const {
    model = 'mlx-community/whisper-large-v3-turbo',
    language,
    saveSrt = true,
    outputDir = join(__dirname, '../../uploads')
  } = options;

  try {
    console.log(`開始 MLX Whisper 完整轉錄處理: ${audioPath}`);

    // 1. 執行轉錄獲取 word-level timestamps
    const result = await transcribeWithWordTimestamps(audioPath, {
      model,
      language
    });

    // 2. 收集所有 word segments
    const allWordSegments: WordSegment[] = [];
    
    for (const segment of result.segments) {
      if (segment.words && segment.words.length > 0) {
        for (const word of segment.words) {
          allWordSegments.push({
            text: word.word,
            t0: word.start,
            t1: word.end
          });
        }
      }
    }

    // 3. 組合成句子
    const sentences = combineWordsToSentences(allWordSegments);

    // 4. 使用 Domain Entity 生成 SRT 內容
    // 將 SentenceSegment 轉換為 TranscriptionSentence 格式
    const transcriptionSentences = sentences.map(sentence => ({
      text: sentence.text,
      start: sentence.start,
      end: sentence.end,
      index: sentence.index,
      srtTimestamp: sentence.srt_timestamp,
      startTime: sentence.start_time,
      endTime: sentence.end_time
    }));
    
    const srtContent = generateSrtContent(transcriptionSentences);

    // 5. 保存 SRT 檔案（如果需要）
    let srtPath: string | undefined;
    if (saveSrt) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = require('path').basename(audioPath, require('path').extname(audioPath));
      const srtFileName = `${baseName}_${timestamp}.srt`;
      srtPath = join(outputDir, srtFileName);
      
      await fs.writeFile(srtPath, srtContent, 'utf-8');
      console.log(`SRT 檔案已生成: ${srtPath}`);
    }

    const transcriptionResult: MLXTranscriptionResult = {
      success: true,
      text: result.text,
      language: result.language,
      segments: result.segments,
      sentences,
      srtContent,
      srtPath
    };

    console.log(`MLX Whisper 處理完成 - 共 ${sentences.length} 個句子，${allWordSegments.length} 個詞`);
    return transcriptionResult;

  } catch (error) {
    console.error('MLX Whisper 處理失敗:', error);
    return {
      success: false,
      text: '',
      language: 'unknown',
      segments: [],
      sentences: [],
      srtContent: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// 導出便利函數物件（保持向後兼容）
export const mlxWhisperService = {
  transcribeWithWordTimestamps,
  checkEnvironment,
  generateSRT,
  processTranscription
};