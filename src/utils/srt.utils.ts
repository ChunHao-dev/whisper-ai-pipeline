/**
 * SRT 解析和處理工具函數
 */

import { SRTEntry, ParsedSRT } from '../types/srt.types';

/**
 * 解析 SRT 內容為結構化資料
 */
export function parseSRT(srtContent: string): ParsedSRT {
  const entries: SRTEntry[] = [];
  
  // 按空行分割
  const blocks = srtContent.trim().split(/\n\s*\n/);
  
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    
    if (lines.length < 3) continue;
    
    // 第一行：索引
    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;
    
    // 第二行：時間軸
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    
    if (!timeMatch) continue;
    
    const startTime = timeMatch[1];
    const endTime = timeMatch[2];
    
    // 第三行及之後：文本內容
    const text = lines.slice(2).join('\n');
    
    entries.push({
      index,
      startTime,
      endTime,
      text
    });
  }
  
  // 計算總時長
  const totalDuration = entries.length > 0 
    ? entries[entries.length - 1].endTime 
    : '00:00:00,000';
  
  return {
    entries,
    totalDuration,
    entryCount: entries.length
  };
}

/**
 * 將 SRTEntry 陣列轉換回 SRT 格式字串
 */
export function entriesToSRT(entries: SRTEntry[]): string {
  return entries.map(entry => 
    `${entry.index}\n${entry.startTime} --> ${entry.endTime}\n${entry.text}`
  ).join('\n\n') + '\n';
}

/**
 * 根據索引範圍提取 SRT 條目
 */
export function extractEntriesByRange(
  entries: SRTEntry[], 
  startIndex: number, 
  endIndex: number
): SRTEntry[] {
  return entries.filter(
    entry => entry.index >= startIndex && entry.index <= endIndex
  );
}

/**
 * 驗證 SRT 格式是否正確
 */
export function validateSRT(srtContent: string): { valid: boolean; error?: string } {
  try {
    const parsed = parseSRT(srtContent);
    
    if (parsed.entries.length === 0) {
      return { valid: false, error: 'No valid SRT entries found' };
    }
    
    // 檢查索引連續性
    for (let i = 0; i < parsed.entries.length; i++) {
      if (parsed.entries[i].index !== i + 1) {
        return { 
          valid: false, 
          error: `Index mismatch at entry ${i + 1}: expected ${i + 1}, got ${parsed.entries[i].index}` 
        };
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown parsing error' 
    };
  }
}

/**
 * 時間字串轉換為毫秒
 */
export function timeToMs(timeStr: string): number {
  const match = timeStr.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) return 0;
  
  const [, hours, minutes, seconds, ms] = match;
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(ms)
  );
}

/**
 * 毫秒轉換為 SRT 時間格式
 */
export function msToTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}
