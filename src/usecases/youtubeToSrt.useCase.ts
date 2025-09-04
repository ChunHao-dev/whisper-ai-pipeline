import { v4 as uuidv4 } from "uuid";
import { youtubeToSrtService } from "../services/youtubeToSrt.service";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";
import { StorageRepository } from "../domain/repositories/storage.repository";
import { defaultStorageRepository } from "../infrastructure/repositories";

export interface YoutubeToSrtRequest {
  url: string;
  language?: string;
}

export interface YoutubeToSrtResult {
  jobId: string;
  status: "processing";
}

export interface YoutubeToSrtDependencies {
  storageRepository?: StorageRepository;
}

/**
 * YouTube 轉 SRT UseCase - 處理業務流程協調
 * 職責：驗證輸入、生成 jobId、啟動服務處理、設置回調
 * 
 * 支援 Repository 依賴注入，提高可測試性和彈性
 */
export const youtubeToSrtUseCase = async (
  request: YoutubeToSrtRequest,
  dependencies?: YoutubeToSrtDependencies
): Promise<YoutubeToSrtResult> => {
  const { url, language = "auto" } = request;
  const { storageRepository = defaultStorageRepository } = dependencies || {};
  const jobId = uuidv4();

  // 啟動 YouTube 轉 SRT 服務處理
  youtubeToSrtService.startYoutubeToSrt({
    url,
    language,
    jobId,
    storageRepository, // 注入 Repository 依賴
    onComplete: (result) => transcriptionEmitter.emitComplete(jobId, result),
    onError: (error) => transcriptionEmitter.emitError(jobId, error)
  });

  return {
    jobId,
    status: "processing"
  };
};

/**
 * 建立帶有 Repository 依賴的 UseCase 工廠函數
 */
export const createYoutubeToSrtUseCase = (dependencies: YoutubeToSrtDependencies) =>
  (request: YoutubeToSrtRequest) => youtubeToSrtUseCase(request, dependencies);