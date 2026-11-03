'use strict';
/* docs/BUILD_PLAN.md "Deliverable and hard constraints": one self-contained
   index.html with inline CSS and plain scripts, nothing external (wave 46:
   the font is inline; the manifest and touch icon are optional files beside
   it for a host), no module syntax, no globals but Game, and it runs
   from file:// with every other request blocked. The only network call in the
   code is the Claude API endpoint.
   Run with: node tests/run.cjs constraints */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, ROOT, GAME_PATH, GAME_URL } = require('./helpers.cjs');

const s = suite('constraints');

s.test('index.html is one self-contained file: inline CSS and classic scripts, no stylesheet link, no modules', async () => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  // Wave 46: the font is inline; the only links are the manifest and the touch icon, beside the page.
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  assert.deepEqual(links, ['<link rel="manifest" href="manifest.webmanifest">', '<link rel="apple-touch-icon" href="icon-192.png">'], 'links: ' + links.join(' '));
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map(m => m[1].trim());
  assert.ok(scripts.length >= 1);
  assert.deepEqual(scripts.filter(a => a !== ''), [], 'no src, type="module" or other attributes on <script>');
  for (const tag of ['iframe', 'img', 'video', 'audio', 'object', 'embed', 'base']) assert.ok(!new RegExp(`<${tag}\\b`, 'i').test(html), 'no <' + tag + '>');
  const code = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');
  assert.doesNotMatch(code, /^\s*(import|export)\s/m, 'no import/export statements');
  assert.doesNotMatch(code, /\bimport\s*\(/, 'no dynamic import()');
  assert.doesNotMatch(code, /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new Worker)\b/, 'no other way out');
  const fetches = [...code.matchAll(/\bfetch\s*\(([^,)]*)/g)].map(m => m[1].trim());
  // The API's messages endpoint, and its models list for Settings' "Check key" (Api.checkKey): nothing else.
  assert.deepEqual(fetches.slice().sort(), ['ENDPOINT', 'MODELS_ENDPOINT'], 'fetch only reaches the API endpoints');
  assert.equal(fetches.filter(f => f === 'MODELS_ENDPOINT').length, 1, 'the models list from one place only');
  assert.match(code, /const ENDPOINT = 'https:\/\/api\.anthropic\.com\/v1\/messages';/);
  assert.match(code, /const MODELS_ENDPOINT = 'https:\/\/api\.anthropic\.com\/v1\/models';/);
  // Every string reaches the page as text (el(), textContent), never as markup.
  assert.doesNotMatch(html, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write(ln)?\s*\(/, 'no innerHTML, outerHTML, insertAdjacentHTML or document.write');
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?(https?:|\/\/)/i, 'no external CSS resources');
  assert.match(code, /'use strict'/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'no package.json');
});

s.test('it runs from file:// with the network blocked: nothing outside is ever requested, and a turn plays', async h => {
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
  assert.deepEqual(outside, [], 'nothing outside (wave 46: not even the font): ' + outside.join(' '));
  // The one global, frozen.
  const g = await page.evaluate(() => ({ frozen: Object.isFrozen(window.Game), own: Object.keys(window).filter(k => /^(TOWN_DATA|TABLES|State|Pipeline|Api|UI|App|World)$/.test(k)) }));
  assert.equal(g.frozen, true);
  assert.deepEqual(g.own, []);
});

/* Wave 36: a byte budget for the one file. index.html is about 2.49 MB
   today; the budget is 3.25 MB because an inline font of about 150 KB is
   coming in another wave (the Google Fonts link replaced by a data: URI),
   which leaves room for that and for ordinary growth while still catching a
   runaway (a duplicated town, a pasted log, a base64 blob by mistake). */
const BYTE_BUDGET = 3250000; // bytes, decimal MB as the 2.49 MB above (2,489,949 bytes in Nov 2026)
s.test('index.html stays inside its byte budget (3.25 MB)', async () => {
  const bytes = fs.statSync(GAME_PATH).size;
  assert.ok(bytes <= BYTE_BUDGET, `index.html is ${(bytes / 1e6).toFixed(2)} MB (${bytes} bytes), over the ${BYTE_BUDGET / 1e6} MB budget`);
});

/* Wave 36: the inline script compiles, and a syntax error names its line in
   index.html (the script's text is placed at its own line: blank lines
   before it keep the numbers the file's). */
s.test('the inline script compiles: a syntax error names its line in index.html', async () => {
  const vm = require('vm');
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(blocks.length >= 1, 'an inline script');
  for (const m of blocks) {
    const start = m.index + m[0].indexOf('>') + 1;
    const line = html.slice(0, start).split('\n').length;
    const src = '\n'.repeat(line - 1) + m[1];
    try { new vm.Script(src, { filename: 'index.html' }); }
    catch (e) {
      const at = /index\.html:(\d+)/.exec(String(e.stack)) || [];
      throw new Error(`the inline script starting at index.html:${line} does not compile: ${e.message} (index.html:${at[1] || '?'})`);
    }
  }
  // The check itself names the line: a broken copy fails at the line broken.
  const broken = '\n'.repeat(41) + 'var ok = 1;\nvar = ;\n';
  assert.throws(() => new vm.Script(broken, { filename: 'index.html' }), e => /index\.html:43/.test(String(e.stack)));
});

s.run();
