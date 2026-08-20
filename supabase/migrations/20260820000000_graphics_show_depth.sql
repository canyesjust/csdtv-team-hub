-- ============================================================================
-- How much structure a show wants.
--
-- A game is a bank of triggers with no order. A graduation is a long list. A
-- concert with a host is a rundown with a clock. Forcing all three through the
-- rundown made the simple ones worse, so depth is now a property of the show.
--
-- Nothing is destroyed by changing it. Rows and shelf cards both survive.
-- ============================================================================

alter table public.graphics_shows
  add column if not exists depth text not null default 'rundown'
    check (depth in ('board','list','rundown'));

-- Cards group on the board the way they group in someone's head: sponsors,
-- score, breaks. Free text, because every show groups differently.
alter table public.graphics_shelf_items
  add column if not exists group_label text check (char_length(group_label) <= 40);

comment on column public.graphics_shows.depth is
  'board = card bank only, list = ordered list, rundown = the full thing.';
