import { v4 as uuidv4 } from "uuid";
import { transcriptionService } from "../services/transcription.service";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";

export interface TranscribeFileRequest {
  file: Express.Multer.File;
}

export interface TranscribeFileResult {
  jobId: string;
  status: "processing";
}

/**
 * 轉錄檔案 UseCase - 純粹協調業務流程
 * 職責：
 * 1. 生成 jobId
 * 2. 協調轉錄服務
 * 3. 設定事件回調
 * 4. 回傳處理狀態
 */
export const transcribeFileUseCase = async (
  request: TranscribeFileRequest
): Promise<TranscribeFileResult> => {
  const { file } = request;
  const jobId = uuidv4();
  const tempFilePath = file.path;

  // 協調轉錄服務，設定事件回調
  startTranscriptionProcess({
    filePath: tempFilePath,
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
 * 啟動轉錄處理的協調函數
 * 委派給 transcriptionService 處理具體實作
 */
const startTranscriptionProcess = async (options: {
  filePath: string;
  jobId: string;
  onProgress: (progress: number) => void;
  onSegment: (segment: any) => void;
  onComplete: (result: any) => void;
  onError: (error: string) => void;
}): Promise<void> => {
  try {
    // 委派給 Service 處理具體轉錄邏輯
    await transcriptionService.startFileTranscription(options);
  } finally {
    // 清理暫存檔案
    await transcriptionService.cleanupTempFile(options.filePath);
  }
};