# In-meeting motion + voting workflow (rebuild)

Goal: make running a motion fast and clunk-free. One screen, every pick a tap,
nothing reloads mid-motion, votes saved in one batched call. Industry model is
Granicus VoteCast / CivicClerk: recommended action pre-loaded per agenda item,
roll-call grid, computed result.

## Agreed design (from working session)

- **One page, no loads.** The whole roster + motion live on a single panel that
  loads once when the meeting starts. Every interaction is local state saved
  quietly in the background — no per-tap round-trips, no full agenda reloads.
- **Motion text** comes from the agenda action item's `suggested_motion_text`
  (already generated from "Approval of…" titles). No typing to start.
- **Mover / seconder:** tappable member chips (NOT dropdowns), all on the page —
  tap who moves, tap who seconds.
- **Voting — default yea, mark exceptions.** Everyone Present/Remote starts as a
  Yea; the operator only taps the Nays/abstentions. A unanimous vote = zero taps.
  Tap cycles Yea → Nay → Abstain. (Decide: add Absent/Recused tap states.)
- **Attendance strip (live).** Per member: Present · Remote · Absent, adjustable
  anytime (late arrival, early leave, remote). Remote counts toward quorum. A
  quorum badge is always visible and warns when quorum is lost. Attendance
  pre-fills the vote grid: Absent members are excluded automatically (no
  re-marking each motion). Recused is per-motion, lives in the grid for that item.
- **Result** computed (carried/failed) by the majority rule — DECIDE: simple
  majority of those voting, or majority of the full board.
- **No auto-minutes, no member self-voting** (handled elsewhere / not wanted).

## Reuse — most plumbing already exists

- `app/api/board-meetings/[production_id]/motions/[motion_id]/record-vote` already
  accepts a **batch** `votes: {person_id, vote}[]` → `recordVotes()`. Use it.
- `lib/board-meetings/attendance-control.ts`: `computeQuorum`, `loadAttendance`,
  `ensureDefaultAttendance`, `isEligibleToVote`, `loadBoardMembers`.
- `lib/board-meetings/motion-control.ts`: tallies, result, on-air state.
- `lib/board-meetings/motion-types.ts`: `VoteValue`, `AttendanceStatus`, etc.

## Build phases

1. **One-page MotionControlPanel** — the new operator UI: motion text + mover/seconder
   chips + live attendance strip + quorum badge + default-yea vote grid + computed
   result + push-to-air. Batched vote save on close; optimistic local state.
   Replaces the multi-screen `/control/[productionId]/motion` flow.
2. **Consolidate duplicate motion routes** — there are two parallel trees
   (`[id]/motion/*` and `[production_id]/motions/*`); pick one, delete the other.
3. **On-air display** — lower-third + result graphic styled to match (motion text,
   moved/seconded, "Carried 6–1").

## Decisions (locked)
- **Majority rule:** simple majority of those *present* — carried when yea beats
  half the present body, so abstentions count toward the denominator (against).
- **Vote states in grid:** Yea (default) · Nay · Abstain. **Absent is auto-filled
  from the attendance strip** (not a manual tap). Recused not needed for now.
- **Dais display:** shows each board member's name + their vote — DONE
  (`VoteResultCard` in `app/board/components/BoardDaisView.tsx`, fed by
  `PublicActiveVoteResult.votes`).
- Roster pulls real board members (lower_third_people / board members).
