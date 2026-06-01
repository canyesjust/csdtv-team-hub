-- Recurring task definitions ("series") that materialize real task rows on a schedule.
-- Engine: a daily pg_cron job calls public.generate_recurring_tasks(current_date),
-- which fans out one task per assignee on each "show" day, due N days later, until end_date.

create table if not exists public.task_recurrences (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  priority text not null default 'normal',
  production_id uuid references public.productions (id) on delete set null,
  needs_equipment boolean not null default false,
  hide_from_signage boolean not null default false,

  frequency text not null default 'weekly',          -- 'daily' | 'weekly' | 'monthly'
  interval integer not null default 1,                -- every N days/weeks/months
  show_weekday smallint,                              -- 0=Sun..6=Sat (weekly)
  show_monthday smallint,                             -- 1..31 (monthly)
  due_offset_days integer not null default 0,         -- due = show date + offset (Wed->Fri = 2)

  start_date date not null,
  end_date date,                                      -- the "until..." (null = until manually stopped)

  assignment_mode text not null default 'fanout',     -- each assignee gets their own copy
  active boolean not null default true,
  created_by uuid references public.team (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint task_recurrences_frequency_check
    check (frequency in ('daily', 'weekly', 'monthly')),
  constraint task_recurrences_interval_check
    check (interval >= 1),
  constraint task_recurrences_weekday_check
    check (show_weekday is null or show_weekday between 0 and 6),
  constraint task_recurrences_monthday_check
    check (show_monthday is null or show_monthday between 1 and 31)
);

create index if not exists task_recurrences_active_idx
  on public.task_recurrences (active);

create table if not exists public.task_recurrence_assignees (
  recurrence_id uuid not null references public.task_recurrences (id) on delete cascade,
  team_id uuid not null references public.team (id) on delete cascade,
  primary key (recurrence_id, team_id)
);

create index if not exists task_recurrence_assignees_team_idx
  on public.task_recurrence_assignees (team_id);

-- Link generated task instances back to their series + the cycle they belong to.
alter table public.tasks
  add column if not exists recurrence_id uuid references public.task_recurrences (id) on delete set null,
  add column if not exists recurrence_cycle_date date;

create index if not exists tasks_recurrence_idx
  on public.tasks (recurrence_id);

-- Idempotency: one task per (series, person, cycle) so the cron can run safely more than once.
create unique index if not exists tasks_recurrence_dedup
  on public.tasks (recurrence_id, assigned_to, recurrence_cycle_date)
  where recurrence_id is not null;

-- RLS (mirror tasks / task_assignments conventions)
alter table public.task_recurrences enable row level security;
alter table public.task_recurrence_assignees enable row level security;

drop policy if exists task_recurrences_select on public.task_recurrences;
create policy task_recurrences_select on public.task_recurrences
  for select to authenticated using (true);

drop policy if exists task_recurrences_insert on public.task_recurrences;
create policy task_recurrences_insert on public.task_recurrences
  for insert to authenticated with check (get_team_id() is not null);

drop policy if exists task_recurrences_update on public.task_recurrences;
create policy task_recurrences_update on public.task_recurrences
  for update to authenticated using (get_team_id() is not null);

drop policy if exists task_recurrences_delete on public.task_recurrences;
create policy task_recurrences_delete on public.task_recurrences
  for delete to authenticated using (is_manager() or created_by = get_team_id());

drop policy if exists task_recurrence_assignees_select on public.task_recurrence_assignees;
create policy task_recurrence_assignees_select on public.task_recurrence_assignees
  for select to authenticated using (true);

drop policy if exists task_recurrence_assignees_insert on public.task_recurrence_assignees;
create policy task_recurrence_assignees_insert on public.task_recurrence_assignees
  for insert to authenticated with check (auth.uid() is not null);

drop policy if exists task_recurrence_assignees_delete on public.task_recurrence_assignees;
create policy task_recurrence_assignees_delete on public.task_recurrence_assignees
  for delete to authenticated using (auth.uid() is not null);

-- Generation engine: materializes due task instances for a given run date.
create or replace function public.generate_recurring_tasks(p_run_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  a record;
  v_due date;
  v_show boolean;
  v_anchor date;
  v_weeks integer;
  v_months integer;
  v_task_id uuid;
  v_count integer := 0;
begin
  for r in
    select * from public.task_recurrences
    where active = true
      and start_date <= p_run_date
      and (end_date is null or p_run_date <= end_date)
  loop
    v_show := false;

    if r.frequency = 'daily' then
      if ((p_run_date - r.start_date) % greatest(r.interval, 1)) = 0 then
        v_show := true;
      end if;

    elsif r.frequency = 'weekly' then
      if r.show_weekday is not null
         and extract(dow from p_run_date)::int = r.show_weekday then
        v_anchor := r.start_date
          + (((r.show_weekday - extract(dow from r.start_date)::int) + 7) % 7);
        if p_run_date >= v_anchor then
          v_weeks := ((p_run_date - v_anchor) / 7);
          if (v_weeks % greatest(r.interval, 1)) = 0 then
            v_show := true;
          end if;
        end if;
      end if;

    elsif r.frequency = 'monthly' then
      if r.show_monthday is not null
         and extract(day from p_run_date)::int = r.show_monthday then
        v_months := (extract(year from p_run_date)::int * 12 + extract(month from p_run_date)::int)
                  - (extract(year from r.start_date)::int * 12 + extract(month from r.start_date)::int);
        if v_months >= 0 and (v_months % greatest(r.interval, 1)) = 0 then
          v_show := true;
        end if;
      end if;
    end if;

    if not v_show then
      continue;
    end if;

    v_due := p_run_date + coalesce(r.due_offset_days, 0);

    for a in
      select team_id from public.task_recurrence_assignees where recurrence_id = r.id
    loop
      v_task_id := null;

      insert into public.tasks (
        title, description, priority, production_id, needs_equipment, hide_from_signage,
        status, assigned_to, created_by, due_date, recurrence_id, recurrence_cycle_date
      ) values (
        r.title, r.description, coalesce(r.priority, 'normal'), r.production_id,
        coalesce(r.needs_equipment, false), coalesce(r.hide_from_signage, false),
        'pending', a.team_id, r.created_by, v_due, r.id, p_run_date
      )
      on conflict (recurrence_id, assigned_to, recurrence_cycle_date)
        where recurrence_id is not null
      do nothing
      returning id into v_task_id;

      if v_task_id is not null then
        insert into public.task_assignments (task_id, team_id, assigned_by)
        values (v_task_id, a.team_id, r.created_by)
        on conflict (task_id, team_id) do nothing;
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- Daily schedule at 12:00 UTC (~6/7am Central). pg_cron upserts by job name.
select cron.schedule(
  'generate-recurring-tasks',
  '0 12 * * *',
  $$ select public.generate_recurring_tasks(current_date); $$
);
