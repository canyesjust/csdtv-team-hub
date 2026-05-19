-- Persist vote result hold state on broadcast overlay
ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS vote_result_held boolean NOT NULL DEFAULT false;
