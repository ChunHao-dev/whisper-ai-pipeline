import { coreTranscriptionLogic, createProgressWrapper } from "./coreTranscription.service";
import { TranscriptionSentence } from "../domain/entities";

export interface TranscriptionOptions {
  filePath: string;
  jobId: string;
  onProgress?: (progress: number) => void;
  onSegment?: (segment: TranscriptionSentence) => void;  // 使用 Domain Entity
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

// Legacy type alias for backward compatibility
export interface FormattedSegment extends TranscriptionSentence {}

/**
 * Transcription Service - 檔案轉錄服務
 * 使用核心轉錄邏輯，專注於檔案轉錄的特定需求
 */
export const transcriptionService = {
  /**
   * 啟動檔案轉錄處理
   * 使用核心轉錄邏輯，配置檔案轉錄的特定參數
   */
  startFileTranscription: async (options: TranscriptionOptions): Promise<void> => {
    const { filePath, onProgress, onSegment, onComplete, onError } = options;

    try {
      // 使用核心轉錄邏輯
      await coreTranscriptionLogic({
        filePath,
        language: "auto", // 檔案轉錄使用自動語言檢測
        wordLevel: false, // 檔案轉錄不支援 word level 模式
        onSegment,
        onProgress: createProgressWrapper(onProgress, 'simple'),
        onComplete,
        onError
      });
    } catch (error) {
      // 額外的錯誤處理（如果需要）
      console.error("檔案轉錄服務錯誤:", error);
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