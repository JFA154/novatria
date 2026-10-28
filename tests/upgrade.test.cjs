'use strict';
/* Bringing an older game up to date (Upgrade, Pipeline.updateGame): the
   rules version on new games and old saves, the title screen's "Update this
   game", the Saves screen's Update, Settings' "Re-read this game with the
   latest rules", the memory rewrite in mock mode and against canned API
   replies, failure and refusal, and /undo. Ids and names come from the
   running game, never from one town.
   Run with: node tests/run.cjs upgrade */
const assert = require('assert/strict');
const { suite, quickStart, stateJson, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

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
  assert.deepEqual(fresh, { v: 2, current: 2, read: 2, behind: false });
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
  const r = await page.evaluate(() => [Game.State.apply({ rulesVersion: 3 }).rejected.length, Game.State.apply({ rulesVersion: 2 }, { source: 'model' }).rejected[0].reason, Game.State.apply({ setMemories: [] }, { source: 'model' }).rejected[0].reason]);
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
  assert.equal(st.meta.rulesVersion, 2, 'stamped');
  // The feed: the running notice, then the summary.
  const notices = await page.$$eval('#feed .f-notice', ns => ns.map(n => n.textContent));
  assert.deepEqual(notices.slice(-2), ['Updating this game to the latest rules...', 'Rewrote memories for 3 people: 17 memories became 11.']);
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
  assert.equal(await page.evaluate(() => Game.state.meta.rulesVersion), 2);
});

s.test('Settings: the Game section is off with no game, notes an older game, and re-reads a current one; a re-read that changes nothing is not an undo step', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await page.click('#btn-settings');
  assert.ok(await page.isDisabled('#set-reread'), 'no game loaded');
  assert.ok(await page.isVisible('#set-reread-none'));
  assert.equal(await page.textContent('#set-reread'), 'Re-read this game with the latest rules');
  assert.match(await page.textContent('#set-reread-hint'), /new short form.*about one API call/i);
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
  assert.equal(r.v, 2);
  assert.equal(r.calls, 1);
  assert.equal(r.mems.length, 3);
  assert.ok(r.mems.every(m => words(m.text) <= 12 && m.turn === 1), JSON.stringify(r.mems));
  assert.equal(r.depth, depth + 1, 'the re-read is one undo step');
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'Rewrote memories for 1 person: 3 memories became 3.');
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
  await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('novatria.slot.1')); e.name = 'New one'; e.state.meta.rulesVersion = 2; localStorage.setItem('novatria.slot.2', JSON.stringify(e)); });
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
  assert.equal(st.meta.rulesVersion, 2);
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
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': 'req_mem_' + reqs.length },
      body: JSON.stringify({ id: 'msg_m', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: JSON.stringify(reply) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 900, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
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
  assert.equal(reqs.length, 1, 'one call');
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
  assert.equal(st.meta.rulesVersion, 2);
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'Rewrote memories for 3 people: 17 memories became 3.');
  // The debug view shows the exchange.
  await sendText(page, '/debug');
  const dbg = await page.textContent('#panel-body');
  assert.match(dbg, /memories · via claude · HTTP 200 · request-id req_mem_1/);
  assert.match(dbg, /rules v2/);
});

s.run();
