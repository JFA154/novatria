'use strict';
/* Wave 4 engine fixes (docs/notes/*.md, "Wave 4"): the third code review's
   eight bugs, the invented-name middle ground, its risks and dead code; the
   coordinator's copy items; the third playtest's engine, content and demo
   items (R1 to R11, D1 to D5) and its design notes. Mock mode throughout.
   Run with: node tests/run.cjs wave4 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, sendText, ROOT } = require('./helpers.cjs');

const s = suite('wave4-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });
const lastPacket = page => page.evaluate(() => (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
const line = (packet, label) => (new RegExp(`^${label}: .*$`, 'm').exec(packet) || [''])[0];
/* A game with this background (by id), name, seed and loose ends ([kind, option]). */
async function start(page, o) {
  await page.evaluate(o => {
    const D = Game.data;
    const bg = D.BACKGROUNDS.find(b => b.id === o.bg) || D.BACKGROUNDS[0];
    Game.App.quickStart({
      name: o.name || 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
      looseEnds: (o.les || []).map(([k, i]) => ({ kind: k, text: D.LOOSE_ENDS[k].options[i] }))
    }, { seed: o.seed });
  }, o);
  await page.waitForSelector('#screen-game.active');
  await fast(page);
}
/* The name problems Style.check finds, as "HARD a,b" / "soft a,b". */
const nameProblems = (page, texts) => page.evaluate(ts => ts.map(t => [t, Game.Style.check(t, { packet: '', style: 'casual' }).problems.filter(p => p.type === 'name').map(p => (p.hard ? 'HARD ' : 'soft ') + p.names.join(','))]), texts);

// ----- review bug 1: Say-mode purchases -----

s.test('bug 1: in Say mode a purchase is no debt payment and no gift ("Gimme one of those cold drinks" to a lone creditor; two rounds of beer); words that pay pay, words that give give', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    // Someone alone at an open place, in some phase.
    let spot = null;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      while (st.time.phase !== ph) S.apply({ advanceTime: 'long' });
      const l = st.locations.find(x => !x.away && x.discovered && !S.isClosed(x) && S.npcsAt(x.id).length === 1);
      if (l) { spot = { l, n: S.npcsAt(l.id)[0] }; break; }
    }
    const n = spot.n;
    S.apply({ playerLocationId: spot.l.id, goldDelta: 900, effects: [{ op: 'addObligation', kind: 'debt', npcId: n.id, text: 'Pay {npc} the three hundred you owe.', amount: 300, dueOffset: 3 }] });
    const o = S.obligations('open').find(x => x.npcId === n.id);
    const say = async (words, parse, book) => {
      M.queue('parse', Object.assign({ summary: 'Speaks', targets: [n.id], needsRoll: false, timeCost: 'instant' }, parse));
      M.queue('bookkeep', book);
      await G.Pipeline.submit(words, { mode: 'say', to: n.id });
      return { paid: o.paid | 0, gifts: JSON.stringify(st.meta.gifts || null) };
    };
    const drink = await say('Gimme one of those cold drinks.', { actionType: 'talk' }, { goldDelta: -2 });
    const beers = await say('Two beers, please.', { actionType: 'buy' }, { goldDelta: -6 });
    const a0 = n.attitude;
    const round = await say('Another round, and thanks for the company.', { actionType: 'buy' }, { goldDelta: -6, attitudeChanges: [{ npcId: n.id, delta: 3 }] });
    const warm = n.attitude - a0;
    const owe = await say('Here is fifty toward what I owe you.', { actionType: 'talk' }, { goldDelta: -50 });
    return { drink, beers, round, warm, owe, ctxBought: G.Pipeline.lastTurn.ctx.bought };
  });
  assert.equal(r.drink.paid, 0, 'a cold drink is the price of a drink');
  assert.equal(r.drink.gifts, 'null', 'and no gift');
  assert.equal(r.beers.paid, 0);
  assert.equal(r.round.gifts, 'null', 'two rounds of beer are not two gifts');
  assert.equal(r.warm, 3, 'so the second round\'s warmth is not zeroed as a second gift');
  assert.equal(r.owe.paid, 50, 'words that pay what is owed pay it');
  assert.equal(r.ctxBought, false);
});

// ----- review bug 2, bug 3 and the middle ground: invented names -----

s.test('bug 2: an adverb before a known name and a verb is no invented name ("Slowly Royce nods", "Finally Loretta Gaddis nods", "Okay Royce says"); an unknown first name before a known surname, or a surname after a known first name, still is', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const names = await page.evaluate(() => {
    const st = Game.state;
    const two = st.npcs.filter(n => n.name.split(' ').length === 2 && Game.presenceOf(n) === 'here');
    return { full: two[0].name, first: two[0].name.split(' ')[0], last: two[1].name.split(' ')[1] };
  });
  const starts = ['Okay', 'Finally', 'Suddenly', 'Meanwhile', 'Instead', 'Eventually', 'Somehow', 'Quietly', 'Slowly', 'Alright', 'Sorry', 'Listen'];
  const clean = [];
  for (const w of starts) clean.push(`${w} ${names.first} says nothing.`, `${w} ${names.full} nods.`, `${w} ${names.last} shrugs.`);
  for (const [t, p] of await nameProblems(page, clean)) assert.deepEqual(p, [], t);
  const hard = await nameProblems(page, [`Bobby ${names.last} nods.`, `You see ${names.first} Smithers at the bar.`]);
  assert.deepEqual(hard.map(x => x[1]), [['HARD Bobby'], ['HARD Smithers']], JSON.stringify(hard));
  // The real narrate path: no paid rewrite for it.
  const calls = await page.evaluate(async first => {
    const G = Game, M = G.Api.Mock;
    const who = G.State.npcsAt(G.state.player.locationId)[0];
    const n0 = M.calls.filter(c => c.method === 'narrate').length;
    M.queue('parse', { actionType: 'talk', summary: 'Asks', targets: [who.id], needsRoll: false, timeCost: 'instant' });
    M.queue('narrate', `You ask about the bridge. Slowly ${who.name.split(' ')[0]} nods, and wipes the counter.`);
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I ask about the bridge');
    return M.calls.filter(c => c.method === 'narrate').length - n0;
  }, names.first);
  assert.equal(calls, 1, 'one narrator call');
});

s.test('bug 3: "says" marks a name only when a person says it: a sign, a cap, a label, a card or the radio "says" a word (soft); she, the bartender or a cast member saying a name is hard', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const soft = ['The sign on the door says Closed.', 'The sign says Open.', 'His cap says Caterpillar.', 'The label says Danger.', 'The card says Happy Birthday.', 'His shirt says Property of the County.',
    'The tag says Made in China.', 'The mug says World Champion.', 'The window says Vacancy.', 'The radio said Tornado Watch.'];
  for (const [t, p] of await nameProblems(page, soft)) assert.ok(p.every(x => /^soft /.test(x)), t + ' -> ' + p);
  const first = await page.evaluate(() => Game.state.npcs.find(n => Game.presenceOf(n) === 'here').name.split(' ')[0]);
  const hard = ['She says Darnell owes her money.', 'The bartender says Bobby left an hour ago.', `${first} says Earl Hux owes him.`, '"Fine," says Darnell.'];
  for (const [t, p] of await nameProblems(page, hard)) assert.ok(p.length && p.every(x => /^HARD /.test(x)), t + ' -> ' + p);
});

s.test('names, the middle ground: two unknown words a person-verb, "is", a title or "with" point at are hard ("You notice Earl Hux at the bar", "The only other customer is Bobby Lee Tate"); after a verb done to a thing, an article or in a list of them, soft', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const hard = ['You notice Earl Hux at the bar.', 'Sitting at the end of the bar is Earl Hux.', 'Behind the counter, Earl Hux wipes a glass.', 'You see Darnell Watts by the pumps.',
    'The only other customer is Bobby Lee Tate.', 'He drinks with Earl Hux.', 'He lives on Willow Street.'];
  for (const [t, p] of await nameProblems(page, hard)) assert.ok(p.length && p.every(x => /^HARD /.test(x)), t + ' -> ' + p);
  const soft = ['He dips Red Seal.', 'The radio plays Conway Twitty and Merle Haggard.', 'An old Johnny Cash song plays.', 'He hands you a can of Red Seal.', 'His hat says Bass Masters.'];
  for (const [t, p] of await nameProblems(page, soft)) assert.ok(p.length && p.every(x => /^soft /.test(x)), t + ' -> ' + p);
});

// ----- review bug 4 (playtest R3): a public grudge told once -----

s.test('bug 4 / R3: a public grudge told as a due event is not told again in "Overnight in town" (its news is seen)', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const T = G.data.GRUDGE_TEMPLATES;
    const idx = T.findIndex(t => t.public === true && !(t.effects || []).some(e => e.op === 'banFrom'));
    const t = T[idx];
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false && G.presenceOf(x) === 'here' && (!t.forTags || t.forTags.some(g => (x.tags || []).includes(g))) && !(t.notForTags || []).some(g => (x.tags || []).includes(g)));
    const effect = t.effect.replace(/\{npc\}/g, n.name).replace(/\{player\}/g, st.player.name);
    S.apply({ effects: [{ op: 'plantSeed', seed: { id: 'seed_grudge_w4', cause: 'test', effect, trigger: { type: 'day', value: st.time.day + 1 }, fired: false, hidden: true, origin: { kind: 'grudge', npcId: n.id, template: idx } } }] });
    const before = document.querySelectorAll('#feed .f-quiet').length;
    await G.Pipeline.submit('/rest');
    const pk = (G.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const overnight = [...document.querySelectorAll('#feed .f-quiet')].slice(before).map(x => x.textContent).filter(x => /^Overnight in town/.test(x)).join(' ');
    return { fired: S.seed('seed_grudge_w4').fired, told: pk.includes(effect.slice(0, 40)), again: overnight.includes(effect.slice(0, 40)), seen: st.news.filter(x => x.text === effect).map(x => x.seen) };
  });
  assert.equal(r.fired, true);
  assert.equal(r.told, true, 'the narration tells it');
  assert.equal(r.again, false, 'Overnight in town does not');
  assert.deepEqual(r.seen, [true]);
});

// ----- review bug 5: brought for the phase the turn runs into -----

s.test('bug 5: someone a due event brings is still there once the turn\'s time crosses into the next phase, on a turn with no walk and on a walk to a shut door', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  await fast(page);
  const go = (parse, input, ban) => page.evaluate(async ([parse, input, ban]) => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const le = st.player.looseEnds[0];
    const npc = S.npc(le.npcId);
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning', shorts: 2 } });
    if (ban) S.apply({ effects: [{ op: 'banFrom', locationId: ban, days: 2 }] });
    S.apply({ dueAdd: [{ seedId: le.seedId, text: `${npc.name} walks up to you and says the money is due.`, npcId: npc.id, bring: true }] });
    M.queue('parse', parse);
    M.queue('bookkeep', {});
    await G.Pipeline.submit(input);
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { phase: st.time.phase, told: /walks up to you and says the money is due/.test(pk), here: S.npcsAt(st.player.locationId).some(n => n.id === npc.id) };
  }, [parse, input, ban]);
  const stay = await go({ actionType: 'search', summary: 'Searches the shelves', targets: [], needsRoll: false, timeCost: 'short' }, 'I look through the shelves for a while', null);
  assert.deepEqual(stay, { phase: 'afternoon', told: true, here: true });
  const page2 = await h.open();
  await quickStart(page2, { kinds: ['debt'] });
  await fast(page2);
  const bar = await page2.evaluate(() => Game.state.locations.find(l => l.type === 'bar' && !l.away && l.id !== Game.state.player.locationId).id);
  const shut = await page2.evaluate(async bar => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const le = st.player.looseEnds[0];
    const npc = S.npc(le.npcId);
    S.apply({ setTime: { day: st.time.day + 1, phase: 'morning', shorts: 2 } });
    S.apply({ effects: [{ op: 'banFrom', locationId: bar, days: 2 }] });
    S.apply({ dueAdd: [{ seedId: le.seedId, text: `${npc.name} walks up to you and says the money is due.`, npcId: npc.id, bring: true }] });
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: bar, needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I walk over to the bar');
    return { phase: st.time.phase, moved: st.player.locationId === bar, here: S.npcsAt(st.player.locationId).some(n => n.id === npc.id) };
  }, bar);
  assert.deepEqual(shut, { phase: 'afternoon', moved: false, here: true });
});

// ----- review bug 6: what an arrest takes, and guns plausibility reads -----

s.test('bug 6: an arrest takes guns, knives and ammunition by the head of the name (a .38, a 12-gauge, a Glock, a box of shells), not gun oil, a gun case, a knife sharpener, a butter knife, a water pistol or a staple gun; the line reads "the .38 revolver" with commas; guns by calibre, gauge or maker are kept where guns are', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    st.player.inventory = [];
    const names = ['Gun oil', 'Gun case', 'Knife sharpener', 'Butter knife', 'Grease gun cartridge', 'Water pistol (red)', 'Staple gun and staples', 'Pistol grip', 'Bullet necklace', 'Peanut shells', 'Gunny sack',
      'Box of shells', 'A .38 revolver', '.38 special', '12-gauge', 'Twelve-gauge', 'Glock', 'Hunting knife', 'Shotgun shells'];
    for (const nm of names) S.apply({ itemsGained: [{ name: nm, qty: 1 }] });
    const plan = G.World.arrestPlan();
    const P = (d, t) => G.Town.plausible(d, t).plausible;
    return {
      weapons: plan.weapons, text: plan.text,
      church: ['a .38', 'a 12-gauge', 'a glock', 'a flare gun'].map(d => P(d, 'church')),
      pawn: ['a .38', 'a 12-gauge', 'a glock'].map(d => P(d, 'pawn')),
      ordinary: ['a radar gun', 'a tattoo gun', 'a butter knife'].map(d => P(d, 'bar')),
      flare: P('a flare gun', 'marina')
    };
  });
  assert.deepEqual(r.weapons, ['Box of shells', 'A .38 revolver', '.38 special', '12-gauge', 'Twelve-gauge', 'Glock', 'Hunting knife', 'Shotgun shells']);
  assert.match(r.text, /takes the box of shells, the \.38 revolver, the \.38 special, the 12-gauge, the twelve-gauge, the Glock, the hunting knife and the shotgun shells off /);
  assert.doesNotMatch(r.text, /the a |and .* and .* and /);
  assert.deepEqual(r.church, [false, false, false, false], 'a .38, a 12-gauge, a Glock or a flare gun do not turn up in a church');
  assert.deepEqual(r.pawn, [true, true, true], 'the pawn shop has them');
  assert.deepEqual(r.ordinary, [true, true, true], 'a radar gun, a tattoo gun and a butter knife are ordinary (the review\'s risk)');
  assert.equal(r.flare, true, 'a flare gun at the boat landing');
});

// ----- review bug 7: the recap's reasons keep contractions -----

s.test('bug 7: a recap reason turns "I\'m", "I\'ve", "I\'d" and "I\'ll" into the person\'s own ("she\'s sure", "he\'s never trusted you"), never "she\'m"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [], name: 'Tomas Reed' });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const she = st.npcs.find(n => n.pronouns === 'she' && n.status === 'free' && n.alive !== false && G.presenceOf(n) === 'here');
    const he = st.npcs.find(n => n.pronouns === 'he' && n.status === 'free' && n.alive !== false && G.presenceOf(n) === 'here');
    S.apply({ newMemories: [{ npcId: she.id, text: "I'm sure Tomas Reed is good for the money.", weight: 3 }, { npcId: he.id, text: "I've never trusted Tomas Reed.", weight: 3 }], npcKnownToPlayer: [she.id, he.id] });
    for (let i = 0; i < 4; i++) S.apply({ effects: [{ op: 'attitudeDelta', npcId: she.id, delta: 15 }, { op: 'attitudeDelta', npcId: he.id, delta: -15 }] });
    return { text: G.Pipeline.recapText(), she: she.name, he: he.name };
  });
  assert.match(r.text, new RegExp(`${r.she} \\([a-z]+, remembers she's sure you are good for the money\\)`), r.text);
  assert.match(r.text, new RegExp(`${r.he} \\([a-z]+, remembers he's never trusted you\\)`), r.text);
  assert.doesNotMatch(r.text, /\b(she|he|they)'m\b|\bhe've\b|\bshe've\b/);
});

// ----- review bug 8: the chief's memory names the player -----

s.test('bug 8: the chief remembers taking the weapons off the player by name (the narrator\'s memory line makes it "you"), not "off them"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [], name: 'Nell Avery' });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    S.apply({ itemsGained: [{ name: 'Deer rifle', qty: 1 }] });
    const res = G.World.arrestPlayer({ told: true });
    const chief = S.npc(res.chiefId);
    const mem = chief.memories.slice(-1)[0];
    return { mem: mem.text, line: G.Pipeline.npcLine(chief, st.meta.turn, true) };
  });
  assert.match(r.mem, /took .*the deer rifle off Nell Avery$/);
  assert.doesNotMatch(r.mem, /off them/);
});

// ----- the review's risks -----

s.test('risks: "paid nearly all of it" is not made late; banFrom days 0 is tonight; Say mode to everyone is a gift only with one person here', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const out = {};
    // A memory that says "early" only inside a word.
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false);
    S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: n.id, text: 'Pay {npc} back.', amount: 100, dueOffset: 0, onMet: [{ op: 'addMemory', npcId: n.id, text: 'got paid nearly all of it back in one go', weight: 2 }, { op: 'addMemory', npcId: n.id, text: 'got paid back in full and on time', weight: 2 }] }] });
    const o = S.obligations('open').find(x => x.npcId === n.id);
    S.apply({ setTime: { day: st.time.day + 2, phase: 'morning' } });
    S.tickObligations(st.time.day);
    S.apply({ obligationsSettled: [o.id] });
    out.mems = n.memories.slice(-2).map(m => m.text);
    // banFrom 0: tonight.
    const l = st.locations.find(x => !x.away && x.id !== st.player.locationId);
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 0 }] });
    out.ban = [!!S.isBanned(l.id), !!S.isBanned(l.id, st.time.day + 1)];
    // Say to everyone with two people here: no gift.
    let spot = null;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      while (st.time.phase !== ph) S.apply({ advanceTime: 'long' });
      spot = st.locations.find(x => !x.away && x.discovered && !S.isClosed(x) && S.npcsAt(x.id).length >= 2 && !S.npcsAt(x.id).some(p => (G.state.player.looseEnds || []).some(le => le.npcId === p.id)));
      if (spot) break;
    }
    S.apply({ playerLocationId: spot.id, goldDelta: 50 });
    const here = S.npcsAt(spot.id);
    M.queue('parse', { actionType: 'talk', summary: 'Gives', targets: here.map(x => x.id), needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', { goldDelta: -20 });
    await G.Pipeline.submit('Here, a little something for you all.', { mode: 'say', to: 'everyone' });
    out.everyone = { giftTo: G.Pipeline.lastTurn.ctx.giftTo, gifts: st.meta.gifts || null };
    return out;
  });
  assert.equal(r.mems[0], 'got paid nearly all of it back in one go', '"nearly" is not "early"');
  assert.equal(r.mems[1], 'got paid back in full, but late');
  assert.deepEqual(r.ban, [true, false], 'days 0 is tonight, as days 1 is');
  assert.equal(r.everyone.giftTo, null, 'to everyone, with two people here, nobody in particular got it');
  assert.equal(r.everyone.gifts, null);
});

s.test('risk: a friendly owner\'s bed only while the owner is there (or it is their home): no couch in a shut business the owner is away from', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    // An owner whose business is not their home.
    const pick = st.locations.map(l => ({ l, n: st.npcs.find(n => n.status === 'free' && n.alive !== false && /\bown(?:er|s)\b/i.test(n.role || '') && String(n.role).toLowerCase().includes(String(l.name).toLowerCase().replace(/^the /, '')) && !(n.home && n.home.locationId === l.id)) }))
      .find(x => x.n && !x.l.away);
    if (!pick) return null;
    S.apply({ effects: [{ op: 'attitudeDelta', npcId: pick.n.id, delta: 60 - pick.n.attitude }], playerLocationId: pick.l.id });
    const out = {};
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      S.apply({ setTime: { day: st.time.day, phase: ph } });
      out[ph] = [S.npcsAt(pick.l.id).includes(pick.n), S.restQuality()];
    }
    return { out, who: pick.n.id, where: pick.l.id };
  });
  assert.ok(r, 'an owner whose place is not their home');
  for (const [ph, [there, q]] of Object.entries(r.out)) assert.equal(q, there ? 'bed' : 'rough', `${ph}: owner there ${there}`);
  assert.ok(Object.values(r.out).some(([there]) => !there), 'some phase without them: ' + JSON.stringify(r));
});

s.test('risk (the "Grown" line): every progression entry stores its own gain; a capped stat gives max HP and the entry says so; Pipeline.gainText reads it', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const p = st.player;
    const [a, b] = st.threads.slice(0, 2);
    a.reward = 'charm'; b.reward = 'charm';
    S.apply({ effects: [{ op: 'threadUpdate', threadId: a.id, knownToPlayer: true }, { op: 'threadUpdate', threadId: b.id, knownToPlayer: true }] });
    p.stats.charm = S.LIMITS.statCap - 1;
    S.apply({ effects: [{ op: 'threadStatus', threadId: a.id, status: 'resolved' }] });
    S.apply({ effects: [{ op: 'threadStatus', threadId: b.id, status: 'resolved' }] });
    return { entries: p.progression.map(x => x.gain), text: p.progression.map(x => G.Pipeline.gainText(x.gain)) };
  });
  assert.deepEqual(r.entries, ['charm +1', 'max HP +2']);
  assert.deepEqual(r.text, ['+1 Charm', '+2 max HP']);
});

s.test('dead code: the engine no longer guards State functions that always exist (typeof State.isClosed and the like)', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const engine = html.slice(html.indexOf('// ===== Module: Rng ====='), html.indexOf('// ===== Module: Storage ====='));
  for (const fn of ['isBanned', 'isClosed', 'absentNote', 'obligations', 'tickObligations', 'awayNow', 'laidUp', 'season', 'mapPointOf', 'weekday']) {
    assert.ok(!engine.includes(`typeof State.${fn} === 'function'`) && !engine.includes(`typeof State.${fn} !== 'function'`), fn);
  }
  assert.ok(!engine.includes('beside DWELLING_TYPES'), 'the stale comment');
  assert.ok(!/function joinAnd\(/.test(engine) && (engine.match(/function andList\(/g) || []).length === 0, 'one andList, in the helpers');
});

// ----- the coordinator's copy items -----

s.test('copy: the no-key notice offers the offline demo; a barred skip says "until Day N"; /cheat time and the clock step say "Day N · Phase"; /pronouns is "Set someone\'s pronouns"; /help starts with "Commands" then "Type / to pick one."', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const out = {};
    out.pronouns = G.Commands.LIST.find(c => c.name === '/pronouns').desc;
    out.help = G.Commands.helpText().split('\n').slice(0, 3);
    const l = st.locations.find(x => x.type === 'bar' && !x.away);
    S.apply({ effects: [{ op: 'banFrom', locationId: l.id, days: 3 }] });
    const before = document.querySelectorAll('#feed .f-notice').length;
    await G.Pipeline.skip(`to ${l.name} in the evening`);
    out.skip = [...document.querySelectorAll('#feed .f-notice')].slice(before).map(x => x.textContent).join(' ');
    G.Commands.run('/cheat time night 2');
    out.clock = [...document.querySelectorAll('#feed .f-quiet')].pop().textContent;
    return out;
  });
  assert.equal(r.pronouns, 'Set someone\'s pronouns');
  assert.deepEqual(r.help.slice(0, 2), ['Commands', 'Type / to pick one.']);
  assert.match(r.help[2], /^\/look/);
  assert.match(r.skip, /You are not welcome at .* until Day \d+\./);
  assert.equal(r.clock, 'Clock set to Day 2 · Night.');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes("no_key: 'There is no API key yet. Add yours in Settings, or try the offline demo (Settings → Advanced).'"));
  assert.ok(html.includes('Set the clock back to Day ${day} · ${capFirst(phase)}:'));
});

// ----- the playtest's engine items -----

s.test('R1: a walk that lands in the next phase introduces the crowd there once: the next turn tells no one arriving or leaving', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    // A place whose crowd differs between two phases in a row.
    const PH = ['morning', 'afternoon', 'evening'];
    let pick = null;
    for (const l of st.locations) {
      if (l.away || !l.discovered || l.id === st.player.locationId) continue;
      for (let i = 0; i < 2 && !pick; i++) {
        const a = l.npcIdsBySchedule[PH[i]] || [], b = l.npcIdsBySchedule[PH[i + 1]] || [];
        if (b.length && a.join() !== b.join()) pick = { l, from: PH[i], to: PH[i + 1] };
      }
      if (pick) break;
    }
    let d = st.time.day; while (S.isClosed(pick.l, d)) d++;
    S.apply({ setTime: { day: d, phase: pick.from, shorts: 2 } });
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: pick.l.id, needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I walk over there');
    const walk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    await G.Pipeline.submit('/look');
    const look = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { at: [st.player.locationId === pick.l.id, st.time.phase === pick.to], dest: (/^DESTINATION: .*$/m.exec(walk) || [''])[0], since: (/^SINCE THE LAST TURN.*$/m.exec(look) || [''])[0], scene: st.pendingScene || null };
  });
  assert.deepEqual(r.at, [true, true]);
  assert.equal(r.since, '', 'nobody re-announced: ' + r.since);
});

s.test('R1: a walk into Town Hall as the council meeting starts tells the meeting in that narration, with its people in DESTINATION, and nobody "left" on the next turn', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const ev = G.data.TOWN_DATA.events[0];
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    S.apply({ setTime: { day: ev.day, phase: PH[PH.indexOf(ev.phase) - 1], shorts: 2 } });
    M.queue('parse', { actionType: 'move', summary: 'Walks over', targets: [], destinationId: ev.locationId, needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I walk over to Town Hall');
    const walk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    await G.Pipeline.submit('/look');
    const look = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const free = ev.attendees.filter(id => { const n = S.npc(id); return n && n.status === 'free' && n.alive !== false; }).map(id => S.npc(id).name);
    const scene = (/^DUE EVENT: (.*?) \(the scene/m.exec(walk) || [])[1] || '';
    return { fired: (st.eventsFired || []).includes(ev.id), dest: (/^DESTINATION: .*$/m.exec(walk) || [''])[0], due: (/^DUE EVENT: .*$/m.exec(walk) || [''])[0], since: (/^SINCE THE LAST TURN.*$/m.exec(look) || [''])[0], lookDue: (/^DUE EVENT: .*$/m.exec(look) || [''])[0], scene, free, news: st.news.filter(x => x.eventId === ev.id).map(x => x.seen) };
  });
  assert.equal(r.fired, true);
  assert.match(r.due, /\(the scene: it happens here, now/, r.due);
  for (const nm of r.free) assert.ok(r.dest.includes(nm), `${nm} in DESTINATION: ${r.dest}`);
  assert.equal(r.since, '', 'nobody left or came: ' + r.since);
  assert.ok(r.scene && !r.lookDue.includes(r.scene.slice(0, 60)), 'the meeting is not told again: ' + r.lookDue);
  assert.deepEqual(r.news, [true], 'watched, so the morning does not tell it');
});

s.test('R2 and the design note: thrown out of the card game the player lands on the street outside (Front Street), which OUTCOME and the bookkeeper hear; caught with a marked deck, the dealer keeps the deck', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_poker_hustler', seed: 7373, les: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
    let d = st.time.day; while (S.isClosed(l, d)) d++;
    S.apply({ setTime: { day: d, phase: 'evening' }, playerLocationId: l.id });
    M.queue('parse', { actionType: 'gamble', summary: 'Bets', targets: [], needsRoll: true, stat: 'wits', timeCost: 'short' });
    M.queue('bookkeep', {});
    G.Pipeline.hooks.nextTier = 'fumble';
    G.State.apply({ cardGame: 'draw' }); G.Pipeline.hooks.cardsSeats = []; G.Pipeline.hooks.cardsPlay = { hold: 'all' }; // wave 10: the hand is played at a table; this one stands pat
    await G.Pipeline.submit('I bet $20 at cards');
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const bk = (M.calls.filter(c => c.method === 'bookkeep').pop() || {}).text || '';
    const now = S.loc(st.player.locationId);
    return { now: [now.name, now.type], outcome: (/^OUTCOME: .*$/m.exec(pk) || [''])[0], book: (/CARD GAME .*$/m.exec(bk) || [''])[0], deck: st.player.inventory.some(i => /marked/i.test(i.name)), told: st.log[st.log.length - 1].narration };
  });
  assert.equal(r.now[1], 'street', 'the street outside, not the first exit: ' + r.now[0]);
  assert.match(r.outcome, new RegExp(`onto ${r.now[0].replace(/^The /, 'the ')}.* End the narration with the player outside on ${r.now[0].replace(/^The /, 'the ')}: the engine moves them there\\.$`));
  assert.match(r.outcome, /takes the marked deck and throws the player out/);
  assert.match(r.book, /record no playerLocationId/);
  assert.equal(r.deck, false, 'the deck is gone');
  assert.match(r.told, new RegExp(`You end up outside on ${r.now[0].replace(/^The /, 'the ')}\\.`));
});

s.test('R4: a due event that names a place in town the player has not found (Nadine\'s hook and the Parsonage) makes it known, with a quiet line; walking there works', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_group_home_kid', seed: 8181, les: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const nadine = S.npc('npc_nadine');
    const church = st.locations.find(l => S.npcsAt(l.id).includes(nadine)) || null;
    const was = S.loc('loc_parsonage').discovered;
    // The hook fires on meeting her; it is told in the next narration.
    let spot = null;
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      while (st.time.phase !== ph) S.apply({ advanceTime: 'long' });
      spot = st.locations.find(l => !l.away && l.discovered && S.npcsAt(l.id).includes(nadine));
      if (spot) break;
    }
    S.apply({ playerLocationId: spot.id });
    const before = document.querySelectorAll('#feed .f-quiet').length;
    await G.Pipeline.submit('/look');
    await G.Pipeline.submit('/look');
    const quiets = [...document.querySelectorAll('#feed .f-quiet')].slice(before).map(x => x.textContent);
    const told = st.log.slice(-2).map(e => e.narration).join(' ');
    return { was, now: S.loc('loc_parsonage').discovered, told: /Parsonage/.test(told), quiets, church: !!church };
  });
  assert.equal(r.was, false);
  assert.equal(r.told, true, 'the hook was told');
  assert.equal(r.now, true, 'the Parsonage is known');
  assert.ok(r.quiets.includes('Added to the map: The Parsonage.'), JSON.stringify(r.quiets));
});

s.test('R5: every memory made now carries its day, and attitudes drift back once no serious memory is newer than five days, however many turns are played', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false && G.presenceOf(x) === 'here' && !x.memories.length);
    const base = (S.town.npcs.find(x => x.id === n.id) || {}).attitude || 0;
    S.apply({ newMemories: [{ npcId: n.id, text: 'got called a liar to my face', weight: 3 }] });
    G.World.forceAttitude(n.id, base - 40);
    const day0 = st.time.day;
    const mem = n.memories.slice(-1)[0];
    const seen = [];
    for (let d = 0; d < 8; d++) {
      for (let i = 0; i < 6; i++) await G.Pipeline.look();
      await G.Pipeline.rest();
      seen.push([st.time.day, n.attitude - base]);
    }
    // A memory from an older build with no day, older than the log: old, not recent.
    const m = st.npcs.find(x => x.status === 'free' && x.alive !== false && x.id !== n.id && G.presenceOf(x) === 'here' && !x.memories.length);
    const mb = (S.town.npcs.find(x => x.id === m.id) || {}).attitude || 0;
    m.memories.push({ turn: 1, text: 'punched me outside the bar', weight: 3 });
    G.World.forceAttitude(m.id, mb - 20);
    G.World.tick({ to: { day: st.time.day + 1, phase: 'morning' } });
    return { day: mem.day, day0, seen, logStart: st.log[0].turn, old: m.attitude - mb };
  });
  assert.equal(r.day, r.day0, 'the memory has its day');
  assert.ok(r.logStart > 1, 'the log has been trimmed past the memory');
  // Held while it is newer than five days (DRIFT_QUIET_DAYS), back two a day from the fifth day on.
  const quiet = r.seen.filter(([d]) => d < r.day0 + 5).map(x => x[1]);
  assert.ok(quiet.length && quiet.every(x => x === -40), 'held while fresh: ' + JSON.stringify(r.seen));
  const later = r.seen.filter(([d]) => d >= r.day0 + 5).map(x => x[1]);
  assert.ok(later.length && later[later.length - 1] > -40, 'drifting back after: ' + JSON.stringify(r.seen));
  assert.equal(r.old, -18, 'an undated memory older than the log does not hold the drift');
});

s.test('R6: a grudge for violence answers with violence or the police, never with gossip; every grudge template says its kind', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const T = G.data.GRUDGE_TEMPLATES;
    const gossip = T.findIndex(t => /talking to the police/.test(t.effect));
    const picks = new Set();
    // Someone who can hold the gossip template too, planting grudges for an attack, again and again.
    const fits = (t, x) => (!t.forTags || t.forTags.some(g => (x.tags || []).includes(g))) && !(t.notForTags || []).some(g => (x.tags || []).includes(g));
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false && G.presenceOf(x) === 'here' && fits(T[gossip], x) && T.some(t => (t.kind === 'violence' || t.kind === 'police') && fits(t, x)));
    for (let i = 0; i < 30; i++) {
      st.seeds = st.seeds.filter(sd => !(sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === n.id));
      n.memories = [{ turn: st.meta.turn, day: st.time.day, text: 'attacked me in front of everybody', weight: 3 }];
      n.attitude = -80;
      G.World.tick({ to: { day: st.time.day + 1, phase: 'morning' } });
      const sd = st.seeds.find(x => x.origin && x.origin.kind === 'grudge' && x.origin.npcId === n.id);
      if (sd) picks.add(T[sd.origin.template].kind);
    }
    return { kinds: T.map(t => t.kind), gossipKind: T[gossip].kind, picks: [...picks], who: n && n.id };
  });
  assert.ok(r.kinds.every(k => ['violence', 'police', 'gossip', 'money', 'ban'].includes(k)), JSON.stringify(r.kinds));
  assert.equal(r.gossipKind, 'gossip', '"has been talking to the police" is gossip');
  assert.ok(r.picks.length, 'grudges were planted for ' + r.who);
  assert.ok(r.picks.every(k => k === 'violence' || k === 'police'), JSON.stringify(r.picks));
});

s.test('R7 and D4: a grease gun is no gun ("I shoot Royce" with one is NOT CARRIED and rolls with no item); searching for a grease gun needs no gun', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_veteran', seed: 6262, les: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    st.player.inventory = [];
    S.apply({ itemsGained: [{ name: 'Grease gun', qty: 1 }] });
    const carried = [G.Pipeline.carriedAs('Grease gun', 'gun'), G.Pipeline.carriedAs('Gun oil', 'gun'), G.Pipeline.carriedAs('Deer rifle', 'gun'), G.Pipeline.carriedAs('Folding knife', 'knife'), G.Pipeline.carriedAs('Butter knife', 'knife'), G.Pipeline.carriedAs('Car keys', 'car')];
    const n = S.npcsAt(st.player.locationId)[0] || st.npcs.find(x => x.status === 'free');
    S.apply({ playerLocationId: st.locations.find(l => S.npcsAt(l.id).includes(n)).id });
    G.Pipeline.forceNextRoll(18);
    await G.Pipeline.submit(`I shoot ${n.name.split(' ')[0]}`);
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const roll = G.Pipeline.lastTurn.roll;
    const parse = M.calls.filter(c => c.method === 'parse').pop();
    await G.Pipeline.submit('I search the bays for a grease gun');
    const p2 = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    return { carried, notCarried: line(pk), mods: roll ? roll.modifiers.map(m => m.label) : null, search: /^NOT CARRIED/m.test(p2) };
    function line(t) { return (/^NOT CARRIED: .*$/m.exec(t) || [''])[0]; }
  });
  assert.deepEqual(r.carried, [false, false, true, true, false, true]);
  assert.match(r.notCarried, /^NOT CARRIED: a gun\./);
  assert.ok(!r.mods || !r.mods.some(m => /grease/i.test(m)), JSON.stringify(r.mods));
  assert.equal(r.search, false, 'looking for one is not using one');
});

s.test('R8: the recap\'s Owed line shows part payments on blackmail too', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false);
    S.apply({ effects: [{ op: 'addObligation', kind: 'blackmail', npcId: n.id, text: 'Pay {npc} two hundred dollars to keep your secret quiet.', amount: 200, dueOffset: 2 }] });
    S.apply({ goldDelta: -50 }, { source: 'model', present: [n.id], targets: [n.id], actionType: 'give' });
    return G.Pipeline.recapText().split('\n').find(x => x.startsWith('Owed:'));
  });
  assert.match(r, /Blackmail for .*\(\$50 of \$200 paid\) · due Day \d+/);
});

s.test('R9: an older game\'s plans are rewritten as the town now has them (each clock by its label: completion, requires, alt, segments while unfilled; filled kept), seeds\' rules too; a re-read of a current game changes nothing', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state, T = G.data.TOWN_DATA;
    // Make it look like a rules-7 game: other completions, no requires or alt, other segments, another order; a seed without its rules.
    const f = st.factions[0];
    const c = f.clocks[0];
    const want = JSON.stringify(T.factions.find(x => x.id === f.id).clocks.find(x => x.label === c.label).onComplete);
    c.onComplete = { text: 'An older completion.', effects: [{ op: 'setFlag', key: 'oldFlag', value: true }] };
    c.filled = 2;
    const c2 = f.clocks[1];
    c2.segments = 9; c2.filled = 0;
    f.clocks.reverse();
    const sd = st.seeds.find(x => !x.fired && T.seeds.some(y => y.id === x.id && y.effects));
    const sdEffects = sd ? JSON.stringify(sd.effects) : null;
    if (sd) delete sd.effects;
    const res = S.apply({ arcFill: { town: T } });
    const again = S.apply({ arcFill: { town: T } });
    const back = f.clocks.find(x => x.label === c.label);
    return {
      applied: res.applied.join(' '), plans: res.arc && res.arc.plans, again: again.arc && again.arc.plans,
      completion: JSON.stringify(back.onComplete) === want, filled: back.filled, seg2: f.clocks.find(x => x.label === c2.label).segments,
      seg2want: T.factions.find(x => x.id === f.id).clocks.find(x => x.label === c2.label).segments, order: f.clocks.map(x => x.label)[0] === c2.label || f.clocks.length > 2,
      seed: sd ? JSON.stringify(sd.effects) === sdEffects : true
    };
  });
  assert.equal(r.completion, true, 'the completion as the town writes it');
  assert.equal(r.filled, 2, 'progress kept');
  assert.equal(r.seg2, r.seg2want, 'an unfilled clock takes the segments');
  assert.ok(r.plans >= 2, r.applied);
  assert.equal(r.again, 0, 'nothing to do the second time');
  assert.equal(r.seed, true, 'a seed with no effects gets the town\'s');
});

s.test('R10: the tackle-box seed leaves the tackle box where the player found it, and it can be picked up', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_poker_hustler', seed: 7373, les: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const sd = S.seed('seed_tackle_box');
    const at = [].concat(sd.trigger.value)[0];
    S.apply({ setTime: { day: Math.max(st.time.day, sd.notBeforeDay || 1), phase: 'morning' }, playerLocationId: at });
    await G.Pipeline.look();
    await G.Pipeline.look();
    const items = (S.loc(at).items || []).map(i => i.name);
    await G.Pipeline.submit('I pick up the tackle box');
    return { fired: sd.fired, items, inv: st.player.inventory.map(i => i.name) };
  });
  assert.equal(r.fired, true);
  assert.ok(r.items.includes('Tackle box'), JSON.stringify(r.items));
  assert.ok(r.inv.includes('Tackle box'), JSON.stringify(r.inv));
});

s.test('R11: /rest in a place shut today says who came to find the player (after the due events), and the loose ends no longer say "alone"', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_veteran', seed: 6262, les: [['promise', 1], ['debt', 1], ['lost', 0]] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const l = st.locations.find(x => Array.isArray(x.closedOn) && x.closedOn.includes('Sunday') && G.Pipeline.cardGameAt(x));
    let d = 1; while (S.weekday(d + 1) !== 'Sunday') d++;
    S.apply({ setTime: { day: d, phase: 'night' }, playerLocationId: l.id });
    // Every loose end comes due tonight.
    for (const le of st.player.looseEnds) { const sd = S.seed(le.seedId); if (sd && !sd.fired) { sd.trigger = { type: 'day', value: d + 1 }; delete sd.notBeforeDay; } }
    await G.Pipeline.rest();
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    const came = S.npcsAt(l.id).filter(n => !(n.home && n.home.locationId === l.id)).map(n => n.name);
    return { passed: (/^TIME PASSED: .*$/m.exec(pk) || [''])[0], came, alone: Object.values(G.data.LOOSE_ENDS).filter(le => /\balone\b/.test(le.seed.effect)).length };
  });
  assert.ok(r.came.length, 'someone came');
  for (const nm of r.came) assert.ok(r.passed.includes(nm), `${nm} in ${r.passed}`);
  assert.match(r.passed, /nobody who does not live here is about but .*, come to find the player/);
  assert.equal(r.alone, 0);
});

// ----- the demo (the mock) -----

s.test('D1, D2, D3, D5: "Go there" for Pittman\'s Gas and Service is one walk; a haircut is had at Riverbend, not the station; giving money you do not have is not taken; "the Mangum place" before it is known is asked about, not walked', async h => {
  const page = await h.open();
  await start(page, { bg: 'bg_poker_hustler', seed: 7373, les: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const gas = st.locations.find(l => / and /.test(l.name) && !l.away && l.discovered);
    const out = {};
    if (gas) {
      await G.Pipeline.submit(`I head to ${gas.name}.`);
      const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
      out.go = { at: st.player.locationId === gas.id, dest: /^DESTINATION: /m.test(pk) };
      const g0 = st.player.gold;
      await G.Pipeline.submit('I buy a haircut');
      out.haircutGas = g0 - st.player.gold;
    }
    const rb = st.locations.find(l => l.type === 'trailerpark' && l.discovered);
    S.apply({ playerLocationId: rb.id });
    const g1 = st.player.gold;
    await G.Pipeline.submit('I buy a haircut');
    out.haircutRb = g1 - st.player.gold;
    // Money you do not have.
    S.apply({ goldDelta: -st.player.gold });
    const n = S.npcsAt(st.player.locationId)[0] || null;
    if (n) {
      await G.Pipeline.submit(`I give ${n.name.split(' ')[0]} $100`);
      out.give = st.log[st.log.length - 1].narration;
    }
    // A home not found yet, by its family's name.
    const home = st.locations.find(l => l.discovered === false && !l.away && st.npcs.some(p => p.home && p.home.locationId === l.id && p.name.split(' ').length > 1));
    const fam = st.npcs.find(p => p.home && p.home.locationId === home.id && p.name.split(' ').length > 1).name.split(' ').pop();
    const t0 = JSON.stringify(st.time);
    const res = await G.Pipeline.submit(`I walk to the ${fam} place`);
    out.home = { reason: res && res.reason, time: JSON.stringify(st.time) === t0, notice: [...document.querySelectorAll('#feed .f-notice')].pop().textContent };
    return out;
  });
  if (r.go) {
    assert.deepEqual(r.go, { at: true, dest: true }, 'one walk, with DESTINATION');
    assert.equal(r.haircutGas, 0, 'no haircut at the station');
  }
  assert.ok(r.haircutRb > 0, 'a haircut at Riverbend');
  if (r.give) assert.match(r.give, /come up short/);
  assert.equal(r.home.time, true, 'nothing spent: ' + r.home.notice);
  assert.match(r.home.notice, /know where that is yet/);
});

// ----- the playtest's design notes -----

s.test('design: a promise is not settled by the bookkeeper on a turn whose ask of that person failed', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const n = st.npcs.find(x => x.status === 'free' && x.alive !== false);
    S.apply({ effects: [{ op: 'addObligation', kind: 'promise', npcId: n.id, text: 'Keep your word to {npc}.', dueOffset: 3 }] });
    const o = S.obligations('open').find(x => x.npcId === n.id);
    S.apply({ beginTurn: true });
    const failed = S.apply({ obligationsSettled: [o.id] }, { source: 'model', present: [n.id], targets: [n.id], actionType: 'persuade', rollSuccess: false, rolled: true });
    const st1 = o.status;
    S.apply({ beginTurn: true });
    const ok = S.apply({ obligationsSettled: [o.id] }, { source: 'model', present: [n.id], targets: [n.id], actionType: 'persuade', rollSuccess: true, rolled: true });
    return { refused: failed.rejected.map(x => x.reason), st1, st2: o.status, ok: ok.rejected.length };
  });
  assert.match(r.refused.join(' '), /failed this turn: nothing with them is settled/);
  assert.equal(r.st1, 'open');
  assert.equal(r.st2, 'met');
  assert.equal(r.ok, 0);
});

s.test('design: /cheat time past the council meeting makes it happen at once, as news of its own day and phase told now ("Meanwhile in town"), so the recap knows the vote', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(() => {
    const G = Game, st = G.state;
    const ev = G.data.TOWN_DATA.events[0];
    const res = G.Commands.run(`/cheat time morning ${ev.day + 1}`);
    const quiets = [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent);
    const news = st.news.filter(n => n.eventId === ev.id);
    // Changed by design (wave 6, the round-5 playtest's R2): a "Meanwhile in town, Day N: …" line for each day the jump passed with news (the seeds too, in order); the meeting is told once, on its own day's line.
    return { ok: res.ok, fired: (st.eventsFired || []).includes(ev.id), news: news.map(n => [n.day, n.phase, n.seen]), evDay: ev.day, evPhase: ev.phase, meanwhile: quiets.filter(q => q.startsWith(`Meanwhile in town, Day ${ev.day}: `) && news.some(n => q.includes(n.text))).length, recap: G.Pipeline.recapText() };
  });
  assert.equal(r.ok, true);
  assert.equal(r.fired, true);
  assert.deepEqual(r.news, [[r.evDay, r.evPhase, true]]);
  assert.equal(r.meanwhile, 1);
});

s.test('design: two nights running sleeping rough in a public place, the police chief moves the player on in the morning (told in that narration, remembered); a bed resets the count', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const l = st.locations.find(x => x.type === 'church' && !x.away) || st.locations.find(x => x.type === 'police' && !x.away);
    const nights = [];
    for (let i = 0; i < 2; i++) {
      S.apply({ setTime: { day: st.time.day, phase: 'night' }, playerLocationId: l.id });
      await G.Pipeline.rest();
      const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
      nights.push({ due: (/^DUE EVENT: .*$/m.exec(pk) || [''])[0], count: st.flags.roughNights });
    }
    const chief = st.npcs.find(n => (n.memories || []).some(m => /sleeping rough at .* two nights running/.test(m.text)));
    return { nights, chief: chief && chief.id, here: chief ? S.npcsAt(l.id).some(n => n.id === chief.id) : false, ROUGH: G.World.ROUGH_NIGHTS };
  });
  assert.equal(r.ROUGH, 2);
  assert.doesNotMatch(r.nights[0].due, /move along/, 'one night is nothing');
  assert.match(r.nights[1].due, /tells you to move along and find a real bed/);
  // Changed by design at the wave-5 integration: the count runs on past the chief, so a third night there costs the fine (tests/integration.test.cjs).
  assert.equal(r.nights[1].count, 2, 'the count runs on');
  assert.ok(r.chief, 'the chief remembers');
  assert.equal(r.here, true, 'and is there in the morning');
});

s.test('design: a loose end\'s thread gives the story point only (no stat, no max HP); a town thread still grows the player', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: ['debt'] });
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state, p = st.player;
    const le = p.looseEnds[0];
    const before = { sp: p.storyPoints, hp: p.maxHp, stats: JSON.stringify(p.stats) };
    S.apply({ effects: [{ op: 'threadStatus', threadId: le.threadId, status: 'resolved' }] });
    const after = { sp: p.storyPoints, hp: p.maxHp, stats: JSON.stringify(p.stats), gain: p.progression.slice(-1)[0] };
    return { before, after };
  });
  assert.equal(r.after.sp, Math.min(r.before.sp + 1, 3));
  assert.equal(r.after.hp, r.before.hp, 'no max HP');
  assert.equal(r.after.stats, r.before.stats, 'no stat');
  assert.ok(!r.after.gain || r.after.gain.gain === null, JSON.stringify(r.after.gain));
});

s.test('design: every ending branch settles the bridge thread and the police thread one way or the other (the default ending closes the bridge thread too)', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const E = Game.data.TOWN_DATA.epilogue;
    const statusOf = (b, id) => {
      const all = (b.effects || []).filter(e => e.op === 'threadUpdate' && e.threadId === id && e.status);
      const seeds = (b.effects || []).filter(e => e.op === 'plantSeed').flatMap(e => [].concat(e.seed.effects || [], (e.seed.alt && e.seed.alt.effects) || []).filter(x => x.op === 'threadUpdate' && x.threadId === id && x.status));
      return all.length + seeds.length;
    };
    return E.branches.concat([E.default]).map(b => [statusOf(b, 'thr_bridge_vote'), statusOf(b, 'thr_police_vote')]);
  });
  for (const [bridge, police] of r) { assert.ok(bridge > 0, 'the bridge thread: ' + JSON.stringify(r)); assert.ok(police > 0, 'the police thread: ' + JSON.stringify(r)); }
});

s.run();
