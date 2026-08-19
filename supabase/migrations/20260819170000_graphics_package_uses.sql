-- Counting how often a package gets recalled is how you find out which one is
-- actually the house look and which one was a one-off.
create or replace function public.graphics_bump_package_uses(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.graphics_packages set uses = uses + 1 where id = p_id;
$$;

revoke execute on function public.graphics_bump_package_uses(uuid) from public;
grant execute on function public.graphics_bump_package_uses(uuid) to service_role;
