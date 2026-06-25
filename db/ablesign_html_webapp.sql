-- AbleSign HTML web app changeover — signage_screens columns.
--
-- Applied to production via Supabase migrations (add_ablesign_html_webapp_id,
-- add_ablesign_html_dirty_at, add_ablesign_html_hash). Kept here for repo record /
-- fresh environments.

-- Per-screen HTML web app id. Distinct from ablesign_webapp_id (the URL-type
-- fallback web app) so the URL fallback link is preserved and the URL sync path
-- and HTML push path never overwrite each other.
ALTER TABLE signage_screens
  ADD COLUMN IF NOT EXISTS ablesign_html_webapp_id bigint;
COMMENT ON COLUMN signage_screens.ablesign_html_webapp_id IS
  'AbleSign HTML-type web app ID for offline-capable HTML push (distinct from ablesign_webapp_id, the URL-type fallback web app).';

-- Set when content affecting this screen changes; the dirty-flush cron
-- regenerates and re-pushes the HTML web app, then clears it. NULL = up to date.
ALTER TABLE signage_screens
  ADD COLUMN IF NOT EXISTS ablesign_html_dirty_at timestamptz;
COMMENT ON COLUMN signage_screens.ablesign_html_dirty_at IS
  'Set when content affecting this screen changes; the dirty-flush cron regenerates and re-pushes the HTML web app, then clears it. NULL = up to date.';
CREATE INDEX IF NOT EXISTS signage_screens_html_dirty_idx
  ON signage_screens (ablesign_html_dirty_at) WHERE ablesign_html_dirty_at IS NOT NULL;

-- SHA-256 of the last HTML pushed. A push is skipped when freshly rendered HTML
-- hashes identical, so the cron only creates a new web app when content changed.
ALTER TABLE signage_screens
  ADD COLUMN IF NOT EXISTS ablesign_html_hash text;
COMMENT ON COLUMN signage_screens.ablesign_html_hash IS
  'SHA-256 of the last HTML pushed to AbleSign. A push is skipped when the freshly rendered HTML hashes identical, so the cron only creates a new web app when content actually changed.';
