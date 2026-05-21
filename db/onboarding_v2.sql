-- Onboarding v2: editable tracks, phases, categories, templates, assignments, instances
-- Run in Supabase SQL editor or via migration. App seeds default checklist via ensureOnboardingSeed().

CREATE OR REPLACE FUNCTION public.auth_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.team WHERE supabase_user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_team_id() TO authenticated;

-- ─── Tracks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_tracks (
  id text PRIMARY KEY,
  name text NOT NULL,
  team_role text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

-- ─── Phases (editable labels per track) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES public.onboarding_tracks (id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_onboarding_phases_track
  ON public.onboarding_phases (track_id, sort_order);

-- ─── Categories (visible groupings per track) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES public.onboarding_tracks (id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_onboarding_categories_track
  ON public.onboarding_categories (track_id, sort_order);

-- ─── Template items ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES public.onboarding_tracks (id) ON DELETE CASCADE,
  phase_id uuid NOT NULL REFERENCES public.onboarding_phases (id) ON DELETE RESTRICT,
  category_id uuid NOT NULL REFERENCES public.onboarding_categories (id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  library_article_id uuid REFERENCES public.knowledge_base (id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_template_items_track
  ON public.onboarding_template_items (track_id, sort_order)
  WHERE active = true;

-- ─── Per-person assignment ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL REFERENCES public.onboarding_tracks (id) ON DELETE RESTRICT,
  team_member_id uuid NOT NULL REFERENCES public.team (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'pending_signoff', 'complete', 'reopened')),
  trainee_submitted_at timestamptz,
  manager_signed_off_at timestamptz,
  signed_off_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  manager_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_assignments_member
  ON public.onboarding_assignments (team_member_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_assignments_track_status
  ON public.onboarding_assignments (track_id, status);

-- ─── Checklist instances (from template + ad-hoc) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_item_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.onboarding_assignments (id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES public.onboarding_template_items (id) ON DELETE SET NULL,
  phase_id uuid REFERENCES public.onboarding_phases (id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.onboarding_categories (id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  library_article_id uuid REFERENCES public.knowledge_base (id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  removed_at timestamptz,
  removed_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  is_ad_hoc boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_item_instances_assignment
  ON public.onboarding_item_instances (assignment_id, sort_order)
  WHERE removed_at IS NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.onboarding_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_item_instances ENABLE ROW LEVEL SECURITY;

-- Tracks: read all authenticated; write manager
DROP POLICY IF EXISTS onboarding_tracks_select ON public.onboarding_tracks;
CREATE POLICY onboarding_tracks_select ON public.onboarding_tracks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS onboarding_tracks_write ON public.onboarding_tracks;
CREATE POLICY onboarding_tracks_write ON public.onboarding_tracks
  FOR ALL TO authenticated
  USING (public.auth_team_role() = 'Manager')
  WITH CHECK (public.auth_team_role() = 'Manager');

-- Phases / categories / template items: read all; write manager
DROP POLICY IF EXISTS onboarding_phases_select ON public.onboarding_phases;
CREATE POLICY onboarding_phases_select ON public.onboarding_phases
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS onboarding_phases_write ON public.onboarding_phases;
CREATE POLICY onboarding_phases_write ON public.onboarding_phases
  FOR ALL TO authenticated
  USING (public.auth_team_role() = 'Manager')
  WITH CHECK (public.auth_team_role() = 'Manager');

DROP POLICY IF EXISTS onboarding_categories_select ON public.onboarding_categories;
CREATE POLICY onboarding_categories_select ON public.onboarding_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS onboarding_categories_write ON public.onboarding_categories;
CREATE POLICY onboarding_categories_write ON public.onboarding_categories
  FOR ALL TO authenticated
  USING (public.auth_team_role() = 'Manager')
  WITH CHECK (public.auth_team_role() = 'Manager');

DROP POLICY IF EXISTS onboarding_template_items_select ON public.onboarding_template_items;
CREATE POLICY onboarding_template_items_select ON public.onboarding_template_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS onboarding_template_items_write ON public.onboarding_template_items;
CREATE POLICY onboarding_template_items_write ON public.onboarding_template_items
  FOR ALL TO authenticated
  USING (public.auth_team_role() = 'Manager')
  WITH CHECK (public.auth_team_role() = 'Manager');

-- Assignments: own row or manager
DROP POLICY IF EXISTS onboarding_assignments_select ON public.onboarding_assignments;
CREATE POLICY onboarding_assignments_select ON public.onboarding_assignments
  FOR SELECT TO authenticated
  USING (
    public.auth_team_role() = 'Manager'
    OR team_member_id = public.auth_team_id()
  );

DROP POLICY IF EXISTS onboarding_assignments_insert ON public.onboarding_assignments;
CREATE POLICY onboarding_assignments_insert ON public.onboarding_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_team_role() = 'Manager');

DROP POLICY IF EXISTS onboarding_assignments_update ON public.onboarding_assignments;
CREATE POLICY onboarding_assignments_update ON public.onboarding_assignments
  FOR UPDATE TO authenticated
  USING (
    public.auth_team_role() = 'Manager'
    OR (
      team_member_id = public.auth_team_id()
      AND status IN ('in_progress', 'reopened', 'pending_signoff')
    )
  )
  WITH CHECK (
    public.auth_team_role() = 'Manager'
    OR (
      team_member_id = public.auth_team_id()
      AND status IN ('in_progress', 'pending_signoff')
    )
  );

DROP POLICY IF EXISTS onboarding_assignments_delete ON public.onboarding_assignments;
CREATE POLICY onboarding_assignments_delete ON public.onboarding_assignments
  FOR DELETE TO authenticated
  USING (public.auth_team_role() = 'Manager');

-- Instances: via assignment access
DROP POLICY IF EXISTS onboarding_item_instances_select ON public.onboarding_item_instances;
CREATE POLICY onboarding_item_instances_select ON public.onboarding_item_instances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_assignments a
      WHERE a.id = assignment_id
        AND (
          public.auth_team_role() = 'Manager'
          OR a.team_member_id = public.auth_team_id()
        )
    )
  );

DROP POLICY IF EXISTS onboarding_item_instances_insert ON public.onboarding_item_instances;
CREATE POLICY onboarding_item_instances_insert ON public.onboarding_item_instances
  FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_team_role() = 'Manager'
    OR EXISTS (
      SELECT 1 FROM public.onboarding_assignments a
      WHERE a.id = assignment_id AND a.team_member_id = public.auth_team_id()
    )
  );

DROP POLICY IF EXISTS onboarding_item_instances_update ON public.onboarding_item_instances;
CREATE POLICY onboarding_item_instances_update ON public.onboarding_item_instances
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.onboarding_assignments a
      WHERE a.id = assignment_id
        AND a.status <> 'complete'
        AND (
          public.auth_team_role() = 'Manager'
          OR a.team_member_id = public.auth_team_id()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.onboarding_assignments a
      WHERE a.id = assignment_id
        AND (
          public.auth_team_role() = 'Manager'
          OR (
            a.team_member_id = public.auth_team_id()
            AND a.status IN ('in_progress', 'reopened', 'pending_signoff')
          )
        )
    )
  );

DROP POLICY IF EXISTS onboarding_item_instances_delete ON public.onboarding_item_instances;
CREATE POLICY onboarding_item_instances_delete ON public.onboarding_item_instances
  FOR DELETE TO authenticated
  USING (public.auth_team_role() = 'Manager');
