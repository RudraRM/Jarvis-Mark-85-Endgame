/** Ambient glow presets the agent can switch the core into. */
export type GlowState = "calm" | "focus" | "alert" | "combat";

/** Structured side effects the Hermes agent can fire at the 3D core / HUD. */
export type AgentCommand =
  | { type: "spin"; multiplier: number }
  | { type: "glow"; state: GlowState }
  | { type: "scale"; factor: number }
  | { type: "log"; level: "ok" | "warn" | "crit"; message: string }
  | { type: "web"; task: string; result: string };

export interface AgentResponse {
  /** Prose the assistant speaks back, revealed with the block-diffusion effect. */
  reply: string;
  /** Short label for the intent the orchestrator resolved. */
  intent: string;
  commands: AgentCommand[];
  /** True when DiffusionGemma was unreachable and the local fallback answered. */
  degraded: boolean;
}

export interface TranscriptResult {
  text: string;
  model: string;
  degraded: boolean;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Assistant turns animate in with the block-diffusion reveal exactly once. */
  animate: boolean;
}

export interface LogLine {
  id: string;
  time: string;
  message: string;
  level: "ok" | "warn" | "crit";
}
