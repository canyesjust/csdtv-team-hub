// Electron wrapper. Gives the ad controller its own window on macOS and Windows,
// with no browser and no Node install required. It boots the existing server
// (src/index.js) inside Electron's own Node, waits for the panel to answer, then
// shows it in a real app window. The app logic is unchanged.

import { app, BrowserWindow, shell } from 'electron'
import http from 'node:http'

const PANEL_URL = 'http://127.0.0.1:4466'
let win = null

// Only one copy of the app runs at a time. A second launch just focuses the
// first instead of starting a second server on the same port.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(start)
  // Quitting the window quits the app (and its server) on every platform.
  app.on('window-all-closed', () => app.quit())
}

// Quick check: is a controller panel already answering on 4466?
function panelIsUp() {
  return new Promise(resolve => {
    const req = http.get(PANEL_URL + '/api/status', res => { res.destroy(); resolve(true) })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

// Poll until the local panel server is up, then run the callback.
function waitForPanel(done, tries = 0) {
  const req = http.get(PANEL_URL + '/api/status', res => { res.destroy(); done() })
  req.on('error', () => {
    if (tries > 120) return done() // ~60s; open anyway, the panel retries itself
    setTimeout(() => waitForPanel(done, tries + 1), 500)
  })
}

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 1000,
    minWidth: 380,
    minHeight: 640,
    title: 'CSDtv Ad Controller',
    backgroundColor: '#14161a',
    webPreferences: { contextIsolation: true },
  })
  win.loadURL(PANEL_URL)
  // Any external link opens in the system browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  win.on('closed', () => { win = null })
}

async function start() {
  // If nothing is already serving the panel, start our own server. If something
  // already is (a leftover instance), reuse it instead of crashing on a busy port.
  const alreadyUp = await panelIsUp()
  if (!alreadyUp) {
    try {
      await import('./src/index.js')
    } catch (err) {
      console.error('Controller server failed to start:', err)
    }
  }
  waitForPanel(createWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}
