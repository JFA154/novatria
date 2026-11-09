'use strict';
/* Wave 37, Creator Mode, milestone 6 (task M6-A): the Opening, Narrator,
   Directions and Prompts tabs (plan decisions D, E, H and L; "Pack format
   v1"). Each draws from Pack.SCHEMA through Creator.Form with a data-path
   on every control: the opening's three fields; the narrator's style,
   own guide, point of view, banned and avoided phrases, the five soft
   checks, the example turns (the story's own, or the style's read-only
   with Write your own), the good turn and the five lengths; the twelve
   directions in Pipeline's order with the intimate one first, each with
   the engine default greyed, Use the default and a live count; the three
   prompt notes with their caps and the ENGINE RULES text sent after them.
   What the tabs write reaches the engine through a preview of the draft
   (Pack.setPreview): a banned phrase reaches Style.systemPrompt and
   Style.check, a switched-off "As you" check lets "As you" through, a
   rollFailure direction is a DIRECTION line in Pipeline.directionLines.
   The four tabs pass the mobile audit at 375 and 390, and screenshots of
   the Narrator (Voice and Phrases), Directions (the intimate default open)
   and Prompts tabs at 390x844 and 1280x800 in the Dark and Parchment
   themes go to $UI_SHOTS when it names a folder.
   Run with: node tests/run.cjs wave37-editor-narrator */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('wave37-editor-narrator');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};
// The twelve directions in the order the tab draws them: the intimate scene, then Pipeline's eleven situations.
const DIRECTIONS = ['intimate', 'combat', 'defeat', 'death', 'arrival', 'timeSkip', 'gamble', 'epilogue', 'firstTurn', 'refusedByNpc', 'rollFailure', 'rollCritical'];

async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
/* A copy of the built-in story opened in the editor straight from Storage.Drafts (as the other editor suites do). */
async function openDraft(page) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  const id = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'harbour-copy';
    p.meta.title = 'Harbour Copy';
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
const draft = page => page.evaluate(() => Game.Creator.state.draft);
const flush = page => page.evaluate(() => Game.Creator.Form.flush());
const checkNow = page => page.evaluate(() => Game.Creator.Editor.check().map(p => ({ path: p.path, rule: p.rule, severity: p.severity, message: p.message })));

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider
   than the screen (a strip that scrolls sideways on purpose is scrolled, not wide). */
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

s.test('the four tabs draw for a copy of the built-in story: the opening\'s three fields, the narrator\'s style and lengths, the twelve directions in Pipeline\'s order with the intimate one first, and the three prompt notes, each control with its data-path and none of the coming-soon note', async h => {
  const page = await open(h);
  await openDraft(page);
  const paths = async () => page.$$eval('#creator-body [data-path]', xs => xs.map(x => x.dataset.path));
  const soon = () => page.evaluate(() => document.getElementById('creator-body').textContent.includes(Game.Creator.NEXT_TASK_NOTE));
  await tab(page, 'opening');
  assert.deepEqual(await paths(), ['opening.premise', 'opening.text', 'opening.firstTurn']);
  assert.equal(await soon(), false);
  assert.deepEqual(await page.$$eval('#creator-body .cr-count', xs => xs.map(x => x.textContent)), ['0 of 1,200', '0 of 1,200', '0 of 1,200']);
  await tab(page, 'narrator');
  const n = await paths();
  for (const p of ['narration.preset', 'narration.customGuide', 'narration.pointOfView', 'narration.banned', 'narration.alsoAvoid', 'narration.examples', 'narration.goodTurn',
    'narration.softChecks.simile', 'narration.softChecks.asYou', 'narration.softChecks.inventedPast', 'narration.softChecks.moneyLeak', 'narration.softChecks.repeat',
    'narration.lengths.normal', 'narration.lengths.zoom', 'narration.lengths.intimate', 'narration.lengths.intimateMin', 'narration.lengths.hardOver']) assert.ok(n.includes(p), p);
  assert.deepEqual(await page.$$eval('#creator-body h2', xs => xs.map(x => x.textContent)), ['Voice', 'Phrases', 'Style checks', 'Example turns', 'Good turn', 'Lengths']);
  const nar = await page.evaluate(() => {
    const b = document.getElementById('creator-body');
    const q = s => b.querySelector(s);
    return {
      preset: q('[data-path="narration.preset"]').value,
      blank: q('[data-path="narration.preset"] option[value=""]').textContent,
      guideFolded: !!q('details.cr-disclosure [data-path="narration.customGuide"]') && !q('details[data-disclosure="narration.customGuide"]').open,
      normal: [q('[data-path="narration.lengths.normal"]').value, q('[data-path="narration.lengths.normal"]').placeholder],
      checks: ['simile', 'asYou', 'inventedPast', 'moneyLeak', 'repeat'].map(k => q(`[data-path="narration.softChecks.${k}"]`).checked),
      engineList: [...b.querySelectorAll('[data-default="narration.banned"] .cr-chip-text')].map(x => x.textContent),
      defaults: Game.Pack.DEFAULTS.narration.banned.slice(),
      presetExamples: b.querySelectorAll('.cr-preset-examples .cr-pre').length,
      casualExamples: Game.Pack.DEFAULTS.narration.presets.casual.examples.length
    };
  });
  assert.equal(nar.preset, '', 'the copy sets no style of its own');
  assert.equal(nar.blank, 'The default (casual)');
  assert.equal(nar.guideFolded, true, 'the own guide is folded while the style is not custom');
  assert.deepEqual(nar.normal, ['', '90'], 'an unset length shows the engine\'s number greyed');
  assert.deepEqual(nar.checks, [true, true, true, true, true], 'the soft checks are on by default');
  assert.deepEqual(nar.engineList, nar.defaults, 'the engine\'s banned list, shown while the story has none');
  assert.equal(nar.presetExamples, nar.casualExamples, 'the casual style\'s example turns, read only');
  await tab(page, 'directions');
  assert.deepEqual(await paths(), DIRECTIONS.map(k => `directions.${k}`));
  assert.deepEqual(await page.$$eval('#creator-body .cr-count', xs => xs.map(x => x.textContent)), DIRECTIONS.map(() => '0 of 1,500'));
  assert.equal(await page.textContent('#creator-body [data-trailer="1"]'), await page.evaluate(() => Game.Pipeline.ENGINE_TRAILER));
  await tab(page, 'prompts');
  assert.deepEqual(await paths(), ['prompts.narratorExtra', 'prompts.parserExtra', 'prompts.bookkeeperExtra']);
  assert.deepEqual(await page.$$eval('#creator-body .cr-count', xs => xs.map(x => x.textContent)), ['0 of 1,500', '0 of 600', '0 of 600']);
  assert.equal(await soon(), false);
  assert.deepEqual(h.errors, []);
});

s.test('the Opening tab writes opening.premise, and the Overview shows the same text at the same path', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'opening');
  await page.fill('[data-path="opening.premise"]', 'The ferry stops running the week you arrive.');
  await flush(page);
  assert.equal((await draft(page)).opening.premise, 'The ferry stops running the week you arrive.');
  assert.equal(await page.textContent('#cr-f-opening-premise-count'), '44 of 1,200');
  await tab(page, 'overview');
  assert.equal(await page.inputValue('#creator-body [data-path="opening.premise"]'), 'The ferry stops running the week you arrive.');
});

s.test('choosing the custom style writes narration.preset, opens the guide box (no longer folded) and the guide writes narration.customGuide', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'narrator');
  assert.equal(await page.isVisible('[data-path="narration.customGuide"]'), false, 'folded while the style is casual');
  await page.selectOption('[data-path="narration.preset"]', 'custom');
  assert.equal((await draft(page)).narration.preset, 'custom');
  assert.equal(await page.isVisible('[data-path="narration.customGuide"]'), true);
  assert.equal(await page.$('details[data-disclosure="narration.customGuide"]'), null, 'the custom style shows the box itself');
  assert.equal(await page.getAttribute('.cr-preset-lines li[data-on="1"]', 'data-preset'), 'custom');
  await page.fill('[data-path="narration.customGuide"]', 'Write like a tired river pilot telling it the next morning.');
  await flush(page);
  assert.equal((await draft(page)).narration.customGuide, 'Write like a tired river pilot telling it the next morning.');
  const sys = await page.evaluate(() => { Game.Pack.setPreview(Game.Creator.state.draft); try { return Game.Style.systemPrompt('custom'); } finally { Game.Pack.setPreview(null); } });
  assert.ok(sys.startsWith('Write like a tired river pilot'), 'the guide leads the custom system prompt');
  assert.ok(sys.endsWith(await page.evaluate(() => Game.Style.ENGINE_RULES)), 'and the ENGINE RULES end it');
});

s.test('adding a banned phrase starts the story\'s list from the engine\'s and the phrase reaches Style.systemPrompt and Style.check through a preview of the draft (then the preview is gone)', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'narrator');
  await page.selectOption('[data-path="narration.preset"]', 'custom');
  await page.fill('#cr-f-narration-banned-add', 'the river remembers');
  await page.click('[data-field="narration.banned"] .cr-chip-new .btn');
  const d = await draft(page);
  const engine = await page.evaluate(() => Game.Pack.DEFAULTS.narration.banned.slice());
  assert.deepEqual(d.narration.banned, engine.concat(['the river remembers']), 'none of the engine\'s phrases is lost');
  assert.equal(await page.$('[data-default="narration.banned"]'), null, 'the greyed engine list goes once the story has its own');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cr-f-narration-banned-add', 'the focus stays on the Add field');
  const r = await page.evaluate(() => {
    Game.Pack.setPreview(Game.Creator.state.draft);
    try {
      const sys = Game.Style.systemPrompt('custom');
      const chk = Game.Style.check('The river remembers everything here.', { style: 'custom' });
      return { sys: sys.includes('"the river remembers"'), banned: chk.problems.filter(p => p.type === 'banned').map(p => p.detail) };
    } finally { Game.Pack.setPreview(null); }
  });
  assert.equal(r.sys, true, 'the custom guide\'s BANNED PHRASES line lists it');
  assert.deepEqual(r.banned, ['the river remembers']);
  const after = await page.evaluate(() => Game.Style.check('The river remembers everything here.', { style: 'casual' }).problems.filter(p => p.type === 'banned').length);
  assert.equal(after, 0, 'with the preview gone the built-in story\'s list holds again');
  await page.click('[data-action="banned-default"]');
  assert.equal((await draft(page)).narration.banned, undefined, 'Use the engine\'s list takes the story\'s away');
});

s.test('switching off the "As you" check writes narration.softChecks.asYou false, and a narration opening with "As you" passes Style.check under the preview', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'narrator');
  const text = 'As you step inside, the door bangs shut behind you.';
  const before = await page.evaluate(t => Game.Style.check(t, { style: 'casual' }).problems.map(p => p.type), text);
  assert.ok(before.includes('opening'), 'on by default');
  await page.uncheck('[data-path="narration.softChecks.asYou"]');
  assert.equal((await draft(page)).narration.softChecks.asYou, false);
  const after = await page.evaluate(t => { Game.Pack.setPreview(Game.Creator.state.draft); try { return Game.Style.check(t, { style: 'casual' }).problems.map(p => p.type); } finally { Game.Pack.setPreview(null); } }, text);
  assert.equal(after.includes('opening'), false);
});

s.test('a point of view of first-past writes narration.pointOfView and the validator finds nothing wrong with the narration', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'narrator');
  assert.equal(await page.textContent('[data-path="narration.pointOfView"] option[value=""]'), 'The default (second-present)');
  await page.selectOption('[data-path="narration.pointOfView"]', 'first-past');
  assert.equal((await draft(page)).narration.pointOfView, 'first-past');
  const probs = (await checkNow(page)).filter(p => p.path.startsWith('narration'));
  assert.deepEqual(probs, []);
  assert.equal(await page.textContent('#cr-f-narration-pointOfView-err'), '');
});

s.test('a rollFailure direction is a DIRECTION line with the ENGINE trailer in Pipeline.directionLines under the preview, and Use the default takes it away again (one Undo)', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'directions');
  const words = 'Let the failure sting: a witness, a cost, something lost.';
  assert.equal(await page.isDisabled('#cr-f-directions-rollFailure-default'), true, 'nothing to take away yet');
  await page.fill('[data-path="directions.rollFailure"]', words);
  await flush(page);
  assert.equal((await draft(page)).directions.rollFailure, words);
  assert.equal(await page.textContent('#cr-f-directions-rollFailure-count'), `${words.length} of 1,500`);
  const lines = () => page.evaluate(() => { Game.Pack.setPreview(Game.Creator.state.draft); try { return Game.Pipeline.directionLines({ roll: { tier: 'failure' } }); } finally { Game.Pack.setPreview(null); } });
  assert.deepEqual(await lines(), [`DIRECTION (from the story's author): ${words}`, await page.evaluate(() => Game.Pipeline.ENGINE_TRAILER)]);
  await page.evaluate(() => Game.Creator.Editor.check());
  const depth = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  await page.click('#cr-f-directions-rollFailure-default');
  const d = await draft(page);
  assert.equal(d.directions, undefined, 'the last direction takes the emptied object with it');
  assert.deepEqual(await lines(), []);
  assert.equal(await page.inputValue('[data-path="directions.rollFailure"]'), '');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'directions.rollFailure', 'the focus goes to the box');
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), depth + 1, 'one change');
  await page.evaluate(() => Game.Creator.Editor.undo());
  assert.equal((await draft(page)).directions.rollFailure, words, 'Undo brings it back');
});

s.test('the intimate direction\'s default is shown under "Show the default" byte for byte, its first two sentences are the box\'s placeholder, and the others say there is none', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'directions');
  const r = await page.evaluate(() => {
    const det = document.querySelector('details[data-disclosure="directions.intimate"]');
    return {
      summary: det.querySelector('summary').textContent,
      open: det.open,
      text: det.querySelector('[data-default-for="directions.intimate"]').textContent,
      def: Game.Pack.DEFAULTS.directions.intimate,
      ph: document.querySelector('[data-path="directions.intimate"]').placeholder,
      combat: document.querySelector('[data-path="directions.combat"]').placeholder,
      others: document.querySelectorAll('details[data-disclosure^="directions."]').length,
      when: document.querySelector('[data-field="directions.combat"] .cr-note').textContent
    };
  });
  assert.equal(r.summary, 'Show the default');
  assert.equal(r.open, false);
  assert.equal(r.text, r.def, 'byte for byte');
  assert.ok(r.def.startsWith(r.ph.replace(/ …$/, '')) && r.ph.endsWith(' …') && r.ph.length < 300, r.ph);
  assert.equal(r.combat, 'No direction: the narrator tells it its own way.');
  assert.equal(r.others, 1, 'only the intimate one has a default to show');
  assert.equal(r.when, 'When: An attack or a fight.');
  await page.click('details[data-disclosure="directions.intimate"] > summary');
  assert.equal(await page.isVisible('[data-default-for="directions.intimate"]'), true);
});

s.test('1,600 characters in the narrator note turn its count red and the validator\'s engine.string.length line shows under the field; the ENGINE RULES shown are Style.ENGINE_RULES and Api.ENGINE_RULES_SHORT', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'prompts');
  const fixed = await page.evaluate(() => ({ narrator: Game.Style.ENGINE_RULES, short: Game.Api.ENGINE_RULES_SHORT }));
  assert.equal(typeof fixed.short, 'string');
  assert.equal(await page.textContent('[data-rules-for="prompts.narratorExtra"]'), fixed.narrator);
  assert.equal(await page.textContent('[data-rules-for="prompts.parserExtra"]'), fixed.short);
  assert.equal(await page.textContent('[data-rules-for="prompts.bookkeeperExtra"]'), fixed.short);
  assert.equal(await page.textContent('[data-section="prompts.narratorExtra"] .cr-rules > .label'), 'Sent after your note, always');
  const quiet = await page.$eval('#cr-f-prompts-narratorExtra-count', x => getComputedStyle(x).color);
  await page.fill('[data-path="prompts.narratorExtra"]', 'a'.repeat(1600));
  const count = await page.$eval('#cr-f-prompts-narratorExtra-count', x => ({ text: x.textContent, over: x.dataset.over, color: getComputedStyle(x).color, err: getComputedStyle(document.querySelector('.cr-err') || x).color }));
  assert.deepEqual([count.text, count.over], ['1,600 of 1,500', '1']);
  assert.notEqual(count.color, quiet, 'red over the cap');
  await flush(page);
  assert.equal((await draft(page)).prompts.narratorExtra.length, 1600, 'the box does not cut a paste short');
  const probs = (await checkNow(page)).filter(p => p.path === 'prompts.narratorExtra');
  assert.ok(probs.some(p => p.rule === 'engine.string.length' && p.severity === 'error'), JSON.stringify(probs));
  assert.match(await page.textContent('#cr-f-prompts-narratorExtra-err'), /1600 characters; the most is 1500/);
  assert.equal(await page.getAttribute('[data-path="prompts.narratorExtra"]', 'aria-invalid'), 'true');
  assert.equal(await page.getAttribute('#creator-tab-prompts', 'data-count'), '1');
});

s.test('Write your own copies the style\'s examples into the draft; adding a fourth writes narration.examples[3] and removing it leaves three, one Undo each; the 3 to 8 rule shows under the list', async h => {
  const page = await open(h);
  await openDraft(page);
  await tab(page, 'narrator');
  await page.selectOption('[data-path="narration.preset"]', 'literary');
  await page.click('[data-action="examples-own"]');
  const lit = await page.evaluate(() => Game.Pack.DEFAULTS.narration.presets.literary.examples);
  assert.deepEqual((await draft(page)).narration.examples, lit);
  assert.equal(await page.$$eval('details.cr-example', xs => xs.length), 3);
  const depth = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  await page.click('[data-action="example-add"]');
  let d = await draft(page);
  assert.equal(d.narration.examples.length, 4);
  assert.deepEqual(d.narration.examples[3], { input: '', context: '', narration: '' });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'narration.examples[3].input', 'the new example opens on its first field');
  await page.fill('[data-path="narration.examples[3].input"]', 'I sit down at the bar.');
  await flush(page);
  assert.equal((await draft(page)).narration.examples[3].input, 'I sit down at the bar.');
  await page.click('details.cr-example[data-index="3"] [data-action="example-remove"]');
  d = await draft(page);
  assert.equal(d.narration.examples.length, 3);
  assert.deepEqual(d.narration.examples, lit);
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), depth + 3, 'add, type and remove: one Undo each');
  await page.evaluate(() => Game.Creator.Editor.undo());
  assert.equal((await draft(page)).narration.examples.length, 4, 'Undo brings the removed example back');
  await page.evaluate(() => Game.Creator.Editor.set('narration.examples', Game.Creator.state.draft.narration.examples.slice(0, 2)));
  await checkNow(page);
  assert.match(await page.textContent('#cr-f-narration-examples-err'), /3 to 8 example turns; there are 2/);
  await page.click('[data-action="examples-default"]');
  assert.equal((await draft(page)).narration.examples, undefined, 'back to the style\'s examples');
  assert.equal(await page.$$eval('.cr-preset-examples .cr-pre', xs => xs.length), 3, 'the literary style\'s three, read only');
});

s.test('the Opening, Narrator, Directions and Prompts tabs pass the mobile audit at 375 and 390 (the own guide, an example turn and the intimate default open)', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openDraft(page);
    const check = async label => { const a = await page.evaluate(audit, `${label} ${vp.width}`); assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a)); };
    await tab(page, 'opening');
    await check('opening');
    await tab(page, 'narrator');
    await page.click('details[data-disclosure="narration.customGuide"] > summary');
    await check('narrator');
    await page.click('[data-action="examples-own"]');
    await page.click('details.cr-example[data-index="0"] > summary');
    await check('narrator with an example open');
    await page.selectOption('[data-path="narration.preset"]', 'custom');
    await page.fill('#cr-f-narration-banned-add', 'the river remembers');
    await page.click('[data-field="narration.banned"] .cr-chip-new .btn');
    await check('narrator, custom, own banned list');
    await tab(page, 'directions');
    await page.click('details[data-disclosure="directions.intimate"] > summary');
    await page.fill('[data-path="directions.combat"]', 'Short and ugly.');
    await check('directions');
    await tab(page, 'prompts');
    await check('prompts');
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openDraft(page);
      await tab(page, 'narrator');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-narrator-voice-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => { document.querySelector('[data-field="narration.banned"]').closest('.cr-section').scrollIntoView({ block: 'start' }); document.getElementById('creator-scroll').scrollTop -= 60; });
      await shot(page, `creator-narrator-phrases-${vp.width}x${vp.height}-${theme}`);
      await tab(page, 'directions');
      await page.click('details[data-disclosure="directions.intimate"] > summary');
      await page.evaluate(() => { document.querySelector('[data-section="directions"]').scrollIntoView({ block: 'start' }); document.getElementById('creator-scroll').scrollTop -= 60; });
      await shot(page, `creator-directions-intimate-${vp.width}x${vp.height}-${theme}`);
      await tab(page, 'prompts');
      await page.fill('[data-path="prompts.narratorExtra"]', 'Keep the river in every scene: its sound, its smell, the way the town turns its back on it. '.repeat(18));
      await page.evaluate(() => { document.querySelector('[data-section="prompts.narratorExtra"] .cr-count-row').scrollIntoView({ block: 'start' }); document.getElementById('creator-scroll').scrollTop -= 120; });
      await shot(page, `creator-prompts-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
