#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MLX Whisper wrapper for NodeWhisperCPP integration
"""

import sys
import json
import os
import argparse
from typing import Dict, List, Any, Optional

try:
    import mlx_whisper
except ImportError as e:
    print(json.dumps({"error": f"MLX Whisper import failed: {str(e)}"}))
    sys.exit(1)

def transcribe_with_word_timestamps(
    audio_file: str,
    model_path: str = "mlx-community/whisper-large-v3-turbo",
    language: Optional[str] = None
) -> Dict[str, Any]:
    """
    使用 MLX Whisper 進行轉錄，支援逐字時間戳
    
    Args:
        audio_file: 音頻檔案路徑
        model_path: 模型路徑或 HuggingFace repo
        language: 語言代碼（可選）
    
    Returns:
        轉錄結果字典
    """
    try:
        # 檢查音頻檔案是否存在
        if not os.path.exists(audio_file):
            return {"error": f"Audio file not found: {audio_file}"}
        
        # 執行轉錄
        transcribe_options = {
            "path_or_hf_repo": model_path,
            "word_timestamps": True,
            "condition_on_previous_text": False
        }
        
        if language:
            transcribe_options["language"] = language
            
        result = mlx_whisper.transcribe(audio_file, **transcribe_options)
        
        # 檢查結果
        if not result or "segments" not in result:
            return {"error": "Transcription failed - no valid results"}
        
        # 格式化結果
        formatted_result = {
            "text": result.get("text", ""),
            "language": result.get("language", "unknown"),
            "segments": []
        }
        
        # 處理片段和逐字時間戳
        for segment in result["segments"]:
            segment_data = {
                "id": segment.get("id", 0),
                "start": segment.get("start", 0.0),
                "end": segment.get("end", 0.0),
                "text": segment.get("text", ""),
                "words": []
            }
            
            # 處理逐字時間戳
            if "words" in segment and segment["words"]:
                for word_info in segment["words"]:
                    word_data = {
                        "word": word_info.get("word", ""),
                        "start": word_info.get("start", 0.0),
                        "end": word_info.get("end", 0.0),
                        "probability": word_info.get("probability", 1.0)
                    }
                    segment_data["words"].append(word_data)
            
            formatted_result["segments"].append(segment_data)
        
        return {"success": True, "result": formatted_result}
        
    except Exception as e:
        return {"error": f"Transcription error: {str(e)}"}

def main():
    """主程式"""
    parser = argparse.ArgumentParser(description="MLX Whisper Word Timestamps Wrapper")
    parser.add_argument("audio_file", help="Audio file path")
    parser.add_argument("--model", default="mlx-community/whisper-large-v3-turbo", 
                       help="Model path or HuggingFace repo")
    parser.add_argument("--language", help="Language code (optional)")
    parser.add_argument("--output", help="Output JSON file path (optional)")
    
    args = parser.parse_args()
    
    # 執行轉錄
    result = transcribe_with_word_timestamps(
        audio_file=args.audio_file,
        model_path=args.model,
        language=args.language
    )
    
    # 輸出結果
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        # 寫入檔案
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(output_json)
            print(json.dumps({"success": True, "output_file": args.output}))
        except Exception as e:
            print(json.dumps({"error": f"Failed to write output file: {str(e)}"}))
    else:
        # 直接輸出到 stdout
        print(output_json)

if __name__ == "__main__":
    main()