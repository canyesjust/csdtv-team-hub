-- Persist magic-link secret so the hub can show the same URL/QR until rotate or revoke.
-- Still validated on submit via token_hash; token_plain is only returned to the link owner via API.

alter table public.task_intake_tokens
  add column if not exists token_plain text;

comment on column public.task_intake_tokens.token_plain is
  'Raw query token for /submit-task?t=... Returned only to the owning team user via authenticated API; cleared on revoke.';
