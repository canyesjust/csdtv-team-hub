// Serves the operator panel and exposes a small API. Pushes live status over a
// websocket so the panel updates every second. OBS loads this same URL as a
// Custom Browser Dock.

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startServer(cfg, rotator, log, sync, saveConfig) {
  const app = express();
  app.use(express.json());
  // Never cache the panel — operators load the same URL across controller updates,
  // and a stale cached page would show old data or miss features.
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, must-revalidate'),
  }));

  // Never send the actual password to the panel — only whether one is set.
  const settingsView = () => ({
    minGapSec: cfg.minGapSec, maxGapSec: cfg.maxGapSec,
    preshowMinGapSec: cfg.preshowMinGapSec, preshowMaxGapSec: cfg.preshowMaxGapSec,
    imageDurationSec: cfg.imageDurationSec,
    autoStart: cfg.autoStart, autoSyncOnStart: cfg.autoSyncOnStart !== false,
    scene: cfg.scene, hasPassword: String((cfg.obs && cfg.obs.password) || '').length > 0,
  });

  app.get('/api/status', (req, res) => {
    res.json({ status: rotator.status(), sync: sync ? sync.status() : null, settings: settingsView(), log: log.recent() });
  });

  // Pull commercials from the hub straight into the ads folder.
  // mode: 'all' re-downloads everything, 'missing' only fetches new files.
  app.post('/api/sync', async (req, res) => {
    if (!sync) return res.json({ ok: false, error: 'Sync not available' });
    const mode = req.body.mode === 'all' ? 'all' : 'missing';
    const result = await sync.run(mode);
    res.json(result);
  });

  // Check the hub without downloading (updates the status snapshot).
  app.post('/api/sync-check', async (req, res) => {
    if (!sync) return res.json({ ok: false });
    const c = await sync.checkHub();
    res.json({ ok: !c.error, check: c });
  });

  // Save operator settings to config.json and apply them live.
  app.post('/api/settings', (req, res) => {
    const b = req.body || {};
    const num = (v, lo, hi, dflt) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return dflt;
      return Math.min(hi, Math.max(lo, Math.round(n)));
    };
    if (b.minGapSec != null) cfg.minGapSec = num(b.minGapSec, 5, 7200, cfg.minGapSec);
    if (b.maxGapSec != null) cfg.maxGapSec = num(b.maxGapSec, 5, 7200, cfg.maxGapSec);
    if (b.preshowMinGapSec != null) cfg.preshowMinGapSec = num(b.preshowMinGapSec, 5, 3600, cfg.preshowMinGapSec);
    if (b.preshowMaxGapSec != null) cfg.preshowMaxGapSec = num(b.preshowMaxGapSec, 5, 3600, cfg.preshowMaxGapSec);
    if (b.imageDurationSec != null) cfg.imageDurationSec = num(b.imageDurationSec, 1, 600, cfg.imageDurationSec);
    if (b.autoStart != null) cfg.autoStart = Boolean(b.autoStart);
    if (b.autoSyncOnStart != null) cfg.autoSyncOnStart = Boolean(b.autoSyncOnStart);
    if (typeof b.scene === 'string' && b.scene.trim()) cfg.scene = b.scene.trim();
    // Password is the one shared value used for OBS and hub downloads. Only change
    // it when the operator actually typed something (empty = leave it as-is).
    if (typeof b.password === 'string' && b.password.length > 0) {
      cfg.obs = cfg.obs || {};
      cfg.obs.password = b.password;
    }
    try { if (saveConfig) saveConfig(); } catch { /* keep running even if the write fails */ }
    log.add('Settings saved');
    res.json({ ok: true, settings: settingsView() });
  });

  app.post('/api/play-now', async (req, res) => {
    await rotator.playNow();
    res.json({ ok: true });
  });

  app.post('/api/play-file', async (req, res) => {
    await rotator.playFile(String(req.body.file || ''));
    res.json({ ok: true });
  });

  app.post('/api/stop', async (req, res) => {
    await rotator.stop();
    res.json({ ok: true });
  });

  app.post('/api/preshow', async (req, res) => {
    if (req.body.on) await rotator.startPreshow();
    else await rotator.stopPreshow();
    res.json({ ok: true });
  });

  app.post('/api/toggle-auto', (req, res) => {
    rotator.setAuto(Boolean(req.body.enabled));
    res.json({ ok: true });
  });

  app.post('/api/reload', (req, res) => {
    rotator.reload();
    res.json({ ok: true });
  });

  // Reveal the ads or preshow folder in Finder (they live under Application Support).
  app.post('/api/reveal', (req, res) => {
    const dir = req.body.which === 'preshow' ? cfg.preshowFolder : cfg.adFolder;
    try { spawn('open', [dir], { detached: true }).unref(); } catch { /* ignore */ }
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  setInterval(() => {
    const payload = JSON.stringify({ status: rotator.status(), sync: sync ? sync.status() : null, settings: settingsView(), log: log.recent() });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }, 1000);

  // Handle a busy port gracefully instead of crashing the whole app. This
  // happens when another copy of the controller is already running on 4466.
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log.add(`Port ${cfg.panelPort} is already in use — another copy of the controller is probably running. Close the other one and reopen this app.`);
    } else {
      log.add('Server error: ' + (err && err.message ? err.message : String(err)));
    }
  });

  server.listen(cfg.panelPort, () => {
    log.add(`Operator panel at http://127.0.0.1:${cfg.panelPort}`);
  });
}
