# Manager view-as (impersonation)

Managers can open the app as another team member to verify navigation, RLS, and page behavior.

## Setup (once per environment)

Run [`db/impersonation.sql`](../db/impersonation.sql) in the Supabase SQL editor. It creates:

- `impersonation_sessions` — active view-as (one subject per manager, 8-hour expiry)
- `impersonation_audit` — start/stop log
- Updates `auth_team_id()` and `auth_team_role()` so Postgres RLS uses the **subject** while view-as is active

## How to use

1. Sign in as a **Manager**.
2. Go to **Settings → Team**.
3. Click **View as** next to a team member.
4. You are redirected to the dashboard with their role, nav, and data access.
5. A yellow **Viewing as …** banner appears at the top; click **Exit view-as** to return.

## Client pages

Dashboard pages load the signed-in person via `GET /api/me/team` and `resolveEffectiveTeamRow()` so greetings, tasks, and “my” queries use the **subject** while view-as is active (not only the sidebar).

## Limits

- **Manager-only** — other roles cannot start view-as.
- **Cannot view as yourself**.
- **Settings** and **Onboarding admin** are blocked while view-as is active (redirects to dashboard home).
- **Settings** is hidden from the sidebar/more menu during view-as.
- API routes that require the real manager account should use `getActorTeamUser()` from `lib/server/auth.ts`, not `getAuthenticatedTeamUser()`.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/impersonate/session` | Current view-as state (layout banner) |
| POST | `/api/impersonate/start` | Body: `{ "teamMemberId": "<uuid>" }` |
| POST | `/api/impersonate/stop` | End view-as |
