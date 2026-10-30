'use strict';
/* The seams between the six wave-1 merges (docs/notes/*.md, "Integration"):
   a loose end tied with content's own obligations (onStart, the full-npc-id
   obligation id), a background hook's number dayOffset, a town event with
   its attendees in front of the player (/skip goes there first) and in
   state.eventsFired, the morning's news told once on its own morning, a
   place shut today or barred as a shut door, "then go to X" (moveWhen
   after), the no-op rules for effects on the dead, an engine seed with a list
   trigger, and the narration of /rest and /wait never counted as an instant.
   Mock mode; ids come from Game.data and Game.state, never one town. */
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('integration');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const quiets = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(e => e.textContent));
const lastPacket = page => page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop().text);

s.test('a loose end tied with content\'s obligations: obligations[i] lined up with options, onStart now, the id obl_<kind>_<npc id> when its seed fires', async h => {
  const page = await h.open();
  // The first loose end whose option has an obligation with onStart (content: the letter).
  const pick = await page.evaluate(() => {
    const L = Game.data.LOOSE_ENDS;
    for (const kind of Object.keys(L)) (L[kind].obligations || []).forEach((o, i) => { if (o && Array.isArray(o.onStart) && o.onStart.length && !L.__pick) L.__pick = { kind, index: i, ob: o }; });
    const p = L.__pick; delete L.__pick;
    return p || null;
  });
  assert.ok(pick, 'content has a loose end whose obligation gives the player something at the start');
  await page.evaluate(p => {
    const D = Game.data;
    const bg = D.BACKGROUNDS[0];
    Game.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
      looseEnds: [{ kind: p.kind, text: D.LOOSE_ENDS[p.kind].options[p.index] }] }, { seed: 12345 });
  }, pick);
  await page.waitForSelector('#screen-game.active');
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const le = st.player.looseEnds[0];
    const sd = S.seed(le.seedId);
    const npc = S.npc(le.npcId);
    const out = { inv: st.player.inventory.map(i => i.name), npc: npc.id, name: npc.name, eff: sd.effects };
    S.apply({ effects: sd.effects });
    out.open = S.obligations('open').map(o => ({ id: o.id, kind: o.kind, itemName: o.itemName, dueDay: o.dueDay }));
    out.day = st.time.day;
    return out;
  });
  const given = pick.ob.onStart.find(e => e.op === 'giveItem');
  if (given) assert.ok(r.inv.includes(given.name.replace('{npc}', r.name)), 'onStart: ' + JSON.stringify(r.inv));
  assert.equal(r.eff.length, 1);
  assert.equal(r.eff[0].op, 'addObligation');
  assert.equal(r.eff[0].kind, pick.ob.kind, 'obligations[i], not the kind\'s default');
  assert.deepEqual(r.open, [{ id: `obl_${pick.ob.kind}_${r.npc}`, kind: pick.ob.kind, itemName: pick.ob.itemName ? pick.ob.itemName.replace('{npc}', r.name) : null, dueDay: r.day + pick.ob.dueOffset }]);
});

s.test('a background hook with a number dayOffset: a person trigger may fire from day 1 + dayOffset; a day trigger is never before tomorrow', async h => {
  const page = await h.open();
  await page.evaluate(() => {
    const B = Game.data.BACKGROUNDS;
    const n = Game.data.TOWN_DATA.npcs.find(x => x.presence === 'here');
    B[0].hook = { npcId: n.id, text: '{npc} has a job for {player}.', dayOffset: 0, trigger: { type: 'npc', value: n.id } };
    B[1].hook = { text: 'A note for {player} turns up.', dayOffset: 0, trigger: 'day' };
  });
  await quickStart(page, { bgIndex: 0 });
  const a = await page.evaluate(() => { const sd = Game.state.seeds.find(x => /^seed_bg_/.test(x.id)); return { trigger: sd.trigger, nb: sd.notBeforeDay, effect: sd.effect }; });
  assert.equal(a.trigger.type, 'npc');
  assert.equal(a.nb, 1, 'day 1 + 0');
  assert.match(a.effect, /has a job for Tester\.$/);
  const other = await h.open();
  await other.evaluate(() => { Game.data.BACKGROUNDS[1].hook = { text: 'A note for {player} turns up.', dayOffset: 0, trigger: 'day' }; });
  await quickStart(other, { bgIndex: 1 });
  assert.deepEqual(await other.evaluate(() => Game.state.seeds.find(x => /^seed_bg_/.test(x.id)).trigger), { type: 'day', value: 2 });
});

s.test('a town event: /skip there at its phase puts the player in the room with its attendees, it is a scene (DUE EVENT), public news, and in state.eventsFired once', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const ev = await page.evaluate(() => {
    const e = (Game.data.TOWN_DATA.events || []).find(x => Array.isArray(x.attendees) && x.attendees.length);
    return e ? { id: e.id, day: e.day, phase: e.phase, locationId: e.locationId, name: Game.State.loc(e.locationId).name, attendees: e.attendees } : null;
  });
  assert.ok(ev, 'the town has an event with attendees');
  await page.evaluate(d => Game.State.apply({ setTime: { day: d, phase: 'morning' } }), ev.day);
  await sendText(page, `/skip to ${ev.name} in the ${ev.phase}`);
  const r = await page.evaluate(e => ({
    at: Game.state.player.locationId, phase: Game.state.time.phase, fired: Game.state.eventsFired.filter(x => x === e.id).length,
    here: Game.State.npcsAt(e.locationId).map(n => n.id),
    free: e.attendees.filter(id => { const n = Game.State.npc(id); return n && n.status === 'free' && n.alive !== false && !Game.State.awayNow(n); }),
    news: Game.State.news.filter(n => n.day === e.day && n.public).length
  }), ev);
  assert.equal(r.at, ev.locationId);
  assert.equal(r.phase, ev.phase);
  assert.equal(r.fired, 1);
  assert.ok(r.free.length && r.free.every(id => r.here.includes(id)), 'the attendees are there: ' + JSON.stringify(r));
  assert.ok(r.news >= 1, 'public news');
  assert.match(await lastPacket(page), /\nDUE EVENT: (?!none)/, 'told as the scene');
  await sendText(page, '/wait night');
  assert.equal(await page.evaluate(id => Game.state.eventsFired.filter(x => x === id).length, ev.id), 1, 'once');
});

s.test('the morning\'s news: a seed that fires at dawn is told that morning, once; private news is never told and stays unseen', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  await page.evaluate(() => {
    const S = Game.State;
    S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_dawn_test', cause: 'test', effect: 'The ferry bell rings at dawn.', trigger: { type: 'day', value: 2 }, fired: false, hidden: true,
      effects: [{ op: 'addNews', text: 'The ferry bell rang at dawn for the first time in years.', public: true }] } }] });
    S.apply({ effects: [{ op: 'addNews', text: 'A private word passed between two people.', public: false }] });
  });
  await sendText(page, '/rest');
  const q = (await quiets(page)).filter(t => /^Overnight in town/.test(t));
  assert.equal(q.length, 1);
  assert.match(q[0], /The ferry bell rang at dawn/);
  const r = await page.evaluate(() => Game.State.news.map(n => [n.public, n.seen]));
  assert.deepEqual(r, [[false, false], [true, true]]);
  await sendText(page, '/rest');
  assert.equal((await quiets(page)).filter(t => /ferry bell rang/.test(t)).length, 1, 'told once');
});

s.test('a place shut today (closedOn) or barred to the player (banFrom) is a shut door for a walk and a walk-then-act; "do this, then go there" acts here and walks on', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const p = await page.evaluate(() => {
    const st = Game.state;
    const here = st.player.locationId;
    const l = st.locations.find(x => x.id !== here && x.discovered && !x.away && Array.isArray(x.closedOn) && x.closedOn.length);
    const day = [1, 2, 3, 4, 5, 6, 7].find(d => l.closedOn.includes(Game.State.weekday(d)));
    const open = st.locations.find(x => x.id !== here && x.id !== l.id && x.discovered && !x.away && !x.closed && !(x.closedOn || []).length && Game.State.npcsAt(x.id).length === 0);
    return { here, shut: { id: l.id, name: l.name }, day, open: { id: open.id, name: open.name } };
  });
  await page.evaluate(d => Game.State.apply({ setTime: { day: d, phase: 'afternoon' } }), p.day);
  await sendText(page, `I walk to ${p.shut.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), p.here, 'a walk to a shut door');
  assert.match(await lastPacket(page), /\nDESTINATION: [^\n]*\(closed on \w+days: the player cannot go in\)/);
  // Barred: a ban from a place that is open today.
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'banFrom', locationId: id, days: 3 }] }), p.open.id);
  await sendText(page, `I walk to ${p.open.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), p.here, 'barred');
  assert.match(await lastPacket(page), /not welcome there until day/);
  await page.evaluate(id => { Game.state.bans = []; }, p.open.id);
  // Then go there: the action here, the walk after.
  const who = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[0]);
  const parse = { actionType: 'talk', summary: 'asks about work, then walks on', targets: who ? [who.id] : [], destinationId: p.open.id, moveWhen: 'after', needsRoll: false, timeCost: 'instant' };
  await page.evaluate(x => Game.Api.Mock.queue('parse', x), parse);
  await sendText(page, `ask about work, then walk to ${p.open.name}`);
  const r = await page.evaluate(() => ({ at: Game.state.player.locationId, shorts: Game.state.time.shorts }));
  const packet = await lastPacket(page);
  assert.ok(packet.includes(`\nTHEN: once this is done the player walks on to ${p.open.name}.`), 'THEN line');
  assert.doesNotMatch(packet, /\nMOVED: /, 'the action happened here');
  assert.equal(r.at, p.open.id, 'walked on');
});

s.test('effects on the dead and on a finished faction are quiet no-ops; someone living elsewhere still remembers; an engine seed may name several places', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const st = Game.state;
    const dead = st.npcs.find(n => Game.presenceOf(n) === 'dead');
    const away = st.npcs.find(n => Game.presenceOf(n) === 'away');
    const f = st.factions[0];
    f.activeClock = -1;
    const res = S.apply({ effects: [
      { op: 'addMemory', npcId: dead.id, text: 'remembers nothing', weight: 2 },
      { op: 'addMemory', npcId: away.id, text: 'the stranger never wrote', weight: 2 },
      { op: 'clockAdjust', factionId: f.id, delta: -1 }
    ] });
    const here = st.player.locationId;
    const other = st.locations.find(l => l.id !== here && l.discovered && !l.away).id;
    const seed = S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_two_places', cause: 'test', effect: 'Something turns up.', trigger: { type: 'location', value: [other, here] }, fired: false, hidden: true } }] });
    const model = S.apply({ newSeeds: [{ cause: 'x', effect: 'y', triggerType: 'location', triggerValue: [other, here] }] }, { source: 'model' });
    return { rejected: res.rejected, applied: res.applied, dead: dead.memories.length, away: away.memories.map(m => m.text), seed: seed.rejected, trigger: S.seed('seed_two_places').trigger.value, model: model.rejected.length };
  });
  assert.deepEqual(r.rejected, []);
  assert.match(r.applied[0], /no-op: npc_\w+ is dead/);
  assert.match(r.applied[2], /no-op: fac_\w+ has no running clock/);
  assert.equal(r.dead, 0);
  assert.ok(r.away.includes('the stranger never wrote'));
  assert.deepEqual(r.seed, []);
  assert.equal(r.trigger.length, 2);
  assert.equal(r.model, 1, 'the model names one place');
});

s.test('pace: the narration of /rest and /wait is no instant action; an ordinary instant counts', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  await sendText(page, '/wait evening');
  assert.equal(await page.evaluate(() => Game.state.time.instants | 0), 0, '/wait');
  await sendText(page, '/rest');
  assert.equal(await page.evaluate(() => Game.state.time.instants | 0), 0, '/rest');
  await page.evaluate(() => Game.Api.Mock.queue('parse', { actionType: 'look', summary: 'looks around', targets: [], needsRoll: false, timeCost: 'instant' }));
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.state.time.instants | 0), 1, 'an instant action');
});

s.run();
