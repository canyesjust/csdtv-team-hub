// Pulls commercials straight from the CSDtv hub into the local ads folder, so
// the operator never has to download and move files by hand. This is the manual
// version of the future auto-sync runner: it authenticates with the shared page
// password, lists commercials, and downloads them to disk via short-lived signed
// URLs. Files are written to a temp name and renamed into place so OBS never sees
// a half-written file.

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const MEDIA_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

export class HubSync extends EventEmitter {
  constructor(cfg, rotator) {
    super();
    this.cfg = cfg;
    this.rotator = rotator;
    this.busy = false;
    this.last = null;  // { at, downloaded, skipped, failed } or { at, error }
    this.check = null; // { at, localCount, hubCount, missing } or { at, error }
  }

  // Count commercial files currently on disk.
  localCount() {
    try {
      return fs.readdirSync(this.cfg.adFolder)
        .filter(f => MEDIA_EXTS.has(path.extname(f).toLowerCase())).length;
    } catch { return 0; }
  }

  hasPassword() {
    return String(this.password() || '').length > 0;
  }

  // Compare the local ads folder against the hub without downloading anything.
  async checkHub() {
    if (!this.hasPassword()) {
      this.check = { at: Date.now(), needsPassword: true, localCount: this.localCount() };
      return this.check;
    }
    try {
      const cookie = await this.authCookie();
      const assets = await this.listCommercials(cookie);
      let local = [];
      try { local = fs.readdirSync(this.cfg.adFolder); } catch { local = []; }
      const localSet = new Set(local);
      const missing = assets.filter(a => !localSet.has(path.basename(a.filename || ''))).length;
      this.check = { at: Date.now(), localCount: this.localCount(), hubCount: assets.length, missing };
    } catch (err) {
      this.check = { at: Date.now(), error: err.message };
    }
    return this.check;
  }

  base() {
    return String(this.cfg.hubBaseUrl || 'https://www.csdtvstaff.org').replace(/\/$/, '');
  }

  // The hub page password. Justin uses the same value as the OBS WebSocket
  // password, so fall back to that if hubPassword isn't set separately.
  password() {
    return this.cfg.hubPassword || (this.cfg.obs && this.cfg.obs.password) || '';
  }

  // Unlock the gate and return the Cookie header to reuse. Empty string means the
  // hub gate is off and no cookie is needed.
  async authCookie() {
    let res;
    try {
      res = await fetch(this.base() + '/api/obs/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.password() }),
      });
    } catch {
      throw new Error('Could not reach the hub. Check the internet connection.');
    }
    if (res.status === 503) return ''; // gate disabled, page is open
    if (res.status === 401) throw new Error('Hub password rejected. Check the password in config.json.');
    if (!res.ok) throw new Error('Hub login failed (HTTP ' + res.status + ').');
    const setCookie = res.headers.get('set-cookie') || '';
    const m = setCookie.match(/csd_obs_access=([^;]+)/);
    if (!m) throw new Error('Hub did not return an access cookie.');
    return 'csd_obs_access=' + m[1];
  }

  async listCommercials(cookie) {
    const res = await fetch(this.base() + '/api/obs/assets?category=commercial', {
      headers: cookie ? { Cookie: cookie } : {},
    });
    if (!res.ok) throw new Error('Could not list commercials (HTTP ' + res.status + ').');
    const d = await res.json().catch(() => ({}));
    const assets = Array.isArray(d.assets) ? d.assets : [];
    this.writeNames(assets);
    return assets;
  }

  // Save the hub's display names keyed by filename, so the panel and "on air"
  // can show the name you set on the hub instead of the raw filename.
  writeNames(assets) {
    try {
      const map = {};
      for (const a of assets) {
        if (a && a.filename && a.name) map[path.basename(a.filename)] = a.name;
      }
      const p = path.join(path.dirname(this.cfg.adFolder), 'names.json');
      fs.writeFileSync(p, JSON.stringify(map, null, 2));
    } catch { /* names are a nicety; ignore write failures */ }
  }

  // Keep the local ads folder mirroring the hub's ACTIVE commercials. Files this
  // controller downloaded that are no longer active (turned off or deleted on the
  // hub) get removed, except one that's currently on air.
  pruneInactive(active) {
    const activeNames = new Set(active.map(a => path.basename(a.filename || (a.id + '.mp4'))));
    const managedPath = path.join(path.dirname(this.cfg.adFolder), 'managed.json');
    let managed = [];
    try { managed = JSON.parse(fs.readFileSync(managedPath, 'utf8')) || []; } catch { managed = []; }
    const set = new Set(managed);
    for (const n of activeNames) set.add(n);
    const nowPlaying = this.rotator && this.rotator.nowPlaying;
    for (const name of [...set]) {
      if (activeNames.has(name)) continue;
      if (name === nowPlaying) continue; // never delete what's on air
      const p = path.resolve(this.cfg.adFolder, name);
      try { if (fs.existsSync(p)) { fs.unlinkSync(p); this.emit('log', 'Removed inactive: ' + name); } } catch { /* ignore */ }
      set.delete(name);
    }
    try { fs.writeFileSync(managedPath, JSON.stringify([...set], null, 2)); } catch { /* ignore */ }
  }

  // Pull the hub's Starting Soon video into the preshow folder. The newest one on
  // the hub wins, and any other local pre-show video is removed so a change on the
  // hub replaces it on every machine.
  async syncStartingSoon(cookie, mode) {
    let list;
    try {
      const res = await fetch(this.base() + '/api/obs/assets?category=starting_soon', {
        headers: cookie ? { Cookie: cookie } : {},
      });
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      list = Array.isArray(d.assets) ? d.assets : [];
    } catch { return; }
    if (!list.length) return; // hub has none; leave any local pre-show alone

    const a = list[0]; // list is newest-first
    const safeName = path.basename(a.filename || (a.id + '.mp4'));
    const VIDS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
    try {
      fs.mkdirSync(this.cfg.preshowFolder, { recursive: true });
      const dest = path.resolve(this.cfg.preshowFolder, safeName);
      if (mode === 'all' || !fs.existsSync(dest)) {
        const url = await this.signedUrl(cookie, a.id);
        const r = await fetch(url);
        if (r.ok) {
          const buf = Buffer.from(await r.arrayBuffer());
          const tmp = dest + '.part';
          fs.writeFileSync(tmp, buf);
          fs.renameSync(tmp, dest);
          this.emit('log', 'Starting Soon updated: ' + safeName);
        }
      }
      // Remove other pre-show videos so only the current hub one is used.
      for (const f of fs.readdirSync(this.cfg.preshowFolder)) {
        if (f !== safeName && VIDS.has(path.extname(f).toLowerCase())) {
          try { fs.unlinkSync(path.resolve(this.cfg.preshowFolder, f)); } catch { /* ignore */ }
        }
      }
    } catch (err) {
      this.emit('log', 'Starting Soon sync failed: ' + err.message);
    }
  }

  async signedUrl(cookie, id) {
    const res = await fetch(this.base() + '/api/obs/assets/' + id + '/download', {
      headers: cookie ? { Cookie: cookie } : {},
    });
    if (!res.ok) throw new Error('no download link (HTTP ' + res.status + ')');
    const d = await res.json().catch(() => ({}));
    if (!d.url) throw new Error('no download link');
    return d.url;
  }

  // mode: 'all' re-downloads everything, 'missing' only fetches files not already
  // present in the ads folder.
  async run(mode) {
    if (this.busy) return { ok: false, error: 'A sync is already running.' };
    if (!this.hasPassword()) {
      this.emit('log', 'Set the shared password in Settings to enable hub downloads.');
      this.check = { at: Date.now(), needsPassword: true, localCount: this.localCount() };
      return { ok: false, needsPassword: true };
    }
    this.busy = true;
    this.emit('log', `Hub sync started (${mode === 'all' ? 'download all' : 'download missing'})`);
    let downloaded = 0, skipped = 0, failed = 0;
    try {
      fs.mkdirSync(this.cfg.adFolder, { recursive: true });
      const cookie = await this.authCookie();
      const assets = await this.listCommercials(cookie);
      const active = assets.filter(a => a.enabled !== false);
      if (active.length === 0) this.emit('log', 'Hub has no active commercials.');

      for (const a of active) {
        const safeName = path.basename(a.filename || (a.id + '.mp4'));
        const dest = path.resolve(this.cfg.adFolder, safeName);
        if (mode === 'missing' && fs.existsSync(dest)) { skipped++; continue; }
        try {
          const url = await this.signedUrl(cookie, a.id);
          const r = await fetch(url);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer());
          const tmp = dest + '.part';
          fs.writeFileSync(tmp, buf);
          fs.renameSync(tmp, dest); // atomic: OBS never sees a partial file
          downloaded++;
          this.emit('log', 'Downloaded ' + safeName);
        } catch (err) {
          failed++;
          this.emit('log', 'Failed ' + safeName + ': ' + err.message);
        }
      }

      // Remove local commercials the hub turned inactive or deleted.
      this.pruneInactive(active);

      // Also pull the hub's Starting Soon video into the preshow folder, so the
      // pre-show is managed centrally and changes everywhere.
      await this.syncStartingSoon(cookie, mode);

      this.rotator.reload();
      const summary = { at: Date.now(), downloaded, skipped, failed };
      this.last = summary;
      // Refresh the local-vs-hub snapshot so the panel updates.
      this.check = { at: Date.now(), localCount: this.localCount(), hubCount: assets.length, missing: 0 };
      this.emit('log', `Sync done — ${downloaded} downloaded, ${skipped} already had, ${failed} failed`);
      return { ok: true, ...summary };
    } catch (err) {
      this.last = { at: Date.now(), error: err.message };
      this.emit('log', 'Sync failed: ' + err.message);
      return { ok: false, error: err.message };
    } finally {
      this.busy = false;
    }
  }

  status() {
    return { busy: this.busy, last: this.last, check: this.check, localCount: this.localCount() };
  }
}
