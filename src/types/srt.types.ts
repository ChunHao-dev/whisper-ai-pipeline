/**
 * SRT 相關型別定義
 */

// ==================== 基礎 SRT 結構 ====================

export interface SRTEntry {
  index: number;
  startTime: string;    // "00:00:00,000"
  endTime: string;      // "00:00:03,500"
  text: string;
}

export interface ParsedSRT {
  entries: SRTEntry[];
  totalDuration: string;
  entryCount: number;
}

// ==================== 分段索引 (segments.json) ====================

export interface SegmentIndex {
  id: string;           // "segment-1"
  topic: string;        // 段落主題
  startIndex: number;   // 起始 SRT 索引（1-based）
  endIndex: number;     // 結束 SRT 索引（包含）
  timeStart: string;    // "00:00:00,000"
  timeEnd: string;      // "00:05:00,000"
}

export interface SegmentsFile {
  videoId: string;
  language: string;
  segments: SegmentIndex[];
  metadata: {
    totalSegments: number;
    totalEntries: number;
    averageSegmentLength: number;
    translatedFrom?: string;  // 如果是翻譯版本
    createdAt: string;
  };
}

// ==================== 摘要 (summary.json) ====================

export interface SegmentSummary {
  segmentId: string;    // 對應 SegmentIndex.id
  topic: string;        // 段落主題（與 SegmentIndex 重複，方便讀取）
  summary: string;      // 段落摘要內容
}

export interface SummaryFile {
  videoId: string;
  language: string;
  overallSummary: string;           // 整體摘要
  segmentSummaries: SegmentSummary[];
  metadata: {
    aiService: 'gemini' | 'openai';
    processingTime: number;
    translatedFrom?: string;
    createdAt: string;
  };
}

// ==================== 完整分段資訊（組合使用） ====================

export interface FullSegment extends SegmentIndex {
  summary: string;
  entries?: SRTEntry[];  // 可選，從 SRT 動態提取
}

// ==================== 處理選項 ====================

export interface SegmentationOptions {
  targetSegmentCount?: number;      // 目標段落數量（預設 5-8）
  aiService: 'gemini' | 'openai';
  topicSensitivity?: 'low' | 'medium' | 'high';
  minSegmentLength?: number;        // 最小段落長度（預設 3）
  maxSegmentLength?: number;        // 最大段落長度（預設 30）
}

export interface TranslationOptions {
  sourceLanguage: string;           // 來源語言（'default', 'en', etc.）
  targetLanguage: string;           // 目標語言（'zh-TW', 'ja', etc.）
  aiService: 'gemini' | 'openai';
}

// ==================== API 回應格式 ====================

export interface SegmentationResult {
  videoId: string;
  language: string;
  segments: SegmentsFile;
  summary: SummaryFile;
  urls: {
    srt: string;
    segments: string;
    summary: string;
  };
}

export interface TranslationResult {
  videoId: string;
  original: {
    language: string;
    segments: SegmentsFile;
    summary: SummaryFile;
    urls: {
      srt: string;
      segments: string;
      summary: string;
    };
  };
  translated: {
    language: string;
    segments: SegmentsFile;
    summary: SummaryFile;
    urls: {
      srt: string;
      segments: string;
      summary: string;
    };
  };
}

// ==================== AI 回應格式 ====================

export interface AISegmentationResponse {
  segments: Array<{
    topic: string;
    summary: string;
    startIndex: number;
    endIndex: number;
  }>;
  overallSummary: string;
}

export interface AITranslationResponse {
  overallSummary: string;
  segments: Array<{
    segmentId: string;
    topic: string;
    summary: string;
  }>;
  translations: Array<{
    index: number;
    text: string;
  }>;
}
