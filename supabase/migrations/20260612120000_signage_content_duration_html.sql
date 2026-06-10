alter table public.signage_content
  add column if not exists display_seconds int not null default 10,
  add column if not exists html_body text;

alter table public.signage_content
  alter column media_path drop not null;
