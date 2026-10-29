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
  return 'chronicle';
}

// ----- canned responses -----
const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const PARSE = { actionType: 'talk', summary: 'Asks about the tide', targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false };
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
const DEFAULTS = { parser: parseReply(), narrator: narrReply(), bookkeeper: bookReply(), chronicle: () => message('They arrived and asked about the tide.') };

/* Opens the game with the route installed. The game starts in mock mode (so
   the arrival is the local text), then mock mode goes off and a key is set,
   unless opts.live is true (the arrival itself goes to the API). */
async function openReal(h, opts) {
  opts = opts || {};
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  const queues = { parser: [], narrator: [], bookkeeper: [], chronicle: [] };
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
    // parse_action names a thing the action needs that the player does not carry (the owner's knife), or null.
    if (r.role === 'parser') {
      const mi = r.body.output_config.format.schema.properties.missingItem;
      assert.deepEqual(mi.anyOf, [{ type: 'string' }, { type: 'null' }], 'missingItem is a nullable string');
      assert.match(mi.description, /not in INVENTORY and not lying here \(a knife, a gun, a car, a key, a tool\), named plainly; else null\. usesItemId is for a listed item\./);
      assert.ok(r.body.output_config.format.schema.required.includes('missingItem'));
    }
    // bookkeeper: the root, the seven array item objects (placesRevealed too; peopleRevealed is gone, the cast is fixed) and newSeeds[].trigger.
    assert.equal(out.objects.length, r.role === 'bookkeeper' ? 9 : 1, `${r.role}: nested objects spelled out`);
    // The API compiles the schema to a grammar with a size limit, and record_changes sits right at it
    // (probed live: 46 properties pass, 47 are refused as "compiled grammar too large"). Adding a field
    // anywhere in it needs another field removed, or a live probe first.
    if (r.role === 'bookkeeper') {
      let props = 0;
      const count = node => { if (Array.isArray(node)) return node.forEach(count); if (node && typeof node === 'object') { if (node.type === 'object' && node.properties) props += Object.keys(node.properties).length; Object.values(node).forEach(count); } };
      count(r.body.output_config.format.schema);
      assert.ok(props <= 46, `record_changes has ${props} properties; the API's grammar limit is 46`);
      assert.equal(props, 41, 'peopleRevealed and its four fields are out (46 before)');
      assert.ok(!('peopleRevealed' in r.body.output_config.format.schema.properties));
    }
  }
  assert.ok(!('format' in narrator.body.output_config));
  assert.equal(narrator.body.stream, true);
  const sys = await page.evaluate(() => ({ narrator: Game.Style.systemPrompt(), town: Game.Pipeline.townBlock(), cast: Game.Pipeline.castBlock(), parser: Game.Api.SYSTEM.parser, book: Game.Api.SYSTEM.bookkeeper }));
  // Three cached blocks: the style guide with its examples, the town (its history, recent events and places), then the town's cast.
  assert.deepEqual(narrator.body.system, [sys.narrator, sys.town, sys.cast].map(text => ({ type: 'text', text, cache_control: { type: 'ephemeral' } })));
  assert.match(sys.town, /^THE TOWN \(background everyone here knows; [^\n]*\nHISTORY: [^\n]+\nRECENT \(oldest first; it is \d{4} now\): /);
  assert.match(sys.cast, /^CAST \(everyone who exists in this town; never invent anyone else\):\n/);
  // Cached text stays small: about 1.4 tokens a word, under 12,000 for the three blocks (README, "Costs").
  const words = t => t.split(/\s+/).filter(Boolean).length;
  assert.ok((words(sys.narrator) + words(sys.town) + words(sys.cast)) * 1.4 < 12000, 'cached blocks: ' + Math.round((words(sys.narrator) + words(sys.town) + words(sys.cast)) * 1.4) + ' tokens');
  assert.equal(parser.body.system, sys.parser);
  assert.equal(book.body.system, sys.book);
  assert.match(parser.body.system, /^You convert a player's free-text action into structured data for a game engine\./);
  assert.match(parser.body.system, /The player has only what INVENTORY lists and what ITEMS HERE shows: when the action needs anything else \(a knife to stab with, a gun, a car, a key, a tool\), name it in missingItem/);
  assert.match(narrator.body.messages[0].content, /\nPLAYER: [^\n]+\nCARRYING: [^\n]+ \(nothing else: no weapon, tool, phone, keys, car or money beyond this\)\.\n/);
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
  // Why they came rides on the arrival's ACTION, so the opening can hint at it (direction change 10).
  assert.ok(user.includes(`\nACTION: Tester arrives in ${fx.town} for the first time, arriving by the river, at ${fx.startName}. Why they came (the opening may hint at it; nobody here knows it): Find out who sent the letter.\n`), user);
  assert.ok(user.includes('\nWHY THEY CAME: Find out who sent the letter.\n'), 'and the player\'s hooks follow CARRYING');
  assert.ok(user.includes('\nTHIS SCENE (since the player came to ') && !user.includes('\nBEFORE THIS SCENE:'), 'the first scene starts empty, with nothing before it');
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

s.test('the cast is fixed with the API: a person the parser sends as new: is someone in the cast or nobody, with no extra call; the parser hears everyone else in town; the narrator gets the town and the cast as cached system blocks, with ages, the dead and the far away; the model cannot add a person', async h => {
  const { page, reqs, queue } = await openReal(h);
  const c = await page.evaluate(() => {
    const T = Game.data.TOWN_DATA;
    const wife = T.npcs.find(n => /^Mavis /.test(n.name));
    const husband = T.npcs.find(n => (n.relations || []).some(r => r.npcId === wife.id && r.relation === 'wife'));
    return { wife: { id: wife.id, name: wife.name, role: wife.role }, husband: { id: husband.id, name: husband.name, first: husband.name.split(' ')[0] }, count: Game.state.npcs.length };
  });
  // "Dewayne's wife": the cast's relations say who she is. No create_person call, nobody new.
  queue('parser', parseReply({ actionType: 'talk', targets: [`new:${c.husband.first}'s wife`], summary: `Asks for ${c.husband.first}'s wife` }));
  const n0 = reqs.length;
  await sendText(page, `I ask around for ${c.husband.first}'s wife.`);
  assert.deepEqual(reqs.slice(n0).map(r => r.role), ['parser', 'narrator', 'bookkeeper'], 'no extra call');
  assert.ok((await page.evaluate(() => Game.Pipeline.lastTurn.action.targets)).includes(c.wife.id), `${c.husband.first}'s wife is ${c.wife.id}`);
  assert.equal(await page.evaluate(() => Game.state.npcs.length), c.count, 'nobody new');
  const parser = reqs.slice(n0).find(r => r.role === 'parser');
  assert.match(parser.body.system, /`new:` is never used for a person/);
  assert.ok(parser.body.messages[0].content.includes(`\nEVERYONE ELSE IN TOWN (not met yet; nobody else exists): `) && parser.body.messages[0].content.includes(`${c.wife.id} — ${c.wife.name} (she/her; ${c.wife.role}; wife of ${c.husband.name}`), 'the parser hears the whole cast');
  // The narrator: the style block, the town, then the cast, all cached; the cast line for Mavis gives her age, says whose wife she is and where she is.
  const narr = reqs.slice(n0).find(r => r.role === 'narrator');
  assert.equal(narr.body.system.length, 3);
  assert.ok(narr.body.system.every(b => b.type === 'text' && b.cache_control && b.cache_control.type === 'ephemeral'));
  assert.equal(narr.body.system[0].text, await page.evaluate(() => Game.Style.systemPrompt()));
  assert.equal(narr.body.system[1].text, await page.evaluate(() => Game.Pipeline.townBlock()));
  const cast = narr.body.system[2].text;
  assert.equal(cast, await page.evaluate(() => Game.Pipeline.castBlock()));
  const age = await page.evaluate(id => Game.State.npc(id).age, c.wife.id);
  assert.ok(cast.includes(`\n${c.wife.id} — ${c.wife.name} (${age}, she/her; ${c.wife.role}; wife of ${c.husband.name}`), cast.split('\n').find(l => l.startsWith(c.wife.id)));
  assert.match(cast, /is one of the people above or does not exist/);
  assert.match(cast, /\nNOT IN TOWN \(they can be talked about, but they never appear\): /);
  // The dead and the far away are in the cast block with when they died or where they live, after the people in town.
  const absent = await page.evaluate(() => Game.state.npcs.filter(n => Game.presenceOf(n) !== 'here').map(n => ({ id: n.id, name: n.name, age: n.age, died: n.died, where: n.where, dead: Game.presenceOf(n) === 'dead' })));
  assert.ok(absent.length);
  const notIn = cast.indexOf('\nNOT IN TOWN');
  for (const n of absent) {
    const at = cast.indexOf(`\n${n.id} — ${n.name} (${n.age}, `);
    assert.ok(at > notIn, n.id + ' is listed under NOT IN TOWN');
    assert.ok(cast.slice(at).split('\n')[1].includes(n.dead ? `dead: ${n.died}` : `lives elsewhere: ${n.where}`), n.id);
  }
  // A stranger the player describes: nobody like that, nothing made.
  queue('parser', parseReply({ actionType: 'talk', targets: ['new:woman at the pumps'], summary: 'Waves at a woman at the pumps' }));
  await sendText(page, 'I wave at the woman at the pumps');
  assert.equal(await page.evaluate(() => Game.state.npcs.length), c.count, 'still nobody new');
  assert.match(reqs.filter(r => r.role === 'narrator').pop().body.messages[0].content, /\nNOT PRESENT: woman \(does not exist in this town; it is simply not there\)\./);
  // The cast block is byte-identical turn to turn, so the cache holds.
  const casts = reqs.filter(r => r.role === 'narrator').map(r => r.body.system[2].text);
  assert.equal(new Set(casts).size, 1);
  assert.equal(new Set(reqs.filter(r => r.role === 'narrator').map(r => r.body.system[1].text)).size, 1, 'the town block never changes');
  // A bookkeeper reply that tries to add a person anyway (the schema no longer offers it): refused, nothing added.
  queue('bookkeeper', bookReply({ peopleRevealed: [{ name: 'Earl Toler', pronouns: 'he', relationToNpcId: '', who: 'brother' }] }));
  await sendText(page, 'I ask the ferryman about his brother');
  assert.equal(await page.evaluate(() => Game.state.npcs.length), c.count);
  assert.match(await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'rejected' && /^peopleRevealed/.test(d.path || '')).map(d => d.reason).join(' | ')), /the cast is fixed/);
});

s.run();
