# Build brief: CSDTV local-first board-meeting graphics app

**Audience:** a developer/agent starting a brand-new project (separate from the main hub).
**Goal in one sentence:** build a standalone desktop app (macOS + Windows) that runs the live board-meeting graphics locally — control panel + overlay outputs talking over a local WebSocket — so on-screen graphics update instantly, the way H2R Graphics does, instead of round-tripping through the cloud.

You will be given the **H2R Graphics app source** separately to deconstruct. This brief explains (a) the problem, (b) the existing system you're replacing the *live* portion of, (c) the recommended architecture, and (d) exactly which existing code to reuse so the new app renders identically to today's web outputs.

---

## 1. Background: what exists today

CSDTV (Canyons School District TV) runs live broadcasts of school-board meetings. There's already a web app — the **CSDTV Team Hub** — built with Next.js 16 / React 19 / TypeScript / Tailwind v4, backed by **Supabase** (Postgres + Realtime), hosted on **Vercel**.

Inside the hub, a board meeting has:

- A **control surface** (a.k.a. "console") the operator runs the meeting from in a browser.
- Several **audience-facing output views**, each rendered as its own web page:
  - **Dais display** — the large screen the board members and room see (current agenda item, suggested motion, live voting roster, vote result, timer, recess/technical-difficulty cards).
  - **Overlay** — transparent graphics keyed over the camera/program feed in OBS (lower thirds, motion/vote graphics, timer).
  - **Confidence monitor** — what the operator/presenters watch to see what's currently on air.
  - **District signage takeover** — pushes the meeting (preroll, then the live stream) to district digital-signage screens. This is genuinely a cloud/signage concern and can stay in the hub.

### How data flows now (the problem)

```
Operator clicks → Vercel serverless route → writes Supabase
       → Supabase Realtime broadcast (and/or output pages poll an API)
       → output browser re-renders
```

Every graphic change makes a cloud round trip: **control → serverless function → Postgres → realtime fan-out → output page**. In practice that's a few hundred milliseconds to over a second, plus occasional serverless cold starts and network jitter. For live television that feels laggy — lower thirds, vote results, and especially **timers** need to feel instant. (Reference product the operator likes for timers: **stagetimer.io**, which feels frame-instant.)

The hub works well for *preparation* (importing/locking the agenda, people, public website, records) and for the *district-signage* takeover. The part that hurts is the **live graphics loop**. That's what the local app fixes.

---

## 2. What the local app is (and isn't)

**Is:** a desktop app that, during a live meeting, is the single source of truth for graphics. The control panel and all output renderers run on the operator's machine and communicate over a **local HTTP + WebSocket server**, so a button press updates every output in the same tick. OBS pulls the overlay and other graphics as **Browser Sources** from `http://localhost:PORT/...`. This is the H2R Graphics model.

**Isn't:** a replacement for the whole hub. The hub still owns agenda prep, the public "Board Watch" website, the people directory, and the signage takeover. The local app **imports** prepared data from the hub before the meeting and **pushes** a little state back during/after (see §6).

---

## 3. Recommended architecture

```
┌─────────────────────────── Desktop app (Electron) ───────────────────────────┐
│                                                                               │
│  Main process (Node)                                                          │
│   • In-memory state store  ← single source of truth for the live graphics     │
│   • Local HTTP server (Fastify/Express): serves the output pages (static)     │
│   • Local WebSocket hub (ws or socket.io): broadcasts state to all clients    │
│   • Persistence: write state to a local file (JSON or SQLite) on every change │
│     for crash recovery                                                        │
│   • Cloud bridge: pulls from / pushes to the CSDTV Hub API (see §6)           │
│                                                                               │
│  Renderer window (Chromium + React)                                          │
│   • The CONTROL PANEL UI (operator). Sends commands over IPC/WS.              │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
        │  http://localhost:PORT/output/*   +   ws://localhost:PORT
        ▼
   OBS Browser Sources / a browser on the dais PC
   • /output/overlay     (transparent — OBS keys it over the program)
   • /output/dais        (full-screen graphics for the room display)
   • /output/timer       (optional standalone timer source)
   • /output/confidence  (operator/presenter confidence monitor)
```

**Shell — recommend Electron.** It's Chromium + Node, trivially hosts a local server, and OBS Browser Sources are just Chromium too, so what you see in dev is what OBS shows. Most importantly, **H2R Graphics is Electron**, so the code you're given maps almost directly. (Tauri is lighter but uses the OS webview, which complicates OBS parity and local-server patterns — only consider it if bundle size becomes a real constraint.)

**State model — one authoritative store in the main process.** Outputs are pure render targets: they receive state and draw it; they never compute. The control panel sends *commands* ("show lower third X", "start 3:00 timer", "show vote result"); the main process applies them to the store and broadcasts the new state to every WebSocket client. This keeps all outputs perfectly in sync and makes the control panel and outputs trivially consistent.

**Timers must count locally.** Don't stream ticks. Push a single **target end timestamp** (and start time + duration); each output counts down locally with `requestAnimationFrame`. That's the stagetimer trick and why it feels instant — network latency becomes irrelevant to the displayed countdown. Same idea for the meeting "elapsed" clock (push a start timestamp; count up locally).

**Overlay transparency.** The overlay page must have a transparent body so OBS composites it over the camera. Build every graphic as a "show/hide/update" with enter/exit animations.

**Timer end sound.** Keep chimes as plain static audio files in a `/chimes` (or `/sounds`) folder — that's exactly how stagetimer does it (e.g. it serves `…/spa-assets/chimes/bell-1x.mp3`). Preload the selected file on boot (`new Audio(url)` held in memory, or decode into a Web Audio buffer) so there's no delay. Browsers block audio until the first user gesture, so unlock it on the operator's first click (or an explicit "enable sound" step on the output page) — otherwise `.play()` silently no-ops. When the local countdown hits 0, **play the file three times** (replay on the `ended` event, three total) for an unmistakable "time's up" cue. Use the station's own recorded sound or a CC0/royalty-free file — don't host another product's asset.

---

## 4. The graphics the app must produce ("scenes")

Model each as a graphic with `visible`, plus its own payload — mirror H2R's graphic/layer concept:

1. **Lower third** — name + title/role; enter/exit animation. Source list comes from the hub's people directory + anyone named in the meeting's agenda (see §6). Clicking a selected person again should clear it (toggle).
2. **Timer** — label, duration, target-end timestamp; full-screen on the dais, optionally a smaller overlay version. Needs a **countdown progress bar**: green → **yellow at 30s** → **red at 15s** → **flashes when it hits 0 until dismissed**. When a timer is running it should be able to **take over the entire dais screen**.
3. **Motion card** — the current motion text and its lifecycle state: suggested → on-the-floor (moved/seconded) → voting → result. (Robert's Rules; simple majority.)
4. **Live vote roster** — during voting, each board member shown as pending; votes hidden until the result is pushed.
5. **Vote result** — Aye/Nay/Abstain/Absent per member (absent greyed), pass/fail. *Note: the hub is moving to keep voting **live-only** — show it on screen but don't persist vote records. The local app likewise should not need to store vote history.*
6. **Recess / technical difficulties** — full-screen cards. On the **overlay** these must cover the entire screen so the cameras aren't visible when selected.
7. **Agenda sidebar** — current/next item, styled like the public "Board Watch" agenda, for the dais and (via the hub) the district screens.
8. **Confidence view** — composite of what's currently on air, for the operator/presenters.

Labels/verbiage note: voting shows **"Aye"** on screen even though the stored value is `yea`.

---

## 5. Reuse these from the existing hub repo (so outputs render identically)

The hub already contains battle-tested renderers and logic. Port or share these — don't reinvent them, and reusing them avoids "the preview looks different from the live output" parity bugs.

Repo: `csdtv-team-hub`

- **Dais renderer:** `app/board/components/BoardDaisView.tsx` — includes an `AutoFitText` component that binary-search-fits long motion text. Long motions (≈150 words) must fit across the whole voting lifecycle; keep this.
- **Overlay renderer:** `app/board/components/BoardOverlayView.tsx` — lower thirds + vote/result graphics (Aye/Nay/Abstain/Absent, absent greyed).
- **Vote math (shared engine):** `lib/board-meetings/vote-math.ts` → `decideMotion(tally, opts)`. Simple-majority logic, quorum, abstentions excluded from votes cast. Use this verbatim.
- **Output state shape + builders:** `lib/board-meetings/public-output-state.ts` and `public-output-live.ts` — show the exact JSON shape the current outputs consume. Model your local WebSocket state payload on these so the renderers drop in unchanged.
- **Types:** `lib/board-meetings/types.ts`.
- **The listener hook (consumer side):** `app/board/hooks/useBoardChannelState.ts` — shows how outputs currently subscribe (realtime + polling) and the state they expect. In the local app this becomes a thin WebSocket subscriber.
- **The command catalog:** the control routes under `app/api/board-meetings/[production_id]/control/*` and `lib/board-meetings/broadcast-control.ts` — this is effectively the full list of operator actions (go live, set current item, open/second/vote motion, show/clear lower third, start/stop timer, recess, end meeting, etc.). Use it to define the local app's command set.
- **Bell sound:** `lib/play-bell.ts` (Web Audio). The operator wants to **change the bell sound** — treat the sound as swappable/configurable.

A clean way to do this: extract the renderers + vote-math + types into a small shared package both projects import. If that's too much coordination at the start, copy them and keep the prop shapes identical.

---

## 6. Cloud bridge — what to pull and push

Keep the hub as the system of record for prep, the public website, and signage. The local app is the live driver.

**Pull before/at meeting start (read from the hub):**
- The **locked agenda** for the meeting (items, sections, item numbers, broadcastable flags, consent grouping, suggested motion text for action items).
- **People** for lower thirds: a curated "frequent staff" set + anyone named in this meeting's agenda.
- Meeting metadata (title, date, board channel, livestream URL).

**Push during/after the meeting (write back to the hub):**
- **Current agenda item + live status** — the hub's public "Board Watch" site and the district-signage agenda sidebar need to know what's live. The local app should be the source of truth for "current item" while live and push it up.
- **Chapter timing anchor** for YouTube — the hub is moving to a post-meeting model where you enter the livestream clock time of "Welcome" and it offsets every item; the local app should record per-item start offsets so that export works.
- Optionally drive the **district-signage takeover** by calling the hub's existing takeover API (`POST /api/signage/board-takeover` with `preroll` / `live` / `off`). The hub recently added a heartbeat fail-safe so the takeover auto-clears if it stops being "kept alive" — if the local app drives it, it should send the `keepalive` action periodically while live.

**Auth:** issue the local app a service token / API key for the hub endpoints. Don't ship Supabase service keys in the desktop bundle; go through hub API routes.

**Offline resilience:** because graphics run locally, a flaky internet connection should never affect the live show. Pull what you need up front, cache it, and queue pushes to retry. The meeting must run fully even with the network down.

---

## 7. OBS / display integration

- **Overlay** → OBS **Browser Source**, transparent, sized to the program canvas (e.g. 1920×1080), URL `http://localhost:PORT/output/overlay`.
- **Dais** → either an OBS source or, more likely, a browser (kiosk/full-screen) on the dais PC pointed at the operator machine's LAN address `http://<operator-LAN-IP>:PORT/output/dais`. Document the port and the Windows/macOS firewall rule needed for LAN access.
- **Timer / confidence** → additional browser sources as needed.
- Provide a small in-app "Outputs" panel that lists the exact URLs with copy buttons (this is an intern-friendliness requirement throughout the CSDTV tooling).

---

## 8. Suggested milestones

1. **Prove the loop.** Electron app + local HTTP/WS server + one transparent overlay page that shows a hardcoded lower third pushed from the control window. Confirm it updates instantly and keys correctly in OBS.
2. **State + commands.** Port the output state shape (§5) and define the command set (§5 control catalog). Implement lower thirds (with toggle-to-clear), the timer (local countdown + progress bar colors + flash + full-screen dais takeover), and the elapsed clock.
3. **Meeting graphics.** Motion card lifecycle, live vote roster, vote result (live-only, no storage), recess/technical-difficulties full-screen, dais auto-fit motion text, agenda sidebar.
4. **Cloud bridge.** Import locked agenda + people from the hub; push current item + status; record chapter offsets.
5. **Robustness + polish.** Local persistence/crash recovery, multi-output sync, keyboard shortcuts (next agenda item, clear lower third), configurable bell, the Outputs URL panel.
6. **Packaging.** Code-signed builds for macOS and Windows; auto-update if feasible.

Design principle throughout (carried from the hub): **it must be usable by an intern who doesn't know the workflow** — one obvious next action per screen, layout that follows the run-of-show, hard to make irreversible mistakes, always-visible state, plain language.

---

## 9. Open decisions to confirm with CSDTV

- **Electron vs Tauri** (recommended: Electron, for OBS parity + direct mapping to the H2R code).
- **Does the local app fully replace the in-browser control surface for live meetings, or coexist with it?** Recommended: the local app becomes the live driver; the hub keeps prep, public site, and records.
- **Dais delivery:** same machine vs a second PC over LAN (affects networking/firewall setup).
- **Source of truth for "current agenda item" while live:** recommended the local app, pushed up to the hub.
- **How much of the signage takeover the local app should drive** vs leaving it entirely in the hub.

---

## 10. TL;DR for the builder

Build an Electron app that hosts a local HTTP + WebSocket server. The control panel (React, in the Electron window) sends commands; the main process holds the authoritative graphics state and broadcasts it over WebSocket to transparent/full-screen output pages that OBS and the dais display load as browser sources. Reuse the hub's existing dais/overlay React renderers, the `decideMotion` vote engine, and the output state shape so graphics look identical to today — but driven locally for instant updates. Timers count down locally from a pushed target timestamp (stagetimer-style). Pull the locked agenda + people from the CSDTV Hub before the meeting; push current item/status (and chapter offsets) back during/after. Everything must keep working if the internet drops.
