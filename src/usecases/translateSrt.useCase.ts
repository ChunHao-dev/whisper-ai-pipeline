/**
 * SRT 翻譯 Use Case
 */

import { StorageRepository } from '../domain/repositories/storage.repository';
import { TranslationOptions, TranslationResult } from '../types/srt.types';
import { segmentSRT } from '../services/srtSegmentation.service';
import { translateSRT } from '../services/srtTranslation.service';
import path from 'path';

export const translateSrtUseCase = async (
  storageRepo: StorageRepository,
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  options?: Partial<TranslationOptions>
): Promise<TranslationResult> => {
  console.log(`[UseCase] Starting translation ${videoId}: ${sourceLanguage} -> ${targetLanguage}`);
  
  const aiService = options?.aiService || 'gemini';
  
  // 1. 獲取原文 SRT
  const sourceSRT = await storageRepo.getSrt(videoId, sourceLanguage);
  if (!sourceSRT) {
    throw new Error(`Source SRT not found for ${videoId}/${sourceLanguage}`);
  }
  
  // 2. 檢查是否已有分段，沒有則先分段
  let sourceSegments = await storageRepo.getSegments(videoId, sourceLanguage);
  let sourceSummary = await storageRepo.getSummary(videoId, sourceLanguage);
  
  if (!sourceSegments || !sourceSummary) {
    console.log(`[UseCase] No segmentation found, creating...`);
    const segResult = await segmentSRT(sourceSRT, videoId, sourceLanguage, { aiService });
    sourceSegments = segResult.segments;
    sourceSummary = segResult.summary;
    
    // 上傳原文分段
    await storageRepo.uploadSegments(sourceSegments, videoId, sourceLanguage);
    await storageRepo.uploadSummary(sourceSummary, videoId, sourceLanguage);
  }
  
  // 3. 執行翻譯
  const { translatedSRT, translatedSegments, translatedSummary } = await translateSRT(
    sourceSRT,
    sourceSegments,
    sourceSummary,
    targetLanguage,
    aiService
  );
  
  // 4. 儲存翻譯後的 SRT 到本地
  const tempDir = path.join(process.cwd(), 'uploads');
  const translatedSrtPath = await storageRepo.saveSrtLocally(
    translatedSRT,
    `${videoId}-${targetLanguage}.srt`,
    tempDir
  );
  
  // 5. 上傳翻譯結果到 R2
  console.log(`[UseCase] Uploading translated files to R2...`);
  
  const uploadResult = await storageRepo.uploadLanguagePackage(
    videoId,
    targetLanguage,
    {
      srtPath: translatedSrtPath,
      segments: translatedSegments,
      summary: translatedSummary
    }
  );
  
  if (!uploadResult.success) {
    throw new Error('Failed to upload translation results');
  }
  
  // 6. 清理本地檔案
  await storageRepo.deleteFile(translatedSrtPath);
  
  // 7. 返回結果
  return {
    videoId,
    original: {
      language: sourceLanguage,
      segments: sourceSegments,
      summary: sourceSummary,
      urls: {
        srt: `${videoId}/${sourceLanguage}/${videoId}.srt`,
        segments: `${videoId}/${sourceLanguage}/segments.json`,
        summary: `${videoId}/${sourceLanguage}/summary.json`
      }
    },
    translated: {
      language: targetLanguage,
      segments: translatedSegments,
      summary: translatedSummary,
      urls: {
        srt: `${videoId}/${targetLanguage}/${videoId}.srt`,
        segments: `${videoId}/${targetLanguage}/segments.json`,
        summary: `${videoId}/${targetLanguage}/summary.json`
      }
    }
  };
};
