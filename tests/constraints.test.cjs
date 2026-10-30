'use strict';
/* docs/BUILD_PLAN.md "Deliverable and hard constraints": one self-contained
   index.html with inline CSS and plain scripts, nothing external but the one
   Google Fonts stylesheet, no module syntax, no globals but Game, and it runs
   from file:// with every other request blocked. The only network call in the
   code is the Claude API endpoint. The file is built from src/ and content/
   (build.cjs) and must be exactly what they build.
   Run with: node tests/run.cjs constraints */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert/strict');
const { suite, quickStart, sendText, ROOT, GAME_PATH, GAME_URL } = require('./helpers.cjs');

const s = suite('constraints');
const FONT = /^https:\/\/fonts\.googleapis\.com\/css2\?family=Literata/;

s.test('index.html is one self-contained file: inline CSS and classic scripts, one font link, no modules', async () => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  assert.equal(links.length, 1, 'one <link>: ' + links.join(' '));
  assert.match(links[0], /rel="stylesheet"/);
  assert.match(links[0].match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&'), FONT, 'and it is the Literata font');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => m[1].trim());
  assert.ok(scripts.length >= 1);
  assert.deepEqual(scripts.filter(a => a !== ''), [], 'no src, type="module" or other attributes on <script>');
  for (const tag of ['iframe', 'img', 'video', 'audio', 'object', 'embed', 'base']) assert.ok(!new RegExp(`<${tag}\\b`, 'i').test(html), 'no <' + tag + '>');
  const code = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  assert.doesNotMatch(code, /^\s*(import|export)\s/m, 'no import/export statements');
  assert.doesNotMatch(code, /\bimport\s*\(/, 'no dynamic import()');
  assert.doesNotMatch(code, /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new Worker)\b/, 'no other way out');
  const fetches = [...code.matchAll(/\bfetch\s*\(([^,)]*)/g)].map(m => m[1].trim());
  assert.deepEqual(fetches, ['ENDPOINT'], 'one fetch, to the API endpoint');
  assert.match(code, /const ENDPOINT = 'https:\/\/api\.anthropic\.com\/v1\/messages';/);
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?(https?:|\/\/)/i, 'no external CSS resources');
  assert.match(code, /'use strict'/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'no package.json');
});

/* Direction change 17: index.html is built from src/ and content/town.js by
   build.cjs and committed. The committed file must be exactly what the parts
   build, so a hand edit to index.html, or an edit to a part without a
   rebuild, fails here. */
s.test('index.html is the build of src/ and content/: node build.cjs --check passes, and catches a hand edit', async () => {
  const BUILD = path.join(ROOT, 'build.cjs');
  const ok = spawnSync(process.execPath, [BUILD, '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const { BANNER } = require(BUILD);
  assert.ok(html.includes('<script>\n' + BANNER + '\n(function () {'), 'the banner opens the page script');
  assert.equal(html.split(BANNER).length, 2, 'one banner');
  // A copy edited by hand (one character in the engine) is not the build.
  const at = html.indexOf("const ENDPOINT = '");
  assert.ok(at > 0);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-build-')), 'index.html');
  fs.writeFileSync(tmp, html.slice(0, at) + 'const  ' + html.slice(at + 'const '.length));
  const bad = spawnSync(process.execPath, [BUILD, '--check', tmp], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /is not what src\/ and content\/ build \(first difference at line \d+\): run node build\.cjs/);
});

s.test('it runs from file:// with the network blocked: only the font is ever requested, and a turn plays', async h => {
  const requested = [];
  const page = await h.open({
    route: route => {
      const u = route.request().url();
      requested.push(u);
      return /^(file|blob|data):/.test(u) ? route.continue() : route.abort();
    }
  });
  assert.ok(page.url().startsWith('file://'));
  assert.equal(GAME_URL, 'file://' + GAME_PATH);
  await quickStart(page);
  await sendText(page, 'I look around');
  await sendText(page, '/rest');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), 2, 'turns play offline in mock mode');
  const outside = requested.filter(u => !/^(file|blob|data):/.test(u));
  assert.ok(outside.every(u => FONT.test(u)), 'nothing but the font: ' + outside.join(' '));
  // The one global, frozen.
  const g = await page.evaluate(() => ({ frozen: Object.isFrozen(window.Game), own: Object.keys(window).filter(k => /^(TOWN_DATA|TABLES|State|Pipeline|Api|UI|App|World)$/.test(k)) }));
  assert.equal(g.frozen, true);
  assert.deepEqual(g.own, []);
});

s.run();
