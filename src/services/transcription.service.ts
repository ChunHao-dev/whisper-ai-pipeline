import { join } from "path";
import { whisperService } from "./whisper.service";
import { WhisperParams } from "../types/whisper.types";
import { formatTimestamp } from "../utils/time.utils";

export interface TranscriptionOptions {
  filePath: string;
  jobId: string;
  onProgress?: (progress: number) => void;
  onSegment?: (segment: FormattedSegment) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export interface FormattedSegment {
  text: string;
  t0: number;
  t1: number;
  index: number;
  srtTimestamp: string;
  startTime: string;
  endTime: string;
}

/**
 * Transcription Service - 處理具體的轉錄執行邏輯
 * 封裝 Whisper 引擎的具體參數和執行細節
 */
export const transcriptionService = {
  /**
   * 啟動檔案轉錄處理
   * 處理所有 Whisper 相關的參數設定和執行
   */
  startFileTranscription: async (options: TranscriptionOptions): Promise<void> => {
    const { filePath, jobId, onProgress, onSegment, onComplete, onError } = options;
    let segmentIndex = 1;

    // Whisper 引擎參數設定（具體實作細節）
    const params: WhisperParams = {
      language: "auto",
      model: join(process.cwd(), "models/ggml-large-v3-turbo.bin"),
      use_gpu: true,
      fname_inp: filePath,
      no_prints: true,
      flash_attn: false,
      comma_in_time: false,
      translate: false,
      no_timestamps: false,
      audio_ctx: 0,
      max_len: 0,
      segment_callback: (segment) => {
        if (onSegment) {
          const formattedSegment: FormattedSegment = {
            ...segment,
            index: segmentIndex++,
            srtTimestamp: `${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}`,
            startTime: formatTimestamp(segment.t0),
            endTime: formatTimestamp(segment.t1)
          };
          
          console.log(`${formattedSegment.index}\n${formattedSegment.srtTimestamp}\n${segment.text}\n`);
          onSegment(formattedSegment);
        }
      },
      progress_callback: (progress) => {
        if (onProgress) {
          onProgress(progress);
        }
      },
    };

    // 執行轉錄處理
    try {
      const result = await whisperService.transcribe(params);
      if (onComplete) {
        onComplete(result);
      }
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : "未知錯誤");
      }
    }
  },

  /**
   * 清理暫存檔案
   */
  cleanupTempFile: async (filePath: string): Promise<void> => {
    try {
      const fs = await import("fs/promises");
      await fs.unlink(filePath);
      console.log("已清理暫存檔案:", filePath);
    } catch (error) {
      console.error("清理暫存檔案失敗:", error);
    }
  }
};