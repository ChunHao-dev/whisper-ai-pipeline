import https from 'https';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { downloadAndProcessYoutube } from '../utils/youtube.utils';
import { whisperService } from './whisper.service';
import { WhisperParams } from '../types/whisper.types';
import { WordSegment, combineWordsToSentences, generateSrtFromSentences } from '../utils/sentence.utils';
import { youtubeEmitter } from '../socket/handlers/youtube.handler';
import { r2Service } from './r2.service';

const DEQUEUE_URL = 'https://n0fa1a9zo2.execute-api.ap-southeast-2.amazonaws.com/dequeue';
const LONG_POLLING_INTERVAL = 10 * 60 * 1000; // 10 minutes
const SHORT_RETRY_INTERVAL = 15 * 1000; // 15 seconds

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
        // 1. Download Audio
        console.log(`[${jobId}] Starting download for ${videoUrl}`);
        const downloadedFiles = await downloadAndProcessYoutube(videoUrl, jobId);
        audioFilePath = downloadedFiles[0];
        console.log(`[${jobId}] Audio downloaded successfully to: ${audioFilePath}`);

        // 2. Transcribe Audio (Word-Level)
        const wordSegments: WordSegment[] = [];
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
          max_len: 1, // Enable word-level timestamps
          segment_callback: (segment) => {
            wordSegments.push({
              text: segment.text,
              t0: segment.t0,
              t1: segment.t1,
            });
          },
          progress_callback: (progress) => {
          },
        };

        console.log(`[${jobId}] Starting transcription...`);
        await whisperService.transcribe(params);
        console.log(`[${jobId}] Transcription finished. Collected ${wordSegments.length} word segments.`);

        // 3. Combine words and generate SRT
        const sentences = combineWordsToSentences(wordSegments);
        const srtContent = generateSrtFromSentences(sentences);
        console.log(`[${jobId}] Generated ${sentences.length} sentences.`);

        // 4. Save SRT file
        const srtOutputPath = path.join(process.cwd(), 'uploads', `${videoId}.srt`);
        await fs.writeFile(srtOutputPath, srtContent, 'utf-8');
        console.log(`[${jobId}] SRT file saved to: ${srtOutputPath}`);

        // 5. Upload to R2
        const fileSize = await r2Service.getFileSize(srtOutputPath);
        if (fileSize) {
          console.log(`[${jobId}] Uploading SRT file (${r2Service.formatFileSize(fileSize)}) to R2...`);
        }
        
        const uploadResult = await r2Service.uploadSrtToR2(srtOutputPath, videoId, params.language);
        if (uploadResult.success) {
          console.log(`[${jobId}] Successfully uploaded ${videoId}.srt to R2: ${uploadResult.remotePath}`);
          
          // Delete local SRT file after successful upload
          try {
            await fs.unlink(srtOutputPath);
            console.log(`[${jobId}] Cleaned up local SRT file: ${srtOutputPath}`);
          } catch (unlinkError) {
            console.error(`[${jobId}] Failed to delete local SRT file:`, unlinkError);
          }
        } else {
          console.error(`[${jobId}] Failed to upload ${videoId}.srt to R2:`, uploadResult.error);
          console.log(`[${jobId}] Local SRT file preserved at: ${srtOutputPath}`);
        }

      } catch (jobError) {
        console.error(`[${jobId}] Failed to process video ID ${videoId}:`, jobError);
        youtubeEmitter.emitError(jobId, jobError instanceof Error ? jobError : new Error('Unknown processing error'));
      } finally {
        // 6. Cleanup
        if (audioFilePath) {
          try {
            await fs.unlink(audioFilePath);
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
