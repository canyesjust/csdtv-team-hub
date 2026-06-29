# Full-site code inspection — csdtv-team-hub (June 2026)

Whole-codebase pass for bugs, mismatches, performance, and dead code (Next.js 16 / React 19 / Supabase / Vercel). Complements the earlier security baseline in `docs/security-review-2026-06-24.md`. Findings are grouped by severity with `file:line` and a recommended fix. Verified spot-checks are noted.

---

## Critical

### C1. Systemic IDOR: authenticate-but-don't-authorize on service-role `[id]` routes
~44 of 57 routes that combine `getAuthenticatedTeamUser()` with the service-role client perform **no role or ownership check** — they key a write on a URL `id` only. Since the service client bypasses RLS, any logged-in account (incl. student/intern) can modify/delete any matching row.
- **Worst:** `app/api/output-channels/[id]/regenerate-secret/route.ts:12-29` — any user can rotate any broadcast channel's `access_secret` (DoS of the live feed). *(verified)*
- Also: `app/api/media-assets/[id]/route.ts` (PATCH/DELETE any asset), `timer-templates/[id]`, `qr-presets/[id]`, `lower-third-groups/[id]`, `lower-third-people/[id]`, `playlist-templates/[id]/*` (incl. `set-default` org-wide), and the `board-meetings/[production_id]/*` control routes (reset/clear/reopen any meeting; these at least validate the id is a real meeting but not the caller).
- **Fix:** adopt the pattern the signage subsystem already uses correctly everywhere — gate with `isManagerRole()` / `requireManagerApi()` (or an ownership predicate). Best done as one shared `withManager(handler)` wrapper applied across these groups.

### C2. Brand subsystem is not reproducible from source control
`supabase/migrations/20260624120000_brand_svg_and_typography.sql` ALTERs `school_logos`, but **no migration or `db/*.sql` ever CREATEs that table, its indexes, RLS, or the `school-logos` storage bucket** — they were applied to the remote DB by tooling only. A clean rebuild from `supabase/migrations/` fails. *(verified: only references to `school_logos` are the incremental ALTER + one stray `drop policy`.)*
- Missing from source: `school_logos` table (+ `is_cover`, `flagged_for_deletion`, `notes`, indexes), the bucket + storage policies, and the `schools` rows for district/Canyons Innovation Center + the deactivations.
- **Fix:** capture the remote DDL into a real migration dated *before* `20260624120000`. (Pre-existing two-source problem: 29 timestamped migrations vs ~80 manually-run `db/*.sql` with a `_schema_doctor.sql` drift detector.)

---

## High

### H1. `tasks_update` RLS is wide open
`USING ((select get_team_id()) IS NOT NULL)` — any team member can update any task (delete is correctly scoped right above it). Mirror `tasks_delete`. *(from baseline review; still applies.)*

### H2. Read endpoints that mutate shared playlist state → multi-reader advance race
`tickMeetingPlaylist` (`lib/board-meetings/playlist-playback.ts:104`) issues `UPDATE meeting_playlists …` and is called from the public GET endpoints `public-output-state.ts:435` and `public-output-live.ts:274`. Every board output polls these, so concurrent pollers each detect "item elapsed" and write an advance with no concurrency guard (`.eq('id', pl.id)`) → can double-advance/skip items mid-meeting.
- **Fix:** make the advance a conditional update (`.eq('current_item_started_at', prev)` and check affected rows), or move ticking to a single owner/cron.

### H3. Dead, divergent motion route tree (vote-tallying drift risk)
Two motion trees exist; the **new** one (`app/api/board-meetings/[production_id]/motions/**` + `lib/board-meetings/motion-control.ts recordVotes/tableMotion/reopenMotion` + `MotionVotePanel.tsx`) is **live as HTTP endpoints but referenced by no UI** — `MotionVotePanel` is imported by nothing. *(verified)* The two trees encode different vote semantics (old defaults missing voters to YEA server-side and never auto-finalizes; new finalizes immediately and throws on missing attendance). If anyone rewires the UI to it, tallies silently change.
- **Fix:** delete the new tree + `MotionVotePanel`, or migrate to it and retire the old one — don't keep both.

### H4. Realtime channel churn on the live control surface
`ControlSurfaceClient.tsx` re-subscribes its whole channel whenever the active motion changes (effect dep is `motionIds`, a fresh array). Events on `meeting_broadcast_state`/`meeting_motions` can be missed during the resubscribe gap mid-meeting. Same class in `MotionScreenClient.tsx` (dep on an unstable callback).
- **Fix:** subscribe once per `board_meeting.id` with table-level filters; handle per-motion rows inside the handler. Stabilize deps with refs.

### H5. Polling never pauses on hidden tabs / always-on screens
- `app/control/[productionId]/program/ProgramClient.tsx:22-35` — full-bundle fetch **every 2s**, no backoff, no visibility pause, and (unlike its siblings) no server `initialBundle` so first frame is "Loading…". *(verified)*
- `app/board/hooks/useBoardChannelState.ts` — ~1.5s poll (5s fallback), no `document.hidden` pause; drives every board output screen.
- Signage clients (`ScreenClient.tsx` 5s, `slideshow` 5min, `tasks` 60s) — same: visibility handler only adds a fetch on focus, never stops while hidden.
- **Fix:** pause timers on `document.hidden`, resume with an immediate poll on focus; give `ProgramClient` an `initialBundle`.

### H6. `build-screen-feed.ts` fetches whole tables then filters in JS (per screen, every 5s)
`select('*')` on `signage_content` (status=approved) and `signage_announcements` (active) with **no date bounds pushed to the DB**, then `isInDateRange`/priority sort in JS — so the `(status,start_date,end_date)` index goes unused and expired/future rows ship over the wire. Plus two extra serial round-trips (`areaRows`, `screenRows`) outside the `Promise.all`.
- **Fix:** push `.lte('start_date', today).gte('end_date', today)` into the query; fold the area/screen fetches into the `Promise.all` (or skip when no announcements); select explicit columns.

### H7. Manager brand grid ignores the `thumb` it's served (bandwidth)
`app/api/brand/[code]/route.ts` returns a CDN-resized `thumb` per logo and the **public** pages use it with an `onThumbError` fallback — but `app/dashboard/brand/[code]/page.tsx:390` renders `l.svg || l.png || l.jpg` (full-size, up to the 20 MB cap) and has **no fallback**. *(verified)*
- **Fix:** use `l.thumb` (add it to the manager `Logo` type) with the same `onThumbError` raw fallback. Note: Supabase image transforms need the Pro plan — the fallback matters.

### H8. Unbounded selects past Supabase's 1000-row cap
- `app/api/brand/flagged/route.ts` GET lists flagged logos with no `.range()` (the DELETE handler correctly batches at 500) — a >1000 cleanup under-reports.
- `lib/load-daily-digest-context.ts` loads ALL productions/team unbounded; `lib/dashboard/load-tasks-data.ts`, `load-dashboard-sections.ts`, `app/api/media-assets/route.ts` (`select('*')`), `board-meetings/retention` — all unbounded on growing tables.
- **Fix:** paginate with `.range()` / add `.limit()` + explicit columns.

---

## Medium

### M1. Non-atomic sequential reorder loops (partial-failure corruption)
`agenda-items/reorder/route.ts:73`, `agenda-items/[item_id]/route.ts:171`, `playlist/items/reorder/route.ts:20` each do N sequential `UPDATE`s with no transaction; a mid-loop failure leaves `sort_order` half-applied. The playlist one **ignores the error** and returns `success: true` regardless. Replace with a single batched/RPC write (the codebase already uses atomic RPCs elsewhere, e.g. `equipment_checkout`).

### M2. `.single()` where 0 rows is legitimate (throws / swallows error)
`lib/production-status-requests.ts:26` (admin email setting — can be absent), `lib/effective-team-client.ts:60`, `lib/board-meetings/playlist-playback.ts:321,490`, `lib/board-meetings/lower-third-control.ts:122,138,167`, `app/api/board-meetings/[production_id]/control/live/route.ts:19`. Use `.maybeSingle()` and check `error`. The codebase already prefers `maybeSingle` ~109× vs `single` ~24×, so these read as accidental.

### M3. N+1 / sequential per-row awaits in loops
`lib/board-meetings/people-import.ts:181-240` & `:332-382` (per-person insert/update, nested link loop), `lib/onboarding/sync-template.ts` (per-template/per-row awaits), and `app/api/cron/daily-staff-digest/route.ts:140-169` (sequential `await fetch(send-notification)` per recipient — risks Vercel function timeout at scale). Batch with `Promise.all`/`allSettled` or bulk upserts.

### M4. Digest / weekly-backup timezone bugs
`lib/load-daily-digest-context.ts:30-36` mixes a Denver-correct `todayKey` with a UTC `Date.now() ± Nd` window → off-by-one near midnight and an 8-day-inclusive "next 7 days." `lib/weekly-backup/run-backup.ts:5-9` dates backups with `getUTC*` while cron fires Sat ~02:00 Denver → filename a day ahead. `run-backup.ts:149` ignores the notify result but returns `{ ok: true }`. Use the existing TZ-aware helpers consistently.

### M5. No-cancel fetches in effects → setState after unmount (widespread)
Most dashboard page-load effects do `await fetch(); setState()` with no AbortController/cancel flag (e.g. `videos/page.tsx` handlers, `ControlSurfaceClient` loaders, the big list pages). `ProgramClient`/`useAgendaItemCache` guard correctly — copy that. Also `AppLayout.tsx:127-145` toast `setTimeout` isn't cleared on unmount.

### M6. Signage email body interpolates unescaped user input
`lib/signage/email.ts:43-100` injects `submitterName/email/title/note/rejectReason` (public form input) raw into the email body; only the subject is sanitized. The `send-notification` edge function isn't in the repo, so whether it renders HTML is an unverified contract. Confirm the consumer treats `body` as text/plain, else `escapeHtml` these. (`lib/escape-html.ts` exists; unused here.)

### M7. Missing indexes on hot columns
`school_logos` has **no index** (and isn't in source control) yet is filtered by `school_code` on every brand page and `flagged_for_deletion` in the flagged route — add `(school_code, sort_order)` + partial `(flagged_for_deletion) where flagged_for_deletion`. `signage_wayfinding.area_id` is filtered every poll but only `site_id` is indexed — add `signage_wayfinding_area_idx (area_id)`. *(signage indexes live only in manually-run `db/*.sql`, so applied state is unverifiable.)*

### M8. Heavy unmemoized work in render
`equipment/page.tsx:261` sorts cables with an `equipment.find(...)` inside the comparator (O(n²)) — build a `Map`. `reports/page.tsx:125`, `videos/page.tsx:793`, `productions/page.tsx:1803` rebuild derived/filtered arrays every render — wrap in `useMemo`.

---

## Low

- **L1.** Whole dashboard is `'use client'` with `useEffect` data fetch and **zero `loading.tsx`** anywhere → blank-chrome first paint + waterfalls (`AppLayout` adds an auth round-trip on top). The `initialBundle` server pattern (`ControlSurfaceClient`, signage screen) is the model to extend to `tasks`/`productions`/`schedule`.
- **L2.** `?k=` query-string secret still accepted by `signage/tasks-data` (Bearer path exists but the in-repo client uses `?k=`) — leaks into logs/history. Header-only.
- **L3.** Index-based React keys on reorderable lists: `videos/page.tsx:1125`, `schedule/page.tsx:1126` (Outlook events) — use stable ids. (Static lists/calendar grid are fine.)
- **L4.** `slideshow/page.tsx:74` fade `setTimeout` not cleared on unmount (setState-after-unmount, stale `images.length`).
- **L5.** Duplicated `escapeHtml` in `lib/library/print-article.ts:75`, `lib/library/kb-import.ts:49`, `BoardUpdateTab.tsx:80` — import the shared `lib/escape-html.ts`.
- **L6.** SVG logos served raw (manager-uploaded). Low risk: served from the Supabase storage origin (not the app's session origin) and shown via `<img>`. Consider `Content-Disposition: attachment` / sanitization.
- **L7.** `content-display.ts:14` `sanitizeSignageHtml` only strips `<script>` (not `onerror=`, `<iframe>`, `javascript:`) but renders via `dangerouslySetInnerHTML` — manager-gated, so low, but it's a weak sanitizer.
- **L8.** Oversized components re-render whole trees on any state change: `tasks/page.tsx` (2239), `productions/page.tsx` (2019), `productions/[id]/page.tsx` (1987), `lib/board-meetings/motion-control.ts` (1251). Split into memoized subcomponents.

---

## Verified healthy (no action)
- Cron auth (`cron/*`): `CRON_SECRET`/`x-vercel-cron` + constant-time compare. Solid.
- Public **writes** are rate-limited (signage submit, task-intake, brand flag/review-category) and the brand review endpoints use `timingSafeEqualStr`.
- Signage **management** routes consistently use `requireManagerApi()`/approver checks — the model for fixing C1.
- Brand SVG path is fully wired (format CHECK allows `svg`, `heading_font/body_font/font_notes` columns exist, sign/finalize/pages handle SVG). *(verified)*
- Vote math (`vote-math.ts decideMotion`) is correct (ties fail, abstentions excluded from cast but counted to quorum, 2/3 + majority-of-membership handled).
- Next 16 async params used correctly throughout.
- `createClient()` browser singleton — realtime cleanup removes the right channel (no leak).

## Suggested order of attack
1. **C1 + H1** (security): the `withManager` wrapper across `[id]` routes + tighten `tasks_update` RLS.
2. **C2 + M7** (reproducibility): backfill `school_logos`/bucket/schools into migrations; add the missing indexes.
3. **H2 + H3 + H4** (live-meeting correctness): conditional playlist advance, delete the dead motion tree, fix channel churn.
4. **H5 + H6 + H7 + H8** (performance): visibility-paused polling, push signage date filters to the DB, use `thumb` on the manager grid, paginate unbounded selects.
5. Medium/Low as capacity allows.
