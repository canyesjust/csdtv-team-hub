-- Board Meetings Phase 3 — audience surfaces, QR, archive

ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS active_qr_url text,
  ADD COLUMN IF NOT EXISTS active_qr_label text,
  ADD COLUMN IF NOT EXISTS active_qr_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_qr_duration_seconds integer;

CREATE TABLE IF NOT EXISTS public.qr_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  url_template text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_presets_select ON public.qr_presets;
CREATE POLICY qr_presets_select ON public.qr_presets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS qr_presets_insert ON public.qr_presets;
CREATE POLICY qr_presets_insert ON public.qr_presets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS qr_presets_update ON public.qr_presets;
CREATE POLICY qr_presets_update ON public.qr_presets FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS qr_presets_delete ON public.qr_presets;
CREATE POLICY qr_presets_delete ON public.qr_presets FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

INSERT INTO public.qr_presets (key, label, url_template, sort_order)
VALUES
  ('document_current_item', 'Current item document', NULL, 1),
  ('youtube_live', 'Watch live on YouTube', NULL, 2),
  ('archive', 'View this meeting''s archive', 'https://www.csdtvstaff.org/board/meeting/{production_number}/archive', 3),
  ('submit_comment', 'Submit public comment', 'https://www.canyonsdistrict.org/leadership/board/board-meetings/public-participation/', 4)
ON CONFLICT (key) DO NOTHING;
