-- The deployed crew code reads/writes crew_role_slots.notes and .sort_order,
-- but the live table never had them (it has display_order/closed/role_name_override).
-- The table is empty, so add the columns the code expects. The three legacy
-- columns are left in place, unused, for later cleanup.
ALTER TABLE public.crew_role_slots ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.crew_role_slots ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Per-role tier gating. NULL / empty = open to everyone. Otherwise a student's
-- tier must be one of these for them to sign up.
ALTER TABLE public.crew_role_slots ADD COLUMN IF NOT EXISTS allowed_tiers text[];
