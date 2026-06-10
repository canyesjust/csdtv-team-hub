-- Floor-plan screen positions (idempotent). Run in the Supabase SQL Editor.
--
-- Adds where each signage screen sits on its floor-plan image. Coordinates are
-- stored as percentages (0–100) of the displayed floor-plan image, so they stay
-- correct at any size. NULL = not yet placed on the map.
--
-- The floor-plan images live in the app at /signage/cic-floor-1.webp and
-- /signage/cic-floor-2.webp, keyed by signage_screens.floor (1 and 2).

ALTER TABLE public.signage_screens
  ADD COLUMN IF NOT EXISTS pos_x numeric,
  ADD COLUMN IF NOT EXISTS pos_y numeric;

COMMENT ON COLUMN public.signage_screens.pos_x IS 'Floor-plan marker X, percent (0-100) of the floor image width. NULL = unplaced.';
COMMENT ON COLUMN public.signage_screens.pos_y IS 'Floor-plan marker Y, percent (0-100) of the floor image height. NULL = unplaced.';
