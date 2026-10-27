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

s.test('the inlined town is the only town, with no placeholder data and no content/ staging folder', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.equal(html.split(BEGIN).length, 2, 'BEGIN marker once');
  assert.equal(html.split(END).length, 2, 'END marker once');
  const block = html.slice(html.indexOf(BEGIN), html.indexOf(END));
  for (const name of ['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES']) assert.match(block, new RegExp(`\\nconst ${name} = `), name);
  for (const gone of ['Tallow Ford', 'Hobb Tanner', 'Jory Pike', 'PLACEHOLDER', 'placeholder data']) assert.ok(!html.includes(gone), 'leftover: ' + gone);
  assert.ok(!fs.existsSync(path.join(ROOT, 'content')), 'content/ was removed after inlining');
  const page = await h.open();
  const info = await page.evaluate(() => ({ name: Game.data.TOWN_DATA.name, errors: Game.Town.validate(Game.data.TOWN_DATA), title: document.getElementById('title-name').textContent, doc: document.title, npcs: Game.data.TOWN_DATA.npcs.length, locs: Game.data.TOWN_DATA.locations.length }));
  assert.ok(info.name && block.includes(`name: "${info.name}",`), 'the town in the block is the town in the page');
  assert.deepEqual(info.errors, []);
  assert.equal(info.title, info.name, 'title screen');
  assert.equal(info.doc, info.name, 'document title');
  assert.ok(info.npcs >= 12 && info.npcs <= 15);
  assert.ok(info.locs >= 8 && info.locs <= 10);
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
