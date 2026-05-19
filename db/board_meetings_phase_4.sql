-- Board Meetings Phase 4 — motion and vote tracking

CREATE TABLE IF NOT EXISTS public.meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.lower_third_people (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'remote', 'left_early', 'arrived_late')),
  arrived_at timestamptz,
  left_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_meeting_id, person_id)
);

CREATE TABLE IF NOT EXISTS public.meeting_motions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_meeting_id uuid NOT NULL REFERENCES public.board_meetings (id) ON DELETE CASCADE,
  agenda_item_id uuid REFERENCES public.board_meeting_agenda_items (id) ON DELETE SET NULL,
  consent_block text,
  motion_type text NOT NULL DEFAULT 'main'
    CHECK (motion_type IN ('main', 'substitute', 'amendment')),
  parent_motion_id uuid REFERENCES public.meeting_motions (id) ON DELETE SET NULL,
  motion_text text NOT NULL,
  moved_by_person_id uuid REFERENCES public.lower_third_people (id) ON DELETE SET NULL,
  seconded_by_person_id uuid REFERENCES public.lower_third_people (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open_for_discussion'
    CHECK (status IN ('open_for_discussion', 'voting', 'passed', 'failed', 'withdrawn', 'tabled', 'replaced', 'superseded')),
  vote_mode text CHECK (vote_mode IS NULL OR vote_mode IN ('voice', 'roll_call')),
  result text CHECK (result IS NULL OR result IN ('passed', 'failed')),
  tally_yea integer,
  tally_nay integer,
  tally_abstain integer,
  tally_absent integer,
  tally_recused integer,
  replaced_by_motion_id uuid REFERENCES public.meeting_motions (id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  voted_at timestamptz,
  resolved_at timestamptz,
  opened_by uuid REFERENCES public.team (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_motions_meeting_opened ON public.meeting_motions (board_meeting_id, opened_at);
CREATE INDEX IF NOT EXISTS idx_meeting_motions_agenda_item ON public.meeting_motions (agenda_item_id);
CREATE INDEX IF NOT EXISTS idx_meeting_motions_parent ON public.meeting_motions (parent_motion_id);
CREATE INDEX IF NOT EXISTS idx_meeting_motions_consent_block ON public.meeting_motions (consent_block);

CREATE TABLE IF NOT EXISTS public.meeting_motion_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motion_id uuid NOT NULL REFERENCES public.meeting_motions (id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.lower_third_people (id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('yea', 'nay', 'absent', 'abstain', 'recused')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.team (id),
  superseded_by_vote_id uuid REFERENCES public.meeting_motion_votes (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_motion_votes_active_unique
  ON public.meeting_motion_votes (motion_id, person_id)
  WHERE superseded_by_vote_id IS NULL;

ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS active_motion_id uuid REFERENCES public.meeting_motions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS active_vote_result_motion_id uuid REFERENCES public.meeting_motions (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vote_result_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS vote_result_duration_seconds integer DEFAULT 8;

ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_motions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_motion_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_attendance_select ON public.meeting_attendance;
CREATE POLICY meeting_attendance_select ON public.meeting_attendance FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_attendance_insert ON public.meeting_attendance;
CREATE POLICY meeting_attendance_insert ON public.meeting_attendance FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_attendance_update ON public.meeting_attendance;
CREATE POLICY meeting_attendance_update ON public.meeting_attendance FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_attendance_delete ON public.meeting_attendance;
CREATE POLICY meeting_attendance_delete ON public.meeting_attendance FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS meeting_motions_select ON public.meeting_motions;
CREATE POLICY meeting_motions_select ON public.meeting_motions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_motions_insert ON public.meeting_motions;
CREATE POLICY meeting_motions_insert ON public.meeting_motions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_motions_update ON public.meeting_motions;
CREATE POLICY meeting_motions_update ON public.meeting_motions FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_motions_delete ON public.meeting_motions;
CREATE POLICY meeting_motions_delete ON public.meeting_motions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS meeting_motion_votes_select ON public.meeting_motion_votes;
CREATE POLICY meeting_motion_votes_select ON public.meeting_motion_votes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS meeting_motion_votes_insert ON public.meeting_motion_votes;
CREATE POLICY meeting_motion_votes_insert ON public.meeting_motion_votes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_motion_votes_update ON public.meeting_motion_votes;
CREATE POLICY meeting_motion_votes_update ON public.meeting_motion_votes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS meeting_motion_votes_delete ON public.meeting_motion_votes;
CREATE POLICY meeting_motion_votes_delete ON public.meeting_motion_votes FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_motions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_motion_votes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_attendance;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
