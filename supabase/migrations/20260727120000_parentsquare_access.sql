-- ParentSquare tools: add-on permission granted per team member, stacking on top of
-- their existing team.role. Managers always have access (checked in app code); this
-- column is the explicit grant for everyone else.
alter table public.team add column if not exists parentsquare_access boolean not null default false;
