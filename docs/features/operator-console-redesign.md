# Board operator console — redesign spec

Status: design locked (June 2026). Mockup: `docs/mockups/operator-console.html`.

## Problem this solves

The live broadcast experience is split across two disconnected pages — the control
surface (`/control/[id]`) and the motion screen (`/control/[id]/motion`) — each with
its own React tree and state bundle. They drift out of sync and feel like two apps.
Lower thirds feel unreliable. The interface is dense and hard to read. YouTube
chapters break because they are timed from the gavel, not the actual video.

Target user: one operator, mouse-driven, two monitors.

## Locked design decisions

### One unified console
Single screen runs the whole meeting. No separate motion page — motion folds into the
console inline, sharing the same live-state bundle and realtime. The old `/motion`
route survives only as an optional pop-out, driven by the same shared state.

### Layout (Monitor 1)
- Top bar: meeting title, ON AIR + elapsed clock, "on air: <item>", attendance/quorum
  pill (opens roll-call drawer), end meeting.
- Left column (~250px): agenda. Grouped by section, current item highlighted, past
  items dimmed. Back / Take next.
- Center column (the workspace): slim transport bar, then a large lower-third panel,
  then the motion panel (folds in when an action item is on air).
- Right rail (~340px): compact confidence monitor + "delivered to output ✓", output
  channels, modes (recess / technical difficulties / closed session / agenda branding),
  timers, go-to-break / go-live.

### Confidence monitor
Small card in the right rail (not a big center preview). Renders exactly what the
on-air overlay shows, plus a delivery-confirmed indicator. Pop-out to Monitor 2 is
optional.

### Lower thirds
Name chips (no photos). Search box. Two groups: board members, frequent staff.
Position L/C/R + style. Live ON-AIR indicator with Clear. A "recent" strip for quick
re-takes. All reads/writes go through the single shared broadcast state. Fix the
delivery path so what the operator sets reliably reaches the output (see Build step 1).

### Attendance / roll call
Opened from the attendance/quorum pill in the top bar; adjustable any time during the
meeting. Per-member Present / Remote / Absent with auto-stamped arrived/left times.
"Mark all present" for gavel-in. Footer shows live quorum (need ceil(n/2)). This single
source feeds: the quorum badge, the vote grid (absent greyed + unvotable, remote tagged,
present default to yea), and the simple-majority math. Also surfaced inline in the vote
grid for quick "stepped out" toggles without opening the drawer.

### Motion (inline) + amendments
Main motion: editable text, mover chips, seconder chips, open vote, default-yea grid
(tap to nay/abstain), result (simple majority of present), push result to screen.
Add Robert's Rules secondary motions: amend, substitute, table/postpone, refer. An
amendment stacks on the main motion (vote the amendment, then the main motion as
amended). Consent agenda remains one bundled motion.

### Agenda editing
- Prep tab (before lock): full edit — already supports per-item edit, remove, reorder
  (upgrade arrows → drag-and-drop), motion wording, broadcastable, diff on re-import.
- Live console: a small "Edit agenda" affordance for what happens in real meetings —
  drag-to-reorder, add/insert a walk-on item, and mark items skipped / tabled /
  postponed (reflected in the agenda and the aired timeline).

### YouTube chapters (post-meeting wrap, not the live console)
Root cause of breakage: chapters were timed from the gavel (`live_started_at`), but the
video's 0:00 is the stream start during preroll, so every chapter was early by the
preroll length; fragile merge logic could also silently fall under YouTube's rules.

New approach:
- Add a one-tap "Stream started" action in the hub that timestamps stream start =
  video t=0 (new column, e.g. `board_meetings.stream_started_at`).
- Taking an item on air logs one unambiguous "on air" event — single source of truth
  for the timeline; correctly follows amendments and skips (only what aired, in order).
- Chapters: `0:00 Pre-meeting` (preroll) → `Call to Order` at the gavel offset →
  subsequent items at their true offsets from stream start.
- A ± nudge control at wrap to fine-align to the exact video frame, with live preview.
- Validate against YouTube rules (≥3 chapters, first at 0:00, ≥10s apart) with a clear
  message instead of an empty result. Editable preview + copy. (Manual paste into the
  YouTube description; auto-post is a possible later add.)

## Build plan (vertical slices, each testable on the seed meeting)

1. Diagnose + fix the lower-third delivery path end-to-end (channel assignment →
   output state → overlay render) using the test meeting. Surface set/clear failures.
2. Build the unified console shell: top bar + three columns + right rail on one shared
   live-state bundle (reuse `/control/live`).
3. Fold motion inline: convert the `/motion` page into the center motion panel driven
   by shared state; keep `/motion` as the optional pop-out.
4. Add motion amendments (amend / substitute / table / refer) to the motion model.
5. Confidence monitor + delivery confirmation in the right rail.
6. Attendance drawer from the top bar (present/remote/absent, arrived/left, quorum).
7. Agenda live edits: drag-to-reorder, add walk-on item, skip/table/postpone marking.
   Upgrade prep-tab reorder to drag-and-drop.
8. YouTube chapters rebuild: `stream_started_at` anchor + "Stream started" button,
   clean on-air timeline, ± nudge, YouTube-rule validation, editable preview.
9. Monitor 2 program/multiview pop-out.
10. Migrate remaining panels (timers, modes, output channels, go-live/preroll), validate
    (tsc + eslint), retire the old control surface and dead `[id]/control` code.

## Test setup
Seed/reset a sandbox meeting anytime with `db/test_board_meeting_seed.sql`
(title "ZZ TEST — Board Meeting"). Voting members come from real `lower_third_people`.
