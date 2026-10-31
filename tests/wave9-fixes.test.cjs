'use strict';
/* Wave 9: nobody in the scene can see the player's money. The first live
   turns of the round had Jodie say "You've got five bucks left to your name"
   after a $20 tip from $25: the narrator reads the cash on CARRYING (so it
   never invents money) and the narration runs before the bookkeeper. Now the
   packet marks the cash as the player's alone, both style guides forbid
   naming it, and Style.check sends a spoken line that knows the total back
   for a rewrite (docs/notes/prompts.md, Wave 9). Mock mode.
   Run with: node tests/run.cjs wave9 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');

const s = suite('wave9-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const line = (packet, label) => packet.split('\n').find(l => l.startsWith(label + ':')) || '';
const packetFor = (page, ctx) => page.evaluate(c => Game.Pipeline.narratorPacket(Object.assign({ notPresent: [], created: [], due: [] }, c)), ctx);
const check = (page, text, opts) => page.evaluate(([t, o]) => Game.Style.check(t, o), [text, opts || {}]);
const money = (c, n) => c.problems.filter(p => p.type === 'money' && (n === undefined || p.amount === n));

s.test('the style check: a spoken line that knows the player\'s cash (the total, or what is left after the input hands some over) is a hard "money" problem; the player\'s own figure, a price, narration outside quotes and another number are not', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const jodie = 'Jodie looks at the twenty, then at you. "You\'ve got five bucks left to your name and you\'re handing me this?" She folds it into her apron anyway.';
  const tip = { gold: 25, input: 'Okay okay, I took too much of your time. Here\'s a 20$ tip. Thank you very much' };
  let c = await check(page, jodie, tip);
  assert.equal(c.ok, false);
  assert.equal(c.hard, true);
  const m = money(c, 5)[0];
  assert.ok(m && m.hard === true, JSON.stringify(c.problems));
  assert.match(m.detail, /^someone says how much money the player has \("You've got five bucks left to your name/);
  // The total itself: digits, words, with "dollars" or "bucks", hyphenated or not.
  for (const t of [
    'Royce shrugs. "You have $25 and you want a truck?"',
    'Royce shrugs. "Twenty-five dollars is all you\'ve got, friend."',
    'Leon grins. "All you got on you is twenty five bucks."',
    'Leon grins. "Twenty-five bucks in your pocket and big ideas."'
  ]) {
    c = await check(page, t, { gold: 25, input: 'I ask about a truck' });
    assert.equal(money(c, 25).length, 1, t + ' -> ' + JSON.stringify(c.problems));
  }
  // A hundred, in words.
  c = await check(page, 'Hollis sniffs. "A hundred dollars is all you\'ve got to your name."', { gold: 100, input: 'I ask for more time' });
  assert.equal(money(c, 100).length, 1, JSON.stringify(c.problems));
  // What the player would have left after handing over what the input says.
  c = await check(page, 'Hollis counts it. "By my math that leaves you forty bucks on you."', { gold: 100, input: 'I give Hollis sixty dollars' });
  assert.equal(money(c, 40).length, 1, JSON.stringify(c.problems));
  c = await check(page, 'Hollis counts it. "So you\'re down to $40."', { gold: 100, input: 'I hand Hollis $60' });
  assert.equal(money(c, 40).length, 1, JSON.stringify(c.problems));
  // Not a leak: the player said the figure themselves.
  c = await check(page, jodie, { gold: 25, input: 'Here is twenty. I have only five bucks left after this, but take it' });
  assert.equal(money(c).length, 0, 'the player\'s own figure: ' + JSON.stringify(c.problems));
  // Not a leak: a price, with nothing about what the player has.
  c = await check(page, 'Jodie nods at the board. "Coffee\'s five bucks. Refills are free."', { gold: 5, input: 'I ask for coffee' });
  assert.equal(money(c).length, 0, 'a price: ' + JSON.stringify(c.problems));
  // Not a leak: the narrator tells the player, outside quotes.
  c = await check(page, 'You count what is left: five bucks to your name. Jodie wipes the counter.', tip);
  assert.equal(money(c).length, 0, 'narration to the player: ' + JSON.stringify(c.problems));
  // Not a leak: a number that is not the player's total.
  c = await check(page, 'Jodie laughs. "You\'ve got maybe three bucks of sense."', tip);
  assert.equal(money(c).length, 0, 'another number: ' + JSON.stringify(c.problems));
  // Not a leak: no money in the line at all.
  c = await check(page, 'Jodie folds the bill into her apron. "That buys you nothing. Just so we\'re clear."', tip);
  assert.equal(c.ok, true, JSON.stringify(c.problems));
  // A caller that gives no cash gets no check (older callers, the acceptance probes).
  c = await check(page, jodie, {});
  assert.equal(money(c).length, 0);
  // The rewrite note leads with it and adds the plain rule.
  const note = await page.evaluate(ps => Game.Style.regenerationNote(ps), [m]);
  assert.match(note, /^STYLE CHECK FAILED on your last attempt: someone says how much money the player has/);
  assert.match(note, /Nobody can see the player's money: people know only what the player hands over, shows or says/);
});

s.test('the narrator is told the cash is the player\'s alone (CARRYING, WHAT PEOPLE KNOW, both style guides), and a live turn that leaks the total is rewritten once, the clean draft standing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const p = await packetFor(page, { action: { summary: 'Looks around', actionType: 'look', timeCost: 'short' }, speech: { mode: 'do' }, input: 'I look around' });
  const carrying = line(p, 'CARRYING');
  assert.match(carrying, /^CARRYING: .+; cash \$\d+, known to the player alone: people see only what is shown or handed over, and nobody says the total or what is left \(nothing else: no (?:[a-z]+, )*[a-z]+ or money beyond this\)\.$/, carrying);
  assert.match(line(p, 'WHAT PEOPLE KNOW'), /^WHAT PEOPLE KNOW: /);
  for (const style of ['casual', 'literary']) {
    const sys = await page.evaluate(st => Game.Style.systemPrompt(st), style);
    assert.match(sys, /\n- Let anyone know or say how much money the player has or has left: people see only what is handed over or shown\.\n/, style + ' guide');
    assert.match(sys, /What the player carries and how much money they have is theirs alone to know: a person sees only what the player shows, hands over or says/, style + ' knowledge');
  }
  // The real path: the first draft has Royce quote the player's cash; the second is clean.
  const gold = await page.evaluate(() => Game.state.player.gold);
  assert.ok(gold > 0, 'the player has money to leak');
  const leak = `Royce looks you over. "You have $${gold} to your name and you want to talk terms?" He wipes his hands.`;
  const clean = 'Royce looks you over. "Terms, is it?" He wipes his hands and waits.';
  await page.evaluate(([x, y]) => { Game.Api.Mock.clear(); Game.Api.Mock.queue('narrate', x, y); }, [leak, clean]);
  await sendText(page, 'I ask Royce about terms on the truck');
  const r = await page.evaluate(() => ({
    calls: Game.Api.Mock.calls.filter(x => x.method === 'narrate').map(x => x.text),
    last: Game.state.log[Game.state.log.length - 1].narration,
    debug: Game.State.debugLog.filter(d => d.kind === 'style').map(d => ({ attempt: d.attempt, types: (d.problems || []).map(p => p.type), kept: !!d.kept }))
  }));
  assert.equal(r.calls.length, 2, 'the leak is sent back once: ' + JSON.stringify(r.calls.map(t => t.slice(-160))));
  assert.match(r.calls[1], /STYLE CHECK FAILED on your last attempt: someone says how much money the player has \("You have \$\d+ to your name/);
  assert.match(r.calls[1], /Nobody can see the player's money/);
  assert.equal(r.last, clean, 'the clean rewrite stands');
  assert.deepEqual(r.debug.filter(d => d.attempt === 1).map(d => d.types), [['money']], JSON.stringify(r.debug));
  const feed = await page.innerText('#feed');
  assert.ok(!feed.includes(`$${gold} to your name`), 'the leak never reaches the feed');
});

s.run();
