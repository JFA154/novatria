'use strict';
/* Wave 27 (1 Nov 2026): what the engine sees, people remember for what it
   was (docs/RELATIONSHIPS_PLAN.md, wave A2; the integration plan's section
   16). The engine's own events are typed (a fight is one memory, a threat,
   a theft, a gift, a word kept or broken, a rescue, a cheat, the card
   seats), the people who saw it take a lighter copy for the scene, the
   bookkeeper's duplicates and its legacy lines yield to them, fading
   replaces the drift, the gates read the tracks (the dice, fear's no-roll
   compliance with the die still drawn, rescue, the grudge, the report to a
   protector, the shop that won't sell), the town's standing moves on what
   was done in public, and a story point's fact says how someone stood.
   Mock mode; every new draw is Rel.rng's own stream.
   Run with: node tests/run.cjs wave27 */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave27-rel-engine');

/* __put(locId, ids, day?, phase?): the player somewhere with these people, now (visits for this phase). */
const setup = page => page.evaluate(() => {
  window.__put = (locId, ids, day, phase) => {
    const S = Game.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
});

s.test('a fight is one memory: the second hit raises it, the third is a beat-down that replaces it, and the people who saw it get one lighter copy for the scene, never the old weight-3 memory', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const here = __put('loc_purvis_landing', ['npc_colt', 'npc_lorna', 'npc_trent', 'npc_dewayne'], 7, 'evening');
    const out = { here, steps: [] };
    const rep0 = st.player.reputation.town || 0;
    for (let i = 0; i < 3; i++) {
      M.queue('parse', { actionType: 'attack', summary: 'Hits Colt', targets: ['npc_colt'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('I hit Colt Purvis');
      const c = S.npc('npc_colt');
      out.steps.push({ mems: c.memories.map(m => [m.event, m.d && m.d.w, m.d && m.d.f, m.weight, m.n | 0]), tracks: R.tracksOf(c), rep: (st.player.reputation.town || 0) - rep0 });
    }
    const c = S.npc('npc_colt');
    out.colt = { tracks: R.tracksOf(c), stance: R.stance(c), mems: c.memories.length, attacked: c.memories.some(m => /attacked me/.test(m.text)) };
    out.watchers = ['npc_lorna', 'npc_trent', 'npc_dewayne'].map(id => {
      const n = S.npc(id);
      return { id, copies: n.memories.filter(m => m.witness).map(m => ({ event: m.event, d: m.d, weight: m.weight, text: m.text, lighter: /lighter/.test(R.debugMemory(m)) })), heavy: n.memories.filter(m => m.weight === 3).length };
    });
    const g = st.seeds.find(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === 'npc_colt');
    out.grudge = g ? { why: g.origin.why, kind: G.data.GRUDGE_TEMPLATES[g.origin.template].kind, day: g.trigger.value, from: st.time.day, turn: g.turn } : null;
    out.news = st.news.some(x => /knocked Colt Purvis down/.test(x.text));
    return out;
  });
  for (const id of ['npc_colt', 'npc_lorna', 'npc_trent', 'npc_dewayne']) assert.ok(r.here.includes(id), `${id} is at the landing: ${r.here}`);
  const [one, two, three] = r.steps;
  assert.deepEqual(one.mems, [['hit', -25, 15, 3, 1]], 'a clean hit: one memory (Colt is nervy: fear x0.75)');
  assert.deepEqual(two.mems, [['hit', -35, 21, 3, 2]], 'the second hit in the same fight raises it x1.4, still one memory');
  assert.deepEqual(three.mems, [['beat_down', -35, 26, 3, 1]], 'the third is the beat-down, which replaces the fight\'s memory');
  assert.deepEqual([r.colt.tracks.w, r.colt.tracks.t, r.colt.tracks.f], [-30, -25, 26], 'Colt (start 5, trust -10 as a smuggler): liking -30, trust -25, fear 26 (a tough man stops at 39)');
  assert.equal(r.colt.stance.phrase, 'against you');
  assert.ok(r.colt.stance.tags.includes('uneasy around you'));
  assert.equal(r.colt.attacked, false, 'the demo\'s "attacked me" yields to the engine\'s fight');
  assert.deepEqual([one.rep, two.rep, three.rep], [-3, -3, -5], 'in front of three people: the hit costs the town 3, the second nothing more, the beating the rest of its 5');
  for (const w of r.watchers) {
    assert.equal(w.copies.length, 1, `${w.id}: one copy for the scene: ${JSON.stringify(w.copies)}`);
    assert.equal(w.heavy, 0, `${w.id}: never the old weight-3 memory`);
    const [cp] = w.copies;
    assert.equal(cp.event, 'beat_down', 'named by the heaviest thing seen');
    assert.equal(cp.weight, 2);
    assert.equal(cp.lighter, true, 'it fades one class lighter');
    assert.equal(cp.text, 'saw Tester put Colt Purvis down at Purvis Landing');
    assert.equal(cp.d.w, -18, `${w.id}: -5, -5, -8 seen`);
  }
  const lorna = r.watchers[0].copies[0].d;
  assert.deepEqual([lorna.t, lorna.f], [-13, 28], 'Lorna (open: trust losses x0.85): trust -13, fear 8 + 8 + 12');
  const trent = r.watchers[1].copies[0].d;
  assert.equal(trent.f, 21, 'Trent is nervy too: fear x0.75 a time');
  assert.ok(r.grudge, 'a beat-down on someone tough is answered');
  assert.equal(r.grudge.why, 'tough');
  assert.equal(r.grudge.kind, 'violence');
  assert.ok(r.grudge.day >= r.grudge.from + 3 && r.grudge.day <= r.grudge.from + 5, 'the beating comes due in 3 to 5 days: ' + JSON.stringify(r.grudge));
  assert.ok(Number.isInteger(r.grudge.turn), 'stamped with its turn, so /rewind strikes it');
  assert.equal(r.news, true, 'news in a public place');
});

s.test('the engine wins: its hit drops the bookkeeper\'s humiliated and threatened for that person, its gift drops kept_word, and the demo\'s own attack and gift numbers yield to the engine\'s', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    // Dedupe by class: the bookkeeper's events (bookkeeper: true until wave 28 sends them) after the engine's this turn.
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_dewayne', event: 'hit', text: 'hit me over the tow bill' }] });
    const kept = S.apply({ socialEvents: [
      { npcId: 'npc_dewayne', event: 'humiliated', text: 'shamed me in front of Royce', bookkeeper: true },
      { npcId: 'npc_dewayne', event: 'threatened', text: 'said he would do worse', bookkeeper: true },
      { npcId: 'npc_dewayne', event: 'pried', text: 'asked about my wife', bookkeeper: true }
    ] });
    out.dedupe = [S.npc('npc_dewayne').memories.map(m => m.event), kept.applied.filter(x => /already recorded violence/.test(x)).length];
    S.apply({ socialEvents: [{ npcId: 'npc_burl', event: 'gift', text: 'gave me a carburetor kit' }] });
    S.apply({ socialEvents: [{ npcId: 'npc_burl', event: 'kept_word', text: 'kept quiet about the kit', bookkeeper: true }, { npcId: 'npc_burl', event: 'did_favour', text: 'helped with the outboard', bookkeeper: true }] });
    out.money = S.npc('npc_burl').memories.map(m => m.event);
    // Engine against engine: one payment is one event in one change.
    const two = S.apply({ socialEvents: [{ npcId: 'npc_royce', event: 'paid_back', text: 'paid the tab' }, { npcId: 'npc_royce', event: 'gift', text: 'and a tip' }] });
    out.payOnce = [S.npc('npc_royce').memories.map(m => m.event), two.applied.some(x => /a money event for them was already counted/.test(x))];
    // The demo's attack (-20, "attacked me") yields to the engine's hit.
    const here = __put('loc_pittmans', ['npc_dewayne', 'npc_jodie'], st.time.day + 1, 'morning');
    const d0 = S.npc('npc_jodie').attitude;
    M.queue('parse', { actionType: 'attack', summary: 'Punches Jodie', targets: ['npc_jodie'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I punch Jodie Strayhorn');
    const j = S.npc('npc_jodie');
    out.attack = { here, moved: j.attitude - d0, mems: j.memories.map(m => [m.event, m.text]), dropped: S.debugLog.filter(x => /the engine counted the fight for npc_jodie/.test(x.reason || '')).map(x => x.path) };
    // The demo's gift: +5 and "gave me $5" yield to the engine's gift, which counts once the money has moved.
    S.apply({ playerLocationId: 'loc_byrds_pawn' });
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning' } });
    S.apply({ playerLocationId: 'loc_byrds_pawn' });
    S.apply({ visits: [{ npcId: 'npc_hollis', locationId: 'loc_byrds_pawn' }] });
    G.UI.setMode('say'); G.UI.setAddressee('npc_hollis');
    const h0 = S.npc('npc_hollis').attitude;
    const g0 = st.player.gold;
    M.queue('parse', { actionType: 'talk', summary: 'Hands Hollis five dollars', targets: ['npc_hollis'], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { attitudeChanges: [{ npcId: 'npc_hollis', delta: 5 }], newMemories: [{ npcId: 'npc_hollis', text: 'gave me five dollars for nothing', weight: 2 }], goldDelta: -5 });
    await G.Pipeline.submit('Here, take five dollars.');
    const ho = S.npc('npc_hollis');
    out.gift = { moved: ho.attitude - h0, paid: g0 - st.player.gold, mems: ho.memories.filter(m => m.event === 'gift').map(m => [m.text, m.weight, m.d.w]), legacy: ho.memories.some(m => /for nothing/.test(m.text)) };
    // Refused money is no gift: nothing moved, nothing counted (and the demo's +5 still yields).
    const h1 = ho.attitude;
    M.queue('parse', { actionType: 'talk', summary: 'Offers a fortune', targets: ['npc_hollis'], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { attitudeChanges: [{ npcId: 'npc_hollis', delta: 5 }], goldDelta: -999999 });
    await G.Pipeline.submit('Here, take a million dollars.');
    out.refused = [ho.attitude - h1, ho.memories.filter(m => m.event === 'gift').length];
    G.UI.setMode('do');
    return out;
  });
  assert.deepEqual(r.dedupe, [['hit', 'pried'], 2], 'the hit drops the bookkeeper\'s humiliated and threatened; prying is another class and stays');
  assert.deepEqual(r.money, ['gift'], 'the engine\'s gift drops the bookkeeper\'s kept_word and did_favour');
  assert.deepEqual(r.payOnce, [['paid_back'], true], 'the first money event for a person in one change wins');
  assert.ok(r.attack.here.includes('npc_jodie'));
  assert.equal(r.attack.moved, -25, 'the engine\'s hit, -25, and not the demo\'s -20 on top');
  assert.deepEqual(r.attack.mems.map(m => m[0]), ['hit'], 'one memory, the engine\'s: ' + JSON.stringify(r.attack.mems));
  assert.ok(r.attack.dropped.includes('attitudeChanges') && r.attack.dropped.includes('newMemories'), 'a debug line for each: ' + JSON.stringify(r.attack.dropped));
  assert.equal(r.gift.paid, 5);
  assert.equal(r.gift.moved, 5, 'the gift counts once: +5');
  assert.deepEqual(r.gift.mems, [['gave me $5', 1, 5]], 'the engine\'s words for what moved, weight 1 (a slight)');
  assert.equal(r.gift.legacy, false, 'the demo\'s memory yields');
  assert.deepEqual(r.refused, [0, 1], 'money that never moved is no gift (the demo\'s +5 still yields)');
});

s.test('threat-made fear plants a report to the person\'s protector whatever their liking; a faction head has nobody and holds a grudge instead; the dice and clocks after it are the same draw for draw', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, R = G.Rel, st = G.state;
    const out = {};
    // Tyler likes the player (40), then is threatened twice: the fear is the threats', so he tells Mavis anyway.
    S.apply({ relSet: { npcId: 'npc_tyler', w: 40 } });
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_tyler', event: 'threatened', text: 'threatened me at the desk' }] });
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_tyler', event: 'threatened', text: 'threatened me at the desk again' }] });
    const t = S.npc('npc_tyler');
    out.tyler = [R.tracksOf(t).w, R.tracksOf(t).f, R.reportWhy(t)];
    out.protector = R.protectorOf(t);
    const day = st.time.day;
    W.tick({ to: { day, phase: st.time.phase } });
    const sd = st.seeds.find(x => x.origin && x.origin.kind === 'report' && x.origin.npcId === 'npc_tyler');
    out.report = sd ? { protectors: sd.origin.protectors, why: sd.origin.why, at: sd.trigger.value - day, effect: sd.effect, turn: sd.turn } : null;
    // Once a memory: the next tick plants no second report.
    W.tick({ to: { day, phase: st.time.phase } });
    out.once = st.seeds.filter(x => x.origin && x.origin.kind === 'report' && x.origin.npcId === 'npc_tyler').length;
    // Its day: Mavis takes it, a crossed-class memory from the template.
    sd.trigger.value = day;
    W.fireSeeds({ locationId: st.player.locationId, presentNpcIds: [] });
    const m = S.npc('npc_mavis');
    out.mavis = { mems: m.memories.map(x => [x.event, x.text, !!x.secondhand]), tracks: R.tracksOf(m) };
    // Hollis goes to Wade through a tie the town does not know: Wade's memory is hidden, and no due event names it.
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_hollis', event: 'threatened', text: 'leaned on me at the pawn counter' }] });
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_hollis', event: 'threatened', text: 'leaned on me at the pawn counter again' }] });
    W.tick({ to: { day, phase: st.time.phase } });
    const hs = st.seeds.find(x => x.origin && x.origin.kind === 'report' && x.origin.npcId === 'npc_hollis');
    out.hollis = hs ? [hs.origin.protectors, hs.origin.hidden] : null;
    if (hs) { hs.trigger.value = day; W.fireSeeds({ locationId: st.player.locationId, presentNpcIds: [] }); }
    const wade = S.npc('npc_wade');
    out.wade = wade.memories.filter(x => x.event === 'crossed').map(x => x.secondhand);
    out.hiddenDue = (st.dueEvents || []).some(e => e.seedId === (hs && hs.id));
    // Marcus has nobody (a faction head): what would be a report is a grudge (gossip: he is not tough).
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_marcus', event: 'threatened', text: 'threatened me outside Town Hall' }] });
    const mk = S.npc('npc_marcus');
    const key = mk.memories.find(x => x.event === 'threatened').key;
    out.marcusWhy = R.protectorOf(mk);
    const g = W.plantReport(mk, { why: 'threat', key }, day);
    out.marcus = g ? [g.origin.kind, g.origin.why, G.data.GRUDGE_TEMPLATES[g.origin.template].kind] : null;
    out.marcusHard = R.tracksOf(mk).f <= 39;
    return out;
  });
  assert.equal(r.tyler[0], 15, 'liking 40 less two threats (-10, then -15 as it compounds)');
  assert.ok(r.tyler[1] >= 40, 'afraid: ' + r.tyler[1]);
  assert.equal(r.tyler[2].why, 'threat');
  assert.deepEqual(r.protector, { ids: ['npc_mavis'], hidden: false }, 'his boss');
  assert.ok(r.report, 'a report seed');
  assert.deepEqual(r.report.protectors, ['npc_mavis']);
  assert.equal(r.report.why, 'threat');
  assert.ok(r.report.at >= 1 && r.report.at <= 2, 'in 1 or 2 days');
  assert.equal(r.report.effect, 'Tyler Rasberry tells Mavis Mangum that Tester has been leaning on them, and Mavis Mangum goes cold on Tester.');
  assert.ok(Number.isInteger(r.report.turn));
  assert.equal(r.once, 1, 'one report a memory');
  assert.deepEqual(r.mavis.mems, [['crossed', 'Tyler Rasberry says Tester has been leaning on them.', true]]);
  assert.deepEqual([r.mavis.tracks.w, r.mavis.tracks.t], [-15, -23], 'Mavis (start -5, trust -10; guarded: losses x1.3): liking -10, trust -13');
  assert.deepEqual(r.hollis, [['npc_wade'], true], 'Hollis tells Wade, through a tie nobody knows');
  assert.equal(r.wade.length, 1);
  assert.equal(r.wade[0].hidden, true, 'Wade\'s memory is hidden ("Hasn\'t said why")');
  assert.equal(r.hiddenDue, false, 'and no due event names it');
  assert.deepEqual(r.marcusWhy, { nobody: true });
  assert.deepEqual(r.marcus, ['grudge', 'nobody', 'gossip'], 'nobody to tell: a gossip grudge');
  assert.equal(r.marcusHard, true, 'a hard man\'s fear stops at 39: he never reports out of fear');
  // Draw for draw: the same seeded game with a report forced and fired, and without, through ten turns.
  const play = async withReport => { const p = await h.open(); await quickStart(p, { kinds: [], seed: 4242 }); return p.evaluate(async withReport => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    M.clear();
    if (withReport) {
      S.apply({ socialEvents: [{ npcId: 'npc_tyler', event: 'threatened', d: { f: 50 }, text: 'threatened me at the desk' }] });
      const t = S.npc('npc_tyler');
      G.World.plantReport(t, G.Rel.reportWhy(t), st.time.day);
    }
    const rolls = [];
    const lines = ['I try to pick the lock on the bait shop', 'I search the counter for a key', '/rest', 'I try to climb the water tower', 'I look for tracks by the ramp', '/rest', 'I try to pick the lock again', 'I search the dock', 'I try to read the old sign', '/rest'];
    for (const line of lines) { await G.Pipeline.submit(line); const e = st.log[st.log.length - 1]; rolls.push(e.roll ? e.roll.d20 : null); }
    return { rolls, calls: st.meta.rngCalls, clocks: st.factions.map(f => [f.activeClock, (f.clocks[f.activeClock] || {}).filled]), day: st.time.day, report: st.seeds.filter(x => x.origin && x.origin.kind === 'report').map(x => x.fired), mavis: S.npc('npc_mavis').memories.length };
  }, withReport); };
  const a = await play(true);
  const b = await play(false);
  assert.deepEqual(a.report, [true], 'the report was planted and fired');
  assert.ok(a.mavis > b.mavis, 'Mavis took it');
  assert.deepEqual(a.rolls, b.rolls, 'the same dice');
  assert.equal(a.calls, b.calls, 'the same number of draws from the shared stream');
  assert.deepEqual(a.clocks, b.clocks, 'the same clocks');
  assert.equal(a.day, b.day);
});

s.test('an adult afraid of the player does a small thing with no roll and the die is still drawn', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    __put('loc_motor_court', ['npc_tyler', 'npc_kaylee', 'npc_wade'], st.time.day, 'night');
    S.apply({ relSet: [{ npcId: 'npc_tyler', f: 50 }, { npcId: 'npc_kaylee', f: 50 }, { npcId: 'npc_wade', f: 60 }] });
    out.fear = ['npc_tyler', 'npc_kaylee', 'npc_wade'].map(id => R.tracksOf(S.npc(id)).f);
    const ask = async (id, difficulty, die) => {
      M.queue('parse', { actionType: 'persuade', summary: 'Asks for the thumb drive', targets: [id], needsRoll: true, stat: 'charm', difficulty, timeCost: 'instant' });
      const c0 = st.meta.rngCalls;
      if (die) G.Pipeline.forceNextRoll(die);
      await G.Pipeline.submit('Hand me the thumb drive.');
      const e = st.log[st.log.length - 1];
      return { roll: e.roll ? e.roll.d20 : null, draws: st.meta.rngCalls - c0, forced: G.Pipeline.hooks.nextD20, packet: (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '' };
    };
    out.tyler = await ask('npc_tyler', 'normal');
    out.forced = await ask('npc_tyler', 'easy', 3);
    out.hardAsk = await ask('npc_tyler', 'hard', 15);
    out.kaylee = await ask('npc_kaylee', 'normal', 15);
    out.wade = await ask('npc_wade', 'normal', 15);
    out.complies = [R.complies(S.npc('npc_tyler'), { actionType: 'intimidate', difficulty: 'normal' }), R.complies(S.npc('npc_tyler'), { actionType: 'talk', difficulty: 'easy', romantic: true })];
    return out;
  });
  assert.deepEqual(r.fear, [50, 50, 39], 'Wade is hard: his fear stops at 39');
  assert.equal(r.tyler.roll, null, 'no roll');
  assert.ok(r.tyler.draws >= 1, 'the d20 is still drawn from the stream: ' + r.tyler.draws);
  assert.match(r.tyler.packet, /AFRAID \(no roll\): Tyler Rasberry is afraid of Tester/);
  assert.equal(r.forced.roll, null, 'a forced die is used up, not rolled');
  assert.equal(r.forced.forced, null, 'the forced die was taken');
  assert.equal(r.hardAsk.roll, 15, 'a hard ask still rolls');
  assert.equal(r.kaylee.roll, 15, 'never someone under 18');
  assert.equal(r.wade.roll, 15, 'never someone hard');
  assert.deepEqual(r.complies, [false, false], 'only talk or persuade, never a romantic ask');
});

s.test('missed and kept meetings, missed and paid debts are broken and kept words with trust; a missed meeting costs half', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, R = G.Rel, st = G.state;
    const out = {};
    const tracks = id => { const c = R.tracksOf(S.npc(id)); return [c.w, c.t]; };
    // Two meetings agreed for tonight: one kept, one missed.
    const day = st.time.day;
    S.apply({ setTime: { day, phase: 'afternoon' } });
    const j0 = tracks('npc_jodie');
    const d0 = tracks('npc_dewayne');
    S.apply({ newSeeds: [{ id: 'seed_meet_jodie', cause: 'agreed', effect: 'Jodie Strayhorn meets Tester at the Low Water tonight.', trigger: { type: 'location', value: 'loc_low_water' }, hidden: true }] }, { source: 'model' });
    S.apply({ beginTurn: true });
    S.apply({ newSeeds: [{ id: 'seed_meet_dewayne', cause: 'agreed', effect: 'Dewayne Mangum meets Tester at Purvis Landing this evening.', trigger: { type: 'location', value: 'loc_purvis_landing' }, hidden: true }] }, { source: 'model' });
    out.appts = st.seeds.filter(x => x.appointment).map(x => [x.appointment.npcId, x.appointment.phases]);
    // The player goes to the landing for the evening and keeps Dewayne's; Jodie waits at the Low Water tonight and nobody comes.
    S.apply({ setTime: { day, phase: 'evening' } });
    S.apply({ playerLocationId: 'loc_purvis_landing' });
    W.appointmentsHere({ locationId: 'loc_purvis_landing', day, phase: 'evening' });
    W.tick({ to: { day: day + 1, phase: 'morning' }, from: { day, phase: 'night' } });
    const j = S.npc('npc_jodie');
    const dw = S.npc('npc_dewayne');
    out.missed = { mem: j.memories.filter(m => m.event === 'broke_word').map(m => [m.weight, m.d.w, m.d.t]), moved: [tracks('npc_jodie')[0] - j0[0], tracks('npc_jodie')[1] - j0[1]] };
    out.kept = { mem: dw.memories.filter(m => m.event === 'kept_word').map(m => [m.weight, m.text]), moved: [tracks('npc_dewayne')[0] - d0[0], tracks('npc_dewayne')[1] - d0[1]] };
    // A debt missed and a debt paid (the loose ends' own obligations).
    const debt = G.data.LOOSE_ENDS.debt.obligation;
    const ob = (id, due) => ({ op: 'addObligation', kind: 'debt', npcId: id, text: 'Pay up.', amount: 400, dueDay: due, onMiss: W.fillEffects(debt.onMiss.filter(e => e.op === 'socialEvent'), { npc: id }), onMet: W.fillEffects(debt.onMet, { npc: id }) });
    const c0 = tracks('npc_carter');
    const h0 = tracks('npc_hollis');
    S.apply({ effects: [ob('npc_carter', st.time.day), ob('npc_hollis', st.time.day + 3)] });
    S.tickObligations(st.time.day + 1);
    const carter = S.npc('npc_carter');
    out.debtMissed = { mem: carter.memories.filter(m => m.event === 'broke_word').map(m => [m.weight, m.act, m.d.w]), moved: [tracks('npc_carter')[0] - c0[0], tracks('npc_carter')[1] - c0[1]] };
    const hob = S.obligations('open').find(o => o.npcId === 'npc_hollis');
    S.apply({ effects: [{ op: 'settleObligation', id: hob.id, status: 'met' }] });
    out.debtPaid = { mem: S.npc('npc_hollis').memories.filter(m => m.event === 'paid_back').map(m => [m.weight, m.d.w]), moved: [tracks('npc_hollis')[0] - h0[0], tracks('npc_hollis')[1] - h0[1]] };
    // Paid late: the broken word is settled by the payment in full.
    const cob = S.obligations().find(o => o.npcId === 'npc_carter');
    const c1 = tracks('npc_carter');
    S.apply({ effects: [{ op: 'settleObligation', id: cob.id, status: 'met' }] });
    out.late = { settled: carter.memories.filter(m => m.event === 'broke_word').map(m => (m.settled || []).map(x => x.by)), mem: carter.memories.filter(m => m.event === 'paid_back').map(m => m.text), moved: tracks('npc_carter')[0] - c1[0] };
    return out;
  });
  assert.deepEqual(r.appts.map(x => x[0]), ['npc_jodie', 'npc_dewayne']);
  assert.deepEqual(r.missed.mem, [[1, -4, -9]], 'a missed meeting: a broken word at half, weight 1 (Jodie is guarded: trust losses x1.15)');
  assert.deepEqual(r.missed.moved, [-4, -9]);
  assert.equal(r.kept.mem.length, 1, 'a kept meeting is a kept word: ' + JSON.stringify(r.kept.mem));
  assert.equal(r.kept.mem[0][0], 2);
  assert.equal(r.kept.moved[0], 5);
  assert.equal(r.kept.moved[1], 12, 'and trust +15 (Dewayne is careful: trust gains x0.8)');
  assert.deepEqual(r.debtMissed.mem, [[3, 'own', -15]], 'a missed debt: today\'s -15 as a broken word, what they did to the player (own)');
  assert.equal(r.debtMissed.moved[0], -15);
  assert.ok(r.debtMissed.moved[1] < 0, 'with trust');
  assert.deepEqual(r.debtPaid.mem, [[2, 10]], 'a debt paid: today\'s +10 as paid_back');
  assert.deepEqual(r.debtPaid.moved, [10, 12], 'and trust +10 (Hollis is sociable: trust gains x1.2)');
  assert.deepEqual(r.late.settled, [['paid_back']], 'paying it late settles the broken word');
  assert.deepEqual(r.late.mem, ['Tester paid the four hundred in full, but late.'], 'the late words');
  assert.equal(r.late.moved, 25, 'the -15 made good and +10');
});

s.test('the town\'s standing moves on what happened in front of two people or more; three people at fear 20 make the player feared', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    const rep = () => st.player.reputation.town || 0;
    const r0 = rep();
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_royce', event: 'threatened', text: 'threatened me', witnesses: [] }] });
    out.alone = rep() - r0;
    S.apply({ socialEvents: [{ npcId: 'npc_dewayne', event: 'threatened', text: 'threatened me', witnesses: ['npc_royce', 'npc_jodie'] }] });
    out.two = rep() - r0;
    S.apply({ socialEvents: [{ npcId: 'npc_burl', event: 'stole_from', text: 'stole from me', public: true }] });
    out.news = rep() - r0;
    S.apply({ socialEvents: [{ npcId: 'npc_june', event: 'stole_from', text: 'stole from me', public: true }] });
    out.capped = rep() - r0;
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_lorna', event: 'rescued', text: 'stepped in for me', public: true }] });
    out.nextTurn = rep() - r0;
    out.tier0 = S.reputationTier('town');
    // Royce and Dewayne were threatened: two afraid (fear 25 each).
    out.two20 = [S.reputationTier('town'), ['npc_royce', 'npc_dewayne'].map(id => R.tracksOf(S.npc(id)).f)];
    S.apply({ relSet: { npcId: 'npc_shayla', f: 20 } });
    out.three20 = S.reputationTier('town');
    out.faction = S.reputationTier('fac_police');
    return out;
  });
  assert.equal(r.alone, 0, 'nobody saw it: the town does not hear');
  assert.equal(r.two, -2, 'two watching: the threat\'s -2');
  assert.equal(r.news, -5, 'news: the theft\'s -5, held to 5 a turn');
  assert.equal(r.capped, -5, 'still held');
  assert.equal(r.nextTurn, 0, 'a new turn: a rescue in public, +5');
  assert.notEqual(r.tier0, 'feared');
  assert.notEqual(r.two20[0], 'feared', 'two afraid is not enough');
  assert.ok(r.two20[1].every(f => f >= 20), 'Royce and Dewayne at fear 20 or more: ' + r.two20[1]);
  assert.equal(r.three20, 'feared', 'three people in town at fear 20');
  assert.notEqual(r.faction, 'feared', 'feared is the town\'s tier');
});

s.test('a shop that is against the player won\'t sell for three days, then charges a quarter more; a bed, gas or food is never refused two nights', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = { days: [] };
    S.apply({ relSet: { npcId: 'npc_royce', w: -40 } });
    const d0 = st.time.day;
    const buy = async (what, input) => {
      M.queue('parse', { actionType: 'buy', summary: `Buys ${what}`, targets: ['npc_royce'], needsRoll: false, timeCost: 'instant' });
      M.queue('bookkeep', { goldDelta: -10, itemsGained: [what] });
      const g0 = st.player.gold;
      await G.Pipeline.submit(input);
      const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
      return { paid: g0 - st.player.gold, refused: /WON'T SELL: Royce Pittman/.test(pk), marked: /PRICE: Royce Pittman sells/.test(pk), factor: S.priceFactor() };
    };
    for (let i = 0; i < 4; i++) {
      __put('loc_pittmans', ['npc_royce'], d0 + i, 'morning');
      out.days.push({ thing: await buy('Flashlight', 'I buy a flashlight'), gas: await buy('Gas can', 'I buy a tank of gas') });
    }
    out.flag = st.flags['relPrice.npc_royce'];
    // Someone no longer against the player sells as before, and the count starts again.
    S.apply({ relSet: { npcId: 'npc_royce', w: 10 } });
    out.friendly = await buy('Flashlight', 'I buy a flashlight');
    out.cleared = st.flags['relPrice.npc_royce'];
    out.notSeller = R.wontSell(S.npc('npc_jodie'));
    return out;
  });
  const [a, b, c, d] = r.days;
  assert.deepEqual([a.thing.refused, b.thing.refused, c.thing.refused, d.thing.refused], [true, true, true, false], 'three days, then he sells');
  assert.deepEqual([a.thing.paid, b.thing.paid, c.thing.paid, d.thing.paid], [0, 0, 0, 10], 'no money for what was not sold');
  assert.equal(d.thing.marked, true, 'then at a quarter over');
  assert.equal(d.thing.factor, 1.25, 'every price with him at the counter');
  assert.deepEqual([a.gas.refused, b.gas.refused], [true, false], 'gas: refused one night at most');
  assert.equal(b.gas.marked, true);
  assert.equal(r.flag, r.flag | 0, 'the day it began');
  assert.equal(r.friendly.refused, false);
  assert.equal(r.friendly.factor, 1);
  assert.equal(r.cleared, null, 'a friendly seller starts again');
  assert.equal(r.notSeller, false, 'a waitress is no seller');
});

s.test('/fact: "Loretta owes me a favour" puts her in the player\'s debt; "Royce and I go back" means he knows them', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    S.apply({ storyPointsDelta: 3 });
    const out = {};
    const before = id => { const c = R.tracksOf(S.npc(id)); return [c.w, c.t, c.f, c.k, c.s, c.owed]; };
    const l0 = before('npc_loretta');
    const ro0 = before('npc_royce');
    await G.Pipeline.submit('/fact Loretta Gaddis owes me a favour');
    await G.Pipeline.submit('/fact Royce Pittman and I go back');
    await G.Pipeline.submit('/fact Dewayne Mangum trusts me and likes me');
    const lo = S.npc('npc_loretta');
    out.loretta = [l0, before('npc_loretta'), lo.memories.map(m => [m.event, m.d, m.weight, m.text.slice(0, 22)]), R.stance(lo).tags];
    out.royce = [ro0, before('npc_royce'), S.npc('npc_royce').rel.start.k];
    const dw = S.npc('npc_dewayne');
    out.dewayne = [before('npc_dewayne'), dw.rel.start.t, dw.rel.start.w];
    out.grudge = G.Rel.grudgeFit(lo.memories[0]);
    return out;
  });
  const [l0, l1, lmem, ltags] = r.loretta;
  assert.deepEqual(l1.slice(0, 5), l0.slice(0, 5), 'no liking, trust, fear, knowing or spark from it');
  assert.equal(l1[5], 1, 'she owes the player one');
  assert.ok(ltags.includes('owes you'));
  assert.deepEqual(lmem, [['noted', null, 3, 'Fact (a story point): ']], 'the fact itself moves nothing');
  assert.equal(r.grudge, false, 'and never grows a grudge');
  const [ro0, ro1, rk] = r.royce;
  assert.ok(ro1[3] >= 30 && ro0[3] < 30, 'Royce knows the player: ' + ro1[3]);
  assert.equal(rk, 30, 'from the start: it was true before the player came');
  assert.deepEqual(ro1.slice(0, 3), ro0.slice(0, 3));
  const [dw] = r.dewayne;
  assert.equal(dw[0], 10, 'likes me: liking +10 (to 40 at most)');
  assert.equal(dw[1], 10, 'trusts me: trust +15 (to 40 at most), from -5');
  assert.equal(dw[2], 0, 'never fear');
});

s.test('the engine sees the rest: a theft, being caught at it, a cheat at cards, the card seats, a rescue (never from danger the player made), the ask log and time together', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    // A failed theft from Hollis with only Nikki watching: stole_from at half for him, caught_you_at for her; both in the ask log.
    __put('loc_byrds_pawn', ['npc_hollis', 'npc_nikki'], st.time.day, 'morning');
    out.here = S.npcsAt('loc_byrds_pawn').map(n => n.id);
    M.queue('parse', { actionType: 'steal', summary: 'Lifts Hollis\'s wallet', targets: ['npc_hollis'], needsRoll: true, stat: 'stealth', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'failure';
    await G.Pipeline.submit('I lift Hollis\'s wallet');
    const ho = S.npc('npc_hollis');
    const ni = S.npc('npc_nikki');
    out.theft = { hollis: ho.memories.map(m => [m.event, m.d && m.d.w, m.text]), nikki: ni.memories.map(m => [m.event, m.text]), asks: [ho.rel.asks.map(a => [a.act, a.ok]), ni.rel.asks.map(a => [a.act, a.ok])] };
    // A clean theft nobody saw: only the ask log.
    S.apply({ setTime: { day: st.time.day, phase: 'afternoon' } });
    __put('loc_byrds_pawn', ['npc_hollis'], null);
    const ask0 = ho.rel.asks.length;
    const m0 = ho.memories.length;
    M.queue('parse', { actionType: 'steal', summary: 'Lifts a ring', targets: ['npc_hollis'], needsRoll: true, stat: 'stealth', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I lift Hollis\'s ring');
    out.clean = [ho.memories.length - m0, ho.rel.asks.length - ask0, ho.rel.asks[ho.rel.asks.length - 1].ok];
    // A rescue: someone in danger here (a danger seed's flag), a successful action aimed at them.
    S.apply({ setTime: { day: st.time.day, phase: 'evening' } });
    __put('loc_purvis_landing', ['npc_colt', 'npc_trent', 'npc_lorna'], null);
    G.World.markDanger({ id: 'seed_landing_short_count', danger: true, effect: G.data.TOWN_DATA.seeds.find(x => x.id === 'seed_landing_short_count').effect });
    out.flag = st.flags['danger.npc_trent'];
    const t0 = R.tracksOf(S.npc('npc_trent'));
    M.queue('parse', { actionType: 'persuade', summary: 'Talks Colt off Trent', targets: ['npc_trent', 'npc_colt'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I get between them and talk Colt down');
    const tr = S.npc('npc_trent');
    const t1 = R.tracksOf(tr);
    out.rescue = { mem: tr.memories.filter(m => m.event === 'rescued').map(m => m.text), moved: [t1.w - t0.w, t1.owed], lorna: S.npc('npc_lorna').memories.filter(m => m.witness).map(m => m.event), used: st.flags['danger.npc_trent'] };
    // Danger the player made: they had gone for Colt here first; stepping in then is no rescue.
    S.apply({ setTime: { day: st.time.day + 1, phase: 'evening' } });
    __put('loc_purvis_landing', ['npc_colt', 'npc_trent', 'npc_lorna'], null);
    M.queue('parse', { actionType: 'attack', summary: 'Shoves Colt', targets: ['npc_colt'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'failure';
    await G.Pipeline.submit('I shove Colt');
    G.World.markDanger({ id: 'seed_landing_short_count', danger: true, effect: G.data.TOWN_DATA.seeds.find(x => x.id === 'seed_landing_short_count').effect });
    M.queue('parse', { actionType: 'persuade', summary: 'Talks Colt off Trent', targets: ['npc_trent'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I talk Colt off him');
    out.made = tr.memories.filter(m => m.event === 'rescued').length;
    // Time together: Say to someone, once a day; knows-you a little a turn.
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning' } });
    __put('loc_pittmans', ['npc_royce'], null);
    G.UI.setMode('say'); G.UI.setAddressee('npc_royce');
    const r0 = R.tracksOf(S.npc('npc_royce'));
    for (const line of ['Morning.', 'Slow day?', 'Weather turned.', 'Coffee fresh?']) { M.queue('parse', { actionType: 'talk', summary: 'Small talk', targets: ['npc_royce'], needsRoll: false, timeCost: 'instant' }); await G.Pipeline.submit(line); }
    G.UI.setMode('do');
    const r1 = R.tracksOf(S.npc('npc_royce'));
    // The phase ends: it was spent with him.
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    const r2 = R.tracksOf(S.npc('npc_royce'));
    out.together = [r1.w - r0.w, r1.k - r0.k, r2.w - r1.w, r2.k - r1.k, S.npc('npc_royce').rel.days.spent_time];
    // Cheating caught at the card table: cheated with today's -20, trust from the row.
    out.cheatRow = [R.EVENTS.cheated.t];
    S.apply({ beginTurn: true });
    const cu = S.npc('npc_curtis');
    const cw0 = R.tracksOf(cu);
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_curtis', event: 'cheated', text: 'caught Tester cheating at cards in the Low Water', weight: 3, d: { w: -20 } }] });
    const cw1 = R.tracksOf(cu);
    out.cheat = [cw1.w - cw0.w, cw1.t - cw0.t, cu.memories.filter(m => m.event === 'cheated').map(m => m.weight)];
    // The card seats: everyday, -2 and +1; the line itself is noted.
    const lw0 = S.npc('npc_lyman').attitude;
    S.apply({ newMemories: [{ npcId: 'npc_lyman', text: 'lost $20 to Tester at cards at the Low Water', weight: 1, event: 'noted' }], effects: [{ op: 'socialEvent', npcId: 'npc_lyman', event: 'card_loss', text: 'lost $20 to Tester at cards', d: { w: -2 } }] });
    const ly = S.npc('npc_lyman');
    out.seat = [ly.attitude - lw0, ly.memories.map(m => [m.event, m.d]), ly.rel.everyday.w];
    return out;
  });
  assert.ok(r.here.includes('npc_hollis') && r.here.includes('npc_nikki'));
  assert.deepEqual(r.theft.hollis, [['stole_from', -10, 'Tester tried to steal from me']], 'a failed theft with him there: stole_from at half');
  assert.deepEqual(r.theft.nikki, [['caught_you_at', 'caught Tester trying to steal from Hollis Byrd at Byrd\'s Pawn']], 'the one other person who saw it caught the player at it');
  assert.deepEqual(r.theft.asks, [[['steal', false]], [['steal', false]]], 'both in the ask log');
  assert.deepEqual(r.clean, [0, 1, true], 'a clean theft nobody saw is only in his ask log');
  assert.match(String(r.flag), /\|loc_purvis_landing\|npc_colt\|/, 'Trent is in danger, Colt doing it: ' + r.flag);
  assert.deepEqual(r.rescue.mem, ['Tester stepped in for me when Colt Purvis had me at Purvis Landing']);
  assert.equal(r.rescue.moved[0], 25, 'liking +25');
  assert.equal(r.rescue.moved[1], 2, 'he owes the player for it');
  assert.ok(r.rescue.lorna.includes('rescued'), 'Lorna saw it');
  assert.equal(r.rescue.used, null, 'the danger is used up');
  assert.equal(r.made, 1, 'no rescue from a fight the player started: ' + r.made);
  assert.deepEqual(r.together, [0, 3, 2, 4, 1], 'knows +1 a turn aimed at them (3 a day at most); the phase spent with him is time together as it ends (+2, knows +4), once a day');
  assert.deepEqual(r.cheat.slice(0, 1), [-20], 'a cheat caught: -20');
  assert.ok(r.cheat[1] <= -30, 'trust -30 from the row: ' + r.cheat[1]);
  assert.deepEqual(r.cheat[2], [3]);
  assert.equal(r.seat[0], -2, 'a seat that lost to the player: -2, everyday');
  assert.deepEqual(r.seat[1], [['noted', null]], 'the line itself moves nothing');
  assert.equal(r.seat[2], -2);
});

s.run();
