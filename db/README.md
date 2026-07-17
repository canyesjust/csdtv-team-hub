# `db/` SQL scripts

## Source of truth

**New schema changes go in `supabase/migrations/`** (timestamped, applied via
Supabase CLI / CI). Treat this `db/` folder as:

1. **Archive / hand-run history** — older domains (board meetings, contacts, etc.)
   that were applied manually before migrations were the default.
2. **One-off ops scripts** — cron setup, backfills, advisor fixes that are safe to
   re-read but must not be blindly re-executed on production without review.

## Do not

- Re-run entire historical `db/*.sql` files on production “to sync” — many are
  not idempotent or assume a prior state.
- Add new feature DDL only here without a matching migration.

## Promoting a `db/` script into migrations

1. Confirm the script is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.).
2. Copy it into `supabase/migrations/YYYYMMDDHHMMSS_description.sql`.
3. Leave the original under `db/` with a one-line note that it was promoted, or
   delete it only after every environment has the migration applied.
4. Apply via `supabase db push` / the project’s normal migration path — not by
   pasting into the SQL editor unless you are recovering an environment.

## Related

- School brand apply order: `README-school-brand.md`
- Security hardening notes: `docs/security-review-2026-06-24.md`
