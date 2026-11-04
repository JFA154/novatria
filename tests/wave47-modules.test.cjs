'use strict';
/* Wave 47 (module hygiene): helpers that several modules kept their own copy
   of are defined once, in the helpers (escRe, isPoliceNpc, weekdayOf), and
   the same-name functions that do different jobs have names of their own;
   the police are the police by tag or role from Rel's callers and World's
   alike; the mock provider is its own module, Mock, right after Api, with
   Api.Mock (and its two phrase lists) reading through to it. Mock mode.
   Run with: node tests/run.cjs wave47 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, sendText, ROOT } = require('./helpers.cjs');

const s = suite('wave47-modules');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const count = re => (html.match(re) || []).length;

const BANNERS = ['Rng', 'Dice', 'Cards', 'Tables', 'State', 'Rel', 'Town', 'World', 'Style', 'Api', 'Mock', 'Upgrade', 'Pipeline', 'Storage', 'UI', 'Commands', 'App'];

s.test('source: each moved helper is defined once, in the helpers; the old copies are gone; same-name functions doing different jobs are defined once each', async () => {
  const helpers = html.slice(html.indexOf('// ===== Helpers ====='), html.indexOf('// ===== Module: Rng ====='));
  for (const name of ['escRe', 'isPoliceNpc', 'weekdayOf']) {
    const def = new RegExp(`(?:function ${name}\\(|(?:const|let) ${name}\\s*=)`, 'g');
    assert.equal(count(def), 1, `${name} is defined once`);
    assert.equal((helpers.match(def) || []).length, 1, `${name} is in the helpers`);
  }
  // The other names the copies went by.
  for (const old of ['escMock', 'apptEsc']) assert.equal(count(new RegExp(`\\b${old}(?:\\(|\\s*=)`, 'g')), 0, `${old} is gone`);
  assert.equal(count(/const esc = x =>/g), 0, "the mock's two esc copies are gone");
  // Same name, a different job (Pipeline's now have names of their own).
  for (const name of ['obligationText', 'tieWords', 'household', 'firstName']) {
    assert.equal(count(new RegExp(`function ${name}\\(`, 'g')), 1, `one function ${name}`);
  }
  for (const name of ['obligationClause', 'isToWords', 'rumourHousehold', 'firstWord']) {
    assert.equal(count(new RegExp(`function ${name}\\(`, 'g')), 1, `one function ${name}`);
  }
});

s.test('source: the module banners are in order, with Cards, Upgrade and Mock; Mock comes right after Api; every module is on Game', async h => {
  const found = [...html.matchAll(/^\/\/ ===== Module: (\w+) =====$/gm)].map(m => m[1]);
  assert.deepEqual(found, BANNERS);
  assert.equal(found.indexOf('Mock'), found.indexOf('Api') + 1);
  const page = await h.open();
  const r = await page.evaluate(names => names.filter(n => !Game[n] || typeof Game[n] !== 'object'), BANNERS);
  assert.deepEqual(r, [], 'every module is exposed on Game');
});

s.test('Game.Mock is the mock provider; the Api re-exports resolve to the same objects and functions; the minor rule\'s phrase list stays on Api', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const A = Game.Api, M = Game.Mock;
    return {
      same: A.Mock === M, name: M.name,
      fns: ['queue', 'clear', 'take', 'parse', 'narrate', 'bookkeep', 'chronicle', 'rewriteMemories', 'revealPlaces', 'checkClock', 'fixPeople'].filter(k => typeof M[k] !== 'function' || A.Mock[k] !== M[k]),
      romance: A.MOCK_ROMANCE === M.MOCK_ROMANCE && M.MOCK_ROMANCE instanceof RegExp,
      more: A.MOCK_MORE === M.MOCK_MORE && M.MOCK_MORE instanceof RegExp,
      calls: A.Mock.calls === M.calls, pending: A.Mock.pending === M.pending,
      minor: typeof A.minorPhraseHit === 'function' && A.minorPhraseHit('want to spend the night?') && !!A.MINOR_ROMANCE_PHRASES.strong,
      refusal: typeof A.refusalOf === 'function' && A.refusalOf({ category: 'c' }).category === 'c'
    };
  });
  assert.equal(r.same, true);
  assert.equal(r.name, 'mock');
  assert.deepEqual(r.fns, []);
  assert.equal(r.romance, true);
  assert.equal(r.more, true);
  assert.equal(r.calls, true);
  assert.equal(r.pending, true);
  assert.equal(r.minor, true);
  assert.equal(r.refusal, true);
});

s.test('the offline demo runs a turn through Game.Mock: parser, narrator and bookkeeper are its calls, and a queued narration is told', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => { Game.Mock.delay = 0; Game.Mock.clear(); });
  await sendText(page, 'I look around.');
  const first = await page.evaluate(() => ({ provider: Game.Api.providerName(), methods: Game.Mock.calls.map(c => c.method), turn: Game.state.meta.turn }));
  assert.equal(first.provider, 'mock');
  for (const m of ['parse', 'narrate', 'bookkeep']) assert.ok(first.methods.includes(m), `${m} went through Game.Mock`);
  await page.evaluate(() => Game.Mock.queue('narrate', 'The jukebox skips and nobody looks up.'));
  await sendText(page, 'I wait a moment.');
  const second = await page.evaluate(() => ({ text: Game.state.log[Game.state.log.length - 1].narration, left: Game.Api.Mock.pending.narrate.length, turn: Game.state.meta.turn }));
  assert.equal(second.text, 'The jukebox skips and nobody looks up.');
  assert.equal(second.left, 0, 'queued on Game.Mock, taken by Api');
  assert.equal(second.turn, first.turn + 1);
});

s.test('isPoliceNpc: one answer for every cast member from Rel\'s callers and World\'s; the old tag-only copy differed only for people with no public home', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const R = Game.Rel, W = Game.World;
    const cast = Game.town.npcs.concat(Game.state.npcs);
    const tagOnly = n => (n.tags || []).includes('police');
    const differ = Game.state.npcs.filter(n => tagOnly(n) !== R.isPoliceNpc(n));
    return {
      same: R.isPoliceNpc === W.isPoliceNpc,
      disagree: cast.filter(n => R.isPoliceNpc(n) !== W.isPoliceNpc(n)).map(n => n.id),
      police: Game.state.npcs.filter(n => R.isPoliceNpc(n)).map(n => n.id).sort(),
      differ: differ.map(n => n.id).sort(),
      // A home the rough-sleeping check could read: in town and not a dwelling (World's PRIVATE_TYPES).
      differHomes: differ.map(n => n.home && n.home.locationId ? Game.State.loc(n.home.locationId) : null)
        .filter(l => l && l.away !== true && !['house', 'trailer', 'apartment', 'farm', 'bighouse', 'home'].includes(l.type)).map(l => l.id)
    };
  });
  assert.equal(r.same, true, 'one function');
  assert.deepEqual(r.disagree, []);
  assert.deepEqual(r.police, ['npc_glenda', 'npc_hoyt', 'npc_marcus', 'npc_nikki', 'npc_teresa', 'npc_travis']);
  // The dispatcher, the away sheriff and the parole officer say police by role only; none lives at a public place in town (a house, an office away, nowhere), so no place's rough-sleeping answer moves.
  assert.deepEqual(r.differ, ['npc_glenda', 'npc_hoyt', 'npc_teresa']);
  assert.deepEqual(r.differHomes, []);
});

s.test('sleeping rough: a deputy by role (no police tag) living at the station leaves it public, as the police do; anyone else living there makes it private', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const l = st.locations.find(x => x.type === 'police' && !x.away);
    const lodger = st.npcs.find(n => !G.Rel.isPoliceNpc(n) && n.alive !== false && !G.Rel.isMinor(n) && n.home && n.home.locationId && n.home.locationId !== l.id);
    const run = role => {
      lodger.role = role;
      lodger.home = Object.assign({}, lodger.home, { locationId: l.id });
      st.flags.roughNights = 0;
      S.apply({ playerLocationId: l.id });
      G.World.sleptRough('rough');
      return st.flags.roughNights | 0;
    };
    const tags = (lodger.tags || []).slice();
    return { florist: run('florist'), deputy: run("the sheriff's deputy"), tagged: tags.includes('police') };
  });
  assert.equal(r.tagged, false);
  assert.equal(r.florist, 0, 'someone lives there: not public');
  assert.equal(r.deputy, 1, 'the law lives there: still public');
});

s.run();
