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
    link: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>'
  };

  // ------------------------------------------------------------------ state

  var S = { links: [], collections: [], settings: {}, version: '' };
  var nav = ['#/home'];
  var dirty = false;
  var searchState = { q: '', filter: 'all' };
  var addState = { url: '', context: '', copy: false, dup: null, error: '' };
  var callbacks = {};
  var callbackSeq = 1;

  function load() {
    try { S = JSON.parse(SM.getState()); } catch (e) { /* keep last state */ }
  }

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
    return '<button class="card rowcard tap" data-act="open" data-id="' + l.id + '">' + thumb(l)
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
    if (nav.length > 1) { nav.pop(); render(true); return true; }
    if (current() !== '#/home') { nav = ['#/home']; render(true); return true; }
    return false;
  }

  var scrollMemo = {};
  function render(navigated) {
    var view = document.getElementById('view');
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
      case 'collections': html = viewCollections(); tab = 'collections'; break;
      case 'c': html = viewCollection(arg); tab = 'collections'; break;
      case 'link': html = viewLink(Number(arg)); break;
      case 'search': html = viewSearch(); tab = 'search'; break;
      case 'settings': html = viewSettings(); break;
      default: html = viewHome(); tab = 'home';
    }
    view.innerHTML = html;
    renderTabs(tab);
    if (name === 'add') bindAdd();
    if (name === 'search') bindSearch();
    if (name === 'settings') bindSettings();
    view.scrollTop = navigated ? (scrollMemo[route] && nav.indexOf(route) < nav.length - 1 ? scrollMemo[route] : 0) : scrollMemo[route] || 0;
    if (navigated) scrollMemo[route] = 0;
    dirty = false;
  }

  function renderTabs(active) {
    var tabs = document.getElementById('tabs');
    if (!active) { tabs.hidden = true; return; }
    tabs.hidden = false;
    var pending = inboxItems().length;
    function t(id, label, icon, route) {
      return '<button class="tab' + (active === id ? ' on' : '') + '" data-tab="' + route + '">' + icon + label
        + (id === 'inbox' && pending ? '<span class="dot">' + (pending > 99 ? '99+' : pending) + '</span>' : '') + '</button>';
    }
    tabs.innerHTML = t('home', 'Home', I.home, '#/home') + t('inbox', 'Inbox', I.inbox, '#/inbox')
      + '<button class="fab" aria-label="Add link" data-act="add">' + I.plus + '</button>'
      + t('collections', 'Collections', I.folder, '#/collections') + t('search', 'Search', I.search, '#/search');
  }

  // ------------------------------------------------------------------- Home

  function viewHome() {
    var name = S.settings.name || 'there';
    var pending = inboxItems().length;
    var h = '<div class="body">';
    h += '<div class="row between"><h1 class="h1" dir="auto">Hi, ' + esc(name) + '</h1>'
      + '<button class="avatar" data-act="settings" aria-label="Settings">' + esc(initials(name).charAt(0)) + '</button></div>';
    if (!S.settings.hasKey) h += keyNotice();
    h += '<button class="hero" data-tab="#/inbox"><div><p class="k">Smart Inbox</p><p class="v">'
      + (pending ? pending + ' to review' : 'All caught up') + '</p></div><span class="btn">Review</span></button>';

    var deadlines = upcomingDeadlines();
    if (deadlines.length) {
      h += '<div class="row between"><h3 class="h2">Upcoming deadlines</h3><button class="link" data-act="allDeadlines">See all</button></div>';
      h += '<div class="dlist">' + deadlines.slice(0, 3).map(deadlineRow).join('') + '</div>';
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
    if (!S.settings.hasKey && items.length) h += keyNotice();
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
      + (l.archived ? '<span class="chip">Archived</span>' : '') + '</div>';

    h += deadlineBlock(l);

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
        + (l.source_level === 'PARTIAL' ? '<p class="src">Based on page metadata or shared text only. Open the original for full details.</p>' : '')
        + '</div>';
    }

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
    var h = '<div class="body"><div class="row between"><h1 class="h1">Collections</h1><button class="btn sec" style="min-height:40px" data-act="newCollection">+ New</button></div>';
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
        l.notes, l.topic, siteOf(l), l.shared_text, l.action_label].join(' '));
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

    h += '<h3 class="h2">Claude</h3><div class="group"><div class="item">';
    h += '<div class="row between"><span class="lbl">API key</span>' + (st.hasKey ? '<span class="ok">Connected</span>' : '<span class="bad">Not connected</span>') + '</div>';
    if (st.hasKey) h += '<span class="src">Saved key ' + esc(st.keyHint) + ', encrypted on this phone.</span>';
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
      + 'Your links, notes and collections are stored only on this phone. To analyze a link, SaveMind fetches the public page directly from your phone, '
      + 'then sends the extracted text, page details, any text you shared or wrote, and your collection names to Anthropic\'s Claude API using your key. '
      + 'Nothing is sent anywhere else. Pages behind a login cannot be read, and summaries say when information was limited.</p></div>'
      + '<div class="item"><div class="row"><button class="btn sec flex1" data-act="export">Export backup</button><button class="btn sec flex1" data-act="import">Import backup</button></div></div>'
      + '<div class="item"><button class="btn danger" data-act="deleteAll">Delete all data</button></div></div>';

    h += '<p class="src" style="text-align:center">SaveMind ' + esc(S.version || '') + ' · Built to the SaveMind PRD v1.0</p>';
    return h + '</div>';
  }

  function bindSettings() {
    var name = document.getElementById('setName');
    name.addEventListener('change', function () { saveSettings({ name: name.value.trim() || 'there' }); });
    renderStats();
  }

  function saveSettings(patch) {
    var st = S.settings;
    var next = { name: st.name, model: st.model, lang: st.lang, autoFile: st.autoFile };
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
      + '<button class="opt" data-act="retry" data-id="' + id + '">Analyze again</button>'
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

  function doAction(act, id, el) {
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
        confirmSheet('Delete all data?', 'Every saved link, note and collection is removed from this phone. Export a backup first if you may need them.', 'Delete everything', function () {
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
      load();
      var route = current();
      if (document.getElementById('overlay').innerHTML || route === '#/add') { dirty = true; renderTabs(document.getElementById('tabs').hidden ? null : tabOf(route)); return; }
      if (route === '#/search') { renderTabs('search'); renderResults(); return; }
      if (route === '#/settings') { if (!typing()) render(false); else dirty = true; return; }
      render(false);
    },
    go: function (route) { nav = ['#/home']; if (route !== '#/home') nav.push(route); closeSheet(); render(true); },
    back: back,
    callback: function (id, result) { var cb = callbacks[id]; delete callbacks[id]; if (cb) cb(result); }
  };

  function tabOf(route) {
    if (route === '#/home') return 'home';
    if (route === '#/inbox') return 'inbox';
    if (route === '#/search') return 'search';
    if (route === '#/collections' || route.indexOf('#/c/') === 0) return 'collections';
    return null;
  }

  // ------------------------------------------------------------------- boot

  load();
  var initial = location.hash;
  if (initial && initial.indexOf('#/') === 0 && initial !== '#/home') nav.push(initial);
  render(true);
})();
