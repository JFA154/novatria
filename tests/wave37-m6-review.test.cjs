'use strict';
/* Wave 37, Creator Mode, milestone 6 (task M6-E1, the R6 review's fixes):
   M1, a draft edit made just before the page goes away is kept (Drafts.put
   writes at once with the database open; the editor saves on a hidden page
   as on pagehide); M3, the story pass is kept against a fingerprint of what
   it reads, so an edit outside world, player and narration checks in a
   fraction of the time, and check() waits for an idle moment 300 ms after
   the last change; S3, a draft saved in another tab replaces this tab's
   older copy, with a toast; S4, a packet built in State.sandbox (the Prompt
   view) leaves the live game's style check alone; N4, Town's person and
   place words follow the pack that plays.
   Mock mode. Run with: node tests/run.cjs wave37-m6-review */
const assert = require('assert/strict');
const { suite, quickStart, GAME_URL } = require('./helpers.cjs');

const s = suite('wave37-m6-review');

/* A page with the Library and the drafts read, and the mock answering at once. */
async function ready(page) {
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
const open = async h => ready(await h.open({ contextOptions: { reducedMotion: 'reduce' } }));
/* The built-in story's copy as a draft, open in the editor; its draft id. */
async function openCopy(page, id) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  const did = await page.evaluate(id => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = id;
    p.meta.title = 'Review Copy';
    const dr = Game.Storage.Drafts.put({ pack: p });
    Game.Creator.openEditor(dr.id);
    return dr.id;
  }, id || 'review-copy');
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  return did;
}
/* The draft's record as the store "drafts" holds it now (not the in-memory map). */
const stored = (page, id) => page.evaluate(id => Game.Storage.tx('drafts', 'readonly', st => st.get(id)).then(r => (r ? r.pack.meta.title : null)), id);
const toast = page => page.waitForFunction(() => document.getElementById('toast').classList.contains('show')).then(() => page.textContent('#toast'));

s.test('M1: a title typed and the page reloaded within 100 ms reopens with the typed title; a hidden page writes the draft to the store at once, not 500 ms later', async h => {
  const page = await open(h);
  const id = await openCopy(page);
  await page.fill('#creator-body [data-path="meta.title"]', 'Typed Then Gone');
  // No wait: the reload is the next thing (pagehide saves, and the write must start before the page is gone).
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await ready(page);
  assert.equal(await page.evaluate(id => Game.Storage.Drafts.get(id).pack.meta.title, id), 'Typed Then Gone', 'the draft kept the title typed before the reload');
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  await page.evaluate(id => Game.Creator.openEditor(id), id);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  assert.equal(await page.inputValue('#creator-body [data-path="meta.title"]'), 'Typed Then Gone', 'the editor reopens with it');
  // A hidden page (a phone switching apps, which may never send pagehide): the store has the new title at once.
  await page.fill('#creator-body [data-path="meta.title"]', 'Hidden Now');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await stored(page, id), 'Hidden Now', 'written on visibilitychange, before the 500 ms autosave');
});

s.test('M3: the story pass is kept from the last check, so a check after a meta edit costs well under one after a world edit, and still finds what the world holds; check() waits 300 ms and an idle moment after a change (timings logged)', async h => {
  const page = await open(h);
  await openCopy(page);
  const r = await page.evaluate(() => {
    const E = Game.Creator.Editor;
    const d = () => Game.Creator.state.draft;
    const world = [];
    const meta = [];
    for (let i = 0; i < 5; i++) {
      E.set('world.npcs[0].history', d().world.npcs[0].history + ' x');
      E.check();
      world.push(E.checkMs);
      E.set('meta.description', 'Edit ' + i);
      E.check();
      meta.push(E.checkMs);
    }
    // A story error in the world: a thread linked to nobody there. The meta edit after it keeps it; putting the link back clears it.
    const was = d().world.threads[0].linkedIds.slice();
    E.set('world.threads[0].linkedIds', ['npc_nobody_here']);
    const found = E.check().some(p => p.rule === 'engine.thread.links');
    E.set('meta.description', 'After the bad link');
    const kept = E.check().some(p => p.rule === 'engine.thread.links');
    E.set('world.threads[0].linkedIds', was);
    const cleared = !E.check().some(p => p.rule === 'engine.thread.links');
    return { world, meta, found, kept, cleared };
  });
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`        check() on the built-in copy: after a world edit ${r.world.map(x => x.toFixed(0)).join(', ')} ms; after a meta edit ${r.meta.map(x => x.toFixed(0)).join(', ')} ms`);
  assert.ok(med(r.meta) < med(r.world) * 0.6, `a meta edit re-runs only the cheap rules: ${med(r.meta)} against ${med(r.world)} ms`);
  assert.ok(med(r.meta) < 1000, 'a loose bound for a slow machine');
  assert.deepEqual([r.found, r.kept, r.cleared], [true, true, true], 'the kept pass is the right one: found, kept over a meta edit, cleared when fixed');
  // The schedule: nothing 150 ms after a change, a check within a couple of seconds.
  await page.evaluate(() => { window.__p = Game.Creator.Editor.problems; Game.Creator.Editor.set('meta.description', 'Scheduled'); });
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => Game.Creator.Editor.problems === window.__p), true, 'no check 150 ms after the change (CHECK_MS is 300)');
  await page.waitForFunction(() => Game.Creator.Editor.problems !== window.__p, null, { timeout: 3000 });
});

s.test('S3: two tabs on one draft: a save in one replaces the other\'s older copy, with a toast, and back the other way', async h => {
  const a = await open(h);
  const id = await openCopy(a, 'two-tabs');
  const b = await a.context().newPage();
  b.on('pageerror', e => h.errors.push(e));
  await b.goto(GAME_URL);
  await b.waitForFunction(() => window.Game && window.Game.App);
  await ready(b);
  await b.click('#btn-create');
  await b.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  await b.evaluate(id => Game.Creator.openEditor(id), id);
  await b.waitForSelector('#creator-body [data-path="meta.title"]');
  assert.equal(await b.inputValue('#creator-body [data-path="meta.title"]'), 'Review Copy');
  // Tab A edits and saves: tab B reloads the draft and says why.
  await a.evaluate(() => { Game.Creator.Editor.set('meta.title', 'From Tab A'); Game.Creator.Editor.saveNow(); });
  assert.equal(await toast(b), 'This story changed in another tab.');
  assert.equal(await b.evaluate(() => Game.Creator.state.draft.meta.title), 'From Tab A');
  assert.equal(await b.inputValue('#creator-body [data-path="meta.title"]'), 'From Tab A', 'the form shows it');
  assert.equal(await b.evaluate(id => Game.Storage.Drafts.get(id).pack.meta.title, id), 'From Tab A');
  // And back: tab B saves, tab A follows.
  await b.evaluate(() => { Game.Creator.Editor.set('meta.title', 'From Tab B'); Game.Creator.Editor.saveNow(); });
  assert.equal(await toast(a), 'This story changed in another tab.');
  assert.equal(await a.evaluate(() => Game.Creator.state.draft.meta.title), 'From Tab B');
});

s.test('S4: a Prompt view packet (the intimate situation, built in State.sandbox) leaves the live game\'s style check alone: the live packet\'s names stay known and the preview\'s are not', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const live = 'Zebediah walked in with the paper.';
    Game.Style.notePacket(live);
    const before = Game.Style.unknownNames('Zebediah said hello.');
    // A preview whose people all have names the live game has never heard.
    const d = Game.Pack.copy(Game.Pack.builtIn());
    d.meta.id = 'r6-sandbox';
    d.world.npcs.forEach(n => { const p = n.name.split(' '); p[0] = 'Qu' + p[0].toLowerCase(); n.name = p.join(' '); });
    const b = Game.Creator.Preview.build(d, 'intimate');
    const previewNames = Array.from(new Set((b.packet.match(/\bQu[a-z]+/g) || [])));
    return {
      before, after: Game.Style.unknownNames('Zebediah said hello.'),
      previewNames, unknown: previewNames.map(n => Game.Style.unknownNames(n + ' said hello.')),
      sandboxed: Game.State.sandboxed, pack: Game.Pack.current().meta.id
    };
  });
  assert.deepEqual(r.before, []);
  assert.deepEqual(r.after, [], 'the live packet\'s name is still known after the preview');
  assert.ok(r.previewNames.length > 0, 'the preview\'s packet names someone: ' + JSON.stringify(r.previewNames));
  assert.deepEqual(r.unknown, r.previewNames.map(n => [n]), 'the live game does not know the preview\'s names');
  assert.equal(r.sandboxed, false);
  assert.equal(r.pack, 'low-water');
});

s.test('N4: a preview whose tables add an occupation and a place type makes Town read them (person regex, place type, guessKind); setPreview(null) goes back', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const T = Game.Town;
    const read = () => ({ person: T.isPersonWord('zookeeper'), place: T.placeType('the old gazebo'), kind: T.guessKind('new: a zookeeper') });
    const first = read();
    const d = Game.Pack.copy(Game.Pack.builtIn());
    d.meta.id = 'r6-zoo';
    d.world.tables.npc.occupations = d.world.tables.npc.occupations.concat(['zookeeper']);
    d.world.tables.location.types = (d.world.tables.location.types || []).concat(['gazebo']);
    Game.Pack.setPreview(d);
    const preview = read();
    Game.Pack.setPreview(null);
    const back = read();
    return { first, preview, back };
  });
  assert.equal(r.first.person, false);
  assert.equal(r.first.place, 'place');
  assert.deepEqual(r.preview, { person: true, place: 'gazebo', kind: 'npc' }, 'the second pack\'s own words');
  assert.deepEqual(r.back, r.first, 'and back to the built-in pack\'s');
});

s.run();
