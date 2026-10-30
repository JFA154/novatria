'use strict';
/* Engine: Rng, Dice, Tables, State.apply validation, snapshots, time, Town,
   loose ends, Style, Api request shape. Data-driven (reads Game.data and
   Game.state) so it keeps passing once real content replaces the placeholders. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { suite, quickStart, legacyTown, stateJson, ROOT } = require('./helpers.cjs');

const s = suite('state');

/* Reference mulberry32, written the usual iterative way. */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

s.test('Rng is deterministic from a seed and survives a save/load', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const a = Game.Rng.create(42), b = Game.Rng.create(42), c = Game.Rng.create(43);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    const seqC = Array.from({ length: 20 }, () => c.next());
    const g = Game.Rng.create(7);
    const ints = Array.from({ length: 3000 }, () => g.int(1, 6));
    const resumed = Game.Rng.create(42, 10);
    return { seqA, seqB, seqC, min: Math.min(...ints), max: Math.max(...ints), resumed: Array.from({ length: 10 }, () => resumed.next()) };
  });
  assert.deepEqual(r.seqA, r.seqB);
  assert.notDeepEqual(r.seqA, r.seqC);
  const ref = mulberry32(42);
  assert.deepEqual(r.seqA, Array.from({ length: 20 }, () => ref()), 'matches reference mulberry32');
  assert.ok(r.seqA.every(v => v >= 0 && v < 1));
  assert.equal(r.min, 1);
  assert.equal(r.max, 6);
  assert.deepEqual(r.resumed, r.seqA.slice(10), 'a generator resumed at call 10 continues the stream');

  // The state-bound stream continues exactly across a JSON round trip.
  await quickStart(page, { seed: 99 });
  const out = await page.evaluate(() => {
    const G = Game;
    const json = JSON.stringify(G.state);
    const straight = Array.from({ length: 8 }, () => G.Rng.int(1, 1000000));
    G.State.load(JSON.parse(json), G.town);
    const again = Array.from({ length: 8 }, () => G.Rng.int(1, 1000000));
    return { straight, again, calls: G.state.meta.rngCalls };
  });
  assert.deepEqual(out.again, out.straight);
  // Same seed and character give the same world.
  const w1 = await page.evaluate(() => { const s = JSON.parse(JSON.stringify(Game.state)); return s; });
  const page2 = await h.open();
  await quickStart(page2, { seed: 99 });
  const w2 = JSON.parse(await stateJson(page2));
  for (const st of [w1, w2]) { delete st.meta.createdAt; }
  // w1 has advanced its rng above; compare the parts creation produced.
  assert.deepEqual(w2.npcs, w1.npcs);
  assert.deepEqual(w2.seeds, w1.seeds);
  assert.deepEqual(w2.flags, w1.flags);
});

s.test('Dice: targets, tiers (natural 20, success, partial, failure, natural 1), modifier cap', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const D = Game.Dice;
    const roll = (d20, statValue, difficulty, modifiers) => D.resolve({ stat: 'wits', d20, statValue, difficulty, modifiers: modifiers || [], state: null, complication: 'someone saw you' });
    return {
      targets: D.TARGETS,
      nat20: roll(20, -1, 'very_hard', [{ value: -4 }]),
      exact: roll(12, 0, 'normal'),
      over: roll(15, 2, 'hard'),
      partial1: roll(11, 0, 'normal'),
      partial3: roll(9, 0, 'normal'),
      failure: roll(8, 0, 'normal'),
      nat1: roll(1, 3, 'easy', [{ value: 4 }]),
      capUp: roll(10, 0, 'normal', [{ value: 2 }, { value: 2 }, { value: 2 }]),
      capDown: roll(10, 0, 'normal', [{ value: -2 }, { value: -2 }, { value: -1 }]),
      capFn: [D.capModifier(9), D.capModifier(-9), D.capModifier(3)],
      spec1: roll(14, 1, 'hard', [{ value: 1 }]).line,
      spec2: D.resolve({ stat: 'stealth', d20: 9, statValue: 0, difficulty: 'hard', modifiers: [], state: null, complication: 'someone saw you' }),
      neg: D.resolve({ stat: 'might', d20: 10, statValue: -1, difficulty: 'normal', modifiers: [], state: null, complication: 'it breaks' }).line,
      lockFail: D.lockFor({ tier: 'failure' }, 'k'), lockCrit: D.lockFor({ tier: 'critical_failure' }, 'k'),
      lockOk: D.lockFor({ tier: 'success' }, 'k'), lockPartial: D.lockFor({ tier: 'partial' }, 'k'), lockNone: D.lockFor(null, 'k'),
      outcomes: ['critical', 'success', 'partial', 'failure', 'critical_failure'].map(D.outcomeOf),
      // What an ask asks for (direction change 13): names, filler and the verbs of asking left out, plurals folded.
      words: [
        D.askWords('I persuade Lyman Coker to put in a good word for me', ['Lyman Coker']),
        D.askWords('Lyman, please put in a good word for me with Pittman\'s boss!', ['Lyman Coker']),
        D.askWords('Please?'),
        D.askWords('/zoom I ask him to lend me twenty dollars until Friday'.replace(/^\/\S+\s*/, ''))
      ],
      same: [
        D.sameAsk(['good', 'put', 'word'], ['good', 'put', 'word']),
        D.sameAsk(['good', 'put', 'word'], ['boss', 'good', 'pittman', 'put', 'word']),
        D.sameAsk(['good', 'put', 'word'], []),
        D.sameAsk(['good', 'put', 'word'], ['dollar', 'friday', 'lend', 'twenty']),
        D.sameAsk(['back', 'door', 'lock', 'pick'], ['front', 'gate', 'lock', 'pick']),
        D.sameAsk(['back', 'door', 'lock', 'pick'], ['back', 'door', 'lock', 'pick', 'quietly']),
        D.sameAsk([], ['job'])
      ]
    };
  });
  assert.deepEqual(r.targets, { easy: 8, normal: 12, hard: 15, very_hard: 18 });
  assert.equal(r.nat20.tier, 'critical');
  assert.equal(r.nat20.complication, null);
  assert.equal(r.exact.tier, 'success', 'total equal to the target succeeds');
  assert.equal(r.over.tier, 'success');
  assert.equal(r.over.complication, null);
  assert.equal(r.partial1.tier, 'partial');
  assert.equal(r.partial3.tier, 'partial', 'three below is still partial');
  assert.equal(r.partial3.complication, 'someone saw you');
  assert.equal(r.failure.tier, 'failure', 'four below fails');
  assert.ok(r.failure.complication);
  assert.equal(r.nat1.tier, 'critical_failure', 'natural 1 fails even when the total beats the target');
  assert.equal(r.capUp.modifier, 4);
  assert.equal(r.capUp.total, 14);
  assert.equal(r.capDown.modifier, -4);
  assert.deepEqual(r.capFn, [4, -4, 3]);
  assert.equal(r.spec1, 'Wits 14 + 2 = 16 vs 15 · Success');
  assert.equal(r.spec2.line, 'Stealth 9 vs 15 · Failure');
  assert.equal(r.spec2.packetLine, 'Stealth 9 vs 15 · Failure · Complication: someone saw you');
  assert.equal(r.neg, 'Might 10 − 1 = 9 vs 12 · Partial');
  // Every outcome locks (direction change 13; a success or partial no longer clears the lock).
  assert.equal(r.lockFail, 'k');
  assert.equal(r.lockCrit, 'k');
  assert.equal(r.lockOk, 'k');
  assert.equal(r.lockPartial, 'k');
  assert.equal(r.lockNone, null, 'no roll, no lock');
  assert.deepEqual(r.outcomes, ['granted', 'granted', 'granted', 'failed', 'failed']);
  assert.deepEqual(r.words, [['good', 'put', 'word'], ['boss', 'good', 'pittman', 'put', 'word'], [], ['dollar', 'friday', 'lend', 'twenty']]);
  assert.deepEqual(r.same, [true, true, true, false, false, true, false], 'the same ask: 60% of the shorter one\'s words, or nothing new asked');
});

s.test('the retry lock\'s record goes with its key: lastRoll must name the current key, a new or cleared key drops it, the model cannot write it, a bad one is refused, and a load drops one that is not the lock\'s', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const D = G.Dice;
    const meta = () => ({ key: G.state.meta.lastRollKey, rec: G.state.meta.lastRoll });
    const ok = { tier: 'success', line: 'Charm 15 + 1 = 16 vs 12 · Success' };
    const out = { fresh: meta() };
    const rec = D.lockRecord(ok, 'k1', ['put', 'word'], null);
    out.rec = rec;
    S.apply({ lastRollKey: 'k1', lastRoll: rec });
    out.set = meta();
    out.state = [D.lockState(), D.lockedOutcome('k1'), D.lockedOutcome('k2'), D.grantedAsk('k1', ['put', 'word', 'good']), D.grantedAsk('k1', ['lend', 'truck'])];
    out.wrongKey = S.apply({ lastRoll: D.lockRecord(ok, 'k2', [], null) }).rejected.map(x => x.path);
    out.bad = S.apply({ lastRoll: { key: 'k1', outcome: 'maybe' } }).rejected.map(x => x.path);
    out.model = S.apply({ lastRoll: null }, { source: 'model' }).rejected.map(x => x.reason);
    out.kept = meta();
    S.apply({ lastRollKey: 'k2' });
    out.newKey = meta();
    out.oldSave = D.lockedOutcome('k2');
    S.apply({ lastRollKey: null });
    out.cleared = meta();
    // A load keeps the record only with its own key.
    const env = G.Storage.envelope('x');
    env.state.meta.lastRollKey = 'k3';
    env.state.meta.lastRoll = D.lockRecord(ok, 'k4', [], null);
    S.load(env.state, env.town);
    out.loadedOther = meta();
    env.state.meta.lastRoll = D.lockRecord(ok, 'k3', ['job'], null);
    S.load(env.state, env.town);
    out.loadedOwn = meta();
    return out;
  });
  assert.deepEqual(r.fresh, { key: null, rec: null }, 'a new game starts with no lock and no record');
  assert.deepEqual(r.rec, { key: 'k1', outcome: 'granted', line: 'Charm 15 + 1 = 16 vs 12 · Success', granted: [{ key: 'k1', words: ['put', 'word'], line: 'Charm 15 + 1 = 16 vs 12 · Success' }] });
  assert.deepEqual(r.set, { key: 'k1', rec: r.rec });
  assert.deepEqual(r.state, [r.rec, 'granted', null, r.rec.granted[0], null]);
  assert.deepEqual(r.wrongKey, ['lastRoll'], 'a record for another key is refused');
  assert.deepEqual(r.bad, ['lastRoll'], 'a malformed record is refused');
  assert.deepEqual(r.model, ['not allowed from the model']);
  assert.deepEqual(r.kept, r.set, 'refusals change nothing');
  assert.deepEqual(r.newKey, { key: 'k2', rec: null }, 'a new key alone drops the record');
  assert.equal(r.oldSave, 'failed', 'a lock with no record (an older save\'s) reads as a failure');
  assert.deepEqual(r.cleared, { key: null, rec: null });
  assert.deepEqual(r.loadedOther, { key: 'k3', rec: null });
  assert.equal(r.loadedOwn.rec.key, 'k3');
  assert.deepEqual(r.loadedOwn.rec.granted.map(g => g.words), [['job']]);
});

s.test('Dice applies item, attitude and condition modifiers from state', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const item = G.state.player.inventory[0].id;
    const npc = G.state.npcs.find(n => n.knownToPlayer).id;
    G.State.apply({ effects: [{ op: 'attitudeDelta', npcId: npc, delta: 80 }], conditionsAdded: [{ name: 'Cut arm', effect: '-1 charm', untilDay: 4 }] });
    const mods = G.Dice.modifiersFor(G.state, { stat: 'charm', usesItemId: item, npcId: npc, actionType: 'persuade' });
    const notHeld = G.Dice.modifiersFor(G.state, { stat: 'might', usesItemId: 'item_not_held' });
    return { mods: mods.map(m => m.value), notHeld: notHeld.length };
  });
  assert.deepEqual(r.mods, [2, 2, -1]);
  assert.equal(r.notHeld, 0);
});

s.test('the retry lock refuses the identical failed roll until the situation changes', async h => {
  const page = await h.open();
  await quickStart(page);
  const text = 'I try to pick the lock on the warehouse';
  await page.evaluate(async t => {
    const G = Game;
    const action = G.Pipeline.normaliseParse(await G.Api.parse(G.Pipeline.parsePacket(t)));
    G.State.apply({ lastRollKey: G.Dice.lockKey(action) });
  }, text);
  const before = await stateJson(page);
  const res = await page.evaluate(t => Game.Pipeline.submit(t), text);
  assert.equal(res.reason, 'retry-locked');
  assert.equal(await stateJson(page), before, 'a refused retry changes nothing');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /Change something first/);
  await page.evaluate(() => Game.State.apply({ advanceTime: 'long' }));
  const res2 = await page.evaluate(t => Game.Pipeline.submit(t), text);
  assert.equal(res2.ok, true, 'allowed once time has passed');
});

s.test('State.apply rejects unknown ids and leaves state untouched', async h => {
  const page = await h.open();
  await quickStart(page);
  const before = await stateJson(page);
  const r = await page.evaluate(() => Game.State.apply({
    attitudeChanges: [{ npcId: 'npc_nobody', delta: 5 }],
    newMemories: [{ npcId: 'npc_nobody', text: 'x', weight: 2 }],
    playerLocationId: 'loc_nowhere',
    npcKnownToPlayer: ['npc_ghost'],
    threadUpdates: [{ threadId: 'thr_none', status: 'resolved' }],
    clockNudges: [{ factionId: 'fac_none', delta: 1 }],
    rumoursHeard: ['rum_none'],
    newSeeds: [{ cause: 'c', effect: 'e', trigger: { type: 'npc', value: 'npc_nobody' } }],
    effects: [
      { op: 'closeLocation', locationId: 'loc_none' },
      { op: 'npcStatus', npcId: 'npc_none', status: 'arrested' },
      { op: 'reputationDelta', key: 'fac_none', delta: 5 },
      { op: 'teleport', npcId: 'npc_none' }
    ],
    surpriseField: 1
  }, { source: 'engine' }));
  assert.equal(r.applied.length, 0, JSON.stringify(r.applied));
  const paths = r.rejected.map(x => x.path);
  for (const p of ['attitudeChanges[0]', 'newMemories[0]', 'playerLocationId', 'npcKnownToPlayer[0]', 'threadUpdates[0]', 'clockNudges[0]', 'rumoursHeard[0]', 'newSeeds[0]', 'effects[0]', 'effects[1]', 'effects[2]', 'effects[3]', 'surpriseField']) {
    assert.ok(paths.includes(p), 'rejected ' + p);
  }
  for (const x of r.rejected.filter(x => x.path !== 'surpriseField' && x.path !== 'effects[3]')) assert.match(x.reason, /unknown/, x.path);
  assert.equal(await stateJson(page), before);
  assert.ok(await page.evaluate(() => Game.State.debugLog.some(x => x.kind === 'rejected' && x.path === 'playerLocationId')), 'rejections reach the debug log');
});

s.test('attitude changes are clamped to ±25 per turn and to ±100 overall', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const npc = G.state.npcs[0];
    const id = npc.id;
    const start = npc.attitude;
    const out = { start };
    G.State.apply({ beginTurn: true });
    const a = G.State.apply({ attitudeChanges: [{ npcId: id, delta: 40, reason: 'saved her life' }] }, { source: 'model' });
    out.afterBig = G.State.npc(id).attitude;
    out.note = a.applied[0];
    const b = G.State.apply({ attitudeChanges: [{ npcId: id, delta: 10 }] }, { source: 'model' });
    out.sameTurn = { attitude: G.State.npc(id).attitude, rejected: b.rejected.length };
    G.State.apply({ beginTurn: true });
    G.State.apply({ attitudeChanges: [{ npcId: id, delta: -20 }, { npcId: id, delta: -20 }] }, { source: 'model' });
    out.cumulative = G.State.npc(id).attitude;
    G.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: 500 }] });
    out.ceiling = G.State.npc(id).attitude;
    G.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: -900 }] });
    out.floor = G.State.npc(id).attitude;
    return out;
  });
  assert.equal(r.afterBig, r.start + 25);
  assert.match(r.note, /clamped/);
  assert.deepEqual(r.sameTurn, { attitude: r.start + 25, rejected: 1 });
  assert.equal(r.cumulative, r.start + 25 - 25, 'two -20s in one turn move 25 in total');
  assert.equal(r.ceiling, 100);
  assert.equal(r.floor, -100);
});

s.test('gold cannot go below 0; HP is clamped to 0..max', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const p = () => G.state.player;
    const gold = p().gold;
    const out = {};
    out.over = G.State.apply({ goldDelta: -(gold + 1) }, { source: 'model' });
    out.goldAfterOver = p().gold;
    G.State.apply({ goldDelta: -gold }, { source: 'model' });
    out.zero = p().gold;
    G.State.apply({ goldDelta: 7 }, { source: 'model' });
    out.seven = p().gold;
    G.State.apply({ hpDelta: -50 }, { source: 'model' });
    out.hpLow = p().hp;
    G.State.apply({ hpDelta: 999 }, { source: 'model' });
    out.hpHigh = p().hp;
    out.max = p().maxHp;
    out.gold = gold;
    return out;
  });
  assert.equal(r.over.rejected.length, 1);
  assert.match(r.over.rejected[0].reason, /cannot afford/);
  assert.equal(r.goldAfterOver, r.gold);
  assert.equal(r.zero, 0);
  assert.equal(r.seven, 7);
  assert.equal(r.hpLow, 0);
  assert.equal(r.hpHigh, r.max);
});

s.test('items lost must be held; items gained stack', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const inv = () => G.state.player.inventory;
    const held = Object.assign({}, inv()[0]);
    const out = {};
    out.notHeld = G.State.apply({ itemsLost: ['item_crown_jewels'] }, { source: 'model' }).rejected;
    G.State.apply({ itemsGained: ['Coil of rope'] }, { source: 'model' });
    G.State.apply({ itemsGained: ['coil of rope'] }, { source: 'model' });
    out.rope = Object.assign({}, inv().find(i => i.id === 'item_coil_of_rope'));
    out.tooMany = G.State.apply({ itemsLost: [{ id: 'item_coil_of_rope', qty: 3 }] }, { source: 'model' }).rejected;
    G.State.apply({ itemsLost: ['Coil of rope'] }, { source: 'model' });
    out.ropeAfter = inv().find(i => i.id === 'item_coil_of_rope').qty;
    G.State.apply({ itemsLost: [held.id] }, { source: 'model' });
    out.heldGone = held.qty === 1 ? !inv().some(i => i.id === held.id) : inv().find(i => i.id === held.id).qty === held.qty - 1;
    return out;
  });
  assert.equal(r.notHeld.length, 1);
  assert.match(r.notHeld[0].reason, /not in inventory/);
  assert.deepEqual(r.rope, { id: 'item_coil_of_rope', name: 'Coil of rope', qty: 2, notes: '' });
  assert.equal(r.tooMany.length, 1);
  assert.equal(r.ropeAfter, 1);
  assert.ok(r.heldGone);
});

s.test('new seeds: at most 2 per turn, triggers at least 1 day ahead', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const day = G.state.time.day;
    const npc = G.state.npcs[0].id;
    const before = G.state.seeds.length;
    G.State.apply({ beginTurn: true });
    const today = G.State.apply({ newSeeds: [{ cause: 'c', effect: 'Today', trigger: { type: 'day', value: day } }] }, { source: 'model' });
    const ok = G.State.apply({ newSeeds: [
      { cause: 'c', effect: 'Tomorrow', trigger: { type: 'day', value: day + 1 } },
      { cause: 'c', effect: 'Next meeting', trigger: { type: 'npc', value: npc } },
      { cause: 'c', effect: 'Third', trigger: { type: 'day', value: day + 3 } }
    ] }, { source: 'model' });
    const added = G.state.seeds.slice(before);
    G.State.apply({ beginTurn: true });
    const nextTurn = G.State.apply({ newSeeds: [{ cause: 'c', effect: 'Later', trigger: { type: 'day', value: day + 2 } }] }, { source: 'model' });
    return { day, today: today.rejected, ok: ok.rejected, added, nextTurn: nextTurn.applied.length };
  });
  assert.equal(r.today.length, 1);
  assert.match(r.today[0].reason, /1 day ahead/);
  assert.equal(r.added.length, 2);
  assert.equal(r.ok.length, 1);
  assert.equal(r.ok[0].path, 'newSeeds[2]');
  assert.match(r.ok[0].reason, /limit/);
  assert.ok(r.added.every(sd => sd.hidden === true && sd.fired === false && /^seed_/.test(sd.id)));
  assert.equal(r.added[1].notBeforeDay, r.day + 1, 'non-day triggers wait at least a day');
  assert.equal(r.nextTurn, 1);
});

s.test('the model source cannot reach effects or engine fields', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => Game.State.apply({
    goldDelta: 5, effects: [{ op: 'priceMultiplier', factor: 2 }], advanceTime: 'rest', storyPointsDelta: 1, addNpcs: [], made_up: true
  }, { source: 'model' }));
  const reasons = Object.fromEntries(r.rejected.map(x => [x.path, x.reason]));
  assert.match(reasons.effects, /not allowed from the model/);
  assert.match(reasons.advanceTime, /not allowed from the model/);
  assert.match(reasons.storyPointsDelta, /not allowed from the model/);
  assert.match(reasons.made_up, /unknown field/);
  assert.equal(r.applied.length, 1);
  assert.equal(await page.evaluate(() => Game.state.flags.priceMultiplier), 1);
});

s.test('effect ops from the build plan all work through State.apply', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const st = () => G.state;
    const loc = st().locations[1];
    const npc = st().npcs.find(n => !n.knownToPlayer && n.status === 'free') || st().npcs[0];
    const other = st().npcs.find(n => n.id !== npc.id && n.status === 'free');
    const fac = st().factions[0];
    const out = {};
    const ok = (diff) => { const res = G.State.apply(diff); if (res.rejected.length) throw new Error(JSON.stringify(res.rejected)); return res; };
    ok({ effects: [{ op: 'closeLocation', locationId: loc.id }] });
    out.closed = G.State.loc(loc.id).closed;
    out.cannotEnter = G.State.apply({ playerLocationId: loc.id }).rejected.length;
    ok({ effects: [{ op: 'openLocation', locationId: loc.id }] });
    out.open = !G.State.loc(loc.id).closed;
    ok({ effects: [{ op: 'npcMove', npcId: npc.id, locationId: loc.id, phases: 'all' }] });
    out.moved = ['morning', 'afternoon', 'evening', 'night'].every(p => G.State.loc(loc.id).npcIdsBySchedule[p].includes(npc.id))
      && st().locations.filter(l => l.id !== loc.id).every(l => Object.values(l.npcIdsBySchedule).every(a => !a.includes(npc.id)));
    ok({ effects: [{ op: 'npcStatus', npcId: npc.id, status: 'arrested' }] });
    const watch = st().locations.find(l => l.type === 'police') || st().locations.find(l => l.type === 'watch');
    out.arrested = watch ? Object.values(watch.npcIdsBySchedule).every(a => a.includes(npc.id)) : st().locations.every(l => Object.values(l.npcIdsBySchedule).every(a => !a.includes(npc.id)));
    ok({ effects: [{ op: 'npcStatus', npcId: npc.id, status: 'free' }] });
    out.freed = G.State.npc(npc.id).status === 'free';
    ok({ effects: [{ op: 'npcStatus', npcId: npc.id, status: 'gone' }] });
    out.gone = st().locations.every(l => Object.values(l.npcIdsBySchedule).every(a => !a.includes(npc.id)));
    const noop = ok({ effects: [{ op: 'npcStatus', npcId: npc.id, status: 'arrested' }] });
    out.goneStays = G.State.npc(npc.id).status === 'gone' && /no-op/.test(noop.applied[0]);
    ok({ effects: [{ op: 'npcStatus', npcId: other.id, status: 'dead' }] });
    out.dead = G.State.npc(other.id).alive === false && !G.State.npcsAt(loc.id, 'morning').some(n => n.id === other.id);
    ok({ effects: [{ op: 'priceMultiplier', factor: 1.25 }] });
    out.price = st().flags.priceMultiplier;
    ok({ effects: [{ op: 'openThread', thread: { id: 'thr_test_new', title: 'A test', summary: 's', status: 'open', knownToPlayer: true, linkedIds: [loc.id] } }] });
    out.thread = !!G.State.thread('thr_test_new');
    out.dupThread = G.State.apply({ effects: [{ op: 'openThread', thread: { id: 'thr_test_new', title: 'Again' } }] }).rejected.length;
    const sp = st().player.storyPoints;
    ok({ effects: [{ op: 'threadStatus', threadId: 'thr_test_new', status: 'resolved' }] });
    out.storyPoint = st().player.storyPoints - sp;
    ok({ effects: [{ op: 'addRumour', rumour: { id: 'rum_test', text: 'They say.', true: false, sourceNpcId: other.id, heard: false } }] });
    out.rumour = G.State.rumour('rum_test').true === false;
    ok({ effects: [{ op: 'plantSeed', seed: { id: 'seed_test', cause: 'c', effect: 'e', trigger: { type: 'location', value: loc.id }, fired: false, hidden: true } }] });
    out.seed = G.State.seed('seed_test').trigger.value === loc.id;
    ok({ effects: [{ op: 'setFlag', key: 'bridgeCharterSigned', value: true }] });
    out.flag = st().flags.bridgeCharterSigned;
    out.reserved = ['priceMultiplier', 'weather'].map(k => G.State.apply({ effects: [{ op: 'setFlag', key: k, value: 3 }] }).rejected.length);
    ok({ effects: [{ op: 'reputationDelta', key: 'town', delta: 150 }, { op: 'reputationDelta', key: fac.id, delta: -12 }] });
    out.rep = [st().player.reputation.town, st().player.reputation[fac.id]];
    out.sameFaction = G.State.apply({ effects: [{ op: 'factionRelation', a: fac.id, b: fac.id, delta: 5 }] }).rejected.length;
    if (st().factions.length > 1) {
      const f2 = st().factions[1];
      const was = fac.relations[f2.id] || 0;
      ok({ effects: [{ op: 'factionRelation', a: fac.id, b: f2.id, delta: -10 }] });
      out.relation = [G.State.faction(fac.id).relations[f2.id] - was, G.State.faction(f2.id).relations[fac.id] === G.State.faction(fac.id).relations[f2.id]];
    }
    return out;
  });
  assert.equal(r.closed, true);
  assert.equal(r.cannotEnter, 1, 'a closed location cannot be entered');
  assert.equal(r.open, true);
  assert.equal(r.moved, true);
  assert.equal(r.arrested, true);
  assert.equal(r.freed, true);
  assert.equal(r.gone, true);
  assert.equal(r.goneStays, true, 'npcStatus is a no-op for gone NPCs');
  assert.equal(r.dead, true);
  assert.equal(r.price, 1.25);
  assert.equal(r.thread, true);
  assert.equal(r.dupThread, 1);
  assert.equal(r.storyPoint, 1);
  assert.equal(r.rumour, true);
  assert.equal(r.seed, true);
  assert.equal(r.flag, true);
  assert.deepEqual(r.reserved, [1, 1]);
  assert.deepEqual(r.rep, [100, -12]);
  assert.equal(r.sameFaction, 1);
  if (r.relation) assert.deepEqual(r.relation, [-10, true]);
});

/* Direction change 14: seeds are events. An engine seed keeps effects,
   checked when it is planted the way the town check reads clock effects, and
   notBeforeTurn; the model's newSeeds keep neither. The two effect ops seeds
   use, visit and placeItem, work through State.apply({ effects }). */
s.test('seeds are events: an engine seed keeps its checked effects and notBeforeTurn, a bad op or id refuses it with the reason, the model\'s seeds keep neither; visit and placeItem through State.apply', async h => {
  const page = await h.open();
  await quickStart(page, { seed: 7, kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const st = G.state;
    const P = ['morning', 'afternoon', 'evening', 'night'];
    const here = st.player.locationId;
    const listed = (l, id) => P.some(p => (l.npcIdsBySchedule[p] || []).includes(id));
    const npc = st.npcs.find(n => n.status === 'free' && n.alive !== false && st.locations.some(l => listed(l, n.id)) && !listed(G.State.loc(here), n.id));
    const open = st.locations.filter(l => !l.closed && l.away !== true && l.id !== here);
    const loc = open[0];
    const other = open.find(l => l.id !== loc.id && !listed(l, npc.id));
    const away = st.locations.find(l => l.away === true);
    const dead = st.npcs.find(n => n.alive === false);
    const base = (id, extra) => Object.assign({ id, cause: 'test', effect: 'Something happens for the test.', trigger: { type: 'day', value: 3 }, fired: false, hidden: true }, extra);
    const plant = seed => S.apply({ effects: [{ op: 'plantSeed', seed }] });
    const reasons = res => res.rejected.map(x => x.reason);
    const out = {};
    const good = [{ op: 'visit', npcId: npc.id, locationId: loc.id }, { op: 'placeItem', locationId: loc.id, item: { name: 'test lantern', qty: 3, notes: 'Dented.' } }, { op: 'setFlag', key: 'testFlag', value: 'yes' }];
    out.good = reasons(plant(base('seed_test_fx', { effects: good, notBeforeTurn: 4 })));
    const kept = S.seed('seed_test_fx');
    out.kept = { same: JSON.stringify(kept.effects) === JSON.stringify(good), notBeforeTurn: kept.notBeforeTurn };
    good[0].npcId = 'npc_changed';
    out.copied = S.seed('seed_test_fx').effects[0].npcId === npc.id;
    out.plain = (() => { plant(base('seed_test_plain')); const sd = S.seed('seed_test_plain'); return ['effects', 'notBeforeTurn'].filter(k => k in sd); })();
    out.badOp = reasons(plant(base('seed_test_badop', { effects: [{ op: 'setFlag', key: 'x', value: 1 }, { op: 'teleport', npcId: npc.id }] })));
    out.badNpc = reasons(plant(base('seed_test_badnpc', { effects: [{ op: 'visit', npcId: 'npc_nobody', locationId: loc.id }] })));
    out.badLoc = reasons(plant(base('seed_test_badloc', { effects: [{ op: 'placeItem', locationId: 'loc_nowhere', item: { name: 'x' } }] })));
    out.badThread = reasons(plant(base('seed_test_badthread', { effects: [{ op: 'threadStatus', threadId: 'thr_nothing', status: 'failed' }] })));
    out.awayVisit = reasons(plant(base('seed_test_away', { effects: [{ op: 'visit', npcId: npc.id, locationId: away.id }] })));
    out.noName = reasons(plant(base('seed_test_noname', { effects: [{ op: 'placeItem', locationId: loc.id, item: {} }] })));
    out.reserved = reasons(plant(base('seed_test_reserved', { effects: [{ op: 'setFlag', key: 'weather', value: 'x' }] })));
    out.tooMany = reasons(plant(base('seed_test_many', { effects: Array.from({ length: S.SEED_EFFECTS_MAX + 1 }, (_, i) => ({ op: 'setFlag', key: 'f' + i, value: i })) })));
    out.notList = reasons(plant(base('seed_test_notlist', { effects: { op: 'setFlag', key: 'x', value: 1 } })));
    out.refusedPlanted = ['seed_test_badop', 'seed_test_badnpc', 'seed_test_badloc', 'seed_test_badthread', 'seed_test_away', 'seed_test_noname', 'seed_test_reserved', 'seed_test_many', 'seed_test_notlist'].filter(id => S.seed(id));
    // A thread opened earlier in the same list counts.
    out.threadLater = reasons(plant(base('seed_test_thread', { effects: [{ op: 'openThread', thread: { id: 'thr_test_fx', title: 'T' } }, { op: 'threadStatus', threadId: 'thr_test_fx', status: 'failed' }] })));
    // The model's newSeeds: no effects and no notBeforeTurn, and the applied line says the effects were left out.
    S.apply({ beginTurn: true });
    const m = S.apply({ newSeeds: [{ id: 'seed_test_model', cause: 'c', effect: 'The model\'s seed.', trigger: { type: 'day', value: st.time.day + 2 }, effects: [{ op: 'setFlag', key: 'modelFlag', value: true }], notBeforeTurn: 9 }] }, { source: 'model' });
    const ms = S.seed('seed_test_model');
    out.model = { rejected: m.rejected, applied: m.applied.join(' | '), keys: ['effects', 'notBeforeTurn', 'origin'].filter(k => k in ms), flag: st.flags.modelFlag };
    // visit: there for this day and phase only, out of their scheduled place.
    const v = S.apply({ effects: [{ op: 'visit', npcId: npc.id, locationId: other.id }] });
    out.visit = {
      rejected: v.rejected, applied: v.applied.join(' | '), there: S.npcsAt(other.id).some(n => n.id === npc.id),
      elsewhere: st.locations.filter(l => l.id !== other.id).some(l => S.npcsAt(l.id).some(n => n.id === npc.id)),
      entry: st.visits.find(x => x.npcId === npc.id), now: { day: st.time.day, phase: st.time.phase }
    };
    S.apply({ advanceTime: 'long' });
    out.visitNext = S.npcsAt(other.id).some(n => n.id === npc.id);
    // placeItem: a scene item with its id from the name; the same thing again adds to the pile.
    const p1 = S.apply({ effects: [{ op: 'placeItem', locationId: other.id, item: { name: 'test rope', qty: 2, notes: 'Frayed.' } }, { op: 'placeItem', locationId: other.id, item: { name: 'test rope' } }] });
    out.place = { rejected: p1.rejected, items: S.loc(other.id).items.map(i => [i.id, i.name, i.qty, i.notes]) };
    // No-ops (someone not free, a closed place) and refusals (out of town, no name, the model).
    out.visitDead = S.apply({ effects: [{ op: 'visit', npcId: dead.id, locationId: other.id }] });
    S.apply({ effects: [{ op: 'closeLocation', locationId: other.id }] });
    out.visitClosed = S.apply({ effects: [{ op: 'visit', npcId: npc.id, locationId: other.id }] });
    out.visitAway = reasons(S.apply({ effects: [{ op: 'visit', npcId: npc.id, locationId: away.id }] }));
    // Someone in the player's scene is never taken out of it.
    let withPlayer = G.State.npcsAt(here)[0];
    if (!withPlayer) { S.apply({ visits: [{ npcId: npc.id, locationId: here }] }); withPlayer = npc; }
    const elsewhere = open.find(l => l.id !== other.id && !G.State.npcsAt(l.id).some(n => n.id === withPlayer.id));
    out.visitScene = S.apply({ effects: [{ op: 'visit', npcId: withPlayer.id, locationId: elsewhere.id }] });
    out.stillHere = G.State.npcsAt(here).some(n => n.id === withPlayer.id);
    out.placeAway = reasons(S.apply({ effects: [{ op: 'placeItem', locationId: away.id, item: { name: 'x' } }] }));
    out.placeNoName = reasons(S.apply({ effects: [{ op: 'placeItem', locationId: here, item: { qty: 2 } }] }));
    out.fromModel = reasons(S.apply({ effects: [{ op: 'visit', npcId: npc.id, locationId: here }] }, { source: 'model' }));
    out.ops = S.EFFECT_OPS.slice();
    return out;
  });
  assert.deepEqual(r.good, [], 'valid effects are planted');
  assert.deepEqual(r.kept, { same: true, notBeforeTurn: 4 }, 'kept as given, with notBeforeTurn');
  assert.equal(r.copied, true, 'a copy, not the caller\'s list');
  assert.deepEqual(r.plain, [], 'a seed without them has neither field (older saves are unchanged)');
  assert.deepEqual(r.badOp, ['effects[1]: unknown op "teleport"']);
  assert.deepEqual(r.badNpc, ['effects[0]: unknown npc id "npc_nobody"']);
  assert.deepEqual(r.badLoc, ['effects[0]: unknown location id "loc_nowhere"']);
  assert.deepEqual(r.badThread, ['effects[0]: unknown thread id "thr_nothing"']);
  assert.equal(r.awayVisit.length, 1);
  assert.match(r.awayVisit[0], /^effects\[0\]: loc_\w+ is out of town$/);
  assert.deepEqual(r.noName, ['effects[0]: placeItem needs an item with a name']);
  assert.deepEqual(r.reserved, ['effects[0]: flag "weather" is reserved']);
  assert.equal(r.tooMany.length, 1);
  assert.match(r.tooMany[0], /at most \d+ effects/);
  assert.deepEqual(r.notList, ['effects must be a list of effect ops']);
  assert.deepEqual(r.refusedPlanted, [], 'a seed with a bad effect is not planted at all');
  assert.deepEqual(r.threadLater, [], 'a thread opened earlier in the list counts');
  assert.deepEqual(r.model.rejected, [], 'the model\'s seed is planted');
  assert.deepEqual(r.model.keys, [], 'without effects, notBeforeTurn or origin');
  assert.match(r.model.applied, /its effects were left out: the model plants none/);
  assert.equal(r.model.flag, undefined);
  assert.deepEqual(r.visit.rejected, []);
  assert.equal(r.visit.there, true, 'visit: there now');
  assert.equal(r.visit.elsewhere, false, 'and nowhere else');
  assert.deepEqual([r.visit.entry.day, r.visit.entry.phase], [r.visit.now.day, r.visit.now.phase], 'for this day and phase');
  assert.equal(r.visitNext, false, 'gone again the next phase');
  assert.deepEqual(r.place.rejected, []);
  assert.deepEqual(r.place.items, [['item_test_rope', 'test rope', 3, 'Frayed.']], 'placeItem: one pile, its id from the name');
  assert.deepEqual(r.visitDead.rejected, []);
  assert.match(r.visitDead.applied[0], /^effects\[0\]: visit: no-op: npc_\w+ is dead$/);
  assert.deepEqual(r.visitClosed.rejected, []);
  assert.match(r.visitClosed.applied[r.visitClosed.applied.length - 1], /no-op: loc_\w+ is closed$/);
  assert.match(r.visitAway[0], /is out of town/);
  assert.deepEqual(r.visitScene.rejected, []);
  assert.match(r.visitScene.applied[0], /visit: no-op: npc_\w+ is with the player at loc_\w+$/);
  assert.equal(r.stillHere, true, 'someone with the player stays in the scene');
  assert.match(r.placeAway[0], /is out of town/);
  assert.match(r.placeNoName[0], /item needs a name/);
  assert.match(r.fromModel[0], /not allowed from the model/);
  assert.ok(r.ops.includes('visit') && r.ops.includes('placeItem'), 'both are effect ops');
});

s.test('clock nudges move at most one segment per turn; story points cap at 3', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const f = G.state.factions[0];
    const clock = () => f.clocks[f.activeClock].filled;
    G.State.apply({ beginTurn: true });
    G.State.apply({ clockNudges: [{ factionId: f.id, delta: 1 }, { factionId: f.id, delta: 1 }] }, { source: 'model' });
    const one = clock();
    const bad = G.State.apply({ clockNudges: [{ factionId: f.id, delta: 2 }] }, { source: 'model' }).rejected.length;
    G.State.apply({ storyPointsDelta: 5 });
    const sp = G.state.player.storyPoints;
    return { one, bad, sp };
  });
  assert.equal(r.one, 1);
  assert.equal(r.bad, 1);
  assert.equal(r.sp, 3);
});

s.test('snapshot and restore round-trip the exact state', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const before = JSON.stringify(G.state);
    G.State.snapshot();
    G.State.apply({ beginTurn: true, goldDelta: 3, journalEntry: 'x', advanceTime: 'long' });
    G.Rng.int(1, 6);
    const changed = JSON.stringify(G.state) !== before;
    const ok = G.State.restore();
    const same = JSON.stringify(G.state) === before;
    const empty = G.State.restore();
    return { changed, ok, same, empty };
  });
  assert.deepEqual(r, { changed: true, ok: true, same: true, empty: false });
});

s.test('time: three shorts make a phase, long is a phase, rest heals 3 and wakes next morning', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const t = () => `${G.state.time.day}:${G.state.time.phase}:${G.state.time.shorts}`;
    const out = [t()];
    G.State.apply({ advanceTime: 'short' }); out.push(t());
    G.State.apply({ advanceTime: 'short' }); out.push(t());
    const third = G.State.apply({ advanceTime: 'short' }); out.push(t());
    out.push(third.time.phasesPassed);
    G.State.apply({ advanceTime: 'instant' }); out.push(t());
    G.State.apply({ advanceTime: 'long' }); out.push(t());
    G.State.apply({ advanceTime: 'long' }); out.push(t());
    G.State.apply({ hpDelta: -5 });
    const rest = G.State.apply({ advanceTime: 'rest' }); out.push(t());
    out.push(rest.time.phasesPassed, rest.time.healed, G.state.player.hp);
    out.push(G.State.apply({ advanceTime: 'nap' }).rejected.length);
    return out;
  });
  assert.deepEqual(r, ['1:morning:0', '1:morning:1', '1:morning:2', '1:afternoon:0', 1, '1:afternoon:0', '1:evening:0', '1:night:0', '2:morning:0', 1, 3, 8, 1]);
});

s.test('night holds until the player sleeps: shorts at night stop at late with no phase change and no tick; a long reaches morning with no sleep; /rest clears it', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const G = Game;
    const t = () => { const x = G.state.time; return `${x.day}:${x.phase}:${x.shorts}${x.late ? ':late' : ''}${x.noSleep ? ':nosleep' : ''}`; };
    const ticks = [];
    const orig = G.World.tick;
    G.World.tick = info => { ticks.push(`${info.to.day}:${info.to.phase}`); return orig(info); };
    G.Api.Mock.delay = 0;
    const out = { steps: [], parts: [], lines: [] };
    const note = () => { out.steps.push(t()); out.parts.push(G.State.phasePart(G.state.time)); out.lines.push(G.State.clockLine(G.state.time)); };
    // Evening into night as before: three shorts make a phase, and the world ticks.
    G.State.apply({ advanceTime: 'long' }); G.State.apply({ advanceTime: 'long' });
    for (let i = 0; i < 3; i++) G.Pipeline.passTime('short');
    note();
    out.ticksToNight = ticks.splice(0);
    // At night: shorts climb to late, then hold there; no phase passes, nothing ticks.
    const results = [];
    for (let i = 0; i < 5; i++) { results.push(G.Pipeline.passTime('short')); note(); }
    out.held = results.map(x => [x.phasesPassed, x.held]);
    out.ticksAtNight = ticks.splice(0);
    out.applied = G.State.debugLog.filter(x => x.kind === 'applied' && /^advanceTime/.test(x.text)).pop().text;
    // A long action (hours pass) reaches morning: the world ticks, the new day starts early, no sleep last night.
    const long = G.Pipeline.passTime('long');
    note();
    out.long = [long.phasesPassed, long.to.day, long.to.phase];
    out.ticksLong = ticks.splice(0);
    // Leaving morning keeps the note in state but the DAY line drops it; /rest clears it.
    G.Pipeline.passTime('long'); note();
    G.State.apply({ hpDelta: -2 });
    G.Pipeline.passTime('rest'); note();
    out.ticksRest = ticks.splice(0);
    // /wait morning from night also counts as no sleep.
    G.State.apply({ advanceTime: 'long' }); G.State.apply({ advanceTime: 'long' }); G.State.apply({ advanceTime: 'long' });
    G.State.apply({ advanceTime: 'short' }); G.State.apply({ advanceTime: 'short' }); G.State.apply({ advanceTime: 'short' });
    note();
    G.World.tick = orig;
    await G.Pipeline.wait('morning');
    note();
    return out;
  });
  assert.deepEqual(r.ticksToNight, ['1:night'], 'evening into night by the old rule: three shorts make the phase, and the world ticks');
  assert.deepEqual(r.steps, [
    '1:night:0',
    '1:night:1', '1:night:2', '1:night:2:late', '1:night:2:late', '1:night:2:late',
    '2:morning:0:nosleep', '2:afternoon:0:nosleep', '3:morning:0',
    '3:night:2:late', '4:morning:0:nosleep'
  ]);
  assert.deepEqual(r.held, [[0, false], [0, false], [0, true], [0, true], [0, true]], 'no phase passes at night, however many shorts');
  assert.deepEqual(r.ticksAtNight, [], 'World.tick is not called for the held rollover');
  assert.match(r.applied, /^advanceTime: short: day 1 night \(late: night holds until the player sleeps\)$/);
  assert.deepEqual(r.long, [1, 2, 'morning']);
  assert.deepEqual(r.ticksLong, ['2:morning'], 'a long at night ticks into morning');
  assert.deepEqual(r.ticksRest, ['2:afternoon', '2:evening', '2:night', '3:morning'], 'the long into the afternoon, then a rest ticks through the night as before');
  assert.deepEqual(r.parts, ['early', 'mid', 'late', 'late', 'late', 'late', 'early', 'early', 'early', 'late', 'early']);
  assert.deepEqual(r.lines, [
    'DAY 1, NIGHT (early; the player has not slept)',
    'DAY 1, NIGHT (mid; the player has not slept)', 'DAY 1, NIGHT (late; the player has not slept)',
    'DAY 1, NIGHT (late; the player has not slept)', 'DAY 1, NIGHT (late; the player has not slept)', 'DAY 1, NIGHT (late; the player has not slept)',
    'DAY 2, MORNING (early; no sleep last night)', 'DAY 2, AFTERNOON (early)', 'DAY 3, MORNING (early)',
    'DAY 3, NIGHT (late; the player has not slept)', 'DAY 4, MORNING (early; no sleep last night)'
  ]);
});

s.test('setTime sets the clock outright (engine only, validated, no tick); late needs night and the last short', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    let ticks = 0;
    const orig = G.World.tick;
    G.World.tick = info => { ticks += 1; return orig(info); };
    const reason = diff => { const x = S.apply(diff); return x.rejected.length ? x.rejected[0].reason : null; };
    const out = {};
    S.apply({ advanceTime: 'long' }); S.apply({ advanceTime: 'long' }); S.apply({ advanceTime: 'long' }); S.apply({ advanceTime: 'long' }); // day 2 morning, no sleep
    out.start = JSON.stringify(G.state.time);
    out.bad = [
      reason({ setTime: null }) || 'none',
      reason({ setTime: 'night' }),
      reason({ setTime: { day: 1, phase: 'dusk' } }),
      reason({ setTime: { day: 0, phase: 'night' } }),
      reason({ setTime: { day: 1.5, phase: 'night' } }),
      reason({ setTime: { day: 1, phase: 'night', shorts: 3 } }),
      reason({ setTime: { day: 1, phase: 'night', shorts: -1 } }),
      reason({ setTime: { day: 1, phase: 'evening', shorts: 2, late: true } }),
      reason({ setTime: { day: 1, phase: 'night', shorts: 0, late: true } }),
      reason({ setTime: { day: 1, phase: 'night', late: 'yes' } })
    ];
    out.unchanged = JSON.stringify(G.state.time) === out.start;
    out.fromModel = S.apply({ setTime: { day: 1, phase: 'night' } }, { source: 'model' }).rejected[0].reason;
    out.ok = S.apply({ setTime: { day: 1, phase: 'night', shorts: 2, late: true } });
    out.after = JSON.parse(JSON.stringify(G.state.time));
    out.line = S.clockLine(G.state.time);
    out.plain = S.apply({ setTime: { day: 3, phase: 'afternoon' } }).applied;
    out.after2 = JSON.parse(JSON.stringify(G.state.time));
    out.same = S.apply({ setTime: { day: 3, phase: 'afternoon', shorts: 0, late: false } }).applied;
    out.ticks = ticks;
    out.engine = S.ENGINE_KEYS.includes('setTime') && !S.RECORD_KEYS.includes('setTime');
    G.World.tick = orig;
    return out;
  });
  assert.equal(r.start, '{"day":2,"phase":"morning","shorts":0,"noSleep":true}');
  assert.deepEqual(r.bad, [
    'none',
    'must be an object',
    'phase must be morning, afternoon, evening, night',
    'day must be a whole number, 1 or more',
    'day must be a whole number, 1 or more',
    'shorts must be 0 to 2',
    'shorts must be 0 to 2',
    'late is only for night',
    'late needs shorts 2',
    'late must be true or false'
  ]);
  assert.equal(r.unchanged, true, 'a refused setTime leaves the clock alone');
  assert.match(r.fromModel, /not allowed from the model/);
  assert.deepEqual(r.ok.rejected, []);
  assert.deepEqual(r.ok.applied, ['setTime: clock day 2 morning, shorts 0, no sleep -> day 1 night, shorts 2, late']);
  assert.deepEqual(r.after, { day: 1, phase: 'night', shorts: 2, late: true }, 'the no-sleep note goes with a set clock');
  assert.equal(r.line, 'DAY 1, NIGHT (late; the player has not slept)');
  assert.deepEqual(r.plain, ['setTime: clock day 1 night, shorts 2, late -> day 3 afternoon, shorts 0']);
  assert.deepEqual(r.after2, { day: 3, phase: 'afternoon', shorts: 0 });
  assert.deepEqual(r.same, [], 'the same clock again changes nothing');
  assert.equal(r.ticks, 0, 'setting the clock never ticks the world');
  assert.equal(r.engine, true);
});

s.test('town data passes validation and every content constant has the contract shape', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const D = Game.data;
    const keys = o => Object.keys(o).sort();
    const asym = JSON.parse(JSON.stringify(D.TOWN_DATA));
    const lastInTown = asym.locations.filter(l => !l.away).pop();
    asym.locations[0].exits.push(lastInTown.id);
    if (lastInTown.exits.includes(asym.locations[0].id)) lastInTown.exits = lastInTown.exits.filter(x => x !== asym.locations[0].id);
    // A road to a place out of town is refused; so is a dead person in a schedule.
    const roadOut = JSON.parse(JSON.stringify(D.TOWN_DATA));
    const out = roadOut.locations.find(l => l.away);
    roadOut.locations[0].exits.push(out.id);
    out.exits.push(roadOut.locations[0].id);
    const haunted = JSON.parse(JSON.stringify(D.TOWN_DATA));
    const dead = haunted.npcs.find(n => n.presence === 'dead');
    haunted.locations[0].npcIdsBySchedule.night.push(dead.id);
    return {
      errors: Game.Town.validate(D.TOWN_DATA),
      asym: Game.Town.validate(asym).some(e => /symmetric/.test(e)),
      roadOut: Game.Town.validate(roadOut),
      haunted: Game.Town.validate(haunted),
      deadId: dead.id, outId: out.id,
      townKeys: keys(D.TOWN_DATA),
      locKeys: D.TOWN_DATA.locations.map(keys),
      npcKeys: D.TOWN_DATA.npcs.map(keys),
      facKeys: D.TOWN_DATA.factions.map(keys),
      clockKeys: D.TOWN_DATA.factions.flatMap(f => f.clocks.map(c => [keys(c), keys(c.onComplete)])),
      tables: { top: keys(D.TABLES), npc: keys(D.TABLES.npc), location: keys(D.TABLES.location), items: keys(D.TABLES.items), weather: keys(D.TABLES.weather), goods: D.TABLES.items.goods.map(keys) },
      bg: D.BACKGROUNDS.map(b => ({ k: keys(b), total: Object.values(b.stats).reduce((a, x) => a + x, 0), range: Object.values(b.stats).every(v => v >= -1 && v <= 3), items: b.items.length, arrival: b.arrival })),
      flaws: D.FLAWS.every(f => typeof f === 'string' && f.length > 0),
      loose: keys(D.LOOSE_ENDS),
      looseShape: Object.values(D.LOOSE_ENDS).map(le => ({ k: keys(le), seed: keys(le.seed), link: keys(le.link).filter(k => k !== 'optionTags').join() === 'tag' && (!le.link.optionTags || le.link.optionTags.length === le.options.length), memory: keys(le.memory).filter(k => k !== 'options').join() === 'text' && (!le.memory.options || le.memory.options.length === le.options.length) })),
      // A template may carry effects for its seed, "{npc}" being the person it belongs to (direction change 16: the beating is a fight).
      templates: D.GRUDGE_TEMPLATES.concat(D.FAVOUR_TEMPLATES).map(t => keys(t).filter(k => k !== 'effects').join() === 'dayOffset,effect' && t.effect.includes('{npc}') && (t.effects === undefined || (Array.isArray(t.effects) && t.effects.every(e => e.npcId === '{npc}')))),
      fightTemplates: D.GRUDGE_TEMPLATES.filter(t => (t.effects || []).some(e => e.op === 'fight')).length,
      // Paid work (direction change 16).
      jobs: D.JOBS.map(j => ({ k: keys(j).filter(x => !['onSuccess', 'onFailure', 'stake'].includes(x)), pay: j.pay[0] <= j.pay[1], here: (D.TOWN_DATA.locations.find(l => l.id === j.locationId) || { npcIdsBySchedule: {} }), phases: j.phases, giver: j.giverNpcId }))
        .map(x => ({ k: x.k, pay: x.pay, scheduled: x.phases.every(p => (x.here.npcIdsBySchedule[p] || []).includes(x.giver)) }))
    };
  });
  assert.deepEqual(r.errors, []);
  assert.ok(r.asym, 'validation catches an asymmetric exit');
  assert.ok(r.roadOut.some(e => e.includes(`a place out of town has no exits`)) && r.roadOut.some(e => e.includes(`exit to ${r.outId}, a place out of town`)), r.roadOut.join(' | '));
  assert.ok(r.haunted.some(e => e === `${r.deadId}: is dead but scheduled in town`), r.haunted.join(' | '));
  // map is optional on the town and on each location (docs/BUILD_PLAN.md, "Map"); offstage on the town. A lived-in town (direction change 9):
  // the town's year, history and recent events; every place's details, hours and history, other names (aka), and away and distance out of town.
  const optional = k => !['map', 'offstage', 'aka', 'away', 'distance'].includes(k);
  assert.deepEqual(r.townKeys.filter(optional), ['currency', 'factions', 'history', 'locations', 'name', 'npcs', 'recent', 'rumours', 'seeds', 'setting', 'startLocationIds', 'threads', 'year']);
  for (const k of r.locKeys) assert.deepEqual(k.filter(optional), ['closed', 'description', 'details', 'discovered', 'exits', 'history', 'hours', 'id', 'name', 'npcIdsBySchedule', 'type']);
  // The cast (docs/BUILD_PLAN.md, direction changes 8 and 9): an age, a presence, a history, relations and a home on everyone;
  // where they are and how to reach them for someone away, when they died (and where they lie) for the dead.
  const extra = ['where', 'reach', 'died', 'buried'];
  for (const k of r.npcKeys) assert.deepEqual(k.filter(x => !extra.includes(x)), ['age', 'alive', 'attitude', 'factionId', 'goal', 'history', 'home', 'id', 'knownToPlayer', 'look', 'memories', 'name', 'personality', 'presence', 'pronouns', 'relations', 'role', 'secret', 'status', 'tags', 'voice']);
  for (const k of r.facKeys) assert.deepEqual(k, ['activeClock', 'clocks', 'goal', 'id', 'methods', 'name', 'relations']);
  for (const [c, oc] of r.clockKeys) { assert.deepEqual(c, ['filled', 'label', 'onComplete', 'segments']); assert.deepEqual(oc, ['effects', 'text']); }
  assert.deepEqual(r.tables.top, ['complications', 'items', 'location', 'npc', 'weather']);
  assert.deepEqual(r.tables.npc, ['familyNames', 'firstNames', 'occupations', 'speechQuirks', 'traits', 'wants']);
  assert.deepEqual(r.tables.location, ['details', 'problems', 'types']);
  assert.deepEqual(r.tables.items, ['goods', 'trinkets']);
  assert.deepEqual(r.tables.weather, ['autumn', 'spring', 'summer', 'winter']);
  for (const g of r.tables.goods) assert.deepEqual(g, ['name', 'price']);
  for (const b of r.bg) {
    assert.deepEqual(b.k, ['age', 'arrival', 'blurb', 'gold', 'id', 'items', 'name', 'stats']);
    assert.equal(b.total, 3);
    assert.ok(b.range);
    assert.equal(b.items, 2);
    assert.ok(['gate', 'docks'].includes(b.arrival));
  }
  assert.ok(r.bg.some(b => b.arrival === 'gate') && r.bg.some(b => b.arrival === 'docks'));
  assert.ok(r.flaws);
  assert.deepEqual(r.loose, ['debt', 'enemy', 'lost', 'promise', 'secret']);
  for (const le of r.looseShape) {
    assert.deepEqual(le.k, ['label', 'link', 'memory', 'options', 'seed'], 'newNpc is retired: every loose end links to the cast, and that person remembers it (direction change 10)');
    assert.deepEqual(le.seed, ['dayOffset', 'effect', 'trigger']);
    assert.ok(le.link);
    assert.ok(le.memory, 'memory: text, and one line per option when options is given');
  }
  assert.ok(r.templates.every(Boolean));
  assert.equal(r.fightTemplates, 1, 'one grudge comes at the player in a fight');
  assert.ok(r.jobs.length >= 6 && r.jobs.length <= 8, 'six to eight jobs');
  for (const j of r.jobs) {
    assert.deepEqual(j.k, ['blurb', 'cooldownDays', 'difficulty', 'factionId', 'giverNpcId', 'id', 'label', 'locationId', 'pay', 'phases', 'repeatable', 'stat', 'timeCost']);
    assert.ok(j.pay && j.scheduled, 'a pay range, and the giver at the place in every phase');
  }
});

s.test('character creation turns every loose end into an NPC, a memory, a thread and a hidden seed', async h => {
  const page = await h.open();
  for (const kinds of [['debt', 'enemy', 'secret'], ['lost', 'promise', 'debt']]) {
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { kinds, seed: 4242 });
    const r = await page.evaluate(() => {
      const G = Game;
      const st = G.state;
      const townNpcIds = G.data.TOWN_DATA.npcs.map(n => n.id);
      return st.player.looseEnds.map(le => {
        const def = G.data.LOOSE_ENDS[le.kind];
        const npc = G.State.npc(le.npcId);
        const seed = G.State.seed(le.seedId);
        const thread = G.State.thread(le.threadId);
        const at = def.options.indexOf(le.text);
        return {
          kind: le.kind, created: le.created, inTown: townNpcIds.includes(npc.id), tag: (def.link.optionTags && at >= 0 ? def.link.optionTags[at] : null) || def.link.tag, tags: npc.tags,
          known: npc.knownToPlayer, memory: npc.memories.some(m => m.weight === 3 && m.text === (at >= 0 && def.memory.options ? def.memory.options[at] : def.memory.text)),
          seed, offset: def.seed.dayOffset, trigger: def.seed.trigger,
          thread: thread && thread.knownToPlayer && thread.linkedIds.includes(npc.id),
          made: !!npc.created, scheduled: ['morning', 'afternoon', 'evening', 'night'].every(p => st.locations.some(l => (l.npcIdsBySchedule[p] || []).includes(npc.id)))
        };
      });
    });
    assert.equal(r.length, 3);
    assert.equal(new Set(r.map(x => x.kind)).size, 3);
    for (const [i, le] of r.entries()) {
      // The cast is fixed: every loose end is someone written in the town data, by the option's tag, never someone made.
      assert.equal(le.created, false, `${le.kind}: nobody created`);
      assert.ok(le.inTown && !le.made, `${le.kind}: a cast member`);
      assert.ok(le.tags.includes(le.tag), `${le.kind} linked by the tag ${le.tag}`);
      assert.ok(le.scheduled, `${le.kind}: their schedule already places them, every phase`);
      assert.ok(le.known && le.memory && le.thread, le.kind);
      assert.equal(le.seed.hidden, true);
      assert.equal(le.seed.fired, false);
      // Direction change 14: the first loose end picked is the hook on day 1, after the player's second turn; the others keep their windows.
      if (i === 0) {
        assert.deepEqual([le.seed.trigger, le.seed.notBeforeTurn], [{ type: 'day', value: 1 }, 2], `${kinds[0]}, picked first, fires on day 1 after turn 2`);
        continue;
      }
      assert.equal(le.seed.notBeforeTurn, undefined, `${le.kind}: no turn to wait for`);
      if (le.seed.trigger.type === 'day') {
        assert.ok(le.seed.trigger.value >= Math.max(2, le.offset[0]) && le.seed.trigger.value <= Math.max(2, le.offset[1]), `${le.kind} day ${le.seed.trigger.value} in ${le.offset}`);
      } else assert.ok(le.seed.notBeforeDay >= 2);
    }
  }
  // Two loose ends never share an NPC.
  const ids = await page.evaluate(() => Game.state.player.looseEnds.map(le => le.npcId));
  assert.equal(new Set(ids).size, ids.length);
  // Bad characters are refused.
  const errs = await page.evaluate(() => {
    const D = Game.data;
    const bg = D.BACKGROUNDS[0];
    const tryIt = stats => { try { Game.State.newGame(D.TOWN_DATA, { name: 'X', backgroundId: bg.id, stats, goal: 'g', flaw: 'f', looseEnds: [] }, { pending: true }); return 'ok'; } catch (e) { return e.message; } };
    const k = Object.keys(bg.stats);
    const two = Object.assign({}, bg.stats); two[k.find(x => bg.stats[x] >= 1)] -= 2; two[k.find(x => bg.stats[x] <= 1)] += 2;
    return { two: tryIt(two), unknown: (() => { try { Game.State.newGame(D.TOWN_DATA, { name: 'X', backgroundId: 'bg_nope', looseEnds: [] }); return 'ok'; } catch (e) { return e.message; } })() };
  });
  assert.match(errs.two, /one point|between/);
  assert.match(errs.unknown, /background/);
});

s.test('Tables build complete entities from the seeded stream', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const G = Game;
    const n1 = G.Tables.npc({}, G.Rng.create(5));
    const n2 = G.Tables.npc({}, G.Rng.create(5));
    const l = G.Tables.location({ fromId: 'loc_x' }, G.Rng.create(5));
    const it = G.Tables.item('goods', G.Rng.create(5));
    const tr = G.Tables.item('trinket', G.Rng.create(5));
    return { n1, n2, l, it, tr, comp: G.data.TABLES.complications.includes(G.Tables.complication(G.Rng.create(1))), weather: G.Tables.weather('winter', G.Rng.create(1)) };
  });
  assert.deepEqual(r.n1, r.n2);
  assert.deepEqual(Object.keys(r.n1).sort(), ['alive', 'attitude', 'factionId', 'goal', 'id', 'knownToPlayer', 'look', 'memories', 'name', 'personality', 'pronouns', 'role', 'secret', 'status', 'tags', 'voice']);
  assert.ok(['he', 'she', 'they'].includes(r.n1.pronouns), 'pronouns: ' + r.n1.pronouns);
  assert.match(r.n1.id, /^npc_[a-z0-9_]+$/);
  assert.equal(r.n1.personality.length, 2);
  assert.match(r.l.id, /^loc_[a-z0-9_]+$/);
  assert.deepEqual(r.l.exits, ['loc_x']);
  assert.ok(r.l.description.length > 10);
  assert.match(r.it.id, /^item_/);
  assert.ok(r.it.price > 0);
  assert.match(r.tr.id, /^item_/);
  assert.ok(r.comp);
  assert.ok(r.weather.length > 0);
});

s.test('Town.plausible refuses the dragon and accepts the barmaid, for any location type', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => ['new:a dragon by the fire', 'new:barmaid', 'new:a coil of rope', 'new:a wizard selling potions', 'new:the back room'].map(d => Game.Town.plausible(d, 'tavern')).concat([Game.Town.plausible('a carter', 'riverbank')]));
  assert.deepEqual(r.map(x => x.plausible), [false, true, true, false, true, true]);
  assert.deepEqual(r.map(x => x.kind), ['item', 'npc', 'item', 'npc', 'location', 'npc']);
});

/* The narrator's example turns. Literary: SPEC.md section 9's examples
   rewritten for the present day (docs/BUILD_PLAN.md, setting change), same
   shape and length. Casual: the same three scenes in the plain register
   (docs/BUILD_PLAN.md, direction changes). Their people and places are from a
   different town. */
const MODERN_EXAMPLES = [
  {
    input: 'I walk into the bar.',
    context: 'Seed due: Charlene wants her $400.',
    narration: 'The Tip Top is half empty this early. Charlene sits at the end of the bar with a beer going flat. She doesn\'t look up from her phone. "Sit," she says. "You owe me four hundred."'
  },
  {
    input: 'I try to pick the lock on the insurance office door.',
    context: 'Stealth 9 vs 15 · Failure · Complication: someone filmed it on their phone.',
    narration: 'The pick slips and the pins drop back with a click that\'s louder than it should be. Across the street, a kid on a bike puts one foot down. He has his phone up.'
  },
  {
    input: 'I ask the mechanic if he\'s heard anything about the bootleggers.',
    context: 'Mechanic: gruff, short sentences, attitude −10.',
    narration: 'He doesn\'t come out from under the hood. "Heard plenty. Doesn\'t mean I repeat it." He wipes his hands on a rag and looks past you at the empty lot. "You buying something?"'
  }
];
const CASUAL_VOICE = 'VOICE: Talk like a friend running the game at the table: plain, casual, direct. Everyday words, short sentences. Say what happens and what people say. One concrete detail is plenty; skip scenery and weather unless it changes something. No metaphors, no similes, no mood-setting, no fancy verbs. Second person, present tense. Never tell the player how to feel.';
const promptHas = (prompt, t) => prompt.includes(`Input: ${t.input}\n(${t.context})\n${t.narration}`);

s.test('style guides: literary is SPEC section 9 word for word; casual keeps its sections, NEVER lines and banned list; both example sets; Style.check catches problems', async h => {
  const spec = fs.readFileSync(path.join(ROOT, 'SPEC.md'), 'utf8');
  const sec = spec.split('## 9. Writing style guide')[1].split('## 10.')[0];
  const block = sec.split('```')[1].replace(/^\n/, '').replace(/\n$/, '');
  const page = await h.open();
  const r = await page.evaluate(() => ({
    lit: Game.data.STYLE_GUIDE_LITERARY, cas: Game.data.STYLE_GUIDE_CASUAL,
    exLit: Game.data.EXAMPLE_TURNS_LITERARY, exCas: Game.data.EXAMPLE_TURNS_CASUAL,
    styles: Game.Style.STYLES, current: Game.Style.current(), setting: Game.Storage.settings().narrationStyle,
    pLit: Game.Style.systemPrompt('literary'), pLit2: Game.Style.systemPrompt('literary'),
    pCas: Game.Style.systemPrompt('casual'), pCas2: Game.Style.systemPrompt('casual'), pDefault: Game.Style.systemPrompt(),
    banned: Game.Style.BANNED,
    checks: {
      clean: Game.Style.check('The ferryman spits. "Two coppers," he says.'),
      banned: Game.Style.check('The air is thick with smoke.'),
      curly: Game.Style.check('You can’t help but stare.'),
      long: Game.Style.check(Array(91).fill('word').join(' ')),
      zoom: Game.Style.check(Array(140).fill('word').join(' '), { zoom: true }),
      menu: Game.Style.check('He waits. What do you do?'),
      asYou: Game.Style.check('As you enter, the room goes quiet.'),
      simileCasual: Game.Style.check('He grins like a man who just won.', { style: 'casual' }),
      asIfCasual: Game.Style.check('She looks at you as if you owe her.', { style: 'casual' }),
      simileLiterary: Game.Style.check('He grins like a man who just won.', { style: 'literary' }),
      simileDefault: Game.Style.check('He grins like an old dog.'),
      dialogue: Game.Style.check('"I\'d like a beer," she says. He nods.', { style: 'casual' }),
      curlyDialogue: Game.Style.check('“Act as if you live here,” she says.', { style: 'casual' })
    }
  }));
  // Literary: SPEC section 9, word for word, and the modern three examples.
  assert.equal(r.lit, block);
  assert.deepEqual(r.exLit, MODERN_EXAMPLES);
  // Casual: the same sections, the same NEVER rules and banned list, a plain voice and more to avoid.
  const SECTION = /^(LENGTH|VOICE|DIALOGUE|NEVER|BANNED PHRASES|Also avoid):/;
  const sections = g => g.split('\n').filter(l => SECTION.test(l)).map(l => l.split(':')[0]);
  assert.deepEqual(sections(r.cas), ['LENGTH', 'VOICE', 'DIALOGUE', 'NEVER', 'BANNED PHRASES', 'Also avoid']);
  assert.deepEqual(sections(r.cas), sections(r.lit));
  const never = g => g.split('\n').filter(l => l.startsWith('- '));
  assert.equal(never(r.lit).length, 6);
  assert.deepEqual(never(r.cas), never(r.lit), 'the same NEVER lines');
  const lineOf = (g, head) => g.split('\n').find(l => l.startsWith(head));
  assert.equal(lineOf(r.cas, 'BANNED PHRASES:'), lineOf(r.lit, 'BANNED PHRASES:'), 'the full banned list');
  for (const b of r.banned) assert.ok(r.cas.includes(`"${b}"`), 'casual bans ' + b);
  assert.equal(lineOf(r.cas, 'LENGTH:'), lineOf(r.lit, 'LENGTH:'));
  // The casual DIALOGUE line keeps the spec's sentences and adds that a listed habit is occasional, not a script.
  for (const part of ['NPCs speak in their listed voice', 'People interrupt, dodge questions, lie, change the subject.', 'Prefer a line of dialogue over a line of description.']) assert.ok(lineOf(r.cas, 'DIALOGUE:').includes(part), 'casual dialogue keeps: ' + part);
  assert.ok(/habit is a flavour, not a script/.test(lineOf(r.cas, 'DIALOGUE:')), 'casual dialogue says habits are occasional');
  assert.equal(lineOf(r.cas, 'VOICE:'), CASUAL_VOICE);
  const avoid = lineOf(r.cas, 'Also avoid:');
  for (const x of ['"like a ..."', '"as if ..."', 'stacked adjectives', 'poetic fragments', 'lists of three adjectives', 'rhetorical questions', 'starting with "As you"']) assert.ok(avoid.includes(x), 'casual also avoids ' + x);
  assert.notEqual(r.cas, r.lit);
  // Casual examples: the same three scenes, plain, no simile, not the literary text.
  assert.equal(r.exCas.length, 3);
  r.exCas.forEach((t, i) => {
    assert.equal(t.input, r.exLit[i].input);
    assert.equal(t.context, r.exLit[i].context);
    assert.notEqual(t.narration, r.exLit[i].narration);
    assert.doesNotMatch(t.narration.replace(/"[^"]*"/g, ' '), /\b(like an?|as if)\b/i, 'no simile: ' + t.input);
    const words = t.narration.split(/\s+/).length;
    const want = r.exLit[i].narration.split(/\s+/).length;
    assert.ok(Math.abs(words - want) <= 10, `about as long as the literary example (${words} vs ${want})`);
  });
  for (const t of r.exLit.concat(r.exCas)) assert.ok(!sec.includes(t.narration), 'not the SPEC original: ' + t.input);
  const town = await page.evaluate(() => [Game.data.TOWN_DATA.name].concat(Game.data.TOWN_DATA.npcs.flatMap(n => n.name.split(' ')), Game.data.TOWN_DATA.locations.map(l => l.name.replace(/^The /, ''))));
  for (const t of r.exLit.concat(r.exCas)) for (const w of town) assert.ok(!(t.input + t.context + t.narration).includes(w), 'example names a person or place in this town: ' + w);
  // System prompts: one per style, each its guide then that style's examples only; casual by default.
  assert.deepEqual(r.styles, ['casual', 'literary']);
  assert.equal(r.setting, 'casual');
  assert.equal(r.current, 'casual');
  assert.ok(r.pLit.startsWith(block));
  assert.ok(r.pCas.startsWith(r.cas + '\n\n'));
  for (const t of r.exLit) { assert.ok(promptHas(r.pLit, t), 'literary example in the literary prompt'); assert.ok(!promptHas(r.pCas, t), 'no literary example in the casual prompt'); }
  for (const t of r.exCas) { assert.ok(promptHas(r.pCas, t), 'casual example in the casual prompt'); assert.ok(!promptHas(r.pLit, t), 'no casual example in the literary prompt'); }
  for (const p of [r.pLit, r.pCas]) assert.ok(p.includes('EXAMPLES (from a different town; none of these people or places exist in this game):'));
  assert.equal(r.pLit, r.pLit2, 'byte-identical for caching');
  assert.equal(r.pCas, r.pCas2, 'byte-identical for caching');
  assert.equal(r.pDefault, r.pCas, 'the default is casual');
  assert.equal(r.banned.length, 20);
  // The code-side checks; the simile check is casual only and skips dialogue.
  const c = r.checks;
  assert.ok(c.clean.ok);
  assert.ok(!c.banned.ok && !c.curly.ok && !c.long.ok && !c.menu.ok && !c.asYou.ok);
  assert.ok(c.zoom.ok, 'zoom allows up to 150 words');
  assert.deepEqual(c.simileCasual.problems.map(p => p.type), ['simile']);
  assert.match(c.simileCasual.problems[0].detail, /like a/);
  assert.deepEqual(c.asIfCasual.problems.map(p => p.type), ['simile']);
  assert.ok(c.simileLiterary.ok, 'literary allows a simile');
  assert.ok(!c.simileDefault.ok, 'the default style (casual) checks for similes');
  assert.ok(c.dialogue.ok, 'a "like a" inside dialogue is not a simile');
  assert.ok(c.curlyDialogue.ok, 'nor inside curly quotes');
});

s.test('the narrator system prompt follows the Narration style setting and is byte-identical across turns for each style', async h => {
  const page = await h.open();
  await quickStart(page);
  await page.evaluate(() => {
    Game.Api.Mock.delay = 0;
    window.__sys = [];
    const narrate = Game.Api.Mock.narrate;
    Game.Api.Mock.narrate = function (packet) { window.__sys.push(packet.system); return narrate.apply(this, arguments); };
  });
  const turn = async t => { await page.fill('#cmd', t); await page.press('#cmd', 'Enter'); await page.waitForFunction(() => !Game.Pipeline.busy); };
  await turn('I look around');
  await turn('I ask about work');
  // Switch in the Settings screen, as a player would.
  await page.evaluate(() => Game.UI.showScreen('settings'));
  assert.ok(await page.isChecked('input[name="set-style"][value="casual"]'), 'casual is ticked by default');
  await page.check('input[name="set-style"][value="literary"]');
  await page.click('#settings-done');
  await page.waitForSelector('#screen-game.active');
  await turn('I look around again');
  await turn('I ask about the bridge');
  const r = await page.evaluate(() => ({ sys: window.__sys, cas: Game.Style.systemPrompt('casual'), lit: Game.Style.systemPrompt('literary'), setting: Game.Storage.settings().narrationStyle, saved: JSON.parse(localStorage.getItem('novatria.settings')).narrationStyle }));
  assert.equal(r.setting, 'literary');
  assert.equal(r.saved, 'literary', 'the style is saved with the settings');
  assert.equal(r.sys.length, 4);
  assert.equal(r.sys[0], r.cas);
  assert.equal(r.sys[1], r.sys[0], 'casual: byte-identical across two turns');
  assert.equal(r.sys[2], r.lit);
  assert.equal(r.sys[3], r.sys[2], 'literary: byte-identical across two turns');
  assert.notEqual(r.sys[0], r.sys[2], 'the prompt switched with the setting');
  // A bad value reads as the default, casual; the settings version is untouched.
  const st = await page.evaluate(() => [Game.Storage.saveSettings({ narrationStyle: 'purple' }).narrationStyle, Game.Storage.settings().settingsVersion, Game.Style.current()]);
  assert.deepEqual(st, ['casual', 3, 'casual']);
});

s.test('Api exposes the provider interface and builds requests per API_NOTES', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const A = Game.Api;
    const narr = A.requestBody('narrator', { system: 'S', user: 'U', cache: true, stream: true });
    const book = A.requestBody('bookkeeper', { system: 'B', user: 'U', schema: { type: 'object', properties: {}, additionalProperties: false } });
    Game.Storage.saveSettings({ effort: { parser: 'medium' }, parserModel: 'claude-opus-5-5' });
    const parse = A.requestBody('parser', { user: 'U' });
    const deltas = [];
    const packet = Game.Pipeline.parsePacket('I look around');
    const parsed = await A.parse(packet);
    const n = await A.narrate({ text: 'x', context: { locationName: 'Here' } }, (c, all) => deltas.push(all));
    const b = await A.bookkeep({ action: parsed });
    const c = await A.chronicle([{ turn: 1 }, { turn: 10 }]);
    return {
      fns: ['parse', 'narrate', 'bookkeep', 'chronicle'].map(f => typeof A[f]),
      narr, book, parse, headers: A.headers('k'), endpoint: A.ENDPOINT,
      parsed, n, deltas: deltas.length, b, c, cost: A.costOf('claude-sonnet-5-5', { input: 1e6, output: 1e6, cacheRead: 1e6, cacheCreation: 0 }), unknownCost: A.costOf('mystery', { input: 1, output: 1, cacheRead: 0, cacheCreation: 0 })
    };
  });
  assert.deepEqual(r.fns, ['function', 'function', 'function', 'function']);
  assert.equal(r.endpoint, 'https://api.anthropic.com/v1/messages');
  assert.deepEqual(r.headers, { 'content-type': 'application/json', 'x-api-key': 'k', 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' });
  for (const body of [r.narr, r.book, r.parse]) {
    for (const banned of ['temperature', 'top_p', 'top_k', 'thinking', 'tools', 'tool_choice']) assert.ok(!(banned in body), banned);
    assert.equal(body.messages[body.messages.length - 1].role, 'user');
  }
  assert.equal(r.narr.model, 'claude-opus-5-5');
  assert.equal(r.narr.max_tokens, 3000);
  assert.equal(r.narr.stream, true);
  assert.deepEqual(r.narr.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(r.narr.output_config, { effort: 'medium' });
  assert.equal(r.book.model, 'claude-sonnet-5-5');
  assert.equal(r.book.max_tokens, 4000);
  assert.equal(r.book.output_config.format.type, 'json_schema');
  assert.equal(r.parse.model, 'claude-opus-5-5');
  assert.equal(r.parse.output_config.effort, 'medium');
  assert.equal(r.parsed.actionType, 'look');
  assert.equal(typeof r.n.text, 'string');
  assert.ok(r.deltas > 1, 'mock narration streams in pieces');
  assert.ok('playerLocationId' in r.b && 'journalEntry' in r.b);
  assert.equal(typeof r.c, 'string');
  assert.equal(r.cost, 12.2);
  assert.equal(r.unknownCost, null);
});

s.test('a State batch tells the listeners once, when the outermost batch closes; a change outside a batch tells them at once', async h => {
  const page = await h.open();
  await quickStart(page);
  const seen = await page.evaluate(() => {
    const S = Game.State;
    let n = 0;
    S.onChange(() => { n += 1; });
    const out = [];
    S.apply({ goldDelta: 1 }); out.push(n);
    S.beginBatch();
    S.apply({ goldDelta: 1 });
    S.beginBatch();
    S.apply({ hpDelta: -1 });
    S.endBatch(); out.push(n); // nested: still open
    S.apply({ goldDelta: 1 }); out.push(n);
    S.endBatch(); out.push(n); // closed: one notification for all three
    S.beginBatch(); S.endBatch(); out.push(n); // nothing changed: none
    return out;
  });
  assert.deepEqual(seen, [1, 1, 1, 2, 2]);
});

s.test('effect ops, reserved flags and social actions each live in one list: Town.validate and tests/validate-town.cjs follow State and Dice', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const G = Game;
    const T = JSON.parse(JSON.stringify(G.data.TOWN_DATA));
    const base = G.Town.validate(T);
    const effs = T.factions[0].clocks[0].onComplete.effects;
    effs.push({ op: 'frobnicate' });
    G.State.RESERVED_FLAGS.forEach(k => effs.push({ op: 'setFlag', key: k, value: 1 }));
    // A seed's effects are checked the same way (direction change 14).
    const sd = T.seeds[0];
    sd.effects = (sd.effects || []).concat([{ op: 'frobnicate' }, { op: 'visit', npcId: 'npc_nobody', locationId: T.locations[0].id }, { op: 'placeItem', locationId: T.locations[0].id, item: {} }]);
    return { ops: G.State.EFFECT_OPS.slice(), townOps: G.Town.EFFECT_OPS.slice(), flags: G.State.RESERVED_FLAGS.slice(), social: G.Dice.SOCIAL_ACTIONS.slice(), base, errs: G.Town.validate(T), seedId: sd.id };
  });
  assert.deepEqual(r.base, []);
  assert.deepEqual(r.townOps, r.ops, 'Town uses State.EFFECT_OPS');
  assert.ok(r.ops.length >= 15 && r.ops.includes('setFlag') && r.ops.includes('reputationDelta') && r.ops.includes('visit') && r.ops.includes('placeItem'));
  assert.ok(r.errs.some(e => /unknown op frobnicate/.test(e)));
  assert.ok(r.errs.some(e => e.startsWith(`${r.seedId}.effects[`) && /unknown op frobnicate/.test(e)), 'a seed\'s unknown op');
  assert.ok(r.errs.some(e => e.startsWith(`${r.seedId}.effects[`) && /unknown npc npc_nobody/.test(e)), 'a seed\'s unknown person');
  assert.ok(r.errs.some(e => e.startsWith(`${r.seedId}.effects[`) && /placeItem needs an item with a name/.test(e)), 'a seed\'s nameless thing');
  for (const k of r.flags) assert.ok(r.errs.some(e => e.includes(`flag ${k} is reserved`)), 'reserved: ' + k);
  // tests/validate-town.cjs: its op table names exactly State's ops, and it reads the reserved flags from index.html.
  const src = fs.readFileSync(path.join(ROOT, 'tests', 'validate-town.cjs'), 'utf8');
  const m = /\nconst OPS = (\{[\s\S]*?\n\});/.exec(src);
  assert.ok(m, 'validate-town.cjs has an OPS table');
  assert.deepEqual(Object.keys(vm.runInNewContext('(' + m[1] + ')')).sort(), r.ops.slice().sort());
  assert.doesNotMatch(src, /const RESERVED_FLAGS = \[/, 'no list of its own');
  // The page source lists the social actions once (Dice), and the flags once (State).
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const count = needle => html.split(needle).length - 1;
  assert.equal(count(`['${r.social.join("', '")}']`), 1, 'social actions');
  assert.equal(count(`['${r.flags.join("', '")}']`), 1, 'reserved flags');
});

s.test('Style.check flags a spoken phrase repeated from a recent turn and the rewrite note asks for plain words', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const S = Game.Style;
    const prev = ['Royce laughs. "My daddy used to say a man who asks is a man who pays." He wipes the counter.'];
    const again = S.check('He shrugs. "Well, my daddy used to say the same thing."', { previous: prev });
    const fresh = S.check('He shrugs. "Forty-five dollars gets you a cot at the motor court."', { previous: prev });
    const filler = S.check('"I do not know what you want."', { previous: ['"I do not know what to tell you."'] });
    const narrationOnly = S.check('He says my daddy used to say that, and laughs.', { previous: prev });
    return { again: again.problems.map(p => p.type), phrase: again.problems[0] && again.problems[0].phrase, fresh: fresh.ok, filler: filler.ok, narrationOnly: narrationOnly.ok, note: S.regenerationNote(again.problems) };
  });
  assert.deepEqual(r.again, ['repeat']);
  assert.equal(r.phrase, 'my daddy used to');
  assert.equal(r.fresh, true, 'new words pass');
  assert.equal(r.filler, true, 'a phrase of filler words does not count');
  assert.equal(r.narrationOnly, true, 'only spoken lines count');
  assert.match(r.note, /repeats the spoken phrase "my daddy used to"/);
  assert.match(r.note, /different words this time/);
});

s.test('memories: the model gets one per person per turn (heavier replaces lighter), text is short, trivial ones fade and serious ones survive the cap', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const S = Game.State; const G = Game.data; const bg = G.BACKGROUNDS[0];
    Game.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'x', flaw: G.FLAWS[0], looseEnds: [] }, { seed: 7 });
    const n = Game.state.npcs[0];
    S.apply({ beginTurn: true });
    const a = S.apply({ newMemories: [{ npcId: n.id, text: 'flirted with me', weight: 1 }] }, { source: 'model' });
    const b = S.apply({ newMemories: [{ npcId: n.id, text: 'asked about the weather and then the bridge and the vote and the keys', weight: 1 }] }, { source: 'model' });
    const c = S.apply({ newMemories: [{ npcId: n.id, text: 'told me to fuck off', weight: 3 }] }, { source: 'model' });
    const afterTurn = n.memories.map(m => m.text + '|' + m.weight);
    const long = 'Remembers: ' + 'said he needed help with his car and asked me to come look and I walked out to the lot with him and stood there '.repeat(2);
    S.apply({ beginTurn: true });
    S.apply({ newMemories: [{ npcId: n.id, text: long, weight: 2 }] }, { source: 'model' });
    const trimmed = n.memories[n.memories.length - 1].text;
    // Fill past the cap with small engine memories over many turns; the serious one must survive, the oldest small ones go.
    for (let i = 0; i < 20; i++) { S.apply({ beginTurn: true }); S.apply({ newMemories: [{ npcId: n.id, text: 'small thing ' + i, weight: 1 }] }); }
    const picked = Game.Pipeline.pickMemories(n.memories, Game.state.meta.turn, { w3: 3, w2: 2, w1: 1, recent: 10, cap: 5 }).map(m => m.text);
    return { a: a.rejected.length, b: b.rejected.map(x => x.reason), c: c.rejected.length, afterTurn, trimmed, count: n.memories.length, hasSerious: n.memories.some(m => m.text === 'told me to fuck off'), picked };
  });
  assert.equal(r.a, 0);
  assert.match(r.b[0] || '', /one per person per turn/, 'a second light memory in the same turn is dropped');
  assert.equal(r.c, 0, 'a heavier one replaces the light one');
  assert.deepEqual(r.afterTurn, ['told me to fuck off|3']);
  assert.ok(r.trimmed.length <= 120 && !/^Remembers:/i.test(r.trimmed), 'trimmed to a short line: ' + r.trimmed);
  assert.ok(r.count <= 12, 'capped at 12: ' + r.count);
  assert.equal(r.hasSerious, true, 'the serious memory survives the cap');
  assert.ok(r.picked.includes('told me to fuck off') && r.picked.length <= 5, 'the narrator sees the serious one however old: ' + r.picked.join(' / '));
});

/* placesRevealed: a place someone named becomes a real place. The owner is a
   person with at least one phase in which no schedule holds them; the place
   is reached from where the player stands. */
const revealSetup = page => page.evaluate(() => {
  const st = Game.state;
  const phases = ['morning', 'afternoon', 'evening', 'night'];
  const nowhere = id => phases.filter(p => !st.locations.some(l => ((l.npcIdsBySchedule || {})[p] || []).includes(id)));
  const first = n => n.name.split(' ')[0];
  const owner = st.npcs.find(n => n.status === 'free' && nowhere(n.id).length > 0 && nowhere(n.id).length < 4 && st.npcs.filter(m => first(m) === first(n)).length === 1);
  const speaker = st.npcs.find(n => n.id !== owner.id);
  return { here: st.player.locationId, owner: { id: owner.id, name: owner.name, first: first(owner), nowhere: nowhere(owner.id) }, speaker: speaker.id, locs: st.locations.length };
});
const revealEntry = (x, over) => Object.assign({ name: `${x.owner.first}'s house`, type: 'house', description: 'The white house about a mile up the river road, on the left.', nearId: x.here, ownerNpcId: x.owner.id, kind: 'home' }, over || {});

s.test('placesRevealed: the place is created with a road both ways, a spot on the map clear of every marker, its owner home in their free phases, and the revealed record', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, entry]) => {
    const S = Game.State;
    S.apply({ beginTurn: true });
    const res = S.apply({ placesRevealed: [Object.assign({ byNpcId: x.speaker }, entry)] }, { source: 'model' });
    const id = (res.revealed || [])[0];
    const l = id ? S.loc(id) : null;
    const map = Game.data.TOWN_DATA.map;
    const pts = Game.state.locations.filter(o => o.id !== id).map(o => S.mapPointOf(o)).filter(Boolean);
    return {
      res, l: l && JSON.parse(JSON.stringify(l)), nearExits: S.loc(x.here).exits, W: map.width, H: map.height,
      minDist: l && l.map ? Math.min(...pts.map(p => Math.hypot(p.x - l.map.x, p.y - l.map.y))) : null,
      home: S.npc(x.owner.id).home, atHome: ['morning', 'afternoon', 'evening', 'night'].filter(p => S.npcsAt(id, p).some(n => n.id === x.owner.id)),
      day: Game.state.time.day, turn: Game.state.meta.turn, discovered: Game.Pipeline.parsePacket('I look around').knownLocations.some(k => k.id === id)
    };
  }, [x, revealEntry(x)]);
  assert.deepEqual(r.res.rejected, []);
  assert.equal(r.res.applied.length, 1);
  assert.match(r.res.applied[0], new RegExp(`^placesRevealed\\[0\\]: loc_${x.owner.first.toLowerCase()}s_house \\(${x.owner.first}'s house\\) reached from ${x.here}; home of ${x.owner.id} \\(there ${x.owner.nowhere.join(', ')}\\); on the map at \\d+,\\d+$`), 'a readable line: ' + r.res.applied[0]);
  const l = r.l;
  assert.equal(l.id, `loc_${x.owner.first.toLowerCase()}s_house`);
  assert.equal(l.name, `${x.owner.first}'s house`);
  assert.equal(l.type, 'house');
  assert.deepEqual(l.exits, [x.here]);
  assert.ok(r.nearExits.includes(l.id), 'the exit is symmetric');
  assert.equal(l.discovered, true);
  assert.equal(l.closed, false);
  assert.deepEqual(l.items, []);
  assert.ok(r.discovered, 'the parser hears of it with the other places');
  // Map: inside the bounds (with the map's margins), at least 28 from every other marker, a 1-3 word label and a side.
  assert.ok(l.map.x >= 24 && l.map.x <= r.W - 24 && l.map.y >= 20 && l.map.y <= r.H - 20, 'inside the map: ' + JSON.stringify(l.map));
  assert.ok(r.minDist >= 28, 'clear of every marker: ' + r.minDist);
  assert.ok(l.map.label.split(' ').length <= 3 && ['n', 's', 'e', 'w'].includes(l.map.anchor), JSON.stringify(l.map));
  // The owner: home set, and there in every phase no schedule held them, and nowhere else changed.
  assert.deepEqual(r.atHome, x.owner.nowhere);
  assert.deepEqual(r.home, { locationId: l.id, phases: x.owner.nowhere, revealed: true });
  assert.deepEqual(l.revealed, { turn: r.turn, day: r.day, byNpcId: x.speaker, ownerNpcId: x.owner.id, kind: 'home', visited: false });
  // The first visit makes it an ordinary place.
  await page.evaluate(id => Game.State.apply({ playerLocationId: id }), l.id);
  assert.equal(await page.evaluate(id => Game.State.loc(id).revealed.visited, l.id), true);
  // A revealed home survives an arrest and release: they are home again in its phases.
  const back = await page.evaluate(([id, owner]) => {
    Game.State.apply({ effects: [{ op: 'npcStatus', npcId: owner, status: 'arrested' }, { op: 'npcStatus', npcId: owner, status: 'free' }] });
    return ['morning', 'afternoon', 'evening', 'night'].filter(p => Game.State.npcsAt(id, p).some(n => n.id === owner));
  }, [l.id, x.owner.id]);
  assert.deepEqual(back, x.owner.nowhere);
});

s.test('placesRevealed refuses a place already in town under any form of its name, an unknown or undiscovered nearId, an unknown owner and a bad name; one a turn from the model, twelve a game', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, entry]) => {
    const S = Game.State;
    const T = Game.data.TOWN_DATA;
    const try1 = (over, source) => { const res = S.apply({ placesRevealed: [Object.assign({}, entry, over)] }, { source: source || 'engine' }); return res.rejected.length ? res.rejected[0].reason : 'ok'; };
    S.apply({ beginTurn: true });
    const out = { first: try1({}) };
    const f = x.owner.first;
    out.dupes = [`${f}'s`, `the ${f}'s house`, `${f}s house`, `${f.toUpperCase()}'S PLACE`, `${f}s`].map(name => [name, try1({ name, ownerNpcId: null, kind: 'spot' })]);
    // A town place by its name with "the", in another case, and by its map label.
    const t0 = T.locations[0];
    out.town = [`the ${t0.name.toLowerCase()}`, t0.name.toUpperCase().replace(/^THE /, '')].concat(t0.map && t0.map.label ? [t0.map.label] : []).map(name => [name, try1({ name, ownerNpcId: null, kind: 'spot' })]);
    const house = T.locations.find(l => / House$/.test(l.name));
    out.house = house ? [house.name, try1({ name: house.name.replace(/ House$/, "'s"), ownerNpcId: null, kind: 'spot' })] : null;
    out.near = try1({ name: 'The Feed Store', nearId: 'loc_nowhere', ownerNpcId: null, kind: 'business' });
    S.apply({ addLocations: [{ id: 'loc_hidden_yard', name: 'Hidden Yard', type: 'yard', description: 'x', exits: [x.here], discovered: false }] });
    out.undiscovered = try1({ name: 'The Feed Store', nearId: 'loc_hidden_yard', ownerNpcId: null, kind: 'business' });
    out.owner = try1({ name: 'The Feed Store', ownerNpcId: 'npc_nobody', kind: 'business' });
    out.short = try1({ name: 'x', ownerNpcId: null });
    out.long = try1({ name: 'The very long name of a place that goes on and on', ownerNpcId: null });
    out.noDesc = try1({ name: 'The Feed Store', description: '  ', ownerNpcId: null });
    // The model: one a turn; the next turn another.
    S.apply({ beginTurn: true });
    out.m1 = try1({ name: 'The Feed Store', ownerNpcId: null, kind: 'business', type: 'shop' }, 'model');
    out.m2 = try1({ name: 'The Bait Shack', ownerNpcId: null, kind: 'business', type: 'shop' }, 'model');
    S.apply({ beginTurn: true });
    out.m3 = try1({ name: 'The Bait Shack', ownerNpcId: null, kind: 'business', type: 'shop' }, 'model');
    // The engine is not held to one a turn, but nobody gets past twelve in a game.
    const near = Game.state.locations.filter(l => l.discovered && !l.revealed).map(l => l.id);
    const more = [];
    for (let i = 0; i < 12; i++) more.push(try1({ name: `Spot number ${i + 1}`, type: 'spot', nearId: near[i % near.length], ownerNpcId: null, kind: 'spot' }));
    out.more = more;
    out.count = Game.state.locations.filter(l => l.revealed).length;
    return out;
  }, [x, revealEntry(x)]);
  assert.equal(r.first, 'ok');
  for (const [name, why] of r.dupes) assert.match(why, /^already a place: loc_/, `"${name}" is the same place: ${why}`);
  for (const [name, why] of r.town) assert.match(why, /^already a place: loc_/, `"${name}" is a town place: ${why}`);
  if (r.house) assert.match(r.house[1], /^already a place/, `${r.house[0]} by its owner's name`);
  assert.match(r.near, /unknown location id "loc_nowhere"/);
  assert.match(r.undiscovered, /loc_hidden_yard is not a place the player knows/);
  assert.match(r.owner, /unknown npc id "npc_nobody"/);
  assert.match(r.short, /name must be 2 to 40 characters/);
  assert.match(r.long, /name must be 2 to 40 characters/);
  assert.match(r.noDesc, /needs a description/);
  assert.equal(r.m1, 'ok');
  assert.match(r.m2, /at most 1 new place a turn/);
  assert.equal(r.m3, 'ok', 'a new turn, a new place');
  // Three made so far (the house, the feed store, the bait shack): nine more fit under twelve, then no more.
  assert.deepEqual(r.more.slice(0, 9), Array(9).fill('ok'));
  assert.ok(r.more.slice(9).every(w => /at most 12 places people told you about in one game/.test(w)), r.more.slice(9).join(' | '));
  assert.equal(r.count, 12);
});

s.test('a model diff may carry placesRevealed (validated like the rest); an unknown key still cannot; turn and day come only from the engine', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, entry]) => {
    const S = Game.State;
    S.apply({ beginTurn: true });
    S.apply({ beginTurn: true });
    const res = S.apply({ placesRevealed: [Object.assign({}, entry, { turn: 0, day: 1, type: 'MANSION' })], madeUpPlaces: [] }, { source: 'model' });
    const l = res.revealed ? S.loc(res.revealed[0]) : null;
    return { keys: S.RECORD_KEYS.includes('placesRevealed') && !S.ENGINE_KEYS.includes('placesRevealed'), res, revealed: l && l.revealed, type: l && l.type, turn: Game.state.meta.turn,
      schema: Game.Api.SCHEMAS.record_changes.required.includes('placesRevealed') };
  }, [x, revealEntry(x)]);
  assert.ok(r.keys, 'a record_changes field');
  assert.ok(r.schema, 'in the bookkeeper schema');
  assert.equal(r.res.applied.length, 1);
  assert.deepEqual(r.res.rejected, [{ path: 'madeUpPlaces', reason: 'unknown field' }]);
  assert.equal(r.revealed.turn, r.turn, 'the model cannot backdate it');
  assert.equal(r.type, 'other', 'a type outside the list becomes other');
});

/* People match the story (rules version 5): pronouns on every person, and
   people the story names becoming real (peopleRevealed). */
s.test('pronouns: every town person has them, matching their look; the tables, loose ends and addNpcs give everyone one; a save without them gets them at load', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt', 'enemy', 'secret'] });
  const r = await page.evaluate(() => {
    const G = Game;
    const T = G.data.TOWN_DATA;
    const st = G.state;
    const infer = ['A woman in a red coat', "Dewayne's wife", 'her husband', 'his wife', 'the night clerk', 'A man with a bitter look about them.', 'mother of two', 'an old guy', 'she said so'].map(G.inferPronouns);
    // The tables: someone known to be she gets a first name that fits and a look in her words; a name or a role decides when nothing else does.
    const women = Array.from({ length: 30 }, (_, i) => G.Tables.npc({ noun: 'woman' }, G.Rng.create(i + 1)));
    const men = Array.from({ length: 30 }, (_, i) => G.Tables.npc({ role: 'husband of the cook' }, G.Rng.create(i + 1)));
    const anyone = Array.from({ length: 30 }, (_, i) => G.Tables.npc({}, G.Rng.create(i + 1)));
    G.State.apply({ addNpcs: [
      { id: 'npc_test_a', name: 'Test A', role: 'cook', look: 'A tall woman in an apron.' },
      { id: 'npc_test_b', name: 'Earl Test', role: 'cook', look: 'Tall, in an apron.' },
      { id: 'npc_test_c', name: 'Sam Test', role: 'cook' },
      { id: 'npc_test_e', name: 'Sam Other', role: 'cook', pronouns: 'she' }
    ] });
    const bad = G.State.apply({ addNpcs: [{ id: 'npc_test_d', name: 'Dee', pronouns: 'it' }] }).rejected.map(x => x.reason);
    const added = ['a', 'b', 'c', 'e'].map(k => G.State.npc('npc_test_' + k).pronouns);
    // An older save: no pronouns anywhere, not even in its own town data, and a person the tables made as a man.
    const env = G.Storage.envelope('old');
    for (const n of env.state.npcs) delete n.pronouns;
    for (const n of env.town.npcs) delete n.pronouns;
    env.state.npcs.push({ id: 'npc_old_one', name: 'Mavis Toler', role: 'Man', factionId: null, tags: [], look: 'A man with a bitter look about them.', voice: 'x', personality: ['bitter', 'shy'], goal: 'x', secret: '', attitude: -10, memories: [], alive: true, knownToPlayer: true, status: 'free' });
    G.State.load(env.state, env.town);
    const loaded = G.state.npcs.map(n => [n.id, n.pronouns]);
    return {
      town: T.npcs.map(n => ({ id: n.id, pronouns: n.pronouns, look: n.look })), inState: st.npcs.map(n => [n.id, n.pronouns, n.look]),
      looseIds: st.player.looseEnds.filter(le => le.created).map(le => le.npcId),
      infer, women: women.map(n => [n.pronouns, n.name, n.look, G.namePronouns(n.name)]), men: men.map(n => [n.pronouns, G.namePronouns(n.name)]),
      anyone: anyone.map(n => [n.pronouns, G.namePronouns(n.name), n.look]),
      added, bad, loaded, label: [G.pronounLabel('she'), G.pronounLabel('he'), G.pronounLabel('they'), G.pronounLabel(undefined)]
    };
  });
  for (const n of r.town) {
    assert.ok(['he', 'she', 'they'].includes(n.pronouns), n.id);
    if (/\bwoman\b/i.test(n.look)) assert.equal(n.pronouns, 'she', n.id + ': ' + n.look);
    if (/\bman\b/i.test(n.look)) assert.equal(n.pronouns, 'he', n.id + ': ' + n.look);
  }
  for (const n of r.town) assert.equal(r.inState.find(x => x[0] === n.id)[1], n.pronouns, 'a new game carries the town pronouns: ' + n.id);
  assert.deepEqual(r.looseIds, [], 'a loose end makes nobody: it is someone in the cast, with the cast\'s pronouns');
  assert.deepEqual(r.infer, ['she', 'she', 'he', 'she', 'they', 'he', 'she', 'he', 'she']);
  for (const [p, name, look, byName] of r.women) {
    assert.equal(p, 'she');
    assert.notEqual(byName, 'he', 'a first name that fits: ' + name);
    assert.match(look, /^A woman with an? .+ look about her\.$/, look);
  }
  for (const [p, byName] of r.men) { assert.equal(p, 'he'); assert.notEqual(byName, 'she'); }
  for (const [p, byName, look] of r.anyone) {
    assert.equal(p, byName || 'they', 'nothing else said: the name decides');
    assert.ok(look.endsWith(`look about ${{ he: 'him', she: 'her', they: 'them' }[p]}.`), look);
  }
  assert.deepEqual(r.added, ['she', 'he', 'they', 'she'], 'addNpcs: the pronouns given, else the look, else the first name, else they');
  assert.match(r.bad[0], /pronouns must be he, she or they/);
  for (const n of r.town) assert.equal(r.loaded.find(x => x[0] === n.id)[1], n.pronouns, 'loaded: the town pronouns for ' + n.id);
  assert.equal(r.loaded.find(x => x[0] === 'npc_old_one')[1], 'he', 'loaded: a man by his look and role, until the story says otherwise');
  assert.ok(r.loaded.every(x => ['he', 'she', 'they'].includes(x[1])), 'everyone has pronouns after a load');
  assert.deepEqual(r.label, ['she/her', 'he/him', 'they/them', 'they/them']);
});

const PHASES4 = ['morning', 'afternoon', 'evening', 'night'];
const wifeOf = (x, over) => Object.assign({ name: `${x.owner.first}'s wife`, unnamed: true, pronouns: 'she', role: `${x.owner.first}'s wife`, look: '', relationToNpcId: x.owner.id, relation: 'wife', locationId: null, kind: 'relative' }, over || {});

s.test('peopleRevealed: an unnamed wife shares her husband\'s house in every phase; named later, the same record is renamed; repeats, a second wife, a taken name and bad entries are refused; one a turn from the model, twelve a game', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, house, wife, PH]) => {
    const S = Game.State;
    const st = Game.state;
    const reveal = (e, source) => S.apply({ peopleRevealed: [e] }, { source: source || 'model' });
    const why = res => (res.rejected.length ? res.rejected[0].reason : 'ok');
    const count0 = st.npcs.length;
    S.apply({ beginTurn: true });
    S.apply({ placesRevealed: [house] });
    const houseId = st.locations.find(l => l.revealed).id;
    const r1 = reveal(wife);
    const turn1 = st.meta.turn;
    const id = r1.people && r1.people[0].id;
    const n1 = JSON.parse(JSON.stringify(S.npc(id)));
    const home1 = PH.filter(p => S.npcsAt(houseId, p).some(n => n.id === id));
    S.apply({ beginTurn: true });
    const again = why(reveal(Object.assign({}, wife, { name: `${x.owner.first}s wife` })));
    S.apply({ beginTurn: true });
    const r2 = reveal(Object.assign({}, wife, { name: 'Mavis Toler', unnamed: false, look: 'A small woman with a tired smile.', role: '' }));
    const n2 = JSON.parse(JSON.stringify(S.npc(id)));
    const out = { id, r1, n1, home1, houseId, again, r2, n2, count: st.npcs.length - count0, turn: turn1, day: st.time.day };
    S.apply({ beginTurn: true });
    out.second = why(reveal(Object.assign({}, wife, { name: 'Linda Toler', unnamed: false })));
    out.taken = why(reveal({ name: 'Mavis', unnamed: false, pronouns: 'she', role: 'a woman', look: '', relationToNpcId: null, relation: null, locationId: null, kind: 'other' }));
    out.town = why(reveal({ name: x.owner.name, unnamed: false, pronouns: 'he', role: 'someone', look: '', relationToNpcId: null, relation: null, locationId: null, kind: 'other' }));
    const base = { name: 'Earl Hux', unnamed: false, pronouns: 'he', role: 'trucker', look: '', relationToNpcId: null, relation: null, locationId: x.here, kind: 'worker' };
    out.badPronouns = why(reveal(Object.assign({}, base, { pronouns: 'it' })));
    out.short = why(reveal(Object.assign({}, base, { name: 'x' })));
    out.long = why(reveal(Object.assign({}, base, { name: 'Earl Hux the third of that name from up the river' })));
    out.noTarget = why(reveal(Object.assign({}, base, { relationToNpcId: 'npc_nobody', relation: 'cousin' })));
    out.noPlace = why(reveal(Object.assign({}, base, { locationId: 'loc_nowhere' })));
    out.noRelation = why(reveal(Object.assign({}, base, { name: 'His cousin', unnamed: true })));
    out.m1 = why(reveal(base));
    out.m2 = why(reveal(Object.assign({}, base, { name: 'Faye Hux', pronouns: 'she' })));
    const earl = st.npcs.find(n => n.name === 'Earl Hux');
    out.earl = { scheduled: st.locations.some(l => PH.some(p => (l.npcIdsBySchedule[p] || []).includes(earl.id))), where: Game.World.whereIs(earl.id), created: earl.created, tags: earl.tags, known: earl.knownToPlayer };
    // The engine is not held to one a turn, but twelve a game is the most.
    const more = [];
    for (let i = 0; i < 12; i++) more.push(why(reveal(Object.assign({}, base, { name: `Hux Number${i + 1}`, locationId: null }), 'engine')));
    out.more = more;
    out.story = st.npcs.filter(n => n.created && n.created.by === 'story').length;
    return out;
  }, [x, revealEntry(x), wifeOf(x), PHASES4]);
  const f = x.owner.first;
  assert.deepEqual(r.r1.rejected, []);
  assert.deepEqual(r.r1.people, [{ id: r.id, named: false, renamed: false }]);
  assert.equal(r.id, `npc_${f.toLowerCase()}s_wife`);
  assert.match(r.r1.applied[0], new RegExp(`^peopleRevealed\\[0\\]: ${r.id} \\(${f}'s wife, no name yet; she/her\\) wife of ${x.owner.id}; lives at ${r.houseId} \\(there morning, afternoon, evening, night\\)$`), r.r1.applied[0]);
  const n1 = r.n1;
  assert.deepEqual([n1.name, n1.unnamed, n1.pronouns, n1.role, n1.knownToPlayer, n1.status, n1.attitude, n1.factionId, n1.goal, n1.secret, n1.voice], [`${f}'s wife`, true, 'she', `${f}'s wife`, false, 'free', 0, null, '', '', '']);
  assert.deepEqual(n1.memories, []);
  assert.deepEqual(n1.tags, ['relative', 'wife']);
  assert.deepEqual(n1.created, { turn: r.turn, day: r.day, by: 'story', relationToNpcId: x.owner.id, relation: 'wife', locationId: null, byNpcId: null });
  assert.deepEqual(n1.home, { locationId: r.houseId, phases: PHASES4, revealed: true });
  assert.deepEqual(r.home1, PHASES4, 'she is home in every phase no schedule holds her');
  assert.match(r.again, /^already a person: /, 'the same unnamed relation again');
  assert.deepEqual(r.r2.people, [{ id: r.id, named: true, renamed: true }]);
  assert.equal(r.n2.id, r.id, 'the same id');
  assert.equal(r.n2.name, 'Mavis Toler');
  assert.equal(r.n2.unnamed, undefined);
  assert.equal(r.n2.pronouns, 'she');
  assert.equal(r.n2.role, `${f}'s wife`);
  assert.equal(r.n2.look, 'A small woman with a tired smile.');
  assert.deepEqual(r.n2.home, n1.home);
  assert.equal(r.count, 1, 'one person, not two');
  assert.match(r.second, new RegExp(`${x.owner.id} already has a wife`));
  assert.match(r.taken, new RegExp(`^already a person: ${r.id} \\(Mavis Toler\\)`));
  assert.match(r.town, new RegExp(`^already a person: ${x.owner.id}`));
  assert.match(r.badPronouns, /pronouns must be he, she or they/);
  assert.match(r.short, /name must be 2 to 40 characters/);
  assert.match(r.long, /name must be 2 to 40 characters/);
  assert.match(r.noTarget, /unknown npc id "npc_nobody"/);
  assert.match(r.noPlace, /unknown location id "loc_nowhere"/);
  assert.match(r.noRelation, /needs a relation to a listed person/);
  assert.equal(r.m1, 'ok');
  assert.match(r.m2, /at most 1 new person a turn/);
  assert.deepEqual([r.earl.scheduled, r.earl.where, r.earl.known], [false, null, false], 'no household: no schedule, off-screen until met');
  assert.equal(r.earl.created.locationId, x.here, 'where they are said to work');
  assert.deepEqual(r.earl.tags, ['worker']);
  // Two so far (the wife and Earl): ten more fit under twelve.
  assert.deepEqual(r.more.slice(0, 10), Array(10).fill('ok'));
  assert.ok(r.more.slice(10).every(w => /at most 12 people the story named in one game/.test(w)), r.more.slice(10).join(' | '));
  assert.equal(r.story, 12);
});

s.test('peopleRevealed: a son named before his father\'s house is known moves in when the house is revealed; peopleRevealed is no longer in the bookkeeper\'s schema (the cast is fixed) and the model\'s is refused in a new game; fixPeople is engine-only', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, house, PH]) => {
    const S = Game.State;
    const st = Game.state;
    S.apply({ beginTurn: true });
    const son = S.apply({ peopleRevealed: [{ name: 'Bobby', unnamed: false, pronouns: 'he', role: 'works the bait shop', look: '', relationToNpcId: x.owner.id, relation: 'his son', locationId: null, kind: 'relative' }] }, { source: 'model' });
    const id = son.people[0].id;
    const before = PH.filter(p => st.locations.some(l => (l.npcIdsBySchedule[p] || []).includes(id)));
    S.apply({ beginTurn: true });
    const placed = S.apply({ placesRevealed: [house] }, { source: 'model' });
    const houseId = placed.revealed[0];
    const after = PH.filter(p => S.npcsAt(houseId, p).some(n => n.id === id));
    return {
      id, role: S.npc(id).role, relation: S.npc(id).created.relation, before, after, line: placed.applied[0], home: S.npc(id).home, houseId,
      keys: S.RECORD_KEYS.includes('peopleRevealed') && !S.ENGINE_KEYS.includes('peopleRevealed') && S.ENGINE_KEYS.includes('fixPeople') && !S.RECORD_KEYS.includes('fixPeople'),
      schema: Game.Api.SCHEMAS.record_changes.required.includes('peopleRevealed') || 'peopleRevealed' in Game.Api.SCHEMAS.record_changes.properties,
      model: S.apply({ fixPeople: [{ npcId: id, pronouns: 'she' }] }, { source: 'model' }).rejected[0].reason,
      // With the cast fixed (every new game), the model's attempt is refused.
      fixed: (() => { st.meta.castFixed = true; const res = S.apply({ peopleRevealed: [{ name: 'Earl Toler', pronouns: 'he', relationToNpcId: '', who: 'brother' }] }, { source: 'model' }); return [res.rejected.map(x => x.reason), st.npcs.some(n => n.name === 'Earl Toler')]; })()
    };
  }, [x, revealEntry(x), PHASES4]);
  assert.equal(r.role, `${x.owner.first}'s son, works the bait shop`, 'the relation first, then what was said');
  assert.equal(r.relation, 'son', '"his son" is kept as "son"');
  assert.deepEqual(r.before, [], 'nowhere to live yet: off-screen');
  assert.deepEqual(r.after, PHASES4, 'he lives at the house once it is known');
  assert.match(r.line, new RegExp(`; ${r.id} lives there too`));
  assert.deepEqual(r.home, { locationId: r.houseId, phases: PHASES4, revealed: true });
  assert.ok(r.keys, 'the op stays in State for the engine');
  assert.equal(r.schema, false, 'not in record_changes any more');
  assert.match(r.model, /not allowed from the model/);
  assert.deepEqual(r.fixed, [['the cast is fixed: everyone in town is already written, so nobody new is added'], false]);
});

s.test('peopleRevealed, the bookkeeper\'s compact entry: who is read into the relation, the role and the kind, the name tells unnamed from named, whose person can come from the name, and a later compact entry names the same person', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, house, PH]) => {
    const S = Game.State;
    const st = Game.state;
    const reveal = e => { S.apply({ beginTurn: true }); return S.apply({ peopleRevealed: [e] }, { source: 'model' }); };
    const why = res => (res.rejected.length ? res.rejected[0].reason : 'ok');
    const snap = n => n && { id: n.id, name: n.name, unnamed: n.unnamed, pronouns: n.pronouns, role: n.role, look: n.look, tags: n.tags, relTo: n.created.relationToNpcId, relation: n.created.relation, home: n.home ? n.home.locationId : null };
    S.apply({ beginTurn: true });
    S.apply({ placesRevealed: [house] });
    const houseId = st.locations.find(l => l.revealed).id;
    const out = { houseId, split: [
      S.splitWho('wife, night clerk at the motor court'), S.splitWho('his older brother who runs the bait shop'), S.splitWho("Dewayne's wife"), S.splitWho('boss'), S.splitWho('runs the bait shop'), S.splitWho(''), S.splitWho('mother-in-law, lives in the trailer out back')
    ] };
    // Unnamed, with the relation first and more after it.
    out.r1 = reveal({ name: `${x.owner.first}'s wife`, pronouns: 'she', relationToNpcId: x.owner.id, who: 'wife, night clerk at the motor court' });
    const wife = st.npcs.find(n => n.created && n.created.by === 'story');
    out.wife1 = snap(wife);
    out.home1 = PH.filter(p => S.npcsAt(houseId, p).some(n => n.id === wife.id));
    // The same wife again, by relation: refused.
    out.again = why(reveal({ name: 'his wife', pronouns: 'she', relationToNpcId: x.owner.id, who: 'wife' }));
    // Named later: the same record.
    out.r2 = reveal({ name: 'Mavis Toler', pronouns: 'she', relationToNpcId: x.owner.id, who: 'wife' });
    out.wife2 = snap(S.npc(wife.id));
    // relationToNpcId left empty, but the name says whose: a brother, off-screen, with what was said as his role.
    out.r3 = reveal({ name: `${x.owner.first}'s brother`, pronouns: 'he', relationToNpcId: '', who: 'older brother who runs the bait shop' });
    const bro = st.npcs.find(n => n.created && n.created.by === 'story' && n.id !== wife.id);
    out.bro = snap(bro);
    out.broWhere = Game.World.whereIs(bro.id);
    // Nobody's: a worker by what they do; an unnamed one with no relation is refused.
    out.r4 = reveal({ name: 'Earl Hux', pronouns: 'he', relationToNpcId: '', who: 'drives the propane truck' });
    out.earl = snap(st.npcs.find(n => n.name === 'Earl Hux'));
    out.noRelation = why(reveal({ name: 'the propane man', pronouns: 'he', relationToNpcId: '', who: '' }));
    out.boss = reveal({ name: 'Mr. Culp', pronouns: 'he', relationToNpcId: x.owner.id, who: 'boss at the plant' });
    out.culp = snap(st.npcs.find(n => n.name === 'Mr. Culp'));
    return out;
  }, [x, revealEntry(x), PHASES4]);
  const f = x.owner.first;
  assert.deepEqual(r.split, [
    { relation: 'wife', rest: 'night clerk at the motor court' },
    { relation: 'older brother', rest: 'runs the bait shop' },
    { relation: 'wife', rest: '' },
    { relation: 'boss', rest: '' },
    { relation: 'runs the bait shop', rest: '' },
    { relation: '', rest: '' },
    { relation: 'mother-in-law', rest: 'lives in the trailer out back' }
  ]);
  assert.deepEqual(r.r1.rejected, []);
  assert.deepEqual([r.wife1.name, r.wife1.unnamed, r.wife1.pronouns, r.wife1.role, r.wife1.look, r.wife1.tags, r.wife1.relTo, r.wife1.relation, r.wife1.home],
    [`${f}'s wife`, true, 'she', `${f}'s wife, night clerk at the motor court`, '', ['relative', 'wife'], x.owner.id, 'wife', r.houseId]);
  assert.deepEqual(r.home1, PHASES4);
  assert.match(r.again, /already a person/);
  assert.deepEqual(r.r2.rejected, []);
  assert.deepEqual(r.r2.people, [{ id: r.wife1.id, named: true, renamed: true }]);
  assert.deepEqual([r.wife2.id, r.wife2.name, r.wife2.unnamed, r.wife2.role], [r.wife1.id, 'Mavis Toler', undefined, `${f}'s wife, night clerk at the motor court`], 'named: the same person, the role kept');
  assert.deepEqual(r.r3.rejected, []);
  assert.deepEqual([r.bro.unnamed, r.bro.pronouns, r.bro.role, r.bro.tags, r.bro.relTo, r.bro.relation, r.bro.home], [true, 'he', `${f}'s older brother, runs the bait shop`, ['relative', 'older', 'brother'], x.owner.id, 'older brother', null]);
  assert.equal(r.broWhere, null, 'a brother has no home of his own yet: off-screen');
  assert.deepEqual(r.r4.rejected, []);
  assert.deepEqual([r.earl.unnamed, r.earl.role, r.earl.tags, r.earl.relTo], [undefined, 'drives the propane truck', ['other'], null]);
  assert.match(r.noRelation, /needs a relation to a listed person/);
  assert.deepEqual(r.boss.rejected, []);
  assert.deepEqual([r.culp.role, r.culp.tags, r.culp.relation], [`${f}'s boss, at the plant`, ['worker', 'boss'], 'boss']);
});

s.test('fixPeople: a wife, husband or child given a relation and no home moves in with that person when their home is known; a home named in the same fix wins; a cousin stays put', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(([x, house, PH]) => {
    const S = Game.State;
    const st = Game.state;
    const here = st.player.locationId;
    S.apply({ beginTurn: true });
    S.apply({ placesRevealed: [house] });
    const houseId = st.locations.find(l => l.revealed).id;
    // As the tables made her: at the place she was first asked for, in every phase, nobody's wife on record.
    S.apply({ addNpcs: [{ id: 'npc_mavis_t', name: 'Mavis Test', role: 'Man', look: 'A man with a bitter look about them.', pronouns: 'he', home: { locationId: here, phases: 'all' } }] });
    const where = id => PH.map(p => (S.npcsAt(houseId, p).some(n => n.id === id) ? 'house' : S.npcsAt(here, p).some(n => n.id === id) ? 'here' : '-'));
    const out = { before: where('npc_mavis_t') };
    out.r1 = S.apply({ fixPeople: [{ npcId: 'npc_mavis_t', pronouns: 'she', role: `${x.owner.first}'s wife`, relationToNpcId: x.owner.id, relation: 'wife' }] });
    out.after = where('npc_mavis_t');
    out.home = JSON.parse(JSON.stringify(S.npc('npc_mavis_t').home));
    // A home named in the same fix wins over the shared one.
    S.apply({ addNpcs: [{ id: 'npc_earl_t', name: 'Earl Test', role: 'trucker', pronouns: 'he' }] });
    out.r2 = S.apply({ fixPeople: [{ npcId: 'npc_earl_t', relationToNpcId: x.owner.id, relation: 'son', homeLocationId: here }] });
    out.earl = S.npc('npc_earl_t').home.locationId;
    // A cousin is not a household relation: no move.
    S.apply({ addNpcs: [{ id: 'npc_faye_t', name: 'Faye Test', role: 'clerk', pronouns: 'she' }] });
    out.r3 = S.apply({ fixPeople: [{ npcId: 'npc_faye_t', relationToNpcId: x.owner.id, relation: 'cousin' }] });
    out.faye = S.npc('npc_faye_t').home || null;
    return out;
  }, [x, revealEntry(x), PHASES4]);
  assert.deepEqual(r.before, ['here', 'here', 'here', 'here']);
  assert.deepEqual(r.r1.rejected, []);
  assert.match(r.r1.applied[0], /; wife of npc_\w+;.*; lives at loc_\w+ \(there morning, afternoon, evening, night\)$/, r.r1.applied[0]);
  assert.deepEqual(r.after, ['house', 'house', 'house', 'house'], 'she lives at his house now, and is no longer at the gas station');
  assert.equal(r.home.revealed, true);
  assert.deepEqual(r.r2.rejected, []);
  assert.notEqual(r.earl, r.home.locationId, 'the home named in the fix wins');
  assert.deepEqual(r.r3.rejected, []);
  assert.equal(r.faye, null, 'a cousin does not move in');
});

s.test('fixPeople: new pronouns turn a gendered relation, role and tag with them (husband -> wife), they leaves the word alone, and a fix that states the relation or role itself is not second-guessed', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(x => {
    const S = Game.State;
    const st = Game.state;
    const snap = n => ({ pronouns: n.pronouns, role: n.role, tags: n.tags.slice(), relation: n.created.relation });
    S.apply({ beginTurn: true });
    S.apply({ peopleRevealed: [{ name: 'Mavis Toler', pronouns: 'he', relationToNpcId: x.owner.id, who: 'husband, works nights at the motor court' }] }, { source: 'model' });
    const n = st.npcs.find(m => m.name === 'Mavis Toler');
    const out = { before: snap(n) };
    out.r1 = S.apply({ fixPeople: [{ npcId: n.id, pronouns: 'she' }] });
    out.she = snap(n);
    out.r2 = S.apply({ fixPeople: [{ npcId: n.id, pronouns: 'they' }] });
    out.they = snap(n);
    out.r3 = S.apply({ fixPeople: [{ npcId: n.id, pronouns: 'he', role: 'Runs the motor court' }] });
    out.he = snap(n);
    out.r4 = S.apply({ fixPeople: [{ npcId: n.id, pronouns: 'she', relationToNpcId: x.owner.id, relation: 'cousin' }] });
    out.cousin = snap(n);
    return out;
  }, x);
  const f = x.owner.first;
  assert.deepEqual(r.before, { pronouns: 'he', role: `${f}'s husband, works nights at the motor court`, tags: ['relative', 'husband'], relation: 'husband' });
  assert.deepEqual(r.r1.rejected, []);
  assert.match(r.r1.applied[0], new RegExp(`pronouns "he" -> "she"; role "${f}'s husband, works nights at the motor court" -> "${f}'s wife, works nights at the motor court"; husband -> wife of ${x.owner.id}`), r.r1.applied[0]);
  assert.deepEqual(r.she, { pronouns: 'she', role: `${f}'s wife, works nights at the motor court`, tags: ['relative', 'wife'], relation: 'wife' });
  assert.deepEqual(r.they, { pronouns: 'they', role: `${f}'s wife, works nights at the motor court`, tags: ['relative', 'wife'], relation: 'wife' }, 'they leaves the word as it is');
  assert.deepEqual(r.he, { pronouns: 'he', role: 'Runs the motor court', tags: ['relative', 'husband'], relation: 'husband' }, 'a role given in the fix stands; the relation and tag still turn');
  assert.deepEqual(r.cousin, { pronouns: 'she', role: 'Runs the motor court', tags: ['relative', 'husband'], relation: 'cousin' }, 'a relation given in the fix is taken as it is');
});

/* A town person who is free and has phases no schedule holds, someone else
   alive to be related to, a place that is not where the first one is
   scheduled, and the police station (if the town has one). */
const editSetup = page => page.evaluate(() => {
  const st = Game.state;
  const phases = ['morning', 'afternoon', 'evening', 'night'];
  const at = id => phases.map(p => { const l = st.locations.find(x => ((x.npcIdsBySchedule || {})[p] || []).includes(id)); return l ? l.id : null; });
  const townIds = Game.town.npcs.map(n => n.id);
  const who = st.npcs.find(n => townIds.includes(n.id) && n.status === 'free' && at(n.id).includes(null) && at(n.id).some(Boolean) && !n.created);
  const other = st.npcs.find(n => n.id !== who.id && n.alive !== false && townIds.includes(n.id));
  const third = st.npcs.find(n => n.id !== who.id && n.id !== other.id && n.alive !== false && townIds.includes(n.id));
  const home = st.locations.find(l => l.discovered && !l.closed && !at(who.id).includes(l.id) && !['police', 'watch'].includes(l.type));
  const police = st.locations.find(l => l.type === 'police') || st.locations.find(l => l.type === 'watch') || null;
  for (let i = 0; i < 3; i++) Game.State.apply({ beginTurn: true });
  return {
    who: { id: who.id, name: who.name, pronouns: who.pronouns, schedule: at(who.id), free: phases.filter((p, i) => !at(who.id)[i]) },
    other: { id: other.id, name: other.name, first: other.name.split(' ')[0] }, third: { id: third.id, name: third.name },
    home: home.id, police: police ? police.id : null, turn: st.meta.turn
  };
});

s.test('editPerson: the player edits anything about anyone (name, pronouns, role, look, voice, personality, goal, secret, attitude, relation, home, status, memories); only what changed, one applied line naming each field, logged as the player; the model cannot send it', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await editSetup(page);
  const r = await page.evaluate(x => {
    const S = Game.State;
    const st = Game.state;
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    const at = id => PH.map(p => { const l = st.locations.find(y => ((y.npcIdsBySchedule || {})[p] || []).includes(id)); return l ? l.id : null; });
    const n = S.npc(x.who.id);
    const pron = x.who.pronouns === 'she' ? 'he' : 'she';
    const out = {};
    out.r1 = S.apply({ editPerson: {
      npcId: n.id, name: 'Mavis  Toler ', pronouns: pron, role: 'night clerk at the motor court', look: 'Small and tired, in a motel smock.', voice: 'Short and dry.',
      personality: ['tired', ' sharp ', ''], goal: 'Sleep through one whole day.', secret: 'She has money put aside to leave.', attitude: 140,
      relationToNpcId: x.other.id, relation: 'His Wife', homeLocationId: x.home,
      memories: [{ turn: 1, text: 'woke me up knocking', weight: 2 }, { turn: x.turn, text: 'paid back the twenty', weight: 3 }]
    } }, { source: 'player' });
    out.rec = JSON.parse(JSON.stringify(n));
    out.at = at(n.id);
    out.debug = S.debugLog.filter(d => /editPerson/.test(d.text || d.path || '')).map(d => [d.kind, d.source]);
    out.same = S.apply({ editPerson: { npcId: n.id, name: 'Mavis Toler', attitude: 100, relation: 'wife' } }, { source: 'player' });
    out.ledger = [S.apply({ editPerson: { npcId: n.id, attitude: -250 } }, { source: 'player' }).applied[0], n.attitude, S.apply({ editPerson: { npcId: n.id, attitude: '35' } }, { source: 'player' }).applied[0], n.attitude];
    // No home: off the home's phases, home cleared; the town's own schedule stays.
    out.r2 = S.apply({ editPerson: { npcId: n.id, homeLocationId: null } }, { source: 'player' });
    out.noHome = [n.home === undefined, at(n.id)];
    S.apply({ editPerson: { npcId: n.id, homeLocationId: x.home } }, { source: 'player' });
    // Dead: alive false, on no schedule; free again: alive, back at the town's schedule and the home.
    out.r3 = S.apply({ editPerson: { npcId: n.id, status: 'dead' } }, { source: 'player' });
    out.dead = [n.alive, n.status, at(n.id), S.npcsAt(x.home, x.who.free[0]).some(m => m.id === n.id)];
    out.r4 = S.apply({ editPerson: { npcId: n.id, status: 'free' } }, { source: 'player' });
    out.free = [n.alive, n.status, at(n.id)];
    out.r5 = S.apply({ editPerson: { npcId: n.id, status: 'gone' } }, { source: 'player' });
    out.gone = [n.alive, n.status, at(n.id)];
    out.r6 = S.apply({ editPerson: { npcId: n.id, status: 'arrested' } }, { source: 'player' });
    out.arrested = at(n.id);
    out.r7 = S.apply({ editPerson: { npcId: n.id, alive: false } }, { source: 'player' });
    out.aliveFalse = [n.alive, n.status];
    out.r8 = S.apply({ editPerson: { npcId: n.id, alive: true } }, { source: 'player' });
    out.aliveTrue = [n.alive, n.status, at(n.id)];
    // The relation: another word alone keeps the person; a new person keeps the word; null clears it (and the created record a town person got with it).
    out.r9 = S.apply({ editPerson: { npcId: n.id, relation: 'sister' } }, { source: 'player' });
    out.r10 = S.apply({ editPerson: { npcId: n.id, relationToNpcId: x.third.id } }, { source: 'player' });
    out.rel = JSON.parse(JSON.stringify(n.created));
    out.r11 = S.apply({ editPerson: { npcId: n.id, relationToNpcId: null } }, { source: 'player' });
    out.cleared = n.created === undefined;
    // A list of edits works too; the model may not send any.
    out.list = S.apply({ editPerson: [{ npcId: n.id, role: 'clerk' }, { npcId: x.other.id, role: 'boss' }] }, { source: 'player' }).edited;
    out.model = S.apply({ editPerson: { npcId: n.id, role: 'x' } }, { source: 'model' }).rejected;
    out.keys = S.ENGINE_KEYS.includes('editPerson') && !S.RECORD_KEYS.includes('editPerson') && !Object.keys(Game.Api.SCHEMAS.record_changes.properties).includes('editPerson');
    return out;
  }, x);
  const pron = x.who.pronouns === 'she' ? 'he' : 'she';
  assert.deepEqual(r.r1.rejected, []);
  assert.deepEqual(r.r1.edited, [{ id: x.who.id, fields: ['name', 'pronouns', 'role', 'look', 'voice', 'personality', 'attitude', 'relation', 'home', 'memories', 'goal', 'secret'] }]);
  const line = r.r1.applied[0];
  assert.match(line, new RegExp(`^editPerson: ${x.who.id} edited: name "${x.who.name}" -> "Mavis Toler"; pronouns "${x.who.pronouns}" -> "${pron}"; role ".*" -> "night clerk at the motor court"; look replaced; voice replaced; goal replaced; secret replaced; personality \\[.*\\] -> \\["tired","sharp"\\]; attitude -?\\d+ -> 100; wife of ${x.other.id}; lives at ${x.home} \\(there ${x.who.free.join(', ')}\\); memories 0 -> 2$`), line);
  const rec = r.rec;
  assert.deepEqual([rec.name, rec.pronouns, rec.role, rec.look, rec.voice, rec.personality, rec.goal, rec.secret, rec.attitude],
    ['Mavis Toler', pron, 'night clerk at the motor court', 'Small and tired, in a motel smock.', 'Short and dry.', ['tired', 'sharp'], 'Sleep through one whole day.', 'She has money put aside to leave.', 100]);
  assert.deepEqual(rec.created, { turn: null, day: null, by: 'edit', relationToNpcId: x.other.id, relation: 'wife' }, 'a town person gets created only with the relation');
  assert.deepEqual(rec.home, { locationId: x.home, phases: x.who.free, revealed: true });
  assert.deepEqual(rec.memories, [{ turn: 1, text: 'woke me up knocking', weight: 2 }, { turn: x.turn, text: 'paid back the twenty', weight: 3 }]);
  assert.deepEqual(r.at, x.who.schedule.map(id => id || x.home), 'moved in for the phases nothing else holds');
  assert.deepEqual(r.debug, [['applied', 'player']], 'the debug log has the edit, from the player');
  assert.deepEqual([r.same.applied, r.same.rejected, r.same.edited], [[], [], undefined], 'nothing different: nothing applied');
  assert.match(r.ledger[0], /attitude 100 -> -100$/);
  assert.deepEqual([r.ledger[1], r.ledger[3]], [-100, 35], 'clamped, and no per-turn limit on the player\'s own edit');
  assert.deepEqual([r.r2.edited[0].fields, r.noHome], [['home'], [true, x.who.schedule]], 'no home: off its phases, the town schedule stays');
  assert.match(r.r3.applied[0], /status free -> dead$/);
  assert.deepEqual(r.dead, [false, 'dead', [null, null, null, null], false], 'dead: on no schedule');
  assert.deepEqual(r.free, [true, 'free', x.who.schedule.map(id => id || x.home)], 'free again: the town schedule and the home');
  assert.deepEqual(r.gone, [true, 'gone', [null, null, null, null]]);
  if (x.police) assert.deepEqual(r.arrested, [x.police, x.police, x.police, x.police], 'arrested: in the cells');
  assert.deepEqual(r.aliveFalse, [false, 'dead'], 'alive false is dead');
  assert.deepEqual(r.aliveTrue, [true, 'free', x.who.schedule.map(id => id || x.home)], 'alive true brings them back free');
  assert.match(r.r9.applied[0], new RegExp(`sister of ${x.other.id}$`));
  assert.deepEqual([r.rel.relationToNpcId, r.rel.relation, r.rel.by], [x.third.id, 'sister', 'edit'], 'a new person keeps the word');
  assert.match(r.r11.applied[0], new RegExp(`no relation \\(was sister of ${x.third.id}\\)$`));
  assert.ok(r.cleared, 'a town person has no created record once the relation is gone');
  assert.deepEqual(r.list.map(e => [e.id, e.fields]), [[x.who.id, ['role']], [x.other.id, ['role']]]);
  assert.match(r.model[0].reason, /not allowed from the model/);
  assert.ok(r.keys, 'editPerson is engine-only and not in the bookkeeper schema');
});

s.test('editPerson refuses bad values with a reason and changes nothing: name, pronouns, every text limit, personality, attitude, relation, home, status, alive, memories, unknown fields', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await editSetup(page);
  const r = await page.evaluate(x => {
    const S = Game.State;
    const id = x.who.id;
    const ok = { npcId: id, role: 'a fine new role', attitude: 50 }; // valid, sent with each bad field: the whole edit is refused
    S.apply({ editPerson: { npcId: x.third.id, status: 'dead' } }, { source: 'player' });
    const long = k => 'x'.repeat(k);
    const cases = [
      ['name', { name: 'M' }], ['name', { name: long(41) }], ['name', { name: x.other.name }], ['name', { name: x.other.first }], ['name', { name: null }], ['name', { name: 7 }],
      ['pronouns', { pronouns: 'it' }], ['pronouns', { pronouns: null }],
      ['role', { role: '' }], ['role', { role: long(61) }], ['role', { role: 5 }],
      ['look', { look: long(201) }], ['voice', { voice: long(201) }], ['goal', { goal: long(201) }], ['secret', { secret: long(301) }],
      ['personality', { personality: 'kind' }], ['personality', { personality: ['a', 'b', 'c', 'd'] }], ['personality', { personality: [long(31)] }], ['personality', { personality: [3] }],
      ['attitude', { attitude: 'warm' }], ['attitude', { attitude: null }],
      ['relationToNpcId', { relationToNpcId: 'npc_nobody_at_all' }], ['relationToNpcId', { relationToNpcId: id }], ['relationToNpcId', { relationToNpcId: x.third.id }],
      ['relation', { relation: 'wife' }], ['relation', { relationToNpcId: x.other.id, relation: long(31) }], ['relation', { relationToNpcId: null, relation: 'wife' }],
      ['homeLocationId', { homeLocationId: 'loc_nowhere_at_all' }],
      ['status', { status: 'sleeping' }], ['alive', { alive: 'yes' }], ['alive', { alive: false, status: 'free' }], ['alive', { alive: true, status: 'dead' }],
      ['memories', { memories: 'x' }], ['memories', { memories: Array.from({ length: S.MEMORY_MAX + 1 }, () => ({ turn: 0, text: 'x', weight: 1 })) }],
      ['memories', { memories: [{ turn: x.turn + 1, text: 'x', weight: 1 }] }], ['memories', { memories: [{ turn: -1, text: 'x', weight: 1 }] }], ['memories', { memories: [{ turn: 1.5, text: 'x', weight: 1 }] }],
      ['memories', { memories: [{ turn: 0, text: 'x', weight: 4 }] }], ['memories', { memories: [{ turn: 0, text: 'x', weight: 0 }] }], ['memories', { memories: [{ turn: 0, text: '  ', weight: 1 }] }],
      ['memories', { memories: [{ turn: 0, text: long(401), weight: 1 }] }], ['memories', { memories: [7] }],
      ['unknown', { tags: ['x'] }], ['npcId', { npcId: 'npc_nobody_at_all' }]
    ];
    const before = JSON.stringify(Game.state);
    const out = cases.map(([k, bad]) => { const res = S.apply({ editPerson: Object.assign({}, ok, bad) }, { source: 'player' }); return [k, res.rejected.map(x => x.reason)[0] || null, res.applied.length]; });
    return { out, unchanged: JSON.stringify(Game.state) === before, notObject: S.apply({ editPerson: 'x' }, { source: 'player' }).rejected[0].reason };
  }, x);
  const want = [
    /name must be 2 to 40/, /name must be 2 to 40/, new RegExp(`the name ${x.other.name} is taken: ${x.other.id}`), new RegExp(`is taken: ${x.other.id}`), /name must be text/, /name must be text/,
    /pronouns must be he, she or they/, /pronouns must be he, she or they/,
    /role cannot be empty/, /role must be at most 60 characters/, /role must be text/,
    /look must be at most 200/, /voice must be at most 200/, /goal must be at most 200/, /secret must be at most 300/,
    /personality must be a list/, /at most 3 personality traits/, /trait must be at most 30/, /personality\[0\] must be text/,
    /attitude must be a whole number/, /attitude must be a whole number/,
    /unknown npc id/, /cannot be related to themself/, /is dead: a relation needs a living person/,
    /a relation needs someone to be related to/, /relation must be at most 30/, /a relation needs someone to be related to/,
    /unknown location id/,
    /status must be free, arrested, gone or dead/, /alive must be true or false/, /alive false does not go with status free/, /alive true does not go with status dead/,
    /memories must be an array/, /at most \d+ memories per person/,
    /turn must be 0 to/, /turn must be 0 to/, /turn must be 0 to/, /weight must be 1, 2 or 3/, /weight must be 1, 2 or 3/, /needs text/,
    /text must be at most 400/, /memories\[0\] must be an object/,
    /unknown field "tags"/, /unknown npc id/
  ];
  assert.equal(r.out.length, want.length);
  r.out.forEach(([k, reason, applied], i) => {
    assert.ok(reason && want[i].test(reason), `${k} (case ${i}): ${reason}`);
    assert.equal(applied, 0, `${k} (case ${i}): nothing applied`);
  });
  assert.ok(r.unchanged, 'a refused edit changes nothing, not even its valid fields');
  assert.match(r.notObject, /must be an object/);
});

s.test('new pronouns turn a gendered relation, role, tag, look and voice (fixPeople and editPerson: "A man with a bitter look about him." -> "A woman with a bitter look about her."); what the same edit states stands; they leaves the person words alone; quotes and "them" about something else stay', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await revealSetup(page);
  const r = await page.evaluate(x => {
    const S = Game.State;
    const st = Game.state;
    const rec = n => ({ pronouns: n.pronouns, role: n.role, tags: n.tags.slice(), relation: n.created.relation, look: n.look, voice: n.voice });
    S.apply({ beginTurn: true });
    S.apply({ peopleRevealed: [{ name: 'Mavis Toler', pronouns: 'he', relationToNpcId: x.owner.id, who: 'husband, works nights at the motor court' }] }, { source: 'model' });
    const n = st.npcs.find(m => m.name === 'Mavis Toler');
    const look = 'A man with a bitter look about him.';
    const voice = "Few words, all of them about engines; says 'he's fine' about everyone, and talks to the truck he's working on.";
    S.apply({ editPerson: { npcId: n.id, look, voice } }, { source: 'player' });
    const out = { by: n.created.by };
    out.f1 = S.apply({ fixPeople: [{ npcId: n.id, pronouns: 'she' }] }).applied[0];
    out.she = rec(n);
    out.e1 = S.apply({ editPerson: { npcId: n.id, pronouns: 'he' } }, { source: 'player' });
    out.he = rec(n);
    out.e2 = S.apply({ editPerson: { npcId: n.id, pronouns: 'she', look: 'A tall man in a feed cap.', role: 'Runs the motor court' } }, { source: 'player' });
    out.stated = rec(n);
    out.e3 = S.apply({ editPerson: { npcId: n.id, pronouns: 'they' } }, { source: 'player' });
    out.they = rec(n);
    S.apply({ editPerson: { npcId: n.id, look: 'A woman with a bitter look about them.' } }, { source: 'player' });
    out.e4 = S.apply({ editPerson: { npcId: n.id, pronouns: 'he', relationToNpcId: x.owner.id, relation: 'cousin' } }, { source: 'player' });
    out.cousin = rec(n);
    out.helper = [Game.turnLook('A man with a bitter look about him.', 'she', 'he'), Game.turnLook('A man with a bitter look about them.', 'she'), Game.turnLook('They talk fast and they are always late; their hands shake.', 'he', 'they'),
      Game.turnLook('She says little, and she means it.', 'they', 'she'), Game.turnLook('Keeps a rag in his back pocket; the truck is his.', 'she', 'he')];
    return out;
  }, x);
  const f = x.owner.first;
  assert.equal(r.by, 'story', 'an edit keeps how they were made');
  assert.match(r.f1, /; look turned to she\/her; voice turned to she\/her$/, r.f1);
  assert.deepEqual(r.she, { pronouns: 'she', role: `${f}'s wife, works nights at the motor court`, tags: ['relative', 'wife'], relation: 'wife',
    look: 'A woman with a bitter look about her.', voice: "Few words, all of them about engines; says 'he's fine' about everyone, and talks to the truck she's working on." }, 'the chips (fixPeople with pronouns only) turn the look and voice too');
  assert.deepEqual(r.e1.edited[0].fields, ['pronouns', 'role', 'look', 'voice', 'relation']);
  assert.deepEqual(r.he, { pronouns: 'he', role: `${f}'s husband, works nights at the motor court`, tags: ['relative', 'husband'], relation: 'husband',
    look: 'A man with a bitter look about him.', voice: "Few words, all of them about engines; says 'he's fine' about everyone, and talks to the truck he's working on." });
  assert.deepEqual([r.stated.look, r.stated.role, r.stated.relation, r.stated.voice.endsWith("truck she's working on.")], ['A tall man in a feed cap.', 'Runs the motor court', 'wife', true], 'a look and role given in the edit stand; the relation and voice still turn');
  assert.deepEqual([r.they.look, r.they.relation, r.they.voice.endsWith("truck they're working on.")], ['A tall man in a feed cap.', 'wife', true], 'they leaves the person words and the relation alone, and turns the pronouns');
  assert.deepEqual([r.cousin.relation, r.cousin.look], ['cousin', 'A man with a bitter look about him.'], 'a stated relation is taken as it is; from they, "them" turns');
  assert.deepEqual(r.helper, ['A woman with a bitter look about her.', 'A woman with a bitter look about her.', 'He talks fast and he is always late; his hands shake.', 'They say little, and they mean it.', 'Keeps a rag in her back pocket; the truck is hers.']);
});

s.test('an edited person and the version 5 check: a town person with a relation stays the town\'s own (not madeUp); a made person edited keeps created and reads as edited by the player in the people packet', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await legacyTown(page); // the engine's paths for a game from before the full cast
  const x = await editSetup(page);
  const r = await page.evaluate(x => {
    const S = Game.State;
    const st = Game.state;
    S.apply({ editPerson: { npcId: x.who.id, relationToNpcId: x.other.id, relation: 'brother' } }, { source: 'player' });
    S.apply({ addNpcs: [{ id: 'npc_test_drifter', name: 'Earl Drifter', role: 'drifter', look: 'A man in a dusty coat.' }] });
    S.apply({ editPerson: { npcId: 'npc_test_drifter', relationToNpcId: x.other.id, relation: 'cousin' } }, { source: 'player' });
    const made = Game.Upgrade.madeUp(st).map(n => n.id);
    const packet = Game.Upgrade.peoplePacket(st, [{ n: S.npc('npc_test_drifter'), mentions: [] }]);
    return { made, created: S.npc('npc_test_drifter').created, line: packet.text.split('\n').find(l => l.startsWith('PERSON ')), related: packet.text.split('\n').find(l => l.includes('related to:')), by: packet.people[0].by };
  }, x);
  assert.ok(!r.made.includes(x.who.id), 'a town person is never one the game made up');
  assert.ok(r.made.includes('npc_test_drifter'));
  assert.deepEqual(r.created, { turn: null, day: null, by: 'edit', relationToNpcId: x.other.id, relation: 'cousin' });
  assert.equal(r.by, 'edit');
  assert.equal(r.line, 'PERSON npc_test_drifter (made by the game and since edited by the player, who set who they are to whom by hand)');
  assert.equal(r.related, `  related to: cousin of ${x.other.id}`);
});

s.test('Style.check on day 1 flags a spoken line to the player that invents a past (last night, known you); not on day 2, not when nobody speaks to the player, and the rewrite note says why', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const C = (t, o) => Game.Style.check(t, o).problems.filter(p => p.type === 'past').map(p => p.phrase);
    const mavis = 'Mavis sighs through her nose. "Fine, plain English. I know about you and Dewayne, I\'ve known a while, and he called me over and over last night while I let it ring."';
    return {
      day1: C(mavis, { day: 1 }), day2: C(mavis, { day: 2 }), noDay: C(mavis, {}),
      aboutOthers: C('Royce shrugs. "Yesterday the lift broke again. Dewayne was under it till midnight."', { day: 1 }),
      narrationOnly: C('You slept badly last night and it shows. Royce looks you over.', { day: 1 }),
      met: C('She squints. "Have we met? You look like somebody I knew back in Macon."', { day: 1 }),
      fine: C('She squints at you. "Today? Huh. Then you walked into something you know nothing about."', { day: 1 }),
      note: Game.Style.regenerationNote(Game.Style.check(mavis, { day: 1 }).problems),
      fn: Game.Style.inventedPast(mavis)
    };
  });
  assert.deepEqual(r.day1, ['known a while'], 'the first phrase found');
  assert.deepEqual(r.day2, [], 'day 2 may have a last night');
  assert.deepEqual(r.noDay, [], 'no day given: no check');
  assert.deepEqual(r.aboutOthers, [], 'a past between other people is fine');
  assert.deepEqual(r.narrationOnly, [], 'only spoken lines count');
  assert.deepEqual(r.met, [], 'a "have we met" question is not a claim');
  assert.deepEqual(r.fine, []);
  assert.match(r.note, /^STYLE CHECK FAILED on your last attempt: on day 1, someone speaks to the player of a past that never happened \("known a while"\)\. Write it again without that\. It is day 1: the player came to town today, nobody here knew them or heard of them before/);
  assert.equal(r.fn, 'known a while');
});

/* The full cast (docs/BUILD_PLAN.md, direction change 8). */
s.test('the cast\'s ties: tiesOf reads both sides of the written relations (and a relation made in play), relationNote says the family tie, and "X\'s wife", a name and a one-word job resolve to the cast', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const T = G.data.TOWN_DATA;
    const wife = T.npcs.find(n => /^Mavis /.test(n.name));
    const husband = T.npcs.find(n => (n.relations || []).some(r => r.npcId === wife.id && r.relation === 'wife'));
    const first = n => n.name.split(' ')[0];
    const ties = id => JSON.parse(JSON.stringify(S.tiesOf(S.npc(id))));
    const match = d => G.Town.matchExisting(d, {});
    const out = {
      wife: wife.id, husband: husband.id, hf: first(husband),
      wifeTies: ties(wife.id), husbandTies: ties(husband.id),
      wifeNote: S.relationNote(S.npc(wife.id)), husbandNote: S.relationNote(S.npc(husband.id)),
      byRel: match(`${first(husband)}'s wife`), byName: match(first(wife)), byFull: match(wife.name), byJob: match('mechanic'),
      none: match('woman at the pumps'), ownersWife: match(`${first(wife)}'s husband`)
    };
    // A relation made in play shows on both sides too.
    const other = G.state.npcs.find(n => n.id !== wife.id && n.id !== husband.id && !(n.relations || []).length);
    S.apply({ editPerson: { npcId: other.id, relationToNpcId: husband.id, relation: 'cousin' } }, { source: 'player' });
    out.other = other.id;
    out.after = ties(husband.id);
    out.otherNote = S.relationNote(S.npc(other.id));
    return out;
  });
  assert.ok(r.wifeTies.has.some(x => x.id === r.husband && x.relation === 'husband'), 'her husband, by her own list');
  assert.ok(r.wifeTies.isTo.some(x => x.id === r.husband && x.relation === 'wife'), 'his wife, by his list');
  assert.ok(r.husbandTies.has.some(x => x.id === r.wife && x.relation === 'wife'));
  assert.equal(r.wifeNote, `${r.hf}'s wife`);
  assert.match(r.husbandNote, /'s husband$/);
  assert.deepEqual(r.byRel, { kind: 'npc', id: r.wife }, `${r.hf}'s wife is the cast's wife`);
  assert.deepEqual([r.byName, r.byFull], [{ kind: 'npc', id: r.wife }, { kind: 'npc', id: r.wife }]);
  assert.equal(r.byJob.kind, 'npc');
  assert.equal(r.none, null, 'nobody like that');
  assert.deepEqual(r.ownersWife, { kind: 'npc', id: r.husband }, 'her husband is him');
  assert.ok(r.after.has.some(x => x.id === r.other && x.relation === 'cousin'), 'a relation made in play is one of his ties');
  assert.equal(r.otherNote, `${r.hf}'s cousin`);
});

s.test('a home the cast has written is found, not made: placesRevealed by the owner, by the home\'s name or by "X\'s house" discovers it with a revealed record that is not counted against the twelve; a second home for someone who already has one on the map is refused; undiscovered places stay out of the exits the parser and a flight use', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const st = G.state;
    const here = st.player.locationId;
    const first = n => n.name.split(' ')[0];
    const homes = st.locations.filter(l => !l.discovered).map(l => ({ l, owners: st.npcs.filter(n => n.home && n.home.locationId === l.id) })).filter(x => x.owners.length);
    const [a, b, c] = homes;
    const entry = (name, owner, kind) => ({ name, type: 'house', description: 'Told about in passing.', nearId: here, ownerNpcId: owner || null, kind: kind || 'home' });
    const n0 = st.locations.length;
    const out = { n0 };
    S.apply({ beginTurn: true });
    const r1 = S.apply({ placesRevealed: [entry(`${first(a.owners[0])}'s house`, a.owners[0].id)] }, { source: 'model' });
    out.one = { id: r1.revealed && r1.revealed[0], want: a.l.id, revealed: JSON.parse(JSON.stringify(S.loc(a.l.id).revealed)), discovered: S.loc(a.l.id).discovered, line: r1.applied[0] };
    S.apply({ beginTurn: true });
    const r2 = S.apply({ placesRevealed: [entry(b.l.name, null)] }, { source: 'model' });
    out.two = { id: r2.revealed && r2.revealed[0], want: b.l.id, owner: S.loc(b.l.id).revealed.ownerNpcId, owners: b.owners.map(n => n.id) };
    S.apply({ beginTurn: true });
    const r3 = S.apply({ placesRevealed: [entry(`${first(c.owners[0])}'s place`, null, 'other')] }, { source: 'model' });
    out.three = { id: r3.revealed && r3.revealed[0], want: c.l.id };
    S.apply({ beginTurn: true });
    out.again = S.apply({ placesRevealed: [entry(`${first(a.owners[0])}'s house`, a.owners[0].id)] }, { source: 'model' }).rejected.map(x => x.reason);
    // Someone whose home was always on the map (a town place) gets no second one.
    const local = st.npcs.find(n => n.home && S.loc(n.home.locationId).discovered && !S.loc(n.home.locationId).revealed && st.npcs.filter(m => first(m) === first(n)).length === 1);
    S.apply({ beginTurn: true });
    out.local = S.apply({ placesRevealed: [entry(`${first(local)}'s place`, local.id)] }, { source: 'model' }).rejected.map(x => x.reason);
    out.n = st.locations.length;
    out.counted = st.locations.filter(l => l.revealed && !l.revealed.authored).length;
    // What the parser hears of the ways out, and where running away goes: only places the player knows.
    const still = st.locations.filter(l => !l.discovered).map(l => l.id);
    const by = st.locations.find(l => l.discovered && l.exits.some(x => still.includes(x)));
    S.apply({ playerLocationId: by.id });
    out.exits = G.Pipeline.parsePacket('I look around', {}).exits.map(x => x.id);
    out.still = still;
    out.book = G.Pipeline.bookkeeperPacket({ action: {}, presentIds: [], narration: '' }).split('\n').find(l => l.startsWith('LOCATIONS'));
    return out;
  });
  assert.equal(r.one.id, r.one.want, 'the owner\'s own home, found');
  assert.equal(r.one.discovered, true);
  assert.deepEqual([r.one.revealed.kind, r.one.revealed.visited, r.one.revealed.authored], ['home', false, true]);
  assert.match(r.one.line, new RegExp(`^placesRevealed\\[0\\]: ${r.one.want} \\(.+\\) discovered as ".+'s house"; home of npc_`));
  assert.equal(r.two.id, r.two.want, 'by the home\'s own name');
  assert.ok(r.two.owners.includes(r.two.owner), 'credited to someone who lives there');
  assert.equal(r.three.id, r.three.want, 'by whose place it is');
  assert.match(r.again[0], /already has a home on the map/);
  assert.match(r.local[0], /lives at loc_/);
  assert.equal(r.n, r.n0, 'no place was made');
  assert.equal(r.counted, 0, 'found homes do not count against the twelve');
  for (const id of r.still) {
    assert.ok(!r.exits.includes(id), 'an unfound home is no way out: ' + id);
    assert.ok(!r.book.includes(id + ' '), 'nor in the bookkeeper\'s places: ' + id);
  }
});

s.test('loose ends pick the person by the option kept: each preset option\'s tag, then the kind\'s; free words fall back to the kind\'s tag; two loose ends never share a person while anyone else is free', async h => {
  const page = await h.open();
  const D = await page.evaluate(() => Game.data.LOOSE_ENDS);
  const picked = [];
  for (let i = 0; i < D.debt.options.length; i++) {
    await page.evaluate(() => Game.State.clear());
    await page.evaluate(([i, text]) => {
      const B = Game.data.BACKGROUNDS[0];
      Game.App.quickStart({ name: 'Tester', backgroundId: B.id, stats: Object.assign({}, B.stats), goal: 'g', flaw: Game.data.FLAWS[0], looseEnds: [{ kind: 'debt', text }] }, { seed: 77 + i });
    }, [i, D.debt.options[i]]);
    await page.waitForSelector('#screen-game.active');
    picked.push(await page.evaluate(() => { const n = Game.State.npc(Game.state.player.looseEnds[0].npcId); return { id: n.id, tags: n.tags }; }));
  }
  D.debt.link.optionTags.forEach((tag, i) => assert.ok(picked[i].tags.includes(tag), `option ${i}: ${tag}: ${JSON.stringify(picked[i])}`));
  // Free words: the kind's own tag.
  await page.evaluate(() => Game.State.clear());
  await page.evaluate(() => {
    const B = Game.data.BACKGROUNDS[0];
    Game.App.quickStart({ name: 'Tester', backgroundId: B.id, stats: Object.assign({}, B.stats), goal: 'g', flaw: Game.data.FLAWS[0], looseEnds: [{ kind: 'debt', text: 'I owe the whole county' }, { kind: 'enemy', text: 'A cousin wants me dead.' }] }, { seed: 5 });
  });
  await page.waitForSelector('#screen-game.active');
  const free = await page.evaluate(() => Game.state.player.looseEnds.map(le => ({ kind: le.kind, tags: Game.State.npc(le.npcId).tags, id: le.npcId })));
  assert.ok(free[0].tags.includes(D.debt.link.tag), JSON.stringify(free[0]));
  assert.ok(free[1].tags.includes(D.enemy.link.tag), JSON.stringify(free[1]));
  // More loose ends of one kind than people with its tag: the next is someone else free, never a shared person.
  const many = await page.evaluate(() => {
    for (let i = 0; i < 4; i++) Game.Town.resolveLooseEnd({ kind: 'promise', text: 'I promised a dying man I\'d deliver his letter to someone here.' });
    return Game.state.player.looseEnds.map(le => le.npcId);
  });
  assert.equal(new Set(many).size, many.length, 'nobody tied twice');
  assert.equal(await page.evaluate(() => Game.state.npcs.filter(n => n.created).length), 0, 'nobody made');
});

s.test('the version 6 ops are the engine\'s: the model cannot send them; mergePeople moves a made-up person\'s history and references onto the cast member and removes them; recastPeople gives someone made up under a cast id the cast\'s record; bad entries are refused', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const st = G.state;
    const out = {};
    out.model = ['addCast', 'recastPeople', 'mergePlaces', 'castSchedules', 'mergePeople', 'castFixed'].map(k => S.apply({ [k]: [] }, { source: 'model' }).rejected[0].reason);
    const wife = st.npcs.find(n => /^Mavis /.test(n.name));
    const here = st.player.locationId;
    S.apply({ beginTurn: true });
    S.apply({ addNpcs: [{ id: 'npc_mavis_toler', name: 'Mavis Toler', role: 'Man', look: 'A man with a bitter look about them.', pronouns: 'he', knownToPlayer: true, attitude: -20, created: { by: 'tables' }, home: { locationId: here, phases: 'all' } }] });
    S.apply({ newMemories: [{ npcId: 'npc_mavis_toler', text: 'woke me up knocking', weight: 2 }], logEntry: { input: 'hi', roll: null, narration: 'x', mode: 'say', to: 'npc_mavis_toler', toName: 'Mavis Toler' }, effects: [{ op: 'openThread', thread: { id: 'thr_test', title: 'T', summary: 's', status: 'open', knownToPlayer: true, linkedIds: ['npc_mavis_toler'] } }] });
    st.seen.npc_mavis_toler = { locationId: here, day: 1, phase: 'morning', turn: 1 };
    const res = S.apply({ mergePeople: [{ fromId: 'npc_mavis_toler', intoId: wife.id }] });
    const m = JSON.parse(JSON.stringify(S.npc(wife.id)));
    out.merge = { applied: res.applied[0], merged: res.merged, gone: !S.npc('npc_mavis_toler'), name: m.name, known: m.knownToPlayer, attitude: m.attitude, mems: m.memories.map(x => x.text),
      log: st.log.slice(-1)[0].to + '|' + st.log.slice(-1)[0].toName, thread: S.thread('thr_test').linkedIds, seen: !!st.seen[wife.id] && !st.seen.npc_mavis_toler,
      sched: st.locations.some(l => Object.values(l.npcIdsBySchedule).some(a => a.includes('npc_mavis_toler'))) };
    out.bad = [
      S.apply({ mergePeople: [{ fromId: wife.id, intoId: 'npc_dewayne' }] }).rejected[0].reason,
      S.apply({ mergePeople: [{ fromId: 'npc_nobody', intoId: wife.id }] }).rejected[0].reason,
      S.apply({ mergePlaces: [{ fromId: here, intoId: here }] }).rejected[0].reason,
      S.apply({ recastPeople: [{ npcId: wife.id }] }).rejected[0].reason
    ];
    // Someone the story named "Mavis" was made as npc_mavis in an older game: recast in place.
    const was = JSON.parse(JSON.stringify(S.npc(wife.id)));
    Object.assign(S.npc(wife.id), { name: 'Mavis', role: "Dewayne's wife", look: '', voice: '', created: { by: 'story', relationToNpcId: 'npc_dewayne', relation: 'wife' }, relations: [] });
    const rc = S.apply({ recastPeople: [{ npcId: wife.id }] });
    const n = JSON.parse(JSON.stringify(S.npc(wife.id)));
    out.recast = { line: rc.applied[0], name: n.name, role: n.role, created: n.created || null, ties: n.relations, look: n.look === was.look, mems: n.memories.length };
    return out;
  });
  for (const reason of r.model) assert.match(reason, /not allowed from the model/);
  assert.match(r.merge.applied, /^mergePeople\[0\]: npc_mavis_toler \(Mavis Toler\) merged into npc_mavis \(Mavis Mangum\)/);
  assert.deepEqual(r.merge.merged, [{ fromId: 'npc_mavis_toler', intoId: 'npc_mavis', from: 'Mavis Toler' }]);
  assert.deepEqual([r.merge.gone, r.merge.name, r.merge.known, r.merge.attitude], [true, 'Mavis Mangum', true, -20], 'the cast record, with the history the player made');
  assert.deepEqual(r.merge.mems, ['woke me up knocking']);
  assert.equal(r.merge.log, 'npc_mavis|Mavis Mangum', 'the log points at her');
  assert.deepEqual(r.merge.thread, ['npc_mavis']);
  assert.ok(r.merge.seen && !r.merge.sched);
  assert.match(r.bad[0], /is in the cast; only someone the game made up is merged/);
  assert.match(r.bad[1], /unknown npc id/);
  assert.match(r.bad[2], /cannot be merged into itself/);
  assert.match(r.bad[3], /is the cast's own already/);
  assert.match(r.recast.line, /^recastPeople\[0\]: npc_mavis \(Mavis\) is the cast's Mavis Mangum$/);
  assert.deepEqual([r.recast.name, r.recast.created, r.recast.look, r.recast.mems], ['Mavis Mangum', null, true, 1]);
  assert.ok(r.recast.ties.some(t => t.relation === 'husband'));
});

s.test('a lived-in town: editPerson takes an age (a whole number 0 to 120; null clears it) and a history (at most 400), only what changed, one line each; bad values are refused with the reason and change nothing; the player has an age from creation (16 to 90, else the background\'s)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const n = Game.state.npcs.find(x => Game.presenceOf(x) === 'here');
    const dead = Game.state.npcs.find(x => Game.presenceOf(x) === 'dead');
    const out = { was: [n.age, n.history] };
    const ok = S.apply({ editPerson: { npcId: n.id, age: n.age + 3, history: 'Came back from Calder in the spring.' } }, { source: 'player' });
    out.ok = { rejected: ok.rejected, edited: ok.edited, line: ok.applied[0], age: n.age, history: n.history };
    out.same = S.apply({ editPerson: { npcId: n.id, age: n.age, history: n.history } }, { source: 'player' }).applied.length;
    out.str = (S.apply({ editPerson: { npcId: n.id, age: ' 45 ' } }, { source: 'player' }), n.age);
    const before = JSON.stringify(Game.state);
    const bad = v => S.apply({ editPerson: Object.assign({ npcId: n.id }, v) }, { source: 'player' }).rejected.map(x => x.reason)[0];
    out.bad = [bad({ age: 121 }), bad({ age: -1 }), bad({ age: 30.5 }), bad({ age: 'old' }), bad({ age: true }), bad({ history: 'x'.repeat(401) }), bad({ history: 7 }), bad({ age: 40, history: 'y'.repeat(401) })];
    out.unchanged = JSON.stringify(Game.state) === before;
    out.max = (S.apply({ editPerson: { npcId: n.id, age: 120, history: 'z'.repeat(400) } }, { source: 'player' }).rejected.length);
    out.clear = S.apply({ editPerson: { npcId: n.id, age: null } }, { source: 'player' }).edited;
    out.cleared = 'age' in n;
    // The dead have an age too: their age when they died, editable like anyone's.
    out.dead = S.apply({ editPerson: { npcId: dead.id, age: dead.age + 1 } }, { source: 'player' }).edited;
    out.model = S.apply({ editPerson: { npcId: n.id, age: 30 } }, { source: 'model' }).rejected.length;
    out.max2 = [S.EDIT_MAX.age, S.EDIT_MAX.history, S.AGE_MIN, S.AGE_MAX];
    // The player: an age given at creation, the background's when none is, and a bad one refused.
    const D = Game.data;
    const bg = D.BACKGROUNDS[1];
    const make = age => { try { return S.newGame(D.TOWN_DATA, { name: 'Ada', age, backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'x', flaw: D.FLAWS[0], looseEnds: [] }, { seed: 7, pending: true }).player.age; } catch (e) { return e.message; } };
    out.player = [make(undefined), make(52), make('61'), make(15), make(91), make('old')];
    out.bgAge = bg.age;
    return out;
  });
  assert.deepEqual(r.ok.rejected, []);
  assert.deepEqual(r.ok.edited, [{ id: r.ok.edited[0].id, fields: ['age', 'history'] }]);
  assert.match(r.ok.line, new RegExp(`age ${r.was[0]} -> ${r.was[0] + 3}; history replaced`));
  assert.deepEqual([r.ok.age, r.ok.history], [r.was[0] + 3, 'Came back from Calder in the spring.']);
  assert.equal(r.same, 0, 'the same values change nothing');
  assert.equal(r.str, 45, 'a whole number typed as text');
  for (const reason of r.bad.slice(0, 5)) assert.equal(reason, 'age must be a whole number from 0 to 120');
  assert.equal(r.bad[5], 'history must be at most 400 characters (it is 401)');
  assert.equal(r.bad[6], 'history must be text');
  assert.equal(r.bad[7], 'history must be at most 400 characters (it is 401)', 'one bad field and nothing changes');
  assert.ok(r.unchanged, 'refused edits change nothing');
  assert.equal(r.max, 0, '120 and 400 are allowed');
  assert.deepEqual(r.clear[0].fields, ['age']);
  assert.equal(r.cleared, false, 'null clears the age');
  assert.deepEqual(r.dead[0].fields, ['age']);
  assert.equal(r.model, 1, 'the model cannot send it');
  assert.deepEqual(r.max2, [120, 400, 16, 90]);
  assert.deepEqual(r.player.slice(0, 3), [r.bgAge, 52, 61]);
  for (const m of r.player.slice(3)) assert.equal(m, 'age must be a whole number from 16 to 90');
});

s.test('a save from before ages loads and plays as it is; State.load drops an age or history of the wrong shape (version 7 fills them from the town data); everyone in a new game has an age, a history and a presence', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const S = Game.State;
    const fresh = Game.state.npcs.filter(n => !Number.isInteger(n.age) || !n.history || !n.presence).map(n => n.id);
    const env = Game.Storage.envelope('x');
    const st = env.state;
    delete st.player.age;
    for (const n of st.npcs) { delete n.age; delete n.history; }
    st.npcs[0].age = 'forty';
    st.npcs[1].history = 12;
    st.npcs[2].age = 300;
    st.npcs[3].age = 51;
    S.load(st, env.town);
    const now = Game.state;
    const out = { fresh, player: 'age' in now.player, ages: now.npcs.slice(0, 4).map(n => n.age), history: 'history' in now.npcs[1] };
    Game.Api.Mock.delay = 0;
    out.turn = await Game.Pipeline.submit('I look around');
    const packet = Game.Pipeline.narratorPacket({ action: { summary: 'x' } });
    out.player = packet.split('\n').find(l => l.startsWith('PLAYER:'));
    out.undef = /undefined|NaN/.test(packet + Game.Pipeline.castBlock());
    out.behind = Game.Upgrade.behind(now);
    return out;
  });
  assert.deepEqual(r.fresh, [], 'a new game: everyone has an age, a history and a presence');
  assert.equal(r.player, 'PLAYER: Tester (veteran). Reputation: unknown. Conditions: none.', 'no age: the line as it was');
  assert.deepEqual(r.ages, [undefined, undefined, undefined, 51], 'ages of the wrong shape are dropped; a good one stays');
  assert.equal(r.history, false);
  assert.equal(r.turn.ok, true, 'and it plays');
  assert.equal(r.undef, false, 'nothing undefined in the packets');
  assert.equal(r.behind, false, 'a current rules version is not behind');
});


/* The narrator knows what everyone wants (docs/BUILD_PLAN.md, direction change 10). */
s.test('log entries carry where they were narrated (a known place given, else where the player stands) and the turn their scene began (carried while the place stays; new at another place or after an entry with no place)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const here = st.player.locationId;
    const other = S.loc(here).exits.find(id => S.loc(id).away !== true);
    const log = (e) => { S.apply({ beginTurn: true }); S.apply({ logEntry: Object.assign({ input: 'x', roll: null, narration: 'y' }, e) }); const x = st.log[st.log.length - 1]; return [x.turn, x.locationId, x.sceneFrom]; };
    const out = { here, other, opening: [st.log[0].turn, st.log[0].locationId, st.log[0].sceneFrom] };
    out.same = log({});
    out.given = log({ locationId: other });
    out.unknown = log({ locationId: 'loc_nowhere' });
    S.apply({ playerLocationId: other });
    out.moved = log({});
    out.stays = log({});
    delete st.log[st.log.length - 1].locationId;
    out.afterOld = log({});
    return out;
  });
  assert.deepEqual(r.opening, [0, r.here, 0], 'the opening is the first scene');
  assert.deepEqual(r.same, [1, r.here, 0], 'same place: the scene goes on');
  assert.deepEqual(r.given, [2, r.other, 2], 'a known place given: a new scene there');
  assert.deepEqual(r.unknown, [3, r.here, 3], 'an unknown place: where the player stands');
  assert.deepEqual(r.moved, [4, r.other, 4]);
  assert.deepEqual(r.stays, [5, r.other, 4]);
  assert.deepEqual(r.afterOld, [6, r.other, 6], 'after an entry with no place (an older save), a new scene');
});

s.test('State.load rewrites an older save\'s "Loose end with" line on a loose end\'s person to the line a new game writes (weight 3, its turn kept; the label picks which loose end, a written one gets the kind\'s line); the same line on anyone else stays; a current save loads as it is', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt', 'enemy', 'secret'] });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const D = Game.data.LOOSE_ENDS;
    const env = Game.Storage.envelope('x');
    const st = env.state;
    const same = JSON.stringify(st);
    S.load(JSON.parse(same), env.town);
    const out = { same: JSON.stringify(Game.state) === same };
    // The old form, as games saved before 30 Oct 2026 hold it.
    const ends = st.player.looseEnds;
    const npc = id => st.npcs.find(n => n.id === id);
    const old = le => ({ turn: 0, weight: 2, text: `Loose end with Tester (${D[le.kind].label.toLowerCase()}): ${le.text}` });
    for (const le of ends) npc(le.npcId).memories = [old(le), { turn: 3, weight: 2, text: 'flirted with me' }];
    // Someone holding two loose ends: the label picks which.
    const two = npc(ends[0].npcId);
    two.memories.push({ turn: 0, weight: 2, text: 'Loose end with Tester (an enemy): A cousin wants me dead.' });
    ends.push({ kind: 'enemy', label: 'An enemy', text: 'A cousin wants me dead.', npcId: two.id, seedId: null, threadId: null, created: false });
    // The same old line on someone with no loose end stays as it is.
    const stranger = st.npcs.find(n => !ends.some(le => le.npcId === n.id) && n.alive !== false);
    stranger.memories = [{ turn: 1, weight: 2, text: 'Loose end with Tester (a debt): something' }];
    S.load(st, env.town);
    out.ends = ends.map(le => ({ kind: le.kind, text: le.text, memories: S.npc(le.npcId).memories }));
    out.stranger = S.npc(stranger.id).memories;
    out.want = { debt: D.debt.memory.options[0], enemy: D.enemy.memory.options[0], secret: D.secret.memory.options[0], written: D.enemy.memory.text };
    return out;
  });
  assert.ok(r.same, 'a current save loads byte for byte');
  const [debt, enemy, secret] = r.ends;
  assert.deepEqual(debt.memories, [{ turn: 0, weight: 3, text: r.want.debt }, { turn: 3, weight: 2, text: 'flirted with me' }, { turn: 0, weight: 3, text: r.want.written }], 'the debt by its label; the second loose end by its own');
  assert.deepEqual(enemy.memories, [{ turn: 0, weight: 3, text: r.want.enemy }, { turn: 3, weight: 2, text: 'flirted with me' }]);
  assert.deepEqual(secret.memories, [{ turn: 0, weight: 3, text: r.want.secret }, { turn: 3, weight: 2, text: 'flirted with me' }]);
  assert.deepEqual(r.stranger, [{ turn: 1, weight: 2, text: 'Loose end with Tester (a debt): something' }], 'nobody else is touched');
});

s.test('rumours carry knownBy (source first; a faction\'s news its free members; extra names checked); rumourSpread and journalNews are engine-only and checked; rumoursHeard reports what it marked heard', async h => {
  const page = await h.open();
  await quickStart(page, { seed: 77 });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const out = {};
    const free = st.npcs.filter(n => n.alive !== false && n.status === 'free');
    const f = st.factions.find(x => free.filter(n => n.factionId === x.id).length >= 2);
    const members = free.filter(n => n.factionId === f.id).map(n => n.id);
    const src = free.find(n => n.factionId !== f.id);
    const other = free.find(n => n.factionId !== f.id && n.id !== src.id);
    const dead = st.npcs.find(n => n.presence === 'dead');
    const away = st.npcs.find(n => n.presence === 'away');
    out.town = st.rumours.every(x => JSON.stringify(x.knownBy) === JSON.stringify([x.sourceNpcId]));
    // A faction's news: its source, then the faction's free members, then anyone named; each once.
    S.apply({ effects: [{ op: 'addRumour', rumour: { id: 'rum_test_a', text: 'Test news.', sourceNpcId: src.id, factionId: f.id, knownBy: [other.id, members[0], src.id] } }] });
    out.news = { got: S.rumour('rum_test_a').knownBy.slice(), want: [src.id].concat(members, [other.id]) };
    out.badKnown = S.apply({ effects: [{ op: 'addRumour', rumour: { id: 'rum_test_b', text: 'Test.', sourceNpcId: src.id, knownBy: ['npc_nobody_here'] } }] }).rejected.length === 1 && !S.rumour('rum_test_b');
    // rumourSpread: never from the model; a whole entry refused for someone dead, far away or unknown; known people once.
    out.model = S.apply({ rumourSpread: [{ rumourId: 'rum_test_a', npcIds: [] }], journalNews: [{ text: 'x' }] }, { source: 'model' }).rejected.map(x => x.reason);
    out.refused = ['dead', 'away', 'unknown'].map(k => S.apply({ rumourSpread: [{ rumourId: 'rum_test_a', npcIds: [free[0].id, k === 'dead' ? dead.id : k === 'away' ? away.id : 'npc_nobody_here'] }] }).rejected.length);
    out.afterRefused = S.rumour('rum_test_a').knownBy.length;
    const learner = free.find(n => !S.rumour('rum_test_a').knownBy.includes(n.id));
    const res = S.apply({ rumourSpread: [{ rumourId: 'rum_test_a', npcIds: [learner.id, src.id] }] });
    out.spread = { applied: res.applied.length, last: S.rumour('rum_test_a').knownBy.slice(-1)[0] === learner.id, length: S.rumour('rum_test_a').knownBy.length };
    // journalNews: dated (today, or an earlier day given), marked news, never the same text twice.
    const day = st.time.day;
    S.apply({ journalNews: [{ text: '  Around town:  test one. ' }, { text: 'Around town: test two.', day: day + 5 }, { text: 'Around town: test one.' }, 'Around town: test three.'] });
    out.journal = st.journal.filter(j => j.kind === 'news').map(j => [j.text, j.day, j.turn]);
    out.day = day;
    out.turn = st.meta.turn;
    out.emptyRefused = S.apply({ journalNews: [''] }).rejected.length;
    // rumoursHeard: result.heard lists only what it marked heard now.
    const first = st.rumours[0].id;
    out.heard1 = S.apply({ rumoursHeard: [first] }, { source: 'model' }).heard;
    out.heard2 = S.apply({ rumoursHeard: [first] }, { source: 'model' }).heard || null;
    return out;
  });
  assert.equal(r.town, true, 'the town\'s rumours start with their source alone');
  assert.deepEqual(r.news.got, r.news.want);
  assert.equal(r.badKnown, true, 'an unknown person in knownBy refuses the rumour');
  assert.deepEqual(r.model, ['not allowed from the model', 'not allowed from the model']);
  assert.deepEqual(r.refused, [1, 1, 1], 'refused for the dead, the far away and the unknown');
  assert.equal(r.afterRefused, r.news.want.length, 'nobody added by a refused entry');
  assert.deepEqual(r.spread, { applied: 1, last: true, length: r.news.want.length + 1 }, 'a new person added once; someone who knew it already is not added again');
  assert.deepEqual(r.journal, [['Around town: test one.', r.day, r.turn], ['Around town: test two.', r.day, r.turn], ['Around town: test three.', r.day, r.turn]]);
  assert.equal(r.emptyRefused, 1);
  assert.equal(r.heard1.length, 1);
  assert.equal(r.heard2, null, 'nothing reported for a rumour already heard');
});

s.test('work and trouble (direction change 16): the fight op waits in state.fights, once a person, its seed kept, a no-op for someone not free; fightDone, workDone and the job\'s journal line; all engine-only; Town\'s work helpers', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const st = G.state;
    const reasons = res => res.rejected.map(x => x.reason);
    const town = st.npcs.filter(n => n.status === 'free' && (n.presence || 'here') === 'here');
    const a = town[0];
    const b = town[1];
    const dead = st.npcs.find(n => n.presence === 'dead');
    const away = st.npcs.find(n => n.presence === 'away');
    const out = {};
    out.first = S.apply({ effects: [{ op: 'fight', npcId: a.id, reason: 'a grudge over a lie' }] }).applied;
    out.twice = S.apply({ effects: [{ op: 'fight', npcId: a.id }] }).applied;
    const sd = st.seeds.find(x => !x.fired);
    out.seeded = S.apply({ effects: [{ op: 'fight', npcId: b.id, seedId: sd.id }] }).applied;
    out.badSeed = S.apply({ effects: [{ op: 'fight', npcId: dead.id, seedId: 'seed_nothing' }] }).applied;
    out.awayNoop = S.apply({ effects: [{ op: 'fight', npcId: away.id }] }).applied;
    out.unknown = reasons(S.apply({ effects: [{ op: 'fight', npcId: 'npc_nobody' }] }));
    out.fights = JSON.parse(JSON.stringify(st.fights));
    out.fromModel = reasons(S.apply({ effects: [{ op: 'fight', npcId: a.id }], fightDone: [st.fights[0].id], workDone: { jobId: 'job_x' } }, { source: 'model' }));
    out.done = S.apply({ fightDone: [st.fights[0].id] }).applied;
    out.notWaiting = reasons(S.apply({ fightDone: ['fight_nobody'] }));
    out.left = st.fights.map(f => f.npcId);
    // A seed planted with a fight effect keeps it; one naming nobody is refused whole.
    out.plant = reasons(S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_test_fight', cause: 'test', effect: 'Someone comes at the player.', trigger: { type: 'day', value: 5 }, effects: [{ op: 'fight', npcId: a.id, reason: 'test' }] } }] }));
    out.planted = S.seed('seed_test_fight').effects;
    out.plantBad = reasons(S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_test_fight2', cause: 'test', effect: 'Nobody comes.', trigger: { type: 'day', value: 5 }, effects: [{ op: 'fight', npcId: 'npc_nobody' }] } }] }));
    // Work done, and the job's journal line: written again on another turn, never twice in one; news never twice.
    const turn = st.meta.turn;
    out.work1 = S.apply({ workDone: { jobId: 'job_service_bays', outcome: 'success' } }).applied;
    out.work2 = S.apply({ workDone: { jobId: 'job_service_bays' } }).applied;
    out.badJob = reasons(S.apply({ workDone: { jobId: 'shift' } }));
    out.record = JSON.parse(JSON.stringify(st.work));
    const line = { text: 'A shift for someone: paid $70.', kind: 'work' };
    S.apply({ journalNews: [line, line] });
    S.apply({ beginTurn: true });
    S.apply({ journalNews: [line, { text: 'Around town: test news.' }] });
    S.apply({ journalNews: [{ text: 'Around town: test news.' }] });
    out.journal = st.journal.filter(j => j.kind).map(j => [j.turn - turn, j.kind, j.text]);
    // Town's helpers: a job here, on offer while its giver is here in its phase; a refusal names why not.
    const J = G.data.JOBS.find(j => j.stat && !j.stake && j.repeatable);
    while (st.time.phase !== J.phases[0]) S.apply({ advanceTime: 'long' });
    S.apply({ playerLocationId: J.locationId });
    out.at = G.Town.jobsAt(J.locationId).map(j => j.id);
    out.atOther = G.Town.jobsAt(J.locationId, ['morning', 'afternoon', 'evening', 'night'].find(p => !J.phases.includes(p))).map(j => j.id);
    out.offer = G.Town.jobsOnOffer(J.locationId).map(j => j.id);
    out.refuse = G.Town.jobRefusal(J, J.locationId);
    // The record written above (the same job, today) is the cooldown; without it nothing stops the job.
    delete st.work.job_service_bays;
    out.refuseAfter = G.Town.jobRefusal(J, J.locationId);
    out.jobId = J.id;
    out.label = J.label;
    return out;
  });
  assert.equal(r.first.length, 1);
  assert.match(r.first[0], /^effects\[0\]: fight: npc_\w+ will come at the player on the next turn$/);
  assert.match(r.twice[0], /no-op: npc_\w+ already has a fight waiting/);
  assert.match(r.seeded[0], /will come at the player when seed_\w+ is told$/);
  assert.match(r.badSeed[0], /no-op: npc_\w+ is dead/);
  assert.match(r.awayNoop[0], /no-op: npc_\w+ is gone/);
  assert.deepEqual(r.unknown, ['unknown npc id "npc_nobody"']);
  assert.equal(r.fights.length, 2);
  assert.deepEqual(Object.keys(r.fights[0]).sort(), ['day', 'id', 'npcId', 'reason', 'turn']);
  assert.equal(r.fights[0].reason, 'a grudge over a lie');
  assert.ok(r.fights[1].seedId && !r.fights[1].reason, 'a seed\'s fight keeps the seed');
  assert.deepEqual(r.fromModel, ['not allowed from the model', 'not allowed from the model', 'not allowed from the model']);
  assert.equal(r.done.length, 1);
  assert.deepEqual(r.notWaiting, ['no fight "fight_nobody" is waiting']);
  assert.equal(r.left.length, 1);
  assert.deepEqual(r.plant, []);
  assert.equal(r.planted.length, 1);
  assert.equal(r.planted[0].op, 'fight');
  assert.deepEqual(r.plantBad, ['effects[0]: unknown npc id "npc_nobody"']);
  assert.deepEqual(r.work1, ['workDone: job_service_bays worked on day 1 (success)']);
  assert.deepEqual(r.work2, ['workDone: job_service_bays worked on day 1 (done)']);
  assert.deepEqual(r.badJob, ['needs a jobId']);
  assert.deepEqual(Object.keys(r.record), ['job_service_bays']);
  assert.equal(r.record.job_service_bays.times, 2);
  assert.deepEqual(r.journal, [[0, 'work', 'A shift for someone: paid $70.'], [1, 'work', 'A shift for someone: paid $70.'], [1, 'news', 'Around town: test news.']]);
  assert.ok(r.at.includes(r.jobId));
  assert.ok(!r.atOther.includes(r.jobId), 'not out of its phases');
  assert.deepEqual(r.offer.includes(r.jobId), true, 'on offer with its giver here in its phase');
  if (r.jobId === 'job_service_bays') assert.equal(r.refuse, `You already did ${r.label} today. There is more tomorrow.`, 'workDone is the cooldown');
  assert.equal(r.refuseAfter, null, 'nothing else stops it');
});

s.run();
