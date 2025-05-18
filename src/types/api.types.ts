import { WhisperResult } from './whisper.types';

export interface TranscribeRequest {
  /** WAV 格式音訊檔案。必須使用 multipart/form-data 格式上傳，欄位名為 'audio' */
  audio: File;
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
