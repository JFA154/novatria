#!/usr/bin/env node
// Validates a Story Pack with the page's own validator (wave 37, Creator
// Mode; plan decision B, "one validator, run in the page"): it opens
// index.html in the installed Playwright's Chromium from file://, with every
// other request aborted, and evaluates Game.Pack.validate(pack, { profile }).
// It runs the page rather than reading the content in a vm because the
// editor checks a pack live with the same rules (Pack.SCHEMA's shape pass
// and the PackRules rules), and the engine's own lists (State.EFFECT_OPS,
// State.RESERVED_FLAGS, Rel's events) are read there directly, so the
// browser and Node can never disagree. It replaces tests/validate-town.cjs
// and tests/mentions.cjs and keeps their output contract: exit 1 with a list
// of problems, else the "OK <town>: ..." line tests/content.test.cjs reads.
// Usage: node tests/validate-pack.cjs                  (the built-in pack, profile strict)
//        VALIDATE_FILE=other.html node tests/validate-pack.cjs   (that page's built-in pack)
//        node tests/validate-pack.cjs my-pack.json     (a pack file, profile play)
//        add --profile=play or --profile=strict to choose (house rules are errors in strict).
// tests/run.cjs runs it before the Playwright suites.
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PAGE = process.env.VALIDATE_FILE ? path.resolve(process.env.VALIDATE_FILE) : path.join(ROOT, 'town.html');
const args = process.argv.slice(2);
const packFile = args.find(a => !a.startsWith('--') && a.endsWith('.json')) || null;
const profileArg = (args.find(a => a.startsWith('--profile=')) || '').slice('--profile='.length);
const profile = profileArg || (packFile ? 'play' : 'strict');
const label = packFile ? path.basename(packFile) : path.basename(PAGE);

function fail(lines) {
  console.error(label + ' content: ' + lines.length + ' problem(s)');
  lines.forEach(l => console.error('  - ' + l));
  process.exit(1);
}
if (!['play', 'strict'].includes(profile)) fail(['--profile: "' + profile + '" is not play or strict']);

let packJson = null;
if (packFile) {
  try { packJson = JSON.parse(fs.readFileSync(path.resolve(packFile), 'utf8')); } catch (e) { fail([packFile + ': ' + e.message]); }
}

/* The summary line, counted from the pack as tests/validate-town.cjs
   counted it from the content block. */
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
function summary(pack) {
  const T = isObj(pack.world) ? pack.world : {};
  const P = isObj(pack.player) ? pack.player : {};
  const npcs = arr(T.npcs).filter(isObj);
  const locations = arr(T.locations).filter(isObj);
  const factions = arr(T.factions).filter(isObj);
  const presenceOf = n => (['here', 'away', 'dead'].includes(n.presence) ? n.presence : 'here');
  const by = p => npcs.filter(n => presenceOf(n) === p).length;
  // Secrets that name someone else of the cast or a faction.
  const tokens = new Map();
  for (const n of npcs) if (typeof n.name === 'string') for (const t of new Set(n.name.split(/\s+/))) tokens.set(t, (tokens.get(t) || 0) + 1);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentions = (text, alias, caseless) => new RegExp('\\b' + esc(alias) + '\\b', caseless ? 'i' : '').test(text);
  const npcAliases = n => (typeof n.name === 'string' ? n.name.split(/\s+/).filter(t => t.length >= 3 && tokens.get(t) === 1) : []);
  const facAliases = f => { if (typeof f.name !== 'string') return []; const bare = f.name.replace(/^The\s+/, ''); return Array.from(new Set([bare, bare.split(/\s+/).slice(0, 2).join(' ')])); };
  const mentionsCast = (text, except) => npcs.some(n => n.id !== except && npcAliases(n).some(a => mentions(text, a, false))) || factions.some(f => facAliases(f).some(a => mentions(text, a, true)));
  const linked = npcs.filter(n => typeof n.secret === 'string' && mentionsCast(n.secret, n.id)).length;
  const relations = npcs.reduce((s, n) => s + arr(n.relations).filter(isObj).length, 0);
  // Family ages checked: relations whose two birth years are known and whose word is a family one.
  const YEAR = Number.isInteger(T.year) ? T.year : null;
  const yearIn = s => { const m = /\b(1[89]\d\d|20\d\d)\b/.exec(String(s || '')); return m ? Number(m[1]) : null; };
  const born = n => (Number.isInteger(n.age) && YEAR !== null ? (n.presence === 'dead' ? yearIn(n.died) : YEAR) - n.age : null);
  const FAMILY = ['son', 'daughter', 'child', 'kid', 'boy', 'girl', 'baby', 'stepson', 'stepdaughter', 'grandson', 'granddaughter',
    'wife', 'husband', 'spouse', 'partner', 'girlfriend', 'boyfriend', 'fiancee', 'fiance', 'ex-wife', 'ex-husband', 'ex', 'brother', 'sister', 'stepbrother', 'stepsister'];
  const byId = new Map(npcs.map(n => [n.id, n]));
  let family = 0;
  for (const n of npcs) for (const r of arr(n.relations)) {
    const o = isObj(r) ? byId.get(r.npcId) : null;
    if (o && born(n) !== null && born(o) !== null && FAMILY.includes(r.relation)) family++;
  }
  const homes = locations.filter(l => l.discovered === false && l.away !== true).length;
  const town = locations.filter(l => l.discovered !== false && l.away !== true).length;
  const out = locations.filter(l => l.away === true).length;
  const offstage = arr(T.offstage).length;
  // The effect lists the town fires: clock completions and their alts, starting seeds, events, the epilogue.
  let effects = 0;
  const count = l => { effects += arr(l).length; };
  let clocks = 0;
  for (const f of factions) for (const c of arr(f.clocks)) { clocks++; const oc = isObj(c) && isObj(c.onComplete) ? c.onComplete : {}; count(oc.effects); if (isObj(oc.alt)) count(oc.alt.effects); }
  for (const s of arr(T.seeds).filter(isObj)) { count(s.effects); if (isObj(s.alt)) count(s.alt.effects); }
  for (const ev of arr(T.events).filter(isObj)) { arr(ev.branches).forEach(b => isObj(b) && count(b.effects)); if (isObj(ev.default)) count(ev.default.effects); }
  if (isObj(T.epilogue)) { arr(T.epilogue.branches).forEach(b => isObj(b) && count(b.effects)); if (isObj(T.epilogue.default)) count(T.epilogue.default.effects); }
  const rumours = arr(T.rumours).filter(isObj);
  const tables = isObj(T.tables) ? T.tables : {};
  let tableEntries = 0;
  for (const g of Object.keys(tables)) {
    if (Array.isArray(tables[g])) tableEntries += tables[g].length;
    else if (isObj(tables[g])) for (const k of Object.keys(tables[g])) tableEntries += arr(tables[g][k]).length;
  }
  let strings = 0;
  (function walk(v) {
    if (typeof v === 'string') strings++;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.keys(v).forEach(k => walk(v[k]));
  })([T, P.backgrounds, P.flaws, P.looseEnds, P.goalPresets]);
  return 'OK ' + T.name + ': ' +
    locations.length + ' locations, ' +
    npcs.length + ' npcs (' + by('here') + ' here, ' + by('away') + ' away, ' + by('dead') + ' dead; ' + linked + ' linked secrets, ' + relations + ' relations, ' + family + ' family ages checked, ' + homes + ' homes to find, ' + town + ' town places, ' + out + ' out of town' + (offstage ? ', ' + offstage + ' offstage' : '') + '), ' +
    factions.length + ' factions (' + clocks + ' clocks, ' + effects + ' effects), ' +
    arr(T.threads).length + ' threads, ' +
    arr(T.seeds).length + ' seeds, ' +
    rumours.length + ' rumours (' + rumours.filter(r => r.true === true).length + ' true / ' + rumours.filter(r => r.true === false).length + ' false), ' +
    tableEntries + ' table entries, ' +
    arr(P.backgrounds).length + ' backgrounds, ' +
    arr(P.flaws).length + ' flaws, ' +
    Object.keys(isObj(P.looseEnds) ? P.looseEnds : {}).length + ' loose ends, ' +
    arr(T.grudgeTemplates).length + ' grudges, ' +
    arr(T.favourTemplates).length + ' favours, ' +
    strings + ' strings scanned';
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let result;
  try {
    const context = await browser.newContext();
    // Network blocked, as tests/helpers.cjs does: only file:, blob: and data: URLs load.
    await context.route('**/*', route => (/^(file|blob|data):/.test(route.request().url()) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + PAGE);
    await page.waitForFunction(() => window.Game && window.Game.Pack, null, { timeout: 30000 });
    result = await page.evaluate(({ json, profile }) => {
      const pack = json === null ? Game.Pack.builtIn() : json;
      return { problems: Game.Pack.validate(pack, { profile }), pack: json === null ? JSON.parse(JSON.stringify(pack)) : null };
    }, { json: packJson, profile });
  } catch (e) {
    errors.push(e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
  if (errors.length) fail(errors.map(m => 'the page: ' + m + ' (pageerror)'));
  const problems = result.problems;
  if (problems.length) {
    console.error(label + ' content: ' + problems.length + ' problem(s)');
    problems.forEach(p => console.error('  - ' + (p.path || '(pack)') + ': ' + p.message + ' [' + p.rule + ']'));
  }
  if (problems.some(p => p.severity === 'error')) process.exit(1);
  console.log(summary(result.pack || packJson));
})().catch(e => fail(['the validator: ' + e.message]));
