-- ============================================================================
-- Contact CRM — Phase 2: restrict the review surface to Managers
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Captured (BCC) items can contain sensitive email bodies, so anything awaiting
-- review is Manager-only at the DATA layer (not just the UI):
--   * contacts with lifecycle_state = 'pending_review'  -> Managers only
--   * contact_interactions with review_state = 'pending' -> Managers only
-- Everything Phase 1 relies on is unchanged: 'active' contacts and 'approved'
-- interactions remain readable/writable by any authenticated team member.
--
-- Manager check uses public.is_manager() (effective role = 'Manager'), the same
-- identity the client uses via /api/me/team, so view-as behaves consistently.
-- ============================================================================

-- ─── contacts: hide pending_review from non-managers ────────────────────────
-- Replace the single broad ALL policy with per-command policies.
DROP POLICY IF EXISTS "Authenticated users can do everything on contacts" ON public.contacts;

DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select
  ON public.contacts
  FOR SELECT TO authenticated
  USING (lifecycle_state <> 'pending_review' OR public.is_manager());

DROP POLICY IF EXISTS contacts_insert ON public.contacts;
CREATE POLICY contacts_insert
  ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contacts_update ON public.contacts;
CREATE POLICY contacts_update
  ON public.contacts
  FOR UPDATE TO authenticated
  USING (lifecycle_state <> 'pending_review' OR public.is_manager())
  WITH CHECK (lifecycle_state <> 'pending_review' OR public.is_manager());

DROP POLICY IF EXISTS contacts_delete ON public.contacts;
CREATE POLICY contacts_delete
  ON public.contacts
  FOR DELETE TO authenticated
  USING (lifecycle_state <> 'pending_review' OR public.is_manager());

-- ─── contact_interactions: hide pending from non-managers ───────────────────
-- Approved (manual Phase 1) rows stay visible/editable to all authenticated;
-- pending (captured) rows are Manager-only for read, approve, and reject.
DROP POLICY IF EXISTS contact_interactions_select ON public.contact_interactions;
CREATE POLICY contact_interactions_select
  ON public.contact_interactions
  FOR SELECT TO authenticated
  USING (review_state = 'approved' OR public.is_manager());

DROP POLICY IF EXISTS contact_interactions_insert ON public.contact_interactions;
CREATE POLICY contact_interactions_insert
  ON public.contact_interactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (review_state = 'approved' OR public.is_manager()));

DROP POLICY IF EXISTS contact_interactions_update ON public.contact_interactions;
CREATE POLICY contact_interactions_update
  ON public.contact_interactions
  FOR UPDATE TO authenticated
  USING (review_state = 'approved' OR public.is_manager())
  WITH CHECK (review_state = 'approved' OR public.is_manager());

DROP POLICY IF EXISTS contact_interactions_delete ON public.contact_interactions;
CREATE POLICY contact_interactions_delete
  ON public.contact_interactions
  FOR DELETE TO authenticated
  USING (review_state = 'approved' OR public.is_manager());
