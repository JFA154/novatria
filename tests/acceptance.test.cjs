'use strict';
/* SPEC.md section 14: the acceptance tests, one per checkbox, in the order
   the spec lists them and named after its text. All run against the mock
   provider (mock mode is the default), with ids and names read from
   Game.data / Game.state so they survive a change of town. Where an earlier
   suite already proves a checkbox in depth (pipeline, world, shell), the test
   here is the short end-to-end version of it.
   Run with: node tests/run.cjs acceptance */
const fs = require('fs');
const assert = require('assert/strict');
const { suite, quickStart, sendText, stateJson, fixtures, findScene, place, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('acceptance');
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const lastLog = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastPacket = (page, method) => page.evaluate(m => { const c = Game.Api.Mock.calls.filter(x => x.method === m); return c.length ? c[c.length - 1].text : ''; }, method || 'narrate');
const line = (packet, label) => (packet.split('\n').find(l => l.startsWith(label + ':')) || '').slice(label.length + 1).trim();
const time = page => page.evaluate(() => ({ day: Game.state.time.day, phase: Game.state.time.phase }));
const nextPhase = async page => PHASES[(PHASES.indexOf((await time(page)).phase) + 1) % 4];
const world = page => page.evaluate(() => ({
  npcs: Game.state.npcs.map(n => n.id), locations: Game.state.locations.map(l => l.id),
  items: Game.state.locations.flatMap(l => (l.items || []).map(i => i.id)), inventory: Game.state.player.inventory.map(i => i.id)
}));
/* People nobody's clock touches, so no clock completion takes them away mid-test. */
const untouched = page => page.evaluate(() => Game.state.factions.flatMap(f => f.clocks.flatMap(c => c.onComplete.effects.filter(e => e.npcId).map(e => e.npcId))));

/* About 20 varied turns through the mock (look, talk, rolls that succeed and
   fail, moves, insults, persuasion, buying, /look, /wait, /zoom, /skip and
   /rest across several days so due events reach the narrator). Returns what
   each narrated turn sent and got back. */
async function twentyTurns(page) {
  const out = [];
  const take = async text => {
    const before = await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate').length);
    await sendText(page, text);
    const r = await page.evaluate(() => {
      const t = Game.Pipeline.lastTurn;
      return { narration: t.narration, mode: t.ctx.mode, style: t.style, summary: t.action.summary, actionType: t.action.actionType, present: t.ctx.present.map(n => n.name), packet: t.packet, regenerated: !!t.ctx.regenerated, turn: Game.state.meta.turn };
    });
    r.input = text;
    r.calls = (await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate').length)) - before;
    out.push(r);
  };
  const here = () => page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => n.name));
  const exitName = () => page.evaluate(() => { const l = Game.State.loc(Game.state.player.locationId).exits.map(id => Game.State.loc(id)).find(x => !x.closed && !/morning|afternoon|evening|night/i.test(x.name)); return l.name; });
  const someone = async () => (await here())[0] || null;
  await take('I look around');
  const a = await someone();
  await take(a ? `I ask ${a} about the river` : 'I ask around about the river');
  await take('I try to climb the wall behind the building');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await take('I try to pick the lock on the side door');
  await take(`I walk to ${await exitName()}`);
  const b = await someone();
  await take(b ? `I talk to ${b}` : 'I talk to whoever is around');
  await take('/look');
  await take(`/wait ${await nextPhase(page)}`);
  await take(`I head to ${await exitName()}`);
  const c = await someone();
  if (c) { await take(`I insult ${c}`); await page.evaluate(() => Game.Pipeline.forceNextRoll(18)); await take(`I persuade ${c} to forgive me`); }
  else { await take('I look around'); await take('I wait a while'); }
  await page.evaluate(() => { if (Game.state.player.gold < 30) Game.State.apply({ goldDelta: 30 }); });
  const good = await page.evaluate(() => Game.data.TABLES.items.goods.filter(g => Game.Town.goodsFor('i buy ' + g.name.toLowerCase()) === g).sort((x, y) => x.price - y.price)[0].name);
  await take(`I buy ${good.toLowerCase()}`);
  await take('/zoom I stand very still and listen to the river');
  await take('I ask the dragon for a light');
  for (let i = 0; i < 4; i++) await take('/rest');
  await take('I look around');
  const d = await someone();
  await take(d ? `I ask ${d} what has changed` : 'I ask around about what has changed');
  const far = await page.evaluate(() => Game.state.locations.find(l => !l.closed && l.id !== Game.state.player.locationId && !/morning|afternoon|evening|night/i.test(l.name)).name);
  await take(`/skip to ${far} at night`);
  await take('I sneak along the wall in the dark');
  await take('I look around');
  return out;
}

/* Style.check flags each crafted narration with exactly its problem; then,
   through a real turn, a queued bad narration followed by a good one is
   regenerated once (the second packet is the first plus a note naming the
   problem) and the good one is what the log and the feed show; finally a bad
   one followed by another bad one keeps the second, with both failures in
   the debug log. */
async function proveStyleCheck(page, bad, good) {
  const checks = await page.evaluate(list => list.map(t => Game.Style.check(t)), bad.map(b => b.text));
  bad.forEach((b, i) => { assert.equal(checks[i].ok, false, b.type); assert.deepEqual(checks[i].problems.map(p => p.type), [b.type], b.type); });
  assert.equal((await page.evaluate(t => Game.Style.check(t), good)).ok, true, 'the good narration passes');
  for (const b of bad) {
    await page.evaluate(([x, y]) => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', x, y); }, [b.text, good]);
    await sendText(page, 'I wait a minute where I am');
    const r = await page.evaluate(() => ({ c: Game.Api.Mock.calls.filter(x => x.method === 'narrate').map(x => x.text), last: Game.state.log[Game.state.log.length - 1].narration, feed: [...document.querySelectorAll('#feed .f-narr')].pop().innerText }));
    assert.equal(r.c.length, 2, b.type + ': regenerated once');
    assert.ok(!/STYLE CHECK FAILED/.test(r.c[0]));
    assert.match(r.c[1], b.note, b.type + ': the note names the problem');
    assert.equal(r.c[1].split('\nSTYLE CHECK FAILED')[0], r.c[0], 'same packet plus the note');
    assert.equal(r.last, good, b.type + ': the second try is used');
    assert.ok(r.feed.includes(good) && !r.feed.includes(b.text.slice(-24)), b.type + ': the feed shows only the second try');
  }
  const second = bad[bad.length - 1].text;
  await page.evaluate(([x, y]) => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', x, y); }, [bad[0].text, second]);
  await sendText(page, 'I wait a little longer');
  const kept = await page.evaluate(() => ({ n: Game.Api.Mock.calls.filter(x => x.method === 'narrate').length, last: Game.state.log[Game.state.log.length - 1].narration, dbg: Game.State.debugLog.filter(x => x.kind === 'style').slice(-2) }));
  assert.equal(kept.n, 2, 'no third attempt');
  assert.equal(kept.last, second, 'a second bad try is kept');
  assert.deepEqual(kept.dbg.map(x => [x.attempt, !!x.kept]), [[1, false], [2, true]], 'both failures are in the debug log');
}

// 1
s.test('[1] "I talk to the dragon by the fire" in the tavern → narration says there\'s no dragon; nothing is created.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  assert.ok(fx.tavern, 'the town has a tavern or bar');
  await place(page, fx.tavern.id, 'evening');
  const before = await world(page);
  await sendText(page, 'I talk to the dragon by the fire');
  assert.match((await lastLog(page)).narration, /There is no dragon here/);
  assert.deepEqual(await world(page), before, 'no person, place or thing was created');
  assert.deepEqual(await page.evaluate(() => Game.Pipeline.lastTurn.ctx.created), []);
  assert.match(await lastPacket(page), /NOT PRESENT: dragon \(does not exist in this town; it is simply not there\)/);
  assert.match(await lastPacket(page, 'bookkeep'), /DOES NOT EXIST \(record nothing about it\): dragon/);
});

// 2
s.test('[2] Asking for a barmaid who isn\'t in the town data → one is created from the tables, appears in People, and is still there after reload.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  await place(page, fx.tavern.id, 'evening');
  assert.ok(await page.evaluate(() => !Game.data.TOWN_DATA.npcs.some(n => Game.Town.mentions(' barmaid ', n))), 'no barmaid in the town data');
  const before = await world(page);
  await sendText(page, 'I ask the barmaid for a drink');
  const made = await page.evaluate(ids => Game.state.npcs.filter(n => !ids.includes(n.id)), before.npcs);
  assert.equal(made.length, 1, 'exactly one person created');
  const b = made[0];
  assert.equal(b.role, 'barmaid');
  assert.ok(await page.evaluate(n => Game.data.TABLES.npc.firstNames.includes(n.split(' ')[0]) && Game.data.TABLES.npc.familyNames.includes(n.split(' ').slice(1).join(' ')), b.name), 'name rolled from the tables: ' + b.name);
  assert.ok(await page.evaluate(t => Game.data.TABLES.npc.traits.includes(t[0]) && Game.data.TABLES.npc.traits.includes(t[1]), b.personality), 'traits from the tables');
  assert.ok(b.knownToPlayer);
  await page.click('#tab-people');
  assert.ok((await page.innerText('#panel-body')).includes(b.name), 'in People');
  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.deepEqual(await page.evaluate(id => { const n = Game.State.npc(id); return n && { name: n.name, role: n.role }; }, b.id), { name: b.name, role: 'barmaid' }, 'still in the state');
  assert.ok(await page.evaluate(([id, loc]) => Game.State.npcsAt(loc, 'evening').some(n => n.id === id), [b.id, fx.tavern.id]), 'still works at the tavern');
  await page.click('#tab-people');
  assert.ok((await page.innerText('#panel-body')).includes(b.name), 'still in People after reload');
});

// 3
s.test('[3] A failed lockpick → the failure is narrated, something changes, and the identical retry is refused.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const before = JSON.parse(await stateJson(page));
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await sendText(page, 'I try to pick the lock on the back door');
  const r = await page.evaluate(() => ({ t: Game.Pipeline.lastTurn, st: Game.state, roll: document.querySelector('#feed .f-roll').textContent }));
  assert.equal(r.t.roll.stat, 'stealth');
  assert.equal(r.t.roll.tier, 'failure');
  assert.match(r.roll, /· Failure$/, 'the roll line says so');
  assert.ok(r.t.narration.includes('failure') && r.t.narration.includes(r.t.roll.complication), 'the failure and its complication are narrated: ' + r.t.narration);
  assert.ok(await page.evaluate(c => Game.data.TABLES.complications.includes(c), r.t.roll.complication), 'the complication comes from the table');
  assert.match(r.t.packet, new RegExp(`\\nCOMPLICATION: ${r.t.roll.complication.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
  // Something changed: the complication is part of the story, time moved, the attempt is on record and locked.
  assert.ok(r.st.meta.lastRollKey, 'the retry lock is set');
  assert.notDeepEqual(r.st.time, before.time, 'time moved on');
  assert.equal(r.st.log.length, before.log.length + 1);
  const locked = await stateJson(page);
  await sendText(page, 'I try to pick the lock on the back door');
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'You just tried that and it failed. Change something first: a different approach, something to use or offer, another place, or let time pass (/wait or /rest).');
  assert.equal(await stateJson(page), locked, 'the identical retry is refused and changes nothing');
});

// 4
s.test('[4] Insulting the same NPC three times → attitude drops, their greeting turns cold, and a grudge seed is planted once attitude reaches −60.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 99 });
  await fast(page);
  await page.evaluate(() => Game.World.forceClockRoll(1)); // no clock takes them away mid-test
  const touched = await untouched(page);
  const sc = await findScene(page, { minAtt: -15, maxAtt: 0, watchy: false });
  const x = sc.npcs.find(n => !touched.includes(n.id)) || sc.npcs[0];
  await place(page, sc.loc.id, sc.phase);
  const grudges = () => page.evaluate(id => Game.state.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === id), x.id);
  for (let i = 0; i < 3; i++) await sendText(page, `I insult ${x.name}`);
  const n = await page.evaluate(id => Game.State.npc(id), x.id);
  assert.equal(n.attitude, x.attitude - 45, 'three insults, -15 each');
  assert.deepEqual(n.memories.filter(m => /insulted/.test(m.text)).map(m => m.weight), [2, 3, 3], 'remembered, and the repeats weigh more');
  await sendText(page, `I talk to ${x.name}`);
  assert.ok((await lastLog(page)).narration.includes(`${x.name} gives you a cold look`), 'the greeting turned cold');
  assert.equal((await grudges()).length, 0, 'no grudge above -60');
  // Keep insulting until -60; the next world tick plants exactly one grudge.
  for (let i = 0; i < 4 && (await page.evaluate(id => Game.State.npc(id).attitude, x.id)) > -60; i++) await sendText(page, `I insult ${x.name}`);
  assert.ok((await page.evaluate(id => Game.State.npc(id).attitude, x.id)) <= -60, 'reached -60');
  const day = (await time(page)).day;
  await sendText(page, `/wait ${await nextPhase(page)}`);
  const g = await grudges();
  assert.equal(g.length, 1, 'one grudge seed');
  assert.equal(g[0].hidden, true);
  assert.equal(g[0].trigger.type, 'day');
  assert.ok(g[0].trigger.value >= day + 2 && g[0].trigger.value <= day + 6, `acts against the player in 2 to 5 days (day ${g[0].trigger.value}, now ${day})`);
  assert.ok(g[0].effect.includes(x.name));
  await sendText(page, `/wait ${await nextPhase(page)}`);
  assert.equal((await grudges()).length, 1, 'planted once, not every tick');
  const now = await page.evaluate(id => Game.World.whereIs(id), x.id);
  if (now) await place(page, now);
  await sendText(page, `I talk to ${x.name}`);
  assert.ok((await lastLog(page)).narration.includes(`${x.name} turns away and will not look at you`), 'hostile now');
});

// 5
s.test('[5] A debt loose end from character creation → the lender confronts the player around day 3.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 4242, kinds: ['debt', 'enemy', 'secret'] });
  await fast(page);
  await page.evaluate(() => Game.World.forceClockRoll(1));
  const le = await page.evaluate(() => {
    const le = Game.state.player.looseEnds.find(x => x.kind === 'debt');
    const n = Game.State.npc(le.npcId);
    const sd = Game.State.seed(le.seedId);
    return { npcId: n.id, name: n.name, tags: n.tags, seedId: sd.id, day: sd.trigger.value, type: sd.trigger.type, effect: sd.effect, offset: Game.data.LOOSE_ENDS.debt.seed.dayOffset };
  });
  assert.ok(le.tags.includes('lender'), 'linked to the town\'s lender');
  assert.equal(le.type, 'day');
  assert.ok(le.day >= 3 && le.day <= le.offset[1], `due on day ${le.day} (around day 3)`);
  let told = null;
  for (let i = 0; i < 8 && !told; i++) {
    await sendText(page, (await time(page)).day < le.day ? '/rest' : 'I look around');
    const fired = await page.evaluate(id => Game.State.seed(id).fired, le.seedId);
    if (!fired) assert.ok((await time(page)).day < le.day, 'not before its day');
    const p = await lastPacket(page);
    if (line(p, 'DUE EVENT').includes(le.effect)) told = { packet: p, narration: (await lastLog(page)).narration, day: (await time(page)).day };
  }
  assert.ok(told, 'the confrontation reached the narrator');
  assert.equal(told.day, le.day, 'on its day');
  assert.ok(line(told.packet, 'PRESENT').includes(le.name + ' ('), 'the lender is in the scene');
  assert.ok(told.narration.includes(le.effect.slice(0, 40)), 'and it is narrated');
});

// 6
s.test('[6] After 10 turns, a chronicle entry exists and the log has been trimmed.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 10 });
  await fast(page);
  for (let i = 1; i <= 9; i++) await sendText(page, i % 3 ? 'I look around' : `/wait ${await nextPhase(page)}`);
  assert.deepEqual(await page.evaluate(() => [Game.state.chronicle.length, Game.state.log.length]), [0, 10], 'nothing yet after 9 turns');
  await sendText(page, 'I look around');
  const r = await page.evaluate(() => ({ turn: Game.state.meta.turn, chron: Game.state.chronicle, log: Game.state.log.map(e => e.turn) }));
  assert.equal(r.turn, 10);
  assert.deepEqual(r.chron.map(c => [c.fromTurn, c.toTurn]), [[0, 9]], 'one entry for turns 0-9');
  assert.ok(r.chron[0].summary.split(/\s+/).length < 80);
  assert.deepEqual(r.log, [10], 'the ten summarised entries left the log');
  await sendText(page, 'I look around');
  assert.equal(line(await lastPacket(page), 'STORY SO FAR'), r.chron[0].summary, 'the narrator gets the chronicle');
});

// 7
s.test('[7] Normal narration never exceeds 90 words and never contains "What do you do" or a banned phrase.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 31, kinds: ['debt', 'secret', 'promise'] });
  await fast(page);
  const banned = await page.evaluate(() => Game.Style.BANNED);
  assert.equal(banned.length, 20);
  const runs = await twentyTurns(page);
  assert.ok(runs.length >= 20, runs.length + ' narrated turns');
  assert.ok(runs.some(r => line(r.packet, 'DUE EVENT') !== 'none'), 'due events were narrated along the way');
  const words = t => (t.trim().match(/\S+/g) || []).length;
  for (const r of runs) {
    const limit = r.mode === 'normal' ? 90 : 150;
    assert.ok(words(r.narration) <= limit, `${words(r.narration)} words (limit ${limit}) for "${r.input}": ${r.narration}`);
    assert.doesNotMatch(r.narration, /what do you do/i, r.input);
    assert.doesNotMatch(r.narration, /^\s*["“]?as you\b/i, r.input);
    for (const b of banned) assert.ok(!r.narration.toLowerCase().replace(/’/g, "'").includes(b), `banned "${b}" in "${r.input}"`);
    assert.equal(r.calls, 1, 'passed the style check first time: ' + r.input);
  }
  const feed = (await page.innerText('#feed')).toLowerCase();
  for (const b of banned) assert.ok(!feed.includes(b), 'feed: ' + b);
  const normal = runs.filter(r => r.mode === 'normal').map(r => words(r.narration));
  console.log(`        ${runs.length} narrated turns; normal mode ${normal.length}, longest ${Math.max(...normal)} words; ${runs.filter(r => line(r.packet, 'DUE EVENT') !== 'none').length} with due events`);

  // Style.check itself on crafted bad narrations, and the regenerate-once path through a real turn.
  const long95 = Array.from({ length: 95 }, (_, i) => (i % 15 === 14 ? 'gate.' : 'mud')).join(' ');
  await proveStyleCheck(page, [
    { text: 'The air is thick with diesel and river mud.', type: 'banned', note: /banned phrase "the air is thick with"/ },
    { text: long95, type: 'length', note: /95 words, limit 90/ },
    { text: 'The pumps tick in the heat. What do you do?', type: 'question', note: /contains "What do you do"/ },
    { text: 'As you step inside, the radio goes quiet.', type: 'opening', note: /starts with "As you"/ }
  ], 'Rain ticks on the canopy. Somebody laughs inside the station and stops.');
  assert.equal((await page.evaluate(t => Game.Style.check(t, { zoom: true }), long95)).ok, true, '95 words is fine in zoom');
  assert.equal((await page.evaluate(() => Game.Style.check('The pumps tick in the heat. Royce looks up. "You lost?"'))).ok, true);
});

// 8
s.test('[8] The narrator never describes what the player character says or feels beyond the typed input (check 20 turns).', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 77, kinds: ['debt', 'lost', 'promise'] });
  await fast(page);
  const runs = await twentyTurns(page);
  assert.ok(runs.length >= 20, runs.length + ' narrated turns');
  const SPEAKS = /\byou (say|says|said|tell|told|reply|replied|answer|answered|ask|asked|shout|shouted|whisper|whispered|mutter|muttered|call out|insist|promise|promised|admit|admitted|lie|lied)\b/i;
  const FEELS = /\byou (feel|feels|felt|think|thought|wonder|wondered|realis\w*|realiz\w*|decide|decided|want|wanted|hope|hoped|fear|feared|dread|regret|regretted|sense|remember|remembered|know|knew|smile|smiled|grin|grinned|laugh|laughed|sigh|sighed|nod|nodded|shrug|shrugged|blush|blushed|panic|panicked|hesitate|hesitated|can't help|cannot help)\b/i;
  const MOOD = /\byou('re| are| were) (nervous|afraid|scared|angry|furious|happy|sad|relieved|worried|anxious|ashamed|embarrassed|calm|tense|sure|certain|glad|sorry)\b|\byour (heart|stomach|pulse|mind|thoughts|chest tightens|fear|anger|relief)\b|\b(makes|made|leaves|left) you (feel|want|think|wonder)\b|\bcould have hoped\b/i;
  const names = await page.evaluate(() => Game.state.npcs.map(n => n.name));
  for (const r of runs) {
    const t = r.narration;
    assert.doesNotMatch(t, SPEAKS, `speaks for the player after "${r.input}": ${t}`);
    assert.doesNotMatch(t, FEELS, `thinks or feels for the player after "${r.input}": ${t}`);
    assert.doesNotMatch(t, MOOD, `tells the player how they feel after "${r.input}": ${t}`);
    // Every quoted line belongs to someone in the town, named just before it.
    for (const m of t.matchAll(/["“]([^"”]+)["”]/g)) {
      const before = t.slice(Math.max(0, m.index - 140), m.index);
      assert.ok(names.some(n => before.includes(n)), `a quoted line with no NPC speaking it after "${r.input}": ${m[0]}`);
    }
    // The narrator is told only what was typed: the ACTION line restates the input (or names the command).
    const action = line(r.packet, 'ACTION');
    if (!r.input.startsWith('/')) assert.equal(action, r.input, 'ACTION restates the typed input');
    else if (r.input.startsWith('/zoom ')) assert.equal(action, r.input.slice(6));
  }
  // The cached system prompt carries the rule, word for word from SPEC section 9.
  const sys = await page.evaluate(() => Game.Style.systemPrompt());
  assert.ok(sys.includes('- Act, speak, think or feel for the player character beyond what they typed.'));
  assert.ok(sys.includes('Never tell the player how to feel.'));
  // Narrations that speak or feel for the player and trip a code-side check are regenerated once.
  const who = (await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => n.name)))[0] || names[0];
  const ramble = ('You feel tired and you think about the road and you wonder whether ' + who + ' believes you, and you decide to say nothing. ').repeat(4).trim();
  assert.ok(ramble.split(/\s+/).length > 90);
  const good = `${who} looks up. "Took you long enough."`;
  await proveStyleCheck(page, [
    { text: `${who} looks up. You feel a sense of dread.`, type: 'banned', note: /banned phrase "a sense of"/ },
    { text: ramble, type: 'length', note: /\d+ words, limit 90/ },
    { text: `You decide to wait for ${who} to finish. What do you do?`, type: 'question', note: /contains "What do you do"/ },
    { text: `As you tell ${who} you can pay by Friday, the radio goes quiet.`, type: 'opening', note: /starts with "As you"/ }
  ], good);
  for (const re of [SPEAKS, FEELS, MOOD]) assert.doesNotMatch(good, re);
});

// 9
s.test('[9] At 375px wide: no horizontal scroll, the keyboard doesn\'t cover the input, the sheet opens and closes.', async h => {
  const page = await h.open({ viewport: PHONE });
  const noScroll = async label => {
    assert.deepEqual(await overflowReport(page, 375), [], label);
    const r = await page.evaluate(() => { window.scrollTo(120, 0); document.scrollingElement.scrollLeft = 120; const f = document.getElementById('feed-scroll'); f.scrollLeft = 120; return { x: window.scrollX, doc: document.scrollingElement.scrollLeft, feed: f.scrollLeft, w: document.documentElement.scrollWidth }; });
    assert.deepEqual(r, { x: 0, doc: 0, feed: 0, w: 375 }, label + ': nothing scrolls sideways');
  };
  await noScroll('title');
  await page.click('#btn-new');
  await noScroll('creation');
  await page.evaluate(() => Game.UI.showScreen('settings'));
  await noScroll('settings');
  await page.evaluate(() => Game.UI.showScreen('saves'));
  await noScroll('saves');
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around at everything, the pumps, the board out front, the service bays and the road');
  await noScroll('game');

  // The keyboard: the input stays inside the visible part of the screen.
  const inView = () => page.evaluate(() => {
    const vv = window.visualViewport;
    const r = document.getElementById('cmd').getBoundingClientRect();
    const send = document.getElementById('send').getBoundingClientRect();
    return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height, input: [r.top, r.bottom], send: [send.top, send.bottom] };
  });
  const within = (v, label) => {
    for (const [a, b] of [v.input, v.send]) assert.ok(a >= v.top - 1 && b <= v.bottom + 1, `${label}: [${a}, ${b}] outside the visible [${v.top}, ${v.bottom}]`);
  };
  await page.focus('#cmd');
  within(await inView(), 'keyboard closed');
  // iOS: the visual viewport shrinks (and may scroll) while the layout viewport stays put.
  const keyboard = (height, offsetTop) => page.evaluate(([hgt, top]) => {
    const vv = window.visualViewport;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => hgt });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get: () => top });
    vv.dispatchEvent(new Event('resize'));
    vv.dispatchEvent(new Event('scroll'));
  }, [height, offsetTop]);
  await keyboard(420, 0);
  const k1 = await inView();
  within(k1, 'keyboard open (420px left)');
  assert.ok(k1.input[1] <= 421 && k1.input[1] > 300, 'the input moved up above the keyboard: ' + JSON.stringify(k1));
  await keyboard(380, 140);
  within(await inView(), 'keyboard open, page scrolled by 140px');
  await page.evaluate(() => { const vv = window.visualViewport; delete vv.height; delete vv.offsetTop; vv.dispatchEvent(new Event('resize')); });
  within(await inView(), 'keyboard closed again');
  // Android with interactive-widget=resizes-content: the viewport itself shrinks.
  await page.setViewportSize({ width: 375, height: 400 });
  await page.waitForFunction(() => document.getElementById('app').getBoundingClientRect().height === 400, null, { timeout: 3000 });
  within(await inView(), 'viewport resized to 400px');
  await noScroll('game with the keyboard up');
  await page.setViewportSize(PHONE);
  await page.waitForFunction(() => document.getElementById('app').getBoundingClientRect().height === 740, null, { timeout: 3000 });

  // The sheet: opens from the tab bar, closes with X, with a swipe down, and with Escape.
  const sheet = () => page.evaluate(() => { const p = document.getElementById('panel'); const r = p.getBoundingClientRect(); return { vis: getComputedStyle(p).visibility, top: Math.round(r.top), h: Math.round(r.height), tab: Game.UI.tab }; });
  const settle = () => page.waitForTimeout(320);
  await page.click('[data-open-tab="people"]');
  await settle();
  assert.deepEqual(await sheet(), { vis: 'visible', top: 0, h: 740, tab: 'people' }, 'opens full height');
  await noScroll('sheet open');
  await page.click('#panel-close');
  await settle();
  assert.equal((await sheet()).vis, 'hidden', 'X closes it');
  await page.click('[data-open-tab="places"]');
  await settle();
  assert.equal((await sheet()).vis, 'visible');
  await page.evaluate(() => {
    const p = document.getElementById('panel');
    const t = y => [new Touch({ identifier: 1, target: p, clientX: 180, clientY: y })];
    p.dispatchEvent(new TouchEvent('touchstart', { touches: t(80), bubbles: true }));
    p.dispatchEvent(new TouchEvent('touchmove', { touches: t(300), bubbles: true }));
    p.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  });
  await settle();
  assert.equal((await sheet()).vis, 'hidden', 'a swipe down closes it');
  await page.click('[data-open-tab="journal"]');
  await settle();
  await page.keyboard.press('Escape');
  await settle();
  assert.equal((await sheet()).vis, 'hidden', 'Escape closes it');
});

// 10
s.test('[10] Export a save on laptop, import on phone, and the game continues from the same point.', async h => {
  const laptop = await h.open({ viewport: LAPTOP });
  await quickStart(laptop, { seed: 555 });
  await fast(laptop);
  await sendText(laptop, 'I look around');
  await sendText(laptop, 'I try to climb onto the roof');
  const exit = await laptop.evaluate(() => Game.State.loc(Game.state.player.locationId).exits.map(id => Game.State.loc(id)).find(l => !l.closed).name);
  await sendText(laptop, `I walk to ${exit}`);
  await sendText(laptop, '/rest');
  await laptop.click('#tb-save');
  const [download] = await Promise.all([laptop.waitForEvent('download'), laptop.click('#btn-export')]);
  const file = fs.readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(file);
  assert.equal(JSON.stringify(exported.state), await stateJson(laptop), 'the file holds the laptop game');
  await laptop.click('#saves-done');

  const phone = await h.open({ viewport: PHONE });
  assert.equal(await phone.evaluate(() => Game.Storage.hasAutosave()), false, 'a fresh device');
  await phone.click('#btn-load');
  await phone.setInputFiles('#import-file', { name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(file) });
  await phone.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(phone), await stateJson(laptop), 'identical state on the phone');
  const view = p => p.evaluate(() => ({ bar: ['tb-time', 'tb-loc', 'tb-hp', 'tb-gold'].map(id => document.getElementById(id).textContent), inputs: [...document.querySelectorAll('#feed .f-input')].map(e => e.textContent), narr: document.querySelectorAll('#feed .f-narr').length }));
  const lv = await view(laptop);
  await laptop.evaluate(() => Game.UI.rebuildFeed());
  assert.deepEqual(await view(phone), await view(laptop), 'the same top bar and story feed');
  assert.deepEqual(lv.bar, (await view(laptop)).bar);
  // The same next turn on both devices lands in the same place, dice included.
  await fast(phone);
  for (const text of ['I try to sneak around the back', 'I look around']) {
    await sendText(laptop, text);
    await sendText(phone, text);
    assert.equal(await stateJson(phone), await stateJson(laptop), `"${text}" plays out the same on both`);
  }
  assert.equal(await phone.evaluate(() => Game.state.meta.turn), exported.state.meta.turn + 2);
  assert.ok(await phone.evaluate(() => Game.Storage.hasAutosave()), 'the phone now autosaves the game');
});

// 11
s.test('[11] `/undo` restores the previous turn exactly.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 2024 });
  await fast(page);
  await sendText(page, 'I look around');
  const steps = [
    'I try to climb the fence behind the pumps',
    `I walk to ${await page.evaluate(() => Game.State.loc(Game.state.player.locationId).exits.map(id => Game.State.loc(id)).find(l => !l.closed).name)}`,
    '/rest',
    `/wait ${await nextPhase(page)}`
  ];
  for (const text of steps) {
    const before = await stateJson(page);
    const feedBefore = await page.evaluate(() => document.querySelectorAll('#feed .f-input').length);
    await sendText(page, text);
    const after = await stateJson(page);
    const firstDie = await page.evaluate(() => { const e = Game.state.log[Game.state.log.length - 1]; return e && e.roll ? e.roll.d20 : null; });
    assert.notEqual(after, before, text + ' changed the state');
    await sendText(page, '/undo');
    assert.equal(await stateJson(page), before, `/undo after "${text}" restores the exact state`);
    assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-input').length), feedBefore, 'the feed is rebuilt without it');
    assert.match(await page.textContent('#feed .f-notice:last-child'), /took back the last turn/);
    // Playing it again: the world replays the same, but a die rolled after /undo is never
    // the same number (the seeded stream is shifted so a retry is a real retry).
    await sendText(page, text);
    if (firstDie === null) assert.equal(await stateJson(page), after, `"${text}" replays identically after /undo`);
    else assert.notEqual(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].roll.d20), firstDie, `"${text}" gets a different die after /undo`);
  }
  // Undo walks back one turn at a time, then says there is nothing left.
  const depth = await page.evaluate(() => Game.State.undoDepth());
  for (let i = 0; i < depth; i++) await sendText(page, '/undo');
  await sendText(page, '/undo');
  assert.equal(await page.textContent('#feed .f-notice:last-child'), 'There is nothing to undo.');
});

// 12
s.test('[12] In debug view, faction clocks visibly advance over several in-game days and a completed clock changes the town.', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 2024 });
  await fast(page);
  const glance = async () => {
    const text = await page.innerText('#panel-body');
    return text.split('\n').filter(l => /^fac_\w+ [■□]{6} \d\/6 \(\d of \d\)$|^fac_\w+ done$/.test(l.trim())).map(l => l.trim());
  };
  await sendText(page, '/debug');
  const day1 = await glance();
  assert.equal(day1.length, await page.evaluate(() => Game.state.factions.length), 'one clock line per faction');
  assert.ok(day1.every(l => / □{6} 0\/6 \(1 of /.test(l)), 'all start empty: ' + day1.join(' | '));
  // Natural d6 rolls (5 or 6 fills a segment) over three days and nights.
  for (let i = 0; i < 3; i++) await sendText(page, '/rest');
  const day4 = await glance();
  assert.notDeepEqual(day4, day1, 'the clocks moved: ' + day4.join(' | '));
  assert.ok(day4.some(l => /■/.test(l) || /\(2 of /.test(l)), 'filled segments show');
  // A clock whose completion changes the town where anyone can see it.
  const target = await page.evaluate(() => {
    for (const f of Game.state.factions) {
      const c = f.clocks[f.activeClock];
      if (!c) continue;
      const e = c.onComplete.effects.find(x => x.op === 'closeLocation' || (x.op === 'npcStatus' && ['arrested', 'gone'].includes(x.status) && Game.State.npc(x.npcId).status === 'free'));
      if (e) return { factionId: f.id, label: c.label, effect: e, next: f.clocks[f.activeClock + 1] ? f.clocks[f.activeClock + 1].label : null };
    }
    return null;
  });
  assert.ok(target, 'a running clock that closes a place or takes someone away');
  await page.evaluate(id => { Game.World.forceClockRoll(1); Game.World.forceClockRoll(6, id); }, target.factionId);
  for (let i = 0; i < 8 && await page.evaluate(([id, label]) => { const f = Game.State.faction(id); return f.activeClock >= 0 && f.clocks[f.activeClock].label === label; }, [target.factionId, target.label]); i++) {
    await sendText(page, `/wait ${await nextPhase(page)}`);
  }
  await page.evaluate(() => Game.World.forceClockRoll(null));
  const town = await page.evaluate(e => ({ closed: e.locationId ? Game.State.loc(e.locationId).closed : null, status: e.npcId ? Game.State.npc(e.npcId).status : null }), target.effect);
  if (target.effect.op === 'closeLocation') assert.equal(town.closed, true, 'the place is shut');
  else assert.equal(town.status, target.effect.status, 'the person is ' + target.effect.status);
  if (!(await page.evaluate(() => Game.UI.debug))) await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  assert.ok(dbg.includes(`${target.factionId} completes "${target.label}"`), 'World events records the completion');
  if (target.next) assert.ok(dbg.includes(`0/6 "${target.next}"`), 'and the next clock is running');
  if (target.effect.npcId) assert.match(dbg, new RegExp(`\\[${target.effect.npcId}\\] ${target.effect.status}`), 'the NPC list shows it');
  // Outside the debug view the town shows it too.
  if (target.effect.op === 'closeLocation') {
    await page.click('#tab-places');
    assert.ok((await page.innerText('#panel-body')).includes(`${await page.evaluate(id => Game.State.loc(id).name, target.effect.locationId)} (closed)`), 'Places shows it closed');
  } else {
    const where = await page.evaluate(id => Game.World.whereIs(id), target.effect.npcId);
    const police = await page.evaluate(() => (Game.state.locations.find(l => l.type === 'police') || Game.state.locations.find(l => l.type === 'watch') || {}).id || null);
    assert.equal(where, target.effect.status === 'arrested' ? police : null, 'they are in the cells, or gone from the map');
  }
});

s.run();
