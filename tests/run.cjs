#!/usr/bin/env node
'use strict';
/* Runs every tests/*.test.cjs file in turn, prints each test's PASS/FAIL line,
   and exits 1 if anything failed.  Usage: node tests/run.cjs [filter]
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
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  const m = /RESULT .*: passed=(\d+) failed=(\d+)/.exec(r.stdout || '');
  if (m) { passed += +m[1]; failed += +m[2]; }
  if (r.status !== 0 || !m) { badFiles.push(f); if (!m) failed += 1; }
}
console.log(`\n${passed} passed, ${failed} failed across ${files.length} files in ${((Date.now() - t0) / 1000).toFixed(1)} s` + (badFiles.length ? ` (failing: ${badFiles.join(', ')})` : ''));
process.exit(badFiles.length ? 1 : 0);
