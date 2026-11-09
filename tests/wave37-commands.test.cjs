'use strict';
/* Wave 37, Creator Mode, milestone 4 (task M4-D): the commands a story
   offers, the parser prompt a story's rules write, and the Play choices in
   Settings as the player's own for one story.
   - Owner decision 5: a pack can hide /undo and the cheats; the player can
     override per pack ("Allow cheats anyway"); developer mode always shows
     everything; a hidden command typed answers "Not in this story." and
     runs nothing. Commands.LIST stays the full list; Commands.available()
     is what the / list, /help and the ⋯ list show.
   - Plan decision F: Api.systemFor('parser') takes the DIFFICULTY numbers
     from rules.dcs and the stat names from player.stats; the defaults are
     the v36 snapshot's parser prompt byte for byte. A story with
     scopeRefusal on (the rails preset) adds the SCOPE sentence.
   - Plan decision D: Permadeath, Show dice rolls and the Narration style
     write this story's override (and the first two the global setting
     too); the note after each names the layer its value comes from.
   - Task M4-E: the card table honours the cheats gate (no Win (cheat)
     button, /cheat win typed with a hand open answers "Not in this
     story."), and World.chiefOf reads world.law.headNpcId first.
   Run with: node tests/run.cjs wave37-commands */
const assert = require('assert/strict');
const { suite, quickStart, sendText, stateJson, presetCards } = require('./helpers.cjs');

const s = suite('wave37-commands');
const FIXTURE = require('./fixtures/prompts-v36.json');
const SCOPE = ' SCOPE: this story stays within its own setting and places; an action that leaves it (travel elsewhere, things or people the setting cannot have) is new:<description> so the engine can refuse it.';

/* The built-in pack, copied, with these rules (and freedom) as the preview:
   its meta.id stays low-water, so the player's low-water overrides apply. */
function preview(page, rules, freedom) {
  return page.evaluate(([r, f]) => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    if (r) c.rules = r;
    if (f) c.freedom = f;
    P.setPreview(c);
  }, [rules || null, freedom || null]);
}
async function start(page) {
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, { kinds: [] });
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
}
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
// The commands the / list shows for "/" typed in the box, read from the list itself.
async function slashList(page) {
  await page.fill('#cmd', '/');
  await page.waitForSelector('#ac:not([hidden])');
  const names = await page.$$eval('#ac li', li => li.map(x => x.dataset.cmd));
  await page.fill('#cmd', '');
  return names;
}
// The ⋯ list's items (data-act), opened and closed again.
async function actionIds(page) {
  await page.click('#act-btn');
  await page.waitForSelector('#act-pop [data-act]');
  const ids = await page.$$eval('#act-pop [data-act]', b => b.map(x => x.dataset.act));
  await page.keyboard.press('Escape');
  return ids;
}

s.test('the parser prompt: by default Api.systemFor(\'parser\') is the v36 snapshot\'s, byte for byte; rules.dcs.hard 17 changes only that number; a stat labelled Brawn names it after the key; the rails preset adds the SCOPE sentence; setPreview(null) puts it back', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const A = Game.Api, P = Game.Pack;
    const out = { def: A.systemFor('parser'), sys: A.SYSTEM.parser };
    const c = P.copy(P.builtIn());
    c.rules = { dcs: { hard: 17 } };
    P.setPreview(c);
    out.hard = A.systemFor('parser');
    out.sysStill = A.SYSTEM.parser;
    const c2 = P.copy(P.builtIn());
    c2.player.stats.might.label = 'Brawn';
    P.setPreview(c2);
    out.brawn = A.systemFor('parser');
    const c3 = P.copy(P.builtIn());
    c3.freedom = { preset: 'rails' };
    P.setPreview(c3);
    out.rails = A.systemFor('parser');
    out.railsOn = P.freedom().scopeRefusal.on;
    P.setPreview(null);
    out.after = A.systemFor('parser');
    return out;
  });
  assert.equal(r.def, FIXTURE.parser, 'the default is the snapshot\'s parser prompt, whole string');
  assert.equal(r.sys, FIXTURE.parser);
  assert.equal(r.hard, FIXTURE.parser.replace('hard (15)', 'hard (17)'));
  assert.notEqual(r.hard, FIXTURE.parser);
  assert.match(r.hard, /very_hard \(18\)/, 'very_hard keeps its own number');
  assert.equal(r.sysStill, FIXTURE.parser, 'SYSTEM.parser itself is never changed');
  assert.equal(r.brawn, FIXTURE.parser.replace('STAT: might for force', 'STAT: might (this story calls it Brawn) for force'));
  assert.equal(r.railsOn, true);
  assert.equal(r.rails, FIXTURE.parser + SCOPE);
  assert.equal(r.after, FIXTURE.parser);
});

s.test('rules.cheats.allowed false: /cheat success and /reroll answer "Not in this story." and change nothing; the / list and /help leave them out; /undo and its link stay; the player\'s override restores /cheat', async h => {
  const page = await h.open();
  await preview(page, { cheats: { allowed: false } });
  await start(page);
  await sendText(page, 'I look around');
  const before = await stateJson(page);
  await sendText(page, '/cheat success');
  assert.equal(await lastNotice(page), 'Not in this story.');
  const r = await page.evaluate(async () => {
    const C = Game.Commands;
    const reroll = await C.run('/reroll');
    return { reroll, notice: [...document.querySelectorAll('#feed .f-notice')].pop().textContent, allowed: ['/cheat', '/reroll', '/undo', '/debug', '/fact'].map(n => C.allowed(n)), full: C.LIST.length, available: C.available().map(c => c.name), help: C.helpText() };
  });
  assert.equal(await stateJson(page), before, 'nothing changed');
  assert.deepEqual(r.reroll, { ok: false, reason: 'hidden' });
  assert.match(r.notice, /Not in this story\./);
  assert.deepEqual(r.allowed, [false, false, true, true, true]);
  assert.ok(!r.available.includes('/cheat') && !r.available.includes('/reroll'));
  assert.equal(r.available.length, r.full - 2, 'Commands.LIST stays the full list; available() leaves out the two');
  assert.ok(!/^\/(cheat|reroll)\b/m.test(r.help), '/help leaves them out');
  assert.match(r.help, /^\/undo /m);
  const list = await slashList(page);
  assert.ok(!list.includes('/cheat') && !list.includes('/reroll'), 'the / list leaves them out: ' + list.join(' '));
  assert.ok(list.includes('/undo'));
  await page.evaluate(() => Game.Commands.run('/help'));
  assert.ok(!/\/cheat|\/reroll/.test(await lastNotice(page)), 'the /help notice leaves them out');
  assert.equal(await page.evaluate(() => document.getElementById('undo-row').hidden), false, 'the Undo link is still shown (undo is on)');
  assert.ok((await actionIds(page)).includes('undo'));
  // "Allow cheats anyway" for this story: the override restores them.
  await page.evaluate(() => Game.Storage.savePerPack('low-water', { overrides: { 'rules.cheats.allowed': true } }));
  assert.deepEqual(await page.evaluate(() => [Game.Commands.allowed('/cheat'), Game.Commands.allowed('/reroll'), Game.Pack.lookup('rules.cheats.allowed').layer]), [true, true, 'player']);
  assert.ok((await slashList(page)).includes('/cheat'));
  await sendText(page, '/cheat');
  assert.match(await lastNotice(page), /^Cheats: \/cheat success/);
});

s.test('rules.undo false: /undo, /redo and /rewind are refused and nothing is taken back; the Undo link and the ⋯ list\'s Undo are gone; the player\'s override brings them back', async h => {
  const page = await h.open();
  await preview(page, { undo: false });
  await start(page);
  await sendText(page, 'I look around');
  await page.evaluate(() => Game.UI.markUndo());
  const before = await stateJson(page);
  const r = await page.evaluate(async () => {
    const C = Game.Commands;
    const out = { depth: Game.State.undoDepth(), runs: [] };
    for (const t of ['/undo', '/redo', '/rewind 1']) out.runs.push(await C.run(t));
    out.depthAfter = Game.State.undoDepth();
    out.link = document.getElementById('undo-row').hidden;
    out.listed = C.match('/').map(c => c.name).filter(n => /^\/(undo|redo|rewind)$/.test(n));
    return out;
  });
  assert.equal(await lastNotice(page), 'Not in this story.');
  assert.equal(await stateJson(page), before, 'nothing taken back');
  assert.ok(r.depth >= 1, 'there was a turn to take back');
  assert.equal(r.depthAfter, r.depth);
  assert.deepEqual(r.runs, [{ ok: false, reason: 'hidden' }, { ok: false, reason: 'hidden' }, { ok: false, reason: 'hidden' }]);
  assert.equal(r.link, true, 'the Undo link is hidden');
  assert.deepEqual(r.listed, []);
  assert.ok(!(await actionIds(page)).includes('undo'), 'the ⋯ list has no Undo');
  await page.evaluate(() => { Game.Storage.savePerPack('low-water', { overrides: { 'rules.undo': true } }); Game.UI.markUndo(); });
  assert.equal(await page.evaluate(() => document.getElementById('undo-row').hidden), false, 'the override brings the link back');
  assert.ok((await actionIds(page)).includes('undo'));
});

s.test('developer mode shows every cheat and /undo with no override; rules.cheats.debugView false hides /debug; /fact follows factAllowed alone and leaves the ⋯ list', async h => {
  const page = await h.open();
  await preview(page, { cheats: { allowed: false, debugView: false }, undo: false, storyPoints: { factAllowed: false } });
  await start(page);
  const NAMES = ['/cheat', '/reroll', '/undo', '/redo', '/rewind', '/debug', '/fact'];
  const off = await page.evaluate(n => n.map(x => Game.Commands.allowed(x)), NAMES);
  assert.deepEqual(off, [false, false, false, false, false, false, false]);
  await sendText(page, '/debug');
  assert.equal(await lastNotice(page), 'Not in this story.');
  assert.equal(await page.evaluate(() => document.body.classList.contains('debug') || !!document.querySelector('[data-tab="debug"]:not([hidden])')), false, 'the debug view did not open');
  assert.ok(!(await actionIds(page)).includes('fact'), 'Spend a story point is not offered');
  const on = await page.evaluate(n => { Game.Storage.saveSettings({ developerMode: true }); return { allowed: n.map(x => Game.Commands.allowed(x)), overrides: Game.Storage.perPack('low-water').overrides }; }, NAMES);
  assert.deepEqual(on.allowed, [true, true, true, true, true, true, false], 'developer mode: everything but /fact, a rule of the story');
  assert.deepEqual(on.overrides, {});
  assert.ok((await slashList(page)).includes('/debug'));
  await page.evaluate(() => Game.Storage.saveSettings({ developerMode: false }));
  assert.ok(!(await slashList(page)).includes('/debug'));
});

s.test('the Settings screen: Allow cheats anyway shows only for a story that hides something and writes both overrides; Permadeath writes the global setting and the override (layer player); the style radio writes narration.preset; the notes name each layer', async h => {
  const page = await h.open();
  // Low Water as it is: no box, every value the default, no notes.
  await page.click('#btn-settings');
  await page.waitForSelector('#set-rolls', { state: 'visible' });
  const plain = await page.evaluate(() => ({
    row: document.getElementById('set-cheats-row').hidden, hint: document.getElementById('set-cheats-hint').hidden,
    notes: ['set-rolls-layer', 'set-permadeath-layer', 'set-style-layer'].map(id => document.getElementById(id).textContent),
    rolls: document.getElementById('set-rolls').checked, death: document.getElementById('set-permadeath').checked
  }));
  assert.deepEqual(plain, { row: true, hint: true, notes: ['', '', ''], rolls: true, death: false });
  await page.click('#settings-done');
  // A story that hides the cheats and the dice rolls.
  await preview(page, { cheats: { allowed: false }, showRolls: false });
  await page.click('#btn-settings');
  await page.waitForSelector('#set-cheats', { state: 'visible' });
  const hid = await page.evaluate(() => ({
    hint: document.getElementById('set-cheats-hint').textContent, kids: document.getElementById('set-cheats-hint').children.length,
    checked: document.getElementById('set-cheats').checked, note: document.getElementById('set-cheats-layer').textContent,
    rolls: document.getElementById('set-rolls').checked, rollsNote: document.getElementById('set-rolls-layer').textContent
  }));
  assert.equal(hid.hint, 'Low Water leaves out the cheats (/cheat and /reroll). Tick this to have them anyway in this story.');
  assert.equal(hid.kids, 0, 'text, never markup');
  assert.equal(hid.checked, false);
  assert.equal(hid.note, '(this story\'s setting)');
  assert.equal(hid.rolls, false, 'the story\'s own showRolls');
  assert.equal(hid.rollsNote, '(this story\'s setting)');
  await page.check('#set-cheats');
  const ticked = await page.evaluate(() => ({ o: Game.Storage.perPack('low-water').overrides, note: document.getElementById('set-cheats-layer').textContent, allowed: Game.Commands.allowed('/cheat') }));
  assert.deepEqual(ticked, { o: { 'rules.cheats.allowed': true, 'rules.undo': true }, note: '(your choice)', allowed: true });
  await page.uncheck('#set-cheats');
  assert.deepEqual(await page.evaluate(() => Game.Storage.perPack('low-water').overrides), {}, 'unticked: back to the story\'s own');
  // Permadeath: the global setting and this story's override.
  await page.check('#set-permadeath');
  const death = await page.evaluate(() => ({ global: Game.Storage.settings().permadeath, o: Game.Storage.perPack('low-water').overrides, l: Game.Pack.lookup('rules.permadeath'), note: document.getElementById('set-permadeath-layer').textContent }));
  assert.equal(death.global, true);
  assert.deepEqual(death.o, { 'rules.permadeath': true });
  assert.deepEqual([death.l.layer, death.l.value], ['player', true]);
  assert.equal(death.note, '(your choice)');
  // The Narration style radio.
  await page.check('input[name="set-style"][value="literary"]');
  const style = await page.evaluate(() => ({ o: Game.Storage.perPack('low-water').overrides['narration.preset'], g: Game.Storage.settings().narrationStyle, l: Game.Pack.lookup('narration.preset').layer, cur: Game.Style.current(), note: document.getElementById('set-style-layer').textContent }));
  assert.deepEqual(style, { o: 'literary', g: 'literary', l: 'player', cur: 'literary', note: '(your choice)' });
  // An unrelated change on the screen never copies the story's showRolls into the global setting.
  const other = await page.evaluate(() => { document.getElementById('set-keep-packets').click(); const st = Game.Storage.settings(); return [st.keepPackets, st.showRolls]; });
  assert.deepEqual(other, [true, true], 'keepPackets saved, the global showRolls still the player\'s own true');
});

/* A hold'em hand open at the card game's place (the betting tests' way:
   a phase its dealer sits, the deal preset, "Deal me in." typed). */
async function openHand(page) {
  await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    S.apply({ goldDelta: 200 });
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    for (const ph of ['evening', 'night', 'afternoon']) {
      let d = st.time.day + (PH.indexOf(ph) < PH.indexOf(st.time.phase) ? 1 : 0);
      while (S.isClosed(l, d)) d++;
      S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
      if (G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id))) return;
    }
    throw new Error('no table with its dealer');
  });
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsDeal = { holes: [['7s', '2d'], ['Ah', 'Ad']], board: ['2c', '7d', '9h', '3s', 'Jc'], seats: [] }; });
  await page.fill('#cmd', 'Deal me in.');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open .cards-acts button');
}
const handNow = page => page.evaluate(() => JSON.stringify({ open: Game.Pipeline.handOpen, t: Game.Pipeline.openHand, gold: Game.state.player.gold, log: Game.state.log.length, armed: Game.state.flags }));

s.test('rules.cheats.allowed false at the card table (task M4-E): the open table shows no Win (cheat) button, and /cheat win or /cheat cards typed with the hand open answers "Not in this story." and leaves the hand as it was; with cheats allowed the button is there', async h => {
  const page = await h.open({ contextOptions: { reducedMotion: 'reduce' } });
  await preview(page, { cheats: { allowed: false } });
  await start(page);
  await openHand(page);
  assert.equal(await page.$$eval('#feed .f-cards.open .cards-win', b => b.length), 0, 'no Win (cheat) button');
  const before = await handNow(page);
  for (const t of ['/cheat win', '/cheat cards']) {
    await page.fill('#cmd', t);
    await page.press('#cmd', 'Enter');
    await page.waitForTimeout(60);
    assert.equal(await lastNotice(page), 'Not in this story.', t);
    assert.equal(await handNow(page), before, `${t}: the hand as it was`);
    assert.equal(await page.$$eval('#feed .f-cards.open', x => x.length), 1, 'the table still open');
  }
  const page2 = await h.open({ contextOptions: { reducedMotion: 'reduce' } });
  await start(page2);
  await openHand(page2);
  assert.equal(await page2.$$eval('#feed .f-cards.open .cards-win', b => b.length), 1, 'cheats allowed: the button is there');
});

s.test('World.chiefOf reads world.law.headNpcId first (task M4-E): a law head who is another free person in town makes the arrest (World.arrestPlan, World.arrestPlayer); a head who is away falls back to the search (Marcus Bell); the built-in law\'s head is Marcus Bell', async h => {
  const page = await h.open();
  await start(page);
  const built = await page.evaluate(() => Game.World.arrestPlan().chiefId);
  assert.equal(built, 'npc_marcus');
  await page.evaluate(() => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    c.world.law = Object.assign({}, c.world.law, { headNpcId: 'npc_dewayne' });
    P.setPreview(c);
  });
  const r = await page.evaluate(() => {
    const G = Game, W = G.World, S = G.State, st = G.state;
    const dewayne = S.npc('npc_dewayne');
    const out = { free: G.Rel.inTown(dewayne), tags: dewayne.tags || [], plan: W.arrestPlan() };
    W.arrestPlayer();
    out.at = st.player.locationId;
    dewayne.presence = 'away';
    out.away = W.arrestPlan().chiefId;
    return out;
  });
  assert.equal(r.free, true, 'Dewayne is free and in town');
  assert.ok(!r.tags.includes('police') && !r.tags.includes('chief'), 'not the law by tag: only the pack says so');
  assert.equal(r.plan.chiefId, 'npc_dewayne');
  assert.match(r.plan.text, /^Dewayne \S+ puts /);
  assert.equal(r.at, r.plan.cellId, 'the arrest went through');
  assert.equal(r.away, 'npc_marcus', 'away: the search finds the chief');
});

s.test('the roll line hides when rules.showRolls is false at the pack layer and the player has not chosen; the player\'s choice for this story shows it again', async h => {
  const page = await h.open();
  await preview(page, { showRolls: false });
  await start(page);
  const r = await page.evaluate(async () => {
    const G = Game;
    G.Pipeline.forceNextRoll(14);
    G.Api.Mock.queue('parse', { actionType: 'other', summary: 'I climb the wall', targets: [], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    await G.Pipeline.submit('I climb the wall', { mode: 'do' });
    await G.Pipeline.whenIdle();
    return { rolled: !!(G.Pipeline.lastTurn.ctx && G.Pipeline.lastTurn.ctx.roll), lines: document.querySelectorAll('#feed .f-roll').length, l: G.Pack.lookup('rules.showRolls') };
  });
  assert.equal(r.rolled, true, 'the turn rolled');
  assert.equal(r.lines, 0, 'no roll line');
  assert.deepEqual([r.l.layer, r.l.value], ['pack', false]);
  const n = await page.evaluate(() => { Game.Storage.savePerPack('low-water', { overrides: { 'rules.showRolls': true } }); Game.UI.rebuildFeed(); return document.querySelectorAll('#feed .f-roll').length; });
  assert.equal(n, 1, 'the player\'s choice shows it');
});

s.run();
