'use strict';
/* The game as it was before wave 37, Creator Mode, written down byte for
   byte: tests/fixtures/prompts-v36.json. Milestone 1 moves Low Water's
   content into a JSON story pack, and the owner's rule for it is "zero
   behaviour change. Prove it with a snapshot test showing that both styles'
   system prompts and the town and cast blocks are byte-identical to
   before". A snapshot taken from the working tree would measure the change
   against itself, so this takes commit 74cd698's index.html (the last build
   before the wave) out of git into a temporary file, opens it headless from
   file:// with the network blocked, quick-starts the tests' default
   character with seed 12345 in mock mode, and records: the two style
   system prompts, the town and cast blocks, the parser, bookkeeper,
   memories and chronicle system prompts (Game.Api.SYSTEM, exported in that
   build), the first turn's narrator packet, and a ten-input mock
   playthrough (log, journal, clock, player, turn, rng calls and the whole
   state with its one wall-clock field removed). tests/wave37-pack.test.cjs
   compares the live game against it.
   It needs the git history (a shallow clone lacks 74cd698) and nothing
   else: the preinstalled Playwright, no package. Re-running it writes the
   same bytes (no real timestamp anywhere in the file).
   Usage, from the repo root: node tests/fixtures/make-prompt-snapshot.cjs */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const COMMIT = '74cd698';
const OUT = path.join(__dirname, 'prompts-v36.json');
const SEED = 12345;
const INPUTS = [
  'I look around.',
  'I ask the person here what this place is.',
  'I buy a coffee.',
  'I try to persuade them to tell me about the town.',
  'I walk to the next place over.',
  'I search the room for anything useful.',
  'I pick a fight with whoever is here.',
  '/rest',
  'I look around.',
  'I ask about work.'
];
// The suite's token estimate for the cached blocks (tests/api.test.cjs): about 1.4 tokens a word.
const words = t => t.split(/\s+/).filter(Boolean).length;
const estimate = (style, town, cast) => Math.round((words(style) + words(town) + words(cast)) * 1.4);

async function makePromptSnapshot() {
  let html;
  try {
    html = execFileSync('git', ['show', `${COMMIT}:index.html`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  } catch (e) {
    // A shallow clone (actions/checkout's default depth) lacks the commit: say so, not git's own words.
    throw new Error(`make-prompt-snapshot needs commit ${COMMIT} in the git history (a shallow clone lacks it: fetch the history, e.g. git fetch --unshallow, or actions/checkout with fetch-depth: 0)`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-v36-'));
  const file = path.join(tmp, 'index.html');
  fs.writeFileSync(file, html);
  const browser = await chromium.launch();
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
    // As tests/helpers.cjs: only file:, blob: and data: URLs load.
    await context.route('**/*', r => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e));
    const loud = () => { if (errors.length) throw new Error('uncaught page error in ' + COMMIT + ': ' + errors.map(e => e.message).join(' | ')); };
    await page.goto('file://' + file);
    await page.waitForFunction(() => window.Game && window.Game.App);
    // tests/helpers.cjs quickStart, copied so this stays bound to the old build, not the working tree's helpers.
    await page.evaluate(seed => {
      const D = Game.data;
      const bg = D.BACKGROUNDS[0];
      Game.Api.Mock.delay = 0;
      Game.App.quickStart({
        name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats),
        goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
        looseEnds: ['debt', 'enemy', 'secret'].map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] }))
      }, { seed });
    }, SEED);
    await page.waitForSelector('#screen-game.active');
    await page.waitForFunction(() => !Game.Pipeline.busy);
    loud();
    const fixed = await page.evaluate(() => {
      const G = Game;
      if (!G.Api.SYSTEM) throw new Error('Game.Api.SYSTEM is not exported');
      const out = {
        casual: G.Style.systemPrompt('casual'),
        literary: G.Style.systemPrompt('literary'),
        town: G.Pipeline.townBlock(),
        cast: G.Pipeline.castBlock(),
        parser: G.Api.SYSTEM.parser,
        bookkeeper: G.Api.SYSTEM.bookkeeper,
        memories: G.Api.SYSTEM.memories,
        chronicle: G.Api.SYSTEM.chronicle
      };
      for (const [k, v] of Object.entries(out)) if (typeof v !== 'string' || !v) throw new Error(k + ' is not a non-empty string');
      // The arrival's own narrate call is not a turn: the first turn's packet is the first narrate call after this.
      G.Api.Mock.calls.length = 0;
      return out;
    });
    let firstPacket = null;
    const rolls = [];
    for (let i = 0; i < INPUTS.length; i++) {
      const logBefore = await page.evaluate(() => Game.state.log.length);
      // A refusal or a mock error is part of the record: keep going, whatever happened.
      await page.evaluate(text => Game.Pipeline.submit(text, { mode: 'do' }).catch(e => { window.__snapErr = String(e && e.message || e); }), INPUTS[i]);
      await page.waitForFunction(() => !Game.Pipeline.busy);
      loud();
      const turn = await page.evaluate(n => {
        const err = window.__snapErr || null;
        window.__snapErr = null;
        const calls = Game.Api.Mock.calls.filter(c => c.method === 'narrate');
        return { err, packet: calls.length ? calls[0].text : null, added: Game.state.log.slice(n) };
      }, logBefore);
      if (i === 0) {
        if (typeof turn.packet !== 'string') throw new Error('the first turn made no narrate call with a packet');
        firstPacket = turn.packet;
      }
      rolls.push({ input: INPUTS[i], err: turn.err, added: turn.added });
    }
    const play = await page.evaluate(() => {
      const st = Game.state;
      const copy = JSON.parse(JSON.stringify(st));
      // meta.createdAt is the one wall-clock write into state (new Date().toISOString() at newState); everything else is seeded.
      delete copy.meta.createdAt;
      const p = st.player;
      return {
        log: st.log, journal: st.journal, time: st.time,
        player: { hp: p.hp, gold: p.gold, inventory: p.inventory, conditions: p.conditions, storyPoints: p.storyPoints, locationId: p.locationId },
        turn: st.meta.turn, rngCalls: st.meta.rngCalls, stateJson: JSON.stringify(copy)
      };
    });
    loud();
    // Fail loudly if a timestamp got into the state after all: the fixture would not reproduce.
    const iso = play.stateJson.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    if (iso) throw new Error('a wall-clock timestamp is left in the state: ' + iso[0]);
    const snap = {
      casual: fixed.casual,
      literary: fixed.literary,
      town: fixed.town,
      cast: fixed.cast,
      parser: fixed.parser,
      bookkeeper: fixed.bookkeeper,
      memories: fixed.memories,
      chronicle: fixed.chronicle,
      systemSource: 'export',
      firstPacket,
      playthrough: {
        seed: SEED,
        inputs: INPUTS.slice(),
        log: play.log,
        journal: play.journal,
        time: play.time,
        player: play.player,
        turn: play.turn,
        rngCalls: play.rngCalls,
        stateJson: play.stateJson,
        normalised: ['meta.createdAt (removed)']
      },
      blocksEstimate: {
        casual: estimate(fixed.casual, fixed.town, fixed.cast),
        literary: estimate(fixed.literary, fixed.town, fixed.cast)
      },
      commit: COMMIT,
      madeAt: 'pre-wave-37'
    };
    await context.close();
    return { snap, rolls };
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { makePromptSnapshot, COMMIT, SEED, INPUTS };

if (require.main === module) {
  makePromptSnapshot().then(({ snap, rolls }) => {
    const json = JSON.stringify(snap, null, 2) + '\n';
    fs.writeFileSync(OUT, json);
    console.log(`${path.relative(ROOT, OUT)}: ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB, commit ${COMMIT}, seed ${SEED}, turn ${snap.playthrough.turn}, rngCalls ${snap.playthrough.rngCalls}, cached blocks ~${snap.blocksEstimate.casual} (casual) / ${snap.blocksEstimate.literary} (literary) tokens`);
    if (process.env.SNAPSHOT_VERBOSE) for (const r of rolls) console.log(JSON.stringify(r));
  }).catch(e => { console.error(e); process.exit(1); });
}
