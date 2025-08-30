import { Request, Response } from "express";
import { TranscribeResponse, ErrorResponse, YoutubeTranscribeRequest, YoutubeToSrtRequest, YoutubeToSrtResponse } from "../types/api.types";
import { transcribeFileUseCase } from "../usecases/transcribeFile.useCase";
import { transcribeYoutubeUseCase } from "../usecases/transcribeYoutube.useCase";
import { youtubeToSrtUseCase } from "../usecases/youtubeToSrt.useCase";
import { transcribeMlxUseCase } from "../usecases/transcribeMlx.useCase";
import { transcribeYoutubeMlxUseCase } from "../usecases/transcribeYoutubeMlx.useCase";

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

/**
 * YouTube 轉錄 Controller - 只處理 HTTP 層邏輯
 * 職責：驗證輸入、調用 UseCase、回應結果
 */
export const transcribeYoutube = async (
  req: Request<{}, {}, YoutubeTranscribeRequest>,
  res: Response<TranscribeResponse | ErrorResponse>
): Promise<void> => {
  console.log("收到 Youtube 轉錄請求");
  const { url, language = "en", wordLevel = false } = req.body;

  // HTTP 層驗證
  if (!url) {
    res.status(400).json({ error: "必須提供 YouTube URL" });
    return;
  }

  try {
    // 調用 UseCase 處理業務邏輯
    const result = await transcribeYoutubeUseCase({ url, language, wordLevel });
    
    // 回應 HTTP 結果
    res.json(result);
  } catch (error) {
    console.error("Youtube 轉錄初始化失敗:", error);
    
    // HTTP 錯誤處理
    res.status(500).json({
      jobId: "unknown",
      status: "error",
      error: error instanceof Error ? error.message : "未知錯誤",
    });
  }
};

/**
 * YouTube 轉 SRT Controller - 只處理 HTTP 層邏輯
 * 職責：驗證輸入、調用 UseCase、回應結果
 */
export const youtubeToSrt = async (
  req: Request<{}, {}, YoutubeToSrtRequest>,
  res: Response<YoutubeToSrtResponse | ErrorResponse>
): Promise<void> => {
  console.log("收到 Youtube 轉 SRT 請求");
  const { url, language } = req.body;

  // HTTP 層驗證
  if (!url) {
    res.status(400).json({ error: "必須提供 YouTube URL" });
    return;
  }

  try {
    // 調用 UseCase 處理業務邏輯
    const result = await youtubeToSrtUseCase({ url, language });
    
    // 回應 HTTP 結果
    res.json(result);
  } catch (error) {
    console.error("Youtube 轉 SRT 初始化失敗:", error);
    
    // HTTP 錯誤處理
    res.status(500).json({
      jobId: "unknown",
      status: "error",
      error: error instanceof Error ? error.message : "未知錯誤",
    });
  }
};

/**
 * MLX Whisper 轉錄 Controller - 只處理 HTTP 層邏輯
 * 職責：驗證輸入、調用 UseCase、回應結果
 */
export const transcribeMlx = async (
  req: Request,
  res: Response<TranscribeResponse | ErrorResponse>
): Promise<void> => {
  console.log("收到 MLX Whisper 轉錄請求");

  // HTTP 層驗證
  if (!req.file) {
    res.status(400).json({ error: "必須提供音檔" });
    return;
  }

  try {
    // 調用 UseCase 處理業務邏輯
    const result = await transcribeMlxUseCase({
      file: req.file,
      language: req.body.language,
      model: req.body.model
    });
    
    // 回應 HTTP 結果
    res.json(result);
  } catch (error) {
    console.error("MLX Whisper 轉錄初始化失敗:", error);
    
    // HTTP 錯誤處理
    res.status(500).json({
      jobId: "unknown",
      status: "error",
      error: error instanceof Error ? error.message : "未知錯誤",
    });
  }
};

/**
 * MLX Whisper YouTube 轉錄 Controller - 只處理 HTTP 層邏輯
 * 職責：驗證輸入、調用 UseCase、回應結果
 */
export const transcribeYoutubeMlx = async (
  req: Request,
  res: Response<TranscribeResponse | ErrorResponse>
): Promise<void> => {
  console.log("收到 MLX Whisper YouTube 轉錄請求");
  const { url, language, model } = req.body;

  // HTTP 層驗證
  if (!url) {
    res.status(400).json({ error: "必須提供 YouTube URL" });
    return;
  }

  try {
    // 調用 UseCase 處理業務邏輯
    const result = await transcribeYoutubeMlxUseCase({ url, language, model });
    
    // 回應 HTTP 結果
    res.json(result);
  } catch (error) {
    console.error("MLX Whisper YouTube 轉錄初始化失敗:", error);
    
    // HTTP 錯誤處理
    res.status(500).json({
      jobId: "unknown",
      status: "error",
      error: error instanceof Error ? error.message : "未知錯誤",
    });
  }
};