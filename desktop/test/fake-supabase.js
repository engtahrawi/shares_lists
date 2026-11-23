'use strict';
// A minimal in-memory stand-in for the Supabase endpoints SaveMind uses, for tests:
// email/password auth, the push_items function (last write wins) and items pulled by seq.
const http = require('http');
const crypto = require('crypto');

function start(anonKey) {
  const users = new Map(); // email -> { id, password }
  const tokens = new Map(); // access token -> user id
  const refresh = new Map(); // refresh token -> user id
  const items = new Map(); // id -> row
  let seq = 0;

  function session(userId, email) {
    const access = crypto.randomUUID();
    const rt = crypto.randomUUID();
    tokens.set(access, userId);
    refresh.set(rt, userId);
    return { access_token: access, refresh_token: rt, expires_in: 3600, user: { id: userId, email } };
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.headers.apikey !== anonKey) return send(401, { message: 'No API key found in request' });
      const url = new URL(req.url, 'http://x');
      const json = body ? JSON.parse(body) : {};
      if (url.pathname === '/auth/v1/signup') {
        if (users.has(json.email)) return send(400, { msg: 'User already registered' });
        const id = crypto.randomUUID();
        users.set(json.email, { id, password: json.password });
        return send(200, session(id, json.email));
      }
      if (url.pathname === '/auth/v1/token') {
        if (url.searchParams.get('grant_type') === 'password') {
          const u = users.get(json.email);
          if (!u || u.password !== json.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
          return send(200, session(u.id, json.email));
        }
        const uid = refresh.get(json.refresh_token);
        if (!uid) return send(400, { error: 'invalid_grant' });
        return send(200, session(uid, null));
      }
      if (url.pathname === '/auth/v1/logout') return send(204, {});
      const bearer = (req.headers.authorization || '').replace('Bearer ', '');
      const userId = tokens.get(bearer);
      if (!userId) return send(401, { message: 'JWT expired' });
      if (url.pathname === '/rest/v1/rpc/push_items' && req.method === 'POST') {
        for (const it of json.items) {
          const cur = items.get(it.id);
          if (cur && cur.user_id !== userId) continue;
          if (cur && cur.updated_at > it.updated_at) continue;
          items.set(it.id, { id: it.id, user_id: userId, kind: it.kind, data: it.data, deleted: !!it.deleted, updated_at: it.updated_at, seq: ++seq });
        }
        return send(200, json.items.length);
      }
      if (url.pathname === '/rest/v1/items' && req.method === 'GET') {
        const gt = Number((url.searchParams.get('seq') || 'gt.0').slice(3));
        const limit = Number(url.searchParams.get('limit') || 1000);
        const rows = [...items.values()].filter((r) => r.user_id === userId && r.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, limit)
          .map(({ id, kind, data, deleted, updated_at, seq: s }) => ({ id, kind, data, deleted, updated_at, seq: s }));
        return send(200, rows);
      }
      return send(404, { message: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port, items })));
}

module.exports = { start };
