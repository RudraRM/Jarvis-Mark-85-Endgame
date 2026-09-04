"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { LogLine } from "@/lib/types";

const LEVEL_COLOR: Record<LogLine["level"], string> = {
  ok: "text-cyan-300/70",
  warn: "text-amber-300/80",
  crit: "text-red-400/80",
};

export default function LogStrip({ lines }: { lines: LogLine[] }) {
  return (
    <section
      aria-label="Structural log"
      className="hud-panel hud-clip pointer-events-auto w-[min(22rem,92vw)]"
    >
      <header className="border-b border-cyan-500/15 px-4 py-2">
        <h2 className="text-[10px] tracking-[0.3em] text-cyan-300/80">STRUCTURAL LOG</h2>
      </header>
      <ul className="max-h-32 space-y-1 overflow-y-auto px-4 py-3 text-[10px]">
        <AnimatePresence initial={false}>
          {lines.map((line) => (
            <motion.li
              key={line.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-3"
            >
              <span className="text-cyan-600/60">{line.time}</span>
              <span className={LEVEL_COLOR[line.level]}>{line.message}</span>
            </motion.li>
          ))}
        </AnimatePresence>
        {lines.length === 0 && <li className="text-cyan-600/50">AWAITING INPUT</li>}
      </ul>
    </section>
  );
}
