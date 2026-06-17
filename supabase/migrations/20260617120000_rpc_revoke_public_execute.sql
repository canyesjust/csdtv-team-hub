-- Restrict direct RPC access on operational functions.
-- Public flows (crew signup, equipment) go through Next.js API routes using service_role.
-- Dashboard flows (recurring tasks, cost recompute) use authenticated sessions.
-- pg_cron generate_recurring_tasks runs as postgres (superuser).

REVOKE ALL ON FUNCTION public.equipment_checkout_atomic(uuid, text, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_checkout_atomic(uuid, text, text, date, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_checkout_atomic(uuid, text, text, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.equipment_checkin_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equipment_checkin_atomic(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.equipment_checkin_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.kit_checkout_atomic(uuid, text, text, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kit_checkout_atomic(uuid, text, text, date, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kit_checkout_atomic(uuid, text, text, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.signup_student_crew_atomic(integer, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_student_crew_atomic(integer, uuid, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_student_crew_atomic(integer, uuid, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.generate_recurring_tasks(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_recurring_tasks(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_recurring_tasks(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.recompute_all_estimated_costs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_all_estimated_costs() FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_all_estimated_costs() TO authenticated;

REVOKE ALL ON FUNCTION public.recompute_one_estimated_cost(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recompute_one_estimated_cost(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_one_estimated_cost(uuid) TO authenticated;
