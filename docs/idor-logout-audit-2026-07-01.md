# IDOR & logout audit — 2026-07-01

Scope: all ~200 `/api/*` routes (which are exempt from the middleware auth gate, so
each self-gates), the auth/role helpers, the impersonation model, and the logout flow.
Method: automated fan-out review of every route cluster plus manual verification of each
flagged item against the role model and RLS. Reads confirmed against
`db/signage_sites_access_rls.sql`, `lib/server/auth.ts`, `lib/server/impersonation.ts`,
`middleware.ts`.

## Bottom line

No high-severity IDOR. The parts most people get wrong are done right here: every
board-meeting nested resource is scoped to its parent, admin routes are Manager-gated,
and impersonation can't escalate privilege. Logout properly revokes the server-side
session. Two things are worth acting on — a signage read/write scoping asymmetry and
logout not clearing an active view-as session — plus a few minor consistency nits.

---

## IDOR

### Strong (no change needed)

- **Board-meeting motions / playlist / agenda items** — every mutation on a nested
  `[motion_id]`/`[item_id]` is scoped to the resolved meeting via
  `.eq('board_meeting_id', …)` / `.eq('meeting_playlist_id', …)`, either inline or in the
  shared loaders (`motion-control.ts`, `broadcast-control.ts`). A Staff user cannot pass a
  valid `production_id` in the path plus a motion/item id from a *different* meeting and
  have it take effect. The `withControlContext` / `withBoardMeetingProduction` /
  `withPlaylistContext` wrappers enforce the parent check first. (The `pull-subitem`
  gap found earlier this session is now fixed.)
- **Admin routes** (`/api/admin/*`) — all gated by `isManagerRole` *before* the
  service-role client is used. Not merely "authenticated".
- **Impersonation** (`/api/impersonate/start|stop|session`) — Manager-only,
  self-impersonation blocked, subject validated, 8-hour TTL, writes an
  `impersonation_audit` row. No privilege-escalation path.
- **Public intake** (`crew/[production_number]/signup`, `task-intake/submit`,
  `signage-submissions`, `contacts/inbound`, `report-error`) — intentionally
  unauthenticated, but all are rate-limited (`lib/server/rate-limit.ts`), input-bounded,
  and where relevant signature- or token-hash-verified.
- **ID-keyed staff resources** (media-assets, playlist/timer templates, qr-presets,
  output-channels, lower-third people/groups) — Staff/Manager-gated, and these are
  *global shared team resources*, not per-user owned. Acting on any id is by design, not
  IDOR. Upload routes additionally scope storage paths to `${teamUser.id}/`.

### Worth acting on

**1. Signage: reads are site-scoped, writes are not (MEDIUM / by-design gap).**
`db/signage_sites_access_rls.sql` adds per-site SELECT scoping — a team member granted
Site A sees only Site A. But its own header states writes are deliberately left
unscoped: all signage writes go through the service-role key in routes gated only by the
*global* `requireSignageEditorApi` / `requireSignageApproverApi`, which check the
`signage_role='editor'` / `signage_approver` flag but not `signage_site_access`. Net
effect: an editor granted only Site A can still create/edit/delete content, screens,
announcements, areas, wayfinding, and visitors for Site B by supplying Site B's
`site_id`/`id` (e.g. `PATCH /api/signage/content/[id]`, `app/api/signage/content/[id]/route.ts:31`).

This is documented as intentional (editors are trusted globally today), so it's not an
accidental hole. But the asymmetry is a real latent gap: if `signage_site_access` grants
are meant to *restrict* editors, the write routes need the same
`signage_can_access_site(site_id)` check the RLS applies to reads. Decision needed: are
signage editors global, or site-restricted? If global, consider dropping the per-site
read scoping to avoid a false sense of isolation; if restricted, enforce it on writes.

Caveat: `signage_sites_access_rls.sql` is a `db/` script ("REVIEW, then run in Supabase")
— confirm it's actually deployed, since the app-layer writes don't depend on it either way.

**2. `PATCH /api/library/quick-links/[id]` — no manager gate (LOW).**
Any non-Student-Intern can soft-deactivate any quick link (`active:false`) by id
(`app/api/library/quick-links/[id]/route.ts:14-22`). Quick links are a shared team
library (not per-user owned), so this isn't a classic IDOR, but deactivation is a
broader action than creation and arguably should require Staff/Manager. Low impact
(reversible soft delete, internal users only).

### Minor consistency nits (LOW)

- `playlist-templates/[id]/items/reorder` updates each item by id without confirming it
  belongs to `[id]` — unlike the single-item PATCH/DELETE which do
  `.eq('template_id', …)`. Staff-gated global resource, so no practical impact; tighten
  for consistency.
- `playlist-templates/[id]/duplicate` doesn't null-check the source template before
  creating the copy. Cosmetic.
- **Brand review-key routes** (`review-colors`, `upload/sign`, `upload/finalize`) — the
  single shared `BRAND_REVIEW_KEY` grants review edits across *all* schools by design
  (external reviewers review the whole library); uploads are path-scoped to the school
  `code` and rate-limited. Working as intended; noted only so the "one key = all schools"
  trust model is a conscious choice.

---

## Logout

The flow is sound. `supabase.auth.signOut()` (in `AppLayout.tsx:277`, `login/page.tsx`,
and `middleware.ts` on `not-on-team`) uses the default **global** scope, which revokes
the refresh token on the auth server — this is real server-side session invalidation, not
just clearing a local cookie. The `@supabase/ssr` cookie adapter clears the httpOnly auth
cookies, and middleware copies cleared cookies onto the redirect response. No `scope:
'local'` overrides anywhere.

**One gap (MEDIUM): logout doesn't end an active view-as session.**
Impersonation is only stopped by the explicit "Exit view-as" banner button
(`/api/impersonate/stop`). `handleSignOut` doesn't call it, and the
`impersonation_sessions` row is keyed to the actor with an 8-hour TTL. So if a Manager
logs out while impersonating, the session persists server-side; on their next login,
`getAuthenticatedTeamUser()` resumes view-as until it expires. It only affects the
manager's own account (not a cross-user compromise), but it's surprising and worth
closing.

Fix: have `handleSignOut` `await fetch('/api/impersonate/stop', { method: 'POST' })`
(best-effort) before `supabase.auth.signOut()`, or clear the actor's impersonation row in
the same server action that handles logout.

---

## Suggested priorities

1. Decide the signage editor trust model; if editors should be site-restricted, add
   `signage_can_access_site` enforcement to the signage write routes (finding 1).
2. Clear impersonation on logout (logout finding).
3. Add a Staff/Manager gate to quick-links deactivate; tighten the reorder ownership
   check (findings 2 and nits).

None of these are urgent/exploitable-by-outsiders — all require an authenticated internal
account — but 1 and the logout gap are the two most worth scheduling.
