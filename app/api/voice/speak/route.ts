import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTS_URL = process.env.NVIDIA_TTS_URL ?? "https://ai.nvidia.com/api/v1/audio/speech";
const API_KEY = process.env.NVIDIA_API_KEY;
const TTS_VOICE = process.env.TTS_VOICE ?? "alloy";

interface SpeakRequest {
  text: string;
}

export async function POST(request: Request) {
  let body: SpeakRequest;

  try {
    body = (await request.json()) as SpeakRequest;
  } catch {
    return NextResponse.json({ error: "Expected JSON body with 'text' field." }, { status: 400 });
  }

  const { text } = body;
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Field 'text' is required and must be a string." }, { status: 400 });
  }

  if (!API_KEY || API_KEY.includes("Paste Api Key")) {
    return NextResponse.json({ error: "NVIDIA API key not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nvidia/tts-1",
        voice: TTS_VOICE,
        input: text,
        speed: 1.0,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `TTS API responded ${response.status}: ${error.slice(0, 400)}` },
        { status: 502 },
      );
    }

    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Could not reach the TTS endpoint." },
      { status: 502 },
    );
  }
}
