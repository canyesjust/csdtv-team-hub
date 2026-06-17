-- Ensures the agenda item "suggested motion" text column exists.
-- This is the column the dais "Suggested motion" box and the "Update on screen"
-- button read/write. Safe to run repeatedly.

-- 1) Add the column if it's missing (nullable text).
alter table public.board_meeting_agenda_items
  add column if not exists suggested_motion_text text;

-- 2) Verify it's there (should return one row: suggested_motion_text | text).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'board_meeting_agenda_items'
  and column_name = 'suggested_motion_text';
