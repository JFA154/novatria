'use strict';
/* Wave 5 engine fixes (docs/notes/*.md, "Wave 5"): the fourth code review's
   eight bugs, its risks and dead code; the round-4 visual QA's engine items;
   the round-4 playtest's Q1 to Q13, demo D6 to D9, prose items and design
   items. Mock mode throughout.
   Run with: node tests/run.cjs wave5 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, sendText, ROOT } = require('./helpers.cjs');

const s = suite('wave5-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const lastPacket = page => page.evaluate(() => (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
const line = (packet, label) => (new RegExp(`^${label}: .*$`, 'm').exec(packet) || [''])[0];
/* The feed from a mark on: [class, text] for each item after it. */
const markFeed = page => page.evaluate(() => { for (const x of document.querySelectorAll('#feed > *')) x.dataset.w5 = '1'; });
const feedSince = page => page.evaluate(() => [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w5 !== '1').map(x => [x.className, x.textContent]));
const kindOf = c => (/f-divider/.test(c) ? 'divider' : /f-narr/.test(c) ? 'narr' : /f-quiet/.test(c) ? 'quiet' : /f-notice/.test(c) ? 'notice' : 'other');
/* The name problems Style.check finds for each text: "HARD", "soft" or "ok". */
const nameVerdicts = (page, texts) => page.evaluate(ts => ts.map(t => { const h = Game.Style.nameHits(t, { packet: '' }); return h.some(x => x.marked) ? 'HARD' : h.length ? 'soft' : 'ok'; }), texts);
/* Hollis Byrd alone at his open pawn shop, with cash, optionally owed $300. */
async function hollisAlone(page, owed) {
  return page.evaluate(owed => {
    const G = Game, S = G.State, st = G.state;
    G.Api.Mock.delay = 0;
    if (owed) S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_hollis', text: 'Pay Hollis Byrd the three hundred you owe.', amount: 300, dueOffset: 3 }] });
    let ok = false;
    for (let i = 0; i < 8 && !ok; i++) { const h = S.npcsAt('loc_byrds_pawn'); ok = h.length === 1 && h[0].id === 'npc_hollis' && !S.isClosed(S.loc('loc_byrds_pawn')); if (!ok) S.apply({ advanceTime: 'long' }); }
    S.apply({ playerLocationId: 'loc_byrds_pawn', goldDelta: 1000, npcKnownToPlayer: ['npc_hollis'] });
    return ok;
  }, !!owed);
}
/* A Say line to Hollis with the parse and the bookkeeper's diff queued. */
function sayToHollis(page, text, book, parse) {
  return page.evaluate(async ({ text, book, parse }) => {
    const G = Game, M = G.Api.Mock;
    M.queue('parse', Object.assign({ actionType: 'talk', summary: 'Speaks', targets: ['npc_hollis'], needsRoll: false, timeCost: 'instant' }, parse || {}));
    M.queue('bookkeep', book);
    await G.Pipeline.submit(text, { mode: 'say', to: 'npc_hollis' });
    const o = G.State.obligations().find(z => z.npcId === 'npc_hollis') || {};
    return { paid: o.paid | 0, att: G.State.npc('npc_hollis').attitude, gold: G.state.player.gold, bought: G.Pipeline.lastTurn.ctx.bought, gifts: JSON.stringify(G.state.meta.gifts || null) };
  }, { text, book, parse });
}

// ----- review bug 1, playtest Q1 and Q2: money in Say mode -----

s.test('bug 1 / Q1: in Say mode money that goes to a creditor is a payment unless the line buys something ("Fifty now. The rest on Friday.", "Here. Three hundred. Count it."; a parsed give is never a purchase)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  assert.equal(await hollisAlone(page, true), true, 'Hollis alone at his shop');
  const part = await sayToHollis(page, 'Fifty now. The rest on Friday.', { goldDelta: -50 });
  assert.equal(part.paid, 50, 'a part payment with no "paying" word pays');
  assert.equal(part.bought, false);
  const rest = await sayToHollis(page, 'Here. Two fifty. Count it.', { goldDelta: -250 }, { actionType: 'give' });
  assert.equal(rest.paid, 300, 'paid in full');
  assert.equal(rest.bought, false, 'a parsed give is never a purchase');
});

s.test('bug 1: in Say mode a line that buys is still a purchase ("Gimme one of those cold drinks", "How much for the rope?"); words that pay what is owed are never one', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await hollisAlone(page, true);
  const drink = await sayToHollis(page, 'Gimme one of those cold drinks.', { goldDelta: -2 });
  assert.equal(drink.paid, 0, 'the price of a drink pays nothing off');
  assert.equal(drink.bought, true);
  const rope = await sayToHollis(page, 'How much for the rope?', { goldDelta: -8 });
  assert.equal(rope.bought, true);
  assert.equal(rope.paid, 0);
  const owe = await sayToHollis(page, 'Gimme a minute, here is fifty toward what I owe you.', { goldDelta: -50 });
  assert.equal(owe.bought, false, 'paying words win over buying words');
  assert.equal(owe.paid, 50);
});

s.test('Q2: a gift in Say mode with no listed word ("Twenty bucks. Buy yourself lunch.") is a gift: the second the same day earns no warmth', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await hollisAlone(page, false);
  const a0 = await page.evaluate(() => Game.State.npc('npc_hollis').attitude);
  const one = await sayToHollis(page, 'Twenty bucks. Buy yourself lunch.', { goldDelta: -20, attitudeChanges: [{ npcId: 'npc_hollis', delta: 5 }] });
  const two = await sayToHollis(page, 'Twenty more. Buy yourself supper.', { goldDelta: -20, attitudeChanges: [{ npcId: 'npc_hollis', delta: 5 }] });
  assert.equal(one.att - a0, 5, 'the first gift warms');
  assert.equal(two.att, one.att, 'the second the same day does not');
  assert.match(two.gifts, /npc_hollis.*npc_hollis/);
});

// ----- review bug 2 and the name risks -----

s.test('bug 2: a person introduced through a person subject is a hard invented name, past adverbs and what places the speaker ("Royce finally says Darnell took it", "The woman at the register says Darnell skipped town", "Them boys said Darnell is gone"); what a thing says is soft', async h => {
  const page = await h.open();
  await quickStart(page);
  const hard = ['Royce finally says Darnell took it.', 'She also mentions Darnell.', 'He then says Darnell Hux took it.', 'The woman at the register says Darnell skipped town.',
    'An old man by the door says Darnell owes everybody.', 'Somebody at the counter mentions Darnell.', 'Them boys said Darnell is gone.', 'Everybody here says Darnell is trouble.',
    'Hollis and Royce both say Darnell is trouble.', 'The bartender, wiping a glass, says Darnell left.', 'She says that Darnell took it.', '"Fine," says Darnell.'];
  const soft = ['The sign on the door says Closed.', 'The card says Happy Birthday.', 'The radio said Tornado Watch.', 'The note says Darnell Hux owes money.', 'Her text says Darnell is coming.',
    'The sign that hangs over the door says Bait And Tackle.'];
  assert.deepEqual(await nameVerdicts(page, hard), hard.map(() => 'HARD'), hard.join(' | '));
  assert.deepEqual(await nameVerdicts(page, soft), soft.map(() => 'soft'), soft.join(' | '));
});

s.test('risks: titles and street abbreviations are no invented name ("Old Pittman", "Lieutenant Bell", "Miz Gaddis", "Royce Junior", "Front St."); "something by Patsy Cline" is soft but "beaten by Earl Hux" and "the late Earl Hux" are hard; brands at a sentence start are soft and "Silence answers." is fine', async h => {
  const page = await h.open();
  await quickStart(page);
  const ok = ['Old Pittman is here.', 'Lieutenant Bell is here.', 'Detective Bell is here.', 'Nurse Gaddis waves.', 'Miz Gaddis waves.', 'Royce Junior is here.', 'You walk down Front St. to the bank.', 'Silence answers.'];
  assert.deepEqual(await nameVerdicts(page, ok), ok.map(() => 'ok'), ok.join(' | '));
  const soft = ['The jukebox plays something by Patsy Cline.', 'Red Seal is cheap here.', 'Conway Twitty plays on the radio.', 'Merle Haggard is on the jukebox.'];
  assert.deepEqual(await nameVerdicts(page, soft), soft.map(() => 'soft'), soft.join(' | '));
  const hard = ['He was beaten by Earl Hux.', 'They buried the late Earl Hux.', 'A certain Earl Hux called.', 'You ask about a certain Earl Hux.', 'Earl Hux leans on the counter.', 'He walks past Earl Hux.', 'You walk down Front St. Earl Hux waves.'];
  assert.deepEqual(await nameVerdicts(page, hard), hard.map(() => 'HARD'), hard.join(' | '));
});

// ----- review bug 3: the sixth instant -----

s.test('bug 3: a Say turn that is the sixth instant and crosses a phase keeps the person a due event brought (they are there in the phase it lands in)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const le = st.player.looseEnds[0];
    const npc = S.npc(le.npcId);
    while (st.time.phase !== 'morning') S.apply({ advanceTime: 'long' });
    S.apply({ setTime: { day: st.time.day, phase: 'morning', shorts: 2, late: false } });
    st.time.instants = 5;
    S.apply({ dueAdd: [{ seedId: le.seedId, text: `${npc.name} walks up to you and says the money is due.`, npcId: npc.id, bring: true }] });
    M.queue('parse', { actionType: 'talk', summary: 'Talks', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('Nice weather.', { mode: 'say', to: 'everyone' });
    return { phase: st.time.phase, landing: G.Pipeline.lastTurn.ctx.landing, here: S.npcsAt(st.player.locationId).some(n => n.id === npc.id) };
  });
  assert.equal(r.phase, 'afternoon', 'the sixth instant made a short that rolled the phase');
  assert.equal(r.landing.phase, 'afternoon', 'the landing counts it');
  assert.equal(r.here, true, 'the person brought is still there');
});

// ----- review bug 4 and playtest Q5: /undo and the ending -----

s.test('bug 4: /cheat time to the ending and then /undo takes the ending back too: the next turn tells no ending', async h => {
  const page = await h.open();
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock, P = G.Pipeline;
    await P.submit('/cheat time morning 22');
    const noted = G.state.news.some(n => n.epilogue);
    await P.submit('/undo');
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await P.submit('I look around');
    await P.whenIdle();
    await new Promise(res => setTimeout(res, 200));
    await P.whenIdle();
    return { noted, day: G.state.time.day, ending: G.state.news.some(n => n.epilogue), modes: M.calls.filter(c => c.method === 'narrate').map(c => (/^MODE: (\w+)/m.exec(c.text) || [])[1]) };
  });
  assert.equal(r.noted, true);
  assert.equal(r.day, 1);
  assert.equal(r.ending, false);
  assert.ok(!r.modes.includes('epilogue'), 'no ending narrated: ' + r.modes.join(','));
});

s.test('Q5: one /undo takes back a /rest and the ending it brought together; the ending turn tells its narration first, then the Resolved lines, then the recap', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  await page.evaluate(() => {
    Game.State.apply({ effects: [{ op: 'setFlag', key: 'policeKept', value: true }, { op: 'threadUpdate', threadId: 'thr_bridge_vote', knownToPlayer: true }, { op: 'threadUpdate', threadId: 'thr_police_vote', knownToPlayer: true }], eventsFired: ['evt_council_meeting'] });
    Game.Commands.run('/cheat time night 20');
  });
  const t0 = await page.evaluate(() => JSON.stringify(Game.state.time));
  await markFeed(page);
  await page.evaluate(async () => { await Game.Pipeline.rest(); await Game.Pipeline.whenIdle(); });
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.news.some(n => n.epilogue && n.seen));
  const feed = (await feedSince(page)).map(([c, t]) => [kindOf(c), t]);
  const narrs = feed.map(([k], i) => (k === 'narr' ? i : -1)).filter(i => i >= 0);
  const resolved = feed.findIndex(([, t]) => /^Resolved: /.test(t));
  const closing = feed.findIndex(([, t]) => /^This is one ending/.test(t));
  const show = JSON.stringify(feed.map(x => x[0] + ':' + x[1].slice(0, 40)));
  assert.ok(narrs.length >= 2, 'the night and the ending are both narrated: ' + show);
  assert.ok(resolved > narrs[narrs.length - 1], 'the Resolved lines come after the ending narration: ' + show);
  assert.ok(closing > resolved, 'and the closing line after them: ' + show);
  const r = await page.evaluate(async () => {
    const res = Game.Commands.run('/undo');
    await Game.Pipeline.whenIdle();
    return { ok: (await res).ok, time: JSON.stringify(Game.state.time), ending: Game.state.news.some(n => n.epilogue) };
  });
  assert.equal(r.ok, true);
  assert.equal(r.time, t0, 'back to before the /rest');
  assert.equal(r.ending, false, 'and the ending with it');
});

// ----- review bug 5: what a weapon is -----

s.test('bug 5: weapons by what the thing is: makers read before the split, a gauge or a maker only as the whole head or with a model, a box of a calibre is ammunition', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const T = Game.Town;
    const names = ['Copper wire, 18 gauge', 'Wire, 12 gauge', 'Speaker wire (16 gauge)', 'Postcard from Winchester', 'Bus ticket to Remington', 'Deck of cards for blackjack', 'Remington shaver',
      'Smith & Wesson', 'Smith and Wesson Model 10', 'Smith & Wesson .38', 'Sig Sauer P226', '45 ACP', '30-06', 'Sawed-off', 'Six-shooter', 'Colt .45', 'Glock 19', '12-gauge', 'Remington',
      'Box of 9mm', 'Box of .22 shells', 'Shotgun, 12 gauge', 'Knife in a sheath', 'Gun oil', 'Grease gun'];
    return Object.fromEntries(names.map(n => { const w = T.weaponOf(n); return [n, w ? w.kind : null]; }));
  });
  for (const n of ['Copper wire, 18 gauge', 'Wire, 12 gauge', 'Speaker wire (16 gauge)', 'Postcard from Winchester', 'Bus ticket to Remington', 'Deck of cards for blackjack', 'Remington shaver', 'Gun oil', 'Grease gun']) assert.equal(r[n], null, n);
  for (const n of ['Smith & Wesson', 'Smith and Wesson Model 10', 'Smith & Wesson .38', 'Sig Sauer P226', '45 ACP', '30-06', 'Sawed-off', 'Six-shooter', 'Colt .45', 'Glock 19', '12-gauge', 'Shotgun, 12 gauge']) assert.equal(r[n], 'gun', n);
  // Pinned (the lead's design): a maker that is the whole name is a gun.
  assert.equal(r.Remington, 'gun');
  assert.equal(r['Box of 9mm'], 'ammo');
  assert.equal(r['Box of .22 shells'], 'ammo');
  assert.equal(r['Knife in a sheath'], 'knife');
  const p = await page.evaluate(() => [['a Smith & Wesson', 'church'], ['a Smith and Wesson Model 10', 'church'], ['a postcard from Winchester', 'church'], ['a sawed-off', 'church'], ['a flare gun', 'landing']].map(([d, t]) => Game.Town.plausible(d, t).plausible));
  assert.deepEqual(p, [false, false, true, false, true]);
});

// ----- review bugs 6, 7, 8 -----

s.test('bug 6: the memory rewrite keeps the newest day of the memories a line came from (and the kind of turn when they agree)', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    S.apply({ setTime: { day: 4, phase: 'morning', shorts: 0, late: false } });
    S.apply({ setMemories: [{ npcId: 'npc_royce', memories: [2, 3, 4].map(d => ({ turn: 0, day: d, act: 'attack', text: `${st.player.name} punched me in front of the whole station, time number ${d}, and a great deal more happened after that`, weight: 3 })) }] });
    G.Api.Mock.queue('rewriteMemories', { people: [{ npcId: 'npc_royce', memories: [{ from: [1, 2, 3], text: `${st.player.name} punched me in front of the whole station`, weight: 3 }] }] });
    await G.Upgrade.MIGRATIONS.find(m => m.version === 2).run(st, G.Api);
    return S.npc('npc_royce').memories.slice(-1)[0];
  });
  assert.equal(r.day, 4);
  assert.equal(r.act, 'attack');
});

s.test('bug 7: the recap reads curly apostrophes as straight ones ("I’m sure" is "she\'s sure")', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['secret'] });
  const r = await page.evaluate(() => {
    const S = Game.State, P = Game.Pipeline;
    const n = S.npc('npc_loretta');
    n.memories = [{ turn: 0, day: 1, text: 'I’m sure Tester is good for the money', weight: 2 }];
    n.attitude = 40;
    n.knownToPlayer = true;
    return P.recapText().split('\n').find(l => /Loretta/.test(l)) || '';
  });
  assert.doesNotMatch(r, /I’m|she’m|I'm/);
  assert.match(r, /she's sure you(?:'re| are)? good for the money|she's sure you/);
});

s.test('bug 8 and risk: a walk into the council meeting dates its news to the evening it happens, and picks the branch after that evening\'s clocks, as a player already there gets', async h => {
  const branchOf = async (walkIn) => {
    const page = await h.open();
    await quickStart(page, { kinds: [] });
    await fast(page);
    return page.evaluate(async walkIn => {
      const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
      const f = S.faction('fac_police');
      const i = f.clocks.findIndex(c => (c.onComplete.effects || []).some(e => e.op === 'setFlag' && e.key === 'bridgeReportVoid'));
      f.activeClock = i;
      f.clocks[i].filled = f.clocks[i].segments - 1;
      G.World.forceClockRoll(6);
      S.apply({ setTime: { day: 6, phase: 'afternoon', shorts: 2, late: false }, playerLocationId: walkIn ? 'loc_low_water' : 'loc_town_hall' });
      const before = st.factions.map(x => x.clocks.map(c => c.filled).join('/')).join(' ');
      M.queue('parse', walkIn ? { actionType: 'move', summary: 'Walks to Town Hall', targets: [], destinationId: 'loc_town_hall', needsRoll: false, timeCost: 'short' }
        : { actionType: 'search', summary: 'Reads the notices on the board', targets: [], needsRoll: false, timeCost: 'short' });
      M.queue('bookkeep', {});
      await G.Pipeline.submit(walkIn ? 'I walk to Town Hall' : 'I read the notices on the board');
      const news = st.news.find(n => n.eventId === 'evt_council_meeting');
      return { before, after: st.factions.map(x => x.activeClock + ':' + x.clocks.map(c => c.filled).join('/')).join(' '), news: news && { day: news.day, phase: news.phase, text: news.text }, ahead: st.flags.clocksAhead || null, at: st.player.locationId };
    }, walkIn);
  };
  const there = await branchOf(false);
  const walk = await branchOf(true);
  assert.equal(walk.at, 'loc_town_hall');
  assert.ok(there.news && walk.news, 'the meeting happened both ways');
  assert.equal(walk.news.text, there.news.text, 'the same branch: ' + walk.news.text + ' | ' + there.news.text);
  assert.match(walk.news.text, /tabled until a second inspection/, 'the report thrown out that evening counts');
  assert.deepEqual([walk.news.day, walk.news.phase], [6, 'evening'], 'dated to the arrival');
  assert.equal(walk.after, there.after, 'the clocks rolled once for the evening either way');
  assert.equal(walk.ahead, null, 'the tick took the clocks run ahead');
});

// ----- the review's other risks -----

s.test('risk: said to everyone, a failed ask blocks a settlement only with the one the roll was against', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const two = st.npcs.filter(n => n.status === 'free' && n.alive !== false).slice(0, 2);
    S.apply({ effects: two.map(n => ({ op: 'addObligation', kind: 'promise', npcId: n.id, text: `Keep your word to ${n.name}.` })) });
    const ids = two.map(n => S.obligations('open').find(o => o.npcId === n.id).id);
    const opts = { source: 'model', present: two.map(n => n.id), rollSuccess: false, targets: two.map(n => n.id), actionType: 'talk', rolled: true, asked: two[0].id };
    const res = S.apply({ obligationsSettled: ids }, opts);
    return { rejected: res.rejected.map(x => x.path), status: ids.map(id => S.obligations().find(o => o.id === id).status) };
  });
  assert.deepEqual(r.status, ['open', 'met'], 'only the asked one is refused');
  assert.equal(r.rejected.length, 1);
});

s.test('risk and Q4: rough nights count nights in a row at the same public place; a night not slept, a cell night or another place starts again; a place someone lives in is not public; the second time costs $25', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state, P = G.Pipeline;
    const night = async (loc) => { S.apply({ setTime: { day: st.time.day, phase: 'night', shorts: 0, late: false }, playerLocationId: loc }); await P.rest(); return { count: st.flags.roughNights | 0, due: ((M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '').split('\n').find(l => /^DUE EVENT/.test(l)) || '' }; };
    const out = {};
    out.a = await night('loc_town_hall');
    // A night awake: the next night rough is the first again.
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning', shorts: 0, late: false } });
    out.b = await night('loc_town_hall');
    out.c = await night('loc_riverside_church');
    out.d = await night('loc_riverside_church');
    out.first = (S.npc('npc_marcus').memories || []).map(m => m.text);
    // The Low Water: Loretta lives there, so it is hers, not public.
    st.npcs.find(n => n.id === 'npc_loretta').attitude = 0;
    out.e = await night('loc_low_water');
    out.f = await night('loc_low_water');
    // A cell night resets.
    out.g = await night('loc_front_street');
    S.apply({ playerLocationId: 'loc_front_street' });
    G.World.arrestPlayer({ told: true });
    out.cell = st.flags.roughNights | 0;
    // Twice moved on: the fine.
    const gold0 = st.player.gold;
    out.h = await night('loc_front_street');
    out.i = await night('loc_front_street');
    out.fine = gold0 - st.player.gold;
    out.chief = (S.npc('npc_marcus').memories || []).map(m => m.text);
    return out;
  });
  assert.equal(r.a.count, 1);
  assert.equal(r.b.count, 1, 'a night not slept between starts the count again');
  assert.equal(r.c.count, 1, 'another place starts it again');
  assert.match(r.d.due, /second morning running and tells you to move along/);
  assert.equal(r.e.count, 0);
  assert.doesNotMatch(r.f.due, /move along/, 'nobody moves you on from Loretta\'s');
  assert.equal(r.g.count, 1);
  assert.equal(r.cell, 0, 'a night in the cell starts it again');
  assert.equal(r.h.count, 1);
  assert.match(r.i.due, /again, writes you a \$25 fine/);
  assert.equal(r.fine, 25);
  assert.ok(r.first.some(t => /two nights running and told them to move along/.test(t)), r.first.join(' | '));
  assert.ok(r.chief.some(t => /again and fined them/.test(t)), r.chief.join(' | '));
});

s.test('risk: a public grudge done to the player is news seen only once its due event is narrated; dropped untold (its person arrested first) it is told overnight', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, M = G.Api.Mock, st = G.state, P = G.Pipeline;
    const plant = (id, words) => {
      const t = G.data.GRUDGE_TEMPLATES.findIndex(x => x.public === true);
      const n = st.npcs.find(x => x.status === 'free' && x.presence !== 'away' && x.id !== 'npc_marcus');
      S.apply({ effects: [{ op: 'plantSeed', seed: { id, cause: 'Grudge [test]', effect: `${n.name} ${words}.`, trigger: { type: 'day', value: st.time.day }, fired: false, hidden: true, origin: { kind: 'grudge', npcId: n.id, template: t } } }] });
      return n;
    };
    const look = async () => { M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' }); M.queue('bookkeep', {}); await P.submit('I look around'); };
    // Told by its narration: seen, never overnight.
    plant('seed_grudge_test_a', 'tells the whole bar what you did');
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: st.time.phase }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const newsA = st.news.find(n => n.eventId === 'seed_grudge_test_a');
    const before = newsA && newsA.seen;
    await look();
    const after = st.news.find(n => n.eventId === 'seed_grudge_test_a').seen;
    // Dropped: its person arrested before it is told; the morning tells it.
    const b = plant('seed_grudge_test_b', 'tells the whole church what you did');
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: st.time.phase }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    S.apply({ npcFates: [{ npcId: b.id, status: 'arrested' }] });
    await look();
    const droppedSeen = st.news.find(n => n.eventId === 'seed_grudge_test_b').seen;
    await P.rest();
    const quiets = [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent).filter(t => /^Overnight in town: /.test(t));
    return { before, after, droppedSeen, overnight: quiets.join(' '), seenB: st.news.find(n => n.eventId === 'seed_grudge_test_b').seen };
  });
  assert.equal(r.before, false, 'not seen when it is pushed');
  assert.equal(r.after, true, 'seen once narrated');
  assert.equal(r.droppedSeen, false, 'a due event dropped untold leaves its news unseen');
  assert.ok(r.overnight.includes('tells the whole church'), 'told overnight: ' + r.overnight);
  assert.ok(!r.overnight.includes('tells the whole bar'), 'the narrated one is not told again');
  assert.equal(r.seenB, true);
});

s.test('risk: /cheat time onto a town event\'s own place tells it once, as the scene of the next narration (no "Meanwhile in town")', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock, st = G.state, P = G.Pipeline;
    G.State.apply({ playerLocationId: 'loc_town_hall' });
    const res = await P.submit('/cheat time evening 6');
    const meanwhile = [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent).filter(t => /^Meanwhile in town: /.test(t)).length;
    M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await P.submit('I look around');
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { ok: res.ok, meanwhile, due: (/^DUE EVENT: .*$/m.exec(pk) || [''])[0], seen: st.news.filter(n => n.eventId === 'evt_council_meeting').map(n => n.seen) };
  });
  assert.equal(r.ok, true);
  assert.equal(r.meanwhile, 0);
  assert.match(r.due, /council|Royce|bridge/i);
  assert.deepEqual(r.seen, [true]);
});

s.test('risk: a due event names a home not found yet only by its name or an alias of its own ("the pastor\'s house"), never a plain one ("the apartment", "the white house")', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, st = G.state;
    const plain = G.World.dueNarrated([{ seedId: 'x', text: 'She says the apartment is too small and the white house on the corner is empty.' }]);
    const own = G.World.dueNarrated([{ seedId: 'y', text: 'Come by the pastor\'s house for supper.' }]);
    return { plain: plain.revealed, own: own.revealed, parsonage: st.locations.find(l => l.id === 'loc_parsonage').discovered };
  });
  assert.deepEqual(r.plain, []);
  assert.deepEqual(r.own, ['loc_parsonage']);
});

// ----- the round-4 visual QA's engine items -----

s.test('QA: "until Day N" in the hurt note; the /cheat row says it sets the clock too; /cheat time past several seeds and events fires them in order, each dated to its own day', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.home);
    S.apply({ npcFates: [{ npcId: n.id, status: 'hurt' }] });
    const note = S.absentNote(n);
    const row = G.Commands.LIST.find(c => c.name === '/cheat');
    await G.Pipeline.submit('/cheat time evening 6');
    const news = st.news.map(x => ({ day: x.day, phase: x.phase, text: x.text, ev: x.eventId || null }));
    return { note, row: { args: row.args, desc: row.desc }, news };
  });
  assert.match(r.note, /until Day \d+$/);
  assert.deepEqual(r.row, { args: '[outcome or time <phase> [day]]', desc: 'Cheat: redo the last roll (success, partial, fail, crit, fumble or 1-20), or set the clock' });
  const agenda = r.news.findIndex(x => /agenda for Tuesday night/.test(x.text));
  const meeting = r.news.findIndex(x => x.ev === 'evt_council_meeting');
  assert.ok(agenda >= 0 && meeting >= 0, JSON.stringify(r.news));
  assert.ok(agenda < meeting, 'the agenda before the meeting');
  assert.deepEqual([r.news[agenda].day, r.news[agenda].phase], [5, 'morning'], 'dated to its own day');
  assert.deepEqual([r.news[meeting].day, r.news[meeting].phase], [6, 'evening']);
  for (let i = 1; i < r.news.length; i++) assert.ok(r.news[i].day >= r.news[i - 1].day, 'in day order: ' + JSON.stringify(r.news.map(x => x.day)));
});

// ----- the round-4 playtest -----

s.test('Q3: a grudge reads the kind of turn its memory was made in ("told me to beat it" said to someone is words, not a beating); without one, the words of an insult come first', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, M = G.Api.Mock, st = G.state;
    const n = S.npcsAt(st.player.locationId)[0] || st.npcs.find(x => x.status === 'free');
    S.apply({ playerLocationId: st.locations.find(l => S.npcsAt(l.id).includes(n)) ? st.locations.find(l => S.npcsAt(l.id).includes(n)).id : st.player.locationId });
    M.queue('parse', { actionType: 'talk', summary: 'Talks', targets: [n.id], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { newMemories: [{ npcId: n.id, text: 'told me to beat it', weight: 3 }] });
    await G.Pipeline.submit('Beat it.', { mode: 'say', to: n.id });
    const m = n.memories.slice(-1)[0];
    return {
      act: m.act, made: W.memoryKind(m),
      words: ['told me to beat it', 'called me a thief', 'said I fight like a girl', 'called me a punching bag', 'punched me in the jaw', 'stole my truck'].map(t => W.memoryKind({ text: t }))
    };
  });
  assert.equal(r.act, 'talk');
  assert.equal(r.made, 'insult');
  assert.deepEqual(r.words, ['insult', 'insult', 'insult', 'insult', 'violence', 'theft']);
});

s.test('Q6 and design: every ending settles the police thread (the open-bridge ending keeps them "for now", or ends them when the vote did); the council branches that keep the police resolve it', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const E = Game.data.TOWN_DATA.epilogue;
    const settles = b => (b.effects || []).some(e => e.op === 'threadUpdate' && e.threadId === 'thr_police_vote' && (e.status === 'resolved' || e.status === 'failed'));
    const ev = Game.data.TOWN_DATA.events.find(e => e.id === 'evt_council_meeting');
    const keeps = ev.branches.filter(b => (b.effects || []).some(e => e.op === 'setFlag' && e.key === 'policeKept'));
    return { all: E.branches.concat([E.default]).map(settles), keepsResolve: keeps.map(b => b.effects.some(e => e.op === 'threadUpdate' && e.threadId === 'thr_police_vote' && e.status === 'resolved')),
      def: E.default.effects.find(e => e.threadId === 'thr_police_vote') };
  });
  assert.ok(r.all.every(Boolean), JSON.stringify(r.all));
  assert.equal(r.def.status, 'resolved');
  assert.match(r.def.summary, /for now/);
  assert.ok(r.keepsResolve.length && r.keepsResolve.every(Boolean), JSON.stringify(r.keepsResolve));
});

s.test('Q7 and Q8: on a turn that runs into morning the divider comes first, then the night\'s quiet lines and "Overnight in town"; a plan done in front of a sleeping player is told by the morning\'s narration', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  // Q8: asleep at Front Street, a plan finishes there.
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const f = st.factions[0];
    const c = f.clocks[f.activeClock];
    c.onComplete = { text: 'A crew paints a white line down the middle of Front Street while it is still dark.', effects: [{ op: 'openLocation', locationId: 'loc_front_street' }] };
    c.filled = c.segments - 1;
    G.World.forceClockRoll(1);
    G.World.forceClockRoll(6, f.id);
    S.apply({ setTime: { day: st.time.day, phase: 'night', shorts: 0, late: false }, playerLocationId: 'loc_front_street' });
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w5 = '1';
    await G.Pipeline.rest();
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const quiet = [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w5 !== '1' && x.classList.contains('f-quiet')).map(x => x.textContent);
    return { due: (/^DUE EVENT: .*$/m.exec(pk) || [''])[0], quiet };
  });
  assert.match(r.due, /white line down the middle of Front Street/);
  assert.ok(!r.quiet.some(t => /white line/.test(t)), 'not a bare quiet line too');
  // Q7: an arrest runs into morning.
  await page.evaluate(() => { Game.World.forceClockRoll(null); Game.Commands.run('/cheat time morning 2'); });
  await sendText(page, 'I walk to Town Hall');
  await page.evaluate(() => { Game.State.apply({ effects: [{ op: 'addNews', text: 'Somebody painted the water tower overnight.', public: true }] }); Game.Pipeline.forceNextRoll(15); });
  await markFeed(page);
  const officer = await page.evaluate(() => (Game.State.npcsAt('loc_town_hall').find(n => (n.tags || []).includes('police')) || {}).name || '');
  await sendText(page, `I punch ${officer.split(' ')[0]}`);
  const order = (await feedSince(page)).map(([c, t]) => (kindOf(c) === 'divider' ? 'DIVIDER' : /^Overnight in town/.test(t) ? 'OVERNIGHT' : kindOf(c) === 'narr' ? 'NARR' : null)).filter(Boolean);
  if (order.includes('OVERNIGHT')) assert.ok(order.indexOf('DIVIDER') >= 0 && order.indexOf('DIVIDER') < order.indexOf('OVERNIGHT'), order.join(' -> '));
  else assert.ok(order.includes('DIVIDER'), 'the arrest ran into morning: ' + order.join(' -> '));
});

s.test('Q9: once the ending is told the town\'s plans stop: no clock rolls, and one already full comes to nothing', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    S.apply({ effects: [{ op: 'setFlag', key: 'epilogueShown', value: true }] });
    G.World.forceClockRoll(6);
    const before = st.factions.map(f => f.clocks.map(c => c.filled).join('/')).join(' ');
    G.World.tick({ to: { day: st.time.day, phase: 'evening' } });
    const after = st.factions.map(f => f.clocks.map(c => c.filled).join('/')).join(' ');
    const f = st.factions[0];
    const c = f.clocks[f.activeClock];
    c.filled = c.segments;
    const flags0 = JSON.stringify(st.flags);
    const res = G.World.tick({ to: { day: st.time.day, phase: 'night' } });
    return { before, after, moved: f.activeClock, flagsSame: JSON.stringify(st.flags) === flags0, ev: res.events.filter(e => e.kind === 'clock') };
  });
  assert.equal(r.after, r.before, 'nothing rolled');
  assert.equal(r.flagsSame, true, 'the full clock\'s effects did not run');
  assert.equal(r.ev.length, 1);
  assert.equal(r.ev[0].met, false);
});

s.test('Q10: stealing from someone who is not here rolls nothing (NOT PRESENT)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const away = st.npcs.find(n => n.status === 'free' && !S.npcsAt(st.player.locationId).includes(n));
    M.queue('parse', { actionType: 'steal', summary: 'Steals a wallet', targets: [away.id], needsRoll: true, stat: 'stealth', difficulty: 'normal', timeCost: 'instant' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit(`I steal ${away.name}'s wallet`);
    return { roll: G.Pipeline.lastTurn.roll, noRoll: G.Pipeline.lastTurn.ctx.noRoll };
  });
  assert.equal(r.roll, null);
  assert.match(r.noRoll, /steal from is not here/);
});

s.test('Q11: a friend whose home is their shop gives a bed there only when they are there tonight (Hollis fishes at the landing at night)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    S.apply({ setTime: { day: 3, phase: 'night', shorts: 0, late: false }, playerLocationId: 'loc_byrds_pawn', effects: [{ op: 'attitudeDelta', npcId: 'npc_hollis', delta: 40 }] });
    const there = S.npcsAt('loc_byrds_pawn', 'night').some(n => n.id === 'npc_hollis');
    const q = S.restQuality();
    S.apply({ visits: [{ npcId: 'npc_hollis', locationId: 'loc_byrds_pawn' }] });
    return { there, q, q2: S.restQuality() };
  });
  assert.equal(r.there, false);
  assert.equal(r.q, 'rough');
  assert.equal(r.q2, 'bed', 'there tonight, he puts the player up');
});

s.test('Q12: a thread made known and resolved in one update earns its progression (the Resolved line and its gain)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const t = st.threads.find(x => x.status === 'open' && !x.knownToPlayer && !(st.player.looseEnds || []).some(le => le.threadId === x.id));
    const n = st.player.progression.length;
    S.apply({ effects: [{ op: 'threadUpdate', threadId: t.id, status: 'resolved', knownToPlayer: true }] });
    return { n0: n, n1: st.player.progression.length, last: st.player.progression.slice(-1)[0] };
  });
  assert.equal(r.n1, r.n0 + 1);
  assert.ok(r.last.gain, JSON.stringify(r.last));
});

s.test('Q12: an ending /cheat time reaches makes threads known and resolves them: their Resolved lines and gains are told after the ending\'s narration, not lost', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const p0 = st.player.progression.length;
    S.apply({ effects: [{ op: 'setFlag', key: 'bridgeReportVoid', value: true }, { op: 'setFlag', key: 'policeKept', value: true }], eventsFired: ['evt_council_meeting'] });
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w5 = '1';
    await G.Pipeline.submit('/cheat time morning 21');
    M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I look around');
    await G.Pipeline.whenIdle();
    await new Promise(res => setTimeout(res, 200));
    await G.Pipeline.whenIdle();
    const feed = [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w5 !== '1').map(x => [x.className, x.textContent]);
    return { gained: st.player.progression.length - p0, feed };
  });
  assert.ok(r.gained >= 1, 'progression earned');
  const kinds = r.feed.map(([c, t]) => (/^Resolved: /.test(t) ? 'RESOLVED' : /^This is one ending/.test(t) ? 'CLOSE' : /f-narr/.test(c) ? 'NARR' : null)).filter(Boolean);
  assert.ok(kinds.includes('RESOLVED'), kinds.join(' -> '));
  assert.ok(kinds.lastIndexOf('NARR') < kinds.indexOf('RESOLVED') && kinds.indexOf('RESOLVED') < kinds.indexOf('CLOSE'), 'the ending, then its Resolved lines, then the closing line: ' + kinds.join(' -> '));
});

s.test('D7: a failed theft reads in the recap as "remembers you tried to steal from him"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, n = S.npc('npc_royce');
    n.memories = [{ turn: 0, day: 1, text: `${Game.state.player.name} tried to steal from me`, weight: 3, act: 'steal' }];
    n.attitude = -30;
    n.knownToPlayer = true;
    return Game.Pipeline.recapText().split('\n').filter(l => /Royce Pittman/.test(l)).join(' | ');
  });
  assert.match(r, /remembers you tried to steal from him/);
});

s.test('Q13 and prose: the accused card player ends up "out on Front Street"; the beating grudge is not "alone after dark"; "Missed: … (due Day N)"; a complication names the place inside a sentence', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(src, /and they end up \$\{street \? `out on \$\{placeName\(street\)\}` : 'outside'\}\./);
  assert.doesNotMatch(src, /end up outside\$\{onto\}/);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const tpl = G.data.GRUDGE_TEMPLATES.map(t => t.effect);
    S.apply({ effects: [{ op: 'addObligation', kind: 'promise', npcId: 'npc_royce', text: 'Keep your word to Royce Pittman.', dueOffset: 0 }] });
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning', shorts: 0, late: false } });
    const res = G.World.tick({ to: { day: st.time.day, phase: 'morning' } });
    const missed = res.events.map(e => e.notice || '').filter(t => /^Missed:/.test(t));
    const c = G.Dice.complication({ actionType: 'sneak', tier: 'failure', presentIds: ['npc_royce'], day: 3, locationId: 'loc_motor_court' }, { pick: a => a.find(e => /report/.test(JSON.stringify(e.effects || []))) || a[0], int: () => 0, d: () => 1 });
    return { tpl, missed, comp: c ? JSON.stringify(c.effects) : '' };
  });
  assert.ok(!r.tpl.some(t => /alone after dark/.test(t)));
  for (const m of r.missed) assert.match(m, /\(due Day \d+\)\.$/);
  assert.doesNotMatch(r.comp, /at The Riverview/);
});

s.test('demo D6 to D9: giving more than you have hands over nothing; a failed theft is remembered as the player caught stealing; a letter is not counted; due events are never cut mid-sentence', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const n = S.npcsAt(st.player.locationId)[0] || st.npcs.find(x => x.status === 'free');
    const loc = st.locations.find(l => S.npcsAt(l.id).some(x => x.id === n.id)).id;
    S.apply({ playerLocationId: loc });
    const g0 = st.player.gold;
    M.queue('parse', { actionType: 'give', summary: 'Gives money', targets: [n.id], needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit(`I give ${n.name.split(' ')[0]} $${g0 + 100}`);
    const book = G.Api.Mock.calls.filter(c => c.method === 'bookkeep').pop();
    const give = { gold: st.player.gold, g0, narr: st.log.slice(-1)[0].narration };
    G.Pipeline.forceNextRoll(2);
    M.queue('parse', { actionType: 'steal', summary: 'Steals', targets: [n.id], needsRoll: true, stat: 'stealth', difficulty: 'normal', timeCost: 'instant' });
    await G.Pipeline.submit(`I steal ${n.name.split(' ')[0]}'s wallet`);
    const mem = (S.npc(n.id).memories || []).map(m => m.text).join(' | ');
    S.apply({ effects: [{ op: 'giveItem', name: 'Letter for Somebody' }] });
    const letter = st.player.inventory.find(i => /Letter/.test(i.name));
    M.queue('parse', { actionType: 'give', summary: 'Gives the letter', targets: [n.id], usesItemId: letter.id, needsRoll: false, timeCost: 'instant' });
    await G.Pipeline.submit(`I give ${n.name.split(' ')[0]} the letter`);
    const letterNarr = st.log.slice(-1)[0].narration;
    void book;
    return { give, mem, letterNarr, player: st.player.name };
  });
  assert.equal(r.give.gold, r.give.g0, 'nothing handed over');
  assert.match(r.give.narr, /come up short/);
  assert.match(r.mem, new RegExp(`${r.player} tried to steal from me`));
  assert.doesNotMatch(r.mem, /caught me stealing/);
  assert.doesNotMatch(r.letterNarr, /counts it/);
  // D8: the mock's long due events.
  const cut = await page.evaluate(async () => {
    const ctx = { mode: 'normal', action: { actionType: 'look', targets: [] }, present: [], presentIds: [], location: { id: Game.state.player.locationId, name: 'here' }, due: [
      { text: 'Chief Bell is waiting by your truck when you come out, and he wants a word about where you were last night, and who with, and why you were there at all.' },
      { text: 'Nadine Dees draws you aside and says, low, that her father has been asking about you, and that you should come by the parsonage for supper on Sunday and meet him properly.' },
      { text: 'Somebody has left a note under your door saying the man you are looking for left town on Tuesday, and that you should stop asking about him at the Low Water if you know what is good for you.' }] };
    Game.Api.Mock.delay = 0;
    const r = await Game.Api.Mock.narrate({ text: '', context: ctx });
    return (r && (r.text || (r.result && r.result.text))) || '';
  });
  assert.ok(cut.length > 0);
  assert.doesNotMatch(cut, /\b(?:is|says|and)\.(\s|$)/, cut);
  assert.match(cut, /Chief Bell is waiting by your truck/, 'the first stays whole');
});

s.test('design: an enemy loose end\'s threat comes good some days after its first beat (a beating that costs HP), unless the loose end is settled', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['enemy'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, st = G.state;
    const le = st.player.looseEnds.find(x => x.kind === 'enemy');
    const sd = S.seed(le.seedId);
    const n = S.npc(le.npcId);
    n.attitude = Math.min(n.attitude, -30);
    S.apply({ setTime: { day: sd.trigger.value, phase: 'morning', shorts: 0, late: false } });
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const fu = st.seeds.find(x => x.id === `${le.seedId}_due`);
    const gap = fu ? fu.trigger.value - sd.trigger.value : null;
    const hp0 = st.player.hp;
    S.apply({ setTime: { day: fu.trigger.value, phase: 'morning', shorts: 0, late: false } });
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const due = (st.dueEvents || []).find(e => e.seedId === fu.id);
    return { gap, requires: fu.requires, hurt: hp0 - st.player.hp, due: due && due.text, bring: due && due.bring };
  });
  assert.ok(r.gap >= 3 && r.gap <= 5, 'three to five days on: ' + r.gap);
  assert.ok(r.requires.threadOpen && r.requires.attitudeBelow);
  assert.equal(r.hurt, 2);
  assert.match(r.due, /hits you twice/);
  assert.equal(r.bring, true);
  // Settled first: the alt.
  const page2 = await h.open();
  await quickStart(page2, { kinds: ['enemy'] });
  const r2 = await page2.evaluate(() => {
    const G = Game, S = G.State, W = G.World, st = G.state;
    const le = st.player.looseEnds.find(x => x.kind === 'enemy');
    const sd = S.seed(le.seedId);
    S.apply({ setTime: { day: sd.trigger.value, phase: 'morning', shorts: 0, late: false } });
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    S.apply({ effects: [{ op: 'threadStatus', threadId: le.threadId, status: 'resolved' }] });
    const fu = st.seeds.find(x => x.id === `${le.seedId}_due`);
    const hp0 = st.player.hp;
    S.apply({ setTime: { day: fu.trigger.value, phase: 'morning', shorts: 0, late: false } });
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const due = (st.dueEvents || []).find(e => e.seedId === fu.id);
    return { hurt: hp0 - st.player.hp, due: due && due.text };
  });
  assert.equal(r2.hurt, 0);
  assert.match(r2.due, /keeps walking/);
});

s.test('design: obligationPaid credits a seizure against the debt (the repo man\'s $150, or what cash there is); paid in full it is met', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const repo = Game.data.LOOSE_ENDS.debt.obligations[1];
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_hollis', text: repo.text, amount: 300, dueOffset: 0, onMiss: repo.onMiss }] });
    const o = S.obligations('open').find(x => x.npcId === 'npc_hollis');
    const fill = o.onMiss.find(e => e.op === 'obligationPaid');
    st.player.gold = 100;
    S.apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'missed' }] });
    const afterMiss = { paid: o.paid, gold: st.player.gold, status: o.status };
    S.apply({ goldDelta: 500 });
    const r2 = S.apply({ effects: [{ op: 'obligationPaid', id: o.id, amount: 400 }] });
    return { fill, afterMiss, paid: o.paid, status: o.status, late: !!o.late, line: r2.applied.join(' ') };
  });
  assert.equal(r.fill.id.startsWith('obl_debt_npc_hollis'), true, 'its own id filled in');
  assert.deepEqual(r.afterMiss, { paid: 100, gold: 0, status: 'missed' }, 'what cash there was, credited');
  assert.equal(r.paid, 300, 'never more than is owed');
  assert.equal(r.status, 'met');
  assert.equal(r.late, true);
});

s.test('design: the two swing-vote steps each need the other\'s flag unset, and their alternatives never ask for a vote again', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const fs = Game.data.TOWN_DATA.factions;
    const find = label => fs.flatMap(f => f.clocks).find(c => c.label === label).onComplete;
    const buy = find('Buy the swing vote');
    const turn = find('Turn the swing vote');
    return { buy: buy.requires.flagsUnset, turn: turn.requires.flagsUnset, alts: [buy.alt.text, turn.alt.text] };
  });
  assert.ok(r.buy.includes('royceTurned') && r.buy.includes('councilVoted'));
  assert.ok(r.turn.includes('royceBought') && r.turn.includes('councilVoted'));
  for (const t of r.alts) assert.doesNotMatch(t, /vote again|take the bridge vote/);
});

s.test('design: re-reading an older game gives unfired seeds the words the town and the loose ends now have', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['secret'] });
  const r = await page.evaluate(async () => {
    const G = Game, st = G.state;
    const town = st.seeds.find(x => !x.fired && G.data.TOWN_DATA.seeds.some(t => t.id === x.id));
    town.effect = 'An old wording of this seed.';
    const le = st.player.looseEnds[0];
    const own = st.seeds.find(x => x.id === le.seedId);
    const want = own.effect;
    own.effect = 'Somebody catches you alone.';
    const step = G.Upgrade.MIGRATIONS.find(m => m.version === 8);
    const res = await step.run(st, G.Api);
    return { town: town.effect, want: G.data.TOWN_DATA.seeds.find(t => t.id === town.id).effect, own: own.effect, ownWant: want, text: res.text };
  });
  assert.equal(r.town, r.want);
  assert.equal(r.own, r.ownWant);
});

s.test('dead code: one andList, no joinNames; qualifiedHere and harmlessHead share wordBefore; the unreachable maker alternative is gone', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(src, /function joinNames/);
  assert.match(src, /function wordBefore\(thing, hit\)/);
  assert.doesNotMatch(src, /smith \(\?:&\|and\) wesson/);
});

s.run();
