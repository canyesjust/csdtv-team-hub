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

import json
import os
import platform
import re
import sys
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
)

SUPPORT_URL = "https://www.blackmagicdesign.com/support/"

# Live catalog endpoint. Served by the CSD TV Team Hub, which pulls Blackmagic's
# own download feed and always returns current versions. Leave "" to use only the
# bundled catalog.json fallback.
CATALOG_URL = "https://www.csdtvstaff.org/api/catalog"
FETCH_TIMEOUT = 6  # seconds


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
    import plistlib
    app_names = entry.get("mac_app", [])
    search_dirs = ["/Applications", os.path.expanduser("~/Applications")]
    for app_name in app_names:
        for base in search_dirs:
            candidate = os.path.join(base, app_name)
            paths = [candidate] if os.path.isdir(candidate) else []
            paths += glob.glob(os.path.join(base, "*", app_name))
            for path in paths:
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
    return None


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


def _all_installed_bm_apps_mac():
    """List (app_name, version, path) for every Blackmagic-looking .app."""
    import plistlib
    found = []
    for base in ("/Applications", os.path.expanduser("~/Applications")):
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
            plist_path = os.path.join(base, name, "Contents", "Info.plist")
            ver = "-"
            try:
                with open(plist_path, "rb") as fh:
                    data = plistlib.load(fh)
                ver = str(data.get("CFBundleShortVersionString")
                          or data.get("CFBundleVersion") or "-")
            except Exception:
                pass
            found.append((name, ver, os.path.join(base, name)))
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

    # --- app self-update notice (notify only, never auto-installs) ---
    app_notice = tk.Label(root, anchor="w", padx=16, pady=7, font=("Helvetica", 11),
                          bg="#eef2fb", fg="#1a3f8a", cursor="hand2")
    app_dl = {"url": ""}

    def open_app_update(_e=None):
        if app_dl["url"]:
            webbrowser.open(app_dl["url"])

    app_notice.bind("<Button-1>", open_app_update)

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

        # App self-update notice: show only if the catalog reports a newer app.
        app_info = state["catalog"].get("app") or {}
        newer = compare_versions(APP_VERSION, app_info.get("version", ""))
        if newer == "update_available":
            app_dl["url"] = app_info.get("download_url", "")
            app_notice.config(
                text="  ↑  A newer Update Checker (v%s) is available. Click here to "
                     "download it when you're ready." % app_info.get("version", ""))
            app_notice.pack(fill="x", padx=16, pady=(4, 0), before=banner)
        else:
            app_notice.pack_forget()

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
    app_info = catalog.get("app") or {}
    if compare_versions(APP_VERSION, app_info.get("version", "")) == "update_available":
        print("\nA newer Update Checker (v%s) is available: %s"
              % (app_info.get("version", ""), app_info.get("download_url", "")))


if __name__ == "__main__":
    if "--cli" in sys.argv:
        run_cli()
    else:
        try:
            run_gui()
        except Exception as e:
            print("GUI unavailable (%s). Falling back to text mode.\n" % e)
            run_cli()
