-- Horizontal placement for on-air lower thirds (left, center, right).
ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS lower_third_position text NOT NULL DEFAULT 'left';

ALTER TABLE public.meeting_broadcast_state
  DROP CONSTRAINT IF EXISTS meeting_broadcast_state_lower_third_position_check;

ALTER TABLE public.meeting_broadcast_state
  ADD CONSTRAINT meeting_broadcast_state_lower_third_position_check
  CHECK (lower_third_position IN ('left', 'center', 'right'));
