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
   (the drinking buddy) and 5 (the surveyor who wasn't), their A parts.
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
  // The witnesses (A: the witness row, one copy each; the ties' share is tier B).
  for (const w of ['lorna', 'trent', 'dewayne']) {
    assert.equal(r[w].copies, 1, `${w}: one copy`);
    assert.equal(r[w].tracks.w, (w === 'trent' ? 10 : w === 'lorna' ? 5 : 0) - 18, `${w}: liking -18 (-5, -5, -8)`);
    assert.equal(r[w].stance, 'cool to you', `${w}: cool to you`);
  }
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
  assert.deepEqual(d3.royce, [-5, -4, 10]);
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

s.run();
