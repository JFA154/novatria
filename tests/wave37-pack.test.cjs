'use strict';
/* Wave 37, Creator Mode, milestone 1: Low Water is a Story Pack now (the
   inert JSON element pack-low-water, from packs/low-water.json), read
   through the Pack module, and the owner's rule for that move is "zero
   behaviour change. Prove it with a snapshot test showing that both styles'
   system prompts and the town and cast blocks are byte-identical to
   before". tests/fixtures/prompts-v36.json is that before: commit 74cd698's
   game, quick-started with seed 12345 and the tests' default character
   (tests/fixtures/make-prompt-snapshot.cjs). Every comparison here is of
   the whole string, never a prefix, and a mismatch prints where the two
   first differ. Also: the built-in pack itself (parsed, frozen, valid under
   the strict profile), its text against the file, its hash, the twelve
   names of Game.data, the one JSON block in index.html, setPreview and the
   two layers of Pack.lookup so far.
   Run with: node tests/run.cjs wave37-pack */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { suite, quickStart, fixtures, ROOT, GAME_PATH } = require('./helpers.cjs');

const s = suite('wave37-pack');
const FIXTURE = require('./fixtures/prompts-v36.json');
const PACK_FILE = path.join(ROOT, 'packs', 'low-water.json');

/* Whole-string equality; on a mismatch, the first differing index and 80
   characters from there on each side, so a failure says where, not just that. */
function sameText(actual, expected, what) {
  assert.equal(typeof actual, 'string', what + ' is a string');
  if (actual === expected) return;
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  const ctx = t => JSON.stringify(t.slice(Math.max(0, i - 20), i + 80));
  assert.fail(`${what} differs from the v36 snapshot at index ${i} (lengths ${actual.length} now, ${expected.length} before)\n`
    + `        now:    ${ctx(actual)}\n        before: ${ctx(expected)}`);
}

/* The tests' default quick start, as the snapshot made it: the mock with no
   delay, the arrival's own turn over, the mock's call list emptied (the
   arrival's narrate call is not a turn). */
async function startAsSnapshot(page) {
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page, { seed: FIXTURE.playthrough.seed });
  await page.waitForFunction(() => !Game.Pipeline.busy);
  await page.evaluate(() => { Game.Api.Mock.calls.length = 0; });
}

s.test('the built-in pack parses once, is Low Water in pack format 1, is frozen to the leaves, validates clean under the strict profile, and its world is the town Game.data.TOWN_DATA has always been', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const world = b.world;
    const loc = world.locations.find(l => l.exits && l.exits.length);
    const npc = world.npcs.find(n => Array.isArray(n.relations) && n.relations.length);
    return {
      same: P.builtIn() === b,
      id: b.meta.id, format: b.packFormat,
      frozen: [Object.isFrozen(b), Object.isFrozen(world), Object.isFrozen(world.locations), Object.isFrozen(loc), Object.isFrozen(loc.exits),
        Object.isFrozen(npc.relations[0]), Object.isFrozen(world.tables.items.goods[0]), Object.isFrozen(b.player.backgrounds[0].stats)],
      // A write to the frozen pack throws in strict mode (the page's own code is strict; this function is not, so ask in strict mode).
      throws: (() => { 'use strict'; try { world.locations[0].name = 'Elsewhere'; return false; } catch (e) { return e instanceof TypeError; } })(),
      problems: P.validate(b, { profile: 'strict' }),
      counts: ['locations', 'npcs', 'factions', 'threads', 'seeds', 'rumours'].map(k => world[k].length),
      // The keys the pack's world adds to the old TOWN_DATA (plan decision F): the content constants that were beside it, and the two place labels.
      added: ['tables', 'grudgeTemplates', 'favourTemplates', 'law', 'gates'].filter(k => k in world),
      labels: world.locations.filter(l => 'typeLabel' in l).map(l => l.id).sort(),
      isWorld: Game.data.TOWN_DATA === b.world
    };
  });
  assert.equal(r.same, true, 'parsed once: the same object every call');
  assert.equal(r.id, 'low-water');
  assert.equal(r.format, 1);
  assert.deepEqual(r.frozen, [true, true, true, true, true, true, true, true], 'frozen at every level');
  assert.equal(r.throws, true, 'a write to the built-in pack throws');
  assert.deepEqual(r.problems, [], 'no problem at all under the strict profile');
  // The counts tests/validate-town.cjs printed for today's town: 38 places, 66 people, 3 factions, 3 threads, 10 seeds, 20 rumours.
  assert.deepEqual(r.counts, [38, 66, 3, 3, 10, 20]);
  assert.deepEqual(r.added, ['tables', 'grudgeTemplates', 'favourTemplates', 'law', 'gates']);
  assert.deepEqual(r.labels, ['loc_bluff', 'loc_town_hall']);
  assert.equal(r.isWorld, true, 'Game.data.TOWN_DATA is the built-in pack\'s world');
});

s.test('byte identity: both styles\' system prompts, the town and cast blocks and the parser, bookkeeper, memories and chronicle prompts are the v36 snapshot\'s, whole string for whole string', async h => {
  const page = await h.open();
  await startAsSnapshot(page);
  const now = await page.evaluate(() => ({
    casual: Game.Style.systemPrompt('casual'),
    literary: Game.Style.systemPrompt('literary'),
    town: Game.Pipeline.townBlock(),
    cast: Game.Pipeline.castBlock(),
    parser: Game.Api.SYSTEM.parser,
    bookkeeper: Game.Api.SYSTEM.bookkeeper,
    memories: Game.Api.SYSTEM.memories,
    chronicle: Game.Api.SYSTEM.chronicle
  }));
  for (const k of ['casual', 'literary', 'town', 'cast', 'parser', 'bookkeeper', 'memories', 'chronicle']) sameText(now[k], FIXTURE[k], k);
});

s.test('a seeded ten-input mock playthrough is the v36 snapshot\'s: the first packet, the log, journal, clock, player, turn, rng calls and the whole state but its one wall-clock field', async h => {
  const page = await h.open();
  await startAsSnapshot(page);
  const errs = [];
  for (const text of FIXTURE.playthrough.inputs) {
    // As the snapshot: a refusal or a mock error is part of the record, so keep going whatever happened.
    errs.push(await page.evaluate(t => Game.Pipeline.submit(t, { mode: 'do' }).then(() => null, e => String(e && e.message || e)), text));
    await page.waitForFunction(() => !Game.Pipeline.busy);
  }
  const r = await page.evaluate(() => {
    const st = Game.state;
    const calls = Game.Api.Mock.calls.filter(c => c.method === 'narrate');
    const copy = JSON.parse(JSON.stringify(st));
    // The snapshot's normalisation (playthrough.normalised): meta.createdAt is new Date() at newState, the one wall-clock write.
    delete copy.meta.createdAt;
    const labels = st.locations.filter(l => 'typeLabel' in l).map(l => [l.id, l.typeLabel]);
    // Plan decision F, the one planned data move: the two labels moved from UI.PLACE_LABELS into the pack's world, so they are
    // the one key a milestone 1 game carries that a pre-wave game did not (nothing the player sees changes). Removed on the
    // live side only, after the assertion below pins them to exactly these two places.
    for (const l of copy.locations) delete l.typeLabel;
    const p = st.player;
    return {
      labels,
      packet: calls.length ? calls[0].text : null,
      log: st.log, journal: st.journal, time: st.time,
      player: { hp: p.hp, gold: p.gold, inventory: p.inventory, conditions: p.conditions, storyPoints: p.storyPoints, locationId: p.locationId },
      turn: st.meta.turn, rngCalls: st.meta.rngCalls, stateJson: JSON.stringify(copy)
    };
  });
  const P = FIXTURE.playthrough;
  assert.deepEqual(P.normalised, ['meta.createdAt (removed)'], 'the fixture normalised only what this test removes');
  sameText(r.packet, FIXTURE.firstPacket, 'the first turn\'s narrator packet');
  assert.deepEqual(r.log, P.log);
  assert.deepEqual(r.journal, P.journal);
  assert.deepEqual(r.time, P.time);
  assert.deepEqual(r.player, P.player);
  assert.equal(r.turn, P.turn);
  assert.equal(r.rngCalls, P.rngCalls);
  // First, so the typeLabel normalisation cannot hide anything wider.
  assert.deepEqual(r.labels.sort(), [['loc_bluff', 'Bluff'], ['loc_town_hall', 'Town hall']], 'typeLabel on exactly the two places of decision F');
  sameText(r.stateJson, P.stateJson, 'the whole state as JSON (createdAt removed); turn errors: ' + JSON.stringify(errs));
});

s.test('Pack.format of the built-in pack is packs/low-water.json byte for byte, and node tests/pack-inline.cjs --check passes', async h => {
  const page = await h.open();
  const text = await page.evaluate(() => Game.Pack.format(Game.Pack.builtIn()));
  sameText(text, fs.readFileSync(PACK_FILE, 'utf8'), 'Pack.format(builtIn)');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'pack-inline.cjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, 'pack-inline --check: ' + (r.stdout || '') + (r.stderr || ''));
});

s.test('Pack.hash is sixteen lowercase hex characters and the same whatever the order of the pack\'s keys', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const reversed = {};
    for (const k of Object.keys(b).reverse()) reversed[k] = b[k];
    return { hash: P.hash(b), again: P.hash(b), reversed: P.hash(reversed), order: Object.keys(reversed).join() !== Object.keys(b).join() };
  });
  assert.match(r.hash, /^[0-9a-f]{16}$/);
  assert.equal(r.again, r.hash);
  assert.equal(r.order, true, 'the copy really has its keys in another order');
  assert.equal(r.reversed, r.hash);
});

s.test('Game.data still has its twelve names in the old order, and the tests\' fixtures() resolve the same town and places as before the wave', async h => {
  const page = await h.open();
  assert.deepEqual(await page.evaluate(() => Object.keys(Game.data)), [
    'TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES', 'GOAL_PRESETS',
    'STYLE_GUIDE_LITERARY', 'STYLE_GUIDE_CASUAL', 'EXAMPLE_TURNS_LITERARY', 'EXAMPLE_TURNS_CASUAL'
  ]);
  // What fixtures() resolved on commit 74cd698, the last build before the wave.
  assert.deepEqual(await fixtures(page), {
    town: 'Lockett\'s Ferry', currency: { symbol: '$', name: 'dollars' }, gateBg: 0, docksBg: 1,
    start: { gate: 'loc_pittmans', docks: 'loc_purvis_landing' },
    tavern: { id: 'loc_low_water', name: 'The Low Water', type: 'bar' },
    watch: { id: 'loc_town_hall', name: 'Town Hall', type: 'police' },
    slum: { id: 'loc_riverbend', name: 'Riverbend Trailer Park', type: 'trailerpark' }
  });
});

s.test('the three cached blocks estimate as the suite counts them (words times 1.4, rounded once): under the 13,000 budget and the snapshot\'s 12,999 for the casual style', async h => {
  const page = await h.open();
  await startAsSnapshot(page);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    // Joined with a space, the word counts add up, so tokenEstimate rounds the total once.
    return { est: P.tokenEstimate([Game.Style.systemPrompt('casual'), Game.Pipeline.townBlock(), Game.Pipeline.castBlock()].join(' ')), budget: P.TOKEN_BUDGET };
  });
  assert.equal(r.budget, 13000);
  assert.ok(r.est < r.budget, 'under the budget: ' + r.est);
  assert.equal(r.est, FIXTURE.blocksEstimate.casual);
  assert.equal(r.est, 12999);
});

s.test('index.html carries exactly one JSON pack element, which is packs/low-water.json and holds no closing script tag, and none of the old content constants', async () => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const OPEN = '<script type="application/json" id="pack-low-water">';
  assert.equal(html.split(OPEN).length - 1, 1, 'one pack-low-water element');
  assert.equal(html.split('<script type="application/json"').length - 1, 1, 'and no other JSON block');
  const start = html.indexOf('<script type="application/json"');
  const body = html.slice(start, html.indexOf('</script>', start));
  assert.doesNotMatch(body, /<\/script/i, 'nothing in the block could close the element early');
  assert.deepEqual(JSON.parse(body.slice(OPEN.length)), JSON.parse(fs.readFileSync(PACK_FILE, 'utf8')));
  for (const gone of ['const TOWN_DATA = {', 'const TABLES = {', '// ===== BEGIN CONTENT =====', 'module.exports']) assert.ok(!html.includes(gone), 'no ' + gone);
});

s.test('Pack.setPreview(builtIn) makes the current pack an unfrozen copy that Game.data.TOWN_DATA reads, and setPreview(null) points back at the frozen built-in pack', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    P.setPreview(b);
    const during = {
      current: P.current() !== b, frozen: Object.isFrozen(Game.data.TOWN_DATA) || Object.isFrozen(Game.data.TOWN_DATA.locations[0]),
      reads: Game.data.TOWN_DATA === P.current().world, notBuiltIn: Game.data.TOWN_DATA !== b.world,
      tables: Game.data.TABLES === P.current().world.tables, backgrounds: Game.data.BACKGROUNDS === P.current().player.backgrounds
    };
    P.setPreview(null);
    return { during, after: { current: P.current() === b, world: Game.data.TOWN_DATA === b.world, tables: Game.data.TABLES === b.world.tables } };
  });
  assert.deepEqual(r.during, { current: true, frozen: false, reads: true, notBuiltIn: true, tables: true, backgrounds: true });
  assert.deepEqual(r.after, { current: true, world: true, tables: true });
});

s.test('Pack.lookup so far: a narration preset Low Water omits comes from the engine default, the title from the pack, and an unknown path from nowhere', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const guide = P.lookup('narration.presets.casual.guide');
    return { guide: [guide.layer, guide.value === Game.data.STYLE_GUIDE_CASUAL], title: P.lookup('meta.title').layer, none: P.lookup('nothing.here') };
  });
  assert.deepEqual(r.guide, ['default', true]);
  assert.equal(r.title, 'pack');
  assert.deepEqual(r.none, { value: undefined, layer: 'none', path: 'nothing.here' });
});

// The validator's own tests (M1-E) follow.

s.run();
