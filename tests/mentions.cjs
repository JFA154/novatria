#!/usr/bin/env node
// Every name the town's content mentions must be a record (docs/BUILD_PLAN.md,
// direction change 9: "everything mentioned exists"). This scans every string
// in the content block of index.html (TOWN_DATA, BACKGROUNDS, FLAWS,
// LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES; read in a Node vm sandbox
// like tests/validate-town.cjs) and lists:
//   - capitalised names (a capitalised word that does not start a sentence,
//     or two or more in a row anywhere) that are not a person, a place, a
//     place's other names (aka), a faction, the town, a map label or a word
//     on the short ALLOW list below;
//   - "the <place>" phrases for kinds of place (PLACE_NOUNS: the bluff, the
//     county seat, the paper mill) that no place's name, map label or aka
//     answers to;
//   - a "First Last" pair of one person's first name and another person's
//     family name that is nobody's name (PAIR_ALLOW: names used on purpose);
//   - phrases that put a person with no record in town (NOBODY: "two other
//     boys", "pays two men", "the farmers", "a boy at Riverbend"): name a
//     cast member instead, or let the person act alone.
// The narrator's example turns are not scanned: they are from a different
// town on purpose (content note 8), and tests/validate-town.cjs checks they
// use no name from this one. Signs written in capitals are not names.
// Usage: node tests/mentions.cjs     (exits 1 and lists what has no record)
//        require('./mentions.cjs').unrecorded(data) -> [{ where, text, kind }]
// tests/validate-town.cjs runs it, so a new mention cannot slip in unrecorded.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Words that are capitalised but name no person or place: titles before a
// name, the calendar, and a few proper nouns that are neither. Keep it short.
const ALLOW = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Chief', 'Pastor', 'Mayor', 'Officer', 'Sheriff',
  'Bible', 'Army', 'Civil War', 'Christmas', 'Room'];
const CALENDAR = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// Kinds of place: "the <words> <noun>" must be a place the town has.
const PLACE_NOUNS = ['bluff', 'highway', 'bypass', 'bottomland', 'school', 'cemetery', 'graveyard', 'clinic', 'hospital', 'emergency room',
  'county seat', 'courthouse', "sheriff's office", 'garage', 'mill', 'interchange', 'water tower', 'penitentiary', 'prison', 'nursing home',
  'county home', 'coast', 'city', 'dry county', 'treatment program', 'treatment center', 'university', 'college', 'river road', 'street',
  'station', 'factory', 'plant', 'gin', 'diner', 'cafe', 'warehouse', 'airport', 'depot', 'marina', 'motel', 'jail'];
// People the cast does not have: a crowd or a stranger in town who would
// have to be made up (REVIEW section 4). A role names a recorded person, so
// roles are not checked against this list.
const NOBODY = [
  /\b(two|three) other (boys|girls|men|women|kids|guys)\b/i,
  /\ba couple of (kids|boys|men|guys)\b/i,
  /\b(pays|hires|sends|gets) (two|three|some|a couple of) (men|boys|kids|guys)\b/i,
  /\bthe (farmers|teenagers|old men|bass fishermen)\b/i,
  /\bthe (sheriff's )?deputies (park|sit|run|come)\b/i,
  /\bmen working timber\b/i,
  /\ba (boy|girl|man|woman|kid) at Riverbend\b/i,
  /\bthe night clerk\b/i,
  /\bthe city doctor\b|\ba doctor in the city\b/i,
  /\bthe consulting engineer Carter\b/i,
  /\ba trucker left\b/i
];
// A "First Last" pair made of one person's first name and another's family
// name names nobody ("Glenda Gentry" for Glenda Pryor; playtest N13). These
// are real names the content uses on purpose: a maiden name, a name before a
// marriage.
const PAIR_ALLOW = ['Mavis Crocker', 'Jodie Ogletree'];
// Fields that hold ids or codes, not prose.
const SKIP_KEYS = new Set(['id', 'type', 'tags', 'pronouns', 'presence', 'status', 'op', 'key', 'anchor', 'arrival', 'relation', 'trigger', 'river', 'roads', 'bridges', 'flagsSet', 'flagsUnset', 'orFlagsSet', 'phases', 'kind']);

function load(file) {
  const html = fs.readFileSync(file, 'utf8');
  const BEGIN = '// ===== BEGIN CONTENT =====';
  const END = '// ===== END CONTENT =====';
  const src = html.slice(html.indexOf(BEGIN) + BEGIN.length, html.indexOf(END));
  return vm.runInNewContext(src + '\n;({ TOWN_DATA, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES, GOAL_PRESETS: typeof GOAL_PRESETS === "undefined" ? [] : GOAL_PRESETS })', {}, { filename: 'index.html#content', timeout: 5000 });
}

function strings(data) {
  const out = [];
  (function walk(v, where, key) {
    if (SKIP_KEYS.has(key) || /Id$|Ids$/.test(key || '')) return;
    if (typeof v === 'string') { out.push([where, v, key]); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, where + '[' + i + ']', key)); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], where + '.' + k, k);
  })(data, 'content', null);
  return out;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* The names the content may use: people (full, first and family names),
   places (name with and without "The", map label, aka), factions, the town
   and its words, and the map's labels. */
function known(data) {
  const T = data.TOWN_DATA;
  const names = new Set();
  const places = new Set();
  const add = s => { if (typeof s === 'string' && s.trim()) { names.add(s.trim()); names.add(s.trim().replace(/^The /, '')); } };
  add(T.name);
  String(T.name || '').split(/\s+/).forEach(w => add(w.replace(/'s$/, '')));
  // A family by name: "the Gentrys", "the Sturdivants".
  for (const n of T.npcs || []) { add(n.name); String(n.name || '').split(/\s+/).forEach(add); add(String(n.name || '').split(/\s+/).slice(-1)[0] + 's'); }
  for (const f of T.factions || []) add(f.name);
  for (const l of T.locations || []) {
    for (const k of [l.name, l.map && l.map.label].concat(l.aka || [])) {
      if (typeof k !== 'string') continue;
      if (/[A-Z]/.test(k.replace(/^The /, ''))) add(k.replace(/^the /, ''));
      places.add(k.toLowerCase().replace(/^the /, ''));
    }
  }
  const M = T.map || {};
  for (const lab of [M.riverLabel].concat(M.labels || [])) {
    if (!lab || typeof lab.text !== 'string') continue;
    add(lab.text);
    lab.text.split(/\s+/).forEach(w => { if (/^[A-Z]/.test(w)) add(w); });
    places.add(lab.text.toLowerCase());
  }
  ALLOW.forEach(add);
  CALENDAR.forEach(d => { add(d); add(d + 's'); });
  return { names: Array.from(names).sort((a, b) => b.length - a.length), places };
}

function unrecorded(data) {
  const K = known(data);
  const found = [];
  // First names and family names of the cast, and their full names.
  const npcs = (data.TOWN_DATA.npcs || []).map(n => String(n.name || '').trim().split(/\s+/)).filter(p => p.length >= 2);
  const firsts = new Set(npcs.map(p => p[0]));
  const lasts = new Set(npcs.map(p => p[p.length - 1]));
  const fulls = new Set(npcs.map(p => p.join(' ')).concat(npcs.map(p => p[0] + ' ' + p[p.length - 1])).concat(PAIR_ALLOW));
  const nameRe = K.names.map(n => new RegExp("(^|[^A-Za-z])" + esc(n) + "(?=('s|s'|')?(?![A-Za-z]))", 'g'));
  const nounRe = new RegExp("\\bthe\\s+((?:[a-z][a-z'-]*\\s+){0,3}?)(" + PLACE_NOUNS.map(esc).join('|') + ")(?![a-z])", 'gi');
  for (const [where, raw, key] of strings(data)) {
    if (/^[a-z_]+$/.test(raw)) continue; // a code word
    if (key !== 'role') for (const re of NOBODY) { const m = re.exec(raw); if (m) found.push({ where, kind: 'person', text: m[0], in: raw.slice(Math.max(0, m.index - 30), m.index + 50) }); }
    for (const m of raw.matchAll(/\b([A-Z][a-z]+) ([A-Z][a-z]+)(?![a-z])/g)) {
      if (firsts.has(m[1]) && lasts.has(m[2]) && !fulls.has(m[1] + ' ' + m[2]) && !K.names.includes(m[1] + ' ' + m[2])) found.push({ where, kind: 'pair', text: m[0], in: raw.slice(Math.max(0, m.index - 30), m.index + 50) });
    }
    // A title's full stop does not end a sentence ("Mr. Sturdivant").
    let s = raw.replace(/\{(npc|player|playerName|npcId)\}/g, 'someone').replace(/\b(Mr|Mrs|Ms|Dr|St)\./g, '$1 ');
    for (const re of nameRe) s = s.replace(re, (m, pre) => pre + ' '.repeat(m.length - pre.length));
    const words = [...s.matchAll(/[A-Za-z][A-Za-z'-]*/g)];
    for (let i = 0; i < words.length; i++) {
      const w = words[i][0].replace(/('s|s'|')$/, '');
      if (!/^[A-Z][a-z]/.test(w)) continue;
      const before = s.slice(0, words[i].index).replace(/["'(\s]+$/, '');
      const starts = before === '' || /[.!?:;]$/.test(before);
      const next = words[i + 1] && /^[A-Z][a-z]/.test(words[i + 1][0]) && /^\s+$/.test(s.slice(words[i].index + words[i][0].length, words[i + 1].index));
      if (starts && !next) continue;
      found.push({ where, kind: 'name', text: w, in: raw.slice(Math.max(0, words[i].index - 30), words[i].index + 40) });
    }
    for (const m of raw.matchAll(nounRe)) {
      const phrase = (m[1] + m[2]).toLowerCase().trim();
      const parts = phrase.split(/\s+/);
      let ok = false;
      for (let k = 0; k < parts.length && !ok; k++) if (K.places.has(parts.slice(k).join(' '))) ok = true;
      if (!ok) found.push({ where, kind: 'place', text: 'the ' + phrase, in: raw.slice(Math.max(0, m.index - 30), m.index + 50) });
    }
  }
  return found;
}

module.exports = { unrecorded, known, load, ALLOW, CALENDAR, PLACE_NOUNS, NOBODY, PAIR_ALLOW };

if (require.main === module) {
  const file = process.env.VALIDATE_FILE ? path.resolve(process.env.VALIDATE_FILE) : path.join(__dirname, '..', 'index.html');
  const left = unrecorded(load(file));
  if (left.length) {
    console.error(left.length + ' mention(s) with no record:');
    for (const x of left) console.error(`  - ${x.where}: ${x.kind} "${x.text}" in "...${x.in}..."`);
    process.exit(1);
  }
  console.log('every name and place the content mentions is a record');
}
