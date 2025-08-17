import { formatTimestamp } from './time.utils';

export interface WordSegment {
  text: string;
  t0: number;
  t1: number;
}

export interface SentenceSegment {
  text: string;
  start: number;
  end: number;
  index: number;
  srtTimestamp: string;
  startTime: string;
  endTime: string;
}

/**
 * 將 word-level segments 組合成句子
 * 使用標點符號檢測句子邊界
 */
export function combineWordsToSentences(wordSegments: WordSegment[]): SentenceSegment[] {
  if (!wordSegments.length) return [];

  const sentences: SentenceSegment[] = [];
  let currentSentence: WordSegment[] = [];
  let sentenceIndex = 1;

  // 句子結束的標點符號（支援中英文）
  const sentenceEndPunctuation = /[.!?。！？；;]/;
  
  // 逗號和其他停頓符號
  const pausePunctuation = /[,，、]/;

  for (let i = 0; i < wordSegments.length; i++) {
    const segment = wordSegments[i];
    const trimmedText = segment.text.trim();
    
    // 跳過空白的 segment
    if (!trimmedText) continue;

    currentSentence.push(segment);

    // 檢查是否為句子結尾
    const shouldEndSentence = 
      sentenceEndPunctuation.test(trimmedText) || // 遇到句號、問號、驚嘆號
      i === wordSegments.length - 1; // 最後一個詞

    if (shouldEndSentence && currentSentence.length > 0) {
      // 建立句子
      const sentenceText = currentSentence
        .map(s => s.text.trim())
        .filter(text => text.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ') // 移除多餘空格
        .trim();

      if (sentenceText) {
        const startTime = currentSentence[0].t0;
        const endTime = currentSentence[currentSentence.length - 1].t1;

        sentences.push({
          text: sentenceText,
          start: startTime,
          end: endTime,
          index: sentenceIndex++,
          srtTimestamp: `${formatTimestamp(startTime)} --> ${formatTimestamp(endTime)}`,
          startTime: formatTimestamp(startTime),
          endTime: formatTimestamp(endTime)
        });
      }

      currentSentence = [];
    }
  }

  // 處理剩餘的詞（如果有的話）
  if (currentSentence.length > 0) {
    const sentenceText = currentSentence
      .map(s => s.text.trim())
      .filter(text => text.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (sentenceText) {
      const startTime = currentSentence[0].t0;
      const endTime = currentSentence[currentSentence.length - 1].t1;

      sentences.push({
        text: sentenceText,
        start: startTime,
        end: endTime,
        index: sentenceIndex++,
        srtTimestamp: `${formatTimestamp(startTime)} --> ${formatTimestamp(endTime)}`,
        startTime: formatTimestamp(startTime),
        endTime: formatTimestamp(endTime)
      });
    }
  }

  return sentences;
}

/**
 * 將句子轉換為 SRT 格式字符串
 */
export function generateSrtFromSentences(sentences: SentenceSegment[]): string {
  return sentences
    .map(sentence => 
      `${sentence.index}\n${sentence.srtTimestamp}\n${sentence.text}\n`
    )
    .join('\n');
}

/**
 * 將 normal 模式的 segments 直接轉換為 SRT 格式
 */
export function generateSrtFromSegments(segments: Array<{text: string; start: number; end: number}>): string {
  console.log(`[SRT] Processing ${segments.length} segments for SRT generation`);
  
  if (!segments || segments.length === 0) {
    console.warn('[SRT] No segments provided, returning empty SRT');
    return '';
  }
  
  const srtContent = segments
    .map((segment, index) => {
      console.log(`[SRT] Segment ${index + 1}: "${segment.text}" (${segment.start} - ${segment.end})`);
      return `${index + 1}\n${formatTimestamp(segment.start)} --> ${formatTimestamp(segment.end)}\n${segment.text.trim()}\n`;
    })
    .join('\n');
    
  console.log(`[SRT] Generated SRT content length: ${srtContent.length}`);
  return srtContent;
}
