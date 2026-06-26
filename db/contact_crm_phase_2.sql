-- ============================================================================
-- Contact CRM — Phase 2: Inbound BCC capture
-- Run in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Builds on Phase 1 (db/contact_crm_phase_1.sql). Adds:
--   1. external_message_id on contact_interactions (+ unique index) for webhook
--      idempotency — a provider retrying delivery must not double-capture.
--   2. capture_inbound_contact() — the single server-side entry point the inbound
--      webhook calls (service role). Dedups via find_contact_match(), stages a new
--      contact as 'pending_review' when there is no match, and always writes the
--      interaction as source='bcc', review_state='pending' so it lands in the
--      review queue rather than the live list. Sets body_purge_after for retention.
--   3. prune_contact_interaction_bodies() + pg_cron job that nulls body_raw after
--      its retention window (mirrors db/api_rate_limits_cleanup.sql).
--
-- No public REST surface is added: capture_inbound_contact is revoked from PUBLIC
-- and granted only to service_role (the webhook), and the prune helper is revoked
-- from PUBLIC and only invoked by pg_cron.
-- ============================================================================

-- ─── 1. Idempotency key for inbound captures ────────────────────────────────
ALTER TABLE public.contact_interactions
  ADD COLUMN IF NOT EXISTS external_message_id text;

COMMENT ON COLUMN public.contact_interactions.external_message_id IS
  'Provider message id for inbound (bcc) capture. Used to dedup webhook retries.';

-- One captured interaction per (contact, provider message). Partial so manual
-- Phase 1 rows (NULL external_message_id) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_interactions_msg
  ON public.contact_interactions (contact_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- ─── 2. Inbound capture entry point (service-role only) ─────────────────────
CREATE OR REPLACE FUNCTION public.capture_inbound_contact(
  p_sender_team_id uuid,
  p_email          text,
  p_name           text,
  p_org            text,
  p_subject        text,
  p_body           text,
  p_direction      text,
  p_occurred_at    timestamptz,
  p_message_id     text,
  p_retention_days int
)
RETURNS TABLE(contact_id uuid, interaction_id uuid, contact_created boolean, deduped boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email     text := NULLIF(lower(trim(p_email)), '');
  v_contact   uuid;
  v_created   boolean := false;
  v_interact  uuid;
  v_existing  uuid;
  v_msg       text := NULLIF(trim(p_message_id), '');
  v_retention int  := GREATEST(COALESCE(p_retention_days, 90), 1);
  v_dir       text := CASE WHEN p_direction IN ('inbound', 'outbound') THEN p_direction ELSE 'outbound' END;
BEGIN
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'capture_inbound_contact: email is required';
  END IF;

  -- Find an existing contact, or stage a new one for review.
  v_contact := public.find_contact_match(v_email, p_name, p_org);
  IF v_contact IS NULL THEN
    INSERT INTO public.contacts (name, email, organization, lifecycle_state, source, created_by)
    VALUES (
      COALESCE(NULLIF(trim(p_name), ''), split_part(v_email, '@', 1)),
      p_email,
      NULLIF(trim(p_org), ''),
      'pending_review',
      'bcc',
      p_sender_team_id
    )
    RETURNING id INTO v_contact;
    v_created := true;
  END IF;

  -- Idempotency: same provider message already captured for this contact?
  IF v_msg IS NOT NULL THEN
    SELECT ci.id INTO v_existing
      FROM public.contact_interactions ci
     WHERE ci.contact_id = v_contact
       AND ci.external_message_id = v_msg
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_contact, v_existing, v_created, true;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.contact_interactions (
    contact_id, interaction_type, occurred_at, summary, body_raw, direction,
    source, review_state, body_purge_after, logged_by, visibility, external_message_id
  ) VALUES (
    v_contact,
    'email',
    COALESCE(p_occurred_at, now()),
    -- Fallback one-liner; the summarize edge function may overwrite this.
    left(COALESCE(NULLIF(trim(p_subject), ''), NULLIF(trim(p_body), ''), 'Email'), 140),
    p_body,
    v_dir,
    'bcc',
    'pending',
    now() + make_interval(days => v_retention),
    p_sender_team_id,
    'team',
    v_msg
  )
  RETURNING id INTO v_interact;

  RETURN QUERY SELECT v_contact, v_interact, v_created, false;
END;
$$;

-- Keep this off the public REST surface; only the webhook (service role) calls it.
-- CREATE OR REPLACE re-grants EXECUTE to PUBLIC by default, so revoke from PUBLIC
-- and from anon/authenticated explicitly any time this function is (re)created.
REVOKE EXECUTE ON FUNCTION public.capture_inbound_contact(uuid, text, text, text, text, text, text, timestamptz, text, int) FROM public;
REVOKE EXECUTE ON FUNCTION public.capture_inbound_contact(uuid, text, text, text, text, text, text, timestamptz, text, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.capture_inbound_contact(uuid, text, text, text, text, text, text, timestamptz, text, int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.capture_inbound_contact(uuid, text, text, text, text, text, text, timestamptz, text, int) TO service_role;

COMMENT ON FUNCTION public.capture_inbound_contact(uuid, text, text, text, text, text, text, timestamptz, text, int) IS
  'Inbound BCC capture: dedup-match or stage a pending_review contact, then log a pending bcc interaction with retention. Service-role only.';

-- ─── 3. Retention: null body_raw after its purge window ─────────────────────
CREATE OR REPLACE FUNCTION public.prune_contact_interaction_bodies()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.contact_interactions
     SET body_raw = NULL
   WHERE body_raw IS NOT NULL
     AND body_purge_after IS NOT NULL
     AND body_purge_after < now();
$$;

REVOKE EXECUTE ON FUNCTION public.prune_contact_interaction_bodies() FROM public;
REVOKE EXECUTE ON FUNCTION public.prune_contact_interaction_bodies() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prune_contact_interaction_bodies() FROM authenticated;

-- Schedule hourly purge via pg_cron (no-op if the extension is absent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('prune_contact_interaction_bodies')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune_contact_interaction_bodies');
    PERFORM cron.schedule(
      'prune_contact_interaction_bodies',
      '23 * * * *',                        -- hourly at :23
      $cron$ SELECT public.prune_contact_interaction_bodies(); $cron$
    );
  END IF;
END;
$$;
