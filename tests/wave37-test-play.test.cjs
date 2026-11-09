'use strict';
/* Wave 37, Creator Mode, milestone 7 (task M7-A; plan decision H, "Test
   from draft"): the editor's Test tab starts a real game from the draft in
   one tap (mock mode): the game says where it came from (meta.packSource
   'draft', meta.draftId), plays a frozen copy of the draft as it was at the
   start (State.pack), shows "Testing: <title>" above the feed and plays a
   turn; Back to the editor (the bar, and Settings' Quit, whose label says
   so in a test game only) returns to the same draft, unchanged. A draft
   with an error cannot start (the button is off, the note counts the
   problems, the header's Test stops at the Problems list). An unsaved
   different autosave is asked about ("Replace the autosave?", "A test of
   Low Water"), and Keep it changes nothing; an earlier test game is not
   asked about. The test game's autosave keeps playing its own version
   after the draft is edited (Continue after a reload, the frozen store) and
   shows the bar again. A normal game's meta has no packSource or draftId.
   The Test tab and the test bar pass the mobile audit at 375 and 390.
   Screenshots of the Test tab and the game with the test bar at 390x844 and
   1280x800 in the Dark and Parchment themes go to $UI_SHOTS when it names a
   folder (none without it).
   Run with: node tests/run.cjs wave37-test-play */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, consent, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave37-test-play');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

/* A page with the Library and the drafts read, and the mock answering at once. */
async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  // Wave 37, Creator Mode, milestone 8 (task M8-B): the 18+ yes for the adult copies this file makes (helpers' consent).
  await consent(page, 'low-water-test');
  return page;
}
/* A draft of the built-in story with an id of its own and its title kept (Low Water), opened from its card in the Library. */
async function openDraft(page) {
  const draftId = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'low-water-test';
    return Game.Storage.Drafts.put({ pack: p }).id;
  });
  if (!(await page.isVisible('#creator-library'))) {
    await page.click('#btn-create');
    await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  }
  await page.evaluate(() => Game.Creator.renderLibrary());
  await page.click(`#creator-cards .cr-card[data-id="${draftId}"] [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  return draftId;
}
async function testTab(page) {
  await page.click('#creator-tab-test');
  await page.waitForSelector('#creator-test-panel');
}
const toast = page => page.waitForFunction(() => document.getElementById('toast').classList.contains('show')).then(() => page.textContent('#toast'));
const draftJson = (page, id) => page.evaluate(x => JSON.stringify(Game.Storage.Drafts.get(x).pack), id);
/* Every queued IndexedDB write (the frozen copy, the draft) is done before a reload. */
const settle = page => page.evaluate(() => Game.Storage.undoIdle());

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider
   than the screen. scope: the taps and inputs checked are those inside it (the game's test bar), else the page's. */
function audit([label, scope]) {
  const W = window.innerWidth;
  const root = scope ? document.querySelector(scope) : document;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  const small = [...root.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...root.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
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

s.test('Start a test game reaches the game in one tap (mock mode): meta.packSource "draft" and the draft\'s id, State.pack frozen and equal to the draft, "Testing: Low Water" above the feed; a turn plays; Back to the editor reopens the same draft with its JSON unchanged', async h => {
  const page = await open(h);
  const draftId = await openDraft(page);
  await testTab(page);
  const tab = await page.evaluate(() => ({
    h: document.querySelector('#creator-test-panel h2').textContent,
    note: document.querySelector('#creator-test-panel .cr-note').textContent,
    bgs: [...document.querySelectorAll('#creator-test-bg option')].map(o => o.value),
    first: Game.Pack.builtIn().player.backgrounds[0].id,
    picked: document.getElementById('creator-test-bg').value,
    seed: document.getElementById('creator-test-seed').value,
    off: document.getElementById('creator-test-start').disabled,
    blocked: !!document.getElementById('creator-test-problems'),
    head: document.getElementById('creator-test').disabled,
    tapH: document.getElementById('creator-test-start').getBoundingClientRect().height
  }));
  assert.equal(tab.h, 'Test this story');
  assert.match(tab.note, /in the offline demo \(canned replies\), as Settings has it\./);
  assert.equal(tab.picked, tab.first, 'the first background is chosen');
  assert.equal(tab.bgs.length, await page.evaluate(() => Game.Pack.builtIn().player.backgrounds.length));
  assert.deepEqual([tab.seed, tab.off, tab.blocked, tab.head], ['', false, false, false], 'warnings do not block; the seed is empty (random)');
  assert.ok(tab.tapH >= 44, `Start is ${tab.tapH}px tall`);
  const before = await draftJson(page, draftId);
  await page.click('#creator-test-start');
  await page.waitForSelector('#screen-game.active');
  const g = await page.evaluate(id => {
    const st = Game.state;
    const dr = Game.Storage.Drafts.get(id).pack;
    return {
      source: st.meta.packSource, draftId: st.meta.draftId, frozen: Object.isFrozen(Game.State.pack),
      same: JSON.stringify(Game.State.pack) === JSON.stringify(dr), title: Game.State.pack.meta.title, player: st.player.name, bg: st.player.backgroundId,
      bar: !document.getElementById('test-bar').hidden, text: document.getElementById('test-bar-text').textContent,
      note: document.querySelector('#test-bar .test-bar-note').textContent, back: document.getElementById('test-bar-back').textContent,
      feed: document.getElementById('feed').textContent.length > 0, inGame: Game.App.inGame(),
      above: document.getElementById('test-bar').getBoundingClientRect().bottom <= document.getElementById('feed-scroll').getBoundingClientRect().top + 1
    };
  }, draftId);
  assert.deepEqual(g, {
    source: 'draft', draftId, frozen: true, same: true, title: 'Low Water', player: 'Tester', bg: tab.first,
    bar: true, text: 'Testing: Low Water', note: 'A test game; its autosave keeps playing from this version of the story.', back: 'Back to the editor',
    feed: true, inGame: true, above: true
  });
  // A turn plays.
  const turn = await page.evaluate(() => Game.state.meta.turn);
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), turn + 1, 'a turn played');
  assert.equal(await page.isVisible('#test-bar'), true, 'the bar stays after a turn');
  // Back to the editor: the same draft, on the Test tab, its JSON as it was.
  await page.click('#test-bar-back');
  await page.waitForSelector('#screen-creator.active #creator-test-panel');
  const back = await page.evaluate(() => ({ screen: Game.UI.screen, view: Game.Creator.state.view, id: Game.Creator.state.draftId, tab: Game.Creator.state.tab, inGame: Game.App.inGame(), open: JSON.stringify(Game.Creator.state.draft) }));
  assert.deepEqual([back.screen, back.view, back.id, back.tab, back.inGame], ['creator', 'editor', draftId, 'test', false]);
  assert.equal(await draftJson(page, draftId), before, 'the draft kept is unchanged');
  assert.equal(back.open, before, 'the draft open is unchanged');
});

s.test('a draft with an error (a dangling exit) cannot start: the button is off, the note counts the problems, Show the problems goes to the Overview list; the header\'s Test stops there too', async h => {
  const page = await open(h);
  await openDraft(page);
  await page.evaluate(() => {
    const ex = Game.Creator.state.draft.world.locations[0].exits;
    Game.Creator.Editor.set('world.locations[0].exits', ex.concat(['loc_nowhere']));
  });
  await testTab(page);
  const n = await page.evaluate(() => Game.Pack.errors(Game.Creator.Editor.problems).length);
  assert.ok(n >= 1);
  const t = await page.evaluate(() => ({ off: document.getElementById('creator-test-start').disabled, note: document.getElementById('creator-test-problems').textContent, show: [...document.querySelectorAll('#creator-test-panel .cr-test-go .btn')].map(b => b.textContent) }));
  assert.deepEqual(t, { off: true, note: `Fix the ${n} problem${n === 1 ? '' : 's'} first.`, show: ['Start a test game', 'Show the problems'] });
  await page.click('#creator-test-panel .cr-test-go button:text-is("Show the problems")');
  assert.deepEqual(await page.evaluate(() => [Game.Creator.state.tab, document.activeElement.id]), ['overview', 'creator-problems']);
  // The header's Test does what Start would: no game, a toast, the Problems list.
  await testTab(page);
  await page.click('#creator-test');
  assert.equal(await toast(page), `Fix ${n} problem${n === 1 ? '' : 's'} first.`);
  assert.deepEqual(await page.evaluate(() => [Game.UI.screen, Game.Creator.state.tab, document.activeElement.id, Game.state]), ['creator', 'overview', 'creator-problems', null]);
  assert.equal(await page.evaluate(() => Game.Creator.Test.start(Game.Creator.state.draft, Game.Creator.Test.choice())), false);
});

s.test('an unsaved different autosave gets "Replace the autosave?" ("A test of Low Water"), and Keep it leaves everything as it was; Go ahead starts the test; a test game\'s autosave is not asked about again', async h => {
  const page = await open(h);
  await quickStart(page, { name: 'Alpha', seed: 7 });
  await sendText(page, 'I look around');
  await page.evaluate(() => Game.App.quitToTitle());
  const was = await page.evaluate(() => ({ id: Game.Storage.gameId(Game.state), auto: localStorage.getItem('novatria.autosave') }));
  await openDraft(page);
  await testTab(page);
  await page.click('#creator-test-start');
  await page.waitForSelector('#ask:not([hidden])');
  assert.equal(await page.textContent('#ask-title'), 'Replace the autosave?');
  assert.match(await page.textContent('#ask-text'), /^Alpha · Day 1 · .* is only in the autosave, not in a save slot\. A test of Low Water takes its place\./);
  await page.click('#ask-no');
  await page.waitForSelector('#ask', { state: 'hidden' });
  const kept = await page.evaluate(() => ({ id: Game.Storage.gameId(Game.state), auto: localStorage.getItem('novatria.autosave'), screen: Game.UI.screen, src: Game.state.meta.packSource }));
  assert.deepEqual(kept, { id: was.id, auto: was.auto, screen: 'creator', src: undefined }, 'Keep it: nothing changed');
  // Go ahead: the test game, and Alpha becomes the previous autosave.
  await page.click('#creator-test-start');
  await page.waitForSelector('#ask:not([hidden])');
  await page.click('#ask-yes');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => Game.state.meta.packSource), 'draft');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave.prev')).state.player.name), 'Alpha');
  // Back, and a second test: no question (the autosave is a test game), the first test game goes to the previous autosave.
  const first = await page.evaluate(() => Game.Storage.gameId(Game.state));
  await page.click('#test-bar-back');
  await page.waitForSelector('#creator-test-panel');
  await page.click('#creator-test-start');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.isHidden('#ask'), true);
  assert.notEqual(await page.evaluate(() => Game.Storage.gameId(Game.state)), first);
  assert.equal(await page.evaluate(() => Game.Storage.gameId(JSON.parse(localStorage.getItem('novatria.autosave.prev')).state)), first);
});

s.test('after a test game, editing the draft and then Continue (after a reload) still plays the earlier version (rules.dcs.hard from the frozen store), and the test bar shows again', async h => {
  const page = await open(h);
  const draftId = await openDraft(page);
  // The header's Test, with nothing picked: the same as the tab's Start.
  await page.click('#creator-test');
  await page.waitForSelector('#screen-game.active');
  const old = await page.evaluate(() => Game.Pack.get('rules.dcs.hard'));
  const hash = await page.evaluate(() => Game.state.meta.packHash);
  await page.click('#test-bar-back');
  await page.waitForSelector('#screen-creator.active #creator-editor:not([hidden])');
  await page.evaluate(v => { Game.Creator.Editor.set('rules.dcs.hard', v); Game.Creator.Editor.saveNow(); }, old + 2);
  assert.equal(await page.evaluate(id => Game.Storage.Drafts.get(id).pack.rules.dcs.hard, draftId), old + 2);
  await settle(page);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  assert.equal(await page.evaluate(id => Game.Storage.Drafts.get(id).pack.rules.dcs.hard, draftId), old + 2, 'the edit was kept');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  const g = await page.evaluate(() => ({ hard: Game.Pack.get('rules.dcs.hard'), hash: Game.Pack.hash(Game.State.pack), src: Game.state.meta.packSource, bar: !document.getElementById('test-bar').hidden, text: document.getElementById('test-bar-text').textContent }));
  assert.deepEqual(g, { hard: old, hash, src: 'draft', bar: true, text: 'Testing: Low Water' });
  await sendText(page, 'I wait a while');
  assert.equal(await page.evaluate(() => Game.Pack.get('rules.dcs.hard')), old, 'still the earlier version after a turn');
  // Its Back to the editor opens the draft as it is now.
  await page.click('#test-bar-back');
  await page.waitForSelector('#screen-creator.active #creator-test-panel');
  assert.equal(await page.evaluate(() => Game.Creator.state.draft.rules.dcs.hard), old + 2);
});

s.test('a normal New game\'s meta has no packSource or draftId and shows no test bar; Settings\' Quit reads "Quit to title" there and "Back to the editor" in a test game, where it returns to the editor', async h => {
  const page = await open(h);
  await quickStart(page);
  const n = await page.evaluate(() => ({ keys: Object.keys(Game.state.meta).filter(k => k === 'packSource' || k === 'draftId'), bar: document.getElementById('test-bar').hidden }));
  assert.deepEqual(n, { keys: [], bar: true });
  await page.click('#tb-settings');
  await page.waitForSelector('#screen-settings.active');
  assert.equal(await page.textContent('#settings-quit'), 'Quit to title');
  await page.click('#settings-quit');
  await page.waitForFunction(() => Game.UI.screen === 'title');
  // A test game.
  const draftId = await openDraft(page);
  const before = await draftJson(page, draftId);
  await testTab(page);
  await page.click('#creator-test-start');
  await page.waitForSelector('#ask:not([hidden])');
  await page.click('#ask-yes');
  await page.waitForSelector('#screen-game.active');
  await page.click('#tb-settings');
  await page.waitForSelector('#screen-settings.active');
  assert.equal(await page.textContent('#settings-quit'), 'Back to the editor');
  await page.click('#settings-quit');
  await page.waitForSelector('#screen-creator.active #creator-test-panel');
  assert.deepEqual(await page.evaluate(() => [Game.Creator.state.draftId, Game.App.inGame()]), [draftId, false]);
  assert.equal(await draftJson(page, draftId), before);
  // A draft deleted since: the Library, and a toast.
  await page.click('#creator-test-start');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(id => { Game.Creator.showLibrary(); Game.Storage.Drafts.remove(id); Game.UI.showScreen('game'); }, draftId);
  await page.click('#test-bar-back');
  assert.equal(await toast(page), 'That draft is not on this device any more.');
  assert.deepEqual(await page.evaluate(() => [Game.UI.screen, Game.Creator.state.view]), ['creator', 'library']);
});

s.test('the Test tab and the game\'s test bar pass the mobile audit at 375 and 390; screenshots at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openDraft(page);
    await testTab(page);
    let a = await page.evaluate(audit, [`test tab ${vp.width}`, null]);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    // With an error: the note and Show the problems.
    await page.evaluate(() => { const ex = Game.Creator.state.draft.world.locations[0].exits; Game.Creator.Editor.set('world.locations[0].exits', ex.concat(['loc_nowhere'])); });
    await testTab(page);
    a = await page.evaluate(audit, [`test tab blocked ${vp.width}`, null]);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await page.evaluate(() => Game.Creator.Editor.undo());
    await testTab(page);
    await page.click('#creator-test-start');
    await page.waitForSelector('#screen-game.active');
    a = await page.evaluate(audit, [`test bar ${vp.width}`, '#test-bar']);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    assert.ok(await page.isVisible('#test-bar-back'));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openDraft(page);
      await testTab(page);
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `test-tab-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => { const ex = Game.Creator.state.draft.world.locations[0].exits; Game.Creator.Editor.set('world.locations[0].exits', ex.concat(['loc_nowhere'])); });
      await testTab(page);
      await shot(page, `test-tab-blocked-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => Game.Creator.Editor.undo());
      await testTab(page);
      await page.click('#creator-test-start');
      await page.waitForSelector('#screen-game.active');
      await sendText(page, 'I look around');
      await shot(page, `test-game-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
