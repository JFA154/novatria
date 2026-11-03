'use strict';
/* Wave 40 (3 Nov 2026): the coercion rule, "however the line is put"
   (docs/RELATIONSHIPS_PLAN.md section 9, the first risk; the integration
   plan's 19.1). A romantic line at someone at fear 40 or more, or over
   whom the player holds a live record, is refused as coerced whatever the
   parser called the action (a walk to the motor court, a give), for every
   named target; a threatening romantic line to the whole room is refused
   by every adult there, the threat row for each and one hit to the town;
   intimateGate counts fear and a held record short. A clean courtship is
   unchanged. And decision 11 (section 10): a clean theft nobody saw may be
   found out in the days after, on its own stream. Mock mode.
   Run with: node tests/run.cjs wave40-coercion */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave40-coercion');

/* In the page: __put (the player somewhere with these people, now), __turn
   (a Do or Say line with its parse; what the turn did to one person),
   __mems (their memories this turn). */
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
  // Their own memories this turn (a witness's lighter copy, or what reached them along a tie, is not theirs).
  window.__mems = id => G.State.npc(id).memories.filter(m => m.turn === G.state.meta.turn && !m.witness && !m.secondhand).map(m => [m.event, m.weight]);
  window.__turn = async (words, parse, how) => {
    const st = G.state;
    const rep0 = st.player.reputation.town || 0;
    const c0 = st.meta.rngCalls;
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'other', summary: words, targets: [], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit(words, how || { mode: 'do' });
    const c = G.Pipeline.lastTurn.ctx;
    const packet = G.Pipeline.lastTurn.packet;
    return {
      roll: c.roll ? [c.roll.stat, c.roll.tier] : null, draws: st.meta.rngCalls - c0, coerced: c.coercedIds || null,
      each: c.romance && c.romance.coercion ? c.romance.coercion.each.map(x => [x.npcId, x.why, !!x.room]) : null,
      lines: packet.split('\n').filter(l => /^(COERCION|ROMANCE)/.test(l)), rep: (st.player.reputation.town || 0) - rep0,
      reports: st.seeds.filter(sd => sd.turn === st.meta.turn && sd.origin && sd.origin.kind === 'report' && sd.origin.why === 'coercion').map(sd => sd.origin.npcId).sort(),
      intimate: st.npcs.filter(n => n.memories.some(m => m.event === 'intimate' && m.turn === st.meta.turn)).map(n => n.id)
    };
  };
});
const start = async h => { const page = await h.open(); await quickStart(page, { kinds: [] }); await kit(page); return page; };
const J = 'npc_jodie';
const SH = 'npc_shayla';
// Every gate of the night met, and nothing pushing: spark 60, romance 50, trust 40, knows 40, fear 0.
const WARM = { s: 60, m: 50, t: 40, k: 40, f: 0 };

s.test('a night asked as a walk to the motor court at fear 40, no threat in the words, is refused as coerced: the COERCION line, blackmailed and crossed at weight 3, a report, the town 10 down, the d20 burned', async h => {
  const page = await start(h);
  const r = await page.evaluate(async ({ J, WARM }) => {
    const G = Game, S = G.State;
    __put('loc_pittmans', [J], 4, 'evening');
    S.apply({ relSet: Object.assign({ npcId: J }, WARM, { f: 40 }) });
    const gate = G.Rel.intimateGate(S.npc(J));
    const out = await __turn('I take Jodie by the hand and walk her over to the motor court for the night.', { actionType: 'move', destinationId: 'loc_motor_court', targets: [J], romantic: 'flirt' });
    return Object.assign(out, { gate, mems: __mems(J) });
  }, { J, WARM });
  assert.equal(r.gate.ok, false, 'the gate itself is short at fear 40');
  assert.ok(r.gate.short.includes('fear 40 at 40 or more'), JSON.stringify(r.gate.short));
  assert.deepEqual(r.each, [[J, 'fear', false]]);
  assert.deepEqual(r.coerced, [J]);
  assert.equal(r.roll, null, 'no roll, nothing given');
  assert.ok(r.draws >= 1, 'the d20 is still drawn (burned): ' + r.draws);
  assert.ok(r.lines.some(l => /^COERCION \(the engine: no roll, nothing given\): Jodie Strayhorn refuses: she won't be pushed into that, and she (leaves|calls for [A-Z][a-z]+ [A-Z][a-z]+)\.$/.test(l)), JSON.stringify(r.lines));
  assert.ok(!r.lines.some(l => /says yes|fade to black/.test(l)), 'never a yes: ' + JSON.stringify(r.lines));
  assert.deepEqual(r.intimate, [], 'no night');
  assert.deepEqual(r.mems.map(m => m[0]).sort(), ['blackmailed', 'crossed']);
  assert.ok(r.mems.every(m => m[1] === 3), JSON.stringify(r.mems));
  assert.deepEqual(r.reports, [J], 'her report, at once');
  assert.equal(r.rep, -10, 'the town 10 down');
});

s.test('the same with a live record over her and no lev_ id in the parse, and the same for a give: leverage and fear never buy the night', async h => {
  const page = await start(h);
  const r = await page.evaluate(async ({ J, WARM }) => {
    const G = Game, S = G.State;
    const out = {};
    __put('loc_pittmans', [J], 4, 'evening');
    S.apply({ relSet: Object.assign({ npcId: J }, WARM) });
    out.clean = G.Rel.intimateGate(S.npc(J));
    S.apply({ leverageAdd: { holder: 'player', over: J, about: { kind: 'seen' }, text: 'saw her pocket cash from the register drawer', weight: 1, aware: true, playerKnows: true } });
    const rec = G.state.leverage.find(x => x.over === J);
    out.gate = G.Rel.intimateGate(S.npc(J));
    out.fear = G.Rel.tracksOf(S.npc(J)).f;
    out.lev = await __turn('I walk Jodie down to the motor court and get us a room.', { actionType: 'move', destinationId: 'loc_motor_court', targets: [J], romantic: 'more' });
    out.levMems = __mems(J);
    out.levRec = [rec.id, G.state.leverage.find(x => x.id === rec.id).status];
    // A give, at fear 45 (another day, the record let go).
    S.apply({ effects: [{ op: 'leverageSet', id: rec.id, status: 'void' }] });
    __put('loc_pittmans', [J], 6, 'evening');
    S.apply({ relSet: Object.assign({ npcId: J }, WARM, { f: 45 }) });
    out.give = await __turn('I hand Jodie a bottle of wine and ask her to spend the night with me.', { actionType: 'give', targets: [J], romantic: 'more' });
    out.giveMems = __mems(J);
    return out;
  }, { J, WARM });
  assert.equal(r.clean.ok, true, 'every gate met before the record: ' + JSON.stringify(r.clean.short));
  assert.ok(r.gate.short.includes('the player holds something over them'), JSON.stringify(r.gate.short));
  assert.ok(r.fear < 40, 'the record alone, not fear: ' + r.fear);
  assert.deepEqual(r.lev.each, [[J, 'leverage', false]]);
  assert.equal(r.lev.roll, null);
  assert.ok(r.lev.lines.some(l => /^COERCION .*Jodie Strayhorn refuses/.test(l)), JSON.stringify(r.lev.lines));
  assert.deepEqual(r.lev.intimate, []);
  assert.deepEqual(r.levMems.map(m => m[0]).sort(), ['blackmailed', 'crossed']);
  assert.equal(r.lev.rep, -10);
  assert.deepEqual(r.lev.reports, [J]);
  assert.equal(r.levRec[1], 'held', 'a record the words never named is not used: ' + r.levRec);
  assert.deepEqual(r.give.each, [[J, 'fear', false]], 'a give at fear 45');
  assert.equal(r.give.roll, null);
  assert.deepEqual(r.give.intimate, []);
  assert.ok(r.give.lines.some(l => /^COERCION .*Jodie Strayhorn refuses/.test(l)));
  assert.deepEqual(r.giveMems.map(m => m[0]).sort(), ['blackmailed', 'crossed']);
  assert.equal(r.give.rep, -10);
});

s.test('two named targets: a threat with Jodie and Shayla both named refuses both, each with blackmailed, crossed and a report, the town hit once', async h => {
  const page = await start(h);
  const r = await page.evaluate(async ({ J, SH }) => {
    const out = await (async () => {
      __put('loc_pittmans', [J, SH], 4, 'evening');
      return __turn('Both of you come back to my room tonight, or everyone hears what I know.', { actionType: 'talk', targets: [J, SH], romantic: 'more' });
    })();
    return Object.assign(out, { j: __mems(J), sh: __mems(SH) });
  }, { J, SH });
  assert.deepEqual(r.each, [[J, 'threat', false], [SH, 'threat', false]]);
  assert.equal(r.roll, null);
  assert.equal(r.lines.filter(l => /^COERCION /.test(l)).length, 2, JSON.stringify(r.lines));
  assert.ok(r.lines.some(l => /Shayla Rawls refuses: she won't be pushed into that/.test(l)), 'the second is no ordinary flirt: ' + JSON.stringify(r.lines));
  assert.ok(!r.lines.some(l => /^ROMANCE/.test(l)), 'nobody answers it as a flirt: ' + JSON.stringify(r.lines));
  for (const m of [r.j, r.sh]) assert.deepEqual(m.map(x => x[0]).sort(), ['blackmailed', 'crossed']);
  assert.deepEqual(r.reports, [J, SH].sort());
  assert.equal(r.rep, -10, 'one hit to the town, not one each');
});

s.test('a threatening romantic line to the room: every adult here refuses as coerced, threatened for each at its weight, no blackmail and no report, the town hit once; Kaylee keeps the minor rule\'s light row', async h => {
  const page = await start(h);
  const r = await page.evaluate(async ({ J, SH }) => {
    const G = Game, S = G.State, R = G.Rel;
    const here = __put('loc_pittmans', [J, SH, 'npc_kaylee'], 4, 'afternoon');
    const out = await __turn('One of you is coming home with me tonight, or I\'ll tell everyone what I know.', { actionType: 'talk', targets: here, romantic: 'more' }, { mode: 'say', to: 'everyone' });
    out.here = here;
    out.adults = here.filter(id => !R.isMinor(S.npc(id)));
    out.mems = Object.fromEntries(here.map(id => [id, __mems(id)]));
    return out;
  }, { J, SH });
  assert.ok(r.adults.includes(J) && r.adults.includes(SH) && !r.adults.includes('npc_kaylee'), JSON.stringify(r.here));
  assert.deepEqual(r.each.map(x => x[0]).sort(), r.adults.slice().sort());
  assert.ok(r.each.every(x => x[1] === 'threat' && x[2] === true), JSON.stringify(r.each));
  for (const id of r.adults) assert.deepEqual(r.mems[id], [['threatened', 2]], `${id}: the threat row at its weight: ${JSON.stringify(r.mems[id])}`);
  assert.deepEqual(r.mems.npc_kaylee.map(m => m[0]), ['noted'], 'the light row for the minor: ' + JSON.stringify(r.mems.npc_kaylee));
  assert.equal(r.roll, null);
  assert.equal(r.lines.filter(l => /^COERCION /.test(l)).length, 1, 'one line for the room: ' + JSON.stringify(r.lines));
  assert.match(r.lines.find(l => /^COERCION /.test(l)), /refuse: nobody here will be pushed into that/);
  assert.deepEqual(r.reports, [], 'the room\'s threat plants no coercion report');
  assert.equal(r.rep, -10, 'one hit to the town, not one per person');
});

s.test('nothing changes for a clean courtship: a flirt at low gates still rolls charm, and with every gate met and fear low the night opens with no roll', async h => {
  const page = await start(h);
  const r = await page.evaluate(async ({ J, WARM }) => {
    const G = Game, S = G.State;
    const out = {};
    __put('loc_pittmans', [J], 4, 'evening');
    S.apply({ relSet: { npcId: J, k: 20, f: 10 } });
    G.Pipeline.hooks.nextTier = 'success';
    out.flirt = await __turn('You have the nicest laugh in this whole town.', { actionType: 'talk', targets: [J], romantic: 'flirt' }, { mode: 'say', to: J });
    S.apply({ relSet: Object.assign({ npcId: J }, WARM, { f: 10 }) });
    out.gate = G.Rel.intimateGate(S.npc(J));
    __put('loc_pittmans', [J], 6, 'evening');
    out.night = await __turn('Come back to my room tonight?', { actionType: 'talk', targets: [J], romantic: 'more' }, { mode: 'say', to: J });
    return out;
  }, { J, WARM });
  assert.equal(r.flirt.each, null, 'no coercion');
  assert.deepEqual(r.flirt.roll, ['charm', 'success'], 'the welcome path still rolls charm');
  assert.ok(r.flirt.lines.some(l => /^ROMANCE \(decided by the engine\): Jodie Strayhorn is open to it/.test(l)), JSON.stringify(r.flirt.lines));
  assert.equal(r.gate.ok, true, JSON.stringify(r.gate.short));
  assert.equal(r.night.each, null);
  assert.equal(r.night.roll, null, 'the night is no roll');
  assert.ok(r.night.lines.some(l => /Jodie Strayhorn says yes; fade to black/.test(l)), JSON.stringify(r.night.lines));
  assert.deepEqual(r.night.intimate, [J]);
  assert.equal(r.night.rep, 0);
});

s.test('intimateGate reports fear and a held record (aware or not) in short; an unaware record pushes nobody but still keeps the night closed', async h => {
  const page = await start(h);
  const r = await page.evaluate(async ({ J, WARM }) => {
    const G = Game, S = G.State, R = G.Rel;
    const out = {};
    S.apply({ relSet: Object.assign({ npcId: J }, WARM, { f: 55 }) });
    out.fear = R.intimateGate(S.npc(J)).short;
    S.apply({ relSet: Object.assign({ npcId: J }, WARM) });
    S.apply({ leverageAdd: { holder: 'player', over: J, about: { kind: 'seen' }, text: 'saw her pocket cash from the register drawer', weight: 2, aware: false } });
    out.unaware = R.intimateGate(S.npc(J)).short;
    __put('loc_pittmans', [J], 4, 'evening');
    G.Pipeline.hooks.nextTier = 'success';
    out.turn = await __turn('Stay with me tonight.', { actionType: 'talk', targets: [J], romantic: 'more' }, { mode: 'say', to: J });
    return out;
  }, { J, WARM });
  assert.deepEqual(r.fear, ['fear 55 at 40 or more']);
  assert.deepEqual(r.unaware, ['the player holds something over them']);
  assert.equal(r.turn.each, null, 'she does not know of it, and the words do not use it: no coercion');
  assert.deepEqual(r.turn.intimate, [], 'but no night either');
  assert.ok(r.turn.lines.some(l => /Jodie Strayhorn: not tonight; she says so kindly\./.test(l)), JSON.stringify(r.turn.lines));
});

s.test('decision 11: a clean theft nobody saw plants a found-out seed on its own stream; when it fires the victim remembers the theft at its weight and the Journal says they noticed', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    const H = 'npc_hollis';
    const out = { tries: [] };
    let sd = null;
    for (let i = 0; i < 6 && !sd; i++) {
      __put('loc_byrds_pawn', [H], 3 + i, 'morning');
      const day = st.time.day;
      const c0 = st.meta.rngCalls;
      const m0 = S.npc(H).memories.length;
      M.queue('parse', { actionType: 'steal', summary: 'Lifts a ring off the counter', targets: [H], needsRoll: true, stat: 'stealth', difficulty: 'normal', timeCost: 'instant' });
      M.queue('bookkeep', {});
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('I lift Hollis\'s ring while he looks the other way');
      // The same draws as the stream gives: each of the next three days a 0.4 chance.
      const rr = R.rng('foundOut', H, day, st.meta.turn);
      let due = null;
      for (let d = 1; d <= 3 && due === null; d++) if (rr.next() < 0.4) due = day + d;
      sd = st.seeds.find(x => x.origin && x.origin.kind === 'found_out' && x.turn === st.meta.turn) || null;
      out.tries.push({ due, planted: sd ? sd.trigger.value : null, mems: S.npc(H).memories.length - m0, draws: st.meta.rngCalls - c0 });
    }
    if (!sd) return out;
    out.seed = { id: sd.id, hidden: sd.hidden, origin: sd.origin, fx: sd.effects.map(e => [e.op, e.event || null]) };
    S.apply({ setTime: { day: sd.trigger.value, phase: 'morning' } });
    G.World.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const m = S.npc(H).memories.filter(x => x.event === 'stole_from');
    out.mem = m.map(x => [x.weight, x.text]);
    out.news = S.news.filter(n => /noticed what went missing/.test(n.text)).map(n => [n.text, n.seen]);
    out.due = st.dueEvents.filter(e => e.seedId === sd.id).map(e => e.text);
    await G.Pipeline.submit('/journal');
    out.journal = [...document.querySelectorAll('[data-section="story"] .jr-text')].map(x => x.textContent).filter(t => /noticed/.test(t));
    return out;
  });
  assert.ok(r.seed, 'a seed within six tries: ' + JSON.stringify(r.tries));
  for (const t of r.tries) {
    assert.equal(t.mems, 0, 'no memory at the time: ' + JSON.stringify(t));
    assert.equal(t.planted, t.due, 'the seed day is the stream\'s: ' + JSON.stringify(t));
  }
  assert.equal(r.seed.hidden, true);
  assert.equal(r.seed.origin.kind, 'found_out');
  assert.deepEqual(r.seed.fx, [['socialEvent', 'stole_from'], ['addNews', null]]);
  assert.equal(r.mem.length, 1, JSON.stringify(r.mem));
  assert.equal(r.mem[0][0], 3, 'the theft row\'s weight');
  assert.match(r.mem[0][1], /stole from me/);
  assert.equal(r.news.length, 1);
  assert.equal(r.news[0][1], true, 'told as its due event, so seen');
  assert.deepEqual(r.due, ['Hollis Byrd noticed what went missing, and has a fair idea who took it.']);
  assert.deepEqual(r.journal, ['Hollis Byrd noticed what went missing, and has a fair idea who took it.']);
});

s.run();
