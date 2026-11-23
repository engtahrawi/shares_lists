'use strict';
// Syncs links and collections with the user's Supabase account, using the same protocol as
// savemind/src/main/java/com/abdallah/savemind/Sync.java: dirty items go up through the push_items
// function (last write wins), other devices' changes come down ordered by seq.

const PAGE = 500;
const PUSH_BATCH = 200;

class Sync {
  /**
   * @param store the local Store
   * @param config { url, anonKey }
   * @param hooks { changed(), linkChanged(id), analyze() }
   */
  constructor(store, config, hooks) {
    this.store = store;
    this.config = config;
    this.hooks = hooks;
    this.running = false;
    this.pending = null;
    this.chain = null;
  }

  available() { return !!(this.config.url && this.config.anonKey && this.config.anonKey.length > 40); }

  requestSoon() {
    if (!this.available() || !this.store.signedIn() || this.pending) return;
    this.pending = setTimeout(() => { this.pending = null; this.syncNow(); }, 2000);
  }

  async call(method, path, body, bearer) {
    const headers = { apikey: this.config.anonKey, Authorization: 'Bearer ' + (bearer || this.config.anonKey), Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(this.config.url + path, { method, headers, body: body == null ? undefined : JSON.stringify(body), signal: ctrl.signal });
      return { code: res.status, body: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  // --------------------------------------------------------------------- auth

  storeSession(o, email) {
    if (!o.access_token || !o.refresh_token) return false;
    const user = o.user || {};
    this.store.saveSession(user.email || email, user.id || null, o.access_token, Date.now() + (o.expires_in || 3600) * 1000, o.refresh_token);
    return true;
  }

  static authError(r) {
    let msg = '';
    try {
      const o = JSON.parse(r.body);
      msg = o.msg || o.error_description || o.message || o.error || '';
    } catch (e) { /* keep generic */ }
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login')) return 'Wrong email or password.';
    if (lower.includes('not confirmed')) return 'Confirm your email first: open the link Supabase sent you, then sign in.';
    if (lower.includes('already registered')) return 'This email already has an account. Sign in instead.';
    if (lower.includes('password')) return msg;
    if (r.code === 429) return 'Too many attempts. Wait a minute and try again.';
    return msg || 'Sign-in failed (HTTP ' + r.code + ').';
  }

  afterSignIn() {
    this.store.markAllDirty();
    this.store.prefs.lastSeq = 0;
    this.store.save();
    this.hooks.changed();
    this.syncNow();
  }

  async signIn(email, password, create) {
    if (!this.available()) return { ok: false, error: 'Sync is not set up in this build.' };
    try {
      const r = await this.call('POST', create ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { email: email.trim(), password });
      if (r.code !== 200) return { ok: false, error: Sync.authError(r) };
      const o = JSON.parse(r.body);
      if (create && !o.access_token) return { ok: true, needsConfirm: true };
      if (!this.storeSession(o, email.trim())) return { ok: false, error: 'Unexpected answer from the sync server.' };
      this.afterSignIn();
      return { ok: true, needsConfirm: false };
    } catch (e) {
      return { ok: false, error: 'Could not reach the sync server. Check your connection.' };
    }
  }

  signOut() {
    const s = this.store.session();
    const token = s && s.access;
    this.store.clearSession();
    if (token) this.call('POST', '/auth/v1/logout', {}, token).catch(() => {});
    this.hooks.changed();
  }

  async token() {
    const s = this.store.session();
    if (!s) return null;
    if (s.access && s.expires > Date.now() + 60000) return s.access;
    const refresh = this.store.refreshToken();
    if (!refresh) return null;
    const r = await this.call('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: refresh });
    if (r.code === 200) {
      this.storeSession(JSON.parse(r.body), null);
      return this.store.session().access;
    }
    if (r.code === 400 || r.code === 401) {
      this.store.clearSession();
      this.store.prefs.syncError = 'Signed out. Sign in again to keep syncing.';
      this.store.save();
      this.hooks.changed();
    }
    return null;
  }

  // --------------------------------------------------------------------- sync

  /** Runs a sync after any run already in progress; resolves when it has finished. */
  syncNow() {
    this.chain = (this.chain || Promise.resolve()).then(() => this.runOnce(), () => this.runOnce());
    return this.chain;
  }

  async runOnce() {
    if (!this.available() || !this.store.signedIn()) return;
    this.running = true;
    this.hooks.changed();
    const p = this.store.prefs;
    try {
      const token = await this.token();
      if (!token) return;
      await this.push(token);
      const changed = await this.pull(token);
      p.lastSync = Date.now();
      p.syncError = null;
      if (changed) this.hooks.analyze();
    } catch (e) {
      p.syncError = e && e.sync ? e.message : 'Offline. Changes will sync when you are back online.';
    } finally {
      this.running = false;
      this.store.save();
      this.hooks.changed();
    }
  }

  async push(token) {
    const out = this.store.outgoing();
    for (let i = 0; i < out.length; i += PUSH_BATCH) {
      const batch = out.slice(i, i + PUSH_BATCH);
      const r = await this.call('POST', '/rest/v1/rpc/push_items', { items: batch.map((o) => o.item) }, token);
      if (r.code === 404) throw syncError('Sync is not set up on the server yet: run schema.sql in Supabase.');
      if (r.code !== 200 && r.code !== 204) throw syncError('Upload failed (HTTP ' + r.code + ').');
      for (const o of batch) this.store.markUploaded(o);
    }
  }

  async pull(token) {
    const p = this.store.prefs;
    let since = Math.max(0, (p.lastSeq || 0) - 20);
    let maxSeq = p.lastSeq || 0;
    const all = [];
    for (;;) {
      const r = await this.call('GET', '/rest/v1/items?select=id,kind,data,deleted,updated_at,seq&seq=gt.' + since + '&order=seq.asc&limit=' + PAGE, null, token);
      if (r.code !== 200) throw syncError('Download failed (HTTP ' + r.code + ').');
      const page = JSON.parse(r.body);
      for (const it of page) {
        all.push(it);
        since = Math.max(since, Number(it.seq) || 0);
        maxSeq = Math.max(maxSeq, Number(it.seq) || 0);
      }
      if (page.length < PAGE) break;
    }
    let changed = false;
    for (const pass of [true, false]) {
      for (const it of all) {
        if ((it.kind === 'collection') !== pass) continue;
        const res = this.store.applyRemote(it);
        if (res >= 0) changed = true;
        if (res > 0) this.hooks.linkChanged(res);
      }
    }
    p.lastSeq = maxSeq;
    if (changed) this.store.changed();
    return changed;
  }
}

function syncError(message) {
  const e = new Error(message);
  e.sync = true;
  return e;
}

module.exports = { Sync };
