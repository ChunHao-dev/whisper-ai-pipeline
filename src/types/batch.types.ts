// 批次處理相關型別定義

export interface VideoItem {
  videoId: string;
  language?: string;
}

export interface BatchProcessOptions {
  targetSegments?: number;
  targetLanguages?: string[];
  aiService?: 'gemini' | 'openai';
  forceReprocess?: boolean; // 強制重新處理已存在的檔案
}

export interface VideoProcessStatus {
  videoId: string;
  language: string;
  hasSegments: boolean;
  hasSummary: boolean;
  translations: {
    [language: string]: {
      hasSegments: boolean;
      hasSummary: boolean;
    };
  };
  needsProcessing: {
    segmentation: boolean;
    translations: string[];
  };
}

export interface BatchProcessResult {
  videoId: string;
  language: string;
  success: boolean;
  processed: {
    segmentation: boolean;
    translations: string[];
  };
  skipped: {
    segmentation: boolean;
    translations: string[];
  };
  errors: string[];
}

export interface BatchJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  results: BatchProcessResult[];
  startedAt: string;
  completedAt?: string;
}
