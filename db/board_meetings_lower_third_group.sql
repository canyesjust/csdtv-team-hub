-- Optional free-form group label for organizing people in the lower-third picker
-- (e.g. "Board", "Leadership", "Principals", "Staff"). Run in Supabase. Idempotent.
alter table public.lower_third_people
  add column if not exists group_label text;
