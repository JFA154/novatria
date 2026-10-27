'use strict';
/* Pastes content/town-data.js over the placeholder block (in memory, as
   milestone 3 will do for real) and checks the engine runs on it: every
   background starts, every loose end resolves, and the state and shell suites
   pass again on the real town. Skips once content/ has been inlined and removed. */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');

const CONTENT_FILE = path.resolve(__dirname, '..', 'content', 'town-data.js');
if (!fs.existsSync(CONTENT_FILE)) {
  console.log('content\n  SKIP  content/town-data.js not present (already inlined)');
  console.log('RESULT content: passed=0 failed=0');
  process.exit(0);
}
// Must be set before helpers.cjs is loaded: it decides how pages are served.
process.env.NOVATRIA_CONTENT = '1';
const { suite, quickStart, ROOT } = require('./helpers.cjs');
const content = require(CONTENT_FILE);
const s = suite('content');

s.test('content/town-data.js pastes over the placeholders and every background and loose end starts cleanly', async h => {
  const page = await h.open();
  const info = await page.evaluate(() => ({ name: Game.data.TOWN_DATA.name, errors: Game.Town.validate(Game.data.TOWN_DATA), bgs: Game.data.BACKGROUNDS.length }));
  assert.equal(info.name, content.TOWN_DATA.name);
  assert.deepEqual(info.errors, []);
  assert.equal(info.bgs, content.BACKGROUNDS.length);
  const kinds = ['debt', 'enemy', 'secret', 'lost', 'promise'];
  for (let i = 0; i < content.BACKGROUNDS.length; i++) {
    const pick = [kinds[i % 5], kinds[(i + 1) % 5], kinds[(i + 2) % 5]];
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { bgIndex: i, kinds: pick, seed: 1000 + i });
    const r = await page.evaluate(async () => {
      const G = Game;
      const st = G.state;
      const bg = G.data.BACKGROUNDS.find(b => b.id === st.player.backgroundId);
      const res = await G.Pipeline.submit('I look around');
      return { loc: st.player.locationId, want: G.town.startLocationIds[bg.arrival], le: st.player.looseEnds.length, opening: st.log[0].narration, ok: res.ok, json: G.Storage.exportJson().length };
    });
    assert.equal(r.loc, r.want, content.BACKGROUNDS[i].id);
    assert.equal(r.le, 3);
    assert.ok(r.opening.length > 40);
    assert.ok(r.ok);
    assert.ok(r.json > 1000);
  }
});

for (const file of ['state.test.cjs', 'shell.test.cjs']) {
  s.test(`${file} passes on the real town`, async () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, file)], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { NOVATRIA_CONTENT: '1' }), maxBuffer: 64 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    const failures = out.split('\n').filter(l => /^\s+FAIL\s/.test(l) || /^\s{8}/.test(l));
    assert.equal(r.status, 0, `${file} failed with content:\n${failures.join('\n')}`);
  });
}

s.run();
