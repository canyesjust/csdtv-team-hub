/*
  TEMPORARY Cablecast diagnostic page — DELETE after wiring live data.

  Path is intentionally NOT under /watch so it stays behind the Team Hub auth
  gate (middleware publicPaths matches "/watch" by prefix). Only logged-in staff
  can open csdtvstaff.org/cablecast-diag.

  It exercises the Cablecast client with the server token and reports:
   - whether auth works (systeminfo)
   - reference lists (categories / projects / producers)
   - showfields (where Featured + School Related field IDs + option names live)
   - publicsites (site id + gallery/carousel config) and channels (channel id)
   - a sample of shows
   - which Advanced Search request envelope the server accepts (3 variants)
*/
import { authedGet, authedPost } from "@/lib/cablecast/client";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Cablecast Diagnostics" } };

interface ProbeResult {
  label: string;
  ok: boolean;
  note: string;
  json?: string;
}

function arrLen(data: unknown, key: string): number {
  const rec = data as Record<string, unknown> | null;
  const arr = rec?.[key];
  return Array.isArray(arr) ? arr.length : 0;
}

function pretty(data: unknown, max = 4000): string {
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
    return {
      label,
      ok: true,
      note: note ? note(data) : "ok",
      json: pretty(data),
    };
  } catch (error) {
    const e = error as { status?: number; message?: string; body?: string };
    return {
      label,
      ok: false,
      note: `${e.status ?? ""} ${e.message ?? String(error)}`.trim(),
      json: e.body ? String(e.body).slice(0, 1500) : undefined,
    };
  }
}

// Simple sample query used to test the Advanced Search request envelope.
const sampleQuery = {
  groups: [
    {
      orAnd: "and",
      filters: [
        { field: "hasVod", operator: "equals", searchValue: true },
        { field: "cgExempt", operator: "equals", searchValue: false },
      ],
    },
  ],
  sortOptions: [{ field: "eventDate", direction: "desc" }],
};

export default async function CablecastDiagnostics() {
  const results = await Promise.all([
    probe("GET /v1/systeminfo (auth check)", () =>
      authedGet("/v1/systeminfo", { revalidate: 0 }),
    ),
    probe(
      "GET /v1/categories",
      () => authedGet("/v1/categories", { revalidate: 0 }),
      (d) => `${arrLen(d, "categories")} categories`,
    ),
    probe(
      "GET /v1/projects",
      () => authedGet("/v1/projects", { revalidate: 0 }),
      (d) => `${arrLen(d, "projects")} projects`,
    ),
    probe(
      "GET /v1/producers",
      () => authedGet("/v1/producers", { revalidate: 0 }),
      (d) => `${arrLen(d, "producers")} producers`,
    ),
    probe(
      "GET /v1/showfields  ← Featured + School Related IDs live here",
      () => authedGet("/v1/showfields", { revalidate: 0 }),
      (d) =>
        `${arrLen(d, "showFields")} showFields, ${arrLen(d, "fieldDefinitions")} fieldDefinitions`,
    ),
    probe(
      "GET /v1/publicsites  ← site id + gallery/carousel config",
      () => authedGet("/v1/publicsites", { revalidate: 0 }),
      (d) => `${arrLen(d, "publicSites")} public sites`,
    ),
    probe(
      "GET /v1/channels  ← channel id for live/schedule",
      () => authedGet("/v1/channels", { searchParams: { page_size: 20 }, revalidate: 0 }),
      (d) => `${arrLen(d, "channels")} channels`,
    ),
    probe(
      "GET /v1/shows?page_size=10&include=vods,thumbnails",
      () =>
        authedGet("/v1/shows", {
          searchParams: { page_size: 10, include: "vods,thumbnails" },
          revalidate: 0,
        }),
      (d) => `${arrLen(d, "shows")} shows`,
    ),
    probe(
      "POST /v1/shows/search/advanced — body = { query }",
      () =>
        authedPost(
          "/v1/shows/search/advanced",
          { query: sampleQuery },
          { searchParams: { page_size: 3 }, revalidate: 0 },
        ),
      (d) => `${arrLen(d, "shows")} shows returned`,
    ),
    probe(
      "POST /v1/shows/search/advanced — body = query (bare)",
      () =>
        authedPost("/v1/shows/search/advanced", sampleQuery, {
          searchParams: { page_size: 3 },
          revalidate: 0,
        }),
      (d) => `${arrLen(d, "shows")} shows returned`,
    ),
    probe(
      "POST /v1/shows/search/advanced — body = { savedShowSearch: { query } }",
      () =>
        authedPost(
          "/v1/shows/search/advanced",
          { savedShowSearch: { query: sampleQuery } },
          { searchParams: { page_size: 3 }, revalidate: 0 },
        ),
      (d) => `${arrLen(d, "shows")} shows returned`,
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
      <p style={{ color: "#5e7389", marginBottom: 24, fontSize: 13 }}>
        Temporary. Confirms the API token works and reveals the real IDs the
        /watch pages need. Delete <code>app/cablecast-diag/</code> once wired.
      </p>
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
