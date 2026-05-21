-- Future project ideas (pre-production brainstorm backlog)
-- Apply in Supabase SQL Editor or via migration.

CREATE TABLE IF NOT EXISTS public.project_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.team (id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_ideas_active_updated
  ON public.project_ideas (updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_ideas_archived
  ON public.project_ideas (archived_at DESC)
  WHERE archived_at IS NOT NULL;

ALTER TABLE public.project_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_ideas_select ON public.project_ideas;
CREATE POLICY project_ideas_select ON public.project_ideas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_ideas_insert ON public.project_ideas;
CREATE POLICY project_ideas_insert ON public.project_ideas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS project_ideas_update ON public.project_ideas;
CREATE POLICY project_ideas_update ON public.project_ideas
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Permanent delete: managers only (archive is via UPDATE for everyone)
DROP POLICY IF EXISTS project_ideas_delete ON public.project_ideas;
CREATE POLICY project_ideas_delete ON public.project_ideas
  FOR DELETE TO authenticated
  USING (public.auth_team_role() = 'Manager');
