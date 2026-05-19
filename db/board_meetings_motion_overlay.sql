-- Motion vote result overlay columns (Phase 4 + hold)

ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS active_vote_result_motion_id uuid REFERENCES public.meeting_motions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vote_result_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS vote_result_duration_seconds integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS vote_result_held boolean NOT NULL DEFAULT false;

-- meeting_motions tally/result (Phase 4 baseline; safe to re-run)
ALTER TABLE public.meeting_motions
  ADD COLUMN IF NOT EXISTS tally_yea integer,
  ADD COLUMN IF NOT EXISTS tally_nay integer,
  ADD COLUMN IF NOT EXISTS tally_abstain integer,
  ADD COLUMN IF NOT EXISTS tally_absent integer,
  ADD COLUMN IF NOT EXISTS tally_recused integer,
  ADD COLUMN IF NOT EXISTS result text;
