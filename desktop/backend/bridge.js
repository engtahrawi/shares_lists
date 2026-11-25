'use strict';
// The SM bridge for the Mac: the same methods, arguments and return values as the Android
// MainActivity.Bridge, so the shared interface (savemind/src/main/assets/web) runs unchanged.

const urlutil = require('./urlutil');
const claude = require('./claude');
const { parseDeadline } = require('./store');

/**
 * @param ctx { store, analyzer, reminders, sync, version, platform: { openExternal, copy, readClipboard,
 *   saveFile(defaultName, text), openFile() -> text|null, toast(msg), callback(id, result) } }
 */
function createBridge(ctx) {
  const { store, analyzer, reminders, sync, platform } = ctx;
  const toast = (m) => platform.toast(m);

  const b = {
    getState() {
      const s = store.session();
      return JSON.stringify({
        links: store.allLinks(),
        collections: store.allCollections(),
        settings: {
          name: store.name(), model: store.model(), lang: store.briefLanguage(), autoFile: store.autoFile(),
          hasKey: store.hasApiKey(), keyHint: store.apiKeyHint(), onboarded: store.onboarded()
        },
        account: {
          available: sync.available(), signedIn: store.signedIn(), email: s && s.email ? s.email : '',
          lastSync: store.prefs.lastSync || 0, syncing: sync.running, error: store.prefs.syncError || null
        },
        version: ctx.version,
        platform: 'mac'
      });
    },

    getStats() { return JSON.stringify(store.stats()); },
    appVersion() { return ctx.version; },
    validateUrl(input) { return urlutil.validate(input) || ''; },

    checkDuplicate(input) {
      const v = urlutil.validate(input);
      if (!v) return 'null';
      const d = store.findDuplicate(v);
      return d ? JSON.stringify(d) : 'null';
    },

    addLink(input, context, saveCopy) {
      const url = urlutil.validate(input);
      if (!url) return JSON.stringify({ ok: false, error: 'Enter a valid web link that starts with http:// or https://' });
      if (!saveCopy) {
        const dup = store.findDuplicate(url);
        if (dup) return JSON.stringify({ ok: false, duplicate: dup });
      }
      const id = store.insertLink(url, context, 'SaveMind', null);
      analyzer.kick();
      return JSON.stringify({ ok: true, id });
    },

    updateLink(id, json) {
      let input;
      try { input = JSON.parse(json); } catch (e) { return; }
      const cur = store.getLink(id);
      if (!cur) return;
      const v = {};
      if ('title' in input) {
        const t = String(input.title || '').trim();
        if (t && t !== cur.title) { v.title = t.slice(0, 200); v.title_locked = 1; }
      }
      if ('notes' in input) v.notes = String(input.notes || '').trim() || null;
      if ('tags' in input) {
        const clean = [];
        for (const t of Array.isArray(input.tags) ? input.tags : []) {
          if (clean.length >= 12) break;
          const tag = String(t || '').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
          if (tag && tag.length <= 32) clean.push(tag);
        }
        v.tags = clean;
        v.tags_locked = 1;
      }
      if ('action_label' in input) {
        const a = String(input.action_label || '').trim();
        if (a) { v.action_label = a.slice(0, 24); v.action_locked = 1; }
      }
      if ('collection_id' in input) {
        const cid = input.collection_id == null ? -1 : Number(input.collection_id);
        v.collection_id = cid > 0 && store.collectionExists(cid) ? cid : null;
        v.reviewed = 1;
      }
      if (Object.keys(v).length) store.updateLink(id, v);
    },

    setFlag(id, flag, on) {
      if (!['favorite', 'archived', 'reviewed'].includes(flag)) return;
      store.updateLink(id, { [flag]: on ? 1 : 0 });
      if (flag === 'archived') reminders.schedule(store.getLink(id));
    },

    setDeadline(id, date, time, remindDays) {
      let text = String(date || '').trim();
      if (time && String(time).trim()) text += 'T' + String(time).trim();
      const d = parseDeadline(text);
      if (!d) return false;
      store.updateLink(id, {
        deadline_at: d.at, deadline_has_time: d.hasTime ? 1 : 0, deadline_source: 'user', deadline_locked: 1,
        remind_days: remindDays === 3 || remindDays === 7 ? remindDays : 0, reminded: 0
      });
      reminders.schedule(store.getLink(id));
      return true;
    },

    clearDeadline(id) {
      store.updateLink(id, { deadline_at: null, deadline_has_time: 0, deadline_source: 'user', deadline_locked: 1, remind_days: 0 });
      reminders.cancel(id);
    },

    setEffort(id, days) {
      const n = Number(days);
      if (!(n >= 1 && n <= 60)) return;
      store.updateLink(id, { effort_days: Math.round(n), effort_locked: 1 });
    },

    setSteps(id, json) {
      let input;
      try { input = JSON.parse(json); } catch (e) { return; }
      const clean = [];
      for (const o of Array.isArray(input) ? input : []) {
        if (clean.length >= 20 || !o) continue;
        const t = String(o.t || '').trim();
        if (t) clean.push({ t: t.slice(0, 120), d: o.d === 1 ? 1 : 0 });
      }
      store.updateLink(id, { steps: clean, steps_locked: 1 });
    },

    setCountries(id, json) {
      let list;
      try { list = JSON.parse(json); } catch (e) { return; }
      store.updateLink(id, { countries: claude.validCountries(list), countries_locked: 1 });
    },

    addRefLink(id, input) {
      const l = store.getLink(id);
      const url = urlutil.validate(input);
      if (!l || !url) return JSON.stringify({ ok: false, error: 'Enter a valid web link that starts with http:// or https://' });
      const refs = Array.isArray(l.ref_links) ? l.ref_links : [];
      const norm = urlutil.normalize(url);
      if (refs.some((r) => urlutil.normalize(r.url) === norm)) return JSON.stringify({ ok: false, error: 'This reference link is already added.' });
      if (norm === urlutil.normalize(l.url)) return JSON.stringify({ ok: false, error: 'That is the saved link itself. Add a different page.' });
      if (refs.length >= 5) return JSON.stringify({ ok: false, error: 'You can add up to 5 reference links.' });
      refs.push({ url, title: urlutil.domain(url), status: 'pending' });
      store.updateLink(id, { ref_links: refs, status: 'queued', attempts: 0, next_attempt_at: 0, error: null, origin: store.deviceId() });
      analyzer.kick();
      return JSON.stringify({ ok: true });
    },

    removeRefLink(id, index) {
      const l = store.getLink(id);
      if (!l || !Array.isArray(l.ref_links) || index < 0 || index >= l.ref_links.length) return;
      store.updateLink(id, { ref_links: l.ref_links.filter((_, i) => i !== index) });
    },

    reanalyzeMissingCountries() {
      const n = store.requeueMissingCountries();
      if (n > 0) analyzer.kick();
      return n;
    },

    reanalyzeMissingPlans() {
      const n = store.requeueMissingPlans();
      if (n > 0) analyzer.kick();
      return n;
    },

    acceptSuggestion(id) {
      const l = store.getLink(id);
      if (!l) return '';
      const v = { reviewed: 1 };
      let name = 'Inbox';
      if (l.suggested_collection_id != null && store.collectionExists(l.suggested_collection_id)) {
        v.collection_id = l.suggested_collection_id;
        name = store.collectionName(l.suggested_collection_id);
      } else if (l.suggested_new_name) {
        const cid = store.createCollection(l.suggested_new_name);
        if (cid > 0) { v.collection_id = cid; name = store.collectionName(cid); }
      }
      store.updateLink(id, v);
      return name || '';
    },

    moveLink(id, collectionId) {
      const cid = Number(collectionId);
      store.updateLink(id, { collection_id: cid > 0 && store.collectionExists(cid) ? cid : null, reviewed: 1 });
    },

    deleteLink(id) {
      reminders.cancel(id);
      store.deleteLink(id);
    },

    retry(id, extraContext) {
      const l = store.getLink(id);
      if (!l) return;
      const v = { status: 'queued', attempts: 0, next_attempt_at: 0, error: null, origin: store.deviceId() };
      const extra = String(extraContext || '').trim();
      if (extra) v.shared_text = l.shared_text ? l.shared_text + '\n' + extra : extra;
      store.updateLink(id, v);
      analyzer.kick();
    },

    createCollection(name) { return store.createCollection(name); },
    renameCollection(id, name) { return store.renameCollection(id, name); },
    deleteCollection(id) { store.deleteCollection(id); },

    openUrl(url) {
      const v = urlutil.validate(url);
      if (v) platform.openExternal(v);
    },

    shareLink(url, title) {
      platform.copy(title ? title + '\n' + url : url);
      toast('Link copied. Paste it wherever you want to share it.');
    },

    copyText(text) {
      platform.copy(String(text || ''));
      toast('Copied');
    },

    readClipboard() { return platform.readClipboard() || ''; },

    saveSettings(json) {
      let o;
      try { o = JSON.parse(json); } catch (e) { return; }
      let name = String(o.name != null ? o.name : store.name()).trim().slice(0, 40);
      let lang = o.lang || store.briefLanguage();
      if (!['auto', 'en', 'ar'].includes(lang)) lang = 'auto';
      store.saveSettings(name, o.model || store.model(), lang, o.autoFile != null ? !!o.autoFile : store.autoFile());
      if (o.onboarded) { store.prefs.onboarded = true; store.save(); }
      store.changed();
    },

    setApiKey(key) {
      const ok = store.setApiKey(key);
      if (ok && key && String(key).trim()) {
        store.requeueKeyFailures();
        analyzer.kick();
      }
      store.changed();
      return ok;
    },

    testApiKey(callbackId) {
      const key = store.apiKey();
      const p = key ? claude.testKey(key, store.model()) : Promise.resolve('No API key saved yet.');
      p.then((r) => platform.callback(callbackId, r));
    },

    exportData() {
      const date = new Date().toISOString().slice(0, 10);
      platform.saveFile('savemind-backup-' + date + '.json', JSON.stringify(store.exportAll(), null, 2))
        .then((ok) => { if (ok) toast('Backup saved'); })
        .catch((e) => toast('Backup failed: ' + e.message));
    },

    importData() {
      platform.openFile().then((text) => {
        if (text == null) return;
        const added = store.importAll(JSON.parse(text));
        reminders.scheduleAll();
        analyzer.kick();
        toast('Imported ' + added + ' link' + (added === 1 ? '' : 's'));
      }).catch((e) => toast('Import failed: ' + e.message));
    },

    deleteAllData(includeKey) {
      store.deleteAll();
      if (includeKey) store.setApiKey(null);
      store.changed();
    },

    signIn(email, password, create, callbackId) {
      sync.signIn(String(email || ''), String(password || ''), !!create)
        .then((r) => platform.callback(callbackId, JSON.stringify(Object.assign({ needsConfirm: false }, r))));
    },

    signOut() { sync.signOut(); },
    syncNow() { sync.syncNow(); },
    toast(msg) { toast(msg); }
  };
  return b;
}

module.exports = { createBridge };
