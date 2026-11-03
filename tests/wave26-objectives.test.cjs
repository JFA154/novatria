'use strict';
/* Wave 26 (1 Nov 2026): Objectives. The owner: "It will be good to have a
   side panel with something like 'Objectives' to track what people asked me
   to do, by when, and details about the objectives (that I know of)." Their
   chronicle: Carter Sturdivant offered $500 cash for copies of the station's
   debts from Darlene Pittman's back office before the council vote; Travis
   Cagle asked them to say nothing about his parked cruiser and to report
   Boyd's questions. The bookkeeper records such an ask as one seed (prompt
   only); State marks it seed.ask; the side panel's Objectives tab lists
   what is asked of the player, the meetings agreed, what they owe, the
   threads they know and their loose ends; the recap and the People card say
   it too. Mock mode. Run with: node tests/run.cjs wave26 */
const assert = require('assert/strict');
const crypto = require('crypto');
const { suite, quickStart, sendText, overflowReport, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('wave26-objectives');
const CARTER = "Carter Sturdivant wants copies of the station's debts from Darlene Pittman's back office before the council vote on Day 6; $500 cash, and deny knowing him if caught";
const TRAVIS = "Travis Cagle asked the player to say nothing about his parked cruiser and to report Boyd Teague's questions to him";
const JODIE = "Jodie Strayhorn waits at the Low Water's back door at half past ten, before opening";
async function start(page, at) {
  await quickStart(page);
  await page.evaluate(loc => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); Game.State.apply({ playerLocationId: loc }); }, at || 'loc_pittmans');
}
// The bookkeeper's seed for the next turn (merged into the demo's own record), then a turn.
async function turnWith(page, seed, words) {
  await page.evaluate(sd => Game.Api.Mock.queue('bookkeep', { newSeeds: [sd] }), seed);
  await sendText(page, words || 'I look around');
}
const say = (page, words, to) => page.evaluate(([w, t]) => Game.Pipeline.submit(w, { mode: 'say', to: t }), [words, to]);
// The Objectives tab as the player sees it: the label, the sections in order and each entry's lines.
function readTab(page) {
  return page.evaluate(() => {
    Game.UI.openPanel('objectives');
    const body = document.getElementById('panel-body');
    const txt = n => (n ? n.textContent : null);
    return {
      label: txt(document.getElementById('tab-objectives')),
      row: txt(document.querySelector('[data-open-tab="objectives"]')),
      lede: txt(body.querySelector('.obj-lede')),
      empty: txt(body.querySelector('p.empty')),
      sections: [...body.querySelectorAll('.obj-sec')].map(sec => ({
        key: sec.dataset.section,
        title: txt(sec.querySelector('h3')),
        items: [...sec.querySelectorAll('li.obj')].map(li => ({
          key: li.dataset.objective, who: txt(li.querySelector('.obj-who')), text: txt(li.querySelector('.obj-text')), when: txt(li.querySelector('.obj-when')),
          late: !!li.querySelector('.obj-when.late'), stakes: txt(li.querySelector('.obj-stakes')), open: li.querySelector('details').open,
          more: Object.fromEntries([...li.querySelectorAll('.obj-more dt')].map(dt => [dt.textContent, dt.nextElementSibling.textContent]))
        }))
      }))
    };
  });
}
const section = (tab, key) => (tab.sections.find(x => x.key === key) || { items: [] });

s.test("the owner's case: Carter's job with a deadline and a reward, Travis's request with no day, Jodie's meeting, a debt part paid, a known thread and the loose ends; the tab's label counts what is waiting on the player; newest first; details on the laptop", async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  await turnWith(page, { effect: CARTER, triggerType: 'day', triggerValue: '6' });
  await turnWith(page, { effect: TRAVIS, triggerType: 'npc', triggerValue: 'npc_travis' });
  await turnWith(page, { effect: JODIE, triggerType: 'location', triggerValue: 'loc_low_water' });
  const seeds = await page.evaluate(() => Game.state.seeds.filter(x => x.turn !== undefined).map(x => ({ effect: x.effect, trigger: x.trigger, ask: x.ask || null, appt: !!x.appointment, turn: x.turn })));
  assert.equal(seeds.length, 3, JSON.stringify(seeds));
  assert.deepEqual(seeds[0].ask, { npcId: 'npc_carter', dueDay: 6, reward: '$500 cash, and deny knowing him if caught' }, 'a day trigger and a person named: an ask with its day and its reward');
  assert.deepEqual(seeds[0].trigger, { type: 'day', value: 6 }, 'the trigger stays as the bookkeeper gave it');
  assert.deepEqual(seeds[1].ask, { npcId: 'npc_travis' }, 'an npc trigger: no day, no reward in its words');
  assert.equal(seeds[2].ask, null, 'a meeting is an appointment, not an ask');
  assert.equal(seeds[2].appt, true);
  // A debt part paid, a thread the player knows (and one they do not).
  await page.evaluate(() => {
    Game.State.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_carter', text: 'Pay Carter Sturdivant $600', amount: 600, dueDay: 3 }] });
    const o = Game.State.obligations('open').find(x => x.npcId === 'npc_carter');
    Game.State.apply({ effects: [{ op: 'obligationPaid', id: o.id, amount: 150 }] });
    Game.State.apply({ threadUpdates: [{ threadId: 'thr_bridge_vote', knownToPlayer: true }] });
    Game.UI.renderGame();
  });
  const tab = await readTab(page);
  assert.equal(tab.label, 'Objectives · 4', 'two asks, a meeting and a debt are waiting on the player');
  assert.equal(tab.lede, 'What you know of. The story keeps the rest.');
  assert.deepEqual(tab.sections.map(x => x.key), ['asks', 'meetings', 'owed', 'threads', 'loose']);
  assert.deepEqual(tab.sections.map(x => x.title), ['Asked of you2', 'Meetings1', 'Owed1', 'Threads you know of1', 'Loose ends3']);
  const asks = section(tab, 'asks').items;
  assert.deepEqual(asks.map(x => x.who), ['Travis Cagle', 'Carter Sturdivant'], 'newest first');
  assert.equal(asks[0].text, "Travis Cagle asked you to say nothing about his parked cruiser and to report Boyd Teague's questions to him");
  assert.equal(asks[0].when, 'when you next see Travis Cagle');
  assert.equal(asks[0].stakes, null);
  assert.equal(asks[1].text, "Carter Sturdivant wants copies of the station's debts from Darlene Pittman's back office before the council vote on Day 6");
  assert.equal(asks[1].when, 'by Day 6 (Tuesday) · in 5 days');
  assert.equal(asks[1].stakes, 'Stakes: $500 cash, and deny knowing him if caught');
  // Always shown on the laptop: the whole effect, the person, the day and the turn it was asked on.
  assert.equal(asks[1].open, true);
  assert.equal(asks[1].more['In full'], CARTER);
  assert.equal(asks[1].more.Who, 'Carter Sturdivant');
  assert.equal(asks[1].more.When, 'Day 6 (Tuesday)');
  assert.match(asks[1].more.Asked, /^Day 1 · Thursday · Morning/);
  assert.equal(asks[0].more.When, 'When you next see Travis Cagle');
  assert.equal(asks[0].more.Who, 'Travis Cagle', 'named in the ask, so named here though the player has no card for him yet');
  const meet = section(tab, 'meetings').items;
  assert.deepEqual(meet.map(x => x.text), ['Jodie Strayhorn at the Low Water, this morning (back door, half past ten)']);
  assert.equal(meet[0].more.Where, "The Low Water, back door");
  assert.equal(meet[0].more.When, 'Day 1 (Thursday), morning (half past ten)');
  const owed = section(tab, 'owed').items;
  assert.deepEqual(owed.map(x => [x.text, x.when, x.late]), [['Pay Carter Sturdivant $600', 'by Day 3 (Saturday) · in 2 days · $150 paid', false]]);
  assert.equal(owed[0].more.Amount, '$600, $150 of it paid');
  const threads = section(tab, 'threads').items;
  const bridge = await page.evaluate(() => Game.State.thread('thr_bridge_vote').title);
  assert.deepEqual(threads.map(x => x.who), [bridge], 'the one thread the player knows of');
  assert.ok(threads[0].text.startsWith(bridge + ' The state has rated the old bridge critical'), 'its title and summary: ' + threads[0].text);
  const loose = section(tab, 'loose').items;
  assert.equal(loose.length, 3, 'the background\'s three open loose ends');
  assert.ok(loose.every(x => x.who && x.text.length > x.who.length), JSON.stringify(loose));
  // Nothing to edit in the tab: no field, no button but the person chips.
  const controls = await page.evaluate(() => [...document.querySelectorAll('#panel-body input, #panel-body textarea, #panel-body select, #panel-body button:not(.chip)')].length);
  assert.equal(controls, 0);
});

s.test('entries leave as the engine settles them: the ask fires when the player next meets Travis, the debt is paid, the thread resolves; /undo brings the ask back; the tab redraws each time', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  await turnWith(page, { effect: TRAVIS, triggerType: 'npc', triggerValue: 'npc_travis' });
  await page.evaluate(() => {
    Game.State.apply({ effects: [{ op: 'addObligation', kind: 'errand', npcId: 'npc_royce', text: 'Bring Royce Pittman the outboard part', itemName: 'outboard part' }] });
    Game.State.apply({ threadUpdates: [{ threadId: 'thr_police_vote', knownToPlayer: true }] });
    Game.UI.renderGame();
  });
  let tab = await readTab(page);
  assert.equal(tab.label, 'Objectives · 2');
  assert.deepEqual(section(tab, 'owed').items.map(x => [x.text, x.when]), [['Bring Royce Pittman the outboard part', null]]);
  assert.equal(section(tab, 'threads').items.length, 1);
  // The next day, where Travis is: the turn there fires the seed, and the ask leaves the tab.
  const where = await page.evaluate(() => {
    Game.State.apply({ setTime: { day: 2, phase: 'morning', shorts: 0, late: false } });
    const l = Game.state.locations.find(x => !x.closed && x.away !== true && Game.State.npcsAt(x.id).some(n => n.id === 'npc_travis'));
    if (l) Game.State.apply({ playerLocationId: l.id });
    return l && l.id;
  });
  assert.ok(where, 'Travis is somewhere in town on Day 2 morning');
  await sendText(page, 'I look around');
  const fired = await page.evaluate(() => Game.state.seeds.find(x => x.ask).fired);
  assert.equal(fired, true, 'the ask came due when the player met Travis');
  tab = await readTab(page);
  assert.equal(section(tab, 'asks').items.length, 0, 'fired: gone from the tab');
  assert.equal(tab.label, 'Objectives · 1');
  // The open tab redraws on the next state change by itself.
  await page.evaluate(() => {
    const o = Game.State.obligations('open').find(x => x.npcId === 'npc_royce');
    Game.State.apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'met' }] });
    Game.State.apply({ threadUpdates: [{ threadId: 'thr_police_vote', status: 'resolved' }] });
    Game.UI.renderGame();
  });
  const after = await page.evaluate(() => ({ label: document.getElementById('tab-objectives').textContent, owed: document.querySelectorAll('#panel-body [data-section="owed"] li').length, threads: document.querySelectorAll('#panel-body [data-section="threads"] li').length }));
  assert.deepEqual(after, { label: 'Objectives', owed: 0, threads: 0 }, 'met and resolved: gone, and no count');
  // /undo takes back the engine's settling and then the turn that fired the ask: the entry is back.
  await sendText(page, '/undo');
  tab = await readTab(page);
  assert.deepEqual(section(tab, 'asks').items.map(x => x.who), ['Travis Cagle'], '/undo restores the entry');
  assert.equal(section(tab, 'asks').items[0].when, 'when you next see Travis Cagle');
});

s.test('the recap says "Asked of you:" after "Open:" on one line, and the People card says "Asked you:" under "Meeting you"; someone dead is "no longer in town"', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  await turnWith(page, { effect: CARTER, triggerType: 'day', triggerValue: '6' });
  await turnWith(page, { effect: JODIE, triggerType: 'location', triggerValue: 'loc_low_water' });
  await turnWith(page, { effect: 'Jodie Strayhorn asked the player to bring her a carton of Winstons', triggerType: 'npc', triggerValue: 'npc_jodie' });
  await sendText(page, '/recap');
  const recap = await page.evaluate(() => Game.Pipeline.recapText().split('\n'));
  const i = recap.findIndex(l => l.startsWith('Open:'));
  assert.ok(i > 0);
  assert.equal(recap[i + 1], "Asked of you: Jodie Strayhorn asked you to bring her a carton of Winstons, when you next see her; Carter Sturdivant wants copies of the station's debts from Darlene Pittman's back office before the council vote on Day 6.");
  const feed = await page.evaluate(() => [...document.querySelectorAll('#feed .f-recap, #feed [data-kind="recap"]')].map(x => x.textContent).pop() || document.getElementById('feed').textContent);
  assert.ok(feed.includes('Asked of you: Jodie Strayhorn asked you to bring her a carton of Winstons'), 'the /recap in the feed has it');
  // The People card: the meeting, then the ask.
  const flags = await page.evaluate(() => {
    Game.State.apply({ npcKnownToPlayer: ['npc_jodie', 'npc_carter'] });
    Game.UI.openPanel('people');
    const of = id => [...document.querySelectorAll(`.pcard[data-npc="${id}"] .pcard-flag`)].map(f => ({ text: f.textContent, ask: f.dataset.ask || null, appt: f.dataset.appt || null }));
    return { jodie: of('npc_jodie'), carter: of('npc_carter') };
  });
  assert.deepEqual(flags.jodie.filter(f => f.ask || f.appt).map(f => f.text), ['Meeting you: the Low Water, this morning (back door, half past ten)', 'Asked you: bring her a carton of Winstons, when you next see her']);
  assert.deepEqual(flags.carter.filter(f => f.ask).map(f => f.text), ["Asked you: copies of the station's debts from Darlene Pittman's back office before the council vote on Day 6"]);
  // Carter dead: the ask stays (the seed is the story's) and says he is no longer in town.
  const dead = await page.evaluate(() => {
    Game.State.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_carter', status: 'dead' }] });
    Game.UI.openPanel('objectives');
    const li = document.querySelector('#panel-body li[data-objective^="ask:"] .obj-gone');
    return { gone: li ? li.textContent : null, recap: Game.Pipeline.recapText().split('\n').find(l => l.startsWith('Asked of you:')) };
  });
  assert.equal(dead.gone, ' (no longer in town)');
  assert.match(dead.recap, /Day 6 \(no longer in town\)\.$/);
});

s.test('the demo: "What do you want from me?" said to Royce has him ask for the outboard part by a day, and the demo bookkeeper records it; the tab shows it; said to everyone, or without the words, nothing is asked', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  assert.equal((await say(page, 'What do you want from me?', 'npc_royce')).ok, true);
  const r = await page.evaluate(() => ({ narration: Game.state.log[Game.state.log.length - 1].narration, sd: Game.state.seeds.find(x => x.ask) || null }));
  assert.ok(r.narration.includes('Royce Pittman wants the outboard part by Day 3. "Bring it by Saturday and I\'ll make it worth your while."'), r.narration);
  assert.ok(r.sd, 'the demo bookkeeper recorded the ask');
  assert.equal(r.sd.effect, "Royce Pittman wants the outboard part from Tester by Day 3 (Saturday); it will be worth Tester's while.");
  assert.deepEqual(r.sd.trigger, { type: 'day', value: 3 });
  assert.deepEqual(r.sd.ask, { npcId: 'npc_royce', dueDay: 3, reward: "it will be worth Tester's while" });
  const tab = await readTab(page);
  assert.equal(tab.label, 'Objectives · 1');
  assert.deepEqual(section(tab, 'asks').items.map(x => [x.text, x.when, x.stakes]), [['Royce Pittman wants the outboard part from you by Day 3 (Saturday)', 'by Day 3 (Saturday) · in 2 days', 'Stakes: it will be worth your while']]);
  assert.match(section(tab, 'asks').items[0].more.Asked, /^Day 1 · Thursday · Morning — /);
  for (const [w, to] of [['What do you need?', 'everyone'], ['How is business?', 'npc_royce']]) {
    const n0 = await page.evaluate(() => Game.state.seeds.length);
    await say(page, w, to);
    assert.equal(await page.evaluate(() => Game.state.seeds.length), n0, w);
  }
});

s.test('engine rules: only the model\'s seeds are asks (never the engine\'s, never a meeting, never someone dead); the reward or threat from the words; the bookkeeper is told how (prompt only) and record_changes is unchanged', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const r = await page.evaluate(() => {
    const S = Game.State;
    const dead = Game.state.npcs.find(n => n.alive === false);
    return {
      engine: (S.apply({ newSeeds: [{ effect: 'Carter Sturdivant wants the ledger by Day 4', triggerType: 'day', triggerValue: '4' }] }), Game.state.seeds.filter(x => x.ask).length),
      dead: S.askOf({ effect: `${dead.name} wants the player to dig up the jar`, trigger: { type: 'day', value: 4 } }),
      nobody: S.askOf({ effect: 'A man in a feed cap wants the player gone by Friday', trigger: { type: 'day', value: 4 } }),
      appt: S.askOf({ effect: 'Jodie Strayhorn wants a word', trigger: { type: 'location', value: 'loc_low_water' }, appointment: { npcId: 'npc_jodie' } }),
      rewards: [
        "Carter Sturdivant wants the ledger by Day 4; $500 cash",
        'Carter Sturdivant will pay $300 cash for the ledger by Day 4',
        'Boyd Teague wants the player out of town by Friday, or else he tells the chief',
        'Royce Pittman wants the part fetched, and he offers $40',
        'Travis Cagle asked the player to keep quiet'
      ].map(S.askReward)
    };
  });
  assert.equal(r.engine, 0, 'an engine seed is never an ask');
  assert.equal(r.dead, null);
  assert.equal(r.nobody, null);
  assert.equal(r.appt, null);
  assert.deepEqual(r.rewards, ['$500 cash', '$300 cash', 'or else he tells the chief', '$40', null]);
  const p = await page.evaluate(() => ({ rules: Game.Api.RECORD_RULES, sys: Game.Api.SYSTEM.bookkeeper, rc: JSON.stringify(Game.Api.SCHEMAS.record_changes) }));
  for (const bit of ['A favour or a job someone in the narration asks of the player (something to fetch, find out, deliver, keep quiet about, say or do; an offer with a reward; a warning with a threat) is one seed too',
    "triggerType day with its deadline's day number when it has one ('before the council vote' is the day THREADS or TOWN NEWS give for it; 'by Friday' is that day; DAYS on the TURN line numbers the weekdays)",
    "else triggerType npc with that person's id as triggerValue (it comes due when the player next meets them)",
    "the effect starts with that person's full name and says what they asked, the reward or the threat, and the deadline in words",
    "'Carter Sturdivant wants copies of the station's debts from Darlene Pittman's back office before the council vote on Day 6; $500 cash, and deny knowing him if caught'",
    "'Travis Cagle asked the player to say nothing about his parked cruiser and to report Boyd Teague's questions to him'",
    'one seed per ask, none for small talk']) {
    assert.ok(p.rules.includes(bit), 'rule: ' + bit);
    assert.ok(p.sys.includes(bit), 'in the system prompt: ' + bit);
  }
  // The exact schema the build sends (the grammar limit: wave 17): the asks change none of it. The wave 21 build's was a5a714b4...;
  // changed by design on the relationship branch (waves 28 and 32: socialEvents), the same pin as tests/wave22-appointments.test.cjs.
  assert.equal(crypto.createHash('sha256').update(p.rc).digest('hex'), '6ec52fc3e16fdca267b6b36260e1cfcc1c0ed0c4bff51007a24a5857588f9eb2');
  // The packet's TURN line numbers the week ahead, so "before Tuesday's vote" can be a day trigger.
  await sendText(page, 'I look around');
  const packet = await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'bookkeep').map(c => c.text).pop() || '');
  assert.match(packet.split('\n')[0], / DAYS: Day 1 Thursday, Day 2 Friday, Day 3 Saturday, Day 4 Sunday, Day 5 Monday, Day 6 Tuesday, Day 7 Wednesday, Day 8 Thursday\.$/);
});

s.test('a 320x640 phone, dark: the tab row (now five tabs) fits without a cut label or a sideways scroll, every target a tap tall, with the Objectives sheet open and every entry opened; entries start shut on a phone', async h => {
  const page = await h.open({ viewport: { width: 320, height: 640 } });
  await start(page);
  await turnWith(page, { effect: CARTER, triggerType: 'day', triggerValue: '6' });
  await turnWith(page, { effect: TRAVIS, triggerType: 'npc', triggerValue: 'npc_travis' });
  await page.evaluate(() => { Game.State.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_carter', text: 'Pay Carter Sturdivant $600', amount: 600, dueDay: 3 }], threadUpdates: [{ threadId: 'thr_bridge_vote', knownToPlayer: true }] }); Game.UI.renderGame(); });
  await page.waitForTimeout(100);
  const row = () => page.evaluate(() => [...document.querySelectorAll('.tabbar button, .tab-act')].map(b => ({ t: b.textContent, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, cut: b.scrollWidth > b.clientWidth + 1, r: Math.round(b.getBoundingClientRect().right) })));
  const bar = await row();
  assert.equal(bar.length, 6, 'five tabs and the actions button');
  assert.ok(bar.every(b => b.h >= 44 && b.w >= 44 && !b.cut && b.r <= 320), JSON.stringify(bar));
  assert.match(bar[3].t, /^(Objectives|Goals) · 3$/, 'the count, with "Goals" only when the row needs it');
  assert.deepEqual(await overflowReport(page, 320), []);
  await page.click('[data-open-tab="objectives"]');
  await page.waitForTimeout(350);
  const shut = await page.evaluate(() => [...document.querySelectorAll('#panel-body details.obj-d')].map(d => d.open));
  assert.ok(shut.length >= 5 && shut.every(o => !o), 'shut on a phone: ' + JSON.stringify(shut));
  for (const sum of await page.$$('#panel-body .obj-sum')) { await sum.scrollIntoViewIfNeeded(); await sum.click(); }
  const m = await page.evaluate(() => ({
    open: [...document.querySelectorAll('#panel-body details.obj-d')].every(d => d.open),
    tabs: [...document.querySelectorAll('#panel-tabs [role=tab]')].map(b => ({ t: b.textContent, cut: b.scrollWidth > b.clientWidth + 1, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })),
    small: [...document.querySelectorAll('#panel-body .obj-sum, #panel-body .chip, #panel-close')].filter(x => x.getBoundingClientRect().height < 44).map(x => x.className),
    bg: getComputedStyle(document.body).backgroundColor, when: getComputedStyle(document.querySelector('.obj-when')).color
  }));
  assert.ok(m.open, 'every entry opened');
  assert.ok(m.tabs.every(t => !t.cut && t.h >= 44 && t.w >= 44), JSON.stringify(m.tabs));
  assert.deepEqual(m.small, [], 'every target a tap tall');
  assert.deepEqual(await overflowReport(page, 320), []);
  // Opened entries stay open through a redraw (a turn's state change).
  await page.evaluate(() => Game.UI.renderGame());
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#panel-body details.obj-d')].every(d => d.open)), 'kept open');
  // Dark: the when line in the dark theme's accent.
  assert.equal(m.when, 'rgb(210, 170, 105)');
});

s.test('light theme on a laptop and on a phone at 390: the tab fits beside the others with its full label, the when line in the light accent, an overdue one in the danger colour, nothing sideways', async h => {
  for (const vp of [LAPTOP, { width: 390, height: 780 }]) {
    const page = await h.open({ viewport: vp, colorScheme: 'light' });
    await start(page);
    await turnWith(page, { effect: CARTER, triggerType: 'day', triggerValue: '6' });
    await page.evaluate(() => { Game.State.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_carter', text: 'Pay Carter Sturdivant $600', amount: 600, dueDay: 1 }] }); Game.State.apply({ setTime: { day: 2, phase: 'morning', shorts: 0, late: false } }); Game.UI.openPanel('objectives'); });
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => ({
      tabs: [...document.querySelectorAll('#panel-tabs [role=tab]')].map(b => ({ t: b.textContent, cut: b.scrollWidth > b.clientWidth + 1 })),
      when: getComputedStyle(document.querySelector('[data-section="asks"] .obj-when')).color,
      late: getComputedStyle(document.querySelector('[data-section="owed"] .obj-when')).color,
      lateText: document.querySelector('[data-section="owed"] .obj-when').textContent
    }));
    assert.deepEqual(m.tabs.map(t => t.t), ['Character', 'People', 'Journal', 'Objectives · 2', 'Places'], 'the full label where it fits');
    assert.ok(m.tabs.every(t => !t.cut), JSON.stringify(m.tabs));
    assert.equal(m.when, 'rgb(129, 82, 25)');
    assert.equal(m.late, 'rgb(156, 61, 40)');
    assert.equal(m.lateText, 'by Day 1 (Thursday) · overdue');
    assert.deepEqual(await overflowReport(page, vp.width), []);
  }
});

s.run();
