'use strict';
/* Wave 43: where the player is in the three weeks, and what the game is
   costing them. The top bar's "Day 3 of 21" (a phone: "Day 3/21") and the
   next town event beside it on a laptop; this game's running total in the
   save (state.meta.cost), which /undo never takes back; the cost chip on
   the game screen (hidden in the offline demo); Settings, Spending (the
   game and session totals, a per-turn average and the projection to the
   ending, "Pause and ask at $X"); and the key card's cost sentence. Paid
   calls are canned responses served by page.route, as in tests/api.test.cjs.
   Every number comes from Game.data, Game.State or Game.Api, never from
   one town. Run with: node tests/run.cjs wave43 */
const assert = require('assert/strict');
const fs = require('fs');
const { suite, quickStart, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('wave43-progress-spend');
const API = 'https://api.anthropic.com/v1/messages';
const KEY = 'sk-ant-test-0123456789';

// ----- canned responses (the shapes tests/api.test.cjs uses) -----
const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const PARSE = { actionType: 'talk', summary: 'Asks about the tide', targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false };
const DIFF = { socialEvents: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], journalEntry: null };
function roleOf(body) {
  if (body.stream) return 'narrator';
  const sc = body.output_config && body.output_config.format && body.output_config.format.schema;
  if (sc && sc.properties && sc.properties.actionType) return 'parser';
  if (sc && sc.properties && sc.properties.socialEvents) return 'bookkeeper';
  return 'chronicle';
}
function message(text) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_details: null, usage: USAGE }) };
}
function sse(text) {
  const ev = [
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_details: null }, usage: { output_tokens: 42 } },
    { type: 'message_stop' }
  ];
  return { status: 200, contentType: 'text/event-stream', body: ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') };
}
const REPLY = { parser: () => message(JSON.stringify(PARSE)), narrator: () => sse('The old man spits into the river. "Tide\'s wrong," he says.'), bookkeeper: () => message(JSON.stringify(DIFF)), chronicle: () => message('They asked about the tide.') };

/* A game begun in the offline demo (the arrival costs nothing), then played with a key against the canned API. */
async function openPaid(h, viewport) {
  const page = await h.open({ viewport: viewport || LAPTOP });
  const reqs = [];
  await page.route(API, async route => {
    const body = JSON.parse(route.request().postData());
    const role = roleOf(body);
    reqs.push(role);
    const out = REPLY[role]();
    return route.fulfill({ status: out.status, headers: { 'content-type': out.contentType, 'access-control-allow-origin': '*' }, body: out.body });
  });
  await quickStart(page);
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); Game.UI.renderGame(); }, KEY);
  return { page, reqs };
}
const costNow = page => page.evaluate(() => Game.state.meta.cost ? JSON.parse(JSON.stringify(Game.state.meta.cost)) : null);
const chip = page => page.evaluate(() => { const c = document.getElementById('tb-cost'); const r = c.getBoundingClientRect(); return { hidden: c.hidden, shown: r.width > 0 && r.height > 0 && getComputedStyle(c).display !== 'none', text: c.textContent }; });
/* What the day reads on screen: the span's text and the CSS after it. */
const dayView = page => page.evaluate(() => {
  const d = document.getElementById('tb-day');
  const after = getComputedStyle(d, '::after').content;
  const n = document.getElementById('tb-next');
  return { time: document.getElementById('tb-time').textContent, day: d.textContent, after: after === 'none' ? '' : JSON.parse(after), next: n.textContent, nextShown: !n.hidden && n.getBoundingClientRect().width > 0 };
});
/* The next town event as the bar should name it, worked out here from the town's own events. */
const expectedNext = page => page.evaluate(() => {
  const st = Game.state;
  const P = ['morning', 'afternoon', 'evening', 'night'];
  const fired = new Set(st.eventsFired || []);
  const evs = (Game.State.town.events || []).filter(e => e.title && Number.isInteger(e.day) && !fired.has(e.id)
    && (e.day > st.time.day || (e.day === st.time.day && P.indexOf(e.phase) >= P.indexOf(st.time.phase)))).sort((a, b) => a.day - b.day || P.indexOf(a.phase) - P.indexOf(b.phase));
  if (!evs.length) return null;
  const e = evs[0];
  const t = /^the\s+/i.test(e.title) ? e.title.replace(/^the\s+/i, '').replace(/^./, c => c.toLowerCase()) : e.title;
  return { id: e.id, day: e.day, text: e.day === st.time.day ? null : `${t} ${Game.State.weekday(e.day).slice(0, 3)}, Day ${e.day}` };
});

s.test('the top bar: "Day 1 of 21" from the town\'s ending day and the next town event on a laptop, "Day 1/21" on a phone, both without overflow; the clock text is kept; after the event the next one, after the ending no count', async h => {
  for (const vp of [LAPTOP, PHONE]) {
    const page = await h.open({ viewport: vp });
    await quickStart(page);
    const end = await page.evaluate(() => Game.State.town.epilogue.onDay);
    assert.ok(Number.isInteger(end) && end > 1, 'the town has an ending day');
    assert.equal(await page.evaluate(() => Game.State.arc().endDay), end);
    const v = await dayView(page);
    assert.equal(v.time, 'Day 1 · Morning', 'the clock as the dividers say it');
    assert.equal(v.day, 'Day 1');
    const want = await expectedNext(page);
    assert.ok(want && want.text, 'the town has an event to come');
    if (vp === LAPTOP) {
      assert.equal(v.after, ` of ${end}`);
      assert.ok(v.nextShown, 'the next event shows on a laptop');
      assert.equal(v.next, want.text);
    } else {
      assert.equal(v.after, `/${end}`, 'a phone: "Day 1/21"');
      assert.equal(v.nextShown, false, 'no room for the next event on a phone');
      const bar = await page.evaluate(() => Math.round(document.querySelector('#screen-game .topbar').getBoundingClientRect().height));
      assert.ok(bar <= 56, `two lines at 375: ${bar}`);
    }
    assert.deepEqual(await overflowReport(page, vp.width), [], `${vp.width}: no overflow`);
    // Five-figure money still fits beside the day at 375 on day 1 (wave 6, item 8).
    if (vp === PHONE) {
      await page.evaluate(() => { Game.state.player.gold = 12345; Game.UI.renderGame(); });
      assert.ok(await page.evaluate(() => document.querySelector('#screen-game .topbar').getBoundingClientRect().height <= 56));
      assert.deepEqual(await overflowReport(page, vp.width), []);
    }
    // The event told: the bar names the one after it (or nothing).
    await page.evaluate(id => { Game.State.apply({ eventsFired: [id] }); }, want.id);
    const after = await expectedNext(page);
    const v2 = await dayView(page);
    assert.equal(v2.next, after && after.text ? after.text : '');
    // The ending told: the day says so and the count goes (a phone: nothing after the day).
    await page.evaluate(() => { Game.State.apply({ effects: [{ op: 'setFlag', key: 'epilogueShown', value: true }] }); });
    const v3 = await dayView(page);
    assert.equal(v3.after, vp === LAPTOP ? ', after the ending' : '');
    assert.equal(v3.nextShown, false);
    assert.deepEqual(await overflowReport(page, vp.width), []);
  }
});

s.test('the next event on its own day reads "this evening"; the arc reads the town, not a list of its own', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const ev = Game.State.town.events.find(e => e.title && Number.isInteger(e.day));
    Game.State.apply({ setTime: { day: ev.day, phase: 'morning' } });
    Game.UI.renderGame();
    const a = Game.State.arc();
    // Another ending day in the town: the bar follows it.
    Game.State.town.epilogue.onDay = 30;
    Game.UI.renderGame();
    return { ev: { id: ev.id, phase: ev.phase }, next: a.next, text: document.getElementById('tb-next').textContent, of: document.getElementById('tb-day').dataset.of };
  });
  assert.equal(r.next.id, r.ev.id);
  assert.match(r.text, new RegExp(` (this ${r.ev.phase}|tonight)$`));
  assert.equal(r.of, ' of 30');
});

s.test('a paid turn: state.meta.cost adds every call (the same as the session), the chip shows it and changes after each call; a second turn adds up; nothing in the offline demo', async h => {
  const { page, reqs } = await openPaid(h);
  assert.equal(await costNow(page), null, 'nothing spent before the first paid call');
  assert.equal((await chip(page)).shown, false, 'no chip before anything is spent');
  // Every change the chip goes through during the turn.
  await page.evaluate(() => { window.__chips = []; new MutationObserver(() => window.__chips.push(document.getElementById('tb-cost').textContent)).observe(document.getElementById('tb-cost'), { childList: true, characterData: true, subtree: true }); });
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs, ['parser', 'narrator', 'bookkeeper']);
  const c1 = await costNow(page);
  const u1 = await page.evaluate(() => JSON.parse(JSON.stringify(Game.Api.usage.session)));
  const sonnet = (300 * 2 + 80 * 10) / 1e6;
  const opus = (900 * 4 + 42 * 20) / 1e6;
  assert.ok(Math.abs(c1.usd - (2 * sonnet + opus)) < 1e-9, `cost ${c1.usd}`);
  assert.ok(Math.abs(c1.usd - u1.cost) < 1e-9, 'the same as the session');
  assert.deepEqual({ turns: c1.turns, calls: c1.calls, input: c1.input, output: c1.output, cacheRead: c1.cacheRead, cacheWrite: c1.cacheWrite }, { turns: 1, calls: 3, input: 1500, output: 202, cacheRead: 0, cacheWrite: 0 });
  const ch = await chip(page);
  assert.ok(ch.shown, 'the chip shows');
  assert.equal(ch.text, `$${c1.usd.toFixed(2)}`);
  const seen = await page.evaluate(() => window.__chips.length);
  assert.ok(seen >= 3, `the chip was drawn after each call (${seen} changes)`);
  await sendText(page, 'I ask the ferryman about the fare');
  const c2 = await costNow(page);
  assert.equal(c2.turns, 2);
  assert.equal(c2.calls, 6);
  assert.ok(Math.abs(c2.usd - 2 * c1.usd) < 1e-9);
  assert.equal((await chip(page)).text, `$${c2.usd.toFixed(2)}`);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.autosave')).state.meta.cost), c2, 'the autosave holds it');
  // The title screen: no chip there.
  await page.evaluate(() => Game.UI.showScreen('title'));
  assert.equal((await chip(page)).shown, false);
  // The offline demo: no cost recorded and no chip, at 375 too.
  for (const vp of [LAPTOP, PHONE]) {
    const demo = await h.open({ viewport: vp });
    await quickStart(demo);
    await sendText(demo, 'I look around');
    assert.equal(await costNow(demo), null, 'the demo spends nothing');
    assert.equal((await chip(demo)).shown, false, 'no chip in the demo');
    // A game with a cost, played in the demo: still no chip.
    await demo.evaluate(() => { Game.State.spend({ usd: 1, calls: 1, turns: 1 }); Game.UI.renderGame(); });
    assert.equal((await chip(demo)).shown, false);
  }
});

s.test('the chip at 375 sits on the place\'s line: two lines, nothing overflows, and tapping it opens Settings at Spending', async h => {
  const { page } = await openPaid(h, PHONE);
  await sendText(page, 'I ask the ferryman about the tide');
  const m = await page.evaluate(() => {
    const R = q => document.querySelector(q).getBoundingClientRect();
    const c = R('#tb-cost'), l = R('#tb-loc'), t = R('.tb-time'), menu = R('#tb-menu'), bar = R('#screen-game .topbar');
    return { sameLine: Math.abs((c.top + c.bottom) / 2 - (l.top + l.bottom) / 2) < 8, beforeMenu: c.right <= menu.left, aboveTime: c.bottom <= t.top + 2, bar: bar.height };
  });
  assert.deepEqual([m.sameLine, m.beforeMenu, m.aboveTime], [true, true, true], JSON.stringify(m));
  assert.ok(m.bar <= 56, JSON.stringify(m));
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.click('#tb-cost');
  await page.waitForSelector('#screen-settings.active');
  const r = await page.evaluate(() => ({ focus: document.activeElement.id, legend: document.querySelector('#set-spending legend').textContent, line: document.getElementById('spend-line').textContent, top: document.getElementById('set-spending').getBoundingClientRect().top }));
  assert.equal(r.focus, 'set-spending');
  assert.equal(r.legend, 'Spending');
  assert.match(r.line, /^This game: \$\d+\.\d\d over 1 turn · this session: \$\d+\.\d\d$/);
  assert.ok(r.top >= -1 && r.top < 740, 'the group is in view');
  assert.deepEqual(await overflowReport(page, 375), []);
});

s.test('/undo does not take the cost back, nor does a failed turn; the cost survives a reload, Continue and an import into a fresh browser', async h => {
  const { page } = await openPaid(h);
  await sendText(page, 'I ask the ferryman about the tide');
  await sendText(page, 'I ask the ferryman about the fare');
  const c2 = await costNow(page);
  const turn = await page.evaluate(() => Game.state.meta.turn);
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), turn - 1, 'the turn was taken back');
  assert.deepEqual(await costNow(page), c2, 'the money stays spent');
  await sendText(page, '/redo');
  assert.deepEqual(await costNow(page), c2);
  // A turn whose bookkeeper fails is rolled back, but what its calls cost is kept.
  await page.unroute(API);
  let n = 0;
  await page.route(API, route => {
    const role = roleOf(JSON.parse(route.request().postData()));
    n += 1;
    if (role === 'narrator') return route.fulfill({ status: 400, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'no' } }) });
    const out = REPLY[role]();
    return route.fulfill({ status: out.status, headers: { 'content-type': out.contentType, 'access-control-allow-origin': '*' }, body: out.body });
  });
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await sendText(page, 'I ask about the boats');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), t0, 'the failed turn was rolled back');
  const c3 = await costNow(page);
  assert.ok(n >= 2, 'the parser was called');
  assert.ok(c3.usd > c2.usd && c3.calls === c2.calls + 1, `the parser's call is kept: ${JSON.stringify(c3)}`);
  // Reload and Continue: the game's own total, beside a session that starts again.
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(() => Game.App.continueGame());
  await page.waitForSelector('#screen-game.active');
  assert.deepEqual(await costNow(page), c3);
  assert.equal(await page.evaluate(() => Game.UI.spendLine()), `This game: $${c3.usd.toFixed(2)} over ${c3.turns} turns · this session: $0.00`);
  assert.equal((await chip(page)).text, `$${c3.usd.toFixed(2)}`);
  // Export, then import in a fresh browser.
  await page.click('#tb-save');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  assert.deepEqual(JSON.parse(text).state.meta.cost, c3);
  const fresh = await h.open({ viewport: PHONE });
  await fresh.click('#btn-load');
  await fresh.setInputFiles('#import-file', { name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await fresh.waitForSelector('#screen-game.active');
  assert.deepEqual(await costNow(fresh), c3);
  // A cost of the wrong shape in a save is read field by field.
  const bad = await fresh.evaluate(() => {
    const st = JSON.parse(JSON.stringify(Game.state));
    st.meta.cost = { usd: 'lots', turns: 3, calls: -2, input: 10.6 };
    const a = Game.State.load(st, Game.State.town).state || Game.state;
    st.meta.cost = 'free';
    const b = Game.State.load(st, Game.State.town).state || Game.state;
    return [a.meta ? a.meta.cost : null, b.meta ? b.meta.cost : 'gone'];
  });
  assert.deepEqual(bad[0], { usd: 0, turns: 3, calls: 0, input: 11, output: 0, cacheRead: 0, cacheWrite: 0 });
  assert.equal(bad[1], undefined);
});

s.test('the spending pause: crossing it says so once in the story; the next turn asks; Stop keeps the words in the box and runs nothing; Keep going runs it and is not asked again; /undo does not bring the question back', async h => {
  const { page, reqs } = await openPaid(h);
  // Settings, Spending: a custom amount of one cent.
  await page.evaluate(() => Game.UI.showScreen('settings'));
  assert.equal(await page.evaluate(() => Game.Storage.settings().spendCeiling), null, 'off by default');
  await page.check('input[name="set-ceiling"][value="custom"]');
  assert.ok(await page.isVisible('#set-ceiling-amount'));
  await page.fill('#set-ceiling-amount', '0.01');
  await page.press('#set-ceiling-amount', 'Tab');
  assert.equal(await page.evaluate(() => Game.Storage.settings().spendCeiling), 0.01);
  await page.click('#settings-done');
  await page.waitForSelector('#screen-game.active');
  const NOTE = /^This game has now cost \$\d+\.\d\d, past the \$0\.01 you set in Settings\. The next turn asks first\.$/;
  const notes = () => page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].map(x => (x.querySelector('.f-notice-text') || x).textContent).filter(t => /past the \$/.test(t)));
  // A turn here costs under a cent (see the cost test): the first stays under the pause, the second crosses it.
  await sendText(page, 'I ask the ferryman about the tide');
  assert.ok((await costNow(page)).usd < 0.01);
  assert.equal((await notes()).length, 0, 'under the pause: nothing said');
  await sendText(page, 'I ask the ferryman about the river');
  assert.ok((await costNow(page)).usd >= 0.01);
  const ns = await notes();
  assert.equal(ns.length, 1, 'one notice at the crossing');
  assert.match(ns[0], NOTE);
  // The next line: asked first. Stop keeps the words and calls nothing.
  const n0 = reqs.length;
  const turn0 = await page.evaluate(() => Game.state.meta.turn);
  await page.fill('#cmd', 'I ask the ferryman about the fare');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#ask[open]');
  const q = await page.evaluate(() => ({ title: document.getElementById('ask-title').textContent, text: document.getElementById('ask-text').textContent, yes: document.getElementById('ask-yes').textContent, no: document.getElementById('ask-no').textContent }));
  const usd = (await costNow(page)).usd;
  assert.deepEqual(q, { title: 'You set a pause at $0.01', text: `You have spent $${usd.toFixed(2)} on this game. Keep going?`, yes: 'Keep going', no: 'Stop' });
  await page.click('#ask-no');
  await page.waitForFunction(() => !document.getElementById('ask').open);
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the fare', 'the words are kept in the box');
  assert.equal(reqs.length, n0, 'no call');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), turn0, 'no turn');
  // The Wait button (a paid turn too) asks as well.
  await page.fill('#cmd', '');
  await page.click('#send');
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-no');
  await page.waitForFunction(() => !document.getElementById('ask').open);
  assert.equal(reqs.length, n0, 'no call for Wait either');
  // A free command never asks.
  await sendText(page, '/help');
  assert.equal(await page.evaluate(() => document.getElementById('ask').open), false);
  // Keep going: the turn runs, once.
  await page.fill('#cmd', 'I ask the ferryman about the fare');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-yes');
  await page.waitForFunction(() => !document.getElementById('ask').open && !Game.Pipeline.busy && Game.state.meta.turn > 0);
  await page.waitForFunction(t => Game.state.meta.turn === t + 1 && !Game.Pipeline.busy, turn0);
  assert.equal(reqs.length, n0 + 3, 'the turn ran');
  assert.equal(await page.inputValue('#cmd'), '');
  const c = await costNow(page);
  assert.equal(c.asked, 0.01);
  assert.equal(c.noticed, 0.01);
  // The turn after: no question, no second notice.
  await sendText(page, 'I nod');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), turn0 + 2);
  assert.equal((await notes()).length, 1, 'still one notice');
  // /undo keeps what was spent and the answer given.
  await sendText(page, '/undo');
  const cu = await costNow(page);
  assert.equal(cu.asked, 0.01);
  await sendText(page, 'I nod again');
  assert.equal(await page.evaluate(() => document.getElementById('ask').open), false);
  // A new amount asks again at it.
  await page.evaluate(() => Game.Storage.saveSettings({ spendCeiling: 0.02 }));
  await page.fill('#cmd', 'I wave');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-no');
  await page.waitForFunction(() => !document.getElementById('ask').open);
  assert.equal(await page.inputValue('#cmd'), 'I wave');
});

s.test('the projection: a per-turn average and what the rest of the arc may cost at this pace (or 20 turns a day before half a day has gone by); none after the ending', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const P = Game.UI.spendProjection;
    return {
      none: P({ usd: 0, turns: 0, day: 1, phase: 'morning', endDay: 21 }),
      pace: P({ usd: 1.2, turns: 30, day: 3, phase: 'morning', endDay: 21 }),
      early: P({ usd: 0.08, turns: 2, day: 1, phase: 'afternoon', endDay: 21 }),
      ended: P({ usd: 2, turns: 50, day: 21, phase: 'morning', endDay: 21, ended: true }),
      noEnd: P({ usd: 2, turns: 50, day: 4, phase: 'morning', endDay: null }),
      paceDay: Game.UI.PACE_DAY
    };
  });
  assert.equal(r.none, null);
  assert.ok(Math.abs(r.pace.perTurn - 0.04) < 1e-12);
  assert.equal(r.pace.perDay, 15); // 30 turns over two days
  assert.equal(r.pace.left, 18); // day 3 morning to day 21 morning
  assert.ok(Math.abs(r.pace.more - 0.04 * 15 * 18) < 1e-9);
  assert.equal(r.pace.assumed, false);
  assert.equal(r.early.assumed, true);
  assert.equal(r.early.perDay, r.paceDay);
  assert.equal(r.early.left, 19.75);
  assert.ok(Math.abs(r.early.more - 0.04 * r.paceDay * 19.75) < 1e-9);
  assert.equal(r.ended.more, null);
  assert.equal(r.noEnd.more, null);
  // In a game with a key: the words in Settings, from the game's cost, clock and ending day.
  const line = await page.evaluate(() => {
    Game.Storage.saveSettings({ mockMode: false });
    Game.State.spend({ usd: 1.2, turns: 30, calls: 90 });
    Game.State.apply({ setTime: { day: 3, phase: 'morning' } });
    Game.UI.showScreen('settings');
    return { pace: document.getElementById('spend-pace').textContent, line: document.getElementById('spend-line').textContent, end: Game.State.arc().endDay };
  });
  const more = Math.round(0.04 * 15 * (line.end - 3));
  assert.equal(line.pace, `About $0.04 a turn; roughly $${more} more to Day ${line.end} at this pace.`);
  assert.match(line.line, /^This game: \$1\.20 over 30 turns · this session: \$0\.00$/);
});

s.test('Settings, Spending: the presets 5, 10, 20, custom and off are kept like the other settings; the session line at the top is as it was; the key card names what Standard and Thrifty cost', async h => {
  const page = await h.open();
  await page.click('#btn-settings');
  assert.equal(await page.textContent('#set-spending legend'), 'Spending');
  assert.equal(await page.textContent('#spend-line'), 'No game open · this session: $0.00');
  assert.match(await page.textContent('#session-line'), /^This session: 0 turns · \$0\.00$/);
  const labels = await page.evaluate(() => [...document.querySelectorAll('input[name="set-ceiling"]')].map(r => r.parentNode.textContent.trim()));
  assert.deepEqual(labels, ['Off', '$5', '$10', '$20', 'Custom']);
  assert.ok(await page.isChecked('input[name="set-ceiling"][value="off"]'));
  await page.check('input[name="set-ceiling"][value="10"]');
  assert.equal(await page.evaluate(() => Game.Storage.settings().spendCeiling), 10);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.click('#btn-settings');
  assert.ok(await page.isChecked('input[name="set-ceiling"][value="10"]'), 'kept across a reload');
  assert.equal(await page.isVisible('#set-ceiling-amount'), false);
  await page.check('input[name="set-ceiling"][value="custom"]');
  await page.fill('#set-ceiling-amount', '7.5');
  await page.press('#set-ceiling-amount', 'Tab');
  assert.equal(await page.evaluate(() => Game.Storage.settings().spendCeiling), 7.5);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.click('#btn-settings');
  assert.ok(await page.isChecked('input[name="set-ceiling"][value="custom"]'));
  assert.equal(await page.inputValue('#set-ceiling-amount'), '7.5');
  await page.check('input[name="set-ceiling"][value="off"]');
  assert.equal(await page.evaluate(() => Game.Storage.settings().spendCeiling), null);
  // Junk in the stored settings is off.
  assert.equal(await page.evaluate(() => Game.Storage.saveSettings({ spendCeiling: -3 }).spendCeiling), null);
  assert.equal(await page.evaluate(() => Game.Storage.saveSettings({ spendCeiling: 'ten' }).spendCeiling), null);
  assert.deepEqual(await overflowReport(page, 1280), []);
  // A phone: the group fits.
  const phone = await h.open({ viewport: PHONE });
  await phone.click('#btn-settings');
  assert.deepEqual(await overflowReport(phone, 375), []);
  // The key card's cost sentence.
  const card = await page.evaluate(() => document.querySelector('#choose-claude .choice-sub').textContent);
  assert.match(card, /Standard quality a turn costs about 4 to 5 cents/);
  assert.match(card, /whole three-week game about \$15 to \$25/);
  assert.match(card, /Thrifty is about a quarter of that/);
});

s.run();
