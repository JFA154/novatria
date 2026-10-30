'use strict';
/* The seams between the six wave-1 merges (docs/notes/*.md, "Integration"):
   a loose end tied with content's own obligations (onStart, the full-npc-id
   obligation id), a background hook's number dayOffset, a town event with
   its attendees in front of the player (/skip goes there first) and in
   state.eventsFired, the morning's news told once on its own morning, a
   place shut today or barred as a shut door, "then go to X" (moveWhen
   after), the no-op rules for effects on the dead, an engine seed with a list
   trigger, and the narration of /rest and /wait never counted as an instant.
   Wave 2: content's owedTo and missText on a missed obligation, the Journal
   keeping one still owed, playerAt and the council's attendance branch, the
   witness complication and the mock's memory cap, one read-only toast, and
   Stop while the town is updated.
   Wave 4: the Character tab's Grown line reads the entry's own gain, as the
   quiet line does; no module guards a function the file always has; one
   composer focus helper; a queued line that fails goes back without loss.
   Wave 5: rough nights through the box (moved along, then fined the third
   night running; the cell starts again); someone hurt said the same way by
   the People card, the absent note and the narrator; the ending a /rest
   brings told before its Resolved lines, its recap and the closing line,
   and one /undo for all of it.
   Mock mode; ids come from Game.data and Game.state, never one town. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, sendText, ROOT } = require('./helpers.cjs');

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
  // Changed by design in wave 3 (the second playtest: seed news told twice, and N4): a seed that fires at dawn is
  // told in that /rest narration as its due event, so its own news is seen and "Overnight in town" does not repeat it.
  assert.match(await lastPacket(page), /\nDUE EVENT: The ferry bell rings at dawn\./);
  assert.equal((await quiets(page)).filter(t => /ferry bell rang/.test(t)).length, 0, 'not told again as overnight news');
  const r = await page.evaluate(() => Game.State.news.map(n => [n.public, n.seen]));
  assert.deepEqual(r, [[false, false], [true, true]]);
  await sendText(page, '/rest');
  assert.equal((await quiets(page)).filter(t => /ferry bell rang/.test(t)).length, 0, 'told once, by the narration');
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

// ----- Wave 2 seams (docs/notes/*.md, "Wave 2"; the integration pass) -----

s.test('wave 2: a loose end\'s obligation keeps content\'s owedTo and missText; missed, it is told in content\'s words, the person owed remembers it, nobody who lives elsewhere or does not know of it comes looking, and a save with them loads', async h => {
  const page = await h.open();
  // The loose end whose obligation is owed to someone other than the person it binds (content: the letter, owed to the woman who wrote it).
  const pick = await page.evaluate(() => {
    const L = Game.data.LOOSE_ENDS;
    for (const kind of Object.keys(L)) {
      const i = (L[kind].obligations || []).findIndex(o => o && o.owedTo && o.missText && !/\{/.test(o.owedTo));
      if (i >= 0) return { kind, index: i, ob: L[kind].obligations[i] };
    }
    return null;
  });
  assert.ok(pick, 'content has an obligation owed to someone else');
  await page.evaluate(p => {
    const D = Game.data;
    const bg = D.BACKGROUNDS[0];
    Game.Api.Mock.delay = 0;
    Game.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
      looseEnds: [{ kind: p.kind, text: D.LOOSE_ENDS[p.kind].options[p.index] }] }, { seed: 12345 });
  }, pick);
  await page.waitForSelector('#screen-game.active');
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const le = st.player.looseEnds[0];
    S.apply({ effects: S.seed(le.seedId).effects });
    const o = st.player.obligations[0];
    const made = { owedTo: o.owedTo, missText: o.missText, npcId: o.npcId };
    S.apply({ setTime: { day: o.dueDay, phase: 'night' } });
    Game.Pipeline.passTime('long');
    const owed = S.npc(o.owedTo);
    return {
      made, status: o.status, name: S.npc(o.npcId).name,
      due: st.dueEvents.filter(e => e.obligationId === o.id).map(e => ({ text: e.text, npcId: e.npcId || null, bring: !!e.bring })),
      lookingFor: st.dueEvents.filter(e => /came looking:/.test(e.text)).length,
      news: st.news.filter(n => /letter|promise|Missed/i.test(n.text)).map(n => n.text),
      remembers: owed.memories.length > 0,
      shape: S.validateShape(JSON.parse(JSON.stringify(st))),
      bad: (() => { const c = JSON.parse(JSON.stringify(st)); c.player.obligations[0].owedTo = 'npc_nobody'; return S.validateShape(c); })()
    };
  });
  assert.equal(r.made.owedTo, pick.ob.owedTo);
  assert.ok(r.made.missText && !/[{}]/.test(r.made.missText), 'missText filled: ' + r.made.missText);
  assert.equal(r.status, 'missed');
  assert.deepEqual(r.due, [{ text: r.made.missText, npcId: null, bring: false }], 'told in content\'s words, with nobody brought');
  assert.equal(r.lookingFor, 0, 'never "<the recipient> came looking: <the task>"');
  assert.equal(r.news.length, 1, 'one news item: ' + JSON.stringify(r.news));
  assert.ok(r.remembers, 'the person owed remembers it');
  assert.deepEqual(r.shape, []);
  assert.match(r.bad.join(' '), /owedTo "npc_nobody" is nobody in this game/);
  // The same in a game: the next narration tells it, and the quiet line names the task.
  await sendText(page, '/look');
  assert.match(await lastPacket(page), /\nDUE EVENT: [^\n]*(still in|come and gone)/);
});

s.test('wave 2: a missed obligation owed to someone in town brings them with content\'s words (askerId still read as owedTo); without missText the plain line, and only when they can come', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const free = st.npcs.filter(n => n.alive !== false && n.status === 'free' && (n.presence || 'here') === 'here' && !S.awayNow(n));
    const [a, b, c] = free;
    S.apply({ effects: [
      { op: 'addObligation', kind: 'promise', npcId: a.id, text: 'Fix {npc}\'s fence.', dueOffset: 0, owedTo: b.id, missText: '{npc}\'s fence is still down, and the one who asked comes by about it.' },
      { op: 'addObligation', kind: 'errand', npcId: c.id, text: 'Take {npc} the parcel.', dueOffset: 0, askerId: a.id }] });
    const os = st.player.obligations.map(o => ({ id: o.id, owedTo: o.owedTo }));
    S.apply({ setTime: { day: st.time.day, phase: 'night' } });
    Game.Pipeline.passTime('long');
    return { a: a.id, b: b.id, c: c.id, aName: a.name, os, due: st.dueEvents.map(e => ({ npcId: e.npcId || null, text: e.text, bring: !!e.bring })), visits: (st.visits || []).map(v => v.npcId) };
  });
  assert.deepEqual(r.os.map(o => o.owedTo), [r.b, r.a], 'owedTo kept, askerId read as owedTo');
  const fence = r.due.find(e => /fence/.test(e.text));
  assert.deepEqual(fence, { npcId: r.b, text: `${r.aName}'s fence is still down, and the one who asked comes by about it.`, bring: true });
  const parcel = r.due.find(e => e.npcId === r.a && !/fence/.test(e.text));
  assert.ok(parcel && /comes looking for Tester about the errand/.test(parcel.text), JSON.stringify(r.due));
  assert.ok(!r.due.some(e => e.npcId === r.c), 'the one the parcel is for does not know of it');
  assert.ok(r.visits.includes(r.b) && r.visits.includes(r.a));
});

s.test('wave 2: the Journal keeps a missed debt that is still owed with the open ones (what is paid so far, not struck through), and marks it settled late once paid', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.alive !== false && x.status === 'free' && (x.presence || 'here') === 'here');
    S.apply({ effects: [{ op: 'playerGold', delta: 1000 }, { op: 'addObligation', kind: 'debt', npcId: n.id, text: 'Pay {npc} the four hundred dollars.', amount: 400, dueOffset: 0 }] });
    const o = st.player.obligations[0];
    S.apply({ setTime: { day: st.time.day, phase: 'night' } });
    G.Pipeline.passTime('long');
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -150 }, { source: 'model', present: [n.id] });
    const row = () => { G.UI.openPanel('journal'); const li = document.querySelector(`#panel-body [data-section="owe"] [data-obligation="${o.id}"]`); return { text: li.textContent, done: li.classList.contains('jr-done') }; };
    const missed = row();
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -250 }, { source: 'model', present: [n.id] });
    return { status: o.status, late: o.late, missed, paid: row() };
  });
  assert.equal(r.missed.done, false, 'still owed, not struck through');
  assert.match(r.missed.text, /missed Day \d+, still owed · \$150 of \$400 paid/);
  assert.deepEqual([r.status, r.late], ['met', true]);
  assert.deepEqual([r.paid.done, /Settled late$/.test(r.paid.text)], [true, true], r.paid.text);
});

s.test('wave 2: playerAt: the council meeting with the player in the room and Royce warm to them is the attendance branch (a walk into the evening, /skip, /wait there); slept through or elsewhere it is not; the validators know the key', async h => {
  const page = await h.open();
  const branch = await page.evaluate(() => {
    const ev = Game.data.TOWN_DATA.events.find(e => (e.branches || []).some(b => b.when && b.when.playerAt));
    if (!ev) return null;
    const i = ev.branches.findIndex(b => b.when && b.when.playerAt);
    const b = ev.branches[i];
    const n = Object.keys(b.when.attitudeAtLeast || {})[0] || null;
    return { id: ev.id, day: ev.day, phase: ev.phase, loc: b.when.playerAt, name: Game.State.loc ? null : null, npc: n, at: n ? b.when.attitudeAtLeast[n] : null,
      news: b.effects.find(e => e.op === 'addNews').text, twinNews: ev.branches[i + 1].effects.find(e => e.op === 'addNews').text };
  });
  assert.ok(branch, 'an event branch reads playerAt');
  const PHASES = ['morning', 'afternoon', 'evening', 'night'];
  const before = PHASES[PHASES.indexOf(branch.phase) - 1];
  const setup = async (p, where) => {
    await quickStart(p, { kinds: [] });
    await p.evaluate(([b, before, where]) => {
      const S = Game.State;
      Game.Api.Mock.delay = 0;
      if (b.npc) S.apply({ effects: [{ op: 'attitudeDelta', npcId: b.npc, delta: b.at - S.npc(b.npc).attitude }] });
      S.apply({ setTime: { day: b.day, phase: before, shorts: 2 } });
      if (where) S.apply({ playerLocationId: where });
    }, [branch, before, where]);
  };
  const told = p => p.evaluate(d => Game.State.news.filter(n => n.day === d && n.eventId).map(n => n.text), branch.day);
  // A walk that crosses into the evening: the player is in the room when the tick fires it.
  await setup(page, null);
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: id, needsRoll: false, timeCost: 'short' }), branch.loc);
  await sendText(page, 'I walk over there');
  assert.deepEqual(await page.evaluate(() => [Game.state.player.locationId, Game.state.time.phase]), [branch.loc, branch.phase]);
  assert.deepEqual(await told(page), [branch.news], 'the walk');
  // Changed by design in wave 4 (playtest R1): the meeting starts as the walk gets there, so the walk's own narration tells it, not the next one.
  assert.match(await lastPacket(page), /\nDUE EVENT: [^\n]*finds you[^\n]*\(the scene/, 'told to the player as the scene, in the walk\'s narration');
  await sendText(page, '/look');
  assert.doesNotMatch(await lastPacket(page), /\nDUE EVENT: [^\n]*finds you/, 'and not told again');
  // /wait there.
  const p2 = await h.open();
  await setup(p2, branch.loc);
  await sendText(p2, `/wait ${branch.phase}`);
  assert.deepEqual(await told(p2), [branch.news], '/wait in the room');
  // /skip there at that phase.
  const p5 = await h.open();
  await setup(p5, null);
  const hall = await p5.evaluate(id => Game.State.loc(id).name, branch.loc);
  await sendText(p5, `/skip to ${hall} in the ${branch.phase}`);
  assert.deepEqual(await told(p5), [branch.news], '/skip');
  // Elsewhere: not this branch.
  const p3 = await h.open();
  await setup(p3, null);
  await sendText(p3, `/wait ${branch.phase}`);
  const elsewhere = await told(p3);
  assert.equal(elsewhere.length, 1);
  assert.ok(![branch.news, branch.twinNews].includes(elsewhere[0]), 'away from the room: ' + elsewhere[0]);
  // Slept through in the room: not there for it, and its news is dated the evening it happened.
  const p4 = await h.open();
  await setup(p4, branch.loc);
  await sendText(p4, '/rest');
  const slept = await told(p4);
  assert.equal(slept.length, 1);
  assert.ok(![branch.news, branch.twinNews].includes(slept[0]), 'asleep: ' + slept[0]);
  // The engine's own validator refuses a playerAt that is no place.
  const bad = await p4.evaluate(id => {
    const T = JSON.parse(JSON.stringify(Game.data.TOWN_DATA));
    T.events.find(e => e.id === id).branches.find(b => b.when && b.when.playerAt).when.playerAt = 'loc_nowhere';
    return Game.Town.validate(T).join(' | ');
  }, branch.id);
  assert.match(bad, /loc_nowhere/);
});

s.test('wave 2: the witness complication never says the player was known before; the mock\'s memory rewrite keeps as many as the game allows', async h => {
  const page = await h.open();
  const r = await page.evaluate(async () => {
    const texts = Game.data.TABLES.complications.map(c => (typeof c === 'string' ? c : c.text));
    const mems = Array.from({ length: 16 }, (_, i) => ({ n: i + 1, text: `Remembers thing number ${i + 1} the player did`, weight: 2 }));
    const res = await Game.Api.rewriteMemories({ people: [{ npcId: 'npc_x', memories: mems }] });
    return { texts, kept: res.people[0].memories.length, max: Game.State.MEMORY_MAX };
  });
  assert.ok(!r.texts.some(t => /recogni[sz]es you|from somewhere|know(s)? you from/i.test(t)), r.texts.join(' | '));
  assert.ok(r.texts.includes('{witness} sees it, and will know your face from now on'));
  assert.equal(r.kept, r.max);
});

s.test('wave 2: a read-only tab says so once per refused action (the UI guard and the Pipeline guard never both toast); Stop shows while the town is updated with the box empty, and keeps the narration', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => {
    window.__toasts = 0;
    new MutationObserver(m => { window.__toasts += m.filter(x => x.type === 'childList').length ? 1 : 0; }).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true });
  });
  const count = async fn => { await page.evaluate(() => { window.__toasts = 0; }); await fn(); await page.waitForTimeout(50); return page.evaluate(() => window.__toasts); };
  const turn0 = await page.evaluate(() => { Game.Storage.setReadOnly(true); return Game.state.meta.turn; });
  assert.equal(await count(() => page.evaluate(() => { const b = document.getElementById('cmd'); b.readOnly = false; b.value = 'I look around'; })
    .then(() => page.press('#cmd', 'Enter'))), 1, 'Enter');
  assert.equal(await count(() => page.evaluate(() => Game.Pipeline.submit('I look around'))), 1, 'Pipeline.submit');
  assert.equal(await count(() => page.evaluate(() => Game.Pipeline.submit('/rest'))), 1, '/rest');
  assert.equal(await count(() => page.evaluate(() => Game.Pipeline.submit('/undo'))), 1, '/undo');
  assert.equal(await count(() => page.evaluate(() => Game.Pipeline.pass())), 1, 'Wait');
  assert.equal(await count(() => page.evaluate(() => Game.UI.runAction('/look'))), 1, 'the ⋯ list');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), turn0, 'nothing played');
  await page.evaluate(() => { Game.Storage.setReadOnly(false); document.getElementById('cmd').value = ''; });
  // Stop while the town is updated, with nothing typed: the button reads Stop, and stopping keeps the narration.
  await page.evaluate(() => {
    const M = Game.Api.Mock;
    const orig = M.bookkeep;
    M.bookkeep = async function (packet) { await new Promise(res => setTimeout(res, 1500)); M.bookkeep = orig; return orig.call(M, packet); };
  });
  await page.fill('#cmd', 'I look at the counter');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => document.getElementById('turn-status-text').textContent === 'Updating the town…', null, { timeout: 5000 });
  assert.equal(await page.textContent('#send'), 'Stop');
  assert.equal(await page.inputValue('#cmd'), '');
  await page.click('#send');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const r = await page.evaluate(() => { const e = Game.state.log[Game.state.log.length - 1]; return { input: e.input, changes: e.changes, narration: !!e.narration, box: document.getElementById('cmd').value }; });
  assert.deepEqual(r, { input: 'I look at the counter', changes: 'not recorded', narration: true, box: '' });
  assert.ok((await quiets(page)).some(q => /^Stopped while the town was being updated/.test(q)));
});

s.test('wave 4: the Character tab\'s Grown line says what the quiet line said: the entry\'s own gain (+2 max HP once the stat is capped), nothing for a loose end\'s thread; an entry from an older build reads the thread\'s reward', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const ids = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const t = st.threads.find(x => x.reward && Game.data.TOWN_DATA.threads.some(y => y.id === x.id));
    S.apply({ effects: [{ op: 'threadUpdate', threadId: t.id, knownToPlayer: true }] });
    st.player.stats[t.reward] = S.LIMITS.statCap;
    Game.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Talks', targets: [], needsRoll: false, timeCost: 'instant' });
    Game.Api.Mock.queue('bookkeep', { threadUpdates: [{ threadId: t.id, status: 'resolved' }, { threadId: st.player.looseEnds[0].threadId, status: 'resolved' }] });
    return { town: t.id, title: t.title, reward: t.reward };
  });
  await sendText(page, 'I settle it.');
  const quiet = (await quiets(page)).filter(t => /^Resolved: /.test(t));
  const grown = async () => { await page.evaluate(() => Game.UI.openPanel('character')); return page.evaluate(() => { const h3 = [...document.querySelectorAll('#panel-body h3')].find(x => x.textContent === 'Grown'); return h3 ? [...h3.nextElementSibling.querySelectorAll('li')].map(li => li.textContent) : []; }); };
  const lines = await grown();
  assert.equal(quiet.length, 2, quiet.join(' | '));
  assert.deepEqual(lines, quiet.map(q => { const m = /^Resolved: (.*?)\.(?: (.*)\.)?$/.exec(q); return m[2] ? `${m[1]}: ${m[2]}` : m[1]; }), `${quiet.join(' | ')} / ${lines.join(' | ')}`);
  assert.match(lines[0], /: \+2 max HP$/, 'the capped stat gave max HP, and the sheet says so');
  // An entry saved before gains were kept (no gain key): the thread's reward, as before.
  await page.evaluate(() => { for (const e of Game.state.player.progression) delete e.gain; });
  const old = await grown();
  assert.equal(old[0], `${ids.title}: +1 ${ids.reward[0].toUpperCase()}${ids.reward.slice(1)}`);
});

s.test('wave 4: no module guards a function this file always has (typeof State.x, Pipeline.x, Api.x, UI.x, Upgrade.x, App.x); one composer focus helper: Do / Say put the focus in the box on a laptop, and leave it on the button pressed on a phone', async h => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const guards = html.match(/typeof (?:Rng|Dice|Tables|State|Town|World|Style|Api|Upgrade|Pipeline|Storage|UI|Commands|App)\.[\w.]+ [!=]== 'function'/g) || [];
  assert.deepEqual(guards, []);
  assert.ok(!/function focusInput\(/.test(html) && !/\bfocusInput\(/.test(html), 'focusInput folded into focusComposer');
  assert.ok(!/\breadOnly: 'This game is open/.test(html), 'one read-only notice (the UI\'s)');
  const page = await h.open();
  await quickStart(page);
  await page.click('#mode-say');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd');
  await page.click('#mode-do');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd');
  const phone = await h.open({ viewport: { width: 375, height: 740 } });
  await quickStart(phone);
  await phone.click('#mode-say');
  assert.equal(await phone.evaluate(() => document.activeElement.id), 'mode-say', 'no keyboard pops up');
  await phone.click('#mode-do');
  assert.equal(await phone.evaluate(() => document.activeElement.id), 'mode-do');
});

s.test('wave 4: a queued line shows its × always; one that fails while something new is in the box goes into a notice ("Your action: …"), not lost', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => {
    const M = Game.Api.Mock, real = M.bookkeep;
    M.bookkeep = async (...args) => { await new Promise(r => setTimeout(r, 1200)); M.bookkeep = real; return real(...args); };
    M.queue('parse', {}, { error: { type: 'invalid_request_error', message: 'mock: refused' } });
  });
  await page.fill('#cmd', 'I look at the board out front');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.acceptsQueue === true, null, { timeout: 5000 });
  await page.fill('#cmd', 'I wave at the mechanic');
  await page.press('#cmd', 'Enter');
  assert.equal(await page.evaluate(() => Game.Pipeline.queued), 'I wave at the mechanic');
  assert.equal(await page.evaluate(() => !document.getElementById('queued-cancel').hidden), true, 'the × is there');
  await page.fill('#cmd', 'Something new');
  await page.waitForFunction(() => !Game.Pipeline.busy && !Game.Pipeline.queued, null, { timeout: 10000 });
  await page.waitForTimeout(50);
  assert.equal(await page.inputValue('#cmd'), 'Something new', 'what was typed since stays');
  const notices = await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].map(n => n.textContent));
  assert.ok(notices.some(t => t.includes('Your action: “I wave at the mechanic”')), notices.join(' | '));
});

s.test('wave 4: the third review\'s leftovers: a police place reads "Police station" and Town Hall "Town hall"; a function word at a sentence\'s start ("Neither says a word.", "Whoever calls, she answers.") is no invented name, while "You notice Earl Hux at the bar." still is', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => ({
    police: Game.UI.placeLabel({ id: 'loc_x', type: 'police' }),
    hall: Game.UI.placeLabel(Game.State.loc('loc_town_hall')),
    names: ['Neither says a word.', 'Whoever calls, she answers.', 'None of them looks up.', 'You notice Earl Hux at the bar.'].map(t => Game.Style.check(t, { packet: '', style: 'casual' }).problems.filter(p => p.type === 'name').map(p => (p.hard ? 'HARD ' : 'soft ') + p.names.join(',')).join(' | '))
  }));
  assert.equal(r.police, 'Police station');
  assert.equal(r.hall, 'Town hall');
  assert.deepEqual(r.names.slice(0, 3), ['', '', '']);
  assert.match(r.names[3], /^HARD Earl,Hux$/);
});

s.test('wave 5: rough nights at Town Hall through the box: the second morning the chief tells the player to move along, a third night running costs the $25 fine; a night in the cell starts the count again', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const night = async () => {
    await page.evaluate(() => { Game.State.apply({ setTime: { day: Game.state.time.day, phase: 'night', shorts: 0, late: false }, playerLocationId: 'loc_town_hall' }); Game.UI.renderGame(); });
    const g0 = await page.evaluate(() => Game.state.player.gold);
    await sendText(page, '/rest');
    const pk = await lastPacket(page);
    return { due: (/^DUE EVENT: .*$/m.exec(pk) || [''])[0], count: await page.evaluate(() => Game.state.flags.roughNights | 0), paid: g0 - await page.evaluate(() => Game.state.player.gold) };
  };
  const n1 = await night();
  const n2 = await night();
  const n3 = await night();
  assert.equal(n1.count, 1);
  assert.doesNotMatch(n1.due, /move along|fine/);
  assert.match(n2.due, /second morning running and tells you to move along/, n2.due);
  assert.equal(n2.paid, 0);
  assert.equal(n2.count, 2, 'the count runs on past the chief');
  assert.match(n3.due, /third morning running, still there after (?:he|she|they) told you to find a real bed, and writes you a \$25 fine/, n3.due);
  assert.equal(n3.paid, 25);
  const mem = await page.evaluate(() => Game.state.npcs.flatMap(n => (n.memories || []).map(m => m.text)).filter(t => /sleeping rough/.test(t)));
  assert.ok(mem.some(t => /two nights running and told them to move along/.test(t)) && mem.some(t => /still sleeping rough at Town Hall, three nights running, after telling them to find a real bed, and fined them/.test(t)), mem.join(' | '));
  // A night in the holding cell starts it again: the next night rough is the first.
  await page.evaluate(() => { Game.State.apply({ playerLocationId: 'loc_front_street' }); Game.World.arrestPlayer({ told: true }); Game.State.apply({ setTime: { day: Game.state.time.day + 1, phase: 'morning', shorts: 0, late: false } }); });
  const n4 = await night();
  assert.equal(n4.count, 1);
  assert.doesNotMatch(n4.due, /move along|fine/);
});

s.run();
