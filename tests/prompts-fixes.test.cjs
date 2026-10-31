'use strict';
/* Wave 1, the prompts: what the models read and the mock provider
   (docs/notes/prompts.md; REVIEW sections 2.1, 2.2, 2.6, 3 and 4). The
   narrator packet tells the story (goal and flaw, loose ends from the other
   side, wants and traits, open threads and obligations, town news, how long
   the action takes, the date); the style check misfires less and says which
   problems are worth a rewrite; a name nobody has is caught in code; the
   parser hears the last turn and a rubric and answers moveWhen, aboutIds and
   gamble; the bookkeeper has its rubric, three new fields and a mock that
   reacts to what happened; rumours spread. Mock mode throughout.
   Run with: node tests/run.cjs prompts */
const assert = require('assert/strict');
const { suite, quickStart, sendText, fixtures, place, LAPTOP } = require('./helpers.cjs');

const s = suite('prompts-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const line = (packet, label) => packet.split('\n').find(l => l.startsWith(label + ':')) || '';
const labels = packet => packet.split('\n').map(l => (/ · Location: /.test(l) ? 'CLOCK' : l.split(':')[0]));
/* A packet for a hand-made turn context (the scene filled as runTurn would). */
const packetFor = (page, ctx) => page.evaluate(c => Game.Pipeline.narratorPacket(Object.assign({ notPresent: [], created: [], due: [] }, c)), ctx || { action: { summary: 'x' } });

s.test('narrator packet: the story first, then the scene, the people, this turn and the rules; the clock has the weekday and date; PLAYER says what they came for and their flaw', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  for (const t of ['I look around', 'I wait a minute', 'I look at the road', 'I look at the sky']) await sendText(page, t);
  const p = await packetFor(page, { action: { summary: 'Reads the notice', actionType: 'look', timeCost: 'instant' }, speech: { mode: 'do' }, input: 'I read the notice' });
  const order = labels(p);
  const at = l => order.indexOf(l);
  assert.equal(order[0], 'STORY SO FAR');
  assert.ok(at('EARLIER') > at('STORY SO FAR') && at('LAST 3 TURNS') > at('EARLIER'), 'chronicle, journal, last turns: ' + order.join(' / '));
  assert.ok(at('CLOCK') > at('LAST 3 TURNS') && at('PLAYER') > at('CLOCK') && at('PRESENT') > at('PLAYER'), 'then the scene and the people');
  assert.equal(at('WHAT PEOPLE KNOW'), at('PRESENT') + 1);
  assert.ok(at('LOOSE ENDS') > at('PRESENT') && at('TIME THIS TAKES') > at('LOOSE ENDS') && at('PLAYER TYPED') > at('TIME THIS TAKES') && at('ACTION') > at('PLAYER TYPED'), 'LOOSE ENDS, then TIME THIS TAKES and PLAYER TYPED before ACTION');
  assert.ok(at('ROLL') > at('ACTION') && at('DUE EVENT') > at('ROLL') && at('MODE') > at('DUE EVENT'));
  assert.equal(order[order.length - 2], 'LENGTH');
  assert.equal(order[order.length - 1], 'VARIETY');
  // The date: day 1 is Thursday 8 October (CONTRACTS section 1; State.dateLine once the engine has it).
  const clock = p.split('\n').find(l => / · Location: /.test(l));
  assert.match(clock, /^DAY 1 \(Thursday 8 October\), [A-Z]+ \((early|mid|late)\) · Location: /);
  const d2 = await page.evaluate(() => { Game.State.apply({ setTime: { day: 2, phase: 'evening', shorts: 2 } }); return Game.Pipeline.narratorPacket({ action: { summary: 'x' } }).split('\n').find(l => / · Location: /.test(l)); });
  assert.match(d2, /^DAY 2 \(Friday 9 October\), EVENING \(late\) · Location: /);
  assert.equal(await page.evaluate(() => [Game.Pipeline.dateText(4), Game.Pipeline.weekdayOf(6)].join(' | ')), 'Sunday 11 October | Tuesday');
  // PLAYER: goal and flaw.
  const st = await page.evaluate(() => ({ goal: Game.state.player.goal, flaw: Game.state.player.flaw }));
  const player = line(p, 'PLAYER');
  assert.ok(player.includes(` Came here to: ${st.goal.charAt(0).toLowerCase() + st.goal.slice(1).replace(/[.!]+$/, '')}.`), player);
  assert.ok(player.includes(` Flaw: ${st.flaw.charAt(0).toLowerCase() + st.flaw.slice(1).replace(/[.!]+$/, '')}.`), player);
  // PLAYER TYPED: the typed words in Do mode; none in Say mode or for a beat.
  assert.equal(line(p, 'PLAYER TYPED'), 'PLAYER TYPED: "I read the notice"');
  const say = await packetFor(page, { action: { summary: 'x', actionType: 'talk' }, speech: { mode: 'say', to: 'everyone' }, input: 'Hello?' });
  assert.equal(line(say, 'PLAYER TYPED'), '');
  const beat = await packetFor(page, { action: { summary: 'x', actionType: 'wait' }, speech: { mode: 'do' }, input: 'You wait and see.', beat: true });
  assert.equal(line(beat, 'PLAYER TYPED'), '');
});

s.test('narrator packet: the full place only on an arrival, a move or a look; MODE epilogue; ASKED ABOUT; TIME THIS TAKES says how long and where in the day it will be', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await fast(page);
  const r = await page.evaluate(() => {
    const P = Game.Pipeline;
    const l = Game.State.loc(Game.state.player.locationId);
    const clock = c => P.narratorPacket(Object.assign({ action: { summary: 'x' } }, c)).split('\n').find(x => / · Location: /.test(x));
    const pk = c => P.narratorPacket(Object.assign({ action: { summary: 'x' } }, c));
    const takes = (cost, time) => { if (time) Game.State.apply({ setTime: time }); return P.timeTakes({ action: { timeCost: cost } }); };
    const other = Game.state.npcs.find(n => Game.presenceOf(n) === 'here' && !Game.State.npcsAt(l.id).includes(n));
    return {
      desc: l.description, name: l.name,
      talk: clock({ action: { summary: 'x', actionType: 'talk' } }), look: clock({ action: { summary: 'x', actionType: 'look' } }),
      move: clock({ action: { summary: 'x', actionType: 'move' } }), arrival: clock({ mode: 'arrival', action: { summary: 'x', actionType: 'move' } }),
      moved: clock({ action: { summary: 'x', actionType: 'talk' }, moved: { fromName: 'a', toName: 'b' } }),
      epi: pk({ mode: 'epilogue', due: [{ text: 'The council votes and the bridge stays open.' }] }),
      about: pk({ action: { summary: 'x', actionType: 'talk', aboutIds: [other.id] } }), other: other.name,
      instant: takes('instant', { day: 1, phase: 'morning', shorts: 0 }), short0: takes('short'),
      short2: takes('short', { day: 1, phase: 'afternoon', shorts: 2 }), shortNight: takes('short', { day: 1, phase: 'night', shorts: 2 }),
      long: takes('long', { day: 1, phase: 'evening', shorts: 0 }), longNight: takes('long', { day: 1, phase: 'night', shorts: 0 }), rest: takes('rest')
    };
  });
  assert.ok(r.talk.endsWith(`· Location: ${r.name}`), 'a talk: the name only: ' + r.talk);
  for (const k of ['look', 'move', 'arrival', 'moved']) assert.ok(r[k].includes(`· Location: ${r.name} — ${r.desc}`), k + ': the full place');
  assert.ok(r.epi.includes('\nMODE: epilogue (ZOOM length). This is an ending: close the threads named in DUE EVENT; the player may keep playing afterwards.\nLENGTH: up to 6 sentences, under 150 words.'), r.epi.slice(-400));
  assert.ok(r.epi.includes('DUE EVENT: The council votes and the bridge stays open. (already true'));
  assert.equal(line(r.about, 'ASKED ABOUT'), `ASKED ABOUT: ${r.other} (talked about, not in the scene)`);
  assert.equal(r.instant, 'a moment, no time passes');
  assert.equal(r.short0, 'a few minutes; it will still be morning (mid)');
  assert.equal(r.short2, 'a few minutes; it will be evening when this is done');
  assert.equal(r.shortNight, 'a few minutes; it will still be night (late)', 'night holds until the player sleeps');
  assert.equal(r.long, 'an hour or more; it will be night when this is done');
  assert.equal(r.longNight, 'an hour or more; it will be morning (day 2, Friday) when this is done');
  assert.equal(r.rest, 'sleep until morning; it will be morning (day 2, Friday) when this is done');
  const p = await packetFor(page, { action: { summary: 'x', timeCost: 'short' } });
  assert.match(p, /\nTIME THIS TAKES: a few minutes; /);
});

s.test('the narrator knows the story: loose ends from the other side (the creditor is no stranger), wants, traits, an attitude word, the look until met, a secret only through revealSecretFor', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'enemy', 'secret'] });
  await fast(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const le = st.player.looseEnds.find(x => x.kind === 'debt');
    const n = G.State.npc(le.npcId);
    G.State.apply({ visits: [{ npcId: n.id, locationId: st.player.locationId }] });
    const p0 = G.Pipeline.narratorPacket({ action: { summary: 'x' } });
    n.metTurn = st.meta.turn;
    const p1 = G.Pipeline.narratorPacket({ action: { summary: 'x' }, revealSecretFor: [n.id] });
    const names = st.player.looseEnds.map(x => G.State.npc(x.npcId).name);
    return { p0, p1, n: { name: n.name, look: n.look, goal: n.goal, secret: n.secret, traits: n.personality, attitude: n.attitude, word: G.State.attitudeWord(n.attitude) }, names, text: le.text, player: st.player.name };
  });
  const loose = line(r.p0, 'LOOSE ENDS');
  assert.ok(loose.startsWith(`LOOSE ENDS: ${r.n.name} is owed money by ${r.player} from before ${r.player} came here, and wants it (here now; ${r.player}'s own words: "${r.text}")`), loose);
  assert.equal(loose.split(' | ').length, 3, 'all three loose ends');
  const know = line(r.p0, 'WHAT PEOPLE KNOW');
  assert.ok(know.endsWith(` Only ${r.names[0]}, ${r.names[1]} and ${r.names[2]} knew of ${r.player} before, as LOOSE ENDS says.`), know);
  const present = line(r.p0, 'PRESENT');
  const mine = present.slice(present.indexOf(r.n.name + ' ('));
  const low = t => t.charAt(0).toLowerCase() + t.slice(1).replace(/\.$/, '');
  assert.ok(mine.includes(`traits: ${r.n.traits.join(', ')}`), mine.slice(0, 300));
  assert.ok(mine.includes(`wants (never say this outright; it steers what they push for and dodge): ${low(r.n.goal)}`));
  assert.ok(mine.includes(`attitude ${r.n.attitude} (${r.n.word})`));
  assert.ok(mine.includes('remembers: tied to ' + r.player + ' by a debt (see LOOSE ENDS)'), 'the loose end memory is kept, from their side');
  assert.ok(mine.includes('look: ' + low(r.n.look)), 'not met face to face yet: the look stays');
  assert.ok(!r.p0.toLowerCase().includes(low(r.n.secret).toLowerCase()), 'no secret without revealSecretFor');
  const mine1 = line(r.p1, 'PRESENT');
  assert.ok(mine1.includes(`secret (it can come out now, if the talk goes there): ${low(r.n.secret)}`), 'the secret, through revealSecretFor');
  assert.ok(!mine1.includes('look: ' + low(r.n.look)), 'met (metTurn): the look goes');
});

s.test('narrator packet: OPEN lists known open threads and open obligations with the due day; TOWN NEWS the last five public items with their day; EARLIER the journal with day and phase; STORY SO FAR with day stamps; CARRYING from the inventory', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  for (const t of ['I look around', 'I wait a minute', 'I look at the road', 'I look at the sky', 'I look at my boots']) await sendText(page, t);
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const t = st.threads.find(x => !/^thr_le_/.test(x.id));
    G.State.apply({ threadUpdates: [{ threadId: t.id, knownToPlayer: true }] });
    const creditor = st.player.looseEnds[0].npcId;
    // The engine's obligations and news (engine-state and engine-world keep them; read straight from the save until then).
    if (typeof G.State.obligations !== 'function') st.player.obligations = [{ id: 'obl_debt_x', kind: 'debt', npcId: creditor, text: 'You owe ' + G.State.npc(creditor).name + ' $400', amount: 400, dueDay: 3, status: 'open' }, { id: 'obl_x', kind: 'promise', npcId: creditor, text: 'ZZmet', status: 'met' }];
    if (!G.State.news) st.news = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, phase: 'morning', text: `News number ${i + 1}.`, factionId: null, public: i !== 6, seen: false }));
    st.journal.push({ turn: 2, text: 'Waited by the pumps.' });
    G.State.apply({ chronicleEntry: { fromTurn: 900, toTurn: 901, summary: 'Day 1: Tester arrived and looked around. Open: the debt.' } });
    G.State.apply({ itemsGained: [{ id: 'item_prepaid_phone', name: 'Prepaid phone', qty: 1 }] });
    const p = G.Pipeline.narratorPacket({ action: { summary: 'x' } });
    return { p, thread: { title: t.title, summary: t.summary }, hasEngine: { obligations: typeof G.State.obligations === 'function', news: !!G.State.news }, creditor: G.State.npc(creditor).name };
  });
  const open = line(r.p, 'OPEN');
  assert.ok(open.startsWith(`OPEN: ${r.thread.title}: ${r.thread.summary.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '')}`), open);
  assert.ok(!open.includes('A debt:'), "a loose end's own thread is under LOOSE ENDS");
  if (!r.hasEngine.obligations) {
    assert.ok(open.includes(`You owe ${r.creditor} $400, due day 3 (Saturday, in 2 days)`), open);
    assert.ok(!open.includes('ZZmet'), 'only open obligations');
  }
  if (!r.hasEngine.news) assert.equal(line(r.p, 'TOWN NEWS'), 'TOWN NEWS: Day 2: News number 2; Day 3: News number 3; Day 4: News number 4; Day 5: News number 5; Day 6: News number 6');
  assert.ok(line(r.p, 'EARLIER').startsWith('EARLIER: Day 1 morning: Arrived'), line(r.p, 'EARLIER'));
  assert.ok(line(r.p, 'EARLIER').includes('Day 1 morning: Waited by the pumps.'));
  assert.equal(line(r.p, 'STORY SO FAR'), 'STORY SO FAR: Day 1: Tester arrived and looked around. Open: the debt.');
  assert.match(line(r.p, 'CARRYING'), /^CARRYING: .*Prepaid phone.*\(nothing else: no (?!.*phone)[a-z, ]+ or money beyond this\)\.$/);
  // The cached blocks: the town says TOWN NEWS wins; the style block carries the WHAT PEOPLE KNOW rules; both byte-stable.
  const sys = await page.evaluate(() => ({ town: Game.Pipeline.townBlock(), town2: Game.Pipeline.townBlock(), style: Game.Style.systemPrompt(), style2: Game.Style.systemPrompt(), know: Game.Style.KNOWLEDGE }));
  assert.ok(sys.town.endsWith('\nAnything under TOWN NEWS in the message is newer than this and wins.'));
  assert.ok(sys.style.includes('\n\n' + sys.know + '\n\nEXAMPLES (from a different town'));
  assert.equal(sys.town, sys.town2);
  assert.equal(sys.style, sys.style2);
});

s.test('Style.check: the misfires on the game\'s own content are gone; each problem is hard or soft; the rewrite note leads with the hard ones and can carry the draft', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.Style;
    const C = (t, o) => S.check(t, Object.assign({ style: 'casual', packet: '' }, o));
    const types = (t, o) => C(t, o).problems.map(p => p.type + (p.hard ? '!' : ''));
    return {
      placeTwice: types('Loretta shrugs. "Try the Riverview Motor Court. Tyler works nights."', { previous: ['"He has a room at the Riverview Motor Court," she says.'], day: 2 }),
      personTwice: types('"Ask Wade Purvis yourself," she says.', { previous: ['"That boat is Wade Purvis\'s business," she says.'], day: 2 }),
      price: types('"Four hundred by Friday," Royce says again.', { previous: ['"You owe me four hundred by Friday."'], day: 2 }),
      habit: types('He shrugs. "Well, my daddy used to say the same thing."', { previous: ['Royce laughs. "My daddy used to say a man who asks is a man who pays."'] }),
      looksLike: types('A man in a pressed shirt looks like a cop. Royce nods at you.'),
      somethingLike: types('The truck is worth something like a hundred bucks. Royce wipes his hands.'),
      wouldLike: types("You'd like a beer, Royce figures."),
      simile: types('Royce grins like a dog with a bone.'),
      asIf: types('Dewayne keeps working as if you are not there. "We close at five."'),
      gossip: types('Loretta sets a glass down. "You hear about the fight at the landing last night?"', { day: 1 }),
      paper: types('"You see what the paper said yesterday about the bridge?" Royce asks.', { day: 1 }),
      sawYou: types('Royce squints. "I saw you last night at the ramp."', { day: 1 }),
      weight: types('You feel the weight of the bag on your shoulder. Royce waits.'),
      mixQuoted: types('"It\'s a mix of both," Royce says.'),
      whatDoQuoted: types('"So what do you do for a living?" Royce asks.'),
      whatDo: types('Royce waits. What do you do?'),
      long95: types(Array(95).fill('mud').join(' ')),
      long106: types(Array(106).fill('mud').join(' ')),
      note: S.regenerationNote(C('The air is thick with smoke. Royce waits. What do you do?').problems, { draft: 'The air is thick with smoke.' }),
      softOnly: S.regenerationNote(C('The air is thick with smoke.').problems),
      hard: C('Royce waits. What do you do?').hard, soft: C('The air is thick with smoke.').hard, okClean: C('Royce nods. "Fine. Twenty bucks."')
    };
  });
  assert.deepEqual(r.placeTwice, [], 'naming a place again is not a habit');
  assert.deepEqual(r.personTwice, [], 'nor a person');
  assert.deepEqual(r.price, [], 'nor restating terms with numbers in them');
  assert.deepEqual(r.habit, ['repeat'], 'a real catchphrase still is (soft)');
  assert.deepEqual(r.looksLike, [], '"looks like a cop" is no simile');
  assert.deepEqual(r.somethingLike, [], '"something like a hundred" is no simile');
  assert.deepEqual(r.wouldLike, [], '"you\'d like a" is no simile');
  assert.deepEqual(r.simile, ['simile'], 'a real simile is, and soft');
  assert.deepEqual(r.asIf, ['simile'], '"as if" is soft');
  assert.deepEqual(r.gossip, [], 'day-1 gossip about last night is no invented past');
  assert.deepEqual(r.paper, [], 'nor what the paper said yesterday');
  assert.deepEqual(r.sawYou, ['past!'], 'having seen the player last night is, and hard');
  assert.deepEqual(r.weight, ['banned'], 'a banned phrase outside quotes is soft');
  assert.deepEqual(r.mixQuoted, [], 'banned phrases are checked outside quotes only');
  assert.deepEqual(r.whatDoQuoted, [], '"what do you do for a living" in dialogue is fine');
  assert.deepEqual(r.whatDo, ['question!'], 'outside dialogue it is hard');
  assert.deepEqual(r.long95, ['length'], '5 over the limit: soft');
  assert.deepEqual(r.long106, ['length!'], 'more than 15 over: hard');
  assert.equal(r.hard, true);
  assert.equal(r.soft, false);
  assert.equal(r.okClean.ok, true);
  assert.equal(r.okClean.hard, false);
  assert.equal(r.note, 'STYLE CHECK FAILED on your last attempt: contains "What do you do". Write it again without that. If you can, also fix: banned phrase "the air is thick with".\nYOUR LAST ATTEMPT (edit it rather than starting over; change only what the problems above need):\nThe air is thick with smoke.');
  assert.equal(r.softOnly, 'STYLE CHECK FAILED on your last attempt: banned phrase "the air is thick with". Write it again without that.');
});

s.test('Style.check catches a name nobody in the town has (a hard problem), and leaves alone the cast, the places, the player, titles, the calendar, sentence starts, shouts and what the packet named', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const none = await page.evaluate(() => Game.Style.check('Earl Hux leans on the counter.').problems.map(p => p.type));
  assert.deepEqual(none, [], 'no game: no name check');
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.Style;
    const st = Game.state;
    const n = st.npcs.find(x => Game.presenceOf(x) === 'here' && x.name.split(' ').length === 2);
    const dead = st.npcs.find(x => Game.presenceOf(x) === 'dead');
    const l = st.locations.find(x => (x.aka || []).some(a => /[A-Z]/.test(a.replace(/^the /, ''))));
    const first = n.name.split(' ')[0];
    const last = n.name.split(' ')[1];
    const names = (t, o) => { const c = S.check(t, Object.assign({ packet: '' }, o)); const p = c.problems.find(x => x.type === 'name'); return p ? { names: p.names, hard: p.hard, detail: p.detail } : null; };
    return {
      invented: names('Earl Hux leans on the counter. "Ask Bobby," he says.'),
      cast: names(`${first} nods. "Ask ${n.name}, or Mr. ${last}." ${dead.name} is buried up the hill. The ${last}s keep to themselves.`),
      place: names(`"Try ${l.name.replace(/^The /, 'the ')} or ${l.aka.find(a => /[A-Z]/.test(a.replace(/^the /, ''))).replace(/^the /, '')}," ${first} says.`),
      player: names(`"Hey, ${st.player.name}," ${first} says. "Come back Thursday, after Christmas, Lord willing. GET OUT of my chair, Sugar."`),
      starts: names('Thank God. Well, maybe. I said no. Nobody moves. "Fine." Sure enough, it rains.'),
      bigEarl: names('Big Earl nods at you.'),
      town: names(`Everybody in ${st.meta.townName} knows the ${(Game.town.map && Game.town.map.riverLabel ? Game.town.map.riverLabel.text : st.meta.townName)}.`),
      packet: names(`${first} shrugs. "No Bobby here."`, { packet: 'PLAYER TYPED: "I ask for Bobby"' }),
      note: S.regenerationNote(S.check('Earl Hux leans on the counter.', { packet: '' }).problems)
    };
  });
  assert.deepEqual(r.invented && r.invented.names, ['Earl', 'Hux', 'Bobby']);
  assert.equal(r.invented.hard, true);
  assert.equal(r.invented.detail, 'names someone or somewhere that does not exist: Earl, Hux, Bobby');
  for (const k of ['cast', 'place', 'player', 'starts', 'town', 'packet']) assert.equal(r[k], null, k + ': ' + JSON.stringify(r[k]));
  assert.deepEqual(r.bigEarl && r.bigEarl.names, ['Big', 'Earl'], 'two unknown capitalised words at a sentence start are a name');
  assert.match(r.note, /^STYLE CHECK FAILED on your last attempt: names someone or somewhere that does not exist: Earl, Hux\. Write it again without that\. Everyone who exists is in CAST and every place in THE TOWN or the packet: use those names, and never give a name to anyone or anywhere else\.$/);
});

s.test('mock narration over many varied turns never trips the style check (names included), never uses a simile, and does not say the same thing every turn', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { seed: 4242, kinds: ['debt', 'secret', 'promise'] });
  await fast(page);
  const fx = await fixtures(page);
  const turns = ['I look around', 'I ask around about work', 'I try to climb the fence', '/look', 'I talk to whoever is here', 'I try to convince them to help me', '"Anybody here hiring?"', 'I wait a minute', '/wait evening', 'I look around', '"You\'re a liar."', 'I buy a lighter', 'I try to sneak out the back'];
  for (const t of turns) await sendText(page, t);
  await place(page, fx.tavern.id, 'evening');
  // Wave 10: a hand at the card table is played by the player; this one stands pat.
  await page.evaluate(() => { Game.State.apply({ cardGame: 'draw' }); Game.Pipeline.hooks.cardsSeats = []; Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; }); // wave 13: five-card draw remembered, heads up
  for (const t of ['I look around', 'I order a beer', 'I talk to the bartender', 'I try to persuade the bartender to tell me about the card game', '"What\'s good here?"', 'I bet $20 at cards', '/rest', 'I look around']) await sendText(page, t);
  const r = await page.evaluate(() => ({
    log: Game.state.log.slice(1).map(e => e.narration),
    style: Game.State.debugLog.filter(x => x.kind === 'style'),
    narrates: Game.Api.Mock.calls.filter(c => c.method === 'narrate').length
  }));
  assert.deepEqual(r.style, [], 'no style problem in any mock narration: ' + JSON.stringify(r.style).slice(0, 400));
  for (const t of r.log) assert.doesNotMatch(t.replace(/"[^"]*"/g, ' '), /\b(?<!(looks?|sounds?|seems?|something|about) )like an?\b|\bas if\b/i, t);
  assert.ok(new Set(r.log).size === r.log.length, 'no narration repeats word for word');
});

s.test('mock narration answers the roll with something concrete, speaks in the addressee\'s voice, works in arrivals, due events and fresh town news', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await fast(page);
  const fx = await fixtures(page);
  await place(page, fx.tavern.id, 'evening');
  const who = await page.evaluate(() => {
    const here = Game.State.npcsAt(Game.state.player.locationId);
    const v = here.find(n => /'[^']+'/.test(n.voice || '')) || here[0];
    return { id: v.id, name: v.name, voice: v.voice };
  });
  // A persuasion that lands: a place and a time.
  await page.evaluate(() => Game.Pipeline.forceNextRoll(19));
  await sendText(page, `I persuade ${who.name} to tell me where the card game is`);
  const won = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration);
  assert.match(won, /(this afternoon|this evening|tonight|in the morning)/, won);
  // Say mode: the addressee answers in their own words (a habit from their voice line).
  await page.evaluate(id => Game.UI && Game.UI.setInputMode ? null : null, who.id);
  const said = await page.evaluate(async id => { await Game.Pipeline.submit('Evening.', { mode: 'say', to: id }); return Game.state.log[Game.state.log.length - 1].narration; }, who.id);
  const habit = (/(?:^|[\s(])'(.+?)'(?=[\s,.;:)!?]|$)/.exec(who.voice) || [])[1];
  assert.ok(said.startsWith(`${who.name} answers you first.`), said);
  if (habit && habit.length <= 40) assert.ok(said.toLowerCase().includes(habit.toLowerCase()), `the voice habit "${habit}" in: ${said}`);
  assert.match(said, new RegExp(`${who.name} says, "`));
  // Fresh public news from today or yesterday comes up in talk (a clause of it), once.
  const news = await page.evaluate(() => {
    const st = Game.state;
    if (Game.State.news) return null;
    st.news = [{ day: st.time.day, phase: st.time.phase, text: 'The council put off the bridge vote, and the mayor walked out', factionId: null, public: true, seen: false }];
    return 'The council put off the bridge vote';
  });
  if (news) {
    await page.evaluate(() => { for (const r of Game.state.rumours) r.heard = true; });
    await sendText(page, `I talk to ${who.name}`);
    const t = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration);
    assert.ok(t.includes('brings up the news: the council put off the bridge vote.'), t);
  }
  // A due event is worked in; an arrival is shown.
  const due = await page.evaluate(() => {
    const st = Game.state;
    const away = st.npcs.find(n => Game.presenceOf(n) === 'here' && !Game.State.npcsAt(st.player.locationId).includes(n) && n.status === 'free');
    Game.State.apply({ visits: [{ npcId: away.id, locationId: st.player.locationId }], sceneChange: { locationId: st.player.locationId, arrived: [away.id], left: [], cause: 'turn' } });
    return away.name;
  });
  await sendText(page, 'I wait a minute');
  const arr = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration);
  assert.ok(arr.includes(`${due} arrives.`), arr);
});

s.test('parse packet and mock parser: LAST TURN, present traits and wants, TIME with the weekday; "ask X about Y" puts Y in aboutIds; "..., then go to Z" is moveWhen after; a walk first is moveWhen before; betting at the bar is gamble with the stake; normaliseParse keeps them', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await fast(page);
  const fx = await fixtures(page);
  await place(page, fx.tavern.id, 'evening');
  await sendText(page, 'I look around');
  const r = await page.evaluate(async () => {
    const G = Game;
    const st = G.state;
    const here = G.State.npcsAt(st.player.locationId);
    const x = here[0];
    const other = st.npcs.find(n => Game.presenceOf(n) === 'here' && !here.includes(n) && n.knownToPlayer !== true && n.name.split(' ').length === 2);
    const bridge = st.locations.find(l => l.discovered && l.type === 'bridge');
    const notBar = st.locations.find(l => l.discovered && l.type !== 'bar' && l.id !== st.player.locationId);
    const parse = async (t, sp) => G.Api.parse(G.Pipeline.parsePacket(t, { speech: sp || { mode: 'do' } }));
    const pk = G.Pipeline.parsePacket('Deal.', { speech: { mode: 'do' } });
    const about = await parse(`I ask ${x.name} about ${other.name}`);
    const after = await parse(`I ask ${x.name} about ${other.name}, then walk to ${bridge.name}`);
    const before = await parse(`I walk to ${bridge.name} and look for some rope`);
    const bet = await parse('I bet $20 at cards');
    const poker = await parse('I play cards for a while');
    const saved = st.player.locationId;
    G.State.apply({ playerLocationId: notBar.id });
    const elsewhere = await parse('I bet $20 at cards');
    G.State.apply({ playerLocationId: saved });
    const norm = G.Pipeline.normaliseParse(Object.assign({}, after, { aboutIds: after.aboutIds.concat(['npc_nobody', x.id]) }));
    const normNoDest = G.Pipeline.normaliseParse({ actionType: 'gamble', summary: 'bets $5 at cards', targets: [], destinationId: null, moveWhen: 'after', aboutIds: [] });
    return {
      text: pk.text, last: st.log[st.log.length - 1].narration, x: { id: x.id, traits: x.personality, goal: x.goal }, other: other.id, bridge: bridge.id,
      about, after, before, bet, poker, elsewhere, norm, normNoDest, schema: G.Api.SCHEMAS.parse_action.properties, parserSys: G.Api.SYSTEM.parser
    };
  });
  assert.ok(r.text.includes(`\nLAST TURN: ${r.last}\n`), 'the parser hears the last narration');
  assert.match(r.text, /\nTIME: day 1 \(Thursday 8 October\), evening \(early\)\n/);
  const present = line(r.text, 'NPCS PRESENT');
  assert.ok(present.includes(`traits: ${r.x.traits.join(', ')}; wants: ${r.x.goal.charAt(0).toLowerCase() + r.x.goal.slice(1).replace(/\.$/, '')}`), present.slice(0, 400));
  assert.deepEqual([r.about.actionType, r.about.targets, r.about.aboutIds, r.about.moveWhen], ['talk', [r.x.id], [r.other], null]);
  assert.deepEqual([r.after.actionType, r.after.targets, r.after.aboutIds, r.after.destinationId, r.after.moveWhen], ['talk', [r.x.id], [r.other], r.bridge, 'after']);
  assert.equal(r.after.timeCost, 'short', 'the walk takes time');
  assert.deepEqual([r.before.actionType, r.before.destinationId, r.before.moveWhen], ['search', r.bridge, 'before']);
  assert.deepEqual([r.bet.actionType, r.bet.summary, r.bet.needsRoll], ['gamble', 'bets $20 at cards', false]);
  assert.deepEqual([r.poker.actionType, r.poker.summary], ['gamble', 'bets $10 at cards']);
  assert.notEqual(r.elsewhere.actionType, 'gamble', 'no game runs there');
  assert.deepEqual([r.norm.moveWhen, r.norm.aboutIds], ['after', [r.other]], 'unknown ids and the targets leave aboutIds');
  assert.deepEqual([r.normNoDest.actionType, r.normNoDest.moveWhen], ['gamble', null], 'no destination, no moveWhen; gamble is a type');
  assert.deepEqual(r.schema.moveWhen.anyOf[0].enum, ['before', 'after']);
  assert.ok(r.schema.actionType.enum.includes('gamble'));
  assert.equal(r.schema.aboutIds.type, 'array');
  for (const bit of ['LAST TURN is what the narrator said just before this', 'DIFFICULTY: easy (8) when most people would manage it; normal (12) when it takes some skill or luck; hard (15) when a professional would sweat, when lying to a police officer, or when asking anything of someone at attitude -25 or below; very_hard (18)', 'STAT: might for force', 'moveWhen to "after"', 'goes in aboutIds, not targets', 'GAMBLE: betting or playing cards']) assert.ok(r.parserSys.includes(bit), 'parser rubric: ' + bit);
});

s.test('record_changes: the three new fields, 45 properties counted the way the API compiles them (limit 46), additionalProperties false and every property required everywhere; the bookkeeper\'s rubric and memory rules', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const r = await page.evaluate(() => ({ schemas: Game.Api.SCHEMAS, sys: Game.Api.SYSTEM.bookkeeper, rules: Game.Api.MEMORY_RULES, record: Game.Api.RECORD_RULES, chron: Game.Api.SYSTEM.chronicle }));
  const walk = (node, where, out) => {
    if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${where}[${i}]`, out));
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      out.props += Object.keys(node.properties || {}).length;
      if (node.additionalProperties !== false) out.bad.push(where + ': additionalProperties');
      if (JSON.stringify(Object.keys(node.properties || {}).sort()) !== JSON.stringify((node.required || []).slice().sort())) out.bad.push(where + ': required');
    }
    for (const k of Object.keys(node)) walk(node[k], `${where}.${k}`, out);
  };
  for (const [name, sc] of Object.entries(r.schemas)) {
    const out = { props: 0, bad: [] };
    walk(sc, name, out);
    assert.deepEqual(out.bad, [], name);
    if (name === 'record_changes') assert.equal(out.props, 45, 'record_changes: 45 counted with nested properties (the live grammar probe passed 46)');
  }
  const rc = r.schemas.record_changes.properties;
  assert.deepEqual(Object.keys(rc.npcFates.items.properties), ['npcId', 'status']);
  assert.deepEqual(rc.npcFates.items.properties.status.enum, ['arrested', 'gone', 'dead', 'hurt']);
  assert.deepEqual(Object.keys(rc.memoriesSettled.items.properties), ['npcId', 'text']);
  assert.equal(rc.obligationsSettled.items.type, 'string');
  assert.deepEqual(Object.keys(rc.newSeeds.items.properties), ['effect', 'triggerType', 'triggerValue']);
  assert.deepEqual(Object.keys(rc.attitudeChanges.items.properties), ['npcId', 'delta']);
  assert.ok(r.sys.includes(r.record) && r.sys.endsWith(r.rules));
  for (const bit of ['itemsGained only for things the player now keeps', 'goldDelta only for money that changed hands', 'npcKnownToPlayer only for people the player met face to face', 'newSeeds is usually empty', 'status resolved only when the narration settles the thread for good', 'clockNudges only when the action plainly helps or hinders the aim of a faction\'s CLOCK', 'npcFates only when the narration shows it happening to someone present', 'memoriesSettled when this turn settles something', 'obligationsSettled: the id of an OPEN obligation']) assert.ok(r.record.includes(bit), 'rubric: ' + bit);
  for (const bit of ['what the player claimed about themselves', 'terms agreed, with the amount and the deadline kept', 'Someone who only saw something serious happen', 'neither is anything already on that person\'s remembers list']) assert.ok(r.rules.includes(bit), 'memory rules: ' + bit);
  assert.ok(r.chron.startsWith("Summarise these turns for the narrator's memory, under 100 words, past tense, full names. Keep every number, deadline, promise, debt, threat, and any lie the player told and to whom. Skip scenery and small talk. End with 'Open:' and what is unresolved."));
});

s.test('bookkeeper packet: present people with their last memories, factions with the running clock and its progress, thread summaries, open obligations by id, town news', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const n = G.State.npcsAt(st.player.locationId)[0];
    G.State.apply({ newMemories: [{ npcId: n.id, text: 'first thing', weight: 2 }, { npcId: n.id, text: 'second thing', weight: 2 }, { npcId: n.id, text: 'third thing', weight: 2 }, { npcId: n.id, text: 'fourth thing', weight: 3 }] });
    if (typeof G.State.obligations !== 'function') st.player.obligations = [{ id: 'obl_debt_x', kind: 'debt', npcId: n.id, text: 'You owe them $40', amount: 40, dueDay: 2, status: 'open' }];
    if (!G.State.news) st.news = [{ day: 1, phase: 'morning', text: 'The ferry bell rang at dawn.', public: true }];
    G.State.apply({ clockFill: [{ factionId: st.factions[0].id, delta: 2 }] });
    const p = G.Pipeline.bookkeeperPacket({ action: { summary: 'x', actionType: 'talk', targets: [n.id] }, presentIds: [n.id], narration: 'x', input: 'x', speech: { mode: 'do' } });
    const f = st.factions[0];
    const c = G.World.activeClock(f);
    return { p, n: n.id, f: { id: f.id, name: f.name, label: c.label, filled: c.filled, segments: c.segments }, t: st.threads[0], engine: { obl: typeof G.State.obligations === 'function', news: !!G.State.news } };
  });
  const present = line(r.p, 'NPCS PRESENT');
  assert.ok(present.includes('remembers: second thing / third thing / fourth thing') && !present.includes('first thing'), present);
  assert.ok(line(r.p, 'FACTIONS').includes(`${r.f.id} — ${r.f.name}; clock "${r.f.label}" ${r.f.filled}/${r.f.segments}`), line(r.p, 'FACTIONS'));
  assert.ok(line(r.p, 'THREADS').includes(`${r.t.id} — ${r.t.title} (${r.t.status}; player does not know it yet): ${r.t.summary.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '')}`));
  if (!r.engine.obl) assert.ok(r.p.includes(`\nOPEN OBLIGATIONS (obligationsSettled takes these ids): obl_debt_x — You owe them $40, due day 2 (Friday, tomorrow) [${r.n}]`), r.p.slice(-600));
  if (!r.engine.news) assert.ok(r.p.includes('\nTOWN NEWS: Day 1: The ferry bell rang at dawn'));
});

s.test('mock bookkeeper: Say-mode insults by what they say, buying only where it is sold and open, a drink had and a meal eaten, stealing, giving and paying a debt, an apology settling a grudge, a knockout, a faction helped; memories in the MEMORY_RULES form; the new fields only once the engine reads them', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const fx = await fixtures(page);
  const r = await page.evaluate(async fx => {
    const G = Game;
    const st = G.state;
    const added = [];
    for (const k of ['npcFates', 'memoriesSettled', 'obligationsSettled']) if (!G.State.RECORD_KEYS.includes(k)) { G.State.RECORD_KEYS.push(k); added.push(k); }
    const book = async ctx => G.Api.Mock.bookkeep({ context: Object.assign({ notPresent: [], narration: '' }, ctx) }).then(x => x.result);
    const here = () => G.State.npcsAt(st.player.locationId);
    const out = {};
    const n = here()[0];
    const ctx = (input, actionType, extra) => Object.assign({ input, action: { summary: input, actionType, targets: [n.id] }, presentIds: here().map(x => x.id), speech: { mode: 'do' } }, extra || {});
    out.liar = await book(ctx("You're a liar.", 'intimidate', { speech: { mode: 'say', to: n.id } }));
    out.off = await book(ctx('Fuck off.', 'talk', { speech: { mode: 'say', to: n.id } }));
    out.wordInsult = await book(ctx('I insult you.', 'talk', { speech: { mode: 'say', to: n.id } }));
    out.doInsult = await book(ctx(`I insult ${n.name}`, 'intimidate'));
    G.State.apply({ newMemories: [{ npcId: n.id, text: 'insulted me', weight: 2 }] });
    out.sorry = await book(ctx(`I apologize to ${n.name}`, 'talk'));
    out.lighterHere = await book(ctx('I buy a lighter', 'buy'));
    out.knockout = await book(ctx(`I knock ${n.name} out`, 'attack', { roll: { success: true, tier: 'success' } }));
    out.helps = null;
    const member = here().find(x => x.factionId && G.World.activeClock(G.State.faction(x.factionId)));
    if (member) out.helps = { r: await book(Object.assign(ctx(`I help ${member.name.split(' ')[0]} load the boat`, 'other'), { action: { summary: 'x', actionType: 'other', targets: [member.id] } })), fac: member.factionId };
    // Paying a debt: the obligation and the memory of it are settled.
    const creditor = st.player.looseEnds[0].npcId;
    G.State.apply({ visits: [{ npcId: creditor, locationId: st.player.locationId }], newMemories: [{ npcId: creditor, text: 'owes me $40 by Friday', weight: 3 }], goldDelta: 100 });
    const obl = typeof G.State.obligations === 'function' ? (G.State.obligations('open') || []).find(o => o.npcId === creditor && o.kind === 'debt') : null;
    if (!obl) st.player.obligations = [{ id: 'obl_debt_test', kind: 'debt', npcId: creditor, text: 'You owe them $40', amount: 40, dueDay: 3, status: 'open' }];
    const oblId = obl ? obl.id : 'obl_debt_test';
    const pay = { input: `I pay ${G.State.npc(creditor).name} $40`, action: { summary: 'x', actionType: 'give', targets: [creditor] }, presentIds: here().map(x => x.id), speech: { mode: 'do' } };
    out.pay = await book(pay);
    out.oblId = oblId;
    const knife = st.player.inventory[0];
    out.give = await book({ input: `I give ${n.name} my ${knife.name.toLowerCase()}`, action: { summary: 'x', actionType: 'give', targets: [n.id], usesItemId: knife.id }, presentIds: here().map(x => x.id), speech: { mode: 'do' } });
    out.knife = knife;
    // Stealing.
    out.stealOk = await book(ctx(`I steal the keys from ${n.name}`, 'steal', { roll: { success: true, tier: 'success' } }));
    out.stealBad = await book(ctx(`I steal the keys from ${n.name}`, 'steal', { roll: { success: false, tier: 'failure' } }));
    // At a shut place, or one that does not sell it: nothing. At the bar: a beer is had, not carried.
    const bridge = st.locations.find(l => l.discovered && l.type === 'bridge');
    G.State.apply({ playerLocationId: bridge.id });
    out.lighterBridge = await book({ input: 'I buy a lighter', action: { summary: 'x', actionType: 'buy', targets: [] }, presentIds: [], speech: { mode: 'do' } });
    G.State.apply({ playerLocationId: fx.tavern.id });
    out.beer = await book({ input: 'I order a beer', action: { summary: 'x', actionType: 'buy', targets: [] }, presentIds: [], speech: { mode: 'do' } });
    G.State.apply({ hpDelta: -2 });
    out.food = await book({ input: 'I eat a catfish basket', action: { summary: 'x', actionType: 'buy', targets: [] }, presentIds: [], speech: { mode: 'do' } });
    G.State.loc(fx.tavern.id).closed = true;
    out.shut = await book({ input: 'I order a beer', action: { summary: 'x', actionType: 'buy', targets: [] }, presentIds: [], speech: { mode: 'do' } });
    G.State.loc(fx.tavern.id).closed = false;
    for (const k of added) G.State.RECORD_KEYS.splice(G.State.RECORD_KEYS.indexOf(k), 1);
    out.gated = added.length ? Object.keys(await book(ctx('hello', 'talk'))) : null;
    out.schemaKeys = Object.keys(G.Api.SCHEMAS.record_changes.properties);
    out.n = n.id;
    out.creditor = creditor;
    out.price = { lighter: G.Tables.price('Lighter') };
    return out;
  }, fx);
  const mem = x => x.newMemories.map(m => `${m.text}|${m.weight}`);
  assert.deepEqual([r.liar.attitudeChanges, mem(r.liar)], [[{ npcId: r.n, delta: -15 }], ['called me a liar|2']]);
  assert.deepEqual(mem(r.off), ['told me to fuck off|2']);
  assert.deepEqual(r.wordInsult.newMemories, [], 'Say mode: the word "insult" is not an insult');
  assert.deepEqual(mem(r.doInsult), ['insulted me|2'], 'Do mode: "I insult X" still is');
  assert.deepEqual(r.sorry.memoriesSettled, [{ npcId: r.n, text: 'insulted me' }], 'an apology settles the grudge');
  assert.deepEqual([r.lighterHere.goldDelta, r.lighterHere.itemsGained], [-r.price.lighter, ['Lighter']], 'a lighter at the station');
  assert.deepEqual(r.knockout.npcFates, [{ npcId: r.n, status: 'hurt' }]);
  assert.deepEqual(mem(r.knockout), ['attacked me|3']);
  if (r.helps) assert.deepEqual(r.helps.r.clockNudges, [{ factionId: r.helps.fac, delta: 1 }]);
  assert.deepEqual([r.pay.goldDelta, r.pay.obligationsSettled, r.pay.memoriesSettled], [-40, [r.oblId], [{ npcId: r.creditor, text: 'owes me $40 by Friday' }]]);
  assert.deepEqual(mem(r.pay), ['paid me back $40|2']);
  assert.deepEqual([r.give.itemsLost, mem(r.give)], [[r.knife.id], [`gave me ${/^[aeiou]/i.test(r.knife.name) ? 'an' : 'a'} ${r.knife.name.charAt(0).toLowerCase() + r.knife.name.slice(1)}|2`]]);
  assert.deepEqual(r.stealOk.itemsGained, ['Keys']);
  // Changed by design in wave 5 (playtest D7): in their words, about the player.
  assert.deepEqual(mem(r.stealBad), ['Tester tried to steal from me|3']);
  assert.deepEqual([r.lighterBridge.goldDelta, r.lighterBridge.itemsGained], [null, []], 'nobody sells a lighter at the bridge');
  assert.ok(r.beer.goldDelta < 0 && r.beer.itemsGained.length === 0 && /^Had /.test(r.beer.journalEntry), 'a beer is had: ' + JSON.stringify(r.beer));
  assert.ok(r.food.goldDelta < 0 && r.food.hpDelta === 1 && /^Ate /.test(r.food.journalEntry), 'a meal eaten: ' + JSON.stringify(r.food));
  assert.equal(r.shut.goldDelta, null, 'nothing is sold through a shut door');
  for (const k of Object.keys(r.liar)) assert.ok(r.schemaKeys.includes(k), 'mock key in the schema: ' + k);
  if (r.gated) for (const k of ['npcFates', 'memoriesSettled', 'obligationsSettled']) assert.ok(!r.gated.includes(k), 'not sent before the engine reads it: ' + k);
});

s.test('mock chronicle: the day stamp first, "Open:" last, under 100 words', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ turn: i + 1, day: i < 6 ? 1 : 2, phase: 'morning', input: 'I look around at everything there is to see in this place for a long while', narration: 'x' }));
    return Game.Api.chronicle(entries);
  });
  assert.match(r, /^Days 1-2 \(turns 1 to 10, mock chronicle\): /);
  assert.match(r, / Open: a debt\.$/);
  assert.ok(r.split(/\s+/).length < 100, r.split(/\s+/).length + ' words');
});

s.test('rumours spread: a teller knows a starting rumour; after day 2 a gossip and the source\'s household do; the source still comes first; one fresh rumour a turn', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const rum = st.rumours.find(x => !Number.isInteger(x.addedTurn) && x.sourceNpcId && (G.State.npc(x.sourceNpcId).relations || []).length);
    const src = G.State.npc(rum.sourceNpcId);
    const kin = st.npcs.find(n => n.id !== src.id && ((src.relations || []).some(x => x.npcId === n.id && ['wife', 'husband', 'son', 'daughter'].includes(x.relation)) || (n.home && src.home && n.home.locationId === src.home.locationId)));
    const stranger = st.npcs.find(n => Game.presenceOf(n) === 'here' && n.id !== src.id && n !== kin && !n.factionId && !(n.tags || []).includes('gossip') && !(n.home && src.home && n.home.locationId === src.home.locationId));
    const teller = stranger;
    const out = { own: G.Pipeline.wouldKnow(src, rum), strangerDay1: G.Pipeline.wouldKnow(stranger, rum), kinDay1: kin ? G.Pipeline.wouldKnow(kin, rum) : null };
    const copy = Object.assign({}, rum, { tellerIds: [teller.id] });
    out.teller = G.Pipeline.wouldKnow(teller, copy);
    stranger.tags = (stranger.tags || []).concat(['gossip']);
    out.gossipDay1 = G.Pipeline.wouldKnow(stranger, rum);
    G.State.apply({ setTime: { day: 3, phase: 'morning' } });
    out.gossipDay3 = G.Pipeline.wouldKnow(stranger, rum);
    out.kinDay3 = kin ? G.Pipeline.wouldKnow(kin, rum) : null;
    stranger.tags = stranger.tags.filter(t => t !== 'gossip');
    out.plainDay3 = G.Pipeline.wouldKnow(stranger, rum);
    return out;
  });
  assert.equal(r.own, 3);
  assert.equal(r.strangerDay1, 0);
  assert.equal(r.teller, 2, 'a teller (tellerIds) knows it');
  assert.equal(r.gossipDay1, 0, 'not on day 1');
  assert.equal(r.gossipDay3, 1, 'a gossip knows it after day 2');
  if (r.kinDay1 !== null) { assert.equal(r.kinDay1, 0); assert.equal(r.kinDay3, 1, 'the household knows it after day 2'); }
  assert.equal(r.plainDay3, 0);
});

// ----- Wave 2 (docs/notes/prompts.md, "Wave 2") -----

s.test('wave 2, Style.check: brands and regional words are not invented names; a lone unknown capitalised word is soft (noted, never a paid rewrite) unless something marks it as a person or a place', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const r = await page.evaluate(() => {
    const S = Game.Style;
    const names = t => S.check(t, { packet: '', style: 'casual' }).problems.filter(p => p.type === 'name').map(p => (p.hard ? 'HARD ' : 'soft ') + p.names.join(','));
    const review = ['Royce sets a Mountain Dew on the counter.', 'Loretta pours you a Dr Pepper.', 'Loretta grabs a Dr. Pepper.', 'Royce pushes back his John Deere cap.', 'Wade spits Skoal into a cup.',
      'Dewayne flicks a Bic lighter.', 'Kaylee drinks a Sprite.', 'He came up from the Delta.', 'Loretta keeps tips in a Mason jar.', 'The Saints lost again.', 'Royce talks about the Ole Miss game.'];
    return {
      review: review.map(t => [t, names(t)]),
      lone: names('Royce hands you a Yoo-hoo from the cooler.'),
      startLone: names('The Shack is closed on Sundays.'),
      pair: names('Royce opens a Coke Zero.'),
      invented: names('Earl Hux leans on the counter. "Ask Bobby," he says.'),
      title: names('Miss Earline waves from the porch.'),
      kin: names('Royce mentions his cousin Darnell.'),
      place: names('Down at the Shack they serve catfish.'),
      possessive: names('You could try Earl\'s place.'),
      speech: names('Loretta says Bobby nods at you.'),
      vocative: names('"Hey, Bobby," Royce says.'),
      firm: names('Royce works for Tri-State Gas now.'),
      softOnly: S.check('Royce hands you a Yoo-hoo from the cooler.', { packet: '' }),
      phrases: S.BRAND_PHRASES.includes('Mountain Dew') && S.NAME_ALLOW.has('Skoal') && !S.NAME_ALLOW.has('Wendy')
    };
  });
  for (const [t, p] of r.review) assert.deepEqual(p, [], t);
  assert.deepEqual(r.lone, ['soft Yoo-hoo'], 'a brand nobody listed: soft');
  assert.deepEqual(r.startLone, ['soft Shack'], '"The X" at a sentence start: one word, soft');
  assert.deepEqual(r.pair, ['soft Zero'], 'a known brand beside an unknown word: soft');
  assert.deepEqual(r.invented, ['HARD Earl,Hux,Bobby'], 'two unknown words together, and a name after "Ask"');
  for (const k of ['title', 'kin', 'place', 'possessive', 'speech', 'vocative', 'firm']) assert.match(String(r[k]), /^HARD /, k + ': ' + r[k]);
  assert.equal(r.softOnly.hard, false, 'no paid rewrite for a lone brand');
  assert.equal(r.softOnly.ok, false, 'but it is noted');
  assert.match(r.softOnly.problems[0].detail, /capitalises a word the town does not have \(fine for a brand or a thing, not for a person or a place\): Yoo-hoo/);
  assert.ok(r.phrases, 'brands and phrases are listed; a brand that is also a first name is not');
});

s.test('wave 2, mock parser: a walk names a place, never the person in its name; an undiscovered home is asked about, not walked to; walking where you are is a look; watching is not a walk; /fact never takes a family name alone', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'secret', 'promise'] });
  await fast(page);
  const parse = (text, opts) => page.evaluate(async ([text, opts]) => {
    const fact = opts && opts.fact;
    const pk = Game.Pipeline.parsePacket(text, fact ? { mode: 'fact' } : { speech: { mode: 'do' } });
    const r = (await Game.Api.Mock.parse(pk)).result;
    return { a: r.actionType, d: r.destinationId, t: r.targets, tc: r.timeCost };
  }, [text, opts || null]);
  await place(page, 'loc_low_water');
  assert.deepEqual(await parse("I walk to Pittman's"), { a: 'move', d: 'loc_pittmans', t: [], tc: 'short' }, 'the station, not Royce Pittman');
  assert.deepEqual(await parse("back to Pittman's"), { a: 'move', d: 'loc_pittmans', t: [], tc: 'short' });
  assert.deepEqual(await parse('I go to Riverbend'), { a: 'move', d: 'loc_riverbend', t: [], tc: 'short' }, 'a place by its other name');
  assert.deepEqual(await parse("I walk over to Hollis's pawn shop"), { a: 'move', d: 'loc_byrds_pawn', t: [], tc: 'short' }, 'nobody looked for in an owner\'s possessive');
  assert.deepEqual(await parse('I walk to Sturdivant House'), { a: 'move', d: 'loc_sturdivant_house', t: [], tc: 'short' }, 'Vada is not asked for');
  // Homes nobody has told the player about: the move names the home, and the engine says to ask around.
  assert.equal((await parse('I walk to the Pittman Place')).d, 'loc_pittman_place');
  assert.equal((await parse("I walk to Dewayne's house")).d, 'loc_mangum_house');
  assert.equal((await parse("I go to Royce's place")).d, 'loc_pittman_place');
  assert.equal((await parse("I walk to Tammy's trailer")).d, 'loc_lott_trailer');
  assert.deepEqual(await parse('I walk to the Low Water'), { a: 'look', d: null, t: [], tc: 'instant' }, 'already here: a look');
  assert.deepEqual(await parse('I watch who comes and goes'), { a: 'look', d: null, t: [], tc: 'short' }, 'watching is a look that takes a while');
  assert.deepEqual((await parse('Dewayne Mangum owes me fifty dollars', { fact: true })).t, ['npc_dewayne'], 'not Mavis Mangum too');
  const r = await page.evaluate(async () => {
    const before = Game.state.meta.turn;
    const at = Game.state.player.locationId;
    await Game.Pipeline.submit("I walk to Dewayne's house", { mode: 'do' });
    const notices = [...document.querySelectorAll('#feed .f-notice')].map(n => n.textContent);
    return { notice: notices[notices.length - 1] || '', turn: Game.state.meta.turn - before, still: Game.state.player.locationId === at };
  });
  assert.match(r.notice, /You don't know where that is yet\. Ask around\./);
  assert.deepEqual([r.turn, r.still], [0, true], 'nothing spent, nobody moved');
  // A real walk to the station: no "Royce Pittman is not here" on the way.
  await sendText(page, "I walk to Pittman's");
  const walk = await page.evaluate(() => ({ at: Game.state.player.locationId, text: Game.state.log[Game.state.log.length - 1].narration }));
  assert.equal(walk.at, 'loc_pittmans');
  assert.doesNotMatch(walk.text, /is not here/);
  await sendText(page, "I walk to Pittman's");
  const stay = await page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration);
  assert.match(stay, /^You take in Pittman's Gas and Service\./, 'walking to where you are: a look');
  assert.doesNotMatch(stay, /do not find it/);
});

s.test('wave 2, mock narration: no "null" on a card game, no game without a dollar, a barred door is a ban, the answer survives arrivals and a roll, due events told to "you", and the chronicle never cuts a quote mid-word', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'secret', 'promise'], bgIndex: 5 });
  await fast(page);
  const last = () => page.evaluate(() => Game.state.log[Game.state.log.length - 1].narration);
  await place(page, 'loc_low_water', 'evening');
  // Two hands (changed by design in wave 10: five-card draw at a table; the demo names the hands): never "null".
  for (const choice of [{ hold: 'all' }, { fold: true }]) {
    await page.evaluate(c => { Game.State.apply({ cardGame: 'draw' }); Game.Pipeline.hooks.cardsSeats = []; Game.Pipeline.hooks.cardsPlay = c; }, choice); // wave 13: five-card draw remembered, heads up
    await sendText(page, 'I bet $20 at cards');
    const t = await last();
    assert.doesNotMatch(t, /\bnull\b/, t);
    assert.match(t, /At Curtis Pruett's (Friday game at the back table|table), (your .+ beats Curtis Pruett's .+, and you come out \$\d+ ahead|Curtis Pruett's .+ beats your .+, and you lose \$\d+|your .+ ties Curtis Pruett's .+, and you split the pot|you fold your .+ and give up \$\d+)\./, t);
  }
  // No money: no game.
  await page.evaluate(() => Game.State.apply({ goldDelta: -Game.state.player.gold }));
  await sendText(page, 'I bet $20 at cards');
  const broke = await last();
  assert.match(broke, /You don't have a dollar to put up, so there is no game for you tonight\./, broke);
  assert.doesNotMatch(broke, /you are in|dealt into/);
  // Barred from a place: not "shut".
  await place(page, 'loc_pittmans');
  await page.evaluate(() => Game.State.apply({ effects: [{ op: 'banFrom', locationId: 'loc_low_water', days: 3, byNpcId: 'npc_curtis' }] }));
  await sendText(page, 'I walk to the Low Water');
  const barred = await last();
  // Changed by design in wave 5: "until Day 9", as the player reads it everywhere.
  assert.match(barred, /You make your way to the Low Water, but you are not welcome there until Day \d+\./, barred);
  // Say: someone arrives and the plea rolls, and the answer is still told, before the arrival.
  const who = await page.evaluate(() => {
    const st = Game.state;
    const S = Game.State;
    const open = l => !l.away && l.discovered !== false && !l.closed && !(typeof S.isBanned === 'function' && S.isBanned(l.id)) && !(typeof S.isClosed === 'function' && S.isClosed(l));
    const spot = st.locations.find(l => open(l) && S.npcsAt(l.id).length);
    S.apply({ playerLocationId: spot.id });
    const here = S.npcsAt(st.player.locationId)[0];
    const away = st.npcs.find(n => Game.presenceOf(n) === 'here' && n.status === 'free' && !Game.State.npcsAt(st.player.locationId).includes(n));
    Game.State.apply({ visits: [{ npcId: away.id, locationId: st.player.locationId }], sceneChange: { locationId: st.player.locationId, arrived: [away.id], left: [], cause: 'turn' } });
    return { id: here.id, name: here.name, came: away.name };
  });
  await page.evaluate(() => Game.Pipeline.forceNextRoll(15));
  const said = await page.evaluate(async id => { await Game.Pipeline.submit('Please, help me out here.', { mode: 'say', to: id }); return Game.state.log[Game.state.log.length - 1].narration; }, who.id);
  assert.match(said, /roll, /, said);
  assert.ok(said.includes(`${who.name} answers you first.`) && said.includes(`${who.name} says, "`), said);
  assert.ok(said.indexOf(`${who.name} says, "`) < (said.indexOf(`${who.came} arrive`) >>> 0), 'the answer before the arrival: ' + said);
  // A due event written about the player by name is told to them.
  await page.evaluate(() => {
    const name = Game.state.player.name;
    Game.State.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_test_you', cause: 'A test.', effect: `Royce Pittman walks up to ${name}, reads ${name}'s name off a folded paper, and says ${name} is welcome back any time.`, trigger: { type: 'day', value: 1 }, fired: false, hidden: true } }] });
    Game.World.fireSeeds({});
  });
  await sendText(page, 'I wait a minute');
  const due = await last();
  assert.match(due, /walks up to you, reads your name off a folded paper, and says you are welcome back any time\./, due);
  // The chronicle: quotes end on a whole word, and nothing is cut inside them.
  const chron = await page.evaluate(async () => {
    const input = 'Do you know who sold Amber Lott the pills that killed her last August, out at Riverbend, and why nobody did a thing?';
    const entries = Array.from({ length: 6 }, (_, i) => ({ turn: i + 1, day: 2, phase: 'evening', input, mode: 'say', to: 'npc_loretta', toName: 'Loretta Gaddis', narration: 'x' }));
    return { input, text: (await Game.Api.Mock.chronicle(entries)).result };
  });
  const quotes = chron.text.match(/"[^"]*"/g) || [];
  assert.ok(quotes.length >= 1, chron.text);
  for (const q of quotes) {
    const inner = q.slice(1, -1).replace(/…$/, '');
    assert.ok(chron.input.startsWith(inner), q);
    assert.match(chron.input.slice(inner.length), /^([\s,.?!]|$)/, 'cut at a word: ' + q);
  }
  assert.equal((chron.text.match(/"/g) || []).length % 2, 0, 'no quote left open');
});

s.run();
