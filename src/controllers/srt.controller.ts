/**
 * SRT Controller - 處理 SRT 分段和翻譯的 API 端點
 */

import { Request, Response } from 'express';
import { createR2StorageRepository } from '../infrastructure/repositories/r2Storage.repository';
import { segmentSrtUseCase } from '../usecases/segmentSrt.useCase';
import { translateSrtUseCase } from '../usecases/translateSrt.useCase';

const storageRepo = createR2StorageRepository();

/**
 * POST /api/srt/segment
 * 分段 SRT（不翻譯）
 */
export const segmentSrtController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId, language, srtContent, options } = req.body;
    
    if (!videoId || !language) {
      res.status(400).json({
        success: false,
        error: 'videoId and language are required'
      });
      return;
    }
    
    const result = await segmentSrtUseCase(
      storageRepo,
      videoId,
      language,
      srtContent,
      options
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[SRT Controller] Segmentation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * POST /api/srt/translate
 * 翻譯 SRT（包含分段）
 */
export const translateSrtController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId, sourceLanguage, targetLanguage, options } = req.body;
    
    if (!videoId || !sourceLanguage || !targetLanguage) {
      res.status(400).json({
        success: false,
        error: 'videoId, sourceLanguage, and targetLanguage are required'
      });
      return;
    }
    
    const result = await translateSrtUseCase(
      storageRepo,
      videoId,
      sourceLanguage,
      targetLanguage,
      options
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[SRT Controller] Translation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/srt/segmentation/:videoId/:language
 * 獲取分段資訊
 */
export const getSegmentationController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId, language } = req.params;
    
    const segments = await storageRepo.getSegments(videoId, language);
    const summary = await storageRepo.getSummary(videoId, language);
    
    if (!segments || !summary) {
      res.status(404).json({
        success: false,
        error: 'Segmentation not found'
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        segments,
        summary
      }
    });
  } catch (error) {
    console.error('[SRT Controller] Get segmentation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/srt/:videoId/:language
 * 獲取 SRT 內容
 */
export const getSrtController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { videoId, language } = req.params;
    
    const srtContent = await storageRepo.getSrt(videoId, language);
    
    if (!srtContent) {
      res.status(404).json({
        success: false,
        error: 'SRT not found'
      });
      return;
    }
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(srtContent);
  } catch (error) {
    console.error('[SRT Controller] Get SRT error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
