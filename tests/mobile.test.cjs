'use strict';
/* SPEC.md section 11, mobile rules, on two phone sizes (375x740 and 390x844):
   on every screen (title, each creation step and the summary, the game, the
   autocomplete list, the menu, each sheet tab, an open person card and its
   editor, the debug tab, settings, saves,
   a warning banner, the "New" button) every button, tab, select, text field
   and tappable label is at least 44px each way, text fields use 16px or more
   (so iOS does not zoom), and nothing is wider than the screen (the Do / Say
   toggle and the Say chips included). The CSS uses
   the safe-area insets where the screen edges are.
   Run with: node tests/run.cjs mobile */
const assert = require('assert/strict');
const { suite, sendText } = require('./helpers.cjs');

const s = suite('mobile');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];

/* In the page: everything on screen that breaks a mobile rule. */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  const targets = [...document.querySelectorAll(TAP)].filter(vis);
  const small = targets.map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...document.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${x[0]} ${x[1]}px`);
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
  }
  for (const el of document.querySelectorAll('.page, .feed-scroll, .panel-body, .ac, .popover')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) wide.push('scrolls sideways: ' + (el.id || el.className));
  if (document.documentElement.scrollWidth > W) wide.push('document ' + document.documentElement.scrollWidth);
  return { label, checked: targets.length, small, fonts, wide: wide.slice(0, 10) };
}

for (const size of SIZES) {
  s.test(`${size.width}x${size.height}: 44px tap targets, 16px+ inputs and nothing wider than the screen on every screen`, async h => {
    const page = await h.open({ viewport: size });
    const results = [];
    const check = async label => { results.push(await page.evaluate(audit, label)); };
    await check('title');
    await page.click('#btn-new');
    await check('creation: name');
    await page.fill('#cr-name', 'Ilse');
    await page.click('#cr-next');
    await check('creation: background');
    await page.click('.bg-choice >> nth=1');
    assert.ok(await page.isVisible('#cr-age'), 'the age sits with the background');
    await check('creation: background picked, with its age');
    await page.click('#cr-next');
    await check('creation: stats');
    await page.selectOption('#cr-move-from', await page.evaluate(() => [...document.querySelectorAll('#cr-move-from option')].find(o => o.value && !o.disabled).value));
    await check('creation: stats, moving a point');
    await page.click('#cr-next');
    await check('creation: goal');
    await page.fill('#cr-goal', 'Find my brother');
    await page.click('#cr-next');
    await check('creation: flaw');
    await page.click('.flaw-choice >> nth=0');
    await page.click('#cr-next');
    await check('creation: loose ends, none picked');
    for (const k of ['debt', 'lost', 'promise']) await page.click(`.le-toggle[data-kind="${k}"]`);
    await check('creation: loose ends, three picked');
    await page.click('#cr-next');
    await page.waitForSelector('#create-summary-view:not([hidden])');
    await check('creation: summary');
    await page.click('#cr-begin');
    await page.waitForSelector('#screen-game.active');
    await page.evaluate(() => { Game.Api.Mock.delay = 0; });
    await sendText(page, 'I look around at the pumps, the board out front and the road out of town');
    await check('game');
    await page.click('#mode-say');
    await check('game: Say mode and its chips');
    await sendText(page, 'Anybody around here hiring?');
    await check('game: a Say line in the feed');
    await page.click('#mode-do');
    await page.focus('#cmd');
    await page.keyboard.type('/');
    await page.waitForSelector('#ac:not([hidden])');
    await check('game: command list');
    await page.keyboard.press('Escape');
    await page.fill('#cmd', '');
    await page.click('#tb-menu');
    await check('game: menu');
    await page.click('#tb-menu');
    for (const tab of ['character', 'people', 'journal', 'places']) {
      await page.click(`[data-open-tab="${tab}"]`);
      await page.waitForTimeout(300);
      await check('sheet: ' + tab);
      await page.click('#panel-close');
      await page.waitForTimeout(300);
    }
    // People: someone met, their card open (the pronoun chips and Edit), then their card in edit mode through /edit,
    // with a new memory line and the hidden goal and secret open: every control a tap tall, 16px fields, nothing wider than the screen.
    const who = await page.evaluate(() => {
      const n = Game.State.npcsAt(Game.state.player.locationId)[0] || Game.state.npcs[0];
      Game.State.apply({ npcKnownToPlayer: [n.id], newMemories: [{ npcId: n.id, text: 'Ilse asked who was hiring around here', weight: 2 }] });
      return { id: n.id, name: n.name };
    });
    await page.click('[data-open-tab="people"]');
    await page.waitForTimeout(300);
    await page.click(`#phead-${who.id}`);
    await page.waitForTimeout(250);
    assert.ok(await page.isVisible(`.pcard[data-npc="${who.id}"] .pcard-edit`));
    await check('sheet: people, a card open');
    await page.click('#panel-close');
    await page.waitForTimeout(300);
    await sendText(page, `/edit ${who.name}`);
    await page.waitForTimeout(300);
    assert.ok(await page.isVisible(`.pcard[data-npc="${who.id}"] .pedit`), '/edit opens the sheet with the editor');
    await page.click('.pedit-add');
    await page.click('.pedit-hidden > summary');
    await page.selectOption(`#pe-relTo-${who.id}`, await page.evaluate(id => Game.state.npcs.find(n => n.id !== id).id, who.id));
    assert.ok(await page.evaluate(() => { const b = document.getElementById('panel-body'); return b.scrollHeight > b.clientHeight; }), 'the form scrolls inside the sheet');
    await check('sheet: people, the editor');
    await page.press(`#pe-name-${who.id}`, 'Escape');
    assert.equal(await page.evaluate(() => Game.UI.editing), null);
    await page.click('#panel-close');
    await page.waitForTimeout(300);
    // The longer cards: someone who lives elsewhere (where, how to reach them, ties, history), then the
    // Places sheet with the place here open and one out of town open.
    const far = await page.evaluate(() => {
      const n = Game.state.npcs.filter(x => Game.presenceOf(x) === 'away' && x.history).sort((a, b) => (b.where + b.reach + b.history).length - (a.where + a.reach + a.history).length)[0];
      Game.State.apply({ npcKnownToPlayer: [n.id] });
      return n.id;
    });
    await page.click('[data-open-tab="people"]');
    await page.waitForTimeout(300);
    await page.click(`#phead-${far}`);
    await page.waitForTimeout(250);
    assert.ok(await page.isVisible(`.pcard[data-npc="${far}"] .pcard-facts`), 'the card shows where they live and their history');
    await check('sheet: people, a card from Elsewhere open');
    await page.click('#panel-close');
    await page.waitForTimeout(300);
    await page.click('[data-open-tab="places"]');
    await page.waitForTimeout(300);
    const spot = await page.evaluate(() => Game.state.player.locationId);
    await page.click(`#plhead-${spot}`);
    await page.waitForTimeout(250);
    assert.ok(await page.isVisible(`.plcard[data-loc="${spot}"] .plcard-facts`), 'the place sheet has its rows');
    await check('sheet: places, the place here open');
    const out = await page.evaluate(() => document.querySelector('.place-list[data-list="away"] .plcard').dataset.loc);
    await page.click(`#plhead-${out}`);
    await page.waitForTimeout(250);
    assert.ok(await page.isVisible(`.plcard[data-loc="${out}"] .plcard-facts`));
    await check('sheet: places, a place out of town open');
    await page.click('#panel-close');
    await page.waitForTimeout(300);
    await sendText(page, '/debug');
    await page.waitForTimeout(300);
    await check('sheet: debug');
    await page.click('#panel-close');
    await page.waitForTimeout(300);
    // The "New" button, shown when the reader has scrolled up.
    await page.evaluate(() => { for (let i = 0; i < 30; i++) Game.UI.feed.notice('Filler line ' + i); const f = document.getElementById('feed-scroll'); f.scrollTop = 0; f.dispatchEvent(new Event('scroll')); Game.UI.feed.notice('Something new'); });
    assert.ok(await page.isVisible('#new-btn'));
    await check('game: New button');
    await page.click('#new-btn');
    await page.evaluate(() => Game.UI.warn('Saving failed: this is a test warning that is long enough to wrap onto two lines on a phone.'));
    await check('game: warning banner');
    await page.click('#banner-close');
    await page.click('#tb-menu');
    await page.click('[data-menu="settings"]');
    await check('settings');
    await page.click('#settings-done');
    await page.click('#tb-menu');
    await page.click('[data-menu="saves"]');
    await page.click('#slot-1 [data-action="save"]');
    await check('saves');
    for (const r of results) {
      assert.ok(r.checked > 0, r.label + ': nothing measured');
      assert.deepEqual(r.small, [], `${r.label}: tap targets under 44px`);
      assert.deepEqual(r.fonts, [], `${r.label}: text fields under 16px`);
      assert.deepEqual(r.wide, [], `${r.label}: wider than the screen`);
    }
    console.log(`        ${results.length} screens, ${results.reduce((n, r) => n + r.checked, 0)} tap targets measured`);
  });
}

s.test('the viewport allows the safe areas and the CSS keeps clear of them at every screen edge', async h => {
  const page = await h.open({ viewport: SIZES[0] });
  const r = await page.evaluate(() => {
    const meta = document.querySelector('meta[name=viewport]').content;
    const rules = [];
    for (const sheet of document.styleSheets) { try { for (const rule of sheet.cssRules) rules.push(rule); } catch (e) { /* the font sheet is cross-origin */ } }
    const flat = [];
    // Style rules have a (usually empty) cssRules list too, for nesting.
    const walk = list => { for (const rule of list) { if (rule.selectorText) flat.push(rule); if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules); } };
    walk(rules);
    const css = flat.map(x => x.cssText).join('\n');
    const uses = (sel, prop) => flat.filter(x => x.selectorText === sel).map(x => x.style.getPropertyValue(prop)).join(' ');
    return {
      meta,
      env: ['top', 'right', 'bottom', 'left'].filter(side => css.includes(`env(safe-area-inset-${side}`)),
      topbar: uses('.topbar', 'padding'), composer: uses('.composer', 'padding'), page: uses('.page', 'padding'),
      feed: uses('.feed', 'padding'), panel: uses('.panel', 'padding-top') + ' ' + uses('.panel', 'padding-bottom'), banner: uses('.banner', 'padding'),
      toast: uses('.toast', 'bottom'), popover: uses('.popover', 'top') + ' ' + uses('.popover', 'right')
    };
  });
  assert.match(r.meta, /viewport-fit=cover/);
  assert.match(r.meta, /width=device-width/);
  assert.deepEqual(r.env, ['top', 'right', 'bottom', 'left'], 'all four insets are read');
  assert.match(r.topbar, /--sat/, 'top bar clears the notch');
  assert.match(r.topbar, /--sar/);
  assert.match(r.topbar, /--sal/);
  assert.match(r.composer, /--sab/, 'input bar clears the home indicator');
  assert.match(r.composer, /--sal/);
  assert.match(r.composer, /--sar/);
  for (const side of ['--sat', '--sar', '--sab', '--sal']) assert.match(r.page, new RegExp(side), 'screens: ' + side);
  assert.match(r.feed, /--sar/);
  assert.match(r.feed, /--sal/);
  assert.match(r.panel, /--sat/, 'the sheet clears the notch');
  assert.match(r.panel, /--sab/);
  assert.match(r.banner, /--sat/);
  assert.match(r.toast, /--sab/);
  assert.match(r.popover, /--sat/);
});

s.run();
