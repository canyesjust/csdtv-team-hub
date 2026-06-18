# Bitfocus Companion module for the Board Meeting control surface

Research + recommendation. Goal: drive the board-meeting control surface (go live, recess, playlist play/pause/skip, lower thirds, motions/votes) from a Stream Deck via Bitfocus Companion.

## TL;DR recommendation

Build a **custom Companion module** (Node.js + `@companion-module/base`, TypeScript template) that talks to your existing Next.js REST API over HTTP — exactly the pattern the **H2R Graphics** module uses. Your app is already 90% of the way there: the control surface is already a clean set of POST endpoints, and there's already a public CORS-enabled state endpoint for reading status.

The **one real piece of new work** is authentication: every control endpoint currently authenticates via Supabase **session cookies** (`getAuthenticatedTeamUser()`), which a headless Companion module cannot use. You need to add a **token-based auth path** (an API key / bearer token) before any module can call these endpoints. Design that first; everything else is straightforward.

## Why this is a good fit

The H2R Graphics module is the right reference. It's a custom module whose dependencies are just `@companion-module/base`, `got` (HTTP), and `socket.io-client` (live updates). It points at a network app via base URL + port + project ID, fires `POST` requests for actions (`/run`, `/clear`, `/graphic/<id>/show`), and listens over a socket for state. Your situation maps onto that almost exactly.

Your app already exposes the surface a module needs:

**Actions (POST endpoints, already built):**

- Broadcast: `control/go-live`, `control/recess`, `control/end-meeting`, `control/reset-elapsed`
- Lower thirds / branding: `control/set-lower-third`, `control/clear-lower-third`, `control/show-agenda-branding`
- Playlist: `playlist/play`, `playlist/pause`, `playlist/back`, `playlist/skip`, `playlist/jump-to`, `playlist/hold`, `playlist/release-hold`, `playlist/end`, `playlist/replace-now`, `playlist/clear-replace`
- Motions / voting: `motions/[id]/open-vote`, `record-vote`, `re-record-vote`, `dismiss-result`, `table`, `withdraw`, `reopen`

All are scoped under `/api/board-meetings/[production_id]/...`, so the module just needs a base URL + production_id in its config.

**Feedbacks & variables (read state):** there's already `GET /api/board/output/[channel_number]/state` — public, `Access-Control-Allow-Origin: *`, `Cache-Control: no-store`. That's perfect for polling status into Companion variables (current agenda item, live/recess, vote open) and driving button feedback colors. You may want a dedicated, richer status endpoint keyed by `production_id`, but the pattern already exists.

## The blocker to solve first: auth

`withControlContext` / `withPlaylistContext` both call `getAuthenticatedTeamUser()`, which reads the Supabase auth **cookie** from the browser session. A Companion module runs headless on a control-room machine — no browser, no cookie. So today these endpoints would return `401` to the module.

Recommended fix — add a **bearer-token / API-key path** alongside the cookie path:

1. Create a table (e.g. `control_api_tokens`) mapping a hashed token → a `team` user id (+ optional scope/expiry/label).
2. In `getAuthenticatedTeamUser()` (or a small wrapper used by the control/playlist route helpers), if there's no session cookie, check for `Authorization: Bearer <token>` (or `X-API-Key`), look it up, and resolve to the same `TeamUser`.
3. Generate a token per control-room device from the dashboard; store it in the Companion module's config field.

This keeps every existing route handler unchanged — they keep calling `getAuthenticatedTeamUser()`, which now also understands tokens. Use a long random token, hash at rest, scope it to control actions, and allow revocation.

(Alternative, lighter but less clean: a shared-secret header checked in the route helpers. Workable for an internal district tool, but per-device revocable tokens are worth the small extra effort.)

## Recommended architecture

```
Stream Deck ── Companion ── [custom module] ──HTTP(token)──► Next.js API ──► Supabase
                                  │
                                  └── poll GET state endpoint (or Supabase Realtime) ──► variables + feedbacks
```

Module config fields:

- **Base URL** (e.g. `https://hub.canyonsdistrict.org`)
- **API token** (the bearer token above)
- **Production ID** (which meeting to control) — or fetch a list and let the user pick
- **Poll interval** for status (e.g. 1000 ms), unless you wire Supabase Realtime

Module pieces (`@companion-module/base`):

- `actions` — one per endpoint above; bodies built from action options (e.g. lower-third text, motion id, vote value).
- `variables` — `is_live`, `current_agenda_item`, `elapsed`, `vote_open`, `motion_title`, etc., updated from polled state.
- `feedbacks` — color/style buttons by state (red when live, amber in recess, highlight the active agenda item, flash when a vote is open).
- `presets` — ship ready-made buttons so setup is drag-and-drop for operators.

## Build path

1. **Add token auth** to the API (the only backend change). Smallest version: extend `getAuthenticatedTeamUser()` to accept a bearer token.
2. **Add/confirm a status endpoint** keyed by `production_id` returning everything the buttons need to reflect (or reuse the channel state endpoint).
3. **Scaffold the module** from the official TypeScript template (`bitfocus/companion-module-template-ts`), depending only on `@companion-module/base`. Define config → actions → variables/feedbacks → presets.
4. **Run as a dev module** (point Companion at your module folder; it hot-restarts on save) for internal use. No store submission needed for in-house deployment.
5. **(Optional) Submit upstream** to the Bitfocus module repo only if you want it publicly listed — not required for district use.

### Faster prototype option

Before writing any module code, you can validate the whole flow with the built-in **Generic HTTP** module: point it at the API with the token header and map a few buttons to the POST endpoints. It has no real feedback/variable mapping and no presets, so it's a throwaway proof-of-concept, not the final answer — but it's a zero-code way to confirm auth + endpoints work end-to-end before investing in the custom module.

## Recommendation summary

Custom module is the right call (you want feedback, variables, and presets — generic HTTP can't do those well). The heavy lifting (the control REST surface and a CORS state read) already exists. Sequence the work as: **token auth → status endpoint → custom module (prototype with Generic HTTP first)**.

## Sources

- [companion-module-base (framework)](https://github.com/bitfocus/companion-module-base)
- [Companion Module Developers' Guide](https://companion.free/for-developers/module-development/)
- [Module Development 101](https://companion.free/for-developers/module-development/module-development-101/)
- [Feedbacks (wiki)](https://github.com/bitfocus/companion-module-base/wiki/Feedbacks)
- [H2R Graphics Companion module](https://github.com/bitfocus/companion-module-h2r-graphics)
- [H2R Graphics HTTP API docs](https://h2r.graphics/docs/api/http/)
- [Generic HTTP module](https://github.com/bitfocus/companion-module-generic-http)
