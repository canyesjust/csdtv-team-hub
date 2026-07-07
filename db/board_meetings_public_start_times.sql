-- Public start times for the "Watch Board Meetings Live" page.
--
-- Replaces the embed's hardcoded 7:00 p.m. fallback with operator-entered times:
-- one overall meeting start plus optional time-certain starts per agenda section
-- (e.g. Closed 5:00, Study 5:15, Business 7:00). Stored as plain wall-clock
-- labels (America/Denver) — no timezone conversion, display-only.
--
-- Shape: { "meeting": "HH:MM" | null, "sections": { "<section_number>": "HH:MM" } }
--
-- RLS: board_meetings already has row-level security enabled with its existing
-- policies; adding a column needs no new policy. Writes go through the
-- service-role API route (PATCH /api/board-meetings/[production_id]), which is
-- gated to hub staff / managers.

alter table public.board_meetings
  add column if not exists public_start_times jsonb not null default '{}'::jsonb;

comment on column public.board_meetings.public_start_times is
  'Operator-entered wall-clock start times (America/Denver) for the public Watch page. Shape: { "meeting": "HH:MM"|null, "sections": { "<section_number>": "HH:MM" } }. Display-only labels; not timezone-converted.';
