-- Board Meetings Phase 1 — schema, RLS, seed output_channels
-- Apply in Supabase SQL Editor after review.

-- ─── board_meetings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id uuid NOT NULL UNIQUE REFERENCES public.productions (id) ON DELETE CASCADE,
  scheduled_public_start timestamptz,
  closed_session_start timestamptz,
  broadcast_status text NOT NULL DEFAULT 'draft'
    CHECK (broadcast_status IN ('draft', 'prepared', 'live', 'archived', 'cancelled')),
  agenda_extracted_at timestamptz,
  agenda_locked boolean NOT NULL DEFAULT false,
  agenda_locked_at timestamptz,
  agenda_locked_by uuid REFERENCES public.team (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_meetings_production_id ON public.board_meetings (production_id);

-- ─── lower_third_people (library first — referenced by presenters) ────────
CREATE TABLE IF NOT EXISTS public.lower_third_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  primary_title text,
  affiliation text,
  photo_path text,
  alternate_titles text[],
  category text NOT NULL CHECK (category IN ('board_member', 'staff', 'presenter', 'other')),
  officer_position text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.team (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lower_third_people_lookup
  ON public.lower_third_people (category, is_active, display_name);

-- ─── board_meeting_agenda_items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_meeting_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  section_number integer NOT NULL,
  section_title text NOT NULL,
  item_number text NOT NULL,
  sort_order integer NOT NULL,
  title text NOT NULL,
  original_title text,
  type text NOT NULL CHECK (type IN ('procedural', 'information', 'action', 'recognition')),
  action_requested boolean NOT NULL DEFAULT false,
  is_broadcastable boolean NOT NULL DEFAULT true,
  consent_block text,
  notes text,
  subitems jsonb,
  needs_review boolean NOT NULL DEFAULT false,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_agenda_meeting_sort
  ON public.board_meeting_agenda_items (board_meeting_id, sort_order);

-- ─── board_meeting_agenda_documents ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_meeting_agenda_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES public.board_meeting_agenda_items (id) ON DELETE CASCADE,
  title text NOT NULL,
  filename text NOT NULL,
  source_url text,
  storage_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── board_meeting_presenters ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_meeting_presenters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_item_id uuid NOT NULL REFERENCES public.board_meeting_agenda_items (id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.lower_third_people (id) ON DELETE SET NULL,
  name text NOT NULL,
  title text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_board_presenters_person ON public.board_meeting_presenters (person_id);

-- ─── lower_third_groups ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lower_third_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  member_ids uuid[] NOT NULL,
  default_layout text NOT NULL DEFAULT 'primary_secondary'
    CHECK (default_layout IN ('primary_secondary', 'all_equal', 'names_only')),
  created_by uuid REFERENCES public.team (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── output_channels ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.output_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_number integer NOT NULL UNIQUE CHECK (channel_number >= 1 AND channel_number <= 32),
  channel_name text NOT NULL,
  view_type text NOT NULL CHECK (view_type IN ('overlay', 'preroll', 'second_screen', 'dais')),
  tier text NOT NULL CHECK (tier IN ('main', 'backup')),
  access_secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS (Phase 1: any authenticated user; anon has no access) ─────────────
ALTER TABLE public.board_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_meeting_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_meeting_agenda_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_meeting_presenters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lower_third_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lower_third_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_channels ENABLE ROW LEVEL SECURITY;

-- board_meetings
DROP POLICY IF EXISTS board_meetings_select ON public.board_meetings;
CREATE POLICY board_meetings_select ON public.board_meetings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS board_meetings_insert ON public.board_meetings;
CREATE POLICY board_meetings_insert ON public.board_meetings FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meetings_update ON public.board_meetings;
CREATE POLICY board_meetings_update ON public.board_meetings FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meetings_delete ON public.board_meetings;
CREATE POLICY board_meetings_delete ON public.board_meetings FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- agenda items
DROP POLICY IF EXISTS board_meeting_agenda_items_select ON public.board_meeting_agenda_items;
CREATE POLICY board_meeting_agenda_items_select ON public.board_meeting_agenda_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS board_meeting_agenda_items_insert ON public.board_meeting_agenda_items;
CREATE POLICY board_meeting_agenda_items_insert ON public.board_meeting_agenda_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meeting_agenda_items_update ON public.board_meeting_agenda_items;
CREATE POLICY board_meeting_agenda_items_update ON public.board_meeting_agenda_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meeting_agenda_items_delete ON public.board_meeting_agenda_items;
CREATE POLICY board_meeting_agenda_items_delete ON public.board_meeting_agenda_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- documents
DROP POLICY IF EXISTS board_meeting_agenda_documents_select ON public.board_meeting_agenda_documents;
CREATE POLICY board_meeting_agenda_documents_select ON public.board_meeting_agenda_documents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS board_meeting_agenda_documents_insert ON public.board_meeting_agenda_documents;
CREATE POLICY board_meeting_agenda_documents_insert ON public.board_meeting_agenda_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meeting_agenda_documents_update ON public.board_meeting_agenda_documents;
CREATE POLICY board_meeting_agenda_documents_update ON public.board_meeting_agenda_documents FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meeting_agenda_documents_delete ON public.board_meeting_agenda_documents;
CREATE POLICY board_meeting_agenda_documents_delete ON public.board_meeting_agenda_documents FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- presenters
DROP POLICY IF EXISTS board_meeting_presenters_select ON public.board_meeting_presenters;
CREATE POLICY board_meeting_presenters_select ON public.board_meeting_presenters FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS board_meeting_presenters_insert ON public.board_meeting_presenters;
CREATE POLICY board_meeting_presenters_insert ON public.board_meeting_presenters FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meeting_presenters_update ON public.board_meeting_presenters;
CREATE POLICY board_meeting_presenters_update ON public.board_meeting_presenters FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS board_meeting_presenters_delete ON public.board_meeting_presenters;
CREATE POLICY board_meeting_presenters_delete ON public.board_meeting_presenters FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- lower_third_people
DROP POLICY IF EXISTS lower_third_people_select ON public.lower_third_people;
CREATE POLICY lower_third_people_select ON public.lower_third_people FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS lower_third_people_insert ON public.lower_third_people;
CREATE POLICY lower_third_people_insert ON public.lower_third_people FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS lower_third_people_update ON public.lower_third_people;
CREATE POLICY lower_third_people_update ON public.lower_third_people FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS lower_third_people_delete ON public.lower_third_people;
CREATE POLICY lower_third_people_delete ON public.lower_third_people FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- lower_third_groups
DROP POLICY IF EXISTS lower_third_groups_select ON public.lower_third_groups;
CREATE POLICY lower_third_groups_select ON public.lower_third_groups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS lower_third_groups_insert ON public.lower_third_groups;
CREATE POLICY lower_third_groups_insert ON public.lower_third_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS lower_third_groups_update ON public.lower_third_groups;
CREATE POLICY lower_third_groups_update ON public.lower_third_groups FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS lower_third_groups_delete ON public.lower_third_groups;
CREATE POLICY lower_third_groups_delete ON public.lower_third_groups FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- output_channels
DROP POLICY IF EXISTS output_channels_select ON public.output_channels;
CREATE POLICY output_channels_select ON public.output_channels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS output_channels_insert ON public.output_channels;
CREATE POLICY output_channels_insert ON public.output_channels FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS output_channels_update ON public.output_channels;
CREATE POLICY output_channels_update ON public.output_channels FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS output_channels_delete ON public.output_channels;
CREATE POLICY output_channels_delete ON public.output_channels FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- ─── Seed output_channels (idempotent) ─────────────────────────────────────
INSERT INTO public.output_channels (channel_number, channel_name, view_type, tier, access_secret)
VALUES
  (1, 'Main Overlay', 'overlay', 'main', gen_random_uuid()::text),
  (2, 'Backup Overlay', 'overlay', 'backup', gen_random_uuid()::text),
  (3, 'Main Pre-roll', 'preroll', 'main', gen_random_uuid()::text),
  (4, 'Backup Pre-roll', 'preroll', 'backup', gen_random_uuid()::text),
  (5, 'Main Second Screen', 'second_screen', 'main', gen_random_uuid()::text),
  (6, 'Backup Second Screen', 'second_screen', 'backup', gen_random_uuid()::text),
  (7, 'Main Dais', 'dais', 'main', gen_random_uuid()::text),
  (8, 'Backup Dais', 'dais', 'backup', gen_random_uuid()::text)
ON CONFLICT (channel_number) DO NOTHING;
