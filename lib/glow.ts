import type { GlowState } from "./types";

export interface GlowPreset {
  /** Primary ring colour. */
  core: string;
  /** Accent used by the outer arcs and particle field. */
  accent: string;
  /** Multiplier applied to every emissive channel. */
  intensity: number;
  label: string;
}

export const GLOW_PRESETS: Record<GlowState, GlowPreset> = {
  calm: { core: "#22d3ee", accent: "#38bdf8", intensity: 1, label: "CALM" },
  focus: { core: "#67e8f9", accent: "#a5f3fc", intensity: 1.45, label: "FOCUS" },
  alert: { core: "#f5a524", accent: "#fbbf24", intensity: 1.7, label: "ALERT" },
  combat: { core: "#ef4444", accent: "#fb7185", intensity: 2.1, label: "COMBAT" },
};
