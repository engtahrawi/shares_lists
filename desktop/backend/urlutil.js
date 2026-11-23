'use strict';
// URL validation, normalization (duplicate detection) and display helpers.
// Mirrors savemind/src/main/java/com/abdallah/savemind/UrlUtil.java.

const URL_IN_TEXT = /(https?:\/\/[^\s<>"]+)|((?<![\w@.])www\.[^\s<>"]+)/i;

const SITE_NAMES = {
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',
  'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'fb.watch': 'Facebook', 'tiktok.com': 'TikTok',
  'x.com': 'X', 'twitter.com': 'X', 'github.com': 'GitHub', 'medium.com': 'Medium', 'reddit.com': 'Reddit',
  'wikipedia.org': 'Wikipedia', 'vimeo.com': 'Vimeo', 't.me': 'Telegram', 'wa.me': 'WhatsApp',
  'threads.net': 'Threads', 'substack.com': 'Substack', 'spotify.com': 'Spotify', 'coursera.org': 'Coursera',
  'udemy.com': 'Udemy', 'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive'
};

function count(s, c) {
  let n = 0;
  for (const ch of s) if (ch === c) n++;
  return n;
}

function trimTrailing(url) {
  let u = url;
  while (u.length) {
    const c = u[u.length - 1];
    if (".,;:!?'\"*".includes(c)) u = u.slice(0, -1);
    else if (c === ')' && count(u, '(') < count(u, ')')) u = u.slice(0, -1);
    else if (c === ']' && count(u, '[') < count(u, ']')) u = u.slice(0, -1);
    else break;
  }
  return u;
}

function findUrl(text) {
  if (!text) return null;
  const m = URL_IN_TEXT.exec(text);
  if (!m) return null;
  let url = trimTrailing(m[0]);
  if (/^www\./i.test(url)) url = 'https://' + url;
  return url;
}

function validate(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s || /\s/.test(s)) {
    const found = findUrl(s);
    if (!found) return null;
    s = found;
  }
  if (!/^https?:\/\//i.test(s)) {
    if (s.includes('://')) return null;
    s = 'https://' + s;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname;
    if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;
    return s;
  } catch (e) {
    return null;
  }
}

const TRACKING = new Set(['fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'igsh', 'mc_cid', 'mc_eid', 'ref_src', 'ref_url',
  '_hsenc', '_hsmi', 'mkt_tok', 'trk', 'trackingid', 'lipi', 'rcm', 'feature', 'si']);

function isTracking(key, host) {
  if (key.startsWith('utm_')) return true;
  if (TRACKING.has(key)) return true;
  if ((key === 's' || key === 't') && host === 'x.com') return true;
  if (key === 'pp' && host === 'youtube.com') return true;
  return false;
}

function normalize(url) {
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    if (host.startsWith('m.')) host = host.slice(2);
    if (host.startsWith('mobile.')) host = host.slice(7);
    if (host === 'twitter.com') host = 'x.com';
    let path = u.pathname || '';
    let query = u.search ? u.search.slice(1) : '';
    if (host === 'youtu.be' && path.length > 1) {
      const id = path.slice(1).split('/')[0];
      host = 'youtube.com';
      path = '/watch';
      query = 'v=' + id + (query ? '&' + query : '');
    }
    if (host === 'youtube.com' && path.startsWith('/shorts/')) {
      const id = path.slice(8);
      path = '/watch';
      query = 'v=' + id + (query ? '&' + query : '');
    }
    const kept = query.split('&').filter(Boolean).filter((part) => {
      let key = part.split('=')[0];
      try { key = decodeURIComponent(key); } catch (e) { /* keep raw */ }
      return !isTracking(key.toLowerCase(), host);
    }).sort();
    while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (path === '/') path = '';
    let out = host;
    if (u.port && u.port !== '80' && u.port !== '443') out += ':' + u.port;
    out += path;
    if (kept.length) out += '?' + kept.join('&');
    return out;
  } catch (e) {
    return String(url).trim().toLowerCase();
  }
}

function domain(url) {
  try {
    let host = new URL(url).hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    if (host.startsWith('m.')) host = host.slice(2);
    return host;
  } catch (e) {
    return url;
  }
}

function siteName(d) {
  if (!d) return '';
  let cur = d;
  for (;;) {
    if (SITE_NAMES[cur]) return SITE_NAMES[cur];
    const dot = cur.indexOf('.');
    if (dot < 0 || cur.indexOf('.', dot + 1) < 0) break;
    cur = cur.slice(dot + 1);
  }
  return d;
}

module.exports = { findUrl, validate, normalize, domain, siteName };
