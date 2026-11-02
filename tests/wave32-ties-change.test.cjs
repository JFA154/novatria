'use strict';
/* Wave 32 (1 Nov 2026): ties that change (docs/RELATIONSHIPS_PLAN.md, wave
   B2; the integration plan's 16 B2). Telling someone what the player holds
   over another moves how they see them (the town's secretTies) and the one
   it was about hears who told by the tie between them; a word against
   someone or for them, on a persuade that worked, moves how the listener
   sees them, as far as the listener trusts the player (badmouthed,
   vouched_for, two more words on the wire); content's tieDelta and
   propagate ops (a grudge's gossip goes along its holder's ties); the
   narrator hears BETWEEN THEM for a known tie the player saw change, and
   the card says "strained since Day N". Mock mode. Run with:
   node tests/run.cjs wave32 */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave32-ties-change');

/* __put(locId, ids, day?, phase?): the player somewhere with only these people this phase.
   __say(to, words, parse, book, narration): a Say turn with what the mock should return.
   __mark / __feed: the quiet lines since the mark. __holdMavis(): example 2's A part, the garage money held. */
const setup = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'morning' } });
    S.apply({ playerLocationId: locId });
    const others = S.npcsAt(locId).map(n => n.id).filter(id => !ids.includes(id));
    S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })).concat(others.map(id => ({ npcId: id, locationId: 'loc_front_street' }))) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__say = async (to, words, parse, book, narration) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (narration) G.Api.Mock.queue('narrate', { text: narration });
    if (book) G.Api.Mock.queue('bookkeep', book);
    return G.Pipeline.submit(words, { mode: 'say', to });
  };
  window.__feed0 = 0;
  window.__mark = () => { window.__feed0 = document.querySelectorAll('#feed .f-quiet').length; };
  window.__feed = () => [...document.querySelectorAll('#feed .f-quiet')].slice(window.__feed0).map(x => x.textContent);
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
  window.__st = id => { const st = G.Rel.stance(G.State.npc(id)); return [st.phrase].concat(st.tags); };
  window.__holdMavis = async () => {
    const S = G.State;
    S.apply({ npcKnownToPlayer: ['npc_mavis', 'npc_dewayne'] });
    __put('loc_motor_court', ['npc_mavis'], 4, 'night');
    G.Pipeline.forceNextRoll(17);
    await __say('npc_mavis', 'Long night at the desk?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_mavis learned_secret: emptied Dewayne\'s garage account for Mama\'s note'] },
      'Mavis Mangum looks at the motel till a long time. "I emptied the garage account," she says. "All of it. For my mother\'s note on the house."');
    return G.state.leverage.find(x => x.holder === 'player' && x.over === 'npc_mavis') || null;
  };
  window.__ties = id => { const card = document.querySelector(`.pcard[data-npc="${id}"] .pcard-facts dd[data-fact="ties"]`); return card ? card.textContent : null; };
  window.__card = id => { G.UI.openPanel('people'); G.UI.togglePerson(id, true); return window.__ties(id); };
});

s.test('the garage money: telling Dewayne moves his trust in Mavis from 60 to 15, she hears who told by morning, takes it as a scar and turns against the player, and the motel is suddenly full', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const rec = await __holdMavis();
    const out = { rec: rec ? [rec.status, rec.weight] : null, card0: __card('npc_dewayne') };
    const tie0 = R.tieNow(st.ties['npc_dewayne>npc_mavis']);
    // Day 5 evening at the landing: the player tells Dewayne.
    __put('loc_purvis_landing', ['npc_dewayne'], 5, 'evening');
    const m0 = __tr('npc_mavis');
    const d0 = __tr('npc_dewayne');
    await __say('npc_dewayne', 'Mavis emptied your garage account to pay off her mother\'s note.', null, { socialEvents: ['npc_dewayne exposed npc_mavis: told me Mavis spent the garage money'] });
    const tie1 = st.ties['npc_dewayne>npc_mavis'];
    out.tie = [tie0, R.tieNow(tie1), tie1.log.map(e => [e.w, e.t, e.why, e.seen === true, e.day]), tie1.known];
    out.dewayne = [__tr('npc_dewayne').t - d0.t, __tr('npc_dewayne').w - d0.w];
    out.mavisNow = [__tr('npc_mavis').w - m0.w, S.npc('npc_mavis').memories.some(m => m.event === 'exposed')];
    out.queued = st.hearsay.filter(x => x.npcId === 'npc_mavis' && x.own).map(x => [x.event, x.via, x.dueDay, x.duePhase, x.about]);
    out.rec1 = st.leverage.find(x => x.id === rec.id).status;
    __mark();
    await G.Pipeline.submit('/rest');
    const mv = S.npc('npc_mavis');
    out.day6 = { time: [st.time.day, st.time.phase], tracks: __tr('npc_mavis'), stance: __st('npc_mavis'), scar: mv.memories.filter(m => m.event === 'exposed').map(m => [m.weight, m.decay, m.d.w, m.d.t]), feed: __feed() };
    // The motel: she manages it, and she is against the player now; a night there is refused.
    __put('loc_motor_court', ['npc_mavis'], null);
    out.wontSell = R.wontSell(mv);
    const g0 = st.player.gold;
    await G.Pipeline.submit('I buy a night at the motel');
    out.motel = [st.player.gold - g0, G.Pipeline.lastTurn.packet.split('\n').filter(l => /^WON'T SELL/.test(l))];
    out.card1 = __card('npc_dewayne');
    return out;
  });
  assert.deepEqual(r.rec, ['held', 3], 'the garage money held (example 2, A)');
  assert.match(r.card0, /^wife Mavis Mangum; /, 'no word on the tie before anything changed: ' + r.card0);
  // Dewayne→Mavis 50/60 (by hand) moves by the town's secretTies, liking -20 and trust -45: 30/15, in front of the player, and the town knows it.
  assert.deepEqual([r.tie[0].w, r.tie[0].t], [50, 60]);
  assert.deepEqual([r.tie[1].w, r.tie[1].t], [30, 15]);
  assert.deepEqual(r.tie[2], [[-20, -45, 'the garage money', true, 5]]);
  assert.equal(r.tie[3], true);
  // Dewayne takes trust +8 for being told (x0.8: he is guarded); he likes her at 50, under the messenger's 60.
  assert.deepEqual(r.dewayne, [6, 0]);
  assert.deepEqual(r.mavisNow, [0, false], 'she is not there: nothing yet');
  // She hears who told by the tie between them: his wife under one roof, that night.
  assert.deepEqual(r.queued, [['exposed', 'overnight', 5, 'night', 'what you told Dewayne']]);
  assert.equal(r.rec1, 'spent');
  assert.deepEqual(r.day6.time, [6, 'morning']);
  // W -30, T -30 (x1.3: she is guarded): the design's W -30, T -39, a weight-3 scar.
  assert.deepEqual(r.day6.scar, [[3, 'scar', -30, -39]], 'a weight-3 scar');
  assert.equal(r.day6.stance[0], 'against you');
  assert.ok(r.day6.feed.includes('Word got round: Mavis Mangum has heard what you told Dewayne.'), JSON.stringify(r.day6.feed));
  assert.ok(r.day6.feed.includes('Mavis Mangum won\'t forget that.'), JSON.stringify(r.day6.feed));
  assert.equal(r.wontSell, true);
  assert.equal(r.motel[0], 0, 'the motel is full for the player: nothing bought');
  assert.equal(r.motel[1].length, 1, JSON.stringify(r.motel[1]));
  assert.match(r.card1, /^wife Mavis Mangum, strained since Day 5; /, r.card1);
});

s.test('badmouthing a man to someone who likes him costs the player, to someone who trusts the player it moves how they see him', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_dewayne', 'npc_mavis', 'npc_royce'] });
    const tieW = (a, b) => R.tieNow(st.ties[`${a}>${b}`]).w;
    const persuade = { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' };
    // To someone who likes him at 40 or more: Dewayne (50 for Mavis) hears his wife run down, and the player pays for it.
    __put('loc_pittmans', ['npc_dewayne'], 2, 'morning');
    const d0 = __tr('npc_dewayne').w;
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_dewayne', 'Your wife is not what you think she is.', persuade, { socialEvents: ['npc_dewayne badmouthed npc_mavis: ran my wife down to me'] });
    out.cost = [__tr('npc_dewayne').w - d0, tieW('npc_dewayne', 'npc_mavis')];
    // To someone who trusts the player (Royce at trust 50: the whole of it): his liking for Dewayne (20, his man in the bay) moves -10 on a persuade that worked.
    S.apply({ relSet: { npcId: 'npc_royce', t: 50 } });
    __put('loc_pittmans', ['npc_royce'], 3, 'morning');
    out.r0 = tieW('npc_royce', 'npc_dewayne');
    const k0 = __tr('npc_royce').k;
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_royce', 'Dewayne is skimming off the tow bills.', persuade, { socialEvents: ['npc_royce badmouthed npc_dewayne: said Dewayne skims the tow bills'] });
    out.r1 = tieW('npc_royce', 'npc_dewayne');
    out.k = __tr('npc_royce').k - k0;
    out.log = st.ties['npc_royce>npc_dewayne'].log.map(e => [e.w, e.why, e.seen === true, e.words === true]);
    // Once a pair a day: again the same day moves nothing more.
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_royce', 'I mean it about Dewayne.', persuade, { socialEvents: ['npc_royce badmouthed npc_dewayne: said it again'] });
    out.r2 = tieW('npc_royce', 'npc_dewayne');
    // The next day, another -10; the day after, nothing: 20 in all from the player's words.
    for (const d of [4, 5]) {
      __put('loc_pittmans', ['npc_royce'], d, 'morning');
      G.Pipeline.hooks.nextTier = 'success';
      await __say('npc_royce', 'Watch Dewayne with the till.', persuade, { socialEvents: ['npc_royce badmouthed npc_dewayne: said to watch him with the till'] });
    }
    out.r3 = tieW('npc_royce', 'npc_dewayne');
    // No roll that worked: only knowing the player a little better.
    __put('loc_pittmans', ['npc_royce'], 6, 'morning');
    const k6 = __tr('npc_royce').k;
    await __say('npc_royce', 'Dewayne is fine, I suppose.', null, { socialEvents: ['npc_royce vouched_for npc_dewayne: said Dewayne is a good mechanic'] });
    out.talk = [tieW('npc_royce', 'npc_dewayne'), __tr('npc_royce').k - k6];
    // Someone who distrusts the player (trust -50) is not moved at all, however well it is said.
    S.apply({ relSet: { npcId: 'npc_royce', t: -50 } });
    __put('loc_pittmans', ['npc_royce'], 7, 'morning');
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_royce', 'Dewayne is the best mechanic in the county.', persuade, { socialEvents: ['npc_royce vouched_for npc_dewayne: spoke up for Dewayne'] });
    out.distrust = tieW('npc_royce', 'npc_dewayne');
    // And a word for him to someone who half trusts the player (trust 0: half of +8).
    S.apply({ relSet: { npcId: 'npc_royce', t: 0 } });
    __put('loc_pittmans', ['npc_royce'], 8, 'morning');
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_royce', 'Dewayne would never skim from you.', persuade, { socialEvents: ['npc_royce vouched_for npc_dewayne: took it back about Dewayne'] });
    out.vouched = tieW('npc_royce', 'npc_dewayne');
    out.wire = [G.Rel.WIRE_EVENTS.badmouthed, G.Rel.WIRE_EVENTS.vouched_for];
    return out;
  });
  assert.deepEqual(r.cost, [-5, 50], 'he likes her at 50: the player loses 5 of his liking and she loses nothing with him');
  assert.equal(r.r0, 20);
  assert.equal(r.r1, 10, 'liking -10 x (50 + 50) / 100');
  assert.equal(r.k, 3, 'and he knows the player a little better (2, and 1 for the turn aimed at him)');
  assert.deepEqual(r.log, [[-10, 'what you said about Dewayne Mangum', true, true]]);
  assert.equal(r.r2, 10, 'once a pair a day');
  assert.equal(r.r3, 0, 'at most 20 in all from the player\'s words');
  assert.deepEqual(r.talk, [0, 3], 'no roll that worked: knowing only (2, and 1 for the turn aimed at him)');
  assert.equal(r.distrust, 0, 'trust -50: none of it lands');
  assert.equal(r.vouched, 4, 'trust 0: half of +8');
  assert.deepEqual(r.wire, ['B', 'B'], 'tier B\'s words, open now');
});

s.test('a grudge\'s gossip reaches the people tied to its holder instead of a fixed list', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, R = G.Rel, st = G.state;
    const T = G.data.GRUDGE_TEMPLATES;
    const out = { ops: [7, 8, 11].map(i => T[i].effects.map(e => e.op)), named: [7, 8, 11].map(i => T[i].effects.filter(e => e.op === 'socialEvent').length) };
    // Pearl Gentry tells everybody at Wednesday supper (template 8): the people close to her hear it, not Ray and Nadine Dees by name.
    S.apply({ setTime: { day: 3, phase: 'evening' } });
    const pearl = S.npc('npc_pearl');
    const ray0 = __tr('npc_ray');
    const res = W.applyEffects(W.fillEffects(T[8].effects, { npc: pearl }));
    out.applied = res.applied || null;
    out.queued = st.hearsay.filter(x => x.aboutId === 'npc_pearl').map(x => [x.npcId, x.via, x.event]);
    out.ray = st.hearsay.some(x => x.npcId === 'npc_ray' || x.npcId === 'npc_nadine');
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    const el = S.npc('npc_elbert');
    out.elbert = el.memories.filter(m => m.secondhand && m.secondhand.via === 'npc_pearl').map(m => [m.event, m.text]);
    out.rayAfter = __tr('npc_ray').w - ray0.w;
    // The department (template 11) is whoever the holder works with: Glenda Pryor tells Chief Bell, Nikki and Travis by the morning.
    const glenda = S.npc('npc_glenda');
    W.applyEffects(W.fillEffects(T[11].effects, { npc: glenda }));
    out.dept = st.hearsay.filter(x => x.aboutId === 'npc_glenda').map(x => [x.npcId, x.via]).sort();
    // The validator's op list and the engine's: 33 ops, tieDelta and propagate among them.
    out.count = S.EFFECT_OPS.length;
    out.has = ['tieDelta', 'propagate'].map(op => S.EFFECT_OPS.includes(op));
    return out;
  });
  assert.deepEqual(r.ops, [['propagate', 'reputationDelta'], ['propagate', 'reputationDelta'], ['propagate', 'reputationDelta']], 'edited in place: their indices kept');
  assert.deepEqual(r.named, [0, 0, 0], 'no fixed list');
  assert.ok(r.queued.some(x => x[0] === 'npc_elbert'), 'her brother hears it: ' + JSON.stringify(r.queued));
  assert.ok(r.queued.every(x => x[2] === 'crossed'));
  assert.equal(r.ray, false, 'the pastor and his wife are not tied to her: they hear nothing');
  assert.deepEqual(r.elbert, [['crossed', 'heard from Pearl Gentry at Wednesday supper that Tester is not to be trusted']]);
  assert.equal(r.rayAfter, 0);
  assert.ok(r.dept.some(x => x[0] === 'npc_marcus' && x[1] === 'morning'), 'her boss, by the morning: ' + JSON.stringify(r.dept));
  assert.equal(r.count, 33);
  assert.deepEqual(r.has, [true, true]);
});

s.test('the town\'s standing moves on what happened in public', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const rep = () => st.player.reputation.town || 0;
    const out = {};
    // In front of three at the landing: the beating costs the town 5 (wave 27), once.
    __put('loc_purvis_landing', ['npc_colt', 'npc_lorna', 'npc_trent', 'npc_dewayne'], 7, 'evening');
    const r0 = rep();
    for (let i = 0; i < 3; i++) {
      M.queue('parse', { actionType: 'attack', summary: 'Hits Colt', targets: ['npc_colt'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('I hit Colt Purvis');
    }
    out.fight = rep() - r0;
    out.tier = S.reputationTier('town');
    // The word of it getting round moves nobody's opinion of the player in the town's books: the night passes and the town is where it was.
    const r1 = rep();
    const heard0 = st.hearsay.filter(x => !Number.isInteger(x.deliveredTurn)).length;
    await G.Pipeline.submit('/rest');
    out.heard = [heard0, st.hearsay.filter(x => Number.isInteger(x.deliveredTurn)).length];
    out.overnight = rep() - r1;
    // A word against someone, said to one person: not public.
    __put('loc_pittmans', ['npc_royce'], null);
    const r2 = rep();
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_royce', 'Dewayne skims the tow bills.', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' }, { socialEvents: ['npc_royce badmouthed npc_dewayne: said Dewayne skims the tow bills'] });
    out.words = rep() - r2;
    // A clock's tie change and a gossip passed along move nothing either (only the gossip template's own reputationDelta does, when it fires).
    const r3 = rep();
    S.apply({ effects: [{ op: 'tieDelta', fromId: 'npc_darlene', toId: 'npc_loretta', t: -20, known: true, why: 'the photographs in Royce\'s truck' }, { op: 'propagate', npcId: 'npc_pearl', event: 'crossed', text: 'heard Pearl Gentry run the player down' }] });
    out.quiet = rep() - r3;
    out.words2 = ['unknown', 'noticed', 'known', 'respected', 'disliked', 'despised', 'feared'].includes(out.tier);
    return out;
  });
  assert.equal(r.fight, -5, 'done in front of three: the town -5');
  assert.ok(r.heard[0] > 0 && r.heard[1] > 0, 'word got round overnight: ' + JSON.stringify(r.heard));
  assert.equal(r.overnight, 0, 'what travels by word moves no standing');
  assert.equal(r.words, 0, 'said to one person');
  assert.equal(r.quiet, 0);
  assert.equal(r.words2, true, 'Character Standing keeps its words');
});

s.test('BETWEEN THEM tells the narrator a strained marriage in one line and a hidden one never', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    const between = () => G.Pipeline.lastTurn.packet.split('\n').filter(l => /^BETWEEN THEM/.test(l));
    const cached = () => G.Style.systemPrompt('casual');
    const c0 = cached();
    // Before anything changed, both here: nothing.
    __put('loc_mangum_house', ['npc_mavis', 'npc_dewayne'], 3, 'evening');
    await __say('npc_mavis', 'Evening, both of you.');
    out.before = between();
    // The garage money told (Day 5), then both at home the next evening.
    await __holdMavis();
    __put('loc_purvis_landing', ['npc_dewayne'], 5, 'evening');
    await __say('npc_dewayne', 'Mavis emptied your garage account.', null, { socialEvents: ['npc_dewayne exposed npc_mavis: told me Mavis spent the garage money'] });
    __put('loc_mangum_house', ['npc_mavis', 'npc_dewayne'], 6, 'evening');
    await __say('npc_dewayne', 'Evening.');
    out.after = between();
    // A hidden tie the player saw change: a word for Royce Pittman to Loretta Gaddis (his lover, which nobody knows) on a persuade that worked.
    S.apply({ relSet: { npcId: 'npc_loretta', t: 50 } });
    __put('loc_low_water', ['npc_loretta', 'npc_royce'], 7, 'afternoon');
    G.Pipeline.hooks.nextTier = 'success';
    await __say('npc_loretta', 'Royce is a better man than this town gives him credit for.', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' }, { socialEvents: ['npc_loretta vouched_for npc_royce: spoke up for Royce'] });
    out.hiddenLog = st.ties['npc_loretta>npc_royce'].log.map(e => [e.w, e.seen === true]);
    await __say('npc_loretta', 'Busy afternoon.');
    out.hidden = between();
    out.cardWords = R.tieWords(S.npc('npc_loretta'), 'npc_royce');
    out.same = cached() === c0;
    return out;
  });
  assert.deepEqual(r.before, [], 'nothing between them the player saw change');
  assert.deepEqual(r.after, ['BETWEEN THEM: Dewayne Mangum and Mavis Mangum, strained since the garage money (Day 5).']);
  assert.deepEqual(r.hiddenLog, [[8, true]], 'the hidden tie moves all the same');
  assert.deepEqual(r.hidden, [], 'a hidden tie is never told');
  assert.equal(r.cardWords, '', 'nor on a card');
  assert.equal(r.same, true, 'the cached block is byte for byte the same');
});

s.run();
