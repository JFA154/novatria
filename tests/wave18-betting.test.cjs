'use strict';
/* Wave 18: the owner asked to make the poker game interactive ("I decide
   how much money to add, go all in, etc."); the coordinator's amendments
   set the house rules from the stake (a twentieth to ante, a fifth a bet:
   "$20 to sit, $1 ante", $4 bets), made limit the house game and table
   stakes (no limit) something the dealer agrees to when asked. Covered
   here: the units, the amounts and the clamps, the min-raise and the
   four-raise cap, uncalled bets and side pots (pure); the limit table's
   buttons and the dealer holding the player to it (typed overbets); the
   no-limit amount control (Min, ½ pot, Pot, All in, − and +, typing, the
   notes, Enter); a dealer's raise and the player's Call / Raise / Fold;
   all in by a seat and by the player, the board dealt out; everyone
   folding to a bet; draw's round after the draw under both structures and
   the ante-only fold; bets typed in the box; asking for table stakes
   (cold, a yes, a no, again, a fumble, the demo's words); the stored hand
   resumed mid-street with its amounts and the structure after a reload;
   /reroll; the Win (cheat) facing a raise; /cheat win's payouts; /undo
   mid-betting; phones with the control; and a 40-hand random soak (the
   pot and the cash to the dollar, nothing refused by State.apply).
   Mock mode. Run with: node tests/wave18-betting.test.cjs */
const fs = require('fs');
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, presetCards, GAME_PATH, LAPTOP } = require('./helpers.cjs');

const s = suite('wave18-betting');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
const gold = page => page.evaluate(() => Game.state.player.gold);
const statusLine = page => page.textContent('#turn-status-text');
const addCash = (page, n) => page.evaluate(d => Game.State.apply({ goldDelta: d }), n);
const bgWith = (page, re) => page.evaluate(src => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => new RegExp(src, 'i').test(i.name))), re);
/* The card game's place on an open day, at a phase its dealer and card people sit at it (the evening first). */
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
    if (dealer) return { loc: l.id, phase: ph, day: d, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0], people: G.Pipeline.cardPeople(here, dealer).map(n => ({ id: n.id, name: n.name })) };
  }
  return null;
}, phase || null);
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
/* The next hold'em hand dealt as given: holes in seat order (the player, the seats, the dealer last), the board, and who sits in. */
const deal = (page, holes, board, seats) => page.evaluate(([h, b, st]) => { Game.Pipeline.hooks.cardsDeal = { holes: h, board: b, seats: st || [] }; }, [holes, board, seats || []]);
const dealDraw = (page, d) => page.evaluate(x => { Game.Pipeline.hooks.cardsDeal = x; }, d);
const tableNow = page => page.evaluate(() => {
  const t = [...document.querySelectorAll('#feed .f-cards')].pop();
  if (!t) return null;
  const cards = el => [...el.querySelectorAll('.cards-row .card')].map(c => (c.classList.contains('back') ? 'back' : c.dataset.card));
  const board = t.querySelector('.cards-board');
  const q = sel => (t.querySelector(sel) ? t.querySelector(sel).textContent : null);
  return {
    open: t.classList.contains('open'), head: q('.cards-head'),
    seats: [...t.querySelectorAll('.cards-side')].map(el => ({ seat: el.dataset.seat, status: el.querySelector('.cards-status').textContent, cards: cards(el), name: el.querySelector('.cards-name') ? el.querySelector('.cards-name').textContent : null })),
    board: board ? { street: board.querySelector('.cards-street').textContent, cards: cards(board) } : null,
    pot: q('.cards-pot'), acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent),
    field: t.querySelector('.cards-amt') ? t.querySelector('.cards-amt').value : null, note: q('.cards-amt-note'), said: q('.cards-said'),
    presets: [...t.querySelectorAll('.cards-preset')].map(b => b.textContent), hint: q('.cards-hint'), result: q('.cards-result')
  };
});
const waitTable = page => page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
const press = async (page, label) => {
  await page.click(`#feed .f-cards.open .cards-acts button:text-is("${label}")`);
  await waitTable(page);
};
const pressMain = async page => {
  await page.click('#feed .f-cards.open .cards-acts button[data-act="bet"], #feed .f-cards.open .cards-acts button[data-act="raise"]');
  await waitTable(page);
};
const typeLine = async (page, words) => {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForTimeout(40);
  await waitTable(page);
};
/* The money of a finished hand adds up: the pot is what stayed in, every dollar of it went to someone, and the player's cash moved by what they took less what they put in. */
const moneyAddsUp = (c, cashChange) => {
  const sides = [c.player, c.dealer].concat(c.seats || []);
  assert.equal(c.pot, sides.reduce((t, x) => t + x.in, 0), 'the pot is what stayed in');
  assert.equal(sides.reduce((t, x) => t + x.won, 0), c.pot, 'every dollar of the pot went to someone');
  assert.equal(c.delta, c.player.won - c.player.in, 'won less what was put in');
  if (cashChange !== undefined) assert.equal(cashChange, c.delta, 'the cash moved by that');
};

// ----- the engine, pure -----

s.test('the house rules and the amounts, pure: the ante a twentieth and the bet a fifth of the stake; amounts go up to the next multiple of the bet, under the least is the least, past the stack or leaving less than a bet behind is all in; ½ pot and Pot round to the nearest bet; the least raise is the bet and the last raise, rounded up; four raises a round at most; limit bets and raises are the one amount; uncalled bets come back and a short all in wins only what it matched; everyone all in is dealt out', async h => {
  const page = await open(h);
  await quickStart(page);
  const r = await page.evaluate(() => {
    const P = Game.Pipeline;
    const H = t => t.split(' ');
    const k = { toCall: 0, level: 0, pot: 2, minTo: 4, maxTo: 19, unit: 4 };
    const run = (o, moves) => P.holdemRun(Object.assign({ seed: 9, stacked: false, board: H('2c 7d 9h 3s Jc') }, o), moves);
    // Heads up against aces (tilt 0), the player's seven-deuce.
    const seats = [{ key: 'player', hole: H('7c 2d'), tilt: 0 }, { key: 'npc_a', hole: H('Ah Ad'), tilt: 0 }];
    // No limit: the player bets $6 into $2; aces raise.
    const nl = run({ ante: 1, bet: 2, stack: 100, seats }, ['bet:6']);
    // The cap: a $1 limit and deep stacks; check, aces bet, then raise and re-raise until four raises are in.
    let moves = ['check'];
    let cap = run({ ante: 1, bet: 1, stack: 1000, limit: true, seats }, moves);
    while (cap.need && cap.need.includes('raise')) { moves = moves.concat('raise'); cap = run({ ante: 1, bet: 1, stack: 1000, limit: true, seats }, moves); }
    // Limit: any amount named is the one amount.
    const lim = run({ ante: 1, bet: 4, stack: 20, limit: true, seats: [seats[0], { key: 'npc_j', hole: H('Jh 9h'), tilt: 0 }] }, ['bet:12']);
    // Everyone all in before the flop: nothing more to choose, the board dealt out to the showdown.
    const kings = [{ key: 'player', hole: H('7c 2d'), tilt: 0 }, { key: 'npc_k', hole: H('Kh Kd'), tilt: 0 }];
    const shove = run({ ante: 1, bet: 4, stack: 20, seats: kings }, ['allin']);
    // settlePot: a bet nobody called comes back; a short all in wins only the layer it matched.
    const back = [{ key: 'player', in: 30, live: true, final: H('As Ad Kc 9d 4h') }, { key: 'npc_a', in: 10, live: true, final: H('Ks Kd 7c 6d 2h') }, { key: 'npc_b', in: 5, live: false, final: null }];
    const pb = P.settlePot(back);
    const side = [{ key: 'player', in: 50, live: true, final: H('Qs Qd 8c 6d 2h') }, { key: 'npc_a', in: 20, live: true, final: H('As Ad Kc 9d 4h') }, { key: 'npc_b', in: 50, live: true, final: H('Js Jd 8h 6c 3h') }];
    const ps = P.settlePot(side);
    return {
      antes: [1, 19, 20, 39, 40, 100, 140].map(P.anteFor), bets: [1, 4, 5, 20, 23, 100, 140].map(P.unitFor),
      words: [P.rulesWords(20), P.rulesWords(20, 'nolimit'), P.rulesWords(100), P.rulesText(20), P.rulesText(20, 'nolimit')],
      clamp: [5, 3, 4, 8, 15, 16, 17, 30, NaN].map(w => P.clampTo(w, 4, 19, 4)),
      sizes: ['min', 'half', 'pot', 'allin'].map(z => P.sizeFor(k, z)).concat(['half', 'pot'].map(z => P.sizeFor(Object.assign({}, k, { pot: 20, maxTo: 99 }), z))),
      nl: { status: nl.status, need: nl.need, ask: nl.ask && { toCall: nl.ask.toCall, level: nl.ask.level, minTo: nl.ask.minTo, maxTo: nl.ask.maxTo }, log: nl.log.map(x => `${x.i}:${x.act}:${x.to}`) },
      cap: { need: cap.need, raises: cap.log.filter(x => x.act === 'raise' && x.street === 0).length, moves: cap.moves },
      lim: { moves: lim.moves, in: lim.in },
      shove: { done: shove.done, showdown: shove.showdown, street: shove.street, in: shove.in, moves: shove.moves },
      pb: { pot: pb.pot, winners: pb.winners, won: back.map(x => x.won), in: back.map(x => x.in), back: back[0].back },
      ps: { pot: ps.pot, winners: ps.winners, won: side.map(x => x.won) }
    };
  });
  assert.deepEqual(r.antes, [1, 1, 1, 1, 2, 5, 7], 'a twentieth, at least $1');
  assert.deepEqual(r.bets, [1, 1, 1, 4, 4, 20, 28], 'a fifth, at least $1');
  assert.deepEqual(r.words, ['Twenty to sit, a dollar ante, four-dollar limit.', 'Twenty to sit, a dollar ante, no limit.', 'A hundred to sit, a five-dollar ante, twenty-dollar limit.', '$20 to sit, $1 ante, $4 limit (every bet and raise $4)', '$20 to sit, $1 ante, no limit (bets from $4, up to all in)']);
  assert.deepEqual(r.clamp, [8, 4, 4, 8, 19, 19, 19, 19, 4], '$5 is $8; under $4 is $4; $15 and $16 would leave less than $4: all in; past the stack: all in; nothing typed: the least');
  assert.deepEqual(r.sizes, [4, 4, 4, 19, 12, 20], 'into $2: the least for ½ pot and Pot; into $20: $12 (10 to the nearest $4) and $20');
  assert.deepEqual(r.nl.log, ['0:bet:6', '1:raise:20'], 'the aces raise the pot: $6 + ($8 + $6) = $20');
  assert.deepEqual([r.nl.need, r.nl.ask], [['call', 'raise', 'fold'], { toCall: 14, level: 20, minTo: 34, maxTo: 99 }], 'the least raise: $20 and the last raise of $14, $34');
  assert.deepEqual([r.cap.need, r.cap.raises], [['call', 'fold'], 4], 'four raises in a round, then only call or fold');
  assert.deepEqual(r.lim, { moves: ['bet:4'], in: [5, 5] }, 'a limit bet is the table\'s bet whatever amount is named (the jack-nine calls it)');
  assert.deepEqual([r.shove.done, r.shove.showdown, r.shove.street, r.shove.in, r.shove.moves], [true, true, 4, [20, 20], ['bet:19']], 'all in and called: dealt out to the showdown');
  assert.deepEqual(r.pb, { pot: 25, winners: ['player'], won: [25, 0, 0], in: [10, 10, 5], back: 20 }, 'the $20 nobody called comes back');
  assert.deepEqual(r.ps, { pot: 120, winners: ['npc_a'], won: [60, 60, 0] }, 'the aces all in for $20 win the $60 they matched; the queens take the $60 side pot');
});

// ----- limit: the house game -----

s.test('limit, the house game: the head "$1 ante · $4 limit", the house rules said once, Check / Bet $4 and Call / Raise to $8 / Fold with no amount field; typed past the limit ("bet 20", "all in", "raise to 40") the dealer holds the player to it in character, at no cost, the words left in the box and the status line saying how to get a bigger game; "bet" and "call" typed play; the record keeps the structure and the pushbacks, OUTCOME notes them in one clause', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [] });
  const g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · $4 limit · pot $2`);
  assert.deepEqual([t.acts, t.field, t.presets], [['Check', 'Bet $4'], null, []], 'no amount control at the limit');
  assert.equal(t.hint, 'Twenty to sit, a dollar ante, four-dollar limit. Check, or bet $4. Stop folds the hand (−$1). Win (cheat)');
  // Past the limit, typed: refused in character, nothing played, nothing paid, the words kept.
  for (const words of ['bet 20', 'all in', 'raise to 40', 'bet 8']) {
    await typeLine(page, words);
    t = await tableNow(page);
    assert.match(t.said, new RegExp(`^(?:${spot.first} taps the felt\\. "Four-dollar bets at this table\\."|${spot.first} doesn't touch the chips\\. "It's a four-dollar game\\. House rules\\."|"Four-dollar limit," ${spot.first} says, and slides the chips back\\.)$`), words);
    assert.equal(await statusLine(page), `Four-dollar limit: Check or Bet $4. Ask ${spot.first} for table stakes if you want a bigger game.`);
    assert.equal(await page.inputValue('#cmd'), words, 'the words stay in the box');
    assert.deepEqual([t.acts, await gold(page), await page.evaluate(() => Game.Pipeline.handOpen)], [['Check', 'Bet $4'], g0 - 1, true], 'no cost, nothing played');
  }
  // "bet" typed: the $4 bet; he answers; "call" typed calls.
  await typeLine(page, 'bet');
  assert.equal(await page.inputValue('#cmd'), '');
  t = await tableNow(page);
  assert.equal(t.said, null, 'the dealer\'s line goes with the next deal of the table');
  while (await page.evaluate(() => Game.Pipeline.handOpen)) {
    t = await tableNow(page);
    if (t.acts[0].startsWith('Call')) {
      const m = /^Call \$(\d+)\|Raise to \$(\d+)\|Fold$/.exec(t.acts.join('|'));
      if (m) assert.equal(Number(m[2]) % 4, 0, 'a raise is one more $4 bet');
      else assert.match(t.acts.join('|'), /^Call \$\d+( \(all in\))?\|(?:All in \$\d+\|)?Fold$/, 'or call (all in), or a raise that is all in when the stack is short of a bet');
      await typeLine(page, 'call');
    } else await press(page, t.acts[0]);
  }
  await idle(page);
  const c = (await lastEntry(page)).cards;
  assert.deepEqual([c.structure, c.pushback, c.ante, c.unit], ['limit', 4, 1, 4]);
  assert.ok(c.actions.filter(x => x.act === 'bet' || x.act === 'raise').every(x => x.to % 4 === 0 || x.allIn), 'every bet a multiple of $4');
  moneyAddsUp(c, await gold(page) - g0);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`When the player tried to bet past the limit, ${spot.dealerName} held them to the house's \\$4 bets \\(4 times\\)\\.`));
  // Asking for table stakes with a hand open: between hands.
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'deal me in');
  await typeLine(page, 'no limit?');
  assert.equal(await statusLine(page), `Ask ${spot.first} for table stakes between hands: finish this one first.`);
  await page.click('#send');
  await idle(page);
});

// ----- no limit: the amount control -----

s.test('no limit (table stakes): the head says so; the amount field under the buttons with − and + by the bet and Min, ½ pot, Pot, All in; the Bet button reads the amount ("Bet $8", "All in $19"); a typed amount goes up to the next $4, under the least is the least, past the stack is all in, and the note says why; Enter in the field bets; everyone folding to the bet gives the antes, the bet nobody called coming back', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  const g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['7s', '2d']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $20 to sit · $1 ante · no limit · pot $2`);
  assert.deepEqual([t.acts, t.field, t.presets, t.note], [['Check', 'Bet $4'], '4', ['Min', '½ pot', 'Pot', 'All in'], '']);
  assert.equal(t.hint, 'Twenty to sit, a dollar ante, no limit. Check, or bet $4, $8, $12 up to all in ($19). Stop folds the hand (−$1). Win (cheat)');
  const after = async () => { const x = await tableNow(page); return [x.field, x.acts[1], x.note]; };
  const click = sel => page.click(`#feed .f-cards.open ${sel}`);
  await click('.cards-preset[data-size="allin"]');
  assert.deepEqual(await after(), ['19', 'All in $19', '']);
  await click('.cards-step[data-step="-1"]');
  assert.deepEqual(await after(), ['12', 'Bet $12', ''], '− from all in: the most that leaves a bet behind');
  await click('.cards-step[data-step="1"]');
  assert.deepEqual(await after(), ['19', 'All in $19', ''], '+: $16 would leave $3, so all in');
  for (const [sz, want] of [['min', '4'], ['half', '4'], ['pot', '4']]) {
    await click(`.cards-preset[data-size="${sz}"]`);
    assert.equal((await after())[0], want, `${sz} into $2`);
  }
  const typed = async v => { await page.fill('#feed .f-cards.open .cards-amt', v); return after(); };
  assert.deepEqual(await typed('5'), ['5', 'Bet $8', 'Bets go in $4s, so $8.']);
  assert.deepEqual(await typed('2'), ['2', 'Bet $4', 'The least bet is $4.']);
  assert.deepEqual(await typed('100'), ['100', 'All in $19', 'That\'s more than you have: all in is $19.']);
  assert.deepEqual(await typed('16'), ['16', 'All in $19', 'That would leave less than $4: all in ($19).']);
  assert.deepEqual(await typed('abc'), ['abc', 'Bet $4', 'Type an amount in dollars. The least bet is $4.']);
  assert.deepEqual(await typed('$8'), ['$8', 'Bet $8', '']);
  // Enter in the field bets $8; the seven-deuce folds; the antes are the player's and the $8 comes back.
  await page.press('#feed .f-cards.open .cards-amt', 'Enter');
  await idle(page);
  const c = (await lastEntry(page)).cards;
  t = await tableNow(page);
  assert.deepEqual([c.structure, c.moves, c.uncontested, c.pot, c.player.in, c.player.back, c.delta, c.result], ['nolimit', ['bet:8'], true, 2, 1, 8, 1, 'win']);
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.result], ['folds before the flop', 'takes the pot', `You win $1 · cash $${g0 + 1}`]);
  moneyAddsUp(c, await gold(page) - g0);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`house rules: \\$20 to sit, \\$1 ante, no limit \\(bets from \\$4, up to all in\\), four rounds of betting\\): Texas hold'em, heads up with ${spot.dealerName}; the player bet \\$8 before the flop and ${spot.dealerName} folded; `));
});

s.test('no limit: the dealer raises the player\'s bet (Call $40 / Raise to $120 / Fold, the least raise the bet and the last raise), the player raises, he goes all in, the call puts the player all in and the board is dealt out to the showdown; the statuses, the pot line and the cash follow every bet; OUTCOME tells the moment once', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await addCash(page, 400);
  const g0 = await gold(page);
  await deal(page, [['Ah', 'Kd'], ['Jc', 'Js']], ['2c', '7d', '9h', '3s', '4c']);
  await startHand(page, 'I bet $200 at cards');
  let t = await tableNow(page);
  assert.equal(t.head, `${spot.dealerName}'s table · Texas hold'em · $200 to sit · $10 ante · no limit · pot $20`);
  await page.fill('#feed .f-cards.open .cards-amt', '40');
  await pressMain(page);
  t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.acts, t.pot, t.field], ['raises to $80', 'bets $40', ['Call $40', 'Raise to $120', 'Fold'], 'Pot $140 · you\'re in for $50 · $150 left', '120']);
  assert.equal(t.hint, 'Call $40, raise to $120 or all in ($190), or fold. Stop folds the hand (−$50). Win (cheat)');
  assert.equal(await gold(page), g0 - 50, 'the ante and the bet are off the cash');
  // Enter with a line that is no bet: the nudge says the choice and what can be typed.
  await typeLine(page, 'I look around');
  assert.equal(await statusLine(page), 'Your hand is on the table: Call $40, Raise or Fold (or type "call", "raise to 120", "all in" or "fold"). Stop folds the hand (−$50); Win (cheat) ends it yours.');
  await page.fill('#cmd', '');
  await pressMain(page);
  t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.seats[1].status, t.acts, t.pot, t.field], ['all in $190', 'raises to $120', ['Call $70 (all in)', 'Fold'], 'Pot $330 · you\'re in for $130 · $70 left', null]);
  await press(page, 'Call $70 (all in)');
  await idle(page);
  t = await tableNow(page);
  const c = (await lastEntry(page)).cards;
  assert.deepEqual([t.board.street, t.board.cards, t.seats[0].cards, t.result], ['Showdown', ['2c', '7d', '9h', '3s', '4c'], ['Jc', 'Js'], `You lose $200 · cash $${g0 - 200}`]);
  assert.deepEqual([c.moves, c.pot, c.street], [['bet:40', 'raise:120', 'call'], 400, 4]);
  assert.deepEqual(c.actions.map(x => [x.seat, x.act, x.to, x.allIn === true]), [['player', 'bet', 40, false], [spot.dealer, 'raise', 80, false], ['player', 'raise', 120, false], [spot.dealer, 'raise', 190, true], ['player', 'call', 190, true]]);
  moneyAddsUp(c, await gold(page) - g0);
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(out, new RegExp(`heads up with ${spot.dealerName}; the player raised to \\$120 before the flop, ${spot.dealerName} went all in and the player called; ${spot.dealerName}'s pair of jacks takes the \\$400 pot; the player's ace high loses: the player loses \\$200`));
  assert.match((await lastEntry(page)).narration, new RegExp(`you raised to \\$120 before the flop, ${spot.dealerName} went all in and you called`));
  // The player all in at once with the All in preset; the jacks call.
  const g1 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Jc', 'Js']], ['2c', '7d', '9h', '3s', '4c']);
  await startHand(page, 'I bet $200 at cards');
  await page.click('#feed .f-cards.open .cards-preset[data-size="allin"]');
  assert.equal((await tableNow(page)).acts[1], 'All in $190');
  await pressMain(page);
  await idle(page);
  const d = (await lastEntry(page)).cards;
  assert.deepEqual([d.moves, d.player.in, d.street, d.shown, d.result], [['bet:190'], 200, 4, 5, 'win']);
  moneyAddsUp(d, await gold(page) - g1);
});

// ----- draw's round -----

s.test('five-card draw: the ante, the draw, then one round of betting after the draw (the player\'s five face up with the new ones marked, each seat\'s draw said), at the limit and at table stakes; a fold before the draw costs only the ante; a fold after it what was put in', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await presetCards(page, { game: 'draw', seats: [] });
  const DEAL = { player: ['Kc', 'Kd', '7h', '7s', '2c'], dealer: ['Ac', 'Ad', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] };
  let g0 = await gold(page);
  await dealDraw(page, DEAL);
  await startHand(page, 'I bet $20 at cards');
  let t = await tableNow(page);
  assert.deepEqual([t.head, t.acts, t.pot], [`${spot.dealerName}'s table · Five-card draw · $20 to sit · $1 ante · $4 limit · pot $2`, ['Draw 5', 'Fold −$1'], 'Pot $2 · you\'re in for $1 · $19 left']);
  for (const i of [0, 1, 2, 3]) await page.click(`#feed .f-cards.open .cards-you button.card[data-i="${i}"]`);
  await page.click('#feed .f-cards.open .cards-draw');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'drawbet');
  t = await tableNow(page);
  assert.deepEqual(t.seats[1].cards, ['Kc', 'Kd', '7h', '7s', '3d'], 'the player\'s five face up after the draw');
  assert.deepEqual([t.seats[1].name, t.seats[0].name, t.seats[0].cards], ['Two pair, kings and sevens', `${spot.first} draws 3`, ['back', 'back', 'back', 'back', 'back']]);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards.open .cards-you .card')].filter(c => c.classList.contains('drawn')).length), 1, 'the new card marked');
  assert.deepEqual([t.acts, t.field], [['Check', 'Bet $4'], null]);
  assert.equal(t.hint, 'Check, or bet $4. Stop folds the hand (−$1). Win (cheat)');
  await press(page, 'Bet $4');
  await idle(page);
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.game, c.structure, c.moves, c.result, c.pot, c.delta], ['draw', 'limit', ['hold:0123', 'bet:4'], 'win', 10, 5], 'his aces call the $4');
  moneyAddsUp(c, await gold(page) - g0);
  // At table stakes the round after the draw has the amount control.
  await presetCards(page, { game: 'draw', seats: [], structure: 'nolimit' });
  g0 = await gold(page);
  await dealDraw(page, DEAL);
  await startHand(page, 'I bet $20 at cards');
  await page.click('#feed .f-cards.open .cards-draw');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'drawbet');
  t = await tableNow(page);
  assert.deepEqual([t.acts, t.presets], [['Check', 'Bet $4'], ['Min', '½ pot', 'Pot', 'All in']]);
  await page.fill('#feed .f-cards.open .cards-amt', '12');
  await pressMain(page);
  while (await page.evaluate(() => Game.Pipeline.handOpen)) await press(page, (await tableNow(page)).acts[0]);
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.equal(c.moves[1], 'bet:12');
  moneyAddsUp(c, await gold(page) - g0);
  // A fold after the draw, to his bet: what was put in (the ante); his bet nobody called comes back.
  await presetCards(page, { game: 'draw', seats: [], structure: 'limit' });
  g0 = await gold(page);
  await dealDraw(page, DEAL);
  await startHand(page, 'I bet $20 at cards');
  for (const i of [0, 1, 2, 3]) await page.click(`#feed .f-cards.open .cards-you button.card[data-i="${i}"]`);
  await page.click('#feed .f-cards.open .cards-draw');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'drawbet');
  await press(page, 'Check');
  t = await tableNow(page);
  assert.deepEqual([t.seats[0].status, t.acts], ['bets $4', ['Call $4', 'Raise to $8', 'Fold']], 'his aces bet after the draw');
  await press(page, 'Fold');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.result, c.delta, c.player.foldedOn, c.dealer.back, c.dealer.hidden], ['fold', -1, 1, 4, true], 'his cards stay face down: nobody called');
  assert.deepEqual([(await tableNow(page)).seats[1].status, (await tableNow(page)).seats[0].cards], ['folds after the draw', ['back', 'back', 'back', 'back', 'back']]);
  moneyAddsUp(c, await gold(page) - g0);
  // A fold before the draw: the ante. After the draw, facing a bet: what was put in.
  g0 = await gold(page);
  await dealDraw(page, DEAL);
  await startHand(page, 'I bet $20 at cards');
  await page.click('#feed .f-cards.open .cards-fold');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.result, c.delta, c.pot, c.player.foldedOn, await gold(page) - g0], ['fold', -1, 2, 0, -1]);
  assert.equal((await tableNow(page)).seats[1].status, 'folds before the draw');
});

// ----- typed bets -----

s.test('bets typed in the box with a hand open (table stakes): "bet ten" goes up to $12 and says so, "check" facing a bet is answered with what the table offers, "raise to 30" past the stack is all in, "call", "fold" and "all in" act as the buttons do; the box empties when one plays', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  // "bet ten": $12; the kings call.
  let g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await typeLine(page, 'I bet ten dollars');
  assert.equal(await page.inputValue('#cmd'), '');
  let e = await page.evaluate(() => Game.Storage.heldHand().moves);
  assert.deepEqual(e, ['bet:12']);
  // Facing a bet later on, "check" is answered; "raise to 30" is all in.
  let t = await tableNow(page);
  while (!t.acts[0].startsWith('Call') && await page.evaluate(() => Game.Pipeline.handOpen)) { await press(page, t.acts[0]); t = await tableNow(page); }
  if (await page.evaluate(() => Game.Pipeline.handOpen)) {
    await typeLine(page, 'check');
    assert.match(await statusLine(page), /^There's a bet to you: call \$\d+( \(all in\))?(, raise)? or fold\.$/);
    assert.equal(await page.inputValue('#cmd'), 'check', 'the line stays');
    await typeLine(page, 'raise to 30');
    while (await page.evaluate(() => Game.Pipeline.handOpen)) await press(page, (await tableNow(page)).acts[0]);
  }
  await idle(page);
  let c = (await lastEntry(page)).cards;
  moneyAddsUp(c, await gold(page) - g0);
  // "all in", then the answer: "call" from the other side is a seat's; "fold" folds.
  g0 = await gold(page);
  await deal(page, [['7c', '2d'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'deal me in');
  await typeLine(page, 'check');
  t = await tableNow(page);
  assert.match(t.seats[0].status, /^bets \$\d+$/, 'the kings bet');
  await typeLine(page, 'call');
  t = await tableNow(page);
  assert.equal(t.board.street, 'The flop', 'called');
  await typeLine(page, 'fold');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.result, c.moves[c.moves.length - 1]], ['fold', 'fold']);
  moneyAddsUp(c, await gold(page) - g0);
  g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'deal me in');
  await typeLine(page, "I'm all in");
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.moves, c.player.in], [['bet:19'], 20]);
  moneyAddsUp(c, await gold(page) - g0);
  assert.ok(spot);
});

// ----- asking for table stakes -----

s.test('asking for a bigger game between hands ("table stakes", "no limit", "take the limit off", "can we bet what we like"): a Charm roll against the dealer; a yes makes his table no limit for the rest of the day (the flag, the head, the control), a no is his "no" and asked again the same day he repeats it without a roll, a fumble costs 5 of his warmth and he will not hear it again today, cold he refuses without a roll, already no limit he says so; the demo reads the words as a persuade aimed at him; the narrator hears it', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  const parsed = await page.evaluate(async () => {
    const out = {};
    for (const t of ['Can we play no limit?', 'Table stakes, Curtis?', "Let's take the limit off", 'Can we bet what we like?', 'How about a bigger game?', 'I want to raise the stakes', 'Let us play for real']) { const p = await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' })); out[t] = `${p.actionType}:${(p.targets || []).join(',')}:${p.stat}`; }
    return out;
  });
  for (const [t, v] of Object.entries(parsed)) assert.equal(v, `persuade:${spot.dealer}:charm`, t);
  const flags = () => page.evaluate(d => ({ nl: Game.state.flags[`cardsNoLimit.${d}`] || null, asked: Game.state.flags[`cardsAsked.${d}`] || null, att: Game.State.npc(d).attitude, structure: Game.Pipeline.tableStructure(Game.State.npc(d)) }), spot.dealer);
  const quiet = () => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].pop().textContent);
  const rolls = () => page.locator('#feed .f-roll').count();
  // A no (d20 2), then again: no roll.
  let n0 = await rolls();
  await page.evaluate(() => Game.Pipeline.forceNextRoll(2));
  await sendText(page, "Curtis, let's take the limit off.");
  assert.equal(await rolls(), n0 + 1, 'the usual roll line');
  assert.equal(await quiet(), `"House rules," ${spot.first} says. "We play the limit here."`);
  let f = await flags();
  assert.deepEqual([f.nl, f.asked, f.structure], [null, spot.day, 'limit']);
  assert.match(line(await lastCall(page, 'narrate'), 'TABLE STAKES: '), new RegExp(`^TABLE STAKES: the player asked ${spot.dealerName} to take the limit off the card game; the roll failed: ${spot.dealerName} keeps the house limit`));
  n0 = await rolls();
  await sendText(page, 'Come on, table stakes.');
  assert.equal(await rolls(), n0, 'asked again the same day: no roll');
  assert.equal(await quiet(), `"You heard me," ${spot.first} says. "House rules."`);
  // The next day: a yes (d20 18).
  const day2 = await page.evaluate(d => { const S = Game.State; const l = S.loc(Game.state.player.locationId); let n = d + 1; while (S.isClosed(l, n)) n++; S.apply({ setTime: { day: n, phase: 'evening' } }); return n; }, spot.day);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(18));
  await sendText(page, 'Can we bet what we like?');
  assert.equal(await quiet(), `${spot.first} shrugs. "Table stakes, then. Don't cry to me after."`);
  f = await flags();
  assert.deepEqual([f.nl, f.structure], [day2, 'nolimit']);
  assert.match((await lastEntry(page)).narration, new RegExp(`You ask ${spot.dealerName} for table stakes, and ${spot.dealerName} agrees: no limit at the card table for the rest of today\\.`));
  assert.equal(await page.evaluate(d => Game.State.npc(d).attitude, spot.dealer), f.att, 'the ask itself moves no feeling');
  await sendText(page, 'no limit, right?');
  assert.equal(await quiet(), `"Table stakes already," ${spot.first} says. "Bet what you like."`);
  // His table today: no limit, the control.
  await presetCards(page, { game: 'holdem', seats: [] });
  await startHand(page, 'deal me in');
  let t = await tableNow(page);
  assert.match(t.head, / · \$1 ante · no limit · pot \$2$/);
  assert.deepEqual(t.presets, ['Min', '½ pot', 'Pot', 'All in']);
  await page.click('#send');
  await idle(page);
  assert.equal((await lastEntry(page)).cards.structure, 'nolimit');
  // A fumble the day after (d20 1): -5, and no second roll that day.
  const day3 = await page.evaluate(d => { const S = Game.State; const l = S.loc(Game.state.player.locationId); let n = d + 1; while (S.isClosed(l, n)) n++; S.apply({ setTime: { day: n, phase: 'evening' } }); return n; }, day2);
  const a0 = (await flags()).att;
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await sendText(page, 'How about a bigger game?');
  f = await flags();
  assert.deepEqual([f.att, f.asked, f.structure], [a0 - 5, day3, 'limit']);
  assert.equal(await quiet(), `${spot.first}'s face closes. "Ask me that again and you can find another game."`);
  n0 = await rolls();
  await sendText(page, 'Table stakes?');
  assert.deepEqual([await rolls(), (await flags()).att], [n0, a0 - 5], 'no second roll, no second cost');
  // Cold: refused without a roll.
  await page.evaluate(([d, day]) => { const S = Game.State; const l = S.loc(Game.state.player.locationId); let n = day + 1; while (S.isClosed(l, n)) n++; S.apply({ setTime: { day: n, phase: 'evening' }, effects: [{ op: 'attitudeDelta', npcId: d, delta: -5 - Game.State.npc(d).attitude }] }); }, [spot.dealer, day3]);
  n0 = await rolls();
  await sendText(page, 'Can we play no limit?');
  assert.deepEqual([await rolls(), await quiet()], [n0, `${spot.first} doesn't look up. "Not with you."`]);
});

// ----- records, reloads, replays, cheats, undo -----

s.test('the stored hand resumes mid-street with its amounts and its structure after a reload (folded where it was left); the finished table drawn again after a reload shows the structure; /undo mid-betting takes the turn back free; the Win (cheat) facing a raise has everyone call the bet on the table; /cheat win pays every other seat\'s stake at hold\'em and at draw', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await addCash(page, 400);
  // Stored mid-street: $8 bet, then the page closes.
  let g0 = await gold(page);
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '8');
  await pressMain(page);
  const held = await page.evaluate(() => Game.Storage.heldHand());
  assert.deepEqual([held.moves[0], held.structure], ['bet:8', 'nolimit']);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(() => !!Game.state.log[Game.state.log.length - 1].cards);
  await idle(page);
  let c = (await lastEntry(page)).cards;
  assert.deepEqual([c.closed, c.result, c.structure, c.moves.slice(0, 1), c.moves[c.moves.length - 1]], [true, 'fold', 'nolimit', ['bet:8'], 'fold'], 'resumed with its amounts (the hook was lost with the reload: the stored hand kept the structure)');
  moneyAddsUp(c, await gold(page) - g0);
  assert.match((await tableNow(page)).head, / · \$1 ante · no limit · pot \$\d+$/, 'drawn again with its structure');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.match((await tableNow(page)).head, / · \$1 ante · no limit · pot \$\d+$/, 'and after another reload');
  // /undo mid-betting: free, the line back in the box.
  await fast(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  const sBefore = await page.evaluate(() => JSON.stringify(Game.state));
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  await startHand(page, 'I bet $20 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '12');
  await pressMain(page);
  assert.ok((await gold(page)) < JSON.parse(sBefore).player.gold, 'money in mid-hand');
  await page.fill('#cmd', '/undo');
  await page.press('#cmd', 'Enter');
  await idle(page);
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state)), sBefore, 'the game as it was before the bet');
  assert.equal(await page.inputValue('#cmd'), 'I bet $20 at cards');
  await page.fill('#cmd', '');
  // The Win (cheat) facing a raise: the raise called, the pot as it stands, matched.
  g0 = await gold(page);
  await deal(page, [['7c', '2d'], ['Jc', 'Js']], ['2c', '7d', '9h', '3s', '4c']);
  await startHand(page, 'I bet $200 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '40');
  await pressMain(page);
  assert.equal((await tableNow(page)).seats[0].status, 'raises to $80');
  await page.click('#feed .f-cards.open .cards-win');
  await idle(page);
  c = (await lastEntry(page)).cards;
  assert.deepEqual([c.win, c.result, c.player.in, c.dealer.in, c.pot, c.delta], ['control', 'win', 90, 90, 180, 90], 'the $80 raise called: $90 each in');
  moneyAddsUp(c, await gold(page) - g0);
  // /cheat win: every other seat's stake, at hold'em and at draw.
  for (const game of ['holdem', 'draw']) {
    const two = (await atTable(page, 'evening')).people.slice(0, 2).map(p => p.id);
    await presetCards(page, { game, seats: two, structure: null });
    await sendText(page, '/cheat win');
    g0 = await gold(page);
    await sendText(page, 'I bet $20 at cards');
    c = (await lastEntry(page)).cards;
    assert.deepEqual([c.game, c.win, c.result, c.pot, c.delta, await gold(page) - g0], [game, 'armed', 'win', 80, 60, 60], `${game}: (4 − 1) × $20, everyone all in`);
  }
});

s.test('/reroll (here /cheat fumble, with a marked deck) replays a no-limit hand from its record: the same cards, moves, actions and structure; only the catch roll is new', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  await atTable(page);
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await addCash(page, 400);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(15));
  await deal(page, [['Ah', 'Kd'], ['Jc', 'Js']], ['2c', '7d', '9h', '3s', '4c']);
  const g0 = await gold(page);
  await startHand(page, 'I bet $200 at cards');
  await page.fill('#feed .f-cards.open .cards-amt', '40');
  await pressMain(page);
  await page.click('#feed .f-cards.open .cards-fold');
  await idle(page);
  const played = (await lastEntry(page)).cards;
  assert.deepEqual([played.result, played.delta, played.moves], ['fold', -50, ['bet:40', 'fold']]);
  await sendText(page, '/cheat fumble');
  const again = (await lastEntry(page)).cards;
  assert.deepEqual([again.moves, again.actions, again.board, again.player.dealt, again.dealer.dealt, again.structure, again.pot], [played.moves, played.actions, played.board, played.player.dealt, played.dealer.dealt, 'nolimit', played.pot]);
  assert.deepEqual([again.result, again.delta, await gold(page) - g0], ['caught', -200, -200], 'caught: the stake lost');
});

// ----- phones -----

s.test('phones at 320 and 390 wide with three at the table: the amount control fits with no horizontal overflow, every button and the field are 44px tall, and after a press the player\'s row and the control stay in view inside the story', async h => {
  for (const vp of [{ width: 320, height: 640 }, { width: 390, height: 844 }]) {
    const page = await open(h, vp, { contextOptions: { reducedMotion: 'reduce', isMobile: true, hasTouch: true } });
    await quickStart(page);
    await fast(page);
    const spot = await atTable(page, 'evening');
    await presetCards(page, { game: 'holdem', seats: spot.people.slice(0, 2).map(p => p.id), structure: 'nolimit' });
    await deal(page, [['Ah', 'Kh'], ['Qc', 'Qd'], ['Jc', 'Jd'], ['Tc', 'Td']], ['2s', '5h', '8d', '3c', '4s'], spot.people.slice(0, 2).map(p => p.id));
    await startHand(page, 'I bet $20 at cards');
    let presses = 0;
    while (await page.evaluate(() => Game.Pipeline.handOpen) && presses < 8) {
      assert.deepEqual(await overflowReport(page, vp.width), [], `${vp.width}: no sideways scroll`);
      const geo = await page.evaluate(() => {
        const f = document.querySelector('#feed-scroll');
        const box = f.getBoundingClientRect();
        const t = document.querySelector('#feed .f-cards.open');
        const inside = el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1; };
        const size = t.querySelector('.cards-size');
        const taps = [...t.querySelectorAll('.cards-acts button, .cards-size button, .cards-hint .cards-win')].map(b => Math.round(b.getBoundingClientRect().height));
        const wrap = t.querySelector('.cards-amt-wrap');
        return { you: inside(t.querySelector('.cards-you .cards-row')), acts: [...t.querySelectorAll('.cards-acts button')].every(inside), size: size ? inside(size) : null, taps, field: wrap ? Math.round(wrap.getBoundingClientRect().height) : null, fieldFont: t.querySelector('.cards-amt') ? getComputedStyle(t.querySelector('.cards-amt')).fontSize : null };
      });
      assert.ok(geo.taps.every(x => x >= 44), `${vp.width}: 44px taps ${geo.taps}`);
      if (presses > 0) assert.deepEqual([geo.you, geo.acts, geo.size === null ? true : geo.size], [true, true, true], `${vp.width} after press ${presses}`);
      if (geo.field !== null) assert.deepEqual([geo.field >= 44, geo.fieldFont], [true, '16px'], 'the field is a tap tall and 16px (no zoom)');
      const t = await tableNow(page);
      if (t.presets.length && presses === 0) await page.click('#feed .f-cards.open .cards-preset[data-size="half"]');
      await press(page, t.acts[0]);
      presses++;
      await page.waitForTimeout(60);
    }
    assert.ok(presses >= 2);
    if (await page.evaluate(() => Game.Pipeline.handOpen)) await page.click('#send');
    await idle(page);
    assert.deepEqual(await overflowReport(page, vp.width), [], `${vp.width}: finished`);
  }
});

// ----- the soak -----

s.test('a 40-hand soak with random legal actions (both games, both structures, the seats as the seed seats them): no page error, nothing refused by State.apply, the pot and the cash to the dollar every hand', async h => {
  const page = await open(h);
  await quickStart(page, { seed: 4242 });
  await fast(page);
  let rng = 12345;
  const rand = () => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return rng / 4294967296; };
  const rejected0 = await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'rejected').length);
  let hands = 0;
  for (let k = 0; k < 40; k++) {
    const spot = await atTable(page);
    assert.ok(spot, 'the table');
    if ((await gold(page)) < 120) await addCash(page, 300);
    const game = rand() < 0.5 ? 'holdem' : 'draw';
    const structure = rand() < 0.5 ? 'limit' : 'nolimit';
    await presetCards(page, { game, seats: null, structure });
    const stake = [5, 20, 23, 40, 100][Math.floor(rand() * 5)];
    const g0 = await gold(page);
    await page.fill('#cmd', `I bet $${stake} at cards`);
    await page.press('#cmd', 'Enter');
    await page.waitForFunction(() => !Game.Pipeline.busy || Game.Pipeline.handOpen);
    for (let step = 0; step < 40 && await page.evaluate(() => Game.Pipeline.handOpen); step++) {
      const x = rand();
      const y = rand();
      await page.evaluate(([x, y]) => {
        const P = Game.Pipeline;
        const t = P.openHand;
        if (!t) return;
        if (P.handKind === 'draw') { P.playHand(x < 0.08 ? { fold: true } : { hold: [0, 1, 2, 3, 4].filter((i, j) => (y * 32) & (1 << j)) }); return; }
        const opts = t.options || ['check'];
        const a = t.ask || {};
        const pick = opts[Math.floor(x * opts.length)];
        if (pick === 'fold') P.playHand(x < 0.05 ? { fold: true } : { act: opts[0] });
        else if (pick === 'bet' || pick === 'raise') P.playHand({ act: pick, to: Math.floor(a.minTo + y * (a.maxTo - a.minTo + 4)) });
        else P.playHand({ act: pick });
      }, [x, y]);
      await page.waitForTimeout(5);
      await page.waitForFunction(() => !Game.Pipeline.busy || Game.Pipeline.handOpen);
    }
    await idle(page);
    const e = await lastEntry(page);
    assert.ok(e.cards, `hand ${k}: a hand was played`);
    moneyAddsUp(e.cards, await gold(page) - g0);
    assert.ok(e.cards.player.in <= stake && e.cards.dealer.in <= stake, `hand ${k}: nobody puts in more than the stake`);
    if (structure === 'limit') assert.ok(e.cards.actions.every(a => !['bet', 'raise'].includes(a.act) || a.allIn || a.to % e.cards.unit === 0), `hand ${k}: limit bets in the table's bet`);
    hands++;
  }
  assert.equal(hands, 40);
  assert.equal(await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'rejected').length), rejected0, 'nothing refused');
});

s.test('no innerHTML, outerHTML, insertAdjacentHTML or document.write anywhere', async h => {
  const src = fs.readFileSync(GAME_PATH, 'utf8');
  const script = src.split('<script>').slice(1).join('');
  for (const bad of ['.innerHTML', '.outerHTML', 'insertAdjacentHTML', 'document.write']) assert.equal(script.includes(bad), false, bad);
  const page = await open(h);
  await quickStart(page);
  assert.equal(await page.evaluate(() => typeof Game.Pipeline.typedBet), 'function');
});

s.run();
