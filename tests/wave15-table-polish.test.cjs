'use strict';
/* Wave 15: the eight small things a verification QA pass found after the
   wave 14 table fixes (docs/notes/engine-world.md and docs/notes/ui.md,
   Wave 15). Covered here: a draw hand left open in a game saved before
   wave 13 (no game stored with it) folds on load at the normal price, and
   Stop at a chooser with no line to put back says only "Stopped. Nothing
   lost." (#1); the kickers of hands of one name named to one depth (#2);
   cheat deals give the other seats hands that differ (#3); after a hand,
   whoever came in and did not sit in still arrives, in the demo and in the
   narrator's packet, and nobody who sat in does (#4); after a press the
   focus goes to the table's first button, in view (#5); /help works with a
   hand open (#6; wave 16: /undo there takes the turn back, free, where wave
   15 said to end the hand first: tests/wave16-undo.test.cjs); the demo reads
   "Mind if I join you for a hand?", "Count me in", "I take a seat at the
   card table", "I sit at the table" and "Deal me into the game" as bets
   where a dealer sits, and still not "I sit in the corner" or "I bet he is
   lying" (#7); a game named and then put down ("draw poker is for old
   men") is the one being left (#8).
   Mock mode. Run with: node tests/wave15-table-polish.test.cjs */
const assert = require('assert/strict');
const { suite, quickStart, sendText, presetCards, LAPTOP } = require('./helpers.cjs');

const s = suite('wave15-table-polish');
const open = (h, viewport) => h.open({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } });
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
const gold = page => page.evaluate(() => Game.state.player.gold);
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
const statusLine = page => page.textContent('#turn-status-text');
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
    if (dealer) return { loc: l.id, name: l.name, phase: ph, day: d, dealer: dealer.id, dealerName: dealer.name, people: G.Pipeline.cardPeople(here, dealer).map(n => ({ id: n.id, name: n.name })) };
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
  const board = t.querySelector('.cards-board');
  return {
    open: t.classList.contains('open'), game: t.dataset.game, head: t.querySelector('.cards-head').textContent,
    seats: [...t.querySelectorAll('.cards-side')].map(el => ({ seat: el.dataset.seat, status: el.querySelector('.cards-status').textContent })),
    street: board ? board.querySelector('.cards-street').textContent : null,
    acts: [...t.querySelectorAll('.cards-acts button')].map(b => b.textContent),
    result: t.querySelector('.cards-result') ? t.querySelector('.cards-result').textContent : null
  };
});
const parse = (page, list) => page.evaluate(async l => { const out = {}; for (const t of l) out[t] = (await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' }))).actionType; return out; }, list);

// ----- #1: a hand left open before wave 13; the chooser's Stop with nothing to put back -----

s.test('#1 a draw hand left open in a game saved before wave 13 (the stored hand has no game, seats or moves) folds on load at the normal price, with the cards as dealt ("You left the table, so you fold: −$5"), never the chooser; Stop at a chooser with no line to put back says only "Stopped. Nothing lost."', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  // No game remembered, as in a wave 12 game.
  await presetCards(page, { game: null, seats: [] });
  const g0 = await gold(page);
  await startHand(page, 'I bet $10 at five-card draw');
  assert.equal((await tableNow(page)).game, 'draw');
  const dealt = await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards .cards-you .card')].map(c => c.dataset.card));
  const held = await page.evaluate(() => Game.Storage.heldHand());
  assert.equal(held.cardGame, 'draw');
  // The hand as wave 12 stored it: no game, no seats, no moves.
  await page.evaluate(() => { const k = 'novatria.hand'; const x = JSON.parse(localStorage.getItem(k)); for (const f of ['cardGame', 'seats', 'moves', 'chose', 'deal']) delete x[f]; localStorage.setItem(k, JSON.stringify(x)); });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(() => Game.Pipeline.handKind === 'choose' || !!Game.state.log[Game.state.log.length - 1].cards);
  assert.notEqual(await page.evaluate(() => Game.Pipeline.handKind), 'choose', 'not the chooser');
  await idle(page);
  const e = await lastEntry(page);
  assert.deepEqual([e.input, e.cards.game, e.cards.result, e.cards.closed, e.cards.delta, e.cards.player.dealt, await gold(page) - g0], ['I bet $10 at five-card draw', 'draw', 'fold', true, -5, dealt, -5]);
  assert.equal((await tableNow(page)).result, `You left the table, so you fold: −$5 · cash $${g0 - 5}`);
  assert.equal(await lastNotice(page), 'The game was closed with a hand on the table, so the hand is folded and the ante is gone.');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-cards[data-game="choose"]').length), 0);
  assert.equal(await page.evaluate(() => Game.state.flags.cardGame || null), null, 'a game saved with none remembered (the folded hand chose none)');
  // A typed line at the chooser goes back in the box on Stop, as before.
  await presetCards(page, { game: null, seats: [] });
  const g1 = await gold(page);
  const log1 = await page.evaluate(() => Game.state.log.length);
  await startHand(page, 'deal me in');
  assert.equal(await page.evaluate(() => Game.Pipeline.handKind), 'choose');
  await page.click('#send');
  await idle(page);
  assert.deepEqual([await lastNotice(page), await page.inputValue('#cmd')], ['Stopped. Your action was kept in the box.', 'deal me in']);
  await page.fill('#cmd', '');
  // A turn with no line to put back (a resumed hand) that reaches the chooser: Stop says nothing about the box.
  await page.evaluate(a => { Game.Pipeline.runTurn({ input: 'I bet $10 at cards', mode: 'normal', speech: { mode: 'do' }, action: a, resume: 'open', storedHand: { seats: [], moves: [] } }); }, held.action);
  await page.waitForFunction(() => Game.Pipeline.handKind === 'choose');
  await page.click('#send');
  await idle(page);
  assert.equal(await lastNotice(page), 'Stopped. Nothing lost.');
  assert.deepEqual([await page.inputValue('#cmd'), await gold(page), await page.evaluate(() => Game.state.log.length), await page.locator('#feed .f-cards.open').count()], ['', g1, log1, 0], 'nothing lost, nothing in the box');
});

// ----- #2: kickers named to one depth -----

s.test('#2 hands of one name are named to one depth: three pairs of aces with K-J, K-T and 9-8 read "king-jack kickers", "king-ten kickers", "nine-eight kickers"; when the first kicker tells them apart, "jack kicker" / "ten kicker" / "nine kicker"; an exact tie keeps one name; at the table the three statuses line up', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const names = await page.evaluate(() => {
    const C = Game.Cards;
    const H = t => t.split(' ');
    return {
      qa: C.namesApart([H('Ah Ad Kc Jd 7h'), H('As Ac Kh Td 7c'), H('Ah Ad 9c 8d 7h')]),
      second: C.namesApart([H('Ah Ad Kc Jd 7h'), H('As Ac Kh Td 7c'), H('Ah Ad Ks 9d 7h')]),
      first: C.namesApart([H('Ah Ad Jc 8d 7h'), H('As Ac Th 8s 7c'), H('Ah Ad 9c 8d 7h')]),
      tie: C.namesApart([H('Ah Ad Kc Jd 7h'), H('As Ac Kh Js 7c'), H('Ah Ad Qc 8d 7h')]),
      trips: C.namesApart([H('7h 7d 7c Ah Kd'), H('7h 7s 7c As Qd')]),
      mixed: C.namesApart([H('Ah Ad Kc Jd 7h'), H('Kh Kd 9c 8d 7h'), H('As Ac Kh Td 7c'), null])
    };
  });
  assert.deepEqual(names, {
    qa: ['Pair of aces, king-jack kickers', 'Pair of aces, king-ten kickers', 'Pair of aces, nine-eight kickers'],
    second: ['Pair of aces, king-jack kickers', 'Pair of aces, king-ten kickers', 'Pair of aces, king-nine kickers'],
    first: ['Pair of aces, jack kicker', 'Pair of aces, ten kicker', 'Pair of aces, nine kicker'],
    tie: ['Pair of aces, king kicker', 'Pair of aces, king kicker', 'Pair of aces, queen kicker'],
    trips: ['Three of a kind, sevens, ace-king kickers', 'Three of a kind, sevens, ace-queen kickers'],
    mixed: ['Pair of aces, king-jack kickers', 'Pair of kings', 'Pair of aces, king-ten kickers', null]
  });
  // The QA's table: a board of aces, the player's K-J, a seat's K-T and Curtis's 9-8, checked and called to the showdown
  // (the seats play by the hand's own coin: the first of the card players here with whom all three are shown).
  const spot = await atTable(page, 'evening');
  let c = null;
  for (const seat of spot.people) {
    await presetCards(page, { game: 'holdem', seats: [] });
    await deal(page, [['Kc', 'Jd'], ['Kh', 'Td'], ['9c', '8d']], ['As', 'Ad', '7h', '4c', '2s'], [seat.id]);
    await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
    await sendText(page, 'I bet $20 at cards');
    c = (await lastEntry(page)).cards;
    if ([c.player].concat(c.seats, [c.dealer]).every(x => x.final)) break;
  }
  assert.ok([c.player].concat(c.seats, [c.dealer]).every(x => x.final), 'all three shown');
  assert.deepEqual([c.player.name, c.seats[0].name, c.dealer.name], ['Pair of aces, king-jack kickers', 'Pair of aces, king-ten kickers', 'Pair of aces, nine-eight kickers']);
  const t = await tableNow(page);
  assert.deepEqual(t.seats.map(x => x.status), ['Pair of aces, nine-eight kickers', 'Pair of aces, king-ten kickers', 'Pair of aces, king-jack kickers · takes the pot']);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /king-jack kickers/);
});

// ----- #3: cheat deals give the others hands that differ -----

s.test('#3 the cheat deal at hold\'em gives the other seats hands that differ from one another (the QA saw two or more alike in 184 of 400 five-seat deals), every one still strictly worse than the player\'s; played with an armed /cheat win and with /cheat cards at five at the table (nobody folds before the flop)', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(() => {
    const C = Game.Cards;
    const out = {};
    for (const n of [3, 4, 5]) {
      let alike = 0;
      let worse = true;
      for (let seed = 1; seed <= 200; seed++) {
        const d = C.holdemStacked(Game.Rng.create(seed * 7 + n), n);
        const mine = C.best(d.holes[0].concat(d.board));
        const others = d.holes.slice(1).map(o => C.best(o.concat(d.board)));
        if (new Set(others.map(o => o.key.join(','))).size < others.length) alike++;
        if (!others.every(o => C.compareKeys(mine.key, o.key) > 0)) worse = false;
        if (new Set(d.holes.flat().concat(d.board)).size !== 2 * n + 5) worse = false;
      }
      out[n] = { alike, worse };
    }
    return out;
  });
  for (const n of [3, 4, 5]) {
    assert.ok(r[n].worse, `${n} at the table: every other hand strictly worse, no card twice`);
    assert.ok(r[n].alike <= 3, `${n} at the table: ${r[n].alike} of 200 deals with two others alike`);
  }
  // Played: an armed /cheat win with four at the table (the QA's seed 11), and /cheat cards with five.
  const page2 = await open(h);
  await quickStart(page2, { seed: 11 });
  await fast(page2);
  const spot = await atTable(page2, 'evening');
  assert.ok(spot.people.length >= 3, 'three card players here');
  await presetCards(page2, { game: 'holdem', seats: spot.people.slice(0, 2).map(x => x.id) });
  await sendText(page2, '/cheat win');
  await sendText(page2, 'I bet $20 at cards');
  let c = (await lastEntry(page2)).cards;
  assert.deepEqual([c.win, c.winners, c.seats.length], ['armed', ['player'], 2]);
  let others = c.seats.concat([c.dealer]).map(x => x.name);
  assert.equal(new Set(others).size, 3, others.join(' / '));
  await presetCards(page2, { game: 'holdem', seats: spot.people.slice(0, 3).map(x => x.id) });
  await sendText(page2, '/cheat cards');
  await page2.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page2, 'I bet $20 at cards');
  c = (await lastEntry(page2)).cards;
  assert.equal(c.seats.length, 3);
  assert.ok(c.seats.concat([c.dealer]).every(x => x.foldedOn !== 0), 'nobody folds before the flop');
  const keys = await page2.evaluate(x => [x.dealer].concat(x.seats).map(o => Game.Cards.best(o.dealt.concat(x.board)).key.join(',')), c);
  assert.equal(new Set(keys).size, 4, keys.join(' / '));
  assert.deepEqual(c.winners, ['player']);
});

// ----- #4: arrivals after a hand -----

s.test('#4 after a hand, whoever came in while the player waited and did not sit in still arrives (the demo: "… arrive."; the narrator\'s packet: "arrived here: …"), and nobody who sat at the table (the seats, the dealer) is told as arriving', async h => {
  const page = await open(h);
  await quickStart(page, { seed: 100 });
  await fast(page);
  await page.evaluate(() => { const G = Game, S = G.State; const l = G.state.locations.find(x => G.Pipeline.cardGameAt(x)); while (G.state.time.phase !== 'morning') S.apply({ advanceTime: 'long' }); while (S.isClosed(l)) S.apply({ setTime: { day: G.state.time.day + 1, phase: 'morning' } }); S.apply({ playerLocationId: l.id }); });
  await sendText(page, 'I wait a while');
  const came = await page.evaluate(() => (Game.state.pendingScene ? Game.state.pendingScene.arrived : []).map(id => ({ id, name: Game.State.npc(id).name })));
  assert.ok(came.length >= 3, came.map(x => x.name).join(', '));
  await presetCards(page, { game: 'holdem', seats: null });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, "deal everyone in, hold'em, $20");
  const e = await lastEntry(page);
  const seated = e.cards.seats.map(x => x.id).concat([e.cards.dealerId]);
  assert.ok(e.cards.seats.length >= 1, 'seats sat in');
  const rest = came.filter(x => !seated.includes(x.id)).map(x => x.name);
  const sat = came.filter(x => seated.includes(x.id)).map(x => x.name);
  assert.ok(rest.length >= 1 && sat.length >= 2, `came in: ${came.map(x => x.name).join(', ')}; sat: ${sat.join(', ')}`);
  const list = rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}`;
  const arriving = (/[^.]*\barrives?\./.exec(e.narration) || [''])[0].trim();
  assert.equal(arriving, `${list} ${rest.length > 1 ? 'arrive' : 'arrives'}.`, e.narration);
  const packet = line(await lastCall(page, 'narrate'), 'SINCE THE LAST TURN');
  assert.match(packet, /arrived here: /);
  const listed = /arrived here: ([^;.]*)/.exec(packet)[1];
  for (const n of rest) assert.ok(listed.includes(n), `${n} listed: ${packet}`);
  for (const n of sat) assert.ok(!listed.includes(n), `${n} sat in: ${packet}`);
  // The packet as it is built for that turn (the live narrator's): the same.
  const live = await page.evaluate(ids => {
    const G = Game;
    const ctx = { input: 'x', action: { actionType: 'gamble', summary: 'bets $20 at cards', targets: [] }, created: [], notPresent: [], due: [], links: [], gamble: { played: true, dealerId: ids[0], seats: ids.slice(1).map(id => ({ id })) } };
    const keep = G.state.pendingScene;
    G.State.apply({ sceneChange: { locationId: G.state.player.locationId, arrived: ids, left: [], before: [], cause: 'turn' } });
    const text = G.Pipeline.narratorPacket(ctx);
    if (!keep) G.State.apply({ sceneChangeDone: true });
    return /^SINCE THE LAST TURN.*$/m.exec(text);
  }, seated);
  assert.equal(live, null, 'only people who sat in arrived: no arrival line at all');
});

// ----- #5: the focus after a press -----

s.test('#5 after a press the keyboard focus goes to the first button of the table\'s new options, in view inside the story (not the head scrolled off above it); the head has the focus only when the table first appears', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: spot.people.slice(0, 3).map(x => x.id) });
  await deal(page, [['7c', '7d'], ['Ah', 'Kd'], ['Qs', 'Qh'], ['Jc', 'Td'], ['9s', '9h']], ['2c', '5d', 'Kh', '3s', '8c'], spot.people.slice(0, 3).map(x => x.id));
  await startHand(page, 'I bet $20 at cards');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'cards-head', 'the head on first appearance');
  let presses = 0;
  while (await page.evaluate(() => Game.Pipeline.handOpen) && presses < 8) {
    await page.focus('#feed .f-cards.open .cards-acts button');
    await page.keyboard.press('Enter');
    presses++;
    await page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
    if (!(await page.evaluate(() => Game.Pipeline.handOpen))) break;
    const f = await page.evaluate(() => {
      const a = document.activeElement;
      const box = document.querySelector('#feed-scroll').getBoundingClientRect();
      const r = a.getBoundingClientRect();
      return { tag: a.tagName, inActs: !!a.closest('#feed .f-cards.open .cards-acts'), first: a === document.querySelector('#feed .f-cards.open .cards-acts button'), disabled: a.disabled, inView: r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 };
    });
    assert.deepEqual(f, { tag: 'BUTTON', inActs: true, first: true, disabled: false, inView: true }, `after press ${presses}`);
  }
  assert.ok(presses >= 2, `several presses: ${presses}`);
  await idle(page);
});

// ----- #6: commands with a hand open -----

s.test('#6 with a hand open /help shows the commands as ever and the hand stays open; /undo (changed by design in wave 16) takes the turn back, free, the line back in the box, at hold\'em, at draw and at the chooser, and once the turn is over as ever; other commands keep the nudge; /cheat win typed is still the Win (cheat) control', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  await presetCards(page, { game: 'holdem', seats: [] });
  await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
  const log0 = await page.evaluate(() => Game.state.log.length);
  await startHand(page, 'I bet $20 at cards');
  const helps = await page.locator('#feed .f-notice.help').count();
  await page.fill('#cmd', '/help');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(n => document.querySelectorAll('#feed .f-notice.help').length > n, helps);
  assert.match(await page.locator('#feed .f-notice.help').last().textContent(), /\/undo/);
  assert.deepEqual(await page.evaluate(() => [Game.Pipeline.handOpen, Game.Pipeline.handKind, document.querySelector('#cmd').value, !!document.querySelector('#feed .f-cards.open')]), [true, 'holdem', '', true], 'the hand stays open, the box is empty');
  await page.fill('#cmd', '/look');
  await page.press('#cmd', 'Enter');
  assert.equal(await statusLine(page), 'Your hand is on the table: Check or Bet. Stop folds the hand (−$4); Win (cheat) ends it yours.');
  // The typed /cheat win is the Win (cheat) control (wave 14).
  await page.fill('#cmd', '/cheat win');
  await page.press('#cmd', 'Enter');
  await idle(page);
  let e = await lastEntry(page);
  assert.deepEqual([e.cards.win, e.cards.winners, await page.inputValue('#cmd')], ['control', ['player'], '']);
  // The turn over, /undo takes it back.
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.log.length), log0);
  assert.match(await lastNotice(page), /^You took back the last turn\./);
  // Wave 16: typed with the hand open, /undo takes the turn back at once, free: at hold'em, at draw and at the chooser.
  for (const [game, words] of [['holdem', 'I bet $20 at cards'], ['draw', 'I bet $20 at cards'], [null, 'deal me in']]) {
    await presetCards(page, { game, seats: [] });
    const g = await gold(page);
    await startHand(page, words);
    await page.fill('#cmd', '/undo');
    await page.press('#cmd', 'Enter');
    await idle(page);
    await page.waitForFunction(() => /hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
    assert.deepEqual([await page.evaluate(() => [Game.Pipeline.handOpen, Game.state.log.length]), await gold(page), await page.inputValue('#cmd')], [[false, log0], g, words], String(game));
    await page.fill('#cmd', '');
  }
  await presetCards(page, { game: null, seats: [] });
  await startHand(page, 'deal me in');
  const helps2 = await page.locator('#feed .f-notice.help').count();
  await page.fill('#cmd', '/commands');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(n => document.querySelectorAll('#feed .f-notice.help').length > n, helps2);
  assert.equal(await page.evaluate(() => Game.Pipeline.handKind), 'choose');
  await page.click('#send');
  await idle(page);
});

// ----- #7: the demo parser's phrases -----

s.test('#7 the demo reads "Mind if I join you for a hand?", "I take a seat at the card table", "I sit at the table", "Deal me into the game" and "Count me in for a hand" as a bet where a dealer sits; "Count me in" and "I\'m in" only with the cards, a hand, the table or the game named, or right after a hand; "I sit in the corner", "I bet he is lying", "Mind if I join you?" and "I sit at the bar" stay other things; none of them is a bet with no dealer there', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  const bets = ['Mind if I join you for a hand?', 'Can I join you for a game of cards?', 'I join the game', 'I take a seat at the card table', 'I take a seat at the table', 'I sit at the table', 'I sit down at the table.', 'Deal me into the game', 'Deal us in', 'Count me in for a hand', 'count me in, deal the cards', "I'm in on the game"];
  const nons = ['I sit in the corner', 'I bet he is lying', 'Mind if I join you?', 'I sit at the bar', 'I take a seat at the bar', "I'm in trouble", "I'm in for a long night", 'Count me in', "I'm in"];
  let r = await parse(page, bets.concat(nons));
  for (const t of bets) assert.equal(r[t], 'gamble', t);
  for (const t of nons) assert.notEqual(r[t], 'gamble', t);
  // Played: the table opens.
  await presetCards(page, { game: 'holdem', seats: [] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = {}; });
  await sendText(page, 'Mind if I join you for a hand?');
  assert.ok((await lastEntry(page)).cards, 'a hand was played');
  // Right after a hand, "Count me in" and "I'm in" are the next one; "I'm in trouble" is still not.
  r = await parse(page, ['Count me in', "I'm in", "I'm in trouble", 'I sit in the corner']);
  assert.deepEqual(r, { 'Count me in': 'gamble', "I'm in": 'gamble', "I'm in trouble": r["I'm in trouble"] === 'gamble' ? 'not' : r["I'm in trouble"], 'I sit in the corner': r['I sit in the corner'] === 'gamble' ? 'not' : r['I sit in the corner'] });
  // No dealer at the table (the morning): none of the new phrases is a bet.
  const nobody = await page.evaluate(() => { const G = Game, S = G.State; const l = G.state.locations.find(x => G.Pipeline.cardGameAt(x)); S.apply({ setTime: { day: G.state.time.day + 1, phase: 'morning' }, playerLocationId: l.id }); return !G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id)); });
  assert.ok(nobody, 'nobody deals in the morning');
  r = await parse(page, ['Mind if I join you for a hand?', 'I take a seat at the card table', 'I sit at the table', 'Deal me into the game', 'Count me in for a hand']);
  for (const [t, type] of Object.entries(r)) assert.notEqual(type, 'gamble', `${t} with no dealer`);
});

// ----- #8: a game named and put down -----

s.test('#8 a game named right before it is put down ("is for", "isn\'t", "is no", "is not", "not for me") is the one being left: "I play texas hold\'em, draw poker is for old men" is hold\'em; otherwise the last game named wins', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const games = await page.evaluate(() => ["I play texas hold'em, draw poker is for old men", 'draw poker is for old men', "Texas hold'em is for tourists. Five card draw.", "hold'em isn't my game, deal draw", 'draw is no fun', "hold'em is not for me", "hold'em, not for me", "draw's for old men, hold'em", "hold'em is for me", "draw isn't bad", "hold'em? no, five card draw", "deal me in at hold'em", 'not draw, hold\'em', "I play draw, then hold'em"].map(Game.Pipeline.gameFrom));
  assert.deepEqual(games, ['holdem', 'holdem', 'draw', 'draw', 'holdem', 'draw', 'draw', 'holdem', 'holdem', 'draw', 'draw', 'holdem', 'holdem', 'holdem']);
  // Played: the QA's line, with draw remembered, deals hold'em.
  await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, "I play texas hold'em, draw poker is for old men");
  const e = await lastEntry(page);
  assert.equal(e.cards.game, 'holdem');
  assert.equal(await page.evaluate(() => Game.state.flags.cardGame), 'holdem');
});

s.run();
