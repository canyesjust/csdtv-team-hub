#!/usr/bin/env python3
"""
Blackmagic Update Checker
-------------------------
Scans this computer for installed Blackmagic Design software, compares each
found version against the latest published version, and lets you open the
correct Blackmagic download page for anything that is out of date.

Version data comes from a catalog. On launch the app tries to fetch a fresh
catalog from CATALOG_URL (so you can update version numbers in one place for
every copy). If that fails, it uses the catalog.json bundled next to the app.

Works on Windows and macOS. No third-party packages required (standard library
+ Tkinter, which ships with Python).

Run it:
  macOS:    python3 blackmagic_updater.py
  Windows:  py blackmagic_updater.py
  Text-only mode:  add --cli
"""

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import webbrowser
import glob
import urllib.request

APP_VERSION = "1.2"
IS_WINDOWS = platform.system() == "Windows"
IS_MAC = platform.system() == "Darwin"

# Name fragments that mark an app as Blackmagic-made, for the "found but not in
# catalog" catch-all.
BM_NAME_HINTS = (
    "blackmagic", "davinci", "atem", "fusion", "ultimatte", "hyperdeck",
    "videohub", "teranex", "smartview", "smartscope", "desktop video",
    "cintel", "web presenter", "multiview", "decklink", "ultrastudio",
    "proxy generator", "media express",
    # Utilities that don't always carry the "Blackmagic" prefix in the app name.
    "streaming", "camera setup", "video assist", "converter setup",
    "sync generator", "audio monitor", "disk speed", "cloud store",
)

SUPPORT_URL = "https://www.blackmagicdesign.com/support/"

# Shown in the Installed column when the app is on disk but its Info.plist
# carries no version. Deliberately not a number, so compare_versions() treats it
# as "unknown" rather than pretending it's older or newer than the latest release.
INSTALLED_NO_VERSION = "Installed (version n/a)"

# Live catalog endpoint. Served by the CSD TV Team Hub, which pulls Blackmagic's
# own download feed and always returns current versions. Leave "" to use only the
# bundled catalog.json fallback.
CATALOG_URL = "https://www.csdtvstaff.org/api/catalog"
FETCH_TIMEOUT = 6  # seconds

# Self-update. The build workflow publishes version.json next to the app zips on
# the "app-latest" GitHub release, so this URL always describes the newest build.
RELEASE_BASE = "https://github.com/canyesjust/csdtv-team-hub/releases/latest/download"
VERSION_MANIFEST_URL = RELEASE_BASE + "/version.json"
# Downloads must stay on GitHub. Release asset links redirect to a CDN host, so
# those are allowed too; anything else is refused rather than followed.
ALLOWED_DOWNLOAD_HOSTS = (
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
)
DOWNLOAD_TIMEOUT = 120  # seconds


# ----------------------------------------------------------------------------
# Version handling
# ----------------------------------------------------------------------------
def parse_version(v):
    if not v:
        return ()
    nums = re.findall(r"\d+", str(v))
    return tuple(int(n) for n in nums)


def compare_versions(installed, latest):
    iv, lv = parse_version(installed), parse_version(latest)
    if not iv or not lv:
        return "unknown"
    length = max(len(iv), len(lv))
    iv += (0,) * (length - len(iv))
    lv += (0,) * (length - len(lv))
    return "up_to_date" if iv >= lv else "update_available"


def latest_for_os(entry):
    latest = entry.get("latest", {})
    if isinstance(latest, str):
        return latest
    if IS_WINDOWS:
        return latest.get("windows") or latest.get("macos") or ""
    return latest.get("macos") or latest.get("windows") or ""


# ----------------------------------------------------------------------------
# Detection: macOS
# ----------------------------------------------------------------------------
def detect_mac(entry):
    """Version string if the app is installed, INSTALLED_NO_VERSION if it's on
    disk but won't tell us its version, None if it isn't there at all.

    The three states matter. Several Blackmagic setup utilities ship an
    Info.plist with no CFBundleShortVersionString and no CFBundleVersion. This
    used to return None for those, so an app sitting in /Applications was
    reported as "Not installed" — worse than saying nothing, because it's wrong.
    """
    import plistlib
    app_names = entry.get("mac_app", [])
    search_dirs = ["/Applications", os.path.expanduser("~/Applications")]
    found_without_version = False
    for app_name in app_names:
        for base in search_dirs:
            candidate = os.path.join(base, app_name)
            paths = [candidate] if os.path.isdir(candidate) else []
            paths += glob.glob(os.path.join(base, "*", app_name))
            for path in paths:
                found_without_version = True
                plist_path = os.path.join(path, "Contents", "Info.plist")
                if os.path.isfile(plist_path):
                    try:
                        with open(plist_path, "rb") as fh:
                            data = plistlib.load(fh)
                        ver = (data.get("CFBundleShortVersionString")
                               or data.get("CFBundleVersion"))
                        if ver:
                            return str(ver)
                    except Exception:
                        continue
    return INSTALLED_NO_VERSION if found_without_version else None


# ----------------------------------------------------------------------------
# Detection: Windows
# ----------------------------------------------------------------------------
def _iter_windows_uninstall_entries():
    import winreg
    roots = [
        (winreg.HKEY_LOCAL_MACHINE,
         r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
         winreg.KEY_WOW64_64KEY),
        (winreg.HKEY_LOCAL_MACHINE,
         r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
         winreg.KEY_WOW64_32KEY),
        (winreg.HKEY_CURRENT_USER,
         r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
         0),
    ]
    for hive, path, access in roots:
        try:
            key = winreg.OpenKey(hive, path, 0, winreg.KEY_READ | access)
        except OSError:
            continue
        try:
            count = winreg.QueryInfoKey(key)[0]
            for i in range(count):
                try:
                    sub_name = winreg.EnumKey(key, i)
                    sub = winreg.OpenKey(key, sub_name)
                    try:
                        name = winreg.QueryValueEx(sub, "DisplayName")[0]
                    except OSError:
                        continue
                    try:
                        ver = winreg.QueryValueEx(sub, "DisplayVersion")[0]
                    except OSError:
                        ver = ""
                    yield name, ver
                except OSError:
                    continue
                finally:
                    try:
                        winreg.CloseKey(sub)
                    except Exception:
                        pass
        finally:
            winreg.CloseKey(key)


def detect_windows(entry, installed_cache):
    """Return (version, matched_display_name) or (None, None)."""
    matches = entry.get("win_match", [])
    for name, ver in installed_cache:
        low = name.lower()
        for m in matches:
            if m.lower() in low:
                return ver or "installed (unknown version)", name
    return None, None


# ----------------------------------------------------------------------------
# Edition + catch-all helpers
# ----------------------------------------------------------------------------
def davinci_edition(win_cache, mac_hit_path=None):
    """Best-effort 'Studio' / 'Free' for DaVinci Resolve. Reliable on Windows
    (the installed name says 'Studio'); on macOS both editions share one app
    bundle, so we only label it if a Studio marker is present."""
    if IS_WINDOWS:
        for name, _ in win_cache:
            if "davinci resolve studio" in name.lower():
                return "Studio"
        for name, _ in win_cache:
            if "davinci resolve" in name.lower():
                return "Free"
    elif IS_MAC:
        # Studio ships a licensing bundle; if present, call it Studio.
        studio_markers = [
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/.license",
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Resolve.dmeupgrade",
        ]
        for m in studio_markers:
            if os.path.exists(m):
                return "Studio"
    return None


def _mac_app_search_roots():
    """Every folder a Blackmagic .app might sit in.

    /Applications and ~/Applications, plus one folder deeper in each, because
    some Blackmagic installers group their utilities in a subfolder rather than
    dropping them at the top level.
    """
    roots = []
    for base in ("/Applications", os.path.expanduser("~/Applications")):
        if not os.path.isdir(base):
            continue
        roots.append(base)
        try:
            for name in sorted(os.listdir(base)):
                sub = os.path.join(base, name)
                if not name.endswith(".app") and os.path.isdir(sub):
                    roots.append(sub)
        except OSError:
            continue
    return roots


def _all_installed_bm_apps_mac():
    """List (app_name, version, path) for every Blackmagic-looking .app.

    Searches the same depth detect_mac() does. These two used to disagree:
    detect_mac() globbed one folder down but this listed only the top level, so
    an app in a subfolder could be version-checked and still never appear in the
    "found but not in the catalog" catch-all.
    """
    import plistlib
    found = []
    seen = set()
    for base in _mac_app_search_roots():
        try:
            names = os.listdir(base)
        except OSError:
            continue
        for name in names:
            if not name.endswith(".app"):
                continue
            low = name.lower()
            if not any(h in low for h in BM_NAME_HINTS):
                continue
            path = os.path.join(base, name)
            if path in seen:
                continue
            seen.add(path)
            plist_path = os.path.join(path, "Contents", "Info.plist")
            ver = "-"
            try:
                with open(plist_path, "rb") as fh:
                    data = plistlib.load(fh)
                ver = str(data.get("CFBundleShortVersionString")
                          or data.get("CFBundleVersion") or "-")
            except Exception:
                pass
            found.append((name, ver, path))
    return found


def find_unknown_products(catalog, win_cache):
    """Blackmagic apps installed on this machine that the catalog doesn't cover."""
    unknown = []
    if IS_WINDOWS:
        known_fragments = []
        for entry in catalog.get("products", []):
            known_fragments += [m.lower() for m in entry.get("win_match", [])]
        for name, ver in win_cache:
            low = name.lower()
            if not any(h in low for h in BM_NAME_HINTS):
                continue
            if any(f in low for f in known_fragments):
                continue
            unknown.append({"name": name, "installed": ver or "-"})
    elif IS_MAC:
        known_apps = set()
        for entry in catalog.get("products", []):
            for a in entry.get("mac_app", []):
                known_apps.add(a.lower())
        for name, ver, _ in _all_installed_bm_apps_mac():
            if name.lower() in known_apps:
                continue
            unknown.append({"name": name, "installed": ver})
    return unknown


# ----------------------------------------------------------------------------
# Scan
# ----------------------------------------------------------------------------
def scan(catalog):
    results = []
    win_cache = list(_iter_windows_uninstall_entries()) if IS_WINDOWS else []
    for entry in catalog.get("products", []):
        if IS_WINDOWS:
            installed, _matched = detect_windows(entry, win_cache)
        elif IS_MAC:
            installed = detect_mac(entry)
        else:
            installed = None

        # DaVinci Resolve edition label (Free / Studio) when we can tell.
        if installed is not None and entry.get("id") == "davinci_resolve":
            edition = davinci_edition(win_cache)
            if edition:
                installed = "%s (%s)" % (installed, edition)

        latest = latest_for_os(entry)
        status = "not_installed" if installed is None else compare_versions(installed, latest)
        verified = entry.get("verified", True)
        latest_display = latest or "?"
        if latest and not verified:
            latest_display = latest + " ?"
        results.append({
            "name": entry.get("name", entry.get("id", "?")),
            "family": entry.get("family", ""),
            "installed": installed or "-",
            "latest": latest_display,
            "status": status,
            "verified": verified,
            "beta": entry.get("latest_beta", ""),
            "notes": entry.get("notes", ""),
            "latest_date": entry.get("latest_date", ""),
            "url": entry.get("url", SUPPORT_URL),
        })

    # Catch-all: Blackmagic apps on this machine that the catalog doesn't list.
    for u in find_unknown_products(catalog, win_cache):
        results.append({
            "name": u["name"],
            "family": "Other (not in catalog)",
            "installed": u["installed"],
            "latest": "?",
            "status": "unknown",
            "verified": False,
            "beta": "",
            "notes": "Found on this machine but not tracked by the catalog. "
                     "Check the Blackmagic support site for the current version.",
            "latest_date": "",
            "url": SUPPORT_URL,
        })
    return results


STATUS_LABEL = {
    "up_to_date": "Up to date",
    "update_available": "Update available",
    "not_installed": "Not installed",
    "unknown": "Unverified",
}


# ----------------------------------------------------------------------------
# Catalog loading (remote first, bundled fallback)
# ----------------------------------------------------------------------------
def _bundled_catalog_path():
    if getattr(sys, "frozen", False):
        base = os.path.dirname(sys.executable)
        # PyInstaller onefile unpacks data to _MEIPASS
        base = getattr(sys, "_MEIPASS", base)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "catalog.json")


def load_catalog():
    """Return (catalog_dict, source_label)."""
    if CATALOG_URL:
        try:
            req = urllib.request.Request(CATALOG_URL, headers={"User-Agent": "BMDUpdateChecker"})
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            return data, "online"
        except Exception:
            pass  # fall through to bundled
    with open(_bundled_catalog_path(), "r", encoding="utf-8") as fh:
        return json.load(fh), "bundled"


# ----------------------------------------------------------------------------
# Self-update
# ----------------------------------------------------------------------------
class UpdateError(Exception):
    """Anything that stops an update, with a message worth showing the user."""


def update_target():
    """Key into version.json's 'assets' for this machine, or None if unsupported."""
    if IS_WINDOWS:
        return "windows"
    if IS_MAC:
        return "macos-arm64" if platform.machine() == "arm64" else "macos-x86_64"
    return None


def installed_app_path():
    """Path this app would replace when updating.

    macOS: the .app bundle. Windows: the .exe. None when running from source,
    because there is no packaged app to swap.
    """
    if not getattr(sys, "frozen", False):
        return None
    exe = os.path.realpath(sys.executable)
    if IS_MAC:
        path = exe
        while path not in ("/", ""):
            if path.endswith(".app"):
                return path
            path = os.path.dirname(path)
        return None
    return exe


def fetch_update_manifest(url=VERSION_MANIFEST_URL):
    req = urllib.request.Request(
        url, headers={"User-Agent": "BMDUpdateChecker/%s" % APP_VERSION})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def available_update(catalog=None):
    """Describe a newer build for this machine, or return None.

    Prefers version.json on the GitHub release, which carries a downloadable
    asset. Falls back to the catalog's 'app' block, which knows the version but
    has no asset — that path can only send the user to the download page.
    """
    try:
        manifest = fetch_update_manifest()
    except Exception:
        manifest = None

    if manifest:
        version = str(manifest.get("version", ""))
        if compare_versions(APP_VERSION, version) == "update_available":
            asset = (manifest.get("assets") or {}).get(update_target() or "") or {}
            return {
                "version": version,
                "url": asset.get("url", ""),
                "sha256": asset.get("sha256", ""),
                "notes": manifest.get("notes", ""),
                "installable": bool(asset.get("url")) and installed_app_path() is not None,
                "page_url": manifest.get("page_url", ""),
            }
        return None

    app_info = (catalog or {}).get("app") or {}
    version = str(app_info.get("version", ""))
    if compare_versions(APP_VERSION, version) == "update_available":
        return {
            "version": version, "url": "", "sha256": "", "notes": "",
            "installable": False, "page_url": app_info.get("download_url", ""),
        }
    return None


def _check_download_host(url):
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if urllib.parse.urlparse(url).scheme != "https" or host not in ALLOWED_DOWNLOAD_HOSTS:
        raise UpdateError("Refusing to download the update from an unexpected "
                          "address:\n%s" % url)


def download_update(url, sha256, dest_dir, progress=None):
    """Download the update zip and verify its hash. Returns the file path."""
    _check_download_host(url)
    req = urllib.request.Request(
        url, headers={"User-Agent": "BMDUpdateChecker/%s" % APP_VERSION})
    zip_path = os.path.join(dest_dir, "update.zip")
    digest = hashlib.sha256()
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as resp:
        _check_download_host(resp.geturl())  # a redirect must stay on an allowed host
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        with open(zip_path, "wb") as fh:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                fh.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if progress:
                    progress(done, total)
    if sha256 and digest.hexdigest().lower() != sha256.lower():
        raise UpdateError("The downloaded update didn't match its checksum, so it "
                          "was discarded. Try again, or download it from the site.")
    return zip_path


def _extract(zip_path, into):
    """Unpack the update. ditto on macOS so bundle metadata survives."""
    if IS_MAC:
        subprocess.check_call(["/usr/bin/ditto", "-x", "-k", zip_path, into])
    else:
        import zipfile
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(into)


def _staged_payload(stage_dir):
    """Find the .app (macOS) or .exe (Windows) inside the extracted update."""
    want = ".app" if IS_MAC else ".exe"
    for root, dirs, files in os.walk(stage_dir):
        if IS_MAC:
            for d in dirs:
                if d.endswith(want):
                    return os.path.join(root, d)
        for f in files:
            if f.lower().endswith(want):
                return os.path.join(root, f)
        if IS_MAC and root.count(os.sep) - stage_dir.count(os.sep) > 3:
            break
    return None


MAC_SWAP_SCRIPT = """#!/bin/sh
# Wait for the running app to quit, swap the bundle, relaunch. The old bundle is
# kept aside until the copy succeeds so a failure can't leave the Mac appless.
while kill -0 %(pid)d 2>/dev/null; do sleep 0.3; done
sleep 0.5
BACKUP="%(target)s.old-$$"
if ! /bin/mv "%(target)s" "$BACKUP"; then
  /usr/bin/open "%(target)s"
  exit 1
fi
if /usr/bin/ditto "%(new)s" "%(target)s"; then
  /bin/rm -rf "$BACKUP"
  /usr/bin/xattr -dr com.apple.quarantine "%(target)s" 2>/dev/null
else
  /bin/rm -rf "%(target)s"
  /bin/mv "$BACKUP" "%(target)s"
fi
/usr/bin/open "%(target)s"
/bin/rm -rf "%(stage)s"
"""

WIN_SWAP_SCRIPT = """@echo off
:wait
tasklist /FI "PID eq %(pid)d" 2>nul | find "%(pid)d" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait
)
move /Y "%(new)s" "%(target)s" >nul
start "" "%(target)s"
rmdir /S /Q "%(stage)s"
"""


def apply_update(zip_path, stage_dir):
    """Swap in the downloaded build and relaunch. Does not return on success."""
    target = installed_app_path()
    if not target:
        raise UpdateError("This copy is running from source, so there's no "
                          "installed app to replace.")
    extract_dir = os.path.join(stage_dir, "new")
    os.makedirs(extract_dir, exist_ok=True)
    _extract(zip_path, extract_dir)
    new_payload = _staged_payload(extract_dir)
    if not new_payload:
        raise UpdateError("The downloaded update didn't contain an app where one "
                          "was expected.")

    parent = os.path.dirname(target.rstrip(os.sep))
    if not os.access(parent, os.W_OK) or not os.access(target, os.W_OK):
        raise UpdateError(
            "No permission to replace:\n%s\n\nMove the app somewhere you can "
            "write to, or install the update manually from the download page."
            % target)

    fields = {"pid": os.getpid(), "target": target, "new": new_payload,
              "stage": stage_dir}
    if IS_MAC:
        script = os.path.join(stage_dir, "swap.sh")
        with open(script, "w", encoding="utf-8") as fh:
            fh.write(MAC_SWAP_SCRIPT % fields)
        os.chmod(script, 0o755)
        subprocess.Popen(["/bin/sh", script], start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        script = os.path.join(stage_dir, "swap.cmd")
        with open(script, "w", encoding="utf-8") as fh:
            fh.write(WIN_SWAP_SCRIPT % fields)
        subprocess.Popen(["cmd", "/c", script],
                         creationflags=0x00000008 | 0x08000000)  # DETACHED | NO_WINDOW


def install_update(info, progress=None):
    """Download, verify, and hand off to the swap helper. Caller should quit."""
    if not info.get("url"):
        raise UpdateError("No downloadable build was published for this computer.")
    stage_dir = tempfile.mkdtemp(prefix="bmd-update-")
    try:
        zip_path = download_update(info["url"], info.get("sha256", ""),
                                   stage_dir, progress=progress)
        apply_update(zip_path, stage_dir)
    except Exception:
        shutil.rmtree(stage_dir, ignore_errors=True)
        raise


# ----------------------------------------------------------------------------
# GUI
# ----------------------------------------------------------------------------
def run_gui():
    import tkinter as tk
    from tkinter import ttk, messagebox

    try:
        catalog, source = load_catalog()
    except Exception as e:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Blackmagic Update Checker",
                             "Could not load catalog.json.\n\n%s" % e)
        return

    state = {"catalog": catalog, "source": source}

    root = tk.Tk()
    root.title("Blackmagic Update Checker")
    root.geometry("900x560")
    root.minsize(820, 440)

    # --- ttk styling ---
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except Exception:
        pass
    style.configure("Treeview", rowheight=28, font=("Helvetica", 12))
    style.configure("Treeview.Heading", font=("Helvetica", 11, "bold"))

    # --- header ---
    header = ttk.Frame(root, padding=(16, 14, 16, 4))
    header.pack(fill="x")
    ttk.Label(header,
              text="Blackmagic software on this %s" % ("PC" if IS_WINDOWS else "Mac"),
              font=("Helvetica", 15, "bold")).pack(side="left")
    meta_var = tk.StringVar()
    ttk.Label(header, textvariable=meta_var,
              foreground="#888888", font=("Helvetica", 10)).pack(side="right")

    # --- app self-update notice (always asks first, never installs silently) ---
    app_notice = tk.Label(root, anchor="w", padx=16, pady=7, font=("Helvetica", 11),
                          bg="#eef2fb", fg="#1a3f8a", cursor="hand2")
    app_update = {"info": None}

    def do_install(info):
        """Download and swap in the new build, then quit so the helper can relaunch."""
        prog = tk.Toplevel(root)
        prog.title("Updating")
        prog.resizable(False, False)
        prog.transient(root)
        tk.Label(prog, text="Downloading Update Checker v%s..." % info["version"],
                 padx=20, pady=(16, 6)).pack()
        bar = ttk.Progressbar(prog, length=320, mode="determinate", maximum=100)
        bar.pack(padx=20, pady=(0, 16))
        prog.update()

        def on_progress(done, total):
            bar.config(mode="determinate" if total else "indeterminate")
            if total:
                bar["value"] = done * 100.0 / total
            prog.update()

        try:
            install_update(info, progress=on_progress)
        except UpdateError as e:
            prog.destroy()
            messagebox.showerror("Update failed", str(e))
            return
        except Exception as e:
            prog.destroy()
            messagebox.showerror("Update failed",
                                 "Could not install the update:\n%s" % e)
            return
        prog.destroy()
        root.destroy()  # the helper waits for us to exit, then relaunches

    def open_app_update(_e=None):
        info = app_update["info"]
        if not info:
            return
        if not info.get("installable"):
            if info.get("page_url"):
                webbrowser.open(info["page_url"])
            return
        detail_text = "\n\n%s" % info["notes"] if info.get("notes") else ""
        if messagebox.askyesno(
                "Update Update Checker",
                "Version %s is available. You're on %s.%s\n\n"
                "Download and install it now? The app will restart when it's done."
                % (info["version"], APP_VERSION, detail_text)):
            do_install(info)

    app_notice.bind("<Button-1>", open_app_update)

    def check_for_updates(announce_when_current=False):
        """Look for a newer Update Checker. Runs off the UI thread so a slow or
        unreachable network never freezes the window."""
        import threading

        def show(info):
            app_update["info"] = info
            if not info:
                app_notice.pack_forget()
                if announce_when_current:
                    messagebox.showinfo(
                        "Blackmagic Update Checker",
                        "You're on the latest version (v%s)." % APP_VERSION)
                return
            if info.get("installable"):
                text = ("  ↑  Update Checker v%s is available. Click here to "
                        "install it." % info["version"])
            else:
                text = ("  ↑  Update Checker v%s is available. Click here to open "
                        "the download page." % info["version"])
            app_notice.config(text=text)
            app_notice.pack(fill="x", padx=16, pady=(4, 0), before=banner)

        def work():
            try:
                info = available_update(state.get("catalog"))
            except Exception:
                info = None
            root.after(0, lambda: show(info))

        threading.Thread(target=work, daemon=True).start()

    # --- banner ---
    banner = tk.Label(root, anchor="w", padx=16, pady=8, font=("Helvetica", 12))
    banner.pack(fill="x", padx=16, pady=(4, 8))

    # --- table ---
    table_wrap = ttk.Frame(root)
    table_wrap.pack(fill="both", expand=True, padx=16, pady=(0, 8))
    cols = ("product", "family", "installed", "latest", "status")
    tree = ttk.Treeview(table_wrap, columns=cols, show="headings")
    for c, t, w, anchor in (
        ("product", "Product", 260, "w"),
        ("family", "Family", 180, "w"),
        ("installed", "Installed", 100, "center"),
        ("latest", "Latest", 100, "center"),
        ("status", "Status", 210, "w"),
    ):
        tree.heading(c, text=t)
        tree.column(c, width=w, anchor=anchor)
    vsb = ttk.Scrollbar(table_wrap, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=vsb.set)
    tree.pack(side="left", fill="both", expand=True)
    vsb.pack(side="right", fill="y")

    tree.tag_configure("update_available", background="#fbeaea", foreground="#a32d2d")
    tree.tag_configure("up_to_date", foreground="#1a7f37")
    tree.tag_configure("not_installed", foreground="#999999")
    tree.tag_configure("unknown", foreground="#8a5a00")
    tree.tag_configure("odd", background="#f6f5f2")

    # --- "what's new" detail pane ---
    detail_wrap = ttk.Frame(root, padding=(16, 0, 16, 4))
    detail_wrap.pack(fill="x")
    ttk.Label(detail_wrap, text="What's new", font=("Helvetica", 10, "bold"),
              foreground="#555555").pack(anchor="w")
    detail = tk.Label(detail_wrap, anchor="w", justify="left", wraplength=840,
                      fg="#333333", font=("Helvetica", 11),
                      text="Select a product to see what changed in its latest release.")
    detail.pack(anchor="w", fill="x", pady=(2, 0))

    row_urls = {}
    row_notes = {}

    def refresh(reload_remote=False):
        if reload_remote:
            try:
                state["catalog"], state["source"] = load_catalog()
            except Exception as e:
                messagebox.showwarning("Blackmagic Update Checker",
                                       "Could not reload catalog:\n%s" % e)
        for item in tree.get_children():
            tree.delete(item)
        row_urls.clear()
        row_notes.clear()
        results = scan(state["catalog"])
        updates = 0
        for idx, r in enumerate(results):
            tags = [r["status"]]
            if r["status"] not in ("update_available",) and idx % 2:
                tags.append("odd")
            status_text = STATUS_LABEL.get(r["status"], r["status"])
            if r.get("beta") and r["status"] in ("up_to_date", "not_installed"):
                status_text += "  · beta: %s" % r["beta"]
            iid = tree.insert("", "end", values=(
                r["name"], r.get("family", ""), r["installed"],
                r["latest"], status_text,
            ), tags=tuple(tags))
            row_urls[iid] = r["url"]
            note = r.get("notes", "")
            if r.get("latest_date"):
                note = ("Latest release %s. " % r["latest_date"]) + note if note else \
                       ("Latest release %s." % r["latest_date"])
            row_notes[iid] = note or "No release notes for this product."
            if r["status"] == "update_available":
                updates += 1

        updated = state["catalog"].get("_updated", "?")
        src = "online catalog" if state["source"] == "online" else "bundled catalog"
        meta_var.set("%s  •  updated %s" % (src, updated))

        if updates:
            banner.config(
                text="  ⚠  %d update%s available. Select a row and click "
                     "'Open Download Page'." % (updates, "" if updates == 1 else "s"),
                bg="#fbeaea", fg="#a32d2d")
        else:
            banner.config(text="  ✓  Everything installed is up to date.",
                          bg="#eaf3ea", fg="#1a7f37")

        # App self-update notice. Checked in the background; see check_for_updates.
        check_for_updates()

    def open_selected():
        sel = tree.selection()
        if not sel:
            messagebox.showinfo("Blackmagic Update Checker", "Select a product row first.")
            return
        webbrowser.open(row_urls.get(sel[0], SUPPORT_URL))

    def show_about():
        messagebox.showinfo(
            "About",
            "Blackmagic Update Checker  v%s\n\n"
            "Scans this computer for Blackmagic Design software and compares "
            "each version against the latest published release.\n\n"
            "Version data: %s catalog.\n"
            "Downloads open on blackmagicdesign.com (registration required there)."
            % (APP_VERSION, "online" if state["source"] == "online" else "bundled"))

    def on_select(_e=None):
        sel = tree.selection()
        if sel:
            detail.config(text=row_notes.get(sel[0], ""))

    tree.bind("<<TreeviewSelect>>", on_select)
    tree.bind("<Double-1>", lambda e: open_selected())

    # --- menu bar ---
    menubar = tk.Menu(root)
    filemenu = tk.Menu(menubar, tearoff=0)
    filemenu.add_command(label="Reload catalog from web",
                         command=lambda: refresh(reload_remote=True))
    filemenu.add_separator()
    filemenu.add_command(label="Quit", command=root.destroy)
    menubar.add_cascade(label="File", menu=filemenu)
    helpmenu = tk.Menu(menubar, tearoff=0)
    helpmenu.add_command(label="Check for Updates...",
                         command=lambda: check_for_updates(announce_when_current=True))
    helpmenu.add_separator()
    helpmenu.add_command(label="About", command=show_about)
    menubar.add_cascade(label="Help", menu=helpmenu)
    root.config(menu=menubar)

    # --- buttons ---
    btns = ttk.Frame(root, padding=(16, 8, 16, 12))
    btns.pack(fill="x")
    ttk.Button(btns, text="Re-scan", command=refresh).pack(side="left")
    ttk.Button(btns, text="Open Download Page",
               command=open_selected).pack(side="left", padx=(8, 0))
    ttk.Button(btns, text="Support Site",
               command=lambda: webbrowser.open(SUPPORT_URL)).pack(side="left", padx=(8, 0))
    ttk.Button(btns, text="Quit", command=root.destroy).pack(side="right")

    root.after(80, refresh)
    root.mainloop()


def run_cli():
    catalog, source = load_catalog()
    results = scan(catalog)
    print("\nBlackmagic Design software on this %s  (%s catalog, updated %s)\n" %
          ("PC" if IS_WINDOWS else "Mac" if IS_MAC else "computer",
           source, catalog.get("_updated", "?")))
    fmt = "%-42s %-13s %-13s %s"
    print(fmt % ("Product", "Installed", "Latest", "Status"))
    print("-" * 92)
    for r in results:
        status_text = STATUS_LABEL.get(r["status"], r["status"])
        if r.get("beta") and r["status"] in ("up_to_date", "not_installed"):
            status_text += " (beta: %s)" % r["beta"]
        print(fmt % (r["name"][:41], r["installed"], r["latest"], status_text))
    print("\n('?' next to a Latest version = not yet verified; confirm on the support site.)\n")
    for r in results:
        if r["status"] == "update_available":
            print("Update %s:  %s" % (r["name"], r["url"]))
            if r.get("notes"):
                print("   What's new: %s" % r["notes"])
    info = available_update(catalog)
    if info:
        print("\nA newer Update Checker (v%s) is available." % info["version"])
        if info.get("installable"):
            print("   Install it with:  %s --self-update" % os.path.basename(sys.argv[0]))
        elif info.get("page_url"):
            print("   Download: %s" % info["page_url"])


def run_self_update():
    """Non-interactive update, for the --self-update flag."""
    info = available_update()
    if not info:
        print("Already on the latest version (v%s)." % APP_VERSION)
        return 0
    if not info.get("installable"):
        print("Update v%s is available but can't be installed automatically here.\n"
              "Download it from: %s" % (info["version"], info.get("page_url") or RELEASE_BASE))
        return 1
    print("Updating %s -> %s ..." % (APP_VERSION, info["version"]))

    def progress(done, total):
        if total:
            sys.stdout.write("\r  %3d%%" % (done * 100 // total))
            sys.stdout.flush()

    try:
        install_update(info, progress=progress)
    except UpdateError as e:
        print("\nUpdate failed: %s" % e)
        return 1
    print("\nInstalling. The app will relaunch on its own.")
    return 0


if __name__ == "__main__":
    if "--self-update" in sys.argv:
        sys.exit(run_self_update())
    elif "--cli" in sys.argv:
        run_cli()
    else:
        try:
            run_gui()
        except Exception as e:
            print("GUI unavailable (%s). Falling back to text mode.\n" % e)
            run_cli()
