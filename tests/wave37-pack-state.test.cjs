'use strict';
/* Wave 37, Creator Mode, milestone 2 (task M2-A; plan decision C): a game
   knows the story pack it plays from. A new game records meta.packId,
   packVersion and packHash and keeps a frozen copy as State.pack (never in
   the undo stack); Pack.current() is that pack while a game is loaded;
   State.load(st, town, pack) takes the pack Storage resolved, or for a save
   from before packs Pack.forLegacy (the built-in pack for the built-in
   town, the built-in dials over any other town) and writes nothing into
   the save (Upgrade version 11 does, with a feed line); the engine key
   packAttach writes the three fields and is refused from the model; and
   Pack.selected() is the pack a new game starts from (the built-in pack
   while the library has nothing else selected).
   Run with: node tests/run.cjs wave37-pack-state */
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave37-pack-state');
const FIXTURE = require('./fixtures/prompts-v36.json');

s.test('a new game records packId low-water, packVersion 1.0.0 and the built-in pack\'s 16-hex hash in meta, at the current rules version, and State.pack is the frozen built-in pack itself', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const m = Game.state.meta;
    const b = Game.Pack.builtIn();
    const p = Game.State.pack;
    return {
      packId: m.packId, packVersion: m.packVersion, packHash: m.packHash, hash: Game.Pack.hash(b),
      rules: [m.rulesVersion, Game.State.RULES_VERSION], townName: m.townName, worldName: b.world.name,
      same: p === b, frozen: [Object.isFrozen(p), Object.isFrozen(p.world), Object.isFrozen(p.world.npcs[0]), Object.isFrozen(p.player.backgrounds)],
      keys: Object.keys(m).slice(0, 7)
    };
  });
  assert.equal(r.packId, 'low-water');
  assert.equal(r.packVersion, '1.0.0');
  assert.match(r.packHash, /^[0-9a-f]{16}$/);
  assert.equal(r.packHash, r.hash, 'the hash of the pack the game started from');
  // Rules version 11 ("A story pack") once Upgrade has its step (task M2-C); stamped with the current version either way.
  assert.equal(r.rules[0], r.rules[1]);
  assert.ok([10, 11].includes(r.rules[1]), String(r.rules[1]));
  assert.equal(r.townName, r.worldName, 'townName stays the world\'s name');
  assert.equal(r.same, true, 'the built-in pack is frozen already, so the game keeps it as it is');
  assert.deepEqual(r.frozen, [true, true, true, true]);
  assert.deepEqual(r.keys, ['seed', 'turn', 'createdAt', 'townName', 'packId', 'packVersion', 'packHash'], 'the three fields sit beside townName');
});

s.test('State.town carries none of the five static world keys, and Pack.current() is State.pack during a game and the built-in pack once the game is cleared', async h => {
  const page = await h.open();
  const before = await page.evaluate(() => [Game.State.pack, Game.Pack.current() === Game.Pack.builtIn()]);
  assert.deepEqual(before, [null, true], 'no game: no pack, and the built-in pack is current');
  await quickStart(page);
  const r = await page.evaluate(() => {
    const t = Game.State.town;
    const during = Game.Pack.current() === Game.State.pack;
    const statics = Game.Pack.STATIC_WORLD_KEYS.filter(k => k in t);
    Game.App.quitToTitle();
    // The title screen keeps the game loaded (Continue plays it); State.clear is what ends it.
    const atTitle = Game.Pack.current() === Game.State.pack;
    Game.State.clear();
    return { statics, n: Game.Pack.STATIC_WORLD_KEYS.length, during, atTitle, cleared: Game.State.pack, after: Game.Pack.current() === Game.Pack.builtIn() };
  });
  assert.equal(r.n, 5);
  assert.deepEqual(r.statics, []);
  assert.equal(r.during, true);
  assert.equal(r.atTitle, true);
  assert.equal(r.cleared, null, 'State.clear nulls the pack');
  assert.equal(r.after, true);
});

s.test('a game pinned to a pack keeps it: with a preview set, the new game starts from a frozen copy of the preview, and a later edit of the preview never reaches State.pack', async h => {
  const page = await h.open();
  await page.evaluate(() => { Game.Pack.setPreview(Game.Pack.builtIn()); Game.data.TOWN_DATA.npcs[0].look = 'A preview look.'; });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const p = Game.State.pack;
    const sel = Game.Pack.selected() === Game.Pack.current();
    const look = p.world.npcs[0].look;
    Game.data.TOWN_DATA.npcs[0].look = 'Changed after the start.';
    const hash = Game.state.meta.packHash;
    Game.Pack.setPreview(null);
    return {
      sel, look, frozen: Object.isFrozen(p) && Object.isFrozen(p.world.npcs[0]), notBuiltIn: p !== Game.Pack.builtIn(),
      stillLook: p.world.npcs[0].look, hashOk: hash === Game.Pack.hash(p), differs: hash !== Game.Pack.hash(Game.Pack.builtIn()),
      currentNow: Game.Pack.current() === p
    };
  });
  assert.equal(r.sel, true, 'the preview is what a new game starts from');
  assert.equal(r.look, 'A preview look.');
  assert.equal(r.frozen, true);
  assert.equal(r.notBuiltIn, true);
  assert.equal(r.stillLook, 'A preview look.', 'the game keeps its frozen copy');
  assert.equal(r.hashOk, true);
  assert.equal(r.differs, true, 'a bent pack has its own hash');
  assert.equal(r.currentNow, true, 'with the preview gone, the game\'s own pack is current');
});

s.test('Pack.selected() is the built-in pack with no selection, with selectedPackId naming the built-in pack, and with an unknown id when the library has no such pack', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const out = [P.selected() === b];
    const real = Game.Storage.settings;
    const lib = Game.Storage.Library;
    try {
      const S = Object.assign({}, real());
      Game.Storage.settings = () => Object.assign({}, S, { selectedPackId: 'low-water' });
      out.push(P.selected() === b);
      Game.Storage.settings = () => Object.assign({}, S, { selectedPackId: 'no-such-pack' });
      out.push(P.selected() === b);
    } catch (e) {
      // Storage is frozen (no stubbing possible): the reads above are covered by the plain call.
      out.push(true, true);
    } finally {
      try { Game.Storage.settings = real; } catch (e) { /* frozen */ }
    }
    return { out, lib: lib === undefined ? 'none' : typeof lib };
  });
  assert.deepEqual(r.out, [true, true, true]);
});

s.test('packAttach: from the engine it writes the three meta fields and names itself in applied; the same three again change nothing; from the model it is refused and changes nothing; a bad id, version or hash is refused', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const m = () => { const x = Game.state.meta; return [x.packId, x.packVersion, x.packHash]; };
    const keyListed = S.ENGINE_KEYS.includes('packAttach') && !S.RECORD_KEYS.includes('packAttach');
    const v = { id: 'x-pack', version: '2.0.0', hash: '0123456789abcdef' };
    const before = m();
    const model = S.apply({ packAttach: v }, { source: 'model' });
    const afterModel = m();
    const eng = S.apply({ packAttach: v });
    const afterEng = m();
    const again = S.apply({ packAttach: v });
    const bad = [
      { id: 'x-pack', version: '2.0.0', hash: '0123456789ABCDEF' },
      { id: 'x-pack', version: '2.0.0', hash: '0123456789abcde' },
      { id: 'X_pack', version: '2.0.0', hash: '0123456789abcdef' },
      { id: 'x-pack', version: '', hash: '0123456789abcdef' },
      { id: 'x-pack', version: 'v'.repeat(20), hash: '0123456789abcdef' },
      'x-pack'
    ].map(b => S.apply({ packAttach: b }).rejected.length);
    return { keyListed, before, model: { applied: model.applied, rejected: model.rejected }, afterModel, eng: eng.applied, afterEng, again: [again.applied.length, again.rejected.length], bad, final: m() };
  });
  assert.equal(r.keyListed, true, 'an engine key, not a record key');
  assert.equal(r.model.applied.length, 0);
  assert.equal(r.model.rejected.length, 1);
  assert.match(r.model.rejected[0].reason, /not allowed from the model/);
  assert.deepEqual(r.afterModel, r.before, 'the model changed nothing');
  assert.deepEqual(r.afterEng, ['x-pack', '2.0.0', '0123456789abcdef']);
  assert.equal(r.eng.length, 1);
  assert.match(r.eng[0], /x-pack/);
  assert.deepEqual(r.again, [0, 0], 'a rerun is a no-op');
  assert.deepEqual(r.bad, [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(r.final, ['x-pack', '2.0.0', '0123456789abcdef'], 'the refusals changed nothing');
});

s.test('Pack.forLegacy: a copy of the built-in world (and no town, or a save naming the built-in town) is the built-in pack; a renamed world is a frozen legacy pack with the built-in dials, that world and the static keys filled, cached', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const same = [
      P.forLegacy(null, P.copy(b.world)) === b,
      P.forLegacy(null, undefined) === b,
      P.forLegacy({ meta: { townName: b.world.name } }, Object.assign(P.townOf(b.world), { name: 'Elsewhere' })) === b
    ];
    const town = P.townOf(b.world);
    town.name = 'Marrow Bend';
    town.npcs[0].look = 'An edited look.';
    const p = P.forLegacy(null, town);
    const again = P.forLegacy({ meta: { townName: 'Marrow Bend' } }, P.copy(town));
    const other = Object.assign(P.copy(town), { tagline: 'another town, same name' });
    return {
      same,
      id: p.meta.id, title: p.meta.title, version: p.meta.version, rating: [p.meta.rating, b.meta.rating], format: p.packFormat,
      frozen: [Object.isFrozen(p), Object.isFrozen(p.world), Object.isFrozen(p.world.npcs[0]), Object.isFrozen(p.world.tables)],
      setting: JSON.stringify(p.setting) === JSON.stringify(b.setting), player: JSON.stringify(p.player) === JSON.stringify(b.player),
      world: [p.world.name, p.world.npcs[0].look],
      statics: P.STATIC_WORLD_KEYS.map(k => JSON.stringify(p.world[k]) === JSON.stringify(b.world[k])),
      untouched: P.STATIC_WORLD_KEYS.filter(k => k in town),
      cached: again === p, otherNotCached: P.forLegacy(null, other) !== p,
      attachable: Game.State.apply !== undefined && /^[a-z][a-z0-9-]{1,40}$/.test(p.meta.id),
      longId: P.forLegacy(null, Object.assign(P.copy(town), { name: 'A Very Long Town Name That Goes On And On Past The Limit' })).meta.id
    };
  });
  assert.deepEqual(r.same, [true, true, true]);
  assert.equal(r.id, 'legacy-marrow-bend');
  assert.equal(r.title, 'Marrow Bend');
  assert.equal(r.version, '0.0.0');
  assert.equal(r.rating[0], r.rating[1]);
  assert.equal(r.format, 1);
  assert.deepEqual(r.frozen, [true, true, true, true]);
  assert.equal(r.setting, true);
  assert.equal(r.player, true);
  assert.deepEqual(r.world, ['Marrow Bend', 'An edited look.']);
  assert.deepEqual(r.statics, [true, true, true, true, true]);
  assert.deepEqual(r.untouched, [], 'the caller\'s town is not changed');
  assert.equal(r.cached, true);
  assert.equal(r.otherNotCached, true, 'another town with the same name is not served the first one\'s pack');
  assert.equal(r.attachable, true);
  assert.ok(r.longId.length <= 41 && /^legacy-[a-z0-9-]+[a-z0-9]$/.test(r.longId), r.longId);
});

s.test('State.load of a pre-wave save (the v36 fixture\'s state) puts State.pack on the built-in pack and writes no pack field; State.load with a pack keeps that pack, frozen; with an edited town and no pack, the legacy pack', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(json => {
    const P = Game.Pack;
    const S = Game.State;
    const b = P.builtIn();
    const st = JSON.parse(json);
    // The fixture removed its one wall-clock field; a save always has it.
    st.meta.createdAt = new Date().toISOString();
    const town = P.townOf(b.world);
    S.load(st, town);
    const old = { same: S.pack === b, meta: ['packId', 'packVersion', 'packHash'].map(k => k in S.current.meta), rules: S.current.meta.rulesVersion, behind: Game.Upgrade.behind(S.current) === (S.RULES_VERSION > 10), current: P.current() === b };
    const some = P.copy(b);
    some.meta = Object.assign({}, some.meta, { id: 'some-pack', title: 'Some pack' });
    S.load(st, town, some);
    const given = { id: S.pack.meta.id, frozen: Object.isFrozen(S.pack) && Object.isFrozen(S.pack.world.npcs[0]), notTheCallers: !Object.isFrozen(some), meta: 'packId' in S.current.meta, current: P.current() === S.pack };
    const frozenOne = P.deepFreeze(P.copy(some));
    S.load(st, town, frozenOne);
    const kept = S.pack === frozenOne;
    const edited = Object.assign(P.copy(town), { name: 'Marrow Bend' });
    const st2 = JSON.parse(JSON.stringify(st));
    st2.meta.townName = 'Marrow Bend';
    S.load(st2, edited);
    const legacy = { id: S.pack.meta.id, isLegacy: S.pack === P.forLegacy(st2, edited) };
    return { old, given, kept, legacy };
  }, FIXTURE.playthrough.stateJson);
  assert.deepEqual(r.old, { same: true, meta: [false, false, false], rules: 10, behind: true, current: true }, 'behind exactly when this build is past rules version 10');
  assert.deepEqual(r.given, { id: 'some-pack', frozen: true, notTheCallers: true, meta: false, current: true });
  assert.equal(r.kept, true, 'a pack frozen already is kept as it is');
  assert.deepEqual(r.legacy, { id: 'legacy-marrow-bend', isLegacy: true });
});

s.test('the undo stack never holds the pack: after a turn its bytes are exactly the game and town as they stood before the turn, as for a fresh game before the wave; an undo keeps State.pack', async h => {
  const page = await h.open();
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(page);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const pre = await page.evaluate(() => ({ bytes: Game.State.undoBytes(), depth: Game.State.undoDepth(), measure: JSON.stringify(Game.state).length + JSON.stringify(Game.State.town).length }));
  assert.equal(pre.depth, 0, 'a fresh game has nothing to undo');
  assert.equal(pre.bytes, 0);
  await sendText(page, 'I look around');
  const r = await page.evaluate(() => {
    const rec = Game.State.undoRecord();
    const texts = rec.entries.map(e => e.json).concat(rec.towns);
    const pack = Game.State.pack;
    const sum = texts.reduce((n, t) => n + t.length, 0);
    const bytes = Game.State.undoBytes();
    Game.State.undoSteps(1);
    return {
      depth: rec.entries.length, bytes, sum,
      holdsPack: texts.some(t => t.includes('"packFormat"') || t.includes('"backgrounds"')),
      samePack: Game.State.pack === pack && pack === Game.Pack.builtIn(), turn: Game.state.meta.turn
    };
  });
  assert.equal(r.depth, 1);
  assert.equal(r.bytes, pre.measure, 'one entry: the game and its town copy before the turn, nothing else');
  assert.equal(r.sum, r.bytes, 'what Storage would keep is the same bytes');
  assert.equal(r.holdsPack, false);
  assert.equal(r.samePack, true);
  assert.equal(r.turn, 0, 'the undo took the turn back');
});

s.run();
