import fs from 'fs/promises';
import path from 'path';
import { StorageRepository, UploadResult, FileInfo, VideoInfo } from '../../domain/repositories/storage.repository';

/**
 * FileStorageRepository - 本地檔案系統實作 (Functional Programming)
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
  try {
    await fs.unlink(filePath);
    console.log(`Successfully deleted file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to delete file ${filePath}:`, error);
    throw error;
  }
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

// 高階函數：創建檔案複製函數
const createFileCopier = (baseDir: string) => async (
  sourcePath: string,
  relativePath: string,
  description: string
): Promise<UploadResult> => {
  try {
    if (!await fileExists(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    const targetPath = path.join(baseDir, relativePath);
    const targetDir = path.dirname(targetPath);
    
    // 確保目標目錄存在
    await fs.mkdir(targetDir, { recursive: true });
    
    // 複製檔案
    await fs.copyFile(sourcePath, targetPath);
    
    console.log(`${description}: copied to ${targetPath}`);
    
    return {
      success: true,
      remotePath: targetPath,
      note: description
    };

  } catch (error) {
    console.error('File copy error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown file copy error'
    };
  }
};

/**
 * 建立 FileStorageRepository 的工廠函數 (Functional Programming)
 * 使用閉包封裝狀態，回傳實作 StorageRepository 介面的物件
 */
export const createFileStorageRepository = (baseDir?: string): StorageRepository => {
  const finalBaseDir = baseDir || path.join(process.cwd(), 'uploads');
  
  // 使用閉包建立專用的檔案複製函數
  const copyFile = createFileCopier(finalBaseDir);

  // 建立 VideoList 相關的純函數
  const getVideoListImpl = async (): Promise<VideoInfo[]> => {
    const videoListPath = path.join(finalBaseDir, 'VideoList.json');
    
    try {
      if (!await fileExists(videoListPath)) {
        console.log('VideoList.json not found locally, returning empty array');
        return [];
      }

      const content = await readFile(videoListPath);
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
      console.error('Error reading local VideoList:', error);
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
      const relativePath = path.join('srt', normalizedLanguage, `${videoId}.srt`);
      const description = `Saved ${videoId}.srt locally for language '${normalizedLanguage}'`;
      
      return copyFile(localFilePath, relativePath, description);
    },

    saveSrtLocally: async (content: string, filename: string, outputDir: string): Promise<string> => {
      const fullOutputDir = path.isAbsolute(outputDir) ? outputDir : path.join(finalBaseDir, outputDir);
      
      await fs.mkdir(fullOutputDir, { recursive: true });
      const filePath = path.join(fullOutputDir, filename);
      await writeFile(filePath, content);
      
      return filePath;
    },

    // 影片元數據操作
    uploadVideoMetadata: async (videoInfo: VideoInfo): Promise<UploadResult> => {
      try {
        const videoId = videoInfo.id;
        if (!videoId) {
          return {
            success: false,
            error: 'Video ID is required for metadata upload'
          };
        }

        const metadataDir = path.join(finalBaseDir, 'metadata');
        const filePath = path.join(metadataDir, `${videoId}.json`);
        
        await writeFile(filePath, JSON.stringify(videoInfo, null, 2));
        
        console.log(`Successfully saved metadata locally: ${filePath}`);

        return {
          success: true,
          remotePath: filePath,
          note: `Saved metadata for video ${videoId} locally`
        };

      } catch (error) {
        console.error('Local metadata save error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown metadata save error'
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
        console.log(`Updated existing video in local list: ${videoInfo.id}`);
      } else {
        currentList.push(videoInfo);
        console.log(`Added new video to local list: ${videoInfo.id}`);
      }
      
      return currentList;
    },

    uploadVideoList: async (videoList: VideoInfo[]): Promise<UploadResult> => {
      try {
        const videoListPath = path.join(finalBaseDir, 'VideoList.json');
        
        // 轉換為你的格式: { videos: [], updated_at, total_count }
        const formattedList = {
          videos: videoList.map(video => ({
            ...video,
            videoId: video.id || video.videoId // 確保使用 videoId 欄位
          })),
          updated_at: new Date().toISOString(),
          total_count: videoList.length
        };
        
        await writeFile(videoListPath, JSON.stringify(formattedList, null, 2));

        console.log(`Successfully saved VideoList locally: ${videoListPath}`);

        return {
          success: true,
          remotePath: videoListPath,
          note: `Saved VideoList with ${videoList.length} videos locally`
        };

      } catch (error) {
        console.error('Local VideoList save error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown VideoList save error'
        };
      }
    },

    // 獲取 SRT 檔案
    getSrt: async (videoId: string, language: string): Promise<string | null> => {
      const normalizedLanguage = normalizeLanguageCode(language);
      const srtPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}.srt`);
      
      try {
        if (!await fileExists(srtPath)) {
          console.log(`SRT not found locally: ${srtPath}`);
          return null;
        }
        return await readFile(srtPath);
      } catch (error) {
        console.error(`Error reading SRT for ${videoId}/${language}:`, error);
        return null;
      }
    },

    // 上傳分段索引
    uploadSegments: async (segments, videoId: string, language: string): Promise<UploadResult> => {
      const normalizedLanguage = normalizeLanguageCode(language);
      const segmentsPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}-segments.json`);
      
      try {
        await writeFile(segmentsPath, JSON.stringify(segments, null, 2));
        return {
          success: true,
          remotePath: segmentsPath,
          note: `Saved segments locally for ${videoId}/${normalizedLanguage}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown segments save error'
        };
      }
    },

    // 獲取分段索引
    getSegments: async (videoId: string, language: string) => {
      const normalizedLanguage = normalizeLanguageCode(language);
      const segmentsPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}-segments.json`);
      
      try {
        if (!await fileExists(segmentsPath)) {
          console.log(`Segments not found locally: ${segmentsPath}`);
          return null;
        }
        const content = await readFile(segmentsPath);
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error reading segments for ${videoId}/${language}:`, error);
        return null;
      }
    },

    // 上傳摘要
    uploadSummary: async (summary, videoId: string, language: string): Promise<UploadResult> => {
      const normalizedLanguage = normalizeLanguageCode(language);
      const summaryPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}-summary.json`);
      
      try {
        await writeFile(summaryPath, JSON.stringify(summary, null, 2));
        return {
          success: true,
          remotePath: summaryPath,
          note: `Saved summary locally for ${videoId}/${normalizedLanguage}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown summary save error'
        };
      }
    },

    // 獲取摘要
    getSummary: async (videoId: string, language: string) => {
      const normalizedLanguage = normalizeLanguageCode(language);
      const summaryPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}-summary.json`);
      
      try {
        if (!await fileExists(summaryPath)) {
          console.log(`Summary not found locally: ${summaryPath}`);
          return null;
        }
        const content = await readFile(summaryPath);
        return JSON.parse(content);
      } catch (error) {
        console.error(`Error reading summary for ${videoId}/${language}:`, error);
        return null;
      }
    },

    // 批次上傳
    uploadLanguagePackage: async (videoId: string, language: string, files) => {
      const normalizedLanguage = normalizeLanguageCode(language);
      
      try {
        // 上傳 SRT
        const srtResult = await copyFile(
          files.srtPath,
          path.join('srt', normalizedLanguage, `${videoId}.srt`),
          `Saved SRT for ${videoId}/${normalizedLanguage}`
        );
        
        // 上傳 segments
        const segmentsPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}-segments.json`);
        await writeFile(segmentsPath, JSON.stringify(files.segments, null, 2));
        
        // 上傳 summary
        const summaryPath = path.join(finalBaseDir, 'srt', normalizedLanguage, `${videoId}-summary.json`);
        await writeFile(summaryPath, JSON.stringify(files.summary, null, 2));
        
        return {
          success: srtResult.success,
          remotePath: path.join(finalBaseDir, 'srt', normalizedLanguage),
          note: `Saved all files locally for ${videoId}/${normalizedLanguage}`
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown package save error'
        };
      }
    },

    // 查詢可用語言
    listAvailableLanguages: async (videoId: string): Promise<string[]> => {
      const srtDir = path.join(finalBaseDir, 'srt');
      try {
        const languages = await fs.readdir(srtDir);
        return languages.filter(async (lang) => {
          const srtPath = path.join(srtDir, lang, `${videoId}.srt`);
          return await fileExists(srtPath);
        });
      } catch {
        return [];
      }
    }
  };
};

// 匯出類型（向後兼容）
export type FileStorageRepository = StorageRepository;