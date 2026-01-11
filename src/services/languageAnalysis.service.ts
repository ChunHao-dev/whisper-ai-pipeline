/**
 * 語言分級分析服務 - 函數式設計
 */

import { 
  LanguageAnalysis, 
  LearningMetadata, 
  VocabularyItem,
  PhraseItem,
  LevelVocabulary,
  LanguageLevel,
  AnalysisOptions,
  AILanguageAnalysisResponse
} from '../types/languageAnalysis.types';
import { SRTEntry } from '../types/srt.types';

/**
 * 分析 SRT 內容的語言難度
 */
export async function analyzeSRTLanguageLevel(
  videoId: string, 
  srtEntries: SRTEntry[],
  options: AnalysisOptions
): Promise<LanguageAnalysis> {
  
  const startTime = Date.now();
  
  // 準備分析用的文本（去除時間軸）
  const analysisText = prepareSRTForAnalysis(srtEntries);
  
  // 呼叫 AI 進行語言分析
  const aiAnalysis = await callAIForLanguageAnalysis(analysisText, options);
  
  // 處理並結構化結果
  return processAIAnalysisResult(videoId, aiAnalysis, srtEntries, options, startTime);
}

/**
 * 準備 SRT 內容供 AI 分析（去除時間軸）
 */
function prepareSRTForAnalysis(srtEntries: SRTEntry[]): Array<{index: number, text: string}> {
  return srtEntries.map(entry => ({
    index: entry.index,
    text: entry.text.trim()
  }));
}

/**
 * 呼叫 AI 服務進行語言分析
 */
async function callAIForLanguageAnalysis(
  analysisText: Array<{index: number, text: string}>,
  options: AnalysisOptions
): Promise<AILanguageAnalysisResponse> {
  
  const maxWords = options.maxWordsPerLevel || 20;
  const maxPhrases = options.maxPhrasesPerLevel || 20;
  const targetLevels = options.targetLevels || ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  
  const prompt = buildLanguageAnalysisPrompt(
    analysisText, 
    targetLevels, 
    maxWords, 
    maxPhrases
  );
  
  if (options.aiService === 'openai') {
    return callOpenAIForAnalysis(prompt);
  } else {
    return callGeminiForAnalysis(prompt);
  }
}

/**
 * 建構語言分析的 AI Prompt
 */
function buildLanguageAnalysisPrompt(
  analysisText: Array<{index: number, text: string}>,
  targetLevels: LanguageLevel[],
  maxWords: number,
  maxPhrases: number
): string {
  
  const textContent = analysisText.map(item => 
    `${item.index}: ${item.text}`
  ).join('\n');
  
  return `
請分析以下英文字幕內容的語言難度等級，並提取關鍵詞彙：

字幕內容：
${textContent}

請按照以下格式回傳 JSON：

{
  "overallLevel": "B1-B2",
  "primaryLevel": "B1",
  "confidence": 0.85,
  "levelDistribution": {
    "A1": 0.2,
    "A2": 0.3,
    "B1": 0.3,
    "B2": 0.15,
    "C1": 0.05,
    "C2": 0.0
  },
  "vocabulary": [
    {
      "level": "B1",
      "words": [
        {
          "word": "achievement",
          "indices": [5, 12, 28],
          "frequency": 3,
          "context": "personal achievement goal",
          "difficulty": 6
        }
      ],
      "phrases": [
        {
          "phrase": "work-life balance",
          "indices": [15, 22],
          "frequency": 2,
          "type": "collocation",
          "explanation": "平衡工作與生活"
        }
      ]
    }
  ],
  "complexity": {
    "sentenceLength": 12.5,
    "grammarComplexity": 7,
    "topicSpecificity": 6
  }
}

分析要求：
1. 先判斷整體難度範圍（如 B1-B2）和主要難度等級（primaryLevel）
2. 各等級詞彙分佈比例
3. **重要：只提取主要難度等級及以上的詞彙**
   - 如果 primaryLevel 是 B1，則只提取 B1, B2, C1, C2 等級的詞彙
   - 如果 primaryLevel 是 B2，則只提取 B2, C1, C2 等級的詞彙
   - 不要提取低於主要等級的詞彙（避免過多基礎詞彙）
4. 每個等級最多提取 ${maxWords} 個單字和 ${maxPhrases} 個片語
5. 標註每個詞彙出現的句子索引號
6. **context 格式要求：使用 3-6 個詞的簡短關鍵片語，不要完整句子**
   - 好的例子："personal achievement goal", "business meeting context", "technical discussion topic"
   - 避免："This is a sentence about personal achievement in the workplace"
7. 評估句子長度、語法複雜度、主題專業度（1-10分）
8. 片語類型：idiom（慣用語）、collocation（搭配詞）、expression（表達方式）、grammar_pattern（語法句型）

**重要格式要求：**
- vocabulary 必須是陣列格式，每個元素包含 level, words, phrases
- 不要使用物件格式如 {"B1": {...}, "B2": {...}}
- 必須使用陣列格式如 [{"level": "B1", "words": [...], "phrases": [...]}, {"level": "B2", ...}]

請確保回傳有效的 JSON 格式。
`;
}

/**
 * 呼叫 OpenAI API
 */
async function callOpenAIForAnalysis(prompt: string): Promise<AILanguageAnalysisResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const url = 'https://api.openai.com/v1/chat/completions';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an expert English language teacher and linguist. Analyze text difficulty levels according to CEFR standards. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  console.log('[OpenAI] Language Analysis Response (first 300 chars):', content.substring(0, 300));
  
  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('=== OPENAI LANGUAGE ANALYSIS JSON PARSE ERROR ===');
    console.error('Error:', parseError);
    console.error('Raw OpenAI Response:');
    console.error(content);
    console.error('Response length:', content.length);
    console.error('===============================================');
    
    throw new Error(`OpenAI language analysis JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\nResponse preview: ${content.substring(0, 500)}...`);
  }
}

/**
 * 呼叫 Gemini API  
 */
async function callGeminiForAnalysis(prompt: string): Promise<AILanguageAnalysisResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  // 使用 gemini-2.5-flash-lite（免費版本，速率限制更寬鬆）
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16000,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  
  console.log('[Gemini] Language Analysis Response (first 300 chars):', text.substring(0, 300));
  
  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error('=== GEMINI LANGUAGE ANALYSIS JSON PARSE ERROR ===');
    console.error('Error:', parseError);
    console.error('Raw Gemini Response:');
    console.error(text);
    console.error('Response length:', text.length);
    console.error('===============================================');
    
    throw new Error(`Gemini language analysis JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\nResponse preview: ${text.substring(0, 500)}...`);
  }
}

/**
 * 處理 AI 分析結果
 */
function processAIAnalysisResult(
  videoId: string,
  aiResult: AILanguageAnalysisResponse,
  originalEntries: SRTEntry[],
  options: AnalysisOptions,
  startTime: number
): LanguageAnalysis {
  
  return {
    videoId,
    overallLevel: aiResult.overallLevel,
    primaryLevel: aiResult.primaryLevel,
    confidence: aiResult.confidence,
    levelDistribution: aiResult.levelDistribution,
    vocabulary: aiResult.vocabulary,
    complexity: aiResult.complexity,
    metadata: {
      totalSentences: originalEntries.length,
      analyzedAt: new Date().toISOString(),
      aiService: options.aiService,
      processingTime: Date.now() - startTime
    }
  };
}

/**
 * 生成學習輔助資訊
 */
export async function generateLearningMetadata(analysis: LanguageAnalysis): Promise<LearningMetadata> {
  
  // 根據分析結果生成學習建議
  const recommendedFor = determineRecommendedAudience(analysis);
  const keyTopics = extractKeyTopics(analysis);
  const grammarPoints = identifyGrammarPoints(analysis);
  
  return {
    languageLevel: analysis,
    learningFeatures: {
      recommendedFor,
      keyTopics,
      grammarPoints,
      culturalReferences: assessCulturalReferences(analysis),
      speakingSpeed: determineSpeakingSpeed(analysis)
    },
    studyGuide: {
      preparationWords: selectPreparationWords(analysis),
      focusSegments: identifyFocusSegments(analysis),
      reviewPoints: generateReviewPoints(analysis),
      estimatedStudyTime: calculateStudyTime(analysis)
    }
  };
}

// ==================== 輔助函數 ====================

function determineRecommendedAudience(analysis: LanguageAnalysis): string[] {
  const audience: string[] = [];
  
  if (analysis.primaryLevel === 'A1' || analysis.primaryLevel === 'A2') {
    audience.push('beginner');
  } else if (analysis.primaryLevel === 'B1' || analysis.primaryLevel === 'B2') {
    audience.push('intermediate');
  } else {
    audience.push('advanced');
  }
  
  // 根據複雜度添加更多標籤
  if (analysis.complexity.topicSpecificity > 7) {
    audience.push('professional');
  }
  
  return audience;
}

function extractKeyTopics(analysis: LanguageAnalysis): string[] {
  // TODO: 基於詞彙分析提取主題
  return [];
}

function identifyGrammarPoints(analysis: LanguageAnalysis): string[] {
  // TODO: 基於複雜度分析識別語法重點
  return [];
}

function assessCulturalReferences(analysis: LanguageAnalysis): number {
  // TODO: 評估文化背景需求
  return 3;
}

function determineSpeakingSpeed(analysis: LanguageAnalysis): 'slow' | 'normal' | 'fast' {
  // TODO: 基於句子長度和複雜度判斷語速
  return 'normal';
}

function selectPreparationWords(analysis: LanguageAnalysis): string[] {
  // 選擇高頻且重要的詞彙作為預習重點
  const allWords: VocabularyItem[] = [];
  analysis.vocabulary.forEach(level => {
    allWords.push(...level.words);
  });
  
  return allWords
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10)
    .map(word => word.word);
}

function identifyFocusSegments(analysis: LanguageAnalysis): number[] {
  // TODO: 識別重點學習段落
  return [];
}

function generateReviewPoints(analysis: LanguageAnalysis): string[] {
  // TODO: 生成複習重點
  return [];
}

function calculateStudyTime(analysis: LanguageAnalysis): number {
  // 基於複雜度和長度估算學習時間
  const baseTime = analysis.metadata.totalSentences * 0.5; // 每句0.5分鐘
  const complexityMultiplier = analysis.complexity.grammarComplexity / 5;
  
  return Math.round(baseTime * complexityMultiplier);
}