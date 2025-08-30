import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { whisperService } from "../services/whisper.service";
import { WhisperParams } from "../types/whisper.types";
import { TranscribeResponse } from "../types/api.types";
import { transcriptionEmitter } from "../socket/handlers/transcription.handler";
import { formatTimestamp } from "../utils/time.utils";

export interface TranscribeFileRequest {
  file: Express.Multer.File;
}

export interface TranscribeFileResult {
  jobId: string;
  status: "processing";
}

/**
 * 轉錄檔案 UseCase - 協調整個轉錄流程
 * 這是一個純函數，負責協調業務邏輯，不處理 HTTP 細節
 */
export const transcribeFileUseCase = async (
  request: TranscribeFileRequest
): Promise<TranscribeFileResult> => {
  const { file } = request;
  const jobId = uuidv4();
  const tempFilePath = file.path;
  let segmentIndex = 1;

  // 設定 Whisper 轉錄參數
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

  // 非同步執行轉錄（不等待完成）
  startTranscriptionProcess(params, jobId, tempFilePath);

  // 立即回傳處理中狀態
  return {
    jobId,
    status: "processing"
  };
};

/**
 * 啟動轉錄程序的純函數
 * 將副作用隔離到獨立函數中
 */
const startTranscriptionProcess = async (
  params: WhisperParams,
  jobId: string,
  tempFilePath: string
): Promise<void> => {
  try {
    const result = await whisperService.transcribe(params);
    transcriptionEmitter.emitComplete(jobId, result);
  } catch (error) {
    transcriptionEmitter.emitError(jobId, error instanceof Error ? error.message : "未知錯誤");
  } finally {
    await cleanupTempFile(tempFilePath);
  }
};

/**
 * 清理暫存檔案的純函數
 */
const cleanupTempFile = async (filePath: string): Promise<void> => {
  try {
    const fs = await import("fs/promises");
    await fs.unlink(filePath);
    console.log("已清理暫存檔案:", filePath);
  } catch (error) {
    console.error("清理暫存檔案失敗:", error);
  }
};