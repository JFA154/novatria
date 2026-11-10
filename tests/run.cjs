#!/usr/bin/env node
'use strict';
/* Runs tests/validate-pack.cjs (the page's own pack validator on the
   built-in pack inlined in index.html, profile strict; wave 37, Creator
   Mode) and tests/guide-doc.cjs --check (the guide's field list), then
   every tests/*.test.cjs file in turn, prints each test's
   PASS/FAIL line, and exits 1 if anything failed.
   Usage: node tests/run.cjs [filter]
   (a filter narrows to test files whose name contains it). */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const root = path.resolve(dir, '..');
const filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs') && f.includes(filter)).sort();
let passed = 0;
let failed = 0;
const badFiles = [];
const t0 = Date.now();

if ('validate-pack.cjs'.includes(filter) || !filter) {
  console.log('\n=== validate-pack.cjs ===');
  const r = spawnSync(process.execPath, [path.join(dir, 'validate-pack.cjs')], { cwd: root, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status === 0) { passed += 1; console.log('  PASS  the built-in pack in index.html validates'); }
  else { failed += 1; badFiles.push('validate-pack.cjs'); console.log('  FAIL  the built-in pack in index.html does not validate'); }
}
/* Wave 37, Creator Mode: docs/CREATOR_GUIDE.md's field list is generated
   from Pack.SCHEMA (tests/guide-doc.cjs), as docs/CAST.md is from the pack
   (tests/cast-doc.cjs --check, which the content suite runs); it runs with
   no filter and with the filters guide-doc and content (the docs checks). */
const guideCheck = !filter || 'guide-doc.cjs'.includes(filter) || filter === 'content';
if (guideCheck) {
  console.log('\n=== guide-doc.cjs --check ===');
  const r = spawnSync(process.execPath, [path.join(dir, 'guide-doc.cjs'), '--check'], { cwd: root, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  if (r.status === 0) { passed += 1; console.log('  PASS  docs/CREATOR_GUIDE.md\'s field list matches Pack.SCHEMA'); }
  else { failed += 1; badFiles.push('guide-doc.cjs'); console.log('  FAIL  docs/CREATOR_GUIDE.md\'s field list is out of date: run node tests/guide-doc.cjs'); }
}

for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  const m = /RESULT .*: passed=(\d+) failed=(\d+)/.exec(r.stdout || '');
  if (m) { passed += +m[1]; failed += +m[2]; }
  if (r.status !== 0 || !m) { badFiles.push(f); if (!m) failed += 1; }
}
const total = files.length + (badFiles.includes('validate-pack.cjs') || !filter || 'validate-pack.cjs'.includes(filter) ? 1 : 0) + (guideCheck ? 1 : 0);
console.log(`\n${passed} passed, ${failed} failed across ${total} files in ${((Date.now() - t0) / 1000).toFixed(1)} s` + (badFiles.length ? ` (failing: ${badFiles.join(', ')})` : ''));
process.exit(badFiles.length ? 1 : 0);
