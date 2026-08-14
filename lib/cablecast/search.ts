/*
  Advanced Search — the real filtering engine (POST /v1/shows/search/advanced).
  `/v1/shows` can only filter by project/location/search/ids/free/since, so
  category, custom-field (School Related), hasVod, and cgExempt all go here.

  A ShowSearchQuery is sortOptions[] + groups[]; each group is AND/OR over
  filters[]; each filter is field + operator + searchValue (+ showField id for
  customField).

  NOTE: the exact request envelope for advanced search should be sanity-checked
  against the live API once credentials are in place. `runAdvancedSearch` sends
  `{ query }`; adjust `wrapQuery` if the server expects a bare ShowSearchQuery or
  a SavedShowSearchResource wrapper.
*/
import { authedPost } from "./client";
import type {
  SearchField,
  SearchOperator,
  Show,
  ShowSearchFilter,
  ShowSearchGroup,
  ShowSearchQuery,
  SideLoadedBundle,
  SortOption,
} from "./types";

export function group(
  orAnd: "and" | "or",
  ...filters: ShowSearchFilter[]
): ShowSearchGroup {
  return { orAnd, filters };
}

export function andGroup(...filters: ShowSearchFilter[]): ShowSearchGroup {
  return group("and", ...filters);
}

export function orGroup(...filters: ShowSearchFilter[]): ShowSearchGroup {
  return group("or", ...filters);
}

export function buildQuery(
  groups: ShowSearchGroup[],
  sortOptions?: SortOption[],
): ShowSearchQuery {
  return { groups, sortOptions };
}

/** Reusable filter builders for the common cases the site needs. */
export const filters = {
  category: (id: number): ShowSearchFilter => ({
    field: "category",
    operator: "equals",
    searchValue: id,
  }),
  project: (id: number): ShowSearchFilter => ({
    field: "project",
    operator: "equals",
    searchValue: id,
  }),
  hasVod: (value = true): ShowSearchFilter => ({
    field: "hasVod",
    operator: "equals",
    searchValue: value,
  }),
  /** Public content only — never surface CG-Exempt shows. */
  notCgExempt: (): ShowSearchFilter => ({
    field: "cgExempt",
    operator: "equals",
    searchValue: false,
  }),
  eventDateAfter: (iso: string): ShowSearchFilter => ({
    field: "eventDate",
    operator: "greaterThanOrEqual",
    searchValue: iso,
  }),
  /** Custom field (e.g. School Related) — pass the ShowField id + option value. */
  customField: (
    showField: number,
    value: string | number,
    operator: SearchOperator = "equals",
  ): ShowSearchFilter => ({
    field: "customField",
    operator,
    searchValue: value,
    showField,
  }),
  custom: (
    field: SearchField,
    operator: SearchOperator,
    value?: string | number | boolean,
    showField?: number,
  ): ShowSearchFilter => ({ field, operator, searchValue: value, showField }),
};

function wrapQuery(query: ShowSearchQuery): unknown {
  // Best-guess envelope; see NOTE at top of file.
  return { query };
}

export interface AdvancedSearchOptions {
  pageSize?: number;
  offset?: number;
  revalidate?: number;
  tags?: string[];
}

/** Run an Advanced Search and return the matched shows. */
export async function runAdvancedSearch(
  query: ShowSearchQuery,
  opts: AdvancedSearchOptions = {},
): Promise<Show[]> {
  const bundle = await authedPost<SideLoadedBundle>(
    "/v1/shows/search/advanced",
    wrapQuery(query),
    {
      searchParams: { page_size: opts.pageSize, offset: opts.offset },
      revalidate: opts.revalidate,
      tags: opts.tags,
    },
  );
  return bundle.shows ?? [];
}
