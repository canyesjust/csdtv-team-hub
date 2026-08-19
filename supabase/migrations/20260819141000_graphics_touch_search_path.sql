-- Pin the search_path on the trigger helper (Supabase security advisor 0011).
create or replace function public.graphics_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin new.updated_at = now(); return new; end;
$$;
