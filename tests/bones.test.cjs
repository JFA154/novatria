'use strict';
/* Bones (index.html, the front page): the whole game in the browser. The rules engine has
   its own Node suite (tests/bones-engine.test.cjs); this one covers the page
   that plays it: the file alone from file:// with the network shut; no
   markup from strings and one fetch; the engine block the page runs is the
   one the engine suite tests; whole nights played through the buttons on a
   phone at speed 0 (each of the four endings, the page's cash and dice equal
   to the engine's view after every step); a reload mid-round; the back room;
   each trick's little control and the passive ones; the Book in the moment,
   on the seat sheet and across a reload; tonight's tables, the share line
   and the ledger; Claude against a stand-in API (Pearl's column and table
   talk, a refused key and a failure, no key no call); the first-night coach,
   and its tips about the people kept off their seats at 390x780 and 360x640;
   phone widths in both themes, and nothing clipped at 390x640.
   Run with: node tests/run.cjs bones.test   (or node tests/bones.test.cjs) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { suite, overflowReport, PHONE } = require('./helpers.cjs');

const FILE = path.resolve(__dirname, '..', 'index.html');
const URL = 'file://' + FILE;
const HTML = fs.readFileSync(FILE, 'utf8');
const s = suite('bones');
const open = (h, opts) => h.open(Object.assign({ url: URL, consent: false, viewport: PHONE, contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
function engineInNode() {
  const B = '/* ==BONES:ENGINE:BEGIN== */', E = '/* ==BONES:ENGINE:END== */';
  const ctx = vm.createContext({});
  vm.runInContext(HTML.slice(HTML.indexOf(B), HTML.indexOf(E) + E.length), ctx);
  return ctx.Game.Engine;
}

/* One step of a night through the page's own buttons (element.click() on the real controls), playing as
   Engine.basicPolicy would: sit at the rich table with twice its buy-in, else the first; leave the back room;
   Liar under 38% by the Count, Spot on over 50% exact, else the raise the Count likes. Resolves to the phase. */
const STEP = async () => {
  const A = Game.App, E = Game.Engine, q = sel => document.querySelector(sel);
  await A.idle();
  const S = A.state;
  if (!S) return 'none';
  if (Game.UI.after) { q('#btn-endtable').click(); await A.idle(); return 'end'; }
  if (S.phase === 'over') return 'over';
  const v = E.view(S), L = E.legal(S);
  const must = (sel) => { const b = q(sel); if (!b || b.disabled || b.offsetParent === null) throw new Error('no button ' + sel + ' at ' + S.phase + '/' + L.need); b.click(); };
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
/* What the page shows that the engine's view says: [] when they agree. */
const CHECK = () => {
  const v = Game.App.view(); const bad = [];
  if (!v) return bad;
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const cur = Game.UI.Screens.cur;
  const text = document.querySelector('#app').textContent + (document.querySelector('#dlg').open ? document.querySelector('#dlg').textContent : '');
  if (/\[object |\bundefined\b|\bNaN\b/.test(text)) bad.push('stray text: ' + /.{0,30}(\[object |\bundefined\b|\bNaN\b).{0,30}/.exec(text)[0]);
  if (v.phase === 'table' && cur === 'table' && !Game.UI.after) {
    const t = v.table;
    if (document.querySelector('#cash').textContent !== money(v.cash)) bad.push(`cash ${document.querySelector('#cash').textContent} vs ${money(v.cash)}`);
    t.seats.forEach(st => {
      if (st.isMe) { const c = document.querySelector('#mycup'); if (+c.dataset.dice !== st.dice) bad.push(`my dice ${c.dataset.dice} vs ${st.dice}`); if (t.myDice && c.dataset.faces !== t.myDice.join(',')) bad.push(`my faces ${c.dataset.faces} vs ${t.myDice}`); return; }
      const n = document.querySelector(`.seat[data-seat="${st.seat}"]`);
      if (!n || +n.dataset.dice !== st.dice) bad.push(`seat ${st.seat} dice ${n && n.dataset.dice} vs ${st.dice}`);
    });
    if (t.wait === 'turn' && document.querySelector('#btn-bid').closest('[data-calm]')) bad.push('picker closed on your turn');
  }
  if ((v.phase === 'choose' && cur === 'choose') || (v.phase === 'shop' && cur === 'shop')) {
    const c = document.querySelector(`#screen-${cur} .topbar .cash`);
    if (!c || c.textContent !== money(v.cash)) bad.push(`${cur} cash ${c && c.textContent} vs ${money(v.cash)}`);
  }
  return bad;
};
async function playOut(page, opts) {
  const o = opts || {};
  for (let i = 0; i < 4000; i++) {
    const ph = await page.evaluate(STEP);
    if (o.check) { const bad = await page.evaluate(CHECK); assert.deepEqual(bad, [], `after step ${i}`); }
    if (ph === 'over' || ph === 'none' || (o.until && await page.evaluate(o.until, o.arg))) return ph;
  }
  throw new Error('the night did not end');
}
const startNight = (page, o) => page.evaluate(o => { Game.App.speed = o.speed === undefined ? 0 : o.speed; Game.App.start(Object.assign({ tips: false }, o)); }, o || {});
const untilTurnWithBid = () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'turn' && !!v.table.bid; };

/* A stand-in for the Anthropic API. opts: { status, delay (a promise to wait on), talk(user) -> lines } */
function standIn(log, opts) {
  const o = opts || {};
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  return async route => {
    const req = route.request(), u = req.url();
    if (/^(file|blob|data):/.test(u)) return route.continue();
    if (u !== 'https://api.anthropic.com/v1/messages') { log.push({ other: u }); return route.abort(); }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(req.postData());
    log.push({ body, headers: req.headers() });
    if (o.delay) await o.delay;
    if (o.status) return route.fulfill({ status: o.status, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ type: 'error', error: { type: o.status === 401 ? 'authentication_error' : 'api_error', message: 'stand-in says no' } }) });
    const req0 = body.output_config.format.schema.required;
    const out = req0.includes('headline') ? { headline: 'STAND-IN HEADLINE FOR THE NIGHT', body: 'The visitor sat down. The dice went round. This is the stand-in column, and it says so.' }
      : { lines: o.talk ? o.talk(body.messages[0].content[0].text) : [] };
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }], usage: { input_tokens: 100, output_tokens: 50 } }) });
  };
}

// ===================================================================== the file
s.test('the page stands alone: from file:// with the network shut, no page errors, the first screen offers the practice hand first', async h => {
  const asked = [];
  const page = await open(h, { route: route => { const u = route.request().url(); if (/^(file|blob|data):/.test(u)) return route.continue(); asked.push(u); return route.abort(); } });
  assert.equal(await page.title(), 'Bones');
  assert.equal(await page.textContent('#home-title'), 'Bones');
  assert.match(await page.textContent('.tagline'), /The math says one thing\. Their face says another\./);
  assert.ok(await page.isVisible('#btn-learn'), 'first visit: Learn it in a minute');
  assert.ok(await page.isVisible('#btn-sit'), 'first visit: Deal me in, a real night, beside it');
  assert.equal(await page.isVisible('#btn-continue'), false);
  const globals = await page.evaluate(() => { const f = document.createElement('iframe'); document.body.append(f); const base = new Set(Object.keys(f.contentWindow)); f.remove(); return Object.keys(window).filter(k => !base.has(k)); });
  assert.deepEqual(globals, ['Game'], 'the only global is Game');
  assert.deepEqual(await overflowReport(page, 375), []);
  assert.deepEqual(asked, []);
});

s.test('one self-contained file: no markup from strings, one fetch (the messages endpoint), one plain script, the shared CSP', async () => {
  assert.doesNotMatch(HTML, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write(ln)?\s*\(/);
  const fetches = [...HTML.matchAll(/\bfetch\s*\(([^,)]*)/g)].map(m => m[1].trim());
  assert.deepEqual(fetches, ['ENDPOINT']);
  assert.match(HTML, /const ENDPOINT = 'https:\/\/api\.anthropic\.com\/v1\/messages';/);
  assert.deepEqual(HTML.match(/<script[^>]*>/g), ['<script>'], 'one classic inline script, no attributes');
  for (const tag of ['img', 'iframe', 'audio', 'video', 'object', 'embed', 'link']) assert.doesNotMatch(HTML, new RegExp(`<${tag}\\b`, 'i'), 'no <' + tag + '>');
  assert.doesNotMatch(HTML, /\b(XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|new Worker)\b|\bimport\s*\(|^\s*(import|export)\s/m);
  assert.doesNotMatch(HTML, /temperature|top_p|top_k|tool_choice|budget_tokens/);
  assert.doesNotMatch(HTML.slice(HTML.indexOf('/* ==BONES:ENGINE:END== */')), /_sim\b/, 'the UI never reads the hidden side');
  const csp = fs.readFileSync(path.resolve(__dirname, '..', 'lockin.html'), 'utf8').split('\n')[5];
  assert.ok(HTML.includes(csp), 'the same CSP meta as lockin.html');
  assert.match(HTML, /'use strict'/);
  assert.match(HTML, /'anthropic-dangerous-direct-browser-access': 'true'/);
});

s.test('the engine block extracts and is exactly what the page runs', async h => {
  const page = await open(h);
  const E = engineInNode();
  const mine = JSON.stringify(E.playNight('same-engine', null, { keepEvents: true }));
  const theirs = await page.evaluate(() => JSON.stringify(Game.Engine.playNight('same-engine', null, { keepEvents: true })));
  assert.equal(theirs, mine);
  assert.equal(await page.evaluate(() => Game.Engine.VERSION), E.VERSION);
  assert.equal(await page.evaluate(() => String(Game.Engine.act)), String(E.act));
});

// ===================================================================== whole nights
s.test('whole nights through the buttons on a phone at speed 0: all four endings, and the page equals the view after every step', async h => {
  const E = engineInNode();
  const seeds = { house: null, cleaned: null, walked: null, bust: null };
  for (let i = 0; i < 400 && Object.values(seeds).some(x => !x); i++) { const e = E.playNight('n' + i).S.ending; if (!seeds[e]) seeds[e] = 'n' + i; }
  for (const [ending, seed] of Object.entries(seeds)) {
    const page = await open(h);
    await startNight(page, { seed });
    await page.click('.tcard button.sit[data-i="' + (await page.evaluate(() => { const S = Game.App.state, v = Game.Engine.view(S); const r = v.options.find(c => c.kind === 'rich' && c.affordable && S.cash >= c.buyIn * 2); return r ? r.i : 0; })) + '"]');
    assert.equal(await playOut(page, { check: true }), 'over');
    const end = await page.evaluate(() => ({ ending: Game.App.state.ending, cash: Game.App.state.cash, shown: document.querySelector('#over-cash').firstChild.textContent, screen: Game.UI.Screens.cur, share: document.querySelector('#share-line').textContent, column: document.querySelector('#col-head').textContent, strip: document.querySelectorAll('.ns-row').length }));
    assert.equal(end.ending, ending, `seed ${seed}`);
    assert.equal(end.screen, 'over');
    assert.equal(end.shown, '$' + end.cash.toLocaleString('en-US'));
    assert.equal(end.share, E.shareLine(E.playNight(seed).S));
    assert.ok(end.column.length > 5 && end.strip >= 1);
    assert.deepEqual(await overflowReport(page, PHONE.width), []);
  }
});

s.test('a reload mid-round resumes exactly where it was: the state, the cups, the bid and the Count', async h => {
  const page = await open(h);
  await startNight(page, { seed: 'reload-me' });
  await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'turn' && v.table.history.length >= 2; } });
  const snap = () => page.evaluate(() => ({ S: JSON.stringify(Game.App.state), seats: [...document.querySelectorAll('.seat')].map(n => n.dataset.dice + (n.querySelector('.bubble').getAttribute('aria-label') || '')), faces: document.querySelector('#mycup').dataset.faces, bid: document.querySelector('#bid').getAttribute('aria-label'), count: document.querySelector('#countbar').dataset.count, cash: document.querySelector('#cash').textContent }));
  const before = await snap();
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.match(await page.textContent('#continue-note'), /mid-table/);
  await page.click('#btn-continue');
  await page.evaluate(() => { Game.App.speed = 0; });
  assert.deepEqual(await snap(), before);
  assert.equal(await page.evaluate(() => Game.Engine.legal(Game.App.state).need), 'turn');
  // And from the menu: leave to the home screen and pick it up again.
  await page.click('#btn-menu');
  await page.click('#btn-leave-table');
  assert.ok(await page.isVisible('#btn-continue'));
  await page.click('#btn-continue');
  assert.deepEqual(await snap(), before);
  // It plays on from there.
  await playOut(page, { until: () => Game.App.state.phase === 'shop' && !Game.UI.after });
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'shop');
});

s.test('with storage switched off it still plays: a table, the home screen and back to the night', async h => {
  const page = await open(h);
  await page.addInitScript(() => { for (const k of ['localStorage', 'sessionStorage']) Object.defineProperty(window, k, { get() { throw new Error('storage off'); } }); });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.ok(await page.isVisible('#btn-sit'));
  await startNight(page, { seed: 'no-storage' });
  await playOut(page, { check: true, until: untilTurnWithBid });
  const before = await page.evaluate(() => JSON.stringify(Game.App.state));
  await page.evaluate(() => Game.App.home());
  await page.click('#btn-continue');
  assert.equal(await page.evaluate(() => JSON.stringify(Game.App.state)), before);
  await playOut(page, { check: true });
});

// ===================================================================== the back room
s.test('the back room: buy, reroll and sell through the buttons; the five slots; the table you left at the top', async h => {
  const page = await open(h);
  await startNight(page, { seed: 'shopper' });
  await playOut(page, { until: () => Game.App.state.phase === 'shop' && !Game.UI.after });
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'shop');
  assert.match(await page.textContent('#shop-result'), /^You (won|lost) .+’s table|^Second at/);
  await page.evaluate(() => { Game.App.state.cash = 1000; Game.UI.Screens.render(); });
  const offer = await page.evaluate(() => Game.App.view().shop.offers[0]);
  await page.click('.offer button.buy[data-i="0"]');
  let st = await page.evaluate(() => ({ cash: Game.App.state.cash, tricks: Game.App.state.tricks.map(t => t.id), shown: document.querySelector('#screen-shop .topbar .cash').textContent }));
  assert.deepEqual(st.tricks, [offer.id]);
  assert.equal(st.cash, 1000 - offer.price);
  assert.equal(st.shown, '$' + st.cash.toLocaleString('en-US'));
  assert.ok(await page.isVisible(`.held-item[data-id="${offer.id}"]`));
  const before = await page.evaluate(() => JSON.stringify(Game.App.view().shop.offers));
  const price = await page.evaluate(() => Game.App.view().shop.rerollPrice);
  await page.click('#btn-reroll');
  assert.notEqual(await page.evaluate(() => JSON.stringify(Game.App.view().shop.offers)), before);
  assert.equal(await page.evaluate(() => Game.App.state.cash), st.cash - price);
  await page.click(`.held-item button.sell[data-id="${offer.id}"]`);
  assert.deepEqual(await page.evaluate(() => Game.App.state.tricks), []);
  assert.equal(await page.evaluate(() => Game.App.state.cash), st.cash - price + Math.floor(offer.price / 2));
  // Five slots: fill them, and the next offer says so.
  await page.evaluate(() => { Game.App.state.cash = 100000; Game.UI.Screens.render(); });
  for (let k = 0; k < 5; k++) {
    const i = await page.evaluate(() => Game.App.view().shop.offers.findIndex(o => o));
    if (i < 0) { await page.click('#btn-reroll'); k--; continue; }
    await page.click(`.offer button.buy[data-i="${i}"]`);
  }
  assert.equal(await page.evaluate(() => Game.App.state.tricks.length), 5);
  if (await page.evaluate(() => Game.App.view().shop.offers.every(o => !o))) await page.click('#btn-reroll');
  assert.match(await page.textContent('.offer button.buy'), /five slots are full/);
  assert.equal(await page.isDisabled('.offer button.buy'), true);
  await page.click('#btn-leave');
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'choose');
});

// ===================================================================== tricks
s.test('each usable trick\'s control: Slow Roll picks dice, Palm a die and a face, the Nod answers, Double or Nothing calls for two', async h => {
  const page = await open(h);
  await startNight(page, { seed: 'tricky', tricks: ['slowroll', 'palm', 'nod', 'double'] });
  const usable = id => ({ until: x => Game.Engine.legal(Game.App.state).uses.includes(x) || Game.App.state.phase === 'over', arg: id });
  // Slow Roll: keep the first die, re-roll the rest.
  await playOut(page, usable('slowroll'));
  const d0 = await page.evaluate(() => Game.App.view().table.myDice);
  await page.click('.tricks .trick[data-id="slowroll"]');
  await page.click('dialog .picks button[data-i="0"]');
  assert.match(await page.textContent('#btn-use'), /^Re-roll \d+$/);
  await page.click('#btn-use');
  await page.evaluate(() => Game.App.idle());
  const d1 = await page.evaluate(() => ({ dice: Game.App.view().table.myDice, slow: Game.App.state.table.round.slow, shown: document.querySelector('#mycup').dataset.faces }));
  assert.equal(d1.slow, 1, 'one of the round\'s two re-rolls');
  assert.equal(d1.dice[0], d0[0], 'the die kept stays');
  assert.equal(d1.shown, d1.dice.join(','));
  // Palm: the last die to a 6, or a 5 if it already shows a 6 (any face from 2 to 6 would do).
  await playOut(page, usable('palm'));
  const n = await page.evaluate(() => Game.App.view().table.myDice.length);
  const was = await page.evaluate(() => Game.App.view().table.myDice.slice(-1)[0]), to = was === 6 ? 5 : 6;
  await page.click('.tricks .trick[data-id="palm"]');
  assert.equal(await page.isDisabled('#btn-use'), true);
  await page.click(`dialog .picks button[data-i="${n - 1}"]`);
  await page.click(`dialog .picks button[data-f="${to}"]`);
  await page.click('#btn-use');
  await page.evaluate(() => Game.App.idle());
  assert.equal(await page.evaluate(() => Game.App.view().table.myDice.slice(-1)[0]), to);
  assert.equal(await page.evaluate(() => Game.App.view().table.palm.left), 3, 'four a table: three left');
  // Loretta's Nod: the truth about the bid in front of you.
  await playOut(page, usable('nod'));
  await page.click('.tricks .trick[data-id="nod"]');
  await page.click('#btn-use');
  await page.evaluate(() => Game.App.idle());
  const nod = await page.evaluate(() => Game.App.view().table.nod);
  assert.ok(nod);
  assert.match(await page.textContent('#infoline'), nod.truth ? /Loretta nods/ : /Loretta shakes her head/);
  // Double or Nothing: the Liar button offers "for two": right, the bidder loses 2; wrong, you lose 1.
  await playOut(page, { until: untilTurnWithBid });
  assert.ok(await page.isVisible('#btn-liar2'));
  await page.click('#btn-liar2');
  await page.evaluate(() => Game.App.idle());
  const loss = await page.evaluate(() => Game.UI.TV.lastLoss);
  const rule = await page.evaluate(() => Game.UI.TV.rule && Game.UI.TV.rule.id), L = rule === 'sudden' ? 2 : 1;
  assert.ok(loss.length === 1 && (loss[0].who === 0 ? loss[0].n === L || loss[0].left === 0 : loss[0].n === 2 * L || loss[0].left === 0), JSON.stringify(loss));
});

s.test('Double or Nothing: the Liar ×2 button counts its calls down and goes at none; the chip and the page say what is left', async h => {
  const page = await open(h);
  await startNight(page, { seed: 'pair', tricks: ['double'] });
  const read = () => page.evaluate(() => {
    const b = document.querySelector('#btn-liar2'), chip = document.querySelector('.tricks .trick[data-id="double"]');
    return { left: Game.App.view().table.double.left, hidden: b.hidden, three: document.querySelector('.calls').hasAttribute('data-three'), label: b.textContent, aria: b.getAttribute('aria-label'), chip: chip.textContent, spent: chip.hasAttribute('data-spent'), table: Game.App.state.hour + '/' + Game.App.state.table.kind };
  });
  await playOut(page, { until: untilTurnWithBid });
  let r = await read();
  assert.equal(r.left, 2);
  assert.ok(!r.hidden && r.three, JSON.stringify(r));
  assert.equal(r.label, 'Liar ×2for two · 2 left'); assert.equal(r.aria, 'Liar ×2 · 2 left (for two dice)');
  assert.match(r.chip, /Double or Nothing2 left$/);
  await page.click('.tricks .trick[data-id="double"]');
  assert.match(await page.textContent('#double-left'), /^2 calls for 2 left at this table\. When you call, use the “Liar ×2” button\.$/);
  await page.keyboard.press('Escape');
  const first = r.table;
  await page.click('#btn-liar2');
  await page.evaluate(() => Game.App.idle());
  await playOut(page, { until: untilTurnWithBid });
  r = await read();
  assert.equal(r.table, first, 'still the same table');
  assert.equal(r.left, 1);
  assert.ok(!r.hidden && /1 left$/.test(r.label) && /1 left$/.test(r.chip), JSON.stringify(r));
  await page.click('#btn-liar2');
  await page.evaluate(() => Game.App.idle());
  await playOut(page, { until: untilTurnWithBid });
  r = await read();
  assert.equal(r.table, first, 'still the same table');
  assert.equal(r.left, 0);
  assert.ok(r.hidden && !r.three, 'no Liar ×2 at none left: ' + JSON.stringify(r));
  assert.ok(r.spent && /used$/.test(r.chip), JSON.stringify(r));
  assert.ok(await page.isVisible('#btn-liar') && await page.isVisible('#btn-spot'));
  await page.click('.tricks .trick[data-id="double"]');
  assert.match(await page.textContent('#double-left'), /^Both used at this table/);
  await page.keyboard.press('Escape');
  // The next table: both again.
  await playOut(page, { until: was => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'turn' && !!v.table.bid && Game.App.state.hour + '/' + Game.App.state.table.kind !== was; }, arg: first });
  assert.equal(await page.evaluate(() => Game.App.state.phase), 'table', 'this seed reaches a second table');
  r = await read();
  assert.equal(r.left, 2); assert.ok(!r.hidden && /2 left$/.test(r.label), JSON.stringify(r));
});

// ===================================================================== the reworked tricks
const PHONES = [{ width: 390, height: 780 }, { width: 360, height: 640 }];
const withTheme = async (h, theme, viewport) => {
  const page = await open(h, { viewport });
  await page.evaluate(t => { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, theme: t, played: true, tipsDone: true })); }, theme);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  return page;
};
/* Everything on screen and nothing spilling: the felt, the controls in the action bar. */
const TABLE_FITS = sels => {
  const bad = [], H = innerHeight, W = innerWidth;
  sels.forEach(sel => document.querySelectorAll(sel).forEach(n => { if (n.offsetParent === null) return; const r = n.getBoundingClientRect(); if (r.top < -1 || r.bottom > H + 1 || r.left < -1 || r.right > W + 1) bad.push(`${sel} off screen`); if (n.tagName === 'BUTTON' && r.height < 43.5) bad.push(`${sel} ${r.height}px tall`); }));
  const felt = document.querySelector('#felt');
  if (felt.scrollHeight > felt.clientHeight + 2) bad.push(`felt overflows ${felt.scrollHeight} > ${felt.clientHeight}`);
  return bad;
};

s.test('Side Bet: when two others go to a challenge the holder gets one tap (the bid, the Count, the habit); fits at 360 px in both themes', async h => {
  for (const theme of ['dark', 'parchment']) for (const vp of PHONES) {
    const page = await withTheme(h, theme, vp);
    await startNight(page, { seed: 'side-' + theme + vp.width, tricks: ['sidebet'] });
    await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'side'; } });
    assert.equal(await page.evaluate(() => Game.App.view().table.wait), 'side', 'a side bet came up');
    const sb = await page.evaluate(() => Game.App.view().table.side);
    const shown = await page.evaluate(() => ({ q: document.querySelector('.sidebet .sb-q').textContent, facts: document.querySelector('.sidebet .sb-facts').textContent, picker: document.querySelector('#picker').hidden }));
    const E = engineInNode(), word = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][sb.q];
    assert.ok(shown.q.includes(`${word} ${sb.f}`), 'the bid: ' + shown.q);
    const p = sb.kind === 'liar' ? sb.count : sb.exact;
    assert.ok(shown.facts.includes((p > 0 && p < 0.005 ? '<1' : p > 0.995 && p < 1 ? '>99' : String(Math.round(p * 100))) + '%'), 'the Count: ' + shown.facts);
    if (sb.habit) assert.ok(shown.facts.includes(sb.habit.text), 'the habit line');
    assert.ok(shown.picker, 'the bid picker steps aside');
    assert.deepEqual(await page.evaluate(TABLE_FITS, ['#btn-side-bidder', '#btn-side-caller', '#btn-side-pass', '.sidebet .sb-q', '#mycup .die', '#bid']), [], `${theme} ${vp.width}x${vp.height}`);
    assert.deepEqual(await overflowReport(page, vp.width), []);
    // One tap: the cups lift and the night goes on.
    const cash = await page.evaluate(() => Game.App.state.cash);
    await page.click('#btn-side-bidder');
    await page.evaluate(() => Game.App.idle());
    const after = await page.evaluate(() => ({ need: Game.Engine.legal(Game.App.state).need, last: Game.App.state.table && Game.App.state.table.last, cash: Game.App.state.cash }));
    assert.notEqual(after.need, 'side');
    if (after.last) {
      const right = sb.kind === 'liar' ? after.last.reveal.good : !after.last.reveal.exact;
      assert.equal(after.cash - cash >= (right ? sb.pays : 0), true, 'a right side bet pays the ante');
    }
    void E;
  }
  // A player without it is never asked.
  const page = await open(h);
  await startNight(page, { seed: 'side-none' });
  let asked = false;
  for (let i = 0; i < 400 && !asked; i++) { const ph = await page.evaluate(STEP); asked = await page.evaluate(() => Game.App.state && Game.App.state.phase === 'table' && Game.App.state.table.wait === 'side'); if (ph === 'over') break; }
  assert.equal(asked, false);
});

s.test('Loaded Six: the die is marked, a bid of 6s may go one past the dice, and the reveal counts it twice and says so', async h => {
  for (const vp of PHONES) {
    const page = await open(h, { viewport: vp, contextOptions: {} });
    await page.evaluate(() => { Game.App.speed = 0; Game.App.start({ seed: 'loaded-ui', tips: false, tricks: ['loaded'] }); });
    await page.evaluate(() => Game.App.state.phase === 'choose' ? Game.App.act({ t: 'sit', i: 0 }) : null);
    await page.evaluate(async () => {
      await Game.App.idle();
      const S = Game.App.state, T = S.table;
      T.seats[0].dice = [6, 6, 2, 4]; T.seats[1].dice = [6, 1, 3, 5]; T.seats[2].dice = [6, 2, 2, 4];
      T.seats.forEach(x => { x.n = x.dice.length; x.out = false; });
      T.round = { no: T.roundNo, opener: 1, turn: 0, bids: [{ who: 2, q: 6, f: 6, p: 0.2, held: 1, bluff: true, habit: null }], blindSeat: -1, looked: false, peek: [], ones: null, nod: null, slow: 0, hot: false, fixed: [], pinned: { 0: 6 }, loaded: 0 };
      T.wait = 'turn'; Game.UI.TV.key = ''; Game.UI.Screens.render();
    });
    // Marked on your cup, worth two.
    assert.equal(await page.evaluate(() => document.querySelectorAll('#mycup .die[data-twice]').length), 1);
    assert.match(await page.getAttribute('#mycup .die[data-twice]', 'aria-label'), /counts as two 6s/);
    // The Count and the picker agree with the engine: twelve dice, and thirteen 6s is a legal bid.
    assert.equal(await page.evaluate(() => Game.Engine.legal(Game.App.state).maxFor[6]), 13);
    await page.click('.facebtn[data-f="6"]');
    for (let g = 0; g < 20 && !(await page.isDisabled('#q-plus')); g++) await page.click('#q-plus');
    assert.equal(await page.textContent('#q-val'), '13');
    assert.equal(await page.isEnabled('#btn-bid'), true);
    await page.click('.facebtn[data-f="5"]');
    assert.ok(+(await page.textContent('#q-val')) <= 12, 'not for 5s');
    // The reveal, at speed: the loaded die lights and the counter takes two from it.
    await page.evaluate(() => { Game.App.speed = 1; });
    await page.click('#btn-liar');
    await page.waitForSelector('#mycup .die[data-twice][data-hit]', { timeout: 20000 });
    await page.evaluate(() => Game.App.idle());
    const rv = await page.evaluate(() => Game.App.view().table.last.reveal);
    assert.deepEqual([rv.count, rv.loaded, rv.good], [6, 0, true]);
    assert.equal(await page.textContent('#bid .count-num'), '6');
    assert.match(await page.textContent('.sheet .sub'), /There were 6 \(your loaded six counts twice\); you lose a die\./);
    assert.deepEqual(await overflowReport(page, vp.width), []);
  }
});

s.test('Slow Roll: one tap keeps your best face and re-rolls the rest, twice a round; the dice picker still works', async h => {
  const page = await open(h, { viewport: { width: 360, height: 640 } });
  await startNight(page, { seed: 'slow-ui', tricks: ['slowroll'] });
  await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'ready' && v.table.slow && v.table.slow.reroll.length > 0; } });
  const before = await page.evaluate(() => ({ dice: Game.App.view().table.myDice, slow: Game.App.view().table.slow }));
  assert.match(await page.textContent('#btn-keepbest'), new RegExp(`^Keep ${before.slow.f}sre-roll ${before.slow.reroll.length}$`));
  assert.match(await page.textContent('#bar p'), /Slow Roll: 2 re-rolls left\./);
  assert.deepEqual(await page.evaluate(TABLE_FITS, ['#btn-keepbest', '#btn-slowroll', '#btn-go']), []);
  await page.click('#btn-keepbest');
  await page.evaluate(() => Game.App.idle());
  const after = await page.evaluate(() => ({ dice: Game.App.view().table.myDice, wait: Game.App.view().table.wait, slow: Game.App.state.table.round.slow, shown: document.querySelector('#mycup').dataset.faces }));
  before.dice.forEach((d, i) => { if (!before.slow.reroll.includes(i)) assert.equal(after.dice[i], d, 'kept die ' + i); });
  assert.deepEqual([after.wait, after.slow, after.shown], ['ready', 1, after.dice.join(',')]);
  assert.match(await page.textContent('#bar p'), /1 re-roll left/);
  // The second, by hand from the dialog: the dialog offers the same one tap at the top.
  await page.click('#btn-slowroll');
  if (await page.$('#btn-keepbest-dlg')) assert.match(await page.textContent('#btn-keepbest-dlg'), /^Keep the \d+s, re-roll \d+$/);
  await page.click('dialog .picks button[data-i="0"]');
  await page.click('#btn-use');
  await page.evaluate(() => Game.App.idle());
  assert.equal(await page.evaluate(() => Game.App.state.table.round.slow), 2);
  assert.match(await page.textContent('#bar p'), /spent this round/);
  await page.click('#btn-go');
  assert.equal(await page.evaluate(() => Game.App.idle().then(() => Game.Engine.legal(Game.App.state).uses.includes('slowroll'))), false);
});

s.test('Palm: faces 2 to 6 only, the loaded six will not turn, four a table and the count left shown', async h => {
  const page = await open(h, { viewport: { width: 360, height: 640 } });
  await startNight(page, { seed: 'palm-ui', tricks: ['palm', 'loaded'] });
  await playOut(page, { until: () => Game.Engine.legal(Game.App.state).uses.includes('palm') && Game.App.view().table.wait === 'turn' });
  for (let k = 0; k < 2; k++) {
    await page.click('.tricks .trick[data-id="palm"]');
    assert.match(await page.textContent('#palm-left'), new RegExp(`^${4 - k} palms? left at this table`));
    assert.equal(await page.$('dialog .picks button[data-f="1"]'), null, 'no 1');
    assert.equal(await page.evaluate(() => document.querySelectorAll('dialog .picks button[data-f]').length), 5);
    const loaded = await page.evaluate(() => Game.App.view().table.palm.loaded);
    if (loaded !== null) assert.equal(await page.isDisabled(`dialog .picks button[data-i="${loaded}"]`), true, 'the loaded six will not turn');
    assert.match(await page.textContent('#trick-goes'), /Goes with your Loaded Six\./);
    const dice = await page.evaluate(() => Game.App.view().table.myDice);
    const i = dice.findIndex((d, j) => j !== loaded), to = dice[i] === 6 ? 2 : 6;
    await page.click(`dialog .picks button[data-i="${i}"]`);
    await page.click(`dialog .picks button[data-f="${to}"]`);
    assert.equal(await page.textContent('#btn-use'), `Turn the ${dice[i]} to a ${to}`);
    assert.deepEqual(await overflowReport(page, 360), []);
    await page.click('#btn-use');
    await page.evaluate(() => Game.App.idle());
    assert.equal(await page.evaluate(j => Game.App.view().table.myDice[j], i), to);
  }
  assert.equal(await page.evaluate(() => Game.App.view().table.palm.left), 2);
});

s.test('the back room: an offer that goes with a trick you hold says so; so do your held tricks and a trick\'s page', async h => {
  for (const theme of ['dark', 'parchment']) {
    const page = await withTheme(h, theme, { width: 360, height: 640 });
    await startNight(page, { seed: 'builds', tricks: ['shaved', 'loaded'] });
    await page.evaluate(() => { const S = Game.App.state; S.phase = 'shop'; S.table = null; S.cash = 500; S.shop = { hour: 1, offers: ['snake', 'mirror', 'palm'], rerolls: 0 }; Game.UI.Screens.render(); });
    assert.equal(await page.textContent('.offer[data-id="snake"] .goes'), 'Goes with your Shaved Die.');
    assert.equal(await page.textContent('.offer[data-id="palm"] .goes'), 'Goes with your Loaded Six.');
    assert.equal(await page.$('.offer[data-id="mirror"] .goes'), null);
    await page.click('.offer button.buy[data-i="2"]');
    assert.equal(await page.textContent('.held-item[data-id="loaded"] .goes'), 'Goes with your Palm.');
    assert.equal(await page.textContent('.held-item[data-id="palm"] .goes'), 'Goes with your Loaded Six.');
    assert.equal(await page.textContent('.offer[data-id="snake"] .goes'), 'Goes with your Shaved Die.');
    assert.deepEqual(await overflowReport(page, 360), []);
    // Friends Rates: four offers.
    await page.evaluate(() => { const S = Game.App.state; S.tricks.push({ id: 'friends', paid: 15 }); S.shop.offers = ['snake', 'mirror', 'nod', 'sticky']; Game.UI.Screens.render(); });
    assert.equal(await page.evaluate(() => document.querySelectorAll('.offer').length), 4);
    assert.deepEqual(await overflowReport(page, 360), []);
  }
});

s.test('a night saved before the trick rework resumes from Continue and plays on to the end', async h => {
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', 'bones-night-v1.json'), 'utf8')).saves;
  for (const k of ['turn', 'ready', 'shop']) {
    const page = await open(h);
    await page.evaluate(r => { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, played: true, tipsDone: true })); localStorage.setItem('novatria.bones.night', JSON.stringify(r)); }, fx[k]);
    await page.reload();
    await page.waitForFunction(() => window.Game && Game.App);
    assert.ok(await page.isVisible('#btn-continue'), k);
    await page.click('#btn-continue');
    await page.evaluate(() => { Game.App.speed = 0; });
    assert.equal(await page.evaluate(() => Game.UI.Screens.cur), k === 'shop' ? 'shop' : 'table');
    assert.deepEqual(await page.evaluate(CHECK), []);
    assert.equal(await playOut(page, { check: true }), 'over');
  }
});

s.test('a whole night through real clicks holding Side Bet and Loaded Six: no page errors, the page equals the view', async h => {
  const page = await open(h);
  // rc0 plays all five tables and beats the house (Engine.playNight with basicPolicy, as STEP plays).
  await startNight(page, { seed: 'rc0', tricks: ['sidebet', 'loaded'] });
  let sides = 0;
  for (let i = 0; i < 4000; i++) {
    if (await page.evaluate(() => Game.App.state && Game.App.state.phase === 'table' && Game.App.state.table.wait === 'side')) sides++;
    const ph = await page.evaluate(STEP);
    assert.deepEqual(await page.evaluate(CHECK), [], `after step ${i}`);
    if (ph === 'over' || ph === 'none') break;
  }
  const end = await page.evaluate(() => ({ phase: Game.App.state.phase, ending: Game.App.state.ending, tables: Game.App.state.log.length }));
  assert.deepEqual(end, { phase: 'over', ending: 'house', tables: 5 });
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'over');
  assert.ok(sides >= 5, 'side bets were offered: ' + sides);
});

s.test('the quiet tricks show what they show: Mirror Ring in the cups, Bar Mirror and the Ledger by the seats; a dice trick sleeps at Last Call', async h => {
  const page = await open(h);
  await startNight(page, { seed: 'quiet', tricks: ['mirror', 'barmirror', 'ledger'] });
  await playOut(page, { until: untilTurnWithBid });
  assert.ok(await page.$('.seat .tray .die[data-peek]'), 'Mirror Ring: a die face up on your left');
  assert.match(await page.textContent('#infoline'), /Bar Mirror: \d+ ones? on the table/);
  assert.match(await page.textContent('.seat-ledger'), /bluffs/);
  // Last Call: a dice trick is asleep, on the table card's chips and at the table.
  await startNight(page, { seed: 'asleep', tricks: ['palm', 'sticky'] });
  await page.evaluate(() => { const S = Game.App.state; S.hour = 4; S.cash = 640; Game.UI.Screens.render(); });
  assert.ok(await page.isVisible('#screen-choose .trick[data-id="palm"][data-asleep]'));
  assert.match(await page.textContent('.tcard[data-kind="last"]'), /Bring what you’ve got, hon\./);
  assert.ok(await page.isVisible('#btn-walk'));
  await page.click('.tcard button.sit[data-i="0"]');
  assert.ok(await page.isVisible('.tricks .trick[data-id="palm"][data-asleep]'));
  assert.equal(await page.$('.tricks .trick[data-id="sticky"][data-asleep]'), null);
});

// ===================================================================== the Book
s.test('the Book: tallies after a reveal, kept across a reload, on the seat sheet, and inline for a habit seen before', async h => {
  const page = await open(h);
  await startNight(page, { seed: 'bookish' });
  await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'next' && v.table.last.readout.bids.some(b => b.habit !== null); } });
  const ro = await page.evaluate(() => Game.App.view().table.last.readout.bids.find(b => b.habit !== null));
  const n = await page.evaluate(r => Game.Book.data.people[r.id].habits[r.habit].n, ro);
  assert.ok(n >= 1);
  assert.match(await page.textContent('.sheet'), /What they had/);
  if (await page.$('#btn-had-more')) await page.click('#btn-had-more');
  assert.match((await page.$$eval(`.had-row[data-id="${ro.id}"]`, ns => ns.map(n => n.textContent))).join(' | '), /Book: seen \d+×/);
  // Only their bids, the challenged one first, then the bluffs; your own are left out.
  const had = await page.evaluate(() => { const ro = Game.App.view().table.last.readout.bids; return { ids: [...document.querySelectorAll('.had-row')].map(n => n.dataset.id), ro }; });
  assert.ok(!had.ids.includes('me'));
  assert.equal(had.ids.length, had.ro.filter(b => b.id !== 'me').length);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.equal(await page.evaluate(r => Game.Book.data.people[r.id].habits[r.habit].n, ro), n, 'kept across a reload');
  await page.click('#btn-continue');
  await page.click(`.seat[data-id="${ro.id}"]`);
  const sheet = await page.textContent('#dlg');
  assert.match(sheet, new RegExp(`${n}×: bluff \\d+, straight \\d+`));
  assert.match(sheet, /never says which habit is the tell/);
  await page.keyboard.press('Escape');
  // Inline: a habit the Book has seen before says so under the Count.
  await page.evaluate(() => { Game.App.speed = 0; });
  await playOut(page, { until: () => { const v = Game.App.view(); if (v.phase !== 'table' || v.table.wait !== 'turn' || !v.table.bid) return false; const h = v.table.history[v.table.history.length - 1].habit; const p = Game.Book.data.people[v.table.bid.id]; return !!h && !!p && p.habits[h.i].n > 1; } });
  const want = await page.evaluate(() => { const v = Game.App.view(); const h = v.table.history[v.table.history.length - 1].habit; const r = Game.Book.data.people[v.table.bid.id].habits[h.i]; return { text: h.text, n: r.n, bluff: r.bluff }; });
  const line = await page.textContent('#bookline');
  assert.ok(line.includes(want.text), line);
  assert.match(line, new RegExp(`seen ${want.n} times: ${want.bluff} bluffs?`));
  // The collection on the home screen: met faces named, the rest greyed and nameless.
  await page.evaluate(() => Game.App.home());
  await page.click('#btn-book');
  const grid = await page.evaluate(() => ({ met: document.querySelectorAll('.gface:not([data-unmet])').length, unmet: [...document.querySelectorAll('.gface[data-unmet] .nm')].map(x => x.textContent), total: document.querySelectorAll('.gface').length }));
  assert.equal(grid.total, 50);
  assert.ok(grid.met >= 2);
  assert.ok(grid.unmet.every(t => t === '?'));
});

// ===================================================================== daily, share, ledger
s.test('tonight\'s tables: the first finish is kept for the day, the share line copies, and the ledger counts the night', async h => {
  const page = await open(h);
  await page.evaluate(() => { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, played: true, speed: 1 })); });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(() => { Game.App.speed = 0; Game.App.now = () => new Date(2026, 10, 21, 21, 0, 0); Game.UI.Settings.tipsDone = true; Game.UI.Screens.home(); });
  assert.equal(await page.textContent('#btn-daily'), 'Tonight’s tables');
  await page.click('#btn-daily');
  assert.equal(await page.evaluate(() => Game.App.state.seed), 'daily:2026-11-21');
  await playOut(page);
  const r = await page.evaluate(() => ({ rec: Game.Ledger.data.daily['2026-11-21'], share: Game.Engine.shareLine(Game.App.state), cash: Game.App.state.cash, ending: Game.App.state.ending, L: Game.Ledger.data }));
  assert.ok(r.rec);
  assert.equal(r.rec.share, r.share);
  assert.match(r.share, /^Bones · 2026-11-21 · /);
  assert.equal(await page.textContent('#share-line'), r.share);
  await page.click('#btn-share');
  await page.waitForFunction(() => document.querySelector('#share-note').textContent !== '');
  assert.equal(await page.evaluate(() => Game.App.lastCopied), r.share);
  assert.match(await page.textContent('#share-note'), /Copied|Copy this/);
  assert.equal(r.L.nights, 1);
  assert.equal(r.L.best, r.cash);
  assert.equal(r.L.house, r.ending === 'house' ? 1 : 0);
  assert.match(await page.textContent('.gains'), /1 night in Lyman’s ledger/);
  // Home: played today, the result to copy, the ledger card.
  await page.click('#btn-home');
  assert.equal(await page.textContent('#btn-daily'), 'Tonight’s again');
  assert.match(await page.textContent('#daily-note'), /Replays don’t count/);
  assert.match(await page.textContent('#ledger-line'), /^1 night played · best night \$/);
  await page.click('#btn-share-daily');
  assert.equal(await page.evaluate(() => Game.App.lastCopied), r.share);
  // A replay that ends differently does not touch the day's record; the ledger counts it.
  await page.click('#btn-daily');
  await playOut(page);
  const after = await page.evaluate(() => Game.Ledger.data);
  assert.deepEqual(after.daily['2026-11-21'], r.rec);
  assert.equal(after.nights, 2);
  // Kept across a reload.
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.equal(await page.evaluate(() => Game.Ledger.data.nights), 2);
});

// ===================================================================== Claude
const finishNight = async (page, seed) => { await startNight(page, { seed }); await playOut(page); };
s.test('Pearl\'s column by Claude: the template at once, then Claude\'s; the request is the right model, headers and only the night\'s facts', async h => {
  const log = [];
  const page = await open(h, { route: standIn(log) });
  await page.evaluate(() => { localStorage.setItem('novatria.apiKey', 'sk-ant-test-key-1234'); });
  await finishNight(page, 'column-night');
  await page.waitForFunction(() => document.querySelector('#col-head').textContent === 'STAND-IN HEADLINE FOR THE NIGHT');
  assert.match(await page.textContent('#col-note'), /Written by Claude/);
  assert.equal(log.length, 1, 'one call: the column (no table talk at speed 0)');
  const { body, headers } = log[0];
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(headers['x-api-key'], 'sk-ant-test-key-1234');
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.equal(headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(body.messages.length, 1);
  assert.deepEqual(body.messages[0].content.map(c => c.text), [await page.evaluate(() => Game.Engine.columnFacts(Game.App.state))]);
  assert.deepEqual(body.output_config.format.schema.required, ['headline', 'body']);
  assert.match(body.system[0].text, /Pearl Gentry/);
  await page.click('#btn-copy-column');
  assert.match(await page.evaluate(() => Game.App.lastCopied), /^STAND-IN HEADLINE FOR THE NIGHT\n\nThe visitor sat down/);
});

s.test('a refused key and a failing API both leave Pearl\'s own column; no key, no call at all', async h => {
  for (const status of [401, 500]) {
    const log = [];
    const page = await open(h, { route: standIn(log, { status }) });
    await page.evaluate(() => { localStorage.setItem('novatria.apiKey', 'sk-ant-bad'); });
    await finishNight(page, 'refused-' + status);
    await page.waitForFunction(() => Game.UI.Column.state === 'failed');
    const tmpl = await page.evaluate(() => Game.Engine.column(Game.App.state).headline);
    assert.equal(await page.textContent('#col-head'), tmpl);
    if (status === 401) assert.match(await page.textContent('#col-note'), /refused the API key/);
    else assert.equal(await page.isVisible('#col-note'), false);
  }
  const log = [];
  const page = await open(h, { route: standIn(log) });
  await page.evaluate(() => { Game.App.speed = 0.01; Game.App.start({ seed: 'keyless', tips: false }); });
  await page.evaluate(() => { Game.App.speed = 0.01; });
  await playOut(page, { until: () => Game.App.state.phase !== 'table' });
  await page.evaluate(() => { Game.App.speed = 0; });
  await playOut(page);
  assert.equal(log.length, 0, 'no key: not a single request');
});

s.test('table talk: Claude\'s lines replace the barks when they land in time, and a late one is dropped', async h => {
  const log = [];
  let release; const gate = { p: null };
  const page = await open(h, { route: async route => {
    if (gate.p) await gate.p;
    return standIn(log, { talk: text => { const id = /The people's ids: (\w+) =/.exec(text)[1]; return [{ id, say: 'Well, would you look at that, friend. Stand-in talk.' }, { id: 'npc_nobody', say: 'Not at this table.' }]; } })(route);
  } });
  await page.evaluate(() => { localStorage.setItem('novatria.apiKey', 'sk-ant-talk'); });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await startNight(page, { seed: 'talky', speed: 0.01 });
  await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'next'; } });
  await page.waitForSelector('.bubble[data-by="claude"]');
  const said = await page.$$eval('.bubble[data-by="claude"]', ns => ns.map(n => n.textContent));
  assert.deepEqual(said, ['“Well, would you look at that, friend. Stand-in talk.”']);
  assert.equal(await page.$$eval('.bubble[data-kind="say"]:not([data-by])', ns => ns.length), 0, 'the barks are replaced');
  const talk = log.find(x => x.body.output_config.format.schema.required[0] === 'lines');
  assert.match(talk.body.messages[0].content[0].text, /called (Liar|Spot On) on .+ There were \d+\./);
  assert.match(talk.body.system[0].text, /table talk/);
  // Late: the answer arrives after the next round has started.
  gate.p = new Promise(r => { release = r; });
  const calls = log.length;
  await page.click('#btn-next');
  await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'next'; } });
  await page.waitForFunction(n => Game.UI.Talk.busy, calls);
  await page.click('#btn-next');
  await page.evaluate(() => Game.App.idle());
  release();
  await page.waitForFunction(() => !Game.UI.Talk.busy);
  assert.equal(await page.$('.bubble[data-by="claude"]'), null, 'dropped when late');
  assert.ok(await page.evaluate(() => Game.UI.Talk.dropped) >= 1);
});

// ===================================================================== the coach
s.test('the first night: Sit down deals you straight in at 9 PM; short coach tips, never in the way; the choice and its tip at 10 PM; "Skip the tips" sticks', async h => {
  const page = await open(h);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-sit');
  await page.evaluate(() => Game.App.idle());
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'table', 'no choose screen at 9 PM on a first night');
  assert.deepEqual(await page.evaluate(() => [Game.App.state.hour, Game.App.state.table.kind]), [0, 'easy']);
  assert.ok(await page.isVisible('#coach'));
  const tip = await page.textContent('#coach p');
  assert.ok(tip.split(/\s+/).length <= 20, tip);
  // The picker still works under it.
  if (await page.evaluate(() => Game.App.view().table.wait === 'turn')) assert.equal(await page.isEnabled('#btn-bid'), true);
  await page.click('#btn-tip-ok');
  // Play the first table, saying "Got it" to every tip, and keep what they said.
  const seen = () => { const c = document.querySelector('#coach'); if (c && !c.hidden) { (window.__tips = window.__tips || []).push([c.dataset.tip, c.querySelector('p').textContent]); document.querySelector('#btn-tip-ok').click(); } return Game.App.state.phase === 'choose' || Game.App.state.phase === 'over'; };
  const ph = await playOut(page, { until: seen });
  const tips = await page.evaluate(() => window.__tips || []);
  tips.forEach(([id, text]) => assert.ok(text.split(/\s+/).length <= 20, id + ': ' + text));
  const bh = tips.find(t => t[0] === 'bluffhabit');
  if (bh) assert.match(bh[1], /^[A-Z][a-z]+ .+, and was bluffing\. Your Book noted it\. Watch for it\.$/);
  const bt = tips.find(t => t[0] === 'booktally');
  if (bt) assert.equal(bt[1], 'Your Book remembers this habit. Weigh it against the Count.');
  assert.ok(bh || bt, 'a hook tip on the first night: ' + JSON.stringify(tips.map(t => t[0])));
  if (ph !== 'over' && await page.evaluate(() => Game.App.state.phase === 'choose')) {
    assert.equal(await page.evaluate(() => Game.App.state.hour), 1, 'the choice first appears at 10 PM');
    assert.match(await page.textContent('#first-hint'), /near table is cheaper and softer; the big one pays double/);
    assert.match(await page.textContent('#goal-line'), /^Last Call needs \$500 · you have \$[\d,]+$/);
  }
  // Every later night shows the choice at 9 PM.
  await page.evaluate(() => { Game.App.home(); Game.UI.Settings.tipsDone = false; });
  await page.evaluate(() => Game.App.start({ seed: 'second-night', first: false }));
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'choose');
  // "Skip the tips" sticks (a fresh player).
  const p2 = await open(h);
  await p2.evaluate(() => { Game.App.speed = 0; });
  await p2.click('#btn-sit');
  await p2.evaluate(() => Game.App.idle());
  assert.ok(await p2.isVisible('#coach'));
  await p2.click('#btn-tips-off');
  assert.equal(await p2.isVisible('#coach'), false);
  assert.equal(await p2.evaluate(() => JSON.parse(localStorage.getItem('novatria.bones.settings')).tipsDone), true);
  await p2.reload();
  await p2.waitForFunction(() => window.Game && Game.App);
  await p2.evaluate(() => { Game.App.speed = 0; Game.App.start({ seed: 'no-tips', tips: true }); });
  await p2.click('.tcard button.sit[data-i="0"]');
  await p2.evaluate(() => Game.App.idle());
  assert.equal(await p2.isVisible('#coach'), false, 'once off, off for good');
});

s.test('the coach: a tip about the people at the top sits at the foot, clear of their faces, cups and habit lines (390x780, 360x640)', async h => {
  for (const [width, height] of [[390, 780], [360, 640]]) {
    const page = await open(h, { viewport: { width, height } });
    // Only the tips about the seats and the bid, so the habit tip comes up on the first table.
    await page.evaluate(() => { Game.App.speed = 0; Game.UI.Settings.tipsSeen = ['dice', 'count', 'turn', 'spot']; Game.App.start({ seed: 'coach-place', tips: true, first: true }); });
    const until = () => {
      const c = document.querySelector('#coach');
      if (c && !c.hidden) {
        const r = n => { const b = n.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
        const seats = r(document.querySelector('#seats')), box = r(c);
        (window.__placed = window.__placed || []).push({ tip: c.dataset.tip, at: c.dataset.at, box, seats, overlap: box.t < seats.b && seats.t < box.b && box.l < seats.r && seats.l < box.r });
        document.querySelector('#btn-tip-ok').click();
      }
      return (window.__placed || []).some(p => p.tip === 'habit') || Game.App.state.phase !== 'table';
    };
    await playOut(page, { until });
    const placed = await page.evaluate(() => window.__placed || []);
    const habit = placed.find(p => p.tip === 'habit');
    assert.ok(habit, `the habit tip came up at ${width}x${height}: ` + JSON.stringify(placed.map(p => p.tip)));
    assert.equal(habit.at, 'bottom');
    assert.equal(habit.overlap, false, `the habit tip covers the seats at ${width}x${height}: ` + JSON.stringify(habit));
    assert.ok(habit.box.b <= height + 0.5 && habit.box.t > habit.seats.b, JSON.stringify(habit));
    placed.filter(p => ['habit', 'booktally', 'bluffhabit', 'bid'].includes(p.tip)).forEach(p => assert.equal(p.overlap, false, `${p.tip} at ${width}x${height}: ` + JSON.stringify(p)));
  }
});

s.test('the end of a table says what it did to your cash; the top bar holds a big stack at 360 px', async h => {
  const page = await open(h, { viewport: { width: 360, height: 640 } });
  await startNight(page, { seed: 'net-sheet' });
  await playOut(page, { until: () => !!Game.UI.after });
  const end = await page.evaluate(() => ({ e: Game.UI.after.e, big: document.querySelector('#end-net').firstChild.textContent, sign: document.querySelector('#end-net').dataset.sign, colour: getComputedStyle(document.querySelector('#end-net')).color }));
  const money = n => '$' + Math.abs(n).toLocaleString('en-US');
  assert.equal(end.big, (end.e.net > 0 ? '+' : end.e.net < 0 ? '−' : '') + money(end.e.net));
  assert.equal(end.sign, end.e.net > 0 ? 'up' : end.e.net < 0 ? 'down' : 'even');
  assert.match(await page.textContent('#end-net'), /at this table$/);
  // A big stack late in the night: nothing in the top bar clips or wraps.
  const bar = () => page.evaluate(() => {
    const scr = document.querySelector('.screen.active') || document.querySelector('#screen-' + Game.UI.Screens.cur);
    const top = scr.querySelector('.topbar'), hour = top.querySelector('.hour'), cash = top.querySelector('.cash');
    const vis = [...hour.children].find(c => getComputedStyle(c).display !== 'none') || hour;
    return { hour: vis.textContent, clipped: hour.scrollWidth > hour.clientWidth + 1, cashClipped: cash.scrollWidth > cash.clientWidth + 1, oneLine: top.getBoundingClientRect().height < 80, right: Math.max(...[...top.children].map(c => c.getBoundingClientRect().right)) <= window.innerWidth + 1, cash: cash.textContent };
  });
  for (const hr of [3, 4]) {
    await page.evaluate(hr => { const A = Game.App, S = A.state; if (Game.UI.after) A.leaveTable(); S.table = null; S.phase = 'choose'; S.hour = hr; S.cash = 12345; Game.UI.Screens.render(); }, hr);
    let b = await bar();
    assert.ok(!b.clipped && !b.cashClipped && b.oneLine && b.right && b.cash === '$12,345', 'choose at ' + hr + ': ' + JSON.stringify(b));
    await page.click('.tcard button.sit[data-i="0"]');
    await page.evaluate(() => Game.App.idle());
    b = await bar();
    assert.ok(!b.clipped && !b.cashClipped && b.oneLine && b.right, 'table at ' + hr + ': ' + JSON.stringify(b));
    assert.deepEqual(await overflowReport(page, 360), []);
  }
  await page.evaluate(() => { const S = Game.App.state; S.table = null; S.phase = 'shop'; S.hour = 3; S.cash = 12345; S.shop = { hour: 3, offers: ['loaded', 'mirror', 'nod'], rerolls: 0 }; Game.UI.Screens.render(); });
  const b = await bar();
  assert.ok(!b.clipped && !b.cashClipped && b.oneLine && b.right, 'back room: ' + JSON.stringify(b));
  assert.match(await page.textContent('#goal-line'), /^Last Call needs \$500 · you have \$12,345$/);
  assert.notEqual(await page.getAttribute('#goal-line', 'data-ok'), null);
});

// ===================================================================== layout
s.test('no horizontal overflow at 360, 375 and 430 on every screen, in both themes; nothing clipped at 390x640', async h => {
  for (const theme of ['dark', 'parchment']) {
    const page = await open(h, { viewport: { width: 360, height: 740 } });
    await page.evaluate(t => { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, theme: t, played: true })); }, theme);
    await page.reload();
    await page.waitForFunction(() => window.Game && Game.App);
    assert.equal(await page.getAttribute('html', 'data-theme'), theme);
    const check = async (where) => {
      for (const w of [360, 375, 430]) {
        await page.setViewportSize({ width: w, height: 740 });
        assert.deepEqual(await overflowReport(page, w), [], `${theme} ${where} at ${w}`);
      }
    };
    await check('home');
    await startNight(page, { seed: 'widths', tricks: ['nod', 'mirror', 'double'] });
    await check('choose');
    await playOut(page, { until: untilTurnWithBid });
    await check('table mid-turn');
    await page.setViewportSize({ width: 390, height: 640 });
    const clip = () => page.evaluate(() => {
      const bad = [], H = window.innerHeight, W = window.innerWidth;
      const vis = sel => document.querySelectorAll(sel).forEach(n => { const r = n.getBoundingClientRect(); if (r.width && (r.top < -1 || r.bottom > H + 1 || r.left < -1 || r.right > W + 1)) bad.push(`${sel} [${Math.round(r.top)},${Math.round(r.bottom)}]`); });
      ['#btn-liar', '#btn-spot', '#btn-bid', '.facebtn', '#q-plus', '#q-minus', '#mycup .die', '#bid .bid-word', '.seat', '#countbar', '.topbar .cash'].forEach(vis);
      const felt = document.querySelector('#felt');
      if (felt.scrollHeight > felt.clientHeight + 2) bad.push(`felt overflows ${felt.scrollHeight} > ${felt.clientHeight}`);
      const seats = document.querySelector('#seats').getBoundingClientRect(), fr = felt.getBoundingClientRect();
      if (seats.bottom > fr.top + 1) bad.push('seats run into the felt');
      return bad;
    });
    assert.deepEqual(await clip(), [], `${theme} table at 390x640`);
    await page.evaluate(() => Game.App.act({ t: 'liar' }));
    await page.evaluate(() => { if (Game.UI.after) Game.App.leaveTable(); });
    if (await page.evaluate(() => Game.App.state.phase === 'table')) {
      const sheet = await page.evaluate(() => { const b = document.querySelector('#btn-next').getBoundingClientRect(); return b.bottom <= window.innerHeight + 1 && b.top >= 0; });
      assert.ok(sheet, 'Next round is on screen at 390x640');
      const had = await page.evaluate(() => { const sh = document.querySelector('.sheet'); return { rows: sh.querySelectorAll('.had-row').length, fits: sh.scrollHeight <= sh.clientHeight + 1, mine: sh.querySelectorAll('.had-row[data-id="me"]').length }; });
      assert.ok(had.rows <= 4 && had.fits && !had.mine, 'what they had: theirs only, four rows at most, no scrolling: ' + JSON.stringify(had));
      await check('the reveal panel');
    }
    await playOut(page, { until: () => Game.App.state.phase === 'shop' && !Game.UI.after });
    await check('the back room');
    await page.evaluate(() => Game.UI.Screens.book());
    await check('the Book');
    await page.evaluate(() => Game.UI.Screens.render());
    await playOut(page);
    await check('the end of the night');
    await page.evaluate(() => Game.App.home());
    await check('home after a night');
  }
});

// ===================================================================== the practice hand
/* One step of the practice hand through its own buttons: Next when it stands there, else the one table button
   the step asks for (Bid or Liar!). lessonNow resolves when the lesson is waiting again (its next card, or the end sheet). */
const LESSON_STEPS = ['a', 'b', 'b2', 'c', 'c2', 'd', 'd2', 'd3', 'd4', 'e', 'e2', 'f'];
const lessonNow = page => page.evaluate(async () => { await Game.App.idle(); const L = Game.UI.Lesson; return { on: L.on, step: L.step, ready: L.ready, end: !!document.querySelector('#btn-lesson-real') }; });
async function lessonMove(page) {
  const now = await lessonNow(page);
  if (await page.isVisible('#btn-lesson-next')) await page.click('#btn-lesson-next');
  else if (await page.isEnabled('#btn-bid')) await page.click('#btn-bid');
  else await page.click('#btn-liar');
  return now;
}
/* What a step shows, for the layout checks: the line of teaching, what it rings, the button to press. */
const LESSON_LAYOUT = () => {
  const r = n => { const b = n.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, w: b.width, h: b.height }; };
  const meets = (a, b) => a.t < b.b - 0.5 && b.t < a.b - 0.5 && a.l < b.r - 0.5 && b.l < a.r - 0.5;
  const H = innerHeight, W = innerWidth, bad = [];
  const on = (sel, n) => { const x = r(n); if (x.w && (x.t < -1 || x.b > H + 1 || x.l < -1 || x.r > W + 1)) bad.push(`${sel} off screen [${Math.round(x.t)},${Math.round(x.b)}]`); return x; };
  const sheet = document.querySelector('.sheet');
  const card = sheet ? sheet.querySelector('.lesson-end') : document.querySelector('#lesson:not([hidden])');
  const text = card ? card.querySelector('p') : null;
  if (!text || !text.textContent.trim()) bad.push('no line of teaching');
  const box = card ? on('the lesson line', card) : null;
  if (text && text.scrollHeight > text.clientHeight + 1) bad.push('the lesson line is clipped');
  if (text && parseFloat(getComputedStyle(text).fontSize) < 14) bad.push('the lesson line is small');
  const pointed = [...document.querySelectorAll('#screen-table [data-point]')];
  pointed.forEach(n => { const x = on('pointed ' + (n.id || n.className), n); if (box && !sheet && meets(x, box)) bad.push(`the lesson line covers ${n.id || n.className}`); });
  ['#btn-lesson-next', '#btn-liar', '#btn-bid', '#btn-lesson-real', '#btn-lesson-back', '#btn-lesson-skip'].forEach(sel => { const n = document.querySelector(sel); if (n && n.offsetParent !== null && !n.disabled) { const x = on(sel, n); if (x.h < 43.5) bad.push(`${sel} is ${x.h}px tall`); } });
  // The table itself: nothing spills out of the felt, and the line of teaching sits clear of the cups, the bid and the Count.
  const felt = document.querySelector('#felt');
  if (felt.scrollHeight > felt.clientHeight + 2) bad.push(`felt overflows ${felt.scrollHeight} > ${felt.clientHeight}`);
  if (!sheet) document.querySelectorAll('#mycup .die, .seat .tray, .seat .habit, #bid .bid-word, #countbar, #bookline').forEach(n => { const x = r(n); if (x.w && box && meets(x, box)) bad.push('the lesson line covers ' + n.className); });
  // On the felt, top to bottom, nothing runs into the next thing: the bid (or the tally), the Count, the Book line, your cup.
  const bid = document.querySelector('#bid'), shown = bid.querySelector(bid.dataset.mode === 'count' ? '.bid-count' : '.bid-main');
  const parts = [['bid', shown]].concat([['countbar', document.querySelector('#countbar')], ['bookline', document.querySelector('#bookline > span')], ['cup', document.querySelector('#mycup .cupdice')], ['caption', document.querySelector('#mycup .cupcap')]])
    .filter(([, n]) => n && getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n.parentElement).visibility !== 'hidden').map(([k, n]) => [k, r(n)]).filter(([, x]) => x.w && x.h);
  parts.forEach(([k, x], i) => parts.slice(i + 1).forEach(([k2, y]) => { if (meets(x, y)) bad.push(`${k} runs into ${k2}`); }));
  return { bad, step: Game.UI.Lesson.step, pointed: pointed.map(n => n.id || n.className) };
};

s.test('first visit: "Learn it in a minute" is the primary, and #btn-sit ("Deal me in") still deals a real night', async h => {
  const page = await open(h);
  const home = await page.evaluate(() => ({ learn: document.querySelector('#btn-learn').className, learnText: document.querySelector('#btn-learn').textContent, sit: document.querySelector('#btn-sit').className, sitText: document.querySelector('#btn-sit').textContent, first: document.querySelector('.cta .btn').id, how: document.querySelector('#home-how').open, replay: !!document.querySelector('#btn-replay-lesson') }));
  assert.match(home.learn, /\bprimary\b/);
  assert.equal(home.learnText, 'Learn it in a minute');
  assert.doesNotMatch(home.sit, /\bprimary\b/);
  assert.equal(home.sitText, 'Deal me in');
  assert.equal(home.first, 'btn-learn', 'the practice hand comes first');
  assert.equal(home.how, true, 'How it works is open on a first visit');
  assert.equal(home.replay, false);
  // How it works leads with the one idea, then a worked example with real numbers, then the Count, tells and the Book, then the night.
  const how = await page.textContent('#home-how ol');
  assert.match(how, /^One idea\. .*A bid is a claim about all the dice on the table together\. Calling Liar! says the claim is false\..*whoever was wrong loses a die/);
  assert.match(how, /An example\. Nine dice on the table; you hold 3, 3 and 1\. Glenda bids “four 3s”/);
  assert.ok(how.indexOf('One idea') < how.indexOf('The Count') && how.indexOf('The Count') < how.indexOf('Tells and the Book') && how.indexOf('Tells and the Book') < how.indexOf('The night'));
  assert.match(how, /\$100.*\$500/);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-sit');
  await page.evaluate(() => Game.App.idle());
  const S = await page.evaluate(() => ({ cur: Game.UI.Screens.cur, phase: Game.App.state.phase, hour: Game.App.state.hour, lesson: !!Game.App.state.lesson, cash: Game.App.state.cash, coach: !document.querySelector('#coach').hidden, saved: !!localStorage.getItem('novatria.bones.night') }));
  assert.deepEqual(S, { cur: 'table', phase: 'table', hour: 0, lesson: false, cash: 80, coach: true, saved: true });
  assert.equal(await page.isVisible('#lesson'), false);
});

s.test('the practice hand through its own buttons at 390x780 and 360x640, in both themes: every step readable, nothing covered or clipped, no overflow', async h => {
  for (const theme of ['dark', 'parchment']) {
    for (const [width, height] of [[390, 780], [360, 640]]) {
      const page = await open(h, { viewport: { width, height } });
      await page.evaluate(t => { localStorage.setItem('novatria.bones.settings', JSON.stringify({ v: 1, theme: t })); }, theme);
      await page.reload();
      await page.waitForFunction(() => window.Game && Game.App);
      await page.evaluate(() => { Game.App.speed = 0; });
      assert.equal(await page.getAttribute('html', 'data-theme'), theme);
      await page.click('#btn-learn');
      const seen = [];
      for (let i = 0; i < 20; i++) {
        const now = await lessonNow(page);
        assert.ok(now.on && (now.ready || now.end), `${theme} ${width}x${height}: waiting at ${now.step}`);
        const lay = await page.evaluate(LESSON_LAYOUT);
        assert.deepEqual(lay.bad, [], `${theme} ${width}x${height} step ${lay.step}: ${JSON.stringify(lay)}`);
        assert.deepEqual(await overflowReport(page, width), [], `${theme} ${width}x${height} step ${now.step}`);
        assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'table');
        const words = (await page.evaluate(() => (document.querySelector('#lesson-text') || {}).textContent || '')).split(/\s+/).length;
        assert.ok(words <= 30, `${now.step}: ${words} words`);
        if (!now.end) assert.ok(await page.isVisible('#btn-lesson-skip'), 'Skip the lesson at every step');
        seen.push(now.step);
        if (now.end) break;
        await lessonMove(page);
      }
      assert.deepEqual(seen, LESSON_STEPS, `${theme} ${width}x${height}`);
    }
  }
});

s.test('the practice hand teaches what it says: at step B exactly the 3s and 1s are lit with a tally of five; the asked-for button is the only live one; the Count it quotes is the engine\'s', async h => {
  const page = await open(h);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-learn');
  const texts = {};
  const live = () => page.evaluate(() => [...document.querySelectorAll('#actions button')].filter(b => !b.disabled && b.offsetParent !== null).map(b => b.id || b.className));
  for (let i = 0; i < 20; i++) {
    const now = await lessonNow(page);
    texts[now.step] = await page.evaluate(() => (document.querySelector('#lesson-text') || {}).textContent || '');
    if (now.step === 'a') {
      // Every cup open: the others' dice face up, none down, which the game never shows outside a reveal.
      const cups = await page.evaluate(() => [...document.querySelectorAll('.seat')].map(s => ({ open: s.querySelector('.tray').hasAttribute('data-open'), faces: [...s.querySelectorAll('.tray .die')].map(d => +d.dataset.face) })));
      assert.deepEqual(cups, [{ open: true, faces: [3, 1, 6] }, { open: true, faces: [2, 5, 4] }]);
      assert.equal(await page.evaluate(() => document.querySelectorAll('.seat .tray .die[data-down]').length), 0);
      assert.equal(await page.getAttribute('#mycup', 'data-faces'), '3,3,1');
      assert.deepEqual(await page.evaluate(() => Game.Engine.view(Game.App.state).table.cups), [[3, 3, 1], [3, 1, 6], [2, 5, 4]]);
    }
    if (now.step === 'b') assert.match(await page.getAttribute('#bid', 'aria-label'), /four 3s, bid by Glenda/);
    if (now.step === 'b2') {
      const lit = await page.evaluate(() => {
        const cup = n => [...n.querySelectorAll('.die')].filter(d => !d.hasAttribute('data-empty')).map(d => ({ f: +d.dataset.face, hit: d.hasAttribute('data-hit'), dim: d.hasAttribute('data-dim') }));
        return { seats: [...document.querySelectorAll('.seat .tray')].map(cup), mine: cup(document.querySelector('#mycup .cupdice')), tally: document.querySelector('#bid .count-num').textContent, mode: document.querySelector('#bid').dataset.mode, tallied: document.querySelector('#bid').dataset.tally };
      });
      const all = lit.seats.flat().concat(lit.mine);
      assert.equal(all.length, 9);
      all.forEach(d => assert.equal(d.hit, d.f === 3 || d.f === 1, JSON.stringify(d)));
      all.filter(d => !d.hit).forEach(d => assert.ok(d.dim, 'the rest dimmed: ' + JSON.stringify(d)));
      assert.equal(all.filter(d => d.hit).length, 5);
      assert.deepEqual([lit.tally, lit.tallied, lit.mode], ['5', '5', 'count']);
      assert.match(texts.b2, /five/);
    }
    if (now.step === 'c' || now.step === 'd4') {
      assert.deepEqual(await live(), ['btn-liar'], now.step);
      assert.ok(await page.evaluate(() => document.querySelector('#btn-liar').hasAttribute('data-point')));
    }
    if (now.step === 'd3') {
      assert.deepEqual(await live(), ['btn-bid'], 'only Bid');
      assert.deepEqual(await page.evaluate(() => [Game.UI.Picker.q, Game.UI.Picker.f, document.querySelector('#q-val').textContent]), [4, 5, '4']);
    }
    if (['a', 'b', 'b2', 'c2', 'd', 'd2', 'e', 'e2'].includes(now.step)) {
      assert.deepEqual(await live(), ['btn-lesson-next'], now.step);
      assert.equal(await page.isVisible('#btn-liar'), false, 'Next stands where the calls are');
    }
    if (now.step === 'd2' || now.step === 'd3' || now.step === 'd4') {
      const c = await page.evaluate(() => { const S = Game.App.state, b = Game.Engine.view(S).table.bid; return { engine: Game.Engine.count(S, b.q, b.f), q: b.q, f: b.f, shown: +document.querySelector('#countbar').dataset.count, label: document.querySelector('#countbar .lbl b').textContent }; });
      assert.equal(c.shown, Math.round(c.engine * 100), now.step);
      const pct = c.engine > 0 && c.engine < 0.005 ? '<1%' : c.engine < 1 && c.engine > 0.995 ? '>99%' : Math.round(c.engine * 100) + '%';
      assert.equal(c.label, pct);
      if (now.step !== 'd2') assert.ok(texts[now.step].includes(pct), `${now.step} quotes ${pct}: ${texts[now.step]}`);
      if (now.step === 'd3') { assert.deepEqual([c.q, c.f], [2, 5]); assert.ok(c.engine >= 0.9, 'clearly high'); }
      if (now.step === 'd4') { assert.deepEqual([c.q, c.f], [7, 5]); assert.ok(c.engine <= 0.15, 'clearly low'); }
    }
    if (now.step === 'd4') {
      // A move the step did not ask for changes nothing (a key, or a call sent past the dead buttons).
      const before = await page.evaluate(() => JSON.stringify(Game.App.state));
      await page.keyboard.press('s');
      await page.evaluate(() => Game.App.act({ t: 'spot' }));
      await page.evaluate(() => Game.App.act({ t: 'bid', q: 8, f: 5 }));
      assert.equal(await page.evaluate(() => JSON.stringify(Game.App.state)), before);
      assert.deepEqual(await live(), ['btn-liar'], 'still only Liar');
    }
    if (now.step === 'e') {
      const hb = await page.evaluate(() => { const s = document.querySelector('.seat[data-id="npc_gerald"] .habit'); return { text: s.textContent, ring: s.hasAttribute('data-point') }; });
      assert.deepEqual(hb, { text: 'turns down the scanner', ring: true });
      assert.match(texts.e, /only four/);
    }
    if (now.step === 'e2') assert.match(await page.textContent('#bookline'), /Gerald turns down the scanner · seen 1 time: 1 bluff, 0 straight/);
    if (now.end) break;
    await lessonMove(page);
  }
  assert.ok(await page.isVisible('#btn-lesson-real'));
  assert.ok(await page.isVisible('#btn-lesson-back'));
  assert.match(await page.textContent('.sheet .lesson-end'), /That’s the whole game.*Count low: think Liar\. Otherwise raise\..*\$100.*\$500 by Last Call/);
});

s.test('the practice hand touches nothing: cash, the Book, the ledger and a saved night are as they were, finished or skipped; then home says Sit down, and Sit down for real deals a normal night', async h => {
  // A player with a night in progress and a Book.
  const page = await open(h);
  await startNight(page, { seed: 'before-lesson' });
  await playOut(page, { until: () => { const v = Game.App.view(); return v.phase === 'table' && v.table.wait === 'turn' && v.table.history.length >= 2 && !!Game.Book.data; } });
  await page.evaluate(() => Game.App.home());
  const keys = ['novatria.bones.night', 'novatria.bones.book', 'novatria.bones.ledger'];
  const snap = () => page.evaluate(k => k.map(x => localStorage.getItem(x)).concat([JSON.stringify(Game.Book.data), JSON.stringify(Game.Ledger.data)]), keys);
  const before = await snap();
  assert.ok(before[0] && before[1], 'a saved night and a Book to keep');
  const savedS = JSON.stringify(JSON.parse(before[0]).S);
  // Finished, from How it works.
  await page.click('#home-how summary');
  await page.click('#btn-replay-lesson');
  await page.evaluate(() => { Game.App.speed = 0; });
  for (let i = 0; i < 20 && !(await lessonNow(page)).end; i++) await lessonMove(page);
  assert.ok((await lessonNow(page)).end);
  assert.deepEqual(await snap(), before, 'nothing kept from a finished lesson');
  await page.click('#btn-lesson-back');
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'home');
  await page.click('#btn-continue');
  assert.equal(await page.evaluate(() => JSON.stringify(Game.App.state)), savedS, 'the night picks up exactly where it was');
  assert.equal(await page.textContent('#cash'), '$' + JSON.parse(savedS).cash);
  // Skipped halfway, from the table menu of that night.
  await page.click('#btn-menu');
  await page.click('#btn-menu-lesson');
  await page.evaluate(() => Game.App.idle());
  for (let i = 0; i < 4; i++) await lessonMove(page);
  assert.equal((await lessonNow(page)).step, 'c2');
  await page.click('#btn-lesson-skip');
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'home');
  assert.deepEqual(await snap(), before, 'nothing kept from a skipped lesson');
  // A new player: finish it, and home offers Sit down; skip it (another new player), the same.
  for (const how of ['finish', 'skip']) {
    const p2 = await open(h);
    await p2.evaluate(() => { Game.App.speed = 0; });
    const fresh = await p2.evaluate(k => k.map(x => localStorage.getItem(x)), keys);
    await p2.click('#btn-learn');
    if (how === 'finish') { for (let i = 0; i < 20 && !(await lessonNow(p2)).end; i++) await lessonMove(p2); await p2.click('#btn-lesson-back'); }
    else { await lessonMove(p2); await p2.click('#btn-lesson-skip'); }
    assert.deepEqual(await p2.evaluate(k => k.map(x => localStorage.getItem(x)), keys), fresh, how);
    assert.equal(await p2.evaluate(() => JSON.parse(localStorage.getItem('novatria.bones.settings')).lesson), how === 'finish' ? 'done' : 'skipped');
    const home = await p2.evaluate(() => ({ cur: Game.UI.Screens.cur, learn: !!document.querySelector('#btn-learn'), sit: document.querySelector('#btn-sit').className, text: document.querySelector('#btn-sit').textContent, first: document.querySelector('.cta .btn').id, replay: !!document.querySelector('#btn-replay-lesson') }));
    assert.deepEqual(home, { cur: 'home', learn: false, sit: 'btn primary big', text: 'Sit down', first: 'btn-sit', replay: true }, how);
    await p2.reload();
    await p2.waitForFunction(() => window.Game && Game.App);
    assert.equal(await p2.evaluate(() => document.querySelector('.cta .btn').id), 'btn-sit', 'and across a reload');
  }
  // "Sit down for real" at the end of the lesson: a normal first night, dealt straight in at 9 PM.
  const p3 = await open(h);
  await p3.evaluate(() => { Game.App.speed = 0; });
  await p3.click('#btn-learn');
  for (let i = 0; i < 20 && !(await lessonNow(p3)).end; i++) await lessonMove(p3);
  await p3.click('#btn-lesson-real');
  await p3.evaluate(() => Game.App.idle());
  const real = await p3.evaluate(() => { const S = Game.App.state; return { lesson: !!S.lesson, seed: S.seed, phase: S.phase, hour: S.hour, kind: S.table.kind, cash: S.cash, attr: document.querySelector('#screen-table').hasAttribute('data-lesson'), cashShown: getComputedStyle(document.querySelector('#cash')).display !== 'none', on: Game.UI.Lesson.on, saved: !!localStorage.getItem('novatria.bones.night'), hourText: document.querySelector('#t-hour').textContent }; });
  assert.equal(real.lesson, false);
  assert.notEqual(real.seed, 'lesson');
  assert.deepEqual([real.phase, real.hour, real.kind, real.cash, real.attr, real.cashShown, real.on, real.saved], ['table', 0, 'easy', 80, false, true, false, true]);
  assert.match(real.hourText, /9 PM/);
  assert.equal(await p3.evaluate(() => Game.Engine.view(Game.App.state).table.cups), null, 'no open cups in a real night');
  assert.deepEqual(await p3.evaluate(CHECK), []);
  await playOut(p3, { check: true, until: () => Game.App.state.phase !== 'table' });
});

s.test('a reload mid-lesson lands on the home screen, clean; leaving by the menu does too', async h => {
  const page = await open(h);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-learn');
  for (let i = 0; i < 6; i++) await lessonMove(page);
  assert.equal((await lessonNow(page)).step, 'd2');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  const home = await page.evaluate(() => ({ cur: Game.UI.Screens.cur, state: Game.App.state, learn: !!document.querySelector('#btn-learn'), cont: !!document.querySelector('#btn-continue'), night: localStorage.getItem('novatria.bones.night'), book: localStorage.getItem('novatria.bones.book'), on: Game.UI.Lesson.on, attr: document.querySelector('#screen-table').hasAttribute('data-lesson') }));
  assert.deepEqual(home, { cur: 'home', state: null, learn: true, cont: false, night: null, book: null, on: false, attr: false });
  // The menu's way out, mid-animation.
  await page.evaluate(() => { Game.App.speed = 1; });
  await page.click('#btn-learn');
  await page.waitForFunction(() => Game.UI.Lesson.ready);
  await page.click('#btn-lesson-next');
  await page.click('#btn-menu');
  assert.equal(await page.textContent('#btn-leave-table'), 'Leave the lesson');
  await page.click('#btn-leave-table');
  await page.evaluate(() => Game.App.idle());
  assert.deepEqual(await page.evaluate(() => ({ cur: Game.UI.Screens.cur, state: Game.App.state, on: Game.UI.Lesson.on, learn: !!document.querySelector('#btn-learn') })), { cur: 'home', state: null, on: false, learn: true });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => Game.UI.Screens.cur), 'home', 'nothing of the lesson plays on behind the home screen');
});

s.test('the coach after a finished practice hand skips what it taught (your dice, a bid, your move, the Count) and keeps the rest; after a skipped one it is as before', async h => {
  const page = await open(h);
  await page.evaluate(() => { Game.App.speed = 0; });
  await page.click('#btn-learn');
  for (let i = 0; i < 20 && !(await lessonNow(page)).end; i++) await lessonMove(page);
  await page.click('#btn-lesson-real');
  await page.evaluate(() => Game.App.idle());
  const seen = () => { const c = document.querySelector('#coach'); if (c && !c.hidden) { (window.__tips = window.__tips || []).push(c.dataset.tip); document.querySelector('#btn-tip-ok').click(); } return Game.App.state.phase !== 'table'; };
  await playOut(page, { until: seen });
  const tips = await page.evaluate(() => window.__tips || []);
  ['dice', 'bid', 'turn', 'count'].forEach(id => assert.ok(!tips.includes(id), `${id} not repeated: ${tips}`));
  assert.ok(tips.includes('habit'), 'the habits tip is kept: ' + tips);
  if (await page.evaluate(() => Game.App.state.phase === 'choose')) assert.match(await page.textContent('#first-hint'), /near table is cheaper and softer/);
  // Skipped: the coach starts as it always has, with your dice.
  const p2 = await open(h);
  await p2.evaluate(() => { Game.App.speed = 0; });
  await p2.click('#btn-learn');
  await p2.click('#btn-lesson-skip');
  await p2.click('#btn-sit');
  await p2.evaluate(() => Game.App.idle());
  assert.equal(await p2.getAttribute('#coach', 'data-tip'), 'dice');
});

s.run();
