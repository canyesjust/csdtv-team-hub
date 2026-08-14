/*
  Cablecast API types — a pragmatic subset of the fields the public site uses.
  Full contract: the CSDtv Cablecast API reference. Index signatures are used
  where the payload carries more than we model, so unknown fields don't break.
*/

export interface Meta {
  offset: number;
  pageSize: number;
  count?: number;
  total?: number;
}

// ---- Reference entities (fetch once, cache, join by id) ----

export interface Category {
  id: number;
  name: string;
  location?: number;
}

export interface Project {
  id: number;
  name: string;
  description?: string | null;
  producer?: number | null;
}

export interface Producer {
  id: number;
  name: string;
  active?: boolean;
}

export type FieldType =
  | "string"
  | "select"
  | "date"
  | "number"
  | "file"
  | "producer";

export interface FieldOption {
  id: number;
  name?: string;
  value?: string;
}

export interface FieldDefinition {
  id: number;
  name: string;
  type: FieldType;
  widget?: string;
  fieldOptions?: FieldOption[];
}

export interface ShowField {
  id: number;
  name: string;
  fieldDefinition?: number;
  maxInstances?: number;
}

// ---- Shows ----

/** A value entry on a show for a ShowField (multi-value uses several entries). */
export interface CustomFieldValue {
  showField: number;
  fieldDefinition?: number;
  value?: string;
  fieldOption?: number;
}

export type VodState =
  | "unknown"
  | "queued"
  | "processing"
  | "partial"
  | "complete"
  | "error"
  | "permanentFailure"
  | "disabled"
  | "waiting";

export interface Vod {
  id: number;
  show?: number;
  url?: string;
  embedCode?: string;
  nonReflectEmbedCode?: string;
  localUrl?: string;
  length?: number;
  isWatchable?: boolean;
  isOnCloud?: boolean;
  vodState?: VodState;
}

export interface Thumbnail {
  id: number;
  url?: string;
  slug?: string;
}

export interface Show {
  id: number;
  title?: string; // internal title
  cgTitle?: string; // public-facing title
  comments?: string; // public description
  category?: number;
  project?: number;
  producer?: number;
  cgExempt?: boolean;
  eventDate?: string;
  customFields?: CustomFieldValue[];
  vods?: number[];
  reels?: number[];
  thumbnails?: number[];
  chapters?: number[];
  firstRuns?: number[];
  scheduleItems?: number[];
  runCount?: number;
  lastModified?: string;
  thumbnailImage?: { url?: string } | null;
  [key: string]: unknown;
}

export interface ScheduleItem {
  id: number;
  show?: number;
  channel?: number;
  runDateTime?: string;
  runDateTimeUtc?: string;
  runStatus?: string;
  filler?: boolean; // true = autoscheduled gap-filler, false = real event
  cgExempt?: boolean;
  length?: number;
  [key: string]: unknown;
}

/**
 * SideLoadedBundle — the envelope returned by shows / scheduleitems / vods.
 * Carries the primary resource plus any `?include=`d related arrays.
 */
export interface SideLoadedBundle {
  meta?: Meta;
  shows?: Show[];
  show?: Show;
  vods?: Vod[];
  thumbnails?: Thumbnail[];
  scheduleItems?: ScheduleItem[];
  [key: string]: unknown;
}

// ---- Advanced Search (POST /v1/shows/search/advanced) ----

export type SearchOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "lessThan"
  | "greaterThanOrEqual"
  | "lessThanOrEqual"
  | "empty"
  | "notEmpty";

export type SearchField =
  | "showId"
  | "project"
  | "title"
  | "cgTitle"
  | "eventDate"
  | "category"
  | "producer"
  | "comments"
  | "customField"
  | "hasVod"
  | "cgExempt"
  | "runCount"
  | "lastModified"
  | "chapters"
  | "closedCaptions";

export interface ShowSearchFilter {
  field: SearchField;
  operator: SearchOperator;
  searchValue?: string | number | boolean;
  /** Required when field === "customField" — the ShowField id. */
  showField?: number;
}

export interface ShowSearchGroup {
  orAnd: "and" | "or";
  filters: ShowSearchFilter[];
}

export interface SortOption {
  field: string;
  direction?: "asc" | "desc";
}

export interface ShowSearchQuery {
  sortOptions?: SortOption[];
  groups: ShowSearchGroup[];
}

// ---- publicsitedata (no auth) ----

export interface FieldDisplay {
  label?: string;
  value?: string;
  order?: number;
  widget?: string;
}

export interface PublicSiteShowSummary {
  id?: number;
  showId?: number;
  title?: string;
  thumbnailUrl?: string;
  eventDate?: string;
  [key: string]: unknown;
}

export interface PublicSiteGallery {
  id: number;
  title?: string;
  shows?: PublicSiteShowSummary[];
  [key: string]: unknown;
}

export interface PublicSiteSlide {
  showId?: number;
  title?: string;
  imageUrl?: string;
  [key: string]: unknown;
}

export interface PublicSiteScheduleItem {
  showId?: number;
  title?: string;
  runDateTime?: string;
  channel?: number;
  [key: string]: unknown;
}

export interface PublicSiteConfig {
  title?: string;
  logoUrl?: string;
  squareLogoUrl?: string;
  faviconUrl?: string;
  pageDescription?: string;
  siteColorsCssLink?: string;
  contactEmail?: string;
  contactPhone?: string;
  googleAnalyticsId?: string;
  liveStreamUrl?: string;
  liveEmbedCode?: string;
  liveStreamAutoPlay?: boolean;
  galleries?: PublicSiteGallery[];
  slideShow?: PublicSiteSlide[];
  scheduleItems?: PublicSiteScheduleItem[];
  [key: string]: unknown;
}

export interface PublicSiteShow {
  id?: number;
  showId?: number;
  title?: string;
  eventDate?: string;
  thumbnailUrl?: string;
  thumbnailAltText?: string;
  vodUrl?: string;
  embedCode?: string;
  fieldDisplays?: FieldDisplay[];
  upcomingRuns?: unknown[];
  chapters?: unknown[];
  vodTranscripts?: unknown[];
  isLive?: boolean;
  hasClosedCaptions?: boolean;
  hasTranslations?: boolean;
  hasAudioDescription?: boolean;
  isRestrictedToMembers?: boolean;
  [key: string]: unknown;
}

export interface PublicSiteShows {
  meta?: Meta;
  shows?: PublicSiteShowSummary[];
}
