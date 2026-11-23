'use strict';
// Retrieves public page text and metadata with bounded size, timeouts and no access to private
// networks. Mirrors savemind/src/main/java/com/abdallah/savemind/Extractor.java.

const dns = require('dns').promises;
const net = require('net');
const urlutil = require('./urlutil');

const MAX_BYTES = 1500000;
const MAX_TEXT = 12000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 SaveMind/1.0';

class Blocked extends Error {}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('ff')) return true;
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return false;
}

async function checkHost(host) {
  const h = (host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) throw new Blocked('Link has no host.');
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Blocked('Links to local network addresses are not fetched.');
  }
  const addrs = net.isIP(h) ? [{ address: h }] : await dns.lookup(h, { all: true });
  for (const a of addrs) if (isPrivate(a.address)) throw new Blocked('Links to local network addresses are not fetched.');
}

async function readCapped(res) {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = MAX_BYTES - size;
    if (room <= 0) { try { await reader.cancel(); } catch (e) { /* ignore */ } break; }
    const part = value.length > room ? value.subarray(0, room) : value;
    chunks.push(Buffer.from(part));
    size += part.length;
  }
  return Buffer.concat(chunks);
}

function charsetOf(contentType, body) {
  let m = /charset\s*=\s*["']?([-\w]+)/i.exec(contentType || '');
  if (!m) m = /charset\s*=\s*["']?([-\w]+)/i.exec(body.subarray(0, 4096).toString('latin1'));
  return m ? m[1] : 'utf-8';
}

function decode(body, charset) {
  try { return new TextDecoder(charset).decode(body); } catch (e) { return new TextDecoder('utf-8').decode(body); }
}

/** GET with manual, re-validated redirects, a size cap and no access to private networks. */
async function fetchSafe(startUrl, accept) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Blocked('Unsupported link type.');
    await checkHost(u.hostname);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Language': 'en,ar;q=0.8' }
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) throw new Error('Redirect without location');
        current = new URL(loc, current).toString();
        continue;
      }
      const ct = res.headers.get('content-type') || '';
      const body = await readCapped(res);
      return { code: res.status, finalUrl: current, contentType: ct.toLowerCase().split(';')[0].trim(), charset: charsetOf(ct, body), body };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Too many redirects');
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', middot: '·' };

function decodeEntities(s) {
  if (!s || s.indexOf('&') < 0) return s || '';
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    try {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return String.fromCodePoint(cp);
      }
    } catch (err) {
      return m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

function stripTags(s) { return s.replace(/<[^>]*>/g, ' '); }

function htmlToText(html) {
  if (!html) return '';
  let s = html.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article|pre)>/gi, '\n');
  s = decodeEntities(stripTags(s));
  s = s.replace(/[ \t\v\f\r ]+/g, ' ').replace(/ *\n[ \n]*/g, '\n');
  return s.trim();
}

function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = m[3] != null ? m[3] : m[4] != null ? m[4] : m[5];
  return out;
}

function first(meta, ...keys) {
  for (const k of keys) if (meta[k] && meta[k].trim()) return meta[k].trim();
  return '';
}

function clean(s, max) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/** Raw (still escaped) value of the first "key":"..." in a page, scanned linearly. */
function jsonStringValue(html, key) {
  const marker = '"' + key + '":"';
  let start = html.indexOf(marker);
  if (start < 0) return null;
  start += marker.length;
  const limit = Math.min(html.length, start + 20000);
  for (let i = start; i < limit; i++) {
    const c = html[i];
    if (c === '\\') i++;
    else if (c === '"') return html.slice(start, i);
  }
  return null;
}

function section(html, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*)</' + tag + '>', 'i').exec(html);
  return m ? m[1] : '';
}

function mainText(html) {
  let h = html.replace(/<head\b[\s\S]*?<\/head>/gi, ' ');
  h = h.replace(/<(script|style|noscript|svg|template|iframe|canvas|select)\b[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<!--[\s\S]*?-->/g, ' ');
  let scope = section(h, 'article');
  if (scope.length < 600) {
    const main = section(h, 'main');
    if (main.length > scope.length) scope = main;
  }
  if (scope.length < 600) scope = h;
  scope = scope.replace(/<(nav|header|footer|aside|form|button)\b[\s\S]*?<\/\1>/gi, ' ');
  return htmlToText(scope);
}

function parseHtml(html, r, dom) {
  const meta = {};
  const re = /<meta\s[^>]*>/gi;
  let m;
  let scanned = 0;
  while ((m = re.exec(html)) && scanned++ < 400) {
    const a = attrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (!key || a.content == null) continue;
    if (!(key in meta)) meta[key] = decodeEntities(a.content);
  }
  const ogTitle = first(meta, 'og:title', 'twitter:title');
  if (!r.title) {
    if (ogTitle) r.title = ogTitle;
    else {
      const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
      if (t) r.title = decodeEntities(stripTags(t[1]));
    }
  }
  if (!r.description) r.description = first(meta, 'og:description', 'description', 'twitter:description');
  if (!r.siteName) r.siteName = first(meta, 'og:site_name', 'application-name');
  if (!r.ogType) r.ogType = first(meta, 'og:type');
  if (!r.author) r.author = first(meta, 'author', 'article:author', 'twitter:creator');
  r.published = first(meta, 'article:published_time', 'datepublished', 'date', 'og:updated_time');
  if (!r.image) {
    const img = first(meta, 'og:image', 'og:image:url', 'twitter:image');
    if (img.startsWith('https://')) r.image = img;
  }
  if (dom.endsWith('youtube.com') || dom === 'youtu.be') {
    const raw = jsonStringValue(html, 'shortDescription');
    if (raw != null) {
      let desc;
      try { desc = JSON.parse('"' + raw + '"'); } catch (e) { desc = raw.replace(/\\n/g, '\n'); }
      if (desc.length > r.description.length) r.description = desc;
      if (!r.text) r.text = desc.length >= 400 ? desc : '';
    }
    return;
  }
  if (!r.text) r.text = mainText(html);
}

async function oembed(url, dom, r) {
  const enc = encodeURIComponent(url);
  let endpoint = null;
  if (dom.endsWith('youtube.com') || dom === 'youtu.be') endpoint = 'https://www.youtube.com/oembed?format=json&url=' + enc;
  else if (dom.endsWith('tiktok.com')) endpoint = 'https://www.tiktok.com/oembed?url=' + enc;
  else if (dom === 'x.com' || dom === 'twitter.com') endpoint = 'https://publish.twitter.com/oembed?omit_script=1&url=' + enc;
  else if (dom.endsWith('vimeo.com')) endpoint = 'https://vimeo.com/api/oembed.json?url=' + enc;
  if (!endpoint) return;
  try {
    const res = await fetchSafe(endpoint, 'application/json');
    if (res.code !== 200) return;
    const o = JSON.parse(res.body.toString('utf8'));
    if (o.title) r.title = o.title;
    if (o.author_name) r.author = o.author_name;
    if (o.provider_name) r.siteName = o.provider_name;
    if (o.thumbnail_url && String(o.thumbnail_url).startsWith('https://')) r.image = o.thumbnail_url;
    if ((dom === 'x.com' || dom === 'twitter.com') && o.html) {
      const post = htmlToText(o.html);
      if (post) { r.text = post; r.ogType = 'social post'; }
    }
    if (dom.endsWith('vimeo.com') && o.description) r.description = o.description;
  } catch (e) {
    // oEmbed is best effort
  }
}

async function extract(url, sharedText) {
  const r = { finalUrl: url, title: '', description: '', siteName: '', ogType: '', author: '', published: '', image: '', text: '', contentType: '', note: '', level: 'UNAVAILABLE' };
  const dom = urlutil.domain(url);
  await oembed(url, dom, r);
  try {
    const res = await fetchSafe(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
    r.finalUrl = res.finalUrl;
    r.contentType = res.contentType;
    if (res.code >= 400) r.note = 'The site answered with HTTP ' + res.code + '.';
    else if (res.contentType.includes('html') || !res.contentType) parseHtml(decode(res.body, res.charset), r, dom);
    else r.note = 'Linked file of type ' + res.contentType + '; content is not read.';
  } catch (e) {
    if (e instanceof Blocked) r.note = e.message;
    else if (!r.note) r.note = 'The page could not be retrieved (' + (e.name || 'Error') + ').';
  }
  r.title = clean(r.title, 300);
  r.description = clean(r.description, 1200);
  if (r.text.length > MAX_TEXT) r.text = r.text.slice(0, MAX_TEXT);
  const metaLen = r.title.length + r.description.length + (sharedText ? sharedText.trim().length : 0);
  if (r.text.length >= 400) r.level = 'FULL';
  else if (metaLen >= 20 || r.text.length >= 80) r.level = 'PARTIAL';
  else r.level = 'UNAVAILABLE';
  return r;
}

module.exports = { extract, parseHtml, decodeEntities, isPrivate, htmlToText };
