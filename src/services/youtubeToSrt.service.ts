import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { downloadAndProcessYoutube } from "../utils/youtube.utils";
import { YoutubeToSrtResponse } from "../types/api.types";
import { StorageRepository } from "../domain/repositories/storage.repository";
import { defaultStorageRepository } from "../infrastructure/repositories";
import { 
  extractVideoIdFromUrl, 
  isValidYouTubeUrl, 
  createVideo, 
  validateVideoForTranscription,
  formatVideoDuration 
} from "../domain/entities";

export interface YoutubeToSrtOptions {
  url: string;
  language: string;
  jobId: string;
  storageRepository?: StorageRepository;
  onComplete?: (result: YoutubeToSrtResponse) => void;
  onError?: (error: string) => void;
}

/**
 * YouTube 轉 SRT Service - 使用 MLX Whisper 生成 SRT 字幕檔案
 * 使用 MLX Whisper 而非 whisper-cpp，專注於產生 SRT 檔案輸出
 */
export const youtubeToSrtService = {
  /**
   * 啟動 YouTube 轉 SRT 處理
   * 處理完整的下載 → MLX轉錄 → SRT生成 → 清理流程
   */
  startYoutubeToSrt: async (options: YoutubeToSrtOptions): Promise<void> => {
    const { url, language, jobId, storageRepository = defaultStorageRepository, onComplete, onError } = options;
    let audioFiles: string[] = [];
    const execPromise = promisify(exec);

    try {
      // 1. 使用 Domain Entity 驗證 YouTube URL
      if (!isValidYouTubeUrl(url)) {
        throw new Error("無效的 YouTube URL");
      }

      const videoId = extractVideoIdFromUrl(url);
      if (!videoId) {
        throw new Error("無法從 URL 提取影片 ID");
      }

      console.log(`開始處理 YouTube 影片: ${videoId}`);

      // 2. YouTube 特定邏輯：下載音頻
      const downloadResult = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadResult.audioFiles;
      const filePath = audioFiles[0];
      const absoluteFilePath = join(process.cwd(), filePath);
      console.log("下載的音訊檔案絕對路徑:", absoluteFilePath);

      // 3. 使用 Domain Entity 創建和驗證影片資訊
      if (downloadResult.videoInfo) {
        const video = createVideo(
          videoId,
          downloadResult.videoInfo.title || "Unknown Title",
          downloadResult.videoInfo.duration || 0,
          url,
          undefined,
          language
        );

        const validation = validateVideoForTranscription(video);
        if (!validation.isValid) {
          console.warn("影片驗證警告:", validation.errors.join(', '));
          if (validation.errors.some(error => error.includes('時長'))) {
            throw new Error(`影片不符合轉錄要求: ${validation.errors.join(', ')}`);
          }
        }

        console.log(`影片資訊: 標題="${video.title}", 時長=${formatVideoDuration(video.duration)}`);
      }
      
      // 4. 執行 MLX Whisper 命令生成 SRT
      const mlxWhisperPath = join(process.cwd(), ".venv/bin/mlx_whisper");
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

      // 5. YouTube 特定邏輯：清理檔案
      await storageRepository.deleteFile(absoluteFilePath);
      console.log("已清理音訊檔案:", absoluteFilePath);

      // 6. 回調成功結果
      const response: YoutubeToSrtResponse = {
        jobId,
        status: "complete",
        srtPath: outputPath
      };

      if (onComplete) {
        onComplete(response);
      }

    } catch (error) {
      console.error("Youtube 轉 SRT 失敗:", error);
      const errorMessage = error instanceof Error ? error.message : "未知錯誤";
      
      if (onError) {
        onError(errorMessage);
      }

      // 錯誤發生時，清理所有暫存檔案
      await youtubeToSrtService.cleanupAudioFiles(audioFiles);
    }
  },

  /**
   * 清理音頻檔案
   */
  cleanupAudioFiles: async (audioFiles: string[], storageRepository = defaultStorageRepository): Promise<void> => {
    try {
      await Promise.all(audioFiles.map(filePath => {
        const absolutePath = join(process.cwd(), filePath);
        return storageRepository.deleteFile(absolutePath).catch(err => 
          console.error(`清理檔案 ${absolutePath} 失敗:`, err)
        );
      }));
    } catch (cleanupError) {
      console.error("清理暫存檔案失敗:", cleanupError);
    }
  }
};