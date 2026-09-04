"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TranscriptResult } from "./types";
import { toWav16kMono } from "./wav";

export type VoiceStatus = "idle" | "listening" | "transcribing" | "error";

interface UseVoiceOptions {
  /** Receives the final Parakeet transcript once a phrase completes. */
  onTranscript: (result: TranscriptResult) => void;
  /** Narration sink for the screen-reader live region. */
  onStatus?: (message: string) => void;
  /** Auto-stop after this many ms below the silence floor. */
  silenceMs?: number;
}

const SILENCE_FLOOR = 0.045;

/**
 * Microphone capture + NVIDIA Parakeet transcription.
 *
 * The analyser node feeds `amplitudeRef` every animation frame so the 3D core
 * can pulse with the voice without triggering a React render per sample.
 */
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

  const teardown = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    silenceSince.current = null;
    amplitudeRef.current = 0;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;

    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive" || stoppingRef.current) return;
    stoppingRef.current = true;
    recorder.stop();
  }, []);

  /** Poll the analyser for an RMS envelope and drive silence detection. */
  const startMeter = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Float32Array(analyser.fftSize);

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      // Perceptual-ish curve so quiet speech still moves the core.
      amplitudeRef.current = Math.min(1, Math.pow(rms * 6.5, 0.75));

      const now = performance.now();
      if (amplitudeRef.current < SILENCE_FLOOR) {
        silenceSince.current ??= now;
        if (now - silenceSince.current > silenceMs) stop();
      } else {
        silenceSince.current = null;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [silenceMs, stop]);

  const start = useCallback(async () => {
    if (status === "listening" || status === "transcribing") return;
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Microphone capture is unavailable in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtx();
      contextRef.current = context;

      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      context.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (candidate) => MediaRecorder.isTypeSupported?.(candidate),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      stoppingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        chunksRef.current = [];
        teardown();
        stoppingRef.current = false;

        if (recorded.size < 2048) {
          setStatus("idle");
          onStatus?.("No speech captured.");
          return;
        }

        setStatus("transcribing");
        onStatus?.("Transcribing with NVIDIA Parakeet.");

        try {
          const wav = await toWav16kMono(recorded);
          const body = new FormData();
          body.append("audio", wav, "speech.wav");

          const response = await fetch("/api/voice/transcribe", { method: "POST", body });
          const payload = (await response.json()) as TranscriptResult & { error?: string };
          if (!response.ok) throw new Error(payload.error || "Transcription failed.");

          setStatus("idle");
          if (payload.text.trim()) onTranscript(payload);
          else onStatus?.("Parakeet returned no speech.");
        } catch (cause) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "Transcription failed.");
        }
      };

      recorder.start(250);
      setStatus("listening");
      onStatus?.("Listening. Speak now.");
      startMeter();
    } catch (cause) {
      teardown();
      setStatus("error");
      setError(
        cause instanceof Error && cause.name === "NotAllowedError"
          ? "Microphone permission denied."
          : "Could not open the microphone.",
      );
    }
  }, [onStatus, onTranscript, startMeter, status, teardown]);

  const toggle = useCallback(() => {
    if (status === "listening") stop();
    else void start();
  }, [start, status, stop]);

  return { status, error, amplitudeRef, start, stop, toggle };
}
