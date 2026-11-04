'use strict';
/* Wave 50: the source split. src/ holds index.html cut into parts and
   tools/build.cjs joins them back byte for byte; index.html stays the one
   deliverable and needs no build to play. This file fails the suite when
   src/ and the committed index.html disagree (an edit to one side without
   the other), checks the parts and their order, the --check and --list
   flags on a temp copy, and the off-by-default --csp-hash option.
   Plain Node (one Chromium page for the hashed build).
   Run with: node tests/run.cjs build */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILD = path.join(ROOT, 'tools', 'build.cjs');
const { PARTS, MODULES, build } = require(BUILD);

const tests = [];
const test = (title, fn) => tests.push({ title, fn });
const run = (args, cwd = ROOT) => spawnSync(process.execPath, [BUILD, ...args], { cwd, encoding: 'utf8' });
const tmpDirs = [];
function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-build-'));
  tmpDirs.push(dir);
  fs.cpSync(path.join(ROOT, 'src'), path.join(dir, 'src'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dir, 'index.html'));
  return dir;
}
const read = name => fs.readFileSync(path.join(ROOT, 'src', name), 'utf8');
const sha = s => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const cspLine = html => html.split('\n')[7];

test('a fresh build of src/ equals the committed index.html byte for byte (edit src/, run node tools/build.cjs, commit both)', () => {
  const { out } = build(ROOT);
  const disk = fs.readFileSync(path.join(ROOT, 'index.html'));
  assert.equal(out.length, disk.length, 'same size');
  assert.ok(Buffer.compare(out, disk) === 0, 'same bytes: run node tools/build.cjs --check for where they differ');
});

test('the parts are the expected ones, in order, and each starts and ends where the cut says', () => {
  const expected = ['00-head.html', '10-styles.css', '20-markup.html', '30-content.js', '40-helpers.js',
    '50-rng.js', '51-dice.js', '52-cards.js', '53-tables.js', '54-state.js', '55-rel.js', '56-town.js', '57-world.js',
    '58-style.js', '59-api.js', '60-mock.js', '61-upgrade.js', '62-pipeline.js', '63-storage.js', '64-ui.js',
    '65-commands.js', '66-app.js', '90-tail.js', '99-foot.html'];
  assert.deepEqual(PARTS, expected);
  assert.deepEqual(PARTS.slice().sort(), PARTS, 'file-name order is build order');
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'src')).filter(f => !f.startsWith('.')).sort(), expected, 'src/ holds exactly the parts');
  assert.deepEqual(MODULES, ['Rng', 'Dice', 'Cards', 'Tables', 'State', 'Rel', 'Town', 'World', 'Style', 'Api', 'Mock', 'Upgrade', 'Pipeline', 'Storage', 'UI', 'Commands', 'App']);
  MODULES.forEach((m, i) => {
    const t = read(PARTS[5 + i]);
    assert.ok(t.startsWith(`// ===== Module: ${m} =====\n`), `${PARTS[5 + i]} starts with its banner`);
    assert.equal((t.match(/^\/\/ ===== Module: /gm) || []).length, 1, `${PARTS[5 + i]} holds one module`);
  });
  const head = read('00-head.html');
  assert.ok(head.startsWith('<!doctype html>\n') && head.endsWith('\n<style>\n'), 'the head ends with <style>');
  assert.ok(head.split('\n')[7].startsWith('<meta http-equiv="Content-Security-Policy"'), 'the CSP is on line 8');
  assert.doesNotMatch(read('10-styles.css'), /<\/?style>/, 'the stylesheet body only');
  const markup = read('20-markup.html');
  assert.ok(markup.startsWith('</style>\n</head>\n<body>\n'), 'the markup starts at </style>');
  assert.match(markup, /<script>\n\(function \(\) \{\n'use strict';\n/, 'and holds the opening of the main script');
  const content = read('30-content.js');
  assert.ok(content.startsWith('// ===== BEGIN CONTENT =====\n') && content.endsWith('// ===== END CONTENT =====\n'), 'content is the marked slice, markers included');
  assert.doesNotMatch(read('40-helpers.js'), /===== Module: /);
  const tail = read('90-tail.js');
  assert.ok(tail.startsWith('// ===== Game:') && tail.endsWith('})();\n'), 'the tail is the Game exposure and the outer IIFE end');
  assert.match(tail, /window\.Game = Object\.freeze\(/);
  assert.equal(read('99-foot.html'), '</script>\n</body>\n</html>\n');
});

test('--check exits 0 on the committed tree, and 1 with a short diff summary on a tampered index.html or a tampered part', () => {
  const ok = run(['--check']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /matches a fresh build of src\/ \(24 parts/);

  const dir = tempCopy();
  assert.equal(run(['--check', '--root', dir]).status, 0, 'the copy matches before tampering');
  const idx = path.join(dir, 'index.html');
  const html = fs.readFileSync(idx, 'utf8');
  fs.writeFileSync(idx, html.replace('// ===== Module: Dice =====\n', '// ===== Module: Dice =====\n// a hand edit\n'));
  const bad = run(['--check', '--root', dir]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /index\.html differs from a fresh build of src\//);
  assert.match(bad.stderr, /First difference at line 7276 \(51-dice\.js line 2\)/, bad.stderr);
  assert.match(bad.stderr, /on disk: "\/\/ a hand edit"/);
  assert.ok(bad.stderr.split('\n').length <= 8, 'short');

  fs.writeFileSync(idx, html);
  const part = path.join(dir, 'src', '58-style.js');
  fs.appendFileSync(part, '// an edit to src/ without a rebuild\n');
  assert.equal(run(['--check', '--root', dir]).status, 1, 'an edit to src/ alone fails too');
  assert.equal(run(['--root', dir]).status, 0, 'a build fixes it');
  assert.equal(run(['--check', '--root', dir]).status, 0);
  assert.match(fs.readFileSync(idx, 'utf8'), /\/\/ an edit to src\/ without a rebuild\n\/\/ ===== Module: Api =====\n/, 'the edit lands where its part says');

  fs.writeFileSync(path.join(dir, 'src', '67-stray.js'), '// not in PARTS\n');
  const stray = run(['--check', '--root', dir]);
  assert.equal(stray.status, 2);
  assert.match(stray.stderr, /files the build does not know.*67-stray\.js/);
});

test('--list prints the parts in order with their line counts and builds nothing', () => {
  const before = fs.statSync(path.join(ROOT, 'index.html')).mtimeMs;
  const r = run(['--list']);
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.trim().split('\n').map(l => l.trim().split(/\s+/));
  assert.deepEqual(rows.slice(0, -1).map(x => x[1]), PARTS.map(p => 'src/' + p));
  const lines = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n').length - 1;
  assert.equal(rows.slice(0, -1).reduce((a, x) => a + +x[0], 0), lines, 'the counts add up to index.html');
  assert.deepEqual(rows[rows.length - 1].slice(0, 2), [String(lines), 'total']);
  assert.equal(fs.statSync(path.join(ROOT, 'index.html')).mtimeMs, before);
});

test('--csp-hash (off by default) swaps script-src \'unsafe-inline\' for the sha256 of both inline scripts and changes nothing else', () => {
  const committed = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(cspLine(committed), /script-src 'unsafe-inline';/, 'the committed page keeps unsafe-inline');
  const dir = tempCopy();
  const out = path.join(dir, 'hashed.html');
  const r = run(['--csp-hash', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(out, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(scripts.length, 2, 'two inline scripts');
  const csp = cspLine(html);
  assert.ok(csp.includes(`script-src ${sha(scripts[0])} ${sha(scripts[1])};`), csp.slice(0, 300));
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
  assert.match(csp, /style-src 'unsafe-inline';/, 'styles unchanged');
  const a = html.split('\n'), b = committed.split('\n');
  assert.equal(a.length, b.length);
  assert.deepEqual(a.map((l, i) => (l === b[i] ? null : i + 1)).filter(Boolean), [8], 'only the CSP line differs');
  assert.equal(run(['--check', '--csp-hash', '--out', out]).status, 0, '--check honours the flag');
  assert.equal(run(['--check', '--out', out]).status, 1, 'and a hashed page is not the default build');
});

test('the --csp-hash page boots in Chromium, and a hand edit to its script is blocked by its own CSP (why it is off by default)', async () => {
  const { chromium } = require('playwright');
  const dir = tempCopy();
  const out = path.join(dir, 'hashed.html');
  assert.equal(run(['--csp-hash', '--out', out]).status, 0);
  const tampered = path.join(dir, 'tampered.html');
  fs.writeFileSync(tampered, fs.readFileSync(out, 'utf8').replace("// ===== Module: Rng =====\n", "// ===== Module: Rng =====\n// hand edit\n"));
  const browser = await chromium.launch();
  try {
    const visit = async file => {
      const context = await browser.newContext();
      await context.route('**/*', route => (/^(file|blob|data):/.test(route.request().url()) ? route.continue() : route.abort()));
      const page = await context.newPage();
      const errors = [], csp = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
      await page.goto('file://' + file);
      await page.waitForTimeout(300);
      const game = await page.evaluate(() => !!(window.Game && window.Game.App && window.Game.BUILD));
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await context.close();
      return { game, theme, errors, csp };
    };
    const good = await visit(out);
    assert.equal(good.game, true, 'Game is up');
    assert.deepEqual(good.errors, []);
    assert.deepEqual(good.csp.filter(t => /script/i.test(t)), [], 'no script blocked');
    const dead = await visit(tampered);
    assert.equal(dead.game, false, 'the edited script never runs');
    assert.ok(dead.csp.some(t => /script/i.test(t)), 'only a console error says why');
  } finally {
    await browser.close();
  }
});

(async () => {
  const only = process.env.TEST_FILTER ? new RegExp(process.env.TEST_FILTER, 'i') : null;
  let passed = 0, failed = 0;
  console.log('build');
  for (const t of tests) {
    if (only && !only.test(t.title)) continue;
    const t0 = Date.now();
    try {
      await t.fn();
      passed++;
      console.log(`  PASS  ${t.title} (${Date.now() - t0} ms)`);
    } catch (err) {
      failed++;
      console.log(`  FAIL  ${t.title}\n        ${String((err && err.stack) || err).split('\n').slice(0, 8).join('\n        ')}`);
    }
  }
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  console.log(`RESULT build: passed=${passed} failed=${failed}`);
  process.exitCode = failed ? 1 : 0;
})();
