'use strict';
/* Wave 11: what QA found at the card table (wave 10's five-card draw).
   H1 the title screen with a hand open; H2 a bet said in Say mode; M1 the
   hand is final once it is dealt (Stop folds it; a narrator that fails or
   is stopped after the showdown leaves it told plainly); M2 the cash in
   the top bar and the Character panel at the showdown; M3 no read over a
   marked deck's face-up cards; M4 thrown out, the dealer's due events
   wait; M5 stakes in words, the cap said; M6 the split pot's OUTCOME; M7
   the focus on the table's head and a ring that is not the Hold edge;
   L1-L12 and S1-S4 (docs/notes/ui.md and docs/notes/engine-world.md, Wave
   11). Mock mode. Run with: node tests/run.cjs wave11 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');

const s = suite('wave11-cards');
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
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
    if (dealer) {
      const other = S.npcsAt(l.id).find(n => n.id !== dealer.id);
      return { loc: l.id, name: l.name, dealer: dealer.id, dealerName: dealer.name, first: dealer.name.split(' ')[0], other: other ? { id: other.id, name: other.name } : null };
    }
  }
  return null;
});
async function startHand(page, words) {
  await page.fill('#cmd', words);
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open');
}
/* A Say line, not awaited (a hand waits for the player). */
const sayLine = (page, words, to) => page.evaluate(([w, t]) => { window.__said = Game.Pipeline.submit(w, { mode: 'say', to: t }); }, [words, to]);
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.querySelector('.f-notice-text').textContent : null; });
const tables = page => page.locator('#feed .f-cards').count();
/* A hand dealt as given (Pipeline.hooks.cardsDeal), so a split pot or a draw is certain. */
const SPLIT = { player: ['As', 'Kd', '9h', '7s', '4c'], dealer: ['Ah', 'Kc', '9d', '7c', '4d'], dealerPile: ['9c', '7h', '4h', '2c', '2d'], playerPile: ['3c', '3d', '3h', '5c', '5d'] };
const setDeal = (page, deal) => page.evaluate(d => { Game.Pipeline.hooks.cardsDeal = d; }, deal);
// WCAG relative luminance and contrast of two CSS colours (rgb(...)).
const contrast = (a, b) => {
  const lum = c => { const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// ----- H1: the title screen -----

s.test('H1: with a hand open the phone menu\'s Title screen (and Settings\' Quit) refuses with a notice and changes nothing; once the hand is played the title works; a slow turn on the title screen gives Continue, New game and Load back when it ends', async h => {
  const page = await open(h, { width: 390, height: 844 }, { contextOptions: { reducedMotion: 'reduce', isMobile: true, hasTouch: true } });
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await startHand(page, 'I bet $20 at cards');
  await page.locator('#tb-menu').tap();
  await page.locator('#menu-pop [data-menu="title"]').tap();
  let r = await page.evaluate(() => ({ screen: Game.UI.screen, open: Game.Pipeline.handOpen, busy: Game.Pipeline.busy, inGame: Game.App.inGame() }));
  assert.deepEqual(r, { screen: 'game', open: true, busy: true, inGame: true }, 'nothing changes');
  assert.equal(await lastNotice(page), 'Finish the hand first: Draw or Fold (Stop folds).');
  await page.evaluate(() => Game.UI.showScreen('settings'));
  await page.locator('#settings-quit').tap();
  r = await page.evaluate(() => ({ screen: Game.UI.screen, open: Game.Pipeline.handOpen }));
  assert.deepEqual(r, { screen: 'game', open: true }, 'Settings\' Quit brings the table back instead');
  assert.equal(await page.locator('#feed .f-notice', { hasText: 'Finish the hand first' }).count(), 2);
  await page.locator('.cards-draw').tap();
  await idle(page);
  assert.equal(await page.evaluate(() => Game.App.quitToTitle()), true);
  assert.equal(await page.evaluate(() => [Game.UI.screen, document.querySelector('#btn-continue').disabled].join()), 'title,false');
  // A slow turn (not a hand): the title screen may be shown; Continue comes back when it ends.
  await page.locator('#btn-continue').tap();
  await page.waitForSelector('#screen-game.active');
  const t0 = await page.evaluate(() => Game.state.meta.turn);
  await page.evaluate(() => { Game.Api.Mock.queue('narrate', { delay: 800 }); window.__t = Game.Pipeline.submit('I look around the room'); });
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  assert.equal(await page.evaluate(() => Game.App.quitToTitle()), true);
  assert.deepEqual(await page.evaluate(() => ['#btn-continue', '#btn-new', '#btn-load'].map(x => document.querySelector(x).disabled)), [true, true, true], 'off while the turn runs');
  await idle(page);
  const after = await page.evaluate(() => ({ off: ['#btn-continue', '#btn-new', '#btn-load'].map(x => document.querySelector(x).disabled), sub: document.querySelector('#continue-sub').textContent, turn: Game.Storage.loadAutosave().state.meta.turn }));
  assert.deepEqual(after.off, [false, false, false], 'Continue, New game and Load come back');
  assert.equal(after.turn, t0 + 1);
  await page.locator('#btn-continue').tap();
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => Game.state.log[Game.state.log.length - 1].input), 'I look around the room');
});

// ----- H2: Say mode -----

s.test('H2: a bet said in Say mode deals: "Deal me in" to the dealer and "I\'m in for $50" to everyone open the table; words that bet win over a talk parse; said to someone else, or where there is no game, there is no table', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  assert.ok(spot && spot.other, 'the dealer and someone else at the table');
  await sayLine(page, 'Deal me in', spot.dealer);
  await page.waitForSelector('#feed .f-cards.open');
  assert.match(await page.textContent('#feed .f-cards .cards-head'), /stake \$20 · pot \$40$/);
  await page.evaluate(() => Game.Pipeline.playHand({ fold: true }));
  await idle(page);
  let e = await lastEntry(page);
  assert.deepEqual([e.mode, e.to, e.cards.result, e.cards.stake], ['say', spot.dealer, 'fold', 20]);
  assert.match(e.narration, /you fold your .* and give up \$10\./, 'the demo tells the hand, not a reply');
  await sayLine(page, "I'm in for $50", 'everyone');
  await page.waitForSelector('#feed .f-cards.open');
  await page.evaluate(() => Game.Pipeline.playHand({ fold: true }));
  await idle(page);
  e = await lastEntry(page);
  assert.deepEqual([e.to, e.cards.stake, e.cards.delta], ['everyone', 50, -25]);
  // The parser read talk; the words bet: a bet all the same.
  await page.evaluate(() => Game.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Asks to ante up', targets: [], needsRoll: false, timeCost: 'instant' }));
  await sayLine(page, 'Ante up.', spot.dealer);
  await page.waitForSelector('#feed .f-cards.open');
  await page.evaluate(() => Game.Pipeline.playHand({ fold: true }));
  await idle(page);
  assert.equal((await lastEntry(page)).cards.result, 'fold');
  assert.ok(await page.evaluate(() => Game.State.debugLog.some(d => /became gamble/.test(d.reason || ''))), 'logged as changed');
  // Said to someone else: no table, the no-game line.
  const n0 = await tables(page);
  await sayLine(page, 'Deal me in', spot.other.id);
  await idle(page);
  assert.equal(await tables(page), n0, 'no table');
  assert.equal(line(await lastCall(page, 'narrate'), 'CARD GAME'), `CARD GAME: no game: the player said it to ${spot.other.name}, and ${spot.dealerName} is the one who deals. No money changes hands.`);
  assert.match((await lastEntry(page)).narration, new RegExp(`It's ${spot.dealerName} who deals, and you said it to ${spot.other.name}\\.`));
  // Where there is no game, the words are talk.
  await page.evaluate(() => { const G = Game; const l = G.state.locations.find(x => !G.Pipeline.cardGameAt(x) && x.discovered && !x.closed && !x.away && G.State.npcsAt(x.id).length); G.State.apply({ playerLocationId: l.id }); });
  const someone = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[0].id);
  await sayLine(page, 'Deal me in', someone);
  await idle(page);
  assert.equal(await page.evaluate(() => Game.Pipeline.lastTurn.action.actionType), 'talk');
  assert.equal(line(await lastCall(page, 'narrate'), 'CARD GAME'), '');
});

// ----- M1: the hand is final once it is dealt -----

s.test('M1: Stop with a hand open folds it at the fold price and keeps the turn (told plainly, no narrator, no bookkeeper); with a marked deck the catch roll is made; the table\'s hint says so', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await startHand(page, 'I bet $30 at cards');
  assert.equal(await page.textContent('#feed .f-cards .cards-hint'), 'Pick the cards to hold, then Draw: the rest are replaced. Stop folds the hand (−$15).');
  const calls = await page.evaluate(() => Game.Api.Mock.calls.length);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(14));
  await page.click('#send');
  await idle(page);
  const e = await lastEntry(page);
  const r = await page.evaluate(c => ({ gold: Game.state.player.gold, calls: Game.Api.Mock.calls.slice(c).map(x => x.method), rolls: [...document.querySelectorAll('#feed .f-roll')].map(x => x.textContent), narr: [...document.querySelectorAll('#feed .f-narr')].pop().textContent }), calls);
  assert.deepEqual([e.cards.result, e.cards.folded, e.cards.stopped, e.cards.delta, r.gold - g0], ['fold', true, true, -15, -15]);
  assert.ok(e.roll && e.roll.d20 === 14, 'the catch roll was made');
  assert.equal(r.rolls.length, 1);
  assert.match(r.rolls[0], new RegExp(`^Does ${spot.first} spot the marks\\? Wits 14 \\+ \\d+ = \\d+ vs 12 · `));
  assert.deepEqual(r.calls, [], 'no narrator and no bookkeeper');
  assert.equal(e.narration, `You fold your ${lowerFirst(e.cards.player.name)}, get up from the table and give up $15. ${spot.dealerName} never spots the marks.`);
  assert.equal(r.narr, e.narration, 'told plainly (no demo tag)');
  assert.equal(await lastNotice(page), 'Stopped: a hand on the table is folded, and the ante is gone.');
  assert.equal(await page.textContent('#feed .f-cards:last-of-type .cards-result'), `Stopped, so you fold: −$15 · cash $${r.gold}`);
  // Played again with the same words on a new turn: a new hand, not the one taken back.
  assert.equal(await page.inputValue('#cmd'), '');
});

s.test('M1: after the showdown the hand is final: a narrator error, a Stop while "Writing…" or a refusal commits the turn with the engine\'s line (the money stays, no Try again); the bookkeeper\'s failure path is as before', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  // A narrator error.
  let g0 = await page.evaluate(() => Game.state.player.gold);
  await setDeal(page, { player: ['Kc', 'Kd', '7h', '7s', '2c'], dealer: ['Ac', 'Ad', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] });
  await page.evaluate(() => { Game.Api.Mock.queue('narrate', { error: { type: 'network' } }); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $50 at cards');
  let e = await lastEntry(page);
  assert.equal(e.narration, `The hand is played: your two pair, kings and sevens, beats ${spot.dealerName}'s pair of aces. You win $50.`);
  assert.deepEqual([e.cards.result, e.cards.delta, await page.evaluate(() => Game.state.player.gold) - g0], ['win', 50, 50], 'the money stays');
  const notice = await page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return { text: n.textContent, retry: !!n.querySelector('[data-retry]') }; });
  assert.match(notice.text, /The hand stands as it was played, told plainly above\.$/);
  assert.equal(notice.retry, false, 'no Try again that would deal again');
  assert.equal(await page.inputValue('#cmd'), '');
  assert.equal(await tables(page), 1, 'the table stays');
  // Stop while "Writing…".
  g0 = await page.evaluate(() => Game.state.player.gold);
  await page.evaluate(() => { Game.Api.Mock.queue('narrate', { delay: 3000 }); Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await page.fill('#cmd', 'I bet $20 at cards');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => document.querySelector('#turn-status-text').textContent === 'Writing…');
  await page.click('#send');
  await idle(page);
  e = await lastEntry(page);
  assert.deepEqual([e.cards.result, await page.evaluate(() => Game.state.player.gold) - g0], ['fold', -10]);
  assert.equal(e.narration, `You fold your ${lowerFirst(e.cards.player.name)}${e.cards.player.name.includes(',') ? ',' : ''} and give up $10.`);
  assert.equal(await lastNotice(page), 'Stopped. The hand stands as it was played, told plainly above.');
  // A refusal.
  await page.evaluate(() => { Game.Api.Mock.queue('narrate', { refusal: true }); Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $20 at cards');
  assert.match((await lastEntry(page)).narration, /^You fold your /);
  assert.equal(await lastNotice(page), 'The narrator declined to tell that hand. It stands as it was played, told plainly above.');
  // The bookkeeper failing: the narration stands, as before.
  await page.evaluate(() => { Game.Api.Mock.queue('bookkeep', { error: { type: 'network' } }); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  e = await lastEntry(page);
  assert.ok(await page.locator('#feed .f-quiet', { hasText: 'could not be recorded yet' }).count() >= 1, 'the bookkeeper\'s quiet line');
  assert.ok(e.cards && /At .*table/.test(e.narration), 'the demo\'s narration stands');
});

s.test('M1: a reload never takes a hand back: closed with the hand open, Continue folds it (the fold price, told plainly); closed after the showdown while the story is written, Continue keeps the hand as it was played', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await startHand(page, 'I bet $40 at cards');
  const dealt = await page.evaluate(() => [...document.querySelectorAll('#feed .f-cards .cards-you .card')].map(c => c.dataset.card));
  assert.ok(await page.evaluate(() => !!Game.Storage.heldHand()), 'the hand is on record while it is open');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(() => Game.state.log[Game.state.log.length - 1].cards);
  await idle(page);
  let e = await lastEntry(page);
  assert.deepEqual([e.input, e.cards.result, e.cards.stopped, e.cards.player.dealt, await page.evaluate(() => Game.state.player.gold) - g0], ['I bet $40 at cards', 'fold', true, dealt, -20]);
  assert.match(e.narration, /^You fold your .*, get up from the table and give up \$20\.$/);
  assert.equal(await lastNotice(page), 'The game was closed with a hand on the table, so the hand is folded and the ante is gone.');
  assert.equal(await page.evaluate(() => Game.Storage.heldHand()), null, 'used up');
  // Closed after the showdown, while the story was being written.
  const g1 = await page.evaluate(() => Game.state.player.gold);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 5000 }));
  await startHand(page, 'I bet $30 at cards');
  for (const i of [0, 1, 2, 3, 4]) await page.click(`.cards-you button.card[data-i="${i}"]`);
  await page.click('.cards-draw');
  await page.waitForFunction(() => document.querySelector('#turn-status-text').textContent === 'Writing…');
  const played = await page.evaluate(() => Game.Storage.heldHand().cards);
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(() => Game.state.log[Game.state.log.length - 1].cards && Game.state.log[Game.state.log.length - 1].input === 'I bet $30 at cards');
  await idle(page);
  e = await lastEntry(page);
  assert.deepEqual([e.cards.result, e.cards.player.final, e.cards.dealer.final, await page.evaluate(() => Game.state.player.gold) - g1], [played.result, played.player.final, played.dealer.final, played.delta]);
  assert.match(e.narration, /^The hand is played: your /);
  assert.equal(await lastNotice(page), 'The game was closed after this hand was played. It stands as it was played, told plainly above.');
  // A turn that ends leaves nothing on record.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $10 at cards');
  assert.equal(await page.evaluate(() => Game.Storage.heldHand()), null);
});

// ----- M2: the cash at the showdown -----

s.test('M2: the top bar and the Character panel show the cash the table shows as soon as the hand is played, while the narration is still being written', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await page.evaluate(() => Game.UI.openPanel('character'));
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await setDeal(page, { player: ['Kc', 'Kd', '7h', '7s', '2c'], dealer: ['Ac', 'Qd', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] });
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 1500 }));
  await startHand(page, 'I bet $40 at cards');
  assert.equal(await page.textContent('#tb-gold'), `$${g0}`);
  for (const i of [0, 1, 2, 3, 4]) await page.click(`.cards-you button.card[data-i="${i}"]`);
  assert.equal(await page.textContent('.cards-draw'), 'Stand pat');
  await page.click('.cards-draw');
  await page.waitForSelector('#feed .f-cards:not(.open)');
  const mid = await page.evaluate(() => ({ busy: Game.Pipeline.busy, bar: document.querySelector('#tb-gold').textContent, sheet: document.querySelector('.char-cash').textContent, gold: Game.state.player.gold, result: document.querySelector('.cards-result').textContent }));
  assert.equal(mid.busy, true, 'the narration is still being written');
  assert.equal(mid.gold, g0 + 40);
  assert.deepEqual([mid.bar, mid.sheet], [`$${g0 + 40}`, `$${g0 + 40}`]);
  assert.match(mid.result, new RegExp(`cash \\$${g0 + 40}$`));
  await idle(page);
});

// ----- M3: the read and the marked deck -----

s.test('M3: with a marked deck the read is not shown (the dealer\'s cards are face up), open or finished; without one it is, and says after the showdown whether it was right (S2)', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  await atTable(page);
  await startHand(page, 'I bet $20 at cards');
  assert.equal(await page.locator('#feed .f-cards .cards-read').count(), 0);
  assert.equal(await page.locator('#feed .f-cards .cards-dealer .card.back').count(), 0);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(12));
  await page.click('.cards-draw');
  await idle(page);
  assert.equal(await page.locator('#feed .f-cards .cards-read').count(), 0, 'not after the showdown either');
  // No marked deck: the read, then the verdict.
  const p2 = await open(h);
  await quickStart(p2);
  await fast(p2);
  await atTable(p2);
  await startHand(p2, 'I bet $20 at cards');
  assert.match(await p2.textContent('#feed .f-cards .cards-read'), /^Your read: \S+ (has something|is bluffing)\.$/);
  await p2.click('.cards-draw');
  await idle(p2);
  const e = await lastEntry(p2);
  assert.equal(await p2.textContent('#feed .f-cards .cards-verdict'), e.cards.read.right ? ' You were right.' : ' You were wrong.');
});

// ----- M4: thrown out, the dealer's due events wait -----

s.test('M4: caught and thrown out, the hustler\'s invitation from the dealer stays due (not told, not marked done) and waits while he will not deal; an event at the place waits too; after the week it is told', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  await sendText(page, 'I look around');
  const due0 = await page.evaluate(d => Game.state.dueEvents.filter(e => e.npcId === d).map(e => e.seedId), spot.dealer);
  assert.equal(due0.length, 1, 'the invitation is due');
  // An event at the place, due now.
  await page.evaluate(l => {
    const S = Game.State;
    S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_test_lowwater', cause: 'test', effect: 'A fight breaks out by the pool table.', trigger: { type: 'location', value: l }, fired: false, hidden: true } }] });
    S.apply({ seedsFired: ['seed_test_lowwater'], dueAdd: [{ seedId: 'seed_test_lowwater', text: 'A fight breaks out by the pool table.' }] });
  }, spot.loc);
  await page.evaluate(() => { Game.Pipeline.forceNextRoll(1); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  const r = await page.evaluate(() => ({ due: Game.state.dueEvents.map(e => e.seedId), here: Game.state.player.locationId, pk: (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text }));
  assert.equal((await lastEntry(page)).cards.result, 'caught');
  assert.ok(r.due.includes(due0[0]) && r.due.includes('seed_test_lowwater'), 'both still due');
  assert.doesNotMatch(r.pk, /invites|fight breaks out/);
  assert.notEqual(r.here, spot.loc, 'out on the street');
  // The next turn, on the street: he does not come to invite them.
  await sendText(page, 'I look around');
  assert.ok(await page.evaluate(id => Game.state.dueEvents.some(e => e.seedId === id), due0[0]), 'still waiting');
  assert.doesNotMatch((await lastEntry(page)).narration, /invites/);
  // A week on, it is told.
  await page.evaluate(() => { const st = Game.state; Game.State.apply({ setTime: { day: st.time.day + 7, phase: 'evening' } }); });
  await sendText(page, 'I look around');
  assert.ok(!(await page.evaluate(id => Game.state.dueEvents.some(e => e.seedId === id), due0[0])), 'told and done');
});

// ----- M5: stakes -----

s.test('M5: the stake from the words: dollars and words, everything and all in, $0 and -$5 the usual $20, $2.50 is $2, never more than the cash; a capped or defaulted stake is said in the heading and the OUTCOME line', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(() => ['I put $500 in', 'I bet fifty dollars', 'a hundred bucks on this hand', 'everything I have', 'I go all in', 'I bet $0', 'I bet -$5', 'I bet $2.50', 'I raise 20', "I'm in for fifty", 'deal me in', 'I bet a hand', 'I put 30 in', 'two hundred and fifty dollars', '$1,000']
    .map(t => [t, Game.Pipeline.stakeFor(t, 140)]));
  const want = { 'I put $500 in': [140, 'all'], 'I bet fifty dollars': [50, null], 'a hundred bucks on this hand': [100, null], 'everything I have': [140, 'all'], 'I go all in': [140, 'all'], 'I bet $0': [20, 'usual'], 'I bet -$5': [20, 'usual'], 'I bet $2.50': [2, null], 'I raise 20': [20, null], "I'm in for fifty": [50, null], 'deal me in': [20, null], 'I bet a hand': [20, null], 'I put 30 in': [30, null], 'two hundred and fifty dollars': [140, 'all'], '$1,000': [140, 'all'] };
  for (const [t, got] of r) assert.deepEqual([got.stake, got.note], want[t], t);
  const spot = await atTable(page);
  const g = await page.evaluate(() => Game.state.player.gold);
  await startHand(page, `I put $${g + 360} in`);
  assert.equal(await page.textContent('#feed .f-cards .cards-head'), `${spot.dealerName}'s table · stake $${g}, all you have · pot $${g * 2}`);
  await page.click('.cards-fold');
  await idle(page);
  const half = Math.ceil(g / 2);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`^OUTCOME: the card game \\(the player put up \\$${g}, all they have; they named \\$${g + 360}\\): `));
  assert.equal((await lastEntry(page)).cards.delta, -half);
  await startHand(page, 'I bet -$5');
  assert.equal(await page.textContent('#feed .f-cards:last-of-type .cards-head'), `${spot.dealerName}'s table · stake $20, the usual · pot $40`);
  await page.click('.cards-fold');
  await idle(page);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /^OUTCOME: the card game \(the player put up \$20, the usual stake: −\$5 is no stake\): /);
  await startHand(page, 'I bet fifty dollars');
  assert.match(await page.textContent('#feed .f-cards:last-of-type .cards-head'), /· stake \$50 · pot \$100$/);
  await page.click('.cards-fold');
  await idle(page);
});

// ----- M6: a split pot -----

s.test('M6: a split pot\'s OUTCOME says no money changes hands and not that it already has; a fold of $1 costs $1 (L4)', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await setDeal(page, SPLIT);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  const e = await lastEntry(page);
  assert.deepEqual([e.cards.result, e.cards.delta, await page.evaluate(() => Game.state.player.gold) - g0], ['split', 0, 0]);
  const out = line(await lastCall(page, 'narrate'), 'OUTCOME: ');
  assert.match(out, /a split pot, and no money changes hands \(cash still \$\d+\)\. The table was shown/);
  assert.doesNotMatch(out, /already changed hands/);
  assert.equal(await page.textContent('#feed .f-cards .cards-result'), `Split pot · cash $${g0}`);
  // L4: a $1 fold costs $1, and its OUTCOME says the money moved.
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $1 at cards');
  assert.equal((await lastEntry(page)).cards.delta, -1);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /the player folds their .* and gives up half the stake: the player loses \$1 \(cash now \$\d+\)\. The money has already changed hands\./);
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .cards-result')].pop().textContent), /^You fold: −\$1 · /);
  assert.deepEqual(await page.evaluate(() => [1, 2, 20, 25, 50, 51].map(Game.Pipeline.foldPrice)), [1, 1, 10, 13, 25, 26]);
});

// ----- M7: focus -----

s.test('M7: sent with Enter (laptop and phone) the table\'s head takes the focus, not a card; the keyboard\'s ring on a card is 3:1 or more against the Hold edge in both themes', async h => {
  for (const [viewport, scheme, mobile] of [[LAPTOP, 'dark', false], [{ width: 390, height: 844 }, 'light', true]]) {
    const page = await open(h, viewport, { colorScheme: scheme, contextOptions: Object.assign({ reducedMotion: 'reduce' }, mobile ? { isMobile: true, hasTouch: true } : {}) });
    await quickStart(page);
    await fast(page);
    await atTable(page);
    await startHand(page, 'I bet $20 at cards');
    const f = await page.evaluate(() => ({ cls: document.activeElement.className, tab: document.activeElement.getAttribute('tabindex'), id: document.activeElement.id, named: document.querySelector('#feed .f-cards').getAttribute('aria-labelledby') }));
    assert.deepEqual([f.cls, f.tab, f.id], ['cards-head', '-1', f.named], `${scheme}: the head`);
    // Tab to the first card, hold it, and read the ring against the Hold edge.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.i), '0');
    await page.keyboard.press('Space');
    const c = await page.evaluate(() => {
      const b = document.activeElement;
      const cs = getComputedStyle(b);
      return { held: b.dataset.held, ring: cs.outlineColor, width: parseFloat(cs.outlineWidth), style: cs.outlineStyle, edge: cs.borderTopColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() };
    });
    assert.equal(c.held, 'true');
    assert.ok(c.style === 'solid' && c.width >= 2, JSON.stringify(c));
    assert.ok(contrast(c.ring, c.edge) >= 3, `${scheme}: ring ${c.ring} against the Hold edge ${c.edge}: ${contrast(c.ring, c.edge).toFixed(2)}`);
    await page.click('.cards-fold');
    await idle(page);
  }
});

// ----- L1: the demo's parser -----

s.test('L1: the demo\'s parser reads another hand, deal again, one more hand, deal me another, I play a hand, let\'s play, I sit down at the card table, I raise $20, I go all in and I\'m in for $50 as a bet; I raise my glass is not one', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  const r = await page.evaluate(async () => {
    const out = {};
    for (const t of ['another hand', 'Deal again.', 'one more hand', 'deal me another', 'I play a hand', "let's play", 'I sit down at the card table', 'I raise $20', 'I go all in', "I'm in for $50", 'Ante up', 'Deal me in', 'I raise my glass', 'I order a beer']) {
      out[t] = (await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' }))).actionType;
    }
    return out;
  });
  for (const [t, type] of Object.entries(r)) assert.equal(type, /glass|beer/.test(t) ? (type === 'gamble' ? 'not gamble' : type) : 'gamble', `${t}: ${type}`);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'another hand');
  assert.equal((await lastEntry(page)).cards.result, 'fold', 'a table was dealt');
});

// ----- L2: /cheat cards in the game -----

s.test('L2: /cheat cards is armed in the game: a second one says it is armed already; it survives a reload; an /undo of the hand it won arms it again, and the hand dealt again is the same', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await sendText(page, '/cheat cards');
  assert.equal(await lastNotice(page), 'Cheat armed: the next hand is yours.');
  await sendText(page, '/cheat cards');
  assert.equal(await lastNotice(page), 'Already armed: the next hand is yours.');
  assert.equal(await page.evaluate(() => Game.Storage.loadAutosave().state.flags.cardsCheat), true, 'saved');
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await fast(page);
  assert.equal(await page.evaluate(() => Game.state.flags.cardsCheat), true, 'armed after a reload');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: [] }; });
  await sendText(page, 'I bet $30 at cards');
  const won = await lastEntry(page);
  assert.deepEqual([won.cards.cheat, won.cards.result, await page.evaluate(() => Game.state.flags.cardsCheat)], [true, 'win', undefined]);
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.flags.cardsCheat), true, 'armed again');
  assert.equal(await lastNotice(page), 'You took back the last turn. The cards cheat is armed again: the next hand is yours.');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: [] }; });
  await sendText(page, 'I bet $30 at cards');
  const again = await lastEntry(page);
  assert.deepEqual([again.cards.cheat, again.cards.player.dealt, again.cards.result], [true, won.cards.player.dealt, 'win'], 'the same hand');
  // Armed, then a turn taken back: still armed.
  await sendText(page, '/cheat cards');
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.state.flags.cardsCheat), true, 'an armed cheat survives /undo of another turn');
  // The model may not arm it.
  const r = await page.evaluate(() => Game.State.apply({ cardsCheat: true }, { source: 'model' }).rejected.map(x => x.path));
  assert.deepEqual(r, ['cardsCheat']);
});

// ----- L3: the table in view -----

s.test('L3: on a short phone at Large text the table opens with its head at the top of the story; where it fits, all of it is in view', async h => {
  for (const [viewport, size, fits] of [[{ width: 320, height: 568 }, 'L', false], [{ width: 390, height: 844 }, 'S', true]]) {
    const page = await open(h, viewport, { contextOptions: { reducedMotion: 'reduce', isMobile: true, hasTouch: true } });
    await quickStart(page);
    await page.evaluate(sz => { Game.Storage.saveSettings({ textSize: sz }); Game.UI.applyDisplay(); }, size);
    await fast(page);
    await atTable(page);
    for (let i = 0; i < 3; i++) await sendText(page, 'I look around');
    await startHand(page, 'I bet $20 at cards');
    const g = await page.evaluate(() => {
      const f = document.querySelector('#feed-scroll') || document.querySelector('#feed').parentElement;
      const box = f.getBoundingClientRect();
      const t = document.querySelector('#feed .f-cards').getBoundingClientRect();
      const head = document.querySelector('#feed .f-cards .cards-head').getBoundingClientRect();
      return { fits: t.height <= f.clientHeight, headTop: head.top - box.top, top: t.top - box.top, bottom: box.bottom - t.bottom, h: f.clientHeight };
    });
    assert.equal(g.fits, fits, JSON.stringify(g));
    if (!fits) assert.ok(g.headTop >= 0 && g.headTop <= 24, `the head at the top: ${JSON.stringify(g)}`);
    else assert.ok(g.top >= 0 && g.bottom >= -1, `all in view: ${JSON.stringify(g)}`);
    await page.click('.cards-fold');
    await idle(page);
  }
});

// ----- L5: /reroll and /cheat after a hand -----

s.test('L5: /cheat fumble after a marked-deck hand replays it from its record (the same cards and holds, no table to play) and redoes only the catch roll; /reroll after a hand with no marked deck says the cards were dealt', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await page.evaluate(() => { Game.Pipeline.forceNextRoll(15); Game.Pipeline.hooks.cardsPlay = { hold: [0, 2] }; });
  await sendText(page, 'I bet $20 at cards');
  const first = await lastEntry(page);
  const opened = await page.evaluate(() => { window.__opened = 0; new MutationObserver(() => { if (document.querySelector('#feed .f-cards.open')) window.__opened++; }).observe(document.querySelector('#feed'), { childList: true, subtree: true, attributes: true }); return true; });
  assert.ok(opened);
  await sendText(page, '/cheat fumble');
  const again = await lastEntry(page);
  const r = await page.evaluate(() => ({ opened: window.__opened, open: Game.Pipeline.handOpen, gold: Game.state.player.gold, tables: document.querySelectorAll('#feed .f-cards').length, here: Game.state.player.locationId }));
  assert.equal(r.opened, 0, 'no table opened to play');
  assert.deepEqual([again.cards.player.dealt, again.cards.player.held, again.cards.player.final, again.cards.dealer.final], [first.cards.player.dealt, first.cards.player.held, first.cards.player.final, first.cards.dealer.final], 'the same hand');
  assert.equal(again.roll.tier, 'critical_failure');
  assert.equal(again.cards.result, 'caught');
  assert.equal(r.tables, 1);
  assert.notEqual(r.here, spot.loc, 'thrown out');
  assert.equal(r.gold, g0 - 20, 'caught: the stake is lost');
  assert.match(await page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent).join('|')), /Cheat: fumble/);
  // No marked deck: nothing to reroll.
  const p2 = await open(h);
  await quickStart(p2);
  await fast(p2);
  await atTable(p2);
  await p2.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(p2, 'I bet $20 at cards');
  const turn = await p2.evaluate(() => Game.state.meta.turn);
  await sendText(p2, '/reroll');
  assert.equal(await lastNotice(p2), 'Nothing to reroll: the cards were dealt.');
  await sendText(p2, '/cheat success');
  assert.equal(await lastNotice(p2), 'Nothing to reroll: the cards were dealt. Cheat armed: your next roll will be a success.');
  assert.equal(await p2.evaluate(() => Game.state.meta.turn), turn, 'nothing replayed');
});

// ----- L6: caught: the open day, and no game for a week -----

s.test('L6: caught on a day whose ban ends on a Sunday the bar is shut, the OUTCOME names the Monday; for a week the dealer will not deal (the no-game reason in the OUTCOME and the demo), nor while he is colder than -10', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  // A day whose ban (three days, today counted) ends on a Sunday.
  const day = await page.evaluate(l => {
    const S = Game.State, st = Game.state;
    let d = st.time.day;
    while (S.weekday(d + 3) !== 'Sunday' || S.isClosed(S.loc(l), d)) d++;
    S.apply({ setTime: { day: d, phase: 'evening' } });
    return d;
  }, spot.loc);
  await page.evaluate(() => { Game.Pipeline.forceNextRoll(1); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`not welcome back for three days \\(today counted: back on Monday, Day ${day + 4}\\); ${spot.dealerName} won't deal to them for a week\\.`));
  // Day + 4 (open again), but within the week: he will not deal.
  await page.evaluate(([l, d]) => Game.State.apply({ setTime: { day: d + 4, phase: 'evening' }, playerLocationId: l }), [spot.loc, day]);
  const n0 = await tables(page);
  await sendText(page, 'I bet $20 at cards');
  assert.equal(await tables(page), n0, 'no table');
  assert.equal(line(await lastCall(page, 'narrate'), 'CARD GAME'), `CARD GAME: no game: ${spot.dealerName} won't deal to the player, not since catching them cheating at cards on Day ${day}. No money changes hands.`);
  assert.match((await lastEntry(page)).narration, new RegExp(`${spot.dealerName} won't deal to you, not after the marked deck\\.`));
  // A week on, but still cold: no game; warmer, a game.
  await page.evaluate(([l, d]) => Game.State.apply({ setTime: { day: d + 8, phase: 'evening' }, playerLocationId: l }), [spot.loc, day]);
  assert.ok(await page.evaluate(d => Game.State.npc(d).attitude < -10, spot.dealer));
  await sendText(page, 'I bet $20 at cards');
  assert.equal(line(await lastCall(page, 'narrate'), 'CARD GAME'), `CARD GAME: no game: ${spot.dealerName} won't deal to the player, not the way things stand between them. No money changes hands.`);
  await page.evaluate(d => Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: d, delta: 25 }] }), spot.dealer);
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet $20 at cards');
  assert.equal(await tables(page), n0 + 1, 'he deals again');
});

// ----- L7: when the dealer deals -----

s.test('L7: with nobody dealing, the OUTCOME and the demo say when the dealer deals', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  const hours = await page.evaluate(l => {
    const G = Game, S = G.State, st = G.state;
    const phases = ['morning', 'afternoon', 'evening', 'night'].filter(ph => G.Pipeline.dealerOf(S.npcsAt(l, ph).map(n => n.id)));
    const off = ['morning', 'afternoon', 'evening', 'night'].find(ph => !phases.includes(ph));
    S.apply({ setTime: { day: st.time.day, phase: off } });
    return { phases, off, text: G.Pipeline.dealerHours(S.loc(l)) };
  }, spot.loc);
  assert.ok(hours.off, 'a phase without the dealer');
  assert.equal(hours.text, `${spot.dealerName} deals in the ${hours.phases.length > 1 ? `${hours.phases.slice(0, -1).join(', ')} and ${hours.phases[hours.phases.length - 1]}` : hours.phases[0]}`);
  await page.evaluate(() => Game.Api.Mock.queue('parse', { actionType: 'gamble', summary: 'Asks for a game', targets: [], needsRoll: false, timeCost: 'short' }));
  await sendText(page, 'I bet $20 at cards');
  assert.equal(line(await lastCall(page, 'narrate'), 'CARD GAME'), `CARD GAME: no game: nobody is dealing right now (${hours.text}), so there is no game to sit in on. No money changes hands.`);
  assert.ok((await lastEntry(page)).narration.includes(`Nobody is dealing right now, so there is no game to sit in on. ${hours.text}.`), (await lastEntry(page)).narration);
});

// ----- L8: the demo's filler -----

s.test('L8: the demo never says nobody pays you much mind at a hand, nor that it stays quiet when you were thrown out', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  const told = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate(k => { Game.Pipeline.hooks.cardsPlay = k % 2 ? { fold: true } : { hold: 'all' }; }, i);
    await sendText(page, `I bet $${5 + i} at cards`);
    told.push((await lastEntry(page)).narration);
  }
  for (const t of told) assert.doesNotMatch(t, /pays you much mind/, t);
  // Thrown out.
  const p2 = await open(h);
  await quickStart(p2, { bgIndex: await bgWith(p2, 'marked deck') });
  await fast(p2);
  await atTable(p2);
  await p2.evaluate(() => { Game.Pipeline.forceNextRoll(1); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(p2, 'I bet $20 at cards');
  const e = await lastEntry(p2);
  assert.equal(e.cards.result, 'caught');
  assert.doesNotMatch(e.narration, /stays quiet|pays you much mind/);
});

// ----- L9 to L12: the table's words and sizes -----

s.test('L9-L12: the catch roll is labelled; at Small text the Hold tag is 10px and the head 11px; the group is named by its head; a card says whether it is held; the fold OUTCOME says "their"; each suit sign asks for text presentation', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await page.evaluate(() => { Game.Storage.saveSettings({ textSize: 'S' }); Game.UI.applyDisplay(); });
  await fast(page);
  const spot = await atTable(page);
  await startHand(page, 'I bet $20 at cards');
  const a = await page.evaluate(() => {
    const t = document.querySelector('#feed .f-cards');
    const b = t.querySelector('.cards-you button.card');
    b.click();
    const head = t.querySelector('.cards-head');
    return {
      hold: parseFloat(getComputedStyle(b.querySelector('.card-hold')).fontSize), head: parseFloat(getComputedStyle(head).fontSize),
      label: t.getAttribute('aria-label'), by: t.getAttribute('aria-labelledby') === head.id, name: b.getAttribute('aria-label'), pressed: b.hasAttribute('aria-pressed'),
      other: t.querySelectorAll('.cards-you button.card')[1].getAttribute('aria-label'),
      suits: [...t.querySelectorAll('.card-suit')].map(x => x.textContent)
    };
  });
  assert.ok(a.hold >= 10, `Hold tag ${a.hold}px`);
  assert.ok(a.head >= 11, `head ${a.head}px`);
  assert.deepEqual([a.label, a.by, a.pressed], [null, true, false]);
  assert.match(a.name, /^(Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Jack|Queen|King|Ace) of \w+, held$/);
  assert.match(a.other, /, not held$/);
  assert.ok(a.suits.length === 10 && a.suits.every(x => /^[♠♥♦♣]︎$/.test(x)), JSON.stringify(a.suits));
  await page.evaluate(() => Game.Pipeline.forceNextRoll(17));
  await page.click('.cards-fold');
  await idle(page);
  const e = await lastEntry(page);
  assert.match(e.roll.line, new RegExp(`^Does ${spot.first} spot the marks\\? Wits 17 [+−] \\d+ = \\d+ vs 12 · `));
  assert.equal(await page.textContent('#feed .f-roll'), e.roll.line, 'under the table');
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`the player folds their ${lowerFirst(e.cards.player.name)}`));
  // After a reload it is labelled the same.
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.textContent('#feed .f-roll'), e.roll.line);
});

// ----- S1 to S4 -----

s.test('S1-S4: Draw says how many it replaces ("Draw 3", "Stand pat") and Fold its cost; after the showdown the cards drawn are marked New and named so, the dealer\'s draw is said; the read is 60% at Wits 0 and reads on the man; the hint names the way out', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  await setDeal(page, { player: ['Kc', 'Kd', '7h', '4s', '2c'], dealer: ['Ac', 'Ad', '9h', '6s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['7c', 'Jd', 'Qd', '6c', '8c'] });
  await startHand(page, 'I bet $40 at cards');
  const label = () => page.textContent('.cards-draw');
  assert.equal(await label(), 'Draw 5');
  assert.equal(await page.textContent('.cards-fold'), 'Fold −$20');
  assert.equal(await page.textContent('#feed .f-cards .cards-hint'), 'Pick the cards to hold, then Draw: the rest are replaced. Stop folds the hand (−$20).');
  for (const i of [0, 1]) await page.click(`.cards-you button.card[data-i="${i}"]`);
  assert.equal(await label(), 'Draw 3');
  for (const i of [2, 3, 4]) await page.click(`.cards-you button.card[data-i="${i}"]`);
  assert.equal(await label(), 'Stand pat');
  for (const i of [2, 3, 4]) await page.click(`.cards-you button.card[data-i="${i}"]`);
  await page.click('.cards-draw');
  await idle(page);
  const e = await lastEntry(page);
  assert.deepEqual(e.cards.player.final, ['Kc', 'Kd', '7c', 'Jd', 'Qd']);
  assert.deepEqual(e.cards.dealer.final, ['Ac', 'Ad', '5c', '6d', '8h']);
  const done = await page.evaluate(() => {
    const t = document.querySelector('#feed .f-cards');
    const side = sel => [...t.querySelectorAll(`${sel} .card`)].map(c => [c.dataset.card, c.classList.contains('drawn'), c.getAttribute('aria-label'), c.querySelector('.card-new') ? c.querySelector('.card-new').textContent : null]);
    return { you: side('.cards-you'), him: side('.cards-dealer'), drew: t.querySelector('.cards-drew').textContent, names: [...t.querySelectorAll('.cards-name')].map(x => x.textContent) };
  });
  assert.deepEqual(done.you.map(c => c[1]), [false, false, true, true, true]);
  assert.deepEqual(done.you[2], ['7c', true, 'Seven of clubs, drawn', 'New']);
  assert.deepEqual(done.you[0], ['Kc', false, 'King of clubs', null]);
  assert.deepEqual(done.him.map(c => c[1]), [false, false, true, true, true]);
  assert.equal(done.drew, ` · ${spot.first} draws 3`);
  assert.equal(done.names[0], `Pair of aces · ${spot.first} draws 3`);
  // Stand pat for him: a straight.
  await setDeal(page, { player: ['Kc', 'Kd', '7h', '4s', '2c'], dealer: ['5c', '6d', '7c', '8s', '9c'], dealerPile: ['2d', '3d', '4d', '5d', '6c'], playerPile: ['7c', 'Jd', 'Qd', '6h', '8c'] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $10 at cards');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .cards-drew')].pop().textContent), ` · ${spot.first} stands pat`);
  // S3: the read's odds and words.
  const read = (await lastEntry(page)).cards.read;
  assert.equal(read.odds, 0.6);
  assert.match(read.text, new RegExp(`^${spot.first} (has something|is bluffing)$`));
  assert.equal(read.text.endsWith('has something'), read.says === 'something');
});

s.run();
