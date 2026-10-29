'use strict';
/* The town inlined in index.html between the BEGIN/END CONTENT markers: it
   is the only town (no placeholder data left), it validates in the page and
   with tests/validate-town.cjs (which also catches a bad hand edit), and
   every background and loose end starts a playable game. Names and counts
   come from the data, so this suite survives a change of town. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { suite, quickStart, ROOT, GAME_PATH } = require('./helpers.cjs');

const s = suite('content');
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';

s.test('the inlined town is the only town, with no placeholder data and no content/ or content-modern/ staging folder', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.equal(html.split(BEGIN).length, 2, 'BEGIN marker once');
  assert.equal(html.split(END).length, 2, 'END marker once');
  const block = html.slice(html.indexOf(BEGIN), html.indexOf(END));
  for (const name of ['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES']) assert.match(block, new RegExp(`\\nconst ${name} = `), name);
  for (const gone of ['Tallow Ford', 'Hobb Tanner', 'Jory Pike', 'PLACEHOLDER', 'placeholder data']) assert.ok(!html.includes(gone), 'leftover: ' + gone);
  for (const dir of ['content', 'content-modern']) assert.ok(!fs.existsSync(path.join(ROOT, dir)), dir + '/ was removed after inlining');
  const page = await h.open();
  const info = await page.evaluate(() => ({ name: Game.data.TOWN_DATA.name, errors: Game.Town.validate(Game.data.TOWN_DATA), title: document.getElementById('title-name').textContent, doc: document.title, npcs: Game.data.TOWN_DATA.npcs.length, locs: Game.data.TOWN_DATA.locations.filter(l => l.discovered !== false).length, homes: Game.data.TOWN_DATA.locations.filter(l => l.discovered === false).length }));
  assert.ok(info.name && block.includes(`name: "${info.name}",`), 'the town in the block is the town in the page');
  assert.deepEqual(info.errors, []);
  assert.equal(info.title, info.name, 'title screen');
  assert.equal(info.doc, info.name, 'document title');
  assert.ok(info.npcs >= 40 && info.npcs <= 45, 'the full cast, 40 to 45 people: ' + info.npcs);
  assert.ok(info.locs >= 8 && info.locs <= 10, 'town places: ' + info.locs);
  assert.ok(info.homes >= 1 && info.homes <= 12, 'homes to find: ' + info.homes);
});

s.test('validate-town.cjs passes on index.html and catches a hand-editing mistake', async h => {
  const page = await h.open();
  const t = await page.evaluate(() => ({ name: Game.data.TOWN_DATA.name, locs: Game.data.TOWN_DATA.locations.length, npcs: Game.data.TOWN_DATA.npcs.length }));
  const ok = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.startsWith(`OK ${t.name}: ${t.locs} locations, ${t.npcs} npcs`), ok.stdout);
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  // Point the first exit of the first location at a place that does not exist.
  const at = html.indexOf(BEGIN);
  const m = /exits: \[\s*"(loc_[a-z0-9_]+)"/.exec(html.slice(at));
  assert.ok(m, 'found an exits list');
  const cut = at + m.index;
  const broken = html.slice(0, cut) + m[0].replace(m[1], 'loc_nowhere') + html.slice(cut + m[0].length);
  assert.notEqual(broken, html, 'the edit applied');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-')), 'index.html');
  fs.writeFileSync(tmp, broken);
  const bad = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /loc_nowhere/);
  const quoted = html.replace(`name: "${t.name}",`, `name: '${t.name}',`);
  assert.notEqual(quoted, html, 'the quote edit applied');
  fs.writeFileSync(tmp, quoted);
  const bad2 = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
  assert.equal(bad2.status, 1);
  assert.match(bad2.stderr, /single-quoted/);
});

s.test('the cast: everyone written by hand with a home, relations both ways and a place every phase; docs/CAST.md matches it; a new game has them all, castFixed, and nobody is ever made', async h => {
  // The roster is generated from the data and kept in sync.
  const doc = spawnSync(process.execPath, [path.join(__dirname, 'cast-doc.cjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(doc.status, 0, doc.stderr);
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'CAST.md'), 'utf8');
  const page = await h.open();
  const T = await page.evaluate(() => Game.data.TOWN_DATA);
  for (const n of T.npcs) assert.ok(md.includes(`**${n.name}** (`) && md.includes('`' + n.id + '`'), 'CAST.md lists ' + n.id);
  assert.equal((md.match(/^- \*\*/gm) || []).length, T.npcs.length + (T.offstage || []).length + Object.keys(await page.evaluate(() => Game.data.LOOSE_ENDS)).length, 'one line per person, offstage name and loose end');
  for (const l of T.locations.filter(x => T.npcs.some(n => n.home === x.id))) assert.ok(md.includes(`## ${l.name}`), 'a section per home: ' + l.id);
  // In a new game: the whole cast, every one somewhere in every phase, castFixed.
  await quickStart(page, { kinds: ['debt', 'enemy', 'lost'] });
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const nowhere = [];
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) for (const n of st.npcs) if (!st.locations.some(l => G.State.npcsAt(l.id, ph).some(x => x.id === n.id))) nowhere.push(`${n.id} ${ph}`);
    const asym = [];
    for (const n of st.npcs) for (const t of n.relations || []) if (!(G.State.npc(t.npcId).relations || []).some(x => x.npcId === n.id)) asym.push(`${n.id} -> ${t.npcId}`);
    return {
      fixed: st.meta.castFixed, npcs: st.npcs.length, ids: st.npcs.map(n => n.id), nowhere, asym,
      homes: st.npcs.filter(n => !n.home || !G.State.loc(n.home.locationId) || !n.home.phases.length).map(n => n.id),
      undiscovered: st.locations.filter(l => !l.discovered).map(l => l.id), made: st.npcs.filter(n => n.created).map(n => n.id),
      tied: st.player.looseEnds.map(le => le.npcId)
    };
  });
  assert.equal(r.fixed, true, 'a new game has meta.castFixed');
  assert.deepEqual(r.ids, T.npcs.map(n => n.id), 'exactly the cast, in order');
  assert.deepEqual(r.nowhere, [], 'World.whereIs always answers: everyone is somewhere in every phase');
  assert.deepEqual(r.asym, [], 'relations are written on both sides');
  assert.deepEqual(r.homes, [], 'everyone has a home they are at in some phase');
  assert.deepEqual(r.undiscovered, T.locations.filter(l => l.discovered === false).map(l => l.id), 'the homes start undiscovered');
  assert.deepEqual(r.made, [], 'nobody was made, the loose ends included');
  assert.ok(r.tied.every(id => T.npcs.some(n => n.id === id)), 'every loose end is someone in the cast');
});

s.test('every background starts at its arrival point and every loose end resolves, then a turn runs', async h => {
  const page = await h.open();
  const bgs = await page.evaluate(() => Game.data.BACKGROUNDS.map(b => b.id));
  assert.equal(bgs.length, 6);
  const kinds = ['debt', 'enemy', 'secret', 'lost', 'promise'];
  for (let i = 0; i < bgs.length; i++) {
    const pick = [kinds[i % 5], kinds[(i + 1) % 5], kinds[(i + 2) % 5]];
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { bgIndex: i, kinds: pick, seed: 1000 + i });
    const r = await page.evaluate(async () => {
      const G = Game;
      const st = G.state;
      const bg = G.data.BACKGROUNDS.find(b => b.id === st.player.backgroundId);
      const res = await G.Pipeline.submit('I look around');
      return { loc: st.player.locationId, want: G.town.startLocationIds[bg.arrival], le: G.state.player.looseEnds.length, opening: G.state.log[0].narration, ok: res.ok, json: G.Storage.exportJson().length, log: G.state.log.length };
    });
    assert.equal(r.loc, r.want, bgs[i]);
    assert.equal(r.le, 3);
    assert.ok(r.opening.length > 40);
    assert.ok(r.ok);
    assert.equal(r.log, 2);
    assert.ok(r.json > 1000);
  }
});

s.run();
