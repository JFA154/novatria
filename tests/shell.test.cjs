'use strict';
/* Milestone 1 shell: layout, themes, screens, creation, feed, input,
   commands, saving. Run with: node tests/run.cjs */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, quickStart, stateJson, sendText, overflowReport, ROOT, LAPTOP, PHONE } = require('./helpers.cjs');

const s = suite('shell');
const MODULES = ['Rng', 'Dice', 'Tables', 'State', 'Town', 'World', 'Style', 'Api', 'Pipeline', 'Storage', 'UI', 'Commands', 'App'];
const DARK_BG = 'rgb(23, 19, 15)';
const PARCHMENT_BG = 'rgb(244, 236, 218)';

s.test('loads without errors at 1280x800 and exposes Game only', async h => {
  const page = await h.open({ viewport: LAPTOP });
  assert.ok(await page.isVisible('#screen-title.active'));
  const info = await page.evaluate(mods => ({
    missing: mods.filter(m => !window.Game[m]),
    leaked: mods.concat(['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'LOOSE_ENDS', 'STYLE_GUIDE', 'el', 'PHASES']).filter(m => m !== 'Storage' && Object.prototype.hasOwnProperty.call(window, m)),
    storageIsOurs: window.Game.Storage !== window.Storage,
    state: window.Game.state,
    townName: window.Game.town.name,
    title: document.getElementById('title-name').textContent,
    buttons: ['btn-new', 'btn-continue', 'btn-load', 'btn-settings'].map(id => document.getElementById(id).textContent),
    font: getComputedStyle(document.querySelector('.title-setting')).fontFamily
  }), MODULES);
  assert.deepEqual(info.missing, []);
  assert.deepEqual(info.leaked, []);
  assert.ok(info.storageIsOurs);
  assert.equal(info.state, null);
  assert.equal(info.title, info.townName);
  assert.deepEqual(info.buttons, ['New game', 'Continue', 'Load', 'Settings']);
  assert.match(info.font, /Literata/);
  assert.match(info.font, /Georgia/);
  assert.ok(await page.isDisabled('#btn-continue'), 'Continue is disabled with no autosave');
});

s.test('laptop layout: 680px feed, 320px collapsible panel, 18px/1.6 reading text', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  const m = await page.evaluate(() => {
    const feed = document.getElementById('feed');
    const cs = getComputedStyle(feed);
    return {
      feedW: feed.getBoundingClientRect().width,
      panelW: document.getElementById('panel').getBoundingClientRect().width,
      size: cs.fontSize, lh: cs.lineHeight,
      tabs: [...document.querySelectorAll('#panel-tabs [role=tab]')].map(b => b.textContent),
      bar: ['tb-time', 'tb-loc', 'tb-hp', 'tb-gold'].map(id => document.getElementById(id).textContent),
      inputSize: parseFloat(getComputedStyle(document.getElementById('cmd')).fontSize)
    };
  });
  assert.ok(m.feedW <= 680 && m.feedW > 600, 'feed width ' + m.feedW);
  assert.equal(Math.round(m.panelW), 320);
  assert.equal(m.size, '18px');
  assert.equal(m.lh, '28.8px');
  assert.deepEqual(m.tabs, ['Character', 'People', 'Journal', 'Places']);
  assert.match(m.bar[0], /^Day 1 · Morning$/);
  assert.ok(m.bar[1].length > 0);
  assert.match(m.bar[2], /^10\/10$/);
  assert.ok(m.inputSize >= 16);
  await page.click('#tb-panel');
  assert.ok(!(await page.isVisible('#panel')), 'panel collapses');
  await page.click('#tb-panel');
  assert.ok(await page.isVisible('#panel'), 'panel reopens');
});

s.test('loads at 375x740 with no horizontal overflow on any screen; 44px tap targets', async h => {
  const page = await h.open({ viewport: PHONE });
  assert.deepEqual(await overflowReport(page, 375), [], 'title');
  await page.click('#btn-new');
  assert.deepEqual(await overflowReport(page, 375), [], 'creation');
  await page.evaluate(() => Game.UI.showScreen('settings'));
  assert.deepEqual(await overflowReport(page, 375), [], 'settings');
  await page.evaluate(() => Game.UI.showScreen('saves'));
  assert.deepEqual(await overflowReport(page, 375), [], 'saves');
  await quickStart(page);
  await sendText(page, 'I try to read the long notice nailed to the post, word by word, slowly and with great care');
  assert.deepEqual(await overflowReport(page, 375), [], 'game');
  const small = await page.evaluate(() => [...document.querySelectorAll('#screen-game button, #screen-game textarea')]
    .filter(el => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && !el.closest('[hidden]') && el.id !== 'new-btn'; })
    .map(el => ({ id: el.id || el.textContent.trim(), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
    .filter(x => x.h < 44 || x.w < 44));
  assert.deepEqual(small, [], 'tap targets under 44px');
  await page.click('[data-open-tab="character"]');
  await page.waitForTimeout(320);
  for (const tabName of ['character', 'people', 'journal', 'places']) {
    await page.click(`#tab-${tabName}`);
    assert.deepEqual(await overflowReport(page, 375), [], 'sheet ' + tabName);
  }
  await page.click('#panel-close');
  const input = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('cmd')).fontSize));
  assert.ok(input >= 16, 'input font size ' + input);
});

s.test('375 wide, the busiest scene: the Do / Say toggle and every chip are 44px targets, nothing overflows, and a Say line shows the quote and the addressee', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page);
  const busy = await page.evaluate(() => {
    let best = null;
    for (const l of Game.state.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      const n = Game.State.npcsAt(l.id, ph).length;
      if (!l.closed && (!best || n > best.n)) best = { loc: l.id, phase: ph, n };
    }
    return best;
  });
  assert.ok(busy.n >= 3, 'a scene with three or more people');
  await page.evaluate(([loc, phase]) => { Game.Api.Mock.delay = 0; while (Game.state.time.phase !== phase) Game.State.apply({ advanceTime: 'long' }); Game.State.apply({ playerLocationId: loc }); }, [busy.loc, busy.phase]);
  const measure = () => page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { id: el.id || el.dataset.to, w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const vis = el => !el.closest('[hidden]') && el.getBoundingClientRect().width > 0;
    return {
      targets: [...document.querySelectorAll('#mode-do, #mode-say, #say-to .say-chip, #say-pick, #send, #cmd')].filter(vis).map(box),
      options: [...document.querySelectorAll('#say-pick option')].map(o => o.value),
      toggle: box(document.querySelector('.mode-toggle')), cmd: box(document.getElementById('cmd')), chips: box(document.getElementById('say-to')),
      font: parseFloat(getComputedStyle(document.getElementById('cmd')).fontSize)
    };
  });
  let m = await measure();
  assert.deepEqual(m.targets.filter(x => x.w < 44 || x.h < 44), [], 'Do mode: tap targets under 44px');
  assert.ok(m.toggle.right <= m.cmd.left, 'the toggle sits left of the input');
  assert.deepEqual(await overflowReport(page, 375), [], 'Do mode');
  await page.click('#mode-say');
  m = await measure();
  // More than four people here: one "To:" picker (Everyone plus each person) instead of the chips.
  const picker = busy.n > 4;
  if (picker) assert.equal(m.options.length, busy.n + 1, 'Everyone plus one option per person');
  else assert.equal(m.targets.filter(x => x.id && !['mode-do', 'mode-say', 'send', 'cmd'].includes(x.id)).length, busy.n + 1, 'Everyone plus one chip per person');
  assert.deepEqual(m.targets.filter(x => x.w < 44 || x.h < 44), [], 'Say mode: tap targets under 44px');
  assert.ok(m.chips.bottom <= m.cmd.top, 'the chips sit above the input');
  assert.ok(m.cmd.w >= 140, 'the input keeps a usable width: ' + m.cmd.w);
  assert.ok(m.font >= 16, 'input font ' + m.font);
  assert.deepEqual(await overflowReport(page, 375), [], 'Say mode with the chips');
  const who = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId)[0]);
  if (picker) await page.selectOption('#say-pick', who.id); else await page.click(`#say-to [data-to="${who.id}"]`);
  const whoLabel = await page.evaluate(id => Game.npcLabel(Game.state.npcs.find(n => n.id === id)), who.id);
  await sendText(page, 'Run.');
  const line = await page.evaluate(() => { const n = [...document.querySelectorAll('#feed .f-input')].pop(); return { text: n.textContent, words: n.querySelector('.f-words').textContent, to: n.querySelector('.f-to').textContent, say: n.classList.contains('f-say') }; });
  assert.deepEqual(line, { text: `“Run.” — to ${whoLabel}`, words: '“Run.”', to: ` — to ${whoLabel}`, say: true });
  assert.deepEqual(await overflowReport(page, 375), [], 'after a Say turn');
  // A Do line is still the text as typed.
  await page.click('#mode-do');
  await sendText(page, 'I nod and step back');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('#feed .f-input')].pop().textContent), 'I nod and step back');
});

s.test('theme follows prefers-color-scheme on first load; toggle switches and persists', async h => {
  const light = await h.open({ colorScheme: 'light' });
  assert.equal(await light.getAttribute('html', 'data-theme'), 'parchment');
  assert.equal(await light.evaluate(() => getComputedStyle(document.body).backgroundColor), PARCHMENT_BG);
  const dark = await h.open({ colorScheme: 'dark' });
  assert.equal(await dark.getAttribute('html', 'data-theme'), 'dark');
  assert.equal(await dark.evaluate(() => getComputedStyle(document.body).backgroundColor), DARK_BG);
  assert.equal(await dark.textContent('#btn-theme'), 'Parchment theme');
  await dark.click('#btn-theme');
  assert.equal(await dark.getAttribute('html', 'data-theme'), 'parchment');
  assert.equal(await dark.evaluate(() => getComputedStyle(document.body).backgroundColor), PARCHMENT_BG);
  await dark.reload();
  await dark.waitForFunction(() => window.Game);
  assert.equal(await dark.getAttribute('html', 'data-theme'), 'parchment', 'choice survives reload despite dark OS preference');
  await dark.click('#btn-settings');
  await dark.check('input[name="set-theme"][value="dark"]');
  assert.equal(await dark.getAttribute('html', 'data-theme'), 'dark');
  await dark.check('input[name="set-size"][value="L"]');
  assert.equal(await dark.getAttribute('html', 'data-size'), 'L');
});

s.test('new game through character creation to the Begin card (laptop, one page)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await page.click('#btn-new');
  // First launch with no key: how to play comes first.
  await page.click('#choose-demo');
  assert.equal(await page.locator('.step:visible').count(), 5, 'all five steps on one page (goal and flaw share one)');
  // Review with nothing filled shows errors and creates nothing.
  await page.click('#cr-review');
  assert.match(await page.textContent('#cr-step-name .err'), /name/i);
  assert.equal(await page.evaluate(() => Game.state), null);

  await page.fill('#cr-name', 'Tomas Reed');
  const bg = await page.evaluate(() => Game.data.BACKGROUNDS[0]);
  await page.click(`.bg-choice[data-id="${bg.id}"]`);
  // Age sits with the background: it starts at the background's age, 16 to 90.
  assert.equal(await page.inputValue('#cr-age'), String(bg.age), 'the background sets the age');
  assert.match(await page.textContent('#cr-step-background'), new RegExp(`16 to 90\\. A ${bg.name.toLowerCase()} is usually about ${bg.age}\\.`));
  const other = await page.evaluate(() => Game.data.BACKGROUNDS[1]);
  await page.click(`.bg-choice[data-id="${other.id}"]`);
  assert.equal(await page.inputValue('#cr-age'), String(other.age), 'another background, its own age');
  await page.click(`.bg-choice[data-id="${bg.id}"]`);
  for (const bad of ['12', '91', '30.5']) {
    await page.fill('#cr-age', bad);
    await page.click('#cr-review');
    assert.equal(await page.textContent('#cr-step-background .err'), 'Age must be a whole number from 16 to 90.', bad);
    assert.equal(await page.evaluate(() => Game.state), null);
  }
  await page.fill('#cr-age', '52');
  await page.click(`.bg-choice[data-id="${other.id}"]`);
  await page.click(`.bg-choice[data-id="${bg.id}"]`);
  assert.equal(await page.inputValue('#cr-age'), '52', 'a typed age stays when the background changes');
  const from = Object.keys(bg.stats).find(k => bg.stats[k] > -1);
  const to = Object.keys(bg.stats).find(k => k !== from && bg.stats[k] < 3);
  // The steppers: − on one stat, + on another.
  await page.click(`.step-btn[data-for="${from}"][data-dir="down"]`);
  await page.click(`.step-btn[data-for="${to}"][data-dir="up"]`);
  assert.equal(await page.textContent(`#cr-stat-grid [data-stat="${to}"]`), (bg.stats[to] + 1 > 0 ? '+' : bg.stats[to] + 1 < 0 ? '−' : '') + Math.abs(bg.stats[to] + 1));
  await page.fill('#cr-goal', 'Find out who burned my letters');
  await page.click('.flaw-choice[data-index="1"]');
  for (const k of ['debt', 'enemy', 'secret']) await page.click(`.le-toggle[data-kind="${k}"]`);
  assert.ok(await page.isDisabled('.le-toggle[data-kind="lost"]'), 'a fourth loose end cannot be picked');
  // One line per loose end, filled by a suggestion chip or typed.
  await page.click('.le-choice[data-kind="enemy"][data-index="1"]');
  await page.fill('.le-text[data-kind="secret"]', 'The harbour clerk knows my real name.');
  await page.click('#cr-review');

  await page.waitForSelector('#create-summary-view:not([hidden])');
  const card = await page.textContent('#summary-card');
  assert.match(card, /Tomas Reed · 52/);
  assert.match(card, /Age52/);
  assert.equal(await page.evaluate(() => Game.state.player.age), 52);
  assert.match(card, new RegExp(bg.name));
  assert.match(card, /The harbour clerk knows my real name\./);
  const enemyOption = await page.evaluate(() => Game.data.LOOSE_ENDS.enemy.options[1]);
  assert.ok(card.includes(enemyOption), 'picked preset is used');
  const loose = await page.evaluate(() => Game.state.player.looseEnds.map(le => ({ kind: le.kind, npc: Game.State.npc(le.npcId) })));
  assert.equal(loose.length, 3);
  for (const le of loose) {
    assert.ok(le.npc, 'loose end linked to a real NPC');
    assert.ok(card.includes(le.npc.name), 'summary names ' + le.npc.name);
  }
  assert.equal(await page.evaluate(() => Game.Storage.hasAutosave()), false, 'nothing saved before Begin');

  await page.click('#cr-begin');
  await page.waitForSelector('#screen-game.active');
  const g = await page.evaluate(() => ({
    divider: document.querySelector('#feed .f-divider').textContent,
    narr: document.querySelectorAll('#feed .f-narr').length,
    loc: Game.state.player.locationId,
    start: Game.town.startLocationIds,
    arrival: Game.data.BACKGROUNDS.find(b => b.id === Game.state.player.backgroundId).arrival,
    stats: Game.state.player.stats,
    autosave: Game.Storage.hasAutosave()
  }));
  assert.match(g.divider, /^Day 1 · (\w+ · )?Morning$/, 'the weekday sits in the middle once the engine has a calendar');
  assert.equal(g.narr, 1);
  assert.equal(g.loc, g.start[g.arrival], 'arrives at the gate or the docks per background');
  assert.equal(g.stats[from], bg.stats[from] - 1);
  assert.equal(g.stats[to], bg.stats[to] + 1);
  assert.ok(g.autosave);
});

s.test('mobile creation shows one step per screen, then Begin; the sheet opens and closes', async h => {
  const page = await h.open({ viewport: PHONE });
  await page.click('#btn-new');
  await page.click('#choose-demo');
  const visibleSteps = () => page.locator('.step:visible').count();
  assert.equal(await visibleSteps(), 1);
  assert.equal(await page.textContent('#cr-count'), 'Step 1 of 5');
  await page.click('#cr-next');
  assert.match(await page.textContent('#cr-step-name .err'), /name/i, 'cannot skip the name');
  await page.fill('#cr-name', 'Ilse');
  await page.click('#cr-next');
  assert.equal(await page.textContent('#cr-count'), 'Step 2 of 5');
  await page.click('.bg-choice >> nth=1');
  await page.click('#cr-next');
  await page.click('#cr-next');
  // Goal and flaw share a step.
  await page.fill('#cr-goal', 'Bring my brother home');
  await page.fill('#cr-flaw-custom', 'Cannot sit still');
  await page.click('#cr-next');
  assert.equal(await visibleSteps(), 1);
  assert.equal(await page.textContent('#cr-next'), 'Review');
  for (const k of ['debt', 'lost', 'promise']) await page.click(`.le-toggle[data-kind="${k}"]`);
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.click('#cr-next');
  await page.waitForSelector('#create-summary-view:not([hidden])');
  assert.match(await page.textContent('#summary-card'), /Cannot sit still/);
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.click('#cr-begin');
  await page.waitForSelector('#screen-game.active');

  assert.ok(await page.isVisible('.tabbar'), 'tab bar above the input');
  assert.ok(!(await page.isVisible('#tb-save')), 'laptop-only buttons hidden');
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(350);
  const open = await page.evaluate(() => { const r = document.getElementById('panel').getBoundingClientRect(); return { top: r.top, h: r.height, vis: getComputedStyle(document.getElementById('panel')).visibility, tab: Game.UI.tab }; });
  assert.equal(open.vis, 'visible');
  assert.ok(Math.abs(open.top) < 2 && open.h >= 700, 'full-height sheet ' + JSON.stringify(open));
  assert.equal(open.tab, 'people');
  await page.click('#panel-close');
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('panel')).visibility), 'hidden');
  // Swipe down closes it too.
  await page.click('[data-open-tab="journal"]');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const p = document.getElementById('panel');
    const t = (y) => [new Touch({ identifier: 1, target: p, clientX: 180, clientY: y })];
    p.dispatchEvent(new TouchEvent('touchstart', { touches: t(60), bubbles: true }));
    p.dispatchEvent(new TouchEvent('touchmove', { touches: t(260), bubbles: true }));
    p.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  });
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('panel')).visibility), 'hidden', 'swipe down closes the sheet');
  // The menu reaches settings and saves.
  await page.click('#tb-menu');
  await page.click('[data-menu="settings"]');
  assert.ok(await page.isVisible('#screen-settings.active'));
});

s.test('panels show real state after Begin and never leak hidden fields', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'enemy', 'promise'] });
  const st = await page.evaluate(() => Game.state);
  const panelText = async tab => { await page.click(`#tab-${tab}`); return page.innerText('#panel-body'); };

  const ch = await panelText('character');
  assert.ok(ch.includes(st.player.name) && ch.includes(st.player.background) && ch.includes(String(st.player.gold)));
  // The age beside the name, and what the background means.
  const bg = await page.evaluate(id => Game.data.BACKGROUNDS.find(b => b.id === id), st.player.backgroundId);
  assert.equal(st.player.age, bg.age, 'quick start takes the background\'s age');
  assert.equal(await page.textContent('#panel-body .char-name'), `${st.player.name} · ${bg.age}`);
  assert.equal(await page.textContent('#panel-body .char-blurb'), bg.blurb);
  for (const i of st.player.inventory) assert.ok(ch.includes(i.name), 'inventory shows ' + i.name);

  const people = await panelText('people');
  const known = st.npcs.filter(n => n.knownToPlayer);
  assert.equal(known.length, 3);
  for (const n of known) assert.ok(people.includes(n.name) && people.includes(n.role.charAt(0).toUpperCase() + n.role.slice(1)), 'people shows ' + n.name);
  for (const n of st.npcs) {
    if (n.secret) assert.ok(!people.includes(n.secret), 'secret leaked: ' + n.id);
    if (n.goal) assert.ok(!people.includes(n.goal), 'goal leaked: ' + n.id);
  }
  assert.match(people, /\b(hostile|cold|wary|neutral|friendly|warm|loyal)\b/);

  const journal = await panelText('journal');
  for (const t of st.threads.filter(x => x.knownToPlayer)) assert.ok(journal.includes(t.title));
  for (const t of st.threads.filter(x => !x.knownToPlayer)) assert.ok(!journal.includes(t.summary), 'hidden thread leaked');
  assert.match(journal, /Arrived in/);

  const places = await panelText('places');
  const here = st.locations.find(l => l.id === st.player.locationId);
  assert.ok(places.includes(here.name) && places.includes(here.description));
  // Every exit the player knows of (a home nobody has told them about is no exit yet, as on the map).
  for (const id of here.exits) { const l = st.locations.find(x => x.id === id); if (l.discovered) assert.ok(places.includes(l.name), l.name); }
  for (const sd of st.seeds) assert.ok(!(ch + people + journal + places).includes(sd.effect), 'seed leaked');
});

s.test('a dummy turn renders the input and a streamed narration; Enter sends, Shift+Enter breaks lines', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.fill('#cmd', 'I look around the square');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length === 2);
  const feed = await page.evaluate(() => ({
    inputs: [...document.querySelectorAll('#feed .f-input')].map(e => e.textContent),
    narr: [...document.querySelectorAll('#feed .f-narr')].map(e => e.textContent),
    pending: document.querySelectorAll('#feed .pending').length,
    box: document.getElementById('cmd').value
  }));
  assert.deepEqual(feed.inputs, ['I look around the square']);
  assert.equal(feed.narr.length, 2);
  assert.match(feed.narr[1], /Mock narration/);
  assert.equal(feed.pending, 0);
  assert.equal(feed.box, '');

  await page.focus('#cmd');
  await page.keyboard.type('first line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('second line');
  assert.equal(await page.inputValue('#cmd'), 'first line\nsecond line');
  assert.equal(await page.evaluate(() => Game.state.log.length), 2, 'Shift+Enter did not send');
  const one = await page.evaluate(() => document.getElementById('cmd').getBoundingClientRect().height);
  await page.fill('#cmd', Array.from({ length: 9 }, (_, i) => 'line ' + i).join('\n'));
  const grown = await page.evaluate(() => {
    const ta = document.getElementById('cmd');
    const cs = getComputedStyle(ta);
    const max = parseFloat(cs.lineHeight) * 4 + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    return { h: ta.getBoundingClientRect().height, max, overflow: cs.overflowY };
  });
  assert.ok(grown.h > one, 'grows');
  assert.ok(grown.h <= grown.max + 1, `stops at 4 lines (${grown.h} > ${grown.max})`);
  assert.equal(grown.overflow, 'auto');
});

s.test('roll lines are quiet, formatted per the spec, and can be hidden in Settings', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, 'I try to climb the wall');
  const line = await page.textContent('#feed .f-roll');
  assert.match(line, /^(Might|Wits|Charm|Stealth) \d+( [+−] \d+ = -?\d+)? vs (8|12|15|18) · (Critical|Success|Partial|Failure|Critical failure)$/);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.f-roll')).fontSize), '13px');
  await page.click('#tb-settings');
  await page.uncheck('#set-rolls');
  await page.click('#settings-done');
  assert.equal(await page.locator('#feed .f-roll').count(), 0);
  await page.click('#tb-settings');
  await page.check('#set-rolls');
  await page.click('#settings-done');
  assert.equal(await page.locator('#feed .f-roll').count(), 1);
});

s.test('typing "/" lists every command from SPEC section 12; arrows and Enter complete', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await page.focus('#cmd');
  await page.keyboard.type('/');
  await page.waitForSelector('#ac:not([hidden])');
  const names = await page.$$eval('#ac li .ac-name', els => els.map(e => e.textContent));
  assert.deepEqual(names, ['/look', '/zoom', '/skip', '/pass', '/rest', '/wait', '/fact', '/sheet', '/people', '/journal', '/recap', '/places', '/undo', '/reroll', '/cheat', '/pronouns', '/edit', '/save', '/load', '/debug']);
  await page.keyboard.type('pe');
  assert.deepEqual(await page.$$eval('#ac li .ac-name', els => els.map(e => e.textContent)), ['/people']);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.inputValue('#cmd'), '/people');
  assert.ok(await page.isHidden('#ac'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => Game.UI.tab === 'people');
  await page.keyboard.type('/s');
  assert.deepEqual(await page.$$eval('#ac li .ac-name', els => els.map(e => e.textContent)), ['/skip', '/sheet', '/save']);
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#ac'));
  await page.fill('#cmd', '/look around');
  assert.ok(await page.isHidden('#ac'), 'list hides after a space');
});

s.test('/sheet /people /journal /places /debug switch the panel', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  for (const [cmd, tab] of [['/people', 'people'], ['/journal', 'journal'], ['/places', 'places'], ['/sheet', 'character']]) {
    await sendText(page, cmd);
    assert.equal(await page.getAttribute('#panel-body', 'data-tab'), tab, cmd);
  }
  await sendText(page, '/debug');
  assert.ok(await page.isVisible('#tab-debug'));
  const dbg = await page.textContent('#panel-body');
  assert.match(dbg, /Seeds/);
  assert.match(dbg, /Faction clocks/);
  await sendText(page, '/debug');
  assert.equal(await page.locator('#tab-debug').count(), 0);
  const narrBefore = await page.locator('#feed .f-narr').count();
  await sendText(page, '/look');
  assert.equal(await page.locator('#feed .f-narr').count(), narrBefore + 1, '/look narrates the scene');
});

s.test('/undo restores the exact previous state', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, 'I look at the boats');
  const before = await stateJson(page);
  await sendText(page, 'I try to pick the lock on the warehouse');
  const after = await stateJson(page);
  assert.notEqual(after, before);
  await sendText(page, '/undo');
  assert.equal(await stateJson(page), before, 'deep-equal JSON after /undo');
  assert.equal(await page.locator('#feed .f-input').count(), 1, 'feed rebuilt without the undone turn');
  await sendText(page, '/undo');
  await sendText(page, '/undo');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /nothing to undo/i);
  assert.equal(await page.evaluate(() => Game.state.log.length), 1);
});

s.test('save to a slot, reload, load the slot: state identical', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, 'I walk around the stalls');
  await page.click('#tb-save');
  await page.fill('#save-name', 'Before the docks');
  await page.click('#slot-1 [data-action="save"]');
  await page.waitForFunction(() => document.querySelector('#slot-1 .slot-name').textContent === 'Before the docks');
  const saved = await stateJson(page);
  await page.click('#saves-done');
  await sendText(page, 'I try to steal an apple');
  assert.notEqual(await stateJson(page), saved);

  await page.reload();
  await page.waitForFunction(() => window.Game);
  await page.click('#btn-load');
  assert.match(await page.textContent('#slot-1'), /Before the docks/);
  await page.click('#slot-1 [data-action="load"]');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(page), saved);
  assert.equal(await page.locator('#feed .f-input').count(), 1);
  // The autosave now holds the loaded state; Continue brings it back after a reload.
  await page.reload();
  await page.waitForFunction(() => window.Game);
  assert.ok(await page.isEnabled('#btn-continue'));
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(page), saved);
});

s.test('/save <name> and /load <name> use the named slots', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page);
  await sendText(page, '/save Alpha');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /slot 1 as "Alpha"/);
  const alpha = await stateJson(page);
  await sendText(page, 'I wait a while');
  await sendText(page, '/save Beta');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /slot 2 as "Beta"/);
  await sendText(page, '/load alpha');
  assert.equal(await stateJson(page), alpha);
  await sendText(page, '/load nothing-here');
  assert.match(await page.textContent('#feed .f-notice:last-child'), /no save called/i);
});

s.test('export is a JSON download without the API key; import restores the game', async h => {
  const KEY = 'sk-ant-api03-TEST-SECRET-0123456789abcdef';
  const page = await h.open({ viewport: LAPTOP });
  await page.click('#btn-settings');
  await page.fill('#set-key', KEY);
  await page.check('#set-remember');
  await page.click('#settings-done');
  // A key typed in turns the offline demo off; this test plays offline, so it goes back on.
  await page.evaluate(() => Game.Storage.saveSettings({ mockMode: true }));
  await quickStart(page);
  await sendText(page, 'I count my coins');
  const json = await page.evaluate(() => Game.Storage.exportJson());
  assert.ok(!json.includes(KEY), 'key not in export');
  assert.ok(!/apiKey|api_key/i.test(json), 'no key field');
  const env = JSON.parse(json);
  assert.equal(env.kind, 'novatria-save');
  assert.deepEqual(env.state, JSON.parse(await stateJson(page)));
  assert.ok(env.town && Array.isArray(env.town.locations), 'save embeds the town data');

  await page.click('#tb-save');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  assert.match(download.suggestedFilename(), /\.json$/);
  const text = fs.readFileSync(await download.path(), 'utf8');
  assert.ok(!text.includes(KEY));
  assert.deepEqual(JSON.parse(text).state, env.state);
  for (const k of Object.keys(await page.evaluate(() => ({ ...localStorage })))) {
    if (k !== 'novatria.apiKey') assert.ok(!(await page.evaluate(key => localStorage.getItem(key), k)).includes(KEY), 'key only in its own entry');
  }

  // A fresh browser (as on a phone) imports the file and continues from the same point.
  const phone = await h.open({ viewport: PHONE });
  await phone.click('#btn-load');
  await phone.setInputFiles('#import-file', { name: download.suggestedFilename(), mimeType: 'application/json', buffer: Buffer.from(text) });
  await phone.waitForSelector('#screen-game.active');
  assert.equal(await stateJson(phone), JSON.stringify(env.state));
  await sendText(phone, 'I keep going');
  assert.equal(await phone.evaluate(() => Game.state.meta.turn), env.state.meta.turn + 1);
  // A file that is not a save is refused with a visible message.
  await phone.click('#tb-menu');
  await phone.click('[data-menu="saves"]');
  await phone.setInputFiles('#import-file', { name: 'not-a-save.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') });
  await phone.waitForFunction(() => document.getElementById('saves-error').textContent.length > 0);
  assert.match(await phone.textContent('#saves-error'), /not a saved game/);
});

s.test('API key is kept in sessionStorage unless "Remember" is ticked', async h => {
  const page = await h.open();
  await page.click('#btn-settings');
  await page.fill('#set-key', 'sk-ant-session-only');
  const where = () => page.evaluate(() => ({ local: localStorage.getItem('novatria.apiKey'), session: sessionStorage.getItem('novatria.apiKey'), settings: localStorage.getItem('novatria.settings') }));
  let w = await where();
  assert.equal(w.local, null);
  assert.equal(w.session, 'sk-ant-session-only');
  await page.check('#set-remember');
  w = await where();
  assert.equal(w.local, 'sk-ant-session-only');
  assert.equal(w.session, null);
  assert.ok(!w.settings.includes('sk-ant'), 'settings never hold the key');
  await page.reload();
  await page.waitForFunction(() => window.Game);
  assert.equal(await page.evaluate(() => Game.Storage.getApiKey()), 'sk-ant-session-only');
  await page.click('#btn-settings');
  assert.equal(await page.inputValue('#set-key'), 'sk-ant-session-only');
  await page.uncheck('#set-remember');
  w = await where();
  assert.equal(w.local, null);
  assert.equal(w.session, 'sk-ant-session-only');
});

s.test('settings screen has every field with the documented defaults', async h => {
  const page = await h.open();
  await page.click('#btn-settings');
  assert.equal(await page.inputValue('#set-narrator-model'), 'claude-opus-5-5');
  assert.equal(await page.inputValue('#set-parser-model'), 'claude-sonnet-5-5');
  for (const role of ['narrator', 'parser', 'bookkeeper', 'chronicle']) {
    assert.equal(await page.inputValue(`#set-effort-${role}`), { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' }[role], role + ' effort');
    assert.deepEqual(await page.$$eval(`#set-effort-${role} option`, o => o.map(x => x.value)), ['low', 'medium', 'high']);
  }
  assert.ok(await page.isChecked('#set-rolls'));
  assert.ok(!(await page.isChecked('#set-permadeath')));
  assert.ok(await page.isChecked('#set-mock'));
  assert.ok(!(await page.isChecked('#set-remember')));
  assert.ok(await page.isChecked('input[name="set-size"][value="M"]'));
  assert.ok(await page.isChecked('input[name="set-style"][value="casual"]'), 'Narration style: casual by default');
  assert.ok(!(await page.isChecked('input[name="set-style"][value="literary"]')));
  // The models and effort sit under Advanced, below the Quality presets (Standard is the defaults).
  assert.ok(await page.isChecked('input[name="set-preset"][value="standard"]'));
  await page.click('#set-advanced > summary');
  await page.selectOption('#set-effort-narrator', 'high');
  await page.fill('#set-parser-model', 'claude-opus-5-5');
  await page.press('#set-parser-model', 'Tab');
  await page.check('#set-permadeath');
  await page.reload();
  await page.waitForFunction(() => window.Game);
  const st = await page.evaluate(() => Game.Storage.settings());
  assert.equal(st.effort.narrator, 'high');
  assert.equal(st.parserModel, 'claude-opus-5-5');
  assert.equal(st.permadeath, true);
});

s.test('with mock mode off the turn fails cleanly and keeps the typed input', async h => {
  const page = await h.open();
  await quickStart(page);
  await page.evaluate(() => Game.Storage.saveSettings({ mockMode: false }));
  const before = await stateJson(page);
  await sendText(page, 'I ask the ferryman for the fare');
  assert.equal(await page.inputValue('#cmd'), 'I ask the ferryman for the fare');
  assert.ok(await page.isVisible('#feed .f-notice.error'));
  assert.equal(await stateJson(page), before, 'state untouched after a failed turn');
  assert.equal(await page.evaluate(() => Game.State.undoDepth()), 0, 'failed turn left no snapshot');
});

s.test('a storage failure shows a visible warning', async h => {
  const page = await h.open();
  await quickStart(page);
  assert.ok(await page.isHidden('#banner'));
  await page.evaluate(() => { window.Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await sendText(page, 'I look around');
  assert.ok(await page.isVisible('#banner'));
  assert.match(await page.textContent('#banner-text'), /Saving failed/);
  assert.equal(await page.evaluate(() => Game.state.log.length), 2, 'the game carries on');
});

s.test('auto-scroll sticks to the newest text; "↓ New" appears when scrolled up', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page);
  await page.evaluate(() => { for (let i = 0; i < 40; i++) Game.UI.feed.notice('Filler line ' + i); });
  const atBottom = () => page.evaluate(() => { const f = document.getElementById('feed-scroll'); return f.scrollHeight - f.scrollTop - f.clientHeight < 2; });
  assert.ok(await atBottom());
  assert.ok(await page.isHidden('#new-btn'));
  await page.evaluate(() => { const f = document.getElementById('feed-scroll'); f.scrollTop = 0; f.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => Game.UI.feed.notice('Something new'));
  assert.ok(await page.isVisible('#new-btn'));
  assert.equal(await page.textContent('#new-btn'), '↓ New');
  assert.ok(!(await atBottom()), 'did not yank the reader down');
  await page.click('#new-btn');
  assert.ok(await atBottom());
  assert.ok(await page.isHidden('#new-btn'));
});

s.test('player text is rendered as text, never as markup', async h => {
  const page = await h.open();
  await quickStart(page, { name: '<img src=x onerror="window.__pwned=1">' });
  await sendText(page, '<b>bold</b><script>window.__pwned=2</script>');
  const r = await page.evaluate(() => ({ pwned: window.__pwned, imgs: document.querySelectorAll('#app img').length, b: document.querySelectorAll('#feed b').length, input: document.querySelector('#feed .f-input').textContent }));
  assert.equal(r.pwned, undefined);
  assert.equal(r.imgs, 0);
  assert.equal(r.b, 0);
  assert.equal(r.input, '<b>bold</b><script>window.__pwned=2</script>');
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/\.innerHTML\s*=/.test(src) && !/insertAdjacentHTML/.test(src), 'no innerHTML writes in index.html');
  assert.ok(/'use strict'/.test(src));
});

/* ----- People tab: person cards ----- */
const ATT_LEVEL = { hostile: 1, cold: 1, wary: 2, neutral: 3, friendly: 4, warm: 5, loyal: 5 };
const initialsOf = text => {
  const w = String(text).split(/\s+/).map(x => x.replace(/[^\p{L}\p{N}]/gu, '')).filter(x => x && !/^(the|a|an|and|of|at|in|on|for|from|with|to|jr|sr|ii|iii|iv)$/i.test(x));
  return (w.length > 1 ? [w[0], w[w.length - 1]] : w).map(x => x.charAt(0).toUpperCase()).join('');
};
/* A scene with three people present the player has never dealt with: a (to be
   introduced), b (left a stranger) and c (a stranger who remembers the
   player). Puts the player there and returns the ids. */
async function peopleScene(page) {
  const sc = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const fresh = n => !n.knownToPlayer && !n.memories.length && n.status === 'free';
    for (const l of st.locations) for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      if (l.closed) continue;
      const here = G.State.npcsAt(l.id, ph).filter(fresh);
      if (here.length >= 3) return { loc: l.id, phase: ph, a: here[0].id, b: here[1].id, c: here[2].id };
    }
    return null;
  });
  assert.ok(sc, 'a scene with three people the player has not met');
  await page.evaluate(x => {
    const G = Game;
    G.Api.Mock.delay = 0;
    while (G.state.time.phase !== x.phase) G.State.apply({ advanceTime: 'long' });
    G.State.apply({ playerLocationId: x.loc, npcKnownToPlayer: [x.a], newMemories: [{ npcId: x.c, text: `${G.state.player.name} asked them for directions`, weight: 1 }] });
  }, sc);
  return sc;
}
const cardInfo = (page, id) => page.evaluate(id => {
  const c = document.querySelector(`#panel-body .pcard[data-npc="${id}"]`);
  if (!c) return null;
  const head = c.querySelector('.pcard-head');
  const more = c.querySelector('.pcard-more');
  return {
    group: c.closest('.people-group').dataset.group,
    stranger: c.classList.contains('stranger'),
    mono: c.querySelector('.mono').textContent,
    monoBg: getComputedStyle(c.querySelector('.mono')).backgroundColor,
    name: c.querySelector('.pcard-name').textContent,
    role: (c.querySelector('.pcard-role') || {}).textContent || '',
    word: c.querySelector('.att-word').textContent,
    att: c.querySelector('.att').dataset.att,
    on: c.querySelectorAll('.att-meter i.on').length,
    segs: c.querySelectorAll('.att-meter i').length,
    where: (c.querySelector('.pcard-where') || {}).textContent || null,
    expanded: head.getAttribute('aria-expanded'),
    controls: head.getAttribute('aria-controls') === more.id,
    moreVisible: !more.hidden && more.getBoundingClientRect().height > 0,
    look: (c.querySelector('.pcard-look') || {}).textContent || null,
    notes: [...c.querySelectorAll('.pcard-notes li')].map(li => li.textContent),
    text: c.innerText,
    all: c.textContent
  };
}, id);

s.test('People: cards for the people met, with monogram, name, role and attitude; strangers by their label; Here now is exactly who is here; no hidden fields', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'enemy', 'promise'] });
  const sc = await peopleScene(page);
  await page.click('#tab-people');
  const st = await page.evaluate(() => Game.state);
  const npc = id => st.npcs.find(n => n.id === id);
  const present = await page.evaluate(() => Game.State.npcsAt(Game.state.player.locationId).map(n => n.id));
  const met = n => n.knownToPlayer || n.memories.length > 0;
  // Groups: Here now is the people present whom the player has met, in scene order; Known is everyone else met.
  const groups = await page.evaluate(() => [...document.querySelectorAll('#panel-body .people-group')].map(g => ({ key: g.dataset.group, title: g.querySelector('h3').firstChild.textContent, ids: [...g.querySelectorAll('.pcard')].map(c => c.dataset.npc) })));
  assert.deepEqual(groups.map(g => g.key), ['here', 'known']);
  assert.deepEqual(groups.map(g => g.title), ['Here now', 'Known']);
  assert.deepEqual(groups[0].ids, present.filter(id => met(npc(id))), 'Here now: exactly the people here the player has met');
  assert.ok(groups[0].ids.includes(sc.a) && groups[0].ids.includes(sc.c) && !groups[0].ids.includes(sc.b));
  assert.deepEqual(groups[1].ids.slice().sort(), st.npcs.filter(n => met(n) && !present.includes(n.id)).map(n => n.id).sort(), 'Known: everyone else met');
  assert.equal(await cardInfo(page, sc.b), null, 'a stranger the player never dealt with is not listed');
  // A known person: monogram, name, role, attitude word and a meter that matches it.
  const a = await cardInfo(page, sc.a);
  const na = npc(sc.a);
  assert.equal(a.name, na.name);
  assert.equal(a.mono, initialsOf(na.name));
  // The role, then who they are to someone in the cast's own family ("Darlene's husband"), when there is such a tie.
  const note = await page.evaluate(id => Game.State.relationNote(Game.State.npc(id)), sc.a);
  assert.equal(a.role, na.role.charAt(0).toUpperCase() + na.role.slice(1) + (note ? ` · ${note}` : ''));
  assert.equal(a.word, await page.evaluate(v => Game.State.attitudeWord(v), na.attitude));
  assert.deepEqual([a.on, a.segs], [ATT_LEVEL[a.word], 5]);
  assert.equal(a.where, 'Here now');
  assert.equal(a.expanded, 'false');
  assert.ok(a.controls && !a.moreVisible, 'collapsed by default');
  assert.ok(!a.stranger);
  assert.notEqual(a.monoBg, 'rgba(0, 0, 0, 0)', 'the monogram has a colour');
  // A stranger who remembers the player: their label, never their name.
  const c = await cardInfo(page, sc.c);
  const label = await page.evaluate(id => Game.npcLabel(Game.State.npc(id)), sc.c);
  assert.ok(c.stranger);
  assert.equal(c.name, label);
  assert.notEqual(label, npc(sc.c).name);
  assert.ok(!c.all.includes(npc(sc.c).name), 'the stranger\'s name is not shown');
  assert.equal(c.mono, initialsOf(label));
  assert.ok(c.notes.includes('Remembers: you asked them for directions, Day 1'), c.notes.join(' | '));
  // The monogram colour comes from the id: the same person gets the same colour after a reload.
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.click('#tab-people');
  assert.equal((await cardInfo(page, sc.a)).monoBg, a.monoBg, 'same colour after a reload');
  // Every attitude word fills its share of the five segments.
  for (const v of [-80, -40, -10, 0, 10, 40, 80]) {
    await page.evaluate(([id, v]) => Game.State.apply({ effects: [{ op: 'attitudeDelta', npcId: id, delta: v - Game.State.npc(id).attitude }] }), [sc.a, v]);
    const x = await cardInfo(page, sc.a);
    const word = await page.evaluate(v => Game.State.attitudeWord(v), v);
    assert.deepEqual([x.word, x.att, x.on, x.segs], [word, word, ATT_LEVEL[word], 5], 'attitude ' + v);
  }
  // Nothing hidden, in the visible text or in the closed cards.
  const all = await page.evaluate(() => { Game.UI.renderPanel(); return document.getElementById('panel-body').textContent; });
  const now = await page.evaluate(() => Game.state);
  for (const n of now.npcs) {
    if (n.secret) assert.ok(!all.includes(n.secret), 'secret leaked: ' + n.id);
    if (n.goal) assert.ok(!all.includes(n.goal), 'goal leaked: ' + n.id);
  }
  for (const r of now.rumours.filter(x => !x.heard)) assert.ok(!all.includes(r.text), 'unheard rumour leaked: ' + r.id);
  for (const sd of now.seeds) assert.ok(!all.includes(sd.effect) && !all.includes(sd.cause), 'seed leaked: ' + sd.id);
  for (const f of now.factions) assert.ok(!all.includes(f.id) && !all.includes(f.goal), 'faction leaked: ' + f.id);
  // The loose end shows on its person's card.
  const le = now.player.looseEnds.find(x => x.kind === 'debt');
  const leCard = await cardInfo(page, le.npcId);
  assert.ok(leCard.notes.includes(`${le.label}: ${le.text}`), leCard.notes.join(' | '));
});

s.test('People: a card opens on tap with its look and notes, stays open across a turn, and shows where someone was last seen', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await quickStart(page, { kinds: ['debt', 'enemy', 'promise'] });
  const sc = await peopleScene(page);
  await page.click('#tab-people');
  const na = await page.evaluate(id => Game.State.npc(id), sc.a);
  const head = id => `#panel-body .pcard[data-npc="${id}"] .pcard-head`;
  await page.click(head(sc.a));
  let a = await cardInfo(page, sc.a);
  assert.equal(a.expanded, 'true');
  assert.ok(a.moreVisible && a.look === na.look && a.text.includes(na.look), 'the look shows when open');
  assert.equal(await page.evaluate(() => Game.UI.openPerson), sc.a);
  await page.click(head(sc.a));
  a = await cardInfo(page, sc.a);
  assert.equal(a.expanded, 'false');
  assert.ok(!a.moreVisible && !a.text.includes(na.look), 'closed again');
  // One card open at a time.
  await page.click(head(sc.a));
  await page.click(head(sc.c));
  assert.deepEqual([(await cardInfo(page, sc.a)).expanded, (await cardInfo(page, sc.c)).expanded], ['false', 'true']);
  await page.click(head(sc.a));
  // A turn re-renders the panel; the open card stays open.
  await page.evaluate(() => { for (const c of document.querySelectorAll('#panel-body .pcard')) c.__old = true; });
  await sendText(page, `I insult ${na.name}.`);
  assert.equal(await page.evaluate(id => !!document.querySelector(`#panel-body .pcard[data-npc="${id}"]`).__old, sc.a), false, 'the panel was rendered again');
  a = await cardInfo(page, sc.a);
  assert.equal(a.expanded, 'true', 'still open after the turn');
  assert.ok(a.moreVisible && a.look === na.look);
  // The mock bookkeeper writes memories the way MEMORY_RULES asks: from their side ("insulted me").
  assert.ok(a.notes.some(t => /^Remembers: insulted me, Day \d+$/.test(t)), a.notes.join(' | '));
  assert.ok(!a.notes.some(t => /Loose end with/.test(t)));
  // Leave: a is now Known, last seen here; most recently seen first; someone never seen has no location line.
  const scene = await page.evaluate(a => { const l = Game.State.loc(Game.state.player.locationId); return { id: l.id, name: l.name, exit: l.exits.map(id => Game.State.loc(id)).find(x => !x.closed && !Game.State.npcsAt(x.id).some(n => n.id === a)) }; }, sc.a);
  assert.ok(scene.exit, 'an open place next door without them');
  await page.evaluate(id => Game.State.apply({ playerLocationId: id, logEntry: { input: '', roll: null, narration: 'You step next door.' } }), scene.exit.id);
  const seen = await page.evaluate(id => Game.state.seen[id], sc.a);
  assert.equal(seen.locationId, scene.id);
  a = await cardInfo(page, sc.a);
  assert.equal(a.group, 'known');
  assert.equal(a.where, `Last seen: ${scene.name}, Day ${seen.day} · ${seen.phase.charAt(0).toUpperCase() + seen.phase.slice(1)}`);
  assert.equal(a.expanded, 'true', 'still open after moving groups');
  const known = await page.evaluate(() => [...document.querySelectorAll('#panel-body [data-group="known"] .pcard')].map(c => ({ id: c.dataset.npc, turn: (Game.state.seen[c.dataset.npc] || { turn: -1 }).turn, where: !!c.querySelector('.pcard-where') })));
  for (let i = 1; i < known.length; i++) assert.ok(known[i - 1].turn >= known[i].turn, 'Known is ordered by the most recent sighting');
  for (const k of known) assert.equal(k.where, k.turn >= 0, 'a location line only for someone seen: ' + k.id);
  // A loose end's person the player has not run into yet (the cast places them in town, maybe not where the player has been).
  const unseen = await page.evaluate(() => Game.state.player.looseEnds.map(x => x.npcId).find(id => !Game.state.seen[id]));
  assert.ok(unseen, 'someone from a loose end not seen yet');
  assert.equal((await cardInfo(page, unseen)).where, null, 'someone never seen has no location line');
  // The keyboard works too: Enter on a focused header toggles it.
  await page.focus(head(sc.c));
  await page.keyboard.press('Enter');
  assert.equal((await cardInfo(page, sc.c)).expanded, 'true');
  assert.equal((await cardInfo(page, sc.a)).expanded, 'false');
  // Open cards live in memory only: after a reload every card starts closed.
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  await page.click('#tab-people');
  assert.equal(await page.evaluate(() => Game.UI.openPerson), null);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#panel-body .pcard-head')].filter(b => b.getAttribute('aria-expanded') !== 'false').length), 0);
});

s.test('People at 375: the sheet\'s cards have 40px monograms and 44px headers, open in place, and nothing scrolls sideways', async h => {
  const page = await h.open({ viewport: PHONE });
  await quickStart(page, { kinds: ['debt', 'enemy', 'promise'] });
  const sc = await peopleScene(page);
  await sendText(page, 'I ask everyone here what the trouble with the bridge is, and whether anybody is hiring this week.');
  await page.click('[data-open-tab="people"]');
  await page.waitForTimeout(320);
  const measure = () => page.evaluate(() => [...document.querySelectorAll('#panel-body .pcard')].map(c => {
    const h = c.querySelector('.pcard-head').getBoundingClientRect();
    const m = c.querySelector('.mono').getBoundingClientRect();
    return { id: c.dataset.npc, h: h.height, w: h.width, left: h.left, right: h.right, mono: [m.width, m.height] };
  }));
  const cards = await measure();
  assert.ok(cards.length >= 2, 'cards in the sheet');
  for (const c of cards) {
    assert.ok(c.h >= 44, 'header at least 44px tall: ' + c.h);
    assert.deepEqual(c.mono, [40, 40], 'monogram 40px');
    assert.ok(c.left >= 0 && c.right <= 375, 'inside the screen');
  }
  assert.deepEqual(await overflowReport(page, 375), [], 'sheet: people');
  await page.click(`#panel-body .pcard[data-npc="${sc.a}"] .pcard-head`);
  assert.equal((await cardInfo(page, sc.a)).expanded, 'true');
  assert.ok((await cardInfo(page, sc.a)).moreVisible);
  assert.deepEqual(await overflowReport(page, 375), [], 'sheet: people, a card open');
  assert.equal(await page.evaluate(() => document.getElementById('panel-body').scrollWidth <= document.getElementById('panel-body').clientWidth), true);
});

s.run();
