import { WhisperResult } from './whisper.types';

export interface TranscribeRequest {
  /** WAV 格式音訊檔案。必須使用 multipart/form-data 格式上傳，欄位名為 'audio' */
  audio: File;
}

export interface YoutubeTranscribeRequest {
  /** Youtube 影片 URL */
  url: string;
  /** 語言（可選） */
  language?: string;
  /** 是否使用 word level 轉錄（可選） */
  wordLevel?: boolean;
}

export interface YoutubeToSrtRequest {
  /** Youtube 影片 URL */
  url: string;
  /** 語言（可選） */
  language?: string;
}

export interface YoutubeToSrtResponse {
  /** 任務 ID */
  jobId: string;
  /** 任務狀態 */
  status: 'processing' | 'complete' | 'error';
  /** SRT 檔案路徑 */
  srtPath?: string;
  /** 錯誤訊息（如果有） */
  error?: string;
}

export interface TranscribeResponse {
  /** 任務 ID */
  jobId: string;
  /** 任務狀態 */
  status: 'processing' | 'complete' | 'error';
  /** 錯誤訊息（如果有） */
  error?: string;
}

export interface TranscriptionResult extends WhisperResult {
  /** 任務 ID */
  jobId: string;
}

export interface ErrorResponse {
  /** 錯誤訊息 */
  error: string;
}

export interface JobStatus {
  /** 任務 ID */
  jobId: string;
  /** 任務狀態 */
  status: 'processing' | 'complete' | 'error';
  /** 進度（0-100） */
  progress?: number;
  /** 結果（如果完成） */
  result?: WhisperResult;
  /** 錯誤訊息（如果有） */
  error?: string;
}

export interface YoutubeDownloadStatus {
  /** 任務 ID */
  jobId: string;
  /** 下載進度（0-100） */
  progress: number;
  /** 下載速度 */
  speed: string;
  /** 已下載大小（位元組） */
  downloaded: number;
  /** 音檔數據（base64） */
  audioData?: string;
}

/** VideoList 中單個視頻條目 */
export interface VideoListEntry {
  /** 視頻 ID */
  videoId: string;
  /** 視頻標題 */
  title: string;
  /** 視頻描述 */
  description?: string;
  /** 視頻時長（秒） */
  duration: number;
  /** 上傳者 */
  uploader?: string;
  /** 觀看次數 */
  view_count?: number;
}

/** 完整的 VideoList 結構 */
export interface VideoList {
  /** 視頻清單 */
  videos: VideoListEntry[];
  /** 最後更新時間 */
  updated_at: string;
  /** 總數量 */
  total_count: number;
}
