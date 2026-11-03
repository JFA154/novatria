'use strict';
/* Wave 39: real saves from every older rules version (tests/fixtures/saves/
   v<N>.json, played in each version's own last build by tests/fixtures/
   make-saves.cjs and committed, so no git history is needed) imported into
   this build through the Saves screen's file input, then brought up to date
   with the title screen's "Update this game" (mock mode: version 2's memory
   rewrite runs against the mock). Each reaches State.RULES_VERSION, passes
   State.validateShape and Storage's own import check, keeps the player's
   name, day and money and every person, keeps how much everyone likes the
   player exactly (wave 30: the load fill and version 9 never move liking),
   and plays one more mock turn with no page error. A save at the current
   rules version imports with nothing to update.
   Run with: node tests/run.cjs upgrade-fixtures */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');
const { loadSave, keys, BUILDS } = require('./fixtures/make-saves.cjs');

const s = suite('upgrade-fixtures');

/* A fresh page: the save imported through the Saves screen's file input. */
async function importSave(h, text) {
  const page = await h.open({ viewport: LAPTOP });
  await page.evaluate(() => { Game.Api.Mock.delay = 0; });
  await page.click('#btn-load');
  await page.setInputFiles('#import-file', { name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForSelector('#screen-game.active');
  return page;
}

for (const key of keys()) {
  const b = BUILDS[key];
  s.test(`rules version ${key} (${b.commit}): imports, "Update this game" brings it to the current rules in mock mode, it validates, keeps the name, day, money, every person and every liking exactly, and one more turn plays`, async h => {
    const env = loadSave(key);
    const want = env.fixture.rulesVersion;
    const st0 = env.state;
    const ids = st0.npcs.map(n => n.id);
    // Liking before: the old attitude (rules 9 and the late rules-8 build keep it beside the tracks, the same number).
    const liking = Object.fromEntries(st0.npcs.map(n => [n.id, n.attitude]));
    assert.ok(ids.length >= 16 && Object.values(liking).every(Number.isInteger), 'a real save, everyone with an attitude');
    assert.equal(st0.meta.rulesVersion === undefined ? 1 : st0.meta.rulesVersion, want);
    assert.ok(st0.npcs.some(n => n.memories.length) && st0.log.length >= 8, 'memories and a story to update');

    const page = await importSave(h, JSON.stringify(env));
    const loaded = await page.evaluate(() => ({ v: Game.State.rulesVersion(Game.state), current: Game.State.RULES_VERSION, mock: Game.Storage.settings().mockMode, pending: Game.Upgrade.pending(Game.state).map(m => m.version) }));
    assert.equal(loaded.v, want, 'imported as it was: nothing updates without the player');
    assert.equal(loaded.mock, true, 'no key: mock mode');
    assert.deepEqual(loaded.pending, Array.from({ length: loaded.current - want }, (_, i) => want + 1 + i), 'every newer step is due');

    // The title screen: the autosave is behind, "Update this game".
    await page.reload();
    await page.waitForFunction(() => window.Game && Game.App);
    await page.evaluate(() => { Game.Api.Mock.delay = 0; });
    assert.equal(await page.evaluate(() => !document.getElementById('btn-update').hidden), true, 'the title offers the update');
    await page.click('#btn-update');
    await page.waitForFunction(() => Game.state && !Game.Pipeline.busy && Game.State.rulesVersion(Game.state) === Game.State.RULES_VERSION, null, { timeout: 30000 });
    const after = await page.evaluate(ids => {
      const G = Game, S = G.State, st = G.state;
      let reimport = 'ok';
      try { G.Storage.parseEnvelope(G.Storage.exportJson()); } catch (e) { reimport = e.message; }
      const shape = S.validateShape(st, S.town);
      return {
        v: S.rulesVersion(st), current: S.RULES_VERSION, pending: G.Upgrade.behind(st),
        shape: Array.isArray(shape) ? shape : [shape], reimport,
        name: st.player.name, day: st.time.day, gold: st.player.gold,
        missing: ids.filter(id => !S.npc(id)),
        liking: Object.fromEntries(ids.filter(id => S.npc(id)).map(id => [id, [S.npc(id).attitude, G.Rel.tracksOf(S.npc(id)).w]])),
        notice: [...document.querySelectorAll('#feed .f-notice')].map(n => n.textContent).pop() || '',
        notices: [...document.querySelectorAll('#feed .f-notice')].map(n => n.textContent).join(' '), phase: st.time.phase,
        turn: st.meta.turn
      };
    }, ids);
    assert.equal(after.v, after.current, `brought up to rules ${after.current}`);
    assert.equal(after.pending, false);
    assert.deepEqual(after.shape.filter(Boolean), [], 'State.validateShape');
    assert.equal(after.reimport, 'ok', 'its own export imports again');
    // The day: kept, except that version 4 ("Clock follows the story") may set it back a day to that night, and says so
    // (the mock's rule reads the old builds' last narration, "The Night Run took a full load across the river overnight").
    const back = want < 4 && after.notices.includes(`Set the clock back to Day ${st0.time.day - 1} · Night`);
    assert.deepEqual([after.name, after.day, after.gold], [st0.player.name, st0.time.day - (back ? 1 : 0), st0.player.gold], 'name, day and money');
    if (back) assert.equal(after.phase, 'night');
    assert.deepEqual(after.missing, [], 'every person kept');
    for (const id of ids) assert.deepEqual(after.liking[id], [liking[id], liking[id]], `${id}: attitude and liking exactly the old attitude`);
    assert.ok(after.notice, 'the update says what it did');
    if (want < 2) assert.match(after.notices, /Rewrote memories for \d+ (person|people)/, 'version 2 ran its rewrite against the mock');
    console.log(`        v${key}: ${after.notice.slice(0, 160)}${after.notice.length > 160 ? '...' : ''}`);

    // One more turn in mock mode, no page error (the harness fails on one).
    await sendText(page, 'I look around.');
    assert.equal(await page.evaluate(() => Game.state.meta.turn), after.turn + 1, 'one more turn');
    assert.equal(await page.evaluate(() => Game.State.rulesVersion(Game.state)), after.current);
  });
}

s.test('a save at the current rules version imports with nothing to update: no title button, no step due, the state exactly as exported', async h => {
  const first = await h.open({ viewport: LAPTOP });
  await first.evaluate(() => { Game.Api.Mock.delay = 0; });
  await quickStart(first, { seed: 4242 });
  await sendText(first, 'I look around.');
  const text = await first.evaluate(() => Game.Storage.exportJson());
  const env = JSON.parse(text);
  const page = await importSave(h, text);
  const r = await page.evaluate(() => ({ v: Game.State.rulesVersion(Game.state), current: Game.State.RULES_VERSION, behind: Game.Upgrade.behind(Game.state), due: Game.Upgrade.pending(Game.state).filter(m => m.version > Game.State.rulesVersion(Game.state)).length, state: JSON.stringify(Game.state) }));
  assert.equal(r.v, r.current);
  assert.equal(env.state.meta.rulesVersion, r.current);
  assert.deepEqual([r.behind, r.due], [false, 0]);
  assert.equal(r.state, JSON.stringify(env.state), 'loaded as exported');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  assert.equal(await page.evaluate(() => document.getElementById('btn-update').hidden), true, 'no "Update this game"');
  // The newest fixture is older than this build: a new rules version needs its own (tests/fixtures/make-saves.cjs BUILDS).
  const newest = Math.max(...keys().map(k => loadSave(k).fixture.rulesVersion));
  assert.equal(newest, r.current - 1, 'a fixture for every older rules version: add the last build of the previous one to BUILDS');
});

s.run();
