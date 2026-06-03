-- Manager view-as (impersonation) for support and QA.
-- Run in Supabase SQL editor after review.

-- ─── Sessions (one active subject per manager) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_team_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  subject_team_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '8 hours'),
  CONSTRAINT impersonation_sessions_actor_unique UNIQUE (actor_team_id),
  CONSTRAINT impersonation_sessions_not_self CHECK (actor_team_id <> subject_team_id)
);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_actor_expires
  ON public.impersonation_sessions (actor_team_id, expires_at DESC);

-- ─── Audit trail ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.impersonation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_team_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  subject_team_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('start', 'stop')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_audit_actor_created
  ON public.impersonation_audit (actor_team_id, created_at DESC);

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_audit ENABLE ROW LEVEL SECURITY;
-- No policies: app uses service role for reads/writes.

-- ─── Effective team helpers (used by RLS across the app) ─────────────────────
CREATE OR REPLACE FUNCTION public.auth_actor_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_actor_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_actor_team_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT s.subject_team_id
      FROM public.impersonation_sessions s
      INNER JOIN public.team actor ON actor.id = s.actor_team_id
      WHERE actor.supabase_user_id = auth.uid()
        AND actor.role = 'Manager'
        AND s.expires_at > now()
      ORDER BY s.started_at DESC
      LIMIT 1
    ),
    (SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_team_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.team WHERE id = public.auth_team_id() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_team_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.auth_team_role_is_hub_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() IN ('Manager', 'Staff', 'Intern', 'Production Focus');
$$;

REVOKE ALL ON FUNCTION public.auth_team_role_is_hub_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_role_is_hub_staff() TO authenticated;

-- Effective team id (subject while view-as is active).
CREATE OR REPLACE FUNCTION public.get_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_id();
$$;

-- Effective role is Manager (false while viewing as a non-manager subject).
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_team_role() = 'Manager';
$$;

-- Real signed-in user is Manager (ignores view-as subject).
CREATE OR REPLACE FUNCTION public.is_actor_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team
    WHERE id = public.auth_actor_team_id()
      AND role = 'Manager'
      AND active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.get_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_id() TO authenticated;
REVOKE ALL ON FUNCTION public.is_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
REVOKE ALL ON FUNCTION public.is_actor_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_actor_manager() TO authenticated;
