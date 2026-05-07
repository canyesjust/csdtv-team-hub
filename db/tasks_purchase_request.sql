-- Add purchase-request tracking fields to tasks.
-- Run in Supabase SQL editor or via migration tooling.

alter table public.tasks
  add column if not exists purchase_request boolean not null default false,
  add column if not exists purchase_request_link text;

-- Keep links valid when present.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_purchase_request_link_http_check'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_purchase_request_link_http_check
      check (
        purchase_request_link is null
        or purchase_request_link ~* '^https?://'
      );
  end if;
end
$$;
