'use strict';
/* Milestone 5: a scripted playtest of 30+ turns against the mock provider,
   with a fixed seed, plus the pacing reports (faction clocks over 200 seeded
   runs, attitude and grudge timing). Every id and name comes from Game.data /
   Game.state, so the script survives a change of town; the seed makes it
   repeat exactly.
   What it covers, in order: the arrival; talking to three different people; a
   chain of moves through five or more places; a purchase; a failed roll with a
   complication (and the refused retry); a fight that costs HP; two insults; a
   favour earned by /fact and persuasion that becomes a favour seed and fires;
   /rest, /skip, /look, /zoom, /fact and /undo; faction clocks left to run (one
   faction's dice forced to 6) until at least one completes; a chronicle entry
   after turn 10 and a second after turn 20.
   After every turn: no page errors (the harness), no rejected State.apply
   diffs, the log never over 30 entries, every narrator packet lists only the
   people present and carries no secret, goal or unfired seed, and no
   narration in the feed has a banned phrase. The final state summary and the
   pacing numbers are printed to the test output.
   Run with: node tests/run.cjs playtest */
const assert = require('assert/strict');
const { suite, quickStart, sendText, stateJson, findScene, place, LAPTOP } = require('./helpers.cjs');

const s = suite('playtest');
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const SEED = 20261028;

/* In the page: watch every State.apply result and every narrator packet. */
function installProbes() {
  const G = Game;
  window.__rejected = [];
  window.__packets = [];
  const apply = G.State.apply;
  G.State.apply = function (diff, opts) {
    const r = apply.call(this, diff, opts);
    if (r.rejected.length) window.__rejected.push({ turn: G.state ? G.state.meta.turn : null, source: (opts && opts.source) || 'engine', rejected: r.rejected, diff: JSON.stringify(diff).slice(0, 400) });
    return r;
  };
  const narrate = G.Api.Mock.narrate;
  G.Api.Mock.narrate = function (packet) {
    const st = G.state;
    const p = String((packet && packet.text) || '');
    const problems = [];
    const get = label => (p.split('\n').find(l => l.startsWith(label + ':')) || '').slice(label.length + 1).trim();
    const presentIds = G.State.npcsAt(st.player.locationId).map(n => n.id);
    const presentLine = get('PRESENT');
    for (const n of st.npcs) {
      const listed = presentLine.includes(n.name + ' (');
      if (listed && !presentIds.includes(n.id)) problems.push('listed but not present: ' + n.id);
      if (!listed && presentIds.includes(n.id)) problems.push('present but not listed: ' + n.id);
      if (n.secret && n.secret.length > 20 && p.includes(n.secret)) problems.push('secret of ' + n.id);
      if (n.goal && n.goal.length > 20 && p.includes(n.goal)) problems.push('goal of ' + n.id);
    }
    for (const sd of st.seeds) if (!sd.fired && p.includes(sd.effect)) problems.push('unfired seed ' + sd.id);
    for (const f of st.factions) {
      if (f.goal && p.includes(f.goal)) problems.push('faction goal ' + f.id);
      for (const c of f.clocks) if (c.label.length > 15 && p.includes(c.label)) problems.push('clock label ' + c.label);
    }
    if (/\b(TRUE|FALSE)\b/.test(p)) problems.push('rumour truth');
    // A place's event is told in that place, and not while walking out of it.
    const due = get('DUE EVENT');
    for (const sd of st.seeds) {
      if (!sd.fired || !sd.trigger || sd.trigger.type !== 'location' || !due.includes(sd.effect)) continue;
      if (sd.trigger.value !== st.player.locationId || get('DESTINATION')) problems.push('place event told elsewhere: ' + sd.id);
    }
    // A rumour already heard is never offered again.
    const rum = get('RUMOUR');
    for (const r of st.rumours) if (r.heard && rum.includes(r.text)) problems.push('heard rumour offered again: ' + r.id);
    window.__packets.push({ turn: st.meta.turn, problems, presentIds, chars: p.length, text: p });
    return narrate.apply(this, arguments);
  };
  G.Api.Mock.delay = 0;
}

s.test(`a 30+ turn scripted playtest (seed ${SEED}): every system once, no rejected diffs, clean packets, clean narration`, async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: SEED, kinds: ['debt', 'lost', 'promise'] });
  await page.evaluate(installProbes);
  const opening = await page.evaluate(() => Game.state.log[0].narration);
  assert.ok(opening.length > 80, 'arrival narration');

  const covered = new Set();
  const transcript = [];
  const toldRumours = new Set();
  const checked = { turns: 0, packets: 0 };
  const expectedRejections = []; // predicates for rejections a step means to cause; this script causes none
  const time = () => page.evaluate(() => ({ day: Game.state.time.day, phase: Game.state.time.phase, turn: Game.state.meta.turn }));
  const nextPhase = async () => PHASES[(PHASES.indexOf((await time()).phase) + 1) % 4];
  /* One player turn (or command), then the invariants. */
  async function turn(text, tag) {
    const before = await page.evaluate(() => ({ packets: window.__packets.length, turn: Game.state.meta.turn }));
    await sendText(page, text);
    const r = await page.evaluate(b => {
      const G = Game;
      const st = G.state;
      const feed = [...document.querySelectorAll('#feed .f-narr')].map(e => e.innerText).join('\n').toLowerCase();
      return {
        turn: st.meta.turn, log: st.log.length, packets: window.__packets.slice(b.packets),
        banned: G.Style.BANNED.filter(x => feed.includes(x)).concat(/what do you do/.test(feed) ? ['what do you do'] : []),
        rejected: window.__rejected.splice(0), ignored: G.State.debugLog.filter(x => x.kind === 'rejected' && /^ignored/.test(x.reason || '') && x.turn === st.meta.turn).length,
        said: st.meta.turn !== b.turn && st.log.length ? st.log[st.log.length - 1].narration : null,
        told: st.meta.turn !== b.turn && st.log.length ? st.rumours.filter(x => st.log[st.log.length - 1].narration.includes(x.text)).map(x => x.id) : []
      };
    }, before);
    // Nobody tells the player the same rumour twice.
    for (const id of r.told) { assert.ok(!toldRumours.has(id), `rumour ${id} told again after "${text}"`); toldRumours.add(id); }
    transcript.push(`> ${text}` + (r.said ? `\n    ${r.said.replace(/\n+/g, ' ')}` : ''));
    if (tag) covered.add(tag);
    checked.turns += 1;
    assert.ok(r.log <= 30, `log has ${r.log} entries after "${text}"`);
    for (const p of r.packets) { checked.packets += 1; assert.deepEqual(p.problems, [], `narrator packet after "${text}"`); }
    assert.deepEqual(r.banned, [], `banned phrase in the feed after "${text}"`);
    const unexpected = r.rejected.filter(x => !expectedRejections.some(e => e(x)));
    assert.deepEqual(unexpected, [], `rejected diffs after "${text}"`);
    assert.equal(r.ignored, 0, `the engine ignored part of a bookkeeper diff after "${text}"`);
    return r;
  }
  const last = () => page.evaluate(() => ({ log: Game.state.log[Game.state.log.length - 1], t: Game.Pipeline.lastTurn, loc: Game.state.player.locationId, hp: Game.state.player.hp }));

  // ----- the cast, from the data -----
  const plan = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const touched = new Set(st.factions.flatMap(f => f.clocks.flatMap(c => c.onComplete.effects.filter(e => e.npcId).map(e => e.npcId))));
    const loose = st.player.looseEnds.map(le => le.npcId);
    const risky = /\b(look|examine|rest|sleep|wait|go|walk|head|run|enter|attack|hit|fight|insult|mock|buy|try|my|persuade)\b/i;
    const watchy = n => (n.tags || []).some(t => t === 'watch' || t === 'police') || /\b(watch|police|deputy|sheriff|officer|constable|trooper|cop|chief)/i.test(n.role);
    const safe = n => n.status === 'free' && !touched.has(n.id) && !risky.test(n.name);
    const where = n => {
      for (const ph of ['morning', 'afternoon', 'evening', 'night']) for (const l of st.locations) if (!l.closed && (l.npcIdsBySchedule[ph] || []).includes(n.id)) return { loc: l.id, locName: l.name, phase: ph };
      return null;
    };
    const pick = n => (n ? Object.assign({ id: n.id, name: n.name, attitude: n.attitude }, where(n)) : null);
    // Favour: the warmest loose-end person the clocks leave alone (they already remember the player).
    const favour = st.npcs.filter(n => loose.includes(n.id) && safe(n) && where(n) && n.memories.some(m => m.weight >= 2)).sort((a, b) => b.attitude - a.attitude)[0];
    // Insults: someone ordinary, neither a loose end nor touched by a clock.
    const insult = st.npcs.find(n => safe(n) && !loose.includes(n.id) && n.attitude > -15 && n.attitude <= 20 && where(n) && n.id !== (favour && favour.id));
    // The fight: someone else ordinary, not the law.
    const fight = st.npcs.find(n => safe(n) && !watchy(n) && !loose.includes(n.id) && where(n) && n !== insult && n.id !== (favour && favour.id));
    // A faction whose clocks touch none of them: its dice are forced later.
    const ids = [favour, insult, fight].filter(Boolean).map(n => n.id);
    const fac = st.factions.find(f => !f.clocks.some(c => c.onComplete.effects.some(e => ids.includes(e.npcId))));
    // Something cheap to buy that its name alone identifies.
    const own = g => G.Town.goodsFor('i buy ' + g.name.toLowerCase()) === g;
    const good = G.data.TABLES.items.goods.filter(own).sort((a, b) => a.price - b.price)[0];
    return { favour: pick(favour), insult: pick(insult), fight: pick(fight), fac: fac && fac.id, good, start: st.player.locationId };
  });
  assert.ok(plan.favour && plan.insult && plan.fight && plan.fac && plan.good, JSON.stringify(plan));

  // ----- 1. the first scene: look, talk, buy -----
  await turn('I look around', 'look-action');
  const here0 = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => ({ id: n.id, name: n.name })));
  const talked = new Set();
  if (here0.length) {
    await turn(`I ask ${here0[0].name} what work there is in town`, 'talk');
    talked.add(here0[0].id);
  }
  await page.evaluate(() => { if (Game.state.player.gold < 40) Game.State.apply({ goldDelta: 40 - Game.state.player.gold }); });
  const gold0 = await page.evaluate(() => Game.state.player.gold);
  await turn(`I buy ${plan.good.name.toLowerCase()}`, 'buy');
  const bought = await page.evaluate(() => ({ gold: Game.state.player.gold, inv: Game.state.player.inventory.map(i => i.name), roll: Game.Pipeline.lastTurn.roll }));
  assert.equal(bought.roll, null, 'buying never rolls');
  assert.ok(bought.gold < gold0 && bought.inv.includes(plan.good.name), 'paid and carried');

  // ----- 2. a chain of moves through five places, talking to people on the way -----
  const route = await page.evaluate(() => {
    // A walk of six places, each an exit of the last, none twice (depth-first, first found).
    const G = Game;
    const ok = l => l && !l.closed && !/morning|afternoon|evening|night/i.test(l.name);
    const walk = (path, want) => {
      if (path.length === want) return path;
      for (const id of G.State.loc(path[path.length - 1]).exits) {
        if (path.includes(id) || !ok(G.State.loc(id))) continue;
        const found = walk(path.concat(id), want);
        if (found) return found;
      }
      return null;
    };
    const path = walk([G.state.player.locationId], 7) || walk([G.state.player.locationId], 6) || [];
    return path.slice(1).map(id => ({ id, name: G.State.loc(id).name }));
  });
  assert.ok(route.length >= 5, 'five places in a row: ' + JSON.stringify(route));
  const visited = new Set([plan.start]);
  for (let i = 0; i < route.length; i++) {
    const verb = ['I walk to', 'I head to', 'I make my way to', 'I go to', 'I head over to', 'I walk to'][i % 6];
    await turn(`${verb} ${route[i].name}`, 'move');
    const t = await last();
    assert.equal(t.loc, route[i].id, `arrived at ${route[i].name}`);
    // Nobody absent is mentioned unless named (milestone 5 mock fix).
    assert.doesNotMatch(t.log.narration, / is not here\./, `move narration names nobody absent: ${t.log.narration}`);
    visited.add(t.loc);
    const here = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => ({ id: n.id, name: n.name })));
    const someone = here.find(n => !talked.has(n.id) && n.id !== plan.fight.id && n.id !== plan.insult.id);
    if (someone && talked.size < 3) {
      await turn(`I ask ${someone.name} what they make of the bridge`, 'talk');
      const n = await last();
      assert.ok(n.t.action.targets.includes(someone.id), 'talked to the person named');
      talked.add(someone.id);
    }
  }
  assert.ok(visited.size >= 6, 'six places in all');

  // ----- 3. a failed roll with a complication, and the refused retry -----
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await turn('I try to pick the lock on the back office door', 'failed-roll');
  const fail = await last();
  assert.equal(fail.t.roll.tier, 'failure');
  assert.ok(fail.t.roll.complication && fail.log.narration.includes(fail.t.roll.complication), 'the complication is narrated');
  const lockedState = await stateJson(page);
  await sendText(page, 'I try to pick the lock on the back office door');
  assert.equal(await stateJson(page), lockedState, 'the identical retry changes nothing');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /Change something first/);

  // Turn 10 or so: the first chronicle entry.
  while ((await time()).turn < 10) await turn('I look around', 'look-action');
  const trimmed = () => page.evaluate(() => ({ chron: Game.state.chronicle.map(c => [c.fromTurn, c.toTurn]), log: Game.state.log.map(e => e.turn), turn: Game.state.meta.turn }));
  const c1 = await trimmed();
  assert.deepEqual(c1.chron, [[0, 9]], 'a chronicle entry for turns 0-9 after turn 10');
  assert.deepEqual(c1.log, Array.from({ length: c1.turn - 9 }, (_, i) => 10 + i), 'and those turns left the log');

  // ----- 4. a fight that costs HP -----
  await turn(`/skip to ${plan.fight.locName} in the ${plan.fight.phase}`, 'skip');
  assert.equal((await last()).loc, plan.fight.loc);
  const hp0 = (await last()).hp;
  const fightAtt = await page.evaluate(id => Game.State.npc(id).attitude, plan.fight.id);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await turn(`I attack ${plan.fight.name}`, 'fight');
  const f = await last();
  assert.equal(f.t.roll.tier, 'failure');
  assert.ok(f.hp < hp0 && f.hp >= hp0 - 3, `the fight cost 1-3 HP (${hp0} -> ${f.hp})`);
  assert.ok(await page.evaluate(([id, a]) => Game.State.npc(id).attitude < a, [plan.fight.id, fightAtt]), 'the person attacked thinks less of the player');

  // ----- 5. two insults -----
  await turn(`/skip to ${plan.insult.locName} in the ${plan.insult.phase}`, 'skip');
  const insultAtt = await page.evaluate(id => Game.State.npc(id).attitude, plan.insult.id);
  await turn(`I insult ${plan.insult.name}`, 'insult');
  await turn(`I insult ${plan.insult.name} again, louder`, 'insult');
  const ins = await page.evaluate(id => Game.State.npc(id), plan.insult.id);
  assert.equal(ins.attitude, insultAtt - 30, 'two insults, -15 each');
  assert.deepEqual(ins.memories.filter(m => /insulted/.test(m.text)).map(m => m.weight), [2, 3]);

  // ----- 6. a favour: a fact spent on them, then persuasion -----
  const sp = await page.evaluate(() => Game.state.player.storyPoints);
  await turn(`/fact ${plan.favour.name} owes me a favour`, 'fact');
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), sp - 1, 'a story point spent');
  assert.ok(await page.evaluate(id => Game.State.npc(id).memories.some(m => m.weight === 3 && /^Fact/.test(m.text)), plan.favour.id), 'they remember it');
  await turn(`/skip to ${plan.favour.locName} in the ${plan.favour.phase}`, 'skip');
  // A loose end's person can be off with the player somewhere else this phase (their seed brought them): they come over.
  await page.evaluate(id => { if (!Game.State.npcsAt(Game.state.player.locationId).some(n => n.id === id)) Game.State.apply({ visits: [{ npcId: id, locationId: Game.state.player.locationId }] }); }, plan.favour.id);
  for (let i = 0; i < 8; i++) {
    const att = await page.evaluate(id => Game.State.npc(id).attitude, plan.favour.id);
    if (att >= 60) break;
    await page.evaluate(() => Game.Pipeline.forceNextRoll(19));
    await turn(`I persuade ${plan.favour.name} to put in a good word for me`, 'persuade');
  }
  const warm = await page.evaluate(id => Game.State.npc(id).attitude, plan.favour.id);
  assert.ok(warm >= 60, 'warm enough for a favour: ' + warm);

  // Turn 20 or so: the second chronicle entry.
  while ((await time()).turn < 20) await turn('I look around', 'look-action');
  const c2 = await trimmed();
  assert.deepEqual(c2.chron, [[0, 9], [10, 19]], 'a second chronicle entry after turn 20');
  assert.ok(c2.log.every(t => t >= 20), 'the log keeps only turns after it');

  // The next phase change plants the favour seed.
  await turn(`/wait ${await nextPhase()}`, 'wait');
  const favourSeed = await page.evaluate(id => Game.state.seeds.find(sd => sd.origin && sd.origin.kind === 'favour' && sd.origin.npcId === id), plan.favour.id);
  assert.ok(favourSeed, 'a favour seed was planted');

  // ----- 7. /zoom, /look, and a turn taken back with /undo -----
  await turn('/zoom I climb onto the rail and look down at the water for a long time', 'zoom');
  assert.match(await page.evaluate(() => Game.Pipeline.lastTurn.packet), /\nMODE: ZOOM\nLENGTH: up to 6 sentences, under 150 words\. Stop at the first moment the player must respond\.\nVARIETY: [^\n]+$/);
  await turn('/look', 'look');
  const beforeUndo = await stateJson(page);
  await turn('I wait a while by the door', 'wait-action');
  assert.notEqual(await stateJson(page), beforeUndo);
  await turn('/undo', 'undo');
  assert.equal(await stateJson(page), beforeUndo, '/undo restored the turn exactly');
  // A night of world ticks taken back leaves nothing behind in the debug view's world events either.
  const recentBefore = await page.evaluate(() => Game.World.recent.length);
  await turn('/rest', 'rest');
  assert.ok(await page.evaluate(n => Game.World.recent.length > n || Game.World.recent.some(e => e.turn === Game.state.meta.turn), recentBefore), 'the night made world events');
  await turn('/undo', 'undo');
  assert.equal(await stateJson(page), beforeUndo);
  assert.ok(await page.evaluate(() => Game.World.recent.every(e => e.turn <= Game.state.meta.turn)), 'its world events went with it');

  // ----- 8. the clocks run: one faction's dice forced to 6, the rest natural -----
  await page.evaluate(id => Game.World.forceClockRoll(6, id), plan.fac);
  const clocksAt = () => page.evaluate(() => Game.state.factions.map(f => [f.id, f.activeClock, f.activeClock >= 0 ? f.clocks[f.activeClock].filled : 6]));
  const clock0 = await clocksAt();
  let favourTold = false;
  for (let i = 0; i < 12 && (!favourTold || (await time()).turn < 32); i++) {
    const r = await turn(i % 3 === 2 ? 'I look around' : '/rest', i % 3 === 2 ? 'look-action' : 'rest');
    if (r.packets.some(p => (p.text.split('\n').find(l => l.startsWith('DUE EVENT:')) || '').includes(favourSeed.effect))) favourTold = true;
  }
  await page.evaluate(() => Game.World.forceClockRoll(null));
  const clock1 = await clocksAt();
  const done = clock1.filter((c, i) => c[1] !== clock0[i][1]);
  assert.ok(done.length >= 1, 'at least one clock completed: ' + JSON.stringify({ clock0, clock1 }));
  assert.ok(await page.evaluate(id => Game.State.seed(id).fired, favourSeed.id), 'the favour seed fired');
  assert.ok(favourTold, 'and reached the narrator as a due event');

  // ----- the run as a whole -----
  const end = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const town = G.data.TOWN_DATA;
    return {
      turn: st.meta.turn, day: st.time.day, phase: st.time.phase, loc: G.State.loc(st.player.locationId).name,
      hp: `${st.player.hp}/${st.player.maxHp}`, cash: st.player.gold, storyPoints: st.player.storyPoints,
      inventory: st.player.inventory.map(i => i.name + (i.qty > 1 ? ' x' + i.qty : '')),
      conditions: st.player.conditions.map(c => c.name),
      reputation: st.player.reputation,
      attitudes: st.npcs.filter(n => { const t = town.npcs.find(x => x.id === n.id); return !t || t.attitude !== n.attitude; }).map(n => `${n.name} ${n.attitude} (${G.State.attitudeWord(n.attitude)})`),
      clocks: st.factions.map(f => f.activeClock < 0 ? `${f.id} all done` : `${f.id} clock ${f.activeClock + 1}/${f.clocks.length} at ${f.clocks[f.activeClock].filled}/${f.clocks[f.activeClock].segments}`),
      closed: st.locations.filter(l => l.closed).map(l => l.name),
      notFree: st.npcs.filter(n => n.status !== 'free').map(n => `${n.name} ${n.status}`),
      seedsFired: st.seeds.filter(sd => sd.fired).map(sd => sd.id),
      seedsWaiting: st.seeds.filter(sd => !sd.fired).map(sd => sd.id),
      grudges: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge').length,
      favours: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'favour').length,
      rumoursHeard: st.rumours.filter(r => r.heard).length, rumours: st.rumours.length,
      known: st.npcs.filter(n => n.knownToPlayer).length, npcs: st.npcs.length,
      chronicle: st.chronicle.map(c => `${c.fromTurn}-${c.toTurn}`), log: st.log.length, journal: st.journal.length,
      priceMultiplier: st.flags.priceMultiplier, weather: st.flags.weather,
      worldEvents: G.World.recent.filter(e => e.kind === 'complete').map(e => e.text)
    };
  });
  for (const tag of ['look-action', 'talk', 'buy', 'move', 'failed-roll', 'skip', 'fight', 'insult', 'fact', 'persuade', 'wait', 'zoom', 'look', 'undo', 'rest']) assert.ok(covered.has(tag), 'covered: ' + tag);
  assert.ok(talked.size >= 3, 'talked to three people: ' + talked.size);
  assert.ok(end.turn >= 30, '30+ turns: ' + end.turn);
  if (process.env.PLAYTEST_TRANSCRIPT) {
    // PLAYTEST_TRANSCRIPT=1 node tests/playtest.test.cjs prints the whole feed.
    console.log(`        ${opening.replace(/\n+/g, ' ')}\n        ` + transcript.join('\n').split('\n').join('\n        '));
  }
  console.log('        final state after the playtest:');
  for (const [k, v] of Object.entries(end)) console.log(`          ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  console.log(`          checked: ${checked.turns} inputs, ${checked.packets} narrator packets, ${visited.size} places visited, ${talked.size} people talked to`);
});

/* Pacing (milestone 5): reports, not new rules. The d6 clock rule is the
   spec's (a faction fills a segment on 5 or 6 at every phase change); this
   runs it 200 times from different seeds and prints the day each clock
   completes. Then it plays insults on one person through real turns and
   prints how long a grudge takes to plant, fire and reach the narrator. */
s.test('pacing report: clock completion days over 200 seeded runs of the world tick; insult-to-grudge timing in play', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const runs = await page.evaluate(() => {
    const G = Game;
    const D = G.data;
    const bg = D.BACKGROUNDS[0];
    const ch = { name: 'Sim', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'g', flaw: D.FLAWS[0], looseEnds: ['debt', 'enemy', 'secret'].map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] })) };
    G.World.forceClockRoll(null);
    const out = [];
    for (let i = 1; i <= 200; i++) {
      // pending: a silent game (no autosave, no render) driven by the real tick.
      G.State.newGame(D.TOWN_DATA, ch, { seed: 7000 + i, pending: true });
      const done = [];
      for (let ph = 0; ph < 29 * 4; ph++) {
        const was = G.state.factions.map(f => f.activeClock);
        const t = G.State.apply({ advanceTime: 'long' }).time;
        G.World.tick({ from: t.from, to: t.to, phasesPassed: 1, cause: 'sim' });
        G.state.factions.forEach((f, k) => { if (f.activeClock !== was[k]) done.push({ fac: f.id, clock: was[k] + 1, day: t.to.day }); });
      }
      out.push({ done, clocks: G.state.factions.reduce((n, f) => n + f.clocks.length, 0) });
    }
    G.State.clear();
    return out;
  });
  const stat = a => {
    const v = a.slice().sort((x, y) => x - y);
    const q = p => v[Math.min(v.length - 1, Math.floor(p * v.length))];
    return { n: v.length, mean: +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1), median: q(0.5), p10: q(0.1), p90: q(0.9), min: v[0], max: v[v.length - 1] };
  };
  const fmt = st => `mean ${st.mean}, median ${st.median}, 10-90% days ${st.p10}-${st.p90}, range ${st.min}-${st.max} (n=${st.n})`;
  const byClock = {};
  for (const r of runs) for (const d of r.done) (byClock[d.clock] = byClock[d.clock] || []).push(d.day);
  const all = runs.flatMap(r => r.done.map(d => d.day));
  const first = runs.map(r => Math.min(...r.done.map(d => d.day)));
  const hist = {};
  for (const d of all) hist[d] = (hist[d] || 0) + 1;
  console.log('        faction clocks, d6 rule (5-6 fills one of 6 segments per phase change), 200 seeded runs, days 1-29:');
  for (const k of Object.keys(byClock).sort()) console.log(`          clock ${k} of each faction completes: ${fmt(stat(byClock[k]))}`);
  console.log(`          every completion: ${fmt(stat(all))}`);
  console.log(`          first completion anywhere in town: ${fmt(stat(first))}`);
  console.log(`          completions per day: ${Object.keys(hist).sort((a, b) => a - b).map(d => `d${d}:${hist[d]}`).join(' ')}`);
  console.log(`          runs with every clock done by day 29: ${runs.filter(r => r.done.length === r.clocks).length}/200`);
  assert.equal(runs.length, 200);
  assert.ok(all.length > 0 && stat(all).mean >= 5 && stat(all).mean <= 16, 'clocks complete within the first weeks');

  // Insults to a grudge, through real turns (mock bookkeeper: -15 an insult; State.apply clamps at ±25 a turn).
  await quickStart(page, { seed: 99 });
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.World.forceClockRoll(1); });
  const touched = await page.evaluate(() => Game.state.factions.flatMap(f => f.clocks.flatMap(c => c.onComplete.effects.filter(e => e.npcId).map(e => e.npcId))));
  const sc = await findScene(page, { minAtt: -15, maxAtt: 20, watchy: false });
  const x = sc.npcs.find(n => !touched.includes(n.id)) || sc.npcs[0];
  await place(page, sc.loc.id, sc.phase);
  const att = () => page.evaluate(id => Game.State.npc(id).attitude, x.id);
  const timeline = [];
  let insults = 0;
  while ((await att()) > -60 && insults < 8) {
    await sendText(page, `I insult ${x.name}`);
    insults++;
    timeline.push(await att());
  }
  const cold = timeline.findIndex(a => a <= -25) + 1;
  const plantedDay = await page.evaluate(() => Game.state.time.day);
  await sendText(page, '/wait ' + PHASES[(PHASES.indexOf(await page.evaluate(() => Game.state.time.phase)) + 1) % 4]);
  const g = await page.evaluate(id => Game.state.seeds.find(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === id), x.id);
  assert.ok(g, 'a grudge seed');
  let told = null;
  for (let i = 0; i < 8 && !told; i++) {
    await sendText(page, (await page.evaluate(() => Game.state.time.day)) < g.trigger.value ? '/rest' : 'I look around');
    const due = await page.evaluate(() => { const c = Game.Api.Mock.calls.filter(m => m.method === 'narrate').pop(); return (c.text.split('\n').find(l => l.startsWith('DUE EVENT:')) || ''); });
    if (due.includes(g.effect)) told = await page.evaluate(() => Game.state.time.day);
  }
  assert.ok(told, 'the grudge reached the narrator');
  const towns = await page.evaluate(() => Game.data.TOWN_DATA.npcs.map(n => n.attitude));
  const need = (a, to) => Math.max(0, Math.ceil((a - to) / 15));
  console.log(`        attitude: ${x.name} from ${x.attitude}: ${timeline.join(' -> ')} after ${insults} insults (cold at ${cold}, -60 at ${insults}); grudge planted on day ${plantedDay} at the next phase change, due day ${g.trigger.value}, narrated day ${told}`);
  console.log(`          town starting attitudes ${Math.min(...towns)} to ${Math.max(...towns)}: ${Math.min(...towns.map(a => need(a, -25)))}-${Math.max(...towns.map(a => need(a, -25)))} insults to cold, ${Math.min(...towns.map(a => need(a, -60)))}-${Math.max(...towns.map(a => need(a, -60)))} to a grudge (mock, -15 each); with the bookkeeper's ±5 to ±15 guidance, 4 to 12 hostile acts from neutral`);
});

/* Cost (README): the packets the mock was sent over a mixed session, measured,
   and priced at the default models with docs/API_NOTES.md prices. Tokens are
   estimated at 3.5 characters each (prose plus ids); the structured-output
   schema is counted as input; output and thinking are assumptions, printed. */
s.test('cost per turn at the default models, from measured packet sizes', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: SEED, kinds: ['debt', 'lost', 'promise'] });
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); window.__all = []; const take = Game.Api.Mock.take; Game.Api.Mock.take = function (m, p) { window.__all.push({ m, n: p && typeof p.text === 'string' ? p.text.length : 0 }); return take.apply(this, arguments); };
    // The chronicle's user message as the real provider builds it (Api chronicleText).
    const chron = Game.Api.Mock.chronicle; Game.Api.Mock.chronicle = function (entries) { window.__chron = entries.map(e => `TURN ${e.turn} (day ${e.day}, ${e.phase})\nPLAYER: ${e.input || '(none)'}${e.roll && e.roll.line ? '\nROLL: ' + e.roll.line : ''}\nNARRATION: ${e.narration}`).join('\n\n').length; return chron.apply(this, arguments); }; });
  const inputs = ['I look around', 'I ask around about work', 'I try to climb the fence', '/look', 'I walk to Town Hall', 'I talk to whoever is at the desk', '/rest', 'I look around', 'I head to the bar', 'I ask about the bridge', 'I buy a lighter', '/wait evening', 'I look around', 'I try to sneak out the back', 'I ask about the river'];
  for (const t of inputs) await sendText(page, t);
  const m = await page.evaluate(() => {
    const avg = (k) => { const v = window.__all.filter(x => x.m === k).map(x => x.n); return { n: v.length, avg: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0, max: Math.max(0, ...v) }; };
    return {
      parse: avg('parse'), narrate: avg('narrate'), bookkeep: avg('bookkeep'),
      sys: { narrator: Game.Style.systemPrompt().length + Game.Pipeline.castBlock().length, style: Game.Style.systemPrompt().length, cast: Game.Pipeline.castBlock().length, parser: Game.Api.SYSTEM.parser.length, bookkeeper: Game.Api.SYSTEM.bookkeeper.length, chronicle: Game.Api.SYSTEM.chronicle.length },
      schema: { parser: JSON.stringify(Game.Api.SCHEMAS.parse_action).length, bookkeeper: JSON.stringify(Game.Api.SCHEMAS.record_changes).length },
      chronicleInput: window.__chron || 0,
      prices: Game.Api.PRICES, models: [Game.Storage.settings().narratorModel, Game.Storage.settings().parserModel]
    };
  });
  const T = chars => Math.round(chars / 3.5);
  const [narrModel, parseModel] = m.models;
  const P = m.prices;
  const OUT = { parser: 90, narrator: 120, bookkeeper: 180, chronicle: 110 };
  const THINK = 150;
  const parser = { in: T(m.sys.parser + m.schema.parser + m.parse.avg), out: OUT.parser };
  const book = { in: T(m.sys.bookkeeper + m.schema.bookkeeper + m.bookkeep.avg), out: OUT.bookkeeper };
  const narr = { cached: T(m.sys.narrator), in: T(m.narrate.avg), out: OUT.narrator };
  assert.ok(m.chronicleInput > 0, 'a chronicle call was measured');
  const chron = { in: T(m.sys.chronicle + m.chronicleInput), out: OUT.chronicle };
  const usd = (model, inTok, outTok, cacheRead) => (inTok * P[model].input + outTok * P[model].output + (cacheRead || 0) * P[model].cacheRead) / 1e6;
  const turn = think => usd(parseModel, parser.in, parser.out + think) + usd(narrModel, narr.in, narr.out + think, narr.cached) + usd(parseModel, book.in, book.out + think) + usd(parseModel, chron.in, chron.out + think) / 10;
  const first = usd(narrModel, narr.cached * 1.25, 0) - usd(narrModel, 0, 0, narr.cached);
  console.log('        measured over ' + inputs.length + ' inputs (chars; tokens at 3.5 chars each):');
  console.log(`          parser: packet avg ${m.parse.avg} (max ${m.parse.max}) + system ${m.sys.parser} + schema ${m.schema.parser} = ~${parser.in} input tokens; ~${parser.out} output assumed`);
  console.log(`          narrator: packet avg ${m.narrate.avg} (max ${m.narrate.max}) = ~${narr.in} input tokens + cached system ${m.sys.narrator} (style ${m.sys.style} + cast ${m.sys.cast}) = ~${narr.cached} tokens; ~${narr.out} output assumed`);
  console.log(`          bookkeeper: packet avg ${m.bookkeep.avg} (max ${m.bookkeep.max}) + system ${m.sys.bookkeeper} + schema ${m.schema.bookkeeper} = ~${book.in} input tokens; ~${book.out} output assumed`);
  console.log(`          chronicle (every 10 turns): ~${chron.in} input, ~${chron.out} output`);
  console.log(`          cost per ordinary turn at ${narrModel} + ${parseModel}: $${turn(0).toFixed(4)} without thinking, $${turn(THINK).toFixed(4)} with ~${THINK} thinking tokens per call; narrator-only commands (/look /rest /wait /skip) about $${(usd(narrModel, narr.in, narr.out, narr.cached)).toFixed(4)}-$${(usd(narrModel, narr.in, narr.out + THINK, narr.cached)).toFixed(4)}; first narration of a session +$${first.toFixed(4)} to write the cache`);
  console.log(`          100 turns: about $${(turn(0) * 100).toFixed(2)}-$${(turn(THINK) * 100).toFixed(2)}`);
  assert.ok(narr.cached > 512, 'the narrator system prompt is long enough to cache (512-token minimum)');
  assert.ok(m.narrate.max < 8000 && m.bookkeep.max < 12000, 'packets stay small');
  assert.equal(m.parse.n, m.bookkeep.n, 'one bookkeeping call per parsed turn');
});

/* Mock tidy-ups (milestone 5), on synthetic people so they hold for any town:
   a role word used as a verb ("I head to the bar") refers to nobody; a move
   names someone absent only by their name; a talk with nobody named goes to
   someone present; a role shared by several absent people picks nobody, a
   role only one absent person has picks them; "X and Y of Z" roles answer to
   both nouns. */
s.test('mock parser: verbs are not roles, moves only name the absent by name, talk goes to someone present', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const G = Game;
    const P = (input, present, known, exits) => G.Api.Mock.parse({ input, present: present || [], knownNpcs: known || [], exits: exits || [], knownLocations: [] }).then(x => x.result);
    const head = { id: 'npc_zed_quill', name: 'Zed Quill', role: 'head of the Quill Mill and Timber, who owns the yard' };
    const cook = { id: 'npc_ada_vole', name: 'Ada Vole', role: 'cook at the diner' };
    const own1 = { id: 'npc_bo_wick', name: 'Bo Wick', role: 'owner of the feed store' };
    const own2 = { id: 'npc_cy_lark', name: 'Cy Lark', role: 'owner and bartender of the Rail' };
    const here = { id: 'npc_dee_holt', name: 'Dee Holt', role: 'night clerk at the inn' };
    const bar = { id: 'loc_the_rail', name: 'The Rail', type: 'bar', closed: false };
    const out = {};
    out.verb = [G.Town.mentions('i head to the bar', head), G.Town.mentions('then head over to the counter', head), G.Town.mentions('we cook supper', cook), G.Town.mentions('i ask the head of the mill', head), G.Town.mentions(' head ', head), G.Town.mentions('the cook', cook)];
    out.roles = [G.Town.rolePhrases(own2), G.Town.rolePhrases({ role: 'mayor and town clerk' }), G.Town.rolePhrases(head)];
    out.move = await P('I head to the Rail', [], [head], [bar]);
    out.moveNamed = await P('I head to the Rail to find Zed', [], [head], [bar]);
    out.moveRole = await P('I walk to the Rail to see the cook', [], [cook], [bar]);
    out.verbHere = await P('I head over to the counter', [head], []);
    out.talkNobody = await P('I ask about work', [here], [head]);
    out.talkAbsent = await P('I talk to Zed', [here], [head]);
    out.talkShared = await P('I talk to the owner', [here], [own1, own2]);
    out.talkUnique = await P('I talk to the cook', [here], [cook, own1]);
    out.talkHereRole = await P('I talk to the owner', [own1, here], [own2]);
    out.bartender = await P('I ask the bartender for a beer', [here], [own2]);
    return out;
  });
  assert.deepEqual(r.verb, [false, false, false, true, true, true], 'a role word after a subject is a verb');
  assert.deepEqual(r.roles, [['owner', 'bartender'], ['mayor', 'town clerk'], ['head']]);
  assert.deepEqual([r.move.actionType, r.move.destinationId, r.move.targets], ['move', 'loc_the_rail', []], 'nobody absent is dragged into a move');
  assert.deepEqual(r.moveNamed.targets, ['npc_zed_quill'], 'unless named');
  assert.deepEqual(r.moveRole.targets, [], 'a role does not name someone absent in a move');
  assert.deepEqual(r.verbHere.targets, [], '"head over" is not talking to the head');
  assert.deepEqual([r.talkNobody.actionType, r.talkNobody.targets], ['talk', ['npc_dee_holt']], 'nobody named: whoever is here');
  assert.deepEqual(r.talkAbsent.targets, ['npc_zed_quill'], 'someone named who is not here, not a stand-in');
  assert.deepEqual(r.talkShared.targets, ['npc_dee_holt'], 'a role shared by absent people: whoever is here');
  assert.deepEqual(r.talkUnique.targets, ['npc_ada_vole'], 'a role only one absent person has');
  assert.deepEqual(r.talkHereRole.targets, ['npc_bo_wick'], 'the one here wins');
  assert.deepEqual(r.bartender.targets, ['npc_cy_lark'], '"bartender" finds the owner and bartender');
});

s.run();
