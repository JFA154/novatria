'use strict';
/* Wave 25 (1 Nov 2026): the story brought Jodie to the player's motel room
   ("two quick knocks, and Jodie slips in") but the engine's scene had her on
   her schedule, so she was not in the Say chips. A narrated arrival of a known
   person where the player stands is now a visit for this phase. Mock mode.
   Run with: node tests/run.cjs wave25 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, LAPTOP } = require('./helpers.cjs');

const s = suite('wave25-arrivals');
const chips = page => page.evaluate(() => [...document.querySelectorAll('.say-chip')].map(b => b.dataset.to));
const hereIds = page => page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId, Game.state.time.phase).map(n => n.id));

/* Someone known and free who is not here this phase, and a place where the player is. */
async function absentPerson(page) {
  return page.evaluate(() => {
    const s = Game.state; const here = Game.State.npcsAt(s.player.locationId, s.time.phase).map(n => n.id);
    const n = s.npcs.find(x => x.alive !== false && x.status === 'free' && !here.includes(x.id) && !x.unnamed && /^[A-Z][a-z]+ [A-Z]/.test(x.name) && !Game.State.laidUp(x));
    return { id: n.id, name: n.name, first: n.name.split(' ')[0] };
  });
}

s.test('a narrated arrival puts the person in the scene: "Jodie slips in" where the player is makes a visit for this phase; they are in npcsAt and the Say chips, and the debug log says so', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
  const who = await absentPerson(page);
  const before = await hereIds(page);
  assert.ok(!before.includes(who.id));
  await page.evaluate(([first]) => Game.Api.Mock.queue('narrate', `You let yourself in and sit on the bed. About ten minutes later there are two quick knocks, and ${first} slips in with a wet jacket. "We don't have long," ${first} says. "You wanted to talk, so talk."`), [who.first]);
  await sendText(page, 'I go to my room and wait');
  const after = await hereIds(page);
  assert.ok(after.includes(who.id), who.name + ' is here now: ' + JSON.stringify(after));
  await page.evaluate(() => { const b = document.querySelector('#mode-say, [data-mode="say"], button[aria-label="Say"]'); if (b) b.click(); });
  assert.ok((await chips(page)).includes(who.id), 'in the Say chips');
  const dbg = await page.evaluate(() => Game.State.debugLog.filter(d => d.kind === 'arrival').map(d => d.reason));
  assert.ok(dbg.some(t => t.startsWith(who.id + ' walked in by the story')), JSON.stringify(dbg));
  const visits = await page.evaluate(() => (Game.state.visits || []).map(v => `${v.npcId}@${v.locationId}:${v.day}:${v.phase}`));
  assert.ok(visits.some(v => v.startsWith(who.id + '@')), JSON.stringify(visits));
});

s.test('not an arrival: a name in reported speech ("Curtis saw me come in"), a name with no arrival verb, the dead, and someone already here; a full name works like a first name', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
  const who = await absentPerson(page);
  const dead = await page.evaluate(() => { const n = Game.state.npcs.find(x => x.alive === false || x.status === 'dead'); return n ? { id: n.id, first: n.name.split(' ')[0] } : null; });
  await page.evaluate(([first, deadFirst]) => Game.Api.Mock.queue('narrate', `The room smells of rain. "${first} saw me come in," she says, and shrugs. ${first} is not the problem tonight.${deadFirst ? ` ${deadFirst} walks in, people still say, when the wind is off the river.` : ''}`), [who.first, dead ? dead.first : null]);
  await sendText(page, 'I look around the room');
  const here = await hereIds(page);
  assert.ok(!here.includes(who.id), 'reported speech and a bare mention place nobody: ' + JSON.stringify(here));
  if (dead) assert.ok(!here.includes(dead.id), 'the dead do not walk in');
  // The full name, outside quotes, with an arrival verb a few words on.
  await page.evaluate(([name]) => Game.Api.Mock.queue('narrate', `A truck door bangs outside. ${name}, soaked through, comes in without knocking and shuts the door.`), [who.name]);
  await sendText(page, 'I wait');
  assert.ok((await hereIds(page)).includes(who.id), 'the full name counts');
});

s.run();
