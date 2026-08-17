/*
  TEMPORARY Cablecast diagnostic page — DELETE after wiring live data.

  Auth-gated (path is NOT under /watch, so Team Hub middleware requires login).

  Finding so far: the authenticated /v1 API is NOT reachable from the public
  internet — canyons-school.cablecast.tv is a CloudFront distribution that only
  serves cachable public GET content (POST -> 403 "only cachable requests",
  GET /v1/* -> 502). So this version tests the PUBLIC publicsitedata endpoints,
  which ARE what that CloudFront serves, plus echoes the deployment's config.
*/
import { publicGet, authedGet } from "@/lib/cablecast/client";
import { serverEnv, publicEnv } from "@/lib/cablecast/config";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Cablecast Diagnostics" } };

interface ProbeResult {
  label: string;
  ok: boolean;
  note: string;
  json?: string;
}

function pretty(data: unknown, max = 6000): string {
  const s = JSON.stringify(data, null, 2);
  return s.length > max ? `${s.slice(0, max)}\n… (truncated)` : s;
}

async function probe(
  label: string,
  fn: () => Promise<unknown>,
  note?: (data: unknown) => string,
): Promise<ProbeResult> {
  try {
    const data = await fn();
    return { label, ok: true, note: note ? note(data) : "ok", json: pretty(data) };
  } catch (error) {
    const e = error as { status?: number; message?: string; body?: string };
    return {
      label,
      ok: false,
      note: `${e.status ?? ""} ${e.message ?? String(error)}`.trim(),
      json: e.body ? String(e.body).slice(0, 1200) : undefined,
    };
  }
}

function summariseSiteConfig(data: unknown): string {
  const d = data as {
    title?: string;
    galleries?: { id?: number; title?: string }[];
    slideShow?: unknown[];
    scheduleItems?: unknown[];
    liveStreamUrl?: string;
  };
  const galleries = Array.isArray(d?.galleries)
    ? d.galleries.map((g) => `#${g?.id} ${g?.title ?? ""}`).join(", ")
    : "none";
  return [
    `title: ${d?.title ?? "?"}`,
    `galleries: ${Array.isArray(d?.galleries) ? d.galleries.length : 0} [${galleries}]`,
    `slideShow: ${Array.isArray(d?.slideShow) ? d.slideShow.length : 0}`,
    `scheduleItems: ${Array.isArray(d?.scheduleItems) ? d.scheduleItems.length : 0}`,
    `liveStreamUrl: ${d?.liveStreamUrl ? "yes" : "no"}`,
  ].join(" · ");
}

const site = serverEnv.cablecastSiteId;
const channel = serverEnv.cablecastChannelId || undefined;

export default async function CablecastDiagnostics() {
  const config = {
    CABLECAST_BASE_URL: serverEnv.cablecastBaseUrl,
    CABLECAST_SITE_ID: serverEnv.cablecastSiteId,
    CABLECAST_CHANNEL_ID: serverEnv.cablecastChannelId || "(unset)",
    NEXT_PUBLIC_CABLECAST_HOST: publicEnv.cablecastHost,
    tokenIdPresent: Boolean(serverEnv.cablecastTokenId),
    tokenSecretPresent: Boolean(serverEnv.cablecastTokenSecret),
  };

  const results = await Promise.all([
    probe(
      `GET /publicsitedata?site=${site}${channel ? `&channel=${channel}` : ""}  ← site config, galleries, carousel, live URL`,
      () =>
        publicGet("/publicsitedata", {
          searchParams: { site, channel },
          revalidate: 0,
        }),
      summariseSiteConfig,
    ),
    probe(
      "GET /publicsitedata?site=1  (fallback: explicit site=1)",
      () => publicGet("/publicsitedata", { searchParams: { site: 1 }, revalidate: 0 }),
      summariseSiteConfig,
    ),
    probe(
      `GET /publicsitedata/schedule?site=${site}  ← schedule / TV guide`,
      () =>
        publicGet("/publicsitedata/schedule", {
          searchParams: { site, channel },
          revalidate: 0,
        }),
    ),
    probe(
      `GET /publicsitedata/shows/search?search=board&site=${site}  ← full-text search`,
      () =>
        publicGet("/publicsitedata/shows/search", {
          searchParams: { search: "board", site, page_size: 3 },
          revalidate: 0,
        }),
    ),
    probe(
      "GET /v1/systeminfo  (re-confirm: authed API expected to fail from public internet)",
      () => authedGet("/v1/systeminfo", { revalidate: 0 }),
    ),
  ]);

  return (
    <main
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        maxWidth: 960,
        margin: "0 auto",
        padding: "32px 20px 80px",
        color: "#0c1a28",
        background: "#fff",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>Cablecast Diagnostics</h1>
      <p style={{ color: "#5e7389", marginBottom: 20, fontSize: 13 }}>
        Temporary. Testing which endpoints are reachable from Vercel and echoing
        the deployment config. Delete <code>app/cablecast-diag/</code> once wired.
      </p>

      <section
        style={{
          border: "1px solid #e4ecf3",
          borderRadius: 10,
          padding: 14,
          marginBottom: 18,
        }}
      >
        <strong style={{ fontSize: 13 }}>Deployment config (secrets masked)</strong>
        <pre
          style={{
            margin: "8px 0 0",
            fontSize: 11.5,
            lineHeight: 1.5,
            background: "#f4f8fb",
            border: "1px solid #eaf1f7",
            borderRadius: 8,
            padding: 12,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(config, null, 2)}
        </pre>
      </section>

      {results.map((r) => (
        <section
          key={r.label}
          style={{
            border: "1px solid #e4ecf3",
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 6,
                color: "#fff",
                background: r.ok ? "#22c55e" : "#ef4444",
              }}
            >
              {r.ok ? "OK" : "FAIL"}
            </span>
            <strong style={{ fontSize: 13 }}>{r.label}</strong>
          </div>
          <div style={{ fontSize: 12, color: "#34506b", marginBottom: 8 }}>
            {r.note}
          </div>
          {r.json ? (
            <pre
              style={{
                margin: 0,
                fontSize: 11.5,
                lineHeight: 1.5,
                background: "#f4f8fb",
                border: "1px solid #eaf1f7",
                borderRadius: 8,
                padding: 12,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {r.json}
            </pre>
          ) : null}
        </section>
      ))}
    </main>
  );
}
