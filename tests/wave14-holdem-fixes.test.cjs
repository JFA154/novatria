'use strict';
/* Wave 14: what a QA player found in about 300 hands of the wave 13 card
   table (hold'em beside draw, more seats, the win cheat), fixed as decided
   (docs/notes/engine-world.md and docs/notes/ui.md, Wave 14). Covered here,
   with the real buttons and pinned cards (hooks.cardsDeal): the Win (cheat)
   never changes a card the player has seen (a marked deck at hold'em and at
   draw) and, when nothing can make the player's hand the best, the others
   fold to them (#1, #13); the player folding with a bet still unanswered
   (#2: the seats that owe it call or fold first; one that never matched it
   cannot win it), on Stop too; small stakes move nobody, a $20 loss does,
   once a day (#3); a phone keeps the player's row and the buttons in view
   after every press (#4); statuses cleared at a new street (#5); the
   street label after a player's fold (#6); verdicts only on cards shown
   (#7); the head's pot after a fold at draw (#8); kickers named (#9);
   /cheat win typed mid-hand and /cheat cards mid-hand (#10); the switch
   hint between hands only (#11); /reroll after a cheat-win hand (#12); the
   demo parser's phrases (#14); no "arrive" for the people at the table
   (#15); the $23 cap (#16); "draw to" is no game (#17); the chooser's
   status line (#18); the chooser in two tabs (#19); varied cheat hands
   (#20); heads-up "Curtis folds" (#21); the 44px Win control on a phone
   (#22); the no-room-for-a-bet hint (#23).
   Mock mode. Run with: node tests/wave14-holdem-fixes.test.cjs */
const assert = require('assert/strict');
const { suite, quickStart, sendText, presetCards, LAPTOP, GAME_URL } = require('./helpers.cjs');

const s = suite('wave14-holdem-fixes');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
const gold = page => page.evaluate(() => Game.state.player.gold);
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
const bgWith = (page, re) => page.evaluate(src => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => new RegExp(src, 'i').test(i.name))), re);
/* The same afternoon of one day, for hands that must be played on it (each hand takes a short). */
const pin = (page, day) => page.evaluate(d => Game.State.apply({ setTime: { day: d, phase: 'afternoon' } }), day);
const npc = (page, id) => page.evaluate(i => { const n = Game.State.npc(i); return { attitude: n.attitude, memories: n.memories.map(m => m.text) }; }, id);
/* The card game's place on an open day, at a phase (its dealer there). */
const atTable = (page, phase) => page.evaluate(want => {
  const G = Game, S = G.State, st = G.state;
  const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
  const PH = ['morning', 'afternoon', 'evening', 'night'];
  for (const ph of want ? [want] : ['evening', 'night', 'afternoon']) {
    let d = st.time.day + (PH.indexOf(ph) < PH.indexOf(st.time.phase) ? 1 : 0);
    while (S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
    const here = S.npcsAt(l.id).map(n => n.id);
    const dealer = G.Pipeline.dealerOf(here);
    if (dealer) return { loc: l.id, name: l.name, phase: ph, day: d, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0], people: G.Pipeline.cardPeople(here, dealer).map(n => ({ id: n.id, name: n.name })) };
  }
  return null;
}, phase || null);
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
/* The next hold'em hand as given: holes in seat order (the player, the seats, the dealer last), the board, who sits in. */
const deal = (page, holes, board, seats) => page.evaluate(([h, b, st]) => { Game.Pipeline.hooks.cardsDeal = { holes: h, board: b, seats: st || [] }; }, [holes, board, seats || []]);
const tableNow = page => page.evaluate(() => {
  const t = [...document.querySelectorAll('#feed .f-cards')].pop();
  if (!t) return null;
  const cards = el => [...el.querySelectorAll('.cards-row .card')].map(c => (c.classList.contains('back') ? 'back' : c.dataset.card));
  const board = t.querySelector('.cards-board');
  return {
    open: t.classList.contains('open'), game: t.dataset.game, head: t.querySelector('.cards-head').textContent,
    seats: [...t.querySelectorAll('.cards-side')].map(el => ({ seat: el.dataset.seat, status: el.querySelector('.cards-status').textContent, read: el.querySelector('.cards-read') ? el.querySelector('.cards-read').textContent : null, verdict: !!el.querySelector('.cards-verdict'), cards: cards(el), name: el.querySelector('.cards-name') ? el.querySelector('.cards-name').textContent : null, won: el.dataset.won === 'true' })),
    board: board ? { street: board.querySelector('.cards-street').textContent, cards: cards(board) } : null,
    pot: t.querySelector('.cards-pot') ? t.querySelector('.cards-pot').textContent : null,
    acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent),
    hint: t.querySelector('.cards-hint') ? t.querySelector('.cards-hint').textContent : null,
    next: t.querySelector('.cards-next') ? t.querySelector('.cards-next').textContent : null,
    result: t.querySelector('.cards-result') ? t.querySelector('.cards-result').textContent : null,
    text: t.textContent
  };
});
const press = async (page, label) => {
  await page.click(`#feed .f-cards.open .cards-acts button:text-is("${label}")`);
  await page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
};
const pressWin = async page => { await page.click('#feed .f-cards.open .cards-win'); await idle(page); };
const best = (page, hole, board) => page.evaluate(([h, b]) => Game.Cards.best(h.concat(b)).key, [hole, board]);
const beats = (page, rec) => page.evaluate(x => [x.dealer].concat(x.seats || []).filter(o => !o.folded).every(o => Game.Cards.compareKeys(Game.Cards.best(x.player.dealt.concat(x.board)).key, Game.Cards.best(o.dealt.concat(x.board)).key) > 0), rec);

// ----- #1 and #13: the win cheat never changes what the player has seen -----

s.test('#1 marked deck at hold\'em: Win (cheat) at the turn keeps Curtis\'s face-up aces and the four board cards; only the river is dealt, and the player\'s hand is strictly the best; at the river with nothing left to deal, Curtis folds to the player (the river\'s label, "folds on the river", the pot as it stands, told as a fold, heads up "Curtis Pruett folds to you")', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked') });
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [] });
  // The player's six-five against his aces: the king that was to come gives him a full house; only a four beats him (a straight), and that is what comes.
  await deal(page, [['6c', '5c'], ['As', 'Ah']], ['Ac', 'Kd', '3s', '2h', 'Kh']);
  await startHand(page, "heads up hold'em for $20");
  // To the turn: check (he bets with aces), call; check, call.
  while ((await tableNow(page)).board.street !== 'The turn') await press(page, (await tableNow(page)).acts[0]);
  let t = await tableNow(page);
  assert.deepEqual(t.seats[0].cards, ['As', 'Ah'], 'his aces are face up (the marked deck)');
  assert.deepEqual(t.board.cards, ['Ac', 'Kd', '3s', '2h', 'back']);
  await pressWin(page);
  let c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual(c.dealer.dealt, ['As', 'Ah'], 'the aces stay');
  assert.deepEqual(c.player.dealt, ['6c', '5c'], 'the player\'s two stay');
  assert.deepEqual(c.board.slice(0, 4), ['Ac', 'Kd', '3s', '2h'], 'the four turned stay');
  assert.equal(c.board[4][0], '4', 'the river is a card that wins');
  assert.deepEqual([c.win, c.result, c.winners, c.street, c.shown, c.uncontested], ['control', 'win', ['player'], 4, 5, undefined]);
  assert.ok(await beats(page, c), `strictly the best: ${c.player.name} against ${c.dealer.name}`);
  assert.deepEqual([t.seats[0].cards, t.seats[0].status, t.seats[1].status, t.board.street], [['As', 'Ah'], 'Three of a kind, aces', 'Straight, six high · takes the pot', 'Showdown']);
  // The QA's hand at the turn: seven-deuce against his face-up aces, one card to come, and none of them wins: he folds to the player on the turn.
  await deal(page, [['7c', '2d'], ['As', 'Ah']], ['Ac', 'Kd', 'Qd', '3s', '4h']);
  await startHand(page, "heads up hold'em for $20");
  while ((await tableNow(page)).board.street !== 'The turn') await press(page, (await tableNow(page)).acts[0]);
  await pressWin(page);
  c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.dealer.dealt, c.board.slice(0, 4), c.uncontested, c.dealer.foldedOn, c.shown, t.board.street, t.seats[0].status, t.seats[0].cards], [['As', 'Ah'], ['Ac', 'Kd', 'Qd', '3s'], true, 2, 4, 'The turn', 'folds on the turn', ['As', 'Ah']]);
  assert.doesNotMatch(t.text, /Ace high · takes/, 'no weaker hand takes the pot');
  assert.equal(t.seats[1].status, 'takes the pot');
  // At the river: the board is complete and his aces are seen, so nothing can change: he folds to the player.
  const g0 = await gold(page);
  await deal(page, [['7c', '2d'], ['As', 'Ah']], ['Ac', 'Kd', 'Qd', '3s', '4h']);
  await startHand(page, "heads up hold'em for $20");
  while ((await tableNow(page)).board.street !== 'The river') await press(page, (await tableNow(page)).acts[0]);
  const before = await tableNow(page);
  const potBefore = Number(/Pot \$(\d+)/.exec(before.pot)[1]);
  const facing = before.acts[0].startsWith('Call');
  await pressWin(page);
  c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.dealer.dealt, c.board], [['As', 'Ah'], ['Ac', 'Kd', 'Qd', '3s', '4h']], 'nothing seen changes');
  assert.deepEqual([c.win, c.result, c.uncontested, c.winners, c.dealer.folded, c.dealer.foldedOn, c.street], ['control', 'win', true, ['player'], true, 3, 3]);
  assert.equal(c.pot, potBefore + (facing ? 4 : 0), 'the pot as it stands (a bet the player faced, called first)');
  assert.deepEqual([t.board.street, t.seats[0].status, t.seats[1].status], ['The river', 'folds on the river', 'takes the pot'], 'the river\'s label, his fold, no hand "taking the pot" at a showdown');
  assert.doesNotMatch(t.text, /Royal flush|Three of a kind, aces · /);
  assert.equal(await gold(page) - g0, c.delta);
  assert.equal(c.delta, c.pot - c.player.in);
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(out, new RegExp(`${spot.dealerName} folded on the river; the player takes the \\$${c.pot} pot without a showdown`));
  assert.doesNotMatch(out, /everyone/);
  assert.match((await lastEntry(page)).narration, new RegExp(`${spot.dealerName} folds to you on the river, and the \\$${c.pot} pot is yours`));
  assert.doesNotMatch((await lastEntry(page)).narration, /everyone folds/);
});

s.test('#1 marked deck at draw: Win (cheat) keeps every hand as dealt and what the others hold, dealing only the draws (the player\'s pair becomes the best); a pat four aces nothing beats makes Curtis throw his hand in instead (his cards as dealt, face up, "folds"), never a weaker hand taking the pot', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked') });
  await fast(page);
  await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  // Curtis holds his aces and draws three; the player's sevens draw to something better.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsDeal = { player: ['7c', '7d', 'Kh', '4s', '2c'], dealer: ['As', 'Ah', '9d', '5c', '3h'], playerPile: ['8d', '9c', 'Jh', 'Qs', '6d'], dealerPile: ['Ad', 'Kd', 'Kc', 'Ts', '2h'] }; });
  await startHand(page, 'heads up, five-card draw for $20');
  let t = await tableNow(page);
  assert.deepEqual(t.seats[0].cards, ['As', 'Ah', '9d', '5c', '3h'], 'face up with the marked deck');
  await pressWin(page);
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.dealer.dealt, c.dealer.held], [['As', 'Ah', '9d', '5c', '3h'], [0, 1]], 'his five as dealt, and what he holds by his rule');
  assert.deepEqual(c.dealer.final.slice(0, 2), ['As', 'Ah']);
  assert.deepEqual(c.player.dealt, ['7c', '7d', 'Kh', '4s', '2c']);
  assert.ok(c.player.held.every(i => c.player.final[i] === c.player.dealt[i]));
  assert.ok(await page.evaluate(x => Game.Cards.compare(x.player.final, x.dealer.final) > 0, c), `${c.player.name} beats ${c.dealer.name}`);
  assert.deepEqual([c.win, c.result, c.delta], ['control', 'win', 20]);
  // Four aces, pat: nothing the player draws beats them.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsDeal = { player: ['2c', '5d', '9h', 'Js', '3c'], dealer: ['As', 'Ah', 'Ad', 'Ac', 'Kd'], playerPile: ['8d', '9c', 'Jh', 'Qs', '6d'], dealerPile: ['Ks', 'Kc', 'Qd', 'Ts', '2h'] }; });
  const g0 = await gold(page);
  await startHand(page, 'heads up, five-card draw for $20');
  await pressWin(page);
  c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.dealer.dealt, c.dealer.final, c.dealer.folded, c.uncontested, c.result, c.winners, c.pot, c.delta], [['As', 'Ah', 'Ad', 'Ac', 'Kd'], ['As', 'Ah', 'Ad', 'Ac', 'Kd'], true, true, 'win', ['player'], 40, 20]);
  assert.deepEqual([t.seats[0].cards, t.seats[0].status, t.seats[0].name, t.seats[1].status], [['As', 'Ah', 'Ad', 'Ac', 'Kd'], 'folds', null, 'takes the pot']);
  assert.equal(await gold(page), g0 + 20);
  assert.doesNotMatch(t.text, /Four of a kind, aces · takes|draws \d/);
});

s.test('#13 a royal flush on the board (no marked deck): Win (cheat) at the river cannot make the player\'s hand better than the board, so Curtis folds to the player; no tie and no "royal flush takes the pot"', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [] });
  await deal(page, [['2c', '3d'], ['4h', '5c']], ['Ts', 'Js', 'Qs', 'Ks', 'As']);
  await startHand(page, 'I bet $20 at cards');
  while ((await tableNow(page)).board.street !== 'The river') await press(page, (await tableNow(page)).acts[0]);
  await pressWin(page);
  const c = (await lastEntry(page)).cards;
  const t = await tableNow(page);
  assert.deepEqual([c.uncontested, c.winners, c.dealer.folded, c.dealer.dealt, c.board], [true, ['player'], true, ['4h', '5c'], ['Ts', 'Js', 'Qs', 'Ks', 'As']]);
  assert.deepEqual([t.seats[0].status, t.seats[0].cards, t.seats[1].status, t.board.street], ['folds on the river', ['back', 'back'], 'takes the pot', 'The river']);
  assert.doesNotMatch(t.text, /Royal flush/);
  assert.match((await lastEntry(page)).narration, new RegExp(`${spot.dealerName} folds to you on the river`));
});

// ----- #2: the player folds with a bet still unanswered -----

s.test('#2 the player folds while a bet is unanswered: the seats that owe it call or fold as they would before anything is settled (Royce\'s seven-deuce folds and cannot win the pot it never matched; his ace-nine calls, the ins show it), the rest is checked down to a showdown, and Stop does the same', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'afternoon');
  const royce = 'npc_royce';
  assert.ok(spot.people.some(p => p.id === royce), 'Royce plays in the afternoon');
  await presetCards(page, { game: 'holdem', seats: null });
  // The QA's hand: Royce would make a full house, but folds to Curtis's bet once the player has folded.
  await deal(page, [['3c', '4c'], ['7c', '2d'], ['Ah', 'Ad']], ['7d', '7h', '2h', 'Kc', '9s'], [royce]);
  await startHand(page, "deal me in at hold'em for $20");
  await press(page, 'Check');
  let t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.acts], ['bets $4', 'checks', ['Call $4', 'Fold']], 'Curtis bets after Royce checks; Royce has not answered it');
  await press(page, 'Fold');
  await idle(page);
  let c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.player.in, c.seats[0].in, c.dealer.in], [4, 4, 8]);
  assert.deepEqual([c.seats[0].folded, c.seats[0].foldedOn, c.winners, c.dealer.won, c.seats[0].won], [true, 0, [spot.dealer], 16, 0], 'Royce folds the bet he never matched and wins nothing');
  assert.equal(t.seats[1].status, 'folds before the flop');
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.doesNotMatch(out, /Royce Pittman's full house/);
  assert.ok(!(await npc(page, royce)).memories.some(m => /took a pot off/.test(m)));
  // Royce's ace-nine checks, then calls the bet: in for $8; the rest is checked down; the best of the two takes it.
  await deal(page, [['3c', '4c'], ['Ac', '9d'], ['Ah', 'Ad']], ['7d', '7h', '2h', 'Kc', '9s'], [royce]);
  await startHand(page, "deal me in at hold'em for $20");
  await press(page, 'Check');
  await press(page, 'Fold');
  await idle(page);
  c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.player.in, c.seats[0].in, c.dealer.in, c.pot, c.seats[0].folded, c.winners], [4, 8, 8, 20, undefined, [spot.dealer]], 'Royce called: the ins show the call; nobody bets after the player has gone');
  assert.deepEqual([c.street, c.shown, t.board.street], [4, 5, 'Showdown'], '#6: five cards up is the showdown');
  assert.deepEqual(t.seats[1].cards, ['Ac', '9d'], 'shown at the showdown');
  assert.equal(t.seats[2].status, 'folds before the flop');
  // Stop with the bet unanswered: the same path.
  await deal(page, [['3c', '4c'], ['7c', '2d'], ['Ah', 'Ad']], ['7d', '7h', '2h', 'Kc', '9s'], [royce]);
  await startHand(page, "deal me in at hold'em for $20");
  await press(page, 'Check');
  await page.click('#send');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.result, c.stopped, c.seats[0].folded, c.winners, c.seats[0].in, c.dealer.in], ['fold', true, true, [spot.dealer], 4, 8]);
  // The engine, pure: after the player's fold no seat bets, and every one still in has matched the bet.
  const runs = await page.evaluate(() => {
    const P = Game.Pipeline;
    const H = t => t.split(' ');
    const out = [];
    for (let seed = 1; seed <= 120; seed++) {
      const h = { seed, unit: 4, cap: 20, stacked: false, board: H('7d 7h 2h Kc 9s'), seats: [{ key: 'player', hole: H('3c 4c'), tilt: 0 }, { key: 'a', hole: H('Ac 9d'), tilt: 0.1 }, { key: 'b', hole: H('Qs Jd'), tilt: -0.1 }, { key: 'c', hole: H('Ah Ad'), tilt: 0 }] };
      let moves = [];
      let r = P.holdemRun(h, moves);
      while (r.need) { moves = moves.concat(r.need[0] === 'call' ? 'fold' : 'check'); r = P.holdemRun(h, moves); }
      const top = Math.max(...r.in.filter((x, i) => !r.folded[i]));
      out.push({ done: r.done, folded: r.playerFolded, matched: r.in.every((x, i) => r.folded[i] || x === top) });
    }
    return out;
  });
  assert.ok(runs.every(r => r.done), 'every hand ends');
  assert.ok(runs.every(r => r.matched), 'everyone still in matched the bet');
});

// ----- #3: small stakes move nobody; once a day -----

s.test('#3 a $1 hand moves nobody (lost or won), a seat that takes $10 or more of the player\'s money likes them 1 more, a $20 loss to the player costs a seat 2, and only the first such change a day counts', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'afternoon');
  const ids = spot.people.map(p => p.id);
  assert.ok(ids.includes('npc_royce') && ids.includes('npc_elbert'));
  await presetCards(page, { game: 'holdem', seats: null });
  const a0 = { royce: await npc(page, 'npc_royce'), elbert: await npc(page, 'npc_elbert') };
  // The player wins a $1 hand: every seat lost the most it could ($1), which is under $10.
  for (let i = 0; i < 3; i++) {
    await pin(page, spot.day);
    await deal(page, [['Ah', 'Ad'], ['7c', '2d'], ['8c', '3d'], ['9c', '4d']], ['2s', '5h', 'Jd', 'Kc', 'Qs'], ['npc_royce', 'npc_elbert']);
    await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
    await sendText(page, "deal everyone in at hold'em for $1");
    assert.deepEqual((await lastEntry(page)).cards.winners, ['player']);
  }
  // And loses $1 hands to Royce.
  for (let i = 0; i < 3; i++) {
    await pin(page, spot.day);
    await deal(page, [['7c', '2d'], ['Ah', 'Ad']].concat([['9c', '4d']]), ['2s', '5h', 'Jd', 'Kc', 'Qs'], ['npc_royce']);
    await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
    await sendText(page, "deal me in at hold'em for $1");
    assert.deepEqual((await lastEntry(page)).cards.winners, ['npc_royce']);
  }
  assert.deepEqual([await npc(page, 'npc_royce'), await npc(page, 'npc_elbert')], [a0.royce, a0.elbert], '$1 hands move nobody');
  // Royce takes $20 of the player's money: +1, remembered.
  await pin(page, spot.day);
  await deal(page, [['7c', '2d'], ['As', 'Ad'], ['3c', '4h']], ['Ks', 'Kd', '9c', '8h', '5s'], ['npc_royce']);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, "deal me in at hold'em for $20");
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.winners, c.player.in >= 10], [['npc_royce'], true]);
  let r = await npc(page, 'npc_royce');
  assert.equal(r.attitude, a0.royce.attitude + 1);
  assert.ok(r.memories.includes('took a pot off Tester at cards at the Low Water'));
  // The same day again: no second change.
  await pin(page, spot.day);
  await deal(page, [['7c', '2d'], ['As', 'Ad'], ['3c', '4h']], ['Ks', 'Kd', '9c', '8h', '5s'], ['npc_royce']);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, "deal me in at hold'em for $20");
  assert.deepEqual((await lastEntry(page)).cards.winners, ['npc_royce']);
  r = await npc(page, 'npc_royce');
  assert.equal(r.attitude, a0.royce.attitude + 1, 'once a day');
  assert.equal(r.memories.filter(m => m === 'took a pot off Tester at cards at the Low Water').length, 1);
  // A $20 loss for Elbert (the armed win: every seat still in calls every street): -2 and the memory.
  await presetCards(page, { game: 'holdem', seats: ['npc_elbert'] });
  await pin(page, spot.day);
  await sendText(page, '/cheat win');
  await sendText(page, "deal me in at hold'em for $20");
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.win, c.seats[0].in], ['armed', 20]);
  const e = await npc(page, 'npc_elbert');
  assert.equal(e.attitude, a0.elbert.attitude - 2);
  assert.ok(e.memories.includes('lost $20 to Tester at cards at the Low Water'));
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /Already recorded: Elbert Gentry lost \$20 to the player/);
  // The next day it counts again.
  const day2 = await page.evaluate(d => { const S = Game.State; const l = S.loc(Game.state.player.locationId); let n = d + 1; while (S.isClosed(l, n)) n++; return n; }, spot.day);
  await pin(page, day2);
  await sendText(page, '/cheat win');
  await sendText(page, "deal me in at hold'em for $20");
  assert.equal((await npc(page, 'npc_elbert')).attitude, a0.elbert.attitude - 4, 'a new day: the first change counts');
});

// ----- #4: a phone keeps the player's row and the buttons in view -----

s.test('#4 phones (390×844, 375×667, 320×640) with five at the table: after every press the player\'s cards, the hand\'s buttons and the Win (cheat) control are inside the story area, with no scrolling', async h => {
  for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 640 }]) {
    const page = await open(h, vp, { contextOptions: { reducedMotion: 'reduce', isMobile: true, hasTouch: true } });
    await quickStart(page);
    await fast(page);
    const spot = await atTable(page, 'evening');
    assert.equal(spot.people.length, 3, 'three card players in the evening');
    await presetCards(page, { game: 'holdem', seats: spot.people.map(p => p.id) });
    // Everyone has something to play with, so the hand goes to the river.
    await deal(page, [['Ah', 'Kh'], ['Qc', 'Qd'], ['Jc', 'Jd'], ['Tc', 'Td'], ['9c', '9d']], ['2s', '5h', '8d', '3c', '4s'], spot.people.map(p => p.id));
    await startHand(page, "deal everyone in at hold'em for $20");
    let presses = 0;
    while (await page.evaluate(() => Game.Pipeline.handOpen)) {
      const label = (await tableNow(page)).acts[0];
      await press(page, label);
      presses++;
      if (!(await page.evaluate(() => Game.Pipeline.handOpen))) break;
      await page.waitForTimeout(60);
      const geo = await page.evaluate(() => {
        const f = document.querySelector('#feed-scroll');
        const box = f.getBoundingClientRect();
        const t = document.querySelector('#feed .f-cards.open');
        const inside = el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1; };
        return { you: inside(t.querySelector('.cards-you .cards-row')), acts: [...t.querySelectorAll('.cards-acts button')].every(inside), win: inside(t.querySelector('.cards-win')), street: t.querySelector('.cards-street').textContent };
      });
      assert.deepEqual([geo.you, geo.acts, geo.win], [true, true, true], `${vp.width}×${vp.height} after press ${presses} (${label}, now ${geo.street})`);
    }
    assert.ok(presses >= 3, 'several presses');
    await idle(page);
  }
});

// ----- #5, #6, #7: statuses, the label, the verdicts -----

s.test('#5 a new street starts with the statuses of the seats still in cleared (nothing looks like a live bet), a seat that folded keeps "folds before the flop"; #7 a seat that bet (a read) and folded face down has no verdict, and cards shown after the player folds do', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [] });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Check');
  let t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.seats[1].status], ['bets $4', 'checks']);
  await press(page, 'Call $4');
  t = await tableNow(page);
  assert.deepEqual([t.board.street, t.seats[0].status, t.seats[1].status, t.acts], ['The flop', '', '', ['Check', 'Bet $4']], 'the flop starts clean');
  assert.match(t.seats[0].read, /^Your read: /, 'the read stays by his seat');
  await page.click('#send');
  await idle(page);
  // Lyman bets his eights before the flop (a read), then folds them face down on the river to the player's bet; Curtis folds before the flop.
  const lyman = 'npc_lyman';
  assert.ok(spot.people.some(p => p.id === lyman));
  await presetCards(page, { game: 'holdem', seats: [lyman] });
  await deal(page, [['Ah', 'Kh'], ['8c', '8d'], ['6c', '2d']], ['As', 'Kd', 'Qh', '2c', '3s'], [lyman]);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Check');
  t = await tableNow(page);
  assert.equal(t.seats[1].status, 'bets $4', 'Lyman bets');
  assert.match(t.seats[1].read, /^Your read: Lyman /);
  await press(page, 'Call $4');
  t = await tableNow(page);
  assert.equal(t.seats[0].status, 'folds before the flop', 'Curtis folded and says when');
  assert.equal(t.seats[1].status, '', 'Lyman\'s bet is not a live bet on the flop');
  await press(page, 'Check');
  await press(page, 'Check');
  t = await tableNow(page);
  assert.equal(t.seats[0].status, 'folds before the flop', 'the fold stays');
  await press(page, 'Bet $4');
  await idle(page);
  const c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.result, c.uncontested, c.seats[0].folded, c.seats[0].foldedOn], ['win', true, true, 3]);
  assert.deepEqual([t.seats[1].cards, t.seats[1].status], [['back', 'back'], 'folds on the river']);
  assert.ok(t.seats[1].read && !t.seats[1].verdict, 'the read stays, with no verdict: his cards were never shown');
  assert.equal(t.board.street, 'The river', '#6: everyone folded on the river: the street it stopped on');
  // Shown after the player folds: a verdict.
  await presetCards(page, { game: 'holdem', seats: ['npc_royce'] });
  await atTable(page, 'afternoon');
  await deal(page, [['3c', '4c'], ['Ac', '9d'], ['Ah', 'Ad']], ['7d', '7h', '2h', 'Kc', '9s'], ['npc_royce']);
  await startHand(page, "deal me in at hold'em for $20");
  await press(page, 'Check');
  t = await tableNow(page);
  assert.match(t.seats[0].read, /^Your read: Curtis /);
  await press(page, 'Fold');
  await idle(page);
  t = await tableNow(page);
  assert.deepEqual(t.seats[0].cards, ['Ah', 'Ad']);
  assert.ok(t.seats[0].verdict, 'his cards are shown after the player folds: the verdict');
});

// ----- #8, #9: the head's pot at draw, the kickers -----

s.test('#8 at draw the head\'s pot is the real pot after a fold (heads up $30, five at the table $90); #9 two shown hands of the same name are told apart by the deciding cards ("Pair of aces, nine kicker" / "eight kicker"; "Flush, ace-king high" / "ace-queen high"), an exact tie keeps one name', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  await startHand(page, 'heads up, five-card draw for $20');
  assert.match((await tableNow(page)).head, / · pot \$40$/, 'open: the stake each');
  await page.click('.cards-fold');
  await idle(page);
  let c = (await lastEntry(page)).cards;
  assert.equal(c.pot, 30);
  assert.equal((await tableNow(page)).head, `${spot.dealerName}'s table · Five-card draw · stake $20 · pot $30`);
  await presetCards(page, { game: 'draw', seats: spot.people.map(p => p.id) });
  await startHand(page, 'deal everyone in at five-card draw for $20');
  await page.click('.cards-fold');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.equal(c.pot, 90);
  assert.match((await tableNow(page)).head, / · pot \$90$/);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /the \$90 pot/);
  // The kicker decides.
  await presetCards(page, { game: 'holdem', seats: [] });
  await deal(page, [['Ah', '9c'], ['Ad', '8c']], ['As', 'Kd', '7h', '4c', '2s']);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, 'I bet $20 at cards');
  c = (await lastEntry(page)).cards;
  const t = await tableNow(page);
  assert.deepEqual([c.player.name, c.dealer.name], ['Pair of aces, nine kicker', 'Pair of aces, eight kicker']);
  assert.deepEqual([t.seats[1].status, t.seats[0].status], ['Pair of aces, nine kicker · takes the pot', 'Pair of aces, eight kicker']);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /pair of aces, eight kicker/);
  const names = await page.evaluate(() => {
    const C = Game.Cards;
    const H = t => t.split(' ');
    return {
      flush: C.namesApart([H('Ah Kh 9h 7h 3h'), H('Ad Qd Jd 9d 4d')]),
      flush3: C.namesApart([H('Ah Kh 9h 7h 3h'), H('Ad Kd 8d 7d 4d')]),
      twoPair: C.namesApart([H('Jh Jd 8h 8c Qs'), H('Js Jc 8s 8d Ts')]),
      high: C.namesApart([H('Ah Kd 9h 7c 3h'), H('Ad Qc Jd 9s 4d')]),
      tie: C.namesApart([H('Ah Kd 9h 7c 3h'), H('Ad Kc 9d 7s 3d')]),
      apart: C.namesApart([H('Ah Ad 9h 7c 3h'), H('Kd Kc 9d 7s 3d'), null])
    };
  });
  assert.deepEqual(names, {
    flush: ['Flush, ace-king high', 'Flush, ace-queen high'],
    flush3: ['Flush, ace-king-nine high', 'Flush, ace-king-eight high'],
    twoPair: ['Two pair, jacks and eights, queen kicker', 'Two pair, jacks and eights, ten kicker'],
    high: ['Ace-king high', 'Ace-queen high'],
    tie: ['Ace high', 'Ace high'],
    apart: ['Pair of aces', 'Pair of kings', null]
  }, 'longer only where two of one name differ');
});

// ----- #10, #11, #12: the typed cheats, the switch hint, /reroll -----

s.test('#10 /cheat win typed with a hand open is the Win (cheat) control; /cheat cards there says the cards are dealt; the nudge names the control; #11 the switch hint is on the chooser and under the newest finished table ("Next hand: …"), never on an open hand; #12 /reroll after a cheat-win hand: "Nothing to reroll: that hand was yours.", the cheat stays spent', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  await presetCards(page, { game: null, seats: [] });
  // The chooser: the hint names the words; the status line asks for the game (#18).
  await startHand(page, 'deal me in');
  let t = await tableNow(page);
  assert.match(t.hint, /Name the game in your words to skip this choice \(hold'em or draw\)\. Win \(cheat\)$/);
  assert.equal(await page.textContent('#turn-status-text'), "Choose the game: Five-card draw or Texas hold'em. Stop leaves the table (nothing lost).");
  await page.click("#feed .f-cards.open .cards-game:text-is(\"Texas hold'em\")");
  await page.waitForSelector('#feed .f-cards.open[data-game="holdem"]');
  t = await tableNow(page);
  assert.doesNotMatch(t.text, /Name the game|Next hand/, 'not on an open hand');
  assert.equal(await page.textContent('#turn-status-text'), 'Your hand');
  // /cheat cards mid-hand: the cards are dealt.
  await page.fill('#cmd', '/cheat cards');
  await page.press('#cmd', 'Enter');
  assert.equal(await page.textContent('#turn-status-text'), 'The cards are dealt: use Win (cheat) or type /cheat win.');
  assert.equal(await page.evaluate(() => [Game.Pipeline.handOpen, Game.state.flags.cardsCheat]).then(x => x.join()), 'true,');
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  assert.match(await page.textContent('#turn-status-text'), /^Your hand is on the table: Check or Bet\. Stop folds the hand \(−\$4\); Win \(cheat\) ends it yours\.$/);
  // /cheat win typed: the Win (cheat) control.
  await page.fill('#cmd', '/cheat win');
  await page.press('#cmd', 'Enter');
  await idle(page);
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.win, c.result, c.winners], ['control', 'win', ['player']]);
  assert.equal(await page.inputValue('#cmd'), '', 'the line is taken');
  assert.equal(await page.evaluate(() => Game.Pipeline.winArmed), false, 'nothing armed for later');
  t = await tableNow(page);
  assert.equal(t.next, "Next hand: name the game in your words to switch (hold'em or draw).");
  // /reroll: that hand was yours; the armed cheat's hand too, and it stays spent.
  await sendText(page, '/reroll');
  assert.equal(await lastNotice(page), 'Nothing to reroll: that hand was yours.');
  await sendText(page, '/cheat win');
  await sendText(page, 'I bet $20 at cards');
  assert.equal((await lastEntry(page)).cards.win, 'armed');
  await sendText(page, '/reroll');
  assert.equal(await lastNotice(page), 'Nothing to reroll: that hand was yours.');
  assert.equal(await page.evaluate(() => Game.Pipeline.winArmed), false, 'spent: only /undo arms it again');
  // The newest finished table only has the line.
  assert.equal(await page.locator('#feed .f-cards .cards-next').count(), 1);
  assert.equal((await tableNow(page)).next, "Next hand: name the game in your words to switch (hold'em or draw).");
});

// ----- #14, #15, #17, #21: the words and the demo -----

s.test('#14 the demo reads a hand of cards, sitting in, "deal me a hand" and a game named in a short line as a bet (the last game named wins; the stake from the words or the usual), and "I bet he is lying" as talk; #17 drawing cards is not the game; #15 nobody at the table "arrives" after the hand; #21 heads up "Curtis Pruett folds to you"', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  const parsed = await page.evaluate(async () => {
    const out = {};
    for (const t of ['I sit down with Curtis for a hand of cards, five dollars', 'a hand of cards', 'sit in', 'Mind if I sit in?', 'deal me a hand', "hold'em? no, five card draw", 'I bet he is lying', 'I bet you ten bucks it rains', 'I sit in the corner']) out[t] = (await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' }))).actionType;
    return out;
  });
  assert.deepEqual(parsed, {
    'I sit down with Curtis for a hand of cards, five dollars': 'gamble', 'a hand of cards': 'gamble', 'sit in': 'gamble', 'Mind if I sit in?': 'gamble', 'deal me a hand': 'gamble', "hold'em? no, five card draw": 'gamble',
    'I bet he is lying': parsed['I bet he is lying'] === 'gamble' ? 'talk' : parsed['I bet he is lying'], 'I bet you ten bucks it rains': parsed['I bet you ten bucks it rains'] === 'gamble' ? 'talk' : parsed['I bet you ten bucks it rains'], 'I sit in the corner': parsed['I sit in the corner'] === 'gamble' ? 'not' : parsed['I sit in the corner']
  });
  const games = await page.evaluate(() => ["Deal me in. I'll draw to an inside straight", 'I draw two', 'I draw three cards', 'I draw five cards', 'I draw a card', 'draw the queen', "hold'em? no, five card draw", 'a hand of draw', "deal me in at hold'em", 'five-card draw'].map(Game.Pipeline.gameFrom));
  assert.deepEqual(games, [null, null, null, null, null, null, 'draw', 'draw', 'holdem', 'draw']);
  // The QA's line, played: a $5 hand of draw from the words; the last game named.
  await presetCards(page, { game: 'holdem', seats: [] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, "hold'em? no, five card draw");
  let e = await lastEntry(page);
  assert.deepEqual([e.cards.game, e.cards.stake], ['draw', 20]);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I sit down with Curtis for a hand of cards, five dollars');
  e = await lastEntry(page);
  assert.deepEqual([e.cards.game, e.cards.stake], ['draw', 5]);
  // Heads up, Curtis folds to the player's bet: named, never "everyone".
  await presetCards(page, { game: 'holdem', seats: [] });
  await deal(page, [['Ah', 'Ad'], ['3c', '2d']], ['9s', 'Td', '4h', '6c', 'Js']);
  await startHand(page, 'I bet $20 at cards');
  await press(page, 'Bet $4');
  await idle(page);
  e = await lastEntry(page);
  assert.deepEqual([e.cards.uncontested, e.cards.dealer.folded], [true, true]);
  assert.match(e.narration, new RegExp(`${spot.dealerName} folds to you before the flop, and the \\$\\d+ pot is yours`));
  assert.doesNotMatch(e.narration, /everyone folds/);
  // The people who sat in never "arrive" after the hand they played (the afternoon crowd came while the player waited).
  const page2 = await open(h);
  await quickStart(page2);
  await fast(page2);
  await atTable(page2, 'morning').catch(() => null);
  await page2.evaluate(() => { const G = Game, S = G.State; const l = G.state.locations.find(x => G.Pipeline.cardGameAt(x)); while (G.state.time.phase !== 'morning') S.apply({ advanceTime: 'long' }); while (S.isClosed(l)) S.apply({ setTime: { day: G.state.time.day + 1, phase: 'morning' } }); S.apply({ playerLocationId: l.id }); });
  await sendText(page2, 'I wait a while');
  assert.equal(await page2.evaluate(() => Game.state.time.phase), 'afternoon');
  await presetCards(page2, { game: 'holdem', seats: null });
  await page2.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page2, "deal everyone in, hold'em, $20");
  const e2 = await lastEntry(page2);
  assert.ok(e2.cards && e2.cards.seats.length >= 1, 'seats sat in');
  assert.doesNotMatch(e2.narration, /\barrives?\b/, e2.narration);
});

// ----- #16, #18, #19: the cap, the chooser's status, two tabs -----

s.test('#16 a $23 stake at hold\'em says the real cap everywhere: the head and the pot line "at most $20 in", OUTCOME "came in for at most $20 of the $23 named"; #23 when there is no room for a bet the hint says why', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [] });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $23 at cards');
  let t = await tableNow(page);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · stake $23 · at most $20 in · pot $8`);
  assert.equal(t.pot, 'Pot $8 · you\'re in for $4 · at most $20 in');
  await page.click('#send');
  await idle(page);
  assert.match((await tableNow(page)).head, /stake \$23 · at most \$20 in · pot \$8$/);
  // Played to the showdown: the narrator hears the cap.
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, 'I bet $23 at cards');
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /^OUTCOME: the card game \(the player came in for at most \$20 of the \$23 named; the ante and every bet \$4\)/);
  assert.ok((await lastEntry(page)).cards.player.in <= 20);
  // A multiple of $5: as before.
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  assert.equal((await tableNow(page)).head, `${spot.dealerName}'s table · Texas hold'em · stake $20 · pot $8`);
  await page.click('#send');
  await idle(page);
  // $3: bet, bet, and then only Check, with the reason.
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $3 at cards');
  await press(page, 'Bet $1');
  await press(page, 'Bet $1');
  t = await tableNow(page);
  assert.deepEqual([t.board.street, t.acts], ['The turn', ['Check']]);
  assert.equal(t.hint, "Check only (no room for a bet: you're in for your whole $3). Stop folds the hand (−$3). Win (cheat)");
  await page.click('#send');
  await idle(page);
});

s.test('#19 two tabs with the chooser open: tab A\'s turn is taken back with "Another tab took over; the table is closed here." (the line back in the box, no table left), nothing is lost in either tab', async h => {
  const a = await open(h);
  await quickStart(a);
  await fast(a);
  await atTable(a, 'evening');
  await presetCards(a, { game: null, seats: [] });
  await sendText(a, 'I look around');
  const g0 = await gold(a);
  const log0 = await a.evaluate(() => Game.state.log.length);
  await startHand(a, 'deal me in');
  const b = await a.context().newPage();
  await b.goto(GAME_URL);
  await b.waitForFunction(() => window.Game && Game.App);
  await fast(b);
  await b.click('#btn-continue');
  await b.waitForSelector('#screen-game.active');
  await idle(b);
  assert.deepEqual([await gold(b), await b.evaluate(() => Game.state.log.length)], [g0, log0], 'tab B: nothing lost, nothing played');
  await a.waitForFunction(() => Game.Storage.readOnly && !Game.Pipeline.busy);
  const r = await a.evaluate(() => ({ open: Game.Pipeline.handOpen, tables: document.querySelectorAll('#feed .f-cards').length, inputs: [...document.querySelectorAll('#feed .f-input')].map(x => x.textContent).filter(x => /deal me in/.test(x)).length, box: document.querySelector('#cmd').value, gold: Game.state.player.gold, log: Game.state.log.length }));
  assert.deepEqual(r, { open: false, tables: 0, inputs: 0, box: 'deal me in', gold: g0, log: log0 });
  assert.equal(await lastNotice(a), 'Another tab took over; the table is closed here.');
});

// ----- #20: varied cheat hands -----

s.test('#20 /cheat win and /cheat cards at hold\'em deal several shapes of winning hand by the seed (a set, the nut flush, a straight, a full house, four of a kind), always strictly the best, the others holding hands that lose; with /cheat cards nobody folds before the flop; at draw a full house, a flush or a straight', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(() => {
    const C = Game.Cards, P = Game.Pipeline;
    const shapes = {};
    let worst = 1;
    let early = 0;
    let rest = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const n = 2 + (seed % 4);
      const d = C.holdemStacked(Game.Rng.create(seed), n);
      const mine = C.best(d.holes[0].concat(d.board));
      shapes[C.RANK_NAMES[mine.rank]] = (shapes[C.RANK_NAMES[mine.rank]] || 0) + 1;
      for (const o of d.holes.slice(1)) worst = Math.min(worst, Math.sign(C.compareKeys(mine.key, C.best(o.concat(d.board)).key)));
      if (new Set(d.holes.flat().concat(d.board)).size !== 2 * n + 5) worst = -9;
      // Second-best hands: the others have more than nothing, most of the time.
      rest += d.holes.slice(1).filter(o => C.best(o.concat(d.board)).rank >= 1).length / (n - 1);
      // /cheat cards: the player bets before the flop and nobody folds.
      const h = { seed, unit: 4, cap: 20, stacked: true, board: d.board, seats: d.holes.map((x, i) => ({ key: i ? `s${i}` : 'player', hole: x, tilt: -0.15 })) };
      const run = P.holdemRun(h, ['bet']);
      if (run.folded.some(Boolean)) early++;
    }
    const draw = new Set();
    for (let seed = 1; seed <= 60; seed++) draw.add(C.evaluate(C.deal(Game.Rng.create(seed), { stacked: true, seats: 3 }).player).name.split(',')[0]);
    return { shapes, worst, early, rest: rest / 200, draw: [...draw].sort() };
  });
  assert.equal(r.worst, 1, 'always strictly the best, no card twice');
  assert.ok(Object.keys(r.shapes).length >= 4, JSON.stringify(r.shapes));
  for (const k of ['Three of a kind', 'Flush', 'Straight', 'Full house', 'Four of a kind']) assert.ok(r.shapes[k] > 10, `${k}: ${r.shapes[k]}`);
  assert.equal(r.early, 0, 'nobody folds before the flop');
  assert.ok(r.rest > 0.7, `the others hold something: ${r.rest}`);
  assert.deepEqual(r.draw, ['Flush', 'Full house', 'Straight']);
  // Played: an armed /cheat win with two seats, two seeds apart, two shapes.
  const seen = new Set();
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    const p = await open(h);
    await quickStart(p, { seed });
    await fast(p);
    const spot = await atTable(p, 'evening');
    await presetCards(p, { game: 'holdem', seats: spot.people.slice(0, 2).map(x => x.id) });
    await sendText(p, '/cheat win');
    await sendText(p, 'I bet $20 at cards');
    const c = (await lastEntry(p)).cards;
    assert.deepEqual([c.win, c.winners], ['armed', ['player']]);
    assert.ok(await beats(p, c), c.player.name);
    seen.add(c.player.name.split(',')[0]);
    if (seen.size >= 2) break;
  }
  assert.ok(seen.size >= 2, [...seen].join(' / '));
});

// ----- #22: the Win (cheat) control's tap height -----

s.test('#22 on a phone the Win (cheat) control keeps its small look but is 44px tall, as the app\'s taps are; on a laptop it stays small', async h => {
  const phone = await open(h, { width: 390, height: 844 }, { contextOptions: { reducedMotion: 'reduce', isMobile: true, hasTouch: true } });
  await quickStart(phone);
  await fast(phone);
  await atTable(phone, 'evening');
  await presetCards(phone, { game: 'holdem', seats: [] });
  await startHand(phone, 'I bet $20 at cards');
  const ph = await phone.evaluate(() => { const b = document.querySelector('#feed .f-cards.open .cards-win'); const r = b.getBoundingClientRect(); return { h: r.height, w: r.width, small: b.classList.contains('small') }; });
  assert.ok(ph.h >= 44, `phone: ${ph.h}px tall`);
  assert.ok(ph.w < 140 && ph.small, 'still the small control');
  const lap = await open(h);
  await quickStart(lap);
  await fast(lap);
  await atTable(lap, 'evening');
  await presetCards(lap, { game: 'holdem', seats: [] });
  await startHand(lap, 'I bet $20 at cards');
  assert.ok(await lap.evaluate(() => document.querySelector('#feed .f-cards.open .cards-win').getBoundingClientRect().height) < 44, 'laptop: small');
});

s.run();
