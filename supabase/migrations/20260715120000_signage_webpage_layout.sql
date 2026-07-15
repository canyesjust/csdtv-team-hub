-- 'webpage' screen layout: a screen that displays a single external web page
-- full-screen, with no zones, header, ticker, or announcements.
--
-- webpage_url holds the URL that layout renders. NULL on every other layout.
-- The API route (app/api/signage/screens/route.ts) only ever writes a bounded
-- http(s) URL here, but validate again at the app layer, not the DB.

alter table public.signage_screens
  add column if not exists webpage_url text;

comment on column public.signage_screens.webpage_url is
  'Single external URL shown full-screen when layout = ''webpage''. NULL otherwise.';
