#!/usr/bin/env node
// Validates the town content inlined in index.html (the text between the
// "BEGIN CONTENT" and "END CONTENT" markers) against the shared data contract
// in docs/BUILD_PLAN.md and the content brief in SPEC.md sections 4, 5, 8, 9.
// The block is evaluated in a Node vm sandbox (like a browser <script> with no
// module system), so TOWN_DATA can be hand-edited in index.html and checked.
// Usage: node tests/validate-town.cjs   (exits 1 and lists every problem found)
//        VALIDATE_FILE=other.html node tests/validate-town.cjs
// tests/run.cjs runs it before the Playwright suites.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// VALIDATE_FILE points the check at another copy of the page (used by tests).
const FILE = process.env.VALIDATE_FILE ? path.resolve(process.env.VALIDATE_FILE) : path.join(__dirname, '..', 'index.html');
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';
const EXPORT_NAMES = ['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES'];
// Optional: the guard the block carried as a stand-alone file. Harmless in the
// browser; if present it must be the last line and is ignored by the checks.
const END_BLOCK = "if (typeof module !== 'undefined') { module.exports = { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES }; }";

const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const NPC_STATUSES = ['free', 'arrested', 'gone', 'dead'];
const THREAD_STATUSES = ['open', 'resolved', 'failed'];
const TRIGGER_TYPES = ['day', 'location', 'npc', 'clock'];
const REQUIRED_TAGS = ['lender', 'fence', 'watch', 'priest', 'noble', 'smith', 'innkeeper', 'ferryman', 'healer', 'informant'];
const REQUIRED_LOCATION_TYPES = ['tavern', 'market', 'docks', 'temple', 'manor', 'smithy', 'watch', 'slum', 'road'];
const REQUIRED_BACKGROUNDS = ['ex-soldier', 'runaway apprentice', 'disgraced clerk', 'river trader', 'temple foundling', 'card sharp'];
const LOOSE_END_KEYS = ['debt', 'enemy', 'secret', 'lost', 'promise'];
const RESERVED_FLAGS = ['priceMultiplier', 'weather'];
const PREFIX = {
  location: 'loc_', npc: 'npc_', faction: 'fac_', thread: 'thr_', seed: 'seed_',
  rumour: 'rum_', item: 'item_', background: 'bg_'
};
const SLUG = /^[a-z]+_[a-z0-9_]+$/;

// SPEC.md section 9 banned list, plus the setting bans from the brief.
const BANNED_PHRASES = [
  'the air is thick with', 'a testament to', 'little did you know', 'somewhere in the distance',
  "you can't help but", 'you cannot help but', 'a sense of', 'palpable', 'tapestr', 'whispers of',
  'the weight of', 'sends shivers', 'unbeknownst', 'in the grand scheme', "it's worth noting",
  'echoes through', 'hangs in the air', 'a mix of', 'as if on cue', 'time seems to slow',
  'eyes glinting with', 'what do you do',
  'prophec', 'prophes', 'chosen one', 'dark lord', 'hooded stranger', 'hooded figure',
  'mysterious stranger', 'ancient evil', 'destiny', 'destined'
];

const problems = [];
function err(where, msg) { problems.push(where + ': ' + msg); }
function report() {
  console.error('index.html content: ' + problems.length + ' problem(s)');
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
function fatal(where, msg) { err(where, msg); report(); }

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);
const sentenceCount = (s) => (s.match(/[.!?]['")]?(?=\s|$)/g) || []).length;

function checkKeys(obj, required, where, optional) {
  if (!isObj(obj)) { err(where, 'expected an object'); return false; }
  const allowed = new Set(required.concat(optional || []));
  for (const k of required) if (!(k in obj)) err(where, 'missing field "' + k + '"');
  for (const k of Object.keys(obj)) if (!allowed.has(k)) err(where, 'unexpected field "' + k + '"');
  return true;
}

function checkStr(v, where, opts) {
  opts = opts || {};
  if (!isStr(v)) { err(where, 'expected a non-empty string'); return false; }
  if (v !== v.trim()) err(where, 'leading or trailing whitespace');
  if (/\n/.test(v)) err(where, 'must be one line');
  if (/ {2,}/.test(v)) err(where, 'double space');
  if (opts.sentences !== undefined && sentenceCount(v) !== opts.sentences) {
    err(where, 'expected ' + opts.sentences + ' sentence(s), found ' + sentenceCount(v));
  }
  if (opts.maxSentences !== undefined && sentenceCount(v) > opts.maxSentences) {
    err(where, 'expected at most ' + opts.maxSentences + ' sentence(s), found ' + sentenceCount(v));
  }
  if (opts.noPlaceholders && /[{}]/.test(v)) err(where, 'placeholders are not allowed here');
  return true;
}

function checkStrList(list, where, count, opts) {
  if (!Array.isArray(list)) { err(where, 'expected an array'); return; }
  if (count !== undefined && list.length !== count) err(where, 'expected exactly ' + count + ' entries, found ' + list.length);
  const seen = new Set();
  list.forEach((v, i) => {
    checkStr(v, where + '[' + i + ']', opts);
    if (typeof v === 'string') {
      const key = v.toLowerCase();
      if (seen.has(key)) err(where + '[' + i + ']', 'duplicate entry "' + v + '"');
      seen.add(key);
    }
  });
}


// ---------------------------------------------------------------------------
// 1. Source-level checks: plain script, no module syntax, ES5-style literals.
// ---------------------------------------------------------------------------
let src;
try {
  const html = fs.readFileSync(FILE, 'utf8');
  const a = html.indexOf(BEGIN);
  const b = html.indexOf(END);
  if (a < 0 || b < 0 || b < a) fatal('file', 'index.html has no "' + BEGIN + '" ... "' + END + '" block');
  if (html.indexOf(BEGIN, a + 1) >= 0 || html.indexOf(END, b + 1) >= 0) fatal('file', 'the content markers must appear exactly once');
  src = html.slice(a + BEGIN.length, b).replace(/^\r?\n/, '');
} catch (e) {
  fatal('file', 'cannot read ' + FILE + ': ' + e.message);
}

const trimmed = src.replace(/\s+$/, '');
let body = trimmed;
if (trimmed.endsWith(END_BLOCK)) body = trimmed.slice(0, -END_BLOCK.length);

// eslint-style strip of comments and double-quoted strings, leaving code only.
function stripCode(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0) { err('syntax', 'unterminated block comment'); return out; }
      i = j + 2; out += ' '; continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\') j++;
        if (text[j] === '\n') { err('syntax', 'string broken across lines near offset ' + i); break; }
        j++;
      }
      out += '""';
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const code = stripCode(body);
if (/'/.test(code)) err('syntax', 'single-quoted string in the data (use double quotes)');
if (/`/.test(code)) err('syntax', 'template literal (backtick) found');
if (/=>/.test(code)) err('syntax', 'arrow function found; no functions in the data');
if (/\bfunction\b/.test(code)) err('syntax', 'function found; no functions in the data');
if (/\.\.\./.test(code)) err('syntax', 'spread syntax found');
if (/\b(import|export)\b/.test(code)) err('syntax', 'module syntax (import/export) found');
if (/\b(require|let|var|class|new)\b/.test(code)) err('syntax', 'unexpected keyword (require/let/var/class/new) in the data');
if (/,\s*[\]}]/.test(code)) err('syntax', 'trailing comma found');
if (/[^\x09\x0a\x0d\x20-\x7e]/.test(src)) {
  const m = src.match(/[^\x09\x0a\x0d\x20-\x7e]/);
  err('file', 'non-ASCII character "' + m[0] + '" at offset ' + src.indexOf(m[0]) + ' (keep content plain ASCII)');
}

const declared = [];
const declRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*=/g;
let dm;
while ((dm = declRe.exec(code)) !== null) declared.push(dm[1]);
if (declared.join(',') !== EXPORT_NAMES.join(',')) {
  err('file', 'const declarations must be exactly, in order: ' + EXPORT_NAMES.join(', ') + ' (found: ' + declared.join(', ') + ')');
}


// ---------------------------------------------------------------------------
// 2. Load check: evaluate the block in a fresh vm context, like a browser
//    <script> (no module, no require), and collect the seven constants.
// ---------------------------------------------------------------------------
try {
  new vm.Script(src, { filename: 'index.html#content' });
} catch (e) {
  fatal('load', 'does not parse as a plain script: ' + e.message);
}

let data;
try {
  const probe = '\n;({' + EXPORT_NAMES.map((n) => n + ': typeof ' + n + " === 'undefined' ? undefined : " + n).join(', ') + '})';
  // Objects come from the sandbox realm; the checks below only use typeof,
  // Array.isArray and Object.keys, which work across realms.
  data = vm.runInNewContext(src + probe, {}, { filename: 'index.html#content', timeout: 5000 });
} catch (e) {
  fatal('load', 'throws in a browser-like script context: ' + e.message);
}
for (const n of EXPORT_NAMES) {
  if (!data || typeof data[n] !== 'object' || data[n] === null) err('load', n + ' is not defined as an object');
}
if (problems.length) report();

const { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES } = data;
if (!isObj(TOWN_DATA)) fatal('TOWN_DATA', 'is not an object');

// No functions anywhere, banned phrases in every string.
const allStrings = [];
(function walk(v, where) {
  if (typeof v === 'function') { err(where, 'function in the data'); return; }
  if (typeof v === 'string') { allStrings.push([where, v]); return; }
  if (typeof v === 'number' && !Number.isFinite(v)) { err(where, 'non-finite number'); return; }
  if (v === undefined) { err(where, 'undefined value'); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, where + '[' + i + ']')); return; }
  if (isObj(v)) { for (const k of Object.keys(v)) walk(v[k], where + '.' + k); }
})(data, 'data');

for (const [where, s] of allStrings) {
  const low = s.toLowerCase();
  for (const p of BANNED_PHRASES) {
    if (low.indexOf(p) !== -1) err(where, 'banned phrase "' + p + '" in "' + s.slice(0, 60) + '"');
  }
  if (/^as you\b/i.test(s)) err(where, 'starts with "As you"');
}
{
  const lowSrc = src.toLowerCase();
  for (const p of BANNED_PHRASES) {
    if (lowSrc.indexOf(p) !== -1 && !allStrings.some(([, s]) => s.toLowerCase().indexOf(p) !== -1)) {
      err('file', 'banned phrase "' + p + '" appears in a comment');
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Id registry (pass 1): every id, including ones created by effects.
// ---------------------------------------------------------------------------
const ids = new Map(); // id -> { kind, where, nested }
function registerId(id, kind, where, nested) {
  if (typeof id !== 'string' || !id) { err(where, 'missing id'); return; }
  if (!SLUG.test(id)) err(where, 'id "' + id + '" is not a lowercase slug');
  if (id.indexOf(PREFIX[kind]) !== 0) err(where, 'id "' + id + '" must start with "' + PREFIX[kind] + '"');
  if (ids.has(id)) { err(where, 'duplicate id "' + id + '" (also at ' + ids.get(id).where + ')'); return; }
  ids.set(id, { kind: kind, where: where, nested: !!nested });
}
const T = TOWN_DATA;
const locations = Array.isArray(T.locations) ? T.locations : [];
const npcs = Array.isArray(T.npcs) ? T.npcs : [];
const factions = Array.isArray(T.factions) ? T.factions : [];
const threads = Array.isArray(T.threads) ? T.threads : [];
const seeds = Array.isArray(T.seeds) ? T.seeds : [];
const rumours = Array.isArray(T.rumours) ? T.rumours : [];

locations.forEach((l, i) => registerId(l && l.id, 'location', 'locations[' + i + ']'));
npcs.forEach((n, i) => registerId(n && n.id, 'npc', 'npcs[' + i + ']'));
factions.forEach((f, i) => registerId(f && f.id, 'faction', 'factions[' + i + ']'));
threads.forEach((t, i) => registerId(t && t.id, 'thread', 'threads[' + i + ']'));
seeds.forEach((s, i) => registerId(s && s.id, 'seed', 'seeds[' + i + ']'));
rumours.forEach((r, i) => registerId(r && r.id, 'rumour', 'rumours[' + i + ']'));

const allEffects = []; // [where, effect]
factions.forEach((f, fi) => {
  if (!f || !Array.isArray(f.clocks)) return;
  f.clocks.forEach((c, ci) => {
    const effs = c && c.onComplete && Array.isArray(c.onComplete.effects) ? c.onComplete.effects : [];
    effs.forEach((e, ei) => allEffects.push(['factions[' + fi + '](' + f.id + ').clocks[' + ci + '].effects[' + ei + ']', e]));
  });
});
for (const [where, e] of allEffects) {
  if (!isObj(e)) continue;
  if (e.op === 'openThread' && isObj(e.thread)) registerId(e.thread.id, 'thread', where + '.thread', true);
  if (e.op === 'addRumour' && isObj(e.rumour)) registerId(e.rumour.id, 'rumour', where + '.rumour', true);
  if (e.op === 'plantSeed' && isObj(e.seed)) registerId(e.seed.id, 'seed', where + '.seed', true);
}
(Array.isArray(BACKGROUNDS) ? BACKGROUNDS : []).forEach((b, bi) => {
  if (!b) return;
  registerId(b.id, 'background', 'BACKGROUNDS[' + bi + ']');
  (Array.isArray(b.items) ? b.items : []).forEach((it, ii) => registerId(it && it.id, 'item', 'BACKGROUNDS[' + bi + '].items[' + ii + ']'));
});

const kindOf = (id) => (ids.has(id) ? ids.get(id).kind : null);
const isLoc = (id) => kindOf(id) === 'location';
const isNpc = (id) => kindOf(id) === 'npc';
const isFac = (id) => kindOf(id) === 'faction';
const isThread = (id) => kindOf(id) === 'thread';
const npcById = new Map(npcs.filter(isObj).map((n) => [n.id, n]));
const facById = new Map(factions.filter(isObj).map((f) => [f.id, f]));

// Name aliases for "does this text mention another NPC or a faction".
const nameTokenCount = new Map();
for (const n of npcs) {
  if (!n || typeof n.name !== 'string') continue;
  for (const tok of new Set(n.name.split(/\s+/))) nameTokenCount.set(tok, (nameTokenCount.get(tok) || 0) + 1);
}
function npcAliases(n) {
  return typeof n.name === 'string' ? n.name.split(/\s+/).filter((t) => t.length >= 3 && nameTokenCount.get(t) === 1) : [];
}
function factionAliases(f) {
  if (typeof f.name !== 'string') return [];
  const bare = f.name.replace(/^The\s+/, '');
  const words = bare.split(/\s+/);
  return Array.from(new Set([bare, words.slice(0, 2).join(' ')]));
}
function mentions(text, alias, caseless) {
  const re = new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', caseless ? 'i' : '');
  return re.test(text);
}
function mentionsCast(text, exceptNpcId) {
  for (const n of npcs) {
    if (!n || n.id === exceptNpcId) continue;
    if (npcAliases(n).some((a) => mentions(text, a, false))) return true;
  }
  for (const f of factions) {
    if (f && factionAliases(f).some((a) => mentions(text, a, true))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 4. Shared validators for threads, rumours, seeds, triggers, effects.
// ---------------------------------------------------------------------------
function checkThread(t, where, expectStatus) {
  if (!checkKeys(t, ['id', 'title', 'summary', 'status', 'knownToPlayer', 'linkedIds'], where)) return;
  checkStr(t.title, where + '.title', { noPlaceholders: true });
  checkStr(t.summary, where + '.summary', { noPlaceholders: true, maxSentences: 3 });
  if (t.status !== expectStatus) err(where, 'status must be "' + expectStatus + '"');
  if (t.knownToPlayer !== false) err(where, 'knownToPlayer must be false');
  if (!Array.isArray(t.linkedIds) || t.linkedIds.length === 0) err(where, 'linkedIds must be a non-empty array');
  else t.linkedIds.forEach((id, i) => {
    const k = kindOf(id);
    if (!k || ['location', 'npc', 'faction', 'thread'].indexOf(k) === -1) err(where + '.linkedIds[' + i + ']', 'unknown id "' + id + '"');
    if (id === t.id) err(where + '.linkedIds[' + i + ']', 'thread links to itself');
  });
}

function checkRumour(r, where) {
  if (!checkKeys(r, ['id', 'text', 'true', 'sourceNpcId', 'heard'], where)) return;
  checkStr(r.text, where + '.text', { noPlaceholders: true, maxSentences: 2 });
  if (typeof r['true'] !== 'boolean') err(where, '"true" must be a boolean');
  if (!isNpc(r.sourceNpcId)) err(where, 'sourceNpcId "' + r.sourceNpcId + '" is not an NPC');
  if (r.heard !== false) err(where, 'heard must be false');
}

function checkTrigger(t, where, allowDay) {
  if (!checkKeys(t, ['type', 'value'], where)) return;
  if (TRIGGER_TYPES.indexOf(t.type) === -1) { err(where, 'trigger type "' + t.type + '" not one of ' + TRIGGER_TYPES.join('/')); return; }
  if (t.type === 'day') {
    if (!allowDay) err(where, 'a seed planted by a clock cannot use a fixed day (the clock may finish after that day); use location, npc or clock');
    if (!isInt(t.value) || t.value < 3 || t.value > 15) err(where, 'day trigger value must be an integer 3..15, found ' + JSON.stringify(t.value));
  } else if (t.type === 'location') {
    if (!isLoc(t.value)) err(where, 'location trigger "' + t.value + '" is not a location');
  } else if (t.type === 'npc') {
    if (!isNpc(t.value)) err(where, 'npc trigger "' + t.value + '" is not an NPC');
  } else if (t.type === 'clock') {
    const m = typeof t.value === 'string' ? t.value.match(/^(fac_[a-z0-9_]+):(\d+)$/) : null;
    if (!m) err(where, 'clock trigger must look like "fac_x:N", found ' + JSON.stringify(t.value));
    else {
      if (!isFac(m[1])) err(where, 'clock trigger faction "' + m[1] + '" does not exist');
      const n = Number(m[2]);
      if (n < 1 || n > 6) err(where, 'clock trigger segment must be 1..6');
    }
  }
}

function checkSeed(s, where, allowDay) {
  if (!checkKeys(s, ['id', 'cause', 'effect', 'trigger', 'fired', 'hidden'], where)) return;
  checkStr(s.cause, where + '.cause', { noPlaceholders: true, maxSentences: 2 });
  checkStr(s.effect, where + '.effect', { noPlaceholders: true, maxSentences: 2 });
  checkTrigger(s.trigger, where + '.trigger', allowDay);
  if (s.fired !== false) err(where, 'fired must be false');
  if (s.hidden !== true) err(where, 'hidden must be true');
  if (typeof s.cause === 'string' && typeof s.effect === 'string' && !mentionsCast(s.cause + ' ' + s.effect, null)) {
    err(where, 'seed is not tied to any named NPC or faction');
  }
}

const OPS = {
  closeLocation: ['locationId'],
  openLocation: ['locationId'],
  npcStatus: ['npcId', 'status'],
  npcMove: ['npcId', 'locationId', 'phases'],
  attitudeDelta: ['npcId', 'delta'],
  priceMultiplier: ['factor'],
  openThread: ['thread'],
  threadStatus: ['threadId', 'status'],
  addRumour: ['rumour'],
  plantSeed: ['seed'],
  factionRelation: ['a', 'b', 'delta'],
  setFlag: ['key', 'value'],
  reputationDelta: ['key', 'delta']
};
const opCounts = {};

function checkDelta(v, where, max) {
  if (!isInt(v) || v === 0 || Math.abs(v) > max) err(where, 'delta must be a non-zero integer within +/-' + max + ', found ' + JSON.stringify(v));
}

function checkEffect(e, where) {
  if (!isObj(e)) { err(where, 'effect must be an object'); return; }
  if (!OPS[e.op]) { err(where, 'unknown op "' + e.op + '"'); return; }
  opCounts[e.op] = (opCounts[e.op] || 0) + 1;
  checkKeys(e, ['op'].concat(OPS[e.op]), where);
  switch (e.op) {
    case 'closeLocation':
    case 'openLocation':
      if (!isLoc(e.locationId)) err(where, 'locationId "' + e.locationId + '" is not a location');
      break;
    case 'npcStatus':
      if (!isNpc(e.npcId)) err(where, 'npcId "' + e.npcId + '" is not an NPC');
      if (NPC_STATUSES.indexOf(e.status) === -1) err(where, 'status "' + e.status + '" not one of ' + NPC_STATUSES.join('/'));
      break;
    case 'npcMove':
      if (!isNpc(e.npcId)) err(where, 'npcId "' + e.npcId + '" is not an NPC');
      if (!isLoc(e.locationId)) err(where, 'locationId "' + e.locationId + '" is not a location');
      if (e.phases !== 'all') {
        if (!Array.isArray(e.phases) || e.phases.length === 0) err(where, 'phases must be "all" or a non-empty array');
        else {
          if (new Set(e.phases).size !== e.phases.length) err(where, 'duplicate phase');
          e.phases.forEach((p) => { if (PHASES.indexOf(p) === -1) err(where, 'unknown phase "' + p + '"'); });
        }
      }
      break;
    case 'attitudeDelta':
      if (!isNpc(e.npcId)) err(where, 'npcId "' + e.npcId + '" is not an NPC');
      checkDelta(e.delta, where, 50);
      break;
    case 'priceMultiplier':
      if (typeof e.factor !== 'number' || !(e.factor >= 0.5 && e.factor <= 2) || e.factor === 1) err(where, 'factor must be a number in 0.5..2 and not 1');
      break;
    case 'openThread':
      checkThread(e.thread, where + '.thread', 'open');
      break;
    case 'threadStatus':
      if (!isThread(e.threadId)) err(where, 'threadId "' + e.threadId + '" is not a thread');
      if (THREAD_STATUSES.indexOf(e.status) === -1) err(where, 'status "' + e.status + '" not one of ' + THREAD_STATUSES.join('/'));
      break;
    case 'addRumour':
      checkRumour(e.rumour, where + '.rumour');
      break;
    case 'plantSeed':
      checkSeed(e.seed, where + '.seed', false);
      break;
    case 'factionRelation':
      if (!isFac(e.a)) err(where, 'a "' + e.a + '" is not a faction');
      if (!isFac(e.b)) err(where, 'b "' + e.b + '" is not a faction');
      if (e.a === e.b) err(where, 'a and b must differ');
      checkDelta(e.delta, where, 50);
      break;
    case 'setFlag':
      if (typeof e.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(e.key)) err(where, 'key must be an identifier-like string');
      else if (RESERVED_FLAGS.indexOf(e.key) !== -1) err(where, 'flag "' + e.key + '" is engine-owned; use the matching op');
      if (['boolean', 'number', 'string'].indexOf(typeof e.value) === -1) err(where, 'value must be a boolean, number or string');
      break;
    case 'reputationDelta':
      if (e.key !== 'town' && !isFac(e.key)) err(where, 'key must be "town" or a faction id, found "' + e.key + '"');
      checkDelta(e.delta, where, 50);
      break;
  }
}

// ---------------------------------------------------------------------------
// 5. TOWN_DATA
// ---------------------------------------------------------------------------
checkKeys(T, ['name', 'setting', 'startLocationIds', 'locations', 'npcs', 'factions', 'threads', 'seeds', 'rumours'], 'TOWN_DATA');
checkStr(T.name, 'TOWN_DATA.name', { noPlaceholders: true });
if (typeof T.setting !== 'string' || T.setting.trim().length < 200) err('TOWN_DATA.setting', 'expected a one-paragraph string of some substance');
else checkStr(T.setting, 'TOWN_DATA.setting', { noPlaceholders: true });
if (checkKeys(T.startLocationIds, ['gate', 'docks'], 'TOWN_DATA.startLocationIds')) {
  if (!isLoc(T.startLocationIds.gate)) err('TOWN_DATA.startLocationIds.gate', '"' + T.startLocationIds.gate + '" is not a location');
  if (!isLoc(T.startLocationIds.docks)) err('TOWN_DATA.startLocationIds.docks', '"' + T.startLocationIds.docks + '" is not a location');
}

// Locations
if (locations.length < 8 || locations.length > 10) err('TOWN_DATA.locations', 'expected 8 to 10 locations, found ' + locations.length);
const locById = new Map(locations.filter(isObj).map((l) => [l.id, l]));
const typesSeen = {};
const npcPhaseSlots = new Map(); // npcId -> { phase: [locIds] }
locations.forEach((l, i) => {
  const where = 'locations[' + i + '](' + (l && l.id) + ')';
  if (!checkKeys(l, ['id', 'name', 'type', 'description', 'exits', 'npcIdsBySchedule', 'discovered', 'closed'], where)) return;
  checkStr(l.name, where + '.name', { noPlaceholders: true });
  if (typeof l.type !== 'string' || !/^[a-z]+$/.test(l.type)) err(where, 'type must be a lowercase word');
  typesSeen[l.type] = (typesSeen[l.type] || 0) + 1;
  checkStr(l.description, where + '.description', { sentences: 2, noPlaceholders: true });
  if (l.discovered !== true) err(where, 'discovered must be true for starter locations');
  if (l.closed !== false) err(where, 'closed must be false at start');
  if (!Array.isArray(l.exits) || l.exits.length === 0) err(where, 'exits must be a non-empty array');
  else {
    if (new Set(l.exits).size !== l.exits.length) err(where, 'duplicate exit');
    l.exits.forEach((x) => {
      if (x === l.id) err(where, 'exit to itself');
      else if (!isLoc(x)) err(where, 'exit "' + x + '" is not a location');
      else {
        const other = locById.get(x);
        if (other && Array.isArray(other.exits) && other.exits.indexOf(l.id) === -1) err(where, 'exit to ' + x + ' is not symmetric (' + x + ' does not list ' + l.id + ')');
      }
    });
  }
  const sched = l.npcIdsBySchedule;
  if (checkKeys(sched, PHASES, where + '.npcIdsBySchedule')) {
    for (const p of PHASES) {
      if (!Array.isArray(sched[p])) { err(where + '.npcIdsBySchedule.' + p, 'must be an array'); continue; }
      if (new Set(sched[p]).size !== sched[p].length) err(where + '.npcIdsBySchedule.' + p, 'duplicate NPC');
      sched[p].forEach((id) => {
        if (!isNpc(id)) { err(where + '.npcIdsBySchedule.' + p, '"' + id + '" is not an NPC'); return; }
        const n = npcById.get(id);
        if (n && (n.alive !== true || n.status !== 'free')) err(where + '.npcIdsBySchedule.' + p, id + ' is scheduled but is ' + (n.alive !== true ? 'dead' : n.status));
        if (!npcPhaseSlots.has(id)) npcPhaseSlots.set(id, {});
        const slots = npcPhaseSlots.get(id);
        (slots[p] = slots[p] || []).push(l.id);
      });
    }
  }
});
for (const t of REQUIRED_LOCATION_TYPES) if (!typesSeen[t]) err('TOWN_DATA.locations', 'no location of type "' + t + '"');
if (typesSeen.watch !== 1) err('TOWN_DATA.locations', 'need exactly one "watch" location (arrested NPCs are moved there), found ' + (typesSeen.watch || 0));
// Connectivity from the gate.
if (isLoc(T.startLocationIds && T.startLocationIds.gate)) {
  const seen = new Set([T.startLocationIds.gate]);
  const queue = [T.startLocationIds.gate];
  while (queue.length) {
    const l = locById.get(queue.shift());
    (l && Array.isArray(l.exits) ? l.exits : []).forEach((x) => { if (isLoc(x) && !seen.has(x)) { seen.add(x); queue.push(x); } });
  }
  locations.forEach((l) => { if (l && !seen.has(l.id)) err('locations(' + l.id + ')', 'not reachable from the gate'); });
}

// NPCs
if (npcs.length < 12 || npcs.length > 15) err('TOWN_DATA.npcs', 'expected 12 to 15 NPCs, found ' + npcs.length);
const tagSet = new Set();
const seenNames = new Set();
const seenFirst = new Set();
const seenVoices = new Set();
const seenLooks = new Set();
let connectedSecrets = 0;
npcs.forEach((n, i) => {
  const where = 'npcs[' + i + '](' + (n && n.id) + ')';
  if (!checkKeys(n, ['id', 'name', 'role', 'factionId', 'tags', 'look', 'voice', 'personality', 'goal', 'secret', 'attitude', 'memories', 'alive', 'knownToPlayer', 'status'], where)) return;
  checkStr(n.name, where + '.name', { noPlaceholders: true });
  if (typeof n.name === 'string') {
    if (seenNames.has(n.name)) err(where, 'duplicate name "' + n.name + '"');
    seenNames.add(n.name);
  }
  checkStr(n.role, where + '.role', { noPlaceholders: true });
  if (n.factionId !== null && !isFac(n.factionId)) err(where, 'factionId "' + n.factionId + '" is not a faction (or null)');
  if (!Array.isArray(n.tags) || n.tags.length === 0) err(where, 'tags must be a non-empty array');
  else n.tags.forEach((t) => {
    if (typeof t !== 'string' || !/^[a-z]+$/.test(t)) err(where, 'tag "' + t + '" must be a lowercase word');
    tagSet.add(t);
  });
  for (const f of ['look', 'voice', 'goal', 'secret']) checkStr(n[f], where + '.' + f, { noPlaceholders: true, maxSentences: f === 'voice' ? 4 : 2 });
  if (typeof n.voice === 'string') { if (seenVoices.has(n.voice)) err(where, 'voice duplicates another NPC'); seenVoices.add(n.voice); }
  if (typeof n.look === 'string') { if (seenLooks.has(n.look)) err(where, 'look duplicates another NPC'); seenLooks.add(n.look); }
  if (!Array.isArray(n.personality) || n.personality.length !== 2 || !n.personality.every(isStr)) err(where, 'personality must be exactly 2 trait strings');
  if (!isInt(n.attitude) || n.attitude < -20 || n.attitude > 20) err(where, 'attitude must be an integer -20..20');
  if (!Array.isArray(n.memories) || n.memories.length !== 0) err(where, 'memories must be []');
  if (n.alive !== true) err(where, 'alive must be true');
  if (n.knownToPlayer !== false) err(where, 'knownToPlayer must be false');
  if (n.status !== 'free') err(where, 'status must be "free"');
  if (typeof n.secret === 'string' && mentionsCast(n.secret, n.id)) connectedSecrets++;
  const slots = npcPhaseSlots.get(n.id) || {};
  const phasesPresent = PHASES.filter((p) => slots[p] && slots[p].length);
  if (phasesPresent.length < 2) err(where, 'appears in ' + phasesPresent.length + ' phase(s); every NPC needs at least 2');
  for (const p of PHASES) if (slots[p] && slots[p].length > 1) err(where, 'scheduled in two places at once (' + p + ': ' + slots[p].join(', ') + ')');
});
const firstNames = npcs.filter((n) => n && typeof n.name === 'string').map((n) => {
  const parts = n.name.split(/\s+/);
  return parts.length > 2 ? parts[1] : parts[0]; // skip a title such as "Father" or "Jonker"
});
firstNames.forEach((f) => { if (seenFirst.has(f)) err('TOWN_DATA.npcs', 'two NPCs share the first name "' + f + '"'); seenFirst.add(f); });
for (const t of REQUIRED_TAGS) if (!tagSet.has(t)) err('TOWN_DATA.npcs', 'no NPC has the required tag "' + t + '"');
if (connectedSecrets < Math.ceil(npcs.length / 2)) err('TOWN_DATA.npcs', 'only ' + connectedSecrets + ' secrets mention another NPC or a faction; need at least half');

// Factions
if (factions.length !== 3) err('TOWN_DATA.factions', 'expected exactly 3 factions, found ' + factions.length);
let clockTotal = 0;
let negativePairs = 0;
factions.forEach((f, i) => {
  const where = 'factions[' + i + '](' + (f && f.id) + ')';
  if (!checkKeys(f, ['id', 'name', 'goal', 'methods', 'clocks', 'activeClock', 'relations'], where)) return;
  checkStr(f.name, where + '.name', { noPlaceholders: true });
  checkStr(f.goal, where + '.goal', { noPlaceholders: true, maxSentences: 2 });
  checkStr(f.methods, where + '.methods', { noPlaceholders: true, maxSentences: 2 });
  if (f.activeClock !== 0) err(where, 'activeClock must be 0');
  if (!Array.isArray(f.clocks) || f.clocks.length < 2 || f.clocks.length > 3) err(where, 'needs 2 or 3 clocks');
  (Array.isArray(f.clocks) ? f.clocks : []).forEach((c, ci) => {
    const cw = where + '.clocks[' + ci + ']';
    clockTotal++;
    if (!checkKeys(c, ['label', 'segments', 'filled', 'onComplete'], cw)) return;
    checkStr(c.label, cw + '.label', { noPlaceholders: true });
    if (c.segments !== 6) err(cw, 'segments must be 6');
    if (c.filled !== 0) err(cw, 'filled must be 0');
    if (!checkKeys(c.onComplete, ['text', 'effects'], cw + '.onComplete')) return;
    checkStr(c.onComplete.text, cw + '.onComplete.text', { sentences: 1, noPlaceholders: true });
    const effs = c.onComplete.effects;
    if (!Array.isArray(effs) || effs.length < 2 || effs.length > 4) err(cw + '.onComplete.effects', 'needs 2 to 4 effect ops');
    else {
      effs.forEach((e, ei) => checkEffect(e, cw + '.onComplete.effects[' + ei + ']'));
      if (new Set(effs.map((e) => e && e.op)).size < 2) err(cw + '.onComplete.effects', 'use at least 2 different ops so the town visibly changes');
    }
  });
  if (!isObj(f.relations)) err(where, 'relations must be an object');
  else {
    const others = factions.filter((o) => o && o.id !== f.id).map((o) => o.id);
    for (const o of others) if (!(o in f.relations)) err(where + '.relations', 'missing relation to ' + o);
    for (const k of Object.keys(f.relations)) {
      if (!isFac(k) || k === f.id) err(where + '.relations', 'bad key "' + k + '"');
      const v = f.relations[k];
      if (!isInt(v) || v < -100 || v > 100) err(where + '.relations.' + k, 'must be an integer -100..100');
      const other = facById.get(k);
      if (other && isObj(other.relations) && other.relations[f.id] !== v) err(where + '.relations.' + k, 'not symmetric with ' + k + '.relations.' + f.id);
      if (f.id < k && isInt(v) && v < 0) negativePairs++;
    }
  }
});
if (factions.length === 3 && negativePairs < 2) err('TOWN_DATA.factions', 'relations should be mostly negative (at least 2 of 3 pairs)');

// Threads
if (threads.length < 2 || threads.length > 3) err('TOWN_DATA.threads', 'expected 2 or 3 threads, found ' + threads.length);
threads.forEach((t, i) => checkThread(t, 'threads[' + i + '](' + (t && t.id) + ')', 'open'));

// Seeds
if (seeds.length < 5 || seeds.length > 8) err('TOWN_DATA.seeds', 'expected 5 to 8 seeds, found ' + seeds.length);
seeds.forEach((s, i) => checkSeed(s, 'seeds[' + i + '](' + (s && s.id) + ')', true));
const nonDaySeeds = seeds.filter((s) => s && s.trigger && s.trigger.type !== 'day').length;
if (nonDaySeeds > 1) err('TOWN_DATA.seeds', 'at most one starting seed may use a non-day trigger, found ' + nonDaySeeds);

// Rumours
if (rumours.length !== 10) err('TOWN_DATA.rumours', 'expected exactly 10 rumours, found ' + rumours.length);
rumours.forEach((r, i) => checkRumour(r, 'rumours[' + i + '](' + (r && r.id) + ')'));
const trueCount = rumours.filter((r) => r && r['true'] === true).length;
const falseCount = rumours.filter((r) => r && r['true'] === false).length;
if (trueCount !== 7 || falseCount !== 3) err('TOWN_DATA.rumours', 'need exactly 7 true and 3 false, found ' + trueCount + ' / ' + falseCount);

// No placeholders anywhere in TOWN_DATA.
(function walk(v, where) {
  if (typeof v === 'string') { if (/[{}]/.test(v)) err(where, 'placeholder braces are only allowed in LOOSE_ENDS and templates'); return; }
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, where + '[' + i + ']'));
  else if (isObj(v)) for (const k of Object.keys(v)) walk(v[k], where + '.' + k);
})(T, 'TOWN_DATA');

// ---------------------------------------------------------------------------
// 6. TABLES
// ---------------------------------------------------------------------------
const TABLE_SPEC = {
  npc: { firstNames: 30, familyNames: 30, occupations: 30, traits: 30, wants: 20, speechQuirks: 20 },
  location: { types: 15, details: 20, problems: 15 },
  items: { goods: 40, trinkets: 20 },
  complications: 20,
  weather: { spring: 6, summer: 6, autumn: 6, winter: 6 }
};
let tableEntries = 0;
if (checkKeys(TABLES, Object.keys(TABLE_SPEC), 'TABLES')) {
  for (const group of Object.keys(TABLE_SPEC)) {
    const spec = TABLE_SPEC[group];
    if (typeof spec === 'number') {
      checkStrList(TABLES[group], 'TABLES.' + group, spec, { noPlaceholders: true });
      tableEntries += Array.isArray(TABLES[group]) ? TABLES[group].length : 0;
      continue;
    }
    if (!checkKeys(TABLES[group], Object.keys(spec), 'TABLES.' + group)) continue;
    for (const key of Object.keys(spec)) {
      const where = 'TABLES.' + group + '.' + key;
      const list = TABLES[group][key];
      tableEntries += Array.isArray(list) ? list.length : 0;
      if (group === 'items' && key === 'goods') {
        if (!Array.isArray(list)) { err(where, 'expected an array'); continue; }
        if (list.length !== spec[key]) err(where, 'expected exactly ' + spec[key] + ' entries, found ' + list.length);
        const seen = new Set();
        list.forEach((g, gi) => {
          const gw = where + '[' + gi + ']';
          if (!checkKeys(g, ['name', 'price'], gw)) return;
          checkStr(g.name, gw + '.name', { noPlaceholders: true });
          if (typeof g.price !== 'number' || !isInt(g.price) || g.price < 1 || g.price > 60) err(gw, 'price must be an integer number of silver, 1..60');
          if (typeof g.name === 'string') { if (seen.has(g.name.toLowerCase())) err(gw, 'duplicate good "' + g.name + '"'); seen.add(g.name.toLowerCase()); }
        });
      } else {
        checkStrList(list, where, spec[key], { noPlaceholders: true });
      }
    }
    if (group === 'npc' && Array.isArray(TABLES.npc.firstNames)) {
      TABLES.npc.firstNames.forEach((f) => { if (seenFirst.has(f)) err('TABLES.npc.firstNames', '"' + f + '" is already a cast first name'); });
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Character creation data
// ---------------------------------------------------------------------------
if (!Array.isArray(BACKGROUNDS) || BACKGROUNDS.length !== 6) err('BACKGROUNDS', 'expected exactly 6 backgrounds');
const arrivals = new Set();
(Array.isArray(BACKGROUNDS) ? BACKGROUNDS : []).forEach((b, i) => {
  const where = 'BACKGROUNDS[' + i + '](' + (b && b.id) + ')';
  if (!checkKeys(b, ['id', 'name', 'blurb', 'stats', 'gold', 'items', 'arrival'], where)) return;
  checkStr(b.name, where + '.name', { noPlaceholders: true });
  checkStr(b.blurb, where + '.blurb', { sentences: 1, noPlaceholders: true });
  if (checkKeys(b.stats, ['might', 'wits', 'charm', 'stealth'], where + '.stats')) {
    let sum = 0;
    for (const k of ['might', 'wits', 'charm', 'stealth']) {
      const v = b.stats[k];
      if (!isInt(v) || v < -1 || v > 3) err(where + '.stats.' + k, 'must be an integer -1..3');
      else sum += v;
    }
    if (sum !== 3) err(where + '.stats', 'must total 3, found ' + sum);
  }
  if (!isInt(b.gold) || b.gold < 5 || b.gold > 40) err(where + '.gold', 'must be an integer 5..40');
  if (!Array.isArray(b.items) || b.items.length !== 2) err(where + '.items', 'needs exactly 2 items');
  else b.items.forEach((it, ii) => {
    const iw = where + '.items[' + ii + ']';
    if (!checkKeys(it, ['id', 'name', 'qty', 'notes'], iw)) return;
    checkStr(it.name, iw + '.name', { noPlaceholders: true });
    if (!isInt(it.qty) || it.qty < 1) err(iw + '.qty', 'must be a positive integer');
    if (typeof it.notes !== 'string') err(iw + '.notes', 'must be a string');
    else if (it.notes) checkStr(it.notes, iw + '.notes', { noPlaceholders: true });
  });
  if (b.arrival !== 'gate' && b.arrival !== 'docks') err(where + '.arrival', 'must be "gate" or "docks"');
  else arrivals.add(b.arrival);
});
if (Array.isArray(BACKGROUNDS)) {
  const names = BACKGROUNDS.map((b) => (b && typeof b.name === 'string' ? b.name.toLowerCase() : ''));
  for (const r of REQUIRED_BACKGROUNDS) if (names.indexOf(r) === -1) err('BACKGROUNDS', 'missing the "' + r + '" background');
  if (arrivals.size !== 2) err('BACKGROUNDS', 'should use both arrival points (gate and docks)');
}

if (!Array.isArray(FLAWS) || FLAWS.length !== 8) err('FLAWS', 'expected exactly 8 flaws');
checkStrList(FLAWS, 'FLAWS', undefined, { maxSentences: 1, noPlaceholders: true });

function checkPlaceholders(s, where, required) {
  if (typeof s !== 'string') return;
  const found = s.match(/\{[^}]*\}/g) || [];
  found.forEach((p) => { if (p !== '{npc}' && p !== '{player}') err(where, 'unknown placeholder ' + p); });
  if (/[{}]/.test(s.replace(/\{npc\}|\{player\}/g, ''))) err(where, 'stray brace');
  required.forEach((p) => { if (s.indexOf(p) === -1) err(where, 'must contain ' + p); });
}
function checkDayOffset(v, where, min, max) {
  if (!Array.isArray(v) || v.length !== 2 || !isInt(v[0]) || !isInt(v[1])) { err(where, 'dayOffset must be [min, max] integers'); return; }
  if (v[0] < min || v[1] > max || v[0] > v[1]) err(where, 'dayOffset must satisfy ' + min + ' <= min <= max <= ' + max + ', found [' + v.join(', ') + ']');
}

if (checkKeys(LOOSE_ENDS, LOOSE_END_KEYS, 'LOOSE_ENDS')) {
  for (const key of LOOSE_END_KEYS) {
    const le = LOOSE_ENDS[key];
    const where = 'LOOSE_ENDS.' + key;
    if (!checkKeys(le, ['label', 'options', 'link', 'newNpc', 'seed'], where)) continue;
    checkStr(le.label, where + '.label', { noPlaceholders: true });
    checkStrList(le.options, where + '.options', 3, { noPlaceholders: true, maxSentences: 1 });
    (Array.isArray(le.options) ? le.options : []).forEach((o, oi) => {
      if (typeof o === 'string' && !/\b(I|I'm|I've|I'd|my|me|mine)\b/i.test(o)) err(where + '.options[' + oi + ']', 'should be written in the first person');
    });
    if (le.link !== null) {
      if (checkKeys(le.link, ['tag'], where + '.link')) {
        if (!tagSet.has(le.link.tag)) err(where + '.link.tag', 'no NPC carries the tag "' + le.link.tag + '"');
      }
    }
    if (checkKeys(le.newNpc, ['role', 'look', 'voice', 'personality', 'goal', 'secret'], where + '.newNpc')) {
      for (const f of ['role', 'look', 'voice', 'goal', 'secret']) checkStr(le.newNpc[f], where + '.newNpc.' + f, { noPlaceholders: true, maxSentences: 2 });
      if (!Array.isArray(le.newNpc.personality) || le.newNpc.personality.length !== 2 || !le.newNpc.personality.every(isStr)) err(where + '.newNpc.personality', 'must be exactly 2 trait strings');
    }
    if (checkKeys(le.seed, ['dayOffset', 'effect', 'trigger'], where + '.seed')) {
      checkDayOffset(le.seed.dayOffset, where + '.seed.dayOffset', 2, 15);
      checkStr(le.seed.effect, where + '.seed.effect', { maxSentences: 1 });
      checkPlaceholders(le.seed.effect, where + '.seed.effect', ['{npc}']);
      if (['day', 'location', 'npc'].indexOf(le.seed.trigger) === -1) err(where + '.seed.trigger', 'must be "day", "location" or "npc"');
    }
  }
}

function checkTemplates(list, name) {
  if (!Array.isArray(list) || list.length < 6) { err(name, 'needs at least 6 templates'); return; }
  const seen = new Set();
  list.forEach((t, i) => {
    const where = name + '[' + i + ']';
    if (!checkKeys(t, ['effect', 'dayOffset'], where)) return;
    checkStr(t.effect, where + '.effect', { maxSentences: 1 });
    checkPlaceholders(t.effect, where + '.effect', ['{npc}', '{player}']);
    checkDayOffset(t.dayOffset, where + '.dayOffset', 2, 5);
    if (typeof t.effect === 'string') { if (seen.has(t.effect)) err(where, 'duplicate template'); seen.add(t.effect); }
  });
}
checkTemplates(GRUDGE_TEMPLATES, 'GRUDGE_TEMPLATES');
checkTemplates(FAVOUR_TEMPLATES, 'FAVOUR_TEMPLATES');

// ---------------------------------------------------------------------------
// 8. Report
// ---------------------------------------------------------------------------
if (problems.length) report();

const effectTotal = allEffects.length;
console.log(
  'OK ' + T.name + ': ' +
  locations.length + ' locations, ' +
  npcs.length + ' npcs (' + connectedSecrets + ' linked secrets), ' +
  factions.length + ' factions (' + clockTotal + ' clocks, ' + effectTotal + ' effects), ' +
  threads.length + ' threads, ' +
  seeds.length + ' seeds, ' +
  rumours.length + ' rumours (' + trueCount + ' true / ' + falseCount + ' false), ' +
  tableEntries + ' table entries, ' +
  BACKGROUNDS.length + ' backgrounds, ' +
  FLAWS.length + ' flaws, ' +
  Object.keys(LOOSE_ENDS).length + ' loose ends, ' +
  GRUDGE_TEMPLATES.length + ' grudges, ' +
  FAVOUR_TEMPLATES.length + ' favours, ' +
  allStrings.length + ' strings scanned'
);
