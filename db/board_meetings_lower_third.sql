-- Active lower third on broadcast (operator-selected from people library)

ALTER TABLE public.meeting_broadcast_state
  ADD COLUMN IF NOT EXISTS active_lower_third_person_id uuid
    REFERENCES public.lower_third_people (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_broadcast_state_lower_third
  ON public.meeting_broadcast_state (active_lower_third_person_id)
  WHERE active_lower_third_person_id IS NOT NULL;
