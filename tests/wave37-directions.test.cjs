'use strict';
/* Wave 37, Creator Mode, milestone 3 (task M3-C; plan decision E): a story's
   author directs how a situation is told. pack.directions.<situation> set at
   the pack layer (or, for the intimate scene, the player's override) reaches
   the narrator's packet as a DIRECTION line just before MODE, with the
   ENGINE trailer saying the code already decided what happened; the
   intimate direction keeps replacing the MODE text and gets the trailer
   right after it. pack.prompts.parserExtra and bookkeeperExtra reach those
   two system prompts as CREATOR NOTES, with the short ENGINE RULES last
   (Api.systemFor). With none set, nothing changes: the built-in pack's
   packets and prompts are the v36 snapshot's (tests/wave37-pack.test.cjs
   pins them whole; here, the first packet again and the absence of the
   new lines).
   Run with: node tests/run.cjs wave37-directions */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');

const s = suite('wave37-directions');
const FIXTURE = require('./fixtures/prompts-v36.json');
const ENGINE = "ENGINE: the code already decided this turn's outcome (ROLL, OUTCOME, COMPLICATION above); the direction shapes how it is told, never what happened.";
const DIRECTION = "DIRECTION (from the story's author): ";
const API = 'https://api.anthropic.com/v1/messages';
const KEY = 'sk-ant-test-0123456789';

/* The built-in pack, copied, with these directions (and prompt extras), as
   the editor's preview: Pack.current() for the rest of the page's life. */
function preview(page, directions, prompts) {
  return page.evaluate(([d, p]) => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    if (d) c.directions = d;
    if (p) c.prompts = p;
    P.setPreview(c);
  }, [directions || null, prompts || null]);
}
async function start(page, opts) {
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, opts || {});
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
}
/* One mock turn with this parse (and a forced tier when given); the turn's
   narrator packet, split into lines, with the index of MODE. */
function turn(page, parse, tier, input) {
  return page.evaluate(async ([p, t, text]) => {
    const G = Game;
    const here = G.State.npcsAt(G.state.player.locationId).map(n => n.id);
    const parse = Object.assign({ summary: text, targets: [], needsRoll: false, timeCost: 'instant' }, p);
    if (parse.targets === 'here') parse.targets = here.slice(0, 1);
    if (t) G.Pipeline.hooks.nextTier = t;
    G.Api.Mock.queue('parse', parse);
    G.Api.Mock.calls.length = 0;
    await G.Pipeline.submit(text, { mode: 'do' });
    await G.Pipeline.whenIdle();
    const call = G.Api.Mock.calls.filter(c => c.method === 'narrate').pop();
    const lines = call ? call.text.split('\n') : [];
    return { lines, mode: lines.findIndex(l => l.startsWith('MODE:')), roll: (lines.find(l => l.startsWith('ROLL:')) || '') };
  }, [parse, tier || null, input || 'I do it.']);
}
const news = lines => lines.filter(l => l.startsWith('DIRECTION') || l.startsWith('ENGINE:'));

s.test('with no direction set, nothing changes: the first packet of the v36 playthrough is the snapshot\'s byte for byte, every turn\'s packet has no DIRECTION or ENGINE line, and Api.systemFor gives back each SYSTEM prompt itself', async h => {
  const page = await h.open();
  await start(page, { seed: FIXTURE.playthrough.seed });
  const r = await page.evaluate(async inputs => {
    const G = Game;
    G.Api.Mock.calls.length = 0;
    for (const t of inputs) { await G.Pipeline.submit(t, { mode: 'do' }).catch(() => null); await G.Pipeline.whenIdle(); }
    const packets = G.Api.Mock.calls.filter(c => c.method === 'narrate').map(c => c.text);
    const A = G.Api;
    return {
      first: packets[0], count: packets.length,
      extra: packets.filter(t => /^(DIRECTION|ENGINE)/m.test(t)).length,
      lines: G.Pipeline.directionLines({ mode: 'arrival', roll: { tier: 'failure', success: false }, timePassed: 'x', action: { actionType: 'attack' } }),
      same: ['parser', 'bookkeeper', 'chronicle', 'memories', 'people', 'clock', 'places'].map(k => [k, A.systemFor(k) === A.SYSTEM[k]]),
      unknown: A.systemFor('toString')
    };
  }, FIXTURE.playthrough.inputs);
  assert.equal(r.first, FIXTURE.firstPacket, 'the first turn\'s packet is the v36 snapshot\'s');
  assert.ok(r.count >= 8, 'the playthrough narrated: ' + r.count);
  assert.equal(r.extra, 0, 'no DIRECTION or ENGINE line in any packet');
  assert.deepEqual(r.lines, [], 'every situation at once, and no direction: no lines');
  assert.deepEqual(r.same, [['parser', true], ['bookkeeper', true], ['chronicle', true], ['memories', true], ['people', true], ['clock', true], ['places', true]]);
  assert.equal(r.unknown, undefined, 'not a role: nothing');
});

s.test('a pack direction for a failed roll: a turn whose roll is forced to failure puts the DIRECTION line and the ENGINE trailer immediately before MODE; the same roll forced to success puts neither', async h => {
  const page = await h.open();
  await start(page, { kinds: [] });
  await preview(page, { rollFailure: 'Make failure sting.' });
  const search = { actionType: 'search', needsRoll: true, stat: 'wits', difficulty: 'normal' };
  // The success first: a failed roll locks the same ask against a retry (lastRollKey).
  const good = await turn(page, search, 'success', 'I search the shelf.');
  assert.match(good.roll, /· Success$/);
  assert.deepEqual(news(good.lines), [], 'a success: no direction and no trailer');
  const bad = await turn(page, search, 'failure', 'I search the counter.');
  assert.match(bad.roll, /· Failure$/);
  assert.deepEqual(bad.lines.slice(bad.mode - 2, bad.mode + 1), [DIRECTION + 'Make failure sting.', ENGINE, 'MODE: normal']);
  assert.ok(good.lines[good.mode - 1].startsWith('DUE EVENT:'), good.lines[good.mode - 1]);
});

s.test('each situation reaches its direction: arrival with firstTurn on a game\'s arrival (turn 0), combat then firstTurn then rollCritical on the first action (an attack, a natural 20), refusedByNpc then rollFailure on a failed ask, timeSkip on /wait, and arrival with timeSkip on a /skip to another place', async h => {
  const page = await h.open();
  const D = { combat: 'Fists, short.', rollCritical: 'Let the twenty land.', refusedByNpc: 'A no with a reason.', rollFailure: 'Sting.', timeSkip: 'Let the hours show.', arrival: 'Arrive tired.', firstTurn: 'Open cold.' };
  await start(page, { kinds: [] });
  await preview(page, D);
  const D_ = t => DIRECTION + t;
  /* The arrival's packet as Pipeline.arrival builds it for a live game (an
     offline start opens on the game's own text, with no narrator call), at
     turn 0. */
  const arrived = await page.evaluate(() => ({
    turn: Game.state.meta.turn,
    lines: Game.Pipeline.narratorPacket({ mode: 'arrival', action: { actionType: 'move', summary: 'arrives' }, due: [] }).split('\n')
  }));
  assert.equal(arrived.turn, 0);
  assert.deepEqual(news(arrived.lines), [D_('Arrive tired.'), D_('Open cold.'), ENGINE], 'the arrival is the first turn too');
  assert.equal(arrived.lines[arrived.lines.findIndex(l => l.startsWith('MODE:')) - 1], ENGINE);

  const crit = await turn(page, { actionType: 'attack', targets: 'here', needsRoll: true, stat: 'might', difficulty: 'normal' }, 'critical', 'I swing at them.');
  assert.match(crit.roll, /· Critical/);
  assert.deepEqual(news(crit.lines), [D_('Fists, short.'), D_('Open cold.'), D_('Let the twenty land.'), ENGINE], 'the first action, offline the narrator\'s first turn: combat, firstTurn, rollCritical, in the plan\'s order');

  const refused = await turn(page, { actionType: 'persuade', targets: 'here', needsRoll: true, stat: 'charm', difficulty: 'hard' }, 'failure', 'I ask for a lift to town.');
  assert.ok(refused.lines.some(l => l.startsWith('OUTCOME: the ask failed.')), 'the OUTCOME says the person refused');
  assert.deepEqual(news(refused.lines), [D_('A no with a reason.'), D_('Sting.'), ENGINE], 'turn 2: no firstTurn');

  const last = () => page.evaluate(() => { const c = Game.Api.Mock.calls.filter(x => x.method === 'narrate').pop(); return c ? c.text.split('\n') : []; });
  await page.evaluate(() => { Game.Api.Mock.calls.length = 0; });
  await sendText(page, '/wait evening');
  const waited = await last();
  assert.ok(waited.some(l => l.startsWith('TIME PASSED: ')), 'the /wait packet carries TIME PASSED');
  assert.deepEqual(news(waited), [D_('Let the hours show.'), ENGINE]);
  assert.equal(waited[waited.findIndex(l => l.startsWith('MODE:')) - 1], ENGINE);

  // The pipeline suite's /skip test picks its place the same way: open, not a bar, no phase word, not part of another place's name.
  const to = await page.evaluate(() => {
    const st = Game.state;
    const plain = n => n.toLowerCase().replace(/^the /, '');
    return st.locations.filter(l => l.id !== st.player.locationId && !l.closed && !['tavern', 'bar'].includes(l.type) && !/morning|afternoon|evening|night|noon|dusk|dawn/i.test(l.name)
      && !st.locations.some(o => o !== l && plain(l.name).includes(plain(o.name))))[0].name;
  });
  await page.evaluate(() => { Game.Api.Mock.calls.length = 0; });
  await sendText(page, `/skip to ${to} at night`);
  const skipped = await last();
  assert.ok(skipped.includes('MODE: arrival (ZOOM length allowed)'), 'a /skip to another place is an arrival: ' + skipped.slice(-3).join(' / '));
  assert.deepEqual(news(skipped), [D_('Arrive tired.'), D_('Let the hours show.'), ENGINE]);
});

s.test('the epilogue: an ending the town reaches is told in MODE epilogue with the pack\'s epilogue direction and the trailer just before it', async h => {
  const page = await h.open();
  await start(page);
  await preview(page, { epilogue: 'Close it quietly.' });
  const lines = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock;
    // The wave-2 suite's route to an ending: the flag the second inspection's ending waits on.
    G.State.apply({ effects: [{ op: 'setFlag', key: 'secondInspectionOrdered', value: true }] });
    M.calls.length = 0;
    M.queue('parse', { actionType: 'wait', summary: 'Waits a while', targets: [], needsRoll: false, timeCost: 'long' });
    await G.Pipeline.submit('I wait an hour');
    await G.Pipeline.whenIdle();
    await new Promise(res => setTimeout(res, 100));
    await G.Pipeline.whenIdle();
    const c = M.calls.filter(x => x.method === 'narrate' && /^MODE: epilogue/m.test(x.text)).pop();
    return c ? c.text.split('\n') : [];
  });
  const i = lines.findIndex(l => l.startsWith('MODE: epilogue'));
  assert.ok(i > 0, 'an epilogue was narrated');
  assert.deepEqual(lines.slice(i - 2, i), [DIRECTION + 'Close it quietly.', ENGINE]);
});

s.test('the situations the engine decides after the packet is built: a defeat (Permadeath off) and a death (Permadeath on) from ctx.defeated, and a card game from ctx.gamble, each in order before MODE', async h => {
  const page = await h.open();
  await start(page, { kinds: [] });
  await preview(page, { defeat: 'Down hard.', death: 'The end, plainly.', gamble: 'The table talks.' });
  const r = await page.evaluate(() => {
    const P = Game.Pipeline, St = Game.Storage;
    const pk = c => P.narratorPacket(Object.assign({ action: { summary: 'x', actionType: 'talk' } }, c)).split('\n').filter(l => /^(DIRECTION|ENGINE|MODE)/.test(l));
    const out = { defeat: pk({ defeated: true }), gamble: pk({ gamble: { played: true, seats: [] } }) };
    St.saveSettings({ permadeath: true });
    out.death = pk({ defeated: true });
    St.saveSettings({ permadeath: false });
    out.names = P.DIRECTION_SITUATIONS;
    return out;
  });
  assert.deepEqual(r.defeat, [DIRECTION + 'Down hard.', ENGINE, 'MODE: normal']);
  assert.deepEqual(r.death, [DIRECTION + 'The end, plainly.', ENGINE, 'MODE: normal']);
  assert.deepEqual(r.gamble, [DIRECTION + 'The table talks.', ENGINE, 'MODE: normal']);
  assert.deepEqual(r.names, ['combat', 'defeat', 'death', 'arrival', 'timeSkip', 'gamble', 'epilogue', 'firstTurn', 'refusedByNpc', 'rollFailure', 'rollCritical']);
});

/* The wave-36 intimate setup (tests/wave37-settings.test.cjs): Jodie at the
   Low Water at night, every gate met, asked to stay. */
function night(page) {
  return page.evaluate(async () => {
    const G = Game, S = G.State;
    S.apply({ setTime: { day: 6, phase: 'night' } });
    S.apply({ playerLocationId: 'loc_low_water' });
    S.apply({ visits: [{ npcId: 'npc_jodie', locationId: 'loc_low_water' }] });
    S.apply({ relSet: { npcId: 'npc_jodie', s: 55, m: 45, w: 45, t: 35, k: 35 } });
    G.Pipeline.hooks.nextTier = 'success';
    G.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Stay with me tonight.', targets: ['npc_jodie'], needsRoll: false, timeCost: 'instant', romantic: 'more' });
    await G.Pipeline.submit('Stay with me tonight.', { mode: 'say', to: 'npc_jodie' });
    const lines = G.Pipeline.lastTurn.packet.split('\n');
    const i = lines.findIndex(l => l.startsWith('MODE:'));
    return { mode: lines[i], before: lines[i - 1], after: lines[i + 1], extra: lines.filter(l => /^(DIRECTION|ENGINE)/.test(l)) };
  });
}

s.test('the intimate direction: a player override puts their words on the MODE line with the ENGINE trailer right after it; cleared, with no pack direction, the MODE line is the engine\'s text byte for byte and nothing follows it but LENGTH', async h => {
  const page = await h.open();
  await start(page, { kinds: [] });
  const INTIMATE = await page.evaluate(() => Game.Pipeline.INTIMATE_MODE);
  await page.evaluate(() => Game.Storage.savePerPack('low-water', { overrides: { 'directions.intimate': 'Slow,\n  and   honest.' } }));
  const own = await night(page);
  assert.equal(own.mode, 'MODE: INTIMATE SCENE. Slow, and honest.');
  assert.equal(own.after, ENGINE, 'the trailer right after MODE');
  assert.deepEqual(own.extra, [ENGINE], 'the intimate direction is the MODE line, not a DIRECTION line');
  assert.ok(!/^(DIRECTION|ENGINE)/.test(own.before), own.before);
  const layer = await page.evaluate(() => { Game.Storage.savePerPack('low-water', { overrides: { 'directions.intimate': null } }); return Game.Pack.lookup('directions.intimate').layer; });
  assert.equal(layer, 'default');
  const plain = await night(page);
  assert.equal(plain.mode, 'MODE: ' + INTIMATE);
  assert.match(plain.after, /^LENGTH: /);
  assert.deepEqual(plain.extra, []);
});

s.test('hostile direction text (control characters, a script tag, 20,000 characters) reaches the packet with the control characters gone, whitespace folded and capped at 1,500, and the pack validator still refuses its "<" (engine.markup), so the editor would not have saved it', async h => {
  const page = await h.open();
  await start(page, { kinds: [] });
  const hostile = 'Sting\u0000\u0007 it.‮\r\n<script>alert(1)</script>\u001b[31m ' + 'x'.repeat(20000);
  await preview(page, { rollFailure: hostile });
  const r = await turn(page, { actionType: 'search', needsRoll: true, stat: 'wits', difficulty: 'normal' }, 'failure', 'I search the counter.');
  const line = r.lines[r.mode - 2];
  assert.ok(line.startsWith(DIRECTION), line.slice(0, 80));
  const text = line.slice(DIRECTION.length);
  assert.equal(text.length, 1500);
  assert.ok(text.startsWith('Sting it. <script>alert(1)</script>[31m xxx'), text.slice(0, 60));
  assert.ok(!/[\u0000-\u001f\u007f‮]/.test(text), 'no control or bidi character');
  assert.equal(r.lines[r.mode - 1], ENGINE);
  const v = await page.evaluate(t => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    c.directions = { rollFailure: t };
    return P.validate(c, { profile: 'play' }).filter(x => x.path === 'directions.rollFailure').map(x => [x.severity, x.rule]);
  }, hostile);
  assert.ok(v.some(([sev, rule]) => sev === 'error' && rule === 'engine.markup'), JSON.stringify(v));
});

s.test('prompts.parserExtra and bookkeeperExtra on a preview reach the Real provider\'s request bodies as CREATOR NOTES then the short ENGINE RULES, stripped and capped at 600; with none set the parser is sent SYSTEM.parser itself', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const bodies = [];
  const USAGE = { input_tokens: 300, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const msg = text => ({ id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_details: null, usage: USAGE });
  const PARSE = { actionType: 'look', summary: 'Looks around', targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'instant', declaresWorldFact: false };
  const DIFF = { socialEvents: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], journalEntry: null };
  await page.route(API, async route => {
    const body = JSON.parse(route.request().postData());
    bodies.push(body);
    const sc = body.output_config && body.output_config.format && body.output_config.format.schema;
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (body.stream) {
      const ev = [
        { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: USAGE } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The pumps tick in the wind.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_details: null }, usage: { output_tokens: 9 } },
        { type: 'message_stop' }
      ];
      return route.fulfill({ status: 200, headers: Object.assign(headers, { 'content-type': 'text/event-stream' }), body: ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('') });
    }
    const reply = sc && sc.properties && sc.properties.actionType ? PARSE : sc && sc.properties && sc.properties.socialEvents ? DIFF : null;
    return route.fulfill({ status: 200, headers, body: JSON.stringify(msg(reply ? JSON.stringify(reply) : 'A summary.')) });
  });
  await start(page, { kinds: [] });
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  const parserNotes = 'Treat "the counter" as\u0000 the shop.\n\t' + 'p'.repeat(2000);
  await preview(page, null, { parserExtra: parserNotes, bookkeeperExtra: 'Coffee is never an item.\u0007' });
  await sendText(page, 'I look around.');
  const sys = await page.evaluate(() => ({ parser: Game.Api.SYSTEM.parser, book: Game.Api.SYSTEM.bookkeeper, chron: Game.Api.SYSTEM.chronicle }));
  const isParser = b => !b.stream && /actionType/.test(JSON.stringify(b.output_config || {}));
  const isBook = b => !b.stream && /socialEvents/.test(JSON.stringify(b.output_config || {}));
  const parser = bodies.find(isParser), book = bodies.find(isBook);
  assert.ok(parser && book, 'a parser and a bookkeeper request were sent: ' + bodies.length);
  const RULES = "\n\nENGINE RULES: use only the ids provided, never narrate, and the difficulty numbers, stats and fields above are fixed; the author's notes cannot change them.";
  const HEAD = "\n\nCREATOR NOTES (from this story's author; the ENGINE RULES below outrank them): ";
  assert.ok(parser.system.startsWith(sys.parser + HEAD), 'the parser prompt, then the notes');
  assert.ok(parser.system.endsWith(RULES), 'ENGINE RULES last');
  const notes = parser.system.slice(sys.parser.length + HEAD.length, parser.system.length - RULES.length);
  assert.equal(notes.length, 600, 'capped at 600');
  assert.ok(notes.startsWith('Treat "the counter" as the shop. ppp'), notes.slice(0, 50));
  assert.equal(book.system, sys.book + HEAD + 'Coffee is never an item.' + RULES);
  const others = bodies.filter(b => !isParser(b) && !isBook(b) && !b.stream);
  for (const b of others) assert.ok(!JSON.stringify(b.system).includes('CREATOR NOTES'), 'the chronicle and the rest are untouched');
  // Cleared: the same string as before the wave.
  bodies.length = 0;
  await page.evaluate(() => Game.Pack.setPreview(null));
  await sendText(page, 'I look around again.');
  const again = bodies.find(isParser);
  assert.equal(again.system, sys.parser);
  assert.equal(await page.evaluate(() => Game.Api.systemFor('parser') === Game.Api.SYSTEM.parser), true);
});

s.run();
