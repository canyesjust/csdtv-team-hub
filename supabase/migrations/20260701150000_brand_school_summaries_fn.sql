-- Efficiency: compute the gallery summary (distinct logo count + chosen preview file
-- per school) in one indexed query instead of streaming every school_logos row into the
-- app and reducing it in JS. Used by GET /api/brand.
--
-- Preview priority mirrors the app: cover PNG/SVG > cover (any) > SVG > Official PNG >
-- any PNG > any other raster; Word docs are excluded from previews but still counted.
-- security invoker + revoked from PUBLIC: only the server-side service role calls it.

create or replace function public.brand_school_summaries()
returns table (school_code text, logo_count bigint, preview_path text)
language sql
stable
security invoker
set search_path = public
as $$
  with counts as (
    select l.school_code, count(distinct l.category || '||' || l.name) as logo_count
    from public.school_logos l
    group by l.school_code
  ),
  ranked as (
    select
      l.school_code,
      l.storage_path,
      row_number() over (
        partition by l.school_code
        order by
          (case
            when l.is_cover and l.format in ('svg', 'png') then 6
            when l.is_cover then 5
            when l.format = 'svg' then 4
            when lower(l.category) = 'official' and l.format = 'png' then 3
            when l.format = 'png' then 2
            else 1
          end) desc,
          l.id asc
      ) as rn
    from public.school_logos l
    where l.format <> 'docx'
  )
  select c.school_code, c.logo_count, r.storage_path
  from counts c
  left join ranked r on r.school_code = c.school_code and r.rn = 1;
$$;

revoke all on function public.brand_school_summaries() from public;
grant execute on function public.brand_school_summaries() to service_role;
