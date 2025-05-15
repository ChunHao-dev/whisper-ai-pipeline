const path = require('path');
const { whisper } = require(path.join(__dirname, '../Release/addon.node'));
const { promisify } = require('util');

const whisperAsync = promisify(whisper);

module.exports = {
  transcribe: async (params) => {
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
};
