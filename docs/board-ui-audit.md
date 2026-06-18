# Board-meeting UI audit — clutter, clarity, accessibility

Findings from a read-only review of every board-meeting surface. Severity: HIGH = confuses operators / fails accessibility, MED = clutter/friction, LOW = polish.

## Top wins (do first — high impact, low risk)
1. **Live console: "On air" shown 3–4 times.** Top bar, center nav, left "On air now" sticky, and the right-rail card title "On air now." Keep the center "On air" + the highlighted agenda row; drop the top-bar text and rename the right-rail card to "Outputs / previews."
2. **Live console: two "Go live (gavel)" buttons** (top bar + center) — remove the top-bar duplicate.
3. **Old "Classic view" control surface** (`ControlSurfaceView`) may be dead (tasks #53/#73). If unused, delete it + the "Classic view" link — removes a whole second console.
4. **Pre-show: two progress trackers** — the launch-sequence steps and the right-rail "Pre-show checklist" restate the same 4 states. Keep one.
5. **Tiny fonts below 11px** across ConsoleView/PreshowMode/BoardMeetingTab (8–10px tags/eyebrows). Raise the floor to 11–12px.
6. **BoardMeetingTab hardcodes `#1e6cb5`** instead of `var(--brand-primary)` — replace for consistent theming.
7. **Agenda workspace: 3 guidance layers at once** (stepper + intro card + tips banner) on first visit. Suppress the tips banner while the intro card is showing.
8. **9 tabs** on the board-meetings page — group the admin ones (Channels, Templates, QR, Bell, Cleanup) under a "Settings" tab; keep Meetings/People/Media primary.

## Live console (ConsoleView) — densest
- Redundant "On air" (see #1) and duplicate go-live (see #2).
- "Back to pre-roll" (top bar) and "Recess" (modes card) drive the same state under two names — pick one.
- Right rail is 6 stacked cards; "Modes & timers" packs recess + tech-difficulty + overlay + branding + vote-result + timer. Split vote-result controls next to the motion; collapse rarely-used cards (Stream, QR) by default.
- Three different "time origin" concepts (meeting elapsed, stream/video 0:00, pre-show "stream started") — unify and label clearly.
- Low-contrast `dim` (#64748b) used for instructions/hints; reserve it for non-essential text, never for guidance.
- Jargon ("Lower third", "Pop to Monitor 2", "delivering to N outputs", "listen", "Agenda branding") — add plain-language tooltips.

## Pre-show (PreshowMode)
- Duplicate progress trackers (see #4); duplicate takeover controls ("Switch screens → stream" gold button vs the preroll/live/off segmented control).
- 8px/9px chips — raise to 10–11px min.

## Dais / Overlay / Stream (broadcast outputs)
- Mostly fine (TV displays). Overlay vote roster at 11–13px is small for the legally-important content — enlarge; don't stack opacity 0.5 on already-muted absent names.
- A few `textDim`/`#7f97bd` labels are low-contrast on the navy panels — use the brighter `soft` for anything meant to be read.

## Tabs page / Meetings list / People / Agenda workspace
- Tab overload (see #8); inconsistent tab casing; subtitle still mentions "voting records" (removed).
- Meeting card schedule line can show district + "(broadcast)" + "· Broadcast …" at once — show district prominently, broadcast only when it differs.
- Agenda workspace: 3 guidance layers (see #7); 4 similarly-named destructive actions ("Clear & re-import" / "Clear agenda" / "Delete meeting data" / "Reset") — tighten labels.
- People tab is clean; minor low-contrast category chip.

## Accessibility quick rules to apply everywhere
- No operator-read text below ~11–12px.
- Don't use the dimmest gray for instructions or for vote/result names.
- Don't combine low opacity with already-muted color.
- Use brand/semantic tokens, not hardcoded hex.
