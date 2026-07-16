# CSDtv Ad Controller (desktop)

The ad controller as a real cross-platform app with its own window. Same code as
the current download, wrapped in Electron so it runs on macOS and Windows with no
browser and no Node install for the user.

## How it's built

GitHub Actions does the compiling, exactly like the blackmagic app. Push a change
under `desktop/ad-controller/`, and `.github/workflows/build-ad-controller.yml`
builds a macOS `.dmg` on a Mac runner and a Windows `.exe` on a Windows runner,
then publishes them to the `ad-controller-latest` release. Point your download
page at that release's assets.

Signing is optional and uses the same repo secrets as blackmagic:
`MACOS_CERT_P12_BASE64`, `MACOS_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_PASSWORD`,
`APPLE_TEAM_ID`, `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD`. No secrets =
unsigned build (still runs, shows a first-launch warning).

## What's inside

- `main.js` — Electron: boots the server, opens the panel in an app window.
- `src/` — the controller (OBS control, rotator, pre-show, hub sync). Unchanged
  logic, edited only for the audio fade and the reconnect fix.
- `public/index.html` — the operator panel.
- `build/icon.icns` — macOS app icon.

## Build it locally (optional)

Needs Node 20+.

```
cd desktop/ad-controller
npm install
npm start        # runs it in a window right now
npm run dist     # builds an installer into dist/ for your current OS
```

## Not yet verified

This scaffold hasn't been through a build yet. It's a first cut, so the first
GitHub Actions run may surface a small tweak. Known follow-ups:

- **Icons:** done. `build/icon.icns` (macOS) and `build/icon.ico` (Windows,
  16&ndash;256px) are both in place and auto-detected by electron-builder.
- **Intel + Apple Silicon:** the workflow builds an Intel (x64) macOS app, which
  runs on both via Rosetta. If you want a native Apple Silicon build too, add
  `--arm64` (or a universal target) to the macOS build step.
