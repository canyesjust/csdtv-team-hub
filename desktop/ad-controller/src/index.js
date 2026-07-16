// Entry point. Wires the OBS connection, the rotator module, and the web panel
// together. Add future modules (scheduler, graphics) right here.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ObsClient } from './obs.js';
import { Rotator } from './rotator.js';
import { HubSync } from './sync.js';
import { startServer } from './server.js';

// Config and media live in ONE fixed place under Application Support. macOS never
// gates Application Support (unlike Documents/Desktop/Downloads, which it blocks
// for unsigned apps), so the app works whether it's double-clicked, run from
// Applications, or run from the temporary copy macOS uses for unsigned apps.
const DATA_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'CSDtv Ad Controller');
const configPath = path.join(DATA_DIR, 'config.json');

const DEFAULT_CFG = {
  obs: { url: 'ws://127.0.0.1:4455', password: '' },
  hubBaseUrl: 'https://www.csdtvstaff.org',
  hubPassword: '',
  scene: 'Live',
  mediaSource: 'Commercials',
  imageSource: 'CommercialsImage',
  startingSoonSource: 'StartingSoon',
  minGapSec: 180,
  maxGapSec: 600,
  preshowMinGapSec: 60,
  preshowMaxGapSec: 120,
  imageDurationSec: 12,
  startingSoonVolumeDb: -30, // pre-show music tops out here (dB)
  duckFloorDb: -60,          // how far it ducks under an ad (dB)
  fadeDownMs: 1800,          // fade-out length when an ad starts
  fadeUpMs: 1400,            // fade-in length when the ad clears
  noRepeat: true,
  autoStart: false,
  autoSyncOnStart: true,
  autoSyncEveryMin: 0,
  panelPort: 4466,
};

fs.mkdirSync(DATA_DIR, { recursive: true });

let cfg;
if (fs.existsSync(configPath)) {
  const saved = JSON.parse(fs.readFileSync(configPath));
  cfg = { ...DEFAULT_CFG, ...saved, obs: { ...DEFAULT_CFG.obs, ...(saved.obs || {}) } };
} else {
  cfg = { ...DEFAULT_CFG };
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
}

// Media folders always live in the data dir, so they're easy to find and never
// depend on where the app sits.
cfg.adFolder = path.join(DATA_DIR, 'ads');
cfg.preshowFolder = path.join(DATA_DIR, 'preshow');
fs.mkdirSync(cfg.adFolder, { recursive: true });
fs.mkdirSync(cfg.preshowFolder, { recursive: true });

// Persist config changes made from the panel's Settings.
function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
}

// Simple shared log buffer the panel can read.
const buffer = [];
const log = {
  add(msg) {
    const line = { time: new Date().toLocaleTimeString(), msg };
    buffer.push(line);
    if (buffer.length > 100) buffer.shift();
    console.log(`[${line.time}] ${msg}`);
  },
  recent() {
    return buffer.slice(-30);
  },
};

const obs = new ObsClient(cfg);
obs.on('log', m => log.add(m));

const rotator = new Rotator(cfg, obs);
rotator.on('log', m => log.add(m));

const sync = new HubSync(cfg, rotator);
sync.on('log', m => log.add(m));

startServer(cfg, rotator, log, sync, saveConfig);

await obs.connect();
if (cfg.autoStart) rotator.setAuto(true);

// Keep the local ad folder current with the hub.
if (cfg.autoSyncOnStart !== false) {
  sync.run('missing');
} else {
  sync.checkHub(); // at least show how many are waiting
}
const everyMin = Number(cfg.autoSyncEveryMin || 0);
if (everyMin > 0) {
  setInterval(() => sync.run('missing'), everyMin * 60 * 1000);
}

// Keep the ad list current no matter how files arrive (download, manual drop, or
// rename). Quiet reload every few seconds; it only logs when something changes.
setInterval(() => rotator.reload(true), 4000);
