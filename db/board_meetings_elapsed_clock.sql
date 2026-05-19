-- Independent meeting elapsed clock (not tied to go-live).
ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS elapsed_started_at timestamptz;
