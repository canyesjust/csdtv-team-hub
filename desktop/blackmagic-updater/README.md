# Blackmagic Update Checker

Scans your computer for installed Blackmagic Design software, compares each version
against the latest published release, and opens the correct download page for anything
that's out of date. Works on Windows and macOS.

## Files
- `blackmagic_updater.py` — the app
- `catalog.json` — the list of products and their latest versions (editable)
- `build/` — scripts and icon to package this into a double-click .app / .exe (see `build/BUILD.md`)

Keep `blackmagic_updater.py` and `catalog.json` in the same folder.

## Turning it into a real app + hosting versions
Two things make this ready to hand out:
1. Package it. Run `build/build_mac.sh` on a Mac or `build/build_windows.bat` on Windows to
   get a standalone app with no Python needed. Sign it before sharing. Full steps in `build/BUILD.md`.
2. Host the catalog. Put `catalog.json` at a public URL (a GitHub raw link works), set
   `CATALOG_URL` near the top of `blackmagic_updater.py`, and every copy pulls fresh version
   numbers on launch. The bundled file is the offline fallback. Details in `build/BUILD.md`.

## Run it

You need Python 3, which is already on macOS and on most Windows machines.

**macOS**
1. Open Terminal.
2. `cd` into the folder with these files.
3. Run: `python3 blackmagic_updater.py`

**Windows**
1. Open the folder in File Explorer.
2. Double-click `blackmagic_updater.py`, or open Command Prompt and run `py blackmagic_updater.py`.

A window opens showing each product, the version you have installed, the latest version,
and a status. Pick a row marked **UPDATE AVAILABLE** and click **Open Download Page**.
Double-clicking a row does the same thing.

Text-only mode (no window): add `--cli`, e.g. `python3 blackmagic_updater.py --cli`.

## Why it opens the download page instead of updating automatically

Blackmagic puts every download behind a registration form (name, email, etc.) before it
serves the installer. There's no public API and no direct download link. So the app takes
you straight to the right page. You fill the form once and download.

## Keeping versions current

The "latest" numbers live in `catalog.json`. When Blackmagic ships a new release, open the
file in any text editor and change the version. `windows` and `macos` can differ (Desktop
Video, for example, is often a different build per OS).

The catalog covers 22 products across all 14 Blackmagic support families: DaVinci Resolve,
Fusion, Proxy Generator, Camera Setup, ATEM Software Control, Ultimatte, HyperDeck, Video
Assist, Desktop Video, Media Express, Disk Speed Test, Blackmagic RAW, Teranex, Converters,
SmartView/SmartScope, Audio/Sync Generator, Cloud Store, MultiView, Videohub, Web Presenter,
Streaming Bridge, and Cintel.

**The "?" mark:** a version shown with a `?` (e.g. `9.5 ?`) means I couldn't verify that
number against the live site, so treat it as a best guess and confirm before relying on it.
Verified as of 2026-07-10:
- DaVinci Resolve 20.3.3 (v21 is still beta, so the app tracks the 20.x stable line)
- Desktop Video 16.1 (Windows) / 16.0.1 (macOS)
- ATEM Software Control 10.2.1
- Blackmagic Camera Setup 10.2

To lock in a version, edit its entry in `catalog.json` and set `"verified": true` to drop the
`?`. A few products (Video Assist, MultiView, Cintel, Streaming Bridge, Audio/Sync) have blank
versions because Blackmagic doesn't publish them in a single place. The app still detects them
if installed and shows "Unknown" so you know to check the site.

## Notes / limits
- Windows detection reads the "installed programs" list in the registry. macOS reads the
  version out of each app in /Applications (and ~/Applications).
- If a product is installed somewhere unusual, it may show as "Not installed." Add or adjust
  the match rules in `catalog.json`.
