-- Remember the iCompass / Diligent Community portal meeting id used to import the
-- agenda, so the board-meeting tab can pre-fill it next time instead of pasting.
alter table board_meetings
  add column if not exists icompass_meeting_id text;
