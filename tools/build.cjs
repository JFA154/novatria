#!/usr/bin/env node
'use strict';
/* Wave 50: the development split. index.html is still the one deliverable
   (it runs from file:// and on a static host with no build); src/ holds the
   same bytes cut into natural parts, and this script joins them back, byte
   for byte, in the fixed order of PARTS. Edit src/, run
   node tools/build.cjs, commit both: tests/build.test.cjs fails the suite
   when they disagree. Plain Node, no dependencies, no package.json.

   Usage: node tools/build.cjs [--check] [--list] [--csp-hash] [--root DIR] [--out FILE]
   - (no flag)   build src/ into index.html.
   - --check     build to memory and compare with index.html: exit 0 when
                 equal, else exit 1 with a short diff summary (what CI runs).
   - --list      print the parts in order with their line counts; builds nothing.
   - --csp-hash  OFF by default. Replace script-src 'unsafe-inline' in the
                 CSP (line 8) with the sha256 hashes of the two inline
                 scripts. With it on, any hand edit to a script in index.html
                 is blocked by the page's own CSP (a dead page and one console
                 error), so turn it on only together with --check in CI:
                 build with node tools/build.cjs --csp-hash and change the CI
                 steps to node tools/build.cjs --check --csp-hash.
   - --root DIR  the repo root to read src/ from and to write or check
                 index.html in (default: this script's parent folder; tests
                 use a temp copy).
   - --out FILE  write the build here instead of DIR/index.html (with
                 --check: compare against FILE). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* The parts, in order. The cut points: 00-head ends with the <style> line;
   10-styles is the stylesheet's body; 20-markup runs from </style> through
   the body markup and the opening of the main <script> (the outer IIFE and
   its 'use strict') to just before the BEGIN CONTENT marker; 30-content is
   BEGIN CONTENT through END CONTENT, markers included; 40-helpers is the
   shared code before the first module; each 5N/6N module file starts with
   its `// ===== Module: X =====` banner and runs to the next banner; 90-tail
   is the Game exposure, the boot and the outer IIFE's end; 99-foot closes
   the script, the body and the page. */
const MODULES = ['Rng', 'Dice', 'Cards', 'Tables', 'State', 'Rel', 'Town', 'World', 'Style', 'Api', 'Mock', 'Upgrade', 'Pipeline', 'Storage', 'UI', 'Commands', 'App'];
const PARTS = [].concat(
  ['00-head.html', '10-styles.css', '20-markup.html', '30-content.js', '40-helpers.js'],
  MODULES.map((m, i) => `${50 + i}-${m.toLowerCase()}.js`),
  ['90-tail.js', '99-foot.html']
);

const UNSAFE = "script-src 'unsafe-inline'";

function lineCount(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
  if (buf.length && buf[buf.length - 1] !== 10) n++;
  return n;
}

/* Read src/ and check it holds exactly PARTS: a missing part or a stray
   file is an error, so nothing is silently left out of the page. */
function readParts(root) {
  const dir = path.join(root, 'src');
  if (!fs.existsSync(dir)) throw new Error('no src/ folder in ' + root);
  const have = fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort();
  const missing = PARTS.filter(p => !have.includes(p));
  const extra = have.filter(f => !PARTS.includes(f));
  if (missing.length) throw new Error('src/ is missing: ' + missing.join(', '));
  if (extra.length) throw new Error('src/ has files the build does not know (add them to PARTS in tools/build.cjs): ' + extra.join(', '));
  return PARTS.map(name => ({ name, buf: fs.readFileSync(path.join(dir, name)) }));
}

/* The text of each inline <script> element, as the browser hashes it. */
function inlineScripts(html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

function cspHash(buf) {
  const html = buf.toString('utf8');
  const hashes = inlineScripts(html).map(s => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`);
  const at = html.indexOf(UNSAFE);
  if (at < 0) throw new Error(`--csp-hash: the CSP has no ${UNSAFE} to replace`);
  if (!hashes.length) throw new Error('--csp-hash: no inline scripts found');
  return Buffer.from(html.slice(0, at) + 'script-src ' + hashes.join(' ') + html.slice(at + UNSAFE.length), 'utf8');
}

function build(root, opts = {}) {
  const parts = readParts(root);
  let out = Buffer.concat(parts.map(p => p.buf));
  if (opts.cspHash) out = cspHash(out);
  return { out, parts };
}

/* Which part holds 1-based line n of the build (for the diff summary). */
function partOfLine(parts, n) {
  let start = 1;
  for (const p of parts) {
    const c = lineCount(p.buf);
    if (n < start + c) return `${p.name} line ${n - start + 1}`;
    start += c;
  }
  return 'past the last part';
}

function diffSummary(fresh, disk, parts) {
  const a = fresh.toString('utf8').split('\n');
  const b = disk.toString('utf8').split('\n');
  let first = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first++;
  let ea = a.length - 1, eb = b.length - 1;
  while (ea >= first && eb >= first && a[ea] === b[eb]) { ea--; eb--; }
  const clip = s => (s === undefined ? '(end of file)' : JSON.stringify(s.length > 120 ? s.slice(0, 117) + '...' : s));
  return [
    `index.html differs from a fresh build of src/ (${disk.length} bytes on disk, ${fresh.length} built).`,
    `First difference at line ${first + 1} (${partOfLine(parts, first + 1)}); lines ${first + 1}-${ea + 1} built vs ${first + 1}-${eb + 1} on disk.`,
    `  built:   ${clip(a[first])}`,
    `  on disk: ${clip(b[first])}`,
    'Edit src/ and run node tools/build.cjs, then commit both (index.html is generated from src/).'
  ].join('\n');
}

function parseArgs(argv) {
  const o = { check: false, list: false, cspHash: false, root: path.resolve(__dirname, '..'), out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') o.check = true;
    else if (a === '--list') o.list = true;
    else if (a === '--csp-hash') o.cspHash = true;
    else if (a === '--root') o.root = path.resolve(argv[++i] || '');
    else if (a === '--out') o.out = path.resolve(argv[++i] || '');
    else { console.error(`unknown argument "${a}" (try --check, --list, --csp-hash, --root DIR, --out FILE)`); process.exit(2); }
  }
  return o;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  const target = o.out || path.join(o.root, 'index.html');
  if (o.list) {
    const parts = readParts(o.root);
    let total = 0;
    for (const p of parts) { const c = lineCount(p.buf); total += c; console.log(`${String(c).padStart(6)}  src/${p.name}`); }
    console.log(`${String(total).padStart(6)}  total (${parts.length} parts)`);
    return 0;
  }
  const { out, parts } = build(o.root, { cspHash: o.cspHash });
  if (o.check) {
    const disk = fs.existsSync(target) ? fs.readFileSync(target) : Buffer.alloc(0);
    if (Buffer.compare(out, disk) === 0) { console.log(`index.html matches a fresh build of src/ (${parts.length} parts, ${out.length} bytes).`); return 0; }
    console.error(diffSummary(out, disk, parts));
    return 1;
  }
  fs.writeFileSync(target, out);
  console.log(`built ${path.relative(process.cwd(), target) || target} from ${parts.length} parts (${out.length} bytes)${o.cspHash ? ', CSP script hashes on' : ''}.`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (e) { console.error(String(e.message || e)); process.exitCode = 2; }
}

module.exports = { PARTS, MODULES, build, cspHash, inlineScripts, lineCount };
