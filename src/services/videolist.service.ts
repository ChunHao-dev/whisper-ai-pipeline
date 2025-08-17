import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { VideoList, VideoListEntry } from '../types/api.types';

const execPromise = promisify(exec);

const VIDEOLIST_FILENAME = 'VideoList.json';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const LOCAL_VIDEOLIST_PATH = path.join(UPLOADS_DIR, VIDEOLIST_FILENAME);

interface VideoListServiceResult {
  success: boolean;
  error?: string;
  data?: VideoList;
}

/**
 * 讀取現有的 VideoList.json
 * 先嘗試從本地讀取，如果不存在則返回空的清單結構
 */
export async function readVideoList(): Promise<VideoListServiceResult> {
  try {
    // 確保 uploads 目錄存在
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    
    try {
      const content = await fs.readFile(LOCAL_VIDEOLIST_PATH, 'utf-8');
      const videoList: VideoList = JSON.parse(content);
      
      console.log(`[VideoList] Successfully read ${videoList.videos.length} videos from local file`);
      return {
        success: true,
        data: videoList
      };
    } catch (fileError) {
      // 檔案不存在，返回空的清單結構
      console.log('[VideoList] Local file not found, creating new empty list');
      const emptyList: VideoList = {
        videos: [],
        updated_at: new Date().toISOString(),
        total_count: 0
      };
      
      return {
        success: true,
        data: emptyList
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VideoList] Failed to read video list:', errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 新增視頻條目到 VideoList
 */
export async function addVideoToList(
  videoInfo: {
    id: string;
    title: string;
    description?: string;
    duration: number;
    uploader?: string;
    view_count?: number;
  }
): Promise<VideoListServiceResult> {
  try {
    // 讀取現有清單
    const readResult = await readVideoList();
    if (!readResult.success || !readResult.data) {
      return {
        success: false,
        error: 'Failed to read existing video list'
      };
    }
    
    const videoList = readResult.data;
    const now = new Date().toISOString();
    
    // 檢查是否已存在相同的視頻
    const existingIndex = videoList.videos.findIndex(
      video => video.videoId === videoInfo.id
    );
    
    const newEntry: VideoListEntry = {
      videoId: videoInfo.id,
      title: videoInfo.title,
      description: videoInfo.description,
      duration: videoInfo.duration,
      uploader: videoInfo.uploader,
      view_count: videoInfo.view_count
    };
    
    if (existingIndex >= 0) {
      // 更新現有條目
      videoList.videos[existingIndex] = newEntry;
      console.log(`[VideoList] Updated existing entry for video ${videoInfo.id}`);
    } else {
      // 新增條目
      videoList.videos.push(newEntry);
      console.log(`[VideoList] Added new entry for video ${videoInfo.id}`);
    }
    
    // 更新清單元數據
    videoList.updated_at = now;
    videoList.total_count = videoList.videos.length;
    
    // 儲存到本地
    await fs.writeFile(LOCAL_VIDEOLIST_PATH, JSON.stringify(videoList, null, 2), 'utf-8');
    console.log(`[VideoList] Saved updated list with ${videoList.total_count} videos to local file`);
    
    return {
      success: true,
      data: videoList
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VideoList] Failed to add video to list:', errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 上傳 VideoList.json 到 R2
 */
export async function uploadVideoListToR2(
  videoList: VideoList,
  bucketName?: string
): Promise<VideoListServiceResult> {
  try {
    // 使用環境變數如果未提供 bucket 名稱
    const bucket = bucketName || process.env.R2_BUCKET_NAME;
    if (!bucket) {
      throw new Error('R2 bucket name must be provided or set in R2_BUCKET_NAME environment variable');
    }
    
    // 構建 R2 路徑
    const remotePath = `s3://${bucket}/${VIDEOLIST_FILENAME}`;
    
    // 先確保本地檔案是最新的
    await fs.writeFile(LOCAL_VIDEOLIST_PATH, JSON.stringify(videoList, null, 2), 'utf-8');
    
    // 構建 AWS CLI 命令
    const command = `aws --profile cloudflare s3 cp "${LOCAL_VIDEOLIST_PATH}" "${remotePath}"`;
    
    console.log(`[VideoList] Uploading to R2: ${LOCAL_VIDEOLIST_PATH} -> ${remotePath}`);
    console.log(`[VideoList] Executing command: ${command}`);
    
    // 執行上傳命令
    const { stdout, stderr } = await execPromise(command);
    
    if (stdout) {
      console.log(`[VideoList] Upload stdout: ${stdout}`);
    }
    if (stderr) {
      console.log(`[VideoList] Upload stderr: ${stderr}`);
    }
    
    console.log(`[VideoList] Successfully uploaded VideoList.json to R2 with ${videoList.total_count} videos`);
    
    return {
      success: true,
      data: videoList
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VideoList] Failed to upload to R2:', errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * 構建 R2 URL
 */
export function buildR2Urls(videoId: string) {
  const baseUrl = process.env.R2_PUBLIC_URL;
  if (!baseUrl) {
    throw new Error('R2_PUBLIC_URL environment variable is required');
  }
  
  return {
    thumbnail: `${baseUrl}/metadata/${videoId}/thumbnail.webp`,
    srt: `${baseUrl}/srt/${videoId}/default/${videoId}.srt`
  };
}

// 匯出服務
export const videoListService = {
  readVideoList,
  addVideoToList,
  uploadVideoListToR2,
  buildR2Urls
};