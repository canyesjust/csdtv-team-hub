-- Brand library shared-password gate: store the (hashed) site password so a manager
-- can set/change it from Settings without a redeploy. Single-row config table; all
-- access is via the service role (RLS on, no policies). If no row exists the app
-- falls back to the BRAND_SITE_PASSWORD env var, and if neither is set the gate is off.

create table if not exists public.brand_access_config (
  id integer primary key default 1 check (id = 1),
  password_hash text,      -- scrypt: 'scrypt$<salthex>$<hashhex>'
  session_token text,      -- opaque token stored in the access cookie; rotates on change
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.brand_access_config enable row level security;
-- No policies: only the server-side service role reads/writes this table.
