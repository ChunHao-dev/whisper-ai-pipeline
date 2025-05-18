export interface WhisperParams {
  language: string;
  model: string;
  use_gpu: boolean;
  fname_inp?: string;
  pcmf32?: Float32Array;
  no_prints?: boolean;
  flash_attn?: boolean;
  comma_in_time?: boolean;
  translate?: boolean;
  no_timestamps?: boolean;
  audio_ctx?: number;
  max_len?: number;
  progress_callback?: (progress: number) => void;
  new_segment_callback?:(segment: [number, number, string]) => void;
  segment_callback?: (segment: {text:string, t0: number, t1: number}) => void;
}

export interface WhisperResult {
  text: string;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}
