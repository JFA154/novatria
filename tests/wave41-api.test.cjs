'use strict';
/* Wave 41: the API layer's resilience. retry-after honoured up to 60 s
   with a countdown in the status line and Stop ending the wait; two
   retries for an overloaded API; a 404 for a retired model names a current
   one of its family (GET /v1/models); a model with no price says its cost
   is not counted; a malformed SSE data line is logged and one that lost
   part of the reply makes the stream retry; the debug log is capped for
   every module (State.pushDebug); capStack is linear and cuts the same
   entries; the parser's and the bookkeeper's system prompts are cached and
   their cache reads counted. Canned replies for https://api.anthropic.com
   are routed inside the browser (as in tests/transport-fixes.test.cjs);
   nothing leaves the machine.
   Run with: node tests/run.cjs wave41 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, stateJson, sendText, fixtures, LAPTOP } = require('./helpers.cjs');

const s = suite('wave41-api');
const API = 'https://api.anthropic.com/v1/messages';
const MODELS = 'https://api.anthropic.com/v1/models';
const KEY = 'sk-ant-test-0123456789';

function roleOf(body) {
  if (body.stream) return 'narrator';
  if (body.max_tokens === 1) return 'prewarm';
  const sc = body.output_config && body.output_config.format && body.output_config.format.schema;
  if (sc && sc.properties && sc.properties.actionType) return 'parser';
  if (sc && sc.properties && sc.properties.socialEvents) return 'bookkeeper';
  return 'chronicle';
}
const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const PARSE = { actionType: 'talk', summary: 'Asks about the tide', targets: [], aboutIds: [], destinationId: null, moveWhen: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false, romantic: null };
const DIFF = { socialEvents: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], journalEntry: null };
const NARRATION = ['Rain needles the water. ', 'The old man spits into the river. ', '"Tide\'s wrong," he says.'];
function message(text, opts) {
  opts = opts || {};
  return {
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_details: null, usage: opts.usage || USAGE })
  };
}
const parseReply = (over, usage) => () => message(JSON.stringify(Object.assign({}, PARSE, over)), { usage });
const bookReply = (over, usage) => () => message(JSON.stringify(Object.assign({}, DIFF, over)), { usage });
/* An SSE body; opts.raw: extra raw blocks ("event: ...\ndata: ...") put in
   after the first text delta. */
function sse(parts, opts) {
  opts = opts || {};
  const u = { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const ev = [
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: u } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
  ];
  const blocks = ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}`);
  parts.forEach((p, i) => {
    blocks.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } })}`);
    if (i === 0 && opts.raw) blocks.push(...opts.raw);
  });
  for (const e of [{ type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } }, { type: 'message_stop' }]) blocks.push(`event: ${e.type}\ndata: ${JSON.stringify(e)}`);
  return { status: 200, contentType: 'text/event-stream', body: blocks.map(b => b + '\n\n').join('') };
}
const narrReply = (parts, opts) => () => sse(parts || NARRATION, opts);
const errorReply = (status, type, headers, msg) => () => ({ status, contentType: 'application/json', headers, body: JSON.stringify({ type: 'error', error: { type, message: msg || `${type} happened` } }) });
const DEFAULTS = { parser: parseReply(), narrator: narrReply(), bookkeeper: bookReply(), chronicle: () => message('They arrived and asked about the tide.'), prewarm: () => message('ready') };

/* The game with the route installed, then mock mode off and a key set.
   opts.models(route): the GET /v1/models reply (none: the request fails). */
async function openReal(h, opts) {
  opts = opts || {};
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  const models = [];
  const queues = { parser: [], narrator: [], bookkeeper: [], chronicle: [], prewarm: [] };
  await page.route(API, async route => {
    const req = route.request();
    const body = JSON.parse(req.postData());
    const role = roleOf(body);
    const n = reqs.filter(r => r.role === role).length + 1;
    reqs.push({ role, n, body, at: Date.now() });
    const make = queues[role].length ? queues[role].shift() : DEFAULTS[role];
    const out = make(body, n);
    return route.fulfill({
      status: out.status,
      headers: Object.assign({ 'content-type': out.contentType, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id, retry-after', 'request-id': `req_${role}_${n}` }, out.headers || {}),
      body: out.body
    }).catch(() => {});
  });
  if (opts.models) {
    await page.route(MODELS + '*', route => {
      const q = route.request();
      models.push({ method: q.method(), key: q.headers()['x-api-key'], version: q.headers()['anthropic-version'], browser: q.headers()['anthropic-dangerous-direct-browser-access'] });
      const out = opts.models();
      return route.fulfill({ status: out.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(out.body) });
    });
  }
  await quickStart(page, { bgIndex: (await fixtures(page)).docksBg });
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  return { page, reqs, models, queue: (role, ...fns) => queues[role].push(...fns) };
}
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.textContent : null; });
const apiDebug = page => page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'api').map(d => `${d.role} ${d.status || ''}: ${d.reason}`));
/* Submits text and samples the status line every 40 ms until the turn ends. */
async function watchTurn(page, text) {
  await page.fill('#cmd', text);
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.busy);
  const seen = [];
  for (const t0 = Date.now(); Date.now() - t0 < 30000;) {
    const r = await page.evaluate(() => ({ busy: Game.Pipeline.busy, text: Game.UI.status.text }));
    if (r.text && seen[seen.length - 1] !== r.text) seen.push(r.text);
    if (!r.busy) break;
    await page.waitForTimeout(40);
  }
  return seen;
}

s.test('a 429 asking for 30 s waits the 30 s (shortened for the test), the status line counts it down, then the turn goes through; Debug says the wait came from retry-after', async h => {
  const { page, reqs, queue } = await openReal(h);
  await page.evaluate(() => { Game.Api.RETRY.scale = 0.1; }); // 30 s of the API's are 3 s here
  queue('parser', errorReply(429, 'rate_limit_error', { 'retry-after': '30' }));
  const seen = await watchTurn(page, 'I ask the ferryman about the tide');
  const ps = reqs.filter(r => r.role === 'parser');
  assert.equal(ps.length, 2);
  const gap = ps[1].at - ps[0].at;
  assert.ok(gap >= 2900 && gap < 6000, 'waited 30 s at a tenth: ' + gap);
  const counts = seen.map(t => /^Busy; trying again in (\d+) s$/.exec(t)).filter(Boolean).map(m => +m[1]);
  assert.equal(counts[0], 30, seen.join(' | '));
  assert.ok(counts.length >= 5, 'it counts down: ' + counts.join(','));
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] < counts[i - 1], 'down only: ' + counts.join(','));
  assert.ok(counts[counts.length - 1] <= 3, counts.join(','));
  // After the wait the status line is back on the stage it showed, and the turn completed.
  const after = seen.slice(seen.findIndex(t => /^Busy; trying again in 1 s$|^Busy; trying again in [23] s$/.test(t)) + 1).filter(t => !/^Busy/.test(t));
  assert.ok(after.includes('Reading your action…') || after.includes('Writing…'), seen.join(' | '));
  assert.equal(await page.evaluate(() => Game.state.log.length), 2);
  const dbg = await apiDebug(page);
  assert.ok(dbg.some(d => d === 'parser 429: rate_limit_error: rate_limit_error happened; retry-after 30 s, trying again'), dbg.join(' | '));
  // No retry-after the page can read: the fixed wait, and Debug says so.
  queue('parser', errorReply(429, 'rate_limit_error'));
  await sendText(page, 'I ask about the boats');
  const dbg2 = await apiDebug(page);
  assert.ok(dbg2.some(d => d === 'parser 429: rate_limit_error: rate_limit_error happened; no retry-after header the page could read, so the fixed 1.5 s wait, trying again'), dbg2.join(' | '));
  // An HTTP date is read too, and a minute is the most.
  const ra = await page.evaluate(() => [Game.Api.retryAfterMs(new Date(Date.now() + 40000).toUTCString()), Game.Api.retryAfterMs('120'), Game.Api.RETRY_AFTER_MAX_MS]);
  assert.ok(ra[0] > 37000 && ra[0] <= 40000, String(ra[0]));
  assert.deepEqual(ra.slice(1), [60000, 60000]);
});

s.test('Stop during the wait cancels it at once: no second try, the words back in the box, nothing changed', async h => {
  const { page, reqs, queue } = await openReal(h);
  const before = await stateJson(page);
  queue('parser', errorReply(429, 'rate_limit_error', { 'retry-after': '30' }));
  await page.fill('#cmd', 'I ask the ferryman about the tide');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => /^Busy; trying again in \d+ s$/.test(Game.UI.status.text), null, { timeout: 10000 });
  assert.equal(await page.textContent('#send'), 'Stop');
  const t0 = Date.now();
  await page.click('#send');
  await page.waitForFunction(() => !Game.Pipeline.busy, null, { timeout: 5000 });
  assert.ok(Date.now() - t0 < 3000, 'stopped at once');
  await page.waitForTimeout(300);
  assert.equal(reqs.filter(r => r.role === 'parser').length, 1, 'no second try');
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the tide');
  assert.match(await lastNotice(page), /Stopped\. Your action was kept in the box\./);
  assert.equal(await stateJson(page), before);
  assert.ok(!/trying again/.test(await page.evaluate(() => Game.UI.status.text)), 'the countdown is gone');
});

s.test('an overloaded API (529) gets two retries: twice then 200 goes through, three times fails with the message; a 500 still gets one', async h => {
  const { page, reqs, queue } = await openReal(h);
  await page.evaluate(() => { Game.Api.RETRY.scale = 0.1; });
  queue('parser', errorReply(529, 'overloaded_error'), errorReply(529, 'overloaded_error'));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs.map(r => r.role), ['parser', 'parser', 'parser', 'narrator', 'bookkeeper']);
  assert.equal(await page.evaluate(() => Game.state.log.length), 2, 'the third try went through');
  // The second wait is twice the first (1.5 s, then 3 s, at a tenth), each with up to 0.4 s of jitter (a tenth too).
  const g1 = reqs[1].at - reqs[0].at;
  const g2 = reqs[2].at - reqs[1].at;
  assert.ok(g1 >= 140 && g1 < 1500 && g2 >= 290 && g2 < 2000, `${g1} ${g2}`);
  const before = await stateJson(page);
  let n = reqs.length;
  queue('parser', errorReply(529, 'overloaded_error'), errorReply(529, 'overloaded_error'), errorReply(529, 'overloaded_error'));
  await sendText(page, 'I ask about the boats');
  assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'parser', 'parser'], 'no fourth try');
  assert.match(await lastNotice(page), /The API is overloaded right now\. Try again in a moment\./);
  assert.equal(await page.inputValue('#cmd'), 'I ask about the boats');
  assert.equal(await stateJson(page), before);
  await page.fill('#cmd', '');
  n = reqs.length;
  queue('parser', errorReply(500, 'api_error'), errorReply(500, 'api_error'));
  await sendText(page, 'I ask about the boats');
  assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'parser'], '500: one retry');
  assert.match(await lastNotice(page), /internal error/);
});

s.test('a 404 that names a retired model asks GET /v1/models and names a current model of the same family; when the list fails the message stays', async h => {
  let listOk = true;
  const { page, reqs, models, queue } = await openReal(h, { models: () => (listOk ? { status: 200, body: { data: [{ type: 'model', id: 'claude-opus-5-5' }, { type: 'model', id: 'claude-sonnet-5-5' }, { type: 'model', id: 'claude-haiku-5-5' }], has_more: false } } : { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'down' } } }) });
  await page.evaluate(() => Game.Storage.saveSettings({ parserModel: 'claude-sonnet-4-5' }));
  const before = await stateJson(page);
  queue('parser', errorReply(404, 'not_found_error', null, 'model: claude-sonnet-4-5'));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(reqs.length, 1, 'no retry');
  assert.deepEqual(models, [{ method: 'GET', key: KEY, version: '2026-10-21', browser: 'true' }], 'the same call as Check key');
  assert.ok((await lastNotice(page)).startsWith('The API does not know the model claude-sonnet-4-5 (it may have been retired). Try claude-sonnet-5-5 in Settings. Your action was kept in the box.'), await lastNotice(page));
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the tide');
  assert.equal(await stateJson(page), before);
  const dbg = await apiDebug(page);
  assert.ok(dbg.includes('parser 404: not_found_error: model: claude-sonnet-4-5'), dbg.join(' | '));
  assert.ok(dbg.includes('parser 404: not_found_error: claude-sonnet-4-5 is not a model the API knows; GET /v1/models lists claude-sonnet-5-5 (the same family), named in the message'), dbg.join(' | '));
  // The list call fails: today's message.
  listOk = false;
  await page.fill('#cmd', '');
  queue('parser', errorReply(404, 'not_found_error', null, 'model: claude-sonnet-4-5'));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(models.length, 2);
  assert.ok((await lastNotice(page)).startsWith('The API does not know that model. Check the model names in Settings.'), await lastNotice(page));
  // A 404 that does not name the model asks nothing.
  await page.fill('#cmd', '');
  queue('parser', errorReply(404, 'not_found_error', null, 'Not found'));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(models.length, 2);
  assert.deepEqual(await page.evaluate(() => [Game.Api.modelFamily('claude-opus-4-1-20250805'), Game.Api.modelFamily('claude-haiku-5-5'), Game.Api.modelFamily('gpt-9')]), ['opus', 'haiku', null]);
});

s.test('a model with no price says so where the cost is shown: "no price known for <model>: cost not counted" in Settings and the Debug API block', async h => {
  const { page } = await openReal(h);
  assert.equal(await page.evaluate(() => Game.Api.priceNote()), '');
  await page.evaluate(() => Game.Storage.saveSettings({ parserModel: 'claude-mystery-9' }));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(await page.evaluate(() => Game.Api.priceNote()), 'no price known for claude-mystery-9: cost not counted');
  assert.match(await page.evaluate(() => Game.UI.sessionLine()), /^This session: \d+ turns? · \$\d+\.\d\d \(no price known for claude-mystery-9: cost not counted\)$/);
  await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  assert.match(dbg, /turn: 3 calls, in \d+, out \d+, cache read 0, cache write 0, no price known for claude-mystery-9: cost not counted/);
  assert.match(dbg, /session cost: \$\d+\.\d{4} \(no price known for claude-mystery-9: cost not counted\) over \d+ turns/);
});

s.test('a malformed SSE data line is logged with the role, the line cut to 200 characters and a count; one that lost a text_delta makes the stream retry; a stray non-JSON line does not', async h => {
  const { page, reqs, queue } = await openReal(h);
  const cut = 'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The quay ' + 'x'.repeat(400);
  queue('narrator', narrReply(['He shrugs. '], { raw: [cut] }), narrReply());
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(reqs.filter(r => r.role === 'narrator').length, 2, 'the stream counted as cut short and was asked for again');
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration), NARRATION.join(''));
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'api' && /^malformed SSE/.test(d.reason)));
  assert.equal(dbg.length, 1);
  assert.equal(dbg[0].role, 'narrator');
  const line = '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"The quay ' + 'x'.repeat(400);
  assert.equal(dbg[0].reason, 'malformed SSE data line 1 (part of the reply lost: the stream counts as cut short): ' + line.slice(0, 200));
  const all = await apiDebug(page);
  assert.ok(all.some(d => /^narrator 200: broken_stream: 1 malformed SSE data line: part of the reply was lost$/.test(d)), all.join(' | '));
  // A data line that carries nothing of the reply (not JSON, not a delta): logged, the reply stands.
  const n = reqs.length;
  queue('narrator', narrReply(NARRATION, { raw: ['event: ping\ndata: keep-alive', 'event: ping\ndata: still here'] }));
  await sendText(page, 'I ask about the boats');
  assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'narrator', 'bookkeeper'], 'no retry');
  const dbg2 = await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'api' && /^malformed SSE/.test(d.reason)).map(d => d.reason));
  assert.deepEqual(dbg2.slice(1), ['malformed SSE data line 1: keep-alive', 'malformed SSE data line 2: still here']);
});

s.test('the debug log never grows past DEBUG_MAX: 300 entries from an Api site keep the newest 200; no module pushes to debugLog directly', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const lines = [];
    for (let i = 1; i <= 300; i++) lines.push(`event: ping\ndata: junk ${i}\n\n`);
    lines.push(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
    const out = await Game.Api.readStream(new Response(lines.join('')), null, null, 'narrator');
    const log = Game.State.debugLog;
    return { max: Game.State.DEBUG_MAX, len: log.length, last: log[log.length - 1].reason, first: log.filter(d => /malformed/.test(d.reason))[0].reason, malformed: out.malformed };
  });
  assert.equal(r.max, 200);
  assert.equal(r.malformed, 300);
  assert.equal(r.len, 200);
  assert.equal(r.last, 'malformed SSE data line 300: junk 300');
  assert.equal(r.first, 'malformed SSE data line 101: junk 101');
  // The source: debugLog.push appears once, inside State.pushDebug.
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal((src.match(/debugLog\.push\(/g) || []).length, 1);
  assert.equal((src.match(/State\.debugLog\.push\(/g) || []).length, 0);
});

s.test('the parser\'s and the bookkeeper\'s system prompts go as one cached block each; their cache reads and writes count in the cost and show in the Debug API block', async h => {
  const { page, reqs, queue } = await openReal(h);
  const read = { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 1100, cache_creation_input_tokens: 0 };
  const write = { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 1200, cache_creation: { ephemeral_1h_input_tokens: 1200, ephemeral_5m_input_tokens: 0 } };
  queue('parser', parseReply({}, read));
  queue('bookkeeper', bookReply({}, write));
  await sendText(page, 'I ask the ferryman about the tide');
  const sys = await page.evaluate(() => ({ parser: Game.Api.SYSTEM.parser, bookkeeper: Game.Api.SYSTEM.bookkeeper }));
  for (const role of ['parser', 'bookkeeper']) {
    const r = reqs.find(x => x.role === role);
    assert.deepEqual(r.body.system, [{ type: 'text', text: sys[role], cache_control: { type: 'ephemeral', ttl: '1h' } }], role);
    assert.equal(r.body.messages.length, 1);
    assert.ok(!r.body.messages[0].content.includes(sys[role].slice(0, 60)), `${role}: the packet stays in the user message`);
  }
  // The cached prefix is long enough to cache (the API's minimum is 512 tokens; about 4 characters a token).
  assert.ok(sys.parser.length / 4 > 512 && sys.bookkeeper.length / 4 > 512, `${sys.parser.length} ${sys.bookkeeper.length}`);
  const u = await page.evaluate(() => JSON.parse(JSON.stringify(Game.Api.usage)));
  const sonnetParse = (200 * 2 + 80 * 10 + 1100 * 0.2) / 1e6;
  const sonnetBook = (200 * 2 + 80 * 10 + 1200 * 2 * 2) / 1e6; // a 1-hour write is 2x input
  const opus = (900 * 4 + 42 * 20) / 1e6;
  assert.ok(Math.abs(u.turn.cost - (sonnetParse + sonnetBook + opus)) < 1e-12, `${u.turn.cost} vs ${sonnetParse + sonnetBook + opus}`);
  assert.equal(u.turn.cacheRead, 1100);
  assert.equal(u.turn.cacheCreation, 1200);
  assert.deepEqual(u.cache, { parser: { read: 1100, write: 0 }, bookkeeper: { read: 0, write: 1200 } });
  // A second turn with the parser reading again.
  queue('parser', parseReply({}, read));
  await sendText(page, 'I ask the ferryman about the fare');
  const ps = reqs.filter(x => x.role === 'parser');
  assert.equal(JSON.stringify(ps[1].body.system), JSON.stringify(ps[0].body.system), 'byte-identical every turn');
  await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  assert.ok(dbg.includes('cache by role: parser read 2200, write 0; bookkeeper read 0, write 1200'), dbg.slice(dbg.indexOf('API ('), dbg.indexOf('API (') + 600));
  // The chronicle still caches nothing.
  const c = await page.evaluate(async () => { await Game.Api.chronicle(Game.state.log.slice()); return null; });
  assert.equal(c, null);
  const chron = reqs.filter(x => x.role === 'chronicle').pop();
  assert.equal(typeof chron.body.system, 'string');
});

s.test('capStack is linear and cuts the same entries as before: the oldest go first until the stack fits, a shared town string counted once', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    // The old capStack, for comparison: stackBytes recomputed after every shift.
    const old = list => { if (list.length > S.UNDO_MAX) list.splice(0, list.length - S.UNDO_MAX); while (list.length > 1 && S.stackBytes(list) > S.UNDO_BYTES) list.shift(); };
    let seed = 7;
    const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const towns = ['T'.repeat(300000), 'U'.repeat(900000), null];
    const results = [];
    for (let trial = 0; trial < 40; trial++) {
      const len = 1 + rnd(24);
      const list = [];
      for (let i = 0; i < len; i++) {
        const t = towns[rnd(3)];
        // Sometimes the same string as the entry before (shared), sometimes an equal copy (a different string, same text).
        const town = rnd(4) === 0 && t ? t.slice(0, -1) + t.slice(-1) : t;
        list.push({ json: 'j'.repeat(100000 + rnd(1400000)), town, turn: i });
      }
      const a = list.slice();
      const b = list.slice();
      S.capStack(a);
      old(b);
      results.push({ same: a.length === b.length && a.every((e, i) => e === b[i]), kept: a.length, bytes: S.stackBytes(a), len });
    }
    return { results, max: S.UNDO_BYTES };
  });
  assert.ok(r.results.every(x => x.same), JSON.stringify(r.results.filter(x => !x.same)));
  assert.ok(r.results.some(x => x.kept < x.len), 'some trials were cut');
  assert.ok(r.results.every(x => x.bytes <= r.max || x.kept === 1));
});

s.run();
