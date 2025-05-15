import express, { Request, Response } from 'express';
import cors from 'cors';
import { join } from 'path';
import multer from 'multer';
import fs from 'fs/promises';
import { whisperService } from './services/whisper.service';
import { WhisperParams } from './types/whisper.types';
import { TranscribeResponse, ErrorResponse } from './types/api.types';

const app = express();
app.use(cors());
app.use(express.json());

// 配置 multer
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (_req, file, cb) => {
    // 檢查檔案類型
    const validMimeTypes = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/vnd.wave'
    ];

    if (validMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只接受 WAV 檔案'));
    }
  }
});

// 基本健康檢查
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK' });
});

// 轉錄 API - 檔案上傳版本
app.post('/api/transcribe', upload.single('audio'), async (req: Request, res: Response<TranscribeResponse | ErrorResponse>): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: '必須提供音檔' });
    return;
  }

  const tempFilePath = req.file.path;

  try {
    const params: WhisperParams = {
      language: 'zh',
      model: join(process.cwd(), 'models/ggml-large-v3-turbo.bin'),
      use_gpu: true,
      fname_inp: tempFilePath,
      no_prints: true,
      flash_attn: false,
      comma_in_time: false,
      translate: false,
      no_timestamps: false,
      audio_ctx: 0,
      max_len: 0,
      progress_callback: (progress) => {
        console.log(`進度: ${progress}%`);
      }
    };

    console.log('開始處理音檔:', tempFilePath);
    const result = await whisperService.transcribe(params);
    res.json(result);

  } catch (error) {
    console.error('轉錄失敗:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : '未知錯誤' });

  } finally {
    // 清理暫存檔案
    try {
      await fs.unlink(tempFilePath);
      console.log('已清理暫存檔案:', tempFilePath);
    } catch (error) {
      console.error('清理暫存檔案失敗:', error);
    }
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`伺服器運行在 http://localhost:${port}`);
});
