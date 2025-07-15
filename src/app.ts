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
// 轉錄 API - Youtube 版本
app.post(
  "/api/transcribe-youtube",
  async (
    req: Request<{}, {}, YoutubeTranscribeRequest>,
    res: Response<TranscribeResponse | ErrorResponse>
  ): Promise<void> => {
    console.log("收到 Youtube 轉錄請求");
    const { url, language = "en", wordLevel = false } = req.body;
    const jobId = uuidv4();
    let segmentIndex = 1;
    let audioFiles: string[] = [];
    let allSegments: Array<{text: string; start: number; end: number; t0?: number; t1?: number}> = [];
    let wordSegments: WordSegment[] = []; // 用於存儲 word-level segments

    try {
      // 立即回應 jobId，表示任務已開始處理
      res.json({
        jobId,
        status: "processing",
      });

      // 下載並處理 Youtube 音檔
      const downloadedFiles = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadedFiles;

      const filePath = audioFiles[0];
      
      // 準備轉錄參數
      const params: WhisperParams = {
        language,
        model: join(process.cwd(), "models/ggml-large-v3-turbo.bin"),
        use_gpu: true,
        fname_inp: filePath,
        no_prints: true,
        flash_attn: false,
        comma_in_time: false,
        translate: false,
        no_timestamps: false,
        audio_ctx: 0,
        max_len: wordLevel ? 1 : 0, // word level 模式時設置 max_len: 1
        segment_callback: (segment) => {
          console.log(`---- andy[${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}] ${segment.text}`);
          
          if (wordLevel) {
            // word level 模式：收集 word segments，不發送即時 SRT
            wordSegments.push({
              text: segment.text,
              t0: segment.t0,
              t1: segment.t1
            });
            console.log(`Word collected: ${segment.text}`);
          } else {
            // 正常模式：發送即時 SRT
            const formattedSegment = {
              ...segment,
              index: segmentIndex++,
              srtTimestamp: `${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}`,
              startTime: formatTimestamp(segment.t0),
              endTime: formatTimestamp(segment.t1)
            };
            
            console.log(`${formattedSegment.index}\n${formattedSegment.srtTimestamp}\n${segment.text}\n`);
            transcriptionEmitter.emitSegment(jobId, formattedSegment);
          }
        },
        progress_callback: (progress) => {
          const partProgress: TranscriptionPartProgress = {
            currentPart: 1,
            totalParts: 1,
            partProgress: progress,
            totalProgress: progress
          };
          transcriptionEmitter.emitProgress(jobId, partProgress);
        },
      };

      // 轉錄處理
      const result = await whisperService.transcribe(params);
      console.log(`完成檔案 ${filePath} 的轉錄`);
      
      if (wordLevel) {
        // word level 模式：將 words 組合成句子
        console.log(`總共收集到 ${wordSegments.length} 個 word segments`);
        const sentences = combineWordsToSentences(wordSegments);
        console.log(`組合成 ${sentences.length} 個句子`);
        
        // 發送句子級別的 segments
        sentences.forEach((sentence) => {
          transcriptionEmitter.emitSegment(jobId, sentence);
        });

        // 準備最終結果
        const completeText = sentences.map(s => s.text).join(' ');
        const finalSegments = sentences.map(s => ({
          text: s.text,
          start: s.start,
          end: s.end
        }));

        transcriptionEmitter.emitComplete(jobId, {
          text: completeText,
          segments: finalSegments
        });
      } else {
        // 正常模式：處理原有邏輯
        if (result.segments) {
          allSegments.push(...result.segments);
        }

        const completeText = allSegments
          .sort((a, b) => a.start - b.start)
          .map(segment => segment.text)
          .join(' ');

        transcriptionEmitter.emitComplete(jobId, {
          text: completeText,
          segments: allSegments
        });
      }

      // 清理檔案
      await fs.unlink(filePath);
      console.log("已清理暫存檔案:", filePath);

    } catch (error) {
      console.error("Youtube 下載或轉錄初始化失敗:", error);
      res.status(500).json({
        jobId,
        status: "error",
        error: error instanceof Error ? error.message : "未知錯誤",
      });

      // 錯誤發生時，清理所有暫存檔案
      try {
        await Promise.all(audioFiles.map(filePath => 
          fs.unlink(filePath).catch(err => 
            console.error(`清理檔案 ${filePath} 失敗:`, err)
          )
        ));
      } catch (cleanupError) {
        console.error("清理暫存檔案失敗:", cleanupError);
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
        language: "auto",
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
          console.log(formattedSegment);
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
      const downloadedFiles = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadedFiles;
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

const port = process.env.PORT || 8001;
httpServer.listen(port, () => {
  console.log(`伺服器運行在 http://localhost:${port}`);
});

// Start the SQS polling service
import { startSqsPolling } from "./services/sqs.service";
startSqsPolling();
