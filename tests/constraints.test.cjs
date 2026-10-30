'use strict';
/* docs/BUILD_PLAN.md "Deliverable and hard constraints": one self-contained
   index.html with inline CSS and plain scripts, nothing external but the one
   Google Fonts stylesheet, no module syntax, no globals but Game, and it runs
   from file:// with every other request blocked. The only network call in the
   code is the Claude API endpoint.
   Run with: node tests/run.cjs constraints */
const fs = require('fs');
const path = require('path');
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
  // Every string reaches the page as text (el(), textContent), never as markup.
  assert.doesNotMatch(html, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write(ln)?\s*\(/, 'no innerHTML, outerHTML, insertAdjacentHTML or document.write');
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  assert.doesNotMatch(css, /@import|url\(\s*['"]?(https?:|\/\/)/i, 'no external CSS resources');
  assert.match(code, /'use strict'/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'package.json')), 'no package.json');
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
