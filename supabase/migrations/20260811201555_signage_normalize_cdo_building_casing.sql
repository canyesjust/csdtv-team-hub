-- One building ("Canyons District Office") had been entered with inconsistent
-- casing across screens ("cdo" on 6, "CDO" on 2), which the targeting picker
-- showed as two separate building chips. signageTargetMatches() already
-- compares case-insensitively so live-screen targeting wasn't broken, but the
-- AbleSign dirty-marking cron used an exact match and could silently skip the
-- differently-cased screens. Normalize everything to "CDO".
--
-- Applied directly to production via Supabase MCP on 2026-08-11; this file
-- exists for repo history/tracking and so any future environment (e.g. a
-- restored branch) picks up the same normalization.

update signage_screens
set building = 'CDO'
where building ilike 'cdo' and building is distinct from 'CDO';

-- Dedupe target_buildings arrays where both casings had been selected (the
-- picker bug let an operator select "cdo" and "CDO" as if they were two
-- different buildings).
update signage_content
set target_buildings = (
  select array_agg(distinct case when b ilike 'cdo' then 'CDO' else b end)
  from unnest(target_buildings) as b
)
where target_buildings is not null
  and exists (select 1 from unnest(target_buildings) as b where b ilike 'cdo' and b is distinct from 'CDO');

update signage_announcements
set target_buildings = (
  select array_agg(distinct case when b ilike 'cdo' then 'CDO' else b end)
  from unnest(target_buildings) as b
)
where target_buildings is not null
  and exists (select 1 from unnest(target_buildings) as b where b ilike 'cdo' and b is distinct from 'CDO');
