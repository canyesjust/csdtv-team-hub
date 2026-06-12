-- Board meeting → signage takeover. Run in Supabase. Idempotent.
--
-- Per-screen opt-in: only screens with board_takeover_enabled follow a board
-- meeting. board_takeover_audio lets a screen play the live stream with sound.
-- A single state row (id = 1) holds the current takeover the operator started.

ALTER TABLE public.signage_screens
  ADD COLUMN IF NOT EXISTS board_takeover_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS board_takeover_audio boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.signage_board_takeover (
  id int PRIMARY KEY DEFAULT 1,
  active boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'preroll',
  board_channel_number int,
  youtube_url text,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signage_board_takeover_single CHECK (id = 1),
  CONSTRAINT signage_board_takeover_mode CHECK (mode IN ('preroll', 'live'))
);

INSERT INTO public.signage_board_takeover (id, active) VALUES (1, false)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.signage_board_takeover ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signage_board_takeover_read ON public.signage_board_takeover;
CREATE POLICY signage_board_takeover_read ON public.signage_board_takeover
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS signage_board_takeover_write ON public.signage_board_takeover;
CREATE POLICY signage_board_takeover_write ON public.signage_board_takeover
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
