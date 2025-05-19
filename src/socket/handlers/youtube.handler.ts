import { EVENTS } from '../events';
import { emitToJob } from './transcription.handler';

export interface YoutubeProgress {
  percent: number;
  speed: string;
  downloaded: number;
}

// Youtube 事件發射器
export const youtubeEmitter = {
  emitProgress: (jobId: string, progress: YoutubeProgress): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.DOWNLOAD_PROGRESS, {
      jobId,
      ...progress
    });
  },

  emitDownloadComplete: (jobId: string): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.DOWNLOAD_COMPLETE, { jobId });
  },

  emitAudioReady: (jobId: string, audioData: string): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.AUDIO_READY, {
      jobId,
      audioData
    });
  },

  emitError: (jobId: string, error: Error | string): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.DOWNLOAD_ERROR, {
      jobId,
      error: error instanceof Error ? error.message : error
    });
  }
};
