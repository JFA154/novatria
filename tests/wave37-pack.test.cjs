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
const os = require('os');
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
  // The counts the old Node validator printed for today's town: 38 places, 66 people, 3 factions, 3 threads, 10 seeds, 20 rumours.
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
/* Wave 37, Creator Mode (plan decision B): the old Node validator and its
   mentions check are gone; their checks are Pack.validate's rules, run
   in the page so the editor (milestone 5) checks a draft live with exactly
   what Node runs. Each case edits a copy of the built-in pack (Pack.copy:
   builtIn() is frozen) and must be reported at the field it is about, with
   a stable rule id, for the editor to anchor it. */
s.test('Pack.validate reports the old validator\'s checks with paths and rule ids: a dangling exit, an asymmetric relation, a minor on the romance list, a minor named in directions.intimate, an unknown effect op, a bad clock trigger, a rumour with one teller, a flag nothing sets, two example turns', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const find = (list, test, what) => { const i = list.findIndex(test); if (i < 0) throw new Error('no ' + what); return i; };
    const cases = [
      ['a dangling exit', 'engine.location.exit', 'exit "loc_nowhere" is not a location', p => {
        const i = find(p.world.locations, l => Array.isArray(l.exits) && l.exits.length, 'place with exits');
        p.world.locations[i].exits[0] = 'loc_nowhere';
        return 'world.locations[' + i + '].exits[0]';
      }],
      ['an asymmetric relation', 'engine.relation.symmetric', 'relations are written on both sides', p => {
        const i = find(p.world.npcs, n => Array.isArray(n.relations) && n.relations.length, 'person with relations');
        const n = p.world.npcs[i];
        const other = p.world.npcs[find(p.world.npcs, o => o.id === n.relations[0].npcId, n.relations[0].npcId)];
        other.relations = other.relations.filter(x => x.npcId !== n.id);
        return 'world.npcs[' + i + '].relations[0]';
      }],
      ['a minor on the romance list', 'engine.romance.minor', 'npc_kaylee is under 18: nobody under 18 is ever on the romance list', p => {
        p.world.romance.push({ npcId: 'npc_kaylee', sparkRate: 1, opensAt: { knows: 0 }, difficulty: 'normal' });
        return 'world.romance[' + (p.world.romance.length - 1) + '].npcId';
      }],
      ['a minor named in directions.intimate', 'engine.direction.minor', 'names npc_kaylee ("Kaylee"), who is under 18', p => {
        p.directions = { intimate: 'Keep it warm and brief, and fade out if Kaylee walks in.' };
        return 'directions.intimate';
      }],
      ['an unknown effect op', 'engine.effect.op', '"throwParty" is not one of the engine\'s effect ops', p => {
        const e = find(p.world.events, x => x.default && x.default.effects.length, 'event');
        p.world.events[e].default.effects[0].op = 'throwParty';
        return 'world.events[' + e + '].default.effects[0].op';
      }],
      ['a bad clock trigger', 'engine.trigger', 'the segment should be 1 to', p => {
        const i = find(p.world.seeds, x => x.trigger && x.trigger.type === 'day', 'seed on a day');
        p.world.seeds[i].trigger = { type: 'clock', value: p.world.factions[0].id + ':99' };
        return 'world.seeds[' + i + '].trigger.value';
      }],
      ['a rumour with one teller', 'engine.rumour.tellers', 'only npc_brianna can tell it', p => {
        const i = find(p.world.rumours, x => x.id === 'rum_mavis_cash_rooms', 'rum_mavis_cash_rooms');
        delete p.world.rumours[i].tellerIds;
        return 'world.rumours[' + i + '].tellerIds';
      }],
      ['a flag nothing sets', 'engine.flag.unset', 'reads the flag "royceDanced", which nothing in the pack sets', p => {
        const e = find(p.world.events, x => x.branches.some(b => b.when && Array.isArray(b.when.flagsSet)), 'event reading a flag');
        const b = find(p.world.events[e].branches, x => x.when && Array.isArray(x.when.flagsSet), 'branch reading a flag');
        p.world.events[e].branches[b].when.flagsSet[0] = 'royceDanced';
        return 'world.events[' + e + '].branches[' + b + '].when.flagsSet[0]';
      }],
      ['two example turns', 'engine.examples', 'should be 3 to 8 example turns; there are 2', p => {
        p.narration = { examples: JSON.parse(JSON.stringify(P.DEFAULTS.narration.presets.casual.examples.slice(0, 2))) };
        return 'narration.examples';
      }]
    ];
    return cases.map(([what, rule, says, edit]) => {
      const p = P.copy(P.builtIn());
      const path = edit(p);
      const list = P.validate(p, { profile: 'strict' });
      return { what, rule, says, path, hit: list.find(x => x.rule === rule && x.path === path) || null, all: list.map(x => `${x.severity} [${x.rule}] ${x.path}: ${x.message}`) };
    });
  });
  assert.equal(r.length, 9);
  for (const c of r) {
    assert.ok(c.hit, `${c.what}: expected ${c.rule} at ${c.path}; found ${c.all.join(' | ')}`);
    assert.ok(c.hit.message.includes(c.says), `${c.what}: ${c.hit.message}`);
    assert.equal(c.hit.severity, 'error', c.what);
  }
});

/* The profiles (plan decision B): a house rule (Low Water's numbers, the
   set meta.lints names) warns in play and stops a strict run, and does not
   run at all for a pack that has not opted in; an engine rule (what the game
   cannot run) is an error whatever the profile. The cast of 39 sends two of
   the 41 people in town away, written as the cast writes someone away
   (presence, status, where, reach, no home, no schedule; Colt off the
   romance list too), so the cast count is the only thing that changes. */
s.test('profiles: a cast of 39 and a clock of 12 segments are warnings in play and errors in strict, and nothing at all once meta.lints is emptied; an engine error is an error in both', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const brief = list => list.map(x => `${x.severity} [${x.rule}] ${x.path}`);
    const run = edit => {
      const p = P.copy(P.builtIn());
      edit(p);
      const lintless = P.copy(p);
      lintless.meta.lints = [];
      return { play: brief(P.validate(p, { profile: 'play' })), strict: brief(P.validate(p, { profile: 'strict' })), none: brief(P.validate(lintless, { profile: 'strict' })).concat(brief(P.validate(lintless, { profile: 'play' }))) };
    };
    return {
      here: P.builtIn().world.npcs.filter(n => (n.presence || 'here') === 'here').length,
      cast: run(p => {
        for (const id of ['npc_boyd', 'npc_colt']) {
          const n = p.world.npcs.find(x => x.id === id);
          Object.assign(n, { presence: 'away', status: 'gone', where: 'with family out of state', reach: 'a letter now and then', home: null });
          delete n.awayOn;
          for (const l of p.world.locations) for (const ph of Object.keys(l.npcIdsBySchedule || {})) l.npcIdsBySchedule[ph] = l.npcIdsBySchedule[ph].filter(x => x !== id);
        }
        p.world.romance = p.world.romance.filter(x => x.npcId !== 'npc_colt');
      }),
      clock: run(p => { const f = p.world.factions.length - 1; for (const c of p.world.factions[f].clocks) c.segments = 12; }),
      clockAt: 'world.factions[' + (P.builtIn().world.factions.length - 1) + '].clocks',
      engine: run(p => { const i = p.world.locations.findIndex(l => Array.isArray(l.exits) && l.exits.length); p.world.locations[i].exits[0] = 'loc_nowhere'; })
    };
  });
  assert.equal(r.here, 41, 'the built-in town has 41 people in town');
  assert.deepEqual(r.cast.play, ['warning [house.cast] world.npcs'], 'play: 39 in town warns');
  assert.deepEqual(r.cast.strict, ['error [house.cast] world.npcs'], 'strict: 39 in town stops');
  assert.deepEqual(r.cast.none, [], 'no lint set: nothing at all');
  const twelve = sev => [0, 1, 2].map(i => `${sev} [house.clock.segments] ${r.clockAt}[${i}].segments`);
  assert.deepEqual(r.clock.play, twelve('warning'));
  assert.deepEqual(r.clock.strict, twelve('error'));
  assert.deepEqual(r.clock.none, [], 'no lint set: nothing at all');
  for (const k of ['play', 'strict']) assert.ok(r.engine[k].some(x => /^error \[engine\.location\.exit\] world\.locations\[\d+\]\.exits\[0\]$/.test(x)), k + ': ' + r.engine[k].join(' | '));
  assert.ok(r.engine.none.some(x => x.startsWith('error [engine.location.exit]')), 'and without the lint set');
});

/* The Node wrapper (tests/validate-pack.cjs) keeps the old output contract:
   the OK line and exit 0, else exit 1 with "  - <path>: <message> [<rule>]"
   lines. A .json argument is a pack file, validated in the play profile. */
s.test('the Node wrapper: validate-pack.cjs on index.html prints the OK line and exits 0; on an edited copy with a dangling exit it exits 1 naming the path; on packs/low-water.json it exits 0 in play', async () => {
  const WRAPPER = path.join(__dirname, 'validate-pack.cjs');
  const ok = spawnSync(process.execPath, [WRAPPER], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^OK Lockett's Ferry: 38 locations, 66 npcs \(41 here, 17 away, 8 dead; /);
  const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  const i = pack.world.locations.findIndex(l => Array.isArray(l.exits) && l.exits.length);
  pack.world.locations[i].exits[0] = 'loc_nowhere';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-pack-'));
  const edited = path.join(dir, 'edited.json');
  fs.writeFileSync(edited, JSON.stringify(pack, null, 2));
  try {
    const bad = spawnSync(process.execPath, [WRAPPER, edited], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.ok(bad.stderr.includes(`  - world.locations[${i}].exits[0]: exit "loc_nowhere" is not a location [engine.location.exit]`), bad.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const file = spawnSync(process.execPath, [WRAPPER, PACK_FILE], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(file.status, 0, file.stdout + file.stderr);
  assert.equal(file.stderr, '', 'not even a warning in play');
  assert.equal(file.stdout, ok.stdout, 'the same OK line as the page\'s own pack');
});

s.run();
