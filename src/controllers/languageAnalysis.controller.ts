/**
 * 語言分級分析控制器
 */

import { Request, Response } from 'express';
import { createR2StorageRepository } from '../infrastructure/repositories/r2Storage.repository';
import { batchAnalyzeLanguageLevel } from '../usecases/batchAnalyzeLanguageLevel.useCase';
import { BatchAnalyzeRequest } from '../types/languageAnalysis.types';

/**
 * 批次分析語言難度
 * POST /api/batch-analyze-language-level
 */
export async function batchAnalyzeLanguageLevelController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    // 驗證請求參數
    const request: BatchAnalyzeRequest = {
      videoIds: req.body.videoIds,
      forceReanalyze: req.body.forceReanalyze || false,
      aiService: req.body.aiService || 'gemini',
      maxWordsPerLevel: req.body.maxWordsPerLevel || 20,
      maxPhrasesPerLevel: req.body.maxPhrasesPerLevel || 20
    };

    // 基本驗證
    if (request.videoIds && !Array.isArray(request.videoIds)) {
      res.status(400).json({
        error: 'videoIds must be an array of strings'
      });
      return;
    }

    if (request.aiService && !['gemini', 'openai'].includes(request.aiService)) {
      res.status(400).json({
        error: 'aiService must be either "gemini" or "openai"'
      });
      return;
    }

    console.log(`[Language Analysis API] Starting batch analysis with options:`, {
      videoCount: request.videoIds?.length || 'all unanalyzed',
      forceReanalyze: request.forceReanalyze,
      aiService: request.aiService
    });

    // 建立存儲庫
    const storageRepo = createR2StorageRepository();

    // 執行批次分析
    const result = await batchAnalyzeLanguageLevel(storageRepo, request);

    // 回傳結果
    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[Language Analysis API] Batch analysis failed:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

/**
 * 取得單一影片的語言分析結果
 * GET /api/language-analysis/:videoId
 */
export async function getLanguageAnalysisController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      res.status(400).json({
        error: 'videoId is required'
      });
      return;
    }

    console.log(`[Language Analysis API] Getting analysis for video: ${videoId}`);

    // 建立存儲庫
    const storageRepo = createR2StorageRepository();

    // 下載語言分析結果
    const analysisData = await storageRepo.downloadLanguageAnalysis(videoId);

    if (!analysisData) {
      res.status(404).json({
        error: `Language analysis not found for video: ${videoId}`
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: analysisData
    });

  } catch (error) {
    console.error(`[Language Analysis API] Failed to get analysis for ${req.params.videoId}:`, error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

/**
 * 取得語言分析統計資訊
 * GET /api/language-analysis/stats
 */
export async function getLanguageAnalysisStatsController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    console.log(`[Language Analysis API] Getting analysis statistics`);

    // 建立存儲庫
    const storageRepo = createR2StorageRepository();

    // 取得 VideoList
    const videoList = await storageRepo.getVideoList();

    // 統計分析狀態
    const totalVideos = videoList.length;
    const analyzedVideos = videoList.filter(v => v.languageAnalysis).length;
    const unanalyzedVideos = totalVideos - analyzedVideos;

    // 統計各難度級別
    const levelStats: Record<string, number> = {};
    videoList.forEach(video => {
      if (video.languageAnalysis?.level) {
        levelStats[video.languageAnalysis.level] = (levelStats[video.languageAnalysis.level] || 0) + 1;
      }
    });

    // 統計推薦對象
    const audienceStats: Record<string, number> = {};
    videoList.forEach(video => {
      if (video.languageAnalysis?.recommendedFor) {
        video.languageAnalysis.recommendedFor.forEach((audience: string) => {
          audienceStats[audience] = (audienceStats[audience] || 0) + 1;
        });
      }
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalVideos,
          analyzedVideos,
          unanalyzedVideos,
          analysisRate: totalVideos > 0 ? (analyzedVideos / totalVideos * 100).toFixed(1) + '%' : '0%'
        },
        levelDistribution: levelStats,
        audienceDistribution: audienceStats,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Language Analysis API] Failed to get statistics:', error);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}