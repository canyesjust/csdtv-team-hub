/*
  High-level show fetchers — the functions pages actually call.
  These compose the core client + Advanced Search + reference joins into the
  shapes the homepage rows, watch page, school pages, and series pages need.
*/
import { authedGet } from "./client";
import { getCategories, getProducers, getProjects, indexById } from "./reference";
import { andGroup, buildQuery, filters, runAdvancedSearch } from "./search";
import type { Show, SideLoadedBundle } from "./types";

/** A Show with its category/project/producer names resolved from reference lists. */
export interface EnrichedShow extends Show {
  categoryName?: string;
  projectName?: string;
  producerName?: string;
}

/** Attach category/project/producer names by joining the cached reference lists. */
export async function enrich(shows: Show[]): Promise<EnrichedShow[]> {
  if (shows.length === 0) return [];
  const [categories, projects, producers] = await Promise.all([
    getCategories(),
    getProjects(),
    getProducers(),
  ]);
  const categoryMap = indexById(categories);
  const projectMap = indexById(projects);
  const producerMap = indexById(producers);
  return shows.map((show) => ({
    ...show,
    categoryName:
      show.category != null ? categoryMap.get(show.category)?.name : undefined,
    projectName:
      show.project != null ? projectMap.get(show.project)?.name : undefined,
    producerName:
      show.producer != null ? producerMap.get(show.producer)?.name : undefined,
  }));
}

/** Full show payload for the watch page, with sideloaded vods/thumbnails/chapters. */
export async function getShowById(
  id: number,
  include = "vods,reels,thumbnails,chapters,scheduleItems",
): Promise<{ show?: EnrichedShow; bundle: SideLoadedBundle }> {
  const bundle = await authedGet<SideLoadedBundle>(`/v1/shows/${id}`, {
    searchParams: { include },
  });
  const [enriched] = bundle.show ? await enrich([bundle.show]) : [];
  return { show: enriched, bundle };
}

/** Homepage / category-page row: shows in a category, with a VOD, not CG-Exempt. */
export async function getCategoryRow(
  categoryId: number,
  limit = 12,
): Promise<EnrichedShow[]> {
  const query = buildQuery(
    [
      andGroup(
        filters.category(categoryId),
        filters.hasVod(true),
        filters.notCgExempt(),
      ),
    ],
    [{ field: "eventDate", direction: "desc" }],
  );
  return enrich(await runAdvancedSearch(query, { pageSize: limit }));
}

/** Series page: shows in a Cablecast Project (project is a direct /v1/shows filter). */
export async function getShowsByProject(
  projectId: number,
  limit = 50,
): Promise<EnrichedShow[]> {
  const bundle = await authedGet<SideLoadedBundle>("/v1/shows", {
    searchParams: {
      project: projectId,
      page_size: limit,
      sort_order: "desc",
      include: "vods,thumbnails",
    },
  });
  return enrich(bundle.shows ?? []);
}

/** School page: shows where a School Related option is set (multi-value ShowField). */
export async function getShowsBySchool(
  schoolRelatedFieldId: number,
  schoolOption: string | number,
  limit = 60,
): Promise<EnrichedShow[]> {
  const query = buildQuery(
    [
      andGroup(
        filters.customField(schoolRelatedFieldId, schoolOption),
        filters.hasVod(true),
        filters.notCgExempt(),
      ),
    ],
    [{ field: "eventDate", direction: "desc" }],
  );
  return enrich(await runAdvancedSearch(query, { pageSize: limit }));
}

/** Featured hero: shows flagged via the Featured ShowField, not CG-Exempt. */
export async function getFeatured(
  featuredFieldId: number,
  featuredValue: string | number = "Yes",
  limit = 6,
): Promise<EnrichedShow[]> {
  const query = buildQuery(
    [
      andGroup(
        filters.customField(featuredFieldId, featuredValue),
        filters.notCgExempt(),
      ),
    ],
    [{ field: "eventDate", direction: "desc" }],
  );
  return enrich(await runAdvancedSearch(query, { pageSize: limit }));
}
