alter table public.signage_announcements
  add column if not exists icon text not null default 'bell';

comment on column public.signage_announcements.icon is 'Display icon slug (bell, calendar, megaphone, etc.)';
