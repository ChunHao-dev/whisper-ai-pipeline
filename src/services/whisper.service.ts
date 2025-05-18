import { promisify } from 'util';
import { join } from 'path';
import { WhisperParams, WhisperResult } from '../types/whisper.types';

// 使用 require 導入 C++ addon
const addon = require(join(__dirname, '../../Release/addon.node'));
const whisperAsync = promisify(addon.whisper);

// 轉錄函數
export const transcribe = async (params: WhisperParams): Promise<WhisperResult> => {
  try {
    console.log('開始轉錄，參數:', params);
    const result = await whisperAsync(params);
    console.log('轉錄完成');
    return result;
  } catch (error) {
    console.error('轉錄過程發生錯誤:', error);
    throw error;
  }
};

// 導出所有功能
export const whisperService = {
  transcribe
};
