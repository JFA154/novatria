'use strict';
/* Wave 39 (the owner: "when i say something before playing poker, and we
   play, i don't see the message until the game finishes. I.e. if I say:
   'I will kick your ass, let's play', instead of it being: 'We'll see, the
   [game]', it is [game] finishes, then we'll see"): words said with a bet
   are answered before a card is dealt (Pipeline.tableWords, tableTalk).
   Covered here: which lines are talk and which are only a bet; the order in
   the story (the line, the answer, the table, the hand); the two packets
   (TABLE TALK with a short LENGTH, then ALREADY TOLD); the log entry's lead
   and the same order after the feed is drawn again and after /undo; a bare
   bet as it was (one narration, no lead); a narrator that fails or declines
   before the cards (the table opens with no answer); Stop while the answer
   is written (the turn is called off, nothing dealt); the chooser after the
   answer (docs/notes/engine-world.md and docs/notes/ui.md, Wave 39).
   Mock mode. Run with: node tests/run.cjs wave39 */
const assert = require('assert/strict');
const { suite, quickStart, presetCards, LAPTOP } = require('./helpers.cjs');

const s = suite('wave39-table-talk');
const BAR = 'loc_low_water';
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const start = async (h, game) => {
  const page = await h.open({ viewport: LAPTOP, contextOptions: { reducedMotion: 'reduce' } });
  await quickStart(page, { kinds: [] });
  await presetCards(page, { game: game === undefined ? 'draw' : game, seats: [] });
  const dealer = await page.evaluate(bar => {
    const G = Game, S = G.State;
    G.Api.Mock.delay = 0;
    S.apply({ setTime: { day: 2, phase: 'evening' }, playerLocationId: bar });
    const d = G.Pipeline.dealerOf(S.npcsAt(bar).map(n => n.id));
    S.apply({ npcKnownToPlayer: [d.id] });
    G.UI.renderGame();
    G.Api.Mock.clear();
    return { id: d.id, name: d.name };
  }, BAR);
  return { page, dealer };
};
/* A Say line to the dealer; resolves once the turn has started (the caller waits for what it expects). */
const say = (page, to, words) => page.evaluate(([to, words]) => { window.__turn = Game.Pipeline.submit(words, { mode: 'say', to }); }, [to, words]);
const feedKinds = page => page.evaluate(() => {
  const all = [...document.querySelectorAll('#feed > *')];
  const from = all.map(n => n.classList.contains('f-input')).lastIndexOf(true);
  return all.slice(from).map(n => (n.classList.contains('f-input') ? 'input' : n.classList.contains('f-cards') ? 'table' : n.classList.contains('f-narr') ? 'narr' : n.classList.contains('f-roll') ? 'roll' : n.classList.contains('f-notice') ? 'notice' : n.classList.contains('f-divider') ? 'divider' : 'other'));
});
const narrs = page => page.evaluate(() => { const all = [...document.querySelectorAll('#feed > *')]; const from = all.map(n => n.classList.contains('f-input')).lastIndexOf(true); return all.slice(from).filter(n => n.classList.contains('f-narr')).map(n => [...n.querySelectorAll('p')].map(p => p.textContent).filter(t => t !== 'Mock narration').join('\n\n')); });
const calls = page => page.evaluate(() => Game.Api.Mock.calls.map(c => c.method));
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);

s.test('(a) which words are talk: two or more that are not the bet\'s own, small words or the dealer\'s name; in Do mode only what is quoted', async h => {
  const { page, dealer } = await start(h);
  const out = await page.evaluate(id => {
    const d = Game.State.npc(id);
    const tw = (input, mode) => Game.Pipeline.tableWords({ input, speech: mode === 'say' ? { mode: 'say', to: id } : { mode: 'do' } }, d);
    return {
      talk: [["I will kick your ass, let's play", 'say'], ['Deal me in, old man', 'say'], ['You look nervous tonight. Deal me in.', 'say'], ['I sit down and say "You are going to lose your shirt" and put $20 in', 'do']].map(([w, m]) => tw(w, m)),
      bare: [['Deal me in for twenty', 'say'], ['Mind if I sit in?', 'say'], ['Mind if I join you for a hand?', 'say'], [`Another hand, ${d.name.split(' ')[0]}`, 'say'], ["I'm in for fifty", 'say'], ['I go all in', 'say'], ["Deal me in at hold'em", 'say'],
        ['I bet $20 at cards', 'do'], ['I take a seat at the card table and sneer at everyone', 'do'], ['I put $50 in', 'do']].map(([w, m]) => tw(w, m))
    };
  }, dealer.id);
  assert.deepEqual(out.talk, ["I will kick your ass, let's play", 'Deal me in, old man', 'You look nervous tonight. Deal me in.', '"You are going to lose your shirt"']);
  assert.deepEqual(out.bare, out.bare.map(() => null), 'a line that is only the bet opens the table at once');
});

s.test('(b) words with a bet are answered before a card is dealt: the line, the answer, the table, then the hand; the narrator is told what was already said; the log keeps the lead and the feed draws the same order again', async h => {
  const { page, dealer } = await start(h);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', '"We\'ll see about that," Curtis says, and cuts the deck.'));
  await say(page, dealer.id, 'I will kick your ass tonight. Deal me in.');
  await page.waitForSelector('#feed .f-cards.open');
  assert.deepEqual(await feedKinds(page), ['input', 'narr', 'table'], 'the answer is on screen above the open table');
  assert.deepEqual(await narrs(page), ['"We\'ll see about that," Curtis says, and cuts the deck.']);
  assert.deepEqual(await calls(page), ['parse', 'narrate'], 'one short call before the cards');
  assert.equal(await page.evaluate(() => document.querySelector('#turn-status-text').textContent), 'Your hand');
  const first = await page.evaluate(() => Game.Api.Mock.calls.find(c => c.method === 'narrate').text);
  assert.match(first, /^PLAYER SAYS \(to Curtis Pruett\): "I will kick your ass tonight\. Deal me in\."$/m);
  assert.match(first, /^TABLE TALK \(before any card is dealt\): .*Do not deal, play or decide the hand, name no card and no winner/m);
  assert.match(first, /^LENGTH: one or two sentences, under 40 words\. Stop as the cards are dealt\.$/m);
  assert.doesNotMatch(first, /^OUTCOME: /m, "nothing of a hand is in it");
  await page.evaluate(() => Game.Pipeline.playHand({ hold: [0, 1, 2, 3, 4] }));
  await page.waitForFunction(() => !Game.Pipeline.handOpen || !!document.querySelector('#feed .f-cards.open .cards-acts button'));
  for (let i = 0; i < 8 && await page.evaluate(() => Game.Pipeline.handOpen); i++) { await page.click('#feed .f-cards.open .cards-acts button:not([disabled])'); await page.waitForTimeout(60); }
  await idle(page);
  assert.deepEqual((await feedKinds(page)).filter(k => k !== 'roll' && k !== 'divider' && k !== 'other'), ['input', 'narr', 'table', 'narr']);
  assert.deepEqual(await calls(page), ['parse', 'narrate', 'narrate', 'bookkeep']);
  const second = await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate')[1].text);
  assert.match(second, /^ALREADY TOLD \(before the hand, on screen above the table\): "\\"We'll see about that,\\" Curtis says, and cuts the deck\." The player's words are answered there: do not repeat or rephrase that answer, and do not answer the words again; tell the hand and what follows it\.$/m);
  assert.match(second, /^OUTCOME: /m, "the hand is in it");
  const e = await lastEntry(page);
  assert.equal(e.lead, '"We\'ll see about that," Curtis says, and cuts the deck.');
  assert.ok(e.narration.startsWith(`${e.lead}\n\n`) && e.narration.length > e.lead.length + 20, 'the turn\'s narration is the answer and the hand together');
  assert.ok(await page.evaluate(() => /We'll see about that/.test(Game.Api.Mock.calls.find(c => c.method === 'bookkeep').text)), 'the bookkeeper reads the whole of it');
  const shown = await narrs(page);
  assert.equal(shown.length, 2);
  assert.equal(shown[1].includes("We'll see about that"), false, 'the answer is not shown twice');
  await page.evaluate(() => Game.UI.rebuildFeed());
  assert.deepEqual((await feedKinds(page)).filter(k => k !== 'roll' && k !== 'divider' && k !== 'other'), ['input', 'narr', 'table', 'narr'], 'drawn again in the order it was played');
  assert.deepEqual(await narrs(page), shown);
  // /undo takes all of it back.
  await page.evaluate(() => Game.Commands.run('/undo'));
  await idle(page);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-narr')].some(n => /We'll see about that/.test(n.textContent))), false);
});

s.test('(c) a line that is only a bet is as it was: the table at once, one narration, no lead', async h => {
  const { page, dealer } = await start(h);
  await say(page, dealer.id, 'Deal me in for twenty');
  await page.waitForSelector('#feed .f-cards.open');
  assert.deepEqual(await feedKinds(page), ['input', 'table']);
  assert.deepEqual(await calls(page), ['parse']);
  await page.evaluate(() => Game.Pipeline.playHand({ fold: true }));
  await idle(page);
  const e = await lastEntry(page);
  assert.equal(e.lead, undefined);
  assert.deepEqual((await calls(page)).filter(c => c === 'narrate').length, 1);
});

for (const [name, canned] of [['fails', { error: { type: 'network' } }], ['declines', { refusal: {} }]]) {
  s.test(`(d) a narrator that ${name} before the cards costs nothing: the table opens with no answer and the hand is told as before`, async h => {
    const { page, dealer } = await start(h);
    await page.evaluate(c => Game.Api.Mock.queue('narrate', c), canned);
    await say(page, dealer.id, 'You look nervous tonight. Deal me in.');
    await page.waitForSelector('#feed .f-cards.open');
    assert.deepEqual(await feedKinds(page), ['input', 'table'], 'no empty placeholder is left behind');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-notice').length), 0, 'and no notice');
    await page.evaluate(() => Game.Pipeline.playHand({ fold: true }));
    await idle(page);
    const e = await lastEntry(page);
    assert.equal(e.lead, undefined);
    assert.ok(e.cards && e.narration.length > 10);
    assert.ok(await page.evaluate(() => Game.State.debugLog.some(x => x.kind === 'narrator' && /no answer before the cards/.test(x.reason || ''))), 'the debug log says why');
  });
}

s.test('(e) Stop while the answer is being written calls the turn off: nothing dealt, nothing spent, the line back in the box', async h => {
  const { page, dealer } = await start(h);
  const before = await page.evaluate(() => ({ cash: Game.state.player.gold, log: Game.state.log.length }));
  await page.evaluate(() => Game.Api.Mock.queue('narrate', { delay: 3000 }));
  await page.click('#mode-say');
  await page.evaluate(id => Game.UI.setAddressee(id), dealer.id);
  await page.fill('#cmd', 'You look nervous tonight. Deal me in.');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => Game.Api.Mock.calls.some(c => c.method === 'narrate'));
  assert.equal(await page.evaluate(() => Game.Pipeline.abort()), true);
  await idle(page);
  assert.deepEqual(await page.evaluate(() => ({ cash: Game.state.player.gold, log: Game.state.log.length })), before);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-cards').length), 0, 'no table');
  assert.equal(await page.inputValue('#cmd'), 'You look nervous tonight. Deal me in.');
});

s.test('(f) with no game remembered the answer comes before the chooser too', async h => {
  const { page, dealer } = await start(h, null);
  await page.evaluate(() => Game.Api.Mock.queue('narrate', '"Big talk," Curtis says. "Name your game."'));
  await say(page, dealer.id, 'You look nervous tonight. Deal me in.');
  await page.waitForSelector('#feed .f-cards.open');
  assert.equal(await page.evaluate(() => Game.Pipeline.handKind), 'choose');
  assert.deepEqual(await feedKinds(page), ['input', 'narr', 'table']);
  await page.evaluate(() => Game.Pipeline.abort());
  await idle(page);
});

s.run();
