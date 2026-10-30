'use strict';
/* Milestone 4: the living world (SPEC.md section 8; section 6 steps 11-12;
   section 10 chronicle; section 12 /debug; section 13 cost control) against
   the mock provider. Every id, name, clock and effect comes from Game.data /
   Game.state, never from one particular town, so the suite keeps working
   when the town is swapped. Test hooks used (documented in the World
   module): Game.World.forceClockRoll(value, factionId?) and
   Game.World.forceAttitude(npcId, value).
   Run with: node tests/run.cjs world */
const assert = require('assert/strict');
const { suite, quickStart, sendText, findScene, place, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('world');

const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const lastPacket = page => page.evaluate(() => { const c = Game.Api.Mock.calls.filter(x => x.method === 'narrate'); return c.length ? c[c.length - 1].text : ''; });
const line = (packet, label) => (packet.split('\n').find(l => l.startsWith(label + ':')) || '').slice(label.length + 1).trim();
const lastLog = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const time = page => page.evaluate(() => ({ day: Game.state.time.day, phase: Game.state.time.phase }));
const nextPhase = async page => PHASES[(PHASES.indexOf((await time(page)).phase) + 1) % 4];
/* One world tick through a real turn: /wait until the next phase. */
const onePhase = async page => sendText(page, `/wait ${await nextPhase(page)}`);
const quietLines = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(e => e.textContent));
const clocks = page => page.evaluate(() => Game.state.factions.map(f => ({ id: f.id, active: f.activeClock, filled: f.activeClock >= 0 ? f.clocks[f.activeClock].filled : null, segments: f.activeClock >= 0 ? f.clocks[f.activeClock].segments : null })));
const feelings = (page, npcId, kind) => page.evaluate(([id, k]) => Game.state.seeds.filter(sd => sd.origin && sd.origin.kind === k && sd.origin.npcId === id), [npcId, kind]);
const restUntil = async (page, day) => { for (let i = 0; i < 12 && (await time(page)).day < day; i++) await sendText(page, '/rest'); };

/* In the page: everything a completed clock's effects should have done to the
   town, checked against a copy of the state taken before. Returns problems. */
function checkEffects({ effects, before }) {
  const G = Game;
  const st = G.state;
  const P = ['morning', 'afternoon', 'evening', 'night'];
  const out = [];
  const was = id => before.npcs.find(n => n.id === id);
  const where = id => P.map(p => st.locations.filter(l => (l.npcIdsBySchedule[p] || []).includes(id)).map(l => l.id));
  const police = st.locations.find(l => l.type === 'police') || st.locations.find(l => l.type === 'watch');
  const freeBefore = id => { const b = was(id); return b && b.alive !== false && b.status === 'free'; };
  for (const e of effects) {
    switch (e.op) {
      case 'closeLocation': if (!G.State.loc(e.locationId).closed) out.push(`${e.locationId} is not closed`); break;
      case 'openLocation': if (G.State.loc(e.locationId).closed) out.push(`${e.locationId} is not open`); break;
      case 'npcStatus': {
        const b = was(e.npcId);
        if (b.status === 'gone' || b.status === 'dead' || b.alive === false) break; // a no-op by design (content note 6)
        const n = G.State.npc(e.npcId);
        const later = effects.slice(effects.indexOf(e) + 1).some(x => x.op === 'npcStatus' && x.npcId === e.npcId);
        if (later) break;
        if (n.status !== e.status) { out.push(`${e.npcId} is ${n.status}, not ${e.status}`); break; }
        if (e.status === 'arrested' && police && !where(e.npcId).every(ls => ls.length === 1 && ls[0] === police.id)) out.push(`${e.npcId} is not in the cells in every phase`);
        if (e.status === 'gone' && where(e.npcId).some(ls => ls.length)) out.push(`${e.npcId} is gone but still scheduled`);
        if (e.status === 'dead' && n.alive !== false) out.push(`${e.npcId} is not dead`);
        break;
      }
      case 'npcMove': {
        const n = G.State.npc(e.npcId);
        if (!freeBefore(e.npcId) || n.status !== 'free') break;
        const ph = e.phases === 'all' || !e.phases ? P : e.phases;
        if (!ph.every(p => (G.State.loc(e.locationId).npcIdsBySchedule[p] || []).includes(e.npcId))) out.push(`${e.npcId} did not move to ${e.locationId}`);
        break;
      }
      case 'priceMultiplier': if (e.factor !== 1 && st.flags.priceMultiplier === before.flags.priceMultiplier) out.push('prices did not change'); break;
      case 'openThread': if (!G.State.thread(e.thread.id)) out.push(`no thread ${e.thread.id}`); break;
      case 'threadStatus': if (G.State.thread(e.threadId).status !== e.status) out.push(`${e.threadId} is not ${e.status}`); break;
      case 'addRumour': { const r = G.State.rumour(e.rumour.id); if (!r) out.push(`no rumour ${e.rumour.id}`); else if (!Number.isInteger(r.addedTurn)) out.push(`${r.id} is not marked as news`); break; }
      case 'plantSeed': if (!G.State.seed(e.seed.id)) out.push(`no seed ${e.seed.id}`); break;
      case 'setFlag': if (st.flags[e.key] !== e.value) out.push(`flag ${e.key} not set`); break;
      default: break;
    }
  }
  return out;
}
/* In the page: ids a bystander would see an effect list touch (the World's rule). */
function seenIds(effects) {
  const ids = [];
  for (const e of effects) {
    if (!['closeLocation', 'openLocation', 'npcStatus', 'npcMove', 'openThread', 'threadStatus'].includes(e.op)) continue;
    if (e.locationId) ids.push(e.locationId);
    if (e.npcId) ids.push(e.npcId);
    const t = e.op === 'openThread' ? e.thread : e.op === 'threadStatus' ? Game.State.thread(e.threadId) : null;
    if (t && Array.isArray(t.linkedIds)) ids.push(...t.linkedIds);
  }
  return ids;
}
/* In the page: what the last narrator packet must never carry (SPEC rule 1,
   section 10 and 13). Returns problems. */
function packetProblems() {
  const G = Game;
  const st = G.state;
  const calls = G.Api.Mock.calls.filter(c => c.method === 'narrate');
  const p = calls.length ? calls[calls.length - 1].text : '';
  const get = label => (p.split('\n').find(l => l.startsWith(label + ':')) || '').slice(label.length + 1).trim();
  const bad = [];
  for (const n of st.npcs) {
    if (n.secret && n.secret.length > 20 && p.includes(n.secret)) bad.push('secret of ' + n.id);
    if (n.goal && n.goal.length > 20 && p.includes(n.goal)) bad.push('goal of ' + n.id);
  }
  for (const f of st.factions) {
    if (f.goal && p.includes(f.goal)) bad.push('goal of ' + f.id);
    for (const c of f.clocks) if (c.label.length > 15 && p.includes(c.label)) bad.push('clock label ' + c.label);
  }
  for (const sd of st.seeds) if (!sd.fired && p.includes(sd.effect)) bad.push('unfired seed ' + sd.id);
  if (/\b(TRUE|FALSE)\b/.test(p)) bad.push('rumour truth');
  // Only people in the scene at narration time.
  const ctx = G.Pipeline.lastTurn && G.Pipeline.lastTurn.ctx;
  const present = get('PRESENT');
  if (ctx && Array.isArray(ctx.present)) {
    const ids = ctx.present.map(n => n.id);
    for (const n of st.npcs) if (!ids.includes(n.id) && present.includes(n.name + ' (')) bad.push('not present: ' + n.id);
  }
  const story = get('STORY SO FAR');
  if (story !== 'nothing yet' && story.split(/\s+/).length > 150) bad.push('story so far over 150 words');
  const last3 = get('LAST 3 TURNS');
  if (last3 !== 'none' && last3.split(' | ').length > 3) bad.push('more than 3 turns of log');
  const due = get('DUE EVENT');
  if (due !== 'none' && due.split(' / ').length > 2) bad.push('more than 2 due events');
  for (const sd of st.seeds) if (due.includes(sd.effect) && !sd.fired) bad.push('due but unfired ' + sd.id);
  return bad;
}

s.test('faction clocks advance over several days; a completed clock changes the town, is noticed only in view, and the next clock starts', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 2024 });
  await fast(page);
  const start = await clocks(page);
  assert.ok(start.every(c => c.active === 0 && c.filled === 0), 'every faction starts on its first clock');
  // From the data: the first clock whose completion closes a place or takes someone away.
  const target = await page.evaluate(() => {
    for (const f of Game.state.factions) {
      for (let i = 0; i < f.clocks.length; i++) {
        const fx = f.clocks[i].onComplete.effects;
        const hit = fx.find(e => e.op === 'closeLocation' || (e.op === 'npcStatus' && ['arrested', 'gone'].includes(e.status)));
        if (hit) return { factionId: f.id, index: i, hit, text: f.clocks[i].onComplete.text, nextLabel: f.clocks[i + 1] ? f.clocks[i + 1].label : null };
      }
    }
    return null;
  });
  assert.ok(target, 'the town has a clock that closes a place or takes someone away');
  // Natural rolls for the others (a d6 per faction per phase from the seeded Rng; 5 or 6 fills); the target waits.
  await page.evaluate(id => Game.World.forceClockRoll(1, id), target.factionId);
  const rng0 = await page.evaluate(() => Game.state.meta.rngCalls);
  for (let i = 0; i < 3; i++) await sendText(page, '/rest');
  const natural = await clocks(page);
  const progress = natural.filter(c => c.id !== target.factionId).reduce((n, c) => n + (c.active < 0 ? 99 : c.active * 6 + c.filled), 0);
  assert.ok(progress > 0, 'some clock moved in three days: ' + JSON.stringify(natural));
  assert.ok((await page.evaluate(() => Game.state.meta.rngCalls)) - rng0 >= 12 * (start.length - 1), 'one roll per faction per phase');
  await sendText(page, '/debug');
  const dbg = await page.innerText('#panel-body');
  for (const c of natural.filter(x => x.active >= 0)) assert.ok(dbg.includes(`${c.filled}/${c.segments}`), 'debug shows segments ' + c.id);
  assert.match(dbg, /[\u25A0\u25A1]{6}/, 'a segment bar');
  await sendText(page, '/debug');

  // Force the dice: only that faction fills, one segment a phase.
  await page.evaluate(id => { Game.World.forceClockRoll(1); Game.World.forceClockRoll(6, id); }, target.factionId);
  let done = false;
  for (let step = 0; step < 40 && !done; step++) {
    const nxt = await nextPhase(page);
    const plan = await page.evaluate(([fid, nxt, seenIdsSrc]) => {
      const seen = eval('(' + seenIdsSrc + ')');
      const f = Game.State.faction(fid);
      const c = f.clocks[f.activeClock];
      if (c.filled < c.segments - 1) return { completes: false };
      const ids = seen(c.onComplete.effects);
      const open = Game.state.locations.filter(l => !l.closed);
      const inView = open.find(l => ids.includes(l.id)) || open.find(l => Game.State.npcsAt(l.id, nxt).some(n => ids.includes(n.id)));
      const outOfView = open.find(l => !ids.includes(l.id) && !Game.State.npcsAt(l.id, nxt).some(n => ids.includes(n.id)));
      return { completes: true, index: f.activeClock, text: c.onComplete.text, effects: c.onComplete.effects, inView: inView ? inView.id : null, outOfView: outOfView ? outOfView.id : null };
    }, [target.factionId, nxt, seenIds.toString()]);
    const isTarget = plan.completes && plan.index === target.index;
    if (plan.completes) await place(page, isTarget ? (plan.inView || plan.outOfView) : plan.outOfView);
    const before = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state)));
    const filledBefore = (await clocks(page)).find(c => c.id === target.factionId);
    await onePhase(page);
    const after = (await clocks(page)).find(c => c.id === target.factionId);
    if (!plan.completes) { assert.equal(after.filled, filledBefore.filled + 1, 'a forced 6 fills one segment'); continue; }
    // The clock completed: its effects ran, the next clock started at 0.
    assert.equal(after.active, plan.index + 1 < (await page.evaluate(id => Game.State.faction(id).clocks.length, target.factionId)) ? plan.index + 1 : -1, 'next clock in sequence');
    if (after.active >= 0) assert.equal(after.filled, 0, 'the next clock starts empty');
    assert.deepEqual(await page.evaluate(checkEffects, { effects: plan.effects, before }), [], 'every effect changed the town');
    const quiet = await quietLines(page);
    const others = (await clocks(page)).filter(c => c.id !== target.factionId);
    assert.deepEqual(others.map(c => [c.active, c.filled]), natural.filter(c => c.id !== target.factionId).map(c => [c.active, c.filled]), 'the other factions were held still');
    const noticed = quiet.some(q => q.startsWith(plan.text.slice(0, 120)));
    if (isTarget && plan.inView) assert.ok(noticed, 'a completion in view gets a quiet notice');
    if (!isTarget) assert.ok(!noticed, 'an off-screen completion is silent');
    if (isTarget) {
      done = true;
      if (target.hit.op === 'closeLocation') assert.equal(await page.evaluate(id => Game.State.loc(id).closed, target.hit.locationId), true);
      else if (before.npcs.find(x => x.id === target.hit.npcId).status !== 'gone') assert.equal(await page.evaluate(id => Game.State.npc(id).status, target.hit.npcId), target.hit.status);
      if (target.nextLabel) {
        await sendText(page, '/debug');
        assert.ok((await page.innerText('#panel-body')).includes(`0/6 "${target.nextLabel}"`), 'debug shows the next clock running');
      }
    }
  }
  assert.ok(done, 'the target clock completed');
});

s.test('schedules move NPCs between phases; arrested NPCs sit in the police station in every phase and gone ones are nowhere', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 77 });
  await fast(page);
  const nxt = await nextPhase(page);
  const mover = await page.evaluate(nxt => {
    const st = Game.state;
    const at = (id, ph) => st.locations.filter(l => (l.npcIdsBySchedule[ph] || []).includes(id)).map(l => l.id);
    for (const n of st.npcs) {
      const a = at(n.id, st.time.phase);
      const b = at(n.id, nxt);
      if (a.length === 1 && !b.includes(a[0])) return { id: n.id, name: n.name, from: a[0], to: b[0] || null };
    }
    return null;
  }, nxt);
  assert.ok(mover, 'someone keeps a different place in the next phase');
  await place(page, mover.from);
  await sendText(page, 'I look around');
  assert.ok(line(await lastPacket(page), 'PRESENT').includes(mover.name + ' ('), 'present before');
  await onePhase(page);
  const r = await page.evaluate(m => ({ here: Game.State.npcsAt(m.from).map(n => n.id), there: m.to ? Game.State.npcsAt(m.to).map(n => n.id) : [] }), mover);
  assert.ok(!r.here.includes(mover.id), 'gone from their morning place');
  if (mover.to) assert.ok(r.there.includes(mover.id), 'at their next place');
  await sendText(page, 'I look around');
  assert.ok(!line(await lastPacket(page), 'PRESENT').includes(mover.name + ' ('), 'not in the packet any more');
  // Everyone everywhere is exactly where the schedule says for this phase.
  assert.ok(await page.evaluate(() => Game.state.locations.every(l => {
    const want = (l.npcIdsBySchedule[Game.state.time.phase] || []).filter(id => { const n = Game.State.npc(id); return n.alive !== false && n.status !== 'gone' && n.status !== 'dead'; });
    return JSON.stringify(Game.State.npcsAt(l.id).map(n => n.id).sort()) === JSON.stringify(want.slice().sort());
  })));
  // Arrested: the police station in every phase, and a later move is a no-op.
  const r2 = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const P = ['morning', 'afternoon', 'evening', 'night'];
    const police = st.locations.find(l => l.type === 'police') || st.locations.find(l => l.type === 'watch');
    const scheduled = st.npcs.filter(n => n.status === 'free' && st.locations.some(l => P.some(p => (l.npcIdsBySchedule[p] || []).includes(n.id))));
    const [a, b] = scheduled;
    const other = st.locations.find(l => l !== police && !l.closed);
    G.State.apply({ effects: [{ op: 'npcStatus', npcId: a.id, status: 'arrested' }, { op: 'npcMove', npcId: a.id, locationId: other.id, phases: 'all' }, { op: 'npcStatus', npcId: b.id, status: 'gone' }] });
    return {
      police: !!police,
      cells: police ? P.every(p => G.State.npcsAt(police.id, p).some(n => n.id === a.id)) : null,
      elsewhere: st.locations.filter(l => l !== police).some(l => P.some(p => G.State.npcsAt(l.id, p).some(n => n.id === a.id))),
      gone: st.locations.some(l => P.some(p => G.State.npcsAt(l.id, p).some(n => n.id === b.id)))
    };
  });
  assert.ok(r2.police, 'the town has a police station');
  assert.equal(r2.cells, true, 'arrested: in the cells in every phase');
  assert.equal(r2.elsewhere, false, 'arrested: nowhere else, even after an npcMove');
  assert.equal(r2.gone, false, 'gone: nowhere');
});

s.test('a debt loose end brings its lender to the player on its day: the due event is in the packet and the narration, then consumed', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 4242, kinds: ['debt', 'enemy', 'secret'] });
  await fast(page);
  await page.evaluate(() => Game.World.forceClockRoll(1)); // no clock completes and takes the lender away
  const le = await page.evaluate(() => {
    const le = Game.state.player.looseEnds.find(x => x.kind === 'debt');
    const sd = Game.State.seed(le.seedId);
    return { seedId: sd.id, day: sd.trigger.value, type: sd.trigger.type, npcId: le.npcId, name: Game.State.npc(le.npcId).name, effect: sd.effect, offset: Game.data.LOOSE_ENDS.debt.seed.dayOffset };
  });
  assert.equal(le.type, 'day');
  assert.ok(le.day >= le.offset[0] && le.day <= le.offset[1], `day ${le.day} in ${le.offset}`);
  // Rest day by day; the seed waits for its day.
  while ((await time(page)).day < le.day - 1) {
    await sendText(page, '/rest');
    assert.equal(await page.evaluate(id => Game.State.seed(id).fired, le.seedId), false, 'not before its day');
  }
  // Spend the night somewhere the lender is not in the morning, so they have to come.
  const away = await page.evaluate(id => Game.state.locations.find(l => !l.closed && !(l.npcIdsBySchedule.morning || []).includes(id)).id, le.npcId);
  await place(page, away);
  await sendText(page, '/rest');
  const fired = await page.evaluate(id => ({ day: Game.state.time.day, seed: Game.State.seed(id), due: Game.state.dueEvents.find(e => e.seedId === id) }), le.seedId);
  assert.equal(fired.day, le.day);
  assert.equal(fired.seed.fired, true, 'fired on its day');
  assert.ok(fired.due && fired.due.firedDay === le.day && fired.due.npcId === le.npcId && fired.due.bring === true, JSON.stringify(fired.due));
  // The next narrations carry it (at most two due events each), with the lender in the scene.
  let hit = null;
  for (let i = 0; i < 3 && !hit; i++) {
    await sendText(page, '/look');
    const packet = await lastPacket(page);
    if (line(packet, 'DUE EVENT').includes(le.effect)) hit = { packet, log: await lastLog(page) };
  }
  assert.ok(hit, 'the due event reached the narrator');
  assert.ok(line(hit.packet, 'PRESENT').includes(le.name + ' ('), 'the lender came to the player');
  assert.ok(hit.log.narration.includes(le.effect.slice(0, 50)), 'and it is in the narration');
  assert.equal(await page.evaluate(id => Game.state.dueEvents.some(e => e.seedId === id), le.seedId), false, 'consumed after narration');
  await sendText(page, '/look');
  assert.ok(!line(await lastPacket(page), 'DUE EVENT').includes(le.effect), 'not told twice');
  assert.equal(await page.evaluate(() => Game.state.player.locationId), away, 'the player never moved: the lender came');
});

s.test('three insults turn an NPC cold; at -60 with a weight-3 memory they plant exactly one grudge seed, which fires on its day', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 99 });
  await fast(page);
  await page.evaluate(() => Game.World.forceClockRoll(1)); // no clock completes and takes the NPC away
  const sc = await findScene(page, { minAtt: -15, maxAtt: 20 });
  const x = sc.npcs[0];
  await place(page, sc.loc.id, sc.phase);
  for (let i = 0; i < 3; i++) await sendText(page, `I insult ${x.name}`);
  const n = await page.evaluate(id => Game.State.npc(id), x.id);
  assert.equal(n.attitude, x.attitude - 45);
  assert.deepEqual(n.memories.filter(m => /insulted/.test(m.text)).map(m => m.weight), [2, 3, 3]);
  await sendText(page, `I talk to ${x.name}`);
  assert.ok((await lastLog(page)).narration.includes(`${x.name} gives you a cold look`), 'greeting turned cold');
  assert.ok(await page.evaluate(() => Game.state.player.reputation.town < 0), 'reputation drifted down with the insults');
  // Cold is not enough: a phase passes and nothing is planted.
  await onePhase(page);
  assert.equal((await feelings(page, x.id, 'grudge')).length, 0, 'no grudge above -60');
  // Test hook: push the attitude to the threshold (the grudge logic is the real World tick).
  await page.evaluate(id => Game.World.forceAttitude(id, -60), x.id);
  const at = await page.evaluate(id => Game.World.whereIs(id), x.id);
  if (at) {
    await place(page, at);
    await sendText(page, `I talk to ${x.name}`);
    assert.ok((await lastLog(page)).narration.includes(`${x.name} turns away and will not look at you`), 'greeting turned hostile');
  }
  assert.equal((await feelings(page, x.id, 'grudge')).length, 0, 'planted at the tick, not before');
  const day = (await time(page)).day;
  await onePhase(page);
  const g = await feelings(page, x.id, 'grudge');
  assert.equal(g.length, 1, 'exactly one grudge seed');
  const tpl = await page.evaluate(([i, name, player]) => Game.data.GRUDGE_TEMPLATES[i].effect.replace(/\{npc\}/g, name).replace(/\{player\}/g, player), [g[0].origin.template, x.name, 'Tester']);
  assert.equal(g[0].effect, tpl, 'from GRUDGE_TEMPLATES with {npc} and {player} filled');
  const off = await page.evaluate(i => Game.data.GRUDGE_TEMPLATES[i].dayOffset, g[0].origin.template);
  const today = (await time(page)).day;
  assert.equal(g[0].trigger.type, 'day');
  assert.ok(g[0].trigger.value >= day + off[0] && g[0].trigger.value <= today + off[1] && off[0] >= 2 && off[1] <= 5, `fires in 2-5 days: ${g[0].trigger.value} from day ${today}`);
  assert.equal(g[0].hidden, true);
  // Never re-planted while it waits, however many phases pass.
  for (let i = 0; i < 3; i++) await onePhase(page);
  assert.equal((await feelings(page, x.id, 'grudge')).length, 1, 'still exactly one');
  assert.ok(!(await lastPacket(page)).includes(g[0].effect), 'an unfired grudge never reaches the narrator');
  // On its day it fires and is narrated; at no point are two unfired grudges waiting.
  let told = false;
  for (let i = 0; i < 8 && !told; i++) {
    await sendText(page, (await time(page)).day < g[0].trigger.value ? '/rest' : '/look');
    const open = (await feelings(page, x.id, 'grudge')).filter(sd => !sd.fired);
    assert.ok(open.length <= 1, 'at most one unfired grudge per NPC');
    if (line(await lastPacket(page), 'DUE EVENT').includes(g[0].effect)) told = true;
  }
  assert.ok(told, 'the grudge became a due event and was narrated');
  assert.equal(await page.evaluate(id => Game.State.seed(id).fired, g[0].id), true);
});

s.test('a favour seed at attitude 60 or more, once the NPC remembers something the player did; not at 59, not unearned', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 5 });
  await fast(page);
  await page.evaluate(() => Game.World.forceClockRoll(1));
  const [a, b] = await page.evaluate(() => Game.state.npcs.filter(n => n.status === 'free' && n.memories.length === 0 && n.attitude > -25).slice(0, 2).map(n => ({ id: n.id, name: n.name })));
  await page.evaluate(id => {
    Game.World.forceAttitude(id, 59);
    Game.State.apply({ newMemories: [{ npcId: id, text: 'The player paid for their supper', weight: 2 }] });
  }, a.id);
  await page.evaluate(id => Game.World.forceAttitude(id, 70), b.id); // warm, but nothing remembered
  await onePhase(page);
  assert.equal((await feelings(page, a.id, 'favour')).length, 0, 'none at 59');
  assert.equal((await feelings(page, b.id, 'favour')).length, 0, 'none without a memory of the player');
  await page.evaluate(id => Game.World.forceAttitude(id, 60), a.id);
  const day = (await time(page)).day;
  await onePhase(page);
  const f = await feelings(page, a.id, 'favour');
  assert.equal(f.length, 1, 'one favour seed');
  assert.ok(f[0].effect.includes(a.name) && f[0].effect.includes('Tester'));
  const tpl = await page.evaluate(i => Game.data.FAVOUR_TEMPLATES[i], f[0].origin.template);
  assert.ok(tpl && f[0].trigger.type === 'day' && f[0].trigger.value >= day + tpl.dayOffset[0] && f[0].trigger.value <= day + 1 + tpl.dayOffset[1]);
  await onePhase(page);
  assert.equal((await feelings(page, a.id, 'favour')).length, 1, 'not planted twice');
  assert.equal((await feelings(page, a.id, 'grudge')).length, 0);
});

s.test('location, npc and clock seeds fire at the right moment, wait for notBeforeDay, are capped at two per narration and consumed after it', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 31 });
  await fast(page);
  const dest = await page.evaluate(() => {
    const here = Game.State.loc(Game.state.player.locationId);
    const l = here.exits.map(id => Game.State.loc(id)).find(x => !x.closed && !/morning|afternoon|evening|night/i.test(x.name)
      && !Game.state.seeds.some(sd => !sd.fired && sd.trigger.type === 'location' && sd.trigger.value === x.id));
    return { id: l.id, name: l.name };
  });
  await page.evaluate(() => Game.World.forceClockRoll(1));
  const plant = (page, seeds) => page.evaluate(seeds => {
    const r = Game.State.apply({ effects: seeds.map(seed => ({ op: 'plantSeed', seed: Object.assign({ cause: 'test', fired: false, hidden: true }, seed) })) });
    if (r.rejected.length) throw new Error(JSON.stringify(r.rejected));
  }, seeds);
  await plant(page, [1, 2, 3].map(i => ({ id: `seed_test_loc_${i}`, effect: `Test location event number ${i} happens here.`, trigger: { type: 'location', value: dest.id } })));
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.state.seeds.filter(s => s.id.startsWith('seed_test_loc') && s.fired).length), 0, 'not fired away from the place');
  await sendText(page, `I walk to ${dest.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), dest.id);
  assert.deepEqual(await page.evaluate(() => Game.state.dueEvents.map(e => e.seedId)), ['seed_test_loc_1', 'seed_test_loc_2', 'seed_test_loc_3'], 'all three fired on arrival');
  await sendText(page, 'I look around');
  const DUE_NOTE = ' (already true; work it into the scene naturally, not as an announcement)';
  assert.equal(line(await lastPacket(page), 'DUE EVENT'), 'Test location event number 1 happens here. / Test location event number 2 happens here.' + DUE_NOTE, 'two per narration');
  assert.ok((await lastLog(page)).narration.includes('Test location event number 2 happens here.'));
  assert.deepEqual(await page.evaluate(() => Game.state.dueEvents.map(e => e.seedId)), ['seed_test_loc_3'], 'the third waits');
  await sendText(page, 'I look around');
  assert.equal(line(await lastPacket(page), 'DUE EVENT'), 'Test location event number 3 happens here.' + DUE_NOTE);
  await sendText(page, 'I look around');
  assert.equal(line(await lastPacket(page), 'DUE EVENT'), 'none', 'all consumed');

  // npc triggers: fire when that NPC is with the player; notBeforeDay holds one back.
  const sc = await findScene(page, { min: 1 });
  const who = sc.npcs[0];
  await place(page, sc.loc.id, sc.phase);
  const day = (await time(page)).day;
  await plant(page, [
    { id: 'seed_test_npc_now', effect: `${who.name} has news for the test.`, trigger: { type: 'npc', value: who.id } },
    { id: 'seed_test_npc_later', effect: `${who.name} has later news for the test.`, trigger: { type: 'npc', value: who.id }, notBeforeDay: day + 1 }
  ]);
  const away = await page.evaluate(id => Game.state.locations.find(l => !l.closed && !Game.State.npcsAt(l.id).some(n => n.id === id)).id, who.id);
  await place(page, away);
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.State.seed('seed_test_npc_now').fired), false, 'not fired without them');
  await place(page, sc.loc.id);
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.State.seed('seed_test_npc_now').fired), true, 'fired once they meet');
  assert.equal(await page.evaluate(() => Game.State.seed('seed_test_npc_later').fired), false, 'notBeforeDay holds it back');
  await sendText(page, 'I look around');
  assert.ok(line(await lastPacket(page), 'DUE EVENT').includes(`${who.name} has news for the test.`));
  assert.equal(await page.evaluate(() => Game.state.dueEvents.some(e => e.seedId === 'seed_test_npc_now')), false, 'consumed');
  await sendText(page, '/rest');
  const where = await page.evaluate(id => Game.World.whereIs(id), who.id);
  if (where) {
    await place(page, where);
    await sendText(page, 'I look around');
    assert.equal(await page.evaluate(() => Game.State.seed('seed_test_npc_later').fired), true, 'fires on a later day');
  }

  // A clock trigger fires as soon as the running clock reaches N.
  const fac = await page.evaluate(() => { const f = Game.state.factions.find(x => x.activeClock >= 0 && x.clocks[x.activeClock].filled < x.clocks[x.activeClock].segments - 1); return { id: f.id, at: f.clocks[f.activeClock].filled + 1 }; });
  await plant(page, [{ id: 'seed_test_clock', effect: 'The test clock event happens.', trigger: { type: 'clock', value: `${fac.id}:${fac.at}` } }]);
  await sendText(page, 'I look around');
  assert.equal(await page.evaluate(() => Game.State.seed('seed_test_clock').fired), false);
  await page.evaluate(id => { Game.World.forceClockRoll(1); Game.World.forceClockRoll(6, id); }, fac.id);
  await onePhase(page);
  assert.equal(await page.evaluate(() => Game.State.seed('seed_test_clock').fired), true, 'fired when the clock reached it');
  // /wait passes its phase before it narrates, so the event is told in that same turn (or, if two others were due, the next).
  let told = line(await lastPacket(page), 'DUE EVENT').includes('The test clock event happens.');
  for (let i = 0; i < 2 && !told; i++) {
    await sendText(page, 'I look around');
    told = line(await lastPacket(page), 'DUE EVENT').includes('The test clock event happens.');
  }
  assert.ok(told, 'and narrated');
});

// Changed by design (REVIEW 2.2, docs/notes/transport.md): the chronicle waits for 16 log entries and keeps the newest 6.
s.test('once the log holds 16 entries a chronicle entry exists and the log is trimmed to the newest 6; STORY SO FAR is trimmed to 150 words; a failing chronicle never breaks a turn', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 10 });
  await fast(page);
  for (let i = 1; i <= 14; i++) await sendText(page, i % 3 ? 'I look around' : '/wait ' + (await nextPhase(page)));
  assert.equal(await page.evaluate(() => Game.state.chronicle.length), 0, 'nothing before 16 entries');
  assert.equal(await page.evaluate(() => Game.state.log.length), 15);
  await page.evaluate(() => Game.Api.Mock.clear());
  await sendText(page, 'I look around');
  const r = await page.evaluate(() => ({ turn: Game.state.meta.turn, chron: Game.state.chronicle, log: Game.state.log.map(e => e.turn), calls: Game.Api.Mock.calls.map(c => c.method) }));
  assert.equal(r.turn, 15);
  assert.equal(r.chron.length, 1);
  assert.equal(r.chron[0].fromTurn, 0);
  assert.equal(r.chron[0].toTurn, 9);
  assert.match(r.chron[0].summary, /^Turns 0 to 9/);
  assert.ok(r.chron[0].summary.split(/\s+/).length < 80, 'under 80 words');
  assert.deepEqual(r.log, [10, 11, 12, 13, 14, 15], 'the oldest 10 entries left the log; the newest 6 stay');
  assert.deepEqual(r.calls.filter(c => c === 'chronicle'), ['chronicle']);
  await sendText(page, 'I look around');
  assert.equal(line(await lastPacket(page), 'STORY SO FAR'), r.chron[0].summary);
  // Long history: the most recent 150 words, most recent last.
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) Game.State.apply({ chronicleEntry: { fromTurn: 1000 + i, toTurn: 1000 + i, summary: Array.from({ length: 60 }, (_, k) => `w${i}x${k}`).join(' ') } });
  });
  await sendText(page, 'I look around');
  const story = line(await lastPacket(page), 'STORY SO FAR').split(/\s+/);
  assert.equal(story.length, 150);
  assert.equal(story[story.length - 1], 'w4x59', 'most recent last');
  // A reload rebuilds the feed with the chronicle at the top.
  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.ok((await page.locator('#feed .f-chronicle').first().innerText()).startsWith('Turns 0 to 9'));

  // The chronicle call failing (an error, then a refusal) never breaks a turn; it is retried next turn.
  const p2 = await h.open({ viewport: LAPTOP });
  await quickStart(p2, { seed: 11 });
  await fast(p2);
  await p2.evaluate(() => Game.Api.Mock.queue('chronicle', { error: { type: 'api_error', message: 'chronicle down' } }, { refusal: true }));
  for (let i = 1; i <= 16; i++) {
    await sendText(p2, 'I look around');
    assert.equal(await p2.evaluate(() => Game.state.meta.turn), i, 'turn ' + i + ' went through');
  }
  const f = await p2.evaluate(() => ({ chron: Game.state.chronicle.length, log: Game.state.log.length, dbg: Game.State.debugLog.filter(x => x.kind === 'chronicle').map(x => x.reason), errors: [...document.querySelectorAll('#feed .f-notice.error')].length }));
  assert.equal(f.chron, 0);
  assert.equal(f.log, 17);
  assert.deepEqual(f.dbg.length, 2);
  assert.match(f.dbg[0], /chronicle down/);
  assert.equal(f.errors, 0, 'no error in the feed');
  await sendText(p2, 'I look around');
  const g = await p2.evaluate(() => ({ chron: Game.state.chronicle.map(c => [c.fromTurn, c.toTurn]), log: Game.state.log.map(e => e.turn) }));
  assert.deepEqual(g.chron, [[0, 11]]);
  assert.deepEqual(g.log, [12, 13, 14, 15, 16, 17]);
});

s.test('news spreads: an off-screen completion becomes a rumour that its source, a faction-mate or a gossip offers first', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 8 });
  await fast(page);
  // Complete one clock off-screen (others held still).
  const fac = await page.evaluate(() => Game.state.factions.find(f => f.clocks[0].onComplete.effects.some(e => e.op === 'addRumour')).id);
  await page.evaluate(id => { Game.World.forceClockRoll(1); Game.World.forceClockRoll(6, id); }, fac);
  for (let i = 0; i < 6; i++) await onePhase(page);
  await page.evaluate(() => Game.World.forceClockRoll(null));
  const news = await page.evaluate(id => {
    const fx = Game.data.TOWN_DATA.factions.find(f => f.id === id).clocks[0].onComplete.effects.find(e => e.op === 'addRumour').rumour;
    const r = Game.State.rumour(fx.id);
    return { id: r.id, text: r.text, source: r.sourceNpcId, addedTurn: r.addedTurn, heard: r.heard, factionId: r.factionId };
  }, fac);
  assert.ok(Number.isInteger(news.addedTurn) && !news.heard, 'a fresh rumour from the completion');
  assert.equal(news.factionId, fac, 'tagged with the faction whose clock it was');
  // Whoever would know it offers it ahead of their own older rumours.
  const teller = await page.evaluate(n => {
    const G = Game;
    const src = n.source ? G.State.npc(n.source) : null;
    const gossip = x => (x.tags || []).some(t => ['informant', 'bartender', 'innkeeper'].includes(t));
    const ok = x => x.status === 'free' && x.attitude > -25 && !/\b(look|rest|wait|go|walk|try|my|insult|buy)\b/i.test(x.name);
    const fac = n.factionId;
    const knows = x => x === src || (x.factionId && ((src && x.factionId === src.factionId) || x.factionId === fac)) || gossip(x);
    // Someone other than the source if possible: the news has to travel.
    const cands = G.state.npcs.filter(x => ok(x) && knows(x)).sort((a, b) => (a === src) - (b === src));
    for (const x of cands) {
      for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
        const l = G.state.locations.find(l2 => !l2.closed && G.State.npcsAt(l2.id, ph).some(y => y.id === x.id));
        if (l) return { id: x.id, name: x.name, loc: l.id, phase: ph };
      }
    }
    return null;
  }, news);
  assert.ok(teller, 'someone who would know it');
  await place(page, teller.loc, teller.phase);
  await page.evaluate(() => Game.Api.Mock.clear());
  await sendText(page, `I talk to ${teller.name}`);
  const rumour = line(await lastPacket(page), 'RUMOUR');
  assert.ok(rumour.includes(news.text), 'the news is offered: ' + rumour);
  assert.equal(await page.evaluate(id => Game.State.rumour(id).heard, news.id), true, 'heard once told');
  if (teller.id !== news.source) assert.equal(await page.evaluate(id => Game.State.rumour(id).heardFrom, news.id), teller.id, 'the teller is recorded');
  // People cards open on tap; the notes are inside.
  await page.evaluate(id => { Game.UI.openPanel('people'); Game.UI.togglePerson(id, true); }, teller.id);
  const card = await page.innerText(`#panel-body [data-npc="${teller.id}"]`);
  assert.ok(card.includes(`Told you: ${news.text}`), 'People lists it under whoever told it');
  await sendText(page, `I talk to ${teller.name}`);
  assert.ok(!line(await lastPacket(page), 'RUMOUR').includes(news.text), 'not offered twice');
});

s.test('the narrator packet never carries secrets, goals, clock labels, rumour truth or unfired seeds, and keeps to the SPEC section 13 limits', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 2718, kinds: ['debt', 'secret', 'promise'] });
  await fast(page);
  const check = async what => assert.deepEqual(await page.evaluate(packetProblems), [], what);
  const sc = await findScene(page, { min: 1, rumour: true, minAtt: -25 });
  await place(page, sc.loc.id, sc.phase);
  // A memory far back in time with weight 1 never reaches the narrator.
  await page.evaluate(id => {
    Game.State.apply({ newMemories: [{ npcId: id, text: 'An old trivial thing about the player', weight: 1 }] });
    Game.state.meta.turn += 25;
  }, sc.npcs[0].id);
  const steps = [`I talk to ${sc.npcs[0].name}`, 'I look around', '/look', '/rest', '/look', 'I look around', '/rest', '/look', `/wait ${await nextPhase(page)}`, '/rest', '/look', 'I look around'];
  for (const text of steps) {
    await sendText(page, text);
    await check(text);
  }
  assert.ok(!(await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate').map(c => c.text).join('\n'))).includes('An old trivial thing about the player'), 'old weight-1 memory left out');
  // Some due events reached the narrator along the way, all of them fired seeds.
  assert.ok(await page.evaluate(() => Game.state.seeds.some(sd => sd.fired)), 'seeds fired during the run');
  // People at a destination are listed without their memories.
  const dest = await page.evaluate(() => {
    const G = Game;
    const here = G.State.loc(G.state.player.locationId);
    const l = here.exits.map(id => G.State.loc(id)).find(x => !x.closed && !/morning|afternoon|evening|night/i.test(x.name));
    if (!G.State.npcsAt(l.id).length) {
      const hereIds = G.State.npcsAt(here.id).map(x => x.id);
      const m = G.state.npcs.find(x => x.status === 'free' && x.alive !== false && !hereIds.includes(x.id));
      G.State.apply({ effects: [{ op: 'npcMove', npcId: m.id, locationId: l.id, phases: [G.state.time.phase] }] });
    }
    const n = G.State.npcsAt(l.id)[0];
    G.State.apply({ newMemories: [{ npcId: n.id, text: 'Destination memory that should stay home', weight: 3 }] });
    return { name: l.name, npc: n.name };
  });
  await sendText(page, `I walk to ${dest.name}`);
  const d = line(await lastPacket(page), 'DESTINATION');
  assert.ok(d.includes(dest.npc + ' ('), 'destination lists who is there');
  assert.ok(!d.includes('Destination memory that should stay home'), 'without their memories');
  await check('move');
});

s.test('the debug view shows clocks, seeds, secrets, flags, rumour truth and token totals; nothing else in the UI shows hidden state', async h => {
  for (const viewport of [LAPTOP, PHONE]) {
    const page = await h.open({ viewport });
    await quickStart(page, { seed: 123 });
    await fast(page);
    const sc = await findScene(page, { min: 1, minAtt: -25 });
    await place(page, sc.loc.id, sc.phase);
    await sendText(page, `I talk to ${sc.npcs[0].name}`);
    await sendText(page, 'I look around');
    for (let i = 0; i < 3; i++) await sendText(page, '/rest');
    await sendText(page, '/look');
    const hidden = await page.evaluate(() => {
      const st = Game.state;
      return [].concat(
        st.npcs.map(n => n.secret), st.npcs.map(n => n.goal), st.factions.map(f => f.goal),
        st.factions.flatMap(f => f.clocks.map(c => c.label)),
        st.factions.flatMap(f => f.clocks.filter((c, i) => f.activeClock < 0 || i >= f.activeClock).map(c => c.onComplete.text)),
        st.seeds.filter(sd => !sd.fired).map(sd => sd.effect)
      ).filter(x => typeof x === 'string' && x.length > 20);
    });
    let ui = await page.innerText('#feed') + '\n' + await page.innerText('.topbar');
    for (const tab of ['character', 'people', 'journal', 'places']) {
      await page.evaluate(t => Game.UI.openPanel(t), tab);
      ui += '\n' + await page.innerText('#panel-body');
    }
    for (const x of hidden) assert.ok(!ui.includes(x), 'hidden state outside debug: ' + x.slice(0, 60));
    assert.doesNotMatch(ui, /\b(TRUE|FALSE)\b/);
    if (viewport === PHONE) await page.evaluate(() => Game.UI.closeSheet());
    await sendText(page, '/debug');
    const dbg = await page.innerText('#panel-body');
    const st = await page.evaluate(() => Game.state);
    for (const f of st.factions) {
      if (f.activeClock < 0) continue;
      const c = f.clocks[f.activeClock];
      assert.ok(dbg.includes(`${c.filled}/${c.segments} "${c.label}"`), 'clock ' + f.id);
      if (f.clocks[f.activeClock + 1]) assert.ok(dbg.includes(`next clock: "${f.clocks[f.activeClock + 1].label}"`), 'next clock ' + f.id);
    }
    for (const sd of st.seeds) assert.ok(dbg.includes(`${sd.id} @ ${sd.trigger.type} ${sd.trigger.value}`) && dbg.includes(sd.effect), 'seed ' + sd.id);
    if (st.seeds.some(sd => sd.fired)) assert.match(dbg, /\[(fired|due)\] seed_/);
    assert.match(dbg, /\[waiting\] seed_/);
    for (const n of st.npcs) if (n.secret) assert.ok(dbg.includes(n.secret), 'secret of ' + n.id);
    assert.match(dbg, /\[(heard|unheard)\] (TRUE |FALSE) rum_/);
    assert.ok(dbg.includes(`flags ${JSON.stringify(st.flags)}`), 'flags');
    assert.match(dbg, /turn: \d+ calls/);
    assert.match(dbg, /session: \d+ calls/);
    const heads = await page.evaluate(() => [...document.querySelectorAll('#panel-body h3')].map(e => e.textContent));
    for (const head of ['Meta', 'Faction clocks', 'Due events', 'Seeds', 'World events', 'NPCs (hidden)', 'Rumours', 'Threads', 'Chronicle', 'Rejected changes', 'API errors', 'Last raw responses']) assert.ok(heads.includes(head), head);
    if (viewport === PHONE) {
      assert.equal(await page.evaluate(() => document.getElementById('game-body').classList.contains('sheet-open')), true, 'debug opens in the sheet');
      assert.deepEqual(await overflowReport(page, PHONE.width), [], 'no horizontal overflow');
      await page.evaluate(() => Game.UI.closeSheet());
    }
    await sendText(page, '/debug');
    const after = await page.innerText('#panel-body');
    for (const n of st.npcs) if (n.secret && n.secret.length > 20) assert.ok(!after.includes(n.secret), 'gone with the debug view');
  }
});

s.test('weather is rolled each morning from the season table, never the same twice running, and reaches the narrator', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 314 });
  await fast(page);
  const { season, list } = await page.evaluate(() => ({ season: Game.state.flags.season, list: Game.data.TABLES.weather[Game.state.flags.season] }));
  let prev = await page.evaluate(() => Game.state.flags.weather);
  assert.ok(list.includes(prev), `${season} weather at the start`);
  await onePhase(page);
  assert.equal(await page.evaluate(() => Game.state.flags.weather), prev, 'the weather holds during the day');
  for (let i = 0; i < 4; i++) {
    await sendText(page, '/rest');
    const w = await page.evaluate(() => Game.state.flags.weather);
    assert.notEqual(w, prev, 'a new morning, new weather');
    assert.ok(list.includes(w), 'from the season table');
    assert.equal(line(await lastPacket(page), 'WEATHER'), w, 'in the narrator packet');
    prev = w;
  }
});

s.test('a 30-turn scripted run: clocks move and one completes with a visible change by day 8-10, insults plant a grudge, a loose end fires on its day, the chronicle starts at turn 15 (16 log entries)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 31337, kinds: ['debt', 'enemy', 'secret'] });
  await fast(page);
  const plan = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const le = st.player.looseEnds.find(x => x.kind === 'debt');
    const touched = new Set(st.factions.flatMap(f => f.clocks.flatMap(c => c.onComplete.effects.filter(e => e.op === 'npcStatus' || e.op === 'npcMove').map(e => e.npcId))));
    const loose = new Set(st.player.looseEnds.map(x => x.npcId));
    // A faction whose clocks never touch the lender, with a clock that visibly changes the town.
    const visible = ['closeLocation', 'npcStatus', 'npcMove', 'openThread'];
    const fac = st.factions.find(f => !f.clocks.some(c => c.onComplete.effects.some(e => e.npcId === le.npcId)) && f.clocks.some(c => c.onComplete.effects.some(e => visible.includes(e.op))));
    // Someone to insult in this phase: not a loose end, not moved by any clock.
    const risky = /\b(look|examine|rest|sleep|wait|go|walk|head|run|enter|attack|hit|fight|insult|mock|buy|try|my)\b/i;
    let target = null;
    for (const l of st.locations) {
      if (l.closed) continue;
      const here = G.State.npcsAt(l.id);
      const n = here.find(x => !touched.has(x.id) && !loose.has(x.id) && x.attitude > -15 && x.attitude <= 20 && !risky.test(x.name) && here.every(m => m === x || !G.Town.mentions(x.name.toLowerCase(), m)));
      if (n) { target = { id: n.id, name: n.name, loc: l.id }; break; }
    }
    return { debt: { seedId: le.seedId, day: G.State.seed(le.seedId).trigger.value, npcId: le.npcId }, fac: fac && fac.id, target };
  });
  assert.ok(plan.fac && plan.target, JSON.stringify(plan));
  // Force the dice for one faction (5: still a fill); the others never fill, so nothing else moves the town.
  await page.evaluate(id => { Game.World.forceClockRoll(1); Game.World.forceClockRoll(5, id); }, plan.fac);
  const seen = { firedDay: null, chronicleAt10: null, grudgeAfterInsults: false, completed: [], progress: [] };
  let before = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state)));
  const turn = async text => {
    await sendText(page, text);
    assert.deepEqual(await page.evaluate(packetProblems), [], `packet after "${text}"`);
    const r = await page.evaluate(([fid, debtSeed, tid]) => {
      const G = Game;
      const st = G.state;
      const f = G.State.faction(fid);
      return {
        turn: st.meta.turn, day: st.time.day,
        clock: [f.activeClock, f.activeClock >= 0 ? f.clocks[f.activeClock].filled : 6],
        fired: G.State.seed(debtSeed).fired,
        chronicle: st.chronicle.length, log: st.log.length,
        openGrudges: st.seeds.filter(sd => !sd.fired && sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === tid).length
      };
    }, [plan.fac, plan.debt.seedId, plan.target.id]);
    assert.ok(r.openGrudges <= 1, 'never two unfired grudges');
    if (r.fired && seen.firedDay === null) seen.firedDay = r.day;
    if (r.turn === 15) seen.chronicleAt10 = { chronicle: r.chronicle, log: r.log };
    const prev = seen.progress.length ? seen.progress[seen.progress.length - 1] : [0, 0];
    seen.progress.push(r.clock);
    if (r.clock[0] !== prev[0]) {
      // A clock completed this turn: check its effects against the state before the turn.
      const effects = await page.evaluate(([fid, i]) => Game.State.faction(fid).clocks[i].onComplete.effects, [plan.fac, prev[0]]);
      assert.deepEqual(await page.evaluate(checkEffects, { effects, before }), [], `clock ${prev[0] + 1} effects`);
      seen.completed.push({ idx: prev[0], day: r.day, effects: effects.map(e => e.op) });
    }
    before = await page.evaluate(() => JSON.parse(JSON.stringify(Game.state)));
    return r;
  };
  const exit = await page.evaluate(() => { const here = Game.State.loc(Game.state.player.locationId); const l = here.exits.map(id => Game.State.loc(id)).find(x => !x.closed && !/morning|afternoon|evening|night/i.test(x.name)); return l.name; });
  await turn('I look around');
  await turn(`I walk to ${exit}`);
  await turn('/look');
  // Find the target where they are this phase and insult them until they hate the player.
  const where = await page.evaluate(id => Game.World.whereIs(id), plan.target.id);
  await place(page, where || plan.target.loc);
  let att = 0;
  for (let i = 0; i < 6; i++) {
    await turn(`I insult ${plan.target.name}`);
    att = await page.evaluate(id => Game.State.npc(id).attitude, plan.target.id);
    if (att <= -60) break;
  }
  assert.ok(att <= -60, 'attitude reached -60: ' + att);
  await turn(`/wait ${await nextPhase(page)}`);
  seen.grudgeAfterInsults = (await feelings(page, plan.target.id, 'grudge')).length === 1;
  // Days pass: rest until day 9, filling in with ordinary turns, 30 turns in all.
  let n = await page.evaluate(() => Game.state.meta.turn);
  let k = 0;
  while (n < 30) {
    const t = await time(page);
    const r = t.day < 9 && k % 2 === 0 ? await turn('/rest') : await turn(['I look around', '/look', `/wait ${await nextPhase(page)}`][k % 3]);
    n = r.turn;
    k++;
  }
  const end = await time(page);
  assert.equal(n, 30, '30 turns');
  assert.ok(end.day >= 8 && end.day <= 10, 'day 8-10 at the end: ' + end.day);
  assert.ok(seen.progress.some(c => c[1] > 0), 'the clock advanced');
  assert.ok(seen.completed.length >= 1, 'at least one clock completed');
  assert.ok(seen.completed.some(c => c.effects.some(op => ['closeLocation', 'npcStatus', 'npcMove', 'openThread'].includes(op)) && c.day <= 10), 'a visible change by day 10: ' + JSON.stringify(seen.completed));
  assert.equal(seen.grudgeAfterInsults, true, 'a grudge seed after repeated insults');
  assert.equal(seen.firedDay, plan.debt.day, 'the debt fired on its day');
  assert.deepEqual(seen.chronicleAt10, { chronicle: 1, log: 6 }, 'a chronicle entry at turn 15, the newest 6 kept');
  assert.ok(await page.evaluate(() => Game.state.chronicle.length >= 2), 'and again by turn 30');
  assert.ok(await page.evaluate(() => Game.World.recent.length > 0), 'world events for the debug view');
});

s.run();
