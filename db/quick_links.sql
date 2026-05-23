-- Library quick links (external URLs for the team)
-- Apply in Supabase SQL Editor or via migration.

CREATE TABLE IF NOT EXISTS public.quick_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'General',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.team (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quick_links_active_sort
  ON public.quick_links (active, sort_order);

ALTER TABLE public.quick_links ENABLE ROW LEVEL SECURITY;

-- Read: all signed-in team members
DROP POLICY IF EXISTS quick_links_select ON public.quick_links;
CREATE POLICY quick_links_select ON public.quick_links
  FOR SELECT TO authenticated
  USING (true);

-- Write: staff roles (not Student Intern) — matches knowledge_base pattern
DROP POLICY IF EXISTS quick_links_insert ON public.quick_links;
CREATE POLICY quick_links_insert ON public.quick_links
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'));

DROP POLICY IF EXISTS quick_links_update ON public.quick_links;
CREATE POLICY quick_links_update ON public.quick_links
  FOR UPDATE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'))
  WITH CHECK (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'));

DROP POLICY IF EXISTS quick_links_delete ON public.quick_links;
CREATE POLICY quick_links_delete ON public.quick_links
  FOR DELETE TO authenticated
  USING (public.auth_team_role() IN ('Manager', 'Staff', 'Intern'));
