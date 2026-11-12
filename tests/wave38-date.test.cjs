'use strict';
/* Wave 38 (the owner: "all my playthrough, I don't give a shit about the
   story and only try to romance people. Need to make it more visual not
   just text. Like that poker game is amazing, I don't like that it's chat
   by chat tho"): time with someone is played at a table of its own, as a
   hand of cards is (Pipeline.date, the date table in the feed); everyone
   has a face, an eligible adult hearts and their tracks as bars; who is
   here is a strip of faces with what can be done in one tap; and a
   finished card table deals the next hand from a button, told in a line,
   with no call. Covered here: the strip and its row, the table as it opens
   and after each moment, each move by the game's own rows (ask, laugh,
   open, treat, flirt by Rel.flirtAnswer), the flirt short of their
   opensAt, ease and the cut, Leave, Stop, /undo, the record on the log
   entry and its redraw, the calls a date makes, who can never sit at it
   (anyone under 18, a player under 18, someone who dislikes the player,
   twice in a phase), the People card, Deal again and the one-tap flirt,
   and phone widths (docs/notes/ui.md and docs/notes/engine-world.md,
   Wave 38). Mock mode. Run with: node tests/run.cjs wave38 */
const assert = require('assert/strict');
const { suite, quickStart, overflowReport, presetCards, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('wave38-date');
const open = (h, viewport) => h.open({ viewport: viewport || LAPTOP, contextOptions: { reducedMotion: 'reduce' } });
const idle = page => page.waitForFunction(() => !Game.Pipeline.busy);
const BAR = 'loc_low_water';
const JODIE = 'npc_jodie';
const KID = 'npc_kaylee';

/* In the page: __put (the player at a place with these people, now), __rel
   (tracks set outright), __tr (the tracks), __calls (the mock's calls by
   method since the last clear). */
const setup = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    if (ids && ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    G.UI.renderGame();
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__rel = (id, o) => { G.State.apply({ relSet: Object.assign({ npcId: id }, o) }); G.UI.renderGame(); };
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
  window.__calls = () => { const out = { parse: 0, narrate: 0, bookkeep: 0 }; for (const c of G.Api.Mock.calls) if (out[c.method] !== undefined) out[c.method]++; return out; };
});
const start = async (h, viewport) => {
  const page = await open(h, viewport);
  await quickStart(page, { kinds: [] });
  await setup(page);
  await page.evaluate(([bar, j]) => { window.__put(bar, [j], 2, 'evening'); Game.State.apply({ npcKnownToPlayer: [j] }); window.__rel(j, { k: 35, w: 20, s: 0, m: 0, t: 10 }); Game.Api.Mock.clear(); }, [BAR, JODIE]);
  return page;
};
const beatCount = page => page.evaluate(() => document.querySelectorAll('#feed .f-date:last-of-type .date-beat').length);
const startDate = async (page, id) => {
  await page.evaluate(x => { Game.Pipeline.date(x); }, id || JODIE);
  await page.waitForSelector('#feed .f-date.open');
};
/* Press a move (its die forced when given) and wait for the table to show it, or for the date to end. */
const move = async (page, mv, d20) => {
  if (d20) await page.evaluate(x => Game.Pipeline.forceNextRoll(x), d20);
  const n = await beatCount(page);
  await page.click(`#feed .f-date.open .date-move[data-move="${mv}"]`);
  await page.waitForFunction(k => document.querySelectorAll('#feed .f-date:last-of-type .date-beat').length > k, n);
};
const tableNow = page => page.evaluate(() => {
  const t = [...document.querySelectorAll('#feed .f-date')].pop();
  if (!t) return null;
  return {
    open: t.classList.contains('open'), done: t.classList.contains('done'), npc: t.dataset.npc, head: t.querySelector('.date-head').textContent,
    name: t.querySelector('.date-name-text').textContent, hearts: t.querySelector('.hearts') ? t.querySelector('.hearts').dataset.hearts : null,
    ease: t.querySelector('.date-ease').dataset.ease, face: !!t.querySelector('.date-face svg.face'), mood: (t.querySelector('.date-face svg.face') || { dataset: {} }).dataset.mood,
    read: t.querySelector('.date-read') ? t.querySelector('.date-read').textContent : null,
    meters: [...t.querySelectorAll('.meter')].map(m => [m.dataset.track, m.querySelector('.meter-v').textContent, m.dataset.moved || null]),
    moves: [...t.querySelectorAll('.date-move')].map(b => ({ id: b.dataset.move, label: b.querySelector('.date-move-label').textContent, sub: b.querySelector('.date-move-sub') ? b.querySelector('.date-move-sub').textContent : '', off: b.disabled })),
    beats: [...t.querySelectorAll('.date-beat')].map(b => ({ move: b.dataset.move, tier: b.dataset.tier || null, ease: b.dataset.ease || null, die: b.querySelector('.date-die') ? b.querySelector('.date-die').textContent : null, text: b.querySelector('.date-beat-text').textContent })),
    moment: t.querySelector('.date-moment') ? t.querySelector('.date-moment').textContent : null,
    result: t.querySelector('.date-result') ? t.querySelector('.date-result').textContent : null, ended: t.querySelector('.date-result') ? t.querySelector('.date-result').dataset.ended : null,
    buttons: t.querySelectorAll('button').length
  };
});
const lastEntry = page => page.evaluate(() => Game.state.log[Game.state.log.length - 1]);
/* Play the open card table out: its first button (Draw, then Check or Call) until the hand is over. */
const playOut = async page => {
  for (let i = 0; i < 20; i++) {
    const btn = await page.$('#feed .f-cards.open .cards-acts button:not([disabled])');
    if (!btn) { if (!(await page.$('#feed .f-cards.open'))) break; await page.waitForTimeout(50); continue; }
    await btn.click().catch(() => {});
    await page.waitForTimeout(60);
  }
  await idle(page);
};
const notices = page => page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].map(n => n.textContent));

s.test('(a) the scene strip: a face for everyone here, hearts only for an eligible adult with any, a press opens what can be done in one tap, and Spend time opens the date table with no call', async h => {
  const page = await start(h);
  const strip = await page.evaluate(() => {
    const here = Game.State.npcsAt(Game.state.player.locationId).map(n => n.id);
    const people = [...document.querySelectorAll('#scene .scene-person')];
    return { hidden: document.querySelector('#scene').hidden, here, ids: people.map(p => p.dataset.npc), faces: people.every(p => !!p.querySelector('svg.face')), hearts: people.filter(p => p.querySelector('.hearts')).map(p => p.dataset.npc) };
  });
  assert.equal(strip.hidden, false);
  assert.deepEqual(strip.ids, strip.here, 'one face each, in the scene\'s order');
  assert.ok(strip.faces, 'every one is drawn');
  assert.deepEqual(strip.hearts, [], 'no hearts before there is anything');
  await page.evaluate(j => window.__rel(j, { s: 45 }), JODIE);
  assert.equal(await page.evaluate(j => document.querySelector(`#scene .scene-person[data-npc="${j}"] .hearts`).dataset.hearts, JODIE), '2', 'wants you: two hearts');
  await page.evaluate(j => window.__rel(j, { s: 0 }), JODIE);
  await page.click(`#scene .scene-person[data-npc="${JODIE}"]`);
  const acts = await page.evaluate(() => [...document.querySelectorAll('#scene .scene-acts .scene-act')].map(b => [b.dataset.act, b.textContent, b.disabled]));
  assert.deepEqual(acts, [['talk', 'Talk', false], ['date', 'Spend time', false], ['flirt', 'Flirt', false], ['profile', 'Profile', false]]);
  assert.equal(await page.evaluate(j => document.querySelector(`#scene .scene-person[data-npc="${j}"]`).getAttribute('aria-expanded'), JODIE), 'true');
  await page.click('#scene .scene-act[data-act="talk"]');
  assert.deepEqual(await page.evaluate(() => [Game.UI.mode, Game.UI.addressee]), ['say', JODIE], 'Talk: Say mode, to them');
  await page.evaluate(() => Game.UI.setMode('do'));
  await page.click(`#scene .scene-person[data-npc="${JODIE}"]`);
  await page.click('#scene .scene-act[data-act="date"]');
  await page.waitForSelector('#feed .f-date.open');
  const t = await tableNow(page);
  assert.equal(t.npc, JODIE);
  assert.match(t.head, /^Time with Jodie Strayhorn · the Low Water$/);
  assert.ok(t.face, 'her face is at the table');
  assert.equal(t.moment, 'Moment 1 of 4 · What do you do?');
  assert.deepEqual(t.moves.map(m => m.id), ['ask', 'laugh', 'open', 'treat', 'flirt']);
  assert.ok(t.moves.filter(m => ['ask', 'laugh', 'flirt'].includes(m.id)).every(m => /^(Wits|Charm) · \d+%$/.test(m.sub)), 'each rolled move says its stat and its chance: ' + JSON.stringify(t.moves));
  assert.deepEqual(t.meters.map(m => m[0]), ['k', 'w', 't', 's', 'm'], 'her tracks as bars');
  assert.deepEqual(await page.evaluate(() => ({ hidden: document.querySelector('#scene').hidden, status: document.querySelector('#turn-status-text').textContent, focus: document.activeElement.className, busy: Game.Pipeline.busy, kind: Game.Pipeline.handKind })),
    { hidden: true, status: 'Time together', focus: 'date-head', busy: true, kind: 'date' }, 'the strip steps aside, the status line names it, the head has the focus');
  assert.deepEqual(await page.evaluate(() => window.__calls()), { parse: 0, narrate: 0, bookkeep: 0 }, 'nothing is asked of a model to sit down');
  await page.click('#feed .f-date.open .date-leave');
  await idle(page);
});

s.test('(b) a whole date: four moments settled by the game\'s own rows with the dice shown, one narration for all of it, the record kept on the log entry and drawn again, a long spent', async h => {
  const page = await start(h);
  const before = await page.evaluate(j => ({ tr: window.__tr(j), time: Object.assign({}, Game.state.time), cash: Game.state.player.gold }), JODIE);
  await startDate(page);
  await move(page, 'ask', 20);
  let t = await tableNow(page);
  assert.deepEqual(t.beats.map(b => [b.move, b.tier, b.ease, b.die]), [['ask', 'critical', 'up', '20']]);
  assert.match(t.beats[0].text, /^Jodie tells you something she doesn't tell people\.$/);
  assert.equal(t.moment, 'Moment 2 of 4 · What do you do?');
  assert.ok(await page.evaluate(j => Game.State.npc(j).memories.some(m => m.event === 'they_confided'), JODIE), 'a critical ask: they_confided, recorded at once');
  await move(page, 'laugh', 19);
  await move(page, 'open');
  t = await tableNow(page);
  assert.equal(t.moves.find(m => m.id === 'open').off, true, 'once is enough');
  assert.equal(t.beats[2].tier, null, 'no roll to tell her something true');
  await move(page, 'treat');
  await idle(page);
  t = await tableNow(page);
  assert.equal(t.open, false);
  assert.equal(t.done, true);
  assert.equal(t.buttons, 0, 'nothing left to press');
  assert.equal(t.ended, 'done');
  assert.match(t.result, /^A good while together\. .*Likes you \+\d+.*Knows you \+\d+.* · cash \$\d+$/);
  const e = await lastEntry(page);
  assert.equal(e.input, 'You spend some time with Jodie Strayhorn.');
  assert.equal(e.roll, null);
  assert.deepEqual(e.date.beats.map(b => [b.move, b.tier]), [['ask', 'critical'], ['laugh', 'success'], ['open', null], ['treat', null]]);
  assert.equal(e.date.npcId, JODIE);
  assert.equal(e.date.spent, 8);
  assert.match(e.narration, /^You spend a while with Jodie Strayhorn at the Low Water\./);
  const after = await page.evaluate(j => ({ tr: window.__tr(j), time: Object.assign({}, Game.state.time), cash: Game.state.player.gold, mem: Game.State.npc(j).memories.map(m => m.event), calls: window.__calls() }), JODIE);
  assert.equal(after.cash, before.cash - 8, 'the treat is paid');
  for (const ev of ['they_confided', 'complimented', 'confided', 'gift']) assert.ok(after.mem.includes(ev), `${ev} is on record: ${after.mem.join(', ')}`);
  assert.ok(after.tr.w > before.tr.w && after.tr.k > before.tr.k && after.tr.t > before.tr.t, 'liking, knows and trust all grew: ' + JSON.stringify([before.tr, after.tr]));
  // The record is the table's own account: where each track stood when it opened and when it closed (the phase's time together, counted as it ends, comes after).
  for (const k of ['w', 't', 'k', 's', 'm']) {
    assert.equal(e.date.start[k], before.tr[k], `the record's start for ${k}`);
    assert.equal(e.date.gains[k], e.date.end[k] - e.date.start[k], `the record's gain for ${k} is what moved at the table`);
    assert.ok(after.tr[k] >= e.date.end[k], `${k} is not taken back afterwards`);
  }
  assert.ok(after.tr.w - before.tr.w <= 40 && after.tr.t - before.tr.t <= 45 && after.tr.s - before.tr.s <= 20 && after.tr.m - before.tr.m <= 20, 'inside the turn\'s caps (Rel.CAPS.turn)');
  assert.deepEqual(after.calls, { parse: 0, narrate: 1, bookkeep: 1 }, 'one narration for the whole date, no parser call');
  assert.notDeepEqual(after.time, before.time, 'a long has passed');
  // Drawn again from the log (a reload, an /undo of a later turn).
  await page.evaluate(() => Game.UI.rebuildFeed());
  const again = await tableNow(page);
  assert.deepEqual([again.done, again.buttons, again.beats.length, again.result], [true, 0, 4, t.result]);
  // Once a phase each.
  await page.evaluate(([bar, j]) => window.__put(bar, [j], 2, 'evening'), [BAR, JODIE]);
});

s.test('(c) the flirt is the game\'s own: not offered short of their opensAt, a critical sparks 15 x their rate, a no costs what a flirt typed costs and closes it for the date', async h => {
  const page = await start(h);
  await page.evaluate(j => window.__rel(j, { k: 0 }), JODIE);
  await startDate(page);
  let t = await tableNow(page);
  const fl = t.moves.find(m => m.id === 'flirt');
  assert.equal(fl.off, true);
  assert.match(fl.sub, /^Too soon: Jodie hardly knows you yet\.$/);
  await page.click('#feed .f-date.open .date-leave');
  await idle(page);
  assert.equal((await lastEntry(page)).date.ended, 'left');
  assert.equal((await lastEntry(page)).date.beats.length, 0);
  // Knowing her well enough, the next evening.
  await page.evaluate(([bar, j]) => { window.__put(bar, [j], 3, 'evening'); window.__rel(j, { k: 40, s: 0, w: 20 }); }, [BAR, JODIE]);
  const rate = await page.evaluate(j => Game.Rel.sparkRate(Game.State.npc(j)), JODIE);
  await startDate(page);
  t = await tableNow(page);
  assert.deepEqual([t.moves.find(m => m.id === 'flirt').label, t.moves.find(m => m.id === 'flirt').off], ['Flirt with her', false]);
  await move(page, 'flirt', 20);
  t = await tableNow(page);
  assert.deepEqual([t.beats[0].tier, t.beats[0].text], ['critical', 'Jodie leans in.']);
  assert.equal((await page.evaluate(j => window.__tr(j), JODIE)).s, Math.min(20, Math.round(15 * rate)), 'spark 15 x her rate, inside the turn\'s cap of 20');
  assert.equal(t.meters.find(m => m[0] === 's')[2], 'up', 'the Spark bar says it moved');
  const w0 = (await page.evaluate(j => window.__tr(j), JODIE)).w;
  await move(page, 'flirt', 1);
  t = await tableNow(page);
  assert.deepEqual([t.beats[1].tier, t.beats[1].ease, t.beats[1].text], ['critical_failure', 'down', "Jodie isn't having it. Awkward."]);
  assert.ok((await page.evaluate(j => window.__tr(j), JODIE)).w < w0, 'an unwelcome flirt costs liking');
  const shut = t.moves.find(m => m.id === 'flirt');
  assert.deepEqual([shut.off, shut.sub], [true, 'Not now: Jodie said no.']);
  assert.ok(await page.evaluate(j => Game.State.npc(j).memories.some(m => /made it awkward/.test(m.text)), JODIE), 'the awkward memory, as a flirt typed leaves');
  await page.click('#feed .f-date.open .date-leave');
  await idle(page);
  // The label follows the spark: a look held at 20, a kiss at 40.
  await page.evaluate(([bar, j]) => { window.__put(bar, [j], 4, 'evening'); window.__rel(j, { s: 45, w: 30 }); }, [BAR, JODIE]);
  await startDate(page);
  assert.equal((await tableNow(page)).moves.find(m => m.id === 'flirt').label, 'Kiss her');
  await move(page, 'flirt', 19);
  assert.equal((await tableNow(page)).beats[0].text, 'Jodie kisses you back.');
  await page.click('#feed .f-date.open .date-leave');
  await idle(page);
});

s.test('(d) ease: it starts from how they stand, a critical failure at a stiff table cuts it short, and the cut is told', async h => {
  const page = await start(h);
  await page.evaluate(j => window.__rel(j, { w: 0, s: 0 }), JODIE);
  await startDate(page);
  assert.equal((await tableNow(page)).ease, '1', 'liking under 10 and no spark: stiff');
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  await page.click('#feed .f-date.open .date-move[data-move="ask"]');
  await idle(page);
  const t = await tableNow(page);
  assert.deepEqual([t.open, t.ended, t.ease, t.mood], [false, 'cut', '0', 'cold']);
  assert.match(t.result, /^Cut short\./);
  const e = await lastEntry(page);
  assert.equal(e.date.ended, 'cut');
  assert.match(e.narration, /She has somewhere to be\.|Jodie has somewhere to be\./);
  assert.ok(await page.evaluate(j => Game.State.npc(j).memories.some(m => m.event === 'pried'), JODIE), 'a failed ask is prying');
  // Liked and wanted: easy from the start.
  await page.evaluate(([bar, j]) => { window.__put(bar, [j], 3, 'evening'); window.__rel(j, { w: 45, s: 25 }); }, [BAR, JODIE]);
  await startDate(page);
  assert.equal((await tableNow(page)).ease, '4');
  await page.click('#feed .f-date.open .date-leave');
  await idle(page);
});

s.test('(e) Stop leaves and keeps what happened, told plainly with no narrator call; /undo with the table open takes the whole turn back', async h => {
  const page = await start(h);
  const before = await page.evaluate(j => JSON.stringify(window.__tr(j)), JODIE);
  await startDate(page);
  await move(page, 'open');
  assert.equal(await page.evaluate(() => Game.Pipeline.abort()), true);
  await idle(page);
  const e = await lastEntry(page);
  assert.equal(e.date.ended, 'stopped');
  assert.equal(e.date.beats.length, 1);
  assert.deepEqual(await page.evaluate(() => window.__calls()), { parse: 0, narrate: 0, bookkeep: 0 }, 'Stop: no call at all');
  assert.ok((await notices(page)).some(n => /^Stopped: you leave it there\. What happened stands, told plainly above\.$/.test(n)));
  assert.notEqual(await page.evaluate(j => JSON.stringify(window.__tr(j)), JODIE), before, 'what happened stands');
  // The next evening: /undo from the middle of it.
  await page.evaluate(([bar, j]) => window.__put(bar, [j], 3, 'evening'), [BAR, JODIE]);
  const mark = await page.evaluate(j => ({ tr: JSON.stringify(window.__tr(j)), log: Game.state.log.length, cash: Game.state.player.gold }), JODIE);
  await startDate(page);
  await move(page, 'treat');
  await page.evaluate(() => Game.Commands.run('/undo'));
  await idle(page);
  assert.deepEqual(await page.evaluate(j => ({ tr: JSON.stringify(window.__tr(j)), log: Game.state.log.length, cash: Game.state.player.gold }), JODIE), mark, 'the turn is taken back whole: the tracks, the log and the cash');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-date.open').length), 0, 'the open table is gone from the feed');
});

s.test('(f) who never sits at it: anyone under 18, anyone with a player under 18, someone who dislikes the player, the same person twice in a phase', async h => {
  const page = await start(h);
  await page.evaluate(([bar, kid]) => { window.__put(bar, [kid], 2, 'evening'); Game.State.apply({ npcKnownToPlayer: [kid] }); window.__rel(kid, { k: 50, w: 50 }); }, [BAR, KID]);
  const kid = await page.evaluate(k => {
    const n = Game.State.npc(k);
    return { ok: Game.Pipeline.dateOk(n), hearts: Game.UI.heartCount(n), strip: !!document.querySelector(`#scene .scene-person[data-npc="${k}"]`), stripHearts: !!document.querySelector(`#scene .scene-person[data-npc="${k}"] .hearts`) };
  }, KID);
  assert.deepEqual([kid.ok.ok, kid.ok.hide, kid.hearts, kid.strip, kid.stripHearts], [false, true, null, true, false], 'a face in the strip, and nothing else');
  await page.click(`#scene .scene-person[data-npc="${KID}"]`);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#scene .scene-acts .scene-act')].map(b => b.dataset.act)), ['talk', 'profile'], 'no Spend time and no Flirt for anyone under 18');
  const log0 = await page.evaluate(() => Game.state.log.length);
  const r = await page.evaluate(k => Game.Pipeline.date(k), KID);
  assert.deepEqual([r.ok, r.reason], [false, 'no-date']);
  assert.equal((await page.evaluate(k => Game.Pipeline.flirt(k), KID)).ok, false, 'and no one-tap flirt');
  assert.equal(await page.evaluate(() => Game.state.log.length), log0, 'no turn was played');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-date').length), 0);
  await page.evaluate(k => { Game.UI.openPanel('people'); Game.UI.showPerson(k); }, KID);
  assert.deepEqual(await page.evaluate(k => {
    const c = document.querySelector(`.pcard[data-npc="${k}"]`);
    return { acts: [...c.querySelectorAll('.pcard-act')].map(b => b.dataset.act), meters: [...c.querySelectorAll('.meter')].map(m => m.dataset.track), hearts: !!c.querySelector('.hearts'), face: !!c.querySelector('.mono svg.face'), blush: !!c.querySelector('.mono svg.face ellipse[fill="#e2625e"]') };
  }, KID), { acts: ['talk'], meters: ['k', 'w', 't'], hearts: false, face: true, blush: false }, 'the card: Talk only, three bars (never Spark or Romance), no hearts, no blush');
  // A player under 18: nobody.
  await page.evaluate(() => { Game.state.player.age = 16; Game.UI.renderGame(); });
  assert.deepEqual(await page.evaluate(j => { const o = Game.Pipeline.dateOk(Game.State.npc(j)); return [o.ok, o.hide, Game.UI.heartCount(Game.State.npc(j))]; }, JODIE), [false, true, null]);
  await page.evaluate(() => { Game.state.player.age = 30; Game.UI.renderGame(); });
  // Disliked: a line, no turn.
  await page.evaluate(j => window.__rel(j, { w: -30 }), JODIE);
  const cold = await page.evaluate(j => Game.Pipeline.date(j), JODIE);
  assert.equal(cold.ok, false);
  assert.ok((await notices(page)).some(n => /^Jodie Strayhorn has no time for you, the way things stand\.$/.test(n)));
  assert.equal(await page.evaluate(() => Game.state.log.length), log0);
  // Twice in a phase.
  await page.evaluate(j => window.__rel(j, { w: 20 }), JODIE);
  await startDate(page);
  await page.click('#feed .f-date.open .date-leave');
  await idle(page);
  await page.evaluate(([bar, j]) => window.__put(bar, [j], 2, 'evening'), [BAR, JODIE]);
  const day = await page.evaluate(() => Game.state.time);
  const again = await page.evaluate(j => Game.Pipeline.dateOk(Game.State.npc(j)), JODIE);
  if ((await lastEntry(page)).phase === day.phase && (await lastEntry(page)).day === day.day) assert.deepEqual([again.ok, again.why], [false, 'You have just spent time with Jodie Strayhorn. Give it a while.']);
});

s.test('(g) the People card: a face over the initials, hearts by the stance, the tracks as bars with their ticks, and Spend time, Flirt and Talk for someone here', async h => {
  const page = await start(h);
  await page.evaluate(j => { window.__rel(j, { s: 45, m: 35 }); Game.UI.openPanel('people'); Game.UI.showPerson(j); }, JODIE);
  const c = await page.evaluate(j => {
    const card = document.querySelector(`.pcard[data-npc="${j}"]`);
    const mono = card.querySelector('.mono');
    return { text: mono.textContent, face: !!mono.querySelector('svg.face'), hearts: card.querySelector('.pcard-meta .hearts').dataset.hearts, label: card.querySelector('.pcard-meta .hearts').getAttribute('aria-label'),
      meters: [...card.querySelectorAll('.pcard-meters .meter')].map(m => [m.dataset.track, m.getAttribute('aria-label'), m.querySelectorAll('.meter-tick').length]),
      acts: [...card.querySelectorAll('.pcard-act')].map(b => [b.dataset.act, b.disabled]) };
  }, JODIE);
  assert.equal(c.text, 'JS', 'the initials stay for a reader');
  assert.ok(c.face);
  assert.deepEqual([c.hearts, c.label], ['3', '3 of 4 hearts'], 'sweet on you: three hearts');
  assert.deepEqual(c.meters.map(m => m[0]), ['k', 'w', 't', 's', 'm']);
  assert.equal(c.meters.find(m => m[0] === 's')[1], 'Spark 45 of 100');
  assert.ok(c.meters.find(m => m[0] === 's')[2] >= 2 && c.meters.find(m => m[0] === 'm')[2] >= 2, 'the steps are ticked on the bars');
  assert.deepEqual(c.acts, [['date', false], ['flirt', false], ['talk', false]]);
  // A face is the same every time, and follows the look's words.
  const faces = await page.evaluate(() => {
    const out = {};
    for (const n of Game.state.npcs) { const a = Game.UI.faceTraits(n); const b = Game.UI.faceTraits(n); if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('not the same twice: ' + n.id); out[n.id] = a; Game.UI.faceNode(n); }
    return { n: Object.keys(out).length, royce: out.npc_royce, loretta: out.npc_loretta, dewayne: out.npc_dewayne };
  });
  assert.ok(faces.n > 20, 'everyone in town can be drawn');
  assert.equal(faces.royce.hat, true, 'Royce Pittman: a feed-store cap');
  assert.equal(faces.loretta.glasses, true, 'Loretta Gaddis: reading glasses');
  assert.equal(faces.dewayne.style, 'bald', 'Dewayne Mangum: a bald head');
});

s.test('(h) Deal again: the newest finished card table deals the next hand from a button, told in a line with no call; a turn later it is gone', async h => {
  const page = await open(h);
  await quickStart(page, { kinds: [] });
  await setup(page);
  await presetCards(page, { game: 'draw', seats: [] });
  const dealer = await page.evaluate(bar => {
    const S = Game.State;
    S.apply({ setTime: { day: 2, phase: 'evening' }, playerLocationId: bar });
    Game.UI.renderGame();
    const d = Game.Pipeline.dealerOf(S.npcsAt(bar).map(n => n.id));
    return d ? d.id : null;
  }, BAR);
  assert.ok(dealer, 'someone deals at the Low Water in the evening');
  await page.click(`#scene .scene-person[data-npc="${dealer}"]`);
  assert.ok(await page.$('#scene .scene-act[data-act="cards"]'), 'the dealer\'s row has Play cards');
  await page.click('#scene .scene-act[data-act="cards"]');
  await page.waitForSelector('#feed .f-cards.open');
  await playOut(page);
  const first = await page.evaluate(() => ({ again: (document.querySelector('#feed-after .cards-deal-again') || {}).textContent || null, count: document.querySelectorAll('#feed-after .cards-deal-again').length, calls: window.__calls(), log: Game.state.log.length }));
  assert.match(String(first.again), /^Deal again \(\$\d+\)$/);
  assert.equal(first.count, 1);
  assert.equal(first.calls.parse, 0, 'sitting in from the strip asks no parser');
  await page.evaluate(() => Game.Api.Mock.clear());
  await page.click('#feed-after .cards-deal-again');
  await page.waitForSelector('#feed .f-cards.open');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed-after .cards-deal-again').length), 0, 'no Deal again while a hand is open');
  await playOut(page);
  const second = await page.evaluate(() => ({ calls: window.__calls(), e: Game.state.log[Game.state.log.length - 1], log: Game.state.log.length, count: document.querySelectorAll('#feed-after .cards-deal-again').length, tables: document.querySelectorAll('#feed .f-cards').length }));
  assert.deepEqual(second.calls, { parse: 0, narrate: 0, bookkeep: 0 }, 'the next hand makes no call at all');
  assert.equal(second.log, first.log + 1, 'it is a turn of its own');
  assert.equal(second.e.input, 'Another hand.');
  assert.equal(second.e.cards.plain, true);
  assert.ok(second.e.narration.length > 10, 'told in the engine\'s own line: ' + second.e.narration);
  assert.deepEqual([second.count, second.tables], [1, 2], 'one Deal again, after the story');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed .f-cards button').length), 0, 'the finished tables keep nothing to press');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#feed .f-notice')].map(n => n.textContent)), [], 'and no notice about the narrator');
  // Another turn, and it is gone.
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  await idle(page);
  assert.equal(await page.evaluate(() => document.querySelectorAll('#feed-after .cards-deal-again').length), 0);
});

s.test('(i) the one-tap flirt is a flirt typed without the typing: no parser call, the charm roll at their difficulty, the engine\'s answer and record', async h => {
  const page = await start(h);
  await page.evaluate(j => { window.__rel(j, { k: 40 }); Game.Pipeline.hooks.nextTier = 'success'; }, JODIE);
  const s0 = (await page.evaluate(j => window.__tr(j), JODIE)).s;
  await page.click(`#scene .scene-person[data-npc="${JODIE}"]`);
  await page.click('#scene .scene-act[data-act="flirt"]');
  await idle(page);
  const e = await lastEntry(page);
  assert.equal(e.input, 'You flirt with Jodie Strayhorn.');
  assert.match(e.roll.line, /^Charm .* · Success$/);
  assert.equal((await page.evaluate(() => window.__calls())).parse, 0);
  assert.ok((await page.evaluate(j => window.__tr(j), JODIE)).s > s0, 'a welcome flirt sparks');
  assert.ok(await page.evaluate(j => Game.State.npc(j).memories.some(m => m.event === 'flirted'), JODIE));
});

for (const [name, vp] of [['375', PHONE], ['320', { width: 320, height: 568 }]]) {
  s.test(`(j) a phone at ${name}: the strip scrolls sideways inside itself, the open table and the finished one fit with no sideways scroll, and the moves stay in view after a press`, async h => {
    const page = await start(h, vp);
    assert.deepEqual(await overflowReport(page, vp.width), [], 'the strip');
    await page.click(`#scene .scene-person[data-npc="${JODIE}"]`);
    assert.deepEqual(await overflowReport(page, vp.width), [], 'the strip with its row open');
    await page.click('#scene .scene-act[data-act="date"]');
    await page.waitForSelector('#feed .f-date.open');
    assert.deepEqual(await overflowReport(page, vp.width), [], 'the open table');
    await move(page, 'ask', 15);
    await move(page, 'laugh', 15);
    const fit = await page.evaluate(() => {
      const f = document.querySelector('#feed-scroll').getBoundingClientRect();
      return [...document.querySelectorAll('#feed .f-date.open .date-move, #feed .f-date.open .date-leave')].map(b => { const r = b.getBoundingClientRect(); return r.top >= f.top - 1 && r.bottom <= f.bottom + 1 && r.height >= 32; });
    });
    assert.ok(fit.length === 6 && fit.every(Boolean), 'every move and Leave is on screen after a press: ' + JSON.stringify(fit));
    assert.equal(await page.evaluate(() => document.querySelector('#new-btn').hidden), true, 'no "New" pill over the moves');
    assert.deepEqual(await overflowReport(page, vp.width), [], 'two moments in');
    await page.click('#feed .f-date.open .date-leave');
    await idle(page);
    assert.deepEqual(await overflowReport(page, vp.width), [], 'the finished table');
  });
}

s.run();
