# Postman WebSocket 測試指南

## 完整工作流程

1. **上傳檔案**
   - 使用 HTTP POST 請求上傳音訊檔案
   - 取得 jobId

2. **建立 WebSocket 連接**
   - 建立 WebSocket 連接到伺服器
   - 訂閱特定任務的更新

3. **接收轉錄進度和結果**
   - 監聽進度更新
   - 接收最終結果

## 詳細步驟

### 1. 上傳檔案

使用普通的 HTTP 請求：
```http
POST http://localhost:3000/api/transcribe
Content-Type: multipart/form-data

Form Data:
- audio: [選擇 WAV 檔案]
```

回應範例：
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing"
}
```

### 2. WebSocket 連接設置

1. 打開 Postman
2. 點擊 "New" -> "WebSocket Request"
3. 輸入連接 URL：
   ```
   ws://localhost:3000
   ```
4. 點擊 "Connect" 建立連接

### 3. 訂閱任務

連接建立後，發送訂閱訊息：

```json
// 事件名稱: subscribe-job
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

伺服器會回應確認訊息：
```json
// 事件名稱: subscribed
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### 4. 接收事件

訂閱後，你將收到以下事件：

#### 進度更新
```json
{
  "event": "transcription-progress",
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "progress": 45
  }
}
```

#### 完成通知
```json
{
  "event": "transcription-complete",
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "text": "轉錄的文字內容",
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

#### 錯誤通知
```json
{
  "event": "transcription-error",
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "error": "錯誤訊息"
  }
}
```

### 5. 取消訂閱（可選）

如果不再需要接收更新，可以取消訂閱：

```json
// 事件名稱: unsubscribe-job
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 測試技巧

1. **監控連接狀態**
   - 觀察 Postman 介面右上角的連接狀態
   - 綠色表示已連接
   - 紅色表示連接中斷

2. **事件監聽**
   - 確保先訂閱任務再上傳檔案
   - 保持 WebSocket 連接開啟直到收到結果
   - 注意觀察進度更新

3. **錯誤處理**
   - 檢查訂閱訊息格式
   - 確保 jobId 正確
   - 觀察伺服器回應

## 測試清單

- [ ] 上傳檔案並獲取 jobId
- [ ] 建立 WebSocket 連接
- [ ] 訂閱特定任務
- [ ] 接收進度更新
- [ ] 接收完成通知
- [ ] 測試錯誤情況
- [ ] 測試取消訂閱

## 常見問題排解

1. **無法接收更新**
   - 確認已正確訂閱任務
   - 檢查 jobId 是否正確
   - 確認 WebSocket 連接狀態

2. **連接中斷**
   - 重新連接後需要重新訂閱
   - 檢查網路狀態
   - 檢查伺服器是否正常運行

3. **檔案上傳失敗**
   - 確認檔案格式為 WAV
   - 檢查檔案大小是否超過限制
   - 確認伺服器響應狀態
