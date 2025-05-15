# API 文件

## 音訊轉錄 API

### POST /api/transcribe

將音訊檔案轉錄為文字。

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
  "text": "完整轉錄文字",
  "segments": [
    {
      "text": "片段文字",
      "start": 0,
      "end": 10
    }
  ]
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
當轉錄過程發生錯誤時：
```json
{
  "error": "轉錄失敗: [具體錯誤訊息]"
}
```

#### 使用範例

使用 curl：
```bash
curl -X POST -F "audio=@音檔.wav" http://localhost:3000/api/transcribe
```

使用 TypeScript/JavaScript fetch：
```typescript
const formData = new FormData();
formData.append('audio', audioFile);  // audioFile 是一個 File 物件

const response = await fetch('http://localhost:3000/api/transcribe', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

#### 注意事項
1. 檔案必須是 WAV 格式
2. 檔案大小限制為 100MB
3. 轉錄過程可能需要一些時間，請耐心等待
4. 檔案會在伺服器端暫存，轉錄完成後自動刪除
