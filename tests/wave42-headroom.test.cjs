'use strict';
/* Wave 42: headroom in the narrator's three cached system blocks (the style
   guide with its examples, the town, the cast). The blocks lost what they
   said twice (the place ids, the cast's "History:" label and the full name
   a history opened with, a relation said once per person it covers, the
   NOT IN TOWN head's restatement, KNOWLEDGE's copy of the cash rule, the
   casual DIALOGUE line's copy of the packet's VARIETY rule, the two Say
   examples' addressee in their input). These tests hold that nothing of
   substance went with it: every rule once, every example, every person and
   every place, and a cached prefix that stays byte-stable turn to turn.
   Run with: node tests/run.cjs wave42 */
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave42-headroom');

const count = (text, part) => text.split(part).length - 1;

s.test('the style block, both styles: every guide line, the people note, the fade-to-black rule, the WHAT PEOPLE KNOW rules and the examples heading are there once; the cash, name, length and minor rules once; every example turn once, eight casual and three literary', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.Style;
    const D = Game.data;
    return {
      prompts: { casual: S.systemPrompt('casual'), literary: S.systemPrompt('literary') },
      guides: { casual: D.STYLE_GUIDE_CASUAL, literary: D.STYLE_GUIDE_LITERARY },
      examples: { casual: D.EXAMPLE_TURNS_CASUAL, literary: D.EXAMPLE_TURNS_LITERARY },
      parts: [S.PEOPLE_NOTE, S.FADE_TO_BLACK, S.KNOWLEDGE, S.EXAMPLES_INTRO, S.GOOD_TURN],
      town: Game.Pipeline.townBlock(), cast: Game.Pipeline.castBlock(), castRule: Game.Pipeline.CAST_RULE
    };
  });
  assert.equal(r.examples.casual.length, 8, 'eight casual example turns');
  assert.equal(r.examples.literary.length, 3, 'three literary example turns');
  for (const style of ['casual', 'literary']) {
    const p = r.prompts[style];
    const all = p + '\n' + r.town + '\n' + r.cast;
    // Every line of the guide (its sections, each NEVER rule, the banned list) once.
    for (const line of r.guides[style].split('\n').filter(l => l.trim())) assert.equal(count(p, line), 1, `${style}: once: ${line}`);
    for (const part of r.parts) assert.equal(count(p, part), 1, `${style}: once: ${part.slice(0, 60)}`);
    // The rules the style tests read, each said once across the three blocks.
    assert.equal(count(all, 'Intimate scenes fade to black before anything explicit: the next line is afterwards.'), 1, style + ': fade to black');
    assert.equal(count(all, '- Let anyone know or say how much money the player has or has left: people see only what is handed over or shown.'), 1, style + ': the cash rule');
    assert.equal(count(all, 'has or has left'), 1, style + ': the cash rule is not said twice');
    assert.equal(count(all, 'What the player carries and how much money they have is theirs alone to know: a person sees only what the player shows, hands over or says.'), 1, style + ': what the player carries');
    assert.equal(count(all, '- Mention anything not in the packet. If it isn\'t listed, it isn\'t there.'), 1, style + ': the name rule (the packet)');
    assert.equal(count(all, r.castRule), 1, style + ': the name rule (the cast)');
    assert.equal(count(all, 'never invent anyone else'), 1, style + ': the cast head');
    assert.equal(count(all, 'LENGTH: 2-4 sentences. Up to 6 only when the packet says ZOOM. Stop at the first moment the player must respond.'), 1, style + ': the length rule');
    assert.equal(count(all, 'nobody under 18 ever flirts or is flirted with'), 1, style + ': the minor rule');
    assert.equal(count(all, 'Second person, present tense.'), 1, style + ': the voice rule');
    assert.equal(count(all, 'Never tell the player how to feel.'), 1, style + ': how to feel');
    // Every example turn of the style, whole, once; none of the other style's.
    for (const t of r.examples[style]) assert.equal(count(p, `Input: ${t.input}\n(${t.context})\n${t.narration}`), 1, `${style} example: ${t.input}`);
    assert.equal(count(p, '\n\nInput: '), r.examples[style].length, style + ': the example count');
    for (const t of r.examples[style === 'casual' ? 'literary' : 'casual']) assert.ok(!p.includes(t.narration), style + ': not the other style\'s example');
  }
  // The casual guide keeps its habit rule; the reuse rule is the packet's VARIETY line's, said every turn.
  assert.match(r.guides.casual, /a listed habit is a flavour, not a script: it shows up now and then, never in every line and never two turns running\./);
  assert.ok(!r.guides.casual.includes('Do not reuse a phrase'), 'said by VARIETY, not twice');
  const packet = await page.evaluate(() => Game.Pipeline.narratorPacket({ action: { summary: 'Looks around' } }));
  assert.match(packet, /\nVARIETY: do not repeat a phrase, opener, joke or verbal habit used in LAST 3 TURNS; /);
  // The Say examples: PLAYER SAYS names who it was said to; the input is the words alone.
  for (const t of r.examples.casual.filter(x => /^PLAYER SAYS/m.test(x.context))) {
    assert.ok(!/\(said to /.test(t.input), t.input);
    assert.ok(t.context.includes(`): ${t.input}`), 'the words are in PLAYER SAYS: ' + t.input);
  }
});

s.test('the cast block has everyone, each once, with their ties and their whole history; a relation is said once for all it covers; no "History:" label; the town block has every place and every place out of town with its history and hours, by name, with no ids', async h => {
  const page = await h.open();
  await quickStart(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State;
    return {
      cast: G.Pipeline.castBlock(), town: G.Pipeline.townBlock(), rule: G.Pipeline.CAST_RULE,
      npcs: G.state.npcs.map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, history: n.history || '', here: G.presenceOf(n) === 'here', ties: S.tiesOf(n).isTo.map(x => x.relation) })),
      places: G.state.locations.map(l => ({ id: l.id, name: l.name, away: l.away === true, history: l.history || '', hours: l.hours || '', distance: l.distance || '' }))
    };
  });
  const lines = r.cast.split('\n');
  const ruleAt = lines.indexOf(r.rule);
  const absentAt = lines.indexOf('NOT IN TOWN (they can be talked about, but they never appear): the dead and the people who live elsewhere.');
  assert.ok(ruleAt > 0 && absentAt > ruleAt, 'the cast rule after the people in town, then NOT IN TOWN');
  assert.ok(!r.cast.includes('History:'), 'no History label');
  assert.ok(r.npcs.length >= 60, r.npcs.length + ' people');
  let pronounStarts = 0;
  for (const n of r.npcs) {
    const at = lines.findIndex(l => l.startsWith(`${n.id} — ${n.name} (`));
    assert.ok(at > 0, 'in the cast block: ' + n.id);
    assert.equal(lines.filter(l => l.startsWith(n.id + ' — ')).length, 1, 'once: ' + n.id);
    assert.ok(n.here ? at < ruleAt : at > absentAt, n.id + (n.here ? ' is in town' : ' is under NOT IN TOWN'));
    const line = lines[at];
    if (n.history) {
      const p = { he: 'He', she: 'She' }[n.pronouns];
      const opensWithName = n.history.startsWith(n.name + ' ') && /^[a-z]/.test(n.history.slice(n.name.length + 1));
      const want = p && opensWithName ? `${p} ${n.history.slice(n.name.length + 1)}` : n.history;
      assert.ok(line.endsWith(') ' + want), `${n.id}: the whole history: ${line}`);
      if (want !== n.history) pronounStarts += 1;
    }
    // A relation once in a line, for all it covers.
    const head = line.slice(0, line.indexOf(')' + (n.history ? ' ' : '')) + 1);
    const rels = Array.from(head.matchAll(/(?:; |, )((?:[a-z]+[ -])*[a-z]+) of /g), m => m[1]);
    assert.equal(new Set(rels).size, rels.length, `${n.id}: a relation said twice: ${head}`);
  }
  assert.ok(pronounStarts >= 40, pronounStarts + ' histories open with He or She');
  // Grouped ties read "boss of A, B and C" (Loretta employs three), and "son of A and the late B".
  assert.match(r.cast, /\nnpc_loretta — [^\n]*; boss of [A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+ [A-Z][a-z]+ and [A-Z][a-z]+ [A-Z][a-z]+; /);
  assert.ok(!/\b([a-z]+) of [A-Z][^;)]*?, \1 of /.test(r.cast), 'no "boss of A, boss of B"');
  // The town: every place by name with its history and hours, out of town with its distance; no ids.
  assert.ok(!/\bloc_[a-z0-9_]+/.test(r.town), 'no place ids in the town block');
  const placesLine = r.town.split('\n').find(l => l.startsWith('PLACES (how each came to be; when it is open): '));
  const awayLine = r.town.split('\n').find(l => l.startsWith('OUT OF TOWN (talked about, never a scene; '));
  assert.ok(placesLine && awayLine);
  const entries = placesLine.slice(placesLine.indexOf('): ') + 3).split(' | ');
  const awayEntries = awayLine.slice(awayLine.indexOf('): ') + 3).split(' | ');
  const inTown = r.places.filter(l => !l.away && (l.history || l.hours));
  const away = r.places.filter(l => l.away);
  assert.equal(entries.length, inTown.length, 'every place in town');
  assert.equal(awayEntries.length, away.length, 'every place out of town');
  assert.ok(inTown.length >= 20 && away.length >= 10, `${inTown.length} places, ${away.length} out of town`);
  for (const l of inTown) {
    const e = entries.find(x => x.startsWith(l.name + ': '));
    assert.ok(e, 'in the town block: ' + l.id);
    if (l.history) assert.ok(e.includes(l.history), l.id + ': its history');
    if (l.hours && !/^(a private home|always open)\.?$/i.test(l.hours.trim())) assert.ok(e.includes(`Open: ${l.hours}.`), l.id + ': its hours');
  }
  for (const l of away) {
    const e = awayEntries.find(x => x.startsWith(`${l.name} (${l.distance || 'out of town'}): `));
    assert.ok(e, 'out of town: ' + l.id);
    if (l.history) assert.ok(e.endsWith(l.history), l.id + ': its history');
  }
});

s.test('the cached prefix is byte-stable across 12 mock turns with two moves, /rest and /look: every narration carries the same three blocks', async h => {
  const page = await h.open();
  await quickStart(page);
  await page.evaluate(() => {
    Game.Api.Mock.delay = 0;
    window.__blocks = [];
    const narrate = Game.Api.Mock.narrate;
    Game.Api.Mock.narrate = function (packet) { window.__blocks.push([packet.system, packet.town, packet.cast]); return narrate.apply(this, arguments); };
  });
  const exits = await page.evaluate(() => {
    const S = Game.State;
    const a = S.loc(Game.state.player.locationId);
    const b = S.loc(a.exits.find(id => S.loc(id) && !S.loc(id).away));
    return [b.name, a.name];
  });
  const where = () => page.evaluate(() => Game.state.player.locationId);
  const clock = () => page.evaluate(() => `${Game.state.time.day} ${Game.state.time.phase}`);
  const start = { at: await where(), clock: await clock() };
  const inputs = ['I look around', 'I ask around about work', `I walk to ${exits[0]}`, 'I talk to whoever is here', '/look', '/rest', 'I look around', `I walk to ${exits[1]}`, 'I ask about the bridge', 'I wait a bit', '/rest', 'I ask about the river'];
  const seen = new Set([start.at]);
  for (const t of inputs) { await sendText(page, t); seen.add(await where()); }
  const r = await page.evaluate(() => ({ blocks: window.__blocks, now: [Game.Style.systemPrompt(), Game.Pipeline.townBlock(), Game.Pipeline.castBlock()] }));
  assert.ok(seen.size >= 2, 'the player moved: ' + [...seen].join(', '));
  assert.notEqual(await clock(), start.clock, 'time passed');
  assert.ok(r.blocks.length >= 12, r.blocks.length + ' narrations');
  for (const [i, b] of r.blocks.entries()) {
    assert.equal(b[0], r.blocks[0][0], `turn ${i + 1}: the style block`);
    assert.equal(b[1], r.blocks[0][1], `turn ${i + 1}: the town block`);
    assert.equal(b[2], r.blocks[0][2], `turn ${i + 1}: the cast block`);
  }
  assert.deepEqual(r.blocks[0], r.now, 'what the builders give now');
  assert.ok(r.now.every(x => x.length > 1000));
});

s.run();
