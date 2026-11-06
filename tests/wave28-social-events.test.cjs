'use strict';
/* Wave 28 (1 Nov 2026): the bookkeeper names the act (docs/RELATIONSHIPS_PLAN.md,
   wave A3; the integration plan's sections 5, 9.3 and 16). socialEvents is
   the bookkeeper's field: event lines on the wire ("npc_x insulted: called
   me a liar"), read by a tolerant parser (Api.socialFromWire) and checked
   by State.apply's model rules (the 22 words of tier A, the person here,
   the preconditions with their downgrades, two a person and four a turn,
   the engine's class first); the schema is 34 properties and three enums,
   the core eleven, the parser fourteen with romantic; the demo flips to
   events; trust opens the doors liking used to (the secret, the couch,
   the card seats, Curtis, the rumours, a lie's dice and difficulty, the
   favours and their needs). The minor guard is tests/relationships.test.cjs.
   Mock mode. Run with: node tests/run.cjs wave28 */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave28-social-events');

/* __put(locId, ids, day?, phase?): the player somewhere with these people, now (visits for this phase).
   __model(lines, opts): the bookkeeper's reply as the wire carries it, applied as the model's with who is here. */
const setup = page => page.evaluate(() => {
  window.__put = (locId, ids, day, phase) => {
    const S = Game.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'morning' } });
    S.apply({ playerLocationId: locId });
    S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__model = (lines, opts) => {
    const S = Game.State;
    const present = S.npcsAt(Game.state.player.locationId).map(n => n.id);
    return S.apply(Game.Api.recordFromWire({ socialEvents: lines }), Object.assign({ source: 'model', present }, opts || {}));
  };
});
const count = node => { let props = 0; let enums = 0; const walk = x => { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (x.type === 'object' && x.properties) props += Object.keys(x.properties).length; if (Array.isArray(x.enum) && x.type !== 'null') enums += 1; Object.values(x).forEach(walk); } }; walk(node); return { props, enums }; };

s.test('the wire: event strings with or without colons, American spellings, a missing about-id found from a name and a spurious one ignored; 34 properties and three enums, a core of eleven, a parser of fourteen', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const A = Game.Api;
    const f = A.socialFromWire;
    return {
      colon: f('npc_dewayne: apologised: hitting me over the tow bill'),
      bare: f('npc_dewayne apologized for hitting me over the tow bill'),
      spoken: f('npc_dewayne hit me in my bay'),
      kept: ['npc_royce kept word: kept quiet when Elbert asked how I would vote', 'npc_royce kept-word: kept quiet', 'npc_royce keptword kept quiet'].map(f),
      caught: f('npc_trent caught you at: going through the cab of the truck'),
      priv: f('npc_jodie private confided: told me about her uncle'),
      order: f('insulted npc_wade: called me a coward'),
      time: f('npc_jodie noted: meet at 10:30 by the back door'),
      stem: f('npc_marcus lied_cau: no surveyor by that name'),
      dashed: f('npc_hollis — they confided — told me about the pawn books'),
      exposedFirst: f('npc_dewayne exposed: told me Mavis spent the garage money'),
      exposedFull: f('npc_dewayne exposed: Mavis Mangum spent the garage money'),
      exposedId: f('npc_dewayne exposed npc_mavis: told me about the garage money'),
      spurious: f('npc_royce complimented npc_mavis: liked the coffee'),
      unknown: f('npc_royce glared: looked hard at me'),
      object: f({ npcId: 'npc_x', event: 'insulted', text: 't' }),
      record: A.recordFromWire({ socialEvents: ['npc_royce insulted: called me a liar'], goldDelta: -2 }),
      rcSchema: A.SCHEMAS.record_changes, coreSchema: A.SCHEMAS.record_changes_core, coreKeys: Object.keys(A.SCHEMAS.record_changes_core.properties), fields: A.RECORD_CORE_FIELDS,
      parseSchema: A.SCHEMAS.parse_action, romantic: A.SCHEMAS.parse_action.properties.romantic,
      keys: Object.keys(A.SCHEMAS.record_changes.properties), events: A.SCHEMAS.record_changes.properties.socialEvents,
      sys: A.SYSTEM.bookkeeper, parser: A.SYSTEM.parser, memories: A.SYSTEM.memories, rules: A.MEMORY_RULES, words: A.MEMORY_WORDS, eventRules: A.EVENT_RULES,
      wire: Object.keys(Game.Rel.WIRE_EVENTS).filter(k => Game.Rel.WIRE_EVENTS[k] === 'A'),
      norm: ['flirt', 'more', null, undefined, true, 'kiss'].map(v => Game.Pipeline.normaliseParse({ actionType: 'talk', summary: 'x', romantic: v }).romantic),
      keysState: [Game.State.RECORD_KEYS.includes('socialEvents'), Game.State.ENGINE_KEYS.includes('socialEvents'), ['attitudeChanges', 'newMemories', 'memoriesSettled'].every(k => Game.State.RECORD_KEYS.includes(k))]
    };
  });
  assert.deepEqual(r.colon, { npcId: 'npc_dewayne', event: 'apologised', aboutId: null, private: false, text: 'hitting me over the tow bill' });
  assert.deepEqual([r.bare.event, r.bare.text], ['apologised', 'for hitting me over the tow bill'], 'an American spelling, no colon');
  assert.deepEqual([r.spoken.event, r.spoken.text], ['hit', 'me in my bay'], 'tokens stop at the first word that is none of them');
  assert.deepEqual(r.kept.map(x => [x.event, x.text]), [['kept_word', 'kept quiet when Elbert asked how I would vote'], ['kept_word', 'kept quiet'], ['kept_word', 'kept quiet']], 'two words, a hyphen, one word');
  assert.deepEqual([r.caught.event, r.caught.text], ['caught_you_at', 'going through the cab of the truck'], 'a three-word form');
  assert.deepEqual([r.priv.event, r.priv.private, r.priv.text], ['confided', true, 'told me about her uncle'], 'private in any order');
  assert.deepEqual([r.order.npcId, r.order.event, r.order.text], ['npc_wade', 'insulted', 'called me a coward'], 'the event before the id');
  assert.equal(r.time.text, 'meet at 10:30 by the back door', 'a colon inside the memory is safe');
  assert.equal(r.stem.event, 'lied_caught', 'a unique five-letter stem');
  assert.deepEqual([r.dashed.event, r.dashed.text], ['they_confided', 'told me about the pawn books'], 'spaced dashes between tokens');
  assert.deepEqual([r.exposedFirst.aboutId, r.exposedFull.aboutId, r.exposedId.aboutId], ['npc_mavis', 'npc_mavis', 'npc_mavis'], 'a missing about-id found from a first name only she has, or a full name');
  assert.equal(r.spurious.aboutId, null, 'an about-id on an event that takes none is dropped');
  assert.equal(r.unknown.event, '', 'no event word: the whole line is the memory, and State refuses it');
  assert.deepEqual(r.object, { npcId: 'npc_x', event: 'insulted', text: 't' }, 'an object passes through');
  assert.deepEqual(r.record.socialEvents, [{ npcId: 'npc_royce', event: 'insulted', aboutId: null, private: false, text: 'called me a liar' }]);
  assert.ok(!('attitudeChanges' in r.record) && !('newMemories' in r.record) && !('memoriesSettled' in r.record), 'the legacy fields are no longer filled in');
  Object.assign(r, { rc: count(r.rcSchema), core: count(r.coreSchema), parse: count(r.parseSchema) });
  assert.deepEqual(r.rc, { props: 34, enums: 3 }, 'record_changes: 34 properties and three enums');
  assert.ok(r.keys[0] === 'socialEvents' && !r.keys.includes('attitudeChanges') && !r.keys.includes('newMemories') && !r.keys.includes('memoriesSettled'));
  assert.equal(r.events.items.type, 'string');
  assert.match(r.events.description, /"npc_dewayne apologised: hitting me over the tow bill" or "npc_marcus noted: says she is a surveyor from the state"/);
  assert.deepEqual(r.fields, ['socialEvents', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'playerLocationId', 'npcKnownToPlayer', 'rumoursHeard', 'npcFates', 'obligationsSettled', 'journalEntry']);
  assert.deepEqual(r.coreKeys, r.fields);
  assert.equal(r.core.props, 11, 'a core of eleven');
  assert.equal(r.parse.props, 14, 'a parser of fourteen');
  assert.deepEqual(r.romantic.anyOf, [{ type: 'string', enum: ['flirt', 'more'] }, { type: 'null' }]);
  assert.deepEqual(r.norm, ['flirt', 'more', null, null, 'flirt', null], 'a missing romantic is null; an older true is a flirt');
  assert.deepEqual(r.keysState, [true, false, true], 'socialEvents is the bookkeeper\'s; the three it replaced stay readable');
  // The rubric: events, never numbers; MEMORY_RULES kept word for word for the memory re-read, the bookkeeper's MEMORY_WORDS forked from it.
  assert.ok(!r.sys.includes('Be conservative') && !r.sys.includes('memoriesSettled when this turn'), 'no attitude numbers, no settled memories');
  assert.ok(r.sys.includes(r.eventRules) && r.sys.endsWith(r.words));
  assert.ok(r.memories.includes(r.rules) && !r.sys.includes(r.rules), 'MEMORY_RULES stays the memory re-read\'s');
  for (const w of r.wire) assert.ok(new RegExp(`\\b${w}\\b`).test(r.eventRules), 'glossed: ' + w);
  assert.equal(r.wire.length, 22, 'the 22 words of tier A');
  assert.match(r.eventRules, /as a neutral witness would name it/);
  assert.match(r.eventRules, /never send them: a fight, a threat, a theft or a cheat seen as it happened, money or a thing handed over, a debt paid, a promise or a meeting kept or missed, a flirt, time spent together/);
  const words = t => t.split(/\s+/).filter(Boolean).length;
  assert.ok(words(r.eventRules) >= 250 && words(r.eventRules) <= 380, 'about 300 words: ' + words(r.eventRules));
  assert.ok(words(r.words) >= 45 && words(r.words) <= 60, 'about 53 words: ' + words(r.words));
  assert.match(r.parser, /ROMANTIC: romantic is "flirt" when/);
  assert.match(r.parser, /when asking anything of someone who is against the player or hates them \(the engine also sets a floor\)/);
});

s.test('a model\'s events: only for people here, at most two a person and four a turn keeping the heaviest; a precondition that fails downgrades kept_word to confided and refuses a lied_caught with no lie on record', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    const evs = id => S.npc(id).memories.filter(m => m.d).map(m => m.event);
    const here = __put('loc_pittmans', ['npc_royce', 'npc_dewayne', 'npc_jodie', 'npc_elbert'], 2, 'morning');
    out.here = here;
    S.apply({ beginTurn: true });
    // Somebody not here; an engine-only word; a word against someone (wave 32: taken); no event word; a lie with nothing on record.
    const a = __model(['npc_wade insulted: called me a liar', 'npc_royce hit: hit me', 'npc_royce badmouthed npc_carter: said Carter cheats', 'npc_royce glared at me', 'npc_dewayne lied_caught: lied about the truck']);
    out.refused = a.rejected.map(x => x.reason);
    // Three for Royce and two for Jodie and two for Elbert: two a person, four a turn, the heaviest kept (by weight, then by liking and trust).
    S.apply({ beginTurn: true });
    const b = __model(['npc_royce pried: asked about my wife', 'npc_royce crossed: worked against me with Carter', 'npc_royce complimented: liked my coffee', 'npc_jodie complimented: liked my coffee', 'npc_jodie they_helped: covered my shift', 'npc_elbert did_favour: fixed my chair', 'npc_elbert confided: told me about my past']);
    out.caps = { royce: evs('npc_royce'), jodie: evs('npc_jodie'), elbert: evs('npc_elbert'), dropped: b.rejected.map(x => x.reason) };
    // kept_word with no confidence of theirs to keep: confided. lied_caught with nothing on record: refused.
    S.apply({ beginTurn: true });
    const c = __model(['npc_dewayne kept_word: kept quiet when Royce asked about the bay', 'npc_dewayne lied_caught: lied about the truck']);
    out.kept = { dewayne: S.npc('npc_dewayne').memories.filter(m => m.d).map(m => [m.event, m.text]), rejected: c.rejected.map(x => x.reason), applied: c.applied.join(' | ') };
    // The real thing: a confidence a day old, the asker named and here, not them.
    S.apply({ setTime: { day: 2, phase: 'morning' } });
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_royce', event: 'they_confided', text: 'told me about the note from Carter' }] });
    S.apply({ setTime: { day: 3, phase: 'morning' } });
    __put('loc_pittmans', ['npc_royce', 'npc_elbert'], null);
    S.apply({ beginTurn: true });
    const t0 = R.tracksOf(S.npc('npc_royce')).t;
    const staged = __model(['npc_royce kept_word: kept quiet when Carter asked how I would vote']);
    out.staged = [S.npc('npc_royce').memories.filter(m => m.d && m.turn === st.meta.turn).map(m => m.event), staged.applied.join(' | ')];
    S.apply({ setTime: { day: 4, phase: 'morning' } });
    __put('loc_pittmans', ['npc_royce', 'npc_elbert'], null);
    S.apply({ beginTurn: true });
    const t1 = R.tracksOf(S.npc('npc_royce')).t;
    __model(['npc_royce kept_word: kept quiet when Elbert asked how I would vote']);
    out.real = [S.npc('npc_royce').memories.filter(m => m.d && m.turn === st.meta.turn).map(m => m.event), R.tracksOf(S.npc('npc_royce')).t - t1, t1 - t0];
    // A lie on record (the ask log) makes lied_caught stand; owning up softens it; a flirt the parse did not see is a compliment; exposed teaches only.
    S.apply({ beginTurn: true });
    S.apply({ relAsk: { npcId: 'npc_elbert', act: 'deceive', ok: true, about: 'Says she is from the state' } });
    const e0 = R.tracksOf(S.npc('npc_elbert')).t;
    __model(['npc_elbert lied_caught: no state surveyor by that name', 'npc_royce flirted: told me I look good', 'npc_dewayne exposed: told me Mavis spent the garage money']);
    const e1 = R.tracksOf(S.npc('npc_elbert')).t;
    S.apply({ beginTurn: true });
    __model(['npc_elbert came_clean: owned up about the state']);
    const e2 = R.tracksOf(S.npc('npc_elbert')).t;
    out.lie = { elbert: evs('npc_elbert'), drop: e1 - e0, back: e2 - e1, royce: S.npc('npc_royce').memories.filter(m => m.turn === st.meta.turn - 1 && m.d).map(m => m.event), dewayne: S.npc('npc_dewayne').memories.filter(m => m.event === 'exposed').length, settled: R.settlements(S.npc('npc_elbert').memories.find(m => m.event === 'lied_caught')).map(x => x.by) };
    // Two or more others here and not private: an insult is a humiliation, in front of them.
    __put('loc_pittmans', ['npc_royce', 'npc_dewayne', 'npc_jodie'], null);
    S.apply({ beginTurn: true });
    const rep0 = st.player.reputation.town || 0;
    __model(['npc_jodie insulted: called me a runaway in front of them', 'npc_royce private insulted: called me soft']);
    out.shamed = { jodie: S.npc('npc_jodie').memories.filter(m => m.turn === st.meta.turn && m.d).map(m => [m.event, m.private === true]), royce: S.npc('npc_royce').memories.filter(m => m.turn === st.meta.turn && m.d).map(m => [m.event, m.private === true]), watched: S.npc('npc_dewayne').memories.filter(m => m.witness && m.turn === st.meta.turn).length + Math.abs(S.npc('npc_dewayne').rel.everyday.w || 0), rep: (st.player.reputation.town || 0) - rep0 };
    // The engine's class first: its insult drops the model's for that person this turn.
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_dewayne', event: 'humiliated', text: 'shamed me at the pumps' }] });
    const d = __model(['npc_dewayne insulted: shamed me at the pumps']);
    out.dedupe = d.applied.some(x => /the engine already recorded words for npc_dewayne/.test(x));
    return out;
  });
  for (const id of ['npc_royce', 'npc_dewayne', 'npc_jodie', 'npc_elbert']) assert.ok(r.here.includes(id), id + ' is here');
  // Wave 32: badmouthed is on the wire now (knowing +2; with no persuade that worked it moves no tie), so four refused.
  assert.equal(r.refused.length, 4, JSON.stringify(r.refused));
  assert.match(r.refused[0], /npc_wade is not here/);
  assert.match(r.refused[1], /hit is the engine's to record/);
  assert.match(r.refused[2], /is no event the game knows/);
  assert.match(r.refused[3], /no lie to them and no claim/);
  assert.deepEqual(r.caps.royce, ['pried', 'crossed'], 'two a person: crossed (weight 2), then the prying over the compliment (6 against 3)');
  assert.deepEqual(r.caps.elbert, ['did_favour', 'confided'], 'Elbert\'s two');
  assert.deepEqual(r.caps.jodie, [], 'four a turn: Jodie\'s lighter two are the ones over');
  assert.equal(r.caps.dropped.length, 3, JSON.stringify(r.caps.dropped));
  assert.ok(r.caps.dropped.every(x => /over the cap \(2 a person, 4 a turn/.test(x)));
  assert.deepEqual(r.kept.dewayne, [['confided', 'kept quiet when Royce asked about the bay']], 'no confidence of his to keep: confided');
  assert.match(r.kept.applied, /as confided: no confidence of theirs a day old to keep/);
  assert.match(r.kept.rejected[0], /no lie to them and no claim/);
  assert.deepEqual(r.staged[0], ['confided'], 'Carter is not here: the staged kept word is a confidence');
  assert.match(r.staged[1], /nobody named who asked is here/);
  assert.deepEqual(r.real[0], ['kept_word'], 'a day-old confidence, Elbert named and here: a kept word');
  assert.equal(r.real[1], 18, 'trust +15, x1.2 for someone open');
  assert.deepEqual(r.lie.elbert.filter(x => x === 'lied_caught').length, 1, 'a logged lie lets lied_caught stand');
  assert.ok(r.lie.drop <= -25, 'trust -30 before his traits: ' + r.lie.drop);
  assert.ok(r.lie.back > 0 && r.lie.back < -r.lie.drop, 'owning up gives some back, never all: ' + r.lie.back);
  assert.deepEqual(r.lie.settled, ['came_clean']);
  assert.deepEqual(r.lie.royce, ['complimented'], 'a flirt the parse did not see is a compliment');
  assert.equal(r.lie.dewayne, 0, 'with nothing held over anyone, exposed teaches only knowing');
  assert.deepEqual(r.shamed.jodie, [['humiliated', false]], 'in front of two others: a humiliation');
  assert.deepEqual(r.shamed.royce, [['insulted', true]], 'said privately: an insult');
  assert.ok(r.shamed.watched > 0, 'the people watching saw it');
  assert.equal(r.shamed.rep, -2, 'done in public: the town takes the row\'s -2');
  assert.equal(r.dedupe, true, 'the engine\'s humiliation drops the model\'s insult');
});

s.test('an apology must land and never resets the count; a beating settled the same day still grows a grudge', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    __put('loc_pittmans', ['npc_royce'], 2, 'morning');
    const w = () => R.tracksOf(S.npc('npc_royce')).w;
    const w0 = w();
    const steps = [];
    // Said privately (others are about the station): insults, not humiliations.
    for (const words of ['called me a liar', 'called me a coward', 'called me a crook']) { S.apply({ beginTurn: true }); __model([`npc_royce private insulted: ${words}`]); steps.push(w()); }
    out.insults = [steps[0] - w0, steps[1] - steps[0], steps[2] - steps[1]];
    const m = () => S.npc('npc_royce').memories.find(x => x.event === 'insulted');
    out.merged = [S.npc('npc_royce').memories.filter(x => x.event === 'insulted').length, m().weight, m().n];
    // At liking -38 an apology that is only said does not land: knowing only.
    S.apply({ beginTurn: true });
    const k0 = R.tracksOf(S.npc('npc_royce')).k;
    const a = __model(['npc_royce apologised: calling me a crook'], { actionType: 'talk', targets: ['npc_royce'], rollSuccess: false });
    out.flat = [w() - steps[2], R.tracksOf(S.npc('npc_royce')).k - k0, R.settlements(m()).length, a.applied.join(' | ')];
    // A persuasion aimed at him that worked: it lands, softening the insults by half.
    S.apply({ beginTurn: true });
    __model(['npc_royce apologised: calling me a crook'], { actionType: 'persuade', targets: ['npc_royce'], rollSuccess: true });
    out.landed = [w() - steps[2], R.settlements(m()).map(x => x.by)];
    // The count stands: the next insult still compounds at x2.25.
    S.apply({ beginTurn: true });
    const b4 = w();
    __model(['npc_royce private insulted: called me a thief']);
    out.after = [w() - b4, m().n];
    // A beating, settled the same day by an apology, can still grow a grudge; settled a later day it cannot.
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_dewayne', event: 'beat_down', text: 'knocked me down in a fight at Pittman\'s', act: 'attack' }] });
    __put('loc_pittmans', ['npc_dewayne'], null);
    S.apply({ beginTurn: true });
    __model(['npc_dewayne apologised: knocking me down'], { actionType: 'persuade', targets: ['npc_dewayne'], rollSuccess: true });
    const bd = S.npc('npc_dewayne').memories.find(x => x.event === 'beat_down');
    out.sameDay = [R.settlements(bd).length, R.grudgeFit(bd), !!G.World.freshMemory(S.npc('npc_dewayne'), 3, true)];
    // A day later the same settlement would stop it.
    const later = Object.assign({}, bd, { settled: [Object.assign({}, bd.settled[0], { day: bd.day + 1 })] });
    out.later = R.grudgeFit(later);
    // And the tick plants it once his liking is at -60.
    G.World.forceAttitude('npc_dewayne', -60);
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    out.grudge = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === 'npc_dewayne').length;
    return out;
  });
  assert.deepEqual(r.insults, [-10, -15, -23], 'three insults compound: -10, -15, -22.5 (rounded away from zero)');
  assert.deepEqual(r.merged, [1, 3, 3], 'one merged memory, weight 3');
  assert.equal(r.flat[0], 0, 'an apology that does not land moves nothing');
  assert.equal(r.flat[1], 2, 'it teaches knowing only');
  assert.equal(r.flat[2], 0);
  assert.match(r.flat[3], /knows \+2 only \(the apology did not land\)/);
  assert.ok(r.landed[0] >= 20, 'a landed apology softens half the insults\' liking: ' + r.landed[0]);
  assert.deepEqual(r.landed[1], ['apologised']);
  assert.equal(r.after[1], 4, 'the count went on');
  assert.ok(r.after[0] <= -20, 'still compounding x2.25 after the apology: ' + r.after[0]);
  assert.deepEqual(r.sameDay, [1, true, true], 'a beating settled the same day still grows a grudge');
  assert.equal(r.later, false, 'settled a later day it does not');
  assert.equal(r.grudge, 1, 'the tick plants it');
});

s.test('trust opens the doors liking used to: a secret at trust 40 and knowing 30, a couch at trust 0 or a debt owed; lies to someone who distrusts the player are hard', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    __put('loc_pittmans', ['npc_royce'], 2, 'morning');
    const talk = async () => { M.queue('parse', { actionType: 'talk', summary: 'Chats', targets: ['npc_royce'], needsRoll: false, timeCost: 'instant' }); await G.Pipeline.submit('I chat with Royce'); return G.Pipeline.lastTurn.ctx.revealSecretFor || null; };
    S.apply({ relSet: { npcId: 'npc_royce', w: 60, t: 39, k: 30 } });
    out.liking60 = await talk();
    S.apply({ relSet: { npcId: 'npc_royce', w: 0, t: 40, k: 29 } });
    out.knows29 = await talk();
    S.apply({ relSet: { npcId: 'npc_royce', w: 0, t: 40, k: 30 } });
    out.open = await talk();
    out.packet = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    // Lies and asks: the parse's difficulty floored by where they stand.
    const parse = (id, type, difficulty) => G.Pipeline.normaliseParse({ actionType: type, summary: 'x', targets: [id], needsRoll: true, stat: 'charm', difficulty, timeCost: 'instant' }).difficulty;
    S.apply({ relSet: { npcId: 'npc_royce', w: 0, t: -25 } });
    out.lie = [parse('npc_royce', 'deceive', 'normal'), R.lieWord(S.npc('npc_royce')), R.rollMod(S.npc('npc_royce'), 'deceive')];
    S.apply({ relSet: { npcId: 'npc_royce', t: -50 } });
    out.lie.push(parse('npc_royce', 'deceive', 'easy'), R.lieWord(S.npc('npc_royce')), R.rollMod(S.npc('npc_royce'), 'deceive'));
    S.apply({ relSet: { npcId: 'npc_royce', t: 40 } });
    out.lie.push(parse('npc_royce', 'deceive', 'normal'), R.rollMod(S.npc('npc_royce'), 'deceive'));
    S.apply({ relSet: { npcId: 'npc_royce', w: -30, t: 0 } });
    out.ask = [parse('npc_royce', 'persuade', 'normal'), parse('npc_royce', 'persuade', 'very_hard'), parse('npc_wade', 'intimidate', 'normal'), parse('npc_tyler', 'intimidate', 'normal')];
    // The parser's packet: the stance and the lie, no number.
    out.row = G.Pipeline.parsePacket('I lie to Royce', { speech: { mode: 'do' } }).text.split('\n').find(l => l.startsWith('NPCS PRESENT'));
    // The couch at the Low Water: Loretta, its owner, at liking 30 and trust below 0, then 0; a favour she owes at liking -10.
    S.apply({ setTime: { day: 2, phase: 'evening' } });
    __put('loc_low_water', ['npc_loretta'], null);
    S.apply({ relSet: { npcId: 'npc_loretta', w: 30, t: -1 } });
    out.couch = [S.restQuality()];
    S.apply({ relSet: { npcId: 'npc_loretta', w: 30, t: 0 } });
    out.couch.push(S.restQuality());
    S.apply({ relSet: { npcId: 'npc_loretta', w: -10, t: -30 } });
    out.couch.push(S.restQuality());
    S.apply({ relStart: { npcId: 'npc_loretta', owed: 1, why: 'fixed her cooler' } });
    out.couch.push(S.restQuality());
    S.apply({ relSet: { npcId: 'npc_loretta', w: -30 } });
    out.couch.push(S.restQuality());
    // The card seats and Curtis: trust above -40.
    S.apply({ relSet: [{ npcId: 'npc_elbert', w: 0, t: -40 }, { npcId: 'npc_lyman', w: 0, t: -39 }, { npcId: 'npc_curtis', w: 0, t: -40 }] });
    out.seats = G.Pipeline.cardPeople(['npc_elbert', 'npc_lyman', 'npc_curtis'], S.npc('npc_curtis')).map(n => n.id);
    out.dealer = [G.Pipeline.dealerRefusal(S.npc('npc_curtis'), st)];
    S.apply({ relSet: { npcId: 'npc_curtis', t: -39 } });
    out.dealer.push(G.Pipeline.dealerRefusal(S.npc('npc_curtis'), st));
    // A rumour: liking above -25 and trust above -25, unless they are a gossip (Pearl tells anyone).
    S.apply({ effects: [{ op: 'addRumour', rumour: { id: 'rum_w28_loretta', text: 'The ferry bell cracked in the night.', sourceNpcId: 'npc_loretta' } }, { op: 'addRumour', rumour: { id: 'rum_w28_pearl', text: 'The county weekly is closing.', sourceNpcId: 'npc_pearl' } }] });
    __put('loc_low_water', ['npc_loretta', 'npc_pearl'], null);
    const told = id => { const x = G.Pipeline.pickRumour({ action: { actionType: 'talk', targets: [id] } }); return x ? x.npcId : null; };
    S.apply({ relSet: [{ npcId: 'npc_loretta', w: 10, t: -25 }, { npcId: 'npc_pearl', w: 10, t: -30 }] });
    out.rumour = [told('npc_loretta'), told('npc_pearl')];
    S.apply({ relSet: { npcId: 'npc_loretta', t: -24 } });
    out.rumour.push(told('npc_loretta'));
    return out;
  });
  assert.equal(r.liking60, null, 'liking 60 no longer opens a secret on its own');
  assert.equal(r.knows29, null, 'trust 40 and knowing 29: shut');
  assert.deepEqual(r.open, ['npc_royce'], 'trust 40 and knowing 30: open');
  assert.match(r.packet, /secret \(it can come out now, if the talk goes there\)/);
  assert.deepEqual(r.couch, ['rough', 'bed', 'rough', 'bed', 'rough'], 'a couch at liking 25 and trust 0, or a favour owed while liking stays above -25');
  assert.deepEqual(r.lie.slice(0, 3), ['hard', 'hard', -1], 'a lie at trust -25: at least hard, -1 on the dice');
  assert.deepEqual(r.lie.slice(3, 6), ['very_hard', 'very hard', -2], 'at -50: very hard, -2');
  assert.deepEqual(r.lie.slice(6), ['normal', 2], 'trusted (40): +2, no floor');
  assert.deepEqual(r.ask, ['hard', 'very_hard', 'hard', 'normal'], 'any ask of someone against the player is hard; a hard person is hard to frighten; the floor never lowers');
  assert.match(r.row, /npc_royce — Royce Pittman \(he\/him; [^)]*toward the player: against you; lies to them: hard[;)]/);
  assert.doesNotMatch(r.row, /attitude to the player/);
  assert.deepEqual(r.seats, ['npc_lyman'], 'a card player at trust -40 does not sit in');
  assert.deepEqual(r.dealer, [{ cold: true }, null], 'Curtis does not deal at trust -40');
  assert.deepEqual(r.rumour, [null, 'npc_pearl', 'npc_loretta'], 'nobody at trust -25 shares a rumour but a gossip; at -24 they do');
});

s.test('favours need liking 50 and trust 20 and a help to answer, and the photo, the alibi and the ramp warning need trust too', async h => {
  const page = await h.open();
  await quickStart(page, { seed: 5, kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, R = G.Rel, st = G.state;
    W.forceClockRoll(1);
    const favours = id => st.seeds.filter(sd => sd.origin && sd.origin.kind === 'favour' && sd.origin.npcId === id).length;
    const out = {};
    const help = id => S.apply({ socialEvents: [{ npcId: id, event: 'did_favour', text: 'fixed the leak in my roof' }] });
    help('npc_burl');
    S.apply({ relSet: { npcId: 'npc_burl', w: 50, t: 19 } });
    help('npc_june');
    S.apply({ relSet: { npcId: 'npc_june', w: 49, t: 30 } });
    S.apply({ relSet: { npcId: 'npc_gerald', w: 70, t: 40 } });
    S.apply({ newMemories: [{ npcId: 'npc_gerald', text: 'listened to me at the pier', weight: 2 }] });
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    out.none = [favours('npc_burl'), favours('npc_june'), favours('npc_gerald')];
    S.apply({ relSet: { npcId: 'npc_burl', w: 50, t: 20 } });
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    out.burl = favours('npc_burl');
    out.helpEvents = W.HELP_EVENTS.slice();
    // The needs: the photo and the ramp warning at trust 30, the alibi at 40 (World.templateFits through Rel.meets).
    const T = G.data.FAVOUR_TEMPLATES;
    out.needs = [T[4].needs, T[5].needs, T[6].needs];
    const shayla = S.npc('npc_shayla');
    S.apply({ relSet: { npcId: 'npc_shayla', t: 29 } });
    out.meets = [R.meets(shayla, T[4].needs)];
    S.apply({ relSet: { npcId: 'npc_shayla', t: 30 } });
    out.meets.push(R.meets(shayla, T[4].needs), R.meets(shayla, T[5].needs), R.meets(shayla, { warmth: -100, familiarity: 0 }));
    return out;
  });
  assert.deepEqual(r.none, [0, 0, 0], 'none at trust 19, none at liking 49, none without a help to answer');
  assert.equal(r.burl, 1, 'liking 50, trust 20 and a favour of his own: one favour');
  assert.ok(r.helpEvents.includes('did_favour') && r.helpEvents.includes('rescued'));
  assert.deepEqual(r.needs, [{ trust: 30 }, { trust: 40 }, { trust: 30 }]);
  assert.deepEqual(r.meets, [false, true, false, true], 'the condition names read both ways (warmth is liking, familiarity knows)');
});

s.test('the bookkeeper hears stances, three handles a person and the engine\'s own events; the demo sends events in the wire\'s words and nothing for what the engine records; the Debug view exports the turns for labelling', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    __put('loc_pittmans', ['npc_royce', 'npc_dewayne'], 2, 'morning');
    G.Storage.saveSettings({ keepPackets: true });
    S.apply({ socialEvents: [{ npcId: 'npc_royce', event: 'insulted', text: 'called me a liar' }, { npcId: 'npc_royce', event: 'gift', text: 'gave me $5' }, { npcId: 'npc_royce', event: 'pried', text: 'asked about my wife' }, { npcId: 'npc_royce', event: 'complimented', text: 'liked my coffee' }] });
    // A threat with a roll: the engine's threatened; the demo sends nothing for it.
    M.queue('parse', { actionType: 'intimidate', summary: 'Leans on Dewayne', targets: ['npc_dewayne'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I lean on Dewayne');
    const book = M.calls.filter(c => c.method === 'bookkeep').pop().text;
    out.present = book.split('\n').find(l => l.startsWith('NPCS PRESENT'));
    out.applied = book.split('\n').find(l => l.startsWith('ALREADY APPLIED'));
    out.threat = S.npc('npc_dewayne').memories.filter(m => m.turn === st.meta.turn).map(m => m.event);
    // The demo: an insult in Say mode, an apology that lands, a claim, "you lied" in the narration.
    const auto = async (input, extra) => (await M.bookkeep({ context: Object.assign({ input, action: { summary: input, actionType: 'talk', targets: ['npc_royce'] }, presentIds: ['npc_royce'], speech: { mode: 'say', to: 'npc_royce' }, narration: '' }, extra || {}) })).result;
    out.mock = {
      insult: (await auto('You are a liar.')).socialEvents,
      sorry: (await auto('I am sorry about that.')).socialEvents,
      claim: (await auto("I'm a surveyor from the state.")).socialEvents,
      lied: (await auto('Fine.', { narration: '"You lied to me," Royce says.' })).socialEvents,
      confide: (await auto('Tell me about yourself.', { roll: { success: true } })).socialEvents,
      // Changed by design in wave 29 (A4): the demo sends a secret let slip only when the narration shows it (two of its keys), in the narration's words.
      secret: (await auto('Hm.', { revealSecretFor: ['npc_royce'], narration: 'Royce says Carter Sturdivant holds the note on the station and has offered him the truck stop lease.' })).socialEvents,
      secretUnshown: (await auto('Hm.', { revealSecretFor: ['npc_royce'] })).socialEvents,
      attack: (await auto('x', { action: { summary: 'x', actionType: 'attack', targets: ['npc_royce'] }, speech: { mode: 'do' }, roll: { success: true } })),
      keys: Object.keys(await auto('Morning.'))
    };
    // A real turn through the demo: the claim is held, and nothing is refused.
    M.queue('parse', { actionType: 'talk', summary: 'Claims to be a surveyor', targets: ['npc_royce'], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit("I'm a surveyor from the state.", { mode: 'say', to: 'npc_royce' });
    out.noted = S.npc('npc_royce').memories.filter(m => m.event === 'noted').map(m => m.text);
    out.jsonl = G.Pipeline.bookTurnsJsonl('2026-11-04').trim().split('\n').map(l => JSON.parse(l));
    out.button = (() => { G.UI.toggleDebug(true); const b = document.getElementById('dbg-export-book'); const x = !!b && !b.disabled; G.UI.toggleDebug(false); return x; })();
    G.Storage.saveSettings({ keepPackets: false });
    out.offKept = G.Pipeline.keepBookTurn(99, 'x', {});
    return out;
  });
  assert.match(r.present, /npc_royce — Royce Pittman \(he\/him; [^)]*; stance: [a-z ,']+\) remembers: gave me \$5 \(gift, Day 2\) \/ asked about my wife \(pried, Day 2\) \/ liked my coffee \(complimented, Day 2\);/, r.present);
  assert.ok(!r.present.includes('called me a liar'), 'at most three handles, the newest');
  assert.doesNotMatch(r.present, /attitude -?\d/);
  assert.match(r.applied, /engine events: npc_dewayne threatened/, r.applied);
  assert.deepEqual(r.threat, ['threatened'], 'the engine\'s threat, and nothing from the demo on top');
  assert.deepEqual(r.mock.insult.map(e => [e.npcId, e.event, e.text]), [['npc_royce', 'insulted', 'called me a liar']]);
  assert.deepEqual(r.mock.sorry.map(e => [e.event, e.text]), [['apologised', 'asked about my wife']], 'an apology in the words of the newest harm it answers');
  assert.deepEqual(r.mock.claim.map(e => [e.event, e.text]), [['noted', 'says they are a surveyor from the state']]);
  assert.deepEqual(r.mock.lied.map(e => e.event), ['lied_caught']);
  assert.deepEqual(r.mock.confide.map(e => e.event), ['they_confided']);
  assert.deepEqual(r.mock.secret.map(e => e.event), ['learned_secret']);
  assert.match(r.mock.secret[0].text, /note on the station/, 'in the narration\'s words');
  assert.deepEqual(r.mock.secretUnshown, [], 'a secret the narration did not show is not sent');
  assert.deepEqual(r.mock.attack.socialEvents, [], 'an attack is the engine\'s: the demo sends nothing');
  assert.ok(!r.mock.keys.includes('attitudeChanges') && !r.mock.keys.includes('newMemories') && !r.mock.keys.includes('memoriesSettled') && r.mock.keys.includes('socialEvents'), JSON.stringify(r.mock.keys));
  assert.deepEqual(r.noted, ['says they are a surveyor from the state'], 'the claim is held to them');
  assert.ok(r.jsonl.length >= 2, 'the turns kept: ' + r.jsonl.length);
  for (const x of r.jsonl) {
    assert.deepEqual(Object.keys(x), ['id', 'packet', 'labels', 'note'], 'the eval\'s input shape');
    assert.match(x.id, /^pt-2026-11-04-t\d+$/);
    assert.deepEqual(x.labels, [], 'left empty for labelling by hand');
    assert.match(x.packet, /^TURN \d+ /);
  }
  assert.match(r.jsonl[r.jsonl.length - 1].note, /^the model sent: npc_royce noted: says they are a surveyor from the state$/);
  assert.equal(r.button, true, 'the Debug view\'s button is live while the setting is on');
  assert.equal(r.offKept, false, 'nothing is kept with the setting off');
});

s.test('the cached style block carries the intimate-scenes rule for both styles, inside the 13,000 estimate', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const words = t => t.split(/\s+/).filter(Boolean).length;
    const est = style => Math.round((words(Game.Style.systemPrompt(style)) + words(Game.Pipeline.townBlock()) + words(Game.Pipeline.castBlock())) * 1.4);
    return { rule: Game.Style.INTIMATE_SCENES, cas: Game.Style.systemPrompt('casual'), lit: Game.Style.systemPrompt('literary'), know: Game.Style.KNOWLEDGE, est: [est('casual'), est('literary')], ruleTokens: words(Game.Style.INTIMATE_SCENES) * 1.4 };
  });
  // Wave 36: the scene is written out (sensual, not graphic) where wave 28 faded to black.
  assert.ok(/^INTIMATE SCENES: when a ROMANCE line says someone says yes, write the scene out, never skip it/.test(r.rule) && /sensual, not graphic/.test(r.rule) && /afterwards/.test(r.rule), r.rule);
  for (const sys of [r.cas, r.lit]) assert.ok(sys.includes(`\n\n${r.rule}\n\n${r.know}\n\nEXAMPLES (from a different town`), 'between the guide and the WHAT PEOPLE KNOW rules');
  assert.ok(r.ruleTokens < 40, 'under 40 tokens (the detail rides on the turn\'s ROMANCE line): ' + r.ruleTokens);
  assert.ok(r.est.every(x => x < 13000), 'cached blocks: ' + r.est.join(', '));
});

s.run();
