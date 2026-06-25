-- ============================================================================
-- Per-site live broadcast. Idempotent. Run in Supabase.
--
-- signage_live used to be a single global row (id = 1, "one row" check). With
-- multiple locations, each site needs its own live state, so a live event at one
-- school doesn't take over every other school's screens. This switches it to one
-- row per site (keyed by site_id) and migrates the existing row to CIC.
-- ============================================================================

ALTER TABLE public.signage_live DROP CONSTRAINT IF EXISTS signage_live_one_row;
ALTER TABLE public.signage_live ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.signage_sites(id) ON DELETE CASCADE;

UPDATE public.signage_live
SET site_id = (SELECT id FROM public.signage_sites WHERE slug = 'cic')
WHERE site_id IS NULL;

-- New per-site rows get unique ids instead of the hardcoded default of 1.
CREATE SEQUENCE IF NOT EXISTS signage_live_id_seq OWNED BY public.signage_live.id;
SELECT setval('signage_live_id_seq', GREATEST((SELECT COALESCE(max(id), 1) FROM public.signage_live), 1));
ALTER TABLE public.signage_live ALTER COLUMN id SET DEFAULT nextval('signage_live_id_seq');

CREATE UNIQUE INDEX IF NOT EXISTS signage_live_site_uq ON public.signage_live(site_id);
