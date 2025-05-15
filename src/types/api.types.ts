import { WhisperResult } from './whisper.types';

export interface TranscribeRequest {
  /** WAV 格式音訊檔案。必須使用 multipart/form-data 格式上傳，欄位名為 'audio' */
  audio: File;
}

export interface TranscribeResponse extends WhisperResult {}

export interface ErrorResponse {
  /** 錯誤訊息 */
  error: string;
}
