# Board Meeting Control Surface — Product & Design Brief

Use this document when redesigning the live operations UI at `/control/[productionId]`. It describes what exists today, who uses it, and layout conventions the engineering team is moving toward.

---

## Purpose

The **control surface** is the real-time broadcast operations console for CSDtv board meetings. A producer or board AV operator uses it during **prepared** and **live** meetings to:

- Drive the public agenda (what item is “on air”)
- Push graphics to OBS browser sources (overlay, dais, live second screen, pre-roll)
- Run motions and votes
- Show lower thirds, QR codes, timers, recess/tech-difficulty modes
- Assign output channels to the meeting

It intentionally runs **outside** the main Team Hub dashboard shell (no sidebar/top nav) at:

- **URL:** `/control/{productionId}` where `productionId` is the production UUID
- **Legacy redirect:** `/dashboard/board-meetings/{productionId}/control` → `/control/...`

---

## Users & context

| Aspect | Detail |
|--------|--------|
| Primary users | Internal CSDtv staff running board meeting broadcasts |
| Typical device | iPad or laptop in landscape; touch-friendly targets (min ~44px height) |
| Environment | Live event; mistakes are visible on stream |
| Prerequisite | Agenda must be **locked** before most controls work (`canControl`) |
| Meeting states | `draft` → `prepared` → `live` → `archived` |

When `canControl` is false, show banner: *“Lock the agenda before using broadcast controls.”*

---

## Page layout (target structure)

The page should fill **100dvh** with no wasted margins. Recommended zones:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ HEADER: breadcrumbs · meeting title · status/mode · attendance · links │
├─────────────┬────────────────────────────┬─────────────────────────────┤
│ AGENDA      │ ON AIR (primary)           │ UTILITIES                   │
│ (scroll)    │ · current item             │ · Pre-roll playlist         │
│             │ · transport (back/advance) │ · Modes & timers            │
│             │ · go live / end meeting    │ · Output channels           │
│             │ · lower third              │ · Recent events             │
│             │ · QR push                  │                             │
├─────────────┴────────────────────────────┴─────────────────────────────┤
│ MOTIONS & VOTING (full width, scroll)                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

**CSS implementation:** `app/control/control-surface.css` + `ControlSurfaceView.tsx`

Breakpoints:

- **Desktop / landscape iPad (>1100px):** 3 columns + full-width motions row
- **Medium (~720–1100px):** 2×2 grid + motions
- **Narrow portrait:** single column stack

---

## Sections (functional spec)

### 1. Header

| Element | Behavior |
|---------|----------|
| ← Board Meetings | Link to `/dashboard/board-meetings` |
| ← Board Meeting tab | Link to production detail `?tab=boardmeeting` |
| Companion buttons → | Link to `/dashboard/board-meetings/{id}/buttons` (simplified iPad button UI) |
| Title | “Control surface · {production title}” |
| Status line | `broadcast_status` + active `mode` if not `normal` |
| Attendance | `AttendancePanel` — quorum / roll call (see component) |

### 2. Agenda (left column)

- Lists **broadcastable** agenda items only
- Tap item → `POST .../control/jump-to` with `agenda_item_id`
- Current item highlighted (matches `broadcast_state.current_agenda_item_id`)
- Scrollable list; should use full column height

### 3. On air (center column — highest priority)

| Subsection | API / behavior |
|------------|----------------|
| **Current item** | Read-only display of item number + title |
| **Transport** | `go-back`, `advance`, `toggle-overlay` (label: **Agenda overlay** on/off — only hides agenda card on overlay, not lower thirds) |
| **Meeting lifecycle** | `go-live` when not live; `end-meeting` when live |
| **Lower third** | See § Lower third |
| **QR code** | `QRPushPanel` — push URL to overlay; live only |

### 4. Utilities (right column)

Collapsible panels (default collapsed except when active):

| Panel | Purpose |
|-------|---------|
| **Pre-roll playlist** | `PlaylistLiveControls` — advance playlist on pre-roll channel |
| **Modes & timers** | `recess`, `technical-difficulties`, `clear-mode`; timer templates; end/cancel timer |
| **Output channels** | Checkboxes assign meeting to channels (`POST/DELETE .../channels`) |
| **Recent events** | Last ~20 rows from `meeting_event_log` |

### 5. Motions & voting (bottom, full width)

`MotionVotePanel` — only enabled when meeting is **live**.

Tap-based flow (no dropdowns):

- Open motion on current agenda item
- Tap mover → enter text → tap seconder
- Open vote → record voice or roll-call votes
- Dismiss result

Substitute motions and consent blocks supported.

---

## Lower third

**Panel:** `LowerThirdPanel` in On air column.

**Board member quick picks (fixed order):**

1. Leon  
2. Holly  
3. Jackson  
4. Andrew  
5. Amber  
6. Amanda  
7. Katie  
8. Karen  
9. McKay  

Matched by **first name** against `lower_third_people` library. Missing names show “Not in library”.

**Everyone else:** searchable list excluding board quick-pick IDs.

**API:**

- `POST .../control/set-lower-third` `{ person_id }`
- `POST .../control/clear-lower-third`

**Public outputs:** `active_lower_third` on `/api/board/output/{channel}/state` — shown on overlay (`/board/{n}/overlay`) and live view. Lower thirds are **independent** of “Agenda overlay” toggle.

---

## Output channels

Configured in Board Meetings admin. Each channel has a `view_type`:

| view_type | Public URL | Role |
|-----------|------------|------|
| `overlay` | `/board/{n}/overlay` | OBS transparent browser source (graphics only) |
| `dais` | `/board/{n}/dais` | Board room confidence monitor |
| `live` | `/board/{n}/live` | Audience second screen |
| `preroll` | `/board/{n}/preroll` | Pre-meeting playlist |

Assignment ties meeting state to channel polling endpoints.

---

## Data loading

| Source | Endpoint |
|--------|----------|
| Control bundle | `GET /api/board-meetings/{productionId}/control` |
| Actions | `POST /api/board-meetings/{productionId}/control/{action}` |
| Realtime | Supabase `postgres_changes` on `meeting_broadcast_state`, `meeting_timers`, `meeting_motions`, `meeting_attendance`, `meeting_playlists` |

---

## Design tokens (Team Hub)

Uses global CSS variables from `app/globals.css`:

- `--bg-main`, `--bg-topbar`, `--surface-1`, `--surface-2`
- `--text-primary`, `--text-muted`, `--border-subtle`
- `--brand-primary`

Dark/light class on `<html>` from `ThemeProvider`.

---

## UX best practices (for redesign)

1. **Full viewport** — No max-width constraint; use `100dvh` shell with internal scroll regions only.
2. **One primary column** — “On air” gets the most visual weight; agenda is navigation; utilities are secondary.
3. **Touch targets** — Buttons ≥44px; adequate spacing in motion vote flows.
4. **State visibility** — Status, mode, on-air item, active lower third, and overlay state always visible without scrolling.
5. **Collapse infrequent tools** — Timers, channels, event log collapsed by default; expand when relevant.
6. **Disable vs hide** — When not `canControl` or not `live`, disable controls but keep layout stable.
7. **Busy state** — Global `busy` during POSTs; reduce double-taps.
8. **No modal-heavy flows** — Especially motions; prefer in-panel tap grids (current direction).
9. **Label clarity** — “Agenda overlay” not “Overlay” (lower thirds are separate).

---

## Key files

| File | Role |
|------|------|
| `app/control/layout.tsx` | Full-viewport shell, imports CSS |
| `app/control/control-surface.css` | Grid layout, panels, scroll areas |
| `app/control/[productionId]/page.tsx` | Route entry |
| `app/dashboard/.../control/ControlSurfaceClient.tsx` | Data fetching, realtime, actions |
| `app/dashboard/.../control/ControlSurfaceView.tsx` | Presentational layout |
| `app/dashboard/.../control/components/*` | Feature panels |
| `lib/board-meetings/broadcast-control.ts` | Server-side control logic |
| `lib/board-meetings/public-output-state.ts` | Public channel state builder |

---

## Out of scope for this page

- Agenda editing (production Board Meeting tab)
- People library CRUD (Board Meetings → People)
- Output channel configuration (Board Meetings → Output channels admin)
- Companion buttons page (separate simplified UI)

---

## Open design questions

1. Should motions panel be side-by-side with agenda on ultra-wide displays?
2. Should lower third quick picks show photos?
3. Should output channel assignment show live preview links?
4. Visual distinction between `prepared` and `live` (color system)?

---

*Last updated to match engineering layout pass — share with design tools (Claude, Figma) as source of truth for control surface scope.*
