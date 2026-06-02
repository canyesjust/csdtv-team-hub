-- Public agenda link for QR presets (one URL per board meeting).
ALTER TABLE public.board_meetings
  ADD COLUMN IF NOT EXISTS public_agenda_url text;

COMMENT ON COLUMN public.board_meetings.public_agenda_url IS
  'Public BoardDocs (or district) agenda URL for View meeting agenda QR preset.';

INSERT INTO public.qr_presets (key, label, url_template, description, sort_order)
VALUES (
  'agenda',
  'View meeting agenda',
  NULL,
  'Uses the public agenda URL saved on each board meeting (Board Meeting tab).',
  0
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
