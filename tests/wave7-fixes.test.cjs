'use strict';
/* Wave 7 engine fix (docs/notes/engine-state.md, "Wave 7"): a thread a town
   event the player did not witness changes (the day-6 council meeting
   settling the police vote and moving the bridge vote) keeps the status,
   summary and knownness the player is shown until the news reaches them,
   with its Resolved line: the Journal, the recap and the narrator's OPEN
   line wait too. Mock mode throughout.
   Run with: node tests/run.cjs wave7 */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave7-fixes');
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; });

/* In the page: the two vote threads made known, the clock at Day 6's
   afternoon at Pittman's (away from Town Hall), and one search that runs
   into the evening, so the council meets while the player is elsewhere.
   Returns the summaries the player had before. */
async function councilUnseen(page) {
  return page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock;
    S.apply({ setTime: { day: 6, phase: 'afternoon', shorts: 2, late: false }, playerLocationId: 'loc_pittmans' });
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }, { threadId: 'thr_bridge_vote', knownToPlayer: true }] });
    const old = { police: S.thread('thr_police_vote').summary, bridge: S.thread('thr_bridge_vote').summary, title: S.thread('thr_police_vote').title, threads: JSON.stringify(G.state.threads) };
    M.queue('parse', { actionType: 'search', summary: 'Looks through the shelves', targets: [], needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I look through the shelves for a while');
    return old;
  });
}
/* What the player is shown of the two vote threads: the Journal's Threads
   rows, the recap's Open line, the narrator's OPEN line (Pipeline.openLine)
   and the thread records. */
function shown(page) {
  return page.evaluate(() => {
    const G = Game, S = G.State;
    G.UI.openPanel('journal');
    const row = id => {
      const li = document.querySelector(`#panel-body [data-section="threads"] li[data-thread="${id}"]`);
      return li ? { status: li.dataset.status, text: li.textContent } : null;
    };
    const rec = id => { const t = S.thread(id); return { status: t.status, summary: t.summary, known: t.knownToPlayer, pending: t.pending ? JSON.parse(JSON.stringify(t.pending)) : null, held: t.rewardHeld || null, now: S.threadNow(t, 'status') }; };
    return {
      journal: { police: row('thr_police_vote'), bridge: row('thr_bridge_vote') },
      recap: (G.Pipeline.recapText().split('\n').find(l => /^Open: /.test(l)) || ''),
      open: G.Pipeline.openLine(G.state) || '',
      police: rec('thr_police_vote'), bridge: rec('thr_bridge_vote'),
      phase: G.state.time.phase, day: G.state.time.day
    };
  });
}
const firstWords = (text, n) => text.split(/\s+/).slice(0, n || 8).join(' ');
const feedSince = page => page.evaluate(() => [...document.querySelectorAll('#feed > *')].filter(x => x.dataset.w7 !== '1').map(x => [x.className, x.textContent]));
const markFeed = page => page.evaluate(() => { for (const x of document.querySelectorAll('#feed > *')) x.dataset.w7 = '1'; });
const settle = page => page.evaluate(async () => { await Game.Pipeline.whenIdle(); await new Promise(res => setTimeout(res, 150)); await Game.Pipeline.whenIdle(); });

s.test('held: the council settles the police vote while the player is elsewhere; the Journal, the recap and OPEN keep "open" and the old summary until the morning\'s news, then change with its Resolved line', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const old = await councilUnseen(page);
  const eve = await shown(page);
  assert.equal(eve.phase, 'evening');
  // The records: what the player is shown is as it was; the council's result waits in pending, with its reward.
  assert.equal(eve.police.status, 'open');
  assert.equal(eve.police.summary, old.police);
  assert.equal(eve.police.now, 'resolved', 'the council settled it');
  assert.equal(eve.police.held, 'evt_council_meeting');
  assert.equal(eve.police.pending.length, 1);
  assert.equal(eve.police.pending[0].news, 'evt_council_meeting');
  assert.equal(eve.police.pending[0].status, 'resolved');
  assert.ok(eve.police.pending[0].summary && eve.police.pending[0].summary !== old.police);
  assert.equal(eve.bridge.summary, old.bridge, 'the bridge vote\'s new summary waits too');
  assert.deepEqual(eve.bridge.pending.map(x => [x.news, typeof x.summary, x.status]), [['evt_council_meeting', 'string', undefined]]);
  assert.equal(eve.bridge.held, null, 'nothing resolved there: no reward');
  // The Journal.
  assert.equal(eve.journal.police.status, 'open');
  assert.ok(eve.journal.police.text.includes(firstWords(old.police)), eve.journal.police.text);
  assert.ok(!eve.journal.police.text.includes(firstWords(eve.police.pending[0].summary)), eve.journal.police.text);
  assert.ok(eve.journal.bridge.text.includes(firstWords(old.bridge)), eve.journal.bridge.text);
  // The recap and the narrator's OPEN line.
  assert.ok(eve.recap.includes(`${old.title} (${firstWords(old.police)}`), eve.recap);
  assert.ok(eve.open.includes(`${old.title}: ${firstWords(old.police)}`), eve.open);
  assert.ok(!eve.open.includes(firstWords(eve.police.pending[0].summary)), eve.open);
  // A turn in the evening: the narrator's packet has the vote still open, as the player knows it.
  const packet = await page.evaluate(async () => {
    const M = Game.Api.Mock;
    M.queue('parse', { actionType: 'look', summary: 'Looks around', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await Game.Pipeline.submit('I look around');
    return (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
  });
  const openLine = (/^OPEN: .*$/m.exec(packet) || [''])[0];
  assert.ok(openLine.includes(`${old.title}: ${firstWords(old.police)}`), openLine);
  const still = await page.evaluate(() => [Game.State.thread('thr_police_vote').status, Game.State.thread('thr_police_vote').pending.length]);
  assert.deepEqual(still, ['open', 1], 'a turn that tells nothing of it changes nothing');

  // The night, then the morning's news: the thread changes with its Resolved line, after "Overnight in town".
  await markFeed(page);
  await page.evaluate(() => Game.Pipeline.rest());
  const feed = await feedSince(page);
  const morn = await shown(page);
  assert.equal(morn.phase, 'morning');
  assert.equal(morn.police.status, 'resolved');
  assert.equal(morn.police.summary, eve.police.pending[0].summary);
  assert.equal(morn.police.pending, null);
  assert.equal(morn.police.held, null);
  assert.equal(morn.bridge.summary, eve.bridge.pending[0].summary);
  assert.equal(morn.bridge.pending, null);
  assert.equal(morn.journal.police.status, 'resolved');
  assert.ok(morn.journal.police.text.includes(firstWords(eve.police.pending[0].summary)), morn.journal.police.text);
  assert.ok(morn.journal.bridge.text.includes(firstWords(eve.bridge.pending[0].summary)), morn.journal.bridge.text);
  assert.ok(!morn.recap.includes(old.title), 'no longer open in the recap: ' + morn.recap);
  assert.ok(!morn.open.includes(old.title), 'nor in OPEN: ' + morn.open);
  const over = feed.findIndex(([, t]) => /^Overnight in town: .*council/.test(t));
  const res = feed.findIndex(([, t]) => t.startsWith(`Resolved: ${old.title}.`));
  assert.ok(over >= 0 && res > over, 'the news, then its Resolved line: ' + feed.map(x => x[1].slice(0, 50)).join(' | '));
});

s.test('not held: a walk into Town Hall as the council meets settles the thread in that turn (the Journal, the recap and its Resolved line after the narration); /cheat time onto the meeting holds it only until the meeting is narrated', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const title = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock;
    S.apply({ setTime: { day: 6, phase: 'afternoon', shorts: 2, late: false }, playerLocationId: 'loc_low_water' });
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    for (const x of document.querySelectorAll('#feed > *')) x.dataset.w7 = '1';
    M.queue('parse', { actionType: 'move', summary: 'Walks to Town Hall', targets: [], destinationId: 'loc_town_hall', needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await G.Pipeline.submit('I walk to Town Hall');
    return S.thread('thr_police_vote').title;
  });
  const feed = await feedSince(page);
  const walk = await shown(page);
  assert.equal(walk.phase, 'evening');
  assert.equal(walk.police.status, 'resolved', 'watched: settled at once');
  assert.equal(walk.police.pending, null);
  assert.equal(walk.police.held, null);
  assert.equal(walk.journal.police.status, 'resolved');
  assert.ok(!walk.recap.includes(title), walk.recap);
  const narr = feed.findIndex(([c]) => /f-narr/.test(c));
  const res = feed.findIndex(([, t]) => t.startsWith(`Resolved: ${title}.`));
  assert.ok(narr >= 0 && res > narr, 'the meeting narrated, then its Resolved line: ' + feed.map(x => x[1].slice(0, 40)).join(' | '));

  // /cheat time onto the meeting at Town Hall: its scene is the next narration; until then it is held, then it shows.
  const page2 = await h.open();
  await quickStart(page2, { kinds: [] });
  await fast(page2);
  await page2.evaluate(async () => {
    Game.State.apply({ playerLocationId: 'loc_town_hall', threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    await Game.Pipeline.submit('/cheat time evening 6');
  });
  const cheat = await shown(page2);
  assert.equal(cheat.police.status, 'open', 'not narrated yet');
  assert.equal(cheat.police.now, 'resolved');
  assert.equal(cheat.journal.police.status, 'open');
  await page2.evaluate(async () => {
    const M = Game.Api.Mock;
    M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await Game.Pipeline.submit('I look around');
  });
  const told = await shown(page2);
  assert.equal(told.police.status, 'resolved');
  assert.equal(told.police.pending, null);
  assert.equal(told.journal.police.status, 'resolved');
});

s.test('/undo: the night that told the council\'s news is taken back exactly (the held status, summary and reward again); the evening that brought the meeting too', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const old = await councilUnseen(page);
  const evening = await page.evaluate(() => JSON.stringify({ threads: Game.state.threads, player: Game.state.player, news: Game.state.news }));
  await page.evaluate(() => Game.Pipeline.rest());
  const morning = await shown(page);
  assert.equal(morning.police.status, 'resolved');
  await page.evaluate(() => Game.Pipeline.submit('/undo'));
  await settle(page);
  const undone = await page.evaluate(() => JSON.stringify({ threads: Game.state.threads, player: Game.state.player, news: Game.state.news }));
  assert.equal(undone, evening, 'exactly the evening again');
  const again = await shown(page);
  assert.equal(again.journal.police.status, 'open');
  assert.ok(again.journal.police.text.includes(firstWords(old.police)), again.journal.police.text);
  // Undo the evening too: nothing held, the summaries as they were.
  await page.evaluate(() => Game.Pipeline.submit('/undo'));
  await settle(page);
  const back = await shown(page);
  assert.equal(back.phase, 'afternoon');
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state.threads)), old.threads, 'the threads as the afternoon had them');
  assert.equal(back.police.pending, null);
  assert.equal(back.police.now, 'open');
  assert.equal(back.police.summary, old.police);
  assert.equal(back.bridge.pending, null);
  assert.equal(back.bridge.summary, old.bridge);
  // The evening and the morning again: told the same way.
  await page.evaluate(async () => {
    const M = Game.Api.Mock;
    M.queue('parse', { actionType: 'search', summary: 'Looks through the shelves', targets: [], needsRoll: false, timeCost: 'short' });
    M.queue('bookkeep', {});
    await Game.Pipeline.submit('I look through the shelves for a while');
    await Game.Pipeline.rest();
  });
  const retold = await shown(page);
  assert.equal(retold.police.status, 'resolved');
  assert.equal(retold.police.pending, null);
  assert.equal(retold.journal.police.status, 'resolved');
});

s.test('a reload keeps what is held: the thread still shows "open" after Continue, and the morning\'s news releases it with its Resolved line', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const old = await councilUnseen(page);
  await settle(page);
  const held = await page.evaluate(() => JSON.stringify(Game.state.threads));
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await fast(page);
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state.threads)), held, 'saved and loaded as it was');
  const after = await shown(page);
  assert.equal(after.police.status, 'open');
  assert.equal(after.police.now, 'resolved');
  assert.equal(after.journal.police.status, 'open');
  assert.ok(after.journal.police.text.includes(firstWords(old.police)));
  await markFeed(page);
  await page.evaluate(() => Game.Pipeline.rest());
  const feed = await feedSince(page);
  const morn = await shown(page);
  assert.equal(morn.police.status, 'resolved');
  assert.equal(morn.journal.police.status, 'resolved');
  const over = feed.findIndex(([, t]) => /^Overnight in town: .*council/.test(t));
  const res = feed.findIndex(([, t]) => t.startsWith(`Resolved: ${old.title}.`));
  assert.ok(over >= 0 && res > over, feed.map(x => x[1].slice(0, 50)).join(' | '));
  // A save whose held list is not the right shape loads without it (the thread shows what it has).
  const bad = await page.evaluate(() => {
    const st = JSON.parse(JSON.stringify(Game.state));
    const t = st.threads.find(x => x.id === 'thr_riverbend_pills');
    t.pending = [{ news: 'evt_council_meeting', status: 'closed', summary: 7 }, 'nonsense'];
    const u = st.threads.find(x => x.id === 'thr_bridge_vote');
    u.pending = { status: 'resolved' };
    Game.State.load(st, Game.State.town);
    return [Game.State.thread('thr_riverbend_pills').pending === undefined, Game.State.thread('thr_bridge_vote').pending === undefined];
  });
  assert.deepEqual(bad, [true, true]);
});

s.test('the ending\'s own: /cheat time past the council to the ending shows the council\'s result with its news; what the ending says (the summaries, a thread it makes known) waits for its narration, and /undo of that turn holds it again exactly', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await fast(page);
  const original = await page.evaluate(async () => {
    const S = Game.State;
    // The bridge report thrown out before the meeting: the council keeps the police, and the ending settles the bridge vote (its first branch).
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }], effects: [{ op: 'setFlag', key: 'bridgeReportVoid', value: true }] });
    const was = S.thread('thr_police_vote').summary;
    await Game.Pipeline.submit('/cheat time morning 21');
    return was;
  });
  const cheat = await shown(page);
  assert.deepEqual(await page.evaluate(() => Game.state.news.filter(n => n.epilogue).map(n => n.seen)), [false], 'the ending is still to be told');
  // The council's news was told at the cheat ("Meanwhile in town"): its status and summary show.
  assert.equal(cheat.police.status, 'resolved');
  assert.notEqual(cheat.police.summary, original, 'the council\'s summary, not the old one');
  assert.equal(cheat.police.held, null);
  assert.equal(cheat.police.pending.length, 1);
  assert.equal(cheat.police.pending[0].news, 'ending');
  assert.ok(cheat.police.pending[0].summary && cheat.police.pending[0].summary !== cheat.police.summary);
  assert.ok(cheat.journal.police.text.includes(firstWords(cheat.police.summary)), cheat.journal.police.text);
  // The bridge vote: the ending makes it known; not before its narration.
  assert.equal(cheat.bridge.known, false);
  assert.equal(cheat.journal.bridge, null, 'not in the Journal yet');
  assert.deepEqual(cheat.bridge.pending.map(x => [x.news, x.knownToPlayer]), [['ending', true]]);
  const ending = { bridge: cheat.bridge.pending[0], police: cheat.police.pending[0] };
  assert.equal(ending.bridge.status, 'resolved', 'the report thrown out and the police kept: the ending settles the bridge vote');
  assert.equal(cheat.bridge.held, 'ending', 'and its reward waits for the ending');
  const atCheat = await page.evaluate(() => JSON.stringify(Game.state.threads));
  await markFeed(page);
  await page.evaluate(async () => {
    const M = Game.Api.Mock;
    M.queue('parse', { actionType: 'look', summary: 'Looks', targets: [], needsRoll: false, timeCost: 'instant' });
    M.queue('bookkeep', {});
    await Game.Pipeline.submit('I look around');
  });
  await settle(page);
  const told = await shown(page);
  assert.deepEqual(await page.evaluate(() => Game.state.news.filter(n => n.epilogue).map(n => n.seen)), [true]);
  assert.equal(told.police.summary, ending.police.summary);
  assert.equal(told.police.pending, null);
  assert.equal(told.bridge.known, true);
  assert.equal(told.bridge.status, ending.bridge.status);
  assert.equal(told.bridge.summary, ending.bridge.summary);
  assert.equal(told.bridge.pending, null);
  assert.equal(told.journal.bridge.status, 'resolved');
  assert.equal(told.bridge.held, null);
  // The ending's narration, then the bridge vote's Resolved line (with the Journal's change).
  const feed = await feedSince(page);
  const narr = feed.map(([c]) => /f-narr/.test(c)).lastIndexOf(true);
  const res = feed.findIndex(([, t]) => /^Resolved: The bridge vote\./.test(t));
  assert.ok(res > narr && narr >= 0, feed.map(x => x[1].slice(0, 40)).join(' | '));
  await page.evaluate(() => Game.Pipeline.submit('/undo'));
  await settle(page);
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state.threads)), atCheat, '/undo holds the ending\'s again, exactly');
  const undone = await shown(page);
  assert.equal(undone.journal.bridge, null);
  assert.ok(undone.journal.police.text.includes(firstWords(cheat.police.summary)));
});

s.test('engine: what is held is measured as it is; a change not held is newer (a status, knownness); a held summary still shows with its news; a resolved thread never moves, held or not', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  const r = await page.evaluate(() => {
    const S = Game.State, st = Game.state;
    const t = () => S.thread('thr_police_vote');
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    const was = t().summary;
    // A held event (World's holdReward), its news not told yet.
    S.apply({ effects: [{ op: 'addNews', text: 'The council kept the police.', public: true, eventId: 'evt_test' }] });
    S.apply({ effects: [{ op: 'threadUpdate', threadId: 'thr_police_vote', status: 'resolved', summary: 'Kept.' }] }, { holdReward: 'evt_test' });
    const held = { status: t().status, summary: t().summary, now: S.threadNow(t(), 'status'), held: t().rewardHeld };
    // An effect never moves it, though the player is shown "open".
    const fx = S.apply({ effects: [{ op: 'threadStatus', threadId: 'thr_police_vote', status: 'failed' }] });
    // A bookkeeper that reads "open" and says so moves nothing; its summary is shown now, and the council's still comes with the news.
    S.apply({ threadUpdates: [{ threadId: 'thr_police_vote', status: 'open', summary: 'Chief Bell waits on the vote.' }] }, { source: 'model' });
    const book = { status: t().status, summary: t().summary, now: S.threadNow(t(), 'status'), pending: JSON.stringify(t().pending) };
    const sp = st.player.storyPoints;
    const told = S.apply({ newsSeen: { eventId: 'evt_test' } });
    const after = { status: t().status, summary: t().summary, pending: t().pending === undefined, held: t().rewardHeld === undefined, points: st.player.storyPoints - sp };
    // A thread the player was never told of is not held (nothing of it shows), though its reward still waits.
    S.apply({ effects: [{ op: 'addNews', text: 'Something at Riverbend.', public: true, eventId: 'evt_test2' }] });
    S.apply({ effects: [{ op: 'threadUpdate', threadId: 'thr_riverbend_pills', status: 'resolved', summary: 'Done.' }] }, { holdReward: 'evt_test2' });
    const hidden = { status: S.thread('thr_riverbend_pills').status, pending: S.thread('thr_riverbend_pills').pending === undefined, held: S.thread('thr_riverbend_pills').rewardHeld };
    // A rumour that makes a thread known while the event's knownness is held: shown now, nothing of it held.
    S.apply({ effects: [{ op: 'addNews', text: 'The bridge.', public: true, eventId: 'evt_test3' }] });
    S.apply({ effects: [{ op: 'threadUpdate', threadId: 'thr_bridge_vote', knownToPlayer: true, summary: 'Tabled.' }] }, { holdReward: 'evt_test3' });
    const bridgeHeld = JSON.stringify(S.thread('thr_bridge_vote').pending);
    S.apply({ threadUpdates: [{ threadId: 'thr_bridge_vote', knownToPlayer: true }] });
    const bridge = { known: S.thread('thr_bridge_vote').knownToPlayer, pending: JSON.stringify(S.thread('thr_bridge_vote').pending) };
    return { was, held, fx: fx.applied.join(' | '), book, told: told.applied.join(' | '), after, hidden, bridgeHeld, bridge };
  });
  assert.deepEqual(r.held, { status: 'open', summary: r.was, now: 'resolved', held: 'evt_test' });
  assert.match(r.fx, /no-op: thr_police_vote is resolved/);
  assert.equal(r.book.status, 'open');
  assert.equal(r.book.now, 'resolved', 'the bookkeeper\'s "open" moved nothing held');
  assert.equal(r.book.summary, 'Chief Bell waits on the vote.');
  assert.equal(r.book.pending, JSON.stringify([{ news: 'evt_test', status: 'resolved', summary: 'Kept.' }]));
  assert.match(r.told, /thr_police_vote: the news of evt_test is told \(status resolved, summary shown\) \(\+1 story point\)/);
  assert.deepEqual(r.after, { status: 'resolved', summary: 'Kept.', pending: true, held: true, points: 1 });
  assert.deepEqual(r.hidden, { status: 'resolved', pending: true, held: 'evt_test2' });
  assert.equal(r.bridgeHeld, JSON.stringify([{ news: 'evt_test3', knownToPlayer: true, summary: 'Tabled.' }]));
  assert.deepEqual(r.bridge, { known: true, pending: JSON.stringify([{ news: 'evt_test3', summary: 'Tabled.' }]) });
});

s.run();
