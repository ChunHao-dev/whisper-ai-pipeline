import { join } from "path";
import fs from "fs/promises";
import { whisperService } from "./whisper.service";
import { WhisperParams } from "../types/whisper.types";
import { downloadAndProcessYoutube } from "../utils/youtube.utils";
import { formatTimestamp } from "../utils/time.utils";
import { combineWordsToSentences, WordSegment } from "../utils/sentence.utils";
import { TranscriptionPartProgress } from "../socket/events";

export interface YoutubeTranscriptionOptions {
  url: string;
  language: string;
  wordLevel: boolean;
  jobId: string;
  onProgress?: (progress: TranscriptionPartProgress) => void;
  onSegment?: (segment: any) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

/**
 * YouTube Transcription Service - 處理 YouTube 下載和轉錄的具體實作
 * 封裝 YouTube 下載邏輯和 Whisper 轉錄邏輯
 */
export const youtubeTranscriptionService = {
  /**
   * 啟動 YouTube 轉錄處理
   * 處理完整的下載 → 轉錄 → 清理流程
   */
  startYoutubeTranscription: async (options: YoutubeTranscriptionOptions): Promise<void> => {
    const { url, language, wordLevel, jobId, onProgress, onSegment, onComplete, onError } = options;
    let audioFiles: string[] = [];
    let segmentIndex = 1;
    let allSegments: Array<{text: string; start: number; end: number; t0?: number; t1?: number}> = [];
    let wordSegments: WordSegment[] = [];

    try {
      // 1. 下載 YouTube 音頻
      const downloadResult = await downloadAndProcessYoutube(url, jobId);
      audioFiles = downloadResult.audioFiles;
      const filePath = audioFiles[0];
      
      // 2. 準備轉錄參數
      const params: WhisperParams = {
        language,
        model: join(process.cwd(), "models/ggml-large-v3-turbo.bin"),
        use_gpu: true,
        fname_inp: filePath,
        no_prints: true,
        flash_attn: false,
        comma_in_time: false,
        translate: false,
        no_timestamps: false,
        audio_ctx: 0,
        max_len: wordLevel ? 1 : 0, // word level 模式時設置 max_len: 1
        segment_callback: (segment) => {
          if (wordLevel) {
            // word level 模式：收集 word segments
            wordSegments.push({
              text: segment.text,
              t0: segment.t0,
              t1: segment.t1
            });
          } else {
            // 正常模式：發送即時 SRT
            const formattedSegment = {
              ...segment,
              index: segmentIndex++,
              srtTimestamp: `${formatTimestamp(segment.t0)} --> ${formatTimestamp(segment.t1)}`,
              startTime: formatTimestamp(segment.t0),
              endTime: formatTimestamp(segment.t1)
            };
            
            console.log(`${formattedSegment.index}\n${formattedSegment.srtTimestamp}\n${segment.text}\n`);
            if (onSegment) {
              onSegment(formattedSegment);
            }
          }
        },
        progress_callback: (progress) => {
          if (onProgress) {
            const partProgress: TranscriptionPartProgress = {
              currentPart: 1,
              totalParts: 1,
              partProgress: progress,
              totalProgress: progress
            };
            onProgress(partProgress);
          }
        },
      };

      // 3. 轉錄處理
      const result = await whisperService.transcribe(params);
      console.log(`完成檔案 ${filePath} 的轉錄`);
      
      // 4. 處理結果
      if (wordLevel) {
        // word level 模式：組合成句子
        console.log(`總共收集到 ${wordSegments.length} 個 word segments`);
        const sentences = combineWordsToSentences(wordSegments);
        console.log(`組合成 ${sentences.length} 個句子`);
        
        // 發送句子級別的 segments
        sentences.forEach((sentence) => {
          if (onSegment) {
            onSegment(sentence);
          }
        });

        // 準備最終結果
        const completeText = sentences.map(s => s.text).join(' ');
        const finalSegments = sentences.map(s => ({
          text: s.text,
          start: s.start,
          end: s.end
        }));

        if (onComplete) {
          onComplete({
            text: completeText,
            segments: finalSegments
          });
        }
      } else {
        // 正常模式：處理原有邏輯
        if (result.segments) {
          allSegments.push(...result.segments);
        }

        const completeText = allSegments
          .sort((a, b) => a.start - b.start)
          .map(segment => segment.text)
          .join(' ');

        if (onComplete) {
          onComplete({
            text: completeText,
            segments: allSegments
          });
        }
      }

      // 5. 清理檔案
      await fs.unlink(filePath);
      console.log("已清理暫存檔案:", filePath);

    } catch (error) {
      console.error("Youtube 下載或轉錄失敗:", error);
      if (onError) {
        onError(error instanceof Error ? error.message : "未知錯誤");
      }

      // 錯誤發生時，清理所有暫存檔案
      await youtubeTranscriptionService.cleanupAudioFiles(audioFiles);
    }
  },

  /**
   * 清理音頻檔案
   */
  cleanupAudioFiles: async (audioFiles: string[]): Promise<void> => {
    try {
      await Promise.all(audioFiles.map(filePath => 
        fs.unlink(filePath).catch(err => 
          console.error(`清理檔案 ${filePath} 失敗:`, err)
        )
      ));
    } catch (cleanupError) {
      console.error("清理暫存檔案失敗:", cleanupError);
    }
  }
};