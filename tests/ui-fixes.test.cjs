'use strict';
/* The UI fixes (docs/notes/ui.md): the first five minutes (title, how to
   play, creation), the core loop (status line, Stop, queue, empty Enter,
   the kept-input notice, Say on a phone, notes that survive a reload),
   the panels (Journal, People search, the map's labels and Go there),
   Settings (presets, Check key, cost), storage safety (the previous
   autosave, asking first, another tab, a damaged or newer save, the CSP)
   and accessibility (focus, the modal sheet, tabs, contrast).
   Mock mode throughout. Screenshots go to $UI_SHOTS for a look by eye (none without it).
   Run with: node tests/run.cjs ui-fixes */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, GAME_PATH, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('ui-fixes');
// Screenshots only when UI_SHOTS names a folder for them (never a session's own path, and nothing written in CI).
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name, opts) => {
  if (!SHOTS) return;
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
    assert.match(t.chip, /^Offline demo \(canned replies\)\s*Add API key$/);
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
  // Changed by design in wave 4: the demo's own name, as a sentence.
  assert.equal(await page.textContent('#toast'), 'Offline demo off: playing with Claude.');
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
  assert.equal(await demo.textContent('#toast'), 'Offline demo off: playing with Claude.');
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
  assert.equal(await page.getAttribute('#cr-goal', 'placeholder'), 'Why you came, in a line');
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
    return { rowH: row.height, chips: chips.length, feedH: r('feed-scroll').height, tabbar: getComputedStyle(document.querySelector('.tabbar')).display, pick: !!document.getElementById('say-pick'), cmdBottom: r('cmd').bottom, h: window.innerHeight };
  });
  assert.equal(m.chips, 0, 'a busy place: the picker alone, not the chips again after it');
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
  assert.equal(await page.inputValue('#say-pick'), who);
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
  assert.ok(before.includes('Clock set to Day 1 · Night.'));
  const notes = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].notes);
  assert.ok(Array.isArray(notes) && notes.includes('Clock set to Day 1 · Night.'), JSON.stringify(notes));
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
  // The toast on a phone: clear of the composer and of the bars at the top (D13; see also the wave 2 toast test).
  const phone = await open(h, PHONE);
  await quickStart(phone);
  await phone.evaluate(() => Game.UI.toast('Saved.'));
  const t = await phone.evaluate(() => ({ toast: document.getElementById('toast').getBoundingClientRect(), composer: document.querySelector('.composer').getBoundingClientRect(), bar: document.getElementById('demo-bar').getBoundingClientRect() }));
  assert.ok(t.toast.bottom <= t.composer.top, 'the toast is clear of the composer');
  assert.ok(t.toast.top >= t.bar.bottom, 'and of the demo bar');
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
  assert.ok(j.leads.includes('told you') && j.leads.includes('Day 1'), j.leads);
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
  // "Hurt until Day N": the day they are about again (hurtUntilDay), as the engine's note says it and as a ban's "until Day N" is the day you are welcome again (changed by design at the wave-3 integration).
  assert.match(await page.textContent(`.pcard[data-npc="${pick.hurt.id}"] .pcard-meta`), new RegExp(`Hurt until Day ${pick.hurt.until}\\b`));
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
  // Changed by design in wave 4: the effect said as the sheet says stats ("−1 Might").
  assert.match(c.cond, /Stiff \(−1 Might\) · 2 days left/);
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
  await page.waitForFunction(() => /The key works|key did not work/.test(document.getElementById('key-status').textContent));
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

s.test('the ⋯ actions: beside the toggle and in the phone menu; Look around runs /look; Wait until… lists the phases; Commands help prints the command list (as /help does), and the list typed after "/" has descriptions on two lines on a phone; Undo is a small link on the newest line', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  // A phone: ⋯ ends the tab row (the input row keeps its width for the box).
  const box = await page.evaluate(() => { const a = document.getElementById('act-btn-m').getBoundingClientRect(); const t = document.querySelector('.tabbar').getBoundingClientRect(); return { a, t, rowBtn: getComputedStyle(document.getElementById('act-btn')).display }; });
  assert.ok(box.a.left >= box.t.right - 1 && Math.abs(box.a.top - box.t.top) < 4, 'at the end of the tab row');
  assert.equal(box.rowBtn, 'none', 'not in the input row');
  assert.equal(await page.getAttribute('#cmd', 'placeholder'), 'What do you do?');
  await page.click('#act-btn-m');
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
  await page.click('#act-btn-m');
  await page.click('#act-pop [data-act="look"]');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].input), '/look');
  // Undo: a small link on the newest input line (outside the story's live region); it takes the turn back.
  assert.ok(await page.isVisible('#undo-btn'));
  assert.equal(await page.locator('#feed .f-undo').count(), 0, 'not in the live region');
  const turnBefore = await page.evaluate(() => Game.state.meta.turn);
  await page.click('#undo-btn');
  await page.waitForFunction(t => Game.state.meta.turn < t, turnBefore);
  assert.ok(await page.evaluate(() => Game.state.meta.turn) >= t0);
  // The phone menu has the actions too.
  await page.click('#tb-menu');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.menu), 'saves', 'the menu takes the focus');
  await page.click('[data-menu="actions"]');
  assert.ok(await page.isVisible('#act-pop'));
  // Changed by design at the wave-3 integration: Commands help runs /help (the list as a notice in the story), not "/" in the box.
  const helps = await page.locator('#feed .f-notice.help').count();
  await page.click('#act-pop [data-act="help"]');
  await page.waitForFunction(n => document.querySelectorAll('#feed .f-notice.help').length === n + 1, helps);
  const help = await page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice.help')].pop(); return { text: n.textContent, ws: getComputedStyle(n).whiteSpace, inline: n.style.whiteSpace, box: document.getElementById('cmd').value, open: !document.getElementById('act-pop').hidden }; });
  assert.match(help.text, /\/skip <where or when>: Jump ahead to a place or time\n/);
  assert.deepEqual([help.ws, help.inline, help.box, help.open], ['pre-line', '', '', false], 'one command a line from the stylesheet; the box untouched; the list closed');
  await page.click('#cmd');
  await page.keyboard.type('/');
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

// ----- W. Wave 2 (docs/notes/ui.md, "Wave 2") -----

/* In the page: window.__cr(a, b), the contrast of two CSS colours. */
function contrastIn() {
  window.__cr = (a, b) => {
    const rgb = c => { const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; const v = ctx.fillStyle; if (v[0] === '#') return [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255); return v.match(/[\d.]+/g).slice(0, 3).map(x => +x / 255); };
    const lum = c => { const [r, g, b] = rgb(c).map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
}
const rectsMeet = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

s.test('wave 2, D1 and B11: a read-only tab plays nothing (⋯, the Undo link, Go there, the map, Edit, the pronoun chips); Play here instead loads the newer game first, keeps the autosave as the other tab saved it, and keeps an unreadable one aside', async h => {
  const a = await open(h);
  await quickStart(a);
  await fast(a);
  await sendText(a, 'I look around');
  const b = await a.context().newPage();
  await b.goto(a.url());
  await b.waitForFunction(() => window.Game && Game.App);
  await b.click('#btn-continue');
  await b.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(b, 'I look at the pumps');
  await sendText(b, 'I look at the road out of town');
  await a.waitForFunction(() => Game.Storage.readOnly && !document.getElementById('tab-bar').hidden);
  assert.equal(await a.textContent('#tab-bar-text'), 'This game is open in another tab, so this tab is read-only.');
  const turnA = await a.evaluate(() => Game.state.meta.turn);
  const turnB = await b.evaluate(() => Game.state.meta.turn);
  assert.equal(turnB, turnA + 2);
  // Nothing that plays a turn is offered.
  assert.ok(await a.isHidden('#undo-btn'), 'no Undo link');
  assert.equal(await a.evaluate(() => Game.UI.canAct()), false, 'the one guard says no');
  await a.click('#act-btn');
  for (const k of ['look', 'rest', 'undo']) assert.equal(await a.isDisabled(`#act-pop [data-act="${k}"]`), true, k + ' is off');
  await a.keyboard.press('Escape');
  await a.evaluate(() => Game.UI.openPanel('places'));
  assert.ok(await a.evaluate(() => { const go = [...document.querySelectorAll('#panel-body [data-go]')]; return go.length > 0 && go.every(x => x.disabled); }), 'Go there is off');
  const who = await a.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[0].id);
  await a.evaluate(id => { Game.UI.openPanel('people'); Game.UI.togglePerson(id, true); }, who);
  if (await a.locator(`.pcard[data-npc="${who}"] .pcard-edit`).count()) {
    assert.equal(await a.isDisabled(`.pcard[data-npc="${who}"] .pcard-edit`), true, 'Edit is off');
    assert.ok(await a.evaluate(id => [...document.querySelectorAll(`.pcard[data-npc="${id}"] .pcard-pchip`)].every(x => x.disabled), who), 'the pronoun chips are off');
  }
  // Even called directly, every entry point refuses (and says why).
  const calls0 = await a.evaluate(() => Game.Api.Mock.calls.length);
  const exit = await a.evaluate(() => Game.State.loc(Game.state.player.locationId).exits[0]);
  const res = await a.evaluate(async ([id, npc]) => [await Game.UI.runAction('/look'), await Game.UI.travel(id), Game.UI.editPerson(npc)], [exit, who]);
  assert.deepEqual(res, [null, null, false]);
  assert.equal(await a.evaluate(() => document.getElementById('cmd').readOnly), true, 'the box is read only');
  assert.equal(await a.isDisabled('#send'), true);
  assert.equal(await a.evaluate(() => Game.state.meta.turn), turnA, 'no turn was played here');
  assert.equal(await a.evaluate(() => Game.Api.Mock.calls.length), calls0, 'and nothing was called');
  assert.match(await a.textContent('#toast'), /open in another tab/);
  await shot(a, 'W01_read_only_1280');
  // Play here instead: the newer game first, then this tab plays; the autosave is the other tab's game.
  const saved = await a.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).state);
  await a.click('#tab-bar-take');
  assert.equal(await a.evaluate(() => Game.state.meta.turn), turnB, 'this tab shows the turns the other tab played');
  assert.equal(await a.evaluate(() => [...document.querySelectorAll('#feed .f-input')].pop().textContent), 'I look at the road out of town');
  assert.deepEqual(await a.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).state), saved, 'the autosave still holds the newer game');
  assert.deepEqual(await a.evaluate(() => [Game.Storage.readOnly, document.getElementById('tab-bar').hidden]), [false, true]);
  await b.waitForFunction(() => Game.Storage.readOnly, null, { timeout: 3000 });
  assert.equal(await a.evaluate(() => Game.UI.canAct()), true);
  // An autosave the other tab left unreadable: kept as the previous autosave, this tab's game saved, and the banner says so.
  await b.evaluate(() => localStorage.setItem('novatria.autosave', '{ not json'));
  await a.waitForFunction(() => Game.Storage.readOnly);
  await a.click('#tab-bar-take');
  const after = await a.evaluate(() => ({ prev: localStorage.getItem('novatria.autosave.prev'), turn: JSON.parse(localStorage.getItem('novatria.autosave')).state.meta.turn, banner: document.getElementById('banner').hidden ? '' : document.getElementById('banner-text').textContent }));
  assert.equal(after.prev, '{ not json', 'the unreadable autosave is kept aside');
  assert.equal(after.turn, turnB);
  assert.match(after.banner, /could not be read.*previous autosave/);
});

s.test('wave 2, D2: on a phone the composer is one line with its placeholder, before and after a send and in Say mode, and the placeholder is never cut', async h => {
  for (const vp of [PHONE, { width: 390, height: 844 }]) {
    const page = await open(h, vp);
    await quickStart(page);
    await fast(page);
    const measure = () => page.evaluate(() => {
      const ta = document.getElementById('cmd');
      const cs = getComputedStyle(ta);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const r = ta.getBoundingClientRect();
      return { h: r.height, w: r.width, need: ctx.measureText(ta.placeholder).width, room: ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ph: ta.placeholder };
    });
    let m = await measure();
    assert.equal(m.ph, 'What do you do?');
    assert.ok(m.h <= 48, `${vp.width}: one line, ${m.h}px`);
    assert.ok(m.need <= m.room, `${vp.width}: the placeholder fits (${m.need} in ${m.room})`);
    assert.ok(m.w >= 200, `${vp.width}: the box keeps its width (${m.w})`);
    await sendText(page, 'I ask the man at the counter if there is any work around here');
    m = await measure();
    assert.ok(m.h <= 48, `${vp.width}: still one line after a send (${m.h}px)`);
    await page.click('#mode-say');
    m = await measure();
    assert.ok(m.h <= 48 && m.need <= m.room, `${vp.width}: Say mode too (${m.ph})`);
    // Typing still grows the box, and clearing it brings it back to one line.
    await page.fill('#cmd', 'A long line that wraps in a narrow box, then wraps again, and a third time to be sure of it.');
    assert.ok((await measure()).h > 60, 'a long line grows the box');
    await page.fill('#cmd', '');
    assert.ok((await measure()).h <= 48, 'and an empty box is one line again');
    if (vp === PHONE) await shot(page, 'W02_composer_375');
  }
});

s.test('wave 2, D3: Expand map (phone and laptop) is a modal view larger than the panel map; Close map has the focus, Tab stays inside, the rest is inert; Escape closes and the focus goes back to Expand map', async h => {
  for (const vp of [PHONE, LAPTOP]) {
    const page = await open(h, vp);
    await quickStart(page);
    await page.evaluate(() => { for (const l of Game.state.locations) if (l.away !== true) l.discovered = true; });
    if (vp === PHONE) { await page.click('[data-open-tab="places"]'); await page.waitForTimeout(300); } else await page.evaluate(() => Game.UI.openPanel('places'));
    const small = await page.evaluate(() => document.querySelector('.map-svg').getBoundingClientRect().width);
    await page.click('.map-expand');
    const m = await page.evaluate(() => {
      const map = document.querySelector('.map.expanded');
      const svg = map.querySelector('.map-svg');
      return {
        w: svg.getBoundingClientRect().width, box: map.getBoundingClientRect(),
        focus: document.activeElement.className, role: map.getAttribute('role'), modal: map.getAttribute('aria-modal'), title: document.getElementById(map.getAttribute('aria-labelledby')).textContent,
        inert: [document.querySelector('.story').inert, document.querySelector('.panel-head').inert, document.querySelector('.map-legend').inert, document.querySelector('.map-tools').inert],
        label: parseFloat(svg.getAttribute('font-size')) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width
      };
    });
    assert.ok(m.w >= small * 1.5, `${vp.width}: larger than the panel's map (${Math.round(m.w)} against ${Math.round(small)})`);
    assert.ok(m.box.width >= vp.width - 1 && m.box.height >= vp.height - 1, 'it covers the screen');
    assert.ok(m.label >= 13, 'labels read at 13px or more: ' + m.label);
    assert.match(m.focus, /map-close/);
    assert.deepEqual([m.role, m.modal], ['dialog', 'true']);
    assert.match(m.title, /^Map of /);
    assert.deepEqual(m.inert, [true, true, true, true], 'nothing behind it takes the focus');
    for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.querySelector('.map.expanded').contains(document.activeElement)), 'Tab stays in the map');
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(() => document.querySelector('.map.expanded').contains(document.activeElement)), 'so does Shift+Tab');
    if (vp === PHONE) assert.ok(await page.evaluate(() => { const p = document.querySelector('.map.expanded .map-pan'); return p.scrollWidth > p.clientWidth; }), 'a phone pans sideways');
    await shot(page, `W03_map_expanded_${vp.width}`);
    await page.keyboard.press('Escape');
    if (await page.locator('.map.expanded').count()) await page.keyboard.press('Escape'); // a picked place goes first
    assert.equal(await page.locator('.map.expanded').count(), 0);
    const back = await page.evaluate(() => ({ focus: document.activeElement.classList.contains('map-expand'), head: document.querySelector('.panel-head').inert, legend: document.querySelector('.map-legend').inert, story: document.querySelector('.story').inert }));
    assert.deepEqual(back, { focus: true, head: false, legend: false, story: vp === PHONE }, 'the sheet (phone) stays modal; the rest is back');
  }
});

s.test('wave 2, D4: the focus is never dropped to the page: Back to edit, a People sort chip, Edit on a phone, and Review with errors (the first field to fix, one message read out)', async h => {
  // (d) Review with errors on a laptop.
  const page = await open(h, LAPTOP);
  await page.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await page.click('#btn-new');
  await page.click('#cr-review');
  const r = await page.evaluate(() => ({ focus: document.activeElement.id, sum: document.getElementById('cr-errsum').textContent, alerts: [...document.querySelectorAll('#create-steps [role="alert"]')].length, invalid: document.getElementById('cr-name').getAttribute('aria-invalid') }));
  assert.equal(r.focus, 'cr-name', 'the first field to fix has the focus');
  assert.match(r.sum, /^Fix \d things first: name; background and age; /);
  assert.equal(r.alerts, 0, 'one summary is read out, not one alert per step');
  assert.equal(r.invalid, 'true');
  await shot(page, 'W04_review_errors_1280');
  // (a) Random character, then Back to edit: the form's heading.
  await page.click('#cr-random');
  await page.waitForSelector('#create-summary-view:not([hidden])');
  await page.click('#cr-edit');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'create-title');
  // (b) A sort chip keeps the focus through the redraw.
  const game = await open(h, LAPTOP);
  await quickStart(game);
  await game.evaluate(() => { Game.State.apply({ npcKnownToPlayer: Game.state.npcs.slice(0, 8).map(n => n.id) }); Game.UI.openPanel('people'); });
  await game.click('[data-sort="attitude"]');
  assert.equal(await game.evaluate(() => document.activeElement.dataset.sort), 'attitude');
  // A panel tab clicked (the tabs are drawn again): the new tab has the focus.
  await game.click('#tab-journal');
  assert.equal(await game.evaluate(() => document.activeElement.id), 'tab-journal');
  // A turn ending while a card's control has the focus: still there after the redraw.
  await game.click('#tab-people');
  const head = await game.evaluate(() => document.querySelector('#panel-body .pcard-head').id);
  await game.focus('#' + head);
  await game.evaluate(() => { Game.Api.Mock.delay = 0; });
  await game.evaluate(() => Game.Pipeline.submit('I look around', { mode: 'do', to: 'everyone' }));
  await game.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await game.evaluate(() => document.activeElement.id), head);
  // (c) Edit on a phone: the form takes the focus (no keyboard pops up).
  const phone = await open(h, PHONE);
  await quickStart(phone);
  const who = await phone.evaluate(() => { const n = Game.State.npcsAt(Game.state.player.locationId)[0]; Game.State.apply({ npcKnownToPlayer: [n.id] }); return n.id; });
  await phone.click('[data-open-tab="people"]');
  await phone.waitForTimeout(300);
  await phone.click(`#phead-${who}`);
  await phone.click(`.pcard[data-npc="${who}"] .pcard-edit`);
  assert.deepEqual(await phone.evaluate(() => [document.activeElement.tagName, document.activeElement.classList.contains('pedit')]), ['FORM', true]);
  // A phone's Next: the step heading, not a field (D12).
  const cr = await open(h, PHONE);
  await cr.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await cr.click('#btn-new');
  await cr.fill('#cr-name', 'Ilse');
  await cr.click('#cr-next');
  assert.equal(await cr.evaluate(() => document.activeElement.id), 'cr-h-background');
  await cr.click('.bg-choice >> nth=0');
  await cr.click('#cr-next');
  await cr.click('#cr-next');
  assert.equal(await cr.evaluate(() => document.activeElement.id), 'cr-h-goal', 'step 4: the heading, so no keyboard covers the suggestions');
  await cr.click('#cr-next');
  assert.equal(await cr.evaluate(() => document.activeElement.id), 'cr-goal', 'an error: the field to fix');
  assert.match(await cr.textContent('#cr-errsum'), /Write one line/);
});

s.test('wave 2, D5, D7, D15: text tokens 4.5:1 and control edges 3:1 on every background in both themes; placeholders 4.5:1; closed places and the river label without transparency; the rewriting draft legible', async h => {
  for (const scheme of ['light', 'dark']) {
    const page = await h.open({ colorScheme: scheme });
    await page.evaluate(contrastIn);
    const t = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = k => cs.getPropertyValue('--' + k).trim();
      const rows = [];
      for (const fg of ['text', 'muted', 'faint', 'accent', 'danger', 'att-cold', 'att-cool', 'att-mild', 'att-warm']) for (const bg of ['bg', 'surface', 'surface-2']) rows.push([fg, bg, window.__cr(v(fg), v(bg)), 4.5]);
      rows.push(['accent-ink', 'accent', window.__cr(v('accent-ink'), v('accent')), 4.5]);
      rows.push(['map-river', 'map-water', window.__cr(v('map-river'), v('map-water')), 4.5]);
      rows.push(['map-dim', 'map-land', window.__cr(v('map-dim'), v('map-land')), 4.5]);
      rows.push(['map-ink', 'map-land', window.__cr(v('map-ink'), v('map-land')), 4.5]);
      for (const bg of ['bg', 'surface', 'surface-2']) rows.push(['field (control edge)', bg, window.__cr(v('field'), v(bg)), 3]);
      return { theme: document.documentElement.dataset.theme, rows };
    });
    const bad = t.rows.filter(r => r[2] < r[3]).map(r => `${r[0]} on ${r[1]} ${r[2].toFixed(2)}`);
    assert.deepEqual(bad, [], `${t.theme}: under the bar`);
    // Placeholders and control edges as drawn.
    await quickStart(page);
    await page.evaluate(contrastIn);
    const drawn = await page.evaluate(() => {
      const ta = document.getElementById('cmd');
      const bgOf = el => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return getComputedStyle(document.body).backgroundColor; };
      const ph = window.__cr(getComputedStyle(ta, '::placeholder').color, getComputedStyle(ta).backgroundColor);
      const edges = ['#act-btn', '.mode-toggle', '#tb-panel'].map(sel => { const el = document.querySelector(sel); return [sel, window.__cr(getComputedStyle(el).borderTopColor, bgOf(el.parentElement))]; });
      return { ph, edges };
    });
    assert.ok(drawn.ph >= 4.5, `${t.theme}: placeholder ${drawn.ph.toFixed(2)}`);
    for (const [sel, c] of drawn.edges.filter(e => e[0] !== '#tb-panel')) assert.ok(c >= 3, `${t.theme}: ${sel} edge ${c.toFixed(2)}`);
    // A closed place on the map: a token, not opacity; the river's name.
    const map = await page.evaluate(() => {
      const st = Game.state;
      const l = st.locations.find(x => x.discovered && x.away !== true && x.id !== st.player.locationId);
      l.closed = true;
      Game.UI.openPanel('places');
      const g = document.querySelector(`.map-place[data-loc="${l.id}"]`);
      const root = getComputedStyle(document.documentElement);
      const lab = g.querySelector('.map-label');
      const river = document.querySelector('.map-river-label');
      return { opacity: [getComputedStyle(lab).opacity, getComputedStyle(g.querySelector('.map-mark')).opacity], label: window.__cr(getComputedStyle(lab).fill, root.getPropertyValue('--map-land').trim()), river: river ? window.__cr(getComputedStyle(river).fill, root.getPropertyValue('--map-water').trim()) : 9 };
    });
    assert.deepEqual(map.opacity, ['1', '1'], 'no transparency');
    assert.ok(map.label >= 4.5 && map.river >= 4.5, `${t.theme}: closed label ${map.label.toFixed(2)}, river ${map.river.toFixed(2)}`);
    // The draft under "Rewriting…": dimmed with a colour that still reads.
    const draft = await page.evaluate(() => {
      const node = Game.UI.feed.beginNarration({});
      Game.UI.feed.stream(node, 'A first draft.');
      Game.UI.feed.rewriting(node, true);
      const p = [...node.querySelectorAll('p')].find(x => x.textContent === 'A first draft.');
      return { c: window.__cr(getComputedStyle(p).color, getComputedStyle(document.body).backgroundColor), o: getComputedStyle(p).opacity };
    });
    assert.ok(draft.c >= 4.5 && draft.o === '1', `${t.theme}: rewriting draft ${draft.c.toFixed(2)}`);
  }
});

s.test('wave 2, D6: editing someone on a phone with the keyboard up: the search and sort step aside and a focused field sits above the Save bar', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  const who = await page.evaluate(() => { const n = Game.State.npcsAt(Game.state.player.locationId)[0]; Game.State.apply({ npcKnownToPlayer: Game.state.npcs.slice(0, 10).map(x => x.id).concat(n.id) }); return n.id; });
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(300);
  await page.click(`#phead-${who}`);
  await page.click(`.pcard[data-npc="${who}"] .pcard-edit`);
  assert.equal(await page.locator('.people-tools').count(), 0, 'no search and sort header while editing');
  await page.setViewportSize({ width: 375, height: 420 });
  await page.waitForTimeout(200);
  for (const k of ['role', 'relation', 'age']) {
    await page.focus(`#pe-${k}-${who}`);
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => ({ f: document.activeElement.getBoundingClientRect(), bar: document.querySelector('.pedit-actions').getBoundingClientRect(), body: document.getElementById('panel-body').getBoundingClientRect() }));
    assert.ok(m.f.bottom <= m.bar.top + 1, `${k}: above the Save bar (${Math.round(m.f.bottom)} / ${Math.round(m.bar.top)})`);
    assert.ok(m.f.top >= m.body.top - 1, `${k}: not above the panel either`);
  }
  await shot(page, 'W06_editor_keyboard_375x420');
  await page.click('.pedit-cancel');
  assert.equal(await page.locator('.people-tools').count(), 1, 'back after the editor closes');
});

s.test('wave 2, D8 and polish: the recap on Continue is line by line under a heading; after a night the overnight news stands out and the recap does not repeat it', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  const r = await page.evaluate(() => {
    const n = [...document.querySelectorAll('#feed .f-notice')].pop();
    const cs = getComputedStyle(n);
    return { recap: n.classList.contains('recap'), ws: cs.whiteSpace, lines: n.textContent.split('\n').length, h: n.getBoundingClientRect().height, lh: parseFloat(cs.lineHeight) || 20, head: getComputedStyle(n, '::before').content, keys: [...n.querySelectorAll('.f-recap-k')].map(k => k.textContent), text: n.textContent };
  });
  assert.ok(r.recap, 'the recap notice');
  assert.equal(r.ws, 'pre-line');
  assert.ok(r.lines >= 3, 'several lines: ' + r.text);
  assert.ok(r.h > 3 * r.lh, 'drawn on several lines');
  assert.match(r.head, /^"Where things stand"/);
  assert.ok(r.keys.includes('Here:'), 'the kind of each line in bold: ' + r.keys.join(' '));
  await shot(page, 'W07_recap_1280');
  // After a night's sleep: the overnight news, then a recap without its "In town" line.
  await page.evaluate(() => { Game.Api.Mock.delay = 0; const st = Game.state; if (!Array.isArray(st.news)) st.news = []; st.news.push({ day: st.time.day + 1, phase: 'morning', text: 'The council voted to close the old bridge.', public: true, seen: false }); });
  await sendText(page, '/rest');
  const after = await page.evaluate(() => {
    const news = [...document.querySelectorAll('#feed .f-quiet.f-news')].pop();
    const recap = [...document.querySelectorAll('#feed .f-notice.recap')].pop();
    return { news: news ? news.textContent : '', key: news ? (news.querySelector('.f-news-k') || {}).textContent : '', recap: recap ? recap.textContent : '' };
  });
  assert.match(after.news, /^Overnight in town: The council voted/);
  assert.equal(after.key, 'Overnight in town: ');
  assert.ok(after.recap && !/\nIn town:/.test(after.recap), 'no "In town" repeat: ' + after.recap);
});

s.test('wave 2, D9 and D10: on a phone the command list spans the input row; a busy place in Say mode shows the "To:" picker alone, wide enough for every name, and the focus stays on it', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  await fast(page);
  await page.focus('#cmd');
  await page.keyboard.type('/');
  await page.waitForSelector('#ac:not([hidden])');
  const ac = await page.evaluate(() => ({ ac: document.getElementById('ac').getBoundingClientRect().width, row: document.querySelector('.input-row').getBoundingClientRect().width, box: document.getElementById('cmd').getBoundingClientRect().width }));
  assert.ok(ac.ac >= ac.row - 2 && ac.ac > ac.box + 100, `the list spans the row: ${ac.ac} (row ${ac.row}, box ${ac.box})`);
  assert.deepEqual(await overflowReport(page, 375), []);
  await shot(page, 'W08_autocomplete_375');
  await page.keyboard.press('Escape');
  await page.fill('#cmd', '');
  const busy = await page.evaluate(() => {
    let best = null;
    for (const l of Game.state.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) { const n = Game.State.npcsAt(l.id, ph).length; if (!l.closed && !l.away && (!best || n > best.n)) best = { loc: l.id, phase: ph, n }; }
    return best;
  });
  assert.ok(busy.n > 4, 'a busy place: ' + busy.n);
  await page.evaluate(([loc, phase]) => { while (Game.state.time.phase !== phase) Game.State.apply({ advanceTime: 'long' }); Game.State.apply({ playerLocationId: loc }); for (const n of Game.State.npcsAt(loc)) n.knownToPlayer = true; Game.UI.renderGame(); }, [busy.loc, busy.phase]);
  await page.click('#mode-say');
  const say = await page.evaluate(() => {
    const sel = document.getElementById('say-pick');
    const cs = getComputedStyle(sel);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const longest = Math.max(...[...sel.options].map(o => ctx.measureText(o.textContent).width));
    return { kids: [...document.getElementById('say-to').children].map(c => c.tagName), room: sel.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), longest, options: sel.options.length };
  });
  assert.deepEqual(say.kids, ['SELECT'], 'the picker alone, no chips after it');
  assert.equal(say.options, busy.n + 1);
  assert.ok(say.longest <= say.room + 1, `no name cut: ${say.longest} in ${say.room}`);
  await shot(page, 'W09_say_picker_375');
  await page.focus('#say-pick');
  const who = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[1].id);
  await page.selectOption('#say-pick', who);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'say-pick', 'the focus stays on the picker after it is drawn again');
});

s.test('wave 2, D11 and D12: a place\'s closed day is said once; loose-end chips show their first words while the field holds the line; the goal placeholder fits at 375 and 390', async h => {
  const page = await open(h);
  await quickStart(page);
  const x = await page.evaluate(() => {
    const st = Game.state;
    const [a, b] = st.locations.filter(l => l.discovered && l.away !== true && l.id !== st.player.locationId);
    a.hours = 'Open 7 to 6, closed Sundays'; a.closedOn = ['Sunday'];
    b.hours = 'Open 7 to 6'; b.closedOn = ['Sunday'];
    Game.UI.openPanel('places');
    Game.UI.togglePlace(a.id, true);
    const one = document.querySelector(`.plcard[data-loc="${a.id}"] [data-fact="hours"]`).textContent;
    Game.UI.togglePlace(b.id, true);
    const two = document.querySelector(`.plcard[data-loc="${b.id}"] [data-fact="hours"]`).textContent;
    return { one, two };
  });
  assert.equal(x.one, 'Open 7 to 6, closed Sundays', 'said once');
  assert.equal(x.two, 'Open 7 to 6 · Closed Sundays');
  for (const vp of [PHONE, { width: 390, height: 844 }]) {
    const cr = await open(h, vp);
    await cr.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
    await cr.click('#btn-new');
    const show = id => cr.evaluate(i => { const sec = document.getElementById(i); document.querySelectorAll('.step').forEach(x => x.classList.toggle('current', x === sec)); }, id);
    await show('cr-step-goal');
    const fit = await cr.evaluate(() => {
      const f = document.getElementById('cr-goal');
      const cs = getComputedStyle(f);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return { need: ctx.measureText(f.placeholder).width, room: f.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    });
    assert.ok(fit.need <= fit.room, `${vp.width}: goal placeholder fits (${fit.need} in ${fit.room})`);
    await show('cr-step-loose');
    await cr.click('.le-toggle[data-kind="debt"]');
    const full = await cr.evaluate(() => Game.data.LOOSE_ENDS.debt.options[1]);
    await cr.click('.le-choice[data-kind="debt"][data-index="1"]');
    const chip = await cr.evaluate(() => { const c = document.querySelector('.le-choice[data-kind="debt"][data-index="1"]'); return { text: c.textContent, title: c.title, pressed: c.getAttribute('aria-pressed'), name: c.getAttribute('aria-label') }; });
    assert.equal(await cr.inputValue('.le-text[data-kind="debt"]'), full, 'the field holds the whole line');
    assert.equal(chip.pressed, 'true');
    if (full.split(/\s+/).length > 5) {
      assert.ok(chip.text.length < full.length && chip.text.endsWith('…'), 'the chip shows its first words: ' + chip.text);
      assert.deepEqual([chip.title, chip.name], [full, full], 'and its whole line as its name');
    }
    if (vp === PHONE) await shot(cr, 'W10_loose_chips_375');
  }
});

s.test('wave 2, D13: the toast covers neither the bars, the box, the People search nor the title; the title chip is one line at 375; "Replace the autosave?" focuses Keep it', async h => {
  const page = await open(h, PHONE);
  for (const setup of [() => {}, () => { Game.Storage.saveSettings({ mockMode: false }); Game.UI.showScreen('title'); }, () => { Game.Storage.setApiKey('sk-ant-test-0123456789', false); Game.Storage.saveSettings({ mockMode: true }); Game.UI.showScreen('title'); }]) {
    await page.evaluate(setup);
    const chip = await page.evaluate(() => document.getElementById('title-mode').getBoundingClientRect().height);
    assert.ok(chip <= 46, `the chip is one line: ${chip} (${await page.textContent('#title-mode')})`);
  }
  await page.evaluate(() => { Game.Storage.setApiKey('', false); Game.Storage.saveSettings({ mockMode: true }); Game.UI.showScreen('title'); Game.UI.toast('Hello.'); });
  let t = await page.evaluate(() => [document.getElementById('toast').getBoundingClientRect(), document.getElementById('title-name').getBoundingClientRect()]);
  assert.ok(!rectsMeet(t[0], t[1]), 'not over the title');
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await sendText(page, 'I look around');
  await page.evaluate(() => Game.UI.toast('Saved to slot 1.'));
  t = await page.evaluate(() => ['#toast', '#screen-game .topbar', '#demo-bar', '#screen-game .composer'].map(q => document.querySelector(q).getBoundingClientRect()));
  for (let i = 1; i < t.length; i++) assert.ok(!rectsMeet(t[0], t[i]), 'the toast is clear of ' + ['', 'the top bar', 'the demo bar', 'the composer'][i]);
  await shot(page, 'W11_toast_375');
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => Game.UI.toast('Wait for the current turn to finish.'));
  t = await page.evaluate(() => [document.getElementById('toast').getBoundingClientRect(), document.getElementById('people-search').getBoundingClientRect(), document.querySelector('.panel-head').getBoundingClientRect()]);
  assert.ok(!rectsMeet(t[0], t[1]) && !rectsMeet(t[0], t[2]), 'not over the People search or the tabs');
  await page.click('#panel-close');
  await page.waitForTimeout(300);
  // The dialog: the safe answer has the focus.
  await page.evaluate(() => Game.App.quitToTitle());
  await page.click('#btn-new');
  await page.waitForSelector('#ask[open]');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ask-no');
  assert.equal(await page.textContent('#ask-no'), 'Keep it');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => Game.UI.screen), 'title', 'Enter keeps the autosave');
});

s.test('wave 2, D14: a queued line is shown (and can be taken back when the Pipeline can); Check key does not send you to Settings while there; a damaged autosave and a newer one read plainly on the title', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  // A bookkeeper that takes a while: the narration is in, so the next line can wait in the queue.
  await page.evaluate(() => { const real = Game.Api.Mock.bookkeep; Game.Api.Mock.bookkeep = async (...args) => { await new Promise(r => setTimeout(r, 1500)); Game.Api.Mock.bookkeep = real; return real(...args); }; });
  await page.fill('#cmd', 'I look at the board out front');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.acceptsQueue === true, null, { timeout: 5000 });
  await page.fill('#cmd', 'I wave at the mechanic');
  await page.press('#cmd', 'Enter');
  const q = await page.evaluate(() => ({ shown: !document.getElementById('queued-note').hidden, text: document.getElementById('queued-text').textContent, x: !document.getElementById('queued-cancel').hidden, can: typeof Game.Pipeline.cancelQueued === 'function' }));
  assert.equal(q.shown, true);
  assert.equal(q.text, 'Next: “I wave at the mechanic”');
  assert.equal(q.x, q.can, '× only when the Pipeline can take it back');
  await shot(page, 'W12_queued_1280');
  await page.waitForFunction(() => !Game.Pipeline.busy && document.getElementById('turn-status').hidden, null, { timeout: 10000 });
  // Check key, in Settings: the reason without "in Settings".
  const stubbed = await page.evaluate(() => { const fake = async () => ({ ok: false, message: 'The API key was not accepted. Check the key in Settings.' }); Game.Api.checkKey = fake; return Game.Api.checkKey === fake; });
  await page.click('#tb-settings');
  await page.fill('#set-key', 'sk-ant-wrong-0123456789');
  await page.click('#set-check-key');
  await page.waitForFunction(() => /did not work|works|cannot check/.test(document.getElementById('key-status').textContent));
  if (stubbed) assert.equal(await page.textContent('#key-status'), 'That key did not work: the API did not accept it.');
  // The title: a damaged autosave, then one from a newer build.
  const t = await open(h);
  await t.evaluate(() => { localStorage.setItem('novatria.autosave', '{ not json'); Game.UI.renderTitle(); });
  assert.match(await t.textContent('#title-broken-text'), /^The autosave in this browser could not be read\. The saved game is not valid JSON\. Download it/);
  await quickStart(t);
  await t.evaluate(() => { const env = JSON.parse(localStorage.getItem('novatria.autosave')); env.state.meta.rulesVersion = Game.State.RULES_VERSION + 1; localStorage.setItem('novatria.autosave', JSON.stringify(env)); Game.App.quitToTitle(); });
  if (await t.evaluate(() => Game.App.newerRules(JSON.parse(localStorage.getItem('novatria.autosave')).state))) {
    assert.ok(await t.isVisible('#title-newer-note'), 'a one-line note under Continue');
    assert.match(await t.getAttribute('#btn-continue', 'aria-describedby'), /title-newer-note/);
    await t.click('#btn-continue');
    assert.equal(await t.textContent('#banner-text'), 'Saved by a newer version; it may not play right here.');
  }
});

s.test('wave 2, polish: Continue leads when there is a game; Wait is a plain button; a failed turn offers Try again (and Open Settings for the key); one standing line for the town; Random asks over a started form; cards line up at the top; the Wait until list has a heading; five panel tabs fit on a phone; the theme switch sits above the setting', async h => {
  const page = await open(h, PHONE);
  assert.ok(await page.evaluate(() => document.getElementById('btn-theme').getBoundingClientRect().top < document.getElementById('title-setting').getBoundingClientRect().top), 'the theme switch is above the setting text');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('btn-new').classList.contains('primary'), document.getElementById('btn-continue').classList.contains('primary')]), [true, false]);
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => Game.App.quitToTitle());
  const title = await page.evaluate(() => ({ newP: document.getElementById('btn-new').classList.contains('primary'), contP: document.getElementById('btn-continue').classList.contains('primary'), first: document.getElementById('btn-continue').getBoundingClientRect().top < document.getElementById('btn-new').getBoundingClientRect().top }));
  assert.deepEqual(title, { newP: false, contP: true, first: true }, 'Continue is first and primary');
  await shot(page, 'W13_title_continue_375');
  await page.click('#btn-continue');
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await page.fill('#cmd', '');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('send').textContent, document.getElementById('send').classList.contains('primary')]), ['Wait', false], 'Wait is not the primary button');
  await page.fill('#cmd', 'I look around');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('send').textContent, document.getElementById('send').classList.contains('primary')]), ['Send', true]);
  // A failed turn (the key was refused): Try again and Open Settings.
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: { type: 'authentication_error' } }));
  await sendText(page, 'I ask about the boats');
  const acts = await page.evaluate(() => [...[...document.querySelectorAll('#feed .f-notice.error')].pop().querySelectorAll('.f-notice-acts button')].map(b => b.textContent));
  assert.deepEqual(acts, ['Try again', 'Open Settings']);
  await page.click('#feed .f-notice.error [data-retry]');
  await page.waitForFunction(t => !Game.Pipeline.busy && Game.state.meta.turn === t + 1, t0, { timeout: 5000 });
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].input), 'I ask about the boats', 'Try again played the line');
  assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: { type: 'authentication_error' } }));
  await sendText(page, 'I ask about the ferry');
  await page.click('#feed .f-notice.error [data-settings]');
  assert.deepEqual(await page.evaluate(() => [Game.UI.screen, document.activeElement.id]), ['settings', 'set-key']);
  await page.click('#settings-done');
  // Character: the town's standing once.
  await page.evaluate(() => Game.UI.openPanel('character'));
  const rep = await page.evaluate(() => ({ dts: [...document.querySelectorAll('#panel-body .kv dt')].map(x => x.textContent), town: !!document.querySelector('#panel-body .rep-list [data-faction="town"]') }));
  if (rep.town) assert.ok(!rep.dts.includes('Reputation'), 'no second town standing: ' + rep.dts.join(', '));
  await page.evaluate(() => Game.UI.closeSheet());
  await page.waitForTimeout(300);
  // The ⋯ Wait until… list has a heading.
  await page.click('#act-btn-m');
  await page.click('#act-pop [data-act="wait"]');
  assert.equal(await page.textContent('#act-pop .act-h'), 'Wait until…');
  await page.keyboard.press('Escape');
  // Five panel tabs on a phone (Debug on): no label cut.
  await page.fill('#cmd', '');
  await sendText(page, '/debug');
  await page.evaluate(() => Game.UI.closeSheet());
  await page.waitForTimeout(300);
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(300);
  const cut = await page.evaluate(() => [...document.querySelectorAll('#panel-tabs [role="tab"]')].filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
  assert.deepEqual(cut, [], 'every tab label whole');
  await shot(page, 'W14_debug_tabs_375');
  // Creation: Random over a started form asks first (Keep mine has the focus), and the cards line up at the top.
  const cr = await open(h, LAPTOP);
  await cr.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await cr.click('#btn-new');
  assert.equal(await cr.evaluate(() => getComputedStyle(document.querySelector('.bg-choice')).justifyContent), 'flex-start');
  await cr.fill('#cr-name', 'Ilse Varga');
  await cr.click('#cr-random');
  await cr.waitForSelector('#ask[open]');
  assert.deepEqual(await cr.evaluate(() => [document.activeElement.id, document.getElementById('ask-no').textContent]), ['ask-no', 'Keep mine']);
  await cr.keyboard.press('Escape');
  assert.equal(await cr.inputValue('#cr-name'), 'Ilse Varga', 'kept');
  await cr.click('#cr-random');
  await cr.click('#ask-yes');
  await cr.waitForSelector('#create-summary-view:not([hidden])');
});

s.test('wave 2, the docs check and B10: "Hurt" until the day after, as the engine counts it; the Re-read hint names the arc; Journal notes keep their own day and phase, and the story so far runs newest first', async h => {
  const page = await open(h);
  await quickStart(page);
  const hurt = await page.evaluate(() => {
    const st = Game.state;
    const n = Game.State.npcsAt(st.player.locationId)[0];
    Game.State.apply({ npcKnownToPlayer: [n.id] });
    Game.UI.openPanel('people');
    const flag = () => { Game.UI.renderPanel(); return document.querySelector(`.pcard[data-npc="${n.id}"] .pcard-meta`).textContent; };
    n.hurtUntilDay = st.time.day;
    const today = flag();
    n.hurtUntilDay = st.time.day + 1;
    return { today, tomorrow: flag(), engine: typeof Game.State.isHurt === 'function' };
  });
  if (!hurt.engine) assert.ok(!/Hurt/.test(hurt.today), 'not hurt on the last day: ' + hurt.today);
  assert.match(hurt.tomorrow, /Hurt until Day \d+/);
  assert.match(await page.textContent('#set-reread-hint'), /gives the game its arc/);
  // Journal: a note keeps its own day and phase after the log is compressed.
  const j = await page.evaluate(() => {
    const st = Game.state;
    Game.State.apply({ advanceTime: 'long' });
    Game.State.apply({ advanceTime: 'long' });
    Game.State.apply({ journalEntry: 'Saw the night boat.' });
    const e = st.journal[st.journal.length - 1];
    st.log = st.log.slice(-1);
    st.log[0].turn = 99;
    st.log[0].phase = 'night';
    st.chronicle = [{ fromTurn: 0, toTurn: 9, summary: 'First days.' }, { fromTurn: 10, toTurn: 19, summary: 'Second days.', toDay: 2 }];
    st.news = [{ day: 1, phase: 'morning', text: 'Day one news.', public: true, seen: true }, { day: 3, phase: 'morning', text: 'Day three news.', public: true, seen: true }];
    Game.UI.openPanel('journal');
    const sec = k => document.querySelector(`#panel-body [data-section="${k}"]`);
    return {
      day: e.day, phase: e.phase,
      note: [...sec('notes').querySelectorAll('li')].find(li => li.textContent.includes('Saw the night boat.')).querySelector('.jr-day').textContent,
      story: [...sec('story').querySelectorAll('.jr-text')].map(x => x.textContent)
    };
  });
  assert.equal(j.note, `Day ${j.day} · ${await page.evaluate(d => (typeof Game.State.weekday === 'function' ? Game.State.weekday(d) + ' · ' : ''), j.day)}${j.phase.charAt(0).toUpperCase() + j.phase.slice(1)}`, 'the stored day and phase');
  assert.deepEqual(j.story, ['Day three news.', 'Second days.', 'Day one news.', 'First days.']);
});

// ----- W3. Wave 3 (docs/notes/ui.md, "Wave 3") -----

/* In the page: what has the focus: '#id', else tag.class with the data that names it; 'BODY' when nothing does. */
function FOCUS_OF() {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return 'BODY';
  if (a.id) return '#' + a.id;
  const k = ['loc', 'go', 'openTab', 'act'].filter(x => a.dataset && a.dataset[x] !== undefined).map(x => `[${x}=${a.dataset[x]}]`).join('');
  return `${a.tagName.toLowerCase()}${a.classList && a.classList[0] ? '.' + a.classList[0] : ''}${k}`;
}
/* Start something that runs a turn (fn presses the keys), then read where
   the focus is all the while the turn runs, and once it is over (and what
   is left inert). */
async function acrossTurn(page, fn) {
  await fn();
  const during = [];
  const t0 = Date.now();
  let started = false;
  for (;;) {
    const r = await page.evaluate(() => ({ busy: !!Game.Pipeline.busy, f: window.__focusOf() }));
    if (r.busy) { started = true; if (!during.includes(r.f)) during.push(r.f); } else if (started || Date.now() - t0 > 1500) break;
    await page.waitForTimeout(15);
  }
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  await page.waitForTimeout(120);
  return { during, after: await page.evaluate(() => window.__focusOf()), inert: await page.evaluate(() => [...document.querySelectorAll('[inert]')].map(n => n.id || n.className)) };
}
const focusHelper = page => page.evaluate(`window.__focusOf = ${FOCUS_OF.toString()}`);

s.test('wave 3, defect 1: a turn started from the ⋯ list, Wait until…, the Undo link, Go there or the map\'s chip never drops the focus: the control (or its stand-in) holds it while the turn runs, then the box on a laptop and the opener on a phone', async h => {
  for (const vp of [LAPTOP, PHONE]) {
    const phone = vp === PHONE;
    const page = await open(h, vp);
    await page.evaluate(() => Game.Storage.saveSettings({ tipSeen: true }));
    await quickStart(page);
    await focusHelper(page);
    await page.evaluate(() => { Game.Api.Mock.delay = 90; });
    const dots = phone ? '#act-btn-m' : '#act-btn';
    const box = phone ? dots : '#cmd';
    const tag = `${vp.width}: `;
    // The ⋯ list, by keyboard: Look around.
    let r = await acrossTurn(page, async () => {
      await page.focus(dots);
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'look');
      await page.keyboard.press('Enter');
    });
    assert.ok(r.during.length && r.during.every(f => f === dots), tag + '⋯ holds it during Look around: ' + r.during);
    assert.equal(r.after, box, tag + 'after Look around');
    assert.deepEqual(r.inert, [], 'nothing inert left behind');
    // Wait until… → the first phase.
    r = await acrossTurn(page, async () => {
      await page.focus(dots);
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.act), 'wait');
      await page.keyboard.press('Enter');
      assert.match(await page.evaluate(() => document.activeElement.dataset.act), /^wait-/);
      await page.keyboard.press('Enter');
    });
    assert.ok(r.during.length && r.during.every(f => f === dots), tag + '⋯ holds it during Wait until: ' + r.during);
    assert.equal(r.after, box, tag + 'after Wait until');
    // The Undo link: it keeps the focus while it is still there, else the box (a phone: Send).
    assert.ok(await page.isVisible('#undo-btn'));
    r = await acrossTurn(page, async () => { await page.focus('#undo-btn'); await page.keyboard.press('Enter'); });
    assert.ok(!r.during.includes('BODY'), tag + 'Undo during: ' + r.during);
    if (phone) assert.ok(['#undo-btn', '#send'].includes(r.after), tag + 'after Undo: ' + r.after);
    else assert.equal(r.after, '#cmd', tag + 'after Undo');
    // Go there on an exit.
    const openPlaces = async () => {
      if (phone) { await page.click('[data-open-tab="places"]'); await page.waitForTimeout(300); } else await page.evaluate(() => Game.UI.openPanel('places'));
    };
    await openPlaces();
    const go = await page.evaluate(() => document.querySelector('.exit-list [data-go]').dataset.go);
    r = await acrossTurn(page, async () => { await page.focus(`.exit-list [data-go="${go}"]`); await page.keyboard.press('Enter'); });
    assert.equal(await page.evaluate(() => Game.state.player.locationId), go, 'the walk happened');
    assert.ok(r.during.length && !r.during.includes('BODY'), tag + 'Go there during: ' + r.during);
    if (phone) {
      assert.deepEqual(r.during, ['button[openTab=places]'], 'the sheet closes and its opener holds the focus');
      assert.equal(r.after, 'button[openTab=places]', 'and keeps it after');
    } else {
      assert.match(r.during[0], /\[go=/, 'Go there itself holds it first (marked off, not disabled)');
      assert.equal(r.after, '#cmd');
    }
    assert.deepEqual(r.inert, [], 'nothing inert left behind');
    // The map's chip, by keyboard.
    await openPlaces();
    const target = await page.evaluate(() => document.querySelector('.map-place[data-here="0"]').dataset.loc);
    r = await acrossTurn(page, async () => {
      await page.focus(`.map-place[data-loc="${target}"]`);
      await page.keyboard.press('Enter');
      assert.match(await page.evaluate(() => document.activeElement.className), /map-go/);
      await page.keyboard.press('Enter');
    });
    assert.equal(await page.evaluate(() => Game.state.player.locationId), target);
    assert.ok(r.during.length && !r.during.includes('BODY'), tag + 'chip during: ' + r.during);
    assert.equal(r.after, phone ? 'button[openTab=places]' : '#cmd', tag + 'after the chip');
    assert.deepEqual(r.inert, [], 'nothing inert left behind');
    // The Wait button on a phone: it holds the focus (off, not disabled) through the turn.
    if (phone) {
      r = await acrossTurn(page, async () => { await page.focus('#send'); await page.keyboard.press('Enter'); });
      assert.ok(r.during.length && r.during.every(f => f === '#send'), 'Wait holds it: ' + r.during);
      assert.equal(r.after, '#send');
    }
  }
});

s.test('wave 3, defect 2: the end of a turn never takes the focus from a field the player moved to (the People search keeps it and what is typed); it comes back to the box only from the box, Send or Wait', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 150; Game.UI.openPanel('people'); });
  // Send from the box, then the search while the turn runs.
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.busy);
  await page.click('#people-search');
  await page.keyboard.type('Ro');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  await page.waitForTimeout(100);
  await page.keyboard.type('y');
  assert.deepEqual(await page.evaluate(() => [document.activeElement.id, document.getElementById('people-search').value, document.getElementById('cmd').value]), ['people-search', 'Roy', ''], 'nothing split between the search and the box');
  await shot(page, 'W3_02_focus_kept_after_turn_1280');
  // Wait (the button), then the search.
  await page.fill('#people-search', '');
  await page.focus('#send');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Game.Pipeline.busy);
  await page.click('#people-search');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'people-search', 'Wait does not take it back either');
  // Left on the button or the box, the box has it after the turn.
  await page.focus('#send');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'from Wait: the box');
  await sendText(page, 'I look at the counter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'from the box: the box');
});

s.test('wave 3, defect 3: the expanded map, the phone sheet and a dialog sit above the warning banner, which is inert while one is open and as it was after', async h => {
  const atBanner = page => page.evaluate(() => {
    const b = document.getElementById('banner');
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { inert: b.inert, inBanner: b.contains(top), hidden: b.hidden };
  });
  for (const vp of [PHONE, LAPTOP]) {
    const page = await open(h, vp);
    await quickStart(page);
    await focusHelper(page);
    await page.evaluate(() => Game.UI.warn('Your browser would not save the game. Export it from Save / Load to keep it.'));
    assert.deepEqual(await atBanner(page), { inert: false, inBanner: true, hidden: false });
    if (vp === PHONE) {
      await page.click('[data-open-tab="people"]');
      await page.waitForTimeout(300);
      assert.deepEqual(await atBanner(page), { inert: true, inBanner: false, hidden: false }, 'the sheet covers the banner, which takes no focus');
      await shot(page, 'W3_03_sheet_over_banner_375');
      await page.keyboard.press('Escape');
      assert.deepEqual(await atBanner(page), { inert: false, inBanner: true, hidden: false }, 'back after the sheet');
      await page.click('[data-open-tab="places"]');
      await page.waitForTimeout(300);
    } else await page.evaluate(() => Game.UI.openPanel('places'));
    await page.click('.map-expand');
    assert.deepEqual(await atBanner(page), { inert: true, inBanner: false, hidden: false }, `${vp.width}: the expanded map covers the banner`);
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !document.getElementById('banner').contains(document.activeElement)), 'Tab never reaches Dismiss');
    await shot(page, `W3_03_map_over_banner_${vp.width}`);
    await page.click('.map-close');
    if (vp === PHONE) {
      assert.equal((await atBanner(page)).inert, true, 'the sheet is still open, so still inert');
      await page.click('#panel-close');
    }
    assert.deepEqual(await atBanner(page), { inert: false, inBanner: true, hidden: false }, `${vp.width}: back after the map`);
    // A dialog (UI.ask).
    await page.evaluate(() => { window.__asked = Game.UI.ask({ title: 'A question', text: 'Go ahead?' }); });
    assert.equal((await atBanner(page)).inert, true, 'inert under a dialog');
    await page.click('#ask-no');
    assert.equal((await atBanner(page)).inert, false, 'and back after it');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[inert]')].map(n => n.id || n.className)), [], 'nothing inert left behind');
    // Dismiss gives the focus to the screen, not the page.
    await page.focus('#banner-close');
    await page.keyboard.press('Enter');
    assert.notEqual(await page.evaluate(() => window.__focusOf()), 'BODY');
  }
});

s.test('wave 3, defect 4: the story\'s log is never aria-busy, and the Undo link is outside the live region, laid over the newest input line (also after a resize)', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => {
    Game.Api.Mock.delay = 80;
    const f = document.getElementById('feed');
    window.__busyAttr = [];
    window.__undoAdds = 0;
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'attributes' && m.attributeName === 'aria-busy' && m.target === f) window.__busyAttr.push(f.getAttribute('aria-busy'));
        for (const n of m.addedNodes || []) if (n.nodeType === 1 && (n.matches('.f-undo, .f-undo-row') || n.querySelector('.f-undo'))) window.__undoAdds++;
      }
    }).observe(f, { attributes: true, childList: true, subtree: true });
  });
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.busy);
  assert.equal(await page.getAttribute('#feed', 'aria-busy'), null, 'not busy while the turn runs');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  await sendText(page, 'I look at the pumps');
  const r = await page.evaluate(() => ({ busy: window.__busyAttr, adds: window.__undoAdds, attr: document.getElementById('feed').getAttribute('aria-busy') }));
  assert.deepEqual(r, { busy: [], adds: 0, attr: null }, 'no aria-busy, and no Undo added to the log');
  const where = () => page.evaluate(() => {
    const b = document.getElementById('undo-btn');
    const lines = document.querySelectorAll('#feed .f-input');
    const line = lines[lines.length - 1].getBoundingClientRect();
    const u = b.getBoundingClientRect();
    return { live: !!b.closest('[aria-live], [role="log"]'), right: Math.round(u.right - line.right), overlap: u.top < line.bottom && u.bottom > line.top, has: lines[lines.length - 1].classList.contains('has-undo'), visible: !document.getElementById('undo-row').hidden };
  });
  const want = { live: false, right: 0, overlap: true, has: true, visible: true };
  assert.deepEqual(await where(), want);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(150);
  assert.deepEqual(await where(), want, 'it follows its line after a resize');
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(150);
  assert.deepEqual(await where(), want, 'and on a phone');
  await shot(page, 'W3_04_undo_link_375');
});

s.test('wave 3, defect 5: a queued line at 375 and 390 is one 32px pill with a 44px ×; the status text stays on one line and the line 32px tall', async h => {
  for (const vp of [PHONE, { width: 390, height: 844 }]) {
    const page = await open(h, vp);
    await quickStart(page);
    await fast(page);
    await page.evaluate(() => { const real = Game.Api.Mock.bookkeep; Game.Api.Mock.bookkeep = async (...args) => { await new Promise(r => setTimeout(r, 2500)); Game.Api.Mock.bookkeep = real; return real(...args); }; });
    await page.fill('#cmd', 'I look at the board out front');
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => Game.Pipeline.acceptsQueue === true, null, { timeout: 5000 });
    await page.fill('#cmd', 'I tell him I fixed fuel pumps for eleven years and can start today');
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => !document.getElementById('queued-note').hidden);
    const m = await page.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const x = document.getElementById('queued-cancel');
      const xr = x.getBoundingClientRect();
      const others = [...document.querySelectorAll('.tabrow button, #send, #cmd, .mode-btn')].filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect());
      const meets = others.filter(b => xr.left < b.right - 1 && b.left < xr.right - 1 && xr.top < b.bottom - 1 && b.top < xr.bottom - 1).length;
      return { line: r('turn-status').height, pill: r('queued-note').height, textLines: document.getElementById('turn-status-text').getClientRects().length, xShown: !x.hidden, xw: xr.width, xh: xr.height, meets, radius: getComputedStyle(document.getElementById('queued-note')).borderTopLeftRadius };
    });
    assert.ok(m.line <= 34, `${vp.width}: the status line is ${m.line}px`);
    assert.ok(m.pill <= 32, `${vp.width}: the pill is ${m.pill}px`);
    assert.equal(m.textLines, 1, 'the status text is one line');
    assert.equal(m.radius, '16px', 'a true pill');
    if (m.xShown) {
      assert.ok(m.xw >= 44 && m.xh >= 44, `× is a 44px target (${m.xw}x${m.xh})`);
      assert.equal(m.meets, 0, '× overlaps no other control');
    }
    assert.deepEqual(await overflowReport(page, vp.width), [], 'nothing sticks out');
    await shot(page, `W3_05_queued_${vp.width}`, { clip: { x: 0, y: vp.height - 180, width: vp.width, height: 180 } });
    await page.waitForFunction(() => !Game.Pipeline.busy && document.getElementById('turn-status').hidden, null, { timeout: 15000 });
  }
});

s.test('wave 3, defect 6 and N3: place types read as words (one map for the place here and each row), and the exits list only places the player knows of', async h => {
  const page = await open(h, { width: 390, height: 844 });
  await quickStart(page);
  await page.click('[data-open-tab="places"]');
  await page.waitForTimeout(300);
  // N3: a home nobody has told the player about is not an exit yet (as on the map).
  const ex = await page.evaluate(() => {
    const here = Game.State.loc(Game.state.player.locationId);
    const listed = [...document.querySelectorAll('.exit-list [data-exit]')].map(li => li.dataset.exit);
    return { listed, known: here.exits.filter(id => Game.State.loc(id).discovered && Game.State.loc(id).away !== true), hidden: here.exits.filter(id => !Game.State.loc(id).discovered) };
  });
  assert.deepEqual(ex.listed, ex.known);
  assert.ok(ex.hidden.length > 0, 'the start has exits to homes not found yet');
  assert.ok(!ex.hidden.some(id => ex.listed.includes(id)));
  // Every place known: the type labels.
  const t = await page.evaluate(() => {
    for (const l of Game.state.locations) l.discovered = true;
    Game.UI.renderPanel();
    const here = Game.State.loc(Game.state.player.locationId);
    return {
      line: document.querySelector('#panel-body > p.muted').textContent, hereLabel: Game.UI.placeLabel(here),
      // Wave 4: placeLabel, the type's word unless the place has its own (the Bluff).
      rows: [...document.querySelectorAll('.plcard')].map(c => { const l = Game.State.loc(c.dataset.loc); return { type: l.type, shown: c.querySelector('.plcard-type').textContent, want: Game.UI.placeLabel(l) }; })
    };
  });
  assert.ok(t.line.startsWith(t.hereLabel), t.line);
  for (const r of t.rows) assert.equal(r.shown, r.want, r.type);
  const want = { gas: 'Gas station', trailerpark: 'Trailer park', bighouse: 'Big house', police: 'Town hall', pawn: 'Pawn shop', care: 'Care home', fields: 'Farmland', marina: 'Boat landing' };
  for (const [k, v] of Object.entries(want)) assert.equal(await page.evaluate(x => Game.UI.placeTypeLabel(x), k), v, k);
  assert.equal(t.line.split(' · ')[0], 'Gas station', 'the place a game starts at');
  await page.evaluate(() => { Game.Storage.saveSettings({ theme: 'parchment' }); Game.UI.applyDisplay(); const b = document.getElementById('panel-body'); b.scrollTop = document.querySelector('.exit-list').getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 40; });
  await shot(page, 'W3_06_places_types_390_parchment');
});

s.test('wave 3, defects 7, 8 and 10: the Panel toggle\'s pressed state, the read-only box and the map\'s person dots stand out (3:1 edges, 4.5:1 text) in both themes', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(contrastIn);
  await page.evaluate(() => {
    const st = Game.state;
    Game.State.apply({ npcKnownToPlayer: Game.State.npcsAt(st.player.locationId).map(n => n.id) });
    Game.UI.openPanel('places');
  });
  for (const theme of ['dark', 'parchment']) {
    const r = await page.evaluate(th => {
      Game.Storage.saveSettings({ theme: th });
      Game.UI.applyDisplay();
      Game.UI.setCollapsed(false, true);
      const cs = (q, pseudo) => getComputedStyle(document.querySelector(q), pseudo || null);
      const tb = cs('#tb-panel');
      const bar = cs('.topbar').backgroundColor;
      const shadow = /rgba?\([^)]*\)|#[0-9a-f]{3,8}/i.exec(tb.boxShadow);
      const dot = document.querySelector('.map-mono circle');
      const land = cs('.map-land').fill;
      const surface = cs('#panel').backgroundColor;
      const out = {
        pressed: document.getElementById('tb-panel').getAttribute('aria-pressed'),
        toggleEdge: window.__cr(tb.borderTopColor, bar),
        toggleBar: shadow ? window.__cr(shadow[0], tb.backgroundColor) : 0,
        dotRing: dot ? window.__cr(getComputedStyle(dot).stroke, land) : null,
        legendRing: window.__cr(cs('.lg-person').borderTopColor, surface)
      };
      // A read-only tab's box.
      Game.Storage.setReadOnly(true);
      const box = cs('#cmd');
      const behind = cs('#screen-game .composer').backgroundColor;
      out.roText = window.__cr(box.color, box.backgroundColor);
      out.roPlaceholder = window.__cr(cs('#cmd', '::placeholder').color, box.backgroundColor);
      out.roEdge = window.__cr(box.borderTopColor, behind);
      out.roOpacity = box.opacity;
      Game.Storage.setReadOnly(false);
      return out;
    }, theme);
    assert.equal(r.pressed, 'true');
    assert.ok(r.toggleEdge >= 3, `${theme}: Panel's pressed edge ${r.toggleEdge.toFixed(2)}`);
    assert.ok(r.toggleBar >= 3, `${theme}: Panel's accent bar ${r.toggleBar.toFixed(2)}`);
    assert.ok(r.dotRing !== null && r.dotRing >= 3, `${theme}: a person's dot on the map ${r.dotRing}`);
    assert.ok(r.legendRing >= 3, `${theme}: the legend's dot ${r.legendRing.toFixed(2)}`);
    assert.ok(r.roText >= 4.5, `${theme}: read-only text ${r.roText.toFixed(2)}`);
    assert.ok(r.roPlaceholder >= 4.5, `${theme}: read-only placeholder ${r.roPlaceholder.toFixed(2)}`);
    assert.ok(r.roEdge >= 3, `${theme}: read-only edge ${r.roEdge.toFixed(2)}`);
    assert.equal(r.roOpacity, '1', 'a colour, not transparency');
  }
  // The phone sheet's grip (it says the sheet can be swiped down): 3:1 on the sheet.
  await page.setViewportSize(PHONE);
  for (const theme of ['dark', 'parchment']) {
    const grip = await page.evaluate(th => { Game.Storage.saveSettings({ theme: th }); Game.UI.applyDisplay(); return window.__cr(getComputedStyle(document.querySelector('.panel-grip')).backgroundColor, getComputedStyle(document.getElementById('panel')).backgroundColor); }, theme);
    assert.ok(grip >= 3, `${theme}: the sheet's grip ${grip.toFixed(2)}`);
  }
});

s.test('wave 3, defect 9: the expanded map fills the view on both axes (the river and the roads run on to the edges), pans where it is larger, and is centred on the player again after the phone turns', async h => {
  const measure = page => page.evaluate(() => {
    const map = document.querySelector('.map.expanded');
    const pan = map.querySelector('.map-pan');
    const svg = map.querySelector('.map-svg');
    const vb = svg.viewBox.baseVal;
    const W = Game.UI.mapLayout(Game.state).W;
    const sr = svg.getBoundingClientRect();
    const pr = pan.getBoundingClientRect();
    const water = map.querySelector('.map-water');
    const wb = water ? water.getBBox() : null;
    const me = map.querySelector('.map-place[data-here="1"] .map-mark').getBoundingClientRect();
    const land = map.querySelector('.map-land').getBBox();
    return {
      coverW: sr.width >= pan.clientWidth - 1, coverH: sr.height >= pan.clientHeight - 1,
      fitsW: pan.scrollWidth <= pan.clientWidth + 1, fitsH: pan.scrollHeight <= pan.clientHeight + 1,
      aspect: Math.abs(sr.width / sr.height - vb.width / vb.height) < 0.01,
      land: land.x <= vb.x + 0.01 && land.width >= vb.width - 0.01 && land.y <= vb.y + 0.01 && land.height >= vb.height - 0.01,
      riverOn: !wb || vb.x >= 0 || (wb.x < 0 && wb.x + wb.width > W),
      meVisible: me.left >= pr.left && me.right <= pr.right && me.top >= pr.top && me.bottom <= pr.bottom
    };
  });
  const lap = await open(h);
  await quickStart(lap);
  await lap.evaluate(() => Game.UI.openPanel('places'));
  await lap.click('.map-expand');
  assert.deepEqual(await measure(lap), { coverW: true, coverH: true, fitsW: true, fitsH: true, aspect: true, land: true, riverOn: true, meVisible: true }, 'a laptop: the whole town, land to the edges');
  assert.ok(await lap.evaluate(() => document.querySelector('.map.expanded .map-svg').viewBox.baseVal.x < 0), 'the frame grew sideways');
  await shot(lap, 'W3_09_map_expanded_1280');
  const ph = await open(h, PHONE);
  await quickStart(ph);
  await ph.click('[data-open-tab="places"]');
  await ph.waitForTimeout(300);
  await ph.click('.map-expand');
  const b = await measure(ph);
  assert.deepEqual([b.coverW, b.coverH, b.fitsW, b.fitsH, b.aspect, b.land, b.meVisible], [true, true, false, true, true, true, true], 'upright: fills the height, pans sideways, opens on the player');
  // Turned on its side, it fills the width and pans up and down, with the player in view again.
  await ph.evaluate(() => { const p = document.querySelector('.map.expanded .map-pan'); p.scrollLeft = 0; p.scrollTop = 0; });
  await ph.setViewportSize({ width: 740, height: 375 });
  await ph.waitForTimeout(250);
  const c = await measure(ph);
  assert.deepEqual([c.coverW, c.coverH, c.fitsW, c.aspect, c.land, c.meVisible], [true, true, true, true, true, true], 'on its side: covers the view, centred on the player');
  assert.ok(await ph.evaluate(() => { const p = document.querySelector('.map.expanded .map-pan'); return p.scrollHeight <= 740 && p.scrollWidth <= 741; }), 'never drawn at 1184px wide');
  await shot(ph, 'W3_09_map_rotated_740x375');
  await ph.setViewportSize(PHONE);
  await ph.waitForTimeout(250);
  assert.equal((await measure(ph)).meVisible, true, 'and back upright');
});

s.test('wave 3, defect 11: App.editPerson and App.setPronouns refuse in a read-only tab (UI.canAct), say so once, and change nothing', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => {
    window.__toasts = 0;
    new MutationObserver(m => { window.__toasts += m.filter(x => x.type === 'childList').length ? 1 : 0; }).observe(document.getElementById('toast'), { childList: true, characterData: true, subtree: true });
  });
  const r = await page.evaluate(async () => {
    const n = Game.State.npcsAt(Game.state.player.locationId)[0];
    const other = n.pronouns === 'she' ? 'he' : 'she';
    const before = JSON.stringify(Game.state);
    Game.Storage.setReadOnly(true);
    window.__toasts = 0;
    const p = Game.App.setPronouns(n.id, other);
    await new Promise(res => setTimeout(res, 30));
    const t1 = window.__toasts;
    window.__toasts = 0;
    const e = Game.App.editPerson(n.id, { attitude: 80 });
    await new Promise(res => setTimeout(res, 30));
    const t2 = window.__toasts;
    const same = JSON.stringify(Game.state) === before;
    Game.Storage.setReadOnly(false);
    return { p: p.reason, e: e.reason, t1, t2, same, ok: Game.App.setPronouns(n.id, other).ok };
  });
  assert.deepEqual(r, { p: 'read-only', e: 'read-only', t1: 1, t2: 1, same: true, ok: true });
});

s.test('wave 3, the ⋯ trade-off: on a phone with the keyboard up the tab row steps aside but ⋯ stays in reach beside the toggle', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  await focusHelper(page);
  await page.focus('#cmd');
  await page.setViewportSize({ width: 375, height: 420 });
  await page.waitForFunction(() => document.getElementById('app').classList.contains('typing'));
  const m = await page.evaluate(() => {
    const b = document.getElementById('act-btn').getBoundingClientRect();
    return { w: b.width, h: b.height, onScreen: b.bottom <= window.innerHeight && b.right <= 375, tabrow: getComputedStyle(document.querySelector('.tabrow')).display, box: document.getElementById('cmd').getBoundingClientRect().width };
  });
  assert.ok(m.w >= 44 && m.h >= 44 && m.onScreen, JSON.stringify(m));
  assert.equal(m.tabrow, 'none');
  assert.ok(m.box >= 150, 'the box keeps room to type: ' + m.box);
  assert.deepEqual(await overflowReport(page, 375), []);
  await shot(page, 'W3_10_dots_while_typing_375x420');
  await page.click('#act-btn');
  assert.ok(await page.isVisible('#act-pop'));
  assert.ok(await page.evaluate(() => document.getElementById('act-pop').contains(document.activeElement)), 'the list takes the focus');
  await page.keyboard.press('Escape');
  assert.notEqual(await page.evaluate(() => window.__focusOf()), 'BODY', 'closed, the focus goes to a ⋯ in view');
});

s.test('wave 3, copy: the UI side of the round-2 copy table, Hurt said as the engine says it (N15), and the newer-build note on one line at 375', async h => {
  const page = await open(h, PHONE);
  // The title, the first-run choice, Settings.
  assert.equal(await page.textContent('#choose-demo .choice-title'), 'Try the offline demo (canned replies)');
  assert.equal(await page.textContent('.preset-grid .nowrap'), '4–5¢');
  assert.ok(await page.evaluate(() => document.querySelectorAll('#set-reread-hint li').length >= 5), 'the Re-read hint is a short list');
  await page.evaluate(() => { localStorage.setItem('novatria.autosave', '{ not json'); Game.UI.renderTitle(); });
  assert.match(await page.textContent('#title-broken-text'), /\(Load → Restore previous\)\.$/);
  await page.evaluate(() => localStorage.removeItem('novatria.autosave'));
  assert.match(await page.evaluate(() => Game.UI.Create.STEPS.find(x => x.id === 'background').sub), /money, three things \(one a prepaid phone\), and whether/);
  // In a game: the People card, Grown, an exit closed today.
  await quickStart(page, { name: 'Tomas Reed' });
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const day = st.time.day;
    const here = G.State.npcsAt(st.player.locationId);
    const n = here[0];
    G.State.apply({ npcKnownToPlayer: here.map(x => x.id) });
    const bar = st.locations.find(l => l.type === 'bar') || st.locations.find(l => l.id !== st.player.locationId);
    st.bans = (st.bans || []).concat([{ locationId: bar.id, byNpcId: n.id, untilDay: day + 3 }]);
    n.hurtUntilDay = day + 2;
    G.UI.openPanel('people');
    G.UI.togglePerson(n.id, true);
    const meta = document.querySelector(`.pcard[data-npc="${n.id}"] .pcard-meta`).textContent;
    const note = typeof G.State.absentNote === 'function' ? G.State.absentNote(n) : '';
    delete n.hurtUntilDay;
    st.bans = st.bans.filter(b => b.byNpcId !== n.id);
    const away = st.npcs.find(x => x.alive !== false && G.presenceOf(x) === 'here' && !here.includes(x));
    G.State.apply({ npcKnownToPlayer: [away.id] });
    st.seen[away.id] = { locationId: bar.id, day, phase: 'evening', turn: 0 };
    G.UI.renderPanel();
    const seen = document.querySelector(`.pcard[data-npc="${away.id}"] .pcard-where`).textContent;
    const t = st.threads[0];
    const was = [t.reward, st.player.progression];
    t.reward = 'wits';
    st.player.progression = [{ threadId: t.id }];
    G.UI.openPanel('character');
    const grown = document.getElementById('panel-body').textContent;
    [t.reward, st.player.progression] = was;
    const ex = G.State.loc(st.player.locationId).exits.map(id => G.State.loc(id)).find(l => l.discovered && !l.closed && l.away !== true);
    ex.closedOn = [G.State.weekday(day)];
    G.UI.openPanel('places');
    const exitText = document.querySelector(`.exit-list [data-exit="${ex.id}"] span`).textContent;
    delete ex.closedOn;
    return { meta, note, day, bar: bar.name, seen, grown, exitText, exName: ex.name };
  });
  assert.ok(r.meta.includes(`Banned you from ${r.bar.replace(/^The /, 'the ')} until Day ${r.day + 3}`), r.meta);
  // The day they are about again (hurtUntilDay), the same day as the engine's note (changed by design at the wave-3 integration).
  assert.ok(r.meta.includes(`Hurt until Day ${r.day + 2}`), r.meta);
  if (/until day \d+$/.test(r.note)) assert.ok(r.note.endsWith(`until day ${r.day + 2}`), 'the same day as the engine\'s note: ' + r.note);
  // Changed by design in wave 4: the place as said in a sentence ("the Low Water").
  assert.equal(r.seen, `Last seen: ${r.bar.replace(/^The /, 'the ')}, Day ${r.day} · Evening`);
  assert.match(r.grown, /: \+1 Wits/);
  assert.equal(r.exitText, `${r.exName} (closed today)`);
  // Saves: the name and the slot's line in one form.
  await page.evaluate(() => Game.UI.showScreen('saves'));
  assert.equal(await page.inputValue('#save-name'), `Tomas Reed, Day ${r.day}`);
  await page.click('#slot-1 [data-action="save"]');
  assert.match(await page.textContent('#slot-1 .slot-meta'), /^Tomas Reed · Day \d+ · (Morning|Afternoon|Evening|Night) · /);
  // Replacing an autosave that is in no slot asks, and says where to get it back.
  await page.evaluate(() => { Game.Storage.deleteSlot(1); Game.UI.showScreen('game'); Game.Storage.saveSettings({ playChoice: 'demo' }); window.__q = Game.App.newGame(); });
  if (await page.evaluate(() => document.getElementById('ask').open)) {
    assert.match(await page.textContent('#ask-text'), /and Saved games \(Load\) can bring it back\.$/);
    await page.click('#ask-no');
  }
  // The newer-build note: one line at 375.
  await page.evaluate(() => { const env = JSON.parse(localStorage.getItem('novatria.autosave')); env.state.meta.rulesVersion = Game.State.RULES_VERSION + 1; localStorage.setItem('novatria.autosave', JSON.stringify(env)); Game.App.quitToTitle(); });
  if (await page.evaluate(() => Game.App.newerRules(JSON.parse(localStorage.getItem('novatria.autosave')).state))) {
    const note = await page.evaluate(() => { const n = document.getElementById('title-newer-note'); return { text: n.textContent, h: n.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(n).lineHeight) || 20 }; });
    assert.equal(note.text, 'Saved by a newer version; it may not play right here.');
    assert.ok(note.h < note.lh * 1.5, `one line at 375 (${note.h}px)`);
    await shot(page, 'W3_11_newer_note_375');
  }
});

s.test('wave 3, copy: the stat move in two sentences', async h => {
  const page = await open(h, LAPTOP);
  await page.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await page.click('#btn-new');
  const bg = await page.evaluate(() => Game.data.BACKGROUNDS[0]);
  await page.fill('#cr-name', 'Ilse');
  await page.click(`.bg-choice[data-id="${bg.id}"]`);
  const from = Object.keys(bg.stats).find(k => bg.stats[k] > -1);
  await page.click(`.step-btn[data-for="${from}"][data-dir="down"]`);
  assert.equal(await page.textContent('.cr-pending'), `One point taken from ${from.charAt(0).toUpperCase() + from.slice(1)}. Press + on the stat that should get it.`);
});

// ----- W4. Wave 4 (docs/notes/ui.md, "Wave 4") -----

s.test('wave 4, defect A: a tab change opens the new tab at its top (Places with its map in view); a redraw of the same tab keeps its place', async h => {
  for (const vp of [LAPTOP, PHONE]) {
    const phone = vp === PHONE;
    const page = await open(h, vp);
    await quickStart(page);
    const tag = `${vp.width}: `;
    // Everyone in town met, so People is longer than the panel.
    await page.evaluate(() => Game.State.apply({ npcKnownToPlayer: Game.state.npcs.filter(n => n.alive !== false && Game.presenceOf(n) === 'here').map(n => n.id) }));
    if (phone) { await page.click('[data-open-tab="people"]'); await page.waitForTimeout(300); } else await page.evaluate(() => Game.UI.openPanel('people'));
    // The People tab scrolled well down.
    const down = await page.evaluate(() => { const b = document.getElementById('panel-body'); b.scrollTop = 600; return b.scrollTop; });
    assert.ok(down > 100, tag + 'People scrolls: ' + down);
    // Redrawn (a turn, a search), the same tab keeps its place.
    assert.equal(await page.evaluate(() => { Game.UI.renderPanel(); return document.getElementById('panel-body').scrollTop; }), down, tag + 'a redraw of People keeps its scroll');
    // A tab change, by its tab: Places opens at its top, the map in view.
    await page.click('#tab-places');
    const pl = await page.evaluate(() => { const b = document.getElementById('panel-body'); const m = document.querySelector('#panel-body .map').getBoundingClientRect(); return { top: b.scrollTop, mapTop: m.top >= b.getBoundingClientRect().top - 17 }; });
    assert.deepEqual(pl, { top: 0, mapTop: true }, tag + 'Places opens at the top');
    await shot(page, `W4_A_places_after_people_${vp.width}`);
    // And back: People opens at its top too (its old place is not kept across a tab change).
    await page.click('#tab-people');
    assert.equal(await page.evaluate(() => document.getElementById('panel-body').scrollTop), 0, tag + 'People again at the top');
    // A redraw of Places scrolled down keeps it.
    await page.click('#tab-places');
    const pd = await page.evaluate(() => { const b = document.getElementById('panel-body'); b.scrollTop = 250; const t = b.scrollTop; Game.UI.renderPanel(); return [t, b.scrollTop]; });
    assert.ok(pd[0] > 0 && pd[1] === pd[0], tag + 'a redraw of Places keeps its scroll: ' + pd);
  }
});

s.test('wave 4, defect B: the box-side ⋯ on a phone never drops the focus: Shift+Tab from the box keeps it there (and the typing layout), ⋯ then Look around within 250 ms holds it through the turn, and the keyboard going down hands it to the tab row\'s ⋯', async h => {
  const page = await open(h, PHONE);
  await page.evaluate(() => Game.Storage.saveSettings({ tipSeen: true }));
  await quickStart(page);
  await focusHelper(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 90; });
  const typing = () => page.evaluate(() => document.getElementById('app').classList.contains('typing'));
  const kbUp = async () => { await page.focus('#cmd'); await page.setViewportSize({ width: 375, height: 420 }); await page.waitForFunction(() => document.getElementById('app').classList.contains('typing')); };
  await kbUp();
  // Shift+Tab from the box: the ⋯ beside the toggle has it, and keeps it after the box's 250 ms.
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => window.__focusOf()), '#act-btn');
  await page.waitForTimeout(400);
  assert.deepEqual([await page.evaluate(() => window.__focusOf()), await typing()], ['#act-btn', true], 'still on the ⋯ beside the toggle, the layout as it was');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.__focusOf()), '#cmd');
  // ⋯ then Look around, quicker than 250 ms: the ⋯ holds the focus all through the turn, and after.
  const r = await acrossTurn(page, async () => {
    await page.click('#act-btn');
    await page.click('#act-pop [data-act="look"]');
  });
  assert.ok(r.during.length && !r.during.includes('BODY'), 'during: ' + r.during);
  assert.equal(r.after, '#act-btn', 'after: ' + r.after);
  assert.deepEqual(r.inert, [], 'nothing inert left behind');
  // The list opened from the box-side ⋯ stays where it opened (the layout does not change under it).
  await page.click('#act-btn');
  const at = () => page.evaluate(() => Math.round(document.getElementById('act-pop').getBoundingClientRect().top));
  const top0 = await at();
  await page.waitForTimeout(400);
  assert.equal(await at(), top0, 'the open list does not jump');
  await shot(page, 'W4_B_dots_list_kbup_375');
  // The keyboard goes down with the list open: it keeps the focus; Escape gives it to a ⋯ in view (the tab row's), never the page.
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.getElementById('act-pop').contains(document.activeElement)), 'the list keeps the focus');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  assert.deepEqual([await page.evaluate(() => window.__focusOf()), await typing()], ['#act-btn-m', false]);
  // On the box-side ⋯ when the keyboard goes down (no list): the tab row's ⋯ takes it, then the layout changes.
  await kbUp();
  await page.keyboard.press('Shift+Tab');
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(350);
  assert.deepEqual([await page.evaluate(() => window.__focusOf()), await typing()], ['#act-btn-m', false]);
  // A turn the box-side ⋯ started hands its hold over too: after it the focus is on a ⋯ in view.
  await kbUp();
  const r2 = await acrossTurn(page, async () => {
    await page.click('#act-btn');
    await page.click('#act-pop [data-act="look"]');
    await page.setViewportSize(PHONE);
  });
  assert.ok(!r2.during.includes('BODY'), 'during: ' + r2.during);
  assert.equal(r2.after, '#act-btn-m', 'after: ' + r2.after);
  assert.deepEqual(r2.inert, [], 'nothing inert left behind');
  assert.deepEqual(await overflowReport(page, 375), []);
  await shot(page, 'W4_B_after_turn_kbdown_375');
});

s.test('wave 4: a layout change across 900px never drops the focus: Panel, Menu and either ⋯ hand it to their stand-ins', async h => {
  const page = await open(h, LAPTOP);
  await quickStart(page);
  await focusHelper(page);
  const MID = { width: 800, height: 800 };
  for (const [from, vpFrom, vpTo, to] of [['#tb-panel', LAPTOP, MID, '#tb-menu'], ['#act-btn', LAPTOP, MID, '#act-btn-m'], ['#act-btn-m', MID, LAPTOP, '#act-btn'], ['#tb-menu', MID, LAPTOP, '#tb-panel']]) {
    await page.setViewportSize(vpFrom);
    await page.waitForTimeout(150);
    await page.focus(from);
    await page.setViewportSize(vpTo);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__focusOf()), to, `${from} at ${vpFrom.width} → ${vpTo.width}`);
  }
  // The phone sheet's × (a laptop has none): the panel's tab. Something in the laptop's panel (a phone's sheet is shut): Send.
  await page.setViewportSize(MID);
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(300);
  await page.focus('#panel-close');
  await page.setViewportSize(LAPTOP);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__focusOf()), '#tab-people', 'the sheet\'s × → the tab');
  // The same when the browser has let go of the × before the layout reports (the sheet, closing, finds the focus nowhere).
  await page.setViewportSize(MID);
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('panel-close').focus(); document.activeElement.blur(); });
  await page.setViewportSize(LAPTOP);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__focusOf()), '#tab-people', 'the sheet closing → the tab');
  await page.focus('.pcard-head');
  await page.setViewportSize(MID);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__focusOf()), '#send', 'a card in the laptop panel → Send');
  // The expanded map's Close map: the map closes, and the focus is never dropped.
  await page.setViewportSize(LAPTOP);
  await page.evaluate(() => Game.UI.openPanel('places'));
  await page.click('.map-expand');
  await page.focus('.map-close');
  await page.setViewportSize(MID);
  await page.waitForTimeout(250);
  assert.notEqual(await page.evaluate(() => window.__focusOf()), 'BODY', 'Close map → somewhere on screen');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('[inert]')].map(n => n.id || n.className)), [], 'nothing inert left behind');
});

s.test('wave 4, defect C: the first-turn tip says where ⋯ and the panels are in this layout, and again after a resize across 900px', async h => {
  const LAP = 'Type / or press ⋯ for commands. The panel on the right keeps track of people, places and your journal.';
  const PH = 'Type / or press ⋯ (at the end of the tabs, or beside Do / Say while you type) for commands. The tabs above the box keep track of people, places and your journal.';
  const tipNow = p => p.evaluate(() => { Game.Storage.saveSettings({ tipSeen: false }); for (const t of document.querySelectorAll('.f-tip')) t.remove(); Game.UI.showTip(); });
  const where = p => p.evaluate(() => document.querySelector('.f-tip .f-tip-where').textContent);
  const page = await open(h, { width: 1180, height: 820 });
  await quickStart(page);
  await tipNow(page);
  assert.equal(await where(page), LAP);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(250);
  assert.equal(await where(page), PH, 'turned upright: the phone wording');
  await shot(page, 'W4_C_tip_820x1180');
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.waitForTimeout(250);
  assert.equal(await where(page), LAP, 'and back');
  // Shown first on a phone, it has the phone wording.
  const ph = await open(h, PHONE);
  await quickStart(ph);
  await tipNow(ph);
  assert.equal(await where(ph), PH);
});

s.test('wave 4, defect D: with a line queued the stage text is shown whole at 320, 375 and 390 ("Updating the town…") and the pill takes the rest', async h => {
  for (const vp of [{ width: 320, height: 640 }, PHONE, { width: 390, height: 844 }]) {
    const page = await open(h, vp);
    await quickStart(page);
    await fast(page);
    await page.evaluate(() => { const real = Game.Api.Mock.bookkeep; Game.Api.Mock.bookkeep = async (...args) => { await new Promise(r => setTimeout(r, 2500)); Game.Api.Mock.bookkeep = real; return real(...args); }; });
    await page.fill('#cmd', 'I look at the board out front');
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => Game.Pipeline.acceptsQueue === true, null, { timeout: 5000 });
    await page.fill('#cmd', 'I tell him I fixed fuel pumps for eleven years and can start today');
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => !document.getElementById('queued-note').hidden);
    const m = await page.evaluate(() => {
      const t = document.getElementById('turn-status-text');
      const q = document.getElementById('queued-note').getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      return { text: t.textContent, cut: t.scrollWidth > t.clientWidth + 0.5, apart: tr.right <= q.left, pill: q.width, line: document.getElementById('turn-status').getBoundingClientRect().height, qt: document.getElementById('queued-text').textContent };
    });
    assert.equal(m.text, 'Updating the town…');
    assert.equal(m.cut, false, `${vp.width}: the stage text is not cut`);
    assert.ok(m.apart && m.pill >= 96, `${vp.width}: the pill after it (${m.pill}px)`);
    assert.ok(m.line <= 34, `${vp.width}: one line (${m.line}px)`);
    assert.match(m.qt, /^Next: “I tell him/);
    assert.deepEqual(await overflowReport(page, vp.width), []);
    await shot(page, `W4_D_queued_${vp.width}`, { clip: { x: 0, y: vp.height - 160, width: vp.width, height: 160 } });
    await page.waitForFunction(() => !Game.Pipeline.busy && document.getElementById('turn-status').hidden, null, { timeout: 15000 });
  }
});

s.test('wave 4, defect E: a phone on its side with the keyboard up keeps room for the story (the top bar aside, Say as the picker beside the box), and the ⋯ list fits (two columns; with the keyboard up it scrolls to its last item)', async h => {
  const LAND = { width: 740, height: 375 };
  const KB = { width: 740, height: 200 };
  for (const say of [false, true]) {
    const page = await open(h, LAND);
    await quickStart(page);
    await focusHelper(page);
    if (say) await page.click('#mode-say');
    await page.focus('#cmd');
    await page.setViewportSize(KB);
    await page.waitForFunction(() => document.getElementById('app').classList.contains('typing'));
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      const r = id => { const e = document.getElementById(id); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
      const pick = r('say-pick');
      const box = r('cmd');
      const small = [...document.querySelectorAll('.composer button, .composer select, .composer textarea')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
        .map(e => e.getBoundingClientRect()).filter(b => b.width < 43.5 || b.height < 43.5).length;
      return { story: Math.round(r('feed-scroll').height), topbar: getComputedStyle(document.querySelector('#screen-game .topbar')).display, chips: document.querySelectorAll('#say-to .say-chip').length, pick: !!pick, row: pick ? Math.abs(pick.top + pick.height / 2 - (box.top + box.height / 2)) < 4 : null, box: Math.round(box.width), small, focus: window.__focusOf() };
    });
    const tag = say ? 'Say: ' : 'Do: ';
    assert.equal(m.topbar, 'none', tag + 'the top bar steps aside');
    assert.ok(m.story >= (say ? 90 : 120), tag + `the story keeps ${m.story}px`);
    assert.equal(m.focus, '#cmd');
    assert.equal(m.small, 0, tag + 'every control 44px or more');
    assert.ok(m.box >= 150, tag + 'room to type: ' + m.box);
    if (say) assert.deepEqual([m.chips, m.pick, m.row], [0, true, true], 'the Say row is the picker alone, in the input row');
    assert.deepEqual(await overflowReport(page, 740), []);
    await shot(page, `W4_E_land_kb_${say ? 'say' : 'do'}`);
    if (say) {
      // The box left and the keyboard down: the top bar back, and the focus where the player put it.
      await page.focus('#mode-say');
      await page.setViewportSize(LAND);
      await page.waitForFunction(() => !document.getElementById('app').classList.contains('typing'));
      assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('#screen-game .topbar')).display !== 'none'));
      assert.equal(await page.evaluate(() => window.__focusOf()), '#mode-say');
      continue;
    }
    // The ⋯ list with the keyboard up: on screen, and it scrolls to its last item.
    await page.click('#act-btn');
    const pop = await page.evaluate(() => {
      const p = document.getElementById('act-pop');
      const r = p.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      p.scrollTop = p.scrollHeight;
      const items = [...p.querySelectorAll('[role="menuitem"]')];
      const l = items[items.length - 1].getBoundingClientRect();
      return { inView, last: l.top >= r.top - 1 && l.bottom <= r.bottom + 1, cols: getComputedStyle(p).gridTemplateColumns.split(' ').length };
    });
    assert.deepEqual(pop, { inView: true, last: true, cols: 2 }, 'keyboard up: ' + JSON.stringify(pop));
    await shot(page, 'W4_E_land_kb_dots');
    // The keyboard down (the list took the focus): all of it in view at once.
    await page.setViewportSize(LAND);
    await page.waitForTimeout(250);
    const all = await page.evaluate(() => {
      const p = document.getElementById('act-pop');
      const r = p.getBoundingClientRect();
      return { inView: r.top >= 0 && r.bottom <= innerHeight, whole: p.scrollHeight <= p.clientHeight + 1, items: p.querySelectorAll('[role="menuitem"]').length };
    });
    assert.deepEqual(all, { inView: true, whole: true, items: 7 }, 'keyboard down: ' + JSON.stringify(all));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__focusOf()), '#act-btn-m');
    // From the tab row (no keyboard): the whole list too.
    await page.keyboard.press('Enter');
    const tr = await page.evaluate(() => { const p = document.getElementById('act-pop'); const r = p.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight, whole: p.scrollHeight <= p.clientHeight + 1 }; });
    assert.deepEqual(tr, { inView: true, whole: true });
    await shot(page, 'W4_E_land_dots_tabrow');
    assert.deepEqual(await overflowReport(page, 740), []);
  }
});

s.test('wave 4, defect F: the river and the roads that run on past the frame are one path each, straight on along the tangent (no seam, no kink)', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => Game.UI.openPanel('places'));
  await page.click('.map-expand');
  const r = await page.evaluate(() => {
    const m = Game.data.TOWN_DATA.map;
    const L = Game.UI.mapLayout(Game.state);
    const probe = d => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); return p; };
    const moves = d => (d.match(/[Mm]/g) || []).length;
    const unit = (a, b) => { const dx = b.x - a.x; const dy = b.y - a.y; const n = Math.hypot(dx, dy) || 1; return { x: dx / n, y: dy / n }; };
    const edge = q => q.x <= 0.5 || q.y <= 0.5 || q.x >= L.W - 0.5 || q.y >= L.H - 0.5;
    // At each end on the frame: the run-on's direction against the line's own tangent there (1 is straight on).
    const check = (orig, ran) => {
      const o = probe(orig);
      const len = o.getTotalLength();
      const r = probe(ran);
      const rl = r.getTotalLength();
      const out = [];
      const a = o.getPointAtLength(0);
      const b = o.getPointAtLength(len);
      if (edge(a)) { const t = unit(a, o.getPointAtLength(0.5)); const e = unit(r.getPointAtLength(0), r.getPointAtLength(1)); out.push(t.x * e.x + t.y * e.y); }
      if (edge(b)) { const t = unit(o.getPointAtLength(len - 0.5), b); const e = unit(r.getPointAtLength(rl - 1), r.getPointAtLength(rl)); out.push(t.x * e.x + t.y * e.y); }
      return out;
    };
    const water = document.querySelector('.map.expanded .map-water').getAttribute('d');
    const bank = document.querySelector('.map.expanded .map-bank').getAttribute('d');
    const roads = [...document.querySelectorAll('.map.expanded .map-road.deco')].map(p => p.getAttribute('d'));
    return {
      absolute: /^\s*M/.test(m.river),
      moves: [moves(water), moves(bank)].concat(roads.map(moves)),
      ranOn: water !== m.river,
      dots: check(m.river, water).concat(...(m.roads || []).map((d, i) => (roads[i] ? check(d, roads[i]) : [])))
    };
  });
  assert.ok(r.ranOn, 'the river runs on in the expanded map');
  if (r.absolute) assert.deepEqual([...new Set(r.moves)], [1], 'one continuous path each (no join to show): ' + r.moves);
  assert.ok(r.dots.length >= 2 && r.dots.every(x => x > 0.9998), 'straight on along the tangent (within 1°): ' + r.dots.map(x => x.toFixed(6)));
  await shot(page, 'W4_F_river_1280');
  // A path that does not start with an absolute move gets separate pieces that overlap its ends by 3 units.
  assert.equal(await page.evaluate(() => Game.UI.runOn('m0,50 l100,0', { W: 100, H: 100 }, 40)), 'M-40,50 L3,50 m0,50 l100,0 M97,50 L140,50');
});

s.test('wave 4, defects G and H: a map marker shut today says "closed today" (shut for good, "closed"); the Bluff reads "Bluff"; /help\'s first line is a heading', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const here = st.player.locationId;
    const known = st.locations.filter(l => l.id !== here && l.discovered !== false && l.away !== true && !l.closed);
    const [a, b] = known;
    a.closedOn = [G.State.weekday(st.time.day)];
    b.closed = true;
    G.UI.openPanel('places');
    const aria = id => document.querySelector(`.map-place[data-loc="${id}"]`).getAttribute('aria-label');
    const out = { a: aria(a.id), aName: a.name, b: aria(b.id), bName: b.name };
    delete a.closedOn;
    delete b.closed;
    const bluff = st.locations.find(l => l.id === 'loc_bluff');
    const bypass = st.locations.find(l => l.type === 'highway' && l.id !== 'loc_bluff');
    if (bluff) {
      const was = bluff.discovered;
      bluff.discovered = true;
      G.UI.renderPanel();
      const row = document.querySelector(`.place-list [data-loc="${bluff.id}"] .plcard-type`);
      out.bluff = { label: G.UI.placeLabel(bluff), row: row ? row.textContent : 'Bluff' };
      bluff.discovered = was;
    }
    if (bypass) out.bypass = G.UI.placeLabel(bypass);
    out.own = G.UI.placeLabel({ id: 'x', type: 'gas', typeLabel: 'Filling station' });
    return out;
  });
  assert.equal(r.a, `${r.aName}, closed today`);
  assert.equal(r.b, `${r.bName}, closed`);
  if (r.bluff) assert.deepEqual(r.bluff, { label: 'Bluff', row: 'Bluff' }, 'the Bluff is labelled "Bluff"');
  if (r.bypass) assert.equal(r.bypass, 'Highway', 'the Bypass keeps Highway');
  assert.equal(r.own, 'Filling station', 'a typeLabel in the data wins');
  // /help: the first line is a heading (styled as the recap's), then one command a line.
  await page.evaluate(contrastIn);
  for (const theme of ['dark', 'parchment']) {
    const help = await page.evaluate(t => {
      Game.Storage.saveSettings({ theme: t });
      Game.UI.applyDisplay();
      Game.Commands.run('/help');
      const n = [...document.querySelectorAll('#feed .f-notice.help')].pop();
      n.scrollIntoView({ block: 'start' });
      const head = n.querySelector('.f-help-h');
      const cs = getComputedStyle(head);
      return {
        head: head.textContent, first: Game.Commands.helpText().split('\n')[0].trim().replace(/:$/, ''), display: cs.display, upper: cs.textTransform, weight: cs.fontWeight, size: cs.fontSize,
        ratio: window.__cr(cs.color, getComputedStyle(document.body).backgroundColor), rest: n.querySelector('.f-notice-text').textContent.split('\n')[0], ws: getComputedStyle(n).whiteSpace
      };
    }, theme);
    assert.equal(help.head, help.first);
    assert.deepEqual([help.display, help.upper, help.weight, help.size, help.ws], ['block', 'uppercase', '600', '12px', 'pre-line']);
    assert.ok(help.ratio >= 4.5, `${theme}: the heading 4.5:1 (${help.ratio.toFixed(2)})`);
    assert.notEqual(help.rest, help.first, 'the heading is not said twice');
    await shot(page, `W4_H_help_${theme}`);
  }
});

s.test('wave 4, copy: Save / Load in the storage warnings, the demo-off toast, conditions said as the sheet says stats, and the export\'s file name', async h => {
  const page = await open(h, LAPTOP);
  await quickStart(page, { name: 'Tomas Reed' });
  // A storage that refuses to write, then to read.
  const warn = await page.evaluate(() => {
    const proto = window.Storage.prototype;
    const set = proto.setItem;
    const get = proto.getItem;
    const out = {};
    proto.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
    try { Game.Storage.saveSettings({ textSize: 'M' }); } finally { proto.setItem = set; }
    out.write = document.getElementById('banner-text').textContent;
    proto.getItem = function () { throw new DOMException('blocked', 'SecurityError'); };
    try { Game.Storage.hasAutosave(); } finally { proto.getItem = get; }
    out.read = document.getElementById('banner-text').textContent;
    document.getElementById('banner').hidden = true;
    return out;
  });
  assert.equal(warn.write, 'Saving failed: this browser\'s storage is full or blocked. Export your game from Save / Load so nothing is lost.');
  assert.equal(warn.read, 'This browser blocked access to its storage, so saves and settings may not load. You can still export your game from Save / Load.');
  assert.equal(await page.evaluate(() => Game.UI.MOCK_OFF), 'Offline demo off: playing with Claude.');
  // Conditions: "(−1 Might)", "(−1 to all)", as Grown says "+1 Wits"; anything else as written.
  const cond = await page.evaluate(() => {
    const p = Game.state.player;
    const was = p.conditions.slice();
    p.conditions.push({ id: 'c1', name: 'Bruised ribs', effect: '-1 might', untilDay: Game.state.time.day + 2 }, { id: 'c2', name: 'Tired', effect: '-1 all', untilDay: null, untilRest: true }, { id: 'c3', name: 'Odd', effect: 'sees double' });
    Game.UI.openPanel('character');
    const t = [...document.querySelectorAll('#panel-body li')].map(li => li.textContent);
    p.conditions = was;
    Game.UI.renderPanel();
    return t;
  });
  assert.ok(cond.some(t => t.startsWith('Bruised ribs (−1 Might) · ')), cond.join(' | '));
  assert.ok(cond.includes('Tired (−1 to all) · until you rest'), cond.join(' | '));
  assert.ok(cond.some(t => t.startsWith('Odd (sees double) · ')), 'anything else as written');
  // The export's file name: an apostrophe is no break, and "day-N".
  await page.evaluate(() => Game.UI.showScreen('saves'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const want = await page.evaluate(() => {
    const slug = t => String(t).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${slug(Game.state.meta.townName)}-${slug(Game.state.player.name)}-day-${Game.state.time.day}.json`;
  });
  assert.equal(dl.suggestedFilename(), want);
  assert.match(want, /-tomas-reed-day-\d+\.json$/);
});

s.run();
