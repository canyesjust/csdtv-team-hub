-- Track district site sync visibility for manager-reviewed archive/delete (never auto-delete).

ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS last_seen_in_district_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS district_missing_since timestamptz;

COMMENT ON COLUMN public.productions.last_seen_in_district_sync_at IS
  'Updated when this production_number appears in a district sync batch.';
COMMENT ON COLUMN public.productions.district_missing_since IS
  'Set after finalize sync when the production was not in the last district sync window; manager must archive or delete.';

CREATE INDEX IF NOT EXISTS idx_productions_district_missing_since
  ON public.productions (district_missing_since)
  WHERE district_missing_since IS NOT NULL;
