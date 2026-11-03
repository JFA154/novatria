'use strict';
/* Wave 33 (3 Nov 2026): "a kiss lands on the one kissed". The owner's save:
   Jodie Strayhorn, his enemy loose end, came to his motel room by the
   story ("two quick knocks, and Jodie slips in"), and "I lean in to kiss
   her" was parsed as a flirt aimed at nobody (Sonnet) or at the wrong
   woman (Haiku), so the engine recorded no flirt and no spark. Mock mode.
   Run with: node tests/run.cjs wave33 */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave33-romance-target');

const TURN96 = 'You walk the highway back and let yourself into Room 6. Brianna\'s cleaning cart sits two doors down, and Curtis Pruett is smoking under the overhang outside his room. About ten minutes later there are two quick knocks, and Jodie slips in with her hood dripping. She stays by the door. "Curtis saw me come in, so we don\'t have long. You wanted to talk, so talk."';
const TURN97 = 'She doesn\'t pull back. For a second she kisses you back, one hand fisted in your shirt, then she pushes off and opens the door. "Two o\'clock, back door of the Low Water. Not this room." She\'s gone down the walk with her hood up.';

/* In the page: __put (the player somewhere with these people, now), __do (a
   Do line with its parse, narration and bookkeeper reply), __here, __tr,
   __st (the stance and its tags), __dbg (the debug lines of a kind since a
   mark). */
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
  window.__do = async (words, parse, narration, book) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'other', summary: words, targets: [], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (narration) G.Api.Mock.queue('narrate', { text: narration });
    G.Api.Mock.queue('bookkeep', book || {});
    return G.Pipeline.submit(words, { mode: 'do' });
  };
  window.__say = async (to, words, parse, narration, book) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: to === 'everyone' ? G.State.npcsAt(G.state.player.locationId).map(n => n.id) : [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (narration) G.Api.Mock.queue('narrate', { text: narration });
    G.Api.Mock.queue('bookkeep', book || {});
    return G.Pipeline.submit(words, { mode: 'say', to });
  };
  window.__here = () => G.State.npcsAt(G.state.player.locationId).map(n => n.id);
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
  window.__st = id => { const st = G.Rel.stance(G.State.npc(id)); return [st.phrase].concat(st.tags); };
  window.__d0 = 0;
  window.__mark = () => { window.__d0 = G.State.debugLog.length; };
  window.__dbg = kind => G.State.debugLog.slice(window.__d0).filter(d => !kind || d.kind === kind).map(d => d.text || d.reason);
  window.__romance = () => G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE/.test(l));
  window.__flirts = (id, since) => G.State.npc(id).memories.filter(m => m.event === 'flirted' && m.turn >= since);
});
const start = async h => { const page = await h.open(); await quickStart(page, { kinds: [] }); await kit(page); return page; };

/* The owner's turns 95 and 96: at Pittman's with Jodie on her morning
   schedule she agrees to come to his room (a meeting seed for the motor
   court, as seed_t95 was), and the walk back is narrated with her arrival. */
async function turn96(page) {
  return page.evaluate(async narration => {
    const G = Game, S = G.State;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_jodie', 'npc_curtis', 'npc_brianna', 'npc_lyman'] });
    out.pittmans = __put('loc_pittmans', [], 3, 'morning').includes('npc_jodie');
    out.seed = S.apply({ newSeeds: [{ effect: 'Jodie Strayhorn comes by the highway way to the player\'s room at the Riverview Motor Court in about ten minutes, but turns around if Boyd leaves his stool', triggerType: 'location', triggerValue: 'loc_motor_court' }] }, { source: 'model' }).rejected;
    out.appt = G.state.seeds.filter(sd => sd.appointment && sd.appointment.npcId === 'npc_jodie').map(sd => [sd.appointment.locationId, sd.appointment.phases]);
    out.visits = (G.state.visits || []).filter(v => v.npcId === 'npc_jodie').map(v => `${v.locationId}:${v.phase}`);
    __mark();
    await __do('we make it successfully to my room', { actionType: 'move', destinationId: 'loc_motor_court', timeCost: 'short' }, narration);
    out.at = G.state.player.locationId;
    out.phase = G.state.time.phase;
    out.here = __here();
    out.arrival = __dbg('arrival');
    out.rejected = __dbg('rejected');
    return out;
  }, TURN96);
}

s.test('the owner\'s turn 96: the walk back to the motor court narrated with "Jodie slips in" puts her in the scene, whatever the meeting seed placed for later', async h => {
  const page = await start(h);
  const r = await turn96(page);
  assert.equal(r.pittmans, true, 'Jodie is at Pittman\'s on her morning schedule');
  assert.deepEqual(r.seed, []);
  assert.equal(r.at, 'loc_motor_court');
  assert.equal(r.phase, 'morning');
  assert.ok(r.here.includes('npc_jodie'), 'she is here: ' + JSON.stringify(r));
  assert.ok(r.here.includes('npc_curtis') && r.here.includes('npc_brianna'), JSON.stringify(r.here));
  assert.deepEqual(r.arrival, ['npc_jodie walked in by the story: here at loc_motor_court this phase']);
  assert.deepEqual(r.rejected, []);
});

s.test('the task\'s variant of turn 96: the player already at the motor court in the morning, Jodie at Pittman\'s, a meeting seed for the evening; the narrated knock and "Jodie slips in" place her now', async h => {
  const page = await start(h);
  const r = await page.evaluate(async narration => {
    const G = Game, S = G.State;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_jodie'] });
    out.before = __put('loc_motor_court', [], 3, 'morning').includes('npc_jodie');
    out.pittmans = S.npcsAt('loc_pittmans').some(n => n.id === 'npc_jodie');
    S.apply({ newSeeds: [{ effect: 'Jodie Strayhorn comes to the player\'s room at the Riverview Motor Court this evening', triggerType: 'location', triggerValue: 'loc_motor_court' }] }, { source: 'model' });
    out.appt = G.state.seeds.filter(sd => sd.appointment && sd.appointment.npcId === 'npc_jodie').map(sd => sd.appointment.phases);
    out.visits = (G.state.visits || []).filter(v => v.npcId === 'npc_jodie').map(v => `${v.locationId}:${v.phase}:${v.seedId ? 'seed' : 'story'}`);
    await __do('I wait in my room', { actionType: 'wait', timeCost: 'short' }, narration);
    out.here = __here().includes('npc_jodie');
    out.after = (G.state.visits || []).filter(v => v.npcId === 'npc_jodie').map(v => `${v.locationId}:${v.phase}:${v.seedId ? 'seed' : 'story'}`);
    return out;
  }, TURN96);
  assert.deepEqual([r.before, r.pittmans], [false, true]);
  assert.deepEqual(r.appt, [['evening']]);
  assert.deepEqual(r.visits, ['loc_motor_court:evening:seed']);
  assert.equal(r.here, true, JSON.stringify(r));
  assert.deepEqual(r.after, ['loc_motor_court:evening:seed', 'loc_motor_court:morning:story']);
});

/* Jodie as the owner's save has her: his enemy loose end (start liking -45,
   trust -55), a threat of his on her record (the earned distrust), now
   liking -18, trust -37, knows 51: "suspicious of you", and open to a flirt
   (knows 51 is past her opensAt 20; cool is not against him). Wave 34: a
   flirt with her is a charm roll, easy (her entry on the list). */
const jodieAsSaved = page => page.evaluate(() => {
  const S = Game.State;
  S.apply({ relStart: [{ npcId: 'npc_jodie', w: -45, t: -55 }] });
  S.apply({ socialEvents: [{ npcId: 'npc_jodie', event: 'threatened', text: 'threatened to tell the police chief', weight: 2 }] });
  S.apply({ relSet: { npcId: 'npc_jodie', w: -18, t: -37, k: 51 } });
  return [__tr('npc_jodie'), __st('npc_jodie'), Game.Rel.welcomeOf(S.npc('npc_jodie'))];
});

s.test('(a) the owner\'s scene: Jodie walked in by the story, then "I don\'t say anything, I lean in to kiss her" parsed as a flirt at nobody is aimed at her alone (Brianna two doors down and Curtis get nothing); the kiss rolls charm against her (easy) and, forced to succeed, she is open to it, spark +12; three mornings and she has noticed you, five and she is using you', async h => {
  const page = await start(h);
  const r0 = await turn96(page);
  assert.ok(r0.here.includes('npc_jodie') && r0.here.includes('npc_brianna'), JSON.stringify(r0.here));
  const saved = await jodieAsSaved(page);
  assert.deepEqual([saved[0].w, saved[0].t, saved[0].k, saved[0].s], [-18, -37, 51, 0], JSON.stringify(saved));
  assert.equal(saved[1][0], 'suspicious of you');
  assert.equal(saved[2].ok, true, JSON.stringify(saved[2]));
  const r = await page.evaluate(async ([t96, t97]) => {
    const G = Game, S = G.State;
    const out = { days: [] };
    const kiss = async () => {
      const t0 = G.state.meta.turn;
      const s0 = __tr('npc_jodie').s;
      __mark();
      // Wave 34: the kiss is a charm roll; a 15 makes it a success (the suite forces dice so, hooks.nextD20).
      G.Pipeline.forceNextRoll(15);
      await __do('I don\'t say anything, I lean in to kiss her', { romantic: 'flirt', targets: [], actionType: 'other' }, t97);
      const c = G.Pipeline.lastTurn.ctx;
      return {
        roll: c.roll ? [c.roll.stat, c.roll.difficulty, c.roll.tier] : null,
        targets: G.Pipeline.lastTurn.action.targets, aimed: c.romance.aimed, lines: __romance(), dbg: __dbg('rel').filter(x => /^romance/.test(x)),
        jodie: __flirts('npc_jodie', t0 + 1).map(m => [m.text, m.d.s]), spark: __tr('npc_jodie').s - s0,
        others: ['npc_curtis', 'npc_brianna', 'npc_lyman'].map(id => __flirts(id, t0 + 1).length),
        book: c.bookLines.filter(l => /^ROMANCE/.test(l))
      };
    };
    out.days.push(await kiss());
    for (const d of [4, 5, 6, 7]) {
      __put('loc_pittmans', [], d, 'morning');
      await __do('we make it successfully to my room', { actionType: 'move', destinationId: 'loc_motor_court', timeCost: 'short' }, t96);
      out.days.push(Object.assign({ here: __here().includes('npc_jodie') }, await kiss()));
      if (d === 5) out.three = [__tr('npc_jodie'), __st('npc_jodie')];
    }
    out.end = [__tr('npc_jodie'), __st('npc_jodie')];
    return out;
  }, [TURN96, TURN97]);
  const d1 = r.days[0];
  assert.deepEqual(d1.targets, ['npc_jodie'], 'the resolved target is the parse\'s now (the roll follows it)');
  assert.deepEqual(d1.roll, ['charm', 'easy', 'success'], 'wave 34: the kiss rolled charm against her, easy, though the parse said no roll');
  assert.deepEqual(d1.aimed, ['npc_jodie']);
  assert.deepEqual(d1.lines, ['ROMANCE (decided by the engine): Jodie Strayhorn is open to it: she flirts back, her own way.'], 'no line for Curtis, Lyman or Brianna');
  assert.ok(d1.dbg.includes('romance target: npc_jodie ("her": the last narration walked them in; the parse had nobody)'), JSON.stringify(d1.dbg));
  assert.deepEqual(d1.jodie, [['Tester flirted with me at the Riverview Motor Court', 12]]);
  assert.equal(d1.spark, 12, 'spark 10 x her rate 1.2');
  assert.deepEqual(d1.others, [0, 0, 0]);
  assert.ok(d1.book.some(l => /Jodie Strayhorn was open to it/.test(l)), JSON.stringify(d1.book));
  for (const d of r.days.slice(1)) {
    assert.equal(d.here, true);
    assert.deepEqual(d.aimed, ['npc_jodie']);
    assert.deepEqual(d.others, [0, 0, 0]);
    assert.equal(d.jodie.length, 1);
    assert.deepEqual(d.roll, ['charm', 'easy', 'success'], 'easy is as easy as it gets: spark only eases a harder one');
  }
  /* Three mornings (12 a kiss, less what fades each night) leave her spark
     at 32 (wave 34: the path 12, 22, 32, 39, 46 holds, every kiss a success): "has noticed you", short of the 40 "using you" needs; the fourth
     is 39 and the fifth 46. Then (changed by design in wave 35: romance in
     place of caring liking): romance under 20 (five kisses and nothing
     else, +2 x 1.2 each, fading on the bond clock), trust -25 or less,
     earned by the threat on her record: using you. */
  assert.equal(r.three[0].s, 32, JSON.stringify(r.three));
  assert.deepEqual(r.three[1].slice(0, 2), ['suspicious of you', 'has noticed you'], JSON.stringify(r.three));
  const [tr, st] = r.end;
  assert.equal(tr.s, 46, JSON.stringify(r.end));
  assert.ok(tr.m > 0 && tr.m < 20 && tr.t <= -25, JSON.stringify(r.end));
  assert.deepEqual(st.slice(0, 2), ['suspicious of you', 'using you'], JSON.stringify(r.end));
});

s.test('(b) a Say to everyone with a flirt still goes to everyone here: each adult answers, nobody is named so no flirt is recorded', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    const here = __put('loc_low_water', ['npc_jodie', 'npc_shayla'], 2, 'evening');
    S.apply({ npcKnownToPlayer: here });
    await __say('everyone', 'You all look good tonight.', { romantic: 'flirt' });
    const c = G.Pipeline.lastTurn.ctx;
    return { here: here.filter(id => !G.Rel.isMinor(S.npc(id))), aimed: c.romance.aimed, answers: c.romance.answers, lines: __romance(), flirts: c.romance.flirts };
  });
  assert.deepEqual(r.aimed.slice().sort(), r.here.slice().sort());
  assert.deepEqual(r.answers.slice().sort(), r.here.slice().sort());
  assert.equal(r.lines.length, r.here.length, JSON.stringify(r.lines));
  assert.deepEqual(r.flirts, []);
});

s.test('(c) a romantic turn the parse aimed at nobody: the bookkeeper\'s flirt naming an adult here is the engine\'s flirt, late (wave 34: landed by the turn\'s charm roll); one naming someone not here is refused', async h => {
  const page = await start(h);
  await jodieAsSaved(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    const here = __put('loc_motor_court', ['npc_jodie', 'npc_brianna'], 3, 'morning');
    S.apply({ npcKnownToPlayer: here });
    const out = { here };
    const t0 = G.state.meta.turn;
    const s0 = __tr('npc_jodie').s;
    __mark();
    // Wave 34: the late flirt lands by the turn's charm roll (the parse rolled one; a 15, a success).
    G.Pipeline.forceNextRoll(15);
    await __do('I lean in and kiss her', { romantic: 'flirt', targets: [], actionType: 'other', needsRoll: true, stat: 'charm', difficulty: 'normal' }, 'She kisses you back.', { socialEvents: ['npc_jodie flirted: kissed me and I kissed back'] });
    const c = G.Pipeline.lastTurn.ctx;
    out.aimed = c.romance.aimed;
    out.lines = __romance();
    out.book = c.bookLines.filter(l => /^ROMANCE/.test(l));
    out.jodie = __flirts('npc_jodie', t0 + 1).map(m => [m.text, m.d.s]);
    out.spark = __tr('npc_jodie').s - s0;
    out.brianna = __flirts('npc_brianna', t0 + 1).length;
    out.dbg = __dbg('rel').filter(x => /bookkeeper named/.test(x));
    // Someone not here, named by the bookkeeper: refused.
    const t1 = G.state.meta.turn;
    __mark();
    await __do('I lean in and kiss her', { romantic: 'flirt', targets: [], actionType: 'other' }, 'She steps back.', { socialEvents: ['npc_shayla flirted: kissed me'] });
    out.shayla = __flirts('npc_shayla', t1 + 1).length + S.npc('npc_shayla').memories.filter(m => m.turn > t1).length;
    out.refused = __dbg('rejected').filter(x => /npc_shayla/.test(x));
    return out;
  });
  assert.ok(r.here.includes('npc_jodie') && r.here.includes('npc_brianna'), JSON.stringify(r.here));
  assert.deepEqual(r.aimed, [], '"her" with two women here, nobody walked in: nobody');
  assert.deepEqual(r.lines, []);
  assert.ok(r.book.some(l => /aimed at nobody it could name/.test(l)), JSON.stringify(r.book));
  assert.deepEqual(r.jodie, [['Tester flirted with me at the Riverview Motor Court', 12]], 'the engine\'s own flirt, welcome');
  assert.equal(r.spark, 12);
  assert.equal(r.brianna, 0);
  assert.deepEqual(r.dbg, ['the bookkeeper named who the flirt was aimed at: npc_jodie, open to it (the charm roll: success) (the engine\'s flirt, late)']);
  assert.equal(r.shayla, 0, 'nothing for someone not here');
  assert.ok(r.refused.length >= 1, JSON.stringify(r.refused));
});

s.test('(d) "her" with two women here and nothing to choose between them is aimed at nobody: no answer, no flirt, the bookkeeper told', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    const here = __put('loc_motor_court', ['npc_jodie', 'npc_brianna'], 3, 'morning');
    S.apply({ npcKnownToPlayer: here });
    const t0 = G.state.meta.turn;
    __mark();
    await __do('I wink at her', { romantic: 'flirt', targets: [], actionType: 'other' }, 'Nobody notices.');
    const c = G.Pipeline.lastTurn.ctx;
    return {
      women: here.filter(id => S.npc(id).pronouns === 'she'), targets: G.Pipeline.lastTurn.action.targets, aimed: c.romance.aimed, answers: c.romance.answers, lines: __romance(),
      flirts: here.map(id => __flirts(id, t0 + 1).length).reduce((a, b) => a + b, 0), dbg: __dbg('rel').filter(x => /^romance/.test(x)), book: c.bookLines.filter(l => /^ROMANCE/.test(l))
    };
  });
  assert.ok(r.women.length >= 2, JSON.stringify(r.women));
  assert.deepEqual([r.targets, r.aimed, r.answers, r.lines, r.flirts], [[], [], [], [], 0]);
  assert.ok(r.dbg.includes(`romance target: "her" fits ${r.women.length} people here: aimed at nobody`), JSON.stringify(r.dbg));
  assert.ok(r.dbg.includes('romance: flirt aimed at nobody it could name'), JSON.stringify(r.dbg));
  assert.deepEqual(r.book, ['ROMANCE (seen by the engine): a romantic move aimed at nobody it could name; if the narration shows who it was aimed at and they are here, send "npc_id flirted: ..." for them, and the engine decides how it lands.']);
});

s.test('(e) the new arrival forms place someone: "Shayla\'s here", "comes through the door", "pushes the door open", "is in the doorway"; a first name a dead woman shared still counts; reported speech still does not', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State;
    const out = {};
    // A namesake among the dead (a fixture: a dead woman renamed).
    const dead = G.state.npcs.find(n => n.alive === false && n.pronouns === 'she');
    dead.name = 'Shayla ' + dead.name.split(' ').slice(1).join(' ');
    const forms = [
      ['npc_shayla', 'The bell over the door rings. Shayla\'s here, shaking out her umbrella.'],
      ['npc_royce', 'Royce Pittman comes through the door with his cap in his hand.'],
      ['npc_curtis', 'Curtis pushes the door open and looks around.'],
      ['npc_dewayne', 'Dewayne is in the doorway, wiping his hands on a rag.']
    ];
    for (const [id, text] of forms) {
      __put('loc_motor_court', [], 3, 'night');
      const was = __here().includes(id);
      await __do('I wait', { actionType: 'wait', timeCost: 'instant' }, text);
      out[id] = [was, __here().includes(id)];
    }
    __put('loc_motor_court', [], 3, 'night');
    const away = G.state.npcs.find(n => n.alive !== false && n.status === 'free' && !__here().includes(n.id) && !S.laidUp(n) && /^[A-Z][a-z]+ [A-Z]/.test(n.name) && G.state.npcs.filter(m => m.name.split(' ')[0] === n.name.split(' ')[0]).length === 1);
    await __do('I wait', { actionType: 'wait', timeCost: 'instant' }, `Brianna shrugs. "${away.name.split(' ')[0]} is in the doorway every night," she says.`);
    out.quoted = [away.id, __here().includes(away.id)];
    return out;
  });
  for (const id of ['npc_shayla', 'npc_royce', 'npc_curtis', 'npc_dewayne']) assert.deepEqual(r[id], [false, true], id + ': ' + JSON.stringify(r));
  assert.equal(r.quoted[1], false, 'reported speech: ' + r.quoted[0]);
});

s.test('(f) the minor rule reads the same resolution: "I wink at her" with Kaylee the only woman here is aimed at her, a named target', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    // A place and phase where nobody here is a woman, then Kaylee there.
    let spot = null;
    for (const l of st.locations.filter(x => !x.away && !x.closed)) {
      // The evening: she is at school in Clayburn by day.
      for (const ph of ['evening']) {
        const at = S.npcsAt(l.id, ph);
        if (at.length && !at.some(n => n.pronouns !== 'he')) { spot = [l.id, ph]; break; }
      }
      if (spot) break;
    }
    const here = __put(spot[0], ['npc_kaylee'], 2, spot[1]);
    __mark();
    await __do('I wink at her', { romantic: 'flirt', targets: [], actionType: 'other' }, 'Kaylee looks away.');
    const c = G.Pipeline.lastTurn.ctx;
    return { spot, women: here.filter(id => S.npc(id).pronouns !== 'he'), minor: c.romance.minors.npc_kaylee, targets: G.Pipeline.lastTurn.action.targets, dbg: __dbg('rel').filter(x => /npc_kaylee/.test(x)) };
  });
  assert.deepEqual(r.women, ['npc_kaylee'], JSON.stringify(r));
  assert.deepEqual(r.targets, ['npc_kaylee']);
  assert.equal(r.minor.named, true, JSON.stringify(r.minor));
  assert.equal(r.minor.flag, true);
  assert.ok(r.dbg.some(x => x === 'romance target: npc_kaylee ("her" is the one woman here; the parse had nobody)'), JSON.stringify(r.dbg));
});

s.run();
