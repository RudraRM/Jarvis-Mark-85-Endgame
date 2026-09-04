"use client";

import { useCallback, useEffect, useState } from "react";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#03070d]";

export default function FullscreenButton({ onStatus }: { onStatus?: (message: string) => void }) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && !!document.documentElement.requestFullscreen);
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        onStatus?.("Exited fullscreen.");
      } else {
        await document.documentElement.requestFullscreen();
        onStatus?.("Entered fullscreen. Browser chrome hidden.");
      }
    } catch {
      onStatus?.("Fullscreen was refused by the browser.");
    }
  }, [onStatus]);

  // Global F shortcut, ignored while the operator is typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        void toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported}
      aria-pressed={active}
      title={active ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
      className={`hud-clip group flex items-center gap-2 border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[11px] tracking-[0.22em] text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        {active ? (
          <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      {active ? "EXIT FULL" : "FULLSCREEN"}
    </button>
  );
}
