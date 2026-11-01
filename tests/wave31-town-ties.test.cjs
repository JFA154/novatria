'use strict';
/* Wave 31 (1 Nov 2026): the town is a graph (docs/RELATIONSHIPS_PLAN.md,
   wave B1; the integration plan's 11.3, 13.2 and 16 B1). People have ties
   to each other (state.ties: both sides of every relation, the town's own
   ties, fellows of a faction), and what the player does to someone reaches
   the people tied to them, one hop: those who saw it at once, the rest as
   hearsay by the kind of tie (a spouse and the household overnight, family
   and work by the next morning, friends, lovers and rivals when they meet
   or in two days), with a rival warming and the police and clergy never
   warming over a crime; an arrest turns the family against the officer;
   rules version 10 makes the ties for an older game and spreads nothing
   that already happened. Mock mode. Run with: node tests/run.cjs wave31 */
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave31-town-ties');

/* __put(locId, ids, day?, phase?): the player somewhere with only these people this phase (everyone else there is sent to Front Street).
   __tick(n): n phases pass, each ticked (Pipeline.passTime, as a /wait does). */
const setup = page => page.evaluate(() => {
  window.__put = (locId, ids, day, phase) => {
    const S = Game.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'morning' } });
    S.apply({ playerLocationId: locId });
    const others = S.npcsAt(locId).map(n => n.id).filter(id => !ids.includes(id));
    S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })).concat(others.map(id => ({ npcId: id, locationId: 'loc_front_street' }))) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__tick = n => { for (let i = 0; i < n; i++) Game.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait'); return Game.state.time; };
  window.__hit = async (id, times) => {
    const G = Game;
    for (let i = 0; i < (times || 1); i++) {
      G.Api.Mock.queue('parse', { actionType: 'attack', summary: 'Hits them', targets: [id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('I hit ' + G.State.npc(id).name);
    }
  };
  Game.Api.Mock.delay = 0;
});

s.test('ties from both sides of every relation, overridden or added by hand', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, st = G.state, T = G.data.TOWN_DATA;
    const ties = st.ties;
    const here = id => { const n = S.npc(id); return n && n.alive !== false && n.status === 'free' && (n.presence === undefined || n.presence === 'here'); };
    const missing = [];
    for (const n of T.npcs) for (const rel of n.relations || []) {
      if (!here(n.id) || !here(rel.npcId)) continue;
      for (const k of [`${n.id}>${rel.npcId}`, `${rel.npcId}>${n.id}`]) if (!ties[k]) missing.push(k);
    }
    const pick = k => (ties[k] ? { kind: ties[k].kind, w: ties[k].w, t: ties[k].t, hidden: ties[k].hidden, known: ties[k].known, revealedBy: ties[k].revealedBy || null } : null);
    const before = JSON.stringify(ties['npc_mavis>npc_dewayne']);
    ties['npc_mavis>npc_dewayne'].log.push({ turn: 0, day: 1, w: -5, t: 0, why: 'a test' });
    const refill = S.apply({ tiesFill: true });
    return {
      missing,
      count: Object.keys(ties).length,
      people: new Set(Object.keys(ties).flatMap(k => k.split('>'))).size,
      away: Object.keys(ties).filter(k => k.split('>').some(id => !here(id))),
      mavis: pick('npc_mavis>npc_dewayne'), dewayne: pick('npc_dewayne>npc_mavis'), kaylee: pick('npc_royce>npc_kaylee'), father: pick('npc_kaylee>npc_royce'),
      boss: pick('npc_tyler>npc_mavis'), employee: pick('npc_mavis>npc_tyler'), aunt: pick('npc_lorna>npc_colt'), uncle: pick('npc_colt>npc_wade'), inlaw: pick('npc_lamar>npc_virgil'),
      lover: pick('npc_loretta>npc_royce'), enemy: pick('npc_tammy>npc_colt'), fellow: pick('npc_hollis>npc_colt'), rival: pick('npc_ray>npc_wade'), tenant: pick('npc_nikki>npc_hollis'),
      cousins: pick('npc_tyler>npc_brianna'),
      kept: refill.tiesFill, after: ties['npc_mavis>npc_dewayne'].log.length, was: before,
      debug: R.debugTie('npc_loretta>npc_royce', ties['npc_loretta>npc_royce'], { s: st }),
      dbg: [...document.querySelectorAll('#panel-body h3')].length
    };
  });
  assert.deepEqual(r.missing, [], 'every relation between people in town is a tie both ways');
  assert.deepEqual(r.away, [], 'only people in town take part');
  assert.ok(r.count >= 110 && r.count <= 130, 'about 120 ties: ' + r.count);
  assert.equal(r.people, 40, 'everyone in town with someone to be tied to (Leon Varner has nobody here)');
  // By hand: the overrides keep the relation's kind.
  assert.deepEqual([r.mavis.kind, r.mavis.w, r.mavis.t], ['spouse', 30, 20]);
  assert.deepEqual([r.dewayne.kind, r.dewayne.w, r.dewayne.t], ['spouse', 50, 60]);
  // Defaults by kind (what B is to A): parent to child 70/30, child to parent 50/40, employee to boss 20/10, boss to employee 20/20.
  assert.deepEqual([r.kaylee.kind, r.kaylee.w, r.kaylee.t], ['child', 70, 30]);
  assert.deepEqual([r.father.kind, r.father.w, r.father.t], ['parent', 50, 40]);
  assert.deepEqual([r.boss.kind, r.boss.w, r.boss.t], ['boss', 20, 10]);
  assert.deepEqual([r.employee.kind, r.employee.w, r.employee.t], ['employee', 20, 20]);
  assert.deepEqual([r.aunt.kind, r.aunt.w, r.aunt.t], ['nephew', 70, 30], 'Colt is Lorna\'s nephew; her numbers by hand');
  assert.deepEqual([r.uncle.kind, r.uncle.w, r.uncle.t], ['aunt', 30, 20], 'Wade is Colt\'s uncle');
  assert.deepEqual([r.inlaw.kind, r.inlaw.w, r.inlaw.t], ['inlaw', 20, 10]);
  assert.deepEqual([r.tenant.kind, r.tenant.w, r.tenant.t], ['landlord', 5, 0]);
  assert.deepEqual([r.cousins.kind, r.cousins.w, r.cousins.t], ['cousin', 60, 50]);
  // Added by hand: the hidden ones say what reveals them, and the town does not know them.
  assert.deepEqual([r.lover.kind, r.lover.w, r.lover.t, r.lover.hidden, r.lover.known], ['lover', 80, 70, true, false]);
  assert.deepEqual(r.lover.revealedBy, { rumours: ['rum_royce_photos', 'rum_royce_revote'] });
  assert.deepEqual([r.enemy.kind, r.enemy.w, r.enemy.hidden], ['enemy', -90, true]);
  assert.deepEqual([r.rival.kind, r.rival.w, r.rival.t, r.rival.hidden], ['enemy', -30, -40, false]);
  // Fellows of a faction, where nothing else ties them.
  assert.deepEqual([r.fellow.kind, r.fellow.w, r.fellow.t], ['fellow', 10, 10]);
  // Never overwriting: a second fill adds nothing and leaves a changed tie as it is.
  assert.equal(r.kept.added, 0);
  assert.equal(r.after, 1, 'the tie kept its log');
  assert.match(r.debug, /^npc_loretta>npc_royce lover w 80 t 70 \(hidden\)$/);
});

s.test('Mavis hears overnight; Marcus\'s department by the next morning; a friend at the next meeting or in two days', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    // Dewayne, alone in his bay on Day 3, morning: Mavis (wife, one house) hears that night.
    __put('loc_pittmans', ['npc_dewayne'], 3, 'morning');
    const m0 = R.tracksOf(S.npc('npc_mavis'));
    await __hit('npc_dewayne');
    out.queued = st.hearsay.filter(x => x.npcId === 'npc_mavis').map(x => ({ npcId: x.npcId, via: x.via, dueDay: x.dueDay, duePhase: x.duePhase, factor: x.factor }));
    out.debug = st.hearsay.map(R.debugHearsay);
    __tick(2);
    out.evening = { phase: st.time.phase, w: R.tracksOf(S.npc('npc_mavis')).w - m0.w };
    __tick(1);
    const mv = S.npc('npc_mavis');
    out.night = { phase: st.time.phase, w: R.tracksOf(mv).w - m0.w, t: R.tracksOf(mv).t - m0.t, f: R.tracksOf(mv).f - m0.f, mem: mv.memories.filter(m => m.secondhand).map(m => [m.text, m.weight, m.secondhand.via]) };
    // Marcus catches a lie on Day 5, morning, at Town Hall: his department hears by the next morning, into everyday (design example 5).
    __put('loc_town_hall', ['npc_marcus'], 5, 'morning');
    const dep = ['npc_glenda', 'npc_nikki', 'npc_travis'];
    const t0 = Object.fromEntries(dep.map(id => [id, R.tracksOf(S.npc(id)).t]));
    S.apply({ socialEvents: [{ npcId: 'npc_marcus', event: 'lied_caught', text: 'no state surveyor by that name' }] });
    out.dept = st.hearsay.filter(x => x.aboutId === 'npc_marcus').map(x => [x.npcId, x.via, x.dueDay, x.duePhase]);
    __tick(3);
    out.deptNight = dep.map(id => R.tracksOf(S.npc(id)).t - t0[id]);
    __tick(1);
    out.deptMorning = dep.map(id => R.tracksOf(S.npc(id)).t - t0[id]);
    out.deptMems = dep.map(id => S.npc(id).memories.filter(m => m.secondhand).length);
    out.deptEveryday = dep.map(id => S.npc(id).rel.everyday.t);
    // A friend (Trent, Colt's): Colt hit alone at the landing on Day 7, morning; Trent hears when he and Colt share a place, else in two days.
    __put('loc_purvis_landing', ['npc_colt'], 7, 'morning');
    const tr0 = R.tracksOf(S.npc('npc_trent')).w;
    await __hit('npc_colt');
    const entry = st.hearsay.find(x => x.npcId === 'npc_trent' && x.aboutId === 'npc_colt');
    out.friend = { via: entry.via, dueDay: entry.dueDay, duePhase: entry.duePhase };
    // They meet that afternoon at Riverbend (visits): it reaches him then.
    S.apply({ visits: [{ npcId: 'npc_trent', locationId: 'loc_riverbend', day: 7, phase: 'afternoon' }, { npcId: 'npc_colt', locationId: 'loc_riverbend', day: 7, phase: 'afternoon' }] });
    __tick(1);
    out.met = { phase: st.time.phase, heard: Number.isInteger(entry.deliveredTurn), w: R.tracksOf(S.npc('npc_trent')).w - tr0 };
    // Someone who never meets them hears in two days: Brianna (her hidden tie to Colt), kept away from him.
    const b = st.hearsay.find(x => x.npcId === 'npc_brianna' && x.aboutId === 'npc_colt');
    out.brianna = b ? { via: b.via, dueDay: b.dueDay } : null;
    const apart = () => S.apply({ visits: ['morning', 'afternoon', 'evening', 'night'].flatMap(ph => [8, 9].map(day => ({ npcId: 'npc_brianna', locationId: 'loc_motor_court', day, phase: ph }))) });
    apart();
    __tick(3);
    out.day8 = { day: st.time.day, phase: st.time.phase, heard: b ? Number.isInteger(b.deliveredTurn) : null };
    __tick(4);
    out.day9 = { day: st.time.day, phase: st.time.phase, heard: b ? Number.isInteger(b.deliveredTurn) : null };
    return out;
  });
  assert.deepEqual(r.queued, [{ npcId: 'npc_mavis', via: 'overnight', dueDay: 3, duePhase: 'night', factor: 0.29 }], JSON.stringify(r.queued));
  assert.ok(r.debug.includes('npc_mavis hears hit from npc_dewayne overnight x0.29 · due day 3 night'), JSON.stringify(r.debug));
  assert.ok(r.debug.includes('npc_royce hears hit from npc_dewayne by morning x0.11 · due day 4 morning'), 'his boss, away, by the next morning');
  assert.equal(r.evening.phase, 'evening');
  assert.equal(r.evening.w, 0, 'not by the evening');
  assert.equal(r.night.phase, 'night');
  // The hit's -25, -12, 20 at 0.29 (spouse 0.6 x (0.5 + 0.5 x 30/100) x heard 0.75): liking -7, trust -4, fear +3, a secondhand memory a weight lighter.
  assert.deepEqual([r.night.w, r.night.t, r.night.f], [-7, -4, 3]);
  assert.deepEqual(r.night.mem, [['heard Tester hit Dewayne Mangum at Pittman\'s Gas and Service', 2, 'npc_dewayne']]);
  assert.deepEqual(r.dept.map(x => x[0]).filter(id => id !== 'npc_wade').sort(), ['npc_glenda', 'npc_nikki', 'npc_travis'], 'his department (and Wade Purvis, who would rather see him fooled)');
  assert.ok(r.dept.filter(x => x[0] !== 'npc_wade').every(x => x[1] === 'morning' && x[2] === 6 && x[3] === 'morning'), JSON.stringify(r.dept));
  assert.deepEqual(r.deptNight, [0, 0, 0], 'nothing in the night');
  assert.deepEqual(r.deptMorning, [-4, -3, -3], 'Glenda T -4, Nikki T -3, Travis T -3 (design example 5)');
  assert.deepEqual(r.deptMems, [0, 0, 0], 'into everyday: no memories');
  assert.deepEqual(r.deptEveryday, [-4, -3, -3]);
  assert.deepEqual(r.friend, { via: 'meet', dueDay: 9, duePhase: 'morning' });
  assert.equal(r.met.phase, 'afternoon');
  assert.equal(r.met.heard, true, 'heard when they shared a place');
  assert.ok(r.met.w < 0, 'Trent cools: ' + r.met.w);
  assert.deepEqual(r.brianna, { via: 'meet', dueDay: 9 });
  assert.deepEqual([r.day8.day, r.day8.heard], [8, false], 'not yet on Day 8');
  assert.deepEqual([r.day9.day, r.day9.phase, r.day9.heard], [9, 'morning', true], 'within two days');
});

s.test('the motel and the trailer park are not households', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const n = id => S.npc(id);
    const hh = (a, b) => R.household(n(a), n(b));
    // The motel: two people living there, made family for the check.
    const brother = Object.assign({}, n('npc_lyman'), { relations: [{ npcId: 'npc_curtis', relation: 'brother' }] });
    const out = {
      mangums: hh('npc_mavis', 'npc_dewayne'), pittmans: hh('npc_royce', 'npc_kaylee'), lotts: hh('npc_tammy', 'npc_austin'),
      // Tyler and Brianna, cousins, both at Riverbend Trailer Park.
      cousins: hh('npc_tyler', 'npc_brianna'), homes: [n('npc_tyler').home.locationId, n('npc_brianna').home.locationId],
      motel: R.household(brother, n('npc_curtis')), motelHomes: [n('npc_lyman').home.locationId, n('npc_curtis').home.locationId],
      // Under one roof but not family: Loretta and Jodie at the Low Water.
      work: hh('npc_loretta', 'npc_jodie'),
      // The rumour pool's wider rule is its own (it counts the shared roof).
      types: [st.locations.find(l => l.id === 'loc_riverbend').type, st.locations.find(l => l.id === 'loc_motor_court').type]
    };
    // What it does: Tyler hit at the desk, Brianna hears by morning (other family), not overnight; Austin hit at home, Tammy overnight.
    __put('loc_motor_court', ['npc_tyler'], 2, 'night');
    await __hit('npc_tyler');
    __put('loc_lott_trailer', ['npc_austin'], 3, 'morning');
    await __hit('npc_austin');
    out.via = st.hearsay.filter(x => ['npc_brianna', 'npc_tammy'].includes(x.npcId)).map(x => [x.npcId, x.via, x.dueDay, x.duePhase]);
    return out;
  });
  assert.equal(r.mangums, true);
  assert.equal(r.pittmans, true);
  assert.equal(r.lotts, true, 'a trailer of their own is a home');
  assert.deepEqual(r.types, ['trailerpark', 'motel']);
  assert.deepEqual(r.homes, ['loc_riverbend', 'loc_riverbend']);
  assert.equal(r.cousins, false, 'cousins at the trailer park are not a household');
  assert.deepEqual(r.motelHomes, ['loc_motor_court', 'loc_motor_court']);
  assert.equal(r.motel, false, 'brothers at the motel are not a household');
  assert.equal(r.work, false, 'a roof without family is not a household');
  assert.deepEqual(r.via, [['npc_brianna', 'morning', 3, 'morning'], ['npc_tammy', 'overnight', 3, 'night']], JSON.stringify(r.via));
});

s.test('police and clergy never warm when a man they dislike is beaten', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    out.likes = ['npc_ray', 'npc_marcus', 'npc_boyd'].map(id => R.tieNow(st.ties[`${id}>npc_wade`]).w);
    out.roles = { ray: R.tieFactor(S.npc('npc_ray'), S.npc('npc_wade'), 'beat_down'), marcus: R.tieFactor(S.npc('npc_marcus'), S.npc('npc_wade'), 'hit'), boyd: R.tieFactor(S.npc('npc_boyd'), S.npc('npc_wade'), 'hit') };
    out.roles = Object.fromEntries(Object.entries(out.roles).map(([k, v]) => [k, v ? v.factor : null]));
    // A theft from Wade: the chief never warms either; the pastor may (clergy hold back over violence only).
    out.theft = { marcus: R.tieFactor(S.npc('npc_marcus'), S.npc('npc_wade'), 'stole_from'), ray: R.tieFactor(S.npc('npc_ray'), S.npc('npc_wade'), 'stole_from') };
    out.theft = Object.fromEntries(Object.entries(out.theft).map(([k, v]) => [k, v ? v.factor : null]));
    // Wade beaten at the landing with nobody else there: Boyd warms, the chief and the pastor take nothing.
    __put('loc_purvis_landing', ['npc_wade'], 4, 'morning');
    await __hit('npc_wade', 3);
    const q = id => st.hearsay.filter(x => x.npcId === id && x.aboutId === 'npc_wade');
    out.ray = q('npc_ray').length;
    out.marcus = q('npc_marcus').length;
    out.boyd = q('npc_boyd').map(x => x.d.w);
    out.lorna = q('npc_lorna').map(x => x.d.w);
    // Defending him is no crime: the chief cools for it (a rival takes it the other way).
    const kind = R.propagate(st, 'npc_wade', { event: 'defended', present: [], player: 'Tester' }, { w: 15, t: 10, f: 0 });
    out.defended = kind.later.filter(x => x.npcId === 'npc_marcus' || x.npcId === 'npc_ray').map(x => [x.npcId, x.d.w]);
    return out;
  });
  assert.deepEqual(r.likes, [-30, -40, -90], 'all three dislike him');
  assert.deepEqual(r.roles, { ray: null, marcus: null, boyd: -0.45 }, 'a rival warms; the police and clergy do not');
  assert.equal(r.theft.marcus, null, 'the police never warm over a theft');
  assert.equal(r.theft.ray, -0.15, 'clergy hold back over violence only');
  assert.equal(r.ray, 0, 'the pastor takes nothing from the beating');
  assert.equal(r.marcus, 0, 'the chief takes nothing from the beating');
  // (The beat-down after two hits adds almost nothing of its own: it travels to name the copy, at 0.)
  assert.ok(r.boyd.length && r.boyd.every(w => w >= 0) && r.boyd.reduce((a, w) => a + w, 0) > 0, 'Boyd warms: ' + JSON.stringify(r.boyd));
  assert.ok(r.lorna.length && r.lorna.every(w => w <= 0) && r.lorna.reduce((a, w) => a + w, 0) < 0, 'his wife cools: ' + JSON.stringify(r.lorna));
  assert.deepEqual(r.defended.map(x => x[0]).sort(), ['npc_marcus', 'npc_ray']);
  assert.ok(r.defended.every(x => x[1] < 0), 'defending a man they dislike cools them: ' + JSON.stringify(r.defended));
});

s.test('the arrest turns the family against the officer', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    // Two turns played: the arrests come in the second, which /rewind takes back below.
    await G.Pipeline.submit('I look out at the river.');
    const keep = st.meta.turn;
    await G.Pipeline.submit('I look out at the river again.');
    const w0 = { wade: R.tieNow(st.ties['npc_wade>npc_marcus']), lorna: st.ties['npc_lorna>npc_marcus'] ? R.tieNow(st.ties['npc_lorna>npc_marcus']) : { w: 0, t: 0 } };
    // The chief's clock (no officer named: the police head).
    const a = S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_colt', status: 'arrested' }] });
    out.line = a.applied.join(' | ');
    out.wade = st.ties['npc_wade>npc_marcus'].log.map(e => [e.w, e.t, e.why, e.turn === st.meta.turn]);
    out.lorna = st.ties['npc_lorna>npc_marcus'] ? st.ties['npc_lorna>npc_marcus'].log.map(e => [e.w, e.t, e.why]) : null;
    out.now = { wade: R.tieNow(st.ties['npc_wade>npc_marcus']), was: w0.wade, lorna: R.tieNow(st.ties['npc_lorna>npc_marcus']) };
    out.trent = st.ties['npc_trent>npc_marcus'] ? st.ties['npc_trent>npc_marcus'].log.length : 0;
    // Nikki's (by): Trent's father and grandfather turn against her.
    S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_trent', status: 'arrested', by: 'npc_nikki' }] });
    out.nikki = ['npc_lamar', 'npc_virgil'].map(id => st.ties[`${id}>npc_nikki`] ? st.ties[`${id}>npc_nikki`].log.map(e => [e.w, e.t]) : null);
    out.notKin = Object.keys(st.ties).filter(k => k.endsWith('>npc_nikki') && st.ties[k].log.length).sort();
    // Someone arrested again (already in the cells) moves nobody.
    S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_trent', status: 'arrested', by: 'npc_nikki' }] });
    out.again = st.ties['npc_lamar>npc_nikki'].log.length;
    // /rewind strikes what a later turn logged.
    S.apply({ rewind: { turn: keep } });
    out.rewound = ['npc_wade>npc_marcus', 'npc_lamar>npc_nikki'].map(k => (st.ties[k] ? st.ties[k].log.length : 0));
    out.rewoundW = R.tieNow(st.ties['npc_wade>npc_marcus']);
    return out;
  });
  assert.match(r.line, /npc_colt is arrested; npc_wade, npc_lorna turn against npc_marcus/);
  assert.deepEqual(r.wade, [[-20, -20, 'Marcus Bell arrested Colt Purvis', true]]);
  assert.deepEqual(r.lorna, [[-20, -20, 'Marcus Bell arrested Colt Purvis']], 'a tie the relations lacked is made for it');
  assert.deepEqual([r.now.wade.w - r.now.was.w, r.now.wade.t - r.now.was.t], [-20, -20]);
  assert.equal(r.trent, 0, 'a friend is not family');
  assert.deepEqual(r.nikki, [[[-20, -20]], [[-20, -20]]]);
  assert.deepEqual(r.notKin, ['npc_lamar>npc_nikki', 'npc_virgil>npc_nikki']);
  assert.equal(r.again, 1, 'an arrest of someone already arrested moves nobody');
  assert.deepEqual(r.rewound, [0, 0], '/rewind strikes the log lines of the turns it takes back');
  assert.deepEqual(r.rewoundW, r.now.was);
});

s.test('one line overnight', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    out.lines = [
      R.hearsayLine(['Lorna Purvis', 'Colt Purvis', 'Wade Purvis'], ['about the landing']),
      R.hearsayLine(['Mavis Mangum'], ['about Pittman\'s']),
      R.hearsayLine(['Wade Purvis', 'Tammy Lott', 'Austin Lott'], ['about the landing', 'about the landing']),
      R.hearsayLine(['Wade Purvis', 'Tammy Lott', 'Austin Lott', 'Lorna Purvis'], ['about the landing']),
      R.hearsayLine(['Wade Purvis'], ['about the landing'], 2),
      R.hearsayLine([], ['about the landing'])
    ];
    out.short = ['loc_pittmans', 'loc_purvis_landing', 'loc_low_water', 'loc_motor_court'].map(id => R.placeShort(st.locations.find(l => l.id === id)));
    // Colt beaten at the landing in the evening, alone: by morning his uncle and aunt (family, by morning), Trent if they met, more by the next day.
    S.apply({ npcKnownToPlayer: ['npc_wade', 'npc_lorna', 'npc_colt', 'npc_trent', 'npc_tammy', 'npc_dewayne', 'npc_mavis'] });
    __put('loc_purvis_landing', ['npc_colt'], 5, 'evening');
    await __hit('npc_colt', 3);
    // Dewayne too, the same evening at Pittman's: Mavis hears in the night, and the morning tells it with the rest.
    __put('loc_pittmans', ['npc_dewayne'], null);
    await __hit('npc_dewayne');
    const n0 = document.querySelectorAll('#feed .f-quiet').length;
    await G.Pipeline.submit('/rest');
    out.feed = [...document.querySelectorAll('#feed .f-quiet')].slice(n0).map(x => x.textContent);
    out.time = [st.time.day, st.time.phase];
    out.heard = st.hearsay.filter(x => Number.isInteger(x.deliveredTurn)).map(x => x.npcId);
    return out;
  });
  assert.deepEqual(r.lines, [
    'Word got round: Lorna, Colt and Wade Purvis have heard about the landing.',
    'Word got round: Mavis Mangum has heard about Pittman\'s.',
    'Word got round: Wade Purvis, Tammy Lott and Austin Lott have heard about the landing.',
    'Word got round: Wade Purvis, Tammy Lott, Austin Lott and others have heard about the landing.',
    'Word got round: Wade Purvis and others have heard about the landing.',
    ''
  ]);
  assert.deepEqual(r.short, ['Pittman\'s', 'the landing', 'the bar', 'the motel']);
  assert.deepEqual(r.time, [6, 'morning']);
  assert.ok(r.heard.includes('npc_mavis') && r.heard.includes('npc_wade') && r.heard.includes('npc_lorna'), JSON.stringify(r.heard));
  const word = r.feed.filter(t => /^Word got round:/.test(t));
  assert.equal(word.length, 1, 'one line for the night: ' + JSON.stringify(r.feed));
  // In the order it was done (the fight made the news, so his friend Trent hears by the morning too); Mavis heard in the night, told with the
  // morning's, the fourth name: "and others"; one family name said once only when everyone named shares it.
  assert.equal(word[0], 'Word got round: Wade Purvis, Lorna Purvis, Trent Haskins and others have heard about the landing and about Pittman\'s.');
});

s.test('rules version 10 spreads nothing old', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  // An older game: no ties and nothing on its way, with a fight and a hit on record from before the update.
  await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    __put('loc_pittmans', ['npc_dewayne'], 2, 'morning');
    await __hit('npc_dewayne');
    st.ties = {};
    st.hearsay = [];
    st.meta.rulesVersion = 9;
  });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const before = JSON.stringify(st.npcs.map(n => [n.id, n.attitude, R.tracksOf(n), (n.memories || []).length]));
    const nothing = { arrest: S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_jolene', status: 'arrested' }] }).applied.join(' | ') };
    nothing.hit = st.hearsay.length;
    const r1 = await G.Pipeline.updateGame();
    const after = JSON.stringify(st.npcs.map(n => [n.id, n.attitude, R.tracksOf(n), (n.memories || []).length]));
    const ties = Object.keys(st.ties).length;
    const people = new Set(Object.keys(st.ties).flatMap(k => k.split('>'))).size;
    const feed = (r1.summaries || []).filter(x => x.version === 10).map(x => x.text);
    const v = st.meta.rulesVersion;
    // The rerun: nothing more, nothing overwritten.
    st.ties['npc_mavis>npc_dewayne'].log.push({ turn: st.meta.turn, day: st.time.day, w: -9, t: -9, why: 'a test' });
    const r2 = await G.Upgrade.townTalks(st);
    __tick(8);
    return { same: before === after, ties, people, hearsay: st.hearsay.length, feed, v, rerun: r2.text, log: st.ties['npc_mavis>npc_dewayne'].log.length, nothing, ok: !!r1, migrations: G.Upgrade.MIGRATIONS.map(m => m.version), title: G.Upgrade.MIGRATIONS.find(m => m.version === 10).title, mavis: S.npc('npc_mavis').memories.filter(m => m.secondhand).length };
  });
  assert.deepEqual(r.migrations, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(r.title, 'A town that talks');
  assert.equal(r.nothing.hit, 0, 'before the update nothing travels');
  assert.doesNotMatch(r.nothing.arrest, /turn against/, 'and an arrest moves no tie');
  assert.equal(r.v, 10);
  assert.equal(r.same, true, 'nobody\'s feelings moved: nothing that already happened is spread');
  assert.equal(r.hearsay, 0, 'nothing on its way');
  assert.ok(r.ties >= 110, 'the ties made: ' + r.ties);
  assert.deepEqual(r.feed, [`People now feel for each other: ${r.ties} ties between ${r.people} people. What you do from now on reaches the people close to them.`]);
  assert.equal(r.rerun, 'People already feel for each other.');
  assert.equal(r.log, 1, 'a rerun overwrites nothing');
  assert.equal(r.mavis, 0, 'Mavis never hears of the old hit, however long the days run');
});

/* The README's row and the version note follow the engine. */
s.test('the README and the rules version say ten', async () => {
  const fs = require('fs');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  assert.match(readme, /\| 10 \(1 Nov 2026\) \| A town that talks \|/);
  assert.match(readme, /10 now/);
  void execFileSync;
});

s.run();
