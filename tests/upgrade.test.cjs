'use strict';
/* Bringing an older game up to date (Upgrade, Pipeline.updateGame): the
   rules version on new games and old saves, the title screen's "Update this
   game", the Saves screen's Update, Settings' "Re-read this game with the
   latest rules", the memory rewrite in mock mode and against canned API
   replies, failure and refusal, and /undo. Ids and names come from the
   running game, never from one town.
   Run with: node tests/run.cjs upgrade */
const assert = require('assert/strict');
const { suite, quickStart, legacyTown, stateJson, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('upgrade');
const AUTOSAVE = 'novatria.autosave';
const NOTE = 'This game was saved under older rules. You can keep playing, or update it.';

/* Long play-by-play memories in the old style (each over twelve words). */
const A = [
  { turn: 3, weight: 2, text: 'said the bridge vote was rigged and that the county man paid off half the council in cash' },
  { turn: 5, weight: 1, text: 'asked about the weather and whether the diner was still serving breakfast this late in the morning' },
  { turn: 7, weight: 3, text: 'threatened to tell the police about the boat in the back lot if I did not pay up by Friday' },
  { turn: 9, weight: 2, text: 'said the bridge vote was rigged and that the county man paid off the rest of them tonight' },
  { turn: 11, weight: 2, text: 'bought me a beer at the bar after the fight and told me to keep my head down for a while' }
];
const B = [
  { turn: 2, weight: 2, text: 'watched me lose forty dollars at cards in the back room of the bar and laughed about it after' },
  { turn: 4, weight: 2, text: 'helped carry the outboard motor down to the ramp when nobody else in town would lift a finger' },
  { turn: 6, weight: 3, text: 'punched me in the jaw outside the motel when I would not tell him where his brother had gone' },
  { turn: 8, weight: 2, text: 'lied to me about where he was on Tuesday night and then lied again when I caught him out' },
  { turn: 10, weight: 2, text: 'paid back the twenty dollars he owed me from last week without even being asked to do it' },
  { turn: 12, weight: 3, text: 'pulled a knife on me in the parking lot and said next time he would not stop at a warning' },
  { turn: 14, weight: 2, text: 'flirted with me at the counter for most of an hour while the coffee went cold in the pot' },
  { turn: 16, weight: 2, text: 'told everyone at the diner that I was the one who called the police on the Haskell boys' }
];
const C = [
  { turn: 1, weight: 1, text: 'stood around by the pumps talking about nothing much while the rain came down on the lot' },
  { turn: 3, weight: 2, text: 'covered for me with the deputy when he asked who had been in the shop after closing time' },
  { turn: 5, weight: 1, text: 'mentioned the price of gas going up again and how the highway traffic is not what it was' },
  { turn: 7, weight: 3, text: 'dragged me out of the river when the boat went over and sat with me until I could stand' }
];
const LOOSE = { turn: 0, weight: 2, text: 'Loose end with Tester (a debt): I owe someone money and they will want every dollar of it back before long' };
const FACT = { turn: 4, weight: 3, text: "Fact (a story point): this person owes Tester a favour from years back, from before the flood took the old dock away" };

/* A game in the old style, written as the autosave (no rulesVersion, turn 20,
   three people the player knows holding A, B and C; A also has a loose-end
   line and a story-point fact). Then the page reloads to the title screen.
   Resolves to { ids, env } (env as stored). */
async function writeOldAutosave(page, opts = {}) {
  await quickStart(page);
  const out = await page.evaluate(([A, B, C, LOOSE, FACT, key, opts]) => {
    const env = Game.Storage.envelope(opts.name || 'Autosave');
    const st = env.state;
    delete st.meta.rulesVersion;
    st.meta.turn = 20;
    const free = st.npcs.filter(n => !n.memories.length);
    const [a, b, c] = free;
    a.memories = [LOOSE, A[0], A[1], FACT, A[2], A[3], A[4]];
    b.memories = B.slice();
    c.memories = C.slice();
    for (const n of [a, b, c]) n.knownToPlayer = true;
    const json = JSON.stringify(env);
    localStorage.setItem(opts.key || key, json);
    return { ids: [a.id, b.id, c.id], json };
  }, [A, B, C, LOOSE, FACT, AUTOSAVE, opts]);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  return { ids: out.ids, env: JSON.parse(out.json) };
}
/* State JSON without the parts an update may change. */
function rest(json) {
  const st = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  delete st.meta.rulesVersion;
  for (const n of st.npcs) delete n.memories;
  return JSON.stringify(st);
}
const words = t => t.trim().split(/\s+/).length;
const waitIdle = page => page.waitForFunction(() => !Game.Pipeline.busy);

s.test('a new game is stamped with the current rules version; a save without one reads as 1, loads byte for byte and plays', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fresh = await page.evaluate(() => ({ v: Game.state.meta.rulesVersion, current: Game.State.RULES_VERSION, read: Game.State.rulesVersion(Game.state), behind: Game.Upgrade.behind(Game.state) }));
  assert.deepEqual(fresh, { v: 7, current: 7, read: 7, behind: false });
  const { env } = await writeOldAutosave(page);
  assert.equal(await page.evaluate(st => Game.State.rulesVersion(st), env.state), 1, 'no rulesVersion reads as 1');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(page), JSON.stringify(env.state), 'loading adds nothing: the old save is exactly as it was');
  await sendText(page, 'I look around');
  const after = await page.evaluate(() => ({ turn: Game.state.meta.turn, v: Game.state.meta.rulesVersion, behind: Game.Upgrade.behind(Game.state), log: Game.state.log.length }));
  assert.equal(after.turn, 21, 'the old game plays a turn');
  assert.equal(after.v, undefined, 'playing on does not stamp it');
  assert.equal(after.behind, true);
  assert.equal(after.log, env.state.log.length + 1);
  // The engine refuses a rules version from the future and from the model.
  const r = await page.evaluate(() => [Game.State.apply({ rulesVersion: Game.State.RULES_VERSION + 1 }).rejected.length, Game.State.apply({ rulesVersion: 2 }, { source: 'model' }).rejected[0].reason, Game.State.apply({ setMemories: [] }, { source: 'model' }).rejected[0].reason]);
  assert.equal(r[0], 1);
  assert.match(r[1], /not allowed from the model/);
  assert.match(r[2], /not allowed from the model/);
});

s.test('the title screen shows the update line and button only when the autosave is behind, at 375 in both themes too', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const ui = () => page.evaluate(() => ({
    note: !document.getElementById('title-update-note').closest('[hidden]') && document.getElementById('title-update-note').getBoundingClientRect().height > 0,
    btn: !document.getElementById('btn-update').hidden,
    cont: !document.getElementById('btn-continue').disabled
  }));
  assert.deepEqual(await ui(), { note: false, btn: false, cont: false }, 'no autosave');
  await quickStart(page);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.deepEqual(await ui(), { note: false, btn: false, cont: true }, 'a current autosave');
  await writeOldAutosave(page);
  assert.deepEqual(await ui(), { note: true, btn: true, cont: true }, 'an autosave under older rules');
  assert.equal(await page.textContent('#title-update-note'), NOTE);
  assert.equal(await page.textContent('#btn-update'), 'Update this game');
  const geo = await page.evaluate(() => { const a = document.getElementById('btn-continue').getBoundingClientRect(); const b = document.getElementById('btn-update').getBoundingClientRect(); const n = document.getElementById('title-update-note').getBoundingClientRect(); return { sameRow: Math.abs(a.top - b.top) < 1, right: b.left >= a.right, under: n.top >= a.bottom, h: b.height }; });
  assert.deepEqual(geo, { sameRow: true, right: true, under: true, h: 44 }, 'next to Continue, the line under it');

  for (const scheme of ['dark', 'light']) {
    const phone = await h.open({ viewport: PHONE, colorScheme: scheme });
    await writeOldAutosave(phone);
    assert.deepEqual(await overflowReport(phone, 375), [], `title at 375 (${scheme})`);
    const m = await phone.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const cs = getComputedStyle(document.getElementById('title-update-note'));
      return { theme: document.documentElement.dataset.theme, cont: r('btn-continue').height, upd: [r('btn-update').width, r('btn-update').height], color: cs.color, muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() };
    });
    assert.equal(m.theme, scheme === 'dark' ? 'dark' : 'parchment');
    assert.ok(m.cont >= 44 && m.upd[0] >= 44 && m.upd[1] >= 44, 'tap targets: ' + JSON.stringify(m));
    const hex = m.muted.replace('#', '');
    assert.equal(m.color, `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`, 'the quiet line uses the theme\'s muted colour');
  }
});

s.test('"Update this game" in mock mode: long memories become short ones, repeats merge on the earliest turn, at most 6 each; protected lines, everyone else and every other field untouched; stamped and autosaved', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const { ids, env } = await writeOldAutosave(page);
  const before = JSON.stringify(env.state);
  await page.click('#btn-update');
  await page.waitForSelector('#screen-game.active');
  await waitIdle(page);
  const after = await stateJson(page);
  const st = JSON.parse(after);
  const old = JSON.parse(before);
  const mem = id => st.npcs.find(n => n.id === id).memories;
  const [a, b, c] = ids.map(mem);

  // Person A: the loose end and the fact exactly as they were; the two "bridge vote" lines merged on turn 3; the weight-1 small talk gone.
  assert.deepEqual(a.find(m => m.text.startsWith('Loose end with')), LOOSE);
  assert.deepEqual(a.find(m => m.text.startsWith('Fact (a story point):')), FACT);
  const aOpen = a.filter(m => !/^(Loose end with|Fact \(a story point\):)/.test(m.text));
  assert.deepEqual(aOpen.map(m => [m.turn, m.weight]), [[3, 2], [7, 3], [11, 2]], 'A: merged on the earliest turn, weight 1 dropped: ' + JSON.stringify(a));
  assert.deepEqual(a.map(m => m.turn), [0, 3, 4, 7, 11], 'A: oldest first, protected lines in place');
  // Person B: eight notable memories, capped at six (the heaviest, then the newest).
  assert.deepEqual(b.map(m => m.turn), [6, 8, 10, 12, 14, 16], 'B capped at 6: ' + JSON.stringify(b));
  // Person C: only the two that matter.
  assert.deepEqual(c.map(m => [m.turn, m.weight]), [[3, 2], [7, 3]]);
  for (const m of aOpen.concat(b, c)) {
    assert.ok(words(m.text) <= 12, 'short: ' + m.text);
    assert.ok(m.weight >= 2 && m.weight <= 3);
  }
  assert.equal(b[0].text, 'punched me in the jaw outside the motel when I would not', 'the first twelve words');
  // Everyone else's memories and every other field byte for byte.
  for (const n of old.npcs) if (!ids.includes(n.id)) assert.deepEqual(mem(n.id), n.memories, n.id + ' untouched');
  assert.equal(rest(after), rest(before), 'nothing but memories and the rules version changed');
  assert.equal(st.meta.rulesVersion, 7, 'stamped');
  // The feed: the running notice, then the summary (version 2, then version 3, which finds nothing to add, then version 4: the first morning needs no check, then version 5: nobody the game made up is in the story, then version 6: this game already has the whole cast).
  const notices = await page.$$eval('#feed .f-notice', ns => ns.map(n => n.textContent));
  assert.deepEqual(notices.slice(-2), ['Updating this game to the latest rules...', 'Rewrote memories for 3 people: 17 memories became 11. No new places to add. The clock matches the story. People already match the story. The cast is complete. The town is already lived in.']);
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'rewriteMemories').length), 1, 'one call');
  // Autosaved, and the game stays loaded.
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).state, AUTOSAVE);
  assert.equal(JSON.stringify(saved), after, 'autosaved');
  assert.equal(await page.evaluate(() => Game.App.inGame() && Game.UI.screen), 'game');
  // People: the card shows the short line, not the long one.
  await page.evaluate(id => { Game.UI.openPanel('people'); Game.UI.togglePerson(id); }, ids[1]);
  const card = (await page.textContent(`#panel-body [data-npc="${ids[1]}"]`)).toLowerCase();
  assert.ok(card.includes('pulled a knife on me in the parking lot and said next'), card);
  assert.ok(!card.includes('would not stop at a warning'), 'the long line is gone');
  // Continue works as before: the title screen no longer offers the update.
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.ok(await page.isHidden('#btn-update'));
  assert.ok(await page.isHidden('#title-update-note'));
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(page), after);
});

s.test('a queued mock error, or a refusal, leaves the state exactly as it was and says so in the feed', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const { env } = await writeOldAutosave(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const before = await stateJson(page);
  assert.equal(before, JSON.stringify(env.state));
  await page.evaluate(() => Game.Api.Mock.queue('rewriteMemories', { error: { type: 'overloaded_error' } }));
  const r = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual([r.ok, r.reason, r.error], [false, 'error', 'overloaded_error']);
  assert.equal(await stateJson(page), before, 'state unchanged');
  assert.equal(await page.evaluate(k => localStorage.getItem(k), AUTOSAVE).then(x => JSON.stringify(JSON.parse(x).state)), before, 'autosave unchanged');
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), 0, 'no undo step left behind');
  const err = await page.textContent('#feed .f-notice.error:last-child');
  assert.match(err, /overloaded/i);
  assert.match(err, /Nothing was changed/);
  assert.ok(await page.isEnabled('#send'), 'the composer is free again');
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason));
  assert.match(dbg[dbg.length - 1], /failed: overloaded_error/);
  // A refusal: a plain notice, nothing changed.
  await page.evaluate(() => Game.Api.Mock.queue('rewriteMemories', { refusal: true }));
  const r2 = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual([r2.ok, r2.reason], [false, 'refused']);
  assert.equal(await stateJson(page), before);
  assert.match(await page.textContent('#feed .f-notice:last-child'), /declined to re-read this game, so nothing was changed/);
  // Still behind: it can be tried again and then works.
  const r3 = await page.evaluate(() => Game.App.updateGame());
  assert.equal(r3.ok, true);
  assert.equal(await page.evaluate(() => Game.state.meta.rulesVersion), 7);
});

s.test('Settings: the Game section is off with no game, notes an older game, and re-reads a current one; a re-read that changes nothing is not an undo step', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await page.click('#btn-settings');
  assert.ok(await page.isDisabled('#set-reread'), 'no game loaded');
  assert.ok(await page.isVisible('#set-reread-none'));
  assert.equal(await page.textContent('#set-reread'), 'Re-read this game with the latest rules');
  assert.match(await page.textContent('#set-reread-hint'), /new short form.*places people told you about.*sets the clock back if it ran ahead of the story.*fixes people the game made up.*about four API calls/i);
  await page.click('#settings-done');
  // An older game: the note says so.
  await writeOldAutosave(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.click('#tb-settings');
  assert.ok(await page.isEnabled('#set-reread'));
  assert.ok(await page.isVisible('#set-reread-behind'));
  assert.ok(await page.isHidden('#set-reread-none'));
  await page.click('#settings-done');
  // A new game at the current version, with long memories recorded anyway: the button re-runs the rewrite.
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await quickStart(page);
  const id = await page.evaluate(B => {
    const n = Game.state.npcs.find(x => !x.memories.length);
    Game.State.apply({ beginTurn: true });
    Game.State.apply({ newMemories: B.slice(0, 3).map(m => ({ npcId: n.id, text: m.text, weight: m.weight })), npcKnownToPlayer: [n.id] });
    return n.id;
  }, B);
  await page.click('#tb-settings');
  assert.ok(await page.isHidden('#set-reread-behind'), 'a current game is not behind');
  const depth = await page.evaluate(() => Game.State.undoDepth());
  await page.click('#set-reread');
  await page.waitForSelector('#screen-game.active');
  await waitIdle(page);
  const r = await page.evaluate(i => ({ mems: Game.state.npcs.find(n => n.id === i).memories, v: Game.state.meta.rulesVersion, calls: Game.Api.Mock.calls.filter(c => c.method === 'rewriteMemories').length, depth: Game.State.undoDepth() }), id);
  assert.equal(r.v, 7);
  assert.equal(r.calls, 1);
  assert.equal(r.mems.length, 3);
  assert.ok(r.mems.every(m => words(m.text) <= 12 && m.turn === 1), JSON.stringify(r.mems));
  assert.equal(r.depth, depth + 1, 'the re-read is one undo step');
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'Rewrote memories for 1 person: 3 memories became 3. No new places to add. The clock matches the story. People already match the story. The cast is complete. The town is already lived in.');
  // Again: everything is short already, nothing changes, and no undo step is added.
  const same = await stateJson(page);
  await page.click('#tb-settings');
  await page.click('#set-reread');
  await waitIdle(page);
  assert.equal(await stateJson(page), same);
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), depth + 1);
});

s.test('/undo after an update takes back exactly the update, as one step; the turn before it is the next step', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await writeOldAutosave(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const s0 = await stateJson(page);
  await sendText(page, 'I look around');
  const s1 = await stateJson(page);
  await page.click('#tb-settings');
  await page.click('#set-reread');
  await waitIdle(page);
  const s2 = await stateJson(page);
  assert.notEqual(s2, s1);
  assert.equal(rest(s2), rest(s1));
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), s1, 'the pre-update memories (and rules version) are back');
  assert.equal(await page.evaluate(() => Game.Upgrade.behind(Game.state)), true);
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), s0, 'then the turn');
  await sendText(page, '/undo');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /nothing to undo/i);
});

s.test('Saves screen: a slot under older rules says so and has an Update action that loads it, updates it and writes it back; 375 stays tidy', async h => {
  const page = await h.open({ viewport: PHONE });
  const { ids, env } = await writeOldAutosave(page, { key: 'novatria.slot.1', name: 'Old one' });
  // Slot 2: a current save of the same game.
  await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('novatria.slot.1')); e.name = 'New one'; e.state.meta.rulesVersion = Game.State.RULES_VERSION; localStorage.setItem('novatria.slot.2', JSON.stringify(e)); });
  await page.click('#btn-load');
  const rows = await page.evaluate(() => ['slot-1', 'slot-2'].map(id => ({ note: !!document.querySelector(`#${id} .slot-note`), update: !!document.querySelector(`#${id} [data-action="update"]`), text: document.getElementById(id).textContent })));
  assert.deepEqual(rows.map(r => [r.note, r.update]), [[true, true], [false, false]]);
  assert.match(rows[0].text, /Saved under older rules/);
  assert.deepEqual(await overflowReport(page, 375), [], 'saves at 375');
  const small = await page.$$eval('#slot-list button', bs => bs.filter(b => !b.hidden).map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length);
  assert.equal(small, 0);
  await page.click('#slot-1 [data-action="update"]');
  await page.waitForSelector('#screen-game.active');
  await waitIdle(page);
  const st = JSON.parse(await stateJson(page));
  assert.equal(st.meta.rulesVersion, 7);
  assert.equal(st.npcs.find(n => n.id === ids[1]).memories.length, 6);
  assert.equal(rest(st), rest(env.state));
  const slot = await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.slot.1')));
  assert.equal(slot.name, 'Old one', 'written back under its name');
  assert.equal(JSON.stringify(slot.state), JSON.stringify(st), 'the slot holds the updated game');
  assert.equal(JSON.stringify(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).state, AUTOSAVE)), JSON.stringify(st), 'and so does the autosave');
  await page.click('#tb-menu');
  await page.click('[data-menu="saves"]');
  assert.equal(await page.locator('#slot-list .slot-note').count(), 0, 'nothing is behind now');
  assert.deepEqual(await overflowReport(page, 375), [], 'saves at 375 after');
});

s.test('more than about 40 memories go out in several calls, split by person; a person missing from the reply keeps theirs', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(async B => {
    const st = Game.state;
    const free = st.npcs.filter(n => !n.memories.length).slice(0, 6);
    for (let i = 0; i < 12; i++) Game.State.apply({ beginTurn: true });
    for (const n of free) Game.State.apply({ newMemories: B.map(m => ({ npcId: n.id, text: m.text, weight: m.weight })) }); // 8 each, 48 in all
    const groups = Game.Upgrade.chunks(Game.Upgrade.candidates(st)).map(g => g.map(n => n.id));
    // The first call's reply leaves out the first person.
    const auto = Game.Upgrade.memoryPacket(st, free.slice(0, 5)).people.slice(1).map(p => ({ npcId: p.npcId, memories: [{ from: [1, 2], text: 'helped me out once', weight: 2 }] }));
    Game.Api.Mock.calls.length = 0;
    Game.Api.Mock.queue('rewriteMemories', { people: auto.concat([{ npcId: 'npc_nobody', memories: [] }]) });
    const kept = JSON.stringify(free[0].memories);
    const res = await Game.Pipeline.updateGame();
    return { groups, res, calls: Game.Api.Mock.calls.filter(c => c.method === 'rewriteMemories').length, firstSame: JSON.stringify(Game.state.npcs.find(n => n.id === free[0].id).memories) === kept, second: Game.state.npcs.find(n => n.id === free[1].id).memories, debug: Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason) };
  }, B);
  assert.deepEqual(r.groups.map(g => g.length), [5, 1], '40 memories, then the rest');
  assert.equal(r.calls, 2);
  assert.equal(r.res.ok, true);
  assert.equal(r.firstSame, true, 'missing from the reply: left as it was');
  assert.deepEqual(r.second, [{ turn: 12, text: 'helped me out once', weight: 2 }]);
  assert.ok(r.debug.some(x => /missing from the reply/.test(x)) && r.debug.some(x => /npc_nobody, who was not asked about/.test(x)), r.debug.join(' | '));
  assert.equal(r.res.summaries[0].text, 'Rewrote memories for 5 people: 40 memories became 10.');
});

s.test('the real provider: one structured-output call on the parser model at the bookkeeper\'s effort, schema per API_NOTES, the memory rules word for word, and the reply applied', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  let reply = null;
  await page.route('https://api.anthropic.com/v1/messages', async route => {
    const body = JSON.parse(route.request().postData());
    reqs.push({ body, headers: route.request().headers() });
    // Version 3 (places) is the second call; this game's story has none to add.
    const places = !!body.output_config.format.schema.properties.placesRevealed;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': (places ? 'req_places_' : 'req_mem_') + reqs.length },
      body: JSON.stringify({ id: 'msg_m', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(places ? { placesRevealed: [] } : reply) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 900, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
    });
  });
  const { ids } = await writeOldAutosave(page);
  reply = { people: [
    { npcId: ids[0], memories: [{ from: [1, 4], text: 'Told me the bridge vote was rigged.', weight: 2 }, { from: [3], text: 'threatened to go to the police about the boat', weight: 3 }] },
    { npcId: ids[1], memories: [{ from: [6], text: 'pulled a knife on me ' + 'and kept talking about it for a long long time '.repeat(4), weight: 3 }, { from: [], text: 'made up out of nowhere', weight: 3 }, { from: [99], text: 'also made up', weight: 2 }] },
    { npcId: ids[2], memories: [] }
  ] };
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(reqs.length, 2, 'one call for the memories, then one for the places');
  const { body, headers } = reqs[0];
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.equal(headers['x-api-key'], 'sk-ant-test-0123456789');
  assert.equal(body.model, 'claude-sonnet-5-5', 'the parser model');
  assert.equal(body.max_tokens, 8000);
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
  assert.equal(body.output_config.effort, 'medium', "the bookkeeper's effort");
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  const bad = [];
  (function walk(node, where) {
    if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${where}[${i}]`));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      if (node.additionalProperties !== false) bad.push(where + ': additionalProperties');
      if (JSON.stringify((node.required || []).slice().sort()) !== JSON.stringify(Object.keys(node.properties || {}).sort())) bad.push(where + ': required');
    }
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', '$ref']) if (k in node) bad.push(`${where}: ${k}`);
    for (const k of Object.keys(node)) walk(node[k], `${where}.${k}`);
  })(body.output_config.format.schema, 'schema');
  assert.deepEqual(bad, []);
  const sys = await page.evaluate(() => ({ memories: Game.Api.SYSTEM.memories, book: Game.Api.SYSTEM.bookkeeper, rules: Game.Api.MEMORY_RULES }));
  assert.equal(body.system, sys.memories);
  assert.ok(sys.book.endsWith(sys.rules) && sys.memories.includes(sys.rules), 'the bookkeeper\'s memory rules, word for word');
  assert.match(sys.memories, /At most 6 per person/);
  const user = body.messages[0].content;
  assert.match(user, /^PLAYER: Tester\nTURN NOW: 20\n\nPERSON /);
  assert.ok(user.includes(`1. [turn 3, weight 2] ${A[0].text}`) && user.includes(`5. [turn 11, weight 2] ${A[4].text}`), user);
  assert.ok(user.includes(`8. [turn 16, weight 2] ${B[7].text}`));
  assert.ok(!user.includes('Loose end with') && !user.includes('Fact (a story point)'), 'protected lines are not sent');
  const st = await page.evaluate(() => Game.state);
  const mem = id => st.npcs.find(n => n.id === id).memories;
  assert.deepEqual(mem(ids[0]), [LOOSE, { turn: 3, text: 'Told me the bridge vote was rigged', weight: 2 }, FACT, { turn: 7, text: 'threatened to go to the police about the boat', weight: 3 }]);
  const knife = mem(ids[1]);
  assert.equal(knife.length, 1, 'lines with no memory to come from are dropped: ' + JSON.stringify(knife));
  assert.equal(knife[0].turn, 12);
  assert.ok(knife[0].text.length <= 120, 'cut like a bookkeeper memory');
  assert.deepEqual(mem(ids[2]), [], 'nothing worth keeping');
  assert.equal(st.meta.rulesVersion, 7);
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'Rewrote memories for 3 people: 17 memories became 3. No new places to add. The clock matches the story. People already match the story. The cast is complete. The town is already lived in.');
  // The debug view shows the exchange.
  await sendText(page, '/debug');
  const dbg = await page.textContent('#panel-body');
  assert.match(dbg, /memories · via claude · HTTP 200 · request-id req_mem_1/);
  assert.match(dbg, /places · via claude · HTTP 200 · request-id req_places_2/);
  assert.match(dbg, /rules v7/);
});

/* Version 6's line for a save from before the full cast, and a place name
   as the summaries say it ("the Mangum House"). */
const castLine = (people, homes) => `Added the rest of the town's cast, written by hand: ${people} ${people === 1 ? 'person' : 'people'} and ${homes} ${homes === 1 ? 'home' : 'homes'} to find.`;
const the = name => String(name).replace(/^The /, 'the ');

/* A game from before the full cast (legacyTown: only the people the town's
   story names, none of the homes to find, nobody with a home or relations
   on record), saved at rules version opts.version (1: no rulesVersion at
   all), whose log holds, at turn 3, one person telling the player where
   another lives: the owner's own scene (Royce on where Dewayne lives), told
   with this town's people (the owner is the husband of the cast's Mavis
   when the town has one). opts.line replaces the quoted words; opts.summary
   adds a chronicle entry. Then the page reloads to the title screen.
   Resolves to { speaker, owner, place, nowhere (the owner's free phases),
   here, locs, exits (how many the player's place has), people (how many in
   the save), home ({ id, name }: the owner's home in the cast), homes (the
   cast's homes to find), cast and castLocs (the cast's people and places) }. */
async function writeMentionSave(page, opts = {}) {
  await quickStart(page, { kinds: [] });
  await legacyTown(page, { town: true });
  const out = await page.evaluate(([key, opts]) => {
    // Version 7's line for a game from before it (legacyTown: nobody kept has an age or a history, no place its details, the player no age).
    const livedText = (st, T) => {
      const people = st.npcs.filter(n => T.npcs.some(x => x.id === n.id)).length;
      const places = st.locations.filter(l => T.locations.some(x => x.id === l.id)).length;
      const bg = Game.data.BACKGROUNDS.find(b => b.id === st.player.backgroundId);
      return `Filled in the ages and histories of ${people} ${people === 1 ? 'person' : 'people'} and the history, details and hours of ${places} ${places === 1 ? 'place' : 'places'}. ${st.player.name} is ${bg.age}, the age a ${bg.name.toLowerCase()} starts at.`;
    };
    const env = Game.Storage.envelope('Autosave');
    const st = env.state;
    const T = Game.data.TOWN_DATA;
    if (opts.version === 1) delete st.meta.rulesVersion; else st.meta.rulesVersion = opts.version;
    const phases = ['morning', 'afternoon', 'evening', 'night'];
    const nowhere = id => phases.filter(p => !st.locations.some(l => ((l.npcIdsBySchedule || {})[p] || []).includes(id)));
    const first = n => n.name.split(' ')[0];
    const unique = n => st.npcs.filter(m => first(m) === first(n)).length === 1;
    const free = n => n.status === 'free' && unique(n) && nowhere(n.id).length > 0 && nowhere(n.id).length < 4;
    const wife = T.npcs.find(n => first(n) === 'Mavis');
    const tie = wife && (wife.relations || []).find(r => r.relation === 'husband');
    const owner = (tie && st.npcs.find(n => n.id === tie.npcId && free(n))) || st.npcs.find(free);
    const here = Game.State.npcsAt(st.player.locationId).filter(n => n.id !== owner.id);
    const speaker = here[0] || st.npcs.find(n => n.id !== owner.id);
    const line = typeof opts.line === 'string' ? opts.line
      : `${first(owner)}'s is the white house about a mile up the river road, on the left. Now, I'm not saying his wife's gonna be thrilled when you knock.`;
    st.meta.turn = 4;
    if (opts.summary) st.chronicle.push({ fromTurn: 1, toTurn: 2, summary: opts.summary });
    st.log.push({ turn: 3, day: 1, phase: 'morning', input: `Where does ${first(owner)} live? He said I could stay over.`, roll: null,
      narration: `${speaker.name} wipes his hands on a rag. "${line}"`, mode: 'say', to: speaker.id, toName: speaker.name, toLabel: null });
    localStorage.setItem(key, JSON.stringify(env));
    const castHome = T.locations.find(l => l.id === (T.npcs.find(n => n.id === owner.id) || {}).home);
    return {
      speaker: { id: speaker.id, name: speaker.name }, owner: { id: owner.id, name: owner.name }, place: `${first(owner)}'s house`, nowhere: nowhere(owner.id), here: st.player.locationId,
      locs: st.locations.length, exits: st.locations.find(l => l.id === st.player.locationId).exits.length, people: st.npcs.length,
      home: castHome ? { id: castHome.id, name: castHome.name } : null, homes: T.locations.filter(l => l.discovered === false && !l.away).length, out: T.locations.filter(l => l.away).length, cast: T.npcs.length, castLocs: T.locations.length,
      lived: livedText(st, T)
    };
  }, [AUTOSAVE, opts]);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  return out;
}

s.test('version 3 on a save at version 2: a line in the story about where someone lives becomes a heard-of place, with its owner home in their free phases; version 6 folds it into the home the cast has written for them, still heard of; a re-read adds nothing twice; /undo takes the update back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMentionSave(page, { version: 2 });
  assert.ok(m.home, 'the owner has a home in the cast');
  assert.ok(await page.isVisible('#btn-update'), 'a save at version 2 is behind');
  await page.click('#btn-update');
  await page.waitForSelector('#screen-game.active');
  await waitIdle(page);
  const r = await page.evaluate(m => {
    const st = Game.state;
    const l = Game.State.loc(m.home.id);
    return {
      v: st.meta.rulesVersion, calls: Game.Api.Mock.calls.map(c => c.method), l: l ? JSON.parse(JSON.stringify(l)) : null, t: Game.data.TOWN_DATA.locations.find(x => x.id === m.home.id),
      told: st.locations.some(x => x.name === m.place), home: Game.State.npc(m.owner.id).home, locs: st.locations.length, hidden: st.locations.filter(x => !x.discovered).length, out: st.locations.filter(x => x.away).length,
      atHome: ['morning', 'afternoon', 'evening', 'night'].filter(p => Game.State.npcsAt(m.home.id, p).some(n => n.id === m.owner.id))
    };
  }, m);
  assert.equal(r.v, 7, 'stamped 7');
  assert.deepEqual(r.calls.filter(c => c === 'rewriteMemories' || c === 'revealPlaces' || c === 'checkClock' || c === 'fixPeople'), ['revealPlaces'], 'a save at 2 runs versions 3 to 6 in one call (the first morning needs no clock check; nobody the game made up; the cast needs no call)');
  assert.ok(r.l, 'the owner\'s home in the cast is in the game');
  assert.equal(r.told, false, 'the house version 3 made from the story is folded into it: one place, not two');
  assert.equal(r.locs, m.castLocs, 'every place the cast has, and nothing more');
  assert.equal(r.hidden, m.homes - 1 + r.out, 'the other homes are still to find (and the places out of town are never found)');
  assert.deepEqual([r.l.name, r.l.type, r.l.description, r.l.map], [r.t.name, r.t.type, r.t.description, r.t.map], 'as the cast has written it');
  assert.ok(r.t.exits.every(x => r.l.exits.includes(x)), 'its written roads');
  assert.equal(r.l.discovered, true, 'someone told the player about it');
  assert.deepEqual(r.l.revealed, { turn: 3, day: 1, byNpcId: null, ownerNpcId: m.owner.id, kind: 'home', visited: false, authored: true }, 'dated to the turn of the mention');
  assert.deepEqual(r.atHome, m.nowhere, 'the owner is home in every phase they were nowhere');
  assert.deepEqual(r.home, { locationId: m.home.id, phases: m.nowhere, revealed: true });
  assert.equal(await page.textContent('#feed .f-notice:last-child'), `Added 1 place people told you about: ${m.place}. The clock matches the story. People already match the story. ${castLine(m.cast - m.people, m.homes - 1)} ${m.place} is ${the(m.home.name)}. ${m.lived}`);
  // The map and the Places list show it, dashed; the homes nobody has told the player about stay off the map.
  await page.click('#tab-places');
  await page.waitForSelector('.map-svg');
  assert.equal(await page.getAttribute(`.map-place[data-loc="${m.home.id}"]`, 'data-heard'), '1');
  assert.equal(await page.$$eval('.map-place', ns => ns.length), m.castLocs - m.homes - m.out + 1, 'the town and the one home found (never a place out of town)');
  assert.match(await page.textContent('.map-legend'), /Heard of/);
  assert.ok((await page.innerText('#panel-body')).includes(`${m.home.name} (heard of)`));
  // Re-reading the same story finds the place already there: nothing new, nothing changed, no undo step.
  const before = await stateJson(page);
  const depth = await page.evaluate(() => Game.State.undoDepth());
  await page.click('#tb-settings');
  await page.click('#set-reread');
  await waitIdle(page);
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'Nobody had any memories to rewrite. No new places to add. The clock matches the story. People already match the story. The cast is complete. The town is already lived in.');
  assert.equal(await stateJson(page), before, 'a re-read adds nothing twice');
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), depth);
  // /undo takes the update back: no place, no cast, no home, version 2 again.
  await sendText(page, '/undo');
  const u = await page.evaluate(m => ({ v: Game.state.meta.rulesVersion, has: Game.state.locations.some(x => x.name === m.place), cast: !!Game.State.loc(m.home.id), people: Game.state.npcs.length, home: Game.State.npc(m.owner.id).home || null, exits: Game.State.loc(m.here).exits.length, marker: !!document.querySelector('.map-place[data-heard="1"]') }), m);
  assert.deepEqual(u, { v: 2, has: false, cast: false, people: m.people, home: null, exits: m.exits, marker: false });
  assert.equal(await page.evaluate(() => Game.Upgrade.behind(Game.state)), true);
});

s.test('a save at version 1 runs version 2, 3, 4, 5, 6 then 7; with nothing in the story to add, version 3 adds no place, version 6 adds the cast, version 7 fills in the town, and the game is stamped 7', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMentionSave(page, { version: 1, line: "Couldn't tell you. Ask around." });
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true);
  assert.deepEqual(res.summaries.map(x => [x.version, x.title]), [[2, 'Memories that matter'], [3, 'Places people told you about'], [4, 'Clock follows the story'], [5, 'People match the story'], [6, 'A full cast'], [7, 'A lived-in town']]);
  const st = JSON.parse(await stateJson(page));
  assert.equal(st.meta.rulesVersion, 7);
  assert.equal(st.meta.castFixed, true);
  assert.equal(st.locations.length, m.castLocs, 'no place from the story; the cast\'s homes');
  assert.equal(st.locations.filter(l => !l.discovered && !l.away).length, m.homes, 'every home still to find');
  assert.equal(st.npcs.length, m.cast);
  assert.ok(!st.locations.some(l => l.revealed));
  assert.equal(await page.textContent('#feed .f-notice:last-child'), `Nobody had any memories to rewrite. No new places to add. The clock matches the story. People already match the story. ${castLine(m.cast - m.people, m.homes)} ${m.lived}`);
  assert.deepEqual(await page.evaluate(() => Game.Api.Mock.calls.map(c => c.method).filter(x => x === 'revealPlaces')), ['revealPlaces']);
});

s.test('version 3 against the real provider: one structured-output call on the parser model with the story, the places and the people; the bookkeeper\'s place rule word for word; duplicates are refused, an unknown nearId falls back to here', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  let reply = null;
  await page.route('https://api.anthropic.com/v1/messages', async route => {
    const body = JSON.parse(route.request().postData());
    reqs.push(body);
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': 'req_places_' + reqs.length },
      body: JSON.stringify({ id: 'msg_p', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(reply) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 1200, output_tokens: 150, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
    });
  });
  const m = await writeMentionSave(page, { version: 2, summary: 'Tester came in on the highway and asked about work at the bar.' });
  const town = await page.evaluate(() => Game.data.TOWN_DATA.locations.map(l => l.name));
  reply = { placesRevealed: [
    { name: m.place, type: 'house', description: 'A white house about a mile up the river road, on the left.', nearId: 'loc_nowhere', ownerNpcId: m.owner.id, kind: 'home', turn: 3 },
    { name: m.place.replace(/'s house$/, 's place'), type: 'house', description: 'The same house again.', nearId: m.here, ownerNpcId: null, kind: 'other', turn: null },
    { name: 'the ' + town[0].toLowerCase(), type: 'other', description: 'Already in town.', nearId: m.here, ownerNpcId: null, kind: 'other', turn: 99 }
  ] };
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(reqs.length, 1, 'one call (a save at 2 runs versions 3 to 6; the first morning needs no clock check, nobody the game made up is in the story, and the cast needs no call)');
  const body = reqs[0];
  assert.equal(body.model, 'claude-sonnet-5-5', 'the parser model');
  assert.equal(body.max_tokens, 6000);
  assert.equal(body.output_config.effort, 'medium', "the bookkeeper's effort");
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
  const bad = [];
  (function walk(node, where) {
    if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${where}[${i}]`));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      if (node.additionalProperties !== false) bad.push(where + ': additionalProperties');
      if (JSON.stringify((node.required || []).slice().sort()) !== JSON.stringify(Object.keys(node.properties || {}).sort())) bad.push(where + ': required');
    }
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', '$ref']) if (k in node) bad.push(`${where}: ${k}`);
    for (const k of Object.keys(node)) walk(node[k], `${where}.${k}`);
  })(body.output_config.format.schema, 'schema');
  assert.deepEqual(bad, []);
  const item = body.output_config.format.schema.properties.placesRevealed.items;
  assert.deepEqual(Object.keys(item.properties), ['name', 'type', 'description', 'nearId', 'ownerNpcId', 'kind', 'turn'], "the bookkeeper's shape plus the turn");
  const sys = await page.evaluate(() => ({ places: Game.Api.SYSTEM.places, book: Game.Api.SYSTEM.bookkeeper, rule: Game.Api.PLACE_RULE, bookItem: Object.keys(Game.Api.SCHEMAS.record_changes.properties.placesRevealed.items.properties) }));
  assert.equal(body.system, sys.places);
  assert.ok(sys.places.includes(sys.rule) && sys.book.includes(sys.rule + ' At most one per turn.'), 'the place rule, word for word, in both');
  assert.deepEqual(sys.bookItem, ['name', 'type', 'description', 'nearId', 'ownerNpcId', 'kind']);
  const user = body.messages[0].content;
  assert.match(user, new RegExp(`^PLAYER: Tester; now at ${m.here} \\(`));
  assert.ok(user.includes('PLACES (the places list): ') && user.includes(`${m.here} — `), 'the places, by id and name');
  assert.ok(user.includes(`PEOPLE: `) && user.includes(`${m.owner.id} — ${m.owner.name}`), 'the people, by id and name');
  assert.ok(user.includes('SUMMARY of turns 1 to 2: Tester came in on the highway and asked about work at the bar.'), 'summaries, labelled');
  assert.ok(user.includes(`TURN 3 (day 1, morning)\nPLAYER SAID (to ${m.speaker.name}): "Where does `), 'each turn: what the player did');
  assert.ok(user.includes(`is the white house about a mile up the river road, on the left.`), 'and the narration');
  const st = await page.evaluate(() => Game.state);
  const made = st.locations.filter(l => l.revealed);
  assert.deepEqual(made.map(l => l.id), [m.home.id], 'one place (the repeat and the existing place are refused), folded by version 6 into the owner\'s home in the cast');
  assert.equal(made[0].revealed.turn, 3);
  assert.equal(st.meta.rulesVersion, 7);
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason).join('\n'));
  assert.match(dbg, /nearId loc_nowhere is not a known place/);
  assert.match(dbg, /place not added \(placesRevealed\[1\]\): already a place/);
  assert.match(dbg, /place not added \(placesRevealed\[2\]\): already a place/);
  assert.equal(await page.textContent('#feed .f-notice:last-child'), `Added 1 place people told you about: ${m.place}. The clock matches the story. People already match the story. ${castLine(m.cast - m.people, m.homes - 1)} ${m.place} is ${the(m.home.name)}. ${m.lived}`);
});

/* The owner's night at Dewayne's house, saved at rules version 3 with the
   clock already ticked into day 2 morning: the turn before ends with him
   going into the back bedroom, the last turn is the bedroom itself (word for
   word). opts.last replaces the last narration. Then the page reloads to the
   title screen. Resolves to the state as stored. */
const LAMP = 'Dewayne nods at the couch. "Blanket\'s in the closet." He goes into the back bedroom and leaves the door open, and the lamp clicks on.';
const BEDROOM = 'You head down the hall after him. The back bedroom\'s small, with one lamp on the nightstand and the bed only made on one side. Dewayne\'s sitting on the edge working his boots off, and he drops one on the floor and looks up at you. "Shut the door behind you," he says. "I know nobody\'s here. Just do it."';
async function writeNightSave(page, opts = {}) {
  await quickStart(page, { kinds: [] });
  const json = await page.evaluate(([key, LAMP, BEDROOM, opts]) => {
    const env = Game.Storage.envelope('Autosave');
    const st = env.state;
    st.meta.rulesVersion = 3;
    st.meta.turn = 12;
    st.time = { day: 2, phase: 'morning', shorts: 0 };
    st.log.push(
      { turn: 9, day: 1, phase: 'night', input: 'I tell Dewayne I could use somewhere to sleep', roll: null, narration: 'Dewayne shrugs and unlocks the front door. "Couch is yours."', mode: 'do' },
      { turn: 10, day: 1, phase: 'night', input: 'I follow him inside', roll: null, narration: LAMP, mode: 'do' },
      { turn: 11, day: 2, phase: 'morning', input: 'Go to the back bedroom and let him lead', roll: null, narration: opts.last || BEDROOM, mode: 'do' }
    );
    const json = JSON.stringify(env);
    localStorage.setItem(key, json);
    return JSON.stringify(st);
  }, [AUTOSAVE, LAMP, BEDROOM, opts]);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  return json;
}
/* State JSON without the clock and the rules version. */
function noClock(json) {
  const st = typeof json === 'string' ? JSON.parse(json) : JSON.parse(JSON.stringify(json));
  delete st.time;
  delete st.meta.rulesVersion;
  return JSON.stringify(st);
}

s.test('version 4 on a save at version 3: the clock ran into day 2 morning during the bedroom scene, and the update sets it back to day 1 night (late); nothing else changes; /undo takes it back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const before = await writeNightSave(page);
  assert.ok(await page.isVisible('#btn-update'), 'a save at version 3 is behind');
  await page.click('#btn-update');
  await page.waitForSelector('#screen-game.active');
  await waitIdle(page);
  const after = await stateJson(page);
  const st = JSON.parse(after);
  assert.deepEqual(st.time, { day: 1, phase: 'night', shorts: 2, late: true }, 'night again, late in it');
  assert.equal(st.meta.rulesVersion, 7);
  assert.equal(noClock(after), noClock(before), 'everything else byte for byte');
  const r = await page.evaluate(() => ({
    calls: Game.Api.Mock.calls.map(c => c.method), packet: Game.Api.Mock.calls.filter(c => c.method === 'checkClock').pop().text,
    feed: [...document.querySelectorAll('#feed .f-item')].slice(-3).map(n => n.textContent), bar: document.getElementById('tb-time').textContent,
    narr: Game.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n').find(l => / · Location: /.test(l)),
    dbg: Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason).join(' | '),
    saved: JSON.parse(localStorage.getItem('novatria.autosave')).state.time
  }));
  assert.deepEqual(r.calls, ['checkClock'], 'a save at 3 runs versions 4, 5 and 6, in one call (nobody the game made up; the cast is all there)');
  assert.match(r.packet, /^CLOCK NOW: day 2, morning \(early in the phase; 0 of 3 short actions gone\)\n/);
  assert.ok(r.packet.indexOf('TURN 10 (day 1, night)') < r.packet.indexOf('TURN 11 (day 2, morning)\nPLAYER: Go to the back bedroom and let him lead'), 'oldest first');
  assert.ok(r.packet.includes('the lamp clicks on.') && r.packet.includes('"Shut the door behind you," he says.'));
  assert.deepEqual(r.feed, ['Updating this game to the latest rules...', 'Set the clock back to day 1, night: the story had not reached morning. People already match the story. The cast is complete. The town is already lived in.', 'Day 1 · Night']);
  assert.equal(r.bar, 'Day 1 · Night');
  assert.ok(r.narr.startsWith('DAY 1 (Thursday 8 October), NIGHT (late; the player has not slept) · Location: '), r.narr);
  assert.match(r.dbg, /clock: day 2, morning -> day 1, night/);
  assert.deepEqual(r.saved, st.time, 'autosaved');
  // Playing on: a short stays at night.
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I shut the door behind me');
  assert.deepEqual(await page.evaluate(() => Game.state.time), { day: 1, phase: 'night', shorts: 2, late: true });
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), after);
  // /undo takes the update back: day 2 morning, version 3.
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), before, 'exactly the save as it was');
  assert.equal(await page.evaluate(() => document.getElementById('tb-time').textContent), 'Day 2 · Morning');
  assert.equal(await page.evaluate(() => Game.Upgrade.behind(Game.state)), true);
});

s.test('version 4: a save whose story matches its clock is left as it is and stamped 7; a reply that would move the clock forward is ignored; a re-read of a fixed clock changes nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const before = await writeNightSave(page, { last: 'The diner is loud with the breakfast crowd, and somebody is burning toast behind the counter.' });
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true);
  assert.deepEqual(res.summaries.map(x => [x.version, x.title, x.text]), [[4, 'Clock follows the story', 'The clock matches the story.'], [5, 'People match the story', 'People already match the story.'], [6, 'A full cast', 'The cast is complete.'], [7, 'A lived-in town', 'The town is already lived in.']]);
  const st = JSON.parse(await stateJson(page));
  assert.deepEqual(st.time, { day: 2, phase: 'morning', shorts: 0 });
  assert.equal(st.meta.rulesVersion, 7, 'stamped');
  assert.equal(noClock(st), noClock(before));
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'The clock matches the story. People already match the story. The cast is complete. The town is already lived in.');
  assert.deepEqual(await page.evaluate(() => Game.Api.Mock.calls.map(c => c.method)), ['checkClock']);
  // The clock never moves forward: a later phase on the same day is ignored...
  await page.evaluate(() => Game.Api.Mock.queue('checkClock', { behind: true, phase: 'evening', dayOffset: 0, reason: 'It is evening.' }));
  const fwd = await page.evaluate(() => Game.App.updateGame());
  assert.equal(fwd.ok, true);
  assert.deepEqual(await page.evaluate(() => Game.state.time), { day: 2, phase: 'morning', shorts: 0 });
  assert.match(await page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason).join(' | ')), /not earlier than day 2, morning; the clock never moves forward/);
  // ...and an earlier phase that is not night is set late in its phase, without the late-night flag.
  await page.evaluate(() => Game.Api.Mock.queue('checkClock', { behind: true, phase: 'evening', dayOffset: -1, reason: 'Still the evening before.' }));
  const back = await page.evaluate(() => Game.App.updateGame());
  assert.equal(back.summaries.find(x => x.version === 4).text, 'Set the clock back to day 1, evening: the story had not reached morning.');
  assert.deepEqual(await page.evaluate(() => Game.state.time), { day: 1, phase: 'evening', shorts: 2 });
  // A re-read of a clock the story fits: nothing changes and no undo step.
  const same = await stateJson(page);
  const depth = await page.evaluate(() => Game.State.undoDepth());
  await page.click('#tb-settings');
  await page.click('#set-reread');
  await waitIdle(page);
  assert.equal(await stateJson(page), same);
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), depth);
});

s.test('version 4 against the real provider: one structured-output call on the parser model with the clock and the last six turns; the reply applied; a refusal changes nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  let reply = { behind: true, phase: 'night', dayOffset: -1, reason: 'He is taking his boots off for bed; nobody has slept yet.' };
  let refuse = false;
  await page.route('https://api.anthropic.com/v1/messages', async route => {
    const body = JSON.parse(route.request().postData());
    reqs.push(body);
    const content = refuse ? [] : [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(reply) }];
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': 'req_clock_' + reqs.length },
      body: JSON.stringify({ id: 'msg_c', type: 'message', role: 'assistant', model: body.model, content, stop_reason: refuse ? 'refusal' : 'end_turn', stop_details: refuse ? { type: 'refusal', category: 'test', explanation: 'no' } : null, usage: { input_tokens: 700, output_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
    });
  });
  const before = await writeNightSave(page);
  // More history than the packet sends: only the last six turns go.
  await page.evaluate(key => {
    const env = JSON.parse(localStorage.getItem(key));
    for (let i = 1; i <= 4; i++) env.state.log.splice(i, 0, { turn: i, day: 1, phase: 'evening', input: `Old turn ${i}`, roll: null, narration: `Old narration ${i}.`, mode: 'do' });
    localStorage.setItem(key, JSON.stringify(env));
  }, AUTOSAVE);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  // A refusal first: nothing changes.
  refuse = true;
  const s0 = await stateJson(page);
  const r0 = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual([r0.ok, r0.reason], [false, 'refused']);
  assert.equal(await stateJson(page), s0);
  refuse = false;
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(reqs.length, 2, 'one call each time');
  const body = reqs[1];
  assert.equal(body.model, 'claude-sonnet-5-5', 'the parser model');
  assert.equal(body.max_tokens, 3000);
  assert.equal(body.output_config.effort, 'medium', "the bookkeeper's effort");
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
  assert.equal(body.output_config.format.type, 'json_schema');
  const schema = body.output_config.format.schema;
  assert.deepEqual(schema.required, ['behind', 'phase', 'dayOffset', 'reason']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.behind.type, 'boolean');
  assert.deepEqual(schema.properties.phase.enum, ['morning', 'afternoon', 'evening', 'night']);
  assert.deepEqual([schema.properties.dayOffset.type, schema.properties.dayOffset.enum], ['integer', [0, -1]]);
  assert.equal(schema.properties.reason.type, 'string');
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength']) assert.ok(!JSON.stringify(schema).includes(`"${k}"`), k);
  assert.equal(body.system, await page.evaluate(() => Game.Api.SYSTEM.clock));
  const user = body.messages[0].content;
  assert.match(user, /^CLOCK NOW: day 2, morning \(early in the phase; 0 of 3 short actions gone\)\nPHASES, in order: morning, afternoon, evening, night, then the next day's morning\.\n/);
  const turns = user.match(/^TURN \d+/gm);
  assert.equal(turns.length, 6, 'the last six turns: ' + turns.join(', '));
  assert.ok(!user.includes('Old turn 1') && user.includes('Old turn 2') && user.indexOf('Old turn 2') < user.indexOf('Old turn 4'), 'the oldest are left out; oldest first');
  assert.ok(user.trim().endsWith(BEDROOM), 'the latest narration last');
  const st = JSON.parse(await stateJson(page));
  assert.deepEqual(st.time, { day: 1, phase: 'night', shorts: 2, late: true });
  assert.equal(st.meta.rulesVersion, 7);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#feed .f-item')].slice(-2).map(n => n.textContent)), ['Set the clock back to day 1, night: the story had not reached morning. People already match the story. The cast is complete. The town is already lived in.', 'Day 1 · Night']);
  assert.match(await page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason).join(' | ')), /clock: day 2, morning -> day 1, night \(He is taking his boots off for bed; nobody has slept yet\.\)/);
});

/* The owner's Mavis, saved at rules version 4, from before the full cast
   (legacyTown): the tables made "Mavis Toler" a man (no pronouns, role
   "Man") when the player first asked for her, while the story calls her the
   owner's wife. The owner is a man in this town with a unique first name
   and a house someone told the player about: the husband of the cast's
   Mavis when the town has one (Dewayne), else the first who fits. One
   narration is the speaker's line on where he lives ("his wife Mavis"), one
   is the owner's own ("My wife Mavis works the night counter at the motor
   court"). opts.plain leaves Mavis and the lines out; opts.noHouse leaves
   the told house out too; opts.stranger adds someone the game made up whom
   nobody in the cast matches and the story never names. Then the page
   reloads to the title screen. Resolves to { owner, house, here, json,
   wife (the cast's Mavis: id, name, role, look, home phases), home ({ id,
   name }: the owner's home in the cast), homes, cast, people }. */
async function writeMavisSave(page, opts = {}) {
  await quickStart(page, { kinds: [] });
  await legacyTown(page, { town: true });
  const out = await page.evaluate(([key, opts]) => {
    // Version 7's line for a game from before it (legacyTown: nobody kept has an age or a history, no place its details, the player no age).
    const livedText = (st, T) => {
      const people = st.npcs.filter(n => T.npcs.some(x => x.id === n.id)).length;
      const places = st.locations.filter(l => T.locations.some(x => x.id === l.id)).length;
      const bg = Game.data.BACKGROUNDS.find(b => b.id === st.player.backgroundId);
      return `Filled in the ages and histories of ${people} ${people === 1 ? 'person' : 'people'} and the history, details and hours of ${places} ${places === 1 ? 'place' : 'places'}. ${st.player.name} is ${bg.age}, the age a ${bg.name.toLowerCase()} starts at.`;
    };
    const S = Game.State;
    const st = Game.state;
    const T = Game.data.TOWN_DATA;
    const phases = ['morning', 'afternoon', 'evening', 'night'];
    const nowhere = id => phases.filter(p => !st.locations.some(l => ((l.npcIdsBySchedule || {})[p] || []).includes(id)));
    const first = n => n.name.split(' ')[0];
    const unique = n => st.npcs.filter(m => first(m) === first(n)).length === 1;
    const free = n => n.status === 'free' && n.pronouns === 'he' && unique(n) && nowhere(n.id).length > 0 && nowhere(n.id).length < 4;
    const wife = T.npcs.find(n => first(n) === 'Mavis');
    const tie = wife && (wife.relations || []).find(r => r.relation === 'husband');
    const owner = (tie && st.npcs.find(n => n.id === tie.npcId && free(n))) || st.npcs.find(free);
    const here = st.player.locationId;
    const speaker = S.npcsAt(here).find(n => n.id !== owner.id) || st.npcs.find(n => n.id !== owner.id);
    S.apply({ beginTurn: true });
    const house = opts.noHouse ? null : S.apply({ placesRevealed: [{ name: `${first(owner)}'s house`, type: 'house', description: 'The white house about a mile up the river road, on the left.', nearId: here, ownerNpcId: owner.id, kind: 'home' }] }).revealed[0];
    const env = Game.Storage.envelope('Autosave');
    const s = env.state;
    s.meta.rulesVersion = 4;
    s.meta.turn = 5;
    if (opts.stranger) {
      s.npcs.push({ id: 'npc_rusty_fenwick', name: 'Rusty Fenwick', pronouns: 'he', role: 'Tow truck driver', factionId: null, tags: [], look: 'A heavy man in a grease-stained cap.', voice: 'Talks around a toothpick.', personality: ['slow', 'honest'], goal: 'to get paid for the tow', secret: '', attitude: 5, memories: [], alive: true, knownToPlayer: true, status: 'free', created: { by: 'story', turn: 2, locationId: here, relationToNpcId: null, relation: null } });
      for (const p of phases) s.locations.find(l => l.id === here).npcIdsBySchedule[p].push('npc_rusty_fenwick');
    }
    if (!opts.plain) {
      // As the tables made her before this version: a man, no pronouns, at the place she was first asked for, in every phase.
      s.npcs.push({ id: 'npc_mavis_toler', name: 'Mavis Toler', role: 'Man', factionId: null, tags: [], look: 'A man with a bitter look about them.', voice: "says 'I tell you what' before every opinion", personality: ['bitter', 'nosy'], goal: 'to be left alone', secret: '', attitude: -10, memories: [{ turn: 4, text: 'woke me up knocking', weight: 2 }], alive: true, knownToPlayer: true, status: 'free', home: { locationId: here, phases } });
      for (const p of phases) s.locations.find(l => l.id === here).npcIdsBySchedule[p].push('npc_mavis_toler');
      if (opts.contaminated) {
        // The owner's actual game: the wife is first mentioned without a name, named once by her husband, and then, after the
        // player "corrected" the story to match the wrong record, called he for turns on end and made to say she is his husband.
        s.meta.turn = 7;
        s.log.push(
          { turn: 2, day: 1, phase: 'morning', input: `Where does ${first(owner)} live? He said I could stay over.`, roll: null, mode: 'say', to: speaker.id, toName: speaker.name, toLabel: null,
            narration: `${speaker.name} wipes his hands on a rag. "${first(owner)}'s is the white house about a mile up the river road, on the left. Now, I'm not saying his wife's gonna be thrilled when you knock."` },
          { turn: 3, day: 1, phase: 'morning', input: 'Who else is here?', roll: null, mode: 'say', to: owner.id, toName: owner.name, toLabel: null,
            narration: `${owner.name} opens the door in his socks. "That's my wife Mavis you hear in there," he says. "She works the night counter at the motor court."` },
          { turn: 4, day: 1, phase: 'morning', input: 'You mean he. Mavis is a man.', roll: null, mode: 'say', to: owner.id, toName: owner.name, toLabel: null,
            narration: `"He," ${first(owner)} says slowly, looking at you. "Right. Mavis. He's inside." He scratches his neck and does not open the door any wider.` },
          { turn: 5, day: 1, phase: 'afternoon', input: 'I ask Mavis who Dewayne is to him.', roll: null, mode: 'say', to: 'npc_mavis_toler', toName: 'Mavis Toler', toLabel: null,
            narration: `Mavis Toler looks you over from the doorway. "${first(owner)}'s my husband. The one whose couch you just got up off of." He pulls out his phone and thumbs it open.` }
        );
      } else s.log.push(
        { turn: 3, day: 1, phase: 'morning', input: `Where does ${first(owner)} live? He said I could stay over.`, roll: null, mode: 'say', to: speaker.id, toName: speaker.name, toLabel: null,
          narration: `${speaker.name} wipes his hands on a rag. "${first(owner)}'s is the white house about a mile up the river road, on the left. Now, I'm not saying his wife Mavis is gonna be thrilled when you knock."` },
        { turn: 4, day: 1, phase: 'morning', input: 'I knock and ask for Mavis.', roll: null, mode: 'do',
          narration: `${first(owner)} opens the door in his socks and squints at you. "My wife Mavis works the night counter at the motor court," he says. "She won't be up till noon, and she won't thank you for it."` }
      );
    }
    const json = JSON.stringify(env);
    localStorage.setItem(key, json);
    const homeOf = id => (T.npcs.find(n => n.id === id) || {}).home;
    const loc = id => T.locations.find(l => l.id === id);
    const home = loc(homeOf(owner.id));
    return {
      owner: { id: owner.id, name: owner.name, first: first(owner) }, house, here, json: JSON.stringify(s),
      wife: wife && tie && tie.npcId === owner.id ? { id: wife.id, name: wife.name, role: wife.role, look: wife.look, age: wife.age, history: wife.history, home: wife.home, phases: phases.filter(p => loc(wife.home).npcIdsBySchedule[p].includes(wife.id)) } : null,
      home: home ? { id: home.id, name: home.name } : null, homes: T.locations.filter(l => l.discovered === false && !l.away).length, cast: T.npcs.length, people: s.npcs.length,
      lived: livedText(st, T)
    };
  }, [AUTOSAVE, opts]);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  return out;
}
/* Where the town's schedule has someone in each phase, and where the game has them. */
function whereabouts(page, id) {
  return page.evaluate(id => {
    const phases = ['morning', 'afternoon', 'evening', 'night'];
    const T = Game.data.TOWN_DATA;
    return {
      cast: phases.map(p => (T.locations.find(l => (l.npcIdsBySchedule[p] || []).includes(id)) || {}).id || null),
      game: phases.map(p => (Game.state.locations.find(l => Game.State.npcsAt(l.id, p).some(n => n.id === id)) || {}).id || null)
    };
  }, id);
}

s.test('versions 5, 6 and 7 on a save at version 4: a tables-made "Mavis Toler", a man, whom the story calls the owner\'s wife becomes she/her, his wife (5), then the cast\'s own Mavis, at the home the cast has written for them (6), keeping her memories, with her age and history (7); /undo takes it back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMavisSave(page);
  assert.ok(m.wife && m.home, 'the cast has the owner\'s wife and home');
  assert.ok(await page.isVisible('#btn-update'), 'a save at version 4 is behind');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const loaded = await stateJson(page);
  const before = await page.evaluate(() => JSON.parse(JSON.stringify(Game.State.npc('npc_mavis_toler'))));
  assert.equal(before.pronouns, 'he', 'loading gives her pronouns by the old record: a man');
  assert.deepEqual(await page.evaluate(() => Game.Upgrade.madeUp(Game.state).map(n => n.id)), ['npc_mavis_toler'], 'version 5 treats the cast as the town\'s own people');
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(res.summaries.map(x => [x.version, x.title]), [[5, 'People match the story'], [6, 'A full cast'], [7, 'A lived-in town']]);
  const r = await page.evaluate(m => {
    const S = Game.State;
    return {
      gone: !S.npc('npc_mavis_toler'), n: JSON.parse(JSON.stringify(S.npc(m.wife.id))), v: Game.state.meta.rulesVersion, fixed: Game.state.meta.castFixed, people: Game.state.npcs.length,
      calls: Game.Api.Mock.calls.map(c => c.method), packet: Game.Api.Mock.calls.filter(c => c.method === 'fixPeople').pop().text,
      home: JSON.parse(JSON.stringify(S.loc(m.home.id))), told: Game.state.locations.some(l => l.id === m.house),
      feed: document.querySelector('#feed .f-notice:last-child').textContent, cast: Game.Pipeline.castBlock(), ties: S.tiesOf(S.npc(m.owner.id)).has.map(x => [x.id, x.relation])
    };
  }, m);
  assert.equal(r.v, 7, 'stamped 7');
  assert.equal(r.fixed, true, 'and the cast is fixed');
  assert.deepEqual(r.calls.filter(c => c === 'fixPeople'), ['fixPeople'], 'one call (version 6 makes none)');
  assert.ok(r.packet.includes('PERSON npc_mavis_toler (made by the game from random tables when the player first asked for them)\n  name: Mavis Toler\n  pronouns: he/him\n  role: Man\n'), r.packet);
  assert.ok(r.packet.includes("his wife Mavis is gonna be thrilled") && r.packet.includes('My wife Mavis works the night counter'), 'every narration that names her');
  assert.ok(r.packet.includes(`PEOPLE (everyone in the game): `) && r.packet.includes(`${m.owner.id} — ${m.owner.name} (he/him; `), 'everyone, with pronouns');
  assert.equal(r.feed, `Fixed 1 person to match the story: Mavis Toler is ${m.owner.first}'s wife (she/her). ${castLine(m.cast - m.people + 1, m.homes - 1)} ${m.owner.first}'s house is ${the(m.home.name)}. Mavis Toler is now ${m.wife.name} (${m.owner.first}'s wife). ${m.lived}`);
  // One Mavis: the cast's, with what the old game knew about her.
  assert.equal(r.gone, true, 'the made-up record is gone');
  assert.equal(r.people, m.cast, 'exactly the cast');
  assert.deepEqual([r.n.name, r.n.pronouns, r.n.role, r.n.look], [m.wife.name, 'she', m.wife.role, m.wife.look], 'the cast\'s own record');
  assert.deepEqual(r.n.memories, before.memories, 'her memories kept');
  assert.deepEqual([r.n.knownToPlayer, r.n.attitude], [true, before.attitude], 'met, and as she felt about the player');
  assert.deepEqual(r.n.home, { locationId: m.home.id, phases: m.wife.phases }, 'she lives where the cast says');
  assert.ok(r.ties.some(([id, rel]) => id === m.wife.id && rel === 'wife'), 'his wife: ' + JSON.stringify(r.ties));
  assert.ok(r.cast.includes(`${m.wife.id} — ${m.wife.name} (${m.wife.age}, she/her; `) && r.cast.includes(`wife of ${m.owner.name}`), 'the narrator\'s cast block has her, with her age');
  // Version 7: she has her age and history, and so does everyone the old game kept; the player has an age.
  assert.deepEqual([r.n.age, r.n.history], [m.wife.age, m.wife.history]);
  assert.deepEqual(await page.evaluate(() => Game.state.npcs.filter(n => !Number.isInteger(n.age) || !n.history).map(n => n.id)), [], 'everyone has an age and a history');
  assert.ok(await page.evaluate(() => Number.isInteger(Game.state.player.age)), 'the player has an age');
  // The white house someone told the player about is the home the cast wrote, still heard of.
  assert.equal(r.told, false, 'one house, not two');
  assert.equal(r.home.discovered, true);
  assert.deepEqual([r.home.revealed.ownerNpcId, r.home.revealed.kind, r.home.revealed.authored], [m.owner.id, 'home', true]);
  const w = await whereabouts(page, m.wife.id);
  assert.deepEqual(w.game, w.cast, 'every phase where the cast\'s schedule has her');
  // A re-read finds everyone already right: nothing changes.
  const same = await stateJson(page);
  const res2 = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual(res2.summaries.filter(x => x.version >= 5).map(x => x.text), ['People already match the story.', 'The cast is complete.', 'The town is already lived in.']);
  assert.equal(await stateJson(page), same);
  // /undo takes the update back: a man again, no cast, version 4.
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), loaded, 'exactly the save as it loaded');
  assert.equal(await page.evaluate(() => Game.Upgrade.behind(Game.state)), true);
});

s.test('version 5 on the owner\'s actual case: the wife named once by her husband, then called he and made to say she is his husband after the player corrected the story; the lines from before she was named go in, a stated relation outranks the narration\'s pronouns, and she is his wife, she/her', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMavisSave(page, { contaminated: true });
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  const r = await page.evaluate(() => ({ packet: Game.Api.Mock.calls.filter(c => c.method === 'fixPeople').pop().text, v: Game.state.meta.rulesVersion }));
  const turnLines = r.packet.split('\n').filter(l => /^  TURN \d/.test(l));
  assert.equal(turnLines.length, 4, 'the line from before she was named, then the three that name her: ' + turnLines.join(' | '));
  assert.match(turnLines[0], /^  TURN 2 \(day 1, morning; from before they were named: about them, or about someone else\): .*his wife's gonna be thrilled/);
  assert.match(turnLines[1], /^  TURN 3 \(day 1, morning\): .*my wife Mavis/);
  assert.match(turnLines[3], /^  TURN 5 \(day 1, afternoon\): .*my husband/);
  assert.match(r.packet, /PERSON npc_mavis_toler \(made by the game from random tables/);
  assert.equal(res.summaries.find(x => x.version === 5).text, `Fixed 1 person to match the story: Mavis Toler is ${m.owner.first}'s wife (she/her).`, 'his wife, she/her');
  assert.equal(r.v, 7);
  // The real rule the model gets says so too.
  const sys = await page.evaluate(() => Game.Api.SYSTEM.people);
  assert.match(sys, /a stated relation outranks everything else/);
  assert.match(sys, /The pronouns the narration itself used for this person are not evidence, and neither are the player's words/);
  assert.match(sys, /A line from before they were named/);
});

s.test('versions 6 and 7 on the owner\'s actual save: Mavis Toler is now the cast\'s Mavis, the owner\'s wife at the white house, with her memories, and every line and reference that pointed at the made-up record points at her; nobody is made up any more; she has her age and history and her late mother is a record; /undo takes it back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMavisSave(page, { contaminated: true });
  assert.ok(m.wife && m.home, 'the cast has the owner\'s wife and home');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const loaded = await stateJson(page);
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  const six = res.summaries.find(x => x.version === 6);
  assert.equal(six.title, 'A full cast');
  assert.equal(six.text, `${castLine(m.cast - m.people + 1, m.homes - 1)} ${m.owner.first}'s house is ${the(m.home.name)}. Mavis Toler is now ${m.wife.name} (${m.owner.first}'s wife).`);
  // Then version 7, "A lived-in town": her age and history from the cast, her late mother a record, the player an age.
  const seven = res.summaries.find(x => x.version === 7);
  assert.deepEqual([seven.title, seven.text], ['A lived-in town', m.lived]);
  const lived = await page.evaluate(id => { const n = Game.State.npc(id); const mother = Game.State.tiesOf(n).has.map(x => Game.State.npc(x.id)).find(x => Game.presenceOf(x) === 'dead'); return { age: n.age, history: n.history, mother: mother ? { name: mother.name, died: mother.died, present: Game.state.locations.some(l => Game.State.npcsAt(l.id).includes(mother)) } : null, player: Game.state.player.age }; }, m.wife.id);
  assert.deepEqual([lived.age, lived.history], [m.wife.age, m.wife.history]);
  assert.ok(lived.mother && lived.mother.died && !lived.mother.present, 'her late mother exists, dead, and is never anywhere: ' + JSON.stringify(lived.mother));
  assert.ok(Number.isInteger(lived.player));
  const r = await page.evaluate(m => {
    const S = Game.State;
    const st = Game.state;
    return {
      old: !!S.npc('npc_mavis_toler'), n: JSON.parse(JSON.stringify(S.npc(m.wife.id))), log: st.log.filter(e => e.turn >= 2).map(e => [e.turn, e.to || null, e.toName || null]),
      madeUp: Game.Upgrade.madeUp(st).map(n => n.id), refs: JSON.stringify(st).includes('npc_mavis_toler'), house: S.loc(m.home.id).revealed,
      home: S.npc(m.owner.id).home.locationId, saved: JSON.parse(localStorage.getItem('novatria.autosave')).state.npcs.some(n => n.id === 'npc_mavis_toler')
    };
  }, m);
  assert.equal(r.old, false, 'the old record is gone');
  assert.deepEqual([r.n.name, r.n.pronouns, r.n.role], [m.wife.name, 'she', m.wife.role]);
  assert.deepEqual(r.n.memories, [{ turn: 4, text: 'woke me up knocking', weight: 2 }], 'her memories kept');
  assert.equal(r.n.knownToPlayer, true, 'the player has met her');
  assert.equal(r.n.home.locationId, m.home.id, 'at the white house, the home the cast wrote');
  assert.equal(r.home, m.home.id, 'and so is her husband');
  assert.equal(r.house.ownerNpcId, m.owner.id);
  assert.deepEqual(r.log.find(x => x[0] === 5), [5, m.wife.id, m.wife.name], 'the line the player said to her points at her');
  assert.deepEqual(r.log.filter(x => x[0] === 3 || x[0] === 4).map(x => x[1]), [m.owner.id, m.owner.id], 'the rest as they were');
  assert.equal(r.refs, false, 'nothing points at the made-up record');
  assert.deepEqual(r.madeUp, [], 'nobody the game made up is left');
  assert.equal(r.saved, false, 'autosaved');
  // The People tab: one Mavis, with her ties.
  await page.click('#tab-people');
  const people = await page.innerText('#panel-body');
  assert.equal(people.split('Mavis Toler').length, 1, 'no Mavis Toler');
  assert.ok(people.includes(m.wife.name), people);
  // /undo takes it back.
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), loaded, 'exactly the save as it loaded');
});

s.test('versions 5 and 6 on a save with nobody made up: no call, "People already match the story.", and the save just gains the cast (every person and home it lacks, homes still to find, everyone where the cast puts them, castFixed); /undo takes it back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMavisSave(page, { plain: true, noHouse: true });
  await page.click('#btn-update');
  await page.waitForSelector('#screen-game.active');
  await waitIdle(page);
  const st = JSON.parse(await stateJson(page));
  assert.equal(st.meta.rulesVersion, 7);
  assert.equal(st.meta.castFixed, true);
  assert.deepEqual(await page.evaluate(() => Game.Api.Mock.calls.map(c => c.method)), [], 'no call');
  assert.equal(await page.textContent('#feed .f-notice:last-child'), `People already match the story. ${castLine(m.cast - m.people, m.homes)} ${m.lived}`);
  const T = await page.evaluate(() => Game.data.TOWN_DATA);
  assert.deepEqual(st.npcs.map(n => n.id).sort(), T.npcs.map(n => n.id).sort(), 'the whole cast');
  assert.deepEqual(st.locations.map(l => l.id).sort(), T.locations.map(l => l.id).sort(), 'every place');
  assert.deepEqual(st.locations.filter(l => !l.discovered).map(l => l.id), T.locations.filter(l => l.discovered === false).map(l => l.id), 'the homes still to find');
  for (const n of T.npcs) {
    const w = await whereabouts(page, n.id);
    assert.deepEqual(w.game, w.cast, 'where the cast puts ' + n.id);
  }
  // The people who were there are as they were, and gained who they are to whom and a home.
  const was = JSON.parse(m.json);
  for (const o of was.npcs) {
    const n = st.npcs.find(x => x.id === o.id);
    const t = T.npcs.find(x => x.id === o.id);
    // Version 7 then fills in what the town data says and the old record lacks: an age, a presence, a history.
    const strip = x => { const c = Object.assign({}, x); for (const k of ['relations', 'home', 'age', 'presence', 'history']) delete c[k]; return JSON.stringify(c); };
    assert.equal(strip(n), strip(o), 'unchanged: ' + o.id);
    assert.deepEqual([n.age, n.presence, n.history], [t.age, t.presence, t.history], 'lived in: ' + o.id);
    assert.deepEqual(n.relations, t.relations, 'relations: ' + o.id);
    assert.equal(n.home.locationId, t.home, 'home: ' + o.id);
  }
  assert.deepEqual(await overflowReport(page, LAPTOP.width), []);
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), m.json, 'exactly the save as it was');
});

s.test('version 6 keeps someone the game made up whom nobody in the cast matches, names them in the summary for the player to edit or remove, and still fixes the cast; a re-read changes nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeMavisSave(page, { plain: true, noHouse: true, stranger: true });
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.summaries.find(x => x.version === 6).text, `${castLine(m.cast - m.people + 1, m.homes)} Kept 1 person the game made up who is not in the cast: Rusty Fenwick. Edit or remove them on the People tab.`);
  const r = await page.evaluate(() => ({ n: Game.State.npc('npc_rusty_fenwick'), fixed: Game.state.meta.castFixed, people: Game.state.npcs.length, made: Game.Upgrade.madeUp(Game.state).map(n => n.id) }));
  assert.ok(r.n && r.n.name === 'Rusty Fenwick', 'kept as he was');
  assert.equal(r.fixed, true);
  assert.equal(r.people, m.cast + 1);
  assert.deepEqual(r.made, ['npc_rusty_fenwick']);
  const same = await stateJson(page);
  const res2 = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res2.summaries.find(x => x.version === 6).text, 'Kept 1 person the game made up who is not in the cast: Rusty Fenwick. Edit or remove them on the People tab.');
  assert.equal(await stateJson(page), same, 'nothing changes');
});

s.test('version 5 against the real provider: one structured-output call on the parser model with the person, what the story says about them, the places and the people; the reply applied through the engine, then version 6 folds her into the cast; a bad home or relation is ignored', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  let reply = null;
  await page.route('https://api.anthropic.com/v1/messages', async route => {
    const body = JSON.parse(route.request().postData());
    reqs.push(body);
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': 'req_people_' + reqs.length },
      body: JSON.stringify({ id: 'msg_f', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(reply) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 1500, output_tokens: 160, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
    });
  });
  const m = await writeMavisSave(page);
  const family = m.owner.name.split(' ').slice(-1)[0];
  reply = { people: [{ npcId: 'npc_mavis_toler', name: `Mavis ${family}`, pronouns: 'she', role: `${m.owner.first}'s wife`, look: 'A tired woman in a motel smock, with reading glasses pushed up in her hair.', voice: "Short and dry; says 'I tell you what' before every opinion.", relationToNpcId: m.owner.id, relation: 'wife', homeLocationId: m.house }] };
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(reqs.length, 1, 'one call (a save at 4 runs versions 5 and 6; version 6 makes none)');
  const body = reqs[0];
  assert.equal(body.model, 'claude-sonnet-5-5', 'the parser model');
  assert.equal(body.max_tokens, 6000);
  assert.equal(body.output_config.effort, 'medium', "the bookkeeper's effort");
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config', 'system']);
  const bad = [];
  (function walk(node, where) {
    if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${where}[${i}]`));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      if (node.additionalProperties !== false) bad.push(where + ': additionalProperties');
      if (JSON.stringify((node.required || []).slice().sort()) !== JSON.stringify(Object.keys(node.properties || {}).sort())) bad.push(where + ': required');
    }
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', '$ref']) if (k in node) bad.push(`${where}: ${k}`);
    for (const k of Object.keys(node)) walk(node[k], `${where}.${k}`);
  })(body.output_config.format.schema, 'schema');
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(body.output_config.format.schema.properties.people.items.properties), ['npcId', 'name', 'pronouns', 'role', 'look', 'voice', 'relationToNpcId', 'relation', 'homeLocationId']);
  assert.equal(body.system, await page.evaluate(() => Game.Api.SYSTEM.people));
  const user = body.messages[0].content;
  assert.match(user, /^PLAYER: Tester\nPLACES \(the places list\): /);
  assert.ok(user.includes(`${m.house} — ${m.owner.first}'s house (house)`), 'the places, the house too');
  assert.ok(user.includes('\n  WHAT THE STORY SAYS (oldest first):\n  TURN 3 (day 1, morning): ') && user.includes('My wife Mavis works the night counter'), user);
  // Version 5 made her Mavis Mangum, his wife (the summary says so); version 6 makes her the cast's Mavis, with her history.
  assert.equal(res.summaries.find(x => x.version === 5).text, `Fixed 1 person to match the story: Mavis ${family} is ${m.owner.first}'s wife (she/her).`);
  const after = m.wife ? `Mavis ${family} is now ${m.wife.name === `Mavis ${family}` ? "the cast's " : ''}${m.wife.name} (${m.owner.first}'s wife).` : '';
  assert.ok(res.summaries.find(x => x.version === 6).text.endsWith(after), res.summaries.find(x => x.version === 6).text);
  const n = await page.evaluate(id => ({ old: !!Game.State.npc('npc_mavis_toler'), n: JSON.parse(JSON.stringify(Game.State.npc(id))) }), m.wife.id);
  assert.equal(n.old, false);
  assert.deepEqual([n.n.name, n.n.pronouns, n.n.memories.length], [m.wife.name, 'she', 1]);
  // A reply with a home and a relation that do not exist: they are ignored and the rest applies (on the same save, written again).
  await page.evaluate(() => Game.Storage.saveSettings({ mockMode: true }));
  await writeMavisSave(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  reply = { people: [{ npcId: 'npc_mavis_toler', name: `Mavis ${family}`, pronouns: 'she', role: `${m.owner.first}'s wife`, look: '', voice: '', relationToNpcId: 'npc_nobody', relation: 'wife', homeLocationId: 'loc_nowhere' }, { npcId: 'npc_not_asked', name: 'X Y', pronouns: 'he', role: 'r', look: '', voice: '', relationToNpcId: null, relation: null, homeLocationId: null }] };
  const res2 = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res2.ok, true);
  assert.equal(reqs.length, 2);
  assert.equal(res2.summaries.find(x => x.version === 5).text, `Fixed 1 person to match the story: Mavis ${family} is ${m.owner.first}'s wife (she/her).`, 'the name, pronouns and role applied');
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'upgrade').map(x => x.reason).join(' | '));
  assert.match(dbg, /relationToNpcId npc_nobody is not someone in the game/);
  assert.match(dbg, /homeLocationId loc_nowhere is not a place/);
  assert.match(dbg, /npc_not_asked, who was not asked about/);
});

/* A game saved under version 6 ("A full cast"), before the town was lived
   in: none of the dead or the far away, none of the places nobody is ever
   scheduled at (the places out of town and the town's own later ones), no
   ages or histories, no details, hours or history on places, no age for
   the player, and the game's copy of the town as it was (no history, the
   offstage names). Written as the autosave; the page reloads to the title.
   Resolves to what version 7 should add and fill. */
async function writeV6Save(page) {
  await quickStart(page, { kinds: ['debt'] });
  const out = await page.evaluate(key => {
    const T = Game.data.TOWN_DATA;
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    const LP = ['age', 'presence', 'history', 'where', 'reach', 'died', 'buried'];
    const LL = ['away', 'distance', 'details', 'hours', 'history', 'aka'];
    const env = Game.Storage.envelope('Autosave');
    const st = env.state;
    const absent = st.npcs.filter(n => Game.presenceOf(n) !== 'here').map(n => n.id);
    const newPlaces = T.locations.filter(l => PH.every(p => !l.npcIdsBySchedule[p].length)).map(l => l.id);
    const strip = (o, keys) => { for (const k of keys) delete o[k]; return o; };
    st.npcs = st.npcs.filter(n => !absent.includes(n.id)).map(n => strip(Object.assign(n, { relations: n.relations.filter(r => !absent.includes(r.npcId)) }), LP));
    st.locations = st.locations.filter(l => !newPlaces.includes(l.id)).map(l => strip(Object.assign(l, { exits: l.exits.filter(x => !newPlaces.includes(x)) }), LL));
    delete st.player.age;
    st.meta.rulesVersion = 6;
    const t = env.town;
    t.npcs = t.npcs.filter(n => !absent.includes(n.id)).map(n => strip(Object.assign({}, n, { relations: n.relations.filter(r => !absent.includes(r.npcId)) }), LP));
    t.locations = t.locations.filter(l => !newPlaces.includes(l.id)).map(l => strip(Object.assign({}, l, { exits: l.exits.filter(x => !newPlaces.includes(x)) }), LL));
    strip(t, ['year', 'history', 'recent']);
    t.offstage = absent.slice(0, 3).map(id => { const n = T.npcs.find(x => x.id === id); return { name: n.name, about: n.role }; });
    localStorage.setItem(key, JSON.stringify(env));
    const bg = Game.data.BACKGROUNDS.find(b => b.id === st.player.backgroundId);
    const pres = id => Game.presenceOf(T.npcs.find(n => n.id === id));
    return {
      absent, newPlaces, kept: st.npcs.length, keptPlaces: st.locations.length, json: JSON.stringify(st),
      dead: absent.filter(id => pres(id) === 'dead').length, away: absent.filter(id => pres(id) === 'away').length,
      inTown: newPlaces.filter(id => !T.locations.find(l => l.id === id).away).length, out: newPlaces.filter(id => T.locations.find(l => l.id === id).away).length,
      name: st.player.name, bg: bg.name.toLowerCase(), age: bg.age
    };
  }, AUTOSAVE);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  return out;
}

s.test('version 7 on a save at version 6: the dead, the far away and the places the story names are added, everyone gets their age and history and every place its details, hours and history, the player their background\'s age; nobody new is ever present, the places out of town are never on the map; a re-read changes nothing; /undo takes it back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const m = await writeV6Save(page);
  assert.ok(m.absent.length && m.newPlaces.length, 'the town has people and places version 7 brings');
  assert.ok(await page.isVisible('#btn-update'), 'a save at version 6 is behind');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const loaded = await stateJson(page);
  assert.equal(loaded, m.json, 'loading adds nothing');
  // Before the update the old cast block still has the offstage names, and nobody shows an age.
  assert.match(await page.evaluate(() => Game.Pipeline.castBlock()), /\nNOT IN TOWN \(they can be talked about, but they never appear\)/);
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true, JSON.stringify(res));
  const text = `Added ${m.absent.length} people the story names (${m.dead} dead, ${m.away} living elsewhere) and ${m.newPlaces.length} places (${m.inTown} in town, ${m.out} out of town). Filled in the ages and histories of ${m.kept} people and the history, details and hours of ${m.keptPlaces} places. ${m.name} is ${m.age}, the age a ${m.bg} starts at.`;
  assert.deepEqual(res.summaries.map(x => [x.version, x.title, x.text]), [[7, 'A lived-in town', text]]);
  assert.equal(await page.textContent('#feed .f-notice:last-child'), text);
  assert.deepEqual(await page.evaluate(() => Game.Api.Mock.calls.map(c => c.method)), [], 'no call: version 7 is the town data');
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const T = G.data.TOWN_DATA;
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    const asym = [];
    for (const n of st.npcs) for (const t of n.relations || []) if (!(G.State.npc(t.npcId).relations || []).some(x => x.npcId === n.id)) asym.push(`${n.id} -> ${t.npcId}`);
    return {
      v: st.meta.rulesVersion, people: st.npcs.map(n => n.id).sort(), cast: T.npcs.map(n => n.id).sort(), places: st.locations.map(l => l.id).sort(), castPlaces: T.locations.map(l => l.id).sort(),
      missing: st.npcs.filter(n => !Number.isInteger(n.age) || !n.history || !n.presence).map(n => n.id), bare: st.locations.filter(l => !l.details || !l.hours || !l.history).map(l => l.id),
      asym, player: st.player.age,
      present: PH.flatMap(p => st.locations.flatMap(l => G.State.npcsAt(l.id, p).filter(n => G.presenceOf(n) !== 'here').map(n => n.id))),
      away: st.locations.filter(l => l.away).map(l => [l.discovered, l.exits.length]), drawn: G.UI.mapLayout(st).pts.filter(p => p.loc.away).length,
      offstage: G.State.town.offstage === undefined, town: G.Pipeline.townBlock().length > 0, history: G.State.town.history === T.history,
      dead: st.npcs.filter(n => G.presenceOf(n) === 'dead').map(n => [n.alive, n.status, !!n.died])
    };
  });
  assert.equal(r.v, 7);
  assert.deepEqual(r.people, r.cast, 'everyone the town data has');
  assert.deepEqual(r.places, r.castPlaces, 'every place the town data has');
  assert.deepEqual([r.missing, r.bare], [[], []], 'everyone with an age, a history and a presence; every place with details, hours and a history');
  assert.deepEqual(r.asym, [], 'relations written on both sides, to the new people too');
  assert.equal(r.player, m.age);
  assert.deepEqual(r.present, [], 'the dead and the far away are never present, in any phase');
  assert.ok(r.away.every(([d, x]) => d === false && x === 0) && r.drawn === 0, 'places out of town: not discovered, no roads, not on the map');
  assert.deepEqual([r.offstage, r.town, r.history], [true, true, true], 'the game\'s town copy has the history; the offstage list is gone, its names are records');
  assert.ok(r.dead.every(([alive, status, died]) => alive === false && status === 'dead' && died));
  // What the player sees: their age on the Character sheet, the new places under the map, out of town listed apart.
  await page.click('#tab-character');
  assert.equal(await page.textContent('#panel-body .char-age'), ` · ${m.age}`);
  await page.click('#tab-places');
  assert.ok((await page.textContent('#panel-body')).includes('Out of town'));
  assert.equal(await page.locator('.place-list[data-list="away"] .plcard').count(), m.out);
  // A re-read finds the town lived in already: nothing changes, no undo step.
  const same = await stateJson(page);
  const depth = await page.evaluate(() => Game.State.undoDepth());
  const res2 = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res2.summaries.find(x => x.version === 7).text, 'The town is already lived in.');
  assert.equal(await stateJson(page), same);
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), depth);
  // /undo takes the update back: the version 6 save, byte for byte.
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), loaded, 'exactly the save as it loaded');
  assert.equal(await page.evaluate(() => Game.Upgrade.behind(Game.state)), true);
});

s.run();
