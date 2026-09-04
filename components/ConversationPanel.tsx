"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import BlockDiffusionText from "./BlockDiffusionText";
import type { ConversationTurn } from "@/lib/types";

interface Props {
  turns: ConversationTurn[];
  thinking: boolean;
  onSettled: (id: string) => void;
}

export default function ConversationPanel({ turns, thinking, onSettled }: Props) {
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking]);

  return (
    <section
      aria-label="Conversation with the Web Fish agent"
      className="hud-panel hud-clip pointer-events-auto w-[min(30rem,92vw)]"
    >
      <header className="flex items-center justify-between border-b border-cyan-500/15 px-4 py-2">
        <h2 className="text-[10px] tracking-[0.3em] text-cyan-300/80">HERMES · WEB FISH AGENT</h2>
        <span className="text-[9px] tracking-[0.2em] text-cyan-500/50">DIFFUSIONGEMMA-26B</span>
      </header>

      <div ref={scroller} className="max-h-44 space-y-3 overflow-y-auto px-4 py-3 text-[12px] leading-relaxed">
        {turns.length === 0 && !thinking && (
          <p className="text-cyan-500/50">
            Voice is the default channel. Press the microphone, or the M key, and speak.
          </p>
        )}

        <AnimatePresence initial={false}>
          {turns.map((turn) => (
            <motion.div
              key={turn.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              <span
                className={`mr-2 text-[9px] tracking-[0.25em] ${
                  turn.role === "user" ? "text-sky-400/70" : "text-cyan-300/80"
                }`}
              >
                {turn.role === "user" ? "OPERATOR" : "J.A.R.V.I.S."}
              </span>
              <span className={turn.role === "user" ? "text-sky-100/80" : "text-cyan-50"}>
                {turn.role === "assistant" ? (
                  <BlockDiffusionText
                    text={turn.text}
                    animate={turn.animate}
                    onSettled={() => onSettled(turn.id)}
                  />
                ) : (
                  turn.text
                )}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>

        {thinking && (
          <p className="animate-flicker text-[10px] tracking-[0.3em] text-cyan-400/70">
            RESOLVING CANVAS ░▒▓
          </p>
        )}
      </div>
    </section>
  );
}
