// Supabase Edge Function: generate-signage-slide
// Deploy with JWT verification OFF. Requires ANTHROPIC_API_KEY secret.
// Optional SIGNAGE_GENERATE_SECRET — if set, callers must send x-signage-generate-secret.
//
// Thin model proxy: the Next route (/api/signage/generate-slide) authenticates the
// user, assembles the system+user prompt (lib/signage/slide-guardrails), and validates
// the output. This function only calls Claude and returns the raw HTML.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signage-generate-secret",
};

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Strip markdown fences if the model wraps the HTML despite instructions.
function stripFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return t.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const invokeSecret = Deno.env.get("SIGNAGE_GENERATE_SECRET");
  if (invokeSecret) {
    const provided = req.headers.get("x-signage-generate-secret");
    if (provided !== invokeSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY not configured on edge function" }, 500);
  }

  let body: { system?: string; user?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const system = typeof body.system === "string" ? body.system : "";
  const user = typeof body.user === "string" ? body.user : "";
  if (!system || !user) {
    return jsonResponse({ error: "Missing system or user prompt" }, 400);
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
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return jsonResponse({ error: `Anthropic API error (${anthropicRes.status})` }, 500);
    }

    const aiData = await anthropicRes.json();
    const textBlock = aiData.content?.find((b: { type: string }) => b.type === "text");
    const html = stripFences(textBlock?.text || "");
    if (!html) {
      return jsonResponse({ error: "No HTML in Anthropic response" }, 500);
    }
    return jsonResponse({ html });
  } catch (e) {
    console.error("generate-signage-slide error:", e);
    return jsonResponse({ error: "Generation failed" }, 500);
  }
});
