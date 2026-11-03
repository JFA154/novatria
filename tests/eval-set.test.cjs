'use strict';
/* Wave 37: the labelled eval's set (tests/eval/labelled.jsonl) passes the
   script's own offline check (node tests/eval-classify.cjs --dry): every row
   reads, every label is a known event word with a known outcome, every
   romantic label is the parser's, every id is in the cast, and the set is
   as big as the design asks; the authored starters cover the vocabulary;
   the script refuses an empty, an undersized or a broken set (exit 2) and
   a live run without a key; it prices with the page's own table. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync, spawn } = require('child_process');
const { suite } = require('./helpers.cjs');

const s = suite('eval-set');
const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(__dirname, 'eval-classify.cjs');
const SET = path.join(__dirname, 'eval', 'labelled.jsonl');
const run = (args, env) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { ANTHROPIC_API_KEY: '' }, env || {}), maxBuffer: 64 * 1024 * 1024 });
  const line = (r.stdout || '').split('\n').find(l => l.startsWith('DRY '));
  return { status: r.status, out: r.stdout || '', dry: line ? JSON.parse(line.slice(4)) : null };
};
const tmp = (name, lines) => { const f = path.join(os.tmpdir(), `eval-set-${process.pid}-${name}.jsonl`); fs.writeFileSync(f, lines.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n') + '\n'); return f; };
const rows = () => fs.readFileSync(SET, 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

s.test('the set passes --dry: 150 bookkeeper turns or more, 50 romantic lines, 40 aimed at minors, exit 0', async () => {
  const r = run(['--dry', '--json']);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.dry && r.dry.ok, r.out);
  assert.deepEqual(r.dry.errors, []);
  const t = r.dry.tally;
  assert.ok(t.bookkeeper >= 150, `bookkeeper turns ${t.bookkeeper}`);
  assert.ok(t.romantic >= 50, `romantic lines ${t.romantic}`);
  assert.ok(t.minorRomantic >= 40, `romantic lines aimed at minors ${t.minorRomantic}`);
  assert.ok(t.minorFalseFriends >= 10, `false friends aimed at minors ${t.minorFalseFriends}`);
  assert.ok(t.none >= 5, 'turns with no event');
  assert.match(r.out, /labels: .*insulted \d+/);
  assert.match(r.out, /neighbourhoods: insulted\/humiliated\/crossed\/pried \d+/);
  assert.match(r.out, /SET VALID/);
  // The page's prices (Api.costOf on the Thrifty model): a run of this size is cents, not the old $1/$5 guess.
  assert.ok(typeof r.dry.estimate === 'number' && r.dry.estimate > 0 && r.dry.estimate < 0.5, `estimate ${r.dry.estimate}`);
});

s.test('the authored starters cover every word the bookkeeper may send four times or more, the hard neighbours, Say and Do, euphemism and false friends', async () => {
  const r = run(['--dry', '--json']);
  const t = r.dry.tally;
  for (const w of r.dry.wire) assert.ok((t.labels[w] || 0) >= 4, `${w}: ${t.labels[w] || 0} labels`);
  for (const w of ['threatened', 'gift', 'bribed', 'flirted', 'spent_time', 'hit']) assert.ok((t.labels[w] || 0) >= 3, `the engine's ${w}: ${t.labels[w] || 0}`);
  for (const n of t.neighbourhoods) assert.ok(n.labels >= 4, `${n.words}: ${n.labels}`);
  for (const o of ['kept', 'refused', 'knows', 'set_aside', 'engine', 'humiliated', 'confided', 'complimented']) assert.ok(t.outcomes[o] > 0, `outcome ${o}`);
  const all = rows();
  assert.equal(all.filter(x => x.source === 'authored').length, all.length, 'every row today is an authored starter');
  const tagged = tag => all.filter(x => (x.tags || []).includes(tag)).length;
  for (const tag of ['do', 'euphemism', 'false_friend', 'minor', 'crowd', 'joke']) assert.ok(tagged(tag) > 0, tag);
  for (const pair of ['insulted/threatened', 'gift/bribed', 'flirted/spent_time', 'kept_word/gift', 'badmouthed/insulted', 'did_favour/spent_time']) assert.ok(tagged(`hard:${pair}`) > 0, pair);
  assert.ok(all.some(x => x.mode === 'say') && all.some(x => x.mode === 'do'));
  // The packets are the game's own: the bookkeeper's and the parser's headers.
  for (const x of all) assert.match(x.packet, /^TURN \d+ · DAY 3/, x.id);
  for (const x of all.filter(x => x.parse)) assert.match(x.parse, /^PLAYER INPUT: /, x.id);
  // "Thanks, sweetheart" to Kaylee is a false friend, null; every advance aimed at a minor is set aside by the minor rule.
  const kay = all.find(x => x.target === 'npc_kaylee' && x.input === 'Thanks, sweetheart.');
  assert.ok(kay && kay.romantic === null, 'thanks, sweetheart');
  for (const x of all.filter(x => x.parse && x.romantic && ['npc_kaylee', 'npc_micah', 'npc_austin'].includes(x.target))) {
    assert.deepEqual(x.labels.map(l => [l.npcId, l.outcome]), [[x.target, 'set_aside']], x.id);
  }
});

s.test('an empty, undersized or broken set exits 2; a live run without a key exits 2', async () => {
  const empty = tmp('empty', []);
  assert.equal(run(['--dry', empty]).status, 2, 'empty');
  const small = rows().slice(0, 20);
  const r1 = run(['--dry', '--json', tmp('small', small)]);
  assert.equal(r1.status, 2);
  assert.ok(r1.dry.errors.some(e => /bookkeeper turns .*at least 150/.test(e)), r1.out);
  assert.ok(r1.dry.errors.some(e => /aimed at someone under 18: at least 40/.test(e)), r1.out);
  const full = rows();
  const bad = full.slice();
  bad[0] = Object.assign({}, bad[0], { labels: [{ npcId: 'npc_nobody', event: 'insulted' }] });
  bad[1] = Object.assign({}, bad[1], { labels: [{ npcId: 'npc_royce', event: 'insult' }] });
  const ri = bad.findIndex(x => x.parse);
  bad[ri] = Object.assign({}, bad[ri], { romantic: true });
  bad[2] = Object.assign({}, bad[2], { labels: [{ npcId: 'npc_royce', event: 'insulted', outcome: 'maybe' }] });
  bad.push('{ not json');
  const r2 = run(['--dry', '--json', tmp('bad', bad)]);
  assert.equal(r2.status, 2);
  const errs = r2.dry.errors.join('\n');
  assert.match(errs, /npc_nobody" is nobody in the cast/);
  assert.match(errs, /"insult" is no event word/);
  assert.match(errs, /romantic must be "flirt", "more" or null/);
  assert.match(errs, /outcome "maybe"/);
  assert.match(errs, /is not JSON/);
  const live = run([]);
  assert.equal(live.status, 2);
  assert.match(live.out, /set ANTHROPIC_API_KEY/);
  for (const f of [empty, 'small', 'bad'].map(x => (x === empty ? x : path.join(os.tmpdir(), `eval-set-${process.pid}-${x}.jsonl`)))) fs.unlinkSync(f);
});

/* A live run against a local stand-in for the API (EVAL_ENDPOINT; the key is
   a dummy): right answers pass and exit 0, and --record writes the dated
   summary; silence (no events, no romantic flag) is below the bar and exits
   1; a romance event sent for a minor fails the bar on its own. The cost is
   the page's (Api.costOf on the Thrifty model), not a guess. */
const WIRE = ['insulted', 'complimented', 'pried', 'apologised', 'confided', 'they_confided', 'kept_word', 'came_clean', 'lied_caught', 'betrayed_confidence', 'exposed', 'did_favour', 'they_helped', 'defended', 'informed_on', 'crossed', 'rebuffed', 'noted', 'learned_secret', 'caught_you_at', 'stole_from', 'cheated', 'badmouthed', 'vouched_for'];
function standIn(mode) {
  const set = rows();
  const byPacket = new Map();
  const byParse = new Map();
  for (const x of set) { if (x.packet && !byPacket.has(x.packet)) byPacket.set(x.packet, x); if (x.parse) byParse.set(x.parse, x); }
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const b = JSON.parse(body);
      const user = b.messages[0].content;
      const book = !!(b.output_config && b.output_config.format && b.output_config.format.schema.properties.socialEvents);
      let reply;
      if (book) {
        const row = byPacket.get(user) || { labels: [] };
        const lines = mode === 'silent' ? [] : row.labels.filter(l => WIRE.includes(l.event) && !['set_aside', 'refused', 'knows'].includes(l.outcome)).map(l => `${l.npcId} ${l.event}${l.aboutId ? ' ' + l.aboutId : ''}${l.private ? ' private' : ''}: words`);
        if (mode === 'minor' && row.target === 'npc_kaylee' && row.romantic) lines.push('npc_kaylee flirted: flirted with me');
        reply = { socialEvents: lines };
      } else {
        const row = byParse.get(user);
        reply = { actionType: 'talk', romantic: mode === 'silent' ? null : row ? row.romantic : null };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 1000, output_tokens: 50 } }));
    });
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}
const live = (args, env) => new Promise(ok => {
  const c = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env: Object.assign({}, process.env, { ANTHROPIC_API_KEY: 'sk-test-dummy' }, env) });
  let out = '';
  c.stdout.on('data', d => { out += d; });
  c.stderr.on('data', d => { out += d; });
  c.on('close', status => ok({ status, out }));
});

s.test('a live run against a stand-in: right answers pass (exit 0) and --record writes the summary; silence exits 1; a romance event for a minor fails the bar', async () => {
  const notes = path.join(os.tmpdir(), `eval-set-${process.pid}-notes.md`);
  fs.writeFileSync(notes, '# notes\n');
  const calls = rows().filter(x => x.packet).length + rows().filter(x => x.parse).length;
  for (const [mode, want] of [['perfect', 0], ['silent', 1], ['minor', 1]]) {
    const server = await standIn(mode);
    const url = `http://127.0.0.1:${server.address().port}/v1/messages`;
    const r = await live(mode === 'perfect' ? ['--record'] : [], { EVAL_ENDPOINT: url, EVAL_NOTES: notes });
    server.close();
    assert.equal(r.status, want, `${mode}: ${r.out.slice(-1500)}`);
    if (mode === 'perfect') {
      assert.match(r.out, /exact \d+ \(100\.0% of emitted/);
      assert.match(r.out, /invented 0 /);
      assert.match(r.out, /romantic recall, lines aimed at minors \(42\): parser 100\.0%/);
      assert.match(r.out, /EVAL PASSED/);
      // 1000 tokens in and 50 out a call at the page's Haiku prices ($0.10 / $0.50 a million): $0.000125 a call (the old $1 / $5 guess made it $0.00125).
      assert.ok(r.out.includes(`$${(calls * 0.000125).toFixed(4)} at the page's prices`), r.out.slice(-800));
      const text = fs.readFileSync(notes, 'utf8');
      assert.match(text, /## Labelled eval run \(\d{4}-\d{2}-\d{2}\)/);
      assert.match(text, /\*\*Passed\*\* the recommended bar/);
    }
    if (mode === 'silent') {
      assert.match(r.out, /BELOW: exact accuracy/);
      assert.match(r.out, /BELOW: romantic recall for minors/);
      assert.match(r.out, /EVAL BELOW THE RECOMMENDED BAR/);
    }
    if (mode === 'minor') {
      assert.match(r.out, /a minor-related event for npc_kaylee: flirted/);
      assert.match(r.out, /BELOW: minor-related events for a minor: \d+ \(bar 0\)/);
      assert.doesNotMatch(r.out, /BELOW: exact accuracy/);
    }
  }
  assert.equal((fs.readFileSync(notes, 'utf8').match(/## Labelled eval run/g) || []).length, 1, '--record only on the run that asked');
  fs.unlinkSync(notes);
});

s.run();
