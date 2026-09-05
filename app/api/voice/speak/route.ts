import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
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

  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes("Paste Api Key")) {
    return NextResponse.json({ error: "OpenAI API key not configured." }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: TTS_VOICE,
        input: text,
        speed: 1.0,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `OpenAI TTS responded ${response.status}: ${error.slice(0, 400)}` },
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
      { error: cause instanceof Error ? cause.message : "Could not reach the OpenAI TTS endpoint." },
      { status: 502 },
    );
  }
}
