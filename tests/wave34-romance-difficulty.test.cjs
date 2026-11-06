'use strict';
/* Wave 34 (3 Nov 2026): "anyone can be won over, some the hard way". The
   owner: "There is characters that will go from 0 to 100 easier than
   others. But everyone should be allowed to go to 100. Like if I try to
   romance dewayne who's straight, i can succeed, barely, but Jodie should
   be easier for example." Every adult is eligible; the town's romance list
   is per-person tuning (anyone not listed: spark rate 0.5, opens at knows
   10, hard); a flirt is a charm roll at the person's difficulty, eased a
   step at spark 20 and two at 40, and the tier decides how it lands. The
   dice are forced as the suite forces them elsewhere (hooks.nextD20 and
   nextTier). Mock mode. Run with: node tests/run.cjs wave34 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave34-romance-difficulty');
const ROOT = path.resolve(__dirname, '..');

/* In the page: __put (the player somewhere with these people, now), __say
   (a Say line with its parse; __roll(d20 or tier) forces the next die
   first), __do (a Do line with its parse, narration and bookkeeper reply),
   __tr (the tracks), __flirts (their flirted memories since a turn), __rom
   (the narrator's ROMANCE lines), __roll. */
const kit = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  G.Api.Mock.clear();
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    if (ids && ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__roll = want => { if (Number.isInteger(want)) G.Pipeline.forceNextRoll(want); else G.Pipeline.hooks.nextTier = want; };
  window.__say = async (to, words, parse, book) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    G.Api.Mock.queue('bookkeep', book || {});
    await G.Pipeline.submit(words, { mode: 'say', to });
    const c = G.Pipeline.lastTurn.ctx;
    return { roll: c.roll ? [c.roll.stat, c.roll.difficulty, c.roll.tier] : null, line: c.roll ? c.roll.line : null, rom: __rom() };
  };
  window.__do = async (words, parse, narration, book) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'other', summary: words, targets: [], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (narration) G.Api.Mock.queue('narrate', { text: narration });
    G.Api.Mock.queue('bookkeep', book || {});
    await G.Pipeline.submit(words, { mode: 'do' });
    const c = G.Pipeline.lastTurn.ctx;
    return { roll: c.roll ? [c.roll.stat, c.roll.difficulty, c.roll.tier] : null, rom: __rom(), aimed: c.romance ? c.romance.aimed : null };
  };
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
  window.__flirts = (id, since) => G.State.npc(id).memories.filter(m => m.event === 'flirted' && m.turn > since);
  window.__rom = () => G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE/.test(l));
  window.D = 'npc_dewayne';
  window.J = 'npc_jodie';
});
const start = async h => { const page = await h.open(); await quickStart(page, { kinds: [] }); await kit(page); return page; };
const D = 'npc_dewayne';
const J = 'npc_jodie';

s.test('(a) an unlisted adult can be won over, the hard way: Dewayne is hard, a 17 succeeds for spark +5 at his rate 0.5, a partial changes nothing, a failure costs the unwelcome row', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: [D] });
    out.tuning = R.tuningOf(S.npc(D));
    out.listed = (S.town.romance || []).some(x => x.npcId === D);
    out.eligible = R.eligible(S.npc(D));
    S.apply({ relSet: { npcId: D, k: 12 } });
    out.welcome = R.welcomeOf(S.npc(D));
    // Day 2: a 17 against hard (15).
    __put('loc_pittmans', [D], 2, 'afternoon');
    let t0 = __tr(D);
    let turn = st.meta.turn;
    __roll(17);
    out.success = Object.assign(await __say(D, 'You clean up nice, you know that?', { romantic: 'flirt' }), { ds: __tr(D).s - t0.s, dw: __tr(D).w - t0.w, mems: __flirts(D, turn).map(m => [m.text, m.d.s]) });
    // Day 3: a partial: turned aside, kindly; nothing changes.
    __put('loc_pittmans', [D], 3, 'afternoon');
    t0 = __tr(D);
    turn = st.meta.turn;
    __roll('partial');
    out.partial = Object.assign(await __say(D, 'Buy you a beer after you close up?', { romantic: 'flirt' }), { d: [__tr(D).w - t0.w, __tr(D).t - t0.t, __tr(D).s - t0.s], mems: __flirts(D, turn).length });
    // Day 4: a failure: unwelcome, liking -3 the first time, trust and spark down.
    __put('loc_pittmans', [D], 4, 'afternoon');
    t0 = __tr(D);
    turn = st.meta.turn;
    __roll('failure');
    out.failure = Object.assign(await __say(D, 'You ever think about me?', { romantic: 'flirt' }), { d: [__tr(D).w - t0.w, __tr(D).t - t0.t, __tr(D).s - t0.s], mems: __flirts(D, turn).map(m => m.text) });
    // Day 5: a failure again costs liking 6.
    __put('loc_pittmans', [D], 5, 'afternoon');
    t0 = __tr(D);
    __roll('failure');
    await __say(D, 'Come on, one drink.', { romantic: 'flirt' });
    out.again = __tr(D).w - t0.w;
    return out;
  });
  // Wave 35: romanceRate, defaulting to the sparkRate.
  assert.deepEqual(r.tuning, { sparkRate: 0.5, romanceRate: 0.5, opensAt: 10, difficulty: 'hard', listed: false }, 'the defaults for anyone not listed');
  assert.equal(r.listed, false, 'Dewayne is on no list');
  assert.equal(r.eligible, true, 'every adult is eligible');
  assert.deepEqual(r.welcome, { ok: true, why: null, difficulty: 'hard' });
  assert.deepEqual(r.success.roll, ['charm', 'hard', 'success'], 'a charm roll, hard, though the parse said no roll');
  assert.match(r.success.line, /^Charm 17 .*vs 15 · Success$/, 'the roll line shows like any roll: ' + r.success.line);
  assert.deepEqual(r.success.rom, ['ROMANCE (decided by the engine): Dewayne Mangum is open to it: he flirts back, his own way.']);
  assert.equal(r.success.ds, 5, 'spark 10 x his rate 0.5');
  assert.equal(r.success.dw, 4, 'the row: liking +4');
  assert.deepEqual(r.success.mems, [['Tester flirted with me at Pittman\'s Gas and Service', 5]]);
  assert.deepEqual(r.partial.roll, ['charm', 'hard', 'partial']);
  assert.deepEqual(r.partial.rom, ['ROMANCE (decided by the engine): Dewayne Mangum turns it aside, kindly.']);
  assert.deepEqual(r.partial.d, [0, 0, 0], 'a partial changes nothing');
  assert.equal(r.partial.mems, 0);
  assert.deepEqual(r.failure.roll, ['charm', 'hard', 'failure']);
  assert.deepEqual(r.failure.rom, ['ROMANCE (decided by the engine): Dewayne Mangum isn\'t interested: he turns it aside.']);
  assert.equal(r.failure.d[0], -3, 'the first unwelcome flirt: liking -3');
  assert.ok(r.failure.d[1] < 0, 'trust down: ' + r.failure.d);
  assert.ok(r.failure.d[2] < 0, 'spark down: ' + r.failure.d);
  assert.deepEqual(r.failure.mems, ['Tester came on to me and I wasn\'t having it']);
  assert.ok(r.again <= -6, 'the next: liking -6 (' + r.again + ')');
});

s.test('(b) Jodie is easy and rate 1.2: the same flirts land for 12 a success and 18 on a critical; a critical failure doubles the liking cost and is a weight-2 memory; five successful mornings for each of the owner\'s two examples', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: [J, D] });
    out.tuning = R.tuningOf(S.npc(J));
    out.shayla = R.tuningOf(S.npc('npc_shayla'));
    out.curtis = R.tuningOf(S.npc('npc_curtis'));
    S.apply({ relSet: { npcId: J, k: 25 } });
    S.apply({ relSet: { npcId: D, k: 25 } });
    // Five successful flirts, one a day, each: Jodie at the Low Water (easy), Dewayne at his garage (hard).
    out.path = { [J]: [], [D]: [] };
    out.rolls = { [J]: [], [D]: [] };
    for (let d = 2; d <= 6; d++) {
      for (const [id, loc] of [[J, 'loc_low_water'], [D, 'loc_pittmans']]) {
        __put(loc, [id], d, 'evening');
        __roll('success');
        const x = await __say(id, 'You look good tonight.', { romantic: 'flirt' });
        out.rolls[id].push(x.roll[1]);
        out.path[id].push(__tr(id).s);
      }
    }
    out.end = { [J]: [__tr(J), R.sparkStatus(S.npc(J))], [D]: [__tr(D), R.sparkStatus(S.npc(D))] };
    // A critical: 15 x her rate.
    __put('loc_low_water', [J], 7, 'evening');
    let s0 = __tr(J).s;
    __roll(20);
    out.crit = Object.assign(await __say(J, 'Dance with me.', { romantic: 'flirt' }), { ds: __tr(J).s - s0 });
    // A critical failure with Royce (unlisted): liking -6 the first time, a weight-2 memory.
    S.apply({ npcKnownToPlayer: ['npc_royce'] });
    S.apply({ relSet: { npcId: 'npc_royce', k: 20 } });
    __put('loc_pittmans', ['npc_royce'], 7, 'morning');
    const w0 = __tr('npc_royce').w;
    const turn = st.meta.turn;
    __roll(1);
    out.fumble = Object.assign(await __say('npc_royce', 'Those overalls do something for you.', { romantic: 'flirt' }), { dw: __tr('npc_royce').w - w0, mems: __flirts('npc_royce', turn).map(m => [m.text, m.weight]), cond: st.player.conditions.length });
    return out;
  });
  assert.deepEqual(r.tuning, { sparkRate: 1.2, romanceRate: 1.2, opensAt: 20, difficulty: 'easy', listed: true });
  assert.equal(r.shayla.difficulty, 'easy', 'Shayla is easy');
  assert.equal(r.curtis.difficulty, 'normal', 'the other ten listed are normal');
  assert.deepEqual(r.rolls[J], ['easy', 'easy', 'easy', 'easy', 'easy']);
  // Dewayne: hard until his spark reaches 20 (normal), never easy on these numbers.
  assert.equal(r.rolls[D][0], 'hard');
  for (let i = 1; i < 5; i++) assert.equal(r.rolls[D][i], r.path[D][i - 1] >= 40 ? 'easy' : r.path[D][i - 1] >= 20 ? 'normal' : 'hard', `day ${i + 2}: ${JSON.stringify(r.path[D])}`);
  // The owner's two examples, five successful flirts (spark at the end of each day's flirt, less what fades each night).
  assert.deepEqual(r.path[J], [12, 22, 32, 39, 46], 'Jodie: 12 a flirt');
  assert.deepEqual(r.path[D], [5, 9, 13, 16, 19], 'Dewayne: 5 a flirt, the hard way');
  assert.equal(r.end[D][1], null, 'five flirts and Dewayne has not yet noticed you (spark under 20)');
  assert.deepEqual(r.crit.roll, ['charm', 'easy', 'critical']);
  assert.equal(r.crit.ds, 18, 'a critical: 15 x 1.2');
  assert.deepEqual(r.fumble.roll, ['charm', 'hard', 'critical_failure']);
  assert.deepEqual(r.fumble.rom, ['ROMANCE (decided by the engine): Royce Pittman isn\'t interested: he turns it aside.']);
  assert.equal(r.fumble.dw, -6, 'the liking cost doubled');
  assert.deepEqual(r.fumble.mems, [['Tester came on to me and made it awkward', 2]]);
  assert.equal(r.fumble.cond, 0, 'the awkward memory is its lasting consequence: no condition besides');
});

s.test('(c) the easing: at spark 20 one step, at 40 two, never below easy; the turn rolls what Rel.flirtDifficulty says', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel;
    const out = {};
    S.apply({ npcKnownToPlayer: [D] });
    S.apply({ relSet: { npcId: D, k: 30 } });
    const at = (id, sp) => { S.apply({ relSet: { npcId: id, s: sp } }); return R.flirtDifficulty(S.npc(id)); };
    out.dewayne = [0, 19, 20, 39, 40, 80].map(sp => at(D, sp));
    out.jodie = [0, 20, 40].map(sp => at(J, sp));
    out.curtis = [0, 20, 40].map(sp => at('npc_curtis', sp));
    S.apply({ relSet: { npcId: D, s: 25 } });
    __put('loc_pittmans', [D], 2, 'afternoon');
    __roll('success');
    out.turn = (await __say(D, 'You missed a spot.', { romantic: 'flirt' })).roll;
    S.apply({ relSet: { npcId: D, s: 45 } });
    __put('loc_pittmans', [D], 3, 'afternoon');
    __roll('success');
    out.turn2 = (await __say(D, 'Still here?', { romantic: 'flirt' })).roll;
    return out;
  });
  assert.deepEqual(r.dewayne, ['hard', 'hard', 'normal', 'normal', 'easy', 'easy']);
  assert.deepEqual(r.jodie, ['easy', 'easy', 'easy'], 'never below easy');
  assert.deepEqual(r.curtis, ['normal', 'easy', 'easy']);
  assert.deepEqual(r.turn, ['charm', 'normal', 'success'], 'at spark 25, hard is normal');
  assert.deepEqual(r.turn2, ['charm', 'easy', 'success'], 'at spark 45, easy');
});

s.test('(d) below their opensAt: no roll, "turns it aside, kindly", nothing changes the first time; later ones cost liking 1', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: [D] });
    out.welcome = R.welcomeOf(S.npc(D));
    const c0 = st.meta.rngCalls;
    __put('loc_pittmans', [D], 2, 'afternoon');
    let t0 = __tr(D);
    let turn = st.meta.turn;
    out.first = Object.assign(await __say(D, 'Hey, handsome.', { romantic: 'flirt', needsRoll: true, stat: 'charm', difficulty: 'normal' }), { d: [__tr(D).w - t0.w, __tr(D).t - t0.t, __tr(D).s - t0.s], mems: S.npc(D).memories.filter(m => m.turn > turn).length, rolled: G.Pipeline.lastTurn.ctx.romanceRoll || null });
    out.rng = st.meta.rngCalls - c0;
    __put('loc_pittmans', [D], 3, 'afternoon');
    t0 = __tr(D);
    turn = st.meta.turn;
    out.second = Object.assign(await __say(D, 'Hey again, handsome.', { romantic: 'flirt' }), { d: [__tr(D).w - t0.w, __tr(D).t - t0.t, __tr(D).s - t0.s], mems: S.npc(D).memories.filter(m => m.turn > turn).length });
    return out;
  });
  assert.equal(r.welcome.ok, false);
  assert.equal(r.welcome.soon, true);
  assert.match(r.welcome.why, /^knows the player \d, opens at 10$/);
  assert.equal(r.first.roll, null, 'no roll, whatever the parser said');
  assert.equal(r.first.rolled, null);
  assert.deepEqual(r.first.rom, ['ROMANCE (decided by the engine): Dewayne Mangum turns it aside, kindly.']);
  assert.deepEqual(r.first.d, [0, 0, 0], 'the first time costs nothing');
  assert.equal(r.first.mems, 0, 'and leaves no memory');
  assert.deepEqual(r.second.rom, ['ROMANCE (decided by the engine): Dewayne Mangum turns it aside, kindly.']);
  assert.equal(r.second.roll, null);
  assert.deepEqual(r.second.d, [-1, 0, 0], 'later ones: liking 1');
  assert.equal(r.second.mems, 0);
});

s.test('(e) faithful: true reads as very hard; the validator takes it and refuses open, a bad difficulty and a rate past 2', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel;
    S.town.romance.push({ npcId: 'npc_royce', sparkRate: 1, opensAt: { knows: 0 }, faithful: true });
    S.apply({ npcKnownToPlayer: ['npc_royce'] });
    const out = { tuning: R.tuningOf(S.npc('npc_royce')), eligible: R.eligible(S.npc('npc_royce')) };
    __put('loc_pittmans', ['npc_royce'], 2, 'morning');
    __roll('success');
    out.turn = (await __say('npc_royce', 'You ever get lonely out here?', { romantic: 'flirt' })).roll;
    return out;
  });
  assert.deepEqual(r.tuning, { sparkRate: 1, romanceRate: 1, opensAt: 0, difficulty: 'very_hard', listed: true });
  assert.equal(r.eligible, true, 'faithful is hard, not closed');
  assert.deepEqual(r.turn, ['charm', 'very_hard', 'success']);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const row = '{ npcId: "npc_jodie", sparkRate: 1.2, opensAt: { knows: 20 }, difficulty: "easy" }';
  assert.ok(html.includes(row), 'the shipped row');
  const check = text => { const tmp = path.join(os.tmpdir(), `wave34-romance-${process.pid}.html`); fs.writeFileSync(tmp, text); try { return spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) }); } finally { fs.unlinkSync(tmp); } };
  const faithful = check(html.replace(row, '{ npcId: "npc_jodie", sparkRate: 1.2, opensAt: { knows: 20 }, faithful: true }'));
  assert.equal(faithful.status, 0, 'faithful: true stands for very_hard: ' + faithful.stdout + faithful.stderr);
  const open = check(html.replace(row, '{ npcId: "npc_jodie", open: true, sparkRate: 1.2, opensAt: { knows: 20 }, difficulty: "easy" }'));
  assert.notEqual(open.status, 0);
  assert.match(open.stdout + open.stderr, /romance\[0\]\.open: open is gone \(wave 34\)/);
  const bad = check(html.replace(row, '{ npcId: "npc_jodie", sparkRate: 2.5, opensAt: { knows: 20 }, difficulty: "trivial" }'));
  assert.match(bad.stdout + bad.stderr, /romance\[0\]\.difficulty: easy, normal, hard or very_hard/);
  assert.match(bad.stdout + bad.stderr, /romance\[0\]\.sparkRate: a number from 0\.1 to 2/);
  const both = check(html.replace(row, '{ npcId: "npc_jodie", sparkRate: 1.2, opensAt: { knows: 20 }, difficulty: "easy", faithful: true }'));
  assert.match(both.stdout + both.stderr, /faithful: true means difficulty very_hard/);
});

s.test('(f) the minor rules are unchanged: nobody under 18 is eligible or rolls, and with a player under 18 nobody is; the Edit form has Interested for every adult and off for a minor', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    out.minors = st.npcs.filter(n => R.isMinor(n)).map(n => [n.id, R.eligible(n), R.welcomeOf(n).ok, R.sparkStatus(n)]);
    out.listedMinor = (S.town.romance || []).filter(x => R.isMinor(S.npc(x.npcId))).length;
    // A flirt at Kaylee: the minor rule, no roll, spark 0.
    S.apply({ npcKnownToPlayer: ['npc_kaylee', D] });
    __put('loc_pittmans', ['npc_kaylee'], 2, 'evening');
    __roll('success');
    const k = await __say('npc_kaylee', 'You look cute tonight.', { romantic: 'flirt' });
    const c = G.Pipeline.lastTurn.ctx;
    out.kaylee = { roll: k.roll, romanceRoll: c.romanceRoll || null, named: c.romance.minors.npc_kaylee, s: __tr('npc_kaylee').s, under: G.Pipeline.lastTurn.packet.split('\n').filter(l => /^UNDER 18: Kaylee/.test(l)).length };
    G.Pipeline.hooks.nextTier = null;
    // A player of 16: Dewayne, an adult, answers no and nothing rolls.
    S.apply({ relSet: { npcId: D, k: 30 } });
    st.player.age = 16;
    __put('loc_pittmans', [D], 3, 'afternoon');
    const y = await __say(D, 'You look good.', { romantic: 'flirt' });
    out.young = { roll: y.roll, rom: y.rom, s: __tr(D).s, eligible: R.eligible(S.npc(D)), mode: null };
    G.UI.openPanel('people');
    G.UI.editPerson(D);
    out.young.mode = !!document.querySelector(`#pe-spark-${D}`);
    G.UI.closeEditor && G.UI.closeEditor();
    st.player.age = 30;
    G.UI.renderPanel();
    G.UI.editPerson(D);
    const sl = document.querySelector(`#pe-spark-${D}`);
    out.editAdult = sl ? [sl.value, sl.disabled] : null;
    G.UI.editPerson('npc_kaylee');
    const kl = document.querySelector('#pe-spark-npc_kaylee');
    out.editMinor = kl ? [kl.value, kl.disabled] : null;
    return out;
  });
  for (const m of r.minors) assert.deepEqual(m.slice(1), [false, false, null], m[0]);
  assert.equal(r.minors.length, 3);
  assert.equal(r.listedMinor, 0);
  assert.equal(r.kaylee.roll, null, 'no roll for a flirt at a minor');
  assert.equal(r.kaylee.romanceRoll, null);
  assert.equal(r.kaylee.named.named, true);
  assert.equal(r.kaylee.s, 0);
  assert.equal(r.kaylee.under, 1, 'the minor line');
  assert.equal(r.young.roll, null, 'a kid\'s flirt never rolls');
  assert.deepEqual(r.young.rom, ['ROMANCE (decided by the engine): Dewayne Mangum isn\'t interested: he turns it aside.']);
  assert.equal(r.young.s, 0);
  assert.equal(r.young.eligible, false);
  assert.equal(r.young.mode, false, 'a player under 18: no Interested on the form');
  assert.deepEqual(r.editAdult, ['0', false], 'an adult nobody listed: Interested on the Edit form');
  assert.deepEqual(r.editMinor, ['0', true], 'a minor: shown at 0 and off');
});

s.test('(g) the late flirt lands by the turn\'s charm roll: a success is welcome, a failure unwelcome, a partial or no charm roll turned aside with nothing changed', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const out = {};
    S.apply({ relSet: { npcId: J, k: 51 } });
    const late = async (day, parse, want) => {
      const here = __put('loc_motor_court', [J, 'npc_brianna'], day, 'morning');
      S.apply({ npcKnownToPlayer: here });
      const t0 = __tr(J);
      const turn = st.meta.turn;
      if (want) __roll(want);
      const x = await __do('I lean in and kiss her', Object.assign({ romantic: 'flirt', targets: [], actionType: 'other' }, parse), 'She looks at you.', { socialEvents: ['npc_jodie flirted: kissed me'] });
      return { aimed: x.aimed, roll: x.roll, d: [__tr(J).w - t0.w, __tr(J).s - t0.s], mems: __flirts(J, turn).map(m => m.text), dbg: S.debugLog.filter(d => d.turn === st.meta.turn && d.kind === 'rel' && /bookkeeper named/.test(d.text || '')).map(d => d.text) };
    };
    const charm = { needsRoll: true, stat: 'charm', difficulty: 'normal' };
    out.success = await late(2, charm, 'success');
    out.failure = await late(3, charm, 'failure');
    out.partial = await late(4, charm, 'partial');
    out.none = await late(5, {}, null);
    out.wits = await late(6, { needsRoll: true, stat: 'wits', difficulty: 'normal' }, 'success');
    return out;
  });
  assert.deepEqual(r.success.aimed, [], 'aimed at nobody: "her" with two women here');
  assert.deepEqual(r.success.roll, ['charm', 'normal', 'success']);
  assert.deepEqual(r.success.mems, ['Tester flirted with me at the Riverview Motor Court']);
  assert.equal(r.success.d[1], 12);
  assert.deepEqual(r.success.dbg, ['the bookkeeper named who the flirt was aimed at: npc_jodie, open to it (the charm roll: success) (the engine\'s flirt, late)']);
  assert.deepEqual(r.failure.mems, ['Tester came on to me and I wasn\'t having it']);
  assert.ok(r.failure.d[0] <= -3 && r.failure.d[1] < 0, JSON.stringify(r.failure));
  for (const x of [r.partial, r.none, r.wits]) {
    assert.deepEqual(x.mems, [], 'nothing written: ' + JSON.stringify(x));
    assert.deepEqual(x.d, [0, 0], 'nothing changes: ' + JSON.stringify(x));
  }
  assert.deepEqual(r.partial.dbg, ['the bookkeeper named who the flirt was aimed at: npc_jodie, turned it aside, kindly (the charm roll: partial) (the engine\'s flirt, late)']);
  assert.deepEqual(r.none.dbg, ['the bookkeeper named who the flirt was aimed at: npc_jodie, turned it aside, kindly (the engine\'s flirt, late)']);
  assert.equal(r.none.roll, null);
});

s.test('(h) the night keeps its gate with no roll; short of it the ask rolls as a flirt: a success is "not tonight; she says so kindly", a failure the refusal', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: [J, 'npc_shayla'] });
    // Changed by design in wave 35: the night reads romance 40 where it read liking 40.
    S.apply({ relSet: { npcId: J, s: 55, m: 45, w: 45, t: 35, k: 35 } });
    __put('loc_low_water', [J], 6, 'night');
    const c0 = st.meta.rngCalls;
    out.yes = await __say(J, 'Stay with me tonight.', { romantic: 'more' });
    out.yesRng = st.meta.rngCalls - c0;
    S.apply({ relSet: { npcId: 'npc_shayla', s: 55, m: 45, w: 45, t: 25, k: 35 } });
    __put('loc_riverbend', ['npc_shayla'], 6, 'night');
    __roll('success');
    out.kind = await __say('npc_shayla', 'Come back to my room tonight.', { romantic: 'more' });
    __put('loc_riverbend', ['npc_shayla'], 7, 'night');
    __roll('failure');
    out.no = await __say('npc_shayla', 'Come back to my room tonight.', { romantic: 'more' });
    return out;
  });
  assert.equal(r.yes.roll, null, 'the gate met: no roll');
  assert.equal(r.yesRng, 0, 'no die drawn');
  assert.deepEqual(r.yes.rom, ['ROMANCE (decided by the engine): Jodie Strayhorn says yes; write the scene out, never skip to afterwards: the moment it tips, the kissing, hands, clothes, how they move and what they murmur, the room and the light, and Jodie\'s own way of being with the player, beat by beat. Sensual, not graphic: no anatomical close-ups. End on them afterwards.']);
  assert.deepEqual(r.kind.roll, ['charm', 'easy', 'success'], 'short of the gate: a flirt\'s roll (spark 55 eases her to easy anyway)');
  assert.deepEqual(r.kind.rom, ['ROMANCE (decided by the engine): Shayla Rawls: not tonight; she says so kindly.']);
  assert.deepEqual(r.no.rom, ['ROMANCE (decided by the engine): Shayla Rawls isn\'t interested: she turns it aside.']);
});

s.run();
