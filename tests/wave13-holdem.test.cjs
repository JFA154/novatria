'use strict';
/* Wave 13: the owner asked for Texas hold'em beside five-card draw ("Keep
   both and build holdem too"; "the one where you have 2 cards"), for more
   than the two of them at some tables ("for some games have it so there's
   more than the 2 of us"), and for a way to win without playing ("Keep the
   backslash cheat win or something so it narrates my win without playing";
   "when the game start have a cheat win somewhere so i can skip the whole
   game and win"). Covered here: best of seven and ties, the unit and the
   ante, a heads-up hand through the real buttons on every street, a
   three-handed hand (a seat betting after a check, everyone folding to the
   player, the player folding), a split pot, the chooser, the remembered
   game, the words for the game and the table size, /cheat cards at
   hold'em, /cheat win, the Win (cheat) control, the marked deck with
   seats, Stop at the chooser and mid-street, a reload mid-street, the
   redraw after a reload and /undo, phone widths with four seats, the
   seats' memories and attitude, OUTCOME and the demo, and no innerHTML
   (docs/notes/engine-world.md and docs/notes/ui.md, Wave 13).
   Mock mode. Run with: node tests/wave13-holdem.test.cjs */
const fs = require('fs');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, presetCards, fastClear: fast, line, idle, continueFromTitle, GAME_PATH, LAPTOP } = require('./helpers.cjs');

const s = suite('wave13-holdem');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const gold = page => page.evaluate(() => Game.state.player.gold);
const lastNotice = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent);
const bgWith = (page, re) => page.evaluate(src => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => new RegExp(src, 'i').test(i.name))), re);
/* The card game's place on an open day, at a phase its dealer and card people sit at it (the evening first). */
const atTable = (page, phase) => page.evaluate(want => {
  const G = Game, S = G.State, st = G.state;
  const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
  const PH = ['morning', 'afternoon', 'evening', 'night'];
  for (const ph of want ? [want] : ['evening', 'night', 'afternoon']) {
    // The clock only goes forward: today if that phase is still to come (or now), else tomorrow; a day the place is open.
    let d = st.time.day + (PH.indexOf(ph) < PH.indexOf(st.time.phase) ? 1 : 0);
    while (S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
    const here = S.npcsAt(l.id).map(n => n.id);
    const dealer = G.Pipeline.dealerOf(here);
    if (dealer) return { loc: l.id, name: l.name, phase: ph, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0], people: G.Pipeline.cardPeople(here, dealer).map(n => ({ id: n.id, name: n.name, first: n.name.split(' ')[0], personality: n.personality })) };
  }
  return null;
}, phase || null);
/* Say the bet and wait for the table (or the chooser) to open. */
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
/* The next hold'em hand dealt as given: holes in seat order (the player, the seats, the dealer last), the board, and who sits in. */
const deal = (page, holes, board, seats) => page.evaluate(([h, b, st]) => { Game.Pipeline.hooks.cardsDeal = { holes: h, board: b, seats: st || [] }; }, [holes, board, seats || []]);
/* The newest table as drawn: each row (its seat, name, status, read, cards: a code or "back"), the board, the pot, the buttons, the hint. */
const tableNow = page => page.evaluate(() => {
  const t = [...document.querySelectorAll('#feed .f-cards')].pop();
  if (!t) return null;
  const cards = el => [...el.querySelectorAll('.cards-row .card')].map(c => (c.classList.contains('back') ? 'back' : c.dataset.card));
  const board = t.querySelector('.cards-board');
  return {
    open: t.classList.contains('open'), game: t.dataset.game, head: t.querySelector('.cards-head').textContent,
    seats: [...t.querySelectorAll('.cards-side')].map(el => ({ seat: el.dataset.seat, who: el.querySelector('.cards-who').textContent, deals: !!el.querySelector('.cards-deals'), status: el.querySelector('.cards-status').textContent, read: el.querySelector('.cards-read') ? el.querySelector('.cards-read').textContent : null, cards: cards(el), won: el.dataset.won === 'true' })),
    board: board ? { street: board.querySelector('.cards-street').textContent, cards: cards(board) } : null,
    pot: t.querySelector('.cards-pot') ? t.querySelector('.cards-pot').textContent : null,
    acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent),
    hint: t.querySelector('.cards-hint') ? t.querySelector('.cards-hint').textContent : null,
    win: !!t.querySelector('.cards-hint .cards-win'),
    result: t.querySelector('.cards-result') ? t.querySelector('.cards-result').textContent : null,
    text: t.textContent
  };
});
const press = async (page, label) => {
  await page.click(`#feed .f-cards.open .cards-acts button:text-is("${label}")`);
  await page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
};
/* Wave 18: an amount in the table's field, then its Bet or Raise button. */
const betAmount = async (page, amount) => {
  await page.fill('#feed .f-cards.open .cards-amt', String(amount));
  await page.click('#feed .f-cards.open .cards-acts button[data-act="bet"], #feed .f-cards.open .cards-acts button[data-act="raise"]');
  await page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
};
const BACKS = ['back', 'back', 'back', 'back', 'back'];

// ----- the hands and the money -----

s.test('best of seven: every hand found among seven (or six) cards, ties broken by the kickers the five use, a board that plays for everyone splits; the hole cards named before the flop; the ante is a twentieth of the stake (at least $1; wave 18, no limit), and no seat puts in more than the stake; the pot\'s odd dollar goes to the player; the words name the game and the table size', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const C = Game.Cards, P = Game.Pipeline;
    const H = t => t.split(' ');
    const best = t => C.best(H(t)).name;
    const cmp = (a, b, board) => Math.sign(C.compareKeys(C.best(H(a).concat(H(board))).key, C.best(H(b).concat(H(board))).key));
    const run = (stake, moves, n) => {
      const h = { seed: 77, ante: P.anteFor(stake), stack: stake, stacked: false, board: H('2c 7d 9h 3s Jc'), seats: [{ key: 'player', hole: H('Ah Ad'), tilt: 0 }].concat(Array.from({ length: n - 1 }, (x, i) => ({ key: `npc_${i}`, hole: i === n - 2 ? H('Ks Kc') : H('4d 4h'), tilt: 0 }))) };
      return P.holdemRun(h, moves);
    };
    // Wave 18: the player goes all in at once; whoever calls is all in too, and nobody has more than the stake in.
    const callDown = (stake, n) => { let moves = []; let r = run(stake, moves, n); while (r.need) { moves = moves.concat(r.need[0] === 'check' ? 'allin' : 'call'); r = run(stake, moves, n); } return r; };
    const sides = [{ key: 'player', in: 5, live: true, final: H('As Ks Qs Js 9d') }, { key: 'npc_a', in: 5, live: true, final: H('Ad Kd Qd Jd 9s') }, { key: 'npc_b', in: 3, live: false, final: null }];
    const pot = P.settlePot(sides);
    return {
      names: [best('As Ks 2d 7c Qs Js Ts'), best('Ah Kd 2c 2d 2s 9h 9c'), best('Ac 2d 3h 4s 5c Kd Qh'), best('Kh Kd 7c 7d 3s 3h 2c'), best('9h 8h 7h 6h 5h 4h Ah'), best('Ac Kd Qh Js 9c 7d'), best('2c 2d 2h 2s Kc Kd Ks')],
      ties: { kicker: cmp('Ah 9c', 'Ad 8c', 'As Kd 7h 4c 2s'), boardPlays: cmp('2c 3d', '4h 5s', 'Ts Js Qd Kc Ah'), boardFull: cmp('Ac Qd', 'Jc 2h', 'Ks Kh 7c 7d 7s'), kingsUp: cmp('Kc Qh', 'Ac Ad', 'Ks Kh 7c 7d 7s'), twoPairKicker: cmp('Ah 3d', 'Qs 3c', 'Kc Kd 7s 7h 2c'), flush: cmp('Ah 2c', 'Kh Qc', '9h 7h 4h 3h Jd') },
      holes: [C.holeName(H('Js Jd')), C.holeName(H('Js 7d')), C.holeName(H('2c Ah'))],
      units: [1, 4, 5, 9, 20, 23, 24, 25, 39, 40, 100, 140].map(P.anteFor),
      bets: [1, 4, 5, 9, 20, 23, 24, 25, 39, 40, 100, 140].map(P.unitFor),
      rules: [20, 100, 140, 160, 7].map(st => P.rulesWords(st)).concat([P.rulesWords(20, 'nolimit')]),
      full: [20, 23, 100, 3].map(st => { const r = callDown(st, 3); return { in: r.in.slice(), pot: r.pot, showdown: !!r.showdown }; }),
      ante: run(20, [], 2),
      pot, won: sides.map(x => x.won),
      game: ["deal me in at hold'em", 'a hand of draw', 'hold em, deal me in', 'holdem', 'Texas, please', 'five-card draw', '5-card', 'five card', 'draw poker', 'deal me in', 'I draw my gun and bet $20', "not draw, hold'em", "hold'em instead of draw", 'I bet $20 at cards'].map(P.gameFrom),
      seats: ['deal everyone in', "everyone's in", 'heads up', 'just me and Curtis', 'just us', 'deal me in', 'I bet $20 heads-up'].map(P.seatWords)
    };
  });
  assert.deepEqual(r.names, ['Royal flush', 'Full house, twos over nines', 'Straight, five high', 'Two pair, kings and sevens', 'Straight flush, nine high', 'Ace high', 'Four of a kind, twos']);
  assert.deepEqual(r.ties, { kicker: 1, boardPlays: 0, boardFull: 0, kingsUp: 1, twoPairKicker: 1, flush: 1 }, 'the kicker in the best five; a board that plays splits (a full house on it too: an ace does not play); a king makes kings full over the sevens');
  assert.deepEqual(r.holes, ['Pair of jacks', 'Jack high', 'Ace high']);
  assert.deepEqual(r.units, [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 5, 7], 'wave 18: the ante, a twentieth of the stake');
  assert.deepEqual(r.bets, [1, 1, 1, 1, 4, 4, 4, 5, 7, 8, 20, 28], 'the table\'s bet, a fifth of the stake (wave 13\'s unit)');
  assert.deepEqual(r.rules, ['Twenty to sit, a dollar ante, four-dollar limit.', 'A hundred to sit, a five-dollar ante, twenty-dollar limit.', 'A hundred and forty to sit, a seven-dollar ante, twenty-eight-dollar limit.', 'A hundred and sixty to sit, an eight-dollar ante, thirty-two-dollar limit.', 'Seven to sit, a dollar ante, one-dollar limit.', 'Twenty to sit, a dollar ante, no limit.'], 'the house rules in words: limit, the house game, or no limit');
  assert.deepEqual(r.full.map(x => x.in[0]), [20, 23, 100, 3], 'the player all in: the whole stake, never more');
  assert.ok(r.full.every((x, k) => x.in.every(v => v === [20, 23, 100, 3][k] || v === [1, 1, 5, 1][k])), 'each other seat is all in or folded its ante');
  assert.ok(r.full.every(x => x.pot === x.in.reduce((a, b) => a + b, 0)));
  assert.deepEqual([r.ante.in, r.ante.pot, r.ante.need, r.ante.street, r.ante.ask.minTo, r.ante.ask.maxTo, r.ante.ask.unit], [[1, 1], 2, ['check', 'bet'], 0, 4, 19, 4], 'every seat antes $1 at $20; the player acts first: the least bet is the table\'s $4, all in is the $19 left');
  assert.deepEqual([r.pot.pot, r.pot.winners, r.won], [13, ['player', 'npc_a'], [7, 6, 0]], 'a split: the odd dollar to the player');
  assert.deepEqual(r.game, ['holdem', 'draw', 'holdem', 'holdem', 'holdem', 'draw', 'draw', 'draw', 'draw', null, null, 'holdem', 'holdem', null]);
  assert.deepEqual(r.seats, ['all', 'all', 'none', 'none', 'none', null, 'none']);
});

s.test('a heads-up hand of hold\'em through the real buttons: Check, the dealer bets, Call; Bet, he calls; each street turns the board (three, one, one) under its name, the statuses and the pot line follow, the read names him; wave 18: the house rules in the head and, once, in words, a bet that is not a multiple of $4 goes up to the next one, the dealer goes all in on the turn and the call puts the player all in, so the river is dealt out to the showdown; his cards up, both hands named, the winner takes the pot; the money (in as it is put in), the record and the table kept on the log entry; then a fold on the flop costs what was put in', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  // Table stakes (wave 18, amendment 2: what the dealer agrees to when asked; tests fix it): the amount control.
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  const g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · no limit · pot $2`);
  assert.deepEqual(t.seats.map(x => [x.seat, x.who, x.deals]), [[spot.dealer, spot.dealerName, true], ['player', 'You', false]], 'the dealer\'s row (marked) and the player\'s');
  assert.deepEqual(t.seats[0].cards, ['back', 'back'], 'his two face down');
  assert.deepEqual(t.seats[1].cards, ['Ah', 'Ad'], 'the player\'s two face up');
  assert.deepEqual(t.board, { street: 'Pre-flop', cards: BACKS });
  assert.equal(t.pot, 'Pot $2 · you\'re in for $1 · $19 left');
  assert.deepEqual(t.acts, ['Check', 'Bet $4']);
  assert.equal(t.hint, 'Twenty to sit, a dollar ante, no limit. Check, or bet $4, $8, $12 up to all in ($19). Stop folds the hand (−$1). Win (cheat)', 'wave 14: how to switch the game is said between hands, not on an open one; wave 18: the house rules said once');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cards-head', 'the head has the focus');
  assert.equal(await gold(page), g0 - 1, 'wave 18: the ante goes in at the deal');
  assert.match(await page.evaluate(() => { const b = document.querySelector('#cmd'); b.value = 'I look around'; return ''; }), /^$/);
  await page.press('#cmd', 'Enter');
  assert.equal(await page.textContent('#turn-status-text'), 'Your hand is on the table: Check or Bet (or type "check", "bet 4" or "all in"). Stop folds the hand (−$1); Win (cheat) ends it yours.'); // wave 14: the nudge names the Win (cheat) control
  await page.fill('#cmd', '');
  // Pre-flop: Check; he bets; Call.
  await press(page, 'Check');
  t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.acts, t.pot], ['bets $4', 'checks', ['Call $4', 'Raise to $8', 'Fold'], 'Pot $6 · you\'re in for $1 · $19 left'], 'he bets after the check: Call, Raise or Fold');
  assert.equal(t.hint, 'Call $4, raise to $8, $12 up to all in ($19), or fold. Stop folds the hand (−$1). Win (cheat)', 'the house rules only once');
  assert.match(t.seats[0].read, new RegExp(`^Your read: ${spot.first} (has something|is bluffing)\\.$`), 'the read names him');
  await press(page, 'Call $4');
  t = await tableNow(page);
  assert.deepEqual([t.board.street, t.board.cards, t.pot, t.acts], ['The flop', ['2c', '7d', '9h', 'back', 'back'], 'Pot $10 · you\'re in for $5 · $15 left', ['Check', 'Bet $4']]);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · no limit · pot $10`, 'the head follows the pot');
  assert.equal(await gold(page), g0 - 5, 'the call is off the cash as it is made');
  // The flop: $6 typed goes up to $8 (bets go in $4s); he calls.
  await page.fill('#feed .f-cards.open .cards-amt', '6');
  t = await tableNow(page);
  assert.deepEqual([t.acts[1], await page.textContent('#feed .f-cards.open .cards-amt-note')], ['Bet $8', 'Bets go in fours: $6 rounds up to $8.']);
  await page.click('#feed .f-cards.open .cards-acts button[data-act="bet"]');
  await page.waitForFunction(() => !!document.querySelector('#feed .f-cards.open .cards-board .cards-street') && document.querySelector('#feed .f-cards.open .cards-street').textContent === 'The turn');
  t = await tableNow(page);
  assert.deepEqual([t.board.street, t.board.cards.slice(3), t.seats[0].status, t.seats[1].status, t.pot], ['The turn', ['3s', 'back'], '', '', 'Pot $26 · you\'re in for $13 · $7 left'], 'wave 14: a new street starts with the statuses cleared');
  // The turn: Check; he goes all in for the $7 he has left; the call puts the player all in too.
  await press(page, 'Check');
  t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.acts, t.hint], ['all in $7', ['Call $7 (all in)', 'Fold'], 'Call $7 (all in) or fold. Stop folds the hand (−$13). Win (cheat)']);
  await press(page, 'Call $7 (all in)');
  await idle(page);
  t = await tableNow(page);
  assert.equal(t.open, false, 'everyone all in: nothing left to choose');
  assert.deepEqual(t.seats[0].cards, ['Ks', 'Kc'], 'his cards up at the showdown');
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.seats[1].won, t.seats[0].won], ['Pair of kings', 'Pair of aces · takes the pot', true, false]);
  assert.match(t.seats[0].read, / You were (right|wrong)\.$/, 'the read\'s verdict at the showdown');
  assert.deepEqual(t.board, { street: 'Showdown', cards: ['2c', '7d', '9h', '3s', 'Jc'] }, 'the river dealt out');
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · no limit · pot $40`);
  assert.equal(t.result, `You win $20 · cash $${g0 + 20}`);
  assert.equal(t.acts.length + (t.win ? 1 : 0), 0, 'nothing to press');
  assert.equal(await gold(page), g0 + 20);
  const e = await lastEntry(page);
  const c = e.cards;
  assert.deepEqual([c.game, c.ante, c.unit, c.stake, c.street, c.shown, c.pot, c.winners, c.result, c.delta, c.showdown], ['holdem', 1, 4, 20, 4, 5, 40, ['player'], 'win', 20, 'win']);
  assert.deepEqual(c.moves, ['check', 'call', 'bet:8', 'check', 'call']);
  assert.deepEqual(c.actions.slice(-2), [{ seat: spot.dealer, act: 'bet', to: 7, add: 7, street: 2, allIn: true }, { seat: 'player', act: 'call', to: 7, add: 7, street: 2, allIn: true }]);
  assert.deepEqual([c.player.dealt, c.player.in, c.player.won, c.dealer.dealt, c.dealer.in, c.dealer.name, c.player.name], [['Ah', 'Ad'], 20, 40, ['Ks', 'Kc'], 20, 'Pair of kings', 'Pair of aces']);
  assert.equal(c.dealer.read.text.startsWith(spot.first), true);
  assert.equal(e.roll, null, 'no roll without a marked deck');
  // A fold on the flop: what the player put in (the ante and a call) is lost; he takes the pot.
  const g1 = await gold(page);
  await deal(page, [['7c', '2d'], ['Qs', 'Qh']], ['3c', '8d', 'Kh', '5s', 'Jh']);
  await startHand(page, 'deal me in');
  await press(page, 'Check');
  await press(page, 'Call $4');
  await press(page, 'Check');
  t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.acts], ['bets $4', ['Call $4', 'Raise to $8', 'Fold']]);
  await press(page, 'Fold');
  await idle(page);
  t = await tableNow(page);
  const f = (await lastEntry(page)).cards;
  assert.deepEqual([f.result, f.delta, f.folded, f.player.foldedOn, f.winners, f.moves, f.pot, f.dealer.in, f.dealer.back], ['fold', -5, true, 1, [spot.dealer], ['check', 'call', 'check', 'fold'], 10, 5, 4], 'his $4 bet nobody called comes back to him');
  assert.equal(await gold(page), g1 - 5);
  assert.deepEqual([t.seats[1].status, t.seats[0].status, t.result], ['folds on the flop', 'Pair of queens · takes the pot', `You fold: −$5 · cash $${g1 - 5}`]);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`Texas hold'em, heads up with ${spot.dealerName}; ${spot.dealerName} bet \\$4 before the flop and the player called; ${spot.dealerName} bet \\$4 on the flop; ${spot.dealerName}'s pair of queens takes the \\$10 pot; the player folded their king high on the flop and gave up the \\$5 they had put in \\(cash now \\$${g1 - 5}\\)\\.`));
});

s.test('three-handed: a seat bets after the player checks (Call, Raise or Fold), the dealer calls, the player folds and the hand is settled among the others at once (the record says who took it); a pot of the player\'s $1 moves nobody (wave 14: $10 or more does); everyone folding to the player\'s bet gives them the pot without a showdown, the bet nobody called given back', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  // The most careful card person here (never bluffs): one who folds what is not worth calling and bets what is.
  const seat = await page.evaluate(ids => ids.map(id => Game.State.npc(id)).find(n => (n.personality || []).some(p => /gloomy|honest|cautious|cowardly|careful/i.test(p))) || Game.State.npc(ids[0]), spot.people.map(p => p.id));
  assert.ok(seat, 'a card person is here in the evening');
  await presetCards(page, { game: 'holdem', seats: null });
  const a0 = seat.attitude;
  const g0 = await gold(page);
  await deal(page, [['9c', '9d'], ['Qs', 'Qd'], ['Jh', 'Td']], ['Ks', '4d', 'Jc', '8h', '3c'], [seat.id]);
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.deepEqual(t.seats.map(x => x.seat), [spot.dealer, seat.id, 'player'], 'the dealer, the seat, the player');
  assert.deepEqual(t.seats[1].cards, ['back', 'back']);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · $4 limit · pot $3`, 'three antes');
  await press(page, 'Check');
  t = await tableNow(page);
  assert.deepEqual([t.seats[1].status, t.seats[0].status, t.acts], ['bets $4', 'calls $4', ['Call $4', 'Raise to $8', 'Fold']], 'the seat bets after the check, the dealer calls: Call, Raise or Fold');
  assert.match(t.seats[1].read, new RegExp(`^Your read: ${seat.name.split(' ')[0]} (has something|is bluffing)\\.$`));
  await press(page, 'Fold');
  await idle(page);
  t = await tableNow(page);
  const c = (await lastEntry(page)).cards;
  assert.deepEqual([c.result, c.delta, c.winners, c.seats.map(x => x.id), c.seats[0].won, c.player.in, c.pot], ['fold', -1, [seat.id], [seat.id], c.pot, 1, 11]);
  assert.deepEqual(t.board.cards, ['Ks', '4d', 'Jc', '8h', '3c'], 'the board is dealt out among the others');
  assert.deepEqual(t.seats[1].cards, ['Qs', 'Qd']);
  assert.deepEqual([t.seats[1].status, t.seats[0].status], ['Pair of queens · takes the pot', 'Pair of jacks']);
  assert.equal(t.seats[2].status, 'folds before the flop');
  assert.equal(await gold(page), g0 - 1);
  const after = await page.evaluate(id => Game.State.npc(id), seat.id);
  // Wave 14 (QA #3): the seat took $1 of the player's money, under the $10 that counts: no memory, no attitude change (tests/wave14-holdem-fixes.test.cjs has the $10 and more).
  assert.equal(after.attitude, a0, 'a pot of the player\'s $1 moves nobody');
  assert.ok(!after.memories.some(m => m.text === 'took a pot off Tester at cards at the Low Water'));
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(out, new RegExp(`^OUTCOME: the card game \\(the player bought in for \\$20; house rules: \\$20 to sit, \\$1 ante, \\$4 limit \\(every bet and raise \\$4\\), four rounds of betting\\): Texas hold'em with ${seat.name} and ${spot.dealerName}, ${spot.dealerName} dealing; ${seat.name} bet \\$4 before the flop and ${spot.dealerName} called; ${seat.name}'s pair of queens takes the \\$11 pot; ${spot.dealerName} showed a pair of jacks; the player folded their pair of nines before the flop and gave up the \\$1 they had put in`));
  assert.doesNotMatch(out, /Already recorded:/);
  assert.match(line(await lastCall(page, 'bookkeep'), 'CARD GAME'), new RegExp(`The other players were ${seat.name}, with ${spot.dealerName} dealing; what they remember of the hand and how they feel about the player are recorded already`));
  // Everyone folds to the player's $4 bet: the pot (the antes) without a showdown; the $4 nobody called comes back.
  const g1 = await gold(page);
  await deal(page, [['Ac', 'Kc'], ['7d', '2c'], ['3h', '2s']], ['Ks', '4d', 'Jc', '8h', '3c'], [seat.id]);
  await startHand(page, 'another hand');
  await press(page, 'Bet $4');
  await idle(page);
  const u = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([u.result, u.uncontested, u.pot, u.delta, u.street, u.shown, u.player.in, u.player.back, u.moves], ['win', true, 3, 2, 0, 0, 1, 4, ['bet:4']], 'both fold to the bet before the flop: their antes are the player\'s');
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.seats[2].status, t.seats[0].cards, t.board.cards, t.board.street], ['folds before the flop', 'folds before the flop', 'takes the pot', ['back', 'back'], BACKS, 'Pre-flop']);
  assert.equal(await gold(page), g1 + 2);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /the player bet \$4 before the flop and everyone folded; the player takes the \$3 pot without a showdown: the player wins \$2/);
});

s.test('a split pot: the board plays for both, each gets back what they put in, the table says "Split pot" and both hands; heads up, or the odd dollar to the player', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [] });
  const g0 = await gold(page);
  await deal(page, [['2c', '3d'], ['4h', '5s']], ['Ts', 'Js', 'Qd', 'Kc', 'Ah']);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; }); // check and call to the end
  await sendText(page, 'I bet $20 at cards');
  const c = (await lastEntry(page)).cards;
  const t = await tableNow(page);
  assert.deepEqual([c.result, c.delta, c.winners.length, c.player.name, c.dealer.name], ['split', 0, 2, 'Straight, ace high', 'Straight, ace high']);
  assert.equal(await gold(page), g0);
  assert.equal(t.result, `Split pot · cash $${g0}`);
  assert.deepEqual([t.seats[0].status, t.seats[1].status], ['Straight, ace high · splits the pot', 'Straight, ace high · splits the pot']);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /splits the \$\d+ pot with .*: no money changes hands \(cash still/);
});

// ----- the chooser and the words -----

s.test('the chooser: with no game named or remembered the table opens with the dealer and the stake, Five-card draw and Texas hold\'em, the Win (cheat) control and "Stop leaves the table (nothing lost)", no card dealt; Stop there costs nothing and puts the line back; choosing deals that game and remembers it; the words switch it and size the table', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const g0 = await gold(page);
  const log0 = await page.evaluate(() => Game.state.log.length);
  await startHand(page, 'deal me in');
  let t = await tableNow(page);
  assert.deepEqual([t.game, t.head, t.acts, t.hint, t.win], ['choose', `${spot.dealerName}'s table · $20 to sit · $1 ante · $4 limit`, ['Five-card draw', "Texas hold'em"], "Twenty to sit, a dollar ante, four-dollar limit. Stop leaves the table (nothing lost). Name the game in your words to skip this choice (hold'em or draw). Win (cheat)", true], 'wave 18: the house rules, in the head and once in words');
  assert.equal(await page.locator('#feed .f-cards .card').count(), 0, 'no card dealt');
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.handKind, document.activeElement.className, document.querySelector('#send').textContent]), ['choose', 'cards-head', 'Stop']);
  // The title screen waits (nothing is lost by leaving, but the turn waits for the choice).
  assert.equal(await page.evaluate(() => Game.App.quitToTitle()), false);
  assert.equal(await lastNotice(page), 'Pick a game first, or Stop to leave the table (nothing lost).');
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  assert.equal(await page.textContent('#turn-status-text'), "The card table is open: pick Five-card draw or Texas hold'em. Stop leaves the table (nothing lost).");
  await page.fill('#cmd', '');
  // Stop: no cost, the line back in the box, nothing kept.
  await page.click('#send');
  await idle(page);
  assert.deepEqual(await page.evaluate(() => [Game.state.player.gold, Game.state.log.length, document.querySelector('#cmd').value, document.querySelectorAll('#feed .f-cards').length, Game.state.flags.cardGame]), [g0, log0, 'deal me in', 0, undefined], 'no cost, the line back in the box, nothing kept');
  // Choosing hold'em deals it and remembers it.
  await page.fill('#cmd', '');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsSeats = []; });
  await startHand(page, 'deal me in');
  await page.click("#feed .f-cards.open .cards-game:text-is(\"Texas hold'em\")");
  await page.waitForSelector('#feed .f-cards.open[data-game="holdem"]');
  t = await tableNow(page);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · $4 limit · pot $2`);
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cards-head', 'the focus on the head of the dealt table');
  await page.click('#send'); // Stop: once dealt, a fold
  await idle(page);
  assert.equal((await lastEntry(page)).cards.result, 'fold');
  assert.equal(await page.evaluate(() => Game.state.flags.cardGame), 'holdem', 'remembered');
  // The remembered game: no chooser.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'deal me in');
  assert.equal((await lastEntry(page)).cards.game, 'holdem');
  // The words switch it (and it is remembered), and size the table.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'a hand of draw');
  assert.deepEqual([(await lastEntry(page)).cards.game, await page.evaluate(() => Game.state.flags.cardGame)], ['draw', 'draw']);
  const eve = await atTable(page, 'evening'); // the hands took the evening on: back to the next one
  assert.ok(eve.people.length >= 2, 'card people here in the evening');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsSeats = null; Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, "deal everyone in at hold'em");
  let e = await lastEntry(page);
  assert.deepEqual([e.cards.game, e.cards.seats.map(x => x.id)], ['holdem', eve.people.slice(0, 3).map(p => p.id)], 'everyone here who plays cards sits in (three at most)');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'heads up, deal me in');
  e = await lastEntry(page);
  assert.deepEqual([e.cards.game, e.cards.seats], ['holdem', undefined], 'heads up: nobody else');
  // With no words, the hand's seed: none, one or two of them, about a third of the time each.
  const tally = await page.evaluate(() => {
    const G = Game, P = G.Pipeline;
    const here = G.State.npcsAt(G.state.player.locationId).map(n => n.id);
    const dealer = P.dealerOf(here);
    const n = [0, 0, 0, 0];
    for (let seed = 1; seed <= 600; seed++) n[P.seatsFor({ presentIds: here, input: 'deal me in' }, dealer, seed).length]++;
    return n;
  });
  assert.equal(tally[3], 0, 'never three by chance');
  for (const k of [0, 1, 2]) assert.ok(tally[k] > 150 && tally[k] < 250, `${k} seats: ${tally[k]} of 600`);
  // The demo's parser reads the new words as a bet.
  const parsed = await page.evaluate(async () => {
    const out = {};
    for (const t of ["deal me in at hold'em", 'a hand of draw', 'deal everyone in', 'heads up with Curtis', "Let's play hold'em", 'Heads up!']) out[t] = (await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' }))).actionType;
    return out;
  });
  assert.deepEqual(parsed, { "deal me in at hold'em": 'gamble', 'a hand of draw': 'gamble', 'deal everyone in': 'gamble', 'heads up with Curtis': 'gamble', "Let's play hold'em": 'gamble', 'Heads up!': parsed['Heads up!'] === 'gamble' ? 'not gamble' : parsed['Heads up!'] });
  // The real parser's rubric and the Say MODE line name the game and the table size.
  const sys = await page.evaluate(() => Game.Api.SYSTEM.parser);
  assert.match(sys, /the game \(Texas hold'em or five-card draw\) and who sits in \("deal everyone in", "heads up"\) may be named in the words/);
});

// ----- the cheats -----

s.test('/cheat cards at hold\'em: the player\'s two cards and the board make the best hand whatever they do, the others never fold before the flop (the pot is worth having), no catch roll with a marked deck, nothing about cheating recorded', async h => {
  const page = await open(h);
  const bg = await bgWith(page, 'marked');
  await quickStart(page, { bgIndex: bg });
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: spot.people.slice(0, 2).map(p => p.id) });
  await sendText(page, '/cheat cards');
  const g0 = await gold(page);
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.ok(t.seats.slice(0, 3).every(x => x.cards.every(c => c !== 'back')), 'a marked deck: every seat\'s cards face up');
  await press(page, 'Bet $4');
  t = await tableNow(page);
  // Wave 14 (QA #5): the flop starts with the statuses cleared; everyone called (the pot is four antes and four calls of the $4 bet).
  assert.deepEqual([t.board.street, t.seats.slice(0, 3).map(x => x.status), t.pot], ['The flop', ['', '', ''], 'Pot $20 · you\'re in for $5 · $15 left'], 'nobody folds before the flop');
  await page.evaluate(() => { Game.Pipeline.playHand({ act: 'check' }); });
  while (await page.evaluate(() => Game.Pipeline.handOpen)) await page.evaluate(() => Game.Pipeline.playHand({ act: (Game.Pipeline.openHand.options || ['check'])[0] }));
  await idle(page);
  const e = await lastEntry(page);
  assert.deepEqual([e.cards.cheat, e.cards.result, e.cards.winners, e.roll], [true, 'win', ['player'], null]);
  // Wave 14 (QA #20): the shape varies with the seed; the player's hand is strictly the best of those still in.
  assert.ok(await page.evaluate(x => [x.dealer].concat(x.seats).filter(o => !o.folded).every(o => Game.Cards.compareKeys(Game.Cards.best(x.player.dealt.concat(x.board)).key, Game.Cards.best(o.dealt.concat(x.board)).key) > 0), e.cards), e.cards.player.name);
  assert.equal(await gold(page) - g0, e.cards.delta);
  assert.ok(e.cards.delta >= 6, 'at least the others\' antes and calls');
  assert.equal(await page.evaluate(() => Game.state.flags.cardsCheat), undefined, 'spent');
  assert.doesNotMatch(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /cheat|marked/i);
  assert.equal(await page.evaluate(id => Game.State.npc(id).memories.filter(m => /cheat/i.test(m.text)).length, spot.dealer), 0);
});

s.test('/cheat win: armed in the game ("Cheat armed: the next hand is yours without playing."; again: "Already armed …"); it survives a reload; the next bet is not played: the table appears finished (every seat\'s cards face up, the board complete, the player\'s hand the best, everyone all in (wave 18; it was every street called): the player wins (seats − 1) × the stake), told as a plain win with no catch roll and nothing about cheating, the seats\' memories recorded as for any win; /undo arms it again', async h => {
  const page = await open(h);
  const bg = await bgWith(page, 'marked');
  await quickStart(page, { bgIndex: bg });
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: spot.people.slice(0, 2).map(p => p.id) });
  await sendText(page, '/cheat win');
  assert.equal(await lastNotice(page), 'Cheat armed: the next hand is yours without playing.');
  await sendText(page, '/cheat win');
  assert.equal(await lastNotice(page), 'Already armed: the next hand is yours without playing.');
  assert.equal(await page.evaluate(() => Game.Storage.loadAutosave().state.flags.cardsWin), true, 'saved');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await continueFromTitle(page);
  assert.equal(await page.evaluate(() => Game.Pipeline.winArmed), true, 'armed after a reload');
  await presetCards(page, { game: undefined, seats: spot.people.slice(0, 2).map(p => p.id) });
  const before = await page.evaluate(ids => ids.map(id => ({ id, att: Game.State.npc(id).attitude })), spot.people.slice(0, 2).map(p => p.id));
  const g0 = await gold(page);
  const opened = await page.evaluate(() => { let seen = false; const id = setInterval(() => { if (Game.Pipeline.handOpen) seen = true; }, 1); window.__seen = () => { clearInterval(id); return seen; }; return true; });
  assert.ok(opened);
  await sendText(page, 'I bet $20 at cards');
  assert.equal(await page.evaluate(() => window.__seen()), false, 'never open: nothing to play');
  const t = await tableNow(page);
  const e = await lastEntry(page);
  const c = e.cards;
  assert.equal(t.open, false);
  assert.deepEqual([c.win, c.result, c.winners, c.street, c.shown, c.pot, c.delta, e.roll], ['armed', 'win', ['player'], 4, 5, 80, 60, null], '(4 − 1) × $20: everyone all in, no catch roll');
  assert.ok(t.seats.every(x => x.cards.every(card => card !== 'back')), 'every seat\'s cards face up');
  assert.ok(t.board.cards.every(card => card !== 'back'), 'the board complete');
  assert.deepEqual([t.seats[3].status, t.result], [`${c.player.name} · takes the pot`, `You win $60 · cash $${g0 + 60}`]);
  assert.equal(await gold(page), g0 + 60);
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(out, /the player's .* takes the \$80 pot: the player wins \$60/);
  assert.doesNotMatch(out, /cheat|marked|deck/i, 'told as a plain win');
  assert.doesNotMatch(e.narration, /cheat|marks/i);
  assert.equal(await page.evaluate(() => Game.Pipeline.winArmed), false, 'spent');
  // The seats lost their whole stake ($20, all in): a memory each and -2.
  const after = await page.evaluate(ids => ids.map(id => ({ id, att: Game.State.npc(id).attitude, mem: Game.State.npc(id).memories.slice(-1)[0] })), before.map(b => b.id));
  for (const [i, a] of after.entries()) {
    assert.equal(a.att, before[i].att - 2);
    assert.deepEqual([a.mem.text, a.mem.weight], ['lost $20 to Tester at cards at the Low Water', 1]);
  }
  assert.equal(await page.evaluate(id => Game.State.npc(id).memories.filter(m => /cheat/i.test(m.text)).length, spot.dealer), 0, 'nothing about cheating');
  // /undo takes it back and arms it again.
  await sendText(page, '/undo');
  assert.equal(await lastNotice(page), 'You took back the last turn. The win cheat is armed again: the next hand is yours without playing. Nothing more can be taken back.');
  assert.deepEqual([await page.evaluate(() => Game.Pipeline.winArmed), await gold(page)], [true, g0]);
});

s.test('the Win (cheat) control: on the chooser it wins a hand of hold\'em untouched; on a draw hand it ends the hand the player\'s (the cards they hold kept); mid-street at hold\'em what was put in stays in the pot, the others still in call the bet on the table (wave 18), and the board is dealt so the player\'s hand is the best', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsSeats = []; });
  // On the chooser.
  await startHand(page, 'deal me in');
  const g0 = await gold(page);
  await page.click('#feed .f-cards.open .cards-win');
  await idle(page);
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.game, c.win, c.result, c.delta, c.pot], ['holdem', 'control', 'win', 20, 40]);
  assert.equal(await gold(page), g0 + 20);
  assert.equal(await page.evaluate(() => Game.state.flags.cardGame), undefined, 'the Win picks no game to remember');
  assert.equal((await tableNow(page)).open, false);
  // On a draw hand (wave 18: before the draw only the antes are in: the dealer's $1).
  await page.evaluate(() => Game.State.apply({ cardGame: 'draw' }));
  const g1 = await gold(page);
  await startHand(page, 'deal me in');
  const dealt = (await tableNow(page)).seats[1].cards;
  await page.click('#feed .f-cards.open .cards-win');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.game, c.win, c.result, c.delta, c.pot, c.player.dealt], ['draw', 'control', 'win', 1, 2, dealt]);
  assert.ok(c.player.held.every(i => c.player.final[i] === dealt[i]), 'the cards held are the ones dealt');
  assert.ok(await page.evaluate(x => Game.Cards.compare(x.player.final, x.dealer.final) > 0, c), 'the best hand');
  assert.equal(await gold(page), g1 + 1);
  // Mid-street at hold'em, three-handed: check, call, then Win.
  await page.evaluate(ids => { Game.State.apply({ cardGame: 'holdem' }); Game.Pipeline.hooks.cardsSeats = ids; }, spot.people.slice(0, 1).map(p => p.id));
  await deal(page, [['7c', '2d'], ['Ts', '8d'], ['Ks', '7d']], ['As', '9c', '4h', 'Th', 'Jc'], spot.people.slice(0, 1).map(p => p.id));
  const g2 = await gold(page);
  await startHand(page, 'deal me in');
  await press(page, 'Check');
  // Call whatever comes before the flop.
  for (let k = 0; k < 6 && (await tableNow(page)).board.street === 'Pre-flop'; k++) await press(page, (await tableNow(page)).acts[0]);
  const mid = await tableNow(page);
  assert.equal(mid.board.street, 'The flop');
  await page.click('#feed .f-cards.open .cards-win');
  await idle(page);
  c = (await lastEntry(page)).cards;
  const t = await tableNow(page);
  assert.deepEqual([c.win, c.result, c.winners, c.board.slice(0, 3)], ['control', 'win', ['player'], ['As', '9c', '4h']], 'the flop stays');
  // Wave 18: every seat still in calls the bet on the table: the pot as it stands, matched.
  const x = c.player.in;
  assert.ok(x > 1, 'the ante and the call before the flop');
  assert.deepEqual([c.dealer.in, c.seats[0].in], [x, x], 'still in: the bet matched');
  assert.deepEqual([c.pot, c.delta], [3 * x, 2 * x]);
  assert.equal(await gold(page), g2 + 2 * x);
  assert.ok(await page.evaluate(x => [x.dealer].concat(x.seats).every(o => Game.Cards.compareKeys(Game.Cards.best(x.player.dealt.concat(x.board)).key, Game.Cards.best(o.dealt.concat(x.board)).key) > 0), c), 'the player\'s hand beats every other');
  assert.ok(t.seats.every(x => x.cards.every(card => card !== 'back')));
});

s.test('a marked deck with seats: every seat\'s cards face up through the hand, no read, and once played the one catch roll ("Keeping the marks from Curtis: …"); /cheat fumble replays the hand from its record (the same cards, seats and moves) and redoes only the catch roll', async h => {
  const page = await open(h);
  const bg = await bgWith(page, 'marked');
  await quickStart(page, { bgIndex: bg });
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: spot.people.slice(0, 2).map(p => p.id) });
  await page.evaluate(() => Game.Pipeline.forceNextRoll(15));
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.ok(t.seats.every(x => x.cards.every(c => c !== 'back')), 'all face up');
  assert.match(t.text, /Marked deck: you can read everyone's cards\./);
  await press(page, 'Bet $4');
  t = await tableNow(page);
  assert.ok(t.seats.every(x => x.read === null), 'no read with a marked deck');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = null; });
  while (await page.evaluate(() => Game.Pipeline.handOpen)) await page.evaluate(() => Game.Pipeline.playHand({ act: (Game.Pipeline.openHand.options || ['check'])[0] }));
  await idle(page);
  const rolls = await page.evaluate(() => [...document.querySelectorAll('#feed .f-roll')].map(r => r.textContent));
  assert.equal(rolls.length, 1, 'one roll');
  assert.match(rolls[0], new RegExp(`^Keeping the marks from ${spot.first}: Wits`));
  const played = await lastEntry(page);
  assert.equal(played.roll.d20, 15);
  const g0 = await gold(page) - played.cards.delta;
  // The replay: no table to play, the same hand, only the catch rolled again (a fumble: caught, the stake lost).
  await sendText(page, '/cheat fumble');
  const again = await lastEntry(page);
  assert.deepEqual([again.cards.board, again.cards.moves, again.cards.seats.map(x => x.dealt), again.cards.player.dealt], [played.cards.board, played.cards.moves, played.cards.seats.map(x => x.dealt), played.cards.player.dealt]);
  assert.deepEqual([again.cards.result, again.cards.delta, again.roll.d20, await gold(page) - g0], ['caught', -20, 1, -20]);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards')].pop().querySelector('.cards-result').textContent.startsWith('Caught cheating: you lose $20')), true);
});

// ----- Stop, a reload, the redraw -----

s.test('Stop mid-street folds the hand: what the player put in is lost, the turn is kept and told plainly; a reload mid-street resumes the hand as a fold after the moves already made', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' }); // wave 18: table stakes (the stored hand keeps the structure through the reload)
  const g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Check');
  await press(page, 'Call $4');
  assert.equal((await tableNow(page)).hint, 'Check, or bet $4, $8 up to all in ($15). Stop folds the hand (−$5). Win (cheat)');
  await page.click('#send');
  await idle(page);
  let e = await lastEntry(page);
  assert.deepEqual([e.cards.result, e.cards.stopped, e.cards.delta, e.cards.moves, await gold(page) - g0], ['fold', true, -5, ['check', 'call', 'fold'], -5]);
  assert.match(e.narration, /^Curtis Pruett bet \$4 before the flop and you called\. You fold your pair of aces, get up from the table and give up \$5\.$/);
  assert.equal(await lastNotice(page), 'Stopped: a hand on the table is folded, and the $5 you put in is gone.', 'wave 19 (QA D3): what was lost');
  assert.equal((await tableNow(page)).result, `Stopped, so you fold: −$5 · cash $${g0 - 5}`);
  // A reload mid-street.
  const g1 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Check');
  await press(page, 'Call $4');
  await betAmount(page, 8);
  assert.deepEqual(await page.evaluate(() => Game.Storage.heldHand().moves), ['check', 'call', 'bet:8'], 'wave 18: the stored hand keeps the amounts');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await continueFromTitle(page);
  await page.waitForFunction(() => Game.state.log[Game.state.log.length - 1].cards);
  await idle(page);
  e = await lastEntry(page);
  assert.deepEqual([e.cards.game, e.cards.result, e.cards.closed, e.cards.moves, e.cards.delta, await gold(page) - g1], ['holdem', 'fold', true, ['check', 'call', 'bet:8', 'fold'], -13, -13]);
  assert.equal((await tableNow(page)).result, `You left the table, so you fold: −$13 · cash $${g1 - 13}`);
  assert.equal(await lastNotice(page), 'The game was closed with a hand on the table, so the hand is folded and the $13 you put in is gone.', 'wave 19 (QA D3): what was lost');
});

s.test('a finished table is drawn again exactly where it was after a reload and after /undo of a later turn; seats, statuses, the board and the result the same', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: spot.people.slice(0, 2).map(p => p.id) });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, 'I bet $20 at cards');
  const played = await tableNow(page);
  const where = () => page.evaluate(() => { const t = document.querySelector('#feed .f-cards'); const f = el => el.className.split(' ').filter(c => /^f-/.test(c) && c !== 'f-item').join(' ') + '|' + el.textContent.slice(0, 40); return [f(t.previousElementSibling), f(t.nextElementSibling)]; });
  const at = await where();
  await sendText(page, 'I look around');
  await sendText(page, '/undo');
  assert.deepEqual(await tableNow(page), played, 'after /undo');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await continueFromTitle(page);
  assert.deepEqual(await tableNow(page), played, 'after a reload');
  assert.deepEqual(await where(), at, 'in the same place: after the line, before the narration');
});

// ----- phone widths -----

s.test('phones at 320 and 390 wide, four seats, both themes, Small, Medium and Large text: hold\'em and draw, open and finished, with no horizontal overflow; the Win (cheat) control and the buttons fit', async h => {
  for (const [width, scheme] of [[320, 'dark'], [390, 'light']]) {
    const page = await open(h, { width, height: 700 }, { colorScheme: scheme });
    await quickStart(page);
    await fast(page);
    const spot = await atTable(page, 'evening');
    const two = spot.people.slice(0, 2).map(p => p.id);
    for (const size of ['S', 'M', 'L']) {
      await page.evaluate(sz => document.documentElement.setAttribute('data-size', sz), size);
      for (const game of ['holdem', 'draw']) {
        await atTable(page, 'evening');
        await presetCards(page, { game, seats: two });
        await startHand(page, 'I bet $20 at cards');
        const tag = `${width} ${scheme} ${size} ${game}`;
        assert.equal((await tableNow(page)).seats.length, 4, `${tag}: four seats`);
        assert.deepEqual(await overflowReport(page, width), [], `${tag} open`);
        const fits = await page.evaluate(w => [...document.querySelectorAll('#feed .f-cards.open button')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= w; }), width);
        assert.ok(fits, `${tag}: every button on screen`);
        await page.evaluate(() => { Game.Pipeline.playHand({ win: true }); });
        await idle(page);
        assert.deepEqual(await overflowReport(page, width), [], `${tag} finished`);
      }
    }
  }
});

// ----- the narrator and the demo -----

s.test('OUTCOME names the game, the seats and how each ended, the pot and the cash, and says the table was shown; the demo tells hold\'em and draw with the seats; the bookkeeper hears the seats and that their memories are recorded', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const one = spot.people[0];
  await presetCards(page, { game: 'draw', seats: [one.id] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  const e = await lastEntry(page);
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(out, new RegExp(`^OUTCOME: the card game \\(the player bought in for \\$20; house rules: \\$20 to sit, \\$1 ante, \\$4 limit \\(every bet and raise \\$4\\), one round of betting after the draw\\): five-card draw with ${one.name} and ${spot.dealerName}, ${spot.dealerName} dealing; `));
  assert.match(out, /The table was shown to the player card by card already: tell the moment and the people, do not list the cards again\./);
  assert.match(out, new RegExp(`\\(cash (now|still) \\$${e.cards.cash}\\)`));
  // Wave 19 (QA D14): new terms at his table are stated first, before the hand is told.
  assert.match(e.narration, new RegExp(`^(?:"[^"]+," ${spot.dealerName} says as you sit down\\. )?At ${spot.dealerName}'s (Friday game at the back table|table), five-card draw with ${one.name}: `));
  assert.equal(e.cards.seats.length, 1);
  await presetCards(page, { game: 'holdem', seats: [one.id] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, 'I bet $20 at cards');
  const e2 = await lastEntry(page);
  assert.match(e2.narration, new RegExp(`^At ${spot.dealerName}'s (Friday game at the back table|table), Texas hold'em with ${one.name}: `));
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`Texas hold'em with ${one.name} and ${spot.dealerName}, ${spot.dealerName} dealing; `));
  assert.match(line(await lastCall(page, 'bookkeep'), 'CARD GAME'), new RegExp(`^CARD GAME \\(already applied by the engine; do not record again\\): the player .* at cards \\(cash now \\$${e2.cards.cash}\\); record no goldDelta for it\\. The other players were ${one.name}, with ${spot.dealerName} dealing`));
  assert.doesNotMatch(e2.narration, /\bnull\b|undefined/);
});

s.test('no innerHTML, outerHTML, insertAdjacentHTML or document.write anywhere: the table, the chooser and the board are built from nodes', async h => {
  const src = fs.readFileSync(GAME_PATH, 'utf8');
  const script = src.split('<script>').slice(1).join('');
  for (const bad of ['.innerHTML', '.outerHTML', 'insertAdjacentHTML', 'document.write']) assert.equal(script.includes(bad), false, bad);
  const page = await open(h);
  await quickStart(page);
  assert.ok(await page.evaluate(() => typeof Game.Pipeline.cheatWin === 'function'));
});

s.run();
