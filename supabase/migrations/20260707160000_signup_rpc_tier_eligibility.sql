-- Add per-role tier gating to the signup RPC. If a slot has allowed_tiers set,
-- a student whose tier is not in that list is rejected with NOT_ELIGIBLE.
-- Also locks only the slot row (FOR UPDATE OF s); FOR UPDATE cannot apply to
-- the nullable side of the crew_roles LEFT JOIN.
CREATE OR REPLACE FUNCTION public.signup_student_crew_atomic(p_production_number integer, p_slot_id uuid, p_student_number text, p_signed_up_by_self boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_month_start timestamptz := date_trunc('month', v_now);

  v_production record;
  v_slot record;
  v_student record;
  v_tier record;

  v_filled_count integer := 0;
  v_month_count integer := 0;
  v_recent_signup timestamptz;
  v_hours_left integer := 0;
  v_signed_up_by text := case when coalesce(p_signed_up_by_self, false) then 'self' else 'staff' end;
begin
  select id, title, has_student_crew, start_datetime
  into v_production
  from public.productions
  where production_number = p_production_number
  limit 1;

  if v_production is null or coalesce(v_production.has_student_crew, false) = false then
    return jsonb_build_object('success', false, 'status', 404, 'code', 'EVENT_NOT_AVAILABLE', 'message', 'Event not available');
  end if;

  if v_production.start_datetime is not null and v_production.start_datetime < v_now then
    return jsonb_build_object('success', false, 'status', 400, 'code', 'EVENT_PASSED', 'message', 'This event has already happened');
  end if;

  select s.id, s.capacity, s.allowed_tiers, r.name as role_name
  into v_slot
  from public.crew_role_slots s
  join public.production_crew pc on pc.id = s.production_crew_id
  left join public.crew_roles r on r.id = s.role_id
  where s.id = p_slot_id
    and pc.production_id = v_production.id
  for update of s;

  if v_slot is null then
    return jsonb_build_object('success', false, 'status', 400, 'code', 'INVALID_SLOT', 'message', 'Invalid sign-up slot');
  end if;

  select id, name, tier, parent_name, parent_email, email, active
  into v_student
  from public.students
  where student_number = trim(p_student_number)
  limit 1;

  if v_student is null or coalesce(v_student.active, false) = false then
    return jsonb_build_object(
      'success', false, 'status', 404, 'code', 'STUDENT_NOT_FOUND',
      'message', 'We couldn''t find that student number. Double-check it or contact your teacher.'
    );
  end if;

  -- Per-role tier gating: if the slot restricts tiers, the student must match.
  if v_slot.allowed_tiers is not null
     and array_length(v_slot.allowed_tiers, 1) is not null
     and not (coalesce(v_student.tier, '') = any(v_slot.allowed_tiers)) then
    return jsonb_build_object(
      'success', false, 'status', 403, 'code', 'NOT_ELIGIBLE',
      'message', 'This position is only open to certain students, and it looks like you''re not eligible for this one. Please pick another open position.'
    );
  end if;

  if exists (
    select 1 from public.crew_signups cs
    where cs.crew_role_slot_id = p_slot_id and cs.student_id = v_student.id
  ) then
    return jsonb_build_object('success', false, 'status', 400, 'code', 'ALREADY_SIGNED_UP', 'message', 'This student is already signed up for this position.');
  end if;

  select count(*)::int into v_filled_count
  from public.crew_signups cs
  where cs.crew_role_slot_id = p_slot_id;

  if v_filled_count >= coalesce(v_slot.capacity, 0) then
    return jsonb_build_object('success', false, 'status', 400, 'code', 'SLOT_FULL', 'message', 'This position is now full. Please refresh to see other open spots.');
  end if;

  select cooldown_hours, monthly_event_cap
  into v_tier
  from public.signup_tiers
  where name = v_student.tier
  limit 1;

  if v_tier is not null then
    if coalesce(v_tier.cooldown_hours, 0) > 0 then
      select cs.signed_up_at into v_recent_signup
      from public.crew_signups cs
      where cs.student_id = v_student.id
        and cs.signed_up_at >= (v_now - make_interval(hours => v_tier.cooldown_hours))
      order by cs.signed_up_at desc
      limit 1;

      if v_recent_signup is not null then
        v_hours_left := greatest(1, v_tier.cooldown_hours - floor(extract(epoch from (v_now - v_recent_signup)) / 3600)::int);
        return jsonb_build_object(
          'success', false, 'status', 400, 'code', 'COOLDOWN_ACTIVE',
          'message', format('You signed up recently. Please wait about %s more hour%s before signing up again.', v_hours_left, case when v_hours_left = 1 then '' else 's' end)
        );
      end if;
    end if;

    if v_tier.monthly_event_cap is not null then
      select count(*)::int into v_month_count
      from public.crew_signups cs
      where cs.student_id = v_student.id
        and cs.signed_up_at >= v_month_start;

      if v_month_count >= v_tier.monthly_event_cap then
        return jsonb_build_object(
          'success', false, 'status', 400, 'code', 'MONTHLY_CAP_REACHED',
          'message', format('You''ve reached your limit of %s event%s this month.', v_tier.monthly_event_cap, case when v_tier.monthly_event_cap = 1 then '' else 's' end)
        );
      end if;
    end if;
  end if;

  begin
    insert into public.crew_signups (crew_role_slot_id, student_id, signed_up_by)
    values (p_slot_id, v_student.id, v_signed_up_by);
  exception
    when unique_violation then
      return jsonb_build_object('success', false, 'status', 400, 'code', 'ALREADY_SIGNED_UP', 'message', 'This student is already signed up for this position.');
    when check_violation then
      return jsonb_build_object('success', false, 'status', 500, 'code', 'DATA_ERROR', 'message', 'We could not save your sign-up. Please contact the CSDtv office.');
  end;

  return jsonb_build_object(
    'success', true,
    'status', 200,
    'code', 'OK',
    'message', format('%s is signed up as %s!', v_student.name, coalesce(v_slot.role_name, 'Crew member')),
    'signed_up_by', v_signed_up_by,
    'student_name', v_student.name,
    'student_email', v_student.email,
    'parent_name', v_student.parent_name,
    'parent_email', v_student.parent_email,
    'role_name', coalesce(v_slot.role_name, 'Crew member'),
    'production_title', v_production.title,
    'production_start', v_production.start_datetime
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.signup_student_crew_atomic(integer, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_student_crew_atomic(integer, uuid, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_student_crew_atomic(integer, uuid, text, boolean) TO service_role;
