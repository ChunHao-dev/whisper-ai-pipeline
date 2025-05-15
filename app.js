const express = require('express');
const cors = require('cors');
const path = require('path');
const { transcribe } = require('./src/whisper');

const app = express();
app.use(cors());
app.use(express.json());

// 基本健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// 轉錄 API
app.post('/api/transcribe', async (req, res) => {
  try {
    if (!req.body.audioPath) {
      throw new Error('必須提供音檔路徑');
    }

    const params = {
      language: 'en',
      model: path.join(__dirname, 'models/ggml-large-v3-turbo.bin'),
      fname_inp: req.body.audioPath,
      use_gpu: true,
      flash_attn: false,
      no_prints: true,
      comma_in_time: false,
      translate: false,
      no_timestamps: false,
      audio_ctx: 0,
      max_len: 0,
      progress_callback: (progress) => {
        console.log(`progress: ${progress}%`);
      }
    };

    console.log('使用音檔路徑:', params.fname_inp);

    const result = await transcribe(params);
    res.json(result);
  } catch (error) {
    console.error('轉錄失敗:', error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`伺服器運行在 http://localhost:${port}`);
});
