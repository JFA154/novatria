#!/usr/bin/env node
'use strict';
/* Bones on a phone (index.html, manifest.webmanifest, sw.js, icons/): the page
   served over http from localhost (a secure context, as https is) by a tiny
   static server on this checkout, at the root and under a sub-path
   (/novatria/, as a project site is). The manifest parses and its icons load
   at their sizes; the worker registers and takes control; after one visit the
   page reloads and plays a whole night with the network cut and the server
   gone; the other three games always come from the network, never from the
   worker; requests to another origin and to the Anthropic API pass the worker
   by; from file:// and in a sandboxed frame nothing is registered, nothing is
   logged and there is no install row; the install row itself (the browser's
   prompt, the iOS hint, nothing once installed); the Vibration switch.
   Usage: node tests/bones-pwa.test.cjs   (or node tests/run.cjs bones-pwa) */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OTHERS = ['lockin.html', 'lastcall.html', 'town.html'];
const OWN = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const PHONE = { width: 390, height: 780 };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };

/* A static server on this checkout, at / and at /novatria/. extra: { '/path': [type, body] } for test pages.
   hits: every path asked for, in order. */
function serve(extra) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    hits.push(u.pathname);
    if (extra && extra[u.pathname]) { res.writeHead(200, { 'content-type': extra[u.pathname][0], 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); return res.end(extra[u.pathname][1]); }
    let rel = decodeURIComponent(u.pathname).replace(/^\/novatria\//, '/');
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    resolve({ hits, port, origin: `http://127.0.0.1:${port}`, close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(() => r()); }) });
  }));
}
const pngSize = buf => (buf.slice(0, 8).toString('hex') === '89504e470d0a1a0a' ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null);

// ----- a tiny runner (PASS/FAIL lines and a RESULT line, as the other suites) -----
const tests = [];
const test = (title, fn) => tests.push({ title, fn });
let browser;
/* A fresh context and page; every console error or warning, page error and CSP violation is collected in page.problems. */
async function open(t, url, opts) {
  const o = opts || {};
  const ctx = await browser.newContext(Object.assign({ viewport: PHONE, reducedMotion: 'reduce', serviceWorkers: 'allow' }, o.context || {}));
  t.contexts.push(ctx);
  if (o.init) await ctx.addInitScript(o.init);
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.effectiveDirective + ' ' + e.blockedURI)); });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') page.problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => page.problems.push('pageerror: ' + e.message));
  if (url) { await page.goto(url); await page.waitForFunction(() => window.Game && window.Game.App); }
  return page;
}
const controlled = page => page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 });
async function problems(page) {
  const csp = await page.evaluate(() => window.__csp || []).catch(() => []);
  return page.problems.concat(csp.map(c => 'csp: ' + c));
}
/* One step of a night through the page's own buttons, playing as Engine.basicPolicy would (as tests/bones.test.cjs). */
const STEP = async () => {
  const A = Game.App, E = Game.Engine, q = sel => document.querySelector(sel);
  await A.idle();
  const S = A.state;
  if (!S) return 'none';
  if (Game.UI.after) { q('#btn-endtable').click(); await A.idle(); return 'end'; }
  if (S.phase === 'over') return 'over';
  const v = E.view(S), L = E.legal(S);
  const must = sel => { const b = q(sel); if (!b || b.disabled || b.offsetParent === null) throw new Error('no button ' + sel + ' at ' + S.phase + '/' + L.need); b.click(); };
  if (S.phase === 'choose') { const rich = v.options.find(c => c.kind === 'rich' && c.affordable && S.cash >= c.buyIn * 2); must(`.tcard button.sit[data-i="${rich ? rich.i : L.sit[0]}"]`); }
  else if (S.phase === 'shop') must('#btn-leave');
  else if (L.need === 'next') must('#btn-next');
  else if (L.need === 'ready') must('#btn-go');
  else if (L.need === 'side') { const a = E.basicPolicy(S, v, L, E); must(a.pick ? '#btn-side-' + a.pick : '#btn-side-pass'); }
  else if (L.need === 'turn') {
    const a = E.basicPolicy(S, v, L, E);
    if (a.t === 'liar') must('#btn-liar');
    else if (a.t === 'spot') must('#btn-spot');
    else {
      must(`.facebtn[data-f="${a.f}"]`);
      for (let g = 0; g < 40 && +q('#q-val').textContent !== a.q; g++) must(+q('#q-val').textContent < a.q ? '#q-plus' : '#q-minus');
      must('#btn-bid');
    }
  }
  await A.idle();
  return Game.UI.after ? 'after' : A.state ? A.state.phase : 'none';
};
// No first-table coach and no practice-hand nudges in the way: a returning player's settings.
const RETURNING = () => { try { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, speed: 1, tipsDone: true, played: true, lesson: 'skipped' })); } catch (e) { /* none */ } };

// ===================================================================== the manifest and icons
test('the manifest parses, says what it should with relative URLs, and its icons load at their sizes', async t => {
  const srv = t.server = await serve();
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Bones');
  assert.ok(m.short_name && m.short_name.length <= 12);
  assert.ok(typeof m.description === 'string' && m.description.length > 10);
  for (const k of ['start_url', 'scope', 'id']) assert.ok(!/^(\/|[a-z]+:)/i.test(m[k]), `${k} is relative: ${m[k]}`);
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.equal(m.background_color, '#0c0f13');
  assert.equal(m.theme_color, '#0c0f13');
  const want = [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']];
  assert.deepEqual(m.icons.map(i => [i.sizes, i.purpose]), want);
  for (const icon of m.icons.concat([{ src: 'icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }])) {
    assert.equal(icon.type, 'image/png');
    const res = await fetch(new URL(icon.src, srv.origin + '/novatria/manifest.webmanifest'));
    assert.equal(res.status, 200, icon.src);
    const size = pngSize(Buffer.from(await res.arrayBuffer()));
    assert.ok(size, icon.src + ' is a PNG');
    assert.equal(`${size.w}x${size.h}`, icon.sizes, icon.src);
  }
  // Chrome's own reading of it, from the page's <link rel="manifest">.
  const page = await open(t, srv.origin + '/index.html');
  const cdp = await page.context().newCDPSession(page);
  const got = await cdp.send('Page.getAppManifest');
  assert.equal(got.url, srv.origin + '/manifest.webmanifest');
  assert.deepEqual(got.errors, []);
  assert.equal(JSON.parse(got.data).name, 'Bones');
  await controlled(page);
  assert.deepEqual(await problems(page), []);
});

// ===================================================================== the worker
test('the worker registers, takes control and keeps exactly Bones’ own files; no errors, no CSP violations', async t => {
  const srv = t.server = await serve();
  const page = await open(t, srv.origin + '/index.html');
  await controlled(page);
  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    const urls = [];
    for (const k of keys) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return { scope: reg.scope, script: reg.active.scriptURL, keys, urls: urls.sort() };
  });
  assert.equal(info.scope, srv.origin + '/');
  assert.equal(info.script, srv.origin + '/sw.js');
  assert.equal(info.keys.length, 1);
  assert.match(info.keys[0], /^bones-v\d+ /);
  assert.deepEqual(info.urls, OWN.map(f => srv.origin + '/' + f).sort());
  assert.deepEqual(await problems(page), []);
});

test('after one visit the page reloads with the network cut and the server gone, and a whole night plays', async t => {
  const srv = t.server = await serve();
  const page = await open(t, srv.origin + '/index.html', { init: RETURNING });
  await controlled(page);
  await srv.close(); t.server = null;
  await page.context().setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.equal(await page.evaluate(() => document.title), 'Bones');
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  assert.equal(await page.isVisible('#btn-install'), false);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-sit');
  let ph = '';
  for (let i = 0; i < 4000 && ph !== 'over'; i++) ph = await page.evaluate(STEP);
  assert.equal(ph, 'over', 'the night ends');
  assert.ok(await page.isVisible('#btn-again'), 'the end screen');
  // The start URL (the folder) opens offline too.
  await page.goto(srv.origin + '/');
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.deepEqual(await problems(page), []);
});

test('a new page arrives as soon as the player is online (network first), and the cache follows it', async t => {
  const marker = '<!-- a newer Bones -->';
  const srv = t.server = await serve();
  const page = await open(t, srv.origin + '/index.html');
  await controlled(page);
  await srv.close();
  // The same port, a newer index.html.
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace('</body>', marker + '\n</body>');
  const port = srv.port;
  const s2 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/index.html' || u.pathname === '/') { res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-cache' }); return res.end(html); }
    const file = path.join(ROOT, u.pathname);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
  });
  await new Promise(r => s2.listen(port, '127.0.0.1', r));
  t.server = { close: () => new Promise(r => { s2.closeAllConnections(); s2.close(() => r()); }) };
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  const resp = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).match('index.html')).text());
  assert.ok(resp.includes(marker), 'the cache holds the newer page');
  assert.ok((await page.content()).includes(marker), 'the page shown is the newer one');
  assert.deepEqual(await problems(page), []);
});

test('the other three games come from the network every time, never from the worker, and are never kept', async t => {
  const srv = t.server = await serve();
  const page = await open(t, srv.origin + '/index.html');
  await controlled(page);
  for (const g of OTHERS) {
    for (let n = 0; n < 2; n++) {
      const before = srv.hits.filter(h => h === '/' + g).length;
      const resp = await page.goto(srv.origin + '/' + g, { waitUntil: 'domcontentloaded' });
      assert.equal(resp.status(), 200, g);
      assert.equal(resp.fromServiceWorker(), false, g + ' not answered by the worker');
      assert.equal(srv.hits.filter(h => h === '/' + g).length, before + 1, g + ' asked of the server');
    }
  }
  // Back on Bones, still controlled; nothing of theirs in any cache.
  await page.goto(srv.origin + '/index.html');
  await controlled(page);
  const urls = await page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(r.url); return out; });
  for (const g of OTHERS) assert.ok(!urls.some(u => u.endsWith('/' + g)), g + ' is not cached');
  // Offline, they are simply unavailable (the worker does not stand in for them).
  await page.context().setOffline(true);
  for (const g of OTHERS) await assert.rejects(page.goto(srv.origin + '/' + g), g + ' offline is a network error');
});

test('requests to another origin and to the Anthropic API pass the worker by; Bones’ own files do not', async t => {
  const other = await serve({ '/ping': ['text/plain', 'pong'] });
  // A probe page in the worker's scope, with no CSP of its own, so it can ask another origin at all.
  const srv = t.server = await serve({ '/probe.html': [TYPES['.html'], '<!doctype html><title>probe</title><script>window.Game = { App: {} };</script>'] });
  t.extra = other;
  const page = await open(t, srv.origin + '/index.html');
  await controlled(page);
  let apiSeen = 0;
  await page.route('https://api.anthropic.com/**', route => { apiSeen++; return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }); });
  await page.goto(srv.origin + '/probe.html');
  await controlled(page);
  const seen = [];
  page.on('response', r => seen.push([r.url(), r.fromServiceWorker()]));
  const out = await page.evaluate(async ([o2]) => {
    const a = await (await fetch(o2 + '/ping')).text();
    const b = await (await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).text();
    const c = (await fetch('https://api.anthropic.com/v1/models')).status;
    const d = (await fetch('manifest.webmanifest')).status;
    return [a, b, c, d];
  }, [other.origin]);
  assert.deepEqual(out, ['pong', '{"ok":true}', 200, 200]);
  const by = u => seen.filter(s => s[0] === u).map(s => s[1]);
  assert.deepEqual(by(other.origin + '/ping'), [false], 'another origin: not from the worker');
  assert.deepEqual(by('https://api.anthropic.com/v1/messages'), [false], 'the API (POST): not from the worker');
  assert.deepEqual(by('https://api.anthropic.com/v1/models'), [false], 'the API (GET): not from the worker');
  assert.deepEqual(by(srv.origin + '/manifest.webmanifest'), [true], 'Bones’ own manifest: from the worker (the control)');
  assert.equal(apiSeen, 2, 'both API requests reached the network layer');
  assert.ok(other.hits.includes('/ping'), 'the other origin was asked');
});

// ===================================================================== where it must stay quiet
test('from file:// nothing is registered, nothing is logged, and there is no install row', async t => {
  const page = await open(t, 'file://' + path.join(ROOT, 'index.html'), { init: () => { window.__regs = 0; try { const r = ServiceWorkerContainer.prototype.register; ServiceWorkerContainer.prototype.register = function () { window.__regs++; return r.apply(this, arguments); }; } catch (e) { /* none on file:// */ } } });
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__regs), 0);
  assert.equal(await page.$('#home-install'), null, 'no install row at all');
  // A beforeinstallprompt here (it never comes on file://) changes nothing.
  await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  assert.equal(await page.$('#home-install'), null);
  assert.deepEqual(await problems(page), []);
});

test('in a sandboxed frame, and in a same-origin frame, nothing is registered or logged and there is no install row', async t => {
  const srv = t.server = await serve({
    '/frame-sandboxed.html': [TYPES['.html'], '<!doctype html><title>host</title><iframe sandbox="allow-scripts" src="/index.html" style="width:390px;height:700px"></iframe>'],
    '/frame-same.html': [TYPES['.html'], '<!doctype html><title>host</title><iframe sandbox="allow-scripts allow-same-origin" src="/index.html" style="width:390px;height:700px"></iframe>']
  });
  for (const host of ['/frame-sandboxed.html', '/frame-same.html']) {
    const page = await open(t, null);
    await page.goto(srv.origin + host);
    const frame = page.frames().find(f => f !== page.mainFrame());
    await frame.waitForFunction(() => window.Game && window.Game.App);
    await page.waitForTimeout(800);
    assert.equal(await frame.$('#home-install'), null, host + ': no install row');
    assert.equal(srv.hits.filter(h => h === '/sw.js').length, 0, host + ': the worker script was never asked for');
    // Chrome's own note on the host's frame tag (allow-scripts with allow-same-origin) is the host's, not the game's.
    assert.deepEqual(page.problems.filter(p => !/An iframe which has both allow-scripts and allow-same-origin/.test(p)), [], host);
  }
});

// ===================================================================== the install row
test('the install row: the browser’s prompt as a button, nothing before it or after it is used, nothing once installed', async t => {
  const srv = t.server = await serve();
  for (const theme of ['dark', 'parchment']) {
    const page = await open(t, srv.origin + '/index.html', { init: new Function(`try { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, theme: '${theme}' })); } catch (e) {}`) });
    await controlled(page);
    const row = await page.$('#home-install');
    assert.ok(row, 'the row is in the page');
    assert.equal(await row.isVisible(), false, 'hidden until the browser offers to install');
    // Hidden, it takes no room: the line below it sits exactly where it would with no row at all.
    const shift = await page.evaluate(() => { const o = document.querySelector('.others'), r = document.querySelector('#home-install'); const a = o.getBoundingClientRect().top; const next = r.nextSibling, parent = r.parentNode; r.remove(); const b = o.getBoundingClientRect().top; parent.insertBefore(r, next); return a - b; });
    assert.equal(shift, 0);
    // As Chrome does on Android once the page is installable.
    await page.evaluate(() => {
      window.__prompted = 0;
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted++; return Promise.resolve(); };
      e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.__bip = e; window.dispatchEvent(e);
    });
    assert.equal(await page.evaluate(() => window.__bip.defaultPrevented), true, 'the mini-infobar is held back for the button');
    const btn = await page.waitForSelector('#btn-install', { state: 'visible' });
    assert.equal(await btn.textContent(), 'Add Bones to your home screen');
    const box = await btn.boundingBox();
    assert.ok(box.height >= 44, 'a 44px tap target: ' + box.height);
    const style = await page.evaluate(() => { const b = document.querySelector('#btn-install'); const cs = getComputedStyle(b); return { color: cs.color, bg: getComputedStyle(document.body).backgroundColor, theme: document.documentElement.dataset.theme }; });
    assert.equal(style.theme, theme);
    assert.notEqual(style.color, style.bg);
    // It survives the home screen being drawn again (a settings change re-renders it).
    await page.click('#home-settings .seg button:not([aria-pressed="true"])');
    await page.waitForSelector('#btn-install', { state: 'visible' });
    await page.click('#btn-install');
    await page.waitForFunction(() => window.__prompted === 1);
    await page.waitForSelector('#home-install', { state: 'hidden' });
    // Installed: gone for good, and the row took no space while hidden.
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    assert.equal(await page.isVisible('#home-install'), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#home-install')).display), 'none');
    assert.deepEqual(await problems(page), []);
  }
});

test('the install row on iOS Safari: a one-line hint (Share, then Add to Home Screen); none when already on the home screen', async t => {
  const srv = t.server = await serve();
  const ios = { userAgent: IPHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const page = await open(t, srv.origin + '/index.html', { context: ios });
  const hint = await page.waitForSelector('#install-hint', { state: 'visible' });
  const text = await hint.textContent();
  assert.match(text, /Share/);
  assert.match(text, /Add to Home Screen/);
  assert.equal(await page.$('#btn-install'), null);
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 740 });
    assert.equal(await hint.evaluate(n => n.getClientRects().length), 1, 'one line at ' + width + 'px');
  }
  assert.deepEqual(await problems(page), []);
  // Opened from the home screen (navigator.standalone): nothing.
  const inApp = await open(t, srv.origin + '/index.html', { context: ios, init: () => { Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }); } });
  await inApp.waitForTimeout(300);
  assert.equal(await inApp.isVisible('#home-install'), false);
  // Chrome on iOS is not Safari: no hint (its own menu differs).
  const crios = await open(t, srv.origin + '/index.html', { context: Object.assign({}, ios, { userAgent: IPHONE_UA.replace('Version/18.1', 'CriOS/131.0.0.0') }) });
  await crios.waitForTimeout(300);
  assert.equal(await crios.isVisible('#home-install'), false);
  // A desktop browser that never offers to install: nothing.
  const desk = await open(t, srv.origin + '/index.html');
  await controlled(desk);
  assert.equal(await desk.isVisible('#home-install'), false);
});

test('installed (display-mode standalone): no install row even when the browser fires its event', async t => {
  const srv = t.server = await serve();
  // Chromium here cannot be launched as an installed app, so the one query the page asks is answered as an installed app's would be.
  const page = await open(t, null, { init: () => { const mm = window.matchMedia.bind(window); window.matchMedia = q => (/display-mode:\s*standalone/.test(q) ? mm('all') : mm(q)); } });
  await page.goto(srv.origin + '/index.html');
  await page.waitForFunction(() => window.Game && window.Game.App);
  assert.equal(await page.evaluate(() => matchMedia('(display-mode: standalone)').matches), true);
  await page.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' }); window.dispatchEvent(e); });
  await page.waitForTimeout(200);
  assert.equal(await page.isVisible('#home-install'), false);
  // Standalone polish: the page fills the screen and keeps the safe-area tokens.
  const fill = await page.evaluate(() => ({ app: document.getElementById('app').getBoundingClientRect().height, vh: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.equal(Math.round(fill.app), fill.vh);
  assert.ok(fill.sw <= fill.cw);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const s of ['--sat: env(safe-area-inset-top, 0px);', '--sab: env(safe-area-inset-bottom, 0px);', '#app { height: 100%; height: 100dvh; }', 'viewport-fit=cover']) assert.ok(html.includes(s), s);
  assert.deepEqual(await problems(page), []);
});

// ===================================================================== a sub-path
test('served from a sub-path (/novatria/): worker scope, manifest, icons and the offline reload all resolve there', async t => {
  const srv = t.server = await serve();
  const page = await open(t, srv.origin + '/novatria/', { init: RETURNING });
  await controlled(page);
  const info = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const urls = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return { scope: reg.scope, keys: await caches.keys(), urls: urls.sort(), manifest: document.querySelector('link[rel="manifest"]').href, apple: document.querySelector('link[rel="apple-touch-icon"]').href };
  });
  assert.equal(info.scope, srv.origin + '/novatria/');
  assert.deepEqual(info.urls, OWN.map(f => srv.origin + '/novatria/' + f).sort());
  assert.ok(info.keys.every(k => k.endsWith(' ' + srv.origin + '/novatria/')));
  assert.equal(info.manifest, srv.origin + '/novatria/manifest.webmanifest');
  assert.equal(info.apple, srv.origin + '/novatria/icons/apple-touch-icon.png');
  const cdp = await page.context().newCDPSession(page);
  const m = await cdp.send('Page.getAppManifest');
  assert.deepEqual(m.errors, []);
  const parsed = JSON.parse(m.data);
  assert.equal(new URL(parsed.start_url, m.url).href, srv.origin + '/novatria/');
  assert.equal(new URL(parsed.scope, m.url).href, srv.origin + '/novatria/');
  for (const i of parsed.icons) assert.ok(srv.hits.includes(new URL(new URL(i.src, m.url).href).pathname), i.src + ' fetched under /novatria/');
  assert.ok(!srv.hits.some(h => /^\/(sw\.js|manifest\.webmanifest|icons\/)/.test(h)), 'nothing asked for at the root');
  // Offline at the start URL and at index.html.
  await srv.close(); t.server = null;
  await page.context().setOffline(true);
  for (const u of ['/novatria/', '/novatria/index.html', '/novatria/index.html?from=home']) {
    await page.goto(srv.origin + u);
    await page.waitForFunction(() => window.Game && window.Game.App);
    assert.ok(await page.isVisible('#btn-sit') || await page.isVisible('#btn-daily'), u + ' plays');
  }
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-sit');
  assert.notEqual(await page.evaluate(STEP), 'none');
  assert.deepEqual(await problems(page), []);
});

// ===================================================================== vibration
test('vibration: its own switch where the phone can vibrate; off by default with reduced motion, on without; it buzzes in play', async t => {
  const srv = t.server = await serve();
  const record = () => { window.__buzz = []; Navigator.prototype.vibrate = function (p) { window.__buzz.push(p); return true; }; };
  const play = async page => {
    await page.evaluate(() => { Game.App.speed = 0.01; Game.App.start({ tips: false, seed: 'buzz' }); });
    for (let i = 0; i < 60 && !(await page.evaluate(() => window.__buzz.length)); i++) await page.evaluate(STEP);
    return page.evaluate(() => window.__buzz.length);
  };
  // Reduced motion, never chosen: Off, and silent in play.
  const calm = await open(t, srv.origin + '/index.html', { init: record });
  assert.equal(await calm.getAttribute('#l-vibrate', 'id'), 'l-vibrate');
  assert.equal(await calm.getAttribute('[aria-labelledby="l-vibrate"] button[aria-pressed="true"]', 'aria-pressed') && await calm.textContent('[aria-labelledby="l-vibrate"] button[aria-pressed="true"]'), 'Off');
  assert.equal(await play(calm), 0, 'no vibration under reduced motion');
  // Turned on there: it buzzes, and the choice is remembered.
  await calm.evaluate(() => Game.App.home());
  await calm.click('[aria-labelledby="l-vibrate"] button:text-is("On")');
  assert.equal(await calm.evaluate(() => localStorage.getItem('novatria.bones.vibrate')), 'on');
  assert.ok(await play(calm) > 0, 'it buzzes once switched on');
  // No reduced motion: On by default; Off silences it, with the sound left on.
  const lively = await open(t, srv.origin + '/index.html', { init: record, context: { reducedMotion: 'no-preference' } });
  assert.equal(await lively.textContent('[aria-labelledby="l-vibrate"] button[aria-pressed="true"]'), 'On');
  assert.ok(await play(lively) > 0);
  await lively.evaluate(() => Game.App.home());
  await lively.click('[aria-labelledby="l-vibrate"] button:text-is("Off")');
  await lively.evaluate(() => { window.__buzz = []; });
  assert.equal(await lively.textContent('[aria-labelledby="l-sound"] button[aria-pressed="true"]'), 'On');
  await lively.evaluate(() => { Game.App.speed = 0.01; Game.App.start({ tips: false, seed: 'buzz' }); });
  for (let i = 0; i < 40; i++) await lively.evaluate(STEP);
  assert.equal(await lively.evaluate(() => window.__buzz.length), 0, 'switched off: no vibration');
  // Where there is no vibration at all (iOS), no switch.
  const none = await open(t, srv.origin + '/index.html', { init: () => { delete Navigator.prototype.vibrate; } });
  assert.equal(await none.$('#l-vibrate'), null);
  for (const p of [calm, lively, none]) assert.deepEqual(await problems(p), []);
});

(async () => {
  const only = process.env.TEST_FILTER ? new RegExp(process.env.TEST_FILTER, 'i') : null;
  browser = await chromium.launch();
  let passed = 0, failed = 0;
  console.log('bones-pwa');
  for (const tt of tests) {
    if (only && !only.test(tt.title)) continue;
    const t = { contexts: [], server: null, extra: null };
    const t0 = Date.now();
    try { await tt.fn(t); passed++; console.log(`  PASS  ${tt.title} (${Date.now() - t0} ms)`); }
    catch (err) { failed++; console.log(`  FAIL  ${tt.title}\n        ${String((err && err.stack) || err).split('\n').slice(0, 8).join('\n        ')}`); }
    finally {
      for (const c of t.contexts) await c.close().catch(() => {});
      if (t.server) await t.server.close().catch(() => {});
      if (t.extra) await t.extra.close().catch(() => {});
    }
  }
  await browser.close();
  console.log(`RESULT bones-pwa: passed=${passed} failed=${failed}`);
  process.exit(failed ? 1 : 0);
})();
