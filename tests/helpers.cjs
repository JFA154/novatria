'use strict';
/* Shared test harness: a tiny suite runner on top of the preinstalled
   Playwright. Every test gets fresh browser contexts; any uncaught page error
   fails the test. Network is blocked: only file:, blob: and data: URLs load. */
const path = require('path');
const { chromium } = require('playwright');

const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const GAME_PATH = path.resolve(ROOT, 'index.html');
const GAME_URL = 'file://' + GAME_PATH;
const CONTENT_PATH = path.resolve(ROOT, 'content', 'town-data.js');
const CONTENT_URL = 'http://novatria.test/index.html';
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';
/* With NOVATRIA_CONTENT=1 every page is index.html with content/town-data.js
   pasted between the BEGIN/END CONTENT markers (the milestone 3 paste), served
   from a fake http origin by Playwright routing. Nothing is written to disk. */
const WITH_CONTENT = process.env.NOVATRIA_CONTENT === '1';
function contentHtml() {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const content = fs.readFileSync(CONTENT_PATH, 'utf8');
  const a = html.indexOf(BEGIN);
  const b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('content markers not found in index.html');
  return html.slice(0, a + BEGIN.length) + '\n' + content + '\n' + html.slice(b);
}
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 740 };

function suite(name) {
  const tests = [];
  return {
    test(title, fn) { tests.push({ title, fn }); },
    async run() {
      const only = process.env.TEST_FILTER ? new RegExp(process.env.TEST_FILTER, 'i') : null;
      const browser = await chromium.launch();
      let passed = 0;
      let failed = 0;
      console.log(name + (WITH_CONTENT ? ' (with content/town-data.js pasted in)' : ''));
      for (const t of tests) {
        if (only && !only.test(t.title)) continue;
        const contexts = [];
        const errors = [];
        const h = {
          errors,
          async open(opts = {}) {
            const context = await browser.newContext(Object.assign({ viewport: opts.viewport || LAPTOP, colorScheme: opts.colorScheme || 'dark' }, opts.contextOptions || {}));
            contexts.push(context);
            const html = WITH_CONTENT && !opts.url ? contentHtml() : null;
            await context.route('**/*', opts.route || (route => {
              const u = route.request().url();
              if (html && u.split('?')[0] === CONTENT_URL) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
              return /^(file|blob|data):/.test(u) ? route.continue() : route.abort();
            }));
            const page = await context.newPage();
            page.on('pageerror', e => errors.push(e));
            await page.goto(opts.url || (html ? CONTENT_URL : GAME_URL));
            await page.waitForFunction(() => window.Game && window.Game.App);
            return page;
          }
        };
        const t0 = Date.now();
        try {
          await t.fn(h);
          if (errors.length) throw new Error('uncaught page error: ' + errors.map(e => e.message).join(' | '));
          passed++;
          console.log(`  PASS  ${t.title} (${Date.now() - t0} ms)`);
        } catch (err) {
          failed++;
          const msg = String((err && err.stack) || err).split('\n').slice(0, 8).join('\n        ');
          console.log(`  FAIL  ${t.title}\n        ${msg}`);
        } finally {
          for (const c of contexts) await c.close().catch(() => {});
        }
      }
      await browser.close();
      console.log(`RESULT ${name}: passed=${passed} failed=${failed}`);
      process.exitCode = failed ? 1 : 0;
    }
  };
}

/* Start a game without the form, using whatever data is inlined (placeholder
   or real content), so these helpers survive the milestone 3 content paste. */
async function quickStart(page, opts = {}) {
  await page.evaluate(({ seed, kinds, bgIndex, name }) => {
    const D = Game.data;
    const bg = D.BACKGROUNDS[bgIndex || 0];
    const ks = kinds || ['debt', 'enemy', 'secret'];
    Game.App.quickStart({
      name: name || 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats),
      goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
      looseEnds: ks.map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] }))
    }, { seed });
  }, { seed: opts.seed === undefined ? 12345 : opts.seed, kinds: opts.kinds, bgIndex: opts.bgIndex, name: opts.name });
  await page.waitForSelector('#screen-game.active');
}

const stateJson = page => page.evaluate(() => JSON.stringify(Game.state));

/* Type into the composer and send with Enter; wait until the turn is over. */
async function sendText(page, text) {
  await page.fill('#cmd', text);
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
}

/* Everything that sticks out horizontally at the given width. */
function overflowReport(page, width) {
  return page.evaluate(w => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > w) out.push('documentElement.scrollWidth=' + de.scrollWidth);
    if (document.body.scrollWidth > w) out.push('body.scrollWidth=' + document.body.scrollWidth);
    for (const el of document.querySelectorAll('#app *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > w + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ').join('.') : ''} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
    }
    for (const el of document.querySelectorAll('.page, .feed-scroll, .panel-body')) {
      if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) out.push(`horizontal scroll inside ${el.id || el.className}`);
    }
    return out;
  }, width);
}

module.exports = { suite, quickStart, stateJson, sendText, overflowReport, contentHtml, ROOT, GAME_PATH, GAME_URL, CONTENT_PATH, WITH_CONTENT, LAPTOP, PHONE };
