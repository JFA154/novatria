#!/usr/bin/env node
'use strict';
/* Bones engine tests: Node only, no browser. Extracts the engine block from
   bones.html by its markers, runs it in vm, and checks the rules exactly.
   Most rule tests rig a table: S is plain JSON, so a test can set the cups and
   the bids in front of you, then act and read the events.
   Usage: node tests/bones-engine.test.cjs   (or node tests/run.cjs bones-engine) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const HTML = fs.readFileSync(path.resolve(__dirname, '..', 'bones.html'), 'utf8');
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
  T.round = { no: T.roundNo, opener: o.opener || 0, turn: 0, bids: (o.bids || []).map(b => ({ who: b.who, q: b.q, f: b.f, p: 0.5, held: 0, bluff: false, habit: null })), blindSeat: -1, looked: false, peek: o.peek || [], ones: o.ones != null ? o.ones : null, nod: null, slow: false, hot: false, fixed: o.fixed || [], pinned: {} };
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
  // One plain script, and the page's own CSP copied from index.html.
  const scripts = HTML.match(/<script[^>]*>/g);
  deq(scripts, ['<script>']);
  const csp = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8').split('\n')[5];
  assert.ok(HTML.includes(csp), 'same CSP meta as index.html');
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
  const idx = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
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
    const S = E.newNight({ seed: 'w' + i, tricks: i % 2 ? ['slowroll'] : [] });
    while (S.phase !== 'over') {
      const ev = ok(E.act(S, E.basicPolicy(S, E.view(S), E.legal(S))));
      const last = ev[ev.length - 1];
      assert.strictEqual(last.t, 'wait');
      assert.strictEqual(last.need, E.legal(S).need);
      assert.ok(['turn', 'ready', 'next', 'choose', 'shop', 'over'].includes(last.need));
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
  deq(E.newNight({ daily: '2026-11-21' }).offers, E.newNight({ daily: '2026-11-21' }).offers);
  assert.strictEqual(E.dailySeed('2026-11-21'), 'daily:2026-11-21');
  assert.strictEqual(E.newNight({ daily: '2026-11-21' }).seed, 'daily:2026-11-21');
});

// ===================================================================== house rules
test('house rules: Short cups 3 dice, Deep cups 6, Double ante doubles the ante', () => {
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
    // The blind bid is classified from no cup at all: P(at least 2 threes among 15 fair dice).
    const b = S.table.round ? S.table.round.bids[0] : null;
    if (b) assert.ok(Math.abs(b.p - SIM.tail(15, 2, 1 / 3)) < 1e-12);
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
      tot++; if (exact ? c === q : c >= q) good++;
    }
    let j = 0; while (j < n && vals[j] === 6) { vals[j] = 1; j++; }
    if (j === n) break; vals[j]++;
  }
  return good / tot;
}
test('the Count matches brute-force enumeration (wilds, Straight, peeks, Bar Mirror, Shaved Die)', () => {
  let cases = 0;
  const setups = [
    { dice: [[2, 1, 4], [3, 4], [6, 6, 2]] },
    { rule: 'straight', dice: [[1, 1, 3], [3, 4], [6, 1, 2]] },
    { dice: [[5], [3, 4, 1], [6, 2]], peek: [{ seat: 1, i: 2, why: 'mirror' }] },
    { dice: [[1, 5, 5], [3, 1, 4], [6, 2]], ones: 3 },
    { rule: 'straight', dice: [[1, 5], [3, 1, 4], [6, 1]], ones: 3 },
    { rule: 'open', dice: [[2, 2], [4, 1, 4], [3, 6]] },
    { dice: [[1, 3, 5], [4, 4], [2, 6]], fixed: [0], bids: [{ who: 2, q: 3, f: 4 }] }
  ];
  for (const o of setups) {
    const S = rig(Object.assign({ bids: o.bids || [{ who: 2, q: 1, f: 2 }] }, o));
    if (o.ones != null) S.table.round.ones = S.table.seats.reduce((a, s) => a + s.dice.filter(d => d === 1).length, 0);
    const T = S.table, faces = T.rule === 'straight' ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6];
    const total = T.seats.reduce((a, s) => a + s.dice.length, 0);
    for (let q = 0; q <= total + 1; q++) for (const f of faces) {
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
  deq(book.me, me);
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

test('bots remember how you bluff (this table plus a little of the Book); Poker Face hides it', () => {
  const S = rig({});
  S.table.seen[0] = { n: 20, b: 18 };
  assert.ok(SIM.estBluff(S, 0) > 0.7);
  const P2 = rig({ tricks: ['pokerface'] });
  P2.table.seen[0] = { n: 20, b: 18 };
  assert.strictEqual(SIM.estBluff(P2, 0), 0.25);
  const B = rig({ book: { v: 1, nights: 3, me: { bids: 40, bluffs: 40 }, people: {} } });
  const C = rig({});
  assert.ok(SIM.estBluff(B, 0) > SIM.estBluff(C, 0) + 0.3);
});

// ===================================================================== bots
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
  assert.strictEqual(find(ev, 'sit').seats[0].dice, 6); assert.strictEqual(S.table.start[0], 6); assert.strictEqual(S.table.start[1], 5);
  const mine = find(ev, 'roll').mine;
  assert.strictEqual(mine.length, 6); assert.strictEqual(mine[0], 1); assert.strictEqual(mine[1], 6);
  deq(find(ev, 'trick', e => e.id === 'extrabone'), { t: 'trick', id: 'extrabone', dice: 6 });
  const L = rig({ hour: 4, tricks: ['extrabone', 'loaded'] });
  assert.strictEqual(L.table.seats[0].n, 5, 'Loretta counts the bones');
  assert.ok(E.view(L).tricks.every(t => t.asleep));
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

test('Slow Roll: before the first bid, re-roll any of your dice, once per round', () => {
  let S = null;
  for (let i = 0; i < 30 && !S; i++) { const T = E.newNight({ seed: 'slow' + i, tricks: ['slowroll'] }); const ev = ok(E.sit(T, 0)); if (find(ev, 'roll').opener !== 0) S = T; }
  assert.strictEqual(S.table.wait, 'ready');
  deq(E.legal(S).uses.includes('slowroll'), true);
  const before = S.table.seats[0].dice.slice();
  const ev = ok(E.act(S, { t: 'use', id: 'slowroll', dice: [1, 3] }));
  const after = find(ev, 'trick', e => e.id === 'slowroll').mine;
  deq([after[0], after[2], after[4]], [before[0], before[2], before[4]]);
  assert.ok(isErr(E.act(S, { t: 'use', id: 'slowroll' })), 'once per round');
  ok(E.act(S, { t: 'go' }));
  const R = rig({ tricks: ['slowroll'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  assert.ok(!E.legal(R).uses.includes('slowroll'), 'not after the first bid');
  assert.ok(isErr(E.act(rig({ tricks: ['slowroll'], dice: [[2, 3], [4], [5]] }), { t: 'use', id: 'slowroll', dice: [5] })));
});

test('Palm: once per table, turn one of your dice to any face', () => {
  const S = rig({ tricks: ['palm'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  const ev = ok(E.act(S, { t: 'use', id: 'palm', die: 1, face: 4 }));
  deq(find(ev, 'trick', e => e.id === 'palm').mine, [2, 4]);
  deq(S.table.seats[0].dice, [2, 4]);
  assert.strictEqual(S.table.wait, 'turn');
  assert.ok(isErr(E.act(S, { t: 'use', id: 'palm', die: 0, face: 4 })));
  assert.ok(isErr(E.act(rig({ tricks: ['palm'], dice: [[2, 3], [4], [5]] }), { t: 'use', id: 'palm', die: 2, face: 4 })));
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

test('Sticky Fingers +1 ante on a caught liar; Side Bet 6 antes on Spot On; Snake Eyes an ante for two 1s', () => {
  let S = rig({ tricks: ['sticky'], dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  deq(pays(ok(E.act(S, { t: 'liar' }))).map(p => [p.amount, p.why]), [[3, 'won'], [3, 'sticky']]);
  S = rig({ tricks: ['sidebet'], dice: [[2, 3], [4, 4], [4, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  deq(pays(ok(E.act(S, { t: 'spot' }))).map(p => [p.amount, p.why]), [[18, 'spot']]);
  let got = 0, rolls = 0;
  for (let i = 0; i < 40; i++) {
    const T = rig({ seed: 'sn' + i, tricks: ['snake'] });
    T.table.round = null; T.table.wait = 'next';
    const ev = ok(E.act(T, { t: 'next' }));
    const roll = find(ev, 'roll');
    if (!roll || !roll.mine) continue;
    rolls++;
    const two = roll.mine.filter(d => d === 1).length >= 2;
    assert.strictEqual(!!find(ev, 'trick', e => e.id === 'snake'), two);
    if (two) { got++; deq(pays(ev, 'snake').map(p => p.amount), [3]); }
  }
  assert.ok(rolls > 30 && got > 0);
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

test('Double or Nothing: you may call Liar for 2 dice, either way', () => {
  let ev;
  let S;
  S = rig({ tricks: ['double'], dice: [[2, 3], [4, 4], [5, 6, 6]], bids: [{ who: 2, q: 3, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar', double: true }));
  deq(find(ev, 'lose'), { t: 'lose', who: 2, id: 'npc_dewayne', n: 2, left: 1 });
  S = rig({ tricks: ['double'], dice: [[2, 3, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  ev = ok(E.act(S, { t: 'liar', double: true }));
  deq(find(ev, 'lose'), { t: 'lose', who: 0, id: 'me', n: 2, left: 1 });
  S = rig({ tricks: ['double'], dice: [[2, 3, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] });
  assert.strictEqual(find(ok(E.act(S, { t: 'liar' })), 'lose').n, 1, 'a plain call stays for 1');
  assert.ok(isErr(E.act(rig({ dice: [[2, 3], [4, 4], [5, 6]], bids: [{ who: 2, q: 2, f: 4 }] }), { t: 'liar', double: true })));
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
  assert.ok(med >= 6 && med <= 16, 'median rounds ' + med);
});

runAll();
