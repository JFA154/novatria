#!/usr/bin/env node
'use strict';
/* Bones balance sim (design section 8). Extracts the engine block from
   index.html by its markers, runs it in vm, and plays seeded nights with
   proxy players:
     Mathy    plays by the Count alone (Liar under 38%; opens, or jumps, to
              the most of its best face the Count puts at 60%, else the
              smallest raise it likes; rarely bluffs).
     Reader   Mathy + knows each person's tell and bluff rate, and weighs the
              bid in front of it by them (Bayes on the habit shown). Against
              the house at Last Call it has not studied them: it knows how often
              each of their habits came with a bluff over all their bids (what an
              unsplit Book would say), not in which situation.
     Studied  the Reader that has studied the house: for Loretta and Curtis it
              weighs each habit (and no habit) and their bluff rate by the
              situation the bid was made in (Loretta level or behind you, ahead
              of you, or gone quiet; Curtis opening or raising), as the Book's
              split pages show them. Against everyone else it is the Reader.
   The house's numbers both use are measured, not given: a training pass of Last
   Call tables (houseTrain) counts every revealed house bid by situation, habit
   and bluff, as a Book kept long enough would.
   each with and without a sensible trick buyer, plus a per-trick ablation
   (Mathy holding only trick X from the start, buying nothing).
   The per-trick ablation is run for Mathy and the Reader (and Poker Face also for
   the Bluffer: Mathy that tells a sensible lie on a fixed share of its bids). A proxy
   holding a trick uses it as a sensible holder would: Slow Roll's one tap (keep the
   best face), Palm on the first decision of a round, bids at 75% rather than 60% with
   a cup a dice trick made stronger than it looks (Loaded Six, Slow Roll, Palm),
   Double or Nothing only on a sure call (and, as a measured variant, the "always press"
   player who spends its calls for 2 on its first Liar calls of each table), Side Bet on whoever it believes is right,
   and a buyer holding Friends Rates sells it when the slots are full and it wants
   the trick on offer.
   The room reads you back (sharp people use the shape of your bids once a shape has
   become a tell), measured with two more proxies, both Mathy plus deliberate bluffs on
   PM_SHARE of its bids when a lie is there to tell:
     Predictable  tells every lie the same way: a step of one on the last bid's face
                  (and never raises that way when it holds the dice).
     Mixer        picks the shape of each lie at random (open, same count higher face,
                  a step, a jump; stay on the face or switch).
   Their table win rates are measured with a warm Book (WARM nights of their own play
   first, so the room has notes on them), and their whole nights both alone and in a run
   of nights with the Book carried from one to the next. Every proxy's row also counts
   the reads that changed a decision and how many nights ended with a tell on record.
   Usage: node tests/bones-sim.cjs [nights] [--rates] [--quick] [--only=id,id]
     --rates  also print every person's measured bluff rate (the engine's RATE).
     --quick  skip the per-trick ablation.
     --only   run the ablation for just these tricks.
     --lc=N   tables per player for the Last Call section (default: nights, at least 2000).
   The Last Call section plays LC tables for Mathy, the Reader and the Studied, with the gear's numbers, and
   counts how many Last Calls a Book takes before its split pages on the house are usable (STUDY_N sightings in
   each situation of each one's tell). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine() {
  const html = fs.readFileSync(process.env.BONES_HTML || path.resolve(__dirname, '..', 'index.html'), 'utf8');
  const a = html.indexOf('/* ==BONES:ENGINE:BEGIN== */'), b = html.indexOf('/* ==BONES:ENGINE:END== */');
  if (a < 0 || b < 0) throw new Error('engine markers not found in index.html');
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
  const last = v.table.history[v.table.history.length - 1], h = last.habit;
  if (HOUSE && HOUSE[b.id] && (know.tells || know.rates)) return believeHouse(c, b.id, last, know);
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

// ----- the house at Last Call, as a Book kept long enough would know it -----
// HOUSE[id] = { all: cell, by: { sit: cell } }, cell = { n, b, h: { '0'|'1'|'2'|'none': [bluffs, straights] } }.
let HOUSE = null;
const cell = () => ({ n: 0, b: 0, h: { 0: [0, 0], 1: [0, 0], 2: [0, 0], none: [0, 0] } });
// (On an engine from before the house's patterns, for a before-and-after run, the same model is kept unsplit.)
const HOUSE_IDS = ['npc_loretta', 'npc_curtis'];
const isHouse = id => SIM.PATTERN ? !!SIM.PATTERN[id] : HOUSE_IDS.includes(id);
function houseTrain(tables) {
  const H = {};
  const M = makeProxy({});
  const acc = {};
  for (let i = 0; i < tables; i++) {
    const S = E.newNight({ seed: 'house:' + i });
    S.hour = 4; S.cash = 1000;
    E.act(S, { t: 'sit', i: 0 });
    for (let g = 0; S.phase === 'table' && g < 5000; g++) {
      const v = E.view(S), L = E.legal(S);
      // The house's own calibration (as train() does for everyone): by the Count of the bid in front of you,
      // how often their bid is a bluff, and how often it is true when it is one and when it is not.
      if (L.need === 'turn' && v.table.bid && isHouse(v.table.bid.id)) {
        const T = S.table, bid = T.round.bids[T.round.bids.length - 1];
        let cnt = 0; T.seats.forEach(st => { if (!st.out) st.dice.forEach(d => { if (hitF(d, bid.f, true)) cnt++; }); });
        const a = acc[v.table.bid.id] = acc[v.table.bid.id] || Array.from({ length: NB }, () => ({ n: 0, b: 0, tb: 0, ts: 0 }));
        const x = a[bucketOf(E.count(S, bid.q, bid.f))];
        x.n++; if (bid.bluff) { x.b++; if (cnt >= bid.q) x.tb++; } else if (cnt >= bid.q) x.ts++;
      }
      const ev = E.act(S, M(S, v, L));
      ev.forEach(e => { if (e.t === 'readout') e.bids.forEach(x => {
        if (!isHouse(x.id)) return;
        const P0 = H[x.id] = H[x.id] || { all: cell(), by: {} }, sit = x.sit || 'all';
        for (const c of [P0.all, P0.by[sit] = P0.by[sit] || cell()]) { c.n++; if (x.bluff) c.b++; c.h[x.habit == null ? 'none' : x.habit][x.bluff ? 0 : 1]++; }
      }); });
    }
  }
  // Thin buckets lean on the population's calibration (CAL).
  for (const id in acc) H[id].cal = acc[id].map((x, k) => { const g = CAL[k], w = 4; return { pb: (x.b + g.pb * w) / (x.n + w), tb: (x.tb + g.tb * w) / (x.b + w), ts: (x.ts + g.ts * w) / (x.n - x.b + w) }; });
  HOUSE = H;
  return H;
}
// The bid in front, from the house: the calibrated prior, their bluff rate and the habit shown (or none), pooled
// (the unstudied Reader) or in the bid's situation (the Studied).
function believeHouse(c, id, last, know) {
  const H = HOUSE[id], cl = (know.study && last.sit && H.by[last.sit]) || H.all;
  // Their own calibration already knows their overall rate; the Studied also knows it by situation.
  const cal = (H.cal || CAL)[bucketOf(c)];
  let o = odds(clamp(cal.pb, 0.01, 0.99));
  if (know.rates && know.study) o *= odds(clamp((cl.b + 0.2) / (cl.n + 1), 0.005, 0.95)) / odds(clamp(H.all.b / H.all.n, 0.005, 0.95));
  if (know.tells) {
    const k = last.habit ? last.habit.i : 'none', x = cl.h[k];
    const pb = (x[0] + 0.5) / (cl.b + 1), ps = (x[1] + 0.5) / (cl.n - cl.b + 1);
    o *= pb / ps;
  }
  const post = o / (1 + o);
  return post * cal.tb + (1 - post) * cal.ts;
}

const SIXES = ['loaded', 'slowroll', 'palm'], HOLD_JUMP = 0.75, SNAKE_K = 0, DBL_AT = 0.12, DBL_TELL_AT = 0.25;
const BLUFF_SHARE = 0.5; // the Bluffer's share of deliberate bluffs
const PM_SHARE = 0.4, WARM = 6; // the Predictable's and the Mixer's share of deliberate bluffs; nights of warm Book
// The shape of a bid after prev, as the engine scores it (open low/high, face/step/jump, stay/switch).
const shapeKey = (prev, q, f) => !prev ? 'open' : (q - prev.q <= 0 ? 'face' : q - prev.q === 1 ? 'step' : 'jump') + '/' + (f === prev.f ? 'stay' : 'switch');
const ORDER = ['shaved', 'barmirror', 'extrabone', 'lastword', 'double', 'rabbit', 'honest', 'mirror', 'housemoney', 'loaded', 'hothand', 'close', 'cornered', 'nod', 'sticky', 'palm', 'snake', 'sidebet', 'slowroll', 'pokerface', 'tab', 'friends', 'glasses', 'ledger'];
function bestFace(mine, faces, wild, loaded) {
  let best = faces[faces.length - 1], bc = -1;
  for (const f of faces) { const c = mine.filter(d => hitF(d, f, wild)).length + (f === 6 && loaded && loaded.length ? 1 : 0); if (c >= bc) { bc = c; best = f; } }
  return { f: best, c: bc };
}

// A Reader knows each person's tell: is the habit that came with the bid in front of it that person's tell,
// and does that tell say "bluff"? (true: the tell shows a bluff; false: shows a straight bid; null: no tell).
function tellSays(v) {
  const b = v.table.bid, h = b && v.table.history.length ? v.table.history[v.table.history.length - 1].habit : null;
  if (!b || b.id === 'me' || !h) return null;
  const per = SIM.person(b.id);
  if (h.i !== per.tell) return null;
  return per.kind === 'bluff';
}
// How a bid looks from outside (no cup seen): P(at least q of f among `total` fair dice).
const lookOf = (total, q, f, wild) => SIM.tail(total, q, wild ? 1 / 3 : 1 / 6);

function makeProxy(opts) {
  const know = opts.know || null, buys = !!opts.buy, thr = opts.thr || 0.38, likeP = opts.like || 0.5, cmp = opts.cmp || 0, openP = opts.open || 0.5, jumpAt = opts.jump || 0.6;
  // bluff: a share (0..1) of its bids that are deliberate, sensible bluffs (the Bluffer).
  const bluffShare = opts.bluff || 0;
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
        const friends = S.tricks.some(x => x.id === 'friends');
        const top = friends && opts.friendsTop ? opts.friendsTop : (opts.buyTop || 16);
        const cands = sv.offers.filter(x => x && S.cash >= x.price && S.cash - x.price >= reserve && ORDER.indexOf(x.id) < top).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
        if (cands.length && S.tricks.length < 5) return { t: 'buy', i: cands[0].i };
        // Friends Rates has done its job once the slots are full: sell it to make room for a trick it wants.
        if (friends && cands.length && S.tricks.length >= 5 && opts.friendsSell !== false) return { t: 'sell', id: 'friends' };
        // With Friends Rates, a look at four more when nothing on offer is worth it (once a visit).
        if (friends && opts.friendsReroll && !cands.length && S.tricks.length < 5 && !S.shop.rerolls && S.cash - sv.rerollPrice >= reserve + 30) return { t: 'reroll' };
      }
      return { t: 'leave' };
    }
    const t = v.table;
    if (L.need === 'next') return { t: 'next' };
    const held = id => v.tricks.some(x => x.id === id && !x.asleep);
    // Side Bet: back whoever it thinks is right (a Reader weighs the bidder's tell); with a stake, only when sure enough.
    if (L.need === 'side') {
      const sb = t.side;
      const pTrue = sb.kind === 'liar' ? believe(S, v, know) : 1 - sb.exact;
      const right = Math.max(pTrue, 1 - pTrue), stake = sb.pays ? sb.stake / sb.pays : 0;
      if (right * (1 + stake) - stake <= 0.02 && stake) return { t: 'side' };
      return { t: 'side', pick: pTrue >= 0.5 ? 'bidder' : 'caller' };
    }
    const mine = t.myDice || [];
    // Slow Roll: the one tap (keep the best face, re-roll the rest) while that re-rolls anything.
    if (L.uses.includes('slowroll') && mine.length) {
      const f = bestFace(mine, t.faces, t.wild, t.myLoaded).f, pinned = (t.myFixed || []).concat(t.myLoaded || []);
      if (mine.some((d, i) => !hitF(d, f, t.wild) && !pinned.includes(i))) return { t: 'use', id: 'slowroll', keep: 'best' };
    }
    if (L.need === 'ready') return { t: 'go' };

    const b = t.bid;
    // Palm, at its first decision of a round: a die that does not show its best face turns to it.
    if (L.uses.includes('palm') && mine.length && !t.history.some(x => x.who === 0)) {
      const f = bestFace(mine, t.faces.filter(x => x > 1), t.wild, t.myLoaded).f;
      const k = mine.findIndex((d, i) => !hitF(d, f, t.wild) && !(t.myLoaded || []).includes(i));
      if (k >= 0) return { t: 'use', id: 'palm', die: k, face: f };
    }
    // A holder plays to the trick: Double or Nothing only on a call it is sure of (by the
    // Count; a Reader also wants the bidder's tell saying bluff), Poker Face makes a bluff cheaper.
    const bluffPct = held('pokerface') && !bluffShare ? 15 : 5;
    // A cup a trick made stronger than it looks (Loaded Six, Slow Roll, Palm): bid what it is sure of, not
    // what is merely likely; the people do not know the cup is better than it looks.
    const jumpNow = SIXES.some(held) ? (opts.holdJump || HOLD_JUMP) : jumpAt;
    if (b) {
      const pc = believe(S, v, know);
      if (L.uses.includes('nod') && pc > 0.3 && pc < 0.6) return { t: 'use', id: 'nod' };
      // Snake Eyes: a won challenge pays an ante more for every 1 in its cup, so it calls a little sooner.
      const ones = held('snake') ? mine.filter(d => d === 1).length : 0;
      if (pc < thr + (opts.snakeK == null ? SNAKE_K : opts.snakeK) * ones) {
        // Sure: the Count under 12% (a Reader: its own read, the Count weighed by the bidder's rate and the
        // habit shown, under 12%, or under 25% with the bidder's tell showing a bluff).
        const at = opts.dblAt || DBL_AT, tellAt = opts.dblTellAt == null ? DBL_TELL_AT : opts.dblTellAt;
        const sure = opts.dblAll || pc < at || (!!know && !!know.tells && tellSays(v) === true && pc < tellAt);
        // Only while it has calls for 2 left at this table (L.canDouble; an engine without the limit lacks it).
        return held('double') && L.canDouble !== false && sure ? { t: 'liar', double: true } : { t: 'liar' };
      }
      if (E.countExact(S, b.q, b.f) > 0.42 && pc < 0.75) return { t: 'spot' };
    }
    // The Bluffer: a share of its bids are lies that look true from outside: a face it holds
    // none of, at a count the table would believe at face value (P >= 50% for anyone), and a
    // bluff by its own cup (the Count under 40%). Opening, and raising by at most one.
    if (bluffShare && L.canBid && b && opts.bluffShape && (S.rng >>> 0) % 1000 < bluffShare * 1000) {
      // The Predictable and the Mixer lie at the same moments: when a step of one on the last bid's face would be a
      // bluff its own cup puts at 10% to 40%. The Predictable tells that lie; the Mixer tells a lie of a shape picked
      // at random (a step or a jump, the face kept or switched, or the same count on a higher face).
      const lies = [];
      for (let q = L.minBid.q; q <= Math.min(L.maxQ, b.q + 2); q++) for (const f of L.faces) {
        if (!E.isLegalBid(S, q, f)) continue;
        const c = E.count(S, q, f);
        if (c < 0.4 && c >= 0.1) lies.push({ q, f, c, sh: shapeKey(b, q, f) });
      }
      const fixed = lies.find(x => x.sh === 'step/stay');
      if (fixed) {
        if (opts.bluffShape === 'fixed') return { t: 'bid', q: fixed.q, f: fixed.f };
        // (as believable by its own cup as the Predictable's lie, near enough, so only the shape differs)
        const good = lies.filter(x => x.c >= fixed.c - 0.05);
        const kinds = [...new Set(good.map(x => x.sh))], k = kinds[((S.rng >>> 0) >>> 12) % kinds.length], of = good.filter(x => x.sh === k);
        const lie = of[((S.rng >>> 0) >>> 20) % of.length];
        return { t: 'bid', q: lie.q, f: lie.f };
      }
    }
    if (bluffShare && L.canBid && !opts.bluffShape && (S.rng >>> 0) % 1000 < bluffShare * 1000) {
      let lie = null;
      for (let q = L.minBid.q; q <= Math.min(L.maxQ, L.minBid.q + 1); q++) for (const f of L.faces) {
        if (!E.isLegalBid(S, q, f) || mine.some(d => hitF(d, f, t.wild))) continue;
        const c = E.count(S, q, f), lk = lookOf(t.total, q, f, t.wild);
        if (c < 0.4 && c >= (opts.bluffMin == null ? 0.2 : opts.bluffMin) && lk >= 0.5 && (!lie || lk > lie.lk)) lie = { q, f, lk };
      }
      if (lie) return { t: 'bid', q: lie.q, f: lie.f };
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
        for (let k = 1; k <= L.maxFor[f]; k++) { if (E.count(S, k, f) >= jumpNow) q = k; else break; }
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
        const f = b && b.f > 1 ? b.f : bestFace(mine, t.faces.filter(x => x > 1), t.wild, t.myLoaded).f;
        const k = mine.findIndex((d, i) => !hitF(d, f, t.wild) && !(t.myLoaded || []).includes(i));
        if (k >= 0) return { t: 'use', id: 'palm', die: k, face: f };
      }
      const bluffNow = (S.rng >>> 0) % 100 < bluffPct;
      // Compare: when the bid in front is likelier false than its best raise is true, call.
      if (cmp && b && pick && 1 - believe(S, v, know) > countR(pick.q, pick.f) + cmp) return { t: 'liar' };
      // The Predictable keeps its lie's shape for its lies (and its forced raises too).
      if (pick && b && opts.bluffShape === 'fixed' && shapeKey(b, pick.q, pick.f) === 'step/stay') pick = honestAlt(pick);
      if (pick && !bluffNow) return { t: 'bid', q: pick.q, f: pick.f };
      if (L.mustBid || bluffNow || (b && believe(S, v, know) >= 0.5)) return { t: 'bid', q: (opts.bluffShape === 'fixed' && b ? honestAlt(L.minBid) : L.minBid).q, f: (opts.bluffShape === 'fixed' && b ? honestAlt(L.minBid) : L.minBid).f };
    }
    return { t: 'liar' };
    // The Predictable's honest raise that would look like its lie, made another way: the likeliest other raise it
    // believes as much (or nearly).
    function honestAlt(pick) {
      if (shapeKey(b, pick.q, pick.f) !== 'step/stay') return pick;
      let alt = null;
      for (let q = L.minBid.q; q <= Math.min(L.maxQ, b.q + 2); q++) for (const f of L.faces) {
        if (!E.isLegalBid(S, q, f) || shapeKey(b, q, f) === 'step/stay') continue;
        const c = E.count(S, q, f);
        if (c >= Math.min(likeP, E.count(S, pick.q, pick.f) - 0.1) && (!alt || c > alt.c)) alt = { q, f, c };
      }
      return alt || pick;
    }
  };
}

// ----- measuring -----
let RATES = {};
function measure(name, policy, nights, opts) {
  opts = opts || {};
  const r = { name, nights, end: { house: 0, cleaned: 0, walked: 0, bust: 0 }, cash: [], lc500: 0, tables: {}, rounds: [], bids: {}, reads: 0, told: 0 };
  let book = null;
  for (let i = 0; i < nights; i++) {
    const seed = (opts.seedBase || 'sim') + ':' + i;
    // carry: the Book carried from night to night (the room remembers you), in runs of `carry` nights.
    if (opts.carry && i % opts.carry === 0) book = null;
    const { S, events } = E.playNight(seed, policy, { tricks: opts.tricks, keepEvents: !!opts.rates || !!opts.carry, book: opts.carry ? book : undefined });
    if (opts.carry) book = E.bookApply(book, events);
    r.reads += S.you && S.you.fired ? S.you.fired.length : 0;
    if (E.summary(S).tell && E.summary(S).tell.shape) r.told++;
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
function tableRate(policy, h, kind, n, tricks, book) {
  let w = 0;
  const rounds = [];
  for (let i = 0; i < n; i++) {
    const S = E.newNight({ seed: 'tbl:' + h + kind + ':' + i, tricks, book });
    S.hour = h; S.cash = h === 4 ? 1000 : 1e6;
    E.act(S, { t: 'sit', i: kind === 'rich' ? 1 : 0 });
    for (let g = 0; S.phase === 'table'; g++) { if (g > 5000) throw new Error('table stuck'); const ev = E.act(S, policy(S, E.view(S), E.legal(S))); if (ev[0].t === 'error') throw new Error(ev[0].msg); }
    const t = S.log[S.log.length - 1];
    if (t.won) w++;
    rounds.push(t.rounds);
  }
  return { w: w / n, rounds };
}
// A Book with WARM nights of a proxy's own play in it: the room has notes on how it bids.
function warmBook(policy, nights, base) {
  let book = null;
  for (let i = 0; i < nights; i++) { const { events } = E.playNight((base || 'warm') + ':' + i, policy, { book, keepEvents: true }); book = E.bookApply(book, events); }
  return book;
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
  houseTrain(Math.max(1500, nights));
  const STUDY = { rates: true, tells: true, study: true };
  const runs = [
    measure('Mathy', makeProxy({}), nights),
    measure('Mathy+buy', makeProxy({ buy: true }), nights),
    measure('Reader', makeProxy({ know: { rates: true, tells: true } }), nights),
    measure('Reader-no-tells', makeProxy({ know: { rates: true } }), nights),
    measure('Reader+buy', makeProxy({ know: { rates: true, tells: true }, buy: true }), nights),
    measure('Studied', makeProxy({ know: STUDY }), nights),
    measure('Studied+buy', makeProxy({ know: STUDY, buy: true }), nights),
    measure('Predictable', makeProxy({ bluff: PM_SHARE, bluffShape: 'fixed' }), nights),
    measure('Mixer', makeProxy({ bluff: PM_SHARE, bluffShape: 'mix' }), nights),
    measure('Pred, Book kept', makeProxy({ bluff: PM_SHARE, bluffShape: 'fixed' }), nights, { carry: 5 }),
    measure('Mixer, Book kept', makeProxy({ bluff: PM_SHARE, bluffShape: 'mix' }), nights, { carry: 5 })
  ];
  console.log(`Bones balance sim · ${nights} nights per player · engine ${E.VERSION}`);
  const nt = Math.max(300, Math.floor(nights / 2));
  const pred = makeProxy({ bluff: PM_SHARE, bluffShape: 'fixed' }), mix = makeProxy({ bluff: PM_SHARE, bluffShape: 'mix' });
  const predBook = warmBook(pred, WARM, 'warm-pred'), mixBook = warmBook(mix, WARM, 'warm-mix');
  const tp = [['Mathy', makeProxy({})], ['Reader', makeProxy({ know: { rates: true, tells: true } })], ['Rdr-no-tells', makeProxy({ know: { rates: true } })], ['Predictable', pred, predBook], ['Mixer', mix, mixBook]];
  console.log(`\nTable win rate, no tricks (${nt} tables each, played on their own; the Predictable and the Mixer with ${WARM} nights of their own play in the Book)`);
  console.log(pad('', 16) + tp.map(x => padL(x[0], 13)).join('') + padL('Rdr-Mathy', 11) + padL('tells add', 11) + padL('Pred-Mix', 10) + padL('rounds', 8));
  const allRounds = [], four = [];
  for (const [h, kind] of TABLES) {
    const rs = tp.map(([, pol, book]) => tableRate(pol, h, kind, nt, undefined, book));
    allRounds.push(...rs[0].rounds);
    if (h >= 1 && h <= 3 && kind === 'rich') four.push(...rs[0].rounds);
    const sg = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(1);
    console.log(pad(E.HOURS[h].name + ' ' + kind, 16) + rs.map(r => padL(pct(r.w, 1), 13)).join('') + padL(sg(rs[1].w - rs[0].w), 11) + padL(sg(rs[1].w - rs[2].w), 11) + padL(sg(rs[3].w - rs[4].w), 10) + padL(median(rs[0].rounds), 8));
  }
  console.log('median rounds per table (Mathy): ' + median(allRounds) + ' · four-seat tables: ' + median(four));
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
  row('reads / night', r => (r.reads / r.nights).toFixed(2));
  row('nights w/ tell', r => pct(r.told, r.nights));
  if (!quick) {
    const n2 = Math.max(200, Math.floor(nights / 2));
    const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
    const meanOf = r => r.cash.reduce((a, b) => a + b, 0) / r.nights;
    const READER = { rates: true, tells: true };
    // Each proxy, without tricks, buying and not: the bases the lifts are measured against.
    const bases = {};
    const baseOf = (name, o) => bases[name] = bases[name] || measure(name, makeProxy(o), n2, { seedBase: 'abl' });
    console.log(`\nPer-trick lift: the proxy holding only that trick from the start, using it as a holder would (${n2} nights each)`);
    console.log(pad('trick', 20) + padL('Mathy', 9) + padL('lift', 7) + padL('mean $', 9) + padL('Reader', 9) + padL('lift', 7) + padL('mean $', 9) + '   other');
    const sg = x => (x >= 0 ? '+' : '') + x;
    for (const t of E.TRICKS) {
      if (only.length && !only.includes(t.id)) continue;
      // Friends Rates and A Tab only do anything for a buyer / someone short: compare buyers.
      const buyer = t.id === 'friends' || t.id === 'tab';
      const mk = t.id === 'ledger' ? { ledger: true } : t.id === 'glasses' ? { glasses: true } : null;
      const cols = [['Mathy', mk], ['Reader', READER]].map(([name, know]) => {
        const base = baseOf(name + (buyer ? '+buy' : ''), { know: name === 'Mathy' ? null : READER, buy: buyer });
        const r = measure(t.id, makeProxy({ know, buy: buyer }), n2, { tricks: [t.id], seedBase: 'abl' });
        const dh = 100 * (r.end.house - base.end.house) / n2, dm = meanOf(r) - meanOf(base);
        return padL(pct(r.end.house, n2), 9) + padL(sg(+dh.toFixed(1)), 7) + padL(sg(Math.round(dm)), 9);
      });
      let other = '';
      // Poker Face pays a player who bluffs: the Bluffer (Mathy that tells a sensible lie on a share of its bids).
      if (t.id === 'pokerface') {
        const base = baseOf('Bluffer', { bluff: BLUFF_SHARE });
        const r = measure(t.id, makeProxy({ bluff: BLUFF_SHARE }), n2, { tricks: [t.id], seedBase: 'abl' });
        other = `Bluffer ${pct(base.end.house, n2)} -> ${pct(r.end.house, n2)} (${sg(+(100 * (r.end.house - base.end.house) / n2).toFixed(1))}, mean ${sg(Math.round(meanOf(r) - meanOf(base)))})`;
      }
      // Double or Nothing, always pressed: the call for 2 on every Liar call while any are left at the table.
      if (t.id === 'double') {
        other = [['Mathy', null], ['Reader', READER]].map(([name, know]) => {
          const base = baseOf(name, { know });
          const r = measure(t.id, makeProxy({ know, dblAll: true }), n2, { tricks: [t.id], seedBase: 'abl' });
          return `${name} always-press ${pct(r.end.house, n2)} (${sg(+(100 * (r.end.house - base.end.house) / n2).toFixed(1))}, mean ${sg(Math.round(meanOf(r) - meanOf(base)))})`;
        }).join(' · ');
      }
      console.log(pad(t.name + (buyer ? ' *' : ''), 20) + cols.join('') + '   ' + other);
    }
    console.log('  lift: points of house-beating rate; mean $: change in mean cash at the end of the night');
    console.log('  * measured on the trick buyer (proxy+buy) against proxy+buy without it');
  }
  if (args.includes('--rates')) {
    console.log('\nMeasured bluff rates (share of bids that were bluffs):');
    console.log(JSON.stringify(Object.keys(RATES).sort().reduce((o, id) => { o[id] = Math.round(RATES[id] * 100) / 100; return o; }, {})));
  }
  lastCall(args, nights);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
// ----- Last Call as a boss fight: the three readers, the gear, and how long the study takes -----
const STUDY_N = 5;
function lastCall(args, nights) {
  const n = +((args.find(a => a.startsWith('--lc=')) || '').slice(5)) || Math.max(2000, nights);
  if (!HOUSE) houseTrain(Math.max(1500, nights));
  const before = !SIM.PATTERN;
  const se = p => (100 * Math.sqrt(p * (1 - p) / n)).toFixed(1);
  console.log(`\nLast Call (${n} tables each; ± one standard error)`);
  const rows = [['Mathy', makeProxy({})], ['Reader (unstudied)', makeProxy({ know: { rates: true, tells: true } })], ['Studied', makeProxy({ know: { rates: true, tells: true, study: true } })]].slice(0, before ? 2 : 3);
  const res = rows.map(([name, pol]) => { const r = tableRate(pol, 4, 'last', n); console.log(pad(name, 22) + padL(pct(r.w, 1), 8) + ' ± ' + se(r.w) + padL('median rounds ' + median(r.rounds), 20)); return r.w; });
  if (before) return;
  console.log(`  Studied - Mathy: ${(100 * (res[2] - res[0])).toFixed(1)} points · Reader - Mathy: ${(100 * (res[1] - res[0])).toFixed(1)} points`);
  // The house's numbers by situation (from the training pass): bluff rate, and how often the tell shows on a bluff and on a straight bid.
  for (const id in HOUSE) {
    const per = SIM.person(id), H = HOUSE[id];
    const line = (name, c) => `${name} ${c.n} bids, bluff ${pct(c.b, c.n)}, tell on bluffs ${pct(c.h[per.tell][0], c.b)} / on straight ${pct(c.h[per.tell][1], c.n - c.b)}`;
    console.log('  ' + per.name + ': ' + [line('all', H.all)].concat(Object.keys(H.by).map(k => line(k, H.by[k]))).join(' · '));
  }
  // The study: a Book carried from one Last Call to the next (the player at the table plays by the Count). Usable once
  // each situation of each one's tell has STUDY_N sightings; readable once, too, its two cells point the right way by 40 points.
  const players = 300, need = [], read = [], need4 = [];
  for (let p = 0; p < players; p++) {
    let book = null, u = 0, r = 0, u4 = 0;
    for (let k = 1; k <= 20 && (!u || !r); k++) {
      const S = E.newNight({ seed: 'study:' + p + ':' + k, book });
      S.hour = 4; S.cash = 1000;
      const ev = E.act(S, { t: 'sit', i: 0 });
      const M = makeProxy({});
      while (S.phase === 'table') ev.push(...E.act(S, M(S, E.view(S), E.legal(S))));
      book = E.bookApply(book, ev);
      const cells = HOUSE_IDS.map(id => E.bookPage(book, id).rows[SIM.person(id).tell].split);
      if (!u && cells.every(cs => cs.every(c => c.n >= STUDY_N))) u = k;
      if (!u4 && cells.every(cs => cs.every(c => c.n >= STUDY_N - 1))) u4 = k;
      const rate = c => c.bluff / Math.max(1, c.n);
      if (!r && cells.every(cs => cs.every(c => c.n >= STUDY_N) && Math.abs(rate(cs[0]) - rate(cs[1])) >= 0.4)) r = k;
    }
    need.push(u || 21); read.push(r || 21); need4.push(u4 || 21);
  }
  const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
  console.log(`  The study, 4 sightings a situation: usable after ${q(need4, 0.5)} Last Calls (quartiles ${q(need4, 0.25)}-${q(need4, 0.75)})`);
  console.log(`  The study (${players} players, a Book carried from one Last Call to the next): usable (${STUDY_N} sightings in each situation of both tells) after ${q(need, 0.5)} Last Calls (quartiles ${q(need, 0.25)}-${q(need, 0.75)}); pointing the right way by 40 points after ${q(read, 0.5)} (${q(read, 0.25)}-${q(read, 0.75)})`);
}
if (require.main === module) main();
module.exports = { loadEngine, makeProxy, measure, train, houseTrain, lastCall, tableRate, TABLES, believe, getRates: () => RATES, setRates: r => { RATES = r; } };
