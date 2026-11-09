'use strict';
/* Wave 37, Creator Mode, milestone 6 (task M6-C; plan decisions E, H and L,
   "Show me the prompt"; "Decisions and deviations" 7, the budget is the
   project's cost ceiling): State.sandbox runs a throwaway game and gives
   back the live one whole (state JSON, the autosave, the undo stack,
   State.pack, no listener called); Pack.budgetEstimate counts the three
   cached blocks as the suite does (the built-in pack's 12,999 of 13,000,
   the live game's own number); the editor's header meter shows it for the
   open draft and turns red over the budget, where the rule engine.budget
   warns (an error in strict) at the author's text; the Prompt view tab
   shows the system prompt, the town and cast blocks, a sample turn's
   packet per situation (the intimate MODE line, an author's direction in
   its own situation only, the arrival's own words) and the parser's and
   bookkeeper's prompts, each with its count and a Copy button, and a build
   leaves the live game, its autosave and Pack.current() as they were; the
   tab passes the mobile audit at 375 and 390. Screenshots of the Prompt
   view (normal and intimate) at 390x844 and 1280x800 in the Dark and
   Parchment themes go to $UI_SHOTS when it names a folder (none without it).
   Run with: node tests/run.cjs wave37-prompt-view */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, stateJson } = require('./helpers.cjs');

const s = suite('wave37-prompt-view');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const BUILT_IN_METER = '12,999 of 13,000 tokens · estimate';
const PARTS = ['System prompt', 'Town block', 'Cast block', 'Packet for this situation', 'Parser prompt', 'Bookkeeper prompt'];
const SITUATIONS = ['normal', 'zoom', 'arrival', 'intimate', 'combat', 'defeat', 'epilogue', 'gamble', 'rollFailure', 'rollCritical', 'firstTurn'];
// 400 short words: over the budget once the CREATOR NOTES carry them, and inside the 1,500-character cap.
const EXTRA = Array(400).fill('go').join(' ');
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

/* A page with the Library and the drafts read, and the mock answering at once. */
async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
/* A copy of the built-in story with an id of its own, as a draft opened from its card in the Library (as tests/wave37-editor.test.cjs opens one). */
async function openCopy(page) {
  const draftId = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'harbour-copy';
    p.meta.title = 'Harbour Copy';
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
async function promptView(page) {
  await page.click('#creator-tab-preview');
  await page.waitForSelector('#creator-preview .cr-pblock');
}
const toast = page => page.waitForFunction(() => document.getElementById('toast').classList.contains('show')).then(() => page.textContent('#toast'));

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider than the screen. */
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

s.test('State.sandbox gives the live game back whole: after a newGame and an applied diff inside it, the state JSON, the autosave text, the undo stack and State.pack are as before, no onChange listener was called, and it returns fn\'s value (nested too)', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => Game.State.apply({ advanceTime: 'short' }));
  await page.evaluate(() => { Game.State.snapshot(); Game.State.apply({ goldDelta: 5 }); });
  const before = await page.evaluate(() => ({
    json: JSON.stringify(Game.state), town: JSON.stringify(Game.State.town), auto: localStorage.getItem('novatria.autosave'),
    depth: Game.State.undoDepth(), undo: JSON.stringify(Game.State.undoRecord()), gen: Game.State.undoGen, muted: Game.State.muted
  }));
  assert.ok(before.auto, 'there is an autosave to compare');
  assert.ok(before.depth >= 1, 'there is an undo step to compare');
  const r = await page.evaluate(() => {
    const S = Game.State;
    const packBefore = S.pack;
    let heard = 0;
    let undoHeard = 0;
    S.onChange(() => { heard += 1; });
    S.onUndo(() => { undoHeard += 1; });
    const copy = Game.Pack.copy(Game.Pack.builtIn());
    copy.meta.id = 'sandbox-copy';
    const out = S.sandbox(() => {
      const muted = S.muted;
      const bg = copy.player.backgrounds[1];
      // No pending: newGame unmutes, and the sandbox still keeps every listener quiet.
      S.newGame(copy, { name: 'Sandy', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'g', flaw: copy.player.flaws[0], looseEnds: [] }, { seed: 7 });
      const inside = { name: S.current.player.name, packId: S.current.meta.packId, pack: S.pack !== packBefore, muted };
      const res = S.apply({ goldDelta: 40, advanceTime: 'long' });
      inside.applied = res.rejected.length === 0;
      S.snapshot();
      inside.nested = S.sandbox(() => S.current.player.name) === 'Sandy' && S.current.player.name === 'Sandy';
      return inside;
    });
    return { out, heard, undoHeard, samePack: S.pack === packBefore, name: S.current.player.name };
  });
  assert.deepEqual(r.out, { name: 'Sandy', packId: 'sandbox-copy', pack: true, muted: true, applied: true, nested: true });
  assert.equal(r.heard, 0, 'no onChange listener ran: no autosave, no render, no feed');
  assert.equal(r.undoHeard, 0, 'no undo listener ran');
  assert.equal(r.samePack, true, 'State.pack is the live pack again');
  assert.equal(r.name, 'Tester');
  const after = await page.evaluate(() => ({
    json: JSON.stringify(Game.state), town: JSON.stringify(Game.State.town), auto: localStorage.getItem('novatria.autosave'),
    depth: Game.State.undoDepth(), undo: JSON.stringify(Game.State.undoRecord()), gen: Game.State.undoGen, muted: Game.State.muted
  }));
  assert.deepEqual(after, before);
  // A throw inside comes out, and everything is still put back.
  const thrown = await page.evaluate(() => {
    let msg = null;
    try { Game.State.sandbox(() => { Game.State.clear(); throw new Error('boom'); }); } catch (e) { msg = e.message; }
    return { msg, name: Game.State.current && Game.State.current.player.name };
  });
  assert.deepEqual(thrown, { msg: 'boom', name: 'Tester' });
  assert.equal(await stateJson(page), before.json);
});

s.test('Pack.budgetEstimate(Pack.builtIn()).total is 12,999, the live game\'s own estimate of townBlock + castBlock + systemPrompt under quickStart (the same formula); per block and for an unfrozen copy alike, and under the budget', async h => {
  const page = await open(h);
  const title = await page.evaluate(() => Game.Pack.budgetEstimate(Game.Pack.builtIn()));
  await quickStart(page);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const live = P.tokenEstimate([Game.Pipeline.townBlock(), Game.Pipeline.castBlock(), Game.Style.systemPrompt()].join(' '));
    const each = [Game.Style.systemPrompt(), Game.Pipeline.townBlock(), Game.Pipeline.castBlock()].map(P.tokenEstimate);
    return { live, each, built: P.budgetEstimate(P.builtIn()), copy: P.budgetEstimate(P.copy(P.builtIn())), budget: P.TOKEN_BUDGET };
  });
  assert.equal(r.live, 12999);
  assert.deepEqual(title, r.built, 'the same with no game running');
  assert.equal(r.built.total, 12999);
  assert.equal(r.built.total, r.live);
  assert.deepEqual([r.built.system, r.built.town, r.built.cast], r.each);
  assert.deepEqual(r.copy, r.built);
  assert.ok(r.built.total < r.budget);
  assert.equal(Object.isFrozen(r.built), false, 'what crosses evaluate is a copy');
});

s.test('the Prompt view tab, for a draft of the built-in copy: the situation picker, the cached total as a meter, six blocks with their counts, badges and Copy buttons, and the note that nothing is sent; the header meter reads 12,999 of 13,000 tokens', async h => {
  const page = await open(h);
  await openCopy(page);
  assert.equal(await page.textContent('#creator-meter-num'), BUILT_IN_METER);
  assert.equal(await page.getAttribute('#creator-meter', 'data-over'), '0');
  assert.match(await page.getAttribute('#creator-meter', 'title'), /cached prompt the narrator reads every turn.*estimated/);
  await promptView(page);
  const v = await page.evaluate(() => {
    const sec = document.getElementById('creator-preview');
    return {
      h: sec.querySelector('h2').textContent,
      note: sec.querySelector('.cr-note').textContent,
      options: [...sec.querySelectorAll('select option')].map(o => o.value),
      chosen: sec.querySelector('select').value,
      when: sec.querySelector('.cr-preview-when').textContent,
      meter: sec.querySelector('.cr-preview-meter .cr-meter-num').textContent,
      pres: sec.querySelectorAll('.cr-pre').length,
      parts: [...sec.querySelectorAll('.cr-pblock')].map(b => ({ title: b.querySelector('h3').textContent, badge: b.querySelector('.cr-badge') ? b.querySelector('.cr-badge').textContent : null, num: b.querySelector('.cr-pblock-num').textContent, copy: b.querySelector('button').textContent, text: b.querySelector('.cr-pre').textContent })),
      last: Game.Creator.Preview.last.tokens,
      est: Game.Pack.budgetEstimate(Game.Creator.state.draft)
    };
  });
  assert.equal(v.h, 'Show me the prompt');
  assert.match(v.note, /nothing is sent and no game is touched\.$/);
  assert.deepEqual(v.options, SITUATIONS);
  assert.equal(v.chosen, 'normal');
  assert.match(v.when, /^An ordinary turn/);
  assert.equal(v.meter, BUILT_IN_METER);
  assert.equal(v.pres, 6);
  assert.deepEqual(v.parts.map(p => p.title), PARTS);
  assert.deepEqual(v.parts.map(p => p.badge), ['cached every turn', 'cached every turn', 'cached every turn', 'this turn only', null, null]);
  assert.ok(v.parts.every(p => p.copy === 'Copy' && /^[\d,]+ tokens$/.test(p.num) && p.text.length > 100));
  assert.equal(v.last.cachedTotal, 12999);
  assert.equal(v.last.cachedTotal, v.est.total, 'the Prompt view and the meter count the same blocks');
  assert.deepEqual([v.last.system, v.last.town, v.last.cast], [v.est.system, v.est.town, v.est.cast]);
  assert.ok(v.last.total > v.last.cachedTotal);
  assert.ok(v.parts[0].text.startsWith('You are the narrator') || v.parts[0].text.length > 1000);
  assert.match(v.parts[1].text, /^THE TOWN \(background/);
  assert.match(v.parts[2].text, /^CAST \(everyone who exists/);
  assert.match(v.parts[3].text, /^STORY SO FAR: /m);
  // Every situation builds, with the same cached total, and its own packet.
  const all = await page.evaluate(sits => sits.map(x => { const b = Game.Creator.Preview.build(Game.Creator.state.draft, x); return [b.situation, b.tokens.cachedTotal, b.packet.length > 0]; }), SITUATIONS);
  assert.deepEqual(all, SITUATIONS.map(x => [x, 12999, true]));
});

s.test('a 400-word narratorExtra puts the draft over the budget: the meter goes red (data-over 1), Pack.validate reports engine.budget as a warning at prompts.narratorExtra in play and an error in strict, and the Problems list shows it', async h => {
  const page = await open(h);
  await openCopy(page);
  await page.evaluate(x => Game.Creator.Editor.set('prompts.narratorExtra', x), EXTRA);
  await page.waitForFunction(() => document.getElementById('creator-meter').dataset.over === '1', null, { timeout: 2000 });
  const m = await page.evaluate(() => ({ text: document.getElementById('creator-meter-num').textContent, est: Game.Pack.budgetEstimate(Game.Creator.state.draft).total, color: getComputedStyle(document.getElementById('creator-meter-num')).color, danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() }));
  assert.ok(m.est > 13000, String(m.est));
  assert.equal(m.text, `${m.est.toLocaleString('en-US')} of 13,000 tokens · estimate`);
  const msg = `The narrator's cached prompt is over the token budget (${m.est.toLocaleString('en-US')} of 13,000 tokens, estimated); shorten the guide, the example turns or the narrator note.`;
  const v = await page.evaluate(() => {
    const d = Game.Creator.state.draft;
    const pick = list => list.filter(p => p.rule === 'engine.budget');
    return { play: pick(Game.Pack.validate(d, { profile: 'play' })), strict: pick(Game.Pack.validate(d, { profile: 'strict' })), builtIn: pick(Game.Pack.validate(Game.Pack.builtIn(), { profile: 'strict' })) };
  });
  assert.deepEqual(v.play, [{ path: 'prompts.narratorExtra', message: msg, severity: 'warning', rule: 'engine.budget' }]);
  assert.deepEqual(v.strict, [{ path: 'prompts.narratorExtra', message: msg, severity: 'error', rule: 'engine.budget' }]);
  assert.deepEqual(v.builtIn, [], 'the built-in pack is under the budget');
  await page.click('#creator-tab-overview');
  await page.waitForSelector('#creator-problems .cr-problem[data-problem="prompts.narratorExtra"]');
  const row = await page.$eval('#creator-problems .cr-problem[data-problem="prompts.narratorExtra"]', b => ({ sev: b.dataset.sev, msg: b.querySelector('.cr-problem-msg').textContent, tab: b.dataset.tab }));
  assert.deepEqual(row, { sev: 'warning', msg, tab: 'prompts' });
  // The Prompt view's own meter says the same, and goes back under with the note gone.
  await promptView(page);
  assert.equal(await page.getAttribute('#creator-preview .cr-preview-meter', 'data-over'), '1');
  await page.evaluate(() => Game.Creator.Editor.set('prompts.narratorExtra', undefined));
  await page.waitForFunction(t => document.getElementById('creator-meter-num').textContent === t && document.querySelector('#creator-preview .cr-preview-meter').dataset.over === '0', BUILT_IN_METER, { timeout: 2000 });
});

s.test('the system prompt shown is Style.systemPrompt() under Pack.setPreview(draft) byte for byte, and a build leaves the live game\'s own Style.systemPrompt(), State.current, the autosave and Pack.current() as they were', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const draft = P.copy(P.builtIn());
    draft.meta.id = 'harbour-copy';
    draft.narration = { preset: 'custom', customGuide: 'Short plain sentences. Never a simile.', goodTurn: 'A good turn ends on a question someone asks.' };
    const liveSys = Game.Style.systemPrompt();
    const json = JSON.stringify(Game.state);
    const auto = localStorage.getItem('novatria.autosave');
    const cur = P.current();
    const b = Game.Creator.Preview.build(draft, 'normal');
    const after = { sys: Game.Style.systemPrompt() === liveSys, json: JSON.stringify(Game.state) === json, auto: localStorage.getItem('novatria.autosave') === auto, cur: P.current() === cur };
    P.setPreview(draft);
    const previewSys = Game.Style.systemPrompt();
    P.setPreview(null);
    return { shown: b.system, previewSys, after, liveSys, est: P.budgetEstimate(draft).total, cached: b.tokens.cachedTotal, argSys: Game.Style.systemPrompt(undefined, draft) };
  });
  assert.equal(r.shown, r.previewSys);
  assert.equal(r.shown, r.argSys, 'the pack argument reads the same as the preview');
  assert.notEqual(r.shown, r.liveSys);
  assert.match(r.shown, /^Short plain sentences\. Never a simile\./);
  assert.match(r.shown, /ENGINE RULES \(these outrank everything above/);
  assert.deepEqual(r.after, { sys: true, json: true, auto: true, cur: true });
  assert.equal(r.cached, r.est);
  // With a preview set before the build, the preview is the same pack afterwards.
  const p = await page.evaluate(() => {
    const P = Game.Pack;
    const mine = P.copy(P.builtIn());
    mine.meta.title = 'Mine';
    P.setPreview(mine);
    const h0 = P.hash(P.current());
    Game.Creator.Preview.build(P.copy(P.builtIn()), 'zoom');
    const out = { hash: P.hash(P.current()) === h0, title: P.current().meta.title, frozen: Object.isFrozen(P.current()) };
    P.setPreview(null);
    return out;
  });
  assert.deepEqual(p, { hash: true, title: 'Mine', frozen: false });
});

s.test('the packet per situation: intimate carries the built-in MODE line and no DIRECTION line; a pack-layer directions.rollFailure shows its DIRECTION line in the rollFailure situation only; the arrival packet carries the arrival\'s own words from player.arrivals', async h => {
  const page = await open(h);
  const r = await page.evaluate(sits => {
    const P = Game.Pack;
    const pv = Game.Creator.Preview;
    const draft = P.copy(P.builtIn());
    const intimate = pv.build(draft, 'intimate').packet;
    const directed = P.copy(P.builtIn());
    directed.directions = { rollFailure: 'Let the failure land on the player\'s pride, not their body.' };
    const lines = {};
    for (const x of sits) lines[x] = pv.build(directed, x).packet.split('\n').filter(l => l.startsWith('DIRECTION') || l.startsWith('ENGINE:'));
    const bg = draft.player.backgrounds[0];
    const arrival = pv.build(draft, 'arrival').packet;
    return { intimate, mode: Game.Pipeline.INTIMATE_MODE, lines, summary: draft.player.arrivals[bg.arrival].summary, arrival };
  }, SITUATIONS);
  assert.ok(r.intimate.split('\n').includes(`MODE: ${r.mode}`), 'the built-in intimate MODE line');
  assert.ok(!/^DIRECTION/m.test(r.intimate), 'no DIRECTION line for a pack that sets none');
  assert.ok(!/^ENGINE:/m.test(r.intimate));
  for (const x of SITUATIONS) {
    if (x === 'rollFailure') assert.deepEqual(r.lines[x], ['DIRECTION (from the story\'s author): Let the failure land on the player\'s pride, not their body.', "ENGINE: the code already decided this turn's outcome (ROLL, OUTCOME, COMPLICATION above); the direction shapes how it is told, never what happened."], x);
    else assert.deepEqual(r.lines[x], [], x);
  }
  assert.ok(r.summary.length > 5);
  assert.ok(r.arrival.includes(r.summary), 'the arrival packet carries "' + r.summary + '"');
  assert.match(r.arrival, /^MODE: arrival/m);
});

s.test('Copy on the System prompt block puts the system prompt on the clipboard and says so; choosing a situation redraws the packet and says when it happens', async h => {
  const page = await open(h, { contextOptions: { reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] } });
  await openCopy(page);
  await promptView(page);
  await page.click('#creator-preview .cr-pblock[data-part="system"] button');
  assert.match(await toast(page), /^Copied the system prompt \([\d,]+ tokens\)\.$/);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(clip, await page.evaluate(() => Game.Style.systemPrompt(undefined, Game.Creator.state.draft)));
  assert.equal(clip, await page.textContent('#creator-preview .cr-pblock[data-part="system"] .cr-pre'));
  await page.selectOption('#creator-preview select', 'intimate');
  await page.waitForFunction(() => /^MODE: INTIMATE SCENE\./m.test(document.querySelector('#creator-preview .cr-pblock[data-part="packet"] .cr-pre').textContent));
  assert.match(await page.textContent('#creator-preview .cr-preview-when'), /^Someone said yes to the night/);
  // The choice stays while the draft changes, and the tab follows the change.
  await page.evaluate(() => Game.Creator.Editor.set('directions.intimate', 'Keep it tender and slow.'));
  await page.waitForFunction(() => document.querySelector('#creator-preview .cr-pblock[data-part="packet"] .cr-pre').textContent.includes('INTIMATE SCENE. Keep it tender and slow.'), null, { timeout: 2000 });
  assert.equal(await page.inputValue('#creator-preview select'), 'intimate');
});

s.test('a build with no game running leaves no game, no autosave and the built-in pack current; a blank draft that cannot start a game says why in the tab instead of throwing', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = Game.Creator.Preview.build(P.copy(P.builtIn()), 'combat');
    let blank = null;
    try { Game.Creator.Preview.build(P.blank('Nothing yet'), 'normal'); } catch (e) { blank = e.message; }
    return { state: Game.state, auto: localStorage.getItem('novatria.autosave'), builtIn: P.current() === P.builtIn(), combat: /^ROLL: .* · Success$/m.test(b.packet), blank };
  });
  assert.deepEqual(r, { state: null, auto: null, builtIn: true, combat: true, blank: 'unknown background' });
  await page.click('#btn-create');
  await page.waitForSelector('#creator-library:not([hidden])');
  await page.click('#creator-empty-new');
  await page.waitForSelector('#creator-editor:not([hidden])');
  await page.click('#creator-tab-preview');
  await page.waitForSelector('#creator-preview .cr-preview-err');
  assert.match(await page.textContent('#creator-preview .cr-preview-err'), /^The prompt cannot be built yet: Unknown background\./);
  assert.equal(await page.isHidden('#creator-preview .cr-preview-meter'), true);
});

s.test('the Prompt view (normal and intimate, and over the budget) passes the mobile audit at 375 and 390; screenshots at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openCopy(page);
    await promptView(page);
    for (const sit of ['normal', 'intimate']) {
      await page.selectOption('#creator-preview select', sit);
      const a = await page.evaluate(audit, `prompt view ${sit} ${vp.width}`);
      assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    }
    await page.evaluate(x => Game.Creator.Editor.set('prompts.narratorExtra', x), EXTRA);
    await page.waitForFunction(() => document.querySelector('#creator-preview .cr-preview-meter').dataset.over === '1', null, { timeout: 2000 });
    const a = await page.evaluate(audit, `prompt view over ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openCopy(page);
      await promptView(page);
      for (const sit of ['normal', 'intimate']) {
        await page.selectOption('#creator-preview select', sit);
        await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
        await shot(page, `prompt-view-${sit}-${vp.width}x${vp.height}-${theme}`);
        // Below the sticky tab strip: the block's heading in view, not under it.
        await page.evaluate(() => {
          const sc = document.getElementById('creator-scroll');
          const b = document.querySelector('#creator-preview .cr-pblock[data-part="packet"]');
          sc.scrollTop += b.getBoundingClientRect().top - document.getElementById('creator-tabs').getBoundingClientRect().bottom - 12;
        });
        await shot(page, `prompt-view-${sit}-packet-${vp.width}x${vp.height}-${theme}`);
      }
      await page.evaluate(x => Game.Creator.Editor.set('prompts.narratorExtra', x), EXTRA);
      await page.waitForFunction(() => document.getElementById('creator-meter').dataset.over === '1', null, { timeout: 2000 });
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `prompt-view-over-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
