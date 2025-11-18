/**
 * Storage Repository - 抽象儲存介面
 * 定義統一的檔案和雲端儲存操作介面
 */

import { SegmentsFile, SummaryFile } from '../../types/srt.types';

export interface UploadResult {
  success: boolean;
  error?: string;
  remotePath?: string;
  note?: string;
}

export interface FileInfo {
  path: string;
  size: number;
  exists: boolean;
}

export interface VideoInfo {
  id: string;
  title?: string;
  duration?: number;
  uploadDate?: string;
  availableLanguages?: string[];      // 可用的語言列表
  hasSegmentation?: boolean;          // 是否已分段
  segmentationLanguages?: string[];   // 哪些語言有分段資訊
  [key: string]: any;
}

/**
 * 抽象儲存 Repository 介面
 * 支援本地檔案系統和雲端儲存的統一操作
 */
export interface StorageRepository {
  // 檔案基本操作
  fileExists(filePath: string): Promise<boolean>;
  readFile(filePath: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
  getFileInfo(filePath: string): Promise<FileInfo>;
  
  // SRT 檔案相關操作
  uploadSrt(localFilePath: string, videoId: string, language: string): Promise<UploadResult>;
  saveSrtLocally(content: string, filename: string, outputDir: string): Promise<string>;
  getSrt(videoId: string, language: string): Promise<string | null>;
  
  // 分段索引操作 (segments.json)
  uploadSegments(segments: SegmentsFile, videoId: string, language: string): Promise<UploadResult>;
  getSegments(videoId: string, language: string): Promise<SegmentsFile | null>;
  
  // 摘要操作 (summary.json)
  uploadSummary(summary: SummaryFile, videoId: string, language: string): Promise<UploadResult>;
  getSummary(videoId: string, language: string): Promise<SummaryFile | null>;
  
  // 批次操作（一次上傳 SRT + segments + summary）
  uploadLanguagePackage(
    videoId: string,
    language: string,
    files: {
      srtPath: string;
      segments: SegmentsFile;
      summary: SummaryFile;
    }
  ): Promise<UploadResult>;
  
  // 查詢可用語言
  listAvailableLanguages(videoId: string): Promise<string[]>;
  
  // 影片元數據操作
  uploadVideoMetadata(videoInfo: VideoInfo): Promise<UploadResult>;
  
  // VideoList 管理
  getVideoList(): Promise<VideoInfo[]>;
  addVideoToList(videoInfo: VideoInfo): Promise<VideoInfo[]>;
  uploadVideoList(videoList: VideoInfo[]): Promise<UploadResult>;
  
  // 工具函數
  formatFileSize(bytes: number): string;
  getFileSize(filePath: string): Promise<number | null>;
}

/**
 * 建立 StorageRepository 的工廠函數類型
 */
export type StorageRepositoryFactory = () => StorageRepository;