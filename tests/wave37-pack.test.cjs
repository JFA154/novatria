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
    /* Milestone 2 (plan decision C), the second planned change: a new game names its story pack in meta (packId,
       packVersion, packHash) and starts at the current rules version (11, "A story pack", once Upgrade has its step).
       Pinned to exactly those values here, then taken out on the live side (rulesVersion set back in place, so the
       key order is the snapshot's). */
    const m = copy.meta;
    const packMeta = { packId: m.packId, packVersion: m.packVersion, packHash: m.packHash, rulesVersion: m.rulesVersion, current: Game.State.RULES_VERSION, builtInHash: Game.Pack.hash(Game.Pack.builtIn()) };
    delete m.packId; delete m.packVersion; delete m.packHash;
    if (m.rulesVersion === 11) m.rulesVersion = 10;
    const p = st.player;
    return {
      packMeta,
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
  assert.ok([10, 11].includes(r.packMeta.current), 'rules version 10, or 11 once Upgrade has its step');
  assert.deepEqual(r.packMeta, { packId: 'low-water', packVersion: '1.0.0', packHash: r.packMeta.builtInHash, rulesVersion: r.packMeta.current, current: r.packMeta.current, builtInHash: r.packMeta.builtInHash }, 'the pack fields of decision C and the current rules version, exactly');
  assert.match(r.packMeta.builtInHash, /^[0-9a-f]{16}$/);
  sameText(r.stateJson, P.stateJson, 'the whole state as JSON (createdAt removed); turn errors: ' + JSON.stringify(errs));
});

s.test('Pack.format of the built-in pack is packs/low-water.json byte for byte, and node tests/pack-inline.cjs --check passes', async h => {
  const page = await h.open();
  const text = await page.evaluate(() => Game.Pack.format(Game.Pack.builtIn()));
  sameText(text, fs.readFileSync(PACK_FILE, 'utf8'), 'Pack.format(builtIn)');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'pack-inline.cjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, 'pack-inline --check: ' + (r.stdout || '') + (r.stderr || ''));
});

s.test('Pack.hash is sixteen lowercase hex characters and the same whatever the order of the pack\'s keys, at the top and at every level below it; one character changed in one name changes it', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const reversed = {};
    for (const k of Object.keys(b).reverse()) reversed[k] = b[k];
    // Every object at every depth rebuilt with its keys in reverse order; arrays keep their order (it is meaning, not layout).
    const deep = v => {
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(deep);
      const out = {};
      for (const k of Object.keys(v).reverse()) out[k] = deep(v[k]);
      return out;
    };
    const everywhere = deep(b);
    const npc = b.world.npcs.find(n => Object.keys(n).length > 1);
    const npcCopy = everywhere.world.npcs[b.world.npcs.indexOf(npc)];
    const renamed = P.copy(b);
    const n0 = renamed.world.npcs[0];
    n0.name = n0.name.slice(0, -1) + (n0.name.slice(-1) === 'x' ? 'y' : 'x');
    return {
      hash: P.hash(b), again: P.hash(b), reversed: P.hash(reversed), order: Object.keys(reversed).join() !== Object.keys(b).join(),
      everywhere: P.hash(everywhere),
      deepOrder: Object.keys(npcCopy).join() === Object.keys(npc).reverse().join() && Object.keys(npcCopy).join() !== Object.keys(npc).join(),
      renamed: P.hash(renamed), oneChar: n0.name.length === b.world.npcs[0].name.length && n0.name !== b.world.npcs[0].name
    };
  });
  assert.match(r.hash, /^[0-9a-f]{16}$/);
  assert.equal(r.again, r.hash);
  assert.equal(r.order, true, 'the copy really has its keys in another order');
  assert.equal(r.reversed, r.hash);
  assert.equal(r.deepOrder, true, 'a person deep in the copy really has its keys reversed');
  assert.equal(r.everywhere, r.hash, 'keys reversed at every level: the same hash');
  assert.equal(r.oneChar, true, 'the edit is one character in one name');
  assert.notEqual(r.renamed, r.hash, 'one character changed in one name: another hash');
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

/* Wave 37, Creator Mode (review F1): a save from before the wave carries
   no typeLabel on its places, and the two labels moved out of the UI's old
   table into the pack, so in a game of the built-in town placeLabel falls
   back on the built-in pack's record for the same place. The v36 fixture's
   state is such a save. */
s.test('placeLabel: a pre-wave save of the built-in town (the v36 fixture\'s state, no typeLabel on its places) still shows the Bluff as "Bluff" and Town Hall as "Town hall", as a fresh game does', async h => {
  const page = await h.open();
  await quickStart(page);
  const fresh = await page.evaluate(() => [Game.UI.placeLabel(Game.State.loc('loc_bluff')), Game.UI.placeLabel(Game.State.loc('loc_town_hall'))]);
  assert.deepEqual(fresh, ['Bluff', 'Town hall'], 'a fresh game');
  const old = await page.evaluate(json => {
    const st = JSON.parse(json);
    // The fixture removed its one wall-clock field; a save always has it.
    st.meta.createdAt = new Date().toISOString();
    Game.State.load(st, Game.Pack.copy(Game.Pack.builtIn().world));
    const bluff = Game.State.loc('loc_bluff');
    const hall = Game.State.loc('loc_town_hall');
    return {
      bare: ['typeLabel' in bluff, 'typeLabel' in hall, 'packId' in Game.State.current.meta],
      byType: [Game.UI.placeTypeLabel(bluff.type), Game.UI.placeTypeLabel(hall.type)],
      labels: [Game.UI.placeLabel(bluff), Game.UI.placeLabel(hall)]
    };
  }, FIXTURE.playthrough.stateJson);
  assert.deepEqual(old.bare, [false, false, false], 'the old save really has no typeLabel and no packId');
  assert.deepEqual(old.byType, ['Highway', 'Police station'], 'what the type word alone would say');
  assert.deepEqual(old.labels, ['Bluff', 'Town hall'], 'the old save');
});

/* Wave 37, Creator Mode (review N1): Pack.builtIn() runs while the main
   script is still defining things, so a missing or broken pack element
   used to leave a dead title screen. Each broken copy of the page is
   written to a temp directory and opened from file:// with the network
   blocked, as h.open does, but without waiting for Game, which never
   comes. */
s.test('a page whose pack element is missing or holds broken JSON shows the start-up banner naming the pack-low-water element and defines no window.Game', async h => {
  const page = await h.open();
  const browser = page.context().browser();
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const OPEN = '<script type="application/json" id="pack-low-water">';
  assert.equal(html.split(OPEN).length - 1, 1);
  const broken = {
    'the element\'s id changed': html.replace(OPEN, '<script type="application/json" id="pack-low-water-gone">'),
    'a stray comma in its JSON': html.replace(OPEN + '\n{\n  "packFormat": 1,', OPEN + '\n{\n  "packFormat": 1,,')
  };
  assert.notEqual(broken['a stray comma in its JSON'], html, 'the comma copy differs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-broken-pack-'));
  try {
    for (const [what, text] of Object.entries(broken)) {
      const file = path.join(dir, what.replace(/[^a-z]+/gi, '-') + '.html');
      fs.writeFileSync(file, text);
      const context = await browser.newContext();
      try {
        await context.route('**/*', route => (/^(file|blob|data):/.test(route.request().url()) ? route.continue() : route.abort()));
        const p = await context.newPage();
        const errs = [];
        p.on('pageerror', e => errs.push(e.message));
        await p.goto('file://' + file, { waitUntil: 'load' });
        const r = await p.evaluate(() => {
          const banner = document.getElementById('banner');
          return { game: typeof window.Game, hidden: banner.hidden, text: document.getElementById('banner-text').textContent };
        });
        assert.equal(r.game, 'undefined', what + ': no window.Game');
        assert.equal(r.hidden, false, what + ': the banner shows');
        assert.match(r.text, /^The game failed to start: The built-in story \(the pack-low-water element\) /, what + ': ' + r.text);
        assert.match(r.text, what.startsWith('the element') ? /is missing from the page\.$/ : /is not valid JSON: /, what + ': ' + r.text);
        assert.ok(errs.some(m => m.includes('pack-low-water')), what + ': the error is still thrown: ' + errs.join(' | '));
      } finally { await context.close(); }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

/* Wave 37, Creator Mode (review N4): a save's town is the mutable part of
   the world only (Pack.townOf); the static keys stay in the pack. The
   reviewer measured this envelope at 433,657 bytes before the wave and
   457,475 with the static keys riding along. */
s.test('a fresh game\'s town copy leaves out the five static world keys and is otherwise the built-in world; its save envelope is back to the pre-wave size', async h => {
  const page = await h.open();
  await startAsSnapshot(page);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const town = Game.State.town;
    const world = JSON.parse(JSON.stringify(P.builtIn().world));
    for (const k of P.STATIC_WORLD_KEYS) delete world[k];
    return {
      keys: P.STATIC_WORLD_KEYS.slice(),
      left: P.STATIC_WORLD_KEYS.filter(k => k in town),
      town: JSON.parse(JSON.stringify(town)), world,
      stillInPack: P.STATIC_WORLD_KEYS.filter(k => k in P.builtIn().world),
      bytes: new TextEncoder().encode(JSON.stringify(Game.Storage.envelope('x'))).length
    };
  });
  assert.deepEqual(r.keys, ['tables', 'grudgeTemplates', 'favourTemplates', 'law', 'gates']);
  assert.deepEqual(r.left, [], 'none of the five in the save\'s town');
  assert.deepEqual(r.stillInPack, r.keys, 'the pack keeps all five');
  assert.deepEqual(r.town, r.world, 'the town is the built-in world minus the five');
  assert.ok(r.bytes < 435000, 'the envelope is within 1,000 bytes of the pre-wave 433,657: ' + r.bytes);
});

/* Wave 37, Creator Mode (review N2): the editor anchors problems to fields
   and should show one per fault. A wrong type was reported by the shape
   pass and again by a rule at the same path; a mention was reported once
   per occurrence. "Royce Gaddis" is Royce Pittman's first name with the
   Gaddis family name, a pair nobody is called (engine.mention.pair). */
s.test('Pack.validate reports one problem per fault: npc.age "forty" is one engine.shape.type at that path; a seed naming "Royce Gaddis" twice gives each engine.mention problem once', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const age = P.copy(P.builtIn());
    const i = age.world.npcs.findIndex(n => Number.isInteger(n.age));
    age.world.npcs[i].age = 'forty';
    const at = 'world.npcs[' + i + '].age';
    const named = P.copy(P.builtIn());
    named.world.seeds[0].effect += ' Royce Gaddis saw it, and Royce Gaddis said nothing.';
    const mention = P.validate(named, { profile: 'strict' }).filter(x => /^engine\.mention\./.test(x.rule));
    return {
      at, age: P.validate(age, { profile: 'strict' }).filter(x => x.path === at).map(x => x.rule),
      mention: mention.map(x => JSON.stringify([x.rule, x.path, x.message]))
    };
  });
  assert.deepEqual(r.age, ['engine.shape.type'], 'one problem at ' + r.at);
  assert.ok(r.mention.length >= 1, 'the pair is found');
  assert.ok(r.mention.some(x => x.includes('engine.mention.pair') && x.includes('world.seeds[0].effect')), r.mention.join(' | '));
  assert.equal(new Set(r.mention).size, r.mention.length, 'one entry per distinct (rule, path, message): ' + r.mention.join(' | '));
});

/* Wave 37, Creator Mode (review N3): the engine's default example turns
   moved out of the old content block, so the old validator's section-8
   check of them is kept here: each preset's own examples, set on a copy of
   the built-in pack, pass the example rules under strict. */
s.test('the engine\'s default example turns pass the example rules: each preset\'s examples (casual, literary) set on a copy of the built-in pack raise no engine.examples or house.examples problem under strict', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const presets = P.DEFAULTS.narration.presets;
    return Object.keys(presets).map(preset => {
      const p = Object.assign(P.copy(P.builtIn()), { narration: { preset, examples: P.copy(presets[preset].examples) } });
      return { preset, n: presets[preset].examples.length, problems: P.validate(p, { profile: 'strict' }).filter(x => /^(engine|house)\.examples/.test(x.rule)).map(x => `${x.severity} [${x.rule}] ${x.path}: ${x.message}`) };
    });
  });
  assert.deepEqual(r.map(x => x.preset), ['casual', 'literary']);
  for (const x of r) {
    assert.ok(x.n >= 3, x.preset + ' has examples');
    assert.deepEqual(x.problems, [], x.preset);
  }
});

s.run();
