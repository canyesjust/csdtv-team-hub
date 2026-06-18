-- Station-wide timer bell choice (single row). Run in Supabase. Idempotent.
-- choice: 'classic' | 'soft' | 'triad' | 'ding' | 'custom'
-- custom_url: public URL of an uploaded sound, used when choice = 'custom'.

CREATE TABLE IF NOT EXISTS public.board_bell_settings (
  id int PRIMARY KEY DEFAULT 1,
  choice text NOT NULL DEFAULT 'classic',
  custom_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_bell_settings_single CHECK (id = 1)
);

INSERT INTO public.board_bell_settings (id, choice) VALUES (1, 'classic')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.board_bell_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_bell_settings_read ON public.board_bell_settings;
CREATE POLICY board_bell_settings_read ON public.board_bell_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS board_bell_settings_write ON public.board_bell_settings;
CREATE POLICY board_bell_settings_write ON public.board_bell_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
