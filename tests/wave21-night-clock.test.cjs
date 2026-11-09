'use strict';
/* Wave 21 (31 Oct 2026): the owner waited until last call with Jodie and the
   clock jumped to the next morning, leaving her out of the scene. Night now
   holds one long action (the small hours) before dawn, and /cheat time may
   go back. Mock mode. Run with: node tests/run.cjs wave21 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, place, LAPTOP } = require('./helpers.cjs');

const s = suite('wave21-night-clock');
const clock = page => page.evaluate(() => { const t = Game.state.time; return `${t.day}:${t.phase}:${t.shorts | 0}${t.late ? ':late' : ''}${t.noSleep ? ':nosleep' : ''}`; });

s.test('a long action at night lands in the small hours (late, no phase passed, the people of the scene still there); the second long, /wait, a rest or a defeat bring the morning', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await place(page, null, 'night');
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
  const r = await page.evaluate(() => {
    const S = Game.State;
    const out = {};
    const a = S.apply({ advanceTime: 'long' }).applied[0];
    out.first = { time: JSON.parse(JSON.stringify(Game.state.time)), text: a };
    out.second = S.apply({ advanceTime: 'long' }).applied[0];
    out.afterSecond = JSON.parse(JSON.stringify(Game.state.time));
    // From a fresh night: /wait's long (cause wait) and a defeat's long go straight to morning.
    S.apply({ setTime: { day: 5, phase: 'night', shorts: 0, late: false } });
    S.apply({ advanceTime: { cost: 'long', cause: 'wait' } });
    out.wait = JSON.parse(JSON.stringify(Game.state.time));
    S.apply({ setTime: { day: 7, phase: 'night', shorts: 0, late: false } });
    S.apply({ advanceTime: { cost: 'long', cause: 'defeat' } });
    out.defeat = JSON.parse(JSON.stringify(Game.state.time));
    S.apply({ setTime: { day: 9, phase: 'night', shorts: 0, late: false } });
    S.apply({ advanceTime: 'rest' });
    out.rest = JSON.parse(JSON.stringify(Game.state.time));
    return out;
  });
  assert.deepEqual(r.first.time, { day: 1, phase: 'night', shorts: 2, late: true }, 'the small hours: ' + JSON.stringify(r.first));
  assert.deepEqual(r.afterSecond, { day: 2, phase: 'morning', shorts: 0, noSleep: true }, 'the second long brings the morning');
  assert.deepEqual(r.wait, { day: 6, phase: 'morning', shorts: 0, noSleep: true }, '/wait passes the night');
  assert.deepEqual(r.defeat, { day: 8, phase: 'morning', shorts: 0 }, 'out cold until morning');
  assert.deepEqual(r.rest, { day: 10, phase: 'morning', shorts: 0 }, 'a rest sleeps');
  // Through a turn: the demo reads "I wait until ..." as a long; at night the scene stays, and so do its people.
  await page.evaluate(() => Game.State.apply({ setTime: { day: 1, phase: 'night', shorts: 0, late: false } }));
  const before = await page.evaluate(() => ({ here: Game.State.npcsAt(Game.state.player.locationId, Game.state.time.phase).map(n => n.id).sort() }));
  await sendText(page, 'I wait until the place empties out');
  const after = await page.evaluate(() => ({ cost: Game.Pipeline.lastTurn.action.timeCost, here: Game.State.npcsAt(Game.state.player.locationId, Game.state.time.phase).map(n => n.id).sort(), divider: [...document.querySelectorAll('#feed .f-divider')].pop().textContent }));
  assert.equal(after.cost, 'long');
  assert.equal(await clock(page), '1:night:2:late');
  assert.deepEqual(after.here, before.here, 'the same people are here');
  assert.ok(!/Day 2/.test(after.divider), 'no new morning: ' + after.divider);
});

s.test('/cheat time goes back as well as forward: a quiet line says what already happened stays, the people of the earlier phase are back, nothing is caught up, and /undo takes it back', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await place(page, null, 'night');
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
  const night = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId, 'night').map(n => n.id).sort());
  await sendText(page, '/cheat time morning 2');
  assert.equal(await clock(page), '2:morning:0');
  const news0 = await page.evaluate(() => Game.state.news.length);
  await sendText(page, '/cheat time night 1');
  assert.equal(await clock(page), '1:night:0');
  const r = await page.evaluate(() => ({ quiet: [...document.querySelectorAll('#feed .f-quiet')].pop().textContent, divider: [...document.querySelectorAll('#feed .f-divider')].pop().textContent, here: Game.State.npcsAt(Game.state.player.locationId, Game.state.time.phase).map(n => n.id).sort(), news: Game.state.news.length, chips: [...document.querySelectorAll('#say-to button, .say-to button, [data-say-to]')].map(b => b.textContent.trim()) }));
  assert.equal(r.quiet, 'Clock set back to Day 1 · Night. What has already happened stays in the story.');
  assert.match(r.divider, /Day 1 · (?:\w+ · )?Night/);
  assert.deepEqual(r.here, night, 'the night crowd is back');
  assert.equal(r.news, news0, 'nothing caught up on the way back');
  await sendText(page, '/undo');
  assert.equal(await clock(page), '2:morning:0');
});

s.test('/cheat success is a success even with a penalty and a hard target: the die that reaches the target, or the 20 when nothing less does; never a partial', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const out = [];
    // Charm -1 and Tired -1 against 18 (the owner's roll): only a 20 reaches 18, and a 20 is a critical.
    for (const [statValue, modifier, target] of [[-1, -1, 18], [0, 0, 12], [2, 0, 15], [-1, -1, 15], [3, 1, 10]]) {
      const die = Game.Pipeline.hooks.dieFor ? Game.Pipeline.hooks.dieFor('success', { stat: 'charm', statValue, modifier, difficulty: 'normal', target }) : null;
      out.push({ statValue, modifier, target, die });
    }
    return out;
  });
  // The hook may not be exposed; then drive it through a real roll with the cheat armed.
  if (r.every(x => x.die === null)) {
    await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.State.apply({ effects: [{ op: 'addCondition', name: 'Tired', effect: '-1 all', days: 1 }] }); });
    const tiers = [];
    for (let i = 0; i < 4; i++) {
      await sendText(page, '/cheat success');
      await sendText(page, i % 2 ? 'I try to talk the barkeep into a free drink' : 'I try to pick the lock on the back door');
      tiers.push(await page.evaluate(() => { const e = Game.state.log[Game.state.log.length - 1]; return e.roll ? e.roll.tier + ' ' + e.roll.line : 'no roll'; }));
    }
    const rolled = tiers.filter(t => t !== 'no roll');
    assert.ok(rolled.length >= 1, 'at least one roll happened: ' + JSON.stringify(tiers));
    for (const t of rolled) assert.match(t, /^(success|critical) /, 'the cheat gives a success: ' + t);
  } else {
    for (const x of r) {
      const total = x.die + x.statValue + x.modifier;
      assert.ok(x.die === 20 || total >= x.target, 'reaches the target or is the 20: ' + JSON.stringify(x));
      assert.ok(x.die >= 2, JSON.stringify(x));
    }
    assert.equal(r[0].die, 20, 'Charm -1, Tired -1 vs 18: only the 20 reaches it');
  }
});

s.test('/fact refuses a question or a how-to at no cost (the owner\'s "/fact how to seduce Jodie"), says what a fact is, and keeps the line in the box; a statement still spends the point', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.State.apply({ storyPointsDelta: 3 }); });
  const pts = await page.evaluate(() => Game.state.player.storyPoints);
  const r = await page.evaluate(async () => {
    const out = [];
    for (const line of ['/fact how to seduce Jodie', '/fact Does Jodie like me?', '/fact what does Curtis want', '/fact tell me about Loretta']) {
      const res = await Game.Pipeline.submit(line);
      out.push({ line, ok: res.ok, reason: res.reason, box: document.getElementById('cmd').value, notice: [...document.querySelectorAll('#feed .f-notice')].pop().textContent, pts: Game.state.player.storyPoints, log: Game.state.log.length });
      document.getElementById('cmd').value = '';
    }
    return out;
  });
  for (const x of r) {
    assert.equal(x.ok, false, x.line); assert.equal(x.reason, 'not-a-fact', x.line);
    assert.match(x.notice, /^A fact is a statement to make true, not a question: \/fact Loretta grew up in Clayburn/, x.line);
    assert.equal(x.pts, pts, 'no point spent: ' + x.line);
  }
  const jodie = await page.evaluate(() => { const n = Game.state.npcs.find(x => /jodie/i.test(x.name)); return n.memories.map(m => m.text); });
  assert.ok(!jodie.some(t => /seduce/i.test(t)), 'nothing on her card: ' + JSON.stringify(jodie));
  await sendText(page, '/fact the mechanic owes me a favour');
  const after = await page.evaluate(() => ({ pts: Game.state.player.storyPoints, last: Game.state.log[Game.state.log.length - 1].input }));
  assert.equal(after.pts, pts - 1, 'a statement spends the point');
  assert.equal(after.last, '/fact the mechanic owes me a favour');
});

s.test('a bookkeeper\'s spend is held only by what the player carries (wave 24: $6,850 handed over goes in full); a gain is still held to $500 a turn, a second gain refused, and more than the cash refused', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.State; const M = { source: 'model', present: [] };
    S.apply({ goldDelta: 10000 - Game.state.player.gold }); // the engine's own op: no cap
    const out = { start: Game.state.player.gold };
    S.apply({ beginTurn: true });
    const a = S.apply({ goldDelta: -6850 }, M); out.big = { applied: a.applied, rejected: a.rejected.map(x => x.reason), gold: Game.state.player.gold };
    S.apply({ beginTurn: true });
    const b = S.apply({ goldDelta: -4200 }, M); out.second = { gold: Game.state.player.gold, rejected: b.rejected.map(x => x.reason) };
    S.apply({ beginTurn: true });
    const c = S.apply({ goldDelta: -5000 }, M); out.tooMuch = { gold: Game.state.player.gold, rejected: c.rejected.map(x => x.reason) };
    S.apply({ beginTurn: true });
    const d = S.apply({ goldDelta: 900 }, M); out.gain = { applied: d.applied, gold: Game.state.player.gold };
    const e = S.apply({ goldDelta: 50 }, M); out.gainAgain = e.rejected.map(x => x.reason);
    return out;
  });
  assert.equal(r.start, 10000);
  assert.deepEqual(r.big.rejected, []); assert.equal(r.big.gold, 3150, JSON.stringify(r.big));
  assert.match(r.second.rejected[0] || '', /cannot afford \$4,?200 \(have \$3,?150\)/, JSON.stringify(r.second)); assert.equal(r.second.gold, 3150);
  assert.match(r.tooMuch.rejected[0] || '', /cannot afford/); assert.equal(r.tooMuch.gold, 3150);
  assert.match(r.gain.applied[0], /gold 3150 -> 3650 \(\+900 held to \+500\)/, JSON.stringify(r.gain));
  assert.match(r.gainAgain[0] || '', /money already gained \$500 this turn/, JSON.stringify(r.gainAgain));
});

s.run();
