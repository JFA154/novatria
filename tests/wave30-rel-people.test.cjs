'use strict';
/* Wave 30 (A5 of docs/RELATIONSHIPS_PLAN.md, "What people show"; the
   integration plan's 16 A5): the People card (the stance chip, two dated
   reasons, what is held between them, the words behind "More"), the editor
   (four sliders and Interested; wave 35: seven, with Spark, Romance and
   Owes you; every memory field kept, the event picker,
   a record deleted), the feed's ranked lines, /recap's Careful and Owed,
   the narrator's "to you" line and the cached block, the council reading
   trust, rules version 9 on a save from before wave 26 (built from
   56e69f5's own index.html: tests/fixtures/make-v8-save.cjs), and the
   eight-day cut of the simulator's bands (tests/relationships-sim.cjs).
   Run with: node tests/run.cjs wave30 */
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { suite, quickStart, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');
const { makeV8Save } = require('./fixtures/make-v8-save.cjs');
const sim = require('./relationships-sim.cjs');

const s = suite('wave30-rel-people');
const quiets = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-quiet')].map(n => n.textContent));
// Where people stand, made outright (relSet lands each track exactly, in fix).
const setTracks = (page, id, t) => page.evaluate(([id, t]) => Game.State.apply({ relSet: Object.assign({ npcId: id }, t) }).rejected.map(x => x.reason), [id, t]);
const put = (page, loc, ids, day, phase) => page.evaluate(([loc, ids, day, phase]) => {
  const S = Game.State;
  if (day) S.apply({ setTime: { day, phase: phase || 'afternoon' } });
  S.apply({ playerLocationId: loc });
  if (ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: loc })) });
  const others = S.npcsAt(loc).map(n => n.id).filter(id => !ids.includes(id));
  if (others.length) S.apply({ visits: others.map(id => ({ npcId: id, locationId: 'loc_front_street' })) });
}, [loc, ids, day || null, phase || null]);

s.test('People: the stance and one tag on the row, two dated reasons and the leverage lines on the card, five words behind More that fit a 375-pixel phone, and nothing about wanting for a minor', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page, { kinds: [] });
  await put(page, 'loc_byrds_pawn', ['npc_hollis', 'npc_wade'], 2, 'afternoon');
  const setup = await page.evaluate(() => {
    const G = Game, S = G.State;
    G.Api.Mock.delay = 0;
    S.apply({ npcKnownToPlayer: ['npc_hollis', 'npc_wade', 'npc_kaylee', 'npc_shayla'] });
    // Hollis: an insult made good, then what the player knows about him.
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_hollis', event: 'insulted', text: 'called me a cheat in my own shop' }] });
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_hollis', event: 'apologised', text: 'called me a cheat in my own shop' }] });
    S.apply({ secretShown: { npcId: 'npc_hollis', how: 'roll' } });
    S.apply({ leverageAdd: { holder: 'player', over: 'npc_hollis', about: { kind: 'secret' }, text: "runs the landing's cash through his pawn books", weight: 3, mattersTo: ['npc_marcus'], aware: true } });
    // Wade: a report that came to him through a tie nobody knows (a hidden protector).
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_wade', event: 'crossed', text: 'Hollis Byrd says Tester has been leaning on him', secondhand: { via: 'npc_hollis', hidden: true } }] });
    // A line planted off-screen and not seen yet (seen false) stays off the card until they meet again.
    const k = S.npc('npc_kaylee');
    S.apply({ setMemories: [{ npcId: 'npc_kaylee', memories: [{ turn: G.state.meta.turn, day: 2, text: 'Tester kept my brother out of trouble', weight: 2, event: 'did_favour', d: { w: 8, t: 5, f: 0, k: 3, s: 0 }, decay: 'wound', key: 'k1', seen: false }] }] });
    // Shayla: an adult on the romance list, with a status.
    S.apply({ relSet: { npcId: 'npc_shayla', s: 25, k: 10 } });
    return { kaylee: k.name, minor: G.Rel.isMinor(k), shayla: G.Rel.sparkStatus(S.npc('npc_shayla')) };
  });
  assert.equal(setup.minor, true);
  assert.equal(setup.shayla, 'has noticed you');
  await page.evaluate(() => { Game.UI.openPanel('people'); Game.UI.togglePerson('npc_hollis'); });
  const card = id => page.evaluate(id => {
    const c = document.querySelector(`#panel-body .pcard[data-npc="${id}"]`);
    if (!c) return null;
    const chip = c.querySelector('.pcard-head .stance');
    return {
      row: chip ? { phrase: chip.querySelector('.stance-phrase').textContent, tags: [...chip.querySelectorAll('.stance-tag')].map(x => x.textContent), side: chip.dataset.side } : null,
      open: c.querySelector('.pcard-stance') ? { tags: [...c.querySelectorAll('.pcard-stance .stance-tag')].map(x => x.textContent), why: [...c.querySelectorAll('.pcard-stance > div .pcard-why li')].map(li => ({ text: li.firstChild.textContent, meta: (li.querySelector('.meta') || {}).textContent || null, kind: li.dataset.kind })),
        lev: [...c.querySelectorAll('.pcard-lev li')].map(li => li.textContent), sr: c.querySelector('.pcard-stance .visually-hidden').textContent, hidden: c.querySelector('.pcard-stance > div').getAttribute('aria-hidden') } : null,
      words: [...c.querySelectorAll('.pcard-word')].map(w => [w.querySelector('dt').textContent, w.querySelector('dd').textContent]),
      fold: !!c.querySelector('details.pcard-words-fold'), foldOpen: !!(c.querySelector('details.pcard-words-fold') || {}).open,
      text: c.textContent
    };
  }, id);
  const hollis = await card('npc_hollis');
  const st = await page.evaluate(() => { const x = Game.Rel.stance(Game.State.npc('npc_hollis')); return { phrase: x.phrase, tags: x.tags, side: x.side, day: Game.state.time.day }; });
  // The row: the phrase and one tag, in its side's tint.
  assert.deepEqual(hollis.row, { phrase: st.phrase.charAt(0).toUpperCase() + st.phrase.slice(1), tags: st.tags.slice(0, 1), side: st.side });
  assert.ok(st.tags.includes('you have something on them'), JSON.stringify(st.tags));
  // The open card: up to two tags, two dated reasons (what the player knows leads; the insult made good says how), read as one sentence.
  assert.deepEqual(hollis.open.tags, st.tags.slice(0, 2));
  assert.equal(hollis.open.why.length, 2);
  assert.deepEqual(hollis.open.why[0], { text: "You know: runs the landing's cash through his pawn books.", meta: `Day ${st.day}`, kind: 'leverage' });
  assert.deepEqual(hollis.open.why[1], { text: 'You called him a cheat in his own shop.', meta: `Day ${st.day} · you apologised`, kind: 'memory' });
  assert.equal(hollis.open.hidden, 'true', 'the visible block is for the eye; a screen reader hears the sentence');
  assert.ok(hollis.open.sr.startsWith(`${st.phrase.charAt(0).toUpperCase() + st.phrase.slice(1)}, ${st.tags.slice(0, 2).join(', ')}. You know:`), hollis.open.sr);
  assert.ok(hollis.open.sr.includes(`You called him a cheat in his own shop. Day ${st.day} · you apologised.`), hollis.open.sr);
  /* More: closed until tapped; then the words, two columns at 375.
     Changed by design in wave 35 (the owner: "the more detailed the
     better"): all seven for an adult whatever their values, Hollis (spark
     and romance 0) too. */
  assert.equal(hollis.fold, true);
  assert.equal(hollis.foldOpen, false);
  await page.click('#panel-body .pcard[data-npc="npc_hollis"] .pcard-words-fold > summary');
  const words = (await card('npc_hollis')).words;
  assert.deepEqual(words.map(w => w[0]), ['Likes you', 'Trusts you', 'Scared', 'Knows you', 'Spark', 'Romance', 'Owes']);
  assert.deepEqual(words.slice(4).map(w => w[1]), ['no', 'no', 'even'], 'nothing wanted, nothing felt, nothing owed');
  const tr = await page.evaluate(() => Game.Rel.tracksOf(Game.State.npc('npc_hollis')));
  assert.equal(words[2][1], tr.f >= 40 ? 'yes' : tr.f >= 20 ? 'a little' : 'no', 'scared, in words');
  const grid = await page.evaluate(() => [...document.querySelectorAll('#panel-body .pcard[data-npc="npc_hollis"] .pcard-word')].map(w => { const r = w.getBoundingClientRect(); const dt = w.querySelector('dt').getBoundingClientRect(); const dd = w.querySelector('dd').getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), below: dd.top >= dt.bottom - 1 }; }));
  assert.equal(grid[0].top, grid[1].top, 'two columns');
  assert.ok(grid[1].left > grid[0].left);
  assert.ok(grid.every(g => g.width >= 100 && g.width <= 200 && g.below), 'about 159px a column, each label above its word: ' + JSON.stringify(grid));
  assert.deepEqual(await overflowReport(page, 375), [], 'no horizontal scroll at 375');
  // A report through a hidden tie: the card gives only the day, never the tie or the cause.
  await page.evaluate(() => Game.UI.togglePerson('npc_wade'));
  const wade = await card('npc_wade');
  assert.ok(wade.open.why.some(x => x.text === `Cooler since Day ${st.day}. Hasn't said why.` && x.kind === 'hidden'), JSON.stringify(wade.open.why));
  assert.ok(!/Hollis|leaning/.test(wade.open.why.map(x => x.text).join(' ') + wade.open.sr), 'no name and no cause');
  // A minor: no Interested, no spark tag, nothing about wanting; the line planted off-screen stays back until they meet.
  await page.evaluate(() => Game.UI.togglePerson('npc_kaylee'));
  let kay = await card('npc_kaylee');
  assert.ok(kay, 'Kaylee has a card');
  await page.click('#panel-body .pcard[data-npc="npc_kaylee"] .pcard-words-fold > summary');
  kay = await card('npc_kaylee');
  // Wave 35: the five that apply (favours owed are not romance); never Spark or Romance for anyone under 18.
  assert.deepEqual(kay.words.map(w => w[0]), ['Likes you', 'Trusts you', 'Scared', 'Knows you', 'Owes'], 'never Spark or Romance for anyone under 18');
  assert.ok(!/interested|sweet on you|looks at you twice|wants you|using you|falling for you|open to a flirt/i.test(kay.text), kay.text);
  assert.ok(!/kept my brother|kept (her|your) brother/.test(kay.text), 'not seen yet: kept back');
  // She is at school until evening; then she comes by and the player sees her.
  await page.evaluate(() => { const S = Game.State; S.apply({ setTime: { day: Game.state.time.day, phase: 'evening' } }); S.apply({ visits: [{ npcId: 'npc_kaylee', locationId: Game.state.player.locationId }] }); S.apply({ beginTurn: true }); S.apply({ logEntry: { input: 'I nod to Kaylee', roll: null, narration: 'Kaylee nods back.' } }); Game.UI.renderPanel(); });
  kay = await card('npc_kaylee');
  assert.ok(/kept (her|your) brother out of trouble/.test(kay.text), 'seen since: shown ' + kay.text);
  // An eligible adult with a status: Spark says it (wave 35: Spark and Romance, its own word); with the player under 18, never.
  await page.evaluate(() => Game.UI.togglePerson('npc_shayla'));
  await page.click('#panel-body .pcard[data-npc="npc_shayla"] .pcard-words-fold > summary');
  let shay = await card('npc_shayla');
  assert.deepEqual(shay.words.map(w => w[0]), ['Likes you', 'Trusts you', 'Scared', 'Knows you', 'Spark', 'Romance', 'Owes']);
  assert.equal(shay.words[4][1], 'a little');
  assert.deepEqual(shay.row.tags, ['has noticed you']);
  await page.evaluate(() => { Game.state.player.age = 16; Game.State.apply({ relDay: Game.state.time.day }); Game.UI.renderPanel(); });
  shay = await card('npc_shayla');
  assert.ok(!shay.words.some(w => w[0] === 'Spark' || w[0] === 'Romance') && !shay.row.tags.includes('has noticed you'), 'a player under 18: nothing about wanting');
  assert.deepEqual(shay.words.map(w => w[0]), ['Likes you', 'Trusts you', 'Scared', 'Knows you', 'Owes'], 'the five that apply');
  assert.deepEqual(await overflowReport(page, 375), [], 'still no horizontal scroll');
});

s.test('Edit: seven sliders (wave 35: Spark and Romance for every adult, Owes you for everyone), land exactly; removing a memory keeps the numbers; every memory field survives a save', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await put(page, 'loc_riverbend', ['npc_shayla'], 2, 'morning');
  await page.evaluate(() => Game.State.apply({ npcKnownToPlayer: ['npc_shayla', 'npc_kaylee', 'npc_royce', 'npc_hollis'] }));
  const f = (id, k) => `#pe-${k}-${id}`;
  const slide = (id, k, v) => page.evaluate(([sel, v]) => { const r = document.querySelector(sel); r.value = String(v); r.dispatchEvent(new Event('input', { bubbles: true })); }, [f(id, k), v]);
  // Shayla: an eligible adult, every slider (wave 35: seven, in this order).
  await page.evaluate(() => { Game.UI.openPanel('people'); Game.UI.editPerson('npc_shayla'); });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#panel-body .pedit-feel-row')].map(r => r.querySelector('label').textContent)), ['Likes', 'Trusts', 'Scared', 'Knows', 'Spark', 'Romance', 'Owes you']);
  for (const [k, v] of [['attitude', 40], ['trust', 30], ['fear', 10], ['knows', 50], ['spark', 35], ['romance', 25], ['owed', 1]]) await slide('npc_shayla', k, v);
  assert.equal(await page.textContent(f('npc_shayla', 'romance-word')), '25 · a little');
  assert.equal(await page.textContent(f('npc_shayla', 'owed-word')), '+1 · owes you one');
  assert.equal(await page.textContent(f('npc_shayla', 'attitude-word')), '+40 · a lot');
  assert.equal(await page.getAttribute(f('npc_shayla', 'attitude'), 'aria-valuetext'), '+40 · a lot');
  assert.equal(await page.textContent(f('npc_shayla', 'trust-word')), '+30 · yes');
  assert.equal(await page.textContent(f('npc_shayla', 'fear-word')), '10 · no');
  assert.equal(await page.textContent(f('npc_shayla', 'knows-word')), '50 · well');
  assert.equal(await page.textContent('#panel-body .pedit-feel legend'), 'How they feel about you');
  await page.click('#panel-body .pcard[data-npc="npc_shayla"] .pedit-save');
  const shay = await page.evaluate(() => ({ t: Game.Rel.tracksOf(Game.State.npc('npc_shayla')), fix: Game.State.npc('npc_shayla').rel.fix }));
  assert.deepEqual([shay.t.w, shay.t.t, shay.t.f, shay.t.k, shay.t.s, shay.t.m, shay.t.owed], [40, 30, 10, 50, 35, 25, 1], 'each lands exactly');
  assert.ok(shay.fix.t !== 0 && shay.fix.k !== 0 && shay.fix.m === 25, 'in fix: it never drifts');
  assert.equal((await quiets(page)).pop(), 'Edited Shayla Rawls: attitude, trust, fear, knows, spark, romance, owed.');
  // Kaylee (16): Interested shown at 0 and off. Changed by design in wave 34: every adult has Interested, Royce (an adult not on the list) too, and it lands.
  await page.evaluate(() => Game.UI.editPerson('npc_kaylee'));
  assert.deepEqual(await page.evaluate(sel => { const r = document.querySelector(sel); return r ? [r.value, r.disabled] : null; }, f('npc_kaylee', 'spark')), ['0', true]);
  // Wave 35: Romance the same; Owes you open to her (favours are not romance).
  assert.deepEqual(await page.evaluate(sel => { const r = document.querySelector(sel); return r ? [r.value, r.disabled] : null; }, f('npc_kaylee', 'romance')), ['0', true]);
  assert.deepEqual(await page.evaluate(sel => { const r = document.querySelector(sel); return r ? r.disabled : null; }, f('npc_kaylee', 'owed')), false);
  await page.click('#panel-body .pcard[data-npc="npc_kaylee"] .pedit-cancel');
  await page.evaluate(() => Game.UI.editPerson('npc_royce'));
  assert.deepEqual(await page.evaluate(sel => { const r = document.querySelector(sel); return r ? [r.value, r.disabled] : null; }, f('npc_royce', 'spark')), ['0', false], 'every adult has Interested, listed or not');
  await slide('npc_royce', 'spark', 15);
  await page.click('#panel-body .pcard[data-npc="npc_royce"] .pedit-save');
  assert.equal(await page.evaluate(() => Game.Rel.tracksOf(Game.State.npc('npc_royce')).s), 15, 'and it lands');
  await page.evaluate(() => Game.State.apply({ relSet: { npcId: 'npc_royce', s: 0 } }));
  // Every memory field survives a save; removing one keeps the numbers; an added one says what it was.
  const full = await page.evaluate(() => {
    const G = Game, S = G.State;
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_royce', event: 'hit', text: 'hit me by the pumps', fight: 'f1', witnesses: 'none' }] });
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_royce', event: 'apologised', text: 'hit me by the pumps' }] });
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_royce', event: 'complimented', text: 'liked my coffee' }] });
    const n = S.npc('npc_royce');
    // The fields no writer sets together, set by hand on a copy: the save must keep every one.
    const mems = JSON.parse(JSON.stringify(n.memories));
    Object.assign(mems[0], { act: 'attack', place: 'loc_pittmans', scene: 'loc_pittmans:2:morning', about: 'npc_dewayne', leverageId: 'lev_x_1', witness: true, secondhand: { via: 'npc_darlene' }, seen: false });
    S.apply({ setMemories: [{ npcId: 'npc_royce', memories: mems }] });
    return { mems: JSON.parse(JSON.stringify(S.npc('npc_royce').memories)), tracks: G.Rel.tracksOf(S.npc('npc_royce')) };
  });
  for (const k of ['day', 'act', 'event', 'd', 'decay', 'settled', 'key', 'fight', 'witness', 'scene', 'secondhand', 'leverageId', 'about', 'seen']) assert.ok(full.mems[0][k] !== undefined, `the setup carries ${k}`);
  await page.evaluate(() => Game.UI.editPerson('npc_royce'));
  assert.equal(await page.textContent('#panel-body .pedit-mem[data-i="0"] .pedit-mem-kind'), 'hit · fades in weeks', 'what it was and how long it lasts');
  await page.fill(f('npc_royce', 'role'), 'owner of the gas station');
  await page.click('#panel-body .pcard[data-npc="npc_royce"] .pedit-save');
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify(Game.State.npc('npc_royce').memories)));
  assert.deepEqual(saved, full.mems, 'every memory field survives a save');
  // Remove the compliment: every track stays where it was.
  const before = await page.evaluate(() => Game.Rel.tracksOf(Game.State.npc('npc_royce')));
  await page.evaluate(() => Game.UI.editPerson('npc_royce'));
  await page.click('#panel-body .pedit-mem[data-i="1"] .pedit-mem-del');
  await page.click('#panel-body .pcard[data-npc="npc_royce"] .pedit-save');
  const after = await page.evaluate(() => ({ t: Game.Rel.tracksOf(Game.State.npc('npc_royce')), mems: Game.State.npc('npc_royce').memories.map(m => m.event) }));
  assert.deepEqual(after.t, before, 'removing a memory keeps the numbers');
  assert.deepEqual(after.mems, ['hit']);
  // Add: the picker; an insult lands as an event with the table's change, and the label says so.
  await page.evaluate(() => Game.UI.editPerson('npc_royce'));
  await page.click('#panel-body .pcard[data-npc="npc_royce"] .pedit-add');
  await page.fill(f('npc_royce', 'mem-1'), 'said my coffee was swill');
  await page.selectOption(f('npc_royce', 'meme-1'), 'insulted');
  await page.click('#panel-body .pcard[data-npc="npc_royce"] .pedit-save');
  const added = await page.evaluate(() => Game.State.npc('npc_royce').memories[1]);
  assert.equal(added.event, 'insulted');
  assert.deepEqual(added.d, { w: -10, t: 0, f: 0, k: 2, s: 0, m: 0 });
  assert.equal(added.decay, 'mood');
  await page.evaluate(() => Game.UI.editPerson('npc_royce'));
  assert.equal(await page.textContent('#panel-body .pedit-mem[data-i="1"] .pedit-mem-kind'), 'insulted · fades in a day or two');
  await page.click('#panel-body .pcard[data-npc="npc_royce"] .pedit-cancel');
  // What is held between them can be deleted: the record is void.
  await page.evaluate(() => { const S = Game.State; S.apply({ secretShown: { npcId: 'npc_hollis', how: 'roll' } }); S.apply({ leverageAdd: { holder: 'player', over: 'npc_hollis', about: { kind: 'secret' }, text: 'runs the landing cash through his books', weight: 3, aware: true } }); Game.UI.editPerson('npc_hollis'); });
  assert.match(await page.textContent('#panel-body .pedit-levs'), /You know: runs the landing cash through his books\. \(held\)/);
  await page.click('#panel-body .pedit-lev-del');
  await page.click('#panel-body .pcard[data-npc="npc_hollis"] .pedit-save');
  assert.equal(await page.evaluate(() => Game.state.leverage.find(x => x.over === 'npc_hollis').status), 'void');
  assert.equal((await quiets(page)).pop(), 'Edited Hollis Byrd: what is held.');
});

s.test('the feed: two lines a turn, the most important first; fading, undo and edits print nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await put(page, 'loc_low_water', ['npc_burl', 'npc_loretta', 'npc_ray'], 2, 'evening');
  await page.evaluate(() => { Game.Api.Mock.delay = 0; Game.State.apply({ npcKnownToPlayer: ['npc_burl', 'npc_loretta', 'npc_ray'] }); });
  for (const id of ['npc_burl', 'npc_loretta', 'npc_ray']) await setTracks(page, id, { w: 0, t: 0 });
  const n0 = (await quiets(page)).length;
  // One turn: Burl takes a serious harm, Loretta warms, Ray cools. Two lines, the harm first.
  await page.evaluate(() => {
    Game.Api.Mock.queue('parse', { actionType: 'talk', summary: 'Talks to the room', targets: ['npc_burl', 'npc_loretta', 'npc_ray'], needsRoll: false, timeCost: 'instant' });
    Game.Api.Mock.queue('bookkeep', { attitudeChanges: [{ npcId: 'npc_burl', delta: -10 }, { npcId: 'npc_loretta', delta: 10 }, { npcId: 'npc_ray', delta: -10 }], newMemories: [{ npcId: 'npc_burl', text: 'called me a liar in front of the whole bar', weight: 3 }] });
  });
  await sendText(page, 'I tell the room what I think of them');
  const turn = (await quiets(page)).slice(n0).filter(t => /Burl|Loretta|Ray/.test(t));
  assert.equal(turn.length, 2, 'two lines a turn: ' + JSON.stringify(turn));
  assert.equal(turn[0], "Burl Satterfield won't forget that.", 'the most important first');
  assert.ok(/^(Loretta Gaddis warms to you|Ray Dees cools toward you)\.$/.test(turn[1]), turn[1]);
  assert.ok(!turn.some(t => /^Burl Satterfield cools/.test(t)), 'one line a person');
  // Undo: the turn goes, and no line comes with it.
  const n1 = (await quiets(page)).length;
  await sendText(page, '/undo');
  assert.ok(!(await quiets(page)).slice(n1).some(t => /warms to you|cools toward you|won't forget/.test(t)), 'undo prints nothing');
  // An edit prints only its own line.
  const n2 = (await quiets(page)).length;
  await page.evaluate(() => Game.App.editPerson('npc_loretta', { attitude: 70 }));
  assert.deepEqual((await quiets(page)).slice(n2), ['Edited Loretta Gaddis: attitude.']);
  // Fading: an insult fades over the nights and Ray warms back across a band, but nothing is printed for it.
  await setTracks(page, 'npc_ray', { w: 4, t: 0 });
  await page.evaluate(() => Game.State.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_ray', event: 'insulted', text: 'said his boat was a wreck' }] }));
  const r0 = await page.evaluate(() => Game.Rel.stance(Game.State.npc('npc_ray')).grid);
  const n3 = (await quiets(page)).length;
  await put(page, 'loc_motor_court', [], null, null);
  for (let i = 0; i < 4; i++) await sendText(page, '/rest');
  const r1 = await page.evaluate(() => Game.Rel.stance(Game.State.npc('npc_ray')).grid);
  assert.notEqual(r0, r1, `the insult faded (${r0} to ${r1})`);
  assert.ok(!(await quiets(page)).slice(n3).some(t => /^Ray Dees /.test(t)), 'fading prints nothing');
});

s.test('/recap: Careful for who wants or fears the player without liking or trusting them; Owed carries silence and favours', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  await page.evaluate(() => {
    const G = Game, S = G.State;
    G.Api.Mock.delay = 0;
    const ids = ['npc_trent', 'npc_tyler', 'npc_glenda', 'npc_burl', 'npc_hollis', 'npc_mavis', 'npc_loretta'];
    S.apply({ npcKnownToPlayer: ids });
    for (const id of ids) S.npc(id).metTurn = 0;
    // Trent: fond of you, doesn't trust you. Tyler: afraid of you.
    S.apply({ relSet: [{ npcId: 'npc_trent', w: 30, t: -30 }, { npcId: 'npc_tyler', w: 0, f: 45 }] });
    // Glenda has something on the player (and the player knows).
    S.apply({ leverageAdd: { holder: 'npc_glenda', over: 'player', about: { kind: 'seen' }, text: 'saw you go through the till at the gas station', weight: 2, playerKnows: true } });
    // Burl owes the player a favour; Hollis owes $300 for the player's silence.
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_burl', event: 'did_favour', text: 'got my outboard up the ramp' }] });
    S.apply({ secretShown: { npcId: 'npc_hollis', how: 'roll' } });
    S.apply({ leverageAdd: { holder: 'player', over: 'npc_hollis', about: { kind: 'secret' }, text: 'runs the landing cash through his books', weight: 3, aware: true } });
    const rec = G.state.leverage.find(x => x.over === 'npc_hollis');
    S.apply({ effects: [{ op: 'leverageSet', id: rec.id, status: 'used', demand: { amount: 300, dueDay: 4 } }] });
    // Mavis against the player with a reason; Loretta warm with one.
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_mavis', event: 'crossed', text: 'Tester told Dewayne about the garage money', d: { w: -30, t: -20 } }] });
    S.apply({ effects: [{ op: 'socialEvent', npcId: 'npc_loretta', event: 'did_favour', text: 'covered the bar for me on a busy night', d: { w: 30, t: 10 } }] });
  });
  await sendText(page, '/recap');
  const text = await page.evaluate(() => Game.Pipeline.recapText());
  const line = k => (text.split('\n').find(l => l.startsWith(k)) || '');
  const careful = line('Careful: ');
  assert.ok(careful.includes("Trent Haskins (fond of you, doesn't trust you)"), text);
  assert.ok(careful.includes('Tyler Rasberry (afraid of you)'), text);
  assert.ok(careful.includes('Glenda Pryor (has something on you)'), text);
  assert.ok(line('Cold to you: ').includes('Mavis Mangum (against you: you told Dewayne about the garage money)'), text);
  assert.match(line('Warm to you: '), /Loretta Gaddis \((warm to you|friendly)(, [^:)]+)?: you covered the bar for her on a busy night\)/);
  const owed = line('Owed: ');
  assert.ok(owed.includes('Hollis Byrd: $300 for keeping quiet, due Day 4'), owed);
  assert.ok(owed.includes('Burl Satterfield owes you one'), owed);
  assert.ok(!/Careful: [^\n]*(Mavis|Loretta)/.test(text), 'Careful is only the mixed');
});

s.test('the narrator hears "to you" with reasons and a present-tense way to play the person, never a number, never more than 50 tokens a person; a hidden reason has no name and no cause; the cached blocks stay under 13,000', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt'] });
  await put(page, 'loc_low_water', ['npc_wade', 'npc_shayla', 'npc_kaylee', 'npc_burl', 'npc_loretta'], 2, 'evening');
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, P = G.Pipeline;
    const ids = ['npc_wade', 'npc_shayla', 'npc_kaylee', 'npc_burl', 'npc_loretta'];
    S.apply({ npcKnownToPlayer: ids });
    // Long reasons, to make the cap bite.
    S.apply({ effects: [
      { op: 'socialEvent', npcId: 'npc_burl', event: 'did_favour', text: 'carried the outboard all the way down the ramp to the river and back up again in the rain at night' },
      { op: 'socialEvent', npcId: 'npc_burl', event: 'complimented', text: 'said my boat was the finest johnboat on the whole river and meant every word of it' },
      { op: 'socialEvent', npcId: 'npc_wade', event: 'crossed', text: 'Hollis Byrd says Tester has been leaning on him', secondhand: { via: 'npc_hollis', hidden: true } },
      { op: 'socialEvent', npcId: 'npc_loretta', event: 'insulted', text: 'called my bar a dump in front of my regulars' }
    ] });
    S.apply({ relSet: { npcId: 'npc_shayla', s: 25, k: 10 } });
    const packet = P.narratorPacket({ action: { summary: 'x' } });
    const present = packet.split('\n').find(l => l.startsWith('PRESENT: '));
    const entry = id => { const n = S.npc(id); return P.npcLine(n, G.state.meta.turn); };
    const brief = P.npcLine(S.npc('npc_burl'), G.state.meta.turn, true);
    const words = t => t.split(/\s+/).filter(Boolean).length;
    const est = style => Math.round((words(G.Style.systemPrompt(style)) + words(P.townBlock()) + words(P.castBlock())) * 1.4);
    return { present, lines: Object.fromEntries(ids.map(id => [id, entry(id)])), brief, stance: G.Rel.stance(S.npc('npc_burl')).phrase, cap: P.TO_YOU_CAP, est: [est('casual'), est('literary')], note: G.Style.PEOPLE_NOTE, cas: G.Style.systemPrompt('casual'), ex: G.data.EXAMPLE_TURNS_CASUAL.map(t => t.context).concat(G.data.EXAMPLE_TURNS_LITERARY.map(t => t.context)) };
  });
  const toYou = line => { const m = /to you: (.*?)(?:; open to a flirt|; holds you to: |; secret \(|\)$)/.exec(line); return m ? 'to you: ' + m[1] : null; };
  for (const [id, line] of Object.entries(r.lines)) {
    const f = toYou(line);
    assert.ok(f, `${id}: a "to you" field: ${line}`);
    assert.ok(f.length / 3.5 <= r.cap, `${id}: ${Math.round(f.length / 3.5)} tokens: ${f}`);
    assert.ok(!/attitude -?\d|\b-?\d+ \((?:neutral|warm|cold|wary|friendly|hostile|loyal)\)/.test(line), `${id}: never a number: ${line}`);
    assert.ok(!f.includes('; '), `${id}: no "; " inside the field`);
    assert.match(f, / — plays it: [a-z]/);
    assert.ok(!/\bwill\b|\blater\b|\bmeans to\b/.test(f.split(' — plays it: ')[1]), `${id}: present demeanour only`);
  }
  assert.match(r.lines.npc_burl, /to you: [^—]+ — you carried the outboard[^—]*\(Day 2\)/, 'a reason in the player\'s words, with its day');
  // The hidden reason: no cause and no name.
  assert.match(r.lines.npc_wade, /cooler since Day 2, for a reason of his own, keeps it to himself, never hint at it/);
  assert.ok(!/Hollis|leaning/.test(toYou(r.lines.npc_wade)), r.lines.npc_wade);
  // Open to a flirt: an eligible adult a flirt is welcome with now; never anyone under 18.
  assert.ok(/; open to a flirt/.test(r.lines.npc_shayla), r.lines.npc_shayla);
  assert.ok(!/open to a flirt/.test(r.lines.npc_kaylee), r.lines.npc_kaylee);
  // Brief: the stance only.
  assert.ok(r.brief.endsWith(`; to you: ${r.stance})`), r.brief);
  // The cached blocks: the trimmed note, no numbers in the examples, under 13,000 for both styles.
  assert.ok(r.cas.includes(r.note) && r.note.includes('A reason "of their own" is never hinted at.'));
  assert.ok(r.ex.every(c => !/attitude [−-]?\d/.test(c)), 'no attitude number in either example set');
  assert.ok(r.est.every(x => x < 13000), 'cached blocks: ' + r.est.join(', '));
});

/* The council (TOWN_DATA.events, evt_council_meeting): the branch that
   holds for these tracks, with the player at Town Hall or elsewhere. */
const council = (page, at) => page.evaluate(at => {
  const ev = Game.data.TOWN_DATA.events.find(e => e.id === 'evt_council_meeting');
  const i = ev.branches.findIndex(b => Game.World.conditionsMet(b.when, at ? { playerAt: at } : { playerAway: true }));
  const b = i >= 0 ? ev.branches[i] : ev.default;
  return { i, royce: i >= 0 && !!b.when.relAtLeast && !!b.when.relAtLeast.npc_royce, tabled: b.effects.some(e => e.key === 'bridgeVoteTabled'), text: b.text };
}, at);

s.test('the council weighs trust: the confidant tables it, the drinking buddy only from the back row, the bully gets nothing', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: [] });
  // The confidant: trust 32, knows 46 (the design's example 3(a)).
  await setTracks(page, 'npc_royce', { w: 29, t: 32, k: 46, f: 0 });
  let r = await council(page, null);
  assert.ok(r.royce && r.tabled && /talk it through/.test(r.text), JSON.stringify(r));
  // The drinking buddy: warm (liking 32) with trust 5: only the friendly face, and only with the player in the room.
  await setTracks(page, 'npc_royce', { w: 32, t: 5, k: 40, f: 0 });
  r = await council(page, null);
  assert.ok(!r.royce, 'from elsewhere, no Royce branch: ' + r.text);
  r = await council(page, 'loc_town_hall');
  assert.ok(r.royce && r.tabled && /finds you in the back/.test(r.text), JSON.stringify(r));
  // The bully: afraid of the player (fear 66): no fear branch, nothing from Royce.
  await setTracks(page, 'npc_royce', { w: -14, t: -15, k: 10, f: 66 });
  for (const at of [null, 'loc_town_hall']) { r = await council(page, at); assert.ok(!r.royce, `the bully gets nothing (${at || 'away'}): ${r.text}`); }
  // Bought by Carter: second thoughts need trust 20 now, not liking.
  await page.evaluate(() => Game.State.apply({ effects: [{ op: 'setFlag', key: 'royceBought', value: true }] }));
  await setTracks(page, 'npc_royce', { w: 40, t: 5, k: 10, f: 0 });
  r = await council(page, null);
  assert.ok(!(r.royce && /second thoughts/.test(r.text)), 'warmth alone buys no second thoughts');
  await setTracks(page, 'npc_royce', { w: 20, t: 20, k: 10, f: 0 });
  r = await council(page, null);
  assert.ok(r.royce && /second thoughts/.test(r.text), JSON.stringify(r));
  // The ending: Loretta at liking 40.
  const ep = await page.evaluate(() => { const E = Game.data.TOWN_DATA.epilogue; const b = E.branches.find(x => x.when.relAtLeast && x.when.relAtLeast.npc_loretta); return b.when.relAtLeast.npc_loretta; });
  assert.deepEqual(ep, { liking: 40 });
  // The engine still reads attitudeAtLeast, as liking, for a town copy from before.
  assert.equal(await page.evaluate(() => [Game.World.conditionsMet({ attitudeAtLeast: { npc_royce: 15 } }), Game.World.conditionsMet({ attitudeAtLeast: { npc_royce: 25 } }), Game.World.conditionsMet({ relBelow: { npc_royce: { trust: 25 } } })].join()), 'true,false,true');
});

s.test('rules version 9: liking stays exactly the old attitude for everyone in an older game; the engine\'s own memories are recognised before the words ("took the phone" is never a theft by the player); anyone whose secret was open still opens it; the informant\'s hold on the player becomes a record; nothing is called', async h => {
  // A game saved by the 56e69f5 build (rules version 8), played there with the mock.
  const old = await makeV8Save();
  assert.equal(old.rules, 8);
  const page = await h.open({ viewport: LAPTOP });
  const before = await page.evaluate(env => {
    const G = Game;
    G.Api.Mock.delay = 0;
    G.App.enter(G.Storage.parseEnvelope(JSON.stringify(env)), { confirmed: true });
    const st = G.state;
    return {
      v: G.State.rulesVersion(st), att: Object.fromEntries(st.npcs.map(n => [n.id, n.attitude])),
      oldGate: st.npcs.filter(n => n.alive !== false && n.attitude >= 50).map(n => n.id), calls: G.Api.Mock.calls.length, levs: (st.leverage || []).length,
      council: G.State.town.events.find(e => e.id === 'evt_council_meeting').branches.filter(b => b.when.attitudeAtLeast).length,
      untyped: st.npcs.filter(n => n.memories.some(m => m.d === undefined)).length
    };
  }, old.env);
  assert.equal(before.v, 8);
  assert.ok(before.oldGate.length >= 1, 'someone at 50 or more: the old gate had their secret open');
  assert.ok(before.council >= 6, 'the old council read attitude');
  assert.equal(before.levs, 0, 'no records before wave 29');
  const res = await page.evaluate(() => Game.App.updateGame());
  // Wave 31: the update runs on to version 10 (the ties; tests/wave31-town-ties.test.cjs has its own checks).
  assert.deepEqual([res.ok, res.from, res.to], [true, 8, 10]);
  const after = await page.evaluate(debtor => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const informant = st.player.looseEnds.find(le => le.kind === 'secret').npcId;
    const ob = st.player.obligations.filter(o => o.npcId === informant && o.kind === 'blackmail').pop();
    return {
      att: Object.fromEntries(st.npcs.map(n => [n.id, n.attitude])), w: Object.fromEntries(st.npcs.map(n => [n.id, R.tracksOf(n).w])),
      calls: G.Api.Mock.calls.length,
      phone: S.npc(debtor).memories.filter(m => /took the phone/.test(m.text)).map(m => [m.event, m.act || null]),
      stole: st.npcs.flatMap(n => n.memories.filter(m => m.event === 'stole_from').map(m => m.text)),
      typed: st.npcs.every(n => n.memories.every(m => typeof m.event === 'string' && m.d !== undefined)),
      migrated: st.npcs.filter(n => n.alive !== false && G.presenceOf(n) !== 'dead').every(n => n.rel.migrated === 9),
      rec: st.leverage.filter(x => x.holder === informant && x.over === 'player').map(x => ({ status: x.status, about: x.about.kind, knows: x.playerKnows })),
      ob: ob ? ob.status : null,
      feed: [...document.querySelectorAll('#feed .f-notice')].pop().textContent,
      council: S.town.events.find(e => e.id === 'evt_council_meeting').branches.filter(b => b.when.relAtLeast).length,
      epilogue: S.town.epilogue.branches.some(b => b.when.relAtLeast && b.when.relAtLeast.npc_loretta),
      spark: st.npcs.every(n => R.tracksOf(n).s === 0)
    };
  }, old.debtor);
  // Liking is exactly the old attitude, for everyone.
  for (const id of Object.keys(before.att)) {
    assert.equal(after.att[id], before.att[id], `${id}: attitude unchanged`);
    assert.equal(after.w[id], before.att[id], `${id}: liking is the old attitude`);
  }
  assert.equal(after.calls, before.calls, 'nothing is called');
  // The repo man's own line, as written and as the old editor left it (no act): his broken word to collect, never the player's theft.
  assert.deepEqual(after.phone, [['broke_word', 'own'], ['broke_word', 'own']]);
  assert.ok(!after.stole.some(t => /took the phone/.test(t)), JSON.stringify(after.stole));
  assert.ok(after.typed && after.migrated, 'every memory typed, everyone at version 9');
  assert.ok(after.spark, 'spark 0 for everyone');
  // Anyone whose secret the old gate had open still opens it.
  const open = await page.evaluate(ids => ids.map(id => Game.Rel.secretOpen(Game.State.npc(id))), before.oldGate);
  assert.ok(open.every(Boolean), JSON.stringify(before.oldGate) + ' ' + JSON.stringify(open));
  // The informant's hold on the player: a record, its status read from the blackmail.
  const want = after.ob === null ? { status: 'held', knows: false } : { status: { open: 'used', met: 'paid', missed: 'spent' }[after.ob], knows: true };
  assert.deepEqual(after.rec, [{ status: want.status, about: 'loose_end', knows: want.knows }]);
  // The council still to come reads trust; the ending reads Loretta's liking.
  assert.equal(after.council, 6);
  assert.equal(after.epilogue, true);
  assert.match(after.feed, /^People now remember why: \d+ people's memories now carry what they did to how they feel\. 1 person has something on you\. The council now weighs trust\. People now feel for each other: \d+ ties between \d+ people\. What you do from now on reaches the people close to them\.$/);
  console.log('        the fixture save\'s update: ' + after.feed);
  // Version 9 again: nothing changes (everyone is at rel.migrated 9 with every line typed); /undo takes the update back, as one step.
  const once = await page.evaluate(() => JSON.stringify(Game.state));
  const again = await page.evaluate(async () => { const m = Game.Upgrade.MIGRATIONS.find(x => x.version === 9); return m.run(Game.state, Game.Api); });
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state)), once, 'a re-run of version 9 changes nothing');
  assert.equal(again.text, 'People already remember why.');
  await sendText(page, '/undo');
  assert.equal(await page.evaluate(() => Game.State.rulesVersion(Game.state)), 8, 'the update is one undo step');
  // relFill never moves liking: a person's rel that would read another number is refused.
  const refused = await page.evaluate(() => {
    const S = Game.State, n = S.npc('npc_royce');
    const rel = JSON.parse(JSON.stringify(n.rel));
    rel.fix.w = (rel.fix.w || 0) + 5;
    return S.apply({ relFill: { people: [{ npcId: 'npc_royce', rel, memories: n.memories }] } }).rejected.map(x => x.reason);
  });
  assert.match(refused[0], /never moves how much anyone likes the player/);
});

s.test('the simulator\'s bands hold for eight days: the beer-buyer never past "warm to you" and his trust still, the confidant\'s trust 30 and knows 25 by Day 6 (the staged one short), the brawler\'s Wade never afraid and hating, fights on Days 2, 4 and 6 only', async () => {
  const browser = await chromium.launch();
  try {
    const runs = [['beer', false], ['confidant', false], ['confidant', true], ['brawler', false]];
    for (const [style, staged] of runs) {
      const run = await sim.runSim(browser, style, { days: 8, staged });
      assert.deepEqual(run.errors, [], `${style}: no page errors`);
      const checks = sim.bands(style, run, staged);
      assert.ok(checks.length > 0, `${style}: bands checked`);
      for (const c of checks) assert.ok(c.ok, `${style}${staged ? ' (staged)' : ''}: ${c.what}`);
    }
  } finally {
    await browser.close();
  }
});

s.run();
