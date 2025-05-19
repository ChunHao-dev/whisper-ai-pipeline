# Whisper CPP Node.js 後端服務 - 實作計畫

## 1. 環境設置

### 1.1 Node.js 環境
- Node.js 版本: v20.x
- npm 版本: 10.x

### 1.2 必要套件
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "multer": "^1.4.5-lts.1",
    "node-addon-api": "^7.0.0",
    "node-gyp": "^10.0.1",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "typescript": "^5.3.2",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.10.0",
    "nodemon": "^3.0.1",
    "ts-node": "^10.9.1",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.10",
    "supertest": "^6.3.3",
    "@types/supertest": "^2.0.16"
  }
}
```

## 2. 專案結構設置

```plaintext
whisperCPPNodeJS/
├── src/
│   ├── addon/           # 使用現有的 addon.node
│   │   └── index.js     # addon.node 的封裝
│   ├── config/         # 設定檔
│   │   ├── config.ts
│   │   └── socket.ts    # Socket.IO 配置
│   ├── services/       # 服務層
│   │   ├── whisper.service.ts
│   │   └── transcription.service.ts
│   ├── socket/         # Socket.IO 處理
│   │   ├── handlers/
│   │   │   └── transcription.handler.ts
│   │   └── events.ts    # 事件定義
│   ├── utils/          # 工具函數
│   │   ├── logger.ts
│   │   └── error-handler.ts
│   ├── types/          # 類型定義
│   │   └── whisper.types.ts
│   └── app.ts          # 主應用程式
├── test/               # 測試檔案
├── docs/              # 文件
└── scripts/           # 建置腳本
```

## 3. 實作步驟

### 3.1 最小可行性實現 (Day 1)
1. 最基本的專案結構
   ```plaintext
   whisperCPPNodeJS/
   ├── app.js             # 主程式入口
   ├── src/
   │   └── whisper.js     # 封裝 addon.node
   ├── models/            # 模型目錄
   └── Release/           # addon.node 和相關文件
   ```

2. 初始化並安裝依賴
   ```bash
   npm init -y
   npm install express cors
   ```

### 3.2 Whisper 基礎功能實現 (Day 1)
1. 建立主應用程式
   ```javascript
   // app.js
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
       const params = {
         language: 'zh',
         model: path.join(__dirname, 'models/ggml-large-v3-turbo-encoder.mlmodelc'),
         use_gpu: true,
         fname_inp: req.body.audioPath,
         no_prints: true
       };

       const result = await transcribe(params);
       res.json(result);
     } catch (error) {
       console.error('轉錄失敗:', error);
       res.status(500).json({ error: error.message });
     }
   });

   const port = process.env.PORT || 5566;
   app.listen(port, () => {
     console.log(`伺服器運行在 http://localhost:${port}`);
   });
   ```

2. 封裝 Whisper addon
   ```javascript
   // src/whisper.js
   const path = require('path');
   const { whisper } = require(path.join(__dirname, '../Release/addon.node.node'));
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
   ```

### 3.3 檔案上傳功能 (Day 2)
1. 建立 TypeScript 封裝
   ```typescript
   // src/services/whisper.service.ts
   import { whisper } from '../addon';
   import { promisify } from 'util';

   const whisperAsync = promisify(whisper);

   export class WhisperService {
       async transcribe(params: WhisperParams) {
           try {
               return await whisperAsync(params);
           } catch (error) {
               console.error('轉錄失敗:', error);
               throw error;
           }
       }
   }
   ```

3. 整合進度回調與 Socket.IO
   ```typescript
   // src/services/transcription.service.ts
   export class TranscriptionService {
       constructor(
           private whisperService: WhisperService,
           private io: Server
       ) {}

       async handleTranscription(socket: Socket, audioData: Float32Array) {
           const params = {
               language: 'zh',
               model: process.env.WHISPER_MODEL_PATH,
               use_gpu: true,
               pcmf32: audioData,
               progress_callback: (progress: number) => {
                   socket.emit('transcription-progress', {
                       progress,
                       jobId: socket.id
                   });
               }
           };

           try {
               const result = await this.whisperService.transcribe(params);
               socket.emit('transcription-complete', {
                   jobId: socket.id,
                   ...result
               });
           } catch (error) {
               socket.emit('transcription-error', {
                   jobId: socket.id,
                   error: error.message
               });
           }
       }
   }
   ```

### 3.4 增強功能 (Day 3-5)
1. 設置 Socket.IO 服務
   ```typescript
   // src/config/socket.ts
   export const socketConfig = {
       cors: {
           origin: process.env.FRONTEND_URL,
           methods: ['GET', 'POST']
       },
       pingTimeout: 60000,
       pingInterval: 25000
   };

   // src/socket/events.ts
   export const EVENTS = {
       CONNECT: 'connect',
       DISCONNECT: 'disconnect',
       TRANSCRIPTION: {
           START: 'transcription-start',
           PROGRESS: 'transcription-progress',
           COMPLETE: 'transcription-complete',
           ERROR: 'transcription-error',
           CHUNK: 'audio-chunk'
       }
   };
   ```

2. 實作事件處理器
   ```typescript
   // src/socket/handlers/transcription.handler.ts
   export class TranscriptionHandler {
       private activeJobs = new Map<string, TranscriptionJob>();

       constructor(
           private io: Server,
           private transcriptionService: TranscriptionService
       ) {}

       setup(socket: Socket) {
           socket.on(EVENTS.TRANSCRIPTION.CHUNK, 
               async (data) => this.handleAudioChunk(socket, data));
           
           socket.on(EVENTS.DISCONNECT, 
               () => this.handleDisconnect(socket));
       }

       private async handleAudioChunk(socket: Socket, data: AudioChunkData) {
           const job = this.getOrCreateJob(socket.id);
           await this.transcriptionService.processChunk(job, data);
       }
   }
   ```

3. 整合錯誤處理
   ```typescript
   // src/utils/error-handler.ts
   export class SocketErrorHandler {
       static handle(socket: Socket, error: Error) {
           socket.emit(EVENTS.TRANSCRIPTION.ERROR, {
               jobId: socket.id,
               error: error.message
           });
           
           logger.error('Transcription error:', {
               jobId: socket.id,
               error: error.stack
           });
       }
   }
   ```

4. 實作串流處理
   ```typescript
   // src/services/transcription.service.ts
   export class TranscriptionService {
       async processChunk(job: TranscriptionJob, data: AudioChunkData) {
           try {
               job.addChunk(data);
               if (job.shouldProcess()) {
                   const buffer = job.getAudioBuffer();
                   await this.processAudioBuffer(job, buffer);
               }
           } catch (error) {
               SocketErrorHandler.handle(job.socket, error);
           }
       }
   }
   ```

### 3.5 優化與測試 (Day 6-7)
1. 錯誤處理優化
2. 日誌系統整合
3. API 文檔
4. 效能測試

## 4. 建置指令

### 4.1 開發環境
```json
{
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "jest"
  }
}
```

### 4.2 建置步驟
```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
```

## 5. 設定檔

### 5.1 .env
```env
PORT=5566
NODE_ENV=development
MAX_FILE_SIZE=100000000  # 100MB
MAX_AUDIO_LENGTH=1800    # 30 minutes
WHISPER_MODEL_PATH="./models/ggml-large-v3.bin"
```

### 5.2 nodemon.json
```json
{
  "watch": ["src"],
  "ext": ".ts,.js",
  "ignore": [],
  "exec": "ts-node ./src/app.ts"
}
```

### 5.3 tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.test.ts"]
}
```

## 6. 監控與日誌

### 6.1 Winston 日誌配置
```typescript
{
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
}
```

## 7. CI/CD 設置

### 7.1 測試流程
```bash
# 運行測試
npm run test

# 檢查程式碼風格
npm run lint

# 運行型別檢查
npm run type-check
```

## 8. 部署檢查清單
- [ ] 環境變數設定
- [ ] 檢查 addon.node 是否存在
- [ ] 日誌路徑確認
- [ ] 備份策略
- [ ] 監控設置
