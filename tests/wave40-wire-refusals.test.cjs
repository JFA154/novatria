'use strict';
/* Wave 40 (3 Nov 2026): every refusal and downgrade in Rel.wireEvent, the
   bookkeeper's events checked against what the engine knows (the
   integration plan's 5.4; design section 3.2). Table-driven: one row per
   reason, each staging the state that triggers it on a copy of a fresh
   game (Rel.wireEvent is pure: it reads the person, the turn and the
   state it is given) and naming the reason it gives and what the event
   comes to: refused, downgraded to another event, only "knows you" a
   little, scaled or reshaped. A reason added to wireEvent with no row here
   fails the last test, which reads the reasons out of the source. Mock
   mode. Run with: node tests/run.cjs wave40-wire */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave40-wire-refusals');
const ROOT = path.resolve(__dirname, '..');

/* expect: { refuse } (refused, with that reason), { down, why } (the event
   it comes down to and why), { knows, why } (only knows-you), or { event,
   why?, ... } (accepted as that event; extra keys are checked as given).
   why may be a RegExp. */
const ROWS = [
  ['an event the game does not know', { refuse: '"kissed_hand" is no event the game knows' }],
  ['an engine-only event from the bookkeeper', { refuse: "hit is the engine's to record, never the bookkeeper's" }],
  ['a late flirt, the romance step aimed at nobody (accepted as the engine\'s)', { event: 'flirted', why: 'the bookkeeper named who the flirt was aimed at', late: true }],
  ['a late flirt at someone not here', { refuse: 'the flirt was aimed at nobody here the engine can take it for' }],
  ['a flirt the parse already saw', { refuse: 'the engine records the flirt (the parse saw it)' }],
  ['a flirt the parse did not see', { down: 'complimented', why: 'a flirt the parse did not see is a compliment' }],
  ['kept_word with no confidence a day old', { down: 'confided', why: 'no confidence of theirs a day old to keep' }],
  ['kept_word with no asker here', { down: 'confided', why: 'nobody named who asked is here' }],
  ['kept_word twice in three days', { down: 'confided', why: 'a kept word from them in the last three days' }],
  ['kept_word with all three', { event: 'kept_word', why: undefined }],
  ['came_clean with no lie on record', { knows: 3, why: 'no lie to them on record to come clean about' }],
  ['lied_caught with no lie and no claim', { refuse: "no lie to them and no claim of the player's on record" }],
  ['lied_caught on a lie already owned up to (a quarter)', { event: 'lied_caught', scale: 0.25 }],
  ['exposed with nothing held over them', { knows: 2, why: 'the player holds nothing over them to tell' }],
  ['exposed about the same person again', { event: 'exposed', why: 'told them about the same person again', d: { w: 0, t: -8 } }],
  ['exposed to someone who likes them at 60', { event: 'exposed', why: 'the messenger: they like them too well', d: { w: -8, t: 0 } }],
  ['badmouthed with nobody named', { knows: 2, why: 'nobody named to say it about' }],
  ['badmouthed to someone who likes them at 40', { event: 'badmouthed', why: 'they like them too well to hear it', d: { w: -5 } }],
  ['vouched_for twice in a day', { event: 'vouched_for', why: 'once a day about the same person' }],
  ['vouched_for past what words will do', { event: 'vouched_for', why: "the player's words about them have moved them as far as words will" }],
  ['betrayed_confidence with nothing confided', { down: 'crossed', why: 'they confided nothing to pass on' }],
  ['defended against someone not here', { down: 'complimented', why: 'whoever they were defended against is not here' }],
  ['defended against someone the player went for', { down: 'complimented', why: 'the player went for Colt Purvis first' }],
  ['an apology that did not land', { knows: 2, why: 'the apology did not land' }],
  ['rebuffed with no advance of theirs', { refuse: 'they made no advance to turn down' }],
  ['learned_secret never in the packet', { refuse: "their secret was never in the narrator's packet" }],
  ['learned_secret the narration does not show', { refuse: /^the narration shows 0 of their 3 keys \(it takes 2\)$/ }],
  ['learned_secret already held', { knows: 2, why: 'the player already holds that' }],
  ['caught_you_at twice in a turn', { refuse: 'the engine already has it this turn' }],
  ['caught_you_at with nothing to catch', { refuse: 'nothing was done this turn they could catch the player at (never a fight: it is a memory and news already)' }],
  ['caught_you_at with two others there', { refuse: 'more than one other person was there: no secret to hold' }],
  ['stole_from with no theft on record', { refuse: 'no theft from them on record' }],
  ['cheated with no deal on record', { refuse: 'no deal with them on record' }]
];

s.test('every refusal and downgrade in Rel.wireEvent, one staged row each: the reason and what the event comes to', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const got = await page.evaluate(names => {
    const G = Game, R = G.Rel;
    const base = JSON.stringify(G.state);
    const town = G.State.town;
    const day = 6;
    const turn = 40;
    const J = 'npc_jodie', D = 'npc_dewayne', MV = 'npc_mavis', H = 'npc_hollis', DA = 'npc_darlene', CO = 'npc_colt';
    const mem = (event, d, ago, more) => Object.assign({ event, text: `${event} memory`, weight: 2, d: Object.assign({ w: 0, t: 0, f: 0, k: 0, s: 0 }, d), day: day - ago, turn: turn - 1, key: `m${event}-${ago}` }, more || {});
    const held = (s, over, more) => { s.leverage = (s.leverage || []).concat([Object.assign({ id: `lev_${over.slice(4)}_t`, holder: 'player', over, about: { kind: 'secret', npcId: over }, text: 'something the player knows', weight: 2, aware: true, playerKnows: true, status: 'held', since: { day: 2, turn: 3 }, log: [], uses: [], knownBy: [], mattersTo: [] }, more || {})]); };
    const tie = (s, a, b, w, log) => { s.ties = s.ties || {}; s.ties[`${a}>${b}`] = { from: a, to: b, kind: 'other', base: { w, t: 0 }, log: log || [], known: true }; };
    /* Each row: [who, ev, turn facts, stage(s, n)]. */
    const T = {
      'an event the game does not know': [J, { event: 'kissed_hand' }, {}],
      'an engine-only event from the bookkeeper': [J, { event: 'hit' }, {}],
      'a late flirt, the romance step aimed at nobody (accepted as the engine\'s)': [J, { event: 'flirted', text: 'leaned in close' }, { romantic: 'flirt', aimed: [], present: [J] }],
      'a late flirt at someone not here': [J, { event: 'flirted' }, { romantic: 'flirt', aimed: [], present: [] }],
      'a flirt the parse already saw': [J, { event: 'flirted' }, { romantic: 'flirt', aimed: [J], present: [J] }],
      'a flirt the parse did not see': [J, { event: 'flirted' }, { present: [J] }],
      'kept_word with no confidence a day old': [J, { event: 'kept_word', text: 'kept quiet when Darlene Pittman asked' }, { present: [J, DA] }],
      'kept_word with no asker here': [J, { event: 'kept_word', text: 'kept quiet when Darlene Pittman asked' }, { present: [J] }, (s, n) => { n.memories.push(mem('they_confided', { k: 3 }, 2)); }],
      'kept_word twice in three days': [J, { event: 'kept_word', text: 'kept quiet when Darlene Pittman asked' }, { present: [J, DA] }, (s, n) => { n.memories.push(mem('they_confided', { k: 3 }, 2), mem('kept_word', { w: 5 }, 1)); }],
      'kept_word with all three': [J, { event: 'kept_word', text: 'kept quiet when Darlene Pittman asked' }, { present: [J, DA] }, (s, n) => { n.memories.push(mem('they_confided', { k: 3 }, 2)); }],
      'came_clean with no lie on record': [J, { event: 'came_clean' }, {}],
      'lied_caught with no lie and no claim': [J, { event: 'lied_caught' }, {}],
      'lied_caught on a lie already owned up to (a quarter)': [J, { event: 'lied_caught' }, {}, (s, n) => { n.rel.asks = [{ act: 'deceive', ok: true, day: 4, turn: 30, confessed: true, about: 'a lie' }]; }],
      'exposed with nothing held over them': [D, { event: 'exposed', aboutId: MV }, { present: [D] }],
      'exposed about the same person again': [D, { event: 'exposed', aboutId: MV }, { present: [D] }, (s, n) => { held(s, MV); n.memories.push(mem('exposed', { t: 8 }, 1, { about: MV })); }],
      'exposed to someone who likes them at 60': [D, { event: 'exposed', aboutId: MV }, { present: [D] }, s => { held(s, MV); tie(s, D, MV, 70); }],
      'badmouthed with nobody named': [D, { event: 'badmouthed' }, { present: [D] }],
      'badmouthed to someone who likes them at 40': [D, { event: 'badmouthed', aboutId: MV }, { present: [D] }, s => { tie(s, D, MV, 45); }],
      'vouched_for twice in a day': [D, { event: 'vouched_for', aboutId: MV }, { present: [D], targets: [D], actionType: 'persuade', rollSuccess: true }, s => { tie(s, D, MV, 10, [{ turn: turn - 1, day, w: 4, t: 0, words: true, seen: true }]); }],
      'vouched_for past what words will do': [D, { event: 'vouched_for', aboutId: MV }, { present: [D], targets: [D], actionType: 'persuade', rollSuccess: true }, s => { tie(s, D, MV, 10, [{ turn: 10, day: 2, w: 20, t: 0, words: true, seen: true }]); }],
      'betrayed_confidence with nothing confided': [J, { event: 'betrayed_confidence' }, {}],
      'defended against someone not here': [J, { event: 'defended', aboutId: CO }, { present: [J] }],
      'defended against someone the player went for': [J, { event: 'defended', aboutId: CO }, { present: [J, CO], targets: [CO], actionType: 'attack' }],
      'an apology that did not land': [J, { event: 'apologised' }, { present: [J] }, (s, n) => { n.attitude = -30; }],
      'rebuffed with no advance of theirs': [J, { event: 'rebuffed' }, { present: [J] }],
      'learned_secret never in the packet': [H, { event: 'learned_secret' }, { present: [H], narration: 'He talks about the weather.' }],
      'learned_secret the narration does not show': [H, { event: 'learned_secret' }, { present: [H], narration: 'He talks about the weather.' }, s => { s.known = Object.assign({}, s.known, { secrets: { [H]: true } }); }],
      'learned_secret already held': [H, { event: 'learned_secret' }, { present: [H] }, (s, n, t) => { s.known = Object.assign({}, s.known, { secrets: { [H]: true } }); held(s, H); t.narration = R.keysOf(n, { s, town }).join('. ') + '.'; }],
      'caught_you_at twice in a turn': [J, { event: 'caught_you_at' }, { present: [J], actionType: 'steal' }, (s, n) => { n.memories.push(Object.assign(mem('caught_you_at', { t: -5 }, 0), { turn })); }],
      'caught_you_at with nothing to catch': [J, { event: 'caught_you_at' }, { present: [J], actionType: 'talk' }],
      'caught_you_at with two others there': [J, { event: 'caught_you_at' }, { present: [J, D, MV], actionType: 'steal', targets: [D] }],
      'stole_from with no theft on record': [J, { event: 'stole_from' }, {}],
      'cheated with no deal on record': [J, { event: 'cheated' }, {}]
    };
    const out = {};
    for (const name of names) {
      const row = T[name];
      if (!row) { out[name] = { missing: true }; continue; }
      const [who, ev, facts, stage] = row;
      const st = JSON.parse(base);
      st.time.day = day;
      st.meta.turn = turn;
      const n = st.npcs.find(x => x.id === who);
      const t = Object.assign({ present: [], targets: [] }, facts);
      if (stage) stage(st, n, t);
      const ctx = { s: st, town, day, turn };
      const r = R.wireEvent(n, Object.assign({ text: 'what the bookkeeper said' }, ev), t, ctx);
      out[name] = Object.assign({}, r, { sent: ev.event });
    }
    return out;
  }, ROWS.map(r => r[0]));
  const problems = [];
  for (const [name, want] of ROWS) {
    const r = got[name];
    const fail = why => problems.push(`${name}: ${why}: ${JSON.stringify(r)}`);
    if (!r || r.missing) { fail('no staged row'); continue; }
    const match = (v, w) => (w instanceof RegExp ? w.test(String(v)) : v === w);
    if ('refuse' in want) { if (!match(r.refuse, want.refuse)) fail(`refused "${want.refuse}" wanted`); if (r.event) fail('refused, so no event'); continue; }
    if (r.refuse) { fail('refused, not wanted'); continue; }
    if ('knows' in want) { if (r.knows !== want.knows || !match(r.why, want.why)) fail(`knows ${want.knows}, "${want.why}" wanted`); if (r.event) fail('knows only, so no event'); continue; }
    if ('down' in want) { if (r.event !== want.down || r.event === r.sent || !match(r.why, want.why)) fail(`down to ${want.down}, "${want.why}" wanted`); continue; }
    for (const k of Object.keys(want)) {
      if (k === 'why' && want.why === undefined) { if (r.why !== undefined) fail('no why wanted'); continue; }
      if (k === 'd') { assert.deepEqual(r.d, want.d, `${name}: d`); continue; }
      if (!match(r[k], want[k])) fail(`${k} ${want[k]} wanted`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

s.test('the table covers every reason wireEvent can give (read from its source)', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const start = src.indexOf('  function wireEvent(n, ev, t, ctx) {');
  const end = src.indexOf('\n  }\n', start);
  assert.ok(start > 0 && end > start, 'wireEvent found');
  const body = src.slice(start, end);
  // The reasons it states: refuse:, why: and down(...)'s second argument, and wordsTie's (badmouthed and vouched_for go through it).
  const ws = src.indexOf('  function wordsTie(x, yId, event, t, ctx) {');
  const words = src.slice(ws, src.indexOf('\n  }\n', ws));
  const said = [];
  for (const m of (body + words).matchAll(/(?:refuse: |why: |why = )(['"`])((?:\\.|(?!\1).)*)\1/g)) said.push(m[2]);
  for (const m of body.matchAll(/down\('[a-z_]+', (['"`])((?:\\.|(?!\1).)*)\1\)/g)) said.push(m[2]);
  const fixed = said.filter(x => !/\$\{/.test(x)).map(x => x.replace(/\\'/g, "'"));
  const templated = said.filter(x => /\$\{/.test(x));
  const wants = ROWS.map(r => r[1].refuse || r[1].why).filter(Boolean);
  const plain = wants.filter(w => typeof w === 'string');
  const missing = fixed.filter(x => !plain.includes(x)).filter((x, i, a) => a.indexOf(x) === i);
  assert.deepEqual(missing, [], 'a reason with no row');
  // The four built from values: the unknown event, the engine's own, the player went for X first, the keys shown.
  assert.equal(templated.length, 4, JSON.stringify(templated));
  // Two more sit in one ternary (the flirt the parse saw, the late flirt at nobody here); every row's own reason is in the source.
  assert.ok(fixed.length + templated.length >= 29, `${fixed.length} fixed and ${templated.length} templated reasons`);
  for (const w of plain.filter(w => !/kissed_hand|is the engine's to record|went for Colt/.test(w))) assert.ok(src.includes(w.replace(/'/g, "\\'")) || src.includes(w), 'in the source: ' + w);
});

s.run();
