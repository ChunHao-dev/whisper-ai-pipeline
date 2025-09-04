/**
 * Video Domain Entity - 影片相關的核心業務邏輯
 * 包含影片資訊驗證、格式化、業務規則等純函數
 */

// ===== Domain Entities =====

export interface Video {
  readonly id: string;
  readonly title: string;
  readonly duration: number;
  readonly url?: string;
  readonly uploadDate?: string;
  readonly language?: string;
  readonly isProcessed: boolean;
  readonly transcriptionId?: string;
  readonly metadata: VideoMetadata;
}

export interface VideoMetadata {
  readonly fileSize?: number;
  readonly format?: string;
  readonly resolution?: string;
  readonly bitrate?: number;
  readonly description?: string;
  readonly tags?: string[];
  readonly thumbnail?: string;
  readonly uploader?: string;
}

export interface VideoValidationResult {
  readonly isValid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
}

export interface VideoProcessingResult {
  readonly success: boolean;
  readonly video?: Video;
  readonly transcriptionId?: string;
  readonly error?: string;
}

// ===== Factory Functions =====

export const createVideoMetadata = (
  fileSize?: number,
  format?: string,
  resolution?: string,
  bitrate?: number,
  description?: string,
  tags?: string[],
  thumbnail?: string,
  uploader?: string
): VideoMetadata => ({
  fileSize,
  format,
  resolution,
  bitrate,
  description: description?.trim(),
  tags: tags?.filter(tag => tag.trim().length > 0),
  thumbnail,
  uploader: uploader?.trim()
});

export const createVideo = (
  id: string,
  title: string,
  duration: number,
  url?: string,
  uploadDate?: string,
  language?: string,
  metadata: VideoMetadata = {}
): Video => ({
  id: id.trim(),
  title: title.trim(),
  duration: Math.max(0, duration),
  url: url?.trim(),
  uploadDate: uploadDate?.trim(),
  language: language?.trim(),
  isProcessed: false,
  metadata
});

// ===== Pure Business Logic Functions =====

/**
 * 驗證影片是否適合轉錄
 */
export const validateVideoForTranscription = (video: Video): VideoValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 基本檢查
  if (!video.id || video.id.length < 3) {
    errors.push('影片 ID 必須至少 3 個字符');
  }

  if (!video.title || video.title.length === 0) {
    errors.push('影片標題不能為空');
  }

  if (video.title && video.title.length > 200) {
    warnings.push('影片標題過長，建議簡化');
  }

  // 時長檢查
  if (video.duration <= 0) {
    errors.push('影片時長必須大於 0');
  }

  if (video.duration > 7200) { // 2小時
    errors.push('影片時長不能超過 2 小時（7200秒）');
  }

  if (video.duration < 5) {
    warnings.push('影片時長過短，可能轉錄效果不佳');
  }

  // 檔案大小檢查
  if (video.metadata.fileSize) {
    const maxSizeBytes = 500_000_000; // 500MB
    if (video.metadata.fileSize > maxSizeBytes) {
      errors.push('檔案大小不能超過 500MB');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * 檢查影片是否已處理
 */
export const isVideoProcessed = (video: Video): boolean => {
  return video.isProcessed && !!video.transcriptionId;
};

/**
 * 標記影片為已處理
 */
export const markVideoAsProcessed = (video: Video, transcriptionId: string): Video => ({
  ...video,
  isProcessed: true,
  transcriptionId: transcriptionId.trim()
});

/**
 * 重置影片處理狀態
 */
export const resetVideoProcessingStatus = (video: Video): Video => ({
  ...video,
  isProcessed: false,
  transcriptionId: undefined
});

/**
 * 格式化顯示標題（截斷過長標題）
 */
export const formatDisplayTitle = (video: Video, maxLength: number = 50): string => {
  if (video.title.length <= maxLength) {
    return video.title;
  }
  
  return video.title.substring(0, maxLength).trim() + '...';
};

/**
 * 格式化影片時長為可讀格式 (HH:MM:SS)
 */
export const formatVideoDuration = (durationInSeconds: number): string => {
  const hours = Math.floor(durationInSeconds / 3600);
  const minutes = Math.floor((durationInSeconds % 3600) / 60);
  const seconds = Math.floor(durationInSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
};

/**
 * 格式化檔案大小為可讀格式
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
};

/**
 * 估算轉錄成本（基於時長）
 */
export const estimateTranscriptionCost = (video: Video, pricePerSecond: number = 0.001): number => {
  return Math.ceil(video.duration * pricePerSecond * 100) / 100; // 保留兩位小數
};

/**
 * 估算轉錄處理時間（分鐘）
 */
export const estimateProcessingTime = (video: Video): number => {
  // 假設處理時間約為影片時長的 1/4
  const processingTimeSeconds = video.duration * 0.25;
  return Math.ceil(processingTimeSeconds / 60);
};

/**
 * 檢查影片語言是否支援
 */
export const isSupportedLanguage = (language: string): boolean => {
  const supportedLanguages = [
    'zh', 'zh-TW', 'zh-CN',
    'en', 'en-US', 'en-GB',
    'ja', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru',
    'auto' // 自動檢測
  ];
  
  return supportedLanguages.includes(language.toLowerCase());
};

/**
 * 標準化語言代碼
 */
export const normalizeLanguageCode = (language: string): string => {
  const languageMap: Record<string, string> = {
    'chinese': 'zh',
    'english': 'en',
    'japanese': 'ja',
    'korean': 'ko',
    'french': 'fr',
    'german': 'de',
    'spanish': 'es',
    'italian': 'it',
    'portuguese': 'pt',
    'russian': 'ru',
    'zh-tw': 'zh-TW',
    'zh-cn': 'zh-CN',
    'en-us': 'en-US',
    'en-gb': 'en-GB'
  };

  const normalized = language.toLowerCase().trim();
  return languageMap[normalized] || normalized;
};

/**
 * 從 YouTube URL 提取影片 ID
 */
export const extractVideoIdFromUrl = (url: string): string | null => {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^&\n?#]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
};

/**
 * 檢查是否為有效的 YouTube URL
 */
export const isValidYouTubeUrl = (url: string): boolean => {
  return extractVideoIdFromUrl(url) !== null;
};

/**
 * 生成影片摘要資訊
 */
export const generateVideoSummary = (video: Video): string => {
  const parts: string[] = [];
  
  parts.push(`標題: ${formatDisplayTitle(video, 80)}`);
  parts.push(`時長: ${formatVideoDuration(video.duration)}`);
  
  if (video.language) {
    parts.push(`語言: ${normalizeLanguageCode(video.language)}`);
  }
  
  if (video.metadata.fileSize) {
    parts.push(`檔案大小: ${formatFileSize(video.metadata.fileSize)}`);
  }
  
  if (video.metadata.uploader) {
    parts.push(`上傳者: ${video.metadata.uploader}`);
  }

  parts.push(`狀態: ${video.isProcessed ? '已處理' : '未處理'}`);

  return parts.join('\n');
};

/**
 * 檢查兩個影片是否為同一個
 */
export const isSameVideo = (video1: Video, video2: Video): boolean => {
  return video1.id === video2.id && video1.title === video2.title;
};

/**
 * 合併影片元數據
 */
export const mergeVideoMetadata = (
  existingMetadata: VideoMetadata, 
  newMetadata: Partial<VideoMetadata>
): VideoMetadata => ({
  ...existingMetadata,
  ...Object.fromEntries(
    Object.entries(newMetadata).filter(([_, value]) => value !== undefined)
  )
});

/**
 * 篩選符合條件的影片
 */
export const filterVideosByDuration = (
  videos: Video[], 
  minDuration?: number, 
  maxDuration?: number
): Video[] => {
  return videos.filter(video => {
    if (minDuration !== undefined && video.duration < minDuration) {
      return false;
    }
    if (maxDuration !== undefined && video.duration > maxDuration) {
      return false;
    }
    return true;
  });
};

/**
 * 依時長排序影片
 */
export const sortVideosByDuration = (videos: Video[], ascending: boolean = true): Video[] => {
  return [...videos].sort((a, b) => 
    ascending ? a.duration - b.duration : b.duration - a.duration
  );
};

/**
 * 計算影片清單統計資訊
 */
export const calculateVideoListStats = (videos: Video[]) => {
  const totalVideos = videos.length;
  const processedVideos = videos.filter(isVideoProcessed).length;
  const totalDuration = videos.reduce((sum, video) => sum + video.duration, 0);
  const totalSize = videos.reduce((sum, video) => sum + (video.metadata.fileSize || 0), 0);

  return {
    totalVideos,
    processedVideos,
    unprocessedVideos: totalVideos - processedVideos,
    processingRate: totalVideos > 0 ? (processedVideos / totalVideos) * 100 : 0,
    totalDuration,
    totalDurationFormatted: formatVideoDuration(totalDuration),
    totalSize,
    totalSizeFormatted: formatFileSize(totalSize),
    averageDuration: totalVideos > 0 ? totalDuration / totalVideos : 0,
    averageSize: totalVideos > 0 ? totalSize / totalVideos : 0
  };
};