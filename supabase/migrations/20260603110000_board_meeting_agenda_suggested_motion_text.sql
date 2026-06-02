ALTER TABLE public.board_meeting_agenda_items
  ADD COLUMN IF NOT EXISTS suggested_motion_text text;

COMMENT ON COLUMN public.board_meeting_agenda_items.suggested_motion_text IS
  'AI-suggested motion wording for action items; used on motion screen auto-fill.';
