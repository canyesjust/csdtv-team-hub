# School brand colors and `schools` table

Thumbnail prompts and related UI read **only** from `public.schools` (`primary_color`, `secondary_color`, `accent_color`, `text_color`, etc.). The legacy `school_brand_colors` table is removed after the merge migration.

## Apply order (new or staging database)

1. **`school_brand_colors.sql`** — Creates the old brand table, RLS, and policies (only if you still need this historical path on a fresh DB).
2. **`school_brand_colors_seed.sql`** — Inserts brand rows keyed by `school_name`.
3. **`schools_merge_brand_colors.sql`** — Copies brand columns into `schools` by name (plus a few explicit name/code fixes), inserts missing schools from brand rows where needed, then **drops** `school_brand_colors`.

If your project **never** had `school_brand_colors`, ensure `schools` already has the brand columns (see `ALTER TABLE` at the top of `schools_merge_brand_colors.sql`), then seed colors directly on `schools` or run a reduced subset of the merge file your DBA approves.

## Production checklist

Run `schools_merge_brand_colors.sql` once in the Supabase SQL editor (after backup). Then verify:

```sql
-- Spot-check a school (e.g. Alta High)
select code, name, primary_color, secondary_color, accent_color, text_color
from public.schools
where lower(trim(name)) = 'alta high'
limit 1;
```

Confirm values are `#` + 3- or 6-digit hex (or nulls you accept). The app normalizes missing `#` on read, but keeping `#rrggbb` in the database is clearest.

Confirm the old table is gone:

```sql
select to_regclass('public.school_brand_colors');  -- should be null
```

## Editing colors in the app

Managers can set brand fields under **Settings → Admin → Schools & locations** using **Brand colors** on each row. Updates go to `public.schools` via the admin API (service role).

## Manual smoke test (thumbnail tab)

1. Open a production → **Thumbnail** tab.
2. Choose **Other / District** — generated prompt should show Canyons-style blues/golds in BRAND COLORS.
3. Choose a school with known colors in `schools` — BRAND COLORS should match that row (not district), and changing **School** should change colors immediately.
4. Reload the page — if you had an old local draft, the school control should still match after one normalization tick; pick another school and back to confirm.
