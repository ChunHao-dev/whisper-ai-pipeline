/**
 * 語言分級分析相關型別定義
 */

// ==================== 語言等級定義 ====================

export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type LevelRange = `${LanguageLevel}-${LanguageLevel}`;

// ==================== 詞彙分析 ====================

export interface VocabularyItem {
  word: string;
  indices: number[];              // 出現的句子索引
  frequency: number;              // 在該影片中的頻率
  context?: string;               // 簡短語境
  difficulty?: number;            // 1-10 難度評分
}

export interface PhraseItem {
  phrase: string;
  indices: number[];
  frequency: number;
  type: 'idiom' | 'collocation' | 'expression' | 'grammar_pattern';
  explanation?: string;           // 片語解釋
}

export interface LevelVocabulary {
  level: LanguageLevel;
  words: VocabularyItem[];
  phrases: PhraseItem[];
}

// ==================== 語言分析結果 ====================

export interface LanguageAnalysis {
  videoId: string;
  overallLevel: LevelRange;       // "B1-B2"
  primaryLevel: LanguageLevel;    // "B1" 
  confidence: number;             // 0-1 分析信心度
  
  levelDistribution: Record<LanguageLevel, number>; // 各級別佔比
  
  vocabulary: LevelVocabulary[];  // 按級別分組的詞彙
  
  complexity: {
    sentenceLength: number;       // 平均句長
    grammarComplexity: number;    // 語法複雜度 1-10
    topicSpecificity: number;     // 主題專業度 1-10
  };
  
  metadata: {
    totalSentences: number;
    analyzedAt: string;
    aiService: 'gemini' | 'openai';
    processingTime: number;
  };
}

// ==================== 學習輔助資訊 ====================

export interface LearningMetadata {
  languageLevel: LanguageAnalysis;
  
  learningFeatures: {
    recommendedFor: string[];     // ["intermediate", "business-english"]
    keyTopics: string[];          // ["technology", "startup", "sales"]
    grammarPoints: string[];      // ["conditional-sentences", "passive-voice"]
    culturalReferences: number;   // 文化背景需求程度 1-5
    speakingSpeed: 'slow' | 'normal' | 'fast';
  };
  
  studyGuide: {
    preparationWords: string[];   // 觀看前建議預習的單字
    focusSegments: number[];      // 重點學習的段落索引
    reviewPoints: string[];       // 觀看後複習重點
    estimatedStudyTime: number;   // 建議學習時間（分鐘）
  };
}

// ==================== 分析選項 ====================

export interface AnalysisOptions {
  aiService: 'gemini' | 'openai';
  maxWordsPerLevel?: number;      // 每個級別最多提取多少單字（預設20）
  maxPhrasesPerLevel?: number;    // 每個級別最多提取多少片語（預設20）
  targetLevels?: LanguageLevel[]; // 只提取指定級別的詞彙
}

// ==================== API 請求/回應 ====================

export interface BatchAnalyzeRequest {
  videoIds?: string[];            // 指定影片，空則分析所有未分級影片
  forceReanalyze?: boolean;       // 強制重新分析已分級影片
  aiService?: 'gemini' | 'openai';
  maxWordsPerLevel?: number;
  maxPhrasesPerLevel?: number;
}

export interface BatchAnalysisResult {
  processedVideos: number;
  results: Array<{
    videoId: string;
    success: boolean;
    analysis?: LanguageAnalysis;
    learningMetadata?: LearningMetadata;
    error?: string;
  }>;
  summary: {
    totalProcessed: number;
    successful: number;
    failed: number;
    processingTime: number;
  };
}

// ==================== AI 回應格式 ====================

export interface AILanguageAnalysisResponse {
  overallLevel: LevelRange;
  primaryLevel: LanguageLevel;
  confidence: number;
  levelDistribution: Record<LanguageLevel, number>;
  vocabulary: LevelVocabulary[];
  complexity: {
    sentenceLength: number;
    grammarComplexity: number;
    topicSpecificity: number;
  };
}

// ==================== 更新 VideoList 格式 ====================

export interface VideoMetadataWithLanguage {
  videoId: string;
  title: string;
  description: string;
  duration: number;
  uploader: string;
  view_count: number;
  
  // 新增語言分級資訊
  languageAnalysis?: {
    level: LevelRange;
    primaryLevel: LanguageLevel;
    confidence: number;
    analyzedAt: string;
    keyTopics: string[];
    recommendedFor: string[];
  };
}