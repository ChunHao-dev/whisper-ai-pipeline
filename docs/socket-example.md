# Socket.IO 轉錄功能使用說明

## 轉錄流程概述

1. 先上傳檔案並取得任務 ID (jobId)
2. 使用 WebSocket 訂閱該任務的進度和結果
3. 監聽相關事件

## 相關函數說明

### 後端函數

```typescript
// 設置 WebSocket 連接事件處理
setupTranscriptionHandler(socket: Socket)

// 發送轉錄相關事件
transcriptionEmitter.emitProgress(jobId, progress)
transcriptionEmitter.emitComplete(jobId, result)
transcriptionEmitter.emitError(jobId, error)

// 轉錄核心功能
transcribe(params: WhisperParams)
```

## 客戶端使用範例

### 1. 上傳檔案
```typescript
const formData = new FormData();
formData.append('audio', audioFile);

const response = await fetch('http://localhost:3000/api/transcribe', {
  method: 'POST',
  body: formData
});

const { jobId, status } = await response.json();
```

### 2. 建立 WebSocket 連接
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// 監聽連接狀態
socket.on('connect', () => {
  console.log('已連接到伺服器');
});
```

### 3. 訂閱任務進度
```typescript
// 訂閱特定任務
socket.emit('subscribe-job', jobId);

// 確認訂閱成功
socket.on('subscribed', (data) => {
  console.log(`已訂閱任務: ${data.jobId}`);
});

// 監聽進度更新
socket.on('transcription-progress', (data) => {
  console.log(`轉錄進度: ${data.progress}%`);
  updateProgressBar(data.progress);
});

// 監聽完成事件
socket.on('transcription-complete', (data) => {
  console.log('轉錄完成:', data.text);
  displayResult(data);
});

// 監聽錯誤事件
socket.on('transcription-error', (data) => {
  console.error('轉錄錯誤:', data.error);
  showError(data.error);
});
```

### 4. 取消訂閱（可選）
```typescript
socket.emit('unsubscribe-job', jobId);

socket.on('unsubscribed', (data) => {
  console.log(`已取消訂閱任務: ${data.jobId}`);
});
```

## React 組件範例

```typescript
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const TranscriptionComponent = () => {
  const [socket, setSocket] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // 建立連接
    const socket = io('http://localhost:3000');
    setSocket(socket);

    // 連接成功後訂閱任務
    socket.on('connect', () => {
      if (jobId) {
        socket.emit('subscribe-job', jobId);
      }
    });

    // 設置事件監聽
    socket.on('transcription-progress', (data) => setProgress(data.progress));
    socket.on('transcription-complete', (data) => setResult(data.text));
    socket.on('transcription-error', (data) => setError(data.error));

    // 清理函數
    return () => {
      if (jobId) {
        socket.emit('unsubscribe-job', jobId);
      }
      socket.disconnect();
    };
  }, [jobId]);

  // 上傳處理
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('audio', file);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      const { jobId } = await response.json();
      socket?.emit('subscribe-job', jobId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <input type="file" onChange={(e) => handleUpload(e.target.files[0])} />
      {progress > 0 && <progress value={progress} max="100" />}
      {result && <div>{result}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
};

export default TranscriptionComponent;
```

## 注意事項

1. **錯誤處理**
   - 確保處理所有可能的錯誤情況
   - 實作重連機制
   - 處理檔案上傳失敗的情況

2. **資源清理**
   - 組件卸載時取消訂閱
   - 關閉不需要的連接
   - 清理暫存檔案

3. **狀態管理**
   - 追蹤連接狀態
   - 保存任務進度
   - 管理多個並行任務

4. **效能考慮**
   - 避免記憶體洩漏
   - 合理設置超時時間
   - 處理大檔案的情況
