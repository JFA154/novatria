'use strict';
/* Wave 3 engine fixes (docs/notes/*.md, "Wave 3"): the second code
   review's ten bugs, its six risks and dead code; the coordinator's recap
   and command items; the second playtest's engine, content and demo items
   (N1 to N16 less the UI's N3 and N15, D1 to D5 and the "also" list, the
   README rows marked code, the design notes). Mock mode throughout. Run
   with: node tests/run.cjs wave3 */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { suite, quickStart, findScene, place, ROOT, GAME_PATH } = require('./helpers.cjs');

const s = suite('wave3-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const quiets = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(e => e.textContent));
const lastPacket = page => page.evaluate(() => (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
const line = (packet, label) => (new RegExp(`^${label}: .*$`, 'm').exec(packet) || [''])[0];
/* A game with this background (by id), seed and loose ends ([kind, option]). */
async function start(page, o) {
  await page.evaluate(o => {
    const D = Game.data;
    const bg = D.BACKGROUNDS.find(b => b.id === o.bg) || D.BACKGROUNDS[0];
    Game.App.quickStart({
      name: o.name || 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
      looseEnds: (o.les || []).map(([k, i]) => ({ kind: k, text: D.LOOSE_ENDS[k].options[i] }))
    }, { seed: o.seed });
  }, o);
  await page.waitForSelector('#screen-game.active');
  await fast(page);
}

// ----- review bug 1 (playtest N1): a purchase is not a payment -----

s.test('bug 1 / N1: money spent buying from a creditor (alone, or aimed at them) pays nothing and does not raise the cap; money handed to them does', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.alive !== false && x.status === 'free' && (x.tags || []).includes('lender')) || st.npcs.find(x => x.status === 'free');
    S.apply({ effects: [{ op: 'playerGold', delta: 2000 }, { op: 'addObligation', kind: 'debt', npcId: n.id, text: 'Pay {npc} the six hundred you owe.', amount: 600, dueOffset: 3 }] });
    const o = S.obligations('open').find(x => x.npcId === n.id);
    const M = (extra) => Object.assign({ source: 'model', present: [n.id] }, extra);
    const out = {};
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -3, itemsGained: [{ name: 'Cold drink' }] }, M({ targets: [n.id], actionType: 'buy' }));
    out.drink = o.paid | 0;
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -4 }, M({ targets: [], actionType: 'buy' }));
    out.alone = o.paid | 0;
    S.apply({ beginTurn: true });
    const g0 = st.player.gold;
    S.apply({ goldDelta: -600, itemsGained: ['Used shotgun'] }, M({ targets: [n.id], actionType: 'other' }));
    out.capped = [g0 - st.player.gold, o.paid | 0];
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -100 }, M({ targets: [n.id], actionType: 'give' }));
    out.gave = o.paid | 0;
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -500, obligationsSettled: [o.id] }, M({ targets: [n.id], actionType: 'give' }));
    out.done = [o.status, o.paid];
    return out;
  });
  assert.equal(r.drink, 0, 'a cold drink bought from the creditor is the price of a drink');
  assert.equal(r.alone, 0, 'a buy with the creditor alone pays nothing');
  assert.deepEqual(r.capped, [500, 0], 'a purchase keeps the usual $500 cap and pays nothing');
  assert.equal(r.gave, 100, 'money handed over is a payment');
  assert.deepEqual(r.done, ['met', 600]);
});

// ----- review bug 2: someone who comes for the player at the end of a walk that crosses a phase -----

s.test('bug 2: a due event told at the end of a walk that crosses into the next phase brings its person there for that phase, and they are still there after the walk', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const le = st.player.looseEnds[0];
    const npc = S.npc(le.npcId);
    while (st.time.phase !== 'morning') S.apply({ advanceTime: 'long' });
    S.apply({ advanceTime: 'short' }); S.apply({ advanceTime: 'short' });
    const here = st.player.locationId;
    const next = 'afternoon';
    const dest = st.locations.find(l => l.id !== here && l.discovered && !l.closed && l.away !== true && !S.isClosed(l) && !S.isBanned(l.id)
      && S.npcsAt(l.id).every(n => n.id !== npc.id) && S.npcsAt(l.id, next).every(n => n.id !== npc.id) && S.loc(here).exits.includes(l.id));
    S.apply({ dueAdd: [{ seedId: le.seedId, text: `${npc.name} walks up to you and says the money is due.`, npcId: npc.id, bring: true }] });
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: dest.id, needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I walk over to ' + dest.name);
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { phase: st.time.phase, at: st.player.locationId, dest: dest.id, destLine: (/^DESTINATION: .*$/m.exec(pk) || [''])[0], name: npc.name, there: S.npcsAt(st.player.locationId).some(n => n.id === npc.id) };
  });
  assert.equal(r.phase, 'afternoon', 'the walk crossed into the afternoon');
  assert.equal(r.at, r.dest);
  assert.ok(r.destLine.includes(r.name), 'DESTINATION names them among those there: ' + r.destLine.slice(-200));
  assert.equal(r.there, true, 'and they are still there once the walk is over');
});

// ----- review bug 3: paid late is remembered as late -----

s.test('bug 3: a debt missed and then paid in full is met late, and the creditor remembers it late, not "in full and on time"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, W = G.World, st = G.state;
    const le = st.player.looseEnds[0];
    S.apply({ effects: S.seed(le.seedId).effects }, { source: 'world' });
    const o = S.obligations('open')[0];
    S.apply({ effects: [{ op: 'playerGold', delta: 2000 }] });
    while (st.time.day <= o.dueDay) { S.apply({ advanceTime: 'rest' }); W.tick({ to: { day: st.time.day, phase: st.time.phase } }); }
    const missed = o.status;
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -o.amount }, { source: 'model', present: [o.npcId], targets: [o.npcId], actionType: 'give' });
    return { missed, status: o.status, late: o.late, mem: S.npc(o.npcId).memories.map(m => m.text) };
  });
  assert.equal(r.missed, 'missed');
  assert.deepEqual([r.status, r.late], ['met', true]);
  assert.ok(!r.mem.some(t => /on time/.test(t)), 'never "on time": ' + r.mem.join(' | '));
  assert.ok(r.mem.some(t => /in full, but late/.test(t)), r.mem.join(' | '));
});

// ----- review bug 4: invented names at a sentence start; brands -----

s.test('bug 4: an invented name at a sentence start with a speech or gesture verb after it is a hard problem; two unknown words mid-sentence (a brand, a singer) are soft', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.Style;
    const names = t => S.check(t, { packet: '', style: 'casual' }).problems.filter(p => p.type === 'name').map(p => (p.hard ? 'HARD ' : 'soft ') + p.names.join(','));
    const hard = ['Darnell says the bridge is out.', 'Royce shrugs. Darnell laughs at that.', 'You turn. Bobby waves you over.', 'She says Darnell owes her money.', 'Earl Hux leans on the counter.', 'Royce works for Tri-State Gas now.'];
    const soft = ['He dips Red Seal.', 'The radio plays Conway Twitty.', 'The jukebox plays Merle Haggard.', 'He watches Wheel of Fortune.', 'Royce says the Feds came through last spring.'];
    return { hard: hard.map(t => [t, names(t)]), soft: soft.map(t => [t, names(t)]), ok: names('Royce nods. "Okay," he says.') };
  });
  for (const [t, p] of r.hard) assert.ok(p.length && p.every(x => /^HARD /.test(x)), t + ' -> ' + p);
  for (const [t, p] of r.soft) assert.ok(p.length && p.every(x => /^soft /.test(x)), t + ' -> ' + p);
  assert.deepEqual(r.ok, []);
});

// ----- review bug 5: ordinary things that end in a weapon word -----

s.test('bug 5: a grease gun, a staple gun, a water pistol, peanut shells, ink cartridges and a gravy boat are ordinary; a shotgun and shotgun shells still are not', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const T = Game.Town;
    const ok = [['new:a grease gun', 'gas'], ['new:a staple gun', 'pawn'], ['new:a nail gun', 'mill'], ['new:a caulk gun', 'gas'], ['new:a water pistol', 'bar'], ['new:a bowl of peanut shells', 'bar'],
      ['new:taco shells', 'gas'], ['new:ink cartridges', 'office'], ['new:a gravy boat', 'bar'], ['new:a hand truck', 'trailer']];
    const no = [['new:a shotgun', 'gas'], ['new:a box of shotgun shells', 'bar'], ['new:a pistol', 'church']];
    return { ok: ok.map(([d, t]) => [d, T.plausible(d, t).plausible]), no: no.map(([d, t]) => [d, T.plausible(d, t).plausible]) };
  });
  for (const [d, v] of r.ok) assert.equal(v, true, d);
  for (const [d, v] of r.no) assert.equal(v, false, d);
});

// ----- review bug 6: beaten senseless in front of the police -----

s.test('bug 6: beaten senseless in a fight in front of the police, TIME THIS TAKES never promises a night in the cell', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    let found = null;
    for (let i = 0; i < 8 && !found; i++) {
      for (const l of st.locations) {
        if (l.closed || S.isClosed(l) || l.away) continue;
        const here = S.npcsAt(l.id);
        const cop = here.find(n => (n.tags || []).includes('police'));
        const other = here.find(n => !(n.tags || []).includes('police'));
        if (cop && other) { found = { l, other }; break; }
      }
      if (!found) S.apply({ advanceTime: 'long' });
    }
    S.apply({ playerLocationId: found.l.id });
    while (st.player.hp > 1) S.apply({ effects: [{ op: 'playerHp', delta: -Math.min(3, st.player.hp - 1) }] });
    M.queue('parse', { actionType: 'attack', summary: 'Swings at them', targets: [found.other.id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'failure';
    await G.Pipeline.submit('I punch ' + found.other.name);
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { time: (/^TIME THIS TAKES: .*$/m.exec(pk) || [''])[0], defeat: /^DEFEAT: /m.test(pk), arrest: /^ARREST: /m.test(pk) };
  });
  assert.equal(r.defeat, true);
  assert.equal(r.arrest, false);
  assert.ok(!/cell/.test(r.time), r.time);
  assert.match(r.time, /engine decides what comes after/);
});

// ----- review bug 7 (playtest N2): bans end before their day -----

// Changed by design in wave 10: nobody is accused at cards without a marked deck any more; caught with one is three days, today counted.
s.test('bug 7 / N2: a ban ends before its untilDay (back on day N); caught cheating at cards is three days with today, and the narrator hears the same', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
    const day = st.time.day;
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 1 }] });
    const one = [!!S.isBanned(l.id, day), !!S.isBanned(l.id, day + 1)];
    st.bans = [];
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 3 }] });
    const three = [day, day + 1, day + 2, day + 3].map(d => !!S.isBanned(l.id, d));
    st.bans = [];
    // Caught cheating at the card game (a marked deck on the player, a fumble).
    S.apply({ itemsGained: [{ id: 'item_marked_deck', name: 'Marked deck', qty: 1, notes: 'Pricked on the backs.' }] });
    for (const ph of ['evening', 'night', 'afternoon', 'morning']) {
      let d = st.time.day; while (S.isClosed(l, d)) d++;
      S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
      if (G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id))) break;
    }
    M.queue('parse', { actionType: 'gamble', summary: 'Sits in at cards', targets: [], needsRoll: true, stat: 'wits', timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'fumble';
    G.Pipeline.hooks.cardsPlay = { hold: 'all' };
    const day0 = st.time.day;
    await G.Pipeline.submit('I sit in at cards for $20');
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const ban = st.bans.find(b => b.locationId === l.id);
    return { one, three, caughtUntil: ban ? ban.untilDay - day0 : null, days: [0, 1, 2, 3].map(k => !!S.isBanned(l.id, day0 + k)), outcome: (/^OUTCOME: .*$/m.exec(pk) || [''])[0], day0 };
  });
  assert.deepEqual(r.one, [true, false], 'one day: today only');
  assert.deepEqual(r.three, [true, true, true, false], 'three days: today and the two after; back on day + 3');
  assert.equal(r.caughtUntil, 3);
  assert.deepEqual(r.days, [true, true, true, false], 'caught: today and the two after');
  assert.match(r.outcome, new RegExp(`not welcome back for three days \\(today counted: back on Day ${r.day0 + 3}\\)`));
});

// ----- review bug 8 (playtest N10), coordinator item 1: the recap's reasons -----

s.test('bug 8 / N10 and coordinator 1: a recap reason agrees in number ("you are", "you have", "you were", "he thinks"), keeps a name\'s capital, and fits its side (no insult under Warm)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const p = st.player.name;
    const free = st.npcs.filter(n => n.alive !== false && n.status === 'free' && G.presenceOf(n) === 'here' && n.pronouns === 'he').slice(0, 5);
    const [a, b, c, d, e] = free;
    S.apply({ npcKnownToPlayer: free.map(n => n.id) }, { present: free.map(n => n.id) });
    const third = st.npcs.find(n => n.alive !== false && n.status === 'free' && !free.includes(n));
    S.apply({ newMemories: [
      { npcId: a.id, text: `${p} is good for the money, I think`, weight: 2 },
      { npcId: b.id, text: `${p} has a mean streak`, weight: 2 },
      { npcId: c.id, text: `thinks ${p} was cheating at cards`, weight: 2 },
      { npcId: d.id, text: `${third.name} told me what ${p} is hiding.`, weight: 2 },
      { npcId: e.id, text: `${p} insulted me in front of everybody`, weight: 2 }
    ] });
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: a.id, delta: 40 - a.attitude }, { op: 'attitudeDelta', npcId: b.id, delta: -40 - b.attitude }, { op: 'attitudeDelta', npcId: c.id, delta: -40 - c.attitude },
      { op: 'attitudeDelta', npcId: d.id, delta: -40 - d.attitude }, { op: 'attitudeDelta', npcId: e.id, delta: 40 - e.attitude }] });
    return { text: G.Pipeline.recapText(), a: a.name, b: b.name, c: c.name, d: d.name, e: e.name, third: third.name };
  });
  assert.ok(r.text.includes(`${r.a} (warm, remembers you are good for the money, he thinks)`), r.text);
  assert.match(r.text, new RegExp(`${r.b} \\(cold, remembers you have a mean streak\\)`));
  assert.match(r.text, new RegExp(`${r.c} \\(cold, remembers he thinks you were cheating at cards\\)`));
  assert.ok(r.text.includes(`remembers ${r.third} told him what you are hiding`), r.text);
  assert.ok(new RegExp(`${r.e} \\(warm\\)`).test(r.text), 'an insult is never the reason under Warm: ' + r.text);
  assert.ok(!/\byou (is|has|was)\b|\bhe think\b/.test(r.text), r.text);
});

// ----- review bug 9: numbers saved as text -----

s.test('bug 9: a save whose turn, quantities, prices, ban days and condition days are text loads as numbers (the turn counts up, a quantity adds up)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State;
    const copy = JSON.parse(JSON.stringify(G.state));
    copy.meta.turn = String(copy.meta.turn);
    copy.player.inventory.push({ id: 'item_shotgun_shells', name: 'Shotgun shells', qty: '2', price: '12', notes: '' });
    copy.bans = [{ locationId: copy.locations[0].id, untilDay: String(copy.time.day + 2) }];
    copy.player.conditions = [{ id: 'cond_x', name: 'Sore', effect: '-1 might', untilDay: String(copy.time.day + 1) }];
    const bad = JSON.parse(JSON.stringify(copy));
    bad.player.inventory[bad.player.inventory.length - 1].qty = 'two';
    const refused = S.validateShape(bad, G.town);
    S.load(copy, JSON.parse(JSON.stringify(G.town)));
    const st = G.state;
    const shells = st.player.inventory.find(i => i.id === 'item_shotgun_shells');
    const types = [typeof st.meta.turn, typeof shells.qty, typeof shells.price, typeof st.bans[0].untilDay, typeof st.player.conditions[0].untilDay];
    const t0 = st.meta.turn;
    S.apply({ itemsGained: [{ id: 'item_shotgun_shells', name: 'Shotgun shells', qty: 1 }] });
    S.apply({ beginTurn: true });
    return { refused, types, qty: shells.qty, turn: st.meta.turn - t0, banned: !!S.isBanned(st.bans[0].locationId) };
  });
  assert.match(String(r.refused), /qty is not a number/);
  assert.deepEqual(r.types, ['number', 'number', 'number', 'number', 'number']);
  assert.equal(r.qty, 3);
  assert.equal(r.turn, 1);
  assert.equal(r.banned, true);
});

// ----- review bug 10: a possessive names a place -----

s.test('bug 10: Town.matchExisting reads a possessive as the place ("Pittman\'s", "Hollis\'s pawn shop", "Dewayne\'s house", "Loretta\'s bar"), never its owner; a walk there goes there', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, T = G.Town;
    // Data-driven: a business named for its owner's family, a person with a home of their own, the bar's owner.
    const business = st.locations.find(l => /^[A-Z][a-z]+'s /.test(l.name) && l.away !== true && l.discovered);
    const poss = /^([A-Z][a-z]+'s)/.exec(business.name)[1];
    const homeOwner = st.npcs.find(n => n.alive !== false && n.home && S.loc(n.home.locationId) && ['house', 'trailer'].includes(S.loc(n.home.locationId).type) && st.npcs.filter(m => m.name.split(' ')[0] === n.name.split(' ')[0]).length === 1);
    const first = homeOwner.name.split(' ')[0];
    const bar = st.locations.find(l => l.type === 'bar');
    const owner = st.npcs.find(n => /\bowner\b/.test(n.role || '') && (n.role || '').toLowerCase().includes(bar.name.toLowerCase().replace(/^the /, '')));
    const m = d => { const x = T.matchExisting(d, { locationId: st.player.locationId }); return x ? `${x.kind}:${x.id}` : null; };
    const out = {
      business: [m(`new:${poss}`), business.id], house: [m(`new:${first}'s house`), homeOwner.home.locationId],
      bar: owner ? [m(`new:${owner.name.split(' ')[0]}'s bar`), bar.id] : null, truck: m(`new:${first}'s truck`)
    };
    // A walk the parser left as new:<possessive> goes to the place.
    const from = st.locations.find(l => l.discovered && l.away !== true && l.id !== business.id && !S.isClosed(l));
    S.apply({ playerLocationId: from.id });
    G.Api.Mock.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [`new:${poss}`], destinationId: null, needsRoll: false, timeCost: 'short' });
    G.Api.Mock.queue('bookkeep', {});
    await G.Pipeline.submit(`I walk over to ${poss}`);
    out.walk = [st.player.locationId, business.id, S.isClosed(business)];
    return out;
  });
  assert.equal(r.business[0], `location:${r.business[1]}`);
  assert.equal(r.house[0], `location:${r.house[1]}`);
  if (r.bar) assert.equal(r.bar[0], `location:${r.bar[1]}`);
  assert.ok(!r.truck || !/^location/.test(r.truck), 'a person\'s truck is not a place');
  if (!r.walk[2]) assert.equal(r.walk[0], r.walk[1], 'the walk goes to the place');
});

// ----- risks -----

s.test('risk: a bookkeeper retry still lands after a later turn failed (a restored state is a new object); one that comes back after a later turn is noted in the debug log', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock, S = G.State;
    // Turn 1: the bookkeeper fails; its retry waits.
    let release;
    const gate = new Promise(res => { release = res; });
    const orig = M.bookkeep;
    let n = 0;
    M.bookkeep = async function (packet) {
      n += 1;
      if (n === 1) throw Object.assign(new G.Api.ApiError('network', 'down'), { type: 'network' });
      if (n === 2) { await gate; return { result: { journalEntry: 'Late but recorded.' }, usage: {}, model: 'mock' }; }
      return orig.call(M, packet);
    };
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit('I look around');
    const turn = G.state.meta.turn;
    // A later turn that fails outright (the parser): the state is restored from the snapshot.
    M.queue('parse', { error: { type: 'network', message: 'down' } });
    await G.Pipeline.submit('I look around again');
    release();
    await new Promise(res => setTimeout(res, 300));
    await G.Pipeline.whenIdle();
    const entry = G.state.log.find(e => e.turn === turn);
    M.bookkeep = orig;
    return { changes: entry.changes || null, journal: G.state.journal.some(j => /Late but recorded/.test(j.text || j)), same: G.state.meta.turn === turn };
  });
  assert.equal(r.same, true, 'the failed turn left no entry');
  assert.equal(r.changes, null, 'the retry recorded the turn though the state object changed');
  assert.equal(r.journal, true);
});

s.test('risk: due events are sorted (a town event here first) before the three-a-turn cap, so a scene behind three waiting events is told now', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State;
    const st = G.state;
    const ids = ['a', 'b', 'c', 'd'].map(x => `seed_t_due_${x}`);
    S.apply({ effects: ids.map(id => ({ op: 'plantSeed', seed: { id, effect: `Something about ${id}.`, trigger: { type: 'day', value: st.time.day + 9 } } })) });
    S.apply({ dueAdd: ids.slice(0, 3).map((id, i) => ({ seedId: id, text: `Waiting thing ${i + 1}.` })).concat([{ seedId: ids[3], text: 'The meeting starts here.', scene: true }]) });
    return { told: G.World.dueSeeds({}).map(d => d.seedId), scene: ids[3] };
  });
  assert.equal(r.told.length, 3);
  assert.equal(r.told[0], r.scene, 'the scene is told first, not a turn late');
});

s.test('risk: merging a made-up person into a cast member moves their obligations, bans, the fight, gifts, seeds\' effects and relations, so the save still loads', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    st.meta.castFixed = false;
    const into = st.npcs.find(n => n.alive !== false && n.status === 'free' && G.presenceOf(n) === 'here');
    S.apply({ peopleRevealed: [{ name: 'Earl Madeup', pronouns: 'he', relationToNpcId: '', who: 'drives the propane truck' }] }, { source: 'engine' });
    const from = st.npcs.find(n => n.name === 'Earl Madeup');
    const l = st.locations.find(x => x.away !== true && x.id !== st.player.locationId);
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: from.id, text: 'Pay {npc} back.', amount: 50, dueOffset: 2, onMet: [{ op: 'attitudeDelta', npcId: from.id, delta: 5 }] }, { op: 'banFrom', locationId: l.id, days: 2, byNpcId: from.id }] });
    S.apply({ giftGiven: from.id, fight: { npcId: from.id, hits: 1, day: st.time.day, phase: st.time.phase, locationId: st.player.locationId, turn: st.meta.turn } });
    S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_t_merge', effect: 'Something happens.', trigger: { type: 'day', value: st.time.day + 3 }, effects: [{ op: 'attitudeDelta', npcId: from.id, delta: 3 }] } }] });
    into.relations = (into.relations || []).concat([{ npcId: from.id, relation: 'friend' }]);
    const res = S.apply({ mergePeople: [{ fromId: from.id, intoId: into.id }] });
    const json = JSON.stringify(st);
    const o = st.player.obligations.find(x => x.kind === 'debt');
    return { rejected: res.rejected, left: json.includes(`"${from.id}"`), owner: o.npcId, onMet: o.onMet[0].npcId, ban: st.bans[0].byNpcId, fight: st.fight.npcId, gifts: st.meta.gifts.ids, seed: S.seed('seed_t_merge').effects[0].npcId, into: into.id, shape: S.validateShape(JSON.parse(json), G.town) };
  });
  assert.deepEqual(r.rejected, []);
  assert.equal(r.left, false, 'nothing names the made-up person any more');
  for (const k of ['owner', 'onMet', 'ban', 'fight', 'seed']) assert.equal(r[k], r.into, k);
  assert.deepEqual(r.gifts, [r.into]);
  assert.deepEqual(r.shape, [], 'the save still loads');
});

s.test('risk (and N11): the recap says the story has ended only once the ending has been told (its news seen), not when it fired or when its narration failed', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    S.apply({ effects: [{ op: 'setFlag', key: 'epilogueShown', value: true }, { op: 'addNews', text: 'The ending, told in full.', public: true, epilogue: true }] });
    const fired = G.Pipeline.recapText().includes('The story has reached an ending');
    S.apply({ newsSeen: 'ending' });
    const told = G.Pipeline.recapText().includes('The story has reached an ending');
    return { fired, told };
  });
  assert.equal(r.fired, false, 'fired but untold: no ending line yet');
  assert.equal(r.told, true);
});

s.test('risk (and the playtest\'s design note): a gift counts only once it was handed over; words in Say mode that hand over money are a gift too; money toward a debt is a payment, not a gift', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const sc = await findScene(page, { min: 1, watchy: false, notTypes: ['police', 'watch'] });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(async id => {
    const G = Game, M = G.Api.Mock, S = G.State, st = G.state;
    const gifts = () => (st.meta.gifts && st.meta.gifts.day === st.time.day ? st.meta.gifts.ids.filter(x => x === id).length : 0);
    const att = () => S.npc(id).attitude;
    const out = {};
    // A give of a thing the player does not carry: refused, so no gift is recorded.
    M.queue('parse', { actionType: 'give', summary: 'Gives them a gold watch', targets: [id], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 5 }], itemsLost: ['Gold watch'] });
    await G.Pipeline.submit('I give them my gold watch');
    out.failed = gifts();
    // Say mode: five dollars handed over is a gift; a second the same day earns nothing.
    G.UI.setMode('say'); G.UI.setAddressee(id);
    const a0 = att();
    M.queue('parse', { actionType: 'talk', summary: 'Offers five dollars', targets: [id], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 5 }], goldDelta: -5 });
    await G.Pipeline.submit('Here, take five dollars.');
    out.say = [gifts(), att() - a0];
    const a1 = att();
    M.queue('parse', { actionType: 'talk', summary: 'Offers five more', targets: [id], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { attitudeChanges: [{ npcId: id, delta: 5 }], goldDelta: -5 });
    await G.Pipeline.submit('And five more.');
    out.second = att() - a1;
    G.UI.setMode('do');
    // A debt to them: money toward it is no gift (not counted, not throttled).
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: id, text: 'Pay {npc} back.', amount: 100, dueOffset: 3 }] });
    const g0 = gifts();
    M.queue('parse', { actionType: 'give', summary: 'Pays them $40', targets: [id], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { goldDelta: -40 });
    await G.Pipeline.submit('I give them $40 toward what I owe');
    out.payment = [gifts() - g0, S.obligations('open').find(o => o.npcId === id).paid];
    return out;
  }, sc.npcs[0].id);
  assert.equal(r.failed, 0, 'a give that did not happen is no gift');
  assert.deepEqual(r.say, [1, 5], 'Say mode: a gift, counted once it is handed over');
  assert.equal(r.second, 0, 'the second gift that day earns nothing');
  assert.deepEqual(r.payment, [0, 40], 'a payment toward the debt is not a gift');
});

s.test('risk: a lock key never holds ";" (the separator of meta.lastRollKey), so a new: target with one locks only itself', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, D = G.Dice, S = G.State;
    const k = D.lockKey({ actionType: 'search', stat: 'wits', targets: ['new:a crate; a barrel'] });
    S.apply({ lastRollKey: D.lockFor({ tier: 'failure' }, k) });
    return { k, set: G.state.meta.lastRollKey, locked: D.isLocked(k), other: D.isLocked(D.lockKey({ actionType: 'search', stat: 'wits', targets: ['new:a barrel'] })) };
  });
  assert.ok(!r.k.includes(';'), r.k);
  assert.equal(r.set.split(';').length, 1);
  assert.equal(r.locked, true);
  assert.equal(r.other, false);
});

s.test('dead code: Dice.lock and roll.complicationWitness are gone; the card game rolls no complication at all (complication: null)', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const D = Game.Dice;
    const roll = D.resolve({ stat: 'wits', difficulty: 'normal', actionType: 'gamble', modifiers: [], d20: 4, complication: null });
    const plain = D.resolve({ stat: 'wits', difficulty: 'normal', actionType: 'persuade', d20: 4 });
    return { lock: typeof D.lock, witness: 'complicationWitness' in plain, none: [roll.complication, roll.complicationEffects.length], some: !!plain.complication };
  });
  assert.equal(r.lock, 'undefined');
  assert.equal(r.witness, false);
  assert.deepEqual(r.none, [null, 0]);
  assert.equal(r.some, true, 'other rolls still have one');
  const src = fs.readFileSync(GAME_PATH, 'utf8');
  for (const dead of ['typeof Dice.clearLocks', 'typeof World.arrestPlan', 'typeof World.arrestPlayer', 'typeof Dice.fightDamage', "typeof State.news === 'function'", 'roll.complication = null']) assert.ok(!src.includes(dead), dead);
});

// ----- the coordinator's recap and command items -----

s.test('coordinator 2 to 5: Owed says "missed Day N, still owed"; Here takes a serial comma when a label has "and"; /skip and /pronouns show their arguments; /help and /commands print the command list', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false);
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: n.id, text: 'Pay {npc} back.', amount: 100, dueOffset: 0 }] });
    S.apply({ setTime: { day: st.time.day, phase: 'night' } });
    G.Pipeline.passTime('long');
    const recap = G.Pipeline.recapText();
    // Here: find a scene with someone unmet whose label has "and" in it.
    let here = null;
    for (const l of st.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      const ppl = S.npcsAt(l.id, ph);
      if (!here && ppl.length >= 3 && ppl.some(p => !p.knownToPlayer && /\band\b/.test(G.npcLabel ? G.npcLabel(p) : p.role || ''))) here = { l, ph };
    }
    let hereLine = null;
    if (here) { while (st.time.phase !== here.ph) S.apply({ advanceTime: 'long' }); S.apply({ playerLocationId: here.l.id }); hereLine = G.Pipeline.recapText().split('\n').find(x => x.startsWith('Here: ')); }
    const C = G.Commands;
    const args = Object.fromEntries(C.LIST.filter(c => ['/skip', '/pronouns', '/help'].includes(c.name)).map(c => [c.name, c.args]));
    const before = document.querySelectorAll('#feed .f-notice').length;
    const help = C.run('/help');
    const alias = C.run('/commands');
    const notes = [...document.querySelectorAll('#feed .f-notice')].slice(before).map(x => x.textContent);
    return { recap, hereLine, args, help, alias, notes };
  });
  assert.match(r.recap, /missed Day \d+, still owed/);
  if (r.hereLine) assert.match(r.hereLine, /, and [^,]+\.$/, r.hereLine);
  assert.equal(r.args['/skip'], '<where or when>');
  assert.equal(r.args['/pronouns'], '<who> <she|he|they>');
  assert.equal(r.help.ok, true);
  assert.equal(r.alias.ok, true);
  assert.equal(r.notes.length, 2);
  for (const t of r.notes) { assert.match(t, /\/skip <where or when>: Jump ahead/); assert.match(t, /\/help: List the commands/); }
});

// ----- the playtest's engine items -----

s.test('N4: a /rest whose morning brings a loose end\'s person tells them arriving, not leaving, in that narration', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_group_home_kid', name: 'Dana Wheeler', seed: 2024, les: [['secret', 0], ['lost', 1], ['promise', 0]] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const le = st.player.looseEnds.find(x => x.kind === 'promise');
    const sd = S.seed(le.seedId);
    const npc = S.npc(le.npcId);
    // Where they are at night, with the player; their seed fires the next morning.
    const night = st.locations.find(l => S.npcsAt(l.id, 'night').some(n => n.id === npc.id) && !S.isClosed(l));
    S.apply({ setTime: { day: st.time.day, phase: 'night' }, playerLocationId: night.id });
    sd.trigger = { type: 'day', value: st.time.day + 1 };
    await G.Pipeline.submit('/rest');
    const pk = (G.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const e = st.log[st.log.length - 1];
    return { name: npc.name, narration: e.narration, due: /^DUE EVENT: /m.test(pk), since: (/^SINCE THE LAST TURN.*$/m.exec(pk) || [''])[0], here: S.npcsAt(st.player.locationId).some(n => n.id === npc.id) };
  });
  assert.equal(r.due, true, 'the due event is in the /rest narration');
  assert.ok(!new RegExp(`left: [^.;]*${r.name}`).test(r.since), r.since);
  assert.ok(!new RegExp(`${r.name}( and [^.]*)? (has|have) left`).test(r.narration) && !new RegExp(`, ${r.name}[^.]* have left`).test(r.narration), r.narration);
  assert.equal(r.here, true, 'and they are here');
});

s.test('N5 and N6: people at the end of a walk are introduced when the narration names them; a loose end\'s person spoken to is met (metTurn), and the narrator stops getting their look', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const here = st.player.locationId;
    const dest = st.locations.map(l => l).find(l => l.id !== here && l.discovered && l.away !== true && !S.isClosed(l) && S.loc(here).exits.includes(l.id) && S.npcsAt(l.id).some(n => !n.knownToPlayer && !n.unnamed));
    const stranger = S.npcsAt(dest.id).find(n => !n.knownToPlayer && !n.unnamed);
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: dest.id, needsRoll: false, timeCost: 'instant' });
    M.queue('narrate', `You walk over. ${stranger.name} looks up from what they are doing.`);
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I walk over to ' + dest.name);
    const introduced = !!S.npc(stranger.id).knownToPlayer;
    // A loose end's person, known from the start: spoken to here, they are met.
    const le = st.player.looseEnds[0];
    const n = S.npc(le.npcId);
    const where = st.locations.find(l => S.npcsAt(l.id).some(x => x.id === n.id) && !S.isClosed(l));
    S.apply({ playerLocationId: where.id });
    const before = n.metTurn;
    M.queue('narrate', 'They look at you and say nothing.');
    await G.Pipeline.submit('Morning.', { mode: 'say', to: n.id });
    M.queue('narrate', 'Nothing much happens.');
    await G.Pipeline.submit('I look around');
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const present = (/^PRESENT: .*$/m.exec(pk) || [''])[0];
    const seg = present.slice(present.indexOf(n.name), present.indexOf(n.name) + 300);
    return { introduced, before: before === undefined ? null : before, met: n.metTurn, look: /look: /.test(seg.split(/\); /)[0]) };
  });
  assert.equal(r.introduced, true, 'introduced by the arrival narration');
  assert.equal(r.before, null, 'a loose end\'s person starts known but not met');
  assert.ok(Number.isInteger(r.met), 'met once spoken to');
  assert.equal(r.look, false, 'their look is no longer sent');
});

s.test('N7: a loose end\'s obligation met (on time or late) resolves its thread, so Open no longer lists it', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const le = st.player.looseEnds[0];
    S.apply({ effects: S.seed(le.seedId).effects }, { source: 'world' });
    const o = S.obligations('open')[0];
    S.apply({ effects: [{ op: 'playerGold', delta: 2000 }] });
    S.apply({ beginTurn: true });
    S.apply({ goldDelta: -o.amount, obligationsSettled: [o.id] }, { source: 'model', present: [o.npcId], targets: [o.npcId], actionType: 'give' });
    return { status: o.status, thread: S.thread(le.threadId).status, open: G.Pipeline.recapText().split('\n').find(x => x.startsWith('Open: ')), label: le.label };
  });
  assert.equal(r.status, 'met');
  assert.equal(r.thread, 'resolved');
  assert.ok(!r.open.includes(r.label), r.open);
});

s.test('N8: a place shut today is told why in words, never "(true)"; before the evening the card game says "today", not "tonight"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x) && Array.isArray(x.closedOn) && x.closedOn.length);
    let d = st.time.day; while (!S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d - 1, phase: 'night' }, playerLocationId: l.id });
    await G.Pipeline.submit('/rest');
    const rest = st.log[st.log.length - 1].narration + ' ' + ((G.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
    M.queue('parse', { actionType: 'gamble', summary: 'Plays cards', targets: [], needsRoll: true, stat: 'wits', timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I sit in at cards for $10');
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { rest, card: (/^CARD GAME: .*$/m.exec(pk) || [''])[0], phase: st.time.phase };
  });
  assert.ok(!/\(true\)/.test(r.rest + r.card), r.rest + ' | ' + r.card);
  assert.match(r.card, /is shut \(closed on \w+\), so there is no game (today|tonight)/);
  if (r.phase === 'morning' || r.phase === 'afternoon') assert.match(r.card, /no game today/);
});

s.test('N9: a /wait over several phases tells one change from where it began to where it ends: nobody "has left" who was never seen', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    // A place where someone comes and goes between the first and the last phase of the wait.
    let pick = null;
    for (const l of st.locations) {
      if (l.away || l.closed || S.isClosed(l)) continue;
      const m = S.npcsAt(l.id, 'morning').map(n => n.id), a = S.npcsAt(l.id, 'afternoon').map(n => n.id), n = S.npcsAt(l.id, 'night').map(x => x.id);
      const passing = a.filter(id => !m.includes(id) && !n.includes(id));
      if (passing.length) { pick = { l, passing }; break; }
    }
    while (st.time.phase !== 'morning') S.apply({ advanceTime: 'long' });
    S.apply({ playerLocationId: pick.l.id });
    const start = S.npcsAt(pick.l.id).map(n => n.id);
    await G.Pipeline.submit('/wait night');
    const pk = (G.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const end = S.npcsAt(pick.l.id).map(n => n.id);
    return { since: (/^SINCE THE LAST TURN.*$/m.exec(pk) || [''])[0], passing: pick.passing.map(id => S.npc(id).name), start, end, names: Object.fromEntries(st.npcs.map(n => [n.id, n.name])) };
  });
  for (const nm of r.passing) assert.ok(!r.since.includes(nm), `${nm} came and went within the wait: ${r.since}`);
  for (const id of r.start.filter(x => !r.end.includes(x))) assert.match(r.since, new RegExp(`left: .*${r.names[id]}`));
  for (const id of r.end.filter(x => !r.start.includes(x))) assert.match(r.since, new RegExp(`arrived here: .*${r.names[id]}`));
});

s.test('N11: two threads resolved in one turn each get their own "Resolved:" line with their own reward', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const [a, b] = st.threads.slice(0, 2);
    a.reward = 'charm'; b.reward = null;
    S.apply({ effects: [{ op: 'threadUpdate', threadId: a.id, knownToPlayer: true }, { op: 'threadUpdate', threadId: b.id, knownToPlayer: true }] });
    G.Api.Mock.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    G.Api.Mock.queue('bookkeep', { threadUpdates: [{ threadId: a.id, status: 'resolved' }, { threadId: b.id, status: 'resolved' }] });
    await G.Pipeline.submit('I look around');
    return { a: a.title, b: b.title, quiets: [...document.querySelectorAll('#feed .f-quiet')].map(e => e.textContent).filter(t => /^Resolved: /.test(t)) };
  });
  assert.ok(r.quiets.includes(`Resolved: ${r.a}. +1 Charm.`), JSON.stringify(r.quiets));
  assert.ok(r.quiets.some(t => t.startsWith(`Resolved: ${r.b}. +`) && /max HP/.test(t)), JSON.stringify(r.quiets));
});

s.test('N12 (and the parser): a search for something not lying here always rolls and makes it only on a success; "I search the shelves for a flashlight" is a search', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock, st = G.state, S = G.State;
    const l = st.locations.find(x => x.type === 'gas' || x.type === 'pawn');
    S.apply({ playerLocationId: l.id });
    const items = () => (S.loc(l.id).items || []).map(i => i.name.toLowerCase());
    M.queue('parse', { actionType: 'search', summary: 'Searches for a crowbar', targets: ['new:crowbar'], needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'failure';
    await G.Pipeline.submit('I search for a crowbar');
    const failed = { roll: !!st.log[st.log.length - 1].roll, found: items().some(x => /crowbar/.test(x)) };
    S.apply({ lastRollKey: null }); // the failed search's lock: a new phase or a move would lift it
    M.queue('parse', { actionType: 'search', summary: 'Searches for a crowbar', targets: ['new:crowbar'], needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I search again for a crowbar');
    const found = { roll: !!st.log[st.log.length - 1].roll, found: items().some(x => /crowbar/.test(x)) || st.player.inventory.some(i => /crowbar/i.test(i.name)) };
    const pk = G.Pipeline.parsePacket('I search the shelves for a flashlight', { speech: { mode: 'do' } });
    const p = (await M.parse(pk)).result;
    return { failed, found, parsed: [p.actionType, p.needsRoll, p.targets] };
  });
  assert.deepEqual(r.failed, { roll: true, found: false }, 'a roll, and a failure finds nothing');
  assert.deepEqual(r.found, { roll: true, found: true });
  assert.deepEqual(r.parsed, ['search', true, ['new:a flashlight']]);
});

s.test('N13, N14, N16 and Nadine\'s hook (content): no "Glenda Gentry", the hustler hook and the gossip template never call the player "them"/"they", Nadine invites to the Parsonage; tests/mentions.cjs refuses a first name with someone else\'s family name', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const D = Game.data;
    const json = JSON.stringify(D);
    const hustler = D.BACKGROUNDS.map(b => b.hook && b.hook.text).find(t => /Friday night game/.test(t || ''));
    const nadine = D.BACKGROUNDS.map(b => b.hook && b.hook.text).find(t => /Nadine Dees/.test(t || ''));
    const gossip = D.GRUDGE_TEMPLATES.map(t => t.effect).find(t => /Shayla Rawls/.test(t));
    return { gentry: /Glenda Gentry/.test(json), hustler, nadine, gossip };
  });
  assert.equal(r.gentry, false);
  assert.ok(!/\bthem\b/.test(r.hustler) && /invites \{player\}/.test(r.hustler), r.hustler);
  assert.ok(!/\bthey\b/.test(r.gossip), r.gossip);
  assert.match(r.nadine, /Parsonage/);
  // The check itself: a made-up pair is caught; the names used on purpose are not.
  const src = fs.readFileSync(GAME_PATH, 'utf8').replace('and Glenda Pryor is carrying the old radio logs', 'and Glenda Gentry is carrying the old radio logs');
  const tmp = path.join(os.tmpdir(), `wave3-mentions-${process.pid}.html`);
  fs.writeFileSync(tmp, src);
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, 'mentions.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /pair "Glenda Gentry"/);
  } finally { fs.unlinkSync(tmp); }
  const ok = spawnSync(process.execPath, [path.join(__dirname, 'mentions.cjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
});

s.test('README row: the owner of a place who likes the player (25 or more) gives a bed there, even a bar shut today; nobody, rough', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const bar = st.locations.find(l => l.type === 'bar');
    const owner = st.npcs.find(n => /\bowner\b/.test(n.role || '') && (n.role || '').toLowerCase().includes(bar.name.toLowerCase().replace(/^the /, '')));
    S.apply({ playerLocationId: bar.id });
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: owner.id, delta: 10 - owner.attitude }] });
    const cold = S.restQuality();
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: owner.id, delta: 30 - owner.attitude }] });
    const warm = S.restQuality();
    let d = st.time.day; while (!S.isClosed(bar, d) && d < st.time.day + 7) d++;
    S.apply({ setTime: { day: d, phase: 'morning' } });
    return { cold, warm, shut: S.isClosed(bar) ? S.restQuality() : 'bed' };
  });
  assert.deepEqual(r, { cold: 'rough', warm: 'bed', shut: 'bed' });
});

s.test('design: the recap lists under Warm and Cold only people the player has dealt with; In town is by day; a seed told as a due event is not also overnight news', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const stranger = st.npcs.find(n => n.alive !== false && n.status === 'free' && G.presenceOf(n) === 'here');
    S.apply({ npcKnownToPlayer: [stranger.id] });
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: stranger.id, delta: -40 - stranger.attitude }] });
    const listed = G.Pipeline.recapText().includes(stranger.name + ' (');
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning' } });
    S.apply({ effects: [{ op: 'addNews', text: 'Later thing happened.', public: true }] });
    S.apply({ effects: [{ op: 'addNews', text: 'Earlier thing happened.', public: true, day: 1, phase: 'morning' }] });
    const town = G.Pipeline.recapText().split('\n').find(x => x.startsWith('In town: '));
    // A seed whose effects add town news and whose words are a due event: the news is already seen.
    S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_t_news', effect: 'Somebody tells you the lease letter came.', trigger: { type: 'day', value: st.time.day }, effects: [{ op: 'addNews', text: 'The lease letter came.', public: true }] } }] });
    G.World.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: st.time.phase }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const item = st.news.find(n => n.text === 'The lease letter came.');
    return { listed, town, seen: item && item.seen, due: st.dueEvents.some(e => e.seedId === 'seed_t_news') };
  });
  assert.equal(r.listed, false, 'a stranger at their starting attitude is not listed');
  assert.ok(r.town.indexOf('Earlier thing') < r.town.indexOf('Later thing'), r.town);
  assert.deepEqual([r.due, r.seen], [true, true]);
});

s.test('design: an arrest takes the player\'s weapons (the chief remembers taking them; a grease gun is no weapon) and no other due event is told in that turn', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    let found = null;
    for (let i = 0; i < 8 && !found; i++) {
      for (const l of st.locations) {
        if (l.closed || S.isClosed(l) || l.away) continue;
        const here = S.npcsAt(l.id);
        const cop = here.find(n => (n.tags || []).includes('police'));
        const other = here.find(n => !(n.tags || []).includes('police'));
        if (cop && other) { found = { l, other }; break; }
      }
      if (!found) S.apply({ advanceTime: 'long' });
    }
    S.apply({ playerLocationId: found.l.id, effects: [{ op: 'giveItem', name: 'Shotgun' }, { op: 'giveItem', name: 'Coil of rope' }, { op: 'giveItem', name: 'Grease gun' }] });
    S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_t_offer', effect: 'A man offers you a job.', trigger: { type: 'day', value: st.time.day + 9 } } }] });
    S.apply({ dueAdd: [{ seedId: 'seed_t_offer', text: 'A man offers you a job.' }] });
    M.queue('parse', { actionType: 'attack', summary: 'Swings at them', targets: [found.other.id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I punch ' + found.other.name);
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const chief = st.npcs.find(n => (n.memories || []).some(m => /locked .* up overnight/.test(m.text)));
    return { inv: st.player.inventory.map(i => i.name), arrest: (/^ARREST: .*$/m.exec(pk) || [''])[0], offer: /A man offers you a job/.test(pk), waiting: st.dueEvents.some(e => e.seedId === 'seed_t_offer'), mem: chief && chief.memories.slice(-1)[0].text };
  });
  assert.ok(!r.inv.includes('Shotgun') && r.inv.includes('Coil of rope'), r.inv.join(', '));
  // The word before makes it ordinary, as for plausibility (integration): a grease gun is no weapon to take.
  assert.ok(r.inv.includes('Grease gun') && !/grease gun/i.test(r.arrest), r.inv.join(', ') + ' | ' + r.arrest);
  assert.match(r.arrest, /takes? .*the shotgun.* off/i);
  // Changed by design in wave 4 (the third review's bug 8): the player by name, which the narrator's memory line turns into "you".
  assert.match(r.mem, /took .*the shotgun.* off Tester$/);
  assert.equal(r.offer, false, 'no other due event in the arrest\'s narration');
  assert.equal(r.waiting, true, 'it waits for the next one');
});

s.test('design: a grudge answers in kind (a beating or the police for violence, talk for an insult)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state, T = G.data.GRUDGE_TEMPLATES;
    const tough = st.npcs.find(n => n.alive !== false && n.status === 'free' && (n.tags || []).includes('tough') && !(n.tags || []).includes('police'));
    const talker = st.npcs.find(n => n.alive !== false && n.status === 'free' && !(n.tags || []).includes('police') && n !== tough && (n.age || 40) < 70 && (n.age || 40) >= 18);
    const kinds = [];
    for (const [n, text] of [[tough, 'attacked me'], [talker, 'insulted me']]) {
      for (let i = 0; i < 6; i++) {
        st.seeds = st.seeds.filter(sd => !(sd.origin && sd.origin.npcId === n.id && sd.origin.kind === 'grudge'));
        S.apply({ effects: [{ op: 'attitudeDelta', npcId: n.id, delta: -60 - n.attitude }] });
        S.apply({ newMemories: [{ npcId: n.id, text, weight: 3 }] });
        G.World.tick({ from: { day: st.time.day, phase: 'night' }, to: { day: st.time.day + 1, phase: 'morning' }, phasesPassed: 1 });
        const sd = st.seeds.filter(x => x.origin && x.origin.kind === 'grudge' && x.origin.npcId === n.id).pop();
        if (sd) kinds.push([text, T[sd.origin.template]]);
      }
    }
    const hurts = t => t.effects.some(e => e.op === 'playerHp');
    const police = t => /police|Chief Bell|ticket/i.test(t.effect) || t.effects.some(e => e.npcId === 'npc_marcus' || e.op === 'playerGold');
    return kinds.map(([why, t]) => [why, hurts(t) || police(t) ? 'violent-or-police' : 'talk']);
  });
  assert.ok(r.length >= 2, 'grudges were planted: ' + JSON.stringify(r));
  for (const [why, kind] of r) assert.equal(kind, why === 'attacked me' ? 'violent-or-police' : 'talk', why);
});

// ----- the demo (mock) items -----

s.test('D1 to D5 (demo): the letter given is the errand\'s; outcome lines come before arrivals; a walk out of town is refused; two things picked up; attacks are never parsed hard and the target\'s threat wins', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_fired_bookkeeper', name: 'Paul Kessler', seed: 3131, les: [['debt', 1], ['enemy', 0], ['promise', 0]] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const out = {};
    // D1: two letters carried; the one for the person named goes.
    const letter = st.player.inventory.find(i => /^Letter for /.test(i.name));
    if (letter) {
      const to = st.npcs.find(n => letter.name.includes(n.name));
      const pk = G.Pipeline.parsePacket(`I give the letter to ${to.name.split(' ')[0]}`, { speech: { mode: 'do' } });
      const p = (await M.parse(pk)).result;
      out.d1 = [p.usesItemId, letter.id, st.player.inventory.filter(i => /letter/i.test(i.name)).length];
    }
    // D3: a walk to a place out of town is parsed as one (the engine refuses it, nothing spent).
    const away = st.locations.find(l => l.away === true);
    const shorts = G.state.time.shorts;
    await G.Pipeline.submit(`I walk to ${away.name}`);
    out.d3 = [G.state.time.shorts === shorts, G.state.player.locationId !== away.id, [...document.querySelectorAll('#feed .f-notice')].pop().textContent.includes('out of town')];
    // D4: two things lying here, both picked up. (A refused turn restores the state as a new object: read G.state afresh.)
    const l = S.loc(G.state.player.locationId);
    S.apply({ addItems: [{ locationId: l.id, item: { id: 'item_t_rod', name: 'Fishing rod', qty: 1 } }, { locationId: l.id, item: { id: 'item_t_box', name: 'Tackle box', qty: 1 } }] });
    await G.Pipeline.submit('I pick up the fishing rod and the tackle box');
    out.d4 = ['Fishing rod', 'Tackle box'].map(n => G.state.player.inventory.some(i => i.name === n));
    // D5: the parser says normal; the engine sets the target's threat.
    const pk5 = G.Pipeline.parsePacket('I punch the mechanic', { speech: { mode: 'do' } });
    out.d5 = (await M.parse(pk5)).result.difficulty;
    return out;
  });
  if (r.d1) assert.equal(r.d1[0], r.d1[1], 'the letter for that person, not the other letter');
  assert.deepEqual(r.d3, [true, true, true]);
  assert.deepEqual(r.d4, [true, true]);
  assert.equal(r.d5, 'normal');
});

s.test('D2 and D5 (demo and engine): a knockdown is told before arrivals; a fight\'s difficulty is the target\'s threat even when the parser said hard', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const sc = await findScene(page, { min: 1, watchy: false, notTypes: ['police', 'watch'] });
  await place(page, sc.loc.id, sc.phase);
  const r = await page.evaluate(async id => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const n = S.npc(id);
    const want = G.Dice.threat(n);
    M.queue('parse', { actionType: 'attack', summary: 'Swings', targets: [id], needsRoll: true, stat: 'might', difficulty: 'very_hard', timeCost: 'instant' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I punch ' + n.name);
    const diff = G.Pipeline.lastTurn.action.difficulty;
    // The third clean hit with arrivals pending: the knockdown is told, first.
    S.apply({ fight: { npcId: id, hits: 2, day: st.time.day, phase: st.time.phase, locationId: st.player.locationId, turn: st.meta.turn } });
    const other = st.npcs.find(x => x.alive !== false && x.status === 'free' && !S.npcsAt(st.player.locationId).includes(x));
    S.apply({ sceneChange: { locationId: st.player.locationId, arrived: [other.id], left: [] } });
    M.queue('parse', { actionType: 'attack', summary: 'Swings again', targets: [id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I punch ' + n.name + ' again');
    const told = st.log[st.log.length - 1].narration;
    return { want, diff, told, name: n.name };
  }, sc.npcs[0].id);
  assert.equal(r.diff, r.want, 'threat wins over the parser\'s difficulty');
  assert.match(r.told, new RegExp(`${r.name} goes down hard and stays down`), r.told);
});

s.test('also: the ending is never cut mid-word; "Deal me in" is told with the stake the engine plays; /skip to the place you are in is a wait there, not an arrival', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const long = 'Three weeks on, the river is up and the barriers are chained across the old bridge. '.repeat(10) + 'And she always said the town would outlast them all.';
    S.apply({ effects: [{ op: 'addNews', text: long, public: true, epilogue: true }] });
    const ending = st.news.find(n => n.epilogue).text;
    S.apply({ newsSeen: 'ending' }); // told already: no ending narration after the next turn
    const plain = st.news.slice(-1)[0];
    S.apply({ effects: [{ op: 'addNews', text: 'word '.repeat(120), public: true }] });
    const cut = st.news.slice(-1)[0].text;
    // The card game: no stake typed, the engine's own.
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
    for (const ph of ['evening', 'night', 'afternoon', 'morning']) {
      let d = st.time.day; while (S.isClosed(l, d)) d++;
      S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
      if (G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id))) break;
    }
    M.queue('parse', { actionType: 'gamble', summary: 'bets $10 at cards', targets: [], needsRoll: true, stat: 'wits', timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.cardsPlay = { hold: 'all' };
    await G.Pipeline.submit('Deal me in');
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const action = (/^ACTION: .*$/m.exec(pk) || [''])[0];
    const stake = G.Pipeline.lastTurn.ctx.gamble && G.Pipeline.lastTurn.ctx.gamble.stake;
    // /skip to where the player is, at a later phase.
    const here = S.loc(st.player.locationId);
    while (st.time.phase !== 'morning') S.apply({ advanceTime: 'long' });
    st.bans = [];
    await G.Pipeline.submit(`/skip to ${here.name} in the evening`);
    const skip = st.log[st.log.length - 1];
    return { endingTail: ending.slice(-40), endingLen: ending.length, cut, action, stake, skipNarr: skip.narration, phase: st.time.phase, at: st.player.locationId === here.id };
  });
  assert.match(r.endingTail, /outlast them all\.$/, 'the ending kept whole');
  assert.match(r.cut, /word…$/, 'long news cut at a word');
  assert.ok(r.action.includes(`$${r.stake}`), `${r.action} vs ${r.stake}`);
  assert.equal(r.phase, 'evening');
  assert.equal(r.at, true);
  assert.ok(!/You arrive/.test(r.skipNarr), r.skipNarr);
});

s.run();
