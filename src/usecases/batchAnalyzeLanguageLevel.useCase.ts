/**
 * 批次語言分級分析 - 用於 API 端點
 */

import { StorageRepository } from '../domain/repositories/storage.repository';
import { 
  BatchAnalyzeRequest, 
  BatchAnalysisResult, 
  LanguageAnalysis,
  AnalysisOptions 
} from '../types/languageAnalysis.types';
import { parseSRT } from '../utils/srt.utils';
import { analyzeSRTLanguageLevel, generateLearningMetadata } from '../services/languageAnalysis.service';

/**
 * 批次分析多個影片的語言難度
 * 用於 API 端點，可指定影片或分析所有未分級影片
 */
export async function batchAnalyzeLanguageLevel(
  storageRepo: StorageRepository,
  request: BatchAnalyzeRequest
): Promise<BatchAnalysisResult> {
  
  const startTime = Date.now();
  console.log(`[Batch Language Analysis] Starting batch analysis`);
  
  try {
    // 1. 決定要分析的影片列表
    const videosToAnalyze = await determineVideosToAnalyze(storageRepo, request);
    console.log(`[Batch Language Analysis] Found ${videosToAnalyze.length} videos to analyze`);
    
    if (videosToAnalyze.length === 0) {
      return {
        processedVideos: 0,
        results: [],
        summary: {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          processingTime: Date.now() - startTime
        }
      };
    }
    
    // 2. 準備分析選項
    const analysisOptions: AnalysisOptions = {
      aiService: request.aiService || 'gemini',
      maxWordsPerLevel: request.maxWordsPerLevel || 20,
      maxPhrasesPerLevel: request.maxPhrasesPerLevel || 20
    };
    
    // 3. 逐一分析每個影片
    const results = [];
    let successful = 0;
    let failed = 0;
    
    for (const videoId of videosToAnalyze) {
      try {
        console.log(`[Batch Language Analysis] Processing video: ${videoId}`);
        
        // 下載 SRT 檔案
        const srtContent = await storageRepo.getSrt(videoId, 'default');
        if (!srtContent) {
          throw new Error(`SRT file not found for video ${videoId}`);
        }
        
        // 解析 SRT
        const parsedSRT = parseSRT(srtContent);
        
        // 執行語言分析
        const analysis = await analyzeSRTLanguageLevel(
          videoId,
          parsedSRT.entries,
          analysisOptions
        );
        
        // 生成學習輔助資訊
        const learningMetadata = await generateLearningMetadata(analysis);
        
        // 上傳分析結果
        const uploadResult = await storageRepo.uploadLanguageAnalysis(videoId, {
          analysis,
          learningMetadata
        });
        
        if (!uploadResult.success) {
          throw new Error(`Failed to upload analysis: ${uploadResult.error}`);
        }
        
        results.push({
          videoId,
          success: true,
          analysis,
          learningMetadata
        });
        
        successful++;
        console.log(`[Batch Language Analysis] Successfully analyzed ${videoId}: ${analysis.overallLevel}`);
        
      } catch (error) {
        console.error(`[Batch Language Analysis] Failed to analyze ${videoId}:`, error);
        results.push({
          videoId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        failed++;
      }
    }
    
    // 4. 更新 VideoList（批次更新）
    if (successful > 0) {
      try {
        await updateVideoListWithAnalysis(storageRepo, results.filter(r => r.success));
        console.log(`[Batch Language Analysis] Successfully updated VideoList with ${successful} analyses`);
      } catch (videoListError) {
        console.error(`[Batch Language Analysis] Failed to update VideoList:`, videoListError);
        // VideoList 更新失敗不影響分析結果
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[Batch Language Analysis] Batch completed: ${successful} successful, ${failed} failed, ${processingTime}ms`);
    
    return {
      processedVideos: videosToAnalyze.length,
      results,
      summary: {
        totalProcessed: videosToAnalyze.length,
        successful,
        failed,
        processingTime
      }
    };
    
  } catch (error) {
    console.error(`[Batch Language Analysis] Batch analysis failed:`, error);
    throw error;
  }
}

/**
 * 決定要分析的影片列表
 */
async function determineVideosToAnalyze(
  storageRepo: StorageRepository,
  request: BatchAnalyzeRequest
): Promise<string[]> {
  
  if (request.videoIds && request.videoIds.length > 0) {
    // 使用指定的影片 ID
    console.log(`[Batch Language Analysis] Using specified video IDs: ${request.videoIds.join(', ')}`);
    return request.videoIds;
  }
  
  // 從 VideoList 找出未分析的影片
  const videoList = await storageRepo.getVideoList();
  const unanalyzedVideos = videoList
    .filter(video => {
      if (request.forceReanalyze) {
        return true; // 強制重新分析所有影片
      }
      return !video.languageAnalysis; // 只分析未分析的影片
    })
    .map(video => video.videoId);
  
  console.log(`[Batch Language Analysis] Found ${unanalyzedVideos.length} unanalyzed videos in VideoList`);
  return unanalyzedVideos;
}

/**
 * 更新 VideoList 中的語言分析資訊
 */
async function updateVideoListWithAnalysis(
  storageRepo: StorageRepository,
  successfulResults: Array<{
    videoId: string;
    success: boolean;
    analysis?: LanguageAnalysis;
    learningMetadata?: any;
  }>
): Promise<void> {
  
  const videoList = await storageRepo.getVideoList();
  
  // 更新每個成功分析的影片
  for (const result of successfulResults) {
    // 只處理成功的結果
    if (!result.success || !result.analysis || !result.learningMetadata) {
      continue;
    }
    
    const videoIndex = videoList.findIndex(v => v.videoId === result.videoId);
    
    if (videoIndex !== -1) {
      videoList[videoIndex] = {
        ...videoList[videoIndex],
        languageAnalysis: {
          level: result.analysis.overallLevel,
          primaryLevel: result.analysis.primaryLevel,
          confidence: result.analysis.confidence,
          analyzedAt: result.analysis.metadata.analyzedAt,
          keyTopics: result.learningMetadata.learningFeatures.keyTopics,
          recommendedFor: result.learningMetadata.learningFeatures.recommendedFor
        }
      };
    }
  }
  
  // 上傳更新後的 VideoList
  const uploadResult = await storageRepo.uploadVideoList(videoList);
  if (!uploadResult.success) {
    throw new Error(`Failed to upload updated VideoList: ${uploadResult.error}`);
  }
}