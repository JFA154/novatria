'use strict';
/* Engine-state wave 1 of the review fixes (docs/notes/engine-state.md): the
   calendar, the new effect ops, obligations, town news, goods and rest, the
   clock (instants, toPhaseStart, Tired, defeat), threads and progression,
   the caps on a bookkeeper's diff (npcFates, memoriesSettled,
   obligationsSettled, metTurn), deep save validation, /undo of the town copy,
   reputation on meeting, background hooks and the journal's day and phase.
   Mock mode; every check drives window.Game.State directly. Ids come from
   Game.state and Game.data, never from one particular town. */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('engine-state-fixes');

/* A free person who is somewhere in town in the current phase, and where. */
const somebodyHere = page => page.evaluate(() => {
  const st = Game.state;
  for (const l of st.locations) {
    const here = Game.State.npcsAt(l.id).filter(n => n.status === 'free' && n.alive !== false);
    for (const n of here) if (n.home && n.home.locationId !== l.id) return { id: n.id, name: n.name, loc: l.id, home: n.home.locationId };
  }
  return null;
});

s.test('the new effect ops: gold, HP, items, conditions, memories, clocks and threads; a "{placeholder}" id is refused', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const p = st.player;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false);
    const out = { ops: S.EFFECT_OPS.slice() };
    const eff = e => S.apply({ effects: [e] });
    const gold = p.gold;
    out.goldUp = eff({ op: 'playerGold', delta: 25 }).applied[0];
    out.goldAfterUp = p.gold - gold;
    eff({ op: 'playerGold', delta: -100000 });
    out.goldFloor = p.gold;
    // HP: at most 3 a time, never below 1 unless allowDefeat.
    eff({ op: 'playerHp', delta: -9 }); out.hpA = p.hp;
    eff({ op: 'playerHp', delta: -3 }); eff({ op: 'playerHp', delta: -3 }); out.hpB = p.hp;
    eff({ op: 'playerHp', delta: -3, allowDefeat: true }); out.hpC = p.hp;
    eff({ op: 'playerHp', delta: 2 }); out.hpD = p.hp;
    // Items by name, any case; taking what is not carried does nothing.
    eff({ op: 'giveItem', name: 'Sealed envelope', notes: 'Unsigned.' });
    eff({ op: 'giveItem', name: 'sealed envelope' });
    out.env = Object.assign({}, p.inventory.find(i => i.name === 'Sealed envelope'));
    out.take = eff({ op: 'takeItem', name: 'SEALED ENVELOPE' }).applied[0];
    out.envQty = p.inventory.find(i => i.name === 'Sealed envelope').qty;
    out.none = eff({ op: 'takeItem', name: 'Crown jewels' });
    // A condition for days.
    eff({ op: 'addCondition', name: 'Bruised ribs', effect: '-1 might', days: 2 });
    out.cond = p.conditions.find(c => c.name === 'Bruised ribs');
    out.day = st.time.day;
    // A memory through the memory path; a near-identical one merges.
    eff({ op: 'addMemory', npcId: n.id, text: 'Tester stiffed me on a bar tab last week', weight: 1 });
    eff({ op: 'addMemory', npcId: n.id, text: 'Tester stiffed me on a bar tab and laughed', weight: 2 });
    out.mems = n.memories.filter(m => /stiffed/.test(m.text)).map(m => `${m.text}|${m.weight}`);
    // A clock moved 1 or 2, within its segments.
    const f = st.factions.find(x => x.activeClock >= 0);
    const c = f.clocks[f.activeClock];
    const before = c.filled;
    eff({ op: 'clockAdjust', factionId: f.id, delta: 2 }); out.clockUp = c.filled - before;
    eff({ op: 'clockAdjust', factionId: f.id, delta: -2 }); eff({ op: 'clockAdjust', factionId: f.id, delta: -2 }); out.clockLow = c.filled;
    out.clockBad = eff({ op: 'clockAdjust', factionId: f.id, delta: 3 }).rejected[0].reason;
    // threadUpdate: summary and known.
    const t = st.threads.find(x => x.status === 'open');
    eff({ op: 'threadUpdate', threadId: t.id, summary: 'Somebody paid somebody.', knownToPlayer: true });
    out.thread = [t.summary, t.knownToPlayer];
    // An id still holding a placeholder was never filled in.
    out.placeholder = eff({ op: 'attitudeDelta', npcId: '{npcId}', delta: 5 }).rejected[0].reason;
    out.unknown = eff({ op: 'frobnicate' }).rejected[0].reason;
    return out;
  });
  for (const op of ['playerGold', 'playerHp', 'giveItem', 'takeItem', 'addCondition', 'banFrom', 'playerPrice', 'addMemory', 'clockAdjust', 'threadUpdate', 'addObligation', 'settleObligation', 'addNews']) {
    assert.ok(r.ops.includes(op), 'EFFECT_OPS has ' + op);
  }
  assert.match(r.goldUp, /^effects\[0\]: playerGold: gold \d+ -> \d+$/);
  assert.equal(r.goldAfterUp, 25);
  assert.equal(r.goldFloor, 0, 'more taken than carried takes what there is');
  assert.equal(r.hpA, 7, 'at most 3 a time');
  assert.equal(r.hpB, 1, 'never below 1 from an effect');
  assert.equal(r.hpC, 0, 'allowDefeat takes the last');
  assert.equal(r.hpD, 2);
  assert.deepEqual(r.env, { id: 'item_sealed_envelope', name: 'Sealed envelope', qty: 2, notes: 'Unsigned.' });
  assert.match(r.take, /lost Sealed envelope x1/);
  assert.equal(r.envQty, 1);
  assert.deepEqual(r.none.rejected, []);
  assert.match(r.none.applied[0], /no-op: not carrying Crown jewels/);
  assert.deepEqual(r.cond, { id: 'cond_bruised_ribs', name: 'Bruised ribs', effect: '-1 might', untilDay: r.day + 2 });
  assert.deepEqual(r.mems, ['Tester stiffed me on a bar tab and laughed|2'], 'the same first five words merge');
  assert.equal(r.clockUp, 2);
  assert.equal(r.clockLow, 0);
  assert.match(r.clockBad, /delta must be -2, -1, 1 or 2/);
  assert.deepEqual(r.thread, ['Somebody paid somebody.', true]);
  assert.match(r.placeholder, /placeholder/);
  assert.match(r.unknown, /unknown op/);
});

s.test('banFrom and playerPrice last until their day and run out with the morning; priceFactor multiplies both', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const l = st.locations.find(x => !x.away && x.id !== st.player.locationId);
    const n = st.npcs.find(x => x.status === 'free');
    const out = {};
    out.notYet = S.isBanned(l.id);
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 1, byNpcId: n.id }] });
    out.ban = S.isBanned(l.id);
    out.banObj = S.isBanned(l);
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 0 }] });
    out.keptLater = st.bans.length === 1 && st.bans[0].untilDay;
    // The bookkeeper cannot walk the player in.
    out.walkIn = S.apply({ playerLocationId: l.id }, { source: 'model' }).rejected[0].reason;
    S.apply({ effects: [{ op: 'priceMultiplier', factor: 1.5 }, { op: 'playerPrice', factor: 2, days: 0 }] });
    out.factor = S.priceFactor();
    out.flags = [st.flags.playerPriceMultiplier, st.flags.playerPriceUntilDay];
    // Day 2: the price is over (untilDay 1), and so is the ban (wave 3: a ban ends before its untilDay, the day the player is welcome again).
    for (let i = 0; i < 4; i++) S.apply({ advanceTime: 'long' });
    out.day2 = [st.time.day, S.priceFactor(), 'playerPriceMultiplier' in st.flags, !!S.isBanned(l.id)];
    for (let i = 0; i < 4; i++) S.apply({ advanceTime: 'long' });
    out.day3 = [st.time.day, S.isBanned(l.id), st.bans.length];
    // expireDaily through apply is the same, and says what ran out.
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 0 }] });
    out.expired = S.expireDaily(st.time.day + 1);
    out.engineOnly = S.apply({ expireDaily: 9 }, { source: 'model' }).rejected[0].reason;
    out.reserved = ['playerPriceMultiplier', 'playerPriceUntilDay', 'lodgingPaidUntilDay'].map(k => S.apply({ effects: [{ op: 'setFlag', key: k, value: 1 }] }).rejected.length);
    return out;
  });
  assert.equal(r.notYet, null);
  assert.ok(r.ban && r.ban.untilDay === 2 && r.ban.byNpcId, 'banned until day 2 (welcome again then): ' + JSON.stringify(r.ban));
  assert.deepEqual(r.banObj, r.ban, 'a place object works too');
  assert.equal(r.keptLater, 2, 'a shorter second ban keeps the later day');
  assert.match(r.walkIn, /banned/);
  assert.equal(r.factor, 3);
  assert.deepEqual(r.flags, [2, 1]);
  // Changed by design in wave 3 (playtest N2): one day's ban is today only; on its untilDay the player is welcome again.
  assert.deepEqual(r.day2, [2, 1.5, false, false]);
  assert.deepEqual(r.day3, [3, null, 0]);
  assert.deepEqual(r.expired, [`no longer banned from ${r.ban.locationId}`]);
  assert.match(r.engineOnly, /not allowed from the model/);
  assert.deepEqual(r.reserved, [1, 1, 1], 'setFlag cannot write the engine\'s own flags');
});

s.test('obligations: one open per kind and person, dueOffset from today, met and missed each run their effects once; tickObligations misses what is overdue', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false && !(st.player.looseEnds || []).some(le => le.npcId === x.id));
    const day = st.time.day;
    const out = { name: n.name, slug: n.id.replace(/^npc_/, ''), day };
    const add = extra => S.apply({ effects: [Object.assign({ op: 'addObligation', kind: 'debt', npcId: n.id, text: 'You owe {npc} $400', amount: 400, dueOffset: 3,
      onMiss: [{ op: 'attitudeDelta', npcId: '{npcId}', delta: -20 }], onMet: [{ op: 'attitudeDelta', npcId: '{npcId}', delta: 10 }] }, extra || {})] });
    const a0 = n.attitude;
    out.first = add();
    out.second = add().rejected[0].reason;
    out.open = S.obligations('open').map(o => ({ id: o.id, kind: o.kind, npcId: o.npcId, text: o.text, amount: o.amount, dueDay: o.dueDay, status: o.status, onMiss: o.onMiss }));
    const id = out.open[0].id;
    out.bad = [
      S.apply({ effects: [{ op: 'addObligation', kind: 'favour', npcId: n.id, text: 'x' }] }).rejected[0].reason,
      S.apply({ effects: [{ op: 'addObligation', kind: 'promise', npcId: 'npc_nobody', text: 'x' }] }).rejected[0].reason,
      S.apply({ effects: [{ op: 'settleObligation', id, status: 'paid' }] }).rejected[0].reason,
      S.apply({ effects: [{ op: 'settleObligation', id: 'obl_nothing', status: 'met' }] }).rejected[0].reason
    ];
    S.apply({ effects: [{ op: 'settleObligation', id, status: 'met' }] });
    out.met = [S.obligations(id) && st.player.obligations.find(o => o.id === id).status, n.attitude - a0];
    out.again = S.apply({ effects: [{ op: 'settleObligation', id, status: 'missed' }] }).applied[0];
    out.afterAgain = n.attitude - a0;
    // A new one for the same person and kind once the first is closed; then the tick.
    add({ dueDay: day + 1, dueOffset: undefined });
    const id2 = S.obligations('open')[0].id;
    const a1 = n.attitude;
    out.tickEarly = S.tickObligations(day + 1);
    out.tick = S.tickObligations(day + 2);
    out.tickAgain = S.tickObligations(day + 9);
    out.missed = [id2, st.player.obligations.find(o => o.id === id2).status, n.attitude - a1];
    out.byStatus = [S.obligations().length, S.obligations('met').length, S.obligations('missed').length, S.obligations('open').length];
    return out;
  });
  assert.deepEqual(r.first.rejected, []);
  assert.match(r.first.applied[0], /^effects\[0\]: addObligation: obligation obl_debt_/);
  assert.match(r.second, /already open \(one open debt per person\)/);
  // The id carries the whole npc id (obl_debt_npc_curtis), the form the town's events read.
  assert.deepEqual(r.open, [{ id: `obl_debt_npc_${r.slug}`, kind: 'debt', npcId: `npc_${r.slug}`, text: `You owe ${r.name} $400`, amount: 400, dueDay: r.day + 3, status: 'open',
    onMiss: [{ op: 'attitudeDelta', npcId: `npc_${r.slug}`, delta: -20 }] }]);
  assert.match(r.bad[0], /kind must be debt, blackmail, promise, errand, lodging/);
  assert.match(r.bad[1], /unknown npc/);
  assert.match(r.bad[2], /status must be met or missed/);
  assert.match(r.bad[3], /unknown obligation/);
  assert.deepEqual(r.met, ['met', 10]);
  assert.match(r.again, /no-op: obl_debt_npc_\w+ is already met/);
  assert.equal(r.afterAgain, 10, 'onMet ran once, onMiss never');
  assert.deepEqual(r.tickEarly, [], 'due today is not missed yet');
  assert.deepEqual(r.tick, [`obl_debt_npc_${r.slug}_2`]);
  assert.deepEqual(r.tickAgain, []);
  assert.deepEqual(r.missed, [`obl_debt_npc_${r.slug}_2`, 'missed', -20]);
  assert.deepEqual(r.byStatus, [2, 1, 1, 0]);
});

s.test('obligations settle by play: money handed over in front of the creditor, the errand\'s thing given to the person; obligationsSettled needs them present', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const free = st.npcs.filter(x => x.status === 'free' && x.alive !== false);
    const [a, b, c] = free;
    const out = {};
    S.apply({ effects: [{ op: 'playerGold', delta: 300 }] });
    S.apply({ effects: [
      { op: 'addObligation', kind: 'debt', npcId: a.id, text: 'Pay back the loan', amount: 50, dueOffset: 2 },
      { op: 'addObligation', kind: 'errand', npcId: b.id, text: 'Bring the letter', itemName: 'Sealed letter', dueOffset: 2 },
      { op: 'addObligation', kind: 'promise', npcId: c.id, text: 'Fix the gate', dueOffset: 2 },
      { op: 'giveItem', name: 'Sealed letter' }
    ] });
    const status = () => S.obligations().map(o => o.status).join(',');
    const debt = S.obligations().find(o => o.kind === 'debt').id;
    const promise = S.obligations().find(o => o.kind === 'promise').id;
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -50 }, { source: 'model', present: [b.id] });
    out.away = status();
    out.viaRecord = S.apply({ obligationsSettled: [debt] }, { source: 'model', present: [a.id] }).rejected[0].reason;
    S.apply({ beginTurn: true });
    const paid = S.apply({ goldDelta: -60 }, { source: 'model', present: [a.id] });
    out.paid = [status(), paid.applied.some(x => /met \(paid \$50\)/.test(x)), paid.settled];
    S.apply({ beginTurn: true });
    out.notHeld = S.apply({ obligationsSettled: [S.obligations().find(o => o.kind === 'errand').id] }, { source: 'model', present: [b.id] }).rejected[0].reason;
    S.apply({ itemsLost: ['sealed letter'] }, { source: 'model', present: [b.id] });
    out.errand = status();
    S.apply({ beginTurn: true });
    out.absent = S.apply({ obligationsSettled: [promise] }, { source: 'model', present: [a.id] }).rejected[0].reason;
    out.noList = S.apply({ obligationsSettled: [promise] }, { source: 'model' }).rejected[0].reason;
    S.apply({ obligationsSettled: [promise] }, { source: 'model', present: [c.id] });
    out.promise = status();
    out.done = S.apply({ obligationsSettled: [promise] }, { source: 'model', present: [c.id] });
    return out;
  });
  assert.equal(r.away, 'open,open,open', 'paid with the creditor away: nothing settled');
  assert.match(r.viaRecord, /is met by paying \$50/);
  assert.deepEqual(r.paid.slice(0, 2), ['met,open,open', true]);
  assert.equal(r.paid[2].length, 1);
  assert.equal(r.paid[2][0].status, 'met');
  assert.match(r.notHeld, /Sealed letter is still carried/);
  assert.equal(r.errand, 'met,met,open');
  assert.match(r.absent, /is not here/);
  assert.match(r.noList, /is not here/);
  assert.equal(r.promise, 'met,met,met');
  assert.deepEqual(r.done.rejected, [], 'settling a settled one again is quietly nothing');
});

s.test('a loose end\'s obligation rides on its seed with placeholders filled, and is due dueOffset days after the day the seed fires', async h => {
  const page = await h.open();
  const debtWords = await page.evaluate(() => {
    const D = Game.data;
    const words = D.LOOSE_ENDS.debt.options[0];
    D.LOOSE_ENDS.debt.options[0] = { text: words, obligation: { kind: 'debt', amount: 400, dueOffset: 3, text: 'You owe {npc} $400',
      onMiss: [{ op: 'attitudeDelta', npcId: '{npcId}', delta: -15 }], onMet: [{ op: 'addMemory', npcId: '{npcId}', text: '{playerName} paid up in full', weight: 2 }] } };
    // The kind's own obligation when the option has none (content's per-option list taken away for this).
    delete D.LOOSE_ENDS.promise.obligations;
    D.LOOSE_ENDS.promise.obligation = { kind: 'errand', dueOffset: 2, text: 'Deliver the letter for {player}', itemName: 'Letter', onMiss: [], onMet: [] };
    return words;
  });
  await quickStart(page, { kinds: ['debt', 'promise', 'enemy'] });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const les = st.player.looseEnds;
    const seedOf = kind => { const le = les.find(x => x.kind === kind); return { le, seed: S.seed(le.seedId), name: S.npc(le.npcId).name }; };
    const debt = seedOf('debt');
    const promise = seedOf('promise');
    const enemy = seedOf('enemy');
    const out = { debtEffects: debt.seed.effects, debtNpc: debt.le.npcId, debtName: debt.name, debtText: debt.le.text,
      promiseEffects: promise.seed.effects, promiseNpc: promise.le.npcId, enemyEffects: enemy.seed.effects || null };
    // The seed fires on day 3 (World applies its effects then): due day 6.
    S.apply({ advanceTime: 'rest' }); S.apply({ advanceTime: 'rest' });
    out.fireDay = st.time.day;
    S.apply({ effects: debt.seed.effects });
    out.obligation = S.obligations('open')[0];
    return out;
  });
  assert.equal(r.debtText, debtWords, 'an option written as { text, obligation } reads as its words');
  assert.deepEqual(r.debtEffects, [{ op: 'addObligation', kind: 'debt', npcId: r.debtNpc, text: `You owe ${r.debtName} $400`, amount: 400, dueOffset: 3, itemName: null,
    onMiss: [{ op: 'attitudeDelta', npcId: r.debtNpc, delta: -15 }], onMet: [{ op: 'addMemory', npcId: r.debtNpc, text: 'Tester paid up in full', weight: 2 }] }]);
  assert.equal(r.promiseEffects[0].kind, 'errand', 'the kind\'s own obligation when the option has none');
  assert.equal(r.promiseEffects[0].npcId, r.promiseNpc);
  assert.equal(r.promiseEffects[0].text, 'Deliver the letter for Tester');
  assert.equal(r.promiseEffects[0].itemName, 'Letter');
  assert.equal(r.enemyEffects, null, 'no obligation, no effects');
  assert.equal(r.fireDay, 3);
  assert.equal(r.obligation.dueDay, 6);
  assert.equal(r.obligation.createdDay, 3);
});

s.test('town news: addNews keeps the newest 60, State.news reads them, newsSeen marks them; a load fills news, obligations, bans, eventsFired and instants', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const f = st.factions[0];
    const out = {};
    for (let i = 0; i < 65; i++) S.apply({ effects: [{ op: 'addNews', text: `Item ${i}` }] });
    out.count = S.news.length;
    out.first = S.news[0].text;
    out.same = S.news === st.news;
    S.apply({ effects: [{ op: 'addNews', text: 'The council met behind closed doors.', factionId: f.id, public: false }] });
    out.last = Object.assign({}, S.news[S.news.length - 1]);
    out.badFaction = S.apply({ effects: [{ op: 'addNews', text: 'x', factionId: 'fac_nobody' }] }).rejected[0].reason;
    out.empty = S.apply({ effects: [{ op: 'addNews', text: '  ' }] }).rejected[0].reason;
    S.apply({ newsSeen: true });
    out.seen = S.news.every(x => x.seen === true);
    // An older save without the new fields loads with them.
    const old = JSON.parse(JSON.stringify(st));
    delete old.news; delete old.bans; delete old.eventsFired; delete old.player.obligations; old.time.instants = 'x';
    const info = S.load(old, S.town);
    out.loaded = [Game.state.news.length, Game.state.bans, Game.state.eventsFired, Game.state.player.obligations, 'instants' in Game.state.time];
    out.info = [info.newer, info.rulesVersion === S.RULES_VERSION, info.state === Game.state];
    // A save from a later build loads, and says so.
    const later = JSON.parse(JSON.stringify(Game.state));
    later.meta.rulesVersion = S.RULES_VERSION + 2;
    const info2 = S.load(later, S.town);
    out.newer = [info2.newer, info2.rulesVersion];
    return out;
  });
  assert.equal(r.count, 60);
  assert.equal(r.first, 'Item 5', 'the oldest go first');
  assert.equal(r.same, true);
  assert.equal(r.last.text, 'The council met behind closed doors.');
  assert.equal(r.last.public, false);
  assert.equal(r.last.seen, false);
  assert.equal(r.last.day, 1);
  assert.equal(r.last.phase, 'morning');
  assert.ok(r.last.factionId);
  assert.match(r.badFaction, /unknown faction/);
  assert.match(r.empty, /news needs text/);
  assert.equal(r.seen, true);
  assert.deepEqual(r.loaded, [0, [], [], [], false], 'time.instants is kept only above 0, so a bad one reads as 0');
  assert.deepEqual(r.info, [false, true, true]);
  assert.deepEqual(r.newer[0], true);
});

s.test('a bookkeeper\'s diff is capped: gold +/-500 and HP +/-3 a turn, HP to 0 only in a lost fight, two things, items refused with their payment, one seed, conditions of 3 days', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const p = st.player;
    const M = extra => Object.assign({ source: 'model' }, extra || {});
    const out = {};
    const day = st.time.day;
    S.apply({ beginTurn: true });
    const g0 = p.gold;
    out.goldBig = S.apply({ goldDelta: 900 }, M()).applied[0];
    out.goldUp = p.gold - g0;
    out.goldMore = S.apply({ goldDelta: 5 }, M()).rejected[0].reason;
    // Paying with money the player does not have: the thing bought is refused too.
    S.apply({ beginTurn: true });
    S.apply({ effects: [{ op: 'playerGold', delta: -100000 }, { op: 'playerGold', delta: 10 }] });
    const bought = S.apply({ goldDelta: -240, itemsGained: ['Used shotgun'] }, M());
    out.atomic = bought.rejected.map(x => `${x.path}: ${x.reason}`);
    out.noGun = !p.inventory.some(i => /shotgun/i.test(i.name));
    // At most two things carried in a turn.
    S.apply({ beginTurn: true });
    out.items = S.apply({ itemsGained: ['Coil of rope', 'Tarp', 'Lantern'] }, M()).rejected.map(x => x.path + ': ' + x.reason);
    // HP.
    S.apply({ beginTurn: true });
    out.hp0 = p.hp;
    S.apply({ hpDelta: -10 }, M());
    out.hpCapped = p.hp;
    S.apply({ beginTurn: true });
    S.apply({ hpDelta: -5 });
    out.hpBefore = p.hp;
    S.apply({ hpDelta: -3 }, M({ rollSuccess: false }));
    out.hpHeld = p.hp;
    S.apply({ beginTurn: true });
    S.apply({ hpDelta: -3 }, M({ attacked: st.npcs[0].id, rollSuccess: true }));
    out.hpWon = p.hp;
    S.apply({ beginTurn: true });
    S.apply({ hpDelta: -3 }, M({ attacked: st.npcs[0].id, rollSuccess: false }));
    out.hpLost = p.hp;
    // One seed a turn from the model.
    S.apply({ beginTurn: true });
    out.seeds = S.apply({ newSeeds: [
      { cause: 'c', effect: 'One', trigger: { type: 'day', value: day + 2 } },
      { cause: 'c', effect: 'Two', trigger: { type: 'day', value: day + 3 } }
    ] }, M()).rejected.map(x => x.path);
    // Conditions from the model last 3 days at most; the engine's 30.
    S.apply({ conditionsAdded: [{ name: 'Cut hand', effect: '-1 might', untilDay: day + 10 }] }, M());
    S.apply({ conditionsAdded: [{ name: 'Broken arm', effect: '-2 might', untilDay: day + 10 }] });
    out.conds = p.conditions.map(c => `${c.name}:${c.untilDay - day}`);
    return out;
  });
  assert.match(r.goldBig, /\(\+900 held to \+500\)/);
  assert.equal(r.goldUp, 500);
  assert.match(r.goldMore, /money already moved \$500 this turn/);
  assert.deepEqual(r.atomic, ['goldDelta: cannot afford $240 (have $10)', 'itemsGained[0]: not paid for: Used shotgun']);
  assert.equal(r.noGun, true);
  assert.deepEqual(r.items, ['itemsGained[2]: at most 2 things gained a turn']);
  assert.equal(r.hpCapped, r.hp0 - 3, 'HP moves at most 3 a turn');
  assert.equal(r.hpBefore, 2);
  assert.equal(r.hpHeld, 1, 'no fight lost: held at 1');
  assert.equal(r.hpWon, 1, 'a won fight does not take the last HP either');
  assert.equal(r.hpLost, 0, 'attacked and the roll failed: down to 0');
  assert.deepEqual(r.seeds, ['newSeeds[1]']);
  assert.deepEqual(r.conds, ['Cut hand:3', 'Broken arm:10']);
});

s.test('npcFates: present people only, one a turn, dead/arrested/gone after a successful roll; hurt lays them up at home two days', async h => {
  const page = await h.open();
  await quickStart(page);
  const who = await somebodyHere(page);
  assert.ok(who, 'someone is out somewhere away from home');
  const r = await page.evaluate(w => {
    const S = Game.State;
    const st = Game.state;
    const M = extra => Object.assign({ source: 'model' }, extra || {});
    const out = {};
    S.apply({ beginTurn: true });
    out.absent = S.apply({ npcFates: [{ npcId: w.id, status: 'hurt' }] }, M({ present: [] })).rejected[0].reason;
    out.noList = S.apply({ npcFates: [{ npcId: w.id, status: 'hurt' }] }, M()).rejected[0].reason;
    out.noRoll = S.apply({ npcFates: [{ npcId: w.id, status: 'dead' }] }, M({ present: [w.id], rollSuccess: false })).rejected[0].reason;
    out.badStatus = S.apply({ npcFates: [{ npcId: w.id, status: 'free' }] }, M({ present: [w.id] })).rejected[0].reason;
    const two = S.apply({ npcFates: [{ npcId: w.id, status: 'hurt' }, { npcId: w.id, status: 'hurt' }] }, M({ present: [w.id] }));
    out.two = two.rejected.map(x => x.path + ': ' + x.reason);
    const n = S.npc(w.id);
    out.hurt = [n.status, n.hurtUntilDay, st.time.day];
    out.here = S.npcsAt(w.loc).some(x => x.id === w.id);
    out.atHome = ['morning', 'afternoon', 'evening', 'night'].map(ph => S.npcsAt(w.home, ph).some(x => x.id === w.id));
    out.note = S.absentNote(n);
    // Day + 2: about again.
    S.apply({ advanceTime: 'rest' }); S.apply({ advanceTime: 'rest' });
    out.backDay = st.time.day;
    out.back = S.absentNote(n);
    // Dead after a successful roll: off every schedule.
    S.apply({ beginTurn: true });
    const dead = S.apply({ npcFates: [{ npcId: w.id, status: 'dead' }] }, M({ present: [w.id], rollSuccess: true }));
    out.dead = [dead.rejected.length, n.alive, n.status, st.locations.some(l => Object.values(l.npcIdsBySchedule || {}).some(ids => ids.includes(w.id)))];
    out.deadAgain = S.apply({ npcFates: [{ npcId: w.id, status: 'hurt' }] }).applied[0];
    out.keys = ['npcFates', 'memoriesSettled', 'obligationsSettled'].every(k => S.RECORD_KEYS.includes(k));
    return out;
  }, who);
  assert.match(r.absent, /is not here/);
  assert.match(r.noList, /is not here/, 'no present list: no fate');
  assert.match(r.noRoll, /dead needs a successful roll this turn/);
  assert.match(r.badStatus, /status must be arrested, gone, dead, hurt/);
  assert.deepEqual(r.two, ['npcFates[1]: at most 1 fate a turn']);
  assert.deepEqual(r.hurt, ['free', r.hurt[2] + 2, r.hurt[2]]);
  assert.equal(r.here, false, 'not where their schedule had them');
  assert.deepEqual(r.atHome, [true, true, true, true], 'at home every phase');
  // "Until day N" is the day it ends (integration, wave 3): the day they are about again, as for a ban.
  assert.match(r.note, new RegExp(`^hurt and laid up at .+ until day ${r.hurt[1]}$`));
  assert.equal(r.backDay, r.hurt[1]);
  assert.equal(r.back, '');
  assert.deepEqual(r.dead, [0, false, 'dead', false]);
  assert.match(r.deadAgain, /no-op/);
  assert.equal(r.keys, true);
});

s.test('metTurn only for people present, and a faction member\'s first meeting moves their attitude by reputation / 5 once; memoriesSettled drops a memory; model memories merge', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const n = st.npcs.find(x => x.factionId && !x.knownToPlayer && x.status === 'free');
    const out = {};
    S.apply({ effects: [{ op: 'reputationDelta', key: n.factionId, delta: -40 }] });
    const a0 = n.attitude;
    S.apply({ npcKnownToPlayer: [n.id] }, { source: 'model', present: [] });
    out.known = [n.knownToPlayer, n.metTurn === undefined, n.attitude - a0];
    S.apply({ beginTurn: true });
    S.apply({ npcKnownToPlayer: [n.id] }, { source: 'model', present: [n.id] });
    out.met = [n.metTurn === st.meta.turn, n.attitude - a0, n.repApplied];
    S.apply({ beginTurn: true });
    S.apply({ npcKnownToPlayer: [n.id] }, { source: 'model', present: [n.id] });
    out.once = n.attitude - a0;
    // Model memories with the same first five words merge.
    S.apply({ beginTurn: true });
    S.apply({ newMemories: [{ npcId: n.id, text: 'Tester insulted me in front of the whole bar', weight: 2 }] }, { source: 'model' });
    S.apply({ beginTurn: true });
    const m2 = S.apply({ newMemories: [{ npcId: n.id, text: 'Tester insulted me in front of my wife', weight: 1 }] }, { source: 'model' });
    out.merged = n.memories.filter(m => /insulted/.test(m.text)).map(m => `${m.text}|${m.weight}`);
    out.mergeLine = m2.applied[0];
    // The engine's own memories are never merged.
    S.apply({ newMemories: [{ npcId: n.id, text: 'Fact (a story point): the gate key is under the mat', weight: 3 }, { npcId: n.id, text: 'Fact (a story point): the boat is stolen', weight: 3 }] });
    out.facts = n.memories.filter(m => /^Fact/.test(m.text)).length;
    // memoriesSettled: matched by words, any case, with the person here (wave 2: never someone who is not in the scene).
    out.away = S.apply({ memoriesSettled: [{ npcId: n.id, text: 'INSULTED ME in front' }] }, { source: 'model' }).rejected[0].reason;
    const settled = S.apply({ memoriesSettled: [{ npcId: n.id, text: 'INSULTED ME in front' }] }, { source: 'model', present: [n.id] });
    out.settled = [settled.rejected.length, n.memories.some(m => /insulted/.test(m.text))];
    out.noMatch = S.apply({ memoriesSettled: [{ npcId: n.id, text: 'saved my dog from the river' }] }, { source: 'model', present: [n.id] }).rejected[0].reason;
    out.short = S.apply({ memoriesSettled: [{ npcId: n.id, text: 'me' }] }, { source: 'model', present: [n.id] }).rejected[0].reason;
    return out;
  });
  assert.deepEqual(r.known, [true, true, 0], 'known, not met: no look dropped, no reputation yet');
  assert.deepEqual(r.met, [true, -8, true]);
  assert.equal(r.once, -8, 'once only');
  assert.deepEqual(r.merged, ['Tester insulted me in front of my wife|2']);
  assert.match(r.mergeLine, /merged with "Tester insulted me in front of the whole bar"/);
  assert.equal(r.facts, 2);
  assert.match(r.away, /is not here/, 'someone not in the scene settles nothing');
  assert.deepEqual(r.settled, [0, false]);
  assert.match(r.noMatch, /has no memory like/);
  assert.match(r.short, /at least 6 characters/);
});

s.test('clock nudges: one segment per faction per day and phase, however many turns; the next phase may nudge again', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const f = st.factions.find(x => x.activeClock >= 0);
    const c = f.clocks[f.activeClock];
    const before = c.filled;
    const nudge = () => S.apply({ clockNudges: [{ factionId: f.id, delta: 1 }] }, { source: 'model' });
    S.apply({ beginTurn: true }); const a = nudge();
    S.apply({ beginTurn: true }); const b = nudge();
    S.apply({ beginTurn: true }); S.apply({ advanceTime: 'long' }); const c2 = nudge();
    return { a: a.rejected.length, b: b.rejected.map(x => x.reason), c: c2.rejected.length, moved: c.filled - before, nudges: st.meta.nudges };
  });
  assert.equal(r.a, 0);
  assert.match(r.b[0], /clock already moved this morning/);
  assert.equal(r.c, 0, 'a new phase');
  assert.equal(r.moved, 2);
  assert.equal(r.nudges.at, '1:afternoon');
});

s.test('time: six instant actions make a short (reset by a phase change); toPhaseStart lands at shorts 0; a defeat at night is not a sleepless night', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const t = () => { const x = st.time; return `${x.day}:${x.phase}:${x.shorts}:${x.instants | 0}${x.noSleep ? ':nosleep' : ''}`; };
    const out = { steps: [] };
    for (let i = 0; i < 5; i++) S.apply({ advanceTime: 'instant' });
    out.steps.push(t());
    const sixth = S.apply({ advanceTime: 'instant' });
    out.steps.push(t());
    out.sixth = [sixth.time.instantShort, sixth.time.phasesPassed, sixth.applied[0]];
    // At shorts 2, the sixth instant crosses into the next phase.
    S.apply({ advanceTime: 'short' });
    for (let i = 0; i < 6; i++) out.last = S.apply({ advanceTime: 'instant' }).time;
    out.steps.push(t());
    out.crossed = out.last.phasesPassed;
    // A plain long keeps the shorts; any phase change resets the instants.
    S.apply({ advanceTime: 'short' });
    S.apply({ advanceTime: 'instant' }); S.apply({ advanceTime: 'instant' }); S.apply({ advanceTime: 'long' });
    out.steps.push(t());
    // toPhaseStart: the long lands at the start of the next phase.
    S.apply({ advanceTime: { cost: 'long', toPhaseStart: true } });
    out.steps.push(t());
    out.badSpec = S.apply({ advanceTime: { cost: 'long', toPhaseStart: 'yes' } }).rejected[0].reason;
    out.badCost = S.apply({ advanceTime: { cost: 'nap' } }).rejected[0].reason;
    // Night: knocked out until morning is not a night without sleep.
    const d = S.apply({ advanceTime: { cost: 'long', cause: 'defeat' } });
    out.steps.push(t());
    out.defeat = [d.time.cause, st.player.conditions.some(c => c.id === 'cond_tired')];
    return out;
  });
  assert.deepEqual(r.steps, ['1:morning:0:5', '1:morning:1:0', '1:afternoon:0:0', '1:evening:1:0', '1:night:0:0', '2:morning:0:0'],
    'six instants make a short; a plain long keeps the shorts; toPhaseStart starts the phase; knocked out at night is not a night without sleep');
  assert.deepEqual(r.sixth, [true, 0, 'advanceTime: instant: day 1 morning (talk adds up: a short)']);
  assert.equal(r.crossed, 1);
  assert.match(r.badSpec, /toPhaseStart must be true or false/);
  assert.match(r.badCost, /time cost must be/);
  assert.deepEqual(r.defeat, ['defeat', false], 'no Tired after a defeat');
});

s.test('a morning without sleep makes the player Tired (-1 all) until they rest; a rough rest heals 1 and leaves them Stiff; a paid bed or a friendly host heals 3', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const p = st.player;
    const cond = id => p.conditions.find(c => c.id === id) || null;
    const out = {};
    // Through the night with no sleep.
    for (let i = 0; i < 4; i++) S.apply({ advanceTime: 'long' });
    out.tired = Object.assign({}, cond('cond_tired'));
    out.tiredMod = Game.Dice.modifiersFor(st, { stat: 'wits', actionType: 'search' }).map(m => m.value);
    S.apply({ effects: [{ op: 'playerHp', delta: -3 }, { op: 'playerHp', delta: -3 }] });
    out.quality = S.restQuality();
    const rough = S.apply({ advanceTime: 'rest' }).time;
    out.rough = [rough.quality, rough.healed, cond('cond_tired'), Object.assign({}, cond('cond_stiff')), st.time.day];
    // A motel with a night paid for: a bed; the night is used up.
    const motel = st.locations.find(l => l.type === 'motel');
    S.apply({ playerLocationId: motel.id });
    out.unpaid = S.restQuality();
    const bought = S.apply({ itemsGained: ['Night at the motel'] }, { source: 'model' });
    out.bought = [bought.applied[0], p.inventory.some(i => /night/i.test(i.name)), st.flags.lodgingPaidUntilDay - st.time.day];
    out.paid = S.restQuality();
    S.apply({ effects: [{ op: 'playerHp', delta: -3 }, { op: 'playerHp', delta: -3 }] });
    const bed = S.apply({ advanceTime: 'rest' }).time;
    out.bed = [bed.quality, bed.healed, 'lodgingPaidUntilDay' in st.flags];
    out.after = S.restQuality();
    // A home where someone who likes the player lives.
    const host = st.npcs.find(n => n.status === 'free' && n.home && st.locations.some(l => l.id === n.home.locationId && ['house', 'trailer', 'apartment', 'farm', 'bighouse'].includes(l.type)));
    S.apply({ playerLocationId: host.home.locationId });
    out.cold = S.restQuality();
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: host.id, delta: 30 - host.attitude }] });
    out.warm = S.restQuality();
    return out;
  });
  assert.deepEqual(r.tired, { id: 'cond_tired', name: 'Tired', effect: '-1 all', untilDay: null, untilRest: true });
  assert.ok(r.tiredMod.includes(-1), 'Tired counts against a roll');
  assert.equal(r.quality, 'rough');
  assert.deepEqual(r.rough, ['rough', 1, null, { id: 'cond_stiff', name: 'Stiff', effect: '-1 might', untilDay: r.rough[4] }, r.rough[4]]);
  assert.equal(r.unpaid, 'rough');
  assert.match(r.bought[0], /lodging paid through day \d+ \(not carried\)/);
  assert.equal(r.bought[1], false, 'a night is not carried');
  assert.equal(r.bought[2], 1);
  assert.equal(r.paid, 'bed');
  assert.deepEqual(r.bed, ['bed', 3, false], 'heals 3; the paid night is used');
  assert.equal(r.after, 'rough');
  assert.equal(r.cold, 'rough');
  assert.equal(r.warm, 'bed');
});

s.test('goods: a drink, food or service is had where it is bought, never carried; a good is carried', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const goods = Game.data.TABLES.items.goods;
    // Tag a few the way the content does (CONTRACTS section 7), whatever the table says now.
    const tag = (re, kind) => { const g = goods.find(x => re.test(x.name)); g.kind = kind; return g.name; };
    const drink = tag(/whiskey/i, 'drink');
    const food = tag(/catfish/i, 'food');
    const good = tag(/flashlight/i, 'good');
    const got = S.apply({ itemsGained: [drink.replace(/ at .*$/, ''), food, good] });
    return { lines: got.applied, inv: st.player.inventory.map(i => i.name), drink, food, good };
  });
  assert.match(r.lines[0], /drink, had here \(not carried\)/);
  assert.match(r.lines[1], /food, had here \(not carried\)/);
  assert.match(r.lines[2], /gained Flashlight x1/);
  assert.ok(r.inv.includes(r.good) && !r.inv.some(x => /whiskey|catfish/i.test(x)));
});

s.test('threads: a story point and progression only on the first resolution; effects never move a resolved thread; a rumour reveals its thread', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const p = st.player;
    S.apply({ storyPointsDelta: -2 });
    const charm0 = p.stats.charm;
    S.apply({ effects: [
      { op: 'openThread', thread: { id: 'thr_test_a', title: 'Who cut the line', status: 'open', knownToPlayer: true, reward: 'charm' } },
      { op: 'openThread', thread: { id: 'thr_test_b', title: 'The second key', status: 'open', knownToPlayer: true } },
      { op: 'openThread', thread: { id: 'thr_test_c', title: 'Unknown to them', status: 'open', knownToPlayer: false } }
    ] });
    const M = { source: 'model' };
    const out = {};
    const res = S.apply({ threadUpdates: [{ threadId: 'thr_test_a', status: 'resolved' }] }, M);
    out.first = [p.storyPoints, p.stats.charm - charm0, p.progression.length, S.thread('thr_test_a').resolvedOnce];
    out.progressed = res.progressed;
    S.apply({ threadUpdates: [{ threadId: 'thr_test_a', status: 'open' }] }, M);
    S.apply({ threadUpdates: [{ threadId: 'thr_test_a', status: 'resolved' }] }, M);
    out.again = [p.storyPoints, p.stats.charm - charm0, p.progression.length];
    out.effect = S.apply({ effects: [{ op: 'threadStatus', threadId: 'thr_test_a', status: 'failed' }] }).applied[0];
    out.effect2 = S.apply({ effects: [{ op: 'threadUpdate', threadId: 'thr_test_a', status: 'open' }] }).applied[0];
    out.stillResolved = S.thread('thr_test_a').status;
    // No reward named: +2 max HP, HP with it.
    const hp0 = [p.hp, p.maxHp];
    S.apply({ threadUpdates: [{ threadId: 'thr_test_b', status: 'resolved' }] }, M);
    out.hp = [p.hp - hp0[0], p.maxHp - hp0[1], p.progression[1]];
    // Not known to the player: the story point, no progression.
    S.apply({ storyPointsDelta: -p.storyPoints });
    S.apply({ threadUpdates: [{ threadId: 'thr_test_c', status: 'resolved' }] }, M);
    out.unknown = [p.storyPoints, p.progression.length];
    // Caps: a stat at +3 gives max HP instead; max HP stops at 16.
    p.stats.charm = 3;
    p.maxHp = 15;
    S.apply({ effects: [{ op: 'openThread', thread: { id: 'thr_test_d', title: 'Another', status: 'open', knownToPlayer: true, reward: 'charm' } }] });
    S.apply({ threadUpdates: [{ threadId: 'thr_test_d', status: 'resolved' }] }, M);
    out.capped = [p.stats.charm, p.maxHp, p.progression[p.progression.length - 1].gain];
    // A rumour about a thread makes it known when heard.
    S.apply({ effects: [
      { op: 'openThread', thread: { id: 'thr_test_e', title: 'Hidden', status: 'open', knownToPlayer: false } },
      { op: 'addRumour', rumour: { id: 'rum_test_e', text: 'Somebody saw the boat go out.', sourceNpcId: null, threadId: 'thr_test_e' } }
    ] });
    S.apply({ rumoursHeard: ['rum_test_e'] }, M);
    out.rumour = S.thread('thr_test_e').knownToPlayer;
    return out;
  });
  assert.deepEqual(r.first, [1, 1, 1, true]);
  assert.deepEqual(r.progressed, [{ threadId: 'thr_test_a', gain: 'charm +1' }], 'the result says what was gained');
  assert.deepEqual(r.again, [1, 1, 1], 'flipping it back and forth earns nothing');
  assert.match(r.effect, /no-op: thr_test_a is resolved/);
  assert.match(r.effect2, /no-op: thr_test_a is resolved/);
  assert.equal(r.stillResolved, 'resolved');
  assert.deepEqual(r.hp.slice(0, 2), [2, 2]);
  assert.equal(r.hp[2].threadId, 'thr_test_b');
  assert.equal(r.hp[2].gain, 'max HP +2');
  assert.deepEqual(r.unknown, [1, 2]);
  assert.deepEqual(r.capped, [3, 16, 'max HP +1']);
  assert.equal(r.rumour, true);
});

s.test('validateShape is deep and names the first problem; Storage refuses a damaged import with it', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const base = () => JSON.parse(JSON.stringify(Game.state));
    const why = f => { const st = base(); f(st); return S.validateShape(st); };
    const town = JSON.parse(JSON.stringify(S.town));
    const out = {
      ok: S.validateShape(base(), town),
      notObj: S.validateShape('x'),
      npc: why(st => { st.npcs[3] = 'Bob'; }),
      noName: why(st => { delete st.locations[2].name; }),
      inv: why(st => { st.player.inventory = [{ id: 'item_x', name: 'X' }, 'knife']; }),
      invNotList: why(st => { st.player.inventory = 'knife'; }),
      items: why(st => { st.locations[0].items = 'x'; }),
      history: why(st => { st.npcs[0].history = 'x'.repeat(401); }),
      long: why(st => { st.locations[1].description = 'x'.repeat(4001); }),
      narrationOk: why(st => { st.log.push({ turn: 1, input: '', narration: 'x'.repeat(5000) }); }),
      narrationLong: why(st => { st.log.push({ turn: 1, input: '', narration: 'x'.repeat(6001) }); }),
      news: why(st => { st.news = [1, 2]; }),
      first: why(st => { delete st.time; st.npcs[0] = null; })
    };
    town.history = 'x'.repeat(8001);
    out.town = S.validateShape(base(), town);
    town.history = 'x'.repeat(7999);
    out.townOk = S.validateShape(base(), town);
    const env = Game.Storage.envelope('x');
    env.state.npcs[0] = 7;
    try { Game.Storage.parseEnvelope(JSON.stringify(env)); out.storage = 'loaded'; } catch (e) { out.storage = e.message; }
    try { S.load(env.state, env.town); out.load = 'loaded'; } catch (e) { out.load = e.message; }
    return out;
  });
  assert.deepEqual(r.ok, []);
  assert.deepEqual(r.notObj, ['state is not an object']);
  assert.deepEqual(r.npc, ['npcs[3] is not a record with an id']);
  assert.match(r.noName[0], /^locations\[2\] \(loc_\w+\) has no name$/);
  assert.deepEqual(r.inv, ['player.inventory[1] is not an item with an id and a name']);
  assert.deepEqual(r.invNotList, ['player.inventory is not a list']);
  assert.match(r.items[0], /the things there are not a list of items/);
  assert.deepEqual(r.history, ['npcs.0.history is longer than 400 characters']);
  assert.deepEqual(r.long, ['locations.1.description is longer than 4000 characters']);
  assert.deepEqual(r.narrationOk, []);
  assert.match(r.narrationLong[0], /^log\.\d+\.narration is longer than 6000 characters$/);
  assert.deepEqual(r.news, ['news is not a list of records']);
  assert.deepEqual(r.first, ['time missing'], 'one problem, the first');
  assert.deepEqual(r.town, ['town.history is longer than 8000 characters']);
  assert.deepEqual(r.townOk, []);
  assert.equal(r.storage, 'That save is damaged: npcs[0] is not a record with an id');
  assert.equal(r.load, 'npcs[0] is not a record with an id');
});

s.test('/undo after an update restores the game\'s town copy too; snapshot still returns the game\'s JSON', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const before = JSON.stringify(S.town);
    const snap = S.snapshot();
    const out = { same: snap === JSON.stringify(Game.state) };
    const t = JSON.parse(before);
    t.locations.push({ id: 'loc_test_shed', name: 'Test Shed', type: 'shed', description: 'A shed.', exits: [], npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] }, discovered: true });
    const res = S.apply({ addCast: { town: t } });
    out.grew = [res.rejected.length, S.town.locations.some(l => l.id === 'loc_test_shed'), !!S.loc('loc_test_shed')];
    out.restored = S.restore();
    out.back = [JSON.stringify(S.town) === before, !!S.loc('loc_test_shed')];
    // restore(snap) by its string, as the Pipeline does on a failed turn.
    const snap2 = S.snapshot();
    S.apply({ addCast: { town: t } });
    S.restore(snap2);
    out.byString = [JSON.stringify(S.town) === before, S.undoDepth()];
    return out;
  });
  assert.equal(r.same, true);
  assert.deepEqual(r.grew, [0, true, true]);
  assert.equal(r.restored, true);
  assert.deepEqual(r.back, [true, false]);
  assert.deepEqual(r.byString, [true, 0]);
});

s.test('the calendar: weekday, date line and season from TOWN_DATA.calendar (day 1 a Thursday without one); closedOn and awayOn follow the weekday; the season pick keeps a seed\'s world', async h => {
  const plain = await h.open();
  // Without a calendar (the town now has one, so it is taken away here).
  await plain.evaluate(() => { delete Game.data.TOWN_DATA.calendar; });
  await quickStart(plain);
  const a = await plain.evaluate(() => {
    const S = Game.State;
    return { wd: [1, 2, 4, 6, 8].map(d => S.weekday(d)), line: S.dateLine(), season: S.season() === Game.state.flags.season, les: Game.state.player.looseEnds.map(x => x.npcId), rng: Game.state.meta.rngCalls };
  });
  assert.deepEqual(a.wd, ['Thursday', 'Friday', 'Sunday', 'Tuesday', 'Thursday']);
  assert.equal(a.line, 'Thursday');
  assert.equal(a.season, true);

  const page = await h.open();
  await page.evaluate(() => { delete Game.data.TOWN_DATA.calendar; Game.data.TOWN_DATA.calendar = { season: 'autumn', startDate: '2026-10-08' }; });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const out = {
      wd: [1, 2, 4, 6].map(d => S.weekday(d)), today: S.weekday(), line: S.dateLine(), lines: [S.dateLine(2), S.dateLine(24), S.dateLine(25)],
      season: [S.season(), st.flags.season], les: st.player.looseEnds.map(x => x.npcId), rng: st.meta.rngCalls
    };
    // closedOn
    const l = st.locations.find(x => !x.away && x.id !== st.player.locationId);
    l.closedOn = ['Sunday'];
    out.closed = [S.isClosed(l), S.isClosed(l.id, 4), S.isClosed(l.id, 5)];
    l.closed = true;
    out.closedStory = S.isClosed(l.id, 1);
    l.closed = false;
    // awayOn: someone out somewhere this morning, away on Thursdays until evening.
    let who = null;
    for (const x of st.locations) { const n = S.npcsAt(x.id, 'morning')[0]; if (n) { who = { n, loc: x.id }; break; } }
    who.n.awayOn = { days: ['Thursday'], phases: ['morning', 'afternoon'], where: 'at the county school in Clayburn' };
    out.away = [S.npcsAt(who.loc, 'morning').some(x => x.id === who.n.id), S.absentNote(who.n), S.awayNow(who.n, 'evening')];
    for (let i = 0; i < 4; i++) S.apply({ advanceTime: 'long' });
    out.friday = [S.weekday(), S.npcsAt(who.loc, 'morning').some(x => x.id === who.n.id), S.absentNote(who.n)];
    return out;
  });
  assert.deepEqual(r.wd, ['Thursday', 'Friday', 'Sunday', 'Tuesday']);
  assert.equal(r.today, 'Thursday');
  assert.equal(r.line, 'Thursday 8 October');
  assert.deepEqual(r.lines, ['Friday 9 October', 'Saturday 31 October', 'Sunday 1 November']);
  assert.deepEqual(r.season, ['autumn', 'autumn']);
  assert.deepEqual(r.les, a.les, 'the same seed binds the same loose ends');
  assert.equal(r.rng, a.rng, 'the same number of draws');
  assert.deepEqual(r.closed, [false, true, false]);
  assert.equal(r.closedStory, true);
  assert.deepEqual(r.away, [false, 'at the county school in Clayburn until evening', false]);
  assert.deepEqual(r.friday, ['Friday', true, '']);
});

s.test('a background\'s hook is planted as a seed at creation (origin background); none without one; reputation -20 reads "disliked"; journal lines carry day and phase', async h => {
  const page = await h.open();
  await page.evaluate(() => { Game.data.BACKGROUNDS[0].hook = { effect: 'A letter addressed to {player} waits behind the counter.', dayOffset: [3, 3] }; });
  await quickStart(page, { bgIndex: 0 });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const bgId = Game.data.BACKGROUNDS[0].id.replace(/^bg_/, '');
    const sd = S.seed('seed_bg_' + bgId);
    const out = { seed: sd && { effect: sd.effect, trigger: sd.trigger, origin: sd.origin, hidden: sd.hidden, fired: sd.fired }, origins: S.SEED_ORIGINS.includes('background') };
    S.apply({ effects: [{ op: 'reputationDelta', key: 'town', delta: -30 }] });
    out.tier = S.reputationTier();
    S.apply({ advanceTime: 'long' });
    S.apply({ journalEntry: 'Met the mechanic.' });
    out.journal = st.journal[st.journal.length - 1];
    return out;
  });
  assert.deepEqual(r.seed, { effect: 'A letter addressed to Tester waits behind the counter.', trigger: { type: 'day', value: 3 }, origin: { kind: 'background' }, hidden: true, fired: false });
  assert.equal(r.origins, true);
  assert.equal(r.tier, 'disliked');
  assert.deepEqual(r.journal, { turn: r.journal.turn, day: 1, phase: 'afternoon', text: 'Met the mechanic.' });
  const other = await h.open();
  // Every background in the town has a hook now: take one away.
  await other.evaluate(() => { delete Game.data.BACKGROUNDS[1].hook; });
  await quickStart(other, { bgIndex: 1 });
  assert.equal(await other.evaluate(() => Game.state.seeds.some(sd => /^seed_bg_/.test(sd.id))), false, 'no hook, no seed');
});

s.run();
