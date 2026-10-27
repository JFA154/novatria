'use strict';
/* Engine: Rng, Dice, Tables, State.apply validation, snapshots, time, Town,
   loose ends, Style, Api request shape. Data-driven (reads Game.data and
   Game.state) so it keeps passing once real content replaces the placeholders. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, stateJson, ROOT } = require('./helpers.cjs');

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
      lockOk: D.lockFor({ tier: 'success' }, 'k'), lockPartial: D.lockFor({ tier: 'partial' }, 'k')
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
  assert.equal(r.lockFail, 'k');
  assert.equal(r.lockCrit, 'k');
  assert.equal(r.lockOk, null);
  assert.equal(r.lockPartial, null);
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
  assert.match(await page.textContent('#feed .f-notice:last-child'), /Something has to change/);
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
    const watch = st().locations.find(l => l.type === 'watch');
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

s.test('town data passes validation and every content constant has the contract shape', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const D = Game.data;
    const keys = o => Object.keys(o).sort();
    const asym = JSON.parse(JSON.stringify(D.TOWN_DATA));
    asym.locations[0].exits.push(asym.locations[asym.locations.length - 1].id);
    if (asym.locations[asym.locations.length - 1].exits.includes(asym.locations[0].id)) asym.locations[asym.locations.length - 1].exits = asym.locations[asym.locations.length - 1].exits.filter(x => x !== asym.locations[0].id);
    return {
      errors: Game.Town.validate(D.TOWN_DATA),
      asym: Game.Town.validate(asym).some(e => /symmetric/.test(e)),
      townKeys: keys(D.TOWN_DATA),
      locKeys: D.TOWN_DATA.locations.map(keys),
      npcKeys: D.TOWN_DATA.npcs.map(keys),
      facKeys: D.TOWN_DATA.factions.map(keys),
      clockKeys: D.TOWN_DATA.factions.flatMap(f => f.clocks.map(c => [keys(c), keys(c.onComplete)])),
      tables: { top: keys(D.TABLES), npc: keys(D.TABLES.npc), location: keys(D.TABLES.location), items: keys(D.TABLES.items), weather: keys(D.TABLES.weather), goods: D.TABLES.items.goods.map(keys) },
      bg: D.BACKGROUNDS.map(b => ({ k: keys(b), total: Object.values(b.stats).reduce((a, x) => a + x, 0), range: Object.values(b.stats).every(v => v >= -1 && v <= 3), items: b.items.length, arrival: b.arrival })),
      flaws: D.FLAWS.every(f => typeof f === 'string' && f.length > 0),
      loose: keys(D.LOOSE_ENDS),
      looseShape: Object.values(D.LOOSE_ENDS).map(le => ({ k: keys(le), npc: keys(le.newNpc), seed: keys(le.seed), link: le.link === null || keys(le.link).join() === 'tag' })),
      templates: D.GRUDGE_TEMPLATES.concat(D.FAVOUR_TEMPLATES).map(t => keys(t).join() === 'dayOffset,effect' && t.effect.includes('{npc}'))
    };
  });
  assert.deepEqual(r.errors, []);
  assert.ok(r.asym, 'validation catches an asymmetric exit');
  assert.deepEqual(r.townKeys, ['factions', 'locations', 'name', 'npcs', 'rumours', 'seeds', 'setting', 'startLocationIds', 'threads']);
  for (const k of r.locKeys) assert.deepEqual(k, ['closed', 'description', 'discovered', 'exits', 'id', 'name', 'npcIdsBySchedule', 'type']);
  for (const k of r.npcKeys) assert.deepEqual(k, ['alive', 'attitude', 'factionId', 'goal', 'id', 'knownToPlayer', 'look', 'memories', 'name', 'personality', 'role', 'secret', 'status', 'tags', 'voice']);
  for (const k of r.facKeys) assert.deepEqual(k, ['activeClock', 'clocks', 'goal', 'id', 'methods', 'name', 'relations']);
  for (const [c, oc] of r.clockKeys) { assert.deepEqual(c, ['filled', 'label', 'onComplete', 'segments']); assert.deepEqual(oc, ['effects', 'text']); }
  assert.deepEqual(r.tables.top, ['complications', 'items', 'location', 'npc', 'weather']);
  assert.deepEqual(r.tables.npc, ['familyNames', 'firstNames', 'occupations', 'speechQuirks', 'traits', 'wants']);
  assert.deepEqual(r.tables.location, ['details', 'problems', 'types']);
  assert.deepEqual(r.tables.items, ['goods', 'trinkets']);
  assert.deepEqual(r.tables.weather, ['autumn', 'spring', 'summer', 'winter']);
  for (const g of r.tables.goods) assert.deepEqual(g, ['name', 'price']);
  for (const b of r.bg) {
    assert.deepEqual(b.k, ['arrival', 'blurb', 'gold', 'id', 'items', 'name', 'stats']);
    assert.equal(b.total, 3);
    assert.ok(b.range);
    assert.equal(b.items, 2);
    assert.ok(['gate', 'docks'].includes(b.arrival));
  }
  assert.ok(r.bg.some(b => b.arrival === 'gate') && r.bg.some(b => b.arrival === 'docks'));
  assert.ok(r.flaws);
  assert.deepEqual(r.loose, ['debt', 'enemy', 'lost', 'promise', 'secret']);
  for (const le of r.looseShape) {
    assert.deepEqual(le.k, ['label', 'link', 'newNpc', 'options', 'seed']);
    assert.deepEqual(le.npc, ['goal', 'look', 'personality', 'role', 'secret', 'voice']);
    assert.deepEqual(le.seed, ['dayOffset', 'effect', 'trigger']);
    assert.ok(le.link);
  }
  assert.ok(r.templates.every(Boolean));
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
        return {
          kind: le.kind, created: le.created, inTown: townNpcIds.includes(npc.id), tag: def.link && def.link.tag, tags: npc.tags,
          known: npc.knownToPlayer, memory: npc.memories.some(m => m.weight === 2 && m.text.includes(le.text)),
          seed, offset: def.seed.dayOffset, trigger: def.seed.trigger,
          thread: thread && thread.knownToPlayer && thread.linkedIds.includes(npc.id),
          role: npc.role, newRole: def.newNpc.role, scheduled: st.locations.some(l => Object.values(l.npcIdsBySchedule).some(a => a.includes(npc.id)))
        };
      });
    });
    assert.equal(r.length, 3);
    assert.equal(new Set(r.map(x => x.kind)).size, 3);
    for (const le of r) {
      if (le.tag && !le.created) assert.ok(le.tags.includes(le.tag), `${le.kind} linked by tag`);
      if (!le.tag) assert.ok(le.created, `${le.kind} with link null creates an NPC`);
      if (le.created) { assert.ok(!le.inTown); assert.equal(le.role, le.newRole); assert.equal(le.scheduled, false, 'created NPCs stay off-screen'); }
      assert.ok(le.known && le.memory && le.thread, le.kind);
      assert.equal(le.seed.hidden, true);
      assert.equal(le.seed.fired, false);
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
  assert.deepEqual(Object.keys(r.n1).sort(), ['alive', 'attitude', 'factionId', 'goal', 'id', 'knownToPlayer', 'look', 'memories', 'name', 'personality', 'role', 'secret', 'status', 'tags', 'voice']);
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

s.test('style guide and example turns are SPEC section 9 word for word; Style.check catches problems', async h => {
  const spec = fs.readFileSync(path.join(ROOT, 'SPEC.md'), 'utf8');
  const sec = spec.split('## 9. Writing style guide')[1].split('## 10.')[0];
  const block = sec.split('```')[1].replace(/^\n/, '').replace(/\n$/, '');
  const page = await h.open();
  const r = await page.evaluate(() => ({
    guide: Game.data.STYLE_GUIDE, ex: Game.data.EXAMPLE_TURNS, prompt: Game.Style.systemPrompt(), prompt2: Game.Style.systemPrompt(),
    banned: Game.Style.BANNED,
    checks: {
      clean: Game.Style.check('The ferryman spits. "Two coppers," he says.'),
      banned: Game.Style.check('The air is thick with smoke.'),
      curly: Game.Style.check('You can’t help but stare.'),
      long: Game.Style.check(Array(91).fill('word').join(' ')),
      zoom: Game.Style.check(Array(140).fill('word').join(' '), { zoom: true }),
      menu: Game.Style.check('He waits. What do you do?'),
      asYou: Game.Style.check('As you enter, the room goes quiet.')
    }
  }));
  assert.equal(r.guide, block);
  assert.equal(r.ex.length, 3);
  for (const t of r.ex) {
    assert.ok(sec.includes(`*Input:* ${t.input} *(${t.context})* ${t.narration}`), 'example verbatim: ' + t.input);
  }
  assert.ok(r.prompt.startsWith(block));
  assert.ok(r.prompt.includes('EXAMPLES (from a different town; none of these people or places exist in this game):'));
  assert.equal(r.prompt, r.prompt2, 'byte-identical for caching');
  assert.equal(r.banned.length, 20);
  assert.ok(r.checks.clean.ok);
  assert.ok(!r.checks.banned.ok && !r.checks.curly.ok && !r.checks.long.ok && !r.checks.menu.ok && !r.checks.asYou.ok);
  assert.ok(r.checks.zoom.ok, 'zoom allows up to 150 words');
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
  assert.equal(r.narr.model, 'claude-sonnet-5-5');
  assert.equal(r.narr.max_tokens, 1500);
  assert.equal(r.narr.stream, true);
  assert.deepEqual(r.narr.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(r.narr.output_config, { effort: 'low' });
  assert.equal(r.book.model, 'claude-haiku-5-5');
  assert.equal(r.book.max_tokens, 2500);
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

s.run();
