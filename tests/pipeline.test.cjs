'use strict';
/* Milestone 3: the turn pipeline (SPEC.md section 6) against the mock
   provider. Every id and name comes from Game.data / Game.state (see
   fixtures and findScene in helpers.cjs), so this suite survives a change of
   town. Run with: node tests/run.cjs pipeline */
const assert = require('assert/strict');
const { suite, quickStart, stateJson, sendText, fixtures, findScene, place, LAPTOP } = require('./helpers.cjs');

const s = suite('pipeline');

const lastPacket = (page, method) => page.evaluate(m => { const c = Game.Api.Mock.calls.filter(x => x.method === m); return c.length ? c[c.length - 1].text : null; }, method || 'narrate');
const calls = page => page.evaluate(() => Game.Api.Mock.calls.map(c => c.method));
const counts = page => page.evaluate(() => ({ npcs: Game.state.npcs.length, locs: Game.state.locations.length, items: Game.state.locations.reduce((n, l) => n + ((l.items || []).length), 0), inv: Game.state.player.inventory.length }));
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.textContent : null; });
const lastError = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice.error')].pop(); return n ? n.textContent : null; });
const lastQuiet = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-quiet')].pop(); return n ? n.textContent : null; });
const lastLog = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const esc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const the = name => name.replace(/^The /, 'the ');
/* The retry lock's notice: one wording for a failed roll and for something already done (direction change 13). */
const LOCKED = 'You already tried that here. Change something first: a different approach, something to use or offer, another place, or let time pass (/wait or /rest).';
/* Two exits: one from where the player stands, and one onward from there. */
const route = page => page.evaluate(() => {
  const G = Game;
  const here = G.State.loc(G.state.player.locationId);
  const open = id => { const l = G.State.loc(id); return l && !l.closed ? l : null; };
  const a = here.exits.map(open).find(Boolean);
  const b = a.exits.map(open).find(l => l && l.id !== here.id) || here;
  const pick = l => ({ id: l.id, name: l.name, exits: l.exits.map(id => G.State.loc(id).name) });
  return { here: pick(here), a: pick(a), b: pick(b) };
});
/* Set every NPC in the current scene to attitude 0 (so nobody rescues). */
const calm = page => page.evaluate(() => {
  const G = Game;
  const here = G.State.npcsAt(G.state.player.locationId);
  G.State.apply({ effects: here.filter(n => n.attitude !== 0).map(n => ({ op: 'attitudeDelta', npcId: n.id, delta: -n.attitude })) });
});
const hurtTo = (page, hp) => page.evaluate(hp => Game.State.apply({ hpDelta: hp - Game.state.player.hp, lastRollKey: null }), hp);

s.test('a full turn runs parse, roll, narration, bookkeeping, time and autosave; mock narration is tagged', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.queue('bookkeep', { journalEntry: 'Read the notice by the door.' }); Game.Pipeline.forceNextRoll(15); });
  await sendText(page, 'I try to read the notice by the door');
  const r = await page.evaluate(() => {
    const st = Game.state;
    const env = Game.Storage.loadAutosave();
    return {
      turn: st.meta.turn, log: st.log.length, last: st.log[1], shorts: st.time.shorts, journal: st.journal.map(j => j.text),
      saved: env.state.log.length, tag: [...document.querySelectorAll('#feed .f-narr[data-mock="1"] .f-tag')].map(e => e.textContent),
      roll: document.querySelector('#feed .f-roll').textContent, bg: Game.data.BACKGROUNDS[0].name, age: st.player.age, bgAge: Game.data.BACKGROUNDS[0].age
    };
  });
  assert.deepEqual(await calls(page), ['parse', 'narrate', 'bookkeep']);
  assert.equal(r.turn, 1);
  assert.equal(r.log, 2);
  assert.equal(r.last.input, 'I try to read the notice by the door');
  assert.equal(r.last.roll.d20, 15);
  assert.equal(r.last.mock, true);
  assert.match(r.last.narration, /Wits roll, (success|critical success|partial success)/);
  assert.equal(r.shorts, 1, 'a short action');
  assert.ok(r.journal.includes('Read the notice by the door.'), 'queued bookkeeper reply applied');
  assert.equal(r.saved, 2, 'autosaved after the turn');
  assert.deepEqual(r.tag, ['Mock narration']);
  assert.match(r.roll, /^Wits 15/);
  const packet = await lastPacket(page);
  const lines = packet.split('\n').map(l => l.split(':')[0]);
  for (const label of ['DAY 1, MORNING (early) · Location', 'PLAYER', 'PRESENT', 'ACTION', 'ROLL', 'COMPLICATION', 'DUE EVENT', 'STORY SO FAR', 'MODE']) assert.ok(lines.includes(label), 'packet line ' + label);
  assert.ok(lines.some(l => l.startsWith('THIS SCENE (since the player came to ')), 'packet line THIS SCENE');
  assert.ok(!lines.includes('LAST 3 TURNS'), 'THIS SCENE took the place of LAST 3 TURNS');
  // The player's age beside the name: the background's default when the form left it alone.
  assert.equal(r.age, r.bgAge);
  assert.ok(packet.includes(`PLAYER: Tester (${r.age}, ${r.bg.toLowerCase()}). Reputation: unknown. Conditions: none.`));
  assert.match(packet, /\nMODE: normal\nLENGTH: 2 to 4 sentences, under 90 words\. Stop at the first moment the player must respond\. Not everyone and everything listed needs a mention\.\nVARIETY: [^\n]+$/, 'MODE, then the LENGTH line last');
  // Seeds and the goals and secrets of anyone not in the scene stay hidden; the people here carry theirs in their own line (direction change 10).
  const hidden = await page.evaluate(() => { const here = Game.Pipeline.lastTurn.ctx.presentIds; const bare = t => t.replace(/[.]+$/, ''); return [].concat(...Game.state.npcs.filter(n => !here.includes(n.id)).map(n => [n.secret, n.goal]), Game.state.seeds.map(sd => sd.effect)).filter(Boolean).map(bare); });
  for (const x of hidden) assert.ok(!packet.includes(x), 'hidden field in packet: ' + x.slice(0, 40));
  // The tag survives a rebuild of the feed (reload).
  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.locator('#feed .f-narr[data-mock="1"] .f-tag').count(), 1);
});

s.test('moving between locations updates the top bar and the Places panel', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await route(page);
  await sendText(page, `I walk to ${r.a.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), r.a.id);
  assert.equal(await page.textContent('#tb-loc'), r.a.name);
  await page.click('#tab-places');
  assert.equal(await page.textContent('#panel-body h2'), r.a.name);
  const places = await page.innerText('#panel-body');
  for (const exit of r.a.exits) assert.ok(places.includes(exit), 'exit listed: ' + exit);
  await sendText(page, `I head to ${r.b.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), r.b.id);
  assert.equal(await page.textContent('#panel-body h2'), r.b.name);
  assert.ok((await lastLog(page)).narration.includes(`make your way to ${the(r.b.name)}`));
  assert.ok((await lastPacket(page)).includes(`DESTINATION: ${r.b.name} — `));
  // Somewhere that is not a place stays a local action.
  await sendText(page, 'I walk around the room');
  assert.equal(await page.evaluate(() => Game.state.player.locationId), r.b.id);
});

s.test('"I talk to the dragon by the fire" in the tavern: no dragon, nothing created, narrator told', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  assert.ok(fx.tavern, 'the town has a tavern or bar');
  await place(page, fx.tavern.id, 'evening');
  const before = await counts(page);
  await sendText(page, 'I talk to the dragon by the fire');
  assert.deepEqual(await counts(page), before, 'nothing was created');
  assert.match((await lastLog(page)).narration, /There is no dragon here/);
  assert.match(await lastPacket(page), /NOT PRESENT: dragon \(does not exist in this town; it is simply not there\)/);
  assert.match(await lastPacket(page, 'bookkeep'), /DOES NOT EXIST \(record nothing about it\): dragon/);
  // A wizard is refused the same way.
  await sendText(page, 'I ask the wizard for a potion');
  assert.deepEqual(await counts(page), before);
  // A world fact claimed without a story point creates nothing either.
  const sp = await page.evaluate(() => Game.state.player.storyPoints);
  await sendText(page, 'My cousin is waiting for me by the door');
  assert.deepEqual(await counts(page), before);
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), sp);
  assert.match(await lastPacket(page), /NOT PRESENT: cousin of yours \(the player claims this, but it is not true in this world/);
});

/* The cast is fixed (docs/BUILD_PLAN.md, direction change 8): every person
   is written by hand, and the game never makes one. */
const castFacts = page => page.evaluate(() => {
  const T = Game.data.TOWN_DATA;
  const wife = T.npcs.find(n => /^Mavis /.test(n.name));
  const husband = T.npcs.find(n => (n.relations || []).some(r => r.npcId === wife.id && r.relation === 'wife'));
  return { wife: { id: wife.id, name: wife.name, role: wife.role, age: wife.age }, husband: { id: husband.id, name: husband.name, first: husband.name.split(' ')[0] } };
});
s.test('the cast is fixed: a new: person nobody in the cast answers to is NOT PRESENT (does_not_exist) and nothing is made; "Dewayne\'s wife" and "Mavis" are the cast\'s Mavis; the narrator gets the cast as a second cached system block; the model cannot add a person', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  await place(page, fx.tavern.id, 'evening');
  const c = await castFacts(page);
  await page.evaluate(() => { window.__narr = []; const orig = Game.Api.Mock.narrate; Game.Api.Mock.narrate = function (packet) { window.__narr.push({ system: packet.system, town: packet.town, cast: packet.cast }); return orig.apply(this, arguments); }; });
  const before = await counts(page);
  // Someone nobody in the cast is: not there, nothing made, the narrator and the bookkeeper told.
  assert.ok(await page.evaluate(() => !Game.state.npcs.some(n => Game.Town.mentions(' barmaid ', n))), 'no barmaid in the cast');
  await sendText(page, 'I ask the barmaid for a drink');
  assert.deepEqual(await counts(page), before, 'nobody was made');
  assert.match(await lastPacket(page), /\nNOT PRESENT: barmaid \(does not exist in this town; it is simply not there\)\./);
  assert.match(await lastPacket(page, 'bookkeep'), /DOES NOT EXIST \(record nothing about it\): barmaid/);
  assert.match((await lastLog(page)).narration, /There is no barmaid here\./);
  // "Dewayne's wife": the cast's relations say who she is.
  await page.evaluate(first => Game.Api.Mock.queue('parse', { actionType: 'talk', targets: [`new:${first}'s wife`] }), c.husband.first);
  await sendText(page, `I ask around for ${c.husband.first}'s wife`);
  assert.ok((await page.evaluate(() => Game.Pipeline.lastTurn.action.targets)).includes(c.wife.id), `${c.husband.first}'s wife is ${c.wife.id}`);
  assert.deepEqual(await counts(page), before);
  assert.ok((await lastPacket(page)).includes(`NOT PRESENT: ${c.wife.name} (not here right now)`), 'she exists, elsewhere');
  // Her name alone, as the player types it: the mock parser hears the whole cast.
  await sendText(page, 'I ask Loretta if Mavis is working tonight');
  assert.ok((await page.evaluate(() => Game.Pipeline.lastTurn.action.targets)).includes(c.wife.id));
  assert.ok((await lastPacket(page, 'parse')).includes(`\nEVERYONE ELSE IN TOWN (not met yet; nobody else exists): `));
  assert.deepEqual(await counts(page), before);
  // The narrator: the style block, the town and the cast (cached system blocks), the same every turn.
  const narr = await page.evaluate(() => ({ calls: window.__narr, style: Game.Style.systemPrompt(), town: Game.Pipeline.townBlock(), cast: Game.Pipeline.castBlock() }));
  assert.ok(narr.calls.length >= 3);
  for (const x of narr.calls) assert.deepEqual([x.system, x.town, x.cast], [narr.style, narr.town, narr.cast]);
  assert.ok(narr.cast.startsWith('CAST (everyone who exists in this town; never invent anyone else):\n'));
  const line = narr.cast.split('\n').find(l => l.startsWith(c.wife.id + ' — '));
  assert.ok(line.startsWith(`${c.wife.id} — ${c.wife.name} (${c.wife.age}, she/her; ${c.wife.role}; wife of ${c.husband.name}`), line);
  assert.match(line, /home: the Mangum House/);
  const body = await page.evaluate(n => Game.Api.requestBody('narrator', { system: n.style, blocks: [n.town, n.cast], user: 'x', cache: true, stream: true }).system, narr);
  assert.deepEqual(body, [narr.style, narr.town, narr.cast].map(text => ({ type: 'text', text, cache_control: { type: 'ephemeral' } })));
  // The bookkeeper cannot add a person: the cast is fixed.
  await page.evaluate(() => Game.Api.Mock.queue('bookkeep', { peopleRevealed: [{ name: 'Earl Toler', pronouns: 'he', relationToNpcId: '', who: 'brother' }] }));
  await sendText(page, 'I ask Loretta about her brother');
  assert.deepEqual(await counts(page), before);
  assert.match(await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'rejected' && /^peopleRevealed/.test(d.path || '')).map(d => d.reason).join(' | ')), /the cast is fixed/);
  // Reload: still exactly the cast.
  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.deepEqual(await counts(page), before);
});

s.test('a failed lockpick is narrated as a failure, changes something, and the identical retry is refused', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r0 = await route(page);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await sendText(page, 'I try to pick the lock on the back door');
  const r = await page.evaluate(() => ({ last: Game.state.log[Game.state.log.length - 1], lock: Game.state.meta.lastRollKey, roll: Game.Pipeline.lastTurn.roll }));
  assert.equal(r.roll.tier, 'failure');
  assert.equal(r.roll.stat, 'stealth');
  assert.ok(r.roll.complication, 'a complication was rolled');
  assert.ok(r.last.narration.includes('failure') && r.last.narration.includes(r.roll.complication), r.last.narration);
  assert.match(await lastPacket(page), new RegExp(`COMPLICATION: ${esc(r.roll.complication)}`));
  assert.ok(r.lock);
  const before = await stateJson(page);
  await sendText(page, 'I try to pick the lock on the back door');
  assert.equal(await lastNotice(page), LOCKED);
  assert.equal(await stateJson(page), before, 'the refused retry changed nothing');
  assert.equal(await page.inputValue('#cmd'), '');
  // Once the situation changes (another place), the same attempt rolls again.
  await sendText(page, `I walk to ${r0.a.name}`);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(18));
  await sendText(page, 'I try to pick the lock on the back door');
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.roll.d20), 18);
  // A critical failure leaves a lasting consequence (a condition here).
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, 'I try to sneak past the crowd');
  const c = await page.evaluate(() => ({ cond: Game.state.player.conditions.map(x => x.name), packet: Game.Api.Mock.calls.filter(x => x.method === 'narrate').pop().text }));
  assert.ok(c.cond.includes('Twisted ankle'), JSON.stringify(c.cond));
  assert.match(c.packet, /COMPLICATION: .+; lasting consequence: twisted ankle/);
});

s.test('a natural 20 earns a story point, capped at 3', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 2);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(20));
  await sendText(page, 'I try to read the faded sign');
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 3);
  assert.match(await lastQuiet(page), /Natural 20: you earn a story point \(3 of 3\)/);
  assert.match(await page.evaluate(() => Game.state.log[1].narration), /critical success/);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(20));
  await sendText(page, 'I try to climb the wall');
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 3, 'never above 3');
  assert.equal(await page.locator('#feed .f-quiet').count(), 1);
});

s.test('fights cost 1-3 HP on a failure and 3 on a critical failure; 0 HP is a defeat chosen from context', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  const sc = await findScene(page, { min: 2, watchy: false, notTypes: ['police', 'watch'] });
  assert.ok(sc, 'a scene with two ordinary NPCs');
  const [a, b] = sc.npcs;
  await place(page, sc.loc.id, sc.phase);
  await calm(page);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(2));
  await sendText(page, `I attack ${a.name}`);
  const t = await page.evaluate(() => ({ hp: Game.state.player.hp, t: Game.Pipeline.lastTurn }));
  assert.equal(t.t.roll.tier, 'failure');
  assert.equal(t.t.action.actionType, 'attack');
  assert.ok(t.hp >= 7 && t.hp <= 9, 'took 1 to 3 damage, hp ' + t.hp);
  assert.match(await lastQuiet(page), new RegExp(`You take ${10 - t.hp} damage`));
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, `I punch ${b.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.hp), t.hp - 3, 'critical failure costs 3');
  // Robbed: nobody friendly, not the law, and there is money to take.
  await hurtTo(page, 1);
  await page.evaluate(() => { if (Game.state.player.gold < 1) Game.State.apply({ goldDelta: 5 }); });
  const t0 = await page.evaluate(() => Game.state.time.phase);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, `I attack ${a.name} again`);
  const d = await page.evaluate(() => ({ p: Game.state.player, log: Game.state.log[Game.state.log.length - 1], packet: Game.Api.Mock.calls.filter(x => x.method === 'narrate').pop().text, phase: Game.state.time.phase }));
  assert.equal(d.p.lastDefeat.outcome, 'robbed');
  assert.equal(d.p.gold, 0);
  assert.equal(d.p.hp, 1);
  assert.ok(d.p.conditions.some(c => c.name === 'Beaten'));
  assert.notEqual(d.phase, t0, 'time passed while out cold');
  assert.match(d.packet, /\nDEFEAT: the player is beaten senseless/);
  assert.match(d.log.narration, /You black out\. When you come to, your (purse|wallet) is gone, and .+ with it\./);
  // Left in a gutter: no money left, so they wake in the poor quarter.
  await place(page, sc.loc.id, sc.phase);
  await calm(page);
  await hurtTo(page, 1);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, `I attack ${a.name}`);
  const g = await page.evaluate(() => ({ p: Game.state.player, n: Game.state.log[Game.state.log.length - 1].narration }));
  assert.equal(g.p.lastDefeat.outcome, 'gutter');
  const gutter = fx.slum && fx.slum.id !== sc.loc.id ? fx.slum : null;
  assert.equal(g.p.locationId, gutter ? gutter.id : sc.loc.id);
  assert.match(g.n, /You wake in a gutter in /);
  // Rescued: a friendly NPC in the scene picks them up.
  await place(page, sc.loc.id, sc.phase);
  await calm(page);
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: 60 }] }), a.id);
  await hurtTo(page, 1);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, `I attack ${b.name}`);
  const r = await page.evaluate(() => Game.state.player);
  assert.equal(r.lastDefeat.outcome, 'rescued');
  assert.equal(r.hp, 3);
  assert.ok((await lastLog(page)).narration.includes(`${a.name} is kneeling beside you`));
  // Captured: the law beat them.
  const law = await findScene(page, { watchy: true });
  if (law) {
    await place(page, law.loc.id, law.phase);
    await calm(page);
    await hurtTo(page, 1);
    await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
    await sendText(page, `I attack ${law.npcs[0].name}`);
    const c = await page.evaluate(() => Game.state.player);
    assert.equal(c.lastDefeat.outcome, 'captured');
    assert.equal(c.locationId, fx.watch ? fx.watch.id : law.loc.id);
  }
});

s.test('with Permadeath on, 0 HP ends the story; turns and /undo are refused, /load still works', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, '/save Before');
  const sc = await findScene(page, { watchy: false });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Storage.saveSettings({ permadeath: true }); Game.State.apply({ hpDelta: 1 - Game.state.player.hp }); Game.Pipeline.forceNextRoll(1); });
  await sendText(page, `I attack ${sc.npcs[0].name}`);
  const p = await page.evaluate(() => Game.state.player);
  assert.equal(p.dead, true);
  assert.equal(p.hp, 0);
  assert.equal(p.lastDefeat.outcome, 'dead');
  assert.match((await lastLog(page)).narration, /Your story ends here/);
  const log = await page.evaluate(() => Game.state.log.length);
  for (const t of ['I get up', '/look', '/undo', '/rest']) {
    await sendText(page, t);
    assert.equal(await lastNotice(page), 'Your story has ended. Load a saved game or start a new one.', t);
  }
  assert.equal(await page.evaluate(() => Game.state.log.length), log);
  await sendText(page, '/load Before');
  assert.equal(await page.evaluate(() => !!Game.state.player.dead), false);
});

s.test('/look describes the whole scene in zoom mode with no roll, no parse, no bookkeeping and no time', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => Game.Api.Mock.clear());
  const here = await page.evaluate(() => Game.State.loc(Game.state.player.locationId));
  const t0 = await page.evaluate(() => JSON.stringify(Game.state.time));
  await sendText(page, '/look');
  assert.deepEqual(await calls(page), ['narrate']);
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state.time)), t0);
  const packet = await lastPacket(page);
  assert.match(packet, /\nMODE: ZOOM\nLENGTH: up to 6 sentences, under 150 words\. Stop at the first moment the player must respond\.\nVARIETY: [^\n]+$/);
  assert.match(packet, /\nROLL: none\n/);
  const last = await lastLog(page);
  assert.equal(last.input, '/look');
  assert.ok(last.narration.startsWith(`You take in ${the(here.name)}. ${here.description}`), last.narration);
  assert.equal(await page.locator('#feed .f-roll').count(), 0);
});

s.test('/zoom runs a normal turn with the 150-word limit; normal turns regenerate over 90 words', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const long = Array.from({ length: 120 }, (_, i) => (i % 12 === 11 ? 'door.' : 'mud')).join(' ');
  await page.evaluate(t => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', t); }, long);
  await sendText(page, '/zoom I kick the door off its last hinge');
  assert.deepEqual(await calls(page), ['parse', 'narrate', 'bookkeep'], 'one narration, no regeneration');
  const z = await page.evaluate(() => ({ c: Game.Api.Mock.calls, last: Game.state.log[Game.state.log.length - 1] }));
  assert.equal(z.c[0].input, 'I kick the door off its last hinge', 'the parser sees the action without the command');
  assert.match(z.c[1].text, /\nMODE: ZOOM\nLENGTH: up to 6 sentences, under 150 words\. Stop at the first moment the player must respond\.\nVARIETY: [^\n]+$/);
  assert.equal(z.last.input, '/zoom I kick the door off its last hinge');
  assert.equal(z.last.narration, long);
  await page.evaluate(t => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', t); }, long);
  await sendText(page, 'I kick the door again');
  assert.deepEqual(await calls(page), ['parse', 'narrate', 'narrate', 'bookkeep'], 'over 90 words regenerates once');
  assert.match(await lastPacket(page), /\nSTYLE CHECK FAILED on your last attempt: 120 words, limit 90\. Write it again in 2 to 4 sentences, under 90 words: keep the action and its outcome, and cut scenery and bystanders first\.$/);
  await sendText(page, '/zoom');
  assert.match(await lastNotice(page), /Zoom in on what\?/);
  assert.equal(await page.inputValue('#cmd'), '/zoom');
});

s.test('/skip advances time a phase at a time, ticking the world each phase, then narrates the arrival', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  // Places whose names are not part of another place's name and hold no phase word.
  const [t1, t2] = await page.evaluate(() => {
    const st = Game.state;
    const plain = n => n.toLowerCase().replace(/^the /, '');
    const ok = st.locations.filter(l => l.id !== st.player.locationId && !l.closed && !['tavern', 'bar'].includes(l.type) && !/morning|afternoon|evening|night|noon|dusk|dawn/i.test(l.name)
      && !st.locations.some(o => o !== l && plain(l.name).includes(plain(o.name)))).map(l => ({ id: l.id, name: l.name }));
    return ok.slice(0, 2);
  });
  await page.evaluate(() => { window.__ticks = []; const orig = Game.World.tick; Game.World.tick = info => { window.__ticks.push(info); return orig(info); }; Game.Api.Mock.clear(); });
  await sendText(page, `/skip to ${t1.name} at night`);
  const r = await page.evaluate(() => ({ ticks: window.__ticks, time: Game.state.time, loc: Game.state.player.locationId, last: Game.state.log[Game.state.log.length - 1], divider: [...document.querySelectorAll('#feed .f-divider')].pop().textContent }));
  assert.deepEqual(r.ticks.map(t => `${t.from.phase}>${t.to.phase}`), ['morning>afternoon', 'afternoon>evening', 'evening>night']);
  assert.ok(r.ticks.every(t => t.phasesPassed === 1 && t.cause === 'skip'));
  assert.equal(r.time.phase, 'night');
  assert.equal(r.loc, t1.id);
  assert.deepEqual(await calls(page), ['narrate'], 'narrator only');
  const packet = await lastPacket(page);
  assert.match(packet, /\nMODE: arrival \(ZOOM length allowed\)\nLENGTH: up to 6 sentences, under 150 words\. Stop at the first moment the player must respond\.\nVARIETY: [^\n]+$/);
  assert.ok(packet.includes(`\nTIME PASSED: the player skipped ahead to ${t1.name}, night of day 1`));
  assert.ok(packet.startsWith(`DAY 1, NIGHT (early; the player has not slept) · Location: ${t1.name}`));
  assert.equal(r.last.phase, 'night');
  assert.ok(r.last.narration.includes(`You arrive at ${the(t1.name)}`));
  assert.equal(r.divider, 'Day 1 · Night');
  // A goal the game cannot place is refused with a hint, and the text kept.
  await sendText(page, '/skip somewhere nice');
  assert.match(await lastNotice(page), /Try \/skip to the docks at night/);
  assert.equal(await page.inputValue('#cmd'), '/skip somewhere nice');
  await page.fill('#cmd', '');
  // A skip that names the phase it already is arrives in that phase: no time passes.
  const night0 = await page.evaluate(() => JSON.stringify(Game.state.time));
  await page.evaluate(() => { window.__ticks = []; });
  await sendText(page, `/skip to ${t2.name} at night`);
  assert.deepEqual(await page.evaluate(() => [Game.state.player.locationId, JSON.stringify(Game.state.time), window.__ticks.length]), [t2.id, night0, 0]);
  await sendText(page, `/skip to ${t1.name} at night`);
  // Skipping across midnight ticks into the next day.
  await page.evaluate(() => { window.__ticks = []; });
  await sendText(page, `/skip to ${t2.name} in the afternoon`);
  const t = await page.evaluate(() => ({ ticks: window.__ticks.map(x => `${x.to.day}:${x.to.phase}`), loc: Game.state.player.locationId }));
  assert.deepEqual(t.ticks, ['2:morning', '2:afternoon']);
  assert.equal(t.loc, t2.id);
  // A kind of place works too ("the tavern" / "the bar").
  const fx = await fixtures(page);
  if (fx.tavern && t2.id !== fx.tavern.id) {
    await sendText(page, `/skip to the ${fx.tavern.type === 'bar' ? 'bar' : 'tavern'}`);
    assert.equal(await page.evaluate(() => Game.state.player.locationId), fx.tavern.id);
  }
});

s.test('/rest sleeps until morning, heals 3 and ticks every phase; /wait waits in place until a phase', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.State.apply({ hpDelta: -6 }); window.__ticks = []; const orig = Game.World.tick; Game.World.tick = info => { window.__ticks.push(info); return orig(info); }; Game.Api.Mock.clear(); });
  await sendText(page, '/rest');
  const r = await page.evaluate(() => ({ hp: Game.state.player.hp, time: Game.state.time, ticks: window.__ticks.map(t => `${t.to.day}:${t.to.phase}:${t.cause}`), last: Game.state.log[Game.state.log.length - 1] }));
  assert.equal(r.hp, 7);
  assert.equal(r.time.day, 2);
  assert.equal(r.time.phase, 'morning');
  assert.deepEqual(r.ticks, ['1:afternoon:rest', '1:evening:rest', '1:night:rest', '2:morning:rest']);
  assert.deepEqual(await calls(page), ['narrate']);
  assert.match(await lastPacket(page), /\nTIME PASSED: the player slept until morning, day 2, and recovered 3 HP/);
  assert.equal(r.last.day, 2);
  await page.evaluate(() => { window.__ticks = []; });
  const loc = await page.evaluate(() => Game.state.player.locationId);
  await sendText(page, '/wait evening');
  const w = await page.evaluate(() => ({ phase: Game.state.time.phase, loc: Game.state.player.locationId, ticks: window.__ticks.map(t => t.to.phase) }));
  assert.equal(w.phase, 'evening');
  assert.equal(w.loc, loc);
  assert.deepEqual(w.ticks, ['afternoon', 'evening']);
  assert.match(await lastPacket(page), /TIME PASSED: the player waited where they are until evening/);
  await sendText(page, '/wait evening');
  assert.equal(await lastNotice(page), 'It is already evening.');
  await sendText(page, '/wait a bit');
  assert.match(await lastNotice(page), /Wait until when\?/);
});

s.test('/fact spends a story point to make a statement true; it is refused with none left or if impossible', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  await page.evaluate(() => Game.Api.Mock.clear());
  const before = await counts(page);
  // A fact cannot add a person: everyone in town is already written (the cast is fixed). No point is spent.
  await sendText(page, '/fact my cousin lives here');
  assert.deepEqual(await calls(page), ['parse'], 'parser only');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls[0].mode), 'fact');
  assert.equal(await lastNotice(page), `Nobody like that lives in ${fx.town}: everyone in town is already written, so a story point can make something true about someone here, but it cannot add a person. No story point was spent.`);
  assert.deepEqual(await counts(page), before, 'nobody was made');
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 2);
  assert.equal(await page.inputValue('#cmd'), '/fact my cousin lives here', 'the line is kept to edit');
  await page.fill('#cmd', '');
  // Something impossible costs nothing.
  await sendText(page, '/fact a dragon sleeps under the bridge');
  assert.equal(await lastNotice(page), `That cannot be true in ${fx.town}. No story point was spent.`);
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 2);
  await page.fill('#cmd', '');
  // A link to an existing NPC named by their role ("the ferryman").
  const npc = await page.evaluate(() => {
    const live = Game.state.npcs.filter(n => n.alive !== false && n.status === 'free' && !/cousin/.test(n.role));
    const head = n => Game.Town.headPhrase(n.role, 'npc');
    const n = live.find(x => { const h = head(x); return h && !h.includes(' ') && h.length >= 4 && !live.some(m => m !== x && Game.Town.mentions(' ' + h + ' ', m)); });
    return { id: n.id, head: head(n) };
  });
  await sendText(page, `/fact the ${npc.head} owes me a favour`);
  const linked = await page.evaluate(id => Game.State.npc(id), npc.id);
  assert.ok(linked.memories.some(m => m.text === `Fact (a story point): the ${npc.head} owes Tester a favour` && m.weight === 3), JSON.stringify(linked.memories));
  assert.ok(linked.knownToPlayer);
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 1);
  assert.match(await lastNotice(page), /^Story point spent \(1 left\)\. It is now true: the /);
  const st = await page.evaluate(() => ({ journal: Game.state.journal.map(j => j.text), last: Game.state.log[Game.state.log.length - 1] }));
  assert.ok(st.journal.includes(`Fact: the ${npc.head} owes me a favour`));
  assert.equal(st.last.input, `/fact the ${npc.head} owes me a favour`);
  assert.equal((await counts(page)).npcs, before.npcs, 'a fact about someone here makes nobody');
  await page.evaluate(() => Game.State.apply({ storyPointsDelta: -1 }));
  // With no points left it is refused politely and nothing changes.
  const snap = await stateJson(page);
  await sendText(page, '/fact the baker is my uncle');
  assert.equal(await lastNotice(page), 'You have no story points to spend. You earn them when a thread is resolved or on a natural 20.');
  assert.equal(await stateJson(page), snap);
  assert.equal(await page.inputValue('#cmd'), '/fact the baker is my uncle');
});

s.test('a refusal shows the notice, restores the input and leaves state untouched (any role)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  for (const method of ['parse', 'narrate', 'bookkeep']) {
    const before = await stateJson(page);
    const nodes = await page.evaluate(() => document.getElementById('feed').childElementCount);
    await page.evaluate(m => Game.Api.Mock.queue(m, { refusal: { category: 'test', explanation: 'no' } }), method);
    await page.fill('#cmd', 'I do something the narrator will not write');
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => !Game.Pipeline.busy);
    assert.equal(await page.inputValue('#cmd'), 'I do something the narrator will not write', method);
    assert.equal(await lastNotice(page), 'The narrator declined that one. Try it another way.');
    assert.equal(await stateJson(page), before, method + ': state untouched');
    assert.equal(await page.evaluate(() => document.getElementById('feed').childElementCount), nodes + 1, method + ': only the notice was added');
    assert.equal(await page.evaluate(() => Game.State.undoDepth()), 0);
  }
  // An API error behaves the same way, with the error styling.
  await page.evaluate(() => Game.Api.Mock.queue('parse', { error: { type: 'overloaded_error' } }));
  await page.fill('#cmd', 'I try again');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.inputValue('#cmd'), 'I try again');
  assert.match(await lastError(page), /overloaded right now.*kept in the box/);
});

s.test('the style check regenerates once with a note naming the problem, and keeps the second try', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', 'The air is thick with smoke. What do you do?', 'Smoke drifts across the road.'); });
  await sendText(page, 'I look down the road');
  const r = await page.evaluate(() => ({ c: Game.Api.Mock.calls.filter(x => x.method === 'narrate'), last: Game.state.log[Game.state.log.length - 1].narration, feed: [...document.querySelectorAll('#feed .f-narr')].pop().innerText, dbg: Game.State.debugLog.filter(x => x.kind === 'style') }));
  assert.equal(r.c.length, 2);
  assert.ok(!/STYLE CHECK/.test(r.c[0].text));
  assert.match(r.c[1].text, /\nSTYLE CHECK FAILED on your last attempt: banned phrase "the air is thick with"; contains "What do you do"\. Write it again without that\.$/);
  assert.equal(r.c[0].text, r.c[1].text.split('\nSTYLE CHECK FAILED')[0], 'same packet plus the note');
  assert.equal(r.last, 'Smoke drifts across the road.');
  assert.ok(r.feed.includes('Smoke drifts across the road.') && !r.feed.includes('thick with'), 'the feed shows only the second try');
  assert.equal(r.dbg.length, 1);
  // A second failure is kept anyway (and logged).
  await page.evaluate(() => Game.Api.Mock.queue('narrate', 'As you wait, a sense of dread.', 'As you wait, nothing.'));
  await sendText(page, 'I wait a moment by the door');
  assert.equal((await lastLog(page)).narration, 'As you wait, nothing.');
  assert.ok(await page.evaluate(() => Game.State.debugLog.some(x => x.kind === 'style' && x.kept)));
});

s.test('the opening scene introduces present NPCs in a sentence', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const fx = await fixtures(page);
  for (const bgIndex of [fx.gateBg, fx.docksBg]) {
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { bgIndex });
    const r = await page.evaluate(() => ({ text: Game.state.log[0].narration, looks: Game.State.npcsAt(Game.state.player.locationId).slice(0, 2).map(n => n.look) }));
    const paras = r.text.split('\n\n');
    assert.equal(paras.length, 2);
    if (!r.looks.length) { assert.equal(paras[1], 'Nobody here pays you any attention yet.'); continue; }
    assert.match(paras[1], /^You notice (a|an|the) /);
    for (const look of r.looks) {
      const core = look.replace(/\.$/, '');
      assert.ok(paras[1].indexOf(core.charAt(0).toLowerCase() + core.slice(1)) > 0 || paras[1].includes(core), 'look appears inside a sentence: ' + look);
      assert.ok(!paras[1].startsWith(look), 'not as an orphan sentence: ' + look);
    }
    if (r.looks.length > 1) assert.match(paras[1], /\. Not far off is (a|an|the) /);
  }
});

s.test('the packet carries only relevant memories and one fresh rumour from a present NPC who would share it', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { rumour: true, minAtt: -25 });
  assert.ok(sc, 'someone with a rumour to share');
  const x = sc.npcs[0];
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(id => {
    const G = Game;
    G.State.apply({ newMemories: [{ npcId: id, text: 'Old trivia about the player', weight: 1 }, { npcId: id, text: 'The player saved their granddaughter', weight: 3 }] });
    G.state.meta.turn += 25; // let the weight-1 memory age out of "the last 20 turns"
    G.State.apply({ newMemories: [{ npcId: id, text: 'A fresh small thing', weight: 1 }] });
  }, x.id);
  const rumour = await page.evaluate(id => Game.state.rumours.find(r => !r.heard && r.sourceNpcId === id), x.id);
  await sendText(page, `I ask ${x.name} about the river`);
  const packet = await lastPacket(page);
  const present = packet.split('\n').find(l => l.startsWith('PRESENT:'));
  assert.match(present, /The player saved their granddaughter/);
  assert.match(present, /A fresh small thing/);
  assert.doesNotMatch(present, /Old trivia/);
  const line = packet.split('\n').find(l => l.startsWith('RUMOUR:'));
  assert.equal(line, `RUMOUR: ${x.name} might mention this, if it fits: "${rumour.text}"`, 'the text only, never its truth');
  assert.equal(await page.evaluate(id => Game.State.rumour(id).heard, rumour.id), true, 'the mock bookkeeper marked it heard');
  await sendText(page, `I ask ${x.name} about the weather`);
  const again = (await lastPacket(page)).split('\n').find(l => l.startsWith('RUMOUR:')) || '';
  assert.ok(!again.includes(rumour.text), 'not offered again once heard');
  // A hostile NPC shares nothing.
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: -200 }] }), x.id);
  await sendText(page, `I ask ${x.name} what they have seen`);
  assert.doesNotMatch(await lastPacket(page), /\nRUMOUR:/);
});

s.test('buying at a listed price never rolls and changes money and inventory', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => Game.State.apply({ goldDelta: 50 }));
  // The cheapest and the dearest listed goods that the name alone identifies.
  const goods = await page.evaluate(() => {
    const own = g => Game.Town.goodsFor('i buy ' + g.name.toLowerCase()) === g;
    const list = Game.data.TABLES.items.goods.filter(own).slice().sort((a, b) => a.price - b.price);
    const cur = Game.data.TOWN_DATA.currency;
    const fmt = n => (cur ? `${cur.symbol}${n}` : `${n} gold`);
    return { cheap: list[0], dear: list[list.length - 1], cheapText: fmt(list[0].price) };
  });
  const gold = await page.evaluate(() => Game.state.player.gold);
  await sendText(page, `I buy ${goods.cheap.name.toLowerCase()}`);
  const r = await page.evaluate(() => ({ gold: Game.state.player.gold, inv: Game.state.player.inventory.map(i => i.name), roll: Game.Pipeline.lastTurn.roll, journal: Game.state.journal.slice(-1)[0].text }));
  assert.equal(r.roll, null);
  assert.equal(r.gold, gold - goods.cheap.price);
  assert.ok(r.inv.includes(goods.cheap.name));
  assert.equal(r.journal, `Bought ${goods.cheap.name.charAt(0).toLowerCase() + goods.cheap.name.slice(1)} for ${goods.cheapText}.`);
  // Too expensive: nothing happens to money or inventory.
  await page.evaluate(price => Game.State.apply({ goldDelta: price - 1 - Game.state.player.gold }), goods.dear.price);
  const inv = await page.evaluate(() => Game.state.player.inventory.length);
  await sendText(page, `I buy ${goods.dear.name.toLowerCase()}`);
  assert.equal(await page.evaluate(() => Game.state.player.gold), goods.dear.price - 1);
  assert.equal(await page.evaluate(() => Game.state.player.inventory.length), inv);
});

s.test('insults lower attitude, leave a memory and turn the greeting cold; persuasion warms on a success', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { minAtt: -15, maxAtt: 20 });
  const x = sc.npcs[0];
  await place(page, sc.loc.id, sc.phase);
  for (let i = 0; i < 3; i++) await sendText(page, `I insult ${x.name}`);
  const n = await page.evaluate(id => Game.State.npc(id), x.id);
  assert.equal(n.attitude, x.attitude - 45);
  assert.deepEqual(n.memories.filter(m => /insulted/.test(m.text)).map(m => m.weight), [2, 3, 3]);
  await sendText(page, `I talk to ${x.name}`);
  assert.ok((await lastLog(page)).narration.includes(`${x.name} gives you a cold look`));
  await page.evaluate(() => Game.Pipeline.forceNextRoll(19));
  await sendText(page, `I persuade ${x.name} to help me`);
  assert.equal(await page.evaluate(id => Game.State.npc(id).attitude, x.id), x.attitude - 45 + 8);
});

s.test('modern vocabulary: plausibility and the mock parser know bartenders and deputies; dragons stay out; cash labels follow TOWN_DATA.currency', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const T = Game.Town;
    const words = ['bartender', 'waitress', 'clerk', 'mechanic', 'deputy', 'barmaid', 'smith', 'trucker'];
    const verdict = (d, era) => { const v = T.plausible('new:' + d, 'bar', { era }); return `${v.plausible}/${v.kind}`; };
    const parsed = [];
    for (const w of ['bartender', 'waitress', 'clerk', 'mechanic', 'deputy', 'barmaid', 'dragon']) {
      const res = await Game.Api.Mock.parse({ input: `I ask the ${w} for help`, present: [], exits: [], knownLocations: [] });
      parsed.push(res.result.targets.join(','));
    }
    const dest = async (input, type) => (await Game.Api.Mock.parse({ input, present: [], exits: [{ id: 'loc_somewhere', name: 'Somewhere Else', type }], knownLocations: [] })).result.destinationId;
    return {
      modern: words.map(w => verdict(w, 'modern')), fantasy: words.map(w => verdict(w, 'fantasy')),
      dragon: [verdict('a dragon by the jukebox', 'modern'), verdict('a dragon by the fire', 'fantasy')],
      truck: [verdict('a pickup truck', 'modern'), verdict('a pickup truck', 'fantasy')],
      knight: [verdict('a knight in armour', 'modern'), verdict('a knight in armour', 'fantasy')],
      parsed,
      dest: [await dest('I head to the bar', 'bar'), await dest('I drive to the police station', 'police'), await dest('I walk down to the marina', 'marina'), await dest('I go to the trailer park', 'trailerpark')]
    };
  });
  assert.ok(r.modern.every(v => v === 'true/npc'), r.modern.join(' '));
  assert.ok(r.fantasy.every(v => v === 'true/npc'), r.fantasy.join(' '));
  assert.deepEqual(r.dragon.map(v => v.split('/')[0]), ['false', 'false']);
  assert.deepEqual(r.truck.map(v => v.split('/')[0]), ['true', 'false']);
  assert.deepEqual(r.knight.map(v => v.split('/')[0]), ['false', 'true']);
  assert.deepEqual(r.parsed, ['new:bartender', 'new:waitress', 'new:clerk', 'new:mechanic', 'new:deputy', 'new:barmaid', 'new:dragon']);
  assert.deepEqual(r.dest, ['loc_somewhere', 'loc_somewhere', 'loc_somewhere', 'loc_somewhere']);
  // Money labels: gold without a currency, cash with one.
  const gold = await page.evaluate(() => Game.state.player.gold);
  const plain = await page.evaluate(() => ({ bar: document.querySelector('.tb-gold').textContent, ch: (Game.UI.openPanel('character'), document.getElementById('panel-body').innerText), parse: Game.Pipeline.parsePacket('x').text }));
  const hasCurrency = await page.evaluate(() => !!Game.data.TOWN_DATA.currency);
  if (!hasCurrency) {
    assert.equal(plain.bar, `${gold} gold`);
    assert.match(plain.ch, new RegExp(`Gold\\s+${gold}`));
    assert.ok(plain.parse.includes(`; ${gold} gold; hp`), 'parser packet names the money');
  }
  const cash = await page.evaluate(() => {
    Game.State.town.currency = { symbol: '$', name: 'dollars' };
    Game.UI.renderGame();
    return { bar: document.querySelector('.tb-gold').textContent, ch: document.getElementById('panel-body').innerText, parse: Game.Pipeline.parsePacket('x').text, modern: Game.Town.plausible('new:a pickup truck', 'bar').plausible };
  });
  assert.equal(cash.bar, `$${gold}`);
  assert.match(cash.ch, new RegExp(`Cash\\s+\\$${gold}`));
  assert.ok(cash.parse.includes(`cash $${gold}`));
  assert.equal(cash.modern, true, 'a town with a currency is modern day');
  // The law's building: a police station takes arrests as well as a watch house.
  const arrested = await page.evaluate(() => {
    const G = Game;
    const n = G.state.npcs.find(x => x.status === 'free' && x.alive !== false && G.state.locations.some(l => Object.values(l.npcIdsBySchedule).some(a => a.includes(x.id))));
    // The town's own police station if it has one, otherwise a test one.
    const own = G.state.locations.find(l => l.type === 'police');
    if (!own) G.State.apply({ addLocations: [{ id: 'loc_test_police', name: 'Police Station', type: 'police', description: 'A test station.', exits: [G.state.player.locationId] }] });
    const stationId = own ? own.id : 'loc_test_police';
    G.State.apply({ effects: [{ op: 'npcStatus', npcId: n.id, status: 'arrested' }] });
    return Object.values(G.State.loc(stationId).npcIdsBySchedule).every(a => a.includes(n.id));
  });
  assert.ok(arrested, 'arrested NPCs go to the police station');
});

s.test('a thing noticed one turn is in the scene the next: "look for some rope" leaves it here, "pick up the rope" targets it by id and takes it', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const locId = await page.evaluate(() => Game.state.player.locationId);
  const itemsAt = () => page.evaluate(id => (Game.State.loc(id).items || []).map(i => i.id), locId);
  const carried = () => page.evaluate(() => Game.state.player.inventory.some(i => i.id === 'item_rope'));
  const before = await itemsAt();
  assert.ok(!before.includes('item_rope') && !(await carried()), 'no rope here or carried yet');
  await page.evaluate(() => Game.Api.Mock.clear());
  await sendText(page, 'I look for some rope');
  const t1 = await page.evaluate(() => Game.Pipeline.lastTurn);
  assert.deepEqual(t1.action.targets, ['item_rope'], 'new:rope became a real item');
  assert.deepEqual(await itemsAt(), before.concat('item_rope'), 'lying here, not carried');
  assert.equal(await carried(), false);
  assert.match(await lastPacket(page), /\nITEMS HERE: (.+, )?Rope[,.]/);
  assert.equal((await page.evaluate(() => Game.State.entityById('item_rope'))).name, 'Rope', 'entityById finds a thing lying where the player is');
  await sendText(page, 'I pick up the rope');
  const t2 = await page.evaluate(() => Game.Pipeline.lastTurn);
  assert.equal(t2.action.actionType, 'take');
  assert.deepEqual(t2.action.targets, ['item_rope'], 'targeted by its id');
  assert.deepEqual(t2.ctx.notPresent, [], 'and treated as present');
  const packet = await lastPacket(page);
  assert.match(packet, /\nITEMS HERE: (.+, )?Rope[,.]/);
  assert.doesNotMatch(packet, /NOT PRESENT/);
  assert.doesNotMatch(await lastPacket(page, 'bookkeep'), /DOES NOT EXIST/);
  assert.doesNotMatch(t2.narration, /There is no/);
  assert.match(t2.narration, /You pick up the rope\./);
  assert.equal(await carried(), true, 'the bookkeeper picked it up');
  assert.deepEqual(await itemsAt(), before, 'and it left the scene');
});

/* A walk and then an action there ("I head to the bar and ask the
   bartender..."): the engine moves the player first, so the rest of the turn
   happens at the destination. */
const elsewhere = (page, notId) => page.evaluate(id => {
  const st = Game.state;
  const l = st.locations.find(x => x.id !== id && x.id !== st.player.locationId && !x.closed) || st.locations.find(x => x.id !== id && !x.closed);
  return { id: l.id, name: l.name, type: l.type };
}, notId);
const line = (packet, label) => (String(packet || '').split('\n').find(l => l.startsWith(label + ':')) || '');

s.test('a walk then a talk ("I walk to X and talk to Y") moves the player first: MOVED line, the people there, and the bookkeeper does not move them back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  // The mock parser's compound rule, on synthetic places and people.
  const m = await page.evaluate(async () => {
    const P = (input, present, known, places) => Game.Api.Mock.parse({ input, present: present || [], knownNpcs: known || [], exits: [], knownLocations: places || [] }).then(x => x.result);
    const bar = { id: 'loc_the_rail', name: 'The Rail', type: 'bar' };
    const gas = { id: 'loc_gas_and_go', name: 'Gas and Go', type: 'gas' };
    const owner = { id: 'npc_bo_wick', name: 'Bo Wick', role: 'owner of the feed store' };
    return {
      bartender: await P('I head to the bar and ask the bartender what people are saying about the vote.', [owner], [], [bar]),
      named: await P('I walk over to the Rail and then talk to Bo Wick', [owner], [], [bar]),
      andInName: await P('I walk to Gas and Go and look for some rope', [], [], [gas, bar]),
      plain: await P('I head to the Rail to find Bo', [], [owner], [bar])
    };
  });
  assert.deepEqual([m.bartender.actionType, m.bartender.destinationId, m.bartender.targets, m.bartender.timeCost], ['talk', 'loc_the_rail', ['new:bartender'], 'short'], 'talk at the bar, the bartender is new, nobody here stands in');
  assert.deepEqual([m.named.actionType, m.named.destinationId, m.named.targets], ['talk', 'loc_the_rail', ['npc_bo_wick']], 'someone here who walks along is named by name');
  assert.deepEqual([m.andInName.actionType, m.andInName.destinationId, m.andInName.targets], ['search', 'loc_gas_and_go', ['new:some rope']], 'a place with "and" in its name');
  assert.deepEqual([m.plain.actionType, m.plain.destinationId], ['move', 'loc_the_rail'], 'a plain move stays a move');

  // In play: someone at a place, at a phase; the player starts somewhere else.
  const sc = await findScene(page, { min: 1, minAtt: -25 });
  assert.ok(sc, 'a scene with someone in it');
  const origin = await elsewhere(page, sc.loc.id);
  await place(page, origin.id, sc.phase);
  const npc = sc.npcs[0];
  await page.evaluate(id => { Game.State.apply({ npcKnownToPlayer: [id] }); Game.Api.Mock.clear(); }, npc.id);
  // A bookkeeper that tries to put the player back where they started is overruled.
  await page.evaluate(id => Game.Api.Mock.queue('bookkeep', { playerLocationId: id }), origin.id);
  const shorts = await page.evaluate(() => Game.state.time.shorts);
  await sendText(page, `I walk to ${sc.loc.name} and talk to ${npc.name}`);
  const t = await page.evaluate(() => ({ loc: Game.state.player.locationId, turn: Game.Pipeline.lastTurn, shorts: Game.state.time.shorts, phase: Game.state.time.phase, rejected: Game.State.debugLog.filter(x => x.kind === 'rejected' && x.path === 'playerLocationId').map(x => x.reason) }));
  assert.equal(t.loc, sc.loc.id, 'the player is at the destination');
  assert.equal(t.turn.action.actionType, 'talk');
  assert.ok(t.turn.action.targets.includes(npc.id), 'talking to them');
  assert.deepEqual(t.turn.ctx.notPresent, [], 'and they are present');
  assert.deepEqual(t.turn.ctx.moved, { fromId: origin.id, fromName: origin.name, toId: sc.loc.id, toName: sc.loc.name });
  assert.equal(t.turn.action.timeCost, 'short', 'the walk costs at least a short');
  assert.ok(t.shorts === shorts + 1 || t.phase !== sc.phase, 'a short passed');
  assert.ok(t.rejected.some(r => /ignored: the engine walked the player/.test(r)), 'the move back was ignored: ' + t.rejected.join(' | '));
  const parse = await lastPacket(page, 'parse');
  assert.ok(line(parse, 'OTHER PLACES IN TOWN (one move reaches any)').includes(`${sc.loc.id} — ${sc.loc.name} (${sc.loc.type})`), 'the parser sees places with their type');
  const packet = await lastPacket(page);
  assert.ok(packet.split('\n')[0].includes(` · Location: ${sc.loc.name} — `), 'the scene is the destination');
  assert.equal(line(packet, 'MOVED'), `MOVED: from ${origin.name} to ${sc.loc.name}, just now. The action happens here; give the walk one clause at most.`);
  const present = line(packet, 'PRESENT');
  for (const id of sc.presentIds) {
    const name = await page.evaluate(i => Game.State.npc(i).name, id);
    assert.ok(present.includes(name + ' ('), 'present at the destination: ' + name);
  }
  assert.equal(line(packet, 'DESTINATION'), '', 'no DESTINATION line: the player is already there');
  assert.doesNotMatch(packet, /NOT PRESENT/);
  assert.match(t.turn.narration, new RegExp(`^You walk over to ${esc(the(sc.loc.name))}\\.`));
  assert.ok(t.turn.narration.includes(npc.name), t.turn.narration);
  const book = await lastPacket(page, 'bookkeep');
  assert.ok(line(book, 'PLAYER').includes(`at ${sc.loc.id} (${sc.loc.name})`), 'the bookkeeper sees the new location');
  assert.ok(line(book, 'ALREADY APPLIED BY THE ENGINE (do not record again)').includes(`the walk from ${origin.id} to ${sc.loc.id}`));
  assert.equal(await page.textContent('#tb-loc'), sc.loc.name, 'the top bar follows');
  // A plain move still goes the old way: narrated as the walk, with DESTINATION.
  await sendText(page, `I walk to ${origin.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), origin.id);
  assert.ok(line(await lastPacket(page), 'DESTINATION').startsWith(`DESTINATION: ${origin.name} — `));
  assert.equal(line(await lastPacket(page), 'MOVED'), '');
});

s.test('a walk then a search creates the thing at the destination, not where the player started; /undo puts the player back; a closed destination is a walk to a shut door', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const origin = await page.evaluate(() => { const l = Game.State.loc(Game.state.player.locationId); return { id: l.id, name: l.name }; });
  const dest = await elsewhere(page, origin.id);
  const itemsAt = id => page.evaluate(i => (Game.State.loc(i).items || []).map(x => x.id), id);
  const before = { origin: await itemsAt(origin.id), dest: await itemsAt(dest.id) };
  assert.ok(!before.origin.includes('item_rope') && !before.dest.includes('item_rope'), 'no rope anywhere yet');
  const pre = await stateJson(page);
  await page.evaluate(() => Game.Api.Mock.clear());
  await sendText(page, `I walk to ${dest.name} and look for some rope`);
  const t = await page.evaluate(() => ({ loc: Game.state.player.locationId, turn: Game.Pipeline.lastTurn }));
  assert.equal(t.loc, dest.id);
  assert.equal(t.turn.action.actionType, 'search');
  assert.deepEqual(t.turn.action.targets, ['item_rope'], 'new:some rope became a real item');
  assert.deepEqual(await itemsAt(dest.id), before.dest.concat('item_rope'), 'lying at the destination');
  assert.deepEqual(await itemsAt(origin.id), before.origin, 'not where the player started');
  assert.match(line(await lastPacket(page), 'ITEMS HERE'), /\bRope\b/);
  assert.match(t.turn.narration, /You find a rope here\./);
  // /undo takes the whole turn back, the walk included.
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.player.locationId), origin.id, 'back where they started');
  assert.equal(await stateJson(page), pre, 'exactly the state before the turn');
  assert.equal(await page.textContent('#tb-loc'), origin.name);
  // A closed destination: no walk in, no roll; the turn is the walk to the shut door.
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'closeLocation', locationId: id }] }), dest.id);
  await page.evaluate(() => Game.Api.Mock.queue('parse', { needsRoll: true, stat: 'wits', difficulty: 'normal' }));
  await sendText(page, `I walk to ${dest.name} and look for some rope`);
  const c = await page.evaluate(() => ({ loc: Game.state.player.locationId, turn: Game.Pipeline.lastTurn }));
  assert.equal(c.loc, origin.id, 'still outside');
  assert.equal(c.turn.action.actionType, 'move');
  assert.equal(c.turn.roll, null, 'no roll');
  assert.ok(!c.turn.ctx.moved);
  assert.deepEqual(c.turn.ctx.created, [], 'nothing made at the door');
  assert.deepEqual(await itemsAt(origin.id), before.origin, 'nor where the player stands');
  assert.ok(line(await lastPacket(page), 'DESTINATION').includes('(closed: the player cannot go in)'));
});

s.test('a plain move arrives even when the bookkeeper leaves playerLocationId out or sets it back; a bookkeeper move on a non-move turn is respected', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await route(page);
  const where = () => page.evaluate(() => Game.state.player.locationId);
  const engineMoves = () => page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'rejected' && x.source === 'engine' && x.path === 'playerLocationId').map(x => x.reason));
  // The bookkeeper leaves it out: the engine moves the player, and says so in the debug log.
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.queue('bookkeep', { playerLocationId: null }); });
  await sendText(page, `I walk to ${r.a.name}`);
  assert.equal(await where(), r.a.id, 'arrived without the bookkeeper');
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.action.actionType), 'move');
  assert.ok(line(await lastPacket(page), 'DESTINATION').startsWith(`DESTINATION: ${r.a.name} — `), 'still narrated as the walk, from the origin');
  assert.ok((await lastPacket(page)).split('\n')[0].includes(` · Location: ${r.here.name} — `));
  assert.deepEqual(await engineMoves(), [`the bookkeeper left the player at ${r.here.id} after a move; the engine moved them to ${r.a.id}`]);
  // The bookkeeper sets it back to where the move started: the same.
  await page.evaluate(id => Game.Api.Mock.queue('bookkeep', { playerLocationId: id }), r.a.id);
  await sendText(page, `I walk to ${r.b.name}`);
  assert.equal(await where(), r.b.id, 'arrived although the bookkeeper set it back');
  assert.equal((await engineMoves()).length, 2);
  // A bookkeeper that does its job needs no help.
  await sendText(page, `I walk to ${r.a.name}`);
  assert.equal(await where(), r.a.id);
  assert.equal((await engineMoves()).length, 2, 'no engine move when the bookkeeper moved the player');
  // On a turn that is not a move, the bookkeeper may move the player (thrown out, carried off): respected.
  const out = await elsewhere(page, r.a.id);
  await page.evaluate(id => Game.Api.Mock.queue('bookkeep', { playerLocationId: id }), out.id);
  await sendText(page, 'I say hello');
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.action.actionType), 'talk');
  assert.equal(await where(), out.id, 'the bookkeeper moved the player and that stands');
  assert.equal((await engineMoves()).length, 2, 'and the engine did not undo it');
});

s.test('the retry lock holds across /look and an instant chat in the same place, and lifts once the player moves', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r0 = await route(page);
  const pick = 'I try to pick the lock on the back door';
  const lockKey = () => page.evaluate(() => Game.state.meta.lastRollKey);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(3));
  await sendText(page, pick);
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.roll.tier), 'failure');
  const lock = await lockKey();
  assert.ok(lock);
  for (const t of ['/look', 'I look around', 'I say hello']) {
    await sendText(page, t);
    assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.action.timeCost), 'instant', t);
    assert.equal(await lockKey(), lock, `${t} changes nothing, so the lock stays`);
  }
  const before = await stateJson(page);
  await sendText(page, pick);
  assert.equal(await lastNotice(page), LOCKED);
  assert.equal(await stateJson(page), before, 'still refused');
  // Moving away lifts it; back at the door the same attempt rolls again.
  await sendText(page, `I walk to ${r0.a.name}`);
  assert.equal(await lockKey(), null, 'moving away lifts the lock');
  await sendText(page, `I walk to ${r0.here.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), r0.here.id);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(18));
  await sendText(page, pick);
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.roll.d20), 18, 'allowed again');
});

s.test('one autosave and one panel render per turn: mid-turn the autosave still holds the state from before the turn, and a reload brings that back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const saved = () => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('novatria.autosave')).state));
  const slowTurn = text => page.evaluate(t => {
    Game.Api.Mock.clear();
    Game.Api.Mock.delay = 120; // slow streaming, after a short hold
    Game.Api.Mock.queue('narrate', { delay: 300 });
    window.__turn = Game.Pipeline.submit(t);
  }, text);
  const pre = await stateJson(page);
  assert.equal(await saved(), pre);
  await page.evaluate(() => {
    window.__writes = 0;
    window.__renders = 0;
    const set = window.Storage.prototype.setItem;
    window.Storage.prototype.setItem = function (k, v) { if (k === 'novatria.autosave') window.__writes += 1; return set.call(this, k, v); };
    const body = document.getElementById('panel-body');
    const rc = body.replaceChildren;
    body.replaceChildren = function () { window.__renders += 1; return rc.apply(this, arguments); };
    Game.Pipeline.forceNextRoll(3);
  });
  await slowTurn('I try to pick the lock on the back door');
  // The narration is streaming into the feed, so the turn is half applied by now.
  await page.waitForFunction(() => { const n = document.querySelector('#feed .f-narr.pending'); return !!n && [...n.querySelectorAll('p:not(.f-tag)')].some(p => p.textContent.trim()); });
  const mid = await page.evaluate(() => ({ busy: Game.Pipeline.busy, turn: Game.state.meta.turn, lock: Game.state.meta.lastRollKey, writes: window.__writes, renders: window.__renders }));
  assert.ok(mid.busy, 'still mid-turn');
  assert.equal(mid.turn, JSON.parse(pre).meta.turn + 1, 'the live state has begun the turn');
  assert.ok(mid.lock, 'and set the retry lock');
  assert.equal(await saved(), pre, 'but the autosave still holds the state from before the turn');
  assert.deepEqual([mid.writes, mid.renders], [0, 0], 'no autosave and no panel render mid-turn');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const post = await stateJson(page);
  assert.notEqual(post, pre);
  assert.equal(await saved(), post, 'after the turn the autosave holds the finished turn');
  assert.deepEqual(await page.evaluate(() => [window.__writes, window.__renders]), [1, 1], 'exactly one autosave write and one panel render');
  // A reload in the middle of the next turn comes back to the end of this one.
  await slowTurn('I walk around the room');
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(page), post);
});

s.test('while a turn is running, loading a save or starting a game is refused and those controls are off; the turn finishes on its own game', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, '/save Before');
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  const slowTurn = ms => page.evaluate(d => {
    window.__game = Game.state;
    Game.Api.Mock.clear();
    Game.Api.Mock.queue('narrate', { delay: d });
    window.__turn = Game.Pipeline.submit('I walk around the room');
  }, ms);
  await slowTurn(1500);
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  const mid = await page.evaluate(async () => {
    const G = Game;
    const out = {
      tries: [G.App.loadSlot(1), G.App.continueGame(), G.App.enter(G.Storage.loadSlot(1)), G.App.newGame(), G.App.prepare({})],
      command: await G.Pipeline.submit('/load Before'),
      toast: document.getElementById('toast').textContent,
      screen: G.UI.screen,
      same: G.state === window.__game
    };
    G.UI.showScreen('saves');
    out.savesOff = ['#slot-auto [data-action="load"]', '#slot-1 [data-action="load"]', '#btn-import'].map(s => document.querySelector(s).disabled);
    G.UI.showScreen('title');
    out.titleOff = ['#btn-new', '#btn-continue', '#btn-load'].map(s => document.querySelector(s).disabled);
    return out;
  });
  assert.deepEqual(mid.tries, [false, false, false, false, null], 'loadSlot, continueGame, enter, newGame and prepare all refuse');
  assert.equal(mid.command.reason, 'busy', '/load waits too');
  assert.equal(mid.toast, 'Wait for the current turn to finish.');
  assert.equal(mid.screen, 'game');
  assert.ok(mid.same, 'the game in play is untouched');
  assert.deepEqual(mid.savesOff, [true, true, true], 'Load and Import are off');
  assert.deepEqual(mid.titleOff, [true, true, true], 'New game, Continue and Load are off');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const end = await page.evaluate(async () => ({
    res: await window.__turn, same: Game.state === window.__game, turn: Game.state.meta.turn,
    last: Game.state.log[Game.state.log.length - 1].input, saved: Game.Storage.loadAutosave().state.meta.turn,
    titleOn: ['#btn-new', '#btn-continue', '#btn-load'].map(s => !document.querySelector(s).disabled)
  }));
  assert.equal(end.res.ok, true);
  assert.ok(end.same, 'the turn finished on the game it started on');
  assert.equal(end.turn, t0 + 1);
  assert.equal(end.last, 'I walk around the room');
  assert.equal(end.saved, t0 + 1, 'and the autosave is that game');
  assert.deepEqual(end.titleOn, [true, true, true], 'the controls come back once the turn is over');
  assert.ok(await page.evaluate(() => Game.App.loadSlot(1)), 'loading works again');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0);
  // Defensive: a game swapped in behind App's back mid-turn is left alone by the turn (no restore over it).
  await slowTurn(800);
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  const swapped = await page.evaluate(() => { const env = Game.Storage.loadSlot(1); Game.State.load(env.state, env.town); return JSON.stringify(Game.state); });
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal((await page.evaluate(() => window.__turn)).reason, 'replaced');
  assert.equal(await stateJson(page), swapped, 'neither restored over nor written to');
});

/* ----- Do / Say (docs/BUILD_PLAN.md, direction changes) ----- */
const chips = page => page.evaluate(() => [...document.querySelectorAll('#say-to .say-chip')].map(b => ({ to: b.dataset.to, label: b.textContent, on: b.getAttribute('aria-pressed') === 'true' })));
const presentHere = page => page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => ({ id: n.id, name: n.name, label: Game.npcLabel(n) })));
/* What the player sees someone called right now: their name once introduced, else 'the mechanic'. */
const labelOf = (page, id) => page.evaluate(id => Game.npcLabel(Game.state.npcs.find(n => n.id === id)), id);
const lastInputLine = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-input')].pop(); return n ? { text: n.textContent, say: n.classList.contains('f-say'), to: n.dataset.to || null } : null; });
const turnInfo = page => page.evaluate(() => ({ loc: Game.state.player.locationId, act: Game.Pipeline.lastTurn.action, last: Game.state.log[Game.state.log.length - 1] }));
/* A place and phase where exactly `n` people are present (any names). */
const sceneOf = (page, n) => page.evaluate(n => {
  for (const l of Game.state.locations) {
    if (l.closed) continue;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      const here = Game.State.npcsAt(l.id, ph);
      if (here.length === n) return { loc: l.id, phase: ph, ids: here.map(x => x.id) };
    }
  }
  return null;
}, n);
const SOCIAL = ['talk', 'persuade', 'deceive', 'intimidate'];

s.test('Say "run away" to one person: the player stays, the action is talk aimed at them; the parser, narrator and bookkeeper all hear MODE say', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 2 });
  assert.ok(sc, 'a scene with two people');
  await place(page, sc.loc.id, sc.phase);
  const a = sc.npcs[0];
  const aLabel = await labelOf(page, a.id);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  await page.click('#mode-say');
  await page.click(`#say-to [data-to="${a.id}"]`);
  await sendText(page, 'run away');
  const r = await turnInfo(page);
  assert.equal(r.loc, sc.loc.id, 'the player stays where they are');
  assert.equal(r.act.actionType, 'talk');
  assert.equal(r.act.targets[0], a.id, 'aimed at the addressee');
  assert.equal(r.act.destinationId, null);
  assert.deepEqual({ input: r.last.input, mode: r.last.mode, to: r.last.to, toName: r.last.toName }, { input: 'run away', mode: 'say', to: a.id, toName: a.name }, 'the log keeps the mode and the addressee');
  // The parser hears the exact words and MODE say.
  const parse = await lastPacket(page, 'parse');
  assert.ok(parse.startsWith(`PLAYER INPUT: "run away"\nMODE: say, to ${a.id} (${a.name}). The input is the player's exact spoken words, said aloud to ${a.name}; nothing else was done. actionType must be talk, persuade, deceive or intimidate`), parse.split('\n').slice(0, 2).join('\n'));
  assert.match(parse, new RegExp(`targets must include ${a.id}\\. destinationId must be null\\. A person mentioned in the words is one of the listed ids; never use new: for a person\\.`));
  // The narrator gets PLAYER SAYS with the exact words and who answers first, instead of ACTION.
  const narr = await lastPacket(page);
  assert.ok(narr.includes(`\nPLAYER SAYS (to ${a.name}): "run away"\nThese are the player's exact words, already spoken; do not repeat them in full. Show how ${a.name} answers first; others present may react.\nROLL: none\n`), narr);
  assert.ok(!/\nACTION: /.test(narr), 'no ACTION line in Say mode');
  assert.ok(r.last.narration.startsWith(`${a.name} answers you first.`), 'the mock shows the addressee answering first: ' + r.last.narration);
  // The bookkeeper gets the same MODE.
  const book = await lastPacket(page, 'bookkeep');
  assert.ok(book.includes(`\nINPUT: "run away"\nMODE: say, to ${a.id} (${a.name}). INPUT is the player's exact spoken words; they did nothing else and stayed where they are (playerLocationId null).\n`), book);
  // The feed shows the words in quotes and the addressee.
  assert.deepEqual(await lastInputLine(page), { text: `“run away” — to ${aLabel}`, say: true, to: a.id });
  // A parser that makes it a move and a bookkeeper that moves the player change nothing: Say only speaks.
  const exit = await page.evaluate(() => Game.State.loc(Game.state.player.locationId).exits.find(id => !Game.State.loc(id).closed));
  await page.evaluate(x => { Game.Api.Mock.queue('parse', { actionType: 'move', destinationId: x, targets: [], timeCost: 'long' }); Game.Api.Mock.queue('bookkeep', { playerLocationId: x }); }, exit);
  await sendText(page, 'Run!');
  const r2 = await turnInfo(page);
  assert.equal(r2.loc, sc.loc.id, 'still here');
  assert.equal(r2.act.actionType, 'talk', 'forced social');
  assert.equal(r2.act.destinationId, null);
  assert.equal(r2.act.timeCost, 'short', 'saying something never takes a phase');
  assert.ok(r2.act.targets.includes(a.id), 'the addressee is added back');
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(x => x.kind === 'rejected').map(x => x.path + ': ' + x.reason));
  assert.ok(dbg.some(x => /^parse: say mode: actionType move became talk; destinationId \S+ dropped; timeCost long became short; added the addressee/.test(x)), dbg.join('\n'));
  assert.ok(dbg.some(x => /^playerLocationId: ignored: in Say mode/.test(x)));
  // A failed turn puts the words back and keeps the pick; /undo starts again from the default, and the chips show it.
  await page.evaluate(() => Game.Api.Mock.queue('parse', { error: { type: 'overloaded_error' } }));
  await sendText(page, 'Hold on.');
  assert.equal(await page.inputValue('#cmd'), 'Hold on.');
  assert.equal(await page.evaluate(() => Game.UI.addressee), a.id);
  assert.deepEqual((await chips(page)).filter(c => c.on).map(c => c.to), [a.id]);
  await page.fill('#cmd', '');
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.UI.addressee), 'everyone');
  assert.deepEqual((await chips(page)).filter(c => c.on).map(c => c.to), ['everyone']);
});

s.test('Do "I run away" is a move out of here, never talk; a Do line with a quote inside stays Do; a line that is only a quote is said', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 2 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  assert.equal(await page.evaluate(() => Game.UI.mode), 'do', 'Do is the default');
  assert.equal(await page.getAttribute('#mode-do', 'aria-pressed'), 'true');
  assert.ok(await page.isHidden('#say-to'), 'no chips in Do mode');
  // A quote inside a Do line: still Do, as typed.
  await sendText(page, 'I shove past the counter and yell "Run!"');
  let r = await turnInfo(page);
  assert.equal(r.last.mode, 'do');
  assert.equal(r.last.input, 'I shove past the counter and yell "Run!"');
  assert.match(await lastPacket(page, 'parse'), /^PLAYER INPUT: I shove past the counter and yell "Run!"\nMODE: do\. The input is what the player does; any speech inside it is incidental to the action\.\n/);
  assert.deepEqual(await lastInputLine(page), { text: 'I shove past the counter and yell "Run!"', say: false, to: null });
  // A line that is only a quote (or say / I say before one) is said, to the default addressee; the toggle stays on Do.
  for (const [typed, words] of [['"Run."', 'Run.'], ['“Hold on”!', 'Hold on!'], ['I say "Wait for me."', 'Wait for me.'], ['say: "Easy now"', 'Easy now']]) {
    await sendText(page, typed);
    r = await turnInfo(page);
    assert.deepEqual({ mode: r.last.mode, input: r.last.input, to: r.last.to }, { mode: 'say', input: words, to: 'everyone' }, typed);
    assert.ok(SOCIAL.includes(r.act.actionType), typed);
    assert.equal(r.loc, sc.loc.id);
    assert.ok((await lastPacket(page)).includes(`\nPLAYER SAYS (to everyone present): "${words}"\n`), typed);
  }
  assert.equal(await page.evaluate(() => Game.UI.mode), 'do', 'the shortcut is for that line only');
  // The rule itself.
  const rule = await page.evaluate(() => ['"Run."', '"Run," I tell him.', 'I yell "Run!"', 'run away', 'say run', '""', '"Run'].map(t => Game.Pipeline.spokenWords(t)));
  assert.deepEqual(rule, ['Run.', null, null, null, null, null, 'Run']);
  // "I run away": a move through an exit, with the Do line in the narrator packet.
  await sendText(page, 'I run away');
  r = await turnInfo(page);
  assert.equal(r.act.actionType, 'move');
  assert.notEqual(r.loc, sc.loc.id, 'the player ran off somewhere');
  assert.equal(r.loc, r.act.destinationId);
  assert.equal(r.last.mode, 'do');
  const narr = await lastPacket(page);
  assert.match(narr, /\nACTION: I run away\nThe player did not say anything beyond what the ACTION line states\.\nROLL: /);
  assert.ok(!narr.includes('PLAYER SAYS'));
  assert.match(await lastPacket(page, 'bookkeep'), /\nINPUT: I run away\nMODE: do\nACTION: /);
  // A parser that calls it a move but names no place: the engine sends the player out through the first open exit.
  const from = await page.evaluate(() => Game.state.player.locationId);
  const firstExit = await page.evaluate(() => Game.State.loc(Game.state.player.locationId).exits.find(id => !Game.State.loc(id).closed));
  await page.evaluate(() => Game.Api.Mock.queue('parse', { actionType: 'move', destinationId: null, targets: [] }));
  await sendText(page, 'I turn and run');
  r = await turnInfo(page);
  assert.equal(r.act.destinationId, firstExit);
  assert.equal(r.loc, firstExit, 'out through the first open exit, from ' + from);
  assert.ok((await lastPacket(page)).includes('\nDESTINATION: '), 'the narrator is told where');
});

s.test('Say to everyone targets every person here; with nobody here it is said to the empty room', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 2 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; Game.UI.setMode('say'); });
  const here = await presentHere(page);
  assert.ok(here.length >= 2);
  assert.equal(await page.evaluate(() => Game.UI.addressee), 'everyone', 'with two or more here the default is Everyone');
  await sendText(page, 'Anybody here hiring?');
  const r = await turnInfo(page);
  assert.equal(r.act.actionType, 'talk');
  assert.deepEqual(r.act.targets.slice().sort(), here.map(n => n.id).sort(), 'every person present');
  assert.equal(r.loc, sc.loc.id);
  assert.deepEqual({ mode: r.last.mode, to: r.last.to, toName: r.last.toName }, { mode: 'say', to: 'everyone', toName: null });
  assert.match(await lastPacket(page, 'parse'), new RegExp(`\\nMODE: say, to everyone present\\. .* targets must include every NPC present \\(${here.map(n => n.id).join(', ')}\\)\\.`));
  const narr = await lastPacket(page);
  assert.ok(narr.includes('\nPLAYER SAYS (to everyone present): "Anybody here hiring?"\nThese are the player\'s exact words, already spoken; do not repeat them in full. Show how the people here answer; each may react in their own way.\n'), narr);
  assert.match(r.last.narration, new RegExp(`hear you, and ${esc(here[0].name)} answers first\\.`));
  assert.match(await lastPacket(page, 'bookkeep'), /\nMODE: say, to everyone present\. INPUT is the player's exact spoken words/);
  assert.deepEqual(await lastInputLine(page), { text: '“Anybody here hiring?” — to everyone', say: true, to: 'everyone' });
  // Nobody here: only the Everyone chip, and the narrator is told nobody hears it.
  const empty = await sceneOf(page, 0);
  await place(page, empty.loc, empty.phase);
  assert.deepEqual(await chips(page), [{ to: 'everyone', label: 'Everyone', on: true }]);
  await sendText(page, 'Hello?');
  const r2 = await turnInfo(page);
  assert.deepEqual(r2.act.targets, []);
  assert.ok((await lastPacket(page)).includes('\nPLAYER SAYS (to everyone present): "Hello?"\nThese are the player\'s exact words, already spoken; do not repeat them in full. Nobody is here to hear it.\n'));
  assert.equal(r2.last.narration.split('. ')[0], 'Nobody is here to hear it');
});

s.test('the Say chips list exactly the people present, one pressed (the only person, else Everyone), and follow the scene after a move', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const many = await findScene(page, { min: 2 });
  await place(page, many.loc.id, many.phase);
  await page.click('#mode-say');
  assert.ok(await page.isVisible('#say-to'));
  assert.equal(await page.getAttribute('#mode-say', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('#mode-do', 'aria-pressed'), 'false');
  let here = await presentHere(page);
  assert.deepEqual(await chips(page), [{ to: 'everyone', label: 'Everyone', on: true }].concat(here.map(n => ({ to: n.id, label: n.label, on: false }))), 'Everyone plus each person here, as the player knows them');
  assert.match(await page.getAttribute('#cmd', 'placeholder'), /^What do you say to everyone\?$/);
  // Picking one presses only that one; the placeholder names them.
  await page.click(`#say-to [data-to="${here[1].id}"]`);
  assert.deepEqual((await chips(page)).filter(c => c.on).map(c => c.to), [here[1].id]);
  assert.equal(await page.getAttribute('#cmd', 'placeholder'), `What do you say to ${here[1].label}?`);
  assert.equal(await page.evaluate(id => Game.UI.setAddressee(id), 'npc_nobody_at_all'), false, 'someone not here cannot be picked');
  // A place with exactly one person: that person is the default. Getting there is a turn (Do mode, a walk).
  const one = await sceneOf(page, 1);
  assert.ok(one, 'a scene with exactly one person');
  await page.evaluate(([loc, phase]) => { while (Game.state.time.phase !== phase) Game.State.apply({ advanceTime: 'long' }); }, [one.loc, one.phase]);
  const oneName = await page.evaluate(id => Game.State.loc(id).name, one.loc);
  await page.evaluate(() => Game.UI.setMode('do'));
  // Start from an empty place, so the walk is what brings the one person into the scene.
  await page.evaluate(to => Game.State.apply({ playerLocationId: Game.state.locations.find(l => !l.closed && Game.State.npcsAt(l.id).length === 0 && l.id !== to).id }), one.loc);
  await sendText(page, `I walk to ${oneName}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), one.loc, 'moved by a turn');
  await page.evaluate(() => Game.UI.setMode('say'));
  here = await presentHere(page);
  assert.deepEqual(here.map(n => n.id), one.ids);
  assert.deepEqual(await chips(page), [{ to: 'everyone', label: 'Everyone', on: false }, { to: one.ids[0], label: here[0].label, on: true }], 'the only person here is pressed');
  // Back at the busy place: the earlier pick is not carried over; the default (Everyone) is pressed again.
  await page.evaluate(([loc, phase]) => { while (Game.state.time.phase !== phase) Game.State.apply({ advanceTime: 'long' }); Game.State.apply({ playerLocationId: loc }); }, [many.loc.id, many.phase]);
  here = await presentHere(page);
  assert.deepEqual((await chips(page)).map(c => c.to), ['everyone'].concat(here.map(n => n.id)), 'chips refreshed after the move');
  assert.deepEqual((await chips(page)).filter(c => c.on).map(c => c.to), ['everyone'], 'no stale addressee across scenes');
});

s.test('the Do / Say mode persists across a reload; the addressee does not; commands work in Say mode', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 2 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await page.click('#mode-say');
  await page.click(`#say-to [data-to="${sc.npcs[0].id}"]`);
  const firstLabel = await labelOf(page, sc.npcs[0].id);
  await sendText(page, 'Morning.');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.settings')).inputMode), 'say');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.equal(await page.evaluate(() => Game.UI.mode), 'say', 'still Say after a reload');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.getAttribute('#mode-say', 'aria-pressed'), 'true');
  assert.ok(await page.isVisible('#say-to'));
  const here = await presentHere(page);
  assert.deepEqual((await chips(page)).map(c => c.to), ['everyone'].concat(here.map(n => n.id)), 'chips for the loaded scene');
  assert.deepEqual((await chips(page)).filter(c => c.on).map(c => c.to), ['everyone'], 'the picked person was not saved');
  // The Say line from before the reload is rebuilt as a Say line.
  assert.deepEqual(await lastInputLine(page), { text: `“Morning.” — to ${firstLabel}`, say: true, to: sc.npcs[0].id });
  // Commands still run in Say mode.
  await sendText(page, '/people');
  assert.equal(await page.evaluate(() => Game.UI.tab), 'people');
  const turns = await page.evaluate(() => Game.state.meta.turn);
  await sendText(page, '/look');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), turns + 1);
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].mode), undefined, 'a command is not a Say line');
  await page.click('#mode-do');
  assert.equal(await page.evaluate(() => Game.Storage.settings().inputMode), 'do');
});

s.test('Say lines keep their mode and addressee through /undo, a save slot and the chronicle; old saves without the field still load', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 2 });
  await place(page, sc.loc.id, sc.phase);
  const a = sc.npcs[0];
  const aLabel = await labelOf(page, a.id);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); }, a.id);
  await sendText(page, 'You still fix trucks?');
  await page.evaluate(() => Game.UI.setMode('do'));
  await sendText(page, 'I look around');
  const want = { text: `“You still fix trucks?” — to ${aLabel}`, say: true, to: a.id };
  const sayLines = () => page.evaluate(() => [...document.querySelectorAll('#feed .f-input.f-say')].map(n => ({ text: n.textContent, say: true, to: n.dataset.to })));
  await sendText(page, '/undo');
  assert.deepEqual(await sayLines(page), [want], 'the rebuilt feed after /undo');
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].mode), 'say');
  // A save slot, a reload and a load.
  await page.evaluate(() => Game.Storage.saveSlot(1, 'say test'));
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.ok(await page.evaluate(() => Game.App.loadSlot(1)));
  assert.deepEqual(await sayLines(page), [want], 'after loading the slot');
  const e = await page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
  assert.deepEqual({ mode: e.mode, to: e.to, toName: e.toName, input: e.input }, { mode: 'say', to: a.id, toName: a.name, input: 'You still fix trucks?' });
  // The chronicle's input names it as speech (the real provider's text, and the mock's summary).
  const chron = await page.evaluate(async () => ({ text: Game.Api.chronicleText(Game.state.log), mock: await Game.Api.chronicle(Game.state.log) }));
  assert.ok(chron.text.includes(`\nPLAYER SAID (to ${a.name}): "You still fix trucks?"\n`), chron.text);
  assert.ok(chron.mock.includes(`said "You still fix trucks?" to ${a.name}`), chron.mock);
  // The narrator's THIS SCENE marks it as speech too.
  assert.ok((await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }))).includes(`> (says to ${a.name}) "You still fix trucks?" `));
  // An old save: no mode fields anywhere in the log. It loads and the lines read as Do.
  const old = await page.evaluate(() => {
    const env = Game.Storage.envelope('old');
    for (const x of env.state.log) { delete x.mode; delete x.to; delete x.toName; }
    return Game.App.enter(Game.Storage.parseEnvelope(JSON.stringify(env))) && [...document.querySelectorAll('#feed .f-input')].map(n => ({ text: n.textContent, say: n.classList.contains('f-say') }));
  });
  assert.ok(old.length >= 1);
  assert.ok(old.every(x => !x.say), 'old entries render as Do lines');
  assert.ok(old.some(x => x.text === 'You still fix trucks?'));
});

s.test('casual style: a simile outside dialogue counts toward the one regeneration; literary keeps it', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; Game.Api.Mock.queue('narrate', 'The clerk grins like a man who just won the lottery.', 'The clerk grins.'); });
  await sendText(page, 'I look down the road');
  let c = await page.evaluate(() => Game.Api.Mock.calls.filter(x => x.method === 'narrate'));
  assert.equal(c.length, 2, 'regenerated once');
  assert.match(c[1].text, /\nSTYLE CHECK FAILED on your last attempt: a simile \("like a"\)\. Write it again without that\. Say it plainly, with no comparisons\.$/);
  assert.equal((await lastLog(page)).narration, 'The clerk grins.');
  // A simile on the second try is kept (regenerate once, never fail the turn).
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', 'He looks at you as if you owe him.', 'He looks at you like a hawk.'); });
  await sendText(page, 'I wait a moment by the door');
  assert.equal((await lastLog(page)).narration, 'He looks at you like a hawk.');
  // Dialogue is not checked; literary style does not check similes at all.
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', '"I\'d like a coffee," the clerk says.'); });
  await sendText(page, 'I look at the clerk');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls.filter(x => x.method === 'narrate').length), 1);
  await page.evaluate(() => { Game.Storage.saveSettings({ narrationStyle: 'literary' }); Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', 'The clerk grins like a man who just won the lottery.'); });
  await sendText(page, 'I look down the road again');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls.filter(x => x.method === 'narrate').length), 1, 'literary: no regeneration');
  assert.equal((await lastLog(page)).narration, 'The clerk grins like a man who just won the lottery.');
});

s.test('a present person becomes known when the narration gives their name, not when a place shares their surname', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const loc = Game.state.player.locationId;
    const who = Game.State.npcsAt(loc);
    const one = who[0];
    const place = Game.State.loc(loc).name;
    const before = who.map(n => n.knownToPlayer);
    // Only the place name, which may contain a surname: proves nothing.
    const a = Game.Pipeline.noteIntroductions('You stop at ' + place + '. Someone nods at you.', loc);
    const mid = Game.State.npcsAt(loc).map(n => n.knownToPlayer);
    // The full name spoken aloud: now the player knows it.
    const b = Game.Pipeline.noteIntroductions('"' + one.name + '," the man says. "That is my name."', loc);
    const after = Game.State.npcsAt(loc).map(n => n.knownToPlayer);
    return { before, a, mid, b, after, id: one.id, label: Game.npcLabel(Game.state.npcs.find(n => n.id === one.id)), name: one.name };
  });
  assert.deepEqual(r.a, [], 'a place name alone introduces nobody');
  assert.deepEqual(r.mid, r.before);
  assert.deepEqual(r.b, [r.id], 'the spoken full name introduces exactly that person');
  assert.equal(r.after[0], true);
  assert.equal(r.label, r.name, 'the chips and cards now use the name');
});

s.test('pushing a failed ask again in conversation gets an answer, not a notice: no new roll, the person holds their ground, the lock stays', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const a = sc.npcs[0];
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); Game.Pipeline.forceNextRoll(1); }, a.id);
  await sendText(page, 'Please, give me a chance and hire me.');
  const first = await turnInfo(page);
  assert.ok(first.act.needsRoll && first.last.roll, 'the first ask rolled');
  const lock = await page.evaluate(() => Game.state.meta.lastRollKey);
  assert.ok(lock, 'the failed ask set the lock');
  const notices = await page.evaluate(() => document.querySelectorAll('#feed .f-notice').length);
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); }, a.id);
  await sendText(page, 'Come on, please, change your mind.');
  const second = await turnInfo(page);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-notice').length), notices, 'no system notice');
  assert.equal(second.last.roll, null, 'no new roll');
  assert.ok(second.last.narration.includes('The answer does not change.'), second.last.narration);
  const packet = await lastPacket(page);
  assert.match(packet, /\nROLL: none\nSAME ASK AGAIN: the player already tried this and it failed/);
  assert.ok((await lastPacket(page, 'bookkeep')).includes('SAME ASK AGAIN: this repeats an ask that already failed'));
  assert.equal(await page.evaluate(() => Game.state.meta.lastRollKey), lock, 'the lock still holds, so the dice are not re-rolled');
});

/* Direction change 13: a granted ask stays granted. */
const lockNow = page => page.evaluate(() => ({ key: Game.state.meta.lastRollKey, rec: Game.state.meta.lastRoll }));
const npcNow = (page, id) => page.evaluate(id => { const n = Game.State.npc(id); return { attitude: n.attitude, memories: n.memories.length }; }, id);
const nextPhaseOf = page => page.evaluate(() => { const P = ['morning', 'afternoon', 'evening', 'night']; return P[(P.indexOf(Game.state.time.phase) + 1) % 4]; });

s.test('a granted ask asked again in the same scene is settled: ALREADY GRANTED in both packets, no roll, no attitude change or memory, the lock kept even when the repeat takes time; reworded or said, it is the same ask; a different ask to the same person rolls, and going back to the first is still settled; a new phase lifts the lock', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 1, watchy: false });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const a = sc.npcs[0];
  const ask = `I persuade ${a.name} to put in a good word for me`;
  const n0 = await npcNow(page, a.id);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(19));
  await sendText(page, ask);
  const first = await turnInfo(page);
  assert.equal(first.act.actionType, 'persuade');
  assert.equal(first.last.roll && first.last.roll.d20, 19, 'the first ask rolled');
  const n1 = await npcNow(page, a.id);
  assert.equal(n1.attitude, n0.attitude + 8, 'and the yes warmed them (mock bookkeeper, +8)');
  const lock = await lockNow(page);
  assert.ok(lock.key, 'a granted ask sets the lock');
  assert.equal(lock.rec.outcome, 'granted');
  assert.equal(lock.rec.line, first.last.roll.line);
  assert.deepEqual(lock.rec.granted.map(g => g.words), [['good', 'put', 'word']], 'with what was asked: the name and the filler left out');
  const notices = await page.evaluate(() => document.querySelectorAll('#feed .f-notice').length);
  // The identical ask, taking time this once (a real parser may call it short): settled, no roll, nothing gained.
  await page.evaluate(() => Game.Api.Mock.queue('parse', { timeCost: 'short' }));
  await sendText(page, ask);
  const again = await turnInfo(page);
  assert.equal(again.last.roll, null, 'no new roll');
  assert.ok(again.last.narration.includes(`${a.name} already said yes.`), again.last.narration);
  const packet = await lastPacket(page);
  assert.match(packet, new RegExp(`\\nROLL: none\\nALREADY GRANTED: the player asked this before and ${esc(a.name)} agreed \\(${esc(first.last.roll.line)}\\); there is no new roll and nothing more is gained\\. Show them noting it is already settled \\(a shrug, "I said yes", mild impatience\\) and move the scene on; grant nothing further\\.\\n`));
  assert.doesNotMatch(packet, /SAME ASK AGAIN|\nOUTCOME:/, 'neither a refusal nor a fresh success');
  const book = await lastPacket(page, 'bookkeep');
  assert.ok(book.includes(`\nALREADY GRANTED: the player asked this before and ${a.name} agreed (${first.last.roll.line}); there is no new roll. Record no attitude change, no memory and nothing gained; no move.\n`), book);
  assert.deepEqual(await npcNow(page, a.id), n1, 'no attitude change and no memory');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-notice').length), notices, 'the scene answers; no system notice');
  assert.deepEqual(await lockNow(page), lock, 'the repeat took time but changed nothing, so the lock holds');
  // Reworded and said (Say mode, the same key): still the same ask.
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); }, a.id);
  await sendText(page, 'Come on, put in a good word for me.');
  assert.equal((await turnInfo(page)).last.roll, null, 'said in other words: no roll');
  assert.match(await lastPacket(page), new RegExp(`\\nALREADY GRANTED: the player asked this before and ${esc(a.name)} agreed `));
  assert.deepEqual(await npcNow(page, a.id), n1);
  // A clearly different ask to the same person rolls, and the lock keeps both.
  await page.evaluate(() => { Game.UI.setMode('do'); Game.Pipeline.forceNextRoll(19); });
  await sendText(page, `I persuade ${a.name} to lend me twenty dollars until Friday`);
  const other = await turnInfo(page);
  assert.equal(other.last.roll && other.last.roll.d20, 19, 'a different ask rolls');
  assert.match(await lastPacket(page), /\nOUTCOME: the ask succeeded\./);
  assert.equal((await npcNow(page, a.id)).attitude, n1.attitude + 8);
  const both = await lockNow(page);
  assert.equal(both.key, lock.key, 'under the same key');
  assert.deepEqual(both.rec.granted.map(g => g.words), [['good', 'put', 'word'], ['dollar', 'friday', 'lend', 'twenty']]);
  // Going back to the first: still settled.
  await sendText(page, ask);
  assert.equal((await turnInfo(page)).last.roll, null, 'the first ask is still settled');
  assert.match(await lastPacket(page), /\nROLL: none\nALREADY GRANTED: /);
  // A new phase lifts the lock and its record: the same ask rolls again.
  await sendText(page, `/wait ${await nextPhaseOf(page)}`);
  assert.deepEqual(await lockNow(page), { key: null, rec: null }, 'time passing lifts the lock');
  await page.evaluate(id => { if (!Game.State.npcsAt(Game.state.player.locationId).some(n => n.id === id)) Game.State.apply({ visits: [{ npcId: id, locationId: Game.state.player.locationId }] }); Game.Pipeline.forceNextRoll(19); }, a.id);
  await sendText(page, ask);
  assert.equal((await turnInfo(page)).last.roll && (await turnInfo(page)).last.roll.d20, 19, 'in a new phase the same ask rolls');
});

s.test('something done (not an ask) done again in the same scene gets the locked notice and changes nothing, whatever came between; a different attempt rolls; a move lifts the lock', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r0 = await route(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Pipeline.forceNextRoll(18); });
  const pick = 'I try to pick the lock on the back door';
  await sendText(page, pick);
  const done = await turnInfo(page);
  assert.ok(['success', 'critical'].includes(done.last.roll.tier), done.last.roll.line);
  const lock = await lockNow(page);
  assert.equal(lock.rec.outcome, 'granted', 'a success sets the lock');
  let before = await stateJson(page);
  await sendText(page, pick);
  assert.equal(await lastNotice(page), LOCKED);
  assert.equal(await stateJson(page), before, 'the repeat changed nothing');
  assert.equal(await page.inputValue('#cmd'), '');
  // Another lock here is a different attempt (the same key, other words): it rolls, and fails.
  await page.evaluate(() => Game.Pipeline.forceNextRoll(4));
  await sendText(page, 'I try to pick the lock on the front gate');
  const other = await turnInfo(page);
  assert.equal(other.last.roll && other.last.roll.d20, 4, 'a different attempt rolls');
  assert.equal(other.last.roll.tier, 'failure');
  assert.equal((await lockNow(page)).key, lock.key, 'under the same key');
  // Neither comes back: the first is done, the second failed.
  before = await stateJson(page);
  for (const t of [pick, 'I try to pick the lock on the front gate']) {
    await sendText(page, t);
    assert.equal(await lastNotice(page), LOCKED, t);
    assert.equal(await stateJson(page), before, t);
  }
  // Moving away lifts it; back at the door the first attempt rolls again.
  await sendText(page, `I walk to ${r0.a.name}`);
  assert.deepEqual(await lockNow(page), { key: null, rec: null }, 'moving away lifts the lock');
  await sendText(page, `I walk to ${r0.here.name}`);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(7));
  await sendText(page, pick);
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.roll.d20), 7, 'allowed again');
});

s.test('an older save with a retry lock and no record of it loads and plays: the lock reads as a failure (SAME ASK AGAIN in conversation), the next roll writes the record, and a reload keeps it', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 1, watchy: false });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const a = sc.npcs[0];
  const r = await page.evaluate(id => {
    const G = Game;
    // Saved before granted asks were locked: the lock holds a (failed) Say ask to this person, and meta has no lastRoll.
    const env = G.Storage.envelope('old');
    env.state.meta.lastRollKey = G.Dice.lockKey({ actionType: 'persuade', stat: 'charm', targets: [id] });
    delete env.state.meta.lastRoll;
    const entered = G.App.enter(G.Storage.parseEnvelope(JSON.stringify(env)));
    return { entered, key: G.state.meta.lastRollKey, has: Object.prototype.hasOwnProperty.call(G.state.meta, 'lastRoll'), rec: G.state.meta.lastRoll };
  }, a.id);
  assert.ok(r.entered && r.key);
  assert.deepEqual([r.has, r.rec], [true, null], 'the missing record loads as null');
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); }, a.id);
  await sendText(page, 'Please, give me a chance and hire me.');
  assert.equal((await turnInfo(page)).last.roll, null, 'locked: no roll');
  assert.match(await lastPacket(page), /\nROLL: none\nSAME ASK AGAIN: the player already tried this and it failed/);
  // Another roll plays and writes the record; a reload keeps it, and the lock still holds.
  await page.evaluate(() => { Game.UI.setMode('do'); Game.Pipeline.forceNextRoll(18); });
  await sendText(page, 'I try to pick the lock on the back door');
  const lock = await lockNow(page);
  assert.equal(lock.rec && lock.rec.outcome, 'granted');
  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.deepEqual(await lockNow(page), lock, 'the record survives a reload');
  await sendText(page, 'I try to pick the lock on the back door');
  assert.equal(await lastNotice(page), LOCKED);
});

s.test('/reroll (cheat) takes the last turn back and plays it again with a fresh die, ignoring the retry lock; nothing to reroll without a roll', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  // No roll yet: nothing to reroll.
  await sendText(page, 'I look around');
  await sendText(page, '/reroll');
  assert.equal(await lastNotice(page), 'Nothing to reroll: the last turn had no dice roll.');
  // A failed lockpick, then rerolls.
  const pick = 'I try to pick the lock on the back door';
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, pick);
  const failed = await turnInfo(page);
  assert.equal(failed.last.roll.tier, 'critical_failure');
  assert.ok(await page.evaluate(() => Game.state.meta.lastRollKey), 'the lock is set');
  const logLen = await page.evaluate(() => Game.state.log.length);
  const inputs = () => page.evaluate(t => [...document.querySelectorAll('#feed .f-input')].filter(n => n.textContent === t).length, pick);
  assert.equal(await inputs(), 1);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(20));
  await sendText(page, '/reroll');
  const again = await turnInfo(page);
  assert.equal(again.last.input, pick, 'the same turn was played again');
  assert.equal(again.last.roll.tier, 'critical', 'with the new die');
  assert.equal(await page.evaluate(() => Game.state.log.length), logLen, 'the old turn is gone, the new one is in its place');
  assert.equal(await inputs(), 1, 'one input line in the feed, not two');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet, #feed .f-roll')].some(n => /Rerolled\./.test(n.textContent))), 'the feed says it was rerolled');
  // A success locks too now (direction change 13), recorded as granted; /reroll still goes past it below.
  assert.deepEqual(await page.evaluate(() => [!!Game.state.meta.lastRollKey, Game.state.meta.lastRoll && Game.state.meta.lastRoll.outcome]), [true, 'granted'], 'a success sets the lock as granted');
  // Reroll again straight away: allowed without limit, even after a fresh failure.
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, '/reroll');
  assert.equal((await turnInfo(page)).last.roll.tier, 'critical_failure');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(15));
  await sendText(page, '/reroll');
  assert.equal((await turnInfo(page)).last.roll.tier, 'success', 'rerolled past the lock');
  assert.equal(await page.evaluate(() => Game.state.log.length), logLen);
  // /undo still works afterwards.
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.log.length), logLen - 1);
});

s.test('/undo then the same roll again draws a different die (the seeded stream is shifted, the saved state is untouched)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const pick = 'I try to pick the lock on the back door';
  const dice = [];
  for (let i = 0; i < 6; i++) {
    await sendText(page, pick);
    const info = await turnInfo(page);
    dice.push(info.last.roll.d20);
    const snapshot = await stateJson(page);
    await sendText(page, '/undo');
    if (i === 0) assert.notEqual(await stateJson(page), snapshot, 'undo changed the state back');
  }
  assert.ok(new Set(dice).size >= 3, 'six tries after /undo should not keep rolling the same number: ' + dice.join(','));
});

s.test('/cheat lists the cheats; /Cheat: reroll and /cheat reroll run a reroll', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, '/cheat');
  assert.match(await lastNotice(page), /^Cheats: \/cheat success, \/cheat partial/);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, 'I try to pick the lock on the back door');
  assert.equal((await turnInfo(page)).last.roll.tier, 'critical_failure');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(20));
  await sendText(page, '/Cheat: reroll');
  assert.equal((await turnInfo(page)).last.roll.tier, 'critical', 'a sloppy spelling still rerolls');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(12));
  await sendText(page, '/cheat reroll');
  assert.equal((await turnInfo(page)).last.roll.tier, 'success');
});

s.test('a successful social roll tells the narrator it works; a failed one that it does not; the parser sees attitudes', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const a = sc.npcs[0];
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); Game.Pipeline.forceNextRoll(20); }, a.id);
  await sendText(page, 'Please, give me a chance and hire me.');
  assert.equal((await turnInfo(page)).last.roll.tier, 'critical');
  assert.match(await lastPacket(page), /\nOUTCOME: the ask succeeded\. It works, and then some\. The person goes along with what the player asked, at least in part, whatever they said before/);
  assert.match(await lastPacket(page, 'parse'), /attitude to the player -?\d+ on -100\.\.100/);
  await sendText(page, '/undo');
  await page.evaluate(id => { Game.UI.setMode('say'); Game.UI.setAddressee(id); Game.Pipeline.forceNextRoll(1); }, a.id);
  await sendText(page, 'Please, give me a chance and hire me.');
  const packet = await lastPacket(page);
  assert.match(packet, /\nOUTCOME: the ask failed\. The person does not give the player what they asked for/);
  assert.doesNotMatch(packet, /the ask succeeded/);
});

s.test('/cheat success|partial|fail|crit|fumble|<n> redoes the last roll with that outcome, or arms the next roll when there is nothing to redo', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const tierNow = () => page.evaluate(() => Game.state.log[Game.state.log.length - 1].roll.tier);
  const d20Now = () => page.evaluate(() => Game.state.log[Game.state.log.length - 1].roll.d20);
  // Nothing rolled yet: arm the next roll.
  await sendText(page, '/cheat success');
  assert.match(await lastNotice(page), /^Cheat armed: your next roll will be a success\./);
  const pick = 'I try to pick the lock on the back door';
  await sendText(page, pick);
  assert.ok(['success', 'critical'].includes(await tierNow()), 'the armed success came out');
  // Redo the last roll with each outcome.
  await sendText(page, '/cheat fail');
  assert.equal(await tierNow(), 'failure');
  await sendText(page, '/cheat partial');
  assert.equal(await tierNow(), 'partial');
  await sendText(page, '/cheat crit');
  assert.equal(await tierNow(), 'critical');
  await sendText(page, '/cheat fumble');
  assert.equal(await tierNow(), 'critical_failure');
  await sendText(page, '/cheat 7');
  assert.equal(await d20Now(), 7);
  await sendText(page, '/reroll success');
  assert.ok(['success', 'critical'].includes(await tierNow()));
  await sendText(page, '/cheat sideways');
  assert.match(await lastNotice(page), /Say which outcome/);
  assert.equal(await page.evaluate(() => Game.state.log.filter(e => e.input === 'I try to pick the lock on the back door').length), 1, 'still one turn in the log');
});

s.test('night holds until the player sleeps: a run of short actions from evening ends at night (late), never morning; the packets say where in the phase it is; a long action reaches morning with no sleep, /rest sleeps', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await place(page, null, 'evening');
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); window.__ticks = []; const orig = Game.World.tick; Game.World.tick = info => { window.__ticks.push(`${info.to.day}:${info.to.phase}`); return orig(info); }; });
  const chores = ['I sweep the floor', 'I stretch my legs', 'I check my phone for signal', 'I fold my jacket', 'I sweep the floor again', 'I stretch my legs again', 'I check my phone again', 'I fold my jacket again'];
  const clocks = [];
  for (const c of chores) {
    await sendText(page, c);
    clocks.push(await page.evaluate(() => { const t = Game.state.time; return `${t.day}:${t.phase}:${t.shorts}${t.late ? ':late' : ''}`; }));
  }
  assert.deepEqual(clocks, ['1:evening:1', '1:evening:2', '1:night:0', '1:night:1', '1:night:2', '1:night:2:late', '1:night:2:late', '1:night:2:late'], 'shorts never cross into morning');
  const r = await page.evaluate(() => ({
    ticks: window.__ticks.slice(),
    dividers: [...document.querySelectorAll('#feed .f-divider')].map(d => d.textContent), bar: document.getElementById('tb-time').textContent
  }));
  assert.deepEqual(r.ticks, ['1:night'], 'the world ticked once, into the night, and not for the held shorts');
  assert.ok(!r.dividers.some(d => /Day 2/.test(d)), 'no new morning in the feed: ' + r.dividers.join(' | '));
  assert.equal(r.dividers[r.dividers.length - 1], 'Day 1 · Night');
  assert.equal(r.bar, 'Day 1 · Night');
  // The last chore was narrated late at night: the narrator, the bookkeeper and the parser are told.
  const narr = await lastPacket(page);
  assert.ok(narr.startsWith('DAY 1, NIGHT (late; the player has not slept) · Location: '), narr.split('\n')[0]);
  assert.match(await lastPacket(page, 'bookkeep'), /^TURN \d+ · DAY 1, NIGHT \(late; the player has not slept\)\. Any new seed must trigger on day 2 or later\./);
  assert.match(await lastPacket(page, 'parse'), /\nTIME: day 1, night \(late\)\n/);
  const schema = await page.evaluate(() => Game.Api.SCHEMAS.parse_action.properties.timeCost.description);
  assert.equal(schema, 'instant: talking, looking, a quick thing. short: minutes to half an hour (walking across town, a search, a chore, a short drive). long: an hour or more. rest: sleep until morning.');
  // Hours pass: a long action reaches morning, the world ticks, and the next narration hears there was no sleep.
  await sendText(page, 'I wait for the sun to come up');
  const morning = await page.evaluate(() => ({ t: JSON.parse(JSON.stringify(Game.state.time)), ticks: window.__ticks.slice(-1), divider: [...document.querySelectorAll('#feed .f-divider')].pop().textContent, cost: Game.Pipeline.lastTurn.action.timeCost }));
  assert.equal(morning.cost, 'long');
  assert.deepEqual(morning.t, { day: 2, phase: 'morning', shorts: 0, noSleep: true });
  assert.deepEqual(morning.ticks, ['2:morning']);
  assert.equal(morning.divider, 'Day 2 · Morning');
  await sendText(page, 'I sweep the floor');
  assert.ok((await lastPacket(page)).startsWith('DAY 2, MORNING (early; no sleep last night) · Location: '));
  assert.match(await lastPacket(page, 'bookkeep'), /^TURN \d+ · DAY 2, MORNING \(early; no sleep last night\)\. /);
  // Sleeping clears it.
  await sendText(page, '/rest');
  assert.ok((await lastPacket(page)).startsWith('DAY 3, MORNING (early) · Location: '));
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state.time)), '{"day":3,"phase":"morning","shorts":0}');
});

s.test('/cheat time night sets the clock (no tick, no narration), shows the divider and a quiet line, and /undo restores it; /cheat morning 2 sets the day too', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); window.__ticks = 0; const orig = Game.World.tick; Game.World.tick = info => { window.__ticks += 1; return orig(info); }; });
  await sendText(page, '/cheat');
  assert.match(await lastNotice(page), /\/cheat time <phase> \[day\] sets the clock, as in \/cheat time night or \/cheat morning 2\.$/);
  const s0 = await stateJson(page);
  const depth = await page.evaluate(() => Game.State.undoDepth());
  await sendText(page, '/cheat time night');
  const r = await page.evaluate(() => ({
    time: JSON.parse(JSON.stringify(Game.state.time)), turn: Game.state.meta.turn, log: Game.state.log.length, calls: Game.Api.Mock.calls.length, ticks: window.__ticks,
    last: [...document.querySelectorAll('#feed .f-item')].slice(-2).map(n => [n.className, n.textContent]),
    bar: document.getElementById('tb-time').textContent, depth: Game.State.undoDepth(),
    saved: JSON.parse(localStorage.getItem('novatria.autosave')).state.time
  }));
  assert.deepEqual(r.time, { day: 1, phase: 'night', shorts: 0 });
  assert.equal(r.turn, JSON.parse(s0).meta.turn, 'not a turn');
  assert.equal(r.log, JSON.parse(s0).log.length, 'nothing narrated');
  assert.equal(r.calls, 0, 'no API call');
  assert.equal(r.ticks, 0, 'no world tick');
  assert.deepEqual(r.last.map(x => x[1]), ['Day 1 · Night', 'Clock set to day 1, night.']);
  assert.match(r.last[0][0], /f-divider/);
  assert.match(r.last[1][0], /f-quiet/);
  assert.equal(r.bar, 'Day 1 · Night');
  assert.equal(r.depth, depth + 1, 'one undo step');
  assert.deepEqual(r.saved, r.time, 'autosaved');
  // The same clock again: nothing to do, no undo step.
  await sendText(page, '/cheat night');
  assert.equal(await lastNotice(page), 'The clock is already at day 1, night.');
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), depth + 1);
  // A phase and a day.
  await sendText(page, '/cheat morning 2');
  assert.deepEqual(await page.evaluate(() => Game.state.time), { day: 2, phase: 'morning', shorts: 0 });
  assert.equal(await lastQuiet(page), 'Clock set to day 2, morning.');
  // Bad input is refused and kept in the box.
  await sendText(page, '/cheat time');
  assert.match(await lastNotice(page), /^Set the clock to which phase\? Try \/cheat time night/);
  assert.equal(await page.inputValue('#cmd'), '/cheat time');
  await page.fill('#cmd', '');
  await sendText(page, '/cheat night 0');
  assert.equal(await lastNotice(page), 'The day must be 1 or more.');
  await page.fill('#cmd', '');
  // /undo takes each one back.
  await sendText(page, '/undo');
  assert.deepEqual(await page.evaluate(() => Game.state.time), { day: 1, phase: 'night', shorts: 0 });
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-divider')].pop().textContent), 'Day 1 · Night');
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), s0, 'the clock as it was');
  assert.equal(await page.evaluate(() => document.getElementById('tb-time').textContent), 'Day 1 · Morning');
  // The cheats still redo rolls.
  await sendText(page, '/cheat success');
  assert.match(await lastNotice(page), /^Cheat armed: your next roll will be a success\./);
});

s.test('a beat: Send with nothing typed (or /pass) lets the scene come to the player: no roll, a short, the people here act, the player says nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  assert.equal(await page.textContent('#send'), 'Wait', 'empty box: the button reads Wait');
  await page.fill('#cmd', 'hello');
  assert.equal(await page.textContent('#send'), 'Send');
  await page.fill('#cmd', '');
  const before = await page.evaluate(() => ({ turn: Game.state.meta.turn, shorts: Game.state.time.shorts, phase: Game.state.time.phase, log: Game.state.log.length }));
  await page.click('#send');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const t = await turnInfo(page);
  assert.equal(t.last.input, 'You wait and see.');
  assert.equal(t.act.actionType, 'wait');
  assert.equal(t.act.timeCost, 'short');
  assert.equal(t.last.roll, null);
  assert.ok(t.last.narration.startsWith('You wait.'), t.last.narration);
  const packet = await lastPacket(page);
  assert.match(packet, /\nBEAT: the player says and does nothing this turn and waits\./);
  assert.ok(!/The player did not say anything beyond/.test(packet));
  assert.ok((await lastPacket(page, 'bookkeep')).includes('BEAT: the player did and said nothing'));
  const after = await page.evaluate(() => ({ turn: Game.state.meta.turn, shorts: Game.state.time.shorts, phase: Game.state.time.phase, log: Game.state.log.length }));
  assert.equal(after.log, before.log + 1);
  assert.ok(after.turn === before.turn + 1 && (after.shorts !== before.shorts || after.phase !== before.phase), 'a short passed');
  await sendText(page, '/pass');
  assert.equal((await turnInfo(page)).last.input, 'You wait and see.');
  assert.equal(await page.textContent('#send'), 'Wait');
});

/* A place someone names (the owner's scene: Royce on where Dewayne lives),
   with this town's people: a speaker present here, and an owner elsewhere
   with a phase no schedule holds them in. */
/* Someone here to do the telling, and someone not here whose home in the
   cast the player has not found yet (its name, and what "X's house" means). */
const homeScene = page => page.evaluate(() => {
  const st = Game.state;
  const first = n => n.name.split(' ')[0];
  const here = Game.State.npcsAt(st.player.locationId);
  const speaker = here[0];
  const owner = st.npcs.find(n => n.id !== speaker.id && !here.includes(n) && n.status === 'free' && n.home && !Game.State.loc(n.home.locationId).discovered && st.npcs.filter(m => first(m) === first(n)).length === 1);
  const home = Game.State.loc(owner.home.locationId);
  return { loc: st.player.locationId, speaker: { id: speaker.id, name: speaker.name }, owner: { id: owner.id, first: first(owner) }, place: `${first(owner)}'s house`, home: { id: home.id, name: home.name, description: home.description, exits: home.exits.slice() } };
});

s.test('a person tells the player about a home the cast has written: the bookkeeper\'s place discovers it (never a second one), the feed says so, the map and Places show it dashed; walking there takes the dash away; /undo hides it again; a place the cast does not have is still added', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const x = await homeScene(page);
  const locs0 = await page.evaluate(() => Game.state.locations.length);
  await page.click('#tab-places');
  assert.equal(await page.evaluate(id => !!document.querySelector(`.map-place[data-loc="${id}"]`), x.home.id), false, 'not on the map before anyone says');
  assert.ok(!(await lastPacket(page, 'parse') || '').includes(x.home.name), 'nor in what the parser knows');
  await page.click('#mode-say');
  await page.click(`#say-to [data-to="${x.speaker.id}"]`);
  await page.evaluate(x => {
    Game.Api.Mock.queue('narrate', `${x.speaker.name} jerks a thumb up the road. "${x.owner.first}'s is the white house about a mile up the river road, on the left."`);
    Game.Api.Mock.queue('bookkeep', { placesRevealed: [{ name: x.place, type: 'house', description: 'The white house about a mile up the river road, on the left.', nearId: x.loc, ownerNpcId: x.owner.id, kind: 'home' }] });
  }, x);
  await sendText(page, `Where does ${x.owner.first} live? He said I could stay over.`);
  assert.equal(await lastQuiet(page), `Added to the map: ${x.home.name}.`);
  const made = await page.evaluate(id => JSON.parse(JSON.stringify(Game.State.loc(id))), x.home.id);
  assert.equal(await page.evaluate(() => Game.state.locations.length), locs0, 'no second place: the cast\'s home is discovered');
  assert.equal(made.discovered, true);
  assert.deepEqual(made.exits, x.home.exits, 'its own roads');
  assert.equal(made.description, x.home.description, 'its own description');
  assert.deepEqual([made.revealed.byNpcId, made.revealed.ownerNpcId, made.revealed.visited, made.revealed.authored], [x.speaker.id, x.owner.id, false, true], 'credited to the person the player asked');
  assert.equal(await page.evaluate(() => Game.state.player.locationId), x.loc, 'asking moves nobody');
  const book = await lastPacket(page, 'bookkeep');
  assert.ok(book.includes('\nLOCATIONS (the places list): ') && !book.split('\n').find(l => l.startsWith('LOCATIONS')).includes(x.home.id), 'the bookkeeper sees only the places the player knows');
  assert.ok(book.includes(`\nNAMED IN THE NARRATION (not here): ${x.owner.id} — `), 'and the owner, named but not here, so it can say whose home it is');
  const panel = () => page.evaluate(id => ({
    heard: (document.querySelector(`.map-place[data-loc="${id}"]`) || { dataset: {} }).dataset.heard || null,
    here: (document.querySelector(`.map-place[data-loc="${id}"]`) || { dataset: {} }).dataset.here || null,
    road: !!document.querySelector(`.map-road[data-road*="${id}"]`),
    legend: document.querySelector('.map-legend').textContent, text: document.getElementById('panel-body').innerText,
    dash: (() => { const m = document.querySelector(`.map-place[data-loc="${id}"] .map-mark`); return m ? getComputedStyle(m).strokeDasharray : null; })()
  }), made.id);
  let p = await panel();
  assert.equal(p.heard, '1');
  assert.ok(p.dash && p.dash !== 'none', 'a dashed outline: ' + p.dash);
  assert.ok(p.road, 'with its road');
  assert.match(p.legend, /Heard of/);
  assert.ok(p.text.includes(`${x.home.name} (heard of)`), 'in Places you know');
  // Walking there by its name.
  await page.click('#mode-do');
  await sendText(page, `I head to ${x.home.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), made.id, 'the player is there');
  assert.ok((await lastPacket(page)).includes(`DESTINATION: ${x.home.name} — ${x.home.description}`));
  assert.equal(await page.evaluate(id => Game.State.loc(id).revealed.visited, made.id), true);
  p = await panel();
  assert.deepEqual([p.heard, p.here], ['0', '1'], 'the first visit takes the dash away');
  assert.equal(p.dash, 'none');
  // /undo: the walk, then the telling.
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.player.locationId), x.loc);
  assert.equal((await panel()).heard, '1', 'heard of again');
  await sendText(page, '/undo');
  const gone = await page.evaluate(([id, name]) => ({
    discovered: Game.State.loc(id).discovered, revealed: Game.State.loc(id).revealed || null,
    marker: !!document.querySelector(`.map-place[data-loc="${id}"]`), list: document.getElementById('panel-body').innerText.includes(name),
    feed: [...document.querySelectorAll('#feed .f-quiet')].some(n => n.textContent.includes('Added to the map'))
  }), [made.id, x.home.name]);
  assert.deepEqual(gone, { discovered: false, revealed: null, marker: false, list: false, feed: false });
  // A place the cast does not have (an empty garage on Front Street) is still added, near where it was told.
  await page.evaluate(x => {
    Game.Api.Mock.queue('narrate', `${x.speaker.name} nods down the street. "${x.owner.first} wants that empty garage on Front Street. Been saving for years."`);
    Game.Api.Mock.queue('bookkeep', { placesRevealed: [{ name: 'the empty garage', type: 'shop', description: 'An empty garage on Front Street that someone has been saving to buy.', nearId: x.loc, ownerNpcId: x.owner.id, kind: 'business' }] });
  }, x);
  await sendText(page, `What does ${x.owner.first} want?`);
  const garage = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state.locations.find(l => l.name === 'The empty garage') || null)));
  assert.ok(garage, 'a new place');
  assert.deepEqual([garage.exits, garage.discovered, garage.revealed.kind, garage.revealed.ownerNpcId], [[x.loc], true, 'business', x.owner.id]);
  assert.equal(await page.evaluate(() => Game.state.locations.length), locs0 + 1);
  assert.equal(await page.evaluate(id => Game.State.loc(id).discovered, x.home.id), false, 'the home stays unfound');
});

s.test('the mock bookkeeper hears a home named in a quoted line; one already on the map, or a line naming a town place, adds nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const x = await homeScene(page);
  const town = await page.evaluate(() => Game.data.TOWN_DATA.locations[0].name);
  const say = async line => { await page.evaluate(([x, line]) => Game.Api.Mock.queue('narrate', `${x.speaker.name} shrugs. "${line}"`), [x, line]); await sendText(page, 'Where does he live?'); };
  await say(`${x.owner.first}'s place is the white house up past ${town}.`);
  assert.equal(await page.evaluate(() => Game.state.locations.filter(l => l.revealed).length), 0, 'a line that names a town place adds nothing');
  await say(`${x.owner.first}'s is the white house about a mile up the river road, on the left.`);
  const made = await page.evaluate(() => Game.state.locations.filter(l => l.revealed).map(l => ({ id: l.id, owner: l.revealed.ownerNpcId, discovered: l.discovered })));
  assert.deepEqual(made, [{ id: x.home.id, owner: x.owner.id, discovered: true }], 'the cast\'s home for them, found');
  assert.equal(await lastQuiet(page), `Added to the map: ${x.home.name}.`);
  await say(`Told you, ${x.owner.first}'s is the white house up the road.`);
  assert.equal(await page.evaluate(() => Game.state.locations.filter(l => l.revealed).length), 1, 'once on the map, not again');
});

/* People match the story, with the cast fixed: someone the narration names
   is a person the cast already has (their home can be found, nobody is
   added), and someone the player asks for is the cast's or nobody. */
s.test('a person the story names is someone in the cast: "X\'s wife" and their house are the cast\'s, the house is found, nobody is added even when the bookkeeper tries, and the narrator gets her from the cast; /undo takes the telling back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const c = await castFacts(page);
  // A scene with someone to tell it who is neither of them.
  const sc = await page.evaluate(c => {
    for (const l of Game.state.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      const here = Game.State.npcsAt(l.id, ph).filter(n => n.id !== c.husband.id && n.id !== c.wife.id);
      if (l.discovered && here.length && !Game.State.npcsAt(l.id, ph).some(n => n.id === c.wife.id)) return { loc: l.id, phase: ph, speaker: { id: here[0].id, name: here[0].name } };
    }
    return null;
  }, c);
  await place(page, sc.loc, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const home = await page.evaluate(id => { const h = Game.State.npc(id).home; const l = Game.State.loc(h.locationId); return { id: l.id, name: l.name, discovered: l.discovered }; }, c.husband.id);
  assert.equal(home.discovered, false, 'the house is not on the map yet');
  assert.equal(await page.evaluate(id => Game.State.npc(id).home.locationId, c.wife.id), home.id, 'she lives there too');
  const before = await counts(page);
  await page.click('#mode-say');
  await page.click(`#say-to [data-to="${sc.speaker.id}"]`);
  await page.evaluate(([c, sc]) => {
    Game.Api.Mock.queue('narrate', `${sc.speaker.name} jerks a thumb up the road. "${c.husband.first}'s is the white house about a mile up the river road, on the left. Now, I'm not saying his wife Mavis is gonna be thrilled when you knock."`);
    // What an older bookkeeper sent: the house, and the wife as somebody new. The house is found; the wife is refused.
    Game.Api.Mock.queue('bookkeep', { placesRevealed: [{ name: `${c.husband.first}'s house`, type: 'house', description: 'The white house about a mile up the river road, on the left.', nearId: sc.loc, ownerNpcId: c.husband.id, kind: 'home' }], peopleRevealed: [{ name: 'Mavis', pronouns: 'she', relationToNpcId: c.husband.id, who: 'wife' }] });
  }, [c, sc]);
  await sendText(page, `Where does ${c.husband.first} live? He said I could stay over.`);
  assert.equal(await lastQuiet(page), `Added to the map: ${home.name}.`);
  assert.deepEqual(await counts(page), before, 'nobody added, no second house');
  assert.ok(!(await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent))).some(t => t.startsWith('Added to People')));
  assert.match(await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'rejected' && /^peopleRevealed/.test(d.path || '')).map(d => d.reason).join(' | ')), /the cast is fixed/);
  // Walking there: she is home in the morning (asleep after the night counter), and the narrator gets her from the cast.
  await page.click('#mode-do');
  await page.evaluate(() => { while (Game.state.time.phase !== 'morning') Game.State.apply({ advanceTime: 'long' }); });
  await sendText(page, `I head to ${home.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), home.id);
  await sendText(page, 'I look around');
  const present = (await lastPacket(page)).split('\n').find(l => l.startsWith('PRESENT:'));
  assert.ok(present.includes(`${c.wife.name} (${c.wife.age}, she/her; ${c.wife.role}; ${c.husband.first}'s wife; husband: ${c.husband.name}`), present);
  // /undo: the look, the walk, then the telling: the house is unfound again.
  for (let i = 0; i < 3; i++) await sendText(page, '/undo');
  assert.equal(await page.evaluate(id => Game.State.loc(id).discovered, home.id), false);
  assert.deepEqual(await counts(page), before);
});

s.test('someone the player asks for is the cast\'s or nobody: a stranger by description is not there and nothing is made; a name, "X\'s wife" and a one-word job find the cast member; the parser hears pronouns', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const fx = await fixtures(page);
  await place(page, fx.tavern.id, 'evening');
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const c = await castFacts(page);
  const before = await counts(page);
  const ask = async (desc, text) => {
    await page.evaluate(desc => Game.Api.Mock.queue('parse', { actionType: 'talk', targets: ['new:' + desc], needsRoll: false, timeCost: 'instant' }), desc);
    await sendText(page, text);
    return page.evaluate(() => Game.Pipeline.lastTurn.action.targets);
  };
  for (const [desc, word] of [['woman by the jukebox', 'woman'], ['man at the end of the bar', 'man']]) {
    assert.deepEqual(await ask(desc, `I talk to the ${desc}`), [], desc);
    assert.ok((await lastPacket(page)).includes(`NOT PRESENT: ${word} (does not exist in this town; it is simply not there).`), desc);
  }
  assert.deepEqual(await counts(page), before, 'nobody was made');
  // By name, by who she is to someone, by a one-word job: the cast's own.
  assert.deepEqual(await ask('Mavis', 'I ask for Mavis'), [c.wife.id]);
  assert.deepEqual(await ask(`${c.husband.first}'s wife`, `I ask about ${c.husband.first}'s wife`), [c.wife.id], 'never the husband');
  const clerk = await ask('the clerk', 'I ask for the clerk');
  assert.equal(clerk.length, 1);
  assert.match(await page.evaluate(id => Game.State.npc(id).role, clerk[0]), /\bclerk\b/, 'someone whose job is clerk');
  const bartender = await ask('bartender', 'I wave the bartender over');
  assert.ok(await page.evaluate(([id, loc]) => / bartender\b|^owner and bartender/.test(Game.State.npc(id).role) && Game.State.npcsAt(loc).some(n => n.id === id), [bartender[0], fx.tavern.id]), 'the bartender here: ' + bartender);
  assert.deepEqual(await counts(page), before, 'still nobody made');
  // The parser hears everyone, with pronouns.
  assert.ok((await lastPacket(page, 'parse')).includes(`${c.wife.id} — ${c.wife.name} (she/her; ${c.wife.role}; wife of ${c.husband.name}`));
});

s.test('when time passes, people who arrive at or leave the player\'s place are handed to the next narration, then cleared', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  // A place and a daytime phase whose next phase changes who is there (never night -> morning: night holds).
  const sc = await page.evaluate(() => {
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    for (const l of Game.state.locations) for (let i = 0; i < 3; i++) {
      const a = (l.npcIdsBySchedule[PH[i]] || []), b = (l.npcIdsBySchedule[PH[i + 1]] || []);
      const arrived = b.filter(x => !a.includes(x)), left = a.filter(x => !b.includes(x));
      if (arrived.length || left.length) return { loc: l.id, phase: PH[i], next: PH[i + 1], arrived, left };
    }
    return null;
  });
  assert.ok(sc, 'the town has a schedule change somewhere in daytime');
  await place(page, sc.loc, sc.phase);
  await sendText(page, '/wait ' + sc.next);
  const pending = await page.evaluate(() => Game.state.pendingScene || null);
  assert.equal(pending, null, 'the wait narration consumed the scene change');
  const packet = await lastPacket(page);
  assert.match(packet, /\nSINCE THE LAST TURN \(time moved on to \w+\): /, packet);
  for (const id of sc.arrived) assert.ok(packet.includes(await page.evaluate(id => Game.State.npc(id).name, id)), 'arrival named: ' + id);
  for (const id of sc.left) assert.ok(packet.includes(await page.evaluate(id => Game.State.npc(id).name, id)), 'departure named: ' + id);
  const narr = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration);
  assert.ok(/arrives?\.|ha(s|ve) left\./.test(narr), narr);
  // A normal turn afterwards carries no stale line.
  await sendText(page, 'I look around');
  assert.doesNotMatch(await lastPacket(page), /SINCE THE LAST TURN/);
  // A change recorded for another place is dropped, not narrated.
  await page.evaluate(id => Game.State.apply({ sceneChange: { locationId: id, arrived: [Game.state.npcs[0].id], left: [] } }), sc.loc);
  const other = await page.evaluate(id => Game.State.loc(id).exits[0], sc.loc);
  await place(page, other, sc.next);
  await sendText(page, 'I look around');
  assert.doesNotMatch(await lastPacket(page), /SINCE THE LAST TURN/);
  assert.equal(await page.evaluate(() => Game.state.pendingScene || null), null, 'a stale change is cleared');
});

s.test('the player fixes someone\'s pronouns: chips on the People card, or /pronouns <name> <pronoun>; a quiet line, the card and the narrator follow, no turn and no API call', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const sc = await findScene(page, { min: 1 });
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const who = (await presentHere(page))[0];
  await page.evaluate(id => Game.State.apply({ npcKnownToPlayer: [id] }), who.id); // strangers have no card yet
  const was = await page.evaluate(id => Game.State.npc(id).pronouns, who.id);
  const want = was === 'she' ? 'he' : 'she';
  await page.click('#tab-people');
  await page.click(`#phead-${who.id}`);
  const chips = () => page.evaluate(id => [...document.querySelectorAll(`.pcard[data-npc="${id}"] .pcard-pchip`)].map(b => [b.dataset.pron, b.textContent, b.getAttribute('aria-pressed')]), who.id);
  assert.deepEqual(await chips(), [['he', 'he/him', String(was === 'he')], ['she', 'she/her', String(was === 'she')], ['they', 'they/them', String(was === 'they')]]);
  const turn = await page.evaluate(() => Game.state.meta.turn);
  await page.click(`.pcard[data-npc="${who.id}"] .pcard-pchip[data-pron="${want}"]`);
  const after = await page.evaluate(id => ({ p: Game.State.npc(id).pronouns, turn: Game.state.meta.turn, calls: Game.Api.Mock.calls.length, label: document.querySelector(`.pcard[data-npc="${id}"] .pcard-pron`).textContent }), who.id);
  assert.deepEqual([after.p, after.turn, after.calls], [want, turn, 0], 'changed through the engine, no turn, no call');
  assert.equal(after.label, want === 'she' ? 'she/her' : 'he/him', 'the card shows it');
  assert.equal((await chips()).find(c => c[0] === want)[2], 'true', 'the chip is pressed');
  const role = await page.evaluate(id => Game.State.npc(id).role, who.id);
  assert.equal(await lastQuiet(page), `${who.name} goes by ${want === 'she' ? 'she/her' : 'he/him'} now (${role.charAt(0).toLowerCase() + role.slice(1).split(/[,;]/)[0].trim()}).`);
  // The narrator sees the new pronouns right after the name.
  const whoAge = await page.evaluate(id => Game.State.npc(id).age, who.id);
  assert.ok((await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }))).includes(`${who.name} (${whoAge}, ${want === 'she' ? 'she/her' : 'he/him'}; `));
  // The command: by first name, with "they"; a wrong name and a wrong pronoun are told so.
  await sendText(page, `/pronouns ${who.name.split(' ')[0]} they`);
  assert.equal(await page.evaluate(id => Game.State.npc(id).pronouns, who.id), 'they');
  assert.equal(await lastQuiet(page), `${who.name} goes by they/them now (${role.charAt(0).toLowerCase() + role.slice(1).split(/[,;]/)[0].trim()}).`);
  await sendText(page, '/pronouns Nobody Atall she');
  assert.equal(await lastNotice(page), 'There is nobody called Nobody Atall in the game.');
  await sendText(page, '/pronouns');
  assert.equal(await lastNotice(page), 'Whose pronouns, and which? Try /pronouns Mavis she (she, he or they).');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls.length), 0, 'none of it calls the API');
});

s.test('the player edits someone on their People card: Edit opens the whole record; Save is one engine edit and one /undo step with a quiet line naming what changed, and the card, the narrator and the schedule follow; Cancel, Escape and Enter change nothing; a taken name is refused with the reason and the form stays open; /edit <name> opens the editor; no edit while a turn runs', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  // A town person at home in some phases and out in the rest (now in the cells), met; someone else to be related to; a place for a home.
  const x = await page.evaluate(() => {
    const st = Game.state;
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    const at = id => PH.map(p => { const l = st.locations.find(y => ((y.npcIdsBySchedule || {})[p] || []).includes(id)); return l ? l.id : null; });
    const townIds = Game.town.npcs.map(n => n.id);
    const first = n => n.name.split(' ')[0];
    const who = st.npcs.find(n => townIds.includes(n.id) && n.home && n.home.phases.length > 0 && n.home.phases.length < 4 && first(n) !== 'Mavis' && st.npcs.filter(m => first(m) === first(n)).length === 1);
    const other = st.npcs.find(n => n.id !== who.id && townIds.includes(n.id) && first(n) !== 'Mavis');
    const home = st.locations.find(l => l.discovered && !l.closed && !at(who.id).includes(l.id) && !['police', 'watch'].includes(l.type));
    const schedule = at(who.id);
    Game.State.apply({ npcKnownToPlayer: [who.id], newMemories: [{ npcId: who.id, text: 'Tester asked too many questions', weight: 1 }], effects: [{ op: 'npcStatus', npcId: who.id, status: 'arrested' }] });
    return {
      who: { id: who.id, name: who.name, first: first(who), pronouns: who.pronouns, voice: who.voice, age: who.age, history: who.history, schedule, free: who.home.phases.slice() },
      other: { id: other.id, name: other.name, first: first(other) }, home: home.id
    };
  });
  const id = x.who.id;
  const card = `.pcard[data-npc="${id}"]`;
  const f = k => `#pe-${k}-${id}`;
  const want = x.who.pronouns === 'she' ? 'he' : 'she';
  const label = want === 'she' ? 'she/her' : 'he/him';
  const depth = () => page.evaluate(() => Game.State.undoDepth());
  const editing = () => page.evaluate(() => Game.UI.editing);
  await page.click('#tab-people');
  await page.click(`#phead-${id}`);
  assert.ok(await page.isVisible(`${card} .pcard-fix .pcard-pchip`) && await page.isVisible(`${card} .pcard-fix .pcard-edit`), 'Edit sits beside the pronoun chips');
  const before = await stateJson(page);
  const d0 = await depth();

  // Cancel, Escape and Enter in a one-line field change nothing.
  await page.click(`${card} .pcard-edit`);
  assert.ok(await page.isVisible(`${card} .pedit`));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.pedit .pcard-look, .pedit .pcard-notes, .pedit .pcard-fix')].length), 0, 'the form takes the place of the card body');
  assert.equal(await page.inputValue(f('name')), x.who.name);
  assert.equal(await page.inputValue(f('pronouns')), x.who.pronouns);
  // Age and history are on the form too.
  assert.equal(await page.inputValue(f('age')), String(x.who.age));
  assert.equal(await page.inputValue(f('history')), x.who.history);
  assert.ok(await page.isChecked(`${card} input[name="status"][value="arrested"]`));
  assert.ok(await page.isDisabled(f('relation')), 'no relation without someone to be related to');
  assert.ok(await page.isHidden(f('goal')), 'goal and secret are folded away');
  await page.fill(f('name'), 'Somebody Else');
  await page.click(`${card} .pedit-cancel`);
  assert.equal(await page.locator(`${card} .pedit`).count(), 0);
  assert.ok(await page.isVisible(`${card} .pcard-look`), 'Cancel puts the card back');
  await page.click(`${card} .pcard-edit`);
  assert.equal(await page.inputValue(f('name')), x.who.name, 'a cancelled draft is gone');
  await page.fill(f('role'), 'something else');
  await page.press(f('role'), 'Escape');
  assert.equal(await page.locator(`${card} .pedit`).count(), 0, 'Escape cancels');
  await page.click(`${card} .pcard-edit`);
  await page.fill(f('name'), 'Mavis Toler');
  await page.press(f('name'), 'Enter');
  assert.equal(await editing(), id, 'Enter in a one-line field does not save');
  assert.deepEqual([await stateJson(page), await depth()], [before, d0]);

  // A taken name: refused, the reason in the feed and the form, everything typed kept.
  await page.fill(f('name'), x.other.name);
  await page.fill(f('role'), 'night clerk at the motor court');
  await page.click(`${card} .pedit-save`);
  assert.deepEqual([await stateJson(page), await depth()], [before, d0], 'nothing changed, no undo step');
  assert.equal(await lastNotice(page), `${x.who.name} was not changed: the name ${x.other.name} is taken: ${x.other.id} (${x.other.name}).`);
  assert.equal(await editing(), id, 'the form stays open');
  assert.deepEqual([await page.inputValue(f('name')), await page.inputValue(f('role'))], [x.other.name, 'night clerk at the motor court'], 'with the values typed');
  assert.match(await page.textContent(`${card} .pedit .err`), /^Not saved: the name .* is taken/);
  // An age out of range is refused the same way.
  await page.fill(f('name'), 'Mavis Toler');
  await page.fill(f('age'), '130');
  await page.click(`${card} .pedit-save`);
  assert.deepEqual([await stateJson(page), await depth()], [before, d0], 'a bad age changes nothing');
  assert.match(await page.textContent(`${card} .pedit .err`), /^Not saved: age must be a whole number from 0 to 120/);

  // The whole record.
  await page.fill(f('name'), 'Mavis Toler');
  await page.selectOption(f('pronouns'), want);
  await page.fill(f('age'), '38');
  await page.fill(f('look'), 'A small, tired woman in a motel smock.');
  await page.fill(f('history'), 'She came down from Calder in the spring and took the night desk nobody else wanted.');
  await page.evaluate(sel => { const r = document.querySelector(sel); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); }, f('attitude'));
  assert.equal(await page.textContent(f('attitude-word')), '+40 · warm', 'the live word beside the slider');
  await page.selectOption(f('relTo'), x.other.id);
  assert.ok(await page.isEnabled(f('relation')));
  await page.fill(f('relation'), 'wife');
  await page.selectOption(f('home'), x.home);
  await page.check(`${card} input[name="status"][value="free"]`);
  await page.click(`${card} .pedit-add`);
  assert.equal(await page.evaluate(sel => document.activeElement === document.querySelector(sel), f('mem-1')), true, 'the new memory line has the focus');
  await page.fill(f('mem-1'), 'Tester paid back the twenty');
  await page.selectOption(f('memw-1'), '3');
  await page.click(`${card} .pedit-mem[data-i="0"] .pedit-mem-del`);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.pedit-mem textarea')].map(t => t.value)), ['Tester paid back the twenty'], 'removed; what was typed in the other line stays');
  assert.equal(await page.inputValue(f('name')), 'Mavis Toler', 'and so does the rest of the form');
  await page.click(`${card} .pedit-hidden > summary`);
  assert.match(await page.textContent(`${card} .pedit-hidden`), /These are the game's secrets about this person\. Reading them spoils the story\./);
  await page.fill(f('goal'), 'Get out of this town.');
  await page.fill(f('secret'), 'She skimmed the till for a year.');
  const pre = await stateJson(page);
  const turn = JSON.parse(pre).meta.turn;
  await page.click(`${card} .pedit-save`);

  const r = await page.evaluate(id => JSON.parse(JSON.stringify(Game.State.npc(id))), id);
  const voiceTurned = await page.evaluate(([v, p, was]) => Game.turnLook(v, p, was) !== v, [x.who.voice, want, x.who.pronouns]);
  assert.deepEqual([r.name, r.age, r.pronouns, r.role, r.look, r.history, r.attitude, r.status, r.alive, r.goal, r.secret],
    ['Mavis Toler', 38, want, 'night clerk at the motor court', 'A small, tired woman in a motel smock.', 'She came down from Calder in the spring and took the night desk nobody else wanted.', 40, 'free', true, 'Get out of this town.', 'She skimmed the till for a year.']);
  assert.deepEqual(r.created, { turn: null, day: null, by: 'edit', relationToNpcId: x.other.id, relation: 'wife' });
  assert.deepEqual(r.home, { locationId: x.home, phases: x.who.free, revealed: true });
  assert.deepEqual(r.memories, [{ turn, text: 'Tester paid back the twenty', weight: 3 }]);
  const fields = ['name', 'age', 'pronouns', 'role', 'look'].concat(voiceTurned ? ['voice'] : [], ['history', 'attitude', 'relation', 'home', 'status', 'memories', 'goal', 'secret']);
  assert.equal(await lastQuiet(page), `Edited Mavis Toler: ${fields.join(', ')}.`);
  assert.equal(await depth(), d0 + 1, 'one undo step');
  assert.deepEqual(await page.evaluate(() => [Game.state.meta.turn, Game.Api.Mock.calls.length]), [turn, 0], 'no turn and no API call');
  // The card: closed editor, its details open, the new record.
  const shown = await page.evaluate(sel => { const c = document.querySelector(sel); return { edit: !!c.querySelector('.pedit'), open: !c.querySelector('.pcard-more').hidden, name: c.querySelector('.pcard-name').textContent, pron: c.querySelector('.pcard-pron').textContent, role: c.querySelector('.pcard-role').textContent, look: c.querySelector('.pcard-look').textContent, notes: c.querySelector('.pcard-notes').textContent, focus: document.activeElement.classList.contains('pcard-edit') }; }, card);
  assert.deepEqual(shown, { edit: false, open: true, name: 'Mavis Toler', pron: label, role: `Night clerk at the motor court · ${x.other.first}'s wife`, look: 'A small, tired woman in a motel smock.', notes: shown.notes, focus: true });
  assert.match(shown.notes, /paid back the twenty/);
  // The age beside the name, and the new history in the card's facts.
  assert.equal(await page.textContent(`${card} .pcard-age`), '· 38');
  assert.equal(await page.textContent(`${card} .pcard-facts dd[data-fact="history"]`), 'She came down from Calder in the spring and took the night desk nobody else wanted.');
  // The schedule (and so the map): at the new home in the phases the old one held, back at the town's own schedule in the rest.
  assert.ok(await page.evaluate(([home, ph, id]) => ph.every(p => Game.State.npcsAt(home, p).some(n => n.id === id)), [x.home, x.who.free, id]), 'at the new home');
  // The narrator, next turn: the new name, pronouns, role and relation.
  await place(page, await page.evaluate(id => Game.World.whereIs(id), id), null);
  const packet = await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }));
  assert.ok(packet.includes(`Mavis Toler (38, ${label}; night clerk at the motor court; ${x.other.first}'s wife; `), packet.split('\n').find(l => l.startsWith('PRESENT')));

  // One /undo takes all of it back.
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), pre);
  assert.equal(await depth(), d0);
  assert.equal(await page.textContent(`${card} .pcard-name`), x.who.name);

  // /edit <first name> opens the editor; nobody and no name are told so.
  await sendText(page, `/edit ${x.who.first}`);
  assert.equal(await editing(), id);
  assert.equal(await page.getAttribute('#panel-body', 'data-tab'), 'people');
  assert.ok(await page.isVisible(`${card} .pedit`));
  assert.ok(await page.evaluate(sel => document.activeElement === document.querySelector(sel), f('name')), 'the name field has the focus');
  await page.press(f('name'), 'Escape');
  await sendText(page, '/edit Nobody Atall');
  assert.equal(await lastNotice(page), 'There is nobody called Nobody Atall in the game.');
  await sendText(page, '/edit');
  assert.equal(await lastNotice(page), 'Edit whom? Try /edit Mavis.');
  assert.equal(await editing(), null);

  // While a turn runs, Edit and Save are off and say why.
  await page.click(`${card} .pcard-edit`);
  await page.evaluate(() => { Game.Api.Mock.delay = 120; Game.Api.Mock.queue('narrate', { delay: 400 }); window.__turn = Game.Pipeline.submit('I wait a moment'); });
  await page.waitForFunction(() => Game.Pipeline.busy);
  const busy = await page.evaluate(sel => ({ save: document.querySelector(sel + ' .pedit-save').disabled, title: document.querySelector(sel + ' .pedit-save').title, start: Game.UI.editPerson(Game.state.npcs[0].id) }), card);
  assert.deepEqual(busy, { save: true, title: 'Wait for the current turn to finish.', start: false });
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.ok(await page.isEnabled(`${card} .pedit-save`), 'back on after the turn; the form stayed open');
  await page.click(`${card} .pedit-cancel`);
  assert.ok(await page.isEnabled(`${card} .pcard-edit`));
  await page.evaluate(() => { Game.Api.Mock.delay = 120; Game.Api.Mock.queue('narrate', { delay: 400 }); window.__turn = Game.Pipeline.submit('I wait a moment more'); });
  await page.waitForFunction(() => Game.Pipeline.busy);
  assert.deepEqual(await page.evaluate(sel => { const b = document.querySelector(sel + ' .pcard-edit'); return [b.disabled, b.title]; }, card), [true, 'Wait for the current turn to finish.']);
  await page.waitForFunction(() => !Game.Pipeline.busy);
});

s.test('the narrator packet says what people can know about the player: came to town today on day 1, yesterday on day 2, N days ago after; only their memories and what happened in front of them; and the check runs with the day', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const line = () => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n').find(l => l.startsWith('WHAT PEOPLE KNOW:'));
    const name = Game.state.player.name;
    const town = Game.state.meta.townName;
    const lines = Game.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n');
    const out = { name, town, d1: line(), after: lines.findIndex(l => l.startsWith('WHAT PEOPLE KNOW:')), present: lines.findIndex(l => l.startsWith('PRESENT:')) };
    Game.State.apply({ setTime: { day: 2, phase: 'morning' } });
    out.d2 = line();
    Game.State.apply({ setTime: { day: 4, phase: 'night' } });
    out.d4 = line();
    return out;
  });
  assert.equal(r.after, r.present + 1, 'right after PRESENT');
  assert.ok(r.d1.startsWith(`WHAT PEOPLE KNOW: ${r.name} came to ${r.town} today (day 1) and was a stranger here before that. Each person knows about ${r.name} only what their own "remembers" list says and what has happened in front of them (STORY SO FAR, THIS SCENE). Anyone with no memory of a past with ${r.name} never met them, heard of them, or got a call, news or a warning about them before they came.`), r.d1);
  assert.ok(r.d2.includes(' came to ' + r.town + ' yesterday (this is day 2) and'), r.d2);
  assert.ok(r.d4.includes(' came to ' + r.town + ' 3 days ago (this is day 4) and'), r.d4);
});

/* Direction change 10: a loose end's person shares a past with the player,
   so on day 1 "I knew you'd show up" is theirs to say. Style.check skips the
   invented-past check (pastKnown) while such a person is present. */
s.test('on day 1 a loose-end person may speak of the past they share with the player: the invented-past check is skipped while they are present, and runs otherwise', async h => {
  const line = '"I knew you\'d show up."';
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['enemy'] });
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const unit = await page.evaluate(l => [Game.Style.check(l, { day: 1 }).ok, Game.Style.check(l, { day: 1, pastKnown: true }).ok, Game.Style.check(l, { day: 2 }).ok], line);
  assert.deepEqual(unit, [false, true, true], 'the check runs on day 1 unless the past is known');
  // The enemy comes to the player's place; the line is theirs to say, so there is no rewrite.
  const r = await page.evaluate(async l => {
    const le = Game.state.player.looseEnds[0];
    const n = Game.State.npc(le.npcId);
    Game.State.apply({ visits: [{ npcId: n.id, locationId: Game.state.player.locationId }] });
    Game.Api.Mock.queue('narrate', `${n.name} looks up. ${l}`);
    const res = await Game.Pipeline.submit('I look around');
    return { ok: res.ok, present: Game.State.npcsAt(Game.state.player.locationId).some(p => p.id === n.id), style: Game.State.debugLog.filter(e => e.kind === 'style').map(e => e.problems.map(p => p.type)), narration: Game.state.log[Game.state.log.length - 1].narration };
  }, line);
  assert.equal(r.ok, true);
  assert.equal(r.present, true, 'the loose-end person is here');
  assert.deepEqual(r.style, [], 'no style problem: ' + JSON.stringify(r.style));
  assert.ok(r.narration.endsWith(line), r.narration);
  // With nobody here who knows the player, the same line is flagged and rewritten.
  const page2 = await h.open({ viewport: LAPTOP });
  await quickStart(page2, { kinds: [] });
  await page2.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const r2 = await page2.evaluate(async l => {
    Game.Api.Mock.queue('narrate', `Somebody looks up. ${l}`);
    const res = await Game.Pipeline.submit('I look around');
    return { ok: res.ok, style: Game.State.debugLog.filter(e => e.kind === 'style').map(e => e.problems.map(p => p.type)) };
  }, line);
  assert.equal(r2.ok, true);
  assert.deepEqual(r2.style, [['past']], 'the invented past is flagged once and rewritten: ' + JSON.stringify(r2.style));
});

/* A lived-in town (docs/BUILD_PLAN.md, direction change 9). */
s.test('a place out of town is never a destination: the parser\'s destination, a move to its other name, and a walk-and-do there are refused with a plain line, nothing spent, the input kept in the feed; the parser hears where the game never goes', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const x = await page.evaluate(() => { const l = Game.state.locations.find(y => y.away && (y.aka || []).length); return { id: l.id, name: l.name, distance: l.distance, aka: l.aka[0], town: Game.state.meta.townName }; });
  const line = `${x.name.replace(/^The /, 'the ').replace(/^./, c => c.toUpperCase())} is out of town (${x.distance}). The story stays in ${x.town}: you can talk about it, but you can't go there.`;
  const before = await stateJson(page);
  // The parser names it as the destination of a move.
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'move', destinationId: id, targets: [], timeCost: 'long', summary: 'Drives out of town' }), x.id);
  let r = await page.evaluate(() => Game.Pipeline.submit('I drive out there'));
  assert.deepEqual([r.ok, r.reason, r.placeId], [false, 'away', x.id]);
  assert.equal(await lastNotice(page), line);
  assert.equal(await stateJson(page), before, 'nothing changed: no turn, no time, no move');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-input')].pop().textContent.includes('I drive out there')), true, 'the input stays in the feed');
  // By another name (new:<aka>): the engine finds the place, and refuses it all the same.
  await page.evaluate(aka => Game.Api.Mock.queue('parse', { actionType: 'move', destinationId: null, targets: [`new:${aka.replace(/^the /, '')}`], timeCost: 'long', summary: 'Goes there' }), x.aka);
  r = await page.evaluate(aka => Game.Pipeline.submit(`I head up to ${aka}`), x.aka);
  assert.deepEqual([r.ok, r.reason], [false, 'away']);
  assert.equal(await stateJson(page), before);
  // A walk and then something there (not a move): refused before anything moves.
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'talk', destinationId: id, targets: [], timeCost: 'short', summary: 'Asks around there' }), x.id);
  r = await page.evaluate(() => Game.Pipeline.submit('I go there and ask around'));
  assert.deepEqual([r.ok, r.reason], [false, 'away']);
  assert.equal(await stateJson(page), before);
  // The engine never puts the player there either.
  assert.match(await page.evaluate(id => Game.State.apply({ playerLocationId: id }).rejected[0].reason, x.id), /is out of town; the game never goes there/);
  // Talking about it is fine: an ordinary turn, and the parser hears it among the places out of town.
  r = await page.evaluate(() => Game.Pipeline.submit('I look around'));
  assert.equal(r.ok, true);
  const parse = await lastPacket(page, 'parse');
  assert.ok(parse.includes(`\nOUT OF TOWN (never a destination; the story stays here): `) && parse.includes(`${x.id} — ${x.name}`), 'the parser hears the places out of town');
  assert.ok(!parse.split('\n').find(l => l.startsWith('OTHER PLACES IN TOWN')).includes(x.id), 'never among the places one move reaches');
});

s.test('the dead and the people who live elsewhere are never present: not scheduled, not in PRESENT, not brought by a visit; asked for, they are NOT PRESENT with why; named in the story, the player knows of them and People lists them under Elsewhere and Gone with their age and when or where; ages in every person line', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Api.Mock.delay = 0; });
  const x = await page.evaluate(() => {
    const st = Game.state;
    const dead = st.npcs.find(n => Game.presenceOf(n) === 'dead' && n.died);
    const away = st.npcs.find(n => Game.presenceOf(n) === 'away' && n.where);
    const pick = n => ({ id: n.id, name: n.name, first: n.name.split(' ')[0], age: n.age, died: n.died, where: n.where, history: n.history, pron: Game.pronounLabel(n.pronouns) });
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    const seen = PH.flatMap(p => st.locations.flatMap(l => Game.State.npcsAt(l.id, p).filter(n => Game.presenceOf(n) !== 'here').map(n => `${n.id} ${p} ${l.id}`)));
    const visit = Game.State.apply({ visits: [{ npcId: dead.id, locationId: st.player.locationId }, { npcId: away.id, locationId: st.player.locationId }] }).rejected.map(r => r.reason);
    return { dead: pick(dead), away: pick(away), seen, visit, here: st.player.locationId };
  });
  assert.deepEqual(x.seen, [], 'nowhere in any phase');
  // Before the story names them, People does not list them.
  await page.click('#tab-people');
  assert.equal(await page.locator(`.pcard[data-npc="${x.dead.id}"], .pcard[data-npc="${x.away.id}"]`).count(), 0);
  assert.deepEqual(x.visit, [`${x.dead.id} is dead`, `${x.away.id} is gone`], 'a visit is refused');
  // Asked for by name: NOT PRESENT, and the narrator is told why.
  await page.evaluate(n => Game.Api.Mock.queue('parse', { actionType: 'talk', targets: [`new:${n}`], summary: 'Asks for them' }), x.dead.first);
  await sendText(page, `I ask for ${x.dead.first}`);
  let packet = await lastPacket(page);
  assert.ok(packet.includes(`NOT PRESENT: ${x.dead.name} (dead (${x.dead.died}))`), packet.split('\n').find(l => l.startsWith('NOT PRESENT')));
  assert.ok(!packet.split('\n').find(l => l.startsWith('PRESENT:')).includes(`${x.dead.name} (`), 'not in PRESENT');
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'talk', targets: [id], summary: 'Asks for them' }), x.away.id);
  await sendText(page, `I ask for ${x.away.first}`);
  packet = await lastPacket(page);
  assert.ok(packet.includes(`NOT PRESENT: ${x.away.name} (not in town (${x.away.where}))`), packet.split('\n').find(l => l.startsWith('NOT PRESENT')));
  // Every person line carries the age before the pronouns; the parser hears the dead and the far away apart from the town.
  const present = packet.split('\n').find(l => l.startsWith('PRESENT:'));
  const here = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => ({ name: n.name, age: n.age, pron: Game.pronounLabel(n.pronouns) })));
  for (const n of here) assert.ok(present.includes(`${n.name} (${n.age}, ${n.pron}; `), n.name);
  const parse = await lastPacket(page, 'parse');
  assert.match(parse, /\nPLAYER: Tester \(\d+; [^)]+\); /);
  assert.ok(parse.includes(`\nNOT IN TOWN (dead, or living elsewhere; talked about, never met): `) && parse.includes(`${x.dead.id} — ${x.dead.name} (dead; `) && parse.includes(`${x.away.id} — ${x.away.name} (lives elsewhere; `));
  assert.ok(!parse.split('\n').find(l => l.startsWith('EVERYONE ELSE IN TOWN')).includes(x.dead.id), 'not among the people in town');
  // The story names them: the player knows of them now (asking for them already named them in the narration).
  await page.click('#tab-people');
  await page.evaluate(n => Game.Api.Mock.queue('narrate', `Somebody at the counter says ${n.dead.first} would have hated all this, and that ${n.away.name} has not called in weeks.`), x);
  await sendText(page, 'I listen to the talk at the counter');
  const known = await page.evaluate(n => [Game.State.npc(n.dead.id).knownToPlayer, Game.State.npc(n.away.id).knownToPlayer], x);
  assert.deepEqual(known, [true, true]);
  const groups = await page.evaluate(() => [...document.querySelectorAll('#panel-body .people-group')].map(g => ({ key: g.dataset.group, title: g.querySelector('h3').firstChild.textContent, ids: [...g.querySelectorAll('.pcard')].map(c => c.dataset.npc) })));
  const gone = groups.find(g => g.key === 'gone');
  const elsewhere = groups.find(g => g.key === 'elsewhere');
  assert.ok(gone && gone.title === 'Gone' && gone.ids.includes(x.dead.id), JSON.stringify(groups));
  assert.ok(elsewhere && elsewhere.title === 'Elsewhere' && elsewhere.ids.includes(x.away.id), JSON.stringify(groups));
  assert.deepEqual(groups.map(g => g.key).slice(-2), ['elsewhere', 'gone'], 'after the people in town');
  const card = id => page.evaluate(id => { const c = document.querySelector(`.pcard[data-npc="${id}"]`); return { name: c.querySelector('.pcard-name').textContent, age: c.querySelector('.pcard-age').textContent, pron: c.querySelector('.pcard-pron').textContent, where: c.querySelector('.pcard-where').textContent, att: !!c.querySelector('.att') }; }, id);
  assert.deepEqual(await card(x.dead.id), { name: x.dead.name, age: `· ${x.dead.age}`, pron: x.dead.pron, where: `Died ${x.dead.died}`, att: false });
  assert.deepEqual(await card(x.away.id), { name: x.away.name, age: `· ${x.away.age}`, pron: x.away.pron, where: `Lives elsewhere: ${x.away.where}`, att: false });
  // Opened: their history and their people.
  await page.click(`#phead-${x.away.id}`);
  const facts = await page.evaluate(id => Object.fromEntries([...document.querySelectorAll(`.pcard[data-npc="${id}"] .pcard-facts dd`)].map(d => [d.dataset.fact, d.textContent])), x.away.id);
  assert.equal(facts.history, x.away.history);
  assert.equal(facts.lives, x.away.where);
  assert.ok(facts.ties && facts.ties.length > 0, JSON.stringify(facts));
});

s.test('the player has only what they carry: "I stab X" with no knife tells the narrator and the bookkeeper NOT CARRIED, the turn runs bare-handed with no extra call and the debug entry names the knife; CARRYING (with the money) follows PLAYER every turn; with a knife in hand there is no NOT CARRIED and the knife is the item used', async h => {
  const page = await h.open({ viewport: LAPTOP });
  // The owner: "I stabbed someone successfully but I didn't have a knife in my inventory."
  const bgIndex = await page.evaluate(() => Game.data.BACKGROUNDS.findIndex(b => !(b.items || []).some(i => Game.Pipeline.carriedAs(i.name, 'knife'))));
  assert.ok(bgIndex >= 0, 'a background with no knife');
  await quickStart(page, { bgIndex });
  const who = await page.evaluate(() => {
    const here = Game.State.npcsAt(Game.state.player.locationId);
    const n = here[0] || Game.state.npcs.find(x => Game.presenceOf(x) === 'here');
    return n.name.split(' ')[0];
  });
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.Pipeline.forceNextRoll(15); });
  await sendText(page, `I stab ${who}`);
  const narr = await lastPacket(page, 'narrate');
  const book = await lastPacket(page, 'bookkeep');
  const lines = narr.split('\n');
  const at = lines.findIndex(l => /^PLAYER: /.test(l));
  assert.match(lines[at + 1], /^CARRYING: .+; .+ \(nothing else: no weapon, tool, phone, keys, car or money beyond this\)\.$/, 'CARRYING right after PLAYER');
  assert.doesNotMatch(lines[at + 1], /knife/i);
  assert.ok(lines.includes('NOT CARRIED: a knife. The player has no knife and nothing like one; they cannot stab or cut anyone. Narrate what they can do without it (bare hands, bluff, or realising they have nothing), and nothing happens that needs it.'), narr);
  assert.match(book, /NOT CARRIED: a knife\. The player has no knife and nothing like one; they cannot stab or cut anyone\./);
  assert.match(book, /Record no use of it/);
  let r = await page.evaluate(() => {
    const t = Game.Pipeline.lastTurn;
    const d = Game.State.debugLog.filter(e => e.path === 'missingItem');
    return { calls: Game.Api.Mock.calls.map(c => c.method), action: t.action, mods: t.roll ? t.roll.modifiers.map(m => m.label) : null, missing: t.ctx.missing, debug: d[d.length - 1], turn: Game.state.meta.turn, log: Game.state.log.length };
  });
  assert.deepEqual(r.calls, ['parse', 'narrate', 'bookkeep'], 'not refused, and no extra call');
  assert.equal(r.turn, 1);
  assert.equal(r.action.actionType, 'attack');
  assert.equal(r.action.missingItem, 'knife');
  assert.equal(r.action.usesItemId, null);
  assert.ok(r.mods && !r.mods.includes('item'), 'the roll is bare-handed: no item bonus');
  assert.deepEqual(r.missing, { name: 'knife' });
  assert.equal(r.debug.item, 'knife');
  assert.equal(r.debug.turn, 1);
  // A turn with nothing missing still says what the player carries, and no NOT CARRIED.
  await page.evaluate(() => { Game.Api.Mock.clear(); Game.State.apply({ lastRollKey: null }); });
  await sendText(page, 'I look around');
  assert.match(await lastPacket(page, 'narrate'), /^CARRYING: /m);
  assert.doesNotMatch(await lastPacket(page, 'narrate'), /NOT CARRIED/);
  // With a knife picked up, the same stab uses it.
  await page.evaluate(() => {
    const here = Game.state.player.locationId;
    Game.State.apply({ addItems: [{ locationId: here, item: { id: 'item_kitchen_knife', name: 'Kitchen knife', qty: 1 } }] });
    Game.State.apply({ itemsGained: ['item_kitchen_knife'], lastRollKey: null });
    Game.Api.Mock.clear();
    Game.Pipeline.forceNextRoll(15);
  });
  await sendText(page, `I stab ${who}`);
  const narr2 = await lastPacket(page, 'narrate');
  assert.doesNotMatch(narr2, /NOT CARRIED/);
  assert.doesNotMatch(await lastPacket(page, 'bookkeep'), /NOT CARRIED/);
  assert.match(narr2, /^CARRYING: .*Kitchen knife/m);
  r = await page.evaluate(() => { const t = Game.Pipeline.lastTurn; return { action: t.action, mods: t.roll.modifiers.map(m => m.label), missing: t.ctx.missing || null }; });
  assert.equal(r.action.usesItemId, 'item_kitchen_knife');
  assert.equal(r.action.missingItem, null);
  assert.equal(r.missing, null);
  assert.ok(r.mods.includes('item'), 'the knife counts in the roll');
  // The parser hears the rule; carriedAs knows a knife from a socket set.
  assert.match(await lastPacket(page, 'parse'), /INVENTORY: .*item_kitchen_knife/);
  const names = await page.evaluate(() => ['Folding knife', 'Socket set', 'Car keys', 'Thumb drive', 'Hunting rifle'].map(n => ['knife', 'gun', 'car'].filter(k => Game.Pipeline.carriedAs(n, k))));
  assert.deepEqual(names, [['knife'], [], ['car'], [], ['gun']]);
});


/* The narrator knows what everyone wants (docs/BUILD_PLAN.md, direction change 10). */
const bareText = t => String(t).replace(/[.]+$/, '');
/* Each present person's own stretch of the PRESENT line, by where their name starts. */
const ownLines = (present, people) => {
  const starts = people.map(n => ({ n, i: present.indexOf(n.name + ' (') })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i);
  return starts.map(({ n, i }, k) => ({ n, line: present.slice(i, k + 1 < starts.length ? starts[k + 1].i : undefined) }));
};

s.test('the people here carry what they want, their traits and a guarded secret under one WANTS AND SECRETS rule right before PRESENT; nobody else\'s goal or secret reaches any packet (a destination, the cached blocks, the parser, the bookkeeper); nobody here, no rule', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const sc = await findScene(page, { min: 2 });
  assert.ok(sc, 'a place with two people');
  await place(page, sc.loc.id, sc.phase);
  await page.evaluate(() => Game.Api.Mock.clear());
  await sendText(page, `I ask ${sc.npcs[0].name} about the river`);
  const r = await page.evaluate(() => {
    const G = Game;
    const text = m => G.Api.Mock.calls.filter(c => c.method === m).map(c => c.text).join('\n');
    return {
      here: G.Pipeline.lastTurn.ctx.presentIds,
      people: G.state.npcs.map(n => ({ id: n.id, name: n.name, goal: n.goal, secret: n.secret, traits: n.personality || [] })),
      narr: text('narrate'), parse: text('parse'), book: text('bookkeep'), cast: G.Pipeline.castBlock(), town: G.Pipeline.townBlock()
    };
  });
  const lines = r.narr.split('\n');
  const at = lines.findIndex(l => l.startsWith('PRESENT:'));
  assert.equal(lines.filter(l => l.startsWith('WANTS AND SECRETS:')).length, 1, 'one rule for everyone');
  const rule = lines[at - 1];
  assert.ok(rule.startsWith('WANTS AND SECRETS: '), 'the rule sits right before PRESENT: ' + rule);
  assert.match(rule, /Their secret is never told or hinted at in the narration/);
  assert.match(rule, /it only decides what they avoid, lie about or bristle at/);
  assert.match(rule, /only when the player has earned it, caught them out or found proof/);
  assert.match(rule, /Nobody else present knows someone's secret unless their own line says so/);
  const here = r.people.filter(n => r.here.includes(n.id));
  assert.ok(here.length >= 2);
  const own = ownLines(lines[at], here);
  assert.equal(own.length, here.length, 'everyone here has a line');
  for (const { n, line } of own) {
    assert.ok(line.includes(`; traits: ${n.traits.join(', ')}; `), 'traits: ' + line);
    assert.ok(line.includes(`; wants: ${bareText(n.goal)}; secret: ${bareText(n.secret)}`), 'wants, then the secret: ' + line);
    assert.equal(r.narr.split(bareText(n.secret)).length - 1, 1, 'the secret once, in its own line: ' + n.id);
    assert.equal(r.narr.split(bareText(n.goal)).length - 1, 1, 'the goal once, in its own line: ' + n.id);
  }
  // Nobody else's goal or secret anywhere; the parser, the bookkeeper and the cached blocks carry nobody's.
  const where = [['narrator', r.narr], ['parser', r.parse], ['bookkeeper', r.book], ['cast block', r.cast], ['town block', r.town]];
  for (const n of r.people) {
    for (const t of [n.goal, n.secret].filter(Boolean)) {
      for (const [w, text] of where) {
        if (w === 'narrator' && r.here.includes(n.id)) continue;
        assert.ok(!text.includes(bareText(t)), `${n.id}'s ${t === n.goal ? 'goal' : 'secret'} in the ${w} packet`);
      }
    }
  }
  // A walk: the people at the destination are a brief line, with no traits, wants or secret.
  const go = await page.evaluate(() => {
    const G = Game;
    const open = l => l && !l.closed && l.away !== true && l.discovered !== false;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      for (const l of G.state.locations.filter(open)) {
        const here = G.State.npcsAt(l.id, ph);
        for (const d of l.exits.map(id => G.State.loc(id)).filter(open)) {
          const there = G.State.npcsAt(d.id, ph);
          if (here.length && there.length && !there.some(n => here.includes(n))) return { from: l.id, ph, name: d.name, people: there.map(n => ({ id: n.id, name: n.name, goal: n.goal, secret: n.secret })) };
        }
      }
    }
    return null;
  });
  assert.ok(go, 'a walk between two places with people in both');
  await place(page, go.from, go.ph);
  await page.evaluate(() => Game.Api.Mock.clear());
  await sendText(page, `I walk to ${go.name}`);
  const p = await lastPacket(page);
  const dest = p.split('\n').find(l => l.startsWith('DESTINATION:')) || '';
  assert.ok(go.people.every(n => dest.includes(n.name + ' (')), 'the people there are listed: ' + dest);
  assert.doesNotMatch(dest, /; (traits|wants|secret): /, 'a brief line');
  for (const n of go.people) for (const t of [n.goal, n.secret]) assert.ok(!p.includes(bareText(t)), 'nothing hidden about someone at the destination: ' + n.id);
  // Nobody here: no rule, and PRESENT says nobody.
  const empty = await page.evaluate(() => {
    const G = Game;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      for (const l of G.state.locations) if (l.away !== true && l.discovered !== false && !G.State.npcsAt(l.id, ph).length) return { id: l.id, ph };
    }
    return null;
  });
  assert.ok(empty, 'somewhere with nobody');
  await place(page, empty.id, empty.ph);
  const lonely = (await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }))).split('\n');
  assert.ok(lonely.includes('PRESENT: nobody.'));
  assert.ok(!lonely.some(l => l.startsWith('WANTS AND SECRETS:')), 'no rule with nobody to apply it to');
});

s.test('the player\'s hooks follow CARRYING: WHY THEY CAME (the goal), FLAW (never acted on for them) and THREADS, the open threads the player knows (the loose ends name their person); a thread they do not know, or one that has closed, is left out; no goal or flaw, no line', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'enemy', 'secret'] });
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const lines = () => G.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n');
    const out = { goal: st.player.goal, flaw: st.player.flaw, name: st.player.name, ends: st.player.looseEnds.map(le => ({ title: G.State.thread(le.threadId).title, summary: G.State.thread(le.threadId).summary, npc: G.State.npc(le.npcId).name, threadId: le.threadId })) };
    out.first = lines();
    const town = st.threads.find(t => !t.knownToPlayer && t.status === 'open');
    out.town = { id: town.id, title: town.title, summary: town.summary };
    G.State.apply({ threadUpdates: [{ threadId: town.id, knownToPlayer: true }, { threadId: out.ends[0].threadId, status: 'resolved' }] });
    out.second = lines();
    st.player.goal = '';
    st.player.flaw = '';
    out.bare = lines();
    return out;
  });
  const i = r.first.findIndex(l => l.startsWith('CARRYING:'));
  assert.ok(r.first[i - 1].startsWith('PLAYER: '), 'CARRYING follows PLAYER');
  assert.equal(r.first[i + 1], `WHY THEY CAME: ${bareText(r.goal)}.`);
  assert.equal(r.first[i + 2], `FLAW: ${bareText(r.flaw)}. It colours what tempts or needles ${r.name}; the narration never acts, speaks or decides on it for them.`);
  const threads = r.first[i + 3];
  assert.ok(threads.startsWith('THREADS (what the player is caught up in): '), threads);
  for (const e of r.ends) assert.ok(threads.includes(`${e.title}: ${e.summary}`) && threads.includes(e.npc), 'a loose end and its person: ' + e.title);
  assert.equal(threads.split(' | ').length, r.ends.length, 'only the threads the player knows');
  assert.ok(!threads.includes(r.town.summary.slice(0, 40)), 'a thread the player does not know is left out');
  assert.ok(r.first[i + 4].startsWith('WANTS AND SECRETS:') || r.first[i + 4].startsWith('PRESENT:'), 'then the people here');
  // Known now: it comes in. Resolved: the loose end goes.
  const t2 = r.second.find(l => l.startsWith('THREADS'));
  assert.ok(t2.includes(`${r.town.title}: ${r.town.summary.slice(0, 60)}`), t2);
  assert.ok(!t2.includes(r.ends[0].summary), 'a closed thread is left out');
  assert.ok(t2.includes(r.ends[1].summary));
  // No goal and no flaw (a bare or older game): no lines for them.
  assert.ok(!r.bare.some(l => /^(WHY THEY CAME|FLAW):/.test(l)));
  assert.ok(r.bare.some(l => l.startsWith('THREADS')));
});

s.test('a loose end\'s person knows from day 1: the creditor remembers the debt in the bookkeeper\'s own form (weight 3; the line for the option kept, the kind\'s line for words the player wrote), it is in their line in PRESENT and on their People card, and the memory rewrite leaves it alone', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const D = await page.evaluate(() => Game.data.LOOSE_ENDS);
  // Every kind, every option: under twelve words, the option's own line, the kind's line for free words; all recognised as the loose end's.
  const lines = await page.evaluate(() => {
    const T = Game.Town;
    return Object.keys(Game.data.LOOSE_ENDS).map(k => ({ k, opts: Game.data.LOOSE_ENDS[k].options.map(o => T.looseEndMemory(k, o, 'Tester')), free: T.looseEndMemory(k, 'Something I wrote myself.', 'Tester') }));
  });
  for (const x of lines) {
    assert.deepEqual(x.opts, D[x.k].memory.options, x.k + ': one line per option');
    assert.equal(x.free, D[x.k].memory.text, x.k + ': words the player wrote get the kind\'s line');
    for (const t of x.opts.concat(x.free)) {
      assert.ok(t.split(/\s+/).length < 12 && !/[.]$/.test(t) && !/Tester|Loose end/.test(t), 'the bookkeeper\'s form: ' + t);
      assert.equal(await page.evaluate(t => Game.Town.isLooseEndMemory(t), t), true);
    }
  }
  assert.equal(await page.evaluate(() => Game.Town.isLooseEndMemory('flirted with me')), false);
  // A new game: the creditor holds it on day 1, weight 3, and no "Loose end with" line.
  await quickStart(page, { kinds: ['debt', 'enemy'] });
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const c = await page.evaluate(() => {
    const G = Game;
    const le = G.state.player.looseEnds.find(x => x.kind === 'debt');
    const n = G.State.npc(le.npcId);
    let at = null;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) { const l = G.state.locations.find(x => x.away !== true && !x.closed && G.State.npcsAt(x.id, ph).some(m => m.id === n.id)); if (l) { at = { id: l.id, ph }; break; } }
    return { id: n.id, name: n.name, memories: n.memories, at, everyone: G.state.npcs.flatMap(x => x.memories.map(m => m.text)) };
  });
  assert.deepEqual(c.memories, [{ turn: 0, text: D.debt.memory.options[0], weight: 3 }]);
  assert.ok(!c.everyone.some(t => /^Loose end with /.test(t)), 'the old form is gone');
  await place(page, c.at.id, c.at.ph);
  const present = (await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }))).split('\n').find(l => l.startsWith('PRESENT:'));
  const own = ownLines(present, [{ name: c.name }])[0];
  assert.ok(own && own.line.includes(`; remembers: ${D.debt.memory.options[0]})`), 'the creditor knows about the debt: ' + (own && own.line));
  await page.evaluate(id => { Game.UI.openPanel('people'); Game.UI.togglePerson(id); }, c.id);
  assert.ok((await page.textContent(`#panel-body [data-npc="${c.id}"]`)).includes(D.debt.memory.options[0]), 'and the People card shows it');
  // A turn later it is still there, and the memory rewrite (Settings: re-read this game) does not touch it.
  await sendText(page, 'I look around');
  const r = await page.evaluate(async () => {
    const ends = () => Game.state.player.looseEnds.map(le => JSON.stringify(Game.State.npc(le.npcId).memories));
    const before = ends();
    const res = await Game.App.updateGame();
    return { before, after: ends(), ok: !!res };
  });
  assert.ok(r.ok);
  assert.deepEqual(r.after, r.before, 'the re-read leaves the loose ends\' lines as they were');
  assert.deepEqual(await page.evaluate(id => Game.State.npc(id).memories, c.id), [{ turn: 0, text: D.debt.memory.options[0], weight: 3 }]);
});

s.test('THIS SCENE holds every turn since the player came to this place, oldest first, and none from before; a fresh arrival also gets BEFORE THIS SCENE (the three turns before it); log entries carry where they were narrated and when the scene began', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const rt = await route(page);
  const packet = () => page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n'));
  const label = name => `THIS SCENE (since the player came to ${the(name)}): `;
  // The arrival: the scene is empty and nothing came before.
  let p = await packet();
  assert.ok(p.some(l => l.startsWith(label(rt.here.name))), 'the label names the place');
  for (const t of ['I hum verse one', 'I hum verse two', 'I hum verse three']) await sendText(page, t);
  p = await packet();
  let scene = p.find(l => l.startsWith('THIS SCENE'));
  const opening = await page.evaluate(() => Game.state.log[0].narration.replace(/\s+/g, ' ').slice(0, 60));
  assert.ok(scene.startsWith(label(rt.here.name)), scene);
  const order = ['', '> I hum verse one ', '> I hum verse two ', '> I hum verse three '].map(x => (x ? scene.indexOf(x) : scene.indexOf(opening)));
  assert.ok(order.every(i => i >= 0) && order.every((x, i) => !i || x > order[i - 1]), 'the arrival and three turns, oldest first: ' + scene);
  assert.ok(!p.some(l => l.startsWith('BEFORE THIS SCENE:')), 'four turns here: nothing before');
  assert.ok(!p.some(l => l.startsWith('LAST 3 TURNS')));
  // Walk on: the walk is the first turn of the new scene, and the three before it come along.
  await sendText(page, `I walk to ${rt.a.name}`);
  p = await packet();
  scene = p.find(l => l.startsWith('THIS SCENE'));
  assert.ok(scene.startsWith(`${label(rt.a.name)}> I walk to ${rt.a.name} `), scene);
  assert.ok(!scene.includes('I hum verse'), 'turns from before are not in this scene');
  const before = p.find(l => l.startsWith('BEFORE THIS SCENE: '));
  assert.ok(before, 'a fresh arrival keeps the turns before it');
  assert.equal(before, `BEFORE THIS SCENE: ${['one', 'two', 'three'].map(w => before.slice(before.indexOf(`> I hum verse ${w} `)).split(' | ')[0]).join(' | ')}`, 'the three turns before, oldest first');
  assert.ok(!before.includes(opening), 'only three');
  assert.ok(p.indexOf(before) === p.findIndex(l => l.startsWith('STORY SO FAR:')) + 1 && p.indexOf(scene) === p.indexOf(before) + 1, 'STORY SO FAR, BEFORE THIS SCENE, THIS SCENE');
  for (const t of ['I lean on the wall alpha', 'I lean on the wall beta']) await sendText(page, t);
  p = await packet();
  scene = p.find(l => l.startsWith('THIS SCENE'));
  assert.equal(scene.split(' | ').length, 3);
  assert.ok(scene.includes('> I lean on the wall alpha ') && scene.indexOf('beta') > scene.indexOf('alpha'));
  assert.ok(!p.some(l => l.startsWith('BEFORE THIS SCENE:')), 'three turns here: nothing before');
  // The log: each entry where it was narrated, and the turn its scene began.
  const log = await page.evaluate(() => Game.state.log.map(e => [e.turn, e.locationId, e.sceneFrom]));
  assert.deepEqual(log, [[0, rt.here.id, 0], [1, rt.here.id, 0], [2, rt.here.id, 0], [3, rt.here.id, 0], [4, rt.a.id, 4], [5, rt.a.id, 4], [6, rt.a.id, 4]]);
});

s.test('THIS SCENE is capped (12 turns, about 700 words, the oldest left out, and it says so); a scene that began before the chronicle says its start is in STORY SO FAR; an older save\'s log with no places counts as the turns before this scene, and plays on', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  const r = await page.evaluate(() => {
    const G = Game;
    const S = G.State;
    const scene = () => G.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n').find(l => l.startsWith('THIS SCENE'));
    const words = t => t.trim().split(/\s+/).length;
    const add = (n, text) => { for (let i = 1; i <= n; i++) { S.apply({ beginTurn: true }); S.apply({ logEntry: { input: `step ${i}`, roll: null, narration: text(i) } }); } };
    const out = {};
    // Fourteen short turns: the twelve newest.
    add(14, i => `Short narration number ${i} here.`);
    let sc = scene();
    out.short = { n: sc.split(' | ').length, note: sc.includes('(earlier turns of this scene are left out to keep this short) '), first: sc.includes('> step 1 ') || sc.includes('> step 2 '), last: sc.includes('> step 14 ') };
    // Long turns: about 700 words at most, the newest kept.
    add(9, i => `Long ${i} ` + Array(118).fill('word').join(' ') + '.');
    sc = scene();
    const body = sc.slice(sc.indexOf('): ') + 3);
    out.long = { words: words(body), n: body.split(' | ').length, note: sc.includes('left out'), newest: body.includes('Long 9 ') };
    // The chronicle takes the oldest of this scene's turns away: what is left says the start is in STORY SO FAR.
    const log = G.state.log;
    S.apply({ chronicleEntry: { fromTurn: log[0].turn, toTurn: log[log.length - 3].turn, summary: 'They waited a long time.' } });
    sc = scene();
    out.chron = { n: G.state.log.length, note: sc.includes(': (earlier turns of this scene are in STORY SO FAR) > step 8 '), sceneFrom: G.state.log.map(e => e.sceneFrom) };
    // An older save: no places in the log. It loads; the last three entries come in as BEFORE THIS SCENE.
    const env = G.Storage.envelope('old');
    for (const e of env.state.log) { delete e.locationId; delete e.sceneFrom; }
    env.state.log = env.state.log.concat([1, 2, 3].map(i => ({ turn: G.state.meta.turn, day: 1, phase: G.state.time.phase, input: `old ${i}`, roll: null, narration: `Old narration ${i}.` })));
    out.entered = G.App.enter(G.Storage.parseEnvelope(JSON.stringify(env)));
    const p = G.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n');
    out.old = { scene: p.find(l => l.startsWith('THIS SCENE')), before: p.find(l => l.startsWith('BEFORE THIS SCENE')) };
    return out;
  });
  assert.deepEqual(r.short, { n: 12, note: true, first: false, last: true });
  assert.ok(r.long.words <= 700 && r.long.n >= 5 && r.long.note && r.long.newest, JSON.stringify(r.long));
  assert.deepEqual(r.chron.n, 2);
  assert.ok(r.chron.note, 'the scene began before the chronicle');
  assert.ok(r.chron.sceneFrom.every(x => x === 0), 'the scene began at the arrival');
  assert.ok(r.entered);
  assert.equal(r.old.scene, `THIS SCENE (since the player came to ${the(await page.evaluate(() => Game.State.loc(Game.state.player.locationId).name))}): nothing yet; the player has just got here`);
  assert.equal(r.old.before, 'BEFORE THIS SCENE: > old 1 Old narration 1. | > old 2 Old narration 2. | > old 3 Old narration 3.');
  // It plays on: the new turn is this scene, the old ones still come in before it.
  await sendText(page, 'I hum a tune');
  const p = (await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'x' } }))).split('\n');
  assert.ok(p.find(l => l.startsWith('THIS SCENE')).includes(': > I hum a tune '));
  assert.equal(p.find(l => l.startsWith('BEFORE THIS SCENE')), 'BEFORE THIS SCENE: > old 1 Old narration 1. | > old 2 Old narration 2. | > old 3 Old narration 3.');
  const e = await page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
  assert.equal(e.locationId, await page.evaluate(() => Game.state.player.locationId));
  assert.equal(e.sceneFrom, e.turn);
});

s.run();
