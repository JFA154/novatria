'use strict';
/* The design's worked examples as executable tests (docs/relationships/
   design.md section 6.4; the integration plan's 15.1). Each is its own
   playthrough, scripted through the mock (Api.Mock.queue for the parses and
   the bookkeeper's replies): the tracks within 2 of the design's numbers,
   the stance and the feed lines exact where the feature exists by this
   wave. Where the code's number differs from the design's the code's is
   pinned and design.md says so. Wave 27 (A2) starts the file with
   example 4 (Colt on the ground: its A part) and example 7 (Tyler: afraid
   of you). Run with: node tests/run.cjs relationships-examples */
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

s.run();
