'use strict';
/* Wave 37, Creator Mode, milestone 4 (task M4-B; plan "Pack format v1",
   decision F and "Milestone 4"): the rules and freedom dials Pipeline
   reads. rules.rolls over the parser's needsRoll (the engine's own roll
   rules still win); the intimacy roll (the owner's decision 6, "On in Low
   Water too"): a yes to the night rolls charm at normal and its tier shapes
   the night, the yes standing on every tier; /fact refused when the story
   has no facts to buy; the freedom presets (sandbox, guided, rails) through
   Pack.freedom: travel, made places and things, the bookkeeper's
   placesRevealed, /skip, the NUDGE and STEER lines, the story's own reason
   for what it refuses; create.perGame; the card game on or off and its
   stake; permadeath as the story's rule; the shorts in a phase as
   Pipeline counts them. A pack's own values are set on a preview
   (Pack.setPreview, a copy of the built-in pack), the editor's way. Mock
   mode.
   Run with: node tests/run.cjs wave37-freedom */
const assert = require('assert/strict');
const { suite, quickStart, sendText, findScene, place } = require('./helpers.cjs');

const s = suite('wave37-freedom');
const D = 'npc_dewayne';
const J = 'npc_jodie';
const MICAH = 'npc_micah';

/* The built-in pack, copied, with these sections replacing its own (it has
   no rules or freedom of its own: the defaults fill what they leave out). */
function preview(page, over) {
  return page.evaluate(o => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    for (const k of Object.keys(o)) c[k] = o[k];
    P.setPreview(c);
  }, over);
}
/* In the page (wave37-rules' kit): __put (the player somewhere with these
   people, now), __roll (a forced die or tier), __say (a Say line with its
   parse: the roll, the packet and the log entry's roll). */
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
    await G.Pipeline.whenIdle();
    const c = G.Pipeline.lastTurn.ctx;
    return { roll: c.roll ? [c.roll.stat, c.roll.difficulty, c.roll.tier] : null, packet: G.Pipeline.lastTurn.packet.split('\n') };
  };
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
});
async function start(page, opts) {
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, Object.assign({ kinds: [] }, opts || {}));
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  await kit(page);
}
/* One mock Do turn with this parse (and bookkeeper diff) and a forced die:
   its narrator packet, the roll kept in the log, the last notice, the log
   length and where the player is. */
function turn(page, parse, opts) {
  return page.evaluate(async ([p, o]) => {
    const G = Game;
    const here = G.State.npcsAt(G.state.player.locationId).map(n => n.id);
    const parse = Object.assign({ summary: o.input || 'I do it.', targets: [], needsRoll: false, timeCost: 'instant' }, p);
    if (parse.targets === 'here') parse.targets = here.slice(0, 1);
    // A refused turn leaves its queued replies behind: each turn starts from an empty queue.
    G.Api.Mock.clear();
    if (Number.isInteger(o.d20)) G.Pipeline.forceNextRoll(o.d20);
    G.Api.Mock.queue('parse', parse);
    G.Api.Mock.queue('bookkeep', o.book || {});
    G.Api.Mock.calls.length = 0;
    const log0 = G.state.log.length;
    const res = await G.Pipeline.submit(o.input || 'I do it.', { mode: 'do' });
    await G.Pipeline.whenIdle();
    G.Pipeline.forceNextRoll(null);
    const call = G.Api.Mock.calls.filter(c => c.method === 'narrate').pop();
    const lines = call ? call.text.split('\n') : [];
    const e = G.state.log[G.state.log.length - 1];
    const n = [...document.querySelectorAll('#feed .f-notice')].pop();
    return {
      ok: res.ok, reason: res.reason || null, lines, roll: G.state.log.length > log0 && e.roll ? { line: e.roll.line } : null,
      rollLine: lines.find(l => l.startsWith('ROLL:')) || null, notice: n ? n.textContent : null, logged: G.state.log.length - log0, at: G.state.player.locationId
    };
  }, [parse, opts || {}]);
}
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.textContent : null; });
const quietLines = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));

s.test('rules.rolls: never with persuade rolls nothing on a persuade the parser rolled; always with look makes a look roll Wits at normal; the phrase lists match the typed words, lowercased; a search for a thing not here still rolls under never (the engine\'s rule wins)', async h => {
  const page = await h.open();
  await start(page);
  await page.evaluate(d => __put('loc_pittmans', [d], 2, 'afternoon'), D);
  const ask = { actionType: 'persuade', targets: 'here', needsRoll: true, stat: 'charm', difficulty: 'normal' };
  const lw = await turn(page, ask, { d20: 15, input: 'I ask him for a lift.' });
  assert.match(lw.rollLine, /^ROLL: Charm 15/, 'Low Water: the parser\'s persuade rolls');
  const lwLook = await turn(page, { actionType: 'look' }, { d20: 15, input: 'I look around the forecourt.' });
  assert.equal(lwLook.rollLine, 'ROLL: none');

  await preview(page, { rules: { rolls: { never: ['persuade'], always: ['look'], alwaysPhrases: ['Pick The Lock'], neverPhrases: ['ask nicely'] } } });
  const never = await turn(page, ask, { d20: 15, input: 'I ask him for a lift.' });
  assert.equal(never.rollLine, 'ROLL: none', 'never: persuade');
  assert.equal(never.roll, null);
  const always = await turn(page, { actionType: 'look' }, { d20: 15, input: 'I look around the forecourt.' });
  assert.match(always.rollLine, /^ROLL: Wits 15 .*vs 12/, 'always: look, Wits at normal: ' + always.rollLine);
  const phrase = await turn(page, { actionType: 'other', stat: 'stealth' }, { d20: 15, input: 'I try to PICK THE LOCK on the office door.' });
  assert.match(phrase.rollLine, /^ROLL: Stealth 15/, 'alwaysPhrases, whatever the case, with the parser\'s stat: ' + phrase.rollLine);
  const nicely = await turn(page, { actionType: 'talk', targets: 'here', needsRoll: true, stat: 'charm', difficulty: 'normal' }, { d20: 15, input: 'I ask nicely for the key.' });
  assert.equal(nicely.rollLine, 'ROLL: none', 'neverPhrases');
  const unit = await page.evaluate(() => {
    const P = Game.Pipeline;
    const both = { actionType: 'look', needsRoll: false, stat: null, difficulty: null };
    P.rollRules(both, 'I ask nicely and look');
    const kept = { actionType: 'look', needsRoll: false, stat: 'charm', difficulty: 'hard' };
    P.rollRules(kept, 'look');
    return { both, kept };
  });
  assert.equal(unit.both.needsRoll, false, 'a never wins over an always');
  assert.deepEqual([unit.kept.needsRoll, unit.kept.stat, unit.kept.difficulty], [true, 'charm', 'hard'], 'the parser\'s stat and difficulty when it gave them');

  await preview(page, { rules: { rolls: { never: ['search'] } } });
  const search = await turn(page, { actionType: 'search', targets: ['new:a flashlight'], needsRoll: false }, { d20: 15, input: 'I search the shelves for a flashlight.' });
  assert.match(search.rollLine, /^ROLL: Wits 15/, 'a search for a thing not here still rolls: ' + search.rollLine);
});

/* A fresh game, Jodie at every gate (spark 55, romance 45, liking 60, trust
   40, knows 40) at the Low Water in the evening, asked for the night with
   this tier forced (or none: the seeded die): what the roll was, the
   packet's ROLL, OUTCOME and MODE lines, what the night moved and the
   memories it left. */
async function night(h, tier, over) {
  const page = await h.open();
  await start(page);
  if (over) await preview(page, over);
  return page.evaluate(async ([j, t]) => {
    const S = Game.State, st = Game.state;
    S.apply({ npcKnownToPlayer: [j] });
    S.apply({ relSet: { npcId: j, s: 55, m: 45, w: 60, t: 40, k: 40 } });
    __put('loc_low_water', [j], 2, 'evening');
    if (t) __roll(t);
    const t0 = __tr(j);
    const r0 = st.meta.rngCalls;
    const said = await __say(j, 'Stay with me tonight.', { romantic: 'more' });
    const t1 = __tr(j);
    const mems = S.npc(j).memories.filter(m => m.turn === st.meta.turn).map(m => ({ event: m.event, text: m.text, weight: m.weight, private: m.private === true }));
    const e = st.log[st.log.length - 1];
    return {
      roll: said.roll, rollLine: said.packet.find(l => l.startsWith('ROLL:')), outcome: said.packet.filter(l => l.startsWith('OUTCOME:')),
      mode: said.packet.find(l => l.startsWith('MODE:')), yes: said.packet.some(l => /^ROMANCE/.test(l) && /says yes/.test(l)),
      ds: t1.s - t0.s, dm: t1.m - t0.m, dw: t1.w - t0.w, dk: t1.k - t0.k, mems, logRoll: e.roll ? e.roll.line : null, draws: st.meta.rngCalls - r0
    };
  }, [J, tier || null]);
}

s.test('the intimacy roll: a yes to the night rolls Charm at normal on the ROLL line, and the tier shapes it: a critical doubles spark and romance (within the turn\'s 20) with "unforgettable", a success is the row, a partial halves it ("warm but a little awkward"), a failure gains nothing ("does not quite land"), a critical failure leaves a weight-2 awkward memory and a romance dip ("awkward for both of you"); the scene is intimate on every tier', async h => {
  const out = {};
  for (const [t, cheat] of [['critical', 'critical'], ['success', 'success'], ['partial', 'partial'], ['failure', 'failure'], ['critical_failure', 'fumble']]) out[t] = await night(h, cheat);
  for (const [t, r] of Object.entries(out)) {
    assert.equal(r.yes, true, `${t}: the yes stands`);
    assert.deepEqual(r.roll, ['charm', 'normal', t], `${t}: the roll`);
    assert.match(r.rollLine, /^ROLL: Charm \d+/, `${t}: ${r.rollLine}`);
    assert.ok(r.logRoll && /^Charm /.test(r.logRoll), `${t}: the log keeps the roll`);
    assert.match(r.mode, /^MODE: INTIMATE SCENE\./, `${t}: the scene is still told as intimate`);
    assert.ok(!r.outcome.some(l => /the ask (failed|succeeded)/.test(l)), `${t}: no ask OUTCOME: ${JSON.stringify(r.outcome)}`);
    assert.ok(r.mems.some(m => m.event === 'intimate' && m.weight === 3 && m.private), `${t}: the night is kept, private: ${JSON.stringify(r.mems)}`);
  }
  const ok = out.success;
  assert.deepEqual(ok.outcome, [], 'a success says nothing more');
  assert.ok(ok.ds > 0 && ok.dm > 0 && ok.dw > 0, 'the row: ' + JSON.stringify(ok));
  const crit = out.critical;
  assert.match(crit.outcome[0] || '', /^OUTCOME: the night is unforgettable/);
  assert.equal(crit.ds, Math.min(20, 2 * ok.ds), 'spark doubled within the turn\'s cap');
  assert.equal(crit.dm, Math.min(20, 2 * ok.dm), 'romance doubled within the turn\'s cap');
  assert.ok(crit.dw > ok.dw, 'liking more');
  const part = out.partial;
  assert.match(part.outcome[0] || '', /^OUTCOME: the night is warm but a little awkward/);
  assert.ok(Math.abs(part.ds - ok.ds / 2) <= 1 && Math.abs(part.dm - ok.dm / 2) <= 1 && part.ds < ok.ds, 'halved: ' + JSON.stringify([part.ds, part.dm, ok.ds, ok.dm]));
  const fail = out.failure;
  assert.match(fail.outcome[0] || '', /^OUTCOME: the night does not quite land/);
  assert.deepEqual([fail.ds, fail.dm, fail.dw], [0, 0, 0], 'no gain');
  assert.equal(fail.dk, ok.dk, 'what they learn of each other they still learn');
  const bad = out.critical_failure;
  assert.match(bad.outcome[0] || '', /^OUTCOME: the night is awkward for both of you/);
  assert.deepEqual([bad.ds, bad.dw], [0, 0], 'no gain');
  assert.equal(bad.dm, -5, 'a romance dip');
  assert.ok(bad.mems.some(m => m.text === 'an awkward night together' && m.weight === 2 && m.private), 'the awkward memory: ' + JSON.stringify(bad.mems));
  assert.ok(!out.failure.mems.some(m => m.text === 'an awkward night together'), 'only a critical failure leaves it');
});

s.test('intimacyRoll.enabled false is the night as before: no ROLL line, no die drawn for it, the row at scale 1; stat wits at hard rolls Wits at hard; the roll on draws one more die from the seeded Rng than off', async h => {
  const off = await night(h, null, { rules: { romance: { intimacyRoll: { enabled: false } } } });
  assert.equal(off.yes, true);
  assert.equal(off.roll, null);
  assert.equal(off.rollLine, 'ROLL: none');
  assert.deepEqual(off.outcome, []);
  assert.match(off.mode, /^MODE: INTIMATE SCENE\./);
  const ok = await night(h, 'success');
  assert.deepEqual([off.ds, off.dm, off.dw, off.dk], [ok.ds, ok.dm, ok.dw, ok.dk], 'the row as a success has it');
  const on = await night(h, null);
  assert.ok(on.roll, 'Low Water rolls it by default');
  assert.equal(on.draws, off.draws + 1, `one more die: ${on.draws} against ${off.draws}`);
  const wits = await night(h, 'success', { rules: { romance: { intimacyRoll: { stat: 'wits', difficulty: 'hard' } } } });
  assert.deepEqual(wits.roll, ['wits', 'hard', 'success']);
  assert.match(wits.rollLine, /^ROLL: Wits \d+.* vs 15/);
});

s.test('the night\'s roll is the turn\'s: /cheat crit takes the night back and rolls it again as a natural 20 (the yes, the unforgettable OUTCOME, one night kept), and /reroll rolls it again', async h => {
  const page = await h.open();
  await start(page);
  const r = await page.evaluate(async j => {
    const S = Game.State, st = Game.state;
    S.apply({ npcKnownToPlayer: [j] });
    S.apply({ relSet: { npcId: j, s: 55, m: 45, w: 60, t: 40, k: 40 } });
    __put('loc_low_water', [j], 2, 'evening');
    __roll('failure');
    const first = await __say(j, 'Stay with me tonight.', { romantic: 'more' });
    const log = st.log.length;
    Game.Api.Mock.queue('bookkeep', {});
    await Game.Pipeline.submit('/cheat crit');
    await Game.Pipeline.whenIdle();
    const c = Game.Pipeline.lastTurn;
    const crit = { roll: [c.ctx.roll.stat, c.ctx.roll.tier], outcome: c.packet.split('\n').filter(l => l.startsWith('OUTCOME:')), yes: c.packet.includes('says yes'), log: st.log.length, nights: S.npc(j).memories.filter(m => m.event === 'intimate').length };
    Game.Api.Mock.queue('bookkeep', {});
    await Game.Pipeline.submit('/reroll');
    await Game.Pipeline.whenIdle();
    return { first: first.roll, log, crit, again: Game.Pipeline.lastTurn.ctx.roll ? Game.Pipeline.lastTurn.ctx.roll.stat : null, logAfter: st.log.length };
  }, J);
  assert.deepEqual(r.first, ['charm', 'normal', 'failure']);
  assert.deepEqual(r.crit.roll, ['charm', 'critical']);
  assert.match(r.crit.outcome[0] || '', /^OUTCOME: the night is unforgettable/);
  assert.equal(r.crit.yes, true);
  assert.equal(r.crit.log, r.log, 'the night was taken back and told again, not added');
  assert.equal(r.crit.nights, 1, 'one night kept');
  assert.equal(r.again, 'charm');
  assert.equal(r.logAfter, r.log);
});

s.test('a minor is still refused with the roll on and every gate at 0: no yes, no roll, no night kept, the UNDER 18 line', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { rules: { romance: { gates: { spark: 0, romance: 0, trust: 0, knows: 0 }, intimacyRoll: { enabled: true, stat: 'charm', difficulty: 'easy' } } } });
  const r = await page.evaluate(async m => {
    const S = Game.State;
    S.apply({ npcKnownToPlayer: [m] });
    S.apply({ relSet: { npcId: m, w: 60, t: 40, k: 40 } });
    __put('loc_purvis_landing', [m], 2, 'night');
    const said = await __say(m, 'Stay with me tonight.', { romantic: 'more' });
    return { said, minor: Game.Rel.isMinor(S.npc(m)), mem: S.npc(m).memories.filter(x => x.event === 'intimate').length };
  }, MICAH);
  assert.equal(r.minor, true);
  assert.equal(r.said.roll, null);
  const told = r.said.packet.filter(l => /^ROMANCE|^UNDER 18/.test(l));
  assert.ok(!told.some(l => /says yes/.test(l)), JSON.stringify(told));
  assert.ok(!r.said.packet.some(l => /^MODE: INTIMATE/.test(l)), 'no intimate scene');
  assert.ok(r.said.packet.some(l => /^UNDER 18: Micah/.test(l)));
  assert.equal(r.mem, 0);
});

s.test('rules.storyPoints.factAllowed false refuses /fact with "This story has no story points to spend." and spends nothing; the default spends one', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { rules: { storyPoints: { factAllowed: false } } });
  const before = await page.evaluate(() => [Game.state.player.storyPoints, Game.state.log.length]);
  await sendText(page, '/fact the ferryman owes me a favour');
  assert.equal(await lastNotice(page), 'This story has no story points to spend.');
  assert.deepEqual(await page.evaluate(() => [Game.state.player.storyPoints, Game.state.log.length]), before, 'nothing spent, nothing logged');
  await page.evaluate(() => Game.Pack.setPreview(null));
  const r = await page.evaluate(async () => { const p0 = Game.state.player.storyPoints; Game.Api.Mock.queue('parse', { actionType: 'other', summary: 'the mechanic owes me a favour', targets: ['npc_dewayne'], needsRoll: false, timeCost: 'instant', declaresWorldFact: true }); await Game.Pipeline.fact('the mechanic owes me a favour'); await Game.Pipeline.whenIdle(); return [p0, Game.state.player.storyPoints]; });
  assert.equal(r[1], r[0] - 1, 'Low Water: a fact costs a point');
});

const SHACK = 'new:a boat shed by the water';
const BAIT = { placesRevealed: [{ name: 'The Bait Shack', type: 'shop', description: 'A tin shack by the water that sells bait and cold drinks.', nearId: 'loc_pittmans', kind: 'other' }] };
const REASON = "The story keeps to Lockett's Ferry's own places.";

s.test('rails: a walk to an unlisted place is refused with the story\'s reason and nothing is made, the bookkeeper\'s placesRevealed is dropped (in the debug view), /skip to Purvis Landing (the river) is refused with the reason, a walk out of town says the reason, and the packet has a STEER line just before MODE', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { freedom: { preset: 'rails', scopeRefusal: { reason: REASON } } });
  const fr = await page.evaluate(() => Game.Pack.freedom());
  assert.deepEqual([fr.preset, fr.travel, fr.steer, fr.create.places, fr.create.things, fr.scopeRefusal.on, fr.skipAnywhere], ['rails', 'listed', 'steer', false, false, true, false]);
  const n0 = await page.evaluate(() => Game.state.locations.length);
  const walk = await turn(page, { actionType: 'move', targets: [SHACK], timeCost: 'short' }, { input: 'I walk down to the boat shed by the water.' });
  assert.equal(walk.ok, false);
  assert.equal(walk.notice, REASON);
  assert.deepEqual([walk.logged, walk.at], [0, 'loc_pittmans'], 'nothing spent, nobody moved');
  assert.equal(await page.evaluate(() => Game.state.locations.length), n0, 'nothing made');
  // A thing the town has not written is not there either, in the story's words.
  const look = await turn(page, { actionType: 'search', targets: ['new:a flashlight'] }, { d20: 18, input: 'I look for a flashlight.' });
  assert.ok(look.lines.some(l => l.startsWith('NOT PRESENT:') && l.includes('not in this story')), JSON.stringify(look.lines.filter(l => l.startsWith('NOT PRESENT'))));
  assert.ok((await quietLines(page)).includes(REASON), 'the player reads the reason');
  // The bookkeeper's place.
  const told = await turn(page, { actionType: 'talk', targets: ['npc_dewayne'] }, { input: 'Anywhere to buy bait?', book: BAIT });
  assert.equal(told.ok, true);
  const dropped = await page.evaluate(() => ({ made: Game.state.locations.some(l => l.name === 'The Bait Shack'), why: Game.State.debugLog.filter(x => x.path === 'placesRevealed').map(x => x.reason) }));
  assert.equal(dropped.made, false);
  assert.ok(dropped.why.some(x => /keeps to the places it lists/.test(x)), JSON.stringify(dropped.why));
  // /skip.
  await sendText(page, '/skip to Purvis Landing');
  assert.equal(await lastNotice(page), REASON);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), 'loc_pittmans');
  // Out of town.
  const away = await turn(page, { actionType: 'move', destinationId: 'loc_clayburn', targets: ['loc_clayburn'], timeCost: 'long' }, { input: 'I drive to Clayburn.' });
  assert.equal(away.notice, REASON);
  // STEER: the first open thread the player knows, by id.
  const r = await page.evaluate(async () => {
    const st = Game.state;
    for (const t of st.threads) t.knownToPlayer = false;
    const pick = st.threads.filter(t => t.status === 'open').sort((a, b) => (a.id < b.id ? -1 : 1));
    pick[1].knownToPlayer = true;
    pick[2].knownToPlayer = true;
    return { title: pick[1].title, summary: pick[1].summary };
  });
  const steer = await turn(page, { actionType: 'look' }, { input: 'I look around.' });
  const first = r.summary.trim().split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, '');
  const at = steer.lines.findIndex(l => l.startsWith('MODE:'));
  assert.equal(steer.lines[at - 1], `STEER: bring the scene toward "${r.title}": ${first}.`);
  assert.ok(!steer.lines.some(l => l.startsWith('NUDGE:')));
});

s.test('guided: a NUDGE line names the first open thread the player knows; a walk to a place the story would make is refused with "You don\'t know where that is yet. Ask around."; a walk to an undiscovered home is refused as always; a place the story names in passing is still made', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { freedom: { preset: 'guided' } });
  const fr = await page.evaluate(() => Game.Pack.freedom());
  assert.deepEqual([fr.travel, fr.steer, fr.create.places, fr.scopeRefusal.on, fr.skipAnywhere], ['known', 'nudge', true, false, true]);
  const title = await page.evaluate(() => { const st = Game.state; for (const t of st.threads) t.knownToPlayer = false; const t = st.threads.filter(x => x.status === 'open').sort((a, b) => (a.id < b.id ? -1 : 1))[0]; t.knownToPlayer = true; return t.title; });
  const look = await turn(page, { actionType: 'look' }, { input: 'I look around.' });
  const at = look.lines.findIndex(l => l.startsWith('MODE:'));
  assert.equal(look.lines[at - 1], `NUDGE: an open thread the player knows is "${title}"; let it surface if the scene allows.`);
  const n0 = await page.evaluate(() => Game.state.locations.length);
  const walk = await turn(page, { actionType: 'move', targets: [SHACK], timeCost: 'short' }, { input: 'I walk down to the boat shed.' });
  assert.deepEqual([walk.ok, walk.notice, walk.logged, walk.at], [false, "You don't know where that is yet. Ask around.", 0, 'loc_pittmans']);
  assert.equal(await page.evaluate(() => Game.state.locations.length), n0);
  const home = await turn(page, { actionType: 'move', destinationId: 'loc_mangum_house', targets: ['loc_mangum_house'], timeCost: 'short' }, { input: 'I walk to the Mangum house.' });
  assert.deepEqual([home.ok, home.notice], [false, "You don't know where that is yet. Ask around."]);
  // Not a walk: the place is made just off this one.
  const near = await turn(page, { actionType: 'look', targets: [SHACK] }, { input: 'I look over at the boat shed.' });
  assert.equal(near.ok, true);
  assert.equal(await page.evaluate(() => Game.state.locations.length), n0 + 1, 'made, as the sandbox makes it');
});

s.test('sandbox (Low Water): the walk to an unlisted place makes it and goes there, the bookkeeper\'s place is added, /skip to Purvis Landing goes there, and there is no NUDGE or STEER line', async h => {
  const page = await h.open();
  await start(page);
  const fr = await page.evaluate(() => Game.Pack.freedom());
  assert.deepEqual([fr.preset, fr.travel, fr.steer, fr.skipAnywhere], ['sandbox', 'anywhere', 'none', true]);
  await page.evaluate(() => { for (const t of Game.state.threads) t.knownToPlayer = true; });
  const walk = await turn(page, { actionType: 'move', targets: [SHACK], timeCost: 'short' }, { input: 'I walk down to the boat shed by the water.' });
  assert.equal(walk.ok, true);
  assert.notEqual(walk.at, 'loc_pittmans', 'walked to the place made');
  assert.ok(!walk.lines.some(l => /^(NUDGE|STEER):/.test(l)));
  await page.evaluate(() => Game.State.apply({ playerLocationId: 'loc_pittmans' }));
  const told = await turn(page, { actionType: 'talk', targets: ['npc_dewayne'] }, { input: 'Anywhere to buy bait?', book: BAIT });
  assert.equal(told.ok, true);
  assert.equal(await page.evaluate(() => Game.state.locations.some(l => l.name === 'The Bait Shack')), true);
  await sendText(page, '/skip to Purvis Landing');
  assert.equal(await page.evaluate(() => Game.state.player.locationId), 'loc_purvis_landing');
});

s.test('freedom.create.perGame 2: two places are made, the third is not there (NOT PRESENT says so) and the turn goes on; the told-places cap in State is the same dial', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { freedom: { create: { perGame: 2 } } });
  const made = [];
  for (const [i, x] of ['new:a boat shed by the water', 'new:an old barn', 'new:a tackle shop up the lane'].entries()) {
    const r = await turn(page, { actionType: 'look', targets: [x] }, { input: `I look over at the ${x.slice(4)}.` });
    made.push({ ok: r.ok, n: await page.evaluate(() => Game.Town.placesMade()), np: r.lines.find(l => l.startsWith('NOT PRESENT:')) || null, i });
  }
  assert.deepEqual(made.map(m => [m.ok, m.n]), [[true, 1], [true, 2], [true, 2]]);
  // As at Town's own twelve: the narrator hears it does not exist; the cap is the reason the engine noted.
  assert.match(made[2].np || '', /^NOT PRESENT: tackle shop.*does not exist in this town/);
  assert.deepEqual(await page.evaluate(() => Game.Pipeline.createGate('location', { actionType: 'look' }, {})), { why: 'no more new places in this game (2 made already)' });
  const told = await page.evaluate(() => {
    const S = Game.State;
    const one = n => S.apply({ placesRevealed: [{ name: n, type: 'other', description: `A place called ${n}.`, nearId: 'loc_pittmans', kind: 'other' }] });
    return [one('Hollis Yard'), one('Pruitt Lot'), one('Tamsin Barn')].map(r => r.rejected.map(x => x.reason).join('; '));
  });
  assert.deepEqual(told.slice(0, 2), ['', '']);
  assert.match(told[2], /at most 2 places people told you about in one game/);
});

s.test('rules.gamble: enabled false refuses to deal with "There is no card game in this story." and spends nothing; stake 40 is the stake a bet that names none puts up (20 in Low Water)', async h => {
  const page = await h.open();
  await start(page);
  const spot = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
    for (const ph of ['evening', 'night', 'afternoon']) {
      let d = st.time.day;
      while (S.isClosed(l, d)) d++;
      S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
      const dealer = G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id));
      if (dealer) return { loc: l.id, dealer: dealer.id };
    }
    return null;
  });
  assert.ok(spot, 'a table with a dealer');
  const lw = await page.evaluate(() => [Game.Pipeline.gambleStake(), Game.Pipeline.stakeFor('deal me in', 500).stake]);
  assert.deepEqual(lw, [20, 20]);
  await preview(page, { rules: { gamble: { enabled: false } } });
  const g0 = await page.evaluate(() => Game.state.player.gold);
  const r = await turn(page, { actionType: 'gamble', targets: [spot.dealer], timeCost: 'short' }, { input: 'Deal me in.' });
  assert.deepEqual([r.ok, r.reason, r.notice, r.logged], [false, 'no-cards', 'There is no card game in this story.', 0]);
  assert.equal(await page.evaluate(() => Game.state.player.gold), g0);
  assert.equal(await page.evaluate(() => !!document.querySelector('#feed .f-cards')), false, 'no table dealt');
  await preview(page, { rules: { gamble: { stake: 40 } } });
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.gambleStake(), Game.Pipeline.stakeFor('deal me in', 500).stake, Game.Pipeline.stakeFor('deal me in for $30', 500).stake]), [40, 40, 30]);
});

s.test('rules.permadeath true on a preview makes a defeat a death with the global Permadeath setting off', async h => {
  const page = await h.open();
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const sc = await findScene(page, { watchy: false });
  await place(page, sc.loc.id, sc.phase);
  await preview(page, { rules: { permadeath: true } });
  const pre = await page.evaluate(() => [Game.Storage.settings().permadeath, Game.Pack.lookup('rules.permadeath').layer]);
  assert.deepEqual(pre, [false, 'pack']);
  await page.evaluate(() => { Game.State.apply({ hpDelta: 1 - Game.state.player.hp }); Game.Pipeline.forceNextRoll(1); });
  await sendText(page, `I attack ${sc.npcs[0].name}`);
  const p = await page.evaluate(() => Game.state.player);
  assert.equal(p.dead, true);
  assert.equal(p.lastDefeat.outcome, 'dead');
});

s.test('rules.time.shortsPerPhase 2: Pipeline\'s TIME THIS TAKES says the second short moves the clock on, where Low Water keeps the phase until the third', async h => {
  const page = await h.open();
  await start(page);
  const read = () => page.evaluate(() => {
    Game.State.apply({ setTime: { day: 2, phase: 'morning', shorts: 1 } });
    return Game.Pipeline.timeTakes({ action: { timeCost: 'short' } });
  });
  assert.match(await read(), /it will still be morning/);
  await preview(page, { rules: { time: { shortsPerPhase: 2 } } });
  assert.match(await read(), /it will be afternoon when this is done/);
});

s.test('rules.crits false: /cheat crit and /cheat fumble are told "This story has no critical rolls." and nothing is armed; /cheat success still arms', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { rules: { crits: false } });
  for (const w of ['crit', 'fumble']) {
    await sendText(page, `/cheat ${w}`);
    assert.equal(await lastNotice(page), 'This story has no critical rolls.', w);
    assert.equal(await page.evaluate(() => Game.Pipeline.hooks.nextTier || null), null, w);
  }
  await sendText(page, '/cheat success');
  assert.equal(await page.evaluate(() => Game.Pipeline.hooks.nextTier), 'success');
});

s.run();
