import { EVENTS, YoutubeSegmentsInfo, YoutubeProgress } from '../events';
import { emitToJob } from './transcription.handler';

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
  },

  emitSegmentsInfo: (jobId: string, info: YoutubeSegmentsInfo): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.SEGMENTS_INFO, {
      jobId,
      ...info
    });
  },

  emitSegmentStart: (jobId: string, segmentIndex: number): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.SEGMENT_START, {
      jobId,
      currentSegment: segmentIndex
    });
  },

  emitSegmentComplete: (jobId: string, segmentIndex: number): void => {
    emitToJob(jobId, EVENTS.YOUTUBE.SEGMENT_COMPLETE, {
      jobId,
      currentSegment: segmentIndex
    });
  }
};
