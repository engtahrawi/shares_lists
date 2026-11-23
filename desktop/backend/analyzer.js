'use strict';
// Background pipeline: queued link, then extraction, then Claude analysis, then validated storage.
// Mirrors savemind/src/main/java/com/abdallah/savemind/Analyzer.java. Work runs one link at a time.

const extractor = require('./extractor');
const claude = require('./claude');
const urlutil = require('./urlutil');
const { parseDeadline } = require('./store');

const ERR_NEEDS_KEY = 'needs_key';
const MAX_ATTEMPTS = 4;

class Analyzer {
  constructor(store, onLinkUpdated) {
    this.store = store;
    this.onLinkUpdated = onLinkUpdated || (() => {});
    this.busy = false;
    this.again = false;
    this.retryTimer = null;
  }

  kick() {
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    this.drain().catch(() => {}).finally(() => {
      this.busy = false;
      if (this.again) { this.again = false; this.kick(); }
    });
  }

  async drain() {
    const s = this.store;
    s.resetStuckProcessing();
    const key = s.apiKey();
    if (!key) {
      for (const l of s.data.links) {
        if (l.status === 'queued' && s.mine(l) && l.error !== ERR_NEEDS_KEY) s.updateLink(l.id, { error: ERR_NEEDS_KEY });
      }
      return;
    }
    for (;;) {
      const link = s.claimNextQueued();
      if (!link) break;
      await this.process(key, link);
    }
    const next = s.nextQueuedAttemptAt();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (next > 0) this.retryTimer = setTimeout(() => this.kick(), Math.max(1000, next - Date.now()));
  }

  async process(key, link) {
    const s = this.store;
    const id = link.id;
    const url = link.url;
    const sharedText = link.shared_text || '';
    const notes = link.notes || '';
    const model = s.model();
    const started = Date.now();
    const page = await extractor.extract(url, sharedText + ' ' + notes);
    const refs = await readRefs(link.ref_links);
    const collections = s.collectionsForPrompt(id);
    const content = buildUserContent(url, page, sharedText, notes, link, collections) + refContent(refs);
    const v = {};
    if (page.siteName) v.site_name = page.siteName;
    if (page.image) v.image_url = page.image;
    if (page.title) v.page_title = page.title;
    try {
      const a = await claude.analyze(key, model, content, languageRule(s.briefLanguage()), collections, parseDeadline);
      let level = page.level;
      if (!a.contentSufficient && level === 'FULL') level = 'PARTIAL';
      for (const r of refs) {
        if (r.level === 'FULL') level = 'FULL';
        else if (r.level === 'PARTIAL' && level === 'UNAVAILABLE') level = 'PARTIAL';
      }
      if (!link.title_locked) v.title = a.title || page.title || urlutil.domain(url);
      v.summary = level === 'UNAVAILABLE'
        ? 'The content of this link could not be retrieved, so no summary was generated. Add context and retry to improve the analysis.'
        : a.summary;
      v.content_type = a.contentType;
      v.topic = a.topic;
      if (!link.tags_locked) v.tags = a.tags;
      if (!link.action_locked) v.action_label = a.action;
      v.confidence = a.confidence;
      v.source_level = level;
      v.status = level === 'FULL' ? 'analyzed' : 'partial';
      v.error = null;
      v.analyzed_at = Date.now();
      v.attempts = 0;
      if (!link.deadline_locked) {
        const d = parseDeadline(a.deadline);
        if (d) {
          v.deadline_at = d.at;
          v.deadline_has_time = d.hasTime ? 1 : 0;
          v.deadline_source = 'claude';
          if (link.deadline_at !== d.at) v.reminded = 0;
        } else {
          v.deadline_at = null;
          v.deadline_has_time = 0;
          v.deadline_source = null;
        }
      }
      if (!link.effort_locked) v.effort_days = a.effortDays > 0 ? a.effortDays : null;
      if (!link.steps_locked) {
        const old = link.steps || [];
        v.steps = a.steps.map((t) => {
          const prev = old.find((o) => String(o.t).toLowerCase() === t.toLowerCase());
          return { t, d: prev ? prev.d : 0 };
        });
      }
      if (!link.countries_locked) v.countries = a.countries;
      if (refs.length) v.ref_links = mergeRefStatus(s.getLink(id), refs);
      if (a.suggestedCollectionId > 0) {
        v.suggested_collection_id = a.suggestedCollectionId;
        v.suggested_new_name = null;
        if (!link.reviewed && s.autoFile() && a.confidence >= 0.8 && link.collection_id == null) {
          v.collection_id = a.suggestedCollectionId;
          v.reviewed = 1;
        }
      } else {
        v.suggested_collection_id = null;
        v.suggested_new_name = a.suggestedNewName;
      }
      s.updateLink(id, v);
      this.onLinkUpdated(id);
      s.logRun(id, model, claude.PROMPT_VERSION, level, 'ok', null, a.inputTokens, a.outputTokens, Date.now() - started);
    } catch (e) {
      const attempts = (link.attempts || 0) + 1;
      v.attempts = attempts;
      if (e.retryable && attempts < MAX_ATTEMPTS) {
        v.status = 'queued';
        v.next_attempt_at = Date.now() + 30000 * Math.pow(2, attempts - 1);
        v.error = e.message;
      } else {
        v.status = 'failed';
        v.error = e.message || 'Analysis failed.';
        if (page.level !== 'UNAVAILABLE' && link.source_level == null) v.source_level = page.level;
      }
      if (!link.title && page.title && !link.title_locked) v.title = page.title;
      s.updateLink(id, v);
      s.logRun(id, model, claude.PROMPT_VERSION, page.level, 'error', e.code || 'error', 0, 0, Date.now() - started);
    }
  }
}

async function readRefs(list) {
  const out = [];
  for (const o of Array.isArray(list) ? list : []) {
    if (out.length >= 5 || !o || !o.url) continue;
    const res = await extractor.extract(o.url, '');
    const body = res.text || res.description || '';
    const status = res.level !== 'UNAVAILABLE' ? 'read' : /40[13]/.test(res.note) ? 'login' : 'failed';
    out.push({ url: o.url, title: res.title, level: res.level, text: body.slice(0, 8000), status });
  }
  return out;
}

function refContent(refs) {
  let s = '';
  let n = 0;
  for (const r of refs) {
    if (r.status !== 'read') continue;
    n++;
    s += '<reference_material n="' + n + '" url="' + r.url.replace(/"/g, '%22') + '">\n';
    if (r.title) s += 'title: ' + r.title + '\n';
    s += r.text + '\n</reference_material>\n';
  }
  return s;
}

/** The current reference links with each one's read status and page title, keeping user changes. */
function mergeRefStatus(current, refs) {
  const cur = current && Array.isArray(current.ref_links) ? current.ref_links : [];
  return cur.map((o) => {
    const r = refs.find((x) => x.url === o.url);
    if (!r) return o;
    const next = Object.assign({}, o, { status: r.status });
    if (r.title) next.title = r.title.slice(0, 120);
    return next;
  });
}

function buildUserContent(url, page, sharedText, notes, link, collections) {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const pad = (n) => (n < 10 ? '0' : '') + n;
  let s = 'Analyze this saved link.\n\n';
  s += '<today>' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' (' + days[now.getDay()] + ')</today>\n';
  s += '<link>' + url + '</link>\n';
  if (page.finalUrl !== url) s += '<final_url>' + page.finalUrl + '</final_url>\n';
  s += '<site>' + urlutil.domain(url) + (page.siteName ? ' (' + page.siteName + ')' : '') + '</site>\n';
  if (link.source_app) s += '<shared_from_app>' + link.source_app + '</shared_from_app>\n';
  s += '<source_access_level>' + page.level + '</source_access_level>\n';
  if (page.note) s += '<retrieval_note>' + page.note + '</retrieval_note>\n';
  s += '<page_metadata>\n';
  const field = (n, v) => { if (v) s += n + ': ' + v + '\n'; };
  field('title', page.title); field('description', page.description); field('type', page.ogType);
  field('author', page.author); field('published', page.published); field('content_type_header', page.contentType);
  s += '</page_metadata>\n';
  if (sharedText.trim() || notes.trim()) {
    s += '<user_context>\n';
    if (sharedText.trim()) s += 'Shared with the link: ' + sharedText.trim() + '\n';
    if (notes.trim()) s += "User's note: " + notes.trim() + '\n';
    s += '</user_context>\n';
  }
  s += '<existing_collections>\n';
  if (!collections.length) s += '(none yet)\n';
  for (const c of collections) s += 'id ' + c.id + ': ' + c.name + (c.examples.length ? ' | e.g. ' + c.examples.join('; ') : '') + '\n';
  s += '</existing_collections>\n';
  if (page.text) s += '<source_content>\n' + page.text + '\n</source_content>\n';
  return s;
}

function languageRule(pref) {
  if (pref === 'en') return 'Write title, summary, topic and tags in English, whatever the source language.';
  if (pref === 'ar') {
    return 'Write title, summary, topic and tags in Modern Standard Arabic, whatever the source language. '
      + 'A suggested new collection name may also be in Arabic.';
  }
  return 'Write title, summary, topic and tags in the main language of the source material '
    + '(for example, Arabic material gets an Arabic summary). Write a suggested new collection name in the '
    + 'language most existing collection names use, or English when there are none.';
}

module.exports = { Analyzer, ERR_NEEDS_KEY, buildUserContent };
