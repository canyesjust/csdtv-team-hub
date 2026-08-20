# Live graphics system

Rundown-driven graphics for concerts, games, parades and ceremonies. Separate
from the board-meeting graphics, which keep their own tables and channels.

**Status: foundation landed.** Schema, the separate `/gfx` shell, the template
registry, the transparent OBS output and the state API are in. The show screen
(build / run / review) is the next slice.

## Why it is a separate surface

`/gfx` does not inherit the hub's light theme, type scale or spacing tokens.
`app/gfx/layout.tsx` mounts `GfxRootMount`, which takes the document over while
mounted and hands it back on unmount. Two shapes come out of it:

- the **app shell**, dark and full bleed, for anything a person drives
- a **bare transparent passthrough** for OBS browser sources, detected by the
  route suffix (`/out`, `/prompter`, `/audio`)

Everything visual is scoped under `.gfx-root` or `.gfx-bare` so nothing leaks
either direction.

## URLs belong to machines, not shows

A channel is one row per production machine. The URL pasted into OBS never
changes; you assign tonight's show *to* a channel and the page already open in
OBS starts rendering it.

```
/gfx/<channel>/out?k=<output_token>     browser source, 1920x1080, transparent
/api/gfx/<channel>/state?k=<token>      read-only state (JSON)
```

Output flags: `motion=0` plain fades, `safe=1` safe-area guides, `debug=1`
connection strip.

**On the token.** An OBS browser source cannot send an `Authorization` header,
so this is the one documented exception to the no-tokens-in-query-strings rule
in `CLAUDE.md`. The token is per channel, view-only, rotatable, compared with
`timingSafeEqualStr`, and the route is rate limited. The Authorization header is
accepted and preferred for anything that can send one.

## Layer policy

Rundown rows own the story layers. The shelf owns the persistent ones.

| Layer | Put up by | Cleared by |
|---|---|---|
| `full` | a row | the next take, unless the new row replaces it or the row is `hold_full` |
| `lower` | a row or the shelf | row-sourced: the next take, plus an auto-out at the template's recommended seconds. Shelf-sourced: only the operator |
| `corner` | the shelf | only the operator |
| `ticker` | the shelf | only the operator |

`lib/graphics/layers.ts → resolveTake()` is the single implementation. This is
the rule that stops a show-open slate sitting over the rest of the show, and it
is also the structural line between what the director drives and what the
graphics operator owns.

## Colours

Brand colours are not on-air colours. Corner Canyon's primary is a near-black
navy and Alta's is literally black, so `schools` cannot feed a graphic directly.
`lib/graphics/theme.ts → deriveTheme()` raises HSL lightness (not a mix toward
white, which desaturates a navy into slate) until the leading bar clears a
luminance floor, picks a distinct trailing bar, lifts the lightest colour for
accent text and sinks the darkest for the panel.

`graphics_theme_overrides` holds the handful where that is wrong.

## Connection behaviour

- The output asks for **full state** on every connect, never a partial, so a
  browser-source refresh mid-show restores what was on air inside a second.
- Realtime broadcast is the fast path (`lib/graphics/realtime.ts`).
- The polling ladder underneath only catches a dropped push
  (`lib/graphics/polling.ts`), lifted from `lib/board-meetings/output-polling.ts`.
  Listening off is 120s; live with realtime connected is a 1.5s safety poll.
- On a fetch failure the page keeps rendering the last state rather than
  blanking the show.

## Tables

`graphics_channels`, `graphics_shows`, `graphics_blocks`, `graphics_rows`,
`graphics_shelf_items`, `graphics_air`, `graphics_air_log`, `graphics_packages`,
`graphics_audio_assets`, `graphics_rosters`, `graphics_theme_overrides`.

RLS is on for all eleven with hub-staff select and write policies. Nothing is
readable by `anon`: the output page reads through the service-role API route
gated by the channel token.

`graphics_air_log` is the as-run source for YouTube chapters and the sponsor
report.

## Known follow-ups

- **Self-host the fonts.** `app/layout.tsx` pulls Roboto from Google Fonts at
  build time. A sandboxed or offline build fails on it, and at runtime an OBS
  machine that cannot reach the CDN renders graphics in a fallback face with no
  error anywhere. Ship the files from Storage with `font-display: block`.
- `school_logos` art is not wired in yet; `LogoMark` draws placeholder crests
  from each school's brand colours and mascot. Pick one aspect ratio for the
  graphics logo category before importing.
- Audio playback (`/gfx/<channel>/audio`) and the prompter
  (`/gfx/<channel>/prompter`) are designed but not built.

## Build log, session 2

Added on top of the take loop:

**Rundown editing.** Add row, add row with graphic, add block, duplicate, delete.
Drag a row by its handle to reorder; the server recomputes a `sort_order` midway
between the new neighbours so nothing renumbers and page numbers stay stable.

**Shelf editor.** Shelf cards are created and removed in BUILD. They are what the
graphics operator owns: not in the running order, not in the timing, and never
cleared by a take.

**Setup drawer.** Everything you touch once per show, off the main screen. Name,
air and hard-out times, event type, state, school with the derived on-air colours
shown, the ready check, and the output channel with its URLs.

**Show creation with starters.** `lib/graphics/starters.ts` seeds a new show with
blocks, rows and a shelf for its event type. Nobody starts from an empty grid.

**Prompter.** `/gfx/<channel>/prompter?k=<token>` is a chrome-free page, white on
black, past lines dimmed, IFB in red and never read aloud. It follows the rundown
cursor, so a take jumps it. Transport (roll, speed) lives in the show screen and
is stored on the show, so Companion can drive the same endpoint.

**Realtime sync.** The show screen subscribes to the same channel topic as the
output, so two people on one show stay in step. Local edits suppress the refresh
while you are typing.

### Conventions worth keeping

- Every mutation goes through `withGraphicsControl`: authenticated team user,
  staff-or-manager role, then the service client. Never the other way round.
- Graphic payloads are validated against the template registry server-side.
  A client cannot post a blob with fields the template does not declare.
- A re-mount is not a take. The compositor only animates when the on-air set
  actually changed, so a panel re-render never replays an entrance.
- Ticking UI patches text in place. Nothing that runs on an interval is allowed
  to re-render a subtree that contains a stage.

## Build log, session 3

**Audio.** `graphics_audio_assets` plus a private `graphics-audio` storage bucket
and a `graphics_audio_state` table with one row per (show, slot). A one shot and
a bed are separate slots, so a stinger never stops the music under it. Rows carry
an `audio_cue` that fires with the take, and the shelf side can fire anything from
the library on the spot.

Playback is its own browser source at `/gfx/<channel>/audio?k=<token>`, so it gets
an independent fader in OBS and the graphics source stays muted. Browsers block
audio until a gesture, so the page has a one-time **Enable sound** step for when
the machine is set up. Signed URLs are short-lived and refresh on the poll; a clip
that is already playing resumes at the right offset rather than restarting.

Uploads are bounded server-side: 60 MB, an allow-list of audio MIME types, and the
storage object is removed again if the database insert fails.

**Rosters and the jersey pad.** `lib/graphics/rosters.ts` parses a MaxPreps export
as-is (`jersey, firstname, lastname, position1, classyear`), a plain sheet with a
name column, or a headerless positional file. 17 tests cover it, including quoted
fields and bounds.

The pad is one keypad for both teams. Type a number once and see who it is on each
roster, then tap the side you meant. A team toggle is one more thing to be wrong
about at the moment you have the least attention, and both teams have a 23.

**Auto-out.** A row lower third carries `out_seconds` and comes down on its own.
The output computes this locally so the picture is right even with no control
surface open; the show screen sweeps as well so the record stays straight. Full
screens never auto-out, and neither do shelf graphics.

## Build log, session 4

**Sponsors.** `graphics_sponsors` holds district and school scoped sponsors.
Creating a show attaches every active one, switched on, and `mergeLibraryIntoShow`
keeps operator decisions intact: a district sponsor ticked off stays off and
event-only sponsors added on the show survive. The show's setup drawer has the
per-show toggles. One list feeds the bug, the rotation slate, the intermission
strip and the side panel.

**Library.** The third screen, at `/gfx/library`, visited when you are building a
package rather than running a game. Four tabs:

- **Audio** uploads with the clip length read in the browser, so a prevoiced tease
  can set its row estimate to its own duration.
- **Rosters** takes a pasted CSV, parses it with the same code the tests cover,
  and shows a correctable preview table before anything is saved.
- **Sponsors** manages the district list.
- **Outputs** lists every channel with its three OBS URLs.

Nothing imports without showing you what it parsed first.

## Build log, session 5

**Shows start from productions.** `lib/graphics/from-production.ts` reads the
production list the site already keeps and guesses what a graphics show would
need from it: event type from the title and shoot type, school from the
department, venue from the location. `/api/gfx/productions` returns upcoming
productions already mapped, with a `has_show` flag so nothing gets created
twice. The New show button on `/gfx` leads with that list. Nobody retypes a
game that is already on the calendar.

**Packages.** `saveShowAsPackage` captures the templates a show used, the logo
choice on each one, and the shelf. `applyPackageToShow` puts them onto another
show and deliberately does not touch the running order or anything anyone
typed, so recalling a package at 4pm on Friday cannot destroy the rundown built
on Tuesday. `packageReadyCheck` reports what the rundown asks for that the
loaded package does not carry, which is the question that belongs on Tuesday.

**As-run exports.** Two things fall straight out of the as-run log and cost
nothing to produce. `buildChapters` turns `graphics_rows.started_at` into
YouTube chapter markers, forcing the first to 0:00 and skipping floated and
break rows. `buildSponsorReport` counts takes and on-screen seconds per sponsor
out of `graphics_air_log`. REVIEW mode renders both, plus a save-as-package
button.

## Build log, session 6

**The drawer got the two things it was missing.** Packages now list in the show
setup drawer, filtered to the show's event type, with apply and save. Rosters
get a home and away picker on a game, filtered to each side's school. Both
lists load only when the drawer opens, so they are not on the critical path of
loading a show.

**Audio cues are assignable.** A row's editor has the clip picker, one shot or
bed, a gain slider, and a one-click "set the estimate to the clip" when the
uploaded duration and the row estimate disagree. That last one is free timing
accuracy on the one kind of row whose duration is actually known.

**Hardware panels.** `/api/gfx/<channel>/cmd` takes commands from Bitfocus
Companion, a Stream Deck or a foot pedal wired to an HTTP key. A panel cannot
hold a browser session, so it carries a bearer token.

The token is deliberately a *second* token. The output token is pasted into OBS
and readable by anyone who can see the machine, so it is read-only and can
never take a graphic. Panel control is also off per rig until someone turns it
on, and the endpoint is rate limited before the token is even compared, so
guessing costs the same as being right.

| Action | Argument | What it does |
|---|---|---|
| `take_next` | | Take the next takeable row. Nothing on air takes the first. |
| `take_prev` | | Step back a row. Never wraps. |
| `take_row` | page number | Jump to a page, for a hard-out billboard |
| `clear` | layer, optional | Row-owned layers out, or one named layer |
| `clear_all` | | Everything out |
| `shelf` | slot number | Toggle a shelf item. Pressing it again takes it out. |
| `prompter` | `on`, `off` or nothing | Roll, pause or toggle |
| `audio_stop` | `bed`, `oneshot` or nothing | Stop a slot |
| `status` | | On air and next, for a key with a display |

Neither next nor previous wraps. Wrapping a live rundown would retake the show
open off the last row of the game, which is exactly the failure a tired student
at 9:40 on a Friday does not need. Thirteen tests in
`scripts/graphics-panel.test.mts` hold that line.

The tokens and the toggle live in the Library's Outputs tab, hidden behind a
show button with a rotate next to it, because the recovery from a token that
ended up in a screen share has to be one click and not a migration request.

**Position is style, not a template.** Every lower third gained a `pos` field:
left or right, low or raised. Venues put things in the bottom of frame we do
not control, a scoreboard feed or burned-in captions or a stage lip, and the
answer to that is to move the band, not to draw a second one. The band is
identical in all four positions, which keeps the one type scale and the one set
of anchors that make the package read as a package.

`pos` is a new field type, `choice`, and packages now capture `choice` fields
alongside `logo` fields as style. So "our lower thirds sit raised and carry no
mark" is a property of a saved package, exactly like the logo decision was.

**Two freeform templates.** `free_lt` is three lines and a mark; `free_card` is
a kicker, a title, up to eight lines and a footer. They exist because a game is
on the fly and the rundown cannot predict everything, and because the
alternative, someone building a one-off template at 7:15, is how a package
stops looking like a package.

**The shows list groups by when.** It is one of only two screens anyone
navigates to, and a flat reverse-chronological list buries tonight's game under
last month's concerts. It now reads: on air now, today, tomorrow, this week,
later, done. Empty buckets never render, so the page is as short as the week is
quiet. Each row carries its rig, because "which trailer is this on" is the
question you ask before you open it.

A live show pins to the top whatever its date says. A show that ran past
midnight is still the show you are running.

Buckets compare America/Denver calendar days, never timestamps. A UTC
comparison would flip a 7pm Friday game to "tomorrow" at 5pm local during
daylight time, which is precisely when someone is looking for it.
`scripts/graphics-shows.test.mts` holds the boundaries, including the DST one.

## Build log, session 7

**The lag.** The show screen called `router.refresh()` on every debounced row
save, on every realtime push and on a 15 second timer. Each one re-ran the
server page, re-queried the whole bundle, re-serialised the React tree and
reconciled the entire screen. On a keystroke cadence that is exactly what it
felt like.

It now works the way the board outputs work. `GET /api/gfx/shows/<id>/state`
returns the bundle as JSON, `useShowState` holds it in client state, and the
poll runs on a ladder: 30s when nobody is live, 4s live with realtime
connected, 1.2s live when realtime is down and the poll IS the transport, and
off entirely while someone is typing. Saving a row no longer refetches at all.
The draft on screen is the truth and the database catches up 600ms later.

**Blocks were invisible.** A block header only rendered when a row pointed at
it, so a brand new empty block drew nothing and the button looked broken. The
rundown now renders from a plan built out of the blocks, so every block appears
whether or not it holds rows, with an inline row-add, rename and delete on the
header. Deleting a block keeps its rows and drops them into an UNASSIGNED
group, because losing a segment to a misclick is not recoverable mid-build.

**Pages number themselves.** `lib/graphics/pages.ts` derives A1, A2, B1 from
block order and running order. Every structural change (add, delete, duplicate,
reorder, block change) calls `/renumber`, which writes only the rows whose page
is actually wrong. A clean show costs zero writes. There is a Renumber button
in the BUILD toolbar for the rare manual case.

**Edit in the grid.** Slug, form, video, camera, audio, talent and estimate are
editable in the row itself. The right panel is for the graphic. Estimates
accept `90`, `1:30` or `1:02:05` because a producer types whichever is fastest.

**The school picker was every department.** The `schools` table also holds all
33 district departments, so the picker listed Purchasing and Risk Management
next to Alta High. Every graphics query now filters `type = 'school'` and
`active`, ordered by level then name.

## Build log, session 8

**Prompter position.** Talent misses a line and needs to go back, and the
rundown must not move to make that happen. The scroll position lives in the
browser source, so the control surface cannot set it directly. It issues a
numbered command instead: `prompter_seek_n` increments server-side and the
output applies the seek exactly once, which is what makes a repeated poll safe.
A command arriving twice does not scroll twice.

Controls are Back ×3, Back ×1, Ahead ×1, Ahead ×3, plus **Back to on air**,
**Top of show** and **Jump to** the selected row. Back scrolls the prompter only.
Nothing is re-taken and the director's cursor does not move.

`resolveSeek` is pure and tested, including the sign, because getting Back
backwards scrolls away from the line the talent just missed.

**Listening reaches everything now.** `graphics_channels.listening` already
drove the graphics output ladder. The prompter and audio outputs ignored it and
polled flat forever. Both now read `poll_ms` off their own payload and re-arm
the timer each tick, so a change takes effect on the next poll rather than on
the next mount.

| Listening | Show state | Every output polls |
|---|---|---|
| off | anything | 120s |
| on | nothing assigned | 120s |
| on | draft or done | 5s |
| on | rehearsal or live | 350ms, or 1.5s with realtime up |

**It arms itself.** Setting a show to rehearsal or live turns listening on for
its rig. Setting it to done turns it off. Nobody has to remember, and the manual
override is a toggle in the show bar next to the rig name, with a green ear when
it is awake. The Library's Outputs tab has the same toggle per rig.

## Build log, session 9

**One place per thing.** Making the grid editable without taking anything out of
the right panel left two places to change the same field and a wall to read past
before reaching the work. The rule now is one line long: **the grid owns the
row, the panel owns the graphic.**

Gone from the right panel: page, form, slug, estimate, talent, video, camera,
audio. All of them are in the grid cell they belong to.

What the panel shows in BUILD, top to bottom: the preview, the template picker,
and the template's own fields. That is it. A row with no graphic gets one line
and a picker.

**Script moved into the grid.** Selecting a row opens a full-width strip under
it with the script and the IFB note. Copy is long-form and belongs across the
screen, not in a 340px column, and it sits directly under the row it is read
for. The read-time estimate is on the label.

**Approve is a click on the tick column.** It was a button in the panel for a
thing that already had a column.

**Row options is one disclosure, closed.** On take, audio cue, float, duplicate,
delete. Everything in there is set once and forgotten, and the header carries a
count when any of it is set, so nothing is hidden that is actually doing
something.

**Blocks are renamed in place.** `window.prompt` produced a block called YES,
which is exactly what a modal asking you to name a thing you can see on screen
deserves. Add drops a block called NEW SEGMENT, and the header label is an input.

**Pages are derived, never read from the column.** The grid shows the number the
running order implies. The stored value is still written, because the prompter
and the exports read it, but a stored page that disagrees with the order can no
longer show up on screen.
