# YouTube 認證問題解決指南

## 問題說明

當YouTube要求驗證「你不是機器人」時，會出現以下錯誤：
```
ERROR: [youtube] Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.
```

## 為什麼JavaScript執行失敗但命令行成功？

這是一個常見的問題，主要原因如下：

### 1. **macOS Keychain權限差異**
- **命令行執行**：當你在終端機執行時，命令會以你的用戶身份運行，具有完整的Keychain存取權限
- **Node.js執行**：Node.js程序可能沒有相同的權限層級，特別是：
  - 無法存取用戶的Keychain
  - 沒有GUI權限來顯示Keychain授權對話框
  - 程序間權限繼承問題

### 2. **互動式權限請求**
```bash
# 當你手動執行時，會看到這樣的對話框：
# "yt-dlp wants to access the keychain. Please enter your password."
```
- **命令行**：你可以看到並回應權限請求
- **Node.js**：後台程序無法顯示對話框，權限請求被自動拒絕

### 3. **環境變數和上下文差異**
- **命令行**：繼承完整的shell環境
- **Node.js**：可能缺少某些環境變數或用戶上下文

### 4. **youtube-dl-exec封裝問題**
- **命令行**：直接調用yt-dlp二進位檔案
- **Node.js**：透過youtube-dl-exec wrapper，可能有：
  - 參數轉換錯誤
  - 不正確的參數傳遞
  - 程序間通信問題

## 解決方案

我們的系統已經實作了自動Cookie認證機制，會依序嘗試不同瀏覽器的登入狀態。

### 自動瀏覽器偵測順序

根據你的作業系統，系統會按以下順序嘗試瀏覽器：

**macOS:**
1. Chrome
2. Safari  
3. Firefox
4. Edge

**Windows:**
1. Chrome
2. Edge
3. Firefox

**Linux:**
1. Chrome
2. Firefox

### 解決步驟

#### 步驟1：確保瀏覽器已登入YouTube
1. 打開你常用的瀏覽器（建議Chrome或Safari）
2. 前往 [youtube.com](https://youtube.com)
3. 確保已經登入你的Google帳號
4. 嘗試播放任何影片，確認可以正常觀看

#### 步驟2：測試系統
重新執行YouTube下載功能，系統會自動：
- 依序嘗試不同瀏覽器的Cookie
- 顯示詳細的嘗試過程日誌
- 找到可用的瀏覽器後繼續下載

#### 步驟3：如果仍然失敗
如果所有瀏覽器都失敗，請嘗試：

1. **清除瀏覽器快取並重新登入**
   - 清除瀏覽器的Cookie和快取
   - 重新登入YouTube
   - 確保「記住我」選項已勾選

2. **使用無痕模式登入**
   - 開啟無痕/私密瀏覽模式
   - 登入YouTube
   - 然後關閉無痕模式，用正常模式重新登入

3. **檢查YouTube Premium**
   - 如果有YouTube Premium訂閱，通常較不會遇到機器人驗證

## 技術詳情

### 我們的解決方案

為了解決JavaScript執行權限問題，我們實作了以下改進：

#### 1. **直接命令執行**
```typescript
// 不使用youtube-dl-exec wrapper，直接執行命令
const ytDlpPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
const args = [url, '--cookies-from-browser', 'chrome', '--dump-single-json'];
const result = await executeCommand(ytDlpPath, args);
```

#### 2. **多瀏覽器Fallback機制**
系統會依序嘗試：
1. Chrome cookies
2. Safari cookies  
3. Firefox cookies
4. Edge cookies
5. 用戶代理偽裝
6. 基本下載（無認證）

#### 3. **權限處理**
```typescript
function executeCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args);
    // 正確處理stdio和權限繼承
  });
}
```

### Cookie來源和權限

系統使用 `--cookies-from-browser` 參數從瀏覽器中提取認證Cookie：

#### macOS Cookie位置：
- **Chrome**: `~/Library/Application Support/Google/Chrome/Default/Cookies`
- **Safari**: `~/Library/Cookies/Cookies.binarycookies`
- **Firefox**: `~/Library/Application Support/Firefox/Profiles/*/cookies.sqlite`

#### 權限要求：
- 需要讀取瀏覽器資料夾的權限
- 可能需要Keychain存取權限來解密cookies
- Terminal或Node.js程序需要完整磁碟存取權限

### 故障排除日誌
系統會輸出詳細日誌，包括：
```
=== 嘗試方法1: 瀏覽器cookies ===
嘗試使用 chrome 瀏覽器的 cookies...
使用 chrome 瀏覽器失敗: Command failed with code 1: ERROR: [youtube] Sign in to confirm you're not a bot
嘗試使用 safari 瀏覽器的 cookies...
使用 safari 瀏覽器成功獲取影片資訊
```

### 配置選項
可以在 `src/config/youtube.config.ts` 中自定義：
- 瀏覽器優先順序
- 重試次數
- 詳細日誌開關
- 根據作業系統優化瀏覽器列表

## macOS權限設定指南

### 給予Terminal完整磁碟存取權限

如果你的系統持續無法存取瀏覽器cookies，請檢查macOS權限設定：

1. **打開系統偏好設定**
   - Apple選單 → 系統偏好設定

2. **進入安全性與隱私權**
   - 點擊「安全性與隱私權」

3. **完整磁碟取用權設定**
   - 點擊「隱私權」標籤
   - 在左側選擇「完整磁碟取用權」
   - 點擊鎖頭圖示並輸入密碼

4. **添加Terminal或IDE**
   - 點擊「+」按鈕
   - 添加以下程式（視你如何執行Node.js而定）：
     - `/Applications/Utilities/Terminal.app`
     - `/Applications/Visual Studio Code.app`
     - `/Applications/iTerm.app`

5. **重啟應用程式**
   - 關閉並重新開啟Terminal或IDE
   - 重新執行YouTube下載功能

### 測試權限是否生效

執行以下命令測試：
```bash
# 測試Chrome cookies存取
ls -la "~/Library/Application Support/Google/Chrome/Default/Cookies"

# 測試Safari cookies存取  
ls -la "~/Library/Cookies/Cookies.binarycookies"
```

如果看到檔案資訊而非權限錯誤，表示權限設定成功。

## 常見問題

**Q: 為什麼Chrome無法工作？**
A: 可能Chrome沒有登入YouTube，或者Cookie已過期。嘗試重新登入。

**Q: 為什麼給了權限還是無法工作？**
A: 確保你重啟了Terminal或IDE，且瀏覽器中確實已登入YouTube。

**Q: 可以手動指定使用哪個瀏覽器嗎？**  
A: 目前系統會自動嘗試所有瀏覽器，未來可以加入手動指定功能。

**Q: 這個方法安全嗎？**
A: 是的，我們只讀取瀏覽器的Cookie，不會修改或竊取任何資料。

**Q: 為什麼Node.js執行和命令行執行結果不同？**
A: 主要是權限繼承和環境差異。Node.js程序可能沒有GUI權限來處理Keychain對話框，而命令行執行時你可以直接回應權限請求。

## 備用方案

如果自動Cookie認證完全無法工作，可以考慮：
1. 使用其他YouTube下載工具
2. 手動下載影片後上傳到系統進行轉錄
3. 聯絡系統管理員升級yt-dlp版本
