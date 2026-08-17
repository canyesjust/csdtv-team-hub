/*
  Self-contained environment access for the /watch section's Cablecast client.
  Kept local to lib/cablecast so it has no dependency on the Team Hub's own env.

  - publicEnv values are browser-safe (must be NEXT_PUBLIC_*).
  - serverEnv values are secrets — import only from server code (never a
    "use client" module). Values are read lazily so the app boots before every
    secret is provisioned.
*/

export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // Cablecast host (not secret) — used to build browser-safe thumbnail/watch
  // URLs. Includes the /CablecastAPI base path.
  cablecastHost:
    process.env.NEXT_PUBLIC_CABLECAST_HOST ??
    "https://canyons-school.cablecast.tv/CablecastAPI",
};

export const serverEnv = {
  get cablecastBaseUrl(): string {
    return (
      process.env.CABLECAST_BASE_URL ??
      "https://canyons-school.cablecast.tv/CablecastAPI"
    );
  },
  get cablecastTokenId(): string {
    return process.env.CABLECAST_TOKEN_ID ?? "";
  },
  get cablecastTokenSecret(): string {
    return process.env.CABLECAST_TOKEN_SECRET ?? "";
  },
  get cablecastSiteId(): string {
    return process.env.CABLECAST_SITE_ID ?? "1";
  },
  get cablecastChannelId(): string {
    return process.env.CABLECAST_CHANNEL_ID ?? "";
  },
  get resendApiKey(): string {
    return process.env.RESEND_API_KEY ?? "";
  },
};

/** Throws if a server secret is missing — call inside code paths that require it. */
export function requireServerEnv<K extends keyof typeof serverEnv>(
  key: K,
): string {
  const value = serverEnv[key];
  if (!value) {
    throw new Error(`Missing required server environment variable for "${key}"`);
  }
  return value;
}
