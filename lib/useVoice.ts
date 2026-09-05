"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptResult } from "./types";
import { toWav16kMono } from "./wav";

export type VoiceStatus = "idle" | "listening" | "transcribing" | "error";

interface UseVoiceOptions {
  onTranscript: (result: TranscriptResult) => void;
  onStatus?: (message: string) => void;
  silenceMs?: number;
}

const SILENCE_FLOOR = 0.045;

export function useVoice({ onTranscript, onStatus, silenceMs = 1800 }: UseVoiceOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const amplitudeRef = useRef(0);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const silenceSince = useRef<number | null>(null);
  const stoppingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    silenceSince.current = null;
    amplitudeRef.current = 0;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;

    const ctx = contextRef.current;
    if (ctx) {
      contextRef.current = null;
      if (ctx.state !== "closed") {
        void ctx.close();
      }
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive" || stoppingRef.current) return;
    stoppingRef.current = true;
    recorder.stop();
  }, []);

  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buffer = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sum / buffer.length);
      amplitudeRef.current = Math.min(1, Math.pow(rms * 6.5, 0.75));

      const now = performance.now();
      if (amplitudeRef.current < SILENCE_FLOOR) {
        silenceSince.current ??= now;
        if (now - silenceSince.current > silenceMs) {
          stopRecording();
        }
      } else {
        silenceSince.current = null;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [silenceMs, stopRecording]);

  const start = useCallback(async () => {
    if (status === "listening" || status === "transcribing") return;
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Microphone access is not supported in this browser.");
      return;
    }

    if (!window.MediaRecorder) {
      setStatus("error");
      setError("MediaRecorder is not supported. Please use a modern browser (Chrome, Firefox, Safari 14.1+, or Edge).");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("error");
        setError("AudioContext is not supported in this browser.");
        return;
      }

      const context = new AudioCtx();
      contextRef.current = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      context.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported?.(type)
      );

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      stoppingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        cleanup();
        stoppingRef.current = false;

        if (audioBlob.size < 2048) {
          setStatus("idle");
          onStatus?.("No speech detected.");
          return;
        }

        setStatus("transcribing");
        onStatus?.("Sending audio to Parakeet...");

        try {
          const wav = await toWav16kMono(audioBlob);
          const formData = new FormData();
          formData.append("audio", wav, "speech.wav");

          const response = await fetch("/api/voice/transcribe", {
            method: "POST",
            body: formData,
          });

          const result = (await response.json()) as any;

          if (!response.ok) {
            throw new Error(result.error || "Transcription failed");
          }

          setStatus("idle");
          if (result.text?.trim()) {
            onTranscript(result);
          } else {
            onStatus?.("No speech recognized.");
          }
        } catch (err) {
          setStatus("error");
          const message = err instanceof Error ? err.message : "Transcription failed";
          setError(message);
        }
      };

      recorder.start(250);
      setStatus("listening");
      onStatus?.("Listening. Speak now.");
      startMeter();
    } catch (err) {
      cleanup();
      setStatus("error");

      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setError("Microphone permission was denied. Please allow microphone access in browser settings.");
        } else if (err.name === "NotFoundError") {
          setError("No microphone device found. Please connect a microphone.");
        } else {
          setError(`Microphone error: ${err.message}`);
        }
      } else {
        setError("Could not access microphone.");
      }
    }
  }, [status, startMeter, cleanup, onStatus, onTranscript]);

  const toggle = useCallback(() => {
    if (status === "listening") {
      stopRecording();
    } else {
      void start();
    }
  }, [status, start, stopRecording]);

  return { status, error, amplitudeRef, start, stop: stopRecording, toggle };
}
