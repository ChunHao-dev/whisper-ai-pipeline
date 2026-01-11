import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { Server } from "socket.io";
import { createServer } from "http";
import { transcribeFile, transcribeYoutube, youtubeToSrt, transcribeMlx, transcribeYoutubeMlx } from "./controllers/transcription.controller";
import { segmentSrtController, translateSrtController, getSegmentationController, getSrtController } from "./controllers/srt.controller";
import {
  checkVideoStatusController,
  processVideoController,
  batchProcessController,
  batchProcessFromR2Controller,
  batchProcessFromFileController,
  getBatchStatusController,
  listBatchJobsController,
} from "./controllers/batch.controller";
import {
  checkR2StatusController,
  getMissingDataController,
  generateStatusReportController,
} from "./controllers/r2Status.controller";
import { socketConfig } from "./config/socket";
import {
  setupTranscriptionHandler,
} from "./socket/handlers/transcription.handler";
import { mlxWhisperService } from "./services/mlx-whisper.service";
import { 
  batchAnalyzeLanguageLevelController,
  getLanguageAnalysisController,
  getLanguageAnalysisStatsController
} from "./controllers/languageAnalysis.controller";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, socketConfig);

// 設置 Socket.IO 事件處理
io.on("connection", (socket) => {
  setupTranscriptionHandler(socket);
});

app.use(cors());
app.use(express.json());

// 配置 multer
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 300 * 1024 * 1024, // 100MB
  },
  fileFilter: (_req, file, cb) => {
    // 檢查檔案類型
    const validMimeTypes = [
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/vnd.wave",
    ];

    if (validMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("只接受 WAV 檔案"));
    }
  },
});

// 基本健康檢查
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "OK" });
});

// 轉錄 API - 檔案上傳版本
// YouTube 轉錄 API（重構後使用 Controller + UseCase + Service）
app.post("/api/transcribe-youtube", transcribeYoutube);

// 轉錄 API - 檔案上傳版本（重構後使用 Controller + UseCase）
app.post("/api/transcribe", upload.single("audio"), transcribeFile);

// YouTube 轉 SRT API（重構後使用 Controller + UseCase + Service）
app.post("/api/youtube-to-srt", youtubeToSrt);

// MLX Whisper 轉錄 API（重構後使用 Controller + UseCase + Service）
app.post("/api/transcribe-mlx", upload.single("audio"), transcribeMlx);

// MLX Whisper YouTube 轉錄 API（重構後使用 Controller + UseCase + Service）
app.post("/api/transcribe-youtube-mlx", transcribeYoutubeMlx);

// ==================== SRT 分段和翻譯 API ====================

// SRT 分段 API
app.post("/api/srt/segment", segmentSrtController);

// SRT 翻譯 API
app.post("/api/srt/translate", translateSrtController);

// 獲取分段資訊 API
app.get("/api/srt/segmentation/:videoId/:language", getSegmentationController);

// 獲取 SRT 內容 API
app.get("/api/srt/:videoId/:language", getSrtController);

// ==================== 批次處理 API ====================

// 檢查單個影片狀態
app.get("/api/batch/check/:videoId", checkVideoStatusController);

// 處理單個影片
app.post("/api/batch/process", processVideoController);

// 批次處理多個影片
app.post("/api/batch/process-multiple", batchProcessController);

// 從 R2 批次處理（讀取 VideoList.json）
app.post("/api/batch/process-from-r2", batchProcessFromR2Controller);

// 從本地 JSON 檔案批次處理
app.post("/api/batch/process-from-file", batchProcessFromFileController);

// 取得批次任務狀態
app.get("/api/batch/status/:jobId", getBatchStatusController);

// 列出所有批次任務
app.get("/api/batch/jobs", listBatchJobsController);

// ==================== R2 狀態檢查 API ====================

// 檢查 R2 上所有影片的狀態
app.get("/api/r2/check-status", checkR2StatusController);

// 獲取缺少資料的影片列表
app.get("/api/r2/missing-data", getMissingDataController);

// 生成詳細的狀態報告（Markdown 格式）
app.get("/api/r2/status-report", generateStatusReportController);

// ==================== 語言分級分析 API ====================

// 批次分析語言難度
app.post("/api/batch-analyze-language-level", batchAnalyzeLanguageLevelController);

// 取得語言分析統計資訊 (必須在 :videoId 路由之前)
app.get("/api/language-analysis/stats", getLanguageAnalysisStatsController);

// 取得單一影片的語言分析結果
app.get("/api/language-analysis/:videoId", getLanguageAnalysisController);

// MLX Whisper 健康檢查 API
app.get("/api/mlx-health", async (req: Request, res: Response) => {
  try {
    const healthCheck = await mlxWhisperService.checkEnvironment();
    
    if (healthCheck.available) {
      res.json({
        status: "healthy",
        service: "MLX Whisper",
        message: "MLX Whisper 服務可用"
      });
    } else {
      res.status(503).json({
        status: "unhealthy",
        service: "MLX Whisper",
        error: healthCheck.error
      });
    }
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      service: "MLX Whisper",
      error: error instanceof Error ? error.message : "未知錯誤"
    });
  }
});

const port = process.env.PORT || 8001;
httpServer.listen(port, () => {
  console.log(`伺服器運行在 http://localhost:${port}`);
});

// Start the SQS polling service
import { startSqsPolling } from "./services/sqs.service";
startSqsPolling();
