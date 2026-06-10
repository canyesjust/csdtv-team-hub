-- RLS policies for the new multi-location tables. Run in Supabase.
--
-- These match the EXISTING signage RLS pattern in cic_signage.sql: any signed-in
-- user can read and write. That keeps the new tables consistent with how the
-- rest of signage already works and lets the phase-2 admin code (site switcher,
-- Manage sites) read them through the normal client.
--
-- The RESTRICTIVE, per-site policies (signage-only role sees only its assigned
-- sites; only managers can create sites) arrive with the signage-only-role phase
-- and will REPLACE the "_wr" policies below. For now this is intentionally open,
-- exactly like signage_screens / signage_content already are.

ALTER TABLE public.signage_sites       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signage_site_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signage_sites_sel ON public.signage_sites;
CREATE POLICY signage_sites_sel ON public.signage_sites
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS signage_sites_wr ON public.signage_sites;
CREATE POLICY signage_sites_wr ON public.signage_sites
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS signage_site_access_sel ON public.signage_site_access;
CREATE POLICY signage_site_access_sel ON public.signage_site_access
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS signage_site_access_wr ON public.signage_site_access;
CREATE POLICY signage_site_access_wr ON public.signage_site_access
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
