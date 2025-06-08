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
