'use strict';
/* Milestone 3: the real Claude provider (docs/API_NOTES.md), exercised end to
   end with mock mode off, a fake key, and canned responses served by
   page.route for https://api.anthropic.com/v1/messages. Nothing leaves the
   machine. Ids and names come from Game.data, never from one town.
   Run with: node tests/run.cjs api */
const assert = require('assert/strict');
const { suite, quickStart, stateJson, sendText, fixtures, LAPTOP } = require('./helpers.cjs');

const s = suite('api');
const API = 'https://api.anthropic.com/v1/messages';
const KEY = 'sk-ant-test-0123456789';

function roleOf(body) {
  if (body.stream) return 'narrator';
  const sc = body.output_config && body.output_config.format && body.output_config.format.schema;
  if (sc && sc.properties && sc.properties.actionType) return 'parser';
  if (sc && sc.properties && sc.properties.attitudeChanges) return 'bookkeeper';
  if (sc && sc.properties && sc.properties.existingNpcId) return 'person';
  return 'chronicle';
}

// ----- canned responses -----
const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const PARSE = { actionType: 'talk', summary: 'Asks about the tide', targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, timeCost: 'instant', declaresWorldFact: false };
const DIFF = { attitudeChanges: [], newMemories: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], journalEntry: null };
const NARRATION = ['Rain needles the water. ', 'The old man spits into the river. ', '"Tide\'s wrong," he says.'];
function message(text, opts) {
  opts = opts || {};
  return {
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: opts.model || 'claude-haiku-5-5', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text }], stop_reason: opts.stop || 'end_turn', stop_details: opts.details || null, usage: opts.usage || USAGE })
  };
}
const parseReply = over => () => message(JSON.stringify(Object.assign({}, PARSE, over)));
const bookReply = over => () => message(JSON.stringify(Object.assign({}, DIFF, over)));
function sse(parts, opts) {
  opts = opts || {};
  const u = opts.usage || { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const ev = [
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, usage: u } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'SECRET THOUGHTS ABOUT THE PLOT' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'c2ln' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'ping' },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }
  ];
  for (const p of parts) ev.push({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: p } });
  if (opts.error) ev.push({ type: 'error', error: opts.error });
  else {
    ev.push({ type: 'content_block_stop', index: 1 });
    ev.push({ type: 'message_delta', delta: { stop_reason: opts.stop || 'end_turn', stop_details: opts.details || null }, usage: { output_tokens: opts.output || 42 } });
    ev.push({ type: 'message_stop' });
  }
  return { status: 200, contentType: 'text/event-stream', body: ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') };
}
const narrReply = (parts, opts) => () => sse(parts || NARRATION, opts);
const errorReply = (status, type, msg) => () => ({ status, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type, message: msg || `${type} happened` } }) });
const DEFAULTS = { parser: parseReply(), narrator: narrReply(), bookkeeper: bookReply(), chronicle: () => message('They arrived and asked about the tide.'), person: () => message('{}') };

/* Opens the game with the route installed. The game starts in mock mode (so
   the arrival is the local text), then mock mode goes off and a key is set,
   unless opts.live is true (the arrival itself goes to the API). */
async function openReal(h, opts) {
  opts = opts || {};
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  const queues = { parser: [], narrator: [], bookkeeper: [], chronicle: [], person: [] };
  await page.route(API, async route => {
    const req = route.request();
    const body = JSON.parse(req.postData());
    const role = roleOf(body);
    const n = reqs.filter(r => r.role === role).length + 1;
    reqs.push({ role, n, headers: req.headers(), method: req.method(), body, at: Date.now() });
    const make = queues[role].length ? queues[role].shift() : DEFAULTS[role];
    const out = make(body, n);
    if (out.abort) return route.abort('failed');
    return route.fulfill({
      status: out.status,
      headers: { 'content-type': out.contentType, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': `req_${role}_${n}` },
      body: out.body
    });
  });
  const live = () => page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  const fx = await fixtures(page);
  fx.startName = await page.evaluate(id => Game.data.TOWN_DATA.locations.find(l => l.id === id).name, fx.start.docks);
  if (opts.live) await live();
  await quickStart(page, { bgIndex: fx.docksBg }); // arrives by the river
  if (opts.live) await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length === 1);
  else await live();
  return { page, reqs, fx, queue: (role, ...fns) => queues[role].push(...fns) };
}
function walkSchema(node, where, out) {
  if (Array.isArray(node)) { node.forEach((x, i) => walkSchema(x, `${where}[${i}]`, out)); return; }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object') {
    out.objects.push(where);
    if (node.additionalProperties !== false) out.bad.push(`${where}: additionalProperties is not false`);
    const props = Object.keys(node.properties || {});
    if (!props.length) out.bad.push(`${where}: no properties`);
    if (JSON.stringify((node.required || []).slice().sort()) !== JSON.stringify(props.slice().sort())) out.bad.push(`${where}: required does not list every property`);
  }
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format', '$ref']) if (k in node) out.bad.push(`${where}: unsupported keyword ${k}`);
  for (const k of Object.keys(node)) walkSchema(node[k], `${where}.${k}`, out);
}

s.test('requests carry the four headers and a body the current API accepts, with model and max_tokens per role', async h => {
  const { page, reqs, fx } = await openReal(h);
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs.map(r => r.role), ['parser', 'narrator', 'bookkeeper']);
  for (const r of reqs) {
    assert.equal(r.method, 'POST');
    assert.equal(r.headers['x-api-key'], KEY);
    assert.equal(r.headers['anthropic-version'], '2026-10-21');
    assert.equal(r.headers['content-type'], 'application/json');
    assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
    for (const banned of ['temperature', 'top_p', 'top_k', 'thinking', 'tools', 'tool_choice']) assert.ok(!(banned in r.body), `${r.role}: ${banned}`);
    assert.ok(!JSON.stringify(r.body).includes('"tool_choice"') && !JSON.stringify(r.body).includes('"budget_tokens"'));
    assert.equal(r.body.messages.length, 1);
    assert.equal(r.body.messages[0].role, 'user');
    assert.equal(r.body.output_config.effort, { parser: 'low', narrator: 'medium', bookkeeper: 'medium', chronicle: 'medium' }[r.role], r.role + ' effort');
  }
  const [parser, narrator, book] = reqs;
  assert.equal(parser.body.model, 'claude-sonnet-5-5');
  assert.equal(parser.body.max_tokens, 2000);
  assert.equal(narrator.body.model, 'claude-opus-5-5');
  assert.equal(narrator.body.max_tokens, 3000);
  assert.equal(book.body.model, 'claude-sonnet-5-5');
  assert.equal(book.body.max_tokens, 4000);
  // Structured outputs for the parser and bookkeeper; none for the narrator.
  for (const r of [parser, book]) {
    assert.equal(r.body.output_config.format.type, 'json_schema');
    assert.ok(!r.body.stream);
    const out = { objects: [], bad: [] };
    walkSchema(r.body.output_config.format.schema, r.role, out);
    assert.deepEqual(out.bad, [], r.role);
    // bookkeeper: the root, the eight array item objects (placesRevealed and peopleRevealed too) and newSeeds[].trigger.
    assert.equal(out.objects.length, r.role === 'bookkeeper' ? 10 : 1, `${r.role}: nested objects spelled out`);
    // The API compiles the schema to a grammar with a size limit, and record_changes sits right at it
    // (probed live: 46 properties pass, 47 are refused as "compiled grammar too large"). Adding a field
    // anywhere in it needs another field removed, or a live probe first.
    if (r.role === 'bookkeeper') {
      let props = 0;
      const count = node => { if (Array.isArray(node)) return node.forEach(count); if (node && typeof node === 'object') { if (node.type === 'object' && node.properties) props += Object.keys(node.properties).length; Object.values(node).forEach(count); } };
      count(r.body.output_config.format.schema);
      assert.ok(props <= 46, `record_changes has ${props} properties; the API's grammar limit is 46`);
    }
  }
  assert.ok(!('format' in narrator.body.output_config));
  assert.equal(narrator.body.stream, true);
  const sys = await page.evaluate(() => ({ narrator: Game.Style.systemPrompt(), parser: Game.Api.SYSTEM.parser, book: Game.Api.SYSTEM.bookkeeper }));
  assert.deepEqual(narrator.body.system, [{ type: 'text', text: sys.narrator, cache_control: { type: 'ephemeral' } }]);
  assert.equal(parser.body.system, sys.parser);
  assert.equal(book.body.system, sys.book);
  assert.match(parser.body.system, /^You convert a player's free-text action into structured data for a game engine\./);
  assert.match(book.body.system, /^You record what changed in the game world after this turn\./);
  // Nothing volatile in the cached system prompt.
  const volatile = await page.evaluate(() => [Game.state.player.name, Game.state.meta.townName, 'DAY 1', Game.State.loc(Game.state.player.locationId).name].concat(Game.State.npcsAt(Game.state.player.locationId).map(n => n.name)));
  for (const v of volatile) assert.ok(!sys.narrator.includes(v), 'system prompt contains ' + v);
  assert.ok(narrator.body.messages[0].content.startsWith(`DAY 1, MORNING (early) · Location: ${fx.startName}`));
  assert.match(parser.body.messages[0].content, /^PLAYER INPUT: I ask the ferryman about the tide\n/);
  assert.match(book.body.messages[0].content, /\nNARRATION: Rain needles the water\./);
  // A second turn: the narrator system block is byte-identical.
  await sendText(page, 'I ask the ferryman about the fare');
  const narrs = reqs.filter(r => r.role === 'narrator');
  assert.equal(narrs.length, 2);
  assert.equal(JSON.stringify(narrs[1].body.system), JSON.stringify(narrs[0].body.system));
  assert.notEqual(narrs[1].body.messages[0].content, narrs[0].body.messages[0].content);
  // Settings drive model and effort, per role.
  await page.evaluate(() => Game.Storage.saveSettings({ narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'high', bookkeeper: 'medium' } }));
  await sendText(page, 'I nod to the ferryman');
  const last = reqs.slice(-3);
  assert.deepEqual(last.map(r => [r.role, r.body.model, r.body.output_config.effort]), [['parser', 'claude-sonnet-5-5', 'low'], ['narrator', 'claude-opus-5-5', 'high'], ['bookkeeper', 'claude-sonnet-5-5', 'medium']]);
});

s.test('the narrator stream (thinking block, ping, text deltas, message_delta) streams into the feed', async h => {
  const { page, reqs } = await openReal(h);
  await page.evaluate(() => {
    window.__streams = [];
    const orig = Game.UI.feed.stream;
    Game.UI.feed.stream = function (node, text) { window.__streams.push(text); return orig.apply(this, arguments); };
  });
  await sendText(page, 'I ask the ferryman about the tide');
  const r = await page.evaluate(() => ({
    streams: window.__streams.filter(Boolean), feed: [...document.querySelectorAll('#feed .f-narr')].pop().innerText,
    log: Game.state.log[Game.state.log.length - 1], resp: Game.Api.responses.filter(x => x.role === 'narrator').pop(), tags: document.querySelectorAll('#feed .f-tag').length
  }));
  const full = NARRATION.join('');
  assert.deepEqual(r.streams, [NARRATION[0], NARRATION[0] + NARRATION[1], full], 'one update per text delta, in order');
  assert.equal(r.feed.trim(), full);
  assert.ok(!r.feed.includes('SECRET'), 'thinking text is never shown');
  assert.equal(r.log.narration, full);
  assert.ok(!r.log.mock, 'not flagged as mock');
  assert.equal(r.tags, 0, 'no mock tag on real narration');
  assert.equal(r.resp.stopReason, 'end_turn');
  assert.equal(r.resp.requestId, 'req_narrator_1');
  assert.equal(r.resp.usage.input_tokens, 900, 'usage from message_start');
  assert.equal(r.resp.usage.output_tokens, 42, 'output tokens from message_delta');
  assert.equal(reqs.length, 3);
});

s.test('a 429 is retried once after about 1.5 s and then succeeds; 500 and 529 retry once and then fail', async h => {
  const { page, reqs, queue } = await openReal(h);
  queue('parser', errorReply(429, 'rate_limit_error', 'slow down'));
  await sendText(page, 'I ask the ferryman about the tide');
  const parsers = reqs.filter(r => r.role === 'parser');
  assert.equal(parsers.length, 2);
  const gap = parsers[1].at - parsers[0].at;
  assert.ok(gap >= 1400 && gap < 4000, 'waited about 1.5 s, got ' + gap);
  assert.equal(await page.evaluate(() => Game.state.log.length), 2, 'the turn completed');
  const logged = await page.evaluate(() => Game.Api.responses.filter(x => x.role === 'parser').map(x => [x.status, x.requestId, x.error && x.error.type]));
  assert.deepEqual(logged[0], [429, 'req_parser_1', 'rate_limit_error']);
  // Two server errors in a row: one retry, then a clear message and the input kept.
  for (const [status, type, text] of [[500, 'api_error', /internal error/], [529, 'overloaded_error', /overloaded/]]) {
    const before = await stateJson(page);
    const n = reqs.length;
    queue('narrator', errorReply(status, type), errorReply(status, type));
    await sendText(page, 'I ask about the boats');
    assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'narrator', 'narrator'], `${status}: retried once`);
    assert.equal(await page.inputValue('#cmd'), 'I ask about the boats');
    assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), text);
    assert.equal(await stateJson(page), before);
    await page.fill('#cmd', '');
  }
  // A network failure is retried once too.
  const n = reqs.length;
  queue('parser', () => ({ abort: true }), () => ({ abort: true }));
  await sendText(page, 'I ask about the boats');
  assert.equal(reqs.slice(n).length, 2);
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), /Could not reach the API/);
});

s.test('401, 403, 404 and 400 are never retried; 401 points to the key, 400 shows the API message in debug', async h => {
  const { page, reqs, queue } = await openReal(h);
  const cases = [
    [401, 'authentication_error', /The API key was not accepted\. Check the key in Settings\./],
    [403, 'permission_error', /not allowed/],
    [404, 'not_found_error', /model names in Settings/],
    [400, 'invalid_request_error', /bug in the game.*debug view/]
  ];
  for (const [status, type, text] of cases) {
    const before = await stateJson(page);
    const n = reqs.length;
    queue('parser', errorReply(status, type, `verbatim ${status} detail`));
    await sendText(page, 'I ask the ferryman about the tide');
    assert.equal(reqs.length - n, 1, `${status}: no retry`);
    assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the tide', `${status}: input kept`);
    assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), text);
    assert.equal(await stateJson(page), before, `${status}: state untouched`);
    await page.fill('#cmd', '');
  }
  await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  assert.match(dbg, /parser HTTP 400 req_parser_4: invalid_request_error: verbatim 400 detail/);
  assert.match(dbg, /parser HTTP 401 req_parser_1: authentication_error/);
});

s.test('a refusal shows the notice and restores the input (narrator stream and JSON calls)', async h => {
  const { page, queue } = await openReal(h);
  const before = await stateJson(page);
  queue('narrator', narrReply(['The ferryman '], { stop: 'refusal', details: { type: 'refusal', category: 'violence', explanation: 'no' } }));
  await sendText(page, 'I do something the narrator will not write');
  assert.equal(await page.inputValue('#cmd'), 'I do something the narrator will not write');
  const notice = await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent);
  assert.equal(notice, 'The narrator declined that one. Try it another way.');
  assert.equal(await stateJson(page), before);
  assert.ok(!(await page.innerText('#feed')).includes('The ferryman'), 'partial text taken back out');
  await page.fill('#cmd', '');
  for (const role of ['parser', 'bookkeeper']) {
    queue(role, () => message('', { stop: 'refusal', details: { type: 'refusal', category: 'cyber', explanation: 'no' } }));
    await sendText(page, 'I try another way');
    assert.equal(await page.inputValue('#cmd'), 'I try another way', role);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent), 'The narrator declined that one. Try it another way.');
    assert.equal(await stateJson(page), before, role);
    await page.fill('#cmd', '');
  }
  assert.ok(await page.evaluate(() => Game.Api.responses.some(r => r.stopReason === 'refusal' && r.data && r.data.stop_details && r.data.stop_details.category === 'cyber')));
});

s.test('a JSON reply cut off by max_tokens is retried once with double max_tokens', async h => {
  const { page, reqs, queue } = await openReal(h);
  queue('bookkeeper', () => message('{"attitudeChanges": [{"npcId": "npc_ok', { stop: 'max_tokens' }), bookReply({ journalEntry: 'Asked about the tide.' }));
  await sendText(page, 'I ask the ferryman about the tide');
  const books = reqs.filter(r => r.role === 'bookkeeper');
  assert.deepEqual(books.map(r => r.body.max_tokens), [4000, 8000]);
  assert.equal(await page.evaluate(() => Game.state.journal.slice(-1)[0].text), 'Asked about the tide.');
  // Twice in a row: a clear message, the input kept, no third try.
  const n = reqs.length;
  queue('parser', () => message('{"actionType": "ta', { stop: 'max_tokens' }), () => message('{"actionType": "talk", "summ', { stop: 'max_tokens' }));
  await sendText(page, 'I ask the ferryman about the fare');
  assert.deepEqual(reqs.slice(n).map(r => [r.role, r.body.max_tokens]), [['parser', 2000], ['parser', 4000]]);
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), /cut off/);
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the fare');
});

s.test('usage totals and cost per model appear in the debug tab; the second narration reads the cache', async h => {
  const { page, queue } = await openReal(h);
  queue('narrator', narrReply(null, { usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 700 }, output: 50 }));
  queue('narrator', narrReply(null, { usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 }, output: 50 }));
  await sendText(page, 'I ask the ferryman about the tide');
  await sendText(page, 'I ask the ferryman about the fare');
  const u = await page.evaluate(() => JSON.parse(JSON.stringify(Game.Api.usage)));
  // Per turn: parser + bookkeeper (Sonnet 5.5, 300 in / 80 out each) + narrator (Opus 5.5).
  const sonnet = 2 * (300 * 2 + 80 * 10) / 1e6;
  const turn1 = sonnet + (1000 * 4 + 50 * 20 + 700 * 4 * 1.25) / 1e6;
  const turn2 = sonnet + (1000 * 4 + 50 * 20 + 700 * 0.2) / 1e6;
  assert.equal(u.turn.calls, 3);
  assert.equal(u.turn.input, 1600);
  assert.equal(u.turn.output, 210);
  assert.equal(u.turn.cacheRead, 700, 'second narration reads the cache');
  assert.ok(Math.abs(u.turn.cost - turn2) < 1e-12, `turn cost ${u.turn.cost} vs ${turn2}`);
  assert.equal(u.session.calls, 6);
  assert.equal(u.session.cacheCreation, 700);
  assert.ok(Math.abs(u.session.cost - (turn1 + turn2)) < 1e-12);
  await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  assert.ok(dbg.includes(`turn: 3 calls, in 1600, out 210, cache read 700, cache write 0, $${turn2.toFixed(4)}`), dbg);
  assert.ok(dbg.includes(`session: 6 calls, in 3200, out 420, cache read 700, cache write 700, $${(turn1 + turn2).toFixed(4)}`));
  assert.match(dbg, /API \(claude\)/i);
  assert.match(dbg, /request-id req_bookkeeper_2/);
  assert.match(dbg, /"cache_read_input_tokens":700/);
  // An unknown model shows tokens without a price.
  await page.evaluate(() => Game.Storage.saveSettings({ parserModel: 'claude-mystery-9' }));
  await sendText(page, 'I nod');
  const u2 = await page.evaluate(() => Game.Api.usage.turn);
  assert.equal(u2.priced, false);
});

s.test('with a key and mock mode off, Begin narrates the arrival through the narrator in MODE arrival', async h => {
  const { page, reqs, fx } = await openReal(h, { live: true });
  assert.deepEqual(reqs.map(r => r.role), ['narrator']);
  const user = reqs[0].body.messages[0].content;
  assert.match(user, /\nMODE: arrival \(ZOOM length allowed\)\nLENGTH: up to 6 sentences, under 150 words\. Stop at the first moment the player must respond\.\nVARIETY: [^\n]+$/);
  assert.ok(user.includes(`\nACTION: Tester arrives in ${fx.town} for the first time, arriving by the river, at ${fx.startName}\n`), user);
  const st = await page.evaluate(() => ({ log: Game.state.log, journal: Game.state.journal.map(j => j.text), turn: Game.state.meta.turn }));
  assert.equal(st.log.length, 1);
  assert.equal(st.log[0].narration, NARRATION.join(''));
  assert.equal(st.log[0].input, '');
  assert.equal(st.turn, 0);
  assert.ok(st.journal.includes(`Arrived in ${fx.town}.`));
  assert.equal((await page.innerText('#feed')).split(NARRATION.join('')).length, 2, 'shown once');
  // If the arrival cannot be narrated, the local text stands in.
  const p2 = await openReal(h, { live: false });
  await p2.page.evaluate(() => Game.State.clear());
  p2.queue('narrator', errorReply(401, 'authentication_error'));
  await quickStart(p2.page, { bgIndex: fx.docksBg });
  await p2.page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length === 1);
  const local = await p2.page.evaluate(() => Game.state.log[0].narration);
  assert.ok(local.includes(`You step off a river boat onto ${fx.startName.replace(/^The /, 'the ')} in ${fx.town}`), local);
  assert.match(await p2.page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), /API key was not accepted.*game's own text/);
});

s.test('an arrival that cannot reach the API (network error) leaves no pending placeholder: the notice and the local opening text stand in', async h => {
  const page = await h.open({ viewport: LAPTOP });
  let hits = 0;
  await page.route(API, route => { hits += 1; return route.abort('internetdisconnected'); });
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  await quickStart(page); // Begin: the arrival goes to the narrator
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length === 1, null, { timeout: 10000 });
  const r = await page.evaluate(() => ({
    pending: document.querySelectorAll('#feed .f-narr.pending').length,
    busy: [...document.querySelectorAll('[aria-busy="true"]')].map(n => n.id || n.className),
    kinds: [...document.querySelectorAll('#feed > *')].map(n => n.classList.contains('f-notice') ? 'notice' : n.classList.contains('f-narr') ? 'narration' : n.classList.contains('f-divider') ? 'divider' : n.className),
    narration: [...document.querySelectorAll('#feed .f-narr')].map(n => [...n.querySelectorAll('p:not(.f-tag)')].map(x => x.textContent).join('\n\n')),
    notice: document.querySelector('#feed .f-notice.error').textContent,
    log: Game.state.log[0].narration,
    opening: Game.Town.openingScene(Game.state)
  }));
  assert.equal(hits, 2, 'one retry, then the fallback');
  assert.equal(r.pending, 0, 'no pending narration node');
  assert.deepEqual(r.busy, [], 'nothing left aria-busy');
  assert.deepEqual(r.kinds, ['divider', 'notice', 'narration'], 'only the notice and the opening text were added');
  assert.match(r.notice, /Could not reach the API.*The arrival below is the game's own text\./);
  assert.equal(r.log, r.opening, 'the opening text is the local one');
  assert.deepEqual(r.narration, [r.log]);
});

s.test('Api.chronicle summarises log entries with the parser model in plain text', async h => {
  const { page, reqs } = await openReal(h);
  await sendText(page, 'I ask the ferryman about the tide');
  const summary = await page.evaluate(() => Game.Api.chronicle(Game.state.log.slice()));
  assert.equal(summary, 'They arrived and asked about the tide.');
  const c = reqs.find(r => r.role === 'chronicle');
  assert.equal(c.body.model, 'claude-sonnet-5-5');
  assert.equal(c.body.max_tokens, 2000);
  assert.ok(!c.body.stream && !c.body.output_config.format);
  assert.equal(c.body.system, await page.evaluate(() => Game.Api.SYSTEM.chronicle));
  assert.match(c.body.system, /^Summarise these 10 turns in under 80 words/);
  assert.match(c.body.messages[0].content, /TURN 1 \(day 1, morning\)\nPLAYER: I ask the ferryman about the tide\nNARRATION: Rain needles the water\./);
});

s.test('an error event inside the stream is surfaced and the input kept', async h => {
  const { page, queue } = await openReal(h);
  const before = await stateJson(page);
  queue('narrator', narrReply(['The quay '], { error: { type: 'overloaded_error', message: 'Overloaded' } }));
  await sendText(page, 'I ask the ferryman about the tide');
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the tide');
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), /overloaded right now/);
  assert.equal(await stateJson(page), before);
  assert.ok(await page.evaluate(() => Game.Api.responses.some(r => r.error && r.error.message === 'Overloaded')));
});

s.test('a reply the game cannot read is asked for once more: a narrator body that is not JSON, a structured reply that does not parse; twice in a row shows the notice and keeps the input', async h => {
  const { page, reqs, queue } = await openReal(h);
  const garbage = () => ({ status: 200, contentType: 'application/json', body: '<html>gateway hiccup</html>' });
  // The narrator: garbage once, then the stream.
  queue('narrator', garbage, narrReply());
  await sendText(page, 'I ask the ferryman about the tide');
  assert.deepEqual(reqs.filter(r => r.role === 'narrator').length, 2, 'asked twice');
  assert.match(await page.evaluate(() => Game.state.log.slice(-1)[0].narration), /Tide's wrong/);
  assert.ok(await page.evaluate(() => Game.Api.responses.some(r => r.role === 'narrator' && r.error && r.error.type === 'bad_response' && /trying again/.test(r.error.message))), 'the first try is logged');
  // The bookkeeper: text that is not JSON once, then a good reply.
  let n = reqs.length;
  queue('bookkeeper', () => message('Sure! Here is the record: {'), bookReply({ journalEntry: 'Asked about the fare.' }));
  await sendText(page, 'I ask the ferryman about the fare');
  assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'narrator', 'bookkeeper', 'bookkeeper']);
  assert.equal(await page.evaluate(() => Game.state.journal.slice(-1)[0].text), 'Asked about the fare.');
  // Twice in a row: the notice, the input kept, the state as before, no third try.
  n = reqs.length;
  const before = await stateJson(page);
  queue('parser', () => message('not json'), () => message('still not json'));
  await sendText(page, 'I ask the ferryman about the weather');
  assert.deepEqual(reqs.slice(n).map(r => r.role), ['parser', 'parser']);
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.error')].pop().textContent), /could not read\. Try again\. Your action was kept in the box\./);
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman about the weather');
  assert.equal(await stateJson(page), before);
});

s.test('a person the player asks for: one create_person call on the parser model with the description, the last three turns, everyone in the game and a shortlist; the reply makes her (she/her, his wife); a bad reply or an error falls back to the tables; existingNpcId reuses someone', async h => {
  const { page, reqs, queue } = await openReal(h);
  const x = await page.evaluate(() => {
    const st = Game.state;
    const here = Game.State.npcsAt(st.player.locationId).map(n => n.id);
    const first = n => n.name.split(' ')[0];
    const owner = st.npcs.find(n => !here.includes(n.id) && n.pronouns === 'he' && st.npcs.filter(m => first(m) === first(n)).length === 1);
    const speaker = st.npcs.find(n => n.id !== owner.id);
    const line = `${speaker.name} wipes his hands. "${first(owner)}'s is the white house about a mile up the river road, on the left. Now, I'm not saying his wife Mavis is gonna be thrilled when you knock."`;
    Game.State.apply({ logEntry: { input: `Where does ${first(owner)} live?`, roll: null, narration: line } });
    return { owner: { id: owner.id, name: owner.name, first: first(owner), family: owner.name.split(' ').slice(-1)[0] }, line };
  });
  const person = { existingNpcId: null, name: `Mavis ${x.owner.family}`, pronouns: 'she', role: `${x.owner.first}'s wife`, look: 'A small, tired woman in a motel smock.', voice: 'Short and dry; never says more than she has to.', personality: ['tired', 'sharp'], goal: 'Sleep through one whole day.', secret: 'She has been putting money aside to leave.', relationToNpcId: x.owner.id, relation: 'wife' };
  queue('parser', parseReply({ targets: [`new:Mavis, ${x.owner.first}'s wife`], summary: 'Knocks and asks for Mavis' }));
  queue('person', () => message(JSON.stringify(person)));
  await sendText(page, 'I knock and ask for Mavis.');
  assert.deepEqual(reqs.slice(-4).map(r => r.role), ['parser', 'person', 'narrator', 'bookkeeper']);
  const req = reqs.find(r => r.role === 'person');
  assert.equal(req.body.model, 'claude-sonnet-5-5', 'the parser model');
  assert.equal(req.body.max_tokens, 3000);
  assert.equal(req.body.output_config.effort, 'low', "the parser's effort");
  assert.equal(req.body.system, await page.evaluate(() => Game.Api.SYSTEM.person));
  const out = { objects: [], bad: [] };
  walkSchema(req.body.output_config.format.schema, 'person', out);
  assert.deepEqual(out.bad, []);
  assert.deepEqual(Object.keys(req.body.output_config.format.schema.properties), ['existingNpcId', 'name', 'pronouns', 'role', 'look', 'voice', 'personality', 'goal', 'secret', 'relationToNpcId', 'relation']);
  const user = req.body.messages[0].content;
  assert.match(user, new RegExp(`^DESCRIPTION: Mavis, ${x.owner.first}'s wife \\(the person the player asked for, in the parser's words\\)\\nPLAYER INPUT: I knock and ask for Mavis\\.\\n`));
  assert.ok(user.includes('LAST 3 TURNS (oldest first):') && user.includes("his wife Mavis is gonna be thrilled"), 'the last turns');
  assert.ok(user.includes(`${x.owner.id} — ${x.owner.name} (he/him; `), 'everyone, with pronouns');
  const short = await page.evaluate(u => { const T = Game.data.TABLES.npc; const line = (k, sep) => (u.split('\n').find(l => l.startsWith(k)) || '').slice(k.length).split(sep || ', '); return { f: line('FIRST NAMES: ').filter(n => T.firstNames.includes(n)).length, l: line('FAMILY NAMES: ').filter(n => T.familyNames.includes(n)).length, t: line('TRAITS: ').filter(n => T.traits.includes(n)).length, q: line('SPEECH QUIRKS: ', '; ').filter(n => T.speechQuirks.includes(n)).length }; }, user);
  assert.deepEqual(short, { f: 6, l: 6, t: 6, q: 4 }, 'a shortlist from the tables');
  const made = await page.evaluate(name => JSON.parse(JSON.stringify(Game.state.npcs.find(n => n.name === name) || null)), person.name);
  assert.ok(made, 'she exists');
  assert.deepEqual([made.pronouns, made.role, made.look, made.created.by, made.created.relationToNpcId, made.created.relation, made.knownToPlayer], ['she', person.role, person.look, 'context', x.owner.id, 'wife', true]);
  assert.deepEqual(made.personality, ['tired', 'sharp']);
  const narr = reqs.filter(r => r.role === 'narrator').pop().body.messages[0].content;
  assert.ok(narr.includes(`${person.name} (she/her; ${person.role}; `), 'the narrator gets her pronouns');
  assert.ok(narr.includes(`NEW IN THE SCENE: ${person.name} (${person.role}, new to the scene)`));
  // A bad reply (pronouns that are not he, she or they): the tables make her, by the words.
  queue('parser', parseReply({ targets: ['new:woman at the pumps'] }));
  queue('person', () => message(JSON.stringify(Object.assign({}, person, { name: 'Faye Hux', pronouns: 'it' }))));
  const n0 = await page.evaluate(() => Game.state.npcs.length);
  await sendText(page, 'I wave at the woman at the pumps');
  const fb = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state.npcs[Game.state.npcs.length - 1])));
  assert.equal(await page.evaluate(() => Game.state.npcs.length), n0 + 1);
  assert.deepEqual([fb.created.by, fb.pronouns], ['tables', 'she']);
  assert.match(await page.evaluate(() => Game.State.debugLog.filter(d => d.path === 'create_person').map(d => d.reason).join(' | ')), /pronouns must be he, she or they/);
  // An API error: the tables again, and the turn goes on.
  queue('parser', parseReply({ targets: ['new:old man on the bench'] }));
  queue('person', errorReply(400, 'invalid_request_error', 'nope'));
  await sendText(page, 'I sit by the old man on the bench');
  const fb2 = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state.npcs[Game.state.npcs.length - 1])));
  assert.deepEqual([fb2.created.by, fb2.pronouns], ['tables', 'he']);
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].input), 'I sit by the old man on the bench', 'the turn went on');
  // existingNpcId: the person is someone already here; nobody new.
  const n1 = await page.evaluate(() => Game.state.npcs.length);
  queue('parser', parseReply({ targets: ['new:the tired woman in the smock'] }));
  queue('person', () => message(JSON.stringify(Object.assign({}, person, { existingNpcId: made.id, name: '', role: '', look: '', voice: '', personality: [], goal: '', secret: '', relationToNpcId: null, relation: null }))));
  await sendText(page, 'I ask the tired woman in the smock for coffee');
  assert.equal(await page.evaluate(() => Game.state.npcs.length), n1, 'nobody new');
  assert.ok((await page.evaluate(() => Game.Pipeline.lastTurn.action.targets)).includes(made.id));
});

s.run();
