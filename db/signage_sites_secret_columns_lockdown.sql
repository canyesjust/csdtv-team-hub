-- signage_sites_secret_columns_lockdown.sql
--
-- Locks down the two secret columns on public.signage_sites:
--   * ablesign_api_key
--   * ablesign_workspace_id
--
-- These hold AbleSign credentials and must NEVER reach the browser. Historically
-- both the `anon` and `authenticated` roles had column-level SELECT (and the
-- app used `select('*')` in several browser/anon paths), leaking the secrets to
-- the client.
--
-- ORDER OF OPERATIONS — IMPORTANT:
--   Apply this migration ONLY AFTER the code that stops selecting these columns
--   is deployed. Specifically, the deploy must:
--     - stop `select('*')` on signage_sites from any anon/authenticated (browser)
--       client (see app/dashboard/signage/sites/page.tsx and
--       app/dashboard/signage/components/SignageProvider.tsx SITE_SELECT), and
--     - have API routes return an explicit non-secret column list
--       (app/api/signage/sites/route.ts SITE_COLUMNS, provision route).
--   Server-side reads of these columns use the SERVICE-ROLE client
--   (lib/signage/ablesign-creds.ts), which BYPASSES RLS and column grants, so
--   revoking anon/authenticated access does NOT break the server-side push.
--
-- If applied before the code is deployed, any lingering `select('*')` from a
-- browser client will start returning permission errors for those columns.
--
-- REVOKE is naturally idempotent — re-running this is safe.

REVOKE SELECT, INSERT, UPDATE (ablesign_api_key, ablesign_workspace_id)
  ON public.signage_sites
  FROM anon, authenticated;
