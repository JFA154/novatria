'use strict';
/* Wave 37, Creator Mode, milestone 2 (task M2-C; plan decisions C and F):
   rules version 11, "A story pack". Upgrade's attachPack names the pack an
   older game plays from in its meta (State's packAttach, no call): the
   built-in pack for a game of the built-in town, Pack.forLegacy's
   legacy- pack for a game of an edited town, with one feed line built from
   the pack's title and version; a rerun changes nothing and says so; /undo
   takes the meta back and never touches State.pack. And the twenty
   townName fallbacks now ask Pack.isBuiltIn and read the built-in pack's
   world (a rename: the old alias is the same object), so Rel still finds
   the chief for the built-in town and reads an edited town's own.
   The real version 8 fixture (tests/fixtures/make-v8-save.cjs) needs the
   git history.
   Run with: node tests/run.cjs wave37-upgrade */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');
const { makeV8Save } = require('./fixtures/make-v8-save.cjs');

const s = suite('wave37-upgrade');
const FIXTURE = require('./fixtures/prompts-v36.json');
const AUTOSAVE = 'novatria.autosave';
const PACK_FIELDS = ['packId', 'packVersion', 'packHash'];

/* Write an envelope as the autosave, reload to the title and Continue it. */
async function continueSave(page, env) {
  await page.evaluate(([key, json]) => localStorage.setItem(key, json), [AUTOSAVE, JSON.stringify(env)]);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
}
/* A game of this build saved at rules version 10, before packs: no pack
   fields in meta. opts.town renames the town (the save's town copy and
   meta.townName), as an edited town's save carries. Resolves to the
   envelope. */
async function v10Save(page, opts = {}) {
  await quickStart(page);
  return page.evaluate(o => {
    const env = Game.Storage.envelope('Autosave');
    const m = env.state.meta;
    m.rulesVersion = 10;
    for (const k of ['packId', 'packVersion', 'packHash']) delete m[k];
    if (o.town) { env.town.name = o.town; m.townName = o.town; }
    return env;
  }, opts);
}
const lastNotice = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent);

s.test('the real version 8 save, written as the autosave and updated in mock mode, ends at rules version 11 on the built-in pack: packId low-water, packVersion 1.0.0, the built-in pack\'s hash, State.pack the built-in pack itself, and the feed says "This game now plays from the story pack Low Water 1.0.0."; a second update changes no field and says it already does', async h => {
  const old = await makeV8Save();
  assert.equal(old.rules, 8);
  const page = await h.open({ viewport: LAPTOP });
  await page.waitForFunction(() => window.Game && Game.App);
  await continueSave(page, old.env);
  const before = await page.evaluate(() => ({
    v: Game.State.rulesVersion(Game.state), fields: ['packId', 'packVersion', 'packHash'].filter(k => k in Game.state.meta),
    pack: Game.State.pack === Game.Pack.builtIn(), calls: Game.Api.Mock.calls.length
  }));
  assert.equal(before.v, 8);
  assert.deepEqual(before.fields, [], 'a save from before packs names none');
  assert.equal(before.pack, true, 'State.load put the built-in town\'s save on the built-in pack');
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual([res.ok, res.from, res.to], [true, 8, 11]);
  const after = await page.evaluate(() => {
    const m = Game.state.meta;
    const b = Game.Pack.builtIn();
    const step = Game.Upgrade.MIGRATIONS.find(x => x.version === 11);
    return {
      rules: m.rulesVersion, packId: m.packId, packVersion: m.packVersion, packHash: m.packHash, hash: Game.Pack.hash(b),
      pack: Game.State.pack === b, title: b.meta.title, version: b.meta.version, calls: Game.Api.Mock.calls.length,
      step: [step.title, step.rerun], current: Game.Pack.current() === b
    };
  });
  assert.equal(after.rules, 11);
  assert.equal(after.packId, 'low-water');
  assert.equal(after.packVersion, '1.0.0');
  assert.equal(after.packHash, after.hash, 'the built-in pack\'s hash');
  assert.equal(after.pack, true, 'State.pack is the built-in pack itself');
  assert.equal(after.current, true);
  assert.deepEqual(after.step, ['A story pack', true]);
  assert.equal(after.calls, before.calls, 'nothing is called');
  const line = `This game now plays from the story pack ${after.title} ${after.version}.`;
  assert.equal(line, 'This game now plays from the story pack Low Water 1.0.0.');
  const feed = await lastNotice(page);
  assert.ok(feed.endsWith(' ' + line), feed);
  assert.equal(res.summaries.find(x => x.version === 11).text, line);

  // The rerun ("Re-read this game with the latest rules"): a no-op for the pack.
  const meta1 = await page.evaluate(() => JSON.stringify(Game.state.meta));
  const res2 = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res2.ok, true);
  const v11 = res2.summaries.find(x => x.version === 11);
  assert.equal(v11.text, 'This game already plays from the story pack Low Water 1.0.0.');
  assert.equal(v11.attached, false);
  const meta2 = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state.meta)));
  const m1 = JSON.parse(meta1);
  for (const k of PACK_FIELDS.concat(['rulesVersion', 'townName'])) assert.equal(meta2[k], m1[k], `${k} unchanged`);
  assert.ok((await lastNotice(page)).endsWith(' This game already plays from the story pack Low Water 1.0.0.'));
  assert.equal(await page.evaluate(() => Game.State.pack === Game.Pack.builtIn()), true);
});

s.test('a version 10 save of an edited town (renamed in its town copy and meta) is attached to its legacy- pack: the id, version 0.0.0 and hash of State.pack, which is Pack.forLegacy\'s pack and not the built-in one; only version 11 runs, with no call, and the feed names the town\'s own pack', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const env = await v10Save(page, { town: 'Marrow Bend' });
  await continueSave(page, env);
  const before = await page.evaluate(() => ({ id: Game.State.pack.meta.id, builtIn: Game.State.pack === Game.Pack.builtIn(), pending: Game.Upgrade.pending(Game.state).map(m => m.version), calls: Game.Api.Mock.calls.length }));
  assert.equal(before.id, 'legacy-marrow-bend');
  assert.equal(before.builtIn, false);
  assert.deepEqual(before.pending, [11]);
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual([res.ok, res.from, res.to, res.summaries.map(x => x.version)], [true, 10, 11, [11]]);
  const r = await page.evaluate(() => {
    const m = Game.state.meta;
    const p = Game.State.pack;
    return { packId: m.packId, packVersion: m.packVersion, packHash: m.packHash, id: p.meta.id, hash: Game.Pack.hash(p), legacy: p === Game.Pack.forLegacy(Game.state, Game.State.town), builtIn: Game.Pack.isBuiltIn(Game.state), calls: Game.Api.Mock.calls.length };
  });
  assert.ok(r.id.startsWith('legacy-'), r.id);
  assert.equal(r.packId, r.id);
  assert.equal(r.packVersion, '0.0.0');
  assert.equal(r.packHash, r.hash, 'the hash of the pack the game plays');
  assert.equal(r.legacy, true, 'Pack.forLegacy\'s own pack (cached by the town)');
  assert.equal(r.builtIn, false, 'a legacy- pack is not the built-in story');
  assert.equal(r.calls, before.calls, 'nothing is called');
  // Only version 11 ran: its line is the whole notice.
  assert.equal(await lastNotice(page), 'This game now plays from the story pack Marrow Bend 0.0.0.');
});

s.test('/undo after the update takes the meta back exactly (no pack fields, rules version 10) and leaves State.pack the built-in pack: undo never changes the pack', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const env = await v10Save(page);
  await continueSave(page, env);
  const meta0 = await page.evaluate(() => JSON.stringify(Game.state.meta));
  const res = await page.evaluate(() => Game.App.updateGame());
  assert.equal(res.ok, true);
  assert.deepEqual(res.summaries.map(x => [x.version, x.text]), [[11, 'This game now plays from the story pack Low Water 1.0.0.']]);
  assert.equal(await page.evaluate(() => Game.state.meta.packId), 'low-water');
  await sendText(page, '/undo');
  const r = await page.evaluate(() => ({ meta: JSON.stringify(Game.state.meta), pack: Game.State.pack === Game.Pack.builtIn(), frozen: Object.isFrozen(Game.State.pack), behind: Game.Upgrade.behind(Game.state) }));
  assert.equal(r.meta, meta0, 'the meta before the update, byte for byte');
  assert.ok(!PACK_FIELDS.some(k => JSON.parse(r.meta)[k] !== undefined), 'no pack fields');
  assert.equal(r.pack, true, 'State.pack is still the built-in pack');
  assert.equal(r.frozen, true);
  assert.equal(r.behind, true, 'behind again, so Update is offered again');
});

s.test('Upgrade.behind and pending: a version 10 save is behind with version 11 pending; a fresh game is not behind and has no step newer than it', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const U = Game.Upgrade;
    const fresh = Game.state;
    const old = JSON.parse(JSON.stringify(fresh));
    old.meta.rulesVersion = 10;
    return {
      oldBehind: U.behind(old), oldPending: U.pending(old).map(m => m.version),
      freshBehind: U.behind(fresh), newerThanFresh: U.known().filter(m => m.version > Game.State.rulesVersion(fresh)).map(m => m.version),
      rules: [fresh.meta.rulesVersion, Game.State.RULES_VERSION], known: U.known().map(m => m.version)
    };
  });
  assert.equal(r.oldBehind, true);
  assert.deepEqual(r.oldPending, [11]);
  assert.equal(r.freshBehind, false);
  assert.deepEqual(r.newerThanFresh, []);
  assert.deepEqual(r.rules, [11, 11]);
  assert.deepEqual(r.known, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

s.test('the townName fallbacks ask Pack.isBuiltIn: true for a fresh game and for the v36 fixture\'s state, false for a renamed town; Rel.policeHead finds the chief for a fresh game and, through the built-in fallback, for the v36 state with policeHead gone from its town copy, and reads an edited town copy\'s own head', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(json => {
    const P = Game.Pack;
    const R = Game.Rel;
    const b = P.builtIn();
    const fresh = Game.state;
    const freshTown = Game.State.town;
    const v36 = JSON.parse(json);
    v36.meta.createdAt = new Date().toISOString();
    const renamed = JSON.parse(JSON.stringify(v36));
    renamed.meta.townName = 'Marrow Bend';
    const legacyId = JSON.parse(JSON.stringify(fresh));
    legacyId.meta.packId = 'legacy-marrow-bend';
    const v36Town = P.townOf(b.world);
    const noHead = P.copy(v36Town);
    delete noHead.policeHead;
    // Someone else in town, free and here, named as the edited town copy's head.
    const other = v36.npcs.find(n => n.id !== b.world.policeHead && n.alive !== false && n.status === 'free' && (n.presence === undefined || n.presence === 'here'));
    const edited = Object.assign(P.copy(v36Town), { policeHead: other.id });
    /* The chief with a role that names no chief: only the named head finds
       them now (policeHead's last resort reads the role), so the built-in
       fallback is what is tested. */
    const blank = st => { const c = JSON.parse(JSON.stringify(st)); const n = c.npcs.find(x => x.id === b.world.policeHead); n.role = 'resident'; return c; };
    return {
      isBuiltIn: [P.isBuiltIn(fresh), P.isBuiltIn(v36), P.isBuiltIn(renamed), P.isBuiltIn(legacyId)],
      v36HasPack: 'packId' in v36.meta,
      chief: b.world.policeHead,
      fresh: R.policeHead({ s: fresh, town: freshTown }),
      fallback: R.policeHead({ s: blank(v36), town: noHead }),
      renamedNoHead: R.policeHead({ s: blank(renamed), town: noHead }),
      other: other.id,
      edited: R.policeHead({ s: v36, town: edited }),
      sameWorld: Game.data.TOWN_DATA === b.world
    };
  }, FIXTURE.playthrough.stateJson);
  assert.deepEqual(r.isBuiltIn, [true, true, false, false]);
  assert.equal(r.v36HasPack, false, 'the v36 state names no pack: isBuiltIn read its town name');
  assert.equal(r.sameWorld, true, 'outside a preview the old alias is the built-in pack\'s world');
  assert.equal(r.fresh, r.chief, 'a fresh game: the chief');
  assert.equal(r.fallback, r.chief, 'the v36 state with no head in its town copy: the built-in fallback finds the chief');
  assert.equal(r.renamedNoHead, null, 'another town never borrows the built-in town\'s chief');
  assert.notEqual(r.other, r.chief);
  assert.equal(r.edited, r.other, 'an edited town copy that names its own head is read first');
});

s.run();
