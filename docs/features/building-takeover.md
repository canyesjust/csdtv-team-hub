# Building takeover

Lets a manager schedule content that exclusively replaces the normal signage
rotation on every screen in a building, for a set time window, then reverts
automatically. Distinct from the [board meeting takeover](./board-signage-takeover.md),
which is manually started/stopped and tied to a specific YouTube livestream —
a building takeover is schedule-driven, has no manual start/stop, and can be
any regular content (image, video, HTML, or AI-generated).

## Model

Building takeover is not a new subsystem — it's the existing `signage_content`
table (same creation flows, same approval queue, same `target_buildings`
targeting) with three new columns:

- `is_takeover boolean` — marks a row as a takeover rather than normal rotation content.
- `takeover_starts_at` / `takeover_ends_at timestamptz` — the precise (minute-level)
  window. `start_date`/`end_date` (already required on every content row) are
  derived server-side from these on write, so the existing day-level date
  filtering still gates takeover rows correctly; the timestamps add precision
  on top.

A takeover row must target buildings only — `all_screens`, `target_area_ids`,
and `target_screen_ids` are all rejected when `is_takeover` is true, both on
create (`app/api/signage/content/route.ts`, `.../finalize/route.ts`) and on
approval (`app/api/signage/content/[id]/route.ts`). It always goes to the
approval queue (`status: 'pending'`), regardless of which creation path sent
it — a takeover overrides every screen in a building, so it never skips
review the way a manager's direct upload normally does.

## Screen feed resolution

`lib/signage/build-screen-feed.ts` resolves `live` and `board_takeover` first
(both already existed), then checks `filteredContent` — which is already
scoped to this screen's building via `signageTargetMatches` — for an approved
`is_takeover` row whose window contains `now`. If found (and neither `live`
nor `board_takeover` is active), that single row becomes the *entire*
`media` array, forced `full_screen: true`.

This is deliberately not a new overlay/poller mechanism like board takeover.
Making it the sole `media` item means:

- The live `ScreenClient.tsx` renders it exclusively for free — a
  `full_screen` media item already suspends zones, the ticker, and everything
  else (pre-existing behavior, see `takeoverContent` in `ScreenClient.tsx`).
- The offline/baked AbleSign path (`build-screen-html.ts`) needs **no
  changes** — it bakes straight from `buildScreenFeed`'s `media` array, so a
  takeover row bakes as the screen's only slide automatically.

`ScreenFeed.building_takeover` carries just `{ id, title, ends_at }` as
metadata for anything that wants to know a takeover is active without
inspecting `media` — renderers don't need to branch on it themselves.

## Reaching offline (AbleSign) screens on time

Live browser screens re-poll their feed every 30s (`REFRESH_MS` in
`ScreenClient.tsx`), so a takeover's start/end reaches them within that
window automatically. Baked AbleSign sticks only re-bake when their
`ablesign_html_dirty_at` flag is set, which nothing sets at the exact moment a
schedule-driven takeover's window opens or closes (unlike board takeover,
which pushes on the operator's explicit start/stop click).

`app/api/signage/push-all/route.ts`'s `mode=dirty` handler (run every ~2 min
by `db/ablesign_html_push_cron.sql`'s dirty companion) now marks any screen in
a building with a takeover edge (start or end) in the last 4 minutes as
dirty before doing its normal dirty-screen push, so the very next cron pass
picks it up — worst case ~2–4 minutes of lag on physical AbleSign screens.
Live browser screens see it within 30 seconds. Note the existing quiet-hours
window (10pm–5am Mountain Time) still pauses all automatic AbleSign pushes,
same as it always has for regular content changes — a takeover scheduled to
start overnight won't reach a baked screen until 5am.

## UI

Both creation paths — the dashboard's direct-upload form
(`app/dashboard/signage/content/page.tsx`) and Create with AI
(`.../components/CreateWithAI.tsx`) — get a "Building takeover" toggle. When
on, `SignageTargetingPicker` (`SignageAdmin.tsx`) switches into
`buildingsOnly` mode (hides "All screens", Areas, and "Specific screens",
leaving just the Buildings chips), and the normal start/end date fields are
replaced with `<input type="datetime-local">` start/end fields. The approval
queue shows a red "⚠ Building takeover" badge on both the tile and the
detail panel so a reviewer can't mistake one for ordinary content.
