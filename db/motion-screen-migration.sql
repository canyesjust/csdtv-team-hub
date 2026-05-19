-- Motion screen redesign migration
-- Run this in Supabase Dashboard SQL Editor

-- Result overlay columns on broadcast state
ALTER TABLE meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS active_vote_result_motion_id uuid,
  ADD COLUMN IF NOT EXISTS vote_result_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS vote_result_duration_seconds integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS vote_result_held boolean DEFAULT false;

-- Vote count columns on motions (if not already present from Phase 4)
ALTER TABLE meeting_motions
  ADD COLUMN IF NOT EXISTS yea_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nay_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abstain_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result text;

-- Supersede chain for vote corrections (if not already present)
ALTER TABLE meeting_motion_votes
  ADD COLUMN IF NOT EXISTS superseded_by_vote_id uuid REFERENCES meeting_motion_votes(id);

-- Make sure realtime is wired up for motion tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_motions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE meeting_motions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_motion_votes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE meeting_motion_votes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_broadcast_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE meeting_broadcast_state';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_attendance'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE meeting_attendance';
  END IF;
END $$;
