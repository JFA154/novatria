'use strict';
/* Wave 26 (1 Nov 2026): the tracks under the number (docs/RELATIONSHIPS_PLAN.md,
   wave A1). The owner: "plan a complicated relationship system that isn't 2
   dimensional, what we have now is very basic." This wave is a refactor:
   every person carries rel (liking, trust, fear, knows-you, spark, owed),
   attitude stays as the stored alias of liking, and nothing the game shows
   or stores changes; the new socialEvent op, relSet and relDay, the
   fading, the repeats, the stance and the spark guard are driven here
   through the engine (State.apply, engine source) and through Rel, which
   is pure. Mock mode.
   Run with: node tests/run.cjs wave26 */
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave26-rel-tracks');
// The in-town people who are hard (nerve 1 or more, the tough tag, or a faction head): design Appendix A's eleven.
const HARD = ['npc_boyd', 'npc_carter', 'npc_colt', 'npc_dwight', 'npc_leon', 'npc_loretta', 'npc_marcus', 'npc_nikki', 'npc_tammy', 'npc_trent', 'npc_wade'];

s.test('the tracks under the number: rel with six tracks on every person, attitude reads liking exactly, an attitudeDelta lands where it says even past the everyday bound, a direct write to attitude holds', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, st = G.state, T = G.data.TOWN_DATA;
    const out = {};
    const KEYS = ['v', 'start', 'everyday', 'fix', 'today', 'days', 'recent', 'asks', 'owed', 'w', 't', 'f', 'k', 's', 'net', 'levFear', 'bands'];
    out.shape = st.npcs.filter(n => !KEYS.every(k => k in n.rel)).map(n => n.id);
    out.alias = st.npcs.filter(n => n.attitude !== n.rel.w || R.tracksOf(n).w !== n.attitude).map(n => n.id);
    out.tracks = [R.TRACKS.slice(), Object.keys(R.tracksOf(st.npcs[0]))];
    // Changed by design in wave 29 (A4): a secret loose end's person starts holding it over the player (the informant's record); nothing else is held.
    out.state = [st.leverage.filter(x => !(x.over === 'player' && x.about.kind === 'loose_end' && st.player.looseEnds.some(le => le.kind === 'secret' && le.npcId === x.holder))), st.known, st.leverage.length === st.player.looseEnds.filter(le => le.kind === 'secret').length];
    // Changed by design in wave 28 (A3): socialEvents moved to RECORD_KEYS (the bookkeeper's, through its model rules); relSet and relDay stay the engine's.
    out.keys = ['socialEvents', 'relSet', 'relDay'].map(k => S.ENGINE_KEYS.includes(k) && !S.RECORD_KEYS.includes(k));
    out.ops = [S.EFFECT_OPS.length, S.EFFECT_OPS.includes('socialEvent'), Object.isFrozen(R.EVENTS) && Object.isFrozen(R.EVENTS.hit) && Object.isFrozen(R.CAPS.turn)];
    // Where people start: liking as the town wrote it (a loose end's person carries its shift on top), trust 5 x guardedness, -10 for the police and smugglers.
    // Changed by design in wave 27 (A2): a loose end's shift is part of where its person starts (rel.start: liking, trust LOOSE_END_TRUST, knows 30).
    const loose = st.player.looseEnds.map(le => le.npcId);
    const SHIFT = { debt: [-10, -10], enemy: [-40, -50], secret: [-5, -5], lost: [10, 10], promise: [5, 5] };
    const shiftOf = id => { const le = st.player.looseEnds.find(x => x.npcId === id); return le ? SHIFT[le.kind] : [0, 0]; };
    out.written = st.npcs.filter(n => { const t = T.npcs.find(x => x.id === n.id); return n.rel.start.w !== t.attitude + shiftOf(n.id)[0] || n.attitude !== t.attitude + shiftOf(n.id)[0]; }).map(n => n.id);
    out.trust = ['npc_royce', 'npc_tyler', 'npc_marcus', 'npc_wade', 'npc_dewayne', 'npc_loretta'].map(id => S.npc(id).rel.start.t - shiftOf(id)[1]);
    out.loose = loose.map(id => { const n = S.npc(id); return [n.attitude === n.rel.start.w + n.rel.everyday.w + n.rel.fix.w, n.rel.everyday.w === 0 && n.rel.start.k === 30]; });
    // attitudeDelta: exactly what it says, past the everyday bucket's bound (the rest in fix) and clamped at the edges as before.
    const n = S.npc('npc_royce');
    const a0 = n.attitude;
    const steps = [];
    const delta = d => { const res = S.apply({ effects: [{ op: 'attitudeDelta', npcId: n.id, delta: d }] }); steps.push([res.applied[0], n.attitude, n.rel.everyday.w, n.rel.fix.w]); };
    delta(30);
    delta(-50);
    G.World.forceAttitude(n.id, 95);
    delta(10);
    delta(-10);
    out.delta = { a0, steps };
    // The bookkeeper's attitudeChanges and its per-turn cap, the same numbers.
    const m = S.npc('npc_jodie');
    const j0 = m.attitude;
    out.changes = [S.apply({ attitudeChanges: [{ npcId: m.id, delta: 30 }] }, { source: 'model' }).applied[0], m.attitude - j0];
    // A direct write to attitude holds: read at once, folded into fix at the next recompute.
    const d = S.npc('npc_dewayne');
    d.attitude = -80;
    const read = R.tracksOf(d).w;
    S.apply({ newMemories: [{ npcId: d.id, text: 'stood me up at the counter', weight: 2 }] });
    out.direct = [read, d.attitude, d.rel.w, d.rel.start.w + d.rel.everyday.w + d.rel.fix.w];
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: d.id, delta: -5 }] });
    out.direct.push(d.attitude);
    // The legacy line is typed for its kind and moves nothing.
    out.legacy = d.memories.slice(-1).map(x => [x.event, x.d])[0];
    // The streams for wave 27: a person's own, keyed by the seed (no shared draw), and the burned die.
    const calls = st.meta.rngCalls;
    const a = R.rng('report', 'npc_tyler', 3).next();
    out.rng = [a === R.rng('report', 'npc_tyler', 3).next(), a !== R.rng('report', 'npc_tyler', 4).next(), st.meta.rngCalls === calls];
    G.Pipeline.forceNextRoll(7);
    out.burn = [G.Dice.burn(), st.meta.rngCalls === calls, G.Pipeline.hooks.nextD20];
    const die = G.Dice.burn();
    out.burn.push(Number.isInteger(die) && die >= 1 && die <= 20, st.meta.rngCalls === calls + 1);
    return out;
  });
  assert.deepEqual(r.shape, [], 'everyone has the record');
  assert.deepEqual(r.alias, [], 'attitude is liking, for everyone');
  assert.deepEqual(r.tracks, [['w', 't', 'f', 'k', 's'], ['w', 't', 'f', 'k', 's', 'owed']], 'five tracks and owed');
  assert.deepEqual(r.state, [[], { secrets: {} }, true]);
  assert.deepEqual(r.keys, [false, true, true], 'engine keys: the model cannot send them (socialEvents is the bookkeeper\'s since wave 28)');
  // Changed by design in wave 29 (A4): owedSettle and leverageSet make 31.
  assert.deepEqual(r.ops, [31, true, true], 'the effect ops are 31 with socialEvent; the tables are frozen');
  assert.deepEqual(r.written, [], 'liking starts as the town wrote it');
  assert.deepEqual(r.trust, [5, -5, -15, -10, -5, 0], 'Royce open, Tyler watchful, Marcus police and guarded, Wade a smuggler, Dewayne guarded, Loretta neither');
  assert.ok(r.loose.length && r.loose.every(x => x[0] && x[1]), 'a loose end\'s shift is in their start, with knows-you 30 (wave 27), nothing in everyday: ' + JSON.stringify(r.loose));
  const [s1, s2, s3, s4] = r.delta.steps;
  assert.deepEqual(s1, [`effects[0]: attitudeDelta: npc_royce attitude ${r.delta.a0} -> ${r.delta.a0 + 30}`, r.delta.a0 + 30, 15, 15], 'past the bound: 15 in everyday, the rest in fix');
  assert.deepEqual(s2.slice(1), [r.delta.a0 - 20, -15, -5]);
  assert.deepEqual([s3[1], s4[1]], [100, 90], 'clamped at 100, then down from 100, as attitude always was');
  assert.equal(r.changes[1], 25, 'the bookkeeper is held to 25 a turn, as before');
  assert.match(r.changes[0], /^attitudeChanges\[0\]: npc_jodie -?\d+ -> -?\d+ \(delta \+30 clamped to \+25\)$/);
  assert.deepEqual(r.direct, [-80, -80, -80, -80, -85], 'a direct write holds');
  assert.deepEqual(r.legacy, ['noted', null], 'typed for its kind, d null');
  assert.deepEqual(r.rng, [true, true, true], 'Rel.rng: the same draw for the same key, another for another day, nothing from the shared stream');
  assert.deepEqual(r.burn, [7, true, null, true, true], 'Dice.burn: a forced die is taken; else one d20 drawn and dropped');
  // Debug: every person's line carries the tracks, liking equal to attitude, and the stance.
  await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  const lines = [...dbg.matchAll(/ att (-?\d+) \([a-z]+\).* · w (-?\d+) t (-?\d+) f (\d+) k (\d+) s (\d+) · ([a-z',  ]+)/g)];
  const count = await page.evaluate(() => Game.state.npcs.length);
  assert.equal(lines.length, count, 'one line a person');
  assert.ok(lines.every(m => m[1] === m[2]), 'w is att');
  assert.ok(lines.some(m => m[7].startsWith("doesn't know you")), 'with the stance');
});

s.test('socialEvent: a hit costs liking, trust and gives fear as one wound memory that keeps what it did; pride, guardedness, nerve and grudge-holding scale it and opposites cancel; hard people stop at 39', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    // Dewayne in his own bay (design worked example 1): guarded (g -1), start trust -5.
    const dw = S.npc('npc_dewayne');
    out.axes = R.axesOf(dw);
    const res = S.apply({ effects: [{ op: 'socialEvent', npcId: dw.id, event: 'hit', text: 'hit me in my bay over a tow bill' }] });
    out.res = [res.rejected, res.applied[0]];
    out.after = [dw.attitude, R.tracksOf(dw)];
    out.mems = dw.memories.map(m => ({ event: m.event, weight: m.weight, decay: m.decay, d: m.d, n: m.n, key: m.key, place: m.place, text: m.text }));
    out.where = [st.meta.turn, st.player.locationId];
    out.stance = R.debugLine(dw);
    out.refused = [
      S.apply({ effects: [{ op: 'socialEvent', npcId: dw.id, event: 'slapped', text: 'x' }] }).rejected.map(x => x.reason)[0],
      S.apply({ effects: [{ op: 'socialEvent', npcId: dw.id, event: 'hit' }] }).rejected.map(x => x.reason)[0],
      S.apply({ effects: [{ op: 'socialEvent', npcId: dw.id, event: 'hit', text: 'x', d: { w: -60 } }] }).rejected.map(x => x.reason)[0],
      // Changed by design in wave 28 (A3): the model sends socialEvents now, but a hit is the engine's to record.
      S.apply({ socialEvents: [{ npcId: dw.id, event: 'hit', text: 'x' }] }, { source: 'model', present: [dw.id] }).rejected.map(x => x.reason)[0]
    ];
    // Traits, on people of Rel's own making (Rel is pure: nothing is written).
    const ctx = { s: null, town: null, day: 3, turn: 5 };
    const person = traits => { const n = { id: 'npc_test_x', name: 'Test', personality: traits, tags: [], role: 'clerk', attitude: 0, memories: [] }; n.rel = R.fill(n, null); Object.assign(n.rel, R.recompute(n, 3, ctx)); return n; };
    const ev = (traits, event) => R.applyEvent(person(traits), { event, text: 'x' }, ctx).d;
    out.pride = ['proud vain', 'careful fair', 'shy earnest', 'proud earnest'].map(t => ev(t.split(' '), 'insulted').w);
    out.guarded = ['watchful guarded', 'proud fair', 'genial kind'].map(t => [ev(t.split(' '), 'hit').t, ev(t.split(' '), 'kept_word').t]);
    out.nerve = ['cowardly frightened', 'proud fair', 'unflappable disciplined'].map(t => ev(t.split(' '), 'hit').f);
    const later = traits => { const n = person(traits); const p = R.applyEvent(n, { event: 'hit', text: 'x' }, ctx); n.rel = p.rel; n.memories = p.memories; return R.recompute(n, 13, ctx).w; };
    out.grudge = ['bitter angry', 'proud careful', 'kind gentle'].map(t => later(t.split(' ')));
    out.cancel = ['proud earnest', 'unflappable jumpy', 'kind bitter', 'stubborn fair'].map(t => { const a = R.axesOf({ personality: t.split(' ') }, ctx); return [a.p, a.g, a.n, a.r]; });
    // Hard people: Wade (nerve +1, tough, the Night Run's head) never passes 39 and never gets the override.
    const wade = S.npc('npc_wade');
    S.apply({ effects: [{ op: 'socialEvent', npcId: wade.id, event: 'beat_down', text: 'put me on the ground at the landing' }] });
    S.apply({ beginTurn: true });
    S.apply({ effects: [{ op: 'socialEvent', npcId: wade.id, event: 'threatened', text: 'leaned on me at the landing' }] });
    out.wade = [R.tracksOf(wade).f, R.stance(wade).override, R.stance(wade).tags.includes('uneasy around you'), wade.memories.map(m => m.d.f)];
    out.hard = st.npcs.filter(n => G.presenceOf(n) === 'here' && R.axesOf(n).hard).map(n => n.id).sort();
    return out;
  });
  assert.deepEqual([r.axes.p, r.axes.g, r.axes.n, r.axes.r, r.axes.hard], [0, -1, 0, 0, false]);
  assert.deepEqual(r.res[0], []);
  assert.equal(r.res[1], 'effects[0]: socialEvent: npc_dewayne hit: liking 0 -> -25, trust -5 -> -17, fear 0 -> 20, knows 0 -> 2; remembers "hit me in my bay over a tow bill" (weight 3)');
  assert.deepEqual(r.after, [-25, { w: -25, t: -17, f: 20, k: 2, s: 0, owed: 0 }], 'W -25, T -5 - 10 x 1.15, F 20 (design example 1)');
  assert.deepEqual(r.mems, [{ event: 'hit', weight: 3, decay: 'wound', d: { w: -25, t: -12, f: 20, k: 2, s: 0 }, n: 1, key: `m${r.where[0]}-npc_dewayne`, place: r.where[1], text: 'hit me in my bay over a tow bill' }], 'one wound memory that keeps what it did');
  assert.equal(r.stance, 'w -25 t -17 f 20 k 2 s 0 · against you · uneasy around you');
  assert.match(r.refused[0], /unknown event "slapped"/);
  assert.match(r.refused[1], /needs text/);
  assert.match(r.refused[2], /d\.w must be a whole number within \+\/-50/);
  assert.match(r.refused[3], /hit is the engine's to record, never the bookkeeper's/);
  assert.deepEqual(r.pride, [-15, -10, -5, -10], 'pride +2 x1.5, 0, -2 x0.5; proud and earnest cancel');
  assert.deepEqual(r.guarded, [[-13, 9], [-10, 15], [-7, 21]], 'guardedness: losses x(1 - 0.15g), gains x(1 + 0.2g)');
  assert.deepEqual(r.nerve, [30, 20, 10], 'nerve: fear gains x(1 - 0.25n)');
  assert.deepEqual(r.grudge, [-21, -17, -14], 'ten days on, the grudging still feel it most (half-life x 2^(-r/2))');
  assert.deepEqual(r.cancel, [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0]], 'opposites cancel');
  assert.deepEqual(r.wade, [39, null, true, [26, 13]], 'a beating and a threat: 26 + 19, held at 39; never afraid of you');
  assert.deepEqual(r.hard, HARD, 'the eleven hard people in town');
});

s.test('fading: four classes, one fear clock, trust at the speed of liking; witness copies one class lighter with nothing left over; settlements combine and never lock', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel;
    const out = {};
    const ctx = day => ({ s: null, town: null, day, turn: 1 });
    const one = (mem, day, traits) => { const n = { id: 'npc_test_f', personality: traits || [], tags: [], role: 'clerk', attitude: 0, memories: [mem] }; n.rel = R.fill(n, null); return R.recompute(n, day, ctx(day)); };
    const harm = cls => ({ turn: 1, day: 1, text: 'worked against me', weight: 2, event: 'crossed', d: { w: -20, t: -20, f: 20, k: 2, s: 0 }, decay: cls });
    const CLASSES = ['mood', 'slight', 'wound', 'scar'];
    // At one half-life: floor + (1 - floor) / 2, trust the same as liking; fear on its own four-day clock.
    out.half = CLASSES.map(c => { const x = one(harm(c), 1 + R.DECAY[c][0]); return [x.w, x.t, x.f]; });
    out.fear = CLASSES.map(c => one(harm(c), 5).f);
    out.floors = CLASSES.map(c => { const x = one(harm(c), 400); return [x.w, x.t, x.f, x.k]; });
    out.kind = [one({ turn: 1, day: 1, text: 'bought me a coffee', weight: 1, event: 'gift', d: { w: 20, t: 0, f: 0, k: 2, s: 0 }, decay: 'slight' }, 6).w, one({ turn: 1, day: 1, text: 'bought me a coffee', weight: 1, event: 'gift', d: { w: 20, t: 0, f: 0, k: 2, s: 0 }, decay: 'slight' }, 400).w];
    // A witness's copy: one class lighter, floor 0, so nothing is left; the person it happened to keeps the floor.
    const seen = Object.assign(harm('scar'), { witness: true, text: 'saw you put Colt Purvis down at the landing' });
    out.witness = [one(seen, 11).w, one(seen, 400).w, one(harm('scar'), 400).w, one(Object.assign(harm('wound'), { secondhand: true }), 400).w];
    // Settlements: 1 - (1-a)(1-b), at most two (plus getting even); nothing deleted, nothing locked.
    const settled = list => one(Object.assign(harm('keeps'), { settled: list }), 1);
    const apol = { turn: 2, day: 1, by: 'apologised', w: 0.5, t: 0.25, f: 0 };
    out.combine = [settled([]), settled([apol]), settled([apol, apol])].map(x => [x.w, x.t, x.f]);
    // Through the engine: Dewayne is hit, then apologised to three times; he gets even once.
    const dw = S.npc('npc_dewayne');
    S.apply({ effects: [{ op: 'socialEvent', npcId: dw.id, event: 'hit', text: 'hit me in my bay over a tow bill' }] });
    const hitPart = () => R.remainder(dw.memories.find(m => m.event === 'hit'), dw).w;
    const parts = [hitPart()];
    for (let i = 0; i < 3; i++) {
      S.apply({ beginTurn: true });
      const res = S.apply({ effects: [{ op: 'socialEvent', npcId: dw.id, event: 'apologised', text: 'sorry about the bay' }] });
      parts.push([hitPart(), /softens "hit me in my bay over a tow bill"/.test(res.applied[0] || '')]);
    }
    const i = dw.memories.findIndex(m => m.event === 'hit');
    const even = R.settle(dw, i, 'got_even');
    out.engine = { parts, settled: dw.memories[i].settled.map(x => [x.by, x.w, x.t, x.f]), even: [even.ok, even.ok ? R.remainder(even.memories[i], dw).w : null], still: dw.memories.some(m => m.event === 'hit') };
    // The bookkeeper's memoriesSettled: a typed memory is softened, never deleted; a line that moves nothing goes, as before.
    const ty = S.npc('npc_tyler');
    S.apply({ effects: [{ op: 'socialEvent', npcId: ty.id, event: 'threatened', text: 'leaned on me at the desk over the clips' }] });
    S.apply({ newMemories: [{ npcId: ty.id, text: 'laughed at my haircut', weight: 1 }] });
    const before = ty.attitude;
    const r1 = S.apply({ memoriesSettled: [{ npcId: ty.id, text: 'leaned on me at the desk' }] });
    const r2 = S.apply({ memoriesSettled: [{ npcId: ty.id, text: 'laughed at my haircut' }] });
    out.legacy = [r1.applied[0], r2.applied[0], ty.memories.map(m => m.event), ty.attitude - before];
    return out;
  });
  assert.deepEqual(r.half, [[-10, -10, 14], [-12, -12, 8], [-14, -14, 4], [-16, -16, 1]], 'mood 2 days, slight 5 (floor 0.2), wound 10 (0.4), scar 21 (0.6); trust with liking');
  assert.deepEqual(r.fear, [10, 10, 10, 10], 'one fear clock: halved in four days, whatever the class');
  assert.deepEqual(r.floors, [[0, 0, 0, 2], [-4, -4, 0, 2], [-8, -8, 0, 2], [-12, -12, 0, 2]], 'the floors stay; fear has none; knows-you never fades');
  assert.deepEqual(r.kind, [10, 0], 'a kind slight has no floor');
  assert.deepEqual(r.witness, [-10, 0, -12, 0], 'a witness copy fades as a wound with nothing left over; a secondhand one too');
  assert.deepEqual(r.combine, [[-20, -20, 20], [-10, -15, 20], [-5, -11, 20]], 'an apology: half the liking, a quarter of the trust, never fear; two combine');
  const [p0, p1, p2, p3] = r.engine.parts;
  assert.deepEqual([p0, p1, p2, p3], [-25, [-12.5, true], [-6.25, true], [-6.25, false]], 'two apologies combine; a third settles nothing more');
  assert.deepEqual(r.engine.settled, [['apologised', 0.5, 0.25, 0], ['apologised', 0.5, 0.25, 0]]);
  assert.deepEqual(r.engine.even, [true, -3.75], 'getting even counts beyond the two');
  assert.equal(r.engine.still, true, 'never deleted');
  assert.match(r.legacy[0], /^memoriesSettled\[0\]: npc_tyler lets some of "leaned on me at the desk over the clips" go$/);
  assert.match(r.legacy[1], /^memoriesSettled\[0\]: npc_tyler let go of "laughed at my haircut"$/);
  assert.deepEqual(r.legacy[2], ['threatened'], 'the typed one stays, the legacy one goes');
  assert.ok(r.legacy[3] > 0, 'and liking comes back some');
});

s.test('repeats and bounds: kind things diminish the same day and across days, harm compounds and merges, everyday stops at 15, every event teaches at least 2 of knowing', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    // People with no pride, guardedness, nerve or grudge to scale anything.
    const adults = st.npcs.filter(n => G.presenceOf(n) === 'here' && n.status === 'free' && !R.isMinor(n));
    // Changed by design in wave 29 (A4): content marks five people mercenary (Curtis and Shayla were plain); the flag scales only money and
    // blackmail, so they come last and are never the one given gifts.
    const plain = adults.filter(n => (x => !x.p && !x.g && !x.n && !x.r && !x.hard)(R.axesOf(n))).sort((x, y) => R.axesOf(x).mercenary - R.axesOf(y).mercenary);
    const [a, b, c, d, e] = plain;
    out.giftsPlain = !R.axesOf(c).mercenary;
    // Anyone else, for what no trait scales (everyday liking, knowing).
    const [f, g] = adults.filter(n => !plain.includes(n));
    out.people = plain.length;
    const ev = (n, event, text, extra) => S.apply({ effects: [Object.assign({ op: 'socialEvent', npcId: n.id, event, text }, extra || {})] });
    const day = x => S.apply({ setTime: { day: x, phase: 'morning' } });
    // Kind things the same day: 1, 1/2, 1/4, then nothing (and still 2 of knowing).
    for (let i = 0; i < 4; i++) ev(a, 'complimented', `said my pie was the best in the county ${i}`);
    out.same = a.memories.map(m => [m.d.w, m.d.k]);
    // Across days: time together counts in full three days, then W +1, K +2; twice in a day is once.
    const d0 = st.time.day;
    for (let i = 0; i < 4; i++) { day(d0 + i); ev(b, 'spent_time', 'sat with me at the counter'); }
    ev(b, 'spent_time', 'sat with me at the counter again');
    out.across = [b.rel.everyday.w, b.rel.everyday.k, b.memories.length, b.rel.days.spent_time];
    // A gift a day: in full three days, then +1; a second the same day, nothing.
    for (let i = 0; i < 4; i++) { day(d0 + 4 + i); ev(c, 'gift', `gave me a jar of honey ${i}`); }
    ev(c, 'gift', 'gave me a second jar');
    out.gifts = c.memories.map(m => m.d.w);
    // Harm repeated within three days compounds (x1.5, then x2.25) and merges into one memory, its weight rising to 3.
    for (let i = 0; i < 3; i++) { S.apply({ beginTurn: true }); ev(d, 'insulted', ['called me a liar', 'kept calling me a liar', 'called me a liar again'][i]); }
    out.compound = [d.memories.length, d.memories[0].n, d.memories[0].weight, d.memories[0].d.w, d.attitude - R.startOf(d, G.State.town.npcs.find(x => x.id === d.id)).w, d.memories[0].text];
    day(st.time.day + 5);
    S.apply({ beginTurn: true });
    ev(d, 'insulted', 'called me a liar a week on');
    out.apart = [d.memories.length, d.memories[1].d.w, d.memories[1].n];
    // One turn holds one person to liking -40, trust -45, fear -40.
    S.apply({ beginTurn: true });
    ev(e, 'beat_down', 'beat me at the landing');
    ev(e, 'hit', 'hit me again at the landing');
    out.turn = [R.tracksOf(e).w - e.rel.start.w, e.memories.map(m => [m.event, m.d.w, m.d.f])];
    // Everyday stops at 15 (attitudeDelta, by its old meaning, puts the rest in fix).
    day(st.time.day + 1);
    ev(f, 'spent_time', 'stood a round', { d: { w: 10 } });
    day(st.time.day + 1);
    ev(f, 'spent_time', 'stood another round', { d: { w: 10 } });
    out.everyday = [f.rel.everyday.w, f.rel.fix.w];
    // Knowing: every row teaches 2 or more, and so does any event (a d of 0 is still 2).
    out.rows = Object.entries(R.EVENTS).filter(([, x]) => !(x.k >= 2)).map(([k]) => k);
    ev(g, 'noted', 'says she is from the state', { d: { k: 0 } });
    out.knows = g.rel.k;
    return out;
  });
  assert.ok(r.people >= 5 && r.giftsPlain, 'enough plain people: ' + r.people);
  assert.deepEqual(r.same, [[3, 2], [2, 2], [1, 2], [0, 2]], 'compliments the same day: 3, 2, 1, 0, and 2 of knowing each');
  assert.deepEqual(r.across, [7, 16, 0, 3], 'time together: 2 + 2 + 2 + 1 liking, 4 + 4 + 4 + 2 knowing; the second the same day adds no liking and the least knowing, 2');
  assert.deepEqual(r.gifts, [5, 5, 5, 1, 0], 'gifts: three days in full, then 1; a second the same day 0');
  assert.deepEqual(r.compound.slice(0, 5), [1, 3, 3, -48, -48], 'three insults: -10, -15, -23 in one memory, merged three times, weight 3');
  assert.equal(r.compound[5], 'called me a liar again', 'the newest words');
  assert.deepEqual(r.apart, [2, -10, 1], 'five days on, a new memory at full value');
  assert.deepEqual(r.turn, [-40, [['beat_down', -35, 35], ['hit', -5, 5]]], 'one turn: liking held to -40, fear to 40');
  assert.deepEqual(r.everyday, [15, 0], 'everyday stops at 15');
  assert.deepEqual(r.rows, [], 'every event teaches at least 2 of knowing');
  assert.equal(r.knows, 2);
});

s.test('the stance: twelve phrases with five points of hysteresis, devoted needs trust above zero, the fear override only between -60 and 25', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const R = Game.Rel;
    const out = {};
    const CTX = { s: null, town: null, day: 1, turn: 1 };
    const harm3 = [{ turn: 1, day: 1, text: 'beat me senseless behind the bar', weight: 3, event: 'beat_down', d: null }];
    const met = [{ turn: 1, day: 1, text: 'asked about the weather', weight: 1, event: 'noted', d: null }];
    const make = (w, t, f, opts, ctx) => {
      const n = Object.assign({ id: 'npc_test_s', name: 'Test', personality: [], tags: [], role: 'clerk', attitude: w, memories: [] }, opts || {});
      n.rel = R.fill(n, null);
      n.rel.fix.t = t;
      n.rel.fix.f = f || 0;
      Object.assign(n.rel, R.recompute(n, 1, ctx || CTX));
      return n;
    };
    const st = (w, t, f, opts, ctx) => R.stance(make(w, t, f, opts, ctx), ctx || CTX);
    const ph = (w, t, f, opts) => st(w, t, f, opts).phrase;
    out.grid = [
      ph(-70, 0, 0, { memories: harm3 }), ph(-70, 0), ph(-30, 30),
      ph(-10, -30), ph(-10, 0), ph(-10, 30),
      ph(0, -30), ph(0, 0), ph(0, 0, 0, { memories: met }), ph(0, 30),
      ph(10, -30), ph(10, 0), ph(10, 30),
      ph(30, -30), ph(30, 0), ph(30, 30),
      ph(70, -30), ph(70, 10), ph(70, 0), ph(70, 30)
    ];
    out.phrases = R.PHRASES.slice();
    // Hysteresis: entered at the edge, left five back toward the middle.
    const n = make(0, 0);
    const walk = (track, values) => values.map(v => { n.rel.everyday.w = 0; n.rel.everyday.t = 0; n.rel.fix[track] = v; Object.assign(n.rel, R.recompute(n, 1, CTX)); return n.rel.bands[track]; });
    out.liking = walk('w', [25, 21, 20, 19, 24, 25, 61, 56, 55, 54, -6, -1, 0, -60, -55, -54]);
    n.rel.fix.w = 0;
    out.trust = walk('t', [-25, -20, -19, -24, -25, 25, 20, 19]);
    // Fear: the override only while liking is in [-60, 25); outside it the stance stands with a tag; a hard person never gets there.
    out.fear = [ph(-30, 0, 45), ph(-60, 0, 45), ph(24, 0, 45), ph(25, 0, 45), ph(-61, 0, 45, { memories: harm3 }), ph(-30, 0, 39)];
    out.tags = [st(30, 0, 45).tags, st(-70, 0, 45, { memories: harm3 }).tags, st(-30, 0, 25).tags, st(-30, 0, 17).tags];
    out.hard = [st(-30, 0, 60, { tags: ['tough'] }).phrase, st(-30, 0, 60, { tags: ['tough'] }).tags, R.tracksOf(make(-30, 0, 60, { tags: ['tough'] })).f];
    // Fear from what the player holds over them: "afraid of what you know" when that is the larger share.
    const held = { s: { leverage: [{ holder: 'player', over: 'npc_test_s', aware: true, status: 'held', weight: 3 }], player: { age: 30, looseEnds: [] }, meta: { townName: 'Elsewhere' }, threads: [] }, town: null, day: 1, turn: 1 };
    out.know = [st(-10, 0, 15, {}, held), st(-10, 0, 35, {}, held)].map(x => [x.phrase, x.tags]);
    // The cue: present demeanour, twelve words at most, whole clauses.
    out.cue = [R.cue(make(-30, 0, 0)), R.cue(make(-30, 0, 45)), R.cue(make(0, 0, 0))];
    return out;
  });
  assert.deepEqual(r.grid, [
    'hates you', 'against you', 'against you',
    'suspicious of you', 'cool to you', 'takes you at your word',
    'suspicious of you', "doesn't know you", 'sizing you up', 'takes you at your word',
    'suspicious of you', 'friendly', 'friendly',
    "fond of you, doesn't trust you", 'warm to you', 'in your corner',
    "fond of you, doesn't trust you", 'loyal to you', 'warm to you', 'in your corner'
  ], 'the grid; "hates you" needs a weight-3 harm, "doesn\'t know you" no memories, devoted needs trust above 0');
  assert.deepEqual(Array.from(new Set(r.grid)).sort(), r.phrases.slice().sort(), 'twelve phrases');
  assert.deepEqual(r.liking, ['warm', 'warm', 'warm', 'friendly', 'friendly', 'warm', 'devoted', 'devoted', 'devoted', 'warm', 'cool', 'cool', 'neutral', 'hates', 'hates', 'dislikes']);
  assert.deepEqual(r.trust, ['distrusts', 'distrusts', 'unsure', 'unsure', 'distrusts', 'trusts', 'trusts', 'unsure']);
  assert.deepEqual(r.fear, ['afraid of you', 'afraid of you', 'afraid of you', 'warm to you', 'hates you', 'against you']);
  assert.deepEqual(r.tags, [['wary of your temper'], ['and afraid of you'], ['uneasy around you'], []], 'outside the window the stance stands with a tag; uneasy is entered at 20 (fear 17, never higher, is calm)');
  assert.deepEqual(r.hard, ['against you', ['uneasy around you'], 39], 'a hard person: fear held at 39, no override');
  assert.deepEqual(r.know, [['afraid of what you know', []], ['afraid of you', ['you have something on them']]]);
  // Changed by design in wave 30: "would rather you left" for the design's "wants you gone" (the minor checks read "wants you" as the spark status).
  assert.deepEqual(r.cue, ['polite as a locked door, would rather you left', 'agrees fast, won\'t meet your eye, keeps their distance', 'treats you like a stranger'], 'the override\'s clause leads; the cell\'s does not fit in twelve words');
  for (const c of r.cue) assert.ok(c.split(/\s+/).length <= 12, c);
});

s.test('spark stays 0 for Kaylee, Micah and Austin and for anyone not eligible, from every writer: model, world, edit, import, upgrade, cheat', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, W = G.World;
    const st = () => G.state;
    const out = {};
    // The minors, from the data: under 18 in the cast.
    out.byData = G.data.TOWN_DATA.npcs.filter(n => n.age < 18).map(n => n.id);
    out.minors = st().npcs.filter(n => R.isMinor(n)).map(n => n.id);
    out.names = out.minors.map(id => S.npc(id).name.split(' ')[0]);
    out.eligible = [st().npcs.filter(n => R.eligible(n)).length, R.romanceOf().length];
    const [k, m, a] = out.minors;
    // Changed by design in wave 29 (A4): Jodie is on the shipped romance list; Dewayne, an adult nobody listed, stands in for her.
    const adult = 'npc_dewayne';
    const sparkOf = id => { const n = S.npc(id); return [n.rel.s, n.rel.start.s, n.rel.everyday.s, n.rel.fix.s].concat(n.memories.filter(x => x.d).map(x => x.d.s)); };
    const refusals = where => S.debugLog.filter(x => x.kind === 'rejected' && x.source === 'rel' && (!where || String(x.path).startsWith(where))).map(x => x.reason);
    // The model: it cannot send events at all; its attitudeChanges move liking only.
    // Changed by design in wave 28 (A3): it sends events now, and a flirt naming someone under 18 is set aside for the minor rule, never written.
    const fl = S.apply({ socialEvents: [{ npcId: k, event: 'flirted', text: 'winked at me at the register' }] }, { source: 'model', present: [k] });
    out.model = [fl.rejected.map(x => x.reason), fl.applied.join(' | '), fl.minors, S.npc(k).memories.length];
    S.apply({ attitudeChanges: [{ npcId: k, delta: 10 }] }, { source: 'model', present: [k] });
    // The world (content and the engine): a row's spark is held at 0 and logged; spark given outright is refused.
    const w1 = W.applyEffects([{ op: 'socialEvent', npcId: m, event: 'flirted', text: 'said something at the landing' }]);
    const w2 = W.applyEffects([{ op: 'socialEvent', npcId: m, event: 'flirted', text: 'said something again', d: { s: 20 } }]);
    const w3 = W.applyEffects([{ op: 'socialEvent', npcId: adult, event: 'intimate', text: 'a night together' }]);
    out.world = [w1.rejected.length, w2.rejected.map(x => x.reason), w3.rejected.length, refusals()];
    // The editor.
    out.edit = [
      S.apply({ editPerson: { npcId: a, rel: { s: 15 } } }, { source: 'player' }).rejected.map(x => x.reason),
      S.apply({ editPerson: { npcId: adult, rel: { s: 1 } } }, { source: 'player' }).rejected.map(x => x.reason),
      S.apply({ editPerson: { npcId: a, rel: { s: 0, t: 12 } } }, { source: 'player' }).edited
    ];
    // An edit can make someone a minor, never an adult: Micah at 30 is still 17 by the town.
    S.apply({ editPerson: { npcId: m, age: 30 } }, { source: 'player' });
    out.older = R.isMinor(S.npc(m));
    // The upgrade's own write (setMemories): a typed memory carrying spark has it set to 0, logged.
    S.apply({ setMemories: [{ npcId: k, memories: [{ turn: 0, day: 1, text: 'brought me flowers', weight: 2, event: 'flirted', d: { w: 4, t: 0, f: 0, k: 2, s: 25 } }] }] });
    out.upgrade = refusals('setMemories.');
    // The cheat's (relSet, World.forceAttitude's op).
    out.cheat = [S.apply({ relSet: { npcId: k, s: 40 } }).rejected.map(x => x.reason), S.apply({ relSet: { npcId: adult, s: 5 } }).rejected.length, W.forceAttitude(k, 30)];
    // An import that sets spark everywhere, on a minor stripped of every anchor in the save and on an adult nobody listed.
    const old = JSON.parse(JSON.stringify(st()));
    const town = JSON.parse(JSON.stringify(S.town));
    for (const id of [m, adult]) {
      const n = old.npcs.find(x => x.id === id);
      Object.assign(n.rel, { s: 60 });
      n.rel.start.s = 10; n.rel.everyday.s = 5; n.rel.fix.s = 60;
      n.memories.push({ turn: 1, day: 1, text: 'stood close at the counter', weight: 1, event: 'flirted', d: { w: 4, t: 0, f: 0, k: 2, s: 30 } });
    }
    const mm = old.npcs.find(x => x.id === m);
    delete mm.age; mm.tags = []; mm.role = 'works the bait shop';
    const tm = town.npcs.find(x => x.id === m);
    delete tm.age; tm.tags = [];
    S.load(old, town);
    out.import = [R.isMinor(S.npc(m)), refusals('load.')];
    // A player under 18, or of no recorded age, opens spark for nobody (romance only).
    const p = st().player;
    const ages = [16, undefined, 30].map(x => { if (x === undefined) delete p.age; else p.age = x; return R.playerMinor(); });
    p.age = 30;
    out.player = ages;
    // Fails closed: no age anywhere and a role that reads as a teen.
    out.closed = [R.isMinor({ id: 'npc_test_q', role: 'a high school student', tags: [] }, { s: null, town: null }), R.isMinor({ id: 'npc_test_r', role: 'mechanic', tags: [] }, { s: null, town: null })];
    out.after = [k, m, a, adult].map(sparkOf);
    out.everyone = st().npcs.filter(n => n.rel.s || n.rel.start.s || n.rel.everyday.s || n.rel.fix.s || n.memories.some(x => x.d && x.d.s)).map(n => n.id);
    return out;
  });
  assert.deepEqual(r.minors, r.byData, 'the minors are the cast\'s under-18s');
  assert.deepEqual(r.names, ['Kaylee', 'Micah', 'Austin']);
  // Changed by design in wave 29 (A4): the town ships its romance list, twelve adults.
  assert.deepEqual(r.eligible, [12, 12], 'twelve on the romance list');
  assert.deepEqual(r.model[0], [], 'not refused: set aside');
  assert.match(r.model[1], /npc_kaylee is under 18 and this turn pointed something romantic at them: set aside for the minor rule/);
  assert.deepEqual(r.model[2], ['npc_kaylee'], 'the minor rule hears of it (Pipeline.minorTurn)');
  assert.equal(r.model[3], 0, 'nothing written for her');
  assert.equal(r.world[0], 0, 'the flirt applies, its spark held at 0');
  assert.match(r.world[1][0], /spark stays 0 for npc_micah: they are under 18/);
  assert.equal(r.world[2], 0);
  assert.ok(r.world[3].some(x => /npc_micah: spark stays 0 \(under 18\)/.test(x)) && r.world[3].some(x => /npc_dewayne: spark stays 0 \(not on the romance list\)/.test(x)), 'logged: ' + r.world[3].join(' | '));
  assert.match(r.edit[0][0], /spark stays 0 for npc_austin: they are under 18/);
  assert.match(r.edit[1][0], /spark stays 0 for npc_dewayne: they are not on the town's romance list/);
  // Changed by design in wave 30: an edit names the track it moved, so the pinned field reads 'trust', not 'rel'.
  assert.deepEqual(r.edit[2], [{ id: 'npc_austin', fields: ['trust'] }], 'spark 0 is no change; trust lands');
  assert.equal(r.older, true);
  assert.match(r.cheat[0][0], /spark stays 0 for npc_kaylee/);
  assert.equal(r.cheat[1], 1);
  assert.equal(r.cheat[2], 30, 'the cheat moves liking');
  assert.deepEqual(r.upgrade, ['spark set to 0 for npc_kaylee: they are under 18']);
  assert.deepEqual(r.import, [true, ["spark set to 0 for npc_dewayne: they are not on the town's romance list", 'spark set to 0 for npc_micah: they are under 18']], 'still a minor by the live town; both imports zeroed and logged (in cast order)');
  assert.deepEqual(r.player, [true, true, false]);
  assert.deepEqual(r.closed, [true, false]);
  for (const x of r.after) assert.ok(x.every(v => v === 0), JSON.stringify(r.after));
  assert.deepEqual(r.everyone, [], 'nobody has spark anywhere');
});

s.test('/undo restores everything; /rewind strikes stamped settlements, owed entries and asks and keeps the everyday small things', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel;
    const out = {};
    const turn = text => S.apply({ beginTurn: true, logEntry: { input: text, narration: text } });
    const ev = (id, event, text) => S.apply({ effects: [{ op: 'socialEvent', npcId: id, event, text }] });
    turn('I walk into the bay');
    // /undo: a snapshot back, byte for byte.
    const before = JSON.stringify(G.state);
    S.snapshot();
    ev('npc_dewayne', 'hit', 'hit me in my bay over a tow bill');
    ev('npc_dewayne', 'apologised', 'said sorry for the bay');
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: 'npc_dewayne', delta: 7 }] });
    const changed = JSON.stringify(G.state) !== before;
    S.undoSteps(1);
    out.undo = [changed, JSON.stringify(G.state) === before];
    // /rewind: the hit on the kept turn; the apology, a favour, an ask, time together and a small change on the struck one.
    ev('npc_dewayne', 'hit', 'hit me in my bay over a tow bill');
    const kept = G.state.meta.turn;
    const n = () => S.npc('npc_dewayne');
    n().rel.asks.push({ turn: kept, day: 1, act: 'deceive', ok: false, about: 'said the tow bill was paid' });
    turn('I come back to the bay');
    ev('npc_dewayne', 'apologised', 'said sorry for the bay');
    ev('npc_dewayne', 'did_favour', 'fetched his tools from the truck');
    ev('npc_dewayne', 'spent_time', 'sat with him over coffee');
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: 'npc_dewayne', delta: 3 }] });
    n().rel.asks.push({ turn: G.state.meta.turn, day: 1, act: 'deceive', ok: true, about: 'said the truck was his' });
    const hit = () => n().memories.find(m => m.event === 'hit');
    out.before = { settled: (hit().settled || []).length, owed: n().rel.owed.length, asks: n().rel.asks.length, everyday: [n().rel.everyday.w, n().rel.everyday.k], mems: n().memories.map(m => m.event), recent: n().rel.recent.length };
    const res = S.apply({ rewind: { turn: kept } });
    out.rewound = [res.rejected, res.rewound && res.rewound.struck];
    out.after = { settled: hit().settled, owed: n().rel.owed, asks: n().rel.asks.map(x => x.turn), everyday: [n().rel.everyday.w, n().rel.everyday.k], mems: n().memories.map(m => m.event), recent: n().rel.recent.map(x => x.ev), today: n().rel.today };
    // Liking reads the kept memory at full again, plus what everyday kept.
    out.liking = [n().attitude, n().rel.start.w + Math.round(R.remainder(hit(), n()).w) + n().rel.everyday.w + n().rel.fix.w];
    return out;
  });
  assert.deepEqual(r.undo, [true, true], '/undo: everything back');
  assert.deepEqual(r.before, { settled: 1, owed: 1, asks: 2, everyday: [7, 6], mems: ['hit', 'did_favour'], recent: 4 }, 'everyday: the apology +2, time together +2, attitudeDelta +3; knowing 2 + 4');
  assert.deepEqual(r.rewound, [[], 1]);
  assert.deepEqual(r.after.settled, undefined, 'the struck turn\'s settlement is gone');
  assert.deepEqual(r.after.owed, [], 'and its favour');
  assert.equal(r.after.asks.length, 1, 'the kept turn\'s ask stays, the struck one goes');
  assert.deepEqual(r.after.everyday, [7, 6], 'the everyday small things stay');
  assert.deepEqual(r.after.mems, ['hit'], 'memories of the struck turn go, as before');
  assert.deepEqual(r.after.recent, ['hit']);
  assert.equal(r.after.today, null, 'today began on a struck turn: counted again');
  assert.equal(r.liking[0], r.liking[1]);
});

s.test('an older save loads with liking exactly its attitude and plays as before', async h => {
  const page = await h.open();
  await quickStart(page);
  await sendText(page, 'I look around');
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel;
    const out = {};
    const st = G.state;
    const loose = st.player.looseEnds.map(le => le.npcId);
    const free = st.npcs.filter(n => n.status === 'free' && !loose.includes(n.id) && !n.memories.length);
    const [a, b, c] = free;
    // Some history: past everyday's bound, a weight-3 grievance, a direct write.
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: a.id, delta: 37 }] });
    S.apply({ newMemories: [{ npcId: b.id, text: 'broke my window', weight: 3 }] });
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: b.id, delta: -22 }] });
    c.attitude = -33;
    const save = JSON.parse(JSON.stringify(G.state));
    const town = JSON.parse(JSON.stringify(S.town));
    // The same game as a build before wave 26 saved it: nobody has rel, no leverage or known, memories untyped.
    const old = JSON.parse(JSON.stringify(save));
    delete old.leverage;
    delete old.known;
    for (const n of old.npcs) { delete n.rel; for (const m of n.memories) { delete m.event; delete m.d; } }
    const attitudes = old.npcs.map(n => n.attitude);
    S.load(JSON.parse(JSON.stringify(old)), town);
    const L = G.state;
    out.exact = L.npcs.filter((n, i) => n.attitude !== attitudes[i] || n.rel.w !== n.attitude).map(n => n.id);
    out.buckets = L.npcs.filter(n => n.rel.start.w + n.rel.everyday.w + n.rel.fix.w !== n.attitude || Math.abs(n.rel.everyday.w) > 15).map(n => n.id);
    out.start = L.npcs.filter(n => { const t = town.npcs.find(x => x.id === n.id); return n.rel.start.w !== (t ? t.attitude : 0); }).map(n => n.id);
    out.lists = [L.leverage, L.known];
    out.untyped = L.npcs.every(n => n.memories.every(m => m.d === undefined && m.event === undefined));
    out.trust = L.npcs.filter(n => n.rel.start.t !== R.startOf(n, town.npcs.find(x => x.id === n.id)).t).map(n => n.id);
    // It plays as before: the same morning, from the save as it was and from the older one, moves everyone the same.
    const morning = state => {
      S.load(JSON.parse(JSON.stringify(state)), town);
      G.World.tick({ to: { day: G.state.time.day + 1, phase: 'morning' } });
      S.apply({ effects: [{ op: 'attitudeDelta', npcId: a.id, delta: -4 }], attitudeChanges: [{ npcId: b.id, delta: 6 }] });
      return G.state.npcs.map(n => [n.id, n.attitude]);
    };
    const A = morning(save);
    const B = morning(old);
    // Changed by design in wave 27 (A2: fading replaces the drift): only the everyday bucket drifts, on a day the player did not see them;
    // a direct write in this build's save is fix (it never drifts), in the older save it was filled into everyday, so only c may differ.
    out.same = JSON.stringify(A.filter(x => x[0] !== c.id)) === JSON.stringify(B.filter(x => x[0] !== c.id));
    out.moved = [a, b, c].map(n => [attitudes[old.npcs.findIndex(x => x.id === n.id)], B.find(x => x[0] === n.id)[1]]);
    out.c = A.find(x => x[0] === c.id)[1];
    out.unseen = [a, b, c].map(n => !(save.seen && save.seen[n.id] && save.seen[n.id].day === save.time.day));
    out.base = [a, b, c].map(n => (town.npcs.find(x => x.id === n.id) || {}).attitude || 0);
    return out;
  });
  assert.deepEqual(r.exact, [], 'liking is exactly the attitude saved');
  assert.deepEqual(r.buckets, [], 'start + everyday (within 15) + fix');
  assert.deepEqual(r.start, [], 'start from the save\'s town');
  assert.deepEqual(r.lists, [[], { secrets: {} }]);
  assert.equal(r.untyped, true, 'its memories move nothing until rules version 9');
  assert.deepEqual(r.trust, [], 'trust from the start rules');
  assert.equal(r.same, true, 'the older save plays exactly as the same save from this build');
  const [ma, mb, mc] = r.moved;
  const step = i => (r.unseen[i] ? 2 : 0);
  assert.deepEqual(ma, [r.base[0] + 37, r.base[0] + 37 - step(0) - 4], 'the everyday part two back toward 0 on a morning after a day unseen, then the change');
  assert.deepEqual(mb, [r.base[1] - 22, r.base[1] - 22 + step(1) + 6], 'a weight-3 line that moves nothing no longer holds it (wave 27)');
  assert.deepEqual(mc, [-33, -33 + step(2)], 'a direct write in an older save was everyday, and drifts from where it was written');
  assert.equal(r.c, -33, 'the same write in this build\'s save is fix: it never drifts');
  // And a turn plays, every alias still liking.
  await sendText(page, 'I look around');
  const ok = await page.evaluate(() => Game.state.npcs.every(n => n.attitude === n.rel.w && Number.isInteger(n.rel.t)));
  assert.equal(ok, true);
});

s.run();
