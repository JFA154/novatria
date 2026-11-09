'use strict';
/* Wave 37, Creator Mode, milestone 4 (task M4-A; plan "Pack format v1",
   decision F and "Milestone 4"): the rules dial as data. Pack.DEFAULTS
   carries rules and freedom at today's constants, and Dice (the targets,
   criticals, a fight's damage), State (a new character's health and story
   points, the most story points kept, the shorts in a phase) and Rel (the
   roll floors, the night's gates, the romance defaults, romance on or off)
   read them through Pack.get on the current pack. For the built-in pack
   every rule is the default: the seeded playthrough rolls what the v36
   snapshot rolled, and Dice.TARGETS, Rel.GATES and State.LIMITS read as
   before. A pack's own values are set here on a preview (Pack.setPreview,
   a copy of the built-in pack), the editor's way. The minor rule is not a
   dial: no pack makes anyone under 18 eligible. Mock mode.
   Run with: node tests/run.cjs wave37-rules */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave37-rules');
const FIXTURE = require('./fixtures/prompts-v36.json');
const D = 'npc_dewayne';
const J = 'npc_jodie';
const AUSTIN = 'npc_austin';

/* The built-in pack, copied, with these rules (merged over its own, which
   it has none of) and player.start dropped or replaced, as the preview. */
function preview(page, rules, start) {
  return page.evaluate(([r, st]) => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    if (r) c.rules = r;
    if (st === null) delete c.player.start;
    else if (st) c.player.start = st;
    P.setPreview(c);
  }, [rules || null, start === undefined ? undefined : start]);
}
/* In the page (wave 34's kit): __put (the player somewhere with these
   people, now), __roll (a forced die or tier), __say (a Say line with its
   parse: the roll and ROMANCE lines), __tr (the tracks). */
const kit = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  G.Api.Mock.clear();
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    if (ids && ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__roll = want => { if (Number.isInteger(want)) G.Pipeline.forceNextRoll(want); else G.Pipeline.hooks.nextTier = want; };
  window.__say = async (to, words, parse) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit(words, { mode: 'say', to });
    const c = G.Pipeline.lastTurn.ctx;
    return { roll: c.roll ? [c.roll.stat, c.roll.difficulty, c.roll.tier] : null, rom: G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE/.test(l)) };
  };
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
});
async function start(page, opts) {
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, Object.assign({ kinds: [] }, opts || {}));
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  await kit(page);
}
/* One mock Do turn with this parse and a forced die: the ROLL line of its
   narrator packet and the roll kept in the log. */
function turn(page, parse, d20, input) {
  return page.evaluate(async ([p, d, text]) => {
    const G = Game;
    const here = G.State.npcsAt(G.state.player.locationId).map(n => n.id);
    const parse = Object.assign({ summary: text, targets: [], needsRoll: false, timeCost: 'instant' }, p);
    if (parse.targets === 'here') parse.targets = here.slice(0, 1);
    G.Pipeline.forceNextRoll(d);
    G.Api.Mock.queue('parse', parse);
    G.Api.Mock.calls.length = 0;
    await G.Pipeline.submit(text, { mode: 'do' });
    await G.Pipeline.whenIdle();
    const call = G.Api.Mock.calls.filter(c => c.method === 'narrate').pop();
    const lines = call ? call.text.split('\n') : [];
    const roll = G.state.log[G.state.log.length - 1].roll;
    return { line: lines.find(l => l.startsWith('ROLL:')) || '', roll: roll ? { d20: roll.d20, total: roll.total, target: roll.target, tier: roll.tier } : null };
  }, [parse, d20, input || 'I do it.']);
}

s.test('with every rule at its default the built-in pack is untouched: Pack.get answers each rules and freedom path from the defaults at today\'s constants, a strict validate of a copy carrying all of them finds nothing, and the seeded ten-input playthrough rolls what the v36 snapshot rolled with the same rng calls', async h => {
  const page = await h.open();
  const d = await page.evaluate(() => {
    const P = Game.Pack;
    const copy = P.copy(P.builtIn());
    copy.rules = JSON.parse(JSON.stringify(P.DEFAULTS.rules));
    copy.freedom = JSON.parse(JSON.stringify(P.DEFAULTS.freedom));
    return {
      rules: P.get('rules'), freedom: P.get('freedom'), layer: P.lookup('rules.dcs').layer,
      frozen: Object.isFrozen(P.DEFAULTS.rules.romance.gates) && Object.isFrozen(P.DEFAULTS.freedom.create),
      problems: P.validate(copy, { profile: 'strict' })
    };
  });
  assert.deepEqual(d.rules, {
    rolls: { always: [], never: [], alwaysPhrases: [], neverPhrases: [] },
    dcs: { easy: 8, normal: 12, hard: 15, very_hard: 18 },
    floors: { ask: 'hard', lie: [[-25, 'hard'], [-50, 'very_hard']], intimidateHard: 'hard' },
    hp: { start: 10, max: 10, damage: { failure: [1, 3], partial: 1, critical_failure: 3 } },
    crits: true, permadeath: false, showRolls: true,
    storyPoints: { start: 2, max: 3, factAllowed: true },
    time: { shortsPerPhase: 3, costs: {} },
    prices: { factor: 1 },
    law: { fine: 50, roughSleeping: true, roughNights: 2, roughFine: 25, roughForgiven: 7 },
    cheats: { allowed: true, debugView: true }, undo: true,
    romance: {
      enabled: true, gates: { spark: 50, romance: 40, trust: 30, knows: 30 },
      defaults: { sparkRate: 0.5, opensAt: 10, difficulty: 'hard' },
      intimacyRoll: { enabled: true, stat: 'charm', difficulty: 'normal' }
    },
    gamble: { enabled: true, stake: 20 },
    narration: { maxDue: 3 }
  });
  assert.deepEqual(d.freedom, {
    preset: 'sandbox', create: { places: true, things: true, people: false, perGame: 12 }, travel: 'anywhere', steer: 'none',
    scopeRefusal: { on: false, reason: '' }, skipAnywhere: true
  });
  assert.equal(d.layer, 'default', 'Low Water sets no rule: every one is the default');
  assert.equal(d.frozen, true);
  assert.deepEqual(d.problems, [], 'Pack.SCHEMA describes every rules and freedom field');

  // Started as tests/wave37-pack.test.cjs starts it (its loose ends, no kit).
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, { seed: FIXTURE.playthrough.seed });
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  const r = await page.evaluate(async inputs => {
    const G = Game;
    for (const t of inputs) { await G.Pipeline.submit(t, { mode: 'do' }).catch(() => null); await G.Pipeline.whenIdle(); }
    return { rolls: G.state.log.map(l => l.roll), rngCalls: G.state.meta.rngCalls, hp: G.state.player.hp, time: G.state.time };
  }, FIXTURE.playthrough.inputs);
  const P = FIXTURE.playthrough;
  assert.deepEqual(r.rolls, P.log.map(l => l.roll), 'every roll, die, target and tier as in the snapshot');
  assert.equal(r.rngCalls, P.rngCalls);
  assert.equal(r.hp, P.player.hp);
  assert.deepEqual(r.time, P.time);
});

s.test('rules.dcs.hard 17 on a preview moves Dice.target(\'hard\') and Dice.TARGETS, and a forced hard roll shows "vs 17" on the ROLL line with its tier by 17; back on the built-in pack the same die is "vs 15"', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { dcs: { hard: 17 } });
  const t = await page.evaluate(() => ({ hard: Game.Dice.target('hard'), normal: Game.Dice.target('normal'), all: Game.Dice.TARGETS }));
  assert.deepEqual(t, { hard: 17, normal: 12, all: { easy: 8, normal: 12, hard: 17, very_hard: 18 } }, 'the pack\'s hard over the default\'s others');
  const search = { actionType: 'search', needsRoll: true, stat: 'wits', difficulty: 'hard' };
  const a = await turn(page, search, 14, 'I search the shelf.');
  assert.equal(a.roll.target, 17);
  assert.match(a.line, / vs 17 · /);
  assert.equal(a.roll.tier, a.roll.total >= 17 ? 'success' : a.roll.total >= 14 ? 'partial' : 'failure', 'the tier is read against 17');
  await page.evaluate(() => Game.Pack.setPreview(null));
  const b = await turn(page, search, 14, 'I search the counter.');
  assert.equal(b.roll.target, 15);
  assert.match(b.line, / vs 15 · /);
});

s.test('rules.crits false: a natural 20 is read by its total (a success, or a partial when the total falls short: 15 against 18) and a natural 1 the same, never a critical; with crits on, as today, they are critical and critical failure', async h => {
  const page = await h.open();
  const roll = () => page.evaluate(() => {
    const Dc = Game.Dice;
    const r = (d20, statValue, difficulty, modifiers) => Dc.resolve({ stat: 'wits', d20, statValue, difficulty, modifiers: modifiers || [], state: null, complication: 'someone saw you' }).tier;
    return { nat20: r(20, 0, 'hard'), nat20Short: r(20, -1, 'very_hard', [{ value: -4 }]), nat1: r(1, 3, 'easy', [{ value: 4 }]), nat1Low: r(1, 0, 'normal'), tier: [Dc.tier(20, 22, 12), Dc.tier(1, 8, 8)] };
  });
  assert.deepEqual(await roll(), { nat20: 'critical', nat20Short: 'critical', nat1: 'critical_failure', nat1Low: 'critical_failure', tier: ['critical', 'critical_failure'] });
  await preview(page, { crits: false });
  assert.deepEqual(await roll(), { nat20: 'success', nat20Short: 'partial', nat1: 'success', nat1Low: 'failure', tier: ['success', 'success'] }, 'by the total alone');
});

s.test('a new character from rules.hp.start 6, hp.max 8 and storyPoints.start 1 (a pack without player.start) starts at 6 of 8 health with 1 story point; player.start, where a pack has it, comes first; and storyPoints.max 5 lets a fifth point be kept where the built-in pack stops at 3', async h => {
  const page = await h.open();
  await preview(page, { hp: { start: 6, max: 8 }, storyPoints: { start: 1, max: 5 } }, null);
  await start(page);
  const r = await page.evaluate(() => {
    const S = Game.State, p = Game.state.player;
    const out = { hp: p.hp, maxHp: p.maxHp, sp: p.storyPoints, limit: S.LIMITS.storyPoints };
    S.apply({ storyPointsDelta: 4 });
    out.five = p.storyPoints;
    S.apply({ storyPointsDelta: 1 });
    out.still = p.storyPoints;
    return out;
  });
  assert.deepEqual(r, { hp: 6, maxHp: 8, sp: 1, limit: 5, five: 5, still: 5 });

  const page2 = await h.open();
  await preview(page2, { hp: { start: 6 }, storyPoints: { start: 1 } }, { hp: 7, storyPoints: 0 });
  await start(page2);
  const own = await page2.evaluate(() => [Game.state.player.hp, Game.state.player.maxHp, Game.state.player.storyPoints]);
  assert.deepEqual(own, [7, 10, 0], 'player.start wins over rules.*.start');

  const page3 = await h.open();
  await start(page3);
  const lw = await page3.evaluate(() => {
    const S = Game.State, p = Game.state.player;
    const out = [p.hp, p.maxHp, p.storyPoints, S.LIMITS.storyPoints];
    S.apply({ storyPointsDelta: 3 });
    return out.concat(p.storyPoints);
  });
  assert.deepEqual(lw, [10, 10, 2, 3, 3], 'Low Water: 10 of 10, 2 points, kept up to 3');
});

s.test('rules.hp.damage.failure [2, 2]: a lost fight costs exactly 2 health, every time (Dice.fightDamage, and a forced failed attack in play)', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { hp: { damage: { failure: [2, 2] } } });
  const unit = await page.evaluate(() => {
    const Dc = Game.Dice, rng = Game.Rng.create(7);
    return { fails: Array.from({ length: 40 }, () => Dc.fightDamage('failure', rng)), rest: [Dc.fightDamage('partial'), Dc.fightDamage('critical_failure'), Dc.fightDamage('success')] };
  });
  assert.ok(unit.fails.every(x => x === 2), JSON.stringify(unit.fails));
  assert.deepEqual(unit.rest, [1, 3, 0], 'the other tiers keep their defaults');
  const r = await page.evaluate(async () => {
    const G = Game;
    // No complication, so nothing but the fight moves health.
    const real = G.Dice.resolve;
    G.Dice.resolve = (o, rng) => real(Object.assign({}, o, { complication: false }), rng);
    const who = G.State.npcsAt(G.state.player.locationId).map(n => n.id)[0];
    const hp = G.state.player.hp;
    G.Pipeline.hooks.nextTier = 'failure';
    G.Api.Mock.queue('parse', { actionType: 'attack', summary: 'Swings at them', targets: [who], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit('I swing at them.', { mode: 'do' });
    await G.Pipeline.whenIdle();
    G.Dice.resolve = real;
    const roll = G.state.log[G.state.log.length - 1].roll;
    return { tier: roll && roll.tier, lost: hp - G.state.player.hp };
  });
  assert.deepEqual(r, { tier: 'failure', lost: 2 });
});

s.test('rules.time.shortsPerPhase 2: the second short ends the morning (the built-in pack needs three), phasePart is late after one, and /cheat time\'s setTime refuses shorts 2', async h => {
  const page = await h.open();
  await preview(page, { time: { shortsPerPhase: 2 } });
  await start(page);
  const r = await page.evaluate(() => {
    const S = Game.State, t = Game.state.time;
    S.apply({ setTime: { day: 1, phase: 'morning', shorts: 0 } });
    const out = { start: [t.phase, t.shorts] };
    S.apply({ advanceTime: 'short' });
    out.one = [t.phase, t.shorts, S.phasePart(t)];
    S.apply({ advanceTime: 'short' });
    out.two = [t.phase, t.shorts];
    const bad = S.apply({ setTime: { day: 1, phase: 'evening', shorts: 2 } });
    out.refused = bad.rejected.map(x => x.reason);
    return out;
  });
  assert.deepEqual(r.start, ['morning', 0]);
  assert.deepEqual(r.one, ['morning', 1, 'late']);
  assert.deepEqual(r.two, ['afternoon', 0], 'two shorts make the phase');
  assert.ok(r.refused.some(x => x.includes('shorts must be 0 to 1')), JSON.stringify(r.refused));

  const page2 = await h.open();
  await start(page2);
  const lw = await page2.evaluate(() => {
    const S = Game.State, t = Game.state.time;
    S.apply({ setTime: { day: 1, phase: 'morning', shorts: 0 } });
    S.apply({ advanceTime: 'short' });
    const one = S.phasePart(t);
    S.apply({ advanceTime: 'short' });
    const two = [t.phase, t.shorts, S.phasePart(t)];
    S.apply({ advanceTime: 'short' });
    return { one, two, three: [t.phase, t.shorts] };
  });
  assert.deepEqual(lw, { one: 'mid', two: ['morning', 2, 'late'], three: ['afternoon', 0] }, 'Low Water: three shorts a phase');
});

s.test('rules.romance.gates.trust 10 opens the night at trust 10: Jodie at spark 55, romance 45, trust 12 and knows 35 says yes, where the built-in gates say "trust 12 under 30"', async h => {
  const page = await h.open();
  await start(page);
  const before = await page.evaluate(() => {
    const S = Game.State;
    S.apply({ npcKnownToPlayer: ['npc_jodie'] });
    S.apply({ relSet: { npcId: 'npc_jodie', s: 55, m: 45, w: 60, t: 12, k: 35 } });
    const g = Game.Rel.intimateGate(S.npc('npc_jodie'));
    return [g.ok, g.short];
  });
  assert.deepEqual(before, [false, ['trust 12 under 30']]);
  await preview(page, { romance: { gates: { trust: 10 } } });
  const r = await page.evaluate(async j => {
    const S = Game.State, R = Game.Rel;
    const g = R.intimateGate(S.npc(j));
    __put(Game.state.player.locationId, [j], 2, 'evening');
    const said = await __say(j, 'Stay with me tonight.', { romantic: 'more' });
    return { gate: [g.ok, g.short], G: R.GATES.intimate, live: R.gate('intimate'), said };
  }, J);
  assert.deepEqual(r.gate, [true, []]);
  assert.deepEqual(r.G, { spark: 50, romance: 40, trust: 10, knows: 30 }, 'Rel.GATES.intimate is the live row');
  assert.deepEqual(r.live, r.G);
  assert.equal(r.said.roll, null, 'a yes rolls nothing (the intimacy roll is task M4-B\'s)');
  assert.ok(r.said.rom.some(l => /says yes/.test(l)), JSON.stringify(r.said.rom));
});

s.test('rules.romance.defaults.difficulty easy: an unlisted adult (Dewayne) takes a flirt at easy, and the flirt rolls charm at easy; the built-in default is hard', async h => {
  const page = await h.open();
  await start(page);
  const lw = await page.evaluate(d => { const S = Game.State; S.apply({ npcKnownToPlayer: [d] }); S.apply({ relSet: { npcId: d, k: 12 } }); return [Game.Rel.tuningOf(S.npc(d)).difficulty, Game.Rel.flirtDifficulty(S.npc(d))]; }, D);
  assert.deepEqual(lw, ['hard', 'hard']);
  await preview(page, { romance: { defaults: { difficulty: 'easy' } } });
  const r = await page.evaluate(async d => {
    const S = Game.State, R = Game.Rel;
    const out = { tuning: R.tuningOf(S.npc(d)), defaults: R.ROMANCE_DEFAULTS, welcome: R.welcomeOf(S.npc(d)) };
    __put('loc_pittmans', [d], 2, 'afternoon');
    __roll(17);
    out.said = await __say(d, 'You clean up nice, you know that?', { romantic: 'flirt' });
    return out;
  }, D);
  assert.deepEqual(r.tuning, { sparkRate: 0.5, romanceRate: 0.5, opensAt: 10, difficulty: 'easy', listed: false });
  assert.deepEqual(r.defaults, { sparkRate: 0.5, opensAt: 10, difficulty: 'easy' });
  assert.deepEqual(r.welcome, { ok: true, why: null, difficulty: 'easy' });
  assert.deepEqual(r.said.roll, ['charm', 'easy', 'success']);
});

s.test('rules.romance.enabled false: Rel.eligible is false for every adult, a flirt is turned aside kindly with no roll and no spark, the night is refused, and welcomeOf says romance is off in this story', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { romance: { enabled: false } });
  const r = await page.evaluate(async ([d, j]) => {
    const S = Game.State, R = Game.Rel;
    const adults = Game.state.npcs.filter(n => !R.isMinor(n));
    S.apply({ npcKnownToPlayer: [d, j] });
    S.apply({ relSet: { npcId: d, k: 30 } });
    const spark = S.apply({ relSet: { npcId: j, s: 55, m: 45, w: 60, t: 40, k: 40 } });
    const out = { adults: adults.length, eligible: adults.filter(n => R.eligible(n)).map(n => n.id), welcome: R.welcomeOf(S.npc(d)), on: R.romanceOn(), sparkRefused: spark.rejected.map(x => x.reason) };
    out.gate = R.intimateGate(S.npc(j));
    __put('loc_pittmans', [d], 2, 'afternoon');
    const s0 = __tr(d).s;
    __roll(20);
    out.flirt = await __say(d, 'You clean up nice, you know that?', { romantic: 'flirt' });
    out.ds = __tr(d).s - s0;
    out.s = __tr(d).s;
    return out;
  }, [D, J]);
  assert.ok(r.adults > 10);
  assert.deepEqual(r.eligible, [], 'nobody');
  assert.equal(r.on, false);
  assert.deepEqual(r.welcome, { ok: false, why: 'romance is off in this story' });
  assert.ok(r.sparkRefused.some(x => /spark stays 0 for npc_jodie/.test(x)), JSON.stringify(r.sparkRefused));
  assert.equal(r.gate.ok, false);
  assert.equal(r.flirt.roll, null, 'no roll');
  assert.ok(r.flirt.rom.some(l => /turns it aside, kindly/.test(l)), JSON.stringify(r.flirt.rom));
  assert.deepEqual([r.ds, r.s], [0, 0], 'no spark');
});

s.test('the minor rule is no dial: with every romance gate at 0 and romance on, a 15-year-old (Austin) is still not eligible, the night refused and a relSet of spark refused', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { romance: { enabled: true, gates: { spark: 0, romance: 0, trust: 0, knows: 0 }, defaults: { opensAt: 0, difficulty: 'easy' } } });
  const r = await page.evaluate(a => {
    const S = Game.State, R = Game.Rel, n = S.npc(a);
    const res = S.apply({ relSet: { npcId: a, s: 40 } });
    const g = R.intimateGate(n);
    return { age: n.age, eligible: R.eligible(n), gate: [g.ok, g.short], welcome: R.welcomeOf(n), refused: res.rejected.map(x => x.reason), s: R.tracksOf(n).s, adult: R.eligible(S.npc('npc_jodie')) };
  }, AUSTIN);
  assert.equal(r.age, 15);
  assert.equal(r.eligible, false);
  assert.equal(r.gate[0], false);
  assert.equal(r.gate[1][0], 'under 18', "refused first as a minor (Austin's own trust -15 also falls short of 0)");
  assert.deepEqual(r.welcome, { ok: false, why: 'under 18' });
  assert.ok(r.refused.some(x => /spark stays 0 for npc_austin/.test(x)), JSON.stringify(r.refused));
  assert.equal(r.s, 0);
  assert.equal(r.adult, true, 'an adult is, with these gates');
});

s.test('the exported readers read as before for the built-in pack: Game.Dice.TARGETS, Game.Rel.GATES (frozen, its floors and intimate rows the pack\'s, the rest constant), Game.Rel.ROMANCE_DEFAULTS and Game.State.LIMITS.storyPoints; a preview moves them and setPreview(null) puts them back', async h => {
  const page = await h.open();
  const read = () => page.evaluate(() => {
    const R = Game.Rel;
    return {
      targets: Game.Dice.TARGETS, floors: R.GATES.floors, intimate: R.GATES.intimate, couch: R.GATES.couch, rd: R.ROMANCE_DEFAULTS, sp: Game.State.LIMITS.storyPoints,
      frozen: [Object.isFrozen(R.GATES), Object.isFrozen(R.GATES.couch), Object.isFrozen(R.GATES.jealousy.partner)], gate: [R.gate('floors') === R.GATES.floors, R.gate('secret') === R.GATES.secret, R.gate('nope')],
      keys: Object.keys(R.GATES).join(' ')
    };
  });
  const lw = await read();
  assert.deepEqual(lw.targets, { easy: 8, normal: 12, hard: 15, very_hard: 18 });
  assert.deepEqual(lw.floors, { ask: 'hard', lie: [[-25, 'hard'], [-50, 'very_hard']], intimidateHard: 'hard' });
  assert.deepEqual(lw.intimate, { spark: 50, romance: 40, trust: 30, knows: 30 });
  assert.deepEqual(lw.couch, { wave: 28, liking: 25, trust: 0, owedLiking: -25 });
  assert.deepEqual(lw.rd, { sparkRate: 0.5, opensAt: 10, difficulty: 'hard' });
  assert.equal(lw.sp, 3);
  assert.deepEqual(lw.frozen, [true, true, true]);
  assert.deepEqual(lw.gate, [true, true, null]);
  assert.equal(lw.keys, 'social intimidate deceive floors compliance secret couch rescue seats dealer rumour grudge favour report wontSell needs spark intimate leverage owed jealousy council epilogue', 'the rows in their old order');
  await preview(page, { dcs: { easy: 6 }, floors: { ask: 'very_hard' }, romance: { gates: { spark: 70 }, defaults: { opensAt: 20 } }, storyPoints: { max: 4 } });
  const pv = await read();
  assert.deepEqual([pv.targets.easy, pv.floors.ask, pv.floors.intimidateHard, pv.intimate.spark, pv.intimate.trust, pv.rd.opensAt, pv.sp], [6, 'very_hard', 'hard', 70, 30, 20, 4]);
  await page.evaluate(() => Game.Pack.setPreview(null));
  const back = await read();
  assert.deepEqual(back, lw);
});

s.run();
