'use strict';
/* SPEC.md section 11, mobile rules, on two phone sizes (375x740 and 390x844):
   on every screen (title, each creation step and the summary, the game, the
   autocomplete list, the menu, each sheet tab, an open person card and its
   editor, the debug tab, settings, saves,
   a warning banner, the "New" button) every button, tab, select, text field
   and tappable label (a folding summary too) is at least 44px each way, text fields use 16px or more
   (so iOS does not zoom), and nothing is wider than the screen (the Do / Say
   toggle and the Say chips included). Wave 37, Creator Mode (task M5-E): the
   same audit, on a second page at the same size, covers the Creator screens
   as milestone 5 leaves them: the Library (the built-in card, a Library pack
   from a save and a draft, so every badge and both action rows show), the
   editor shell on a draft of the built-in copy, every tab in
   Game.Creator.TABS (Overview, World, Player, JSON and the tabs that still
   show their coming-soon note), each World sub-tab read from its strip
   (Places, People, Schedules, Factions and Clocks, Threads, Rumours, Events
   and Seeds, Goods; the Schedules grid by place and by person, scrolling
   sideways inside its own box), a person's detail form with its sticky
   bottom bar (and that bar again with the form scrolled), and a faction
   with a clock open (a nested form). Task M6-D adds milestone 6's tabs
   with their states opened as their own suites open them: the Opening with
   a premise typed; the Narrator with its guide unfolded, the style's
   example turns copied in and one open, then the custom style (its guide
   box showing) with a phrase chip added; the Directions with the intimate
   "Show the default" open and a direction typed (its count showing); the
   Rules at the top and scrolled to Romance with a lie floor row and a time
   cost row added; the Freedom rails preset with a travel override (the
   chip showing; the preset cards are tappable labels); the Prompts with a
   1,600-character narrator note (the count red) and the header meter over
   the budget; and the Prompt view of that draft, normal and intimate, with
   its six blocks and their Copy buttons. Task M6-E2 (the reviewer's N10)
   opens every closed <details> in the editor's body before each Creator
   audit and closes them again after it, so what a fold hides (the People
   "More", a clock, a branch, Starting state, More about this) is measured
   too, and with a faction's clock open and the form scrolled half way it
   checks the sticky tab strip meets the top of the scroller and the
   sticky bar its bottom (M2: nothing shows through above or below them),
   and that an effect's op select has a row of its own under 480px (S5).
   The CSS uses the safe-area insets where the screen edges are.
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
  // A folding card's summary is a tappable label too (wave 37, Creator Mode: the editor's More, clocks and branches fold),
  // and so is a Freedom preset card (task M6-D: the whole card is the radio's label, so it is what a thumb taps).
  const TAP = 'details > summary, button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, label.cr-radio-card, .seg label, #ac li, a[href]';
  const targets = [...document.querySelectorAll(TAP)].filter(vis);
  const small = targets.map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...document.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${x[0]} ${x[1]}px`);
  const wide = [];
  // Inside a box that scrolls sideways on purpose (the Say row) and is itself on screen, content is scrolled, not too wide.
  const scrolledInside = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      if (pr.left >= -1 && pr.right <= W + 1) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scrolledInside(el)) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
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
    // First launch with no key: how to play comes first (the Claude choice opens the key field).
    await check('creation: how to play');
    await page.click('#choose-claude');
    await check('creation: how to play, the key field');
    await page.click('#choose-demo');
    await check('creation: name');
    await page.fill('#cr-name', 'Ilse');
    await page.click('#cr-next');
    await check('creation: background');
    await page.click('.bg-choice >> nth=1');
    assert.ok(await page.isVisible('#cr-age'), 'the age sits with the background');
    await check('creation: background picked, with its age');
    await page.click('#cr-next');
    await check('creation: stats');
    await page.click('.step-btn[data-dir="down"]:not([disabled]) >> nth=0');
    await check('creation: stats, moving a point');
    await page.click('.step-btn[data-dir="up"]:not([disabled]) >> nth=0');
    await page.click('#cr-next');
    await check('creation: goal and flaw');
    await page.fill('#cr-goal', 'Find my brother');
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
    for (const tab of ['character', 'people', 'journal', 'objectives', 'places']) {
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
    // Elsewhere is folded away until opened.
    await page.click('.people-group[data-group="elsewhere"] > summary');
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
    // Wave 37, Creator Mode (task M5-E): the Creator screens, on a page of their own at the same size (a fresh
    // context, so its Library and drafts hold only what is put here) whose audits join the same results. What the
    // editor draws is read from the page (Game.Creator.TABS, the World strip's buttons, the first row of a list), so
    // the next milestone's tabs and sub-tabs are audited without this test changing.
    const cr = await h.open({ viewport: size, contextOptions: { reducedMotion: 'reduce' } });
    /* Task M6-E2 (N10): every closed <details> in the editor's body opened first (a few rounds, since an open one
       may hold more) and closed again after the audit, so the steps below still find each fold as they left it. */
    let crOpened = 0;
    const crCheck = async label => {
      crOpened += await cr.evaluate(() => {
        const opened = [];
        for (let k = 0; k < 4; k++) {
          const closed = [...document.querySelectorAll('#creator-body details:not([open])')];
          if (!closed.length) break;
          for (const d of closed) { d.open = true; opened.push(d); }
        }
        window.__crOpened = opened;
        return opened.length;
      });
      results.push(await cr.evaluate(audit, 'creator: ' + label));
      await cr.evaluate(() => { for (const d of (window.__crOpened || []).reverse()) d.open = false; window.__crOpened = []; });
    };
    await cr.evaluate(async () => {
      Game.Api.Mock.delay = 0;
      await Game.Storage.Library.ready;
      await Game.Storage.Drafts.ready;
      // A Library pack from a save, and a draft with a long title, author and premise (the longest card lines).
      const m = Game.Pack.copy(Game.Pack.builtIn());
      m.meta.id = 'marrow-bend';
      m.meta.title = 'Marrow Bend';
      m.meta.author = 'Tester';
      m.meta.rating = 'teen';
      Game.Storage.Library.put(m, { source: 'from-save' });
      const p = Game.Pack.blank('The Long Night at Pittman\'s Crossing');
      p.meta.author = 'A writer with a rather long name';
      p.setting.blurb = 'A truck stop on the interstate where the night shift knows everything and says nothing, until the storm closes the road.';
      Game.Storage.Drafts.put({ pack: p });
    });
    await cr.click('#btn-create');
    await cr.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
    assert.deepEqual(await cr.$$eval('#creator-cards .cr-badge:not(.on)', bs => bs.map(b => b.textContent)), ['Built in', 'From a save', 'Draft'], 'one card of each kind');
    assert.ok(await cr.$$eval('#creator-cards .cr-card', cs => cs.every(c => c.querySelector('.cr-card-actions button') && c.querySelector('.cr-card-more button'))), 'every card has both action rows');
    await crCheck('library');
    await cr.click('#creator-cards .cr-card[data-kind="built-in"] [data-action=open]');
    await cr.waitForSelector('#creator-body [data-path="meta.title"]');
    await crCheck('editor shell (a draft of the built-in copy)');
    const tabs = await cr.evaluate(() => Game.Creator.TABS.map(t => ({ id: t.id, label: t.label, drawn: !!t.render })));
    assert.ok(tabs.length > 0 && tabs.some(t => t.id === 'world'), 'the editor has its tabs');
    for (const tab of tabs) {
      await cr.click('#creator-tab-' + tab.id);
      await cr.waitForSelector(`#creator-body[data-tab="${tab.id}"]`);
      await crCheck(`tab ${tab.label}${tab.drawn ? '' : ' (coming soon)'}`);
      if (tab.id !== 'world') continue;
      // Each part of the world, as its strip lists them; then a person's detail form and a faction with a clock open.
      const subs = await cr.$$eval('#creator-body .cr-subtab', bs => bs.map(b => ({ id: b.id.replace(/^cr-world-/, ''), label: b.firstChild.textContent })));
      assert.ok(subs.length > 0, 'the World tab has its strip');
      const sub = async id => { await cr.click('#cr-world-' + id); await cr.waitForSelector(`#cr-world-body[data-sub="${id}"]`); };
      for (const x of subs) {
        await sub(x.id);
        await crCheck(`World, ${x.label}`);
        if (!(await cr.$('#cr-world-body .cr-grid-scroll'))) continue;
        // The Schedules grid is wider than a phone on purpose and scrolls sideways inside its own box, never the page.
        assert.ok(await cr.evaluate(() => { const g = document.querySelector('#cr-world-body .cr-grid-scroll'); return g.scrollWidth > g.clientWidth && getComputedStyle(g).overflowX === 'auto'; }), 'the Schedules grid scrolls inside itself');
        const other = await cr.$('#cr-world-body .cr-seg button:not([aria-pressed="true"])');
        if (other) { await other.click(); await crCheck(`World, ${x.label}, the other view`); }
      }
      const detail = async (subId, key) => {
        await sub(subId);
        await cr.click(`.cr-entity[data-entity="${key}"] .cr-row >> nth=0`);
        await cr.waitForSelector(`.cr-entity[data-entity="${key}"][data-open="1"]`);
        assert.equal(await cr.isVisible(`.cr-entity[data-entity="${key}"] .cr-entity-list`), false, 'on a phone the detail replaces the list');
        assert.ok(await cr.isVisible(`.cr-entity[data-entity="${key}"] .cr-sticky [data-action="back-bar"]`), 'the sticky bottom bar is there');
      };
      await detail('people', 'people');
      if (await cr.$('.cr-entity[data-entity="people"] .cr-more:not([open]) > summary')) await cr.click('.cr-entity[data-entity="people"] .cr-more:not([open]) > summary');
      await crCheck('World, a person\'s detail form');
      // The bar stays on screen, above the safe area, with the form scrolled half way.
      const bar = await cr.evaluate(() => {
        const sc = document.getElementById('creator-scroll');
        sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
        const r = document.querySelector('.cr-entity[data-entity="people"] .cr-sticky').getBoundingClientRect();
        return { scrolled: sc.scrollTop > 0, top: r.top, bottom: r.bottom, h: window.innerHeight };
      });
      assert.ok(bar.scrolled && bar.top >= 0 && bar.bottom <= bar.h + 1, 'the sticky bar sits at the bottom of the screen: ' + JSON.stringify(bar));
      await crCheck('World, a person\'s detail form scrolled, the sticky bar');
      await cr.click('.cr-entity[data-entity="people"] .cr-sticky [data-action="back-bar"]');
      await cr.waitForSelector('.cr-entity[data-entity="people"][data-open="0"]');
      await detail('factions', 'factions');
      await cr.click('.cr-entity[data-entity="factions"] details.cr-clock >> nth=0 >> summary');
      assert.ok(await cr.$eval('.cr-entity[data-entity="factions"] details.cr-clock', d => d.open), 'the clock is open');
      await crCheck('World, a faction with a clock open');
      /* Task M6-E2 (M2): scrolled half way, the strip's top is the scroller's top and the bar's bottom the scroller's
         bottom, so no field shows through a band above the strip or below the bar (.page's padding used to leave
         24px above and 32px below); the points just inside each edge are the strip's and the bar's own. */
      const bands = await cr.evaluate(() => {
        const sc = document.getElementById('creator-scroll');
        sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
        const s = sc.getBoundingClientRect();
        const strip = document.getElementById('creator-tabs').getBoundingClientRect();
        const bar = document.querySelector('.cr-entity[data-entity="factions"] .cr-sticky').getBoundingClientRect();
        const x = s.left + s.width / 2;
        const top = document.elementFromPoint(x, s.top + 1);
        const bottom = document.elementFromPoint(x, s.bottom - 1);
        return { scrolled: sc.scrollTop > 0, above: Math.round(strip.top - s.top), below: Math.round(s.bottom - bar.bottom),
          topIsStrip: !!(top && top.closest('#creator-tabs')), bottomIsBar: !!(bottom && bottom.closest('.cr-sticky')) };
      });
      assert.deepEqual(bands, { scrolled: true, above: 0, below: 0, topIsStrip: true, bottomIsBar: true }, 'no band above the strip or below the bar');
      await cr.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      // Task M6-E2 (S5): under 480px the op select has a row of its own, as wide as the row inside its padding.
      const op = await cr.$eval('.cr-entity[data-entity="factions"] .cr-fx-op', o => { const r = o.getBoundingClientRect(); const row = o.closest('.cr-fx-row').getBoundingClientRect(); const n = o.closest('.cr-fx-head').querySelector('.cr-fx-n').getBoundingClientRect(); return { below: r.top >= n.bottom - 1, room: Math.round(row.width - r.width) }; });
      assert.ok(op.below && op.room <= 20, 'the op select on its own row: ' + JSON.stringify(op));
      await cr.click('.cr-entity[data-entity="factions"] .cr-sticky [data-action="back-bar"]');
      await cr.waitForSelector('.cr-entity[data-entity="factions"][data-open="0"]');
    }
    // Wave 37, Creator Mode (task M6-D): milestone 6's tabs with what they fold and add opened, as their own suites
    // open them (tests/wave37-editor-narrator, -rules and -prompt-view), since the loop above sees each tab only as it
    // first draws: the custom guide, a phrase chip, an example turn, the intimate default, the typed Rules rows, a
    // Freedom override chip, an over-long narrator note and the Prompt view of that same draft with the meter red.
    const go = async id => { await cr.click('#creator-tab-' + id); await cr.waitForSelector(`#creator-body[data-tab="${id}"]`); };
    const at = p => `#creator-body [data-path="${p}"]`;
    await go('opening');
    await cr.fill(at('opening.premise'), 'The ferry stops running the week you arrive.');
    await crCheck('Opening, a premise typed (its count showing)');
    await go('narrator');
    await cr.click('details[data-disclosure="narration.customGuide"] > summary');
    await cr.click('[data-action="examples-own"]');
    await cr.click('details.cr-example[data-index="0"] > summary');
    await crCheck('Narrator, the guide unfolded, the style\'s examples copied in and one open');
    await cr.selectOption(at('narration.preset'), 'custom');
    await cr.fill('#cr-f-narration-banned-add', 'the river remembers');
    await cr.click('[data-field="narration.banned"] .cr-chip-new .btn');
    if (!(await cr.$eval('details.cr-example[data-index="0"]', d => d.open))) await cr.click('details.cr-example[data-index="0"] > summary');
    assert.ok(await cr.isVisible(at('narration.customGuide')), 'the custom style shows its guide box');
    assert.ok(await cr.$$eval('[data-field="narration.banned"] .cr-chip-text', xs => xs.some(x => x.textContent === 'the river remembers')), 'the phrase is a chip');
    await crCheck('Narrator, the custom style, a phrase chip added and an example open');
    await go('directions');
    await cr.click('details[data-disclosure="directions.intimate"] > summary');
    await cr.fill(at('directions.combat'), 'Short and ugly.');
    assert.equal(await cr.textContent('#cr-f-directions-combat-count'), '15 of 1,500');
    assert.ok(await cr.isVisible('[data-default-for="directions.intimate"]'), 'the intimate default is open');
    await crCheck('Directions, the intimate default open and a direction typed');
    await go('rules');
    await cr.fill('#cr-f-rules-floors-lie-add', '-30');
    await cr.selectOption('#cr-f-rules-floors-lie-add-d', 'very_hard');
    await cr.click('[data-action="add-lie"]');
    await cr.selectOption('#cr-f-rules-time-costs-add', 'look');
    await cr.selectOption('#cr-f-rules-time-costs-add-cost', 'instant');
    await cr.click('[data-action="add-cost"]');
    assert.equal(await cr.$$eval(`${at('rules.floors.lie')} .cr-maprow:not(.cr-maphead)`, r => r.length), 3, 'a lie floor row added');
    assert.ok(await cr.$('[data-action="remove-cost"][data-key="look"]'), 'a time cost row added');
    await cr.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
    await crCheck('Rules, at the top, a lie floor row and a time cost row added');
    await cr.evaluate(() => document.querySelector('#creator-body [data-section="rules.romance"]').scrollIntoView({ block: 'start' }));
    await crCheck('Rules, scrolled to Romance');
    await go('freedom');
    await cr.click('.cr-radio-card[data-preset="rails"]');
    await cr.waitForSelector('.cr-radio-card[data-preset="rails"][data-on="1"]');
    await cr.selectOption(at('freedom.travel'), 'anywhere');
    await cr.waitForSelector('#creator-body .cr-field[data-field="freedom.travel"] .cr-override');
    await crCheck('Freedom, rails with a travel override (the chip showing)');
    // 1,600 characters of short words: over the note's 1,500 cap (the count red) and, as words, over the token budget too.
    await go('prompts');
    await cr.fill(at('prompts.narratorExtra'), 'go '.repeat(534).slice(0, 1600));
    assert.deepEqual(await cr.$eval('#cr-f-prompts-narratorExtra-count', x => [x.textContent, x.dataset.over]), ['1,600 of 1,500', '1']);
    await cr.evaluate(() => Game.Creator.Form.flush());
    await cr.waitForFunction(() => document.getElementById('creator-meter').dataset.over === '1', null, { timeout: 2000 });
    await crCheck('Prompts, a 1,600-character narrator note, and the header meter over the budget');
    await go('preview');
    for (const sit of ['normal', 'intimate']) {
      await cr.selectOption('#creator-preview select', sit);
      await cr.waitForSelector('#creator-preview .cr-pblock[data-part="packet"]');
      assert.equal(await cr.$$eval('#creator-preview .cr-pblock', bs => bs.filter(b => b.querySelector('button')).length), 6, 'six blocks, each with Copy');
      assert.equal(await cr.getAttribute('#creator-preview .cr-preview-meter', 'data-over'), '1');
      await crCheck(`Prompt view, ${sit}, over the budget`);
    }
    for (const r of results) {
      assert.ok(r.checked > 0, r.label + ': nothing measured');
      assert.deepEqual(r.small, [], `${r.label}: tap targets under 44px`);
      assert.deepEqual(r.fonts, [], `${r.label}: text fields under 16px`);
      assert.deepEqual(r.wide, [], `${r.label}: wider than the screen`);
    }
    console.log(`        ${results.length} screens, ${results.reduce((n, r) => n + r.checked, 0)} tap targets measured (${crOpened} folds in the Creator opened first)`);
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
