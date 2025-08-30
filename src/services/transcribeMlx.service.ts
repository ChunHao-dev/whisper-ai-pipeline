import fs from "fs/promises";
import { join } from "path";
import { mlxWhisperService, MLXTranscriptionResult } from "./mlx-whisper.service";

export interface TranscribeMlxOptions {
  tempFilePath: string;
  jobId: string;
  language?: string;
  model?: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

/**
 * MLX 轉錄 Service - 使用 MLX Whisper 引擎處理檔案轉錄
 * 專注於 MLX Whisper 特定的處理邏輯和檔案清理
 */
export const transcribeMlxService = {
  /**
   * 啟動 MLX 轉錄處理
   * 處理完整的 MLX轉錄 → 結果處理 → 清理流程
   */
  startMlxTranscription: async (options: TranscribeMlxOptions): Promise<void> => {
    const { tempFilePath, jobId, language, model, onComplete, onError } = options;

    try {
      // 1. 使用 MLX Whisper 服務處理轉錄
      const result = await mlxWhisperService.processTranscription(tempFilePath, {
        language: language || undefined,
        model: model || undefined,
        saveSrt: true,
        outputDir: join(process.cwd(), "uploads")
      });

      // 2. 處理轉錄結果
      if (result.success) {
        const response = {
          jobId,
          status: "complete" as const,
          text: result.text,
          segments: result.segments,
          sentences: result.sentences,
          language: result.language,
          srtPath: result.srtPath,
          srtContent: result.srtContent
        };

        if (onComplete) {
          onComplete(response);
        }
      } else {
        const errorMessage = result.error || "轉錄處理失敗";
        if (onError) {
          onError(errorMessage);
        }
      }

    } catch (error) {
      console.error("MLX 轉錄處理失敗:", error);
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      // 3. 清理暫存檔案
      await transcribeMlxService.cleanupTempFile(tempFilePath);
    }
  },

  /**
   * 清理暫存檔案
   */
  cleanupTempFile: async (tempFilePath: string): Promise<void> => {
    try {
      await fs.unlink(tempFilePath);
      console.log("已清理暫存檔案:", tempFilePath);
    } catch (error) {
      console.error("清理暫存檔案失敗:", error);
    }
  }
};