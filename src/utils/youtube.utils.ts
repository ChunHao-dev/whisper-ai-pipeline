import youtubedl from "youtube-dl-exec";
import fs from "fs/promises";
import { youtubeEmitter } from "../socket/handlers/youtube.handler";

/**
 * 從 URL 中提取 Youtube 影片 ID
 */
export const extractVideoId = (url: string): string => {
  const regex =
    /(?:youtube\.com\/(?:[^\/\n\s]+\/\s*[^\/\n\s]+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  if (!match) throw new Error("無效的 Youtube URL");
  return match[1];
};

/**
 * 下載並處理 Youtube 音檔
 */
export const downloadAndProcessYoutube = async (
  url: string,
  jobId: string
): Promise<string> => {
  const videoId = extractVideoId(url);
  const outputPath = `uploads/${videoId}.wav`;
  const onlyUrl = `${url}?v=${url.split("?")[0]}`;
  try {
    // 下載並轉換為 WAV

    await youtubedl(onlyUrl, {
      extractAudio: true,
      audioFormat: "wav",
      output: outputPath,
      postprocessorArgs: "--audio-quality 0 -ar 16000 -ac 1"
    });

    youtubeEmitter.emitDownloadComplete(jobId);

    // 讀取並轉換為 base64
    const audioData = await fs.readFile(outputPath, { encoding: "base64" });

    // 發送音檔數據
    youtubeEmitter.emitAudioReady(jobId, audioData);

    return outputPath;
  } catch (error) {
    youtubeEmitter.emitError(
      jobId,
      error instanceof Error ? error : new Error("下載過程中發生未知錯誤")
    );
    throw error;
  }
};
