'use strict';
/* Wave 8 fixes (docs/notes/*.md, "Wave 8"): the last items of the final
   verification pass. /pronouns turns a person's ties; a first name and a
   surname before what a person is or does is an invented name; /cheat time
   prints each day's Resolved lines under that day; a missed obligation's
   news is not told twice; a plan's wide effects do not make it seen
   anywhere; the mock gives with "hand", searches for "anything" without
   making it, lists a skip's crowd once and tells every due event. Mock mode
   throughout.
   Run with: node tests/run.cjs wave8 */
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave8-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.World.forceClockRoll(1); });
/* The name problems Style.check finds for each text: "HARD", "soft" or "ok". */
const nameVerdicts = (page, texts) => page.evaluate(ts => ts.map(t => { const h = Game.Style.nameHits(t, { packet: '' }); return h.some(x => x.marked) ? 'HARD' : h.length ? 'soft' : 'ok'; }), texts);
const quiets = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent));
const feedLines = page => page.evaluate(() => [...document.querySelectorAll('#feed > .f-divider, #feed > .f-input, #feed > .f-roll, #feed > .f-narr, #feed > .f-quiet')]
  .map(x => `${x.className.split(' ').find(c => /^f-(divider|input|roll|narr|quiet)$/.test(c)).slice(2)}: ${x.textContent.replace(/\s+/g, ' ').trim()}`));

// ----- 1. /pronouns turns the ties -----

s.test('1: /pronouns Mavis he turns her ties wherever they are read: the cast block ("husband of Dewayne Mangum, son of the late Inez Crocker"), Dewayne\'s people in PRESENT and on his card ("husband: Mavis Mangum"), Inez\'s, the role line ("Dewayne\'s husband"); they gives spouse and child; she turns them back; the records keep what was written', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const line = id => page.evaluate(id => Game.Pipeline.castBlock().split('\n').find(l => l.startsWith(id + ' ')) || '', id);
  assert.match(await line('npc_mavis'), /; wife of Dewayne Mangum, daughter of the late Inez Crocker, /);
  await sendText(page, '/pronouns Mavis he');
  const he = await line('npc_mavis');
  assert.match(he, /\(41, he\/him; .*; husband of Dewayne Mangum, son of the late Inez Crocker, boss of /, he);
  assert.match(await line('npc_dewayne'), /; husband of Mavis Mangum, son-in-law of the late Inez Crocker, /, 'Dewayne is still her husband');
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    const out = {
      has: G.Pipeline.hasWords(S.npc('npc_dewayne')), inez: G.Pipeline.hasWords(S.npc('npc_inez')), note: S.relationNote(S.npc('npc_mavis')),
      records: [S.npc('npc_dewayne').relations.find(x => x.npcId === 'npc_mavis').relation, S.npc('npc_inez').relations.find(x => x.npcId === 'npc_mavis').relation]
    };
    // The narrator's PRESENT line for Dewayne, where he is.
    const where = G.World.whereIs('npc_dewayne');
    S.apply({ playerLocationId: where });
    G.Api.Mock.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit('I look around');
    const packet = (G.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    out.present = (/^PRESENT: .*$/m.exec(packet) || [''])[0];
    S.apply({ npcKnownToPlayer: ['npc_dewayne', 'npc_mavis'] });
    return out;
  });
  assert.match(r.has, /^husband: Mavis Mangum, /);
  assert.match(r.inez, /\bson: Mavis Mangum\b/);
  assert.equal(r.note, "Dewayne's husband");
  assert.deepEqual(r.records, ['wife', 'daughter'], 'the town\'s records are left as written');
  assert.match(r.present, /Dewayne Mangum \([^)]*husband: Mavis Mangum/, r.present);
  // The People panel: Dewayne's card's Ties, Mavis's role line.
  await sendText(page, '/people');
  await page.click('#phead-npc_dewayne');
  const ties = await page.textContent('.pcard[data-npc="npc_dewayne"] .pcard-facts dd[data-fact="ties"]');
  assert.match(ties, /^husband Mavis Mangum; /, ties);
  await page.click('#phead-npc_mavis');
  assert.match(await page.textContent('.pcard[data-npc="npc_mavis"] .pcard-role'), /· Dewayne's husband$/);
  await sendText(page, '/pronouns Mavis they');
  assert.match(await line('npc_mavis'), /\(41, they\/them; .*; spouse of Dewayne Mangum, child of the late Inez Crocker, /);
  assert.match(await page.evaluate(() => Game.Pipeline.hasWords(Game.State.npc('npc_dewayne'))), /^spouse: Mavis Mangum, /);
  await sendText(page, '/pronouns Mavis she');
  assert.match(await line('npc_mavis'), /; wife of Dewayne Mangum, daughter of the late Inez Crocker, /);
  assert.match(await page.evaluate(() => Game.Pipeline.hasWords(Game.State.npc('npc_dewayne'))), /^wife: Mavis Mangum, /);
  // The word helper: each pair, and they.
  const words = await page.evaluate(() => [['wife', 'he'], ['daughter', 'he'], ['mother', 'he'], ['sister', 'he'], ['girlfriend', 'he'], ['widow', 'he'], ['niece', 'he'], ['aunt', 'he'], ['granddaughter', 'he'],
    ['husband', 'she'], ['son', 'she'], ['father', 'she'], ['brother', 'she'], ['boyfriend', 'she'], ['widower', 'she'], ['nephew', 'she'], ['uncle', 'she'], ['grandson', 'she'],
    ['wife', 'they'], ['son', 'they'], ['mother', 'they'], ['older brother', 'they'], ['girlfriend', 'they'], ['boss', 'they'], ['boss', 'he']].map(([w, p]) => Game.kinWord(w, p)));
  assert.deepEqual(words, ['husband', 'son', 'father', 'brother', 'boyfriend', 'widower', 'nephew', 'uncle', 'grandson',
    'wife', 'daughter', 'mother', 'sister', 'girlfriend', 'widow', 'niece', 'aunt', 'granddaughter',
    'spouse', 'child', 'parent', 'older sibling', 'partner', 'boss', 'boss']);
});

// ----- 2. the invented-name check -----

s.test('2: a first name and a surname the town does not have, before what a person is or does or after seeing or meeting them, is a hard name ("Earl Hux is cheap, Royce says.", "You watch Earl Hux playing pool."); brands, the radio and what a sign says stay soft; every README example as documented', async h => {
  const page = await h.open();
  await quickStart(page);
  const hard = ['Earl Hux is cheap, Royce says.', 'You watch Earl Hux playing pool.', 'Earl Hux was sitting by the door.', 'You meet Darnell Hux by the pumps.', 'You hear Earl Hux laughing in the back.',
    'Darnell Hux is waiting outside.', 'You spot Wanda Hux by the jukebox.', 'He watches Earl Hux.'];
  const soft = ['Red Seal is cheap here.', 'Merle Haggard is on the jukebox.', 'The note says Darnell Hux is coming.', 'Conway Twitty plays on the radio.', 'Blue Bell tastes like summer.',
    'Hank Williams is playing on the radio.', 'The jukebox plays something by Patsy Cline.', 'He dips Red Seal.', 'The radio plays Conway Twitty.', 'Patsy Cline comes on.', 'Red Seal costs $4 here.'];
  const ok = ['Sam Adams is cheap here.', 'Earl Grey is cheap here.', 'You watch Monday Night Football.'];
  assert.deepEqual(await nameVerdicts(page, hard), hard.map(() => 'HARD'), hard.join(' | '));
  assert.deepEqual(await nameVerdicts(page, soft), soft.map(() => 'soft'), soft.join(' | '));
  assert.deepEqual(await nameVerdicts(page, ok), ok.map(() => 'ok'), ok.join(' | '));
  // The README's name-check section, as it documents them.
  const readme = [['You notice Earl Hux at the bar.', 'HARD'], ['Miss Earline says the coffee is fresh.', 'HARD'], ['You meet Royce at the Shack.', 'HARD'], ['A Mountain Dew sweats on the counter.', 'ok'],
    ['Someone has on a John Deere cap.', 'ok'], ['The Saints are on the radio.', 'ok'], ['Red Seal is cheap here.', 'soft'], ['Silence answers.', 'ok'], ['The sign says Closed.', 'soft'],
    ['Slowly Royce nods.', 'ok'], ['Royce finally says Darnell took it.', 'HARD']];
  assert.deepEqual(await nameVerdicts(page, readme.map(x => x[0])), readme.map(x => x[1]));
  // Style.check: a rewrite for the hard one.
  const check = await page.evaluate(() => Game.Style.check('You watch Earl Hux playing pool.', {}).problems.filter(p => p.type === 'name').map(p => [p.hard, p.names.join(' ')]));
  assert.deepEqual(check, [[true, 'Earl Hux']]);
});

// ----- 3. /cheat time: each day's Resolved lines under that day -----

s.test('3: /cheat time past several days prints the council\'s "Resolved: Disbanding the police. +1 Wits." right under the Day 6 "Meanwhile in town" line, before Day 7\'s; the same order after a reload and after /undo of a turn on top', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const title = await page.evaluate(() => { Game.State.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] }); return Game.State.thread('thr_police_vote').title; });
  await sendText(page, '/cheat time morning 10');
  const q = await quiets(page);
  const day6 = q.findIndex(t => /^Meanwhile in town, Day 6: .*council/i.test(t));
  const res = q.findIndex(t => t.startsWith(`Resolved: ${title}.`));
  const later = q.findIndex(t => /^Meanwhile in town, Day (?:7|8|9|10): /.test(t));
  assert.ok(day6 >= 0 && res === day6 + 1, 'the Resolved line right under the Day 6 line: ' + q.join(' | '));
  assert.match(q[res], /\+1 Wits\.$/);
  if (later >= 0) assert.ok(later > res, 'and before the later days\' lines');
  assert.equal(q.filter(t => t.startsWith('Resolved: ')).length, 1);
  const live = await feedLines(page);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  await fast(page);
  assert.deepEqual(await feedLines(page), live, 'the same order after a reload');
  await page.evaluate(() => { Game.Api.Mock.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' }); Game.Api.Mock.queue('bookkeep', {}); });
  await sendText(page, 'I look around');
  await sendText(page, '/undo');
  assert.deepEqual(await feedLines(page), live, 'the same order after /undo');
});

s.test('3: what a jump earned as a town seed fired goes under that seed\'s own day too (catchUp\'s prog), and the council\'s held reward under Day 6', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    const t = st.threads.find(x => x.status === 'open' && x.id !== 'thr_police_vote' && x.id !== 'thr_bridge_vote' && !(st.player.looseEnds || []).some(le => le.threadId === x.id));
    S.apply({ threadUpdates: [{ threadId: t.id, knownToPlayer: true }] });
    // A town seed of its own on Day 3 that settles that thread as it fires.
    const res = S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_t8_day3', cause: 'test', effect: 'The test seed came true on the third day.', trigger: { type: 'day', value: 3 }, fired: false, hidden: false,
      effects: [{ op: 'threadStatus', threadId: t.id, status: 'resolved' }], origin: { kind: 'town' } } }] });
    await G.Pipeline.submit('/cheat time morning 10');
    return { rejected: res.rejected, title: t.title, police: S.thread('thr_police_vote').title, quiet: [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent) };
  });
  assert.deepEqual(r.rejected, []);
  const q = r.quiet;
  const day3 = q.findIndex(t => /^Meanwhile in town, Day 3: .*The test seed came true/.test(t));
  const mine = q.findIndex(t => t.startsWith(`Resolved: ${r.title}.`));
  const after3 = q.findIndex((t, i) => i > day3 && /^Meanwhile in town, Day (?:[4-9]|10): /.test(t));
  assert.ok(day3 >= 0 && mine > day3 && (after3 < 0 || mine < after3), 'under Day 3, before the next day: ' + q.join(' | '));
  const day6 = q.findIndex(t => /^Meanwhile in town, Day 6: .*council/i.test(t));
  assert.equal(q.findIndex(t => t.startsWith(`Resolved: ${r.police}.`)), day6 + 1, q.join(' | '));
});

// ----- 4. a missed obligation's news told once -----

s.test('4: a missed blackmail is told once: the morning narration tells its missText and "Overnight in town" does not repeat "has been telling people"; the news stays in the ledger, seen; an onMiss news no missText covers is still told overnight', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['secret'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, P = G.Pipeline, st = G.state;
    const sd = st.seeds.find(x => x.origin && x.origin.kind === 'loose_end' && /price/.test(x.effect));
    await P.submit(`/cheat time morning ${sd.trigger.value}`);
    await P.submit('I look around');
    const ob = S.obligations().find(o => o.kind === 'blackmail');
    // A promise missed the same morning, whose own news no missText tells.
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false && G.presenceOf(x) === 'here' && x.id !== ob.npcId && x.id !== 'npc_marcus');
    S.apply({ effects: [{ op: 'addObligation', kind: 'promise', npcId: n.id, text: 'Help {npc} move the boat.', dueOffset: ob.dueDay - st.time.day,
      onMiss: [{ op: 'addNews', text: 'Somebody let down {npc} about the boat.', public: true }] }] });
    const q0 = document.querySelectorAll('#feed .f-quiet').length;
    let narr = [];
    for (let i = 0; i < 5 && S.obligations().find(o => o.id === ob.id).status === 'open'; i++) { await P.submit('/rest'); narr.push(st.log[st.log.length - 1].narration); }
    const quiet = [...document.querySelectorAll('#feed .f-quiet')].slice(q0).map(x => x.textContent);
    const news = st.news.filter(x => /has been telling people what/.test(x.text));
    const other = st.news.filter(x => /let down/.test(x.text));
    return { status: S.obligations().find(o => o.id === ob.id).status, missText: ob.missText, narr: narr.pop(), quiet, news: news.map(x => [x.public, x.seen, x.eventId]), other: other.map(x => [x.public, x.seen]), id: ob.id, name: n.name };
  });
  assert.equal(r.status, 'missed');
  assert.ok(r.narr.includes('has told Chief Bell what you are hiding'), r.narr);
  assert.ok(!r.quiet.some(t => /has been telling people what/.test(t)), 'not told again overnight: ' + r.quiet.join(' | '));
  assert.deepEqual(r.news, [[true, true, `missed_${r.id}`]], 'in the ledger, public, seen');
  assert.deepEqual(r.other, [[true, true]]);
  assert.ok(r.quiet.some(t => /^Overnight in town: .*let down/.test(t)), 'the other news is told overnight: ' + r.quiet.join(' | '));
});

// ----- 5. a plan's wide effects are no place -----

s.test('5: the bridge closing while the player is at the Low Water (Royce, linked to its thread, beside them) is news, not a quiet line there; at the old bridge it happens in front of them', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const run = where => page.evaluate(async where => {
    const G = Game, S = G.State, st = G.state, W = G.World;
    const f = S.faction('fac_sturdivant');
    f.activeClock = 2;
    const c = f.clocks[2];
    c.filled = c.segments - 1;
    S.apply({ playerLocationId: where });
    W.forceClockRoll(1);
    W.forceClockRoll(6, f.id);
    const q0 = document.querySelectorAll('#feed .f-quiet').length;
    G.Api.Mock.queue('parse', { actionType: 'wait', summary: 'Waits', targets: [], needsRoll: false, timeCost: 'long' });
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit('I wait a while');
    W.forceClockRoll(1);
    const told = [...document.querySelectorAll('#feed .f-quiet')].slice(q0).map(x => x.textContent).concat(st.log[st.log.length - 1].narration).some(t => /concrete barriers across both ends/.test(t));
    const news = st.news.filter(x => /concrete barriers across both ends/.test(x.text)).map(x => [x.public, x.seen, S.newsWaits(x)]);
    return { told, news, closed: S.loc('loc_old_bridge').closed, royce: S.npcsAt(where).some(n => n.id === 'npc_royce'), prices: st.flags.priceMultiplier };
  }, where);
  const away = await run('loc_low_water');
  assert.equal(away.closed, true);
  assert.ok(away.prices > 1, 'prices went up everywhere');
  assert.equal(away.told, false, 'no bare line at the Low Water');
  assert.deepEqual(away.news, [[true, false, false]], 'its news is public and unseen, nothing holding it: the morning\'s "Overnight in town" tells it');
  // A fresh game: at the old bridge itself.
  const page2 = await h.open();
  await quickStart(page2, { kinds: [] });
  await fast(page2);
  const there = await page2.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, W = G.World;
    const f = S.faction('fac_sturdivant');
    f.activeClock = 2;
    f.clocks[2].filled = f.clocks[2].segments - 1;
    S.apply({ playerLocationId: 'loc_old_bridge' });
    W.forceClockRoll(1);
    W.forceClockRoll(6, f.id);
    G.Api.Mock.queue('parse', { actionType: 'wait', summary: 'Waits', targets: [], needsRoll: false, timeCost: 'long' });
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit('I wait a while');
    W.forceClockRoll(1);
    const lines = [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent).concat(st.log.map(e => e.narration || ''));
    return { told: lines.some(t => /concrete barriers across both ends/.test(t)), seen: st.news.filter(x => /concrete barriers across both ends/.test(x.text)).map(x => x.seen) };
  });
  assert.equal(there.told, true, 'seen at the bridge');
});

// ----- 6. the mock provider -----

s.test('6a/6b: the mock gives with "hand" ("I hand Jodie the letter", "I hand the letter to Jodie", "Hand Jodie the letter."), not "my hand"; a search for "anything washed up" makes no item and says nothing turned up', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['promise'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const where = G.World.whereIs('npc_jodie');
    S.apply({ playerLocationId: where });
    const packet = t => ({ input: t, present: S.npcsAt(st.player.locationId).map(n => ({ id: n.id, name: n.name, role: n.role })), knownNpcs: [], inventory: st.player.inventory, itemsHere: [],
      location: { id: st.player.locationId, type: S.loc(st.player.locationId).type, name: S.loc(st.player.locationId).name }, exits: [], knownLocations: [] });
    const out = {};
    for (const t of ['I hand Jodie the letter', 'I hand the letter to Jodie', 'Hand Jodie the letter.', 'I raise my hand', 'I shake her hand']) {
      const p = await G.Api.parse(packet(t));
      const res = p && p.result ? p.result : p;
      out[t] = [res.actionType, res.targets.includes('npc_jodie'), /^item_letter/.test(res.usesItemId || '')];
    }
    await G.Pipeline.submit('I hand Jodie the letter');
    out.letter = st.player.inventory.some(i => /^Letter for Jodie/.test(i.name));
    // The search.
    S.apply({ playerLocationId: 'loc_purvis_landing' });
    const items = () => JSON.stringify([st.player.inventory.map(i => i.name), st.locations.map(l => (l.items || []).map(i => i.name))]);
    const before = items();
    await G.Pipeline.submit('I search the riverbank for anything washed up');
    const a = G.Pipeline.lastTurn.ctx.action;
    out.search = { type: a.actionType, targets: a.targets, same: items() === before, narr: st.log[st.log.length - 1].narration, any: /anything/i.test(items()) };
    out.vague = [];
    for (const t of ['I search the shed for something useful', 'I look around for clues', 'I search the lot for signs of a struggle', 'I look for some rope'])
      { const p = await G.Api.parse(packet(t)); out.vague.push((p && p.result ? p.result : p).targets.filter(x => /^new:/.test(x))); }
    return out;
  });
  assert.deepEqual(r['I hand Jodie the letter'], ['give', true, true]);
  assert.deepEqual(r['I hand the letter to Jodie'], ['give', true, true]);
  assert.deepEqual(r['Hand Jodie the letter.'], ['give', true, true]);
  assert.notEqual(r['I raise my hand'][0], 'give');
  assert.notEqual(r['I shake her hand'][0], 'give');
  assert.equal(r.letter, false, 'the letter was handed over');
  assert.equal(r.search.type, 'search');
  assert.deepEqual(r.search.targets, []);
  assert.equal(r.search.same, true, 'no item made');
  assert.equal(r.search.any, false);
  assert.match(r.search.narr, /nothing (?:worth keeping|turns up)/);
  assert.deepEqual(r.vague, [[], [], [], ['new:some rope']], 'a named thing is still looked for');
});

s.test('6c: after /skip to a place, the mock names each person there once: who was there "is here", who came "comes in"; no "arrive" line repeats them', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  await sendText(page, '/skip to the Low Water at night');
  const r = await page.evaluate(() => {
    const st = Game.state;
    const narr = st.log[st.log.length - 1].narration;
    const here = Game.State.npcsAt(st.player.locationId).map(n => n.name);
    return { narr, here, counts: here.map(n => narr.split(n).length - 1) };
  });
  assert.ok(r.here.length > 1, 'a crowd at night');
  assert.deepEqual(r.counts, r.here.map(() => 1), 'each named once: ' + r.narr);
  assert.doesNotMatch(r.narr, /\barrives?\./, r.narr);
});

s.test('6d: three due events in one turn are all told by the mock (briefly if need be: the blackmail\'s price is named), so nothing marked done goes untold', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const mk = (k, text) => { const id = 'seed_t8_' + k; S.apply({ effects: [{ op: 'plantSeed', seed: { id, cause: 'test', effect: text, trigger: { type: 'day', value: st.time.day }, fired: false, hidden: true, origin: { kind: 'town' } } }], seedsFired: [id], dueAdd: [{ seedId: id, text }] }); return id; };
    mk('a', 'Royce Pittman leans over and tells you the bridge vote is coming whether anybody likes it or not, and that the Sturdivants have been buying drinks all week. He does not say who for.');
    mk('b', 'Tammy Lott slides onto the stool next to you and says Colt Purvis has been asking about you, twice now, and that he did not look happy about it. She laughs like it is nothing.');
    mk('c', 'Tyler Rasberry catches your sleeve by the door and names his price for keeping quiet: two hundred dollars, by the day after tomorrow. He does not wait for an answer.');
    G.Api.Mock.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit('I look around');
    return { due: (G.Pipeline.lastTurn.ctx.due || []).length, narr: st.log[st.log.length - 1].narration, left: st.dueEvents.length };
  });
  assert.equal(r.due, 3);
  assert.equal(r.left, 0, 'all three marked done');
  for (const t of ['Royce Pittman leans over', 'Tammy Lott slides onto the stool', 'names his price for keeping quiet: two hundred dollars']) assert.ok(r.narr.includes(t), `${t} in: ${r.narr}`);
});

s.test('6d: more due events than a narration holds (six at once over a wait): the mock tells each briefly within the length, and one it has no room for is not marked done but told by the next narration; nothing marked done goes untold', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const texts = [
      'Royce Pittman leans over and tells you the bridge vote is coming whether anybody likes it or not, and that the Sturdivants have been buying drinks all week.',
      'Tammy Lott slides onto the stool next to you, taps the bar twice with one long nail, and says Colt Purvis has been asking about you, twice now.',
      'Loretta Gaddis sets a glass down in front of you, wipes the ring it leaves with the corner of her apron, and says the cook quit again this morning.',
      'Elbert Tackett tells you, in front of the whole bar, that the ferry used to run until midnight when he was a boy and nobody locked a door.',
      'Curtis Pruett asks whether you have seen his dog, a brown hound with one white ear and a red collar, and says she has been gone since Sunday.',
      'Jodie Strayhorn catches your eye from the end of the bar, lifts her chin toward the door, and mouths that she needs a word later tonight.'];
    texts.forEach((text, i) => { const id = 'seed_t8_many' + i; S.apply({ effects: [{ op: 'plantSeed', seed: { id, cause: 'test', effect: text, trigger: { type: 'day', value: st.time.day }, fired: false, hidden: true, origin: { kind: 'town' } } }], seedsFired: [id], dueAdd: [{ seedId: id, text }] }); });
    const heads = texts.map(t => t.slice(0, 24));
    const told = new Set();
    const turns = [];
    const take = () => { const n = st.log[st.log.length - 1].narration; heads.forEach((h, i) => { if (n.includes(h)) told.add(i); }); return n; };
    const phase = st.time.phase;
    await G.Pipeline.submit('/wait ' + ({ morning: 'afternoon', afternoon: 'evening', evening: 'night', night: 'morning' })[phase]);
    turns.push({ handed: (G.Pipeline.lastTurn.ctx.due || []).length, narr: take(), left: st.dueEvents.map(d => d.seedId) });
    for (let i = 0; i < 4 && st.dueEvents.length; i++) {
      G.Api.Mock.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
      G.Api.Mock.queue('bookkeep', {});
      await G.Pipeline.submit('I look around');
      turns.push({ handed: (G.Pipeline.lastTurn.ctx.due || []).length, narr: take(), left: st.dueEvents.map(d => d.seedId) });
    }
    const done = texts.map((t, i) => !st.dueEvents.some(d => d.seedId === 'seed_t8_many' + i));
    return { turns, told: Array.from(told).sort(), done };
  });
  const words = t => (t.trim().match(/\S+/g) || []).length;
  assert.equal(r.turns[0].handed, 6, 'a wait hands them all over');
  for (const t of r.turns) assert.ok(words(t.narr) <= 90, `${words(t.narr)} words: ${t.narr}`);
  assert.ok(r.turns[0].left.length > 0, 'some wait for the next narration: ' + r.turns[0].narr);
  assert.deepEqual(r.done, r.done.map(() => true), 'all told in the end');
  assert.deepEqual(r.told, [0, 1, 2, 3, 4, 5], 'each one in a narration: ' + r.turns.map(t => t.narr).join(' || '));
});

s.run();
