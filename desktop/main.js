'use strict';
// SaveMind for Mac: hosts the shared interface and the Node backend (storage, analysis, reminders, sync).

const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, Notification, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { Store } = require('./backend/store');
const { Analyzer } = require('./backend/analyzer');
const { Reminders } = require('./backend/reminders');
const { Sync } = require('./backend/sync');
const { createBridge } = require('./backend/bridge');
const syncConfig = require('./sync-config');

let win = null;
let store;
let bridge;
let changeTimer = null;

if (!app.requestSingleInstanceLock()) app.quit();

function js(code) {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(code).catch(() => {});
}

function notifyChanged() {
  if (changeTimer) return;
  changeTimer = setTimeout(() => { changeTimer = null; js('window.SMNative && SMNative.changed()'); }, 120);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 640,
    title: 'SaveMind',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F5F6F8',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
  // Links clicked inside the page open in the browser; the window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.on('closed', () => { win = null; });
}

function showLink(id) {
  if (!win) createWindow();
  win.show();
  win.focus();
  js('window.SMNative && SMNative.go(' + JSON.stringify('#/link/' + id) + ')');
}

app.whenReady().then(() => {
  const secrets = {
    encrypt: (text) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text).toString('base64') : 'plain:' + Buffer.from(text).toString('base64')),
    decrypt: (enc) => (enc.startsWith('plain:') ? Buffer.from(enc.slice(6), 'base64').toString() : safeStorage.decryptString(Buffer.from(enc, 'base64')))
  };
  store = new Store(app.getPath('userData'), secrets);
  store.listeners.push(notifyChanged);

  const reminders = new Reminders(store, (title, body, linkId) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => showLink(linkId));
    n.show();
  });
  let analyzer;
  const sync = new Sync(store, syncConfig, {
    changed: notifyChanged,
    linkChanged: (id) => { const l = store.getLink(id); if (l) reminders.schedule(l); else reminders.cancel(id); },
    analyze: () => analyzer.kick()
  });
  analyzer = new Analyzer(store, (id) => reminders.schedule(store.getLink(id)));
  store.onLocal = () => sync.requestSoon();

  const platform = {
    openExternal: (url) => shell.openExternal(url),
    copy: (text) => clipboard.writeText(text),
    readClipboard: () => clipboard.readText(),
    toast: (msg) => js('window.SMNative && SMNative.toast(' + JSON.stringify(String(msg)) + ')'),
    callback: (id, result) => js('window.SMNative && SMNative.callback(' + Number(id) + ',' + JSON.stringify(String(result)) + ')'),
    saveFile: async (name, text) => {
      const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (r.canceled || !r.filePath) return false;
      fs.writeFileSync(r.filePath, text);
      return true;
    },
    openFile: async () => {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (r.canceled || !r.filePaths.length) return null;
      const stat = fs.statSync(r.filePaths[0]);
      if (stat.size > 30000000) throw new Error('File too large');
      return fs.readFileSync(r.filePaths[0], 'utf8');
    }
  };
  bridge = createBridge({ store, analyzer, reminders, sync, platform, version: app.getVersion() });

  ipcMain.on('sm', (event, method, args) => {
    try {
      const fn = bridge[method];
      const r = typeof fn === 'function' ? fn.apply(bridge, Array.isArray(args) ? args : []) : undefined;
      event.returnValue = r === undefined ? null : r;
    } catch (e) {
      console.error('SM.' + method + ' failed', e);
      event.returnValue = null;
    }
  });

  createWindow();
  reminders.scheduleAll();
  analyzer.kick();
  sync.syncNow();
  setInterval(() => sync.requestSoon(), 20000);
  setInterval(() => analyzer.kick(), 60000);

  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
});

app.on('before-quit', () => { if (store) store.flush(); });
// The app keeps running when its window is closed, so reminders and sync continue (the macOS convention).
app.on('window-all-closed', () => {});
