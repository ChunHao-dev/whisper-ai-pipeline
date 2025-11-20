// 批次處理 Controller

import { Request, Response } from 'express';
import { defaultStorageRepository } from '../infrastructure/repositories';
import {
  checkVideoStatus,
  processVideo,
  batchProcessVideos,
  getBatchJobStatus,
  listBatchJobs,
} from '../usecases/batchProcess.useCase';
import type { VideoItem, BatchProcessOptions } from '../types/batch.types';

/**
 * 檢查單個影片的狀態
 * GET /api/batch/check/:videoId
 */
export async function checkVideoStatusController(req: Request, res: Response): Promise<void> {
  try {
    const { videoId } = req.params;
    const { language = 'default', targetLanguages = 'zh' } = req.query;

    const targetLangs = (targetLanguages as string).split(',').map(l => l.trim());
    const storageRepo = defaultStorageRepository;

    const status = await checkVideoStatus(
      videoId,
      language as string,
      targetLangs,
      storageRepo
    );

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Check video status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 處理單個影片
 * POST /api/batch/process
 * Body: { videoId, language?, options? }
 */
export async function processVideoController(req: Request, res: Response): Promise<void> {
  try {
    const { videoId, language = 'default', options = {} } = req.body;

    if (!videoId) {
      res.status(400).json({
        success: false,
        error: 'videoId is required',
      });
      return;
    }

    const storageRepo = defaultStorageRepository;
    const processOptions: BatchProcessOptions = {
      targetSegments: options.targetSegments || 6,
      targetLanguages: options.targetLanguages || ['zh'],
      aiService: options.aiService || 'gemini',
      forceReprocess: options.forceReprocess || false,
    };

    const result = await processVideo(videoId, language, processOptions, storageRepo);

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Process video error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 批次處理多個影片
 * POST /api/batch/process-multiple
 * Body: { videos: [{ videoId, language? }], options? }
 */
export async function batchProcessController(req: Request, res: Response): Promise<void> {
  try {
    const { videos, options = {} } = req.body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      res.status(400).json({
        success: false,
        error: 'videos array is required',
      });
      return;
    }

    const storageRepo = defaultStorageRepository;
    const processOptions: BatchProcessOptions = {
      targetSegments: options.targetSegments || 6,
      targetLanguages: options.targetLanguages || ['zh'],
      aiService: options.aiService || 'gemini',
      forceReprocess: options.forceReprocess || false,
    };

    const jobId = await batchProcessVideos(videos, processOptions, storageRepo);

    res.json({
      success: true,
      data: {
        jobId,
        message: 'Batch processing started',
      },
    });
  } catch (error) {
    console.error('Batch process error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 從 R2 批次處理（讀取 VideoList.json）
 * POST /api/batch/process-from-r2
 * Body: { options? }
 */
export async function batchProcessFromR2Controller(req: Request, res: Response): Promise<void> {
  try {
    const { options = {} } = req.body;

    const storageRepo = defaultStorageRepository;

    // 從 R2 讀取 VideoList.json
    console.log('[Batch] Fetching VideoList.json from R2...');
    const videoList = await storageRepo.getVideoList();
    
    if (!videoList || videoList.length === 0) {
      res.status(404).json({
        success: false,
        error: 'VideoList.json not found or empty in R2',
      });
      return;
    }

    // 轉換為 VideoItem 格式
    const videos: VideoItem[] = videoList.map((item: any) => ({
      videoId: item.videoId || item.id,
      language: item.language || 'default',
    }));

    console.log(`[Batch] Found ${videos.length} videos in VideoList.json`);

    const processOptions: BatchProcessOptions = {
      targetSegments: options.targetSegments || 6,
      targetLanguages: options.targetLanguages || ['zh'],
      aiService: options.aiService || 'gemini',
      forceReprocess: options.forceReprocess || false,
    };

    const jobId = await batchProcessVideos(videos, processOptions, storageRepo);

    res.json({
      success: true,
      data: {
        jobId,
        totalVideos: videos.length,
        message: 'Batch processing started from R2 VideoList.json',
      },
    });
  } catch (error) {
    console.error('Batch process from R2 error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 從本地 JSON 檔案批次處理
 * POST /api/batch/process-from-file
 * Body: { filePath, options? }
 */
export async function batchProcessFromFileController(req: Request, res: Response): Promise<void> {
  try {
    const { filePath, options = {} } = req.body;

    if (!filePath) {
      res.status(400).json({
        success: false,
        error: 'filePath is required',
      });
      return;
    }

    // 讀取本地 JSON 檔案
    const fs = require('fs').promises;
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const videoList = JSON.parse(fileContent);

    // 轉換為 VideoItem 格式
    let videos: VideoItem[];
    if (Array.isArray(videoList)) {
      videos = videoList.map((item: any) => ({
        videoId: item.videoId || item.id || item,
        language: item.language || 'default',
      }));
    } else if (videoList.videos && Array.isArray(videoList.videos)) {
      videos = videoList.videos.map((item: any) => ({
        videoId: item.videoId || item.id || item,
        language: item.language || 'default',
      }));
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid file format. Expected array of videos or { videos: [...] }',
      });
      return;
    }

    const storageRepo = defaultStorageRepository;
    const processOptions: BatchProcessOptions = {
      targetSegments: options.targetSegments || 6,
      targetLanguages: options.targetLanguages || ['zh'],
      aiService: options.aiService || 'gemini',
      forceReprocess: options.forceReprocess || false,
    };

    const jobId = await batchProcessVideos(videos, processOptions, storageRepo);

    res.json({
      success: true,
      data: {
        jobId,
        totalVideos: videos.length,
        message: 'Batch processing started from file',
      },
    });
  } catch (error) {
    console.error('Batch process from file error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 取得批次任務狀態
 * GET /api/batch/status/:jobId
 */
export async function getBatchStatusController(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;

    const status = getBatchJobStatus(jobId);

    if (!status) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Get batch status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 列出所有批次任務
 * GET /api/batch/jobs
 */
export async function listBatchJobsController(req: Request, res: Response): Promise<void> {
  try {
    const jobs = listBatchJobs();

    res.json({
      success: true,
      data: {
        total: jobs.length,
        jobs,
      },
    });
  } catch (error) {
    console.error('List batch jobs error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
