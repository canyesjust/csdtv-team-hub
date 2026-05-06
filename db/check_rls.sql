-- =============================================================================
-- RLS audit for Supabase (PostgreSQL)
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- Sections:
--   1) Tables missing RLS (should usually be empty for app data)
--   2) All tables with RLS on/off + policy count
--   3) Every policy detail (roles, command, USING, WITH CHECK)
--   4) Optional: roles that bypass RLS (superuser / BYPASSRLS)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Public base tables where RLS is NOT enabled
-- -----------------------------------------------------------------------------
SELECT c.oid::regclass AS table_regclass,
       n.nspname       AS schema_name,
       c.relname       AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'           -- ordinary tables only
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- -----------------------------------------------------------------------------
-- 2) Summary: each public table — RLS flag + number of policies
-- -----------------------------------------------------------------------------
SELECT n.nspname                    AS schema_name,
       c.relname                    AS table_name,
       c.relrowsecurity             AS rls_enabled,
       c.relforcerowsecurity        AS rls_forced,
       COUNT(p.oid)                 AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relrowsecurity ASC, policy_count ASC, c.relname;

-- -----------------------------------------------------------------------------
-- 3) Full policy listing (same info as Dashboard → Authentication → Policies)
-- -----------------------------------------------------------------------------
SELECT schemaname,
       tablename,
       policyname,
       permissive,
       roles,
       cmd AS command,              -- SELECT | INSERT | UPDATE | DELETE | ALL
       qual AS using_expression,
       with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- 4) Database roles that bypass RLS (should be rare; service_role is expected)
-- -----------------------------------------------------------------------------
SELECT r.rolname,
       r.rolsuper     AS is_superuser,
       r.rolbypassrls AS bypasses_rls
FROM pg_roles r
WHERE r.rolbypassrls = TRUE
   OR r.rolname IN ('postgres', 'supabase_admin', 'service_role')
ORDER BY r.rolname;
