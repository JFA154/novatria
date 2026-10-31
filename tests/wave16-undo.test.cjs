'use strict';
/* Wave 16: undo that reaches back (docs/notes/engine-state.md, ui.md and
   engine-world.md, Wave 16). The owner, mid-hand on a phone: "Let me undo
   multiple times. I was in the middle of a poker game and I can't undo to
   the start of the game." Covered here: /undo with a hand open takes the
   whole turn back, free (the chooser, a draw hand with a marked deck, every
   hold'em street; typed, the Undo link and the ⋯ list's Undo; the cheats
   armed again) (A); the undo stack kept in IndexedDB through a reload, a
   page without IndexedDB playing on as before, a non-owner tab never
   writing it, a new game and a loaded slot starting empty (B); /undo N and
   /undo all, with how many are left (C); /redo, /redo N, emptied by a new
   turn (D); the fold on load after a reload being one step back to before
   the bet; /rewind for turns no snapshot reaches, /cheat cash, and /undo N
   past the stack pointing at /rewind (E).
   Mock mode. Run with: node tests/wave16-undo.test.cjs */
const assert = require('assert/strict');
const { suite, quickStart, sendText, presetCards, stateJson, LAPTOP, PHONE, GAME_URL } = require('./helpers.cjs');

const s = suite('wave16-undo');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const gold = page => page.evaluate(() => Game.state.player.gold);
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? (n.querySelector('.f-notice-text') || n).textContent : null; });
const depth = page => page.evaluate(() => Game.State.undoDepth());
const bgWith = (page, re) => page.evaluate(src => Game.data.BACKGROUNDS.findIndex(b => b.items.some(i => new RegExp(src, 'i').test(i.name))), re);
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
    if (dealer) return { loc: l.id, name: l.name, phase: ph, day: d, dealer: dealer.id, dealerName: dealer.name };
  }
  return null;
}, phase || null);
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
/* The next hold'em hand as given: holes in seat order (the player, then the dealer), the board. */
const deal = (page, holes, board) => page.evaluate(([h, b]) => { Game.Pipeline.hooks.cardsDeal = { holes: h, board: b, seats: [] }; }, [holes, board]);
/* Check or call until the open hold'em hand is on that street (0 pre-flop … 3 the river). */
async function toStreet(page, want) {
  for (let i = 0; i < 12; i++) {
    const t = await page.evaluate(() => (Game.Pipeline.handOpen ? { street: Game.Pipeline.openHand.street, options: Game.Pipeline.openHand.options } : null));
    assert.ok(t, 'the hand is still open');
    if (t.street >= want) return t.street;
    await page.evaluate(act => Game.Pipeline.playHand({ act }), t.options[0]);
    await page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
  }
  throw new Error('never reached street ' + want);
}
/* What a hand left behind once it was taken back. */
const after = (page, c0) => page.evaluate(c => ({
  busy: Game.Pipeline.busy, open: Game.Pipeline.handOpen, box: document.getElementById('cmd').value,
  tables: document.querySelectorAll('#feed .f-cards').length, inputs: document.querySelectorAll('#feed .f-input').length, rolls: document.querySelectorAll('#feed .f-roll').length,
  held: Game.Storage.heldHand(), log: Game.state.log.length, calls: Game.Api.Mock.calls.slice(c).map(x => x.method)
}), c0);
const before = page => page.evaluate(() => ({ tables: document.querySelectorAll('#feed .f-cards').length, inputs: document.querySelectorAll('#feed .f-input').length, rolls: document.querySelectorAll('#feed .f-roll').length, log: Game.state.log.length, calls: Game.Api.Mock.calls.length }));
/* Play n plain turns; the state after each (index 0: before the first). */
async function play(page, n, from) {
  const states = [await stateJson(page)];
  for (let i = 0; i < n; i++) { await sendText(page, `I look at the sign number ${(from || 0) + i + 1}`); states.push(await stateJson(page)); }
  return states;
}
/* The stack written to IndexedDB (the timer's write, then every queued one done). */
async function flushed(page) {
  await page.waitForTimeout(350);
  await page.evaluate(() => Game.Storage.undoIdle());
  return page.evaluate(() => Game.Storage.undoKept().then(r => (r ? { game: r.game, tab: r.tab, turns: r.entries.map(e => e.turn), towns: r.towns.length } : null)));
}
async function reloadContinue(page) {
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => Game.Storage.undoIdle());
}

// ----- A: /undo with a hand open -----

s.test('A: /undo typed at the chooser takes the whole turn back, free: no table, no line in the feed, the line back in the box, nothing stored, the pipeline free, the game as it was; "You took back the last turn; the hand is off the table. N more can be taken back."', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  await atTable(page, 'evening');
  await presetCards(page, { game: null, seats: [] });
  const s0 = await stateJson(page);
  const b = await before(page);
  const d0 = await depth(page);
  await startHand(page, 'deal me in');
  assert.equal(await page.evaluate(() => Game.Pipeline.handKind), 'choose');
  const c1 = await page.evaluate(() => Game.Api.Mock.calls.length);
  await page.fill('#cmd', '/undo');
  await page.press('#cmd', 'Enter');
  await idle(page);
  await page.waitForFunction(() => /hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
  const a = await after(page, c1);
  assert.deepEqual(a, { busy: false, open: false, box: 'deal me in', tables: b.tables, inputs: b.inputs, rolls: b.rolls, held: null, log: b.log, calls: [] });
  assert.equal(await stateJson(page), s0, 'the game as it was before the line');
  assert.equal(await lastNotice(page), `You took back the last turn; the hand is off the table. ${d0} more can be taken back.`);
  assert.equal(await depth(page), d0);
  // The line in the box plays again as before.
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
  assert.equal(await page.evaluate(() => Game.Pipeline.handKind), 'choose');
  await page.click('#send');
  await idle(page);
});

s.test('A: mid draw hand with a marked deck, /undo costs nothing: no fold price, no catch roll, nothing recorded (log, memories, cash), the table and the line gone from the feed, the line back in the box, the stored hand dropped; the same hand is dealt again', async h => {
  const page = await open(h);
  const bg = await bgWith(page, 'marked');
  assert.ok(bg >= 0, 'a background with a marked deck');
  await quickStart(page, { bgIndex: bg });
  await fast(page);
  const spot = await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  const s0 = await stateJson(page);
  const g0 = await gold(page);
  const mem0 = await page.evaluate(id => Game.State.npc(id).memories.length, spot.dealer);
  const b = await before(page);
  await startHand(page, 'I bet $20 at cards');
  assert.equal(await page.evaluate(() => Game.Pipeline.handKind), 'draw');
  const c1 = await page.evaluate(() => Game.Api.Mock.calls.length);
  const dealt = await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards.open .cards-you .card')].map(c => c.dataset.card));
  assert.ok(await page.evaluate(() => !!Game.Storage.heldHand()), 'the hand is stored while open');
  // Hold two cards first: a choice made mid-hand changes nothing.
  await page.click('#feed .f-cards.open .cards-you .card >> nth=0');
  await page.fill('#cmd', '/undo');
  await page.press('#cmd', 'Enter');
  await idle(page);
  await page.waitForFunction(() => /hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
  const a = await after(page, c1);
  assert.deepEqual(a, { busy: false, open: false, box: 'I bet $20 at cards', tables: b.tables, inputs: b.inputs, rolls: b.rolls, held: null, log: b.log, calls: [] });
  assert.equal(await gold(page), g0, 'no fold price');
  assert.equal(await page.evaluate(id => Game.State.npc(id).memories.length, spot.dealer), mem0, 'nothing remembered');
  assert.equal(await stateJson(page), s0);
  assert.equal(await page.locator('#feed .f-cards.void').count(), 0);
  // The same line deals the same hand (cards from the turn's seed).
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards.open .cards-you .card')].map(c => c.dataset.card)), dealt);
  await page.click('.cards-fold');
  await idle(page);
});

s.test('A: on every hold\'em street (pre-flop, flop, turn, river) the turn comes back whole: the bets put in are back, the board and the table gone; typed /undo, the Undo link (shown with the hand open, its name counting the steps) and the ⋯ list\'s Undo all do it', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  await atTable(page, 'evening');
  for (const [street, how] of [[0, 'typed'], [1, 'link'], [2, 'list'], [3, 'typed']]) {
    await presetCards(page, { game: 'holdem', seats: [] });
    await deal(page, [['Ah', 'Ad'], ['Ks', 'Kc']], ['2c', '7d', '9h', '3s', 'Jc']);
    const s0 = await stateJson(page);
    const g0 = await gold(page);
    const b = await before(page);
    const d0 = await depth(page);
    await startHand(page, 'I bet $20 at hold\'em');
    assert.equal(await toStreet(page, street), street);
    const c1 = await page.evaluate(() => Game.Api.Mock.calls.length);
    if (street > 0) assert.ok((await page.evaluate(() => Game.Pipeline.openHand.playerIn)) > 0);
    // The Undo link is there with the hand open, over the bet's line, and says how many steps there are.
    assert.ok(await page.isVisible('#undo-btn'), `street ${street}: the Undo link shows`);
    assert.equal(await page.textContent('#undo-btn'), 'Undo');
    assert.equal(await page.getAttribute('#undo-btn', 'aria-label'), `Undo this turn and its hand, free (${d0 + 1} can be taken back)`);
    if (how === 'typed') { await page.fill('#cmd', '/undo'); await page.press('#cmd', 'Enter'); }
    else if (how === 'link') await page.click('#undo-btn');
    else {
      await page.click('#act-btn');
      assert.equal(await page.isDisabled('#act-pop [data-act="undo"]'), false, 'the list\'s Undo works with a hand open');
      assert.equal(await page.isDisabled('#act-pop [data-act="look"]'), true, 'the rest waits');
      await page.click('#act-pop [data-act="undo"]');
    }
    await idle(page);
    await page.waitForFunction(() => /hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
    const a = await after(page, c1);
    assert.deepEqual(a, { busy: false, open: false, box: 'I bet $20 at hold\'em', tables: b.tables, inputs: b.inputs, rolls: b.rolls, held: null, log: b.log, calls: [] }, `street ${street} (${how})`);
    assert.equal(await gold(page), g0, `street ${street}: the bets are back`);
    assert.equal(await stateJson(page), s0, `street ${street}: the game as it was`);
    assert.equal(await lastNotice(page), `You took back the last turn; the hand is off the table. ${d0} more can be taken back.`);
    await page.fill('#cmd', '');
  }
});

s.test('A: the cheats come back armed: a /cheat cards hand taken back mid-hand arms it again ("The cards cheat is armed again"); /undo 2 with a hand open takes the hand\'s turn and the one before it', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  const s0 = await stateJson(page);
  await sendText(page, 'I look around');
  await sendText(page, '/cheat cards');
  const s2 = await stateJson(page);
  await startHand(page, 'I bet $20 at cards');
  assert.equal(await page.evaluate(() => Game.Pipeline.cheatArmed), false, 'spent by the deal');
  await page.fill('#cmd', '/undo');
  await page.press('#cmd', 'Enter');
  await idle(page);
  await page.waitForFunction(() => /hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
  assert.equal(await page.evaluate(() => Game.Pipeline.cheatArmed), true);
  assert.equal(await stateJson(page), s2);
  assert.equal(await lastNotice(page), 'You took back the last turn; the hand is off the table. The cards cheat is armed again: the next hand is yours. 1 more can be taken back.');
  // Again, two steps: the hand and the look before it. The cheat was armed after the look, so the game before the look
  // has it off, but each step keeps a cheat armed before it (as two /undo would): it stays armed.
  await page.fill('#cmd', '');
  await startHand(page, 'I bet $20 at cards');
  await page.fill('#cmd', '/undo 2');
  await page.press('#cmd', 'Enter');
  await idle(page);
  await page.waitForFunction(() => /2 turns; the hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
  assert.equal(await lastNotice(page), 'You took back 2 turns; the hand is off the table. The cards cheat is armed again: the next hand is yours. Nothing more can be taken back.');
  const st = JSON.parse(await stateJson(page));
  const want = JSON.parse(s0);
  want.flags.cardsCheat = true;
  assert.deepEqual(st, want, 'before the look, with the cheat still armed (armed before, armed after)');
  assert.equal(await page.inputValue('#cmd'), 'I bet $20 at cards');
});

// ----- B: the stack through a reload -----

s.test('B: the undo stack survives a reload: five turns, reload, Continue, /undo 3 is the game after turn 2 byte for byte ("You took back 3 turns. 2 more can be taken back."); the kept record is this game\'s, one town copy, written by this tab', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 5);
  const kept = await flushed(page);
  const me = await page.evaluate(() => ({ game: Game.Storage.gameId(Game.state), tab: Game.Storage.tabId }));
  assert.deepEqual(kept, { game: me.game, tab: me.tab, turns: [0, 1, 2, 3, 4], towns: 1 });
  await reloadContinue(page);
  assert.equal(await depth(page), 5, 'all five steps back');
  assert.match(await page.getAttribute('#undo-btn', 'aria-label'), /\(5 can be taken back\)$/);
  await sendText(page, '/undo 3');
  assert.equal(await stateJson(page), states[2]);
  assert.equal(await lastNotice(page), 'You took back 3 turns. 2 more can be taken back.');
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), states[1]);
  assert.equal(await lastNotice(page), 'You took back the last turn. 1 more can be taken back.');
  // The stack as kept follows: two reloads later it is still these.
  const k2 = await flushed(page);
  assert.deepEqual(k2.turns, [0]);
  await reloadContinue(page);
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), states[0]);
  assert.equal(await lastNotice(page), 'You took back the last turn. Nothing more can be taken back.');
});

s.test('B: without IndexedDB (as in some private windows) nothing is said and undo is this page\'s only, as before: three turns, /undo works; after a reload there is nothing to take back exactly', async h => {
  const page = await open(h);
  await page.context().addInitScript(() => { try { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); }, configurable: true }); } catch (e) { /* fine */ } });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 3);
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), states[2]);
  assert.equal(await lastNotice(page), 'You took back the last turn. 2 more can be taken back.');
  assert.equal(await page.evaluate(() => Game.Storage.undoKept()), null);
  assert.equal(await page.isHidden('#banner'), true, 'no warning');
  await reloadContinue(page);
  assert.equal(await depth(page), 0);
  await sendText(page, '/undo');
  assert.equal(await lastNotice(page), 'There is nothing to undo exactly. /rewind 1 strikes the last turn from the story (money and feelings stay).');
  assert.equal(await page.isHidden('#banner'), true, 'no warning');
});

s.test('B: a tab that is not the owner never writes the stack: tab B continues the game (tab A goes read only), and A\'s stack changes (a step, a hand voided when B took over) leave B\'s record as it is', async h => {
  const a = await open(h);
  await quickStart(a);
  await fast(a);
  await play(a, 2);
  await atTable(a, 'evening');
  await presetCards(a, { game: 'draw', seats: [] });
  await startHand(a, 'I bet $20 at cards');
  await flushed(a);
  const b = await a.context().newPage();
  await b.goto(GAME_URL);
  await b.waitForFunction(() => window.Game && Game.App);
  await fast(b);
  await b.click('#btn-continue');
  await b.waitForSelector('#screen-game.active');
  await b.waitForFunction(() => !!Game.state.log[Game.state.log.length - 1].cards);
  await idle(b);
  await a.waitForFunction(() => Game.Storage.readOnly && !Game.Pipeline.busy);
  const bTab = await b.evaluate(() => Game.Storage.tabId);
  const kb = await flushed(b);
  assert.equal(kb.tab, bTab);
  assert.equal(kb.turns.length, await depth(b));
  // Tab A changes its own stack: nothing written.
  await a.evaluate(() => { Game.State.snapshot(); Game.State.snapshot(); });
  const ka = await flushed(a);
  assert.deepEqual(ka, kb, 'B\'s record as it was');
  // A turn in B is written by B.
  await sendText(b, 'I look at the cards on the table');
  const kb2 = await flushed(b);
  assert.deepEqual([kb2.tab, kb2.turns.length], [bTab, kb.turns.length + 1]);
  // /undo in A is refused (read only).
  await a.evaluate(() => Game.Commands.run('/undo'));
  assert.deepEqual(await flushed(a), kb2);
});

s.test('B: a new game and a loaded slot start with nothing to undo and clear the stack kept for the game before; Continue of that slot\'s game later reads only what was played since', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await play(page, 2);
  await sendText(page, '/save first');
  await play(page, 2, 2);
  assert.equal((await flushed(page)).turns.length, 4);
  assert.ok(await page.evaluate(() => Game.App.loadSlot(1)));
  await page.waitForFunction(() => Game.state.meta.turn === 2);
  assert.equal(await depth(page), 0);
  assert.deepEqual((await flushed(page)).turns, [], 'the kept stack cleared');
  await sendText(page, '/undo');
  assert.equal(await lastNotice(page), 'There is nothing to undo exactly. /rewind 1 strikes the last turn from the story (money and feelings stay).');
  await play(page, 1, 10);
  assert.deepEqual((await flushed(page)).turns, [2]);
  await reloadContinue(page);
  assert.equal(await depth(page), 1);
  // A new game: nothing to undo, nothing kept from the last.
  await quickStart(page, { seed: 777 });
  assert.equal(await depth(page), 0);
  const k = await flushed(page);
  assert.deepEqual([k.game, k.turns], [await page.evaluate(() => Game.Storage.gameId(Game.state)), []]);
});

s.test('B: after a reload with a hand open, the fold on load is one step: /undo goes back to before the bet, byte for byte', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  const s0 = await stateJson(page);
  const g0 = await gold(page);
  await startHand(page, 'I bet $10 at cards');
  await flushed(page);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(() => !!Game.state.log[Game.state.log.length - 1].cards);
  await idle(page);
  await page.evaluate(() => Game.Storage.undoIdle());
  const e = await page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
  assert.deepEqual([e.input, e.cards.result, e.cards.closed, await gold(page) - g0], ['I bet $10 at cards', 'fold', true, -5]);
  assert.equal(await depth(page), 2, 'the look, then the fold on load');
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), s0, 'before the bet');
  assert.equal(await lastNotice(page), 'You took back the last turn. 1 more can be taken back.');
  assert.equal(await page.evaluate(() => Game.Storage.heldHand()), null);
});

// ----- C and D: several steps, /undo all, /redo -----

s.test('C: /undo all takes back everything in the stack ("You took back 4 turns. Nothing more can be taken back."); /help\'s rows and the / list stay short; a count that is no count says how to write one', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 4);
  await sendText(page, '/undo all');
  assert.equal(await stateJson(page), states[0]);
  assert.equal(await lastNotice(page), 'You took back 4 turns. Nothing more can be taken back.');
  assert.equal(await page.isHidden('#undo-row'), true, 'no Undo link with nothing to take back');
  await page.fill('#cmd', '/undo some');
  await page.press('#cmd', 'Enter');
  await idle(page);
  assert.equal(await lastNotice(page), 'Take back how many turns? Try /undo, /undo 3 or /undo all.');
  assert.equal(await page.inputValue('#cmd'), '/undo some');
  const rows = await page.evaluate(() => Game.Commands.helpText().split('\n').filter(l => /^\/(undo|redo|rewind) /.test(l)));
  assert.deepEqual(rows, [
    '/undo [n or all]: Take back the last turn (or n)',
    '/redo [n or all]: Put back a turn you took back',
    '/rewind <n>: Strike the last n turns from the story, for turns /undo cannot reach (money, health, things carried and feelings stay)'
  ]);
});

s.test('D: /redo and /redo 2 put back what /undo took back, in order ("You put back 2 turns. 1 more can be put back."); a new turn empties it ("There is nothing to redo."); a turn refused leaves it', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const states = await play(page, 4);
  await sendText(page, '/undo 3');
  assert.equal(await stateJson(page), states[1]);
  await sendText(page, '/redo 2');
  assert.equal(await stateJson(page), states[3]);
  assert.equal(await lastNotice(page), 'You put back 2 turns. 1 more can be put back.');
  assert.equal(await depth(page), 3);
  // A refused turn changes nothing, so what can be put back stays.
  await page.evaluate(() => Game.Api.Mock.queue('parse', { refusal: { category: 'test', explanation: 'no' } }));
  await sendText(page, 'I do something the parser will not read');
  await page.fill('#cmd', '');
  await sendText(page, '/redo');
  assert.equal(await stateJson(page), states[4]);
  assert.equal(await lastNotice(page), 'You put back 1 turn. Nothing more to put back.');
  await sendText(page, '/undo 2');
  await sendText(page, 'I look at the door');
  await sendText(page, '/redo');
  assert.equal(await lastNotice(page), 'There is nothing to redo.');
});

// ----- E: /rewind, /cheat cash, /undo past the stack -----

s.test('E: /rewind strikes turns no snapshot reaches: eight turns, the stack emptied (an older build\'s save), /rewind 3 leaves turns 0 to 5, the clock as turn 6 found it, no memory, journal note, progression or seen mark of a later turn, someone met then not met; cash as it was and the notice says so; /undo brings all eight back; the next turn plays', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await play(page, 6);
  // Someone met on turn 6 (as the narrator introduces them), and a memory and a note of that turn.
  const met = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const n = st.npcs.find(x => x.alive !== false && !Number.isInteger(x.metTurn) && !x.created);
    S.apply({ npcKnownToPlayer: [n.id], newMemories: [{ npcId: n.id, text: 'met the stranger by the pumps', weight: 2 }], journalEntry: 'Met someone new.' }, { present: [n.id] });
    return { id: n.id, turn: Game.State.npc(n.id).metTurn };
  });
  assert.equal(met.turn, 6);
  await play(page, 2, 6);
  await page.evaluate(() => Game.State.apply({ goldDelta: 37 }));
  // The stack emptied: the game as an older build left it.
  await page.evaluate(() => { const env = Game.Storage.loadAutosave(); Game.State.load(env.state, env.town); Game.UI.rebuildFeed(); });
  assert.equal(await depth(page), 0);
  const full = await stateJson(page);
  const st0 = JSON.parse(full);
  assert.deepEqual(st0.log.map(e => e.turn), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const g0 = st0.player.gold;
  const first = st0.log[6];
  await sendText(page, '/rewind 3');
  const st = JSON.parse(await stateJson(page));
  assert.deepEqual(st.log.map(e => e.turn), [0, 1, 2, 3, 4, 5], 'turns 6 to 8 struck');
  const when = first.from || { day: first.day, phase: first.phase };
  assert.deepEqual([st.time.day, st.time.phase, st.time.shorts], [when.day, when.phase, 0], 'the clock as turn 6 found it');
  const later = x => Number.isInteger(x) && x > 5;
  assert.equal(st.npcs.flatMap(n => n.memories).filter(m => later(m.turn)).length, 0, 'no later memory');
  assert.equal(st.journal.filter(j => later(j.turn)).length, 0, 'no later note');
  assert.equal((st.player.progression || []).filter(x => later(x.turn)).length, 0, 'no later progression');
  assert.equal(Object.values(st.seen || {}).filter(x => later(x.turn)).length, 0, 'no later seen mark');
  assert.equal(st.npcs.find(n => n.id === met.id).metTurn, undefined, 'met on turn 6: not met now');
  assert.equal(st.player.gold, g0, 'cash as it was');
  assert.equal(st.meta.turn, 8, 'the turn count goes on');
  assert.equal(await page.locator('#feed .f-input').count(), 5, 'the story shows five turns');
  assert.equal(await lastNotice(page), `Rewound to turn 5 (Day ${when.day}, ${when.phase}): 3 turns struck from the story. Not taken back: money, health, things carried and how people feel, nor where you are or what you heard. /cheat cash <amount> sets your cash.`);
  // One /undo step: all eight back.
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), full);
  assert.equal(await lastNotice(page), 'You took back the last turn. Nothing more can be taken back.');
  // Again, and the next turn is told and logged after the struck numbers.
  await sendText(page, '/rewind 3');
  await sendText(page, 'I look around the room');
  const e = await page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
  assert.deepEqual([e.turn, e.input, e.narration.length > 0], [9, 'I look around the room', true]);
  assert.deepEqual(await page.evaluate(() => Game.state.log.map(x => x.turn)), [0, 1, 2, 3, 4, 5, 9]);
  // /rewind to a turn, and nothing to rewind.
  await sendText(page, '/rewind to turn 3');
  assert.deepEqual(await page.evaluate(() => Game.state.log.map(x => x.turn)), [0, 1, 2, 3]);
  await sendText(page, '/rewind to turn 3');
  assert.equal(await lastNotice(page), 'Nothing to rewind: that is where the story is.');
});

s.test('E: /cheat cash sets the cash (one /undo step, no log entry, a notice); /undo 10 with 4 steps takes back 4 and says /rewind can strike the rest', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await play(page, 8);
  await page.evaluate(() => { const env = Game.Storage.loadAutosave(); Game.State.load(env.state, env.town); Game.UI.rebuildFeed(); });
  const log0 = await page.evaluate(() => Game.state.log.length);
  await sendText(page, '/cheat cash 25');
  assert.deepEqual([await gold(page), await page.evaluate(() => Game.state.log.length), await lastNotice(page)], [25, log0, 'Cheat: your cash is $25 now.']);
  await sendText(page, '/cheat cash 25');
  assert.equal(await lastNotice(page), 'Your cash is already $25.');
  await page.fill('#cmd', '/cheat cash lots');
  await page.press('#cmd', 'Enter');
  await idle(page);
  assert.equal(await lastNotice(page), 'Set your cash to what? Try /cheat cash 25 (whole dollars, 0 to 1,000,000).');
  await page.fill('#cmd', '');
  await play(page, 3, 8);
  assert.equal(await depth(page), 4, 'the cash and three turns');
  await sendText(page, '/undo 10');
  assert.equal(await lastNotice(page), 'You took back 4 turns. Only 4 turns could be taken back exactly; /rewind 6 strikes earlier turns from the story (money and feelings stay).');
  assert.notEqual(await gold(page), 25, 'the cash cheat taken back too');
  assert.equal(await page.evaluate(() => Game.state.log.length), log0);
  const help = await page.evaluate(() => Game.Commands.helpText().split('\n').find(l => l.startsWith('/cheat')));
  assert.match(help, /set your cash \(cash <amount>\)/);
});

s.test('E: /rewind with a hand open takes the hand\'s turn back first, free, then strikes the turns asked for; Stop still folds a hand (the price) and keeps the turn', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: 0 });
  await fast(page);
  await play(page, 3);
  await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  const g0 = await gold(page);
  await startHand(page, 'I bet $20 at cards');
  await page.fill('#cmd', '/rewind 2');
  await page.press('#cmd', 'Enter');
  await idle(page);
  await page.waitForFunction(() => /^Rewound/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
  assert.match(await lastNotice(page), /^Rewound to turn 1 \(Day \d+, \w+\): 2 turns struck from the story\. The hand is off the table, free\. Not taken back:/);
  assert.deepEqual([await gold(page), await page.evaluate(() => Game.state.log.map(e => e.turn)), await page.inputValue('#cmd')], [g0, [0, 1], 'I bet $20 at cards']);
  // Stop, as before: the hand folds at its price and the turn is kept.
  await page.fill('#cmd', '');
  await atTable(page, 'evening');
  await startHand(page, 'I bet $20 at cards');
  await page.click('#send');
  await idle(page);
  const e = await page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
  assert.deepEqual([e.cards.result, e.cards.delta], ['fold', -10]);
});

s.test('phone: the Undo link shows with a hand open and takes it back; the focus is never dropped', async h => {
  const page = await open(h, PHONE);
  await quickStart(page);
  await fast(page);
  await sendText(page, 'I look around');
  await atTable(page, 'evening');
  await presetCards(page, { game: 'draw', seats: [] });
  const s0 = await stateJson(page);
  await startHand(page, 'I bet $20 at cards');
  assert.ok(await page.isVisible('#undo-btn'));
  await page.click('#undo-btn');
  await idle(page);
  await page.waitForFunction(() => /hand is off the table/.test(([...document.querySelectorAll('#feed .f-notice')].pop() || {}).textContent || ''));
  assert.equal(await stateJson(page), s0);
  assert.equal(await page.inputValue('#cmd'), 'I bet $20 at cards');
  assert.notEqual(await page.evaluate(() => document.activeElement && document.activeElement.tagName), 'BODY');
});

s.run();
