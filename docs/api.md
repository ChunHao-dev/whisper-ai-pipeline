# API 文件

## 音訊轉錄 API

### POST /api/transcribe

將音訊檔案上傳進行轉錄。API 會立即返回一個 jobId，實際的轉錄結果將通過 WebSocket 傳送。

#### 請求格式
- Content-Type: `multipart/form-data`
- Maximum file size: 100MB

#### 請求參數

| 欄位名稱 | 類型 | 必填 | 說明 |
|---------|------|------|------|
| audio | File | 是 | WAV 格式音訊檔案 (.wav)，支援的 MIME 類型：`audio/wav`、`audio/wave`、`audio/x-wav`、`audio/vnd.wave` |

#### 成功回應 (200 OK)
```json
{
  "jobId": "unique-job-id",
  "status": "processing"
}
```

#### 失敗回應

##### 400 Bad Request
當沒有提供檔案或檔案格式錯誤時：
```json
{
  "error": "必須提供音檔"
}
```
或
```json
{
  "error": "只接受 WAV 檔案"
}
```

##### 500 Internal Server Error
當初始化轉錄任務失敗時：
```json
{
  "jobId": "unique-job-id",
  "status": "error",
  "error": "錯誤訊息"
}
```

### WebSocket 事件

完整的轉錄過程會通過 WebSocket 事件進行通知。

#### 1. 進度更新
```json
{
  "event": "transcription-progress",
  "data": {
    "jobId": "unique-job-id",
    "progress": 45
  }
}
```

#### 2. 完成事件
```json
{
  "event": "transcription-complete",
  "data": {
    "jobId": "unique-job-id",
    "text": "完整轉錄文字",
    "segments": [
      {
        "text": "片段文字",
        "start": 0,
        "end": 10
      }
    ]
  }
}
```

#### 3. 錯誤事件
```json
{
  "event": "transcription-error",
  "data": {
    "jobId": "unique-job-id",
    "error": "錯誤訊息"
  }
}
```

### 使用範例

#### 使用 curl 上傳檔案
```bash
curl -X POST -F "audio=@音檔.wav" http://localhost:3000/api/transcribe
```

#### 使用 WebSocket 監聽結果
參考 [WebSocket 使用指南](./socket-example.md) 了解如何接收轉錄進度和結果。

### 注意事項
1. 檔案必須是 WAV 格式
2. 檔案大小限制為 100MB
3. 呼叫 API 後需要透過 WebSocket 監聽結果
4. 檔案會在伺服器端暫存，轉錄完成後自動刪除
5. 使用 jobId 來追蹤特定轉錄任務的狀態
