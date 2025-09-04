/**
 * Domain Entities - 統一導出所有領域實體
 * 提供所有業務邏輯純函數和資料結構
 */

// 轉錄相關實體和函數
export * from './transcription.entity';

// 影片相關實體和函數
export * from './video.entity';

// 重新導出常用類型（避免重複定義）
export type {
  // 從 transcription.entity 導出的主要類型
  Transcription,
  TranscriptionSegment,
  TranscriptionWord,
  TranscriptionSentence,
  TranscriptionResult
} from './transcription.entity';

export type {
  // 從 video.entity 導出的主要類型
  Video,
  VideoMetadata,
  VideoValidationResult,
  VideoProcessingResult
} from './video.entity';

// 常用工具函數別名
export {
  // 轉錄相關
  generateSrtContent as generateSrt,
  calculateTranscriptionDuration as getDuration,
  countWords as getWordCount,
  formatSrtTime
} from './transcription.entity';

export {
  formatDisplayTitle as formatTitle,
  estimateTranscriptionCost as getCost,
  extractVideoIdFromUrl as getVideoId,
  isValidYouTubeUrl as isValidYoutube,
  validateVideoForTranscription as validateVideo,
  formatVideoDuration as formatDuration,
  formatFileSize
} from './video.entity';