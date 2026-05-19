# Control Surface & Motion Screen — Install Guide

## What this drops in

This zip contains 24 files that implement the redesigned control surface and the new motion screen as separate route, with the three-state Motion & Vote card on the control surface and the substitute motion flow on the motion screen.

## What it replaces

- `app/control/control-surface.css` — full replacement
- `app/dashboard/board-meetings/[id]/control/ControlSurfaceView.tsx` — full replacement
- `app/dashboard/board-meetings/[id]/control/components/MotionAndVoteCard.tsx` — new file (Cursor may have created an old version; overwrite)

## What it adds new

- `app/control/[productionId]/motion/` — entire new motion screen route tree (16 files)
- `app/api/board-meetings/[id]/motion/` — 15 new API routes
- `lib/board-meetings/motion-types.ts` — TypeScript types
- `lib/board-meetings/motion-api.ts` — server-side motion logic
- `db/motion-screen-migration.sql` — schema migration

## Install steps

### 1. Extract into your repo root

```bash
cd /workspaces/csdtv-team-hub   # or wherever your repo lives
unzip -o ~/csdtv-handoff.zip
```

`-o` overwrites without prompting. Any files Cursor wrote earlier with the same names are replaced.

### 2. Run the SQL migration

Open Supabase Dashboard → SQL Editor → New Query → paste contents of `db/motion-screen-migration.sql` → Run.

### 3. Make sure env vars are set

In your `.env.local` (and on Vercel) you need:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (e.g. `https://www.csdtvstaff.org` in prod, or your codespace URL in dev)

### 4. Build locally first

```bash
npm run build
```

Fix any TypeScript errors that surface. Most likely issues:
- The `ControlBundle` type referenced inside `ControlSurfaceView.tsx` is exported from that file. If your existing `ControlSurfaceClient.tsx` imports it from a different location, update the import to `from './ControlSurfaceView'`.
- The `lower_third_people` table needs columns: `display_name`, `district`, `officer_position`, `category`. If your column names differ, update the queries in `lib/board-meetings/motion-api.ts`.

### 5. Verify the CSS scope didn't leak

```bash
grep -r "control-surface.css" app/
```

Should return EXACTLY ONE line:
```
app/control/layout.tsx:import './control-surface.css'
```

If you see more, find and remove the extra imports. The CSS must load only from `app/control/layout.tsx`.

### 6. Commit and push

```bash
git add .
git commit -m "Control surface and motion screen redesign"
git push
```

### 7. Test locally before relying on it for a meeting

```bash
npm run dev
```

Visit `/control/[your-production-id]` and walk through the checklist below.

## Test checklist

### Control surface
- [ ] Agenda items show "3.A Welcome" with a space, not "3.AWelcome"
- [ ] LIVE pill pulses red when meeting is live
- [ ] Quorum pill shows present/needed count
- [ ] Lower third grid shows only 7 board members (Amber, Holly, Amanda, Katie, Karen, Andrew, Jackson) — NOT Leon Wilcox or McKay Robinson
- [ ] Leon and McKay appear under "Staff & other" expandable section
- [ ] On-air title is large (24px) with item number eyebrow
- [ ] Clear lower third button is properly sized, not floating text
- [ ] Utilities row appears at the bottom with 4 panels
- [ ] Tapping a utility panel expands/collapses it
- [ ] End meeting button is isolated at the bottom of the on-air column
- [ ] Motion & Vote card shows State A (idle) when no motion

### Motion screen — drafting
- [ ] Click "Open motion screen →" routes to `/control/[id]/motion`
- [ ] Lands on drafting state with auto-suggested motion text
- [ ] Tap a member → assigns as mover, card highlights, MOVER label shows
- [ ] Hint changes to "SELECT SECONDER"
- [ ] Tap another member → assigns as seconder
- [ ] Both pills filled → "Open for discussion" button enables (turns blue)
- [ ] Minimize button returns to control surface; State B card shows
- [ ] Tap "Continue motion →" returns to motion screen

### Motion screen — voting
- [ ] After "Open vote", grid shows all present members defaulting to YEA
- [ ] Tap a card cycles YEA → NAY → ABSTAIN → YEA
- [ ] Tally updates in real time
- [ ] Projected card shows "Motion will pass/fail · simple majority · N needed"
- [ ] "Push result to overlay" closes motion screen
- [ ] Control surface State C card appears with countdown and Hold/Dismiss

### Result on overlay
- [ ] Countdown decrements every second
- [ ] Progress bar shrinks visually
- [ ] At 0s, card returns to State A
- [ ] Hold freezes countdown
- [ ] Dismiss clears the overlay immediately

### Substitute motion
- [ ] On "Open for discussion" state, "Propose substitute" creates a new substitute motion
- [ ] Substitute drafting → vote flow works same as main
- [ ] Voting state shows held main motion in muted card at top
- [ ] Push result with substitute passing → parent marked replaced
- [ ] Push result with substitute failing → parent returns to open_for_discussion

## Known limitations

- This assumes your `lower_third_people` table has columns: `id`, `display_name`, `district`, `officer_position`, `category`. If your schema differs, edit `lib/board-meetings/motion-api.ts`.
- This assumes your `meeting_motions` table has columns from the Phase 4 spec. If you skipped Phase 4 schema, the motion tables themselves need creating first.
- The bundle endpoint uses service-role client — no per-user RLS. Add access checks in `motion-api.ts` if you need them.
- Auto-dismiss of the result graphic at 8s is computed in the public state endpoint (read-side), not scheduled server-side. The `meeting_broadcast_state.active_vote_result_motion_id` will stay set in the DB until the next motion or manual dismiss.

## If something breaks

1. **TypeScript errors on build** — most likely the `ControlBundle` type import path. Fix the import path in `ControlSurfaceClient.tsx`.
2. **Motion screen blank / 404** — `NEXT_PUBLIC_SITE_URL` not set, so the server-side fetch in `page.tsx` fails. Set it.
3. **Realtime not updating** — verify SQL migration ran, especially the `ALTER PUBLICATION supabase_realtime ADD TABLE` lines.
4. **Votes not pre-seeded as YEA in voice vote** — check that `meeting_attendance` rows exist for the meeting. If no attendance records, the open-vote skip logic treats everyone as not-absent and seeds them all as YEA.
5. **Lower third still showing Leon/McKay** — your `lower_third_people` table has `category='board_member'` set incorrectly. Run:
   ```sql
   UPDATE lower_third_people SET category = 'staff' WHERE display_name IN ('Leon Wilcox', 'McKay Robinson');
   ```
