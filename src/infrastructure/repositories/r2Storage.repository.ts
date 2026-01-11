import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { StorageRepository, UploadResult, FileInfo, VideoInfo } from '../../domain/repositories/storage.repository';

const execPromise = promisify(exec);

/**
 * R2StorageRepository - Cloudflare R2 雲端儲存實作 (Functional Programming)
 * 使用純函數和閉包實作 StorageRepository 介面
 */

// 純函數：正規化語言代碼
const normalizeLanguageCode = (language: string): string => {
  const languageMap: Record<string, string> = {
    'auto': 'auto',
    'zh': 'zh',
    'en': 'en',
    'es': 'es',
    'fr': 'fr',
    'de': 'de',
    'ja': 'ja',
    'ko': 'ko'
  };
  
  return languageMap[language.toLowerCase()] || 'auto';
};

// 純函數：格式化檔案大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 純函數：檢查檔案是否存在
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

// 純函數：讀取檔案
const readFile = async (filePath: string): Promise<string> => {
  return await fs.readFile(filePath, 'utf-8');
};

// 純函數：寫入檔案
const writeFile = async (filePath: string, content: string): Promise<void> => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
};

// 純函數：刪除檔案
const deleteFile = async (filePath: string): Promise<void> => {
  await fs.unlink(filePath);
};

// 純函數：獲取檔案資訊
const getFileInfo = async (filePath: string): Promise<FileInfo> => {
  try {
    const stats = await fs.stat(filePath);
    return {
      path: filePath,
      size: stats.size,
      exists: true
    };
  } catch {
    return {
      path: filePath,
      size: 0,
      exists: false
    };
  }
};

// 純函數：獲取檔案大小
const getFileSize = async (filePath: string): Promise<number | null> => {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error(`Failed to get file size for ${filePath}:`, error);
    return null;
  }
};

// 高階函數：創建 R2 上傳函數
const createR2Uploader = (bucketName: string) => async (
  localFilePath: string,
  remotePath: string,
  description: string
): Promise<UploadResult> => {
  try {
    if (!await fileExists(localFilePath)) {
      throw new Error(`Local file not found: ${localFilePath}`);
    }

    const remoteUrl = `s3://${bucketName}/${remotePath}`;
    const uploadCommand = `aws s3 cp "${localFilePath}" "${remoteUrl}" --profile cloudflare`;
    
    console.log(`${description}: ${uploadCommand}`);
    
    const { stdout, stderr } = await execPromise(uploadCommand);
    
    if (stderr && !stderr.includes('Completed')) {
      console.error(`R2 upload stderr: ${stderr}`);
      return {
        success: false,
        error: `R2 upload failed: ${stderr}`
      };
    }

    console.log(`Successfully uploaded to R2: ${remotePath}`);
    
    return {
      success: true,
      remotePath,
      note: description
    };

  } catch (error) {
    console.error('R2 upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown R2 upload error'
    };
  }
};

// 高階函數：創建 R2 下載函數
const createR2Downloader = (bucketName: string) => async (
  remotePath: string,
  localPath: string
): Promise<boolean> => {
  try {
    const remoteUrl = `s3://${bucketName}/${remotePath}`;
    const downloadCommand = `aws s3 cp "${remoteUrl}" "${localPath}" --profile cloudflare`;
    
    await execPromise(downloadCommand);
    return true;
  } catch {
    return false;
  }
};

/**
 * 建立 R2StorageRepository 的工廠函數 (Functional Programming)
 * 使用閉包封裝狀態，回傳實作 StorageRepository 介面的物件
 */
export const createR2StorageRepository = (bucketName?: string): StorageRepository => {
  const finalBucketName = bucketName || process.env.R2_BUCKET_NAME || '';
  
  if (!finalBucketName) {
    throw new Error('R2 bucket name must be provided or set in R2_BUCKET_NAME environment variable');
  }

  // 使用閉包建立專用的上傳和下載函數
  const uploadToR2 = createR2Uploader(finalBucketName);
  const downloadFromR2 = createR2Downloader(finalBucketName);

  /**
   * Normalizes language code for consistent path structure
   * @param language - Language code from transcription (e.g., 'auto', 'en', 'de')
   * @returns Normalized language code for file path
   */
  const normalizeLanguageCode = (language: string): string => {
    // Handle 'auto' and 'default' - keep as 'default'
    if (language === 'auto' || language === 'default') {
      return 'default';
    }
    
    // Convert to lowercase and take first 2 characters for standard ISO codes
    const normalized = language.toLowerCase().substring(0, 2);
    
    // Validate common language codes
    const validLanguages = ['en', 'de', 'fr', 'es', 'it', 'ja', 'ko', 'zh', 'ru', 'pt', 'ar', 'hi'];
    if (validLanguages.includes(normalized)) {
      return normalized;
    }
    
    // Default to 'default' if unrecognized
    console.warn(`[R2] Unknown language code '${language}', defaulting to 'default'`);
    return 'default';
  };

  /**
   * Downloads a file from URL to local path
   * @param url - URL to download from
   * @param localPath - Local path to save the file
   * @returns Promise<boolean> - Success status
   */
  const downloadFile = async (url: string, localPath: string): Promise<boolean> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      await fs.writeFile(localPath, Buffer.from(buffer));
      return true;
    } catch (error) {
      console.error(`[R2] Failed to download file from ${url}:`, error);
      return false;
    }
  };

  // 建立 VideoList 相關的純函數
  const getVideoListImpl = async (): Promise<VideoInfo[]> => {
    const tempDir = path.join(process.cwd(), 'uploads');
    const localPath = path.join(tempDir, 'VideoList.json');
    
    try {
      const downloaded = await downloadFromR2('VideoList.json', localPath);
      if (!downloaded) {
        console.log('VideoList not found in R2, returning empty array');
        return [];
      }
      
      const content = await readFile(localPath);
      await deleteFile(localPath); // 清理暫存檔案
      
      const parsed = JSON.parse(content);
      
      // 支援新的格式: { videos: [], updated_at, total_count }
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.videos)) {
        // 轉換 videoId 到 id 欄位
        return parsed.videos.map((video: any) => ({
          ...video,
          id: video.videoId || video.id
        }));
      }
      
      // 如果是舊格式的陣列，直接返回
      if (Array.isArray(parsed)) {
        return parsed;
      }
      
      console.warn('VideoList.json content format not recognized, returning empty array');
      return [];
    } catch (error) {
      console.error('Error getting video list:', error);
      return [];
    }
  };

  // 回傳實作 StorageRepository 介面的物件
  return {
    // 基本檔案操作
    fileExists,
    readFile,
    writeFile,
    deleteFile,
    getFileInfo,
    getFileSize,
    formatFileSize,

    // SRT 檔案操作
    uploadSrt: async (localFilePath: string, videoId: string, language: string): Promise<UploadResult> => {
      const normalizedLanguage = normalizeLanguageCode(language);
      const remotePath = `${videoId}/${normalizedLanguage}/${videoId}.srt`;
      const description = `Uploaded ${videoId}.srt for language '${normalizedLanguage}' to s3://${finalBucketName}/${remotePath}`;
      
      return uploadToR2(localFilePath, remotePath, description);
    },

    saveSrtLocally: async (content: string, filename: string, outputDir: string): Promise<string> => {
      await fs.mkdir(outputDir, { recursive: true });
      const filePath = path.join(outputDir, filename);
      await writeFile(filePath, content);
      return filePath;
    },

    // 影片元數據操作
    uploadVideoMetadata: async (videoInfo: VideoInfo): Promise<UploadResult> => {
      const videoId = videoInfo.id;
      if (!videoId) {
        return {
          success: false,
          error: 'Video ID is required for metadata upload'
        };
      }

      const tempDir = path.join(process.cwd(), 'uploads');
      
      try {
        // Create metadata with additional info
        const metadata = {
          ...videoInfo,
          generated_at: new Date().toISOString(),
          generator: 'NodeWhisperCPP'
        };

        // Upload metadata JSON
        const metadataPath = path.join(tempDir, `${videoId}-metadata.json`);
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        
        const metadataRemotePath = `${videoId}/metadata/info.json`;
        const metadataDescription = `Uploaded metadata for video ${videoId} to s3://${finalBucketName}/${metadataRemotePath}`;
        const metadataResult = await uploadToR2(metadataPath, metadataRemotePath, metadataDescription);
        
        // Clean up metadata file
        await deleteFile(metadataPath);

        // Handle thumbnail if available
        let thumbnailUploadSuccess = true;
        if (videoInfo.thumbnail) {
          const thumbnailUrl = videoInfo.thumbnail;

          // Extract file extension from URL (support jpg, jpeg, png, webp)
          const urlExtension = thumbnailUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)?.[1] || 'jpg';
          const extension = urlExtension.toLowerCase();

          const thumbnailPath = path.join(tempDir, `${videoId}-thumbnail.${extension}`);

          console.log(`[R2] Downloading thumbnail from: ${thumbnailUrl}`);
          const downloadSuccess = await downloadFile(thumbnailUrl, thumbnailPath);

          if (downloadSuccess) {
            const thumbnailRemotePath = `${videoId}/metadata/thumbnail.${extension}`;
            const thumbnailDescription = `Uploaded ${extension.toUpperCase()} thumbnail for ${videoId} to s3://${finalBucketName}/${thumbnailRemotePath}`;

            try {
              await uploadToR2(thumbnailPath, thumbnailRemotePath, thumbnailDescription);
              // Clean up local thumbnail file
              await deleteFile(thumbnailPath);
            } catch (thumbError) {
              console.error(`[R2] Failed to upload thumbnail:`, thumbError);
              thumbnailUploadSuccess = false;
            }
          } else {
            thumbnailUploadSuccess = false;
          }
        }
        
        return {
          success: metadataResult.success,
          remotePath: metadataResult.remotePath,
          note: thumbnailUploadSuccess ? 'Both metadata and thumbnail uploaded' : 'Metadata uploaded, thumbnail failed',
          error: metadataResult.error
        };
      } catch (error) {
        // 清理暫存檔案（如果存在）
        try {
          const metadataPath = path.join(tempDir, `${videoId}-metadata.json`);
          await deleteFile(metadataPath);
        } catch {}
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown metadata upload error'
        };
      }
    },

    // VideoList 管理
    getVideoList: getVideoListImpl,

    addVideoToList: async (videoInfo: VideoInfo): Promise<VideoInfo[]> => {
      const currentList = await getVideoListImpl();
      
      const existingIndex = currentList.findIndex(video => video.id === videoInfo.id);
      
      if (existingIndex !== -1) {
        currentList[existingIndex] = { ...currentList[existingIndex], ...videoInfo };
        console.log(`Updated existing video in list: ${videoInfo.id}`);
      } else {
        currentList.push(videoInfo);
        console.log(`Added new video to list: ${videoInfo.id}`);
      }
      
      return currentList;
    },

    uploadVideoList: async (videoList: VideoInfo[]): Promise<UploadResult> => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const localPath = path.join(tempDir, 'VideoList.json');
      
      try {
        // 轉換為你的格式: { videos: [], updated_at, total_count }
        const formattedList = {
          videos: videoList.map(video => ({
            ...video,
            videoId: video.id || video.videoId // 確保使用 videoId 欄位
          })),
          updated_at: new Date().toISOString(),
          total_count: videoList.length
        };
        
        await writeFile(localPath, JSON.stringify(formattedList, null, 2));
        
        const description = `Uploaded VideoList with ${videoList.length} videos`;
        const result = await uploadToR2(localPath, 'VideoList.json', description);
        
        await deleteFile(localPath);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown VideoList upload error'
        };
      }
    },

    // 獲取 SRT 檔案
    getSrt: async (videoId: string, language: string): Promise<string | null> => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const normalizedLanguage = normalizeLanguageCode(language);
      const remotePath = `${videoId}/${normalizedLanguage}/${videoId}.srt`;
      const localPath = path.join(tempDir, `${videoId}-${normalizedLanguage}.srt`);
      
      try {
        const downloaded = await downloadFromR2(remotePath, localPath);
        if (!downloaded) {
          console.log(`SRT not found: ${remotePath}`);
          return null;
        }
        
        const content = await readFile(localPath);
        await deleteFile(localPath);
        return content;
      } catch (error) {
        console.error(`Error getting SRT for ${videoId}/${language}:`, error);
        return null;
      }
    },

    // 上傳分段索引 (segments.json)
    uploadSegments: async (segments, videoId: string, language: string): Promise<UploadResult> => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const normalizedLanguage = normalizeLanguageCode(language);
      const localPath = path.join(tempDir, `${videoId}-${normalizedLanguage}-segments.json`);
      
      try {
        await writeFile(localPath, JSON.stringify(segments, null, 2));
        
        const remotePath = `${videoId}/${normalizedLanguage}/segments.json`;
        const description = `Uploaded segments.json for ${videoId}/${normalizedLanguage}`;
        const result = await uploadToR2(localPath, remotePath, description);
        
        await deleteFile(localPath);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown segments upload error'
        };
      }
    },

    // 獲取分段索引
    getSegments: async (videoId: string, language: string) => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const normalizedLanguage = normalizeLanguageCode(language);
      const remotePath = `${videoId}/${normalizedLanguage}/segments.json`;
      const localPath = path.join(tempDir, `${videoId}-${normalizedLanguage}-segments.json`);
      
      try {
        const downloaded = await downloadFromR2(remotePath, localPath);
        if (!downloaded) {
          console.log(`Segments not found: ${remotePath}`);
          return null;
        }
        
        const content = await readFile(localPath);
        await deleteFile(localPath);
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error getting segments for ${videoId}/${language}:`, error);
        return null;
      }
    },

    // 上傳摘要 (summary.json)
    uploadSummary: async (summary, videoId: string, language: string): Promise<UploadResult> => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const normalizedLanguage = normalizeLanguageCode(language);
      const localPath = path.join(tempDir, `${videoId}-${normalizedLanguage}-summary.json`);
      
      try {
        await writeFile(localPath, JSON.stringify(summary, null, 2));
        
        const remotePath = `${videoId}/${normalizedLanguage}/summary.json`;
        const description = `Uploaded summary.json for ${videoId}/${normalizedLanguage}`;
        const result = await uploadToR2(localPath, remotePath, description);
        
        await deleteFile(localPath);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown summary upload error'
        };
      }
    },

    // 獲取摘要
    getSummary: async (videoId: string, language: string) => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const normalizedLanguage = normalizeLanguageCode(language);
      const remotePath = `${videoId}/${normalizedLanguage}/summary.json`;
      const localPath = path.join(tempDir, `${videoId}-${normalizedLanguage}-summary.json`);
      
      try {
        const downloaded = await downloadFromR2(remotePath, localPath);
        if (!downloaded) {
          console.log(`Summary not found: ${remotePath}`);
          return null;
        }
        
        const content = await readFile(localPath);
        await deleteFile(localPath);
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error getting summary for ${videoId}/${language}:`, error);
        return null;
      }
    },

    // 批次上傳（SRT + segments + summary）
    uploadLanguagePackage: async (videoId: string, language: string, files) => {
      const results = {
        srt: { success: false },
        segments: { success: false },
        summary: { success: false }
      };
      
      try {
        // 上傳 SRT
        const normalizedLanguage = normalizeLanguageCode(language);
        const srtResult = await uploadToR2(
          files.srtPath,
          `${videoId}/${normalizedLanguage}/${videoId}.srt`,
          `Uploaded SRT for ${videoId}/${normalizedLanguage}`
        );
        results.srt = srtResult;
        
        // 上傳 segments
        const tempDir = path.join(process.cwd(), 'uploads');
        const segmentsPath = path.join(tempDir, `${videoId}-${normalizedLanguage}-segments-temp.json`);
        await writeFile(segmentsPath, JSON.stringify(files.segments, null, 2));
        const segmentsResult = await uploadToR2(
          segmentsPath,
          `${videoId}/${normalizedLanguage}/segments.json`,
          `Uploaded segments for ${videoId}/${normalizedLanguage}`
        );
        await deleteFile(segmentsPath);
        results.segments = segmentsResult;
        
        // 上傳 summary
        const summaryPath = path.join(tempDir, `${videoId}-${normalizedLanguage}-summary-temp.json`);
        await writeFile(summaryPath, JSON.stringify(files.summary, null, 2));
        const summaryResult = await uploadToR2(
          summaryPath,
          `${videoId}/${normalizedLanguage}/summary.json`,
          `Uploaded summary for ${videoId}/${normalizedLanguage}`
        );
        await deleteFile(summaryPath);
        results.summary = summaryResult;
        
        const allSuccess = results.srt.success && results.segments.success && results.summary.success;
        
        return {
          success: allSuccess,
          remotePath: `${videoId}/${normalizedLanguage}/`,
          note: `Uploaded ${allSuccess ? 'all' : 'some'} files for ${videoId}/${normalizedLanguage}`,
          error: allSuccess ? undefined : 'Some uploads failed'
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown package upload error'
        };
      }
    },

    // 查詢可用語言
    listAvailableLanguages: async (videoId: string): Promise<string[]> => {
      // 這個方法需要列出 R2 中的目錄，暫時返回空陣列
      // 實際實作需要使用 aws s3 ls 命令
      console.warn('listAvailableLanguages not fully implemented yet');
      return [];
    },

    // ==================== 語言分析相關方法 ====================

    // 上傳語言分析結果
    uploadLanguageAnalysis: async (videoId: string, analysisData: any): Promise<UploadResult> => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const localPath = path.join(tempDir, `${videoId}-language-analysis.json`);
      
      try {
        // 寫入本地臨時檔案
        await writeFile(localPath, JSON.stringify(analysisData, null, 2));
        
        const remotePath = `${videoId}/metadata/language-analysis.json`;
        const description = `Uploaded language analysis for ${videoId}`;
        const result = await uploadToR2(localPath, remotePath, description);
        
        // 清理本地檔案
        await deleteFile(localPath);
        
        return result;
      } catch (error) {
        // 確保清理本地檔案
        try {
          await deleteFile(localPath);
        } catch (cleanupError) {
          console.error('Failed to cleanup language analysis temp file:', cleanupError);
        }
        
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown language analysis upload error'
        };
      }
    },

    // 下載語言分析結果
    downloadLanguageAnalysis: async (videoId: string): Promise<any | null> => {
      const tempDir = path.join(process.cwd(), 'uploads');
      const remotePath = `${videoId}/metadata/language-analysis.json`;
      const localPath = path.join(tempDir, `${videoId}-language-analysis.json`);
      
      try {
        const downloaded = await downloadFromR2(remotePath, localPath);
        if (!downloaded) {
          console.log(`Language analysis not found: ${remotePath}`);
          return null;
        }
        
        const content = await readFile(localPath);
        await deleteFile(localPath);
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error getting language analysis for ${videoId}:`, error);
        return null;
      }
    }
  };
};

// 匯出類型（向後兼容）
export type R2StorageRepository = StorageRepository;