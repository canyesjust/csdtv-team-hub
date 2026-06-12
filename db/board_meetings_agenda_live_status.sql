-- Lets an operator mark an agenda item tabled or postponed during the live meeting
-- (skipped is already handled by is_broadcastable). null = normal.
alter table public.board_meeting_agenda_items
  add column if not exists live_status text
    check (live_status in ('tabled', 'postponed') or live_status is null);
