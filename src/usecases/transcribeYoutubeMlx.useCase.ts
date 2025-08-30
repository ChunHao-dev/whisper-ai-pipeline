import { v4 as uuidv4 } from "uuid";
import { transcribeYoutubeMlxService } from "../services/transcribeYoutubeMlx.service";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";

export interface TranscribeYoutubeMlxRequest {
  url: string;
  language?: string;
  model?: string;
}

export interface TranscribeYoutubeMlxResult {
  jobId: string;
  status: "processing";
}

/**
 * MLX Whisper YouTube 轉錄 UseCase - 處理業務流程協調
 * 職責：驗證輸入、生成 jobId、啟動服務處理、設置回調
 */
export const transcribeYoutubeMlxUseCase = async (request: TranscribeYoutubeMlxRequest): Promise<TranscribeYoutubeMlxResult> => {
  const { url, language, model } = request;
  const jobId = uuidv4();

  // 啟動 MLX YouTube 轉錄服務處理
  transcribeYoutubeMlxService.startYoutubeMlxTranscription({
    url,
    language,
    model,
    jobId,
    onComplete: (result) => transcriptionEmitter.emitComplete(jobId, result),
    onError: (error) => transcriptionEmitter.emitError(jobId, error)
  });

  return {
    jobId,
    status: "processing"
  };
};