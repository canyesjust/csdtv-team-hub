// Supabase Edge Function: summarize-interaction
// Contact CRM, Phase 2. Generates a one-line summary of a captured email and
// writes it back to contact_interactions.summary.
//
// Deploy with JWT verification ON: the inbound webhook calls this with the
// service-role bearer token, so only the service role (or a signed-in user) can
// invoke it. Requires ANTHROPIC_API_KEY (already configured for extract-agenda).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 120;
const MAX_INPUT_CHARS = 8000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!apiKey) return jsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  if (!supabaseUrl || !serviceKey) return jsonResponse({ error: "Supabase env not configured" }, 500);

  let body: { interaction_id?: string; subject?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const interactionId = (body.interaction_id || "").trim();
  if (!UUID_RE.test(interactionId)) {
    return jsonResponse({ error: "Missing or invalid interaction_id" }, 400);
  }

  const subject = (body.subject || "").trim();
  const text = (body.text || "").trim().slice(0, MAX_INPUT_CHARS);
  if (!subject && !text) {
    return jsonResponse({ error: "Nothing to summarize" }, 400);
  }

  const prompt =
    "You are labeling a CRM interaction. Write ONE concise line (max ~120 characters) " +
    "summarizing what this email was about, from the sender's perspective. Focus on what " +
    "was discussed, requested, or agreed. No preamble, no quotes, no trailing period needed.\n\n" +
    `Subject: ${subject || "(none)"}\n\nBody:\n${text || "(empty)"}`;

  let summary = "";
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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText.slice(0, 280));
      return jsonResponse({ error: `Anthropic API error (${anthropicRes.status})` }, 500);
    }

    const aiData = await anthropicRes.json();
    const textBlock = aiData.content?.find((b: { type: string }) => b.type === "text");
    summary = (textBlock?.text || "").trim().replace(/^["']|["']$/g, "").slice(0, 200);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Summarization failed" }, 500);
  }

  if (!summary) {
    return jsonResponse({ error: "Empty summary" }, 500);
  }

  // Write the summary back. Only updates pending bcc rows (the capture pipeline),
  // so this cannot overwrite a manually-edited, approved interaction.
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/contact_interactions?id=eq.${interactionId}&review_state=eq.pending&source=eq.bcc`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ summary }),
    },
  );

  if (!patchRes.ok) {
    const t = await patchRes.text();
    console.error("Write-back failed:", patchRes.status, t.slice(0, 280));
    return jsonResponse({ error: "Failed to save summary" }, 500);
  }

  return jsonResponse({ ok: true, summary });
});
