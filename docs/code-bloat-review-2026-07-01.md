# Code bloat review — 2026-07-01

Automated pass with knip v5.41 plus manual verification of every finding (import graph,
dynamic references, runtime string refs). Repo: 592 TS files, ~92,600 LOC.

Overall: hygiene is good — zero `console.log`s, no commented-out code blocks, clean
`.gitignore`, no tracked build artifacts. The bloat is concentrated in a few superseded
UI clusters, two unused npm packages, and unreferenced static assets.

---

## 1. Dead code — safe to delete (~2,300 LOC)

### 1a. Old motion screen UI (~1,090 LOC, 13 files)
`app/control/[productionId]/motion/page.tsx` renders `MotionScreenClient` →
`MotionScreenOnePage`. The older multi-component version is fully orphaned — nothing
imports any of these:

- `app/control/[productionId]/motion/MotionScreenView.tsx`
- `app/control/[productionId]/motion/motion-screen-types.ts`
- `app/control/[productionId]/motion/components/` — all 7 files (HeldMotionCard,
  MemberPickerGrid, MotionContextBar, MotionTextCard, MotionTopBar, TallyRow, VoteGrid)
- `app/control/[productionId]/motion/states/` — all 4 files (DraftingState,
  OpenForDiscussionState, SubstituteVotingState, VotingState)

### 1b. Old control-surface components (~1,070 LOC, 5 files)
`ControlSurfaceView` uses `control/components/QRPushPanel.tsx`; these siblings are
imported by nothing:

- `app/dashboard/board-meetings/[productionId]/control/QRPushPanel.tsx` (155 LOC —
  older duplicate of `components/QRPushPanel.tsx`)
- `.../control/components/MotionVotePanel.tsx` (655 LOC)
- `.../control/components/PlaylistLiveControls.tsx` (123 LOC)
- `.../control/components/VoteInterface.tsx` (131 LOC)
- `.../control/control-surface-types.ts` (6 LOC)

### 1c. Orphaned lib files (159 LOC)
- `lib/board-meetings/access.ts` (48 LOC)
- `lib/board-meetings/motion-route.ts` (67 LOC)
- `lib/hooks/useEffectiveTeam.ts` (44 LOC — only mention is a comment in
  `effective-team-client.ts`)

## 2. Unused dependencies

Remove from `package.json` (zero imports anywhere):

- `@tiptap/extension-image`
- `@tiptap/extension-link`

Do NOT remove `tailwindcss` — knip flags it, but it's loaded via `@import "tailwindcss"`
in `app/globals.css` (Tailwind v4 pattern). All other deps are in use.

## 3. Unreferenced static assets (~600 KB)

Nothing in source, SQL, or docs references these:

- Next.js starter leftovers: `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`,
  `window.svg`
- Logos: `public/images/Logos/cic-innovation-color.png` (384 KB!),
  `cic-innovation-navy.png`, `public/cic-logo.svg`, `public/cic-logo.png`,
  `public/images/canyons-logo.svg`, and 8 unused Canyons logo variants
  (Color Long Small/Medium/Big, Black Logo Long-01, White/Color/Black Logo Square)
- `public/csdtv-daily-sheets.pdf` (36 KB)

Judgment call: `public/connector-svgs/` (42 SVGs) is referenced only by
`docs/features/power-cables/` — a feature that isn't built yet. Keep if the feature is
planned, otherwise remove with the docs.

Keep: `public/images/equipment/` (261 files, 6 MB) — referenced dynamically as
`/images/equipment/${tag}.png`. Keep: `public/signage-sw.js` — registered at runtime by
`ScreenClient.tsx`.

## 4. Duplication

- **Date formatting**: `lib/format-date.ts` exports 7 unused helpers (`formatDateTime`,
  `formatTime`, `formatWeekday`, `formatDateLong`, `formatRelative`, `toDate`,
  `toDateInputValue`) while 6+ pages re-implement local `formatDate` helpers
  (tasks, productions, productions/[id], student, signage-submissions, BoardUpdateTab).
  Consolidate onto the lib — or delete the unused lib exports and accept the locals.
- **SQL**: 8 files in `db/` are duplicated in `supabase/migrations/`
  (board_meetings_live_started_at, board_meetings_public_agenda_url, cic_signage,
  equipment_editor_rls, equipment_kits_editor_rls, onboarding_v2,
  production_datetime_from_label, sig_assets_storage). The `db/` folder holds 80
  one-off patch scripts (428 KB) — consider archiving ones already promoted to
  migrations to avoid two sources of truth.

## 5. Unused exports (low priority)

knip found ~160 unused exported functions/consts and ~120 unused exported types.
Types are free at runtime; unused function exports mostly cost readability. Biggest
clusters, trim when next touching each file:

- `lib/school-year.ts` — 9 of its exports unused (file is used, but only
  `matchesSchoolYearFilter` / `PLANNING_SCHOOL_YEARS` etc.)
- `lib/board-meetings/motion-control.ts`, `output-polling.ts`, `people-import.ts`,
  `qr-control.ts`, `icompass-agenda.ts` — several unused each
- Full list: run `npx knip@5.41.1` (latest knip OOMs in constrained environments)

## 6. Oversized files (maintainability, not bundle size)

Split opportunistically when next edited — no urgency:

| File | LOC |
|---|---|
| `app/dashboard/tasks/page.tsx` | 2,239 |
| `app/dashboard/productions/page.tsx` | 2,019 |
| `app/dashboard/productions/[id]/page.tsx` | 1,987 |
| `app/dashboard/settings/page.tsx` | 1,856 |
| `app/layout/page.tsx` | 1,276 |
| `app/dashboard/schedule/page.tsx` | 1,260 |

## 7. knip false positives — do NOT delete

- `supabase/functions/**` — Deno edge functions, deployed separately
- `scripts/*.mts` — operational scripts run manually
- `public/signage-sw.js` — service worker, runtime-registered
- `tailwindcss` devDependency — used via CSS import

## Suggested order of operations

1. Delete the 21 dead files in §1 (one commit; `npm run build` after to confirm).
2. `npm uninstall @tiptap/extension-image @tiptap/extension-link`.
3. Delete the unreferenced assets in §3.
4. Decide on `connector-svgs/` + power-cables docs.
5. Consolidate date formatting; archive superseded `db/` scripts.

Estimated removal: ~2,300 LOC of dead TS, 2 deps, ~600 KB of assets.
