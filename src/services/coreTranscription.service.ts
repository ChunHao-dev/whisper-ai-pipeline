import { join } from "path";
import { whisperService } from "./whisper.service";
import { WhisperParams } from "../types/whisper.types";
import { formatTimestamp } from "../utils/time.utils";
import { combineWordsToSentences, WordSegment } from "../utils/sentence.utils";

export interface CoreTranscriptionOptions {
  filePath: string;
  language: string;
  wordLevel?: boolean;
  onSegment?: (segment: any) => void;
  onProgress?: (progress: any) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export interface CoreTranscriptionResult {
  text: string;
  segments: any[];
}

/**
 * 核心轉錄邏輯 - 統一的 Whisper 轉錄處理
 * 所有轉錄 Service 都使用這個核心邏輯，確保行為一致
 */
export const coreTranscriptionLogic = async (
  options: CoreTranscriptionOptions
): Promise<CoreTranscriptionResult> => {
  const { filePath, language, wordLevel = false, onSegment, onProgress, onComplete, onError } = options;
  
  let segmentIndex = 1;
  let allSegments: Array<{text: string; start: number; end: number; t0?: number; t1?: number}> = [];
  let wordSegments: WordSegment[] = [];

  try {
    // 統一的 Whisper 參數設定
    const params: WhisperParams = {
      language,
      model: join(process.cwd(), "models/ggml-large-v3-turbo.bin"),
      use_gpu: true,
      fname_inp: filePath,
      no_prints: true,
      flash_attn: false,
      comma_in_time: false,
      translate: false,
      no_timestamps: false,
      audio_ctx: 0,
      max_len: wordLevel ? 1 : 0, // word level 模式時設置 max_len: 1
      segment_callback: (segment) => {
        if (wordLevel) {
          // Word level 模式：收集 word segments
          wordSegments.push({
            text: segment.text,
            t0: segment.t0,
            t1: segment.t1
          });
        } else {
          // 正常模式：發送即時 segments
          const formattedSegment = {
            ...segment,
            index: segmentIndex++,
            srtTimestamp: `${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}`,
            startTime: formatTimestamp(segment.t0),
            endTime: formatTimestamp(segment.t1)
          };
          
          console.log(`${formattedSegment.index}\n${formattedSegment.srtTimestamp}\n${segment.text}\n`);
          if (onSegment) {
            onSegment(formattedSegment);
          }
        }
      },
      progress_callback: (progress) => {
        if (onProgress) {
          onProgress(progress);
        }
      },
    };

    // 執行轉錄
    const result = await whisperService.transcribe(params);
    console.log(`完成檔案 ${filePath} 的轉錄`);

    // 處理轉錄結果
    let finalText: string;
    let finalSegments: any[];

    if (wordLevel) {
      // Word level 模式：組合成句子
      console.log(`總共收集到 ${wordSegments.length} 個 word segments`);
      const sentences = combineWordsToSentences(wordSegments);
      console.log(`組合成 ${sentences.length} 個句子`);
      
      // 發送句子級別的 segments
      sentences.forEach((sentence) => {
        if (onSegment) {
          onSegment(sentence);
        }
      });

      // 準備最終結果
      finalText = sentences.map(s => s.text).join(' ');
      finalSegments = sentences.map(s => ({
        text: s.text,
        start: s.start,
        end: s.end
      }));
    } else {
      // 正常模式：使用原始結果
      if (result.segments) {
        allSegments.push(...result.segments);
      }

      finalText = allSegments
        .sort((a, b) => a.start - b.start)
        .map(segment => segment.text)
        .join(' ');
      
      finalSegments = allSegments;
    }

    const transcriptionResult: CoreTranscriptionResult = {
      text: finalText,
      segments: finalSegments
    };

    // 通知完成
    if (onComplete) {
      onComplete(transcriptionResult);
    }

    return transcriptionResult;

  } catch (error) {
    console.error("核心轉錄處理失敗:", error);
    const errorMessage = error instanceof Error ? error.message : "未知錯誤";
    
    if (onError) {
      onError(errorMessage);
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * 創建進度回調包裝器 - 用於不同進度格式的轉換
 */
export const createProgressWrapper = (
  onProgress?: (progress: any) => void,
  progressFormat: 'simple' | 'detailed' = 'simple'
) => {
  if (!onProgress) return undefined;
  
  return (progress: number) => {
    if (progressFormat === 'detailed') {
      // 詳細進度格式（用於 YouTube 轉錄）
      onProgress({
        currentPart: 1,
        totalParts: 1,
        partProgress: progress,
        totalProgress: progress
      });
    } else {
      // 簡單進度格式（用於檔案轉錄）
      onProgress(progress);
    }
  };
};