// The ad rotator. Picks a file (video or image), plays it, waits a random gap,
// repeats. It also runs the "Starting Soon" pre-show: a looping hold video with
// ads sprinkled over it. This is the first "module." A scheduler or graphics
// module would sit next to it and reuse the same ObsClient.

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.flv', '.ts']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']);

export class Rotator extends EventEmitter {
  constructor(cfg, obs) {
    super();
    this.cfg = cfg;
    this.obs = obs;
    this.autoEnabled = false;  // normal random rotation
    this.preshow = false;      // Starting Soon pre-show running
    this.nowPlaying = null;
    this.nextAt = null;
    this.lastFile = null;
    this.timer = null;       // gap-to-next-ad timer
    this.imageTimer = null;  // how long an image stays up
    this.ads = [];           // [{ file, type: 'video' | 'image' }]
    this.preshowVideo = null;
    this.reload();
    obs.on('mediaEnded', () => this.onEnded());
  }

  reload() {
    const imagesOn = Boolean(this.cfg.imageSource);
    try {
      this.ads = fs.readdirSync(this.cfg.adFolder)
        .map(f => {
          const ext = path.extname(f).toLowerCase();
          if (VIDEO_EXTS.has(ext)) return { file: f, type: 'video' };
          if (imagesOn && IMAGE_EXTS.has(ext)) return { file: f, type: 'image' };
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.file.localeCompare(b.file));
    } catch {
      this.ads = [];
    }
    const vids = this.ads.filter(a => a.type === 'video').length;
    const imgs = this.ads.filter(a => a.type === 'image').length;
    this.emit('log', `Loaded ${this.ads.length} ad(s) from ${this.cfg.adFolder} (${vids} video, ${imgs} image)`);

    // Find the first video in the preshow folder to use as Starting Soon.
    this.preshowVideo = null;
    try {
      const f = fs.readdirSync(this.cfg.preshowFolder)
        .filter(n => VIDEO_EXTS.has(path.extname(n).toLowerCase()))
        .sort()[0];
      if (f) this.preshowVideo = path.resolve(this.cfg.preshowFolder, f);
    } catch { /* no preshow folder yet */ }
  }

  pick() {
    if (this.ads.length === 0) return null;
    if (this.ads.length === 1) {
      this.lastFile = this.ads[0].file;
      return this.ads[0];
    }
    let choice = this.ads[Math.floor(Math.random() * this.ads.length)];
    while (choice.file === this.lastFile) {
      choice = this.ads[Math.floor(Math.random() * this.ads.length)];
    }
    if (this.cfg.noRepeat) this.lastFile = choice.file;
    return choice;
  }

  // Play a specific file (video or image) on air now. Used by click-to-play.
  async playFile(fileName) {
    const ad = this.ads.find(a => a.file === fileName);
    if (!ad) {
      this.emit('log', 'File not found: ' + fileName);
      return;
    }
    await this._air(ad);
  }

  // Play a random ad now.
  async playNow() {
    const ad = this.pick();
    if (!ad) {
      this.emit('log', 'No ad files to play. Add files to the folder and reload.');
      return;
    }
    await this._air(ad);
  }

  // Shared playout for one ad.
  async _air(ad) {
    const full = path.resolve(this.cfg.adFolder, ad.file);
    clearTimeout(this.imageTimer);
    this.nowPlaying = ad.file;
    this.emit('log', 'Playing ' + ad.file);
    try {
      if (ad.type === 'image') {
        await this.obs.showImage(full);
        const secs = Math.max(1, this.cfg.imageDurationSec || 12);
        this.imageTimer = setTimeout(() => this.finishImage(), secs * 1000);
      } else {
        await this.obs.playVideo(full);
        // video hides itself via the mediaEnded event -> onEnded()
      }
    } catch (err) {
      this.nowPlaying = null;
      this.emit('log', 'Play failed: ' + err.message);
      if (this.rotating()) this.schedule();
    }
  }

  // An image's on-screen time is up. Hide it and behave like a finished ad.
  async finishImage() {
    if (!this.nowPlaying) return;
    await this.obs.hideAll();
    this.onEnded();
  }

  // Operator hit Stop. Pull whatever ad is on air (Starting Soon keeps looping).
  async stop() {
    clearTimeout(this.imageTimer);
    await this.obs.stopAll();
    if (this.nowPlaying) this.emit('log', 'Stopped ' + this.nowPlaying);
    this.nowPlaying = null;
    if (this.rotating()) this.schedule();
  }

  onEnded() {
    clearTimeout(this.imageTimer);
    this.nowPlaying = null;
    if (this.rotating()) this.schedule();
  }

  rotating() {
    return this.autoEnabled || this.preshow;
  }

  // Gap range depends on whether we're in pre-show (tighter) or normal rotation.
  gapRange() {
    if (this.preshow) {
      return [this.cfg.preshowMinGapSec ?? 60, this.cfg.preshowMaxGapSec ?? 120];
    }
    return [this.cfg.minGapSec, this.cfg.maxGapSec];
  }

  schedule() {
    clearTimeout(this.timer);
    const [a, b] = this.gapRange();
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const secs = lo + Math.random() * (hi - lo);
    this.nextAt = Date.now() + secs * 1000;
    this.timer = setTimeout(() => {
      this.nextAt = null;
      this.playNow();
    }, secs * 1000);
  }

  setAuto(on) {
    this.autoEnabled = on;
    if (on) {
      this.emit('log', 'Auto rotation ON');
      if (!this.timer) this.schedule();
    } else {
      this.emit('log', 'Auto rotation OFF');
      if (!this.preshow) { clearTimeout(this.timer); this.nextAt = null; }
    }
  }

  // Start the Starting Soon pre-show: loop the hold video and sprinkle ads.
  async startPreshow() {
    if (!this.preshowVideo) {
      this.emit('log', 'No Starting Soon video found. Add one to the preshow folder and reload.');
      return;
    }
    try {
      await this.obs.playStartingSoon(this.preshowVideo);
    } catch (err) {
      this.emit('log', 'Starting Soon failed: ' + err.message);
      return;
    }
    this.preshow = true;
    this.emit('log', 'Starting Soon pre-show ON');
    this.schedule();
  }

  async stopPreshow() {
    this.preshow = false;
    clearTimeout(this.timer);
    clearTimeout(this.imageTimer);
    this.nextAt = null;
    await this.obs.stopAll();
    await this.obs.hideStartingSoon();
    this.nowPlaying = null;
    this.emit('log', 'Starting Soon pre-show OFF');
    if (this.autoEnabled) this.schedule();
  }

  status() {
    return {
      connected: this.obs.connected,
      autoEnabled: this.autoEnabled,
      preshow: this.preshow,
      preshowReady: Boolean(this.preshowVideo),
      nowPlaying: this.nowPlaying,
      nextInSec: this.nextAt ? Math.max(0, Math.round((this.nextAt - Date.now()) / 1000)) : null,
      ads: this.ads.map(a => ({ file: a.file, type: a.type })),
      minGapSec: this.cfg.minGapSec,
      maxGapSec: this.cfg.maxGapSec,
    };
  }
}
