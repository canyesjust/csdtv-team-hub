# Board meeting → digital signage takeover

Lets selected digital-signage screens carry a board meeting: the operator manually
starts it, screens show a pre-meeting "preroll" graphic, flip to the live YouTube
stream when the meeting goes live, then return to normal signage when it ends.

## Decisions (agreed)

- **Which screens:** per-screen opt-in (a setting on each signage screen). Not all screens.
- **Trigger:** manually started by the operator. No automatic schedule.
- **Orientation:** all screens are 16:9 landscape (no portrait variant needed).
- **Live source:** the meeting's **YouTube livestream**, pulled from the board-meeting
  production's `livestream_url`. Cablecast is not involved on the signage side.
- **Audio:** sound on for these screens, with captions force-shown. Because browsers
  block autoplay-with-sound, a screen that can't autoplay audio falls back to
  **muted + captions**. Sound is a per-screen setting (not every screen has speakers).

## Three phases on a taken-over screen

1. **Preroll** — zoned web graphic (no stream):
   - 16:9 **media carousel** (videos + images), the largest zone.
   - **Starting soon** panel: meeting name + date (no countdown).
   - **Upcoming agenda** panel that auto-scrolls through the items.
   - **District news ticker** along the bottom, from the RSS feed.
   - Header: Canyons district logo + "Canyons District · Board of Education".
   - **Full-screen moments:** a media item can take the whole screen, two ways —
     (a) marked "play full-screen" when building the playlist, and (b) a live manual
     toggle on the operator's pre-roll panel. Both hide the panels, then return to zoned.
2. **Live** — embed the production's YouTube live URL, captions on, sound (muted fallback).
3. **Ended** — drop the takeover; screen returns to its normal signage feed. Safety
   auto-revert so a screen never gets stuck on a finished meeting.

## Build phases

### Phase A — preroll graphic + news ticker (self-contained, low risk)
- `lib/board-meetings/news-ticker.ts` + `/api/board-meetings/news-ticker` — fetch + cache
  the district RSS feed, return latest headlines.
- Rebuild the board preroll view (`app/board/components/BoardPrerollView.tsx`) into the
  zoned layout above. Media zone cycles media items; agenda + starting-soon become
  persistent panels (not playlist items); ticker reads the news API.
- Logo asset (Canyons district color PNG) in the header.

### Phase B — signage takeover bridge
- `signage_screens`: add `board_takeover_enabled` + `board_takeover_audio`.
- A control state for the active takeover (meeting/production id, phase, youtube_url),
  written from the operator's pre-roll panel start/stop controls.
- The signage screen feed (`build-screen-feed.ts`) gains a `board_takeover` block; the
  screen renderer (`ScreenClient.tsx`) renders preroll graphics or the YouTube live
  embed when taken over, else the normal feed.
- Operator controls: start preroll on signage → go live (pull `livestream_url`) → end.

## Outside inputs
- RSS feed: `https://rss.app/feeds/hR9Of3ZD4b0Rw2Bg.xml`
- Logo: Canyons district color PNG (canyonsdistrict.org) — host locally in `public/`.
