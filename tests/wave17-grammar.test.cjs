'use strict';
/* Wave 17 (31 Oct 2026): the API refused the bookkeeper's record_changes
   schema for every turn ("The compiled grammar is too large", HTTP 400), so
   nothing a turn changed was recorded. The schema is back to the shape known
   to pass live (41 properties, the enums down to four), npcFates and
   memoriesSettled cross the wire as "npc_id: ..." strings that
   Api.recordFromWire turns into the engine's objects, and when the API ever
   refuses the grammar again the bookkeeper asks once more with the core
   fields only. Live mode against a routed endpoint; nothing leaves the page.
   Run with: node tests/run.cjs wave17 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');

const s = suite('wave17-grammar');
const API = 'https://api.anthropic.com/v1/messages';
const KEY = 'sk-ant-test-0123456789';
const GRAMMAR = 'The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.';

function roleOf(body) {
  if (body.stream) return 'narrator';
  const sc = body.output_config && body.output_config.format && body.output_config.format.schema;
  if (sc && sc.properties && sc.properties.actionType) return 'parser';
  if (sc && sc.properties && sc.properties.attitudeChanges) return 'bookkeeper';
  return 'chronicle';
}
const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const message = text => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: USAGE }) });
const error = (status, type, msg) => ({ status, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type, message: msg } }) });
function sse(parts) {
  const ev = [
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
  ];
  for (const p of parts) ev.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } });
  ev.push({ type: 'content_block_stop', index: 0 });
  ev.push({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_details: null }, usage: { output_tokens: 42 } });
  ev.push({ type: 'message_stop' });
  return { status: 200, contentType: 'text/event-stream', body: ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') };
}
const PARSE = { actionType: 'talk', summary: 'Asks about the river', targets: [], aboutIds: [], destinationId: null, moveWhen: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false };
const FULL = { attitudeChanges: [], newMemories: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], placesRevealed: [], npcFates: [], memoriesSettled: [], obligationsSettled: [], journalEntry: null };

/* A live game against the route: every parser call answers PARSE, every
   narrator call a short scene, and the bookkeeper calls come from `book`,
   a function of (body, n) returning a reply; reqs collects every request. */
async function openLive(h, book) {
  const page = await h.open({ viewport: LAPTOP });
  const reqs = [];
  await page.route(API, async route => {
    const body = JSON.parse(route.request().postData());
    const role = roleOf(body);
    const n = reqs.filter(r => r.role === role).length + 1;
    reqs.push({ role, n, body });
    const out = role === 'parser' ? message(JSON.stringify(PARSE)) : role === 'narrator' ? sse(['The river is high tonight. ', 'Nobody says much.']) : role === 'bookkeeper' ? book(body, n) : message('Summary.');
    return route.fulfill({ status: out.status, headers: { 'content-type': out.contentType, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': `req_${role}_${n}` }, body: out.body });
  });
  await quickStart(page);
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  return { page, reqs };
}
const count = node => { let props = 0; const walk = x => { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (x.type === 'object' && x.properties) props += Object.keys(x.properties).length; Object.values(x).forEach(walk); } }; walk(node); return props; };

s.test('the schema: 41 properties and four enums (the shape known to pass the grammar limit), fates and settled memories as "npc_id: ..." strings, a core schema of the thirteen essentials; the parser untouched', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const r = await page.evaluate(() => ({ rc: Game.Api.SCHEMAS.record_changes, core: Game.Api.SCHEMAS.record_changes_core, fields: Game.Api.RECORD_CORE_FIELDS, parse: Game.Api.SCHEMAS.parse_action }));
  assert.equal(count(r.rc), 41);
  let enums = 0; const walk = x => { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (Array.isArray(x.enum)) enums += 1; Object.values(x).forEach(walk); } }; walk(r.rc);
  assert.equal(enums, 4, 'weight, place type, place kind and the nullable thread status');
  assert.equal(r.rc.properties.npcFates.items.type, 'string');
  assert.equal(r.rc.properties.memoriesSettled.items.type, 'string');
  assert.deepEqual(r.rc.properties.clockNudges.items.properties.delta, { type: 'integer', description: '1 when the action helps the aim, -1 when it hinders it' });
  assert.equal(r.rc.properties.newSeeds.items.properties.triggerType.type, 'string');
  assert.ok(!('enum' in r.rc.properties.newSeeds.items.properties.triggerType));
  assert.deepEqual(r.fields, ['attitudeChanges', 'newMemories', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'playerLocationId', 'npcKnownToPlayer', 'rumoursHeard', 'npcFates', 'memoriesSettled', 'obligationsSettled', 'journalEntry']);
  assert.deepEqual(Object.keys(r.core.properties), r.fields);
  assert.deepEqual(r.core.required, r.fields);
  assert.equal(r.core.additionalProperties, false);
  assert.equal(count(r.core), 18);
  assert.equal(count(r.parse), 13);
});

s.test('Api.recordFromWire: "npc_id: hurt" and "npc_id: text" become the engine\'s objects (a dash or a space does too), objects pass through, a clock delta is 1 or -1 and 0 is dropped, a core reply gets its missing fields empty, a string with no id is left for State.apply to reject', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const r = await page.evaluate(() => {
    const f = Game.Api.recordFromWire;
    return {
      strings: f({ npcFates: ['npc_wade: hurt', 'NPC_LYMAN - Dead', 'npc_carter gone', 'npc_royce: Arrested.'], memoriesSettled: ['npc_curtis: Loaned Joe $15; he owes me $30 tonight', 'npc_jodie — tipped me twenty for sitting with him'] }),
      objects: f({ npcFates: [{ npcId: 'npc_wade', status: 'hurt' }], memoriesSettled: [{ npcId: 'npc_curtis', text: 'owes me' }] }),
      clocks: f({ clockNudges: [{ factionId: 'fac_a', delta: 3 }, { factionId: 'fac_b', delta: -2 }, { factionId: 'fac_c', delta: 0 }, { factionId: 'fac_d', delta: 'x' }] }).clockNudges,
      core: f({ attitudeChanges: [], newMemories: [], goldDelta: -4, hpDelta: null, itemsGained: [], itemsLost: [], playerLocationId: null, npcKnownToPlayer: [], rumoursHeard: [], npcFates: [], memoriesSettled: [], obligationsSettled: [], journalEntry: 'Paid.' }),
      junk: f({ npcFates: ['the old man is hurt'], memoriesSettled: ['nothing'] }),
      notObject: f(null)
    };
  });
  assert.deepEqual(r.strings.npcFates, [{ npcId: 'npc_wade', status: 'hurt' }, { npcId: 'npc_lyman', status: 'dead' }, { npcId: 'npc_carter', status: 'gone' }, { npcId: 'npc_royce', status: 'arrested' }]);
  assert.deepEqual(r.strings.memoriesSettled, [{ npcId: 'npc_curtis', text: 'Loaned Joe $15; he owes me $30 tonight' }, { npcId: 'npc_jodie', text: 'tipped me twenty for sitting with him' }]);
  assert.deepEqual(r.objects.npcFates, [{ npcId: 'npc_wade', status: 'hurt' }]);
  assert.deepEqual(r.objects.memoriesSettled, [{ npcId: 'npc_curtis', text: 'owes me' }]);
  assert.deepEqual(r.clocks, [{ factionId: 'fac_a', delta: 1 }, { factionId: 'fac_b', delta: -1 }]);
  assert.deepEqual(Object.keys(r.core).sort(), Object.keys(FULL).sort(), 'every field present');
  assert.deepEqual(r.core.conditionsAdded, []); assert.deepEqual(r.core.placesRevealed, []); assert.equal(r.core.goldDelta, -4); assert.equal(r.core.journalEntry, 'Paid.');
  assert.deepEqual(r.junk.npcFates, [{ npcId: 'the old man is hurt', status: '' }]);
  assert.deepEqual(r.junk.memoriesSettled, [{ npcId: 'nothing', text: '' }]);
  assert.equal(r.notObject, null);
});

s.test('live: a full-schema reply with "npc_id: hurt" and a settled memory as strings is recorded (the person is laid up, the memory gone); the turn carries no "not recorded"', async h => {
  let who = null;
  const { page, reqs } = await openLive(h, () => message(JSON.stringify(Object.assign({}, FULL, { npcFates: [`${who.id}: hurt`], memoriesSettled: [`${who.id}: watched me lose at cards`], goldDelta: -3, journalEntry: 'A rough night.' }))));
  who = await page.evaluate(() => {
    const s = Game.state;
    const here = Game.State.npcsAt(s.player.locationId, s.time.phase).filter(n => n.alive !== false);
    const n = here[0];
    Game.State.apply({ newMemories: [{ npcId: n.id, text: 'watched me lose at cards and laughed', weight: 2 }] });
    return { id: n.id, name: n.name, memories: Game.State.npc(n.id).memories.length, gold: s.player.gold };
  });
  assert.ok(who && who.memories >= 1);
  await sendText(page, 'I ask about the river');
  const r = await page.evaluate(id => { const n = Game.State.npc(id); const e = Game.state.log[Game.state.log.length - 1]; return { hurt: n.hurtUntilDay, memories: n.memories.map(m => m.text), gold: Game.state.player.gold, changes: e.changes || null, journal: Game.state.journal[Game.state.journal.length - 1].text, rejected: Game.State.debugLog.filter(d => d.kind === 'rejected').map(d => d.reason), book: Game.State.debugLog.filter(d => d.kind === 'bookkeeper').map(d => d.reason) }; }, who.id);
  assert.equal(r.hurt, (await page.evaluate(() => Game.state.time.day)) + 2, `${who.name} is laid up: ` + JSON.stringify(r));
  assert.ok(!r.memories.some(t => /watched me lose/.test(t)), 'the memory is settled: ' + JSON.stringify(r.memories));
  assert.equal(r.gold, who.gold - 3);
  assert.equal(r.changes, null);
  assert.equal(r.journal, 'A rough night.');
  assert.deepEqual(r.book, []);
  assert.equal(reqs.filter(x => x.role === 'bookkeeper').length, 1);
  const feed = await page.innerText('#feed');
  assert.ok(!feed.includes('could not be recorded'), 'no failure notice');
});

s.test('live: the API refusing the grammar (400 "compiled grammar is too large") is asked once more with the core schema, the reply is recorded, the debug log says so, and no failure notice is shown; any other 400 still fails the turn\'s bookkeeping', async h => {
  const { page, reqs } = await openLive(h, (body, n) => {
    const sc = body.output_config.format.schema;
    if (Object.keys(sc.properties).length > 13) return error(400, 'invalid_request_error', GRAMMAR);
    return message(JSON.stringify({ attitudeChanges: [], newMemories: [], goldDelta: -2, hpDelta: null, itemsGained: [], itemsLost: [], playerLocationId: null, npcKnownToPlayer: [], rumoursHeard: [], npcFates: [], memoriesSettled: [], obligationsSettled: [], journalEntry: 'Paid two dollars.' }));
  });
  const gold = await page.evaluate(() => Game.state.player.gold);
  await sendText(page, 'I ask about the river');
  const books = reqs.filter(x => x.role === 'bookkeeper');
  assert.equal(books.length, 2, 'the full schema, then the core');
  assert.equal(count(books[0].body.output_config.format.schema), 41);
  assert.deepEqual(Object.keys(books[1].body.output_config.format.schema.properties), ['attitudeChanges', 'newMemories', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'playerLocationId', 'npcKnownToPlayer', 'rumoursHeard', 'npcFates', 'memoriesSettled', 'obligationsSettled', 'journalEntry']);
  assert.equal(books[1].body.system, books[0].body.system, 'the same system prompt');
  const r = await page.evaluate(() => ({ gold: Game.state.player.gold, changes: Game.state.log[Game.state.log.length - 1].changes || null, journal: Game.state.journal[Game.state.journal.length - 1].text, api: Game.State.debugLog.filter(d => d.kind === 'api').map(d => d.reason), book: Game.State.debugLog.filter(d => d.kind === 'bookkeeper').map(d => d.reason) }));
  assert.equal(r.gold, gold - 2);
  assert.equal(r.changes, null);
  assert.equal(r.journal, 'Paid two dollars.');
  assert.deepEqual(r.book, []);
  assert.ok(r.api.some(x => /refused the record_changes grammar as too large; asking again with the core fields only/.test(x)), JSON.stringify(r.api));
  assert.ok(r.api.some(x => /^invalid_request_error: The compiled grammar is too large/.test(x)), 'the refusal itself is logged: ' + JSON.stringify(r.api));
  let feed = await page.innerText('#feed');
  assert.ok(!feed.includes('could not be recorded'), 'no failure notice');

  // Another 400 is not a grammar refusal: no core call. The turn's call fails, the usual background retry fails the same way
  // (both with the full schema), the turn stays not recorded and the notice shows.
  const { page: p2, reqs: r2 } = await openLive(h, () => error(400, 'invalid_request_error', 'messages: text content blocks must be non-empty'));
  await sendText(p2, 'I ask about the river');
  for (let i = 0; i < 50 && r2.filter(x => x.role === 'bookkeeper').length < 2; i++) await new Promise(res => setTimeout(res, 100));
  const b2 = r2.filter(x => x.role === 'bookkeeper');
  assert.equal(b2.length, 2, 'the turn\'s call and the background retry, nothing else');
  for (const b of b2) assert.equal(count(b.body.output_config.format.schema), 41, 'never the core schema for another 400');
  await p2.waitForFunction(() => Game.State.debugLog.some(d => d.kind === 'bookkeeper' && /the retry failed too/.test(d.reason)), null, { timeout: 10000 });
  const q = await p2.evaluate(() => ({ changes: Game.state.log[Game.state.log.length - 1].changes || null, book: Game.State.debugLog.filter(d => d.kind === 'bookkeeper').map(d => d.reason) }));
  assert.equal(q.changes, 'not recorded');
  assert.ok(q.book.some(x => /the bookkeeper failed: invalid_request_error/.test(x)), JSON.stringify(q.book));
  assert.ok(q.book.some(x => /the retry failed too \(invalid_request_error\)/.test(x)), JSON.stringify(q.book));
  feed = await p2.innerText('#feed');
  assert.ok(feed.includes('What changed this turn could not be recorded yet'));
});

s.run();
