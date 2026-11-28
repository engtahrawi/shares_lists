/* SaveMind interface. Data lives natively (SQLite); this page renders it through the SM bridge. */
(function () {
  'use strict';

  var ACTIONS = ['Read Later', 'Watch Later', 'Listen Later', 'Try Tool', 'Apply', 'Register', 'Buy', 'Review', 'Reference', 'Follow Up'];
  var TYPE_LABELS = {
    article: 'Article', video: 'Video', tool: 'Tool', code_repository: 'Repository', course: 'Course',
    opportunity: 'Opportunity', event: 'Event', social_post: 'Post', document: 'Document', product: 'Product',
    news: 'News', podcast: 'Podcast', other: 'Link'
  };
  var MODELS = [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', desc: 'Best quality briefs and collection matching. Default.', price: [4, 20] },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', desc: 'Faster, about half the cost of Opus.', price: [2, 10] },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', desc: 'Fastest and lowest cost.', price: [0.1, 0.5] }
  ];
  var COLORS = [
    ['#E6EBFF', '#2446E0'], ['#FFF1DB', '#8A5300'], ['#E3F4EA', '#1D6B3F'], ['#F1E6E6', '#8A2E2E'],
    ['#EEF0F4', '#3A3F4B'], ['#F3E8FF', '#6B3FA0'], ['#E0F2F7', '#0B6E82']
  ];

  var I = {
    home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7v9H3z"/></svg>',
    inbox: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z"/></svg>',
    folder: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
    search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    plus: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    heart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    heartOn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    check: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    grid: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    doc: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>',
    lock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    bookmark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16l-7-3.8L5 21V5a2 2 0 0 1 2-2z"/></svg>',
    plusSm: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    planner: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 14h3M8 17h6"/></svg>',
    grip: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    chevron: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    searchSm: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    link: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'
  };

  // ------------------------------------------------------------------ state

  var S = { links: [], collections: [], settings: {}, version: '' };
  var nav = ['#/home'];
  var dirty = false;
  var searchState = { q: '', filter: 'all' };
  var addState = { url: '', context: '', copy: false, dup: null, error: '' };
  var planOpen = {};
  var refsOpen = {};
  var collMode = 'collections';
  var welcomeStep = 1;
  var countryFilter = 'open';
  var desk = false;
  var web = false;
  var dashTable = {};
  var paneId = null;
  var showMissed = false;
  var callbacks = {};
  var callbackSeq = 1;

  function load() {
    try { S = JSON.parse(SM.getState()); } catch (e) { /* keep last state */ }
    web = S.platform === 'web';
    desk = S.platform === 'mac' || (web && window.innerWidth >= 960);
    document.body.classList.toggle('web', web);
    document.body.classList.toggle('desk', desk);
  }
  /** Adding and analyzing links happens in the phone and Mac apps; the web dashboard reads and edits. */
  function canAnalyze() { return !web; }
  function deviceWord() {
    if (web) return 'browser'; return desk ? 'Mac' : 'phone'; }

  function linkById(id) {
    for (var i = 0; i < S.links.length; i++) if (S.links[i].id === id) return S.links[i];
    return null;
  }
  function collectionById(id) {
    if (id === null || id === undefined) return null;
    for (var i = 0; i < S.collections.length; i++) if (S.collections[i].id === id) return S.collections[i];
    return null;
  }
  function countIn(cid) {
    var n = 0;
    S.links.forEach(function (l) { if (!l.archived && l.collection_id === cid) n++; });
    return n;
  }
  function inboxItems() {
    return S.links.filter(function (l) { return !l.reviewed && !l.archived; });
  }

  // ---------------------------------------------------------------- helpers

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function domainOf(url) {
    var m = /^https?:\/\/([^\/?#:]+)/i.exec(url || '');
    var h = m ? m[1].toLowerCase() : (url || '');
    return h.replace(/^www\./, '').replace(/^m\./, '');
  }
  function shortUrl(url) { return String(url || '').replace(/^https?:\/\/(www\.)?/i, ''); }
  function ago(ms) {
    var d = Date.now() - ms;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
    if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
    var dt = new Date(ms), now = new Date();
    var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (dt >= y) return 'Yesterday';
    return dateShort(ms);
  }
  function dateShort(ms) {
    var dt = new Date(ms);
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()];
    var s = dt.getDate() + ' ' + m;
    if (dt.getFullYear() !== new Date().getFullYear()) s += ' ' + dt.getFullYear();
    return s;
  }
  function titleOf(l) { return l.title || l.page_title || shortUrl(l.url); }
  function siteOf(l) { return l.site_name || domainOf(l.url); }
  function colorOf(c) { return COLORS[(c && c.color ? c.color : 0) % COLORS.length]; }
  function hashColor(s) {
    var h = 0; s = String(s || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return COLORS[Math.abs(h) % COLORS.length];
  }
  function initials(name) {
    var words = String(name || '').replace(/[!-\/:-@\[-`{-~\u00B7\u2010-\u2027]/g, ' ').trim().split(/\s+/);
    if (!words[0]) return '#';
    return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
  }
  function isWatch(label) { return /watch|listen/i.test(label || ''); }
  function actionText(l) { return l.action_label || 'Open'; }
  function normalizeSearch(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ْٰـ]/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  }

  // -------------------------------------------------------------- deadlines

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function hasDeadline(l) { return l.deadline_at !== null && l.deadline_at !== undefined; }
  function startOfDay(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Countdown, tone and label for a link's deadline, or null when it has none. */
  function deadlineInfo(l) {
    if (!hasDeadline(l)) return null;
    var passed = l.deadline_at < Date.now();
    var days = Math.round((startOfDay(l.deadline_at) - startOfDay(Date.now())) / 86400000);
    var tone = passed ? 'closed' : days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'later';
    var label = passed ? 'Closed' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days <= 3 ? days + ' days left' : days + ' days';
    return { passed: passed, days: days, tone: tone, label: label };
  }

  function deadlineFull(l) {
    var d = new Date(l.deadline_at);
    var s = WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    if (l.deadline_has_time) s += ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    return s;
  }

  function dateTile(l, big) {
    var d = new Date(l.deadline_at);
    var info = deadlineInfo(l);
    return '<div class="dtile ' + info.tone + (big ? ' big' : '') + '" aria-hidden="true"><span class="m">' + MONTHS[d.getMonth()].toUpperCase()
      + '</span><span class="d">' + d.getDate() + '</span></div>';
  }

  function deadlineChip(l) {
    var info = deadlineInfo(l);
    return info ? '<span class="dchip ' + info.tone + '">' + esc(info.label) + '</span>' : '';
  }

  /** Upcoming deadlines first (soonest first), then passed ones (most recent first). */
  function byDeadline(a, b) {
    var now = Date.now(), pa = a.deadline_at < now, pb = b.deadline_at < now;
    if (pa !== pb) return pa ? 1 : -1;
    return pa ? b.deadline_at - a.deadline_at : a.deadline_at - b.deadline_at;
  }

  function upcomingDeadlines() {
    var now = Date.now();
    return S.links.filter(function (l) { return !l.archived && hasDeadline(l) && l.deadline_at >= now; })
      .sort(function (a, b) { return a.deadline_at - b.deadline_at; });
  }

  function deadlineRow(l) {
    var col = collectionById(l.collection_id);
    return '<button class="drow" data-act="open" data-id="' + l.id + '">' + dateTile(l, false)
      + '<div class="col grow"><p class="t clamp2" dir="auto">' + esc(titleOf(l)) + '</p>'
      + '<span class="src" dir="auto">' + esc(col ? col.name : 'Inbox') + (l.action_label ? ' · ' + esc(l.action_label) : '') + '</span></div>'
      + deadlineChip(l) + '</button>';
  }

  function deadlineBlock(l) {
    var info = deadlineInfo(l);
    if (!info) {
      var expects = l.content_type === 'opportunity' || l.content_type === 'event' || l.content_type === 'course';
      if (!expects) return '';
      return '<section class="dblock none" aria-label="Deadline"><div class="col grow"><span class="dlabel">Deadline</span>'
        + '<span class="s">' + (l.status === 'analyzed' || l.status === 'partial' ? 'No deadline found in this link.' : 'Not known yet.') + '</span></div>'
        + '<button class="btn sec" style="min-height:38px" data-act="deadline" data-id="' + l.id + '">Add deadline</button></section>';
    }
    var src = l.deadline_source === 'user' ? 'Set by you' : 'Found by Claude';
    if (l.remind_days && !info.passed) src += ' · Reminder ' + (l.remind_days === 7 ? '1 week' : l.remind_days + ' days') + ' before';
    return '<section class="dblock ' + info.tone + '" aria-label="Deadline">' + dateTile(l, true)
      + '<div class="col grow" style="gap:4px"><span class="dlabel">Deadline · ' + esc(info.label) + '</span>'
      + '<span class="dfull">' + esc(deadlineFull(l)) + '</span><span class="src">' + esc(src) + '</span></div>'
      + '<button class="btn sec" style="min-height:36px;padding:0 12px;align-self:flex-start" data-act="deadline" data-id="' + l.id + '" aria-label="Edit deadline">Edit</button></section>';
  }

  // -------------------------------------------------------------- dashboard

  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function mondayOf(ms) {
    var d = new Date(startOfDay(ms));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  }
  function addDays(ms, n) { var d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function dueIn(l) { return Math.round((startOfDay(l.deadline_at) - startOfDay(Date.now())) / DAY); }
  function fmtDays(n) { n = Math.round(n * 10) / 10; return n + ' day' + (n === 1 ? '' : 's'); }
  function relDay(l) { var d = dueIn(l); return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'; }

  /** Work still to do for each of the next n weeks, counted in the week of each deadline. */
  function workload(n) {
    var start = mondayOf(Date.now());
    var weeks = [];
    for (var i = 0; i < n; i++) weeks.push({ start: addDays(start, 7 * i), need: 0, items: [] });
    plannerOrder().forEach(function (x) {
      var k = Math.floor((startOfDay(x.l.deadline_at) - start) / (7 * DAY));
      if (k < 0 || k >= n) return;
      weeks[k].need += x.p.remaining;
      weeks[k].items.push(x);
    });
    weeks.forEach(function (w) { w.need = Math.round(w.need * 10) / 10; });
    return weeks;
  }

  function tableToggle(key) {
    return '<button class="link" data-act="dashTable" data-v="' + key + '">' + (dashTable[key] ? 'Chart view' : 'Table view') + '</button>';
  }

  function kpi(label, value, sub, color) {
    return '<div class="kpi"><span class="kl">' + esc(label) + '</span><span class="kv"' + (color ? ' style="color:' + color + '"' : '') + '>' + esc(value) + '</span>'
      + '<span class="src clamp2" dir="auto">' + esc(sub) + '</span></div>';
  }

  function viewDashboard() {
    var now = new Date();
    var opps = S.links.filter(function (l) { return !l.archived && (needsCountry(l) || hasDeadline(l)); });
    var open = opps.filter(isOpen);
    var countries = {};
    open.forEach(function (l) { countriesOf(l).forEach(function (c) { countries[c] = (countries[c] || 0) + 1; }); });
    var nCountries = Object.keys(countries).length;
    var soon = open.filter(function (l) { return hasDeadline(l) && dueIn(l) < 7; }).sort(function (a, b) { return a.deadline_at - b.deadline_at; });
    var weeks = workload(6);
    var four = weeks.slice(0, 4);
    var planned = four.reduce(function (t, w) { return t + w.need; }, 0);
    var over = four.filter(function (w) { return w.need > 5; }).length;
    var stepsTotal = 0, stepsDone = 0;
    open.forEach(function (l) {
      stepsTotal += stepsOf(l).length;
      stepsDone += stepsOf(l).filter(function (x) { return x.d; }).length;
    });
    var name = S.settings.name || '';
    var greet = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

    var h = '<div class="body dash"><div class="row between wrap" style="align-items:flex-end;gap:12px"><div class="col" style="gap:2px">'
      + '<span class="s">' + WEEKDAYS[now.getDay()] + ', ' + now.getDate() + ' ' + MONTH_NAMES[now.getMonth()] + '</span>'
      + '<h1 class="h1" dir="auto">' + esc(greet + (name ? ', ' + name : '')) + '</h1></div>'
      + '<button class="btn pri" style="background:var(--ink);min-height:40px" data-tab="#/planner">Open Planner</button></div>';

    if (!opps.length) {
      return h + '<div class="card empty"><div class="big">' + I.grid + '</div><p class="t">Your dashboard fills up as you save opportunities</p>'
        + '<p class="s">' + (web ? 'Save links with the SaveMind app on Android or Mac; they appear here within seconds.' : 'Share an opportunity to SaveMind or add a link.') + '</p></div></div>';
    }

    h += '<section class="kpis" aria-label="Summary">'
      + kpi('Open opportunities', String(open.length), nCountries ? 'across ' + nCountries + ' countr' + (nCountries === 1 ? 'y' : 'ies') : 'no countries yet')
      + kpi('Closing this week', String(soon.length), soon.length ? 'next: ' + titleOf(soon[0]) + ', ' + relDay(soon[0]) : 'nothing this week', soon.length ? 'var(--red)' : '')
      + kpi('Work planned, next 4 weeks', fmtDays(planned), over ? over + ' week' + (over === 1 ? ' is' : 's are') + ' overloaded' : 'no overloaded weeks')
      + '<div class="kpi"><span class="kl">Preparation steps done</span><span class="kv">' + stepsDone + ' <small>of ' + stepsTotal + '</small></span>'
      + '<div class="pbar" style="flex:none;width:100%"><div style="width:' + (stepsTotal ? Math.round(100 * stepsDone / stepsTotal) : 0) + '%"></div></div></div>'
      + '</section>';

    h += '<div class="dgrid">' + calendarCard() + workloadCard(weeks) + '</div>';
    h += '<div class="dgrid">' + countryCard(countries) + upNextCard() + '</div>';
    return h + '</div>';
  }

  function calendarCard() {
    var start = mondayOf(Date.now());
    var today = startOfDay(Date.now());
    var byDay = {};
    S.links.forEach(function (l) {
      if (l.archived || !hasDeadline(l)) return;
      var k = startOfDay(l.deadline_at);
      (byDay[k] = byDay[k] || []).push(l);
    });
    var h = '<section class="card dcard" aria-label="Deadlines, next 5 weeks"><div class="row between"><h2 class="h2">Deadlines, next 5 weeks</h2>' + tableToggle('cal') + '</div>';
    var i, d;
    if (dashTable.cal) {
      var rows = [];
      for (i = 0; i < 35; i++) (byDay[startOfDay(addDays(start, i))] || []).forEach(function (l) { rows.push(l); });
      h += rows.length ? '<table class="dtable"><thead><tr><th>Date</th><th>Opportunity</th><th>Status</th></tr></thead><tbody>' + rows.map(function (l) {
        return '<tr><td>' + esc(shortDate(l.deadline_at)) + '</td><td dir="auto">' + esc(titleOf(l)) + '</td><td>' + esc(deadlineInfo(l).label) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="s">No deadlines in the next 5 weeks.</p>';
      return h + '</section>';
    }
    h += '<div class="cal cal-head" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="cal">';
    for (i = 0; i < 35; i++) {
      d = startOfDay(addDays(start, i));
      var dt = new Date(d);
      var label = (dt.getDate() === 1 || i === 0) ? dt.getDate() + ' ' + MONTHS[dt.getMonth()] : String(dt.getDate());
      var items = byDay[d] || [];
      h += '<div class="cday' + (d === today ? ' today' : '') + (d < today ? ' past' : '') + '"><span>' + label + (d === today ? ' · today' : '') + '</span>'
        + items.slice(0, 2).map(function (l) {
          return '<button class="cpill ' + deadlineInfo(l).tone + '" data-act="open" data-id="' + l.id + '" data-tip="' + esc(titleOf(l) + ' · ' + deadlineFull(l)) + '" dir="auto">' + esc(titleOf(l)) + '</button>';
        }).join('') + (items.length > 2 ? '<span class="src">+' + (items.length - 2) + ' more</span>' : '') + '</div>';
    }
    h += '</div><div class="row wrap legend" style="gap:14px"><span><i style="background:var(--red)"></i>3 days or less</span>'
      + '<span><i style="background:var(--amber-soft);border:1px solid #C27A12"></i>4 to 14 days</span>'
      + '<span><i style="background:var(--soft);border:1px solid #B0B5C0"></i>Later</span></div>';
    return h + '</section>';
  }

  function workloadCard(weeks) {
    var max = Math.max(10, Math.ceil(Math.max.apply(null, weeks.map(function (w) { return w.need; }))));
    var h = '<section class="card dcard" aria-label="Workload by week"><div class="row between"><h2 class="h2">Workload by week</h2>' + tableToggle('work') + '</div>'
      + '<span class="s">Days of work due each week, against 5 working days</span>';
    if (dashTable.work) {
      return h + '<table class="dtable"><thead><tr><th>Week of</th><th>Days needed</th><th>Opportunities</th></tr></thead><tbody>' + weeks.map(function (w) {
        return '<tr><td>' + esc(shortDate(w.start)) + '</td><td>' + w.need + (w.need > 5 ? ' (over)' : '') + '</td><td dir="auto">'
          + esc(w.items.map(function (x) { return titleOf(x.l); }).join(', ') || '-') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    }
    h += '<div class="wchart"><span class="wy top">' + max + '</span><span class="wy bottom">0</span>'
      + '<div class="wcap" style="bottom:' + (100 * 5 / max) + '%"><span>5 working days</span></div><div class="wbars">'
      + weeks.map(function (w) {
        var pct = w.need ? Math.max(1.5, 100 * w.need / max) : 0;
        var tip = 'Week of ' + shortDate(w.start) + ': ' + fmtDays(w.need) + ' of work'
          + (w.items.length ? ' (' + w.items.map(function (x) { return titleOf(x.l); }).join(', ') + ')' : '');
        return '<div class="wcol" data-tip="' + esc(tip) + '" tabindex="0" aria-label="' + esc(tip) + '">'
          + (w.need > 5 ? '<span class="wval">' + w.need + '</span>' : '')
          + '<div class="wbar' + (w.need > 5 ? ' over' : '') + '" style="height:' + pct + '%"></div></div>';
      }).join('') + '</div></div><div class="wlabels">' + weeks.map(function (w) { return '<span>' + esc(shortDate(w.start)) + '</span>'; }).join('') + '</div>';
    var overW = weeks.filter(function (w) { return w.need > 5; });
    if (overW.length) {
      var first = overW[0].items.slice().sort(function (a, b) { return b.p.remaining - a.p.remaining; })[0];
      h += '<div class="notice" style="padding:10px 12px"><p class="s"><b style="color:var(--amber)">' + overW.length + ' week' + (overW.length === 1 ? ' is' : 's are') + ' overloaded.</b> '
        + (first ? 'Start ' + esc(titleOf(first.l)) + ' early to spread the work.' : '') + '</p></div>';
    }
    return h + '</section>';
  }

  function countryCard(countries) {
    var list = Object.keys(countries).map(function (c) { return { c: c, n: countries[c] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    var h = '<section class="card dcard" aria-label="Open opportunities by country"><div class="row between"><h2 class="h2">Open opportunities by country</h2>' + (list.length ? tableToggle('country') : '') + '</div>';
    if (!list.length) return h + '<p class="s">Countries appear when Claude labels your opportunities.</p></section>';
    if (dashTable.country) {
      return h + '<table class="dtable"><thead><tr><th>Country</th><th>Open</th></tr></thead><tbody>' + list.map(function (x) {
        return '<tr><td>' + esc(countryName(x.c)) + '</td><td>' + x.n + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    }
    var max = list[0].n;
    return h + '<div class="hbars">' + list.map(function (x) {
      return '<button class="hrow" data-go="#/country/' + esc(x.c) + '" data-tip="' + esc(countryName(x.c) + ': ' + x.n + ' open') + '"><span class="hl">' + esc(countryName(x.c)) + '</span>'
        + '<span class="htrack"><span class="hbar" style="width:' + (100 * x.n / max) + '%"></span></span><span class="hv">' + x.n + '</span></button>';
    }).join('') + '</div></section>';
  }

  function upNextCard() {
    var order = plannerOrder().slice(0, 5);
    var h = '<section class="card dcard" aria-label="Up next"><div class="row between"><h2 class="h2">Up next</h2><button class="link" data-tab="#/planner">All in Planner</button></div>';
    if (!order.length) return h + '<p class="s">No open deadlines.</p></section>';
    return h + '<div class="dlist" style="box-shadow:none">' + order.map(function (x, n) { return planRow(x, n + 1); }).join('') + '</div></section>';
  }

  function viewLogin() {
    var acc = S.account || {};
    var points = ['See every deadline on a calendar, colored by how close it is.',
      'Spot overloaded weeks before they happen and start the right application first.',
      'Same account as the SaveMind app on Android and Mac. Changes sync both ways.'];
    return '<div class="login"><section class="lpitch" aria-label="About SaveMind"><div class="row" style="gap:12px"><span class="slogo" style="width:40px;height:40px;border-radius:11px">' + I.bookmark + '</span>'
      + '<span style="font-family:var(--display);font-size:24px;font-weight:800">SaveMind</span></div>'
      + '<h1 class="h1 lhead">Every opportunity you saved, planned on one screen.</h1><div class="col" style="gap:14px">'
      + points.map(function (t, i) { return '<div class="row" style="gap:12px;align-items:flex-start"><span class="lnum">' + (i + 1) + '</span><span style="opacity:.9;line-height:1.5">' + t + '</span></div>'; }).join('')
      + '</div></section><section class="lform" aria-label="Sign in"><div class="card" style="max-width:400px;width:100%;padding:28px;gap:12px;box-sizing:border-box">'
      + '<h2 class="h1" style="font-size:26px">Sign in</h2><p class="s">Use the email and password from your SaveMind app.</p>'
      + (acc.available ? '<label class="lbl" for="accEmail">Email</label><input id="accEmail" class="inp" type="email" autocomplete="username" autocapitalize="off" spellcheck="false">'
        + '<label class="lbl" for="accPass">Password</label><input id="accPass" class="inp" type="password" autocomplete="current-password">'
        + '<button class="btn pri" data-act="signIn">Sign in</button><span id="authResult" class="src" role="status"></span>'
        + '<div class="row" style="gap:10px"><span style="flex:1;height:1px;background:var(--line)"></span><span class="src">New to SaveMind?</span><span style="flex:1;height:1px;background:var(--line)"></span></div>'
        + '<button class="btn sec" data-act="signUp">Create an account</button>'
        : '<p class="bad">Sync is not set up for this site.</p>')
      + '<a class="link" href="guide.html" target="_blank" rel="noopener" style="text-align:center">How SaveMind works: read the guide (Arabic)</a>'
      + '<p class="src">Your links are stored on the SaveMind sync server and visible only to your account. Save new links with the Android or Mac app; they appear here within seconds.</p>'
      + '</div></section></div>';
  }

  // ---------------------------------------------------------------- welcome

  function needsWelcome() { return !web && !S.settings.onboarded; }

  function welcomeDots() {
    return '<div class="row" style="gap:6px;justify-content:center" aria-label="Step ' + welcomeStep + ' of 3">'
      + [1, 2, 3].map(function (n) { return '<span class="wdot' + (n === welcomeStep ? ' on' : '') + '"></span>'; }).join('') + '</div>';
  }

  function viewWelcome() {
    var st = S.settings, acc = S.account || {};
    var h = '<div class="body welcome">' + welcomeDots();
    if (welcomeStep === 1) {
      h += '<div class="col" style="align-items:center;gap:10px;text-align:center;padding-top:8px"><span class="slogo" style="width:64px;height:64px;border-radius:18px">' + I.bookmark + '</span>'
        + '<h1 class="h1">Welcome to SaveMind</h1><p class="s">Save links from any app. Claude writes a short brief, finds deadlines, files each link and plans which opportunity to work on first.</p></div>'
        + '<div class="card" style="gap:10px">'
        + '<div class="row" style="gap:10px;align-items:flex-start"><span class="wnum">1</span><span class="s">Share a link from WhatsApp, LinkedIn, YouTube or your browser and choose SaveMind' + (desk ? ', or press + Add link.' : '.') + '</span></div>'
        + '<div class="row" style="gap:10px;align-items:flex-start"><span class="wnum">2</span><span class="s">Claude reads it and suggests a collection, a deadline, a country and the next step.</span></div>'
        + '<div class="row" style="gap:10px;align-items:flex-start"><span class="wnum">3</span><span class="s">The Planner shows what to start today so deadlines never pile up.</span></div></div>'
        + '<label class="lbl" for="wName">What should SaveMind call you?</label>'
        + '<input id="wName" class="inp" dir="auto" maxlength="40" autocomplete="given-name" placeholder="Your first name" value="' + esc(st.name || '') + '">'
        + '<div style="flex:1"></div><button class="btn pri big" data-act="wNext1">Continue</button>';
    } else if (welcomeStep === 2) {
      h += '<div class="col" style="gap:6px"><h1 class="h1" style="font-size:26px">Connect Claude</h1>'
        + '<p class="s">SaveMind uses Claude, by Anthropic, to read links. It needs your own API key; usage is billed to your Anthropic account, usually a few cents per link (less with Claude Haiku, chosen in Settings).</p></div>'
        + '<div class="card" style="gap:8px"><p class="t" style="font-size:14px">How to get a key</p>'
        + '<p class="s">1. Open console.anthropic.com and sign up.<br>2. Add a small amount of credit under Billing.<br>3. Create a key under API Keys and paste it here.</p>'
        + '<button class="link" style="text-align:start" data-act="getKey">Open console.anthropic.com ↗</button></div>';
      if (st.hasKey) {
        h += '<p class="ok">Key saved: ' + esc(st.keyHint) + '</p>';
      } else {
        h += '<label class="lbl" for="setKey">API key</label><input id="setKey" class="inp" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…">'
          + '<span id="keyResult" class="src">The key is encrypted on this ' + deviceWord() + ' and never synced.</span>';
      }
      h += '<div style="flex:1"></div>'
        + (st.hasKey ? '<button class="btn pri big" data-act="wNext2">Continue</button>'
          : '<button class="btn pri big" data-act="wSaveKey">Save key and continue</button><button class="btn ghost" data-act="wNext2">Skip for now. Links are still saved.</button>');
    } else {
      h += '<div class="col" style="gap:6px"><h1 class="h1" style="font-size:26px">Sync (optional)</h1>'
        + '<p class="s">Use SaveMind on your phone and Mac with the same links. Without an account, everything stays on this ' + deviceWord() + ' only.</p></div>';
      if (acc.signedIn) {
        h += '<div class="card"><p class="ok">Signed in as ' + esc(acc.email) + '</p><p class="s">Your links sync automatically.</p></div>';
      } else if (acc.available) {
        h += '<div class="card" style="gap:10px"><label class="lbl" for="accEmail">Email</label><input id="accEmail" class="inp" type="email" autocomplete="username" autocapitalize="off" spellcheck="false">'
          + '<label class="lbl" for="accPass">Password</label><input id="accPass" class="inp" type="password" autocomplete="new-password" placeholder="At least 6 characters">'
          + '<div class="row"><button class="btn sec flex1" data-act="signIn">Sign in</button><button class="btn pri flex1" data-act="signUp">Create account</button></div>'
          + '<span id="authResult" class="src"></span></div>'
          + '<p class="src">Synced links are stored on the SaveMind sync server (Supabase), run by the person who shared this app with you. Access rules let each account read only its own links. Your Claude key is never uploaded.</p>';
      }
      h += '<div style="flex:1"></div><button class="btn pri big" data-act="wDone">' + (acc.signedIn ? 'Start using SaveMind' : 'Use on this ' + deviceWord() + ' only') + '</button>';
    }
    return h + '</div>';
  }

  function finishWelcome() {
    saveSettings({ onboarded: true });
    S.settings.onboarded = true;
    welcomeStep = 1;
    nav = ['#/home'];
    render(true);
  }

  // -------------------------------------------------------------- countries

  var ISO_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
  var COUNTRY_TYPES = ['opportunity', 'event', 'course'];
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (e) { regionNames = null; }

  function countryName(code) {
    if (code === 'ONLINE') return 'Online / anywhere';
    if (code === 'NONE') return 'No country yet';
    try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; }
  }
  function countriesOf(l) { return Array.isArray(l.countries) ? l.countries : []; }
  function needsCountry(l) { return COUNTRY_TYPES.indexOf(l.content_type) >= 0; }
  function countryTile(code, big) {
    var c = code === 'ONLINE' ? ['#E0F2F7', '#0B6E82'] : code === 'NONE' ? ['#EEF0F4', '#5B6070'] : hashColor(code);
    var inner = code === 'ONLINE' ? I.globe : code === 'NONE' ? '?' : esc(code);
    return '<span class="ctile' + (big ? ' big' : '') + '" style="background:' + c[0] + ';color:' + c[1] + '">' + inner + '</span>';
  }
  function countryLabel(l) {
    var list = countriesOf(l);
    if (!list.length) return '';
    var names = list.slice(0, 2).map(countryName).join(', ');
    return list.length > 2 ? names + ' +' + (list.length - 2) : names;
  }
  /** Links grouped by country: [{code, links}] sorted by size, Online last, then those with no country. */
  function countryGroups() {
    var map = {};
    S.links.forEach(function (l) {
      if (l.archived) return;
      countriesOf(l).forEach(function (c) { (map[c] = map[c] || []).push(l); });
    });
    var groups = Object.keys(map).filter(function (c) { return c !== 'ONLINE'; })
      .map(function (c) { return { code: c, links: map[c] }; })
      .sort(function (a, b) { return b.links.length - a.links.length || countryName(a.code).localeCompare(countryName(b.code)); });
    if (map.ONLINE) groups.push({ code: 'ONLINE', links: map.ONLINE });
    var none = S.links.filter(function (l) { return !l.archived && needsCountry(l) && !countriesOf(l).length; });
    if (none.length) groups.push({ code: 'NONE', links: none });
    return groups;
  }
  function isOpen(l) { return !hasDeadline(l) || l.deadline_at >= Date.now(); }
  function nextClose(links) {
    var next = null;
    links.forEach(function (l) { if (hasDeadline(l) && l.deadline_at >= Date.now() && (next === null || l.deadline_at < next.deadline_at)) next = l; });
    return next;
  }

  function viewCountriesList() {
    var groups = countryGroups();
    if (!groups.length) {
      return '<div class="empty"><div class="big">' + I.globe + '</div><p class="t">No countries yet</p>'
        + '<p class="s">Claude labels opportunities, events and courses with the country where they take place. Save one to see it here.</p></div>';
    }
    return groups.map(function (g) {
      var open = g.links.filter(isOpen).length;
      var next = nextClose(g.links);
      var sub = g.code === 'NONE' ? g.links.length + ' saved before countries were added'
        : g.links.length + ' opportunit' + (g.links.length === 1 ? 'y' : 'ies') + ' · ' + (open ? open + ' open' : 'closed');
      return '<button class="card rowcard tap" data-go="#/country/' + g.code + '">' + countryTile(g.code, true)
        + '<div class="col grow"><p class="t">' + esc(countryName(g.code)) + '</p><span class="src">' + esc(sub) + '</span></div>'
        + (next ? '<span class="dchip ' + deadlineInfo(next).tone + '">Next: ' + esc(shortDate(next.deadline_at)) + '</span>' : '') + '</button>';
    }).join('');
  }

  function viewCountry(code) {
    var g = countryGroups().filter(function (x) { return x.code === code; })[0];
    var links = g ? g.links : [];
    var open = links.filter(isOpen);
    var shown = (countryFilter === 'open' && code !== 'NONE' ? open : links).slice().sort(function (a, b) {
      var ah = hasDeadline(a), bh = hasDeadline(b);
      if (ah !== bh) return ah ? -1 : 1;
      return ah ? byDeadline(a, b) : b.saved_at - a.saved_at;
    });
    var h = '<div class="body"><div class="topbar"><button class="btn sec icon" data-act="back" aria-label="Back">' + I.back + '</button></div>'
      + '<div class="row" style="gap:12px">' + countryTile(code, true) + '<div class="col"><h1 class="h1" style="font-size:28px">' + esc(countryName(code)) + '</h1>'
      + '<span class="s">' + links.length + ' opportunit' + (links.length === 1 ? 'y' : 'ies') + (code === 'NONE' ? '' : ' · ' + open.length + ' open') + '</span></div></div>';
    if (code === 'NONE') {
      var mine = links.filter(function (l) { return ['analyzed', 'partial', 'failed'].indexOf(l.status) >= 0 && !l.countries_locked; }).length;
      h += '<div class="card" style="gap:8px"><p class="s">These were saved before countries were added. Claude can read them again and add their countries; each costs one analysis. You can also set a country by hand on each one.</p>'
        + (mine && canAnalyze() ? '<button class="btn sec" data-act="countryReanalyze">Analyze ' + (mine === 1 ? 'it' : 'all ' + mine) + '</button>' : '') + '</div>';
    } else {
      h += '<div class="row" style="gap:6px"><button class="chip' + (countryFilter === 'open' ? ' ink' : '') + '" data-act="countryFilter" data-v="open">Open (' + open.length + ')</button>'
        + '<button class="chip' + (countryFilter === 'all' ? ' ink' : '') + '" data-act="countryFilter" data-v="all">All (' + links.length + ')</button></div>';
    }
    if (!shown.length) return h + '<div class="empty"><p class="s">' + (links.length ? 'All of them have closed. Switch to All to see them.' : 'Nothing here yet.') + '</p></div></div>';
    h += '<div class="dlist">' + shown.map(function (l) {
      var others = countriesOf(l).filter(function (c) { return c !== code; });
      var col = collectionById(l.collection_id);
      var sub = (col ? col.name : 'Inbox') + (others.length ? ' · also ' + others.map(countryName).join(', ') : '');
      var p = planOf(l);
      return '<button class="drow" data-act="open" data-id="' + l.id + '">' + (hasDeadline(l) ? dateTile(l, false) : thumb(l))
        + '<div class="col grow"><p class="t clamp2" dir="auto">' + esc(titleOf(l)) + '</p><span class="src" dir="auto">' + esc(sub) + '</span></div>'
        + (p ? startChip(p) : '') + '</button>';
    }).join('') + '</div>';
    return h + '</div>';
  }

  function countrySheet(id) {
    var l = linkById(id);
    if (!l) return;
    var selected = countriesOf(l).slice();
    var used = {};
    S.links.forEach(function (x) { if (x.id !== id) countriesOf(x).forEach(function (c) { used[c] = true; }); });
    var hint = !selected.length ? 'Choose every country where this opportunity takes place.'
      : l.countries_locked ? 'You set these countries. Claude will not change them.'
      : 'Claude found ' + selected.map(countryName).join(', ') + '. Choose every country where the opportunity takes place.';
    var html = '<p class="h2">Countries</p><p class="s">' + esc(hint) + '</p>'
      + '<label class="lbl" for="cSearch" style="position:absolute;left:-9999px">Search countries</label>'
      + '<input id="cSearch" class="inp" placeholder="Search countries" autocomplete="off">'
      + '<div id="cList" class="col" style="gap:0"></div>'
      + '<div class="row"><button class="btn sec flex1" data-act="sheetCancel">Cancel</button><button class="btn pri flex14" id="cSave">Save countries</button></div>';
    openSheet(html, function (sheet) {
      var list = sheet.querySelector('#cList');
      var search = sheet.querySelector('#cSearch');
      function row(code) {
        var on = selected.indexOf(code) >= 0;
        var tag = on && !l.countries_locked && countriesOf(l).indexOf(code) >= 0 ? 'Found by Claude' : used[code] ? 'Used before' : '';
        return '<button class="crow' + (on ? ' on' : '') + '" data-code="' + code + '" role="checkbox" aria-checked="' + on + '">'
          + '<span class="pcheck' + (on ? ' on' : '') + '">' + (on ? '✓' : '') + '</span>' + countryTile(code, false)
          + '<span class="grow">' + esc(countryName(code)) + '</span><span class="src">' + tag + '</span></button>';
      }
      function draw() {
        var q = normalizeSearch(search.value.trim());
        var codes;
        if (q) {
          codes = ['ONLINE'].concat(ISO_CODES).filter(function (c) {
            return normalizeSearch(countryName(c)).indexOf(q) >= 0 || c.toLowerCase() === q;
          }).slice(0, 40);
        } else {
          var first = selected.concat(Object.keys(used).filter(function (c) { return selected.indexOf(c) < 0; }));
          if (first.indexOf('ONLINE') < 0) first.push('ONLINE');
          codes = first.concat(ISO_CODES.filter(function (c) { return first.indexOf(c) < 0; })
            .sort(function (a, b) { return countryName(a).localeCompare(countryName(b)); }));
        }
        list.innerHTML = codes.map(row).join('');
      }
      search.addEventListener('input', draw);
      list.addEventListener('click', function (e) {
        var b = e.target.closest('[data-code]');
        if (!b) return;
        var code = b.getAttribute('data-code');
        var i = selected.indexOf(code);
        if (i >= 0) selected.splice(i, 1); else if (selected.length < 8) selected.push(code);
        draw();
      });
      sheet.querySelector('#cSave').addEventListener('click', function () {
        SM.setCountries(id, JSON.stringify(selected));
        closeSheet();
        toast(selected.length ? 'Countries saved' : 'Countries cleared');
      });
      draw();
    });
  }

  function refSection(l) {
    var refs = Array.isArray(l.ref_links) ? l.ref_links : [];
    var open = !!refsOpen[l.id];
    var read = refs.filter(function (r) { return r.status === 'read'; }).length;
    var summary = !refs.length ? 'Add the official page, guidelines or an FAQ'
      : refs.length + ' link' + (refs.length === 1 ? '' : 's') + (read ? ' · ' + read + ' read by Claude' : refs.some(function (r) { return r.status === 'pending'; }) ? ' · reading…' : '');
    var h = '<section class="plan" aria-label="Reference links"><button class="phead" data-act="refsToggle" data-id="' + l.id + '" aria-expanded="' + open + '">'
      + '<div class="col grow" style="gap:4px"><span class="t">Reference links</span><span class="s">' + esc(summary) + '</span></div>'
      + '<span class="chev' + (open ? ' open' : '') + '">' + I.chevron + '</span></button>';
    if (open) {
      h += '<div class="pbody" style="gap:0">';
      refs.forEach(function (r, i) {
        var st = r.status === 'read' ? ['read', 'var(--green)', I.doc, ['var(--blue-soft)', 'var(--blue)']]
          : r.status === 'login' ? ['Needs a login, could not be read', 'var(--amber)', I.lock, ['var(--amber-soft)', 'var(--amber)']]
          : r.status === 'failed' ? ['Could not be read', 'var(--red)', I.doc, ['var(--red-soft)', 'var(--red)']]
          : ['Claude is reading it…', 'var(--blue)', I.doc, ['var(--blue-soft)', 'var(--blue)']];
        h += '<div class="pstep" style="min-height:54px"><span class="ctile" style="background:' + st[3][0] + ';color:' + st[3][1] + '">' + st[2] + '</span>'
          + '<button class="col grow" style="all:unset;display:flex;flex-direction:column;gap:2px;cursor:pointer;flex:1;min-width:0" data-act="refOpen" data-id="' + l.id + '" data-i="' + i + '">'
          + '<span class="t clamp2" style="font-size:14px;font-weight:600" dir="auto">' + esc(r.title || domainOf(r.url)) + '</span>'
          + '<span class="src" style="color:' + st[1] + ';font-weight:600">' + esc(domainOf(r.url)) + ' · ' + esc(st[0]) + '</span></button>'
          + '<button class="pdel" data-act="refRemove" data-id="' + l.id + '" data-i="' + i + '" aria-label="Remove reference link">×</button></div>';
      });
      if (refs.length < 5 && canAnalyze()) h += '<button class="link" style="text-align:start;padding-top:10px" data-act="refAdd" data-id="' + l.id + '">+ Add reference link</button>';
      h += '<p class="src" style="margin:8px 0 0">Claude reads these with the saved link and updates the brief, deadline, country and plan.</p></div>';
    }
    return h + '</section>';
  }

  // ---------------------------------------------------------------- planner

  var DAY = 86400000;
  function stepsOf(l) { return Array.isArray(l.steps) ? l.steps : []; }
  function stepsDone(l) { return stepsOf(l).filter(function (x) { return x.d; }).length; }
  function shortDate(ms) { var d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  /**
   * Plan for one opportunity. Start by = deadline day minus the work estimate minus 1 buffer day.
   * Groups: today (start by is today or earlier), week (within 7 days), later, missed (deadline passed).
   */
  function planOf(l) {
    if (!hasDeadline(l)) return null;
    var known = !!l.effort_days;
    var effort = known ? l.effort_days : 1;
    var d = new Date(startOfDay(l.deadline_at));
    d.setDate(d.getDate() - (effort + 1));
    var startBy = d.getTime();
    var today = startOfDay(Date.now());
    var steps = stepsOf(l), done = stepsDone(l);
    var group = l.deadline_at < Date.now() ? 'missed' : startBy <= today ? 'today' : startBy < today + 7 * DAY ? 'week' : 'later';
    var remaining = steps.length ? effort * (1 - done / steps.length) : effort;
    return { known: known, effort: effort, startBy: startBy, group: group, steps: steps, done: done, remaining: remaining };
  }

  function plannerItems() {
    return S.links.filter(function (l) { return !l.archived && hasDeadline(l); })
      .map(function (l) { return { l: l, p: planOf(l) }; });
  }

  /** Open opportunities in the suggested working order. */
  function plannerOrder() {
    return plannerItems().filter(function (x) { return x.p.group !== 'missed'; })
      .sort(function (a, b) { return a.p.startBy - b.p.startBy || a.l.deadline_at - b.l.deadline_at; });
  }

  function startChip(p) {
    if (p.group === 'missed') return '<span class="dchip closed">Closed</span>';
    if (p.group === 'today') return '<span class="dchip urgent">Start today</span>';
    return '<span class="dchip ' + (p.group === 'week' ? 'soon' : '') + '">Start ' + esc(shortDate(p.startBy)) + '</span>';
  }

  function effortText(p) {
    return p.known ? 'about ' + p.effort + ' day' + (p.effort === 1 ? '' : 's') + ' of work' : 'work not estimated yet';
  }

  /** First point where the remaining work due by a deadline exceeds the days left before it. */
  function overload(order) {
    var byDeadline = order.slice().sort(function (a, b) { return a.l.deadline_at - b.l.deadline_at; });
    var today = startOfDay(Date.now()), need = 0, involved = [];
    for (var i = 0; i < byDeadline.length; i++) {
      var x = byDeadline[i];
      need += x.p.remaining;
      involved.push(x);
      var have = Math.max(0, Math.round((startOfDay(x.l.deadline_at) - today) / DAY));
      if (need > have + 0.01) return { until: x.l.deadline_at, need: Math.ceil(need), have: have, items: involved.slice() };
    }
    return null;
  }

  function planRow(x, n) {
    var l = x.l, p = x.p;
    var h = '<button class="prow" data-act="open" data-id="' + l.id + '"><span class="pnum' + (p.group === 'today' ? ' on' : '') + '">' + n + '</span>'
      + '<div class="col grow" style="gap:5px"><div class="row between" style="align-items:flex-start"><p class="t" dir="auto">' + esc(titleOf(l)) + '</p>' + startChip(p) + '</div>'
      + '<span class="src">Closes ' + esc(shortDate(l.deadline_at)) + ' · ' + effortText(p) + '</span>'
      + (l.progress ? '<span class="pnow clamp2">' + esc(l.progress) + '</span>' : '');
    if (p.steps.length) {
      h += '<div class="row"><div class="pbar"><div style="width:' + Math.round(100 * p.done / p.steps.length) + '%"></div></div>'
        + '<span class="src" style="font-weight:600">' + p.done + ' of ' + p.steps.length + ' steps</span></div>';
    }
    return h + '</div></button>';
  }

  function upNextRow(x) {
    var l = x.l, p = x.p;
    var sub = p.known ? 'About ' + p.effort + ' day' + (p.effort === 1 ? '' : 's') + ' of work' : 'Work not estimated yet';
    if (p.steps.length) sub += ' · ' + p.done + ' of ' + p.steps.length + ' steps';
    return '<button class="drow" data-act="open" data-id="' + l.id + '">' + dateTile(l, false)
      + '<div class="col grow"><p class="t clamp2" dir="auto">' + esc(titleOf(l)) + '</p><span class="src">' + esc(sub) + '</span></div>'
      + startChip(p) + '</button>';
  }

  function refsRead(l) {
    return (Array.isArray(l.ref_links) ? l.ref_links : []).filter(function (r) { return r.status === 'read'; }).length;
  }

  function viewPlanner() {
    var items = plannerItems();
    var order = plannerOrder();
    var missed = items.filter(function (x) { return x.p.group === 'missed'; })
      .sort(function (a, b) { return b.l.deadline_at - a.l.deadline_at; });
    var total = 0;
    order.forEach(function (x) { if (x.p.known) total += x.p.effort; });
    var h = '<div class="body"><div class="col" style="gap:2px"><h1 class="h1">Planner</h1>'
      + '<span class="s">' + order.length + ' open opportunit' + (order.length === 1 ? 'y' : 'ies')
      + (total ? ' · about ' + total + ' days of work' : '') + '</span></div>';

    if (!items.length) {
      return h + '<div class="empty"><div class="big">' + I.planner + '</div><p class="t">No deadlines yet</p>'
        + '<p class="s">When Claude finds a closing date in a saved opportunity, it appears here in the order you should work on it. You can also set a deadline on any link.</p></div></div>';
    }

    var today = order.filter(function (x) { return x.p.group === 'today'; });
    var now = new Date();
    var focus;
    if (today.length) {
      var first = today[0];
      focus = 'Begin with ' + titleOf(first.l) + ': ' + effortText(first.p) + ', closes ' + shortDate(first.l.deadline_at) + '.';
    } else if (order.length) {
      focus = 'Next: ' + titleOf(order[0].l) + ', start by ' + shortDate(order[0].p.startBy) + '.';
    } else {
      focus = 'Every saved deadline has passed.';
    }
    h += '<div class="hero" style="flex-direction:column;align-items:flex-start;gap:4px"><p class="k">Today · ' + WEEKDAYS[now.getDay()] + ' ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + '</p>'
      + '<p class="v" style="font-size:22px">' + (today.length ? today.length + ' to start today' : 'Nothing to start today') + '</p>'
      + '<p class="k" style="opacity:.85;line-height:1.4" dir="auto">' + esc(focus) + '</p></div>';

    var unknown = order.filter(function (x) { return !x.p.known; }).length;
    if (unknown && canAnalyze()) {
      h += '<div class="card" style="gap:8px"><p class="t">' + unknown + ' opportunit' + (unknown === 1 ? 'y has' : 'ies have') + ' no work estimate yet</p>'
        + '<p class="s">They were saved before the Planner existed, so they are ordered as if they need 1 day. Claude can estimate the work and list the steps.</p>'
        + '<button class="btn sec" data-act="planReanalyze">Analyze ' + (unknown === 1 ? 'it' : 'them') + '</button></div>';
    }

    var over = overload(order);
    if (over) {
      var biggest = over.items.slice().sort(function (a, b) { return b.p.remaining - a.p.remaining; })[0];
      var msg = over.items.length === 1
        ? titleOf(biggest.l) + ' needs about ' + over.need + ' days of work, but only ' + over.have + ' remain before it closes. Start now, or consider skipping it.'
        : over.items.length + ' opportunities closing by ' + shortDate(over.until) + ' need about ' + over.need + ' days of work, but only ' + over.have
          + ' remain. Start ' + titleOf(biggest.l) + ' now, or skip one of them.';
      h += '<div class="notice" role="note"><p class="t">Busy until ' + esc(shortDate(over.until)) + '</p><p class="s" dir="auto">' + esc(msg) + '</p></div>';
    }

    var n = 0;
    [['today', 'Start today', 'var(--red)'], ['week', 'This week', 'var(--amber)'], ['later', 'Later', 'var(--muted-2)']].forEach(function (g) {
      var list = order.filter(function (x) { return x.p.group === g[0]; });
      if (!list.length) return;
      h += '<span class="glabel" style="color:' + g[2] + '">' + g[1] + '</span><div class="dlist">'
        + list.map(function (x) { n++; return planRow(x, n); }).join('') + '</div>';
    });

    if (missed.length) {
      h += '<button class="link" style="text-align:start;color:var(--muted-2)" data-act="toggleMissed">' + (showMissed ? '▾' : '▸') + ' Missed (' + missed.length + ')</button>';
      if (showMissed) {
        h += '<div class="dlist">' + missed.map(function (x) {
          return '<button class="prow" data-act="open" data-id="' + x.l.id + '"><span class="pnum">·</span><div class="col grow" style="gap:3px"><div class="row between"><p class="t" dir="auto">'
            + esc(titleOf(x.l)) + '</p>' + startChip(x.p) + '</div><span class="src">Closed ' + esc(shortDate(x.l.deadline_at)) + '</span></div></button>';
        }).join('') + '</div>';
      }
    }
    return h + '</div>';
  }

  function planSection(l) {
    var p = planOf(l);
    if (!p || p.group === 'missed') return '';
    var open = !!planOpen[l.id];
    var summary = (p.known ? 'About ' + p.effort + ' day' + (p.effort === 1 ? '' : 's') + ' of work' : 'Work not estimated yet')
      + (p.steps.length ? ' · ' + p.done + ' of ' + p.steps.length + ' steps done' : '');
    var h = '<section class="plan" aria-label="Your plan"><button class="phead" data-act="planToggle" data-id="' + l.id + '" aria-expanded="' + open + '">'
      + '<div class="col grow" style="gap:6px"><div class="row"><span class="t">Your plan</span>' + startChip(p) + '</div>'
      + '<span class="s">' + esc(summary) + '</span>'
      + (p.steps.length ? '<div class="pbar"><div style="width:' + Math.round(100 * p.done / p.steps.length) + '%"></div></div>' : '')
      + '</div><span class="chev' + (open ? ' open' : '') + '">' + I.chevron + '</span></button>';
    if (open) {
      h += '<div class="pbody">';
      if (p.steps.length) {
        h += '<div class="psteps" data-id="' + l.id + '">' + p.steps.map(function (st, i) {
          return '<div class="pstep' + (st.d ? ' done' : '') + '" data-i="' + i + '">'
            + '<span class="pgrip" data-i="' + i + '" title="Drag to reorder" aria-hidden="true">' + I.grip + '</span>'
            + '<button class="pcheck' + (st.d ? ' on' : '') + '" data-act="stepToggle" data-id="' + l.id + '" data-i="' + i
            + '" role="checkbox" aria-checked="' + !!st.d + '" aria-label="' + esc(st.t) + '">' + (st.d ? '✓' : '') + '</button>'
            + '<button class="ptext grow" data-act="stepEdit" data-id="' + l.id + '" data-i="' + i + '" dir="auto" title="Edit step">' + esc(st.t) + '</button>'
            + '<button class="pdel" data-act="stepRemove" data-id="' + l.id + '" data-i="' + i + '" aria-label="Remove step">×</button></div>';
        }).join('') + '</div>';
      } else {
        h += '<p class="s">No preparation steps yet.' + (p.known ? '' : canAnalyze() ? ' Analyze again from the ⋯ menu, or add your own.' : ' Add your own.') + '</p>';
      }
      h += '<div class="row between wrap"><button class="link" style="text-align:start" data-act="stepAdd" data-id="' + l.id + '">+ Add step</button>'
        + '<button class="link" style="color:var(--muted-2)" data-act="editEffort" data-id="' + l.id + '">Edit work estimate</button></div></div>';
    }
    return h + '</section>';
  }

  /** Moves a preparation step to a new position and saves the order. */
  function moveStep(l, from, to) {
    var steps = stepsOf(l).map(function (x) { return { t: x.t, d: x.d ? 1 : 0 }; });
    if (from < 0 || from >= steps.length || to < 0 || to >= steps.length || from === to) return;
    var s = steps.splice(from, 1)[0];
    steps.splice(to, 0, s);
    l.steps = steps;
    SM.setSteps(l.id, JSON.stringify(steps));
    render(false);
  }

  // Drag a step by its handle (mouse or touch) to reorder it.
  var stepDrag = null;
  document.addEventListener('pointerdown', function (e) {
    var grip = e.target.closest && e.target.closest('.pgrip');
    if (!grip) return;
    var list = grip.closest('.psteps');
    var row = grip.closest('.pstep');
    var l = linkById(Number(list.getAttribute('data-id')));
    if (!l || !row) return;
    e.preventDefault();
    var rows = Array.prototype.slice.call(list.querySelectorAll('.pstep'));
    stepDrag = { l: l, row: row, rows: rows, from: rows.indexOf(row), to: rows.indexOf(row), y0: e.clientY,
      mids: rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + b.height / 2; }), h: row.getBoundingClientRect().height };
    row.classList.add('dragging');
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  document.addEventListener('pointermove', function (e) {
    if (!stepDrag) return;
    var d = stepDrag, dy = e.clientY - d.y0;
    d.row.style.transform = 'translateY(' + dy + 'px)';
    var y = d.mids[d.from] + dy, to = 0;
    for (var i = 0; i < d.mids.length; i++) if (i !== d.from && d.mids[i] < y) to++;
    d.to = to;
    d.rows.forEach(function (r, i) {
      if (i === d.from) return;
      var shift = 0;
      if (d.from < to && i > d.from && i <= to) shift = -d.h;
      if (d.from > to && i < d.from && i >= to) shift = d.h;
      r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
    });
  });
  function endStepDrag() {
    if (!stepDrag) return;
    var d = stepDrag;
    stepDrag = null;
    d.rows.forEach(function (r) { r.style.transform = ''; r.classList.remove('dragging'); });
    if (d.to !== d.from) moveStep(d.l, d.from, d.to);
  }
  document.addEventListener('pointerup', endStepDrag);
  document.addEventListener('pointercancel', endStepDrag);

  /** The user's own note on where they are with this link, shown at the top of its page. */
  function progressBlock(l) {
    if (!l.progress) {
      return '<button class="progress empty" data-act="progressEdit" data-id="' + l.id + '">' + I.pin
        + '<span class="col grow" style="gap:2px"><span class="t" style="font-size:14px">Where are you with this?</span>'
        + '<span class="src">Note your last step, e.g. Sent emails, waiting for replies from supervisors</span></span></button>';
    }
    return '<button class="progress" data-act="progressEdit" data-id="' + l.id + '" aria-label="Edit where you are">'
      + '<span class="col grow" style="gap:3px"><span class="plabel">Where I am · ' + esc(l.progress_at ? ago(l.progress_at) : '') + '</span>'
      + '<span class="ptxt">' + esc(l.progress) + '</span></span><span class="src" style="font-weight:600">Edit</span></button>';
  }

  function levelChip(l) {
    if (l.status === 'processing') return '<span class="chip proc">Processing</span>';
    if (l.status === 'queued') {
      if (l.error === 'needs_key') return '<span class="chip proc">Waiting for Claude</span>';
      return '<span class="chip proc">' + (l.attempts ? 'Retrying soon' : 'Queued') + '</span>';
    }
    if (l.status === 'failed') return '<span class="chip unav">Failed</span>';
    if (l.source_level === 'FULL') return '<span class="chip full">Full source</span>';
    if (l.source_level === 'PARTIAL') return '<span class="chip part">Partial source</span>';
    if (l.source_level === 'UNAVAILABLE') return '<span class="chip unav">Unavailable</span>';
    return '<span class="chip">Saved</span>';
  }
  function levelClass(l) {
    if (l.status === 'failed' || l.source_level === 'UNAVAILABLE') return 'unav';
    if (l.source_level === 'FULL') return 'full';
    if (l.source_level === 'PARTIAL') return 'part';
    return 'proc';
  }
  function thumb(l) {
    var col = collectionById(l.collection_id);
    var c = col ? colorOf(col) : hashColor(siteOf(l));
    var img = l.image_url && /^https:\/\//i.test(l.image_url)
      ? '<img src="' + esc(l.image_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '';
    return '<div class="thumb" style="background:' + c[0] + ';color:' + c[1] + '">' + esc(initials(siteOf(l))) + img + '</div>';
  }

  function linkRow(l, opts) {
    opts = opts || {};
    var chip = l.status === 'analyzed' || l.status === 'partial'
      ? '<span class="chip ' + levelClass(l) + '">' + esc(shortAction(l)) + '</span>'
      : levelChip(l);
    return '<button class="card rowcard tap" data-act="open" data-id="' + l.id + '">' + (hasDeadline(l) ? dateTile(l, false) : thumb(l))
      + '<div class="col grow"><p class="t clamp2" dir="auto">' + esc(titleOf(l)) + '</p>'
      + '<span class="src">' + esc(siteOf(l)) + ' · ' + esc(ago(l.saved_at))
      + (l.favorite ? ' · ♥' : '') + (l.archived ? ' · Archived' : '') + '</span></div>' + chip + '</button>';
  }
  function shortAction(l) {
    var a = actionText(l);
    return a.replace(/ Later$/, '').replace(/^Try Tool$/, 'Try');
  }

  function tagsHtml(l, addButton) {
    var out = (l.tags || []).map(function (t) { return '<span class="chip tag" dir="auto">#' + esc(t) + '</span>'; }).join('');
    if (addButton) out += '<button class="chip" data-act="addTag" data-id="' + l.id + '">+ Tag</button>';
    return out ? '<div class="row wrap" style="gap:6px">' + out + '</div>' : '';
  }

  // ----------------------------------------------------------------- render

  function current() { return nav[nav.length - 1]; }

  function go(route, replace) {
    if (desk && route.indexOf('#/link/') === 0) {
      paneId = Number(route.slice(7));
      if (replace && current() === '#/add') nav.pop();
      if (!nav.length) nav = ['#/home'];
      closeSheet();
      render(true);
      return;
    }
    if (replace) nav[nav.length - 1] = route;
    else if (current() !== route) nav.push(route);
    closeSheet();
    render(true);
  }
  function goTab(route) {
    nav = route === '#/home' ? ['#/home'] : ['#/home', route];
    closeSheet();
    render(true);
  }
  function back() {
    if (closeSheet()) return true;
    if (desk && paneId !== null) { paneId = null; render(false); return true; }
    if (nav.length > 1) { nav.pop(); render(true); return true; }
    if (current() === '#/welcome') {
      if (welcomeStep > 1) { welcomeStep--; render(true); return true; }
      return false;
    }
    if (current() !== '#/home') { nav = ['#/home']; render(true); return true; }
    return false;
  }

  var scrollMemo = {};
  function render(navigated) {
    var view = document.getElementById('view');
    if (desk && current().indexOf('#/link/') === 0) {
      paneId = Number(current().slice(7));
      nav.pop();
      if (!nav.length) nav = ['#/home'];
    }
    var route = current();
    if (!navigated) scrollMemo[route] = view.scrollTop;
    var parts = route.split('/');
    var name = parts[1] || 'home';
    var arg = parts[2];
    var html;
    var tab = null;
    switch (name) {
      case 'inbox': html = viewInbox(); tab = 'inbox'; break;
      case 'add': html = viewAdd(); break;
      case 'collections': collMode = 'collections'; html = viewCollections(); tab = 'collections'; break;
      case 'c': html = viewCollection(arg); tab = 'collections'; break;
      case 'countries': collMode = 'countries'; html = viewCollections(); tab = 'collections'; break;
      case 'country': html = viewCountry(arg); tab = 'collections'; break;
      case 'link': html = viewLink(Number(arg)); break;
      case 'search': html = viewSearch(); tab = 'search'; break;
      case 'planner': html = viewPlanner(); tab = 'planner'; break;
      case 'settings': html = viewSettings(); break;
      case 'welcome': html = viewWelcome(); break;
      case 'dashboard': html = viewDashboard(); tab = 'home'; break;
      default: html = web ? viewDashboard() : viewHome(); tab = 'home';
    }
    if (web && !(S.account || {}).signedIn) { html = viewLogin(); name = 'login'; tab = null; }
    view.innerHTML = html;
    document.body.classList.toggle('onboarding', name === 'welcome' || name === 'login');
    var wide = desk && (name === 'dashboard' || (web && name === 'home'));
    document.body.classList.toggle('wide', wide);
    document.body.classList.toggle('nosel', wide && paneId === null);
    renderTabs(tab);
    if (name === 'add') bindAdd();
    if (name === 'search') bindSearch();
    if (name === 'settings') bindSettings();
    view.scrollTop = navigated ? (scrollMemo[route] && nav.indexOf(route) < nav.length - 1 ? scrollMemo[route] : 0) : scrollMemo[route] || 0;
    if (navigated) scrollMemo[route] = 0;
    if (desk && name !== 'welcome' && name !== 'login') { renderSide(); renderPane(); }
    dirty = false;
  }

  // ------------------------------------------------------------ Mac layout

  function renderSide() {
    var side = document.getElementById('side');
    side.hidden = false;
    var route = current();
    var pending = inboxItems().length;
    function item(r, label, icon, extra) {
      var on = route === r;
      return '<button class="sitem' + (on ? ' on' : '') + '" data-tab="' + r + '"' + (on ? ' aria-current="page"' : '') + '>' + icon
        + '<span class="grow">' + label + '</span>' + (extra || '') + '</button>';
    }
    var h = '<div class="sbrand"><span class="slogo">' + I.bookmark + '</span><span>SaveMind</span></div>'
      + (canAnalyze() ? '<button class="btn pri" data-act="add" style="min-height:38px;width:100%">' + I.plusSm + ' Add link</button>' : '')
      + '<button class="ssearch" data-act="search">' + I.searchSm + '<span class="grow">Search</span><span class="src">⌘K</span></button>'
      + (web ? item('#/home', 'Dashboard', I.grid) : item('#/home', 'Home', I.home) + item('#/dashboard', 'Dashboard', I.grid))
      + item('#/inbox', 'Smart Inbox', I.inbox, pending ? '<span class="sbadge">' + pending + '</span>' : '')
      + item('#/planner', 'Planner', I.planner)
      + item('#/countries', 'Countries', I.globe)
      + '<span class="slabel">Collections</span>';
    S.collections.slice().sort(function (a, b) { return countIn(b.id) - countIn(a.id); }).forEach(function (c) {
      var col = colorOf(c);
      var r = '#/c/' + c.id;
      h += '<button class="sitem small' + (route === r ? ' on' : '') + '" data-tab="' + r + '"><span class="sdot" style="background:' + col[1] + '"></span>'
        + '<span class="grow" dir="auto">' + esc(c.name) + '</span><span class="src">' + countIn(c.id) + '</span></button>';
    });
    h += '<button class="sitem small' + (route === '#/c/inbox' ? ' on' : '') + '" data-tab="#/c/inbox"><span class="sdot" style="background:var(--line-2)"></span><span class="grow">Inbox</span><span class="src">' + countIn(null) + '</span></button>'
      + '<button class="sitem small' + (route === '#/collections' ? ' on' : '') + '" data-tab="#/collections"><span class="sdot" style="background:transparent"></span><span class="grow">All collections…</span></button>';
    var acc = S.account || {};
    var status = !acc.available ? 'Sync not set up' : !acc.signedIn ? 'Not signed in' : acc.syncing ? 'Syncing…'
      : acc.error ? 'Sync paused' : acc.lastSync ? 'Synced ' + ago(acc.lastSync) : 'Waiting to sync';
    var good = acc.signedIn && !acc.error;
    h += '<div style="flex:1"></div><button class="saccount" data-act="settings"><span class="avatar" style="width:32px;height:32px;font-size:14px">'
      + esc(initials(S.settings.name || (S.account || {}).email || 'S').charAt(0)) + '</span><span class="col grow" style="gap:1px"><span class="t" style="font-size:13px" dir="auto">' + esc(S.settings.name || '')
      + '</span><span class="src" style="color:' + (good ? 'var(--green)' : 'var(--muted-2)') + ';font-weight:600">' + (good ? '● ' : '') + esc(status) + '</span></span></button>';
    side.innerHTML = h;
  }

  function renderPane() {
    var pane = document.getElementById('pane');
    pane.hidden = false;
    var keep = pane.getAttribute('data-id') === String(paneId) ? pane.scrollTop : 0;
    if (paneId === null || !linkById(paneId)) {
      paneId = null;
      pane.innerHTML = '<div class="empty" style="height:100%;justify-content:center"><div class="big">' + I.link + '</div><p class="t">Select a link</p><p class="s">Its brief, deadline and plan open here.</p></div>';
      pane.removeAttribute('data-id');
      return;
    }
    pane.innerHTML = viewLink(paneId);
    pane.setAttribute('data-id', String(paneId));
    pane.scrollTop = keep;
    document.querySelectorAll('#view [data-act="open"]:not(.cpill)').forEach(function (b) {
      b.classList.toggle('selected', Number(b.getAttribute('data-id')) === paneId);
    });
  }

  var lastOffer = null;
  /** On the Mac, offers to save a web link found on the clipboard (once per link). */
  function offerClipboard() {
    if (web) return;
    if (!desk) return;
    var text = '';
    try { text = SM.readClipboard(); } catch (e) { return; }
    var url = text ? SM.validateUrl(text) : '';
    var seen = '';
    try { seen = localStorage.getItem('sm.offered') || ''; } catch (e) { /* storage unavailable */ }
    if (!url || url === lastOffer || url === seen || SM.checkDuplicate(url) !== 'null') return;
    lastOffer = url;
    try { localStorage.setItem('sm.offered', url); } catch (e) { /* storage unavailable */ }
    var old = document.querySelector('.offer');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.className = 'offer';
    bar.innerHTML = '<div class="col grow" style="gap:2px"><span class="t" style="font-size:14px">Save the link on your clipboard?</span><span class="src clamp2">'
      + esc(shortUrl(url)) + '</span></div><button class="btn sec" data-offer="no">Not now</button><button class="btn pri" data-offer="yes">Save</button>';
    document.body.appendChild(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-offer]');
      if (!b) return;
      bar.remove();
      if (b.getAttribute('data-offer') === 'yes') {
        var res = JSON.parse(SM.addLink(url, '', false));
        if (res.ok) { load(); toast('Saved. Claude is analyzing it.'); go('#/link/' + res.id); }
      }
    });
  }

  function renderTabs(active) {
    var tabs = document.getElementById('tabs');
    if (desk) { tabs.hidden = true; return; }
    if (!active) { tabs.hidden = true; return; }
    tabs.hidden = false;
    var pending = inboxItems().length;
    function t(id, label, icon, route) {
      return '<button class="tab' + (active === id ? ' on' : '') + '" data-tab="' + route + '">' + icon + label
        + (id === 'inbox' && pending ? '<span class="dot">' + (pending > 99 ? '99+' : pending) + '</span>' : '') + '</button>';
    }
    if (web) {
      tabs.innerHTML = t('home', 'Dashboard', I.grid, '#/home') + t('inbox', 'Inbox', I.inbox, '#/inbox')
        + t('planner', 'Planner', I.planner, '#/planner') + t('collections', 'Collections', I.folder, '#/collections');
      return;
    }
    tabs.innerHTML = t('home', 'Home', I.home, '#/home') + t('inbox', 'Inbox', I.inbox, '#/inbox')
      + '<button class="fab" aria-label="Add link" data-act="add">' + I.plus + '</button>'
      + t('collections', 'Collections', I.folder, '#/collections') + t('planner', 'Planner', I.planner, '#/planner');
  }

  // ------------------------------------------------------------------- Home

  function viewHome() {
    var name = S.settings.name || 'there';
    var pending = inboxItems().length;
    var h = '<div class="body">';
    h += '<div class="row between"><h1 class="h1" dir="auto">Hi, ' + esc(name) + '</h1>'
      + '<div class="row"><button class="avatar" style="background:var(--soft);color:var(--ink)" data-act="search" aria-label="Search">' + I.searchSm + '</button>'
      + '<button class="avatar" data-act="settings" aria-label="Settings">' + esc(initials(name).charAt(0)) + '</button></div></div>';
    if (!S.settings.hasKey) h += keyNotice();
    h += '<button class="hero" data-tab="#/inbox"><div><p class="k">Smart Inbox</p><p class="v">'
      + (pending ? pending + ' to review' : 'All caught up') + '</p></div><span class="btn">Review</span></button>';

    var deadlines = upcomingDeadlines();
    var upNext = plannerOrder();
    if (upNext.length) {
      h += '<div class="row between"><h3 class="h2">Up next</h3><button class="link" data-tab="#/planner">Open Planner</button></div>';
      h += '<div class="dlist">' + upNext.slice(0, 3).map(upNextRow).join('') + '</div>';
    }

    // Empty collections stay in the Collections tab but are hidden here.
    var cols = S.collections.filter(function (c) { return countIn(c.id) > 0; })
      .sort(function (a, b) { return countIn(b.id) - countIn(a.id); }).slice(0, 4);
    if (cols.length) {
      h += '<div class="row between"><h3 class="h2">Collections</h3><button class="link" data-tab="#/collections">See all</button></div>';
      h += '<div class="grid2">' + cols.map(function (c) {
        var col = colorOf(c);
        var n = countIn(c.id);
        var due = deadlines.filter(function (l) { return l.collection_id === c.id; }).length;
        return '<button class="card tap" data-go="#/c/' + c.id + '"><div class="tile" style="background:' + col[0] + ';color:' + col[1] + '">'
          + esc(initials(c.name)) + '</div><p class="t clamp2" dir="auto">' + esc(c.name) + '</p><span class="src">'
          + n + ' link' + (n === 1 ? '' : 's') + (due ? ' · ' + due + ' deadline' + (due === 1 ? '' : 's') : '') + '</span></button>';
      }).join('') + '</div>';
    }

    var recent = S.links.filter(function (l) { return !l.archived; }).slice(0, 12);
    h += '<div class="row between"><h3 class="h2">Recent</h3>' + (recent.length ? '<button class="link" data-tab="#/search">Search</button>' : '') + '</div>';
    if (recent.length) h += recent.map(function (l) { return linkRow(l); }).join('');
    else h += '<div class="card empty"><div class="big">' + I.link + '</div><p class="t">Save your first link</p>'
      + '<p class="s">In any app, tap Share and choose SaveMind. Or tap + to paste a link.</p>'
      + '<button class="btn pri" data-act="add">+ Add Link</button></div>';
    return h + '</div>';
  }

  function keyNotice() {
    return '<div class="notice"><p class="t">Connect Claude to analyze links</p>'
      + '<p class="s">Links are saved either way. Add your Claude API key so SaveMind can write briefs, tags and collection suggestions.</p>'
      + '<button class="btn sec" style="background:#fff" data-act="settings">Open Settings</button></div>';
  }

  // ------------------------------------------------------------------ Inbox

  function viewInbox() {
    var items = inboxItems();
    var h = '<div class="body"><div class="row between"><h1 class="h1">Smart Inbox</h1><span class="chip">' + items.length + ' pending</span></div>';
    if (canAnalyze() && !S.settings.hasKey && items.length) h += keyNotice();
    if (!items.length) {
      return h + '<div class="empty"><div class="big">' + I.check + '</div><p class="t">All caught up</p>'
        + '<p class="s">New links land here for a quick review of Claude\'s brief, collection and action.</p></div></div>';
    }
    return h + items.map(inboxCard).join('') + '</div>';
  }

  function inboxCard(l) {
    var src = esc(domainOf(l.url)) + (l.source_app && l.source_app !== 'SaveMind' ? ' · via ' + esc(l.source_app) : '');
    var h = '<div class="card" style="gap:10px"><div class="row between"><span class="src">' + src + '</span>' + levelChip(l) + '</div>';

    if (l.status === 'queued' || l.status === 'processing') {
      h += '<button class="t" style="background:none;border:0;padding:0;text-align:start" data-act="open" data-id="' + l.id + '" dir="auto">' + esc(l.title || shortUrl(l.url)) + '</button>';
      if (l.error === 'needs_key') {
        h += '<p class="s">Saved. Analysis starts once a Claude API key is added in Settings.</p>';
      } else if (l.status === 'queued' && l.error) {
        h += '<p class="s">' + esc(l.error) + '</p>';
      } else {
        h += '<div class="skel" style="width:92%"></div><div class="skel" style="width:70%"></div>';
      }
      h += '<div class="row"><button class="btn sec flex1" data-act="move" data-id="' + l.id + '">Move</button>'
        + '<button class="btn sec flex1" data-act="keep" data-id="' + l.id + '">Keep in Inbox</button></div>';
      return h + '</div>';
    }

    h += '<button class="t" style="font-size:16px;background:none;border:0;padding:0;text-align:start" data-act="open" data-id="' + l.id + '" dir="auto">' + esc(titleOf(l)) + '</button>';
    if (l.status === 'failed') {
      h += '<p class="s">' + esc(l.error || 'Analysis failed.') + '</p>'
        + '<div class="row"><button class="btn sec flex1" data-act="context" data-id="' + l.id + '">Add context</button>'
        + '<button class="btn pri flex1" data-act="retry" data-id="' + l.id + '">Retry</button></div>'
        + '<div class="row"><button class="btn ghost flex1" data-act="move" data-id="' + l.id + '">Move</button>'
        + '<button class="btn ghost flex1" data-act="keep" data-id="' + l.id + '">Keep in Inbox</button></div>';
      return h + '</div>';
    }
    if (l.summary) h += '<p class="s" dir="auto">' + esc(l.summary) + '</p>';
    h += tagsHtml(l, false);

    var existing = collectionById(l.suggested_collection_id);
    var primary;
    if (existing) {
      h += '<div class="sug"><span class="eyebrow">Suggested collection</span><div class="row between"><span class="t" dir="auto">'
        + esc(existing.name) + '</span><span class="src">' + confidenceText(l) + '</span></div></div>';
      primary = '<button class="btn pri flex14" data-act="accept" data-id="' + l.id + '">Accept</button>';
    } else if (l.suggested_new_name) {
      h += '<div class="sug"><span class="eyebrow">Suggested new collection</span><div class="row between"><span class="t" dir="auto">'
        + esc(l.suggested_new_name) + '</span><span class="src">Needs your approval</span></div></div>';
      primary = '<button class="btn pri flex14" data-act="accept" data-id="' + l.id + '">Create &amp; save</button>';
    } else {
      h += '<div class="sug muted"><span class="eyebrow" style="color:var(--muted-2)">No confident match</span><span class="s">Stays in Inbox unless you move it.</span></div>';
      primary = '<button class="btn pri flex14" data-act="keep" data-id="' + l.id + '">Keep in Inbox</button>';
    }
    h += '<div class="row between"><span class="lbl">Action</span><button class="chip proc" data-act="editAction" data-id="' + l.id + '">'
      + (isWatch(actionText(l)) ? '▶ ' : '↗ ') + esc(actionText(l)) + '</button></div>';
    h += '<div class="row"><button class="btn sec flex1" data-act="edit" data-id="' + l.id + '">Edit</button>'
      + '<button class="btn sec flex1" data-act="move" data-id="' + l.id + '">Move</button>' + primary + '</div>';
    return h + '</div>';
  }

  function confidenceText(l) {
    if (l.confidence === null || l.confidence === undefined) return '';
    if (l.confidence >= 0.8) return 'Strong match';
    if (l.confidence >= 0.5) return 'Likely match';
    return 'Possible match';
  }

  // --------------------------------------------------------------- Add Link

  function viewAdd() {
    var a = addState;
    var h = '<div class="body" style="min-height:100%">';
    h += '<div class="topbar"><button class="btn ghost" style="padding:0" data-act="back">Cancel</button><span class="title">Add Link</span><span style="width:52px"></span></div>';
    h += '<label class="lbl" for="addUrl">Link</label>';
    h += '<input id="addUrl" class="inp' + (a.error ? ' err' : '') + '" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://" value="' + esc(a.url) + '">';
    h += '<div id="addErr" class="field-err"' + (a.error ? '' : ' hidden') + '>' + esc(a.error) + '</div>';
    h += '<div class="row"><button class="btn sec" data-act="paste">Paste from clipboard</button></div>';
    h += '<label class="lbl" for="addCtx">Context (optional)</label>';
    h += '<textarea id="addCtx" class="inp" dir="auto" placeholder="Why is this worth saving? Claude uses this as context.">' + esc(a.context) + '</textarea>';
    h += '<div id="dupBox"></div>';
    h += '<div style="flex:1"></div>';
    h += '<button id="addSave" class="btn pri big" data-act="save"' + (a.url.trim() ? '' : ' disabled') + '>Save &amp; Analyze</button>';
    return h + '</div>';
  }

  var dupTimer = null;
  function bindAdd() {
    var url = document.getElementById('addUrl');
    var ctx = document.getElementById('addCtx');
    url.addEventListener('input', function () {
      addState.url = url.value;
      addState.copy = false;
      if (addState.error) { addState.error = ''; url.classList.remove('err'); document.getElementById('addErr').hidden = true; }
      document.getElementById('addSave').disabled = !url.value.trim();
      clearTimeout(dupTimer);
      dupTimer = setTimeout(checkDup, 250);
    });
    ctx.addEventListener('input', function () { addState.context = ctx.value; });
    url.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ctx.focus(); } });
    checkDup();
    if (!addState.url) setTimeout(function () { url.focus(); }, 60);
  }

  function checkDup() {
    var box = document.getElementById('dupBox');
    if (!box) return;
    var dup = null;
    if (addState.url.trim()) {
      try { dup = JSON.parse(SM.checkDuplicate(addState.url)); } catch (e) { dup = null; }
    }
    addState.dup = dup;
    if (!dup || addState.copy) { box.innerHTML = ''; return; }
    var where = dup.collection || 'Inbox';
    box.innerHTML = '<div class="card" style="background:var(--amber-soft);box-shadow:none">'
      + '<p class="t" style="color:var(--amber)">Looks like you saved this before</p>'
      + '<p class="s" style="color:#6B4300" dir="auto">Saved ' + esc(dateShort(dup.savedAt)) + ' in ' + esc(where) + '.</p>'
      + '<div class="row"><button class="btn sec flex1" style="background:#fff" data-act="open" data-id="' + dup.id + '">View existing</button>'
      + '<button class="btn sec flex1" style="background:#fff" data-act="saveCopy">Save copy</button></div></div>';
  }

  function saveAdd() {
    var res;
    try { res = JSON.parse(SM.addLink(addState.url, addState.context, !!addState.copy)); } catch (e) { return; }
    if (res.ok) {
      addState = { url: '', context: '', copy: false, dup: null, error: '' };
      load();
      toast('Saved. Claude is analyzing it.');
      go('#/link/' + res.id, true);
    } else if (res.duplicate) {
      checkDup();
      toast('Already saved. View it or save a copy.');
    } else {
      addState.error = res.error || 'Enter a valid link.';
      var url = document.getElementById('addUrl');
      url.classList.add('err');
      var err = document.getElementById('addErr');
      err.textContent = addState.error;
      err.hidden = false;
    }
  }

  // ------------------------------------------------------------- Link detail

  function viewLink(id) {
    var l = linkById(id);
    if (!l) return '<div class="body"><div class="topbar"><button class="btn sec icon" data-act="back" aria-label="Back">' + I.back + '</button></div>'
      + '<div class="empty"><p class="t">This link was deleted.</p></div></div>';
    var col = collectionById(l.collection_id);
    var meta = [esc(domainOf(l.url))];
    if (l.content_type) meta.push(esc(TYPE_LABELS[l.content_type] || 'Link'));
    meta.push('Saved ' + esc(dateShort(l.saved_at)));
    if (l.source_app && l.source_app !== 'SaveMind') meta.push('via ' + esc(l.source_app));

    var h = '<div class="dhead"><div class="row between">'
      + '<button class="btn icon" data-act="back" aria-label="Back">' + I.back + '</button>'
      + '<button class="btn icon" data-act="more" data-id="' + l.id + '" aria-label="More">' + I.more + '</button></div>'
      + '<p class="meta">' + meta.join(' · ') + '</p></div>';

    h += '<div class="body with-bar" style="padding-top:20px">';
    h += '<h2 class="h1" style="font-size:26px" dir="auto">' + esc(titleOf(l)) + '</h2>';
    h += '<div class="row wrap" style="gap:6px">' + levelChip(l)
      + '<button class="chip" data-act="move" data-id="' + l.id + '">' + esc(col ? col.name : 'Inbox') + ' ▾</button>'
      + (countriesOf(l).length ? '<button class="chip cchip" data-act="countries" data-id="' + l.id + '">' + I.pin + esc(countryLabel(l)) + ' ▾</button>'
        : needsCountry(l) ? '<button class="chip" data-act="countries" data-id="' + l.id + '">+ Country</button>' : '')
      + (l.archived ? '<span class="chip">Archived</span>' : '') + '</div>';

    h += progressBlock(l);
    h += deadlineBlock(l);
    h += planSection(l);

    if (l.status === 'queued' || l.status === 'processing') {
      h += '<div class="card"><span class="lbl">Brief by Claude</span>';
      if (l.error === 'needs_key') {
        h += '<p class="s">Waiting for a Claude API key. Add one in Settings and analysis starts automatically.</p>'
          + '<button class="btn sec" data-act="settings">Open Settings</button>';
      } else if (l.status === 'queued' && l.error) {
        h += '<p class="s">' + esc(l.error) + '</p>';
      } else {
        h += '<p class="s">Reading the page and writing a brief…</p><div class="skel" style="width:95%"></div><div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div>';
      }
      h += '</div>';
    } else if (l.status === 'failed') {
      h += '<div class="card"><span class="lbl">Analysis failed</span><p class="s">' + esc(l.error || 'Something went wrong.') + '</p>'
        + '<div class="row"><button class="btn sec flex1" data-act="context" data-id="' + l.id + '">Add context</button>'
        + '<button class="btn pri flex1" data-act="retry" data-id="' + l.id + '">Retry</button></div></div>';
      if (l.summary) h += '<div class="card"><span class="lbl">Previous brief</span><p class="s" dir="auto">' + esc(l.summary) + '</p></div>';
    } else {
      if (!l.reviewed) h += reviewBox(l);
      h += '<div class="card"><div class="row between"><span class="lbl">Brief by Claude</span>'
        + (l.topic ? '<span class="src" dir="auto">' + esc(l.topic) + '</span>' : '') + '</div>'
        + '<p class="s" style="font-size:14px;color:var(--ink-2)" dir="auto">' + esc(l.summary || 'No summary.') + '</p>'
        + (refsRead(l) ? '<p class="src">Based on the saved link and ' + refsRead(l) + ' reference link' + (refsRead(l) === 1 ? '' : 's') + '.</p>'
          : l.source_level === 'PARTIAL' ? '<p class="src">Based on page metadata or shared text only. Open the original for full details.</p>' : '')
        + '</div>';
    }
    h += refSection(l);

    h += tagsHtml(l, true);

    h += '<button class="card tap" data-act="notes" data-id="' + l.id + '"><span class="lbl">Notes</span>'
      + (l.notes ? '<p class="s" dir="auto" style="white-space:pre-wrap">' + esc(l.notes) + '</p>' : '<p class="s">Add a note…</p>') + '</button>';

    if (l.shared_text) {
      h += '<div class="card"><span class="lbl">Shared with the link</span><p class="s clamp3" dir="auto" style="white-space:pre-wrap">' + esc(l.shared_text) + '</p></div>';
    }
    h += '<div class="card flat" style="padding:10px 12px"><span class="urlbox">' + esc(l.url) + '</span>'
      + '<div class="row"><button class="btn ghost" style="padding:0;min-height:32px" data-act="copy" data-id="' + l.id + '">Copy link</button>'
      + '<button class="btn ghost" style="padding:0 0 0 12px;min-height:32px" data-act="share" data-id="' + l.id + '">Share</button></div></div>';
    h += '</div>';

    h += '<div class="bottombar"><button class="btn sec heart' + (l.favorite ? ' on' : '') + '" style="width:54px;min-height:54px;padding:0" data-act="fav" data-id="' + l.id + '" aria-label="Favorite">'
      + (l.favorite ? I.heartOn : I.heart) + '</button>'
      + '<button class="btn pri big" style="flex:1" data-act="visit" data-id="' + l.id + '">'
      + (isWatch(actionText(l)) ? '▶ ' : '') + esc(actionText(l)) + (l.action_label ? ' · Open' : '') + '</button></div>';
    return h;
  }

  function reviewBox(l) {
    var existing = collectionById(l.suggested_collection_id);
    if (existing) {
      return '<div class="sug"><span class="eyebrow">Suggested collection</span><div class="row between"><span class="t" dir="auto">' + esc(existing.name)
        + '</span><button class="btn pri" style="min-height:38px" data-act="accept" data-id="' + l.id + '">Accept</button></div></div>';
    }
    if (l.suggested_new_name) {
      return '<div class="sug"><span class="eyebrow">Suggested new collection</span><div class="row between"><span class="t" dir="auto">' + esc(l.suggested_new_name)
        + '</span><button class="btn pri" style="min-height:38px" data-act="accept" data-id="' + l.id + '">Create &amp; save</button></div>'
        + '<span class="src">Created only if you approve.</span></div>';
    }
    return '<div class="sug muted"><div class="row between"><span class="s">No confident collection match.</span>'
      + '<button class="btn sec" style="min-height:38px" data-act="keep" data-id="' + l.id + '">Mark reviewed</button></div></div>';
  }

  // ------------------------------------------------------------ Collections

  function viewCollections() {
    var h = '<div class="body"><div class="row between"><h1 class="h1">Collections</h1>'
      + (collMode === 'collections' ? '<button class="btn sec" style="min-height:40px" data-act="newCollection">+ New</button>' : '') + '</div>'
      + '<div class="seg" role="tablist" aria-label="Browse by"><button role="tab" aria-selected="' + (collMode === 'collections') + '" class="' + (collMode === 'collections' ? 'on' : '') + '" data-act="collMode" data-v="collections">Collections</button>'
      + '<button role="tab" aria-selected="' + (collMode === 'countries') + '" class="' + (collMode === 'countries' ? 'on' : '') + '" data-act="collMode" data-v="countries">Countries</button></div>';
    if (collMode === 'countries') return h + viewCountriesList() + '</div>';
    var inboxCount = countIn(null);
    h += '<button class="card rowcard tap" data-go="#/c/inbox"><div class="thumb" style="font-size:15px">IN</div><div class="col grow"><p class="t">Inbox</p><span class="src">Uncategorized · ' + inboxCount + '</span></div></button>';
    S.collections.forEach(function (c) {
      var col = colorOf(c);
      var n = countIn(c.id);
      h += '<button class="card rowcard tap" data-go="#/c/' + c.id + '"><div class="thumb" style="background:' + col[0] + ';color:' + col[1] + ';font-size:15px">' + esc(initials(c.name)) + '</div>'
        + '<div class="col grow"><p class="t" dir="auto">' + esc(c.name) + '</p><span class="src">' + n + ' link' + (n === 1 ? '' : 's') + ' · updated ' + esc(ago(c.updated_at).replace('just now', 'now')) + '</span></div></button>';
    });
    var fav = S.links.filter(function (l) { return l.favorite && !l.archived; }).length;
    var arch = S.links.filter(function (l) { return l.archived; }).length;
    h += '<button class="card rowcard tap" data-go="#/c/fav"><div class="thumb" style="background:#FCE7EC;color:#C2185B">' + I.heartOn + '</div><div class="col grow"><p class="t">Favorites</p><span class="src">' + fav + ' link' + (fav === 1 ? '' : 's') + '</span></div></button>';
    h += '<button class="card rowcard tap" data-go="#/c/archive"><div class="thumb" style="font-size:15px">AR</div><div class="col grow"><p class="t">Archive</p><span class="src">' + arch + ' link' + (arch === 1 ? '' : 's') + '</span></div></button>';
    return h + '</div>';
  }

  function viewCollection(arg) {
    var title, items, real = null;
    if (arg === 'inbox') {
      title = 'Inbox';
      items = S.links.filter(function (l) { return !l.archived && l.collection_id === null; });
    } else if (arg === 'fav') {
      title = 'Favorites';
      items = S.links.filter(function (l) { return l.favorite && !l.archived; });
    } else if (arg === 'archive') {
      title = 'Archive';
      items = S.links.filter(function (l) { return l.archived; });
    } else {
      real = collectionById(Number(arg));
      if (!real) return '<div class="body"><div class="topbar"><button class="btn sec icon" data-act="back" aria-label="Back">' + I.back + '</button></div><div class="empty"><p class="t">This collection was deleted.</p></div></div>';
      title = real.name;
      items = S.links.filter(function (l) { return !l.archived && l.collection_id === real.id; });
    }
    var h = '<div class="body"><div class="topbar"><button class="btn sec icon" data-act="back" aria-label="Back">' + I.back + '</button>'
      + (real ? '<button class="btn sec icon" data-act="collectionMenu" data-id="' + real.id + '" aria-label="Collection options">' + I.more + '</button>' : '') + '</div>';
    h += '<div class="col"><h1 class="h1" dir="auto">' + esc(title) + '</h1><span class="src">' + items.length + ' link' + (items.length === 1 ? '' : 's') + '</span></div>';
    if (!items.length) h += '<div class="empty"><p class="s">Nothing here yet.</p></div>';
    else h += items.map(function (l) { return linkRow(l); }).join('');
    return h + '</div>';
  }

  // ----------------------------------------------------------------- Search

  function viewSearch() {
    var h = '<div class="body"><h1 class="h1">Search</h1>';
    h += '<label class="lbl" for="q" style="position:absolute;left:-9999px">Search saved links</label>';
    h += '<input id="q" class="inp" type="search" dir="auto" placeholder="Title, brief, tag, link or collection" autocomplete="off" value="' + esc(searchState.q) + '">';
    h += '<div id="filters" class="row wrap" style="gap:6px"></div><div id="results" class="col" style="gap:12px"></div>';
    return h + '</div>';
  }

  function searchFilters() {
    var counts = {};
    S.links.forEach(function (l) { var s = siteOf(l); counts[s] = (counts[s] || 0) + 1; });
    var sources = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 4);
    var f = [['all', 'All'], ['deadline', 'Deadlines'], ['fav', 'Favorites']];
    sources.forEach(function (s) { f.push(['src:' + s, s]); });
    f.push(['st:analyzed', 'Analyzed'], ['st:partial', 'Partial'], ['st:pending', 'Processing'], ['st:failed', 'Failed'], ['archived', 'Archived']);
    return f;
  }

  function bindSearch() {
    var q = document.getElementById('q');
    q.addEventListener('input', function () { searchState.q = q.value; renderResults(); });
    renderResults();
  }

  function renderResults() {
    var filters = document.getElementById('filters');
    var results = document.getElementById('results');
    if (!filters || !results) return;
    filters.innerHTML = searchFilters().map(function (f) {
      return '<button class="chip' + (searchState.filter === f[0] ? ' ink' : '') + '" data-filter="' + esc(f[0]) + '" dir="auto">' + esc(f[1]) + '</button>';
    }).join('');
    var terms = normalizeSearch(searchState.q).split(/\s+/).filter(Boolean);
    var f = searchState.filter;
    var list = S.links.filter(function (l) {
      if (f === 'fav' && !l.favorite) return false;
      if (f === 'deadline' && !hasDeadline(l)) return false;
      if (f === 'archived' && !l.archived) return false;
      if (f.indexOf('src:') === 0 && siteOf(l) !== f.slice(4)) return false;
      if (f === 'st:analyzed' && l.status !== 'analyzed') return false;
      if (f === 'st:partial' && l.status !== 'partial') return false;
      if (f === 'st:pending' && l.status !== 'queued' && l.status !== 'processing') return false;
      if (f === 'st:failed' && l.status !== 'failed') return false;
      if (!terms.length) return true;
      var col = collectionById(l.collection_id);
      var hay = normalizeSearch([l.title, l.page_title, l.summary, (l.tags || []).join(' '), l.url, col ? col.name : 'inbox',
        l.notes, l.topic, siteOf(l), l.shared_text, l.action_label, countriesOf(l).map(countryName).join(' ')].join(' '));
      return terms.every(function (t) { return hay.indexOf(t.replace(/^#/, '')) >= 0; });
    });
    if (f === 'deadline') list.sort(byDeadline);
    var h = '<span class="src">' + list.length + ' result' + (list.length === 1 ? '' : 's') + '</span>';
    h += list.slice(0, 200).map(function (l) {
      var c = '<div class="card" style="gap:8px"><button style="all:unset;display:flex;flex-direction:column;gap:6px;cursor:pointer" data-act="open" data-id="' + l.id + '">'
        + '<div class="row between" style="width:100%"><span class="src">' + esc(domainOf(l.url)) + '</span>' + levelChip(l) + '</div>'
        + '<p class="t" dir="auto">' + esc(titleOf(l)) + '</p>';
      if (l.summary && l.status !== 'failed') c += '<p class="s clamp2" dir="auto">' + esc(l.summary) + '</p>';
      if (hasDeadline(l)) {
        var dd = new Date(l.deadline_at);
        c += '<div class="row" style="gap:6px"><span class="src">Deadline ' + dd.getDate() + ' ' + MONTHS[dd.getMonth()] + ' ' + dd.getFullYear() + '</span>' + deadlineChip(l) + '</div>';
      }
      c += '</button>';
      if (l.status === 'failed') {
        c += '<p class="s">' + esc(l.error || 'Analysis failed.') + '</p><div class="row"><button class="btn sec flex1" data-act="context" data-id="' + l.id + '">Add context</button>'
          + '<button class="btn pri flex1" data-act="retry" data-id="' + l.id + '">Retry</button></div>';
      }
      return c + '</div>';
    }).join('');
    if (!list.length) h += '<div class="empty"><p class="s">No saved links match.</p></div>';
    results.innerHTML = h;
  }

  // --------------------------------------------------------------- Settings

  function viewSettings() {
    var st = S.settings;
    var h = '<div class="body"><div class="topbar"><button class="btn sec icon" data-act="back" aria-label="Back">' + I.back + '</button><span class="title">Settings</span><span style="width:44px"></span></div>';

    h += '<div class="group"><div class="item"><label class="lbl" for="setName">Your name</label>'
      + '<input id="setName" class="inp" dir="auto" maxlength="40" value="' + esc(st.name) + '"></div></div>';

    h += accountSection();
    if (web) return h + webSettingsTail();

    h += '<h3 class="h2">Claude</h3><div class="group"><div class="item">';
    h += '<div class="row between"><span class="lbl">API key</span>' + (st.hasKey ? '<span class="ok">Connected</span>' : '<span class="bad">Not connected</span>') + '</div>';
    if (st.hasKey) h += '<span class="src">Saved key ' + esc(st.keyHint) + ', encrypted on this ' + deviceWord() + '. It is never synced.</span>';
    h += '<input id="setKey" class="inp" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + (st.hasKey ? 'Paste a new key to replace it' : 'sk-ant-…') + '">';
    h += '<div class="row"><button class="btn pri flex1" data-act="saveKey">Save key</button>'
      + (st.hasKey ? '<button class="btn sec flex1" data-act="testKey">Test</button><button class="btn danger" data-act="removeKey">Remove</button>' : '') + '</div>';
    h += '<span id="keyResult" class="src"></span>';
    h += '<button class="link" style="text-align:start" data-act="getKey">Get a key at console.anthropic.com ↗</button></div>';

    h += '<div class="item"><span class="lbl">Model</span>' + MODELS.map(function (m) {
      return '<button class="radio' + (st.model === m.id ? ' on' : '') + '" data-model="' + m.id + '"><span class="ring"></span><span class="col"><span class="t">' + esc(m.name)
        + '</span><span class="s">' + esc(m.desc) + ' $' + m.price[0] + ' / $' + m.price[1] + ' per million input/output tokens.</span></span></button>';
    }).join('') + '</div>';

    h += '<div class="item"><span class="lbl">Brief language</span><div class="seg">'
      + [['auto', 'Match source'], ['en', 'English'], ['ar', 'العربية']].map(function (o) {
        return '<button class="' + (st.lang === o[0] ? 'on' : '') + '" data-lang="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';

    h += '<div class="item"><div class="row between"><div class="col grow"><span class="lbl">Auto-file strong matches</span>'
      + '<span class="s">File links into an existing collection without review when Claude is confident. New collections always need your approval.</span></div>'
      + '<button class="switch' + (st.autoFile ? ' on' : '') + '" data-act="toggleAuto" aria-label="Auto-file strong matches"></button></div></div>';
    h += '</div>';

    h += '<h3 class="h2">Usage</h3><div class="group"><div class="item" id="stats"><span class="s">Loading…</span></div></div>';

    h += '<h3 class="h2">Privacy &amp; data</h3><div class="group"><div class="item"><p class="s">'
      + 'Your links, notes and collections are stored on this ' + deviceWord()
      + ((S.account || {}).signedIn ? ' and in your SaveMind sync account (Supabase), where only you can read them. ' : '. ')
      + 'To analyze a link, SaveMind fetches the public page directly from your ' + deviceWord() + ', '
      + 'then sends the extracted text, page details, any text you shared or wrote, and your collection names to Anthropic\'s Claude API using your key. '
      + 'Nothing is sent anywhere else. Pages behind a login cannot be read, and summaries say when information was limited.</p></div>'
      + '<div class="item"><div class="row"><button class="btn sec flex1" data-act="export">Export backup</button><button class="btn sec flex1" data-act="import">Import backup</button></div></div>'
      + '<div class="item"><button class="btn danger" data-act="deleteAll">Delete all data</button></div></div>';

    h += '<p class="src" style="text-align:center">SaveMind ' + esc(S.version || '') + ' · Built to the SaveMind PRD v1.0</p>';
    return h + '</div>';
  }

  function webSettingsTail() {
    return '<h3 class="h2">About the web dashboard</h3><div class="group"><div class="item"><p class="s">'
      + 'This dashboard shows and edits the links synced to your account. Saving and analyzing new links happens in the SaveMind app on Android or Mac; '
      + 'they appear here within seconds. Your Claude API key is never needed here.</p></div>'
      + '<div class="item"><button class="btn sec" data-act="export">Export backup</button></div></div>'
      + '<p class="src" style="text-align:center">SaveMind web ' + esc(S.version || '') + '</p></div>';
  }

  function accountSection() {
    var acc = S.account || {};
    var h = '<h3 class="h2">Account &amp; sync</h3><div class="group"><div class="item">';
    if (!acc.available) {
      return h + '<p class="s">Sync is not set up in this build.</p></div></div>';
    }
    if (acc.signedIn) {
      var status = acc.syncing ? 'Syncing…' : acc.error ? acc.error : acc.lastSync ? 'Synced ' + ago(acc.lastSync) : 'Waiting to sync';
      h += '<div class="row"><span class="avatar">' + esc((acc.email || 'A').charAt(0).toUpperCase()) + '</span><div class="col grow">'
        + '<span class="t" style="font-size:14px">' + esc(acc.email) + '</span><span class="src" style="font-weight:600;color:' + (acc.error ? 'var(--red)' : 'var(--green)') + '">'
        + (acc.error ? '' : '● ') + esc(status) + '</span></div></div>'
        + '<div class="row"><button class="btn sec flex1" data-act="syncNow">Sync now</button><button class="btn danger flex1" data-act="signOut">Sign out</button></div>';
      return h + '</div></div>';
    }
    h += '<div class="row" style="gap:12px;align-items:flex-start"><div class="tile" style="width:44px;height:44px;border-radius:14px;background:var(--blue-soft);color:var(--blue);flex:none">⇄</div>'
      + '<div class="col"><span class="t">Sync with your ' + (desk ? 'phone' : 'Mac') + '</span><span class="s">Sign in with the same email on both devices to keep everything in step.</span></div></div>'
      + '<label class="lbl" for="accEmail">Email</label><input id="accEmail" class="inp" type="email" autocomplete="username" autocapitalize="off" spellcheck="false">'
      + '<label class="lbl" for="accPass">Password</label><input id="accPass" class="inp" type="password" autocomplete="current-password">'
      + '<div class="row"><button class="btn sec flex1" data-act="signUp">Create account</button><button class="btn pri flex1" data-act="signIn">Sign in</button></div>'
      + '<span id="authResult" class="src"></span>'
      + '<p class="src">The links on this ' + deviceWord() + ' are uploaded to your account the first time you sign in. Your Claude API key stays on this ' + deviceWord() + '.</p>';
    return h + '</div></div>';
  }

  function auth(create) {
    var email = document.getElementById('accEmail').value.trim();
    var pass = document.getElementById('accPass').value;
    var out = document.getElementById('authResult');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.className = 'bad'; out.textContent = 'Enter a valid email address.'; return; }
    if (pass.length < 6) { out.className = 'bad'; out.textContent = 'The password needs at least 6 characters.'; return; }
    out.className = 'src';
    out.textContent = create ? 'Creating your account…' : 'Signing in…';
    var id = callbackSeq++;
    callbacks[id] = function (raw) {
      var r = {};
      try { r = JSON.parse(raw); } catch (e) { r = { ok: false, error: 'Unexpected answer.' }; }
      var o = document.getElementById('authResult');
      if (r.ok && r.needsConfirm) {
        if (o) { o.className = 'ok'; o.textContent = 'Account created. Open the confirmation link sent to ' + email + ', then sign in here.'; }
      } else if (r.ok) {
        toast('Signed in. Syncing…');
        load(); render(false);
      } else if (o) {
        o.className = 'bad'; o.textContent = r.error || 'Sign-in failed.';
      }
    };
    SM.signIn(email, pass, !!create, id);
  }

  function bindSettings() {
    var name = document.getElementById('setName');
    name.addEventListener('change', function () { saveSettings({ name: name.value.trim() || 'there' }); });
    renderStats();
  }

  function saveSettings(patch) {
    var st = S.settings;
    var next = { name: st.name, model: st.model, lang: st.lang, autoFile: st.autoFile, onboarded: !!st.onboarded };
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    SM.saveSettings(JSON.stringify(next));
    Object.keys(patch).forEach(function (k) { S.settings[k] = patch[k]; });
  }

  function renderStats() {
    var box = document.getElementById('stats');
    if (!box) return;
    var st;
    try { st = JSON.parse(SM.getStats()); } catch (e) { return; }
    var cost = 0, runs = 0, tokIn = 0, tokOut = 0;
    (st.models || []).forEach(function (m) {
      var p = (MODELS.filter(function (x) { return x.id === m.model; })[0] || MODELS[0]).price;
      cost += (m.input * p[0] + m.output * p[1]) / 1e6;
      runs += m.runs; tokIn += m.input; tokOut += m.output;
    });
    function row(k, v) { return '<div class="stat"><span>' + k + '</span><b>' + v + '</b></div>'; }
    box.innerHTML = row('Links saved', st.links || 0)
      + row('Full source', st.full || 0) + row('Partial source', st.partial || 0) + row('Unavailable', st.unavailable || 0)
      + row('Failed', st.failed || 0) + row('Analyses run', runs)
      + row('Tokens (in / out)', tokIn.toLocaleString() + ' / ' + tokOut.toLocaleString())
      + row('Estimated cost', '$' + cost.toFixed(cost < 1 ? 3 : 2));
  }

  // ----------------------------------------------------------------- sheets

  function openSheet(html, onMount) {
    var overlay = document.getElementById('overlay');
    overlay.innerHTML = '<div class="scrim" data-act="scrim"><div class="sheet" role="dialog"><div class="handle"></div>' + html + '</div></div>';
    if (onMount) onMount(overlay.querySelector('.sheet'));
  }
  function closeSheet() {
    var overlay = document.getElementById('overlay');
    if (!overlay.innerHTML) return false;
    overlay.innerHTML = '';
    if (dirty) render(false);
    return true;
  }

  function promptSheet(opts, done) {
    var html = '<p class="h2">' + esc(opts.title) + '</p>' + (opts.hint ? '<p class="s">' + esc(opts.hint) + '</p>' : '')
      + (opts.multiline
        ? '<textarea id="pIn" class="inp" dir="auto" placeholder="' + esc(opts.placeholder || '') + '">' + esc(opts.value || '') + '</textarea>'
        : '<input id="pIn" class="inp" dir="auto" placeholder="' + esc(opts.placeholder || '') + '" value="' + esc(opts.value || '') + '">')
      + '<div class="row"><button class="btn sec flex1" data-act="sheetCancel">Cancel</button><button class="btn pri flex1" id="pOk">' + esc(opts.ok || 'Save') + '</button></div>';
    openSheet(html, function (sheet) {
      var input = sheet.querySelector('#pIn');
      setTimeout(function () { input.focus(); var v = input.value; input.value = ''; input.value = v; }, 50);
      function submit() { var v = input.value; closeSheet(); done(v); }
      sheet.querySelector('#pOk').addEventListener('click', submit);
      if (!opts.multiline) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });
  }

  function confirmSheet(title, text, okLabel, done) {
    openSheet('<p class="h2">' + esc(title) + '</p><p class="s">' + esc(text) + '</p>'
      + '<div class="row"><button class="btn sec flex1" data-act="sheetCancel">Cancel</button><button class="btn danger flex1" id="cOk">' + esc(okLabel) + '</button></div>',
      function (sheet) { sheet.querySelector('#cOk').addEventListener('click', function () { closeSheet(); done(); }); });
  }

  function moveSheet(id) {
    var l = linkById(id);
    if (!l) return;
    var opts = '<button class="opt' + (l.collection_id === null ? ' sel' : '') + '" data-move="0"><div class="tile" style="background:var(--soft)">IN</div>Inbox</button>';
    S.collections.forEach(function (c) {
      var col = colorOf(c);
      opts += '<button class="opt' + (l.collection_id === c.id ? ' sel' : '') + '" data-move="' + c.id + '"><div class="tile" style="background:' + col[0] + ';color:' + col[1] + '">'
        + esc(initials(c.name)) + '</div><span dir="auto">' + esc(c.name) + '</span></button>';
    });
    if (l.suggested_new_name && !collectionById(l.suggested_collection_id)) {
      opts += '<button class="opt" data-act="accept" data-id="' + l.id + '"><div class="tile" style="background:var(--blue-wash);color:var(--blue)">+</div><span dir="auto">Create “' + esc(l.suggested_new_name) + '”</span></button>';
    }
    opts += '<button class="opt" id="mvNew"><div class="tile" style="background:var(--soft)">+</div>New collection…</button>';
    openSheet('<p class="h2">Move to collection</p><div class="col" style="gap:0">' + opts + '</div>', function (sheet) {
      sheet.addEventListener('click', function (e) {
        var b = e.target.closest('[data-move]');
        if (b) {
          SM.moveLink(id, Number(b.getAttribute('data-move')));
          closeSheet();
          toast('Moved');
          return;
        }
        if (e.target.closest('#mvNew')) {
          closeSheet();
          promptSheet({ title: 'New collection', placeholder: 'e.g. AI & Automation', ok: 'Create & move' }, function (name) {
            if (!name.trim()) return;
            var cid = SM.createCollection(name.trim());
            if (cid > 0) { SM.moveLink(id, cid); toast('Moved to ' + name.trim()); }
          });
        }
      });
    });
  }

  function editSheet(id) {
    var l = linkById(id);
    if (!l) return;
    var html = '<p class="h2">Edit details</p>'
      + '<label class="lbl" for="eTitle">Title</label><input id="eTitle" class="inp" dir="auto" value="' + esc(titleOf(l)) + '">'
      + '<label class="lbl" for="eAction">Action button</label><select id="eAction" class="inp">'
      + ACTIONS.concat(ACTIONS.indexOf(l.action_label) < 0 && l.action_label ? [l.action_label] : []).map(function (a) {
        return '<option' + (a === actionText(l) ? ' selected' : '') + '>' + esc(a) + '</option>';
      }).join('') + '<option value="__custom">Custom…</option></select>'
      + '<input id="eActionCustom" class="inp" placeholder="Custom action label" maxlength="24" hidden>'
      + '<label class="lbl" for="eTags">Tags</label><input id="eTags" class="inp" dir="auto" placeholder="comma separated" value="' + esc((l.tags || []).join(', ')) + '">'
      + '<label class="lbl" for="eNotes">Notes</label><textarea id="eNotes" class="inp" dir="auto">' + esc(l.notes || '') + '</textarea>'
      + '<div class="row"><button class="btn sec flex1" data-act="sheetCancel">Cancel</button><button class="btn pri flex1" id="eSave">Save</button></div>';
    openSheet(html, function (sheet) {
      var sel = sheet.querySelector('#eAction');
      var custom = sheet.querySelector('#eActionCustom');
      sel.addEventListener('change', function () { custom.hidden = sel.value !== '__custom'; if (!custom.hidden) custom.focus(); });
      sheet.querySelector('#eSave').addEventListener('click', function () {
        var action = sel.value === '__custom' ? custom.value.trim() : sel.value;
        var patch = {
          title: sheet.querySelector('#eTitle').value,
          tags: sheet.querySelector('#eTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
          notes: sheet.querySelector('#eNotes').value
        };
        if (action) patch.action_label = action;
        SM.updateLink(id, JSON.stringify(patch));
        closeSheet();
        toast('Saved');
      });
    });
  }

  function actionSheet(id) {
    var l = linkById(id);
    if (!l) return;
    var opts = ACTIONS.map(function (a) {
      return '<button class="opt' + (a === l.action_label ? ' sel' : '') + '" data-action-label="' + esc(a) + '">' + (isWatch(a) ? '▶ ' : '↗ ') + esc(a) + '</button>';
    }).join('');
    openSheet('<p class="h2">Recommended action</p><p class="s">The button always opens the original link.</p><div class="col" style="gap:0">' + opts + '</div>', function (sheet) {
      sheet.addEventListener('click', function (e) {
        var b = e.target.closest('[data-action-label]');
        if (!b) return;
        SM.updateLink(id, JSON.stringify({ action_label: b.getAttribute('data-action-label') }));
        closeSheet();
      });
    });
  }

  function deadlineSheet(id) {
    var l = linkById(id);
    if (!l) return;
    var has = hasDeadline(l);
    var d = has ? new Date(l.deadline_at) : null;
    var dateVal = d ? d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) : '';
    var timeVal = d && l.deadline_has_time ? pad2(d.getHours()) + ':' + pad2(d.getMinutes()) : '';
    var remind = l.deadline_source === 'user' ? (l.remind_days || 0) : 3;
    var hint = !has ? 'Add the closing date so SaveMind shows it on Home and can remind you.'
      : l.deadline_source === 'user' ? 'You set this deadline. Claude will not change it.'
      : 'Claude found ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' in the saved link. Correct it if the official page says otherwise.';
    var opts = [[0, 'Off'], [3, '3 days before'], [7, '1 week before']];
    var html = '<p class="h2">Deadline</p><p class="s">' + esc(hint) + '</p>'
      + '<label class="lbl" for="dDate">Date</label><input id="dDate" class="inp" type="date" value="' + esc(dateVal) + '">'
      + '<label class="lbl" for="dTime">Time (optional)</label><input id="dTime" class="inp" type="time" value="' + esc(timeVal) + '">'
      + '<span class="lbl">Remind me</span><div class="row wrap" role="group" aria-label="Remind me" style="gap:6px">'
      + opts.map(function (o) {
        return '<button type="button" class="chip' + (o[0] === remind ? ' ink' : '') + '" data-remind="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>'
      + '<div class="row" style="margin-top:4px">' + (has ? '<button class="btn danger flex1" id="dRemove">Remove</button>' : '<button class="btn sec flex1" data-act="sheetCancel">Cancel</button>')
      + '<button class="btn pri flex14" id="dSave">Save deadline</button></div>';
    openSheet(html, function (sheet) {
      sheet.addEventListener('click', function (e) {
        var b = e.target.closest('[data-remind]');
        if (!b) return;
        remind = Number(b.getAttribute('data-remind'));
        sheet.querySelectorAll('[data-remind]').forEach(function (x) { x.classList.toggle('ink', x === b); });
      });
      sheet.querySelector('#dSave').addEventListener('click', function () {
        var date = sheet.querySelector('#dDate').value;
        if (!date) { toast('Choose a date'); return; }
        if (SM.setDeadline(id, date, sheet.querySelector('#dTime').value || '', remind)) {
          closeSheet();
          toast('Deadline saved');
        } else toast('That date is not valid');
      });
      var rm = sheet.querySelector('#dRemove');
      if (rm) rm.addEventListener('click', function () { SM.clearDeadline(id); closeSheet(); toast('Deadline removed'); });
    });
  }

  function moreSheet(id) {
    var l = linkById(id);
    if (!l) return;
    openSheet('<div class="col" style="gap:0">'
      + '<button class="opt" data-act="edit" data-id="' + id + '">Edit details</button>'
      + '<button class="opt" data-act="move" data-id="' + id + '">Move to collection</button>'
      + '<button class="opt" data-act="deadline" data-id="' + id + '">' + (hasDeadline(l) ? 'Edit deadline' : 'Set deadline') + '</button>'
      + '<button class="opt" data-act="share" data-id="' + id + '">Share link</button>'
      + '<button class="opt" data-act="copy" data-id="' + id + '">Copy link</button>'
      + (canAnalyze() ? '<button class="opt" data-act="retry" data-id="' + id + '">Analyze again</button>' : '')
      + '<button class="opt" data-act="archive" data-id="' + id + '">' + (l.archived ? 'Unarchive' : 'Archive') + '</button>'
      + '<button class="opt red" data-act="delete" data-id="' + id + '">Delete</button></div>');
  }

  function collectionMenu(id) {
    var c = collectionById(id);
    if (!c) return;
    openSheet('<p class="h2" dir="auto">' + esc(c.name) + '</p><div class="col" style="gap:0">'
      + '<button class="opt" id="cRename">Rename</button><button class="opt red" id="cDelete">Delete collection</button></div>', function (sheet) {
      sheet.querySelector('#cRename').addEventListener('click', function () {
        closeSheet();
        promptSheet({ title: 'Rename collection', value: c.name, ok: 'Rename' }, function (name) {
          if (name.trim() && !SM.renameCollection(id, name.trim())) toast('A collection with that name already exists');
        });
      });
      sheet.querySelector('#cDelete').addEventListener('click', function () {
        closeSheet();
        confirmSheet('Delete “' + c.name + '”?', 'Its links move back to the Inbox. Nothing is deleted from your saved links.', 'Delete', function () {
          SM.deleteCollection(id);
          back();
        });
      });
    });
  }

  // ---------------------------------------------------------------- actions

  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  var ANALYSIS_ACTS = ['add', 'retry', 'context', 'refAdd', 'planReanalyze', 'countryReanalyze', 'reanalyze'];

  function doAction(act, id, el) {
    if (!canAnalyze() && ANALYSIS_ACTS.indexOf(act) >= 0) {
      toast('Save and analyze links in the SaveMind app on Android or Mac.');
      return;
    }
    var l = id ? linkById(id) : null;
    switch (act) {
      case 'back': back(); break;
      case 'scrim': closeSheet(); break;
      case 'sheetCancel': closeSheet(); break;
      case 'add': addState.copy = false; go('#/add'); break;
      case 'settings': go('#/settings'); break;
      case 'open': go('#/link/' + id); break;
      case 'visit': if (l) SM.openUrl(l.url); break;
      case 'save': saveAdd(); break;
      case 'saveCopy': addState.copy = true; saveAdd(); break;
      case 'paste': {
        var text = SM.readClipboard();
        var found = text ? SM.validateUrl(text) : '';
        if (!found) { toast(text ? 'The clipboard has no link' : 'The clipboard is empty'); break; }
        addState.url = found;
        var inp = document.getElementById('addUrl');
        inp.value = found;
        inp.dispatchEvent(new Event('input'));
        if (!addState.context && text.trim() !== found) {
          var rest = text.replace(found, ' ').replace(/\s+/g, ' ').trim();
          if (rest && rest.length < 1000) { addState.context = rest; document.getElementById('addCtx').value = rest; }
        }
        break;
      }
      case 'accept': {
        closeSheet();
        var name = SM.acceptSuggestion(id);
        toast(name && name !== 'Inbox' ? 'Saved to ' + name : 'Reviewed');
        break;
      }
      case 'keep': SM.setFlag(id, 'reviewed', true); closeSheet(); toast('Kept in Inbox'); break;
      case 'move': closeSheet(); moveSheet(id); break;
      case 'edit': closeSheet(); editSheet(id); break;
      case 'editAction': actionSheet(id); break;
      case 'more': moreSheet(id); break;
      case 'fav': SM.setFlag(id, 'favorite', !l.favorite); break;
      case 'archive':
        closeSheet();
        SM.setFlag(id, 'archived', !l.archived);
        toast(l.archived ? 'Unarchived' : 'Archived');
        break;
      case 'delete':
        closeSheet();
        confirmSheet('Delete this link?', 'It is removed from SaveMind and from search. This cannot be undone.', 'Delete', function () {
          SM.deleteLink(id);
          if (current() === '#/link/' + id) back();
          toast('Deleted');
        });
        break;
      case 'retry':
        closeSheet();
        SM.retry(id, '');
        toast(S.settings.hasKey ? 'Analyzing again' : 'Add a Claude API key in Settings first');
        break;
      case 'context':
        promptSheet({ title: 'Add context', hint: 'Describe what the link is about. Claude uses it when the page itself cannot be read.', multiline: true, ok: 'Save & retry' }, function (v) {
          SM.retry(id, v);
          toast('Analyzing again');
        });
        break;
      case 'notes':
        promptSheet({ title: 'Notes', value: l ? l.notes || '' : '', multiline: true, placeholder: 'Your note' }, function (v) {
          SM.updateLink(id, JSON.stringify({ notes: v }));
        });
        break;
      case 'addTag':
        promptSheet({ title: 'Add tag', placeholder: 'e.g. research' }, function (v) {
          var tag = v.trim().replace(/^#+/, '');
          if (!tag || !l) return;
          SM.updateLink(id, JSON.stringify({ tags: (l.tags || []).concat([tag]) }));
        });
        break;
      case 'copy': closeSheet(); if (l) SM.copyText(l.url); break;
      case 'share': closeSheet(); if (l) SM.shareLink(l.url, titleOf(l)); break;
      case 'newCollection':
        promptSheet({ title: 'New collection', placeholder: 'e.g. Scholarships', ok: 'Create' }, function (name) {
          if (!name.trim()) return;
          var cid = SM.createCollection(name.trim());
          if (cid > 0) toast('Created ' + name.trim());
        });
        break;
      case 'collectionMenu': collectionMenu(id); break;
      case 'deadline': closeSheet(); deadlineSheet(id); break;
      case 'search': goTab('#/search'); setTimeout(function () { var q = document.getElementById('q'); if (q) q.focus(); }, 30); break;
      case 'signIn': auth(false); break;
      case 'signUp': auth(true); break;
      case 'syncNow': SM.syncNow(); toast('Syncing…'); break;
      case 'signOut':
        confirmSheet('Sign out?', web ? 'Your links stay in your account. This browser removes its copy until you sign in again.' : 'Your links stay on this ' + deviceWord() + ' and in your account. This ' + deviceWord() + ' stops syncing until you sign in again.', 'Sign out', function () {
          SM.signOut();
          toast('Signed out');
        });
        break;
      case 'toggleMissed': showMissed = !showMissed; render(false); break;
      case 'wNext1': {
        var nm = document.getElementById('wName').value.trim();
        if (!nm) { toast('Enter your name'); document.getElementById('wName').focus(); break; }
        saveSettings({ name: nm });
        if (web) { finishWelcome(); break; }
        welcomeStep = 2;
        render(true);
        break;
      }
      case 'wSaveKey': {
        var k = document.getElementById('setKey').value.trim();
        if (!/^sk-ant-/.test(k)) { toast('Claude API keys start with sk-ant-'); break; }
        if (SM.setApiKey(k)) { load(); welcomeStep = 3; render(true); toast('Key saved'); }
        else toast('Could not save the key');
        break;
      }
      case 'wNext2': welcomeStep = 3; render(true); break;
      case 'wDone': finishWelcome(); break;
      case 'dashTable': dashTable[el.getAttribute('data-v')] = !dashTable[el.getAttribute('data-v')]; render(false); break;
      case 'collMode': go(el.getAttribute('data-v') === 'countries' ? '#/countries' : '#/collections', true); break;
      case 'countryFilter': countryFilter = el.getAttribute('data-v'); render(false); break;
      case 'countries': closeSheet(); countrySheet(id); break;
      case 'countryReanalyze':
        confirmSheet('Find their countries?', 'Claude reads each one again to add its country. Each costs one analysis. Countries you set yourself are kept.', 'Analyze', function () {
          var n = SM.reanalyzeMissingCountries();
          toast(n ? 'Analyzing ' + n + ' opportunit' + (n === 1 ? 'y' : 'ies') : 'Nothing to analyze');
        });
        break;
      case 'refsToggle': refsOpen[id] = !refsOpen[id]; render(false); break;
      case 'refOpen': if (l && l.ref_links[Number(el.getAttribute('data-i'))]) SM.openUrl(l.ref_links[Number(el.getAttribute('data-i'))].url); break;
      case 'refRemove': SM.removeRefLink(id, Number(el.getAttribute('data-i'))); break;
      case 'refAdd':
        promptSheet({ title: 'Add reference link', hint: 'The official call, guidelines or an FAQ that explains this opportunity. Claude reads it and updates the brief, deadline, country and plan.', placeholder: 'https://', ok: 'Add and analyze' }, function (v) {
          if (!v.trim()) return;
          var r = JSON.parse(SM.addRefLink(id, v.trim()));
          if (r.ok) { refsOpen[id] = true; toast('Added. Claude is reading it.'); }
          else toast(r.error || 'Could not add the link');
        });
        break;
      case 'planToggle': planOpen[id] = !planOpen[id]; render(false); break;
      case 'planReanalyze':
        confirmSheet('Analyze these opportunities?', 'Claude reads each one again to estimate the work and list the preparation steps. Each costs one analysis. Deadlines and steps you set yourself are kept.', 'Analyze', function () {
          var n = SM.reanalyzeMissingPlans();
          toast(n ? 'Analyzing ' + n + ' opportunit' + (n === 1 ? 'y' : 'ies') : 'Nothing to analyze');
        });
        break;
      case 'editEffort':
        promptSheet({ title: 'Work needed', hint: 'How many working days do you need to prepare this application?', value: l && l.effort_days ? String(l.effort_days) : '', placeholder: 'Days, e.g. 3', ok: 'Save' }, function (v) {
          var n = parseInt(v, 10);
          if (n >= 1 && n <= 60) SM.setEffort(id, n); else toast('Enter a number of days from 1 to 60');
        });
        break;
      case 'stepToggle': case 'stepRemove': {
        if (!l) break;
        var i = Number(el.getAttribute('data-i'));
        var steps = stepsOf(l).map(function (x) { return { t: x.t, d: x.d ? 1 : 0 }; });
        if (act === 'stepToggle') steps[i].d = steps[i].d ? 0 : 1; else steps.splice(i, 1);
        l.steps = steps;
        SM.setSteps(id, JSON.stringify(steps));
        render(false);
        break;
      }
      case 'progressEdit':
        if (!l) break;
        promptSheet({ title: 'Where are you with this?', hint: 'Your last step or what you are waiting for. It shows at the top of this opportunity and in the Planner.',
          value: l.progress || '', placeholder: 'e.g. Sent emails, waiting for replies from supervisors', ok: 'Save', multiline: true }, function (v) {
          SM.updateLink(id, JSON.stringify({ progress: v.trim().slice(0, 500) }));
          l.progress = v.trim() || null;
          l.progress_at = l.progress ? Date.now() : null;
          render(false);
          toast(l.progress ? 'Saved' : 'Note cleared');
        });
        break;
      case 'stepEdit': {
        if (!l) break;
        var si = Number(el.getAttribute('data-i'));
        var cur = stepsOf(l)[si];
        if (!cur) break;
        promptSheet({ title: 'Edit step', value: cur.t, placeholder: 'Step', ok: 'Save' }, function (v) {
          if (!v.trim()) { toast('A step needs some text. Use × to remove it.'); return; }
          var steps = stepsOf(l).map(function (x) { return { t: x.t, d: x.d ? 1 : 0 }; });
          if (!steps[si]) return;
          steps[si].t = v.trim().slice(0, 200);
          l.steps = steps;
          SM.setSteps(id, JSON.stringify(steps));
          render(false);
        });
        break;
      }
      case 'stepAdd':
        promptSheet({ title: 'Add step', placeholder: 'e.g. Ask for a recommendation letter', ok: 'Add' }, function (v) {
          if (!v.trim() || !l) return;
          var steps = stepsOf(l).map(function (x) { return { t: x.t, d: x.d ? 1 : 0 }; });
          steps.push({ t: v.trim(), d: 0 });
          SM.setSteps(id, JSON.stringify(steps));
        });
        break;
      case 'allDeadlines': searchState = { q: '', filter: 'deadline' }; goTab('#/search'); break;
      case 'saveKey': {
        var key = document.getElementById('setKey').value.trim();
        if (!key) { toast('Paste your API key first'); break; }
        if (!/^sk-ant-/.test(key)) { toast('Claude API keys start with sk-ant-'); break; }
        if (SM.setApiKey(key)) {
          load(); render(false);
          var res = document.getElementById('keyResult');
          if (res) res.textContent = 'Key saved. Testing…';
          testKey();
        } else toast('Could not save the key');
        break;
      }
      case 'testKey': testKey(); break;
      case 'removeKey':
        confirmSheet('Remove API key?', 'Saved links stay. New links will wait until a key is added again.', 'Remove', function () {
          SM.setApiKey('');
          load(); render(false);
        });
        break;
      case 'getKey': SM.openUrl('https://console.anthropic.com/settings/keys'); break;
      case 'toggleAuto': saveSettings({ autoFile: !S.settings.autoFile }); el.classList.toggle('on', S.settings.autoFile); break;
      case 'export': SM.exportData(); break;
      case 'import': SM.importData(); break;
      case 'deleteAll':
        confirmSheet('Delete all data?', (S.account && S.account.signedIn
          ? 'Every saved link, note and collection is removed from this ' + deviceWord() + ' and from your synced account, so your other devices lose them too.'
          : 'Every saved link, note and collection is removed from this ' + deviceWord() + '.') + ' Export a backup first if you may need them.', 'Delete everything', function () {
          SM.deleteAllData(false);
          toast('All data deleted');
          goTab('#/home');
        });
        break;
    }
  }

  function testKey() {
    var res = document.getElementById('keyResult');
    if (res) { res.className = 'src'; res.textContent = 'Testing…'; }
    var id = callbackSeq++;
    callbacks[id] = function (result) {
      var r = document.getElementById('keyResult');
      if (!r) return;
      if (result === 'ok') { r.className = 'ok'; r.textContent = 'Connected. Claude is ready.'; }
      else { r.className = 'bad'; r.textContent = result; }
    };
    SM.testApiKey(id);
  }

  // ----------------------------------------------------------------- events

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-go],[data-act],[data-filter],[data-model],[data-lang]');
    if (!t) return;
    if (t.hasAttribute('data-tab')) { goTab(t.getAttribute('data-tab')); return; }
    if (t.hasAttribute('data-go')) { go(t.getAttribute('data-go')); return; }
    if (t.hasAttribute('data-filter')) { searchState.filter = t.getAttribute('data-filter'); renderResults(); return; }
    if (t.hasAttribute('data-model')) {
      saveSettings({ model: t.getAttribute('data-model') });
      document.querySelectorAll('[data-model]').forEach(function (b) { b.classList.toggle('on', b === t); });
      var r = document.getElementById('keyResult');
      if (r) r.textContent = '';
      return;
    }
    if (t.hasAttribute('data-lang')) {
      saveSettings({ lang: t.getAttribute('data-lang') });
      document.querySelectorAll('[data-lang]').forEach(function (b) { b.classList.toggle('on', b === t); });
      return;
    }
    var act = t.getAttribute('data-act');
    if (act === 'scrim' && e.target !== t) return;
    var id = t.hasAttribute('data-id') ? Number(t.getAttribute('data-id')) : 0;
    doAction(act, id, t);
  });

  document.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.target.remove();
  }, true);

  function typing() {
    var a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }

  window.SMNative = {
    changed: function () {
      if (stepDrag) return;
      load();
      if (web && !(S.account || {}).signedIn) { if (!typing()) render(false); return; }
      var route = current();
      if (desk && !document.getElementById('overlay').innerHTML && route !== '#/add' && route !== '#/welcome' && !typing()) { render(false); return; }
      if (desk) { renderSide(); }
      if (document.getElementById('overlay').innerHTML || route === '#/add') { dirty = true; renderTabs(document.getElementById('tabs').hidden ? null : tabOf(route)); return; }
      if (route === '#/search') { renderTabs('search'); renderResults(); return; }
      if (route === '#/settings' || route === '#/welcome') { if (!typing()) render(false); else dirty = true; return; }
      render(false);
    },
    go: function (route) { nav = ['#/home']; if (route !== '#/home') nav.push(route); closeSheet(); render(true); },
    back: back,
    toast: function (msg) { toast(msg); },
    callback: function (id, result) { var cb = callbacks[id]; delete callbacks[id]; if (cb) cb(result); }
  };

  function tabOf(route) {
    if (route === '#/home' || route === '#/dashboard') return 'home';
    if (route === '#/inbox') return 'inbox';
    if (route === '#/search') return 'search';
    if (route === '#/planner') return 'planner';
    if (route === '#/collections' || route === '#/countries' || route.indexOf('#/c/') === 0 || route.indexOf('#/country/') === 0) return 'collections';
    return null;
  }

  // ------------------------------------------------------------------- boot

  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!canAnalyze()) return;
    var dt = e.dataTransfer;
    var text = dt ? (dt.getData('text/uri-list') || dt.getData('text/plain') || '') : '';
    var url = text ? SM.validateUrl(text.split('\n')[0]) : '';
    if (!url) { toast('Drop a web link to save it'); return; }
    addState = { url: url, context: '', copy: false, dup: null, error: '' };
    go('#/add');
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); doAction('search', 0, null); }
    else if ((e.metaKey || e.ctrlKey) && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); doAction('add', 0, null); }
    else if (e.key === 'Escape' && desk) { back(); }
  });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (!web) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var was = desk;
      load();
      if (was !== desk) render(false);
    }, 150);
  });

  // Hover tooltips for chart marks (data-tip).
  var tipEl = null;
  function showTip(t) {
    if (!t) { if (tipEl) tipEl.hidden = true; return; }
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    tipEl.textContent = t.getAttribute('data-tip');
    tipEl.hidden = false;
    var r = t.getBoundingClientRect();
    tipEl.style.left = Math.max(8, Math.min(window.innerWidth - tipEl.offsetWidth - 8, r.left + r.width / 2 - tipEl.offsetWidth / 2)) + 'px';
    tipEl.style.top = Math.max(8, r.top - tipEl.offsetHeight - 8) + 'px';
  }
  document.addEventListener('mouseover', function (e) { showTip(e.target.closest ? e.target.closest('[data-tip]') : null); });
  document.addEventListener('focusin', function (e) { showTip(e.target.closest ? e.target.closest('[data-tip]') : null); });
  document.addEventListener('scroll', function () { showTip(null); }, true);

  window.addEventListener('focus', function () { setTimeout(offerClipboard, 200); });

  load();
  var initial = location.hash;
  if (initial && initial.indexOf('#/') === 0 && initial !== '#/home') nav.push(initial);
  if (needsWelcome()) nav = ['#/welcome'];
  render(true);
  setTimeout(offerClipboard, 600);
})();
