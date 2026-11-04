'use strict';
/* Wave 19: a QA player played 150 hands of the wave 18 betting table and
   found the money exact everywhere; the defects were in words, notices,
   layout and telling (D1-D17), fixed as decided. Covered here: an ask for
   table stakes only when the words are plainly about the game's stakes
   and aimed at the dealer (D1); "shove" and "push" never an attack
   without a person to shove, and betting words typed just after a hand a
   notice, not a new hand (D2, D12); the fold notices name what was lost
   (D3); the status line follows every move at once (D4); the first deal
   and every press keep the player's cards and the controls in view, on a
   laptop and on a 320px phone at every text size (D5, D6); the amount
   control says each change and Enter commits only what the field and the
   button show (D7); a fold told once (D8); the new typed forms, "draw 3"
   at the draw (D9); the dealer's pushbacks kept through a reload (D10);
   the limit refusal names the button (D11); the terms told when the stake
   or the structure changes at this dealer, before the hand in the demo
   (D13, D14); "a hundred-dollar ante" (D15); "Dr." is no sentence end
   (D16); one validMove (D17). Mock mode.
   Run with: node tests/wave19-betting-fixes.test.cjs */
const fs = require('fs');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, presetCards, fastClear: fast, line, idle, GAME_PATH, GAME_URL, LAPTOP } = require('./helpers.cjs');

const s = suite('wave19-betting-fixes');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const PHONE_CTX = { reducedMotion: 'reduce', isMobile: true, hasTouch: true };
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const gold = page => page.evaluate(() => Game.state.player.gold);
const statusLine = page => page.textContent('#turn-status-text');
const addCash = (page, n) => page.evaluate(d => Game.State.apply({ goldDelta: d }), n);
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
/* The card game's place on an open day, at a phase its dealer and card people sit at it (the evening first). */
const atTable = (page, phase) => page.evaluate(want => {
  const G = Game, S = G.State, st = G.state;
  const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
  const PH = ['morning', 'afternoon', 'evening', 'night'];
  for (const ph of want ? [want] : ['evening', 'night', 'afternoon']) {
    let d = st.time.day + (PH.indexOf(ph) < PH.indexOf(st.time.phase) ? 1 : 0);
    while (S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
    const here = S.npcsAt(l.id);
    const dealer = G.Pipeline.dealerOf(here.map(n => n.id));
    if (dealer) return { loc: l.id, phase: ph, day: d, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0], people: G.Pipeline.cardPeople(here.map(n => n.id), dealer).map(n => ({ id: n.id, name: n.name })), here: here.map(n => ({ id: n.id, name: n.name })) };
  }
  return null;
}, phase || null);
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
  return {
    open: t.classList.contains('open'), head: q('.cards-head'), pot: q('.cards-pot'),
    acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent),
    field: t.querySelector('.cards-amt') ? t.querySelector('.cards-amt').value : null, note: q('.cards-amt-note'), said: q('.cards-said'),
    hint: q('.cards-hint'), result: q('.cards-result'), seats: [...t.querySelectorAll('.cards-side')].map(el => ({ seat: el.dataset.seat, status: el.querySelector('.cards-status').textContent }))
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
/* The player's moves so far: the stored hand's while it is there, else the finished hand's on the record. */
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
/* Where the parts of the open table are in the story area: [top, bottom] from the story's top, and whether each is wholly inside. */
const tableGeo = page => page.evaluate(() => {
  const f = document.querySelector('#feed-scroll');
  const box = f.getBoundingClientRect();
  const t = document.querySelector('#feed .f-cards.open');
  if (!t) return null;
  const at = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top - box.top), bottom: Math.round(r.bottom - box.top), inside: r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 }; };
  const q = sel => t.querySelector(sel);
  return { story: Math.round(box.height), table: at(t), head: at(q('.cards-head')), board: at(q('.cards-board')), boardCard: at(q('.cards-board .card')), youCards: at(q('.cards-you .cards-row')), youCard: at(q('.cards-you .card')), acts: [...t.querySelectorAll('.cards-acts button')].map(at), size: at(q('.cards-size')) };
});

// ----- D15, D16, D17: words and the source, pure -----

s.test('D15 the house rules in words at big stakes: "a hundred-dollar ante", never "a a" ($2000-$3999); D16 the first sentence of a text never ends at "Dr.", "Mr.", "Mrs.", "Ms.", "St." or an initial, and the demo tells news about Dr. Sayle whole; D17 one validMove in the source', async h => {
  const src = fs.readFileSync(GAME_PATH, 'utf8');
  assert.equal(src.split('function validMove(').length - 1, 1, 'validMove is defined once');
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(() => {
    const P = Game.Pipeline;
    const words = [];
    for (let S = 2000; S < 4000; S += 37) words.push(P.rulesWords(S, 'limit'));
    return {
      words, w2000: P.rulesWords(2000, 'limit'), w2000nl: P.rulesWords(2000, 'nolimit'), w100: P.rulesWords(100, 'limit'),
      first: ['Carter brought Dr. Sayle up to Sturdivant House yesterday, and Vada threw them out. She drove off.', 'Mr. Sturdivant asked. Nobody answered.', 'Mrs. Pittman and Ms. Fairley met at St. Jude. Then they left.', 'J. R. Coker came by. He left.', 'Is that so? Yes.'].map(P.sentenceOne)
    };
  });
  assert.equal(r.w2000, '$2000 to sit, a hundred-dollar ante, four hundred-dollar limit.');
  assert.equal(r.w2000nl, '$2000 to sit, a hundred-dollar ante, no limit.');
  assert.equal(r.w100, 'A hundred to sit, a five-dollar ante, twenty-dollar limit.');
  assert.ok(r.words.every(w => !/\ba a\b/.test(w) && /, an? [a-z]/.test(w)), r.words.filter(w => /\ba a\b/.test(w)).join(' | '));
  assert.deepEqual(r.first, ['Carter brought Dr. Sayle up to Sturdivant House yesterday, and Vada threw them out.', 'Mr. Sturdivant asked.', 'Mrs. Pittman and Ms. Fairley met at St. Jude.', 'J. R. Coker came by.', 'Is that so?']);
  // The demo brings up the day's news with "Dr." in it whole (the clause split of freshNews).
  const spot = await atTable(page);
  await page.evaluate(() => Game.State.apply({ effects: [{ op: 'addNews', text: 'Carter Sturdivant brought Dr. Sayle up to Sturdivant House yesterday, and Vada threw them both out.', public: true }] }));
  // Whoever has no rumour to pass on brings it up (the rumours go first, one a person).
  let narr = '';
  for (const n of spot.here) {
    await sendText(page, `I talk to ${n.name}`);
    narr = (await lastEntry(page)).narration;
    assert.ok(!/brought Dr\.(?! Sayle)/.test(narr), narr);
    if (/brings up the news/.test(narr)) break;
  }
  assert.match(narr, /brings up the news: carter Sturdivant brought Dr\. Sayle up to Sturdivant House yesterday\./, narr);
});

// ----- D1: the ask for table stakes -----

s.test('D1 ordinary talk at the card table is no ask for table stakes ("There\'s no limit to what I\'d do for her.", "Is there no limit to your greed, Curtis?", "I\'m after bigger game than this town.", "I bet he plays without a limit", a whiskey from Loretta "no limit on the whiskey"): no roll, no TABLE STAKES line, no flag, his warmth kept, the whiskey bought; a line aimed at someone else by the parser or in Say mode is not one either; Say mode to the dealer, his name, the game or table named, or a request still asks', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const loretta = spot.here.find(n => /Loretta/.test(n.name));
  assert.ok(loretta, 'Loretta tends the bar in the evening');
  const flags = () => page.evaluate(d => ({ nl: Game.state.flags[`cardsNoLimit.${d}`] || null, asked: Game.state.flags[`cardsAsked.${d}`] || null, att: Game.State.npc(d).attitude }), spot.dealer);
  const rolls = () => page.locator('#feed .f-roll').count();
  const f0 = await flags();
  const parsed = await page.evaluate(async lines => {
    const out = {};
    for (const t of lines) { const p = await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' })); out[t] = `${p.actionType}:${(p.targets || []).join(',')}`; }
    return out;
  }, ["There's no limit to what I'd do for her.", 'Is there no limit to your greed, Curtis?', "I'm after bigger game than this town.", 'I bet he plays without a limit', 'I order a whiskey from Loretta, no limit on the whiskey tonight']);
  for (const [t, v] of Object.entries(parsed)) assert.ok(!v.startsWith('persuade:'), `${t}: ${v}`);
  for (const t of ["There's no limit to what I'd do for her.", 'Is there no limit to your greed, Curtis?', "I'm after bigger game than this town.", 'I bet he plays without a limit']) {
    const n0 = await rolls();
    await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
    await sendText(page, t);
    assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', t);
    assert.equal(await rolls(), n0, `${t}: no roll`);
    assert.deepEqual(await flags(), f0, `${t}: no flag, no lost warmth`);
    await page.evaluate(() => Game.Pipeline.forceNextRoll(null));
  }
  const g0 = await gold(page);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, 'I order a whiskey from Loretta, no limit on the whiskey tonight');
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '');
  assert.ok(await gold(page) < g0, 'the whiskey is bought');
  assert.deepEqual(await flags(), f0);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(null));
  // The parser aimed it at Loretta: never overridden. Say mode to Loretta: not his.
  await page.evaluate(id => Game.Api.Mock.queue('parse', { actionType: 'talk', targets: [id], needsRoll: false, stat: null, difficulty: null }), loretta.id);
  await sendText(page, 'Can we play no limit?');
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', 'the parser\'s target is Loretta');
  await page.evaluate(id => Game.Pipeline.submit('No limit tonight?', { mode: 'say', to: id }), loretta.id);
  await idle(page);
  assert.equal(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), '', 'said to Loretta');
  assert.deepEqual(await flags(), f0);
  // Asks: Say mode to him (a no, d20 2), then his name, the game named, a request: he repeats himself; no hand is dealt.
  await page.evaluate(() => Game.Pipeline.forceNextRoll(2));
  await page.evaluate(id => Game.Pipeline.submit('No limit tonight?', { mode: 'say', to: id }), spot.dealer);
  await idle(page);
  assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /the roll failed/);
  assert.equal((await flags()).asked, spot.day);
  for (const t of [`${spot.first}, take the limit off.`, 'Deal me in, no limit.', 'Can we play no limit?', 'Table stakes?', 'Bet what we like at cards?']) {
    await sendText(page, t);
    assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), /said no to it earlier today/, t);
    assert.ok(!(await lastEntry(page)).cards, `${t}: no hand dealt`);
  }
});

// ----- D2 and D12: shove, push, and betting words between hands -----

s.test('D2 "shove", "I shove", "push" with no hand open are never an attack (Loretta keeps her warmth, no Might roll); "I shove Loretta" is; D12 betting words typed just after a hand ("all in", "shove", "bet 10", "raise 30", "call", "check", "fold") are a notice, the line kept in the box, no turn and no cost; naming the game, or after another turn, they sit down as documented', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const loretta = spot.here.find(n => /Loretta/.test(n.name));
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  const att = () => page.evaluate(id => Game.State.npc(id).attitude, loretta.id);
  const a0 = await att();
  for (const t of ['shove', 'I shove', 'push', 'shove it']) {
    const p = await page.evaluate(async x => (await Game.Api.parse(Game.Pipeline.parsePacket(x, { mode: 'action' }))).actionType, t);
    assert.notEqual(p, 'attack', t);
  }
  for (const t of ['shove', 'I shove', 'push']) {
    await sendText(page, t);
    const e = await lastEntry(page);
    assert.ok(!e.roll || e.roll.stat !== 'might', `${t}: no Might roll`);
  }
  assert.equal(await att(), a0, 'Loretta untouched');
  assert.equal(await page.evaluate(async () => (await Game.Api.parse(Game.Pipeline.parsePacket('I shove Loretta', { mode: 'action' }))).actionType), 'attack', 'a person to shove');
  // A hand, folded at once.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'deal me in');
  assert.ok((await lastEntry(page)).cards, 'a hand was played');
  const n0 = await page.evaluate(() => Game.state.log.length);
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  const g0 = await gold(page);
  for (const t of ['all in', 'shove', 'bet 10', 'raise 30', 'call', 'check', 'fold', "I'm all in", 'I go all in', 'I bet $20']) {
    await page.fill('#cmd', t);
    await page.press('#cmd', 'Enter');
    await idle(page);
    assert.equal(await lastNotice(page), "No hand is on the table. 'Another hand' or 'deal me in for $20' starts one.", t);
    assert.equal(await page.inputValue('#cmd'), t, `${t}: the line stays in the box`);
    assert.deepEqual([await page.evaluate(() => Game.state.log.length), await page.evaluate(() => Game.state.meta.turn), await gold(page)], [n0, t0, g0], `${t}: no turn, no cost`);
  }
  assert.equal(await page.locator('#feed .f-cards.open').count(), 0, 'no hand dealt');
  // Naming the game: a hand (all the cash, as documented), folded.
  await page.fill('#cmd', '');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I go all in at cards');
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.stake, c.stakeNote], [g0, 'all'], 'all in at cards: the whole cash as the stake');
  // After another turn, "I bet $20" sits down.
  await sendText(page, 'I look around');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $20');
  c = (await lastEntry(page)).cards;
  assert.equal(c.stake, 20, 'after another turn a bet sits down');
  // "deal me in" right after a hand still deals.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'deal me in');
  assert.equal((await lastEntry(page)).input, 'deal me in');
  assert.ok((await lastEntry(page)).cards);
});

// ----- D3: the notices say what was lost -----

s.test('D3 Stop, a closed page and another tab fold the hand with a notice that names what was lost: "the $1 ante is gone" when only the ante went in, else "the $18 you put in is gone"', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await addCash(page, 200);
  // The ante alone.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await deal(page, [['7c', '2d'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await page.click('#send');
  await idle(page);
  assert.equal(await lastNotice(page), 'Stopped: a hand on the table is folded, and the $1 ante is gone.');
  // No limit $40: a $16 bet, then Stop.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  let g0 = await gold(page);
  await deal(page, [['7c', '2d'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $40 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '16');
  await page.click('#feed .f-cards.open .cards-acts button[data-act="bet"]');
  await waitTable(page);
  assert.ok(await handOpen(page), 'the kings answer the bet');
  await page.click('#send');
  await idle(page);
  assert.equal(await lastNotice(page), 'Stopped: a hand on the table is folded, and the $18 you put in is gone.');
  assert.equal((await tableNow(page)).result, `Stopped, so you fold: −$18 · cash $${g0 - 18}`);
  // A page closed after an $8 bet: what was put in.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['7c', '2d'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '8');
  await page.click('#feed .f-cards.open .cards-acts button[data-act="bet"]');
  await waitTable(page);
  await reloadGame(page);
  await page.waitForFunction(() => !!Game.state.log[Game.state.log.length - 1].cards);
  await idle(page);
  const c = (await lastEntry(page)).cards;
  assert.equal(c.player.in, 9);
  assert.equal(await lastNotice(page), 'The game was closed with a hand on the table, so the hand is folded and the $9 you put in is gone.');
  // Another tab: the ante.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await startHand(page, 'I bet $40 at cards');
  const b = await page.context().newPage();
  await b.goto(GAME_URL);
  await b.waitForFunction(() => window.Game && Game.App);
  await fast(b);
  await b.click('#btn-continue');
  await b.waitForSelector('#screen-game.active');
  await b.waitForFunction(() => Game.state.log[Game.state.log.length - 1].cards);
  await idle(b);
  assert.equal(await lastNotice(b), 'A hand was left open in another tab, so it is folded here and the $2 ante is gone.');
});

// ----- D4: the status line at once -----

s.test('D4 the status line follows every move at once: the dealer\'s limit line goes when a bet is played, a typed clamp\'s note shows after the move, the hand\'s nudge is read again from the new table, and the draw\'s "betting comes after the draw" goes when Draw is pressed', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'all in');
  assert.match(await statusLine(page), /^Four-dollar limit: Check or Bet \$4\. /);
  await page.fill('#cmd', '');
  await press(page, 'Bet $4');
  assert.ok(await handOpen(page), 'the kings answer');
  assert.equal(await statusLine(page), 'Your hand', 'at once, not 2.6 s later');
  // The hand's nudge, read again after a press.
  await typeLine(page, 'I look around');
  const before = await statusLine(page);
  assert.match(before, /^Your hand is on the table: /);
  const t = await tableNow(page);
  await press(page, t.acts[0]);
  if (await handOpen(page)) {
    const now = await statusLine(page);
    const t2 = await tableNow(page);
    const inn = /you're in for (\$\d+)/.exec(t2.pot)[1];
    assert.match(now, /^Your hand is on the table: /);
    assert.ok(now.includes(`(−${inn})`), `${now} names what is in now (${inn})`);
    assert.ok(t2.acts[0].startsWith('Call') ? now.includes(t2.acts[0]) : now.includes('Check or Bet'), `${now} / ${t2.acts.join('|')}`);
  }
  await page.fill('#cmd', '');
  if (await handOpen(page)) await page.click('#send');
  await idle(page);
  // A typed clamp's note shows once the move is made (table stakes).
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'bet 10');
  assert.equal(await statusLine(page), 'Bets go in fours: $10 rounds up to $12.');
  assert.equal((await movesNow(page))[0], 'bet:12');
  await page.click('#send');
  await idle(page);
  // Draw: "bet 4" before the draw, then Draw.
  await presetCards(page, { game: 'draw', seats: [], structure: 'limit' });
  await dealDraw(page, { player: ['Kc', 'Kd', '7h', '7s', '2c'], dealer: ['Ac', 'Ad', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] });
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'bet 4');
  assert.equal(await statusLine(page), 'Pick the cards to hold, then Draw: the betting comes after the draw.');
  await page.fill('#cmd', '');
  await page.click('#feed .f-cards.open .cards-draw');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'drawbet');
  assert.equal(await statusLine(page), 'Your hand');
  await page.click('#send');
  await idle(page);
});

// ----- D5: the first deal in view -----

s.test('D5 the first deal of a table taller than the story (a laptop, three seats, no limit) shows the player\'s cards, the buttons and the amount, not the head; a table that fits is shown whole, head and all', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const three = spot.people.slice(0, 3).map(p => p.id);
  assert.equal(three.length, 3);
  await addCash(page, 200);
  for (let i = 0; i < 3; i++) await sendText(page, 'I look around');
  await presetCards(page, { game: 'holdem', seats: three, structure: 'nolimit' });
  await deal(page, [['Ah', 'Kh'], ['7c', '2d'], ['8h', '3s'], ['9d', '4c'], ['Tc', '5h']], ['2s', '6d', 'Jc', 'Qd', 'Ks'], three);
  await startHand(page, 'I bet $100 at cards');
  let g = await tableGeo(page);
  assert.ok(g.table.bottom - g.table.top > g.story, `taller than the story: ${JSON.stringify(g)}`);
  assert.deepEqual([g.youCards.inside, g.acts.every(x => x.inside), g.size.inside, g.head.inside], [true, true, true, false], JSON.stringify(g));
  await page.click('#send');
  await idle(page);
  // Heads up: it fits, the whole of it.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await startHand(page, 'I bet $20 at cards');
  g = await tableGeo(page);
  assert.ok(g.table.top >= 0 && g.table.bottom <= g.story, `the whole table: ${JSON.stringify(g)}`);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cards-head', 'the head has the focus as the table appears');
  await page.click('#send');
  await idle(page);
});

// ----- D6: a 320px phone at every text size -----

s.test('D6 at 320×640 with five at the table (no limit) and Small, Medium and Large text: on the first deal and after every press the player\'s own cards, the buttons and the amount are wholly in view, the board a short scroll above (its cards smaller than the player\'s), and nothing scrolls sideways', async h => {
  for (const size of ['S', 'M', 'L']) {
    const page = await open(h, { width: 320, height: 640 }, { contextOptions: PHONE_CTX });
    await quickStart(page);
    await page.evaluate(sz => { Game.Storage.saveSettings({ textSize: sz }); Game.UI.applyDisplay(); }, size);
    await fast(page);
    const spot = await atTable(page, 'evening');
    const three = spot.people.slice(0, 3).map(p => p.id);
    await addCash(page, 200);
    for (let i = 0; i < 2; i++) await sendText(page, 'I look around');
    await presetCards(page, { game: 'holdem', seats: three, structure: 'nolimit' });
    await deal(page, [['Ah', 'Kh'], ['7c', '2d'], ['8h', '3s'], ['9d', '4c'], ['Tc', '5h']], ['2s', '6d', 'Jc', 'Qd', 'Ks'], three);
    await startHand(page, 'I bet $100 at cards');
    let presses = 0;
    while (await handOpen(page) && presses < 5) {
      await page.waitForTimeout(60);
      const g = await tableGeo(page);
      const tag = `${size} ${presses ? `after press ${presses}` : 'first deal'}: ${JSON.stringify(g)}`;
      assert.ok(g.youCards.inside, `the player's cards: ${tag}`);
      assert.ok(g.acts.every(x => x.inside), `the buttons: ${tag}`);
      if (g.size) assert.ok(g.size.inside, `the amount: ${tag}`);
      assert.ok(g.board.inside || g.board.bottom >= -(g.story * 0.5), `the board a short scroll above: ${tag}`);
      assert.ok(g.boardCard.bottom - g.boardCard.top < g.youCard.bottom - g.youCard.top, `the board's cards smaller than the player's: ${tag}`);
      assert.deepEqual(await overflowReport(page, 320), [], tag);
      const t = await tableNow(page);
      await press(page, t.acts[0]);
      presses++;
    }
    assert.ok(presses >= 3, `${size}: several presses (${presses})`);
    if (await handOpen(page)) await page.click('#send');
    await idle(page);
  }
});

// ----- D7: the amount control -----

s.test('D7 the amount control never surprises: a typed amount the table changes says each step ("Bets go in twenties: $50 rounds up to $60.", "… That would leave you less than a bet, so it is all in $95."), the button reads it, and Enter first puts it in the field (nothing bet), then bets what both show; + that comes to all in says so; ½ pot that comes to all in says so', async h => {
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
  assert.deepEqual(await typed('50'), ['50', 'Bet $60', 'Bets go in twenties: $50 rounds up to $60.']);
  assert.deepEqual(await typed('70'), ['70', 'All in $95', 'Bets go in twenties: $70 rounds up to $80. That would leave you less than a bet, so it is all in $95.']);
  assert.deepEqual(await typed('300'), ['300', 'All in $95', 'That\'s more than you have, so it is all in $95.']);
  assert.deepEqual(await typed('10'), ['10', 'Bet $20', 'The least bet is $20.']);
  // + from $60: $80 would leave $15, so all in, said.
  await typed('60');
  await page.click('#feed .f-cards.open .cards-step[data-step="1"]');
  assert.deepEqual(await after(), ['95', 'All in $95', 'That would leave you less than a bet, so it is all in $95.']);
  // Enter: a typed $50 goes in the field as $60 with its reason, nothing is bet; the next Enter bets $60.
  await typed('50');
  await page.press('#feed .f-cards.open .cards-amt', 'Enter');
  await page.waitForTimeout(60);
  assert.deepEqual(await after(), ['60', 'Bet $60', 'Bets go in twenties: $50 rounds up to $60.']);
  assert.deepEqual(await page.evaluate(() => Game.Storage.heldHand().moves), [], 'nothing bet yet');
  await page.press('#feed .f-cards.open .cards-amt', 'Enter');
  await waitTable(page);
  assert.deepEqual((await movesNow(page)).slice(0, 1), ['bet:60']);
  if (await handOpen(page)) await page.click('#send');
  await idle(page);
  // ½ pot that comes to all in: the flop pot $125 with $55 behind ($40 bets each before it, a $5 ante, three at the table).
  const r = await page.evaluate(() => [Game.Pipeline.sizeWhy({ toCall: 0, level: 0, pot: 125, minTo: 20, maxTo: 75, unit: 20 }, 'half'), Game.Pipeline.sizeWhy({ toCall: 0, level: 0, pot: 125, minTo: 20, maxTo: 75, unit: 20 }, 'pot'), Game.Pipeline.sizeWhy({ toCall: 0, level: 0, pot: 20, minTo: 20, maxTo: 75, unit: 20 }, 'half')]);
  assert.deepEqual(r, [{ to: 75, why: 'Half the pot ($60) would leave you less than a bet, so it is all in $75.' }, { to: 75, why: 'The pot ($120) is more than you have, so it is all in $75.' }, { to: 20, why: '' }]);
  // On the table: call a bet preflop so the flop pot is big, then ½ pot.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await deal(page, [['Ah', 'Ad'], ['Qs', 'Jd']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '40');
  await page.click('#feed .f-cards.open .cards-acts button[data-act="bet"]');
  await waitTable(page);
  const t = await tableNow(page);
  assert.deepEqual([await handOpen(page), t.acts, t.pot], [true, ['Check', 'Bet $20'], 'Pot $90 · you\'re in for $45 · $55 left'], 'the queen-jack called: the flop, $55 behind');
  await page.click('#feed .f-cards.open .cards-preset[data-size="half"]');
  assert.deepEqual(await after(), ['55', 'All in $55', 'Half the pot ($40) would leave you less than a bet, so it is all in $55.']);
  await page.click('#send');
  await idle(page);
});

// ----- D8: a fold told once -----

s.test('D8 a fold is told once: OUTCOME, the demo narration and the plain line each name a seat\'s fold one time (the moment that told it, or the seat\'s own line), with no "everyone folds" after the moments said so; the player\'s own fold is told with what it cost', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const two = spot.people.slice(0, 2);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  const names = [spot.dealerName].concat(two.map(x => x.name));
  // A seat's fold in a text: its name, maybe in a list of names ("Royce Pittman and Lyman Coker folded"), then folds or folded.
  const NAME = "[A-Z][a-z]+ [A-Z][a-z]+";
  const count = (text, who) => (text.match(new RegExp(`(?:${NAME}(?:,| and) )*${NAME} fold(?:s|ed)`, 'g')) || []).filter(m => m.includes(who)).length;
  // Heads up: check, then bet on the flop; the seven-deuce folds.
  await deal(page, [['Ah', 'Ad'], ['7c', '2d']], ['As', '9d', '4h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Check');
  let t = await tableNow(page);
  if (await handOpen(page) && t.acts.includes('Bet $4')) await press(page, 'Bet $4');
  while (await handOpen(page)) await press(page, (await tableNow(page)).acts[0]);
  await idle(page);
  let c = (await lastEntry(page)).cards;
  let out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  let narr = (await lastEntry(page)).narration;
  assert.equal(c.uncontested, true, 'the seven-deuce folds to the bet on the flop');
  assert.ok(out.includes(`the player bet $4 on the flop and ${spot.dealerName} folded; the player takes the $2 pot without a showdown`), out);
  assert.equal(count(out, spot.dealerName), 1, out);
  assert.ok(narr.includes(`you bet $4 on the flop and ${spot.dealerName} folded; the $2 pot is yours`), narr);
  assert.equal(count(narr, spot.dealerName), 1, narr);
  // Three at the table, everyone folds to the player's bet: each fold told once, everywhere.
  await presetCards(page, { game: 'holdem', seats: two.map(x => x.id), structure: 'limit' });
  await deal(page, [['Ah', 'Ad'], ['7c', '2d'], ['8h', '3s'], ['3c', '2h']], ['2s', '6d', 'Jc', 'Qd', '9s'], two.map(x => x.id));
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Bet $4');
  while (await handOpen(page)) await press(page, (await tableNow(page)).acts[0]);
  await idle(page);
  c = (await lastEntry(page)).cards;
  out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  narr = (await lastEntry(page)).narration;
  for (const n of names) {
    assert.ok(count(out, n) <= 1, `${n} in ${out}`);
    assert.ok(count(narr, n) <= 1, `${n} in ${narr}`);
  }
  assert.equal(c.uncontested, true, 'everyone folds to the bet');
  assert.ok(out.includes('the player bet $4 before the flop and everyone folded; the player takes the'), out);
  assert.ok(!/everyone else folded/.test(out), out);
  for (const n of names) assert.equal(count(out, n), 0, `${n}: "everyone folded" told it: ${out}`);
  assert.ok(narr.includes('you bet $4 before the flop and everyone folded; the $') && !/everyone folds to you/.test(narr), narr);
  // The plain line (the narrator fails after the hand): the moments, then the pot, not the folds again.
  await deal(page, [['Ah', 'Ad'], ['7c', '2d'], ['8h', '3s'], ['3c', '2h']], ['2s', '6d', 'Jc', 'Qd', '9s'], two.map(x => x.id));
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { error: 'api_error' }));
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Bet $4');
  while (await handOpen(page)) await press(page, (await tableNow(page)).acts[0]);
  await idle(page);
  const plain = (await lastEntry(page)).narration;
  assert.match(plain, /^You bet \$4 before the flop and everyone folded\. The hand is played: the \$\d+ pot is yours\. You win \$\d+\.$/, plain);
  // The player's own fold: told with what it cost, not as an answer to a bet too.
  const words = await page.evaluate(() => {
    const rec = { game: 'holdem', dealerId: 'npc_x', dealerName: 'Curtis Pruett', seats: [], actions: [{ seat: 'npc_x', act: 'bet', to: 8, add: 8, street: 1 }, { seat: 'player', act: 'fold', to: 0, add: 0, street: 1 }] };
    const m = Game.Pipeline.betMoments(rec, true);
    return { m: m.slice(), folds: m.folds };
  });
  assert.deepEqual(words, { m: ['Curtis Pruett bet $8 on the flop'], folds: [] });
});

// ----- D9: the new typed forms -----

s.test('D9 with a hand open: "call $8" / "call 8" (its price, else what the call is), "raise it to 30", "I\'m going all in", "I go all in", "I fold", "I check", "I call"; at the draw "draw 3" / "draw three" press Draw when that many are not held, else say how; an unknown line keeps the hand\'s nudge', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  const pure = await page.evaluate(() => {
    const P = Game.Pipeline;
    const t = { options: ['call', 'raise', 'fold'], ask: { toCall: 8, level: 8, put: 0, left: 100, pot: 20, minTo: 16, maxTo: 100, unit: 4, raises: 1, limit: false }, dealerName: 'Curtis Pruett' };
    const c = { options: ['check', 'bet'], ask: { toCall: 0, level: 0, put: 0, left: 100, pot: 20, minTo: 4, maxTo: 100, unit: 4, raises: 0, limit: false }, dealerName: 'Curtis Pruett' };
    const d = { options: ['draw', 'fold'] };
    const out = {};
    for (const w of ['call $8', 'call 8', 'call eight', 'call $4', 'raise it to 30', "I'm going all in", 'I go all in', 'I fold', 'I call', 'I check']) out[w] = P.typedBet(w, t);
    for (const w of ['I check', 'I call', 'call $8']) out[`open: ${w}`] = P.typedBet(w, c);
    for (const w of ['draw 3', 'draw three', 'I draw two', 'draw three cards', 'draw 9']) out[`draw: ${w}`] = P.typedBet(w, d);
    return out;
  });
  assert.deepEqual(pure, {
    'call $8': { choice: { act: 'call' } }, 'call 8': { choice: { act: 'call' } }, 'call eight': { choice: { act: 'call' } },
    'call $4': { say: "It's $8 to call: call $8, raise or fold." },
    // Wave 20 (QA N4): with what it went in as, for a table this move finishes.
    'raise it to 30': { choice: { act: 'raise', to: 32 }, note: 'Bets go in fours: $30 rounds up to $32.', after: 'Your raise to $30 went in as a raise to $32: bets go in fours.' },
    "I'm going all in": { choice: { act: 'allin' } }, 'I go all in': { choice: { act: 'allin' } }, 'I fold': { choice: { fold: true } }, 'I call': { choice: { act: 'call' } },
    'I check': { say: "There's a bet to you: call $8, raise or fold." },
    'open: I check': { choice: { act: 'check' } }, 'open: I call': { choice: { act: 'check' } }, 'open: call $8': { choice: { act: 'check' } },
    'draw: draw 3': { draw: 3 }, 'draw: draw three': { draw: 3 }, 'draw: I draw two': { draw: 2 }, 'draw: draw three cards': { draw: 3 }, 'draw: draw 9': null
  });
  // At the table (no limit): "raise it to 30" facing a bet, "call $N" at its price, "I'm going all in".
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await addCash(page, 200);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  await typeLine(page, 'I check');
  let t = await tableNow(page);
  assert.ok(await handOpen(page) && t.acts[0].startsWith('Call $'), `the kings bet: ${t.acts}`);
  {
    const price = Number(/\$(\d+)/.exec(t.acts[0])[1]);
    await typeLine(page, `call ${price + 1}`);
    assert.equal(await statusLine(page), `It's $${price} to call: call $${price}, raise or fold.`);
    assert.equal(await page.inputValue('#cmd'), `call ${price + 1}`, 'the line stays');
    await typeLine(page, `call $${price}`);
    assert.equal((await movesNow(page))[1], 'call');
  }
  if (await handOpen(page)) {
    await typeLine(page, "I'm going all in");
    assert.equal(await page.inputValue('#cmd'), '');
  }
  while (await handOpen(page)) await press(page, (await tableNow(page)).acts[0]);
  await idle(page);
  assert.ok((await lastEntry(page)).cards.moves.includes('allin') || (await lastEntry(page)).cards.moves.some(m => /^(?:bet|raise):/.test(m)));
  // "raise it to 60" facing his bet.
  await deal(page, [['7c', '2d'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $100 at cards');
  await typeLine(page, 'check');
  t = await tableNow(page);
  assert.ok(await handOpen(page) && t.acts[0].startsWith('Call $'), `the kings bet: ${t.acts}`);
  {
    await typeLine(page, 'raise it to 60');
    assert.equal((await movesNow(page))[1], 'raise:60');
  }
  // An unknown line keeps the hand's nudge.
  if (await handOpen(page)) {
    await typeLine(page, 'I wave at the bartender');
    assert.match(await statusLine(page), /^Your hand is on the table: /);
    assert.equal(await page.inputValue('#cmd'), 'I wave at the bartender');
    await page.fill('#cmd', '');
    await page.click('#send');
  }
  await idle(page);
  // The draw: "draw 2" with five not held says how; hold three, then "draw two" presses Draw 2.
  await presetCards(page, { game: 'draw', seats: [], structure: 'limit' });
  await dealDraw(page, { player: ['Kc', 'Kd', '7h', '7s', '2c'], dealer: ['Ac', 'Ad', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] });
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'draw 2');
  assert.equal(await statusLine(page), 'Tap the cards you keep, then Draw (it says how many).');
  assert.deepEqual([await page.inputValue('#cmd'), await page.evaluate(() => Game.Pipeline.handKind)], ['draw 2', 'draw']);
  for (const i of [0, 1, 2]) await page.click(`#feed .f-cards.open .cards-you button.card[data-i="${i}"]`);
  await typeLine(page, 'draw two');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'drawbet' || !Game.Pipeline.handOpen);
  assert.equal((await movesNow(page))[0], 'hold:012');
  assert.equal(await page.inputValue('#cmd'), '');
  while (await handOpen(page)) await press(page, (await tableNow(page)).acts[0]);
  await idle(page);
});

// ----- D10, D11: the dealer's pushbacks -----

s.test('D10 the dealer\'s pushbacks are kept on the stored hand: two refusals, a bet, a reload mid-hand, and the folded record still counts them (OUTCOME "twice"); D11 the limit refusal names the buttons ("Call $4, All in $19 or Fold") when the stack is short of a raise', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'all in');
  await typeLine(page, 'bet 20');
  assert.equal(await page.evaluate(() => Game.Storage.heldHand().pushback), 2, 'on the stored hand');
  await page.fill('#cmd', '');
  await press(page, 'Bet $4');
  assert.equal(await page.evaluate(() => Game.Storage.heldHand().pushback), 2, 'kept as the hand goes on');
  await reloadGame(page);
  await page.waitForFunction(() => !!Game.state.log[Game.state.log.length - 1].cards);
  await idle(page);
  const c = (await lastEntry(page)).cards;
  assert.deepEqual([c.closed, c.pushback], [true, 2]);
  // D11, pure: the status names the buttons as they read.
  const r = await page.evaluate(() => {
    const P = Game.Pipeline;
    const short = { options: ['call', 'raise', 'fold'], ask: { toCall: 4, level: 16, put: 4, left: 15, pot: 40, minTo: 19, maxTo: 19, unit: 4, raises: 3, limit: true }, dealerName: 'Curtis Pruett' };
    const shortBet = { options: ['check', 'bet'], ask: { toCall: 0, level: 0, put: 0, left: 3, pot: 40, minTo: 3, maxTo: 3, unit: 4, raises: 0, limit: true }, dealerName: 'Curtis Pruett' };
    const allInFacing = { options: ['call', 'fold'], ask: { toCall: 8, level: 12, put: 4, left: 30, pot: 40, minTo: 0, maxTo: 30, unit: 4, raises: 1, limit: false }, dealerName: 'Curtis Pruett' };
    return [P.typedBet('raise to 40', short).say, P.typedBet('raise to 40', shortBet), P.typedBet('raise 20', allInFacing).say];
  });
  assert.equal(r[0], `Four-dollar limit: Call $4, All in $19 or Fold. Ask Curtis for table stakes if you want a bigger game.`);
  assert.equal(r[2], 'Nobody is left to answer a raise: call $8 or fold.');
  assert.ok(spot.first);
});

// ----- D13, D14: the terms -----

s.test('D13 the narrator is told the terms when the stake or the structure differs from the last hand at this dealer ("Tester sits down at Curtis Pruett\'s twenty-dollar table ($1 ante, $4 limit)"), not again at the same terms, again on going back to an earlier stake, once on a limit → no limit change; D14 the demo has the dealer state them before the hand is told', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await addCash(page, 300);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'limit' });
  const hand = async (words, structure) => {
    if (structure) await presetCards(page, { game: 'holdem', seats: [], structure });
    await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
    await sendText(page, words);
    return { out: line(await lastCall(page, 'narrate'), 'OUTCOME: '), narr: (await lastEntry(page)).narration };
  };
  const terms = (stake, rules) => ` Tester sits down at ${spot.dealerName}'s ${stake} table (${rules}): have ${spot.dealerName} state the table's terms as they sit (`;
  let h1 = await hand('I bet $20 at cards');
  assert.ok(h1.out.includes(terms('twenty-dollar', '$1 ante, $4 limit') + '"Twenty to sit, a dollar ante, four-dollar limit.").'), h1.out);
  assert.ok(!/for the first time/.test(h1.out));
  // D14: before the hand.
  const said = `"Twenty to sit, a dollar ante, four-dollar limit," ${spot.dealerName} says as you sit down. `;
  assert.ok(h1.narr.includes(said), h1.narr);
  assert.ok(h1.narr.indexOf(said) < h1.narr.indexOf(`At ${spot.dealerName}`), h1.narr);
  assert.ok(h1.narr.indexOf(said) < h1.narr.indexOf('you fold'), h1.narr);
  let h2 = await hand('I bet $20 at cards');
  assert.ok(!/sits down at/.test(h2.out), 'the same terms: not told');
  assert.ok(!/says as you sit down/.test(h2.narr));
  h2 = await hand('I bet $100 at cards');
  assert.ok(h2.out.includes(terms('hundred-dollar', '$5 ante, $20 limit')), h2.out);
  h2 = await hand('I bet $20 at cards');
  assert.ok(h2.out.includes(terms('twenty-dollar', '$1 ante, $4 limit')), `back to $20: told again: ${h2.out}`);
  // Limit to no limit at the same stake: told once.
  h2 = await hand('I bet $20 at cards', 'nolimit');
  assert.ok(h2.out.includes(terms('twenty-dollar', '$1 ante, no limit') + '"Twenty to sit, a dollar ante, no limit.").'), h2.out);
  assert.ok(h2.narr.includes(`"Twenty to sit, a dollar ante, no limit," ${spot.dealerName} says as you sit down.`), h2.narr);
  h2 = await hand('I bet $20 at cards', 'nolimit');
  assert.ok(!/sits down at/.test(h2.out), 'no limit again: not told');
});

s.run();
