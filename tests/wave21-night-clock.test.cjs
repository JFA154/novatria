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

s.run();
