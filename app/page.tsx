"use client";

import dynamic from "next/dynamic";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useCallback, useEffect, useRef, useState } from "react";
import ConversationPanel from "@/components/ConversationPanel";
import FullscreenButton from "@/components/FullscreenButton";
import LogStrip from "@/components/LogStrip";
import MicButton from "@/components/MicButton";
import { GLOW_PRESETS } from "@/lib/glow";
import type {
  AgentResponse,
  ConversationTurn,
  GlowState,
  LogLine,
  TranscriptResult,
} from "@/lib/types";
import { useVoice } from "@/lib/useVoice";

// WebGL cannot render on the server.
const CoreCanvas = dynamic(() => import("@/components/CoreCanvas"), { ssr: false });

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#03070d]";

const uid = () => Math.random().toString(36).slice(2, 10);
const clock = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function Page() {
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [glow, setGlow] = useState<GlowState>("calm");
  const [spin, setSpin] = useState(1);
  const [scale, setScale] = useState(1);
  const [thinking, setThinking] = useState(false);
  const [narration, setNarration] = useState("Jarvis core online and idle.");
  const [typed, setTyped] = useState("");
  const [time, setTime] = useState("");
  const [degraded, setDegraded] = useState(false);
  const narrationTimeoutRef = useRef<number | null>(null);

  const turnsRef = useRef<ConversationTurn[]>([]);
  turnsRef.current = turns;

  const updateNarration = useCallback((message: string) => {
    if (narrationTimeoutRef.current) clearTimeout(narrationTimeoutRef.current);
    narrationTimeoutRef.current = window.setTimeout(() => {
      setNarration(message);
      narrationTimeoutRef.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (narrationTimeoutRef.current) clearTimeout(narrationTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const tick = () => setTime(clock());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const pushLog = useCallback((message: string, level: LogLine["level"] = "ok") => {
    setLogs((previous) => [{ id: uid(), time: clock(), message, level }, ...previous].slice(0, 40));
  }, []);

  /** Replay the structured commands the Hermes agent emitted. */
  const applyCommands = useCallback(
    (response: AgentResponse) => {
      const notes: string[] = [];

      for (const command of response.commands) {
        switch (command.type) {
          case "glow":
            setGlow(command.state);
            notes.push(`ambient glow set to ${command.state}`);
            break;
          case "spin":
            setSpin(command.multiplier);
            notes.push(`core rotation at ${command.multiplier} times baseline`);
            break;
          case "scale":
            setScale((current) => Math.max(0.55, Math.min(2.1, current * command.factor)));
            notes.push("core scale adjusted");
            break;
          case "log":
            pushLog(command.message, command.level);
            break;
          case "web":
            pushLog(`WEB TASK · ${command.task.toUpperCase()}`, "ok");
            notes.push(`ran the ${command.task} web task`);
            break;
        }
      }

      setNarration(
        `Agent intent ${response.intent}. ${
          notes.length ? `Actions: ${notes.join(", ")}.` : "No core changes."
        } Reply: ${response.reply}`,
      );
    },
    [pushLog],
  );

  /** Send an utterance through the Hermes agent loop. */
  const dispatch = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      setTurns((previous) => [
        ...previous,
        { id: uid(), role: "user", text: clean, animate: false },
      ]);
      setThinking(true);
      setNarration("Web Fish agent is resolving the request.");

      try {
        const response = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean,
            history: turnsRef.current.slice(-6).map(({ role, text: body }) => ({ role, text: body })),
          }),
        });
        const payload = (await response.json()) as AgentResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Agent request failed.");

        setDegraded(payload.degraded);
        applyCommands(payload);
        setTurns((previous) => [
          ...previous,
          { id: uid(), role: "assistant", text: payload.reply, animate: true },
        ]);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Agent request failed.";
        pushLog(`AGENT ERROR · ${message}`, "crit");
        setNarration(`Agent error: ${message}`);
      } finally {
        setThinking(false);
      }
    },
    [applyCommands, pushLog],
  );

  const onTranscript = useCallback(
    (result: TranscriptResult) => {
      pushLog(`ASR · ${result.model}${result.degraded ? " (simulated)" : ""}`, result.degraded ? "warn" : "ok");
      void dispatch(result.text);
    },
    [dispatch, pushLog],
  );

  const micButtonRef = useRef<HTMLButtonElement>(null);

  const onVoiceDone = useCallback(() => {
    if (micButtonRef.current && !micButtonRef.current.matches(":focus")) {
      micButtonRef.current.focus();
    }
  }, []);

  const { status, error, amplitudeRef, toggle } = useVoice({
    onTranscript,
    onStatus: updateNarration,
  });

  // Voice is the default channel: M toggles the microphone from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  useEffect(() => {
    if (error) pushLog(`MIC · ${error}`, "crit");
  }, [error, pushLog]);

  const settleTurn = useCallback((id: string) => {
    setTurns((previous) =>
      previous.map((turn) => (turn.id === id ? { ...turn, animate: false } : turn)),
    );
  }, []);

  const preset = GLOW_PRESETS[glow];

  return (
    <ErrorBoundary>
      <main className="relative h-screen w-screen overflow-hidden">
      <CoreCanvas
        amplitudeRef={amplitudeRef}
        glow={glow}
        spinMultiplier={spin}
        scale={scale}
        onManipulate={updateNarration}
      />

      {/* Screen-reader narration of the core and the agent. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only-live">
        {narration}
      </div>

      {/* HUD chrome floats above the canvas but never steals its pointer events. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-5 pb-4 pt-5">
        <header className="flex items-start justify-between gap-4">
          <div className="pointer-events-auto">
            <h1 className="text-lg tracking-[0.5em] text-cyan-200">J.A.R.V.I.S.</h1>
            <p className="text-[9px] tracking-[0.28em] text-cyan-500/60">
              JUST A RATHER VERY INTELLIGENT SYSTEM
            </p>
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            <dl className="hidden text-right text-[10px] tracking-[0.2em] text-cyan-400/70 sm:block">
              <div className="flex items-center justify-end gap-2">
                <dt className="text-cyan-600/60">STATE</dt>
                <dd style={{ color: preset.core }}>{preset.label}</dd>
              </div>
              <div className="flex items-center justify-end gap-2">
                <dt className="text-cyan-600/60">SPIN</dt>
                <dd>×{spin.toFixed(2)}</dd>
              </div>
              <div className="flex items-center justify-end gap-2">
                <dt className="text-cyan-600/60">TIME</dt>
                <dd suppressHydrationWarning>{time}</dd>
              </div>
            </dl>
            <FullscreenButton onStatus={setNarration} />
          </div>
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-6">
          <div className="hidden justify-self-start lg:block">
            <LogStrip lines={logs} />
          </div>

          <div className="pointer-events-auto flex flex-col items-center gap-3">
            <MicButton
              ref={micButtonRef}
              status={status}
              amplitudeRef={amplitudeRef}
              onToggle={toggle}
              onStatusChange={(s) => s === "idle" && onVoiceDone()}
            />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void dispatch(typed);
                setTyped("");
              }}
              className="flex items-center gap-2"
            >
              <label htmlFor="text-fallback" className="sr-only-live">
                Type a command instead of speaking
              </label>
              <input
                id="text-fallback"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="…or type a command"
                className={`hud-clip w-56 border border-cyan-500/25 bg-black/40 px-3 py-2 text-[11px] text-cyan-100 placeholder:text-cyan-700 ${FOCUS_RING}`}
              />
              <button
                type="submit"
                className={`hud-clip border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-[10px] tracking-[0.2em] text-cyan-200 transition hover:bg-cyan-500/20 ${FOCUS_RING}`}
              >
                SEND
              </button>
            </form>
            <p className="hidden whitespace-nowrap text-center text-[8px] tracking-[0.16em] text-cyan-700 2xl:block">
              DRAG ROTATE · SHIFT+DRAG ROLL · WASD · Q E ROLL · +/− ZOOM · 0 RESET · M MIC · F FULLSCREEN
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 justify-self-end">
            {degraded && (
              <p className="pointer-events-auto text-[9px] tracking-[0.22em] text-amber-400/80">
                NIM CREDENTIALS ABSENT · LOCAL FALLBACK ACTIVE
              </p>
            )}
            <ConversationPanel turns={turns} thinking={thinking} onSettled={settleTurn} />
          </div>
        </div>
      </div>
      </main>
    </ErrorBoundary>
  );
}
