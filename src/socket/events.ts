export const EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  TRANSCRIPTION: {
    START: 'transcription-start',
    SEGMENT: 'transcription-segment',
    PROGRESS: 'transcription-progress',
    COMPLETE: 'transcription-complete',
    ERROR: 'transcription-error',
  }
} as const;

export interface TranscriptionProgressData {
  jobId: string;
  progress: number;
}

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
