-- Track whether the operator has taken roll for a meeting, so the console can
-- nag until attendance is confirmed. Run in Supabase. Idempotent.
-- (Everyone defaults to "present", so we can't infer "taken" from the data.)
alter table public.meeting_broadcast_state
  add column if not exists attendance_recorded_at timestamptz;
