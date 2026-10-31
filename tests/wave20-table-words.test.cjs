'use strict';
/* Wave 20: a verification QA of the wave 19 betting table confirmed its
   fixes and found eleven leftovers (N1-N11), fixed as decided. Covered
   here: "shove" and "push" are an attack only with a person as the verb's
   own object, and a push of the chips is all in (N1); the table-stakes ask
   reads the words and the scene: talk about a limit is no ask, the ask
   words alone at the dealer's table are (N2, N3), in the engine and in the
   demo's parser alike; a typed amount the table changed that ended the
   hand says what it went in as under the result, and its note stays on
   the status line until the narration arrives (N4); "all in, Curtis", "I
   bet $20, Curtis", "all in at the table" sit down (N5); the terms are
   told at the next hand after a Stopped one (N6); "Prof.", "Sgt." and the
   like end no sentence (N7); "deal me in for $50, no limit" deals at a
   table already no limit (N8); "another hand" plays at the last stake
   here today (N9); "I'm calling", "I see your bet", "draw a card", and the
   amount field's minus and cents (N10); at 320×568 with Large text the
   hint is one short line and the Win (cheat) stays in view with the
   cards, the buttons and the amount (N11). Mock mode.
   Run with: node tests/wave20-table-words.test.cjs */
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, presetCards, LAPTOP } = require('./helpers.cjs');

const s = suite('wave20-table-words');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const PHONE_CTX = { reducedMotion: 'reduce', isMobile: true, hasTouch: true };
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
const gold = page => page.evaluate(() => Game.state.player.gold);
const statusLine = page => page.textContent('#turn-status-text');
const addCash = (page, n) => page.evaluate(d => Game.State.apply({ goldDelta: d }), n);
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
const parse = (page, lines, opts) => page.evaluate(async ([ls, o]) => {
  const out = {};
  for (const t of ls) { const p = await Game.Api.parse(Game.Pipeline.parsePacket(t, o || { mode: 'action' })); out[t] = { type: p.actionType, targets: p.targets || [], time: p.timeCost }; }
  return out;
}, [lines, opts || null]);
/* The card game's place on an open day at a phase its dealer sits at (the evening first); next: a later day than now. */
const atTable = (page, phase, next) => page.evaluate(([want, later]) => {
  const G = Game, S = G.State, st = G.state;
  const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
  const PH = ['morning', 'afternoon', 'evening', 'night'];
  for (const ph of want ? [want] : ['evening', 'night', 'afternoon']) {
    let d = st.time.day + (later || PH.indexOf(ph) < PH.indexOf(st.time.phase) ? 1 : 0);
    while (S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
    const here = S.npcsAt(l.id);
    const dealer = G.Pipeline.dealerOf(here.map(n => n.id));
    if (dealer) return { loc: l.id, phase: ph, day: d, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0], people: G.Pipeline.cardPeople(here.map(n => n.id), dealer).map(n => ({ id: n.id, name: n.name })), here: here.map(n => ({ id: n.id, name: n.name })) };
  }
  return null;
}, [phase || null, !!next]);
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
const deal = (page, holes, board, seats) => page.evaluate(([h, b, st]) => { Game.Pipeline.hooks.cardsDeal = { holes: h, board: b, seats: st || [] }; }, [holes, board, seats || []]);
const dealDraw = (page, d) => page.evaluate(x => { Game.Pipeline.hooks.cardsDeal = x; }, d);
const tableNow = page => page.evaluate(() => {
  const t = [...document.querySelectorAll('#feed .f-cards')].pop();
  if (!t) return null;
  const q = sel => (t.querySelector(sel) ? t.querySelector(sel).textContent : null);
  const acts = t.querySelector('.cards-acts');
  return {
    open: t.classList.contains('open'), head: q('.cards-head'), pot: q('.cards-pot'),
    acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent), actsTitle: acts ? acts.getAttribute('title') : null, actsLabel: acts ? acts.getAttribute('aria-label') : null,
    field: t.querySelector('.cards-amt') ? t.querySelector('.cards-amt').value : null, note: q('.cards-amt-note'),
    hint: q('.cards-hint'), result: q('.cards-result'), why: q('.cards-why')
  };
});
const waitTable = page => page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
const press = async (page, label) => {
  await page.click(`#feed .f-cards.open .cards-acts button:text-is("${label}")`);
  await waitTable(page);
};
const typeLine = async (page, words) => {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(40);
  await waitTable(page);
};
const handOpen = page => page.evaluate(() => Game.Pipeline.handOpen);
const movesNow = async page => {
  const held = await page.evaluate(() => { const x = Game.Storage.heldHand(); return x && Array.isArray(x.moves) ? x.moves : null; });
  if (held && await handOpen(page)) return held;
  await idle(page);
  return ((await lastEntry(page)).cards || {}).moves || [];
};
const reloadGame = async page => {
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
};
const flags = (page, id) => page.evaluate(d => ({ nl: Game.state.flags[`cardsNoLimit.${d}`] || null, asked: Game.state.flags[`cardsAsked.${d}`] || null, att: Game.State.npc(d).attitude }), id);
const rolls = page => page.locator('#feed .f-roll').count();

/* The two lists the decision gave (QA N2, N3). */
const TALK = ["There's no limit to what I'd do for her.", 'Is there no limit to your greed, Curtis?', "I'm after bigger game than this town.", 'I bet he plays without a limit', 'I order a whiskey from Loretta, no limit on the whiskey tonight',
  'Does your greed know no limit, Curtis?', 'Curtis, your greed has no limit.', "He'll play without a limit, that one."];
const TALK_SAID = ['Your greed has no limit.'];
const ASKS = ['no limit', 'table stakes', 'take the limit off', 'lift the limit', 'raise the stakes', 'a bigger game', 'play for real', 'can we bet what we like', "let's take the limit off", 'Curtis, table stakes?', 'Can we play no limit?'];

// ----- N7, N10, N1: words, pure -----

s.test('N7 "Prof.", "Sgt.", "Rev.", "Jr.", "Sr.", "Lt.", "Capt.", "Gen.", "Col." and "Hon." end no sentence; N10 typed with a hand open "I\'m calling", "I see your bet", "I see it", "I\'ll see that" call (check with nothing to call) and "draw a card" is one card; N1 a push or a shove of the chips, the money or the stack is all in; N2 the engine\'s word rule (stakesWords) reads the talk list as talk and the ask list as asks', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(([talk, said, asks]) => {
    const P = Game.Pipeline;
    const facing = { options: ['call', 'raise', 'fold'], ask: { toCall: 4, level: 4, put: 0, left: 19, pot: 6, minTo: 8, maxTo: 19, unit: 4, raises: 1, limit: false }, dealerName: 'Curtis Pruett' };
    const open = { options: ['check', 'bet'], ask: { toCall: 0, level: 0, put: 0, left: 19, pot: 2, minTo: 4, maxTo: 19, unit: 4, raises: 0, limit: false }, dealerName: 'Curtis Pruett' };
    const draw = { options: ['draw'] };
    const act = (t, x) => { const b = P.typedBet(t, x); return b ? (b.choice ? b.choice.act : b.draw ? `draw ${b.draw}` : 'other') : null; };
    return {
      first: ['Prof. Haverty came. He left.', 'Sgt. Bell asked. Nobody answered.', 'Rev. Hale prayed. Then he left.', 'Wade Purvis Jr. came by. He left.', 'Ortiz Sr. and Lt. Dawes met. Then they left.', 'Capt. Ames, Gen. Ross, Col. Platt and Hon. Judge Lamb came. They left.', 'Main St. Then he left.'].map(P.sentenceOne),
      calls: ["I'm calling", 'I see your bet', 'I see it', "I'll see that", 'im calling', 'I see your raise'].map(t => [act(t, facing), act(t, open)]),
      draws: ['draw a card', 'draw a new card', 'I draw one', 'draw two cards'].map(t => act(t, draw)),
      push: ['I push my chips toward Curtis', 'I shove all my chips at Curtis', 'push all my money in', 'shove my stack in', 'push it all in', 'I push all in'].map(t => act(t, open)),
      notPush: ['I push the pot to Curtis', 'I shove Loretta', 'push past Curtis'].map(t => act(t, open)),
      talk: talk.concat(said).map(t => P.stakesWords(t)),
      asks: asks.map(t => P.stakesWords(t)),
      more: ['Is there a no-limit game?', 'No limit, please.', 'Take the limit off.', 'Raise the stakes.', 'Lift your limit.', 'I know my limit.', 'The limit is too low.'].map(t => P.stakesWords(t))
    };
  }, [TALK, TALK_SAID, ASKS]);
  assert.deepEqual(r.first, ['Prof. Haverty came.', 'Sgt. Bell asked.', 'Rev. Hale prayed.', 'Wade Purvis Jr. came by.', 'Ortiz Sr. and Lt. Dawes met.', 'Capt. Ames, Gen. Ross, Col. Platt and Hon. Judge Lamb came.', 'Main St. Then he left.']);
  assert.deepEqual(r.calls, Array(6).fill(['call', 'check']));
  assert.deepEqual(r.draws, ['draw 1', 'draw 1', 'draw 1', 'draw 2']);
  assert.deepEqual(r.push, Array(6).fill('allin'));
  assert.deepEqual(r.notPush, [null, null, null]);
  assert.deepEqual(r.talk, Array(TALK.length + TALK_SAID.length).fill(false), 'the talk list');
  assert.deepEqual(r.asks, Array(ASKS.length).fill(true), 'the ask list');
  // "Lift your limit." and "I know my limit." have a possessive limit: talk; "The limit is too low." asks nothing.
  assert.deepEqual(r.more, [true, true, true, true, false, false, false]);
});

// ----- N2, N3: the ask in the game -----

s.test('N2 talk about a limit at the card table is no ask (the first report\'s five lines, "Does your greed know no limit, Curtis?", "Curtis, your greed has no limit.", "He\'ll play without a limit, that one." and "Your greed has no limit." said to Curtis): no roll, no TABLE STAKES line, no flag, his warmth kept; N3 the ask words alone are an ask at his table with him there, in Do mode with no one else as the target and in Say mode to him ("no limit", "table stakes", "take the limit off", …, "Can we play no limit?"): the demo\'s parser reads each as one aimed at him, the engine answers each, no hand is dealt and no time passes', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  assert.equal(spot.first, 'Curtis', 'the lists name Curtis, the dealer');
  const f0 = await flags(page, spot.dealer);
  // The demo's parser: no talk line is a persuade aimed at him; every ask is.
  const p = await parse(page, TALK.concat(ASKS));
  for (const t of TALK) assert.ok(p[t].type !== 'persuade', `${t}: ${JSON.stringify(p[t])}`);
  for (const t of ASKS) assert.deepEqual([p[t].type, p[t].targets, p[t].time], ['persuade', [spot.dealer], 'instant'], t);
  for (const t of TALK) {
    const n0 = await rolls(page);
    await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
    await sendText(page, t);
    assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', t);
    assert.equal(await rolls(page), n0, `${t}: no roll`);
    assert.deepEqual(await flags(page, spot.dealer), f0, `${t}: no flag, no warmth lost`);
    await page.evaluate(() => Game.Pipeline.forceNextRoll(null));
  }
  // Said to him in Say mode: talk.
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await page.evaluate(id => Game.Pipeline.submit('Your greed has no limit.', { mode: 'say', to: id }), spot.dealer);
  await idle(page);
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', 'Your greed has no limit. (said to him)');
  assert.deepEqual(await flags(page, spot.dealer), f0);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(null));
  // The asks, in Do mode with nobody else as the target: the first is weighed (a no on a 2), the rest are answered without a roll.
  const shorts0 = await page.evaluate(() => Game.state.time.shorts);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(2));
  await sendText(page, ASKS[0]);
  assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /the roll failed/, ASKS[0]);
  assert.equal((await flags(page, spot.dealer)).asked, spot.day);
  for (const t of ASKS.slice(1)) {
    await sendText(page, t);
    assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /said no to it earlier today/, t);
    assert.ok(!(await lastEntry(page)).cards, `${t}: no hand dealt`);
  }
  assert.equal(await page.evaluate(() => Game.state.time.shorts), shorts0, 'an ask is said at the table: no time passes');
  // In Say mode to him, the same words: an ask too.
  for (const t of ASKS) {
    await page.evaluate(([w, id]) => Game.Pipeline.submit(w, { mode: 'say', to: id }), [t, spot.dealer]);
    await idle(page);
    assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /said no to it earlier today/, `${t} (said to him)`);
  }
  // Aimed at someone else: never his.
  const loretta = spot.here.find(n => /Loretta/.test(n.name));
  await page.evaluate(id => Game.Pipeline.submit('No limit tonight?', { mode: 'say', to: id }), loretta.id);
  await idle(page);
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', 'said to Loretta');
  assert.notEqual((await parse(page, ['Loretta, no limit tonight?']))['Loretta, no limit tonight?'].type, 'persuade', 'Loretta named instead of him');
  await sendText(page, 'Loretta, no limit tonight?');
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', 'Loretta named: hers');
});

// ----- N1: shove and push -----

s.test('N1 "shove" or "push" is an attack only with a person as the verb\'s own object ("I shove Loretta", "push him", "shove the old man"): "I push my chips toward Curtis", "I shove all my chips at Curtis", "I push the pot to Curtis", "shove, Curtis" and "I push past Curtis to the bar" hurt nobody; a push of the chips right after a hand is the notice, and with a hand open it is all in (held to the limit at a limit table)', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const att = () => page.evaluate(id => Game.State.npc(id).attitude, spot.dealer);
  const harmless = ['I push my chips toward Curtis', 'I shove all my chips at Curtis', 'I push the pot to Curtis', 'shove, Curtis', 'I push past Curtis to the bar'];
  const p = await parse(page, harmless.concat(['I shove Loretta', 'push him', 'shove the old man']));
  for (const t of harmless) assert.notEqual(p[t].type, 'attack', `${t}: ${JSON.stringify(p[t])}`);
  for (const t of ['I shove Loretta', 'push him', 'shove the old man']) assert.equal(p[t].type, 'attack', t);
  const a0 = await att();
  for (const t of harmless) {
    await sendText(page, t);
    const e = await lastEntry(page);
    assert.ok(!e.roll || e.roll.stat !== 'might', `${t}: no Might roll`);
    assert.ok(!/won't forget that|staggers back/.test(e.narration), `${t}: ${e.narration}`);
  }
  assert.equal(await att(), a0, 'Curtis keeps his warmth');
  // Right after a hand: the notice, the words kept, no turn.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'deal me in');
  const n0 = await page.evaluate(() => Game.state.log.length);
  for (const t of ['I push my chips toward Curtis', 'shove all my chips in']) {
    await page.fill('#cmd', t);
    await page.press('#cmd', 'Enter');
    await idle(page);
    assert.equal(await lastNotice(page), "No hand is on the table. 'Another hand' or 'deal me in for $20' starts one.", t);
    assert.equal(await page.inputValue('#cmd'), t);
    assert.equal(await page.evaluate(() => Game.state.log.length), n0, `${t}: no turn`);
  }
  await page.fill('#cmd', '');
  // With a hand open: all in (table stakes), held to the limit at the house game.
  await addCash(page, 100);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['7c', '2d']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'I push my chips toward Curtis');
  assert.equal((await movesNow(page))[0], 'bet:19', 'all in ($19 behind the ante)');
  await idle(page);
  assert.equal(await att(), a0, 'no fight');
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await deal(page, [['Ah', 'Ad'], ['7c', '2d']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'I shove all my chips at Curtis');
  assert.match(await statusLine(page), /^Four-dollar limit: Check or Bet \$4\. /);
  assert.equal(await page.inputValue('#cmd'), 'I shove all my chips at Curtis', 'the words stay');
  await page.fill('#cmd', '');
  await page.click('#send');
  await idle(page);
});

// ----- N5: sitting down with the dealer or the table named -----

s.test('N5 right after a hand, "all in, Curtis", "Curtis, all in", "I bet $20, Curtis", "all in at the table" and "all in on this hand" sit down as "I go all in, Curtis" does (the dealer, the table or the hand named): a hand is dealt at the stake they name, no notice', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  const p = await parse(page, ['all in, Curtis', 'Curtis, all in', 'I bet $20, Curtis', 'all in at the table', 'all in on this hand', 'I go all in, Curtis', 'shove, Curtis']);
  for (const t of ['all in, Curtis', 'Curtis, all in', 'I bet $20, Curtis', 'all in at the table', 'all in on this hand', 'I go all in, Curtis']) assert.equal(p[t].type, 'gamble', t);
  assert.notEqual(p['shove, Curtis'].type, 'gamble', '"shove, Curtis" no more than "shove"');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'deal me in');
  for (const [t, all] of [['all in, Curtis', true], ['I bet $20, Curtis', false], ['all in at the table', true], ['Curtis, all in', true], ['all in on this hand', true]]) {
    const g0 = await gold(page);
    const n0 = await page.evaluate(() => Game.state.log.length);
    await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
    await sendText(page, t);
    const e = await lastEntry(page);
    assert.equal(await page.evaluate(() => Game.state.log.length), n0 + 1, `${t}: a turn`);
    assert.ok(e.cards, `${t}: a hand was dealt`);
    assert.equal(e.input, t);
    assert.equal(e.cards.stake, all ? g0 : 20, `${t}: the stake`);
    assert.notEqual(await lastNotice(page), "No hand is on the table. 'Another hand' or 'deal me in for $20' starts one.", t);
  }
});

// ----- N6: the terms after a Stopped hand -----

s.test('N6 a hand Stopped at a new stake is told in a plain line, so its terms were never said: the next hand at that stake tells them (OUTCOME and the demo), and the hand after that does not', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await addCash(page, 200);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $20 at cards');
  // $37, Stopped: a plain line, no terms told.
  await startHand(page, 'I bet $37 at cards');
  await page.click('#send');
  await idle(page);
  let e = await lastEntry(page);
  assert.deepEqual([e.cards.stake, e.cards.stopped], [37, true]);
  assert.ok(!/to sit/.test(e.narration), e.narration);
  const terms = `Tester sits down at ${spot.dealerName}'s thirty-seven-dollar table ($1 ante, $7 limit)`;
  // The next $37 hand: the terms, in OUTCOME and in the demo before the hand.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $37 at cards');
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.ok(out.includes(terms), out);
  e = await lastEntry(page);
  assert.ok(e.narration.startsWith(`"Thirty-seven to sit, a dollar ante, seven-dollar limit," ${spot.dealerName} says as you sit down.`), e.narration);
  // And once told, not again.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $37 at cards');
  assert.ok(!/sits down at/.test(line(await lastCall(page, 'narrate'), 'OUTCOME: ')));
  // A hand the narrator failed to tell is passed over too (its record says it was told plainly).
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: 'api_error' }));
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $50 at cards');
  e = await lastEntry(page);
  assert.deepEqual([e.cards.stake, e.cards.plain], [50, true], 'told in a plain line');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $50 at cards');
  assert.ok(line(await lastCall(page, 'narrate'), 'OUTCOME: ').includes(`'s fifty-dollar table ($2 ante, $10 limit)`));
  assert.equal((await lastEntry(page)).cards.plain, undefined, 'a narrated hand has no plain mark');
});

// ----- N8, N9: dealing at no limit, "another hand" -----

s.test('N8 "deal me in for $50, no limit" deals the $50 hand at a table already no limit today (on a limit day it is the request, as before); N9 "another hand" plays at the stake of the last hand at this table today, as the notice pairs them ("deal me in for $37"), and at the usual $20 with no hand here today', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  let spot = await atTable(page, 'evening');
  await addCash(page, 300);
  await presetCards(page, { game: 'holdem', seats: [] });
  // A limit day: the request, no hand.
  await page.evaluate(() => Game.Pipeline.forceNextRoll(20));
  await sendText(page, 'deal me in for $50, no limit');
  assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /the roll succeeded/);
  assert.ok(!(await lastEntry(page)).cards, 'the request: no hand');
  assert.equal((await flags(page, spot.dealer)).nl, spot.day);
  // Now no limit today: the same words deal the $50 hand, at no limit.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  assert.equal((await parse(page, ['deal me in for $50, no limit']))['deal me in for $50, no limit'].type, 'gamble');
  await sendText(page, 'deal me in for $50, no limit');
  let c = (await lastEntry(page)).cards;
  assert.ok(c, 'a hand');
  assert.deepEqual([c.stake, c.structure], [50, 'nolimit']);
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, "I bet $20 at no-limit hold'em");
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c && c.stake, c && c.structure], [20, 'nolimit'], 'a bet at no-limit hold\'em deals too');
  // N9: after a $37 hand the notice and "another hand" agree.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $37 at cards');
  await page.fill('#cmd', 'all in');
  await page.press('#cmd', 'Enter');
  await idle(page);
  assert.equal(await lastNotice(page), "No hand is on the table. 'Another hand' or 'deal me in for $37' starts one.");
  await page.fill('#cmd', '');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'another hand');
  assert.equal((await lastEntry(page)).cards.stake, 37, 'another hand: the last stake');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I look around');
  await sendText(page, 'one more hand');
  assert.equal((await lastEntry(page)).cards.stake, 37, 'the last hand here today, another turn between');
  // A stake named still wins.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'another hand, $25');
  assert.equal((await lastEntry(page)).cards.stake, 25);
  // The next day, no hand yet: the usual $20; and a limit day again, so the words are the request once more.
  spot = await atTable(page, 'evening', true);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'another hand');
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.stake, c.structure], [20, 'limit'], 'no hand here today: the usual');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(2));
  await sendText(page, 'deal me in for $50, no limit');
  assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /the roll failed/);
  assert.ok(!(await lastEntry(page)).cards);
});

// ----- N4: what a typed amount went in as -----

s.test('N4 a typed amount the table changed that ends the hand ("bet 70" with $95 behind: all in $95) leaves a quiet line under the result ("Your $70 went in as all in $95: that would have left you less than a bet."), kept on the record through a reload; the status line keeps the note through the narrator\'s wait and gives way when the narration arrives', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await addCash(page, 400);
  const NOTE = 'Bets go in twenties: $70 rounds up to $80. That would leave you less than a bet, so it is all in $95.';
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  // The narrator takes a while: the note stays on the status line, never "Writing…", until the text comes.
  await page.evaluate(() => {
    window.__status = [];
    const el = document.querySelector('#turn-status-text');
    new MutationObserver(() => { const n = document.querySelector('#feed .f-narr:last-of-type'); window.__status.push([el.textContent, !!(n && n.textContent.trim())]); }).observe(el, { childList: true, characterData: true, subtree: true });
    Game.Api.Mock.queue('narrate', { delay: 700 });
  });
  await page.fill('#cmd', 'bet 70');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.handOpen);
  await page.waitForTimeout(350);
  assert.equal(await statusLine(page), NOTE, 'the note through the wait');
  await idle(page);
  const seen = await page.evaluate(() => window.__status);
  const writingEarly = seen.filter(([t, narr]) => t === 'Writing…' && !narr);
  assert.deepEqual(writingEarly, [], JSON.stringify(seen));
  const c = (await lastEntry(page)).cards;
  assert.deepEqual([c.moves[0], c.player.in, c.amountWhy], ['bet:95', 100, 'Your $70 went in as all in $95: that would have left you less than a bet.']);
  let t = await tableNow(page);
  assert.equal(t.why, 'Your $70 went in as all in $95: that would have left you less than a bet.');
  await reloadGame(page);
  t = await tableNow(page);
  assert.equal(t.why, 'Your $70 went in as all in $95: that would have left you less than a bet.', 'after a reload');
  // More than the stack.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  await typeLine(page, 'bet 300');
  await idle(page);
  assert.equal((await tableNow(page)).why, "Your $300 went in as all in $95: that's more than you have.");
  // A move the table took as typed says nothing; nor does a button.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['7c', '2d']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  await typeLine(page, 'bet 40');
  if (await handOpen(page)) { await page.click('#send'); }
  await idle(page);
  assert.equal((await tableNow(page)).why, null);
  assert.equal((await lastEntry(page)).cards.amountWhy, undefined);
});

// ----- N10: the amount field, the typed forms in play -----

s.test('N10 the amount field: a minus is the least, said ("Bets are at least $20."), cents are cut to whole dollars, said ("Whole dollars at this table: $60."), and Enter first puts the amount in the field; typed with a hand open "I\'m calling" calls and "draw a card" draws one when one card is not held (else the Draw hint)', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await addCash(page, 300);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['Qs', 'Jd']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  const after = async () => { const x = await tableNow(page); return [x.field, x.acts[1], x.note]; };
  const typed = async v => { await page.fill('#feed .f-cards.open .cards-amt', v); return after(); };
  assert.deepEqual(await typed('-20'), ['-20', 'Bet $20', 'Bets are at least $20.']);
  assert.deepEqual(await typed('60.5'), ['60.5', 'Bet $60', 'Whole dollars at this table: $60.']);
  assert.deepEqual(await typed('50.5'), ['50.5', 'Bet $60', 'Whole dollars at this table: $50. Bets go in twenties: $50 rounds up to $60.']);
  assert.deepEqual(await typed('60.00'), ['60.00', 'Bet $60', '']);
  // Enter on the minus: the field says $20, nothing is bet; the next Enter bets it.
  await typed('-40');
  await page.press('#feed .f-cards.open .cards-amt', 'Enter');
  await page.waitForTimeout(60);
  assert.deepEqual(await after(), ['20', 'Bet $20', 'Bets are at least $20.']);
  assert.deepEqual(await page.evaluate(() => Game.Storage.heldHand().moves), [], 'nothing bet yet');
  await page.press('#feed .f-cards.open .cards-amt', 'Enter');
  await waitTable(page);
  assert.deepEqual((await movesNow(page)).slice(0, 1), ['bet:20']);
  if (await handOpen(page)) await page.click('#send');
  await idle(page);
  // "I'm calling" facing his bet: a call.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await deal(page, [['7c', '2d'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Check');
  const t = await tableNow(page);
  assert.ok(t.acts[0].startsWith('Call'), `he bets into the check: ${t.acts.join('|')}`);
  await typeLine(page, "I'm calling");
  assert.deepEqual((await movesNow(page)).slice(0, 2), ['check', 'call']);
  if (await handOpen(page)) await page.click('#send');
  await idle(page);
  // "draw a card": Draw when one card is not held, else the hint.
  await presetCards(page, { game: 'draw', seats: [], structure: 'limit' });
  await dealDraw(page, { player: ['Kc', 'Kd', 'Kh', '7s', '2c'], dealer: ['Ac', 'Ad', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] });
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'draw a card');
  assert.equal(await statusLine(page), 'Tap the cards you keep, then Draw (it says how many).');
  assert.equal(await page.inputValue('#cmd'), 'draw a card');
  for (const i of [0, 1, 2, 3]) await page.click(`#feed .f-cards.open .cards-you button.card[data-i="${i}"]`);
  await page.fill('#cmd', 'draw a card');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'drawbet' || !Game.Pipeline.handOpen);
  const held = await page.evaluate(() => { const x = Game.Storage.heldHand(); return x && x.moves; });
  assert.equal(held && held[0], 'hold:0123', JSON.stringify(held));
  if (await handOpen(page)) await page.click('#send');
  await idle(page);
});

// ----- N11: a short screen -----

s.test('N11 at 320×568 with Large text and five at the table (no limit, and the draw\'s betting round): the hint is one short line, the choice words and the Win (cheat), so on the first deal and after each press the player\'s cards, the buttons, the amount and the Win (cheat) are wholly in view; the terms and the Stop price are the button row\'s title and name and on the status line, one line; nothing scrolls sideways; at 320×640 the hint is the long one', async h => {
  const geo = page => page.evaluate(() => {
    const f = document.querySelector('#feed-scroll');
    const box = f.getBoundingClientRect();
    const t = document.querySelector('#feed .f-cards.open');
    if (!t) return null;
    const at = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top - box.top), bottom: Math.round(r.bottom - box.top), inside: r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 }; };
    const q = sel => t.querySelector(sel);
    const st = document.querySelector('#turn-status-text').getBoundingClientRect();
    return { story: Math.round(box.height), youCards: at(q('.cards-you .cards-row')), acts: [...t.querySelectorAll('.cards-acts button')].map(at), size: at(q('.cards-size')), win: at(q('.cards-win')), hint: at(q('.cards-hint')), statusH: Math.round(st.height) };
  });
  for (const game of ['holdem', 'draw']) {
    const page = await open(h, { width: 320, height: 568 }, { contextOptions: PHONE_CTX });
    await quickStart(page);
    await page.evaluate(() => { Game.Storage.saveSettings({ textSize: 'L' }); Game.UI.applyDisplay(); });
    await fast(page);
    const spot = await atTable(page, 'evening');
    const three = spot.people.slice(0, 3).map(p => p.id);
    assert.equal(three.length, 3, 'five at the table');
    await addCash(page, 200);
    for (let i = 0; i < 2; i++) await sendText(page, 'I look around');
    await presetCards(page, { game, seats: three, structure: 'nolimit' });
    if (game === 'holdem') await deal(page, [['Ah', 'Kh'], ['7c', '2d'], ['8h', '3s'], ['9d', '4c'], ['Tc', '5h']], ['2s', '6d', 'Jc', 'Qd', 'Ks'], three);
    await startHand(page, 'I bet $100 at cards');
    let presses = 0;
    while (await handOpen(page) && presses < 4) {
      await page.waitForTimeout(60);
      const g = await geo(page);
      const t = await tableNow(page);
      const tag = `${game} ${presses ? `after press ${presses}` : 'first deal'}: ${JSON.stringify(g)} ${JSON.stringify(t)}`;
      assert.ok(g.youCards.inside, `the player's cards: ${tag}`);
      assert.ok(g.acts.every(x => x.inside), `the buttons: ${tag}`);
      if (g.size) assert.ok(g.size.inside, `the amount: ${tag}`);
      assert.ok(g.win.inside, `the Win (cheat): ${tag}`);
      assert.ok(g.hint.bottom - g.hint.top <= 52, `the hint one line: ${tag}`);
      assert.match(t.hint, /^(?:Check or bet\.|Check or all in\.|Check\.|Call, raise or fold\.|Call, all in or fold\.|Call or fold\.|Hold, then Draw\.) Win \(cheat\)$/, tag);
      const inn = /you're in for (\$\d+)/.exec(t.pot)[1];
      const terms = presses === 0 ? 'A hundred to sit, a five-dollar ante, no limit. ' : '';
      assert.equal(t.actsTitle, `${terms}Stop folds the hand (−${inn}).`, tag);
      assert.equal(t.actsLabel, t.actsTitle, tag);
      const st = await statusLine(page);
      assert.equal(st, `Your hand · Stop folds it (−${inn})${presses === 0 ? ' · $100 to sit, $5 ante, no limit' : ''}`, tag);
      assert.ok(g.statusH <= 24, `the status line one line: ${tag}`);
      assert.deepEqual(await overflowReport(page, 320), [], tag);
      const b = t.acts[0];
      if (game === 'draw' && presses === 0) await page.click('#feed .f-cards.open .cards-draw');
      else await press(page, b);
      await waitTable(page);
      presses++;
    }
    assert.ok(presses >= 2, `${game}: the first deal and a press (${presses})`);
    if (await handOpen(page)) await page.click('#send');
    await idle(page);
  }
  // 320×640 is no short screen: the hint as before, no title on the buttons, "Your hand".
  const page = await open(h, { width: 320, height: 640 }, { contextOptions: PHONE_CTX });
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await startHand(page, 'I bet $20 at cards');
  const t = await tableNow(page);
  assert.equal(t.hint, 'Twenty to sit, a dollar ante, no limit. Check, or bet $4, $8, $12 up to all in ($19). Stop folds the hand (−$1). Win (cheat)');
  assert.deepEqual([t.actsTitle, t.actsLabel], [null, null]);
  assert.equal(await statusLine(page), 'Your hand');
  // Turned to a short screen with the hand open: the hint follows.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForFunction(() => /^Check or bet\. Win \(cheat\)$/.test(document.querySelector('#feed .f-cards.open .cards-hint').textContent));
  assert.equal((await tableNow(page)).actsTitle, 'Twenty to sit, a dollar ante, no limit. Stop folds the hand (−$1).');
  await page.click('#send');
  await idle(page);
});

s.run();
