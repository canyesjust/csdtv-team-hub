// Supabase Edge Function: extract-agenda
// Deploy with JWT verification OFF. Requires ANTHROPIC_API_KEY secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SYSTEM_PROMPT = `You extract school board meeting agendas from BoardDocs PDFs into structured JSON.

Return ONLY valid JSON (no markdown fences) matching this schema:
{
  "meeting": { "type": string, "date": string, "scheduled_public_start": string|null, "closed_session_start": string|null },
  "sections": [{ "number": number, "title": string, "broadcastable": boolean }],
  "agenda_items": [{
    "section_number": number,
    "item_number": string,
    "sort_order": number,
    "title": string,
    "original_title": string|null,
    "type": "procedural"|"information"|"action"|"recognition",
    "action_requested": boolean,
    "is_broadcastable": boolean,
    "consent_block": string|null,
    "presenters": [{ "name": string, "title": string|null }],
    "documents": [{ "title": string, "filename": string }],
    "subitems": array|null,
    "needs_review": boolean,
    "review_notes": string|null
  }]
}

Set needs_review=true when uncertain (inferred presenter, shortened title, ambiguous type).
Mark closed-session items with is_broadcastable=false.
Group consent agenda items with the same consent_block value (e.g. "6" for 6.A–6.F).`;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500 });
  }

  let body: { pdf_base64?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const pdfBase64 = body.pdf_base64;
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    return new Response(JSON.stringify({ error: "Missing pdf_base64" }), { status: 400 });
  }

  const rawLen = pdfBase64.length * 0.75;
  if (rawLen > 10 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "PDF too large" }), { status: 413 });
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
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
                text: "Extract the full agenda from this BoardDocs PDF into the JSON schema described in the system prompt.",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), { status: 500 });
    }

    const aiData = await anthropicRes.json();
    const textBlock = aiData.content?.find((b: { type: string }) => b.type === "text");
    const rawText = textBlock?.text || "";

    let parsed: unknown;
    const trimmed = rawText.trim();
    const jsonStr = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
      : trimmed;

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("JSON parse failed:", jsonStr.slice(0, 500));
      return new Response(JSON.stringify({ error: "Could not parse AI response as JSON" }), { status: 500 });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Extraction failed" }),
      { status: 500 },
    );
  }
});
