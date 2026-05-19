-- Board Meetings Phase 5 — rich pre-roll (media library + playlists)
-- Apply in Supabase SQL Editor after phases 1–4.
-- Create storage bucket `media-library` in Dashboard (public read, 500MB limit).

-- ─── media_assets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  asset_type text NOT NULL CHECK (asset_type IN ('video', 'image', 'bumper', 'audio_bed')),
  filename text NOT NULL,
  storage_path text NOT NULL,
  file_size_bytes integer,
  duration_seconds numeric,
  width integer,
  height integer,
  mime_type text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  thumbnail_path text,
  uploaded_by uuid REFERENCES public.team (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_type_created ON public.media_assets (asset_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_tags ON public.media_assets USING gin (tags);

-- ─── playlist_templates ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.playlist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  default_music_bed_id uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  loop_behavior text NOT NULL DEFAULT 'loop_all' CHECK (loop_behavior IN ('loop_all', 'play_once')),
  created_by uuid REFERENCES public.team (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS playlist_templates_one_default
  ON public.playlist_templates (is_default)
  WHERE is_default = true;

-- ─── playlist_template_items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.playlist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.playlist_templates (id) ON DELETE CASCADE,
  item_type text NOT NULL,
  media_asset_id uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  info_card_config jsonb,
  duration_seconds integer,
  label text NOT NULL,
  transition text NOT NULL DEFAULT 'fade' CHECK (transition IN ('cut', 'fade', 'slide')),
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playlist_template_items_sort
  ON public.playlist_template_items (template_id, sort_order);

-- ─── meeting_playlists ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL UNIQUE REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  derived_from_template_id uuid REFERENCES public.playlist_templates (id) ON DELETE SET NULL,
  music_bed_id uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  loop_behavior text NOT NULL DEFAULT 'loop_all' CHECK (loop_behavior IN ('loop_all', 'play_once')),
  play_during_live boolean NOT NULL DEFAULT false,
  play_during_recess boolean NOT NULL DEFAULT false,
  playback_state text NOT NULL DEFAULT 'idle' CHECK (playback_state IN ('idle', 'playing', 'paused', 'held')),
  current_item_id uuid,
  current_item_started_at timestamptz,
  held_item_id uuid,
  replace_now_asset_id uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  replace_now_started_at timestamptz,
  replace_now_duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── meeting_playlist_items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_playlist_id uuid NOT NULL REFERENCES public.meeting_playlists (id) ON DELETE CASCADE,
  item_type text NOT NULL,
  media_asset_id uuid REFERENCES public.media_assets (id) ON DELETE SET NULL,
  info_card_config jsonb,
  duration_seconds integer,
  label text NOT NULL,
  transition text NOT NULL DEFAULT 'fade' CHECK (transition IN ('cut', 'fade', 'slide')),
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_playlist_items_sort
  ON public.meeting_playlist_items (meeting_playlist_id, sort_order);

ALTER TABLE public.meeting_playlists
  DROP CONSTRAINT IF EXISTS meeting_playlists_current_item_id_fkey;
ALTER TABLE public.meeting_playlists
  ADD CONSTRAINT meeting_playlists_current_item_id_fkey
  FOREIGN KEY (current_item_id) REFERENCES public.meeting_playlist_items (id) ON DELETE SET NULL;

ALTER TABLE public.meeting_playlists
  DROP CONSTRAINT IF EXISTS meeting_playlists_held_item_id_fkey;
ALTER TABLE public.meeting_playlists
  ADD CONSTRAINT meeting_playlists_held_item_id_fkey
  FOREIGN KEY (held_item_id) REFERENCES public.meeting_playlist_items (id) ON DELETE SET NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_playlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_assets_select ON public.media_assets;
CREATE POLICY media_assets_select ON public.media_assets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS media_assets_insert ON public.media_assets;
CREATE POLICY media_assets_insert ON public.media_assets FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS media_assets_update ON public.media_assets;
CREATE POLICY media_assets_update ON public.media_assets FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS media_assets_delete ON public.media_assets;
CREATE POLICY media_assets_delete ON public.media_assets FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS playlist_templates_select ON public.playlist_templates;
CREATE POLICY playlist_templates_select ON public.playlist_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS playlist_templates_insert ON public.playlist_templates;
CREATE POLICY playlist_templates_insert ON public.playlist_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS playlist_templates_update ON public.playlist_templates;
CREATE POLICY playlist_templates_update ON public.playlist_templates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS playlist_templates_delete ON public.playlist_templates;
CREATE POLICY playlist_templates_delete ON public.playlist_templates FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS playlist_template_items_select ON public.playlist_template_items;
CREATE POLICY playlist_template_items_select ON public.playlist_template_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS playlist_template_items_insert ON public.playlist_template_items;
CREATE POLICY playlist_template_items_insert ON public.playlist_template_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS playlist_template_items_update ON public.playlist_template_items;
CREATE POLICY playlist_template_items_update ON public.playlist_template_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS playlist_template_items_delete ON public.playlist_template_items;
CREATE POLICY playlist_template_items_delete ON public.playlist_template_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS meeting_playlists_select ON public.meeting_playlists;
CREATE POLICY meeting_playlists_select ON public.meeting_playlists FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_playlists_insert ON public.meeting_playlists;
CREATE POLICY meeting_playlists_insert ON public.meeting_playlists FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_playlists_update ON public.meeting_playlists;
CREATE POLICY meeting_playlists_update ON public.meeting_playlists FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_playlists_delete ON public.meeting_playlists;
CREATE POLICY meeting_playlists_delete ON public.meeting_playlists FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS meeting_playlist_items_select ON public.meeting_playlist_items;
CREATE POLICY meeting_playlist_items_select ON public.meeting_playlist_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_playlist_items_insert ON public.meeting_playlist_items;
CREATE POLICY meeting_playlist_items_insert ON public.meeting_playlist_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_playlist_items_update ON public.meeting_playlist_items;
CREATE POLICY meeting_playlist_items_update ON public.meeting_playlist_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_playlist_items_delete ON public.meeting_playlist_items;
CREATE POLICY meeting_playlist_items_delete ON public.meeting_playlist_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Realtime for live playlist director UI
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_playlists;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
