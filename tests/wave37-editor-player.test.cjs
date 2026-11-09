'use strict';
/* Wave 37, Creator Mode, milestone 5 (task M5-D): the Player tab and the
   engine's reads of the creation data (plan decision F's rows for the
   arrivals, the stats, the creation steps and the hints; decision H). The
   tab draws a story's backgrounds (the World tab's list and detail: stats
   with their total, money in the story's currency, the things carried,
   the arrival, the hook), its flaws and goal suggestions as chips, a card
   per loose-end kind, the four stats, the start, the two arrivals and the
   creation steps. The eight old content bindings (TOWN_DATA and the rest)
   are gone: the engine reads the pack that plays through Pack.world(),
   Pack.backgrounds() and the other readers, the Create screen reads the
   story it starts (Pack.selected()), and Town.openingScene, Pipeline's
   arrival, the stat tiles and the steps read player.arrivals, player.stats
   and player.creation. The usage lines and the /fact notice name the
   playing story's people. The tab passes the mobile audit at 375 and 390,
   and screenshots of the Backgrounds list and one background open at
   390x844 and 1280x800 in the Dark and Parchment themes go to $UI_SHOTS
   when it names a folder.
   Run with: node tests/run.cjs wave37-editor-player */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, GAME_PATH, LAPTOP } = require('./helpers.cjs');

const s = suite('wave37-editor-player');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
/* A copy of the built-in story opened in the editor straight from Storage.Drafts, on its Player tab. */
async function openPlayer(page) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'harbour-copy';
    p.meta.title = 'Harbour Copy';
    const dr = Game.Storage.Drafts.put({ pack: p });
    Game.Creator.openEditor(dr.id);
  });
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  await page.click('#creator-tab-player');
  await page.waitForSelector('#creator-body[data-tab="player"] .cr-entity[data-entity="backgrounds"]');
}
const checkNow = page => page.evaluate(() => Game.Creator.Editor.check().map(p => ({ path: p.path, rule: p.rule, severity: p.severity, message: p.message })));
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.textContent : null; });

/* SPEC section 11's checks, as tests/wave37-editor-world.test.cjs makes them: 44px tap targets, 16px inputs, nothing
   wider than the screen (a strip that scrolls sideways on purpose is scrolled, not wide). */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  const small = [...document.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...document.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${x[0]} ${x[1]}px`);
  const scrolledInside = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      if (pr.left >= -1 && pr.right <= W + 1) return true;
    }
    return false;
  };
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scrolledInside(el)) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
  }
  for (const el of document.querySelectorAll('.page')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) wide.push('scrolls sideways: ' + (el.id || el.className));
  if (document.documentElement.scrollWidth > W) wide.push('document ' + document.documentElement.scrollWidth);
  return { label, small, fonts, wide: wide.slice(0, 10) };
}

s.test('the Player tab draws the built-in copy: 6 backgrounds, 8 flaws, 6 goal suggestions, the 5 loose-end kinds, the four stats, the two arrivals and the five creation steps, in that order, with no error on its tab', async h => {
  const page = await open(h, { viewport: LAPTOP });
  await openPlayer(page);
  await page.evaluate(() => Game.Creator.Editor.check());
  const r = await page.evaluate(() => {
    const b = document.getElementById('creator-body');
    const q = sel => b.querySelectorAll(sel);
    const order = [...b.children].map(c => c.dataset.entity || c.dataset.section || c.className);
    return {
      rows: [...q('.cr-entity[data-entity="backgrounds"] .cr-row')].map(r => r.dataset.id),
      flaws: q('[data-section="player.flaws"] .cr-chip-item').length,
      goals: q('[data-section="player.goalPresets"] .cr-chip-item').length,
      kinds: [...q('.cr-loose')].map(x => x.dataset.kind),
      options: q('.cr-loose[data-kind="debt"] .cr-line-row textarea').length,
      stats: [...q('[data-section^="player.stats."]')].map(x => x.dataset.section),
      statLabels: [...q('[data-path$=".label"][data-path^="player.stats."]')].map(x => x.value),
      arrivals: [...q('[data-section^="player.arrivals."]')].map(x => x.dataset.section),
      steps: [...q('.cr-step')].length,
      stepTitles: [...q('.cr-step [data-path$=".title"]')].map(x => x.value),
      start: [b.querySelector('[data-path="player.start.hp"]').value, b.querySelector('[data-path="player.start.storyPoints"]').value, b.querySelector('[data-path="player.ageRange[0]"]').value, b.querySelector('[data-path="player.ageRange[1]"]').value],
      order,
      badge: document.getElementById('creator-tab-player').dataset.count || null,
      placeholder: b.textContent.includes(Game.Creator.PLACEHOLDER)
    };
  });
  assert.deepEqual(r.rows, ['bg_veteran', 'bg_dropout', 'bg_fired_bookkeeper', 'bg_river_deckhand', 'bg_group_home_kid', 'bg_poker_hustler']);
  assert.equal(r.flaws, 8);
  assert.equal(r.goals, 6);
  assert.deepEqual(r.kinds, ['debt', 'enemy', 'secret', 'lost', 'promise']);
  assert.equal(r.options, 3, 'the three options of a debt, one box each');
  assert.deepEqual(r.stats, ['player.stats.might', 'player.stats.wits', 'player.stats.charm', 'player.stats.stealth']);
  assert.deepEqual(r.statLabels, ['Might', 'Wits', 'Charm', 'Stealth']);
  assert.deepEqual(r.arrivals, ['player.arrivals.gate', 'player.arrivals.docks']);
  assert.equal(r.steps, 5);
  assert.deepEqual(r.stepTitles, ['Name', 'Background and age', 'Stats', 'Goal and flaw', 'Three loose ends']);
  assert.deepEqual(r.start, ['10', '2', '16', '90']);
  // Backgrounds, flaws, goals, the loose ends' card and its five kinds, stats, start, arrivals, steps.
  assert.deepEqual(r.order, ['backgrounds', 'player.flaws', 'player.goalPresets', 'player.looseEnds',
    'player.looseEnds.debt', 'player.looseEnds.enemy', 'player.looseEnds.secret', 'player.looseEnds.lost', 'player.looseEnds.promise',
    'player.stats', 'player.start', 'player.arrivals', 'player.creation.steps']);
  assert.equal(r.badge, null, 'the built-in story has no error on the Player tab');
  assert.equal(r.placeholder, false);
  // A background open: who they were, the stats with their total, the money in dollars, the things, the arrival, the hook.
  await page.click('.cr-row[data-id="bg_veteran"]');
  await page.waitForSelector('.cr-entity[data-entity="backgrounds"][data-open="1"]');
  const d = await page.evaluate(() => {
    const b = document.getElementById('creator-body');
    const v = p => { const c = b.querySelector(`[data-path="${p}"]`); return c ? c.value : null; };
    const P = 'player.backgrounds[0]';
    return {
      name: v(P + '.name'), age: v(P + '.age'), stats: ['might', 'wits', 'charm', 'stealth'].map(k => v(`${P}.stats.${k}`)),
      total: b.querySelector('.cr-total').textContent, money: b.querySelector(`[data-field="${P}.gold"] label`).textContent, gold: v(P + '.gold'),
      items: [...b.querySelectorAll(`[data-path^="${P}.items["][data-path$=".name"]`)].map(x => x.value),
      arrival: v(P + '.arrival'), arrivalText: b.querySelector(`[data-path="${P}.arrival"]`).selectedOptions[0].textContent,
      arrivalChoices: [...b.querySelectorAll(`[data-path="${P}.arrival"] option`)].map(o => o.value),
      hook: [v(P + '.hook.npcId'), v(P + '.hook.dayOffset'), v(P + '.hook.trigger.type'), v(P + '.hook.trigger.value')]
    };
  });
  assert.deepEqual(d, {
    name: 'Veteran', age: '34', stats: ['2', '0', '0', '1'], total: d.total, money: d.money, gold: '140',
    items: ['Folding knife', 'Dog tags', 'Prepaid phone'], arrival: 'gate', arrivalText: 'By road (gate)', arrivalChoices: ['', 'gate', 'docks'],
    hook: ['npc_marcus', '0', 'npc', 'npc_marcus']
  });
  assert.match(d.total, /^Total \+3\./);
  assert.match(d.money, /^Money, in dollars/);
  // The total follows a change as it is made.
  await page.fill('[data-path="player.backgrounds[0].stats.wits"]', '1');
  await page.dispatchEvent('[data-path="player.backgrounds[0].stats.wits"]', 'change');
  assert.match(await page.textContent('.cr-total'), /^Total \+4\./);
  assert.equal(await page.evaluate(() => Game.Creator.state.draft.player.backgrounds[0].stats.wits), 1);
});

s.test('a stat renamed Brawn on the Player tab reaches the parser prompt\'s STAT sentence through a preview of the draft, the Create screen\'s tile and the review line, and the background\'s own stat field', async h => {
  const page = await open(h, { viewport: LAPTOP });
  await openPlayer(page);
  await page.fill('[data-path="player.stats.might.label"]', 'Brawn');
  await page.dispatchEvent('[data-path="player.stats.might.label"]', 'change');
  assert.equal(await page.evaluate(() => Game.Creator.state.draft.player.stats.might.label), 'Brawn');
  // The tab drawn again: the stats card and a background's stat field use the new name.
  await page.click('#creator-tab-overview');
  await page.click('#creator-tab-player');
  await page.click('.cr-row[data-id="bg_veteran"]');
  assert.equal(await page.textContent('[data-field="player.backgrounds[0].stats.might"] label'), 'Brawn');
  const parser = await page.evaluate(() => {
    const before = Game.Api.systemFor('parser');
    Game.Pack.setPreview(Game.Creator.state.draft);
    return { before, after: Game.Api.systemFor('parser') };
  });
  assert.ok(parser.before.includes('STAT: might for'), 'the built-in sentence first');
  assert.ok(parser.after.includes('STAT: might (this story calls it Brawn) for'), 'the parser hears the draft\'s name beside the key');
  // New game from the preview: the Stats step's tile and the background card's stat line use it.
  await page.evaluate(() => { Game.Storage.saveSettings({ playChoice: 'demo' }); Game.App.newGame(); });
  await page.waitForSelector('#screen-create.active');
  await page.click('.bg-choice[data-id="bg_veteran"]');
  assert.equal(await page.textContent('.cr-stat[data-stat-tile="might"] .stat-name'), 'Brawn');
  assert.equal(await page.textContent('.cr-stat[data-stat-tile="wits"] .stat-name'), 'Wits');
  assert.equal(await page.textContent('.cr-stat[data-stat-tile="might"] .cr-stat-desc'), 'Strength and toughness: fights, lifting, holding a door shut.', 'the blurb is the story\'s player.stats.might.blurb');
  assert.match(await page.textContent('.bg-choice[data-id="bg_veteran"] .choice-meta'), /Brawn \+2, Wits 0, Charm 0, Stealth \+1/);
  await page.evaluate(() => { Game.App.cancelPrepare(); Game.Pack.setPreview(null); });
  assert.ok((await page.evaluate(() => Game.Api.systemFor('parser'))).includes('STAT: might for'), 'the preview gone, the built-in sentence again');
});

s.test('an arrival label edited on the Player tab reaches the background cards and the Review card; the Create screen\'s steps are the story\'s creation steps', async h => {
  const page = await open(h, { viewport: LAPTOP });
  await openPlayer(page);
  await page.fill('[data-path="player.arrivals.gate.label"]', 'Over the pass');
  await page.dispatchEvent('[data-path="player.arrivals.gate.label"]', 'change');
  await page.fill('[data-path="player.arrivals.docks.label"]', 'Up the creek');
  await page.dispatchEvent('[data-path="player.arrivals.docks.label"]', 'change');
  await page.fill('[data-path="player.creation.steps[0].title"]', 'Your name');
  await page.dispatchEvent('[data-path="player.creation.steps[0].title"]', 'change');
  // The steps reorder with the arrows: Stats up above Background and age, and back.
  await page.click('[data-step-move="2"][data-dir="up"]');
  assert.deepEqual(await page.evaluate(() => Game.Creator.state.draft.player.creation.steps.map(x => x.id)), ['name', 'stats', 'background', 'goal', 'loose']);
  await page.click('[data-step-move="1"][data-dir="down"]');
  assert.deepEqual(await page.evaluate(() => Game.Creator.state.draft.player.creation.steps.map(x => x.id)), ['name', 'background', 'stats', 'goal', 'loose']);
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), 5);
  await page.evaluate(() => { Game.Pack.setPreview(Game.Creator.state.draft); Game.Storage.saveSettings({ playChoice: 'demo' }); Game.App.newGame(); });
  await page.waitForSelector('#screen-create.active');
  assert.equal(await page.textContent('#cr-h-name'), 'Your name');
  assert.deepEqual(await page.evaluate(() => Game.UI.Create.STEPS.map(x => x.id)), ['name', 'background', 'stats', 'goal', 'loose']);
  assert.match(await page.textContent('.bg-choice[data-id="bg_veteran"] .choice-meta'), / · arrives over the pass$/);
  assert.match(await page.textContent('.bg-choice[data-id="bg_dropout"] .choice-meta'), / · arrives up the creek$/);
  await page.click('#cr-random');
  await page.waitForSelector('#create-summary-view:not([hidden])');
  const row = await page.evaluate(() => {
    const dts = [...document.querySelectorAll('#summary-card dt')];
    const dt = dts.find(x => x.textContent === 'Arrives');
    const bg = Game.Pack.current().player.backgrounds.find(b => b.id === Game.state.player.backgroundId);
    return { text: dt.nextElementSibling.textContent, arrival: bg.arrival, place: Game.State.loc(Game.state.player.locationId).name };
  });
  assert.equal(row.text, `${row.arrival === 'docks' ? 'Up the creek' : 'Over the pass'}, at ${row.place}`);
  await page.evaluate(() => { Game.App.cancelPrepare(); Game.Pack.setPreview(null); });
});

s.test('the built-in story reads as before: the opening scene and the arrival\'s summary come from player.arrivals with {place} and {town} filled, word for word as the old template literals made them, and another pack\'s arrival words are its own', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: 0 });
  const gate = await page.evaluate(() => {
    const s = Game.state;
    const l = Game.State.loc(s.player.locationId);
    const place = l.name.replace(/^The /, 'the ');
    return { scene: Game.Town.openingScene(s), want: `You come in on foot by the road and stop at ${place}, on the edge of ${s.meta.townName}.`, summary: Game.Town.arrivalOf('gate').summary };
  });
  assert.ok(gate.scene.includes(gate.want), gate.scene);
  assert.equal(gate.summary, 'arriving by the road');
  const page2 = await open(h);
  await quickStart(page2, { bgIndex: 1 });
  const docks = await page2.evaluate(() => {
    const s = Game.state;
    const place = Game.State.loc(s.player.locationId).name.replace(/^The /, 'the ');
    const c = Game.Pack.copy(Game.Pack.builtIn());
    c.player.arrivals.docks.opening = 'The ferry sets you down at {place}; {town} smells of diesel.';
    c.player.arrivals.docks.summary = 'off the ferry';
    const own = { scene: Game.Town.openingScene(s), want: `You step off a river boat onto ${place} in ${s.meta.townName}, your pack on your shoulder.`, summary: Game.Town.arrivalOf('docks').summary };
    Game.Pack.setPreview(c);
    const other = { scene: Game.Town.openingScene(s), summary: Game.Town.arrivalOf('docks').summary, want: `The ferry sets you down at ${place}; ${s.meta.townName} smells of diesel.` };
    Game.Pack.setPreview(null);
    return { own, other };
  });
  assert.ok(docks.own.scene.includes(docks.own.want), docks.own.scene);
  assert.equal(docks.own.summary, 'arriving by the river');
  assert.ok(docks.other.scene.includes(docks.other.want), docks.other.scene);
  assert.equal(docks.other.summary, 'off the ferry');
});

s.test('a background added on the Player tab gets a bg_ id and a validation problem at its things and its arrival until it has them', async h => {
  const page = await open(h, { viewport: LAPTOP });
  await openPlayer(page);
  await page.click('.cr-entity[data-entity="backgrounds"] [data-action="add"]');
  await page.fill('#cr-add-backgrounds', 'Drifter');
  await page.click('.cr-entity[data-entity="backgrounds"] [data-action="add-confirm"]');
  await page.waitForSelector('.cr-entity[data-entity="backgrounds"][data-open="1"]');
  const id = await page.evaluate(() => Game.Creator.PlayerTab.backgrounds.view.open);
  assert.equal(id, 'bg_drifter');
  const P = 'player.backgrounds[6]';
  const at = (list, p) => list.filter(x => x.path === p && /^engine\./.test(x.rule));
  let probs = await checkNow(page);
  assert.deepEqual(at(probs, P + '.items').map(x => [x.rule, x.severity, x.message]), [['engine.background', 'error', 'is missing.']]);
  assert.ok(at(probs, P + '.arrival').some(x => x.severity === 'error'), JSON.stringify(at(probs, P + '.arrival')));
  // The problems sit under the controls they are about.
  assert.match(await page.textContent(`#cr-f-player-backgrounds-6-arrival-err`), /missing/i);
  assert.match(await page.textContent(`#cr-f-player-backgrounds-6-items-err`), /missing/i);
  assert.ok(Number(await page.getAttribute('#creator-tab-player', 'data-count')) >= 2, 'the tab counts them');
  // A thing added by name (its id made once from it) and an arrival chosen: those two problems go.
  await page.fill('#cr-f-player-backgrounds-6-items-add', 'Bus ticket stub');
  await page.click('[data-action="add-item"]');
  await page.selectOption(`[data-path="${P}.arrival"]`, 'gate');
  probs = await checkNow(page);
  assert.deepEqual(at(probs, P + '.items'), []);
  assert.deepEqual(at(probs, P + '.arrival'), []);
  const bg = await page.evaluate(() => Game.Creator.state.draft.player.backgrounds[6]);
  assert.deepEqual(bg.items, [{ id: 'item_bus_ticket_stub', name: 'Bus ticket stub', qty: 1, notes: '' }]);
  assert.equal(bg.arrival, 'gate');
  // An arrival key the start places do not have is the validator's to refuse (engine.background.arrival, task M5-D).
  const extra = await page.evaluate(() => {
    const c = Game.Pack.copy(Game.Pack.builtIn());
    c.player.arrivals.air = { label: 'By air', opening: 'You land at {place}.', summary: 'flying in' };
    delete c.player.arrivals.docks;
    return Game.Pack.validate(c, { profile: 'play' }).filter(p => /^player\.arrivals/.test(p.path)).map(p => [p.path, p.severity]);
  });
  assert.ok(extra.some(([p, sev]) => p === 'player.arrivals.docks' && sev === 'error'), JSON.stringify(extra));
  assert.ok(extra.some(([p, sev]) => p === 'player.arrivals.air' && sev === 'error'), JSON.stringify(extra));
});

s.test('the eight content bindings are gone from index.html: no let TOWN_DATA, TABLES or BACKGROUNDS line, and Game.data reads the Pack readers', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.equal((html.match(/^let TOWN_DATA|^let TABLES|^let BACKGROUNDS/gm) || []).length, 0);
  assert.equal((html.match(/^let (FLAWS|LOOSE_ENDS|GRUDGE_TEMPLATES|FAVOUR_TEMPLATES|GOAL_PRESETS)\b/gm) || []).length, 0);
  const page = await open(h);
  const r = await page.evaluate(() => {
    const P = Game.Pack, D = Game.data, B = P.builtIn();
    return [D.TOWN_DATA === P.world(), P.world() === B.world, D.TABLES === B.world.tables, D.BACKGROUNDS === B.player.backgrounds, D.FLAWS === B.player.flaws,
      D.LOOSE_ENDS === B.player.looseEnds, D.GRUDGE_TEMPLATES === B.world.grudgeTemplates, D.FAVOUR_TEMPLATES === B.world.favourTemplates, D.GOAL_PRESETS === B.player.goalPresets];
  });
  assert.deepEqual(r, [true, true, true, true, true, true, true, true, true]);
  // A preview that lacks a section reads the built-in pack's: a half-written draft never leaves the engine reading undefined.
  const fallback = await page.evaluate(() => {
    const c = Game.Pack.copy(Game.Pack.builtIn());
    delete c.world.tables;
    delete c.player.flaws;
    Game.Pack.setPreview(c);
    const out = [Game.Pack.tables().complications.length > 0, Game.Pack.flaws().length, Game.Pack.backgrounds() !== Game.Pack.builtIn().player.backgrounds];
    Game.Pack.setPreview(null);
    return out;
  });
  assert.deepEqual(fallback, [true, 8, true]);
});

s.test('a Library pack with an extra flaw, selected through selectedPackId, shows that flaw in the Create screen\'s flaw suggestions before the game starts, and in Game.data.FLAWS once it has', async h => {
  const page = await open(h, { viewport: LAPTOP });
  const extra = 'Cannot leave a locked door alone.';
  await page.evaluate(flaw => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'flaw-copy';
    p.meta.title = 'Flaw Copy';
    p.player.flaws.push(flaw);
    Game.Storage.Library.put(p, { source: 'created' });
    Game.Storage.saveSettings({ selectedPackId: 'flaw-copy', playChoice: 'demo' });
    Game.App.newGame();
  }, extra);
  await page.waitForSelector('#screen-create.active');
  const chips = await page.$$eval('.flaw-choice', bs => bs.map(b => b.textContent));
  assert.equal(chips.length, 9);
  assert.equal(chips[8], extra);
  assert.equal(await page.evaluate(f => Game.data.FLAWS.includes(f), extra), false, 'no game yet: the engine reads the built-in pack');
  await page.evaluate(() => Game.UI.showScreen('title'));
  await quickStart(page);
  assert.deepEqual(await page.evaluate(f => [Game.State.pack.meta.id, Game.data.FLAWS.includes(f), Game.data.FLAWS === Game.State.pack.player.flaws], extra), ['flaw-copy', true, true]);
});

s.test('the /pronouns and /edit usage lines and the /fact notice name the playing story\'s people and a place it has out of town', async h => {
  const page = await open(h);
  await quickStart(page);
  const first = await page.evaluate(() => Game.data.TOWN_DATA.npcs[0].name.split(' ')[0]);
  assert.equal(first, 'Loretta');
  await sendText(page, '/pronouns');
  assert.equal(await lastNotice(page), `Whose pronouns, and which? Try /pronouns ${first} she (she, he or they).`);
  await sendText(page, '/edit');
  assert.equal(await lastNotice(page), `Edit whom? Try /edit ${first}.`);
  await page.evaluate(() => Game.Pipeline.submit('/fact who runs the ferry'));
  assert.equal(await lastNotice(page), 'A fact is a statement to make true, not a question: /fact Loretta grew up in Clayburn, or /fact the mechanic owes me a favour. To find something out, ask someone in the story ("I ask Royce what he knows about Loretta").');
  // Another story's first person and its first place out of town.
  await page.evaluate(() => {
    const c = Game.Pack.copy(Game.Pack.builtIn());
    c.world.npcs[0].name = 'Wilhelmina Gaddis';
    c.world.npcs[1].pronouns = 'they';
    for (const l of c.world.locations) if (l.away === true) l.away = false;
    Game.Pack.setPreview(c);
  });
  await sendText(page, '/pronouns');
  assert.equal(await lastNotice(page), 'Whose pronouns, and which? Try /pronouns Wilhelmina she (she, he or they).');
  await page.evaluate(() => { document.getElementById('cmd').value = ''; return Game.Pipeline.submit('/fact who runs the ferry'); });
  assert.match(await lastNotice(page), /\/fact Wilhelmina grew up elsewhere, .*\("I ask Royce what they know about Wilhelmina"\)\.$/);
  await page.evaluate(() => Game.Pack.setPreview(null));
});

s.test('the Player tab passes the mobile audit at 375 and 390: the whole tab, and a background open in the list\'s place with Back in the sticky bar', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openPlayer(page);
    let a = await page.evaluate(audit, `player tab ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await page.click('.cr-row[data-id="bg_river_deckhand"]');
    await page.waitForSelector('.cr-entity[data-entity="backgrounds"][data-open="1"]');
    assert.equal(await page.isVisible('.cr-entity[data-entity="backgrounds"] .cr-entity-list'), false, 'on a phone the detail replaces the list');
    assert.equal(await page.isVisible('.cr-entity-detail .cr-sticky [data-action="back-bar"]'), true);
    a = await page.evaluate(audit, `background detail ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await page.click('.cr-sticky [data-action="back-bar"]');
    await page.waitForSelector('.cr-entity[data-entity="backgrounds"][data-open="0"]');
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openPlayer(page);
      await page.evaluate(() => Game.Creator.Editor.check());
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-player-backgrounds-${vp.width}x${vp.height}-${theme}`);
      await page.click('.cr-row[data-id="bg_veteran"]');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-player-background-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
