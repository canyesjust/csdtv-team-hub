// Supabase Edge Function: extract-agenda
// Deploy with JWT verification OFF. Requires ANTHROPIC_API_KEY secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 16000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function parseAnthropicError(status: number, errText: string): string {
  try {
    const parsed = JSON.parse(errText) as { error?: { type?: string; message?: string } };
    const msg = parsed.error?.message;
    if (msg) return `Anthropic API (${status}): ${msg}`;
  } catch {
    /* use raw text */
  }
  const snippet = errText.slice(0, 280).trim();
  return snippet ? `Anthropic API (${status}): ${snippet}` : `Anthropic API error (${status})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY not configured on edge function" }, 500);
  }

  let body: { pdf_base64?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const pdfBase64 = body.pdf_base64;
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return jsonResponse({ error: "Missing pdf_base64 in request body" }, 400);
  }

  const rawLen = pdfBase64.length * 0.75;
  if (rawLen > 10 * 1024 * 1024) {
    return jsonResponse({ error: "PDF too large (max 10 MB)" }, 413);
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text:
                  "Extract the agenda from this PDF following the schema and rules in the system prompt. Return only valid JSON.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return jsonResponse({ error: parseAnthropicError(anthropicRes.status, errText) }, 500);
    }

    const aiData = await anthropicRes.json();
    const textBlock = aiData.content?.find((b: { type: string }) => b.type === "text");
    const rawText = textBlock?.text || "";

    if (!rawText.trim()) {
      return jsonResponse({ error: "No text content in Anthropic response" }, 500);
    }

    const trimmed = rawText.trim();
    const jsonStr = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      : trimmed;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("JSON parse failed:", jsonStr.slice(0, 500));
      return jsonResponse(
        {
          error: "Failed to parse extracted JSON from AI response",
          raw_response_preview: jsonStr.slice(0, 500),
        },
        500,
      );
    }

    return jsonResponse(parsed);
  } catch (e) {
    console.error(e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Extraction failed" },
      500,
    );
  }
});
