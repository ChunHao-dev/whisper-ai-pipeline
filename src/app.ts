import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import { join } from "path";
import multer from "multer";
import fs from "fs/promises";
import { Server } from "socket.io";
import { createServer } from "http";
import { v4 as uuidv4 } from "uuid";
import { whisperService } from "./services/whisper.service";
import { WhisperParams } from "./types/whisper.types";
import { TranscribeResponse, ErrorResponse, YoutubeTranscribeRequest, YoutubeToSrtRequest, YoutubeToSrtResponse } from "./types/api.types";
import { transcribeFile, transcribeYoutube } from "./controllers/transcription.controller";
import { exec } from "child_process";
import { promisify } from "util";
import { downloadAndProcessYoutube } from "./utils/youtube.utils";
import { socketConfig } from "./config/socket";
import {
  setupTranscriptionHandler,
  transcriptionEmitter,
} from "./socket/handlers/transcription.handler";
import { TranscriptionPartProgress } from "./socket/events";
import { formatTimestamp } from "./utils/time.utils";
import { combineWordsToSentences, WordSegment, generateSrtFromSentences } from "./utils/sentence.utils";
import { mlxWhisperService, MLXWhisperResult, MLXTranscriptionResult } from "./services/mlx-whisper.service";

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

// Youtube to SRT API
app.post(
  "/api/youtube-to-srt",
  async (
    req: Request<{}, {}, YoutubeToSrtRequest>,
    res: Response<YoutubeToSrtResponse | ErrorResponse>
  ): Promise<void> => {
    console.log("收到 Youtube 轉 SRT 請求");
    const { url, language = "auto" } = req.body;
    const jobId = uuidv4();
    let audioFiles: string[] = [];
    const execPromise = promisify(exec);

    try {
      // 立即回應 jobId
      res.json({
        jobId,
        status: "processing",
      });

      // 下載 Youtube 音訊
      const downloadResult = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadResult.audioFiles;
      const filePath = audioFiles[0];
      const absoluteFilePath = join(process.cwd(), filePath);
      console.log("下載的音訊檔案絕對路徑:", absoluteFilePath);
      
      // 執行 MLX Whisper 命令
      const mlxWhisperPath = "/Users/chchen/Andy_Folder/Project/Personal/transcribe/mlx-whisper/venv/bin/mlx_whisper";
      const outputDir = join(process.cwd(), "uploads");
      const srtFileName = `${jobId}.srt`;
      const outputPath = join(outputDir, srtFileName);
      
      const command = `${mlxWhisperPath} ${absoluteFilePath} --model mlx-community/whisper-large-v3-turbo --output-format srt --output-dir ${outputDir}`;
      
      console.log("執行命令:", command);
      
      const { stdout, stderr } = await execPromise(command);
      console.log("轉錄輸出:", stdout);
      if (stderr) {
        console.error("轉錄錯誤:", stderr);
      }

      // 清理音訊檔案
      await fs.unlink(absoluteFilePath);
      console.log("已清理音訊檔案:", absoluteFilePath);

      // 返回成功結果
      const response: YoutubeToSrtResponse = {
        jobId,
        status: "complete",
        srtPath: outputPath
      };

      transcriptionEmitter.emitComplete(jobId, response);

    } catch (error) {
      console.error("Youtube 轉 SRT 失敗:", error);
      const errorResponse: YoutubeToSrtResponse = {
        jobId,
        status: "error",
        error: error instanceof Error ? error.message : "未知錯誤"
      };

      transcriptionEmitter.emitError(jobId, error instanceof Error ? error.message : "未知錯誤");

      // 清理所有暫存檔案
      try {
        await Promise.all(audioFiles.map(filePath => {
          const absolutePath = join(process.cwd(), filePath);
          return fs.unlink(absolutePath).catch(err => 
            console.error(`清理檔案 ${absolutePath} 失敗:`, err)
          );
        }));
      } catch (cleanupError) {
        console.error("清理暫存檔案失敗:", cleanupError);
      }
    }
  }
);

// MLX Whisper 轉錄 API（支援逐字時間戳）
app.post(
  "/api/transcribe-mlx",
  upload.single("audio"),
  async (
    req: Request,
    res: Response<TranscribeResponse | ErrorResponse>
  ): Promise<void> => {
    console.log("收到 MLX Whisper 轉錄請求");
    
    if (!req.file) {
      res.status(400).json({ error: "必須提供音檔" });
      return;
    }

    const tempFilePath = req.file.path;
    const jobId = uuidv4();
    const { language, model } = req.body;

    try {
      // 立即回應 jobId，表示任務已開始處理
      res.json({
        jobId,
        status: "processing",
      });

      // 非同步處理轉錄任務
      mlxWhisperService
        .processTranscription(tempFilePath, {
          language: language || undefined,
          model: model || undefined,
          saveSrt: true,
          outputDir: join(process.cwd(), "uploads")
        })
        .then((result: MLXTranscriptionResult) => {
          if (result.success) {
            transcriptionEmitter.emitComplete(jobId, {
              jobId,
              status: "complete",
              text: result.text,
              segments: result.segments,
              sentences: result.sentences,
              language: result.language,
              srtPath: result.srtPath,
              srtContent: result.srtContent
            });
          } else {
            transcriptionEmitter.emitError(jobId, result.error || "轉錄處理失敗");
          }
        })
        .catch((error) => {
          transcriptionEmitter.emitError(jobId, error instanceof Error ? error.message : "未知錯誤");
        })
        .finally(async () => {
          try {
            await fs.unlink(tempFilePath);
            console.log("已清理暫存檔案:", tempFilePath);
          } catch (error) {
            console.error("清理暫存檔案失敗:", error);
          }
        });
    } catch (error) {
      console.error("MLX Whisper 轉錄初始化失敗:", error);
      res.status(500).json({
        jobId,
        status: "error",
        error: error instanceof Error ? error.message : "未知錯誤",
      });

      // 清理暫存檔案
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        console.error("清理暫存檔案失敗:", cleanupError);
      }
    }
  }
);

// MLX Whisper YouTube 轉錄 API（支援逐字時間戳）
app.post(
  "/api/transcribe-youtube-mlx",
  async (
    req: Request,
    res: Response<TranscribeResponse | ErrorResponse>
  ): Promise<void> => {
    const { url, language, model } = req.body;
    const jobId = uuidv4();
    let audioFiles: string[] = [];

    try {
      if (!url) {
        res.status(400).json({ error: "必須提供 YouTube URL" });
        return;
      }

      // 立即回應 jobId
      res.json({
        jobId,
        status: "processing",
      });

      // 下載 Youtube 音訊
      const downloadResult = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadResult.audioFiles;
      const filePath = audioFiles[0];
      const absoluteFilePath = join(process.cwd(), filePath);
      
      console.log("使用 MLX Whisper 轉錄 YouTube:", absoluteFilePath);

      // 使用 MLX Whisper 完整處理（包含 word-level 重組和 SRT 生成）
      const result = await mlxWhisperService.processTranscription(absoluteFilePath, {
        language: language || undefined,
        model: model || undefined,
        saveSrt: true,
        outputDir: join(process.cwd(), "uploads")
      });

      // 清理音訊檔案
      await fs.unlink(absoluteFilePath);
      console.log("已清理音訊檔案:", absoluteFilePath);

      if (result.success) {
        // 發送完成結果
        transcriptionEmitter.emitComplete(jobId, {
          jobId,
          status: "complete",
          text: result.text,
          segments: result.segments,
          sentences: result.sentences,
          language: result.language,
          srtPath: result.srtPath,
          srtContent: result.srtContent
        });
      } else {
        transcriptionEmitter.emitError(jobId, result.error || "轉錄處理失敗");
      }

    } catch (error) {
      console.error("MLX Whisper YouTube 轉錄失敗:", error);
      transcriptionEmitter.emitError(jobId, error instanceof Error ? error.message : "未知錯誤");

      // 錯誤發生時，清理所有暫存檔案
      try {
        await Promise.all(audioFiles.map(filePath => {
          const absolutePath = join(process.cwd(), filePath);
          return fs.unlink(absolutePath).catch(err => 
            console.error(`清理檔案 ${absolutePath} 失敗:`, err)
          );
        }));
      } catch (cleanupError) {
        console.error("清理暫存檔案失敗:", cleanupError);
      }
    }
  }
);

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
