// OBS connection wrapper. Everything that talks to OBS lives here, so the
// rest of the app never touches the websocket API directly.

import { OBSWebSocket } from 'obs-websocket-js';
import { EventEmitter } from 'node:events';

export class ObsClient extends EventEmitter {
  constructor(cfg) {
    super();
    this.cfg = cfg;
    this.obs = new OBSWebSocket();
    this.connected = false;
    this._reconnect = null;
    this._db = {};     // last volume (dB) we set per source
    this._fadeSeq = 0; // cancels an in-flight fade when a newer one starts

    // Register socket listeners ONCE. The OBSWebSocket instance survives
    // reconnects, so registering these inside connect() would stack duplicate
    // listeners and fire on every reconnect. This was a real leak.
    this.obs.on('MediaInputPlaybackEnded', ({ inputName }) => {
      if (inputName === this.cfg.mediaSource) this.emit('mediaEnded');
    });
    this.obs.on('ConnectionClosed', () => {
      if (!this.connected) return;
      this.connected = false;
      this.emit('log', 'OBS connection lost. Retrying.');
      this.scheduleReconnect();
    });
  }

  async connect() {
    try {
      const pw = this.cfg.obs.password || undefined;
      await this.obs.connect(this.cfg.obs.url, pw);
      this.connected = true;
      this.emit('log', 'Connected to OBS');
      // Clear anything left on air from a previous run.
      await this.hideAll();
      await this.hideStartingSoon();
    } catch (err) {
      this.connected = false;
      this.emit('log', 'OBS not reachable. Retrying in 3s.');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this._reconnect) return; // single-flight, no stacked timers
    this._reconnect = setTimeout(() => {
      this._reconnect = null;
      this.connect();
    }, 3000);
  }

  // Point the Media Source at a video file and restart playback.
  async playVideo(fullPath) {
    if (!this.connected) throw new Error('OBS not connected');
    if (this.cfg.imageSource) await this.setVisible(this.cfg.imageSource, false);
    await this.obs.call('SetInputSettings', {
      inputName: this.cfg.mediaSource,
      inputSettings: { is_local_file: true, local_file: fullPath, looping: false },
    });
    await this.setVisible(this.cfg.mediaSource, true);
    await this.obs.call('TriggerMediaInputAction', {
      inputName: this.cfg.mediaSource,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
  }

  // Point the Image Source at a file and show it. Images have no "playback
  // ended" event, so the rotator hides them on a timer instead.
  async showImage(fullPath) {
    if (!this.connected) throw new Error('OBS not connected');
    if (!this.cfg.imageSource) throw new Error('No imageSource configured');
    await this.setVisible(this.cfg.mediaSource, false);
    await this.obs.call('SetInputSettings', {
      inputName: this.cfg.imageSource,
      inputSettings: { file: fullPath },
    });
    await this.setVisible(this.cfg.imageSource, true);
  }

  // Loop a "starting soon" video underneath the ads.
  async playStartingSoon(fullPath) {
    if (!this.connected) throw new Error('OBS not connected');
    if (!this.cfg.startingSoonSource) throw new Error('No startingSoonSource configured');
    await this.obs.call('SetInputSettings', {
      inputName: this.cfg.startingSoonSource,
      inputSettings: { is_local_file: true, local_file: fullPath, looping: true },
    });
    // Set to the configured pre-show level (dB) so a leftover duck doesn't stick
    // and it never blasts back to full.
    await this.setVolumeDb(this.cfg.startingSoonSource, this.cfg.startingSoonVolumeDb ?? -30);
    await this.setVisible(this.cfg.startingSoonSource, true);
    await this.obs.call('TriggerMediaInputAction', {
      inputName: this.cfg.startingSoonSource,
      mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
    });
  }

  async hideStartingSoon() {
    if (!this.connected || !this.cfg.startingSoonSource) return;
    try {
      await this.obs.call('TriggerMediaInputAction', {
        inputName: this.cfg.startingSoonSource,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
      });
    } catch { /* ignore */ }
    await this.setVisible(this.cfg.startingSoonSource, false);
  }

  // Stop video playback and hide both ad sources. Leaves Starting Soon alone.
  async stopAll() {
    if (!this.connected) return;
    try {
      await this.obs.call('TriggerMediaInputAction', {
        inputName: this.cfg.mediaSource,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
      });
    } catch { /* media source may not support stop; ignore */ }
    await this.hideAll();
  }

  async hideAll() {
    await this.setVisible(this.cfg.mediaSource, false);
    if (this.cfg.imageSource) await this.setVisible(this.cfg.imageSource, false);
  }

  // Set a source's volume now, in dB.
  async setVolumeDb(sourceName, db) {
    if (!this.connected || !sourceName) return;
    try {
      await this.obs.call('SetInputVolume', { inputName: sourceName, inputVolumeDb: db });
      this._db[sourceName] = db;
    } catch { /* source may have no audio; ignore */ }
  }

  // Smoothly ramp a source's volume to a target dB over ms. Ramping in dB (not a
  // linear multiplier) sounds natural to the ear, so the fade is gradual instead
  // of snapping. Used to duck the Starting Soon music under an ad and bring it
  // back. A newer fade cancels an in-flight one.
  async fadeToDb(sourceName, toDb, ms = 1500) {
    if (!this.connected || !sourceName) return;
    const seq = ++this._fadeSeq;
    const from = (this._db[sourceName] != null) ? this._db[sourceName] : toDb;
    const steps = Math.max(8, Math.round(ms / 30)); // ~30ms per step keeps it smooth
    for (let i = 1; i <= steps; i++) {
      if (seq !== this._fadeSeq) return; // a newer fade took over
      const db = from + (toDb - from) * (i / steps);
      try {
        await this.obs.call('SetInputVolume', { inputName: sourceName, inputVolumeDb: db });
      } catch { return; }
      this._db[sourceName] = db;
      await new Promise(r => setTimeout(r, ms / steps));
    }
  }

  // Show or hide a source in the configured scene.
  async setVisible(sourceName, visible) {
    try {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', {
        sceneName: this.cfg.scene,
        sourceName,
      });
      await this.obs.call('SetSceneItemEnabled', {
        sceneName: this.cfg.scene,
        sceneItemId,
        sceneItemEnabled: visible,
      });
    } catch (err) {
      this.emit('log', `Could not set "${sourceName}" visibility: ` + err.message);
    }
  }
}
