/*
  Media URL builders — thumbnails and stable watch redirects.
  These produce BROWSER-SAFE public URLs (the endpoints need no auth), so this
  module is client-safe and uses publicEnv (never the server token).
*/
import { publicEnv } from "./config";

function host(): string {
  return publicEnv.cablecastHost.replace(/\/$/, "");
}

/** On-the-fly resized thumbnail for responsive grids. */
export function dynamicThumbnail(
  showOrAssetId: number,
  opts?: { dimension?: string; fit?: "crop" | "preserve" },
): string {
  const dimension = opts?.dimension ?? "640x360";
  const fit = opts?.fit ?? "crop";
  return `${host()}/dynamicthumbnails/${showOrAssetId}?d=${dimension}&fit_mode=${fit}`;
}

/** Stable redirect to a show's current thumbnail. */
export function thumbnailRedirect(showId: number): string {
  return `${host()}/watch/show/${showId}/thumbnail`;
}

/** Stable redirect to a show's current VOD stream. */
export function watchVodRedirect(showId: number): string {
  return `${host()}/watch/show/${showId}/vod`;
}

/** Stable redirect to the live stream for a channel. */
export function watchLiveRedirect(channelId: number): string {
  return `${host()}/watch/live/${channelId}`;
}
