import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASR_URL =
  process.env.NVIDIA_ASR_URL ?? "https://ai.nvidia.com/api/v1/audio/transcriptions";
const ASR_MODEL = process.env.ASR_MODEL ?? "openai/whisper-large";
const API_KEY = process.env.NVIDIA_API_KEY;

/** Offline demo phrases used when no API key is configured. */
const SIMULATED = [
  "Jarvis, run a full diagnostic on the reactor core.",
  "Spin up the core and switch to combat glow.",
  "Search the web for the latest arc reactor telemetry.",
  "Report system status.",
];

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

  if (!API_KEY || API_KEY.includes("Paste Api Key")) {
    // Keep the whole pipeline demoable without credentials.
    const text = SIMULATED[Math.floor(Math.random() * SIMULATED.length)];
    return NextResponse.json({ text, model: "simulated-whisper", degraded: true });
  }

  try {
    const buffer = await audio.arrayBuffer();
    const formData = new FormData();
    // The audio arrives already normalised to 16 kHz mono 16-bit PCM WAV.
    formData.append("file", new Blob([buffer], { type: "audio/wav" }), "speech.wav");
    formData.append("model", ASR_MODEL);
    formData.append("language", "en");

    const response = await fetch(ASR_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: formData,
      cache: "no-store",
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error(`Whisper API error ${response.status}:`, raw.slice(0, 500));
      return NextResponse.json(
        { error: `Whisper API responded ${response.status}: ${raw.slice(0, 400)}` },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("Failed to parse Whisper response. Raw response:", raw.slice(0, 500));
      console.error("Parse error:", parseError);
      return NextResponse.json(
        { error: `Failed to parse Whisper response: ${raw.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const record = parsed as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim() : "";

    return NextResponse.json({ text, model: ASR_MODEL, degraded: false });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not reach the Whisper API endpoint." },
      { status: 502 },
    );
  }
}
