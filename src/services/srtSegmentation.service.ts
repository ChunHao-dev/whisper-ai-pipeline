/**
 * SRT 分段服務 (Functional Programming)
 * 負責 SRT 的智能分段處理
 */

import { 
  ParsedSRT, 
  SegmentsFile, 
  SummaryFile, 
  SegmentationOptions,
  AISegmentationResponse,
  SegmentIndex
} from '../types/srt.types';
import { parseSRT } from '../utils/srt.utils';

// ==================== 純函數：提示詞構建 ====================

/**
 * 根據逐字稿長度計算建議的摘要長度
 */
const calculateSummaryLength = (entryCount: number): { overall: string; segment: string } => {
  // 根據逐字稿條目數量動態調整（縮短版本）
  if (entryCount < 30) {
    // 短影片（< 5 分鐘）
    return {
      overall: '1-2 sentences (30-50 words)',
      segment: '1 sentence (20-30 words)'
    };
  } else if (entryCount < 100) {
    // 中等影片（5-15 分鐘）
    return {
      overall: '2-3 sentences (50-80 words)',
      segment: '1-2 sentences (30-50 words)'
    };
  } else if (entryCount < 200) {
    // 長影片（15-30 分鐘）
    return {
      overall: '3-4 sentences (80-120 words)',
      segment: '2-3 sentences (50-80 words)'
    };
  } else {
    // 超長影片（> 30 分鐘）
    return {
      overall: '4-5 sentences (120-180 words)',
      segment: '3-4 sentences (80-120 words)'
    };
  }
};

/**
 * 構建分段提示詞
 */
const buildSegmentationPrompt = (
  parsed: ParsedSRT,
  options?: Partial<SegmentationOptions>
): string => {
  const targetCount = options?.targetSegmentCount || 6;
  const minLength = options?.minSegmentLength || 3;
  const maxLength = options?.maxSegmentLength || 30;
  
  // 組合所有文本
  const fullText = parsed.entries.map(e => `[${e.index}] ${e.text}`).join('\n');
  
  // 根據逐字稿長度計算摘要長度
  const summaryLengths = calculateSummaryLength(parsed.entryCount);
  
  return `You are an expert content analyst. Analyze the following transcript and segment it into ${targetCount} meaningful sections.

TRANSCRIPT (${parsed.entryCount} entries):
${fullText}

REQUIREMENTS:
1. Create ${targetCount} segments that represent natural topic boundaries
2. Each segment should have ${minLength}-${maxLength} entries
3. Provide a clear topic title for each segment
4. Write a segment summary: ${summaryLengths.segment}
5. Provide an overall summary of the entire content: ${summaryLengths.overall}
6. Ensure all entries are covered (no gaps or overlaps)

RESPONSE FORMAT (JSON):
{
  "overallSummary": "Overall content summary here...",
  "segments": [
    {
      "topic": "Segment topic title",
      "summary": "Detailed segment summary...",
      "startIndex": 1,
      "endIndex": 20
    }
  ]
}

Respond ONLY with valid JSON, no additional text.`;
};

// ==================== AI 調用函數 ====================

/**
 * 調用 Gemini API（支援 local proxy）
 */
const callGemini = async (prompt: string, apiKey: string): Promise<AISegmentationResponse> => {
  // const localEndpoint = process.env.GEMINI_LOCAL_ENDPOINT;
  
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
        temperature: 0.2,
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
  
  console.log('[Gemini] Response (first 300 chars):', text.substring(0, 300));
  
  try {
    return JSON.parse(text);
  } catch (parseError) {
    console.error('=== GEMINI SEGMENTATION JSON PARSE ERROR ===');
    console.error('Error:', parseError);
    console.error('Raw Gemini Response:');
    console.error(text);
    console.error('Response length:', text.length);
    console.error('Error position:', parseError instanceof SyntaxError ? parseError.message : 'Unknown');
    console.error('============================================');
    
    throw new Error(`Gemini segmentation JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\nResponse preview: ${text.substring(0, 500)}...`);
  }
};

/**
 * 調用 OpenAI API
 */
const callOpenAI = async (prompt: string, apiKey: string): Promise<AISegmentationResponse> => {
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
        { role: 'system', content: 'You are an expert content analyst. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error('=== OPENAI SEGMENTATION JSON PARSE ERROR ===');
    console.error('Error:', parseError);
    console.error('Raw OpenAI Response:');
    console.error(content);
    console.error('Response length:', content.length);
    console.error('Error position:', parseError instanceof SyntaxError ? parseError.message : 'Unknown');
    console.error('===========================================');
    
    throw new Error(`OpenAI segmentation JSON parse failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}\nResponse preview: ${content.substring(0, 500)}...`);
  }
};

/**
 * 調用 AI（根據服務類型）
 */
const callAI = async (
  prompt: string,
  aiService: 'gemini' | 'openai'
): Promise<AISegmentationResponse> => {
  const apiKey = aiService === 'gemini' 
    ? process.env.GEMINI_API_KEY || ''
    : process.env.OPENAI_API_KEY || '';
  
  if (!apiKey) {
    throw new Error(`${aiService.toUpperCase()} API key not found in environment variables`);
  }

  return aiService === 'gemini' 
    ? callGemini(prompt, apiKey)
    : callOpenAI(prompt, apiKey);
};

// ==================== 純函數：資料構建 ====================

/**
 * 構建 segments.json
 */
const buildSegmentsFile = (
  videoId: string,
  language: string,
  aiResponse: AISegmentationResponse,
  parsed: ParsedSRT,
  startTime: number
): SegmentsFile => {
  const segments: SegmentIndex[] = aiResponse.segments.map((seg, idx) => {
    const startEntry = parsed.entries.find(e => e.index === seg.startIndex);
    const endEntry = parsed.entries.find(e => e.index === seg.endIndex);
    
    return {
      id: `segment-${idx + 1}`,
      topic: seg.topic,
      startIndex: seg.startIndex,
      endIndex: seg.endIndex,
      timeStart: startEntry?.startTime || '00:00:00,000',
      timeEnd: endEntry?.endTime || '00:00:00,000'
    };
  });

  const totalEntries = segments.reduce((sum, seg) => 
    sum + (seg.endIndex - seg.startIndex + 1), 0
  );

  return {
    videoId,
    language,
    segments,
    metadata: {
      totalSegments: segments.length,
      totalEntries: parsed.entryCount,
      averageSegmentLength: totalEntries / segments.length,
      createdAt: new Date().toISOString()
    }
  };
};

/**
 * 構建 summary.json
 */
const buildSummaryFile = (
  videoId: string,
  language: string,
  aiResponse: AISegmentationResponse,
  aiService: 'gemini' | 'openai',
  startTime: number
): SummaryFile => {
  return {
    videoId,
    language,
    overallSummary: aiResponse.overallSummary,
    segmentSummaries: aiResponse.segments.map((seg, idx) => ({
      segmentId: `segment-${idx + 1}`,
      topic: seg.topic,
      summary: seg.summary
    })),
    metadata: {
      aiService,
      processingTime: Date.now() - startTime,
      createdAt: new Date().toISOString()
    }
  };
};

// ==================== 主要導出函數 ====================

/**
 * 執行 SRT 分段處理
 */
export const segmentSRT = async (
  srtContent: string,
  videoId: string,
  language: string,
  options?: Partial<SegmentationOptions>
): Promise<{ segments: SegmentsFile; summary: SummaryFile }> => {
  const startTime = Date.now();
  const aiService = options?.aiService || 'gemini';
  
  // 1. 解析 SRT
  const parsed = parseSRT(srtContent);
  console.log(`[Segmentation] Parsed ${parsed.entryCount} SRT entries`);
  
  // 2. 準備 AI 提示詞
  const prompt = buildSegmentationPrompt(parsed, options);
  
  // 3. 調用 AI 進行分段
  const aiResponse = await callAI(prompt, aiService);
  
  // 4. 驗證分段覆蓋率
  const coveredIndices = new Set<number>();
  for (const segment of aiResponse.segments) {
    for (let i = segment.startIndex; i <= segment.endIndex; i++) {
      coveredIndices.add(i);
    }
  }
  
  const allIndices = new Set(parsed.entries.map(e => e.index));
  const missingIndices = [...allIndices].filter(i => !coveredIndices.has(i));
  const duplicateIndices = [...coveredIndices].filter(i => !allIndices.has(i));
  
  if (missingIndices.length > 0) {
    console.warn(`[Segmentation] Warning: ${missingIndices.length} entries not covered by AI segmentation:`, missingIndices);
  }
  
  if (duplicateIndices.length > 0) {
    console.warn(`[Segmentation] Warning: ${duplicateIndices.length} invalid indices in AI response:`, duplicateIndices);
  }
  
  const coverageRate = (coveredIndices.size / allIndices.size) * 100;
  console.log(`[Segmentation] Coverage rate: ${coverageRate.toFixed(1)}% (${coveredIndices.size}/${allIndices.size})`);
  
  // 5. 構建 segments.json
  const segments = buildSegmentsFile(
    videoId,
    language,
    aiResponse,
    parsed,
    startTime
  );
  
  // 6. 構建 summary.json
  const summary = buildSummaryFile(
    videoId,
    language,
    aiResponse,
    aiService,
    startTime
  );
  
  return { segments, summary };
};
