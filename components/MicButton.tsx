"use client";

import { motion } from "framer-motion";
import { forwardRef, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "@/lib/useVoice";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-4 focus-visible:ring-offset-[#03070d]";

const LABEL: Record<VoiceStatus, string> = {
  idle: "PRESS TO SPEAK",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING",
  error: "MIC ERROR",
};

interface Props {
  status: VoiceStatus;
  amplitudeRef: React.MutableRefObject<number>;
  onToggle: () => void;
  onStatusChange?: (status: VoiceStatus) => void;
}

/** Primary control: voice is the default input mode for this HUD. */
const MicButton = forwardRef<HTMLButtonElement, Props>(function MicButton(
  { status, amplitudeRef, onToggle, onStatusChange },
  ref
) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const [level, setLevel] = useState(0);

  // Sample the shared amplitude ref for the button's own halo.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setLevel(amplitudeRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [amplitudeRef]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const listening = status === "listening";
  const busy = status === "transcribing";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        ref={ref}
        type="button"
        onClick={onToggle}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Start listening with NVIDIA Parakeet"}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border transition ${FOCUS_RING} ${
          listening
            ? "border-cyan-300 bg-cyan-400/20 text-cyan-100"
            : status === "error"
              ? "border-red-500/60 bg-red-500/10 text-red-300"
              : "border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
        }`}
      >
        <span
          ref={ringRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/50"
          style={{
            transform: `scale(${1 + (listening ? level * 0.9 : 0)})`,
            opacity: listening ? 0.25 + level * 0.7 : 0,
            transition: "opacity 120ms linear",
          }}
        />
        {busy ? (
          <motion.span
            className="h-5 w-5 rounded-full border-2 border-cyan-300/30 border-t-cyan-200"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, ease: "linear", duration: 0.9 }}
            aria-hidden="true"
          />
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span className="text-[10px] tracking-[0.28em] text-cyan-300/70">{LABEL[status]}</span>
    </div>
  );
});

export default MicButton;
