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
s.test('the page stands alone: from file:// with the network shut, no page errors, the first screen sells it with one button', async h => {
  const asked = [];
  const page = await open(h, { route: route => { const u = route.request().url(); if (/^(file|blob|data):/.test(u)) return route.continue(); asked.push(u); return route.abort(); } });
  assert.equal(await page.title(), 'Bones');
  assert.equal(await page.textContent('#home-title'), 'Bones');
  assert.match(await page.textContent('.tagline'), /The math says one thing\. Their face says another\./);
  assert.ok(await page.isVisible('#btn-sit'), 'first visit: one big Sit down');
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
  assert.equal(d1.slow, true);
  assert.equal(d1.dice[0], d0[0], 'the die kept stays');
  assert.equal(d1.shown, d1.dice.join(','));
  // Palm: the last die to a 6 (any face would do).
  await playOut(page, usable('palm'));
  const n = await page.evaluate(() => Game.App.view().table.myDice.length);
  await page.click('.tricks .trick[data-id="palm"]');
  assert.equal(await page.isDisabled('#btn-use'), true);
  await page.click(`dialog .picks button[data-i="${n - 1}"]`);
  await page.click('dialog .picks button[data-f="6"]');
  await page.click('#btn-use');
  await page.evaluate(() => Game.App.idle());
  assert.equal(await page.evaluate(() => Game.App.view().table.myDice.slice(-1)[0]), 6);
  assert.equal(await page.evaluate(() => Game.Engine.legal(Game.App.state).uses.includes('palm')), false, 'once a table');
  // Loretta's Nod: the truth about the bid in front of you.
  await playOut(page, usable('nod'));
  await page.click('.tricks .trick[data-id="nod"]');
  await page.click('#btn-use');
  await page.evaluate(() => Game.App.idle());
  const nod = await page.evaluate(() => Game.App.view().table.nod);
  assert.ok(nod);
  assert.match(await page.textContent('#infoline'), nod.truth ? /Loretta nods/ : /Loretta shakes her head/);
  // Double or Nothing: the Liar button offers "for two".
  await playOut(page, { until: untilTurnWithBid });
  assert.ok(await page.isVisible('#btn-liar2'));
  await page.click('#btn-liar2');
  await page.evaluate(() => Game.App.idle());
  const loss = await page.evaluate(() => Game.UI.TV.lastLoss);
  const rule = await page.evaluate(() => Game.UI.TV.rule && Game.UI.TV.rule.id);
  assert.ok(loss.length && loss.some(l => l.n >= (rule === 'sudden' ? 3 : 2) || l.left === 0), JSON.stringify(loss));
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

s.run();
