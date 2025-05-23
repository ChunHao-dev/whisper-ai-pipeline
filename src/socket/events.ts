export const EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  TRANSCRIPTION: {
    START: 'transcription-start',
    SEGMENT: 'transcription-segment',
    PROGRESS: 'transcription-progress',
    COMPLETE: 'transcription-complete',
    ERROR: 'transcription-error',
  },
  YOUTUBE: {
    DOWNLOAD_PROGRESS: 'youtube-download-progress',
    DOWNLOAD_COMPLETE: 'youtube-download-complete',
    DOWNLOAD_ERROR: 'youtube-download-error',
    AUDIO_READY: 'youtube-audio-ready',
    SEGMENTS_INFO: 'youtube-segments-info',
    SEGMENT_START: 'youtube-segment-start',
    SEGMENT_COMPLETE: 'youtube-segment-complete'
  }
} as const;

export interface TranscriptionPartProgress {
  currentPart: number;
  totalParts: number;
  partProgress: number;
  totalProgress: number;  // 總體轉錄進度（百分比）
}

// 基礎進度介面
export interface TranscriptionProgressBase {
  jobId: string;
}

// 單一檔案進度
export interface TranscriptionSingleProgress extends TranscriptionProgressBase {
  type: 'single';
  progress: number;
}

// 分段檔案進度
export interface TranscriptionMultipartProgress extends TranscriptionProgressBase {
  type: 'multipart';
  progress: TranscriptionPartProgress;
}

export type TranscriptionProgressData = TranscriptionSingleProgress | TranscriptionMultipartProgress;

export interface TranscriptionSegmentData {
  jobId: string;
  segment: {
    text: string;
    t0: number;
    t1: number;
    index: number;         // 字幕序號
    srtTimestamp: string;  // SRT格式的時間戳 "00:00:01,000 --> 00:00:03,000"
    startTime: string;     // 開始時間
    endTime: string;       // 結束時間
  };
}

export interface TranscriptionCompleteData {
  jobId: string;
  text: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export interface TranscriptionErrorData {
  jobId: string;
  error: string;
}

export interface YoutubeProgress {
  percent: number;
  speed: string;
  downloaded: number;
}

export interface YoutubeDownloadProgress extends YoutubeProgress {
  jobId: string;
}

export interface YoutubeAudioData {
  jobId: string;
  audioData: string;  // base64 編碼的音檔
}

export interface YoutubeSegmentsInfo {
  totalSegments: number;
  segmentDuration: number;
  totalDuration: number;
}

export interface YoutubeSegmentProgress {
  jobId: string;
  currentSegment: number;
  segmentProgress: number;
}
