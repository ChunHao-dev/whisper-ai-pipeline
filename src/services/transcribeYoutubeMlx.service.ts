import fs from "fs/promises";
import { join } from "path";
import { downloadAndProcessYoutube } from "../utils/youtube.utils";
import { mlxWhisperService, MLXTranscriptionResult } from "./mlx-whisper.service";

export interface TranscribeYoutubeMlxOptions {
  url: string;
  language?: string;
  model?: string;
  jobId: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

/**
 * MLX YouTube 轉錄 Service - 使用 MLX Whisper 處理 YouTube 轉錄
 * 處理完整的下載 → MLX轉錄 → 清理流程
 */
export const transcribeYoutubeMlxService = {
  /**
   * 啟動 YouTube MLX 轉錄處理
   * 處理完整的下載 → MLX轉錄 → 清理流程
   */
  startYoutubeMlxTranscription: async (options: TranscribeYoutubeMlxOptions): Promise<void> => {
    const { url, language, model, jobId, onComplete, onError } = options;
    let audioFiles: string[] = [];

    try {
      // 1. YouTube 特定邏輯：下載音頻
      const downloadResult = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadResult.audioFiles;
      const filePath = audioFiles[0];
      const absoluteFilePath = join(process.cwd(), filePath);
      
      console.log("使用 MLX Whisper 轉錄 YouTube:", absoluteFilePath);

      // 2. 使用 MLX Whisper 完整處理（包含 word-level 重組和 SRT 生成）
      const result = await mlxWhisperService.processTranscription(absoluteFilePath, {
        language: language || undefined,
        model: model || undefined,
        saveSrt: true,
        outputDir: join(process.cwd(), "uploads")
      });

      // 3. YouTube 特定邏輯：清理檔案
      await fs.unlink(absoluteFilePath);
      console.log("已清理音訊檔案:", absoluteFilePath);

      // 4. 處理轉錄結果
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
      console.error("MLX Whisper YouTube 轉錄失敗:", error);
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      
      if (onError) {
        onError(errorMessage);
      }

      // 錯誤發生時，清理所有暫存檔案
      await transcribeYoutubeMlxService.cleanupAudioFiles(audioFiles);
    }
  },

  /**
   * 清理音頻檔案
   */
  cleanupAudioFiles: async (audioFiles: string[]): Promise<void> => {
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
};