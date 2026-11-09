#!/usr/bin/env node
'use strict';
/* ONE-OFF (wave 37, Creator Mode, task M1-A). The orchestrator deletes this
   file once packs/low-water.json is committed: from then on the JSON is the
   source of truth and nothing regenerates it from JavaScript.
   The owner: "convert Low Water to a JSON so it can be used as a story pack.
   No hard coded story allowed." This runs the old content block (the eight
   constants between the BEGIN and END CONTENT markers) in a Node vm exactly
   as tests/validate-town.cjs does, builds the Story Pack around it (plan,
   "Pack format v1"), proves the round trip lossless with deepStrictEqual,
   writes packs/low-water.json through tests/pack-format.cjs, and dumps every
   comment of the old block to docs/notes/low-water-comments.md (JSON has no
   comments; plan decision A moves them to the Creator Guide later).
   The block is read from index.html while it is still there, else from
   commit 74cd698 (the last commit before wave 37), so a re-run gives the same
   files.
   Usage: node tests/pack-extract.cjs */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const { format, parse } = require('./pack-format.cjs');

const ROOT = path.resolve(__dirname, '..');
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';
const GUARD = "if (typeof module !== 'undefined') { module.exports = { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES, GOAL_PRESETS }; }";
const NAMES = ['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES', 'GOAL_PRESETS'];
const OUT_PACK = path.join(ROOT, 'packs', 'low-water.json');
const OUT_NOTES = path.join(ROOT, 'docs', 'notes', 'low-water-comments.md');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let source = 'index.html';
if (html.indexOf(BEGIN) < 0) {
  html = execFileSync('git', ['show', '74cd698:index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  source = '74cd698:index.html';
}
const a = html.indexOf(BEGIN);
const b = html.indexOf(END);
assert.ok(a >= 0 && b > a, 'the content markers');
const src = html.slice(a + BEGIN.length, b).replace(/^\r?\n/, '');
assert.ok(src.includes(GUARD), 'the module.exports guard');
const code = src.replace(GUARD, '');
const D = vm.runInNewContext(code + '\n;({' + NAMES.join(', ') + '})', {}, { filename: 'index.html#content', timeout: 5000 });
// Out of the sandbox realm and through JSON once: what JSON would keep.
const plain = n => JSON.parse(JSON.stringify(D[n]));

/* Nothing in the old data that JSON cannot carry: no undefined, functions,
   non-finite or negative-zero numbers, holes, RegExps or Dates. */
(function walk(v, where) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') { assert.ok(Number.isFinite(v) && !Object.is(v, -0), where + ' is a JSON number'); return; }
  assert.equal(typeof v, 'object', where + ' is JSON data (' + typeof v + ')');
  const proto = Object.prototype.toString.call(v);
  assert.ok(proto === '[object Object]' || proto === '[object Array]', where + ' is a plain object or array');
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { assert.ok(i in v, where + ' has no hole at ' + i); walk(v[i], where + '[' + i + ']'); } return; }
  for (const k of Object.keys(v)) walk(v[k], where + '.' + k);
})(Object.fromEntries(NAMES.map(n => [n, D[n]])), 'content');

// ----- engine strings the pack now carries, read from the same page -----
function grab(re, what) { const m = re.exec(html); assert.ok(m, 'index.html has ' + what); return m[1]; }
// Through JSON once, so the values are plain objects of this realm, not the sandbox's.
const evalText = (t, what) => JSON.parse(JSON.stringify(vm.runInNewContext('(' + t + ')', {}, { filename: 'index.html#' + what, timeout: 1000 })));
const stripWave = o => { const c = Object.assign({}, o); delete c.wave; return c; };
const gates = {
  council: stripWave(evalText(grab(/\n {4}council: (\{ wave: 30,.*\}),\n/, 'Rel.GATES.council'), 'council')),
  epilogue: stripWave(evalText(grab(/\n {4}epilogue: (\{ wave: 30,.*\})\n {2}\}\);/, 'Rel.GATES.epilogue'), 'epilogue'))
};
const news = evalText(grab(/const WHEN_TOLD = deepFreeze\(\{.*news: ('[^']*') \}\);/, 'WHEN_TOLD.news'), 'news');
const steps = evalText(grab(/const STEPS = (\[[\s\S]*?\n {4}\]);/, 'Create.STEPS'), 'steps');
const statLines = evalText(grab(/const STAT_LINES = (\{[\s\S]*?\n {4}\});/, 'Create.STAT_LINES'), 'statLines');
// Town.openingScene: the two first lines, ${place} and ${s.meta.townName} as placeholders.
const openingRe = /\? `(You step off[^`]*)`\n\s*: `(You come in[^`]*)`;/;
const om = openingRe.exec(html);
assert.ok(om, 'Town.openingScene has its two arrival lines');
const tpl = t => t.replace(/\$\{place\}/g, '{place}').replace(/\$\{s\.meta\.townName\}/g, '{town}');
const opening = { docks: tpl(om[1]), gate: tpl(om[2]) };
assert.doesNotMatch(opening.docks + opening.gate, /\$\{/, 'every interpolation mapped to a placeholder');
// Pipeline.arrival's summary phrase and the creation summary's "Arrives" label.
const summ = /bg && bg\.arrival === 'docks' \? '(arriving by the river)' : '(arriving by the road)'/.exec(html);
const lab = /b && b\.arrival === 'docks' \? '(By river)' : '(By road)'/.exec(html);
assert.ok(summ && lab, 'Pipeline.arrival and the creation summary name both arrivals');
assert.equal(grab(/const AGE_MIN = (\d+);/, 'AGE_MIN'), '16');
assert.equal(grab(/const AGE_MAX = (\d+);/, 'AGE_MAX'), '90');
assert.match(html, /stats, hp: 10, maxHp: 10, gold: bg\.gold \| 0,/);
assert.match(html, /reputation, storyPoints: 2, locationId: startId/);
// The stat names on the creation tiles are capFirst(k).
const stat = k => ({ label: k[0].toUpperCase() + k.slice(1), blurb: statLines[k] });

// ----- the pack -----
const T = plain('TOWN_DATA');
const firstSentence = T.setting.slice(0, T.setting.indexOf('. ') + 1);
assert.ok(firstSentence.endsWith('1938.'), 'the first sentence of the setting: ' + firstSentence);
// UI.PLACE_LABELS as data: typeLabel right after type.
const LABELS = { loc_bluff: 'Bluff', loc_town_hall: 'Town hall' };
const locations = T.locations.map(l => {
  if (!LABELS[l.id]) return l;
  assert.ok('type' in l && !('typeLabel' in l), l.id + ' has a type and no typeLabel');
  const out = {};
  for (const k of Object.keys(l)) { out[k] = l[k]; if (k === 'type') out.typeLabel = LABELS[l.id]; }
  return out;
});
assert.equal(locations.filter(l => l.typeLabel).length, 2);
const world = {};
for (const k of Object.keys(T)) world[k] = k === 'locations' ? locations : T[k];
Object.assign(world, {
  tables: plain('TABLES'),
  grudgeTemplates: plain('GRUDGE_TEMPLATES'),
  favourTemplates: plain('FAVOUR_TEMPLATES'),
  law: { factionId: 'fac_police', headNpcId: T.policeHead, fallbackNpcId: T.policeFallback, arrestPlaceId: 'loc_town_hall', newsTemplate: news },
  gates
});
assert.equal(news, 'Chief Bell has been asking questions about {npc}.');
const pack = {
  packFormat: 1,
  meta: {
    id: 'low-water', title: 'Low Water', author: 'Joe', version: '1.0.0', description: firstSentence, language: 'en',
    // The owner's provisional rating; the 18+ gate arrives in milestone 8.
    rating: 'adult',
    contentWarnings: ['sex', 'violence', 'drug deaths', 'drug dealing', 'smuggling', 'blackmail'],
    tags: ['modern', 'small town', 'crime', 'river'],
    lints: ['lockett-house']
  },
  setting: { era: 'modern', blurb: 'A present-day river town of about eight hundred people on a state line, where the highway crosses the Lusk River on a failing 1938 bridge.' },
  world,
  player: {
    backgrounds: plain('BACKGROUNDS'),
    flaws: plain('FLAWS'),
    goalPresets: plain('GOAL_PRESETS'),
    looseEnds: plain('LOOSE_ENDS'),
    stats: { might: stat('might'), wits: stat('wits'), charm: stat('charm'), stealth: stat('stealth') },
    start: { hp: 10, storyPoints: 2 },
    ageRange: [16, 90],
    arrivals: {
      gate: { label: lab[2], opening: opening.gate, summary: summ[2] },
      docks: { label: lab[1], opening: opening.docks, summary: summ[1] }
    },
    creation: { steps: steps.map(s => ({ id: s.id, title: s.title, sub: s.sub })) }
  }
};

// ----- the round trip, proven -----
const text = format(pack);
const back = parse(text);
assert.deepStrictEqual(back, pack, 'parse(format(pack)) is the pack');
assert.equal(JSON.stringify(back), JSON.stringify(pack), 'and keeps the authored key order');
assert.equal(text.indexOf('</'), -1, 'no "</" in the text');
const w = JSON.parse(JSON.stringify(back.world));
for (const k of ['tables', 'grudgeTemplates', 'favourTemplates', 'law', 'gates']) delete w[k];
for (const l of w.locations) if (LABELS[l.id]) delete l.typeLabel;
const homes = {
  TOWN_DATA: w, TABLES: back.world.tables, BACKGROUNDS: back.player.backgrounds, FLAWS: back.player.flaws,
  LOOSE_ENDS: back.player.looseEnds, GRUDGE_TEMPLATES: back.world.grudgeTemplates,
  FAVOUR_TEMPLATES: back.world.favourTemplates, GOAL_PRESETS: back.player.goalPresets
};
for (const n of NAMES) {
  assert.deepStrictEqual(plain(n), homes[n], n + ' survives the round trip');
  assert.equal(JSON.stringify(plain(n)), JSON.stringify(homes[n]), n + ' keeps its key order');
  console.log('ok ' + n + ' round-trips losslessly (' + JSON.stringify(homes[n]).length + ' bytes)');
}

fs.mkdirSync(path.dirname(OUT_PACK), { recursive: true });
fs.writeFileSync(OUT_PACK, text);
console.log('wrote ' + path.relative(ROOT, OUT_PACK) + ': ' + text.split('\n').length + ' lines, ' + Buffer.byteLength(text) + ' bytes (from ' + source + ')');

// ----- the comments: raw-text scan, not a JS parser -----
/* Walks the block's text keeping strings, comments and a stack of the
   objects and arrays it is inside, so each comment can be filed under the
   key path written last before it and the one written next after it. */
const blockStart = html.lastIndexOf('\n', a) + 1;
const lineAt = (() => { const pre = html.slice(0, blockStart).split('\n').length; return off => pre + html.slice(blockStart, blockStart + off).split('\n').length - 1; })();
const raw = html.slice(blockStart, b + END.length);
const notes = [];
const stack = [];
let lastPath = '(start of block)';
let pendingRoot = null;
const pathNow = () => stack.map((f, i) => (i === 0 ? f.name : f.name.startsWith('[') ? f.name : '.' + f.name)).join('');
function childName() {
  const top = stack[stack.length - 1];
  if (!top) return pendingRoot || '?';
  return top.type === 'arr' ? '[' + top.index + ']' : top.key;
}
for (let i = 0; i < raw.length;) {
  const c = raw[i];
  const d = raw[i + 1];
  if (c === '/' && (d === '/' || d === '*')) {
    const j = d === '/' ? (raw.indexOf('\n', i) < 0 ? raw.length : raw.indexOf('\n', i)) : raw.indexOf('*/', i + 2) + 2;
    // The two markers themselves are not content comments.
    if (/^\/\/ ===== (BEGIN|END) CONTENT =====$/.test(raw.slice(i, j))) { i = j; continue; }
    const prev = notes[notes.length - 1];
    // A run of // lines with nothing but whitespace between is one comment.
    if (d === '/' && prev && prev.slash && /^\s*$/.test(raw.slice(prev.end, i)) && lineAt(i) === lineAt(prev.end) + 1) {
      prev.text += '\n' + raw.slice(i, j); prev.end = j; prev.lines++;
    } else notes.push({ line: lineAt(i), text: raw.slice(i, j), after: lastPath, before: null, slash: d === '/', end: j, lines: 1 });
    i = j;
    continue;
  }
  if (c === '"' || c === "'") { let j = i + 1; while (raw[j] !== c) { if (raw[j] === '\\') j++; j++; } i = j + 1; continue; }
  if (c === '{' || c === '[') {
    stack.push({ type: c === '{' ? 'obj' : 'arr', name: childName(), key: null, index: 0 });
    if (c === '[') { lastPath = pathNow() + '[0]'; }
    i++; continue;
  }
  if (c === '}' || c === ']') { stack.pop(); i++; continue; }
  if (c === ',') { const top = stack[stack.length - 1]; if (top && top.type === 'arr') top.index++; i++; continue; }
  const m = /^(?:const\s+([A-Za-z_$][\w$]*)\s*=|([A-Za-z_$][\w$]*)\s*:)/.exec(raw.slice(i, i + 80));
  if (m && !/[\w$]/.test(raw[i - 1] || '')) {
    if (m[1]) { pendingRoot = m[1]; lastPath = m[1]; } else if (stack.length && stack[stack.length - 1].type === 'obj') {
      stack[stack.length - 1].key = m[2];
      lastPath = pathNow() + '.' + m[2];
    }
    for (const n of notes) if (n.before === null) n.before = lastPath;
    i += m[0].length;
    continue;
  }
  i++;
}
// The header just above the block, rewritten in wave 37: kept here too.
const hdrStart = html.lastIndexOf('/* ====', a);
const header = html.slice(hdrStart, html.indexOf('*/', hdrStart) + 2);
const inBlock = notes;
const md = ['# Low Water: the comments of the old content block',
  '',
  'Wave 37, Creator Mode. The town used to be eight JavaScript constants between',
  '`// ===== BEGIN CONTENT =====` and `// ===== END CONTENT =====` in index.html',
  '(lines ' + lineAt(0) + ' to ' + lineAt(raw.length - 1) + ' of ' + source + '). It is now',
  '`packs/low-water.json`, and JSON has no comments. These are every comment that block held,',
  'with its line in ' + source + ', the key path written last before it ("after") and',
  'the key path it sits above ("before"; most comments explain that one). Field semantics',
  'move to docs/CREATOR_GUIDE.md in milestone 9 (plan decision A). Written once by',
  '`tests/pack-extract.cjs`; edit freely.',
  '',
  inBlock.length + ' comments (' + inBlock.reduce((t, n) => t + n.lines, 0) + ' counting each // line on its own).',
  '',
  '## The header above the block (line ' + html.slice(0, hdrStart).split('\n').length + ')',
  '',
  '```js', header, '```', ''];
for (const n of inBlock) {
  md.push('## Line ' + n.line + (n.before ? ', before `' + n.before + '`' : '') , '', 'After `' + n.after + '`.', '', '```js', n.text, '```', '');
}
fs.mkdirSync(path.dirname(OUT_NOTES), { recursive: true });
fs.writeFileSync(OUT_NOTES, md.join('\n'));
console.log('wrote ' + path.relative(ROOT, OUT_NOTES) + ': ' + inBlock.length + ' comments (' + inBlock.reduce((t, n) => t + n.lines, 0) + ' counting each // line on its own)');
