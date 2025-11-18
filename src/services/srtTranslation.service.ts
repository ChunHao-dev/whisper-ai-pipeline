/**
 * SRT 翻譯服務 (Functional Programming)
 */

import { 
  SRTEntry,
  SegmentsFile, 
  SummaryFile,
  AITranslationResponse
} from '../types/srt.types';
import { parseSRT, entriesToSRT } from '../utils/srt.utils';

// ==================== 提示詞構建 ====================

const buildTranslationPrompt = (
  entries: SRTEntry[],
  overallSummary: string,
  currentSegmentTopic: string,
  targetLanguage: string
): string => {
  const entriesText = entries.map(e => `[${e.index}] ${e.text}`).join('\n');
  
  return `Translate the following subtitle entries to ${targetLanguage}.

CONTEXT:
Overall Summary: ${overallSummary}
Current Segment Topic: ${currentSegmentTopic}

ENTRIES TO TRANSLATE:
${entriesText}

REQUIREMENTS:
1. Translate each entry accurately
2. Maintain natural flow and context
3. Keep technical terms consistent
4. Preserve the meaning and tone

RESPONSE FORMAT (JSON):
{
  "translations": [
    { "index": 1, "text": "translated text" }
  ]
}

Respond ONLY with valid JSON.`;
};

const buildSummaryTranslationPrompt = (
  summary: SummaryFile,
  targetLanguage: string
): string => {
  const segmentsText = summary.segmentSummaries
    .map(s => `[${s.segmentId}] ${s.topic}\n${s.summary}`)
    .join('\n\n');
  
  return `Translate the following content summary to ${targetLanguage}.

OVERALL SUMMARY:
${summary.overallSummary}

SEGMENT SUMMARIES:
${segmentsText}

RESPONSE FORMAT (JSON):
{
  "overallSummary": "translated overall summary",
  "segments": [
    {
      "segmentId": "segment-1",
      "topic": "translated topic",
      "summary": "translated summary"
    }
  ]
}

Respond ONLY with valid JSON.`;
};

// ==================== AI 調用 ====================

const callGeminiTranslation = async (
  prompt: string,
  apiKey: string
): Promise<any> => {
  const localEndpoint = process.env.GEMINI_LOCAL_ENDPOINT;
  
  // 使用 gemini-2.5-flash
  const url = localEndpoint 
    ? `${localEndpoint}/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
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
        maxOutputTokens: 8192,
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
  
  // 直接解析 JSON
  return JSON.parse(text);
};

const callOpenAITranslation = async (
  prompt: string,
  apiKey: string
): Promise<any> => {
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
        { role: 'system', content: 'You are a professional translator. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
  
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
};

const callAITranslation = async (
  prompt: string,
  aiService: 'gemini' | 'openai'
): Promise<any> => {
  const apiKey = aiService === 'gemini' 
    ? process.env.GEMINI_API_KEY || ''
    : process.env.OPENAI_API_KEY || '';
  
  if (!apiKey) throw new Error(`${aiService.toUpperCase()} API key not found`);
  
  return aiService === 'gemini' 
    ? callGeminiTranslation(prompt, apiKey)
    : callOpenAITranslation(prompt, apiKey);
};

// ==================== 主要導出函數 ====================

/**
 * 翻譯 SRT 內容（基於分段）
 */
export const translateSRT = async (
  srtContent: string,
  segments: SegmentsFile,
  summary: SummaryFile,
  targetLanguage: string,
  aiService: 'gemini' | 'openai' = 'gemini'
): Promise<{ translatedSRT: string; translatedSegments: SegmentsFile; translatedSummary: SummaryFile }> => {
  const startTime = Date.now();
  const parsed = parseSRT(srtContent);
  
  console.log(`[Translation] Translating ${parsed.entryCount} entries to ${targetLanguage}`);
  
  // 1. 翻譯摘要
  const summaryPrompt = buildSummaryTranslationPrompt(summary, targetLanguage);
  const translatedSummaryData = await callAITranslation(summaryPrompt, aiService);
  
  // 2. 逐段翻譯 SRT
  const translatedEntries: SRTEntry[] = [];
  
  for (const segment of segments.segments) {
    const segmentEntries = parsed.entries.filter(
      e => e.index >= segment.startIndex && e.index <= segment.endIndex
    );
    
    const prompt = buildTranslationPrompt(
      segmentEntries,
      summary.overallSummary,
      segment.topic,
      targetLanguage
    );
    
    const result = await callAITranslation(prompt, aiService);
    
    // 合併翻譯結果
    for (const trans of result.translations) {
      const originalEntry = segmentEntries.find(e => e.index === trans.index);
      if (originalEntry) {
        translatedEntries.push({
          ...originalEntry,
          text: trans.text
        });
      }
    }
    
    console.log(`[Translation] Translated segment ${segment.id}`);
  }
  
  // 3. 構建翻譯後的檔案
  const translatedSRT = entriesToSRT(translatedEntries);
  
  const translatedSegments: SegmentsFile = {
    ...segments,
    language: targetLanguage,
    metadata: {
      ...segments.metadata,
      translatedFrom: segments.language,
      createdAt: new Date().toISOString()
    }
  };
  
  translatedSegments.segments = translatedSegments.segments.map((seg, idx) => ({
    ...seg,
    topic: translatedSummaryData.segments[idx]?.topic || seg.topic
  }));
  
  const translatedSummary: SummaryFile = {
    videoId: summary.videoId,
    language: targetLanguage,
    overallSummary: translatedSummaryData.overallSummary,
    segmentSummaries: translatedSummaryData.segments,
    metadata: {
      aiService,
      processingTime: Date.now() - startTime,
      translatedFrom: summary.language,
      createdAt: new Date().toISOString()
    }
  };
  
  return { translatedSRT, translatedSegments, translatedSummary };
};
