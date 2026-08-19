-- Prompter transport lives on the show. The prompter output page is chrome-free
-- and reads this, so the controls can sit in the show screen (and in Companion)
-- rather than on the output itself.
alter table public.graphics_shows
  add column if not exists prompter_roll boolean not null default false,
  add column if not exists prompter_speed numeric(4,2) not null default 1.0
    check (prompter_speed between 0.1 and 6.0);

comment on column public.graphics_shows.prompter_roll is
  'Prompter transport. Controls live in the show screen; the prompter output follows this.';
