-- ============================================================================
-- Reserved screen space for somebody else's score bug.
--
-- The score comes from a separate service and keys over us as its own OBS
-- source. We do not draw it and cannot move it, so the only thing that prevents
-- a collision is knowing where it lives. Declared once per show; the preview,
-- the safe-area guide and the row editor all read it.
-- ============================================================================

alter table public.graphics_shows
  add column if not exists bug_zone text not null default 'none'
    check (bug_zone in ('none','tl','tr','bl','br','top','bottom'));

comment on column public.graphics_shows.bug_zone is
  'Where an external score bug sits. We never draw it, we only stay out of it.';
