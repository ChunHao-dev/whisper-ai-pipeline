# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Building and Running
- `npm run build` - Compile TypeScript to JavaScript in `dist/` directory
- `npm run start` - Run the production build from `dist/app.js`
- `npm run dev` - Start development server with hot reload using nodemon and ts-node
- `npm run type-check` - Run TypeScript type checking without emitting files

### Testing
- `npm test` - Run Jest tests (though no test files currently exist)

## Architecture Overview

This is a Node.js/TypeScript backend service for speech-to-text transcription using Whisper models. The application provides both file upload and YouTube URL transcription capabilities with real-time WebSocket updates.

**Programming Paradigm:** This project follows **Functional Programming** principles with pure functions, immutable data structures, and function composition over class-based object-oriented approaches.

### Key Components

**Core Technologies:**
- Express.js server with Socket.IO for WebSocket communication
- Native C++ Whisper addon (located in `Release/addon.node`)
- TypeScript with strict configuration
- File uploads handled by multer

**Main Entry Point:**
- `src/app.ts` - Main application server setup with all API endpoints

**Service Architecture:**
- `src/services/whisper.service.ts` - Wrapper around native Whisper C++ addon
- `src/services/sqs.service.ts` - SQS polling service for queue processing
- `src/socket/` - WebSocket event handling and real-time communication
- `src/utils/` - Utility functions for YouTube processing, time formatting, and sentence assembly

**Key Features:**
1. **File Upload Transcription** (`/api/transcribe`) - Upload WAV files for transcription
2. **YouTube Transcription** (`/api/transcribe-youtube`) - Process YouTube URLs with word-level or sentence-level options
3. **YouTube to SRT** (`/api/youtube-to-srt`) - Convert YouTube videos directly to SRT format using MLX Whisper
4. **Real-time Updates** - WebSocket connections provide live transcription progress and segments

### File Structure

```
src/
├── app.ts                 # Main application entry point
├── config/               # Configuration files
├── services/            # Business logic services
├── socket/              # WebSocket handling
├── types/               # TypeScript type definitions
└── utils/               # Utility functions
```

### Models and Dependencies

- Whisper model: `models/ggml-large-v3-turbo.bin` (large model for high-quality transcription)
- Native addon: `Release/addon.node` (C++ Whisper integration)
- Upload directory: `uploads/` (temporary file storage)

### External Dependencies

- YouTube processing uses `youtube-dl-exec` for downloading
- MLX Whisper integration at `/Users/chchen/Andy_Folder/Project/Personal/transcribe/mlx-whisper/venv/bin/mlx_whisper`
- Real-time progress reporting via Socket.IO events

### Development Notes

- The application uses both file-based and YouTube URL transcription workflows
- WebSocket events handle real-time progress updates and segment delivery
- Temporary files are automatically cleaned up after processing
- The service supports both word-level and sentence-level transcription modes
- SQS integration suggests queue-based processing capabilities
- **Functional Programming**: Services use pure functions, factory patterns, and curried functions for better testability and composability
- **File Naming Convention**: Use camelCase for all TypeScript file names (e.g., `transcribeFile.useCase.ts`, `storageRepository.ts`)

### Whisper Engine Configuration

The application supports two Whisper engines that can be configured via environment variables:

**Environment Variable:**
- `WHISPER_ENGINE`: Choose between `"whisper-cpp"` (default) or `"mlx-whisper"`

**Engine Options:**
1. **whisper-cpp** (default): Native C++ Whisper addon for fast performance
2. **mlx-whisper**: Python-based MLX Whisper for Apple Silicon optimization

**Usage:**
- Copy `.env.example` to `.env` and set `WHISPER_ENGINE=mlx-whisper` to use MLX Whisper
- Leave unset or set `WHISPER_ENGINE=whisper-cpp` for the default C++ implementation
- Both engines produce identical SRT output format for consistent processing