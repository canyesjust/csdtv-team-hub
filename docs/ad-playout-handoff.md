# Ad Playout System — Builder Handoff

**Status:** proposal / ready to build
**Author:** prepared with Justin
**Scope:** random ad rotation for OBS, controlled from the hub, playing from local files on the streaming PC.

---

## 1. What we're building

A commercial playout system for CSDTV. Staff manage an ad library in the hub. A
small program on the streaming PC (the **runner**) mirrors those files locally and
plays a random ad into OBS at random intervals. Staff control it from a hub page
that also docks inside OBS.

Two hard requirements drive the design:

1. **Local playout only.** OBS plays from files on the streaming PC's disk. The
   system never streams an ad from a web URL live. One buffer would be on air.
2. **One place to manage.** Staff only touch the hub. The local folder is an
   automatic mirror of the hub library, never hand-managed.

---

## 2. Architecture

Three parts.

**Hub (Next.js + Supabase, this repo).** Source of truth. Holds the ad library,
rotation config, command queue, device status, and play logs. Serves the operator
UI. Cannot run the playout loop itself — Vercel is serverless, no long-lived
process, and it can't reach OBS on the LAN.

**Runner (new, Node, runs on the streaming PC).** Headless. Holds the OBS
WebSocket connection, syncs ad files from the hub to a local folder, runs the
rotation loop, and plays from disk. Talks to the hub only through authenticated
device endpoints (outbound HTTPS, no inbound ports).

**OBS (streaming PC).** Has a Media Source the runner drives. The operator UI is
added as a Custom Browser Dock pointing at the hub page.

```
Staff → Hub UI → Supabase (library, config, commands, logs)
                     ▲   │
        heartbeat +  │   │  manifest + commands (runner polls)
        play logs    │   ▼
                   Runner (streaming PC) → OBS Media Source → on air
                     │
                     └─ syncs files → local folder (plays from disk)
```

A working reference runner (standalone, config-file version) is attached as
`CSDTV-OBS-Controller.zip`. It already implements the OBS calls and the rotation
loop. The build task is to swap its config file for the hub device endpoints and
add the file-sync layer.

---

## 3. Data model (new tables)

All tables get RLS enabled with explicit policies. Team access via the existing
role helpers; the runner never touches the DB directly (it goes through the
device API, which uses the service client server-side). Follow the patterns in
`supabase/migrations/*` and the rules in `CLAUDE.md`.

### `ad_spots` — the curated ad library
References existing `media_assets`. Keeps the media library general; ads are a
curation on top of it.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| media_asset_id | uuid fk → media_assets | the video file |
| enabled | boolean default true | |
| weight | int default 1 | for weighted rotation later |
| active_from | timestamptz null | optional daypart window (phase 4) |
| active_to | timestamptz null | optional |
| content_hash | text null | version signal for sync; see §5 |
| created_by | uuid | team user |
| created_at / updated_at | timestamptz | |

### `playout_devices` — runner registration + status
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | e.g. "Studio A stream PC" |
| token_hash | text | sha-256 of the device token; never store raw |
| obs_connected | boolean default false | heartbeat |
| now_playing | text null | filename on air |
| next_at | timestamptz null | next scheduled ad |
| ads_local | int default 0 | count synced to disk |
| last_sync_at | timestamptz null | |
| last_seen_at | timestamptz null | heartbeat timestamp |
| created_at | timestamptz | |

### `ad_playout_config` — desired rotation state (single row, or per-device)
| column | type | notes |
|---|---|---|
| device_id | uuid fk → playout_devices | |
| auto_enabled | boolean default false | |
| min_gap_sec | int default 180 | |
| max_gap_sec | int default 600 | |
| no_repeat | boolean default true | |
| mute_during_ads | text[] default '{}' | OBS audio sources to mute under an ad |
| updated_at | timestamptz | |

### `ad_commands` — command queue (hub → runner)
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| device_id | uuid null | null = all devices |
| type | text | `play_now` \| `set_auto` \| `sync_now` |
| payload | jsonb null | e.g. `{ "spot_id": "..." }` or `{ "enabled": true }` |
| created_by | uuid | |
| created_at | timestamptz | |
| consumed_at | timestamptz null | runner acks |

### `ad_play_log` — reporting
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| device_id | uuid | |
| media_asset_id | uuid | |
| played_at | timestamptz | |
| source | text | `auto` \| `manual` |
| ok | boolean | playback started cleanly |

---

## 4. API endpoints

All live under `app/api/*` and must self-gate (the middleware auth gate does not
cover `/api/*`). Two audiences.

### Hub-facing (team-user auth)
Use `getAuthenticatedTeamUser()`; mutations require `isStaffOrManagerRole()`.

- `GET  /api/ads/spots` — list spots joined to media info + per-device sync state
- `POST /api/ads/spots` — add a spot (staff/manager)
- `PATCH/DELETE /api/ads/spots/[id]` — edit / remove (staff/manager)
- `GET  /api/ads/config` — current rotation config + device status
- `POST /api/ads/config` — set auto / min / max / no_repeat (staff/manager)
- `POST /api/ads/commands` — enqueue `play_now` / `sync_now` / `set_auto` (staff/manager)
- `GET  /api/ads/devices` — list devices + status
- `POST /api/ads/devices` — register a device; returns the raw token **once**

### Device-facing (runner bearer-token auth, rate-limited)
Authenticate with `Authorization: Bearer <device_token>`. Hash the presented
token and compare with `timingSafeEqualStr` (see `lib/server/security.ts`)
against `playout_devices.token_hash`. Rate-limit with
`lib/server/rate-limit.ts → checkRateLimit`. Never accept the token in a query
string.

- `GET  /api/ads/agent/manifest` — desired state for this device:
  ```json
  {
    "config": { "auto_enabled": true, "min_gap_sec": 180, "max_gap_sec": 600, "no_repeat": true },
    "ads": [
      {
        "spot_id": "uuid",
        "media_asset_id": "uuid",
        "name": "Back to School 2026",
        "filename": "back-to-school.mp4",
        "content_hash": "sha256:...",
        "download_url": "https://<signed-supabase-url>",
        "url_expires_at": "2026-07-02T18:00:00Z"
      }
    ]
  }
  ```
  `download_url` is a short-lived Supabase **signed** URL (bucket `media-library`
  is private-capable — use `createSignedUrl`, see `mediaPlaybackUrl` in
  `lib/board-meetings/media-library.ts`).
- `GET  /api/ads/agent/commands` — pending commands for this device
- `POST /api/ads/agent/commands/ack` — `{ "ids": ["..."] }` mark consumed
- `POST /api/ads/agent/heartbeat` — runner reports status and posts play-log rows:
  ```json
  {
    "obs_connected": true,
    "now_playing": "back-to-school.mp4",
    "next_at": "2026-07-02T17:42:00Z",
    "ads_local": 6,
    "last_sync_at": "2026-07-02T17:30:00Z",
    "plays": [ { "media_asset_id": "uuid", "played_at": "...", "source": "auto", "ok": true } ]
  }
  ```

Polling cadence: manifest every ~30s, commands every ~3–5s, heartbeat every ~5s.
This mirrors the existing `output_channels.obs_polling_enabled` pattern.

---

## 5. The runner (new Node service)

Start from the attached reference. Responsibilities:

**Auth.** Load device token from a local env/config. Send it as a bearer token.

**Sync loop.** On a trigger (manifest poll every 30s, a `sync_now` command, or
boot), reconcile the local folder against the manifest:
- Keep a local `manifest.json` mapping `media_asset_id → { filename, content_hash }`.
- Download where the id is missing locally or `content_hash` differs.
- Download to a temp name, verify byte length, then **atomic rename** into place so
  OBS never sees a partial file.
- Delete local files whose id is gone from the manifest — but **never delete the
  file currently on air**.
- After reconcile, report `ads_local` and `last_sync_at` in the heartbeat.

**Version signal.** `content_hash` decides "changed." Populate it when a spot is
created (hash the object, or store `sha256` in `ad_spots`). If a hash isn't
available at first, fall back to `media_assets.updated_at + size_bytes` as the
version string. Without a stable version the runner would re-download constantly.

**Names.** Play by `filename`, but display the assigned `name` (from
`media_assets.name`) everywhere the operator sees it — the on-air indicator, the
ad list, and the play log. Operators think in ad names, not filenames. The
heartbeat `now_playing` should be the name, not the file.

**Rotation loop.** Honor `config` (min/max gap, no_repeat). **Only pick from files
present in the local manifest.** A scheduled ad that hasn't finished syncing is
skipped, never streamed. This is the guardrail that enforces requirement #1.

**OBS control.** The reference already does this. Calls used:
- `SetInputSettings` — point the Media Source at the local file
  (`{ is_local_file: true, local_file, looping: false }`)
- `GetSceneItemId` + `SetSceneItemEnabled` — show/hide the source in the scene
- `TriggerMediaInputAction` with `OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART` — play
- `SetInputMute` — mute the configured background audio sources while the ad is
  on air, unmute when it ends (see audio note below)
- `MediaInputPlaybackEnded` event — unmute, hide the source, schedule the next ad

**Audio under ads (required).** OBS mixes every active audio source, so a scene's
background audio (e.g. "Starting Soon" music) keeps playing under an ad unless it
is silenced. The runner mutes a configured list of audio sources when an ad
starts and unmutes on `MediaInputPlaybackEnded`. Config field `mute_during_ads`
(array of OBS input names). Also unmute on any play failure, since no "ended"
event fires if playback never starts — otherwise the music stays muted. The
reference runner implements this in `src/obs.js` (`muteDuringAds`).

**Commands.** Poll, execute (`play_now`, `set_auto`, `sync_now`), then ack.

**Resilience.** Auto-reconnect to OBS. Keep playing from disk if the internet
drops; resume sync when it returns. Reconcile on boot to catch up.

Run it as an auto-starting background service on the streaming PC (Windows Task
Scheduler / a service wrapper, or pm2).

---

## 6. Operator UI

A hub route styled like the existing control surface
(`app/control/[productionId]/program/ProgramClient.tsx` is the reference for
look and the 2s poll pattern). Suggested path: `app/control/ads` or under
`app/tools`.

Shows: OBS connection state, now playing, countdown to next ad, the ad list with
per-file sync state (synced / downloading / error), and an activity log. Controls:
**Play ad now**, **Auto rotation** toggle, **Sync now**, and add/remove ads from
the library. Green = file is local and safe to air.

Add it to OBS via **Docks → Custom Browser Docks** pointing at the route. Same
control surface then lives inside OBS and on any browser on the network.

---

## 7. Security checklist (maps to `CLAUDE.md`)

- [ ] Every new `/api/ads/*` route self-authenticates. Hub routes via
      `getAuthenticatedTeamUser()`; mutations via `isStaffOrManagerRole()`.
- [ ] Device routes verify a hashed bearer token with `timingSafeEqualStr`,
      never a `?key=` query param.
- [ ] Device routes are rate-limited via `checkRateLimit` (no in-memory Map).
- [ ] Device token stored hashed (`token_hash`); raw token shown once on creation.
- [ ] Runner never receives the service-role key. Downloads use short-lived
      signed URLs only.
- [ ] RLS enabled on all new tables with explicit policies scoped to role helpers.
      No `USING (true)` write policies.
- [ ] After the migration, check Supabase advisors (security + performance).
- [ ] Validate/bound all input server-side (gap seconds, ids, MIME already handled
      by the existing media upload path).
- [ ] Run `/security-review` on the diff before shipping.
- [ ] Per `AGENTS.md`: this is Next.js 16. Read `node_modules/next/dist/docs/`
      before writing route code; conventions differ from older versions.

---

## 8. Build phases

1. **DB + device registration.** Migration for the tables above, RLS policies,
   `POST /api/ads/devices` returning a one-time token.
2. **Device API + runner.** `manifest`, `commands`, `heartbeat` endpoints; runner
   sync loop + OBS control against the reference.
3. **Operator UI.** Hub route + Custom Browser Dock.
4. **Reporting + scheduling.** Play-log views, then dayparting (`active_from/to`)
   and weighted rotation (`weight`).

## 9. Definition of done (phase 2–3)

- Upload a video in the hub, tag it as an ad → it appears on the streaming PC
  within ~30s without any manual file copying.
- Delete the ad in the hub → it leaves the local folder (unless on air).
- Panel shows green when files are local; **Play ad now** fires within ~5s.
- Auto rotation plays a random, non-repeating local ad on the configured interval.
- Background scene audio (Starting Soon music) is silent under an ad and returns
  when the ad ends, including when playback fails to start.
- Pulling the network cable mid-show does not interrupt playout.
- No code path can play an ad from a remote URL.

## 10. Open decisions for the builder

- **Ad selection model:** dedicated `ad_spots` table (recommended here) vs a
  simple `asset_type = 'ad'` / tag on `media_assets`. `ad_spots` keeps rotation
  metadata (weight, windows) off the general media library.
- **Mirror scope:** mirror the whole ad library (recommended for v1, small
  library) vs per-show/per-channel filtering in the manifest (add later).
- **Config scope:** single global config vs per-device (multiple studios). Schema
  above is per-device to leave room; collapse to one row if only one PC.
