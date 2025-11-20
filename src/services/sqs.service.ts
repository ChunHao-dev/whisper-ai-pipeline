import https from 'https';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { downloadAndProcessYoutube } from '../utils/youtube.utils';
import { whisperService } from './whisper.service';
import { mlxWhisperService } from './mlx-whisper.service';
import { WhisperParams } from '../types/whisper.types';
import { WordSegment, combineWordsToSentences, generateSrtFromSentences, generateSrtFromSegments } from '../utils/sentence.utils';
import { youtubeEmitter } from '../socket/handlers/youtube.handler';
import { defaultStorageRepository } from '../infrastructure/repositories';
import { segmentSrtUseCase } from '../usecases/segmentSrt.useCase';
import { translateSrtUseCase } from '../usecases/translateSrt.useCase';

const DEQUEUE_URL = 'https://n0fa1a9zo2.execute-api.ap-southeast-2.amazonaws.com/dequeue';
const LONG_POLLING_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SHORT_RETRY_INTERVAL = 15 * 1000; // 15 seconds

// Whisper Engine Selection
const WHISPER_ENGINE = process.env.WHISPER_ENGINE || 'whisper-cpp';
console.log(`[SQS Processor] Using Whisper engine: ${WHISPER_ENGINE}`);

// Auto Processing Configuration
const AUTO_SEGMENT = process.env.SQS_AUTO_SEGMENT === 'true';
const AUTO_TRANSLATE = process.env.SQS_AUTO_TRANSLATE === 'true';
const TARGET_LANGUAGES = process.env.SQS_TARGET_LANGUAGES?.split(',').filter(Boolean) || [];
const SEGMENT_COUNT = parseInt(process.env.SQS_SEGMENT_COUNT || '6', 10);
const AI_SERVICE = (process.env.SQS_AI_SERVICE || 'gemini') as 'gemini' | 'openai';

console.log(`[SQS Processor] Auto Segment: ${AUTO_SEGMENT}`);
console.log(`[SQS Processor] Auto Translate: ${AUTO_TRANSLATE}`);
console.log(`[SQS Processor] Target Languages: ${TARGET_LANGUAGES.join(', ') || 'none'}`);
console.log(`[SQS Processor] AI Service: ${AI_SERVICE}`);

/**
 * Fetches a message from the SQS queue via API Gateway.
 * @returns A promise that resolves to the video ID string or null if the queue is empty.
 */
function dequeueMessage(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    console.log('Attempting to dequeue message from SQS...');
    const request = https.get(DEQUEUE_URL, (res) => {
      if (res.statusCode === 204) {
        console.log('Dequeue response: 204 No Content. Queue is empty.');
        return resolve(null);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to dequeue message. Status code: ${res.statusCode}`));
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          console.log('Raw dequeue response:', data);
          const responseBody = JSON.parse(data);

          if (responseBody.Body) {
            const messageBody = JSON.parse(responseBody.Body);
            if (messageBody.videoId) {
              console.log(`Successfully dequeued videoId: ${messageBody.videoId}`);
              return resolve(messageBody.videoId);
            }
          }
          
          if (responseBody.videoId) {
            console.log(`Successfully dequeued videoId: ${responseBody.videoId}`);
            return resolve(responseBody.videoId);
          }

          if (typeof responseBody === 'string' && responseBody.length === 11) {
             console.log(`Received plain string, treating as videoId: ${responseBody}`);
             return resolve(responseBody);
          }

          console.warn('Dequeued message, but format was not recognized.', responseBody);
          resolve(null);
        } catch (e) {
          const potentialId = data.trim().replace(/["']/g, '');
          if (potentialId.length === 11) {
            console.log(`Received non-JSON response, treating as videoId: ${potentialId}`);
            return resolve(potentialId);
          }
          console.error('Failed to parse dequeue response:', e);
          resolve(null);
        }
      });
    });

    request.on('error', (err) => {
      console.error('Error during dequeue request:', err.message);
      reject(err);
    });

    request.end();
  });
}


/**
 * The main processing loop.
 * It dequeues, processes, and then calls itself again.
 */
async function processQueue(): Promise<void> {
  let videoId: string | null = null;

  try {
    videoId = await dequeueMessage();
    console.log(`[SQS Processor] Dequeued video ID: ${videoId}`);
    if (videoId) {
      console.log(`[SQS Processor] Picked up job for video ID: ${videoId}`);
      const jobId = uuidv4();
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      let audioFilePath: string | undefined;

      try {
        // 1. Download Audio and get video info
        console.log(`[${jobId}] Starting download for ${videoUrl}`);
        const downloadResult = await downloadAndProcessYoutube(videoUrl, jobId);
        audioFilePath = downloadResult.audioFiles[0];
        const videoInfo = downloadResult.videoInfo;
        console.log(`[${jobId}] Audio downloaded successfully to: ${audioFilePath}`);

        // 1.1. Upload video metadata using Repository
        console.log(`[${jobId}] Uploading video metadata...`);
        const metadataUploadResult = await defaultStorageRepository.uploadVideoMetadata(videoInfo);
        if (metadataUploadResult.success) {
          console.log(`[${jobId}] Successfully uploaded video metadata: ${metadataUploadResult.note}`);
        } else {
          console.error(`[${jobId}] Failed to upload video metadata:`, metadataUploadResult.error);
        }
        
        // 2. Transcribe Audio
        let srtContent: string;
        let detectedLanguage = 'auto';
        console.log(`[${jobId}] Starting transcription using ${WHISPER_ENGINE}...`);

        if (WHISPER_ENGINE === 'mlx-whisper') {
          // Use MLX Whisper
          const mlxResult = await mlxWhisperService.processTranscription(audioFilePath, {
            model: 'mlx-community/whisper-large-v3-turbo'
            // MLX Whisper doesn't support 'auto' language, omit to enable auto-detection
          });

          if (!mlxResult.success) {
            throw new Error(`MLX Whisper transcription failed: ${mlxResult.error}`);
          }

          srtContent = mlxResult.srtContent;
          detectedLanguage = 'auto'; // Force use 'default' for consistent R2 path structure
          console.log(`[${jobId}] MLX Whisper transcription finished. Generated SRT content length: ${srtContent.length} language : ${detectedLanguage}`);

        } else {
          // Use WhisperCPP (default)
          const allSegments: Array<{text: string; start: number; end: number}> = [];
          const params: WhisperParams = {
            language: 'auto',
            model: path.join(process.cwd(), 'models/ggml-large-v3-turbo.bin'),
            use_gpu: true,
            fname_inp: audioFilePath,
            no_prints: true,
            flash_attn: false,
            comma_in_time: false,
            translate: false,
            no_timestamps: false,
            audio_ctx: 0,
            max_len: 0, // Normal mode for accurate transcription
            segment_callback: (segment) => {
              allSegments.push({
                text: segment.text,
                start: segment.t0,
                end: segment.t1
              });
            },
          };

          const result = await whisperService.transcribe(params);
          detectedLanguage = params.language;
          console.log(`[${jobId}] WhisperCPP transcription finished. Collected ${allSegments.length} segments via callback.`);
          
          // Debug: Check collected segments
          console.log(`[${jobId}] Collected segments:`, {
            segmentCount: allSegments.length,
            firstSegment: allSegments[0] || 'No segments',
            totalText: allSegments.map(s => s.text).join(' ').substring(0, 100) + '...'
          });

          // Generate SRT from collected segments
          srtContent = generateSrtFromSegments(allSegments);
          console.log(`[${jobId}] Generated SRT content length: ${srtContent.length}`);
        }

        // 3. Save SRT file using Repository
        const srtOutputPath = await defaultStorageRepository.saveSrtLocally(
          srtContent, 
          `${videoId}.srt`, 
          'uploads'
        );
        console.log(`[${jobId}] SRT file saved to: ${srtOutputPath}`);

        // 4. Upload to storage using Repository
        const fileSize = await defaultStorageRepository.getFileSize(srtOutputPath);
        if (fileSize) {
          console.log(`[${jobId}] Uploading SRT file (${defaultStorageRepository.formatFileSize(fileSize)})...`);
        }
        console.log(`[${jobId}] About to upload with detectedLanguage: ${detectedLanguage}`);
        const uploadResult = await defaultStorageRepository.uploadSrt(srtOutputPath, videoId, detectedLanguage);
        if (uploadResult.success) {
          console.log(`[${jobId}] Successfully uploaded ${videoId}.srt: ${uploadResult.remotePath}`);
          
          // 5. Update VideoList.json using Repository
          try {
            console.log(`[${jobId}] Updating VideoList.json...`);
            
            const updatedVideoList = await defaultStorageRepository.addVideoToList(videoInfo);
            console.log(`[${jobId}] Successfully added video to VideoList`);
            
            // Upload updated VideoList using Repository
            const uploadListResult = await defaultStorageRepository.uploadVideoList(updatedVideoList);
            if (uploadListResult.success) {
              console.log(`[${jobId}] Successfully uploaded updated VideoList.json`);
            } else {
              console.error(`[${jobId}] Failed to upload VideoList.json:`, uploadListResult.error);
            }
          } catch (videoListError) {
            console.error(`[${jobId}] VideoList update failed:`, videoListError);
            // VideoList 更新失敗不影響 SRT 上傳成功的狀態
          }
          
          // 6. Auto Segmentation (if enabled)
          if (AUTO_SEGMENT) {
            try {
              console.log(`[${jobId}] Starting auto segmentation...`);
              
              const segmentResult = await segmentSrtUseCase(
                defaultStorageRepository,
                videoId,
                detectedLanguage,
                srtContent,  // 使用記憶體中的 SRT 內容
                {
                  targetSegmentCount: SEGMENT_COUNT,
                  aiService: AI_SERVICE
                }
              );
              
              console.log(`[${jobId}] Auto segmentation completed: ${segmentResult.segments.metadata.totalSegments} segments`);
            } catch (segmentError) {
              console.error(`[${jobId}] Auto segmentation failed:`, segmentError);
              // 分段失敗不影響翻譯
            }
          }

          // 7. Auto Translation (if enabled)
          if (AUTO_TRANSLATE && TARGET_LANGUAGES.length > 0) {
            try {
              console.log(`[${jobId}] Starting auto translation to: ${TARGET_LANGUAGES.join(', ')}`);
              
              for (const targetLang of TARGET_LANGUAGES) {
                try {
                  console.log(`[${jobId}] Translating to ${targetLang}...`);
                  await translateSrtUseCase(
                    defaultStorageRepository,
                    videoId,
                    detectedLanguage,
                    targetLang,
                    { aiService: AI_SERVICE }
                  );
                  console.log(`[${jobId}] Translation to ${targetLang} completed`);
                } catch (translateError) {
                  console.error(`[${jobId}] Failed to translate to ${targetLang}:`, translateError);
                  // 繼續翻譯其他語言
                }
              }
            } catch (translateError) {
              console.error(`[${jobId}] Auto translation failed:`, translateError);
              // 翻譯失敗不影響轉錄成功
            }
          }

          // 8. Delete local SRT file after all processing
          try {
            await defaultStorageRepository.deleteFile(srtOutputPath);
            console.log(`[${jobId}] Cleaned up local SRT file: ${srtOutputPath}`);
          } catch (unlinkError) {
            console.error(`[${jobId}] Failed to delete local SRT file:`, unlinkError);
          }
        } else {
          console.error(`[${jobId}] Failed to upload ${videoId}.srt:`, uploadResult.error);
          console.log(`[${jobId}] Local SRT file preserved at: ${srtOutputPath}`);
        }

      } catch (jobError) {
        console.error(`[${jobId}] Failed to process video ID ${videoId}:`, jobError);
        youtubeEmitter.emitError(jobId, jobError instanceof Error ? jobError : new Error('Unknown processing error'));
      } finally {
        // 6. Cleanup using Repository
        if (audioFilePath) {
          try {
            await defaultStorageRepository.deleteFile(audioFilePath);
            console.log(`[${jobId}] Cleaned up audio file: ${audioFilePath}`);
          } catch (cleanupError) {
            console.error(`[${jobId}] Failed to clean up audio file ${audioFilePath}:`, cleanupError);
          }
        }
      }

      // Process next message immediately
      console.log('[SQS Processor] Job finished. Checking for next message immediately.');
      process.nextTick(processQueue);

    } else {
      // Queue is empty, switch to long polling
      console.log(`[SQS Processor] Queue is empty. Switching to long poll interval (${LONG_POLLING_INTERVAL / 1000 / 60} minutes).`);
      setTimeout(processQueue, LONG_POLLING_INTERVAL);
    }
  } catch (error) {
    // Network error or other issue with dequeueing, switch to short retry
    console.error(`[SQS Processor] Dequeue failed. Retrying in ${SHORT_RETRY_INTERVAL / 1000} seconds.`, error);
    setTimeout(processQueue, SHORT_RETRY_INTERVAL);
  }
}

/**
 * Starts the SQS polling service.
 */
export function startSqsPolling(): void {
  console.log('[SQS Processor] Service starting...');
  // Kick off the first processing cycle immediately on startup.
  processQueue();
}
