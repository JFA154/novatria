'use strict';
/* Wave 35 (the owner: "I want 6 sliders with spark too", "Romance and
   spark are different", "Do it 7 then, the more detailed the better"):
   romance is a stored track (m) beside spark (s). Spark is wanting,
   romance is caring about someone that way; the statuses read both; the
   night reads romance 40 where it read liking 40; the Edit form has seven
   sliders (Likes, Trusts, Scared, Knows, Spark, Romance, Owes you) and the
   card's More fold all seven words for an adult. Nobody under 18, and
   nobody with a player under 18, has any romance, from any writer. An
   older save loads with romance 0 and nothing else moved. Mock mode.
   Run with: node tests/run.cjs wave35 */
const assert = require('assert/strict');
const { suite, quickStart, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');
const { makeV8Save } = require('./fixtures/make-v8-save.cjs');

const s = suite('wave35-romance-track');

/* In the page: __put (the player somewhere with these people, now), __say
   (a Say line, its parse and bookkeeper reply given; a flirt's charm roll
   forced to window.__tier), __model (the bookkeeper's events applied),
   __tr (the tracks). */
const setup = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    if (ids && ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__tier = 'success';
  window.__say = async (to, words, parse, book) => {
    if (parse && (parse.romantic === 'flirt' || parse.romantic === 'more') && window.__tier) G.Pipeline.hooks.nextTier = window.__tier;
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (book) G.Api.Mock.queue('bookkeep', book);
    return G.Pipeline.submit(words, { mode: 'say', to });
  };
  window.__model = (events, present) => G.State.apply({ socialEvents: events }, { source: 'model', present, narration: '' });
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
});
const start = async (h, opts) => { const page = await h.open(opts); await quickStart(page, { kinds: [] }); await setup(page); return page; };
const rows = page => page.evaluate(() => [...document.querySelectorAll('#panel-body .pedit-feel-row')].map(r => { const i = r.querySelector('input'); return [r.querySelector('label').textContent, i.name, i.disabled, i.min, i.max]; }));

for (const [vp, size] of [['laptop', LAPTOP], ['phone', PHONE]]) {
  s.test(`(a) the Edit form at ${vp} width: seven sliders for an adult in order, Spark and Romance shown off at 0 for a minor, left out with a player under 18; each lands exactly in fix, the quiet line names them, /undo takes it back`, async h => {
    const page = await start(h, { viewport: size });
    await page.evaluate(() => { const S = Game.State; S.apply({ npcKnownToPlayer: ['npc_curtis', 'npc_kaylee', 'npc_trent'] }); Game.UI.openPanel('people'); Game.UI.editPerson('npc_curtis'); });
    assert.deepEqual(await rows(page), [
      ['Likes', 'attitude', false, '-100', '100'], ['Trusts', 'trust', false, '-100', '100'], ['Scared', 'fear', false, '0', '100'], ['Knows', 'knows', false, '0', '100'],
      ['Spark', 'spark', false, '0', '100'], ['Romance', 'romance', false, '0', '100'], ['Owes you', 'owed', false, '-3', '3']
    ], 'an adult: seven, in order');
    if (size === PHONE) {
      assert.deepEqual(await overflowReport(page, 375), [], 'no horizontal scroll at 375');
      const fit = await page.evaluate(() => [...document.querySelectorAll('#panel-body .pedit-att')].map(a => { const r = a.getBoundingClientRect(); const range = a.querySelector('.pedit-range').getBoundingClientRect(); return [Math.round(r.right), Math.round(range.width)]; }));
      assert.ok(fit.every(([right, w]) => right <= 375 && w >= 100), 'every slider row inside the phone, the range still wide: ' + JSON.stringify(fit));
    }
    const slide = (k, v) => page.evaluate(([k, v]) => { const r = document.querySelector(`#pe-${k}-npc_curtis`); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]);
    for (const [k, v] of [['spark', 42], ['romance', 33], ['owed', -2]]) await slide(k, v);
    assert.deepEqual(await page.evaluate(() => ['spark', 'romance', 'owed'].map(k => document.querySelector(`#pe-${k}-word-npc_curtis`).textContent)), ['42 · yes', '33 · some', '-2 · you owe them a lot']);
    const before = await page.evaluate(() => JSON.stringify(Game.State.npc('npc_curtis').rel));
    await page.click('#panel-body .pcard[data-npc="npc_curtis"] .pedit-save');
    const saved = await page.evaluate(() => { const n = Game.State.npc('npc_curtis'); return { tr: Game.Rel.tracksOf(n), fix: [n.rel.fix.s, n.rel.fix.m], owed: n.rel.owed.slice(-1)[0], quiet: [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent).pop() }; });
    assert.deepEqual([saved.tr.s, saved.tr.m, saved.tr.owed], [42, 33, -2], 'each lands exactly');
    assert.deepEqual(saved.fix, [42, 33], 'in fix: it never drifts');
    assert.deepEqual([saved.owed.dir, saved.owed.size, saved.owed.why, /^fix-\d+-npc_curtis-o$/.test(saved.owed.key)], [-1, 2, 'set by hand', true], 'owed: one entry set by hand');
    assert.equal(saved.quiet, 'Edited Curtis Pruett: spark, romance, owed.');
    await page.evaluate(() => Game.Pipeline.submit('/undo'));
    assert.equal(await page.evaluate(() => JSON.stringify(Game.State.npc('npc_curtis').rel)), before, '/undo takes the edit back');
    // A minor: the four, Spark and Romance shown off at 0, and Owes you (favours are not romance).
    await page.evaluate(() => { Game.UI.openPanel('people'); Game.UI.editPerson('npc_kaylee'); });
    assert.deepEqual((await rows(page)).map(r => [r[0], r[2]]), [['Likes', false], ['Trusts', false], ['Scared', false], ['Knows', false], ['Spark', true], ['Romance', true], ['Owes you', false]], 'a minor: Spark and Romance off');
    assert.deepEqual(await page.evaluate(() => ['spark', 'romance'].map(k => document.querySelector(`#pe-${k}-npc_kaylee`).value)), ['0', '0']);
    await page.click('#panel-body .pcard[data-npc="npc_kaylee"] .pedit-cancel');
    // The player under 18: no Spark and no Romance for anyone.
    await page.evaluate(() => { Game.state.player.age = 16; Game.UI.editPerson('npc_trent'); });
    assert.deepEqual((await rows(page)).map(r => r[0]), ['Likes', 'Trusts', 'Scared', 'Knows', 'Owes you'], 'a player under 18: five');
    await page.click('#panel-body .pcard[data-npc="npc_trent"] .pedit-cancel');
  });
}

s.test('(b) romance grows only from substance with spark up: a confidence at spark 10 moves nothing, at spark 25 it moves +4; ten mornings of flirting alone never make anyone sweet on you; Jodie over five mornings of a flirt and one confidence', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel;
    const out = {};
    // Curtis: on the list at rate 1.0, so a confidence is the table's +4.
    __put('loc_motor_court', ['npc_curtis'], 2, 'evening');
    S.apply({ relSet: { npcId: 'npc_curtis', s: 10, k: 30 } });
    __model([{ npcId: 'npc_curtis', event: 'they_confided', text: 'told me about the job in Clayburn' }], ['npc_curtis']);
    out.at10 = __tr('npc_curtis').m;
    S.apply({ setTime: { day: 3, phase: 'evening' } });
    S.apply({ relSet: { npcId: 'npc_curtis', s: 25 } });
    __model([{ npcId: 'npc_curtis', event: 'they_confided', text: 'told me why he left the army' }], ['npc_curtis']);
    out.at25 = __tr('npc_curtis').m;
    out.rate = R.tuningOf(S.npc('npc_curtis')).romanceRate;
    // A rebuff (a turn on: the bookkeeper's two a person a turn) takes it down.
    await __say('npc_curtis', 'Evening.');
    __model([{ npcId: 'npc_curtis', event: 'rebuffed', text: 'turned me down flat' }], ['npc_curtis']);
    out.rebuffed = __tr('npc_curtis').m;
    // Shayla, ten mornings of welcome flirts and nothing else.
    out.flirts = [];
    for (let d = 2; d <= 11; d++) {
      __put('loc_riverbend', ['npc_shayla'], d, 'morning');
      await __say('npc_shayla', 'You look good today.', { romantic: 'flirt' });
      out.flirts.push([d, __tr('npc_shayla').s, __tr('npc_shayla').m, R.sparkStatus(S.npc('npc_shayla'))]);
    }
    // Jodie: five mornings of a successful flirt, and one confidence (the third evening).
    S.apply({ relSet: { npcId: 'npc_jodie', k: 25 } });
    out.jodie = [];
    for (let d = 12; d <= 16; d++) {
      __put('loc_low_water', ['npc_jodie'], d, 'evening');
      await __say('npc_jodie', 'You have a nice smile.', { romantic: 'flirt' });
      if (d === 14) { await __say('npc_jodie', 'Long night?'); __model([{ npcId: 'npc_jodie', event: 'they_confided', text: 'told me about her brother' }], ['npc_jodie']); }
      out.jodie.push([d, __tr('npc_jodie').s, __tr('npc_jodie').m, R.sparkStatus(S.npc('npc_jodie'))]);
    }
    return out;
  });
  assert.equal(r.at10, 0, 'at spark 10 a confidence grows no romance');
  assert.equal(r.rate, 1, 'Curtis: romanceRate is his sparkRate');
  assert.equal(r.at25, 4, 'at spark 25 it is +4');
  assert.equal(r.rebuffed, 0, 'a rebuff takes romance down (-10, never under 0)');
  assert.ok(r.flirts.every(x => x[3] !== 'sweet on you' && x[3] !== 'falling for you'), 'ten mornings of flirting alone: never sweet on you: ' + JSON.stringify(r.flirts));
  assert.ok(r.flirts.every(x => x[2] < 30) && r.flirts[9][2] > 0, 'romance grows a little from a flirt (+2 x 1.5), never to 30: ' + JSON.stringify(r.flirts));
  assert.ok(r.flirts[9][1] >= 40 && ['wants you', 'using you'].includes(r.flirts[9][3]), 'she wants the player, though: ' + JSON.stringify(r.flirts[9]));
  // Jodie (rate 1.2): spark 12, 22, 32, 39, 46 as wave 33 pins; the confidence on the third evening, at spark 32, gives +5 (4 x 1.2).
  assert.deepEqual(r.jodie.map(x => x[1]), [12, 22, 32, 39, 46], 'her spark');
  assert.deepEqual(r.jodie.map(x => x[2]), [2, 4, 11, 12, 14], JSON.stringify(r.jodie) + ' her romance: +2 x 1.2 a flirt, +5 for the confidence, fading on the bond clock');
  assert.deepEqual(r.jodie.map(x => x[3]), [null, 'has noticed you', 'has noticed you', 'has noticed you', 'wants you']);
});

s.test('(c) the statuses read spark and romance: noticed, wants, using (earned distrust or the mercenary flag), sweet on you, falling for you; the More fold shows all seven words for an adult and five for a minor', async h => {
  const page = await start(h, { viewport: PHONE });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel;
    const set = (id, t) => { S.apply({ relSet: Object.assign({ npcId: id }, t) }); return [R.sparkStatus(S.npc(id)), R.stance(S.npc(id)).tags.filter(x => R.SPARK_STATUS.some(y => y.status === x))]; };
    const out = {};
    out.noticed = set('npc_trent', { s: 20, m: 0 });
    out.none = set('npc_carter', { s: 19, m: 29 });
    out.wants = set('npc_nikki', { s: 40, m: 19, t: 0 });
    out.wantsCue = R.cue(S.npc('npc_nikki'));
    // Distrust with nothing earned: still "wants you", saying it does not trust the player.
    out.distrust = set('npc_glenda', { s: 45, m: 10, t: -30 });
    out.distrustCue = R.cue(S.npc('npc_glenda'));
    // Earned: a lie caught on her record.
    S.apply({ socialEvents: [{ npcId: 'npc_colt', event: 'lied_caught', text: 'never served in the Guard' }] });
    out.earned = set('npc_colt', { s: 45, m: 10, t: -30 });
    // The mercenary flag (Shayla).
    out.flag = set('npc_shayla', { s: 45, m: 10, t: -30 });
    // Romance 20 and up: neither wants nor using; 30 is sweet, whatever spark is.
    out.between = set('npc_annette', { s: 45, m: 22, t: 0 });
    out.sweet = set('npc_lamar', { s: 0, m: 30 });
    out.sweetSpark = set('npc_tyler', { s: 35, m: 65 });
    out.falling = set('npc_travis', { s: 40, m: 60 });
    out.fallingCue = R.cue(S.npc('npc_travis'));
    out.hold = [set('npc_travis', { m: 56 })[0], set('npc_travis', { m: 54 })[0]];
    out.thresholds = R.SPARK_STATUS.map(x => [x.status, x.spark || 0, x.romance || 0, x.below || null]);
    out.words = [0, 10, 30, 60, 85].map(v => R.words('m', v));
    out.owedWords = [3, 1, 0, -1, -3].map(v => R.words('owed', v));
    S.apply({ npcKnownToPlayer: ['npc_travis', 'npc_kaylee'] });
    return out;
  });
  assert.deepEqual(r.noticed, ['has noticed you', ['has noticed you']]);
  assert.deepEqual(r.none, [null, []], 'spark 19 and romance 29: nothing');
  assert.deepEqual(r.wants, ['wants you', ['wants you']]);
  assert.match(r.wantsCue, /^flirts back, keeps it light, not sure she likes you/);
  assert.deepEqual(r.distrust[0], 'wants you', 'distrust the player did not earn is no "using you"');
  assert.match(r.distrustCue, /^flirts back, keeps it light, doesn't trust you/);
  assert.equal(r.earned[0], 'using you', 'a lie caught: earned');
  assert.equal(r.flag[0], 'using you', 'the mercenary flag');
  assert.equal(r.between[0], 'has noticed you', 'romance 22: past "wants you", short of sweet');
  assert.equal(r.sweet[0], 'sweet on you', 'romance 30 with no spark: sweet on you');
  assert.equal(r.sweetSpark[0], 'sweet on you', 'romance 65, spark 35: short of falling');
  assert.equal(r.falling[0], 'falling for you');
  assert.match(r.fallingCue, /^lights up when you come in, stands close, asks where you've been/);
  assert.deepEqual(r.hold, ['falling for you', 'sweet on you'], 'held 5 back (56), lost past it (54)');
  assert.deepEqual(r.thresholds, [['falling for you', 40, 60, null], ['sweet on you', 0, 30, null], ['using you', 40, 0, 20], ['wants you', 40, 0, 20], ['has noticed you', 20, 0, null]]);
  assert.deepEqual(r.words, ['no', 'a little', 'some', 'a lot', 'head over heels']);
  assert.deepEqual(r.owedWords, ['owes you a lot', 'owes you one', 'even', 'you owe them one', 'you owe them a lot']);
  // The card's More: seven words for an adult, readable at 375; five for a minor.
  const words = async id => {
    await page.evaluate(id => { Game.UI.openPanel('people'); Game.UI.togglePerson(id); }, id);
    await page.click(`#panel-body .pcard[data-npc="${id}"] .pcard-words-fold > summary`);
    return page.evaluate(id => [...document.querySelectorAll(`#panel-body .pcard[data-npc="${id}"] .pcard-word`)].map(w => [w.querySelector('dt').textContent, w.querySelector('dd').textContent]), id);
  };
  const travis = await words('npc_travis');
  assert.deepEqual(travis.map(w => w[0]), ['Likes you', 'Trusts you', 'Scared', 'Knows you', 'Spark', 'Romance', 'Owes']);
  assert.deepEqual(travis.slice(4).map(w => w[1]), ['yes', 'some', 'even'], 'spark 40, romance 54');
  assert.deepEqual(await overflowReport(page, 375), [], 'no horizontal scroll at 375');
  const kay = await words('npc_kaylee');
  assert.deepEqual(kay.map(w => w[0]), ['Likes you', 'Trusts you', 'Scared', 'Knows you', 'Owes']);
});

s.test('(d) the guard: a minor\'s romance is refused from every writer and zeroed at load; with a player under 18 nobody\'s romance moves', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const out = {};
    const why = res => res.rejected.map(x => x.reason).join(' | ');
    out.writes = [
      why(S.apply({ relSet: { npcId: 'npc_micah', m: 10 } })),
      why(S.apply({ editPerson: { npcId: 'npc_micah', rel: { m: 10 } } }, { source: 'player' })),
      why(S.apply({ socialEvents: [{ npcId: 'npc_micah', event: 'they_confided', text: 'told me about his mom', d: { m: 5 } }] })),
      why(W.applyEffects([{ op: 'socialEvent', npcId: 'npc_micah', event: 'they_confided', text: 'told me about his mom', d: { m: 5 } }]))
    ];
    // The table's own +4 for a minor (spark up is impossible, so set it on the record by hand first): refused and logged, 0 stays 0.
    S.npc('npc_micah').rel.everyday.s = 30;
    S.apply({ socialEvents: [{ npcId: 'npc_micah', event: 'defended', text: 'stood up for me at the landing', aboutId: 'npc_lorna' }] });
    out.micah = [__tr('npc_micah').s, __tr('npc_micah').m];
    // An import with romance on Kaylee: zeroed at load and logged.
    const old = JSON.parse(JSON.stringify(st));
    const k = old.npcs.find(x => x.id === 'npc_kaylee');
    k.rel.m = 40; k.rel.fix.m = 40; k.rel.start.m = 3;
    k.memories.push({ turn: 0, day: 1, text: 'listened to me', weight: 2, event: 'they_confided', d: { w: 5, t: 3, f: 0, k: 10, s: 0, m: 4 }, decay: 'wound', key: 'm0-imp' });
    S.load(old, S.town);
    const ky = S.npc('npc_kaylee');
    out.kaylee = [ky.rel.m, ky.rel.fix.m, ky.rel.start.m, ky.memories.filter(m => m.d && m.d.m).length, R.tracksOf(ky).m];
    out.logged = S.debugLog.filter(x => x.kind === 'rejected' && /npc_kaylee/.test(x.path || '')).map(x => x.reason).pop();
    // A player of 16: an adult's romance moves for nobody (the loaded game is G.state now).
    G.state.player.age = 16;
    out.young = why(S.apply({ relSet: { npcId: 'npc_jodie', m: 10 } }));
    S.apply({ relSet: { npcId: 'npc_jodie', k: 30 } });
    S.apply({ socialEvents: [{ npcId: 'npc_jodie', event: 'they_confided', text: 'told me about her brother' }] });
    out.jodie = [__tr('npc_jodie').m, R.sparkStatus(S.npc('npc_jodie'))];
    return out;
  });
  assert.equal(r.writes.length, 4);
  for (const x of r.writes) assert.match(x, /romance stays 0 for npc_micah: they are under 18/);
  assert.deepEqual(r.micah, [0, 0], 'nothing romantic moves for him');
  assert.deepEqual(r.kaylee, [0, 0, 0, 0, 0], 'the import zeroed: rel, its buckets and the memory');
  assert.equal(r.logged, 'romance set to 0 for npc_kaylee: they are under 18', 'and logged, by name');
  assert.match(r.young, /romance stays 0 for npc_jodie: the player is under 18/);
  assert.deepEqual(r.jodie, [0, null]);
});

s.test('(e) the night reads romance 40 where it read liking 40: spark 50, romance 40, trust 30, knows 30', async h => {
  const page = await start(h);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel;
    const gate = t => { S.apply({ relSet: Object.assign({ npcId: 'npc_jodie' }, t) }); const g = R.intimateGate(S.npc('npc_jodie')); return [g.ok, g.short]; };
    return {
      G: R.GATES.intimate,
      lowLiking: gate({ s: 55, m: 45, w: 0, t: 35, k: 35 }),
      lowRomance: gate({ s: 55, m: 35, w: 60, t: 35, k: 35 }),
      both: gate({ s: 45, m: 10, w: 60, t: 35, k: 35 })
    };
  });
  assert.deepEqual([r.G.spark, r.G.romance, r.G.trust, r.G.knows, r.G.liking], [50, 40, 30, 30, undefined]);
  assert.deepEqual(r.lowLiking, [true, []], 'liking is not read');
  assert.deepEqual(r.lowRomance, [false, ['romance 35 under 40']], 'romance is');
  assert.deepEqual(r.both, [false, ['spark 45 under 50', 'romance 10 under 40']]);
});

s.test('(f) an old save loads with romance 0 for everyone and nothing else changed: a pre-wave-26 save (rules 8), and a save from before romance with every m stripped', async h => {
  const old = await makeV8Save();
  const page = await h.open({ viewport: LAPTOP });
  const v8 = await page.evaluate(env => {
    const G = Game;
    G.Api.Mock.delay = 0;
    G.App.enter(G.Storage.parseEnvelope(JSON.stringify(env)), { confirmed: true });
    const st = G.state;
    return { rules: G.State.rulesVersion(st), romance: st.npcs.filter(n => n.rel.m !== 0 || n.rel.start.m !== 0 || n.rel.everyday.m !== 0 || n.rel.fix.m !== 0).map(n => n.id), att: st.npcs.every(n => n.attitude === n.rel.w), status: st.npcs.filter(n => G.Rel.sparkStatus(n)).map(n => n.id) };
  }, old.env);
  assert.equal(v8.rules, 8);
  assert.deepEqual(v8.romance, [], 'romance 0 for everyone, in every bucket');
  assert.equal(v8.att, true, 'liking is still exactly the attitude');
  assert.deepEqual(v8.status, [], 'no status for anyone');
  // A current game, made to look like one saved before wave 35 (every m removed), loads the same.
  await quickStart(page, { kinds: [] });
  await setup(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    __put('loc_riverbend', ['npc_shayla'], 2, 'morning');
    for (const d of [2, 3, 4]) { __put('loc_riverbend', ['npc_shayla'], d, 'morning'); await __say('npc_shayla', 'You look good today.', { romantic: 'flirt' }); }
    S.apply({ socialEvents: [{ npcId: 'npc_dewayne', event: 'hit', text: 'hit me over a tow bill' }] });
    const look = () => G.state.npcs.map(n => { const t = R.tracksOf(n); return [n.id, t.w, t.t, t.f, t.k, t.s, t.owed, R.stance(n).phrase, R.stance(n).tags.join('/'), R.sparkStatus(n)]; });
    const save = JSON.parse(JSON.stringify(st));
    for (const n of save.npcs) {
      for (const b of ['start', 'everyday', 'fix']) delete n.rel[b].m;
      delete n.rel.m;
      if (n.rel.bands) delete n.rel.bands.m;
      for (const m of n.memories) if (m.d) delete m.d.m;
    }
    const before = look();
    S.load(save, S.town);
    const was = st.npcs.find(n => n.id === 'npc_shayla').rel.m;
    return { loaded: G.state !== st, was, same: JSON.stringify(look()) === JSON.stringify(before), diff: look().filter((x, i) => JSON.stringify(x) !== JSON.stringify(before[i])).slice(0, 3), romance: G.state.npcs.filter(n => n.rel.m !== 0 || n.rel.start.m !== 0 || n.rel.everyday.m !== 0 || n.rel.fix.m !== 0).map(n => n.id) };
  });
  assert.equal(r.loaded, true, 'the stripped save is the game now');
  assert.ok(r.was > 0, 'Shayla had romance from the flirts before it was stripped: ' + r.was);
  assert.equal(r.same, true, 'every other track, stance, tag and status as it was: ' + JSON.stringify(r.diff));
  assert.deepEqual(r.romance, [], 'romance 0 for everyone');
});

s.test('(g) Owes you set by hand is an entry like any other: +2 at liking above -25 plants the payback; -1 is asked back after five days', async h => {
  const page = await start(h);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_burl', 'npc_dewayne'] });
    // Burl, +2 by hand at liking 0.
    S.apply({ relSet: { npcId: 'npc_burl', w: 0 } });
    out.edit = S.apply({ editPerson: { npcId: 'npc_burl', rel: { owed: 2 } } }, { source: 'player' }).applied;
    const burl = S.npc('npc_burl');
    out.burl = [R.tracksOf(burl).owed, burl.rel.owed.map(o => [o.dir, o.size, o.why]), R.stance(burl).tags];
    W.owedFavour(burl, st.time.day);
    out.payback = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'favour' && sd.origin.npcId === 'npc_burl' && sd.origin.why === 'owed').map(sd => sd.effects[sd.effects.length - 1].op);
    // And to 0 again: one balancing entry, the net even.
    S.apply({ editPerson: { npcId: 'npc_burl', rel: { owed: 0 } } }, { source: 'player' });
    out.even = [R.tracksOf(S.npc('npc_burl')).owed, S.npc('npc_burl').rel.owed.length];
    // Dewayne, -1 by hand: he asks for it back after five days.
    const day0 = st.time.day;
    S.apply({ relSet: { npcId: 'npc_dewayne', owed: -1 } });
    out.dewayne = R.tracksOf(S.npc('npc_dewayne')).owed;
    const asks = () => st.seeds.filter(x => x.origin && x.origin.npcId === 'npc_dewayne' && x.origin.why === 'ask');
    out.ask = [];
    for (let d = day0 + 1; d <= day0 + 6; d++) {
      S.apply({ setTime: { day: d, phase: 'morning' } });
      W.plantFeelings(d);
      out.ask.push([d - day0, asks().length]);
    }
    return out;
  });
  assert.deepEqual(r.edit, ['editPerson: npc_burl edited: owed 0 -> 2']);
  assert.deepEqual(r.burl, [2, [[1, 2, 'set by hand']], ['owes you big']]);
  assert.deepEqual(r.payback, ['owedSettle'], 'the payback seed, which ends square');
  assert.deepEqual(r.even, [0, 2], 'one balancing entry');
  assert.equal(r.dewayne, -1);
  const first = r.ask.find(x => x[1] >= 1);
  assert.ok(first && first[0] === 5, 'asked back after five days: ' + JSON.stringify(r.ask));
});

s.run();
