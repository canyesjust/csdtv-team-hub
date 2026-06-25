@AGENTS.md

# Security guidelines

These rules apply to all code in this repo (Next.js + Supabase on Vercel). Follow
them whenever writing or reviewing code, especially auth, API routes, and DB access.

## Secrets

- Never hardcode secrets. Every key/token is read from `process.env` only.
- Only `NEXT_PUBLIC_*` values may reach the client (the Supabase anon key is fine).
  The service-role key, `CRON_SECRET`, and all `*_KEY`/`*_SECRET` values are
  server-only — never prefix them with `NEXT_PUBLIC_`.
- No `.env*` files are committed. Secrets live in Vercel / Supabase env config.
- Compare secrets/tokens in constant time (`lib/server/security.ts → timingSafeEqualStr`),
  and prefer an `Authorization` header over a `?key=` query param (query strings leak
  into logs).

## API routes

- `/api/*` is exempt from the middleware auth gate, so every route must gate itself.
- Routes that mutate data or read sensitive data must authenticate via
  `getAuthenticatedTeamUser()` / `requireManagerApi()` (or a cron/secret check).
- Public, unauthenticated write endpoints (submissions, intake, review links) must
  rate-limit using `lib/server/rate-limit.ts → checkRateLimit` (durable, serverless-safe).
  Do NOT roll a new in-memory `Map` limiter — it does not work on Vercel.
- Validate and bound all user input server-side (types, lengths, allowed MIME, file size).

## Database (Supabase)

- RLS must stay enabled on every table. New tables need explicit policies.
- The service-role client bypasses RLS — only use it server-side, never expose it.
- Avoid `USING (true)` write policies; scope writes to a role helper
  (e.g. `auth_team_role_is_hub_staff()`).
- `SECURITY DEFINER` helper functions used inside RLS should not be granted to
  `anon`/`PUBLIC` (revoke `EXECUTE FROM public`).
- After schema changes, check Supabase advisors (security + performance).

## Before shipping

1. Run `/security-review` (built-in) on your pending changes, or `/security-sweep`.
2. Confirm no new unauthenticated or un-rate-limited public endpoints.
3. Confirm RLS policies exist for any new tables.
4. See `docs/security-review-2026-06-24.md` for the baseline audit and known items.
