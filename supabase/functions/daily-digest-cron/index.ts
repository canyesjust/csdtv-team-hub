// Invoked by Supabase pg_cron. Proxies to the Next.js daily digest route.
// Deploy with verify_jwt: false. Cron auth uses app_settings.daily_digest_cron_token (see db/daily_digest_cron.sql).
// pg_cron must send apikey (anon JWT) plus x-digest-cron-token — see db/daily_digest_cron.sql.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.csdtvstaff.org";
const CRON_TOKEN_KEY = "daily_digest_cron_token";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Server configuration error" }, 500);
  }

  const cronHeader = req.headers.get("x-digest-cron-token");
  if (!cronHeader) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: row, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CRON_TOKEN_KEY)
    .maybeSingle();

  if (error || !row?.value || cronHeader !== row.value) {
    return json({ error: "Unauthorized" }, 401);
  }

  const digestUrl = `${SITE_URL.replace(/\/$/, "")}/api/cron/daily-staff-digest`;
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    return json({ error: "CRON_SECRET not configured on edge function" }, 500);
  }
  const digestHeaders: Record<string, string> = {
    Authorization: `Bearer ${cronSecret}`,
  };

  const res = await fetch(digestUrl, { method: "GET", headers: digestHeaders });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }

  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
});
