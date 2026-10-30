#!/usr/bin/env node
// Validates the town content inlined in index.html (the text between the
// "BEGIN CONTENT" and "END CONTENT" markers) against the shared data contract
// in docs/BUILD_PLAN.md, including its "Content notes" and "Setting change:
// modern day" sections, and the content brief in SPEC.md sections 4, 5, 8, 9.
// The block is evaluated in a Node vm sandbox (like a browser <script> with no
// module system), so TOWN_DATA can be hand-edited in index.html and checked.
// It also checks the narrator's example turns in index.html (EXAMPLE_TURNS_LITERARY
// and EXAMPLE_TURNS_CASUAL, one set per narration style) against the shape
// of the SPEC.md section 9 examples. Rules marked "Modern:" are the
// present-day additions to the original content checks.
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
const EXPORT_NAMES = ['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES', 'GOAL_PRESETS'];
// Optional: the guard the block carried as a stand-alone file. Harmless in the
// browser; if present it must be the last line and is ignored by the checks.
const END_BLOCK = "if (typeof module !== 'undefined') { module.exports = { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES, GOAL_PRESETS }; }";

const PHASES = ['morning', 'afternoon', 'evening', 'night'];
// The calendar (CONTRACTS section 1): weekday names for closedOn and awayOn.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const STATS = ['might', 'wits', 'charm', 'stealth'];
// Goods and services (CONTRACTS section 7): what buying one does.
const GOOD_KINDS = ['good', 'service', 'drink', 'food'];
// Obligations (CONTRACTS section 4).
const OBLIGATION_KINDS = ['debt', 'blackmail', 'promise', 'errand', 'lodging'];
const OBLIGATION_STATUSES = ['met', 'missed'];
const OBLIGATION_ID = /^obl_(debt|blackmail|promise|errand|lodging)_(npc_[a-z0-9_]+)$/;
const NPC_STATUSES = ['free', 'arrested', 'gone', 'dead'];
const THREAD_STATUSES = ['open', 'resolved', 'failed'];
const TRIGGER_TYPES = ['day', 'location', 'npc', 'clock'];
// Modern: the cast tags the engine links by. "watch" stays as an alias on police NPCs.
const REQUIRED_TAGS = ['lender', 'fence', 'police', 'watch', 'priest', 'owner', 'mechanic', 'bartender', 'boatman', 'healer', 'informant'];
// Modern: the places the brief requires (gas station, bar, motel, church, police
// station, trailer park, marina or boat ramp, big house on the hill).
const REQUIRED_LOCATION_TYPES = ['bar', 'gas', 'motel', 'church', 'police', 'trailerpark', 'marina', 'bighouse'];
const FANTASY_LOCATION_TYPES = ['tavern', 'temple', 'manor', 'smithy', 'watch', 'slum', 'riverbank'];
const REQUIRED_BACKGROUNDS = ['veteran', 'dropout', 'fired bookkeeper', 'river deckhand', 'group home kid', 'poker hustler'];
const LOOSE_END_KEYS = ['debt', 'enemy', 'secret', 'lost', 'promise'];
const CURRENCY = { symbol: '$', name: 'dollars' };
const PRICE_MIN = 2;
const PRICE_MAX = 400;
const CASH_MIN = 20;
const CASH_MAX = 400;
const PREFIX = {
  location: 'loc_', npc: 'npc_', faction: 'fac_', thread: 'thr_', seed: 'seed_',
  rumour: 'rum_', item: 'item_', background: 'bg_', event: 'evt_'
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
// Modern: no fantasy-era vocabulary and nothing supernatural, anywhere in the
// file (strings and comments). "gold" survives only as the BACKGROUNDS field
// name; "ferryman" is allowed.
const FANTASY_RE = /\b(swords?|daggers?|taverns?|guilds?|jonkers?|lords?|serfs?|wizards?|spells?|spellbooks?|magic|magical|potions?|coppers?|gold|knights?|castles?|sorcer\w*|enchant\w*)\b|\bsilver pieces?\b/i;
const SUPERNATURAL_RE = /\b(ghosts?|haunt\w*|witch\w*|curse[sd]?|demons?|spectres?|specters?|phantoms?|psychics?|supernatural)\b/i;
// Modern: starting items are things you carry, never a vehicle.
const VEHICLE_RE = /\b(truck|trucks|pickup|car|cars|van|boat|johnboat|motorcycle|motorbike|bike|scooter|atv|trailer|camper)\b/i;

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
let html;
try {
  html = fs.readFileSync(FILE, 'utf8');
  const a = html.indexOf(BEGIN);
  const b = html.indexOf(END);
  if (a < 0 || b < 0 || b < a) fatal('file', 'index.html has no "' + BEGIN + '" ... "' + END + '" block');
  if (html.indexOf(BEGIN, a + 1) >= 0 || html.indexOf(END, b + 1) >= 0) fatal('file', 'the content markers must appear exactly once');
  src = html.slice(a + BEGIN.length, b).replace(/^\r?\n/, '');
} catch (e) {
  fatal('file', 'cannot read ' + FILE + ': ' + e.message);
}

// Content note 7: flags setFlag may never write. Read from the State module in
// the same file, so this check and State.apply cannot drift apart. (The effect
// ops are code there, not a list; tests/state.test.cjs checks that OPS below
// names exactly State.EFFECT_OPS.)
const RESERVED_FLAGS = (() => {
  const m = /const RESERVED_FLAGS = (?:Object\.freeze\()?(\[[^\]]*\])/.exec(html);
  if (!m) fatal('file', 'index.html has no RESERVED_FLAGS list in its State module');
  return vm.runInNewContext(m[1], {}, { filename: 'index.html#RESERVED_FLAGS', timeout: 1000 });
})();

// Relation words: the lists the engine reads relations with (HOUSEHOLD_,
// FAMILY_, WORK_ and OTHER_RELATIONS) and the she / he forms of a gendered
// word (GENDERED_WORDS), read from the same file so the two cannot drift.
const ENGINE_WORDS = (() => {
  const grab = name => {
    const m = new RegExp('const ' + name + ' = ([\\s\\S]*?\\]\\)?);\\n').exec(html);
    if (!m) fatal('file', 'index.html has no ' + name + ' list');
    return m[1];
  };
  const code = ['HOUSEHOLD_RELATIONS', 'FAMILY_RELATIONS', 'WORK_RELATIONS', 'OTHER_RELATIONS', 'GENDERED_WORDS']
    .map(n => 'const ' + n + ' = ' + grab(n) + ';').join('\n') + '\n;({ words: FAMILY_RELATIONS.concat(WORK_RELATIONS, OTHER_RELATIONS), gendered: GENDERED_WORDS })';
  return vm.runInNewContext(code, {}, { filename: 'index.html#relations', timeout: 1000 });
})();
const RELATION_WORDS = new Set(ENGINE_WORDS.words);
// What the other person must call this one back: A lists B as a word on the
// left, so B lists A as one on the right (and the other way round).
const RELATION_PAIRS = [
  [['wife', 'husband', 'spouse', 'partner'], ['wife', 'husband', 'spouse', 'partner']],
  [['girlfriend', 'boyfriend', 'fiancee', 'fiance'], ['girlfriend', 'boyfriend', 'fiancee', 'fiance']],
  [['son', 'daughter', 'child', 'kid', 'boy', 'girl', 'baby'], ['mother', 'father', 'mom', 'dad', 'momma', 'mama', 'daddy']],
  [['stepson', 'stepdaughter'], ['stepmother', 'stepfather']],
  [['brother', 'sister'], ['brother', 'sister']],
  [['stepbrother', 'stepsister'], ['stepbrother', 'stepsister']],
  [['grandson', 'granddaughter'], ['grandmother', 'grandfather', 'grandma', 'grandpa', 'granny', 'granddad']],
  [['nephew', 'niece'], ['aunt', 'uncle']],
  [['cousin'], ['cousin']],
  [['son-in-law', 'daughter-in-law'], ['mother-in-law', 'father-in-law']],
  [['sister-in-law', 'brother-in-law'], ['sister-in-law', 'brother-in-law']],
  [['ex-wife', 'ex-husband', 'ex'], ['ex-wife', 'ex-husband', 'ex']],
  [['employee', 'worker', 'hand', 'helper', 'apprentice'], ['boss', 'employer', 'manager']],
  [['tenant', 'lodger'], ['landlord', 'landlady']],
  [['friend', 'buddy'], ['friend', 'buddy']],
  [['neighbor', 'neighbour'], ['neighbor', 'neighbour']],
  [['roommate'], ['roommate']], [['rival'], ['rival']], [['enemy'], ['enemy']]
];
function inverseWords(w) {
  const out = new Set();
  for (const [a, b] of RELATION_PAIRS) { if (a.indexOf(w) !== -1) b.forEach(x => out.add(x)); if (b.indexOf(w) !== -1) a.forEach(x => out.add(x)); }
  return out;
}
// The pronouns a relation word asks of the person it describes ("wife": she), or null.
function wordPronouns(w) {
  for (const [she, he] of ENGINE_WORDS.gendered) { if (w === she) return 'she'; if (w === he) return 'he'; }
  return null;
}
// Home types: a place someone lives that the player finds out about (discovered false until told).
const HOME_TYPES = ['house', 'trailer', 'apartment', 'farm', 'cabin', 'home'];
// A role must say who someone is, never only what they are.
const GENERIC_ROLES = ['man', 'woman', 'person', 'guy', 'lady', 'boy', 'girl', 'townsfolk', 'stranger', 'local', 'resident', 'somebody', 'someone'];
const CAST_MIN = 40; // the people in town (presence "here")
const CAST_MAX = 45;
const PEOPLE_MAX = 90; // everyone, the dead and the far away included
const PRESENCES = ['here', 'away', 'dead'];
// Town places on the map from the start, and the most homes to find.
const TOWN_PLACES_MIN = 8;
const TOWN_PLACES_MAX = 16;
const HOMES_MAX = 12;
// The People editor's limit on a history (State.EDIT_MAX.history).
const HISTORY_MAX = 400;
// Ages a look can state: "woman of forty-one", "sixteen-year-old girl", "in his fifties".
const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function wordNumber(w) {
  const parts = String(w).toLowerCase().split('-');
  if (parts.length === 1) return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, parts[0]) ? NUMBER_WORDS[parts[0]] : null;
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] >= 20 && NUMBER_WORDS[parts[0]] % 10 === 0 && NUMBER_WORDS[parts[1]] >= 1 && NUMBER_WORDS[parts[1]] <= 9) return NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]];
  return null;
}
const DECADES = { teens: 13, twenties: 20, thirties: 30, forties: 40, fifties: 50, sixties: 60, seventies: 70, eighties: 80, nineties: 90 };
/* The age a look states: { exact } or { min, max }, or null when it says none. */
function lookAge(look) {
  const t = String(look || '').toLowerCase();
  const NUM = "([a-z]+(?:-[a-z]+)?)";
  let m = new RegExp("\\b(?:man|woman|kid|boy|girl|guy|gal|lady|fellow|teenager)\\s+of\\s+" + NUM + "\\b").exec(t);
  if (m && wordNumber(m[1]) !== null) return { exact: wordNumber(m[1]) };
  m = new RegExp("\\b" + NUM + "-year-old\\b").exec(t);
  if (m && wordNumber(m[1]) !== null) return { exact: wordNumber(m[1]) };
  m = /\bin (?:his|her|their) (early |mid-|late )?(teens|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b/.exec(t);
  if (m) {
    const lo = DECADES[m[2]];
    const span = m[2] === 'teens' ? [13, 19] : m[1] === 'early ' ? [lo, lo + 3] : m[1] === 'mid-' ? [lo + 3, lo + 6] : m[1] === 'late ' ? [lo + 6, lo + 9] : [lo, lo + 9];
    return { min: span[0], max: span[1] };
  }
  return null;
}
/* The year in a short phrase ("spring of 1979, a stroke"), or null. */
function yearIn(s) { const m = /\b(1[89]\d\d|20\d\d)\b/.exec(String(s || '')); return m ? Number(m[1]) : null; }

const trimmed = src.replace(/\s+$/, '');
let body = trimmed;
if (trimmed.endsWith(END_BLOCK)) body = trimmed.slice(0, -END_BLOCK.length);

// eslint-style strip of comments and double-quoted strings, leaving code only.
// Comments are collected for the vocabulary scan.
const comments = [];
function stripCode(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') { const s = i; while (i < n && text[i] !== '\n') i++; comments.push(text.slice(s, i)); continue; }
    if (c === '/' && d === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0) { err('syntax', 'unterminated block comment'); return out; }
      comments.push(text.slice(i, j + 2));
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
// Modern: "gold" may appear only as the BACKGROUNDS field name.
const goldKeys = (code.match(/\bgold\b/g) || []).length;
const goldKeyUses = (code.match(/\bgold\s*:/g) || []).length;
if (goldKeys !== goldKeyUses) err('syntax', '"gold" used in code other than as the BACKGROUNDS field name');

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
// Modern: fantasy vocabulary and the supernatural, in strings and comments.
function vocabProblem(s) {
  const f = FANTASY_RE.exec(s);
  if (f) return 'fantasy-era word "' + f[0] + '"';
  const m = SUPERNATURAL_RE.exec(s);
  if (m) return 'supernatural word "' + m[0] + '"';
  return null;
}
for (const [where, s] of allStrings) {
  const p = vocabProblem(s);
  if (p) err(where, p + ' in "' + s.slice(0, 60) + '"');
}
comments.forEach((c, i) => {
  const p = vocabProblem(c);
  if (p) err('file(comment ' + (i + 1) + ')', p + ' in "' + c.slice(0, 60) + '"');
});

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

const events = Array.isArray(T.events) ? T.events : [];
events.forEach((ev, i) => registerId(ev && ev.id, 'event', 'events[' + i + ']'));

// Every effect list the town data holds, so ids made by effects (a rumour, a
// seed, a thread) are known everywhere: clock completions and their
// alternatives (CONTRACTS section 3), starting seeds' effects and
// alternatives, the town events' branches (section 11) and the epilogue.
const allEffects = []; // [where, effect]
const pushEffects = (list, where) => { if (Array.isArray(list)) list.forEach((e, ei) => allEffects.push([where + '[' + ei + ']', e])); };
factions.forEach((f, fi) => {
  if (!f || !Array.isArray(f.clocks)) return;
  f.clocks.forEach((c, ci) => {
    const oc = c && isObj(c.onComplete) ? c.onComplete : {};
    const cw = 'factions[' + fi + '](' + f.id + ').clocks[' + ci + ']';
    pushEffects(oc.effects, cw + '.effects');
    if (isObj(oc.alt)) pushEffects(oc.alt.effects, cw + '.alt.effects');
  });
});
seeds.forEach((s, si) => {
  if (!isObj(s)) return;
  pushEffects(s.effects, 'seeds[' + si + '](' + s.id + ').effects');
  if (isObj(s.alt)) pushEffects(s.alt.effects, 'seeds[' + si + '](' + s.id + ').alt.effects');
});
events.forEach((ev, i) => {
  if (!isObj(ev)) return;
  (Array.isArray(ev.branches) ? ev.branches : []).forEach((b, bi) => { if (isObj(b)) pushEffects(b.effects, 'events[' + i + '](' + ev.id + ').branches[' + bi + '].effects'); });
  if (isObj(ev.default)) pushEffects(ev.default.effects, 'events[' + i + '](' + ev.id + ').default.effects');
});
if (isObj(T.epilogue)) {
  (Array.isArray(T.epilogue.branches) ? T.epilogue.branches : []).forEach((b, bi) => { if (isObj(b)) pushEffects(b.effects, 'epilogue.branches[' + bi + '].effects'); });
  if (isObj(T.epilogue.default)) pushEffects(T.epilogue.default.effects, 'epilogue.default.effects');
}
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

function locationById(id) { return locations.find((l) => isObj(l) && l.id === id) || {}; }
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
// A faction alias that is also the town's name would make every mention of
// the town count as "tied to a faction", so it is not allowed.
for (const f of factions) {
  if (f && typeof T.name === 'string' && factionAliases(f).some((a) => mentions(T.name, a, true) || mentions(a, T.name, true))) {
    err('factions(' + f.id + ')', 'name "' + f.name + '" overlaps the town name; the linked-secret check would be meaningless');
  }
}

// ---------------------------------------------------------------------------
// 4. Shared validators for threads, rumours, seeds, triggers, effects.
// ---------------------------------------------------------------------------
function checkThread(t, where, expectStatus) {
  if (!checkKeys(t, ['id', 'title', 'summary', 'status', 'knownToPlayer', 'linkedIds'], where, ['reward'])) return;
  // What resolving it teaches the player (CONTRACTS section 9): +1 to this stat.
  if (t.reward !== undefined && STATS.indexOf(t.reward) === -1) err(where + '.reward', 'must be one of ' + STATS.join(', ') + ', found ' + JSON.stringify(t.reward));
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

// A rumour may name the thread it bears on (threadId), the faction whose
// people know it (factionId) and the other people who can tell it (tellerIds:
// people in town besides the source).
function checkRumour(r, where) {
  if (!checkKeys(r, ['id', 'text', 'true', 'sourceNpcId', 'heard'], where, ['threadId', 'tellerIds', 'factionId'])) return;
  checkStr(r.text, where + '.text', { noPlaceholders: true, maxSentences: 2 });
  if (typeof r['true'] !== 'boolean') err(where, '"true" must be a boolean');
  if (!isNpc(r.sourceNpcId)) err(where, 'sourceNpcId "' + r.sourceNpcId + '" is not an NPC');
  if (r.heard !== false) err(where, 'heard must be false');
  if (r.threadId !== undefined && !isThread(r.threadId)) err(where + '.threadId', '"' + r.threadId + '" is not a thread');
  if (r.factionId !== undefined && !isFac(r.factionId)) err(where + '.factionId', '"' + r.factionId + '" is not a faction');
  if (r.tellerIds !== undefined) {
    if (!Array.isArray(r.tellerIds) || !r.tellerIds.length) err(where + '.tellerIds', 'a non-empty array of NPC ids');
    else {
      if (new Set(r.tellerIds).size !== r.tellerIds.length) err(where + '.tellerIds', 'duplicate id');
      r.tellerIds.forEach((id, i) => {
        if (!isNpc(id)) err(where + '.tellerIds[' + i + ']', '"' + id + '" is not an NPC');
        else if (id === r.sourceNpcId) err(where + '.tellerIds[' + i + ']', 'the source tells it already; list the others');
        else if ((npcById.get(id).presence || 'here') !== 'here') err(where + '.tellerIds[' + i + ']', id + ' is not in town to tell it');
      });
    }
  }
}
// Who can pass a rumour on: its source, the people in its faction (or the
// source's), and its tellerIds.
function tellersOf(r) {
  const out = new Set([r.sourceNpcId]);
  (Array.isArray(r.tellerIds) ? r.tellerIds : []).forEach((id) => out.add(id));
  const src = npcById.get(r.sourceNpcId);
  const fac = r.factionId || (src && src.factionId);
  if (fac) npcs.forEach((n) => { if (n && n.factionId === fac && (n.presence || 'here') === 'here') out.add(n.id); });
  return out;
}

// The days an aftermath seed the ending plants may wait for: from the
// latest day the ending can come (epilogue.onDay) to the end of the month
// after it, so the town keeps moving once the story has ended.
const ENDING_DAYS = [21, 30];
// allowDay: true for a starting seed (a day 3..15), false for a seed a clock
// plants (npc or location only), 'ending' for one the epilogue plants (npc,
// location, or a day in ENDING_DAYS).
function checkTrigger(t, where, allowDay) {
  if (!checkKeys(t, ['type', 'value'], where)) return;
  if (TRIGGER_TYPES.indexOf(t.type) === -1) { err(where, 'trigger type "' + t.type + '" not one of ' + TRIGGER_TYPES.join('/')); return; }
  // Content note 1 (modern brief): seeds planted by clocks use npc or location triggers.
  if (!allowDay && t.type !== 'npc' && t.type !== 'location') {
    err(where, 'a seed planted by a clock must use an npc or location trigger (the day a clock finishes is unknown), found "' + t.type + '"');
  }
  if (allowDay === 'ending' && t.type === 'clock') err(where, 'a seed the ending plants uses an npc, location or day trigger');
  if (t.type === 'day' && allowDay === 'ending') {
    if (!isInt(t.value) || t.value < ENDING_DAYS[0] || t.value > ENDING_DAYS[1]) err(where, 'a seed the ending plants waits for a day ' + ENDING_DAYS.join('..') + ' (after the latest ending), found ' + JSON.stringify(t.value));
  } else if (t.type === 'day') {
    if (!isInt(t.value) || t.value < 3 || t.value > 15) err(where, 'day trigger value must be an integer 3..15, found ' + JSON.stringify(t.value));
  } else if (t.type === 'location') {
    // One place, or any of several (the tackle box under the bridge can be reached from the landing too).
    const list = Array.isArray(t.value) ? t.value : [t.value];
    if (!list.length) err(where, 'location trigger needs a place');
    list.forEach((v) => { if (!isLoc(v)) err(where, 'location trigger "' + v + '" is not a location'); else if (locationById(v).away === true) err(where, 'location trigger "' + v + '" is out of town: the player never goes there'); });
  } else if (t.type === 'npc') {
    if (!isNpc(t.value)) err(where, 'npc trigger "' + t.value + '" is not an NPC');
  } else if (t.type === 'clock') {
    const m = typeof t.value === 'string' ? t.value.match(/^(fac_[a-z0-9_]+):(\d+)$/) : null;
    if (!m) err(where, 'clock trigger must look like "fac_x:N", found ' + JSON.stringify(t.value));
    else {
      if (!isFac(m[1])) err(where, 'clock trigger faction "' + m[1] + '" does not exist');
      const n = Number(m[2]);
      const most = Math.max.apply(null, (facById.get(m[1]) && Array.isArray(facById.get(m[1]).clocks) ? facById.get(m[1]).clocks : []).map((c) => (c && isInt(c.segments) ? c.segments : 6)).concat([1]));
      if (n < 1 || n > most) err(where, 'clock trigger segment must be 1..' + most);
    }
  }
}

function checkSeed(s, where, allowDay) {
  if (!checkKeys(s, ['id', 'cause', 'effect', 'trigger', 'fired', 'hidden'], where, ['requires', 'alt', 'effects'])) return;
  checkStr(s.cause, where + '.cause', { noPlaceholders: true, maxSentences: 2 });
  checkStr(s.effect, where + '.effect', { noPlaceholders: true, maxSentences: 2 });
  checkTrigger(s.trigger, where + '.trigger', allowDay);
  // Effects applied when it fires, and what holds it back (CONTRACTS section 3).
  // An aftermath seed of the ending may settle a thread like the ending does.
  const ending = allowDay === 'ending';
  if (s.effects !== undefined) checkEffectList(s.effects, where + '.effects', { min: 1, max: 4, ending: ending });
  if (s.requires !== undefined) checkRequires(s.requires, where + '.requires');
  if (s.alt !== undefined) checkAlt(s.alt, where + '.alt', 2, s.requires, ending);
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
  reputationDelta: ['key', 'delta'],
  // CONTRACTS section 2: the ops engine-state adds to State.EFFECTS.
  playerGold: ['delta'],
  playerHp: ['delta'],
  giveItem: ['name'],
  placeItem: ['name'],
  takeItem: ['name'],
  addCondition: ['name', 'effect', 'days'],
  banFrom: ['locationId', 'days'],
  playerPrice: ['factor', 'days'],
  addMemory: ['npcId', 'text', 'weight'],
  clockAdjust: ['factionId', 'delta'],
  threadUpdate: ['threadId'],
  addObligation: ['kind', 'npcId', 'text'],
  settleObligation: ['id', 'status'],
  // Wave 5: money credited toward a debt (a seizure: take, from the player's cash).
  obligationPaid: ['id', 'amount'],
  addNews: ['text']
};
// The fields an op may carry besides its required ones.
const OPS_OPTIONAL = {
  playerHp: ['allowDefeat'],
  giveItem: ['notes'],
  placeItem: ['notes', 'locationId'],
  banFrom: ['byNpcId'],
  threadUpdate: ['summary', 'status', 'knownToPlayer'],
  addObligation: ['amount', 'dueDay', 'itemName', 'onMiss', 'onMet'],
  obligationPaid: ['take'],
  addNews: ['factionId', 'public']
};
const opCounts = {};
// Flags the content sets (setFlag) and the flags its conditions read
// (requires, an event's when, the epilogue): a flag read is a flag set.
const flagsWritten = new Set();
const flagsRead = []; // [where, key]
// Placeholders (CONTRACTS section 2), only in the loose ends' obligations and
// the grudge and favour templates: "{npcId}" for an id, "{npc}" and
// "{playerName}" inside text. The engine fills them before State.apply.
const PH_TEXT = ['{npc}', '{playerName}'];
function npcRef(v, ph) { return isNpc(v) || (ph === true && v === '{npcId}'); }
function checkText(s, where, opts) {
  opts = opts || {};
  if (!checkStr(s, where, { maxSentences: opts.maxSentences })) return;
  if (opts.max && s.length > opts.max) err(where, 'at most ' + opts.max + ' characters, found ' + s.length);
  const found = s.match(/\{[^}]*\}/g) || [];
  if (found.length && !opts.ph) err(where, 'placeholders are only allowed in the loose ends and the grudge and favour templates');
  found.forEach((p) => { if (PH_TEXT.indexOf(p) === -1) err(where, 'unknown placeholder ' + p + ' (use ' + PH_TEXT.join(', ') + ')'); });
  if (/[{}]/.test(s.replace(/\{[^}]*\}/g, ''))) err(where, 'stray brace');
}
// A condition effect in the form "-1 might" or "+1 charm, -1 wits" (CONTRACTS section 8).
const CONDITION_EFFECT = /^[+-][1-3] (might|wits|charm|stealth|all)(, [+-][1-3] (might|wits|charm|stealth|all))*$/;

function checkDelta(v, where, max) {
  if (!isInt(v) || v === 0 || Math.abs(v) > max) err(where, 'delta must be a non-zero integer within +/-' + max + ', found ' + JSON.stringify(v));
}

function checkEffectList(list, where, opts) {
  opts = opts || {};
  if (!Array.isArray(list)) { err(where, 'must be an array of effect ops'); return; }
  if (opts.min !== undefined && list.length < opts.min) err(where, 'needs at least ' + opts.min + ' effect op(s)');
  if (opts.max !== undefined && list.length > opts.max) err(where, 'at most ' + opts.max + ' effect ops');
  list.forEach((e, i) => checkEffect(e, where + '[' + i + ']', opts));
}

// An obligation id (obl_<kind>_<npc id>) the loose ends can make: some
// option of that kind binds, by its tag, to someone who is that person.
function obligationPossible(id) {
  const m = OBLIGATION_ID.exec(id || '');
  if (!m) return false;
  const kind = m[1];
  const n = npcById.get(m[2]);
  if (!n || !Array.isArray(n.tags)) return false;
  for (const key of Object.keys(isObj(LOOSE_ENDS) ? LOOSE_ENDS : {})) {
    const le = LOOSE_ENDS[key];
    if (!isObj(le) || !isObj(le.link)) continue;
    const opts = Array.isArray(le.options) ? le.options : [];
    for (let i = 0; i < opts.length; i++) {
      const ob = (Array.isArray(le.obligations) && isObj(le.obligations[i])) ? le.obligations[i] : le.obligation;
      if (!isObj(ob) || ob.kind !== kind) continue;
      const tag = (Array.isArray(le.link.optionTags) && le.link.optionTags[i]) || le.link.tag;
      if (n.tags.indexOf(tag) !== -1 || n.tags.indexOf(le.link.tag) !== -1) return true;
    }
  }
  return false;
}
function checkFlagList(list, where) {
  if (!Array.isArray(list) || !list.length) { err(where, 'a non-empty array of flag names'); return; }
  list.forEach((k, i) => {
    if (typeof k !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) err(where + '[' + i + ']', 'a flag name');
    else flagsRead.push([where + '[' + i + ']', k]);
  });
}
function checkNpcList(list, where) {
  if (!Array.isArray(list) || !list.length) { err(where, 'a non-empty array of NPC ids'); return; }
  list.forEach((id, i) => { if (!isNpc(id)) err(where + '[' + i + ']', '"' + id + '" is not an NPC'); });
}
// requires (CONTRACTS section 3): what must hold when a seed or a clock fires.
function checkRequires(r, where) {
  if (!checkKeys(r, [], where, ['npcFree', 'npcAt', 'flagsSet', 'flagsUnset', 'obligationOpen'])) return;
  if (!Object.keys(r).length) err(where, 'empty: say what must hold, or leave requires out');
  if (r.npcFree !== undefined) checkNpcList(r.npcFree, where + '.npcFree');
  if (r.npcAt !== undefined) {
    if (!isObj(r.npcAt) || !Object.keys(r.npcAt).length) err(where + '.npcAt', 'an object { npcId: locationId }');
    else for (const k of Object.keys(r.npcAt)) { if (!isNpc(k)) err(where + '.npcAt', '"' + k + '" is not an NPC'); if (!isLoc(r.npcAt[k])) err(where + '.npcAt.' + k, '"' + r.npcAt[k] + '" is not a location'); }
  }
  if (r.flagsSet !== undefined) checkFlagList(r.flagsSet, where + '.flagsSet');
  if (r.flagsUnset !== undefined) checkFlagList(r.flagsUnset, where + '.flagsUnset');
  if (r.obligationOpen !== undefined) {
    if (!Array.isArray(r.obligationOpen) || !r.obligationOpen.length) err(where + '.obligationOpen', 'a non-empty array of obligation ids');
    else r.obligationOpen.forEach((id, i) => { if (!obligationPossible(id)) err(where + '.obligationOpen[' + i + ']', '"' + id + '" is no obligation a loose end can make'); });
  }
}
// alt: what happens instead when requires does not hold.
function checkAlt(a, where, maxSentences, requires, ending) {
  if (!checkKeys(a, ['text'], where, ['effects'])) return;
  if (requires === undefined) err(where, 'an alt without requires never fires');
  checkText(a.text, where + '.text', { maxSentences: maxSentences, max: 400 });
  if (a.effects !== undefined) checkEffectList(a.effects, where + '.effects', { max: 5, ending: ending === true });
}
// when (CONTRACTS section 11): an event branch's or the epilogue's conditions.
function checkWhen(w, where) {
  if (!checkKeys(w, [], where, ['flagsSet', 'flagsUnset', 'clockAtLeast', 'npcFree', 'attitudeAtLeast', 'obligationStatus', 'playerAt'])) return;
  if (!Object.keys(w).length) err(where, 'empty: a branch with no condition is the default');
  // playerAt: the player is at that place when it happens (the meeting with them in the room).
  if (w.playerAt !== undefined) {
    if (!isLoc(w.playerAt)) err(where + '.playerAt', '"' + w.playerAt + '" is not a location');
    else if (locationById(w.playerAt).away === true || locationById(w.playerAt).discovered === false) err(where + '.playerAt', 'a town place on the map, where the player can be');
  }
  if (w.flagsSet !== undefined) checkFlagList(w.flagsSet, where + '.flagsSet');
  if (w.flagsUnset !== undefined) checkFlagList(w.flagsUnset, where + '.flagsUnset');
  if (w.npcFree !== undefined) checkNpcList(w.npcFree, where + '.npcFree');
  if (w.clockAtLeast !== undefined) {
    if (!isObj(w.clockAtLeast) || !Object.keys(w.clockAtLeast).length) err(where + '.clockAtLeast', 'an object { factionId: segments }');
    else for (const k of Object.keys(w.clockAtLeast)) {
      if (!isFac(k)) err(where + '.clockAtLeast', '"' + k + '" is not a faction');
      if (!isInt(w.clockAtLeast[k]) || w.clockAtLeast[k] < 1) err(where + '.clockAtLeast.' + k, 'a whole number of segments, 1 or more');
    }
  }
  if (w.attitudeAtLeast !== undefined) {
    if (!isObj(w.attitudeAtLeast) || !Object.keys(w.attitudeAtLeast).length) err(where + '.attitudeAtLeast', 'an object { npcId: attitude }');
    else for (const k of Object.keys(w.attitudeAtLeast)) {
      if (!isNpc(k)) err(where + '.attitudeAtLeast', '"' + k + '" is not an NPC');
      if (!isInt(w.attitudeAtLeast[k]) || w.attitudeAtLeast[k] < -100 || w.attitudeAtLeast[k] > 100) err(where + '.attitudeAtLeast.' + k, 'an attitude, -100 to 100');
    }
  }
  if (w.obligationStatus !== undefined) {
    if (!isObj(w.obligationStatus) || !Object.keys(w.obligationStatus).length) err(where + '.obligationStatus', 'an object { obligationId: "met" | "missed" }');
    else for (const k of Object.keys(w.obligationStatus)) {
      if (!obligationPossible(k)) err(where + '.obligationStatus', '"' + k + '" is no obligation a loose end can make (obl_<kind>_<npc id>)');
      if (OBLIGATION_STATUSES.indexOf(w.obligationStatus[k]) === -1) err(where + '.obligationStatus.' + k, 'must be met or missed');
    }
  }
}

// opts.ph: placeholders allowed (loose ends, templates); opts.world: content
// the world fires on its own (it never resolves a thread); opts.ending: the
// epilogue and the seeds it plants, where the story ends: a thread the town
// kept is resolved there (once, with its story point), one it lost failed.
function checkEffect(e, where, opts) {
  opts = opts || {};
  const ph = opts.ph === true;
  if (!isObj(e)) { err(where, 'effect must be an object'); return; }
  if (!OPS[e.op]) { err(where, 'unknown op "' + e.op + '"'); return; }
  opCounts[e.op] = (opCounts[e.op] || 0) + 1;
  checkKeys(e, ['op'].concat(OPS[e.op]), where, OPS_OPTIONAL[e.op]);
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
      if (!npcRef(e.npcId, ph)) err(where, 'npcId "' + e.npcId + '" is not an NPC');
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
      // Content note 3: the world never resolves a thread (that would hand out story points).
      if (e.status === 'resolved' && !opts.ending) err(where, 'a clock may not resolve a thread (only the player earns a resolution)');
      break;
    case 'addRumour':
      checkRumour(e.rumour, where + '.rumour');
      break;
    case 'plantSeed':
      checkSeed(e.seed, where + '.seed', opts.ending ? 'ending' : false);
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
      else flagsWritten.add(e.key);
      if (['boolean', 'number', 'string'].indexOf(typeof e.value) === -1) err(where, 'value must be a boolean, number or string');
      break;
    case 'reputationDelta':
      if (e.key !== 'town' && !isFac(e.key)) err(where, 'key must be "town" or a faction id, found "' + e.key + '"');
      checkDelta(e.delta, where, 50);
      break;
    case 'playerGold':
      checkDelta(e.delta, where, 500);
      break;
    case 'playerHp':
      checkDelta(e.delta, where, 3);
      if (e.allowDefeat !== undefined && typeof e.allowDefeat !== 'boolean') err(where + '.allowDefeat', 'true or false');
      break;
    case 'giveItem':
      checkText(e.name, where + '.name', { ph, max: 60, maxSentences: 0 });
      if (e.notes !== undefined) checkText(e.notes, where + '.notes', { ph, max: 200, maxSentences: 2 });
      break;
    case 'placeItem':
      // Wave 4: a thing left lying in a place (the player's, unless locationId names an in-town place).
      checkText(e.name, where + '.name', { ph, max: 60, maxSentences: 0 });
      if (e.notes !== undefined) checkText(e.notes, where + '.notes', { ph, max: 200, maxSentences: 2 });
      if (e.locationId !== undefined && (!isLoc(e.locationId) || locationById(e.locationId).away === true)) err(where, 'locationId "' + e.locationId + '" is not a place in town');
      break;
    case 'takeItem':
      checkText(e.name, where + '.name', { ph, max: 60, maxSentences: 0 });
      break;
    case 'addCondition':
      checkText(e.name, where + '.name', { max: 40, maxSentences: 0 });
      if (typeof e.effect !== 'string' || !CONDITION_EFFECT.test(e.effect)) err(where + '.effect', 'in the form "-1 might" or "+1 charm, -1 wits", found ' + JSON.stringify(e.effect));
      if (!isInt(e.days) || e.days < 1 || e.days > 7) err(where + '.days', 'a whole number of days, 1 to 7');
      break;
    case 'banFrom':
      if (!isLoc(e.locationId)) err(where, 'locationId "' + e.locationId + '" is not a location');
      else if (locationById(e.locationId).away === true) err(where, 'locationId "' + e.locationId + '" is out of town');
      if (!isInt(e.days) || e.days < 1 || e.days > 7) err(where + '.days', 'a whole number of days, 1 to 7');
      if (e.byNpcId !== undefined && !npcRef(e.byNpcId, ph)) err(where + '.byNpcId', '"' + e.byNpcId + '" is not an NPC');
      break;
    case 'playerPrice':
      if (typeof e.factor !== 'number' || !(e.factor >= 0.5 && e.factor <= 2) || e.factor === 1) err(where, 'factor must be a number in 0.5..2 and not 1');
      if (!isInt(e.days) || e.days < 1 || e.days > 10) err(where + '.days', 'a whole number of days, 1 to 10');
      break;
    case 'addMemory':
      if (!npcRef(e.npcId, ph)) err(where, 'npcId "' + e.npcId + '" is not an NPC');
      checkText(e.text, where + '.text', { ph, max: 200, maxSentences: 2 });
      if ([1, 2, 3].indexOf(e.weight) === -1) err(where + '.weight', 'must be 1, 2 or 3');
      break;
    case 'clockAdjust':
      if (!isFac(e.factionId)) err(where, 'factionId "' + e.factionId + '" is not a faction');
      checkDelta(e.delta, where, 2);
      break;
    case 'threadUpdate':
      if (!isThread(e.threadId)) err(where, 'threadId "' + e.threadId + '" is not a thread');
      if (e.summary !== undefined) checkText(e.summary, where + '.summary', { ph, maxSentences: 3, max: 400 });
      if (e.status !== undefined) {
        if (THREAD_STATUSES.indexOf(e.status) === -1) err(where, 'status "' + e.status + '" not one of ' + THREAD_STATUSES.join('/'));
        // Wave 5 (the round-4 playtest): a town event's vote settles the thread it decides too (opts.settles: the council keeping the police).
        if (e.status === 'resolved' && !opts.ending && !opts.settles) err(where, 'the world may not resolve a thread (only the player earns a resolution, or the ending or a town event\'s vote settles it)');
      }
      if (e.knownToPlayer !== undefined && typeof e.knownToPlayer !== 'boolean') err(where + '.knownToPlayer', 'true or false');
      if (e.summary === undefined && e.status === undefined && e.knownToPlayer === undefined) err(where, 'changes nothing: give a summary, a status or knownToPlayer');
      break;
    case 'addObligation':
      if (OBLIGATION_KINDS.indexOf(e.kind) === -1) err(where + '.kind', 'one of ' + OBLIGATION_KINDS.join(', '));
      if (!npcRef(e.npcId, ph)) err(where, 'npcId "' + e.npcId + '" is not an NPC');
      checkText(e.text, where + '.text', { ph, max: 200, maxSentences: 1 });
      break;
    case 'settleObligation':
      if (!OBLIGATION_ID.test(String(e.id))) err(where + '.id', 'an obligation id obl_<kind>_<npc id>');
      if (OBLIGATION_STATUSES.indexOf(e.status) === -1) err(where + '.status', 'met or missed');
      break;
    case 'obligationPaid':
      // "{obligationId}" (the obligation whose onMiss or onMet it is) only where placeholders are.
      if (!(ph && e.id === '{obligationId}') && !OBLIGATION_ID.test(String(e.id))) err(where + '.id', 'an obligation id obl_<kind>_<npc id>, or "{obligationId}" in an obligation\'s own effects');
      if (!isInt(e.amount) || e.amount < 1) err(where + '.amount', 'a whole amount, 1 or more');
      if (e.take !== undefined && typeof e.take !== 'boolean') err(where + '.take', 'true or false');
      break;
    case 'addNews':
      checkText(e.text, where + '.text', { ph, max: 300, maxSentences: 2 });
      if (e.factionId !== undefined && !isFac(e.factionId)) err(where + '.factionId', '"' + e.factionId + '" is not a faction');
      if (e.public !== undefined && typeof e.public !== 'boolean') err(where + '.public', 'true or false');
      break;
  }
}

// ---------------------------------------------------------------------------
// 5. TOWN_DATA
// ---------------------------------------------------------------------------
checkKeys(T, ['name', 'setting', 'currency', 'startLocationIds', 'locations', 'npcs', 'factions', 'threads', 'seeds', 'rumours'], 'TOWN_DATA', ['map', 'offstage', 'year', 'history', 'recent', 'calendar', 'events', 'epilogue']);
checkStr(T.name, 'TOWN_DATA.name', { noPlaceholders: true });
if (typeof T.setting !== 'string' || T.setting.trim().length < 200) err('TOWN_DATA.setting', 'expected a one-paragraph string of some substance');
else {
  checkStr(T.setting, 'TOWN_DATA.setting', { noPlaceholders: true });
  // Modern: the setting must say why business is done in person.
  if (!/\bsignal\b/i.test(T.setting)) err('TOWN_DATA.setting', 'must say that cell signal is patchy');
  if (!/\bface to face\b/i.test(T.setting)) err('TOWN_DATA.setting', 'must say that business is done face to face');
}
// Modern: the currency label the UI shows next to player.gold.
if (checkKeys(T.currency, ['symbol', 'name'], 'TOWN_DATA.currency')) {
  if (T.currency.symbol !== CURRENCY.symbol) err('TOWN_DATA.currency.symbol', 'must be "' + CURRENCY.symbol + '", found ' + JSON.stringify(T.currency.symbol));
  if (T.currency.name !== CURRENCY.name) err('TOWN_DATA.currency.name', 'must be "' + CURRENCY.name + '", found ' + JSON.stringify(T.currency.name));
}
// A lived-in town (direction change 9): the story's present year, the town's
// history and its recent events, dated, oldest first, none after the present.
const YEAR = isInt(T.year) ? T.year : null;
if (T.year !== undefined && (!isInt(T.year) || T.year < 1990 || T.year > 2100)) err('TOWN_DATA.year', 'must be a whole year, the story\'s present');
if (T.history !== undefined || T.recent !== undefined) {
  if (YEAR === null) err('TOWN_DATA.year', 'needed with a history: the present year the dates count from');
  if (typeof T.history !== 'string' || T.history.length < 300) err('TOWN_DATA.history', 'a paragraph or two about how the town came to be what it is');
  else checkStr(T.history, 'TOWN_DATA.history', { noPlaceholders: true });
  if (!Array.isArray(T.recent) || T.recent.length < 5 || T.recent.length > 14) err('TOWN_DATA.recent', 'expected 5 to 14 dated events');
  else {
    let last = 0;
    T.recent.forEach((r, i) => {
      const w = 'TOWN_DATA.recent[' + i + ']';
      if (!checkKeys(r, ['when', 'what'], w)) return;
      checkStr(r.when, w + '.when', { noPlaceholders: true });
      checkStr(r.what, w + '.what', { noPlaceholders: true, maxSentences: 2 });
      const y = yearIn(r.when);
      if (y === null) err(w + '.when', 'must name a year');
      else {
        if (YEAR !== null && (y > YEAR || y < YEAR - 3)) err(w + '.when', 'recent means the last two or three years before ' + YEAR + ', found ' + y);
        if (y < last) err(w, 'events are oldest first');
        last = y;
      }
    });
  }
}
// The calendar (CONTRACTS section 1): the season and the date of day 1, in the present year.
if (T.calendar !== undefined && checkKeys(T.calendar, ['season', 'startDate'], 'TOWN_DATA.calendar')) {
  if (SEASONS.indexOf(T.calendar.season) === -1) err('TOWN_DATA.calendar.season', 'one of ' + SEASONS.join(', '));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(T.calendar.startDate));
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) err('TOWN_DATA.calendar.startDate', 'a real date as YYYY-MM-DD, found ' + JSON.stringify(T.calendar.startDate));
  else if (YEAR !== null && +m[1] !== YEAR) err('TOWN_DATA.calendar.startDate', 'day 1 falls in the present year ' + YEAR);
  else {
    const month = d.getUTCMonth();
    const season = month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter';
    if (season !== T.calendar.season) err('TOWN_DATA.calendar.season', T.calendar.startDate + ' is ' + season + ', not ' + T.calendar.season);
  }
}
if (checkKeys(T.startLocationIds, ['gate', 'docks'], 'TOWN_DATA.startLocationIds')) {
  if (!isLoc(T.startLocationIds.gate)) err('TOWN_DATA.startLocationIds.gate', '"' + T.startLocationIds.gate + '" is not a location');
  if (!isLoc(T.startLocationIds.docks)) err('TOWN_DATA.startLocationIds.docks', '"' + T.startLocationIds.docks + '" is not a location');
  if (T.startLocationIds.gate === T.startLocationIds.docks) err('TOWN_DATA.startLocationIds', 'gate and docks must be different places');
}

// Locations
// The town's own places (discovered from the start), the homes of the cast,
// which stay undiscovered until someone tells the player, and the places out
// of town the story names (away: true): never on the map, never reached,
// never a destination, nobody scheduled there.
const awayPlaces = locations.filter((l) => l && l.away === true);
const townPlaces = locations.filter((l) => l && l.discovered !== false && l.away !== true);
const homePlaces = locations.filter((l) => l && l.discovered === false && l.away !== true);
if (townPlaces.length < TOWN_PLACES_MIN || townPlaces.length > TOWN_PLACES_MAX) err('TOWN_DATA.locations', 'expected ' + TOWN_PLACES_MIN + ' to ' + TOWN_PLACES_MAX + ' town places (discovered), found ' + townPlaces.length);
if (homePlaces.length > HOMES_MAX) err('TOWN_DATA.locations', 'at most ' + HOMES_MAX + ' undiscovered homes, found ' + homePlaces.length);
// Every other name a place goes by (aka) belongs to that place alone.
const akaOwner = new Map();
locations.forEach((l) => {
  if (!isObj(l)) return;
  for (const k of [l.name].concat(Array.isArray(l.aka) ? l.aka : [])) {
    if (typeof k !== 'string') continue;
    const key = k.toLowerCase().replace(/^the /, '');
    if (akaOwner.has(key) && akaOwner.get(key) !== l.id) err('locations(' + l.id + ').aka', '"' + k + '" is also a name of ' + akaOwner.get(key));
    akaOwner.set(key, l.id);
  }
});
const locById = new Map(locations.filter(isObj).map((l) => [l.id, l]));
const typesSeen = {};
const npcPhaseSlots = new Map(); // npcId -> { phase: [locIds] }
locations.forEach((l, i) => {
  const where = 'locations[' + i + '](' + (l && l.id) + ')';
  if (!checkKeys(l, ['id', 'name', 'type', 'description', 'details', 'hours', 'history', 'exits', 'npcIdsBySchedule', 'discovered', 'closed'], where, ['map', 'aka', 'away', 'distance', 'closedOn'])) return;
  checkStr(l.name, where + '.name', { noPlaceholders: true });
  // Weekdays it is shut (CONTRACTS section 1), and the hours must say so.
  if (l.closedOn !== undefined) {
    if (!Array.isArray(l.closedOn) || !l.closedOn.length || l.closedOn.length > 6) err(where + '.closedOn', 'one to six weekday names');
    else {
      if (new Set(l.closedOn).size !== l.closedOn.length) err(where + '.closedOn', 'duplicate day');
      l.closedOn.forEach((d) => {
        if (WEEKDAYS.indexOf(d) === -1) err(where + '.closedOn', '"' + d + '" is not a weekday name (' + WEEKDAYS.join(', ') + ')');
        else if (typeof l.hours === 'string' && l.hours.indexOf(d) === -1 && !/Monday to Saturday/.test(l.hours)) err(where + '.closedOn', 'the hours do not say it is shut on ' + d);
      });
    }
    if (l.away === true) err(where + '.closedOn', 'a place out of town is never gone to; leave closedOn out');
  } else if (typeof l.hours === 'string' && l.away !== true && /\bclosed (on )?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)s?\b|\bMonday to (Friday|Saturday)\b/.test(l.hours)) {
    err(where + '.closedOn', 'the hours name days it is shut (' + l.hours + '); list them in closedOn');
  }
  // What you notice there, when it is open, and how it came to be.
  checkStr(l.details, where + '.details', { noPlaceholders: true, maxSentences: 3 });
  if (typeof l.details === 'string' && l.details.length > 400) err(where + '.details', 'at most 400 characters');
  checkStr(l.history, where + '.history', { noPlaceholders: true, maxSentences: 2 });
  if (typeof l.history === 'string' && l.history.length > 300) err(where + '.history', 'at most 300 characters');
  checkStr(l.hours, where + '.hours', { noPlaceholders: true });
  if (typeof l.hours === 'string' && l.hours.length > 80) err(where + '.hours', 'one short line, at most 80 characters');
  if (l.aka !== undefined) checkStrList(l.aka, where + '.aka', undefined, { noPlaceholders: true });
  if (l.away !== undefined && l.away !== true) err(where + '.away', 'is true for a place out of town, or left out');
  if (l.away === true) {
    // Out of town: how far and how you get there; no roads, nobody scheduled, not on the map.
    checkStr(l.distance, where + '.distance', { noPlaceholders: true, maxSentences: 1 });
    if (l.discovered !== false) err(where, 'a place out of town is never discovered (it is not on the map)');
    if (!Array.isArray(l.exits) || l.exits.length) err(where + '.exits', 'a place out of town has no exits: the game never goes there');
    if (l.map !== undefined) err(where + '.map', 'a place out of town is not on the map');
    if (isObj(l.npcIdsBySchedule) && PHASES.some((p) => Array.isArray(l.npcIdsBySchedule[p]) && l.npcIdsBySchedule[p].length)) err(where + '.npcIdsBySchedule', 'nobody is scheduled out of town');
  } else if (l.distance !== undefined) err(where + '.distance', 'only a place out of town has a distance');
  if (typeof l.type !== 'string' || !/^[a-z]+$/.test(l.type)) err(where, 'type must be a lowercase word');
  else if (FANTASY_LOCATION_TYPES.indexOf(l.type) !== -1) err(where, 'type "' + l.type + '" is from the fantasy town; use a modern type');
  typesSeen[l.type] = (typesSeen[l.type] || 0) + 1;
  checkStr(l.description, where + '.description', { sentences: 2, noPlaceholders: true });
  if (l.away === true) {
    // Checked above.
  } else if (l.discovered === false) {
    // A home the player has not heard of: a dwelling, reached by an exit from a place the player knows.
    if (HOME_TYPES.indexOf(l.type) === -1) err(where, 'only a home (' + HOME_TYPES.join(', ') + ') may start undiscovered, found type "' + l.type + '"');
    if (Array.isArray(l.exits) && !l.exits.some((x) => locById.has(x) && locById.get(x).discovered === true)) err(where, 'an undiscovered home must have an exit to a discovered place');
  } else if (l.discovered !== true) err(where, 'discovered must be true or false');
  if (l.closed !== false) err(where, 'closed must be false at start');
  if (l.away === true) { /* no exits */ } else if (!Array.isArray(l.exits) || l.exits.length === 0) err(where, 'exits must be a non-empty array');
  else {
    if (new Set(l.exits).size !== l.exits.length) err(where, 'duplicate exit');
    l.exits.forEach((x) => {
      if (x === l.id) err(where, 'exit to itself');
      else if (!isLoc(x)) err(where, 'exit "' + x + '" is not a location');
      else if (locById.get(x) && locById.get(x).away === true) err(where, 'exit to ' + x + ', a place out of town');
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
// A lived-in town: every public place on the map has somebody there at some
// time of day (REVIEW section 4 found five that were empty in every phase).
townPlaces.forEach((l) => {
  if (isObj(l.npcIdsBySchedule) && !PHASES.some((p) => Array.isArray(l.npcIdsBySchedule[p]) && l.npcIdsBySchedule[p].length)) err('locations(' + l.id + ')', 'a public place nobody is ever at: schedule someone whose story puts them there');
});
// Modern: arrested NPCs are moved to the one location of type "police".
if (typesSeen.police !== 1) err('TOWN_DATA.locations', 'need exactly one "police" location (arrested NPCs are moved there), found ' + (typesSeen.police || 0));
// Connectivity from the gate.
if (isLoc(T.startLocationIds && T.startLocationIds.gate)) {
  const seen = new Set([T.startLocationIds.gate]);
  const queue = [T.startLocationIds.gate];
  while (queue.length) {
    const l = locById.get(queue.shift());
    (l && Array.isArray(l.exits) ? l.exits : []).forEach((x) => { if (isLoc(x) && !seen.has(x)) { seen.add(x); queue.push(x); } });
  }
  locations.forEach((l) => { if (l && l.away !== true && !seen.has(l.id)) err('locations(' + l.id + ')', 'not reachable from the gate'); });
}

// The town map (docs/BUILD_PLAN.md, "Map"). Optional; once TOWN_DATA.map is
// there, every location needs map: { x, y, label, anchor } inside its bounds,
// a label of one to three words, and no two places closer than MAP_MIN_GAP.
const MAP_ANCHORS = ['n', 's', 'e', 'w'];
const MAP_MIN_GAP = 28;
const SVG_PATH = /^\s*[Mm][\s\d.,eE+-]*(?:[MmLlHhVvCcSsQqTtAaZz][\s\d.,eE+-]*)*$/;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const mapSize = { width: 360, height: 300 };
function checkMapPoint(o, where, extra) {
  if (!checkKeys(o, ['text', 'x', 'y'], where, extra)) return;
  checkStr(o.text, where + '.text', { noPlaceholders: true });
  if (isStr(o.text) && o.text.trim().split(/\s+/).length > 4) err(where + '.text', 'keep a map label to four words or fewer');
  if (!isNum(o.x) || o.x < 0 || o.x > mapSize.width) err(where + '.x', 'must be a number from 0 to ' + mapSize.width);
  if (!isNum(o.y) || o.y < 0 || o.y > mapSize.height) err(where + '.y', 'must be a number from 0 to ' + mapSize.height);
}
function checkPath(d, where) {
  if (typeof d !== 'string' || !SVG_PATH.test(d)) err(where, 'must be an SVG path ("M x,y ..." with numbers and path commands only)');
}
if (T.map !== undefined) {
  const M = T.map;
  if (checkKeys(M, ['width', 'height', 'roads', 'labels'], 'TOWN_DATA.map', ['river', 'riverWidth', 'riverLabel', 'bridges'])) {
    if (!isInt(M.width) || M.width < 120 || M.width > 2000) err('TOWN_DATA.map.width', 'must be a whole number from 120 to 2000');
    else mapSize.width = M.width;
    if (!isInt(M.height) || M.height < 100 || M.height > 2000) err('TOWN_DATA.map.height', 'must be a whole number from 100 to 2000');
    else mapSize.height = M.height;
    if (M.river !== undefined) checkPath(M.river, 'TOWN_DATA.map.river');
    if (M.riverWidth !== undefined && (!isNum(M.riverWidth) || M.riverWidth < 4 || M.riverWidth > 120)) err('TOWN_DATA.map.riverWidth', 'must be a number from 4 to 120');
    if (M.riverLabel !== undefined) {
      checkMapPoint(M.riverLabel, 'TOWN_DATA.map.riverLabel', ['rotate']);
      if (isObj(M.riverLabel) && M.riverLabel.rotate !== undefined && (!isNum(M.riverLabel.rotate) || Math.abs(M.riverLabel.rotate) > 90)) err('TOWN_DATA.map.riverLabel.rotate', 'must be a number of degrees from -90 to 90');
    }
    for (const k of ['roads', 'bridges']) {
      if (M[k] === undefined && k === 'bridges') continue;
      if (!Array.isArray(M[k])) { err('TOWN_DATA.map.' + k, 'must be an array of SVG paths'); continue; }
      M[k].forEach((d, i) => checkPath(d, 'TOWN_DATA.map.' + k + '[' + i + ']'));
    }
    if (!Array.isArray(M.labels)) err('TOWN_DATA.map.labels', 'must be an array of { text, x, y }');
    else M.labels.forEach((o, i) => {
      checkMapPoint(o, 'TOWN_DATA.map.labels[' + i + ']', ['anchor']);
      if (isObj(o) && o.anchor !== undefined && ['start', 'middle', 'end'].indexOf(o.anchor) === -1) err('TOWN_DATA.map.labels[' + i + '].anchor', 'must be start, middle or end');
    });
  }
}
const mapped = [];
locations.forEach((l, i) => {
  if (!isObj(l)) return;
  const where = 'locations[' + i + '](' + l.id + ').map';
  if (l.map === undefined) { if (T.map !== undefined && l.away !== true) err(where, 'missing: with TOWN_DATA.map every location needs map { x, y, label, anchor }'); return; }
  if (!checkKeys(l.map, ['x', 'y', 'label', 'anchor'], where)) return;
  const c = l.map;
  const inX = isNum(c.x) && c.x >= 0 && c.x <= mapSize.width;
  const inY = isNum(c.y) && c.y >= 0 && c.y <= mapSize.height;
  if (!inX) err(where + '.x', 'must be a number from 0 to ' + mapSize.width + ' (the map width)');
  if (!inY) err(where + '.y', 'must be a number from 0 to ' + mapSize.height + ' (the map height)');
  if (checkStr(c.label, where + '.label', { noPlaceholders: true })) {
    const words = c.label.trim().split(/\s+/).length;
    if (words > 3) err(where + '.label', 'a short name for the map: one to three words, found ' + words);
  }
  if (MAP_ANCHORS.indexOf(c.anchor) === -1) err(where + '.anchor', 'must be "n", "s", "e" or "w" (the side the label goes on)');
  if (inX && inY) mapped.push({ id: l.id, x: c.x, y: c.y });
});
for (let i = 0; i < mapped.length; i++) {
  for (let j = i + 1; j < mapped.length; j++) {
    const dist = Math.hypot(mapped[i].x - mapped[j].x, mapped[i].y - mapped[j].y);
    if (dist < MAP_MIN_GAP) err('TOWN_DATA.locations(' + mapped[i].id + ', ' + mapped[j].id + ').map', 'places are ' + dist.toFixed(1) + ' apart on the map; keep them at least ' + MAP_MIN_GAP + ' apart');
  }
}

// NPCs
// The whole cast, written by hand: the game never makes a person in play.
// Everyone the content mentions is a record (direction change 9), with a
// presence: here (in town, somewhere every phase), away (alive, living
// elsewhere: where, and how to reach them; never scheduled) or dead (alive
// false, when and how they died; never scheduled).
const presenceOf = (n) => (isObj(n) && PRESENCES.indexOf(n.presence) !== -1 ? n.presence : 'here');
const herePeople = npcs.filter((n) => presenceOf(n) === 'here');
if (herePeople.length < CAST_MIN || herePeople.length > CAST_MAX) err('TOWN_DATA.npcs', 'expected the full cast of ' + CAST_MIN + ' to ' + CAST_MAX + ' people in town, found ' + herePeople.length);
if (npcs.length > PEOPLE_MAX) err('TOWN_DATA.npcs', 'at most ' + PEOPLE_MAX + ' people in all, found ' + npcs.length);
const tagSet = new Set();
const seenNames = new Set();
const seenFirst = new Set();
const seenVoices = new Set();
const seenLooks = new Set();
let connectedSecrets = 0;
npcs.forEach((n, i) => {
  const where = 'npcs[' + i + '](' + (n && n.id) + ')';
  if (!checkKeys(n, ['id', 'name', 'pronouns', 'age', 'presence', 'role', 'factionId', 'tags', 'look', 'voice', 'personality', 'goal', 'secret', 'history', 'attitude', 'relations', 'home', 'memories', 'alive', 'knownToPlayer', 'status'], where, ['where', 'reach', 'died', 'buried', 'awayOn'])) return;
  // Out of town on some days (CONTRACTS section 1): school days for the teacher and the students.
  if (n.awayOn !== undefined) {
    const a = n.awayOn;
    if (checkKeys(a, ['days', 'phases', 'where'], where + '.awayOn')) {
      if (!Array.isArray(a.days) || !a.days.length || a.days.some((d) => WEEKDAYS.indexOf(d) === -1)) err(where + '.awayOn.days', 'weekday names (' + WEEKDAYS.join(', ') + ')');
      else if (new Set(a.days).size !== a.days.length) err(where + '.awayOn.days', 'duplicate day');
      if (!Array.isArray(a.phases) || !a.phases.length || a.phases.length > 3 || a.phases.some((p) => PHASES.indexOf(p) === -1)) err(where + '.awayOn.phases', 'one to three phases; they are home some part of every day');
      checkStr(a.where, where + '.awayOn.where', { noPlaceholders: true, maxSentences: 0 });
      if (typeof a.where === 'string' && !/^(at|in|on|up|out|across|over|with|away)\b/.test(a.where)) err(where + '.awayOn.where', 'a place phrase that follows the name ("at the county school in Clayburn")');
    }
    if ((n.presence || 'here') !== 'here') err(where + '.awayOn', 'only someone in town is sometimes away');
  }
  const pres = n.presence;
  if (PRESENCES.indexOf(pres) === -1) err(where + '.presence', 'must be here, away or dead, found ' + JSON.stringify(pres));
  // Age: a whole number (the dead: their age at death), and what the look says.
  if (!isInt(n.age) || n.age < 0 || n.age > 110) err(where + '.age', 'must be a whole number of years, 0 to 110');
  else {
    const said = lookAge(n.look);
    if (said && said.exact !== undefined && said.exact !== n.age) err(where + '.age', 'is ' + n.age + ', but the look says ' + said.exact);
    if (said && said.min !== undefined && (n.age < said.min || n.age > said.max)) err(where + '.age', 'is ' + n.age + ', but the look says ' + said.min + ' to ' + said.max);
    if (!said && pres === 'here') err(where + '.look', 'say how old they look ("a woman of forty-one", "in his fifties"), to match age ' + n.age);
  }
  checkStr(n.history, where + '.history', { noPlaceholders: true, maxSentences: 3 });
  if (typeof n.history === 'string' && sentenceCount(n.history) < 2) err(where + '.history', 'two or three plain sentences');
  if (typeof n.history === 'string' && n.history.length > HISTORY_MAX) err(where + '.history', 'at most ' + HISTORY_MAX + ' characters (the People editor\'s limit), found ' + n.history.length);
  for (const k of ['where', 'reach']) if (n[k] !== undefined && pres !== 'away') err(where + '.' + k, 'only someone away has ' + k);
  for (const k of ['died', 'buried']) if (n[k] !== undefined && pres !== 'dead') err(where + '.' + k, 'only someone dead has ' + k);
  if (pres === 'away') {
    checkStr(n.where, where + '.where', { noPlaceholders: true, maxSentences: 1 });
    checkStr(n.reach, where + '.reach', { noPlaceholders: true, maxSentences: 1 });
    if (n.alive !== true || n.status !== 'gone') err(where, 'someone away is alive with status "gone" (not in town)');
    if (n.home !== null && !(isLoc(n.home) && locById.get(n.home).away === true)) err(where + '.home', 'someone away lives out of town: a place with away true, or null');
  } else if (pres === 'dead') {
    checkStr(n.died, where + '.died', { noPlaceholders: true, maxSentences: 1 });
    if (typeof n.died === 'string' && yearIn(n.died) === null) err(where + '.died', 'say when, with the year ("spring of 2021, a stroke")');
    if (typeof n.died === 'string' && YEAR !== null && yearIn(n.died) > YEAR) err(where + '.died', 'after the present year ' + YEAR);
    if (n.alive !== false || n.status !== 'dead') err(where, 'someone dead has alive false and status "dead"');
    if (n.home !== null) err(where + '.home', 'the dead have no home (null)');
    if (n.buried !== undefined && !(isLoc(n.buried) && locById.get(n.buried).away !== true)) err(where + '.buried', 'a place in town');
  }
  // Pronouns (he, she or they), and never against what the look says ("woman" is she, "man" is he).
  if (['he', 'she', 'they'].indexOf(n.pronouns) === -1) err(where, 'pronouns must be "he", "she" or "they", found ' + JSON.stringify(n.pronouns));
  else if (typeof n.look === 'string') {
    const lk = n.look.toLowerCase();
    const sheWord = /\b(woman|women|girl|lady|wife|mother|widow)\b/.test(lk);
    const heWord = /\b(man|men|boy|guy|husband|father|widower)\b/.test(lk);
    if (sheWord && !heWord && n.pronouns !== 'she') err(where, 'the look says she but pronouns are "' + n.pronouns + '"');
    if (heWord && !sheWord && n.pronouns !== 'he') err(where, 'the look says he but pronouns are "' + n.pronouns + '"');
  }
  checkStr(n.name, where + '.name', { noPlaceholders: true });
  if (typeof n.name === 'string') {
    if (seenNames.has(n.name)) err(where, 'duplicate name "' + n.name + '"');
    seenNames.add(n.name);
  }
  checkStr(n.role, where + '.role', { noPlaceholders: true });
  if (typeof n.role === 'string' && GENERIC_ROLES.indexOf(n.role.trim().toLowerCase().replace(/^(a|an|the)\s+/, '')) !== -1) err(where, 'role "' + n.role + '" only says what they are; say who they are or what they do');
  if (n.factionId !== null && !isFac(n.factionId)) err(where, 'factionId "' + n.factionId + '" is not a faction (or null)');
  if (!Array.isArray(n.tags) || n.tags.length === 0) err(where, 'tags must be a non-empty array');
  else {
    n.tags.forEach((t) => {
      if (typeof t !== 'string' || !/^[a-z]+$/.test(t)) err(where, 'tag "' + t + '" must be a lowercase word');
      tagSet.add(t);
    });
    // Modern: "watch" is kept as an alias of "police" for the engine.
    if (n.tags.indexOf('police') !== -1 && n.tags.indexOf('watch') === -1) err(where, 'police NPCs must also carry the alias tag "watch"');
    if (n.tags.indexOf('watch') !== -1 && n.tags.indexOf('police') === -1) err(where, 'the "watch" tag is only an alias; add "police"');
  }
  for (const f of ['look', 'voice', 'goal', 'secret']) checkStr(n[f], where + '.' + f, { noPlaceholders: true, maxSentences: f === 'voice' ? 4 : 2 });
  // The People editor's limits (State.EDIT_MAX), so editing anyone never has to cut what is written.
  for (const [f, max] of [['look', 200], ['voice', 200], ['goal', 200], ['secret', 300]]) if (typeof n[f] === 'string' && n[f].length > max) err(where + '.' + f, 'at most ' + max + ' characters, found ' + n[f].length);
  if (typeof n.voice === 'string') { if (seenVoices.has(n.voice)) err(where, 'voice duplicates another NPC'); seenVoices.add(n.voice); }
  if (typeof n.look === 'string') { if (seenLooks.has(n.look)) err(where, 'look duplicates another NPC'); seenLooks.add(n.look); }
  if (!Array.isArray(n.personality) || n.personality.length !== 2 || !n.personality.every(isStr)) err(where, 'personality must be exactly 2 trait strings');
  if (!isInt(n.attitude) || n.attitude < -20 || n.attitude > 20) err(where, 'attitude must be an integer -20..20');
  if (!Array.isArray(n.memories) || n.memories.length !== 0) err(where, 'memories must be []');
  if (n.knownToPlayer !== false) err(where, 'knownToPlayer must be false');
  if (typeof n.secret === 'string' && mentionsCast(n.secret, n.id)) connectedSecrets++;
  const slots = npcPhaseSlots.get(n.id) || {};
  if (pres !== 'here') {
    // Never in town: nowhere in any schedule.
    const at = PHASES.filter((p) => slots[p] && slots[p].length);
    if (at.length) err(where, 'is ' + pres + ' but scheduled in town (' + at.join(', ') + ')');
    return;
  }
  if (n.alive !== true) err(where, 'alive must be true');
  if (n.status !== 'free') err(where, 'status must be "free"');
  // School days (CONTRACTS section 1): the teacher and the students are in Clayburn on weekday mornings and afternoons.
  if (Array.isArray(n.tags) && (n.tags.indexOf('teacher') !== -1 || n.tags.indexOf('teen') !== -1)) {
    const a = n.awayOn;
    if (!isObj(a) || !Array.isArray(a.days) || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].some((d) => a.days.indexOf(d) === -1)) err(where + '.awayOn', 'a teacher or a student is at school on weekdays: give them awayOn');
  }
  if (isLoc(n.home) && locById.get(n.home).away === true) err(where + '.home', 'someone in town lives in town, not at ' + n.home);
  const phasesPresent = PHASES.filter((p) => slots[p] && slots[p].length);
  if (phasesPresent.length !== PHASES.length) err(where, 'is somewhere in ' + phasesPresent.length + ' of 4 phases; everyone needs a place in every phase (missing ' + PHASES.filter((p) => phasesPresent.indexOf(p) === -1).join(', ') + ')');
  // Home: a place in the town, where they are in at least one phase.
  if (!isLoc(n.home)) err(where + '.home', '"' + n.home + '" is not a location');
  else if (!PHASES.some((p) => slots[p] && slots[p].indexOf(n.home) !== -1)) err(where + '.home', 'is never at home (' + n.home + ') in any phase');
  for (const p of PHASES) if (slots[p] && slots[p].length > 1) err(where, 'scheduled in two places at once (' + p + ': ' + slots[p].join(', ') + ')');
});
// Relations: [{ npcId, relation }], "npcId is this person's relation", a
// word from the engine's lists, written on both sides with words that answer
// each other (Dewayne's wife Mavis; Mavis's husband Dewayne), gendered words
// matching the pronouns of the person they describe.
let relationCount = 0;
npcs.forEach((n, i) => {
  if (!isObj(n)) return;
  const where = 'npcs[' + i + '](' + n.id + ').relations';
  if (!Array.isArray(n.relations)) { err(where, 'must be an array of { npcId, relation }'); return; }
  const seen = new Set();
  n.relations.forEach((r, ri) => {
    const w = where + '[' + ri + ']';
    if (!checkKeys(r, ['npcId', 'relation'], w)) return;
    relationCount++;
    if (r.npcId === n.id) { err(w, 'a person cannot be related to themself'); return; }
    if (!isNpc(r.npcId)) { err(w, '"' + r.npcId + '" is not an NPC'); return; }
    if (seen.has(r.npcId)) err(w, 'lists ' + r.npcId + ' twice');
    seen.add(r.npcId);
    if (typeof r.relation !== 'string' || !RELATION_WORDS.has(r.relation)) { err(w, 'relation "' + r.relation + '" is not one of the engine\'s relation words'); return; }
    const other = npcById.get(r.npcId);
    const want = wordPronouns(r.relation);
    if (want && other && other.pronouns !== want) err(w, '"' + r.relation + '" is ' + want + ', but ' + other.id + ' is ' + other.pronouns);
    const back = other && Array.isArray(other.relations) ? other.relations.find((x) => x && x.npcId === n.id) : null;
    if (!back) { err(w, other.id + ' does not list ' + n.id + ' back (relations are written on both sides)'); return; }
    const inv = inverseWords(r.relation);
    if (!inv.has(back.relation)) err(w, n.id + ' calls ' + other.id + ' "' + r.relation + '", but ' + other.id + ' calls ' + n.id + ' "' + back.relation + '" (expected one of ' + Array.from(inv).join(', ') + ')');
  });
});
// Family maths, by the year each person was born (the dead: the year they
// died less their age at death): a parent is 16 to 60 years older than their
// child, a grandparent at least 32 older, spouses and partners at most 20
// years apart, brothers and sisters at most 25.
const bornYear = (n) => (isInt(n.age) && YEAR !== null ? (n.presence === 'dead' ? yearIn(n.died) : YEAR) - n.age : null);
const CHILD_WORDS = ['son', 'daughter', 'child', 'kid', 'boy', 'girl', 'baby', 'stepson', 'stepdaughter'];
const GRANDCHILD_WORDS = ['grandson', 'granddaughter'];
const SPOUSE_WORDS = ['wife', 'husband', 'spouse', 'partner', 'girlfriend', 'boyfriend', 'fiancee', 'fiance', 'ex-wife', 'ex-husband', 'ex'];
const SIBLING_WORDS = ['brother', 'sister', 'stepbrother', 'stepsister'];
let familyChecks = 0;
npcs.forEach((n) => {
  if (!isObj(n) || !Array.isArray(n.relations)) return;
  const a = bornYear(n);
  for (const r of n.relations) {
    const o = isObj(r) ? npcById.get(r.npcId) : null;
    const b = o ? bornYear(o) : null;
    if (a === null || b === null || typeof r.relation !== 'string') continue;
    const w = 'npcs(' + n.id + ').relations(' + o.id + ')';
    // r: o is n's <relation>; o is younger than n by (b - a) years.
    if (CHILD_WORDS.indexOf(r.relation) !== -1) { familyChecks++; if (b - a < 16 || b - a > 60) err(w, n.id + ' (born ' + a + ') is ' + (b - a) + ' years older than their ' + r.relation + ' ' + o.id + ' (born ' + b + '); a parent is 16 to 60 years older'); }
    if (GRANDCHILD_WORDS.indexOf(r.relation) !== -1) { familyChecks++; if (b - a < 32) err(w, n.id + ' (born ' + a + ') is only ' + (b - a) + ' years older than their ' + r.relation + ' ' + o.id + '; a grandparent is at least 32 older'); }
    if (SPOUSE_WORDS.indexOf(r.relation) !== -1) { familyChecks++; if (Math.abs(b - a) > 20) err(w, n.id + ' and their ' + r.relation + ' ' + o.id + ' were born ' + Math.abs(b - a) + ' years apart (at most 20)'); }
    if (SIBLING_WORDS.indexOf(r.relation) !== -1) { familyChecks++; if (Math.abs(b - a) > 25) err(w, n.id + ' and their ' + r.relation + ' ' + o.id + ' were born ' + Math.abs(b - a) + ' years apart (at most 25)'); }
  }
});
// Offstage people: named in the story, never in town (the dead, the far away).
// Superseded by records with a presence; still accepted, and never a record's name.
const offstage = Array.isArray(T.offstage) ? T.offstage : [];
if (T.offstage !== undefined && !Array.isArray(T.offstage)) err('TOWN_DATA.offstage', 'must be an array of { name, about }');
offstage.forEach((o, i) => {
  const w = 'TOWN_DATA.offstage[' + i + ']';
  if (!checkKeys(o, ['name', 'about'], w)) return;
  checkStr(o.name, w + '.name', { noPlaceholders: true });
  checkStr(o.about, w + '.about', { noPlaceholders: true, maxSentences: 1 });
  if (typeof o.name === 'string' && npcs.some((n) => n && n.name === o.name)) err(w, '"' + o.name + '" is in the cast; offstage is for people who never appear');
});
const firstNames = npcs.filter((n) => n && typeof n.name === 'string').map((n) => {
  const parts = n.name.split(/\s+/);
  return parts.length > 2 ? parts[1] : parts[0]; // skip a title such as "Pastor" or "Miss"
});
firstNames.forEach((f) => { if (seenFirst.has(f)) err('TOWN_DATA.npcs', 'two NPCs share the first name "' + f + '"'); seenFirst.add(f); });
for (const t of REQUIRED_TAGS) if (!tagSet.has(t)) err('TOWN_DATA.npcs', 'no NPC has the required tag "' + t + '"');
if (connectedSecrets < Math.ceil(npcs.length / 2)) err('TOWN_DATA.npcs', 'only ' + connectedSecrets + ' secrets mention another NPC or a faction; need at least half');

// Factions
if (factions.length !== 3) err('TOWN_DATA.factions', 'expected exactly 3 factions, found ' + factions.length);
let clockTotal = 0;
let negativePairs = 0;
let failedThreads = 0;
const segmentCounts = [];
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
    // Staggered factions (REVIEW section 3.4): 4 to 10 segments, the same within a faction.
    if (!isInt(c.segments) || c.segments < 4 || c.segments > 10) err(cw, 'segments must be a whole number from 4 to 10');
    else if (ci > 0 && f.clocks[0] && c.segments !== f.clocks[0].segments) err(cw, 'a faction\'s clocks share one segment count (' + f.clocks[0].segments + ')');
    if (ci === 0 && isInt(c.segments)) segmentCounts.push(c.segments);
    if (c.filled !== 0) err(cw, 'filled must be 0');
    if (!checkKeys(c.onComplete, ['text', 'effects'], cw + '.onComplete', ['requires', 'alt'])) return;
    checkStr(c.onComplete.text, cw + '.onComplete.text', { sentences: 1, noPlaceholders: true });
    const effs = c.onComplete.effects;
    const checkCompletion = (list, w) => {
      if (!Array.isArray(list) || list.length < 2 || list.length > 5) { err(w, 'needs 2 to 5 effect ops'); return; }
      list.forEach((e, ei) => checkEffect(e, w + '[' + ei + ']', { world: true }));
      if (new Set(list.map((e) => e && e.op)).size < 2) err(w, 'use at least 2 different ops so the town visibly changes');
      // Content note 2: every clock completion adds its own rumour, exactly one.
      const rumourOps = list.filter((e) => e && e.op === 'addRumour').length;
      if (rumourOps !== 1) err(w, 'needs exactly one addRumour describing the completion, found ' + rumourOps);
      failedThreads += list.filter((e) => e && e.op === 'threadStatus' && e.status === 'failed').length;
      // A faction never sets its own clock back from its own completion: the next clock starts at 0 anyway.
      list.forEach((e, ei) => { if (e && e.op === 'clockAdjust' && e.factionId === f.id) err(w + '[' + ei + ']', 'a completion adjusts another faction\'s clock, not its own'); });
    };
    checkCompletion(effs, cw + '.onComplete.effects');
    // What must hold when it completes, and what happens instead (CONTRACTS section 3).
    if (c.onComplete.requires !== undefined) checkRequires(c.onComplete.requires, cw + '.onComplete.requires');
    if (c.onComplete.alt !== undefined) {
      checkAlt(c.onComplete.alt, cw + '.onComplete.alt', 1, c.onComplete.requires);
      if (isObj(c.onComplete.alt)) checkCompletion(c.onComplete.alt.effects, cw + '.onComplete.alt.effects');
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
// Content note 3: at most one clock sets a thread to failed (its alternative may too).
if (failedThreads > 2) err('TOWN_DATA.factions', 'at most one clock may set a thread to failed, found ' + failedThreads);
// Staggered: the factions do not all run the same clock length, so completions do not bunch.
if (segmentCounts.length === factions.length && new Set(segmentCounts).size < 2) err('TOWN_DATA.factions', 'stagger the factions: give at least two of them different segment counts (all are ' + segmentCounts[0] + ')');

// Threads
if (threads.length < 2 || threads.length > 3) err('TOWN_DATA.threads', 'expected 2 or 3 threads, found ' + threads.length);
threads.forEach((t, i) => checkThread(t, 'threads[' + i + '](' + (t && t.id) + ')', 'open'));

// Seeds
if (seeds.length < 5 || seeds.length > 8) err('TOWN_DATA.seeds', 'expected 5 to 8 seeds, found ' + seeds.length);
seeds.forEach((s, i) => {
  const where = 'seeds[' + i + '](' + (s && s.id) + ')';
  // notBeforeDay: a starting seed that waits (the engine's own field for loose-end seeds).
  const copy = isObj(s) ? Object.assign({}, s) : s;
  if (isObj(copy) && copy.notBeforeDay !== undefined) {
    if (!isInt(copy.notBeforeDay) || copy.notBeforeDay < 2 || copy.notBeforeDay > 15) err(where + '.notBeforeDay', 'a day number, 2 to 15');
    delete copy.notBeforeDay;
  }
  checkSeed(copy, where, true);
});
const nonDaySeeds = seeds.filter((s) => s && s.trigger && s.trigger.type !== 'day').length;
if (nonDaySeeds > 1) err('TOWN_DATA.seeds', 'at most one starting seed may use a non-day trigger, found ' + nonDaySeeds);
seeds.forEach((s, i) => {
  if (s && s.trigger && s.trigger.type === 'clock') err('seeds[' + i + '](' + s.id + ')', 'starting seeds use a day trigger, or one location/npc trigger');
  // A location seed on a start location would fire on arrival, before the player has done anything, unless it waits.
  const at = s && s.trigger && s.trigger.type === 'location' ? [].concat(s.trigger.value) : [];
  if (T.startLocationIds && at.some((v) => v === T.startLocationIds.gate || v === T.startLocationIds.docks) && !(isInt(s.notBeforeDay) && s.notBeforeDay >= 2)) {
    err('seeds[' + i + '](' + s.id + ')', 'location trigger on a start location would fire on arrival (give it notBeforeDay)');
  }
});

// Rumours: the town's talk at the start, true and false, each with at least
// two people who can pass it on (REVIEW section 4: a rumour one person can
// tell barely spreads).
if (rumours.length < 10 || rumours.length > 20) err('TOWN_DATA.rumours', 'expected 10 to 20 rumours, found ' + rumours.length);
rumours.forEach((r, i) => {
  const where = 'rumours[' + i + '](' + (r && r.id) + ')';
  checkRumour(r, where);
  if (isObj(r) && isNpc(r.sourceNpcId) && tellersOf(r).size < 2) err(where, 'only ' + r.sourceNpcId + ' can tell it: give it a factionId or tellerIds');
});
const trueCount = rumours.filter((r) => r && r['true'] === true).length;
const falseCount = rumours.filter((r) => r && r['true'] === false).length;
if (falseCount < 3 || trueCount < falseCount * 2) err('TOWN_DATA.rumours', 'need at least 3 false and twice as many true, found ' + trueCount + ' / ' + falseCount);

// Town events (CONTRACTS section 11): set pieces on a fixed day and phase,
// in a place, with branches picked by the state of the town.
const PHASE_SET = new Set(PHASES);
// The people a branch's text has acting: anyone named by full name or by a
// name only they have, except as an owner ("Hollis Byrd's chair empty",
// "Carter Sturdivant's torn-up note"): that is about them, not done by them.
function actorsIn(text) {
  const esc = (a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = npcs.filter((n) => n && typeof n.name === 'string').map((n) => ({ id: n.id, names: [n.name].concat(npcAliases(n)) }));
  // Owners first: "Hollis Byrd's chair" is blanked whole, so "Hollis" in it is not a second mention.
  let t = String(text || '');
  for (const n of named) for (const a of n.names) t = t.replace(new RegExp('\\b' + esc(a) + '\'s\\b', 'g'), ' ');
  return named.filter((n) => n.names.some((a) => new RegExp('\\b' + esc(a) + '\\b').test(t))).map((n) => n.id);
}
// opts.ending: the epilogue (it may settle threads and plant aftermath seeds);
// opts.actorsFree: everyone the text has acting must be free in its when
// (a council member in the holding cell does not vote).
function checkBranch(b, where, isDefault, sentencesMax, charsMax, opts) {
  opts = opts || {};
  if (!checkKeys(b, isDefault ? ['text', 'effects'] : ['when', 'text', 'effects'], where)) return;
  if (!isDefault) checkWhen(b.when, where + '.when');
  checkText(b.text, where + '.text', { maxSentences: sentencesMax, max: charsMax });
  checkEffectList(b.effects, where + '.effects', { max: 8, world: true, ending: opts.ending === true, settles: opts.settles === true });
  if (opts.actorsFree && typeof b.text === 'string') {
    const free = isObj(b.when) && Array.isArray(b.when.npcFree) ? b.when.npcFree : [];
    actorsIn(b.text).forEach((id) => { if (free.indexOf(id) === -1) err(where + '.when.npcFree', 'the text has ' + id + ' acting: add them to npcFree (or write the branch for their empty chair)'); });
  }
}
if (T.events !== undefined) {
  if (!Array.isArray(T.events)) err('TOWN_DATA.events', 'an array of events');
  else T.events.forEach((ev, i) => {
    const where = 'events[' + i + '](' + (ev && ev.id) + ')';
    if (!checkKeys(ev, ['id', 'day', 'phase', 'locationId', 'title', 'branches', 'default'], where, ['attendees'])) return;
    // attendees: the people who are at the place for that phase when it happens (World brings them, if free).
    if (ev.attendees !== undefined) {
      if (!Array.isArray(ev.attendees) || !ev.attendees.length) err(where + '.attendees', 'a non-empty list of npc ids');
      else ev.attendees.forEach((id, k) => {
        if (!isNpc(id)) err(where + '.attendees[' + k + ']', '"' + id + '" is not a person');
        else if (npcById.get(id).presence && npcById.get(id).presence !== 'here') err(where + '.attendees[' + k + ']', '"' + id + '" does not live in town');
        if (ev.attendees.indexOf(id) !== k) err(where + '.attendees[' + k + ']', 'listed twice');
      });
    }
    if (!isInt(ev.day) || ev.day < 2 || ev.day > 30) err(where + '.day', 'a day number, 2 to 30');
    if (!PHASE_SET.has(ev.phase)) err(where + '.phase', 'one of ' + PHASES.join(', '));
    if (!isLoc(ev.locationId)) err(where + '.locationId', '"' + ev.locationId + '" is not a location');
    else if (locationById(ev.locationId).away === true || locationById(ev.locationId).discovered === false) err(where + '.locationId', 'a town place on the map, where the player can be');
    checkStr(ev.title, where + '.title', { noPlaceholders: true, maxSentences: 0 });
    if (!Array.isArray(ev.branches) || ev.branches.length < 2) err(where + '.branches', 'at least two branches besides the default');
    else ev.branches.forEach((b, bi) => checkBranch(b, where + '.branches[' + bi + ']', false, 4, 700, { actorsFree: true, settles: true }));
    // The default is what happens when no branch's people are all free: it names nobody acting.
    checkBranch(ev.default, where + '.default', true, 4, 700, { actorsFree: true });
    // The news line the event leaves: every branch says something in public.
    [].concat(ev.branches || [], [ev.default]).forEach((b, bi) => {
      if (isObj(b) && Array.isArray(b.effects) && !b.effects.some((e) => e && e.op === 'addNews' && e.public === true)) err(where + (bi < (ev.branches || []).length ? '.branches[' + bi + ']' : '.default'), 'needs an addNews with public true (what the town hears)');
    });
  });
}
// The epilogue (CONTRACTS section 11): an ending told on a day, or sooner
// when the bridge story is decided. A branch can come before onDay (a flag
// fires it), so only the default says how long it has been. Every branch
// settles at least one thread (resolved or failed) and plants two or three
// aftermath seeds, so the town keeps moving once the story has ended.
const SEEDS_AFTER = [2, 3];
const HOW_LONG = /\b(weeks? (on|in|later|since)|three weeks|a month (on|later))\b/i;
if (T.epilogue !== undefined) {
  const E = T.epilogue;
  if (checkKeys(E, ['onDay', 'orFlagsSet', 'branches', 'default'], 'TOWN_DATA.epilogue')) {
    if (!isInt(E.onDay) || E.onDay < 10 || E.onDay > 40) err('TOWN_DATA.epilogue.onDay', 'a day number, 10 to 40');
    else if (E.onDay > ENDING_DAYS[0]) err('TOWN_DATA.epilogue.onDay', 'aftermath seeds wait for day ' + ENDING_DAYS[0] + ' or later: the ending must come by then');
    checkFlagList(E.orFlagsSet, 'TOWN_DATA.epilogue.orFlagsSet');
    // Wave 5: seven, so the open-bridge ending settles the police both ways (a vote that ended them is a branch of its own).
    if (!Array.isArray(E.branches) || E.branches.length < 3 || E.branches.length > 7) err('TOWN_DATA.epilogue.branches', '3 to 7 branches');
    else E.branches.forEach((b, bi) => {
      const w = 'TOWN_DATA.epilogue.branches[' + bi + ']';
      checkBranch(b, w, false, 6, 900, { ending: true });
      if (!isObj(b)) return;
      if (typeof b.text === 'string' && HOW_LONG.test(b.text)) err(w + '.text', 'says how long it has been ("' + HOW_LONG.exec(b.text)[0] + '"), but a flag can bring this ending before day ' + E.onDay);
      const effs = Array.isArray(b.effects) ? b.effects : [];
      if (!effs.some((e) => isObj(e) && (e.op === 'threadUpdate' || e.op === 'threadStatus') && (e.status === 'resolved' || e.status === 'failed'))) err(w + '.effects', 'an ending settles the story: set a thread resolved or failed');
    });
    checkBranch(E.default, 'TOWN_DATA.epilogue.default', true, 6, 900, { ending: true });
    [].concat(Array.isArray(E.branches) ? E.branches : [], [E.default]).forEach((b, bi) => {
      if (!isObj(b) || !Array.isArray(b.effects)) return;
      const n = b.effects.filter((e) => isObj(e) && e.op === 'plantSeed').length;
      if (n < SEEDS_AFTER[0] || n > SEEDS_AFTER[1]) err('TOWN_DATA.epilogue.' + (bi < (E.branches || []).length ? 'branches[' + bi + ']' : 'default') + '.effects', 'plant ' + SEEDS_AFTER.join(' or ') + ' aftermath seeds (what happens next), found ' + n);
    });
  }
}

// No placeholders anywhere in TOWN_DATA.
(function walk(v, where) {
  if (typeof v === 'string') { if (/[{}]/.test(v)) err(where, 'placeholder braces are only allowed in LOOSE_ENDS and templates'); return; }
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, where + '[' + i + ']'));
  else if (isObj(v)) for (const k of Object.keys(v)) walk(v[k], where + '.' + k);
})(T, 'TOWN_DATA');

// ---------------------------------------------------------------------------
// 6. TABLES
// ---------------------------------------------------------------------------
// TABLES.complications is the engine's table (Dice.complication): objects
// { text, tiers, kinds, needsPerson?, notDay1?, effects? }. A text that names
// {witness} needs a person; an effect's placeholders are the engine's.
const COMPLICATION_TIERS = ['partial', 'failure', 'both'];
const COMPLICATION_KINDS = ['social', 'physical', 'stealth', 'any'];
function checkComplications(list, where, count) {
  if (!Array.isArray(list)) { err(where, 'expected an array'); return; }
  if (list.length !== count) err(where, 'expected exactly ' + count + ' entries, found ' + list.length);
  const seen = new Set();
  list.forEach((c, i) => {
    const w = where + '[' + i + ']';
    if (!checkKeys(c, ['text', 'tiers', 'kinds'], w, ['needsPerson', 'notDay1', 'effects'])) return;
    if (checkStr(c.text, w + '.text') && /[{}]/.test(c.text.replace(/\{witness\}/g, ''))) err(w, 'the only placeholder in a complication is {witness}');
    if (typeof c.text === 'string') { if (seen.has(c.text.toLowerCase())) err(w, 'duplicate complication'); seen.add(c.text.toLowerCase()); }
    if (!Array.isArray(c.tiers) || !c.tiers.length || !c.tiers.every(t => COMPLICATION_TIERS.includes(t))) err(w, 'tiers must be a list of ' + COMPLICATION_TIERS.join(', '));
    if (!Array.isArray(c.kinds) || !c.kinds.length || !c.kinds.every(k => COMPLICATION_KINDS.includes(k))) err(w, 'kinds must be a list of ' + COMPLICATION_KINDS.join(', '));
    for (const k of ['needsPerson', 'notDay1']) if (k in c && typeof c[k] !== 'boolean') err(w, k + ' must be true or false');
    const witness = /\{witness(Id)?\}/.test(JSON.stringify(c.text) + JSON.stringify(c.effects || []));
    if (witness && c.needsPerson !== true) err(w, 'names {witness} without needsPerson');
    if ('effects' in c && (!Array.isArray(c.effects) || !c.effects.every(e => isObj(e) && isStr(e.op)))) err(w, 'effects must be a list of { op, ... }');
  });
}

// TABLES.npc keeps only the lists something still reads: firstNames (the
// person matcher's first-name check) and occupations (its job words). The
// family names, traits, wants and speech quirks that Tables.npc() rolled for
// made-up people went with the fixed cast.
const TABLE_SPEC = {
  npc: { firstNames: 30, occupations: 30 },
  location: { types: 15, details: 20, problems: 15 },
  items: { goods: 40, trinkets: 20 },
  complications: 20,
  weather: { spring: 6, summer: 6, autumn: 6, winter: 6 }
};
let tableEntries = 0;
if (checkKeys(TABLES, Object.keys(TABLE_SPEC), 'TABLES')) {
  for (const group of Object.keys(TABLE_SPEC)) {
    const spec = TABLE_SPEC[group];
    if (group === 'complications') {
      checkComplications(TABLES[group], 'TABLES.' + group, spec);
      tableEntries += Array.isArray(TABLES[group]) ? TABLES[group].length : 0;
      continue;
    }
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
        // A good's name names no place (the place you buy it is where you are), and its kind says what buying it does.
        const placeNames = [];
        locations.forEach((l) => {
          if (!isObj(l)) return;
          [l.name, l.map && l.map.label].concat(Array.isArray(l.aka) ? l.aka : []).forEach((k) => {
            if (typeof k !== 'string') return;
            const bare = k.replace(/^the /i, '');
            if (/[A-Z]/.test(bare)) placeNames.push(bare.toLowerCase());
          });
        });
        list.forEach((g, gi) => {
          const gw = where + '[' + gi + ']';
          if (!checkKeys(g, ['name', 'price', 'kind'], gw)) return;
          checkStr(g.name, gw + '.name', { noPlaceholders: true });
          if (GOOD_KINDS.indexOf(g.kind) === -1) err(gw + '.kind', 'one of ' + GOOD_KINDS.join(', ') + ', found ' + JSON.stringify(g.kind));
          if (typeof g.name === 'string') {
            const low = g.name.toLowerCase();
            const hit = placeNames.find((p) => new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(low));
            if (hit) err(gw + '.name', 'names a place ("' + hit + '"); a good is bought wherever the player is');
          }
          // Modern: whole dollars, small-town prices.
          if (typeof g.price !== 'number' || !isInt(g.price) || g.price < PRICE_MIN || g.price > PRICE_MAX) err(gw, 'price must be an integer number of dollars, ' + PRICE_MIN + '..' + PRICE_MAX + ', found ' + JSON.stringify(g.price));
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
  if (!checkKeys(b, ['id', 'name', 'blurb', 'age', 'stats', 'gold', 'items', 'arrival'], where, ['hook'])) return;
  // A first lead for this background (REVIEW section 4): someone in the cast
  // with work or a question for exactly this kind of stranger.
  if (b.hook !== undefined && checkKeys(b.hook, ['npcId', 'text', 'dayOffset', 'trigger'], where + '.hook')) {
    const hk = b.hook;
    if (!isNpc(hk.npcId)) err(where + '.hook.npcId', '"' + hk.npcId + '" is not an NPC');
    else if ((npcById.get(hk.npcId).presence || 'here') !== 'here') err(where + '.hook.npcId', hk.npcId + ' does not live in town');
    checkStr(hk.text, where + '.hook.text', { maxSentences: 1 });
    checkPlaceholders(hk.text, where + '.hook.text', ['{player}']);
    if (hk.dayOffset !== 0 && hk.dayOffset !== 1) err(where + '.hook.dayOffset', '0 or 1');
    if (checkKeys(hk.trigger, ['type', 'value'], where + '.hook.trigger')) {
      const tr = hk.trigger;
      if (tr.type === 'npc') { if (!isNpc(tr.value)) err(where + '.hook.trigger.value', '"' + tr.value + '" is not an NPC'); else if (tr.value !== hk.npcId) err(where + '.hook.trigger.value', 'an npc hook fires when the player meets its own person, ' + hk.npcId); }
      else if (tr.type === 'location') { if (!isLoc(tr.value) || locationById(tr.value).away === true) err(where + '.hook.trigger.value', '"' + tr.value + '" is not a town place'); }
      else if (tr.type === 'day') { if (!isInt(tr.value) || tr.value < 1 || tr.value > 7) err(where + '.hook.trigger.value', 'a day number, 1 to 7'); }
      else err(where + '.hook.trigger.type', 'npc, location or day');
    }
  }
  // The age the character creation form starts at for this background (16 to 90).
  if (!isInt(b.age) || b.age < 16 || b.age > 90) err(where + '.age', 'a whole number of years, 16 to 90');
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
  // Modern: starting cash in dollars (the field keeps the name "gold").
  if (!isInt(b.gold) || b.gold < CASH_MIN || b.gold > CASH_MAX) err(where + '.gold', 'starting cash must be an integer ' + CASH_MIN + '..' + CASH_MAX + ' dollars');
  // Two things from the background and a cheap prepaid phone (one bar by the water tower), so the people who live elsewhere can be reached.
  if (!Array.isArray(b.items) || b.items.length !== 3) err(where + '.items', 'needs exactly 3 items: two of the background\'s own and a prepaid phone');
  else if (!b.items.some((it) => isObj(it) && it.name === 'Prepaid phone')) err(where + '.items', 'every background carries a "Prepaid phone"');
  if (Array.isArray(b.items)) b.items.forEach((it, ii) => {
    const iw = where + '.items[' + ii + ']';
    if (!checkKeys(it, ['id', 'name', 'qty', 'notes'], iw)) return;
    checkStr(it.name, iw + '.name', { noPlaceholders: true });
    if (typeof it.name === 'string' && VEHICLE_RE.test(it.name)) err(iw + '.name', 'starting items cannot be vehicles ("' + it.name + '")');
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
    if (!checkKeys(le, ['label', 'options', 'link', 'seed'], where, ['obligation', 'obligations', 'followUp'])) continue;
    checkStr(le.label, where + '.label', { noPlaceholders: true });
    checkStrList(le.options, where + '.options', 3, { noPlaceholders: true, maxSentences: 1 });
    (Array.isArray(le.options) ? le.options : []).forEach((o, oi) => {
      if (typeof o === 'string' && !/\b(I|I'm|I've|I'd|my|me|mine)\b/i.test(o)) err(where + '.options[' + oi + ']', 'should be written in the first person');
    });
    // Every loose end binds to the cast (the game never makes a person): the
    // debt links to a lender; link.tag is carried by at least two people, so
    // a tie is there to make, and each option's tag by at least one.
    if (key === 'debt' && !(isObj(le.link) && le.link.tag === 'lender')) err(where + '.link', 'must link the tag "lender"');
    const carriers = (tag) => npcs.filter((n) => n && Array.isArray(n.tags) && n.tags.indexOf(tag) !== -1).length;
    if (checkKeys(le.link, ['tag'], where + '.link', ['optionTags'])) {
      if (carriers(le.link.tag) < 2) err(where + '.link.tag', 'the tag "' + le.link.tag + '" needs at least two people in the cast, found ' + carriers(le.link.tag));
      if (le.link.optionTags !== undefined) {
        if (!Array.isArray(le.link.optionTags) || le.link.optionTags.length !== (le.options || []).length) err(where + '.link.optionTags', 'one tag per option');
        else le.link.optionTags.forEach((t, ti) => { if (!carriers(t)) err(where + '.link.optionTags[' + ti + ']', 'no NPC carries the tag "' + t + '"'); });
      }
    }
    if (checkKeys(le.seed, ['dayOffset', 'effect', 'trigger'], where + '.seed')) {
      checkDayOffset(le.seed.dayOffset, where + '.seed.dayOffset', 2, 15);
      checkStr(le.seed.effect, where + '.seed.effect', { maxSentences: 1 });
      // Told to the player as it happens to them: the person by {npc}, the player as "you" (the narrator and the mock tell a due event in the second person).
      checkPlaceholders(le.seed.effect, where + '.seed.effect', ['{npc}']);
      if (typeof le.seed.effect === 'string' && (/\{player\}/.test(le.seed.effect) || !/\byou(r)?\b/.test(le.seed.effect))) err(where + '.seed.effect', 'a loose end happens to the player: write it to "you", not {player}');
      if (['day', 'location', 'npc'].indexOf(le.seed.trigger) === -1) err(where + '.seed.trigger', 'must be "day", "location" or "npc"');
      // Content note 4: loose-end seeds use day triggers counted from day 1.
      else if (le.seed.trigger !== 'day') err(where + '.seed.trigger', 'loose-end seeds use "day"');
      // The NPC comes to the player when the seed fires (World.fireSeeds), wherever that is: no setting assumed.
      if (typeof le.seed.effect === 'string' && /\b(booth|across the bar|behind the bar|at the counter|the night clerk)\b/i.test(le.seed.effect)) err(where + '.seed.effect', 'assumes a setting; the person comes to the player wherever they are');
    }
    // What the loose end binds the player to (CONTRACTS section 4): the
    // kind's default (obligation) and one per preset option (obligations,
    // lined up with options like link.optionTags; null where an option binds
    // to nothing).
    // Wave 5: what the first beat threatens, some days on (the engine plants it when that beat fires, with what must hold: the loose end open and their grudge still on).
    if (le.followUp !== undefined && checkKeys(le.followUp, ['dayOffset', 'effect', 'effects', 'alt'], where + '.followUp')) {
      const fu = le.followUp;
      checkDayOffset(fu.dayOffset, where + '.followUp.dayOffset', 1, 7);
      checkStr(fu.effect, where + '.followUp.effect', { maxSentences: 1 });
      checkPlaceholders(fu.effect, where + '.followUp.effect', ['{npc}']);
      if (typeof fu.effect === 'string' && (/\{player\}/.test(fu.effect) || !/\byou(r)?\b/.test(fu.effect))) err(where + '.followUp.effect', 'it happens to the player: write it to "you", not {player}');
      checkEffectList(fu.effects, where + '.followUp.effects', { ph: true, min: 1, max: 5 });
      if (Array.isArray(fu.effects) && !fu.effects.some((e) => isObj(e) && ['playerHp', 'takeItem', 'playerGold'].indexOf(e.op) !== -1)) err(where + '.followUp.effects', 'a threat that comes good costs the player something (playerHp, takeItem or playerGold)');
      if (checkKeys(fu.alt, ['text'], where + '.followUp.alt', ['effects'])) {
        checkStr(fu.alt.text, where + '.followUp.alt.text', { maxSentences: 1 });
        if (fu.alt.effects !== undefined) checkEffectList(fu.alt.effects, where + '.followUp.alt.effects', { ph: true, max: 3 });
      }
    }
    if (le.obligation !== undefined) checkObligation(le.obligation, where + '.obligation');
    if (le.obligations !== undefined) {
      if (!Array.isArray(le.obligations) || le.obligations.length !== (le.options || []).length) err(where + '.obligations', 'one per option (null for none)');
      else le.obligations.forEach((ob, oi) => { if (ob !== null) checkObligation(ob, where + '.obligations[' + oi + ']'); });
    }
    if (['debt', 'secret', 'promise'].indexOf(key) !== -1 && le.obligation === undefined && !(Array.isArray(le.obligations) && le.obligations.every(isObj))) err(where, 'a ' + key + ' binds the player to something: give it an obligation');
  }
}
// An obligation the loose end creates when its seed fires: what is owed, by
// when (dueOffset days after the seed), and what missing or meeting it does.
// missText: what happens when the day goes by, told as the due event (never
// "came looking: <the task>"); owedTo: who it is owed to when that is not the
// person it binds (an errand is owed to whoever asked, not to whoever the
// thing is for, who may not know it exists).
function checkObligation(ob, where) {
  if (!checkKeys(ob, ['kind', 'dueOffset', 'text', 'missText', 'onMiss', 'onMet'], where, ['amount', 'itemName', 'onStart', 'owedTo'])) return;
  checkText(ob.missText, where + '.missText', { ph: true, max: 300, maxSentences: 2 });
  if (typeof ob.missText === 'string' && /came looking:/i.test(ob.missText)) err(where + '.missText', 'say what happens, not "came looking: <the task>"');
  if (ob.owedTo !== undefined && !npcRef(ob.owedTo, true)) err(where + '.owedTo', '"' + ob.owedTo + '" is not a person');
  if (ob.kind === 'errand' && (ob.owedTo === undefined || ob.owedTo === '{npcId}')) err(where + '.owedTo', 'an errand is owed to whoever asked for it, not to the person the thing is for: name them');
  // Whoever it is owed to remembers a miss: the person owed has a memory in onMiss.
  const owed = ob.owedTo === undefined ? '{npcId}' : ob.owedTo;
  if (Array.isArray(ob.onMiss) && !ob.onMiss.some((e) => isObj(e) && e.op === 'addMemory' && e.npcId === owed)) err(where + '.onMiss', 'the person it is owed to (' + owed + ') remembers the miss: give them an addMemory');
  if (['debt', 'blackmail', 'promise', 'errand'].indexOf(ob.kind) === -1) err(where + '.kind', 'debt, blackmail, promise or errand');
  if (ob.kind === 'debt' || ob.kind === 'blackmail') {
    if (!isInt(ob.amount) || ob.amount < 20 || ob.amount > 2000) err(where + '.amount', 'a ' + ob.kind + ' names its amount in dollars, 20 to 2000');
  } else if (ob.amount !== undefined && ob.amount !== null) err(where + '.amount', 'only a debt or blackmail has an amount');
  if (!isInt(ob.dueOffset) || ob.dueOffset < 1 || ob.dueOffset > 7) err(where + '.dueOffset', 'days after the seed fires, 1 to 7');
  checkText(ob.text, where + '.text', { ph: true, max: 160, maxSentences: 1 });
  if (ob.kind === 'errand') {
    checkText(ob.itemName, where + '.itemName', { ph: true, max: 60, maxSentences: 0 });
    // The thing to deliver comes with the loose end, at character creation.
    if (!Array.isArray(ob.onStart) || !ob.onStart.some((e) => isObj(e) && e.op === 'giveItem' && e.name === ob.itemName)) err(where + '.onStart', 'an errand gives the player the thing to deliver: a giveItem named "' + ob.itemName + '"');
  } else if (ob.itemName !== undefined) err(where + '.itemName', 'only an errand has an item to deliver');
  if (ob.onStart !== undefined) checkEffectList(ob.onStart, where + '.onStart', { ph: true, min: 1, max: 2 });
  checkEffectList(ob.onMiss, where + '.onMiss', { ph: true, min: 1, max: 5 });
  checkEffectList(ob.onMet, where + '.onMet', { ph: true, max: 4 });
  // A missed debt or blackmail bites: money, a thing, health, a door or a price, not just a feeling.
  const BITES = ['playerGold', 'obligationPaid', 'playerHp', 'takeItem', 'banFrom', 'playerPrice', 'addCondition', 'addMemory'];
  if ((ob.kind === 'debt' || ob.kind === 'blackmail') && Array.isArray(ob.onMiss) && !ob.onMiss.some((e) => isObj(e) && BITES.indexOf(e.op) !== -1)) err(where + '.onMiss', 'a missed ' + ob.kind + ' costs the player something (' + BITES.join(', ') + ')');
}

// Grudges and favours (CONTRACTS sections 2 and 3): the text the narrator
// gets, the effects that make it bite when it fires, whether the town hears
// of it (public), and who can hold it (forTags: someone with one of these
// tags; notForTags: nobody with one). Never the player's phone or vehicle.
const PLAYER_GEAR = /\btexts? \{player\}|\bcalls? \{player\}|\{player\}'s (phone|car|truck|ride|tires?)\b|whatever \{player\} (has been )?(riding|driving)/i;
const tagCarriers = (tag) => npcs.filter((n) => n && (n.presence || 'here') === 'here' && Array.isArray(n.tags) && n.tags.indexOf(tag) !== -1);
function holders(t) {
  return npcs.filter((n) => n && (n.presence || 'here') === 'here' && Array.isArray(n.tags) &&
    (!Array.isArray(t.forTags) || t.forTags.some((g) => n.tags.indexOf(g) !== -1)) &&
    (!Array.isArray(t.notForTags) || !t.notForTags.some((g) => n.tags.indexOf(g) !== -1)));
}
// A grudge says what kind of answer it is (wave 4): a grudge answers in kind (World.grudgeKind).
const GRUDGE_KINDS = ['violence', 'police', 'gossip', 'money', 'ban'];
function checkTemplates(list, name) {
  if (!Array.isArray(list) || list.length < 8) { err(name, 'needs at least 8 templates'); return; }
  const seen = new Set();
  const grudges = name === 'GRUDGE_TEMPLATES';
  list.forEach((t, i) => {
    const where = name + '[' + i + ']';
    if (!checkKeys(t, grudges ? ['effect', 'kind', 'dayOffset', 'effects', 'public'] : ['effect', 'dayOffset', 'effects', 'public'], where, ['forTags', 'notForTags'])) return;
    if (grudges && GRUDGE_KINDS.indexOf(t.kind) === -1) err(where + '.kind', 'one of ' + GRUDGE_KINDS.join(', ') + ', found ' + JSON.stringify(t.kind));
    if (grudges && t.kind === 'violence' && !(Array.isArray(t.effects) && t.effects.some((e) => isObj(e) && e.op === 'playerHp'))) err(where + '.kind', 'violence hurts the player (a playerHp effect)');
    checkStr(t.effect, where + '.effect', { maxSentences: 1 });
    checkPlaceholders(t.effect, where + '.effect', ['{npc}', '{player}']);
    if (typeof t.effect === 'string' && PLAYER_GEAR.test(t.effect)) err(where + '.effect', 'assumes the player has a phone or a vehicle');
    checkDayOffset(t.dayOffset, where + '.dayOffset', 2, 5);
    if (typeof t.effect === 'string') { if (seen.has(t.effect)) err(where, 'duplicate template'); seen.add(t.effect); }
    checkEffectList(t.effects, where + '.effects', { ph: true, min: 1, max: 4 });
    if (typeof t.public !== 'boolean') err(where + '.public', 'true when the town hears of it, else false');
    for (const k of ['forTags', 'notForTags']) {
      if (t[k] === undefined) continue;
      if (!Array.isArray(t[k]) || !t[k].length) { err(where + '.' + k, 'a non-empty array of tags'); continue; }
      t[k].forEach((g) => { if (!tagCarriers(g).length) err(where + '.' + k, 'nobody in town carries the tag "' + g + '"'); });
    }
    const who = holders(t);
    if (!who.length) err(where, 'nobody in town can hold it (forTags/notForTags leave no one)');
    // The old, the young and the law do not beat anyone (the law uses its own methods).
    if (Array.isArray(t.effects) && t.effects.some((e) => isObj(e) && e.op === 'playerHp' && e.delta < 0)) {
      const wrong = who.filter((n) => ['elderly', 'teen', 'police'].some((g) => n.tags.indexOf(g) !== -1));
      if (wrong.length) err(where, 'a beating, but ' + wrong.map((n) => n.id).join(', ') + ' could hold it (exclude elderly, teen and police)');
    }
  });
  // Everyone in town has at least one they can hold.
  npcs.filter((n) => n && (n.presence || 'here') === 'here').forEach((n) => {
    if (!list.some((t) => isObj(t) && holders(t).indexOf(n) !== -1)) err(name, n.id + ' can hold none of them');
  });
}
checkTemplates(GRUDGE_TEMPLATES, 'GRUDGE_TEMPLATES');
checkTemplates(FAVOUR_TEMPLATES, 'FAVOUR_TEMPLATES');

// Goal presets for character creation (the UI offers them as suggestions):
// four to six one-line goals tied to the town's threads.
if (!Array.isArray(data.GOAL_PRESETS) || data.GOAL_PRESETS.length < 4 || data.GOAL_PRESETS.length > 6) err('GOAL_PRESETS', 'four to six one-line goals');
else checkStrList(data.GOAL_PRESETS, 'GOAL_PRESETS', undefined, { noPlaceholders: true, maxSentences: 1 });
(Array.isArray(data.GOAL_PRESETS) ? data.GOAL_PRESETS : []).forEach((g, i) => { if (typeof g === 'string' && g.length > 140) err('GOAL_PRESETS[' + i + ']', 'at most 140 characters (the creation form\'s limit)'); });

// Text the narrator is handed to tell (a seed, a completion and its alt, an
// event, the epilogue, a hook, a template, a loose end's seed) has no simile
// outside quotes: the casual style's check would send it back.
const SIMILE = /\b(like an?|as if)\b/i;
(function scan(v, where, key) {
  if (typeof v === 'string') {
    if (['effect', 'text'].indexOf(key) !== -1 && SIMILE.test(v.replace(/"[^"]*"/g, ' '))) err(where, 'a simile ("' + SIMILE.exec(v)[0] + '") in text the narrator tells; say it plainly');
    return;
  }
  if (Array.isArray(v)) v.forEach((x, i) => scan(x, where + '[' + i + ']', key));
  else if (isObj(v)) for (const k of Object.keys(v)) scan(v[k], where + '.' + k, k);
})({ factions: T.factions, seeds: T.seeds, events: T.events, epilogue: T.epilogue, hooks: (Array.isArray(BACKGROUNDS) ? BACKGROUNDS : []).map((b) => b && b.hook), LOOSE_ENDS: LOOSE_ENDS, GRUDGE_TEMPLATES: GRUDGE_TEMPLATES, FAVOUR_TEMPLATES: FAVOUR_TEMPLATES }, 'narrated', null);

// Every flag a condition reads is one some effect sets.
for (const [where, k] of flagsRead) if (!flagsWritten.has(k)) err(where, 'reads the flag "' + k + '", which nothing in the content sets');

// ---------------------------------------------------------------------------
// 8. Modern: EXAMPLE_TURNS_LITERARY and EXAMPLE_TURNS_CASUAL in index.html, the
//    narrator prompt's example turns for each narration style. The literary
//    three keep the shape and length of SPEC.md section 9; the casual six to
//    eight are written in the owner's casual voice (60 words at most each)
//    with their context in the narrator packet's own field format, and
//    between them cover Say to one person and to everyone, a success that
//    gives something concrete, a failure whose complication changes things,
//    an arrival (SINCE THE LAST TURN), a thing not carried, two people
//    reacting and a due event. Neither set names a person or place that
//    exists in this town (they are introduced as being from a different town).
// ---------------------------------------------------------------------------
const SPEC_EXAMPLE_WORDS = [32, 31, 25]; // narration word counts of the SPEC.md section 9 examples
const EXAMPLE_SCENES = [
  { what: 'a creditor waiting in a bar who says what is owed', input: /\bbar\b/i, context: /^Seed due: /, narration: /\bowe\b/i },
  { what: 'a failed lock pick on an office door, watched by a kid', input: /\block\b.*\boffice\b/i, context: /^Stealth \d+ vs \d+ · Failure · Complication: .+\.$/, narration: /\bkid\b/i },
  { what: 'a mechanic who keeps working and asks if you are buying', input: /\bmechanic\b/i, context: /^Mechanic: .*attitude [−-]?\d+\.$/, narration: /buying something\?/i }
];

function properNouns(text) {
  // Capitalised words that do not start a sentence: names and places.
  const out = new Set();
  const re = /[A-Za-z][A-Za-z'-]*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[0];
    if (!/^[A-Z][a-z]/.test(w)) continue;
    const prev = text.slice(0, m.index).replace(/["'(\s]+$/, '');
    if (prev === '' || /[.!?:;]$/.test(prev)) continue;
    out.add(w.replace(/'s$/, '').replace(/'$/, ''));
  }
  return out;
}

// The labels a casual example's context may use: the narrator packet's own.
const PACKET_LABELS = /^(PRESENT|PLAYER SAYS \(to [^)]+\)|PLAYER TYPED|ACTION|ROLL|OUTCOME|COMPLICATION|NOT CARRIED|SINCE THE LAST TURN \([^)]*\)|DUE EVENT|NOT PRESENT|MOVED|TOWN NEWS|LOOSE ENDS|OPEN|TIME THIS TAKES|WHAT PEOPLE KNOW):/;
const CASUAL_COVERS = [
  { what: 'Say to one person', test: (c) => /^PLAYER SAYS \(to (?!everyone)[^)]+\): "/m.test(c) },
  { what: 'Say to everyone', test: (c) => /^PLAYER SAYS \(to everyone present\): "/m.test(c) },
  { what: 'a success', test: (c) => /^ROLL: \w+ \d+.* vs \d+ · (Success|Critical)$/m.test(c) && /^OUTCOME: the ask succeeded/m.test(c) },
  { what: 'a failure with a complication', test: (c) => /^ROLL: \w+ \d+.* vs \d+ · Failure$/m.test(c) && /^COMPLICATION: (?!none)/m.test(c) },
  { what: 'an arrival', test: (c) => /^SINCE THE LAST TURN \(/m.test(c) },
  { what: 'something not carried', test: (c) => /^NOT CARRIED: /m.test(c) },
  { what: 'two people present', test: (c) => (/^PRESENT: (.*)$/m.exec(c) || ['', ''])[1].split(/\)\); /).length >= 2 },
  { what: 'a due event', test: (c) => /^DUE EVENT: (?!none)/m.test(c) }
];
function checkExamples(W) {
  const casual = W === 'EXAMPLE_TURNS_CASUAL';
  // The constant sits after the content block, in the page script.
  const at = html.indexOf('const ' + W + ' = [');
  if (at < 0) { err(W, 'index.html has no "const ' + W + ' = [" constant'); return 0; }
  const close = html.indexOf('\n];', at);
  if (close < 0) { err(W, 'cannot find the end of ' + W); return 0; }
  let turns;
  try {
    turns = vm.runInNewContext(html.slice(at, close + 3) + '\n;' + W, {}, { filename: 'index.html#' + W, timeout: 5000 });
  } catch (e) {
    err(W, 'does not evaluate: ' + e.message);
    return 0;
  }
  if (!Array.isArray(turns)) { err(W, 'must be an array'); return 0; }
  // Every proper noun in the town: cast, places, factions, the town, tables.
  const forbidden = new Set();
  const addName = (s) => { if (typeof s === 'string') s.split(/\s+/).forEach((w) => { const t = w.replace(/^the$/i, '').replace(/'s$/, '').replace(/[^A-Za-z'-]/g, ''); if (/^[A-Z][a-z]/.test(t)) forbidden.add(t); }); };
  addName(T.name);
  npcs.forEach((n) => n && addName(n.name));
  locations.forEach((l) => l && addName(l.name));
  factions.forEach((f) => f && addName(f.name));
  if (isObj(TABLES) && isObj(TABLES.npc)) {
    (TABLES.npc.firstNames || []).forEach(addName);
  }
  const townText = [];
  (function walk(v) {
    if (typeof v === 'string') townText.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (isObj(v)) Object.keys(v).forEach((k) => walk(v[k]));
  })([T, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES]);
  townText.forEach((s) => properNouns(s).forEach((w) => forbidden.add(w)));
  forbidden.delete('The');

  if (!casual && turns.length !== 3) err(W, 'expected exactly 3 example turns, found ' + turns.length);
  if (casual && (turns.length < 6 || turns.length > 8)) err(W, 'expected 6 to 8 example turns, found ' + turns.length);
  if (casual) {
    const contexts = turns.map((t) => (isObj(t) && isStr(t.context) ? t.context : ''));
    for (const c of CASUAL_COVERS) if (!contexts.some(c.test)) err(W, 'no example covers ' + c.what);
  }
  turns.forEach((turn, i) => {
    const where = W + '[' + i + ']';
    if (!checkKeys(turn, ['input', 'context', 'narration'], where)) return;
    if (!['input', 'context', 'narration'].every((k) => isStr(turn[k]))) { err(where, 'input, context and narration must be non-empty strings'); return; }
    if (/\(|\)/.test(turn.context.charAt(0) + turn.context.slice(-1))) err(where, 'context is written without the parentheses (the prompt adds them)');
    const words = turn.narration.split(/\s+/).filter(Boolean).length;
    const target = casual ? undefined : SPEC_EXAMPLE_WORDS[i];
    if (target !== undefined && Math.abs(words - target) > 10) err(where, 'narration is ' + words + ' words; the SPEC.md example it replaces is ' + target);
    if (words > (casual ? 60 : 90)) err(where, 'narration over the ' + (casual ? 60 : 90) + '-word limit');
    const sc = sentenceCount(turn.narration);
    if (sc < 2 || sc > (casual ? 9 : 6)) err(where, 'narration should be 2 to 4 sentences plus dialogue, found ' + sc);
    if (!(casual ? /^(I\b|")/ : /^I\b/).test(turn.input)) err(where, casual ? 'input should be a first-person action or the quoted words said' : 'input should be a first-person action');
    if (!/[.!?]$/.test(turn.context)) err(where, 'context should end with a full stop, as in SPEC.md');
    if (casual) {
      for (const line of turn.context.split('\n')) if (!PACKET_LABELS.test(line)) err(where, 'context line is not in the packet\'s field format: "' + line.slice(0, 50) + '"');
    }
    const scene = casual ? null : EXAMPLE_SCENES[i];
    if (scene) {
      if (!scene.input.test(turn.input) || !scene.context.test(turn.context) || !scene.narration.test(turn.narration)) {
        err(where, 'should be ' + scene.what + ' (input, context or narration does not match)');
      }
    }
    for (const part of ['input', 'context', 'narration']) {
      const s = turn[part];
      const low = s.toLowerCase();
      for (const p of BANNED_PHRASES) if (low.indexOf(p) !== -1) err(where + '.' + part, 'banned phrase "' + p + '"');
      const v = vocabProblem(s);
      if (v) err(where + '.' + part, v);
      const hits = Array.from(forbidden).filter((w) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(s));
      if (hits.length) err(where + '.' + part, 'uses a name or place from this town: ' + hits.join(', '));
    }
    if (/^as you\b/i.test(turn.narration)) err(where, 'narration starts with "As you"');
    // The casual style bans similes; its examples must not use one.
    if (W === 'EXAMPLE_TURNS_CASUAL' && /\b(like an?|as if)\b/i.test(turn.narration.replace(/"[^"]*"/g, ' '))) err(where, 'a simile in a casual example');
  });
  return turns.length;
}
checkExamples('EXAMPLE_TURNS_LITERARY');
checkExamples('EXAMPLE_TURNS_CASUAL');

// ---------------------------------------------------------------------------
// 9. Everything mentioned exists (direction change 9): every capitalised name
//    and every "the <place>" phrase in the content is a record (tests/mentions.cjs).
// ---------------------------------------------------------------------------
const MENTIONS = require('./mentions.cjs');
const unrecordedMentions = MENTIONS.unrecorded(data);
for (const x of unrecordedMentions) {
  if (x.kind === 'person') err(x.where, '"' + x.text + '" puts someone in the story who is not in the cast (tests/mentions.cjs): name a cast member, or let the person act alone');
  else if (x.kind === 'pair') err(x.where, '"' + x.text + '" is one person\'s first name with another\'s family name, and nobody is called that (tests/mentions.cjs): use the full name as written');
  else err(x.where, (x.kind === 'name' ? 'the name "' : 'the place "') + x.text + '" matches no person, place or faction (tests/mentions.cjs): add a record, an aka, or reword');
}

// ---------------------------------------------------------------------------
// 10. Report
// ---------------------------------------------------------------------------
if (problems.length) report();

const effectTotal = allEffects.length;
console.log(
  'OK ' + T.name + ': ' +
  locations.length + ' locations, ' +
  npcs.length + ' npcs (' + herePeople.length + ' here, ' + npcs.filter((n) => presenceOf(n) === 'away').length + ' away, ' + npcs.filter((n) => presenceOf(n) === 'dead').length + ' dead; ' + connectedSecrets + ' linked secrets, ' + relationCount + ' relations, ' + familyChecks + ' family ages checked, ' + homePlaces.length + ' homes to find, ' + townPlaces.length + ' town places, ' + awayPlaces.length + ' out of town' + (offstage.length ? ', ' + offstage.length + ' offstage' : '') + '), ' +
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
