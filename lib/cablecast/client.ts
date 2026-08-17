/*
  Core Cablecast request client. SERVER-ONLY — imports the Cablecast token from
  serverEnv, which must never reach the browser. The `server-only` import makes
  a client-component import a build error.

  Three fetchers:
   - authedGet / authedPost  -> /v1/... with HTTP Basic auth
   - publicGet               -> /publicsitedata, /watch, /dynamicthumbnails (no auth)

  Caching uses Next.js fetch caching (ISR). Authenticated requests bypass
  Cablecast's edge cache, so we control freshness here via `revalidate`.
*/
import "server-only";
import { serverEnv } from "./config";

/** Default ISR window (seconds) for content requests. */
export const DEFAULT_REVALIDATE = 300;
/** Reference lists change rarely — cache longer. */
export const REFERENCE_REVALIDATE = 3600;

export class CablecastError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`Cablecast request failed (${status}) for ${url}`);
    this.name = "CablecastError";
  }
}

export interface RequestOptions {
  revalidate?: number;
  tags?: string[];
  searchParams?: Record<string, string | number | boolean | undefined>;
}

function authHeader(): string {
  const token = Buffer.from(
    `${serverEnv.cablecastTokenId}:${serverEnv.cablecastTokenSecret}`,
  ).toString("base64");
  return `Basic ${token}`;
}

function buildUrl(
  path: string,
  searchParams?: RequestOptions["searchParams"],
): string {
  const base = serverEnv.cablecastBaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function toJson<T>(res: Response, url: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CablecastError(res.status, url, body);
  }
  return (await res.json()) as T;
}

function nextOptions(opts: RequestOptions) {
  return {
    revalidate: opts.revalidate ?? DEFAULT_REVALIDATE,
    tags: opts.tags,
  };
}

/** Authenticated GET against /v1/... */
export async function authedGet<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, opts.searchParams);
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    next: nextOptions(opts),
  });
  return toJson<T>(res, url);
}

/** Authenticated POST — the Advanced Search engine. */
export async function authedPost<T>(
  path: string,
  body: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, opts.searchParams);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    next: nextOptions(opts),
  });
  return toJson<T>(res, url);
}

/** Public GET (no auth) — publicsitedata / watch / dynamicthumbnails. */
export async function publicGet<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const url = buildUrl(path, opts.searchParams);
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: nextOptions(opts),
  });
  return toJson<T>(res, url);
}
