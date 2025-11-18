/**
 * SRT 分段 Use Case
 */

import { StorageRepository } from '../domain/repositories/storage.repository';
import { SegmentationOptions, SegmentationResult } from '../types/srt.types';
import { segmentSRT } from '../services/srtSegmentation.service';

export const segmentSrtUseCase = async (
  storageRepo: StorageRepository,
  videoId: string,
  language: string,
  srtContent?: string,
  options?: Partial<SegmentationOptions>
): Promise<SegmentationResult> => {
  console.log(`[UseCase] Starting segmentation for ${videoId}/${language}`);
  
  // 1. 獲取 SRT 內容（如果沒有提供）
  let content = srtContent;
  if (!content) {
    console.log(`[UseCase] Fetching SRT from storage...`);
    const fetchedContent = await storageRepo.getSrt(videoId, language);
    if (!fetchedContent) {
      throw new Error(`SRT not found for ${videoId}/${language}`);
    }
    content = fetchedContent;
  }
  
  // 2. 執行分段
  const { segments, summary } = await segmentSRT(content, videoId, language, options);
  
  // 3. 上傳到 R2
  console.log(`[UseCase] Uploading segments and summary to R2...`);
  
  const segmentsResult = await storageRepo.uploadSegments(segments, videoId, language);
  const summaryResult = await storageRepo.uploadSummary(summary, videoId, language);
  
  if (!segmentsResult.success || !summaryResult.success) {
    throw new Error('Failed to upload segmentation results');
  }
  
  // 4. 返回結果
  return {
    videoId,
    language,
    segments,
    summary,
    urls: {
      srt: segmentsResult.remotePath || '',
      segments: segmentsResult.remotePath || '',
      summary: summaryResult.remotePath || ''
    }
  };
};
