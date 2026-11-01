'use strict';
/* Builds a saved game from before wave 26 (rules version 8, the build at
   56e69f5), the fixture tests/wave30-rel-people.test.cjs updates to rules
   version 9. It takes that commit's index.html out of git into a temporary
   file, plays a short scripted game in it headless with the mock (an
   insult, a gift, a favour, a confidence that warms someone to 50, a debt
   gone past due with the repo man's own line, the same line once more as
   the old editor left it with its act stripped, a few nights), and returns
   the save as Storage.envelope wrote it.
   Usage: node tests/fixtures/make-v8-save.cjs [out.json] (prints the size;
   with a path, writes it there). Used by the test through makeV8Save(). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const COMMIT = '56e69f5';

async function makeV8Save(browser) {
  let html;
  try {
    html = execFileSync('git', ['show', `${COMMIT}:index.html`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  } catch (e) {
    // A shallow clone (actions/checkout's default depth) lacks the commit: say so, not git's own words.
    throw new Error(`make-v8-save needs commit ${COMMIT} in the git history (a shallow clone lacks it: fetch the history, e.g. git fetch --unshallow, or actions/checkout with fetch-depth: 0)`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-v8-'));
  const file = path.join(tmp, 'index.html');
  fs.writeFileSync(file, html);
  const own = !browser;
  const b = browser || await chromium.launch();
  const context = await b.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.route('**/*', r => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    const page = await context.newPage();
    await page.goto('file://' + file);
    await page.waitForFunction(() => window.Game && window.Game.App);
    return await page.evaluate(async () => {
      const G = Game, S = G.State, M = G.Api.Mock, D = G.data;
      M.delay = 0;
      const bg = D.BACKGROUNDS[0];
      G.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
        looseEnds: ['debt', 'enemy', 'secret'].map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] })) }, { seed: 4242 });
      const put = (loc, ids) => { S.apply({ playerLocationId: loc }); S.apply({ visits: ids.map(id => ({ npcId: id, locationId: loc })) }); };
      const say = async (to, words, book) => {
        M.queue('parse', { actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant' });
        M.queue('bookkeep', book);
        await G.Pipeline.submit(words, { mode: 'say', to });
      };
      S.apply({ npcKnownToPlayer: ['npc_royce', 'npc_loretta', 'npc_burl', 'npc_elbert'] });
      // Day 1: an insult to Royce at his own counter.
      put('loc_pittmans', ['npc_royce']);
      await say('npc_royce', 'You are a liar and everybody knows it.', { attitudeChanges: [{ npcId: 'npc_royce', delta: -10, reason: 'called him a liar' }], newMemories: [{ npcId: 'npc_royce', text: 'called me a liar in my own station', weight: 2 }] });
      // A beer for Loretta at the Low Water.
      put('loc_low_water', ['npc_loretta', 'npc_burl']);
      await say('npc_loretta', 'Let me buy you one.', { attitudeChanges: [{ npcId: 'npc_loretta', delta: 5, reason: 'a beer' }], newMemories: [{ npcId: 'npc_loretta', text: 'bought me a beer at the bar', weight: 2 }] });
      // A favour for Burl.
      await say('npc_burl', 'I can give you a hand with that motor.', { attitudeChanges: [{ npcId: 'npc_burl', delta: 8, reason: 'the motor' }], newMemories: [{ npcId: 'npc_burl', text: 'helped carry the outboard motor down to the ramp', weight: 2 }] });
      await G.Pipeline.submit('/rest');
      // Day 2: Elbert, two long talks and a confidence kept: attitude 50 with a good memory (the old gate had his secret open).
      put('loc_low_water', ['npc_elbert']);
      await say('npc_elbert', 'I will not tell a soul.', { attitudeChanges: [{ npcId: 'npc_elbert', delta: 25, reason: 'kept his word' }], newMemories: [{ npcId: 'npc_elbert', text: 'kept quiet about what I told them and stood up for me', weight: 3 }] });
      await say('npc_elbert', 'You can count on me.', { attitudeChanges: [{ npcId: 'npc_elbert', delta: 25, reason: 'trusted' }] });
      const elbert = S.npc('npc_elbert');
      if (elbert.attitude < 50) S.apply({ effects: [{ op: 'attitudeDelta', npcId: 'npc_elbert', delta: 50 - elbert.attitude }] });
      await G.Pipeline.submit('/rest');
      // The debt gone past due, as the 56e69f5 content wrote it (the repo man's own act), and the same line as the old editor left it (act stripped).
      const debtor = G.state.player.looseEnds.find(le => le.kind === 'debt').npcId;
      S.apply({ effects: [{ op: 'attitudeDelta', npcId: debtor, delta: -15 }, { op: 'addMemory', npcId: debtor, text: 'Tester let the six hundred go past due, so I took the phone as a start.', weight: 3, act: 'own' }] });
      const d = S.npc(debtor);
      d.memories.push({ turn: G.state.meta.turn, text: 'Tester let the six hundred go past due, so I took the phone as a start.', weight: 3 });
      await G.Pipeline.submit('/rest');
      return { env: G.Storage.envelope('Before wave 26'), debtor, rules: G.State.RULES_VERSION };
    });
  } finally {
    await context.close();
    if (own) await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { makeV8Save, COMMIT };

if (require.main === module) {
  makeV8Save().then(r => {
    const json = JSON.stringify(r.env);
    console.log(`rules ${r.rules}, ${(json.length / 1024).toFixed(1)} KB (state ${(JSON.stringify(r.env.state).length / 1024).toFixed(1)} KB, town ${(JSON.stringify(r.env.town).length / 1024).toFixed(1)} KB), debtor ${r.debtor}`);
    if (process.argv[2]) fs.writeFileSync(process.argv[2], json);
  }).catch(e => { console.error(e); process.exit(1); });
}
