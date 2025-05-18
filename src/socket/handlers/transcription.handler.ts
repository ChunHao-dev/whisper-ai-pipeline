import { Server, Socket } from 'socket.io';
import { EVENTS, TranscriptionProgressData, TranscriptionCompleteData, TranscriptionErrorData, TranscriptionSegmentData } from '../events';
import { WhisperParams } from '../../types/whisper.types';
import { whisperService } from '../../services/whisper.service';

// 存儲 jobId 和 socket 的映射關係
const jobSockets = new Map<string, Socket>();

// 移除指定 socket 的所有工作訂閱
const removeSocketFromJobs = (socket: Socket): void => {
  for (const [jobId, savedSocket] of jobSockets.entries()) {
    if (savedSocket.id === socket.id) {
      jobSockets.delete(jobId);
      console.log(`移除工作 ${jobId} 的 socket 連接`);
    }
  }
};

// 發送事件到指定的工作
const emitToJob = (jobId: string, event: string, data: any): void => {
  const socket = jobSockets.get(jobId);
  if (socket) {
    // 發送原生事件
    socket.emit(event, data);
    // 同時發送 JSON 格式訊息
    socket.emit('message', JSON.stringify({ event, data }));
  } else {
    console.warn(`找不到工作 ${jobId} 的 socket 連接`);
  }
};

// 處理轉錄開始
const handleTranscriptionStart = async (socket: Socket, params: Omit<WhisperParams, 'progress_callback'>): Promise<void> => {
  try {
    console.log('開始轉錄任務:', socket.id);
    emitToJob(socket.id, EVENTS.TRANSCRIPTION.START, { jobId: socket.id });

    const transcriptionParams: WhisperParams = {
      ...params,
      progress_callback: (progress: number) => {
        const progressData: TranscriptionProgressData = {
          jobId: socket.id,
          progress
        };
        emitToJob(socket.id, EVENTS.TRANSCRIPTION.PROGRESS, progressData);
      }
    };

    const result = await whisperService.transcribe(transcriptionParams);
    
    const completeData: TranscriptionCompleteData = {
      jobId: socket.id,
      ...result
    };
    emitToJob(socket.id, EVENTS.TRANSCRIPTION.COMPLETE, completeData);

  } catch (error) {
    console.error('轉錄失敗:', error);
    const errorData: TranscriptionErrorData = {
      jobId: socket.id,
      error: error instanceof Error ? error.message : '轉錄過程發生未知錯誤'
    };
    emitToJob(socket.id, EVENTS.TRANSCRIPTION.ERROR, errorData);
  }
};

// 設置 socket 事件處理
export const setupTranscriptionHandler = (socket: Socket): void => {
  console.log('客戶端連接:', socket.id);

  socket.on(EVENTS.DISCONNECT, () => {
    console.log('客戶端斷開連接:', socket.id);
    removeSocketFromJobs(socket);
  });

  // 訂閱特定工作
  socket.on('subscribe-job', (jobId: string) => {
    console.log(`Socket ${socket.id} 訂閱工作 ${jobId}`);
    jobSockets.set(jobId, socket);
    socket.emit('subscribed', { jobId });
  });

  // 取消訂閱
  socket.on('unsubscribe-job', (jobId: string) => {
    console.log(`Socket ${socket.id} 取消訂閱工作 ${jobId}`);
    jobSockets.delete(jobId);
    socket.emit('unsubscribed', { jobId });
  });

  // 支援 Socket.IO 原生格式的事件處理
  socket.on('message', async (message) => {
    try {
      const { event, data } = JSON.parse(message);
      if (event === EVENTS.TRANSCRIPTION.START) {
        await handleTranscriptionStart(socket, data);
      }
    } catch (error) {
      console.error('訊息解析錯誤:', error);
      emitToJob(socket.id, EVENTS.TRANSCRIPTION.ERROR, {
        jobId: socket.id,
        error: '無效的訊息格式'
      });
    }
  });

  // 直接事件處理
  socket.on(EVENTS.TRANSCRIPTION.START, async (params) => {
    await handleTranscriptionStart(socket, params);
  });
};

// 導出公共函數供其他模組使用
export const transcriptionEmitter = {
  emitProgress: (jobId: string, progress: number): void => {
    const progressData: TranscriptionProgressData = {
      jobId,
      progress
    };
    emitToJob(jobId, EVENTS.TRANSCRIPTION.PROGRESS, progressData);
  },

  emitSegment: (jobId: string, segment: any): void => {
    const segmentData: TranscriptionSegmentData = {
      jobId,
      segment
    };
    emitToJob(jobId, EVENTS.TRANSCRIPTION.SEGMENT, segmentData);
  },

  emitComplete: (jobId: string, result: any): void => {
    const completeData: TranscriptionCompleteData = {
      jobId,
      ...result
    };
    emitToJob(jobId, EVENTS.TRANSCRIPTION.COMPLETE, completeData);
  },

  emitError: (jobId: string, error: Error | string): void => {
    const errorData: TranscriptionErrorData = {
      jobId,
      error: error instanceof Error ? error.message : error
    };
    emitToJob(jobId, EVENTS.TRANSCRIPTION.ERROR, errorData);
  }
};
