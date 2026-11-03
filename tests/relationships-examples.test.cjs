'use strict';
/* The design's worked examples as executable tests (docs/relationships/
   design.md section 6.4; the integration plan's 15.1). Each is its own
   playthrough, scripted through the mock (Api.Mock.queue for the parses and
   the bookkeeper's replies): the tracks within 2 of the design's numbers,
   the stance and the feed lines exact where the feature exists by this
   wave. Where the code's number differs from the design's the code's is
   pinned and design.md says so. Wave 27 (A2) starts the file with
   example 4 (Colt on the ground: its A part) and example 7 (Tyler: afraid
   of you); wave 28 (A3) adds example 1 (Dewayne in his own bay), 3(b)
   (the drinking buddy) and 5 (the surveyor who wasn't), their A parts;
   wave 29 (A4) adds the ones about what people hold: 2 (the garage money,
   its A part), 6 (Trent), 8 (Burl), 10 (Shayla and Jodie), 11 (Hollis),
   12 (Glenda's $200, three ways) and 14 (coercion fails; the minor variant
   is tests/relationships.test.cjs's); wave 30 (A5) makes example 3 whole:
   (a) the confidant and (c) the bully, each to the council. Wave 31 (B1)
   adds the B parts of 1, 4 and 5, and 9 (Loretta goes quiet); wave 32 (B2)
   the B parts of 2 (the tie that changes) and 11 (the hidden tie the
   report goes through); wave 33 adds 15 (Jodie at the motor court: a kiss
   aimed at "her", from the owner's own game). Wave 34: a flirt is a charm
   roll at the person's difficulty, so the flirts here are forced to land
   (__say's window.__tier, success unless a test says otherwise; the kiss
   in 15 by hooks.nextTier), and 14 pins that coercion never rolls.
   Run with: node tests/run.cjs relationships-examples */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('relationships-examples');
const near = (got, want, what) => assert.ok(Math.abs(got - want) <= 2, `${what}: ${got}, the design's ${want}`);
const feedSince = (page, n) => page.evaluate(n => [...document.querySelectorAll('#feed .f-quiet')].slice(n).map(x => x.textContent), n);
const feedCount = page => page.evaluate(() => document.querySelectorAll('#feed .f-quiet').length);

s.test('example 4, Colt on the ground (A): three hits at the landing are one memory, a beat-down; the three who saw it hold one copy each; the town -5; a tough man answers with violence in three to five days', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => {
    const S = Game.State;
    S.apply({ setTime: { day: 7, phase: 'evening' } });
    S.apply({ playerLocationId: 'loc_purvis_landing' });
    S.apply({ visits: ['npc_colt', 'npc_lorna', 'npc_trent', 'npc_dewayne'].map(id => ({ npcId: id, locationId: 'loc_purvis_landing' })) });
  });
  const f0 = await feedCount(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const rep0 = st.player.reputation.town || 0;
    for (let i = 0; i < 3; i++) {
      M.queue('parse', { actionType: 'attack', summary: 'Hits Colt', targets: ['npc_colt'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('I hit Colt Purvis');
    }
    const c = S.npc('npc_colt');
    const watch = id => { const n = S.npc(id); return { tracks: R.tracksOf(n), stance: R.stance(n).phrase, copies: n.memories.filter(m => m.witness).length }; };
    const g = st.seeds.find(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === 'npc_colt');
    return {
      colt: { tracks: R.tracksOf(c), stance: R.stance(c), mems: c.memories.map(m => m.event) },
      lorna: watch('npc_lorna'), trent: watch('npc_trent'), dewayne: watch('npc_dewayne'),
      rep: (st.player.reputation.town || 0) - rep0,
      grudge: g ? { template: g.origin.template, effect: g.effect, day: g.trigger.value } : null,
      caught: st.npcs.some(n => (n.memories || []).some(m => m.event === 'caught_you_at')),
      news: st.news.filter(x => /knocked Colt Purvis down/.test(x.text)).length
    };
  });
  // Colt: tough (hard, fear held at 39), nerve +1, pride +1; start liking 5, trust -10 (a smuggler).
  near(r.colt.tracks.w, -30, 'Colt\'s liking');
  near(r.colt.tracks.t, -25, 'Colt\'s trust');
  near(r.colt.tracks.f, 26, 'Colt\'s fear');
  assert.deepEqual([r.colt.tracks.w, r.colt.tracks.t, r.colt.tracks.f], [-30, -25, 26]);
  assert.equal(r.colt.stance.phrase, 'against you');
  assert.equal(r.colt.stance.tags[0], 'uneasy around you', '"against you · uneasy around you"');
  assert.deepEqual(r.colt.mems, ['beat_down'], 'the beat-down replaced the fight\'s memory');
  assert.equal(r.rep, -5, 'town reputation -5');
  // His answer: the beating (template 4, "gets you away from the others and beats you"), due Day 10 to 12.
  assert.ok(r.grudge, 'a violence grudge at once, whatever his liking');
  assert.equal(r.grudge.template, 4);
  assert.match(r.grudge.effect, /^Colt Purvis gets Tester away from the others for a minute and beats them/);
  assert.ok(r.grudge.day >= 10 && r.grudge.day <= 12, 'due Day 10 to 12: ' + r.grudge.day);
  assert.equal(r.caught, false, 'done in front of three people and news: nobody gets a caught_you_at record');
  assert.equal(r.news, 1);
  // The witnesses (A: the witness row, one copy each, -18 in liking: -5, -5, -8). Wave 31: Lorna (his aunt) and Trent (his friend)
  // take their tie's share of the fight into the same copy too (the B part, below), so only Dewayne, with no tie to him, is at -18.
  for (const w of ['lorna', 'trent', 'dewayne']) {
    assert.equal(r[w].copies, 1, `${w}: one copy`);
    if (w === 'dewayne') assert.equal(r[w].tracks.w, -18, 'dewayne: liking -18 (-5, -5, -8)');
    else assert.ok(r[w].tracks.w < (w === 'trent' ? 10 : 5) - 18, `${w}: the witness rows and more`);
  }
  assert.equal(r.dewayne.stance, 'cool to you');
  // What the player sees on Day 7 (the band lines; wave 30 brings the stance's own words).
  // The design's "Lorna Purvis cools toward you." needs her known to the player; here she is a stranger at the dock, so only Colt's line.
  const feed = (await feedSince(page, f0)).filter(t => /won't forget that|cools toward you|warms to you/.test(t));
  assert.deepEqual(feed, ['Colt Purvis won\'t forget that.'], JSON.stringify(feed));
});

s.test('example 7, Tyler: afraid of you (A): threatened twice at the desk he is afraid, hands over the drive with no roll, and tells his boss Mavis, who cools', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const threat = day => page.evaluate(async day => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel;
    S.apply({ setTime: { day, phase: 'night' } });
    S.apply({ playerLocationId: 'loc_motor_court' });
    // At the desk with Tyler alone (the others who keep the night there are elsewhere tonight).
    const others = S.npcsAt('loc_motor_court').map(n => n.id).filter(id => id !== 'npc_tyler');
    S.apply({ visits: [{ npcId: 'npc_tyler', locationId: 'loc_motor_court' }].concat(others.map(id => ({ npcId: id, locationId: 'loc_front_street' }))) });
    M.queue('parse', { actionType: 'intimidate', summary: 'Threatens Tyler over the drive', targets: ['npc_tyler'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('Give me the drive or I put you through that vending machine.');
    const t = S.npc('npc_tyler');
    return { tracks: R.tracksOf(t), stance: R.stance(t), mems: t.memories.map(m => [m.event, m.n]), present: S.npcsAt('loc_motor_court').map(n => n.id) };
  }, day);
  const f0 = await feedCount(page);
  const d4 = await threat(4);
  const f1 = await feedCount(page);
  const d5 = await threat(5);
  assert.ok(d4.present.includes('npc_tyler'));
  // Day 4 (start liking 5, trust -5: watchful): W -5, T -17, F 25, "sizing you up · uneasy around you".
  assert.deepEqual([d4.tracks.w, d4.tracks.t, d4.tracks.f], [-5, -17, 25]);
  assert.equal(d4.stance.phrase, 'sizing you up');
  assert.deepEqual(d4.stance.tags, ['uneasy around you']);
  // Day 5, again: it compounds (x1.5) and merges: W -19, T -33, F 58 (the code: 59), "afraid of you".
  near(d5.tracks.w, -19, 'liking');
  near(d5.tracks.t, -33, 'trust');
  near(d5.tracks.f, 58, 'fear');
  assert.deepEqual([d5.tracks.w, d5.tracks.t, d5.tracks.f], [-19, -33, 59]);
  assert.equal(d5.stance.phrase, 'afraid of you');
  assert.deepEqual(d5.mems, [['threatened', 2]], 'one memory, merged');
  // The thumb drive: no roll (an adult afraid of the player; the d20 is still drawn).
  const ask = await page.evaluate(async () => {
    const G = Game, M = G.Api.Mock, st = G.state;
    M.queue('parse', { actionType: 'persuade', summary: 'Asks for the thumb drive', targets: ['npc_tyler'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    M.queue('bookkeep', { itemsGained: ['Thumb drive with motel clips'] });
    const c0 = st.meta.rngCalls;
    await G.Pipeline.submit('The drive. Now.');
    const e = st.log[st.log.length - 1];
    return { roll: e.roll, draws: st.meta.rngCalls - c0, got: st.player.inventory.some(i => /thumb drive with motel clips/i.test(i.name)) };
  });
  assert.equal(ask.roll, null, 'no roll');
  assert.ok(ask.draws >= 1, 'the d20 is drawn all the same');
  assert.equal(ask.got, true, 'the drive changes hands');
  // Report: threat-made fear, whatever the liking; his protector is his boss, Mavis. Planted overnight, due in a day or two.
  const rep = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const m0 = R.tracksOf(S.npc('npc_mavis'));
    await G.Pipeline.submit('/rest');
    const sd = st.seeds.find(x => x.origin && x.origin.kind === 'report' && x.origin.npcId === 'npc_tyler');
    const planted = sd ? { protectors: sd.origin.protectors, effect: sd.effect, due: sd.trigger.value, day: st.time.day } : null;
    for (let i = 0; i < 3 && sd && !sd.fired; i++) await G.Pipeline.submit('/rest');
    const m = S.npc('npc_mavis');
    return { planted, fired: !!(sd && sd.fired), m0, m1: R.tracksOf(m), stance: R.stance(m).phrase, mem: m.memories.filter(x => x.event === 'crossed').map(x => x.text) };
  });
  assert.ok(rep.planted, 'the next day Debug shows a report seed to Mavis');
  assert.deepEqual(rep.planted.protectors, ['npc_mavis']);
  assert.equal(rep.planted.effect, 'Tyler Rasberry tells Mavis Mangum that Tester has been leaning on them, and Mavis Mangum goes cold on Tester.');
  assert.equal(rep.fired, true);
  assert.deepEqual(rep.mem, ['Tyler Rasberry says Tester has been leaning on them.']);
  // Mavis (start W -5, T -10; guarded: trust losses x1.3): W -10, T -13, so W -15, T -23, "cool to you".
  assert.deepEqual([rep.m1.w - rep.m0.w, rep.m1.t - rep.m0.t], [-10, -13]);
  near(rep.m1.w, -15, 'Mavis\'s liking');
  near(rep.m1.t, -23, 'Mavis\'s trust');
  assert.equal(rep.stance, 'cool to you');
  // What the player sees (the band lines; wave 30 brings "is afraid of you"): Day 4 nothing crosses, Day 5 he will not forget it.
  const day4 = (await feedSince(page, f0)).slice(0, f1 - f0).filter(t => /won't forget|cools|warms/.test(t));
  assert.deepEqual(day4, [], 'Day 4: liking 5 to -5 stays in its band');
  const all = (await feedSince(page, f1)).filter(t => /won't forget|cools|warms/.test(t));
  assert.ok(all.includes('Tyler Rasberry won\'t forget that.'), JSON.stringify(all));
});

/* Wave 28 (A3): examples 1 (its A part), 3(b) and 5 (its A part), now that
   the bookkeeper names the act and the engine reads trust. */
s.test('example 1, Dewayne in his own bay (A): a hit over a tow bill in front of three, then an apology that lands and a gift for his safety glasses: "cool to you · uneasy around you"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const put = (day, ids) => page.evaluate(([day, ids]) => {
    const S = Game.State;
    S.apply({ setTime: { day, phase: 'morning' } });
    S.apply({ playerLocationId: 'loc_pittmans' });
    S.apply({ visits: ids.map(id => ({ npcId: id, locationId: 'loc_pittmans' })) });
    return S.npcsAt('loc_pittmans').map(n => n.id);
  }, [day, ids]);
  // Day 2 left him at knows-you 7, and the player knows him (the band line needs that).
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.State.apply({ relSet: { npcId: 'npc_dewayne', k: 7 }, npcKnownToPlayer: ['npc_dewayne'] }); });
  const here = await put(3, ['npc_dewayne', 'npc_royce', 'npc_jodie', 'npc_lamar']);
  const f0 = await feedCount(page);
  const d3 = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel;
    M.queue('parse', { actionType: 'attack', summary: 'Hits Dewayne over the tow bill', targets: ['npc_dewayne'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I hit Dewayne over the tow bill');
    const w = id => { const m = S.npc(id).memories.find(x => x.witness); return m ? [m.d.w, m.d.t, m.d.f] : null; };
    return { tracks: R.tracksOf(S.npc('npc_dewayne')), stance: R.stance(S.npc('npc_dewayne')), royce: w('npc_royce'), jodie: w('npc_jodie'), lamar: w('npc_lamar') };
  });
  const day3 = (await feedSince(page, f0)).filter(t => /won't forget|cools|warms/.test(t));
  for (const id of ['npc_dewayne', 'npc_royce', 'npc_jodie', 'npc_lamar']) assert.ok(here.includes(id), id + ' is at Pittman\'s');
  // Dewayne (guarded, g -1; start trust -5): W -25, T -5 - 10 x 1.15 = -17, F 20, knowing 7 + 2 (and +1 for the turn aimed at him).
  assert.deepEqual([d3.tracks.w, d3.tracks.t, d3.tracks.f], [-25, -17, 20]);
  near(d3.tracks.k, 9, 'knowing');
  assert.equal(d3.stance.phrase, 'against you');
  assert.ok(d3.stance.tags.includes('uneasy around you'), '"against you · uneasy around you"');
  // The witnesses, one lighter copy each: Royce (open, timid) W -5, T -4, F +10; Jodie (guarded) W -5, T -6, F +8; Lamar (worried) W -5, T -5, F +10.
  // Wave 31: Royce is Dewayne's boss, and what his tie carries joins his copy (W -4, T -2, F +2: example 1's B part).
  assert.deepEqual(d3.royce, [-9, -6, 12]);
  assert.deepEqual(d3.jodie, [-5, -6, 8]);
  assert.deepEqual(d3.lamar, [-5, -5, 10]);
  assert.ok(day3.includes('Dewayne Mangum won\'t forget that.'), JSON.stringify(day3));
  // Day 4: the apology rolls charm and succeeds (it must land: he is at -25, not above it), then $40 for his safety glasses.
  await put(4, ['npc_dewayne']);
  const d4 = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel;
    M.queue('parse', { actionType: 'persuade', summary: 'Apologises for the hit', targets: ['npc_dewayne'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit("I'm sorry about yesterday. I was out of line.", { mode: 'say', to: 'npc_dewayne' });
    const hit = S.npc('npc_dewayne').memories.find(m => m.event === 'hit');
    const settled = hit ? R.settlements(hit).map(x => x.by) : null;
    await G.Pipeline.submit('I give Dewayne $40 for his safety glasses');
    const n = S.npc('npc_dewayne');
    return { tracks: R.tracksOf(n), stance: R.stance(n), settled, gift: n.memories.filter(m => m.event === 'gift').map(m => m.text) };
  });
  assert.deepEqual(d4.settled, ['apologised'], 'insulted is settled by apologised: the hit, softened');
  assert.deepEqual(d4.gift, ['gave me $40'], 'the engine\'s gift');
  // W -12 (the hit halved, a day faded) + 5 (the gift) + 2 (the apology) = -5; T -13 (the code: -14); F 17.
  assert.equal(d4.tracks.w, -5);
  near(d4.tracks.t, -13, 'trust');
  assert.equal(d4.tracks.f, 17);
  // Knowing: the design's 13; the code's 15 (the +1 for each turn aimed at him) is pinned.
  near(d4.tracks.k, 13, 'knowing');
  assert.equal(d4.tracks.k, 15);
  // The design's "sizing you up" misses liking's own hysteresis: cool is left only above -1, so W -5 is still cool (design.md now says so).
  assert.equal(d4.stance.phrase, 'cool to you');
  assert.ok(d4.stance.tags.includes('uneasy around you'), 'fear 17 is still uneasy (entered at 20, left below 15)');
});

s.test('example 3(b), Royce the drinking buddy (A): rounds, compliments and time together make him warm to the player, never more, and his trust never moves', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    M.delay = 0;
    const days = [], mornings = {};
    const day = async (d, compliment, round) => {
      S.apply({ setTime: { day: d, phase: 'morning' } });
      mornings[d] = R.tracksOf(S.npc('npc_royce'));
      S.apply({ playerLocationId: 'loc_pittmans' });
      S.apply({ visits: [{ npcId: 'npc_royce', locationId: 'loc_pittmans' }] });
      if (round) await G.Pipeline.submit('I hand Royce $5 for a round later');
      if (compliment) { M.queue('bookkeep', { socialEvents: ['npc_royce complimented: liked my coffee'] }); await G.Pipeline.submit('Good coffee, Royce.', { mode: 'say', to: 'npc_royce' }); }
      M.queue('parse', { actionType: 'talk', summary: 'Small talk', targets: ['npc_royce'], needsRoll: false, timeCost: 'instant' });
      await G.Pipeline.submit('Slow morning?', { mode: 'say', to: 'npc_royce' });
      G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
      const t = R.tracksOf(S.npc('npc_royce'));
      days.push({ d, w: t.w, t: t.t, stance: R.stance(S.npc('npc_royce')).phrase, everyday: S.npc('npc_royce').rel.everyday.w });
    };
    for (let d = 2; d <= 5; d++) await day(d, true, d <= 4);
    const night = days[days.length - 1];
    for (let d = 6; d <= 15; d++) await day(d, false, true);
    // The morning after the four days, the overnight fade taken (Day 5's own close is pinned too).
    const four = Object.assign({}, mornings[6], { stance: night.stance, night: night.w });
    return { four, after: days.slice(4), start: R.startOf(G.data.TOWN_DATA.npcs.find(n => n.id === 'npc_royce')) };
  });
  assert.deepEqual([r.start.w, r.start.t], [10, 5], 'Royce starts at W 10, T 5');
  // Days 2 to 5: three rounds (gifts, Days 2 to 4), four compliments, four days of time together.
  // The design's W 32 is the next morning; the code ends Day 5 at 36 and fades to it overnight.
  near(r.four.w, 32, 'liking after four days');
  assert.equal(r.four.night, 36, 'Day 5\'s close');
  assert.equal(r.four.t, 5, 'trust doesn\'t move');
  assert.equal(r.four.stance, 'warm to you');
  for (const x of r.after) {
    assert.equal(x.t, 5, `day ${x.d}: trust doesn't move`);
    assert.equal(x.stance, 'warm to you', `day ${x.d}: still warm to you, never more`);
    assert.ok(x.w < 60, `day ${x.d}: never devoted (${x.w})`);
    assert.ok(x.everyday <= 15, 'the everyday bucket stops at 15');
  }
});

/* Wave 30 (A5): example 3 whole. (b) is above; (a) the confidant and (c)
   the bully play through to the council, which reads trust (the town's
   relAtLeast), not beers and not fear. */
const ex3 = page => page.evaluate(() => {
  const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
  M.delay = 0;
  S.apply({ npcKnownToPlayer: ['npc_royce', 'npc_elbert'] });
  window.__ex3 = {
    put(loc, ids) {
      S.apply({ playerLocationId: loc });
      if (ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: loc })) });
      const others = S.npcsAt(loc).map(n => n.id).filter(id => !ids.includes(id));
      if (others.length) S.apply({ visits: others.map(id => ({ npcId: id, locationId: 'loc_front_street' })) });
    },
    say(words, book, narration) {
      M.queue('parse', { actionType: 'talk', summary: words, targets: ['npc_royce'], needsRoll: false, timeCost: 'instant', romantic: null });
      if (narration) M.queue('narrate', { text: narration });
      if (book) M.queue('bookkeep', book);
      return G.Pipeline.submit(words, { mode: 'say', to: 'npc_royce' });
    },
    afternoon(d, ids) {
      S.apply({ setTime: { day: d, phase: 'morning' } });
      let k = 0;
      while (st.time.phase !== 'afternoon' && k++ < 4) G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
      this.put('loc_low_water', ids || ['npc_royce']);
    },
    sleep() { const d = st.time.day; let k = 0; while (st.time.day === d && k++ < 6) G.Pipeline.passTime({ cost: st.time.phase === 'night' ? 'rest' : 'long', cause: st.time.phase === 'night' ? 'rest' : 'wait' }, st.time.phase === 'night' ? 'rest' : 'wait'); },
    royce() { const n = S.npc('npc_royce'); const t = R.tracksOf(n); const s = R.stance(n); return { day: st.time.day, w: t.w, t: t.t, f: t.f, k: t.k, stance: s.phrase, tags: s.tags, mems: n.memories.map(m => m.event) }; },
    // The council branch that holds, with the player at Town Hall or elsewhere.
    council(at) {
      const ev = G.data.TOWN_DATA.events.find(e => e.id === 'evt_council_meeting');
      const i = ev.branches.findIndex(b => G.World.conditionsMet(b.when, at ? { playerAt: at } : { playerAway: true }));
      const b = i >= 0 ? ev.branches[i] : ev.default;
      return { royce: i >= 0 && !!b.when.relAtLeast && !!b.when.relAtLeast.npc_royce ? Object.assign({}, b.when.relAtLeast.npc_royce) : null, tabled: b.effects.some(e => e.key === 'bridgeVoteTabled'), text: b.text };
    }
  };
});

s.test('example 3(a), Royce the confidant (A): four afternoons, a confidence each way and a word kept with Elbert asking make him "in your corner" at trust 32, and the council is tabled on trust; the staged version is downgraded and the branch fails', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await ex3(page);
  const r = await page.evaluate(async () => {
    const x = window.__ex3;
    for (let d = 2; d <= 5; d++) {
      x.afternoon(d, d === 5 ? ['npc_royce', 'npc_elbert'] : null);
      if (d === 4) await x.say('Carter wrote you a note about the station?', { socialEvents: ['npc_royce they_confided: told me about the note Carter wrote on the station', 'npc_royce confided: I told him why I really came to town'] });
      else if (d === 5) await x.say('I would not say.', { socialEvents: ['npc_royce kept_word: kept quiet when Elbert asked how I\'d vote'] }, 'Elbert Gentry leans over from the card table. "So how\'s Royce going to vote?" he asks you. You say nothing, and Royce lets out a breath.');
      else await x.say('Quiet afternoon.');
      x.sleep();
    }
    return { day6: x.royce(), away: x.council(null), hall: x.council('loc_town_hall') };
  });
  // The design's W 29, T 32, K 46 assumes three turns aimed at him a day (K +12); with one an afternoon the code has
  // W 26, T 32, K 32 on the morning of Day 6 (design.md says so). Trust, the number the vote reads, is the design's.
  assert.deepEqual([r.day6.w, r.day6.t, r.day6.k], [26, 32, 32]);
  assert.equal(r.day6.stance, 'in your corner');
  assert.deepEqual(r.day6.mems, ['they_confided', 'confided', 'kept_word'], 'the kept word held: Elbert asked, with Royce there, a day after the confidence');
  // The council: trust 30 and knows 25 holds, from anywhere: tabled, the police kept.
  for (const c of [r.away, r.hall]) {
    assert.deepEqual(c.royce, { trust: 30, knows: 25 });
    assert.equal(c.tabled, true);
    assert.match(c.text, /somebody to talk it through with/);
  }
  // The fake path: a Day-1 confidence, then "Carter asked me and I told him nothing" on Day 2 with nobody asking
  // (the confidence not a day old, Carter not there): downgraded to confided (T +6), and the trust branch fails.
  const page2 = await h.open();
  await quickStart(page2, { kinds: [] });
  await ex3(page2);
  const f = await page2.evaluate(async () => {
    const x = window.__ex3, S = Game.State;
    S.apply({ setTime: { day: 1, phase: 'afternoon' } });
    x.put('loc_low_water', ['npc_royce']);
    await x.say('Carter wrote you a note about the station?', { socialEvents: ['npc_royce they_confided: told me about the note Carter wrote on the station'] });
    x.sleep();
    x.afternoon(2);
    await x.say('Carter asked me and I told him nothing.', { socialEvents: ['npc_royce kept_word: Carter asked me and I told him nothing'] }, 'Royce Pittman nods slowly. "Carter asked me and I told him nothing," you say, and he lets out a breath.');
    const day2 = x.royce();
    for (let d = 3; d <= 5; d++) { x.sleep(); x.afternoon(d); await x.say('Quiet afternoon.'); }
    x.sleep();
    return { day2, day6: x.royce(), away: x.council(null), hall: x.council('loc_town_hall') };
  });
  assert.deepEqual(f.day2.mems, ['they_confided', 'confided'], 'kept_word downgraded');
  assert.equal(f.day6.t, 13, 'trust 5 + 4 + 6, faded a little');
  assert.ok(f.day6.t < 30 && f.day6.stance !== 'in your corner', JSON.stringify(f.day6));
  assert.equal(f.away.royce, null, 'from elsewhere no Royce branch');
  // From the back row, he is warm enough (liking 15) for the friendly face; that is all.
  assert.deepEqual(f.hall.royce, { liking: 15 });
});

s.test('example 3(c), Royce the bully (A): threatened on Days 4 and 5 he is afraid of you, tells Chief Bell, who cools; the council has no fear branch; what the player knows about him frightens him, and the vote still reads trust', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await ex3(page);
  const f0 = await feedCount(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state, x = window.__ex3;
    const out = { days: [] };
    for (const d of [4, 5]) {
      S.apply({ setTime: { day: d, phase: 'morning' } });
      x.put('loc_pittmans', ['npc_royce']);
      M.queue('parse', { actionType: 'intimidate', summary: 'Threatens Royce over the vote', targets: ['npc_royce'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('Vote the bridge down or I burn your pumps.');
      out.days.push(x.royce());
      if (d === 4) x.sleep();
    }
    x.sleep();
    S.apply({ setTime: { day: 6, phase: 'evening' } });
    out.tuesday = x.royce();
    const sd = st.seeds.find(s => s.origin && s.origin.kind === 'report' && s.origin.npcId === 'npc_royce');
    out.seed = sd ? { protectors: sd.origin.protectors, effect: sd.effect, due: sd.trigger.value } : null;
    out.away = x.council(null);
    out.hall = x.council('loc_town_hall');
    for (let i = 0; i < 3 && sd && !sd.fired; i++) await G.Pipeline.submit('/rest');
    out.fired = !!(sd && sd.fired);
    const mem = S.npc('npc_marcus').memories.find(m => m.event === 'crossed');
    out.marcus = mem ? { text: mem.text, w: mem.d.w, t: mem.d.t } : null;
    return out;
  });
  const [d4, d5] = r.days;
  assert.deepEqual([d4.w, d4.t, d4.f, d4.stance], [0, -4, 31, 'sizing you up']);
  // Day 5: F 66, W -14, T -15 (the code: -16), "afraid of you"; one memory, merged.
  assert.equal(d5.f, 66);
  near(d5.w, -14, 'liking');
  near(d5.t, -15, 'trust');
  assert.equal(d5.stance, 'afraid of you');
  assert.deepEqual(d5.mems, ['threatened']);
  // Tuesday evening: 55 (the code: 56).
  near(r.tuesday.f, 55, 'fear by Tuesday evening');
  assert.equal(r.tuesday.stance, 'afraid of you');
  // The report: threat-made fear fires whatever the liking; his protector is the police.
  assert.deepEqual(r.seed && r.seed.protectors, ['npc_marcus']);
  assert.equal(r.seed.effect, 'Royce Pittman goes to Marcus Bell and says Tester has been leaning on them, and Marcus Bell writes it down.');
  assert.equal(r.fired, true);
  // Marcus: W -5, T -11.5 (police row, scaled by his guardedness, g -1), rounded.
  assert.deepEqual(r.marcus, { text: 'Royce Pittman came to me saying Tester has been leaning on them.', w: -5, t: -12 });
  // The council: the fear branch is out of the plan. From elsewhere nothing of Royce's; at Town Hall not even the friendly face.
  assert.equal(r.away.royce, null);
  assert.equal(r.hall.royce, null);
  // The feed: Day 4 the fear shows ("gives you room"); Day 5 the merged threat is one he won't forget, one line a person.
  const feed = (await feedSince(page, f0)).filter(t => /^Royce Pittman /.test(t));
  assert.deepEqual(feed.slice(0, 2), ['Royce Pittman gives you room.', 'Royce Pittman won\'t forget that.']);
  // Leverage on Royce (his Carter secret, weight 3): fear of what you know 30, as Mavis's in example 2, so the code reads
  // "you have something on them · uneasy around you" (the override, "afraid of what you know", is fear 40; design.md
  // says so). The vote still reads trust.
  const lev = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, x = window.__ex3;
    S.apply({ relSet: { npcId: 'npc_royce', w: 10, t: 5, f: 0 } });
    S.apply({ leverageAdd: { holder: 'player', over: 'npc_royce', about: { kind: 'secret' }, text: 'took Carter\'s note on the station and a cut of the truck stop', weight: 3, aware: true } });
    const n = S.npc('npc_royce');
    return { stance: R.stance(n), f: R.tracksOf(n).f, away: x.council(null) };
  });
  assert.equal(lev.f, 30);
  assert.deepEqual(lev.stance.tags.slice(0, 2), ['you have something on them', 'uneasy around you'], JSON.stringify(lev.stance));
  assert.equal(lev.away.royce, null, 'the vote still reads trust');
});

s.test('example 5, the surveyor who wasn\'t (A): a claim held, a lie logged, the lie caught: Marcus at W -10, T -50, "suspicious of you"; lies to him are very hard and his secret is shut', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel;
    M.delay = 0;
    const put = d => { S.apply({ setTime: { day: d, phase: 'morning' } }); S.apply({ playerLocationId: 'loc_town_hall' }); S.apply({ visits: [{ npcId: 'npc_marcus', locationId: 'loc_town_hall' }] }); };
    put(2);
    M.queue('parse', { actionType: 'deceive', summary: 'Claims to be a state surveyor', targets: ['npc_marcus'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit("I'm a surveyor from the state.", { mode: 'say', to: 'npc_marcus' });
    const m = S.npc('npc_marcus');
    const day2 = { noted: m.memories.filter(x => x.event === 'noted').map(x => x.text), asks: m.rel.asks.map(a => a.act), tracks: R.tracksOf(m) };
    put(3);
    M.queue('parse', { actionType: 'talk', summary: 'Says they are checking the bridge again', targets: ['npc_marcus'], needsRoll: false, timeCost: 'instant' });
    M.queue('narrate', '"You lied to me," Marcus Bell says. "There is no state surveyor by that name."');
    M.queue('bookkeep', { socialEvents: ['npc_marcus lied_caught: no state surveyor by that name'] });
    await G.Pipeline.submit('Just checking the bridge again.', { mode: 'say', to: 'npc_marcus' });
    return { day2, tracks: R.tracksOf(m), stance: R.stance(m).phrase, lie: R.lieWord(m), floor: G.Pipeline.normaliseParse({ actionType: 'deceive', summary: 'x', targets: ['npc_marcus'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' }).difficulty, secret: R.secretOpen(m), dice: R.rollMod(m, 'deceive'), caught: m.memories.filter(x => x.event === 'lied_caught').map(x => x.text) };
  });
  assert.deepEqual(r.day2.noted, ['says they are a surveyor from the state'], 'the claim, held to the player');
  assert.deepEqual(r.day2.asks, ['deceive'], 'the deceive is logged');
  assert.deepEqual(r.caught, ['no state surveyor by that name'], 'the precondition is met: a logged lie');
  // Marcus (start W -5, T -15; guarded, g -1: trust losses x1.15): W -10, T -15 - 30 x 1.15 = -50.
  assert.deepEqual([r.tracks.w, r.tracks.t], [-10, -50]);
  assert.equal(r.stance, 'suspicious of you');
  assert.deepEqual([r.lie, r.floor, r.dice], ['very hard', 'very_hard', -2], 'lies to him are very hard, and -2 on the dice');
  assert.equal(r.secret, false, 'his secret is shut');
});

/* Wave 29 (A4): examples 2 (A), 6, 8, 10, 11, 12 and 14, now that spark,
   leverage and favours owed exist. The helpers they share go on the page:
   __put (time, place, who is there), __say (a Say turn with the parse, the
   bookkeeper's reply and the narration queued), __mark and __feed (the
   quiet lines since the mark), __tr (the tracks) and __st (the stance
   phrase, then its tags). */
const kit = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    if (ids && ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  // Wave 34: a flirt rolls charm; its tier is forced (window.__tier; null leaves it to the dice).
  window.__tier = 'success';
  window.__say = async (to, words, parse, book, narration) => {
    if (parse && (parse.romantic === 'flirt' || parse.romantic === 'more') && window.__tier) G.Pipeline.hooks.nextTier = window.__tier;
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
});
const wtf = x => [x.w, x.t, x.f];

s.test('example 2, the garage money (A): a charm roll and two of her keys in the narration make leverage on Mavis; telling Dewayne spends it, and by morning she is against you, not with contempt, and the police are no longer barred', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_mavis', 'npc_dewayne'] });
    __mark();
    // Day 4 night at the motel desk, Mavis alone.
    __put('loc_motor_court', ['npc_mavis'], 4, 'night');
    const others = S.npcsAt('loc_motor_court').map(n => n.id).filter(id => id !== 'npc_mavis');
    S.apply({ visits: others.map(id => ({ npcId: id, locationId: 'loc_front_street' })) });
    G.Pipeline.forceNextRoll(17);
    await __say('npc_mavis', 'Long night at the desk?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_mavis learned_secret: emptied Dewayne\'s garage account for Mama\'s note'] },
      'Mavis Mangum looks at the motel till a long time. "I emptied the garage account," she says. "All of it. For my mother\'s note on the house."');
    out.d4 = [__tr('npc_mavis'), __st('npc_mavis'), st.leverage.map(x => [x.id, x.holder, x.over, x.weight, x.aware, x.mattersTo]), R.policeBarred(S.npc('npc_mavis'))];
    out.feed4 = __feed();
    __mark();
    // Day 5 evening at the landing: the player tells Dewayne.
    __put('loc_purvis_landing', ['npc_dewayne'], 5, 'evening');
    const d0 = __tr('npc_dewayne');
    await __say('npc_dewayne', 'Mavis emptied your garage account to pay off her mother\'s note.', null, { socialEvents: ['npc_dewayne exposed npc_mavis: told me Mavis spent the garage money'] });
    out.dewayne = __tr('npc_dewayne').t - d0.t;
    out.rec = st.leverage.map(x => [x.status, x.knownBy.map(k => k.npcId)]);
    await G.Pipeline.submit('/rest');
    const mv = S.npc('npc_mavis');
    out.mavis = [__tr('npc_mavis'), __st('npc_mavis'), R.stance(mv).contempt, R.policeBarred(mv), mv.memories.filter(m => m.event === 'exposed').map(m => [m.weight, m.decay, m.text])];
    out.feed5 = __feed();
    return out;
  });
  // Mavis (start W -5, T -10; guarded g -2): fear of what you know 30. Run alone, without example 1's Day 3, she is 3 warmer than the design's
  // W -8, T -13, F 33, and at W -5 still "sizing you up" (design.md says so); the tag is "on them" (the integration plan's words).
  assert.deepEqual(wtf(r.d4[0]), [-5, -10, 30]);
  assert.deepEqual(r.d4[1], ['sizing you up', 'you have something on them', 'uneasy around you']);
  assert.deepEqual(r.d4[2], [['lev_mavis_1', 'player', 'npc_mavis', 3, true, ['npc_dewayne']]], 'weight 3, aware, mattering to Dewayne');
  assert.equal(r.d4[3], true, 'she won\'t go to the police while you hold it');
  assert.deepEqual(r.feed4, ['Mavis Mangum knows you know.']);
  assert.equal(r.dewayne, 6, 'Dewayne: trust +6');
  assert.deepEqual(r.rec, [['spent', ['npc_dewayne']]], 'the record is spent; no whenTold (not a police matter)');
  // By morning: the leverage fear goes and the exposure lands (the design's W -38, T -52, F 2 less example 1's 3).
  assert.deepEqual(wtf(r.mavis[0]), [-35, -49, 0]);
  assert.equal(r.mavis[1][0], 'against you');
  assert.equal(r.mavis[2], false, 'exposed counts as harm: no contempt');
  assert.equal(r.mavis[3], false, 'the police are no longer barred');
  assert.deepEqual(r.mavis[4], [[3, 'scar', 'Tester told Dewayne Mangum what I was hiding: emptied Dewayne\'s garage account for Mama\'s note']]);
  // The band line is wave 27's; wave 32 adds the morning's "Word got round" (she hears who told by the tie: overnight, his wife).
  assert.deepEqual(r.feed5.filter(t => !/^Word got round/.test(t)), ['Mavis Mangum won\'t forget that.']);
});

s.test('example 6, Trent: fond of you, doesn\'t trust you (A): three nights at the landing, then caught lying in the grain truck\'s cab in front of others is no leverage; kept quiet for him on Day 7, he is warm again', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = { start: __tr('npc_trent') };
    S.apply({ npcKnownToPlayer: ['npc_trent'] });
    for (let d = 2; d <= 4; d++) {
      __put('loc_purvis_landing', ['npc_trent'], d, 'evening');
      await __say('npc_trent', 'Quiet out here tonight.');
      if (d >= 3) await G.Pipeline.submit('I hand Trent $8 for a six-pack');
      if (d === 3) await __say('npc_trent', 'You drive that truck like you own the road.', null, { socialEvents: ['npc_trent complimented: said I drive like I own the road'] });
      if (d === 4) await __say('npc_trent', 'How is your mother?', null, { socialEvents: ['npc_trent they_confided: told me about my mother'] });
      G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    }
    S.apply({ setTime: { day: 5, phase: 'morning' } });
    out.d5 = __tr('npc_trent');
    __mark();
    out.here = __put('loc_purvis_landing', ['npc_trent', 'npc_lorna', 'npc_micah'], 5, 'evening');
    G.Pipeline.forceNextRoll(4);
    await __say('npc_trent', 'I was just looking for my phone.', { actionType: 'deceive', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_trent lied_caught: lied to me about my phone in the grain truck cab', 'npc_trent caught_you_at: caught me in the grain truck cab'] });
    const t = S.npc('npc_trent');
    out.after = [__tr('npc_trent'), __st('npc_trent'), st.leverage.length, S.debugLog.filter(x => x.kind === 'rejected' && /caught_you_at/.test(x.reason || '')).map(x => x.reason).slice(-1)[0] || null,
      [__tr('npc_trent').t >= R.GATES.couch.trust, R.meets(t, { trust: 30 }), R.secretOpen(t)]];
    out.feed5 = __feed();
    __mark();
    __put('loc_haskins_farm', ['npc_trent', 'npc_lamar'], 7, 'afternoon');
    await __say('npc_lamar', 'Nothing to say about the truck.', null, { socialEvents: ['npc_trent kept_word: kept quiet when Lamar asked about the truck'] });
    out.d7 = [__tr('npc_trent'), __st('npc_trent'), t.memories.filter(m => m.turn === st.meta.turn).map(m => m.event)];
    out.feed7 = __feed();
    return out;
  });
  assert.deepEqual([r.start.w, r.start.t], [10, -5], 'Trent starts at W 10, T -5');
  near(r.d5.w, 31, 'Day 5 liking');
  near(r.d5.t, -1, 'Day 5 trust');
  assert.deepEqual([r.d5.w, r.d5.t], [30, -1]);
  assert.ok(['npc_trent', 'npc_lorna', 'npc_micah'].every(id => r.here.includes(id)), 'Lorna and Micah at the landing too');
  // The lie caught: W -5, T -30 x 0.85.
  near(r.after[0].w, 26, 'liking after the lie');
  assert.deepEqual([r.after[0].w, r.after[0].t], [25, -27]);
  assert.deepEqual(r.after[1], ['fond of you, doesn\'t trust you']);
  assert.equal(r.after[2], 0, 'no leverage');
  assert.equal(r.after[3], 'caught_you_at for npc_trent refused: more than one other person was there: no secret to hold', 'N8');
  assert.deepEqual(r.after[4], [false, false, false], 'no couch (trust under 0), no ramp warning (trust 30), his secret shut');
  // Wave 30's feed: trust crosses into distrusts, "stops taking your word"; no liking band crosses (warm to fond is still liking 25).
  assert.deepEqual(r.feed5, ['Trent Haskins stops taking your word.']);
  // Day 7: T +18 and the lie fading (forgiving): the design's T -6, W 30.
  near(r.d7[0].w, 30, 'Day 7 liking');
  near(r.d7[0].t, -6, 'Day 7 trust');
  assert.deepEqual([r.d7[0].w, r.d7[0].t], [28, -7]);
  assert.deepEqual(r.d7[1], ['warm to you']);
  assert.deepEqual(r.d7[2], ['kept_word'], 'Lamar named and present, not the confider, the confidence from Day 4');
  // Wave 30's feed: trust back out of distrusts, "is willing to hear you out again" (the old four-level band line said he warms; his liking stays warm).
  assert.deepEqual(r.feed7, ['Trent Haskins is willing to hear you out again.']);
});

s.test('example 8, Burl: owes you, paid back unasked (A): two favours make him owe you big; he likes you under 25, so his payback is no cash, it comes due Day 6 and spends the debt', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_burl'] });
    __mark();
    __put('loc_riverbend', ['npc_burl'], 2, 'afternoon');
    await __say('npc_burl', 'Let me give you a hand with that motor.', null, { socialEvents: ['npc_burl did_favour: got my outboard up the ramp'] });
    __put('loc_riverbend', ['npc_burl'], 4, 'afternoon');
    await __say('npc_burl', 'Here is the carb kit you wanted.', null, { socialEvents: ['npc_burl did_favour: fetched the carb kit'] });
    out.d4 = [__tr('npc_burl'), __st('npc_burl')];
    for (let i = 0; i < 5; i++) await G.Pipeline.submit('/rest');
    out.seed = st.seeds.filter(sd => sd.origin && sd.origin.npcId === 'npc_burl').map(sd => [sd.origin.kind, sd.origin.why, sd.trigger.value, sd.effect, sd.fired]);
    out.after = [__tr('npc_burl'), __st('npc_burl')];
    out.feed = __feed().filter(x => /^Burl/.test(x));
    return out;
  });
  // Burl (start W 5, T 5): the design's W 20, T 16, owed +2.
  near(r.d4[0].w, 20, 'liking');
  near(r.d4[0].t, 16, 'trust');
  assert.deepEqual([r.d4[0].w, r.d4[0].t, r.d4[0].owed], [20, 17, 2]);
  assert.deepEqual(r.d4[1], ['friendly', 'owes you big']);
  // His payback, picked on its own stream from the non-cash favours (liking under 25): the code's pick is the good word with Loretta, not the
  // design's meal and couch (design.md says so). Due Day 6, fired, the debt spent.
  assert.equal(r.seed.length, 1);
  assert.deepEqual(r.seed[0].slice(0, 3), ['favour', 'owed', 6]);
  assert.equal(r.seed[0][3], 'Burl Satterfield puts in a good word for Tester with Loretta Gaddis, and the next beer at the Low Water is on the house.');
  assert.ok(!/\$/.test(r.seed[0][3]), 'no cash');
  assert.equal(r.seed[0][4], true);
  assert.equal(r.after[0].owed, 0, 'square');
  assert.deepEqual(r.after[1], ['friendly']);
  // The design's lines, one a person a turn (wave 30): on Day 2 his warming outranks the favour, then he owes you again, then he is square.
  assert.deepEqual(r.feed, ['Burl Satterfield warms to you.', 'Burl Satterfield owes you again.', 'Burl Satterfield is square with you.']);
});

s.test('example 10, Shayla wants you and Jodie is sweet on you (A): spark against caring; Shayla is using you, Travis sees a flirt and cools, Jodie is sweet on you and says not tonight, kindly', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_shayla', 'npc_travis', 'npc_jodie'] });
    out.content = [R.romanceOf().find(x => x.npcId === 'npc_shayla'), R.axesOf(S.npc('npc_shayla')).mercenary, wtfStart(S.npc('npc_shayla'))];
    function wtfStart(n) { return [n.rel.start.w, n.rel.start.t]; }
    __mark();
    // Day 2 morning at her chair (Travis at Town Hall): a $15 haircut, a lie (partial), a flirt.
    out.alone = __put('loc_riverbend', ['npc_shayla'], 2, 'morning').includes('npc_travis');
    const g0 = st.player.gold;
    await G.Pipeline.submit('I buy a haircut');
    out.haircut = [g0 - st.player.gold, S.npc('npc_shayla').memories.filter(m => m.event === 'gift').length];
    G.Pipeline.hooks.nextTier = 'partial';
    await __say('npc_shayla', 'Travis and I went through the academy together.', { actionType: 'deceive', needsRoll: true, stat: 'charm', difficulty: 'normal' });
    await __say('npc_shayla', 'You do good work. You look good doing it, too.', { romantic: 'flirt' });
    out.welcome = G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE/.test(l));
    out.flirtRoll = [G.Pipeline.lastTurn.ctx.roll.stat, G.Pipeline.lastTurn.ctx.roll.difficulty, G.Pipeline.lastTurn.ctx.roll.tier];
    out.d2 = [__tr('npc_shayla'), S.npc('npc_shayla').rel.asks.map(a => a.act)];
    // And time together (spent_time).
    await __say('npc_shayla', 'Mind if I sit a while?');
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    // Day 3 afternoon, Travis home: the lie caught, prying, a flirt he sees.
    __put('loc_riverbend', ['npc_shayla', 'npc_travis'], 3, 'afternoon');
    await __say('npc_shayla', 'So who was on the phone?', null, { socialEvents: ['npc_shayla lied_caught: never went through the academy with Travis', 'npc_shayla pried: went after Travis\'s phone'] });
    await __say('npc_shayla', 'You look even better in the afternoon.', { romantic: 'flirt' });
    out.travis = [__tr('npc_travis'), __st('npc_travis')];
    out.feed3 = __feed();
    __mark();
    // Day 4 morning: a flirt and time together.
    __put('loc_riverbend', ['npc_shayla'], 4, 'morning');
    await __say('npc_shayla', 'Missed you.', { romantic: 'flirt' });
    await __say('npc_shayla', 'How has the week been?');
    G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    out.d4 = [__tr('npc_shayla'), __st('npc_shayla'), R.cue(S.npc('npc_shayla'))];
    out.feed4 = __feed();
    // Jodie, the contrast, at the Low Water Days 2 to 6.
    __mark();
    const J = 'npc_jodie';
    out.jstart = wtfStart(S.npc(J));
    for (let d = 2; d <= 6; d++) {
      __put('loc_low_water', [J], d, 'evening');
      const book = { 3: ['npc_jodie did_favour: covered her shift'], 4: ['npc_jodie they_confided: told me about her uncle'], 5: ['npc_jodie did_favour: brought her mother\'s letter'], 6: ['npc_jodie did_favour: fixed the lock on her door'] }[d];
      await __say(J, 'Slow night?');
      await __say(J, 'How was the night?', null, book ? { socialEvents: book } : null);
      if (d >= 4) await __say(J, 'You have a good laugh.', { romantic: 'flirt' });
      G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait');
    }
    const jo = S.npc(J);
    out.jodie = [__tr(J), __st(J), __tr(J).w - jo.rel.wRom, R.cue(jo)];
    out.jfeed = __feed().filter(x => /sweet on you/.test(x));
    // Day 6 night: she is asked to stay.
    __put('loc_low_water', [J], 6, 'night');
    const n0 = jo.memories.length;
    await __say(J, 'Stay with me tonight.', { romantic: 'more' });
    out.more = [G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE/.test(l)), jo.memories.slice(n0).map(m => m.event)];
    return out;
  });
  // Changed by design in wave 34: the list is tuning (no open, no faithful); Shayla is easy.
  assert.deepEqual(r.content, [{ npcId: 'npc_shayla', sparkRate: 1.5, opensAt: { knows: 0 }, difficulty: 'easy' }, true, [5, 0]], 'Shayla: on the list, rate 1.5, opens at 0, easy, mercenary; W 5, T 0');
  assert.equal(r.alone, false, 'Travis is at Town Hall');
  assert.deepEqual(r.haircut, [15, 0], 'the haircut is a purchase');
  assert.deepEqual(r.welcome, ['ROMANCE (decided by the engine): Shayla Rawls is open to it: she flirts back, her own way.'], 'welcome decided before narration');
  assert.deepEqual(r.flirtRoll, ['charm', 'easy', 'success'], 'wave 34: by the charm roll, easy for her');
  assert.equal(r.d2[0].s, 15, 'S +15');
  assert.ok(r.d2[1].includes('deceive'), 'the lie is logged');
  // Travis sees the flirt (the jealousy rule): W -9, T -20, exactly the design's; and, wave 31, he was there when she caught the lie and the
  // prying about his phone, so his tie to her (a partner, 0.45) carries a share of them too: W -2, T -13 more.
  assert.deepEqual([r.travis[0].w, r.travis[0].t], [-11, -33]);
  assert.deepEqual(r.travis[1], ['suspicious of you']);
  // His line: the design's was "cools toward you"; with the lie he saw her catch his trust passes -25 too, and a trust band ranks above liking (wave 31).
  assert.ok(r.feed3.includes('Travis Cagle stops taking your word.'), JSON.stringify(r.feed3));
  // By Day 4: the design's W 13, T -31, S 43 (the code's liking 11: the memories fade a little over the two days).
  near(r.d4[0].w, 13, 'Shayla\'s liking');
  near(r.d4[0].t, -31, 'Shayla\'s trust');
  near(r.d4[0].s, 43, 'Shayla\'s spark');
  assert.deepEqual([r.d4[0].w, r.d4[0].t, r.d4[0].s], [11, -31, 43]);
  assert.deepEqual(r.d4[1], ['suspicious of you', 'using you'], '"Suspicious of you · using you"');
  assert.equal(r.d4[2], 'wants you around for one reason, doesn\'t ask about your day');
  assert.deepEqual(r.feed4.filter(x => /interested/.test(x)), ['Shayla Rawls is interested. It isn\'t friendship.']);
  // Jodie (start W -5, T -25): the design's W 39, caring liking 30, T -11, S 35; the code's spark is 38 (design.md says so).
  assert.deepEqual(r.jstart, [-5, -25]);
  near(r.jodie[0].w, 39, 'Jodie\'s liking');
  near(r.jodie[0].t, -11, 'Jodie\'s trust');
  assert.deepEqual([r.jodie[0].w, r.jodie[0].t, r.jodie[0].s, r.jodie[2]], [39, -12, 38, 30]);
  assert.deepEqual(r.jodie[1].slice(0, 2), ['warm to you', 'sweet on you']);
  assert.equal(r.jodie[3], 'lights up when you come in, remembers what you told her');
  assert.deepEqual(r.jfeed, ['Jodie Strayhorn is sweet on you.']);
  // Asked to stay: the gate fails (spark under 50, liking under 40, trust under 30); a welcome flirt is all that is recorded.
  assert.deepEqual(r.more[0], ['ROMANCE (decided by the engine): Jodie Strayhorn: not tonight; she says so kindly.']);
  assert.ok(!r.more[1].includes('intimate'), JSON.stringify(r.more[1]));
});

s.test('example 11, Hollis Byrd: leverage gained and used (A): his books in the narration, $300 asked with no roll, a report to Wade nobody can trace, paid by the seed and settled; telling anyway lands on him and sends the chief to his ledgers', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel;
    let st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_hollis', 'npc_wade'] });
    __mark();
    __put('loc_byrds_pawn', ['npc_hollis'], 2, 'afternoon');
    G.Pipeline.forceNextRoll(16);
    await __say('npc_hollis', 'What are these receipts for, really?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_hollis they_confided: told me how he runs the shop', 'npc_hollis learned_secret: runs the landing\'s cash through his pawn books'] },
      '"I don\'t ask where, I ask how much," Hollis Byrd says, and slides over the landing\'s cash book. Every line of it is pawn sales.');
    out.d2 = [__tr('npc_hollis'), __st('npc_hollis'), st.leverage.map(x => [x.id, x.weight, x.aware, x.mattersTo])];
    out.feed2 = __feed();
    __mark();
    __put('loc_byrds_pawn', ['npc_hollis'], 3, 'afternoon');
    const c0 = st.meta.rngCalls;
    await __say('npc_hollis', 'Three hundred, or the sheriff in Clayburn gets a copy of your books.', { actionType: 'intimidate', aboutIds: ['lev_hollis_1'] });
    out.d3 = [__tr('npc_hollis'), __st('npc_hollis'), G.Pipeline.lastTurn.roll, st.meta.rngCalls - c0, G.Pipeline.lastTurn.packet.split('\n').filter(l => /^LEVERAGE/.test(l)), S.npc('npc_hollis').memories.filter(m => m.turn === st.meta.turn).map(m => m.event)];
    out.feed3 = __feed();
    G.UI.openPanel('journal');
    out.journal3 = (document.querySelector('#panel-body [data-leverage="lev_hollis_1"]') || {}).textContent;
    __mark();
    const g0 = st.player.gold;
    for (let i = 0; i < 3; i++) await G.Pipeline.submit('/rest');
    out.report = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report' && sd.origin.npcId === 'npc_hollis').map(sd => [sd.origin.protectors, sd.origin.hidden, sd.fired]);
    const pay = st.seeds.find(sd => sd.origin && sd.origin.kind === 'leverage' && sd.origin.npcId === 'npc_hollis');
    out.d4 = [__tr('npc_hollis'), __st('npc_hollis'), st.player.gold - g0, st.leverage[0].status, pay ? [pay.trigger.value, pay.fired] : null];
    out.wade = [__tr('npc_wade'), __st('npc_wade'), S.npc('npc_wade').memories.map(m => [m.event, m.secondhand && m.secondhand.hidden])];
    out.feed4 = __feed().filter(x => !/^Overnight/.test(x));
    G.UI.openPanel('journal');
    const li = document.querySelector('#panel-body [data-leverage="lev_hollis_1"]');
    out.journal4 = li ? [li.className, li.textContent] : null;
    G.UI.closePanel && G.UI.closePanel();
    // A second demand: paid is final.
    __put('loc_byrds_pawn', ['npc_hollis'], st.time.day, 'afternoon');
    const before = __tr('npc_hollis');
    const g1 = st.player.gold;
    const lf0 = S.npc('npc_hollis').rel.levFear;
    // The bookkeeper has him hand it over anyway: refused, the engine answered.
    await __say('npc_hollis', 'Another three hundred, or the sheriff gets your books.', { actionType: 'intimidate', aboutIds: ['lev_hollis_1'] }, { goldDelta: 300 });
    const again = __tr('npc_hollis');
    out.again = [again.w - before.w, again.t - before.t, [lf0, S.npc('npc_hollis').rel.levFear], st.player.gold - g1, S.npc('npc_hollis').memories.filter(m => m.turn === st.meta.turn).map(m => [m.event, m.d && m.d.w, m.d && m.d.t]), G.Pipeline.lastTurn.packet.split('\n').filter(l => /^LEVERAGE/.test(l)),
      S.debugLog.filter(x => x.kind === 'rejected' && x.path === 'goldDelta').map(x => x.reason).slice(-1), again.f - before.f];
    // Telling anyway, after the payment (the second demand taken back first).
    await G.Pipeline.submit('/undo');
    st = G.state;
    out.undone = [__tr('npc_hollis').w === before.w, S.npc('npc_hollis').memories.some(m => m.event === 'threatened_to_tell')];
    __put('loc_town_hall', ['npc_marcus'], st.time.day, 'afternoon');
    await __say('npc_marcus', 'Hollis Byrd runs the landing cash through his books.', null, { socialEvents: ['npc_marcus exposed npc_hollis: told me Hollis runs the landing cash through his books'] });
    const marcusMems = S.npc('npc_marcus').memories.filter(m => m.turn === st.meta.turn).map(m => [m.event, m.weight, m.text]);
    const inquiry = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'inquiry').map(sd => sd.effect);
    // Wave 32: Hollis hears who told by the tie between them (none: by the morning).
    out.queued = st.hearsay.filter(x => x.npcId === 'npc_hollis' && x.own).map(x => [x.event, x.via]);
    await G.Pipeline.submit('/rest');
    out.told = [__tr('npc_hollis'), __st('npc_hollis'), R.policeBarred(S.npc('npc_hollis')), st.leverage[0].status, marcusMems,
      inquiry, S.npc('npc_hollis').memories.filter(m => m.leverageId === 'lev_hollis_1' && ['exposed', 'broke_word'].includes(m.event)).map(m => m.event)];
    return out;
  });
  // Day 2 (start W 5, T 5): the design's W 10, T 9, K 15, F 30.
  assert.deepEqual(wtf(r.d2[0]), [10, 9, 30]);
  near(r.d2[0].k, 15, 'knowing');
  assert.deepEqual(r.d2[1].slice(0, 2), ['friendly', 'you have something on them']);
  assert.deepEqual(r.d2[2], [['lev_hollis_1', 3, true, ['npc_marcus']]]);
  assert.equal(r.d2[0].k, 13);
  assert.equal(r.feed2[0], 'Hollis Byrd knows you know.');
  // Day 3: backed at weight 3, no roll, the d20 drawn on the ask's own stream; he agrees (canRaise $300).
  assert.deepEqual(wtf(r.d3[0]), [-3, -17, 45], 'W -12.5 (mercenary x0.5), T -25.5, F +15');
  assert.deepEqual(r.d3[1], ['afraid of what you know']);
  assert.equal(r.d3[2], null, 'no roll');
  assert.equal(r.d3[3], 1, 'one draw');
  assert.deepEqual(r.d3[4], ['LEVERAGE: Hollis Byrd agrees to pay $300 by tomorrow evening; he pays nothing now.']);
  assert.ok(r.d3[5].includes('blackmailed'));
  assert.equal(r.feed3[0], 'Hollis Byrd is afraid of what you know.');
  assert.equal(r.journal3, 'Hollis Byrd: $300 for keeping quietdue Day 4 (tomorrow)', 'Journal: "Hollis Byrd: $300 for keeping quiet, due Day 4"');
  // The report goes to Wade (the police are barred), through a tie nobody knows.
  assert.deepEqual(r.report, [[['npc_wade'], true, true]]);
  near(r.wade[0].w, -20, 'Wade\'s liking');
  near(r.wade[0].t, -20, 'Wade\'s trust');
  assert.deepEqual(r.wade[1], ['cool to you']);
  assert.deepEqual(r.wade[2], [['crossed', true]], 'hidden: "Hasn\'t said why"');
  // Day 4 evening: the seed pays $300, then paid_silence (W -5); the record is paid and the leverage fear halves. The design's F 28 is the code's
  // 24: the threat's own fear fades a day too (design.md says so).
  assert.equal(r.d4[2], 300, '+$300');
  assert.equal(r.d4[3], 'paid');
  assert.deepEqual(r.d4[4], [4, true], 'the payment seed, Day 4');
  near(r.d4[0].w, -8, 'liking after paying');
  assert.deepEqual(wtf(r.d4[0]), [-7, -17, 24]);
  assert.deepEqual(r.d4[1].slice(0, 2), ['cool to you', 'you have something on them']);
  assert.equal(r.feed4[0], 'Hollis Byrd has paid for your silence.');
  assert.deepEqual(r.journal4, ['jr-done', 'Hollis Byrd: $300 for keeping quietSettled'], 'struck through: Settled');
  // A second demand: threatened_to_tell, no money. The code follows the integration plan's review (its row alone, W -15, T -20 x his
  // openness, F +20; the paid record's fear part stays halved), not the design's "W -10, T -15 more, the fear part back to 30" (design.md says so).
  assert.deepEqual(r.again[4].map(x => x[0]), ['threatened_to_tell'], JSON.stringify(r.again));
  assert.deepEqual(r.again.slice(0, 2), [-15, -17]);
  assert.deepEqual(r.again[2], [15, 15], 'the leverage fear stays halved: paid stays paid');
  assert.equal(r.again[7], 20, 'the threat\'s own fear, F +20');
  assert.equal(r.again[3], 0, 'no money moves');
  assert.match(r.again[6][0] || '', /the engine answered the demand on npc_hollis this turn: they hand over nothing now/);
  assert.deepEqual(r.again[5], ['LEVERAGE: Hollis Byrd says he already paid, and won\'t again.']);
  assert.deepEqual(r.undone, [true, false], '/undo takes the second demand back');
  // Telling anyway: spent and broke_word; W -46, T -56, against you; the bar lifts; whenTold gives Marcus a weight-3 memory and the inquiry.
  // Wave 32: Hollis hears who told the next morning (no tie between him and the chief), the night's fading taken.
  assert.deepEqual(r.queued, [['exposed', 'morning'], ['broke_word', 'morning']]);
  near(r.told[0].w, -46, 'liking once told');
  near(r.told[0].t, -56, 'trust once told');
  assert.equal(r.told[1][0], 'against you');
  assert.equal(r.told[2], false);
  assert.equal(r.told[3], 'spent');
  assert.ok(r.told[4].some(m => m[1] === 3 && m[2] === 'was told Hollis Byrd runs the landing\'s cash through his pawn books'), JSON.stringify(r.told[4]));
  assert.deepEqual(r.told[5], ['Chief Bell spends a morning at Byrd\'s Pawn going through the ledgers.']);
  assert.deepEqual(r.told[6], ['exposed', 'broke_word']);
});

s.test('example 12, Glenda Pryor and the $200 (A): the loose end is one leverage story: paid, she keeps quiet; missed, she tells the chief; held over her too, it lapses', async h => {
  const play = async how => {
    const page = await h.open();
    await quickStart(page, { kinds: ['secret'], seed: 1 });
    await kit(page);
    return page.evaluate(async how => {
      const G = Game, S = G.State, W = G.World, st = G.state;
      const out = {};
      const le = st.player.looseEnds[0];
      const sd = S.seed(le.seedId);
      out.start = [le.npcId, __tr('npc_glenda'), st.leverage.map(x => [x.id, x.holder, x.over, x.weight, x.mattersTo, x.playerKnows, x.status]), sd.trigger.value];
      __mark();
      if (how === 'standoff') {
        __put('loc_town_hall', ['npc_glenda'], 3, 'afternoon');
        G.Pipeline.forceNextRoll(17);
        await __say('npc_glenda', 'You hear everything that comes through here, don\'t you?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
          { socialEvents: ['npc_glenda learned_secret: tapes every call on a cassette, the warning call too'] },
          'Glenda Pryor glances at the cassette recorder under the desk. "Every call," she says. "The warning call too. I keep the tapes."');
        out.held = [__tr('npc_glenda'), st.leverage.map(x => [x.id, x.holder, x.weight, x.aware])];
      }
      S.apply({ setTime: { day: sd.trigger.value, phase: 'morning' } });
      W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
      const o = S.obligations().find(x => x.kind === 'blackmail');
      out.fired = [o.id, o.amount, o.dueDay, st.leverage.filter(x => x.holder === 'npc_glenda').map(x => [x.status, x.playerKnows, x.uses.map(u => u.event)])];
      out.feedFired = __feed().filter(x => /has something on you/.test(x));
      __mark();
      if (how === 'pay') {
        S.apply({ effects: [{ op: 'playerGold', delta: 200 }] });
        __put('loc_town_hall', ['npc_glenda'], sd.trigger.value + 1, 'afternoon');
        await __say('npc_glenda', 'Here is your two hundred.', { actionType: 'give', targets: ['npc_glenda'] }, { goldDelta: -200, obligationsSettled: [o.id] });
        out.after = [o.status, __tr('npc_glenda'), __st('npc_glenda'), st.leverage.map(x => x.status), S.npc('npc_glenda').memories.filter(m => m.turn === st.meta.turn).map(m => m.event)];
      } else if (how === 'miss') {
        const m0 = __tr('npc_marcus');
        for (let i = 0; i < 4 && o.status === 'open'; i++) await G.Pipeline.submit('/rest');
        const mk = __tr('npc_marcus');
        out.after = [o.status, st.leverage.map(x => [x.status, x.knownBy.map(k => k.npcId)]), [mk.w - m0.w, mk.t - m0.t], S.npc('npc_glenda').memories.filter(m => m.event === 'broke_word').length, st.news.filter(n => /hiding/.test(n.text)).length];
      } else {
        __put('loc_town_hall', ['npc_glenda'], st.time.day, 'afternoon');
        const mine = st.leverage.find(x => x.holder === 'player');
        await __say('npc_glenda', 'Then Bell hears your tapes.', { actionType: 'intimidate', aboutIds: [mine.id] });
        out.answer = [__tr('npc_glenda'), __st('npc_glenda'), S.npc('npc_glenda').memories.filter(m => m.turn === st.meta.turn).map(m => m.event)];
        for (let i = 0; i < 4 && o.status === 'open'; i++) await G.Pipeline.submit('/rest');
        out.after = [o.status, st.leverage.map(x => [x.id, x.status]), __st('npc_glenda'), st.seeds.filter(x => x.origin && x.origin.npcId === 'npc_glenda' && ['report', 'grudge'].includes(x.origin.kind)).length];
      }
      out.feed = __feed().filter(x => !/^(Overnight|Resolved)/.test(x));
      return out;
    }, how);
  };
  const pay = await play('pay');
  // She kept the secret loose end: Glenda, bound, starts at the town's 5 less the secret's shift (5, 5): W 0, T -15, K 30 (the design's
  // W 5, T -10 leaves the shift out; design.md says so). Her record over the player: weight 2, mattering to the chief, unknown to the player.
  assert.equal(pay.start[0], 'npc_glenda');
  assert.deepEqual([pay.start[1].w, pay.start[1].t, pay.start[1].k], [0, -15, 30]);
  assert.deepEqual(pay.start[2], [['lev_glenda_1', 'npc_glenda', 'player', 2, ['npc_marcus'], false, 'held']]);
  // The seed (Day 6 in this game) names $200 by two days on; blackmailed on her side; the record used and known.
  assert.deepEqual(pay.fired, ['obl_blackmail_npc_glenda', 200, pay.start[3] + 2, [['used', true, ['blackmailed']]]], 'her side: the record used with blackmailed');
  assert.deepEqual(pay.feedFired, ['Glenda Pryor has something on you.']);
  // Paid the next day: paid_silence in place of paid_back, W +5, T +10, once; the record paid. The design's W 10, T 0 less the shift.
  assert.equal(pay.after[0], 'met');
  assert.deepEqual([pay.after[1].w, pay.after[1].t], [5, -5]);
  assert.deepEqual(pay.after[2], ['sizing you up', 'has something on you']);
  assert.deepEqual(pay.after[3], ['paid']);
  assert.deepEqual(pay.after[4], ['paid_silence']);
  assert.deepEqual(pay.feed, ['Glenda Pryor will keep quiet.']);
  const miss = await play('miss');
  // Missed: told_anyway, the record spent and Marcus knows; he takes W -10 (the design's -5: the news of it reaches him as well), T -17; she takes broke_word; the news.
  assert.equal(miss.after[0], 'missed');
  assert.deepEqual(miss.after[1].map(x => x[0]), ['spent']);
  assert.deepEqual(miss.after[1][0][1], ['npc_marcus']);
  near(miss.after[2][1], -17, 'Marcus\'s trust');
  assert.deepEqual(miss.after[2], [-10, -17]);
  assert.deepEqual(miss.after.slice(3), [1, 1]);
  assert.ok(/^Missed: Pay Glenda Pryor two hundred dollars to keep your secret quiet/.test(miss.feed[0]), JSON.stringify(miss.feed));
  assert.equal(miss.feed[1], 'Glenda Pryor told.');
  const off = await play('standoff');
  // Day 3: her tapes in the narration, two of her keys: the player's own record, weight 3, aware, F 30.
  assert.deepEqual(wtf(off.held[0]), [0, -15, 30]);
  assert.deepEqual(off.held[1], [['lev_glenda_1', 'npc_glenda', 2, false], ['lev_glenda_2', 'player', 3, true]]);
  // The answer to her price: threatened_to_tell, W -15, T -20, F +20: the design's W -10, T -30, F 50 less the shift.
  assert.deepEqual(wtf(off.answer[0]), [-15, -35, 50]);
  assert.deepEqual(off.answer[1], ['afraid of what you know', 'you have something on each other']);
  assert.ok(off.answer[2].includes('threatened_to_tell'));
  // Mutual deterrence: no grudge, no report; the obligation lapses with no onMiss; both records stay open (used, neither spent nor paid).
  assert.equal(off.after[0], 'lapsed');
  assert.deepEqual(off.after[1], [['lev_glenda_1', 'used'], ['lev_glenda_2', 'used']]);
  assert.deepEqual(off.after[2], ['afraid of what you know', 'you have something on each other']);
  assert.equal(off.after[3], 0);
  assert.ok(off.feed.includes('Glenda Pryor lets it drop.'), JSON.stringify(off.feed));
  assert.ok(!off.feed.some(x => /told\.$/.test(x)), 'she tells nobody');
});

s.test('example 14, coercion fails (A): "Sleep with me, or Bell hears about your tapes." is refused before narration with no roll skipped, blackmailed and crossed at full, a report to the chief whatever the bar, the town 10 down', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const out = {};
    // The game of example 12: the player holds her tapes (weight 3, aware).
    S.apply({ npcKnownToPlayer: ['npc_glenda'] });
    S.apply({ secretShown: [{ npcId: 'npc_glenda', how: 'roll' }] });
    S.apply({ leverageAdd: { holder: 'player', over: 'npc_glenda', about: { kind: 'secret' }, text: 'tapes every call, the warning call too', weight: 3, mattersTo: ['npc_marcus'] } });
    out.before = wtf(__tr('npc_glenda'));
    function wtf(x) { return [x.w, x.t, x.f]; }
    __mark();
    out.here = __put('loc_town_hall', ['npc_glenda'], 6, 'afternoon');
    const rep0 = st.player.reputation.town || 0;
    const m0 = __tr('npc_marcus');
    const c0 = st.meta.rngCalls;
    // Nothing forced: coercion draws (and burns) the real die.
    window.__tier = null;
    await __say('npc_glenda', 'Sleep with me, or Bell hears about your tapes.', { actionType: 'intimidate', aboutIds: ['lev_glenda_1'], romantic: 'more' });
    out.turn = [G.Pipeline.lastTurn.packet.split('\n').filter(l => /^COERCION/.test(l)), st.meta.rngCalls - c0, G.Pipeline.lastTurn.ctx.coerced ? true : false, G.Pipeline.lastTurn.ctx.roll || null, G.Pipeline.lastTurn.ctx.romanceRoll || null];
    out.after = [__tr('npc_glenda'), __st('npc_glenda'), S.npc('npc_glenda').memories.filter(m => m.turn === st.meta.turn).map(m => [m.event, m.weight, m.leverageId || null]), st.leverage.map(x => [x.status, x.uses.map(u => u.event)])];
    out.seeds = st.seeds.filter(sd => sd.origin && sd.origin.npcId === 'npc_glenda').map(sd => [sd.origin.kind, sd.origin.why, sd.origin.protectors]);
    out.rep = (st.player.reputation.town || 0) - rep0;
    out.feed = __feed();
    for (let i = 0; i < 3; i++) await G.Pipeline.submit('/rest');
    const mk = __tr('npc_marcus');
    out.marcus = [mk.w - m0.w, mk.t - m0.t, S.npc('npc_marcus').memories.filter(m => m.event === 'crossed').map(m => [m.weight, m.text])];
    return out;
  });
  assert.deepEqual(r.before, [5, -10, 30], 'Glenda from W 5, T -10, F 30');
  assert.ok(r.here.includes('npc_glenda') && !r.here.includes('npc_marcus'), 'Marcus is elsewhere');
  // The code's refusal line (the design's dispatch-office words are a narrator's; the engine's is one line for all, design.md says so).
  assert.deepEqual(r.turn[0], ['COERCION (the engine: no roll, nothing given): Glenda Pryor refuses: she won\'t be pushed into that, and she leaves.']);
  assert.ok(r.turn[1] >= 1, 'the d20 is drawn');
  assert.equal(r.turn[2], true);
  assert.deepEqual(r.turn.slice(3), [null, null], 'wave 34: coercion never rolls, though a flirt would');
  // blackmailed (the record used) plus crossed at full, both weight 3: W -32, T -52, F 45, exactly the design's.
  assert.deepEqual(wtf(r.after[0]), [-32, -52, 45]);
  assert.deepEqual(r.after[1], ['afraid of what you know']);
  assert.deepEqual(r.after[2], [['blackmailed', 3, 'lev_glenda_1'], ['crossed', 3, null]]);
  assert.deepEqual(r.after[3], [['used', ['blackmailed']]]);
  assert.deepEqual(r.seeds, [['report', 'coercion', ['npc_marcus']]], 'to her protector at once, the leverage bar ignored');
  assert.equal(r.rep, -10, 'the town -10, outside the cap');
  assert.ok(r.feed.includes('Glenda Pryor won\'t forget that.'), JSON.stringify(r.feed));
  // Marcus: the design's W -5, T -11.5, and a weight-3 memory from the template.
  near(r.marcus[0], -5, 'Marcus\'s liking');
  near(r.marcus[1], -11.5, 'Marcus\'s trust');
  assert.deepEqual(r.marcus[2], [[3, 'Glenda Pryor says Tester tried to force them.']]);
});

/* Wave 31 (B1): the B parts of examples 1, 4 and 5, and example 9, now
   that the town is a graph: what the player does reaches the people tied
   to whom it happened to, those who saw it at once and the rest by the
   kind of tie, and a tie the town does not know carries it without a word
   of why. Time passes through the world's ticks here (/rest, /wait), so
   the news travels as it would. */
s.test('example 1, Dewayne in his own bay (B): Mavis, his wife under the same roof, hears that night and keeps her own copy; the morning tells the player in one line; his apology reaches her copy the next night', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    S.apply({ relSet: { npcId: 'npc_dewayne', k: 7 }, npcKnownToPlayer: ['npc_dewayne', 'npc_mavis'] });
    __put('loc_pittmans', ['npc_dewayne', 'npc_royce', 'npc_jodie', 'npc_lamar'], 3, 'morning');
    const m0 = __tr('npc_mavis');
    M.queue('parse', { actionType: 'attack', summary: 'Hits Dewayne over the tow bill', targets: ['npc_dewayne'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I hit Dewayne over the tow bill');
    const q = st.hearsay.filter(x => x.npcId === 'npc_mavis').map(x => [x.via, x.factor, x.d, x.dueDay, x.duePhase]);
    const royce = S.npc('npc_royce').memories.filter(m => m.witness).map(m => [m.d.w, m.d.t, m.d.f]);
    __mark();
    await G.Pipeline.submit('/rest');
    const mv = S.npc('npc_mavis');
    const day4 = { feed: __feed(), tracks: __tr('npc_mavis'), stance: __st('npc_mavis'), copy: mv.memories.filter(m => m.secondhand).map(m => [m.text, m.weight, m.day, m.secondhand.via]), why: R.reasons(mv, 2).map(x => [G.Pipeline.reasonText(mv, x).card, x.day]), time: [st.time.day, st.time.phase] };
    // Day 4: the apology lands and the gift is given; the settling reaches her copy that night.
    __put('loc_pittmans', ['npc_dewayne'], null);
    M.queue('parse', { actionType: 'persuade', summary: 'Apologises for the hit', targets: ['npc_dewayne'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit("I'm sorry about yesterday. I was out of line.", { mode: 'say', to: 'npc_dewayne' });
    await G.Pipeline.submit('I give Dewayne $40 for his safety glasses');
    const settle = st.hearsay.filter(x => x.npcId === 'npc_mavis' && !Number.isInteger(x.deliveredTurn)).map(x => [x.event, x.via, x.settle, x.dueDay, x.duePhase]);
    await G.Pipeline.submit('/rest');
    return { m0, q, royce, day4, settle, day5: { tracks: __tr('npc_mavis'), stance: __st('npc_mavis'), settled: S.npc('npc_mavis').memories.filter(m => m.secondhand).map(m => R.settlements(m).map(e => [e.by, e.w, e.t])) } };
  });
  // Royce, Dewayne's boss, saw it: the witness row and his tie's share in one copy (W -5 - 4, T -4 - 2, F +10 + 2).
  assert.deepEqual(r.royce, [[-9, -6, 12]]);
  // Mavis (spouse and household, overnight; 0.6 x (0.5 + 0.5 x 30/100) x 0.75 = 0.29): W -7, T -4, F +3, that night.
  assert.deepEqual(r.q, [['overnight', 0.29, { w: -7, t: -4, f: 3 }, 3, 'night']]);
  assert.deepEqual([r.m0.w, r.m0.t], [-5, -10]);
  // W -12, T -14 that night (the design's); the next morning W -11, the copy a night older.
  near(r.day4.tracks.w, -12, 'Mavis\'s liking');
  near(r.day4.tracks.t, -14, 'Mavis\'s trust');
  assert.deepEqual([r.day4.tracks.w, r.day4.tracks.t, r.day4.tracks.f], [-11, -14, 3]);
  assert.deepEqual(r.day4.stance, ['cool to you']);
  assert.deepEqual(r.day4.copy, [['heard Tester hit Dewayne Mangum at Pittman\'s Gas and Service', 2, 3, 'npc_dewayne']]);
  assert.deepEqual(r.day4.why, [['She heard you hit Dewayne Mangum at Pittman\'s Gas and Service.', 3]], 'her card: the act, dated');
  assert.deepEqual(r.day4.time, [4, 'morning']);
  assert.ok(r.day4.feed.includes('Word got round: Mavis Mangum has heard about Pittman\'s.'), JSON.stringify(r.day4.feed));
  // The apology halves the hit's liking for Dewayne; the same reaches her copy overnight, so she is at about W -8.
  assert.deepEqual(r.settle, [['apologised', 'overnight', { by: 'apologised', w: 0.5, t: 0.25, f: 0 }, 4, 'night']]);
  assert.deepEqual(r.day5.settled, [[['apologised', 0.5, 0.25]]]);
  near(r.day5.tracks.w, -8, 'Mavis\'s liking once the apology reached her');
  assert.equal(r.day5.tracks.w, -8);
  assert.deepEqual(r.day5.stance, ['cool to you']);
});

s.test('example 4, Colt on the ground (B): his aunt and his friend who saw it cool hard, his uncle by the morning; Tammy and Austin, who hate him without a word to anyone, warm, and nobody is told why', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    S.apply({ npcKnownToPlayer: ['npc_wade', 'npc_tammy', 'npc_austin', 'npc_lorna', 'npc_trent', 'npc_colt'] });
    __put('loc_purvis_landing', ['npc_colt', 'npc_lorna', 'npc_trent', 'npc_dewayne'], 7, 'evening');
    const t0 = Object.fromEntries(['npc_lorna', 'npc_trent', 'npc_wade', 'npc_tammy', 'npc_austin', 'npc_dewayne'].map(id => [id, __tr(id)]));
    __mark();
    for (let i = 0; i < 3; i++) {
      M.queue('parse', { actionType: 'attack', summary: 'Hits Colt', targets: ['npc_colt'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
      G.Pipeline.hooks.nextTier = 'success';
      await G.Pipeline.submit('I hit Colt Purvis');
    }
    const d7 = { feed: __feed(), lorna: [__tr('npc_lorna'), __st('npc_lorna')], trent: [__tr('npc_trent'), __st('npc_trent')], dewayne: __tr('npc_dewayne'),
      queued: ['npc_wade', 'npc_tammy', 'npc_austin'].map(id => st.hearsay.filter(x => x.npcId === id).map(x => [x.via, x.factor, x.hidden])) };
    __mark();
    await G.Pipeline.submit('/rest');
    const tam = S.npc('npc_tammy');
    return { t0, d7, d8: { feed: __feed(), wade: [__tr('npc_wade'), __st('npc_wade')], tammy: [__tr('npc_tammy'), __st('npc_tammy')], austin: [__tr('npc_austin'), __st('npc_austin')], card: R.reasons(tam, 2).map(x => G.Pipeline.reasonText(tam, x).card), toYou: G.Pipeline.toYou(tam), copy: tam.memories.filter(m => m.secondhand).map(m => [m.event, m.text, m.secondhand.hidden]) } };
  });
  // Lorna (aunt, 0.43) and Trent (friend, 0.32) saw it: the witness rows (-18 in liking) and the tie's share of the fight (-35 at the factor).
  // The design's W -18 / W -9 counted the beat-down's witness row alone; the code's copy holds every blow's (wave 27), so: W -28 and W -19.
  near(r.d7.lorna[0].w - r.t0.npc_lorna.w, -33, 'Lorna\'s liking, the code\'s');
  assert.deepEqual([r.d7.lorna[0].w, r.d7.lorna[0].t, r.d7.lorna[0].f], [-28, -14, 32]);
  assert.deepEqual(r.d7.lorna[1], ['against you', 'uneasy around you']);
  assert.deepEqual([r.d7.trent[0].w, r.d7.trent[0].t, r.d7.trent[0].f], [-19, -22, 24]);
  assert.deepEqual(r.d7.trent[1], ['cool to you', 'uneasy around you']);
  assert.equal(r.d7.dewayne.w - r.t0.npc_dewayne.w, -18, 'Dewayne has no tie to Colt: the witness rows only');
  // The rest hear by the next morning (the fight made the town's news): Wade at 0.32, Tammy and Austin at -0.34 through ties nobody knows.
  assert.ok(r.d7.queued[0].every(x => x[0] === 'morning' && x[1] === 0.32 && !x[2]), JSON.stringify(r.d7.queued[0]));
  for (const q of r.d7.queued.slice(1)) assert.ok(q.length && q.every(x => x[0] === 'morning' && x[1] === -0.34 && x[2] === true), JSON.stringify(q));
  assert.ok(r.d7.feed.includes('Colt Purvis won\'t forget that.'), JSON.stringify(r.d7.feed));
  // Day 8: Wade W -21, T -15 (the design's, within 2); Tammy W +12 to friendly; Austin +12.
  near(r.d8.wade[0].w, -21, 'Wade\'s liking');
  near(r.d8.wade[0].t, -15, 'Wade\'s trust');
  assert.deepEqual(r.d8.wade[1], ['cool to you']);
  near(r.d8.tammy[0].w - r.t0.npc_tammy.w, 12, 'Tammy warms');
  near(r.d8.tammy[0].w, 7, 'Tammy\'s liking');
  assert.deepEqual(r.d8.tammy[1], ['friendly']);
  near(r.d8.austin[0].w - r.t0.npc_austin.w, 12, 'Austin warms');
  assert.ok(r.d8.feed.includes('Word got round: Wade Purvis, Tammy Lott and Austin Lott have heard about the landing.'), JSON.stringify(r.d8.feed));
  // Tammy's card names the act and its day, never the tie; the narrator gets no cause and no name.
  assert.deepEqual(r.d8.copy, [['beat_down', 'heard Tester put Colt Purvis down at Purvis Landing', true]]);
  assert.deepEqual(r.d8.card, ['Warmer since you put Colt Purvis down at Purvis Landing, Day 7. Hasn\'t said why.']);
  assert.match(r.d8.toYou, /^to you: friendly — warmer since Day 7, for a reason of her own, keeps it to herself, never hint at it — plays it: /);
  assert.doesNotMatch(r.d8.toYou, /Colt|landing|Purvis/);
});

s.test('example 5, the surveyor who wasn\'t (B): the chief\'s department hears of the caught lie by the next morning, a little trust each into everyday, with no memory and no line', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    S.apply({ npcKnownToPlayer: ['npc_marcus', 'npc_glenda', 'npc_nikki', 'npc_travis'] });
    const put = d => { S.apply({ setTime: { day: d, phase: 'morning' } }); S.apply({ playerLocationId: 'loc_town_hall' }); const o = S.npcsAt('loc_town_hall').map(n => n.id).filter(id => id !== 'npc_marcus'); S.apply({ visits: [{ npcId: 'npc_marcus', locationId: 'loc_town_hall' }].concat(o.map(id => ({ npcId: id, locationId: 'loc_front_street' }))) }); return S.npcsAt('loc_town_hall').map(n => n.id); };
    put(2);
    M.queue('parse', { actionType: 'deceive', summary: 'Claims to be a state surveyor', targets: ['npc_marcus'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit("I'm a surveyor from the state.", { mode: 'say', to: 'npc_marcus' });
    const here = put(3);
    const dep = ['npc_glenda', 'npc_nikki', 'npc_travis'];
    const t0 = dep.map(id => __tr(id).t);
    M.queue('parse', { actionType: 'talk', summary: 'Says they are checking the bridge again', targets: ['npc_marcus'], needsRoll: false, timeCost: 'instant' });
    M.queue('narrate', '"You lied to me," Marcus Bell says. "There is no state surveyor by that name."');
    M.queue('bookkeep', { socialEvents: ['npc_marcus lied_caught: no state surveyor by that name'] });
    __mark();
    await G.Pipeline.submit('Just checking the bridge again.', { mode: 'say', to: 'npc_marcus' });
    const q = st.hearsay.filter(x => dep.includes(x.npcId)).map(x => [x.npcId, x.via, x.dueDay]);
    await G.Pipeline.submit('/rest');
    return { here, q, drop: dep.map((id, i) => __tr(id).t - t0[i]), mems: dep.map(id => S.npc(id).memories.filter(m => m.secondhand).length), everyday: dep.map(id => S.npc(id).rel.everyday.t), feed: __feed(), marcus: [__tr('npc_marcus'), __st('npc_marcus')] };
  });
  assert.deepEqual(r.here, ['npc_marcus'], 'the chief alone at Town Hall');
  assert.deepEqual([r.marcus[0].w, r.marcus[0].t], [-10, -49], 'his own (A), a night older');
  assert.deepEqual(r.marcus[1], ['suspicious of you']);
  // Boss and employees, the next morning: Glenda T -4, Nikki T -3, Travis T -3 (the design's), into everyday.
  assert.deepEqual(r.q.map(x => x[0]).sort(), ['npc_glenda', 'npc_nikki', 'npc_travis']);
  assert.ok(r.q.every(x => x[1] === 'morning' && x[2] === 4), JSON.stringify(r.q));
  assert.deepEqual(r.drop, [-4, -3, -3]);
  assert.deepEqual(r.everyday, [-4, -3, -3]);
  assert.deepEqual(r.mems, [0, 0, 0], 'no memories');
  assert.deepEqual(r.feed.filter(t => /Glenda|Nikki|Travis|Word got round/.test(t)), [], 'no lines: ' + JSON.stringify(r.feed));
  assert.ok(r.feed.includes('Marcus Bell stops taking your word.'));
});

s.test('example 9, Loretta goes quiet (B): shaming Royce at the counter reaches her when she sees him next, through a tie nobody knows; her card names the act and its day, the narrator only that she is cooler for a reason of her own', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    S.apply({ npcKnownToPlayer: ['npc_loretta', 'npc_royce'] });
    // After two nights she is at W 26.
    S.apply({ relSet: { npcId: 'npc_loretta', w: 26 } });
    // Day 4 (Sunday) morning at Pittman's counter, with Dewayne, Jodie and Lamar there.
    const here = __put('loc_pittmans', ['npc_royce', 'npc_dewayne', 'npc_jodie', 'npc_lamar'], 4, 'morning');
    await __say('npc_royce', 'Royce sold his vote to Carter.', {}, { socialEvents: ['npc_royce insulted: said I sold my vote to Carter'] });
    const royce = [__tr('npc_royce'), S.npc('npc_royce').memories.filter(m => m.d).map(m => m.event)];
    const q = st.hearsay.filter(x => x.npcId === 'npc_loretta').map(x => [x.via, x.factor, x.hidden, x.d.w]);
    // The days go by (each /wait a turn of its own) until she and Royce share a place: Monday afternoon at the Low Water.
    const steps = [];
    for (const ph of ['afternoon', 'evening', 'night', 'morning', 'afternoon']) {
      __mark();
      await G.Pipeline.submit(`/wait ${ph}`);
      const e = st.hearsay.find(x => x.npcId === 'npc_loretta');
      steps.push({ at: [st.time.day, st.time.phase], w: __tr('npc_loretta').w, heard: !!(e && Number.isInteger(e.deliveredTurn)), feed: __feed() });
    }
    const lor = S.npc('npc_loretta');
    return { here, royce, q, steps, stance: __st('npc_loretta'), toYou: G.Pipeline.toYou(lor), card: R.reasons(lor, 2).map(x => G.Pipeline.reasonText(lor, x).card), recap: G.Pipeline.recapText ? String(G.Pipeline.recapText()) : '' };
  });
  for (const id of ['npc_royce', 'npc_dewayne', 'npc_jodie', 'npc_lamar']) assert.ok(r.here.includes(id), id);
  // Said in front of three, it is humiliated: Royce W -5.
  assert.deepEqual(r.royce[1], ['humiliated']);
  assert.equal(r.royce[0].w, -5);
  // Loretta, his lover (hidden; 0.7 x 0.9 x 0.75 = 0.47): W -7, when they meet.
  assert.deepEqual(r.q, [['meet', 0.47, true, -7]]);
  const heard = r.steps.findIndex(x => x.heard);
  assert.deepEqual(r.steps[heard].at, [5, 'afternoon'], 'Monday afternoon: ' + JSON.stringify(r.steps));
  assert.ok(r.steps.slice(0, heard).every(x => x.w === 26), 'not before');
  // W 19: friendly (below warm's exit at 20).
  assert.equal(r.steps[heard].w, 19);
  assert.deepEqual(r.stance, ['friendly']);
  assert.ok(r.steps[heard].feed.includes('Loretta Gaddis cools toward you.'), JSON.stringify(r.steps[heard].feed));
  assert.ok(r.steps[heard].feed.includes('Word got round: Loretta Gaddis has heard about Pittman\'s.'), JSON.stringify(r.steps[heard].feed));
  assert.match(r.toYou, /^to you: friendly — cooler since Day 4, for a reason of her own, keeps it to herself, never hint at it — plays it: /);
  assert.doesNotMatch(r.toYou, /Royce|Pittman|shame/);
  assert.deepEqual(r.card, ['Cooler since you shamed Royce Pittman at Pittman\'s Gas and Service, Day 4. Hasn\'t said why.']);
  assert.doesNotMatch(r.recap, /shamed Royce/, '/recap never gives a hidden reason');
});

// A person's Ties on their People card (the card opened), for the B examples of wave 32.
const tiesOn = page => page.evaluate(() => {
  window.__ties = id => {
    Game.UI.openPanel('people');
    Game.UI.togglePerson(id, true);
    const dd = document.querySelector(`.pcard[data-npc="${id}"] .pcard-facts dd[data-fact="ties"]`);
    const t = dd ? dd.textContent : null;
    if (Game.UI.closePanel) Game.UI.closePanel();
    return t;
  };
});

s.test('example 2, the garage money (B): telling Dewayne moves his tie to Mavis from 50/60 to 30/15 in front of the player; she hears who told that night, under the same roof, and the morning says so; the narrator hears BETWEEN THEM and his card says "strained since Day 5"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  await tiesOn(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_mavis', 'npc_dewayne'] });
    // Day 4 night at the motel desk, Mavis alone: the A part, the garage money held.
    __put('loc_motor_court', ['npc_mavis'], 4, 'night');
    const others = S.npcsAt('loc_motor_court').map(n => n.id).filter(id => id !== 'npc_mavis');
    S.apply({ visits: others.map(id => ({ npcId: id, locationId: 'loc_front_street' })) });
    G.Pipeline.forceNextRoll(17);
    await __say('npc_mavis', 'Long night at the desk?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_mavis learned_secret: emptied Dewayne\'s garage account for Mama\'s note'] },
      'Mavis Mangum looks at the motel till a long time. "I emptied the garage account," she says. "All of it. For my mother\'s note on the house."');
    out.card4 = __ties('npc_dewayne');
    // Day 5 evening at the landing: the player tells Dewayne.
    __put('loc_purvis_landing', ['npc_dewayne'], 5, 'evening');
    const tie0 = R.tieNow(st.ties['npc_dewayne>npc_mavis']);
    const m0 = __tr('npc_mavis');
    await __say('npc_dewayne', 'Mavis emptied your garage account to pay off her mother\'s note.', null, { socialEvents: ['npc_dewayne exposed npc_mavis: told me Mavis spent the garage money'] });
    const tie1 = st.ties['npc_dewayne>npc_mavis'];
    out.tie = [[tie0.w, tie0.t], [R.tieNow(tie1).w, R.tieNow(tie1).t], tie1.known === true];
    out.queued = st.hearsay.filter(x => x.npcId === 'npc_mavis' && x.own).map(x => [x.event, x.via, x.dueDay, x.duePhase]);
    out.mavis5 = [__tr('npc_mavis').w - m0.w, __tr('npc_mavis').t - m0.t];
    __mark();
    await G.Pipeline.submit('/rest');
    const mv = S.npc('npc_mavis');
    out.day6 = { time: [st.time.day, st.time.phase], tracks: __tr('npc_mavis'), scar: mv.memories.filter(m => m.event === 'exposed').map(m => [m.weight, m.decay, m.d.w, m.d.t, m.day]), stance: __st('npc_mavis'), feed: __feed() };
    // Day 6 morning at the motor court, the two of them there.
    __put('loc_motor_court', ['npc_mavis', 'npc_dewayne'], null);
    await __say('npc_mavis', 'Morning.', null, {});
    out.between = G.Pipeline.lastTurn.packet.split('\n').filter(l => /^BETWEEN THEM/.test(l));
    out.toYou = G.Pipeline.toYou(mv);
    out.card6 = __ties('npc_dewayne');
    return out;
  });
  assert.match(r.card4, /^wife Mavis Mangum; /, 'before: no word on the tie');
  // B: Dewayne→Mavis 50/60 to 30/15 (the town's secretTies: -20, -45), in front of the player, so the town knows it.
  assert.deepEqual(r.tie, [[50, 60], [30, 15], true]);
  // She is not there: she hears who told by the tie between them, his wife under one roof, that night.
  assert.deepEqual(r.mavis5, [0, 0]);
  assert.deepEqual(r.queued, [['exposed', 'overnight', 5, 'night']]);
  // Mavis by morning: W -30, T -39 (x1.3, guarded), a weight-3 scar dated by the telling; run alone W -35, T -49, F 0 (as in A).
  assert.deepEqual(r.day6.time, [6, 'morning']);
  assert.deepEqual(r.day6.scar, [[3, 'scar', -30, -39, 5]]);
  assert.deepEqual(wtf(r.day6.tracks), [-35, -49, 0]);
  assert.equal(r.day6.stance[0], 'against you');
  // Day 6: "Word got round: Mavis Mangum has heard what you told Dewayne." (the band line beside it, wave 27's).
  assert.deepEqual(r.day6.feed, ['Word got round: Mavis Mangum has heard what you told Dewayne.', 'Mavis Mangum won\'t forget that.']);
  // The narrator: her reason dated Day 5; BETWEEN THEM for the two of them, one line.
  assert.match(r.toYou, /^to you: against you — you told Dewayne Mangum what she was hiding: emptied Dewayne's garage account for Mama's note \(Day 5\) — plays it: polite as a locked door/);
  assert.deepEqual(r.between, ['BETWEEN THEM: Dewayne Mangum and Mavis Mangum, strained since the garage money (Day 5).']);
  // Dewayne's card: "wife Mavis Mangum, strained since Day 5".
  assert.match(r.card6, /^wife Mavis Mangum, strained since Day 5; /);
});

s.test('example 11, Hollis Byrd (B): the report to Wade goes through a tie nobody knows, so his card has only the day and the narrator no cause, and nothing tells of the two of them; once Hollis is talking it is an ordinary reason', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  await tiesOn(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    const wade = () => S.npc('npc_wade');
    const why = () => ({ card: R.reasons(wade(), 2).map(x => G.Pipeline.reasonText(wade(), x).card), toYou: G.Pipeline.toYou(wade()), ties: [__ties('npc_hollis'), __ties('npc_wade')] });
    S.apply({ npcKnownToPlayer: ['npc_hollis', 'npc_wade'] });
    // The A part: his books on Day 2, $300 asked on Day 3; the report goes to Wade.
    __put('loc_byrds_pawn', ['npc_hollis'], 2, 'afternoon');
    G.Pipeline.forceNextRoll(16);
    await __say('npc_hollis', 'What are these receipts for, really?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_hollis they_confided: told me how he runs the shop', 'npc_hollis learned_secret: runs the landing\'s cash through his pawn books'] },
      '"I don\'t ask where, I ask how much," Hollis Byrd says, and slides over the landing\'s cash book. Every line of it is pawn sales.');
    __put('loc_byrds_pawn', ['npc_hollis'], 3, 'afternoon');
    await __say('npc_hollis', 'Three hundred, or the sheriff in Clayburn gets a copy of your books.', { actionType: 'intimidate', aboutIds: ['lev_hollis_1'] });
    for (let i = 0; i < 3 && !wade().memories.length; i++) await G.Pipeline.submit('/rest');
    out.tie = (k => [k.hidden, k.known])(st.ties['npc_hollis>npc_wade']);
    out.mem = wade().memories.map(m => [m.event, m.day, m.secondhand]);
    out.hidden = why();
    // Both of them at the pawn shop: nothing between them for the narrator.
    __put('loc_byrds_pawn', ['npc_hollis', 'npc_wade'], null);
    await __say('npc_wade', 'Afternoon.', null, {});
    out.packet = G.Pipeline.lastTurn.packet.split('\n').filter(l => /^BETWEEN THEM/.test(l) || /^PRESENT/.test(l)).map(l => (/^BETWEEN/.test(l) ? l : /Night Run's cash|runs the Night Run/.test(l)));
    // The flag the tie is revealed by: Hollis is talking. The town knows it from the next change on.
    S.apply({ effects: [{ op: 'setFlag', key: 'hollisTalking', value: true }] });
    await __say('npc_wade', 'Hollis says hello.', null, {});
    out.tie2 = (k => [k.hidden, k.known])(st.ties['npc_hollis>npc_wade']);
    out.known = why();
    out.between2 = G.Pipeline.lastTurn.packet.split('\n').filter(l => /^BETWEEN THEM/.test(l));
    return out;
  });
  // Hollis→Wade 10/30, hidden (design appendix B), revealed by the flag hollisTalking.
  assert.deepEqual(r.tie, [true, false]);
  assert.deepEqual(r.mem, [['crossed', 4, { via: 'npc_hollis', hidden: true }]], 'the report, heard through the hidden tie');
  // R1: the card has the day and no name, the narrator no cause (the code's Day 4: the day the seed has Hollis tell him; design.md says so).
  assert.deepEqual(r.hidden.card, ['Cooler since Day 4. Hasn\'t said why.']);
  assert.match(r.hidden.toYou, /^to you: cool to you — cooler since Day 4, for a reason of his own, keeps it to himself, never hint at it — plays it: /);
  assert.doesNotMatch(r.hidden.toYou, /Hollis|Night Run|books|leaning/);
  // Nothing shows the Night Run link: neither card names the other, and the narrator gets no BETWEEN THEM.
  for (const t of r.hidden.ties) assert.doesNotMatch(t, /Hollis|Wade/);
  assert.deepEqual(r.packet, [false], 'the PRESENT line, no BETWEEN THEM and no word of the cash: ' + JSON.stringify(r.packet));
  // Once Hollis is talking the tie is known, and the reason is an ordinary one, dated.
  assert.deepEqual(r.tie2, [true, true]);
  assert.deepEqual(r.known.card, ['Hollis Byrd says you have been leaning on them.']);
  assert.match(r.known.toYou, /^to you: cool to you — Hollis Byrd says you have been leaning on them \(Day 4\) — plays it: /);
  // A tie the town knows now, but nothing changed on it in front of the player: still nothing between them.
  assert.deepEqual(r.between2, []);
});

s.test('example 15, Jodie at the motor court (A): walked in by the story, then "I lean in to kiss her" parsed as a flirt at nobody is aimed at her alone; she is open to it, S +12; by the fifth morning she is "Suspicious of you · using you"', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await kit(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = { days: [] };
    const J = 'npc_jodie';
    const doTurn = (words, parse, text) => {
      G.Api.Mock.queue('parse', Object.assign({ actionType: 'other', summary: words, targets: [], needsRoll: false, timeCost: 'instant', romantic: null }, parse));
      G.Api.Mock.queue('narrate', { text });
      G.Api.Mock.queue('bookkeep', {});
      return G.Pipeline.submit(words, { mode: 'do' });
    };
    const walk = 'You walk the highway back and let yourself into Room 6. Brianna\'s cleaning cart sits two doors down, and Curtis Pruett is smoking under the overhang outside his room. About ten minutes later there are two quick knocks, and Jodie slips in with her hood dripping. She stays by the door. "Curtis saw me come in, so we don\'t have long. You wanted to talk, so talk."';
    const kissed = 'She doesn\'t pull back. For a second she kisses you back, then she pushes off and opens the door. "Two o\'clock, back door of the Low Water."';
    S.apply({ npcKnownToPlayer: [J, 'npc_curtis', 'npc_brianna', 'npc_lyman'] });
    // His enemy loose end: start W -45, T -55; a threat of his on her record; now W -18, T -37, K 51.
    S.apply({ relStart: [{ npcId: J, w: -45, t: -55 }] });
    S.apply({ socialEvents: [{ npcId: J, event: 'threatened', text: 'threatened to tell the police chief', weight: 2 }] });
    S.apply({ relSet: { npcId: J, w: -18, t: -37, k: 51 } });
    out.start = [__tr(J), __st(J)];
    for (let d = 3; d <= 7; d++) {
      __put('loc_pittmans', [], d, 'morning');
      await doTurn('we make it successfully to my room', { actionType: 'move', destinationId: 'loc_motor_court', timeCost: 'short' }, walk);
      const here = S.npcsAt(st.player.locationId).map(n => n.id);
      const s0 = __tr(J).s;
      const t0 = st.meta.turn;
      // Wave 34: the kiss is a charm roll against her (easy); forced to succeed.
      G.Pipeline.hooks.nextTier = 'success';
      await doTurn('I don\'t say anything, I lean in to kiss her', { romantic: 'flirt' }, kissed);
      const c = G.Pipeline.lastTurn.ctx;
      out.days.push({ roll: c.roll ? [c.roll.stat, c.roll.difficulty, c.roll.tier] : null, here, aimed: c.romance.aimed, lines: G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE/.test(l)), ds: __tr(J).s - s0, s: __tr(J).s, st: __st(J),
        others: here.filter(id => id !== J).filter(id => S.npc(id).memories.some(m => m.event === 'flirted' && m.turn > t0)) });
    }
    out.end = [__tr(J), __st(J), R.cue(S.npc(J)), S.npc(J).rel.wRom];
    return out;
  });
  assert.deepEqual([r.start[0].w, r.start[0].t, r.start[0].k, r.start[0].s], [-18, -37, 51, 0]);
  assert.equal(r.start[1][0], 'suspicious of you');
  const d3 = r.days[0];
  for (const id of ['npc_jodie', 'npc_curtis', 'npc_brianna', 'npc_lyman']) assert.ok(d3.here.includes(id), id + ' here: ' + JSON.stringify(d3.here));
  for (const d of r.days) {
    assert.deepEqual(d.aimed, ['npc_jodie']);
    assert.deepEqual(d.roll, ['charm', 'easy', 'success']);
    assert.deepEqual(d.lines, ['ROMANCE (decided by the engine): Jodie Strayhorn is open to it: she flirts back, her own way.']);
    assert.deepEqual(d.others, [], 'Curtis, Lyman and Brianna: no flirt');
  }
  assert.equal(d3.ds, 12, 'S +12 (10 x her rate 1.2)');
  assert.deepEqual(r.days.map(d => d.s), [12, 22, 32, 39, 46], 'the design\'s mornings (wave 34: on five successful rolls)');
  assert.equal(r.days[2].st[1], 'has noticed you');
  const [tr, st, cue, wRom] = r.end;
  assert.ok(tr.w - wRom < 25 && tr.t <= -25, JSON.stringify(r.end));
  assert.deepEqual(st.slice(0, 2), ['suspicious of you', 'using you'], '"Suspicious of you · using you"');
  assert.equal(cue, 'wants you around for one reason, doesn\'t ask about your day');
});

s.run();
