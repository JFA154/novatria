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
      roll: document.querySelector('#feed .f-roll').textContent, bg: Game.data.BACKGROUNDS[0].name
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
  for (const label of ['DAY 1, MORNING · Location', 'PLAYER', 'PRESENT', 'ACTION', 'ROLL', 'COMPLICATION', 'DUE EVENT', 'STORY SO FAR', 'LAST 3 TURNS', 'MODE']) assert.ok(lines.includes(label), 'packet line ' + label);
  assert.ok(packet.includes(`PLAYER: Tester (${r.bg.toLowerCase()}). Reputation: unknown. Conditions: none.`));
  assert.match(packet, /\nMODE: normal\nLENGTH: 2 to 4 sentences, under 90 words\. Stop at the first moment the player must respond\. Not everyone and everything listed needs a mention\.\nVARIETY: [^\n]+$/, 'MODE, then the LENGTH line last');
  const hidden = await page.evaluate(() => [].concat(Game.state.npcs.map(n => n.secret), Game.state.npcs.map(n => n.goal), Game.state.seeds.map(sd => sd.effect)).filter(Boolean));
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

s.test('someone who is not in the town data (a barmaid) is created from the tables, joins People and survives a reload', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const fx = await fixtures(page);
  await place(page, fx.tavern.id, 'evening');
  // Words the mock knows as people, that nobody in this town answers to yet.
  const [role1, role2] = await page.evaluate(() => ['barmaid', 'bartender', 'waitress', 'serving girl', 'stable boy', 'clerk', 'mechanic', 'deputy']
    .filter(w => !Game.state.npcs.some(n => Game.Town.mentions(' ' + w + ' ', n))));
  assert.ok(role1 && role2, 'two unused roles');
  const before = await counts(page);
  await sendText(page, `I ask the ${role1} for a drink`);
  const made = await page.evaluate(locId => {
    const st = Game.state;
    const townIds = Game.data.TOWN_DATA.npcs.map(n => n.id).concat(st.player.looseEnds.map(le => le.npcId));
    const l = Game.State.loc(locId);
    return st.npcs.filter(n => !townIds.includes(n.id)).map(n => ({ id: n.id, name: n.name, role: n.role, known: n.knownToPlayer, voice: n.voice, traits: n.personality, everywhere: Object.values(l.npcIdsBySchedule).every(a => a.includes(n.id)), tableName: Game.data.TABLES.npc.firstNames.includes(n.name.split(' ')[0]) }));
  }, fx.tavern.id);
  assert.equal(made.length, 1);
  const b = made[0];
  assert.equal(b.role, role1);
  assert.ok(b.known, 'known to the player');
  assert.ok(b.tableName, 'name rolled from the tables');
  assert.ok(b.voice && b.traits.length === 2);
  assert.ok(b.everywhere, 'works at the tavern');
  assert.equal((await counts(page)).npcs, before.npcs + 1);
  assert.ok((await lastPacket(page)).includes(`NEW IN THE SCENE: ${b.name} (${role1}, new to the scene)`));
  await page.click('#tab-people');
  assert.ok((await page.innerText('#panel-body')).includes(b.name), 'listed in People');
  // Asking again reuses them.
  await sendText(page, `I ask the ${role1} for another drink`);
  assert.equal((await counts(page)).npcs, before.npcs + 1, 'nobody new');
  assert.ok((await page.evaluate(() => Game.Pipeline.lastTurn.action.targets)).includes(b.id));
  // Someone else is a different person.
  await sendText(page, `I wave the ${role2} over`);
  assert.equal((await counts(page)).npcs, before.npcs + 2);
  // Reload and continue: still there.
  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.ok(await page.evaluate(([id, loc]) => !!Game.State.npc(id) && Game.State.npcsAt(loc).some(n => n.id === id), [b.id, fx.tavern.id]));
  await page.click('#tab-people');
  assert.ok((await page.innerText('#panel-body')).includes(b.name), 'still in People after reload');
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
  assert.equal(await lastNotice(page), 'You just tried that and it failed. Change something first: a different approach, something to use or offer, another place, or let time pass (/wait or /rest).');
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
  assert.ok(packet.startsWith(`DAY 1, NIGHT · Location: ${t1.name}`));
  assert.equal(r.last.phase, 'night');
  assert.ok(r.last.narration.includes(`You arrive at ${the(t1.name)}`));
  assert.equal(r.divider, 'Day 1 · Night');
  // A goal the game cannot place is refused with a hint, and the text kept.
  await sendText(page, '/skip somewhere nice');
  assert.match(await lastNotice(page), /Try \/skip to the docks at night/);
  assert.equal(await page.inputValue('#cmd'), '/skip somewhere nice');
  await page.fill('#cmd', '');
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
  await sendText(page, '/fact my cousin lives here');
  assert.deepEqual(await calls(page), ['parse'], 'parser only');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls[0].mode), 'fact');
  const cousin = await page.evaluate(() => Game.state.npcs.find(n => /cousin/.test(n.role)));
  assert.ok(cousin, 'a cousin exists');
  assert.equal(cousin.role, "Tester's cousin");
  assert.ok(cousin.knownToPlayer);
  assert.ok(cousin.memories.some(m => m.weight === 3 && m.text === "Fact (a story point): Tester's cousin lives here"));
  assert.equal((await counts(page)).npcs, before.npcs + 1);
  const st = await page.evaluate(() => ({ sp: Game.state.player.storyPoints, journal: Game.state.journal.map(j => j.text), last: Game.state.log[Game.state.log.length - 1] }));
  assert.equal(st.sp, 1);
  assert.ok(st.journal.includes('Fact: my cousin lives here'));
  assert.equal(st.last.input, '/fact my cousin lives here');
  assert.match(await lastNotice(page), /^Story point spent \(1 left\)\. It is now true: my cousin lives here/);
  // Now the cousin is real: mentioning them is not a claim any more.
  await sendText(page, 'I talk to my cousin');
  assert.ok((await page.evaluate(() => Game.Pipeline.lastTurn.action.targets)).includes(cousin.id));
  assert.doesNotMatch(await lastPacket(page), /NOT PRESENT/);
  // Something impossible costs nothing.
  await sendText(page, '/fact a dragon sleeps under the bridge');
  assert.equal(await lastNotice(page), `That cannot be true in ${fx.town}. No story point was spent.`);
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 1);
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
  assert.equal(await page.evaluate(() => Game.state.player.storyPoints), 0);
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
  assert.equal(await lastNotice(page), 'You just tried that and it failed. Change something first: a different approach, something to use or offer, another place, or let time pass (/wait or /rest).');
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
  assert.match(parse, new RegExp(`targets must include ${a.id}\\. destinationId must be null\\. A new:<description> target is allowed only for a person mentioned in the words who is not in the lists\\.`));
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
  // The narrator's LAST 3 TURNS marks it as speech too.
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

s.run();
