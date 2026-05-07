-- Hide specific tasks from the public task ops signage board.
-- Run in Supabase SQL editor or apply via migration tooling.

alter table public.tasks
  add column if not exists hide_from_signage boolean not null default false;

comment on column public.tasks.hide_from_signage is 'When true, task is omitted from /signage/tasks and /api/signage/tasks-data.';
