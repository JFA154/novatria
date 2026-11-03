#!/usr/bin/env node
'use strict';
/* Runs tests/validate-town.cjs (the content check on the town inlined in
   index.html), then every tests/*.test.cjs file, prints each test's
   PASS/FAIL line, and exits 1 if anything failed.
   Usage: node tests/run.cjs [filter] [-j N] [--shard i/n]
   - filter narrows to test files whose name contains it.
   - Wave 36: -j N runs N files at once (default min(3, CPUs); -j 1 is the
     old serial run, each file's output streamed as it comes). With more
     than one at once, each file's block prints whole as soon as it ends,
     and every 60 s a heartbeat line names the files still running, so a
     hung file shows up long before CI's timeout.
   - Wave 36: --shard i/n (1-based) runs only the i-th of n shares of the
     files, balanced by WEIGHTS (rough seconds for the slow files, measured
     serially) so CI's shards end at about the same time. The town check
     runs in shard 1 only. Every file is in exactly one shard.
   - Wave 36: --list prints the files the other arguments pick, and runs nothing.
   A table of each file's time, slowest first, ends the run. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const dir = __dirname;
const root = path.resolve(dir, '..');

/* Wave 36: rough seconds per file, from a full run at -j 3 on a busy 4-CPU
   box (Nov 2026; serially ui-fixes is about 193 s, pipeline 59, transport-
   fixes 41, world 37). Only for balancing shards and for starting the slow
   files first, so only the proportions matter; a file not listed counts
   DEFAULT_WEIGHT. Refresh from the timing table now and then. */
const WEIGHTS = {
  'ui-fixes.test.cjs': 231, 'pipeline.test.cjs': 80, 'relationships-examples.test.cjs': 68, 'transport-fixes.test.cjs': 54,
  'wave4-fixes.test.cjs': 49, 'shell.test.cjs': 47, 'world.test.cjs': 43, 'wave5-fixes.test.cjs': 43,
  'wave11-cards.test.cjs': 39, 'wave6-fixes.test.cjs': 38, 'wave18-betting.test.cjs': 36, 'content.test.cjs': 34,
  'wave14-holdem-fixes.test.cjs': 34, 'wave2-fixes.test.cjs': 34, 'wave3-fixes.test.cjs': 33, 'upgrade.test.cjs': 33,
  'state.test.cjs': 31, 'playtest.test.cjs': 30, 'wave16-undo.test.cjs': 30, 'integration.test.cjs': 30,
  'wave29-rel-hold.test.cjs': 29, 'relationships.test.cjs': 29, 'prompts-fixes.test.cjs': 28, 'wave19-betting-fixes.test.cjs': 28,
  'api.test.cjs': 28, 'acceptance.test.cjs': 28, 'mobile.test.cjs': 25, 'wave12-cards.test.cjs': 23,
  'wave20-table-words.test.cjs': 23, 'wave30-rel-people.test.cjs': 23, 'engine-state-fixes.test.cjs': 22, 'wave27-rel-engine.test.cjs': 22,
  'wave13-holdem.test.cjs': 22, 'wave10-cards.test.cjs': 21, 'engine-world-fixes.test.cjs': 21, 'wave15-table-polish.test.cjs': 21,
  'map.test.cjs': 18, 'wave34-romance-difficulty.test.cjs': 16
};
const DEFAULT_WEIGHT = 10;
const weight = f => WEIGHTS[f] || DEFAULT_WEIGHT;

function parseArgs(argv) {
  const o = { filter: '', jobs: Math.max(1, Math.min(3, os.cpus().length || 1)), shard: null, list: false };
  let haveFilter = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let m;
    if (a === '--list') o.list = true;
    else if (a === '-j' || a === '--jobs') o.jobs = +argv[++i];
    else if ((m = /^(?:-j|--jobs=)(\d+)$/.exec(a))) o.jobs = +m[1];
    else if (a === '--shard' || (m = /^--shard=(.*)$/.exec(a))) {
      const v = m ? m[1] : argv[++i];
      const s = /^(\d+)\/(\d+)$/.exec(v || '');
      if (!s || +s[1] < 1 || +s[1] > +s[2]) { console.error(`--shard wants i/n with 1 <= i <= n, not "${v}"`); process.exit(2); }
      o.shard = { i: +s[1], n: +s[2] };
    } else if (!haveFilter) { o.filter = a; haveFilter = true; }
  }
  if (!(o.jobs >= 1) || !Number.isInteger(o.jobs)) { console.error('-j wants a whole number, 1 or more'); process.exit(2); }
  return o;
}

/* The files of shard i of n: heaviest first, each to the share with the
   least weight so far (ties to the lower share), in name order among equals. */
function shardOf(files, i, n) {
  const load = new Array(n).fill(0);
  const mine = [];
  for (const f of files.slice().sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1))) {
    let k = 0;
    for (let j = 1; j < n; j++) if (load[j] < load[k]) k = j;
    load[k] += weight(f);
    if (k === i - 1) mine.push(f);
  }
  return mine.sort();
}

const opts = parseArgs(process.argv.slice(2));
const filter = opts.filter;
let files = fs.readdirSync(dir).filter(f => f.endsWith('.test.cjs') && f.includes(filter)).sort();
if (opts.shard) files = shardOf(files, opts.shard.i, opts.shard.n);
if (opts.list) {
  for (const f of files) console.log(f);
  process.exit(0);
}
let passed = 0;
let failed = 0;
const badFiles = [];
const timings = [];
const t0 = Date.now();
const secs = ms => (ms / 1000).toFixed(1);

const runValidate = ('validate-town.cjs'.includes(filter) || !filter) && (!opts.shard || opts.shard.i === 1);
if (opts.shard) console.log(`shard ${opts.shard.i}/${opts.shard.n}: ${files.length} files (${files.reduce((a, f) => a + weight(f), 0)} s by weight), -j ${opts.jobs}`);
if (runValidate) {
  console.log('\n=== validate-town.cjs ===');
  const v0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, 'validate-town.cjs')], { cwd: root, encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  timings.push(['validate-town.cjs', Date.now() - v0]);
  if (r.status === 0) { passed += 1; console.log('  PASS  town content in index.html validates'); }
  else { failed += 1; badFiles.push('validate-town.cjs'); console.log('  FAIL  town content in index.html does not validate'); }
}

const children = new Set();
function runFile(f, stream) {
  return new Promise(resolve => {
    const s0 = Date.now();
    if (stream) console.log(`\n=== ${f} ===`);
    const child = spawn(process.execPath, [path.join(dir, f)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => { out += d; if (stream) process.stdout.write(d); });
    child.stderr.on('data', d => { err += d; if (stream) process.stderr.write(d); });
    child.on('error', e => { err += String(e && e.stack || e) + '\n'; });
    child.on('close', status => {
      children.delete(child);
      resolve({ f, out, err, status, ms: Date.now() - s0 });
    });
  });
}
function tally(r, stream) {
  if (!stream) {
    console.log(`\n=== ${r.f} === (${secs(r.ms)} s)`);
    process.stdout.write(r.out);
    process.stderr.write(r.err);
  }
  timings.push([r.f, r.ms]);
  const m = /RESULT .*: passed=(\d+) failed=(\d+)/.exec(r.out || '');
  if (m) { passed += +m[1]; failed += +m[2]; }
  if (r.status !== 0 || !m) { badFiles.push(r.f); if (!m) failed += 1; }
}

async function main() {
  const stream = opts.jobs === 1;
  if (stream) {
    for (const f of files) tally(await runFile(f, true), true);
    return;
  }
  // Slowest first, so the long files do not start last.
  const queue = files.slice().sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : 1));
  const running = new Map();
  const beat = setInterval(() => {
    const now = Date.now();
    const list = [...running].map(([f, s]) => `${f} ${secs(now - s)} s`).join(', ');
    console.log(`... ${secs(now - t0)} s in, ${queue.length} waiting, still running: ${list || 'none'}`);
  }, 60000);
  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      running.set(f, Date.now());
      const r = await runFile(f, false);
      running.delete(f);
      tally(r, false);
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(opts.jobs, files.length) }, worker)); }
  finally { clearInterval(beat); }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of children) c.kill(sig); process.exit(130); });

main().then(() => {
  if (timings.length) {
    console.log('\nTime per file, slowest first:');
    for (const [f, ms] of timings.slice().sort((a, b) => b[1] - a[1])) console.log(`  ${secs(ms).padStart(7)} s  ${f}`);
  }
  const total = files.length + (runValidate ? 1 : 0);
  console.log(`\n${passed} passed, ${failed} failed across ${total} files in ${secs(Date.now() - t0)} s` + (badFiles.length ? ` (failing: ${badFiles.join(', ')})` : ''));
  process.exit(badFiles.length ? 1 : 0);
}, e => { console.error(e); process.exit(1); });
