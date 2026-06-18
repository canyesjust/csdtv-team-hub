-- Per-item editable video timestamp override for board-meeting agenda items.
--
-- Agenda timestamps (the "jump to this point" offsets on the public watch page
-- and the YouTube chapters) are normally COMPUTED from when each item was taken
-- on air during the live meeting, measured from stream start. That baseline is
-- close but not always exact (preroll length, a late "Next item" tap, etc.).
--
-- When video_offset_seconds is set, it OVERRIDES the computed offset for that
-- item everywhere it's shown. NULL means "use the auto-detected time."
alter table public.board_meeting_agenda_items
  add column if not exists video_offset_seconds integer;

comment on column public.board_meeting_agenda_items.video_offset_seconds is
  'Manual override (seconds from video 0:00) for this item''s timestamp. NULL = use the auto-detected offset from meeting events.';
