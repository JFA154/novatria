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
  assert.match(packet, /\nMODE: normal$/);
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
  assert.equal(await lastNotice(page), 'You just tried that and it failed. Something has to change before you try it again.');
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
  assert.match(packet, /\nMODE: ZOOM$/);
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
  assert.match(z.c[1].text, /\nMODE: ZOOM$/);
  assert.equal(z.last.input, '/zoom I kick the door off its last hinge');
  assert.equal(z.last.narration, long);
  await page.evaluate(t => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', t); }, long);
  await sendText(page, 'I kick the door again');
  assert.deepEqual(await calls(page), ['parse', 'narrate', 'narrate', 'bookkeep'], 'over 90 words regenerates once');
  assert.match(await lastPacket(page), /STYLE CHECK FAILED on your last attempt: 120 words, limit 90/);
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
  assert.match(packet, /\nMODE: arrival \(ZOOM length allowed\)$/);
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
    G.State.apply({ addLocations: [{ id: 'loc_test_police', name: 'Police Station', type: 'police', description: 'A test station.', exits: [G.state.player.locationId] }] });
    G.State.apply({ effects: [{ op: 'npcStatus', npcId: n.id, status: 'arrested' }] });
    return Object.values(G.State.loc('loc_test_police').npcIdsBySchedule).every(a => a.includes(n.id));
  });
  assert.ok(arrested, 'arrested NPCs go to the police station');
});

s.run();
