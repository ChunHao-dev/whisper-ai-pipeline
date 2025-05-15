import { join } from 'path';
import { promisify } from 'util';
import { WhisperParams, WhisperResult } from '../types/whisper.types';

// 由於 require 是 CommonJS 的語法，這裡使用 import 的替代方案
const addon = require(join(__dirname, '../../Release/addon.node'));
const whisperAsync = promisify(addon.whisper);

export class WhisperService {
  async transcribe(params: WhisperParams): Promise<WhisperResult> {
    try {
      console.log('開始轉錄，參數:', params);
      const result = await whisperAsync(params);
      console.log('轉錄完成');
      return result;
    } catch (error) {
      console.error('轉錄過程發生錯誤:', error);
      throw error;
    }
  }
}

// 導出單例實例
export const whisperService = new WhisperService();
