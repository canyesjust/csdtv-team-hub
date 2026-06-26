-- ============================================================================
-- Contact CRM — Phase 1: Foundation + manual CRM
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds an interaction log, last-contacted tracking, and follow-up dates to the
-- existing contacts feature. Also lays the Phase 2 guardrail scaffolding
-- (lifecycle state, source, review state, retention, dedup) so automatic BCC
-- capture later lands on a clean foundation. Phase 1 populates NONE of the
-- capture fields automatically — everything is manual/active/approved here.
-- ============================================================================

-- ─── 1. New columns on contacts ─────────────────────────────────────────────
-- All additive. Existing columns (name, email, tags, follow_up_status,
-- starred, card_image_url, created_by, etc.) are untouched.
ALTER TABLE public.contacts
  -- Phase 2 staging: auto-captured contacts will land as 'pending_review'.
  -- Phase 1 everything is 'active'.
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_state IN ('active', 'pending_review', 'archived')),
  -- How the contact entered the system. Phase 1: 'manual' or 'scan'.
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'scan', 'bcc', 'enrichment', 'import')),
  -- Denormalized most-recent approved interaction date (maintained by trigger).
  -- Used for "last contacted" display and sort, and the follow-up-due view.
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  -- Manual next-follow-up date that drives the "due / overdue" view.
  ADD COLUMN IF NOT EXISTS next_follow_up_date date,
  -- Normalized email for dedup matching (lower/trim, empty -> null).
  -- Plus-tag stripping is handled in find_contact_match() below.
  ADD COLUMN IF NOT EXISTS email_normalized text
    GENERATED ALWAYS AS (NULLIF(lower(trim(email)), '')) STORED;

CREATE INDEX IF NOT EXISTS idx_contacts_email_normalized
  ON public.contacts (email_normalized);
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle
  ON public.contacts (lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_contacts_follow_up
  ON public.contacts (next_follow_up_date)
  WHERE next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted
  ON public.contacts (last_contacted_at);

-- ─── 2. contact_interactions table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  interaction_type text NOT NULL DEFAULT 'note'
    CHECK (interaction_type IN ('email', 'call', 'meeting', 'text', 'note', 'mass_email')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Short one-line summary shown in the timeline.
  -- Phase 1: typed by the user. Phase 2: Claude-generated.
  summary text,
  -- Full raw content (e.g. email body). Phase 1 unused.
  -- Phase 2: nulled after the retention window (body_purge_after).
  body_raw text,
  direction text CHECK (direction IS NULL OR direction IN ('outbound', 'inbound')),
  -- How the interaction was logged. Phase 1: 'manual'.
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'bcc', 'mass_email', 'import')),
  -- Phase 2 review queue uses 'pending'. Phase 1 is always 'approved'.
  review_state text NOT NULL DEFAULT 'approved'
    CHECK (review_state IN ('approved', 'pending')),
  -- Retention: timestamp after which body_raw should be cleared. Phase 2 sets this.
  body_purge_after timestamptz,
  logged_by uuid REFERENCES public.team (id),
  -- Multi-user readiness: defaults to team-visible. UI is single-user for now.
  visibility text NOT NULL DEFAULT 'team'
    CHECK (visibility IN ('team', 'private')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_interactions_contact
  ON public.contact_interactions (contact_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_interactions_review
  ON public.contact_interactions (review_state)
  WHERE review_state = 'pending';
CREATE INDEX IF NOT EXISTS idx_contact_interactions_purge
  ON public.contact_interactions (body_purge_after)
  WHERE body_raw IS NOT NULL;

-- ─── 3. Maintain contacts.last_contacted_at ─────────────────────────────────
-- Recompute from the max approved interaction date whenever interactions change.
CREATE OR REPLACE FUNCTION public.refresh_contact_last_contacted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  target_contact uuid;
BEGIN
  target_contact := COALESCE(NEW.contact_id, OLD.contact_id);
  UPDATE public.contacts c
     SET last_contacted_at = (
       SELECT max(ci.occurred_at)
         FROM public.contact_interactions ci
        WHERE ci.contact_id = target_contact
          AND ci.review_state = 'approved'
     )
   WHERE c.id = target_contact;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_last_contacted ON public.contact_interactions;
CREATE TRIGGER trg_refresh_last_contacted
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_contact_last_contacted();

-- ─── 4. Dedup match helper (used by Phase 2 capture; safe to ship now) ───────
-- Returns the id of an existing contact matching email (normalized, plus-tag
-- stripped) first, then name + organization, else NULL.
CREATE OR REPLACE FUNCTION public.find_contact_match(
  p_email text,
  p_name  text,
  p_org   text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  match_id uuid;
  norm     text := NULLIF(lower(trim(p_email)), '');
  local    text;
  domain   text;
BEGIN
  -- Strip a plus-tag from the local part if present.
  IF norm IS NOT NULL AND position('@' in norm) > 0 THEN
    local  := split_part(norm, '@', 1);
    domain := split_part(norm, '@', 2);
    IF position('+' in local) > 0 THEN
      local := split_part(local, '+', 1);
    END IF;
    norm := local || '@' || domain;
  END IF;

  IF norm IS NOT NULL THEN
    SELECT id INTO match_id
      FROM public.contacts
     WHERE email_normalized = norm
        OR lower(trim(coalesce(email, ''))) = norm
     LIMIT 1;
    IF match_id IS NOT NULL THEN
      RETURN match_id;
    END IF;
  END IF;

  IF p_name IS NOT NULL AND length(trim(p_name)) > 0 THEN
    SELECT id INTO match_id
      FROM public.contacts
     WHERE lower(trim(name)) = lower(trim(p_name))
       AND (
         p_org IS NULL
         OR lower(trim(coalesce(organization, ''))) = lower(trim(p_org))
       )
     LIMIT 1;
  END IF;

  RETURN match_id;
END;
$$;

-- ─── 5. RLS on contact_interactions ─────────────────────────────────────────
-- Matches the existing app pattern: authenticated read-all, authenticated write.
-- (contacts already has RLS; the new columns inherit it.)
ALTER TABLE public.contact_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_interactions_select ON public.contact_interactions;
CREATE POLICY contact_interactions_select
  ON public.contact_interactions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS contact_interactions_insert ON public.contact_interactions;
CREATE POLICY contact_interactions_insert
  ON public.contact_interactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contact_interactions_update ON public.contact_interactions;
CREATE POLICY contact_interactions_update
  ON public.contact_interactions
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contact_interactions_delete ON public.contact_interactions;
CREATE POLICY contact_interactions_delete
  ON public.contact_interactions
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- ─── 6. Comments ────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.contact_interactions IS 'CRM interaction log: one row per touchpoint (email, call, meeting, note, mass_email). Phase 1 manual; Phase 2 auto-populated from BCC capture.';
COMMENT ON COLUMN public.contacts.lifecycle_state IS 'active | pending_review (Phase 2 staging) | archived.';
COMMENT ON COLUMN public.contacts.source IS 'How the contact entered: manual, scan, bcc, enrichment, import.';
COMMENT ON COLUMN public.contacts.last_contacted_at IS 'Most recent approved interaction date. Maintained by trg_refresh_last_contacted.';
COMMENT ON COLUMN public.contacts.next_follow_up_date IS 'Manual follow-up date driving the due/overdue view.';
COMMENT ON FUNCTION public.find_contact_match(text, text, text) IS 'Dedup lookup for capture: matches by normalized email (plus-tag stripped) then name+org.';
