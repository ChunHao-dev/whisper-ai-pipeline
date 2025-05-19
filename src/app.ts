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
import { TranscribeResponse, ErrorResponse, YoutubeTranscribeRequest } from "./types/api.types";
import { downloadAndProcessYoutube } from "./utils/youtube.utils";
import { socketConfig } from "./config/socket";
import {
  setupTranscriptionHandler,
  transcriptionEmitter,
} from "./socket/handlers/transcription.handler";
import { formatTimestamp } from "./utils/time.utils";

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
    fileSize: 100 * 1024 * 1024, // 100MB
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
// 轉錄 API - Youtube 版本
app.post(
  "/api/transcribe-youtube",
  async (
    req: Request<{}, {}, YoutubeTranscribeRequest>,
    res: Response<TranscribeResponse | ErrorResponse>
  ): Promise<void> => {
    console.log("收到 Youtube 轉錄請求");
    const { url, language = "en" } = req.body;
    const jobId = uuidv4();
    let segmentIndex = 1;
    let audioPath = '';
    try {
      // 立即回應 jobId，表示任務已開始處理
      res.json({
        jobId,
        status: "processing",
      });

      // 下載並處理 Youtube 音檔
      audioPath = await downloadAndProcessYoutube(url, jobId);

      // 準備轉錄參數
      const params: WhisperParams = {
        language,
        model: join(process.cwd(), "models/ggml-large-v3-turbo.bin"),
        use_gpu: true,
        fname_inp: audioPath,
        no_prints: true,
        flash_attn: false,
        comma_in_time: false,
        translate: false,
        no_timestamps: false,
        audio_ctx: 0,
        max_len: 0,
        segment_callback: (segment) => {
          const formattedSegment = {
            ...segment,
            index: segmentIndex++,
            srtTimestamp: `${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}`,
            startTime: formatTimestamp(segment.t0),
            endTime: formatTimestamp(segment.t1)
          };
          
          console.log(`${formattedSegment.index}\n${formattedSegment.srtTimestamp}\n${segment.text}\n`);
          transcriptionEmitter.emitSegment(jobId, formattedSegment);
        },
        progress_callback: (progress) => {
          transcriptionEmitter.emitProgress(jobId, progress);
        },
      };

      // 開始轉錄處理
      whisperService
        .transcribe(params)
        .then((result) => {
          transcriptionEmitter.emitComplete(jobId, result);
        })
        .catch((error) => {
          transcriptionEmitter.emitError(jobId, error);
        })
        .finally(async () => {
          try {
            if (audioPath) {
              await fs.unlink(audioPath);
            }
            console.log("已清理暫存檔案:", audioPath);
          } catch (error) {
            console.error("清理暫存檔案失敗:", error);
          }
        });

    } catch (error) {
      console.error("Youtube 下載或轉錄初始化失敗:", error);
      res.status(500).json({
        jobId,
        status: "error",
        error: error instanceof Error ? error.message : "未知錯誤",
      });

      if (audioPath) {
        try {
          await fs.unlink(audioPath);
          console.log("已清理暫存檔案:", audioPath);
        } catch (cleanupError) {
          console.error("清理暫存檔案失敗:", cleanupError);
        }
      }
    }
  }
);

app.post(
  "/api/transcribe",
  upload.single("audio"),
  async (
    req: Request,
    res: Response<TranscribeResponse | ErrorResponse>
  ): Promise<void> => {
    // 為每個轉錄任務創建一個序號計數器（檔案上傳版本）
    let segmentIndex = 1;
    console.log("收到轉錄請求");
    console.log("上傳的檔案:", req.file);
    if (!req.file) {
      res.status(400).json({ error: "必須提供音檔" });
      return;
    }

    const tempFilePath = req.file.path;
    const jobId = uuidv4();

    try {
      const params: WhisperParams = {
        language: "en",
        model: join(process.cwd(), "models/ggml-large-v3-turbo.bin"),
        use_gpu: true,
        fname_inp: tempFilePath,
        no_prints: true,
        flash_attn: false,
        comma_in_time: false,
        translate: false,
        no_timestamps: false,
        audio_ctx: 0,
        max_len: 0,
        segment_callback: (segment) => {
          // 使用 new_segment_callback
          // const [start, end, text] = segment;
          // console.log(`---- andy[${start} --> ${end}] ${text}`);
          const formattedSegment = {
            ...segment,
            index: segmentIndex++,
            srtTimestamp: `${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}`,
            startTime: formatTimestamp(segment.t0),
            endTime: formatTimestamp(segment.t1)
          };
          
          console.log(`${formattedSegment.index}\n${formattedSegment.srtTimestamp}\n${segment.text}\n`);
          transcriptionEmitter.emitSegment(jobId, formattedSegment);
          // console.log(segment.text)
        },
        progress_callback: (progress) => {
          transcriptionEmitter.emitProgress(jobId, progress);
        },
      };

      // 立即回應 jobId，表示任務已開始處理
      res.json({
        jobId,
        status: "processing",
      });

      // 非同步處理轉錄任務
      whisperService
        .transcribe(params)
        .then((result) => {
          transcriptionEmitter.emitComplete(jobId, result);
        })
        .catch((error) => {
          transcriptionEmitter.emitError(jobId, error);
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
      console.error("轉錄初始化失敗:", error);
      res.status(500).json({
        jobId,
        status: "error",
        error: error instanceof Error ? error.message : "未知錯誤",
      });

      // 清理暫存檔案
      try {
        await fs.unlink(tempFilePath);
        console.log("已清理暫存檔案:", tempFilePath);
      } catch (cleanupError) {
        console.error("清理暫存檔案失敗:", cleanupError);
      }
    }
  }
);

const port = process.env.PORT || 5566;
httpServer.listen(port, () => {
  console.log(`伺服器運行在 http://localhost:${port}`);
});
