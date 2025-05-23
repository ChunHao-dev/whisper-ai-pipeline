import youtubedl from "youtube-dl-exec";
import fs from "fs/promises";
import { youtubeEmitter } from "../socket/handlers/youtube.handler";
interface VideoInfo {
  duration: number;
  title: string;
  id: string;
}

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
 * 獲取影片資訊
 */
async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const result = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      forceOverwrites: true
    });

    if (typeof result === 'string') {
      throw new Error('預期外的 youtube-dl 回應格式');
    }
    
    if (!result.duration || !result.title || !result.id) {
      throw new Error('無法取得完整的影片資訊');
    }

    return {
      duration: result.duration,
      title: result.title,
      id: result.id
    };
  } catch (error) {
    console.error('獲取影片資訊失敗:', error);
    throw error;
  }
}

/**
 * 下載 Youtube 音檔
 */
async function downloadAudio(url: string, outputPath: string): Promise<void> {
  await youtubedl(url, {
    extractAudio: true,
    audioFormat: "wav",
    output: outputPath
  });
}

/**
 * 下載並處理 Youtube 音檔
 */
export const downloadAndProcessYoutube = async (
  url: string,
  jobId: string
): Promise<string[]> => {
  try {
    // 1. 獲取影片資訊
    const info = await getVideoInfo(url);
    console.log("影片資訊:", info);

    // 2. 通知前端資訊
    youtubeEmitter.emitSegmentsInfo(jobId, {
      totalSegments: 1,
      segmentDuration: info.duration,
      totalDuration: info.duration
    });

    const videoId = info.id
    const outputPath = `uploads/${videoId}.wav`;

    // 3. 下載處理
    youtubeEmitter.emitSegmentStart(jobId, 1);
    await downloadAudio(url, outputPath);
    console.log(`下載完成 : ${outputPath}`);

    // 讀取並發送音檔資料
    // const audioData = await fs.readFile(outputPath, { encoding: "base64" });
    // youtubeEmitter.emitAudioReady(jobId, audioData);
    youtubeEmitter.emitSegmentComplete(jobId, 1);
    youtubeEmitter.emitDownloadComplete(jobId);

    // 返回音檔路徑 (為了與原有介面相容，包裝成陣列)
    return [outputPath];
  } catch (error) {
    youtubeEmitter.emitError(
      jobId,
      error instanceof Error ? error : new Error("下載過程中發生未知錯誤")
    );
    throw error;
  }
};
