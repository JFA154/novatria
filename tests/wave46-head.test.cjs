'use strict';
/* Wave 46: the page head and distribution. The Literata font is inline (two
   base64 woff2 @font-face rules), so a page load asks no host but its own
   for anything; the CSP lists no Google host and has font-src data:; a web
   manifest and two PNG icons sit beside index.html for Add to Home Screen;
   and a BUILD constant (State.BUILD, Game.BUILD) is shown on the title
   screen's footer, in Settings under Advanced and at the head of Debug,
   with CHANGELOG.md's top entry naming the same wave. Mock mode.
   Run with: node tests/run.cjs wave46 */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, ROOT, GAME_PATH, PHONE } = require('./helpers.cjs');

const s = suite('wave46-head');
const BYTE_BUDGET = 3250000; // as tests/constraints.test.cjs

function cspOf(html) {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(m, 'a CSP meta');
  return Object.fromEntries(m[1].split(';').map(x => x.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

s.test('a mock game start and two turns ask no host but the page itself for anything (file:// and nothing else)', async h => {
  const requested = [];
  const page = await h.open({
    route: route => {
      const u = route.request().url();
      requested.push(u);
      return /^(file|blob|data):/.test(u) ? route.continue() : route.abort();
    }
  });
  page.on('request', r => { if (!requested.includes(r.url())) requested.push(r.url()); });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I look around');
  await sendText(page, '/rest');
  await page.evaluate(() => document.fonts.ready);
  const outside = requested.filter(u => !/^(blob|data):/.test(u) && !u.startsWith('file://' + ROOT + '/'));
  assert.deepEqual(outside, [], 'nothing but the page itself: ' + outside.join(' '));
  assert.ok(!requested.some(u => /google|gstatic/.test(u)), 'no Google host');
});

s.test('the CSP names no Google host, takes fonts from data: only, styles inline only, and the head has no stylesheet link', async () => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.equal(html.split('\n')[7].startsWith('<meta http-equiv="Content-Security-Policy"'), true, 'the CSP is still on line 8');
  const csp = cspOf(html);
  assert.doesNotMatch(JSON.stringify(csp), /google|gstatic/i);
  assert.deepEqual(csp['font-src'], ['data:']);
  assert.deepEqual(csp['style-src'], ["'unsafe-inline'"]);
  assert.deepEqual(csp['connect-src'], ['https://api.anthropic.com']);
  assert.deepEqual(csp['manifest-src'], ["'self'"]);
  assert.doesNotMatch(html, /rel="stylesheet"|fonts\.googleapis|fonts\.gstatic/);
  // The two faces, inline, under the old family name; Georgia still the fallback.
  const faces = [...html.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);
  assert.equal(faces.length, 2, 'two @font-face rules');
  for (const f of faces) {
    assert.match(f, /font-family: "Literata"/);
    assert.match(f, /src: url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\) format\("woff2"\)/);
  }
  assert.match(faces[0], /font-style: normal; font-weight: 400 600;/);
  assert.match(faces[1], /font-style: italic; font-weight: 400;/);
  assert.match(html, /--read-font: "Literata", Georgia,/);
  assert.match(html, /SIL Open Font License, Version 1\.1/);
  assert.match(html, /Copyright 2017 The Literata Project Authors/);
});

s.test('Literata is loaded once the fonts are ready (upright 400 and 600, italic 400), and the story is set in it', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I look around');
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(['16px Literata', '600 16px Literata', 'italic 16px Literata'].map(f => document.fonts.load(f)));
    const faces = [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Literata').map(f => `${f.style} ${f.weight} ${f.status}`);
    // A loaded face measures differently from Georgia's fallback.
    const c = document.createElement('canvas').getContext('2d');
    c.font = '20px Literata, monospace'; const lit = c.measureText('Lockett\'s Ferry, autumn').width;
    c.font = '20px monospace'; const mono = c.measureText('Lockett\'s Ferry, autumn').width;
    return { check: document.fonts.check('16px Literata'), bold: document.fonts.check('600 16px Literata'), italic: document.fonts.check('italic 16px Literata'), faces, lit, mono, feed: getComputedStyle(document.querySelector('#feed')).fontFamily };
  });
  assert.equal(r.check, true, 'document.fonts.check("16px Literata")');
  assert.equal(r.bold, true);
  assert.equal(r.italic, true);
  assert.deepEqual(r.faces.sort(), ['italic 400 loaded', 'normal 400 600 loaded']);
  assert.notEqual(Math.round(r.lit), Math.round(r.mono), 'the font is drawn, not the fallback');
});

s.test('the manifest link resolves to a file with the required fields, and its icons and the touch icon exist as PNGs of their size', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const href = /<link rel="manifest" href="([^"]+)">/.exec(html);
  assert.ok(href, 'a manifest link');
  const file = path.join(ROOT, href[1]);
  assert.ok(fs.existsSync(file), href[1]);
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(m.name, "Lockett's Ferry");
  assert.ok(m.short_name && m.short_name.length <= 15, 'a short_name for the home screen');
  assert.equal(m.start_url, './index.html');
  assert.equal(m.display, 'standalone');
  const themes = [...html.matchAll(/<meta name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: dark\)">/g)].map(x => x[1]);
  assert.deepEqual([m.background_color, m.theme_color], [themes[0], themes[0]], 'colours from the dark theme-color meta');
  assert.deepEqual(m.icons.map(i => i.sizes).sort(), ['192x192', '512x512']);
  const png = p => { const b = fs.readFileSync(path.join(ROOT, p)); assert.equal(b.slice(1, 4).toString(), 'PNG', p); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`; };
  for (const i of m.icons) {
    assert.equal(i.type, 'image/png');
    assert.equal(png(i.src), i.sizes, i.src);
  }
  const touch = /<link rel="apple-touch-icon" href="([^"]+)">/.exec(html);
  assert.ok(touch && fs.existsSync(path.join(ROOT, touch[1])), 'the apple-touch-icon exists');
  // From file:// the page loads with no console error or CSP complaint about the manifest.
  const noise = [];
  const page = await h.open();
  page.on('console', msg => { if (msg.type() === 'error' || /manifest|Content Security Policy/i.test(msg.text())) noise.push(msg.text()); });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.waitForTimeout(300);
  assert.deepEqual(noise.filter(t => /manifest|Content Security Policy/i.test(t)), [], 'no manifest or CSP console message');
});

s.test('the build line: Game.BUILD on the title footer, in Settings under Advanced and in Debug; CHANGELOG.md\'s top entry names the same wave; the file is inside its byte budget', async h => {
  const page = await h.open({ viewport: PHONE });
  const b = await page.evaluate(() => ({ build: Game.BUILD, frozen: Object.isFrozen(Game.BUILD), same: Game.BUILD === Game.State.BUILD, rules: Game.State.RULES_VERSION, title: document.getElementById('title-build').textContent, foot: !!document.querySelector('.title-foot #title-build') }));
  assert.equal(b.frozen, true);
  assert.equal(b.same, true);
  assert.ok(Number.isInteger(b.build.wave) && b.build.wave >= 46, 'wave ' + b.build.wave);
  assert.match(b.build.date, /^\d{4}-\d{2}-\d{2}$/);
  const line = `Build: wave ${b.build.wave} · rules v${b.rules}`;
  assert.equal(b.title, line, 'on the title footer');
  assert.ok(b.foot);
  assert.ok(await page.isVisible('#title-build'));
  // Settings, Advanced.
  await page.click('#btn-settings');
  await page.click('#set-advanced > summary');
  assert.ok((await page.textContent('#set-build')).startsWith(line), 'in Settings under Advanced');
  assert.ok(await page.isVisible('#set-build'));
  await page.click('#settings-done');
  // Debug's head.
  await quickStart(page);
  await page.evaluate(() => Game.UI.toggleDebug(true));
  await page.evaluate(() => Game.UI.openPanel && Game.UI.openPanel('debug'));
  assert.equal(await page.evaluate(() => { const d = document.querySelector('.dbg'); return d && d.firstElementChild.id === 'dbg-build' ? d.firstElementChild.textContent : null; }), line, 'first in Debug');
  // CHANGELOG.md: the newest entry is this build's wave, and every wave from 1 is there, newest first.
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const waves = [...log.matchAll(/^## Wave (\d+) · (\d{4}-\d{2}-\d{2})$/gm)].map(m => +m[1]);
  assert.equal(waves[0], b.build.wave, 'the top entry names Game.BUILD.wave');
  assert.equal(log.match(/^## Wave (\d+) · (\d{4}-\d{2}-\d{2})$/m)[2], b.build.date, 'and its date');
  assert.deepEqual(waves, Array.from({ length: b.build.wave }, (_, i) => b.build.wave - i), 'one entry per wave, newest first');
  assert.ok(log.split('\n').length < 300, 'under 300 lines');
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.match(html, /const BUILD = Object\.freeze\(\{ wave: \d+, date: '\d{4}-\d{2}-\d{2}' \}\);/, 'the bump is one line');
  const bytes = fs.statSync(GAME_PATH).size;
  assert.ok(bytes <= BYTE_BUDGET, `index.html is ${bytes} bytes, over ${BYTE_BUDGET}`);
});

s.run();
