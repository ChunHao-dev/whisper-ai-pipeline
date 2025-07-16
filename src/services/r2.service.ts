import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execPromise = promisify(exec);

interface R2UploadResult {
  success: boolean;
  error?: string;
  remotePath?: string;
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

// Export the R2 service
export const r2Service = {
  uploadSrtToR2,
  getFileSize,
  formatFileSize
};