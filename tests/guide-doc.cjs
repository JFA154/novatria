#!/usr/bin/env node
// Writes the field list of docs/CREATOR_GUIDE.md from Pack.SCHEMA, the one
// field-spec tree the editor's forms and the validator read (wave 37,
// Creator Mode; plan milestone 9: "generates the field skeleton from
// Pack.SCHEMA so the list never drifts"). It opens index.html in the
// installed Playwright's Chromium from file://, every other request
// aborted, as tests/validate-pack.cjs does, because the schema's words (the
// labels and help the editor shows) are built in the page and nowhere else.
// The list sits between two markers in the guide:
//   <!-- generated: fields -->  ...  <!-- /generated -->
// One entry per section and per field: its path, type, label, help, caps and
// enum values. Everything outside the markers is written by hand and kept.
// The hand-written examples (between <!-- examples --> and <!-- /examples -->,
// each a "#### `path`" heading over a ```json block) are checked too: each
// path must be one the schema has, each block must be JSON, and every key in
// it must be a field the schema knows at that place, so an example can never
// show a field the game does not read. It prints how many fields the
// examples show.
// Usage: node tests/guide-doc.cjs           (rewrites the section in place)
//        node tests/guide-doc.cjs --check   (exits 1 when the committed text differs or an example is wrong)
// tests/run.cjs runs the check (as the content suite runs tests/cast-doc.cjs --check).
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'index.html');
const GUIDE = path.join(ROOT, 'docs', 'CREATOR_GUIDE.md');
const BEGIN = '<!-- generated: fields -->';
const END = '<!-- /generated -->';
const EX_BEGIN = '<!-- examples -->';
const EX_END = '<!-- /examples -->';
const check = process.argv.includes('--check');
const CONTAINERS = ['object', 'list', 'map'];

function fail(msg) { console.error('guide-doc: ' + msg); process.exit(1); }

/* The schema as plain data, read in the page: RegExps become their source,
   shared nodes are copied per path (JSON). */
async function readSchema() {
  const browser = await chromium.launch();
  const errors = [];
  try {
    const context = await browser.newContext();
    // Network blocked, as tests/helpers.cjs does: only file:, blob: and data: URLs load.
    await context.route('**/*', route => (/^(file|blob|data):/.test(route.request().url()) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + PAGE);
    await page.waitForFunction(() => window.Game && window.Game.Pack && window.Game.Pack.SCHEMA, null, { timeout: 30000 });
    const out = await page.evaluate(() => {
      const P = Game.Pack;
      const ser = node => JSON.parse(JSON.stringify(node, (k, v) => (v instanceof RegExp ? v.source : v)));
      return { schema: ser(P.SCHEMA), stringMax: Object.assign({}, P.STRING_MAX), notesMax: P.NOTES_MAX };
    });
    if (errors.length) fail('the page threw: ' + errors[0]);
    return out;
  } finally {
    await browser.close();
  }
}

const REF = {
  npc: ['a person', 'people'], loc: ['a place', 'places'], fac: ['a faction', 'factions'], thread: ['a thread', 'threads'],
  seed: ['a seed', 'seeds'], rumour: ['a rumour', 'rumours'], item: ['a thing', 'things'], background: ['a background', 'backgrounds'],
  flag: ['a flag name', 'flag names'], event: ['an event', 'events']
};
const code = s => '`' + String(s).replace(/`/g, "'") + '`';
const n = v => Number(v).toLocaleString('en-US');
const clean = s => String(s).replace(/\s+/g, ' ').trim();
// A sentence ends with a full stop.
const sentence = s => { const t = clean(s); return t && !/[.!?:)]$/.test(t) ? t + '.' : t; };
const isContainer = node => !!node && CONTAINERS.includes(node.type);

/* What a node takes, in words: its type, its cap or range, its values. */
function describe(node, M) {
  const bits = [];
  switch (node.type) {
    case 'object': bits.push('a section'); break;
    case 'list': {
      const of = node.of || {};
      bits.push(of.type === 'object' ? 'a list of records' : `a list, each ${describe(of, M)}`);
      if (node.min !== undefined && node.max !== undefined) bits.push(node.min === node.max ? `exactly ${node.min}` : `${node.min} to ${node.max} entries`);
      break;
    }
    case 'map':
      bits.push(node.of && node.of.type === 'object' ? 'records keyed by a name you choose' : `values keyed by a name, each ${describe(node.of, M)}`);
      if (node.keyRe) bits.push(`keys in the form ${code(node.keyRe)}`);
      break;
    case 'string': bits.push(`one line of text, up to ${n(node.max || M.string)} characters`); break;
    case 'text': bits.push(`text, up to ${n(node.max || M.text)} characters`); break;
    case 'enum': bits.push(`one of ${node.enum.map(code).join(', ')}`); break;
    case 'ref': bits.push(`the id of ${REF[node.ref] ? REF[node.ref][0] : 'something in the pack'}`); break;
    case 'refs': bits.push(node.ref === 'flag' ? 'a list of flag names' : node.ref && REF[node.ref] ? `a list of ids of ${REF[node.ref][1]}` : 'a list of ids of any kind'); break;
    case 'id': bits.push(node.idPrefix ? `an id starting ${code(node.idPrefix)}` : 'an id'); break;
    case 'int': case 'number': {
      let t = node.type === 'int' ? 'a whole number' : 'a number';
      if (node.const !== undefined) t += `, always ${node.const}`;
      else if (node.min !== undefined && node.max !== undefined) t += `, ${node.min} to ${node.max}`;
      else if (node.min !== undefined) t += `, at least ${node.min}`;
      else if (node.max !== undefined) t += `, at most ${node.max}`;
      bits.push(t);
      break;
    }
    case 'bool': bits.push('true or false'); break;
    case 'any': bits.push('a free value'); break;
    default: bits.push(String(node.type));
  }
  if (node.pattern) bits.push(`in the form ${code(node.pattern)}`);
  if (node.nullable) bits.push('or null');
  return bits.join(', ');
}

/* Every node with its path, in the order the editor shows an object's
   fields (its order list first, then the rest as authored). */
function walk(schema) {
  const out = [];
  (function visit(node, p, depth, hidden) {
    const hid = hidden || node.hidden === true;
    if (p) out.push({ path: p, node, depth, hidden: hid });
    if (node.type === 'object') {
      const keys = Object.keys(node.fields);
      const order = (node.order || []).filter(k => keys.includes(k));
      for (const k of order.concat(keys.filter(k => !order.includes(k)))) visit(node.fields[k], p ? p + '.' + k : k, depth + 1, hid);
    } else if (node.type === 'list' && isContainer(node.of)) {
      visit(node.of, p + '[]', depth + 1, hid);
    } else if (node.type === 'map' && isContainer(node.of)) {
      visit(node.of, p + '{}', depth + 1, hid);
    }
  })(schema, '', 0, false);
  return out;
}
// A field, as the counts and the examples' coverage mean it: anything but a section, a record or a list of records.
const isField = e => !(e.node.type === 'object' || (CONTAINERS.includes(e.node.type) && e.node.type !== 'object' && isContainer(e.node.of)));

function render(data) {
  const S = data.schema;
  const M = data.stringMax;
  const all = walk(S);
  const lines = [];
  lines.push(BEGIN);
  lines.push('');
  lines.push('<!-- Written by node tests/guide-doc.cjs from Pack.SCHEMA in index.html; do not edit by hand (tests/run.cjs runs it with --check). -->');
  lines.push('');
  lines.push(`Every field of pack format ${S.fields.packFormat.const}: ${n(all.filter(isField).length)} fields in ${n(all.filter(e => e.node.type === 'object').length)} sections and records, in the order the editor shows them. In a path, ${code('[]')} is any entry of a list and ${code('{}')} any value of a map. Each entry gives the path, what it takes, the editor's label in bold and its help. Every section and record may also carry ${code('notes')} (text, up to ${n(data.notesMax)} characters): a remark for you and other authors, shown in the editor and never sent to a prompt. "Not in the forms" marks what the editor shows only on the JSON tab; "read-only" what it shows and never lets you type over.`);
  let gap = false; // a blank line owed before the first entry under a heading
  for (const e of all) {
    const { node, path: p } = e;
    const help = node.help ? ' ' + sentence(node.help) : '';
    const flags = [];
    if (node.readOnly) flags.push('read-only');
    if (e.hidden) flags.push('not in the forms');
    if (node.type === 'object' && Array.isArray(node.required) && node.required.length) flags.push('needs ' + node.required.map(code).join(', '));
    if (e.depth === 1) {
      lines.push('');
      lines.push(`#### ${code(p)}${node.label ? ': ' + clean(node.label) : ''}`);
      lines.push('');
      const what = describe(node, M);
      lines.push(clean(`${sentence(what[0].toUpperCase() + what.slice(1))}${help}${flags.length ? ' ' + sentence(flags.join('; ').replace(/^./, c => c.toUpperCase())) : ''}`));
      gap = true;
      continue;
    }
    if (gap) { lines.push(''); gap = false; }
    const label = node.label ? ` **${clean(node.label)}**.` : '';
    // A list's or a map's entry is a record of its own.
    const what = node.type === 'object' && /[\]}]$/.test(p) ? 'one record' : describe(node, M);
    lines.push(clean(`- ${code(p)}: ${what}.${label}${help}${flags.length ? ` (${flags.join('; ')})` : ''}`));
  }
  lines.push('');
  lines.push(END);
  return { text: lines.join('\n'), all };
}

/* The hand-written examples, [{ path, json }], from the examples block. */
function examplesOf(guide) {
  const a = guide.indexOf(EX_BEGIN);
  const b = guide.indexOf(EX_END);
  if (a < 0 || b < a) return [];
  const out = [];
  let cur = null;
  let inJson = false;
  let buf = [];
  for (const line of guide.slice(a, b).split('\n')) {
    const h = /^#### `([^`]+)`/.exec(line);
    if (!inJson && h) { cur = h[1]; continue; }
    if (!inJson && line === '```json' && cur) { inJson = true; buf = []; continue; }
    // A heading may have several blocks: each is an example of that path until the next heading.
    if (inJson && line === '```') { out.push({ path: cur, json: buf.join('\n') }); inJson = false; continue; }
    if (inJson) buf.push(line);
  }
  return out;
}

/* The schema node at an example path ("world.npcs[]", "player.looseEnds{}", "rules"). */
function nodeAt(schema, p) {
  let node = schema;
  for (const part of p.split('.')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\]|\{\})*)$/.exec(part);
    if (!m || !node || node.type !== 'object' || !node.fields[m[1]]) return null;
    node = node.fields[m[1]];
    for (const s of m[2].match(/\[\]|\{\}/g) || []) {
      if (s === '[]' && node.type === 'list') node = node.of;
      else if (s === '{}' && node.type === 'map') node = node.of;
      else return null;
    }
  }
  return node;
}

/* An example's value against its schema node: the problems, and every path it shows (into shown). */
function checkExample(node, v, p, shown) {
  const bad = [];
  (function go(spec, x, at) {
    if (!spec) return;
    shown.add(at);
    if (spec.type === 'object') {
      if (x === null || typeof x !== 'object' || Array.isArray(x)) { bad.push(`${at} is not an object`); return; }
      for (const k of Object.keys(x)) {
        // notes is allowed on every section and record; a field the schema names notes (a carried thing's) is checked as one.
        if (k === 'notes' && !spec.fields[k]) continue;
        if (!spec.fields[k]) { bad.push(`${at}.${k} is not a field the schema knows`); continue; }
        go(spec.fields[k], x[k], at + '.' + k);
      }
    } else if (spec.type === 'list' && isContainer(spec.of)) {
      if (!Array.isArray(x)) bad.push(`${at} is not a list`); else x.forEach(y => go(spec.of, y, at + '[]'));
    } else if (spec.type === 'map' && isContainer(spec.of)) {
      if (x === null || typeof x !== 'object' || Array.isArray(x)) bad.push(`${at} is not an object`); else Object.keys(x).forEach(k => go(spec.of, x[k], at + '{}'));
    } else if (spec.type === 'enum' && !spec.enum.includes(x)) {
      bad.push(`${at} is ${JSON.stringify(x)}, not one of ${spec.enum.join(', ')}`);
    }
  })(node, v, p);
  return bad;
}

(async () => {
  if (!fs.existsSync(GUIDE)) fail('docs/CREATOR_GUIDE.md is missing');
  const guide = fs.readFileSync(GUIDE, 'utf8');
  const a = guide.indexOf(BEGIN);
  const b = guide.indexOf(END);
  if (a < 0 || b < a) fail(`docs/CREATOR_GUIDE.md has no ${BEGIN} ... ${END} section`);
  const data = await readSchema();
  const { text, all } = render(data);
  const next = guide.slice(0, a) + text + guide.slice(b + END.length);

  // The examples: real paths, JSON, known fields only.
  const shown = new Set();
  const problems = [];
  const exs = examplesOf(next);
  if (!exs.length) problems.push(`no examples between ${EX_BEGIN} and ${EX_END}`);
  for (const ex of exs) {
    const node = nodeAt(data.schema, ex.path);
    if (!node) { problems.push(`example ${ex.path}: not a path the schema has`); continue; }
    let v;
    try { v = JSON.parse(ex.json); } catch (e) { problems.push(`example ${ex.path}: not valid JSON (${e.message})`); continue; }
    for (const p of checkExample(node, v, ex.path, shown)) problems.push(`example ${ex.path}: ${p}`);
  }
  const fields = all.filter(isField);
  const covered = fields.filter(e => shown.has(e.path));
  const coverage = `${exs.length} examples show ${covered.length} of ${fields.length} fields`;
  if (process.env.GUIDE_MISSING) fields.filter(e => !shown.has(e.path)).forEach(e => console.log('  no example: ' + e.path));
  if (problems.length) { problems.forEach(p => console.error('  - ' + p)); fail(`${problems.length} problem(s) with the guide's examples`); }
  if (check) {
    if (next !== guide) fail('docs/CREATOR_GUIDE.md\'s field list is out of date with Pack.SCHEMA: run node tests/guide-doc.cjs');
    console.log(`docs/CREATOR_GUIDE.md matches Pack.SCHEMA (${all.length} entries; ${coverage})`);
  } else {
    fs.writeFileSync(GUIDE, next);
    console.log(`wrote the field list of docs/CREATOR_GUIDE.md (${all.length} entries; ${coverage})`);
  }
})().catch(e => fail(e.message.split('\n')[0]));
