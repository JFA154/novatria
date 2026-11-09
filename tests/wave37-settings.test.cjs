'use strict';
/* Wave 37, Creator Mode, milestone 3 (task M3-A; plan decision D): the dial
   defaults as data (Pack.DEFAULTS narration, directions, prompts,
   suggestedSettings) and the player layer. A player's own settings for one
   story pack live in settings.perPack[packId] (settings version 3), keyed
   by Pack.PLAYER_PATHS; Pack.lookup reads them above the pack's own value
   and the engine default, memoised per pack and invalidated by
   Storage.saveSettings. Wave 36's intimateDirection moves into
   perPack['low-water'].overrides['directions.intimate'], and the Settings
   field reads and writes the current pack's override.
   Run with: node tests/run.cjs wave37-settings */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave37-settings');
const KEY = 'novatria.settings';

s.test('Pack.DEFAULTS carries the narration, directions, prompts and suggestedSettings dials as today\'s constants, frozen: the banned list is Style.BANNED, the lengths are Style\'s limits, and directions.intimate is Pipeline.INTIMATE_MODE byte for byte', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const D = Game.Pack.DEFAULTS, St = Game.Style;
    return {
      narration: Object.keys(D.narration).sort(),
      preset: D.narration.preset, banned: JSON.stringify(D.narration.banned) === JSON.stringify(St.BANNED),
      lengths: D.narration.lengths, limits: [St.WORD_LIMITS, St.INTIMATE_MIN, St.HARD_OVER],
      softChecks: D.narration.softChecks, examples: D.narration.examples, goodTurn: D.narration.goodTurn === St.GOOD_TURN, pov: D.narration.pointOfView,
      alias: Game.Pipeline.INTIMATE_MODE === D.directions.intimate, starts: D.directions.intimate.slice(0, 40),
      others: Object.keys(D.directions).filter(k => k !== 'intimate').map(k => [k, D.directions[k]]),
      prompts: D.prompts, suggested: D.suggestedSettings,
      frozen: [Object.isFrozen(D.narration.banned), Object.isFrozen(D.directions), Object.isFrozen(D.narration.lengths), Object.isFrozen(D.prompts)],
      paths: Game.Pack.PLAYER_PATHS, pathsFrozen: Object.isFrozen(Game.Pack.PLAYER_PATHS)
    };
  });
  assert.deepEqual(r.narration, ['alsoAvoid', 'banned', 'customGuide', 'examples', 'goodTurn', 'lengths', 'pointOfView', 'preset', 'presets', 'softChecks']);
  assert.equal(r.preset, 'casual');
  assert.equal(r.banned, true, 'the banned list is built from the literary guide\'s line, as Style.BANNED is');
  assert.deepEqual(r.lengths, { normal: 90, zoom: 150, intimate: 450, intimateMin: 250, hardOver: 15 });
  assert.deepEqual(r.limits, [{ normal: 90, zoom: 150, intimate: 450 }, 250, 15]);
  assert.deepEqual(r.softChecks, { simile: true, asYou: true, inventedPast: true, moneyLeak: true, repeat: true });
  assert.equal(r.examples, null, 'null: the preset\'s own examples');
  assert.equal(r.goodTurn, true);
  assert.equal(r.pov, 'second-present');
  assert.equal(r.alias, true, 'Pipeline.INTIMATE_MODE is the default direction itself');
  assert.equal(r.starts, 'INTIMATE SCENE. This turn is the scene i');
  assert.deepEqual(r.others.map(x => x[0]), ['combat', 'defeat', 'death', 'arrival', 'timeSkip', 'gamble', 'epilogue', 'firstTurn', 'refusedByNpc', 'rollFailure', 'rollCritical']);
  assert.ok(r.others.every(x => x[1] === ''), 'the other eleven are empty');
  assert.deepEqual(r.prompts, { narratorExtra: '', parserExtra: '', bookkeeperExtra: '' });
  assert.deepEqual(r.suggested, {});
  assert.deepEqual(r.frozen, [true, true, true, true]);
  assert.deepEqual(r.paths, ['directions.intimate', 'rules.permadeath', 'rules.cheats.allowed', 'rules.undo', 'narration.preset', 'rules.showRolls']);
  assert.equal(r.pathsFrozen, true);
});

s.test('precedence default < pack < player for directions.intimate: the built-in pack reads the engine\'s text at layer default, a copy with its own direction reads it at layer pack, a saved override reads at layer player (and Pack.get returns it), and null returns to the pack or default layer', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack, St = Game.Storage;
    const b = P.builtIn();
    const own = P.copy(b);
    own.directions = { intimate: 'Slow, and say it plainly.' };
    const L = (pack, o) => { const l = P.lookup('directions.intimate', pack, o); return [l.layer, l.value]; };
    const out = {};
    out.def = L(b);
    out.pack = L(own);
    St.savePerPack('low-water', { overrides: { 'directions.intimate': 'My own words.' } });
    out.playerBuiltIn = L(b);
    out.playerCopy = L(own);
    out.get = P.get('directions.intimate');
    out.noPlayer = [L(b, { noPlayer: true }), L(own, { noPlayer: true })];
    out.stored = St.perPack('low-water');
    // Another pack's override is that pack's alone.
    St.savePerPack('marrow-bend', { overrides: { 'directions.intimate': 'Marrow words.' } });
    out.otherStill = L(b);
    St.savePerPack('low-water', { overrides: { 'directions.intimate': null } });
    out.cleared = [L(b), L(own), St.perPack('low-water'), JSON.parse(localStorage.getItem(St.KEYS.settings)).perPack];
    out.mode = Game.Pipeline.intimateMode() === Game.Pipeline.INTIMATE_MODE;
    return out;
  });
  const INTIMATE = await page.evaluate(() => Game.Pipeline.INTIMATE_MODE);
  assert.deepEqual(r.def, ['default', INTIMATE]);
  assert.deepEqual(r.pack, ['pack', 'Slow, and say it plainly.']);
  assert.deepEqual(r.playerBuiltIn, ['player', 'My own words.']);
  assert.deepEqual(r.playerCopy, ['player', 'My own words.'], 'the copy keeps the id low-water, so the player layer is the same one');
  assert.equal(r.get, 'My own words.');
  assert.deepEqual(r.noPlayer, [['default', INTIMATE], ['pack', 'Slow, and say it plainly.']]);
  assert.deepEqual(r.stored, { overrides: { 'directions.intimate': 'My own words.' } });
  assert.deepEqual(r.otherStill, ['player', 'My own words.']);
  assert.deepEqual(r.cleared[0], ['default', INTIMATE]);
  assert.deepEqual(r.cleared[1], ['pack', 'Slow, and say it plainly.']);
  assert.deepEqual(r.cleared[2], { overrides: {} }, 'perPack(id) is always an object with overrides');
  assert.deepEqual(r.cleared[3], { 'marrow-bend': { overrides: { 'directions.intimate': 'Marrow words.' } } }, 'an emptied entry is dropped from the stored settings');
  assert.equal(r.mode, true, 'no override: the MODE text is the engine\'s, unchanged');
});

s.test('the memo: two lookups of an object path return the same frozen answer, a path outside PLAYER_PATHS has no player layer, and saveSettings invalidates so a changed override is seen at once', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack, St = Game.Storage;
    const a = P.lookup('narration.lengths'), b = P.lookup('narration.lengths');
    const out = { same: a === b, value: a.value === b.value, frozen: Object.isFrozen(a) && Object.isFrozen(a.value), layer: a.layer };
    out.d1 = P.get('directions.intimate').slice(0, 15);
    St.savePerPack('low-water', { overrides: { 'directions.intimate': 'First.' } });
    out.d2 = P.get('directions.intimate');
    St.savePerPack('low-water', { overrides: { 'directions.intimate': 'Second.' } });
    out.d3 = P.get('directions.intimate');
    // A plain saveSettings (as Settings does) invalidates too: a hand-edited perPack is seen.
    St.saveSettings({ perPack: { 'low-water': { overrides: { 'directions.intimate': 'Third.' } } } });
    out.d4 = P.get('directions.intimate');
    out.after = P.lookup('narration.lengths') !== a;
    // A path the player may not set ignores a hand-written override (cleanSettings dropped it anyway).
    St.saveSettings({ perPack: { 'low-water': { overrides: { 'directions.combat': 'Nope.' } } } });
    out.combat = P.lookup('directions.combat').layer;
    // A pack copy that is not frozen is looked up afresh: no memo to go stale.
    const c = P.copy(P.builtIn());
    out.copy = P.lookup('narration.lengths', c) !== P.lookup('narration.lengths', c);
    return out;
  });
  assert.deepEqual(r, { same: true, value: true, frozen: true, layer: 'default', d1: 'INTIMATE SCENE.', d2: 'First.', d3: 'Second.', d4: 'Third.', after: true, combat: 'default', copy: true });
});

s.test('the migration: version 2 settings with intimateDirection reload as version 3 with the words as Low Water\'s override and no intimateDirection field (stored too); an empty direction migrates to no override; other choices are kept', async h => {
  const page = await h.open();
  const reloadWith = async saved => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, saved]);
    await page.reload();
    await page.waitForFunction(() => window.Game && window.Game.App);
    return page.evaluate(k => ({ live: JSON.parse(JSON.stringify(Game.Storage.settings())), stored: JSON.parse(localStorage.getItem(k)), layer: Game.Pack.lookup('directions.intimate').layer, mode: Game.Pipeline.intimateMode() }), KEY);
  };
  let r = await reloadWith({ settingsVersion: 2, narratorModel: 'claude-sonnet-5-5', textSize: 'L', intimateDirection: 'My words' });
  assert.equal(r.live.settingsVersion, 3);
  assert.equal(r.live.perPack['low-water'].overrides['directions.intimate'], 'My words');
  assert.equal('intimateDirection' in r.live, false);
  assert.equal(r.live.narratorModel, 'claude-sonnet-5-5', 'a version 2 choice of Sonnet is kept (not read as the v1 defaults)');
  assert.equal(r.live.textSize, 'L');
  assert.equal(r.stored.settingsVersion, 3, 'written back at once');
  assert.equal('intimateDirection' in r.stored, false);
  assert.deepEqual(r.stored.perPack, { 'low-water': { overrides: { 'directions.intimate': 'My words' } } });
  assert.equal(r.layer, 'player');
  assert.equal(r.mode, 'INTIMATE SCENE. My words');
  r = await reloadWith({ settingsVersion: 2, intimateDirection: '' });
  assert.equal(r.live.settingsVersion, 3);
  assert.deepEqual(r.live.perPack, {}, 'an empty direction is no override');
  assert.equal('intimateDirection' in r.live, false);
  assert.equal(r.layer, 'default');
  // A version 3 object never migrates a stray intimateDirection.
  r = await reloadWith({ settingsVersion: 3, intimateDirection: 'Stray' });
  assert.deepEqual(r.live.perPack, {});
});

s.test('cleanSettings whitelists perPack: an unknown path, a non-slug id and a non-boolean for a boolean path are dropped, narration.preset must be a style, a 20,000-character direction is capped at 3,000 with control characters stripped and line breaks kept', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const St = Game.Storage;
    const long = 'a\u0000b\u0007c\td\ne\u001b\u007f\u0085' + 'x'.repeat(20000);
    const out = St.cleanSettings({
      settingsVersion: 3,
      perPack: {
        'low-water': {
          overrides: {
            'directions.intimate': '  ' + long, 'directions.combat': 'not a player path', 'rules.permadeath': true, 'rules.undo': 'yes',
            'rules.cheats.allowed': false, 'narration.preset': 'flowery', 'rules.showRolls': 0, 'world.name': 'Elsewhere'
          },
          adultOk: true, playedAt: '2026-11-01T10:00:00.000Z', extra: 'dropped'
        },
        'Not A Slug': { overrides: { 'rules.permadeath': true } },
        'x': { overrides: { 'rules.permadeath': true } },
        'river-copy': { overrides: { 'narration.preset': 'literary' }, adultOk: 'yes', playedAt: 'never' },
        'empty-one': { overrides: { 'rules.undo': 'no' } },
        'not-an-object': 'text'
      }
    });
    const lw = out.perPack['low-water'];
    return { ids: Object.keys(out.perPack).sort(), keys: Object.keys(lw).sort(), paths: Object.keys(lw.overrides).sort(), dir: lw.overrides['directions.intimate'], rest: [lw.overrides['rules.permadeath'], lw.overrides['rules.cheats.allowed'], lw.adultOk, lw.playedAt], river: out.perPack['river-copy'], noField: !('intimateDirection' in out) };
  });
  assert.deepEqual(r.ids, ['low-water', 'river-copy'], 'a non-slug id, a one-letter id, an entry left empty and a non-object are dropped');
  assert.deepEqual(r.keys, ['adultOk', 'overrides', 'playedAt']);
  assert.deepEqual(r.paths, ['directions.intimate', 'rules.cheats.allowed', 'rules.permadeath'], 'unknown paths, a non-boolean and an unknown preset are dropped');
  assert.equal(r.dir.length, 3000, 'capped at 3,000');
  assert.equal(r.dir.slice(0, 8), 'abcd\nex' + 'x', 'control characters (tab too) stripped, the line break kept, trimmed');
  assert.ok(!/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/.test(r.dir));
  assert.deepEqual(r.rest, [true, false, true, '2026-11-01T10:00:00.000Z']);
  assert.deepEqual(r.river, { overrides: { 'narration.preset': 'literary' } }, 'a non-boolean adultOk and a bad date are dropped');
  assert.equal(r.noField, true);
});

s.test('the Settings screen: with no override the field shows the engine\'s text; a direction typed and left saves the override (layer player); Use the default clears it and shows the base text again; the hint names the pack', async h => {
  const page = await h.open();
  await page.click('#btn-settings');
  await page.waitForSelector('#set-intimate', { state: 'visible' });
  const r = await page.evaluate(() => {
    const G = Game, St = G.Storage, P = G.Pack;
    const ta = document.getElementById('set-intimate');
    const base = G.Pipeline.INTIMATE_MODE.replace(/^INTIMATE SCENE\.\s*/, '');
    const out = { shows: ta.value === base, hint: document.getElementById('set-intimate-hint').textContent };
    ta.value = '  Tender, and talk the whole way.  ';
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    out.saved = St.perPack('low-water').overrides['directions.intimate'];
    out.layer = P.lookup('directions.intimate').layer;
    // The engine's own words typed back are no override.
    ta.value = base; ta.dispatchEvent(new Event('change', { bubbles: true }));
    out.same = St.perPack('low-water').overrides;
    ta.value = 'Mine again.'; ta.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('set-intimate-reset').click();
    out.reset = [St.perPack('low-water').overrides, ta.value === base, P.lookup('directions.intimate').layer];
    return out;
  });
  assert.equal(r.shows, true);
  assert.match(r.hint, /^What the narrator is told when someone says yes to the night in Low Water\. Edit it to change how those scenes are written here/);
  assert.equal(r.saved, 'Tender, and talk the whole way.');
  assert.equal(r.layer, 'player');
  assert.deepEqual(r.same, {});
  assert.deepEqual(r.reset, [{}, true, 'default']);
});

s.test('the Settings screen with a Library pack that has its own directions.intimate selected: the field shows the pack\'s direction as the default, the hint names that pack (as text), and an override saved there is that pack\'s alone', async h => {
  const page = await h.open();
  await page.evaluate(() => Game.Storage.Library.ready);
  await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'marrow-bend';
    p.meta.title = 'Marrow Bend & Sons';
    p.directions = { intimate: 'Write it the Marrow Bend way.' };
    Game.Storage.Library.put(p, { source: 'created' });
    Game.Storage.saveSettings({ selectedPackId: 'marrow-bend' });
  });
  await page.click('#btn-settings');
  await page.waitForSelector('#set-intimate', { state: 'visible' });
  const r = await page.evaluate(() => {
    const G = Game, St = G.Storage;
    const ta = document.getElementById('set-intimate');
    const hint = document.getElementById('set-intimate-hint');
    const out = { shows: ta.value, hint: hint.textContent, children: hint.children.length };
    ta.value = 'Marrow, my way.'; ta.dispatchEvent(new Event('change', { bubbles: true }));
    out.mine = [St.perPack('marrow-bend').overrides['directions.intimate'], St.perPack('low-water').overrides['directions.intimate']];
    const sel = G.Pack.selected();
    out.layer = G.Pack.lookup('directions.intimate', sel).layer;
    document.getElementById('set-intimate-reset').click();
    out.reset = [ta.value, St.perPack('marrow-bend').overrides, G.Pack.lookup('directions.intimate', sel).layer];
    return out;
  });
  assert.equal(r.shows, 'Write it the Marrow Bend way.');
  assert.match(r.hint, /says yes to the night in Marrow Bend & Sons\./);
  assert.equal(r.children, 0, 'the title is text, never markup');
  assert.deepEqual(r.mine, ['Marrow, my way.', undefined]);
  assert.equal(r.layer, 'player');
  assert.deepEqual(r.reset, ['Write it the Marrow Bend way.', {}, 'pack']);
});

/* The wave-36 intimate test's setup (tests/wave29-rel-hold.test.cjs): the
   player with Jodie at the Low Water at night, every gate met, and a Say
   line asking her to stay. */
async function night(page) {
  return page.evaluate(async () => {
    const G = Game, S = G.State;
    G.Api.Mock.delay = 0;
    S.apply({ setTime: { day: 6, phase: 'night' } });
    S.apply({ playerLocationId: 'loc_low_water' });
    S.apply({ visits: [{ npcId: 'npc_jodie', locationId: 'loc_low_water' }] });
    S.apply({ relSet: { npcId: 'npc_jodie', s: 55, m: 45, w: 45, t: 35, k: 35 } });
    G.Pipeline.hooks.nextTier = 'success';
    G.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Stay with me tonight.', targets: ['npc_jodie'], needsRoll: false, timeCost: 'instant', romantic: 'more' });
    await G.Pipeline.submit('Stay with me tonight.', { mode: 'say', to: 'npc_jodie' });
    const lines = G.Pipeline.lastTurn.packet.split('\n');
    const i = lines.findIndex(l => l.startsWith('MODE:'));
    return { mode: lines[i], before: lines[i - 1], directions: lines.filter(l => /^DIRECTION|^ENGINE:/.test(l)).length, romance: lines.find(l => /^ROMANCE/.test(l)) || null };
  });
}

s.test('the packet: with an override saved, a turn where someone says yes puts the override\'s words on the MODE line, byte for byte as wave 36 did, with M3-C\'s ENGINE trailer after it and nothing new before it; without one it is the engine\'s MODE text and no trailer', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const INTIMATE = await page.evaluate(() => Game.Pipeline.INTIMATE_MODE);
  const plain = await night(page);
  assert.match(plain.romance, /Jodie Strayhorn says yes/);
  assert.equal(plain.mode, 'MODE: ' + INTIMATE);
  await page.evaluate(() => Game.Storage.savePerPack('low-water', { overrides: { 'directions.intimate': '  Write it   my way,\nslowly.  ' } }));
  const own = await night(page);
  assert.match(own.romance, /says yes/);
  assert.equal(own.mode, 'MODE: INTIMATE SCENE. Write it my way, slowly.', 'whitespace folded as wave 36 did');
  // Wave 37, Creator Mode, M3-C (plan decision E): the override is a direction, so its MODE line is followed by the ENGINE trailer (tests/wave37-directions.test.cjs).
  assert.deepEqual([plain.directions, own.directions], [0, 1], 'the default: no trailer; the override: the one ENGINE line');
  assert.ok(!/^DIRECTION|^ENGINE:/.test(own.before), 'nothing new just before MODE: ' + own.before);
});

s.run();
