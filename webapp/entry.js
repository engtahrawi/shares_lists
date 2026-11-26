'use strict';
// SaveMind on the web: runs the Mac app's backend (storage, sync, bridge) in the browser.
// Data lives in localStorage and syncs with Supabase; adding and analyzing links stays in the apps.
/* global localStorage, location, navigator, document, Blob, URL */

var KEY = 'savemind-web';
var { Store } = require('./store');
var { Sync } = require('./sync');
var { createBridge } = require('./bridge');
var syncConfig = require('./sync-config');

var secrets = {
  encrypt: function (text) { return 'b64:' + btoa(unescape(encodeURIComponent(text))); },
  decrypt: function (enc) { return decodeURIComponent(escape(atob(String(enc).replace(/^b64:/, '')))); }
};

var store = new Store('', secrets);
var changeTimer = null;
function notifyChanged() {
  if (changeTimer) return;
  changeTimer = setTimeout(function () { changeTimer = null; if (window.SMNative) window.SMNative.changed(); }, 120);
}
store.listeners.push(notifyChanged);

var noop = function () {};
var analyzer = { kick: noop };
var reminders = { schedule: noop, cancel: noop, scheduleAll: noop };
var sync = new Sync(store, syncConfig, { changed: notifyChanged, linkChanged: noop, analyze: noop });
store.onLocal = function () { sync.requestSoon(); };

var platform = {
  openExternal: function (url) { window.open(url, '_blank', 'noopener'); },
  copy: function (text) { if (navigator.clipboard) navigator.clipboard.writeText(text).catch(noop); },
  readClipboard: function () { return ''; },
  toast: function (msg) { setTimeout(function () { if (window.SMNative) window.SMNative.toast(String(msg)); }, 0); },
  callback: function (id, result) { setTimeout(function () { if (window.SMNative) window.SMNative.callback(Number(id), String(result)); }, 0); },
  saveFile: function (name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return Promise.resolve(true);
  },
  openFile: function () { return Promise.resolve(null); }
};

var bridge = createBridge({ store: store, analyzer: analyzer, reminders: reminders, sync: sync, platform: platform,
  version: SM_WEB_VERSION, platformName: 'web' });

// On a shared browser, signing out removes this account's copy of the data, so the next person
// who signs in here never sees it or uploads it to their own account.
bridge.signOut = function () {
  sync.signOut();
  store.saveNow = noop;
  store.save = noop;
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  location.reload();
};
// These run only in the apps.
bridge.addLink = function () { return JSON.stringify({ ok: false, error: 'Save links with the SaveMind app on Android or Mac.' }); };
bridge.retry = noop;
bridge.addRefLink = function () { return JSON.stringify({ ok: false, error: 'Add reference links in the SaveMind app on Android or Mac.' }); };
bridge.reanalyzeMissingPlans = function () { return 0; };
bridge.reanalyzeMissingCountries = function () { return 0; };
bridge.setApiKey = function () { return false; };
bridge.importData = noop;

window.SM = bridge;
window.addEventListener('beforeunload', function () { store.flush(); });
if (store.signedIn()) sync.syncNow();
setInterval(function () { if (store.signedIn() && !document.hidden) sync.requestSoon(); }, 20000);
document.addEventListener('visibilitychange', function () { if (!document.hidden && store.signedIn()) sync.requestSoon(); });
