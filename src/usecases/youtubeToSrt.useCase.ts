import { v4 as uuidv4 } from "uuid";
import { youtubeToSrtService } from "../services/youtubeToSrt.service";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";

export interface YoutubeToSrtRequest {
  url: string;
  language?: string;
}

export interface YoutubeToSrtResult {
  jobId: string;
  status: "processing";
}

/**
 * YouTube 轉 SRT UseCase - 處理業務流程協調
 * 職責：驗證輸入、生成 jobId、啟動服務處理、設置回調
 */
export const youtubeToSrtUseCase = async (request: YoutubeToSrtRequest): Promise<YoutubeToSrtResult> => {
  const { url, language = "auto" } = request;
  const jobId = uuidv4();

  // 啟動 YouTube 轉 SRT 服務處理
  youtubeToSrtService.startYoutubeToSrt({
    url,
    language,
    jobId,
    onComplete: (result) => transcriptionEmitter.emitComplete(jobId, result),
    onError: (error) => transcriptionEmitter.emitError(jobId, error)
  });

  return {
    jobId,
    status: "processing"
  };
};