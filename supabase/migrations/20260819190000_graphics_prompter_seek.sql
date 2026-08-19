-- ============================================================================
-- Prompter seek.
--
-- Talent missed a line and needs to go back. The scroll position lives in the
-- browser source, not in the database, so the control surface cannot simply
-- set it. Instead it issues a numbered command that the output applies exactly
-- once. A counter rather than a timestamp, so a poll that arrives twice with
-- the same command does not scroll twice.
-- ============================================================================

alter table public.graphics_shows
  add column if not exists prompter_seek_n     integer not null default 0,
  add column if not exists prompter_seek_kind  text,
  add column if not exists prompter_seek_value text;

comment on column public.graphics_shows.prompter_seek_n is
  'Monotonic command number. The output applies a seek only when this changes.';
comment on column public.graphics_shows.prompter_seek_kind is
  'back | forward | row | air | top';
