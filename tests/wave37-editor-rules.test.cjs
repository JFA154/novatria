'use strict';
/* Wave 37, Creator Mode, milestone 6 (task M6-B): the editor's Rules and
   Freedom tabs (plan "Pack format v1", the rules and freedom blocks;
   milestone 4 for what each dial does; decision L for the look). Rules is
   grouped cards of fields and switches, each control at its data-path and
   writing through Editor.set; an emptied field takes its key away and the
   default (Pack.DEFAULTS) is its placeholder; the validator's words show
   under a field; the typed rows (floors.lie, time.costs) add and remove;
   the intimacy roll's stat select names the stats as the story does.
   Freedom is the preset as three cards and the dials, each showing
   Pack.freedom(draft)'s effective value, a chip "overrides the preset"
   beside a dial the story sets, Follow the preset taking those away, and
   create.people disabled. What the tabs write is what the engine reads:
   under Pack.setPreview(draft), Dice.target, Commands.allowed and
   Pack.freedom follow. Both tabs pass the mobile audit at 375 and 390, and
   screenshots of Rules (at Romance) and Freedom at 390x844 and 1280x800 in
   the Dark and Parchment themes go to $UI_SHOTS when it names a folder.
   Run with: node tests/run.cjs wave37-editor-rules */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('wave37-editor-rules');
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
/* A copy of the built-in story opened in the editor straight from Storage.Drafts (its own id, so no player layer applies). */
async function openDraft(page) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  const id = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'rules-copy';
    p.meta.title = 'Rules Copy';
    const dr = Game.Storage.Drafts.put({ pack: p });
    Game.Creator.openEditor(dr.id);
    return dr.id;
  });
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  return id;
}
async function tab(page, id) {
  await page.click(`#creator-tab-${id}`);
  await page.waitForSelector(`#creator-body[data-tab="${id}"]`);
}
const at = p => `#creator-body [data-path="${p}"]`;
const draft = page => page.evaluate(() => Game.Creator.state.draft);
const getPath = (page, p) => page.evaluate(q => {
  let o = Game.Creator.state.draft;
  for (const k of q.split('.')) { if (o === null || typeof o !== 'object') return undefined; o = o[k]; }
  return o;
}, p);
// A number field as a person types it: the value, then the change that leaving the field fires.
async function typeNumber(page, p, value) {
  await page.fill(at(p), String(value));
  await page.$eval(at(p), e => e.dispatchEvent(new Event('change', { bubbles: true })));
}
const errUnder = (page, p) => page.$eval(`#creator-body .cr-err[data-err-for="${p}"]`, e => e.textContent);

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider
   than the screen (a strip or grid that scrolls sideways on purpose is scrolled, not wide). */
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

s.test('both tabs draw for a copy of the built-in story: Rules has its thirteen cards in order with controls at rules.dcs.hard, rules.hp.start, rules.romance.intimacyRoll.stat and rules.cheats.allowed, Freedom has freedom.preset and freedom.travel, and every control carries a data-path', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'rules');
  const rules = await page.evaluate(() => ({
    titles: [...document.querySelectorAll('#creator-body > .cr-section > .cr-section-title')].map(x => x.textContent),
    notes: [...document.querySelectorAll('#creator-body > .cr-section')].every(sec => { const n = sec.querySelector(':scope > .cr-note'); return !!(n && n.textContent.trim()); }),
    unpathed: [...document.querySelectorAll('#creator-body input, #creator-body select, #creator-body textarea')].filter(c => !c.dataset.path && !c.closest('[data-path]') && !/-add/.test(c.id)).map(c => c.id)
  }));
  assert.deepEqual(rules.titles, ['When to roll', 'Difficulty numbers', 'Floors', 'Health', 'Dying and dice', 'Story points', 'Time', 'Prices', 'The law', 'Cheats and undo', 'Romance', 'Cards', 'Narration']);
  assert.ok(rules.notes, 'each card has its one line under the heading');
  assert.deepEqual(rules.unpathed, [], 'every control is at a path (the Add rows feed a list that is)');
  for (const p of ['rules.dcs.hard', 'rules.hp.start', 'rules.romance.intimacyRoll.stat', 'rules.cheats.allowed', 'rules.floors.lie', 'rules.time.costs', 'rules.hp.damage.failure', 'rules.rolls.always']) {
    assert.ok(await page.$(at(p)), `a control at ${p}`);
  }
  // The action chips offer the parser's action types only, as a select to add from.
  const offered = await page.$$eval(`${at('rules.rolls.always')} select option`, os => os.map(o => o.value).filter(Boolean));
  assert.deepEqual(offered, await page.evaluate(() => Game.Api.PARSE_TYPES.slice()));
  // The law's money says the story's currency.
  assert.match(await page.textContent('#cr-f-rules-law-fine-label'), /in dollars/);
  assert.match(await page.textContent('#cr-f-rules-law-fine-help'), /\$50/);
  await tab(page, 'freedom');
  for (const p of ['freedom.preset', 'freedom.travel', 'freedom.steer', 'freedom.create.places', 'freedom.scopeRefusal.on', 'freedom.scopeRefusal.reason', 'freedom.skipAnywhere', 'freedom.create.perGame']) {
    assert.ok(await page.$(at(p)), `a control at ${p}`);
  }
  assert.equal(await page.$$eval('.cr-radio-card', x => x.length), 3);
  // The three descriptions are what FREEDOM_PRESETS sets.
  const desc = await page.$$eval('.cr-radio-card', cs => cs.map(c => [c.dataset.preset, c.querySelector('.cr-radio-desc').textContent]));
  assert.match(desc[0][1], /add places and things.*to any place.*nothing steers/);
  assert.match(desc[2][1], /Nothing new is added.*only to the story's own places.*brought toward.*refused.*\/skip only passes time/);
});

s.test('rules.dcs.hard: 17 writes the path and Dice.target(\'hard\') is 17 under a preview of the draft; 12.5 shows the validator\'s whole-number error under the field, as does "abc" from a file; emptying it takes the key away and the placeholder says 15', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'rules');
  assert.equal(await page.getAttribute(at('rules.dcs.hard'), 'placeholder'), '15');
  await typeNumber(page, 'rules.dcs.hard', 17);
  assert.equal(await getPath(page, 'rules.dcs.hard'), 17);
  const t = await page.evaluate(() => {
    const before = Game.Dice.target('hard');
    Game.Pack.setPreview(Game.Creator.state.draft);
    const during = Game.Dice.target('hard');
    Game.Pack.setPreview(null);
    return { before, during, after: Game.Dice.target('hard') };
  });
  assert.deepEqual(t, { before: 15, during: 17, after: 15 });
  // The floors' choices show the story's numbers.
  assert.equal(await page.$eval(`${at('rules.floors.ask')} option[value="hard"]`, o => o.textContent), 'hard (17)', 'the difficulty choices follow the story\'s numbers at once');

  await typeNumber(page, 'rules.dcs.hard', 12.5);
  assert.equal(await getPath(page, 'rules.dcs.hard'), 12.5);
  await page.evaluate(() => Game.Creator.Editor.check());
  assert.match(await errUnder(page, 'rules.dcs.hard'), /whole number/);
  assert.equal(await page.getAttribute(at('rules.dcs.hard'), 'aria-invalid'), 'true');
  await page.evaluate(() => { Game.Creator.Editor.set('rules.dcs.easy', 'abc'); Game.Creator.Editor.check(); });
  assert.match(await errUnder(page, 'rules.dcs.easy'), /whole number, not string/);
  assert.equal(await page.$eval('#creator-tab-rules', b => b.dataset.count), '2', 'the tab counts its errors');

  await typeNumber(page, 'rules.dcs.hard', '');
  const dcs = await getPath(page, 'rules.dcs');
  assert.equal(Object.prototype.hasOwnProperty.call(dcs, 'hard'), false, 'the key is gone');
  assert.equal(await page.inputValue(at('rules.dcs.hard')), '');
  assert.equal(await page.getAttribute(at('rules.dcs.hard'), 'placeholder'), '15');
  await page.evaluate(() => Game.Creator.Editor.check());
  assert.equal(await errUnder(page, 'rules.dcs.hard'), '');
});

s.test('the typed rows: adding a lie floor of -30 at very hard writes [-30, "very_hard"] after the engine\'s two rows (the list becomes the story\'s own; Use the default takes it away again), and adding look at instant to time.costs writes { look: "instant" }; Remove takes a cost row away and the key with the last one', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'rules');
  assert.equal(await page.$$eval(`${at('rules.floors.lie')} .cr-maprow:not(.cr-maphead)`, r => r.length), 2, 'the engine\'s two rows show');
  await page.fill('#cr-f-rules-floors-lie-add', '-30');
  await page.selectOption('#cr-f-rules-floors-lie-add-d', 'very_hard');
  await page.click('[data-action="add-lie"]');
  assert.deepEqual(await getPath(page, 'rules.floors.lie'), [[-25, 'hard'], [-50, 'very_hard'], [-30, 'very_hard']]);
  assert.deepEqual((await getPath(page, 'rules.floors.lie')).at(-1), [-30, 'very_hard']);
  assert.equal(await page.$$eval(`${at('rules.floors.lie')} .cr-maprow:not(.cr-maphead)`, r => r.length), 3);
  // A row's difficulty changes in place.
  await page.selectOption(at('rules.floors.lie[0][1]'), 'normal');
  assert.deepEqual((await getPath(page, 'rules.floors.lie'))[0], [-25, 'normal']);
  await page.click('[data-action="lie-default"]');
  assert.equal(await getPath(page, 'rules.floors.lie'), undefined);
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undo()), true);
  assert.equal((await getPath(page, 'rules.floors.lie')).length, 3, 'one Undo brings the rows back');

  await page.selectOption('#cr-f-rules-time-costs-add', 'look');
  await page.selectOption('#cr-f-rules-time-costs-add-cost', 'instant');
  await page.click('[data-action="add-cost"]');
  assert.deepEqual(await getPath(page, 'rules.time.costs'), { look: 'instant' });
  await page.selectOption(at('rules.time.costs.look'), 'short');
  assert.deepEqual(await getPath(page, 'rules.time.costs'), { look: 'short' });
  assert.equal(await page.$eval('#cr-f-rules-time-costs-add', s => [...s.options].some(o => o.value === 'look')), false, 'a listed action is not offered again');
  await page.click('[data-action="remove-cost"][data-key="look"]');
  assert.equal(await getPath(page, 'rules.time.costs'), undefined);
  const v = await page.evaluate(() => Game.Pack.validate(Game.Creator.state.draft, { profile: 'play' }).filter(p => /^rules/.test(p.path)));
  assert.deepEqual(v, []);
});

s.test('cheats.allowed off writes false and Commands.allowed(\'/cheat\') is false under a preview of the draft (no player override, developer mode off); on again it is true', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'rules');
  assert.equal(await page.isChecked(at('rules.cheats.allowed')), true, 'the default shows: on');
  await page.click('#cr-f-rules-cheats-allowed-label');
  assert.equal(await getPath(page, 'rules.cheats.allowed'), false);
  const r = await page.evaluate(() => {
    const o = Game.Storage.perPack('rules-copy').overrides;
    Game.Pack.setPreview(Game.Creator.state.draft);
    const off = { cheat: Game.Commands.allowed('/cheat'), reroll: Game.Commands.allowed('/reroll'), look: Game.Commands.allowed('/look') };
    Game.Pack.setPreview(null);
    return { o, dev: Game.Storage.settings().developerMode === true, off, live: Game.Commands.allowed('/cheat') };
  });
  assert.deepEqual(r.o, {}, 'no override for this story');
  assert.equal(r.dev, false);
  assert.deepEqual(r.off, { cheat: false, reroll: false, look: true });
  assert.equal(r.live, true, 'the built-in story still has them');
  await page.click('#cr-f-rules-cheats-allowed-label');
  assert.equal(await getPath(page, 'rules.cheats.allowed'), true);
  assert.equal(await page.evaluate(() => { Game.Pack.setPreview(Game.Creator.state.draft); const a = Game.Commands.allowed('/cheat'); Game.Pack.setPreview(null); return a; }), true);
});

s.test('the intimacy roll\'s stat select names the stats as the story does: "Charm" for the built-in story, "Nerve (charm)" once player.stats.charm.label is Nerve; choosing wits writes the path', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'rules');
  const texts = () => page.$$eval(`${at('rules.romance.intimacyRoll.stat')} option`, os => os.map(o => [o.value, o.textContent]));
  const before = await texts();
  assert.deepEqual(before.find(x => x[0] === 'charm'), ['charm', 'Charm']);
  assert.match(before[0][1], /^Default: Charm$/, 'the blank choice names the default by the story\'s word');
  await page.evaluate(() => Game.Creator.Editor.set('player.stats.charm.label', 'Nerve'));
  await tab(page, 'player');
  await tab(page, 'rules');
  const after = await texts();
  assert.deepEqual(after.find(x => x[0] === 'charm'), ['charm', 'Nerve (charm)']);
  assert.match(after[0][1], /Nerve/);
  await page.selectOption(at('rules.romance.intimacyRoll.stat'), 'wits');
  assert.equal(await getPath(page, 'rules.romance.intimacyRoll.stat'), 'wits');
  await page.selectOption(at('rules.romance.intimacyRoll.stat'), '');
  assert.equal((await getPath(page, 'rules.romance.intimacyRoll') || {}).stat, undefined, 'the blank choice takes the key away');
});

s.test('Freedom: choosing rails writes freedom.preset and the dials show listed, steer and scope refusal on as the effective values with no override chip; travel anywhere then shows the chip and Pack.freedom(draft).travel is anywhere; Follow the preset takes it away in one Undo; create.people is off and disabled', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'freedom');
  assert.equal(await page.isChecked('input[name="cr-freedom-preset"][value="sandbox"]'), true, 'not set: the sandbox shows');
  assert.equal(await page.isDisabled('[data-action="follow-preset"]'), true);
  await page.click('.cr-radio-card[data-preset="rails"]');
  assert.equal(await getPath(page, 'freedom.preset'), 'rails');
  await page.waitForSelector('.cr-radio-card[data-preset="rails"][data-on="1"]');
  const dials = await page.evaluate(() => {
    const f = p => document.querySelector(`#creator-body .cr-field[data-field="${p}"]`);
    const sel = p => document.querySelector(`#creator-body [data-path="${p}"]`);
    return {
      travel: [f('freedom.travel').dataset.effective, f('freedom.travel').dataset.layer, sel('freedom.travel').value, sel('freedom.travel').selectedOptions[0].textContent],
      steer: [f('freedom.steer').dataset.effective, sel('freedom.steer').selectedOptions[0].textContent],
      scope: [f('freedom.scopeRefusal.on').dataset.effective, sel('freedom.scopeRefusal.on').checked],
      places: sel('freedom.create.places').checked,
      skip: sel('freedom.skipAnywhere').checked,
      chips: document.querySelectorAll('#creator-body .cr-override').length,
      eff: Game.Pack.freedom(Game.Creator.state.draft)
    };
  });
  assert.deepEqual(dials.travel, ['listed', 'preset', '', 'The preset\'s: listed']);
  assert.deepEqual(dials.steer, ['steer', 'The preset\'s: steer']);
  assert.deepEqual(dials.scope, ['true', true]);
  assert.equal(dials.places, false);
  assert.equal(dials.skip, false);
  assert.equal(dials.chips, 0, 'no override chips');
  assert.equal(dials.eff.travel, 'listed');

  await page.selectOption(at('freedom.travel'), 'anywhere');
  assert.equal(await getPath(page, 'freedom.travel'), 'anywhere');
  await page.waitForSelector('#creator-body .cr-field[data-field="freedom.travel"] .cr-override');
  assert.equal(await page.$$eval('#creator-body .cr-override', x => x.length), 1);
  assert.equal(await page.evaluate(() => Game.Pack.freedom(Game.Creator.state.draft).travel), 'anywhere');
  assert.equal(await page.$eval('#creator-body .cr-field[data-field="freedom.travel"]', f => f.dataset.layer), 'pack');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.path), 'freedom.travel', 'the focus stays on the dial');
  // A switch the story sets carries the chip too.
  await page.click('#cr-f-freedom-skipAnywhere-label');
  assert.equal(await getPath(page, 'freedom.skipAnywhere'), true);
  assert.equal(await page.$$eval('#creator-body .cr-override', x => x.length), 2);

  const depth = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  await page.click('[data-action="follow-preset"]');
  assert.deepEqual(await getPath(page, 'freedom'), { preset: 'rails' });
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), depth + 1, 'one Undo');
  assert.equal(await page.$$eval('#creator-body .cr-override', x => x.length), 0);
  assert.equal(await page.evaluate(() => Game.Pack.freedom(Game.Creator.state.draft).travel), 'listed');
  await page.evaluate(() => Game.Creator.Editor.undo());
  assert.equal(await getPath(page, 'freedom.travel'), 'anywhere');

  assert.equal(await page.isDisabled(at('freedom.create.people')), true);
  assert.equal(await page.isChecked(at('freedom.create.people')), false);
  assert.match(await page.textContent('#cr-f-freedom-create-people-help'), /not supported yet/i);
  // The reason's placeholder is the engine's default reason.
  assert.equal(await page.getAttribute(at('freedom.scopeRefusal.reason'), 'placeholder'), 'That is outside this story.');
});

s.test('the Rules and Freedom tabs pass the mobile audit at 375 and 390 (44px targets, 16px inputs, nothing wider than the screen)', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openDraft(page);
    await tab(page, 'rules');
    // A story's own lie rows and a time cost, so the typed rows are drawn too.
    await page.evaluate(() => { Game.Creator.Editor.set('rules.time.costs', { look: 'instant', search: 'long' }); Game.Creator.selectTab('rules'); });
    let a = await page.evaluate(audit, `rules ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await tab(page, 'freedom');
    await page.click('.cr-radio-card[data-preset="guided"]');
    await page.selectOption(at('freedom.steer'), 'steer');
    a = await page.evaluate(audit, `freedom ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    const cardH = await page.$$eval('.cr-radio-card', cs => cs.map(c => c.getBoundingClientRect().height));
    assert.ok(cardH.every(x => x >= 44), 'each preset card is a full tap target: ' + cardH);
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openDraft(page);
      await tab(page, 'rules');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-rules-top-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.querySelector('#creator-body [data-section="rules.romance"]').scrollIntoView({ block: 'start' }));
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop -= 90; });
      await shot(page, `creator-rules-romance-${vp.width}x${vp.height}-${theme}`);
      await tab(page, 'freedom');
      await page.click('.cr-radio-card[data-preset="guided"]');
      await page.selectOption(at('freedom.steer'), 'steer');
      await page.evaluate(() => { document.activeElement.blur(); document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-freedom-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.querySelector('#creator-body [data-section="freedom.travel"]').scrollIntoView({ block: 'start' }));
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop -= 90; });
      await shot(page, `creator-freedom-dials-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
