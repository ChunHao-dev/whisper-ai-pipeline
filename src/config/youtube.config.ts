/**
 * YouTube 下載器配置
 */
export interface YouTubeConfig {
  /** 偏好的瀏覽器列表，按優先順序排列 */
  preferredBrowsers: string[];
  /** 是否啟用詳細日誌 */
  enableVerboseLogging: boolean;
  /** 最大重試次數 */
  maxRetries: number;
}

/**
 * 預設配置
 */
export const defaultYouTubeConfig: YouTubeConfig = {
  preferredBrowsers: ['chrome', 'safari', 'firefox', 'edge'],
  enableVerboseLogging: true,
  maxRetries: 3
};

/**
 * 根據作業系統調整瀏覽器順序
 */
export function getOptimizedBrowserList(): string[] {
  const platform = process.platform;
  
  switch (platform) {
    case 'darwin': // macOS
      return ['chrome', 'safari', 'firefox', 'edge'];
    case 'win32': // Windows
      return ['chrome', 'edge', 'firefox'];
    case 'linux':
      return ['chrome', 'firefox'];
    default:
      return defaultYouTubeConfig.preferredBrowsers;
  }
}
