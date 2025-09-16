"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export function VoiceRecorder({
  onTranscription,
  onError,
  disabled = false,
}: VoiceRecorderProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [hasTranscribed, setHasTranscribed] = useState(false);

  const {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    audioBlob,
  } = useAudioRecorder();

  // Ensure component is mounted on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    setHasTranscribed(false);
    await startRecording();
  };

  const handleStopRecording = async () => {
    stopRecording();
  };

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      setIsTranscribing(true);

      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Transcription failed");
        }

        const data = await response.json();

        if (data.success && data.transcription) {
          onTranscription(data.transcription);
        } else {
          throw new Error(data.error || "No transcription received");
        }
      } catch (error) {
        console.error("Transcription error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to transcribe audio";
        onError?.(errorMessage);
      } finally {
        setIsTranscribing(false);
      }
    },
    [onTranscription, onError]
  );

  // Transcribe audio when recording stops and we have audio
  useEffect(() => {
    if (!isRecording && audioBlob && !hasTranscribed) {
      setHasTranscribed(true);
      transcribeAudio(audioBlob);
    }
  }, [isRecording, audioBlob, hasTranscribed, transcribeAudio]);

  const getButtonIcon = () => {
    if (isTranscribing) {
      return <Loader2 className="w-4 h-4 animate-spin text-white" />;
    }

    if (isRecording) {
      return <Square className="w-4 h-4 text-white" />;
    }

    return <Mic className="w-4 h-4 text-slate-400" />;
  };

  const getButtonColor = () => {
    if (isTranscribing) {
      return "bg-blue-500";
    }

    if (isRecording) {
      return "bg-blue-500 hover:bg-blue-600";
    }

    return "bg-slate-200";
  };

  const handleButtonClick = () => {
    if (isTranscribing) return;

    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  // Don't render until mounted to prevent hydration issues
  if (!isMounted) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className="w-10 h-10 bg-slate-200 rounded-full shadow-lg opacity-50 cursor-not-allowed"
          title="Loading..."
        >
          <Mic className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Recording Button */}
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled || isTranscribing}
        className={`w-10 h-10 transition-all duration-200 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 rounded-full shadow-lg ${getButtonColor()} ${
          disabled || isTranscribing ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title={
          isTranscribing
            ? "Transcribing..."
            : isRecording
            ? "Stop recording"
            : "Start voice recording"
        }
      >
        {getButtonIcon()}
      </button>

      {/* Recording Time */}
      {isRecording && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="font-mono">{formatTime(recordingTime)}</span>
        </div>
      )}

      {/* Error Messages */}
    </div>
  );
}
