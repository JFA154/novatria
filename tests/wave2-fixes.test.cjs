'use strict';
/* Wave 2 engine fixes (docs/notes/engine-wave2.md): the code review's ten
   bugs (docs: qa1-review), its risks and constraint violations, the seams
   left open after wave 1, and the playtest's engine items (B2, B4 to B9,
   B12 to B14, B17 to B20, gifts, Stop while the town is updated, a
   read-only tab, the card game's fumble, the recap). Mock mode throughout;
   ids come from Game.data and Game.state. Run with:
   node tests/run.cjs wave2 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, findScene, place } = require('./helpers.cjs');

const s = suite('wave2-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const quiets = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(e => e.textContent));
const notices = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].map(e => e.textContent));
const lastPacket = page => page.evaluate(() => (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
const line = (packet, label) => (new RegExp(`^${label}: .*$`, 'm').exec(packet) || [''])[0];
/* A place and phase with people, none of them police, in a place that is not a police station. */
async function quietScene(page, min) {
  const sc = await findScene(page, { min: min || 1, watchy: false, notTypes: ['police', 'watch'] });
  assert.ok(sc, 'a scene with people');
  await place(page, sc.loc.id, sc.phase);
  return sc;
}

// ----- review bug 1: a success never locks; repeated asks pay less -----

s.test('bug 1: a successful ask locks nothing (the same ask rolls again), a failed climb does not lock picking a lock, and the same ask that worked earns less each time (Dice.diminishing)', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const sc = await quietScene(page);
  const r = await page.evaluate(async id => {
    const G = Game;
    const M = G.Api.Mock;
    const ask = () => M.queue('parse', { actionType: 'persuade', summary: 'Asks them for help', targets: [id], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    const out = { gains: [], rolls: [], same: [] };
    for (let i = 0; i < 3; i++) {
      ask();
      M.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 8 }] });
      G.Pipeline.hooks.nextTier = 'success';
      const before = G.State.npc(id).attitude;
      await G.Pipeline.submit('I ask them for help');
      out.gains.push(G.State.npc(id).attitude - before);
      out.rolls.push(!!G.state.log[G.state.log.length - 1].roll);
      out.same.push(/SAME ASK AGAIN/.test(M.calls.filter(c => c.method === 'narrate').pop().text));
    }
    out.asked = /^ASKED BEFORE: /m.test(M.calls.filter(c => c.method === 'narrate').pop().text);
    const A = (summary, stat, tier) => { M.queue('parse', { actionType: 'other', summary, targets: [], needsRoll: true, stat, difficulty: 'normal', timeCost: 'instant' }); G.Pipeline.hooks.nextTier = tier; };
    A('Climbs the fence', 'might', 'failure');
    await G.Pipeline.submit('I climb the fence');
    A('Picks the padlock', 'stealth', 'success');
    await G.Pipeline.submit('I pick the padlock');
    A('Picks the padlock on the second door', 'stealth', 'success');
    out.secondLock = await G.Pipeline.submit('I pick the padlock on the second door');
    A('Climbs the fence again', 'might', 'success');
    out.climbAgain = await G.Pipeline.submit('I climb the fence again');
    return out;
  }, sc.npcs[0].id);
  assert.deepEqual(r.rolls, [true, true, true], 'every ask rolled');
  assert.deepEqual(r.same, [false, false, false], 'a success is never told as an ask that failed');
  assert.deepEqual(r.gains, [8, 4, 2], 'full, half, a quarter');
  assert.equal(r.asked, true, 'the narrator hears it was asked before');
  assert.equal(r.secondLock.ok, true, 'a success does not lock its own key');
  assert.equal(r.climbAgain.reason, 'retry-locked', 'the failed climb is still locked');
});

// ----- review bug 2: a debt over $500, paid in parts, paid to whom -----

s.test('bug 2: a $600 debt is paid in one go past the $500 cap, or in parts over turns (kept as paid); money spent in front of the creditor on something else pays nothing', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const le = st.player.looseEnds[0];
    const ob = S.seed(le.seedId).effects.find(e => e.op === 'addObligation');
    const other = st.npcs.find(n => n.id !== ob.npcId && n.alive !== false && n.status === 'free');
    const make = () => { S.apply({ effects: [ob] }, { source: 'world' }); return S.obligations('open').find(o => o.npcId === ob.npcId); };
    const out = { amount: ob.amount };
    S.apply({ effects: [{ op: 'playerGold', delta: 2000 }] });
    let o = make();
    S.apply({ beginTurn: true });
    const r1 = S.apply({ goldDelta: -ob.amount, obligationsSettled: [o.id] }, { source: 'model', present: [ob.npcId, other.id] });
    out.once = [o.status, r1.rejected.length];
    // A second one, paid in parts: a beer bought with someone else here pays nothing; two payments to the creditor do.
    S.apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'met' }] });
    st.player.obligations = st.player.obligations.filter(x => x.id !== o.id);
    o = make();
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -5 }, { source: 'model', present: [ob.npcId, other.id], targets: [] });
    out.beer = o.paid | 0;
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -300 }, { source: 'model', present: [ob.npcId, other.id], targets: [ob.npcId] });
    out.part = [o.status, o.paid];
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -(ob.amount - 300) }, { source: 'model', present: [ob.npcId] });
    out.whole = [o.status, o.paid];
    // Too early: obligationsSettled for a debt not yet covered is refused.
    st.player.obligations = st.player.obligations.filter(x => x.id !== o.id);
    o = make();
    S.apply({ beginTurn: true });
    out.early = S.apply({ obligationsSettled: [o.id] }, { source: 'model', present: [ob.npcId] }).rejected[0].reason;
    return out;
  });
  assert.ok(r.amount > 500, 'the first debt option is over the bookkeeper\'s usual cap');
  assert.deepEqual(r.once, ['met', 0]);
  assert.equal(r.beer, 0, 'money spent in front of the creditor on something else pays nothing');
  assert.deepEqual(r.part, ['open', 300]);
  assert.deepEqual(r.whole, ['met', r.amount]);
  assert.match(r.early, /is met by paying .* \(\$0 paid so far\)/);
});

s.test('B18: a missed debt is still owed (OPEN and the recap say so), paying it late meets it with its onMet; the person missed remembers it and comes looking in plain words', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const le = st.player.looseEnds[0];
    const ob = S.seed(le.seedId).effects.find(e => e.op === 'addObligation');
    S.apply({ effects: [Object.assign({}, ob, { dueOffset: 0 })] }, { source: 'world' });
    const o = S.obligations('open')[0];
    const n = S.npc(o.npcId);
    const mem0 = (n.memories || []).length;
    S.apply({ setTime: { day: st.time.day, phase: 'night' } });
    G.Pipeline.passTime('long');
    const out = { status: o.status, owed: S.obligations('owed').map(x => x.id), due: st.dueEvents.filter(e => e.npcId === n.id).map(e => e.text), memories: (n.memories || []).length - mem0 };
    out.open = G.Pipeline.openLine(st);
    out.recap = G.Pipeline.recapText();
    S.apply({ effects: [{ op: 'playerGold', delta: o.amount }] });
    S.apply({ beginTurn: true });
    const att = n.attitude;
    S.apply({ goldDelta: -o.amount }, { source: 'model', present: [n.id] });
    out.late = [o.status, o.late, n.attitude > att];
    return out;
  });
  assert.equal(r.status, 'missed');
  assert.equal(r.owed.length, 1, 'a missed debt is still owed');
  assert.ok(r.due.length === 1 && !/came looking: Pay/.test(r.due[0]), 'the due event is not the task text: ' + r.due[0]);
  assert.ok(r.memories >= 1, 'the person missed remembers it');
  assert.match(r.open, /missed: it was due day \d+ and is still owed/);
  assert.match(r.recap, /missed on day \d+, still owed/);
  assert.deepEqual(r.late, ['met', true, true], 'paid late: met, late, and its onMet ran');
});

s.test('B18: an errand\'s missed due event never brings the person the thing is for (they do not know it exists); content\'s missText is the due event when it gives one', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const [a, b] = st.npcs.filter(n => n.alive !== false && n.status === 'free').slice(0, 2);
    S.apply({ effects: [{ op: 'giveItem', name: 'Letter for ' + a.name }, { op: 'addObligation', kind: 'errand', npcId: a.id, text: 'Put the letter in {npc}\'s hand.', itemName: 'Letter for {npc}', dueOffset: 0 },
      { op: 'addObligation', kind: 'promise', npcId: b.id, text: 'Help {npc} with the boat.', dueOffset: 0, missText: '{npc} waits at the landing for {playerName} and nobody comes.' }] }, { source: 'world' });
    S.apply({ setTime: { day: st.time.day, phase: 'night' } });
    G.Pipeline.passTime('long');
    return { errand: st.dueEvents.filter(e => e.npcId === a.id).length, promise: st.dueEvents.filter(e => e.npcId === b.id).map(e => e.text), name: b.name, player: st.player.name };
  });
  assert.equal(r.errand, 0, 'the recipient does not come looking');
  assert.deepEqual(r.promise, [`${r.name} waits at the landing for ${r.player} and nobody comes.`]);
});

// ----- review bug 3: the late bookkeeper -----

s.test('bug 3: a bookkeeper retry that comes back after a later turn changes nothing (the player stays where the later turn put them); one that is still the newest is applied without moving the player, and the entry is marked through State', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, M = G.Api.Mock;
    const here = S.loc(st.player.locationId);
    const exits = here.exits.map(id => S.loc(id)).filter(l => l && l.discovered && !S.isClosed(l) && !l.away);
    const A = exits[0];
    const B = A.exits.map(id => S.loc(id)).filter(l => l && l.discovered && !S.isClosed(l) && !l.away && l.id !== here.id)[0];
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: A.id, needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', { error: 'overloaded_error' }, { playerLocationId: A.id, goldDelta: -5 });
    let queued = null;
    G.Pipeline.setStatusListener(ev => {
      if (ev.stage === 'bookkeep' && !queued) {
        M.queue('parse', { actionType: 'move', summary: 'Walks on', targets: [], destinationId: B.id, needsRoll: false, timeCost: 'short' });
        queued = G.Pipeline.submit('I walk on');
      }
    });
    await G.Pipeline.submit('I walk over');
    await queued;
    await G.Pipeline.whenIdle();
    await new Promise(res => setTimeout(res, 300));
    G.Pipeline.setStatusListener(null);
    const out = { at: st.player.locationId, B: B.id, gold: st.player.gold, first: st.log.find(e => e.input === 'I walk over').changes };
    // Now one that is still the newest: its diff lands, but never moves the player.
    const gold0 = st.player.gold;
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { error: 'overloaded_error' }, { playerLocationId: here.id, goldDelta: -5 });
    await G.Pipeline.submit('I look around');
    await new Promise(res => setTimeout(res, 300));
    await G.Pipeline.whenIdle();
    const e = st.log[st.log.length - 1];
    out.second = { at: st.player.locationId, gold: gold0 - st.player.gold, changes: e.changes, notes: e.notes || [] };
    out.debug = S.debugLog.filter(x => x.kind === 'bookkeeper').map(x => x.reason).slice(-2);
    return out;
  });
  assert.equal(r.at, r.B, 'the later turn\'s walk stands');
  assert.equal(r.first, 'not recorded');
  assert.equal(r.second.at, r.B, 'a late diff never moves the player');
  assert.equal(r.second.gold, 5, 'its money is recorded');
  assert.equal(r.second.changes, undefined, 'and the entry no longer says not recorded');
  assert.ok(r.second.notes.some(n => /recorded now/.test(n)), 'the late line is on that entry: ' + JSON.stringify(r.second.notes));
});

// ----- review bug 4: the ending -----

s.test('bug 4: an ending whose narration fails is not lost: its news stays unseen, the notice says it comes after the next turn (nothing about the box), and it is told then, once', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock;
    G.State.apply({ effects: [{ op: 'setFlag', key: 'secondInspectionOrdered', value: true }] });
    M.queue('parse', { actionType: 'wait', summary: 'Waits a while', targets: [], needsRoll: false, timeCost: 'long' });
    M.queue('narrate', { text: 'You wait by the pumps while the light changes over the lot.' }, { error: 'overloaded_error' });
    await G.Pipeline.submit('I wait an hour');
    await G.Pipeline.whenIdle();
    await new Promise(res => setTimeout(res, 100));
    await G.Pipeline.whenIdle();
    const ending = () => G.state.news.find(n => n.epilogue);
    const out = { seenAfterFail: ending().seen, log1: G.state.log.length };
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I look around');
    await G.Pipeline.whenIdle();
    await new Promise(res => setTimeout(res, 100));
    await G.Pipeline.whenIdle();
    out.seen = ending().seen;
    out.epilogueTurns = G.Api.Mock.calls.filter(c => c.method === 'narrate' && /^MODE: epilogue/m.test(c.text)).length;
    out.inputs = G.state.log.map(e => e.input);
    return out;
  });
  const n = await notices(page);
  assert.equal(r.seenAfterFail, false, 'not marked seen when its turn failed');
  assert.ok(n.some(t => /The ending could not be told just now.*It will be told after your next turn\./.test(t)), n.join(' | '));
  assert.ok(!n.some(t => /ending/.test(t) && /kept in the box/.test(t)), 'no box: the ending has no input');
  assert.equal(r.seen, true, 'told after the next turn, and seen then');
  assert.equal(r.inputs.slice(-2).join('|'), 'I look around|', 'the ending is its own turn after the next one');
});

// ----- review bug 5, B2: the knockdown -----

s.test('bug 5 and B2: the third clean hit is told to the narrator (OUTCOME), the one knocked down stays in PRESENT for it, the fight goes on across a phase, and state.fight is written through State (undone with /undo)', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const sc = await quietScene(page, 2);
  const r = await page.evaluate(async id => {
    const G = Game, S = G.State, st = G.state, M = G.Api.Mock;
    const n = S.npc(id);
    // Start late in the phase, so the fight rolls over into the next one.
    S.apply({ setTime: { day: st.time.day, phase: st.time.phase, shorts: 2 } });
    const out = [];
    out.start = st.time.phase;
    for (let i = 0; i < 3; i++) {
      M.queue('parse', { actionType: 'attack', summary: 'Punches them', targets: [id], needsRoll: true, stat: 'might', difficulty: 'easy', timeCost: 'short' });
      // The fight follows them if a phase change would move them on.
      if (!S.npcsAt(st.player.locationId).some(x => x.id === id)) S.apply({ visits: [{ npcId: id, locationId: st.player.locationId }] });
      G.Pipeline.forceNextRoll(19);
      await G.Pipeline.submit('I punch them');
      const p = M.calls.filter(c => c.method === 'narrate').pop().text;
      out.push({ phase: st.time.phase, fight: st.fight ? st.fight.hits : null, outcome: /^OUTCOME: .*goes down hard/m.test(p), present: (/^PRESENT: .*$/m.exec(p) || [''])[0].includes(n.name), hurt: S.isHurt(n), told: /goes down hard/.test(st.log[st.log.length - 1].narration) });
    }
    return out;
  }, sc.npcs[0].id);
  assert.notEqual(r.start, r[2].phase, 'the fight crossed a phase');
  assert.deepEqual(r.map(x => x.fight), [1, 2, null]);
  assert.deepEqual(r.map(x => x.outcome), [false, false, true], 'the knockdown is narrated on the third hit');
  assert.deepEqual(r.map(x => x.told), [false, false, true], 'and the demo tells it then (integration: the mock read only "knocks out")');
  assert.equal(r[2].present, true, 'and the one knocked down is in the scene for it');
  assert.equal(r[2].hurt, true);
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.fight.hits), 2, '/undo takes the knockdown back to two hits');
});

// ----- review bug 6: complication effects -----

s.test('bug 6: a complication\'s effects are applied with the roll, and the bookkeeper is told they are done', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock;
    const real = G.Dice.resolve;
    G.Dice.resolve = opts => Object.assign(real(Object.assign({}, opts, { complication: 'You cut your hand on the wire.' })), { complicationEffects: [{ op: 'playerHp', delta: -1 }] });
    const hp = G.state.player.hp;
    M.queue('parse', { actionType: 'other', summary: 'Climbs the fence', targets: [], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'partial';
    await G.Pipeline.submit('I climb the fence');
    G.Dice.resolve = real;
    const book = M.calls.filter(c => c.method === 'bookkeep').pop();
    return { lost: hp - G.state.player.hp, book: book.text.split('\n').find(l => /^ALREADY APPLIED/.test(l)) };
  });
  assert.equal(r.lost, 1);
  assert.match(r.book, /the complication's effects: playerHp/);
});

// ----- review bug 8, B9: news told once -----

s.test('bug 8 and B9: a town event is one news item, seen once the player watched it happen; the morning does not tell it again; an event the clock jumped past is news only, dated its own day', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const ev = await page.evaluate(() => { const e = Game.State.town.events[0]; return { id: e.id, day: e.day, phase: e.phase, name: Game.State.loc(e.locationId).name }; });
  await page.evaluate(d => { Game.State.apply({ setTime: { day: d, phase: 'afternoon' } }); Game.State.loc(Game.State.town.events[0].locationId).discovered = true; }, ev.day);
  await sendText(page, `/skip to ${ev.name} at ${ev.phase}`);
  const a = await page.evaluate(id => Game.state.news.filter(n => n.eventId === id).map(n => ({ seen: n.seen, day: n.day })), ev.id);
  assert.equal(a.length, 1, 'one news item for the event');
  assert.equal(a[0].seen, true, 'seen: the player watched it');
  assert.match(await lastPacket(page), /^DUE EVENT: .*\(the scene: it happens here, now/m);
  const told = await page.evaluate(id => Game.state.news.find(n => n.eventId === id).text, ev.id);
  await sendText(page, '/rest');
  const q = (await quiets(page)).filter(t => /^Overnight in town/.test(t)).join(' ');
  assert.ok(!q.includes(told.slice(0, 40)), 'not told again overnight: ' + q);
  // Another game: the clock jumps past the event.
  const b = await h.open();
  await quickStart(b, { kinds: [] });
  await fast(b);
  const late = await b.evaluate(d => {
    const G = Game;
    G.State.apply({ setTime: { day: d + 2, phase: 'morning' } });
    G.Pipeline.passTime('long');
    const e = G.State.town.events[0];
    return { news: G.state.news.filter(n => n.eventId === e.id).map(n => ({ day: n.day, phase: n.phase })), due: G.state.dueEvents.filter(x => x.eventId === e.id).length, fired: G.state.eventsFired.includes(e.id), phase: e.phase };
  }, ev.day);
  assert.equal(late.fired, true);
  assert.deepEqual(late.news, [{ day: ev.day, phase: late.phase }], 'dated the event\'s own day');
  assert.equal(late.due, 0, 'no scene for something that happened while the player was not looking');
});

s.test('a town event the player sleeps through where it happens is told as something that happened, not as the scene', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    const e = S.town.events[0];
    S.apply({ setTime: { day: e.day, phase: 'afternoon' }, playerLocationId: e.locationId });
    await G.Pipeline.submit('/rest');
    const ev = G.state.dueEvents.find(x => x.eventId === e.id) || null;
    const p = G.Api.Mock.calls.filter(c => c.method === 'narrate').pop().text;
    return { scene: ev ? !!ev.scene : null, told: /^DUE EVENT: .*$/m.exec(p)[0] };
  });
  assert.ok(!/the scene: it happens here, now/.test(r.told), r.told);
  assert.notEqual(r.scene, true);
});

s.test('B9: a clock completion that happens in front of the player is one news item, already seen', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const f = st.factions.find(x => x.activeClock >= 0 && x.clocks[x.activeClock].onComplete && x.clocks[x.activeClock].onComplete.text);
    const c = f.clocks[f.activeClock];
    // Make it noticeable here: an effect on the player.
    c.onComplete.effects = (c.onComplete.effects || []).concat([{ op: 'playerGold', delta: 1 }]);
    c.onComplete.requires = null;
    S.apply({ clockFill: [{ factionId: f.id, delta: c.segments }] });
    const n0 = st.news.length;
    G.World.forceClockRoll(1);
    G.Pipeline.passTime('long');
    const mine = st.news.slice(n0).filter(n => n.factionId === f.id || n.text === c.onComplete.text);
    return { count: mine.length, seen: mine.map(n => n.seen) };
  });
  assert.equal(r.count, 1);
  assert.deepEqual(r.seen, [true]);
});

// ----- review bug 9: /skip into a place shut that day -----

s.test('bug 9: /skip to a place closed that day is a shut door; one shut now but open when the player gets there is walked to after the wait', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const l = st.locations.find(x => Array.isArray(x.closedOn) && x.closedOn.length);
    l.discovered = true;
    const day = d => S.weekday(d);
    let shutDay = 1; while (!l.closedOn.includes(day(shutDay))) shutDay++;
    S.apply({ setTime: { day: shutDay, phase: 'morning' } });
    const start = st.player.locationId;
    const a = await G.Pipeline.submit(`/skip to ${l.name}`);
    const out = { refused: a.reason, at: st.player.locationId === start };
    // The night before it opens: shut now, open in the morning.
    S.apply({ setTime: { day: shutDay, phase: 'night' } });
    const b = await G.Pipeline.submit(`/skip to ${l.name} in the morning`);
    out.next = [b.ok, st.player.locationId === l.id, st.time.phase, S.isClosed(l)];
    return out;
  });
  assert.equal(r.refused, 'closed');
  assert.equal(r.at, true);
  assert.deepEqual(r.next, [true, true, 'morning', false]);
});

// ----- review bug 10: /reroll replays the parse -----

s.test('bug 10: /cheat success after a failed search can find the thing (the turn is replayed from what was parsed)', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game;
    G.Api.Mock.queue('parse', { actionType: 'search', summary: 'Searches the shelves for a coil of rope', targets: ['new:coil of rope'], needsRoll: true, stat: 'wits', difficulty: 'normal', timeCost: 'short' });
    G.Pipeline.hooks.nextTier = 'failure';
    await G.Pipeline.submit('I search the shelves for a coil of rope');
    await G.Pipeline.submit('/cheat success');
    const here = G.State.loc(G.state.player.locationId);
    return { items: (here.items || []).map(i => i.name), parsed: G.Pipeline.lastTurn.parsed.targets };
  });
  assert.ok(r.items.includes('Coil of rope'), JSON.stringify(r));
  assert.deepEqual(r.parsed, ['new:coil of rope']);
});

// ----- the review's risks -----

s.test('risks: memoriesSettled needs the person here and never drops a loose end or a fact; an errand already done when its obligation is made is met; the sixth instant takes a few minutes; the recap lists rumours by the day heard', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const le = st.player.looseEnds[0];
    const n = S.npc(le.npcId);
    const out = {};
    S.apply({ beginTurn: true });
    out.loose = S.apply({ memoriesSettled: [{ npcId: n.id, text: 'Loose end with' }] }, { source: 'model', present: [n.id] }).rejected[0].reason;
    S.apply({ newMemories: [{ npcId: n.id, text: 'Fact (a story point): the boat is stolen', weight: 3 }] });
    out.fact = S.apply({ memoriesSettled: [{ npcId: n.id, text: 'the boat is stolen' }] }, { source: 'model', present: [n.id] }).rejected.length;
    // An errand done before it fell due.
    const m = st.npcs.find(x => x.id !== n.id && x.alive !== false && x.status === 'free');
    S.apply({ newMemories: [{ npcId: m.id, text: 'got the letter from home at last', weight: 2 }] });
    const att = m.attitude;
    S.apply({ effects: [{ op: 'addObligation', kind: 'errand', npcId: m.id, text: 'Put the letter in {npc}\'s hand.', itemName: 'Letter for {npc}', dueOffset: 3, onMet: [{ op: 'attitudeDelta', npcId: m.id, delta: 5 }] }] }, { source: 'world' });
    out.errand = [S.obligations().find(o => o.npcId === m.id).status, m.attitude - att];
    // Pace: the sixth instant.
    st.time.instants = S.LIMITS.instantsPerShort - 1;
    out.sixth = G.Pipeline.timeTakes({ action: { timeCost: 'instant' }, cause: 'turn' });
    out.rest = G.Pipeline.timeTakes({ action: { timeCost: 'instant' }, cause: 'rest' });
    delete st.time.instants;
    // Rumours by the day heard.
    const [r1, r2] = st.rumours;
    S.apply({ rumoursHeard: [r2.id] });
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning' } });
    S.apply({ rumoursHeard: [r1.id] });
    const heard = G.Pipeline.recapText().split('\n').find(l => /^Heard: /.test(l));
    out.order = heard.indexOf(r2.text.slice(0, 30)) < heard.indexOf(r1.text.slice(0, 30));
    return out;
  });
  assert.match(r.loose, /never settled away/);
  assert.equal(r.fact, 1, 'a fact is never settled away');
  assert.deepEqual(r.errand, ['met', 5], 'met at once, its onMet once');
  assert.match(r.sixth, /^a moment, but the talk has added up to a few minutes/);
  assert.equal(r.rest, 'a moment, no time passes');
  assert.equal(r.order, true, 'the rumour heard later comes last');
});

s.test('risk: the previous autosave is kept only from a readable autosave of another game (Storage.keepPrevious)', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const auto = keys.find(k => /autosave$/.test(k));
    const prev = keys.find(k => /autosave\.prev$/.test(k)) || auto + '.prev';
    localStorage.setItem(prev, 'GOOD PREVIOUS');
    localStorage.setItem(auto, '{not json');
    Game.App.quickStart({ name: 'Other', backgroundId: Game.data.BACKGROUNDS[0].id, stats: Object.assign({}, Game.data.BACKGROUNDS[0].stats), goal: 'x', flaw: Game.data.FLAWS[0], looseEnds: [] }, { seed: 999 });
    return localStorage.getItem(prev);
  });
  assert.equal(r, 'GOOD PREVIOUS', 'an unreadable autosave never replaces a good previous copy');
});

// ----- state writes through State.apply -----

s.test('state writes go through State.apply: a turn\'s quiet lines reach its log entry through logUpdate (and survive a reload), logEntry keeps changes, the fight and gifts are engine keys', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    for (const k of ['logUpdate', 'fight', 'giftGiven', 'arcFill']) if (!S.ENGINE_KEYS.includes(k)) return { missing: k };
    const n0 = S.debugLog.length;
    // A natural 20 makes a quiet line (the story point) for the turn's log entry.
    G.Api.Mock.queue('parse', { actionType: 'other', summary: 'Climbs the fence', targets: [], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.forceNextRoll(20);
    await G.Pipeline.submit('I climb the fence');
    const e = G.state.log[G.state.log.length - 1];
    const viaOp = S.debugLog.slice(n0).some(x => x.kind === 'applied' && /^logUpdate: log turn/.test(x.text));
    S.apply({ logEntry: { input: 'x', narration: 'y', changes: 'not recorded', notes: ['a note'] } });
    const e2 = G.state.log[G.state.log.length - 1];
    const fromModel = S.apply({ logUpdate: { notes: ['z'] } }, { source: 'model' }).rejected.length;
    return { notes: (e.notes || []).length, viaOp, kept: [e2.changes, e2.notes], fromModel };
  });
  assert.equal(r.missing, undefined, 'engine key missing: ' + r.missing);
  assert.ok(r.notes >= 1, 'the turn has its notes');
  assert.equal(r.viaOp, true, 'written by logUpdate');
  assert.deepEqual(r.kept, ['not recorded', ['a note']]);
  assert.equal(r.fromModel, 1, 'never from the model');
});

// ----- due events (SEAMS, B6) -----

s.test('B6: due events are told where the player arrives (the person comes there), up to three a turn and all of them on a narration of time passing; one from an earlier day says so; a debt confrontation is dropped once the debt is paid', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, M = G.Api.Mock;
    const out = {};
    const here = S.loc(st.player.locationId);
    const dest = here.exits.map(id => S.loc(id)).find(l => l && l.discovered && !S.isClosed(l) && !l.away);
    const n = st.npcs.find(x => x.alive !== false && x.status === 'free' && !S.npcsAt(here.id).includes(x) && !S.npcsAt(dest.id).includes(x));
    const plant = (id, text, extra) => { S.apply({ effects: [{ op: 'plantSeed', seed: Object.assign({ id, cause: 'test', effect: text, trigger: { type: 'day', value: st.time.day }, fired: false, hidden: true }, extra || {}) }] }); S.apply({ seedsFired: [id], dueAdd: [Object.assign({ seedId: id, text }, extra && extra.ev ? extra.ev : {})] }); };
    plant('seed_t_bring', `${n.name} has been looking for you.`, { origin: { kind: 'loose_end', npcId: n.id }, ev: { npcId: n.id, bring: true } });
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: dest.id, needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I walk over');
    const p1 = M.calls.filter(c => c.method === 'narrate').pop().text;
    out.bring = { told: /^DUE EVENT: .*has been looking for you/m.test(p1), there: (/^DESTINATION: .*$/m.exec(p1) || [''])[0].includes(n.name), at: st.player.locationId === dest.id };
    // Five due at once: three on an ordinary turn, the rest on the next; all of them on /wait.
    for (let i = 0; i < 5; i++) plant(`seed_t_${i}`, `Thing ${i} happened.`);
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I look around');
    out.ordinary = (/^DUE EVENT: .*$/m.exec(M.calls.filter(c => c.method === 'narrate').pop().text) || [''])[0].match(/Thing \d/g).length;
    for (let i = 5; i < 9; i++) plant(`seed_t_${i}`, `Thing ${i} happened.`);
    await G.Pipeline.submit('/wait night');
    out.quiet = (/^DUE EVENT: .*$/m.exec(M.calls.filter(c => c.method === 'narrate').pop().text) || [''])[0].match(/Thing \d/g).length;
    // From an earlier day.
    plant('seed_t_old', 'Old news came due.');
    st.dueEvents.find(e => e.seedId === 'seed_t_old').firedDay = st.time.day - 1;
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I look around');
    out.old = /Old news came due\. \(this came up on day \d+/.test(M.calls.filter(c => c.method === 'narrate').pop().text);
    // A debt confrontation, the debt paid before it is told.
    const lender = st.npcs.find(x => x.alive !== false && x.status === 'free' && x.id !== n.id);
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: lender.id, text: 'Pay {npc}.', amount: 50, dueOffset: 3 }] }, { source: 'world' });
    const o = S.obligations('open').find(x => x.npcId === lender.id);
    plant('seed_t_debt', `${lender.name} wants the money.`, { ev: { npcId: lender.id, obligationId: o.id } });
    S.apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'met' }] });
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I look around');
    out.dropped = !/wants the money/.test(M.calls.filter(c => c.method === 'narrate').pop().text) && !st.dueEvents.some(e => e.seedId === 'seed_t_debt');
    return out;
  });
  assert.deepEqual(r.bring, { told: true, there: true, at: true });
  assert.equal(r.ordinary, 3);
  assert.equal(r.quiet, 6, 'the two left over and the four new, all on /wait');
  assert.equal(r.old, true);
  assert.equal(r.dropped, true);
});

// ----- the playtest's turn rules -----

s.test('B5: a take never makes a thing from nothing (only ITEMS HERE); guns, explosives and vehicles only where they fit; "a rifle and a box of shells" is two things', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, T = G.Town, M = G.Api.Mock;
    const out = {};
    M.queue('parse', { actionType: 'take', summary: 'Picks up a rocket launcher', targets: ['new:hammer'], needsRoll: false, timeCost: 'instant' });
    const inv0 = G.state.player.inventory.length;
    await G.Pipeline.submit('I pick up a hammer');
    const p = M.calls.filter(c => c.method === 'narrate').pop().text;
    out.take = { carried: G.state.player.inventory.length - inv0, items: (G.State.loc(G.state.player.locationId).items || []).map(i => i.name), np: (/^NOT PRESENT: .*$/m.exec(p) || [''])[0] };
    out.plaus = {
      pistolGas: T.plausible('a pistol', 'gas').plausible,
      shotgunPawn: T.plausible('a used shotgun', 'pawn').plausible,
      grenade: T.plausible('a grenade', 'pawn').plausible,
      launcher: T.plausible('a rocket launcher', 'farm').plausible,
      truckBar: T.plausible('a pickup truck', 'bar').plausible,
      truckFlat: T.plausible('a pickup truck', 'apartment').plausible,
      boatBar: T.plausible('a johnboat', 'bar').plausible,
      toyGun: T.plausible('a toy gun', 'gas').plausible,
      factGun: T.plausible('a pistol', 'bar', { fact: true }).plausible,
      shellsBox: T.plausible('a box of shells', 'gas').plausible
    };
    const a = { actionType: 'search', summary: 'x', targets: ['new:a rifle and a box of shells'], needsRoll: false };
    const res = await G.Pipeline.checkAndCreate(a, { defer: true, input: 'x' });
    out.split = res.notPresent.map(x => x.label);
    return out;
  });
  assert.equal(r.take.carried, 0);
  assert.ok(!r.take.items.includes('Hammer'), 'nothing made');
  assert.match(r.take.np, /hammer \(nothing like that is here to take/);
  assert.deepEqual(r.plaus, { pistolGas: false, shotgunPawn: true, grenade: false, launcher: false, truckBar: true, truckFlat: false, boatBar: false, toyGun: true, factGun: true, shellsBox: false });
  assert.equal(r.split.length, 2, 'two things, each refused on its own: ' + JSON.stringify(r.split));
});

s.test('B4 and B17: a swing or an ask at someone who is not here, or an ask with nobody here, rolls nothing: no damage, no complication, no lock', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, M = G.Api.Mock;
    const here = S.npcsAt(st.player.locationId).map(n => n.id);
    const away = st.npcs.find(n => n.alive !== false && n.status === 'free' && !here.includes(n.id));
    const hp = st.player.hp;
    M.queue('parse', { actionType: 'attack', summary: 'Swings at them', targets: [away.id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'fumble';
    await G.Pipeline.submit('I punch ' + away.name);
    const out = { attack: { roll: G.state.log[G.state.log.length - 1].roll, hp: hp - st.player.hp, lock: st.meta.lastRollKey } };
    G.Pipeline.hooks.nextTier = null;
    // An empty place: a plea to nobody.
    const empty = st.locations.find(l => l.discovered && !l.away && !S.isClosed(l) && !S.npcsAt(l.id).length);
    S.apply({ playerLocationId: empty.id });
    M.queue('parse', { actionType: 'persuade', summary: 'Pleads for help', targets: [], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    await G.Pipeline.submit('Please, somebody help me');
    out.plea = G.state.log[G.state.log.length - 1].roll;
    return out;
  });
  assert.deepEqual(r.attack, { roll: null, hp: 0, lock: null });
  assert.equal(r.plea, null);
});

s.test('B7: a fight in front of the police: this turn\'s narration tells the arrest (ARREST line, the night in the cell in TIME THIS TAKES), and the next turn does not tell it again', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, M = G.Api.Mock;
    const cop = st.npcs.find(n => (n.tags || []).includes('police') && n.status === 'free' && n.alive !== false);
    const other = st.npcs.find(n => n.status === 'free' && n.alive !== false && !(n.tags || []).includes('police'));
    S.apply({ visits: [{ npcId: cop.id, locationId: st.player.locationId }, { npcId: other.id, locationId: st.player.locationId }] });
    M.queue('parse', { actionType: 'attack', summary: 'Punches them', targets: [other.id], needsRoll: true, stat: 'might', difficulty: 'easy', timeCost: 'instant' });
    G.Pipeline.forceNextRoll(19);
    await G.Pipeline.submit('I punch ' + other.name);
    const p1 = M.calls.filter(c => c.method === 'narrate').pop().text;
    const day = st.time.day;
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I look around');
    const p2 = M.calls.filter(c => c.method === 'narrate').pop().text;
    const told = st.log[st.log.length - 2].narration;
    return { arrest: /^ARREST: .*holding cell/m.test(p1), time: (/^TIME THIS TAKES: .*$/m.exec(p1) || [''])[0], phase: st.time.phase, day, again: /holding cell/.test((/^DUE EVENT: .*$/m.exec(p2) || [''])[0]), told };
  });
  assert.equal(r.arrest, true);
  assert.match(r.time, /night in a cell; it will be morning/);
  assert.equal(r.phase, 'morning');
  assert.equal(r.again, false, 'told once');
  assert.match(r.told, /puts you in the holding cell/, 'the demo tells the arrest in that turn too');
});

s.test('B8: a walk that crosses into the next phase shows who is there in that phase', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, M = G.Api.Mock;
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    // A neighbouring place whose crowd differs between this phase and the next.
    for (const ph of PH.slice(0, 3)) {
      S.apply({ setTime: { day: st.time.day, phase: ph, shorts: 2 } });
      const here = S.loc(st.player.locationId);
      const next = PH[PH.indexOf(ph) + 1];
      const d = here.exits.map(id => S.loc(id)).find(l => l && l.discovered && !S.isClosed(l) && !l.away && S.npcsAt(l.id, next).map(n => n.id).join() !== S.npcsAt(l.id, ph).map(n => n.id).join());
      if (!d) continue;
      M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: d.id, needsRoll: false, timeCost: 'short' });
      await G.Pipeline.submit('I walk over');
      const p = M.calls.filter(c => c.method === 'narrate').pop().text;
      const dl = (/^DESTINATION: .*$/m.exec(p) || [''])[0];
      return { found: true, nextNames: S.npcsAt(d.id, next).map(n => n.name), dl };
    }
    return { found: false };
  });
  assert.ok(r.found, 'a place whose crowd changes with the phase');
  for (const name of r.nextNames) assert.ok(r.dl.includes(name), `${name} is there in the next phase: ${r.dl}`);
});

s.test('B14: a place closed today holds only the people who live there; no card game; sleeping there is rough and the morning says it is shut', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const l = st.locations.find(x => Array.isArray(x.closedOn) && x.closedOn.length && G.Pipeline.cardGameAt(x)) || st.locations.find(x => Array.isArray(x.closedOn) && x.closedOn.length);
    let d = 1; while (!l.closedOn.includes(S.weekday(d))) d++;
    S.apply({ setTime: { day: d, phase: 'evening' }, playerLocationId: l.id });
    const present = S.npcsAt(l.id);
    const out = { onlyResidents: present.every(n => n.home && n.home.locationId === l.id) };
    G.Api.Mock.queue('parse', { actionType: 'gamble', summary: 'Sits in at cards', targets: [], needsRoll: true, stat: 'wits', timeCost: 'short' });
    const gold = st.player.gold;
    await G.Pipeline.submit('I sit in on the card game for $20');
    out.cards = { gold: st.player.gold - gold, line: (/^CARD GAME: .*$/m.exec(G.Api.Mock.calls.filter(c => c.method === 'narrate').pop().text) || [''])[0] };
    S.apply({ setTime: { day: d - 1, phase: 'night' } });
    await G.Pipeline.submit('/rest');
    const p = G.Api.Mock.calls.filter(c => c.method === 'narrate').pop().text;
    out.rest = { passed: (/^TIME PASSED: .*$/m.exec(p) || [''])[0], quality: S.restQuality() };
    return out;
  });
  assert.equal(r.onlyResidents, true);
  assert.equal(r.cards.gold, 0);
  assert.match(r.cards.line, /shut/);
  assert.match(r.rest.passed, /sleeping rough; .* is shut today/);
});

s.test('B19: someone the narration introduces by name in front of the player is met (metTurn), so the narrator stops describing their look', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = S.npcsAt(st.player.locationId).find(x => !x.knownToPlayer);
    if (!n) return null;
    G.Pipeline.noteIntroductions(`${n.name} looks up from the counter.`, st.player.locationId);
    return { known: n.knownToPlayer, met: Number.isInteger(n.metTurn) };
  });
  assert.deepEqual(r, { known: true, met: true });
});

// ----- saves -----

s.test('B12 and B13: a save is checked for the types the engine reads (state and town copy); numbers written as text load as numbers; an import passes its town to the check', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State;
    const base = () => JSON.parse(JSON.stringify(G.state));
    const town = () => JSON.parse(JSON.stringify(S.town));
    const bad = (fn, t) => { const st = base(); const tw = town(); fn(st, tw); return (S.validateShape(st, tw)[0] || '') ; };
    const out = {
      exits: bad(st => { st.locations[0].exits = null; }),
      memories: bad(st => { st.npcs[0].memories = null; }),
      hp: bad(st => { st.player.hp = 'dead'; }),
      schedule: bad(st => { st.locations[0].npcIdsBySchedule = null; }),
      obligation: bad(st => { st.player.obligations = [{ id: 'obl_debt_x', kind: 'debt', npcId: 'npc_nobody', text: 'x', status: 'open', dueDay: 'soon' }]; }),
      townNpc: bad((st, t) => { t.npcs.push(null); }),
      townEvent: bad((st, t) => { t.events = [null]; }),
      fine: bad(() => {})
    };
    const st = base();
    st.player.gold = '140';
    S.load(st, town());
    out.gold = [typeof G.state.player.gold, G.state.player.gold];
    S.apply({ goldDelta: 50 });
    out.after = G.state.player.gold;
    let imported = null;
    try { G.Storage.parseEnvelope({ kind: 'novatria-save', saveVersion: 1, state: base(), town: Object.assign(town(), { events: [null] }) }); } catch (e) { imported = e.message; }
    out.imported = imported;
    return out;
  });
  for (const k of ['exits', 'memories', 'hp', 'schedule', 'obligation', 'townNpc', 'townEvent']) assert.ok(r[k], `${k} is refused`);
  assert.match(r.obligation, /nobody in this game/);
  assert.equal(r.fine, '');
  assert.deepEqual(r.gold, ['number', 140]);
  assert.equal(r.after, 190, 'added, not glued on as text');
  assert.match(String(r.imported), /damaged/, 'the import checks the town it carries');
});

// ----- recap, gifts, Stop, a read-only tab, cards -----

s.test('the recap (f, B20): one line each in the agreed words (no heading: the UI adds it); warm and cold people with one plain reason, a loose end as "your loose end"; text cut at a word with "…"; once the ending has happened, that line, and only it after a night\'s sleep', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['enemy'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const le = st.player.looseEnds[0];
    const enemy = S.npc(le.npcId);
    const friend = st.npcs.find(n => n.id !== enemy.id && n.alive !== false && n.status === 'free' && G.presenceOf(n) === 'here' && n.pronouns === 'he');
    S.apply({ npcKnownToPlayer: [friend.id], effects: [{ op: 'attitudeDelta', npcId: friend.id, delta: 40 - friend.attitude }, { op: 'attitudeDelta', npcId: enemy.id, delta: -40 - enemy.attitude }], newMemories: [{ npcId: friend.id, text: `${st.player.name} fixed the fuel pump for me`, weight: 2 }] });
    S.apply({ effects: [{ op: 'addNews', text: 'The council met for a very long time on Tuesday and nobody in the room could say afterwards what exactly had been decided about the bridge or about the police department or about anything at all, and the mayor adjourned', public: true }] });
    const full = G.Pipeline.recapText();
    S.apply({ effects: [{ op: 'setFlag', key: 'epilogueShown', value: true }] });
    return { full, after: G.Pipeline.recapText(), brief: G.Pipeline.recapText({ brief: true }), enemy: enemy.name, friend: friend.name, label: le.label };
  });
  const lines = r.full.split('\n');
  assert.match(lines[0], /^Day \d+ \(\w+ \d+ \w+\), \w+, at .+\.$/);
  assert.match(lines[1], /^Here: (.+, )*.+( and .+)?\.$/);
  assert.match(lines[2], /^Open: /);
  assert.ok(lines.includes(`Warm to you: ${r.friend} (warm, remembers you fixed the fuel pump for him).`), r.full);
  assert.ok(lines.includes(`Cold to you: ${r.enemy} (cold, your loose end: ${r.label.toLowerCase()}).`), r.full);
  assert.ok(!/Loose end with|"[^"]*me[^"]*"/.test(r.full), 'never a raw memory');
  assert.match(r.full, /In town: Day \d+: The council met .*…/);
  assert.ok(!r.full.includes('Where things stand'), 'the UI adds the heading');
  const after = r.after.split('\n');
  assert.equal(after[1], 'The story has reached an ending; you can keep playing.');
  assert.match(after[2], /^Here: /, 'the full recap goes on after it');
  assert.deepEqual(r.brief.split('\n'), [after[0], 'The story has reached an ending; you can keep playing.'], 'only that after a night\'s sleep');
});

s.test('gifts: a second gift to the same person the same day earns no warmth', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const sc = await quietScene(page);
  const r = await page.evaluate(async id => {
    const G = Game, M = G.Api.Mock;
    const gains = [];
    for (let i = 0; i < 2; i++) {
      M.queue('parse', { actionType: 'give', summary: 'Gives them five dollars', targets: [id], needsRoll: false, timeCost: 'instant' });
      M.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 5 }], goldDelta: -5 });
      const a = G.State.npc(id).attitude;
      await G.Pipeline.submit('I give them five dollars');
      gains.push(G.State.npc(id).attitude - a);
    }
    return gains;
  }, sc.npcs[0].id);
  assert.deepEqual(r, [5, 0]);
});

s.test('Stop while the town is being updated keeps the narration (changes not recorded, no rollback), puts a queued line back in the box, and Pipeline.canStop says Stop works then', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock;
    const orig = M.bookkeep;
    M.bookkeep = async function (packet) { await new Promise(res => setTimeout(res, 500)); return orig.call(M, packet); };
    let canStop = null, queued = null;
    G.Pipeline.setStatusListener(ev => {
      if (ev.stage === 'bookkeep' && canStop === null) {
        canStop = G.Pipeline.canStop;
        setTimeout(async () => { queued = await G.Pipeline.submit('I look at the second thing'); G.Pipeline.abort(); }, 30);
      }
    });
    const t0 = G.state.meta.turn;
    const res = await G.Pipeline.submit('I look at the first thing');
    await G.Pipeline.whenIdle();
    await new Promise(res2 => setTimeout(res2, 100));
    G.Pipeline.setStatusListener(null);
    M.bookkeep = orig;
    const e = G.state.log[G.state.log.length - 1];
    return { res, canStop, queued, turns: G.state.meta.turn - t0, input: e.input, changes: e.changes, box: document.getElementById('cmd').value };
  });
  assert.equal(r.canStop, true);
  assert.equal(r.res.ok, true, 'the turn stands');
  assert.deepEqual([r.turns, r.input, r.changes], [1, 'I look at the first thing', 'not recorded']);
  assert.equal(r.queued.queued, true);
  assert.equal(r.box, 'I look at the second thing', 'the queued line is back in the box, not played');
  assert.ok((await quiets(page)).some(q => /^Stopped while the town was being updated/.test(q)));
});

s.test('Pipeline.cancelQueued takes back the line waiting in the queue: it returns its text and the line never runs', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock;
    const orig = M.bookkeep;
    M.bookkeep = async function (packet) { await new Promise(res => setTimeout(res, 300)); return orig.call(M, packet); };
    let got = null;
    G.Pipeline.setStatusListener(ev => {
      if (ev.stage === 'bookkeep' && got === null) { got = 'pending'; setTimeout(async () => { await G.Pipeline.submit('I look at the second thing'); got = { waiting: G.Pipeline.queued, back: G.Pipeline.cancelQueued(), after: G.Pipeline.queued, again: G.Pipeline.cancelQueued() }; }, 20); }
    });
    await G.Pipeline.submit('I look at the first thing');
    await G.Pipeline.whenIdle();
    await new Promise(res => setTimeout(res, 100));
    G.Pipeline.setStatusListener(null);
    M.bookkeep = orig;
    return { got, inputs: G.state.log.map(e => e.input) };
  });
  assert.deepEqual(r.got, { waiting: 'I look at the second thing', back: 'I look at the second thing', after: null, again: null });
  assert.ok(!r.inputs.includes('I look at the second thing'), 'never run');
});

s.test('a read-only tab plays nothing: a line, /look, /rest, Wait, /reroll and /cheat time are refused with a notice before anything is called', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game;
    G.Storage.setReadOnly ? G.Storage.setReadOnly(true) : null;
    if (!G.Storage.readOnly) return { skipped: true };
    const t0 = G.state.meta.turn;
    const out = [];
    for (const x of ['I look around', '/look', '/rest', '/reroll', '/cheat time night', '/undo']) out.push((await G.Pipeline.submit(x)).reason);
    out.push((await G.Pipeline.pass()).reason);
    return { reasons: out, turns: G.state.meta.turn - t0, calls: G.Api.Mock.calls.length, toast: document.getElementById('toast') ? document.getElementById('toast').textContent : (document.querySelector('.toast') || {}).textContent };
  });
  if (r.skipped) return;
  assert.deepEqual(r.reasons, ['read-only', 'read-only', 'read-only', 'read-only', 'read-only', 'read-only', 'read-only']);
  assert.equal(r.turns, 0);
  assert.equal(r.calls, 0);
  assert.match(String(r.toast), /another tab/, 'a toast says why');
});

s.test('cards: a fumble without a marked deck is only an accusation (cooler dealer, out for the night); with one it is caught (a heavier memory, colder, three days out)', async h => {
  const page = await h.open();
  const go = async (bgIndex) => {
    const p = await h.open();
    await quickStart(p, { bgIndex });
    await fast(p);
    return p.evaluate(async () => {
      const G = Game, S = G.State, st = G.state;
      const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
      for (const ph of ['evening', 'night', 'afternoon', 'morning']) {
        let d = st.time.day; while (S.isClosed(l, d)) d++;
        S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
        if (G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id))) break;
      }
      const dealer = G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id));
      if (!dealer) return null;
      const a0 = dealer.attitude;
      G.Api.Mock.queue('parse', { actionType: 'gamble', summary: 'Sits in at cards', targets: [], needsRoll: true, stat: 'wits', timeCost: 'short' });
      G.Pipeline.hooks.nextTier = 'fumble';
      await G.Pipeline.submit('I sit in at cards for $20');
      const ban = (st.bans || []).find(b => b.locationId === l.id);
      return { drop: a0 - dealer.attitude, ban: ban ? ban.untilDay - st.time.day : null, mem: (dealer.memories || []).slice(-1)[0], caught: G.Pipeline.lastTurn.ctx.gamble, told: st.log[st.log.length - 1].narration };
    });
  };
  await page.close();
  const plain = await go(0);
  const marked = await go(await (await h.open()).evaluate(() => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => /marked deck/i.test(i.name)))));
  assert.ok(plain && marked, 'a card game with its dealer');
  assert.equal(plain.caught.accused, true);
  assert.equal(plain.caught.caught, false);
  assert.equal(plain.drop, 10);
  assert.ok(plain.ban <= 1, 'out for the night');
  assert.equal(plain.mem.weight, 2);
  assert.equal(marked.caught.caught, true);
  assert.equal(marked.drop, 20);
  assert.ok(marked.ban >= 2, 'three days out');
  assert.equal(marked.mem.weight, 3);
  // The demo tells which (integration: the mock read only caught).
  assert.match(plain.told, /says you were cheating and tells you to clear out for the night/);
  assert.match(marked.told, /throws you out for cheating/);
});

s.test('hurt: State.isHurt is true through the day before hurtUntilDay; they are about again on that day; the note names the last day laid up', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false && x.home);
    S.apply({ npcFates: [{ npcId: n.id, status: 'hurt' }] });
    const d = st.time.day;
    return { until: n.hurtUntilDay - d, today: S.isHurt(n), next: S.isHurt(n, d + 1), back: S.isHurt(n, d + 2), note: S.absentNote(n), last: d + 1 };
  });
  assert.deepEqual([r.until, r.today, r.next, r.back], [2, true, true, false]);
  assert.ok(r.note.endsWith(`until day ${r.last}`), r.note);
});

s.test('commands and wording: /load and /save take a name; "You are already at the Low Water" (no capital The mid-sentence)', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const list = G.Commands.LIST.filter(c => c.name === '/load' || c.name === '/save').map(c => c.args);
    const l = st.locations.find(x => /^The /.test(x.name) && x.discovered && !x.away && !S.isClosed(x));
    S.apply({ playerLocationId: l.id });
    await G.Pipeline.submit(`/skip to ${l.name}`);
    return { list, notice: [...document.querySelectorAll('#feed .f-notice')].pop().textContent, name: l.name };
  });
  assert.deepEqual(r.list, ['[name]', '[name]']);
  assert.equal(r.notice, `You are already at ${r.name.replace(/^The /, 'the ')}.`);
});

s.run();
