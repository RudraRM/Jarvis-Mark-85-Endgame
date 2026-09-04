"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const GLYPHS = "▚▞█▓▒░ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>*#%@";

function scrambleWord(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  }
  return out;
}

function shuffled(length: number) {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

interface Props {
  text: string;
  /** When false the text renders resolved immediately (replayed history). */
  animate?: boolean;
  onSettled?: () => void;
}

/**
 * DiffusionGemma resolves a whole canvas of blocks at once rather than
 * streaming word by word, so the UI mimics that: every block starts as blurred
 * noise and snaps into focus in a random order, like a canvas denoising.
 */
export default function BlockDiffusionText({ text, animate = true, onSettled }: Props) {
  const blocks = useMemo(() => text.split(/(\s+)/).filter(Boolean), [text]);
  const [resolved, setResolved] = useState<boolean[]>(() =>
    blocks.map(() => !animate),
  );
  const [noise, setNoise] = useState(0);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!animate) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setResolved(blocks.map(() => true));
      onSettled?.();
      return;
    }

    setResolved(blocks.map(() => false));
    settledRef.current = false;

    const wordIndexes = blocks
      .map((block, index) => ({ block, index }))
      .filter(({ block }) => block.trim().length > 0)
      .map(({ index }) => index);

    const order = shuffled(wordIndexes.length).map((i) => wordIndexes[i]);
    const stepMs = Math.max(24, Math.min(70, 900 / Math.max(order.length, 1)));

    const noiseTimer = window.setInterval(() => setNoise((n) => n + 1), 55);
    const timers: number[] = [];

    order.forEach((blockIndex, position) => {
      timers.push(
        window.setTimeout(() => {
          setResolved((previous) => {
            const next = [...previous];
            next[blockIndex] = true;
            return next;
          });
          if (position === order.length - 1 && !settledRef.current) {
            settledRef.current = true;
            window.clearInterval(noiseTimer);
            onSettled?.();
          }
        }, position * stepMs + 90),
      );
    });

    // Whitespace resolves immediately so line wrapping never jitters.
    setResolved((previous) =>
      previous.map((value, index) => (blocks[index].trim() ? value : true)),
    );

    return () => {
      window.clearInterval(noiseTimer);
      timers.forEach(window.clearTimeout);
    };
    // `noise` is intentionally excluded: it only forces a re-render of glyphs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, blocks, text]);

  return (
    <span>
      {blocks.map((block, index) => {
        if (!block.trim()) return <span key={index}>{block}</span>;
        const isResolved = resolved[index];
        return (
          <motion.span
            key={`${index}-${block}`}
            initial={animate ? { opacity: 0.25, filter: "blur(6px)" } : false}
            animate={
              isResolved
                ? { opacity: 1, filter: "blur(0px)" }
                : { opacity: 0.45, filter: "blur(5px)" }
            }
            transition={{ duration: 0.28, ease: "easeOut" }}
            className={isResolved ? "" : "text-cyan-400/70"}
            style={{ display: "inline-block", willChange: "filter, opacity" }}
            data-noise={noise}
          >
            {isResolved ? block : scrambleWord(block.length)}
          </motion.span>
        );
      })}
    </span>
  );
}
