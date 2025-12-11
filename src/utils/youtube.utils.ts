import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { youtubeEmitter } from "../socket/handlers/youtube.handler";
import { getOptimizedBrowserList } from "../config/youtube.config";
import { VideoInfo } from "../domain/repositories/storage.repository.js";

/**
 * 執行命令並返回結果
 */
function executeCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
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
 * 獲取影片資訊 - 使用多種方法嘗試
 */
async function getVideoInfo(url: string): Promise<VideoInfo> {
  // 方法1: 嘗試使用瀏覽器cookies
  try {
    console.log('=== 嘗試方法1: 瀏覽器cookies ===');
    return await getVideoInfoWithCookies(url);
  } catch (error) {
    console.log('瀏覽器cookies方法失敗，嘗試其他方法...');
  }

  // 方法2: 使用用戶代理偽裝
  try {
    console.log('=== 嘗試方法2: 用戶代理偽裝 ===');
    return await getVideoInfoWithUserAgent(url);
  } catch (error) {
    console.log('用戶代理偽裝方法失敗，嘗試基本方法...');
  }

  // 方法3: 基本方法（可能會失敗但值得一試）
  try {
    console.log('=== 嘗試方法3: 基本方法 ===');
    return await getVideoInfoBasic(url);
  } catch (error) {
    console.error('所有方法都失敗了');
    throw new Error('YouTube 獲取影片資訊失敗：建議手動下載影片或聯絡管理員');
  }
}

/**
 * 使用瀏覽器cookies獲取影片資訊
 */
async function getVideoInfoWithCookies(url: string): Promise<VideoInfo> {
  const browsers = getOptimizedBrowserList();
  
  for (const browser of browsers) {
    try {
      console.log(`嘗試使用 ${browser} 瀏覽器的 cookies...`);
      
      const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
      const args = [
        url,
        '--dump-single-json',
        '--no-check-certificates',
        '--no-warnings',
        '--prefer-free-formats',
        '--force-overwrites',
        '--cookies-from-browser',
        browser
      ];

      const result = await executeCommand(ytDlpPath, args);
      const jsonResult = JSON.parse(result);

      if (!jsonResult.duration || !jsonResult.title || !jsonResult.id) {
        throw new Error('無法取得完整的影片資訊');
      }

      console.log(`使用 ${browser} 瀏覽器成功獲取影片資訊`);
      return {
        id: jsonResult.id,
        title: jsonResult.title,
        duration: jsonResult.duration,
        uploadDate: jsonResult.upload_date,
        thumbnail: jsonResult.thumbnail,
        description: jsonResult.description,
        uploader: jsonResult.uploader,
        view_count: jsonResult.view_count,
        webpage_url: jsonResult.webpage_url
      };
    } catch (error) {
      console.error(`使用 ${browser} 瀏覽器失敗:`, error instanceof Error ? error.message : error);
    }
  }
  
  throw new Error('所有瀏覽器cookies都無效');
}

/**
 * 使用用戶代理偽裝獲取影片資訊
 */
async function getVideoInfoWithUserAgent(url: string): Promise<VideoInfo> {
  console.log('嘗試使用用戶代理偽裝...');
  
  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ];

  for (const userAgent of userAgents) {
    try {
      const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
      const args = [
        url,
        '--dump-single-json',
        '--no-check-certificates',
        '--no-warnings',
        '--prefer-free-formats',
        '--force-overwrites',
        '--user-agent',
        userAgent
      ];

      const result = await executeCommand(ytDlpPath, args);
      const jsonResult = JSON.parse(result);

      if (!jsonResult.duration || !jsonResult.title || !jsonResult.id) {
        throw new Error('無法取得完整的影片資訊');
      }

      console.log('用戶代理偽裝成功獲取影片資訊');
      return {
        id: jsonResult.id,
        title: jsonResult.title,
        duration: jsonResult.duration,
        uploadDate: jsonResult.upload_date,
        thumbnail: jsonResult.thumbnail,
        description: jsonResult.description,
        uploader: jsonResult.uploader,
        view_count: jsonResult.view_count,
        webpage_url: jsonResult.webpage_url
      };
    } catch (error) {
      console.error('用戶代理偽裝失敗:', error instanceof Error ? error.message : error);
    }
  }
  
  throw new Error('用戶代理偽裝方法失敗');
}

/**
 * 基本方法獲取影片資訊
 */
async function getVideoInfoBasic(url: string): Promise<VideoInfo> {
  console.log('嘗試使用基本方法...');
  
  const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
  const args = [
    url,
    '--dump-single-json',
    '--no-check-certificates',
    '--no-warnings',
    '--prefer-free-formats',
    '--force-overwrites'
  ];

  const result = await executeCommand(ytDlpPath, args);
  const jsonResult = JSON.parse(result);
  
  if (!jsonResult.duration || !jsonResult.title || !jsonResult.id) {
    throw new Error('無法取得完整的影片資訊');
  }

  console.log('基本方法成功獲取影片資訊');
  return {
    id: jsonResult.id,
    title: jsonResult.title,
    duration: jsonResult.duration,
    uploadDate: jsonResult.upload_date,
    thumbnail: jsonResult.thumbnail,
    description: jsonResult.description,
    uploader: jsonResult.uploader,
    view_count: jsonResult.view_count,
    webpage_url: jsonResult.webpage_url
  };
}


/**
 * 下載並處理 Youtube 音檔
 */
export const downloadAndProcessYoutube = async (
  url: string,
  jobId: string
): Promise<{ audioFiles: string[]; videoInfo: VideoInfo }> => {
  try {
    // 1. 獲取影片資訊
    const info = await getVideoInfo(url);
    console.log("影片資訊:", info);

    // 2. 通知前端資訊
    youtubeEmitter.emitSegmentsInfo(jobId, {
      totalSegments: 1,
      segmentDuration: info.duration || 0,
      totalDuration: info.duration || 0
    });

    const videoId = info.id
    const outputPath = `uploads/${videoId}.wav`;

    // 3. 下載處理
    youtubeEmitter.emitSegmentStart(jobId, 1);
    await downloadAudioWithFallback(url, outputPath);
    console.log(`下載完成 : ${outputPath}`);

    // 讀取並發送音檔資料
    // const audioData = await fs.readFile(outputPath, { encoding: "base64" });
    // youtubeEmitter.emitAudioReady(jobId, audioData);
    youtubeEmitter.emitSegmentComplete(jobId, 1);
    youtubeEmitter.emitDownloadComplete(jobId);

    // 返回音檔路徑和影片資訊
    return {
      audioFiles: [outputPath],
      videoInfo: info
    };
  } catch (error) {
    // 提供更明確的錯誤訊息和解決建議
    const errorMessage = error instanceof Error ? error.message : "下載過程中發生未知錯誤";
    
    if (errorMessage.includes('Sign in to confirm you\'re not a bot')) {
      const helpMessage = `
YouTube 認證錯誤：此影片需要登入驗證
解決方案：
1. 請確保在 Chrome 或 Safari 瀏覽器中已登入 YouTube
2. 嘗試在瀏覽器中播放此影片確認可正常觀看
3. 或者手動下載影片後上傳到系統進行轉錄
4. 詳細說明請參考：docs/youtube-authentication-guide.md
      `;
      youtubeEmitter.emitError(jobId, new Error(helpMessage));
    } else {
      youtubeEmitter.emitError(jobId, error instanceof Error ? error : new Error(errorMessage));
    }
    
    throw error;
  }
};

/**
 * 多方法下載音檔
 */
async function downloadAudioWithFallback(url: string, outputPath: string): Promise<void> {
  // 方法1: 嘗試使用瀏覽器cookies下載
  try {
    console.log('=== 嘗試使用瀏覽器cookies下載 ===');
    await downloadAudioWithCookies(url, outputPath);
    return;
  } catch (error) {
    console.log('瀏覽器cookies下載失敗，嘗試其他方法...');
  }

  // 方法2: 使用用戶代理偽裝下載
  try {
    console.log('=== 嘗試使用用戶代理偽裝下載 ===');
    await downloadAudioWithUserAgent(url, outputPath);
    return;
  } catch (error) {
    console.log('用戶代理偽裝下載失敗，嘗試基本方法...');
  }

  // 方法3: 基本下載
  try {
    console.log('=== 嘗試基本下載方法 ===');
    await downloadAudioBasic(url, outputPath);
    return;
  } catch (error) {
    throw new Error('YouTube 下載失敗：請在瀏覽器中登入 YouTube 後重試');
  }
}

/**
 * 使用瀏覽器cookies下載音檔
 */
async function downloadAudioWithCookies(url: string, outputPath: string): Promise<void> {
  const browsers = getOptimizedBrowserList();
  
  for (const browser of browsers) {
    try {
      console.log(`嘗試使用 ${browser} 瀏覽器下載音檔...`);
      
      const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
      const args = [
        url,
        '--extract-audio',
        '--audio-format', 'wav',
        '--output', outputPath,
        '--cookies-from-browser', browser
      ];
      
      await executeCommand(ytDlpPath, args);
      console.log(`使用 ${browser} 瀏覽器成功下載音檔`);
      return;
    } catch (error) {
      console.error(`使用 ${browser} 瀏覽器下載失敗:`, error instanceof Error ? error.message : error);
    }
  }
  
  throw new Error('所有瀏覽器cookies下載都失敗');
}

/**
 * 使用用戶代理偽裝下載音檔
 */
async function downloadAudioWithUserAgent(url: string, outputPath: string): Promise<void> {
  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  ];

  for (const userAgent of userAgents) {
    try {
      const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
      const args = [
        url,
        '--extract-audio',
        '--audio-format', 'wav',
        '--output', outputPath,
        '--user-agent', userAgent
      ];
      
      await executeCommand(ytDlpPath, args);
      console.log('用戶代理偽裝下載成功');
      return;
    } catch (error) {
      console.error('用戶代理偽裝下載失敗:', error instanceof Error ? error.message : error);
    }
  }
  
  throw new Error('用戶代理偽裝下載失敗');
}

/**
 * 基本下載方法
 */
async function downloadAudioBasic(url: string, outputPath: string): Promise<void> {
  const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
  const args = [
    url,
    '--extract-audio',
    '--audio-format', 'wav',
    '--output', outputPath
  ];
  
  await executeCommand(ytDlpPath, args);
}
