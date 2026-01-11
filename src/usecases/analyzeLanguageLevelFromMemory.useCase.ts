/**
 * 從記憶體中的 SRT 內容分析語言難度 - 用於 SQS 流程
 */

import { StorageRepository } from '../domain/repositories/storage.repository';
import { LanguageAnalysis, AnalysisOptions } from '../types/languageAnalysis.types';
import { parseSRT } from '../utils/srt.utils';
import { analyzeSRTLanguageLevel, generateLearningMetadata } from '../services/languageAnalysis.service';

/**
 * 從記憶體中的 SRT 內容分析語言難度
 * 用於 SQS 流程，避免重新下載 SRT 檔案
 */
export async function analyzeLanguageLevelFromMemory(
  storageRepo: StorageRepository,
  videoId: string,
  language: string,
  srtContent: string,
  options: AnalysisOptions
): Promise<LanguageAnalysis> {
  
  console.log(`[Language Analysis] Starting analysis for video ${videoId}`);
  
  try {
    // 1. 解析 SRT 內容
    const parsedSRT = parseSRT(srtContent);
    console.log(`[Language Analysis] Parsed ${parsedSRT.entries.length} SRT entries`);
    
    // 2. 執行語言分析
    const analysis = await analyzeSRTLanguageLevel(
      videoId,
      parsedSRT.entries,
      options
    );
    
    console.log(`[Language Analysis] Analysis completed: ${analysis.overallLevel} (confidence: ${analysis.confidence})`);
    
    // 3. 生成學習輔助資訊
    const learningMetadata = await generateLearningMetadata(analysis);
    
    // 4. 上傳分析結果到 R2
    const uploadResult = await storageRepo.uploadLanguageAnalysis(videoId, {
      analysis,
      learningMetadata
    });
    
    if (uploadResult.success) {
      console.log(`[Language Analysis] Successfully uploaded analysis to: ${uploadResult.remotePath}`);
    } else {
      console.error(`[Language Analysis] Failed to upload analysis:`, uploadResult.error);
      throw new Error(`Failed to upload language analysis: ${uploadResult.error}`);
    }
    
    // 5. 更新 VideoList（標記已分析）
    try {
      const videoList = await storageRepo.getVideoList();
      const videoIndex = videoList.findIndex(v => v.videoId === videoId);
      
      if (videoIndex !== -1) {
        videoList[videoIndex] = {
          ...videoList[videoIndex],
          languageAnalysis: {
            level: analysis.overallLevel,
            primaryLevel: analysis.primaryLevel,
            confidence: analysis.confidence,
            analyzedAt: analysis.metadata.analyzedAt,
            keyTopics: learningMetadata.learningFeatures.keyTopics,
            recommendedFor: learningMetadata.learningFeatures.recommendedFor
          }
        };
        
        const uploadListResult = await storageRepo.uploadVideoList(videoList);
        if (uploadListResult.success) {
          console.log(`[Language Analysis] Successfully updated VideoList`);
        } else {
          console.error(`[Language Analysis] Failed to update VideoList:`, uploadListResult.error);
          // VideoList 更新失敗不影響分析成功
        }
      }
    } catch (videoListError) {
      console.error(`[Language Analysis] VideoList update failed:`, videoListError);
      // VideoList 更新失敗不影響分析成功
    }
    
    return analysis;
    
  } catch (error) {
    console.error(`[Language Analysis] Failed to analyze video ${videoId}:`, error);
    throw error;
  }
}