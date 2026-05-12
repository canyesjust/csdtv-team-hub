-- Magic-link public task intake: tokens table + task provenance columns.
-- Service role / API routes insert tasks; RLS enabled with no policies = deny direct client access.

create table if not exists public.task_intake_tokens (
  id uuid primary key default gen_random_uuid(),
  team_user_id uuid not null references public.team (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists task_intake_tokens_team_user_id_idx
  on public.task_intake_tokens (team_user_id);

create index if not exists task_intake_tokens_token_hash_idx
  on public.task_intake_tokens (token_hash);

comment on table public.task_intake_tokens is 'Hashed magic tokens for /submit-task; team_user_id is default assignee for created tasks.';

alter table public.tasks
  add column if not exists intake_source text,
  add column if not exists intake_submitter_name text,
  add column if not exists intake_submitter_email text,
  add column if not exists intake_token_id uuid references public.task_intake_tokens (id) on delete set null;

comment on column public.tasks.intake_source is 'e.g. magic_link when created via public intake form.';
comment on column public.tasks.intake_submitter_name is 'Name entered on public intake form.';
comment on column public.tasks.intake_submitter_email is 'Email entered on public intake form.';

alter table public.task_intake_tokens enable row level security;

-- Optional follow-up (also in db/task_intake_token_plain.sql if applied separately):
alter table public.task_intake_tokens
  add column if not exists token_plain text;

comment on column public.task_intake_tokens.token_plain is
  'Raw query token for /submit-task?t=... Returned only to the owning team user via authenticated API; cleared on revoke.';
