-- When true, broadcast outputs show CSDtv branding instead of the current agenda item.
ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS agenda_branding_hold boolean NOT NULL DEFAULT false;
