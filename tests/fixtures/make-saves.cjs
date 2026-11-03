'use strict';
/* Wave 39: frozen saves for every older rules version, written once from
   git history and committed (tests/fixtures/saves/v<N>.json), so no test
   needs the history any more (a shallow clone runs the whole suite).

   For each rules version N in BUILDS it takes the index.html of the last
   commit at which N was the current State.RULES_VERSION (found with
   git log --first-parent --format='%h %s' -G'RULES_VERSION = ' -- index.html
   and git show <sha>:index.html | grep 'RULES_VERSION = '; version 1 is a
   save from before the constant existed, which the Upgrade module reads as
   1), writes it to a temporary folder, opens it headless with the mock (no
   key: every old build plays the offline demo then), the network blocked,
   the clock frozen at the commit's own date and Math.random seeded, and
   plays SCRIPT through the page's own API (App.quickStart, State.apply,
   Api.Mock.queue, Pipeline.submit, the same calls each of those builds'
   tests used): a character with three loose ends (a debt, an enemy, a
   secret), an insult at Pittman's, a beer bought at the Low Water (a
   purchase the mock's bookkeeper prices), a favour, a night's rest, two
   long talks and a kept confidence that bring someone to 50, a second
   rest, the debt gone past due with the repo man's own line (and the same
   line once more as the old editor left it, without its act), a third
   rest. Memories, obligations (rules 8 on), clocks and the town copy are
   all the build's own. The save is Storage.envelope as that build wrote
   it, serialised the way its export did (the key is never in it: there is
   none), plus a `fixture` field: { rulesVersion, commit, date, subject,
   script, debtor, note }.

   Rules 8 is the build at 56e69f5 (1 Nov 2026), not the last commit at
   rules 8 (cf88bdc): waves 26 to 29 built the relationship engine on top
   of rules 8 before wave 30 bumped it to 9, and version 9's step is for
   games saved before that work (the saves players had); v8-late.json is
   the one from cf88bdc as well, a game with tracks still marked rules 8.

   Usage: node tests/fixtures/make-saves.cjs [versions...]   (e.g. 1 2 8 8-late;
   none: all). Idempotent: the same commit, script and seed write the same
   bytes; it prints each file's size and whether it changed. Adding a rules
   version: add its last commit to BUILDS and run it for that version.
   Read in tests through loadSave(key). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'saves');
const SEED = 4242;
const SCRIPT = 'tests/fixtures/make-saves.cjs SCRIPT (seed 4242)';
const BUILDS = Object.freeze({
  1: { commit: 'a415f89', note: 'the last build before saves carried meta.rulesVersion' },
  2: { commit: 'dd29f32' },
  3: { commit: '5e9a788' },
  4: { commit: 'c312b1f' },
  5: { commit: 'ebadb37' },
  6: { commit: 'eb15c02' },
  7: { commit: 'a05fa70' },
  8: { commit: '56e69f5', note: 'before the relationship engine (waves 26 to 29 were built at rules 8; version 9 brings these saves up)' },
  '8-late': { commit: 'cf88bdc', rules: 8, note: 'the last build at rules 8, with the relationship tracks of waves 26 to 29' },
  9: { commit: 'f48e35b' }
});

function file(key) { return path.join(OUT, `v${key}.json`); }
/* The committed fixture for a version: the envelope (with its fixture field). */
function loadSave(key) { return JSON.parse(fs.readFileSync(file(key), 'utf8')); }
function keys() { return Object.keys(BUILDS); }

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
  } catch (e) {
    throw new Error(`make-saves needs the git history (${args.join(' ')} failed; a shallow clone lacks old commits: git fetch --unshallow)`);
  }
}

/* Runs in the old page: the scripted session. Feature checks, not version
   checks: a build that lacks a person, an engine op or a field just skips
   that part (and says so in `skipped`). */
async function SCRIPT_FN(seed) {
  const G = Game, S = G.State, M = G.Api.Mock, D = G.data;
  const skipped = [];
  M.delay = 0;
  const bg = D.BACKGROUNDS[0];
  G.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
    looseEnds: ['debt', 'enemy', 'secret'].map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] })) }, { seed });
  const st = () => G.state;
  // The people: the cast's own where the build has them, else the next town people nobody else in the script is.
  const used = new Set(st().player.looseEnds.map(le => le.npcId));
  const pick = id => {
    if (S.npc(id)) { used.add(id); return id; }
    const n = D.TOWN_DATA.npcs.find(x => !used.has(x.id) && S.npc(x.id) && S.npc(x.id).alive !== false);
    used.add(n.id);
    skipped.push(`${id} (not in this build's town; ${n.id} instead)`);
    return n.id;
  };
  const royce = pick('npc_royce'), loretta = pick('npc_loretta'), burl = pick('npc_burl'), elbert = pick('npc_elbert');
  const put = (loc, ids) => { S.apply({ playerLocationId: loc }); S.apply({ visits: ids.map(id => ({ npcId: id, locationId: loc })) }); };
  const say = async (to, words, book) => {
    M.queue('parse', { actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', book);
    await G.Pipeline.submit(words, { mode: 'say', to });
  };
  S.apply({ npcKnownToPlayer: [royce, loretta, burl, elbert] });
  // Day 1: an insult to Royce at his own counter.
  put('loc_pittmans', [royce]);
  await say(royce, 'You are a liar and everybody knows it.', { attitudeChanges: [{ npcId: royce, delta: -10, reason: 'called him a liar' }], newMemories: [{ npcId: royce, text: 'called me a liar in my own station', weight: 2 }] });
  // A beer for Loretta at the Low Water: a purchase, priced and paid by the build's own mock bookkeeper.
  put('loc_low_water', [loretta, burl]);
  const gold0 = st().player.gold;
  M.queue('parse', { actionType: 'buy', summary: 'buy Loretta a bottle of beer', targets: [loretta], needsRoll: false, timeCost: 'short' });
  M.queue('bookkeep', { attitudeChanges: [{ npcId: loretta, delta: 5, reason: 'a beer' }], newMemories: [{ npcId: loretta, text: 'bought me a beer at the bar', weight: 2 }] });
  await G.Pipeline.submit('I buy a bottle of beer for Loretta.');
  const paid = gold0 - st().player.gold;
  if (!(paid > 0)) skipped.push('the purchase (the mock sold nothing)');
  // A favour for Burl.
  await say(burl, 'I can give you a hand with that motor.', { attitudeChanges: [{ npcId: burl, delta: 8, reason: 'the motor' }], newMemories: [{ npcId: burl, text: 'helped carry the outboard motor down to the ramp', weight: 2 }] });
  await G.Pipeline.submit('/rest');
  // Day 2: Elbert, two long talks and a confidence kept: attitude 50 with a good memory (the old gate had his secret open).
  put('loc_low_water', [elbert]);
  await say(elbert, 'I will not tell a soul.', { attitudeChanges: [{ npcId: elbert, delta: 25, reason: 'kept his word' }], newMemories: [{ npcId: elbert, text: 'kept quiet about what I told them and stood up for me', weight: 3 }] });
  await say(elbert, 'You can count on me.', { attitudeChanges: [{ npcId: elbert, delta: 25, reason: 'trusted' }] });
  const e = S.npc(elbert);
  if (e.attitude < 50) {
    const r = S.apply({ effects: [{ op: 'attitudeDelta', npcId: elbert, delta: 50 - e.attitude }] });
    if (r.rejected && r.rejected.length) skipped.push('attitudeDelta for Elbert: ' + r.rejected[0].reason);
  }
  await G.Pipeline.submit('/rest');
  // The debt gone past due, as the content wrote it (the repo man's own act where the build has acts), and the same line as the old editor left it (act stripped).
  const debtor = st().player.looseEnds.find(le => le.kind === 'debt').npcId;
  const line = 'Tester let the six hundred go past due, so I took the phone as a start.';
  const r = S.apply({ effects: [{ op: 'attitudeDelta', npcId: debtor, delta: -15 }, { op: 'addMemory', npcId: debtor, text: line, weight: 3, act: 'own' }] });
  if (r.rejected && r.rejected.length) {
    skipped.push('the debt line with its act: ' + r.rejected.map(x => x.reason).join('; '));
    // A build without the addMemory op: the attitude through the engine, the line as its bookkeeper would have stored it.
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: debtor, delta: -15 }] });
    S.npc(debtor).memories.push({ turn: st().meta.turn, text: line, weight: 3 });
  }
  S.npc(debtor).memories.push({ turn: st().meta.turn, text: line, weight: 3 });
  await G.Pipeline.submit('/rest');
  const errs = [];
  if (G.Pipeline.busy) errs.push('a turn still running');
  return { env: JSON.parse(G.Storage.exportJson ? G.Storage.exportJson() : JSON.stringify(G.Storage.envelope('Export'))), debtor, paid, skipped, errs,
    rules: S.RULES_VERSION === undefined ? 1 : S.RULES_VERSION, mock: !!(G.Api.Mock && G.Storage.settings().mockMode !== false) };
}

async function make(key, browser) {
  const b = BUILDS[key];
  if (!b) throw new Error(`no build for rules version ${key} (have ${keys().join(', ')})`);
  const want = b.rules || Number(key);
  const html = git(['show', `${b.commit}:index.html`]);
  const [sha, date, subject] = git(['log', '-1', '--format=%h%n%aI%n%s', b.commit]).trim().split('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-save-'));
  const page0 = path.join(tmp, 'index.html');
  fs.writeFileSync(page0, html);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  try {
    await context.route('**/*', r => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    // The clock frozen at the commit's date; Math.random seeded (a tab id, a turn token).
    await context.addInitScript(at => {
      const T = Date.parse(at);
      const D0 = Date;
      class FixedDate extends D0 { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } }
      window.Date = FixedDate;
      let x = 0x9e3779b9;
      Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    }, date);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + page0);
    await page.waitForFunction(() => window.Game && window.Game.App);
    const r = await page.evaluate(SCRIPT_FN, SEED);
    const rules = r.env.state.meta.rulesVersion === undefined ? 1 : r.env.state.meta.rulesVersion;
    if (rules !== want) throw new Error(`v${key}: the ${sha} build wrote rules ${rules}, not ${want}`);
    if (errors.length || r.errs.length) throw new Error(`v${key}: ${errors.concat(r.errs).join(' | ')}`);
    const env = Object.assign({ fixture: { rulesVersion: want, commit: sha, date, subject, script: SCRIPT, debtor: r.debtor, paid: r.paid, skipped: r.skipped, note: b.note || null } }, r.env);
    return env;
  } finally {
    await context.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function main(args) {
  const { chromium } = require('playwright');
  const list = args.length ? args.map(a => String(a).replace(/^v/, '')) : keys();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const key of list) {
      const env = await make(key, browser);
      const json = JSON.stringify(env, null, 1) + '\n';
      const f = file(key);
      const same = fs.existsSync(f) && fs.readFileSync(f, 'utf8') === json;
      if (!same) fs.writeFileSync(f, json);
      console.log(`v${key}: ${env.fixture.commit} rules ${env.fixture.rulesVersion}, ${(json.length / 1024).toFixed(1)} KB (state ${(JSON.stringify(env.state).length / 1024).toFixed(1)} KB, town ${(JSON.stringify(env.town).length / 1024).toFixed(1)} KB), ${same ? 'unchanged' : 'written'}${env.fixture.skipped.length ? '; skipped: ' + env.fixture.skipped.join('; ') : ''}`);
    }
  } finally {
    await browser.close();
  }
}

module.exports = { BUILDS, SEED, loadSave, keys, file, make, main };

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e && e.stack || e); process.exit(1); });
