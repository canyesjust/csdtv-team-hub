-- Board Meetings Phase 2 — broadcast MVP

-- channel_assignments
CREATE TABLE IF NOT EXISTS public.channel_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  output_channel_id uuid NOT NULL REFERENCES public.output_channels (id),
  board_meeting_id uuid NOT NULL REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.team (id),
  unassigned_at timestamptz,
  unassigned_by uuid REFERENCES public.team (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_assignments_active_unique
  ON public.channel_assignments (output_channel_id)
  WHERE unassigned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_channel_assignments_meeting
  ON public.channel_assignments (board_meeting_id)
  WHERE unassigned_at IS NULL;

-- meeting_broadcast_state
CREATE TABLE IF NOT EXISTS public.meeting_broadcast_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL UNIQUE REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  current_agenda_item_id uuid REFERENCES public.board_meeting_agenda_items (id) ON DELETE SET NULL,
  overlay_visible boolean NOT NULL DEFAULT true,
  mode text NOT NULL DEFAULT 'normal'
    CHECK (mode IN ('normal', 'recess', 'technical_difficulties')),
  mode_started_at timestamptz,
  mode_duration_seconds integer,
  mode_message text,
  active_timer_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.team (id)
);

-- meeting_timers (before FK from broadcast_state)
CREATE TABLE IF NOT EXISTS public.timer_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_seconds integer NOT NULL,
  show_on_broadcast_default boolean NOT NULL DEFAULT false,
  show_on_speaker_monitor_default boolean NOT NULL DEFAULT true,
  show_on_dais_default boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.timer_templates (id) ON DELETE SET NULL,
  label text,
  duration_seconds integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by text CHECK (ended_by IS NULL OR ended_by IN ('completed', 'cancelled')),
  show_on_broadcast boolean NOT NULL DEFAULT false,
  show_on_speaker_monitor boolean NOT NULL DEFAULT true,
  show_on_dais boolean NOT NULL DEFAULT true,
  started_by uuid REFERENCES public.team (id)
);

ALTER TABLE public.meeting_broadcast_state
  DROP CONSTRAINT IF EXISTS meeting_broadcast_state_active_timer_id_fkey;

ALTER TABLE public.meeting_broadcast_state
  ADD CONSTRAINT meeting_broadcast_state_active_timer_id_fkey
  FOREIGN KEY (active_timer_id) REFERENCES public.meeting_timers (id) ON DELETE SET NULL;

-- meeting_event_log
CREATE TABLE IF NOT EXISTS public.meeting_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  operator_id uuid REFERENCES public.team (id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_event_log_meeting_time
  ON public.meeting_event_log (board_meeting_id, occurred_at);

-- RLS
ALTER TABLE public.channel_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_broadcast_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_timers ENABLE ROW LEVEL SECURITY;

-- channel_assignments policies
DROP POLICY IF EXISTS channel_assignments_select ON public.channel_assignments;
CREATE POLICY channel_assignments_select ON public.channel_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS channel_assignments_insert ON public.channel_assignments;
CREATE POLICY channel_assignments_insert ON public.channel_assignments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS channel_assignments_update ON public.channel_assignments;
CREATE POLICY channel_assignments_update ON public.channel_assignments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS channel_assignments_delete ON public.channel_assignments;
CREATE POLICY channel_assignments_delete ON public.channel_assignments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- meeting_broadcast_state policies
DROP POLICY IF EXISTS meeting_broadcast_state_select ON public.meeting_broadcast_state;
CREATE POLICY meeting_broadcast_state_select ON public.meeting_broadcast_state FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_broadcast_state_insert ON public.meeting_broadcast_state;
CREATE POLICY meeting_broadcast_state_insert ON public.meeting_broadcast_state FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_broadcast_state_update ON public.meeting_broadcast_state;
CREATE POLICY meeting_broadcast_state_update ON public.meeting_broadcast_state FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_broadcast_state_delete ON public.meeting_broadcast_state;
CREATE POLICY meeting_broadcast_state_delete ON public.meeting_broadcast_state FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- meeting_event_log policies
DROP POLICY IF EXISTS meeting_event_log_select ON public.meeting_event_log;
CREATE POLICY meeting_event_log_select ON public.meeting_event_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_event_log_insert ON public.meeting_event_log;
CREATE POLICY meeting_event_log_insert ON public.meeting_event_log FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_event_log_update ON public.meeting_event_log;
CREATE POLICY meeting_event_log_update ON public.meeting_event_log FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_event_log_delete ON public.meeting_event_log;
CREATE POLICY meeting_event_log_delete ON public.meeting_event_log FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- timer_templates policies
DROP POLICY IF EXISTS timer_templates_select ON public.timer_templates;
CREATE POLICY timer_templates_select ON public.timer_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS timer_templates_insert ON public.timer_templates;
CREATE POLICY timer_templates_insert ON public.timer_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS timer_templates_update ON public.timer_templates;
CREATE POLICY timer_templates_update ON public.timer_templates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS timer_templates_delete ON public.timer_templates;
CREATE POLICY timer_templates_delete ON public.timer_templates FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- meeting_timers policies
DROP POLICY IF EXISTS meeting_timers_select ON public.meeting_timers;
CREATE POLICY meeting_timers_select ON public.meeting_timers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_timers_insert ON public.meeting_timers;
CREATE POLICY meeting_timers_insert ON public.meeting_timers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_timers_update ON public.meeting_timers;
CREATE POLICY meeting_timers_update ON public.meeting_timers FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_timers_delete ON public.meeting_timers;
CREATE POLICY meeting_timers_delete ON public.meeting_timers FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- Seed timer templates (only when empty)
INSERT INTO public.timer_templates (name, duration_seconds, show_on_broadcast_default, show_on_speaker_monitor_default, show_on_dais_default, sort_order)
SELECT v.name, v.duration_seconds, v.show_on_broadcast_default, v.show_on_speaker_monitor_default, v.show_on_dais_default, v.sort_order
FROM (VALUES
  ('Patron Comment 2 min'::text, 120, false, true, true, 1),
  ('Patron Comment 3 min', 180, false, true, true, 2),
  ('Board Report 5 min', 300, false, true, true, 3)
) AS v(name, duration_seconds, show_on_broadcast_default, show_on_speaker_monitor_default, show_on_dais_default, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.timer_templates LIMIT 1);

-- Realtime (idempotent)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_broadcast_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_timers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
