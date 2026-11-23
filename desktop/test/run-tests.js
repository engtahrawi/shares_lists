'use strict';
// Tests for the desktop backend: sync between two devices through a stand-in server, the Claude
// answer validator, deadline parsing and HTML extraction. Run with: node test/run-tests.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, parseDeadline } = require('../backend/store');
const { Sync } = require('../backend/sync');
const claude = require('../backend/claude');
const extractor = require('../backend/extractor');
const urlutil = require('../backend/urlutil');
const fake = require('./fake-supabase');

const ANON = 'test-anon-key-0123456789012345678901234567890123456789';
const plain = { encrypt: (t) => Buffer.from(t).toString('base64'), decrypt: (e) => Buffer.from(e, 'base64').toString() };
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('ok   ' + name); } catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); }
}

function device(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-'));
  const store = new Store(dir, plain);
  const sync = new Sync(store, { url, anonKey: ANON }, { changed() {}, linkChanged() {}, analyze() {} });
  return { store, sync };
}

(async () => {
  const srv = await fake.start(ANON);

  await test('sign up, sign in and wrong password', async () => {
    const a = device(srv.url);
    let r = await a.sync.signIn('me@example.com', 'secret123', true);
    assert.strictEqual(r.ok, true);
    const b = device(srv.url);
    r = await b.sync.signIn('me@example.com', 'wrong', false);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'Wrong email or password.');
    r = await b.sync.signIn('me@example.com', 'secret123', false);
    assert.strictEqual(r.ok, true);
    assert.ok(b.store.signedIn());
  });

  const A = device(srv.url), B = device(srv.url);
  await A.sync.signIn('me@example.com', 'secret123', false);
  await B.sync.signIn('me@example.com', 'secret123', false);

  await test('a link and collection saved on A appear on B', async () => {
    const cid = A.store.createCollection('Scholarships');
    const id = A.store.insertLink('https://daad.de/grant?utm_source=x', 'Grant post', 'WhatsApp', null);
    A.store.updateLink(id, { collection_id: cid, title: 'DAAD research grant', tags: ['phd'], steps: [{ t: 'Write proposal', d: 0 }],
      deadline_at: parseDeadline('2026-12-01').at, effort_days: 7, status: 'analyzed', reviewed: 1 });
    await A.sync.syncNow();
    await B.sync.syncNow();
    const bl = B.store.allLinks();
    assert.strictEqual(bl.length, 1);
    assert.strictEqual(bl[0].title, 'DAAD research grant');
    assert.deepStrictEqual(bl[0].tags, ['phd']);
    assert.strictEqual(bl[0].effort_days, 7);
    assert.strictEqual(B.store.collectionName(bl[0].collection_id), 'Scholarships');
    assert.strictEqual(bl[0].dirty, 0);
    assert.strictEqual(bl[0].normalized_url, 'daad.de/grant');
  });

  await test('an edit on B reaches A, and nothing is re-uploaded needlessly', async () => {
    const bid = B.store.allLinks()[0].id;
    B.store.updateLink(bid, { notes: 'Ask Prof. Modic', steps: [{ t: 'Write proposal', d: 1 }] });
    await B.sync.syncNow();
    await A.sync.syncNow();
    const al = A.store.allLinks()[0];
    assert.strictEqual(al.notes, 'Ask Prof. Modic');
    assert.strictEqual(al.steps[0].d, 1);
    assert.strictEqual(A.store.outgoing().length, 0);
    assert.strictEqual(B.store.outgoing().length, 0);
  });

  await test('the latest edit wins when both devices change the same link', async () => {
    const aid = A.store.allLinks()[0].id, bid = B.store.allLinks()[0].id;
    A.store.updateLink(aid, { title: 'Edited on A' });
    await new Promise((r) => setTimeout(r, 5));
    B.store.updateLink(bid, { title: 'Edited on B later' });
    await A.sync.syncNow();
    await B.sync.syncNow();
    await A.sync.syncNow();
    assert.strictEqual(A.store.allLinks()[0].title, 'Edited on B later');
    assert.strictEqual(B.store.allLinks()[0].title, 'Edited on B later');
  });

  await test('a renamed collection and a moved link sync', async () => {
    const cid = B.store.allCollections()[0].id;
    B.store.renameCollection(cid, 'Funding');
    const c2 = B.store.createCollection('PhD');
    B.store.updateLink(B.store.allLinks()[0].id, { collection_id: c2 });
    await B.sync.syncNow();
    await A.sync.syncNow();
    const names = A.store.allCollections().map((c) => c.name).sort();
    assert.deepStrictEqual(names, ['Funding', 'PhD']);
    assert.strictEqual(A.store.collectionName(A.store.allLinks()[0].collection_id), 'PhD');
  });

  await test('deleting a link and a collection on A removes them on B', async () => {
    A.store.deleteCollection(A.store.collectionIdByName('Funding'));
    A.store.deleteLink(A.store.allLinks()[0].id);
    await A.sync.syncNow();
    await B.sync.syncNow();
    assert.strictEqual(B.store.allLinks().length, 0);
    assert.deepStrictEqual(B.store.allCollections().map((c) => c.name), ['PhD']);
    assert.strictEqual(A.store.data.tombstones.length, 0);
  });

  await test('only the device that saved a link analyzes it', async () => {
    const id = A.store.insertLink('https://example.org/call', '', 'SaveMind', null);
    await A.sync.syncNow();
    await B.sync.syncNow();
    assert.strictEqual(B.store.allLinks().find((l) => l.url === 'https://example.org/call').status, 'queued');
    assert.strictEqual(B.store.claimNextQueued(), null);
    assert.ok(A.store.claimNextQueued());
    assert.ok(id > 0);
  });

  await test('links saved before signing in are uploaded on first sign-in', async () => {
    const C = device(srv.url);
    C.store.insertLink('https://offline.example.com/a', '', 'SaveMind', null);
    await C.sync.signIn('me@example.com', 'secret123', false);
    await C.sync.syncNow();
    await B.sync.syncNow();
    assert.ok(B.store.allLinks().some((l) => l.url === 'https://offline.example.com/a'));
    assert.ok(C.store.allLinks().length >= 2);
  });

  await test('an expired session refreshes itself', async () => {
    A.store.prefs.session.expires = Date.now() - 1000;
    const before = A.store.prefs.session.access;
    await A.sync.syncNow();
    assert.notStrictEqual(A.store.prefs.session.access, before);
    assert.strictEqual(A.store.prefs.syncError, null);
  });

  await test('Claude answers are validated', async () => {
    const cols = [{ id: 1, name: 'AI & Automation' }];
    const raw = JSON.stringify({ stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify({
      title: 'T', summary: 'S', content_type: 'Opportunity', topic: 'x', tags: ['#A b', 'a-b'], suggested_existing_collection_id: 99,
      suggested_new_collection_name: 'ai & automation', recommended_action: 'apply', confidence: 3, content_sufficient: true,
      deadline: '2026-02-30', effort_days: 50, prep_steps: ['x'] }) }] });
    const a = claude.parse(raw, cols, parseDeadline);
    assert.deepStrictEqual(a.tags, ['a-b']);
    assert.strictEqual(a.suggestedCollectionId, 0);
    assert.strictEqual(a.suggestedNewName, null);
    assert.strictEqual(a.action, 'Apply');
    assert.strictEqual(a.contentType, 'opportunity');
    assert.strictEqual(a.confidence, 1);
    assert.strictEqual(a.deadline, null);
    assert.strictEqual(a.effortDays, 0);
    assert.throws(() => claude.parse(JSON.stringify({ stop_reason: 'refusal', content: [] }), cols, parseDeadline), /declined/);
  });

  await test('deadline parsing and URL normalization match Android', () => {
    assert.ok(parseDeadline('2026-12-01'));
    assert.strictEqual(parseDeadline('2026-12-01').hasTime, false);
    assert.strictEqual(new Date(parseDeadline('2026-12-01').at).getHours(), 23);
    assert.strictEqual(parseDeadline('2026-12-01T17:00').hasTime, true);
    assert.strictEqual(parseDeadline('2026-02-30'), null);
    assert.strictEqual(urlutil.normalize('https://youtu.be/abc123?si=XYZ'), urlutil.normalize('https://www.youtube.com/watch?v=abc123&feature=share'));
    assert.strictEqual(urlutil.normalize('http://www.Example.com/a/?utm_source=x&b=2&a=1#frag'), 'example.com/a?a=1&b=2');
    assert.strictEqual(urlutil.validate('github.com/n8n-io/n8n'), 'https://github.com/n8n-io/n8n');
    assert.strictEqual(urlutil.validate('javascript:alert(1)'), null);
    assert.strictEqual(urlutil.findUrl('see https://en.wikipedia.org/wiki/Foo_(bar)).'), 'https://en.wikipedia.org/wiki/Foo_(bar)');
  });

  await test('HTML extraction and private address blocking', () => {
    let para = '';
    for (let i = 0; i < 12; i++) para += '<p>Knowledge transfer depends on trust &amp; intermediaries. Sentence ' + i + '.</p>';
    const r = { title: '', description: '', siteName: '', ogType: '', author: '', published: '', image: '', text: '' };
    extractor.parseHtml('<html><head><title>KTT | J</title><meta name=author content="D. Modic"></head><body><nav>Menu</nav><article>' + para + '<aside>Ad</aside></article></body></html>', r, 'journal.org');
    assert.strictEqual(r.title, 'KTT | J');
    assert.strictEqual(r.author, 'D. Modic');
    assert.ok(r.text.includes('trust & intermediaries') && !r.text.includes('Menu') && !r.text.includes('Ad'));
    assert.ok(extractor.isPrivate('127.0.0.1') && extractor.isPrivate('192.168.1.5') && extractor.isPrivate('::1') && !extractor.isPrivate('8.8.8.8'));
  });

  srv.server.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
