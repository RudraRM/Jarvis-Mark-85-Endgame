import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASR_URL =
  process.env.NVIDIA_ASR_URL ?? "https://integrate.api.nvidia.com/v1/audio/transcriptions";
const ASR_MODEL = process.env.NVIDIA_ASR_MODEL ?? "nvidia/parakeet-ctc-1.1b-asr";

/** Offline demo phrases used when no NVIDIA key is configured. */
const SIMULATED = [
  "Jarvis, run a full diagnostic on the reactor core.",
  "Spin up the core and switch to combat glow.",
  "Search the web for the latest arc reactor telemetry.",
  "Report system status.",
];

/**
 * Pull the transcript out of whichever response shape the NIM node returns.
 * The hosted OpenAI-compatible route returns `{ text }`; a self-hosted Riva
 * NIM container returns a nested `alternatives` structure.
 */
function extractText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  const record = payload as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.transcript === "string") return record.transcript;

  const results = record.results;
  if (Array.isArray(results)) {
    return results
      .map((entry) => {
        const alternatives = (entry as Record<string, unknown>)?.alternatives;
        if (Array.isArray(alternatives) && alternatives.length > 0) {
          const first = alternatives[0] as Record<string, unknown>;
          return typeof first.transcript === "string" ? first.transcript : "";
        }
        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}

export async function POST(request: Request) {
  let audio: File | null = null;

  try {
    const form = await request.formData();
    const field = form.get("audio");
    if (field instanceof File) audio = field;
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with an audio field." }, { status: 400 });
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "No audio payload received." }, { status: 400 });
  }

  const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25 MB
  if (audio.size > MAX_AUDIO_SIZE) {
    return NextResponse.json(
      { error: `Audio file exceeds ${MAX_AUDIO_SIZE / 1024 / 1024}MB limit.` },
      { status: 413 }
    );
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    // Keep the whole pipeline demoable without credentials.
    const text = SIMULATED[Math.floor(Math.random() * SIMULATED.length)];
    return NextResponse.json({ text, model: "simulated-parakeet", degraded: true });
  }

  try {
    const buffer = await audio.arrayBuffer();
    const upstream = new FormData();
    // The audio arrives already normalised to 16 kHz mono 16-bit PCM WAV.
    upstream.append("file", new Blob([buffer], { type: "audio/wav" }), "speech.wav");
    upstream.append("model", ASR_MODEL);
    upstream.append("language", "en-US");
    upstream.append("response_format", "json");

    const response = await fetch(ASR_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      },
      body: upstream,
      cache: "no-store",
    });

    const raw = await response.text();
    if (!response.ok) {
      return NextResponse.json(
        { error: `Parakeet ASR responded ${response.status}: ${raw.slice(0, 400)}` },
        { status: 502 },
      );
    }

    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* Some NIM builds return bare text. */
    }

    return NextResponse.json({ text: extractText(parsed).trim(), model: ASR_MODEL, degraded: false });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not reach the Parakeet NIM endpoint." },
      { status: 502 },
    );
  }
}
