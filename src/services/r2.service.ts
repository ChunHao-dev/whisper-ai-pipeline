import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = promisify(exec);

interface R2UploadResult {
  success: boolean;
  error?: string;
  remotePath?: string;
  note?: string;
}

/**
 * Uploads an SRT file to R2 using AWS CLI with Cloudflare profile
 * @param localFilePath - Path to the local SRT file
 * @param videoId - YouTube video ID (used as filename)
 * @param language - Language code for the transcription (e.g., 'en', 'de', 'zh')
 * @param bucketName - R2 bucket name (defaults to environment variable)
 * @returns Promise with upload result
 */
export async function uploadSrtToR2(
  localFilePath: string,
  videoId: string,
  language: string,
  bucketName?: string
): Promise<R2UploadResult> {
  try {
    // Validate input parameters
    if (!localFilePath || !videoId || !language) {
      throw new Error('Local file path, video ID, and language are required');
    }

    // Use environment variable if bucket name not provided
    const bucket = bucketName || process.env.R2_BUCKET_NAME;
    if (!bucket) {
      throw new Error('R2 bucket name must be provided or set in R2_BUCKET_NAME environment variable');
    }

    // Check if local file exists
    try {
      await fs.access(localFilePath);
    } catch (error) {
      throw new Error(`Local SRT file not found: ${localFilePath}`);
    }

    // Normalize language code (handle 'auto' and other special cases)
    const normalizedLanguage = normalizeLanguageCode(language);
    
    // Build remote path: videoId/language/videoId.srt
    const filename = `${videoId}.srt`;
    const remotePath = `s3://${bucket}/${videoId}/${normalizedLanguage}/${filename}`;

    // Build AWS CLI command for R2
    const command = `aws --profile cloudflare s3 cp "${localFilePath}" "${remotePath}"`;
    
    console.log(`[R2] Starting upload: ${localFilePath} -> ${remotePath}`);
    console.log(`[R2] Executing AWS CLI command: ${command}`);

    // Execute the r2 cp command
    const { stdout, stderr } = await execPromise(command);
    
    // Log command output
    if (stdout) {
      console.log(`[R2] Upload stdout: ${stdout}`);
    }
    if (stderr) {
      console.log(`[R2] Upload stderr: ${stderr}`);
    }

    console.log(`[R2] Successfully uploaded ${filename} to R2`);
    
    return {
      success: true,
      remotePath: remotePath
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[R2] Upload failed for ${videoId}.srt (${language}):`, errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Gets the file size of a local file
 * @param filePath - Path to the file
 * @returns File size in bytes or null if error
 */
export async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.error(`[R2] Failed to get file size for ${filePath}:`, error);
    return null;
  }
}

/**
 * Formats file size in human readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.2 KB", "3.4 MB")
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Normalizes language code for consistent path structure
 * @param language - Language code from transcription (e.g., 'auto', 'en', 'de')
 * @returns Normalized language code for file path
 */
function normalizeLanguageCode(language: string): string {
  // Handle 'auto' detection - default to 'default' for now
  if (language === 'auto') {
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
}

/**
 * Downloads a file from URL to local path
 * @param url - URL to download from
 * @param localPath - Local path to save the file
 * @returns Promise<boolean> - Success status
 */
async function downloadFile(url: string, localPath: string): Promise<boolean> {
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
}

/**
 * Uploads video metadata to R2
 * @param videoInfo - Video information object
 * @param bucketName - R2 bucket name (defaults to environment variable)
 * @returns Promise with upload result
 */
export async function uploadVideoMetadataToR2(
  videoInfo: {
    duration: number;
    title: string;
    id: string;
    thumbnail?: string;
    description?: string;
    uploader?: string;
    upload_date?: string;
    view_count?: number;
    webpage_url?: string;
  },
  bucketName?: string
): Promise<R2UploadResult> {
  try {
    // Validate input
    if (!videoInfo || !videoInfo.id) {
      throw new Error('Video info and video ID are required');
    }

    // Use environment variable if bucket name not provided
    const bucket = bucketName || process.env.R2_BUCKET_NAME;
    if (!bucket) {
      throw new Error('R2 bucket name must be provided or set in R2_BUCKET_NAME environment variable');
    }

    const videoId = videoInfo.id;
    const tempDir = path.join(process.cwd(), 'uploads');
    
    // Create metadata JSON file
    const metadataPath = path.join(tempDir, `${videoId}-metadata.json`);
    const metadata = {
      ...videoInfo,
      generated_at: new Date().toISOString(),
      generator: 'NodeWhisperCPP'
    };
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`[R2] Created metadata file: ${metadataPath}`);

    // Upload metadata JSON
    const metadataRemotePath = `s3://${bucket}/${videoId}/metadata/info.json`;
    const metadataCommand = `aws --profile cloudflare s3 cp "${metadataPath}" "${metadataRemotePath}"`;
    
    console.log(`[R2] Uploading metadata: ${metadataPath} -> ${metadataRemotePath}`);
    
    const { stdout: metadataStdout, stderr: metadataStderr } = await execPromise(metadataCommand);
    
    if (metadataStdout) {
      console.log(`[R2] Metadata upload stdout: ${metadataStdout}`);
    }
    if (metadataStderr) {
      console.log(`[R2] Metadata upload stderr: ${metadataStderr}`);
    }

    // Handle thumbnail if available
    let thumbnailUploadSuccess = true;
    if (videoInfo.thumbnail) {
      const thumbnailExtension = path.extname(new URL(videoInfo.thumbnail).pathname) || '.jpg';
      const thumbnailPath = path.join(tempDir, `${videoId}-thumbnail${thumbnailExtension}`);
      
      console.log(`[R2] Downloading thumbnail from: ${videoInfo.thumbnail}`);
      const downloadSuccess = await downloadFile(videoInfo.thumbnail, thumbnailPath);
      
      if (downloadSuccess) {
        const thumbnailRemotePath = `s3://${bucket}/${videoId}/metadata/thumbnail${thumbnailExtension}`;
        const thumbnailCommand = `aws --profile cloudflare s3 cp "${thumbnailPath}" "${thumbnailRemotePath}"`;
        
        console.log(`[R2] Uploading thumbnail: ${thumbnailPath} -> ${thumbnailRemotePath}`);
        
        try {
          const { stdout: thumbStdout, stderr: thumbStderr } = await execPromise(thumbnailCommand);
          
          if (thumbStdout) {
            console.log(`[R2] Thumbnail upload stdout: ${thumbStdout}`);
          }
          if (thumbStderr) {
            console.log(`[R2] Thumbnail upload stderr: ${thumbStderr}`);
          }
          
          // Clean up local thumbnail file
          await fs.unlink(thumbnailPath);
        } catch (thumbError) {
          console.error(`[R2] Failed to upload thumbnail:`, thumbError);
          thumbnailUploadSuccess = false;
        }
      } else {
        thumbnailUploadSuccess = false;
      }
    }

    // Clean up local metadata file
    await fs.unlink(metadataPath);
    
    console.log(`[R2] Successfully uploaded metadata for ${videoId}`);
    
    return {
      success: true,
      remotePath: metadataRemotePath,
      note: thumbnailUploadSuccess ? 'Both metadata and thumbnail uploaded' : 'Metadata uploaded, thumbnail failed'
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[R2] Upload metadata failed for ${videoInfo?.id || 'unknown'}:`, errorMessage);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

// Export the R2 service
export const r2Service = {
  uploadSrtToR2,
  uploadVideoMetadataToR2,
  getFileSize,
  formatFileSize
};