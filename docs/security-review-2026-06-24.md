# Security & Rate-Limiting Review — June 24, 2026

Scope: full review of the Team Hub Next.js app (203 API routes), its Supabase
backend (project `pmzhpatxnngiagfzwkul`), and Vercel deployment. Focus on rate
limiting, authentication/authorization on API routes, service-role usage, input
validation, secrets handling, and database/storage posture.

## TL;DR

The app is in reasonable shape: every public table has RLS enabled, server
routes gate access through `getAuthenticatedTeamUser()` / `requireManagerApi()`,
and the highest-risk public form (crew sign-up) already uses a durable,
database-backed rate limiter. The main weaknesses are (1) the *other* public
write endpoints rely on an in-memory rate limiter that does not work on Vercel's
serverless runtime, (2) a few public write endpoints have no rate limiting at
all, and (3) several Supabase advisories around over-exposed RPCs, permissive
RLS policies, and listable public buckets.

Items marked **Fixed** were implemented in this change. Items marked
**Needs review** are recommendations that touch live data/config and should be
applied deliberately.

---

## Findings

### HIGH

**H1 — In-memory rate limiting is ineffective on serverless. (Fixed)**
`signage/submit`, `signage-submissions`, and `task-intake/submit` tracked
attempts in a per-process `Map`. On Vercel each request can land on a different
lambda instance, and instances cold-start frequently, so the counter is
effectively reset constantly — an attacker spreading requests bypasses the limit.
These endpoints write to the database, upload to storage, and send approver
emails, so the practical risk is spam, storage bloat, and email flooding of
staff. Fixed by routing all public write endpoints through a shared limiter
(`lib/server/rate-limit.ts`) backed by the existing `api_rate_limits` table,
with the in-memory check kept only as a fast-path.

**H2 — Public write endpoints with no rate limiting. (Fixed)**
`task-intake/submit`, `brand/flag`, and `brand/review-category` had no limiter.
`task-intake/submit` creates tasks and emails staff; the brand endpoints mutate
the `school_logos` table. All are reachable without a login (token/shared-key
gated only). Fixed by adding the shared limiter to each.

### MEDIUM

**M1 — Shared secrets passed in the URL query string. (Needs review)**
`signage/tasks-data` (`?k=`) and `brand/flag` / `brand/review-category`
(`?review=` / body `key`) authenticate with a static shared key. Query-string
secrets leak into server access logs, browser history, and `Referer` headers.
`tasks-data` in particular returns a broad internal dataset (all open tasks,
the full team roster, productions, assignees) — if that key leaks, so does that
data. Recommendation: move these keys to an `Authorization` header (or a signed,
expiring token), and compare in constant time (see M2). The comparison itself
was hardened in this change; moving off the query string is left for review
because it requires updating the callers (the signage display + the review link).

**M2 — Non-constant-time secret comparison. (Fixed)**
Secret checks used `===` / `!==`, which short-circuit and are theoretically
timing-observable. Replaced the comparisons in the key-gated routes and the cron
verifiers with `timingSafeEqualStr()` (`crypto.timingSafeEqual`). Low practical
risk over the network, but the fix is cheap.

**M3 — `api_rate_limits` grows unbounded. (Fixed)**
The durable limiter inserts one row per request and never deletes them. Added a
`prune_api_rate_limits()` SQL function plus a pg_cron schedule to delete rows
older than one day (`db/api_rate_limits_cleanup.sql`). Without this the table
would slowly accumulate forever.

**M4 — `SECURITY DEFINER` helper functions are callable by `anon`. (Accepted — do NOT revoke)**
Supabase's linter flags ~24 functions (e.g. `is_manager`, `auth_team_id`,
`auth_team_role_is_hub_staff`, `auth_user_can_access_production`) as executable
by `anon`/`authenticated`. **This is required and must not be changed.** These
functions are called from inside RLS policy expressions, and PostgreSQL evaluates
a policy as the *querying* role — that role needs `EXECUTE` on any function the
policy calls, even though the function is `SECURITY DEFINER`.

We initially revoked `EXECUTE` here; it broke account linking with
`permission denied for function auth_team_role_is_hub_staff` and was rolled back
(`grant execute ... to anon, authenticated`). The exposure is low risk — these
functions read `auth.uid()` and return null/false for anonymous callers — so the
finding is **accepted as-is**. The only safe revoke is `anon` on the non-RLS
action functions `recompute_*` / `generate_recurring_tasks` (kept callable by
`authenticated`, which the app needs). See `db/security_hardening_review.sql`.

Lesson: never revoke `EXECUTE` on a function used inside an RLS policy from the
roles that trigger that policy.

**M5 — Two RLS policies use `USING (true)` for ALL. (Needs review)**
`board_bell_settings` and `signage_board_takeover` have an `ALL` policy that
permits any *authenticated* user to read and write. Any signed-in team member
(including a student intern account) could modify the board bell settings or the
board takeover record. Recommendation: scope these writes to managers/approvers.
SQL drafted in `db/security_hardening_review.sql` (not applied — confirm desired
roles).

**M6 — Public storage buckets allow listing. (Needs review)**
`school-logos`, `sig-assets`, `signage-media`, `signage-submissions`, and
`lower-third-photos` are public buckets whose SELECT policy allows listing every
object, not just fetching by known URL. `signage-submissions` is the most
sensitive (user-submitted media). Recommendation: drop the broad `LIST`/SELECT
policy so objects are reachable by direct URL only. Left for review because it
depends on whether any client lists bucket contents.

### LOW

**L1 — No HTTP security headers. (Fixed, conservative)**
Added `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`X-DNS-Prefetch-Control`, and a `Permissions-Policy` globally in
`next.config.ts`. `X-Frame-Options`/`frame-ancestors` were intentionally **not**
set globally because the app embeds itself in iframes (board-watch on the
district site, signage screens). A scoped frame policy is noted as a follow-up.

**L2 — Leaked-password protection disabled. (Needs review)**
Supabase Auth can reject known-breached passwords (HaveIBeenPwned). Enable it in
Auth settings. Dashboard toggle, no code change.

**L3 — Mutable `search_path` on two functions. (Needs review)**
`recompute_all_estimated_costs` and `recompute_one_estimated_cost` should set a
fixed `search_path` to avoid search-path injection. SQL drafted in the review
file.

**L4 — `Access-Control-Allow-Origin: *` on `board/output/.../state`. (Accepted)**
This is intentional public read-only display data; no change recommended.

---

## What was changed in this pass

- `lib/server/rate-limit.ts` — new shared, serverless-safe limiter (durable
  Supabase store + in-memory fast path, standard `429` + `Retry-After`).
- `lib/server/security.ts` — `clientIp()` and `timingSafeEqualStr()` helpers.
- Wired the limiter and/or constant-time comparison into: `signage/submit`,
  `signage-submissions`, `task-intake/submit`, `brand/flag`,
  `brand/review-category`, `signage/tasks-data`.
- `next.config.ts` — conservative security headers.
- `db/api_rate_limits_cleanup.sql` — applied: prune function + hourly cron.
- `db/security_hardening_review.sql` — applied: M5 (board-table RLS scoped to hub
  staff), M6 (dropped public-bucket listing), L3 (search_path pins), and the
  anon-only revokes on the action functions. M4 (revoking EXECUTE on RLS helper
  functions) was attempted and **reverted** — it broke account linking; see M4.

## Recommended follow-ups (not done automatically)

1. Move query-string keys (M1) to `Authorization` headers / signed tokens.
2. Enable leaked-password protection in Supabase Auth (L2) — dashboard toggle.
3. Consider a managed limiter store (Vercel KV / Upstash) if traffic grows; the
   database-backed limiter is fine at current volume but adds a write per request.
