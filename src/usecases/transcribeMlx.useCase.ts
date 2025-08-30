import { v4 as uuidv4 } from "uuid";
import { transcribeMlxService } from "../services/transcribeMlx.service";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";

export interface TranscribeMlxRequest {
  file: Express.Multer.File;
  language?: string;
  model?: string;
}

export interface TranscribeMlxResult {
  jobId: string;
  status: "processing";
}

/**
 * MLX Whisper 轉錄 UseCase - 處理業務流程協調
 * 職責：驗證輸入、生成 jobId、啟動服務處理、設置回調
 */
export const transcribeMlxUseCase = async (request: TranscribeMlxRequest): Promise<TranscribeMlxResult> => {
  const { file, language, model } = request;
  const jobId = uuidv4();
  const tempFilePath = file.path;

  // 啟動 MLX 轉錄服務處理
  transcribeMlxService.startMlxTranscription({
    tempFilePath,
    jobId,
    language,
    model,
    onComplete: (result) => transcriptionEmitter.emitComplete(jobId, result),
    onError: (error) => transcriptionEmitter.emitError(jobId, error)
  });

  return {
    jobId,
    status: "processing"
  };
};