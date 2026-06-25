-- Per-site toggle for showing the district calendar_events feed in the ticker.
-- Idempotent. Default off so a new school doesn't inherit district-wide events;
-- CIC keeps its current behavior. Surfaced on the Template page ("District
-- calendar in ticker") and read by the screen feed.
ALTER TABLE public.signage_sites
  ADD COLUMN IF NOT EXISTS show_calendar_ticker boolean NOT NULL DEFAULT false;

UPDATE public.signage_sites SET show_calendar_ticker = true WHERE slug = 'cic';
