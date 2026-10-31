'use strict';
/* Wave 12: what the second QA pass found at the card table (wave 11).
   M1 the story is followed again once the hand is played (a phone at
   320x640, and 390x844 with the first-run tip open), and the title
   screen's refusal is in view with the table's head; M2 a stored hand is
   bound to the game, the turn and the story it was dealt in, so a load
   that does not match drops it; M3 the dealer's invitation waits while he
   will not deal for any reason; L1 a /cheat cards hand resumed after a
   reload spends the cheat; L2 the catch roll's label; L3 two tabs (the
   hand void in the tab that lost the game, the notice in the one that
   took it); L4 a hand folded because the page was closed; L5 a narrator
   that fails after the showdown; L6 the focus after the refusal; L7 bets
   that are not bets; L8 stakes ("0.50 dollars", "a fiver", "half my
   money"); L9 one day for one ban; L10 the demo names someone not met as
   the Say picker does (docs/notes/ui.md and docs/notes/engine-world.md,
   Wave 12). Mock mode. Run with: node tests/run.cjs wave12 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP, GAME_URL } = require('./helpers.cjs');

const s = suite('wave12-cards');
const PHONE_CTX = { reducedMotion: 'reduce', isMobile: true, hasTouch: true };
const open = (h, viewport, extra) => h.open(Object.assign({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } }, extra || {}));
// Wave 13: heads up (no card people sit in) for every hand, after a reload too, as these tests were written.
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); Game.Pipeline.hooks.cardsSeats = []; });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
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
      // Wave 13: five-card draw remembered (no chooser) and heads up, as these tests were written.
      S.apply({ cardGame: 'draw' }); G.Pipeline.hooks.cardsSeats = [];
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
async function reloadGame(page, how) {
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await fast(page);
  if (how === 'none') return;
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(100);
  await idle(page);
}
const sayLine = (page, words, to) => page.evaluate(([w, t]) => { window.__said = Game.Pipeline.submit(w, { mode: 'say', to: t }); }, [words, to]);
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
const lastCall = (page, method) => page.evaluate(m => (Game.Api.Mock.calls.filter(c => c.method === m).pop() || {}).text || '', method);
const line = (packet, label) => (new RegExp(`^${label}.*$`, 'm').exec(packet) || [''])[0];
const lastNotice = page => page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-notice')].pop(); return n ? n.querySelector('.f-notice-text').textContent : null; });
const tables = page => page.locator('#feed .f-cards').count();
const setDeal = (page, deal) => page.evaluate(d => { Game.Pipeline.hooks.cardsDeal = d; }, deal);
// The player's two pair against the dealer's pair of aces (he draws three), and the other way round.
const WIN = { player: ['Kc', 'Kd', '7h', '7s', '2c'], dealer: ['Ac', 'Ad', '9h', '4s', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '4d', '5d', '6c', '8c'] };
const LOSE = { player: ['Kc', 'Qd', '7h', '4s', '2c'], dealer: ['Ac', 'Ad', 'Ah', '4d', '3c'], dealerPile: ['5c', '6d', '8h', '2d', '2h'], playerPile: ['3d', '9d', '5d', '6c', '8c'] };
/* Where things are in the story area: the newest narration and notice, the open table's head and Fold, the "New" pill. */
const feedGeo = page => page.evaluate(() => {
  const f = document.querySelector('#feed-scroll');
  const box = f.getBoundingClientRect();
  const inView = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1; };
  const narr = [...document.querySelectorAll('#feed .f-narr')].pop();
  const notice = [...document.querySelectorAll('#feed .f-notice')].pop();
  const t = [...document.querySelectorAll('#feed .f-cards')].pop();
  const pill = document.querySelector('#new-btn');
  const fold = document.querySelector('#feed .f-cards.open .cards-fold');
  const p = pill.getBoundingClientRect();
  const fr = fold ? fold.getBoundingClientRect() : null;
  // The end of the newest narration on screen (the story followed to its last line).
  const nr = narr ? narr.getBoundingClientRect() : null;
  return {
    narr: inView(narr), narrEnd: nr ? nr.bottom <= box.bottom + 1 && nr.bottom > box.top : null, notice: inView(notice), noticeText: notice ? notice.querySelector('.f-notice-text').textContent : null,
    head: t ? inView(t.querySelector('.cards-head')) : null, pill: !pill.hidden,
    pillOverFold: !!fr && !pill.hidden && p.left < fr.right && p.right > fr.left && p.top < fr.bottom && p.bottom > fr.top,
    focus: document.activeElement.className, tip: !!document.querySelector('.f-tip'),
    noticeBeforeTable: !!(notice && t && notice.nextElementSibling === t)
  };
});

// ----- M1 and L6: the story followed after the hand; the refusal in view -----

s.test('M1, L6: on a phone (320x640, and 390x844 with the first-run tip open) the title screen\'s refusal shows above the table with its head in view, no "New" pill over Fold, the focus on the head; once the hand is played the narration is on screen and there is no pill', async h => {
  for (const [viewport, tip, turns] of [[{ width: 320, height: 640 }, false, 3], [{ width: 390, height: 844 }, true, 0]]) {
    const page = await open(h, viewport, { contextOptions: PHONE_CTX });
    await quickStart(page);
    await fast(page);
    if (!tip && await page.locator('.f-tip .bar-x').count()) await page.locator('.f-tip .bar-x').tap();
    for (let i = 0; i < turns; i++) await sendText(page, 'I look around');
    await atTable(page);
    await startHand(page, 'I bet $20 at cards');
    await page.locator('#tb-menu').tap();
    await page.locator('#menu-pop [data-menu="title"]').tap();
    let g = await feedGeo(page);
    const at = `${viewport.width}x${viewport.height}`;
    assert.equal(g.tip, tip, `${at}: the tip`);
    assert.deepEqual([g.noticeText, g.notice, g.noticeBeforeTable, g.head, g.pill, g.pillOverFold], ['Finish the hand first: Draw or Fold (Stop folds).', true, true, true, false, false], `${at}: ${JSON.stringify(g)}`);
    assert.equal(g.focus, 'cards-head', `${at}: the focus on the table's head (L6)`);
    await page.locator('.cards-draw').tap();
    await idle(page);
    g = await feedGeo(page);
    assert.deepEqual([g.narr, g.pill], [true, false], `${at} after the hand: ${JSON.stringify(g)}`);
    // The next turn follows too (a look can be taller than a small phone's story area: its end is on screen).
    await sendText(page, 'I look around');
    g = await feedGeo(page);
    assert.deepEqual([g.narrEnd, g.pill], [true, false], `${at} the turn after: ${JSON.stringify(g)}`);
  }
});

s.test('M1: on a 320x640 phone every hand (a draw, a fold, Stop) leaves the narration on screen and no pill, with the table\'s head at the top while it is open', async h => {
  const page = await open(h, { width: 320, height: 640 }, { contextOptions: PHONE_CTX });
  await quickStart(page);
  await fast(page);
  if (await page.locator('.f-tip .bar-x').count()) await page.locator('.f-tip .bar-x').tap();
  await atTable(page);
  for (const how of ['draw', 'fold', 'stop']) {
    await startHand(page, 'I bet $10 at cards');
    assert.equal((await feedGeo(page)).head, true, `${how}: the head in view while the hand is open`);
    if (how === 'stop') await page.locator('#send').tap();
    else await page.locator(how === 'draw' ? '.cards-draw' : '.cards-fold').tap();
    await idle(page);
    const g = await feedGeo(page);
    assert.deepEqual([g.narr, g.pill], [true, false], `${how}: ${JSON.stringify(g)}`);
  }
});

// ----- M2: a stored hand is bound to its game -----

s.test('M2: a hand left on the table is dropped by a load that does not match it (an older save of the same game, a forged story, New game), so a hand the player never played is never folded', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await sendText(page, '/save early');
  await sendText(page, 'I look around');
  await sendText(page, 'I order a beer');
  await startHand(page, 'I bet $40 at cards');
  const held = await page.evaluate(() => Game.Storage.heldHand());
  assert.ok(held && held.game && held.story && held.tab && held.token && Number.isInteger(held.turn), JSON.stringify(held));
  await reloadGame(page, 'none');
  // Load the early save from the title instead of Continue.
  const slot = await page.evaluate(() => Game.Storage.listSlots().findIndex(x => x && x.name === 'early') + 1);
  assert.ok(slot > 0);
  await page.evaluate(n => Game.App.loadSlot(n), slot);
  await page.waitForSelector('#screen-game.active');
  await page.waitForTimeout(100);
  await idle(page);
  assert.equal(await page.evaluate(() => Game.Storage.heldHand()), null, 'dropped by the load that did not match');
  // Played on to the turn the hand was dealt in, then reloaded: nothing is folded.
  while (await page.evaluate(() => Game.state.meta.turn) + 1 < held.turn) await sendText(page, 'I look around');
  const g0 = await page.evaluate(() => Game.state.player.gold);
  await reloadGame(page);
  const e = await lastEntry(page);
  assert.deepEqual([e.input, !!e.cards, await page.evaluate(() => Game.state.player.gold)], ['I look around', false, g0]);
  // A stored hand whose story does not match the game at that turn (another timeline) is dropped, not resumed.
  await startHand(page, 'I bet $30 at cards');
  await page.evaluate(() => { const k = 'novatria.hand'; const h = JSON.parse(localStorage.getItem(k)); h.story = 'x' + h.story; localStorage.setItem(k, JSON.stringify(h)); });
  const g1 = await page.evaluate(() => Game.state.player.gold);
  await reloadGame(page);
  assert.equal(await page.evaluate(() => Game.Storage.heldHand()), null);
  assert.deepEqual([(await lastEntry(page)).input, await page.evaluate(() => Game.state.player.gold)], ['I look around', g1]);
  // New game drops one too.
  await startHand(page, 'I bet $30 at cards');
  await reloadGame(page, 'none');
  assert.ok(await page.evaluate(() => !!Game.Storage.heldHand()));
  await quickStart(page, { seed: 777 });
  assert.equal(await page.evaluate(() => Game.Storage.heldHand()), null, 'New game');
});

// ----- M3: the invitation waits while he will not deal -----

s.test('M3: the dealer\'s invitation (the hustler\'s hook) is not told while he will not deal because he is colder than -10, and is told once he would deal again', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  await page.evaluate(d => { const n = Game.State.npc(d); Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: d, delta: -15 - n.attitude }] }); }, spot.dealer);
  assert.deepEqual(await page.evaluate(d => Game.Pipeline.dealerRefusal(Game.State.npc(d), Game.state), spot.dealer), { cold: true });
  await sendText(page, 'I look around');
  const due = await page.evaluate(d => Game.state.dueEvents.filter(e => e.npcId === d).map(e => e.seedId), spot.dealer);
  assert.equal(due.length, 1, 'the invitation is due');
  for (let i = 0; i < 2; i++) {
    await sendText(page, 'I look around');
    assert.ok(await page.evaluate(id => Game.state.dueEvents.some(e => e.seedId === id), due[0]), 'it waits');
    assert.doesNotMatch(await lastCall(page, 'narrate'), /invites/);
  }
  await page.evaluate(d => Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: d, delta: 10 }] }), spot.dealer);
  assert.equal(await page.evaluate(d => Game.Pipeline.dealerRefusal(Game.State.npc(d), Game.state), spot.dealer), null);
  await sendText(page, 'I look around');
  assert.ok(!(await page.evaluate(id => Game.state.dueEvents.some(e => e.seedId === id), due[0])), 'told and done');
  assert.match(await lastCall(page, 'narrate'), /invites/);
});

// ----- L1, L4: a reload with a hand on the table -----

s.test('L1, L4: a hand folded because the page was closed reads "You left the table, so you fold" (closed, not stopped); a /cheat cards hand played and then reloaded spends the cheat', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await startHand(page, 'I bet $20 at cards');
  await reloadGame(page);
  let e = await lastEntry(page);
  assert.deepEqual([e.cards.result, e.cards.closed, e.cards.stopped], ['fold', true, undefined]);
  const g = await page.evaluate(() => Game.state.player.gold);
  assert.equal(await page.textContent('#feed .f-cards:last-of-type .cards-result'), `You left the table, so you fold: −$10 · cash $${g}`);
  assert.equal(await lastNotice(page), 'The game was closed with a hand on the table, so the hand is folded and the ante is gone.');
  // Drawn again after another reload: the same words.
  await reloadGame(page);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .cards-result')].pop().textContent), `You left the table, so you fold: −$10 · cash $${g}`);
  // L1: the cheat armed, the hand played, the page closed while the story is written.
  await sendText(page, '/cheat cards');
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 5000 }));
  await startHand(page, 'I bet $30 at cards');
  await page.click('.cards-draw');
  await page.waitForFunction(() => document.querySelector('#turn-status-text').textContent === 'Writing…');
  assert.equal(await page.evaluate(() => Game.Storage.loadAutosave().state.flags.cardsCheat), true, 'the autosave before the turn has it armed');
  await reloadGame(page);
  e = await lastEntry(page);
  assert.deepEqual([e.input, e.cards.cheat, e.cards.result], ['I bet $30 at cards', true, 'win']);
  assert.deepEqual(await page.evaluate(() => [Game.state.flags.cardsCheat, Game.Pipeline.cheatArmed, Game.Storage.loadAutosave().state.flags.cardsCheat]), [undefined, false, undefined], 'spent');
});

// ----- L2: the catch roll -----

s.test('L2: the catch roll under the table reads so that a success is the player\'s: "Keeping the marks from Curtis: … · Success" when he does not catch them', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  await page.evaluate(() => { Game.Pipeline.forceNextRoll(17); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  const e = await lastEntry(page);
  assert.notEqual(e.cards.result, 'caught');
  assert.match(e.roll.line, new RegExp(`^Keeping the marks from ${spot.first}: Wits 17 [+−] \\d+ = \\d+ vs 12 · Success$`));
  assert.equal(await page.textContent('#feed .f-roll'), e.roll.line);
  assert.match(e.narration, new RegExp(`${spot.dealerName} never spots the marks\\.`));
});

// ----- L3: two tabs -----

s.test('L3: another tab takes the game over with a hand open here: this tab\'s table is void (its buttons off, "Another tab took over; this hand is void here."), its turn ends with no call, and the other tab folds the hand with a notice that says it was left in another tab', async h => {
  const a = await open(h);
  await quickStart(a);
  await fast(a);
  await atTable(a);
  await sendText(a, 'I look around');
  const g0 = await a.evaluate(() => Game.state.player.gold);
  await startHand(a, 'I bet $40 at cards');
  const calls = await a.evaluate(() => Game.Api.Mock.calls.length);
  const b = await a.context().newPage();
  await b.goto(GAME_URL);
  await b.waitForFunction(() => window.Game && Game.App);
  await fast(b);
  await b.click('#btn-continue');
  await b.waitForSelector('#screen-game.active');
  await b.waitForFunction(() => Game.state.log[Game.state.log.length - 1].cards);
  await idle(b);
  const e = await lastEntry(b);
  assert.deepEqual([e.input, e.cards.result, e.cards.closed, await b.evaluate(() => Game.state.player.gold) - g0], ['I bet $40 at cards', 'fold', true, -20]);
  assert.equal(await lastNotice(b), 'A hand was left open in another tab, so it is folded here and the ante is gone.');
  // Tab A: read only, the hand void, the turn over.
  await a.waitForFunction(() => Game.Storage.readOnly && !Game.Pipeline.busy);
  const r = await a.evaluate(c => {
    const t = [...document.querySelectorAll('#feed .f-cards')].pop();
    return { open: Game.Pipeline.handOpen, cls: [...t.classList].filter(x => x !== 'f-item'), line: (t.querySelector('.cards-void') || {}).textContent, off: [...t.querySelectorAll('button')].every(x => x.disabled), calls: Game.Api.Mock.calls.slice(c).map(x => x.method) };
  }, calls);
  assert.deepEqual(r, { open: false, cls: ['f-cards', 'void'], line: 'Another tab took over; this hand is void here.', off: true, calls: [] });
  assert.equal(await a.evaluate(() => Game.Pipeline.playHand({ hold: [] })), false, 'nothing to play');
  // A turn's end in tab A never takes another tab's hand off the table.
  await startHand(b, 'I bet $10 at cards');
  const bHand = await b.evaluate(() => Game.Storage.heldHand());
  assert.equal(await a.evaluate(t => Game.Storage.dropHand(t + 'x'), bHand.token), false);
  assert.deepEqual(await b.evaluate(() => Game.Storage.heldHand().token), bHand.token);
  await b.click('.cards-fold');
  await idle(b);
  // Play here instead: the game as the other tab left it.
  await a.click('#tab-bar-take');
  await a.waitForFunction(() => !Game.Storage.readOnly);
  assert.equal(await a.locator('#feed .f-cards.void').count(), 0);
  assert.equal(await a.evaluate(() => Game.state.player.gold), await b.evaluate(() => Game.state.player.gold));
});

// ----- L5: the narrator fails after the showdown -----

s.test('L5: a narrator that cannot be reached after the showdown leaves a notice that says so and how the hand stands, with no "try again" and no Try again button', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  await atTable(page);
  await setDeal(page, LOSE);
  await page.evaluate(() => { Game.Api.Mock.queue('narrate', { error: { type: 'network' } }); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  assert.equal((await lastEntry(page)).cards.result, 'lose');
  const n = await page.evaluate(() => { const x = [...document.querySelectorAll('#feed .f-notice')].pop(); return { text: x.textContent, buttons: x.querySelectorAll('button').length }; });
  assert.deepEqual(n, { text: 'The narrator could not be reached. The hand stands: you lose $20.', buttons: 0 });
  assert.doesNotMatch(n.text, /try again/i);
  // A win and a fold say theirs.
  for (const [deal, play, want] of [[WIN, { hold: 'all' }, 'you win $20'], [WIN, { fold: true }, 'you fold and give up $10']]) {
    await setDeal(page, deal);
    await page.evaluate(p => { Game.Api.Mock.queue('narrate', { error: { type: 'network' } }); Game.Pipeline.hooks.cardsPlay = p; }, play);
    await sendText(page, 'I bet $20 at cards');
    assert.equal(await lastNotice(page), `The narrator could not be reached. The hand stands: ${want}.`);
  }
});

// ----- L7: bets that are not bets -----

s.test('L7: "I bet you ten bucks it rains tomorrow" said to the dealer and "I bet he is lying" in the demo\'s Do mode deal no hand; "I bet $20" and "I bet twenty on the next hand" do', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  const words = await page.evaluate(() => ['I bet you ten bucks it rains tomorrow', 'I bet he is lying', 'I bet you are tired', 'I bet Curtis is bluffing', 'I bet $20', 'I bet twenty on the next hand', "I'll bet you fifty.", 'I bet a fiver', 'Deal me in'].map(t => [t, Game.Pipeline.wordsBet(t), Game.Style.betTalk(t)]));
  assert.deepEqual(words.map(x => x[1]), [false, false, false, false, true, true, true, true, true], JSON.stringify(words));
  const n0 = await tables(page);
  // Say mode, to the dealer: talk.
  await sayLine(page, 'I bet you ten bucks it rains tomorrow', spot.dealer);
  await idle(page);
  assert.deepEqual([await tables(page), await page.evaluate(() => Game.Pipeline.lastTurn.action.actionType)], [n0, 'talk']);
  // Even when the parser read a bet.
  await page.evaluate(() => Game.Api.Mock.queue('parse', { actionType: 'gamble', summary: 'bets $10 that it rains', targets: [], needsRoll: false, timeCost: 'short' }));
  await sayLine(page, 'I bet you ten bucks it rains tomorrow', spot.dealer);
  await idle(page);
  assert.deepEqual([await tables(page), await page.evaluate(() => Game.Pipeline.lastTurn.action.actionType)], [n0, 'talk']);
  // The demo's Do mode.
  const parsed = await page.evaluate(async () => {
    const out = {};
    for (const t of ['I bet he is lying', 'I bet you ten bucks it rains tomorrow', 'I bet $20', 'I bet twenty on the next hand', 'I bet a fiver', 'I bet half my money']) out[t] = (await Game.Api.parse(Game.Pipeline.parsePacket(t, { mode: 'action' }))).actionType;
    return out;
  });
  for (const [t, type] of Object.entries(parsed)) assert.equal(type === 'gamble', !/lying|rains/.test(t), `${t}: ${type}`);
  await sendText(page, 'I bet he is lying');
  assert.equal(await tables(page), n0, 'no table');
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { fold: true }; });
  await sendText(page, 'I bet twenty on the next hand');
  assert.deepEqual([await tables(page), (await lastEntry(page)).cards.stake], [n0 + 1, 20]);
});

// ----- L8: stakes -----

s.test('L8: "0.50 dollars" is the usual $20 and the table and the OUTCOME say "$0.50 is no stake"; "a fiver" is $5; "half my money" is half the cash, rounded down, at least $1', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(() => [['I bet 0.50 dollars', 140], ['I bet a fiver', 140], ['two tenners on this hand', 140], ['I bet half my money', 141], ['half of what I have', 141], ['I bet half my money', 1], ['I bet it all', 140]].map(([t, g]) => Game.Pipeline.stakeFor(t, g)));
  assert.deepEqual(r.map(x => [x.stake, x.note]), [[20, 'usual'], [5, null], [20, null], [70, 'half'], [70, 'half'], [1, 'all'], [140, 'all']]);
  assert.equal(r[0].named, 0.5);
  const spot = await atTable(page);
  await startHand(page, 'I bet 0.50 dollars at cards');
  assert.equal(await page.textContent('#feed .f-cards .cards-head'), `${spot.dealerName}'s table · Five-card draw · stake $20, the usual: $0.50 is no stake · pot $40`);
  await page.click('.cards-fold');
  await idle(page);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), /^OUTCOME: the card game \(the player put up \$20, the usual stake: \$0\.50 is no stake\): /);
  // Drawn again after a reload: the same.
  await reloadGame(page);
  // Wave 14 (QA #8): the head of the finished table has the real pot: the player folded, so $20 and $10.
  assert.equal(await page.textContent('#feed .f-cards .cards-head'), `${spot.dealerName}'s table · Five-card draw · stake $20, the usual: $0.50 is no stake · pot $30`);
  await startHand(page, 'I bet a fiver on this hand');
  assert.match(await page.textContent('#feed .f-cards:last-of-type .cards-head'), /· stake \$5 · pot \$10$/);
  await page.click('.cards-fold');
  await idle(page);
  const g = await page.evaluate(() => Game.state.player.gold);
  await startHand(page, 'I bet half my money on a hand');
  const half = Math.max(1, Math.floor(g / 2));
  assert.equal(await page.textContent('#feed .f-cards:last-of-type .cards-head'), `${spot.dealerName}'s table · Five-card draw · stake $${half}, half of what you have · pot $${half * 2}`);
  await page.click('.cards-fold');
  await idle(page);
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`^OUTCOME: the card game \\(the player put up \\$${half}, half of what they have\\): `));
});

// ----- L9: one day for one ban -----

s.test('L9: caught on a day whose ban ends on a Sunday the bar is shut, every line about the ban names the Monday: the OUTCOME, the walk to the door (the narrator and the demo), /skip there, the People card and the Places panel', async h => {
  const page = await open(h);
  await quickStart(page, { bgIndex: await bgWith(page, 'marked deck') });
  await fast(page);
  const spot = await atTable(page);
  const day = await page.evaluate(l => {
    const S = Game.State, st = Game.state;
    let d = st.time.day;
    while (S.weekday(d + 3) !== 'Sunday' || S.isClosed(S.loc(l), d)) d++;
    S.apply({ setTime: { day: d, phase: 'evening' } });
    return d;
  }, spot.loc);
  const back = day + 4;
  await page.evaluate(() => { Game.Pipeline.forceNextRoll(1); Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await sendText(page, 'I bet $20 at cards');
  assert.equal((await lastEntry(page)).cards.result, 'caught');
  assert.match(line(await lastCall(page, 'narrate'), 'OUTCOME: '), new RegExp(`back on Monday, Day ${back}\\)`));
  // The next morning, on the street: walk to the door.
  await page.evaluate(d => Game.State.apply({ setTime: { day: d + 1, phase: 'morning' } }), day);
  const barName = spot.name.replace(/^The /, 'the ');
  await sendText(page, `I go to ${barName}`);
  assert.match(await lastCall(page, 'narrate'), new RegExp(`not welcome there until day ${back}\\b`));
  assert.ok((await lastEntry(page)).narration.includes(`but you are not welcome there until Day ${back}.`), (await lastEntry(page)).narration);
  await sendText(page, `/skip ${barName}`);
  assert.equal(await lastNotice(page), `You are not welcome at ${barName} until Day ${back}.`);
  // The People card and the Places panel.
  const r = await page.evaluate(([d, l]) => {
    Game.UI.openPanel('people');
    const meta = document.querySelector(`.pcard[data-npc="${d}"] .pcard-meta`);
    Game.UI.openPanel('places');
    Game.UI.togglePlace(l, true);
    const more = document.querySelector(`.plcard[data-loc="${l}"] .plcard-more`);
    return { meta: meta ? meta.textContent : '', more: more ? more.textContent : '' };
  }, [spot.dealer, spot.loc]);
  assert.ok(r.meta.includes(`Banned you from ${barName} until Day ${back}`), r.meta);
  assert.ok(r.more.includes(`You are banned until Day ${back}.`), r.more);
});

// ----- L10: the demo names someone not met as the picker does -----

s.test('L10: a bet said to someone the player has not met gets the demo\'s no-game line with the Say picker\'s label, not their name; the narrator still gets the name', async h => {
  const page = await open(h);
  await quickStart(page);
  await fast(page);
  const spot = await atTable(page);
  assert.ok(spot.other, 'someone else at the table');
  // Neither has been met (test only: the flag as a fresh game has it).
  await page.evaluate(ids => { for (const id of ids) Game.State.npc(id).knownToPlayer = false; }, [spot.dealer, spot.other.id]);
  const labels = await page.evaluate(ids => ids.map(id => Game.npcLabel(Game.State.npc(id))), [spot.dealer, spot.other.id]);
  assert.ok(labels.every(x => /^the /.test(x)), JSON.stringify(labels));
  await sayLine(page, 'Deal me in', spot.other.id);
  await idle(page);
  assert.equal(line(await lastCall(page, 'narrate'), 'CARD GAME'), `CARD GAME: no game: the player said it to ${spot.other.name}, and ${spot.dealerName} is the one who deals. No money changes hands.`);
  const told = (await lastEntry(page)).narration;
  assert.ok(told.includes(`It's ${labels[0]} who deals, and you said it to ${labels[1]}.`), told);
  assert.ok(!told.includes(spot.other.name) && !told.includes(spot.dealerName), told);
});

s.run();
