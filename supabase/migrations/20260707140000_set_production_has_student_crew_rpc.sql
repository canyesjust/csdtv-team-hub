-- Staff need to enable/disable student crew, but productions_update RLS is
-- Manager-only (and shouldn't be widened to let Staff edit every production
-- field). This SECURITY DEFINER function flips only has_student_crew, and only
-- for Manager or Staff. Interns are rejected.
CREATE OR REPLACE FUNCTION public.set_production_has_student_crew(p_production_id uuid, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := public.auth_team_role();
begin
  if v_role is null or v_role not in ('Manager', 'Staff') then
    raise exception 'Not authorized to change student crew' using errcode = '42501';
  end if;

  update public.productions
     set has_student_crew = coalesce(p_enabled, false)
   where id = p_production_id;

  return found;
end;
$function$;

REVOKE ALL ON FUNCTION public.set_production_has_student_crew(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_production_has_student_crew(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_production_has_student_crew(uuid, boolean) TO authenticated, service_role;
