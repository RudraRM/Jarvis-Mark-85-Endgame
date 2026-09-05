import { NextResponse } from "next/server";
import { SYSTEM_PROMPT, localReply, resolveIntent } from "@/lib/hermes";
import type { AgentResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LLM_URL = process.env.NVIDIA_LLM_URL ?? "https://integrate.api.nvidia.com/v1/chat/completions";
const LLM_MODEL = process.env.NVIDIA_LLM_MODEL ?? "google/diffusiongemma-26b-a4b-it";

interface AgentRequest {
  text?: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}

/**
 * Hermes "Web Fish" agent loop.
 *
 * 1. Take the Parakeet transcript.
 * 2. Resolve intent and run the mock web-automation tools.
 * 3. Hand the utterance plus tool observations to DiffusionGemma for the prose.
 *
 * DiffusionGemma emits whole blocks rather than a token stream, so this route
 * intentionally returns one complete string — the client animates the reveal.
 */
export async function POST(request: Request) {
  let body: AgentRequest;
  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Field 'text' is required." }, { status: 400 });
  }

  const intent = resolveIntent(text);
  const apiKey = process.env.NVIDIA_API_KEY;

  const respond = (reply: string, degraded: boolean) =>
    NextResponse.json<AgentResponse>({
      reply,
      intent: intent.name,
      commands: intent.commands,
      degraded,
    });

  if (!apiKey) return respond(localReply(text, intent), true);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(body.history ?? [])
      .slice(-6)
      .map((turn) => ({ role: turn.role, content: turn.text })),
    {
      role: "user",
      content: intent.observations.length
        ? `${text}\n\nOBSERVATIONS:\n${intent.observations.map((line) => `- ${line}`).join("\n")}`
        : text,
    },
  ];

  try {
    const response = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.6,
        top_p: 0.9,
        max_tokens: 220,
        stream: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`DiffusionGemma responded ${response.status}: ${detail.slice(0, 400)}`);
      return respond(localReply(text, intent), true);
    }

    let payload: unknown;
    try {
      const text = await response.text();
      if (!text.trim().startsWith("{")) {
        console.error("DiffusionGemma returned non-JSON:", text.slice(0, 200));
        return respond(localReply(text, intent), true);
      }
      payload = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse DiffusionGemma response:", e);
      return respond(localReply(text, intent), true);
    }

    if (!payload || typeof payload !== "object" || !("choices" in payload)) {
      console.error("Invalid DiffusionGemma response shape:", JSON.stringify(payload).slice(0, 200));
      return respond(localReply(text, intent), true);
    }
    const rec = payload as Record<string, unknown>;
    const choices = Array.isArray(rec.choices) ? rec.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    const reply = typeof message?.content === "string" ? message.content.trim() : "";
    return respond(reply || localReply(text, intent), !reply);
  } catch (cause) {
    console.error("DiffusionGemma request failed", cause);
    return respond(localReply(text, intent), true);
  }
}
