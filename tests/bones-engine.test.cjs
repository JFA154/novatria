#!/usr/bin/env node
'use strict';
/* Bones engine tests: Node only, no browser. Extracts the engine block from
   index.html by its markers, runs it in vm, and checks the rules exactly.
   Most rule tests rig a table: S is plain JSON, so a test can set the cups and
   the bids in front of you, then act and read the events.
   Usage: node tests/bones-engine.test.cjs   (or node tests/run.cjs bones-engine) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const BEGIN = '/* ==BONES:ENGINE:BEGIN== */', END = '/* ==BONES:ENGINE:END== */';
const BLOCK = HTML.slice(HTML.indexOf(BEGIN), HTML.indexOf(END) + END.length);
function loadEngine() { const ctx = vm.createContext({}); vm.runInContext(BLOCK, ctx, { filename: 'bones-engine.js' }); return ctx.Game.Engine; }
const E = loadEngine();
const SIM = E._sim;

// ----- a tiny runner -----
const tests = [];
const test = (title, fn) => tests.push({ title, fn });
function runAll() {
  const only = process.env.TEST_FILTER ? new RegExp(process.env.TEST_FILTER, 'i') : null;
  let passed = 0, failed = 0;
  console.log('bones-engine');
  for (const t of tests) {
    if (only && !only.test(t.title)) continue;
    const t0 = Date.now();
    try { t.fn(); passed++; console.log(`  PASS  ${t.title} (${Date.now() - t0} ms)`); }
    catch (err) { failed++; console.log(`  FAIL  ${t.title}\n        ${String((err && err.stack) || err).split('\n').slice(0, 6).join('\n        ')}`); }
  }
  console.log(`RESULT bones-engine: passed=${passed} failed=${failed}`);
  process.exit(failed ? 1 : 0);
}

// ----- helpers -----
const J = o => JSON.parse(JSON.stringify(o));
// Objects built inside the vm have another Object.prototype: compare plain copies.
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const ndeq = (a, b, m) => assert.notDeepStrictEqual(J(a), J(b), m);
const find = (ev, t, pred) => ev.find(e => e.t === t && (!pred || pred(e)));
const all = (ev, t) => ev.filter(e => e.t === t);
const pays = (ev, why) => all(ev, 'pay').filter(e => !why || e.why === why);
const ok = ev => { assert.ok(!ev.length || ev[0].t !== 'error', 'unexpected error: ' + JSON.stringify(ev[0])); return ev; };
const isErr = ev => ev.length === 1 && ev[0].t === 'error';

// Sit a custom table and put it at your turn with the given cups and bids.
function rig(o) {
  o = o || {};
  const S = E.newNight({ seed: o.seed || 'rig', tricks: o.tricks || [], book: o.book });
  const people = o.people || ['npc_colt', 'npc_dewayne'];
  if (o.hour === 4) { S.hour = 4; S.cash = o.cash != null ? o.cash : 600; }
  else { S.offers[0][0] = { kind: 'easy', hour: 0, seats: people.length + 1, buyIn: o.buyIn || 20, rule: o.rule || null, people }; S.cash = 1e6; }
  ok(E.act(S, { t: 'sit', i: 0 }));
  if (o.hour !== 4) S.cash = o.cash != null ? o.cash : 1000; // cash in hand once seated
  if (o.dice) arm(S, o);
  return S;
}
function arm(S, o) {
  const T = S.table;
  o.dice.forEach((d, k) => { T.seats[k].dice = d.slice(); T.seats[k].n = d.length; T.seats[k].out = d.length === 0; });
  if (o.start) T.start = o.start.slice();
  T.round = { no: T.roundNo, opener: o.opener || 0, turn: 0, bids: (o.bids || []).map(b => ({ who: b.who, q: b.q, f: b.f, p: 0.5, held: 0, bluff: false, habit: null })), blindSeat: -1, looked: false, peek: o.peek || [], ones: o.ones != null ? o.ones : null, nod: null, slow: 0, hot: false, fixed: o.fixed || [], pinned: {}, loaded: o.loaded != null ? o.loaded : null };
  if (o.loaded != null) T.round.pinned[o.loaded] = 6;
  T.wait = 'turn';
  return S;
}
// Play a table (from wherever it stands) to its end with a policy.
function finishTable(S, policy) {
  for (let g = 0; S.phase === 'table'; g++) { if (g > 5000) throw new Error('table did not end'); ok(E.act(S, (policy || E.basicPolicy)(S, E.view(S), E.legal(S), E))); }
}
const binom = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1); return c; };

// ===================================================================== static
test('the engine block is marked, strict, and free of browser APIs and unseeded time/randomness', () => {
  assert.ok(HTML.includes(BEGIN) && HTML.includes(END));
  assert.ok(/^\/\* ==BONES:ENGINE:BEGIN== \*\/$/m.test(HTML) && /^\/\* ==BONES:ENGINE:END== \*\/$/m.test(HTML), 'markers on their own lines');
  const bad = /window|document|localStorage|Math\.random|Date\.now|innerHTML|fetch/.exec(BLOCK);
  assert.strictEqual(bad, null, 'found ' + (bad && bad[0]));
  assert.ok(BLOCK.includes("'use strict'"));
  // One plain script, and the page's CSP: lockin.html's, plus Bones' own manifest, offline worker and home-screen icon.
  const scripts = HTML.match(/<script[^>]*>/g);
  deq(scripts, ['<script>']);
  assert.ok(HTML.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://api.anthropic.com; img-src 'self' data: blob:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'">`), 'the exact CSP');
  assert.ok(/<html lang="en" data-theme="dark">/.test(HTML) && /<title>Bones<\/title>/.test(HTML));
});

test('the engine attaches only Game.Engine', () => {
  const ctx = vm.createContext({});
  vm.runInContext(BLOCK, ctx);
  deq(Object.keys(ctx), ['Game']);
  deq(Object.keys(ctx.Game), ['Engine']);
  assert.strictEqual(typeof ctx.Game.Engine.newNight, 'function');
});

test('fifty people with exact cast fields, 3 habits, valid params, tier spread 14/16/12/7/1', () => {
  assert.strictEqual(E.PEOPLE.length, 50);
  const idx = fs.readFileSync(path.resolve(__dirname, '..', 'lockin.html'), 'utf8');
  const cast = JSON.parse(idx.match(/<script type="application\/json" id="cast">([\s\S]*?)<\/script>/)[1]);
  const extra = vm.runInNewContext(idx.match(/const EXTRA_CAST = (\[[\s\S]*?\n  \]);/)[1]);
  const src = cast.concat(extra);
  const tiers = {};
  src.forEach(c => {
    const p = E.PEOPLE.find(x => x.id === c.id);
    assert.ok(p, c.id);
    for (const k of ['name', 'age', 'pronouns', 'look']) assert.strictEqual(p[k], c[k], c.id + '.' + k);
    assert.strictEqual(p.habits.length, 3);
    const s = SIM.person(c.id);
    tiers[s.tier] = (tiers[s.tier] || 0) + 1;
    assert.ok(s.bluff >= 0.05 && s.bluff <= 0.5 && s.nerve > 0 && s.nerve < 1 && s.skill >= 0 && s.skill <= 1 && s.spot >= 0 && s.spot <= 1 && s.tilt >= -1 && s.tilt <= 1, c.id);
    assert.ok([0, 1, 2].includes(s.tell) && ['bluff', 'strong'].includes(s.kind), c.id);
    // PEOPLE carries no hidden fields.
    for (const k of ['tier', 'bluff', 'nerve', 'skill', 'spot', 'tilt', 'tell', 'kind', 'style']) assert.ok(!(k in p), c.id + ' leaks ' + k);
  });
  deq(tiers, { 1: 14, 2: 16, 3: 12, 4: 7, 5: 1 });
  assert.strictEqual(SIM.person('npc_loretta').tier, 5);
  assert.strictEqual(SIM.person('npc_loretta').kind, 'strong');
  const bl = E.PEOPLE.map(p => SIM.person(p.id).bluff);
  assert.ok(Math.max(...bl) >= 0.45 && Math.min(...bl) <= 0.08, 'bluff varies a lot');
  assert.strictEqual(E.TRICKS.length, 24);
  assert.strictEqual(E.HOUSE_RULES.length, 7);
});

// ===================================================================== determinism
test('same seed and same actions give the same night, byte for byte', () => {
  for (const seed of ['a', 'b', 42]) {
    const a = E.playNight(seed, null, { keepEvents: true }), b = E.playNight(seed, null, { keepEvents: true });
    assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.strictEqual(JSON.stringify(a.S), JSON.stringify(b.S));
  }
  const c = E.playNight('a', null, { keepEvents: true }), d = E.playNight('b', null, { keepEvents: true });
  assert.notStrictEqual(JSON.stringify(c.events), JSON.stringify(d.events));
});

test('the state survives a JSON round-trip mid-round and plays on identically', () => {
  let checked = 0;
  for (let i = 0; i < 20; i++) {
    const S = E.newNight({ seed: 'rt' + i, tricks: ['mirror', 'barmirror', 'nod', 'slowroll', 'palm'] });
    let k = 0;
    while (S.phase !== 'over' && !(S.phase === 'table' && S.table.wait === 'turn' && S.table.round.bids.length && ++k > 7)) ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S))));
    if (S.phase === 'over') continue;
    const copy = JSON.parse(JSON.stringify(S));
    const evA = [], evB = [];
    while (S.phase !== 'over') evA.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S)))));
    while (copy.phase !== 'over') evB.push(...ok(E.act(copy, E.basicPolicy(copy, E.view(copy), E.legal(copy)))));
    assert.strictEqual(JSON.stringify(evA), JSON.stringify(evB));
    assert.strictEqual(JSON.stringify(S), JSON.stringify(copy));
    checked++;
  }
  assert.ok(checked >= 10);
});

test('every batch ends with a wait at a state where the human must act (or the phase changed)', () => {
  for (let i = 0; i < 30; i++) {
    const S = E.newNight({ seed: 'w' + i, tricks: i % 2 ? ['slowroll'] : i % 4 === 2 ? ['sidebet', 'loaded'] : [] });
    while (S.phase !== 'over') {
      const ev = ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S))));
      const last = ev[ev.length - 1];
      assert.strictEqual(last.t, 'wait');
      assert.strictEqual(last.need, E.legal(S).need);
      assert.ok(['turn', 'ready', 'side', 'next', 'choose', 'shop', 'over'].includes(last.need));
      deq(E.advance(S), [{ t: 'wait', need: last.need }], 'nothing pending');
    }
  }
});

// ===================================================================== the view
test('the view never shows other cups, hidden parameters or which habit is a tell', () => {
  let n = 0;
  for (let i = 0; i < 40; i++) {
    const tricks = i % 3 === 0 ? ['mirror', 'cornered'] : [];
    const S = E.newNight({ seed: 'leak' + i, tricks });
    if (i % 4 === 1) S.offers[0][0].rule = 'open';
    while (S.phase !== 'over') {
      if (S.phase === 'table' && S.table.wait === 'turn') {
        const v = E.view(S), str = JSON.stringify(v);
        for (const k of ['"nerve"', '"skill"', '"tilt"', '"tier"', '"tell"', '"style"', '"bluff"', '"held"', '"rng"', '"seen"', '"prior"', '"pinned"']) assert.ok(!str.includes(k), 'view has ' + k);
        v.table.history.forEach(h => { if (h.habit) assert.strictEqual(h.habit.underline, false); });
        // Shuffle every die the human cannot see: the view must not change.
        const T2 = J(S);
        const R = T2.table.round;
        T2.table.seats.forEach((s, k) => {
          if (k === 0) return;
          s.dice = s.dice.map((d, j) => (T2.table.rule === 'open' && j === 0) || R.peek.some(p => p.seat === k && p.i === j) ? d : 1 + ((d + j + k) % 6));
        });
        const v2 = E.view(T2);
        delete v.table.count; delete v2.table.count; // the Count reads only known dice, but compare the rest strictly
        assert.strictEqual(JSON.stringify(v2), JSON.stringify(v));
        assert.strictEqual(E.view(T2).table.count, E.view(S).table.count);
        n++;
      }
      ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S))));
    }
  }
  assert.ok(n > 300, 'checked ' + n);
});

// ===================================================================== challenges
test('Liar, right: the bidder loses a die and pays you an ante', () => {
  const S = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  const ev = ok(E.act(S, { t: 'liar' }));
  const r = find(ev, 'reveal');
  assert.strictEqual(r.count, 2); assert.strictEqual(r.good, false);
  deq(find(ev, 'lose'), { t: 'lose', who: 2, id: 'npc_dewayne', n: 1, left: 1 });
  deq(pays(ev).map(p => [p.amount, p.why]), [[3, 'won']]);
  assert.strictEqual(S.streak, 1); assert.strictEqual(S.table.nextOpener, 2); assert.strictEqual(S.table.wait, 'next');
});

test('Liar, wrong: you lose a die and pay an ante; you open next', () => {
  const S = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  const ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'reveal').good, true);
  deq(find(ev, 'lose'), { t: 'lose', who: 0, id: 'me', n: 1, left: 1 });
  deq(pays(ev).map(p => [p.amount, p.why]), [[-3, 'lost']]);
  assert.strictEqual(S.cash, 997); assert.strictEqual(S.streak, 0); assert.strictEqual(S.table.nextOpener, 0);
});

test('ones are wild; under Straight they are not, and 1 may be bid', () => {
  let S = rig({ dice: [[1, 3], [4, 1], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  let ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'reveal').count, 3); assert.strictEqual(find(ev, 'reveal').wild, true);
  S = rig({ rule: 'straight', dice: [[1, 3], [4, 1], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'reveal').count, 1); assert.strictEqual(find(ev, 'reveal').wild, false);
  S = rig({ rule: 'straight', dice: [[1, 3], [4, 1], [5, 6]], bids: [] });
  deq(E.legal(S).faces, [1, 2, 3, 4, 5, 6]);
  deq(E.legal(S).minBid, { q: 1, f: 1 });
  assert.ok(E.isLegalBid(S, 2, 1));
  ok(E.act(S, { t: 'bid', q: 2, f: 1 }));
  S = rig({ dice: [[1, 3], [4, 1], [5, 6]], bids: [] });
  assert.ok(!E.isLegalBid(S, 2, 1), 'no bidding ones when they are wild');
});

test('Spot on, right: win a die back (never above the start), paid 3 antes; wrong: lose a die', () => {
  let S = rig({ dice: [[2, 3], [4, 4], [4, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  let ev = ok(E.act(S, { t: 'spot' }));
  assert.strictEqual(find(ev, 'reveal').exact, true);
  deq(find(ev, 'gain'), { t: 'gain', who: 0, id: 'me', left: 3 });
  deq(pays(ev).map(p => [p.amount, p.why]), [[9, 'spot']]);
  assert.ok(!find(ev, 'lose'), 'nobody else is affected');
  S = rig({ dice: [[2, 3, 3, 3, 3], [4, 4], [4, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  ev = ok(E.act(S, { t: 'spot' }));
  assert.strictEqual(find(ev, 'gain').left, 5, 'capped at the starting count');
  S = rig({ dice: [[2, 3], [4, 4], [4, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'spot' }));
  assert.strictEqual(find(ev, 'reveal').exact, false);
  deq(find(ev, 'lose'), { t: 'lose', who: 0, id: 'me', n: 1, left: 1 });
  deq(pays(ev).map(p => [p.amount, p.why]), [[-3, 'lost']]);
});

test('raise legality: higher q any face, or same q higher face; never above the dice on the table', () => {
  const S = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  assert.ok(E.isLegalBid(S, 3, 5)); assert.ok(E.isLegalBid(S, 4, 2)); assert.ok(E.isLegalBid(S, 6, 6));
  assert.ok(!E.isLegalBid(S, 3, 4)); assert.ok(!E.isLegalBid(S, 3, 3)); assert.ok(!E.isLegalBid(S, 2, 6));
  assert.ok(!E.isLegalBid(S, 7, 2), 'only 6 dice on the table'); assert.ok(!E.isLegalBid(S, 3.5, 5)); assert.ok(!E.isLegalBid(S, 4, 7));
  const L = E.legal(S);
  deq(L.minBid, { q: 3, f: 5 }); assert.strictEqual(L.maxQ, 6); assert.ok(L.canLiar && L.canSpot && !L.mustBid);
  assert.ok(isErr(E.act(S, { t: 'bid', q: 3, f: 4 })));
  const before = JSON.stringify(S);
  assert.ok(isErr(E.act(S, { t: 'bid', q: 9, f: 4 })));
  assert.ok(isErr(E.act(S, { t: 'next' })));
  assert.ok(isErr(E.act(S, { t: 'buy', i: 0 })));
  assert.strictEqual(JSON.stringify(S), before, 'an illegal action changes nothing');
  const top = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 6, f: 6 }] });
  assert.strictEqual(E.legal(top).minBid, null); assert.strictEqual(E.legal(top).canBid, false); assert.ok(E.legal(top).canLiar);
  const open = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [] });
  assert.ok(E.legal(open).mustBid && !E.legal(open).canLiar);
  assert.ok(isErr(E.act(open, { t: 'liar' })));
});

test('antes and the streak: +1 ante per win in a row, capped at +3, reset by a loss', () => {
  const S = rig({ dice: [[2, 3, 3, 3, 3], [4, 4, 4, 4, 4], [5, 6, 6, 6, 6]], bids: [{ who: 2, q: 9, f: 4 }] });
  const got = [];
  for (let k = 0; k < 5; k++) {
    arm(S, { dice: [[2, 3, 3, 3, 3], [4, 4, 4, 4, 4], [5, 6, 6, 6, 6]], bids: [{ who: 2, q: 9, f: 4 }] });
    const ev = ok(E.act(S, { t: 'liar' }));
    got.push(pays(ev).reduce((a, p) => a + p.amount, 0));
  }
  deq(got, [3, 6, 9, 12, 12]);
  assert.strictEqual(S.streak, 5);
  arm(S, { dice: [[2, 3, 3, 3, 3], [4, 4, 4, 4, 4], [5, 6, 6, 6, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  const ev = ok(E.act(S, { t: 'liar' }));
  deq(pays(ev).map(p => p.amount), [-3]);
  assert.strictEqual(S.streak, 0);
  // Spot On pays 3 antes plus the streak bonus.
  S.streak = 2;
  arm(S, { dice: [[2, 3, 3, 3, 3], [4, 4, 4, 4, 4], [5, 6, 6, 6, 6]], bids: [{ who: 2, q: 5, f: 4 }] });
  deq(pays(ok(E.act(S, { t: 'spot' }))).map(p => [p.amount, p.why]), [[9, 'spot'], [6, 'streak']]);
});

test('a bot\'s challenge between bots moves no money; a bot Spot On on your bid neither', () => {
  const S = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 1, q: 1, f: 4 }] });
  S.table.round.turn = 2;
  S.table.round.bids = [{ who: 0, q: 2, f: 4, p: 0.5, held: 0, bluff: false, habit: null }];
  S.table.wait = null;
  const cash = S.cash;
  const ev = E.advance(S);
  assert.strictEqual(S.cash, cash + pays(ev).reduce((a, p) => a + p.amount, 0));
  if (find(ev, 'call', c => c.kind === 'spot' && c.on.who === 0)) assert.strictEqual(pays(ev).length, 0);
});

test('money never goes negative', () => {
  const S = rig({ cash: 1, dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  const ev = ok(E.act(S, { t: 'liar' }));
  deq(pays(ev).map(p => p.amount), [-1]);
  assert.strictEqual(S.cash, 0);
});

// ===================================================================== tables
test('elimination and places: out first at four seats is 4th; 2nd of four gets the buy-in back; a win pays the pot', () => {
  const four = ['npc_colt', 'npc_dewayne', 'npc_ray'];
  let S = rig({ people: four, dice: [[2], [4, 4], [5, 6], [4]], bids: [{ who: 3, q: 2, f: 4 }] });
  let ev = ok(E.act(S, { t: 'liar' }));
  deq(find(ev, 'out'), { t: 'out', who: 0, id: 'me', name: 'You', place: 4 });
  let te = find(ev, 'tableEnd');
  assert.strictEqual(te.place, 4); assert.strictEqual(te.payout, 0); assert.strictEqual(te.refund, 0);
  assert.strictEqual(S.phase, 'shop');
  S = rig({ people: four, dice: [[2], [4, 4], [], []], bids: [{ who: 1, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar' }));
  te = find(ev, 'tableEnd');
  assert.strictEqual(te.place, 2); assert.strictEqual(te.refund, 20);
  deq(pays(ev).map(p => [p.amount, p.why]), [[-3, 'lost'], [20, 'refund']]);
  S = rig({ people: four, dice: [[2], [4], [], []], bids: [{ who: 1, q: 2, f: 4 }] });
  const before = S.cash;
  ev = ok(E.act(S, { t: 'liar' }));
  te = find(ev, 'tableEnd');
  assert.strictEqual(te.place, 1); assert.strictEqual(te.won, true); assert.strictEqual(te.payout, 80);
  assert.strictEqual(S.cash, before + 3 + 80);
  // Three seats: 2nd gets nothing back.
  S = rig({ dice: [[2], [4, 4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  te = find(ok(E.act(S, { t: 'liar' })), 'tableEnd');
  assert.strictEqual(te.place, 2); assert.strictEqual(te.refund, 0);
});

test('sitting pays the buy-in; a bust table cannot be sat', () => {
  const S = E.newNight({ seed: 'sit' });
  const o = E.options(S);
  assert.strictEqual(o.length, 2); deq(o.map(c => c.kind), ['easy', 'rich']);
  assert.ok(o[1].buyIn >= 2 * o[0].buyIn);
  const ev = ok(E.sit(S, 0));
  deq(pays(ev, 'buyin').map(p => p.amount), [-o[0].buyIn]);
  assert.strictEqual(find(ev, 'sit').pot, o[0].buyIn * o[0].seats);
  const S2 = E.newNight({ seed: 'sit' }); S2.cash = 30;
  assert.ok(isErr(E.sit(S2, 1)));
});

test('the night\'s tables are fixed by the seed; the 9 PM tables seat 3, later rich tables 4', () => {
  const a = E.newNight({ seed: 'x' }), b = E.newNight({ seed: 'x' }), c = E.newNight({ seed: 'y' });
  deq(a.offers, b.offers);
  ndeq(a.offers, c.offers);
  const ids = [];
  a.offers.forEach((h, k) => h.forEach(o => { ids.push(...o.people); assert.strictEqual(o.seats, k === 0 || o.kind === 'easy' ? 3 : 4); assert.strictEqual(o.people.length, o.seats - 1); }));
  assert.strictEqual(new Set(ids).size, ids.length, 'nobody sits twice in a night');
  assert.ok(!ids.includes('npc_loretta') && !ids.includes('npc_curtis'));
  assert.strictEqual(a.offers[0][0].rule, null, 'the first table has no house rule');
  // No house rule at 9 PM at either table, over many nights; from 10 PM rules turn up, mostly at the rich table.
  const ruled = { easy: 0, rich: 0 };
  for (let i = 0; i < 300; i++) {
    const o = E.newNight({ seed: 'rules' + i }).offers;
    assert.ok(o[0].every(c => c.rule === null), '9 PM is plain: ' + JSON.stringify(o[0].map(c => c.rule)));
    o.slice(1).forEach(h => h.forEach(c => { if (c.rule) ruled[c.kind]++; }));
  }
  assert.ok(ruled.easy > 0 && ruled.rich > 2 * ruled.easy, JSON.stringify(ruled));
  deq(E.newNight({ daily: '2026-11-21' }).offers, E.newNight({ daily: '2026-11-21' }).offers);
  assert.strictEqual(E.dailySeed('2026-11-21'), 'daily:2026-11-21');
  assert.strictEqual(E.newNight({ daily: '2026-11-21' }).seed, 'daily:2026-11-21');
});

test('cups by the table: 4 dice at a three-seat table, 3 at a four-seat one, 5 at Last Call; Short one fewer, Deep two more; Extra Bone one more', () => {
  const S = E.newNight({ seed: 'cups' });
  const want = seats => seats >= 4 ? 3 : 4;
  let four = 0;
  for (let i = 0; i < 40; i++) {
    const N = E.newNight({ seed: 'cups' + i });
    for (let h = 0; h < 4; h++) {
      N.hour = h; N.cash = 1e6;
      E.options(N).forEach(c => {
        const base = want(c.seats); if (c.seats === 4) four++;
        assert.strictEqual(c.dice, c.rule && c.rule.id === 'short' ? base - 1 : c.rule && c.rule.id === 'deep' ? base + 2 : base, E.HOURS[h].name + ' ' + c.kind + ' ' + c.seats + ' seats');
      });
    }
  }
  assert.ok(four > 40, 'four-seat tables were checked');
  S.hour = 4; S.cash = 600;
  assert.strictEqual(E.options(S)[0].dice, 5);
  for (let h = 0; h < 4; h++) for (const k of [0, 1]) {
    const T = E.newNight({ seed: 'cups' + h, tricks: ['extrabone'] }); T.hour = h; T.cash = 1e6;
    T.offers[h][k].rule = null;
    const base = want(T.offers[h][k].seats);
    const ev = ok(E.sit(T, k));
    deq(find(ev, 'sit').seats.map(x => x.dice), [base + 1].concat(T.offers[h][k].people.map(() => base)));
  }
  // The house rules on a four-seat table: Short cups 2 dice, Deep cups 5.
  for (const [rule, n] of [['short', 2], ['deep', 5]]) {
    const T = E.newNight({ seed: 'cups4' + rule }); T.hour = 2; T.cash = 1e6;
    T.offers[2][1].rule = rule;
    assert.strictEqual(T.offers[2][1].seats, 4);
    ok(E.sit(T, 1));
    assert.ok(T.table.seats.every(x => x.n === n), rule + ' at four seats');
  }
  const L = rig({ hour: 4 });
  assert.ok(L.table.seats.every(x => x.n === 5));
});

// ===================================================================== house rules
test('house rules: Short cups 3 dice, Deep cups 6 (at three seats), Double ante doubles the ante', () => {
  assert.ok(rig({ rule: 'short' }).table.seats.every(s => s.n === 3));
  assert.ok(rig({ rule: 'deep' }).table.seats.every(s => s.n === 6));
  assert.strictEqual(rig({ rule: 'double' }).table.ante, 6);
  assert.strictEqual(rig({}).table.ante, 3);
});

test('house rule Sudden: the loser of a challenge loses 2 dice', () => {
  let S = rig({ rule: 'sudden', dice: [[2, 3, 3], [4, 4, 4], [5, 6, 6]], bids: [{ who: 2, q: 4, f: 4 }] });
  let ev = ok(E.act(S, { t: 'liar' }));
  deq(find(ev, 'lose'), { t: 'lose', who: 2, id: 'npc_dewayne', n: 2, left: 1 });
  S = rig({ rule: 'sudden', dice: [[2, 3, 3], [4, 4, 4], [5, 6, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.spot ? [] : E.act(S, { t: 'spot' }));
  deq(find(ev, 'lose'), { t: 'lose', who: 0, id: 'me', n: 2, left: 1 });
});

test('house rule Open hand: every first die is face up, in the view and in the Count', () => {
  const S = rig({ rule: 'open', dice: [[2, 3], [4, 5], [6, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  const v = E.view(S);
  deq(v.table.seats[1].shown, [{ i: 0, face: 4, why: 'open' }]);
  deq(v.table.seats[2].shown, [{ i: 0, face: 6, why: 'open' }]);
  // Known: my 2,3 and the two open dice (one 4). Unknown: 2 dice; need 1 more 4.
  assert.ok(Math.abs(E.count(S, 2, 4) - (1 - (2 / 3) ** 2)) < 1e-12);
  // And they reach the roll event at a real round.
  const S2 = rig({ rule: 'open' });
  S2.table.wait = 'next'; S2.table.round = null;
  const ev = ok(E.act(S2, { t: 'next' }));
  const roll = find(ev, 'roll');
  assert.strictEqual(roll.open.length, 3);
});

test('house rule Blind opener: the opener bids before looking; the cup shows after the bid', () => {
  let found = 0;
  for (let i = 0; i < 40 && found < 3; i++) {
    const S = E.newNight({ seed: 'blind' + i });
    S.offers[0][0].rule = 'blind';
    const ev = ok(E.sit(S, 0));
    const roll = find(ev, 'roll');
    if (roll.opener !== 0) continue;
    found++;
    assert.strictEqual(roll.mine, null); assert.strictEqual(roll.blind, true);
    const v = E.view(S);
    assert.strictEqual(v.table.myDice, null); assert.strictEqual(v.table.blind, true);
    deq(E.legal(S).uses, []);
    const ev2 = ok(E.act(S, { t: 'bid', q: 2, f: 3 }));
    deq(find(ev2, 'look').mine, S.table && S.table.round ? S.table.seats[0].dice : find(ev2, 'look').mine);
    // The blind bid is classified from no cup at all: P(at least 2 threes among 12 fair dice).
    const b = S.table.round ? S.table.round.bids[0] : null;
    if (b) assert.ok(Math.abs(b.p - SIM.tail(12, 2, 1 / 3)) < 1e-12);
  }
  assert.ok(found >= 1);
});

// ===================================================================== the Count
function bruteCount(S, q, f, exact) {
  const T = S.table, R = T.round, wild = T.rule !== 'straight';
  const known = [], unknown = [];
  T.seats.forEach((s, k) => { if (s.out) return; s.dice.forEach((d, i) => { if (k === 0 || (T.rule === 'open' && i === 0) || R.peek.some(p => p.seat === k && p.i === i)) known.push({ k, i, d }); else unknown.push({ k, i }); }); });
  const b = T.round.bids[T.round.bids.length - 1];
  const theirs = b && b.who !== 0 && b.q === q && b.f === f;
  let good = 0, tot = 0;
  const n = unknown.length, vals = new Array(n).fill(1);
  for (;;) {
    let ones = known.filter(x => x.d === 1).length + vals.filter(v => v === 1).length;
    if (R.ones == null || ones === R.ones) {
      let c = 0;
      known.forEach(x => { if (x.d === f || (wild && x.d === 1 && !(x.k === 0 && theirs && R.fixed.includes(x.i)))) c++; });
      vals.forEach(v => { if (v === f || (wild && v === 1)) c++; });
      if (f === 6 && R.loaded != null && T.seats[0].dice[R.loaded] === 6) c++; // Loaded Six: two 6s
      tot++; if (exact ? c === q : c >= q) good++;
    }
    let j = 0; while (j < n && vals[j] === 6) { vals[j] = 1; j++; }
    if (j === n) break; vals[j]++;
  }
  return good / tot;
}
test('the Count matches brute-force enumeration (wilds, Straight, peeks, Bar Mirror, Shaved Die, Loaded Six)', () => {
  let cases = 0;
  const setups = [
    { dice: [[2, 1, 4], [3, 4], [6, 6, 2]] },
    { rule: 'straight', dice: [[1, 1, 3], [3, 4], [6, 1, 2]] },
    { dice: [[5], [3, 4, 1], [6, 2]], peek: [{ seat: 1, i: 2, why: 'mirror' }] },
    { dice: [[1, 5, 5], [3, 1, 4], [6, 2]], ones: 3 },
    { rule: 'straight', dice: [[1, 5], [3, 1, 4], [6, 1]], ones: 3 },
    { rule: 'open', dice: [[2, 2], [4, 1, 4], [3, 6]] },
    { dice: [[1, 3, 5], [4, 4], [2, 6]], fixed: [0], bids: [{ who: 2, q: 3, f: 4 }] },
    { dice: [[6, 2, 1], [3, 6], [6, 1, 2]], loaded: 0 },
    { dice: [[6, 2, 1], [3, 6], [6, 1, 2]], loaded: 0, bids: [{ who: 2, q: 4, f: 6 }] },
    { rule: 'straight', dice: [[6, 6, 1], [3, 6], [5, 1]], loaded: 1 },
    { dice: [[1, 6, 6], [3, 4, 1], [6, 2]], fixed: [0], loaded: 1, ones: 3 }
  ];
  for (const o of setups) {
    const S = rig(Object.assign({ bids: o.bids || [{ who: 2, q: 1, f: 2 }] }, o));
    if (o.ones != null) S.table.round.ones = S.table.seats.reduce((a, s) => a + s.dice.filter(d => d === 1).length, 0);
    const T = S.table, faces = T.rule === 'straight' ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6];
    const total = T.seats.reduce((a, s) => a + s.dice.length, 0);
    for (let q = 0; q <= total + 2; q++) for (const f of faces) {
      const want = bruteCount(S, q, f, false), got = E.count(S, q, f);
      assert.ok(Math.abs(want - got) < 1e-9, JSON.stringify(o) + ` count(${q},${f}) ${got} vs ${want}`);
      const wantX = bruteCount(S, q, f, true), gotX = E.countExact(S, q, f);
      if (q >= 1) assert.ok(Math.abs(wantX - gotX) < 1e-9, JSON.stringify(o) + ` exact(${q},${f}) ${gotX} vs ${wantX}`);
      cases++;
    }
  }
  assert.ok(cases > 150);
  // Exact binomial sanity: 10 unknown dice, need 4 sixes-or-ones.
  let p = 0; for (let k = 4; k <= 10; k++) p += binom(10, k) * (1 / 3) ** k * (2 / 3) ** (10 - k);
  assert.ok(Math.abs(SIM.tail(10, 4, 1 / 3) - p) < 1e-12);
  assert.strictEqual(E.count(E.newNight({ seed: 'x' }), 1, 2), null);
});

// ===================================================================== bluffs, readouts, the Book
test('the bluff definition, the readout and the Book tallies agree', () => {
  let book = null;
  const byPerson = {}, me = { bids: 0, bluffs: 0 };
  let checked = 0;
  for (let i = 0; i < 25; i++) {
    const r = E.playNight('bk' + i, null, { keepEvents: true, book });
    let rule = null;
    r.events.forEach((e, k) => {
      if (e.t === 'sit') rule = e.rule ? e.rule.id : null;
      if (e.t !== 'readout') return;
      const rev = r.events.slice(0, k).reverse().find(x => x.t === 'reveal');
      const wild = rule !== 'straight', p = wild ? 1 / 3 : 1 / 6;
      const total = rev.cups.reduce((a, c) => a + c.dice.length, 0);
      e.bids.forEach(b => {
        const cup = rev.cups.find(c => c.who === b.who).dice;
        assert.strictEqual(b.held, cup.filter(d => d === b.f || (wild && d === 1)).length);
        if (rule !== 'open' && rule !== 'blind') {
          const pr = SIM.tail(total - cup.length, b.q - b.held, p);
          assert.ok(Math.abs(pr - b.p) < 1e-3, 'p'); assert.strictEqual(b.bluff, pr < 0.4); checked++;
        }
        if (b.id === 'me') { me.bids++; if (b.bluff) me.bluffs++; return; }
        const x = byPerson[b.id] = byPerson[b.id] || { bids: 0, bluffs: 0, h: [[0, 0], [0, 0], [0, 0]] };
        x.bids++; if (b.bluff) x.bluffs++;
        if (b.habit != null) { x.h[b.habit][b.bluff ? 0 : 1]++; assert.strictEqual(b.text, E.PEOPLE.find(pp => pp.id === b.id).habits[b.habit]); }
      });
    });
    book = E.bookApply(book, r.events);
  }
  assert.ok(checked > 500);
  assert.strictEqual(book.nights, 25);
  deq({ bids: book.me.bids, bluffs: book.me.bluffs }, me);
  for (const id in byPerson) {
    const pg = E.bookPage(book, id);
    assert.strictEqual(pg.bids, byPerson[id].bids); assert.strictEqual(pg.bluffs, byPerson[id].bluffs);
    pg.rows.forEach((row, i) => { assert.strictEqual(row.bluff, byPerson[id].h[i][0]); assert.strictEqual(row.straight, byPerson[id].h[i][1]); assert.strictEqual(row.underline, false); });
    assert.ok(pg.head.startsWith(pg.name + ' · ' + pg.bids + ' bid'));
    assert.strictEqual(pg.truth, null);
    assert.ok(pg.met && pg.nights >= 1 && pg.won + pg.lost >= 1);
  }
  const fresh = E.bookPage(book, 'npc_loretta') || {};
  assert.ok('met' in fresh);
  assert.strictEqual(E.bookPage(null, 'npc_colt').bids, 0);
  // Pure: the input book is not changed.
  const frozen = JSON.stringify(book);
  E.bookApply(book, E.playNight('bk-pure', null, { keepEvents: true }).events);
  assert.strictEqual(JSON.stringify(book), frozen);
});

test('habit lines read after a first name, and tells show by kind and strength', () => {
  for (const p of E.PEOPLE) p.habits.forEach(h => { assert.ok(/^[a-z]/.test(h) && !/\.$/.test(h), p.id + ': ' + h); });
  // Over many bids, a tell shows far more often when it applies than not.
  const seen = {};
  for (let i = 0; i < 60; i++) {
    const r = E.playNight('tl' + i, null, { keepEvents: true });
    r.events.filter(e => e.t === 'readout').forEach(e => e.bids.forEach(b => {
      if (b.id === 'me') return;
      const s = SIM.person(b.id), applies = s.kind === 'bluff' ? b.bluff : !b.bluff;
      const x = seen[s.tier] = seen[s.tier] || { a: 0, at: 0, n: 0, nt: 0 };
      if (applies) { x.a++; if (b.habit === s.tell) x.at++; } else { x.n++; if (b.habit === s.tell) x.nt++; }
    }));
  }
  for (const t of [1, 2, 3]) assert.ok(seen[t].at / seen[t].a > 2 * seen[t].nt / seen[t].n, 'tier ' + t + ' tell ' + JSON.stringify(seen[t]));
  const bidEv = find(E.playNight('tl0', null, { keepEvents: true }).events, 'bid', e => e.habit);
  const p = E.PEOPLE.find(x => x.id === bidEv.id);
  assert.strictEqual(bidEv.habit.line, p.first + ' ' + bidEv.habit.text + '.');
});

test('bots remember how you bluff (this table plus a little of the Book); Poker Face makes you look honest however often you are caught', () => {
  const S = rig({});
  S.table.seen[0] = { n: 20, b: 18 };
  assert.ok(SIM.estBluff(S, 0) > 0.7);
  const B = rig({ book: { v: 1, nights: 3, me: { bids: 40, bluffs: 40 }, people: {} } });
  const C = rig({});
  assert.ok(SIM.estBluff(B, 0) > SIM.estBluff(C, 0) + 0.3);
  assert.ok(SIM.estBluff(C, 0) > 0.2, 'a stranger is taken for an average bluffer');
  // Poker Face: honest to them, whatever they caught tonight and whatever the Book remembers.
  for (const seen of [{ n: 0, b: 0 }, { n: 5, b: 5 }, { n: 20, b: 18 }, { n: 60, b: 60 }]) {
    const P2 = rig({ tricks: ['pokerface'], book: { v: 1, nights: 9, me: { bids: 200, bluffs: 190 }, people: {} } });
    P2.table.seen[0] = seen;
    assert.strictEqual(SIM.estBluff(P2, 0), 0, JSON.stringify(seen));
  }
  // It is you they take for honest, not the others.
  const P3 = rig({ tricks: ['pokerface'] }); P3.table.seen[1] = { n: 20, b: 18 };
  assert.ok(SIM.estBluff(P3, 1) > 0.7);
  // And it changes their play: across many tables of the same bluffing, they call your bids less with it.
  const calls = tricks => {
    let called = 0, bids = 0;
    for (let i = 0; i < 300; i++) {
      const T = rig({ seed: 'pf' + i, tricks, people: ['npc_darlene', 'npc_boyd'], dice: [[2, 3, 4], [2, 3, 6], [2, 6, 6]] });
      T.table.seen[0] = { n: 30, b: 25 };
      T.table.round.bids = [{ who: 0, q: 4, f: 5, p: 0.1, held: 0, bluff: true, habit: null }];
      T.table.round.turn = 1; T.table.wait = null;
      const ev = E.advance(T); bids++;
      if (find(ev, 'call', c => c.on.who === 0)) called++;
    }
    return called / bids;
  };
  assert.ok(calls(['pokerface']) < calls([]) - 0.15, `called ${calls(['pokerface'])} with it, ${calls([])} without`);
});
test('no bot ever makes an illegal or impossible bid across 2,000 tables', () => {
  let tables = 0, bids = 0;
  const kinds = [[0, 'easy'], [0, 'rich'], [1, 'easy'], [1, 'rich'], [2, 'easy'], [2, 'rich'], [3, 'easy'], [3, 'rich'], [4, 'last']];
  for (let i = 0; i < 2000; i++) {
    const [h, kind] = kinds[i % kinds.length];
    const S = E.newNight({ seed: 'bots' + i });
    S.hour = h; S.cash = h === 4 ? 1000 : 1e6;
    if (h < 4 && i % 7 === 0) S.offers[h][kind === 'rich' ? 1 : 0].rule = E.HOUSE_RULES[(i / 7 | 0) % 7].id;
    let faces = null, total = 0, prev = null, ev = ok(E.act(S, { t: 'sit', i: kind === 'rich' ? 1 : 0 }));
    const check = list => list.forEach(e => {
      if (e.t === 'sit') faces = e.rule && e.rule.id === 'straight' ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6];
      if (e.t === 'roll') { total = e.counts.reduce((a, b) => a + b, 0); prev = null; }
      if (e.t === 'bid') {
        assert.ok(Number.isInteger(e.q) && e.q >= 1 && e.q <= total, 'impossible bid ' + JSON.stringify(e) + ' on ' + total);
        assert.ok(faces.includes(e.f), 'bad face ' + e.f);
        if (prev) assert.ok(e.q > prev.q || (e.q === prev.q && e.f > prev.f), 'not a raise');
        prev = e; bids++;
      }
      if (e.t === 'call') assert.ok(prev, 'a call needs a bid');
      if (e.t === 'lose' || e.t === 'gain') assert.ok(e.left >= 0 && e.left <= 6 + 1);
    });
    check(ev);
    for (let g = 0; S.phase === 'table'; g++) { assert.ok(g < 3000, 'table must end'); ev = ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S)))); check(ev); }
    tables++;
  }
  assert.strictEqual(tables, 2000);
  assert.ok(bids > 20000);
});

test('bid sizing sounds like people: few sure-thing bids, few one-bid rounds, openers bid what they believe', () => {
  // Over a few hundred tables at every hour, with the plain Count player in the human seat.
  const kinds = [[0, 'easy'], [0, 'rich'], [1, 'easy'], [1, 'rich'], [2, 'easy'], [2, 'rich'], [3, 'easy'], [3, 'rich'], [4, 'last']];
  let botBids = 0, trivial = 0, rounds = 0, one = 0, opens = 0, lowOpens = 0, jumps = 0;
  const lens = [];
  for (let i = 0; i < 360; i++) {
    const [h, kind] = kinds[i % kinds.length];
    const S = E.newNight({ seed: 'size' + i });
    S.hour = h; S.cash = h === 4 ? 1000 : 1e6;
    let ev = ok(E.act(S, { t: 'sit', i: kind === 'rich' ? 1 : 0 }));
    const got = ev.slice();
    for (let g = 0; S.phase === 'table'; g++) { ev = ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))); got.push(...ev); }
    let prev = null;
    got.forEach(e => {
      if (e.t === 'roll') prev = null;
      if (e.t === 'bid') { if (prev && e.who !== 0 && e.q >= prev.q + 2) jumps++; prev = e; }
      if (e.t !== 'readout') return;
      rounds++; lens.push(e.bids.length); if (e.bids.length === 1) one++;
      e.bids.forEach((b, k) => {
        if (b.who === 0) return;
        botBids++; if (b.p > 0.95) trivial++;
        if (k === 0) { opens++; if (b.p < 0.35) lowOpens++; }
      });
    });
  }
  lens.sort((a, b) => a - b);
  const med = lens[lens.length >> 1];
  assert.ok(trivial / botBids < 0.12, 'trivial bot bids ' + (trivial / botBids).toFixed(3));
  assert.ok(one / rounds < 0.2, 'one-bid rounds ' + (one / rounds).toFixed(3));
  assert.ok(med >= 3 && med <= 5, 'median bids per round ' + med);
  // An opener under 35% by its own cup is a deliberate bluff, and those are rare.
  assert.ok(lowOpens / opens < 0.08, 'low openers ' + (lowOpens / opens).toFixed(3));
  assert.ok(jumps > 0, 'a low bid in front draws a jump');
});

test('Engine.suggest: the most of your best face the Count puts at 60%, when legal', () => {
  // Mine: 4,4,1,2 (three 4s with the wild). Unknown: 8 dice at 1/3.
  const S = rig({ dice: [[4, 4, 1, 2], [2, 3, 5, 6], [5, 6, 2, 3]], bids: [] });
  const s = E.suggest(S);
  const best = q => E.count(S, q, 4);
  assert.strictEqual(s.f, 4);
  assert.ok(best(s.q) >= 0.6 && best(s.q + 1) < 0.6, JSON.stringify(s));
  for (const f of [2, 3, 5, 6]) for (let q = s.q + 1; q <= 12; q++) assert.ok(E.count(S, q, f) < 0.6);
  // Not a legal raise any more: null (the picker falls back to the smallest raise).
  const S2 = rig({ dice: [[4, 4, 1, 2], [2, 3, 5, 6], [5, 6, 2, 3]], bids: [{ who: 2, q: s.q, f: 6 }] });
  assert.strictEqual(E.suggest(S2), null);
  assert.strictEqual(E.suggest(E.newNight({ seed: 'x' })), null);
});

test('tier 1 makes visible mistakes; sharks are harder (Count player\'s table win rate falls with tier)', () => {
  const rate = people => {
    let w = 0;
    for (let i = 0; i < 160; i++) {
      const S = E.newNight({ seed: 'tier' + people.join() + i }); S.cash = 1e5;
      S.offers[0][0] = { kind: 'easy', hour: 0, seats: 3, buyIn: 20, rule: null, people };
      E.sit(S, 0); finishTable(S);
      if (S.log[0].won) w++;
    }
    return w / 160;
  };
  const easy = rate(['npc_colt', 'npc_trent']), hard = rate(['npc_darlene', 'npc_boyd']);
  assert.ok(easy > hard + 0.12, `tier 1 ${easy} vs tier 4 ${hard}`);
});

// ===================================================================== tricks
test('Shaved Die: a die always lands on 1, wild only for your own bids', () => {
  let ran = 0;
  for (let k = 0; k < 8; k++) {
    const S = rig({ seed: 'sh' + k, tricks: ['shaved'] });
    S.table.round = null; S.table.wait = 'next';
    const ev = ok(E.act(S, { t: 'next' }));
    const roll = find(ev, 'roll');
    assert.strictEqual(roll.mine[0], 1); assert.ok(find(ev, 'trick', e => e.id === 'shaved' && e.die === 0));
    if (S.table && S.table.round) { deq(S.table.round.fixed, [0]); ran++; }
  }
  assert.ok(ran > 0);
  // On someone else's bid the shaved 1 is plain: 4s here are 4,4 only.
  let R = rig({ tricks: ['shaved'], dice: [[1, 2], [4, 4], [5, 6]], fixed: [0], bids: [{ who: 2, q: 3, f: 4 }] });
  assert.strictEqual(E.view(R).table.myFixed[0], 0);
  assert.ok(Math.abs(E.count(R, 3, 4) - SIM.tail(4, 3, 1 / 3)) < 1e-12, 'the shaved 1 does not count for their bid');
  let ev = ok(E.act(R, { t: 'liar' }));
  assert.strictEqual(find(ev, 'reveal').count, 2); assert.strictEqual(find(ev, 'reveal').good, false);
  // On your own bid it is wild.
  R = rig({ tricks: ['shaved'], dice: [[1, 2], [4, 4], [5, 6]], fixed: [0], bids: [{ who: 1, q: 1, f: 4 }] });
  assert.ok(Math.abs(E.count(R, 3, 4) - SIM.tail(4, 2, 1 / 3)) < 1e-12, 'but does for a raise of yours');
  R.table.round.bids.push({ who: 0, q: 3, f: 4, p: 1, held: 1, bluff: false, habit: null });
  R.table.round.turn = 1; R.table.wait = null;
  const S2 = J(R); S2.table.round.turn = 0; S2.table.wait = 'turn';
  // A bot calls Liar on it: simulate by challenging from seat 1's point of view.
  S2.table.round.bids.push({ who: 1, q: 4, f: 4, p: 0.5, held: 2, bluff: false, habit: null });
  ev = ok(E.act(S2, { t: 'liar' }));
  assert.strictEqual(find(ev, 'reveal').count, 2, 'Colt\'s 4x4 cannot lean on your shaved die');
});

test('Loaded Six: a die always lands on 6; Extra Bone: one more die (but not at Last Call)', () => {
  const S = E.newNight({ seed: 'ld', tricks: ['shaved', 'loaded', 'extrabone'] });
  const ev = ok(E.sit(S, 0));
  // 9 PM cups hold 4: Extra Bone makes yours 5.
  assert.strictEqual(find(ev, 'sit').seats[0].dice, 5); assert.strictEqual(S.table.start[0], 5); assert.strictEqual(S.table.start[1], 4);
  const mine = find(ev, 'roll').mine;
  assert.strictEqual(mine.length, 5); assert.strictEqual(mine[0], 1); assert.strictEqual(mine[1], 6);
  deq(find(ev, 'trick', e => e.id === 'extrabone'), { t: 'trick', id: 'extrabone', dice: 5 });
  const L = rig({ hour: 4, tricks: ['extrabone', 'loaded'] });
  assert.strictEqual(L.table.seats[0].n, 5, 'Loretta counts the bones');
  assert.ok(E.view(L).tricks.every(t => t.asleep));
});

test('Loaded Six counts as two 6s on any bid of 6s, and only on 6s: the reveal, Spot On, the Count, the largest bid', () => {
  // Your loaded 6 (die 0) and one more 6 at the table: three 6s for anyone's bid of 6s.
  let S = rig({ tricks: ['loaded'], dice: [[6, 2], [6, 3], [4, 5]], loaded: 0, bids: [{ who: 2, q: 3, f: 6 }] });
  assert.ok(Math.abs(E.count(S, 3, 6) - SIM.tail(4, 1, 1 / 3)) < 1e-12, 'the Count has it: your one die is two of the three');
  assert.ok(Math.abs(E.count(S, 2, 6) - 1) < 1e-12);
  deq(E.view(S).table.myLoaded, [0]);
  let ev = ok(E.act(S, { t: 'liar' }));
  let r = find(ev, 'reveal');
  deq([r.count, r.good, r.loaded], [3, true, 0], 'their three 6s are there');
  assert.strictEqual(find(ev, 'lose').who, 0);
  // Spot On: exactly three.
  S = rig({ tricks: ['loaded'], dice: [[6, 2], [6, 3], [4, 5]], loaded: 0, bids: [{ who: 2, q: 3, f: 6 }] });
  assert.ok(Math.abs(E.countExact(S, 3, 6) - SIM.pmf(4, 1, 1 / 3)) < 1e-12);
  ev = ok(E.act(S, { t: 'spot' }));
  assert.ok(find(ev, 'reveal').exact); deq(pays(ev).map(p => p.why), ['spot']);
  // Wild 1s count as usual on top: 6, 1 and the loaded 6 twice = four.
  S = rig({ tricks: ['loaded'], dice: [[6, 1], [2, 3], [4, 5]], loaded: 0, bids: [{ who: 1, q: 4, f: 6 }] });
  assert.strictEqual(find(ok(E.act(S, { t: 'spot' })), 'reveal').count, 3, 'your 6 (twice) and your 1');
  // Only on 6s: a bid of 5s sees one plain die, and no 'loaded' on the reveal.
  S = rig({ tricks: ['loaded'], dice: [[6, 5], [5, 3], [4, 2]], loaded: 0, bids: [{ who: 2, q: 3, f: 5 }] });
  ev = ok(E.act(S, { t: 'liar' })); r = find(ev, 'reveal');
  deq([r.count, r.good, 'loaded' in r], [2, false, false]);
  // The largest legal bid: one more 6 than there are dice (and nobody else knows it).
  S = rig({ tricks: ['loaded'], dice: [[6, 2], [6, 3], [4, 5]], loaded: 0, bids: [{ who: 2, q: 6, f: 5 }] });
  const L = E.legal(S);
  deq([L.maxFor[5], L.maxFor[6], L.maxQ], [6, 7, 7]);
  assert.ok(E.isLegalBid(S, 7, 6) && !E.isLegalBid(S, 7, 5) && !E.isLegalBid(S, 8, 6));
  deq(L.minBid, { q: 6, f: 6 });
  S.table.round.bids.push({ who: 1, q: 6, f: 6, p: 0, held: 1, bluff: true, habit: null });
  deq(E.legal(S).minBid, { q: 7, f: 6 }, 'past six 6s, only seven 6s');
  ok(E.act(S, { t: 'bid', q: 7, f: 6 }));
  // Your own bid of 6s is judged with the second 6: not a bluff when the cup backs it.
  S = rig({ tricks: ['loaded'], dice: [[6, 6], [2, 3], [4, 5]], loaded: 0 });
  ok(E.act(S, { t: 'bid', q: 3, f: 6 }));
  const mine = S.table.round ? S.table.round.bids.find(b => b.who === 0) : null;
  if (mine) { assert.strictEqual(mine.held, 3); assert.strictEqual(mine.p, 1); assert.strictEqual(mine.bluff, false); }
  // Without the trick the same cups count once.
  S = rig({ dice: [[6, 2], [6, 3], [4, 5]], bids: [{ who: 2, q: 3, f: 6 }] });
  assert.strictEqual(find(ok(E.act(S, { t: 'liar' })), 'reveal').count, 2);
  deq(E.legal(rig({ dice: [[6, 2], [6, 3], [4, 5]], bids: [{ who: 2, q: 6, f: 5 }] })).minBid, { q: 6, f: 6 });
  assert.strictEqual(E.legal(rig({ dice: [[6, 2], [6, 3], [4, 5]], bids: [{ who: 2, q: 6, f: 6 }] })).minBid, null);
  // A real roll: the loaded die is marked, and counted twice in the Count of 6s.
  const R = E.newNight({ seed: 'ld2', tricks: ['loaded'] }); ok(E.sit(R, 0));
  if (R.table.round && R.table.round.blindSeat !== 0) {
    assert.strictEqual(R.table.round.loaded, 0); assert.strictEqual(R.table.seats[0].dice[0], 6);
  }
  // Asleep at Last Call: no loaded die, nothing counted twice.
  const LC = rig({ hour: 4, tricks: ['loaded'] });
  assert.ok(!LC.table.round || LC.table.round.loaded === null);
});

test('Rabbit\'s Foot: the first die you would lose at each table, you keep', () => {
  const S = rig({ tricks: ['rabbit'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  let ev = ok(E.act(S, { t: 'liar' }));
  assert.ok(find(ev, 'trick', e => e.id === 'rabbit')); assert.ok(!find(ev, 'lose')); assert.strictEqual(S.table.seats[0].n, 2);
  deq(pays(ev).map(p => p.amount), [-3], 'you still pay the ante');
  arm(S, { dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar' }));
  deq(find(ev, 'lose'), { t: 'lose', who: 0, id: 'me', n: 1, left: 1 });
});

test('Slow Roll: before the first bid, twice a round, re-roll any dice, or keep your best face in one tap', () => {
  let S = null;
  for (let i = 0; i < 30 && !S; i++) { const T = E.newNight({ seed: 'slow' + i, tricks: ['slowroll'] }); const ev = ok(E.sit(T, 0)); if (find(ev, 'roll').opener !== 0) S = T; }
  assert.strictEqual(S.table.wait, 'ready');
  deq(E.legal(S).uses.includes('slowroll'), true);
  const before = S.table.seats[0].dice.slice();
  let ev = ok(E.act(S, { t: 'use', id: 'slowroll', dice: [1, 3] }));
  const after = find(ev, 'trick', e => e.id === 'slowroll').mine;
  deq([after[0], after[2], after[4]], [before[0], before[2], before[4]]);
  assert.strictEqual(find(ev, 'trick', e => e.id === 'slowroll').left, 1);
  ok(E.act(S, { t: 'use', id: 'slowroll' }));
  assert.ok(isErr(E.act(S, { t: 'use', id: 'slowroll' })), 'twice per round');
  assert.ok(!E.legal(S).uses.includes('slowroll'));
  ok(E.act(S, { t: 'go' }));
  // The opener gets the same beat before the first bid.
  let O = null;
  for (let i = 0; i < 40 && !O; i++) { const T = E.newNight({ seed: 'slowo' + i, tricks: ['slowroll'] }); const e = ok(E.sit(T, 0)); if (find(e, 'roll').opener === 0 && !find(e, 'roll').blind) O = T; }
  assert.strictEqual(O.table.wait, 'ready'); ok(E.act(O, { t: 'go' })); assert.strictEqual(O.table.wait, 'turn');
  // Keep the best face: 5, 5 and a wild 1 make three 5s; the 2 and the 3 go back in the cup.
  let K = rig({ tricks: ['slowroll'], dice: [[5, 2, 1, 5, 3], [4, 4], [5, 6]] });
  deq(E.view(K).table.slow, { f: 5, reroll: [1, 4], left: 2 });
  ev = ok(E.act(K, { t: 'use', id: 'slowroll', keep: 'best' }));
  let tr = find(ev, 'trick', e => e.id === 'slowroll');
  deq([tr.dice, tr.kept, tr.left], [[1, 4], 5, 1]);
  deq([tr.mine[0], tr.mine[2], tr.mine[3]], [5, 1, 5], 'the 5s and the 1 stay');
  // A tie goes to the higher face; under Straight a 1 is a face like any other.
  K = rig({ tricks: ['slowroll'], rule: 'straight', dice: [[1, 4, 1, 4], [4, 4], [5, 6]] });
  deq(E.view(K).table.slow.f, 4); deq(E.view(K).table.slow.reroll, [0, 2]);
  // Fixed dice stay (the loaded six counts twice for 6s), and nothing to re-roll is an error.
  K = rig({ tricks: ['slowroll', 'loaded'], dice: [[6, 5, 5, 2], [4, 4], [5, 6]], loaded: 0 });
  deq(E.view(K).table.slow.f, 6, 'two 6s from the loaded die beat two 5s on the tie');
  deq(E.view(K).table.slow.reroll, [1, 2, 3]);
  K = rig({ tricks: ['slowroll'], dice: [[4, 1, 4], [4, 4], [5, 6]] });
  assert.ok(isErr(E.act(K, { t: 'use', id: 'slowroll', keep: 'best' })), 'every die already shows the best face');
  assert.ok(isErr(E.act(K, { t: 'use', id: 'slowroll', keep: 'best', dice: [0] })));
  assert.ok(isErr(E.act(K, { t: 'use', id: 'slowroll', keep: 'worst' })));
  // Deterministic: the same keep from the same state rolls the same.
  const A = rig({ tricks: ['slowroll'], dice: [[5, 2, 1, 5, 3], [4, 4], [5, 6]] }), B = J(A);
  deq(E.act(A, { t: 'use', id: 'slowroll', keep: 'best' }), E.act(B, { t: 'use', id: 'slowroll', keep: 'best' }));
  const R = rig({ tricks: ['slowroll'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  assert.ok(!E.legal(R).uses.includes('slowroll'), 'not after the first bid');
  assert.strictEqual(E.view(R).table.slow, null);
  assert.ok(isErr(E.act(rig({ tricks: ['slowroll'], dice: [[2, 3], [4], [5]] }), { t: 'use', id: 'slowroll', dice: [5] })));
});
test('Palm: four times a table, turn one of your dice to a face from 2 to 6 (never a 1, never the loaded six)', () => {
  const S = rig({ tricks: ['palm'], dice: [[2, 3, 1], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  deq(E.view(S).table.palm, { left: 4, loaded: null });
  let ev = ok(E.act(S, { t: 'use', id: 'palm', die: 1, face: 4 }));
  deq(find(ev, 'trick', e => e.id === 'palm'), { t: 'trick', id: 'palm', die: 1, face: 4, mine: [2, 4, 1], left: 3 });
  deq(S.table.seats[0].dice, [2, 4, 1]);
  assert.strictEqual(S.table.wait, 'turn');
  // Again in the same round (a 1 may become a face, but nothing becomes a 1).
  ok(E.act(S, { t: 'use', id: 'palm', die: 2, face: 4 }));
  assert.ok(isErr(E.act(S, { t: 'use', id: 'palm', die: 0, face: 1 })), 'no 1s');
  assert.ok(isErr(E.act(S, { t: 'use', id: 'palm', die: 0, face: 7 })));
  assert.ok(isErr(E.act(S, { t: 'use', id: 'palm', die: 1, face: 4 })), 'already a 4');
  ok(E.act(S, { t: 'use', id: 'palm', die: 0, face: 4 }));
  assert.strictEqual(E.view(S).table.palm.left, 1);
  ok(E.act(S, { t: 'use', id: 'palm', die: 0, face: 5 }));
  assert.strictEqual(E.view(S).table.palm.left, 0);
  assert.ok(!E.legal(S).uses.includes('palm'), 'four a table');
  assert.ok(isErr(E.act(S, { t: 'use', id: 'palm', die: 0, face: 6 })));
  // The next round of the same table: still spent. (A new table starts with four.)
  S.table.round = null; S.table.wait = 'next';
  ok(E.act(S, { t: 'next' }));
  if (S.table && S.table.wait === 'turn') assert.ok(!E.legal(S).uses.includes('palm'));
  assert.ok(isErr(E.act(rig({ tricks: ['palm'], dice: [[2, 3], [4], [5]] }), { t: 'use', id: 'palm', die: 2, face: 4 })));
  // The loaded six will not turn; a fixed 1 may (and is then a plain die).
  const L = rig({ tricks: ['palm', 'loaded', 'shaved'], dice: [[1, 6, 3], [4], [5]], fixed: [0], loaded: 1 });
  deq(E.view(L).table.palm, { left: 4, loaded: 1 });
  assert.ok(isErr(E.act(L, { t: 'use', id: 'palm', die: 1, face: 5 })));
  ok(E.act(L, { t: 'use', id: 'palm', die: 0, face: 6 }));
  deq([L.table.round.fixed, E.view(L).table.myLoaded], [[], [1]]);
  // Palm cancels Loretta's Nod (the cup changed); asleep at Last Call.
  const N = rig({ tricks: ['palm', 'nod'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ok(E.act(N, { t: 'use', id: 'nod' })); ok(E.act(N, { t: 'use', id: 'palm', die: 0, face: 4 }));
  assert.strictEqual(E.view(N).table.nod, null);
  const LC = rig({ hour: 4, tricks: ['palm'] });
  assert.ok(!E.legal(LC).uses.includes('palm'));
});
test('Hot Hand: after you win a challenge, a die next round is a guaranteed 1', () => {
  const S = rig({ tricks: ['hothand'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  ok(E.act(S, { t: 'liar' }));
  const ev = ok(E.act(S, { t: 'next' }));
  deq(find(ev, 'trick', e => e.id === 'hothand'), { t: 'trick', id: 'hothand', die: 0 });
  assert.strictEqual(find(ev, 'roll').mine[0], 1);
  assert.ok(!S.table.hot, 'used up');
  const L = rig({ tricks: ['hothand'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ok(E.act(L, { t: 'liar' }));
  assert.ok(!find(ok(E.act(L, { t: 'next' })), 'trick', e => e.id === 'hothand'), 'not after a loss');
});

test('Mirror Ring shows one die on your left; Cornered one under every cup on your last die', () => {
  let S = null, ev = null;
  for (let k = 0; k < 30 && !S; k++) {
    const T = rig({ seed: 'mc' + k, tricks: ['mirror', 'cornered'] });
    T.table.round = null; T.table.wait = 'next'; T.table.seats[0].n = 1; T.table.nextOpener = 0;
    const e = ok(E.act(T, { t: 'next' }));
    if (T.table && T.table.round) { S = T; ev = e; }
  }
  assert.ok(S, 'a round still running at your turn');
  const m = find(ev, 'trick', e => e.id === 'mirror');
  assert.strictEqual(m.seat, 1); assert.strictEqual(m.face, S.table.seats[1].dice[m.die]);
  const c = find(ev, 'trick', e => e.id === 'cornered');
  deq(c.shown.map(x => x.seat), [1, 2]);
  c.shown.forEach(x => assert.strictEqual(x.face, S.table.seats[x.seat].dice[x.die]));
  assert.ok(!(c.shown[0].die === m.die), 'Cornered shows a different die on the left');
  const v = E.view(S);
  assert.strictEqual(v.table.seats[1].shown.length, 2); assert.strictEqual(v.table.seats[2].shown.length, 1);
  const N = rig({ tricks: ['cornered'] }); N.table.round = null; N.table.wait = 'next';
  assert.ok(!find(ok(E.act(N, { t: 'next' })), 'trick', e => e.id === 'cornered'), 'only on your last die');
});

test('Bar Mirror: told how many 1s are on the table each round', () => {
  for (let i = 0; i < 6; i++) {
    const S = rig({ seed: 'bm' + i, tricks: ['barmirror'] });
    S.table.round = null; S.table.wait = 'next';
    const ev = ok(E.act(S, { t: 'next' }));
    if (!S.table || !S.table.round) continue;
    const ones = S.table.seats.reduce((a, s) => a + s.dice.filter(d => d === 1).length, 0);
    assert.strictEqual(find(ev, 'trick', e => e.id === 'barmirror').ones, ones);
    assert.strictEqual(E.view(S).table.ones, ones);
  }
});

test('Loretta\'s Nod: once per table, the truth about the bid in front of you', () => {
  const S = rig({ tricks: ['nod'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  const ev = ok(E.act(S, { t: 'use', id: 'nod' }));
  deq(find(ev, 'trick'), { t: 'trick', id: 'nod', q: 3, f: 4, truth: false });
  assert.strictEqual(E.count(S, 3, 4), 0); assert.strictEqual(E.view(S).table.nod.truth, false);
  assert.ok(isErr(E.act(S, { t: 'use', id: 'nod' })));
  const T = rig({ tricks: ['nod'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ok(E.act(T, { t: 'use', id: 'nod' }));
  assert.strictEqual(E.count(T, 2, 4), 1); assert.strictEqual(E.count(T, 1, 4), 1);
  assert.ok(!E.legal(rig({ tricks: ['nod'], dice: [[2, 3], [4], [5]] })).uses.includes('nod'), 'needs a bid in front');
});

test('Reading Glasses: a real tell is underlined once that habit has been seen 3 times', () => {
  let under = 0, wrong = 0, early = 0;
  for (let i = 0; i < 30; i++) {
    const r = E.playNight('gl' + i, null, { keepEvents: true, tricks: ['glasses'] });
    const count = {};
    r.events.filter(e => e.t === 'bid' && e.habit).forEach(e => {
      const k = e.id + e.habit.i; count[k] = (count[k] || 0) + 1;
      const s = SIM.person(e.id);
      if (e.habit.underline) { under++; if (e.habit.i !== s.tell) wrong++; if (count[k] < 3) early++; }
      else if (e.habit.i === s.tell && count[k] >= 3) wrong++;
    });
  }
  assert.ok(under > 20); assert.strictEqual(wrong, 0); assert.strictEqual(early, 0);
  // Sightings already in the Book count.
  const book = { v: 1, nights: 1, me: { bids: 0, bluffs: 0 }, people: {} };
  E.PEOPLE.forEach(p => { book.people[p.id] = { bids: 9, bluffs: 3, habits: [{ n: 5, bluff: 0, straight: 5 }, { n: 5, bluff: 0, straight: 5 }, { n: 5, bluff: 0, straight: 5 }], quiet: { n: 0, bluff: 0, straight: 0 }, won: 0, lost: 0, nights: 1, lastNight: 'x' }; });
  const r = E.playNight('gl-book', null, { keepEvents: true, tricks: ['glasses'], book });
  const first = r.events.find(e => e.t === 'bid' && e.habit && e.habit.i === SIM.person(e.id).tell);
  assert.ok(first && first.habit.underline, 'underlined on first sighting tonight');
  const pg = E.bookPage(book, 'npc_colt', { tricks: [{ id: 'glasses', paid: 0 }], table: null });
  deq(pg.rows.map(x => x.underline), [0, 1, 2].map(i => i === SIM.person('npc_colt').tell));
  assert.ok(E.playNight('gl0', null, { keepEvents: true }).events.every(e => e.t !== 'bid' || !e.habit || !e.habit.underline), 'never without the glasses');
});

test('Lyman\'s Ledger: every opponent shows a true bluff rate from the first bid', () => {
  const S = rig({ tricks: ['ledger'], dice: [[2, 3], [4, 4], [5, 6]], bids: [] });
  const v = E.view(S);
  assert.ok(/^bluffs about (1 bid in \d+|every other bid)$|^almost never bluffs$/.test(v.table.seats[1].ledger), v.table.seats[1].ledger);
  assert.strictEqual(v.table.seats[0].ledger, null);
  assert.strictEqual(E.view(rig({})).table.seats[1].ledger, null);
  assert.ok(E.bookPage(null, 'npc_colt', S).truth.startsWith('bluffs'));
  // Colt bluffs more than Dewayne, and the phrases say so.
  const n = s => { const m = /1 bid in (\d+)/.exec(s); return m ? 1 / +m[1] : /every other/.test(s) ? 0.5 : 0.03; };
  assert.ok(n(v.table.seats[1].ledger) > n(v.table.seats[2].ledger));
  // Every person has a measured rate, and the phrases span the town.
  const phrases = new Set(E.PEOPLE.map(p => E.bookPage(null, p.id, S).truth));
  assert.ok(phrases.size >= 4, [...phrases].join(' | '));
  assert.ok(BLOCK.includes('npc_colt: 0.') && E.PEOPLE.every(p => BLOCK.includes(' ' + p.id + ': 0.')), 'RATE lists all fifty');
});

test('Sticky Fingers +1 ante on a caught liar; a Spot On pays 3 antes, Side Bet or not', () => {
  let S = rig({ tricks: ['sticky'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  deq(pays(ok(E.act(S, { t: 'liar' }))).map(p => [p.amount, p.why]), [[3, 'won'], [3, 'sticky']]);
  S = rig({ tricks: ['sidebet'], dice: [[2, 3], [4, 4], [4, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  const ev = ok(E.act(S, { t: 'spot' }));
  deq(pays(ev).map(p => [p.amount, p.why]), [[9, 'spot']]);
  assert.ok(!find(ev, 'trick', e => e.id === 'sidebet'), 'Side Bet is about other people\'s challenges now');
});

test('Snake Eyes: a challenge you win pays an extra ante for every 1 under your cup; a loss, or a mere roll, pays nothing', () => {
  // Your Liar call, right, with two 1s: the ante, and two more.
  let S = rig({ tricks: ['snake'], dice: [[1, 1, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 5, f: 4 }] });
  let ev = ok(E.act(S, { t: 'liar' }));
  deq(pays(ev).map(p => [p.amount, p.why]), [[3, 'won'], [6, 'snake']]);
  deq(find(ev, 'trick', e => e.id === 'snake'), { t: 'trick', id: 'snake', ones: 2, amount: 6 });
  // Spot On, right, with one 1 (a fixed one counts too): three antes, and one.
  S = rig({ tricks: ['snake', 'shaved'], dice: [[1, 2], [4, 4], [4, 6]], fixed: [0], bids: [{ who: 2, q: 3, f: 4 }] });
  deq(pays(ok(E.act(S, { t: 'spot' }))).map(p => [p.amount, p.why]), [[9, 'spot'], [3, 'snake']]);
  // Your bid, called and good: a bot calls Liar on your three 1s-backed 5s.
  let hit = false;
  for (let i = 0; i < 300 && !hit; i++) {
    const T = rig({ seed: 'sne' + i, tricks: ['snake'], dice: [[1, 1, 1, 5], [2, 3], [4, 6]] });
    T.table.round.bids = [{ who: 0, q: 4, f: 5, p: 1, held: 4, bluff: false, habit: null }];
    T.table.round.turn = 1; T.table.wait = null;
    ev = E.advance(T);
    const c = find(ev, 'call');
    if (c && c.kind === 'liar' && c.on.who === 0) { hit = true; deq(pays(ev).map(p => [p.amount, p.why]), [[3, 'won'], [9, 'snake']]); }
  }
  assert.ok(hit, 'a bot called');
  // A lost challenge pays nothing, 1s or no 1s.
  S = rig({ tricks: ['snake'], dice: [[1, 1, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar' }));
  deq(pays(ev).map(p => p.why), ['lost']); assert.ok(!find(ev, 'trick', e => e.id === 'snake'));
  // No 1s, no extra; and none for the roll itself any more.
  S = rig({ tricks: ['snake'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  deq(pays(ok(E.act(S, { t: 'liar' }))).map(p => p.why), ['won']);
  let rolls = 0;
  for (let i = 0; i < 30; i++) {
    const T = rig({ seed: 'sn' + i, tricks: ['snake'] });
    T.table.round = null; T.table.wait = 'next';
    const e = ok(E.act(T, { t: 'next' }));
    const roll = find(e, 'roll');
    if (roll && roll.mine && roll.mine.filter(d => d === 1).length >= 2) rolls++;
    const firstCall = e.findIndex(x => x.t === 'call');
    assert.ok(!e.slice(0, firstCall < 0 ? e.length : firstCall).some(x => x.t === 'trick' && x.id === 'snake'), 'nothing on the roll');
  }
  assert.ok(rolls > 0);
  // Last Call has no antes: nothing.
  const H = rig({ hour: 4, cash: 600, tricks: ['snake'] });
  arm(H, { dice: [[1, 1], [4], [5]], bids: [{ who: 1, q: 3, f: 4 }] });
  assert.ok(!find(ok(E.act(H, { t: 'liar' })), 'trick', e => e.id === 'snake'));
});

test('Side Bet: asked only of a holder, only when two others go to a challenge; a right guess pays an ante, a wrong one nothing', () => {
  // Seat 1 bids six 4s with none showing anywhere: seat 2 calls. Find a seed where it calls Liar.
  const setup = (tricks, o) => {
    for (let i = 0; i < 200; i++) {
      const T = rig(Object.assign({ seed: 'sb' + i, tricks, dice: [[2, 3], [5, 5], [6, 2]] }, o || {}));
      if (o && o.hour === 4) arm(T, { dice: [[2, 3], [5, 5], [6, 2]] });
      T.table.round.bids = [{ who: 1, q: 6, f: 4, p: 0, held: 0, bluff: true, habit: null }];
      T.table.round.turn = 2; T.table.wait = null;
      const probe = J(T), ev = E.advance(probe);
      const c = find(ev, 'call');
      if (c && c.kind === 'liar' && c.who === 2) return T;
    }
    throw new Error('no call');
  };
  let S = setup(['sidebet']);
  let ev = ok(E.advance(S));
  deq(ev.map(e => e.t), ['call', 'wait']);
  deq(ev[1], { t: 'wait', need: 'side' });
  const v = E.view(S).table;
  deq([v.wait, v.side.kind, v.side.caller, v.side.bidder, v.side.callerId, v.side.bidderId, v.side.q, v.side.f, v.side.pays, v.side.stake], ['side', 'liar', 2, 1, 'npc_dewayne', 'npc_colt', 6, 4, 3, 0]);
  assert.strictEqual(v.side.count, E.count(S, 6, 4));
  assert.ok(E.legal(S).canSide && !E.legal(S).canBid && !E.legal(S).canLiar);
  assert.ok(isErr(E.act(S, { t: 'liar' })) && isErr(E.act(S, { t: 'side', pick: 'nobody' })) && isErr(E.act(S, { t: 'next' })));
  // Right: there are no 4s at all, so the caller is right.
  const W = J(S);
  ev = ok(E.act(S, { t: 'side', pick: 'caller' }));
  assert.ok(!find(ev, 'call'), 'the call is not said twice');
  assert.ok(ev.findIndex(e => e.t === 'reveal') < ev.findIndex(e => e.t === 'trick' && e.id === 'sidebet'));
  deq(find(ev, 'trick', e => e.id === 'sidebet'), { t: 'trick', id: 'sidebet', pick: 'caller', right: true, amount: 3 });
  deq(pays(ev).map(p => [p.amount, p.why]), [[3, 'side']]);
  assert.strictEqual(S.streak, 0, 'a side bet is not a challenge you won');
  // Wrong: nothing is lost.
  ev = ok(E.act(W, { t: 'side', pick: 'bidder' }));
  deq(find(ev, 'trick', e => e.id === 'sidebet'), { t: 'trick', id: 'sidebet', pick: 'bidder', right: false, amount: 0 });
  deq(pays(ev), []);
  // Pass: no bet, no event.
  const Pz = setup(['sidebet']); E.advance(Pz);
  ev = ok(E.act(Pz, { t: 'side' }));
  assert.ok(find(ev, 'reveal') && !find(ev, 'trick', e => e.id === 'sidebet'));
  // Without the trick the cups lift at once.
  const N = setup([]);
  ev = ok(E.advance(N));
  assert.ok(find(ev, 'reveal') && ev[ev.length - 1].need !== 'side');
  // Not when you are the bidder or the caller.
  for (let i = 0; i < 50; i++) {
    const T = rig({ seed: 'sbm' + i, tricks: ['sidebet'], dice: [[2, 3], [5, 5], [6, 2]] });
    T.table.round.bids = [{ who: 0, q: 6, f: 4, p: 0, held: 0, bluff: true, habit: null }];
    T.table.round.turn = 1; T.table.wait = null;
    ev = ok(E.advance(T));
    assert.notStrictEqual(ev[ev.length - 1].need, 'side');
  }
  const Y = rig({ tricks: ['sidebet'], dice: [[2, 3], [5, 5], [6, 2]], bids: [{ who: 2, q: 6, f: 4 }] });
  assert.ok(find(ok(E.act(Y, { t: 'liar' })), 'reveal'));
  // Not at Last Call (no antes there).
  const LC = setup(['sidebet'], { hour: 4 });
  ev = ok(E.advance(LC));
  assert.ok(find(ev, 'reveal'), 'no side bets at Loretta\'s table');
  // A Spot On between two others: 'caller' means exactly right.
  for (let i = 0; i < 400; i++) {
    const T = rig({ seed: 'sbs' + i, tricks: ['sidebet'], dice: [[2, 3], [4, 4], [4, 2]] });
    T.table.round.bids = [{ who: 1, q: 3, f: 4, p: 0.9, held: 2, bluff: false, habit: null }];
    T.table.round.turn = 2; T.table.wait = null;
    const e1 = ok(E.advance(T));
    if (!find(e1, 'call', c => c.kind === 'spot')) continue;
    assert.strictEqual(E.view(T).table.side.kind, 'spot');
    const e2 = ok(E.act(T, { t: 'side', pick: 'caller' }));
    deq(find(e2, 'trick', e => e.id === 'sidebet').right, find(e2, 'reveal').exact);
    break;
  }
});

test('Side Bet: a night with it is deterministic, and survives a JSON round-trip at the prompt', () => {
  let prompts = 0;
  for (const seed of ['sbn1', 'sbn2', 'sbn3']) {
    const a = E.playNight(seed, null, { keepEvents: true, tricks: ['sidebet'] }), b = E.playNight(seed, null, { keepEvents: true, tricks: ['sidebet'] });
    assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events));
    prompts += a.events.filter(e => e.t === 'wait' && e.need === 'side').length;
  }
  assert.ok(prompts > 3, 'prompts ' + prompts);
  let checked = 0;
  for (let i = 0; i < 20 && checked < 3; i++) {
    const S = E.newNight({ seed: 'sbrt' + i, tricks: ['sidebet'] });
    while (S.phase !== 'over' && !(S.phase === 'table' && S.table.wait === 'side')) ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S))));
    if (S.phase === 'over') continue;
    const copy = J(S), evA = [], evB = [];
    while (S.phase !== 'over') evA.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S)))));
    while (copy.phase !== 'over') evB.push(...ok(E.act(copy, E.basicPolicy(copy, E.view(copy), E.legal(copy)))));
    assert.strictEqual(JSON.stringify(evA), JSON.stringify(evB));
    checked++;
  }
  assert.ok(checked >= 1);
});
test('tableEnd carries the table\'s net: buy-in, antes, bonuses, pot and refund, to the dollar', () => {
  let n = 0, tab = 0;
  for (let i = 0; i < 120; i++) {
    const tricks = i % 3 === 0 ? ['sticky', 'snake', 'sidebet', 'housemoney'] : i % 3 === 1 ? ['tab'] : [];
    const S = E.newNight({ seed: 'net' + i, tricks });
    const h = i % 4; S.hour = h; S.cash = i % 3 === 1 ? 10 : 1e5;
    const k = i % 2;
    const before = S.cash;
    let ev = ok(E.act(S, { t: 'sit', i: k }));
    const got = ev.slice();
    for (let g = 0; S.phase === 'table'; g++) { ev = ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))); got.push(...ev); }
    const end = find(got, 'tableEnd');
    const sum = all(got, 'pay').reduce((a, p) => a + p.amount, 0);
    assert.strictEqual(end.net, sum, 'net = every pay at the table');
    assert.strictEqual(end.net, end.cash - before);
    assert.strictEqual(S.log[S.log.length - 1].net, end.net);
    assert.strictEqual(E.summary(S).tables[E.summary(S).tables.length - 1].net, end.net);
    const side = all(got, 'pay').filter(p => !['buyin', 'pot', 'refund'].includes(p.why)).reduce((a, p) => a + p.amount, 0);
    assert.strictEqual(end.net, (end.won ? end.payout : 0) + end.refund - (find(got, 'sit').onTab ? 0 : find(got, 'sit').buyIn) + side);
    if (find(got, 'sit').onTab) { tab++; if (!end.won) assert.ok(end.net >= -before, 'a lost Tab owes no buy-in (antes come out of what you have)'); }
    n++;
  }
  assert.ok(n === 120 && tab > 0);
});

test('House Money: pots you win pay 25% more', () => {
  const S = rig({ tricks: ['housemoney'], dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  const ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'tableEnd').payout, 75);
  deq(find(ev, 'trick', e => e.id === 'housemoney'), { t: 'trick', id: 'housemoney', extra: 15 });
});

test('A Tab: sit at a table you cannot afford; the buy-in comes out of a win; lose and owe nothing; used up', () => {
  let S = E.newNight({ seed: 'tab', tricks: ['tab'] }); S.cash = 10;
  S.offers[0][0] = { kind: 'easy', hour: 0, seats: 3, buyIn: 20, rule: null, people: ['npc_colt', 'npc_dewayne'] };
  assert.ok(E.options(S)[0].viaTab && E.options(S)[0].affordable);
  let ev = ok(E.sit(S, 0));
  assert.ok(find(ev, 'trick', e => e.id === 'tab')); assert.ok(!pays(ev, 'buyin').length);
  assert.strictEqual(S.tricks.length, 0); assert.ok(S.table.onTab);
  arm(S, { dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'tableEnd').payout, 60 - 20);
  S = E.newNight({ seed: 'tab', tricks: ['tab'] }); S.cash = 10;
  S.offers[0][0] = { kind: 'easy', hour: 0, seats: 3, buyIn: 20, rule: null, people: ['npc_colt', 'npc_dewayne'] };
  E.sit(S, 0);
  arm(S, { dice: [[2], [4, 4], [5]], bids: [{ who: 1, q: 2, f: 4 }], cash: 10 });
  S.cash = 10;
  ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'tableEnd').payout, 0); assert.strictEqual(S.cash, 10 - 3);
  const N = E.newNight({ seed: 'tab' }); N.cash = 10;
  assert.ok(!E.options(N).some(o => o.affordable));
});

test('Double or Nothing: a Liar call for 2 dice: right and the bidder loses 2, wrong and you lose only 1', () => {
  let ev;
  let S;
  S = rig({ tricks: ['double'], dice: [[2, 3], [4, 4], [5, 6, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar', double: true }));
  deq(find(ev, 'lose'), { t: 'lose', who: 2, id: 'npc_dewayne', n: 2, left: 1 });
  deq(find(ev, 'trick', e => e.id === 'double'), { t: 'trick', id: 'double', who: 2, n: 2, left: 1 });
  S = rig({ tricks: ['double'], dice: [[2, 3, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar', double: true }));
  deq(find(ev, 'lose'), { t: 'lose', who: 0, id: 'me', n: 1, left: 2 });
  deq(pays(ev).map(p => p.amount), [-3], 'the ante as usual');
  S = rig({ tricks: ['double'], dice: [[2, 3, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  assert.strictEqual(find(ok(E.act(S, { t: 'liar' })), 'lose').n, 1, 'a plain call stays for 1');
  // Sudden: 4 for them, 2 for you.
  S = rig({ tricks: ['double'], rule: 'sudden', dice: [[2, 3], [4, 4], [5, 6, 6, 6, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  assert.strictEqual(find(ok(E.act(S, { t: 'liar', double: true })), 'lose').n, 4);
  S = rig({ tricks: ['double'], rule: 'sudden', dice: [[2, 3, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  assert.strictEqual(find(ok(E.act(S, { t: 'liar', double: true })), 'lose').n, 2);
  assert.ok(isErr(E.act(rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] }), { t: 'liar', double: true })));
  assert.ok(isErr(E.act(rig({ tricks: ['double'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] }), { t: 'spot', double: true })));
});
test('Double or Nothing: twice a table; a third call for 2 is refused; the next table has both again', () => {
  const S = rig({ tricks: ['double'], dice: [[2, 3, 3], [4, 4, 4], [5, 6, 6]], bids: [{ who: 2, q: 5, f: 4 }] });
  deq(E.view(S).table.double, { left: 2, uses: 2 });
  assert.ok(E.legal(S).canDouble);
  let ev = ok(E.act(S, { t: 'liar', double: true }));
  deq(find(ev, 'trick', e => e.id === 'double'), { t: 'trick', id: 'double', who: 2, n: 2, left: 1 });
  assert.strictEqual(E.view(S).table.double.left, 1, 'one spent, whichever way the call went');
  // The second: a wrong call for 2 still spends it (and costs only 1).
  arm(S, { dice: [[2, 3, 3], [4, 4, 4], [5, 6, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar', double: true }));
  deq(find(ev, 'trick', e => e.id === 'double'), { t: 'trick', id: 'double', who: 0, n: 1, left: 0 });
  // None left: the call for 2 is refused with a clear error and changes nothing; a plain Liar still goes.
  arm(S, { dice: [[2, 3, 3], [4, 4, 4], [5, 6, 6]], bids: [{ who: 2, q: 5, f: 4 }] });
  deq(E.view(S).table.double, { left: 0, uses: 2 });
  assert.ok(!E.legal(S).canDouble && E.legal(S).canLiar);
  const before = J(S);
  ev = E.act(S, { t: 'liar', double: true });
  assert.ok(isErr(ev)); assert.match(ev[0].msg, /used up at this table/);
  deq(S, before, 'a refused call changes nothing');
  ev = ok(E.act(S, { t: 'liar' }));
  assert.strictEqual(find(ev, 'lose', e => e.who === 2).n, 1);
  assert.ok(!find(ev, 'trick', e => e.id === 'double'));
  // The next table starts with both again.
  const T0 = S.table;
  for (let g = 0; !(S.phase === 'table' && S.table !== T0); g++) { assert.ok(S.phase !== 'over' && g < 5000); ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))); }
  deq(E.view(S).table.double, { left: 2, uses: 2 });
  // Not held: no count in the view, no call for 2.
  const N = rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  assert.strictEqual(E.view(N).table.double, null); assert.ok(!E.legal(N).canDouble);
  // Last Call: a manner trick, so it works there too, twice.
  const LC = rig({ hour: 4, tricks: ['double'] });
  assert.strictEqual(E.view(LC).table.double.left, 2);
});
test('Honest Face (direct): the caller of your good bid loses 2', () => {
  // Seat 1 calls Liar on our 1x4 only if it doubts it; make it a sure call for a bot by
  // checking the rule through the engine's own challenge path from a rigged bot turn.
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) {
    const S = rig({ seed: 'hfd' + i, tricks: ['honest'], dice: [[4, 4, 4, 4, 4], [2, 2, 3], [3]] });
    S.table.round.bids = [{ who: 0, q: 5, f: 4, p: 1, held: 5, bluff: false, habit: null }];
    S.table.round.turn = 1; S.table.wait = null;
    const ev = E.advance(S);
    const c = find(ev, 'call');
    if (c && c.kind === 'liar' && c.on.who === 0) {
      const good = find(ev, 'reveal').good;
      if (good) { hit = true; assert.ok(find(ev, 'trick', e => e.id === 'honest')); deq(find(ev, 'lose', e => e.who === 1), { t: 'lose', who: 1, id: 'npc_colt', n: 2, left: 1 }); }
    }
  }
  assert.ok(hit);
  // Without the trick the caller loses one.
  const S = rig({ seed: 'hfd0', dice: [[4, 4, 4, 4, 4], [2, 2, 3], [3]] });
  S.table.round.bids = [{ who: 0, q: 5, f: 4, p: 1, held: 5, bluff: false, habit: null }];
  S.table.round.turn = 1; S.table.wait = null;
  const ev = E.advance(S);
  if (find(ev, 'call', c => c.kind === 'liar')) assert.strictEqual(find(ev, 'lose').n, 1);
});

test('Close Enough: your called bid that misses by one costs no die (you still pay)', () => {
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) {
    const S = rig({ seed: 'ce' + i, tricks: ['close'], dice: [[4, 4], [2, 3], [5, 6]] });
    S.table.round.bids = [{ who: 0, q: 3, f: 4, p: 0.3, held: 2, bluff: true, habit: null }];
    S.table.round.turn = 1; S.table.wait = null;
    const ev = E.advance(S);
    const c = find(ev, 'call');
    if (c && c.kind === 'liar' && c.on.who === 0) {
      hit = true;
      assert.strictEqual(find(ev, 'reveal').count, 2);
      assert.ok(find(ev, 'trick', e => e.id === 'close'));
      assert.ok(!find(ev, 'lose', e => e.who === 0));
      deq(pays(ev).map(p => p.amount), [-3]);
    }
  }
  assert.ok(hit);
});

test('Last Word: once per table, when you would be knocked out, you stay with one die', () => {
  const S = rig({ tricks: ['lastword'], dice: [[2], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  let ev = ok(E.act(S, { t: 'liar' }));
  assert.ok(find(ev, 'trick', e => e.id === 'lastword')); assert.ok(!find(ev, 'out')); assert.strictEqual(S.table.seats[0].n, 1);
  arm(S, { dice: [[2], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar' }));
  assert.ok(find(ev, 'out', e => e.who === 0));
});

test('Poker Face and dice tricks at Last Call', () => {
  const S = rig({ hour: 4, tricks: ['shaved', 'sticky', 'pokerface'] });
  assert.strictEqual(S.table.kind, 'last'); assert.strictEqual(S.table.ante, 0);
  const v = E.view(S);
  deq(v.tricks.map(t => [t.id, t.asleep]), [['shaved', true], ['sticky', false], ['pokerface', false]]);
  deq(S.table.round ? S.table.round.fixed : [], []);
  assert.ok(S.table.seats[0].dice.length === 5 || !S.table.round);
});

// ===================================================================== the back room
test('the back room: prices by hour and rarity, Friends Rates, reroll, sell, 5 slots', () => {
  const S = E.newNight({ seed: 'shop' });
  deq([0, 1, 2, 3].map(h => SIM.price(S, 'loaded', h)), [15, 30, 55, 90]);
  deq([0, 1, 2, 3].map(h => SIM.price(S, 'mirror', h)), [30, 60, 105, 180]);
  deq([0, 1, 2, 3].map(h => SIM.price(S, 'shaved', h)), [55, 110, 195, 330]);
  S.tricks.push({ id: 'friends', paid: 15 });
  deq([0, 1, 2, 3].map(h => SIM.price(S, 'shaved', h)), [40, 85, 145, 250]);
  // Into the shop.
  const T = E.newNight({ seed: 'shop' });
  T.phase = 'shop'; T.cash = 300; T.shop = { hour: 1, offers: ['loaded', 'mirror', 'shaved'], rerolls: 0 };
  let ev = ok(E.act(T, { t: 'buy', i: 1 }));
  deq(find(ev, 'buy'), { t: 'buy', id: 'mirror', price: 60 });
  assert.strictEqual(T.cash, 240); assert.strictEqual(T.shop.offers[1], null);
  assert.ok(isErr(E.act(T, { t: 'buy', i: 1 })));
  ev = ok(E.act(T, { t: 'sell', id: 'mirror' }));
  deq(find(ev, 'sell'), { t: 'sell', id: 'mirror', price: 30 });
  assert.strictEqual(T.cash, 270);
  const before = T.shop.offers.slice();
  ev = ok(E.act(T, { t: 'reroll' })); assert.strictEqual(find(ev, 'reroll').price, 10);
  ev = ok(E.act(T, { t: 'reroll' })); assert.strictEqual(find(ev, 'reroll').price, 20);
  assert.strictEqual(T.cash, 240); assert.strictEqual(E.shopView(T).rerollPrice, 30);
  assert.strictEqual(T.shop.offers.length, 3); assert.ok(T.shop.offers.every(id => !T.tricks.some(t => t.id === id)));
  void before;
  T.cash = 5; assert.ok(isErr(E.act(T, { t: 'reroll' })));
  // Five slots.
  T.cash = 10000; T.tricks = ['sticky', 'snake', 'close', 'rabbit', 'nod'].map(id => ({ id, paid: 10 }));
  T.shop.offers = ['loaded', 'mirror', 'shaved'];
  assert.ok(isErr(E.act(T, { t: 'buy', i: 0 })));
  deq(E.legal(T).buy, []);
  assert.ok(E.shopView(T).offers.every(o => !o.affordable));
  // Offers never repeat a trick you hold.
  for (let k = 0; k < 20; k++) { ok(E.act(T, { t: 'reroll' })); assert.ok(T.shop.offers.every(id => !['sticky', 'snake', 'close', 'rabbit', 'nod'].includes(id)) && new Set(T.shop.offers).size === 3); }
});

test('Friends Rates: tricks cost a quarter less, and Curtis shows four offers (rerolls too), never one you hold', () => {
  const S = E.newNight({ seed: 'fr', tricks: ['friends'] });
  deq([0, 1, 2, 3].map(h => SIM.price(S, 'shaved', h)), [40, 85, 145, 250]);
  // Into the back room after a table: four offers.
  const T = rig({ tricks: ['friends'], dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  const ev = ok(E.act(T, { t: 'liar' }));
  assert.strictEqual(T.phase, 'shop');
  assert.strictEqual(find(ev, 'shop').offers.length, 4);
  assert.strictEqual(E.shopView(T).offers.length, 4);
  assert.ok(E.shopView(T).offers.every(o => o.id !== 'friends'));
  T.cash = 1000;
  for (let k = 0; k < 10; k++) { ok(E.act(T, { t: 'reroll' })); assert.strictEqual(new Set(T.shop.offers).size, 4); assert.ok(!T.shop.offers.includes('friends')); }
  ok(E.act(T, { t: 'buy', i: 3 }));
  assert.strictEqual(E.shopView(T).offers[3], null);
  // Sold, it is three again at the next visit.
  const U = rig({ dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  assert.strictEqual(find(ok(E.act(U, { t: 'liar' })), 'shop').offers.length, 3);
  const W = rig({ tricks: ['friends'], dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  ok(E.act(W, { t: 'liar' })); ok(E.act(W, { t: 'sell', id: 'friends' })); W.cash = 1000; ok(E.act(W, { t: 'reroll' }));
  assert.strictEqual(W.shop.offers.length, 3);
});

test('builds: a small fixed table of tricks that go together; an offer and a held trick name the partners you hold', () => {
  const ids = E.TRICKS.map(t => t.id);
  assert.ok(E.BUILDS.length >= 5);
  E.BUILDS.forEach(b => { assert.ok(b.id && b.name && b.tricks.length >= 3, b.id); b.tricks.forEach(id => assert.ok(ids.includes(id), id)); });
  deq(E.BUILDS.map(b => b.id), ['ones', 'sixes', 'calling', 'bluffing', 'reading']);
  for (const id of ['loaded', 'slowroll', 'palm', 'sidebet', 'snake', 'pokerface', 'double']) assert.ok(E.BUILDS.some(b => b.tricks.includes(id)), id + ' is in a build');
  deq(E.partners('loaded'), ['slowroll', 'palm']);
  deq(E.partners('snake'), ['shaved', 'hothand', 'barmirror', 'nod', 'sticky', 'double']);
  // Partners go both ways.
  for (const a of ids) for (const b of E.partners(a)) assert.ok(E.partners(b).includes(a), a + '/' + b);
  assert.ok(!E.partners('loaded').includes('loaded'));
  // In the back room: the offer says which of yours it goes with.
  const S = E.newNight({ seed: 'bld', tricks: ['shaved', 'palm'] });
  S.phase = 'shop'; S.cash = 1000; S.shop = { hour: 1, offers: ['snake', 'loaded', 'mirror'], rerolls: 0 };
  const v = E.shopView(S);
  deq(v.offers.map(o => o.goesWith), [['shaved'], ['palm'], []]);
  deq(v.held.map(h => [h.id, h.goesWith]), [['shaved', []], ['palm', []]]);
  ok(E.act(S, { t: 'buy', i: 0 }));
  deq(E.shopView(S).held.map(h => [h.id, h.goesWith]), [['shaved', ['snake']], ['palm', []], ['snake', ['shaved']]]);
  deq(E.view(S).tricks.map(t => t.goesWith), [['snake'], [], ['shaved']]);
});

test('the back room opens after every table with 3 offers, deterministic from the seed', () => {
  const a = rig({ dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  const evA = ok(E.act(a, { t: 'liar' }));
  const b = rig({ dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  const evB = ok(E.act(b, { t: 'liar' }));
  assert.strictEqual(a.phase, 'shop');
  assert.strictEqual(find(evA, 'shop').offers.length, 3);
  deq(find(evA, 'shop'), find(evB, 'shop'));
});

// ===================================================================== endings
test('the four endings: bust, walked, house, cleaned (and walking home from Last Call)', () => {
  let S = E.newNight({ seed: 'end' }); S.phase = 'shop'; S.cash = 10; S.shop = { hour: 0, offers: ['loaded', 'mirror', 'shaved'], rerolls: 0 };
  let ev = ok(E.act(S, { t: 'leave' }));
  deq(find(ev, 'nightEnd').ending, 'bust'); assert.strictEqual(S.phase, 'over');
  assert.ok(isErr(E.act(S, { t: 'leave' })));
  S = E.newNight({ seed: 'end', tricks: ['tab'] }); S.phase = 'shop'; S.cash = 10; S.shop = { hour: 0, offers: ['loaded', 'mirror', 'shaved'], rerolls: 0 };
  ok(E.act(S, { t: 'leave' })); assert.strictEqual(S.phase, 'choose', 'A Tab keeps you in');
  S = E.newNight({ seed: 'end' }); S.phase = 'shop'; S.hour = 3; S.cash = 499; S.shop = { hour: 3, offers: ['loaded', 'mirror', 'shaved'], rerolls: 0 };
  ev = ok(E.act(S, { t: 'leave' }));
  assert.strictEqual(find(ev, 'nightEnd').ending, 'walked'); assert.strictEqual(S.cash, 499);
  S = E.newNight({ seed: 'end' }); S.phase = 'shop'; S.hour = 3; S.cash = 500; S.shop = { hour: 3, offers: ['loaded', 'mirror', 'shaved'], rerolls: 0 };
  ev = ok(E.act(S, { t: 'leave' }));
  assert.strictEqual(S.phase, 'choose'); assert.strictEqual(find(ev, 'hour').options[0].kind, 'last');
  assert.strictEqual(E.options(S)[0].buyIn, 500); assert.strictEqual(E.options(S)[0].pot, 1500);
  deq(E.options(S)[0].people.map(p => p.id), ['npc_loretta', 'npc_curtis']);
  const W = J(S);
  assert.strictEqual(find(ok(E.act(W, { t: 'walk' })), 'nightEnd').ending, 'walked');
  // House: win Loretta's table, cash triples.
  const H = rig({ hour: 4, cash: 600 });
  assert.strictEqual(H.cash, 0);
  arm(H, { dice: [[2], [4], []], bids: [{ who: 1, q: 2, f: 4 }] });
  ev = ok(E.act(H, { t: 'liar' }));
  assert.strictEqual(find(ev, 'nightEnd').ending, 'house'); assert.strictEqual(H.cash, 1800);
  assert.ok(!pays(ev, 'won').length, 'no antes at Last Call');
  // Cleaned: lose it, leave with nothing.
  const C = rig({ hour: 4, cash: 600 });
  arm(C, { dice: [[2], [4, 4], [5]], bids: [{ who: 1, q: 2, f: 4 }] });
  ev = ok(E.act(C, { t: 'liar' }));
  assert.strictEqual(find(ev, 'nightEnd').ending, 'cleaned'); assert.strictEqual(C.cash, 0);
  assert.ok(E.shareLine(H).includes('beat the house') && E.shareLine(H).includes('$1,800') && E.shareLine(H).endsWith('👑'));
});

// ===================================================================== write-ups, barks, summary
test('summary, share line, Pearl\'s column, prompt facts and barks', () => {
  const heads = new Set(), endings = new Set();
  for (let i = 0; i < 40; i++) {
    const { S, events } = E.playNight('col' + i, null, { keepEvents: true });
    const c = E.column(S);
    heads.add(c.headline); endings.add(S.ending);
    const words = c.body.split(/\s+/).length;
    assert.ok(words >= 35 && words <= 170, 'column length ' + words);
    assert.strictEqual(c.byline, 'By Pearl Gentry');
    assert.ok(/^[A-Z' ,]+$/.test(c.headline));
    const sm = E.summary(S);
    assert.strictEqual(sm.cash, S.cash); assert.strictEqual(sm.tables.length, S.log.length); assert.strictEqual(sm.ending, S.ending);
    assert.ok(E.columnFacts(S).split('\n').length >= 2);
    assert.ok(E.shareLine(S).startsWith('Bones · night col' + i + ' · '));
    const k = events.findIndex(e => e.t === 'reveal');
    if (k > 0) {
      const from = events.slice(0, k).map(e => e.t).lastIndexOf('call');
      const tf = E.talkFacts(S, events.slice(from, k + 12));
      assert.ok(tf.includes('called') && tf.includes('There were'));
    }
    all(events, 'bark').forEach(b => { assert.ok(typeof b.text === 'string' && b.text.length > 1 && b.text.length < 60); assert.ok(b.who > 0); });
    assert.ok(all(events, 'bark').length > 0);
  }
  assert.ok(heads.size >= 4, 'varied headlines');
  const d = E.playNight('x', null, { daily: '2026-11-21' }).S;
  assert.ok(/^Bones · 2026-11-21 · (beat the house|cleaned out at Last Call|walked home|went bust) · \$[\d,]+ · /.test(E.shareLine(d)), E.shareLine(d));
  // Barks are deterministic.
  const b1 = all(E.playNight('bark', null, { keepEvents: true }).events, 'bark'), b2 = all(E.playNight('bark', null, { keepEvents: true }).events, 'bark');
  deq(b1, b2);
});

// ===================================================================== the practice hand
test('the practice hand: set cups and set moves, the first round open, no money, the same every time', () => {
  const { S, events } = E.lesson();
  assert.strictEqual(S.lesson, true);
  deq(events.map(e => e.t), ['sit', 'roll', 'bid', 'bid', 'wait']);
  const sit = events[0], roll = events[1];
  deq(sit.seats.map(x => x.id), ['me', 'npc_glenda', 'npc_gerald']);
  deq([sit.buyIn, sit.ante, sit.pot, sit.lesson], [0, 0, 0, true]);
  deq(roll.mine, [3, 3, 1]);
  deq(roll.cups, [[3, 3, 1], [3, 1, 6], [2, 5, 4]]);
  deq(events.filter(e => e.t === 'bid').map(e => [e.who, e.q, e.f, e.habit]), [[1, 4, 3, null], [2, 6, 3, null]]);
  const v = E.view(S).table;
  deq(v.cups, roll.cups, 'round one: every cup open');
  assert.strictEqual(v.wait, 'turn');
  // Liar on six 3s: there are five (the 1s count), Gerald loses a die, and no money moves.
  const ev2 = ok(E.act(S, { t: 'liar' }));
  const rv = find(ev2, 'reveal');
  deq([rv.count, rv.good, rv.q, rv.f], [5, false, 6, 3]);
  deq(find(ev2, 'lose'), { t: 'lose', who: 2, id: 'npc_gerald', n: 1, left: 2 });
  deq(pays(ev2), []);
  deq(find(ev2, 'readout').bids.map(x => [x.id, x.bluff]), [['npc_glenda', false], ['npc_gerald', true]], 'her bid honest by her cup, his a bluff');
  assert.strictEqual(S.cash, E.START_CASH);
  // Round two: Gerald opens, cups shut; two 5s is certain by your 5, 5, 1.
  const ev3 = ok(E.act(S, { t: 'next' }));
  const r2 = find(ev3, 'roll');
  deq(r2.mine, [5, 5, 1]);
  assert.strictEqual(r2.cups, undefined);
  assert.strictEqual(E.view(S).table.cups, null, 'round two: shut');
  assert.strictEqual(r2.opener, 2);
  deq(all(ev3, 'bid').map(e => [e.who, e.q, e.f]), [[2, 2, 5]]);
  assert.strictEqual(E.count(S, 2, 5), 1);
  ok(E.act(S, { t: 'bid', q: 4, f: 5 }));
  const b = E.view(S).table.bid, h = E.view(S).table.history.slice(-1)[0].habit;
  deq([b.who, b.q, b.f], [2, 7, 5]);
  assert.ok(E.count(S, 7, 5) <= 0.15 && E.count(S, 7, 5) > 0, 'clearly low: ' + E.count(S, 7, 5));
  assert.strictEqual(h.i, SIM.person('npc_gerald').tell, 'the habit with the bluff is his tell');
  const ev5 = ok(E.act(S, { t: 'liar' }));
  deq([find(ev5, 'reveal').count, find(ev5, 'reveal').good], [4, false]);
  assert.ok(find(ev5, 'readout').bids.find(x => x.id === 'npc_gerald' && x.q === 7).bluff);
  assert.strictEqual(S.cash, E.START_CASH);
  // Pure: the same every time, a JSON copy plays on the same, and the moves are the script's only while they fit.
  deq(E.lesson(), E.lesson());
  const A = E.lesson().S, Bc = J(A);
  deq(E.act(A, { t: 'liar' }), E.act(Bc, { t: 'liar' }));
  const off = E.lesson().S;
  ok(E.act(off, { t: 'bid', q: 7, f: 3 }));                 // off the script: the bots take over, legally
  assert.ok(['turn', 'next'].includes(E.legal(off).need));
});

test('the practice hand leaves real nights alone: no open cups, no lesson flag, no script', () => {
  for (let i = 0; i < 40; i++) {
    const { S, events } = E.playNight('nolesson' + i, null, { keepEvents: true });
    assert.ok(!S.lesson);
    all(events, 'roll').forEach(e => assert.strictEqual(e.cups, undefined));
    all(events, 'sit').forEach(e => assert.strictEqual(e.lesson, undefined));
  }
  const S = rig({ dice: [[3, 3, 1], [3, 1, 6], [2, 5, 4]] });
  assert.strictEqual(E.view(S).table.cups, null);
  // Engine.LESSON is data for the page and never names the tell.
  assert.ok(!JSON.stringify(E.LESSON).includes('"habit":0') && JSON.stringify(E.LESSON).includes('"habit":"tell"'));
});

// ===================================================================== the room reads you back
// A table with a sharp person on your left (Hollis, tier 4) and a plain one (Dewayne, tier 2), your bid in front of
// Hollis, and the room's notes on you set by hand: { all, <shape>: {n, b} }.
function readRig(o) {
  o = o || {};
  const S = rig({ seed: o.seed || 'read', tricks: o.tricks || [], people: o.people || ['npc_hollis', 'npc_dewayne'], dice: o.dice || [[2, 3, 4, 6], [2, 3, 5, 6], [2, 4, 5, 6]] });
  S.you = { tonight: J(o.tally || {}), prior: {}, fired: [] };
  const T = S.table, R = T.round;
  R.bids = [{ who: 2, q: 3, f: 5, p: 0.5, held: 1, bluff: false, habit: null }, { who: 0, q: o.q || 4, f: o.f || 5, p: 0.2, held: 0, bluff: o.bluff !== false, habit: null, shape: o.shape || ['step', 'stay'] }];
  R.opener = 2; R.turn = o.turn || 1; T.wait = null;
  return S;
}
const TOLD = { all: { n: 40, b: 8 }, step: { n: 14, b: 11 }, stay: { n: 10, b: 9 }, switch: { n: 20, b: 2 }, jump: { n: 6, b: 0 } };

test('the shape of a bid: an opener low or high; a raise by face, one or a jump, staying on the face or switching', () => {
  const sh = SIM.shapeOf;
  deq(sh(3, 4, null, 12, true), ['low']); deq(sh(4, 4, null, 12, true), ['low']); deq(sh(5, 2, null, 12, true), ['high']);
  deq(sh(3, 4, null, 12, false), ['high'], 'under Straight a face is rarer: 3 of 12 is a high opener');
  deq(sh(4, 5, { q: 4, f: 3 }, 12, true), ['face', 'switch']);
  deq(sh(5, 3, { q: 4, f: 3 }, 12, true), ['step', 'stay']);
  deq(sh(5, 6, { q: 4, f: 3 }, 12, true), ['step', 'switch']);
  deq(sh(7, 3, { q: 4, f: 3 }, 12, true), ['jump', 'stay']);
  deq(sh(6, 2, { q: 4, f: 3 }, 12, true), ['jump', 'switch']);
  deq(E.SHAPES.map(x => x.id), ['low', 'high', 'face', 'step', 'jump', 'stay', 'switch']);
  // Your bids carry their shapes into the readout; nobody else's do.
  const { events } = E.playNight('shapes', null, { keepEvents: true });
  let mine = 0;
  all(events, 'readout').forEach(r => r.bids.forEach((b, k) => {
    if (b.id !== 'me') { assert.strictEqual(b.shape, undefined); return; }
    mine++;
    const prev = k ? r.bids[k - 1] : null;
    assert.ok(Array.isArray(b.shape) && b.shape.length === (prev ? 2 : 1), JSON.stringify(b));
    if (prev) assert.strictEqual(b.shape[1], b.f === prev.f ? 'stay' : 'switch');
  }));
  assert.ok(mine > 10);
});

test('the tally: every bid of yours a reveal shows is scored under its shapes; a tell needs 6 bids and a 25-point gap, either way', () => {
  const { S, events } = E.playNight('tally', null, { keepEvents: true });
  const want = {};
  all(events, 'readout').forEach(r => r.bids.forEach(b => { if (b.id !== 'me') return; ['all'].concat(b.shape).forEach(k => { const x = want[k] = want[k] || { n: 0, b: 0 }; x.n++; if (b.bluff) x.b++; }); }));
  deq(S.you.tonight, want);
  assert.strictEqual(S.you.tonight.all.n, S.stats.bids, 'every bid you made was scored (every round ends at a reveal)');
  const tells = SIM.tellsIn;
  deq(tells({ all: { n: 30, b: 6 }, step: { n: 5, b: 5 } }), [], 'five bids are not enough');
  deq(tells({ all: { n: 30, b: 6 }, step: { n: 6, b: 3 } }).map(x => [x.shape, x.dir]), [['step', 'bluff']], '50% against 20%');
  deq(tells({ all: { n: 30, b: 6 }, step: { n: 10, b: 4 } }), [], '40% against 20% is no tell');
  deq(tells({ all: { n: 30, b: 12 }, jump: { n: 8, b: 0 } }).map(x => [x.shape, x.dir, x.text]), [['jump', 'honest', 'you only jump two or more when you’ve got it']]);
  deq(tells(TOLD).map(x => x.shape), ['stay', 'step'], 'the strongest first');
  assert.strictEqual(tells(TOLD)[1].text, 'you step up by one when you’ve got nothing');
});

test('who reads you: tiers 1 and 2 never, tier 3 by half, tiers 4, 5 and the house fully; only your bid, only a shape that is a tell', () => {
  const S = readRig({ tally: TOLD });
  const rd = SIM.readOf(S, 1);
  assert.ok(rd && rd.shape === 'stay' && rd.dir === 'bluff' && rd.delta > 0.2, JSON.stringify(rd));
  assert.strictEqual(SIM.readOf(S, 2), null, 'Dewayne (tier 2) never reads you');
  const tier = id => SIM.person(id).tier;
  for (const id of E.PEOPLE.map(p => p.id)) {
    const X = readRig({ tally: TOLD, people: [id, 'npc_dewayne'] }), r = SIM.readOf(X, 1);
    if (tier(id) <= 2) assert.strictEqual(r, null, id);
    else assert.ok(Math.abs(r.delta - rd.delta * SIM.READS[tier(id)]) < 1e-9, id);
  }
  assert.strictEqual(SIM.READS[3], 0.5); assert.strictEqual(SIM.READS[4], 1); assert.strictEqual(SIM.READS[5], 1);
  // Not a shape with no tell in it, not with no notes, not someone else's bid.
  assert.strictEqual(SIM.readOf(readRig({ tally: TOLD, shape: ['jump', 'switch'] }), 1), null);
  assert.strictEqual(SIM.readOf(readRig({ tally: {} }), 1), null);
  const O = readRig({ tally: TOLD }); assert.strictEqual(SIM.readOf(O, 1, O.table.round.bids[0]), null);
  // An honest tell reads the other way.
  const H = readRig({ tally: { all: { n: 40, b: 14 }, jump: { n: 10, b: 0 } }, shape: ['jump', 'switch'] });
  assert.ok(SIM.readOf(H, 1).delta < 0 && SIM.readOf(H, 1).dir === 'honest');
  // A sharp reader with a bluff tell calls your bid more; a plain one is exactly as it was.
  const calls = (people, tally) => { let c = 0; for (let i = 0; i < 300; i++) { const X = readRig({ seed: 'rc' + i, people, tally }); if (SIM.botMove(X, 1).t === 'liar') c++; } return c; };
  const sharpWith = calls(['npc_hollis', 'npc_dewayne'], TOLD), sharpWithout = calls(['npc_hollis', 'npc_dewayne'], {});
  assert.ok(sharpWith > sharpWithout + 30, `Hollis calls ${sharpWith} with your tell on record, ${sharpWithout} without`);
  assert.strictEqual(calls(['npc_vada', 'npc_hollis'], TOLD), calls(['npc_vada', 'npc_hollis'], {}), 'Vada (tier 2) plays the same');
  // The 9 PM tables seat tiers 1 and 2: nobody there can read you, so a night's early tables play out the same with notes or without.
  const plain = E.playNight('nine', null, { keepEvents: true }), told = E.newNight({ seed: 'nine' });
  told.you.prior = J(TOLD);
  let g = 0; const ev2 = [];
  while (told.phase !== 'over' && told.hour === 0) { ev2.push(...ok(E.act(told, E.basicPolicy(told, E.view(told), E.legal(told), E)))); assert.ok(++g < 5000); }
  const cut = ev => ev.slice(0, ev.findIndex(e => e.t === 'shop') + 1).filter(e => e.t !== 'readout').map(e => JSON.stringify(e));
  deq(cut(ev2), cut(plain.events));
});

test('the reveal says so only when a read changed the call, once per shape a table; the night counts every one', () => {
  let changed = 0, same = 0;
  // Cups that vary with the seed (a little generator of its own), so Hollis's cup sometimes backs your bid and sometimes not.
  const cups = i => { let x = i * 2654435761 >>> 0; const d = () => { x = (x * 1103515245 + 12345) >>> 0; return 1 + (x >>> 16) % 6; }; return [0, 1, 2].map(() => [d(), d(), d(), d()]); };
  for (let i = 0; i < 300; i++) {
    const S = readRig({ seed: 'rv' + i, tally: TOLD, dice: cups(i) });
    const rng = S.rng, m0 = SIM.botMove(S, 1, true); S.rng = rng;
    const m1 = SIM.botMove(S, 1); S.rng = rng;
    // (a bluff tell can only be said to have decided a call)
    const differs = (m0.t === 'liar') !== (m1.t === 'liar') && m1.t === 'liar';
    const ev = ok(E.advance(S));
    const ro = find(ev, 'readout'), reads = ro ? ro.reads : S.table.round && S.table.round.reads;
    const fired = S.you.fired.filter(r => r.id === 'npc_hollis');
    if (differs) {
      changed++;
      assert.ok(reads && reads.length >= 1 && reads[0].shape === 'stay', 'seed ' + i);
      assert.ok(fired.length >= 1);
      if (ro && find(ev, 'call', c => c.who === 1 && c.on.who === 0)) {
        const r = ro.reads[0];
        assert.strictEqual(r.kind, 'call'); assert.strictEqual(r.right, !find(ev, 'reveal').good);
        assert.strictEqual(r.text, r.right ? 'Hollis had you read: you stay on the last bid’s face when you’ve got nothing.' : 'Hollis thought he had you read (you stay on the last bid’s face when you’ve got nothing) and called. Not this time.');
      }
    } else {
      same++;
      assert.ok(!fired.length, 'no read fired when the call was the same without it: seed ' + i);
    }
  }
  assert.ok(changed > 20 && same > 20, `${changed} changed, ${same} the same`);
  // An honest tell can only let a bid stand, and the line says so.
  const HON = { all: { n: 40, b: 16 }, jump: { n: 12, b: 0 } };
  let stood = 0;
  for (let i = 0; i < 300; i++) {
    const S = readRig({ seed: 'st' + i, tally: HON, dice: cups(i), shape: ['jump', 'switch'], q: 6, bluff: false });
    const rng = S.rng, m0 = SIM.botMove(S, 1, true); S.rng = rng;
    const m1 = SIM.botMove(S, 1); S.rng = rng;
    ok(E.advance(S));
    const fired = S.you.fired;
    if (m0.t === 'liar' && m1.t !== 'liar') {
      stood++;
      assert.deepStrictEqual(J(fired.map(r => [r.shape, r.dir])), [['jump', 'honest']]);
    } else assert.strictEqual(fired.length, 0, 'seed ' + i);
  }
  assert.ok(stood > 5, 'an honest read let a bid stand ' + stood + ' times');
  const T0 = readRig({ tally: HON }).table;
  assert.strictEqual(SIM.readLine(T0, { who: 1, shape: 'jump', dir: 'honest', kind: 'stand', bluff: false }, null).text, 'Hollis let your bid stand: you only jump two or more when you’ve got it.');
  assert.strictEqual(SIM.readLine(T0, { who: 1, shape: 'jump', dir: 'honest', kind: 'stand', bluff: true }, null).text, 'Hollis had you read and let your bid stand: you only jump two or more when you’ve got it. This time you had nothing.');
  // Once per shape a table: a second read of the same shape at the same table is counted, not said again.
  const S = readRig({ tally: TOLD });
  S.table.said = { stay: true };
  for (let i = 0; i < 200 && !S.you.fired.length; i++) { const X = readRig({ seed: 'once' + i, tally: TOLD, dice: cups(i) }); X.table.said = { stay: true }; const ev = ok(E.advance(X)); if (X.you.fired.length) { const ro = find(ev, 'readout'); assert.ok(!(ro && ro.reads) && !(X.table.round && X.table.round.reads)); S.you.fired = X.you.fired; } }
  assert.ok(S.you.fired.length, 'a read fired somewhere');
  // The view's last round keeps the line (a reload shows it again).
  for (let i = 0; i < 300; i++) {
    const X = readRig({ seed: 'rv' + i, tally: TOLD, dice: cups(i) }), ev = ok(E.advance(X)), ro = find(ev, 'readout');
    if (ro && ro.reads && X.table) { deq(E.view(X).table.last.readout.reads, ro.reads); return; }
  }
  assert.fail('no read line at a reveal in 300 tries');
});

test('Poker Face hides your tell entirely: no shapes kept, no tally, no read, and the Book says so', () => {
  const S = readRig({ tally: TOLD, tricks: ['pokerface'] });
  assert.strictEqual(SIM.readOf(S, 1), null);
  for (let i = 0; i < 100; i++) { const X = readRig({ seed: 'pf' + i, tally: TOLD, tricks: ['pokerface'] }); E.advance(X); assert.strictEqual(X.you.fired.length, 0); }
  const { S: N, events } = E.playNight('pfnight', null, { keepEvents: true, tricks: ['pokerface'] });
  all(events, 'readout').forEach(r => r.bids.forEach(b => { if (b.id === 'me') assert.strictEqual(b.shape, null); }));
  deq(N.you.tonight, {});
  const book = E.bookApply(null, events);
  assert.ok(book.me.bids > 0 && !book.me.shapes, 'the Book keeps no shapes under Poker Face');
  assert.strictEqual(E.summary(N).tell.text, 'Poker Face: nobody got a read on you tonight.');
  const yp = E.youPage(null, readRig({ tally: TOLD, tricks: ['pokerface'] }));
  assert.strictEqual(yp.hidden, true);
  // It changes nothing else about Poker Face: they still put your bluffing at nothing.
  assert.strictEqual(SIM.estBluff(S, 0), 0);
});

test('the room remembers across nights: the Book keeps your shapes, fades them each night, and a new night starts with some of it', () => {
  let book = null;
  const nights = [];
  for (let i = 0; i < 3; i++) { const r = E.playNight('mem' + i, null, { keepEvents: true, book }); book = E.bookApply(book, r.events); nights.push(r.S); }
  assert.ok(book.me.shapes && book.me.shapes.all.n > 0);
  // The fade: the Book after a night is (what it had + tonight) x 0.75.
  const one = E.bookApply(null, E.playNight('mem0', null, { keepEvents: true }).events);
  deq(one.me.shapes.all, { n: Math.round(nights[0].you.tonight.all.n * 0.75 * 100) / 100, b: Math.round(nights[0].you.tonight.all.b * 0.75 * 100) / 100 });
  // A new night starts with three quarters of it, at most 60 bids' worth, in whole bids.
  const S = E.newNight({ seed: 'mem-next', book });
  const k = Math.min(0.75, 60 / book.me.shapes.all.n);
  assert.strictEqual(S.you.prior.all.n, Math.round(book.me.shapes.all.n * k));
  for (const id in S.you.prior) { assert.ok(Number.isInteger(S.you.prior[id].n) && Number.isInteger(S.you.prior[id].b) && S.you.prior[id].b <= S.you.prior[id].n); }
  deq(S.you.tonight, {});
  // A habit kept is a tell the next night from the first bid; one dropped fades below the line.
  const habit = { all: { n: 60, b: 12 }, step: { n: 20, b: 14 } };
  let B = { v: 1, nights: 4, me: { bids: 60, bluffs: 12, shapes: J(habit) }, people: {} };
  deq(SIM.tellsIn(E.newNight({ seed: 'm', book: B }).you.prior).map(x => x.shape), ['step']);
  const tellAt = [];
  for (let n = 0; n < 6; n++) { tellAt.push(SIM.tellsIn(E.newNight({ seed: 'm', book: B }).you.prior).length > 0); B = E.bookApply(B, [{ t: 'nightEnd', ending: 'walked', cash: 0, share: '' }]); }
  assert.deepStrictEqual(tellAt.slice(0, 2), [true, true], 'kept for a night or two');
  assert.strictEqual(tellAt[5], false, 'gone after a few nights of not doing it');
  // Sharp people use what the room remembers: a tell in the Book is read at the first chance.
  const R = readRig({ tally: {} }); R.you.prior = J(TOLD);
  assert.ok(SIM.readOf(R, 1));
  // A Book from before this change (no shapes) is fine, and so is a night saved before it (no notes at all).
  deq(E.newNight({ seed: 'm', book: { v: 1, nights: 2, me: { bids: 9, bluffs: 2 }, people: {} } }).you.prior, {});
  const old = readRig({ tally: TOLD }); delete old.you;
  assert.strictEqual(SIM.readOf(old, 1), null);
  ok(E.advance(old));
});

test('the Book\'s page on you: each shape in plain words, the tells marked, from the night or from the Book', () => {
  const S = readRig({ tally: TOLD });
  const yp = E.youPage(null, S);
  assert.strictEqual(yp.n, 40); assert.strictEqual(yp.bluff, 8);
  assert.strictEqual(yp.text, '40 bids on record, 8 of them bluffs (20%)');
  deq(yp.rows.map(r => r.shape), ['low', 'high', 'face', 'step', 'jump', 'stay', 'switch']);
  const step = yp.rows.find(r => r.shape === 'step');
  deq([step.name, step.n, step.bluff, step.tell, step.text, step.line], ['Raising by one', 14, 11, 'bluff', '14 times, 11 of them bluffs (79%)', 'you step up by one when you’ve got nothing']);
  const low = yp.rows.find(r => r.shape === 'low');
  deq([low.n, low.tell, low.text, low.line], [0, null, 'not seen yet', null]);
  assert.strictEqual(yp.rows.find(r => r.shape === 'jump').tell, null, 'six honest jumps against 20%: no tell (gap under 25)');
  deq(yp.tells.map(t => t.shape), ['stay', 'step']);
  assert.strictEqual(yp.hidden, false);
  // From the Book alone (between nights): what the next night starts with.
  const book = { v: 1, nights: 3, me: { bids: 80, bluffs: 16, shapes: { all: { n: 80, b: 16 }, step: { n: 20, b: 15 } } }, people: {} };
  const yb = E.youPage(book);
  assert.strictEqual(yb.n, 60); assert.strictEqual(yb.rows.find(r => r.shape === 'step').n, 15);
  deq(yb.tells.map(t => t.shape), ['step']);
  deq(E.youPage(null).n, 0); assert.strictEqual(E.youPage(null).text, 'No bids of yours on record yet');
});

test('the end of the night says what your tell was, or that nobody got a read on you; so does Pearl\'s column', () => {
  const night = (fired, tally, tricks) => { const S = E.newNight({ seed: 'endtell', tricks }); S.you = { tonight: J(tally || {}), prior: {}, fired }; return S; };
  let S = night([{ id: 'npc_vada', shape: 'step', dir: 'bluff', hour: 3 }, { id: 'npc_loretta', shape: 'step', dir: 'bluff', hour: 4 }, { id: 'npc_vada', shape: 'stay', dir: 'bluff', hour: 3 }], TOLD);
  let t = E.summary(S).tell;
  assert.strictEqual(t.text, 'Your tell tonight: you step up by one when you’ve got nothing. Vada and Loretta read it (three times).');
  deq(J(t.by), ['npc_vada', 'npc_loretta']); assert.strictEqual(t.reads, 3);
  assert.ok(E.column(S).body.includes('Vada Sturdivant had the visitor\'s number: the visitor steps up by one when bluffing.'), E.column(S).body);
  assert.ok(E.columnFacts(S).includes('The visitor\'s tell: steps up by one when bluffing. Read by Vada Sturdivant, Loretta Gaddis (3 times).'));
  S = night([], TOLD);
  assert.strictEqual(E.summary(S).tell.text, 'Your tell tonight: you stay on the last bid’s face when you’ve got nothing. Nobody at your tables was sharp enough to use it.');
  assert.ok(E.column(S).body.includes('The visitor stays on the last bid’s face when bluffing, though nobody sharp enough sat down to notice.'));
  S = night([], {});
  assert.strictEqual(E.summary(S).tell.text, 'Nobody got a read on you tonight.');
  assert.ok(/Nobody at the Low Water could read the visitor's bidding\.|Not one of the regulars got a read on the visitor\./.test(E.column(S).body));
  assert.ok(E.columnFacts(S).includes('Nobody got a read on the visitor\'s bidding.'));
  S = night([{ id: 'npc_vada', shape: 'step', dir: 'bluff', hour: 3 }], TOLD);
  assert.strictEqual(E.summary(S).tell.text, 'Your tell tonight: you step up by one when you’ve got nothing. Vada read it (once).');
  // A night saved before this change has no notes: nobody read it.
  S = E.newNight({ seed: 'old' }); delete S.you;
  assert.strictEqual(E.summary(S).tell.text, 'Nobody got a read on you tonight.');
});

// ===================================================================== Last Call: the house's patterns, the gear, the beat before
// A Last Call at the house's turn or yours, with the cups as given (seat 0 you, 1 Loretta, 2 Curtis).
function lastCall(o) {
  const S = rig({ hour: 4, cash: 800, seed: o.seed || 'lc', book: o.book });
  const T = S.table;
  if (o.dice) o.dice.forEach((d, k) => { T.seats[k].dice = d.slice(); T.seats[k].n = d.length; T.seats[k].out = d.length === 0; });
  return S;
}
// Many Last Calls by the Count: every house bid the reveals showed, with its situation.
function houseBids(n, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const S = E.newNight({ seed: (seed || 'pat') + i }); S.hour = 4; S.cash = 900;
    const ev = ok(E.act(S, { t: 'sit', i: 0 }));
    while (S.phase === 'table') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))));
    ev.filter(e => e.t === 'readout').forEach(e => e.bids.forEach(b => { if (b.id !== 'me') out.push(b); }));
  }
  return out;
}
const share = (list, f) => list.length ? list.filter(f).length / list.length : NaN;

test('the house\'s situation is public: Loretta level or behind you vs ahead of you (by dice counts), Curtis opening vs raising; nobody else has one', () => {
  const S = lastCall({ dice: [[2, 3, 4, 5], [2, 3, 4], [6, 6, 6, 6, 6]] });
  const T = S.table;
  T.round = { no: 1, opener: 1, turn: 1, bids: [], blindSeat: -1, looked: false, peek: [], ones: null, nod: null, slow: 0, hot: false, fixed: [], pinned: {}, loaded: null };
  assert.strictEqual(SIM.sitOf(S, 1), 'behind', 'three dice to your four: behind');
  T.seats[1].dice = [2, 3, 4, 5]; T.seats[1].n = 4;
  assert.strictEqual(SIM.sitOf(S, 1), 'behind', 'level counts as level or behind');
  T.seats[0].dice = [2, 3, 4]; T.seats[0].n = 3;
  assert.strictEqual(SIM.sitOf(S, 1), 'ahead');
  assert.strictEqual(SIM.sitOf(S, 2), 'open', 'nothing bid: Curtis would open');
  T.round.bids.push({ who: 1, q: 2, f: 3, p: 0.5, held: 1, bluff: false, habit: null, sit: 'ahead' });
  assert.strictEqual(SIM.sitOf(S, 2), 'raise');
  // Your own dice faces never enter it: only how many each cup holds.
  const S2 = J(S); S2.table.seats[0].dice = [6, 6, 6];
  assert.strictEqual(SIM.sitOf(S2, 1), SIM.sitOf(S, 1));
  // Away from Last Call nobody has a situation, and the bid events carry none.
  const R = rig({ dice: [[2, 3, 4, 5], [2, 3, 4, 5], [2, 3, 4, 5]] });
  assert.strictEqual(SIM.sitOf(R, 1), null);
  let ev = [];
  for (let i = 0; i < 30 && R.phase === 'table'; i++) ev = ev.concat(ok(E.act(R, E.basicPolicy(R, E.view(R), E.legal(R), E))));
  assert.ok(all(ev, 'bid').every(e => e.sit === undefined && (!e.habit || e.habit.sit === undefined)));
});

test('Loretta\'s glasses: level or behind you they come with her bluffs; ahead of you, with her straight bids (and not with her bluffs)', () => {
  const bids = houseBids(500, 'lor');
  const tell = SIM.person('npc_loretta').tell;
  const L = bids.filter(b => b.id === 'npc_loretta');
  const cell = (sit, bl) => L.filter(b => b.sit === sit && b.bluff === bl);
  const shown = list => share(list, b => b.habit === tell);
  const r = { bb: shown(cell('behind', true)), bs: shown(cell('behind', false)), ab: shown(cell('ahead', true)), as: shown(cell('ahead', false)) };
  assert.ok(cell('behind', true).length > 80 && cell('ahead', true).length > 20, JSON.stringify(r));
  assert.ok(r.bb > 0.8 && r.bs < 0.15, 'level or behind: a bluff tell ' + JSON.stringify(r));
  assert.ok(r.as > 0.5 && r.ab < 0.15, 'ahead: a straight tell, not a bluff one ' + JSON.stringify(r));
  // She bluffs more when she is not ahead.
  assert.ok(share(L.filter(b => b.sit === 'behind'), b => b.bluff) > share(L.filter(b => b.sit === 'ahead'), b => b.bluff) + 0.1);
  // Her other two habits are idle: about the same on bluffs and straight bids, in either situation.
  [0, 1, 2].filter(i => i !== tell).forEach(i => ['behind', 'ahead'].forEach(sit => {
    const d = Math.abs(share(cell(sit, true), b => b.habit === i) - share(cell(sit, false), b => b.habit === i));
    assert.ok(d < 0.12, `habit ${i} ${sit}: ${d}`);
  }));
});

test('Curtis naming the odds: when he opens it comes with what he holds; when he raises, with his bluffs', () => {
  const bids = houseBids(500, 'cur');
  const tell = SIM.person('npc_curtis').tell;
  assert.strictEqual(E.PEOPLE.find(p => p.id === 'npc_curtis').habits[tell], 'names the odds out loud');
  const C = bids.filter(b => b.id === 'npc_curtis');
  const cell = (sit, bl) => C.filter(b => b.sit === sit && b.bluff === bl);
  const shown = list => share(list, b => b.habit === tell);
  const r = { ob: shown(cell('open', true)), os: shown(cell('open', false)), rb: shown(cell('raise', true)), rs: shown(cell('raise', false)) };
  assert.ok(cell('open', true).length > 30 && cell('raise', true).length > 100, JSON.stringify(r));
  assert.ok(r.os > 0.75 && r.ob < 0.12, 'opening: a straight tell ' + JSON.stringify(r));
  assert.ok(r.rb > 0.75 && r.rs < 0.1, 'raising: a bluff tell ' + JSON.stringify(r));
  // A sporting open: his openers are bluffs more often than an ordinary opener's.
  assert.ok(share(C.filter(b => b.sit === 'open'), b => b.bluff) > 0.08);
});

test('away from Last Call the house\'s tells keep their old, plain meaning (a table rigged with Loretta at 11 PM)', () => {
  let shownStraight = 0, straight = 0, shownBluff = 0, bluffs = 0;
  for (let i = 0; i < 400; i++) {
    const S = E.newNight({ seed: 'lor-away' + i });
    S.offers[0][0] = { kind: 'easy', hour: 0, seats: 3, buyIn: 20, rule: null, people: ['npc_loretta', 'npc_curtis'] };
    S.cash = 1000; ok(E.sit(S, 0));
    const ev = [];
    while (S.phase === 'table') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))));
    ev.filter(e => e.t === 'readout').forEach(e => e.bids.forEach(b => { if (b.id !== 'npc_loretta') return; assert.strictEqual(b.sit, undefined); if (b.bluff) { bluffs++; if (b.habit === 2) shownBluff++; } else { straight++; if (b.habit === 2) shownStraight++; } }));
  }
  // Her tell is 'strong' (tier 5: 50% on a straight bid, 12% on a bluff), whatever the dice counts.
  assert.ok(shownStraight / straight > 0.4 && shownBluff / bluffs < 0.25, `${shownStraight}/${straight} ${shownBluff}/${bluffs}`);
});

test('the Book splits the house\'s habits by situation; a Book kept before the split keeps its totals and shows them as "before"', () => {
  const S = lastCall({});
  const T = S.table;
  // Two reveals' worth of house bids, by hand.
  const ro = { t: 'readout', bids: [
    { who: 1, id: 'npc_loretta', q: 3, f: 4, held: 0, p: 0.2, bluff: true, habit: 2, text: 'x', sit: 'behind' },
    { who: 1, id: 'npc_loretta', q: 4, f: 4, held: 2, p: 0.7, bluff: false, habit: 2, text: 'x', sit: 'ahead' },
    { who: 2, id: 'npc_curtis', q: 3, f: 5, held: 2, p: 0.8, bluff: false, habit: 2, text: 'x', sit: 'open' },
    { who: 2, id: 'npc_curtis', q: 5, f: 5, held: 0, p: 0.1, bluff: true, habit: 2, text: 'x', sit: 'raise' },
    { who: 1, id: 'npc_loretta', q: 6, f: 5, held: 2, p: 0.9, bluff: false, habit: null, text: null, sit: 'quiet' }] };
  let book = E.bookApply(null, [ro, ro]);
  const lp = E.bookPage(book, 'npc_loretta'), cp = E.bookPage(book, 'npc_curtis');
  deq(lp.split.map(x => x.key), ['behind', 'ahead']); deq(cp.split.map(x => x.key), ['open', 'raise']);
  deq(lp.rows[2].split.map(c => [c.key, c.n, c.bluff, c.straight]), [['behind', 2, 2, 0], ['ahead', 2, 0, 2]]);
  assert.strictEqual(lp.rows[2].n, 4); assert.strictEqual(lp.rows[2].before, null);
  deq(cp.rows[2].split.map(c => [c.key, c.n, c.bluff]), [['open', 2, 0], ['raise', 2, 2]]);
  deq(J(lp.gear), { n: 2, bluff: 0, straight: 2 }, 'her bids once she went quiet');
  assert.strictEqual(cp.gear, null);
  assert.strictEqual(E.bookPage(book, 'npc_vada').split, null, 'nobody else is split');
  // The felt's line: the tally for the situation in front of you.
  const t = E.habitTally(book, 'npc_curtis', { i: 2, text: 'names the odds out loud', sit: 'raise' });
  deq(J(t), { sit: 'raise', when: 'when he raises', n: 2, bluff: 2, straight: 0, all: { n: 4, bluff: 2, straight: 2 }, before: null });
  assert.strictEqual(E.habitTally(book, 'npc_loretta', { i: 2, sit: 'behind' }).when, 'when she’s level or behind you');
  assert.strictEqual(E.habitTally(book, 'npc_vada', { i: 0 }).sit, null);
  // An old Book: unsplit house pages (from the fixture, written before the split) stay usable and keep counting.
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', 'bones-lastcall-v1.json'), 'utf8'));
  const old = fx.book, was = old.people.npc_loretta.habits[2];
  assert.ok(was.n > 0 && !was.by, 'the fixture is unsplit');
  const op = E.bookPage(old, 'npc_loretta');
  deq(op.rows[2].split.map(c => c.n), [0, 0]); deq(J(op.rows[2].before), { n: was.n, bluff: was.bluff, straight: was.straight });
  deq(J(op.gear), { n: 0, bluff: 0, straight: 0 });
  assert.strictEqual(E.habitTally(old, 'npc_loretta', { i: 2, sit: 'ahead' }).before.n, was.n);
  book = E.bookApply(old, [ro]);
  const np = E.bookPage(book, 'npc_loretta');
  assert.strictEqual(np.rows[2].n, was.n + 2);
  deq(np.rows[2].split.map(c => c.n), [1, 1]); assert.strictEqual(np.rows[2].before.n, was.n);
  assert.match(E.lastCallBrief(Object.assign(E.newNight({ seed: 'b', book }), { hour: 4, cash: 700 }), book).people[0].book, /and \d+ times? before that/);
});

test('Loretta changes gear at her last two dice: said once at the next deal, no habit after it, no bluffs, and play really differs', () => {
  // Said once: over many Last Calls, a table has at most one gear event, it comes as a round is dealt, and only once she is on two dice or fewer.
  let tables = 0, said = 0;
  for (let i = 0; i < 300; i++) {
    const S = E.newNight({ seed: 'gear' + i }); S.hour = 4; S.cash = 900;
    const ev = ok(E.act(S, { t: 'sit', i: 0 }));
    while (S.phase === 'table') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))));
    tables++;
    const g = ev.filter(e => e.t === 'gear');
    assert.ok(g.length <= 1);
    if (!g.length) continue;
    said++;
    const k = ev.indexOf(g[0]);
    assert.strictEqual(ev[k - 1].t, 'roll', 'said as the next round is dealt, before anyone bids');
    assert.strictEqual(ev[k - 1].counts[1] <= 2, true);
    deq(J(g[0]), { t: 'gear', who: 1, id: 'npc_loretta', name: 'Loretta Gaddis', text: 'Loretta’s down to her last two dice. She sets the bar towel down and stops talking.' });
    // After it, her bids come with no habit and are never bluffs, and carry the quiet situation.
    const after = ev.slice(k).filter(e => e.t === 'readout').flatMap(e => e.bids.filter(b => b.id === 'npc_loretta'));
    after.forEach(b => { assert.strictEqual(b.habit, null); assert.strictEqual(b.sit, 'quiet'); assert.strictEqual(b.bluff, false, JSON.stringify(b)); });
  }
  assert.ok(said > 20 && said < tables, `${said} of ${tables}`);
  // The view keeps it while the table lasts.
  const S = lastCall({ dice: [[2, 3, 4], [2, 6], [5, 5, 5]] });
  S.table.round = null; S.table.wait = 'next';
  const ev = ok(E.act(S, { t: 'next' }));
  assert.ok(find(ev, 'gear')); deq(J(E.view(S).table.gear), { who: 1, id: 'npc_loretta', text: 'Loretta’s down to her last two dice. She sets the bar towel down and stops talking.' });
  // Play differs: the same decisions with and without the gear, on the same draws. Quiet, she never bids what her cup does
  // not back (where she would have), and calls instead.
  let diff = 0, unbacked = 0, n = 0;
  for (let i = 0; i < 400; i++) {
    const A = lastCall({ seed: 'gd' + i, dice: [[1 + (i % 6), 2, 3], [1 + (i * 7 % 6), 1 + (i * 5 % 6)], [4, 5, 6, 1 + (i % 4)]] });
    A.table.round = { no: 1, opener: 0, turn: 1, bids: [{ who: 0, q: 2 + (i % 3), f: 2 + (i % 5), p: 0.5, held: 1, bluff: false, habit: null, shape: ['low'] }], blindSeat: -1, looked: false, peek: [], ones: null, nod: null, slow: 0, hot: false, fixed: [], pinned: {}, loaded: null };
    A.table.wait = null;
    const B = J(A); B.table.gear = { who: 1, round: 1 };
    const mA = SIM.botMove(A, 1), mB = SIM.botMove(B, 1);
    n++; if (JSON.stringify(mA) !== JSON.stringify(mB)) diff++;
    if (mB.t === 'bid') { const T = B.table, known = T.seats[1].dice; const m = known.filter(d => d === mB.f || d === 1).length; if (SIM.tail(T.seats[0].n + T.seats[2].n, mB.q - m, 1 / 3) < SIM.BLUFF_P) unbacked++; }
  }
  assert.ok(diff > n * 0.1, `${diff} of ${n} decisions change`);
  assert.strictEqual(unbacked, 0, 'quiet, every bid of hers is backed by her own cup');
});

test('fair: the house never sees your dice, and Loretta and Curtis share nothing hidden (their moves and habits on the same draws)', () => {
  let checked = 0, other = 0;
  // Each time it is your turn: make the same legal bid in three copies, one with your faces changed, one with Curtis's.
  // Everything the house does after it, up to a call (the reveal shows the cups), is the same with your faces changed;
  // Loretta's answer is the same with Curtis's changed.
  const upToCall = ev => { const k = ev.findIndex(e => e.t === 'call'); return JSON.stringify(k < 0 ? ev : ev.slice(0, k + 1)); };
  for (let i = 0; i < 120; i++) {
    const S = E.newNight({ seed: 'fair' + i }); S.hour = 4; S.cash = 900;
    ok(E.act(S, { t: 'sit', i: 0 }));
    for (let g = 0; g < 400 && S.phase === 'table'; g++) {
      const T = S.table, L = E.legal(S);
      if (L.need === 'turn' && L.canBid) {
        const a = { t: 'bid', q: L.minBid.q, f: L.minBid.f };
        const A = J(S), B = J(S), C = J(S);
        B.table.seats[0].dice = B.table.seats[0].dice.map(d => (d % 6) + 1);
        const ea = ok(E.act(A, a)), eb = ok(E.act(B, a));
        assert.strictEqual(upToCall(eb), upToCall(ea), 'your dice');
        checked++;
        if (!T.seats[1].out && !T.seats[2].out) {
          C.table.seats[2].dice = C.table.seats[2].dice.map(d => (d % 6) + 1);
          const ec = ok(E.act(C, a));
          const first = ev => JSON.stringify(ev.find(e => (e.t === 'bid' || e.t === 'call') && e.who === 1));
          assert.strictEqual(first(ec), first(ea), 'Curtis\'s dice');
          other++;
        }
      }
      ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E)));
    }
  }
  assert.ok(checked > 300 && other > 100, `checked ${checked}, ${other}`);
  // The house still reads the shape of your bids at full strength.
  assert.strictEqual(SIM.READS[SIM.person('npc_loretta').tier], 1); assert.strictEqual(SIM.READS[SIM.person('npc_curtis').tier], 1);
  // And a Last Call is the same night byte for byte from the same seed and actions.
  const play = () => { const S = E.newNight({ seed: 'lc-det' }); S.hour = 4; S.cash = 900; const ev = ok(E.act(S, { t: 'sit', i: 0 })); while (S.phase === 'table') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E)))); return JSON.stringify(ev); };
  assert.strictEqual(play(), play());
});

test('the beat before Last Call: who sits down, what is at stake, and what your Book holds on each of them', () => {
  const S = E.newNight({ seed: 'brief', tricks: ['palm', 'ledger'] }); S.hour = 4; S.cash = 740;
  let b = E.lastCallBrief(S, null);
  assert.strictEqual(b.title, 'Last Call');
  assert.match(b.scene, /Loretta wipes down her own table and sits; Curtis pulls up the third chair/);
  assert.strictEqual(b.stakes, 'Everything you have goes in: $740. Win and you walk out with $2,220; lose and it stays on her table. Five dice each, no antes, and your dice tricks stay in your pocket.');
  deq(b.people.map(p => [p.id, p.role, p.book]), [['npc_loretta', 'Owns the place.', 'Your Book has nothing on her yet.'], ['npc_curtis', 'Puts odds on everything.', 'Your Book has nothing on him yet.']]);
  assert.strictEqual(b.you, 'They read how you bid from the first round.');
  // With a Book: their bids, bluffs, the habit seen most, split; and Loretta gone quiet.
  const ro = { t: 'readout', bids: [
    { who: 1, id: 'npc_loretta', q: 3, f: 4, held: 0, p: 0.2, bluff: true, habit: 2, text: 'x', sit: 'behind' },
    { who: 1, id: 'npc_loretta', q: 6, f: 5, held: 2, p: 0.9, bluff: false, habit: null, text: null, sit: 'quiet' },
    { who: 2, id: 'npc_curtis', q: 3, f: 5, held: 2, p: 0.8, bluff: false, habit: 2, text: 'x', sit: 'open' }] };
  const book = E.bookApply(E.bookApply(null, [{ t: 'sit', night: 'n', seats: [{ id: 'npc_loretta' }, { id: 'npc_curtis' }] }]), [ro, ro]);
  b = E.lastCallBrief(Object.assign(E.newNight({ seed: 'brief2' }), { hour: 4, cash: 600 }), book);
  assert.strictEqual(b.stakes, 'Everything you have goes in: $600. Win and you walk out with $1,800; lose and it stays on her table. Five dice each, no antes.');
  assert.strictEqual(b.people[0].book, 'Your Book: 4 of her bids seen, 2 bluffs. She lets her glasses drop on their chain: level or behind you 2 times, 2 bluffs. Once she went quiet: 2 bids, no bluffs.');
  assert.strictEqual(b.people[1].book, 'Your Book: 2 of his bids seen, no bluffs. He names the odds out loud: opening a round 2 times, no bluffs.');
});

test('the end of the night says what the Book gained on the house: on any night with a Last Call, won or lost; none without', () => {
  let lost = null, won = null;
  for (let i = 0; i < 80 && (!lost || !won); i++) {
    const S = E.newNight({ seed: 'gain' + i }); S.hour = 4; S.cash = 900;
    const ev = ok(E.act(S, { t: 'sit', i: 0 }));
    while (S.phase !== 'over') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))));
    if (S.ending === 'cleaned' && !lost) lost = { S, ev }; if (S.ending === 'house' && !won) won = { S, ev };
  }
  for (const x of [lost, won]) {
    const h = E.summary(x.S).house;
    assert.ok(h && h.lines.length >= 1, x.S.ending);
    assert.ok(h.text.startsWith('What the Book gained on the house: '));
    // The numbers are tonight's reveals of their bids.
    const lor = x.ev.filter(e => e.t === 'readout').flatMap(e => e.bids.filter(b => b.id === 'npc_loretta'));
    if (lor.length) assert.ok(h.lines.some(l => l.startsWith(`Loretta: ${lor.length} bid${lor.length === 1 ? '' : 's'} seen, `)), h.text);
  }
  // A night that never reached Last Call: nothing to say about the house.
  const { S } = E.playNight('nolc', null, {});
  if (!S.log.some(t => t.kind === 'last')) assert.strictEqual(E.summary(S).house, null);
  // A night saved before tonight's tally existed (no S.house) still ends with a line.
  const old = J(lost.S); delete old.house;
  assert.strictEqual(E.houseNight(old).text, 'The Book gained nothing on the house tonight: no cups lifted on their bids.');
});

test('a Last Call saved before the house\'s patterns resumes: the gear is said at the next deal, the bids carry situations from then on, and the old Book keeps counting', () => {
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', 'bones-lastcall-v1.json'), 'utf8'));
  const rec = fx.saves.lastcall, S = J(rec.S);
  assert.strictEqual(rec.v, E.VERSION);
  assert.strictEqual(S.table.kind, 'last'); assert.strictEqual(S.table.gear, undefined);
  assert.ok(S.table.seats[1].n <= 2);
  const v = E.view(S), L = E.legal(S);
  assert.strictEqual(L.need, 'turn'); assert.strictEqual(v.table.gear, null);
  assert.ok(v.table.history.every(x => x.sit === undefined), 'old bids have no situation');
  assert.strictEqual(E.advance(S).length, 1, 'nothing pending');
  let book = fx.book;
  const ev = [];
  while (S.phase !== 'over') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))));
  book = E.bookApply(book, ev);
  // The round in progress ended under the old rules; the table went on, and its first deal changed her gear (she was
  // already down to two), right after the roll.
  const rolls = all(ev, 'roll'), g = all(ev, 'gear');
  assert.ok(rolls.length >= 1 && rolls[0].counts[1] > 0 && rolls[0].counts[1] <= 2, JSON.stringify(rolls[0]));
  assert.strictEqual(g.length, 1, 'said once'); assert.strictEqual(ev[ev.indexOf(g[0]) - 1], rolls[0]);
  assert.ok(all(ev, 'bid').filter(e => e.who !== 0).every(e => !!e.sit), 'new bids carry their situation');
  assert.ok(['house', 'cleaned'].includes(S.ending));
  assert.strictEqual(typeof E.summary(S).house.text, 'string');
  const pg = E.bookPage(book, 'npc_loretta');
  assert.ok(pg.rows[2].n >= fx.book.people.npc_loretta.habits[2].n);
  assert.ok(pg.rows.every(r => r.before === null || r.before.n >= 0));
});

// ===================================================================== saved nights
test('a night saved before the trick rework resumes and plays on to its end under the new rules', () => {
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', 'bones-night-v1.json'), 'utf8')).saves;
  deq(Object.keys(fx), ['turn', 'ready', 'next', 'shop']);
  for (const [k, rec] of Object.entries(fx)) {
    assert.strictEqual(rec.v, E.VERSION, 'the same night version: the page keeps it');
    const S = J(rec.S);
    const v = E.view(S), L = E.legal(S);
    assert.strictEqual(L.need, k === 'shop' ? 'shop' : k);
    assert.strictEqual(E.advance(S).length, 1, 'nothing pending');
    if (k === 'turn') {
      // Palm was used under the old once-a-table rule: it stays used for this table; the Slow Roll is spent.
      deq(v.table.palm.left, 0); assert.ok(!L.uses.includes('palm') && !L.uses.includes('slowroll'));
      deq(v.table.myLoaded, [], 'an old round has no loaded die marked: it counts once until the next roll');
    }
    if (k === 'ready') assert.ok(L.uses.includes('slowroll') && v.table.slow);
    if (k === 'shop') assert.strictEqual(v.shop.offers.length, 3, 'the offers already drawn stay');
    // Saved before the room read you back: no notes on you; it plays on, takes notes from now, and ends with a word on them.
    assert.strictEqual(S.you, undefined);
    deq(E.youPage(null, S).n, 0);
    let g = 0;
    while (S.phase !== 'over') { ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))); assert.ok(++g < 5000); }
    assert.ok(['house', 'cleaned', 'walked', 'bust'].includes(S.ending));
    assert.ok(typeof E.summary(S).tell.text === 'string' && E.column(S).body.length > 0);
  }
  // A night saved before Double or Nothing was limited has no count at its table: it resumes with both calls for 2.
  const D = J(fx.turn.S);
  D.tricks = D.tricks.map(t => t.id === 'snake' ? { id: 'double', paid: 55 } : t);
  assert.strictEqual(D.table.used.double, undefined);
  deq(E.view(D).table.double, { left: 2, uses: 2 }); assert.ok(E.legal(D).canDouble);
  const dev = ok(E.act(D, { t: 'liar', double: true }));
  assert.strictEqual(find(dev, 'trick', e => e.id === 'double').left, 1);
  let gd = 0;
  while (D.phase !== 'over') { ok(E.act(D, E.basicPolicy(D, E.view(D), E.legal(D), E))); assert.ok(++gd < 5000); }
  // And the next round of the old table marks the loaded six again.
  const S = J(fx.turn.S);
  while (S.phase === 'table' && S.table.wait !== 'next') ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E)));
  if (S.phase === 'table') {
    ok(E.act(S, { t: 'next' }));
    if (S.table && S.table.round && S.table.round.blindSeat !== 0) assert.strictEqual(S.table.round.loaded, 0);
  }
});

// ===================================================================== after the house: After Hours, grudges, starts
const rungOf = id => E.ROOMS.findIndex(r => r.id === id) + 1;
// A whole night at a table of its own, by the Count, with these newNight options; the events too.
const night = (seed, o) => E.playNight(seed, E.basicPolicy, Object.assign({ keepEvents: true }, o || {}));
// A Book with grudges waiting: from a Book carried through nights that carry them (the real way they arise).
function grudgeBook(n, seed) {
  let book = null;
  for (let i = 0; i < (n || 30); i++) { const { events } = night((seed || 'gb') + i, { book, grudges: true }); book = E.bookApply(book, events); }
  return book;
}

test('a default night is exactly the night recorded before After Hours, grudges and starts: the same dice, cash, events and state', () => {
  // tests/fixtures/bones-default-nights.json was written by the engine before this change (Engine.playNight with
  // basicPolicy: plain nights, nights holding tricks, tonight's tables and a run of nights with the Book carried).
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', 'bones-default-nights.json'), 'utf8')).nights;
  const fnv = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0; return h.toString(16); };
  let book = null, n = 0;
  for (const r of fx) {
    if (r.label === 'bookhash') { assert.strictEqual(fnv(JSON.stringify(book)), r.book, 'the Book carried through the run'); continue; }
    const o = r.label === 'tricks' ? { tricks: [['loaded', 'glasses'], ['sidebet'], ['double', 'nod'], ['pokerface'], ['slowroll', 'palm'], ['ledger', 'mirror'], ['extrabone', 'rabbit'], ['snake', 'shaved']][+r.seed.split(':')[1]] }
      : r.label === 'daily' ? { daily: ['2026-11-21', '2026-11-22', '2026-12-25'][fx.filter(x => x.label === 'daily').indexOf(r)] } : r.label === 'book' ? { book } : {};
    const { S, events } = E.playNight(r.seed, E.basicPolicy, Object.assign({ keepEvents: true }, o));
    const got = { ending: S.ending, cash: S.cash, tables: S.log.map(t => [t.hour, t.kind, t.place, t.net]), events: events.length, ev: fnv(JSON.stringify(events)), state: fnv(JSON.stringify(S)) };
    deq(got, { ending: r.ending, cash: r.cash, tables: r.tables, events: r.events, ev: r.ev, state: r.state }, r.label + ' ' + (r.seed || 'daily'));
    if (r.label === 'book') book = E.bookApply(book, events);
    n++;
  }
  assert.ok(n >= 40, n + ' nights replayed');
  // Room 0, the usual start and grudges off are all the house night; a daily takes none of the three.
  for (const o of [{ room: 0 }, { start: 'usual' }, { grudges: false }, { room: 0, start: 'usual', grudges: false }]) deq(E.newNight(Object.assign({ seed: 'same' }, o)), E.newNight({ seed: 'same' }), JSON.stringify(o));
});

test('After Hours: five rungs, one named change each, every rung keeping the ones below; the house night has none of them', () => {
  assert.strictEqual(E.RUNGS, 5);
  assert.strictEqual(E.ROOMS.length, 5);
  deq(E.ROOMS.map(r => r.id).slice().sort(), ['door', 'midnight', 'rules', 'sharp', 'shop']);
  E.ROOMS.forEach((r, i) => { assert.strictEqual(r.rung, i + 1); assert.ok(r.name && r.line && /^[A-Z].*\.$/.test(r.line) && r.line.length <= 100, r.line); });
  // The room is clamped and kept in the state; the view says it.
  for (const [k, want] of [[0, 0], [3, 3], [9, 5], [-2, 0]]) { const S = E.newNight({ seed: 'rm', room: k }); assert.strictEqual(E.view(S).room, want); assert.strictEqual(S.room || 0, want); }
  // Each change is there from its own rung up, and not on the rung below it.
  const sharpAt = rungOf('sharp'), rulesAt = rungOf('rules'), shopAt = rungOf('shop'), midAt = rungOf('midnight'), doorAt = rungOf('door');
  const tiers = S => S.offers[0][0].people.map(id => SIM.person(id).tier);
  for (let i = 0; i < 40; i++) {
    const seed = 'ah' + i;
    // 9 PM's near table asks for tiers 1 and 1: a tier sharper, 2 and 2.
    assert.ok(tiers(E.newNight({ seed, room: sharpAt })).every(t => t === 2), 'sharper at 9 PM');
    assert.ok(tiers(E.newNight({ seed, room: sharpAt - 1 })).every(t => t === 1), 'not on the rung below');
    assert.ok(tiers(E.newNight({ seed })).every(t => t === 1), 'the house night: tier 1 at 9 PM near');
    // Every table a hard house rule from its rung, 9 PM included; never at 9 PM below it or on the house night.
    E.newNight({ seed, room: rulesAt }).offers.flat().forEach(o => assert.ok(['sudden', 'short', 'blind'].includes(o.rule), 'rule ' + o.rule));
    assert.ok(E.newNight({ seed }).offers[0].every(o => !o.rule));
    assert.ok(E.newNight({ seed, room: rulesAt - 1 }).offers[0].every(o => !o.rule));
  }
  // The door: dearer from its rung, $500 below it.
  assert.ok(SIM.DOOR_HIGH > 500);
  assert.strictEqual(E.door(E.newNight({ seed: 'd', room: doorAt })), SIM.DOOR_HIGH);
  assert.strictEqual(E.door(E.newNight({ seed: 'd', room: doorAt - 1 })), 500);
  assert.strictEqual(E.door(E.newNight({ seed: 'd' })), 500);
  const W = E.newNight({ seed: 'door', room: doorAt }); W.hour = 4; W.cash = SIM.DOOR_HIGH - 100;
  assert.strictEqual(E.options(W)[0].affordable, false, '$100 short of the door');
  assert.strictEqual(E.view(W).door, SIM.DOOR_HIGH);
  W.hour = 3; W.phase = 'shop'; W.shop = { hour: 3, offers: [null, null, null], rerolls: 0 };
  ok(E.act(W, { t: 'leave' })); assert.strictEqual(W.ending, 'walked');
  // Curtis: two offers (three with Friends Rates), half again the price, from his rung.
  const sh = E.newNight({ seed: 'shop', room: shopAt }); sh.hour = 1; sh.cash = 1e5;
  E.act(sh, { t: 'sit', i: 0 }); finishTable(sh);
  assert.strictEqual(sh.phase, 'shop'); assert.strictEqual(sh.shop.offers.length, 2);
  sh.shop.offers.forEach(id => { const base = { common: 15, uncommon: 30, rare: 55 }[E.TRICKS.find(t => t.id === id).rarity] * 2 * 1.5; assert.strictEqual(SIM.price(sh, id, 1), Math.max(5, Math.round(base / 5) * 5)); });
  const fr = E.newNight({ seed: 'shop', room: shopAt, tricks: ['friends'] }); fr.hour = 1; fr.cash = 1e5; E.act(fr, { t: 'sit', i: 0 }); finishTable(fr);
  assert.strictEqual(fr.shop.offers.length, 3);
  const plain = E.newNight({ seed: 'shop' }); plain.hour = 1; plain.cash = 1e5; E.act(plain, { t: 'sit', i: 0 }); finishTable(plain);
  assert.strictEqual(plain.shop.offers.length, 3);
  // Big money only: at Midnight the near table is closed (not sat, not counted as the cheapest seat); below the rung it is open.
  const mid = room => { const S = E.newNight({ seed: 'mid', room }); S.hour = 3; S.cash = 250; return S; };
  const shut = E.options(mid(midAt)), open = E.options(mid(midAt - 1));
  assert.ok(shut[0].closed && !shut[0].affordable && shut[1].kind === 'rich' && !shut[1].closed);
  assert.ok(!open[0].closed && open[0].affordable);
  deq(E.legal(mid(midAt)).sit, [], '$250 sits nowhere at Midnight: the big table wants $320');
  assert.ok(isErr(E.act(mid(midAt), { t: 'sit', i: 0 })), 'the closed table cannot be sat');
  const M2 = mid(midAt); M2.hour = 2; M2.phase = 'shop'; M2.shop = { hour: 2, offers: [null, null], rerolls: 0 };
  ok(E.act(M2, { t: 'leave' })); assert.strictEqual(M2.ending, 'bust', '$250 short of the big table: bust at Midnight');
  const M3 = mid(midAt - 1); M3.hour = 2; M3.phase = 'shop'; M3.shop = { hour: 2, offers: [null, null, null], rerolls: 0 };
  ok(E.act(M3, { t: 'leave' })); assert.strictEqual(M3.phase, 'choose', 'below the rung $250 sits at the near table');
  const M4 = mid(midAt); M4.cash = 400; ok(E.act(M4, { t: 'sit', i: 1 })); assert.strictEqual(M4.table.kind, 'rich');
  // The top rung has all five at once.
  const top = E.newNight({ seed: 'top', room: 5 });
  assert.ok(tiers(top).every(t => t === 2) && top.offers.flat().every(o => o.rule) && E.door(top) === SIM.DOOR_HIGH);
});

test('After Hours nights play to an end, and the share line says the rung (the house night\'s does not)', () => {
  for (let k = 1; k <= 5; k++) for (let i = 0; i < 25; i++) {
    const { S } = night('ahn' + k + ':' + i, { room: k });
    assert.ok(['house', 'cleaned', 'walked', 'bust'].includes(S.ending));
    assert.match(E.shareLine(S), new RegExp(`^Bones · night ahn${k}:${i} · After Hours ${k} · `));
    assert.strictEqual(E.summary(S).room, k);
  }
  assert.doesNotMatch(E.shareLine(night('plainshare').S), /After Hours/);
});

test('tonight\'s tables take no room, no start and no grudges: the same night for everyone', () => {
  const book = grudgeBook(20);
  assert.ok(E.grudges(book).waiting.length, 'grudges waiting in this Book');
  const a = E.newNight({ daily: '2026-11-22' });
  const b = E.newNight({ daily: '2026-11-22', room: 5, start: 'marked', grudges: true });
  deq(b, a);
  const c = E.newNight({ daily: '2026-11-22', room: 3, start: 'pocket', grudges: true, book });
  assert.ok(!c.room && !c.start && !c.grudges && !c.pocket);
  deq(c.offers, a.offers, 'the same tables whatever the Book holds');
  // Played out: the same as a plain daily.
  const p = night(null, { daily: '2026-11-22', book }), q = night(null, { daily: '2026-11-22', room: 4, start: 'tab', grudges: true, book });
  deq(q.S.log.map(t => [t.place, t.net]), p.S.log.map(t => [t.place, t.net]));
  assert.strictEqual(q.S.cash, p.S.cash);
});

test('ways to walk in: each start\'s cash and what comes with it; the usual is the house night\'s', () => {
  const ids = E.STARTS.map(s => s.id);
  deq(ids, ['usual', 'pocket', 'marked', 'blind', 'tab']);
  E.STARTS.forEach(s => assert.ok(s.name && s.short && s.short.length <= 7 && s.line.length <= 110, s.id));
  const cash = id => E.newNight({ seed: 'st', start: id }).cash;
  assert.strictEqual(cash('usual'), 100);
  E.STARTS.forEach(s => assert.strictEqual(cash(s.id), s.cash));
  assert.ok(cash('pocket') < 100 && cash('marked') > 100 && cash('tab') > 100 && cash('blind') === 100);
  // Pocket: a trick in hand from the seed (the same every time for a seed), held but never bought.
  const P1 = E.newNight({ seed: 'pk1', start: 'pocket' }), P2 = E.newNight({ seed: 'pk1', start: 'pocket' });
  assert.strictEqual(P1.tricks.length, 1); deq(P1.tricks, P2.tricks); assert.strictEqual(P1.pocket, P1.tricks[0].id);
  assert.ok(SIM.POCKET.includes(P1.pocket));
  const seen = new Set(); for (let i = 0; i < 60; i++) seen.add(E.newNight({ seed: 'pk' + i, start: 'pocket' }).pocket);
  assert.ok(seen.size >= 8, 'the pick varies by seed: ' + [...seen]);
  const pn = night('pkn', { start: 'pocket' }).S;
  assert.ok(!E.summary(pn).tricksBought.includes(pn.pocket) || pn.stats.bought.filter(x => x === pn.pocket).length === 0);
  assert.strictEqual(E.summary(pn).pocket, pn.pocket);
  // Tab: Loretta wants $500 more; with the top rung, that much more again.
  assert.strictEqual(E.door(E.newNight({ seed: 't', start: 'tab' })), 1000);
  assert.strictEqual(E.door(E.newNight({ seed: 't', start: 'tab', room: rungOf('door') })), SIM.DOOR_HIGH + 500);
  const T = E.newNight({ seed: 'tab', start: 'tab' }); T.hour = 4; T.cash = 900;
  assert.strictEqual(E.options(T)[0].affordable, false);
  T.cash = 1000; assert.strictEqual(E.options(T)[0].affordable, true);
  // Blind: nobody remembers anybody (no notes on you, no memory of your bluffing, no habits seen before), and
  // Last Call pays four times.
  const book = grudgeBook(8, 'bl');
  const B = E.newNight({ seed: 'b', start: 'blind', book }), N = E.newNight({ seed: 'b', book });
  assert.ok(N.mem.bids > 0 && Object.keys(N.prior).length > 0);
  deq(B.mem, { bids: 0, bluffs: 0 }); deq(B.prior, {}); deq(B.you.prior, {});
  const L = E.newNight({ seed: 'b', start: 'blind' }); L.hour = 4; L.cash = 600;
  assert.strictEqual(E.options(L)[0].pot, 2400);
  ok(E.act(L, { t: 'sit', i: 0 })); assert.strictEqual(L.table.pot, 2400);
  // Marked: the room remembers all of your notes, unfaded; everyone reads you (tier 1 and 2 too).
  const shapesBook = { v: 1, nights: 3, me: { bids: 80, bluffs: 30, shapes: { all: { n: 80, b: 30 }, step: { n: 30, b: 25 }, stay: { n: 40, b: 20 } } }, people: {} };
  const M = E.newNight({ seed: 'm', start: 'marked', book: shapesBook }), U = E.newNight({ seed: 'm', book: shapesBook });
  assert.strictEqual(M.you.prior.all.n, 80); assert.strictEqual(U.you.prior.all.n, 60);
  const rgM = rig({ people: ['npc_jolene', 'npc_colt'] }); rgM.start = 'marked'; rgM.you = { tonight: {}, prior: M.you.prior, fired: [] };
  const rgU = rig({ people: ['npc_jolene', 'npc_colt'] }); rgU.you = { tonight: {}, prior: M.you.prior, fired: [] };
  const bid = { who: 0, q: 3, f: 4, shape: ['step', 'stay'] };
  assert.ok(SIM.readOf(rgM, 1, bid), 'tier 1 reads you on a Marked night');
  assert.strictEqual(SIM.readOf(rgU, 1, bid), null, 'and not otherwise');
});

test('Marked and grudges play you harder, and only you: the same decision on another\'s bid; sooner calls on yours', () => {
  // The same draws, with the holder at seat 1 (or a Marked night) and without: on a bid of another seat's, the move is the
  // same every time; on your bid, some change, and every change is toward a call.
  let same = 0, n = 0, changed = 0, toCall = 0, softer = 0, calls0 = 0, calls1 = 0;
  for (let i = 0; i < 400; i++) {
    const dice = [[1 + (i % 6), 2 + (i % 3), 4, 5], [1 + (i * 7 % 6), 3, 1 + (i * 5 % 6), 6], [2, 4, 1 + (i % 4), 5]];
    for (const who of [0, 2]) {
      const A = rig({ seed: 'hard' + i, dice, people: ['npc_tammy', 'npc_carter'] });
      A.table.round.bids = [{ who, q: 3 + (i % 3), f: 2 + (i % 5), p: 0.5, held: 1, bluff: false, habit: null, shape: who === 0 ? ['low'] : undefined }];
      A.table.round.turn = 1; A.table.wait = null;
      const G = J(A); G.table.grudge = { seat: 1, id: 'npc_tammy', stake: 10 };
      const M = J(A); M.start = 'marked';
      const m0 = SIM.botMove(J(A), 1), mg = SIM.botMove(G, 1), mm = SIM.botMove(M, 1);
      if (who === 2) { n += 2; if (JSON.stringify(m0) === JSON.stringify(mg)) same++; if (JSON.stringify(m0) === JSON.stringify(mm)) same++; }
      else for (const m of [mg, mm]) { calls0 += m0.t === 'liar'; calls1 += m.t === 'liar'; if (JSON.stringify(m0) !== JSON.stringify(m)) { changed++; if (m.t === 'liar' && m0.t !== 'liar') toCall++; if (m0.t === 'liar' && m.t !== 'liar') softer++; } }
    }
  }
  assert.strictEqual(same, n, 'another seat\'s bid: the same move');
  assert.ok(changed > 20, changed + ' of your bids met another move');
  // They call your bids sooner: hardly ever a call of theirs taken back (only where believing you less shifts the order of
  // their draws), and more calls in all (the rest of the changes are their own raises, sized as they believe you less).
  assert.ok(softer <= changed * 0.05, `${softer} of ${changed} changes are a call taken back`);
  assert.ok(toCall >= changed * 0.4 && calls1 > calls0 + 20, `${toCall} of ${changed} changes are calls; calls ${calls0} -> ${calls1}`);
  // A seat that is not the holder plays as ever.
  const A = rig({ seed: 'nh', dice: [[2, 3, 4, 5], [1, 3, 5, 6], [2, 2, 4, 6]], people: ['npc_tammy', 'npc_carter'] });
  A.table.round.bids = [{ who: 0, q: 4, f: 3, p: 0.5, held: 1, bluff: false, habit: null, shape: ['low'] }]; A.table.round.turn = 2; A.table.wait = null;
  const G = J(A); G.table.grudge = { seat: 1, id: 'npc_tammy', stake: 10 };
  deq(SIM.botMove(J(A), 2), SIM.botMove(G, 2));
});

test('grudges arise from a regular you knock out or a table you win, only on a night that carries them', () => {
  let marks = 0, ko = 0, wins = 0;
  for (let i = 0; i < 80; i++) {
    const { S, events } = night('ga' + i, { grudges: true });
    events.filter(e => e.t === 'tableEnd').forEach(e => {
      if (e.kind === 'last') { assert.strictEqual(e.grudge, undefined, 'never at Last Call'); return; }
      assert.ok(e.grudge && Array.isArray(e.grudge.marks));
      if (e.won) { wins++; deq(e.grudge.marks.slice().sort(), e.people.slice().sort(), 'a table you won: everyone at it'); }
      else {
        // Not won: only the ones you knocked out (your call was right on their bid, or they called your good bid).
        e.grudge.marks.forEach(id => assert.ok(e.people.includes(id)));
        ko += e.grudge.marks.length;
      }
      marks += e.grudge.marks.length;
    });
    // The log carries it too; the summary lists them.
    assert.deepStrictEqual(J(E.summary(S).marks).length, S.log.filter(t => t.grudge).reduce((a, t) => a + t.grudge.marks.length, 0));
  }
  assert.ok(wins > 20 && ko > 5 && marks > 50, `${wins} wins, ${ko} knocked out, ${marks} marks`);
  // A night that does not carry them makes none, and changes nothing.
  const plain = night('ga0');
  assert.ok(plain.events.filter(e => e.t === 'tableEnd').every(e => e.grudge === undefined));
  assert.ok(plain.S.log.every(t => t.grudge === undefined));
  // The Book keeps them: a page with a grudge waiting, from the hour and kind of the table.
  const book = E.bookApply(null, night('ga1', { grudges: true }).events.concat(night('ga2', { grudges: true }).events));
  const w = E.grudges(book).waiting;
  assert.ok(w.length >= 1 && w.length <= SIM.GRUDGE.KEEP);
  w.forEach(g => { assert.ok(book.people[g.id].grudge); assert.ok(g.hour >= 0 && g.hour <= 3 && ['easy', 'rich'].includes(g.kind)); assert.match(g.line, /^\w+ is back for (her|his|their) money\.$/); });
});

test('grudges come back: one a table, two a night at most, at the hour they lost (or the nearest free table), with a bigger pot', () => {
  for (let i = 0; i < 60; i++) {
    const book = grudgeBook(6, 'gc' + i + ':');
    const S = E.newNight({ seed: 'come' + i, book, grudges: true });
    const marked = S.offers.flat().filter(o => o.grudge);
    const waiting = E.grudges(book).waiting;
    assert.strictEqual(marked.length, Math.min(SIM.GRUDGE.MAX, waiting.length), 'two a night at most');
    marked.forEach(o => {
      assert.ok(o.people.includes(o.grudge.id), 'the holder sits at that table');
      assert.strictEqual(o.grudge.stake, Math.round(o.buyIn * SIM.GRUDGE.STAKE));
      assert.strictEqual(S.offers.flat().filter(x => x.people.includes(o.grudge.id)).length, 1, 'one table each');
    });
    // Only ones the Book holds, the newest first (one already at a table that has a grudge waits for another night).
    marked.forEach(o => assert.ok(waiting.some(g => g.id === o.grudge.id)));
    if (marked.length) assert.ok(waiting.slice(0, 2 + marked.length).some(g => g.id === marked[0].grudge.id) || marked.some(o => o.grudge.id === waiting[0].id));
    // The card says so, and its pot carries the stake.
    for (let h = 0; h < 4; h++) {
      S.hour = h;
      E.options(S).forEach((c, k) => {
        const o = S.offers[h][k];
        if (!o.grudge) { assert.strictEqual(c.grudge, undefined); assert.strictEqual(c.pot, o.buyIn * o.seats); return; }
        assert.strictEqual(c.pot, o.buyIn * o.seats + o.grudge.stake);
        assert.strictEqual(c.grudge.id, o.grudge.id); assert.match(c.grudge.line, /is back for (her|his|their) money\./);
        assert.strictEqual(c.grudge.bonus, Math.round(o.buyIn * SIM.GRUDGE.BONUS));
      });
    }
    S.hour = 0;
  }
  // Placed at their own table: a grudge from the 11 PM big table comes to the 11 PM big table (when free).
  const id = 'npc_vada';
  const book = { v: 1, nights: 4, me: { bids: 0, bluffs: 0 }, people: { [id]: { bids: 0, bluffs: 0, habits: [0, 1, 2].map(() => ({ n: 0, bluff: 0, straight: 0 })), quiet: { n: 0, bluff: 0, straight: 0 }, won: 0, lost: 1, nights: 1, lastNight: 'x', grudge: { night: 3, hour: 2, kind: 'rich' } } } };
  for (let i = 0; i < 20; i++) {
    const S = E.newNight({ seed: 'vada' + i, book, grudges: true });
    const o = S.offers.flat().find(x => x.grudge);
    const already = E.newNight({ seed: 'vada' + i }).offers.flat().find(x => x.people.includes(id));
    if (already) { assert.strictEqual(o.people.includes(id), true); continue; }
    assert.deepStrictEqual([o.hour, o.kind], [2, 'rich']);
  }
  // Without grudges on, the Book's grudges stay home.
  assert.ok(E.newNight({ seed: 'vada0', book }).offers.flat().every(o => !o.grudge));
});

test('a grudge settles: finish ahead of the holder and it pays a little extra; finish behind and it is over too', () => {
  let won = 0, lost = 0;
  for (let i = 0; i < 160 && (won < 6 || lost < 6); i++) {
    const S = E.newNight({ seed: 'gs' + i }); S.hour = 1; S.cash = 1e5; S.grudges = true;
    const o = S.offers[1][0]; o.grudge = { id: o.people[0], stake: Math.round(o.buyIn * SIM.GRUDGE.STAKE) };
    const c0 = S.cash;
    const ev = ok(E.act(S, { t: 'sit', i: 0 }));
    assert.strictEqual(S.table.pot, o.buyIn * 3 + o.grudge.stake);
    assert.ok(find(ev, 'sit').grudge && find(ev, 'sit').grudge.seat === 1);
    deq(E.view(S).table.grudge, { seat: 1, id: o.people[0], stake: o.grudge.stake, line: find(ev, 'sit').grudge.line });
    while (S.phase === 'table') ev.push(...ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S), E))));
    const te = find(ev, 'tableEnd'), g = te.grudge, me = te.place, holderOut = ev.find(e => e.t === 'out' && e.id === o.people[0]);
    assert.strictEqual(g.met, o.people[0]);
    const ahead = te.won || (holderOut && holderOut.place > me);
    assert.strictEqual(g.settled, ahead ? 'won' : 'lost');
    const bonus = pays(ev, 'grudge');
    if (ahead) { won++; assert.strictEqual(bonus.length, 1); assert.strictEqual(bonus[0].amount, Math.round(o.buyIn * SIM.GRUDGE.BONUS)); assert.strictEqual(g.bonus, bonus[0].amount); }
    else { lost++; assert.strictEqual(bonus.length, 0); assert.strictEqual(g.bonus, 0); }
    if (te.won) assert.strictEqual(find(ev, 'pay', e => e.why === 'pot').amount, o.buyIn * 3 + o.grudge.stake, 'the pot carries the stake');
    assert.strictEqual(te.net, S.cash - c0 + 0, 'the net counts the bonus');
    assert.ok(!g.marks.includes(g.met), 'a settled grudge is not made again at the same table');
    // In the Book: over either way, with the history.
    const pre = { v: 1, nights: 2, me: { bids: 0, bluffs: 0 }, people: { [g.met]: { bids: 0, bluffs: 0, habits: [0, 1, 2].map(() => ({ n: 0, bluff: 0, straight: 0 })), quiet: { n: 0, bluff: 0, straight: 0 }, won: 0, lost: 0, nights: 1, lastNight: 'a', grudge: { night: 1, hour: 1, kind: 'easy' } } } };
    const b = E.bookApply(pre, ev);
    assert.strictEqual(b.people[g.met].grudge, undefined);
    const f = b.people[g.met].feud;
    assert.strictEqual(f.met, 1); assert.strictEqual(f.won, ahead ? 1 : 0); assert.strictEqual(f.lost, ahead ? 0 : 1);
    if (ahead) assert.strictEqual(f.took, Math.max(0, te.net)); else assert.strictEqual(f.gave, Math.max(0, -te.net));
    const pg = E.bookPage(b, g.met);
    assert.match(pg.grudge.line, /^Grudge: \d+ nights? met · you took \$[\d,]+ off (her|him|them), lost \$[\d,]+ to (her|him|them) · settled \d, lost \d\.$/);
    assert.strictEqual(E.grudges(b).settled, ahead ? 1 : 0);
  }
  assert.ok(won >= 6 && lost >= 6, `${won} settled, ${lost} lost`);
});

test('grudges fade when not met for five nights, the Book keeps six at most, and a page with none has no grudge line', () => {
  const page = g => ({ bids: 0, bluffs: 0, habits: [0, 1, 2].map(() => ({ n: 0, bluff: 0, straight: 0 })), quiet: { n: 0, bluff: 0, straight: 0 }, won: 0, lost: 1, nights: 1, lastNight: 'x', grudge: g });
  let b = { v: 1, nights: 10, me: { bids: 0, bluffs: 0 }, people: { npc_vada: page({ night: 10, hour: 0, kind: 'easy' }), npc_colt: page({ night: 6, hour: 1, kind: 'rich' }) } };
  deq(E.grudges(b).waiting.map(g => g.id), ['npc_vada', 'npc_colt']);
  assert.match(E.bookPage(b, 'npc_colt').grudge.line, /he wants it back\.$/);
  b = E.bookApply(b, [{ t: 'nightEnd', ending: 'walked', cash: 0, share: '' }]); // night 11: Colt, unmet since 6, fades
  deq(E.grudges(b).waiting.map(g => g.id), ['npc_vada']);
  assert.strictEqual(b.people.npc_colt.grudge, undefined);
  assert.match(E.bookPage(b, 'npc_colt').grudge.line, /it faded\.$/);
  for (let k = 0; k < 4; k++) b = E.bookApply(b, [{ t: 'nightEnd', ending: 'walked', cash: 0, share: '' }]);
  deq(E.grudges(b).waiting, []);
  // At most GRUDGE_KEEP waiting: the newest kept.
  const ids = ['npc_vada', 'npc_colt', 'npc_ray', 'npc_june', 'npc_royce', 'npc_jolene', 'npc_travis', 'npc_lyman'];
  const ev = [{ t: 'tableEnd', hour: 1, kind: 'rich', place: 1, won: true, payout: 0, refund: 0, net: 100, rounds: 5, people: ids.slice(0, 3), cash: 0, grudge: { marks: ids.slice(0, 3) } }, { t: 'tableEnd', hour: 2, kind: 'rich', place: 1, won: true, payout: 0, refund: 0, net: 100, rounds: 5, people: ids.slice(3), cash: 0, grudge: { marks: ids.slice(3) } }];
  const c = E.bookApply(null, ev);
  assert.strictEqual(E.grudges(c).waiting.length, SIM.GRUDGE.KEEP);
  assert.strictEqual(E.bookPage(c, 'npc_marcus').grudge, null);
  assert.strictEqual(E.bookPage(E.bookApply(null, []), 'npc_vada').grudge, null);
  // The house never holds one.
  const d = E.bookApply(null, [{ t: 'tableEnd', hour: 4, kind: 'last', place: 1, won: true, payout: 0, refund: 0, net: 100, rounds: 5, people: ['npc_loretta', 'npc_curtis'], cash: 0, grudge: { marks: ['npc_loretta', 'npc_curtis'] } }]);
  deq(E.grudges(d).waiting, []);
});

test('grudges are fair: the holder never sees your dice (the same moves with your faces changed)', () => {
  let checked = 0;
  for (let i = 0; i < 200; i++) {
    const A = rig({ seed: 'gf' + i, dice: [[1 + (i % 6), 2, 1 + (i * 3 % 6), 5], [1 + (i * 7 % 6), 3, 4, 6], [2, 4, 1 + (i % 4), 5]], people: ['npc_tammy', 'npc_carter'] });
    A.table.grudge = { seat: 1, id: 'npc_tammy', stake: 10 };
    A.table.round.bids = [{ who: 0, q: 3 + (i % 3), f: 2 + (i % 5), p: 0.5, held: 1, bluff: false, habit: null, shape: ['low'] }]; A.table.round.turn = 1; A.table.wait = null;
    const B = J(A); B.table.seats[0].dice = B.table.seats[0].dice.map(d => 1 + (d % 6));
    deq(SIM.botMove(J(A), 1), SIM.botMove(B, 1)); checked++;
  }
  assert.strictEqual(checked, 200);
});

test('nights that carry grudges, over a run with the Book kept: they arise, come back, settle and fade, and every night ends', () => {
  let book = null, met = 0, settled = 0, faded = 0, appeared = 0;
  for (let i = 0; i < 40; i++) {
    const before = E.grudges(book).waiting.map(g => g.id);
    const { S, events } = night('run' + i, { book, grudges: true });
    appeared += S.offers.flat().filter(o => o.grudge).length;
    const sum = E.summary(S);
    met += sum.grudges.length; settled += sum.grudges.filter(g => g.settled === 'won').length;
    book = E.bookApply(book, events);
    const after = E.grudges(book).waiting.map(g => g.id);
    faded += before.filter(id => !after.includes(id) && !sum.grudges.some(g => g.id === id) && !book.people[id].grudge).length;
    assert.ok(after.length <= SIM.GRUDGE.KEEP);
  }
  assert.ok(appeared > 20 && met > 10 && settled > 3, `${appeared} came, ${met} met, ${settled} settled`);
  assert.strictEqual(E.grudges(book).settled, settled);
  assert.ok(faded >= 1, faded + ' faded');
});

test('an old Book (kept before grudges) and an old ledger-less player carry on: grudges on with a Book that has none', () => {
  const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'fixtures', 'bones-lastcall-v1.json'), 'utf8'));
  const book = fx.book || (fx.data && fx.data.book) || null;
  const S = E.newNight({ seed: 'oldbook', book, grudges: true, room: 2, start: 'marked' });
  assert.ok(S.offers.flat().every(o => !o.grudge), 'an old Book has no grudges waiting');
  const { S: S2, events } = E.playNight('oldbook', E.basicPolicy, { book, grudges: true, room: 2, keepEvents: true });
  assert.ok(S2.phase === 'over');
  const b = E.bookApply(book, events);
  assert.ok(b.people && b.me);
});

// ===================================================================== smoke
test('a few hundred nights finish without throwing and with sane distributions', () => {
  const end = { house: 0, cleaned: 0, walked: 0, bust: 0 }, rounds = [];
  for (let i = 0; i < 300; i++) {
    const { S } = E.playNight('smoke' + i, null, { tricks: i % 5 === 0 ? ['mirror', 'rabbit'] : [] });
    end[S.ending]++;
    assert.ok(S.cash >= 0 && Number.isFinite(S.cash));
    S.log.forEach(t => rounds.push(t.rounds));
    assert.ok(S.log.length >= 1 && S.log.length <= 5);
  }
  for (const k in end) assert.ok(end[k] > 0, 'some ' + k + ': ' + JSON.stringify(end));
  assert.ok(end.bust < 250);
  const med = rounds.sort((a, b) => a - b)[rounds.length >> 1];
  assert.ok(med >= 6 && med <= 14, 'median rounds ' + med);
});

runAll();
