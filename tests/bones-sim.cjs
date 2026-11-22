#!/usr/bin/env node
'use strict';
/* Bones balance sim (design section 8). Extracts the engine block from
   bones.html by its markers, runs it in vm, and plays seeded nights with
   proxy players:
     Mathy    plays by the Count alone (Liar under 38%; opens, or jumps, to
              the most of its best face the Count puts at 60%, else the
              smallest raise it likes; rarely bluffs).
     Reader   Mathy + knows each person's tell and bluff rate, and weighs the
              bid in front of it by them (Bayes on the habit shown).
   each with and without a sensible trick buyer, plus a per-trick ablation
   (Mathy holding only trick X from the start, buying nothing).
   Usage: node tests/bones-sim.cjs [nights] [--rates] [--quick]
     --rates  also print every person's measured bluff rate (the engine's RATE).
     --quick  skip the per-trick ablation. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine() {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'bones.html'), 'utf8');
  const a = html.indexOf('/* ==BONES:ENGINE:BEGIN== */'), b = html.indexOf('/* ==BONES:ENGINE:END== */');
  if (a < 0 || b < 0) throw new Error('engine markers not found in bones.html');
  const ctx = vm.createContext({});
  vm.runInContext(html.slice(a, b), ctx, { filename: 'bones-engine.js' });
  return ctx.Game.Engine;
}
const E = loadEngine();
const SIM = E._sim;

// ----- proxy players -----
const wildOf = v => v.table.wild;
const hitF = (d, f, wild) => d === f || (wild && d === 1);

// Known dice from the view: mine plus anything shown under other cups.
function knownDice(v) {
  const t = v.table, mine = t.myDice || [];
  const shown = [];
  t.seats.forEach(s => { if (!s.isMe) s.shown.forEach(x => shown.push({ seat: s.seat, face: x.face })); });
  return { mine, shown };
}

// What a bid in front of you is really worth depends on whether it is a bluff.
// CAL is learned from a training pass of Mathy nights (by Count bucket):
// P(bluff), P(true | bluff), P(true | straight). Mathy never uses it; the
// readers combine it with what they know of the bidder (rate, tell) by Bayes.
let CAL = null;
const NB = 20;
const bucketOf = c => Math.min(NB - 1, Math.floor(c * NB));
function train(nights) {
  const acc = [];
  for (let k = 0; k < NB; k++) acc.push({ n: 0, b: 0, tb: 0, ts: 0 });
  const M = makeProxy({});
  for (let i = 0; i < nights; i++) {
    const S = E.newNight({ seed: 'train:' + i });
    for (let g = 0; S.phase !== 'over' && g < 20000; g++) {
      const v = E.view(S), L = E.legal(S);
      if (L.need === 'turn' && v.table.bid && v.table.bid.id !== 'me') {
        const T = S.table, bid = T.round.bids[T.round.bids.length - 1], wild = T.rule !== 'straight';
        let cnt = 0; T.seats.forEach(s => { if (!s.out) s.dice.forEach(d => { if (hitF(d, bid.f, wild)) cnt++; }); });
        const x = acc[bucketOf(E.count(S, bid.q, bid.f))];
        x.n++; if (bid.bluff) { x.b++; if (cnt >= bid.q) x.tb++; } else if (cnt >= bid.q) x.ts++;
      }
      E.act(S, M(S, v, L));
    }
  }
  // Light smoothing toward the bucket's own Count so thin buckets stay sane.
  CAL = acc.map((x, k) => {
    const c = (k + 0.5) / NB;
    return { pb: (x.b + 0.25 * 2) / (x.n + 2), tb: (x.tb + c * 0.5 * 2) / (x.b + 2), ts: (x.ts + Math.min(1, c * 1.3) * 2) / (x.n - x.b + 2) };
  });
}

// What the proxy believes about the bid in front of it: the Count, or the
// calibrated value reweighted by who made it (rate) and the habit they showed (tell).
const AVG_RATE = 0.24;
const odds = p => p / (1 - p);
function believe(S, v, know) {
  const b = v.table.bid;
  const c = E.count(S, b.q, b.f);
  if (!know || b.id === 'me' || c === 0 || c === 1 || !CAL) return c;
  const per = SIM.person(b.id);
  const h = v.table.history[v.table.history.length - 1].habit;
  let rate = null, tell = false;
  if (know.rates) rate = RATES[b.id] != null ? RATES[b.id] : per.bluff;
  if (know.ledger) { const s = v.table.seats[b.who].ledger; const m = /1 bid in (\d+)/.exec(s || ''); rate = m ? 1 / +m[1] : /every other/.test(s) ? 0.5 : 0.05; }
  if (know.tells) tell = true;
  if (know.glasses && h && h.underline) tell = true;
  const cal = CAL[bucketOf(c)];
  let o = odds(clamp(cal.pb, 0.01, 0.99));
  if (rate != null) o *= odds(clamp(rate, 0.02, 0.9)) / odds(AVG_RATE);
  if (tell) {
    const st = SIM.TELL[per.tier];
    const shown = !!h && h.i === per.tell;
    // Glasses only ever confirm a sighting; without the underline there is nothing to weigh.
    if (shown || know.tells) {
      const pIfApplies = shown ? st[0] : 1 - st[0], pIfNot = shown ? st[1] : 1 - st[1];
      o *= per.kind === 'bluff' ? pIfApplies / pIfNot : pIfNot / pIfApplies;
    }
  }
  const post = o / (1 + o);
  return post * cal.tb + (1 - post) * cal.ts;
}
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

const ORDER = ['shaved', 'barmirror', 'extrabone', 'lastword', 'double', 'rabbit', 'honest', 'mirror', 'housemoney', 'loaded', 'hothand', 'close', 'cornered', 'nod', 'sticky', 'palm', 'snake', 'sidebet', 'slowroll', 'pokerface', 'tab', 'friends', 'glasses', 'ledger'];
function bestFace(mine, faces, wild) {
  let best = faces[faces.length - 1], bc = -1;
  for (const f of faces) { const c = mine.filter(d => hitF(d, f, wild)).length; if (c >= bc) { bc = c; best = f; } }
  return { f: best, c: bc };
}

function makeProxy(opts) {
  const know = opts.know || null, buys = !!opts.buy, thr = opts.thr || 0.38, likeP = opts.like || 0.5, cmp = opts.cmp || 0, openP = opts.open || 0.5, jumpAt = opts.jump || 0.6;
  return function policy(S, v, L) {
    if (S.phase === 'choose') {
      if (!L.sit.length) return { t: 'walk' };
      const o = v.options;
      if (o.length === 1) return { t: 'sit', i: 0 };
      const rich = o.find(c => c.kind === 'rich'), easy = o.find(c => c.kind === 'easy');
      const pickRich = rich.affordable && !rich.viaTab && S.cash >= rich.buyIn * (opts.richX || 2);
      return { t: 'sit', i: pickRich ? rich.i : easy.affordable ? easy.i : rich.i };
    }
    if (S.phase === 'shop') {
      if (buys) {
        const sv = v.shop;
        const nextEasy = S.hour < 3 ? Math.min(...E.HOURS[S.hour + 1].easy ? [E.HOURS[S.hour + 1].easy.buyIn] : [0]) : 500;
        const reserve = nextEasy * 1.25;
        const cands = sv.offers.filter(x => x && x.affordable && S.cash - x.price >= reserve && ORDER.indexOf(x.id) < (opts.buyTop || 16)).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
        if (cands.length && S.tricks.length < 5) return { t: 'buy', i: cands[0].i };
      }
      return { t: 'leave' };
    }
    const t = v.table;
    if (L.need === 'next') return { t: 'next' };
    const mine = t.myDice || [];
    if (L.uses.includes('slowroll')) {
      // Keep the best face (and wilds); re-roll the rest.
      const { f } = bestFace(mine, t.faces, t.wild);
      const dice = mine.map((d, i) => i).filter(i => !hitF(mine[i], f, t.wild) && !(t.myFixed || []).includes(i));
      if (dice.length) return { t: 'use', id: 'slowroll', dice };
    }
    if (L.need === 'ready') return { t: 'go' };

    const b = t.bid;
    // A holder plays to the trick: Side Bet makes Spot On worth more, Double or
    // Nothing makes a wrong Liar dearer, Poker Face makes a bluff cheaper.
    const held = id => v.tricks.some(x => x.id === id && !x.asleep);
    const spotAt = held('sidebet') ? 0.38 : 0.42, bluffPct = held('pokerface') ? 15 : 5;
    if (b) {
      const pc = believe(S, v, know);
      if (L.uses.includes('nod') && pc > 0.3 && pc < 0.6) return { t: 'use', id: 'nod' };
      if (pc < thr) return held('double') && pc < 0.15 ? { t: 'liar', double: true } : { t: 'liar' };
      if (E.countExact(S, b.q, b.f) > spotAt && pc < 0.75) return { t: 'spot' };
    }
    // Raises: the smallest it likes, preferring its best face at that size. A reader
    // also trusts a face the bidder seems to really hold (same uplift, in odds, as
    // its belief in the bid in front over the bare Count).
    let lift = 1;
    if (know && b && b.id !== 'me') { const c0 = E.count(S, b.q, b.f), c1 = believe(S, v, know); if (c0 > 0.02 && c0 < 0.98) lift = odds(clamp(c1, 0.02, 0.98)) / odds(c0); }
    const countR = (q, f) => { const c = E.count(S, q, f); if (lift === 1 || f !== b.f || c <= 0 || c >= 1) return c; const o = odds(c) * lift; return o / (1 + o); };
    if (L.canBid) {
      // Open, or jump, to the most of its best face it puts at `jumpAt` (60%), as a
      // sensible player does; when that is not a legal raise, the smallest raise it likes.
      let pick = null;
      for (const f of L.faces) {
        let q = 0;
        for (let k = 1; k <= L.maxQ; k++) { if (E.count(S, k, f) >= jumpAt) q = k; else break; }
        if (q && (!pick || q > pick.q || (q === pick.q && E.count(S, q, f) >= E.count(S, pick.q, pick.f)))) pick = { q, f };
      }
      if (pick && !E.isLegalBid(S, pick.q, pick.f)) pick = null;
      const want = b ? likeP : openP;
      for (let q = L.minBid.q; q <= Math.min(L.maxQ, L.minBid.q + 2) && !pick; q++) {
        let bestC = -1;
        for (const f of L.faces) if (E.isLegalBid(S, q, f)) { const c = countR(q, f); if (c >= want && c > bestC) { bestC = c; pick = { q, f }; } }
      }
      // Squeezed with Palm in hand: turn a stray die to the face we'd raise, then decide again.
      if (!pick && L.uses.includes('palm') && mine.length) {
        const f = b ? b.f : bestFace(mine, t.faces, t.wild).f;
        const k = mine.findIndex(d => !hitF(d, f, t.wild));
        if (k >= 0) return { t: 'use', id: 'palm', die: k, face: f };
      }
      const bluffNow = (S.rng >>> 0) % 100 < bluffPct;
      // Compare: when the bid in front is likelier false than its best raise is true, call.
      if (cmp && b && pick && 1 - believe(S, v, know) > countR(pick.q, pick.f) + cmp) return { t: 'liar' };
      if (pick && !bluffNow) return { t: 'bid', q: pick.q, f: pick.f };
      if (L.mustBid || bluffNow || (b && believe(S, v, know) >= 0.5)) return { t: 'bid', q: L.minBid.q, f: L.minBid.f };
    }
    return { t: 'liar' };
  };
}

// ----- measuring -----
let RATES = {};
function measure(name, policy, nights, opts) {
  opts = opts || {};
  const r = { name, nights, end: { house: 0, cleaned: 0, walked: 0, bust: 0 }, cash: [], lc500: 0, tables: {}, rounds: [], bids: {} };
  for (let i = 0; i < nights; i++) {
    const seed = (opts.seedBase || 'sim') + ':' + i;
    const { S, events } = E.playNight(seed, policy, { tricks: opts.tricks, keepEvents: !!opts.rates });
    r.end[S.ending]++;
    r.cash.push(S.cash);
    if (S.log.some(t => t.kind === 'last')) r.lc500++;
    S.log.forEach(t => {
      const k = E.HOURS[t.hour].name + ' ' + t.kind;
      const x = r.tables[k] = r.tables[k] || { n: 0, w: 0 };
      x.n++; if (t.won) x.w++;
      r.rounds.push(t.rounds);
    });
    if (opts.rates) events.forEach(e => { if (e.t === 'readout') e.bids.forEach(b => { if (b.id === 'me') return; const x = r.bids[b.id] = r.bids[b.id] || { n: 0, b: 0 }; x.n++; if (b.bluff) x.b++; }); });
  }
  return r;
}
// One table on its own: a fresh night moved to that hour with money to spare,
// so every hour and kind is measured on the same footing (line-ups vary by seed).
function tableRate(policy, h, kind, n, tricks) {
  let w = 0;
  const rounds = [];
  for (let i = 0; i < n; i++) {
    const S = E.newNight({ seed: 'tbl:' + h + kind + ':' + i, tricks });
    S.hour = h; S.cash = h === 4 ? 1000 : 1e6;
    E.act(S, { t: 'sit', i: kind === 'rich' ? 1 : 0 });
    for (let g = 0; S.phase === 'table'; g++) { if (g > 5000) throw new Error('table stuck'); const ev = E.act(S, policy(S, E.view(S), E.legal(S))); if (ev[0].t === 'error') throw new Error(ev[0].msg); }
    const t = S.log[S.log.length - 1];
    if (t.won) w++;
    rounds.push(t.rounds);
  }
  return { w: w / n, rounds };
}
const TABLES = [[0, 'easy'], [0, 'rich'], [1, 'easy'], [1, 'rich'], [2, 'easy'], [2, 'rich'], [3, 'easy'], [3, 'rich'], [4, 'last']];
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (x, n) => n ? (100 * x / n).toFixed(1) + '%' : '-';
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

function main() {
  const args = process.argv.slice(2);
  const nights = +(args.find(a => /^\d+$/.test(a)) || 2000);
  const quick = args.includes('--quick');
  const t0 = Date.now();
  // Measure the people's real bluff rates first (the Reader knows them; the engine's Ledger shows them).
  const rateRun = measure('rates', makeProxy({}), Math.max(400, Math.floor(nights / 2)), { rates: true, seedBase: 'rates' });
  RATES = {};
  for (const id in rateRun.bids) RATES[id] = rateRun.bids[id].b / rateRun.bids[id].n;
  train(Math.max(300, Math.floor(nights / 3)));
  const runs = [
    measure('Mathy', makeProxy({}), nights),
    measure('Mathy+buy', makeProxy({ buy: true }), nights),
    measure('Reader', makeProxy({ know: { rates: true, tells: true } }), nights),
    measure('Reader-no-tells', makeProxy({ know: { rates: true } }), nights),
    measure('Reader+buy', makeProxy({ know: { rates: true, tells: true }, buy: true }), nights)
  ];
  console.log(`Bones balance sim · ${nights} nights per player · engine ${E.VERSION}`);
  const nt = Math.max(300, Math.floor(nights / 2));
  const tp = [['Mathy', makeProxy({})], ['Reader', makeProxy({ know: { rates: true, tells: true } })], ['Rdr-no-tells', makeProxy({ know: { rates: true } })]];
  console.log(`\nTable win rate, no tricks (${nt} tables each, played on their own)`);
  console.log(pad('', 16) + tp.map(x => padL(x[0], 14)).join('') + padL('Reader-Mathy', 14) + padL('tells add', 11) + padL('rounds', 8));
  const allRounds = [];
  for (const [h, kind] of TABLES) {
    const rs = tp.map(([, pol]) => tableRate(pol, h, kind, nt));
    allRounds.push(...rs[0].rounds);
    console.log(pad(E.HOURS[h].name + ' ' + kind, 16) + rs.map(r => padL(pct(r.w, 1), 14)).join('') + padL('+' + (100 * (rs[1].w - rs[0].w)).toFixed(1), 14) + padL('+' + (100 * (rs[1].w - rs[2].w)).toFixed(1), 11) + padL(median(rs[0].rounds), 8));
  }
  console.log(pad('median rounds per table (Mathy): ' + median(allRounds), 16));
  console.log(`\nWhole nights (${nights} each)`);
  console.log(pad('', 16) + runs.map(r => padL(r.name, 18)).join(''));
  const row = (label, fn) => console.log(pad(label, 16) + runs.map(r => padL(fn(r), 18)).join(''));
  console.log('');
  row('LC with >=$500', r => pct(r.lc500, r.nights));
  row('beat the house', r => pct(r.end.house, r.nights));
  row('cleaned', r => pct(r.end.cleaned, r.nights));
  row('walked', r => pct(r.end.walked, r.nights));
  row('bust', r => pct(r.end.bust, r.nights));
  row('median cash', r => '$' + median(r.cash));
  row('mean cash', r => '$' + Math.round(r.cash.reduce((a, b) => a + b, 0) / r.nights));
  row('median rounds', r => median(r.rounds));
  if (!quick) {
    const base = runs[0];
    const n2 = Math.max(200, Math.floor(nights / 2));
    const b2 = measure('base', makeProxy({}), n2, { seedBase: 'abl' });
    console.log(`\nPer-trick lift: Mathy holding only that trick from the start (${n2} nights each; base house ${pct(b2.end.house, n2)}, LC ${pct(b2.lc500, n2)}, median $${median(b2.cash)})`);
    console.log(pad('trick', 20) + padL('house', 9) + padL('lift', 8) + padL('LC>=500', 9) + padL('lift', 8) + padL('mean $', 9) + padL('lift', 8));
    const meanOf = r => r.cash.reduce((a, b) => a + b, 0) / r.nights;
    const bb = measure('base+buy', makeProxy({ buy: true }), n2, { seedBase: 'abl' });
    for (const t of E.TRICKS) {
      const know = t.id === 'ledger' ? { ledger: true } : t.id === 'glasses' ? { glasses: true } : null;
      // Friends Rates and A Tab only do anything for a buyer / someone short: compare buyers.
      const buyer = t.id === 'friends' || t.id === 'tab';
      const base = buyer ? bb : b2;
      const r = measure(t.id, makeProxy({ know, buy: buyer }), n2, { tricks: [t.id], seedBase: 'abl' });
      const dh = 100 * (r.end.house - base.end.house) / n2, dl = 100 * (r.lc500 - base.lc500) / n2, dm = meanOf(r) - meanOf(base);
      console.log(pad(t.name + (buyer ? ' *' : ''), 20) + padL(pct(r.end.house, n2), 9) + padL((dh >= 0 ? '+' : '') + dh.toFixed(1), 8) + padL(pct(r.lc500, n2), 9) + padL((dl >= 0 ? '+' : '') + dl.toFixed(1), 8) + padL('$' + Math.round(meanOf(r)), 9) + padL((dm >= 0 ? '+' : '') + Math.round(dm), 8));
    }
    console.log('  * measured on the trick buyer (Mathy+buy) against Mathy+buy without it');
  }
  if (args.includes('--rates')) {
    console.log('\nMeasured bluff rates (share of bids that were bluffs):');
    console.log(JSON.stringify(Object.keys(RATES).sort().reduce((o, id) => { o[id] = Math.round(RATES[id] * 100) / 100; return o; }, {})));
  }
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
if (require.main === module) main();
module.exports = { loadEngine, makeProxy, measure, train, tableRate, TABLES, believe, getRates: () => RATES, setRates: r => { RATES = r; } };
