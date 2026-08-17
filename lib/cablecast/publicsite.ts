/*
  publicsitedata helpers (no auth, but called server-side for caching).
  Primary source for: site config/bootstrap, the live stream URL, full-text
  search, and the schedule — endpoints that are already shaped for these uses.
*/
import { DEFAULT_REVALIDATE, publicGet } from "./client";
import { serverEnv } from "./config";
import type {
  PublicSiteConfig,
  PublicSiteGallery,
  PublicSiteShow,
  PublicSiteShows,
} from "./types";

/** site / channel identifiers every publicsitedata call carries. */
function siteParams(
  extra?: Record<string, string | number | boolean | undefined>,
) {
  return {
    site: serverEnv.cablecastSiteId,
    channel: serverEnv.cablecastChannelId || undefined,
    ...extra,
  };
}

/** Site bootstrap: title, logos, colors, live stream, galleries, carousel, schedule. */
export async function getSiteConfig(): Promise<PublicSiteConfig> {
  return publicGet<PublicSiteConfig>("/publicsitedata", {
    searchParams: siteParams(),
    revalidate: 600,
    tags: ["cablecast-siteconfig"],
  });
}

/** Public watch payload for a show (description, thumbnail, vodUrl, chapters…). */
export async function getPublicShow(showId: number): Promise<PublicSiteShow> {
  return publicGet<PublicSiteShow>(`/publicsitedata/shows/${showId}`, {
    searchParams: siteParams(),
    revalidate: DEFAULT_REVALIDATE,
  });
}

/** Full-text search (transcripts, chapters, metadata) — backs the Search page. */
export async function searchPublicShows(
  search: string,
  opts?: { pageSize?: number; offset?: number },
): Promise<PublicSiteShows> {
  return publicGet<PublicSiteShows>("/publicsitedata/shows/search", {
    searchParams: siteParams({
      search,
      page_size: opts?.pageSize,
      offset: opts?.offset,
    }),
    // Search is user-driven; keep it fresh.
    revalidate: 60,
  });
}

/** TV-guide data for the Schedule page. */
export async function getPublicSchedule(currentDay?: string): Promise<unknown> {
  return publicGet<unknown>("/publicsitedata/schedule", {
    searchParams: siteParams({ currentDay }),
    revalidate: DEFAULT_REVALIDATE,
  });
}

/** Paginated shows for a Cablecast-configured gallery row. */
export async function getGallery(
  galleryId: number,
  opts?: { pageSize?: number; offset?: number },
): Promise<PublicSiteGallery> {
  return publicGet<PublicSiteGallery>(
    `/publicsitedata/galleries/${galleryId}`,
    {
      searchParams: siteParams({
        page_size: opts?.pageSize,
        offset: opts?.offset,
      }),
    },
  );
}
