import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { Server } from "socket.io";
import { createServer } from "http";
import { transcribeFile, transcribeYoutube, youtubeToSrt, transcribeMlx, transcribeYoutubeMlx } from "./controllers/transcription.controller";
import { socketConfig } from "./config/socket";
import {
  setupTranscriptionHandler,
} from "./socket/handlers/transcription.handler";
import { mlxWhisperService } from "./services/mlx-whisper.service";

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
