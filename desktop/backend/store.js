'use strict';
// Local storage for the Mac app: links, collections, deletions waiting to sync, analysis runs and
// settings, kept in one JSON file. Field names and rules mirror the Android Db/Prefs classes so the
// shared interface and the sync format are identical on both devices.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const urlutil = require('./urlutil');

const COLLECTION_COLORS = 7;

/** Link fields shared with other devices (plus "collection" and "suggested_collection" uids). */
const SYNC_LINK_FIELDS = ['url', 'shared_text', 'source_app', 'saved_at', 'status', 'source_level', 'title',
  'page_title', 'summary', 'content_type', 'topic', 'tags', 'action_label', 'suggested_new_name', 'confidence',
  'reviewed', 'favorite', 'archived', 'notes', 'error', 'site_name', 'image_url', 'analyzed_at', 'title_locked',
  'tags_locked', 'action_locked', 'deadline_at', 'deadline_has_time', 'deadline_source', 'deadline_locked',
  'remind_days', 'effort_days', 'effort_locked', 'steps', 'steps_locked', 'origin', 'countries', 'countries_locked', 'ref_links'];

const INT_FIELDS = new Set(['reviewed', 'favorite', 'archived', 'title_locked', 'tags_locked', 'action_locked',
  'deadline_has_time', 'deadline_locked', 'remind_days', 'effort_locked', 'steps_locked', 'countries_locked']);

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" to local epoch ms; a date alone means 23:59. */
function parseDeadline(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(text || '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hasTime = m[4] != null;
  const h = hasTime ? Number(m[4]) : 23;
  const mi = hasTime ? Number(m[5]) : 59;
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return { at: dt.getTime(), hasTime };
}

function emptyToNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t ? t : null;
}

function blankLink() {
  return {
    id: 0, url: '', normalized_url: '', shared_text: null, source_app: null, saved_at: 0, updated_at: 0,
    status: 'queued', source_level: null, title: null, page_title: null, summary: null, content_type: null, topic: null,
    tags: [], action_label: null, collection_id: null, suggested_collection_id: null, suggested_new_name: null,
    confidence: null, reviewed: 0, favorite: 0, archived: 0, notes: null, error: null, attempts: 0, next_attempt_at: 0,
    site_name: null, image_url: null, analyzed_at: null, title_locked: 0, tags_locked: 0, action_locked: 0,
    deadline_at: null, deadline_has_time: 0, deadline_source: null, deadline_locked: 0, remind_days: 0, reminded: 0,
    effort_days: null, effort_locked: 0, steps: [], steps_locked: 0, uid: null, origin: null, dirty: 1,
    countries: [], countries_locked: 0, ref_links: []
  };
}

class Store {
  /**
   * @param dir folder for the data files
   * @param secrets { encrypt(text) -> string, decrypt(string) -> text } for the API key and refresh token
   */
  constructor(dir, secrets) {
    this.dir = dir;
    this.file = path.join(dir, 'savemind-data.json');
    this.secrets = secrets;
    this.listeners = [];
    this.onLocal = null;
    this.saveTimer = null;
    this.data = { nextLinkId: 1, nextColId: 1, links: [], collections: [], tombstones: [], runs: [], prefs: {} };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      Object.assign(this.data, raw);
    } catch (e) { /* first run */ }
    for (const l of this.data.links) {
      if (!Array.isArray(l.countries)) l.countries = [];
      if (!Array.isArray(l.ref_links)) l.ref_links = [];
      if (l.countries_locked == null) l.countries_locked = 0;
    }
    if (!this.data.prefs.deviceId) {
      this.data.prefs.deviceId = crypto.randomUUID();
      this.saveNow();
    }
  }

  // --------------------------------------------------------------- persistence

  save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 300);
  }

  saveNow() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  flush() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; this.saveNow(); }
  }

  changed() {
    this.save();
    for (const l of this.listeners) l();
  }

  localChange() {
    this.changed();
    if (this.onLocal) this.onLocal();
  }

  // --------------------------------------------------------------------- prefs

  get prefs() { return this.data.prefs; }
  deviceId() { return this.data.prefs.deviceId; }
  name() { return this.prefs.name != null ? this.prefs.name : ''; }
  onboarded() { return !!this.prefs.onboarded; }
  model() {
    const m = this.prefs.model;
    return ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].includes(m) ? m : 'claude-opus-5-5';
  }
  briefLanguage() { return this.prefs.lang || 'auto'; }
  autoFile() { return !!this.prefs.autoFile; }
  saveSettings(name, model, lang, autoFile) {
    Object.assign(this.prefs, { name, model, lang, autoFile: !!autoFile });
    this.save();
  }
  hasApiKey() { return !!this.prefs.apiKeyEnc; }
  apiKey() { try { return this.prefs.apiKeyEnc ? this.secrets.decrypt(this.prefs.apiKeyEnc) : null; } catch (e) { return null; } }
  apiKeyHint() { return this.prefs.apiKeyHint || ''; }
  setApiKey(key) {
    const k = (key || '').trim();
    if (!k) { delete this.prefs.apiKeyEnc; delete this.prefs.apiKeyHint; this.save(); return true; }
    try {
      this.prefs.apiKeyEnc = this.secrets.encrypt(k);
      this.prefs.apiKeyHint = k.length > 8 ? k.slice(0, 7) + '…' + k.slice(-4) : 'set';
      this.save();
      return true;
    } catch (e) {
      return false;
    }
  }

  // Account
  signedIn() { return !!(this.prefs.session && this.prefs.session.refreshEnc && this.prefs.session.userId); }
  session() { return this.prefs.session || null; }
  refreshToken() { try { return this.secrets.decrypt(this.prefs.session.refreshEnc); } catch (e) { return null; } }
  saveSession(email, userId, access, expiresAt, refresh) {
    const s = this.prefs.session || {};
    if (email) s.email = email;
    if (userId) s.userId = userId;
    s.access = access;
    s.expires = expiresAt;
    if (refresh) s.refreshEnc = this.secrets.encrypt(refresh);
    this.prefs.session = s;
    this.saveNow();
  }
  clearSession() {
    const email = this.prefs.session && this.prefs.session.email;
    this.prefs.session = email ? { email } : null;
    this.prefs.lastSeq = 0;
    this.prefs.lastSync = 0;
    this.prefs.syncError = null;
    this.saveNow();
  }

  // --------------------------------------------------------------------- links

  linkIndex(id) { return this.data.links.findIndex((l) => l.id === id); }
  getLink(id) { const l = this.data.links.find((x) => x.id === id); return l ? JSON.parse(JSON.stringify(l)) : null; }
  rawLink(id) { return this.data.links.find((x) => x.id === id) || null; }

  allLinks() {
    return JSON.parse(JSON.stringify(this.data.links)).sort((a, b) => b.saved_at - a.saved_at);
  }

  insertLink(url, sharedText, sourceApp, notes) {
    const now = Date.now();
    const l = blankLink();
    Object.assign(l, {
      id: this.data.nextLinkId++, url, normalized_url: urlutil.normalize(url), shared_text: emptyToNull(sharedText),
      source_app: emptyToNull(sourceApp), saved_at: now, updated_at: now, status: 'queued',
      site_name: urlutil.siteName(urlutil.domain(url)), notes: emptyToNull(notes), uid: crypto.randomUUID(),
      origin: this.deviceId(), dirty: 1
    });
    this.data.links.push(l);
    this.localChange();
    return l.id;
  }

  findDuplicate(url) {
    const norm = urlutil.normalize(url);
    const hits = this.data.links.filter((l) => l.normalized_url === norm).sort((a, b) => b.saved_at - a.saved_at);
    if (!hits.length) return null;
    const c = this.collectionById(hits[0].collection_id);
    return { id: hits[0].id, savedAt: hits[0].saved_at, title: hits[0].title, collection: c ? c.name : null };
  }

  /** Applies field changes as a local edit (marked for upload). */
  updateLink(id, patch) {
    const l = this.rawLink(id);
    if (!l) return;
    Object.assign(l, patch, { updated_at: Date.now(), dirty: 1 });
    this.localChange();
  }

  /** Changes that stay on this device (analysis bookkeeping). */
  patchLocal(id, patch) {
    const l = this.rawLink(id);
    if (!l) return;
    Object.assign(l, patch);
    this.changed();
  }

  deleteLink(id) {
    const i = this.linkIndex(id);
    if (i < 0) return;
    const l = this.data.links[i];
    if (l.uid) this.tombstone(l.uid, 'link');
    this.data.links.splice(i, 1);
    this.data.runs = this.data.runs.filter((r) => r.link_id !== id);
    this.localChange();
  }

  tombstone(uid, kind) {
    this.data.tombstones = this.data.tombstones.filter((t) => t.uid !== uid);
    this.data.tombstones.push({ uid, kind, deleted_at: Date.now() });
  }

  mine(l) { return !l.origin || l.origin === this.deviceId(); }

  claimNextQueued() {
    const now = Date.now();
    const due = this.data.links.filter((l) => l.status === 'queued' && (l.next_attempt_at || 0) <= now && this.mine(l))
      .sort((a, b) => a.saved_at - b.saved_at)[0];
    if (!due) return null;
    due.status = 'processing';
    due.error = null;
    this.changed();
    return this.getLink(due.id);
  }

  nextQueuedAttemptAt() {
    const q = this.data.links.filter((l) => l.status === 'queued' && this.mine(l)).map((l) => l.next_attempt_at || 0);
    return q.length ? Math.min(...q) : -1;
  }

  resetStuckProcessing() {
    let n = 0;
    for (const l of this.data.links) if (l.status === 'processing') { l.status = 'queued'; n++; }
    if (n) this.changed();
  }

  requeueKeyFailures() {
    for (const l of this.data.links) {
      if ((l.status === 'queued' && l.error === 'needs_key') || (l.status === 'failed' && /API key/.test(l.error || ''))) {
        Object.assign(l, { status: 'queued', attempts: 0, next_attempt_at: 0, error: null });
      }
    }
    this.changed();
  }

  requeueMissingPlans() {
    const now = Date.now();
    let n = 0;
    for (const l of this.data.links) {
      if (l.deadline_at != null && l.deadline_at > now && l.effort_days == null && !l.archived
          && ['analyzed', 'partial', 'failed'].includes(l.status)) {
        Object.assign(l, { status: 'queued', attempts: 0, next_attempt_at: 0, error: null, origin: this.deviceId(), dirty: 1, updated_at: now });
        n++;
      }
    }
    if (n) this.localChange();
    return n;
  }

  requeueMissingCountries() {
    const now = Date.now();
    let n = 0;
    for (const l of this.data.links) {
      if (['opportunity', 'event', 'course'].includes(l.content_type) && !(l.countries || []).length && !l.countries_locked
          && !l.archived && ['analyzed', 'partial', 'failed'].includes(l.status)) {
        Object.assign(l, { status: 'queued', attempts: 0, next_attempt_at: 0, error: null, origin: this.deviceId(), dirty: 1, updated_at: now });
        n++;
      }
    }
    if (n) this.localChange();
    return n;
  }

  pendingReminders() {
    return this.data.links.filter((l) => l.remind_days > 0 && !l.reminded && l.deadline_at != null && !l.archived).map((l) => this.getLink(l.id));
  }

  // --------------------------------------------------------------- collections

  collectionById(id) { return id == null ? null : this.data.collections.find((c) => c.id === id) || null; }
  collectionExists(id) { return !!this.collectionById(id); }
  collectionName(id) { const c = this.collectionById(id); return c ? c.name : null; }
  collectionIdByName(name) {
    const n = String(name).toLowerCase();
    const c = this.data.collections.find((x) => x.name.toLowerCase() === n);
    return c ? c.id : -1;
  }

  allCollections() {
    return this.data.collections.map((c) => {
      let upd = c.created_at;
      for (const l of this.data.links) if (l.collection_id === c.id && l.updated_at > upd) upd = l.updated_at;
      return { id: c.id, name: c.name, description: c.description || null, color: c.color, created_at: c.created_at, updated_at: upd };
    }).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  createCollection(name, notify) {
    let clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (!clean) return -1;
    if (clean.length > 60) clean = clean.slice(0, 60);
    const existing = this.collectionIdByName(clean);
    if (existing > 0) return existing;
    const now = Date.now();
    const c = { id: this.data.nextColId++, uid: crypto.randomUUID(), name: clean, description: null,
      color: this.data.collections.length % COLLECTION_COLORS, created_at: now, updated_at: now, dirty: 1 };
    this.data.collections.push(c);
    if (notify !== false) this.localChange();
    return c.id;
  }

  renameCollection(id, name) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (!clean) return false;
    const other = this.collectionIdByName(clean);
    if (other > 0 && other !== id) return false;
    const c = this.collectionById(id);
    if (!c) return false;
    Object.assign(c, { name: clean.slice(0, 60), updated_at: Date.now(), dirty: 1 });
    this.localChange();
    return true;
  }

  deleteCollection(id) {
    const c = this.collectionById(id);
    if (!c) return;
    const now = Date.now();
    for (const l of this.data.links) {
      if (l.collection_id === id) Object.assign(l, { collection_id: null, updated_at: now, dirty: 1 });
      if (l.suggested_collection_id === id) Object.assign(l, { suggested_collection_id: null, updated_at: now, dirty: 1 });
    }
    if (c.uid) this.tombstone(c.uid, 'collection');
    this.data.collections = this.data.collections.filter((x) => x.id !== id);
    this.localChange();
  }

  collectionsForPrompt(excludeLinkId) {
    const counts = new Map();
    for (const l of this.data.links) if (l.collection_id != null) counts.set(l.collection_id, (counts.get(l.collection_id) || 0) + 1);
    return this.data.collections.slice().sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0)).slice(0, 40).map((c) => ({
      id: c.id,
      name: c.name,
      examples: this.data.links.filter((l) => l.collection_id === c.id && l.id !== excludeLinkId && l.title)
        .sort((a, b) => b.updated_at - a.updated_at).slice(0, 3).map((l) => l.title)
    }));
  }

  // ------------------------------------------------------------------ analysis

  logRun(linkId, model, promptVersion, level, status, errorCode, inTokens, outTokens, latencyMs) {
    this.data.runs.push({ link_id: linkId, model, prompt_version: promptVersion, source_level: level, status,
      error_code: errorCode, input_tokens: inTokens, output_tokens: outTokens, latency_ms: latencyMs, created_at: Date.now() });
    if (this.data.runs.length > 5000) this.data.runs.splice(0, this.data.runs.length - 5000);
    this.save();
  }

  stats() {
    const links = this.data.links;
    const o = {
      links: links.length,
      full: links.filter((l) => l.source_level === 'FULL').length,
      partial: links.filter((l) => l.source_level === 'PARTIAL').length,
      unavailable: links.filter((l) => l.source_level === 'UNAVAILABLE').length,
      failed: links.filter((l) => l.status === 'failed').length,
      models: []
    };
    const by = new Map();
    for (const r of this.data.runs) {
      if (r.status === 'error') continue;
      const m = by.get(r.model) || { model: r.model, runs: 0, input: 0, output: 0, ms: 0 };
      m.runs++; m.input += r.input_tokens; m.output += r.output_tokens; m.ms += r.latency_ms;
      by.set(r.model, m);
    }
    for (const m of by.values()) o.models.push({ model: m.model, runs: m.runs, input: m.input, output: m.output, avgMs: Math.round(m.ms / m.runs) });
    return o;
  }

  // ------------------------------------------------------------- backup/reset

  exportAll() {
    return { format: 'savemind-backup', version: 1, exported_at: Date.now(), collections: this.allCollections(), links: this.allLinks() };
  }

  importAll(backup) {
    if (!backup || backup.format !== 'savemind-backup') throw new Error('Not a SaveMind backup file');
    const idMap = new Map();
    for (const c of backup.collections || []) {
      const nid = this.createCollection(c.name, false);
      if (nid > 0) idMap.set(c.id, nid);
    }
    let added = 0;
    for (const src of backup.links || []) {
      const url = urlutil.validate(src.url);
      if (!url) continue;
      const norm = urlutil.normalize(src.url);
      if (this.data.links.some((l) => l.normalized_url === norm)) continue;
      const l = blankLink();
      for (const k of Object.keys(l)) {
        if (['id', 'uid', 'dirty', 'origin'].includes(k) || !(k in src) || src[k] == null) continue;
        l[k] = src[k];
      }
      l.collection_id = idMap.has(src.collection_id) ? idMap.get(src.collection_id) : null;
      l.suggested_collection_id = idMap.has(src.suggested_collection_id) ? idMap.get(src.suggested_collection_id) : null;
      if (l.status === 'processing') l.status = 'queued';
      if (!l.saved_at) l.saved_at = Date.now();
      if (!l.updated_at) l.updated_at = Date.now();
      Object.assign(l, { id: this.data.nextLinkId++, normalized_url: norm, uid: crypto.randomUUID(), origin: this.deviceId(), dirty: 1 });
      if (!Array.isArray(l.tags)) l.tags = [];
      if (!Array.isArray(l.steps)) l.steps = [];
      if (!Array.isArray(l.countries)) l.countries = [];
      if (!Array.isArray(l.ref_links)) l.ref_links = [];
      this.data.links.push(l);
      added++;
    }
    this.localChange();
    return added;
  }

  deleteAll() {
    for (const l of this.data.links) if (l.uid) this.tombstone(l.uid, 'link');
    for (const c of this.data.collections) if (c.uid) this.tombstone(c.uid, 'collection');
    this.data.links = [];
    this.data.collections = [];
    this.data.runs = [];
    this.localChange();
  }

  // ---------------------------------------------------------------------- sync

  /** Local changes to upload: collections first, then links, then deletions. */
  outgoing() {
    const out = [];
    const colUid = new Map(this.data.collections.map((c) => [c.id, c.uid]));
    for (const c of this.data.collections) {
      if (!c.dirty) continue;
      out.push({ table: 'collections', uid: c.uid, updatedAt: c.updated_at, item: { id: c.uid, kind: 'collection',
        data: { name: c.name, description: c.description || null, color: c.color, created_at: c.created_at },
        deleted: false, updated_at: c.updated_at } });
    }
    for (const l of this.data.links) {
      if (!l.dirty) continue;
      const data = {};
      for (const f of SYNC_LINK_FIELDS) data[f] = l[f] === undefined ? null : l[f];
      if (data.status === 'processing') data.status = 'queued';
      data.collection = l.collection_id == null ? null : colUid.get(l.collection_id) || null;
      data.suggested_collection = l.suggested_collection_id == null ? null : colUid.get(l.suggested_collection_id) || null;
      out.push({ table: 'links', uid: l.uid, updatedAt: l.updated_at, item: { id: l.uid, kind: 'link', data, deleted: false, updated_at: l.updated_at } });
    }
    for (const t of this.data.tombstones) {
      out.push({ table: 'tombstones', uid: t.uid, updatedAt: t.deleted_at, item: { id: t.uid, kind: t.kind, data: {}, deleted: true, updated_at: t.deleted_at } });
    }
    return out;
  }

  markUploaded(o) {
    if (o.table === 'tombstones') {
      this.data.tombstones = this.data.tombstones.filter((t) => t.uid !== o.uid);
    } else {
      const list = o.table === 'links' ? this.data.links : this.data.collections;
      const row = list.find((x) => x.uid === o.uid);
      if (row && row.updated_at === o.updatedAt) row.dirty = 0;
    }
    this.save();
  }

  markAllDirty() {
    for (const l of this.data.links) l.dirty = 1;
    for (const c of this.data.collections) c.dirty = 1;
    this.save();
  }

  /** Applies a downloaded item when newer. Returns the local link id for a changed link, 0 for other changes, -1 for none. */
  applyRemote(it) {
    const uid = it.id;
    const isCol = it.kind === 'collection';
    const list = isCol ? this.data.collections : this.data.links;
    const local = list.find((x) => x.uid === uid);
    const updatedAt = Number(it.updated_at) || 0;
    const data = it.data || {};
    if (it.deleted) {
      if (!local) return -1;
      if (isCol) {
        for (const l of this.data.links) {
          if (l.collection_id === local.id) l.collection_id = null;
          if (l.suggested_collection_id === local.id) l.suggested_collection_id = null;
        }
        this.data.collections = this.data.collections.filter((c) => c !== local);
        return 0;
      }
      this.data.links = this.data.links.filter((l) => l !== local);
      this.data.runs = this.data.runs.filter((r) => r.link_id !== local.id);
      return local.id;
    }
    if (local && local.updated_at >= updatedAt) return -1;
    if (isCol) {
      const fields = { uid, name: data.name || 'Untitled', description: data.description || null, color: Number(data.color) || 0,
        created_at: Number(data.created_at) || updatedAt, updated_at: updatedAt, dirty: 0 };
      if (local) Object.assign(local, fields);
      else this.data.collections.push(Object.assign({ id: this.data.nextColId++ }, fields));
      return 0;
    }
    if (!data.url) return -1;
    const row = local || Object.assign(blankLink(), { id: this.data.nextLinkId++ });
    for (const f of SYNC_LINK_FIELDS) {
      let v = data[f];
      if (v === undefined || v === null) v = ['tags', 'steps', 'countries', 'ref_links'].includes(f) ? [] : INT_FIELDS.has(f) ? 0 : null;
      if (typeof v === 'boolean') v = v ? 1 : 0;
      row[f] = v;
    }
    if (!row.status) row.status = 'queued';
    if (!row.saved_at) row.saved_at = updatedAt;
    const col = data.collection ? this.data.collections.find((c) => c.uid === data.collection) : null;
    const sug = data.suggested_collection ? this.data.collections.find((c) => c.uid === data.suggested_collection) : null;
    Object.assign(row, { uid, normalized_url: urlutil.normalize(row.url), updated_at: updatedAt, dirty: 0,
      collection_id: col ? col.id : null, suggested_collection_id: sug ? sug.id : null });
    if (!local) this.data.links.push(row);
    return row.id;
  }
}

module.exports = { Store, parseDeadline, SYNC_LINK_FIELDS };
