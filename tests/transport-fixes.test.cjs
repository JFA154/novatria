'use strict';
/* Transport and turn lifecycle (docs/notes/transport.md): timeouts, retries
   and retry-after, streams that break or are cut off, the one-hour cache
   and its price, Stop, the queue, a bookkeeper that fails, the rewrite as
   an edit, the turn fixes (REVIEW E1, E5, E7, E8, E14, E15, 3.6), news and
   the epilogue turn, the chronicle threshold, /recap, the card game,
   fights, and Upgrade version 8 with per-step stamping. Real-provider
   tests route canned replies for https://api.anthropic.com inside the
   browser; nothing leaves the machine. Ids and names come from the game.
   Run with: node tests/run.cjs transport */
const assert = require('assert/strict');
const { suite, quickStart, stateJson, sendText, fixtures, findScene, place, LAPTOP } = require('./helpers.cjs');

const s = suite('transport-fixes');
const API = 'https://api.anthropic.com/v1/messages';
const MODELS = 'https://api.anthropic.com/v1/models';
const KEY = 'sk-ant-test-0123456789';
const PHASES = ['morning', 'afternoon', 'evening', 'night'];

function roleOf(body) {
  if (body.stream) return 'narrator';
  if (body.max_tokens === 1) return 'prewarm';
  const sc = body.output_config && body.output_config.format && body.output_config.format.schema;
  if (sc && sc.properties && sc.properties.actionType) return 'parser';
  if (sc && sc.properties && sc.properties.attitudeChanges) return 'bookkeeper';
  return 'chronicle';
}
const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const PARSE = { actionType: 'talk', summary: 'Asks about the tide', targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false };
const DIFF = { attitudeChanges: [], newMemories: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], journalEntry: null };
const NARRATION = ['Rain needles the water. ', 'The old man spits into the river. ', '"Tide\'s wrong," he says.'];
function message(text, opts) {
  opts = opts || {};
  return {
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: opts.stop || 'end_turn', stop_details: null, usage: opts.usage || USAGE })
  };
}
const parseReply = over => () => message(JSON.stringify(Object.assign({}, PARSE, over)));
const bookReply = over => () => message(JSON.stringify(Object.assign({}, DIFF, over)));
/* An SSE body. opts: stop, usage, error (an error event instead of the end),
   noStop (no message_stop: the stream just ends). */
function sse(parts, opts) {
  opts = opts || {};
  const u = opts.usage || { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const ev = [
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: u } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
  ];
  for (const p of parts) ev.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } });
  if (opts.error) ev.push({ type: 'error', error: opts.error });
  else {
    ev.push({ type: 'content_block_stop', index: 0 });
    ev.push({ type: 'message_delta', delta: { stop_reason: opts.stop || 'end_turn' }, usage: { output_tokens: opts.output || 42 } });
    if (!opts.noStop) ev.push({ type: 'message_stop' });
  }
  return { status: 200, contentType: 'text/event-stream', body: ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') };
}
const narrReply = (parts, opts) => () => sse(parts || NARRATION, opts);
const errorReply = (status, type, headers) => () => ({ status, contentType: 'application/json', headers, body: JSON.stringify({ type: 'error', error: { type, message: `${type} happened` } }) });
const HANG = () => ({ hang: true });
const DEFAULTS = { parser: parseReply(), narrator: narrReply(), bookkeeper: bookReply(), chronicle: () => message('They arrived and asked about the tide.'), prewarm: () => message('ready', { stop: 'max_tokens' }) };

/* The game with the route installed, then mock mode off and a key set.
   queue(role, ...replies): a reply is { status, contentType, body,
   headers? , delay? (ms before it is sent) } or HANG (never answered). */
async function openReal(h) {
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  const queues = { parser: [], narrator: [], bookkeeper: [], chronicle: [], prewarm: [] };
  await page.route(API, async route => {
    const req = route.request();
    const body = JSON.parse(req.postData());
    const role = roleOf(body);
    const n = reqs.filter(r => r.role === role).length + 1;
    reqs.push({ role, n, body, at: Date.now() });
    const make = queues[role].length ? queues[role].shift() : DEFAULTS[role];
    const out = make(body, n);
    if (out.hang) return; // never answered: only the game's own timeout or Stop ends it
    if (out.abort) return route.abort('failed');
    if (out.delay) await new Promise(r => setTimeout(r, out.delay));
    return route.fulfill({
      status: out.status,
      headers: Object.assign({ 'content-type': out.contentType, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id, retry-after', 'request-id': `req_${role}_${n}` }, out.headers || {}),
      body: out.body
    }).catch(() => {});
  });
  await quickStart(page, { bgIndex: (await fixtures(page)).docksBg });
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  return { page, reqs, queue: (role, ...fns) => queues[role].push(...fns) };
}
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.textContent : null; });
const quiets = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
const narrPackets = page => page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate').map(c => c.text));
const lastLog = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });

// ----- A. transport -----

s.test('a narrator stream that never answers ends the turn after the idle timeout (one retry): the input comes back, nothing changed, and Debug says it timed out with no data', async h => {
  const { page, reqs, queue } = await openReal(h);
  await page.evaluate(() => { Game.Api.TIMEOUTS.stream = 1000; });
  const before = await stateJson(page);
  queue('narrator', HANG, HANG);
  const t0 = Date.now();
  await page.fill('#cmd', 'I ask the ferryman about the tide');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  const took = Date.now() - t0;
  assert.ok(took < 9000, `ended in ${took} ms`);
  assert.deepEqual(reqs.map(r => r.role), ['parser', 'narrator', 'narrator'], 'tried once more, then gave up');
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the tide');
  assert.match(await lastNotice(page), /stopped answering/);
  assert.equal(await stateJson(page), before);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-narr.pending').length), 0, 'no pending narration left');
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'api').map(d => d.reason));
  assert.ok(dbg.some(r => r === 'timeout: timed out after 1 s with no data'), dbg.join(' | '));
  // A JSON call that never answers: the same, on the JSON timeout.
  await page.evaluate(() => { Game.Api.TIMEOUTS.json = 800; });
  queue('parser', HANG, HANG);
  await page.fill('#cmd', 'I ask about the boats');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 15000 });
  assert.equal(await page.inputValue('#cmd'), 'I ask about the boats');
  assert.equal(await stateJson(page), before);
  assert.ok((await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'api').map(d => d.reason))).includes('timeout: timed out after 1 s'));
});

s.test('a stream that ends before message_stop is asked for once more; twice in a row is never committed', async h => {
  const { page, reqs, queue } = await openReal(h);
  queue('narrator', narrReply(['He shrugs and says that the boats are all'], { noStop: true }), narrReply());
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs.filter(r => r.role === 'narrator').length, 2);
  const log = await lastLog(page);
  assert.equal(log.narration, NARRATION.join(''), 'the second, whole reply');
  assert.ok(!(await page.innerText('#feed')).includes('boats are all'), 'the broken draft left the feed');
  const before = await stateJson(page);
  queue('narrator', narrReply(['He shrugs'], { noStop: true }), narrReply(['He shrugs again'], { noStop: true }));
  await sendText(page, 'I ask about the boats');
  assert.equal(await stateJson(page), before, 'a truncated narration is never saved');
  assert.match(await lastNotice(page), /connection dropped before the reply finished/);
  assert.equal(await page.inputValue('#cmd'), 'I ask about the boats');
});

s.test('a narration cut off by max_tokens is asked for again with twice the limit; twice is a failure, never a saved turn; max_tokens follows the narrator\'s effort; the mock\'s cut-off reply fails the turn too', async h => {
  const { page, reqs, queue } = await openReal(h);
  queue('narrator', narrReply(['He shrugs and says that'], { stop: 'max_tokens' }), narrReply());
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs.filter(r => r.role === 'narrator').map(r => r.body.max_tokens), [3000, 6000]);
  assert.equal((await lastLog(page)).narration, NARRATION.join(''));
  const before = await stateJson(page);
  queue('narrator', narrReply(['He shrugs'], { stop: 'max_tokens' }), narrReply(['He shrugs and'], { stop: 'max_tokens' }));
  await sendText(page, 'I ask about the boats');
  assert.equal(await stateJson(page), before);
  assert.match(await lastNotice(page), /cut off before it finished/);
  await page.fill('#cmd', '');
  // Effort: low 2000, high 6000.
  for (const [effort, max] of [['low', 2000], ['high', 6000]]) {
    await page.evaluate(e => Game.Storage.saveSettings({ effort: { narrator: e } }), effort);
    await sendText(page, 'I nod');
    assert.equal(reqs.filter(r => r.role === 'narrator').pop().body.max_tokens, max, effort);
  }
  // The chronicle too: once more with twice the limit.
  queue('chronicle', () => message('Half a summ', { stop: 'max_tokens' }), () => message('They talked about the tide.'));
  assert.equal(await page.evaluate(() => Game.Api.chronicle(Game.state.log.slice())), 'They talked about the tide.');
  assert.deepEqual(reqs.filter(r => r.role === 'chronicle').map(r => r.body.max_tokens), [2000, 4000]);
  // Mock mode: a reply that says it was cut off fails the turn.
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: true }); Game.Api.Mock.delay = 0; Game.Api.Mock.queue('narrate', { text: 'He shrugs and says', stopReason: 'max_tokens' }); });
  const b2 = await stateJson(page);
  await sendText(page, 'I wave');
  assert.equal(await stateJson(page), b2);
});

s.test('503 and a mid-stream overloaded_error are retried once; retry-after is honoured and capped at 10 s', async h => {
  const { page, reqs, queue } = await openReal(h);
  queue('parser', errorReply(503, 'overloaded_error'));
  queue('narrator', narrReply(['The quay '], { error: { type: 'overloaded_error', message: 'Overloaded' } }));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs.map(r => r.role), ['parser', 'parser', 'narrator', 'narrator', 'bookkeeper']);
  assert.equal((await lastLog(page)).narration, NARRATION.join(''));
  assert.ok(!(await page.innerText('#feed')).includes('The quay'), 'the overloaded draft left the feed');
  for (const status of [502, 504]) {
    const n = reqs.length;
    queue('bookkeeper', errorReply(status, 'api_error'));
    await sendText(page, 'I nod');
    assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'narrator', 'bookkeeper', 'bookkeeper'], String(status));
  }
  // retry-after: 2 seconds.
  const n = reqs.length;
  queue('parser', errorReply(429, 'rate_limit_error', { 'retry-after': '2' }));
  await sendText(page, 'I ask about the boats');
  const ps = reqs.slice(n).filter(r => r.role === 'parser');
  const gap = ps[1].at - ps[0].at;
  assert.ok(gap >= 1900 && gap < 4500, 'waited about 2 s: ' + gap);
  const capped = await page.evaluate(() => [Game.Api.retryAfterMs('60'), Game.Api.retryAfterMs('0.5'), Game.Api.retryAfterMs(null), Game.Api.retryAfterMs('soon'), Game.Api.RETRY_STATUSES]);
  assert.deepEqual(capped, [10000, 500, null, null, [429, 500, 502, 503, 504, 529]]);
});

s.test('the narrator\'s three blocks carry a one-hour TTL; a 1-hour write costs 2x input, a 5-minute one 1.25x; a dated model id still prices; a retried call counts both tries', async h => {
  const { page, reqs, queue } = await openReal(h);
  queue('narrator', narrReply(['He shrugs'], { noStop: true, usage: { input_tokens: 500, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }),
    narrReply(null, { usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 700, cache_creation: { ephemeral_1h_input_tokens: 600, ephemeral_5m_input_tokens: 100 } }, output: 50 }));
  await sendText(page, 'I ask the ferryman about the tide');
  const narr = reqs.filter(r => r.role === 'narrator').pop();
  assert.equal(narr.body.system.length, 3);
  assert.ok(narr.body.system.every(b => b.cache_control && b.cache_control.type === 'ephemeral' && b.cache_control.ttl === '1h'));
  for (const r of reqs.filter(x => x.role !== 'narrator')) assert.ok(!JSON.stringify(r.body).includes('cache_control'), r.role + ' caches nothing');
  const u = await page.evaluate(() => JSON.parse(JSON.stringify(Game.Api.usage.turn)));
  const sonnet = 2 * (300 * 2 + 80 * 10) / 1e6;
  // Both narrator tries count: 500 + 1000 in, 42 + 50 out; 600 written for an hour, 100 for five minutes.
  const opus = ((500 + 1000) * 4 + (42 + 50) * 20 + 600 * 4 * 2 + 100 * 4 * 1.25) / 1e6;
  assert.equal(u.input, 300 * 2 + 1500);
  assert.equal(u.cacheCreation, 700);
  assert.equal(u.cacheWrite1h, 600);
  assert.ok(Math.abs(u.cost - (sonnet + opus)) < 1e-12, `${u.cost} vs ${sonnet + opus}`);
  const p = await page.evaluate(() => ({
    old: Game.Api.costOf('claude-opus-5-5', { input: 0, output: 0, cacheRead: 0, cacheCreation: 1000 }),
    dated: Game.Api.costOf('claude-opus-5-5-20261001', { input: 1000, output: 0, cacheRead: 0, cacheCreation: 0 }),
    unknown: Game.Api.costOf('claude-mystery-9', { input: 1000, output: 0, cacheRead: 0, cacheCreation: 0 })
  }));
  assert.ok(Math.abs(p.old - 1000 * 4 * 2 / 1e6) < 1e-12, 'the old field alone is a 1-hour write');
  assert.ok(Math.abs(p.dated - 1000 * 4 / 1e6) < 1e-12);
  assert.equal(p.unknown, null);
});

s.test('a key with an invisible character is refused with a clear message and never sent; Api.checkKey asks GET /v1/models', async h => {
  const { page, reqs } = await openReal(h);
  const models = [];
  await page.route(MODELS + '*', route => {
    const k = route.request().headers()['x-api-key'];
    models.push({ method: route.request().method(), key: k, version: route.request().headers()['anthropic-version'] });
    const ok = k === KEY;
    return route.fulfill({ status: ok ? 200 : 401, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(ok ? { data: [] } : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  });
  const r = await page.evaluate(async k => ({ good: await Game.Api.checkKey(k), bad: await Game.Api.checkKey('sk-ant-wrong'), zw: await Game.Api.checkKey('sk-ant​-123'), valid: [Game.Api.validKey(k), Game.Api.validKey('sk ant'), Game.Api.validKey('sk-ant​')] }), KEY);
  assert.deepEqual(r.good, { ok: true, status: 200, message: 'The key works.' });
  assert.equal(r.bad.ok, false);
  assert.equal(r.bad.status, 401);
  assert.match(r.bad.message, /key was not accepted/);
  assert.equal(r.zw.ok, false);
  assert.match(r.zw.message, /invisible character/);
  assert.deepEqual(r.valid, [true, false, false]);
  assert.deepEqual(models.map(m => [m.method, m.version]), [['GET', '2026-10-21'], ['GET', '2026-10-21']], 'the bad key is never sent');
  // A turn with such a key: the message, and no request.
  await page.evaluate(() => Game.Storage.setApiKey('sk-ant-test​0123', false));
  const n = reqs.length;
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(reqs.length, n);
  assert.match(await lastNotice(page), /space or an invisible character/);
});

s.test('when the last narration was over 50 minutes ago, a max_tokens 1 call with the same three blocks warms the cache while the parser works', async h => {
  const { page, reqs } = await openReal(h);
  await sendText(page, 'I ask the ferryman about the tide');
  assert.ok(!reqs.some(r => r.role === 'prewarm'), 'not after a fresh narration');
  await page.evaluate(() => { Game.Api.lastNarratorAt = Date.now() - 51 * 60 * 1000; });
  const n = reqs.length;
  await sendText(page, 'I ask the ferryman about the fare');
  const roles = reqs.slice(n).map(r => r.role);
  assert.deepEqual(roles.slice().sort(), ['bookkeeper', 'narrator', 'parser', 'prewarm']);
  assert.ok(roles.indexOf('prewarm') < roles.indexOf('narrator'), roles.join(','));
  const warm = reqs.slice(n).find(r => r.role === 'prewarm');
  const narr = reqs.slice(n).find(r => r.role === 'narrator');
  assert.equal(warm.body.max_tokens, 1);
  assert.ok(!warm.body.stream);
  assert.deepEqual(warm.body.system, narr.body.system, 'the same cached blocks');
  assert.equal(warm.body.model, narr.body.model);
  // Once warmed, the next turn does not warm again.
  const m = reqs.length;
  await sendText(page, 'I nod');
  assert.ok(!reqs.slice(m).some(r => r.role === 'prewarm'));
});

// ----- B. narration lifecycle -----

s.test('a rewrite is sent as an edit (packet, draft, note) and only for a hard problem; the draft stays on screen dimmed meanwhile, and stands if the rewrite fails', async h => {
  const { page, reqs, queue } = await openReal(h);
  await page.evaluate(() => {
    window.__dim = [];
    Game.UI.feed.rewriting = (node, on) => { window.__dim.push([!!node, on, node.textContent.includes('air is thick')]); };
  });
  const bad = ['The air is thick with river fog. ', 'What do you do?'];
  queue('narrator', narrReply(bad), narrReply());
  await sendText(page, 'I ask the ferryman about the tide');
  const ns = reqs.filter(r => r.role === 'narrator');
  assert.equal(ns.length, 2);
  const m = ns[1].body.messages;
  assert.deepEqual(m.map(x => x.role), ['user', 'assistant', 'user'], 'an edit, ending with the user');
  assert.equal(m[0].content, ns[0].body.messages[0].content, 'the same packet');
  assert.equal(m[1].content, bad.join('').trim(), 'the draft');
  assert.match(m[2].content, /^STYLE CHECK FAILED on your last attempt: .*\nChange only what the note names; keep everything else in the draft as it is\.$/s);
  assert.deepEqual(await page.evaluate(() => window.__dim), [[true, true, true], [true, false, true]], 'dimmed with the draft showing, then not');
  assert.equal((await lastLog(page)).narration, NARRATION.join(''));
  // The rewrite fails (two 500s): the first draft is the narration.
  queue('narrator', narrReply(bad), errorReply(500, 'api_error'), errorReply(500, 'api_error'));
  await sendText(page, 'I ask about the boats');
  assert.equal((await lastLog(page)).narration, bad.join('').trim(), 'the draft stands');
  assert.equal(await page.inputValue('#cmd'), '');
  // A soft problem (the style check marks it hard: false) is only noted.
  await page.evaluate(() => { const orig = Game.Style.check; Game.Style.check = function () { const r = orig.apply(this, arguments); r.problems = r.problems.map(p => Object.assign({}, p, { hard: false })); return r; }; });
  const n = reqs.length;
  queue('narrator', narrReply(bad));
  await sendText(page, 'I nod');
  assert.equal(reqs.slice(n).filter(r => r.role === 'narrator').length, 1, 'no rewrite');
  assert.ok(await page.evaluate(() => Game.State.debugLog.some(d => d.kind === 'style' && d.soft === true)));
});

s.test('a bookkeeper that fails keeps the narration: the engine\'s changes stand, the log says not recorded, and the retry in the background records it', async h => {
  const { page, reqs, queue } = await openReal(h);
  const t0 = await page.evaluate(() => ({ shorts: Game.state.time.shorts, turn: Game.state.meta.turn }));
  queue('parser', parseReply({ timeCost: 'short' }));
  queue('bookkeeper', errorReply(500, 'api_error'), errorReply(500, 'api_error'), () => Object.assign(bookReply({ journalEntry: 'Asked about the tide, late.' })(), { delay: 600 }));
  await sendText(page, 'I ask the ferryman about the tide');
  const r = await page.evaluate(() => ({ log: Game.state.log[Game.state.log.length - 1], shorts: Game.state.time.shorts, turn: Game.state.meta.turn, saved: Game.Storage.loadAutosave().state.log.slice(-1)[0] }));
  assert.equal(r.log.narration, NARRATION.join(''), 'the narration stands');
  assert.equal(r.log.changes, 'not recorded');
  assert.equal(r.saved.changes, 'not recorded', 'and is saved');
  assert.equal(r.turn, t0.turn + 1);
  assert.equal(r.shorts, t0.shorts + 1, 'time passed (the engine\'s own change)');
  assert.ok((await quiets(page)).some(q => /could not be recorded yet/.test(q)));
  assert.equal(await page.inputValue('#cmd'), '');
  await page.waitForFunction(() => !Game.state.log[Game.state.log.length - 1].changes, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => Game.state.journal.slice(-1)[0].text), 'Asked about the tide, late.');
  assert.ok((await quiets(page)).includes('What changed on that turn is recorded now.'));
  assert.equal(reqs.filter(x => x.role === 'bookkeeper').length, 3);
  // Taken back with /undo before the retry returns: nothing is applied.
  queue('bookkeeper', errorReply(500, 'api_error'), errorReply(500, 'api_error'), () => Object.assign(bookReply({ journalEntry: 'Should not appear.' })(), { delay: 800 }));
  await sendText(page, 'I ask about the boats');
  await sendText(page, '/undo');
  await page.waitForTimeout(1200);
  assert.ok(!(await page.evaluate(() => Game.state.journal.map(j => j.text))).includes('Should not appear.'));
});

// ----- C. status, Stop, the queue -----

s.test('the status listener hears each stage; Stop ends the turn cleanly with the input back; a line sent while the bookkeeper runs waits and then runs', async h => {
  const { page, reqs, queue } = await openReal(h);
  await page.evaluate(() => { window.__stages = []; Game.Pipeline.setStatusListener(e => window.__stages.push(e.stage)); });
  // A hard style problem ("What do you do") is what asks for the rewrite stage; a soft one is only noted.
  queue('narrator', narrReply(['Fog sits on the water. What do you do? ']), narrReply());
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(await page.evaluate(() => window.__stages), ['parse', 'narrate', 'rewrite', 'bookkeep', 'idle']);
  // Stop while the narrator hangs.
  const before = await stateJson(page);
  queue('narrator', HANG);
  await page.fill('#cmd', 'I ask about the boats');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.busy && document.querySelector('#feed .f-narr.pending'));
  assert.equal(await page.evaluate(() => Game.Pipeline.acceptsQueue), false, 'no queue before the narration is in');
  assert.equal(await page.evaluate(() => Game.Pipeline.abort()), true);
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 3000 });
  assert.equal(await lastNotice(page), 'Stopped. Your action was kept in the box.');
  assert.equal(await page.inputValue('#cmd'), 'I ask about the boats');
  assert.equal(await stateJson(page), before);
  assert.equal(await page.evaluate(() => Game.Pipeline.abort()), false, 'nothing to stop');
  await page.fill('#cmd', '');
  // The queue: the bookkeeper takes a while; a line sent meanwhile waits, a second one is refused.
  queue('bookkeeper', () => Object.assign(bookReply()(), { delay: 1200 }));
  const turn0 = await page.evaluate(() => Game.state.meta.turn);
  await page.evaluate(() => { window.__first = Game.Pipeline.submit('I ask the ferryman about the fare'); });
  await page.waitForFunction(() => Game.Pipeline.acceptsQueue);
  const q = await page.evaluate(async () => [await Game.Pipeline.submit('I nod to the ferryman'), await Game.Pipeline.submit('I wave'), Game.Pipeline.queued]);
  assert.deepEqual(q[0], { ok: true, queued: true });
  assert.equal(q[1].reason, 'busy');
  assert.equal(q[2], 'I nod to the ferryman');
  await page.waitForFunction(t => !Game.Pipeline.busy && Game.state.meta.turn === t + 2, turn0, { timeout: 8000 });
  assert.deepEqual(await page.evaluate(() => Game.state.log.slice(-2).map(e => e.input)), ['I ask the ferryman about the fare', 'I nod to the ferryman']);
  assert.equal(reqs.filter(r => r.role === 'parser').pop().body.messages[0].content.split('\n')[0], 'PLAYER INPUT: I nod to the ferryman');
});

s.test('Stop in mock mode: a slow mock narration is cut off at once, and /undo, loads and edits still wait while a turn runs', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const before = await stateJson(page);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 5000 }));
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  const mid = await page.evaluate(async () => ({ undo: await Game.Pipeline.submit('/undo'), load: Game.App.loadSlot(1), queue: Game.Pipeline.acceptsQueue }));
  assert.equal(mid.undo.reason, 'busy');
  assert.equal(mid.load, false);
  assert.equal(mid.queue, false);
  const t0 = Date.now();
  await page.evaluate(() => Game.Pipeline.abort());
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 2000 });
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(await stateJson(page), before);
  assert.equal(await page.inputValue('#cmd'), 'I look around');
});

// ----- D. turn correctness -----

s.test('E1: a failed search makes nothing (NOT PRESENT, the bookkeeper told), a successful one makes the thing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const items = () => page.evaluate(() => (Game.State.loc(Game.state.player.locationId).items || []).map(i => i.name.toLowerCase()));
  const parse = { actionType: 'search', summary: 'Searches for a flashlight', targets: ['new:flashlight'], needsRoll: true, stat: 'wits', difficulty: 'normal', timeCost: 'short' };
  await page.evaluate(p => { Game.Api.Mock.queue('parse', p); Game.Pipeline.forceNextRoll(2); }, parse);
  await sendText(page, 'I search the place for a flashlight');
  assert.ok(!(await items()).some(n => n.includes('flashlight')), 'nothing made');
  const packet = (await narrPackets(page)).pop();
  assert.match(packet, /\nNOT PRESENT: flashlight \(/);
  assert.doesNotMatch(packet, /NEW IN THE SCENE/);
  assert.match(await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'bookkeep').pop().text), /\nNOT FOUND \(the roll failed; it does not exist, record nothing about it\): flashlight/);
  await page.evaluate(p => { Game.Api.Mock.queue('parse', Object.assign({}, p, { summary: 'Searches again, more carefully' })); Game.Pipeline.forceNextRoll(17); Game.State.apply({ lastRollKey: null }); }, parse);
  await sendText(page, 'I search the place for a flashlight again, carefully');
  assert.ok((await items()).some(n => n.includes('flashlight')), 'found and made');
  assert.match((await narrPackets(page)).pop(), /\nNEW IN THE SCENE: Flashlight \(here\)/);
});

s.test('E5: /wait and /skip land at the start of the phase they name', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => { Game.State.apply({ advanceTime: 'short' }); Game.State.apply({ advanceTime: 'short' }); });
  assert.equal(await page.evaluate(() => Game.state.time.shorts), 2);
  await sendText(page, '/wait evening');
  assert.deepEqual(await page.evaluate(() => [Game.state.time.phase, Game.state.time.shorts]), ['evening', 0]);
  await page.evaluate(() => Game.State.apply({ advanceTime: 'short' }));
  await sendText(page, '/skip to night');
  assert.deepEqual(await page.evaluate(() => [Game.state.time.phase, Game.state.time.shorts]), ['night', 0]);
});

s.test('E7: /look with a due event runs the bookkeeper, so what it did is recorded; /look without one does not', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await sendText(page, '/look');
  assert.deepEqual(await page.evaluate(() => Game.Api.Mock.calls.map(c => c.method)), ['narrate'], 'no due event: narrator only');
  await page.evaluate(() => {
    Game.Api.Mock.clear();
    const sd = Game.state.seeds.find(x => !x.fired && x.trigger && x.trigger.type === 'day');
    Game.State.apply({ dueAdd: [{ seedId: sd.id, text: 'A man drops an envelope at your feet and walks off.' }] });
    Game.Api.Mock.queue('bookkeep', { itemsGained: ['Envelope'] });
  });
  await sendText(page, '/look');
  const r = await page.evaluate(() => ({ calls: Game.Api.Mock.calls.map(c => c.method), inv: Game.state.player.inventory.map(i => i.name), due: Game.state.dueEvents.length }));
  assert.deepEqual(r.calls, ['narrate', 'bookkeep']);
  assert.ok(r.inv.includes('Envelope'), r.inv.join(', '));
  assert.equal(r.due, 0, 'consumed');
});

s.test('E8: people who come or go while a turn\'s time passes are kept for the next narration, not cleared in the same turn', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const spot = await page.evaluate(() => {
    const G = Game;
    const P = ['morning', 'afternoon', 'evening'];
    for (const l of G.state.locations) {
      if (l.closed || !l.discovered || l.away) continue;
      for (let i = 0; i < P.length; i++) {
        const a = G.State.npcsAt(l.id, P[i]).map(n => n.id);
        const b = G.State.npcsAt(l.id, ['afternoon', 'evening', 'night'][i]).map(n => n.id);
        if (a.join() !== b.join()) return { loc: l.id, phase: P[i] };
      }
    }
    return null;
  });
  assert.ok(spot);
  await place(page, spot.loc, spot.phase);
  await page.evaluate(() => { Game.State.apply({ advanceTime: 'short' }); Game.State.apply({ advanceTime: 'short' }); Game.Api.Mock.queue('parse', { actionType: 'look', summary: 'Waits by the door', targets: [], needsRoll: false, timeCost: 'short' }); });
  await sendText(page, 'I wait by the door a while');
  const ps = await page.evaluate(() => Game.state.pendingScene || null);
  assert.ok(ps && (ps.arrived.length || ps.left.length), 'the comings and goings are still there to narrate');
  await sendText(page, 'I look up');
  assert.match((await narrPackets(page)).pop(), /\nSINCE THE LAST TURN \(time moved on to /);
  assert.equal(await page.evaluate(() => Game.state.pendingScene || null), null, 'cleared once narrated');
});

s.test('E14: a defeat takes one long (cause defeat) and not the action\'s own time on top', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const sc = await findScene(page, { min: 1, watchy: false, maxAtt: 20 });
  await place(page, sc.loc.id, 'morning');
  await page.evaluate(() => {
    window.__adv = [];
    const orig = Game.State.apply;
    Game.State.apply = function (diff, opts) { if (diff && diff.advanceTime !== undefined) window.__adv.push(diff.advanceTime); return orig.call(this, diff, opts); };
    const here = Game.State.npcsAt(Game.state.player.locationId);
    Game.State.apply({ effects: here.filter(n => n.attitude !== 0).map(n => ({ op: 'attitudeDelta', npcId: n.id, delta: -n.attitude })) });
    Game.State.apply({ hpDelta: 1 - Game.state.player.hp });
  });
  const t0 = await page.evaluate(() => ({ phase: Game.state.time.phase, shorts: Game.state.time.shorts, day: Game.state.time.day }));
  await page.evaluate(id => { Game.Api.Mock.queue('parse', { actionType: 'attack', summary: 'Swings at them', targets: [id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'short' }); Game.Pipeline.forceNextRoll(1); }, sc.npcs[0].id);
  await sendText(page, `I attack ${sc.npcs[0].name}`);
  const r = await page.evaluate(() => ({ phase: Game.state.time.phase, shorts: Game.state.time.shorts, adv: window.__adv, defeat: Game.state.player.lastDefeat, rules: Game.State.RULES_VERSION }));
  assert.ok(r.defeat, 'defeated');
  assert.equal(r.phase, PHASES[PHASES.indexOf(t0.phase) + 1]);
  assert.equal(r.shorts, t0.shorts, 'no short on top of the long');
  // The object form goes to an engine at rules version 8; before that, the word.
  assert.deepEqual(r.adv[0], r.rules >= 8 ? { cost: 'long', cause: 'defeat' } : 'long');
  assert.equal(r.adv.length, 1, JSON.stringify(r.adv));
});

s.test('E15: /cheat success says "Cheat: success"; /reroll says "Rerolled."', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, 'I try to pick the lock on the back door');
  await sendText(page, '/cheat success');
  let q = await quiets(page);
  assert.ok(q.includes('Cheat: success'), q.join(' | '));
  assert.ok(!q.includes('Rerolled.'));
  await sendText(page, '/cheat 7');
  assert.ok((await quiets(page)).includes('Cheat: 7'));
  await sendText(page, '/reroll');
  q = await quiets(page);
  assert.ok(q.includes('Rerolled.'));
});

s.test('a home not found yet: walking there by name says to ask around and spends nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const home = await page.evaluate(() => { const l = Game.state.locations.find(x => x.discovered === false && !x.away); return { id: l.id, name: l.name }; });
  const before = await stateJson(page);
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'move', summary: 'Walks over there', targets: [id], destinationId: id, needsRoll: false, timeCost: 'short' }), home.id);
  await page.fill('#cmd', `I walk to ${home.name}`);
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  assert.equal(await lastNotice(page), "You don't know where that is yet. Ask around.");
  assert.equal(await stateJson(page), before, 'no turn spent');
  // A walk and an action there, to the same place: the same.
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Goes there and knocks', targets: [], destinationId: id, needsRoll: false, timeCost: 'short' }), home.id);
  await sendText(page, 'I go knock on their door');
  assert.equal(await stateJson(page), before);
});

s.test('a new morning shows the unseen town news once ("Overnight in town"); an ending in the news is narrated as its own turn (MODE epilogue), then "This is one ending"', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  await page.evaluate(() => { const s = Game.state; if (!Array.isArray(s.news)) s.news = []; s.news.push({ day: 1, phase: 'evening', text: 'The council voted to close the old bridge.', factionId: null, public: true, seen: false }, { day: 1, phase: 'evening', text: 'A private matter.', factionId: null, public: false, seen: false }); });
  await sendText(page, '/rest');
  const q = await quiets(page);
  assert.ok(q.includes('Overnight in town: The council voted to close the old bridge.'), q.join(' | '));
  assert.equal(await page.evaluate(() => Game.state.news[0].seen), true);
  assert.equal(await page.evaluate(() => Game.state.news[1].seen), false, 'not public: not told');
  // /rest also shows the recap.
  assert.match(await lastNotice(page), /^Day 2.*\nHere: /s);
  // An ending.
  await page.evaluate(() => Game.state.news.push({ day: 2, phase: 'morning', text: 'Royce Pittman casts the deciding vote, and the new bridge goes downstream.', public: true, seen: false, epilogue: true }));
  const turn0 = await page.evaluate(() => Game.state.meta.turn);
  await sendText(page, '/wait afternoon');
  await page.waitForFunction(t => !Game.Pipeline.busy && Game.state.meta.turn === t + 2, turn0);
  const r = await page.evaluate(() => ({ log: Game.state.log.slice(-1)[0], calls: Game.Api.Mock.calls.filter(c => c.method === 'narrate').map(c => c.text) }));
  const packet = r.calls.pop();
  assert.match(packet, /\nDUE EVENT: Royce Pittman casts the deciding vote/);
  assert.match(packet, /\nMODE: epilogue \(ZOOM length allowed\)/);
  assert.equal(r.log.input, '');
  assert.equal((await quiets(page)).pop(), 'This is one ending. You can keep playing.');
  assert.equal(await page.evaluate(() => Game.state.news.find(n => n.epilogue).seen), true, 'told once');
});

s.test('the chronicle waits for 16 log entries and keeps the newest 6, after the turn is saved', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  for (let i = 0; i < 14; i++) await sendText(page, i % 2 ? 'I look around' : 'I nod');
  assert.deepEqual(await page.evaluate(() => [Game.state.chronicle.length, Game.state.log.length]), [0, 15]);
  await page.evaluate(() => { window.__stages = []; Game.Pipeline.setStatusListener(e => window.__stages.push(e.stage)); });
  await sendText(page, 'I look around');
  const r = await page.evaluate(() => ({ chron: Game.state.chronicle.map(c => [c.fromTurn, c.toTurn]), log: Game.state.log.map(e => e.turn), stages: window.__stages }));
  assert.deepEqual(r.chron, [[0, 9]]);
  assert.deepEqual(r.log, [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(r.stages.slice(-2), ['chronicle', 'idle']);
});

s.test('/recap: where and when, who is here, open threads, what is owed with a countdown, who is warm or cold and why, rumours heard and the news; no API call', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const setup = await page.evaluate(() => {
    const G = Game;
    const s = G.state;
    const [w, c] = s.npcs.filter(n => G.presenceOf(n) === 'here' && n.alive !== false && !n.knownToPlayer).slice(0, 2);
    G.State.apply({ npcKnownToPlayer: [w.id, c.id], effects: [{ op: 'attitudeDelta', npcId: w.id, delta: 40 - w.attitude }, { op: 'attitudeDelta', npcId: c.id, delta: -40 - c.attitude }], newMemories: [{ npcId: w.id, text: 'bought me a beer', weight: 2 }, { npcId: c.id, text: 'called me a liar', weight: 2 }] });
    const t = s.threads.find(x => x.status === 'open');
    G.State.apply({ threadUpdates: [{ threadId: t.id, knownToPlayer: true }] });
    const r = s.rumours[0];
    G.State.apply({ rumoursHeard: [r.id] });
    s.player.obligations = (s.player.obligations || []).concat([{ id: 'obl_debt_x', kind: 'debt', npcId: c.id, text: 'the money', amount: 400, dueDay: 3, status: 'open' }]);
    if (!Array.isArray(s.news)) s.news = [];
    s.news.push({ day: 1, phase: 'morning', text: 'The bait shop flooded.', public: true, seen: true });
    return { w: w.name, c: c.name, thread: t.title, rumour: r.text };
  });
  await sendText(page, '/recap');
  const text = await lastNotice(page);
  const lines = text.split('\n');
  assert.match(lines[0], /^Day 1( \([^)]*\))?, morning, at /);
  assert.match(lines[1], /^Here: /);
  assert.ok(text.includes(`Open: ${setup.thread}`), text);
  assert.ok(text.includes(`Owed: You owe ${setup.c} $400 · due Day 3 (2 days)`), text);
  // Wave 2 (the coordinator's wording): the attitude word, then one reason read plainly (never the raw memory in quotes).
  assert.match(text, new RegExp(`\nWarm to you: (.+, )?${setup.w} \\(warm, remembers you bought (him|her|them) a beer\\)[,.]`));
  assert.match(text, new RegExp(`\nCold to you: (.+, )?${setup.c} \\(cold, remembers you called (him|her|them) a liar\\)[,.]`));
  assert.ok(!/Loose end with/.test(text), 'a loose end reads as one, not as the raw memory');
  assert.ok(text.includes(`Heard: "${setup.rumour.slice(0, 40)}`), text);
  assert.ok(text.includes('In town: Day 1: The bait shop flooded.'), text);
  assert.deepEqual(await page.evaluate(() => Game.Api.Mock.calls.length), 0, 'no API call');
  assert.equal(await page.evaluate(() => Game.Pipeline.recapText()), text);
  assert.equal(await page.evaluate(() => getComputedStyle([...document.querySelectorAll('#feed .f-notice')].pop()).whiteSpace), 'pre-line');
});

s.test('feed lines when an attitude crosses a band, both ways', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const sc = await findScene(page, { min: 1, minAtt: -20, maxAtt: 20 });
  await place(page, sc.loc.id, sc.phase);
  const n = sc.npcs[0];
  await page.evaluate(id => { Game.State.apply({ npcKnownToPlayer: [id] }); Game.Api.Mock.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 25, reason: 'kind words' }] }); }, n.id);
  await page.evaluate(id => Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: 10 - Game.State.npc(id).attitude }] }), n.id);
  await sendText(page, `I thank ${n.name}`);
  assert.ok((await quiets(page)).includes(`${n.name} warms to you.`), (await quiets(page)).join(' | '));
  await page.evaluate(id => { Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: -10 - Game.State.npc(id).attitude }] }); Game.Api.Mock.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: -25, reason: 'insulted' }] }); }, n.id);
  await sendText(page, `I insult ${n.name}`);
  assert.ok((await quiets(page)).includes(`${n.name} won't forget that.`));
});

// ----- E. fights, secrets, the bookkeeper's context -----

s.test('fights: the threat sets the difficulty, a partial costs 1 HP, a swing at someone still here is never locked, the third hit knocks them down, police mean an arrest; the bookkeeper gets present, rollSuccess and attacked', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const sc = await findScene(page, { min: 1, watchy: false, maxAtt: 30 });
  await place(page, sc.loc.id, sc.phase);
  const id = sc.npcs[0].id;
  await page.evaluate(() => {
    window.__kd = []; window.__arrest = []; window.__applyOpts = [];
    Game.Dice.threat = () => 'hard';
    Game.World.knockDown = (npcId) => { window.__kd.push(npcId); };
    Game.World.arrestPlayer = o => { window.__arrest.push(o); };
    const orig = Game.State.apply;
    Game.State.apply = function (diff, opts) { if (opts && opts.source === 'model') window.__applyOpts.push(opts); return orig.call(this, diff, opts); };
    Game.State.apply({ hpDelta: 10 });
  });
  // A number forces that die; a tier word gets the die for that outcome (the cheat's own probe).
  const attack = d20 => page.evaluate(([id, d]) => { Game.Api.Mock.queue('parse', { actionType: 'attack', summary: 'Punches them', targets: [id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' }); if (typeof d === 'number') Game.Pipeline.forceNextRoll(d); else Game.Pipeline.hooks.nextTier = d; }, [id, d20]);
  // A miss, then the same swing again: not locked.
  await attack(2);
  await sendText(page, 'I punch them');
  const t1 = await page.evaluate(() => Game.Pipeline.lastTurn);
  assert.equal(t1.roll.target, 15, 'Dice.threat: hard');
  await attack(17);
  await sendText(page, 'I punch them again');
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.roll.tier), 'success', 'not locked');
  assert.deepEqual(await page.evaluate(() => Game.state.fight && [Game.state.fight.npcId, Game.state.fight.hits]), [id, 1]);
  // A partial costs 1 HP (and counts as a hit).
  const hp = await page.evaluate(() => Game.state.player.hp);
  await attack('partial');
  await sendText(page, 'I punch them once more');
  const p = await page.evaluate(() => ({ tier: Game.Pipeline.lastTurn.roll.tier, hp: Game.state.player.hp, hits: Game.state.fight && Game.state.fight.hits }));
  assert.equal(p.tier, 'partial');
  assert.equal(p.hp, hp - 1, 'a partial costs 1 HP');
  assert.equal(p.hits, 2, 'and lands');
  assert.deepEqual(await page.evaluate(() => window.__kd), [], 'two hits: still standing');
  await attack(18);
  await sendText(page, 'I punch them hard');
  const r = await page.evaluate(() => ({ kd: window.__kd, fight: Game.state.fight || null, opts: window.__applyOpts.slice(-1)[0], arrest: window.__arrest }));
  assert.deepEqual(r.kd, [id], 'the third hit puts them down');
  assert.equal(r.fight, null);
  assert.deepEqual(r.arrest, [], 'no police, no arrest');
  assert.deepEqual([r.opts.source, r.opts.rollSuccess, r.opts.attacked, r.opts.present.includes(id)], ['model', true, id, true]);
  // With a police officer here: the attack ends in the cell after the narration.
  const cop = await page.evaluate(() => { const n = Game.state.npcs.find(x => (x.tags || []).includes('police') && x.status === 'free' && x.alive !== false); Game.State.apply({ visits: [{ npcId: n.id, locationId: Game.state.player.locationId }] }); return n.id; });
  await attack(18);
  await sendText(page, 'I punch them in front of the law');
  assert.deepEqual(await page.evaluate(() => window.__arrest.map(a => a.npcId)), [cop]);
});

s.test('a successful social roll aimed at someone, or their attitude at 50 or more, lets the narrator hear their secret (ctx.revealSecretFor)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const sc = await findScene(page, { min: 1, maxAtt: 20 });
  await place(page, sc.loc.id, sc.phase);
  const id = sc.npcs[0].id;
  const ask = d => page.evaluate(([id, d]) => { Game.Api.Mock.queue('parse', { actionType: 'persuade', summary: 'Asks for help', targets: [id], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' }); Game.Pipeline.forceNextRoll(d); Game.State.apply({ lastRollKey: null }); }, [id, d]);
  await ask(2);
  await sendText(page, 'I ask for help');
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.ctx.revealSecretFor || null), null);
  await ask(19);
  await sendText(page, 'I ask nicely for help');
  assert.deepEqual(await page.evaluate(() => Game.Pipeline.lastTurn.ctx.revealSecretFor), [id]);
  await page.evaluate(id => { Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: 60 - Game.State.npc(id).attitude }] }); Game.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Chats', targets: [id], needsRoll: false, timeCost: 'instant' }); }, id);
  await sendText(page, 'I chat with them');
  assert.deepEqual(await page.evaluate(() => Game.Pipeline.lastTurn.ctx.revealSecretFor), [id]);
});

// ----- F. the card game -----

// Changed by design in wave 10: five-card draw at a table the player plays (tests/wave10-cards.test.cjs); the showdown decides, not the roll.
s.test('the card game at the Low Water with its dealer: the stake from the words, the showdown decides (a /cheat cards hand wins), a fold costs half, the marked deck\'s one roll gets +2 and a fumble is caught cheating (memory, ban, news); the bookkeeper records no gold', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { bgIndex: await page.evaluate(() => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => /deck/i.test(i.name)))) });
  await fast(page);
  const spot = await page.evaluate(() => {
    const G = Game;
    const l = G.state.locations.find(x => G.Pipeline.cardGameAt(x));
    for (const ph of ['evening', 'night', 'afternoon', 'morning']) {
      const d = G.Pipeline.dealerOf(G.State.npcsAt(l.id, ph).map(n => n.id));
      if (d) return { loc: l.id, phase: ph, dealer: d.id, dealerName: d.name };
    }
    return { loc: l.id, phase: null };
  });
  assert.ok(spot.phase, 'the dealer sits at the game some phase');
  await place(page, spot.loc, spot.phase);
  // choice: how the player plays the hand (Pipeline.hooks.cardsPlay); d20: the marked deck's roll.
  const play = async (choice, d20, words) => {
    const g0 = await page.evaluate(() => Game.state.player.gold);
    await page.evaluate(([c, d]) => { Game.Api.Mock.queue('parse', { actionType: 'gamble', summary: 'Sits in on the card game', targets: [], needsRoll: true, stat: 'wits', difficulty: 'normal', timeCost: 'short' }); Game.Api.Mock.queue('bookkeep', { goldDelta: 999 }); Game.Pipeline.forceNextRoll(d); Game.State.apply({ cardGame: 'draw' }); Game.Pipeline.hooks.cardsSeats = []; Game.Pipeline.hooks.cardsPlay = c; }, [choice, d20]); // wave 13: five-card draw remembered, heads up
    await sendText(page, words);
    return page.evaluate(g0 => ({ delta: Game.state.player.gold - g0, roll: Game.Pipeline.lastTurn.roll, ctx: Game.Pipeline.lastTurn.ctx.gamble, cards: Game.Pipeline.lastTurn.ctx.cards, packet: Game.Pipeline.lastTurn.packet, book: Game.Api.Mock.calls.filter(c => c.method === 'bookkeep').pop().text }), g0);
  };
  const first = await play({ hold: 'all' }, 15, 'I sit in on the card game for $50');
  assert.equal(first.ctx.stake, 50);
  assert.equal(first.delta, { win: 50, lose: -50, split: 0 }[first.cards.result], 'the showdown decides');
  assert.ok(first.roll.modifiers.some(m => /deck/i.test(m.label) && m.value === 2), 'the deck gives +2');
  assert.match(first.packet, /\nOUTCOME: the card game \(the player put up \$50\): five-card draw, heads up with [^;]+; the player's .* at the showdown: /); // wave 13: the game and the table
  assert.match(first.book, /\nCARD GAME \(already applied by the engine; do not record again\): the player (wins \$50|loses \$50|breaks even \(a split pot\)) at cards/);
  assert.ok(await page.evaluate(() => Game.State.debugLog.some(d => d.path === 'goldDelta' && /card game/.test(d.reason))), 'the bookkeeper\'s gold ignored');
  await page.evaluate(() => { Game.State.apply({ cardsCheat: true }); }); // wave 11: /cheat cards is armed in the game (flags.cardsCheat)
  const win = await play({ hold: [] }, 10, 'I play another hand, 40 bucks');
  assert.deepEqual([win.delta, win.cards.result, win.roll], [40, 'win', null], 'a stacked hand wins, with no catch roll');
  assert.match(win.book, /\nCARD GAME \(already applied by the engine; do not record again\): the player wins \$40 at cards/);
  const fold = await play({ fold: true }, 10, 'I play again');
  assert.equal(fold.delta, -10, 'half the default $20 stake');
  const fumble = await play({ hold: 'all' }, 1, 'I play one more for $30');
  assert.equal(fumble.delta, -30);
  assert.equal(fumble.ctx.caught, true);
  assert.match(fumble.packet, /catches them cheating with the marked deck; the hand is void \(cash now \$\d+\)\..* throws the player out of /);
  const after = await page.evaluate(d => ({ mem: Game.State.npc(d).memories.slice(-1)[0], here: Game.state.player.locationId }), spot.dealer);
  assert.equal(after.mem.weight, 3);
  assert.match(after.mem.text, /cheating at cards/);
  assert.notEqual(after.here, spot.loc, 'thrown out');
  // No dealer here: no game, no money moves.
  await place(page, spot.loc, null);
  const none = await page.evaluate(() => {
    const G = Game;
    const l = G.state.locations.find(x => !G.Pipeline.cardGameAt(x) && x.discovered && !x.closed && !x.away);
    G.State.apply({ playerLocationId: l.id });
    return l.id;
  });
  const nogame = await play(null, 18, 'I deal a hand of cards for $50');
  assert.equal(nogame.delta, 0);
  assert.match(nogame.packet, /\nCARD GAME: no game: there is no card game here\./);
  assert.ok(none);
});

// ----- H. Upgrade -----

s.test('Upgrade: each step is stamped as it completes; a failure at a later step keeps the earlier ones; a re-read never cuts short memories; a newer save is not updated', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const LONG = 'said the bridge vote was rigged and that the county man paid off half the council in cash';
  await page.evaluate(L => {
    const st = Game.state;
    delete st.meta.rulesVersion;
    const n = st.npcs.find(x => !x.memories.length);
    n.memories = [{ turn: 0, weight: 2, text: L }];
    Game.Api.Mock.queue('revealPlaces', { error: { type: 'overloaded_error' } });
  }, LONG);
  const r = await page.evaluate(() => Game.Pipeline.updateGame());
  assert.deepEqual([r.ok, r.reason, r.kept], [false, 'error', [2]]);
  const st = await page.evaluate(() => ({ v: Game.state.meta.rulesVersion, mem: Game.state.npcs.find(n => n.memories.length && n.memories[0].turn === 0).memories[0].text, depth: Game.State.undoDepth() }));
  assert.equal(st.v, 2, 'version 2 kept and stamped');
  assert.notEqual(st.mem.split(' ').length, 18, 'its rewrite kept');
  assert.match(await lastNotice(page), /overloaded.*The step "Places people told you about" changed nothing\. The step before it \(Memories that matter\) was kept:/s);
  assert.equal(st.depth, 1, 'the update is still one /undo step');
  // Again: it goes on from version 3.
  const r2 = await page.evaluate(() => Game.Pipeline.updateGame());
  assert.equal(r2.ok, true);
  assert.equal(r2.from, 2);
  assert.ok(!r2.summaries.some(x => x.version === 2));
  // A re-read never cuts memories that already follow the rules.
  const keep = await page.evaluate(() => {
    const st = Game.state;
    const n = st.npcs.find(x => !x.memories.length);
    for (let i = 0; i < 10; i++) Game.State.apply({ newMemories: [{ npcId: n.id, text: `did a small thing ${i}`, weight: 2 }] });
    return { id: n.id, per: Game.Upgrade.PER_PERSON, max: Game.State.MEMORY_MAX, cand: Game.Upgrade.candidates(st).some(x => x.id === n.id), len: Game.State.npc(n.id).memories.length };
  });
  assert.equal(keep.per, keep.max);
  assert.equal(keep.cand, false, 'short lines are not sent to be rewritten');
  await page.evaluate(() => Game.Pipeline.updateGame());
  assert.equal(await page.evaluate(id => Game.State.npc(id).memories.length, keep.id), keep.len);
  // A save from a newer build.
  await page.evaluate(() => { Game.state.meta.rulesVersion = Game.State.RULES_VERSION + 1; });
  const r3 = await page.evaluate(() => Game.Pipeline.updateGame());
  assert.deepEqual([r3.ok, r3.reason], [false, 'newer']);
  assert.match(await lastNotice(page), /saved by a newer version of the game/);
  assert.deepEqual(await page.evaluate(() => Game.Upgrade.pending(Game.state)), []);
});

s.test('Upgrade version 8 ("An arc"): the town copy gains what it lacks (never overwriting), the arc\'s lists are filled, an unfired loose end gets its obligation, a fired one none, and an unfired grudge its template\'s effects', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const G = Game;
    const T = G.data.TOWN_DATA;
    const st = G.state;
    const town = G.State.town;
    // What this build's content would carry (set here so the test holds before and after the content lands).
    if (T.calendar === undefined) T.calendar = { season: 'autumn', startDate: '2026-10-08' };
    if (T.events === undefined) T.events = [{ id: 'evt_test', day: 6, phase: 'evening', locationId: 'loc_town_hall', title: 'Council', branches: [], default: { text: 'The council meets.', effects: [] } }];
    if (T.epilogue === undefined) T.epilogue = { onDay: 21, orFlagsSet: [], branches: [], default: { text: 'The end.', effects: [] } };
    const r0 = T.rumours[0];
    if (r0.threadId === undefined) r0.threadId = T.threads[0].id;
    if (T.threads[0].reward === undefined) T.threads[0].reward = 'charm';
    const le = st.player.looseEnds.find(x => x.kind === 'debt');
    const def = G.data.LOOSE_ENDS.debt;
    if (!def.obligation && !def.options.some(o => o && o.obligation)) def.obligation = { kind: 'debt', amount: 400, dueOffset: 3, text: 'the money', onMiss: [], onMet: [] };
    const tpl = G.data.GRUDGE_TEMPLATES[0];
    if (!Array.isArray(tpl.effects)) tpl.effects = [{ op: 'playerHp', delta: -3 }];
    // An older save: the town copy without the arc, one edited by the player, no lists.
    for (const k of ['calendar', 'events']) delete town[k];
    town.epilogue = { mine: true };
    for (const x of town.rumours || []) delete x.threadId;
    for (const x of st.rumours) delete x.threadId;
    for (const x of st.threads) delete x.reward;
    for (const k of ['news', 'bans', 'eventsFired']) delete st[k];
    delete st.player.obligations;
    delete st.time.instants;
    const leSeed = st.seeds.find(x => x.id === le.seedId);
    delete leSeed.effects;
    leSeed.fired = false;
    const other = st.player.looseEnds.find(x => x.kind !== 'debt');
    const firedSeed = st.seeds.find(x => x.id === other.seedId);
    firedSeed.fired = true;
    delete firedSeed.effects;
    const n = st.npcs.find(x => x.alive !== false && x.status === 'free');
    st.seeds.push({ id: 'seed_grudge_test', cause: 'Grudge', effect: G.data.GRUDGE_TEMPLATES[0].effect.replace(/\{npc\}/g, n.name).replace(/\{player\}/g, st.player.name), trigger: { type: 'day', value: 4 }, fired: false, hidden: true, origin: { kind: 'grudge', npcId: n.id, template: 0 } });
    const v8 = G.Upgrade.MIGRATIONS.find(m => m.version === 8);
    const res = await v8.run(st, G.Api);
    return {
      res, town: { calendar: town.calendar, events: (town.events || []).length, epilogue: town.epilogue, rumour: (town.rumours || [])[0] && town.rumours[0].threadId },
      rumour: st.rumours.find(x => x.id === r0.id).threadId, reward: st.threads.find(x => x.id === T.threads[0].id).reward,
      lists: [st.news, st.bans, st.eventsFired, st.player.obligations, st.time.instants],
      le: leSeed.effects, dueDay: (leSeed.trigger.value | 0) + 3, fired: firedSeed.effects || null,
      grudge: st.seeds.find(x => x.id === 'seed_grudge_test').effects, r0: r0.threadId, title: v8.title, known: G.Upgrade.known().map(m => m.version), rules: G.State.RULES_VERSION
    };
  });
  assert.equal(r.title, 'An arc');
  assert.deepEqual(r.town.calendar, { season: 'autumn', startDate: '2026-10-08' });
  assert.ok(r.town.events >= 1);
  assert.deepEqual(r.town.epilogue, { mine: true }, 'never overwrites what the game has');
  assert.equal(r.rumour, r.r0);
  assert.ok(r.reward);
  // time.instants is kept only while above 0 (State advanceTime), so the step leaves it unset.
  assert.deepEqual(r.lists, [[], [], [], [], undefined]);
  assert.equal(r.le.length, 1);
  assert.equal(r.le[0].op, 'addObligation');
  assert.equal(r.le[0].dueDay, r.dueDay);
  assert.equal(r.fired, null, 'a loose end that already fired gets none');
  assert.ok(Array.isArray(r.grudge) && r.grudge.length >= 1);
  assert.match(r.res.text, /loose end still to come now carries an obligation/);
  // The step runs only once the engine is at version 8.
  assert.equal(r.known.includes(8), r.rules >= 8);
});

s.run();
