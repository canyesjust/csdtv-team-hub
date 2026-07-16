// Electron wrapper. Gives the ad controller its own window on macOS and Windows,
// with no browser and no Node install required. It boots the existing server
// (src/index.js) inside Electron's own Node, waits for the panel to answer, then
// shows it in a real app window. The app logic is unchanged.

import { app, BrowserWindow, shell } from 'electron'
import http from 'node:http'

const PANEL_URL = 'http://127.0.0.1:4466'
let win = null

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

app.whenReady().then(async () => {
  // Boot the Express + WebSocket server and the OBS/sync logic in-process.
  try {
    await import('./src/index.js')
  } catch (err) {
    console.error('Controller server failed to start:', err)
  }
  waitForPanel(createWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quitting the window quits the app (and its server) on every platform.
app.on('window-all-closed', () => app.quit())
