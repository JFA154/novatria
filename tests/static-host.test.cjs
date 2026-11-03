'use strict';
/* Wave 36: README promises the game runs from "any static host", but every
   other suite loads it from file://. Here a tiny Node http server serves the
   repo folder on an ephemeral port (content types as a static host sends
   them, nothing else), and the game is opened over http://: a mock-mode game
   starts the way other tests start one and plays two turns with no page
   error and no Content-Security-Policy violation (index.html line 8 still
   allows what the page itself needs over http), the autosave lands in
   localStorage, the IndexedDB undo store opens and holds the turns, and
   /undo takes one back. The server closes when the suite ends.
   Mock mode. Run with: node tests/run.cjs static-host */
const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, ROOT, LAPTOP } = require('./helpers.cjs');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const served = [];

/* A static host: GET and HEAD of files under ROOT, "/" is index.html, 404 for anything else. */
function startServer() {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    served.push(rel);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !file.startsWith(ROOT + path.sep) || rel.split('/').some(p => p.startsWith('.') && p.length > 0)) { res.writeHead(404); res.end(); return; }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); });
}

const s = suite('static-host');
let server = null;
let base = '';

/* The game over http://: only this server, blob: and data: load (the font host and everything else is blocked, as in the other suites). */
async function openHttp(h) {
  const requested = [];
  const page = await h.open({
    viewport: LAPTOP,
    url: base + '/index.html',
    route: route => {
      const u = route.request().url();
      requested.push(u);
      return u.startsWith(base + '/') || /^(blob|data):/.test(u) ? route.continue() : route.abort();
    }
  });
  return { page, requested };
}

s.test('the server serves index.html as text/html, and nothing outside the folder or under a dot folder', async () => {
  const get = p => new Promise((resolve, reject) => http.get(base + p, r => { r.resume(); r.on('end', () => resolve({ status: r.statusCode, type: r.headers['content-type'] })); }).on('error', reject));
  assert.deepEqual(await get('/'), { status: 200, type: 'text/html; charset=utf-8' });
  assert.deepEqual(await get('/index.html'), { status: 200, type: 'text/html; charset=utf-8' });
  assert.equal((await get('/../../etc/passwd')).status, 404);
  assert.equal((await get('/.git/HEAD')).status, 404);
  assert.equal((await get('/no-such-file.html')).status, 404);
});

s.test('over http:// a mock game plays two turns: no page error, no CSP violation, the autosave in localStorage, the undo stack in IndexedDB, and /undo takes a turn back', async h => {
  const { page, requested } = await openHttp(h);
  assert.ok(page.url().startsWith(base + '/'), 'served over http: ' + page.url());
  // Listen from the first script on: reload with a violation recorder in place, and the console watched.
  const consoleCsp = [];
  page.on('console', m => { if (/Content Security Policy|Refused to (load|execute|apply|connect|run|evaluate|frame)/i.test(m.text())) consoleCsp.push(m.text()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => { window.__csp.push(`${e.violatedDirective} ${e.blockedURI} line ${e.lineNumber}`); });
  });
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'));
  assert.match(csp, /default-src 'none'/, 'the CSP is still the strict one');
  assert.equal(await page.evaluate(() => window.location.protocol), 'http:');

  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I look around');
  await sendText(page, '/rest');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), 2, 'two turns played over http');

  // localStorage: the autosave after the turns, the same game at turn 2.
  const auto = await page.evaluate(() => {
    const raw = window.localStorage.getItem(Game.Storage.KEYS.autosave);
    const env = Game.Storage.loadAutosave();
    return { raw: typeof raw === 'string' && raw.length > 0, has: Game.Storage.hasAutosave(), turn: env && env.state.meta.turn, same: !!env && Game.Storage.gameId(env.state) === Game.Storage.gameId(Game.state) };
  });
  assert.deepEqual(auto, { raw: true, has: true, turn: 2, same: true }, 'autosave in localStorage');

  // IndexedDB: the undo store opens over http and holds the stack once written.
  await page.waitForTimeout(350);
  await page.evaluate(() => Game.Storage.undoIdle());
  const kept = await page.evaluate(() => Game.Storage.undoKept().then(r => (r ? { game: r.game, turns: r.entries.map(e => e.turn) } : null)));
  assert.ok(kept && kept.turns.length >= 1, 'the undo stack is kept in IndexedDB: ' + JSON.stringify(kept));
  assert.equal(kept.game, await page.evaluate(() => Game.Storage.gameId(Game.state)));
  const stores = await page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open(Game.Storage.UNDO_DB);
    req.onsuccess = () => { const names = [...req.result.objectStoreNames]; req.result.close(); resolve(names); };
    req.onerror = () => resolve(null);
  }));
  assert.ok(stores && stores.includes(await page.evaluate(() => Game.Storage.UNDO_STORE)), 'the undo store exists: ' + JSON.stringify(stores));

  // /undo works over http.
  const d0 = await page.evaluate(() => Game.State.undoDepth());
  assert.ok(d0 >= 1, 'something to take back');
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), 1, '/undo took the last turn back');
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), d0 - 1);

  assert.deepEqual(await page.evaluate(() => window.__csp), [], 'no securitypolicyviolation events');
  assert.deepEqual(consoleCsp, [], 'no CSP violation in the console');
  assert.ok(served.includes('/index.html'), 'the page came from the server');
  const local = requested.filter(u => u.startsWith(base + '/')).map(u => new URL(u).pathname);
  assert.deepEqual([...new Set(local)], ['/index.html'], 'the page asks its host for nothing but itself');
});

(async () => {
  server = await startServer();
  base = `http://127.0.0.1:${server.address().port}`;
  try { await s.run(); } finally { await new Promise(resolve => server.close(() => resolve())); }
})().catch(e => { console.error(e); process.exit(1); });
