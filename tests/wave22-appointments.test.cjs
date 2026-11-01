'use strict';
/* Wave 22 (1 Nov 2026): meetings are kept. The owner, at Pittman's in the
   morning: Jodie Strayhorn said "Low Water, back door, half past ten.
   Nobody's in before eleven. Come by yourself and knock twice", the player
   went and knocked, and Jodie was not there (the engine had her on her own
   schedule), so Loretta said "Nobody's back there right now." A seed the
   bookkeeper plants that names someone in the cast and a place is now an
   appointment the engine keeps: that person is at that place then (visits),
   the narrator is told (APPOINTMENTS), it fires as the player gets there,
   and a meeting the player never came to is missed. Mock mode.
   Run with: node tests/run.cjs wave22 */
const assert = require('assert/strict');
const crypto = require('crypto');
const { suite, quickStart, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('wave22-appointments');
const JODIE = "Jodie Strayhorn waits at the Low Water's back door at half past ten, before opening";
const lastText = (page, method) => page.evaluate(m => Game.Api.Mock.calls.filter(c => c.method === m).map(c => c.text).pop() || '', method);
const line = (text, label) => (String(text).split('\n').find(l => l.startsWith(label)) || '');
async function start(page, at) {
  await quickStart(page);
  await page.evaluate(loc => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); Game.State.apply({ playerLocationId: loc }); }, at || 'loc_pittmans');
}
// The bookkeeper's seed for this turn (merged into the demo's own record).
const bookSeed = (page, seed) => page.evaluate(sd => Game.Api.Mock.queue('bookkeep', { newSeeds: [sd] }), seed);
const say = (page, words, to) => page.evaluate(([w, t]) => Game.Pipeline.submit(w, { mode: 'say', to: t }), [words, to]);

s.test("the owner's case: Jodie agrees at Pittman's to the Low Water's back door at half past ten; she is there when the player walks over (presence, the parser, the Say chips, the narrator), the meeting fires as they arrive, and APPOINTMENTS is told before and gone after", async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const before = await page.evaluate(() => ({ time: Game.state.time, pittmans: Game.State.npcsAt('loc_pittmans').map(n => n.id), low: Game.State.npcsAt('loc_low_water').map(n => n.id) }));
  assert.equal(before.time.phase, 'morning');
  assert.ok(before.pittmans.includes('npc_jodie') && !before.low.includes('npc_jodie'), 'Jodie is at Pittman\'s in the morning, as the schedule has her: ' + JSON.stringify(before));
  // She says it in the story; the bookkeeper records the meeting as a seed with a location trigger.
  await bookSeed(page, { effect: JODIE, triggerType: 'location', triggerValue: 'loc_low_water' });
  assert.equal((await say(page, 'When can we talk where nobody hears?', 'npc_jodie')).ok, true);
  const planted = await page.evaluate(() => {
    const sd = Game.state.seeds.find(x => x.appointment);
    return { sd, visits: Game.state.visits.filter(v => v.npcId === 'npc_jodie'), low: Game.State.npcsAt('loc_low_water').map(n => n.id), pittmans: Game.State.npcsAt('loc_pittmans').map(n => n.id), scene: Game.state.pendingScene, time: Game.state.time };
  });
  assert.ok(planted.sd, 'the seed is an appointment');
  assert.deepEqual(planted.sd.appointment, { npcId: 'npc_jodie', locationId: 'loc_low_water', day: 1, phase: 'morning', phases: ['morning'], spot: 'back door', hour: 'half past ten' });
  assert.deepEqual(planted.sd.trigger, { type: 'location', value: 'loc_low_water' }, 'the trigger stays as the bookkeeper gave it');
  assert.equal(planted.sd.notBeforeDay, undefined, 'it may come today');
  assert.equal(planted.sd.effect, JODIE);
  assert.deepEqual(planted.visits, [{ npcId: 'npc_jodie', locationId: 'loc_low_water', day: 1, phase: 'morning', seedId: planted.sd.id }]);
  assert.ok(planted.low.includes('npc_jodie'), 'Jodie is at the Low Water this morning');
  assert.ok(!planted.pittmans.includes('npc_jodie'), 'and no longer at Pittman\'s');
  assert.ok(planted.scene && planted.scene.left.includes('npc_jodie'), 'her going is a change of scene the next narration shows: ' + JSON.stringify(planted.scene));
  // Before the player goes: the narrator is told, the next narration shows her leaving, and her card says so.
  await sendText(page, 'I look around');
  const p1 = await lastText(page, 'narrate');
  assert.equal(line(p1, 'APPOINTMENTS:'), 'APPOINTMENTS: Jodie Strayhorn at the Low Water (back door, half past ten) this morning, as agreed');
  assert.match(line(p1, 'SINCE THE LAST TURN'), /left: Jodie Strayhorn/);
  const card = await page.evaluate(() => { Game.UI.openPanel('people'); return [...document.querySelectorAll('.pcard[data-npc="npc_jodie"] .pcard-flag')].map(f => ({ text: f.textContent, appt: f.dataset.appt || null })); });
  assert.deepEqual(card.filter(f => f.appt), [{ text: 'Meeting you: the Low Water, this morning (back door, half past ten)', appt: planted.sd.id }]);
  // The walk over: she is there in the narration of it, and the meeting is on.
  await sendText(page, 'I walk to the Low Water');
  const walk = await page.evaluate(() => ({ at: Game.state.player.locationId, time: Game.state.time, fired: Game.state.seeds.find(x => x.appointment).fired, here: Game.State.npcsAt(Game.state.player.locationId).map(n => n.id), due: Game.state.dueEvents.length }));
  const p2 = await lastText(page, 'narrate');
  assert.equal(walk.at, 'loc_low_water');
  assert.equal(walk.time.phase, 'morning');
  assert.ok(walk.here.includes('npc_jodie'), 'Jodie is present');
  assert.equal(walk.fired, true, 'the seed fired as the player arrived');
  assert.equal(walk.due, 0, 'told in the narration of the walk, not left for later');
  assert.match(line(p2, 'DESTINATION:'), /Present there: .*Jodie Strayhorn/);
  assert.equal(line(p2, 'DUE EVENT:'), `DUE EVENT: ${JODIE} (already true; work it into the scene naturally, not as an announcement)`);
  assert.equal(line(p2, 'APPOINTMENTS:'), '', 'the meeting is on now: no longer an appointment to come');
  // Knocking twice: the parser, the narrator and the Say chips all have her.
  await page.evaluate(() => Game.UI.setMode('say'));
  const chips = await page.evaluate(() => [...document.querySelectorAll('#say-to .say-chip')].map(b => b.dataset.to));
  assert.ok(chips.includes('npc_jodie'), 'a Say chip for Jodie: ' + chips.join(', '));
  await page.evaluate(() => Game.UI.setMode('do'));
  await sendText(page, 'I knock twice on the back door');
  const parse = await lastText(page, 'parse');
  const p3 = await lastText(page, 'narrate');
  assert.match(line(parse, 'NPCS PRESENT:'), /npc_jodie — Jodie Strayhorn/);
  assert.match(line(p3, 'PRESENT:'), /Jodie Strayhorn \(29/);
  assert.equal(line(p3, 'DUE EVENT:'), 'DUE EVENT: none', 'told once');
  assert.equal(line(p3, 'APPOINTMENTS:'), '');
  // Kept: no memory or feeling from the engine beyond the firing.
  const jodie = await page.evaluate(() => ({ att: Game.State.npc('npc_jodie').attitude, mems: Game.State.npc('npc_jodie').memories.map(m => m.text) }));
  assert.ok(!jodie.mems.some(m => /never came/.test(m)), JSON.stringify(jodie));
});

s.test('time words become phases: hours read by the clock (5-11 morning, 12-16 afternoon, 17-20 evening, 21-4 night), the times of day, today, tomorrow and a later day; no words cover the rest of the day; a time already past today is tomorrow\'s', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const at = (words, trigger) => { const a = S.appointmentOf({ effect: `Jodie Strayhorn meets the player at the Low Water ${words}`, trigger: trigger || { type: 'location', value: 'loc_low_water' } }); return a ? `${a.day}:${a.phases.join('+')}` : null; };
    const cases = {
      'at half past ten': null, 'at ten thirty': null, 'at 10:30': null, 'at six': null, 'at 6 pm': null, 'at six p.m.': null, 'at 21:00': null, 'at a quarter to twelve': null,
      'at noon': null, 'at midday': null, 'this afternoon': null, 'at two': null, 'at supper': null, 'for dinner': null, 'this evening': null, 'this evening at seven': null,
      'tonight': null, 'tonight at ten': null, 'tonight at eight': null, 'tonight at one': null, 'at last call': null, 'before closing': null, 'at dawn': null, 'over breakfast': null, 'first thing': null,
      'before opening': null, 'before eleven': null, 'whenever': null, 'tomorrow': null, 'tomorrow evening': null, 'the day after tomorrow at noon': null,
      'about last night, this afternoon': null, 'tonight with around two hundred dollars': null
    };
    for (const k of Object.keys(cases)) cases[k] = at(k);
    const day = { trigger: at('in the evening', { type: 'day', value: 3 }), wholeDay: at('', { type: 'day', value: 2 }) };
    // Later in the day: a time already past is tomorrow's; "this morning" said in the evening is no meeting left to keep.
    S.apply({ setTime: { day: 1, phase: 'evening', shorts: 0, late: false } });
    const evening = { 'at half past ten': at('at half past ten'), 'this morning': at('this morning'), none: at(''), tonight: at('tonight') };
    return { cases, day, evening };
  });
  assert.deepEqual(r.cases, {
    'at half past ten': '1:morning', 'at ten thirty': '1:morning', 'at 10:30': '1:morning', 'at six': '1:morning', 'at 6 pm': '1:evening', 'at six p.m.': '1:evening', 'at 21:00': '1:night', 'at a quarter to twelve': '1:morning',
    'at noon': '1:afternoon', 'at midday': '1:afternoon', 'this afternoon': '1:afternoon', 'at two': '1:afternoon', 'at supper': '1:evening', 'for dinner': '1:evening', 'this evening': '1:evening', 'this evening at seven': '1:evening',
    'tonight': '1:night', 'tonight at ten': '1:night', 'tonight at eight': '1:evening+night', 'tonight at one': '1:night', 'at last call': '1:night', 'before closing': '1:night', 'at dawn': '1:morning', 'over breakfast': '1:morning', 'first thing': '1:morning',
    'before opening': '1:morning', 'before eleven': '1:morning', 'whenever': '1:morning+afternoon+evening+night', 'tomorrow': '2:morning+afternoon+evening+night', 'tomorrow evening': '2:evening', 'the day after tomorrow at noon': '3:afternoon',
    'about last night, this afternoon': '1:afternoon', 'tonight with around two hundred dollars': '1:night'
  });
  assert.deepEqual(r.day, { trigger: '3:evening', wholeDay: '2:morning+afternoon+evening+night' });
  assert.deepEqual(r.evening, { 'at half past ten': '2:morning', 'this morning': null, none: '1:evening+night', tonight: '1:night' });
});

s.test('who and where: a full name or a first name nobody else has, alive, in town and free; a day trigger needs a place named in the words; a seed that names nobody in the cast (or the dead, or no place) stays a plain seed', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const G = Game.state;
    const who = (effect, trigger) => { const a = S.appointmentOf({ effect, trigger: trigger || { type: 'location', value: 'loc_low_water' } }); return a ? `${a.npcId}@${a.locationId}` : null; };
    const dead = G.npcs.find(n => n.alive === false || n.status === 'dead');
    const away = G.npcs.find(n => n.status === 'gone');
    const out = {
      full: who('Jodie Strayhorn waits at the Low Water tonight'),
      first: who('Jodie waits out back tonight'),
      firstFirst: who('Loretta says Jodie will meet the player at the Low Water tonight'),
      nobody: who('Zebulon Quintard waits at the Low Water tonight'),
      stranger: who('A man in a feed cap waits at the Low Water tonight'),
      dead: dead ? who(`${dead.name} waits at the Low Water tonight`) : 'none',
      away: away ? who(`${away.name} waits at the Low Water tonight`) : 'none',
      player: who(`${G.player.name} waits at the Low Water tonight`),
      dayPlace: who('Royce Pittman expects the player at the Low Water on day 3', { type: 'day', value: 3 }),
      dayNoPlace: who('Royce Pittman expects the player somewhere on day 3', { type: 'day', value: 3 }),
      npcTrigger: who('Royce Pittman expects the player at the Low Water tonight', { type: 'npc', value: 'npc_royce' })
    };
    // Planted by the bookkeeper: a plain seed waits a day, as before, and puts nobody anywhere.
    const n0 = G.visits.length;
    const res = S.apply({ newSeeds: [{ effect: 'Zebulon Quintard waits at the Low Water tonight', triggerType: 'location', triggerValue: 'loc_low_water' }] }, { source: 'model' });
    const sd = G.seeds[G.seeds.length - 1];
    out.plain = { rejected: res.rejected.length, appointment: sd.appointment || null, notBeforeDay: sd.notBeforeDay, visits: G.visits.length - n0 };
    return out;
  });
  assert.equal(r.full, 'npc_jodie@loc_low_water');
  assert.equal(r.first, 'npc_jodie@loc_low_water', 'a first name nobody else in the cast has');
  assert.equal(r.firstFirst, 'npc_loretta@loc_low_water', 'the person named first (the bookkeeper starts the effect with them)');
  assert.equal(r.nobody, null, 'a name that matches nobody is just text');
  assert.equal(r.stranger, null);
  if (r.dead !== 'none') assert.equal(r.dead, null, 'the dead keep no meetings');
  if (r.away !== 'none') assert.equal(r.away, null, 'nor do those who live elsewhere');
  assert.equal(r.player, null, 'the player is nobody in the cast');
  assert.equal(r.dayPlace, 'npc_royce@loc_low_water');
  assert.equal(r.dayNoPlace, null);
  assert.equal(r.npcTrigger, null, 'only a location or a day trigger');
  assert.deepEqual(r.plain, { rejected: 0, appointment: null, notBeforeDay: 2, visits: 0 });
});

s.test('a meeting on a later day: nobody moves today; that morning the person is placed for its phases, the narrator hears "tomorrow evening" then "this evening", and it fires when the player is there', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const sched = await page.evaluate(() => Game.State.npcsAt('loc_low_water', 'evening').map(n => n.id));
  assert.ok(!sched.includes('npc_royce'), 'Royce is not at the Low Water of an evening by himself');
  await bookSeed(page, { effect: 'Royce Pittman expects the player at the Low Water tomorrow evening to settle up', triggerType: 'day', triggerValue: '2' });
  await sendText(page, 'I look around');
  const d1 = await page.evaluate(() => ({ sd: Game.state.seeds.find(x => x.appointment), visits: Game.state.visits.filter(v => v.npcId === 'npc_royce'), words: Game.State.appointments() }));
  assert.deepEqual(d1.sd.appointment, { npcId: 'npc_royce', locationId: 'loc_low_water', day: 2, phase: 'evening', phases: ['evening'] });
  assert.equal(d1.sd.notBeforeDay, 2);
  assert.deepEqual(d1.visits, [], 'nobody is placed for a later day yet');
  assert.equal(d1.words[0].when, 'tomorrow evening');
  await sendText(page, 'I look around again');
  assert.equal(line(await lastText(page, 'narrate'), 'APPOINTMENTS:'), 'APPOINTMENTS: Royce Pittman at the Low Water tomorrow evening, as agreed');
  // The night passes (as /wait does): the morning of day 2 places him for the evening.
  await page.evaluate(() => { for (let i = 0; i < 4 && !(Game.state.time.day === 2 && Game.state.time.phase === 'morning'); i++) Game.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait'); });
  const d2 = await page.evaluate(() => ({ time: Game.state.time, visits: Game.state.visits.filter(v => v.npcId === 'npc_royce'), evening: Game.State.npcsAt('loc_low_water', 'evening').map(n => n.id), fired: Game.state.seeds.find(x => x.appointment).fired, words: Game.State.appointments() }));
  assert.deepEqual([d2.time.day, d2.time.phase], [2, 'morning']);
  assert.equal(d2.fired, false, 'not fired on its day\'s morning: it fires at its place');
  assert.deepEqual(d2.visits.map(v => [v.locationId, v.day, v.phase, !!v.seedId]), [['loc_low_water', 2, 'evening', true]]);
  assert.ok(d2.evening.includes('npc_royce'), 'Royce is at the Low Water this evening');
  assert.equal(d2.words[0].when, 'this evening');
  // The evening at the Low Water: it fires, told in this narration.
  await page.evaluate(() => { Game.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait'); Game.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait'); Game.State.apply({ playerLocationId: 'loc_low_water' }); });
  assert.equal(await page.evaluate(() => Game.state.time.phase), 'evening');
  await sendText(page, 'I look for Royce');
  const p = await lastText(page, 'narrate');
  assert.match(line(p, 'PRESENT:'), /Royce Pittman/);
  assert.match(line(p, 'DUE EVENT:'), /^DUE EVENT: Royce Pittman expects the player at the Low Water tomorrow evening to settle up/);
  assert.equal(await page.evaluate(() => Game.state.seeds.find(x => x.appointment).fired), true);
});

s.test('missed: the meeting\'s last phase passes without the player there; the seed goes, the person remembers waiting (weight 1) and is 3 colder, and a quiet line says so; /undo brings it all back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  await bookSeed(page, { effect: JODIE, triggerType: 'location', triggerValue: 'loc_low_water' });
  await sendText(page, 'I look around');
  const before = await page.evaluate(() => ({ att: Game.State.npc('npc_jodie').attitude, seed: Game.state.seeds.find(x => x.appointment).id }));
  await sendText(page, '/wait afternoon');
  const r = await page.evaluate(() => ({
    time: Game.state.time, seeds: Game.state.seeds.filter(x => x.appointment).length, att: Game.State.npc('npc_jodie').attitude,
    mems: Game.State.npc('npc_jodie').memories, quiet: [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent), words: Game.State.appointments()
  }));
  assert.equal(r.time.phase, 'afternoon');
  assert.equal(r.seeds, 0, 'the seed is gone');
  assert.equal(r.att, before.att - 3);
  assert.deepEqual(r.mems.map(m => [m.text, m.weight]), [['waited for Tester at the Low Water and they never came', 1]]);
  assert.ok(r.quiet.includes('Jodie Strayhorn waited at the Low Water and you never came.'), JSON.stringify(r.quiet));
  assert.deepEqual(r.words, []);
  await sendText(page, 'I look around');
  assert.equal(line(await lastText(page, 'narrate'), 'APPOINTMENTS:'), '');
  // /undo twice: back before the wait, the meeting still to come.
  await sendText(page, '/undo 2');
  const u = await page.evaluate(() => ({ time: Game.state.time.phase, sd: Game.state.seeds.find(x => x.appointment), att: Game.State.npc('npc_jodie').attitude, mems: Game.State.npc('npc_jodie').memories.length, visits: Game.state.visits.filter(v => v.seedId).length, low: Game.State.npcsAt('loc_low_water').map(n => n.id) }));
  assert.equal(u.time, 'morning');
  assert.ok(u.sd && u.sd.id === before.seed && !u.sd.fired);
  assert.equal(u.att, before.att);
  assert.equal(u.mems, 0);
  assert.equal(u.visits, 1);
  assert.ok(u.low.includes('npc_jodie'));
  // And an /undo of the turn that planted it takes the meeting back too.
  await sendText(page, '/undo');
  const u2 = await page.evaluate(() => ({ seeds: Game.state.seeds.filter(x => x.appointment).length, visits: Game.state.visits.filter(v => v.npcId === 'npc_jodie').length, pittmans: Game.State.npcsAt('loc_pittmans').map(n => n.id) }));
  assert.deepEqual(u2, { seeds: 0, visits: 0, pittmans: u2.pittmans });
  assert.ok(u2.pittmans.includes('npc_jodie'), 'back on her own schedule');
});

s.test('/cheat time past a meeting misses it (the quiet line, the memory); a jump into a later meeting\'s day places its person; a jump back changes nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  await bookSeed(page, { effect: JODIE, triggerType: 'location', triggerValue: 'loc_low_water' });
  await sendText(page, 'I look around');
  await bookSeed(page, { effect: 'Royce Pittman expects the player at the Low Water tomorrow evening to settle up', triggerType: 'day', triggerValue: '2' });
  await sendText(page, 'I look at the pumps');
  assert.equal(await page.evaluate(() => Game.state.seeds.filter(x => x.appointment).length), 2);
  await sendText(page, '/cheat time afternoon 2');
  const r = await page.evaluate(() => ({
    seeds: Game.state.seeds.filter(x => x.appointment).map(x => x.appointment.npcId), quiet: [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent),
    royce: Game.State.npcsAt('loc_low_water', 'evening').some(n => n.id === 'npc_royce'), mems: Game.State.npc('npc_jodie').memories.map(m => m.text)
  }));
  assert.deepEqual(r.seeds, ['npc_royce'], 'Jodie\'s is missed, Royce\'s still to come');
  assert.ok(r.quiet.some(q => q.includes('Jodie Strayhorn waited at the Low Water and you never came.')), JSON.stringify(r.quiet));
  assert.deepEqual(r.mems, ['waited for Tester at the Low Water and they never came']);
  assert.ok(r.royce, 'Royce is placed for this evening');
  await sendText(page, '/cheat time morning 2');
  assert.deepEqual(await page.evaluate(() => Game.state.seeds.filter(x => x.appointment).map(x => x.appointment.npcId)), ['npc_royce']);
});

s.test('kept as the time runs out: the player at the place as its last phase ends fires it; a person who can no longer keep it (arrested) drops it with nothing said; a meeting for later today leaves them in the scene now', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page, 'loc_low_water');
  const r = await page.evaluate(() => {
    const S = Game.State;
    const out = {};
    // Planted outside a turn with the player already there, then the morning ends: kept (it fires), no memory, no line.
    S.apply({ beginTurn: true });
    S.apply({ newSeeds: [{ effect: 'Jodie Strayhorn waits at the Low Water this morning', triggerType: 'location', triggerValue: 'loc_low_water' }] }, { source: 'model' });
    const sd = Game.state.seeds.find(x => x.appointment);
    Game.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    out.kept = { fired: Game.State.seed(sd.id).fired, due: Game.state.dueEvents.map(e => e.seedId), mems: S.npc('npc_jodie').memories.length };
    // Royce at the Low Water tonight, then arrested: dropped quietly when the night has passed.
    S.apply({ beginTurn: true });
    S.apply({ newSeeds: [{ effect: 'Royce Pittman meets the player at the Low Water tonight', triggerType: 'location', triggerValue: 'loc_low_water' }] }, { source: 'model' });
    const rs = Game.state.seeds.find(x => x.appointment && x.appointment.npcId === 'npc_royce');
    S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_royce', status: 'arrested' }] });
    out.words = S.appointments('npc_royce').length;
    const att = S.npc('npc_royce').attitude;
    S.apply({ playerLocationId: 'loc_pittmans' });
    for (let i = 0; i < 3; i++) Game.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    out.dropped = { gone: !S.seed(rs.id), att: S.npc('npc_royce').attitude - att, mems: S.npc('npc_royce').memories.filter(m => /never came/.test(m.text)).length };
    // Jodie's due event, never told (the player left): its moment has gone by the next morning, so it is dropped, not told late.
    out.stale = { told: Game.World.dueSeeds({ locationId: 'loc_low_water' }).filter(e => e.seedId === sd.id).length, left: Game.state.dueEvents.filter(e => e.seedId === sd.id).length };
    return out;
  });
  assert.equal(r.kept.fired, true);
  assert.equal(r.kept.mems, 0);
  assert.equal(r.kept.due.length, 1, 'its due event waits to be told at the Low Water');
  assert.equal(r.words, 0, 'no appointment shown for someone arrested');
  assert.deepEqual(r.dropped, { gone: true, att: 0, mems: 0 });
  assert.deepEqual(r.stale, { told: 0, left: 0 });
  // Someone with the player who agrees to meet later today stays in the scene now (the mock's Say case, below, too).
  await page.evaluate(() => { Game.State.apply({ setTime: { day: 3, phase: 'morning', shorts: 0, late: false } }); Game.State.apply({ playerLocationId: 'loc_pittmans' }); });
  await bookSeed(page, { effect: 'Jodie Strayhorn meets the player at the Low Water tonight', triggerType: 'location', triggerValue: 'loc_low_water' });
  await sendText(page, 'I look around');
  const later = await page.evaluate(() => ({ pittmans: Game.State.npcsAt('loc_pittmans').map(n => n.id), night: Game.State.npcsAt('loc_low_water', 'night').map(n => n.id), scene: Game.state.pendingScene || null }));
  assert.ok(later.pittmans.includes('npc_jodie'), 'still here this morning');
  assert.ok(later.night.includes('npc_jodie'), 'and at the Low Water tonight');
  assert.ok(!later.scene || !(later.scene.left || []).includes('npc_jodie'), 'she does not leave now');
});

s.test('the demo: "Meet me at the Low Water tonight" said to Jodie has her agree in the narration, and the demo bookkeeper records the meeting, which the engine keeps', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  assert.equal((await say(page, 'Meet me at the Low Water tonight.', 'npc_jodie')).ok, true);
  const r = await page.evaluate(() => ({
    narration: Game.state.log[Game.state.log.length - 1].narration,
    sd: Game.state.seeds.find(x => x.appointment) || null,
    night: Game.State.npcsAt('loc_low_water', 'night').map(n => n.id),
    pittmans: Game.State.npcsAt('loc_pittmans').map(n => n.id)
  }));
  assert.ok(r.narration.includes('Jodie Strayhorn nods. "The Low Water, tonight."'), r.narration);
  assert.ok(r.sd, 'the demo bookkeeper recorded the meeting');
  assert.deepEqual(r.sd.trigger, { type: 'location', value: 'loc_low_water' });
  assert.match(r.sd.effect, /^Jodie Strayhorn meets Tester at the Low Water tonight, as agreed\.$/);
  assert.deepEqual(r.sd.appointment, { npcId: 'npc_jodie', locationId: 'loc_low_water', day: 1, phase: 'night', phases: ['night'] });
  assert.ok(r.night.includes('npc_jodie') && r.pittmans.includes('npc_jodie'), 'there tonight, still here now');
  await sendText(page, 'I look around');
  assert.equal(line(await lastText(page, 'narrate'), 'APPOINTMENTS:'), 'APPOINTMENTS: Jodie Strayhorn at the Low Water tonight, as agreed');
  // Words that make no meeting: no place, or no time, or said to everyone.
  for (const [w, to] of [['Meet me at the river sometime.', 'npc_jodie'], ['Meet me at the Low Water.', 'npc_jodie'], ['Meet me at the Low Water tomorrow.', 'everyone']]) {
    const n0 = await page.evaluate(() => Game.state.seeds.length);
    await say(page, w, to);
    assert.equal(await page.evaluate(() => Game.state.seeds.length), n0, w);
  }
});

s.test('on a phone the People card\'s meeting line wraps inside the card (no sideways scroll)', async h => {
  const page = await h.open({ viewport: PHONE });
  await start(page);
  await bookSeed(page, { effect: JODIE, triggerType: 'location', triggerValue: 'loc_low_water' });
  assert.equal((await say(page, 'When can we talk where nobody hears?', 'npc_jodie')).ok, true);
  const flag = await page.evaluate(() => { Game.UI.openPanel('people'); const f = document.querySelector('.pcard[data-npc="npc_jodie"] .pcard-flag[data-appt]'); return f ? f.textContent : null; });
  assert.equal(flag, 'Meeting you: the Low Water, this morning (back door, half past ten)');
  assert.deepEqual(await overflowReport(page, PHONE.width), []);
});

s.test('/rewind strikes a seed planted on a struck turn, with its visits; one planted before stays', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  await sendText(page, 'I look around');
  await bookSeed(page, { effect: 'Jodie Strayhorn meets the player at the Low Water tomorrow evening', triggerType: 'location', triggerValue: 'loc_low_water' });
  await sendText(page, 'I look at the pumps');
  const keepTurn = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].turn);
  assert.ok(!(await page.evaluate(() => Game.State.npcsAt('loc_low_water', 'night').some(n => n.id === 'npc_royce'))), 'Royce is not at the Low Water of a night by himself');
  await bookSeed(page, { effect: 'Royce Pittman meets the player at the Low Water tonight', triggerType: 'location', triggerValue: 'loc_low_water' });
  await sendText(page, 'I look around again');
  const mid = await page.evaluate(() => ({ seeds: Game.state.seeds.filter(x => x.appointment).map(x => [x.appointment.npcId, x.turn]), visits: Game.state.visits.filter(v => v.seedId).map(v => v.npcId), night: Game.State.npcsAt('loc_low_water', 'night').map(n => n.id) }));
  assert.deepEqual(mid.seeds.map(x => x[0]), ['npc_jodie', 'npc_royce']);
  assert.equal(mid.seeds[0][1], keepTurn, 'a seed keeps the turn it was planted on');
  assert.deepEqual(mid.visits, ['npc_royce'], 'Jodie\'s is a later day\'s: no visit yet');
  assert.ok(mid.night.includes('npc_royce'));
  await sendText(page, `/rewind to turn ${keepTurn}`);
  const r = await page.evaluate(() => ({ seeds: Game.state.seeds.filter(x => x.appointment).map(x => x.appointment.npcId), visits: Game.state.visits.filter(v => v.seedId).length, night: Game.State.npcsAt('loc_low_water', 'night').map(n => n.id) }));
  assert.deepEqual(r.seeds, ['npc_jodie'], 'the one planted on a kept turn stays');
  assert.equal(r.visits, 0);
  assert.ok(!r.night.includes('npc_royce'), 'Royce is back on his own schedule tonight');
});

s.test('the bookkeeper is told how to record a meeting (prompt only); record_changes is unchanged (41 properties, the same schema); the packet says a meeting today triggers on its place', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const r = await page.evaluate(() => ({ rules: Game.Api.RECORD_RULES, sys: Game.Api.SYSTEM.bookkeeper, rc: JSON.stringify(Game.Api.SCHEMAS.record_changes), seeds: Object.keys(Game.Api.SCHEMAS.record_changes.properties.newSeeds.items.properties) }));
  for (const bit of ['A meeting someone in the narration agrees to with the player, later today or on a later day, is one seed', 'triggerType location with that place\'s id as triggerValue', 'triggerType day with the day number when it is another day, with the place named in the effect', 'the effect starts with that person\'s full name and says where exactly and when', "'Jodie Strayhorn waits at the Low Water's back door at half past ten, before opening'", "one seed per meeting, none for a vague 'see you around'"]) {
    assert.ok(r.rules.includes(bit), 'rule: ' + bit);
    assert.ok(r.sys.includes(bit), 'in the system prompt: ' + bit);
  }
  const count = node => { let n = 0; const walk = x => { if (Array.isArray(x)) return x.forEach(walk); if (x && typeof x === 'object') { if (x.type === 'object' && x.properties) n += Object.keys(x.properties).length; Object.values(x).forEach(walk); } }; walk(node); return n; };
  assert.equal(count(JSON.parse(r.rc)), 41);
  assert.deepEqual(r.seeds, ['effect', 'triggerType', 'triggerValue']);
  // The exact schema the wave 21 build sent (the grammar limit: wave 17).
  assert.equal(crypto.createHash('sha256').update(r.rc).digest('hex'), 'a5a714b4852db5e4966aa491a8b5ecf4eccf0d5f66cc5d26cbb114e6c44ad344');
  await sendText(page, 'I look around');
  assert.match(await lastText(page, 'bookkeep'), /^TURN \d+ · DAY 1, MORNING(?: \([a-z ]+\))?\. A new seed's day trigger is day 2 or later; a meeting agreed for later today triggers on its place \(location\)\./);
});

s.run();
