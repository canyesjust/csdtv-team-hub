# Signage access model

Last updated 2026-08-19.

Three tiers of reach, resolved per person on every request. Grants stack — the
widest grant covering a given location wins for that location.

| Tier | How it's granted | What they get |
|---|---|---|
| **Manager** | `team.role = 'Manager'` | Everything, every location. |
| **No grants at all** | (default) | Everything. Legacy fallback so people who predate the access model aren't locked out. Does **not** apply to signage-only editors — see below. |
| **Location** | a row in `signage_site_access` | That whole site: every screen, plus areas, announcements, wayfinding, visitors, branding, live takeover. |
| **Screen** | a row in `signage_screen_access` | Only those screens. See below. |

Grants are managed at **Dashboard → Signage → Access** (manager-only).

## Inviting someone as signage-only

Settings → Team → Invite team member. Leave the role as Staff (or whatever fits)
and set the second dropdown to **Signage only**. That writes
`team.signage_role = 'editor'`, which locks them to the signage tool and out of
the rest of the Hub (enforced in `middleware.ts`). Managers can't be signage-only
— they'd lose the rest of the Hub — so the option is disabled for that role.

An unassigned signage-only editor reaches **nothing**. The "no grants =
everything" fallback protects people who predate the access model, and someone
you just invited as signage-only can't predate it, so unassigned means
unassigned. They see a "No screens assigned yet" message until you give them a
location or a screen under Signage → Access.

Both invite paths set it. The password path passes `signage_role` to
`provision_team_member` in `app/api/admin/settings/route.ts`; the email path
passes it to the `invite-user` edge function. The settings page also PATCHes
`/api/signage/approvers` afterwards, so a stale deploy of that function can't
silently drop the flag.

### The sign-in page and the invite email

`/signage-login` is the signage front door. It renders the same
`app/login/LoginForm.tsx` with `variant="signage"`, so the auth logic is shared
and only the skin differs: Canyons district logo, "Digital Signage", and a
post-login landing of `SIGNAGE_HOME_PATH` instead of `/dashboard`. Adding a
variant means adding an entry to `SKINS` in that file — don't fork the form.

A signage-only invite gets its own email: Canyons-branded, from "Canyons Digital
Signage", subject "Your Canyons digital signage access", and its magic link
redirects to the signage content queue rather than the Hub home. The Hub email
still goes to everyone else, unchanged. Both live in
`supabase/functions/invite-user/index.ts`, which must be **redeployed** for
email changes to take effect — editing the repo file alone does nothing.

> Deployed v6 on 2026-08-19. The previously deployed version (v5) was behind the
> repo: it had no `dashboard_profile` handling at all, so anyone invited by email
> as Staff + "Productions focus" silently got the full hub. Redeploying fixed
> that as a side effect. Worth checking this function's deployed version against
> the repo before assuming a change is live.

## What a screen-scoped person can do

Screen-scoped means: they hold individual screens and no whole-location grant
anywhere.

**Can:**

- Post, schedule, edit and delete content targeted at their screens
- Push their screens
- Change how their screens look: layout, theme, orientation, name, webpage URL,
  wayfinding heading, notes, zone config

**Cannot:**

- Publish to all screens, or target an area or a building
- Create or delete screens
- Move a screen between areas or buildings, change its code, or change its
  takeover opt-ins
- Edit areas, wayfinding, visitors, or site-wide announcements
- Change branding, location settings, or global settings
- Go live, run push-all, rotate the public board link, or start a board takeover

The dashboard rail hides everything they can't reach, and the targeting picker
drops "All screens", Areas and Buildings — but the UI is a convenience. The
server enforces all of the above independently.

## Where it's enforced

**`lib/signage/access-scope.ts`** resolves a person's scope and answers the
questions. `resolveSignageScope` fails closed: a grants-lookup error throws
rather than widening to "all".

**`lib/signage/server-auth.ts`** is the only place an API route should ask:

| Helper | Use it for |
|---|---|
| `assertCanManageSignageSite` | Site-wide writes: areas, wayfinding, visitors, branding, live. Screen-scoped users fail this. |
| `assertCanAccessSignageSite` | Alias of the above, kept so older routes keep compiling. Same strict meaning. |
| `assertCanReadSignageSite` | Reading a site's shell. Screen-scoped users pass for the site their screen lives in. |
| `assertCanAccessSignageScreen` | One screen, by id. |
| `assertCanAccessSignageScreenCode` | One screen, by public code. |
| `assertCanEditScreenFields` | Which columns of a screen the caller may change. Evaluated per site. |
| `assertCanTargetSignageScreens` | Content and announcement targeting. |
| `requireSignageSiteManagerApi` | Global state with no `site_id` to check: global settings, board link, board takeover, push-all. |

Two rules that are easy to get wrong:

1. **A null `site_id` is not a free pass.** A row with no location sits outside
   every access policy, so anyone holding a grant is refused. Only managers and
   legacy no-grant users may touch one. (Production currently has zero such rows.)
2. **Screen-scoped is per location, not global.** Someone can run all of
   location A and hold one screen in location B. Their site grant in A must not
   unlock the full field set on the screen in B.

**RLS** (`supabase/migrations/20260819190000_signage_screen_access.sql`) mirrors
the same rules for SELECT. It's defence in depth for the browser's anon-key
client — the API routes run on the service role and bypass it.

## Writes are service-role only

Every `signage%` table grants the browser SELECT and nothing else
(`20260819193000_signage_writes_service_role_only.sql`). All writes go through
`/api/signage/*`, which is where the checks above live.

This closed a real hole. Every signage table previously carried a policy
declared `FOR ALL` with `USING (auth.uid() IS NOT NULL)`. `FOR ALL` covers
SELECT, and permissive policies OR together, so that clause granted every
signed-in Hub user read *and write* on every signage row — the per-site SELECT
policy from 2026-07-17 never restricted anything, and any team member could have
inserted content aimed at every screen in the district from a browser console.

If a future feature needs a direct browser write, add a scoped policy **and** the
matching table grant deliberately. Don't re-open them wholesale.

## Verified behaviour

Against production data on 2026-08-19:

| Scope | screens | sites | areas | content |
|---|---|---|---|---|
| No grants, no signage role (legacy) | 9 | 2 | 29 | 15 |
| Signage-only, unassigned | 0 | 0 | 0 | 0 |
| Location grant (cdo) | 9 | 1 | 4 | 13 |
| One screen at cdo | 1 | 1 | 1 | 13 |

Content stays high for the narrow tiers because most rows are `all_screens`,
which genuinely do play on that screen.


## Audit, 2026-08-19

Found while reviewing this work. All verified against production, all fixed in
`20260819210000_team_privilege_escalation_and_signage_only_scope.sql` unless
noted.

**Any signed-in user could make themselves a Manager.** The `team_update` policy
was `FOR UPDATE TO PUBLIC` with `USING (is_manager() OR supabase_user_id =
auth.uid())` and no `WITH CHECK`, so Postgres reused `USING` as the check.
Updating your own row passed regardless of which column you changed, and
`authenticated` held `UPDATE` on all 14 columns including `role`. One line in a
browser console did it. Confirmed by promoting a Student Intern in a rolled-back
transaction — `is_manager()` returned true immediately after. Fixed with
column-level grants: `authenticated` may now update only `name`, `email`,
`avatar_color`, `avatar_url`, `supabase_user_id`. Predates signage entirely.

**A signage-only editor counted as Hub staff.** `auth_team_role_is_hub_staff()`
read `team.role` only, and a signage-only invite keeps `role = 'Staff'`, so they
satisfied it and reached the 17 tables gated on it through PostgREST with the
public anon key. `middleware.ts` blocks page navigation, not REST calls, so the
UI lock was the only thing holding. The helper now excludes
`signage_role = 'editor'`.

**Infinite redirect for a Production Focus signage editor.** `middleware.ts` ran
signage editors through `isDashboardPathAllowed`, which refuses
`/dashboard/signage/*` for the production-focus profile, sending them to
`/dashboard`, which the signage lock sent straight back. Total lockout, only
fixable by a Manager editing the database. Reachable two ways: the "Signage-only
editors" toggle on the Access page lists Production Focus people, and changing an
existing signage editor's role in Settings. Signage editors now skip the profile
allowlist — the signage lock is the narrower rule, so it wins.

**Signage people were bounced to the CSDtv login.** Session expiry, a bookmarked
signage URL, a burned magic link, and the no-session path in `SignageProvider`
all hardcoded `/login`. They now resolve to `/signage-login` when the
destination is a signage page. Burned magic links matter here because corporate
mail scanners prefetch and consume them, so a signage invitee's *first* click
often lands on the error path.

### Still open

50 tables carry `SELECT` policies of the form `auth_team_id() IS NOT NULL` —
any team member can read them. That is much wider than signage and tightening it
has real blast radius, so it wasn't touched. Worth its own pass.

`team.signage_role` has no migration in `supabase/migrations/`; it was added out
of band, so an environment rebuilt from migrations alone would break.
