'use strict';
/* Engine-world fixes (docs/notes/engine-world.md), against the mock provider
   and driven through window.Game: the dice (conditions with sign and size,
   the dice table, the retry lock as a set of family + target keys, repeated
   asks, threat and fight damage, complications that fit), the town's
   matcher and plausibility check (tags, kin words, titles, words the roles
   do not use, head nouns, places made in play), and the living world
   (seeds with lists, requires / alt and effects; clock completions with
   requires / alt, news and odds; town events and the epilogue; missed
   obligations; grudges and favours: one per memory, a cooldown, got even,
   templates that fit; attitude drift; weather by season; knockDown and
   arrestPlayer). Every id and name comes from Game.data or Game.state.
   Ops other agents add to State (addNews, playerHp, ...) are checked only
   when this build has them; World notes every news line in World.recent
   (kind 'news') either way. Run with: node tests/run.cjs engine-world */
const assert = require('assert/strict');
const { suite, quickStart, sendText, findScene, place } = require('./helpers.cjs');

const s = suite('engine-world-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const news = page => page.evaluate(() => Game.World.recent.filter(e => e.kind === 'news').map(e => e.text));
const hasOp = (page, op) => page.evaluate(o => Game.State.EFFECT_OPS.includes(o), op);

// ----- dice -----

s.test('conditions count their sign and size; a stat name inside a word, or text with no number, counts nothing', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const D = Game.Dice;
    const c = (effect, stat, untilDay, day) => D.conditionAffects({ name: 'x', effect, untilDay }, stat, day);
    const G = Game;
    G.State.apply({ conditionsAdded: [{ name: 'Fired up', effect: '+2 might, feeling great', untilDay: 5 }, { name: 'Charming', effect: 'feeling charming', untilDay: 5 }] });
    return {
      plus: [c('+2 might, feeling great', 'might'), c('+2 might, feeling great', 'wits')],
      all: ['might', 'wits', 'charm', 'stealth'].map(st => c('-1 all', st)),
      mixed: [c('+1 charm, -1 wits', 'charm'), c('+1 charm, -1 wits', 'wits'), c('+1 charm, -1 wits', 'might')],
      sum: c('-1 might, -1 all', 'might'),
      minus: c('−2 stealth', 'stealth'),
      to: c('-1 to wits', 'wits'),
      words: [c('feeling charming', 'charm'), c('the might of the river', 'might'), c('tired', 'wits'), c('all shook up', 'wits')],
      expired: [c('-1 might', 'might', 3, 4), c('-1 might', 'might', 4, 4)],
      mods: G.Dice.modifiersFor(G.state, { stat: 'might' }).map(m => [m.label, m.value]),
      charmMods: G.Dice.modifiersFor(G.state, { stat: 'charm' }).map(m => m.label)
    };
  });
  assert.deepEqual(r.plus, [2, 0], '"+2 might, feeling great" is +2 might, nothing else');
  assert.deepEqual(r.all, [-1, -1, -1, -1]);
  assert.deepEqual(r.mixed, [1, -1, 0]);
  assert.equal(r.sum, -2, 'parts add up');
  assert.equal(r.minus, -2, 'a typographic minus counts');
  assert.equal(r.to, -1);
  assert.deepEqual(r.words, [0, 0, 0, 0], 'no number, no effect; "charming" is not charm');
  assert.deepEqual(r.expired, [0, -1], 'over once its day has passed');
  assert.deepEqual(r.mods, [['Fired up', 2]], 'the roll gets +2, not -1');
  assert.deepEqual(r.charmMods, [], '"feeling charming" changes no roll');
});

s.test('the dice land where the d20 table says (seeded, 4000 rolls a row): normal with no bonus works 60% (45% clean, 15% partial), fails 35%, fumbles 5%', async h => {
  const page = await h.open();
  const rows = await page.evaluate(() => {
    const D = Game.Dice;
    const KEYS = ['critical', 'success', 'partial', 'failure', 'critical_failure'];
    return [['normal', 0], ['hard', 2], ['easy', -1], ['very_hard', 3], ['normal', 7]].map(([difficulty, bonus], i) => {
      const rng = Game.Rng.create(4242 + i);
      const n = 4000;
      const got = Object.fromEntries(KEYS.map(k => [k, 0]));
      for (let k = 0; k < n; k++) got[D.resolve({ stat: 'wits', difficulty, statValue: bonus, modifiers: [], state: null, complication: 'x' }, rng).tier] += 1 / n;
      const want = Object.fromEntries(KEYS.map(k => [k, 0]));
      for (let d = 1; d <= 20; d++) want[D.tier(d, d + bonus, D.target(difficulty))] += 1 / 20;
      return { difficulty, bonus, got, want };
    });
  });
  for (const row of rows) {
    for (const k of Object.keys(row.want)) assert.ok(Math.abs(row.got[k] - row.want[k]) < 0.03, `${row.difficulty} ${row.bonus}: ${k} ${row.got[k].toFixed(3)} vs ${row.want[k].toFixed(3)}`);
  }
  const n0 = rows[0].want;
  assert.ok(Math.abs(n0.critical + n0.success - 0.45) < 1e-9 && Math.abs(n0.partial - 0.15) < 1e-9 && Math.abs(n0.failure - 0.35) < 1e-9 && Math.abs(n0.critical_failure - 0.05) < 1e-9);
  const big = rows[4].want;
  assert.ok(Math.abs(big.critical_failure - 0.05) < 1e-9 && big.failure === 0, 'a natural 1 still fails with +7');
});

s.test('the retry lock: keyed on the action\'s family and target, not the stat; failed keys pile up per place and phase; a move or a new phase lifts them; a fight on someone still here is never locked', async h => {
  const page = await h.open();
  await quickStart(page);
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(([who, locId]) => {
    const D = Game.Dice;
    const S = Game.State;
    const st = Game.state;
    const away = st.npcs.find(n => n.status === 'free' && n.alive !== false && !S.npcsAt(locId).some(x => x.id === n.id)).id;
    const key = a => D.lockKey(a);
    const k = {
      persuade: key({ actionType: 'persuade', stat: 'charm', targets: [who] }),
      talk: key({ actionType: 'talk', stat: 'wits', targets: [who] }),
      lie: key({ actionType: 'deceive', stat: 'charm', targets: [who] }),
      climb: key({ actionType: 'other', stat: 'might', targets: [] }),
      climb2: key({ actionType: 'other', stat: 'might', targets: [] }),
      pick: key({ actionType: 'use', stat: 'stealth', targets: [] }),
      fightHere: key({ actionType: 'attack', stat: 'might', targets: [who] }),
      fightGone: key({ actionType: 'attack', stat: 'might', targets: [away] }),
      explicit: D.lockKey({ actionType: 'attack', stat: 'might', targets: [who] }, { presentIds: [] })
    };
    S.apply({ lastRollKey: D.lockFor({ tier: 'failure' }, k.persuade) });
    S.apply({ lastRollKey: D.lockFor({ tier: 'critical_failure' }, k.climb) });
    const both = ['persuade', 'talk', 'climb', 'climb2', 'lie', 'pick'].map(x => D.isLocked(k[x]));
    S.apply({ lastRollKey: D.lockFor({ tier: 'success' }, k.pick) });
    const kept = [D.isLocked(k.persuade), D.isLocked(k.climb), D.isLocked(k.pick)];
    const noop = D.clearLocks({ move: false, phase: false });
    const stillAfterNoop = D.isLocked(k.persuade);
    // A new phase: the same ask has a new key.
    const snapPhase = st.time.phase;
    S.apply({ advanceTime: 'long' });
    const afterPhase = [D.isLocked(D.lockKey({ actionType: 'persuade', stat: 'charm', targets: [who] })), st.time.phase !== snapPhase];
    const cleared = D.clearLocks({ phase: true });
    const lock = st.meta.lastRollKey;
    // Dice.lock and a move.
    D.lock(k.pick);
    const lockedOutright = !!st.meta.lastRollKey;
    const other = S.loc(st.player.locationId).exits.find(x => !S.loc(x).closed);
    S.apply({ playerLocationId: other });
    const movedKey = D.lockKey({ actionType: 'use', stat: 'stealth', targets: [] });
    return { k, both, kept, noop, stillAfterNoop, afterPhase, cleared, lock, lockedOutright, movedLocked: D.isLocked(movedKey), clearedMove: D.clearLocks({ move: true }), after: st.meta.lastRollKey };
  }, [sc.npcs[0].id, sc.loc.id]);
  assert.equal(r.k.persuade, r.k.talk, 'a persuade and a talk aimed at the same person are one ask, whatever the stat');
  assert.notEqual(r.k.persuade, r.k.lie, 'a lie is another approach');
  assert.equal(r.k.climb, r.k.climb2);
  assert.notEqual(r.k.climb, r.k.pick, 'aimed at nothing in particular, the stat tells climbing from picking a lock');
  assert.equal(r.k.fightHere, null, 'no key for a fight with someone still here');
  assert.ok(r.k.fightGone, 'someone who is not here can be locked');
  assert.ok(r.k.explicit, 'the people present can be passed in');
  assert.deepEqual(r.both, [true, true, true, true, false, false], 'two failures, two locks');
  assert.deepEqual(r.kept, [true, true, false], 'a success elsewhere lifts nothing and locks nothing');
  assert.equal(r.noop, false);
  assert.equal(r.stillAfterNoop, true);
  assert.deepEqual(r.afterPhase, [false, true], 'a new phase, a new key');
  assert.equal(r.cleared, true);
  assert.equal(r.lock, null);
  assert.equal(r.lockedOutright, true);
  assert.equal(r.movedLocked, false, 'somewhere else the same try is a new key');
  assert.equal(r.clearedMove, true);
  assert.equal(r.after, null);
});

s.test('a fight goes on: a missed swing at someone still here does not lock the next swing', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const sc = await findScene(page, { min: 1, watchy: false, notTypes: ['police', 'watch'] });
  await place(page, sc.loc.id, sc.phase);
  const who = sc.npcs[0];
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await sendText(page, `I punch ${who.name}`);
  const first = await page.evaluate(() => ({ type: Game.Pipeline.lastTurn.action.actionType, tier: Game.Pipeline.lastTurn.roll && Game.Pipeline.lastTurn.roll.tier, turn: Game.state.meta.turn }));
  assert.equal(first.type, 'attack');
  assert.equal(first.tier, 'failure');
  const stillHere = await page.evaluate(([id, loc]) => Game.State.npcsAt(loc).some(n => n.id === id), [who.id, sc.loc.id]);
  if (!stillHere) return; // they walked off between turns: nothing to show
  await page.evaluate(() => Game.Pipeline.forceNextRoll(4));
  await sendText(page, `I punch ${who.name}`);
  const second = await page.evaluate(() => ({ d20: Game.Pipeline.lastTurn.roll && Game.Pipeline.lastTurn.roll.d20, turn: Game.state.meta.turn, notice: (document.querySelector('#feed .f-notice:last-child') || {}).textContent || '' }));
  assert.equal(second.d20, 4, 'the second swing rolls');
  assert.equal(second.turn, first.turn + 1);
  assert.ok(!/Change something first/.test(second.notice));
});

s.test('repeated asks: a social success is counted, not locked, and diminishing() is the share the next one earns', async h => {
  const page = await h.open();
  await quickStart(page);
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(who => {
    const D = Game.Dice;
    const S = Game.State;
    const ask = D.lockKey({ actionType: 'persuade', stat: 'charm', targets: [who] });
    const climb = D.lockKey({ actionType: 'other', stat: 'might', targets: [] });
    const before = D.successes(ask);
    S.apply({ lastRollKey: D.lockFor({ tier: 'success' }, ask) });
    S.apply({ lastRollKey: D.lockFor({ tier: 'partial' }, ask) });
    S.apply({ lastRollKey: D.lockFor({ tier: 'success' }, climb) });
    return { before, after: D.successes(ask), climb: D.successes(climb), locked: D.isLocked(ask), shares: [0, 1, 2, 3, 4].map(D.diminishing), noGame: D.lockFor({ tier: 'success' }, 'k', null) };
  }, sc.npcs[0].id);
  assert.equal(r.before, 0);
  assert.equal(r.after, 2, 'two successes of the same ask');
  assert.equal(r.climb, 0, 'only social asks are counted');
  assert.equal(r.locked, false, 'asking again is never refused');
  assert.deepEqual(r.shares, [1, 0.5, 0.25, 0, 0]);
});

s.test('Dice.threat reads role, tags and age; Dice.fightDamage: a partial costs 1, a failure 1 to 3, a fumble 3', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const D = Game.Dice;
    const st = Game.state;
    const free = st.npcs.filter(n => n.status === 'free');
    const police = free.find(n => (n.tags || []).includes('police'));
    const old = free.find(n => n.age >= 70 && !(n.tags || []).includes('police'));
    const young = free.find(n => n.age <= 17);
    const plain = free.find(n => n.age >= 25 && n.age < 60 && !/police|officer/.test(n.role) && !(n.tags || []).some(t => ['police', 'armed', 'tough'].includes(t)));
    const rng = Game.Rng.create(9);
    const fails = Array.from({ length: 200 }, () => D.fightDamage('failure', rng));
    return {
      police: police && D.threat(police), old: old && D.threat(old), young: young && D.threat(young), plain: plain && D.threat(plain),
      tough: D.threat({ role: 'mill hand', tags: ['tough'], age: 40 }), armed: D.threat({ role: 'farmer', tags: ['armed'], age: 75 }), frail: D.threat({ role: 'clerk', tags: ['frail'], age: 40 }),
      none: D.threat(null),
      dmg: [D.fightDamage('partial'), D.fightDamage('critical_failure'), D.fightDamage('success'), D.fightDamage('critical')],
      fails: [Math.min(...fails), Math.max(...fails)]
    };
  });
  assert.equal(r.police, 'hard');
  assert.equal(r.old, 'easy');
  assert.equal(r.young, 'easy');
  assert.equal(r.plain, 'normal');
  assert.deepEqual([r.tough, r.armed, r.frail, r.none], ['hard', 'hard', 'easy', 'normal'], 'armed wins over old');
  assert.deepEqual(r.dmg, [1, 3, 0, 0]);
  assert.deepEqual(r.fails, [1, 3]);
});

s.test('complications fit the action, the tier, who is here and the day; a person in one is always someone present, named; about five carry effects, filled in', async h => {
  const page = await h.open();
  await quickStart(page);
  const sc = await findScene(page, { min: 2 });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(([ids, locId]) => {
    const D = Game.Dice;
    const T = Game.data.TABLES.complications;
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const entry = t => T.find(c => new RegExp('^' + esc(c.text).replace('\\{witness\\}', '.+') + '$').test(t));
    const types = ['attack', 'persuade', 'sneak', 'search', 'talk', 'steal', 'use', 'intimidate', 'buy'];
    const runs = [];
    for (let i = 0; i < 600; i++) {
      const rng = Game.Rng.create(i * 7 + 1);
      const actionType = types[i % types.length];
      const tier = ['partial', 'failure', 'critical_failure'][i % 3];
      const nobody = Math.floor(i / 3) % 2 === 0;
      const day = Math.floor(i / 6) % 3 === 0 ? 1 : 4;
      const c = D.complication({ actionType, tier, presentIds: nobody ? [] : ids, day, locationId: locId }, rng);
      const e = entry(c.text);
      runs.push({ actionType, tier, nobody, day, text: c.text, found: !!e, kinds: e && e.kinds, tiers: e && e.tiers, needsPerson: !!(e && e.needsPerson), notDay1: !!(e && e.notDay1), witnessId: c.witnessId, effects: c.effects, entryEffects: e && e.effects ? e.effects.length : 0 });
    }
    // Through Dice.resolve: a failure rolled in the live game carries its complication's effects.
    const fail = D.resolve({ stat: 'wits', difficulty: 'normal', d20: 2, actionType: 'persuade', npcId: ids[0] });
    return {
      count: T.length, withEffects: T.filter(c => Array.isArray(c.effects) && c.effects.length).length,
      runs, names: Object.fromEntries(ids.map(id => [id, Game.State.npc(id).name])),
      fail: { text: fail.complication, effects: fail.complicationEffects, witness: fail.complicationWitness, found: !!entry(fail.complication || '') }
    };
  }, [sc.presentIds, sc.loc.id]);
  const KIND = { attack: 'physical', search: 'physical', use: 'physical', persuade: 'social', talk: 'social', intimidate: 'social', buy: 'social', sneak: 'stealth', steal: 'stealth' };
  assert.equal(r.count, 20);
  assert.ok(r.withEffects >= 4 && r.withEffects <= 6, `${r.withEffects} carry effects`);
  let named = 0;
  let filled = 0;
  for (const x of r.runs) {
    const what = `${x.actionType} ${x.tier} ${x.nobody ? 'alone' : 'with people'} day ${x.day}: ${x.text}`;
    assert.ok(x.found, 'from the table: ' + what);
    assert.ok(x.tiers.includes(x.tier === 'partial' ? 'partial' : 'failure') || x.tiers.includes('both'), 'tier fits: ' + what);
    assert.ok(x.kinds.includes(KIND[x.actionType]) || x.kinds.includes('any'), 'kind fits: ' + what);
    if (x.nobody) assert.ok(!x.needsPerson && !x.witnessId, 'nobody here, nobody in it: ' + what);
    if (x.day === 1) assert.ok(!x.notDay1, 'not on day 1: ' + what);
    assert.ok(!/[{}]/.test(x.text), 'no placeholder left in the text: ' + what);
    if (x.needsPerson) {
      assert.ok(Object.keys(r.names).includes(x.witnessId), 'the witness is someone here: ' + what);
      assert.ok(x.text.includes(r.names[x.witnessId]), 'and is named: ' + what);
      named += 1;
    }
    assert.ok(!/\{(npcId|npc|playerName|player|witnessId|witness|place)\}/.test(JSON.stringify(x.effects)), 'effects filled: ' + what);
    assert.equal(x.effects.length, x.entryEffects, 'no effect dropped: ' + what);
    if (x.effects.some(e => e.npcId === x.witnessId || (e.rumour && e.rumour.sourceNpcId === x.witnessId))) filled += 1;
  }
  assert.ok(named > 20 && filled > 5, `people named ${named}, effects aimed at the witness ${filled}`);
  assert.ok(!r.runs.some(x => x.actionType === 'attack' && /costs more than/.test(x.text)), 'a fight never costs more than you have on you');
  assert.ok(r.fail.found && Array.isArray(r.fail.effects), 'Dice.resolve rolls a fitting complication with its effects');
});

s.test('Tables.price counts the player\'s own price factor until its day, on top of the town\'s', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const g = G.data.TABLES.items.goods[0];
    const base = G.Tables.price(g.name);
    // The flags are reserved (State), so the real op sets them: factor 2 until tomorrow.
    const r1 = G.State.apply({ effects: [{ op: 'playerPrice', factor: 2, days: 1 }] });
    const doubled = G.Tables.price(g.name);
    // Past its day it no longer counts (expiry itself is State.expireDaily's job, tested there).
    G.state.flags.playerPriceUntilDay = G.state.time.day - 1;
    return { raw: g.price, base, doubled, over: G.Tables.price(g.name), rejected: r1.rejected };
  });
  assert.equal(r.base, r.raw);
  assert.deepEqual(r.rejected, [], 'the playerPrice op is accepted');
  assert.equal(r.doubled, Math.max(1, Math.round(r.raw * 2)));
  assert.equal(r.over, r.base, 'not after its day');
});

// ----- the town: who and what -----

s.test('people asked for by what they are: tags, words the roles do not use, kin words, Mr. and Mrs.; someone who is nobody is a person not there, never a thing', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game;
    const T = G.Town;
    const st = G.state;
    const S = G.State;
    const at = (d, loc) => { const m = T.matchExisting('new:' + d, loc ? { locationId: loc } : undefined); return m && m.kind === 'npc' ? S.npc(m.id) : null; };
    const tags = n => n.tags || [];
    const first = n => n.name.split(' ')[0];
    const rel = (n, w) => (n.relations || []).find(x => x.relation === w && S.npc(x.npcId));
    const kid = st.npcs.find(n => n.status === 'free' && rel(n, 'father') && rel(n, 'mother'));
    const fams = {};
    for (const n of st.npcs.filter(x => x.status === 'free')) { const f = n.name.split(' ').slice(-1)[0]; (fams[f] = fams[f] || []).push(n); }
    const fam = Object.keys(fams).find(f => fams[f].some(n => n.pronouns === 'he') && fams[f].some(n => n.pronouns === 'she'));
    const summary = n => (n ? { id: n.id, pronouns: n.pronouns, age: n.age, tags: tags(n), role: n.role } : null);
    // A place and phase with exactly one officer there, not the first one in the cast.
    const cops = st.npcs.filter(n => tags(n).includes('police'));
    const copHere = (() => {
      for (const l of st.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
        const c = S.npcsAt(l.id, ph).filter(n => tags(n).includes('police'));
        if (c.length === 1 && c[0].id !== cops[0].id) return { loc: l.id, ph, id: c[0].id };
      }
      return null;
    })();
    let presentCop = null;
    if (copHere) { while (st.time.phase !== copHere.ph) S.apply({ advanceTime: 'long' }); presentCop = at('the cop', copHere.loc); }
    return {
      words: Object.fromEntries(['the dispatcher', 'the foreman', 'the cop', 'the deputy', 'the officer', 'the preacher', 'the kid', 'the teen', 'the boy', 'the girl', 'the cashier', 'the maid', 'the dealer', 'the old man', 'the old woman', 'the barkeep', 'the mechanic', 'the nurse', 'the teacher', 'the farmer', 'the bookie'].map(d => [d, summary(at(d))])),
      kin: kid && { kid: kid.id, father: rel(kid, 'father').npcId, mother: rel(kid, 'mother').npcId, dad: summary(at(`${first(kid)}'s dad`)), mom: summary(at(`${first(kid)}'s mother`)), momma: summary(at(`${first(kid)}'s momma`)), daddy: summary(at(`${first(kid)}'s old man`)) },
      titles: fam && { mrs: summary(at(`Mrs. ${fam}`)), mr: summary(at(`Mr. ${fam}`)) },
      nobody: ['the guy at the counter', 'the woman by the jukebox', 'a man at the end of the bar'].map(d => [at(d), T.guessKind(d), T.plausible('new:' + d, 'bar').kind]),
      copHere, presentCop: presentCop && presentCop.id,
      sameRel: [T.sameRel('dad', 'father'), T.sameRel('mother', 'father'), T.sameRel('kid', 'son'), T.sameRel('his wife', 'husband'), T.sameRel('wife', 'brother'), T.sameRel('', 'wife')]
    };
  });
  const w = r.words;
  const role = (x, re) => !!x && re.test(x.role);
  const tagged = (x, ...t) => !!x && x.tags.some(y => t.includes(y));
  assert.ok(tagged(w['the dispatcher'], 'dispatcher') || role(w['the dispatcher'], /dispatcher/), 'the dispatcher is the cast\'s dispatcher, not an item');
  assert.ok(tagged(w['the foreman'], 'foreman') || role(w['the foreman'], /foreman/));
  for (const d of ['the cop', 'the deputy', 'the officer']) assert.ok(tagged(w[d], 'police') || role(w[d], /\b(officer|chief)\b/), d);
  assert.ok(tagged(w['the preacher'], 'pastor', 'priest') || role(w['the preacher'], /pastor/), 'the preacher is the pastor');
  for (const d of ['the kid', 'the teen', 'the boy', 'the girl']) assert.ok(tagged(w[d], 'teenager') || (w[d] && w[d].age <= 17), d + ' is a teenager');
  assert.equal(w['the boy'].pronouns, 'he');
  assert.equal(w['the girl'].pronouns, 'she');
  assert.ok(tagged(w['the cashier'], 'cashier', 'clerk') || role(w['the cashier'], /cashier|clerk|register/));
  assert.ok(tagged(w['the maid'], 'maid', 'housekeeper'));
  assert.ok(tagged(w['the dealer'], 'dealer'));
  assert.ok(w['the old man'] && w['the old man'].pronouns === 'he' && w['the old man'].age >= 65);
  assert.ok(w['the old woman'] && w['the old woman'].pronouns === 'she' && w['the old woman'].age >= 65);
  assert.ok(tagged(w['the barkeep'], 'bartender'));
  for (const [d, t] of [['the mechanic', 'mechanic'], ['the nurse', 'nurse'], ['the teacher', 'teacher'], ['the farmer', 'farmer'], ['the bookie', 'bookie']]) assert.ok(tagged(w[d], t) || role(w[d], new RegExp(t)), d);
  assert.ok(r.kin, 'someone in the cast has a father and a mother on record');
  assert.equal(r.kin.dad.id, r.kin.father, '"X\'s dad" is their father');
  assert.equal(r.kin.daddy.id, r.kin.father, '"X\'s old man" too');
  assert.equal(r.kin.mom.id, r.kin.mother, '"X\'s mother" is their mother, never the father');
  assert.equal(r.kin.momma.id, r.kin.mother);
  assert.ok(r.titles, 'a family with a he and a she');
  assert.equal(r.titles.mrs.pronouns, 'she', 'Mrs. is a she');
  assert.equal(r.titles.mr.pronouns, 'he', 'Mr. is a he');
  for (const [m, kind, pkind] of r.nobody) { assert.equal(m, null, 'nobody in the cast'); assert.equal(kind, 'npc'); assert.equal(pkind, 'npc', 'a person who is not there, not a thing'); }
  if (r.copHere) assert.equal(r.presentCop, r.copHere.id, 'the officer who is here first');
  assert.deepEqual(r.sameRel, [true, true, true, true, false, false]);
});

s.test('plausibility reads the head noun: an Army jacket, a King James Bible, a laser level, a toy robot and a sword are ordinary; a robot, a dragon\'s egg and a ray gun are not', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const T = Game.Town;
    const v = (d, type, era) => { const x = T.plausible('new:' + d, type || 'bar', era ? { era } : undefined); return [x.plausible, x.kind]; };
    return {
      ok: ['an Army jacket', 'a King James Bible', 'a laser level', 'a toy robot', 'a plastic dragon', 'a sword', 'a crossbow', 'a musket', 'a dragon tattoo', 'a poster of a wizard', 'a ghost story'].map(d => [d, v(d)]),
      no: ['a robot', 'a dragon', "a dragon's egg", 'a ray gun', 'a magic sword', 'an army', 'a wizard selling potions', 'the King', 'a knight in armour'].map(d => [d, v(d)]),
      unknownType: v('a coil of rope', 'mudflat'),
      fantasy: [v('a sword', 'tavern', 'fantasy'), v('a pickup truck', 'tavern', 'fantasy')],
      kinds: ['a King James Bible', 'the back room', 'Colt\'s dad', 'the dispatcher', 'a deputy\'s hat', 'Mavis'].map(d => T.guessKind(d))
    };
  });
  for (const [d, [ok]] of r.ok) assert.equal(ok, true, d);
  for (const [d, [ok]] of r.no) assert.equal(ok, false, d);
  assert.deepEqual(r.unknownType, [true, 'item'], 'any place type gets the generic judgement');
  assert.deepEqual(r.fantasy, [[true, 'item'], [false, 'item']]);
  assert.deepEqual(r.kinds, ['item', 'location', 'npc', 'npc', 'item', 'npc']);
});

s.test('places made in play: one here or next door is reused, the bar\'s back room is not the diner\'s; twelve a game, then no more', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const st = G.state;
    const here = st.player.locationId;
    const far = st.locations.find(l => l.id !== here && !l.exits.includes(here) && !l.closed && l.away !== true && l.discovered !== false);
    const loc = G.Tables.location({ name: 'Back room', type: 'room', fromId: here }, G.Rng.create(3));
    S.apply({ addLocations: [loc] });
    const nearMatch = G.Town.matchExisting('new:the back room', { locationId: here });
    const farMatch = G.Town.matchExisting('new:the back room', { locationId: far.id });
    const made0 = G.Town.placesMade();
    for (let i = 0; i < 11; i++) S.apply({ addLocations: [G.Tables.location({ name: `Shed ${i + 1}`, type: 'shed', fromId: far.id }, G.Rng.create(i))] });
    return { id: loc.id, nearMatch, farMatch, made0, made: G.Town.placesMade(), cellar: G.Town.plausible('new:the cellar', 'bar'), rope: G.Town.plausible('new:a coil of rope', 'bar').plausible };
  });
  assert.deepEqual(r.nearMatch, { kind: 'location', id: r.id }, 'from the place it is off');
  assert.equal(r.farMatch, null, 'not from across town: a new one would be made there');
  assert.equal(r.made0, 1);
  assert.equal(r.made, 12);
  assert.equal(r.cellar.plausible, false, 'no thirteenth place');
  assert.match(r.cellar.reason, /no more new places/);
  assert.equal(r.rope, true, 'things are still fine');
});

// ----- the living world -----

s.test('seeds: a list of places or people, requires with alt (or a no-op), and effects with placeholders filled when they fire', async h => {
  const page = await h.open();
  await quickStart(page);
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(([locId, who]) => {
    const G = Game;
    const st = G.state;
    const S = G.State;
    const other = st.locations.find(l => l.id !== locId && l.away !== true).id;
    const base = { cause: 'test', fired: false, hidden: true };
    // Seeds the town writes keep every field (State's own seed check is the engine-state agent's).
    st.seeds.push(
      Object.assign({ id: 'seed_t_list_loc', effect: 'A list of places fired.', trigger: { type: 'location', value: [other, locId] } }, base),
      Object.assign({ id: 'seed_t_list_npc', effect: 'A list of people fired.', trigger: { type: 'npc', value: ['npc_nobody_here', who] } }, base),
      Object.assign({ id: 'seed_t_alt', effect: 'The main thing.', trigger: { type: 'day', value: 1 }, requires: { flagsSet: ['tNever'] }, alt: { text: 'The other thing.', effects: [{ op: 'setFlag', key: 'tAltRan', value: true }] } }, base),
      Object.assign({ id: 'seed_t_noop', effect: 'Never told.', trigger: { type: 'day', value: 1 }, requires: { npcFree: ['npc_nobody_at_all'] }, effects: [{ op: 'setFlag', key: 'tNoopRan', value: true }] }, base),
      Object.assign({ id: 'seed_t_eff', effect: 'Effects ran.', trigger: { type: 'day', value: 1 }, requires: { npcAt: { [who]: locId } }, origin: { kind: 'town', npcId: who }, effects: [{ op: 'attitudeDelta', npcId: '{npcId}', delta: 7 }, { op: 'setFlag', key: 'tWho', value: '{npc} and {playerName}' }, { op: 'attitudeDelta', npcId: '{witnessId}', delta: 99 }] }, base)
    );
    const att = S.npc(who).attitude;
    G.World.fireSeeds({ locationId: locId, presentNpcIds: [who] });
    const due = st.dueEvents.map(e => e.seedId + ': ' + e.text);
    const fired = ['seed_t_list_loc', 'seed_t_list_npc', 'seed_t_alt', 'seed_t_noop', 'seed_t_eff'].map(id => S.seed(id).fired);
    return { due, fired, flags: { alt: st.flags.tAltRan, noop: st.flags.tNoopRan, who: st.flags.tWho }, att: S.npc(who).attitude - att, name: S.npc(who).name, player: st.player.name };
  }, [sc.loc.id, sc.npcs[0].id]);
  assert.deepEqual(r.fired, [true, true, true, true, true]);
  assert.ok(r.due.includes('seed_t_list_loc: A list of places fired.'), 'any of the places');
  assert.ok(r.due.includes('seed_t_list_npc: A list of people fired.'), 'any of the people');
  assert.ok(r.due.includes('seed_t_alt: The other thing.'), 'requires failed: the alt is told');
  assert.ok(!r.due.some(x => x.startsWith('seed_t_noop')), 'requires failed, no alt: nothing is told');
  assert.ok(r.due.includes('seed_t_eff: Effects ran.'));
  assert.equal(r.flags.alt, true, 'the alt\'s effects ran');
  assert.equal(r.flags.noop, undefined, 'a no-op runs no effects');
  assert.equal(r.flags.who, `${r.name} and ${r.player}`, 'placeholders filled');
  assert.equal(r.att, 7, '{npcId} filled; the effect with no witness to fill it was dropped');
});

s.test('a clock completion honours requires and alt, is town news, and clocks roll at their own odds', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const W = G.World;
    const st = G.state;
    const [f1, f2, f3] = st.factions;
    const clock = f => f.clocks[f.activeClock];
    const prime = (f, oc) => { const c = clock(f); c.filled = c.segments - 1; Object.assign(c.onComplete, oc); };
    prime(f1, { text: 'Never told.', requires: { flagsSet: ['tNever'] }, alt: { text: 'The alternative came to pass.', effects: [{ op: 'setFlag', key: 'tClockAlt', value: true }] } });
    prime(f2, { text: 'Also never told.', requires: { npcFree: ['npc_nobody_at_all'] }, effects: [{ op: 'setFlag', key: 'tClockNoop', value: true }] });
    delete clock(f2).onComplete.alt;
    const was = [f1.activeClock, f2.activeClock];
    W.forceClockRoll(1);
    W.forceClockRoll(6, f1.id);
    W.forceClockRoll(6, f2.id);
    const t = st.time;
    const res = W.tick({ from: { day: t.day, phase: t.phase }, to: { day: t.day, phase: 'evening' } });
    const after = [f1.activeClock, f2.activeClock];
    // Met: the text is news.
    prime(f3, { text: 'The third one happened.', requires: { flagsSet: ['tClockAlt'] } });
    W.forceClockRoll(6, f3.id);
    W.tick({ to: { day: t.day, phase: 'night' } });
    // Odds: a faction that only fills on a 6.
    W.forceClockRoll(1);
    const c4 = clock(f3) || null;
    let odds = null;
    if (c4) {
      c4.filled = 0;
      f3.odds = 6;
      W.forceClockRoll(5, f3.id);
      W.tick({ to: { day: t.day, phase: 'night' } });
      const at5 = c4.filled;
      W.forceClockRoll(6, f3.id);
      W.tick({ to: { day: t.day, phase: 'night' } });
      odds = [at5, c4.filled];
    }
    W.forceClockRoll(null);
    return {
      was, after, flags: [st.flags.tClockAlt, st.flags.tClockNoop], events: res.events.map(e => [e.factionId, e.met, e.alt]),
      odds, oddsOf: [W.oddsOf({ odds: '4-6' }), W.oddsOf({ odds: 0.5 }), W.oddsOf({}), W.oddsOf({ odds: 3 }, { odds: 6 })],
      rumour: st.rumours.some(x => x.text === 'The alternative came to pass.'),
      progress: W.clockProgress(f1.id), segs: f1.clocks[0].segments, f1: f1.id, f3: f3.id,
      stateNews: Array.isArray(st.news) ? st.news.map(n => n.text) : null
    };
  });
  r.after.forEach((a, i) => assert.ok(a === r.was[i] + 1 || a === -1, `faction ${i + 1}'s clock handed over (${r.was[i]} -> ${a})`));
  assert.deepEqual(r.flags, [true, undefined], 'the alt ran; the unmet one with no alt did nothing');
  assert.deepEqual(r.events.slice(0, 2), [[r.f1, false, true], [r.events[1][0], false, false]]);
  assert.ok(r.rumour, 'the alt\'s text is what people hear');
  assert.ok(r.progress >= r.segs, 'a finished clock counts in full toward progress');
  const told = await news(page);
  assert.ok(told.some(t => t.includes('The alternative came to pass.')), 'the alt is news');
  assert.ok(told.some(t => t.includes('The third one happened.')), 'a met completion is news');
  assert.ok(!told.some(t => t.includes('never told') || t.includes('Never told')), 'an unmet text is not');
  if (r.stateNews) assert.ok(r.stateNews.includes('The alternative came to pass.'), 'and in state.news through addNews');
  if (r.odds) assert.deepEqual(r.odds, [0, 1], 'odds 6: a 5 fills nothing, a 6 does');
  assert.deepEqual(r.oddsOf, [4, 4, 5, 6], 'odds read from the clock first, then the faction');
});

s.test('town events fire when the clock reaches their day and phase: the first branch that holds, else the default; news, and a scene where the player stands; the epilogue once', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const W = G.World;
    const st = G.state;
    const here = st.player.locationId;
    const away = st.locations.find(l => l.id !== here && l.away !== true).id;
    const d = st.time.day;
    G.State.town.events = [
      { id: 'ev_here', day: d, phase: 'evening', locationId: here, title: 'Here', branches: [{ when: { flagsSet: ['tNope'] }, text: 'Branch one.', effects: [] }, { when: { flagsUnset: ['tNope'] }, text: 'Branch two happens here.', effects: [{ op: 'setFlag', key: 'tBranch', value: 2 }] }], default: { text: 'Default.', effects: [] } },
      { id: 'ev_away', day: d, phase: 'evening', locationId: away, title: 'Away', branches: [{ when: { clockAtLeast: { [st.factions[0].id]: 99 } }, text: 'Never.', effects: [] }], default: { text: 'Default happens away.', effects: [{ op: 'setFlag', key: 'tDefault', value: true }] } },
      { id: 'ev_later', day: d + 1, phase: 'morning', locationId: here, title: 'Later', branches: [], default: { text: 'Tomorrow.', effects: [] } }
    ];
    G.State.town.epilogue = { onDay: d + 30, orFlagsSet: ['tEndNow'], branches: [{ when: { flagsSet: ['tBranch'] }, text: 'The story ends one way.', effects: [] }], default: { text: 'The story ends.', effects: [] } };
    W.forceClockRoll(1);
    const early = W.tick({ to: { day: d, phase: 'afternoon' } });
    const before = W.eventsFired().slice();
    W.tick({ to: { day: d, phase: 'evening' } });
    const fired = W.eventsFired().slice();
    const due = st.dueEvents.map(e => e.text);
    W.tick({ to: { day: d, phase: 'night' } });
    const again = st.dueEvents.filter(e => e.text === 'Branch two happens here.').length;
    const epiBefore = !!st.flags.epilogueShown;
    G.State.apply({ effects: [{ op: 'setFlag', key: 'tEndNow', value: true }] });
    W.tick({ to: { day: d, phase: 'night' } });
    const epi = st.flags.epilogueShown;
    W.tick({ to: { day: d, phase: 'night' } });
    return { early: early.events.length, before, fired, due, again, flags: [st.flags.tBranch, st.flags.tDefault], epiBefore, epi, stateNews: Array.isArray(st.news) ? st.news : null };
  });
  assert.deepEqual(r.before, [], 'nothing before its phase');
  assert.deepEqual(r.fired.sort(), ['ev_away', 'ev_here'], 'both evening events, not tomorrow\'s');
  assert.deepEqual(r.flags, [2, true], 'branch two here (its when holds), the default away');
  assert.ok(r.due.includes('Branch two happens here.'), 'a scene where the player stands');
  assert.ok(!r.due.includes('Default happens away.'), 'not where they are not');
  assert.equal(r.again, 1, 'an event fires once');
  assert.equal(r.epiBefore, false);
  assert.equal(r.epi, true, 'the epilogue on its flag');
  const told = await news(page);
  assert.ok(told.some(t => t.includes('Branch two happens here.')) && told.some(t => t.includes('Default happens away.')), 'both are news');
  assert.equal(told.filter(t => t.includes('The story ends one way.')).length, 1, 'the epilogue once, by its branch');
  if (r.stateNews) assert.ok(r.stateNews.some(n => n.epilogue === true), 'news marked epilogue');
});

s.test('a missed obligation at the morning tick: news (not public) and the person owed comes looking', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false);
    const rec = { id: 'obl_debt_test', kind: 'debt', npcId: n.id, text: `You owe ${n.name} $400`, amount: 400, dueDay: st.time.day, status: 'open', onMiss: [], onMet: [] };
    // State's side (engine-state agent) stood in for: one obligation goes past its day.
    const orig = { tick: S.tickObligations, list: S.obligations };
    let asked = null;
    S.tickObligations = day => { asked = day; if (day > rec.dueDay && rec.status === 'open') { rec.status = 'missed'; return [rec.id]; } return []; };
    S.obligations = () => [rec];
    G.World.forceClockRoll(1);
    const t = st.time;
    const res = G.World.tick({ to: { day: t.day, phase: 'evening' } });
    const notYet = asked;
    const res2 = G.World.tick({ to: { day: t.day + 1, phase: 'morning' } });
    const due = st.dueEvents.find(e => e.npcId === n.id && /came looking/.test(e.text));
    const visit = (st.visits || []).some(v => v.npcId === n.id && v.locationId === st.player.locationId);
    S.tickObligations = orig.tick;
    S.obligations = orig.list;
    return { notYet, asked, due: due && due.text, bring: due && due.bring, visit, notice: res2.events.filter(e => e.kind === 'obligation').map(e => e.notice), name: n.name, events: res.events.length };
  });
  assert.equal(r.notYet, null, 'only on a new morning');
  assert.equal(typeof r.asked, 'number');
  assert.equal(r.due, `${r.name} came looking: You owe ${r.name} $400`);
  assert.equal(r.bring, true);
  assert.equal(r.visit, true, 'they come to the player');
  assert.equal(r.notice.length, 1);
  const told = await page.evaluate(() => Game.World.recent.filter(e => e.kind === 'news').map(e => [e.text, e.public]));
  assert.ok(told.some(([t, pub]) => /^Missed: You owe/.test(t) && pub === false), 'news, not public');
});

s.test('grudges: one per weight-3 memory, a template that fits the person, its effects and public news when it fires, +10 got even, then a 7-day cooldown', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const W = G.World;
    const S = G.State;
    const st = G.state;
    const loose = new Set(st.player.looseEnds.map(x => x.npcId));
    const n = st.npcs.find(x => x.status === 'free' && x.age >= 70 && !loose.has(x.id) && !(x.tags || []).includes('police'));
    const T = G.data.GRUDGE_TEMPLATES;
    const fit = 2;
    T.forEach((t, i) => { if (i !== fit) t.notForTags = ['elderly']; });
    T[fit].effects = [{ op: 'setFlag', key: 'tGrudgeRan', value: '{npcId}' }];
    T[fit].public = true;
    W.forceClockRoll(1);
    W.forceAttitude(n.id, -70);
    S.apply({ newMemories: [{ npcId: n.id, text: 'took my parking spot and laughed about it', weight: 3 }] });
    const day = st.time.day;
    W.tick({ to: { day, phase: 'evening' } });
    const g1 = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === n.id);
    // Its day comes.
    g1[0].trigger.value = day;
    W.fireSeeds({ locationId: st.player.locationId, presentNpcIds: [] });
    const afterFire = S.npc(n.id).attitude;
    // Same memory, angry again: nothing (the memory has had its grudge, and the cooldown runs).
    W.forceAttitude(n.id, -70);
    W.tick({ to: { day, phase: 'night' } });
    const sameMemory = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === n.id).length;
    S.apply({ newMemories: [{ npcId: n.id, text: 'got me thrown out of the bar', weight: 3 }] });
    W.tick({ to: { day, phase: 'night' } });
    const inCooldown = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === n.id).length;
    S.apply({ setTime: { day: day + W.FEELING_COOLDOWN, phase: 'afternoon' } });
    W.tick({ to: { day: day + W.FEELING_COOLDOWN, phase: 'evening' } });
    const g2 = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === n.id);
    return {
      id: n.id, template: g1[0].origin.template, cause: g1[0].cause, effect: g1[0].effect, fired: g1[0].fired, flag: st.flags.tGrudgeRan,
      afterFire, sameMemory, inCooldown, after: g2.length, cause2: g2.length > 1 ? g2[1].cause : null,
      due: st.dueEvents.some(e => e.seedId === g1[0].id), mark: W.feelingMark({ turn: 0, text: 'took my parking spot and laughed about it' })
    };
  });
  assert.equal(r.template, 2, 'the only template that fits someone elderly');
  assert.match(r.cause, /\[m\d+:took_my_parking_spot/, 'the seed carries the memory it grew from');
  assert.equal(r.fired, true);
  assert.equal(r.due, true, 'told as a due event');
  assert.equal(r.flag, r.id, 'the template\'s effects ran, {npcId} filled');
  assert.equal(r.afterFire, -60, 'got even: +10');
  assert.equal(r.sameMemory, 1, 'one grudge per memory');
  assert.equal(r.inCooldown, 1, 'a new memory waits out the cooldown');
  assert.equal(r.after, 2, 'after seven days, a grudge for the new memory');
  assert.match(r.cause2, /got_me_thrown_out/);
  const told = await news(page);
  assert.ok(told.some(t => t === r.effect), 'a public template is news when it fires');
});

s.test('attitudes drift two a day back toward the town\'s own, except for someone with a fresh weight-3 memory or an open loose end; weather follows State.season()', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const W = G.World;
    const S = G.State;
    const st = G.state;
    const loose = st.player.looseEnds.map(x => x.npcId);
    const free = st.npcs.filter(x => x.status === 'free' && !loose.includes(x.id) && !x.memories.length);
    const [a, b, c] = free;
    const base = id => (S.town.npcs.find(x => x.id === id) || {}).attitude || 0;
    W.forceAttitude(a.id, base(a.id) + 40);
    W.forceAttitude(b.id, base(b.id) - 40);
    W.forceAttitude(c.id, base(c.id) - 1);
    S.apply({ newMemories: [{ npcId: b.id, text: 'broke my window', weight: 3 }] });
    const le = st.npcs.find(x => x.id === loose[0]);
    const leBefore = le ? le.attitude : null;
    const orig = S.season;
    S.season = () => 'winter';
    W.forceClockRoll(1);
    W.tick({ to: { day: st.time.day + 1, phase: 'morning' } });
    S.season = orig;
    return {
      a: S.npc(a.id).attitude - base(a.id), b: S.npc(b.id).attitude - base(b.id), c: S.npc(c.id).attitude - base(c.id),
      le: le ? [leBefore, S.npc(le.id).attitude] : null,
      weather: st.flags.weather, winter: G.data.TABLES.weather.winter
    };
  });
  assert.equal(r.a, 38, 'two closer');
  assert.equal(r.b, -40, 'a fresh grievance holds');
  assert.equal(r.c, 0, 'never past where they started');
  if (r.le) assert.equal(r.le[1], r.le[0], 'an open loose end holds');
  assert.ok(r.winter.includes(r.weather), 'the weather is from State.season()');
});

s.test('knockDown: a weight-3 memory for them and everyone watching, news in a public place; arrestPlayer: the cells, a fine, the chief remembers, a due event', async h => {
  const page = await h.open();
  await quickStart(page);
  const sc = await findScene(page, { min: 2, notTypes: ['house', 'trailer', 'apartment', 'farm', 'bighouse'] });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(([victim, ids]) => {
    const G = Game;
    const W = G.World;
    const S = G.State;
    const st = G.state;
    const kd = W.knockDown(victim);
    const mems = ids.map(id => (S.npc(id).memories || []).filter(m => m.weight === 3).map(m => m.text));
    const gold = st.player.gold;
    const ar = W.arrestPlayer();
    const chief = ar.chiefId && S.npc(ar.chiefId);
    return {
      kd, mems, name: S.npc(victim).name, player: st.player.name,
      ar, gold, goldAfter: st.player.gold, where: st.player.locationId, cellType: ar.locationId && S.loc(ar.locationId).type,
      chiefMem: chief ? chief.memories.some(m => m.weight === 3 && /locked .* up overnight/.test(m.text)) : null,
      due: st.dueEvents.some(e => e.seedId === ar.seedId && e.text === ar.text),
      hurt: S.npc(victim).hurtUntilDay
    };
  }, [sc.npcs[0].id, sc.presentIds]);
  assert.ok(r.kd && r.kd.text.includes(r.name));
  for (const m of r.mems) assert.ok(m.some(t => /knock|knocked/.test(t)), 'everyone here remembers it: ' + JSON.stringify(m));
  const told = await news(page);
  assert.ok(told.some(t => t.includes(`${r.player} knocked ${r.name} down`)), 'news in a public place');
  if (r.kd.hurt) assert.ok(Number.isInteger(r.hurt), 'hurt for two days when State has npcFates');
  assert.equal(r.where, r.ar.locationId, 'in the cells');
  assert.ok(['police', 'watch'].includes(r.cellType));
  assert.equal(r.gold - r.goldAfter, Math.min(50, r.gold), 'fined what they have, up to $50');
  assert.equal(r.ar.timeCost, 'rest', 'the night passes (the pipeline\'s to pass)');
  if (r.chiefMem !== null) assert.equal(r.chiefMem, true, 'the chief remembers');
  assert.equal(r.due, true, 'a due event tells it');
});

s.test('World.fillEffects fills {npcId}, {npc}, {playerName}, {witnessId} and drops what it cannot fill; Town.validate reads lists, requires, alt and events', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const [n, w] = st.npcs.filter(x => x.status === 'free');
    const list = [
      { op: 'attitudeDelta', npcId: '{npcId}', delta: 3 },
      { op: 'addMemory', npcId: '{witnessId}', text: 'saw {playerName} do it', weight: 2 },
      { op: 'setFlag', key: 'x', value: '{npc} and {player}' }
    ];
    const filled = G.World.fillEffects(list, { npc: n.id });
    const withWitness = G.World.fillEffects(list, { npc: n, witnessId: w.id });
    const T = G.data.TOWN_DATA;
    const town = JSON.parse(JSON.stringify(T));
    town.seeds.push({ id: 'seed_v_list', cause: 'c', effect: 'e', trigger: { type: 'location', value: [T.locations[0].id, T.locations[1].id] }, requires: { npcFree: [T.npcs[0].id] }, alt: { text: 'alt', effects: [] }, fired: false, hidden: true });
    const okErrors = G.Town.validate(town);
    town.seeds.push({ id: 'seed_v_bad', cause: 'c', effect: 'e', trigger: { type: 'npc', value: [T.npcs[0].id, 'npc_nobody'] }, requires: { npcFree: ['npc_ghost'] }, fired: false, hidden: true });
    town.events = [{ id: 'ev_bad', day: 0, phase: 'teatime', locationId: 'loc_nowhere', branches: [{ when: { flagsSet: ['x'] }, text: 'x', effects: [{ op: 'noSuchOp' }] }] }];
    return { filled, withWitness, n: { id: n.id, name: n.name }, w: w.id, player: st.player.name, okErrors, badErrors: G.Town.validate(town) };
  });
  assert.deepEqual(r.filled, [{ op: 'attitudeDelta', npcId: r.n.id, delta: 3 }, { op: 'setFlag', key: 'x', value: `${r.n.name} and ${r.player}` }]);
  assert.equal(r.withWitness.length, 3);
  assert.deepEqual(r.withWitness[1], { op: 'addMemory', npcId: r.w, text: `saw ${r.player} do it`, weight: 2 });
  assert.deepEqual(r.okErrors, [], 'a list trigger, requires and alt are fine');
  const bad = r.badErrors.join('\n');
  for (const want of ['unknown npc npc_nobody', 'unknown npc npc_ghost', 'day must be', 'bad phase teatime', 'unknown loc loc_nowhere', 'unknown op noSuchOp', 'needs a default']) assert.ok(bad.includes(want), `${want} in:\n${bad}`);
});

s.run();
