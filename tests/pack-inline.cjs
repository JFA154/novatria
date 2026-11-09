#!/usr/bin/env node
'use strict';
/* Wave 37, Creator Mode: copies packs/low-water.json, the source of truth
   for the built-in story (the owner: "convert Low Water to a JSON so it can
   be used as a story pack. No hard coded story allowed."), into index.html
   as the inert <script type="application/json" id="pack-low-water"> element
   between the BEGIN and END PACK markers, so the game still runs from
   file:// with no build (plan decision A). The file is first re-formatted
   with tests/pack-format.cjs; when that changes it, the file is rewritten
   and the run says so. Idempotent.
   Usage: node tests/pack-inline.cjs          (rewrites the block)
          node tests/pack-inline.cjs --check  (exits 1 when the block and the file differ)
   The tests/cast-doc.cjs --check precedent: CI runs the check. */
const fs = require('fs');
const path = require('path');
const { format, parse } = require('./pack-format.cjs');

const ROOT = path.resolve(__dirname, '..');
const FILE = process.env.VALIDATE_FILE ? path.resolve(process.env.VALIDATE_FILE) : path.join(ROOT, 'index.html');
const PACK = path.join(ROOT, 'packs', 'low-water.json');
const BEGIN = '<!-- ===== BEGIN PACK low-water ===== -->';
const END = '<!-- ===== END PACK ===== -->';
const OPEN = '<script type="application/json" id="pack-low-water">\n';
const CLOSE = '</script>';
const check = process.argv.includes('--check');

function fail(msg) { console.error('pack-inline: ' + msg); process.exit(1); }

const raw = fs.readFileSync(PACK, 'utf8');
let pack;
try { pack = parse(raw); } catch (e) { fail(path.relative(ROOT, PACK) + ' is not valid JSON: ' + e.message); }
const text = format(pack);
if (text !== raw) {
  if (check) fail(path.relative(ROOT, PACK) + ' is not in canonical format; run node tests/pack-inline.cjs');
  fs.writeFileSync(PACK, text);
  console.log('re-formatted ' + path.relative(ROOT, PACK) + ' (it differed from format())');
}
// format() writes every "</" as "<\/"; a pack that still holds one cannot be inlined.
if (/<\/script/i.test(text)) fail('the pack text contains "</script"');

const html = fs.readFileSync(FILE, 'utf8');
const a = html.indexOf(BEGIN);
const b = html.indexOf(END);
if (a < 0 || b < a) fail(path.basename(FILE) + ' has no "' + BEGIN + '" ... "' + END + '" block');
if (html.indexOf(BEGIN, a + 1) >= 0 || html.indexOf(END, b + 1) >= 0) fail('the pack markers must appear exactly once');
const want = BEGIN + '\n' + OPEN + text + CLOSE + '\n' + END;
const have = html.slice(a, b + END.length);

if (check) {
  const inner = have.slice(have.indexOf('>', BEGIN.length) + 1, have.lastIndexOf(CLOSE));
  if (/<\/script/i.test(inner)) fail('the inlined block contains "</script" inside the JSON');
  if (have !== want) fail('the inlined pack in ' + path.basename(FILE) + ' differs from ' + path.relative(ROOT, PACK) + '; run node tests/pack-inline.cjs');
  console.log('OK pack low-water: ' + Buffer.byteLength(text) + ' bytes inlined');
  process.exit(0);
}
if (have === want) console.log('pack low-water: already inlined, ' + Buffer.byteLength(text) + ' bytes');
else {
  fs.writeFileSync(FILE, html.slice(0, a) + want + html.slice(b + END.length));
  console.log('pack low-water: inlined ' + Buffer.byteLength(text) + ' bytes into ' + path.basename(FILE));
}
