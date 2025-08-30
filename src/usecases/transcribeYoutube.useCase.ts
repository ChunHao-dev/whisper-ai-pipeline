import { v4 as uuidv4 } from "uuid";
import { youtubeTranscriptionService } from "../services/youtubeTranscription.service";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";

export interface TranscribeYoutubeRequest {
  url: string;
  language?: string;
  wordLevel?: boolean;
}

export interface TranscribeYoutubeResult {
  jobId: string;
  status: "processing";
}

/**
 * YouTube 轉錄 UseCase - 協調 YouTube 下載和轉錄流程
 * 職責：
 * 1. 生成 jobId
 * 2. 協調下載和轉錄服務
 * 3. 設定事件回調
 * 4. 回傳處理狀態
 */
export const transcribeYoutubeUseCase = async (
  request: TranscribeYoutubeRequest
): Promise<TranscribeYoutubeResult> => {
  const { url, language = "en", wordLevel = false } = request;
  const jobId = uuidv4();

  // 協調 YouTube 轉錄服務，設定事件回調
  startYoutubeTranscriptionProcess({
    url,
    language,
    wordLevel,
    jobId,
    onProgress: (progress) => transcriptionEmitter.emitProgress(jobId, progress),
    onSegment: (segment) => transcriptionEmitter.emitSegment(jobId, segment),
    onComplete: (result) => transcriptionEmitter.emitComplete(jobId, result),
    onError: (error) => transcriptionEmitter.emitError(jobId, error)
  });

  // 立即回傳處理中狀態
  return {
    jobId,
    status: "processing"
  };
};

/**
 * 啟動 YouTube 轉錄處理的協調函數
 * 委派給 youtubeTranscriptionService 處理具體實作
 */
const startYoutubeTranscriptionProcess = async (options: {
  url: string;
  language: string;
  wordLevel: boolean;
  jobId: string;
  onProgress: (progress: any) => void;
  onSegment: (segment: any) => void;
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}): Promise<void> => {
  try {
    // 委派給 Service 處理具體轉錄邏輯
    await youtubeTranscriptionService.startYoutubeTranscription(options);
  } catch (error) {
    // 錯誤處理
    options.onError(error instanceof Error ? error.message : "未知錯誤");
  }
};