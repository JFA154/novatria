'use strict';
/* Wave 6 engine fixes (docs/notes/*.md, "Wave 6"): the fifth code review's
   six bugs, its risks and dead code; the round-5 visual QA's /cheat row; the
   round-5 playtest's R1 to R9, demo D10 to D14 and design notes. Mock mode
   throughout.
   Run with: node tests/run.cjs wave6 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, ROOT } = require('./helpers.cjs');

const s = suite('wave6-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const lastPacket = page => page.evaluate(() => (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
const markFeed = page => page.evaluate(() => { for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1'; });
const feedSince = page => page.evaluate(() => [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => [x.className, x.textContent]));
/* The name problems Style.check finds for each text: "HARD", "soft" or "ok". */
const nameVerdicts = (page, texts) => page.evaluate(ts => ts.map(t => { const h = Game.Style.nameHits(t, { packet: '' }); return h.some(x => x.marked) ? 'HARD' : h.length ? 'soft' : 'ok'; }), texts);
/* Hollis Byrd alone at his open pawn shop, with cash, optionally owed money. */
async function hollisAlone(page, owed) {
  return page.evaluate(owed => {
    const G = Game, S = G.State;
    G.Api.Mock.delay = 0;
    if (owed) S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_hollis', text: 'Pay Hollis Byrd what you owe him.', amount: owed, dueOffset: 5 }] });
    let ok = false;
    for (let i = 0; i < 8 && !ok; i++) { const h = S.npcsAt('loc_byrds_pawn'); ok = h.length === 1 && h[0].id === 'npc_hollis' && !S.isClosed(S.loc('loc_byrds_pawn')); if (!ok) S.apply({ advanceTime: 'long' }); }
    S.apply({ playerLocationId: 'loc_byrds_pawn', goldDelta: 5000, npcKnownToPlayer: ['npc_hollis'] });
    return ok;
  }, owed || 0);
}
/* A Say line to Hollis with the parse and the bookkeeper's diff queued: what the money was. */
function sayToHollis(page, text, book, parse) {
  return page.evaluate(async ({ text, book, parse }) => {
    const G = Game, M = G.Api.Mock;
    const ob = () => G.State.obligations().find(z => z.npcId === 'npc_hollis') || {};
    const paid0 = ob().paid | 0;
    const att0 = G.State.npc('npc_hollis').attitude;
    M.queue('parse', Object.assign({ actionType: 'talk', summary: 'Speaks', targets: ['npc_hollis'], needsRoll: false, timeCost: 'instant' }, parse || {}));
    M.queue('bookkeep', book);
    await G.Pipeline.submit(text, { mode: 'say', to: 'npc_hollis' });
    const c = G.Pipeline.lastTurn.ctx;
    return { paid: (ob().paid | 0) - paid0, att: G.State.npc('npc_hollis').attitude - att0, bought: !!c.bought, paying: !!c.paying, gift: c.gift || null, gifts: JSON.stringify(G.state.meta.gifts || null) };
  }, { text, book, parse });
}

// ----- review bug 1, playtest R1: money in Say mode, the final design, line by line -----

/* Every Say line from the third, fourth and fifth code reviews and the
   third, fourth and fifth playtests, with what its money must be: 'pay'
   (toward Hollis's debt, all of it), 'buy' (the price of something: pays
   nothing off). Hollis is owed $3000 and alone at his counter; each line's
   diff moves the money given (and what else is listed). */
const SAY_MONEY = [
  // review 5 (bug 1): payments with buying words in them
  ["Here's fifty. I'll get you the rest Friday.", 'pay', 50],
  ["Here's a hundred. How much is left?", 'pay', 100],
  ['Give me a second. Here, fifty.', 'pay', 50],
  ["Fifty now. I'll have the rest by Friday.", 'pay', 50],
  ["I'll take the fifty.", 'pay', 50],
  ['Fifty now. The rest Friday.', 'pay', 50],
  ["Here's fifty. I'll get you the rest Friday.", 'pay', 50, { actionType: 'give' }],
  // playtest 5 (R1)
  ["Here's fifty. Give me till Friday for the rest.", 'pay', 50],
  ["Can I get a few more days? Here's fifty.", 'pay', 50],
  ["Take this fifty. I'll take care of the rest Friday.", 'pay', 50],
  ['Fifty for now. Could I have a week for the rest?', 'pay', 50],
  ['Can I get till Monday? Here is twenty.', 'pay', 20],
  // review 4 (bug 1) and playtest 4 (Q1)
  ['A hundred now, the rest Friday.', 'pay', 100],
  ['Here. Three hundred. Count it.', 'pay', 300],
  ['Take the three hundred.', 'pay', 300],
  ['That makes us even now.', 'pay', 100],
  ['All of it, like we agreed.', 'pay', 100],
  ['Here you go, Hollis.', 'pay', 100],
  ['Fifty now. The rest on Friday.', 'pay', 50],
  ['Here. Two fifty. Count it.', 'pay', 250, { actionType: 'give' }],
  // wave 5's own: paying words win over buying words, and over a parsed buy
  ['Gimme a minute, here is fifty toward what I owe you.', 'pay', 50],
  ["Here's fifty toward the note. And I'll take a beer.", 'pay', 50, { actionType: 'buy' }],
  // the diff gains a thing that is no good: still a payment
  ["Here's the three hundred. I want my title back.", 'pay', 300, null, { itemsGained: [{ name: 'Truck title', qty: 1 }] }],
  // review 3 (bug 1), review 5, wave 5: lines that buy
  ['Gimme one of those cold drinks.', 'buy', 2],
  ['Two beers, please.', 'buy', 6],
  ['Two beers, please.', 'buy', 6, { actionType: 'buy' }],
  ['Another round, and thanks for the company.', 'buy', 6, { actionType: 'buy' }],
  ['Another round, and thanks for the company.', 'buy', 6],
  ["I'll take a beer.", 'buy', 3],
  ["I'll take a pack.", 'buy', 9],
  ['How much for a flashlight?', 'buy', 15],
  ['Can I get a cup of coffee?', 'buy', 2],
  ['A beer.', 'buy', 3],
  ['Fill it up.', 'buy', 30],
  ["Here's three.", 'buy', 3, null, { itemsGained: [{ name: 'Bottle of beer', qty: 1 }] }],
  // by design (wave 6): a thing not in the goods table and not on sale here is no good, so its price pays the debt
  ['How much for the rope?', 'pay', 8]
];

s.test('bug 1 / R1: Say-mode money, the final design, line by line: a payment toward what is owed unless the parser read a buy, the diff gains a good, or the line names a good in a buying frame; paying words always win (' + SAY_MONEY.length + ' lines)', async h => {
  assert.ok(SAY_MONEY.length >= 25);
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  assert.equal(await hollisAlone(page, 3000), true, 'Hollis alone at his shop');
  const wrong = [];
  for (const [text, want, amount, parse, extra] of SAY_MONEY) {
    const r = await sayToHollis(page, text, Object.assign({ goldDelta: -amount }, extra || {}), parse || null);
    const got = r.paid === amount && !r.bought ? 'pay' : r.paid === 0 ? 'buy' : `paid ${r.paid}`;
    if (got !== want) wrong.push(`${JSON.stringify(text)}${parse ? ' (parsed ' + parse.actionType + ')' : ''}: ${got}, want ${want}`);
  }
  assert.deepEqual(wrong, []);
});

/* Gifts: no debt, so money that is not a purchase is a gift, and only the
   first gift to someone in a day warms them. */
const SAY_GIFTS = [
  ["Here's twenty. Get yourself a beer.", 'Another twenty. Get yourself a beer.', 'And twenty more. Get yourself a beer.'],
  ['Twenty bucks. Buy yourself lunch.', 'Another twenty. Buy yourself lunch.', 'And another twenty. Buy yourself lunch.'],
  ["Here's twenty for you.", "Here's twenty more for you.", "Here's another twenty for you."]
];
for (const lines of SAY_GIFTS) {
  s.test(`bug 1 / R1b: a Say gift is a gift and limited to one warming a day: ${JSON.stringify(lines[0])} three times`, async h => {
    const page = await h.open();
    await quickStart(page, { kinds: [] });
    await hollisAlone(page, 0);
    const out = [];
    for (const t of lines) out.push(await sayToHollis(page, t, { goldDelta: -20, attitudeChanges: [{ npcId: 'npc_hollis', delta: 5 }] }));
    assert.deepEqual(out.map(x => x.gift), ['npc_hollis', 'npc_hollis', 'npc_hollis'], 'each is a gift');
    assert.deepEqual(out.map(x => x.att), [5, 0, 0], 'only the first warms');
    assert.match(out[2].gifts, /npc_hollis.*npc_hollis.*npc_hollis/);
  });
}

s.test('bug 1: a Say purchase with no debt is no gift ("Gimme a beer", "Two beers, please"), and a gift line that buys nothing for the speaker is ("Let me buy you a drink")', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await hollisAlone(page, 0);
  const a = await sayToHollis(page, 'Gimme a beer.', { goldDelta: -3 });
  const b = await sayToHollis(page, 'Two beers, please.', { goldDelta: -6 });
  const c = await sayToHollis(page, 'Let me buy you a drink.', { goldDelta: -5, attitudeChanges: [{ npcId: 'npc_hollis', delta: 3 }] });
  assert.deepEqual([a.bought, a.gift, b.bought, b.gift], [true, null, true, null]);
  assert.deepEqual([c.bought, c.gift], [false, 'npc_hollis']);
});

// ----- review bug 2: a seizure in an obligation's own onMiss -----

s.test('bug 2: the repo man\'s $150 taken by the note\'s own onMiss is credited but never meets it: missed, no onMet, the seizure told in the Missed line and its due event', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const def = G.data.LOOSE_ENDS.debt.obligations.find(o => /title-loan/.test(o.text));
    const fill = v => JSON.parse(JSON.stringify(v).split('{npcId}').join('npc_hollis').split('{npc}').join('Hollis Byrd').split('{playerName}').join(st.player.name));
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_hollis', text: 'Pay Hollis Byrd the three hundred dollars on the title-loan note.', missText: fill(def.missText), amount: 300, dueOffset: 1, onMiss: fill(def.onMiss), onMet: fill(def.onMet) }] });
    const o = S.obligations('open').find(z => z.npcId === 'npc_hollis');
    const phones = () => st.player.inventory.filter(i => i.name === 'Prepaid phone').reduce((n, i) => n + i.qty, 0);
    S.apply(Object.assign({ goldDelta: 400 }, phones() ? {} : { itemsGained: [{ name: 'Prepaid phone', qty: 1 }] }));
    const phones0 = phones();
    S.apply({ effects: [{ op: 'obligationPaid', id: o.id, amount: 150, take: true }] });
    const att0 = S.npc('npc_hollis').attitude;
    const quiet0 = document.querySelectorAll('#feed .f-quiet').length;
    for (let i = 0; i < 6 && o.status === 'open'; i++) await G.Pipeline.rest();
    const quiets = [...document.querySelectorAll('#feed .f-quiet')].slice(quiet0).map(x => x.textContent);
    const packets = G.Api.Mock.calls.filter(c => c.method === 'narrate').map(c => c.text).join('\n');
    return { status: o.status, late: !!o.late, paid: o.paid, att: S.npc('npc_hollis').attitude - att0, mems: S.npc('npc_hollis').memories.map(m => m.text), missed: quiets.filter(t => /^Missed:/.test(t)),
      phone: phones0 - phones(), told: (/^DUE EVENT.*title-loan.*$/m.exec(packets) || [''])[0] };
  });
  assert.equal(r.status, 'missed', 'still missed');
  assert.equal(r.late, false);
  assert.equal(r.paid, 300, 'the $150 taken is credited');
  assert.equal(r.att, -10, 'only the onMiss: no onMet');
  assert.ok(!r.mems.some(t => /paid off the title-loan note/.test(t)), r.mems.join(' | '));
  assert.equal(r.missed.length, 1, 'the Missed line');
  assert.match(r.missed[0], /^Missed: .*\(due Day \d+\)\. Hollis Byrd took \$150 toward it and your Prepaid phone\.$/);
  assert.equal(r.phone, 1, 'the phone taken');
  assert.match(r.told, /title-loan/, 'the collector\'s due event is told');
});

s.test('bug 2: tickObligations returns every one it marked missed; with { detail } what each onMiss took', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    S.apply({ goldDelta: 100, effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_hollis', text: 'Pay Hollis.', amount: 50, dueOffset: 0, onMiss: [{ op: 'obligationPaid', id: '{obligationId}', amount: 50, take: true }] },
      { op: 'addObligation', kind: 'promise', npcId: 'npc_royce', text: 'Keep your word to Royce.', dueOffset: 0 }] });
    const ids = S.obligations('open').map(o => o.id);
    const out = S.tickObligations(st.time.day + 1, { detail: true });
    return { ids, out, statuses: S.obligations().map(o => o.status), paid: S.obligations()[0].paid };
  });
  assert.deepEqual(r.out.map(x => x.id).sort(), r.ids.slice().sort());
  assert.deepEqual(r.statuses, ['missed', 'missed'], 'paid in full by its own onMiss, still missed');
  assert.equal(r.paid, 50);
  const hollis = r.out.find(x => /hollis/.test(x.id));
  assert.deepEqual([hollis.gold, hollis.items], [50, []]);
});

// ----- review bugs 3 and 4: who is a person -----

s.test('bug 3: a run before what only a thing does is soft ("Red Seal is cheap", "plays on the radio", "costs $4", "tastes like"); before what a person does it is hard; "by" makes a maker only after a work ("something by Patsy Cline")', async h => {
  const page = await h.open();
  await quickStart(page);
  const hard = ['Earl Hux plays pool in the back.', 'Darnell Hux sells bait at the landing.', 'Earl Hux was playing cards with Royce.', 'Earl Hux tastes the coffee and frowns.', 'Earl Hux costs the town money.',
    'You stand by Earl Hux at the bar.', 'Royce stands by Earl Hux.', 'The place was given to Royce by Earl Hux.', 'A letter by Earl Hux sits on the desk.', 'He was beaten by Earl Hux.'];
  const soft = ['Red Seal is cheap here.', 'Conway Twitty plays on the radio.', 'Merle Haggard is on the jukebox.', 'Red Seal costs $4 here.', 'Blue Bell tastes like summer.', 'The jukebox plays something by Patsy Cline.', 'He hums a song by Conway Twitty.'];
  assert.deepEqual(await nameVerdicts(page, hard), hard.map(() => 'HARD'), hard.join(' | '));
  assert.deepEqual(await nameVerdicts(page, soft), soft.map(() => 'soft'), soft.join(' | '));
});

s.test('bug 4: what "it", "this", "that" or a side of a thing says is no person ("It says Happy Birthday", "The front says", "The back of the card says"); a person saying it still marks the name', async h => {
  const page = await h.open();
  await quickStart(page);
  const soft = ['It says Happy Birthday.', 'The front says Happy Birthday.', 'The back of the card says Happy Birthday.', 'Someone wrote on the wall, and it says Earl Hux.', 'That says Grade A.', 'The cover says Peach Festival.'];
  const hard = ['The woman at the register says Darnell skipped town.', 'Royce finally says Darnell took it.', 'The man at the back says Darnell left.'];
  assert.deepEqual(await nameVerdicts(page, soft), soft.map(() => 'soft'), soft.join(' | '));
  assert.deepEqual(await nameVerdicts(page, hard), hard.map(() => 'HARD'), hard.join(' | '));
});

// ----- review bug 5, playtest R4 and R5: weapons -----

s.test('bug 5 / R5: Colt 45 is malt liquor (a can, a six-pack, a forty), Colt .45 a gun; Taurus a gun only with a model; common ammunition names are ammunition; spent shells and a disposable razor are none; a Taser is a gun', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const T = Game.Town, P = Game.Pipeline;
    const names = ['Colt 45', 'Can of Colt 45', 'Six-pack of Colt 45', 'A forty of Colt 45', 'Colt .45', 'Colt 1911', 'Colt 45 revolver', 'Taurus', 'Old Taurus', 'Ford Taurus', 'Taurus 856', 'Taurus .38',
      '9mm rounds', '.38 rounds', 'Box of .38 rounds', '.45 rounds', 'Box of buckshot', 'Hollow points', 'Rounds of 9mm', 'Box of 9mm', 'Spent shells', 'Empty shotgun shells', 'Disposable razor', 'Straight razor', 'Taser', 'Stun gun', 'Used shotgun'];
    const kinds = {};
    for (const n of names) { const w = T.weaponOf(n); kinds[n] = w ? w.kind : null; }
    return { kinds, bar: T.plausible('a six-pack of Colt 45', 'bar').plausible, station: T.plausible('a can of Colt 45', 'gas').plausible, carried: P.carriedAs('Six-pack of Colt 45', 'gun') };
  });
  assert.deepEqual(r.kinds, {
    'Colt 45': null, 'Can of Colt 45': null, 'Six-pack of Colt 45': null, 'A forty of Colt 45': null, 'Colt .45': 'gun', 'Colt 1911': 'gun', 'Colt 45 revolver': 'gun', Taurus: null, 'Old Taurus': null, 'Ford Taurus': null, 'Taurus 856': 'gun', 'Taurus .38': 'gun',
    '9mm rounds': 'ammo', '.38 rounds': 'ammo', 'Box of .38 rounds': 'ammo', '.45 rounds': 'ammo', 'Box of buckshot': 'ammo', 'Hollow points': 'ammo', 'Rounds of 9mm': 'ammo', 'Box of 9mm': 'ammo', 'Spent shells': null, 'Empty shotgun shells': null, 'Disposable razor': null, 'Straight razor': 'razor', Taser: 'gun', 'Stun gun': 'gun', 'Used shotgun': 'gun'
  });
  assert.equal(r.bar, true, 'a six-pack of Colt 45 at the bar');
  assert.equal(r.station, true, 'a can of Colt 45 at the station');
  assert.equal(r.carried, false, 'no gun');
});

s.test('R4 / bug 5: an arrest keeps a maker\'s capitals ("the Smith & Wesson"), lowers a plain word ("the folding knife"), and leaves the Colt 45 six-pack', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State;
    S.apply({ itemsGained: [{ name: 'Smith & Wesson', qty: 1 }, { name: 'Folding knife', qty: 1 }, { name: 'Six-pack of Colt 45', qty: 1 }, { name: 'Box of .38 rounds', qty: 1 }] });
    const plan = G.World.arrestPlan();
    return { text: plan.text, weapons: plan.weapons, things: ['Colt Python', 'Glock 19', 'Folding knife', 'the Remington 870'].map(x => G.World.theThing(x)) };
  });
  assert.match(r.text, /the Smith & Wesson/);
  assert.match(r.text, /the folding knife/);
  assert.deepEqual(r.weapons.slice().sort(), ['Box of .38 rounds', 'Folding knife', 'Smith & Wesson']);
  assert.deepEqual(r.things, ['the Colt Python', 'the Glock 19', 'the folding knife', 'the Remington 870']);
});

// ----- review bug 6, playtest R6 and the /cheat risks: a Resolved line waits for its news -----

s.test('bug 6 / R6: the council resolving a thread while the player is elsewhere prints no Resolved line and grants nothing until its news is told (the next morning, after "Overnight in town")', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, P = G.Pipeline, st = G.state;
    S.apply({ setTime: { day: 6, phase: 'afternoon', shorts: 2, late: false }, playerLocationId: 'loc_pittmans' });
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    const title = S.thread('thr_police_vote').title;
    const p0 = st.player.progression.length;
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1';
    M.queue('parse', { actionType: 'search', summary: 'Looks through the shelves', targets: [], needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await P.submit('I look through the shelves for a while');
    const t = S.thread('thr_police_vote');
    const evening = { phase: st.time.phase, status: t.status, now: S.threadNow(t, 'status'), held: t.rewardHeld || null, gained: st.player.progression.length - p0,
      feed: [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => x.textContent) };
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1';
    await P.rest();
    const morning = { gained: st.player.progression.length - p0, held: S.thread('thr_police_vote').rewardHeld || null, feed: [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => x.textContent) };
    return { title, evening, morning };
  });
  assert.equal(r.evening.phase, 'evening');
  // Changed by design (wave 7): the status the player is shown waits for the news too; the council has settled it.
  assert.equal(r.evening.status, 'open');
  assert.equal(r.evening.now, 'resolved');
  assert.equal(r.evening.held, 'evt_council_meeting', 'held for the meeting\'s news');
  assert.equal(r.evening.gained, 0, 'no gain yet');
  assert.ok(!r.evening.feed.some(t => /^Resolved: /.test(t)), r.evening.feed.join(' | '));
  assert.equal(r.morning.gained, 1, 'earned once told');
  assert.equal(r.morning.held, null);
  const over = r.morning.feed.findIndex(t => /^Overnight in town: .*council/.test(t));
  const res = r.morning.feed.findIndex(t => t.startsWith(`Resolved: ${r.title}.`));
  assert.ok(over >= 0 && res > over, 'the news, then its Resolved line: ' + r.morning.feed.join(' | '));
});

s.test('bug 6 / R6 risk: /cheat time onto the meeting at Town Hall prints no Resolved line at the cheat; it follows the narration of the meeting', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, P = G.Pipeline;
    S.apply({ playerLocationId: 'loc_town_hall', threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1';
    await P.submit('/cheat time evening 6');
    const cheat = [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => x.textContent);
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1';
    M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await P.submit('I look around');
    const turn = [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => [x.className, x.textContent]);
    return { cheat, turn };
  });
  assert.ok(!r.cheat.some(t => /^Resolved: /.test(t)), r.cheat.join(' | '));
  const narr = r.turn.findIndex(([c]) => /f-narr/.test(c));
  const res = r.turn.findIndex(([, t]) => /^Resolved: /.test(t));
  assert.ok(narr >= 0 && res > narr, 'the meeting narrated, then its Resolved line: ' + r.turn.map(x => x[1].slice(0, 40)).join(' | '));
});

s.test('R6 / /cheat risk: an ending whose narration fails holds its Resolved lines; they follow its narration when it is told; after /undo of the ending and its turn, the next telling prints them again', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, P = G.Pipeline;
    S.apply({ effects: [{ op: 'setFlag', key: 'bridgeReportVoid', value: true }, { op: 'setFlag', key: 'policeKept', value: true }], eventsFired: ['evt_council_meeting'] });
    const feedNow = () => [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => [x.className, x.textContent]);
    const mark = () => { for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1'; };
    const settle = async () => { await P.whenIdle(); await new Promise(res => setTimeout(res, 150)); await P.whenIdle(); };
    const look = async t => { M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' }); M.queue('bookkeep', {}); await P.submit(t); await settle(); };
    const heldNow = () => Game.state.threads.filter(t => t.rewardHeld === 'ending').length;
    await P.submit('/cheat time morning 21');
    const held = heldNow();
    mark();
    M.queue('narrate', {});
    M.queue('narrate', { error: { type: 'invalid_request_error' } });
    await look('I look around');
    const failed = { feed: feedNow(), seen: Game.state.news.filter(n => n.epilogue).map(n => n.seen), held: heldNow() };
    mark();
    await look('I look around again');
    const told = { feed: feedNow(), held: heldNow() };
    await P.submit('/undo');
    await settle();
    const undone = { held: heldNow(), seen: Game.state.news.filter(n => n.epilogue).map(n => n.seen) };
    mark();
    await look('I look around once more');
    return { held, failed, told, undone, again: feedNow() };
  });
  assert.ok(r.held >= 1, 'the ending\'s threads hold their reward');
  assert.deepEqual(r.failed.seen, [false], 'the ending is still untold');
  assert.equal(r.failed.held, r.held);
  assert.ok(!r.failed.feed.some(([, t]) => /^Resolved: /.test(t)), r.failed.feed.map(x => x[1].slice(0, 50)).join(' | '));
  const order = feed => feed.map(([c, t]) => (/^Resolved: /.test(t) ? 'R' : /^This is one ending/.test(t) ? 'E' : /f-narr/.test(c) ? 'N' : null)).filter(Boolean).join('');
  assert.match(order(r.told.feed), /N+R+E$/, 'narration, Resolved lines, the closing line: ' + order(r.told.feed));
  assert.equal(r.told.held, 0);
  assert.equal(r.undone.held, r.held, '/undo holds them again');
  assert.deepEqual(r.undone.seen, [false]);
  assert.match(order(r.again), /N+R+E$/, 'told again after the undo: ' + order(r.again));
});

// ----- the review's other risks and its dead code -----

s.test('risk: a theft from a place or a thing while its owner is away still rolls Stealth ("the cash from Hollis\'s register"); a pickpocket of someone not here rolls nothing; ctx.noRoll is gone', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, P = G.Pipeline;
    let ok = false;
    for (let i = 0; i < 8 && !ok; i++) { ok = !S.npcsAt('loc_byrds_pawn').some(n => n.id === 'npc_hollis') && !S.isClosed(S.loc('loc_byrds_pawn')); if (!ok) S.apply({ advanceTime: 'long' }); }
    S.apply({ playerLocationId: 'loc_byrds_pawn' });
    const steal = async (text) => {
      M.queue('parse', { actionType: 'steal', summary: text, targets: ['npc_hollis'], needsRoll: true, difficulty: 'normal', stat: 'stealth', timeCost: 'instant' });
      M.queue('bookkeep', {});
      await P.submit(text);
      return !!P.lastTurn.roll;
    };
    return { away: ok, register: await steal("I take the cash from Hollis's register"), pocket: await steal("I pick Hollis's pocket") };
  });
  assert.equal(r.away, true);
  assert.equal(r.register, true, 'a theft from his register rolls');
  assert.equal(r.pocket, false, 'his pocket is not here');
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /\bnoRoll\b/);
});

s.test('risk: when the chief was not about on the second rough night, the third morning says so ("third morning running"), and his memory counts the nights', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state, P = G.Pipeline;
    const police = st.npcs.filter(n => (n.tags || []).includes('police') || /\b(police|officer)\b/i.test(n.role || ''));
    const night = async () => { S.apply({ setTime: { day: st.time.day, phase: 'night', shorts: 0, late: false }, playerLocationId: 'loc_town_hall' }); await P.rest(); return ((M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '').split('\n').find(l => /^DUE EVENT/.test(l)) || ''; };
    const one = await night();
    const was = police.map(n => n.status);
    police.forEach(n => { n.status = 'arrested'; });
    const two = await night();
    police.forEach((n, i) => { n.status = was[i]; });
    const three = await night();
    return { one, two, three, count: st.flags.roughNights, mem: S.npc('npc_marcus').memories.map(m => m.text + ' [' + (m.act || '') + ']') };
  });
  assert.doesNotMatch(r.two, /move along|fine/, 'nobody came the second morning');
  assert.equal(r.count, 3);
  assert.match(r.three, /for the third morning running and tells you to move along/);
  assert.doesNotMatch(r.three, /second morning/);
  assert.ok(r.mem.some(t => /three nights running and told them to move along \[own\]/.test(t)), r.mem.join(' | '));
});

s.test('risk: a failed ask said to everyone refuses to settle the obligation of the one owed among them, not only the first person present', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, P = G.Pipeline, st = G.state;
    const here = st.player.locationId;
    const others = st.npcs.filter(n => n.status === 'free' && n.alive !== false && !S.npcsAt(here).includes(n)).slice(0, 2);
    S.apply({ visits: others.map(n => ({ npcId: n.id, locationId: here })), npcKnownToPlayer: others.map(n => n.id) });
    const present = S.npcsAt(here).map(n => n.id);
    const owed = present[present.length - 1];
    S.apply({ effects: [{ op: 'addObligation', kind: 'promise', npcId: owed, text: 'Keep your word.', dueOffset: 3 }] });
    const o = S.obligations('open').find(x => x.npcId === owed);
    P.forceNextRoll(1);
    M.queue('parse', { actionType: 'persuade', summary: 'Asks to be let off', targets: present.slice(), needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    M.queue('bookkeep', { obligationsSettled: [o.id] });
    await P.submit('Let me off the hook, all of you.', { mode: 'say', to: 'everyone' });
    return { first: present[0], owed, asked: P.lastTurn.ctx.rollNpcId, success: P.lastTurn.roll && P.lastTurn.roll.success, status: o.status };
  });
  assert.notEqual(r.first, r.owed, 'the one owed is not the first present');
  assert.equal(r.success, false);
  assert.equal(r.asked, r.owed, 'the roll counts against the one owed');
  assert.equal(r.status, 'open', 'nothing settled with them');
});

// ----- the round-5 visual QA: the /cheat row -----

s.test('QA: the /cheat row in the / list is short ("Cheat: redo the last roll, or set the clock"); /help keeps the long form', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => ({ row: Game.Commands.LIST.find(c => c.name === '/cheat'), help: Game.Commands.helpText().split('\n').find(l => l.startsWith('/cheat')) }));
  assert.equal(r.row.desc, 'Cheat: redo the last roll, or set the clock');
  assert.equal(r.row.args, '[outcome or time <phase> [day]]');
  // Changed by design in wave 10: /cheat cards wins the next hand.
  assert.equal(r.help, '/cheat [outcome or time <phase> [day]]: Cheat: redo the last roll (success, partial, fail, crit, fumble or 1-20), win your next hand at cards (cards), or set the clock (forward only)');
});

// ----- playtest R2, R8 and the design note: /cheat time -----

s.test('R2: /cheat time tells the town\'s seeds it passed as dated "Meanwhile in town, Day N" lines in day order, before the meeting\'s line; they are no due events after it; the player\'s own come in day order; a passed due day is missed', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, P = G.Pipeline, st = G.state;
    S.apply({ playerLocationId: 'loc_pittmans', effects: [{ op: 'addObligation', kind: 'promise', npcId: 'npc_royce', text: 'Keep your word to Royce Pittman.', dueOffset: 2 }] });
    const o = S.obligations('open').find(x => x.npcId === 'npc_royce');
    const town = st.seeds.filter(sd => sd.trigger.type === 'day' && sd.trigger.value <= 6 && G.World.townSeed(sd)).map(sd => sd.id);
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1';
    await P.submit('/cheat time morning 7');
    const quiets = [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => x.textContent);
    return { town, quiets, due: st.dueEvents.map(d => [d.seedId, d.firedDay]), status: o.status, seen: st.news.filter(n => n.eventId === 'evt_council_meeting').map(n => n.seen) };
  });
  assert.ok(r.town.length >= 3, 'town seeds before the meeting: ' + r.town);
  const days = r.quiets.map(t => (/^Meanwhile in town, Day (\d+): /.exec(t) || [])[1]).filter(Boolean).map(Number);
  assert.ok(days.length >= 3, r.quiets.join(' | '));
  assert.deepEqual(days, days.slice().sort((a, b) => a - b), 'in day order');
  const meeting = r.quiets.findIndex(t => /^Meanwhile in town, Day 6: .*council/i.test(t));
  const agenda = r.quiets.findIndex(t => /agenda/i.test(t));
  assert.ok(agenda >= 0 && meeting > agenda, 'the agenda before the meeting: ' + r.quiets.join(' | '));
  assert.deepEqual(r.due.filter(([id]) => r.town.includes(id)), [], 'no town seed waits as a due event');
  assert.deepEqual(r.due.map(d => d[1]), r.due.map(d => d[1]).slice().sort((a, b) => a - b), 'due events in day order: ' + JSON.stringify(r.due));
  assert.equal(r.status, 'missed', 'its day passed');
  assert.ok(r.quiets.some(t => /^Missed: Keep your word to Royce Pittman \(due Day 3\)\.$/.test(t)), r.quiets.join(' | '));
  assert.deepEqual(r.seen, [true]);
});

s.test('R8: /cheat time never goes back; a forward jump ends conditions by the landing day; a ban a seed passed counts from the day it fired', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, P = G.Pipeline, st = G.state;
    S.apply({ setTime: { day: 3, phase: 'morning', shorts: 0, late: false } });
    const back = await P.submit('/cheat time morning 1');
    const notice = [...document.querySelectorAll('#feed .f-notice')].pop().textContent;
    const day = st.time.day;
    S.apply({ effects: [{ op: 'addCondition', name: 'Stiff', effect: '-1 might', days: 2 }, { op: 'plantSeed', seed: { id: 'seed_grudge_w6', cause: 'Grudge test', effect: 'Loretta Gaddis puts your name on the list by the register.', trigger: { type: 'day', value: 9 }, fired: false, hidden: true, origin: { kind: 'grudge', npcId: 'npc_loretta' }, effects: [{ op: 'banFrom', locationId: 'loc_low_water', days: 5, byNpcId: 'npc_loretta' }] } }] });
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w6 = '1';
    await P.submit('/cheat time morning 11');
    const quiets = [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w6 !== '1').map(x => x.textContent);
    return { back: back.reason, notice, day, conds: st.player.conditions.map(c => c.name), quiets, ban: (st.bans || []).find(b => b.locationId === 'loc_low_water') || null };
  });
  assert.equal(r.back, 'backwards');
  assert.match(r.notice, /^The clock only goes forward/);
  assert.equal(r.day, 3);
  assert.ok(!r.conds.includes('Stiff'), 'the condition ran out on the way');
  assert.ok(r.quiets.some(t => /^Condition over: Stiff/.test(t)), r.quiets.join(' | '));
  assert.ok(r.ban, 'the ban holds');
  assert.equal(r.ban.untilDay, 14, 'day 9 plus five days, not the landing day plus five');
});

s.test('design: after /cheat time the enemy\'s follow-up comes days after its first beat is told, not minutes after', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['enemy'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, P = G.Pipeline, st = G.state;
    const le = st.player.looseEnds[0];
    const first = S.seed(le.seedId).trigger.value;
    await P.submit('/cheat time morning 15');
    const fu = S.seed(`${le.seedId}_due`);
    return { first, beat: S.seed(le.seedId).fired, due: st.dueEvents.map(d => d.seedId), fu: fu ? { fired: fu.fired, day: fu.trigger.value } : null };
  });
  assert.equal(r.beat, true);
  assert.ok(r.due.length >= 1);
  assert.ok(r.fu, 'the follow-up is planted');
  assert.equal(r.fu.fired, false);
  assert.ok(r.fu.day >= 15 + 3 && r.fu.day <= 15 + 5, 'three to five days after the jump: ' + r.fu.day);
});

s.test('design: the chief lets it go after seven clear nights: the next time he finds the player sleeping rough is a warning again, not a fine', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state, P = G.Pipeline;
    const night = async () => { S.apply({ setTime: { day: st.time.day, phase: 'night', shorts: 0, late: false }, playerLocationId: 'loc_town_hall' }); await P.rest(); return ((M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '').split('\n').find(l => /^DUE EVENT/.test(l)) || ''; };
    await night(); const warned = await night();
    S.apply({ setTime: { day: st.time.day + 8, phase: 'morning', shorts: 0, late: false } });
    const gold0 = st.player.gold;
    await night(); const again = await night();
    return { warned, again, fined: gold0 - st.player.gold, movedOn: st.flags.movedOn, forgiven: G.World.ROUGH_FORGIVEN };
  });
  assert.equal(r.forgiven, 7);
  assert.match(r.warned, /tells you to move along/);
  assert.match(r.again, /second morning running and tells you to move along/, 'a warning again');
  assert.equal(r.fined, 0);
  assert.equal(r.movedOn, 1);
});

// ----- playtest R3 and the design note: grudges -----

s.test('R3: what someone did to the player (act "own": the enemy\'s beating, the repo man\'s seizure, the chief\'s cell) grows no grudge and is no kind of offence', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, W = G.World, D = G.data;
    const own = JSON.stringify([D.LOOSE_ENDS.enemy.followUp, D.LOOSE_ENDS.debt.obligations, D.LOOSE_ENDS.secret]).match(/"act":"own"/g) || [];
    const n = S.npc('npc_boyd') || G.state.npcs.find(x => x.status === 'free' && x.id !== 'npc_marcus');
    S.apply({ effects: [{ op: 'addMemory', npcId: n.id, text: `Put ${G.state.player.name} against a wall and hit them twice.`, weight: 3, act: 'own' }] });
    const m = n.memories[n.memories.length - 1];
    const fresh = W.freshMemory(n, 3);
    G.World.arrestPlayer({ told: true });
    const chief = S.npc('npc_marcus').memories.slice(-1)[0];
    const bad = S.apply({ effects: [{ op: 'addMemory', npcId: n.id, text: 'x', weight: 1, act: 'nonsense' }] }).rejected.length;
    return { own: own.length, act: m.act, kind: W.memoryKind(m), fresh: fresh ? fresh.text : null, chief: chief.act, bad };
  });
  assert.ok(r.own >= 5, 'content marks them: ' + r.own);
  assert.equal(r.act, 'own');
  assert.equal(r.kind, null);
  assert.ok(!r.fresh || !/against a wall/.test(r.fresh), 'no grudge grows from it');
  assert.equal(r.chief, 'own', 'the chief\'s cell');
  assert.equal(r.bad, 1, 'act is one of the known kinds');
});

s.test('design: a grudge for an assault reports the assault, never a theft ("hanging around where things went missing" answers a theft only)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, W = G.World, st = G.state;
    const T = G.data.GRUDGE_TEMPLATES;
    const theftIdx = T.findIndex(t => /things went missing/.test(t.effect));
    const n = st.npcs.find(x => x.status === 'free' && !(x.tags || []).includes('police') && !(x.tags || []).includes('tough') && x.id !== 'npc_marcus');
    const picks = [];
    for (let i = 0; i < 12; i++) {
      n.memories = [{ turn: 0, day: st.time.day, text: `${st.player.name} punched me in the mouth ${i}`, weight: 3, act: 'attack' }];
      const sd = W.plantFeeling(n, 'grudge', n.memories[0], st.time.day);
      if (sd) { picks.push(sd.origin.template); S.apply({ seedsFired: [sd.id] }); }
    }
    return { theftIdx, about: T[theftIdx].about, picks, assault: T.map((t, i) => (Array.isArray(t.about) && t.about.includes('violence') ? i : -1)).filter(i => i >= 0), texts: picks.map(i => T[i].effect) };
  });
  assert.deepEqual(r.about, ['theft']);
  assert.ok(r.assault.length >= 1, 'a template that reports the assault');
  assert.ok(r.picks.length >= 6, 'grudges planted: ' + r.picks);
  assert.ok(!r.picks.includes(r.theftIdx), 'never the theft accusation: ' + r.texts.join(' | '));
});

// ----- playtest R7: what the feed needs to rebuild in the order it was shown -----

s.test('R7: a log entry keeps the time its input was given when the narration is told in another, and quiet lines may carry their time and place in the turn ({ text, day, phase, at })', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    await G.Pipeline.submit('/wait night');
    const e = st.log[st.log.length - 1];
    S.apply({ logUpdate: { notes: ['plain line', { text: 'after the divider', day: st.time.day, phase: st.time.phase, at: 'after' }, { text: 'before the narration', at: 'before' }, { text: '' }, { nope: 1 }] } });
    return { from: e.from || null, at: [e.day, e.phase], notes: st.log[st.log.length - 1].notes.slice(-3), phase: st.time.phase, day: st.time.day };
  });
  assert.ok(r.from, 'the input\'s time');
  assert.notDeepEqual([r.from.day, r.from.phase], r.at);
  assert.deepEqual(r.notes, ['plain line', { text: 'after the divider', day: r.day, phase: r.phase, at: 'after' }, { text: 'before the narration', at: 'before' }]);
});

// ----- playtest R9: prose -----

s.test('R9: the rough-night fine with little or no cash says so plainly, without "again,"; TIME PASSED says "Day N"; the roll line uses one minus sign', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state, P = G.Pipeline;
    const night = async () => { S.apply({ setTime: { day: st.time.day, phase: 'night', shorts: 0, late: false }, playerLocationId: 'loc_town_hall' }); await P.rest(); const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || ''; return { due: pk.split('\n').find(l => /^DUE EVENT/.test(l)) || '', time: pk.split('\n').find(l => /^TIME PASSED/.test(l)) || '' }; };
    await night(); await night();
    S.apply({ goldDelta: -st.player.gold + 10 });
    const some = await night();
    S.apply({ goldDelta: -st.player.gold });
    const none = await night();
    const line = G.Dice.formatLine({ stat: 'might', d20: 1, statValue: -1, modifier: -1, total: -1, target: 12, tier: 'failure' });
    return { some, none, line };
  });
  assert.match(r.some.due, /writes you a \$25 fine for sleeping in public and takes what you have, \$10/);
  assert.match(r.none.due, /writes you a \$25 fine for sleeping in public, but you have nothing to pay it with\./);
  assert.doesNotMatch(r.some.due + r.none.due, /again,|which you have nothing to pay/);
  assert.match(r.none.time, /until morning, Day \d+/);
  assert.match(r.line, /^Might 1 − 2 = −1 vs 12/);
});

// ----- playtest demo D10 to D14 (the mock) -----

s.test('D10 to D14: the demo bets on "I put $50 in" and "I ante up $20" at the bar; asking what something would bring is a question (no give, and a thumb drive is no car); a due event is never cut inside a sentence; "I shove Loretta" is an attack; "I take the bus to Calder" is refused as out of town', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock, st = G.state;
    const bar = st.locations.find(l => l.type === 'bar' && !l.away) || st.locations.find(l => l.type === 'tavern');
    const base = { mode: 'action', present: [{ id: 'npc_loretta', name: 'Loretta Gaddis', role: 'owner' }], knownNpcs: [{ id: 'npc_hollis', name: 'Hollis Byrd', role: 'pawnbroker' }], inventory: [{ id: 'item_thumb_drive', name: 'Thumb drive', qty: 1 }], location: { id: bar.id, name: bar.name, type: bar.type }, exits: [], knownLocations: [], away: st.locations.filter(l => l.away).map(l => ({ id: l.id, name: l.name })) };
    const parse = async input => (await M.parse(Object.assign({}, base, { input }))).result;
    return {
      put: (await parse('I put $50 in')).actionType, ante: (await parse('I ante up $20')).actionType,
      ask: await parse('I ask Hollis what he would give me for a thumb drive'),
      shove: (await parse('I shove Loretta')).actionType,
      bus: await parse('I take the bus to Calder'), calder: (st.locations.find(l => l.away && /Calder/.test(l.name)) || {}).id || null
    };
  });
  assert.equal(r.put, 'gamble');
  assert.equal(r.ante, 'gamble');
  assert.equal(r.ask.actionType, 'talk');
  assert.equal(r.ask.missingItem, null, 'no car needed');
  assert.equal(r.shove, 'attack');
  assert.equal(r.bus.actionType, 'move');
  assert.equal(r.bus.destinationId, r.calder);
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(src, /due = due\.map\(\(t, i\) => \{ const c = t\.split/, 'no clause cutting');
});

s.run();
