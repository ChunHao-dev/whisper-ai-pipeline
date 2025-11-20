// 批次處理 Use Case

import { StorageRepository } from '../domain/repositories/storage.repository';
import { segmentSrtUseCase } from './segmentSrt.useCase';
import { translateSrtUseCase } from './translateSrt.useCase';
import type {
  VideoItem,
  BatchProcessOptions,
  VideoProcessStatus,
  BatchProcessResult,
  BatchJobStatus,
} from '../types/batch.types';

// 儲存批次任務狀態
const batchJobs = new Map<string, BatchJobStatus>();

/**
 * 隨機延遲函數（避免 API 速率限制）
 * @param minSeconds 最小延遲秒數
 * @param maxSeconds 最大延遲秒數
 */
const randomDelay = async (minSeconds: number, maxSeconds: number): Promise<void> => {
  const delayMs = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
  console.log(`[Batch] Waiting ${Math.round(delayMs / 1000)} seconds before next API call...`);
  await new Promise(resolve => setTimeout(resolve, delayMs));
};

/**
 * 檢查影片的處理狀態
 */
export async function checkVideoStatus(
  videoId: string,
  language: string,
  targetLanguages: string[],
  storageRepo: StorageRepository
): Promise<VideoProcessStatus> {
  const status: VideoProcessStatus = {
    videoId,
    language,
    hasSegments: false,
    hasSummary: false,
    translations: {},
    needsProcessing: {
      segmentation: false,
      translations: [],
    },
  };

  // 檢查原始語言的分段和摘要
  const segmentsPath = `${videoId}/${language}/segments.json`;
  const summaryPath = `${videoId}/${language}/summary.json`;

  status.hasSegments = await storageRepo.fileExists(segmentsPath);
  status.hasSummary = await storageRepo.fileExists(summaryPath);

  // 如果缺少分段或摘要，需要處理
  if (!status.hasSegments || !status.hasSummary) {
    status.needsProcessing.segmentation = true;
  }

  // 檢查翻譯語言
  for (const targetLang of targetLanguages) {
    if (targetLang === language) continue; // 跳過原始語言

    const translatedSegmentsPath = `${videoId}/${targetLang}/segments.json`;
    const translatedSummaryPath = `${videoId}/${targetLang}/summary.json`;

    const hasTranslatedSegments = await storageRepo.fileExists(translatedSegmentsPath);
    const hasTranslatedSummary = await storageRepo.fileExists(translatedSummaryPath);

    status.translations[targetLang] = {
      hasSegments: hasTranslatedSegments,
      hasSummary: hasTranslatedSummary,
    };

    // 如果缺少翻譯，需要處理
    if (!hasTranslatedSegments || !hasTranslatedSummary) {
      status.needsProcessing.translations.push(targetLang);
    }
  }

  return status;
}

/**
 * 處理單個影片
 */
export async function processVideo(
  videoId: string,
  language: string,
  options: BatchProcessOptions,
  storageRepo: StorageRepository
): Promise<BatchProcessResult> {
  const result: BatchProcessResult = {
    videoId,
    language,
    success: true,
    processed: {
      segmentation: false,
      translations: [],
    },
    skipped: {
      segmentation: false,
      translations: [],
    },
    errors: [],
  };

  const targetLanguages = options.targetLanguages || [];
  const forceReprocess = options.forceReprocess || false;

  try {
    // 檢查狀態
    const status = await checkVideoStatus(videoId, language, targetLanguages, storageRepo);

    // 處理分段
    if (status.needsProcessing.segmentation || forceReprocess) {
      try {
        console.log(`[Batch] Processing segmentation for ${videoId}/${language}`);
        
        // 隨機延遲 20-50 秒（避免 API 速率限制）
        await randomDelay(3, 5);
        
        await segmentSrtUseCase(
          storageRepo,
          videoId,
          language,
          undefined,
          {
            targetSegmentCount: options.targetSegments || 6,
            aiService: options.aiService || 'gemini',
          }
        );
        result.processed.segmentation = true;
      } catch (error) {
        const errorMsg = `Segmentation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(`[Batch] ${errorMsg}`);
      }
    } else {
      result.skipped.segmentation = true;
      console.log(`[Batch] Skipping segmentation for ${videoId}/${language} (already exists)`);
    }

    // 處理翻譯
    for (const targetLang of targetLanguages) {
      if (targetLang === language) continue;

      const needsTranslation = status.needsProcessing.translations.includes(targetLang);

      if (needsTranslation || forceReprocess) {
        try {
          console.log(`[Batch] Processing translation for ${videoId}/${language} -> ${targetLang}`);
          
          // 隨機延遲 20-50 秒（避免 API 速率限制）
          await randomDelay(2, 5);
          
          await translateSrtUseCase(
            storageRepo,
            videoId,
            language,
            targetLang,
            { aiService: options.aiService || 'gemini' }
          );
          result.processed.translations.push(targetLang);
        } catch (error) {
          const errorMsg = `Translation to ${targetLang} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          console.error(`[Batch] ${errorMsg}`);
        }
      } else {
        result.skipped.translations.push(targetLang);
        console.log(`[Batch] Skipping translation for ${videoId}/${language} -> ${targetLang} (already exists)`);
      }
    }

    // 如果有錯誤，標記為失敗
    if (result.errors.length > 0) {
      result.success = false;
    }
  } catch (error) {
    result.success = false;
    result.errors.push(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * 批次處理多個影片
 */
export async function batchProcessVideos(
  videos: VideoItem[],
  options: BatchProcessOptions,
  storageRepo: StorageRepository
): Promise<string> {
  const jobId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const job: BatchJobStatus = {
    jobId,
    status: 'pending',
    total: videos.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
    startedAt: new Date().toISOString(),
  };

  batchJobs.set(jobId, job);

  // 非同步處理
  (async () => {
    job.status = 'processing';

    for (const video of videos) {
      const language = video.language || 'default';

      try {
        const result = await processVideo(video.videoId, language, options, storageRepo);
        job.results.push(result);

        if (result.success) {
          job.succeeded++;
        } else {
          job.failed++;
        }
      } catch (error) {
        job.failed++;
        job.results.push({
          videoId: video.videoId,
          language,
          success: false,
          processed: { segmentation: false, translations: [] },
          skipped: { segmentation: false, translations: [] },
          errors: [`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`],
        });
      }

      job.processed++;
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
  })();

  return jobId;
}

/**
 * 取得批次任務狀態
 */
export function getBatchJobStatus(jobId: string): BatchJobStatus | null {
  return batchJobs.get(jobId) || null;
}

/**
 * 列出所有批次任務
 */
export function listBatchJobs(): BatchJobStatus[] {
  return Array.from(batchJobs.values());
}
