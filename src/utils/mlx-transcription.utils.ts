import { mlxWhisperService, MLXTranscriptionResult } from '../services/mlx-whisper.service';
import { downloadAndProcessYoutube } from './youtube.utils';
import { join } from 'path';
import { promises as fs } from 'fs';

export interface TranscriptionJob {
  id: string;
  type: 'file' | 'youtube';
  source: string; // 檔案路徑或 YouTube URL
  language?: string;
  model?: string;
  outputDir?: string;
}

export interface TranscriptionJobResult {
  jobId: string;
  success: boolean;
  result?: MLXTranscriptionResult;
  error?: string;
  processedAt: string;
}

/**
 * 處理檔案轉錄任務（用於 SQS 或 API）
 */
export async function processFileTranscription(
  job: TranscriptionJob
): Promise<TranscriptionJobResult> {
  const startTime = new Date().toISOString();
  
  try {
    console.log(`開始處理檔案轉錄任務: ${job.id}`);
    console.log(`來源檔案: ${job.source}`);

    // 檢查檔案是否存在
    await fs.access(job.source);

    // 執行轉錄
    const result = await mlxWhisperService.processTranscription(job.source, {
      language: job.language,
      model: job.model,
      saveSrt: true,
      outputDir: job.outputDir || join(process.cwd(), 'uploads')
    });

    console.log(`檔案轉錄任務完成: ${job.id} - 成功: ${result.success}`);

    return {
      jobId: job.id,
      success: result.success,
      result: result.success ? result : undefined,
      error: result.success ? undefined : result.error,
      processedAt: startTime
    };

  } catch (error) {
    console.error(`檔案轉錄任務失敗: ${job.id}`, error);
    
    return {
      jobId: job.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      processedAt: startTime
    };
  }
}

/**
 * 處理 YouTube 轉錄任務（用於 SQS 或 API）
 */
export async function processYoutubeTranscription(
  job: TranscriptionJob
): Promise<TranscriptionJobResult> {
  const startTime = new Date().toISOString();
  let audioFiles: string[] = [];

  try {
    console.log(`開始處理 YouTube 轉錄任務: ${job.id}`);
    console.log(`YouTube URL: ${job.source}`);

    // 下載 YouTube 音訊
    const downloadResult = await downloadAndProcessYoutube(job.source, job.id);
    audioFiles = downloadResult.audioFiles;
    
    if (!audioFiles.length) {
      throw new Error('YouTube 音訊下載失敗');
    }

    const audioPath = join(process.cwd(), audioFiles[0]);
    console.log(`YouTube 音訊已下載: ${audioPath}`);

    // 執行轉錄
    const result = await mlxWhisperService.processTranscription(audioPath, {
      language: job.language,
      model: job.model,
      saveSrt: true,
      outputDir: job.outputDir || join(process.cwd(), 'uploads')
    });

    // 清理音訊檔案
    await fs.unlink(audioPath);
    console.log(`已清理音訊檔案: ${audioPath}`);

    console.log(`YouTube 轉錄任務完成: ${job.id} - 成功: ${result.success}`);

    return {
      jobId: job.id,
      success: result.success,
      result: result.success ? result : undefined,
      error: result.success ? undefined : result.error,
      processedAt: startTime
    };

  } catch (error) {
    console.error(`YouTube 轉錄任務失敗: ${job.id}`, error);

    // 錯誤時清理所有音訊檔案
    if (audioFiles.length > 0) {
      await Promise.all(audioFiles.map(async (filePath) => {
        try {
          const absolutePath = join(process.cwd(), filePath);
          await fs.unlink(absolutePath);
          console.log(`已清理檔案: ${absolutePath}`);
        } catch (cleanupError) {
          console.error(`清理檔案失敗: ${filePath}`, cleanupError);
        }
      }));
    }
    
    return {
      jobId: job.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      processedAt: startTime
    };
  }
}

/**
 * 通用轉錄處理器（根據任務類型自動選擇處理方式）
 */
export async function processTranscriptionJob(
  job: TranscriptionJob
): Promise<TranscriptionJobResult> {
  console.log(`收到轉錄任務: ${job.id} (${job.type})`);

  switch (job.type) {
    case 'file':
      return await processFileTranscription(job);
    
    case 'youtube':
      return await processYoutubeTranscription(job);
    
    default:
      return {
        jobId: job.id,
        success: false,
        error: `不支援的任務類型: ${(job as any).type}`,
        processedAt: new Date().toISOString()
      };
  }
}

/**
 * 批次處理多個轉錄任務
 */
export async function processBatchTranscriptionJobs(
  jobs: TranscriptionJob[]
): Promise<TranscriptionJobResult[]> {
  console.log(`開始批次處理 ${jobs.length} 個轉錄任務`);

  const results: TranscriptionJobResult[] = [];

  // 依序處理（避免同時處理太多任務造成資源不足）
  for (const job of jobs) {
    const result = await processTranscriptionJob(job);
    results.push(result);

    // 記錄處理結果
    if (result.success) {
      console.log(`✅ 任務 ${job.id} 處理成功`);
    } else {
      console.error(`❌ 任務 ${job.id} 處理失敗: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`批次處理完成: ${successCount}/${jobs.length} 成功`);

  return results;
}