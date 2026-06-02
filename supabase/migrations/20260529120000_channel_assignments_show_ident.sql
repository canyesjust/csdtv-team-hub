-- Operator opt-in: show channel ID card on assigned outputs (default off = blank).

ALTER TABLE public.channel_assignments
  ADD COLUMN IF NOT EXISTS show_channel_ident boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.channel_assignments.show_channel_ident IS
  'When true, assigned public output may show the channel identification card until cleared or superseded by on-air content.';
