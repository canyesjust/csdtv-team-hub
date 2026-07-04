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
    return Array.isArray(d.assets) ? d.assets : [];
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
      if (assets.length === 0) this.emit('log', 'Hub has no commercials to sync.');

      for (const a of assets) {
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
