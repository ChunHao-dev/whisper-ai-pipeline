import { Request, Response } from "express";
import { TranscribeResponse, ErrorResponse } from "../types/api.types";
import { transcribeFileUseCase } from "../usecases/transcribeFile.useCase";

/**
 * 轉錄檔案 Controller - 只處理 HTTP 層邏輯
 * 職責：驗證輸入、調用 UseCase、回應結果
 */
export const transcribeFile = async (
  req: Request,
  res: Response<TranscribeResponse | ErrorResponse>
): Promise<void> => {
  console.log("收到轉錄請求");
  console.log("上傳的檔案:", req.file);

  // HTTP 層驗證
  if (!req.file) {
    res.status(400).json({ error: "必須提供音檔" });
    return;
  }

  try {
    // 調用 UseCase 處理業務邏輯
    const result = await transcribeFileUseCase({ file: req.file });
    
    // 回應 HTTP 結果
    res.json(result);
  } catch (error) {
    console.error("轉錄初始化失敗:", error);
    
    // HTTP 錯誤處理
    res.status(500).json({
      jobId: "unknown",
      status: "error",
      error: error instanceof Error ? error.message : "未知錯誤",
    });
  }
};