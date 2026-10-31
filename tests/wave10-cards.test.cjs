'use strict';
/* Wave 10: the card game is five-card draw played at a table in the feed
   (the owner: "Poker is so confusing with texts. When playing poker, there
   should be a proper ui to see everything and a cheat to win"). The deck
   and the hands (Game.Cards), the read and its odds, a hand played end to
   end (holds by click and keyboard, Draw, the showdown, the money, the
   OUTCOME and CARD GAME lines, the table kept on the log entry and drawn
   again in its place after /undo and a reload), Fold, the marked deck (the
   dealer's cards face up, the one catch roll, a fumble caught with every
   consequence), /cheat cards, Stop with a hand open, the phone widths, and
   no innerHTML (docs/notes/ui.md and docs/notes/engine-world.md, Wave 10).
   Changed by design in wave 11 (tests/wave11-cards.test.cjs): a suit sign
   carries U+FE0E, the read is 60% + 12% a point and reads "has something"
   or "is bluffing", a fold costs half rounded up, the table's head names
   the group and takes the focus, a card is named with whether it is held
   (data-held, no aria-pressed), Draw and Fold say what they do, Stop with a
   hand open folds it (the turn is kept), and /cheat cards is armed in the
   game (flags.cardsCheat).
   Mock mode. Run with: node tests/run.cjs wave10 */
const fs = require('fs');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, GAME_PATH, LAPTOP } = require('./helpers.cjs');

const s = suite('wave10-cards');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
// Wave 13: heads up (no card people sit in) for every hand, after a reload too, as these tests were written.
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); Game.Pipeline.hooks.cardsSeats = []; });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const esc = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lowerFirst = t => t.charAt(0).toLowerCase() + t.slice(1);
const bgWith = (page, re) => page.evaluate(src => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => new RegExp(src, 'i').test(i.name))), re);
/* The card game's place on a day it is open, at a phase its dealer sits at it. */
const atTable = page => page.evaluate(() => {
  const G = Game, S = G.State, st = G.state;
  const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
  for (const ph of ['evening', 'night', 'afternoon']) {
    let d = st.time.day;
    while (S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
    const dealer = G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id));
    // Wave 13: five-card draw remembered (no chooser) and heads up, as these tests were written.
    if (dealer) { S.apply({ cardGame: 'draw' }); G.Pipeline.hooks.cardsSeats = []; }
    if (dealer) return { loc: l.id, name: l.name, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0] };
  }
  return null;
});
/* Say the bet in the composer and wait for the table to open. */
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
/* The table as drawn: its text, its cards (a code, or "back"), what is just before and after it. */
const tableNow = page => page.evaluate(() => {
  const t = document.querySelector('#feed .f-cards');
  if (!t) return null;
  const cards = sel => [...t.querySelectorAll(sel + ' .card')].map(c => (c.classList.contains('back') ? 'back' : c.dataset.card));
  return { text: t.textContent, head: t.querySelector('.cards-head').textContent, dealer: cards('.cards-dealer'), player: cards('.cards-you'), prev: t.previousElementSibling ? `${t.previousElementSibling.className}|${t.previousElementSibling.textContent}` : null, next: t.nextElementSibling ? t.nextElementSibling.className.split(' ').filter(c => /^f-/.test(c) && c !== 'f-item').join(' ') : null };
});
/* The feed from the first bet on, one line a piece (atTable sets the clock outside a turn, so the opening's time has no divider until a rebuild). */
const feedLines = page => page.evaluate(() => {
  const all = [...document.querySelectorAll('#feed > .f-divider, #feed > .f-input, #feed > .f-roll, #feed > .f-narr, #feed > .f-quiet, #feed > .f-cards')]
    .map(x => `${x.className.split(' ').find(c => /^f-(divider|input|roll|narr|quiet|cards)$/.test(c)).slice(2)}: ${x.textContent.replace(/\s+/g, ' ').trim()}`);
  return all.slice(all.findIndex(t => /^input: I bet/.test(t)));
});

// ----- the deck and the hands -----

s.test('the deck and the hands: 52 cards, a seeded shuffle, every hand named and ranked, ties broken by the right cards (kickers, the lower pair, a full house\'s three, the wheel), the dealer\'s draw, and a /cheat cards deck that wins however the player draws', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const C = Game.Cards;
    const H = t => t.split(' ');
    const cmp = (a, b) => Math.sign(C.compare(H(a), H(b)));
    const deck = C.deck();
    const a = C.shuffle(Game.Rng.create(99));
    const ladder = ['Ac Qd 9h 4s 2c', 'Ac Ad 9h 4s 2c', 'Kc Kd 7h 7s 2c', '7c 7d 7h 2d 9s', 'As 2d 3c 4h 5s', 'Ac 9c 7c 4c 2c', '3c 3d 3h Kd Ks', 'Kc Kd Kh Ks 2c', '9h 8h 7h 6h 5h', 'As Ks Qs Js Ts'];
    let lost = 0;
    let full = 0;
    const shapes = new Set();
    for (let seed = 1; seed <= 300; seed++) {
      const d = C.deal(Game.Rng.create(seed), { stacked: true });
      if ([4, 5, 6].includes(C.evaluate(d.player).rank)) { full++; shapes.add(C.evaluate(d.player).rank); }
      const fin = C.draw(d.dealer, C.dealerHolds(d.dealer), d.dealerPile);
      for (let m = 0; m < 32; m++) {
        const holds = [0, 1, 2, 3, 4].filter(i => m & (1 << i));
        if (C.compare(C.draw(d.player, holds, d.playerPile), fin) <= 0) lost++;
      }
    }
    const plain = C.deal(Game.Rng.create(5));
    return {
      size: deck.length, unique: new Set(deck).size, valid: deck.every(c => C.valid(c)), bad: ['1s', 'Kx', 'K', 'Ks '].map(c => C.valid(c)),
      same: a.join() === C.shuffle(Game.Rng.create(99)).join(), differ: a.join() !== C.shuffle(Game.Rng.create(100)).join(), all: new Set(a).size,
      names: ladder.map(t => C.evaluate(H(t)).name), ladder: ladder.slice(1).map((t, i) => cmp(t, ladder[i])),
      ties: {
        kicker: cmp('Ac Ad 9h 4s 3c', 'Ah As 9d 4c 2d'), split: cmp('Ac Ad 9h 4s 2c', 'Ah As 9d 4c 2d'), lowPair: cmp('Kc Kd 8h 8s 2c', 'Kh Ks 7d 7c Ac'),
        twoPairKicker: cmp('Kc Kd 7h 7s 3c', 'Kh Ks 7d 7c 2d'), fullHouse: cmp('3c 3d 3h Kd Ks', '2c 2d 2h Ad As'), wheel: cmp('As 2d 3c 4h 5s', '2s 3d 4c 5h 6s'),
        flush: cmp('Ac 9c 7c 4c 3c', 'Ad 9d 7d 4d 2d'), high: cmp('Ac Kd Qh Js 9c', 'Ad Kc Qs Jh 8d'), suits: cmp('Ac Kd Qh Js 9c', 'Ad Kc Qs Jh 9d'), trips: cmp('7c 7d 7h Ad Ks', '7s 7d 7h Ac Qs')
      },
      holds: ['Kc Kd 7h 7s 2c', '7c 7d 7h 2d 9s', 'Ac Ad 9h 4s 2c', 'Ac 9c 7c 4c 2d', '5c 6d 7h 8s Kc', 'Ac 2d 3h 4s 9c', 'Ac Qd 9h 4s 2c', '9h 8h 7h 6h 5h', '3c 3d 3h Kd Ks'].map(t => C.dealerHolds(H(t))),
      draw: C.draw(H('Ac Kd 9h 4s 2c'), [0, 1], H('Qs Jd Tc 8h 7h')),
      stacked: { lost, full, shapes: shapes.size }, dealtApart: new Set([].concat(plain.player, plain.dealer, plain.dealerPile, plain.playerPile)).size,
      looks: [C.label('Th'), C.sign('Th'), C.red('Th'), C.red('Kd'), C.red('Ks'), C.sign('Ac'), C.cardName('Qd'), C.cardName('6c')]
    };
  });
  assert.deepEqual([r.size, r.unique, r.valid, r.all], [52, 52, true, 52]);
  assert.deepEqual(r.bad, [false, false, false, false]);
  assert.equal(r.same, true, 'the same seed shuffles the same');
  assert.equal(r.differ, true);
  assert.deepEqual(r.names, ['Ace high', 'Pair of aces', 'Two pair, kings and sevens', 'Three of a kind, sevens', 'Straight, five high', 'Flush, ace high', 'Full house, threes over kings', 'Four of a kind, kings', 'Straight flush, nine high', 'Royal flush']);
  assert.deepEqual(r.ladder, [1, 1, 1, 1, 1, 1, 1, 1, 1], 'each hand beats the one before');
  assert.deepEqual(r.ties, { kicker: 1, split: 0, lowPair: 1, twoPairKicker: 1, fullHouse: 1, wheel: -1, flush: 1, high: 1, suits: 0, trips: 1 });
  assert.deepEqual(r.holds, [[0, 1, 2, 3], [0, 1, 2], [0, 1], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4]], 'two pair, three, a pair, four to a flush, four to a straight (an ace low too), the two highest, a straight flush and a full house stand');
  assert.deepEqual(r.draw, ['Ac', 'Kd', 'Qs', 'Jd', 'Tc'], 'the new cards go where the ones let go were');
  assert.deepEqual(r.stacked, { lost: 0, full: 300, shapes: 3 }, 'a stacked deal is a made hand (wave 14: a full house, a flush or a straight, by the seed) that beats the dealer\'s final hand whatever the player holds');
  assert.equal(r.dealtApart, 20, 'the hands and both draw piles are twenty different cards');
  assert.deepEqual(r.looks, ['10', '♥\uFE0E', true, true, false, '♣\uFE0E', 'Queen of diamonds', 'Six of clubs']);
});

s.test('the read: right 60% + 12% a point of Wits (its conditions too), 50 to 95%; over many hands it is right about that often and, when right, says what the dealer ends up with; the same seed and turn deal the same hand', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, P = G.Pipeline, st = G.state;
    const odds = [];
    for (const w of [-1, 0, 1, 2, 3]) { st.player.stats.wits = w; odds.push(P.readOdds(st)); }
    st.player.stats.wits = 2;
    S.apply({ conditionsAdded: [{ name: 'Tired', effect: '-1 wits', untilDay: st.time.day + 2 }] });
    const tired = P.readOdds(st);
    st.player.stats.wits = 3;
    S.apply({ conditionsAdded: [{ name: 'Sharp', effect: '+3 wits', untilDay: st.time.day + 2 }] });
    const top = P.readOdds(st);
    const tally = {};
    for (const o of [0.5, 0.79, 0.95]) {
      let right = 0;
      let honest = true;
      for (let t = 1; t <= 3000; t++) {
        const hand = P.dealHand(P.cardSeed({ meta: { seed: 777, turn: t } }), o, false);
        if (hand.read.right) right++;
        const has = G.Cards.evaluate(hand.dealerFinal).rank >= 1;
        if ((hand.read.says === 'something') !== (hand.read.right ? has : !has)) honest = false;
      }
      tally[o] = { rate: right / 3000, honest };
    }
    const deal = turn => JSON.stringify(P.dealHand(P.cardSeed({ meta: { seed: 9, turn } }), 0.6, false));
    return { odds, tired, top, tally, same: deal(4) === deal(4), other: deal(4) !== deal(5) };
  });
  assert.deepEqual(r.odds, [0.5, 0.6, 0.72, 0.84, 0.95]);
  assert.equal(r.tired, 0.72, 'Tired (-1 wits) takes 12 points off');
  assert.equal(r.top, 0.95, 'never above 95%');
  for (const [o, t] of Object.entries(r.tally)) {
    assert.ok(Math.abs(t.rate - Number(o)) < 0.035, `${o}: right ${t.rate}`);
    assert.equal(t.honest, true, `${o}: a right read says what the dealer ends with, a wrong one the opposite`);
  }
  assert.equal(r.same, true);
  assert.equal(r.other, true);
});

// ----- a hand at the table -----

s.test('a hand played at the table: the block under the line and before the narration, the dealer face down under the read, holds by click and keyboard, Draw; the showdown face up with both hands named, the money moved by the engine, OUTCOME and CARD GAME; the table kept on the log entry and drawn in the same place after /undo and a reload; the same hand dealt again after /undo', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  assert.ok(spot, 'the card game with its dealer');
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await startHand(page, 'I bet $20 at cards');
  const live = await page.evaluate(() => {
    const t = document.querySelector('#feed .f-cards');
    return {
      head: t.querySelector('.cards-head').textContent, label: document.getElementById(t.getAttribute('aria-labelledby')).textContent, who: [...t.querySelectorAll('.cards-who')].map(x => x.textContent),
      read: t.querySelector('.cards-read').textContent, backs: t.querySelectorAll('.cards-dealer .card.back').length, faces: t.querySelectorAll('.cards-dealer .card:not(.back)').length,
      buttons: [...t.querySelectorAll('.cards-you button.card')].map(b => [b.dataset.held, b.getAttribute('aria-label'), b.dataset.card]),
      acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent), hint: t.querySelector('.cards-hint').textContent,
      prev: t.previousElementSibling.className + '|' + t.previousElementSibling.textContent, last: t === document.querySelector('#feed').lastElementChild,
      status: document.querySelector('#turn-status-text').textContent, statusShown: !document.querySelector('#turn-status').hidden, send: document.querySelector('#send').textContent,
      focus: document.activeElement.className, busy: Game.Pipeline.busy, open: Game.Pipeline.handOpen, canAct: Game.UI.canAct(), stage: Game.Pipeline.STATUS_TEXT.cards,
      narrates: Game.Api.Mock.calls.filter(c => c.method === 'narrate').length, gold: Game.state.player.gold
    };
  });
  assert.equal(live.head, `${spot.dealerName}'s table · Five-card draw · stake $20 · pot $40`); // wave 13: the game in the head
  assert.equal(live.label, live.head);
  assert.deepEqual(live.who, [spot.dealerName, 'You']);
  assert.match(live.read, new RegExp(`^Your read: ${spot.first} (has something|is bluffing)\\.$`));
  assert.deepEqual([live.backs, live.faces], [5, 0], 'the dealer\'s five face down');
  assert.equal(live.buttons.length, 5);
  for (const [pressed, name, code] of live.buttons) {
    assert.equal(pressed, 'false');
    assert.match(name, /^(Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Jack|Queen|King|Ace) of (spades|hearts|diamonds|clubs), not held$/);
    assert.match(code, /^[2-9TJQKA][shdc]$/);
  }
  assert.deepEqual(live.acts, ['Draw 5', 'Fold −$10']);
  assert.match(live.hint, /Pick the cards to hold, then Draw/);
  assert.equal(live.prev, 'f-item f-input|I bet $20 at cards', 'under the player\'s line');
  assert.equal(live.last, true, 'nothing told yet');
  assert.deepEqual([live.status, live.statusShown, live.send], ['Your hand', true, 'Stop']);
  assert.equal(live.stage, 'Your hand');
  assert.equal(live.focus, 'cards-head', 'the focus is on the table\'s head');
  assert.deepEqual([live.busy, live.open, live.canAct], [true, true, false], 'a turn runs: nothing else may act');
  assert.equal(live.narrates, 0);
  assert.equal(live.gold, g0, 'no money moves before the showdown');
  // Enter in the box while the hand is open: the line stays, the status says why.
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  assert.match(await page.textContent('#turn-status-text'), /^Your hand is on the table: pick the cards to hold, then Draw or Fold\. Stop folds the hand \(−\$10\); Win \(cheat\) ends it yours\.$/); // wave 14: the Win (cheat) control named
  assert.equal(await page.inputValue('#cmd'), 'I look around');
  await page.fill('#cmd', '');
  // Holds: a click, Space, Enter (on and off again).
  await page.click('.cards-you button.card[data-i="0"]');
  await page.focus('.cards-you button.card[data-i="3"]');
  await page.keyboard.press('Space');
  await page.focus('.cards-you button.card[data-i="1"]');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  const held = await page.evaluate(() => [...document.querySelectorAll('.cards-you button.card')].map(b => [b.dataset.held, getComputedStyle(b.querySelector('.card-hold')).visibility, b.querySelector('.card-hold').textContent]));
  assert.deepEqual(held.map(x => x[0]), ['true', 'false', 'false', 'true', 'false']);
  assert.deepEqual(held.map(x => x[1]), ['visible', 'hidden', 'hidden', 'visible', 'hidden'], 'a Hold tag on the cards held');
  assert.equal(held[0][2], 'Hold');
  const dealt = live.buttons.map(b => b[2]);
  await page.click('.cards-draw');
  await idle(page);
  const e = await lastEntry(page);
  const c = e.cards;
  assert.ok(c, 'the log entry keeps the table');
  assert.deepEqual(c.player.dealt, dealt);
  assert.deepEqual(c.player.held, [0, 3]);
  assert.deepEqual([c.player.final[0], c.player.final[3]], [dealt[0], dealt[3]], 'the cards held stay');
  for (const i of [1, 2, 4]) assert.ok(!dealt.includes(c.player.final[i]), 'a card let go is replaced by a new one');
  const judge = await page.evaluate(x => ({ cmp: Math.sign(Game.Cards.compare(x.player.final, x.dealer.final)), p: Game.Cards.evaluate(x.player.final).name, d: Game.Cards.evaluate(x.dealer.final).name, dealerHas: Game.Cards.evaluate(x.dealer.final).rank >= 1, holds: Game.Cards.dealerHolds(x.dealer.dealt), gold: Game.state.player.gold }), c);
  const want = { 1: 'win', '-1': 'lose', 0: 'split' }[judge.cmp];
  assert.equal(c.result, want);
  assert.equal(c.delta, { win: 20, lose: -20, split: 0 }[want]);
  assert.equal(judge.gold - g0, c.delta, 'the engine moved the money');
  assert.equal(c.cash, judge.gold);
  assert.deepEqual([c.player.name, c.dealer.name], [judge.p, judge.d]);
  assert.deepEqual(c.dealer.held, judge.holds, 'the dealer drew by his rule');
  assert.deepEqual([c.stake, c.dealerId, c.dealerName, c.marked, c.cheat], [20, spot.dealer, spot.dealerName, false, false]);
  assert.equal(c.read.odds, 0.6, 'Wits 0');
  assert.equal(c.read.right, (c.read.says === 'something') === judge.dealerHas, 'the read is right when it says how the dealer ends up');
  assert.equal(e.roll, null, 'no roll without a marked deck');
  // The finished table.
  const done = await tableNow(page);
  assert.deepEqual(done.dealer, c.dealer.final, 'the dealer\'s hand face up');
  assert.deepEqual(done.player, c.player.final);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards .cards-name')].map(x => x.firstChild.textContent)), [c.dealer.name, c.player.name], 'each hand named under it');
  const result = await page.textContent('#feed .f-cards .cards-result');
  assert.equal(result, `${{ win: 'You win $20', lose: 'You lose $20', split: 'Split pot' }[want]} · cash $${judge.gold}`);
  assert.equal(await page.locator('#feed .f-cards button').count(), 0, 'nothing to press once it is over');
  assert.equal(done.next, 'f-narr', 'the narration follows the table');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cmd', 'the focus back in the box');
  // What the narrator and the bookkeeper hear.
  const outcome = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  const ph = lowerFirst(c.player.name) + (c.player.name.includes(',') ? ',' : '');
  const dh = lowerFirst(c.dealer.name) + (c.dealer.name.includes(',') ? ',' : '');
  const how = { win: `the player's ${ph} beats ${spot.dealerName}'s ${dh} at the showdown: the player wins \\$20`, lose: `the player's ${ph} loses to ${spot.dealerName}'s ${dh} at the showdown: the player loses \\$20`, split: `the player's ${ph} ties ${spot.dealerName}'s ${dh} at the showdown: a split pot, and no money changes hands` }[want];
  assert.match(outcome, new RegExp(`^OUTCOME: the card game \\(the player put up \\$20\\): five-card draw, heads up with ${esc(spot.dealerName)}; ${how.split('\\$').map(esc).join('\\$')} \\(cash (now|still) \\$${judge.gold}\\)\\. The money has already changed hands\\. The table was shown to the player card by card already: tell the moment and the people, do not list the cards again\\.$`), outcome);
  const book = line(await lastCall(page, 'bookkeep'), 'CARD GAME');
  assert.equal(book, `CARD GAME (already applied by the engine; do not record again): the player ${{ win: 'wins $20', lose: 'loses $20', split: 'breaks even (a split pot)' }[want]} at cards (cash now $${judge.gold}); record no goldDelta for it.`);
  assert.ok(e.narration.includes(lowerFirst(c.player.name)) && e.narration.includes(lowerFirst(c.dealer.name)), 'the demo tells the hands by name: ' + e.narration);
  // /undo of a later turn draws it again where it was.
  const played = await feedLines(page);
  const table = await tableNow(page);
  await sendText(page, 'I look around');
  await sendText(page, '/undo');
  assert.deepEqual(await tableNow(page), table, 'the same table after /undo');
  assert.deepEqual(await feedLines(page), played, 'in the same place');
  // /undo of the hand: the table goes and the money comes back; played again, the same hand is dealt.
  await sendText(page, '/undo');
  assert.equal(await page.locator('#feed .f-cards').count(), 0);
  assert.equal(await page.evaluate(() => Game.state.player.gold), g0);
  await startHand(page, 'I bet $20 at cards');
  assert.deepEqual((await tableNow(page)).player, dealt, 'the same hand after /undo');
  await page.evaluate(() => Game.Pipeline.playHand({ hold: [0, 3] }));
  await idle(page);
  assert.deepEqual((await lastEntry(page)).cards.player.final, c.player.final, 'and the same draw');
  // A reload (Continue) draws it again where it was.
  await sendText(page, 'I look around');
  const before = await feedLines(page);
  const kept = await tableNow(page);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  await fast(page);
  assert.deepEqual(await tableNow(page), kept, 'the same table after a reload');
  assert.deepEqual(await feedLines(page), before, 'in the same place');
});

s.test('Fold: half the stake (rounded up since wave 11) is lost, the dealer\'s cards are turned up as dealt, the result says so, and the narrator and the bookkeeper hear a fold', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await startHand(page, 'I put $25 in');
  const dealt = (await tableNow(page)).dealer;
  assert.deepEqual(dealt, ['back', 'back', 'back', 'back', 'back']);
  await page.click('.cards-fold');
  await idle(page);
  const e = await lastEntry(page);
  const gold = await page.evaluate(() => Game.state.player.gold);
  assert.deepEqual([e.cards.result, e.cards.delta, e.cards.stake, gold - g0], ['fold', -13, 25, -13]);
  assert.deepEqual(e.cards.player.final, e.cards.player.dealt, 'nothing drawn');
  assert.deepEqual(e.cards.dealer.final, e.cards.dealer.dealt, 'the dealer\'s hand as dealt');
  const t = await tableNow(page);
  assert.deepEqual(t.dealer, e.cards.dealer.dealt);
  assert.equal(await page.textContent('#feed .f-cards .cards-result'), `You fold: −$13 · cash $${gold}`);
  const outcome = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.ok(outcome.startsWith(`OUTCOME: the card game (the player put up $25): five-card draw, heads up with ${spot.dealerName}; the player folds their ${lowerFirst(e.cards.player.name)}`), outcome);
  assert.ok(outcome.includes(`before the draw and gives up half the stake: the player loses $13 (cash now $${gold}).`), outcome);
  assert.match(line(await lastCall(page, 'bookkeep'), 'CARD GAME'), /: the player folds and loses \$13 at cards \(cash now \$\d+\); record no goldDelta for it\.$/);
  assert.match(e.narration, /you fold your .* and give up \$13\./);
  assert.ok(spot);
});

// ----- the marked deck -----

s.test('the marked deck: the dealer\'s cards are face up through the hand and the one roll (Wits, normal, +2 for the deck) comes after the draw, under the table; a fumble is caught (the hand void, the stake lost, the deck taken, colder, three days out, news, out on the street); without a marked deck there is no roll and no accusation', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  await startHand(page, 'I bet $20 at cards');
  const live = await page.evaluate(() => ({ backs: document.querySelectorAll('#feed .f-cards .cards-dealer .card.back').length, faces: [...document.querySelectorAll('#feed .f-cards .cards-dealer .card')].map(c => c.dataset.card), note: (document.querySelector('#feed .f-cards .cards-note') || {}).textContent, rolls: document.querySelectorAll('#feed .f-roll').length }));
  assert.equal(live.backs, 0, 'face up: the player reads the marks');
  assert.ok(live.faces.every(c => /^[2-9TJQKA][shdc]$/.test(c)));
  assert.equal(live.note, `Marked deck: you can read ${spot.first}'s cards.`);
  assert.equal(live.rolls, 0, 'no roll before the draw');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(15));
  await page.click('.cards-draw');
  await idle(page);
  let e = await lastEntry(page);
  assert.deepEqual(e.cards.dealer.dealt, live.faces);
  assert.equal(e.cards.marked, true);
  assert.ok(e.roll && e.roll.d20 === 15 && e.roll.stat === 'wits' && e.roll.target === 12, JSON.stringify(e.roll));
  assert.ok(['win', 'lose', 'split'].includes(e.cards.result), 'not caught: the showdown decides');
  const lt = await page.evaluate(() => Game.Pipeline.lastTurn.roll.modifiers);
  assert.ok(lt.some(m => /marked deck/i.test(m.label) && m.value === 2), 'the deck gives +2');
  const t = await tableNow(page);
  assert.equal(t.next, 'f-roll', 'the roll under the table, before the narration');
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /The player read the dealer's cards off the marked deck through the hand, and .* did not catch it\./);
  // A fumble: caught.
  const before = await page.evaluate(d => ({ att: Game.State.npc(d).attitude, gold: Game.state.player.gold, news: (Game.state.news || []).length }), spot.dealer);
  await startHand(page, 'I bet $30 on another hand');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await page.click('.cards-draw');
  await idle(page);
  e = await lastEntry(page);
  const after = await page.evaluate(([d, l]) => {
    const st = Game.state;
    const ban = (st.bans || []).find(b => b.locationId === l);
    return { att: Game.State.npc(d).attitude, mem: Game.State.npc(d).memories.slice(-1)[0], gold: st.player.gold, deck: st.player.inventory.some(i => /marked/i.test(i.name)), ban: ban ? ban.untilDay - st.time.day : null, news: (st.news || []).slice(-1)[0], here: Game.State.loc(st.player.locationId) };
  }, [spot.dealer, spot.loc]);
  assert.deepEqual([e.cards.result, e.cards.delta, after.gold - before.gold], ['caught', -30, -30], 'the hand is void: the stake is lost');
  assert.equal(e.roll.tier, 'critical_failure');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards .cards-result')].pop().textContent), `Caught cheating: you lose $30 · cash $${after.gold}`);
  assert.equal(before.att - after.att, 20);
  assert.deepEqual([after.mem.weight, /cheating at cards/.test(after.mem.text)], [3, true]);
  assert.equal(after.deck, false, 'the dealer keeps the deck');
  assert.ok(after.ban >= 2, 'three days out');
  assert.match(after.news.text, /caught .* cheating at cards/);
  assert.equal(after.here.type, 'street', 'out on the street');
  const outcome = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(outcome, /catches them cheating with the marked deck; the hand is void.* takes the marked deck and throws the player out of .* End the narration with the player outside on .*: the engine moves them there\.$/);
  assert.match(e.narration, /throws you out for cheating\. You end up outside on /);
  // No marked deck: no roll, no accusation, and an armed fumble waits for a real roll.
  const p2 = await open(h);
  await quickStart(p2);
  await fast(p2);
  const spot2 = await atTable(p2);
  const a0 = await p2.evaluate(d => Game.State.npc(d).attitude, spot2.dealer);
  await p2.evaluate(() => { Game.Pipeline.hooks.nextTier = 'fumble'; Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(p2, 'I bet $20 at cards');
  const plain = await p2.evaluate(([d, l]) => ({ e: Game.state.log[Game.state.log.length - 1], att: Game.State.npc(d).attitude, ban: (Game.state.bans || []).some(b => b.locationId === l), armed: Game.Pipeline.hooks.nextTier, g: Game.Pipeline.lastTurn.ctx.gamble }), [spot2.dealer, spot2.loc]);
  assert.equal(plain.e.roll, null);
  assert.ok(['win', 'lose', 'split'].includes(plain.e.cards.result));
  assert.deepEqual([plain.att, plain.ban, plain.g.caught], [a0, false, false]);
  assert.ok(!('accused' in plain.g), 'nobody is accused any more');
  assert.equal(plain.armed, 'fumble', 'the armed roll is still waiting');
});

// ----- the cheat -----

s.test('/cheat cards: "Cheat armed: the next hand is yours."; the player is dealt a made hand (wave 14: a full house, a flush or a straight) and wins however they draw, with no catch roll even with a marked deck and nothing on record about cheating; the next hand is dealt fair; a hand Stop folded is spent, and /undo of it arms the cheat again (wave 11); /cheat and /help list it', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  await sendText(page, '/cheat cards');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent), 'Cheat armed: the next hand is yours.');
  assert.equal(await page.evaluate(() => Game.state.flags.cardsCheat), true);
  const a0 = await page.evaluate(d => ({ att: Game.State.npc(d).attitude, mems: Game.State.npc(d).memories.length, gold: Game.state.player.gold }), spot.dealer);
  // Stopped (wave 11): the hand is folded and the cheat spent with it; /undo of that hand arms it again.
  await startHand(page, 'I bet $40 at cards');
  const stopped = (await tableNow(page)).player;
  await page.evaluate(() => Game.Pipeline.forceNextRoll(10));
  await page.click('#send');
  await idle(page);
  assert.deepEqual(await page.evaluate(() => [Game.state.flags.cardsCheat, Game.state.log[Game.state.log.length - 1].cards.result]), [undefined, 'fold'], 'Stop folds the cheat hand, and the cheat is spent');
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.flags.cardsCheat), true, 'the hand taken back arms the cheat again');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent), 'You took back the last turn. The cards cheat is armed again: the next hand is yours.');
  await page.fill('#cmd', '');
  await startHand(page, 'I bet $40 at cards');
  const dealt = (await tableNow(page)).player;
  assert.deepEqual(dealt, stopped);
  assert.ok([4, 5, 6].includes(await page.evaluate(d => Game.Cards.evaluate(d).rank, dealt)), 'a made hand: a full house, a flush or a straight (wave 14: the shape varies with the seed)');
  await page.click('.cards-draw'); // nothing held: the worst draw
  await idle(page);
  const e = await lastEntry(page);
  const after = await page.evaluate(([d, l]) => ({ att: Game.State.npc(d).attitude, mems: Game.State.npc(d).memories.filter(m => /cheat/i.test(m.text)).length, gold: Game.state.player.gold, deck: Game.state.player.inventory.some(i => /marked/i.test(i.name)), ban: (Game.state.bans || []).some(b => b.locationId === l), armed: Game.state.flags.cardsCheat === true }), [spot.dealer, spot.loc]);
  assert.deepEqual([e.cards.result, e.cards.delta, e.cards.cheat, after.gold - a0.gold], ['win', 40, true, 40]);
  assert.equal(e.roll, null, 'no catch roll');
  assert.deepEqual([after.att, after.mems, after.deck, after.ban, after.armed], [a0.att, 0, true, false, false]);
  assert.doesNotMatch(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /cheat/i);
  // The next hand is dealt fair.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; Game.Pipeline.forceNextRoll(10); });
  await sendText(page, 'I bet $10 at cards');
  assert.equal((await lastEntry(page)).cards.cheat, false);
  // The words.
  await sendText(page, '/cheat');
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].pop().textContent), /\/cheat cards stacks the deck so you win your next hand at cards\./);
  await sendText(page, '/help');
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice.help')].pop().textContent), /\/cheat \[outcome or time <phase> \[day\]\]: Cheat: redo the last roll \(success, partial, fail, crit, fumble or 1-20\), win your next hand at cards \(cards\), win it without playing it \(win\), or set the clock \(forward only\)/);
});

// ----- Stop -----

s.test('Stop with a hand open (changed by design in wave 11): the ante is in, so Stop folds the hand at the fold price and the turn is kept, told plainly; the composer is free and the line is not put back', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  const before = await page.evaluate(() => ({ gold: Game.state.player.gold, turn: Game.state.meta.turn, log: Game.state.log.length }));
  await startHand(page, 'I bet $20 at cards');
  const dealt = (await tableNow(page)).player;
  assert.equal(await page.textContent('#send'), 'Stop');
  await page.click('#send');
  await idle(page);
  const r = await page.evaluate(() => ({ gold: Game.state.player.gold, turn: Game.state.meta.turn, log: Game.state.log.length, tables: document.querySelectorAll('#feed .f-cards').length, box: document.querySelector('#cmd').value, notice: [...document.querySelectorAll('#feed .f-notice')].pop().textContent, open: Game.Pipeline.handOpen, statusHidden: document.querySelector('#turn-status').hidden, send: document.querySelector('#send').textContent, canAct: Game.UI.canAct(), e: Game.state.log[Game.state.log.length - 1] }));
  assert.deepEqual([r.gold - before.gold, r.turn - before.turn, r.log - before.log], [-10, 1, 1], 'the fold price, and the turn is spent');
  assert.equal(r.tables, 1, 'the table stays, folded');
  assert.equal(r.box, '');
  assert.equal(r.notice, 'Stopped: a hand on the table is folded, and the ante is gone.');
  assert.deepEqual([r.e.cards.result, r.e.cards.stopped, r.e.cards.player.dealt], ['fold', true, dealt]);
  assert.deepEqual([r.open, r.statusHidden, r.send, r.canAct], [false, true, 'Wait', true], 'the box is empty: Send is Wait again');
});

// ----- phone widths, the themes, the text size -----

s.test('the table at phone width (320 and 390) in both themes and at Large text: five cards a row, no horizontal overflow open or finished; the cards grow with the text size; at 1024 with the panel beside the story too', async h => {
  const sizes = {};
  for (const [width, scheme, size] of [[320, 'dark', 'L'], [320, 'light', 'M'], [390, 'light', 'L'], [390, 'dark', 'S'], [1024, 'dark', 'M']]) {
    const page = await open(h, { width, height: 720 }, { colorScheme: scheme });
    await quickStart(page);
    await page.evaluate(sz => document.documentElement.setAttribute('data-size', sz), size);
    await fast(page);
    await atTable(page);
    await startHand(page, 'I bet $20 at cards');
    const tag = `${width} ${scheme} ${size}`;
    assert.deepEqual(await overflowReport(page, width), [], `${tag}: open`);
    const geo = await page.evaluate(() => {
      const t = document.querySelector('#feed .f-cards');
      const tr = t.getBoundingClientRect();
      const rows = [...t.querySelectorAll('.cards-row')].map(r => [...r.querySelectorAll('.card')].map(c => { const b = c.getBoundingClientRect(); return { top: Math.round(b.top), left: b.left, right: b.right, w: b.width, h: b.height }; }));
      const acts = [...t.querySelectorAll('.cards-acts button')].map(b => b.getBoundingClientRect().height);
      const red = [...t.querySelectorAll('.card.red')].map(c => getComputedStyle(c).color);
      const black = [...t.querySelectorAll('.card:not(.red):not(.back)')].map(c => getComputedStyle(c).color);
      return { rows, acts, table: { left: tr.left, right: tr.right }, rank: parseFloat(getComputedStyle(t.querySelector('.cards-you .card-rank')).fontSize), theme: document.documentElement.dataset.theme, red, black, text: getComputedStyle(document.body).color, danger: getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() };
    });
    for (const row of geo.rows) {
      assert.equal(row.length, 5, tag);
      assert.equal(new Set(row.map(c => c.top)).size, 1, `${tag}: five in one row`);
      for (const c of row) assert.ok(c.left >= geo.table.left && c.right <= geo.table.right && c.w >= 36 && c.h > c.w, `${tag}: ${JSON.stringify(c)}`);
    }
    for (const a of geo.acts) assert.ok(a >= 44, `${tag}: Draw and Fold are 44px`);
    assert.equal(geo.theme, scheme === 'light' ? 'parchment' : 'dark');
    for (const col of geo.black) assert.equal(col, geo.text, `${tag}: spades and clubs in the text colour`);
    assert.ok(geo.red.every(col => col !== geo.text), `${tag}: hearts and diamonds in red`);
    sizes[tag] = geo.rank;
    await page.click('.cards-draw');
    await idle(page);
    assert.deepEqual(await overflowReport(page, width), [], `${tag}: finished`);
    const fin = await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards .cards-row')].map(r => new Set([...r.querySelectorAll('.card')].map(c => Math.round(c.getBoundingClientRect().top))).size));
    assert.deepEqual(fin, [1, 1], `${tag}: both hands in a row`);
  }
  assert.ok(sizes['320 dark L'] > sizes['320 light M'] && sizes['320 light M'] > sizes['390 dark S'], JSON.stringify(sizes));
});

s.test('no innerHTML, outerHTML, insertAdjacentHTML or document.write: the table is built from nodes', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.doesNotMatch(html, /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write(ln)?\s*\(/);
  assert.ok(h);
});

s.run();
