'use strict';
/* The UI fixes (docs/notes/ui.md): the first five minutes (title, how to
   play, creation), the core loop (status line, Stop, queue, empty Enter,
   the kept-input notice, Say on a phone, notes that survive a reload),
   the panels (Journal, People search, the map's labels and Go there),
   Settings (presets, Check key, cost), storage safety (the previous
   autosave, asking first, another tab, a damaged or newer save, the CSP)
   and accessibility (focus, the modal sheet, tabs, contrast).
   Mock mode throughout. Screenshots go to SHOTS for a look by eye.
   Run with: node tests/run.cjs ui-fixes */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, GAME_PATH, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('ui-fixes');
const SHOTS = process.env.UI_SHOTS || '/tmp/claude-0/-home-user-novatria/5741fd8d-e8b9-5c6d-8cad-fb616ca2dacf/scratchpad/shots2';
const shot = async (page, name, opts) => {
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png') }, opts || {})); } catch (e) { /* screenshots are for looking at, not for passing */ }
};
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const visibleNow = (page, sel) => page.evaluate(q => {
  const el = document.querySelector(q);
  if (!el || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
}, sel);

// ----- A. The first five minutes -----

s.test('title: New game is above the fold at 375x740 and 1280x800, two sentences of the setting with the rest folded away, and a chip says how the game is played', async h => {
  for (const vp of [{ width: 375, height: 740 }, { width: 1280, height: 800 }]) {
    const page = await open(h, vp);
    await shot(page, `A01_title_${vp.width}`);
    for (const id of ['#btn-new', '#btn-continue', '#btn-load', '#btn-settings', '#title-mode']) assert.ok(await visibleNow(page, id), `${id} visible without scrolling at ${vp.width}x${vp.height}`);
    const t = await page.evaluate(() => ({
      shown: document.getElementById('title-setting').textContent,
      more: document.getElementById('title-setting-more').textContent,
      setting: Game.data.TOWN_DATA.setting,
      open: document.getElementById('title-more').open,
      chip: document.getElementById('title-mode').textContent,
      buttonsFirst: document.getElementById('btn-new').getBoundingClientRect().top < document.getElementById('title-setting').getBoundingClientRect().top
    }));
    assert.ok(t.buttonsFirst, 'the buttons come before the setting');
    assert.equal((t.shown.match(/[.!?](\s|$)/g) || []).length, 2, 'two sentences: ' + t.shown);
    assert.equal(`${t.shown} ${t.more}`.replace(/\s+/g, ' ').trim(), t.setting.replace(/\s+/g, ' ').trim(), 'nothing of the setting is lost');
    assert.equal(t.open, false, '"More about the town" starts folded');
    assert.match(t.chip, /^Offline demo — canned replies\s*Add API key$/);
  }
  // Continue names the game it picks up.
  const page = await open(h);
  await quickStart(page, { name: 'Tomas Reed' });
  await page.evaluate(() => Game.App.quitToTitle());
  const sub = await page.evaluate(() => ({ text: document.getElementById('continue-sub').textContent, loc: Game.State.loc(Game.state.player.locationId).name, day: Game.state.time.day }));
  assert.equal(sub.text, `Tomas Reed · Day ${sub.day} · ${sub.loc}`);
  // With a key and the demo off, the chip says Claude and the narrator model.
  await page.evaluate(() => { Game.Storage.setApiKey('sk-ant-test-0123456789', false); Game.Storage.saveSettings({ mockMode: false }); Game.UI.showScreen('title'); });
  assert.equal(await page.textContent('#title-mode-text'), `Playing with Claude · ${await page.evaluate(() => Game.Storage.settings().narratorModel)}`);
});

s.test('first launch: New game asks how to play; the demo goes straight to the form; a key turns the demo off with a toast; Settings does the same', async h => {
  const page = await open(h, PHONE);
  assert.equal(await page.evaluate(() => Game.Storage.settings().mockMode), true, 'no key yet: only the demo can run');
  await page.click('#btn-new');
  assert.ok(await page.isVisible('#create-mode-view'), 'the choice comes first');
  assert.ok(await page.isHidden('#create-form-view'));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'mode-title', 'the heading takes the focus');
  await shot(page, 'A02_choice_375');
  await page.click('#choose-claude');
  await page.click('#mode-key-go');
  assert.match(await page.textContent('#mode-key-err'), /Paste your API key/);
  await page.fill('#mode-key-input', 'sk-ant-test-0123456789');
  await page.click('#mode-key-go');
  assert.ok(await page.isVisible('#create-form-view'), 'then the form');
  assert.equal(await page.textContent('#toast'), 'Mock mode off: playing with Claude');
  assert.deepEqual(await page.evaluate(() => [Game.Storage.settings().mockMode, Game.Storage.settings().playChoice, Game.Storage.getApiKey()]), [false, 'claude', 'sk-ant-test-0123456789']);
  // The demo, in a fresh browser: chosen once, not asked again.
  const demo = await open(h, LAPTOP);
  await demo.click('#btn-new');
  await demo.click('#choose-demo');
  assert.ok(await demo.isVisible('#create-form-view'));
  assert.deepEqual(await demo.evaluate(() => [Game.Storage.settings().mockMode, Game.Storage.settings().playChoice]), [true, 'demo']);
  await demo.click('#cr-cancel');
  await demo.click('#btn-new');
  assert.ok(await demo.isVisible('#create-form-view'), 'not asked twice');
  // Settings: typing a key turns the demo off.
  await demo.click('#cr-cancel');
  await demo.click('#btn-settings');
  assert.equal(await demo.evaluate(() => document.activeElement.id), 'settings-title');
  await demo.fill('#set-key', 'sk-ant-other-0123456789');
  assert.equal(await demo.textContent('#toast'), 'Mock mode off: playing with Claude');
  assert.equal(await demo.evaluate(() => Game.Storage.settings().mockMode), false);
  assert.equal(await demo.isChecked('#set-mock'), false);
});

s.test('in game, the offline demo shows a slim bar that can be closed; with a key there it turns the demo off', async h => {
  const page = await open(h);
  await quickStart(page);
  assert.ok(await page.isVisible('#demo-bar'));
  assert.match(await page.textContent('#demo-bar'), /Offline demo: replies are canned\.\s*Add key/);
  const hgt = await page.evaluate(() => document.getElementById('demo-bar').getBoundingClientRect().height);
  assert.ok(hgt <= 46, 'slim: ' + hgt);
  await page.click('#demo-bar-close');
  assert.ok(await page.isHidden('#demo-bar'));
  const page2 = await open(h);
  await page2.evaluate(() => Game.Storage.setApiKey('sk-ant-test-0123456789', false));
  await quickStart(page2);
  assert.equal(await page2.textContent('#demo-bar-act'), 'Play with Claude');
  await page2.click('#demo-bar-act');
  assert.equal(await page2.evaluate(() => Game.Storage.settings().mockMode), false);
  assert.ok(await page2.isHidden('#demo-bar'));
});

s.test('creation: a line per stat, − / + moves one point (net zero), goal suggestions, one editable line per loose end with suggestions, five steps on a phone, and Random character', async h => {
  const page = await open(h, LAPTOP);
  await page.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await page.click('#btn-new');
  const bg = await page.evaluate(() => Game.data.BACKGROUNDS[0]);
  await page.fill('#cr-name', 'Ilse');
  await page.click(`.bg-choice[data-id="${bg.id}"]`);
  const lines = await page.$$eval('.cr-stat-desc', n => n.map(x => x.textContent));
  assert.equal(lines.length, 4);
  assert.ok(lines.every(t => t.length > 20), 'each stat explained');
  const from = Object.keys(bg.stats).find(k => bg.stats[k] > -1);
  const to = Object.keys(bg.stats).find(k => k !== from && bg.stats[k] < 3);
  await page.click(`.step-btn[data-for="${from}"][data-dir="down"]`);
  assert.match(await page.textContent('.cr-pending'), /One point taken from/);
  await page.click('#cr-review');
  assert.match(await page.textContent('#cr-step-stats .err'), /give it to another stat/, 'half a move is not allowed');
  await page.click(`.step-btn[data-for="${to}"][data-dir="up"]`);
  const vals = await page.$$eval('#cr-stat-grid .stat-val', n => n.map(x => x.textContent));
  const sum = v => v.reduce((a, x) => a + Number(x.replace('−', '-').replace('+', '')), 0);
  assert.equal(sum(vals), Object.values(bg.stats).reduce((a, b) => a + b, 0), 'net zero');
  assert.ok(await page.isDisabled(`.step-btn[data-for="${Object.keys(bg.stats).find(k => k !== from && k !== to)}"][data-dir="up"]`), 'only one point moves');
  // Goal: a placeholder that is not a value, and suggestions that fill it.
  assert.equal(await page.inputValue('#cr-goal'), '');
  assert.match(await page.getAttribute('#cr-goal', 'placeholder'), /^Type why you came here/);
  const presets = await page.$$eval('.goal-choice', n => n.map(x => x.textContent));
  assert.ok(presets.length >= 1);
  await page.click('.goal-choice >> nth=0');
  assert.equal(await page.inputValue('#cr-goal'), presets[0]);
  await page.click('.flaw-choice >> nth=2');
  // Loose ends: no select, one line, suggestion chips.
  for (const k of ['debt', 'enemy', 'secret']) await page.click(`.le-toggle[data-kind="${k}"]`);
  assert.equal(await page.locator('select.le-option').count(), 0, 'no duplicate select');
  assert.equal(await page.locator('.le-text').count(), 3);
  const opt = await page.evaluate(() => Game.data.LOOSE_ENDS.enemy.options[1]);
  await page.click('.le-choice[data-kind="enemy"][data-index="1"]');
  assert.equal(await page.inputValue('.le-text[data-kind="enemy"]'), opt);
  await shot(page, 'A04_creation_1280', { fullPage: true });
  await page.click('#cr-review');
  await page.waitForSelector('#create-summary-view:not([hidden])');
  const st = await page.evaluate(() => ({ stats: Game.state.player.stats, goal: Game.state.player.goal, loose: Game.state.player.looseEnds.map(l => l.text) }));
  assert.equal(st.stats[from], bg.stats[from] - 1);
  assert.equal(st.stats[to], bg.stats[to] + 1);
  assert.equal(st.goal, presets[0]);
  assert.ok(st.loose.includes(opt));
  // A phone: five steps; Random character fills everything and goes to the summary.
  const phone = await open(h, PHONE);
  await phone.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await phone.click('#btn-new');
  assert.equal(await phone.textContent('#cr-count'), 'Step 1 of 5');
  await phone.click('#cr-random');
  await phone.waitForSelector('#create-summary-view:not([hidden])');
  const r = await phone.evaluate(() => ({ name: Game.state.player.name, loose: Game.state.player.looseEnds.length, cast: Game.state.npcs.map(n => n.name) }));
  assert.equal(r.loose, 3);
  assert.ok(r.name.split(' ').length === 2 && !r.cast.some(n => n.split(' ').some(w => r.name.split(' ').includes(w))), 'a name nobody in town has: ' + r.name);
  await shot(phone, 'A05_random_summary_375');
  await phone.click('#cr-begin');
  await phone.waitForSelector('#screen-game.active');
  assert.ok(await phone.isVisible('.f-tip'), 'the first narration is followed by the tip');
  assert.match(await phone.textContent('.f-tip'), /Do.*Say.*Wait.*⋯/s);
  await shot(phone, 'A06_first_turn_tip_375');
  await phone.click('.f-tip .bar-x');
  assert.equal(await phone.locator('.f-tip').count(), 0);
});

// ----- B. The core loop -----

s.test('empty Enter does nothing (no paid Wait); the Wait button still waits', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await page.fill('#cmd', '');
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0, 'Enter on an empty box changes nothing');
  assert.equal(await page.evaluate(() => Game.Api.Mock.calls.length), 0, 'and calls nothing');
  await page.click('#send');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0 + 1, 'the button waits');
});

s.test('a slow turn: the status line says what is happening, Send becomes Stop (or stays off), Enter keeps the new line in the box, and the line clears after', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 1500 }));
  await page.fill('#cmd', 'I look at the board out front');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  const mid = await page.evaluate(() => ({ text: document.getElementById('turn-status-text').textContent, hidden: document.getElementById('turn-status').hidden, send: document.getElementById('send').textContent, disabled: document.getElementById('send').disabled, live: document.getElementById('feed').getAttribute('aria-live'), pendingHidden: (document.querySelector('#feed .f-narr.pending') || {}).getAttribute && document.querySelector('#feed .f-narr.pending').getAttribute('aria-hidden'), abort: typeof Game.Pipeline.abort === 'function' }));
  assert.equal(mid.hidden, false, 'the status line shows');
  assert.equal(mid.text, 'Writing…');
  if (mid.abort) assert.deepEqual([mid.send, mid.disabled], ['Stop', false], 'Send is Stop');
  else assert.equal(mid.disabled, true, 'no Stop without Pipeline.abort: Send is off');
  assert.equal(mid.live, 'off', 'the log is quiet while the narration streams');
  assert.equal(mid.pendingHidden, 'true', 'and the streaming node is hidden from screen readers');
  await shot(page, 'B01_status_writing_1280');
  // A new line typed meanwhile: Enter keeps it in the box.
  await page.fill('#cmd', 'I wave at the mechanic');
  await page.press('#cmd', 'Enter');
  assert.equal(await page.inputValue('#cmd'), 'I wave at the mechanic', 'nothing is lost');
  await page.waitForFunction(() => !Game.Pipeline.busy && document.getElementById('turn-status').hidden);
  const end = await page.evaluate(() => ({ live: document.getElementById('feed').getAttribute('aria-live'), hidden: [...document.querySelectorAll('#feed .f-narr')].pop().getAttribute('aria-hidden'), send: document.getElementById('send').textContent }));
  assert.deepEqual(end, { live: 'polite', hidden: null, send: 'Send' });
});

s.test('a routed slow API: "Reading your action…" while the parser works, "Writing…" while the narrator does', async h => {
  const page = await open(h);
  const API = 'https://api.anthropic.com/v1/messages';
  const msg = text => ({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 } }) });
  await page.route(API, async route => {
    const body = JSON.parse(route.request().postData());
    const schema = body.output_config && body.output_config.format && body.output_config.format.schema;
    if (body.stream) {
      await new Promise(r => setTimeout(r, 1200));
      const ev = [{ type: 'message_start', message: { id: 's', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], usage: { input_tokens: 5, output_tokens: 1 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The pumps tick in the cold. Nobody looks up.' } },
        { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } }, { type: 'message_stop' }];
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') });
    }
    if (schema && schema.properties && schema.properties.actionType) {
      await new Promise(r => setTimeout(r, 1200));
      return route.fulfill(msg(JSON.stringify({ actionType: 'look', summary: 'Looks at the pumps', targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false })));
    }
    const empty = {};
    for (const k of Object.keys((schema && schema.properties) || {})) { const t = schema.properties[k].type; empty[k] = Array.isArray(t) ? null : t === 'array' ? [] : t === 'string' ? '' : t === 'boolean' ? false : t === 'integer' || t === 'number' ? 0 : null; }
    return route.fulfill(msg(schema ? JSON.stringify(Object.assign(empty, { goldDelta: null, hpDelta: null, journalEntry: null, playerLocationId: null })) : 'They looked at the pumps.'));
  });
  await quickStart(page);
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  await page.fill('#cmd', 'I look at the pumps');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => document.getElementById('turn-status-text').textContent === 'Reading your action…', null, { timeout: 3000 });
  await shot(page, 'B02_status_reading_1280');
  await page.waitForFunction(() => document.getElementById('turn-status-text').textContent === 'Writing…', null, { timeout: 4000 });
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  await page.waitForFunction(() => document.getElementById('turn-status').hidden, null, { timeout: 15000 });
});

s.test('Stop aborts a slow turn and gives the line back (when the Pipeline can abort)', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const can = await page.evaluate(() => typeof Game.Pipeline.abort === 'function');
  if (!can) {
    // Before the transport's abort lands: the button is off while busy and nothing breaks.
    await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 800 }));
    await page.fill('#cmd', 'I count the pumps');
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => Game.Pipeline.busy);
    assert.equal(await page.isDisabled('#send'), true);
    await page.waitForFunction(() => !Game.Pipeline.busy);
    return;
  }
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 4000 }));
  await page.fill('#cmd', 'I count the pumps');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => document.getElementById('send').textContent === 'Stop');
  await page.click('#send');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0, 'no turn');
  assert.equal(await page.inputValue('#cmd'), 'I count the pumps', 'the line is back');
});

s.test('a failed turn: the line goes back in the box only if the box is empty; otherwise the notice says what it was', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  // A parser that takes a moment and then fails (an error nothing retries).
  await page.evaluate(() => {
    const real = Game.Api.Mock.parse;
    Game.Api.Mock.parse = async () => { await new Promise(r => setTimeout(r, 700)); Game.Api.Mock.parse = real; throw new Game.Api.ApiError('invalid_request_error', 'The request was not accepted.'); };
  });
  await page.fill('#cmd', 'I ask about work');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.busy);
  await page.fill('#cmd', 'I buy a coffee');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.inputValue('#cmd'), 'I buy a coffee', 'the new line stays');
  const notice = await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent);
  assert.ok(notice.includes('Your action: “I ask about work”'), notice);
  assert.ok(!notice.includes('kept in the box'), 'no false claim: ' + notice);
  // With the box left empty it goes back, and the notice can say so.
  await page.fill('#cmd', '');
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: { type: 'overloaded_error' } }));
  await sendText(page, 'I ask about work');
  assert.equal(await page.inputValue('#cmd'), 'I ask about work');
});

s.test('Say on a phone: one sideways row (with a "To:" picker when the place is busy), 56px at most; the feed keeps 200px with the keyboard up (375x420)', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  await fast(page);
  const busy = await page.evaluate(() => {
    let best = null;
    for (const l of Game.state.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      const n = Game.State.npcsAt(l.id, ph).length;
      if (!l.closed && !l.away && (!best || n > best.n)) best = { loc: l.id, phase: ph, n };
    }
    return best;
  });
  assert.ok(busy.n >= 5, 'a place with five or more people: ' + busy.n);
  await page.evaluate(([loc, phase]) => { while (Game.state.time.phase !== phase) Game.State.apply({ advanceTime: 'long' }); Game.State.apply({ playerLocationId: loc }); }, [busy.loc, busy.phase]);
  await page.click('#mode-say');
  await page.focus('#cmd');
  // The keyboard comes up (Android, resizes-content: the window itself gets shorter).
  await page.setViewportSize({ width: 375, height: 420 });
  await page.waitForFunction(() => document.getElementById('app').getBoundingClientRect().height === 420 && document.getElementById('app').classList.contains('typing'));
  const m = await page.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const row = r('say-to');
    const chips = [...document.querySelectorAll('#say-to .say-chip')].map(c => c.getBoundingClientRect());
    return { rowH: row.height, rows: new Set(chips.map(c => Math.round(c.top))).size, feedH: r('feed-scroll').height, tabbar: getComputedStyle(document.querySelector('.tabbar')).display, pick: !!document.getElementById('say-pick'), cmdBottom: r('cmd').bottom, h: window.innerHeight, scrolls: document.getElementById('say-to').scrollWidth > document.getElementById('say-to').clientWidth };
  });
  assert.equal(m.rows, 1, 'one row of chips');
  assert.ok(m.rowH <= 56, 'row height ' + m.rowH);
  assert.ok(m.feedH >= 200, 'feed ' + m.feedH);
  assert.equal(m.tabbar, 'none', 'the tab bar steps aside while typing');
  assert.ok(m.pick, 'the "To:" picker leads the row');
  assert.ok(m.cmdBottom <= m.h, 'the input is on screen');
  await shot(page, 'B03_say_crowd_keyboard_375x420');
  assert.deepEqual(await overflowReport(page, 375), [], 'nothing sticks out (the row scrolls inside itself)');
  // The picker picks.
  const who = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[2].id);
  await page.selectOption('#say-pick', who);
  assert.equal(await page.evaluate(() => Game.UI.addressee), who);
  assert.equal(await page.getAttribute(`#say-to .say-chip[data-to="${who}"]`, 'aria-pressed'), 'true');
  // The keyboard goes down with the box still focused (Android's back key): the tab bar comes back.
  await page.focus('#cmd');
  await page.setViewportSize(PHONE);
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('typing'));
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).display), 'none', 'and comes back after');
});

s.test('quiet lines are kept with their turn: they survive a reload and go with an undo', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  const who = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[0]);
  await page.evaluate(id => Game.App.setPronouns(id, Game.State.npc(id).pronouns === 'she' ? 'he' : 'she'), who.id);
  await page.waitForTimeout(50);
  await sendText(page, '/cheat time night');
  const before = await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
  assert.ok(before.some(t => t.startsWith(`${who.name} goes by`)), before.join(' | '));
  assert.ok(before.includes('Clock set to day 1, night.'));
  const notes = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].notes);
  assert.ok(Array.isArray(notes) && notes.includes('Clock set to day 1, night.'), JSON.stringify(notes));
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  const after = await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
  for (const t of before) assert.ok(after.includes(t), 'kept after a reload: ' + t);
  // A failed turn's quiet lines are not kept.
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: { type: 'overloaded_error' } }));
  await sendText(page, 'I look around again');
  assert.equal(await page.evaluate(() => (Game.state.log[Game.state.log.length - 1].notes || []).length), notes.length);
});

s.test('a known person whose attitude crosses a band after a turn gets a quiet line (warms, won\'t forget); an edit does not', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const who = await page.evaluate(() => {
    const n = Game.State.npcsAt(Game.state.player.locationId)[0];
    Game.State.apply({ npcKnownToPlayer: [n.id] });
    Game.State.apply({ editPerson: { npcId: n.id, attitude: 0 } }, { source: 'player' });
    return { id: n.id, name: n.name };
  });
  await page.evaluate(id => Game.Api.Mock.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 10 }] }), who.id);
  await sendText(page, 'I buy a cold drink and thank them');
  let quiet = await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
  assert.ok(quiet.includes(`${who.name} warms to you.`), quiet.join(' | '));
  await page.evaluate(id => Game.Api.Mock.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: -20 }] }), who.id);
  await sendText(page, 'I tell them their coffee is terrible');
  quiet = await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
  assert.ok(quiet.includes(`${who.name} won't forget that.`), quiet.join(' | '));
  // An edit is not a turn: no line.
  const n0 = quiet.length;
  await page.evaluate(id => Game.App.editPerson(id, { attitude: 80 }), who.id);
  await page.waitForTimeout(50);
  quiet = await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
  assert.equal(quiet.filter(t => /warms to you/.test(t)).length, 1, quiet.join(' | '));
  assert.equal(quiet.length, n0 + 1, 'only the edit line');
});

s.test('the feed keeps its place after Settings and Saves; the toast sits at the top on a phone; dividers and the top bar carry the weekday', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  for (let i = 0; i < 6; i++) await sendText(page, 'I look around at the pumps and the road and the river beyond them');
  await page.evaluate(() => { const f = document.getElementById('feed-scroll'); f.scrollTop = 120; f.dispatchEvent(new Event('scroll')); });
  await page.click('#tb-settings');
  await page.click('#settings-done');
  assert.equal(await page.evaluate(() => document.getElementById('feed-scroll').scrollTop), 120, 'back where it was');
  // Weekday: from the engine's calendar when it has one (a stand-in here before it lands).
  await page.evaluate(() => { if (typeof Game.State.weekday !== 'function') Game.State.weekday = d => ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday'][(((d || Game.state.time.day) - 1) % 7 + 7) % 7]; Game.UI.rebuildFeed(); Game.UI.renderGame(); });
  const w = await page.evaluate(() => ({ bar: document.querySelector('.tb-time').textContent, time: document.getElementById('tb-time').textContent, div: [...document.querySelectorAll('#feed .f-divider')].pop().textContent, wd: Game.State.weekday(Game.state.time.day) }));
  assert.equal(w.bar, `${w.wd.slice(0, 3)} · ${w.time}`);
  assert.match(w.div, new RegExp(`^Day \\d+ · ${w.wd} · (Morning|Afternoon|Evening|Night)$`));
  const phone = await open(h, PHONE);
  await quickStart(phone);
  await phone.evaluate(() => Game.UI.toast('Saved.'));
  const t = await phone.evaluate(() => ({ toast: document.getElementById('toast').getBoundingClientRect(), composer: document.querySelector('.composer').getBoundingClientRect() }));
  assert.ok(t.toast.bottom < t.composer.top - 100, 'the toast is near the top, clear of the composer');
});

// ----- C. Panels -----

s.test('Journal: Story so far (news by day, chronicle), Leads (who told you, when), Threads (their people a tap away), You owe (countdown, settled struck), Notes (day and phase)', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const x = await page.evaluate(() => {
    const st = Game.state;
    const r = st.rumours.find(q => q.sourceNpcId);
    Game.State.apply({ rumoursHeard: [r.id] });
    const creditor = st.player.looseEnds[0].npcId;
    st.news = st.news || [];
    st.news.push({ day: 1, phase: 'morning', text: 'The council set the bridge vote for Tuesday.', factionId: null, public: true, seen: true });
    st.news.push({ day: 1, phase: 'morning', text: 'A secret nobody heard.', factionId: null, public: false, seen: false });
    st.player.obligations = [
      { id: 'obl_debt_x', kind: 'debt', npcId: creditor, text: '', amount: 400, dueDay: 3, itemName: null, status: 'open', onMiss: [], onMet: [], createdTurn: 0, createdDay: 1 },
      { id: 'obl_promise_x', kind: 'promise', npcId: creditor, text: 'Carry the letter to the church', amount: null, dueDay: 2, itemName: null, status: 'met', onMiss: [], onMet: [], createdTurn: 0, createdDay: 1 }
    ];
    Game.UI.openPanel('journal');
    return { rumour: r, creditor: Game.State.npc(creditor), teller: Game.State.npc(r.sourceNpcId) };
  });
  const j = await page.evaluate(() => {
    const sec = k => document.querySelector(`#panel-body [data-section="${k}"]`);
    return {
      heads: [...document.querySelectorAll('#panel-body .jr-sec > h3')].map(e => e.textContent),
      story: sec('story').textContent, leads: sec('leads').textContent, owe: [...sec('owe').querySelectorAll('li')].map(li => ({ text: li.textContent, done: li.classList.contains('jr-done') })),
      notes: sec('notes').textContent, people: [...sec('threads').querySelectorAll('[data-npc]')].map(b => b.dataset.npc)
    };
  });
  assert.deepEqual(j.heads, ['Story so far', 'Leads', 'Threads', 'You owe / are owed', 'Notes']);
  assert.match(j.story, /Day 1 · .*Morning.*The council set the bridge vote for Tuesday\./);
  assert.ok(!j.story.includes('A secret nobody heard'), 'only news the player has had');
  assert.ok(j.leads.includes(x.rumour.text));
  assert.ok(j.leads.includes('told you') && j.leads.includes('day 1'), j.leads);
  const debt = j.owe.find(o => o.text.includes('$400'));
  assert.ok(debt && /You owe .* \$400due Day 3 \(2 days\)/.test(debt.text), JSON.stringify(j.owe));
  assert.ok(j.owe.find(o => o.text.includes('Carry the letter')).done, 'a met obligation is struck through');
  assert.match(j.notes, /Day 1 · .*Morning.*Arrived in /);
  await shot(page, 'C01_journal_1280');
  // A thread's person opens their card.
  assert.ok(j.people.length > 0);
  await page.click(`#panel-body [data-section="threads"] [data-npc="${j.people[0]}"]`);
  assert.equal(await page.evaluate(() => Game.UI.tab), 'people');
  assert.equal(await page.evaluate(() => Game.UI.openPerson), j.people[0]);
});

s.test('People: a search box that stays put, sorting, Elsewhere and Gone folded away, and hurt or away shown on the card', async h => {
  const page = await open(h);
  await quickStart(page);
  const pick = await page.evaluate(() => {
    const st = Game.state;
    const all = st.npcs.filter(n => n.alive !== false && Game.presenceOf(n) === 'here');
    Game.State.apply({ npcKnownToPlayer: st.npcs.map(n => n.id) });
    for (const n of st.npcs) if (!st.seen[n.id]) st.seen[n.id] = { locationId: st.player.locationId, day: 1, phase: 'morning', turn: 0 };
    const hurt = all[3];
    hurt.hurtUntilDay = st.time.day + 2;
    Game.UI.openPanel('people');
    return { first: all[5], hurt: { id: hurt.id, until: hurt.hurtUntilDay } };
  });
  const groups = await page.evaluate(() => [...document.querySelectorAll('#panel-body .people-group')].map(g => ({ key: g.dataset.group, folded: g.tagName === 'DETAILS' && !g.open })));
  for (const k of ['elsewhere', 'gone']) { const g = groups.find(x => x.key === k); if (g) assert.equal(g.folded, true, k + ' folded'); }
  assert.match(await page.textContent(`.pcard[data-npc="${pick.hurt.id}"] .pcard-meta`), new RegExp(`Hurt, until day ${pick.hurt.until}`));
  // Search: by name.
  await page.fill('#people-search', pick.first.name.split(' ')[0]);
  const shown = await page.evaluate(() => [...document.querySelectorAll('#panel-body .pcard')].filter(c => !c.hidden && !c.closest('[hidden]')).map(c => c.dataset.npc));
  assert.ok(shown.includes(pick.first.id) && shown.length < 10, JSON.stringify(shown));
  // ...and by place.
  const place = await page.evaluate(() => Game.State.loc(Game.state.player.locationId).name);
  await page.fill('#people-search', place.toLowerCase());
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#panel-body .pcard')].filter(c => !c.hidden).length) > 0);
  await page.fill('#people-search', 'zzzz nobody');
  assert.ok(await page.isVisible('.people-none'));
  await page.fill('#people-search', '');
  // The box stays at the top while the list scrolls.
  await page.evaluate(() => { document.getElementById('panel-body').scrollTop = 1500; });
  const top = await page.evaluate(() => document.getElementById('people-search').getBoundingClientRect().top - document.getElementById('panel-body').getBoundingClientRect().top);
  assert.ok(top >= -1 && top < 40, 'sticky search: ' + top);
  await shot(page, 'C02_people_search_1280');
  // Sort by name.
  await page.click('[data-sort="name"]');
  const names = await page.evaluate(() => [...document.querySelectorAll('#panel-body [data-group="known"] .pcard-name')].map(n => n.textContent));
  assert.deepEqual(names, names.slice().sort((a, b) => a.localeCompare(b)));
  // The editor: Look, voice and history folded; Save and Cancel stuck to the bottom.
  const id = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[0].id);
  await page.evaluate(i => Game.UI.editPerson(i), id);
  const ed = await page.evaluate(() => ({ more: document.querySelector('.pedit-more').open, pos: getComputedStyle(document.querySelector('.pedit-actions')).position }));
  assert.deepEqual(ed, { more: false, pos: 'sticky' });
});

s.test('Places: labels hide no marker and no other label at several positions; the ring and a bold label mark here; Go there on exits and in a sheet; closed days and bans in the sheet; Expand map on a phone', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const ids = await page.evaluate(() => Game.state.locations.filter(l => l.discovered && l.away !== true).map(l => l.id));
  const overlaps = () => page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.map-place')].map(g => {
      const parts = [...g.querySelectorAll('.map-label, .map-mono')].map(x => x.getBoundingClientRect());
      const m = g.querySelector('.map-mark').getBoundingClientRect();
      const u = parts.reduce((a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 });
      return { id: g.dataset.loc, label: u, mark: { l: m.left, t: m.top, r: m.right, b: m.bottom } };
    });
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    const out = [];
    for (const a of boxes) for (const b of boxes) {
      if (a === b) continue;
      if (hit(a.label, b.mark)) out.push(`${a.id} label over ${b.id} marker`);
      if (a.id < b.id && hit(a.label, b.label)) out.push(`${a.id} and ${b.id} labels`);
    }
    return out;
  });
  // The places a game starts knowing, from every one of them, morning and evening: nothing hidden.
  for (const id of ids) {
    for (const phase of ['morning', 'evening']) {
      await page.evaluate(([i, ph]) => { while (Game.state.time.phase !== ph) Game.State.apply({ advanceTime: 'long' }); Game.State.apply({ playerLocationId: i }); Game.UI.openPanel('places'); }, [id, phase]);
      assert.deepEqual(await overlaps(), [], `at ${id}, ${phase}`);
    }
  }
  // Every place found (the map at its most crowded): at most two small touches anywhere (the old labels hid four or five).
  const all = await page.evaluate(() => { for (const l of Game.state.locations) if (l.away !== true) l.discovered = true; return Game.state.locations.filter(l => l.away !== true).map(l => l.id); });
  for (const id of [all[0], all[Math.floor(all.length / 3)], all[Math.floor(all.length / 2)], all[all.length - 1]]) {
    await page.evaluate(i => { Game.State.apply({ playerLocationId: i }); Game.UI.openPanel('places'); }, id);
    const o = await overlaps();
    assert.ok(o.length <= 2, `at ${id} with every place found: ${o.join('; ')}`);
  }
  await shot(page, 'C03_map_labels_1280', { clip: await page.evaluate(() => { const r = document.querySelector('.map').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; }) });
  const here = await page.evaluate(() => { const g = document.querySelector('.map-place[data-here="1"]'); return { ring: !!g.querySelector('.map-ring'), caption: g.querySelectorAll('.map-caption').length, bold: getComputedStyle(g.querySelector('.map-label')).fontWeight }; });
  assert.deepEqual([here.ring, here.caption, Number(here.bold) >= 600], [true, 0, true], 'ring and bold label, no caption');
  // Go there: an exit.
  const exit = await page.evaluate(() => [...document.querySelectorAll('#panel-body .exit-list li')].filter(li => !/\(closed\)/.test(li.textContent)).map(li => li.querySelector('[data-go]')).find(Boolean).dataset.go);
  await page.click(`#panel-body .exit-list [data-go="${exit}"]`);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), exit);
  // A place's sheet: closed days, a ban and Go there.
  const other = await page.evaluate(() => {
    const st = Game.state;
    const l = st.locations.find(x => x.discovered && x.away !== true && x.id !== st.player.locationId && x.type !== 'road');
    l.closedOn = ['Sunday'];
    st.bans = [{ locationId: l.id, untilDay: st.time.day + 3, byNpcId: null }];
    Game.UI.openPanel('places');
    Game.UI.togglePlace(l.id, true);
    return { id: l.id, until: st.time.day + 3 };
  });
  const sheet = await page.textContent(`.plcard[data-loc="${other.id}"] .plcard-more`);
  assert.ok(sheet.includes('Closed Sundays'), sheet);
  assert.ok(sheet.includes(`You are banned until Day ${other.until}.`), sheet);
  assert.ok(await page.isVisible(`.plcard[data-loc="${other.id}"] [data-go]`));
  // Phone: Expand map fills the screen; Escape closes it.
  const phone = await open(h, PHONE);
  await quickStart(phone);
  await phone.click('[data-open-tab="places"]');
  await phone.waitForTimeout(150);
  await phone.click('.map-expand');
  const box = await phone.evaluate(() => { const r = document.querySelector('.map.expanded').getBoundingClientRect(); return [r.width, r.height, window.innerWidth, window.innerHeight]; });
  assert.ok(box[0] >= box[2] - 1 && box[1] >= box[3] - 1, 'full screen: ' + box);
  await shot(phone, 'C04_map_expanded_375');
  await phone.keyboard.press('Escape');
  assert.equal(await phone.locator('.map.expanded').count(), 0);
});

s.test('Character: a standing row per faction, Spend beside story points (fills /fact), conditions with days left; Debug lists news, obligations, bans, events and the session cost', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => { Game.State.apply({ conditionsAdded: [{ name: 'Stiff', effect: '-1 might', untilDay: Game.state.time.day + 2 }] }); Game.UI.openPanel('character'); });
  const c = await page.evaluate(() => ({ reps: [...document.querySelectorAll('.rep-list li')].length, factions: Object.keys(Game.state.player.reputation).length, cond: document.querySelector('#panel-body').textContent }));
  assert.equal(c.reps, c.factions);
  assert.match(c.cond, /Stiff \(-1 might\) · 2 days left/);
  await page.click('#sp-spend');
  assert.equal(await page.inputValue('#cmd'), '/fact ');
  await sendText(page, '/debug');
  const dbg = await page.evaluate(() => [...document.querySelectorAll('#panel-body h3')].map(e => e.textContent));
  for (const k of ['News', 'Obligations', 'Bans', 'Events fired']) assert.ok(dbg.includes(k), k);
  assert.match(await page.textContent('#panel-body'), /session cost: \$0\.0000 over \d+ turns/);
});

// ----- D. Settings -----

s.test('Settings: Quality presets set the models and effort (the raw fields under Advanced), Check key, this session\'s turns and cost, and a warning beside Remember', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  await page.click('#tb-settings');
  assert.match(await page.textContent('#session-line'), /^This session: 1 turn · \$0\.00$/);
  assert.ok(await page.isChecked('input[name="set-preset"][value="standard"]'), 'the defaults are Standard');
  assert.equal(await page.evaluate(() => document.getElementById('set-advanced').open), false, 'the raw fields are folded away');
  assert.match(await page.textContent('#remember-warn'), /other HTML files/);
  await page.check('input[name="set-preset"][value="thrifty"]');
  assert.deepEqual(await page.evaluate(() => { const x = Game.Storage.settings(); return [x.narratorModel, x.parserModel, x.effort]; }), ['claude-sonnet-5-5', 'claude-haiku-5-5', { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' }]);
  await page.check('input[name="set-preset"][value="best"]');
  assert.equal(await page.evaluate(() => Game.Storage.settings().effort.narrator), 'high');
  await page.click('#set-advanced > summary');
  assert.equal(await page.inputValue('#set-narrator-model'), 'claude-opus-5-5');
  await page.fill('#set-parser-model', 'claude-haiku-5-5');
  await page.press('#set-parser-model', 'Tab');
  assert.ok(await page.isVisible('#preset-custom'), 'a change of their own is Custom');
  // Check key: a hidden character is caught before any call; then Api.checkKey answers.
  await page.fill('#set-key', 'sk-ant-abc​def');
  await page.click('#set-check-key');
  assert.match(await page.textContent('#key-status'), /hidden character/);
  await page.evaluate(() => { if (typeof Game.Api.checkKey !== 'function') Game.Api.checkKey = async () => ({ ok: true }); });
  await page.fill('#set-key', 'sk-ant-test-0123456789');
  await page.click('#set-check-key');
  await page.waitForFunction(() => /The key (works|did not work)/.test(document.getElementById('key-status').textContent));
  await shot(page, 'D01_settings_1280', { fullPage: true });
});

// ----- E. Storage safety -----

s.test('a different game never silently replaces the autosave: the old one is kept as the previous autosave (Restore previous), and an unslotted one asks first', async h => {
  const page = await open(h);
  await quickStart(page, { name: 'Alpha', seed: 1 });
  await fast(page);
  await sendText(page, 'I look around');
  const alpha = await page.evaluate(() => Game.Storage.gameId(Game.state));
  // A second game: Alpha goes to .prev.
  await quickStart(page, { name: 'Beta', seed: 2 });
  const prev = await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave.prev')));
  assert.equal(prev.state.player.name, 'Alpha');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).state.player.name), 'Beta');
  // New game asks: Beta is in no slot.
  await page.evaluate(() => Game.App.quitToTitle());
  await page.click('#btn-new');
  assert.ok(await page.isVisible('#ask'));
  assert.match(await page.textContent('#ask-text'), /Beta · Day 1 · .* is only in the autosave, not in a save slot\./);
  await shot(page, 'E01_ask_replace_1280');
  await page.click('#ask-no');
  assert.equal(await page.evaluate(() => Game.UI.screen), 'title', 'Keep it: nothing happens');
  // Restore previous: Alpha comes back and Beta becomes the previous one.
  await page.click('#btn-load');
  assert.ok(await page.isVisible('#slot-prev'));
  await page.click('#slot-prev [data-action="restore"]');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => Game.Storage.gameId(Game.state)), alpha);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave.prev')).state.player.name), 'Beta');
  // A game saved in a slot is not asked about.
  await page.evaluate(() => Game.Storage.saveSlot(1, 'Alpha kept'));
  await page.evaluate(() => Game.App.quitToTitle());
  await page.click('#btn-new');
  assert.ok(await page.isHidden('#ask'), 'in a slot: no question');
  assert.ok(await page.isVisible('#create-form-view, #create-mode-view'));
});

s.test('a game that cannot be drawn leaves the autosave alone; a damaged autosave is explained with a download; a newer save warns; an import refusal gives the reason; a big file is refused', async h => {
  const page = await open(h);
  await quickStart(page, { name: 'Keeper' });
  const good = await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).state);
  // A save that loads but cannot be drawn (drawing made to fail here): nothing of it is written.
  const r = await page.evaluate(() => {
    const env = Game.Storage.envelope('bad');
    env.state.meta.createdAt = 'another game';
    env.state.player.name = 'Intruder';
    const real = Game.UI.rebuildFeed;
    Game.UI.rebuildFeed = () => { throw new Error('cannot draw it'); };
    try { Game.App.enter(env, { confirmed: true }); return 'loaded'; } catch (e) { return 'refused: ' + e.message; } finally { Game.UI.rebuildFeed = real; Game.UI.rebuildFeed(); }
  });
  assert.equal(r, 'refused: cannot draw it');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).state), good, 'the autosave still holds the game it had');
  assert.equal(await page.evaluate(() => Game.state.player.name), 'Keeper', 'the game in play is back');
  // A newer save: a warning banner.
  await page.evaluate(() => { const env = Game.Storage.envelope('new'); env.state.meta.rulesVersion = 99; Game.App.enter(env, { confirmed: true }); });
  assert.ok(await page.isVisible('#banner'));
  assert.match(await page.textContent('#banner-text'), /newer version/);
  // A damaged autosave: explained on the title screen, and downloadable.
  await page.evaluate(() => { localStorage.setItem('novatria.autosave', '{"kind":"novatria-save","state":{"version":1}'); Game.App.quitToTitle(); });
  assert.ok(await page.isVisible('#title-broken'));
  assert.match(await page.textContent('#title-broken-text'), /could not be read/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-broken-download')]);
  assert.equal(dl.suggestedFilename(), 'damaged-autosave.json');
  await shot(page, 'E02_damaged_autosave_1280');
  // Import: the reason, and a size cap.
  await page.click('#btn-load');
  const bad = { kind: 'novatria-save', state: { version: 1, meta: { seed: 1 }, time: { day: 1, phase: 'morning' }, player: { stats: {} } } };
  await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await page.waitForFunction(() => document.getElementById('saves-error').textContent.length > 0);
  assert.match(await page.textContent('#saves-error'), /^That save is damaged: .+/);
  await page.setInputFiles('#import-file', { name: 'big.json', mimeType: 'application/json', buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 32) });
  await page.waitForFunction(() => /too big/.test(document.getElementById('saves-error').textContent));
  // Last exported.
  assert.equal(await page.textContent('#last-export'), 'Last exported: never.');
});

s.test('two tabs: when another tab writes the autosave this one goes read only with a banner, and can take over', async h => {
  const a = await open(h);
  await quickStart(a);
  await fast(a);
  const b = await a.context().newPage();
  await b.goto(a.url());
  await b.waitForFunction(() => window.Game && Game.App);
  await b.click('#btn-continue');
  await b.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(b, 'I look around');
  await a.waitForFunction(() => !document.getElementById('tab-bar').hidden);
  assert.match(await a.textContent('#tab-bar'), /open in another tab/);
  assert.equal(await a.evaluate(() => Game.Storage.readOnly), true);
  assert.equal(await a.isDisabled('#send'), true);
  await shot(a, 'E03_two_tabs_1280');
  const saved = await a.evaluate(() => localStorage.getItem('novatria.autosave'));
  await a.evaluate(() => Game.Storage.autosave());
  assert.equal(await a.evaluate(() => localStorage.getItem('novatria.autosave')), saved, 'a read-only tab writes nothing');
  await a.click('#tab-bar-take');
  assert.ok(await a.isHidden('#tab-bar'));
  await b.waitForFunction(() => !document.getElementById('tab-bar').hidden);
});

s.test('the CSP: present, API-only connect-src, Google fonts only, and the game still runs from file:// (fonts blocked in tests)', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(m, 'a CSP meta');
  const csp = Object.fromEntries(m[1].split(';').map(x => x.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(csp['connect-src'], ['https://api.anthropic.com']);
  assert.deepEqual(csp['font-src'], ['https://fonts.gstatic.com']);
  assert.ok(csp['style-src'].includes('https://fonts.googleapis.com'), 'the font stylesheet may load');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<link rel="stylesheet"'), 'before the font link');
  const violations = [];
  const page = await open(h);
  page.on('console', msg => { if (/Content Security Policy/i.test(msg.text()) && !/fonts\.g/.test(msg.text())) violations.push(msg.text()); });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), 1);
  assert.deepEqual(violations, [], 'the game itself breaks no rule of its policy');
  // A fetch anywhere but the API is refused by the page itself.
  const blocked = await page.evaluate(() => fetch('https://example.com/x').then(() => 'allowed', e => 'blocked: ' + e.message));
  assert.match(blocked, /^blocked/);
  assert.ok(violations.some(v => /example\.com/.test(v) && /connect-src/.test(v)), 'and the browser says why: ' + violations.join(' | '));
});

// ----- F. Commands -----

s.test('the ⋯ actions: beside the toggle and in the phone menu; Look around runs /look; Wait until… lists the phases; Commands help opens the list with descriptions on two lines on a phone; Undo is a small link on the newest line', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  const box = await page.evaluate(() => { const a = document.getElementById('act-btn').getBoundingClientRect(); const t = document.querySelector('.mode-toggle').getBoundingClientRect(); return { a, t }; });
  assert.ok(box.a.left >= box.t.right - 1 && Math.abs(box.a.top - box.t.top) < 4, 'beside the toggle');
  assert.equal(await page.getAttribute('#cmd', 'placeholder'), '/ or ⋯ for commands');
  await page.click('#act-btn');
  const items = await page.$$eval('#act-pop [role="menuitem"]', n => n.map(x => x.dataset.act));
  for (const k of ['look', 'wait', 'rest', 'undo', 'fact', 'help']) assert.ok(items.includes(k), k);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'look', 'the focus goes into the list');
  await shot(page, 'F01_actions_375');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'wait');
  await page.keyboard.press('Enter');
  const phases = await page.$$eval('#act-pop [role="menuitem"]', n => n.map(x => x.dataset.act));
  assert.ok(phases.filter(p => /^wait-/.test(p)).length === 3);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#act-pop'));
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await page.click('#act-btn');
  await page.click('#act-pop [data-act="look"]');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].input), '/look');
  // Undo: a small link on the newest input line; it takes the turn back.
  assert.equal(await page.locator('#feed .f-undo').count(), 1);
  const turnBefore = await page.evaluate(() => Game.state.meta.turn);
  await page.click('#feed .f-undo');
  await page.waitForFunction(t => Game.state.meta.turn < t, turnBefore);
  assert.ok(await page.evaluate(() => Game.state.meta.turn) >= t0);
  // The phone menu has the actions too.
  await page.click('#tb-menu');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.menu), 'saves', 'the menu takes the focus');
  await page.click('[data-menu="actions"]');
  assert.ok(await page.isVisible('#act-pop'));
  await page.click('#act-pop [data-act="help"]');
  await page.waitForSelector('#ac:not([hidden])');
  const desc = await page.evaluate(() => { const li = document.querySelector('#ac li'); const n = li.querySelector('.ac-name').getBoundingClientRect(); const d = li.querySelector('.ac-desc').getBoundingClientRect(); return { shown: getComputedStyle(li.querySelector('.ac-desc')).display !== 'none', below: d.top >= n.bottom - 2 }; });
  assert.deepEqual(desc, { shown: true, below: true }, 'descriptions on a second line');
  await shot(page, 'F02_autocomplete_375');
});

// ----- G. Accessibility -----

s.test('accessibility: each screen focuses its heading; the phone sheet is modal and gives the focus back; arrow keys move between tabs; the tab bar says what it controls', async h => {
  const page = await open(h, PHONE);
  await page.click('#btn-settings');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-title');
  await page.click('#settings-done');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'title-name');
  await quickStart(page);
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(300);
  const open1 = await page.evaluate(() => ({ inert: document.querySelector('.story').inert, top: document.querySelector('#screen-game .topbar').inert, focus: document.activeElement.id, exp: document.querySelector('[data-open-tab="people"]').getAttribute('aria-expanded'), ctl: document.querySelector('[data-open-tab="people"]').getAttribute('aria-controls') }));
  assert.deepEqual(open1, { inert: true, top: true, focus: 'panel-close', exp: 'true', ctl: 'panel' });
  // Tab never leaves the sheet.
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.getElementById('panel').contains(document.activeElement)), 'focus stays in the sheet');
  // Arrow keys in the tablist.
  await page.focus('#tab-people');
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(() => [Game.UI.tab, document.activeElement.id]), ['journal', 'tab-journal']);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('.story').inert), false);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.openTab), 'people', 'the focus goes back to the opener');
});

s.test('contrast from the tokens: small faint text 4.5:1 or more, field edges and map roads 3:1 or more, in both themes', async h => {
  for (const scheme of ['dark', 'light']) {
    const page = await h.open({ colorScheme: scheme });
    const r = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = k => cs.getPropertyValue(k).trim();
      const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lum = hex => { const [r, g, b] = rgb(hex).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const x = lum(v(a)); const y = lum(v(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      return { theme: document.documentElement.dataset.theme, faintBg: ratio('--faint', '--bg'), faintSurface: ratio('--faint', '--surface'), fieldBg: ratio('--field', '--bg'), fieldSurface: ratio('--field', '--surface'), road: ratio('--map-road', '--map-land'), inputBorder: getComputedStyle(document.getElementById('set-key')).borderTopColor };
    });
    assert.ok(r.faintBg >= 4.5 && r.faintSurface >= 4.5, `${r.theme} faint ${r.faintBg.toFixed(2)} / ${r.faintSurface.toFixed(2)}`);
    assert.ok(r.fieldBg >= 3 && r.fieldSurface >= 3, `${r.theme} field ${r.fieldBg.toFixed(2)} / ${r.fieldSurface.toFixed(2)}`);
    assert.ok(r.road >= 3, `${r.theme} road ${r.road.toFixed(2)}`);
  }
});

s.test('UI.feed.rewriting dims the draft under "Rewriting…" and endNarration puts the final text in', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const node = Game.UI.feed.beginNarration({});
    Game.UI.feed.stream(node, 'First draft, a little too long.');
    Game.UI.feed.rewriting(node, true);
    const mid = { cls: node.classList.contains('rewriting'), label: (node.querySelector('.f-rewriting') || {}).textContent, draft: node.textContent.includes('First draft') };
    Game.UI.feed.endNarration(node, 'Second draft.');
    return { mid, end: { cls: node.classList.contains('rewriting'), label: !!node.querySelector('.f-rewriting'), text: node.textContent } };
  });
  assert.deepEqual(r.mid, { cls: true, label: 'Rewriting…', draft: true });
  assert.deepEqual(r.end, { cls: false, label: false, text: 'Second draft.' });
});

s.run();
