/**
 * Transcription Domain Entity - 轉錄相關的核心業務邏輯
 * 包含轉錄片段、句子、結果等實體和純函數
 */

// ===== Domain Entities =====

export interface TranscriptionSegment {
  readonly id: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly words?: TranscriptionWord[];
  readonly confidence?: number;
}

export interface TranscriptionWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly probability?: number;
}

export interface TranscriptionSentence {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly index: number;
  readonly srtTimestamp: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface Transcription {
  readonly id: string;
  readonly text: string;
  readonly language: string;
  readonly segments: TranscriptionSegment[];
  readonly sentences: TranscriptionSentence[];
  readonly duration: number;
  readonly wordCount: number;
  readonly createdAt: Date;
}

export interface TranscriptionResult {
  readonly success: boolean;
  readonly transcription?: Transcription;
  readonly srtContent?: string;
  readonly srtPath?: string;
  readonly error?: string;
}

// ===== Factory Functions =====

export const createTranscriptionWord = (
  word: string,
  start: number,
  end: number,
  probability?: number
): TranscriptionWord => ({
  word: word.trim(),
  start: Math.max(0, start),
  end: Math.max(start, end),
  probability
});

export const createTranscriptionSegment = (
  id: number,
  start: number,
  end: number,
  text: string,
  words?: TranscriptionWord[],
  confidence?: number
): TranscriptionSegment => ({
  id: Math.max(0, id),
  start: Math.max(0, start),
  end: Math.max(start, end),
  text: text.trim(),
  words,
  confidence
});

export const createTranscription = (
  id: string,
  text: string,
  language: string,
  segments: TranscriptionSegment[]
): Transcription => {
  const sentences = generateSentencesFromSegments(segments);
  const duration = calculateTranscriptionDuration(segments);
  const wordCount = countWords(text);

  return {
    id,
    text: text.trim(),
    language,
    segments,
    sentences,
    duration,
    wordCount,
    createdAt: new Date()
  };
};

// ===== Pure Business Logic Functions =====

/**
 * 計算轉錄總時長（秒）
 */
export const calculateTranscriptionDuration = (segments: TranscriptionSegment[]): number => {
  if (segments.length === 0) return 0;
  
  const lastSegment = segments[segments.length - 1];
  return Math.max(0, lastSegment.end);
};

/**
 * 計算字數
 */
export const countWords = (text: string): number => {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
};

/**
 * 估算閱讀時間（分鐘）
 */
export const estimateReadingTime = (wordCount: number): number => {
  const wordsPerMinute = 200;
  return Math.ceil(wordCount / wordsPerMinute);
};

/**
 * 檢查轉錄是否有效
 */
export const isValidTranscription = (transcription: Transcription): boolean => {
  return transcription.text.trim().length > 0 && 
         transcription.segments.length > 0 &&
         transcription.duration > 0;
};

/**
 * 過濾空白和無效片段
 */
export const filterValidSegments = (segments: TranscriptionSegment[]): TranscriptionSegment[] => {
  return segments.filter(segment => 
    segment.text.trim().length > 0 &&
    segment.end > segment.start &&
    segment.start >= 0
  );
};

/**
 * 格式化時間為 SRT 格式 (HH:MM:SS,mmm)
 */
export const formatSrtTime = (seconds: number): string => {
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
};

/**
 * 從轉錄片段生成句子
 */
export const generateSentencesFromSegments = (segments: TranscriptionSegment[]): TranscriptionSentence[] => {
  if (segments.length === 0) return [];

  const sentences: TranscriptionSentence[] = [];
  let currentWords: TranscriptionWord[] = [];
  let sentenceIndex = 1;

  // 句子結束標點
  const sentenceEndPunctuation = '.!?。！？；;';

  // 從所有片段收集詞彙
  const allWords: TranscriptionWord[] = [];
  segments.forEach(segment => {
    if (segment.words && segment.words.length > 0) {
      allWords.push(...segment.words);
    }
  });

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    
    // 跳過空白詞彙
    if (!word.word.trim()) continue;

    currentWords.push(word);

    // 檢查是否需要結束當前句子
    let shouldEndSentence = false;

    // 檢查句子結束標點
    if (sentenceEndPunctuation.split('').some(punct => word.word.includes(punct))) {
      shouldEndSentence = true;
    }

    // 如果是最後一個詞，也要結束句子
    if (i === allWords.length - 1) {
      shouldEndSentence = true;
    }

    if (shouldEndSentence && currentWords.length > 0) {
      const sentenceText = currentWords.map(w => w.word).join(' ')
        .replace(/\s+/g, ' ').trim();

      const startTime = currentWords[0].start;
      const endTime = currentWords[currentWords.length - 1].end;

      const startTimeStr = formatSrtTime(startTime);
      const endTimeStr = formatSrtTime(endTime);
      const srtTimestamp = `${startTimeStr} --> ${endTimeStr}`;

      const sentence: TranscriptionSentence = {
        text: sentenceText,
        start: startTime,
        end: endTime,
        index: sentenceIndex,
        srtTimestamp,
        startTime: startTimeStr,
        endTime: endTimeStr
      };

      sentences.push(sentence);
      sentenceIndex++;
      currentWords = [];
    }
  }

  return sentences;
};

/**
 * 生成 SRT 格式內容
 */
export const generateSrtContent = (sentences: TranscriptionSentence[]): string => {
  if (sentences.length === 0) return '';

  const srtLines: string[] = [];

  sentences.forEach(sentence => {
    srtLines.push(sentence.index.toString());
    srtLines.push(sentence.srtTimestamp);
    srtLines.push(sentence.text);
    srtLines.push(''); // 空行分隔
  });

  return srtLines.join('\n');
};

/**
 * 從片段生成 SRT 內容（備用方案）
 */
export const generateSrtFromSegments = (segments: TranscriptionSegment[]): string => {
  if (segments.length === 0) return '';

  const srtLines: string[] = [];

  segments.forEach((segment, index) => {
    const startTime = formatSrtTime(segment.start);
    const endTime = formatSrtTime(segment.end);
    
    srtLines.push((index + 1).toString());
    srtLines.push(`${startTime} --> ${endTime}`);
    srtLines.push(segment.text.trim());
    srtLines.push('');
  });

  return srtLines.join('\n');
};

/**
 * 清理和標準化轉錄文字
 */
export const cleanTranscriptionText = (text: string): string => {
  return text
    .replace(/\s+/g, ' ')           // 多空格變單空格
    .replace(/\n+/g, ' ')           // 換行變空格
    .replace(/[^\w\s\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff.,!?;:'"()[\]{}-]/g, '') // 保留基本標點和中日文
    .trim();
};

/**
 * 合併相鄰的短片段
 */
export const mergeShortSegments = (
  segments: TranscriptionSegment[], 
  minDuration: number = 0.5
): TranscriptionSegment[] => {
  if (segments.length === 0) return [];

  const merged: TranscriptionSegment[] = [];
  let currentSegment = segments[0];

  for (let i = 1; i < segments.length; i++) {
    const nextSegment = segments[i];
    const currentDuration = currentSegment.end - currentSegment.start;

    if (currentDuration < minDuration) {
      // 合併到下一個片段
      currentSegment = createTranscriptionSegment(
        currentSegment.id,
        currentSegment.start,
        nextSegment.end,
        `${currentSegment.text} ${nextSegment.text}`.trim()
      );
    } else {
      merged.push(currentSegment);
      currentSegment = nextSegment;
    }
  }

  merged.push(currentSegment);
  return merged;
};