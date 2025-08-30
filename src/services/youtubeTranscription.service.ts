import fs from "fs/promises";
import { downloadAndProcessYoutube } from "../utils/youtube.utils";
import { coreTranscriptionLogic, createProgressWrapper } from "./coreTranscription.service";

export interface YoutubeTranscriptionOptions {
  url: string;
  language: string;
  wordLevel: boolean;
  jobId: string;
  onProgress?: (progress: any) => void;
  onSegment?: (segment: any) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

/**
 * YouTube Transcription Service - YouTube 下載和轉錄服務
 * 使用核心轉錄邏輯，專注於 YouTube 特定的下載和清理邏輯
 */
export const youtubeTranscriptionService = {
  /**
   * 啟動 YouTube 轉錄處理
   * 處理完整的下載 → 轉錄 → 清理流程
   */
  startYoutubeTranscription: async (options: YoutubeTranscriptionOptions): Promise<void> => {
    const { url, language, wordLevel, jobId, onProgress, onSegment, onComplete, onError } = options;
    let audioFiles: string[] = [];

    try {
      // 1. YouTube 特定邏輯：下載音頻
      const downloadResult = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadResult.audioFiles;
      const filePath = audioFiles[0];
      
      // 2. 使用核心轉錄邏輯處理轉錄
      await coreTranscriptionLogic({
        filePath,
        language,
        wordLevel, // YouTube 轉錄支援 wordLevel 選項
        onSegment,
        onProgress: createProgressWrapper(onProgress, 'detailed'), // 使用詳細進度格式
        onComplete,
        onError
      });

      // 3. YouTube 特定邏輯：清理檔案
      await fs.unlink(filePath);
      console.log("已清理暫存檔案:", filePath);

    } catch (error) {
      console.error("Youtube 下載或轉錄失敗:", error);
      if (onError) {
        onError(error instanceof Error ? error.message : "未知錯誤");
      }

      // 錯誤發生時，清理所有暫存檔案
      await youtubeTranscriptionService.cleanupAudioFiles(audioFiles);
    }
  },

  /**
   * 清理音頻檔案
   */
  cleanupAudioFiles: async (audioFiles: string[]): Promise<void> => {
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
};