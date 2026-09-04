import type { AgentCommand, GlowState } from "./types";

export interface Intent {
  name: string;
  commands: AgentCommand[];
  /** Tool output handed to DiffusionGemma as grounding context. */
  observations: string[];
}

/** Mock "web fish" automation surface — deterministic stand-ins for real tools. */
const WEB_TASKS: Record<string, (query: string) => string> = {
  search: (query) =>
    `Indexed 4 sources for "${query}". Top hit: Stark Industries internal wiki, revision 55, relevance 0.94.`,
  telemetry: () =>
    "Pulled reactor telemetry feed: output 100%, flux variance 0.4%, no thermal excursions in the last 24h.",
  threats: () =>
    "Threat board sweep complete: 3 unresolved contacts, highest severity HIGH, all outside the perimeter.",
  diagnostics: () =>
    "Diagnostic pass: power core OK, suit systems OK, weapons OK, sensors OK, AI core OK, network OK.",
};

const GLOW_WORDS: Array<[RegExp, GlowState]> = [
  [/\b(combat|battle|fight|engage|weapons hot)\b/i, "combat"],
  [/\b(alert|warning|danger|threat|red)\b/i, "alert"],
  [/\b(focus|analy[sz]e|concentrate|scan)\b/i, "focus"],
  [/\b(calm|stand ?down|relax|idle|normal|reset)\b/i, "calm"],
];

const stamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

/**
 * The Hermes orchestrator: read the utterance, resolve intent, run mock web
 * automation, and emit structured commands the HUD replays against the 3D core.
 */
export function resolveIntent(utterance: string): Intent {
  const text = utterance.trim();
  const commands: AgentCommand[] = [];
  const observations: string[] = [];
  const names: string[] = [];

  for (const [pattern, state] of GLOW_WORDS) {
    if (pattern.test(text)) {
      commands.push({ type: "glow", state });
      commands.push({ type: "log", level: state === "calm" ? "ok" : "warn", message: `AMBIENT STATE → ${state.toUpperCase()}` });
      names.push(`glow:${state}`);
      break;
    }
  }

  if (/\b(spin|rotate|accelerate|faster|spin up)\b/i.test(text)) {
    const multiplier = /\b(fast|faster|max|maximum|full)\b/i.test(text) ? 6 : 3;
    commands.push({ type: "spin", multiplier });
    commands.push({ type: "log", level: "ok", message: `CORE ROTATION ×${multiplier}` });
    names.push("spin");
  }
  if (/\b(slow|stop|halt|steady|hold)\b/i.test(text)) {
    commands.push({ type: "spin", multiplier: 0.35 });
    commands.push({ type: "log", level: "ok", message: "CORE ROTATION DAMPED" });
    names.push("slow");
  }
  if (/\b(zoom in|magnify|enlarge|bigger|closer)\b/i.test(text)) {
    commands.push({ type: "scale", factor: 1.45 });
    names.push("zoom-in");
  }
  if (/\b(zoom out|shrink|smaller|back off)\b/i.test(text)) {
    commands.push({ type: "scale", factor: 0.75 });
    names.push("zoom-out");
  }

  if (/\b(diagnostic|self ?test|system check|status|report)\b/i.test(text)) {
    const result = WEB_TASKS.diagnostics(text);
    commands.push({ type: "web", task: "diagnostics", result });
    commands.push({ type: "log", level: "ok", message: "STRUCTURAL DIAGNOSTIC COMPLETE" });
    observations.push(result);
    names.push("diagnostics");
  }
  if (/\b(threat|hostile|contact|intruder)\b/i.test(text)) {
    const result = WEB_TASKS.threats(text);
    commands.push({ type: "web", task: "threats", result });
    commands.push({ type: "log", level: "crit", message: "THREAT BOARD SWEEP" });
    observations.push(result);
    names.push("threats");
  }
  if (/\b(telemetry|reactor|power|output)\b/i.test(text)) {
    const result = WEB_TASKS.telemetry(text);
    commands.push({ type: "web", task: "telemetry", result });
    observations.push(result);
    names.push("telemetry");
  }
  if (/\b(search|look ?up|find|google|browse|web)\b/i.test(text)) {
    const query = text.replace(/^.*?\b(search|look ?up|find|google|browse)\b\s*(for)?\s*/i, "") || text;
    const result = WEB_TASKS.search(query);
    commands.push({ type: "web", task: "search", result });
    commands.push({ type: "log", level: "ok", message: `WEB FISH → "${query.slice(0, 32)}"` });
    observations.push(result);
    names.push("web-search");
  }

  commands.push({ type: "log", level: "ok", message: `UTTERANCE @ ${stamp()}` });

  return {
    name: names.length ? names.join(", ") : "conversation",
    commands,
    observations,
  };
}

export const SYSTEM_PROMPT = [
  "You are J.A.R.V.I.S., Tony Stark's assistant, running on the Mark 55 HUD.",
  "Speak in short, precise, dry-witted British sentences. Two or three sentences at most.",
  "You are wired to a live 3D reactor core; when the operator asks you to change it, confirm the change you made.",
  "Ground your answer in the OBSERVATIONS block when it is present. Never invent telemetry numbers that contradict it.",
].join(" ");

/** Deterministic reply used when the DiffusionGemma endpoint is unreachable. */
export function localReply(utterance: string, intent: Intent): string {
  if (intent.observations.length > 0) {
    return `Right away, sir. ${intent.observations.join(" ")}`;
  }
  if (intent.name.includes("glow")) {
    return "Ambient state reconfigured, sir. The core is holding its new signature.";
  }
  if (intent.name.includes("spin")) {
    return "Rotation accelerated. The core is running well inside tolerance.";
  }
  if (intent.name.includes("zoom")) {
    return "Adjusting the viewport. Let me know when the framing suits you.";
  }
  return `Noted, sir — "${utterance.trim().slice(0, 120)}". Standing by on the core.`;
}
