'use strict';
/* Wave 37, Creator Mode, milestone 5 (task M5-C1): the World tab's Places,
   People and Schedules (plan decision H, "entity list and detail at
   390 px"; decision L for the look). Pack.idFor slugs a name into an id once
   (npc_ and the first name, loc_ and the name without "The", _2 on a
   collision) and Pack.renameId rewrites every reference to an id in a copy
   of the pack, counting them; Creator.EntityTab is the list-and-detail
   (rows with a circled initial, the name, the id and an error badge; Add
   with an inline name field; the detail in the list's place on a phone);
   exits are written both ways; a relation offers its reverse ("wife" ->
   "husband"); Delete asks with the reference count and leaves the
   references for the validator; the Schedules grid writes
   npcIdsBySchedule. The details and the grid pass the mobile audit at 375
   and 390, and screenshots of the People list, a person and the grid at
   390x844 and 1280x800 in the Dark and Parchment themes go to $UI_SHOTS
   when it names a folder.
   Run with: node tests/run.cjs wave37-editor-world */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('wave37-editor-world');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
/* A draft opened in the editor straight from Storage.Drafts: a blank story, or a copy of the built-in one. */
async function openDraft(page, kind) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  const id = await page.evaluate(k => {
    let p;
    if (k === 'copy') { p = Game.Pack.copy(Game.Pack.builtIn()); p.meta.id = 'harbour-copy'; p.meta.title = 'Harbour Copy'; } else p = Game.Pack.blank('Feed Store Nights');
    const dr = Game.Storage.Drafts.put({ pack: p });
    Game.Creator.openEditor(dr.id);
    return dr.id;
  }, kind || 'blank');
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  return id;
}
async function worldTab(page, sub) {
  await page.click('#creator-tab-world');
  await page.click(`#cr-world-${sub}`);
  await page.waitForSelector(`#cr-world-body[data-sub="${sub}"]`);
}
/* Add a record through the list's Add button and the inline name field; the detail opens on it. */
async function addThrough(page, key, name) {
  await page.click(`.cr-entity[data-entity="${key}"] [data-action="add"]`);
  await page.fill(`#cr-add-${key}`, name);
  await page.click(`.cr-entity[data-entity="${key}"] [data-action="add-confirm"]`);
  await page.waitForSelector(`.cr-entity[data-entity="${key}"][data-open="1"]`);
  return page.evaluate(k => Game.Creator.WorldTab[k].view.open, key);
}
const draft = page => page.evaluate(() => Game.Creator.state.draft);
const checkNow = page => page.evaluate(() => Game.Creator.Editor.check().map(p => ({ path: p.path, rule: p.rule, severity: p.severity, message: p.message })));
const subCount = (page, sub) => page.$eval(`#cr-world-${sub} .cr-badge`, b => (b.hidden ? 0 : Number(b.textContent)));

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider
   than the screen (a strip or grid that scrolls sideways on purpose is scrolled, not wide). */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  const small = [...document.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...document.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${x[0]} ${x[1]}px`);
  const scrolledInside = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'auto' && ox !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      if (pr.left >= -1 && pr.right <= W + 1) return true;
    }
    return false;
  };
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !scrolledInside(el)) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
  }
  for (const el of document.querySelectorAll('.page')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) wide.push('scrolls sideways: ' + (el.id || el.className));
  if (document.documentElement.scrollWidth > W) wide.push('document ' + document.documentElement.scrollWidth);
  return { label, small, fonts, wide: wide.slice(0, 10) };
}

s.test('Pack.idFor slugs a name once: "Loretta Gaddis" is npc_loretta, "The Low Water" loc_low_water, "Lockett\'s Ferry" loc_locketts_ferry, the other kinds take their prefixes, and a collision takes _2 then _3', async h => {
  const page = await open(h);
  const got = await page.evaluate(() => {
    const f = Game.Pack.idFor;
    return {
      loretta: f('npc', 'Loretta Gaddis', []),
      lowWater: f('loc', 'The Low Water', []),
      ferry: f('loc', "Lockett's Ferry", []),
      theatre: f('loc', 'Theatre Row', []),
      kinds: [f('fac', 'The Ferry Board'), f('thread', 'Who Burned the Mill'), f('seed', 'Storm Warning'), f('rumour', 'Bad Money'), f('event', 'Fish Fry'), f('background', 'Drifter')],
      two: f('npc', 'Loretta Smith', ['npc_loretta']),
      three: f('npc', 'Loretta Jones', ['npc_loretta', 'npc_loretta_2']),
      accents: f('npc', 'Zoë Ávila', []),
      empty: f('loc', '   ', []),
      setOk: f('loc', 'The Low Water', new Set(['loc_low_water']))
    };
  });
  assert.equal(got.loretta, 'npc_loretta');
  assert.equal(got.lowWater, 'loc_low_water');
  assert.equal(got.ferry, 'loc_locketts_ferry', 'an apostrophe goes, it does not split the word');
  assert.equal(got.theatre, 'loc_theatre_row', 'only a leading "The" word goes');
  assert.deepEqual(got.kinds, ['fac_the_ferry_board', 'thr_who_burned_the_mill', 'seed_storm_warning', 'rum_bad_money', 'evt_fish_fry', 'bg_drifter'], 'only a place drops its "The"');
  assert.equal(got.two, 'npc_loretta_2');
  assert.equal(got.three, 'npc_loretta_3');
  assert.equal(got.accents, 'npc_zoe', 'ASCII letters only');
  assert.equal(got.empty, 'loc_new');
  assert.equal(got.setOk, 'loc_low_water_2');
});

s.test('Pack.renameId on a copy of the built-in pack renames npc_royce to npc_roy everywhere: the count matches the JSON\'s "npc_royce" strings (keys too), none is left, the validator finds nothing dangling, and the built-in pack is untouched', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const b = P.builtIn();
    const text = P.format(b);
    const before = (text.match(/"npc_royce"/g) || []).length;
    const out = P.renameId(b, 'npc_royce', 'npc_roy');
    const after = P.format(out.pack);
    const errs = P.errors(P.validate(out.pack, { profile: 'strict' }));
    const royce = out.pack.world.npcs.find(n => n.name === 'Royce Pittman');
    const scan = P.renameId(b, 'npc_royce', 'npc_royce');
    return {
      before, count: out.count, left: (after.match(/"npc_royce"/g) || []).length, now: (after.match(/"npc_roy"/g) || []).length,
      errs: errs.map(p => `${p.path}: ${p.message}`), id: royce.id, frozen: Object.isFrozen(b), stillRoyce: b.world.npcs.some(n => n.id === 'npc_royce'),
      relAtLeast: JSON.stringify(out.pack).includes('"relAtLeast":{"npc_roy":'), sameScan: scan.count, sameText: P.format(scan.pack) === text,
      words: (after.match(/npc_royce/g) || []).length, bad: P.renameId(b, '', 'x').count
    };
  });
  assert.ok(r.before > 40, `Royce is named in many places (${r.before})`);
  assert.equal(r.count, r.before, 'every rewrite counted, as many as a grep finds');
  assert.equal(r.left, 0);
  assert.equal(r.words, 0, 'the id is in no text either (Low Water writes names, not ids, in its prose)');
  assert.equal(r.now, r.before);
  assert.deepEqual(r.errs, [], 'no dangling reference: the renamed pack validates strict');
  assert.equal(r.id, 'npc_roy');
  assert.ok(r.relAtLeast, 'a key equal to the id (relAtLeast) is renamed in place');
  assert.ok(r.frozen && r.stillRoyce, 'the built-in pack is never changed: renameId works on a copy');
  assert.equal(r.sameScan, r.before, 'renaming to itself is the reference count (Delete\'s)');
  assert.ok(r.sameText);
  assert.equal(r.bad, 0);
});

s.test('renameId keeps a clock trigger\'s number and leaves text and {placeholders} alone', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const p = {
      world: {
        factions: [{ id: 'fac_mill', relations: { fac_mill: 0, fac_other: 5 } }],
        seeds: [{ id: 'seed_a', trigger: { type: 'clock', value: 'fac_mill:3' }, effects: [{ op: 'clockTick', factionId: 'fac_mill' }], cause: 'fac_mill is named in text; so is {fac_mill}.' }]
      }
    };
    const out = Game.Pack.renameId(p, 'fac_mill', 'fac_millworks');
    return { out: out.pack, count: out.count, orig: p.world.seeds[0].trigger.value };
  });
  assert.equal(r.count, 4);
  assert.equal(r.out.world.factions[0].id, 'fac_millworks');
  assert.deepEqual(Object.keys(r.out.world.factions[0].relations), ['fac_millworks', 'fac_other'], 'the key renamed where it stood');
  assert.equal(r.out.world.seeds[0].trigger.value, 'fac_millworks:3');
  assert.equal(r.out.world.seeds[0].effects[0].factionId, 'fac_millworks');
  assert.equal(r.out.world.seeds[0].cause, 'fac_mill is named in text; so is {fac_mill}.');
  assert.equal(r.orig, 'fac_mill:3', 'the pack given is not changed');
});

s.test('the World tab: its strip (Places, People, Schedules) with error badges; a person\'s list rows show the initial, name, id and summary in the authored order with data-id; a search past eight rows; a renamed person keeps their id while the header and the row follow the new name', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await page.click('#creator-tab-world');
  assert.deepEqual(await page.$$eval('#creator-body .cr-subtab', bs => bs.map(b => [b.id, b.firstChild.textContent, b.getAttribute('aria-selected')])),
    [['cr-world-places', 'Places', 'true'], ['cr-world-people', 'People', 'false'], ['cr-world-schedules', 'Schedules', 'false'],
      // Task M5-C2: the story lists follow, added through WorldTab.addSub.
      ['cr-world-factions', 'Factions and Clocks', 'false'], ['cr-world-threads', 'Threads', 'false'], ['cr-world-rumours', 'Rumours', 'false'],
      ['cr-world-story', 'Events and Seeds', 'false'], ['cr-world-goods', 'Goods', 'false']]);
  await worldTab(page, 'people');
  const rows = await page.$$eval('.cr-entity[data-entity="people"] .cr-row', rs => rs.map(r => ({ id: r.dataset.id, ini: r.querySelector('.cr-initial').textContent, name: r.querySelector('.cr-row-name').textContent, rid: r.querySelector('.cr-row-id').textContent, sum: r.querySelector('.cr-row-sum').textContent })));
  const want = await page.evaluate(() => Game.Creator.state.draft.world.npcs.map(n => n.id));
  assert.deepEqual(rows.map(r => r.id), want, 'the authored order');
  const royce = rows.find(r => r.id === 'npc_royce');
  assert.deepEqual(royce, { id: 'npc_royce', ini: 'R', name: 'Royce Pittman', rid: 'npc_royce', sum: "owner of Pittman's Gas and Service and the swing vote on the town council · 56 · he" });
  // A search field past eight rows narrows the list by name or id.
  await page.fill('#cr-find-people', 'pittman');
  const shown = await page.$$eval('.cr-entity[data-entity="people"] .cr-row', rs => rs.filter(r => !r.hidden && getComputedStyle(r).display !== 'none').map(r => r.dataset.id));
  assert.ok(shown.includes('npc_royce') && shown.length < rows.length, JSON.stringify(shown));
  await page.fill('#cr-find-people', '');
  // Open Royce: the list makes way on a laptop? No: from 900px it stays on the left at 320px and the detail fills the right.
  await page.click('.cr-row[data-id="npc_royce"]');
  await page.waitForSelector('.cr-entity[data-entity="people"][data-open="1"]');
  const layout = await page.evaluate(() => {
    const list = document.querySelector('.cr-entity-list').getBoundingClientRect();
    const det = document.querySelector('.cr-entity-detail').getBoundingClientRect();
    return { list: Math.round(list.width), right: det.left > list.right, focus: document.activeElement.id, title: document.querySelector('.cr-detail-title').textContent, current: document.querySelector('.cr-row[aria-current="true"]').dataset.id };
  });
  assert.deepEqual(layout, { list: 320, right: true, focus: 'cr-detail-people', title: 'Royce Pittman', current: 'npc_royce' });
  const i = want.indexOf('npc_royce');
  await page.fill(`[data-path="world.npcs[${i}].name"]`, 'Roy Pittman');
  await page.waitForFunction(() => document.querySelector('.cr-detail-title').textContent === 'Roy Pittman');
  const after = await page.evaluate(n => ({ rec: Game.Creator.state.draft.world.npcs[n], row: document.querySelector('.cr-row[data-id="npc_royce"] .cr-row-name').textContent }), i);
  assert.equal(after.rec.id, 'npc_royce', 'the id was made once and never changes on a rename');
  assert.equal(after.rec.name, 'Roy Pittman');
  assert.equal(after.row, 'Roy Pittman');
  // Change id… is the one way an id changes: every reference with it, one Undo.
  await page.click('.cr-entity-detail [data-action="rename"]');
  await page.fill('#cr-rename-people', 'npc_roy');
  await page.click('[data-action="rename-confirm"]');
  await page.waitForSelector('.cr-row[data-id="npc_roy"]');
  const ren = await page.evaluate(() => ({ left: (Game.Pack.format(Game.Creator.state.draft).match(/"npc_royce"/g) || []).length, open: Game.Creator.WorldTab.people.view.open, toast: document.getElementById('toast').textContent }));
  assert.deepEqual([ren.left, ren.open], [0, 'npc_roy']);
  assert.match(ren.toast, /^Changed npc_royce to npc_roy in \d+ places\.$/);
  await page.click('#creator-undo');
  assert.equal(await page.evaluate(() => Game.Creator.state.draft.world.npcs.some(n => n.id === 'npc_royce')), true, 'Undo brings the old id back');
});

s.test('adding a place through the Places tab makes loc_<slug> with four empty phases and an exits problem until an exit is set; adding an exit writes both directions and removing it removes both (one Undo each)', async h => {
  const page = await open(h);
  await openDraft(page, 'blank');
  await worldTab(page, 'places');
  assert.deepEqual(await page.$$eval('.cr-entity[data-entity="places"] .cr-entity-list [data-path]', cs => cs.map(c => c.dataset.path)), ['world.startLocationIds.gate', 'world.startLocationIds.docks'], 'Start places above the list');
  assert.equal(await page.textContent('.cr-entity[data-entity="places"] .cr-entity-list .cr-section-title'), 'Start places');
  const a = await addThrough(page, 'places', 'The Low Water');
  assert.equal(a, 'loc_low_water');
  const rec = (await draft(page)).world.locations[0];
  assert.deepEqual(rec, { id: 'loc_low_water', name: 'The Low Water', type: 'other', description: '', exits: [], npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] }, discovered: true, closed: false });
  assert.equal(await page.inputValue('[data-path="world.locations[0].name"]'), 'The Low Water');
  // Back to the list, then a second place.
  await page.click('.cr-entity-detail [data-action="back"]');
  await page.waitForSelector('.cr-entity[data-entity="places"][data-open="0"]');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'loc_low_water', 'Back puts the focus on the row');
  const b = await addThrough(page, 'places', 'Main Street');
  assert.equal(b, 'loc_main_street');
  let probs = await checkNow(page);
  assert.ok(probs.some(p => p.path === 'world.locations[1].exits' && p.rule === 'engine.location.exit'), JSON.stringify(probs));
  assert.deepEqual(await page.$$eval('.cr-err[data-err-for="world.locations[1].exits"] .cr-err-line', ls => ls.map(l => l.textContent)), ['Exits must be a non-empty array'], 'the problem sits under the Exits picker');
  assert.ok(await subCount(page, 'places') >= 2, 'the Places button counts the errors');
  // Main Street -> The Low Water: both sides.
  await page.selectOption('#cr-f-world-locations-1-exits-add', 'loc_low_water');
  let locs = (await draft(page)).world.locations;
  assert.deepEqual([locs[0].exits, locs[1].exits], [['loc_main_street'], ['loc_low_water']]);
  assert.match(await page.textContent('.cr-field[data-field="world.locations[1].exits"] .cr-note'), /^Exits go both ways/);
  probs = await checkNow(page);
  assert.deepEqual(probs.filter(p => /exits/.test(p.path)), [], 'no exit problem once both have one, written both ways');
  const rowBadge = await page.$eval('.cr-entity[data-entity="places"] .cr-row[data-id="loc_main_street"] .cr-badge', g => (g.hidden ? 0 : Number(g.textContent)));
  assert.equal(rowBadge, 0);
  // Remove it from Main Street: gone from both.
  await page.click('.cr-field[data-field="world.locations[1].exits"] .cr-chip-x');
  locs = (await draft(page)).world.locations;
  assert.deepEqual([locs[0].exits, locs[1].exits], [[], []]);
  await page.click('#creator-undo');
  locs = (await draft(page)).world.locations;
  assert.deepEqual([locs[0].exits, locs[1].exits], [['loc_main_street'], ['loc_low_water']], 'one Undo puts both sides back');
});

s.test('adding a person puts them on no schedule: the schedule problem counts on the People button until the Schedules grid places them in all four phases (by place and by person), after which it is gone', async h => {
  const page = await open(h);
  await openDraft(page, 'blank');
  await worldTab(page, 'places');
  await addThrough(page, 'places', 'The Low Water');
  await page.click('.cr-entity-detail [data-action="back"]');
  await addThrough(page, 'places', 'Main Street');
  await page.selectOption('#cr-f-world-locations-1-exits-add', 'loc_low_water');
  await worldTab(page, 'people');
  const id = await addThrough(page, 'people', 'Ada Quill');
  assert.equal(id, 'npc_ada');
  const rec = (await draft(page)).world.npcs[0];
  assert.deepEqual([rec.pronouns, rec.status, rec.presence, rec.alive, rec.knownToPlayer, rec.attitude, rec.relations, rec.personality], ['they', 'free', 'here', true, false, 0, [], []]);
  await page.selectOption('[data-path="world.npcs[0].home"]', 'loc_main_street');
  let probs = await checkNow(page);
  const sched = probs.filter(p => p.rule === 'engine.npc.schedule');
  assert.deepEqual(sched.map(p => p.path), ['world.npcs[0]']);
  assert.match(sched[0].message, /somewhere in 0 of 4 phases/);
  assert.ok(await subCount(page, 'people') >= 1);
  const peopleBefore = await subCount(page, 'people');
  assert.match(await page.textContent('.cr-err[data-err-for="world.npcs[0]"]'), /Is somewhere in 0 of 4 phases/, 'under the person\'s name in the detail');
  assert.equal(await page.$eval('.cr-row[data-id="npc_ada"] .cr-badge', g => g.textContent), String(peopleBefore));
  // The grid: a place a row, a phase a column.
  await worldTab(page, 'schedules');
  assert.deepEqual(await page.$$eval('.cr-grid-table thead th', ths => ths.map(t => t.textContent)), ['Place', 'Morning', 'Afternoon', 'Evening', 'Night']);
  assert.deepEqual(await page.$$eval('.cr-grid-table tbody th', ths => ths.map(t => t.firstChild.textContent)), ['The Low Water', 'Main Street']);
  for (const p of ['morning', 'afternoon', 'evening']) await page.selectOption(`#cr-sched-${p === 'evening' ? 0 : 1}-${p}`, 'npc_ada');
  let locs = (await draft(page)).world.locations;
  assert.deepEqual(locs.map(l => l.npcIdsBySchedule), [{ morning: [], afternoon: [], evening: ['npc_ada'], night: [] }, { morning: ['npc_ada'], afternoon: ['npc_ada'], evening: [], night: [] }]);
  probs = await checkNow(page);
  assert.match(probs.find(p => p.rule === 'engine.npc.schedule').message, /3 of 4 phases; everyone needs a place in every phase \(missing night\)/);
  // By person: the place per phase as a picker.
  await page.click('.cr-seg [data-mode="person"]');
  assert.deepEqual(await page.$$eval('.cr-grid-table tbody tr', trs => trs.map(t => t.dataset.id)), ['npc_ada']);
  assert.deepEqual(await page.$$eval('.cr-grid-table tbody select', ss => ss.map(x => x.value)), ['loc_main_street', 'loc_main_street', 'loc_low_water', '']);
  assert.equal(await page.$eval('.cr-grid-table td[data-phase="night"]', td => td.dataset.missing), '1');
  await page.selectOption('#cr-who-0-night', 'loc_main_street');
  locs = (await draft(page)).world.locations;
  assert.deepEqual(locs[1].npcIdsBySchedule.night, ['npc_ada']);
  probs = await checkNow(page);
  assert.deepEqual(probs.filter(p => /^world\.npcs/.test(p.path) && p.severity === 'error'), [], 'the person is somewhere every phase and at home in one: no error left (a missing history is a lint)');
  assert.equal(await subCount(page, 'people'), 0, 'the People button has no count');
  // Moving her evening in the By person view takes her out of the old place.
  await page.selectOption('#cr-who-0-evening', 'loc_main_street');
  locs = (await draft(page)).world.locations;
  assert.deepEqual([locs[0].npcIdsBySchedule.evening, locs[1].npcIdsBySchedule.evening], [[], ['npc_ada']]);
  // Back to By place: the chip's x takes her out.
  await page.click('.cr-seg [data-mode="place"]');
  await page.click('.cr-grid-table tr[data-id="loc_main_street"] td[data-phase="night"] .cr-chip-x');
  assert.deepEqual((await draft(page)).world.locations[1].npcIdsBySchedule.night, []);
  assert.equal(await page.textContent('.cr-schedules > .cr-note:last-child'), 'Everyone needs a place in every phase; the validator says who is missing.');
});

s.test('a relation added with "wife" offers the reverse; one tap writes "husband" on the other person and the symmetric-relation rule stops complaining', async h => {
  const page = await open(h);
  await openDraft(page, 'blank');
  await worldTab(page, 'people');
  await addThrough(page, 'people', 'Ada Quill');
  await page.selectOption('[data-path="world.npcs[0].pronouns"]', 'she');
  await page.click('.cr-entity-detail [data-action="back"]');
  await addThrough(page, 'people', 'Bob Quill');
  await page.selectOption('[data-path="world.npcs[1].pronouns"]', 'he');
  // The picker offers only the draft's other people.
  assert.deepEqual(await page.$$eval('#cr-relation-new-who option', os => os.map(o => o.value)), ['', 'npc_ada']);
  await page.selectOption('#cr-relation-new-who', 'npc_ada');
  await page.fill('#cr-relation-new-word', 'wife');
  await page.click('[data-action="relation-add"]');
  assert.deepEqual((await draft(page)).world.npcs[1].relations, [{ npcId: 'npc_ada', relation: 'wife' }]);
  let probs = await checkNow(page);
  assert.ok(probs.some(p => p.rule === 'engine.relation.symmetric' && p.path === 'world.npcs[1].relations[0]'), 'not yet written on both sides');
  const note = await page.$eval('.cr-rel[data-index="0"] .cr-rel-back', n => ({ rev: n.dataset.reverse, text: n.textContent, btn: n.querySelector('button').textContent }));
  assert.equal(note.rev, 'husband');
  assert.equal(note.btn, 'Add the reverse on Ada Quill');
  assert.match(note.text, /Ada Quill does not list Bob Quill back; the reverse is "husband"\./);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'relation-reverse', 'the offer takes the focus');
  await page.click('[data-action="relation-reverse"]');
  const npcs = (await draft(page)).world.npcs;
  assert.deepEqual(npcs[0].relations, [{ npcId: 'npc_bob', relation: 'husband' }]);
  probs = await checkNow(page);
  assert.deepEqual(probs.filter(p => /^engine\.relation/.test(p.rule)), [], 'both sides agree');
  assert.equal(await page.$('.cr-rel-back'), null, 'the offer goes once it is written');
  // The reverse word follows the pronouns of the one it names, and a word with none is its own.
  const words = await page.evaluate(() => { const r = Game.Creator.WorldTab.reverseWord; return [r('wife', 'he'), r('wife', 'they'), r('husband', 'she'), r('son', 'he'), r('daughter', 'she'), r('boss', 'she'), r('tenant', 'she'), r('friend', 'he'), r('ex-wife', 'he')]; });
  assert.deepEqual(words, ['husband', 'spouse', 'wife', 'father', 'mother', 'employee', 'landlady', 'friend', 'ex-husband']);
  // Removing a relation row.
  await page.click('.cr-rel[data-index="0"] .cr-chip-x');
  assert.deepEqual((await draft(page)).world.npcs[1].relations, []);
});

s.test('Delete asks, naming the person and the count of references the validator would break; Keep it keeps them; Delete removes them and leaves the references for the validator to show, not silently rewritten', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await worldTab(page, 'people');
  const refs = await page.evaluate(() => Game.Pack.renameId(Game.Creator.state.draft, 'npc_royce', 'npc_royce').count - 1);
  assert.ok(refs > 40);
  await page.click('.cr-row[data-id="npc_royce"]');
  await page.click('.cr-entity-detail [data-action="delete"]');
  await page.waitForSelector('#ask[open]');
  assert.equal(await page.textContent('#ask-title'), 'Delete Royce Pittman?');
  assert.equal(await page.textContent('#ask-text'), `Royce Pittman (npc_royce) goes from the story. ${refs} other places in the story name npc_royce; they are left as they are, and Problems lists each one for you to mend. Undo brings it back.`);
  await page.click('#ask-no');
  assert.ok((await draft(page)).world.npcs.some(n => n.id === 'npc_royce'), 'Keep it keeps him');
  await page.click('.cr-entity-detail [data-action="delete"]');
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-yes');
  await page.waitForSelector('.cr-entity[data-entity="people"][data-open="0"]');
  const after = await page.evaluate(() => ({
    gone: !Game.Creator.state.draft.world.npcs.some(n => n.id === 'npc_royce'),
    left: Game.Pack.renameId(Game.Creator.state.draft, 'npc_royce', 'npc_royce').count,
    row: !!document.querySelector('.cr-row[data-id="npc_royce"]')
  }));
  assert.deepEqual(after, { gone: true, left: refs, row: false });
  const probs = await checkNow(page);
  assert.ok(probs.filter(p => p.severity === 'error' && /npc_royce/.test(p.message)).length >= 5, 'the dangling references are the validator\'s problems to show');
  assert.match(await page.textContent('#toast'), /^Deleted Royce Pittman\.$/);
  await page.click('#creator-undo');
  assert.ok((await draft(page)).world.npcs.some(n => n.id === 'npc_royce'), 'Undo brings him back');
});

s.test('a pack string in a row, a detail and the grid is text, never markup', async h => {
  const page = await open(h);
  await openDraft(page, 'blank');
  await worldTab(page, 'places');
  await addThrough(page, 'places', '<b>Bold</b> Place');
  assert.equal(await page.textContent('.cr-detail-title'), '<b>Bold</b> Place');
  assert.equal(await page.$('#creator-body b'), null);
  await worldTab(page, 'schedules');
  assert.equal(await page.textContent('.cr-grid-table tbody th'), '<b>Bold</b> Placeloc_b_bold_b_place');
  assert.equal(await page.$('#creator-body b'), null);
});

s.test('a place\'s detail, a person\'s detail and the Schedules grid pass the mobile audit at 375 and 390 (the detail in the list\'s place, Back in the sticky bar, the grid scrolling sideways inside itself)', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openDraft(page, 'copy');
    await worldTab(page, 'places');
    let a = await page.evaluate(audit, `places list ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await page.click('.cr-row[data-id="loc_low_water"]');
    await page.waitForSelector('.cr-entity[data-entity="places"][data-open="1"]');
    assert.equal(await page.isVisible('.cr-entity[data-entity="places"] .cr-entity-list'), false, 'on a phone the detail replaces the list');
    assert.equal(await page.isVisible('.cr-entity-detail .cr-sticky [data-action="back-bar"]'), true);
    a = await page.evaluate(audit, `place detail ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await page.click('.cr-sticky [data-action="back-bar"]');
    await page.waitForSelector('.cr-entity[data-entity="places"][data-open="0"]');
    await worldTab(page, 'people');
    await page.click('.cr-row[data-id="npc_royce"]');
    await page.click('.cr-more > summary');
    a = await page.evaluate(audit, `person detail ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    await worldTab(page, 'schedules');
    a = await page.evaluate(audit, `schedules ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    assert.ok(await page.evaluate(() => { const g = document.querySelector('.cr-grid-scroll'); return g.scrollWidth > g.clientWidth && getComputedStyle(g).overflowX === 'auto'; }), 'the grid scrolls sideways inside itself');
    // The place column stays put while the grid scrolls.
    const stuck = await page.evaluate(() => {
      const g = document.querySelector('.cr-grid-scroll');
      const th = g.querySelector('tbody th');
      const x0 = th.getBoundingClientRect().left;
      g.scrollLeft = 300;
      return Math.abs(th.getBoundingClientRect().left - x0) < 1;
    });
    assert.ok(stuck, 'a sticky first column');
    await page.click('.cr-seg [data-mode="person"]');
    a = await page.evaluate(audit, `schedules by person ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openDraft(page, 'copy');
      await page.evaluate(() => Game.Creator.Editor.check());
      await worldTab(page, 'people');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-world-people-${vp.width}x${vp.height}-${theme}`);
      await page.click('.cr-row[data-id="npc_royce"]');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-world-person-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.querySelector('.cr-relations').scrollIntoView({ block: 'start' }));
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop -= 60; });
      await shot(page, `creator-world-person-relations-${vp.width}x${vp.height}-${theme}`);
      await worldTab(page, 'schedules');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-world-schedules-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

/* ----- task M5-C2: Factions and Clocks, Threads, Rumours, Events and Seeds, Goods; the Effects and Conditions editors ----- */
const domId = (page, p) => page.evaluate(x => Game.Creator.Form.domId(x), p);
// A number or text field's value, the way a person leaves it: typed, then the change event (the field losing the focus).
async function type(page, selector, value) {
  await page.fill(selector, String(value));
  await page.$eval(selector, e => e.dispatchEvent(new Event('change', { bubbles: true })));
}
const at = p => `[data-path="${p}"]`;
const fieldsOf = (page, rowPath) => page.$$eval(`.cr-fx-row[data-path="${rowPath}"] > .cr-fx-fields > .cr-field`, fs => fs.map(f => f.dataset.field.split('.').pop()));
async function openClock(page, facId, ci) {
  await worldTab(page, 'factions');
  if (!(await page.$(`.cr-entity[data-entity="factions"][data-open="1"] [data-detail-for="${facId}"]`))) await page.click(`.cr-row[data-id="${facId}"]`);
  const i = await page.evaluate(id => Game.Creator.state.draft.world.factions.findIndex(f => f.id === id), facId);
  const cp = `world.factions[${i}].clocks[${ci}]`;
  if (!(await page.$eval(`details.cr-clock[data-path="${cp}"]`, d => d.open))) await page.click(`details.cr-clock[data-path="${cp}"] > summary`);
  return cp;
}

s.test('the five story lists render for a copy of the built-in story with its own counts: 3 factions, 3 threads, 20 rumours, 10 seeds and 1 event (with the ending under them), and the 40 goods and 20 complications; the weather and the name tables are a note pointing at the JSON tab', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  const want = await page.evaluate(() => { const w = Game.Creator.state.draft.world; return { factions: w.factions.length, threads: w.threads.length, rumours: w.rumours.length, seeds: w.seeds.length, events: w.events.length, goods: w.tables.items.goods.length, complications: w.tables.complications.length, endings: w.epilogue.branches.length }; });
  assert.deepEqual(want, { factions: 3, threads: 3, rumours: 20, seeds: 10, events: 1, goods: 40, complications: 20, endings: 7 });
  const rows = key => page.$$eval(`.cr-entity[data-entity="${key}"] .cr-row`, rs => rs.length);
  await worldTab(page, 'factions');
  assert.equal(await rows('factions'), 3);
  assert.match(await page.textContent('.cr-row[data-id="fac_sturdivant"] .cr-row-sum'), /^3 clocks · Get the old bridge closed/);
  await worldTab(page, 'threads');
  assert.equal(await rows('threads'), 3);
  await worldTab(page, 'rumours');
  assert.equal(await rows('rumours'), 20);
  assert.ok(await page.$('#cr-find-rumours'), 'a search past eight rows');
  await worldTab(page, 'story');
  assert.equal(await rows('seeds'), 10);
  assert.equal(await rows('events'), 1);
  assert.equal(await page.$$eval('.cr-ending details.cr-branch', ds => ds.length), 7, 'the ending\'s seven branches, folded');
  assert.equal(await page.$eval(`.cr-ending ${at('world.epilogue.onDay')}`, i => i.value), '21');
  assert.deepEqual(await page.$$eval(`.cr-ending ${at('world.epilogue.orFlagsSet')} .cr-chip-text`, cs => cs.map(c => c.textContent)), ['oldBridgeClosed', 'secondInspectionOrdered']);
  await worldTab(page, 'goods');
  assert.equal(await rows('goods'), 40);
  assert.equal(await rows('complications'), 20);
  assert.match(await page.textContent('.cr-tables-note'), /edited in the JSON tab/);
  // Opening each story list's records draws without a page error (the helpers fail the test on one).
  for (const [sub, key, sel] of [['factions', 'factions', '.cr-row'], ['threads', 'threads', '.cr-row'], ['rumours', 'rumours', '.cr-row'], ['story', 'seeds', '.cr-row'], ['story', 'events', '.cr-row'], ['goods', 'goods', '.cr-row'], ['goods', 'complications', '.cr-row']]) {
    await worldTab(page, sub);
    const n = await rows(key);
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 4))) {
      await page.click(`.cr-entity[data-entity="${key}"] ${sel} >> nth=${i}`);
      await page.waitForSelector(`.cr-entity[data-entity="${key}"][data-open="1"]`);
      await page.click(`.cr-entity[data-entity="${key}"] [data-action="back"]`);
      await page.waitForSelector(`.cr-entity[data-entity="${key}"][data-open="0"]`);
    }
  }
  // Nothing was written by looking.
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), 0);
});

s.test('a faction\'s detail: relations a number per other faction, written on both sides at once; a clock\'s segments set to 12 puts house.clock.segments under that field as a warning (play profile); Add a clock and Remove a clock are one Undo each', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await worldTab(page, 'factions');
  await page.click('.cr-row[data-id="fac_sturdivant"]');
  const names = await page.evaluate(() => Object.fromEntries(Game.Creator.state.draft.world.factions.map(f => [f.id, f.name])));
  assert.deepEqual(await page.$$eval(`${at('world.factions[0].relations')} .cr-field`, fs => fs.map(f => [f.dataset.field, f.querySelector('label').textContent, f.querySelector('input').value])),
    [['world.factions[0].relations.fac_police', names.fac_police, '-30'], ['world.factions[0].relations.fac_nightrun', names.fac_nightrun, '-50']]);
  await type(page, at('world.factions[0].relations.fac_police'), -45);
  const rel = await page.evaluate(() => Game.Creator.state.draft.world.factions.map(f => f.relations));
  assert.equal(rel[0].fac_police, -45);
  assert.equal(rel[1].fac_sturdivant, -45, 'the other side follows');
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), 1, 'one Undo for both sides');
  const cp = await openClock(page, 'fac_sturdivant', 0);
  await type(page, at(cp + '.segments'), 12);
  const probs = await checkNow(page);
  const seg = probs.filter(p => p.rule === 'house.clock.segments' && p.path === cp + '.segments');
  assert.equal(seg.length, 1);
  assert.equal(seg[0].severity, 'warning', 'a house rule warns in the play profile');
  const slotText = await page.$eval(`.cr-err[data-err-for="${cp}.segments"]`, e => ({ text: e.textContent, sev: e.dataset.sev }));
  assert.deepEqual(slotText, { text: 'Should be 4 to 10 segments; it is 12.', sev: 'warning' });
  // Add a clock: one Undo, its card open with its label field focused; Remove: one Undo.
  const before = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  await page.click(`#${await domId(page, 'world.factions[0].clocks')}-add`);
  let d = await draft(page);
  assert.equal(d.world.factions[0].clocks.length, 4);
  assert.deepEqual(d.world.factions[0].clocks[3], { label: '', segments: 12, filled: 0, onComplete: { text: '', effects: [] } }, 'it shares the faction\'s segment count');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'world.factions[0].clocks[3].label');
  await page.click('details.cr-clock[data-path="world.factions[0].clocks[3]"] [data-action="clock-remove"]');
  d = await draft(page);
  assert.equal(d.world.factions[0].clocks.length, 3);
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), before + 2);
  await page.click('#creator-undo');
  assert.equal((await draft(page)).world.factions[0].clocks.length, 4, 'Undo brings the clock back');
});

s.test('the Effects editor: Add effect with giveItem shows exactly the fields the rules allow it (name, notes, qty) and writes { op: "giveItem", name } into the clock\'s onComplete.effects; switching the op to playerGold swaps them for delta; FIELDS_BY_OP is the rules\' own table, op for op', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  const cp = await openClock(page, 'fac_sturdivant', 0);
  const lp = cp + '.onComplete.effects';
  const n = (await draft(page)).world.factions[0].clocks[0].onComplete.effects.length;
  const rowPath = `${lp}[${n}]`;
  await page.selectOption(`#${await domId(page, lp)}-add`, 'giveItem');
  await page.waitForSelector(`.cr-fx-row[data-path="${rowPath}"]`);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.path), rowPath + '.op', 'the new row\'s op takes the focus');
  assert.deepEqual(await fieldsOf(page, rowPath), ['name', 'notes', 'qty']);
  assert.equal(await page.$eval(`.cr-fx-row[data-path="${rowPath}"] ${at(rowPath + '.name')}`, i => i.closest('.cr-field').querySelector('.cr-req') !== null), true, 'name is required');
  await type(page, at(rowPath + '.name'), 'Tackle box');
  let eff = (await draft(page)).world.factions[0].clocks[0].onComplete.effects;
  assert.equal(eff.length, n + 1);
  assert.deepEqual(eff[n], { op: 'giveItem', name: 'Tackle box' });
  await page.selectOption(at(rowPath + '.op'), 'playerGold');
  assert.deepEqual(await fieldsOf(page, rowPath), ['delta']);
  eff = (await draft(page)).world.factions[0].clocks[0].onComplete.effects;
  assert.deepEqual(eff[n], { op: 'playerGold' }, 'the fields playerGold cannot carry go');
  await type(page, at(rowPath + '.delta'), 25);
  assert.deepEqual((await draft(page)).world.factions[0].clocks[0].onComplete.effects[n], { op: 'playerGold', delta: 25 });
  let probs = await checkNow(page);
  assert.deepEqual(probs.filter(p => p.path.startsWith(rowPath)), [], 'a whole playerGold is a valid effect');
  // An id field is a picker of its kind; a nested seed is a form of its own.
  await page.selectOption(at(rowPath + '.op'), 'npcMove');
  assert.deepEqual(await fieldsOf(page, rowPath), ['npcId', 'locationId', 'phases']);
  assert.equal(await page.$eval(at(rowPath + '.npcId'), s => s.dataset.ref), 'npc');
  assert.equal(await page.$eval(at(rowPath + '.locationId'), s => s.dataset.ref), 'loc');
  await page.check(`#${await domId(page, rowPath + '.phases')}-all`);
  assert.equal((await draft(page)).world.factions[0].clocks[0].onComplete.effects[n].phases, 'all');
  await page.selectOption(at(rowPath + '.op'), 'plantSeed');
  const seed = (await draft(page)).world.factions[0].clocks[0].onComplete.effects[n].seed;
  assert.match(seed.id, /^seed_new_seed(_\d+)?$/);
  assert.equal(await page.$eval(at(rowPath + '.seed.id'), i => i.value), seed.id);
  assert.ok(await page.$(`${at(rowPath + '.seed.trigger')} ${at(rowPath + '.seed.trigger.type')}`), 'the nested seed has its trigger');
  assert.ok(await page.$(`.cr-fx${at(rowPath + '.seed.effects')}`), 'and its own effects');
  // Remove the row: one Undo.
  await page.click(`.cr-fx-row[data-path="${rowPath}"] [data-action="effect-remove"]`);
  assert.equal((await draft(page)).world.factions[0].clocks[0].onComplete.effects.length, n);
  // The mirror: every op this game knows, every field the editor offers it accepted by the rules, one field more refused.
  const pin = await page.evaluate(() => {
    const T = Game.Creator.WorldTab.Effects.FIELDS_BY_OP;
    const P = Game.Pack;
    const pack = P.copy(P.builtIn());
    const ops = Object.keys(T);
    pack.world.seeds[0].effects = ops.map(op => { const e = { op, zz: 1 }; for (const k of T[op][0].concat(T[op][1])) e[k] = ['onMet', 'onMiss'].includes(k) ? [] : 1; return e; });
    const fieldProbs = P.validate(pack, { profile: 'play' }).filter(p => p.rule === 'engine.effect.fields' && p.path.startsWith('world.seeds[0].effects['));
    return { ops: ops.slice().sort(), engine: Game.State.EFFECT_OPS.slice().sort(), paths: fieldProbs.map(p => p.path + ' ' + p.message) };
  });
  assert.deepEqual(pin.ops, pin.engine, 'one entry an op of State.EFFECT_OPS');
  assert.equal(pin.paths.length, pin.ops.length, pin.paths.join('\n'));
  assert.ok(pin.paths.every(p => /\]\.zz is not a field this can carry\.$/.test(p)), pin.paths.join('\n'));
});

s.test('the Conditions editor: a requires offers only the keys the rules read for requires; adding flagsSet then removing its last key drops requires; npcAt rows are person → place; the alt is text and effects', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  const cp = await openClock(page, 'fac_sturdivant', 0);
  const rp = cp + '.onComplete.requires';
  const keys = await page.$$eval(`#${await domId(page, rp)}-add option`, os => os.map(o => o.value).filter(Boolean));
  const have = Object.keys((await draft(page)).world.factions[0].clocks[0].onComplete.requires);
  assert.deepEqual(keys, ['flagsSet', 'flagsUnset', 'npcFree', 'npcAt', 'obligationOpen', 'relAtLeast', 'relBelow'].filter(k => !have.includes(k)));
  await page.selectOption(`#${await domId(page, rp)}-add`, 'npcAt');
  await page.selectOption(`#${await domId(page, rp + '.npcAt')}-addkey`, 'npc_royce');
  await page.selectOption(at(rp + '.npcAt.npc_royce'), 'loc_town_hall');
  assert.deepEqual((await draft(page)).world.factions[0].clocks[0].onComplete.requires.npcAt, { npc_royce: 'loc_town_hall' });
  let probs = await checkNow(page);
  assert.deepEqual(probs.filter(p => p.path.startsWith(rp)), []);
  // Removing every key drops requires (an empty one is an error), and the alt left behind is the validator's to name.
  for (const k of Object.keys((await draft(page)).world.factions[0].clocks[0].onComplete.requires)) {
    await page.click(`${at(rp)} .cr-cond-key[data-key="${k}"] [data-action="cond-remove"]`);
  }
  assert.equal((await draft(page)).world.factions[0].clocks[0].onComplete.requires, undefined);
  probs = await checkNow(page);
  assert.ok(probs.some(p => p.path === cp + '.onComplete.alt' && /without requires never fires/.test(p.message)));
  assert.match(await page.textContent(`.cr-err[data-err-for="${cp}.onComplete.alt"]`), /never fires/, 'shown at the alt');
  // The alt: its text and its own effects.
  assert.equal(await page.$eval(at(cp + '.onComplete.alt.text'), t => t.tagName), 'TEXTAREA');
  assert.ok(await page.$(`.cr-fx${at(cp + '.onComplete.alt.effects')}`));
});

s.test('a seed\'s trigger: the type is a select, and location shows a picker of the town\'s places that writes a list; day is a number and npc one person', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await worldTab(page, 'story');
  const id = await page.evaluate(() => Game.Creator.state.draft.world.seeds[0].id);
  await page.click(`.cr-entity[data-entity="seeds"] .cr-row[data-id="${id}"]`);
  const tp = 'world.seeds[0].trigger';
  assert.equal(await page.$eval(at(tp + '.type'), s => s.value), 'day');
  assert.equal(await page.$eval(at(tp + '.value'), i => [i.tagName, i.type].join(' ')), 'INPUT number');
  await page.selectOption(at(tp + '.type'), 'location');
  assert.deepEqual((await draft(page)).world.seeds[0].trigger, { type: 'location', value: [] });
  const offered = await page.$$eval(`#${await domId(page, tp + '.value')}-add option`, os => os.map(o => o.value).filter(Boolean));
  const town = await page.evaluate(() => Game.Creator.state.draft.world.locations.filter(l => l.away !== true).map(l => l.id));
  assert.deepEqual(offered, town, 'the town\'s places, none out of town');
  await page.selectOption(`#${await domId(page, tp + '.value')}-add`, 'loc_old_bridge');
  await page.selectOption(`#${await domId(page, tp + '.value')}-add`, 'loc_riverbend');
  assert.deepEqual((await draft(page)).world.seeds[0].trigger, { type: 'location', value: ['loc_old_bridge', 'loc_riverbend'] });
  const placeNames = await page.evaluate(() => ['loc_old_bridge', 'loc_riverbend'].map(id => Game.Creator.state.draft.world.locations.find(l => l.id === id).name));
  assert.deepEqual(await page.$$eval(`${at(tp + '.value')} .cr-chip-text`, cs => cs.map(c => c.textContent)), placeNames);
  await page.selectOption(at(tp + '.type'), 'npc');
  assert.equal(await page.$eval(at(tp + '.value'), s => s.dataset.ref), 'npc');
  await page.selectOption(at(tp + '.value'), 'npc_royce');
  assert.deepEqual((await draft(page)).world.seeds[0].trigger, { type: 'npc', value: 'npc_royce' });
  await page.selectOption(at(tp + '.type'), 'clock');
  await page.selectOption(`#${await domId(page, tp + '.value')}`, 'fac_nightrun');
  await type(page, `#${await domId(page, tp + '.value')}-seg`, 3);
  assert.deepEqual((await draft(page)).world.seeds[0].trigger, { type: 'clock', value: 'fac_nightrun:3' });
});

s.test('a new rumour: its source has no faction, so the rules say only the source can tell it; one person chosen in Who can tell it writes tellerIds and the complaint goes (two who can tell it); emptied, tellerIds goes away', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await worldTab(page, 'rumours');
  const rid = await addThrough(page, 'rumours', 'The ferry runs at night again');
  assert.equal(rid, 'rum_the_ferry_runs_at');
  const r = await page.evaluate(() => Game.Creator.state.draft.world.rumours.length - 1);
  const rp = `world.rumours[${r}]`;
  const [src, teller] = await page.evaluate(() => {
    const here = Game.Creator.state.draft.world.npcs.filter(n => (n.presence || 'here') === 'here');
    return [here.find(n => !n.factionId).id, here.filter(n => !n.factionId)[1].id];
  });
  await page.selectOption(at(rp + '.sourceNpcId'), src);
  let probs = await checkNow(page);
  assert.ok(probs.some(p => p.rule === 'engine.rumour.tellers' && p.path === rp + '.tellerIds'), JSON.stringify(probs.filter(p => p.path.startsWith(rp))));
  await page.selectOption(`#${await domId(page, rp + '.tellerIds')}-add`, teller);
  assert.deepEqual((await draft(page)).world.rumours[r].tellerIds, [teller]);
  probs = await checkNow(page);
  assert.deepEqual(probs.filter(p => p.rule === 'engine.rumour.tellers' && p.path.startsWith(rp)), []);
  assert.match(await page.textContent(`.cr-row[data-id="${rid}"] .cr-row-sum`), /^true · from .+ · 1 teller$/);
  await page.click(`${at(rp + '.tellerIds')} .cr-chip-x`);
  assert.equal((await draft(page)).world.rumours[r].tellerIds, undefined, 'an empty list is not kept');
});

s.test('an event branch: its when.flagsSet chips offer only the flags something in the story sets; Add a branch is one Undo and opens the new one', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await worldTab(page, 'story');
  await page.click('.cr-entity[data-entity="events"] .cr-row[data-id="evt_council_meeting"]');
  const bp = 'world.events[0].branches[0]';
  await page.click(`details.cr-branch[data-path="${bp}"] > summary`);
  const fp = bp + '.when.flagsSet';
  assert.deepEqual(await page.$$eval(`${at(fp)} .cr-chip-text`, cs => cs.map(c => c.textContent)), ['bridgeReportVoid']);
  const offered = await page.$$eval(`#${await domId(page, fp)}-add option`, os => os.map(o => o.value).filter(Boolean));
  const setFlags = await page.evaluate(() => {
    const out = new Set();
    (function walk(v) { if (Array.isArray(v)) return v.forEach(walk); if (v && typeof v === 'object') { if (v.op === 'setFlag') out.add(v.key); Object.values(v).forEach(walk); } })(Game.Creator.state.draft);
    return [...out].sort();
  });
  assert.ok(setFlags.length > 10);
  assert.deepEqual(offered, setFlags.filter(f => f !== 'bridgeReportVoid'));
  // A flag nothing sets is not offered, though a condition elsewhere could name it.
  assert.ok(!offered.includes('councilVotedd'));
  await page.selectOption(`#${await domId(page, fp)}-add`, 'policeKept');
  assert.deepEqual((await draft(page)).world.events[0].branches[0].when.flagsSet, ['bridgeReportVoid', 'policeKept']);
  const n = (await draft(page)).world.events[0].branches.length;
  const depth = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  await page.click(`#${await domId(page, 'world.events[0].branches')}-add`);
  assert.deepEqual((await draft(page)).world.events[0].branches[n], { when: {}, text: '', effects: [] });
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), depth + 1);
  assert.equal(await page.$eval(`details.cr-branch[data-path="world.events[0].branches[${n}]"]`, d => d.open), true);
  const probs = await checkNow(page);
  assert.ok(probs.some(p => p.path === `world.events[0].branches[${n}].when` && /is empty/.test(p.message)), 'an empty when is the validator\'s to name');
});

s.test('a good\'s price is shown in the story\'s money: "$9" for the built-in story, "9 cr" for a draft whose currency is credits after the number, and money()\'s own "9 cr" from a credits preview when the draft names no currency; a good\'s name is text, never markup', async h => {
  const page = await open(h);
  await openDraft(page, 'copy');
  await worldTab(page, 'goods');
  const first = '.cr-entity[data-entity="goods"] .cr-row[data-index="0"] .cr-row-sum';
  assert.equal(await page.textContent(first), '$9 · good');
  await page.click('.cr-entity[data-entity="goods"] .cr-row[data-index="0"]');
  assert.equal(await page.textContent('.cr-price'), 'Shown to the player as $9.');
  await type(page, at('world.tables.items.goods[0].price'), 11);
  assert.equal(await page.textContent('.cr-price'), 'Shown to the player as $11.');
  assert.equal((await draft(page)).world.tables.items.goods[0].price, 11);
  await page.click('.cr-entity[data-entity="goods"] [data-action="back"]');
  await page.evaluate(() => Game.Creator.Editor.set('world.currency', { symbol: 'cr', name: 'credits', before: false }));
  await worldTab(page, 'goods');
  assert.equal(await page.textContent(first), '11 cr · good');
  // No currency in the draft: money() and the playing pack's (here a credits preview).
  await page.evaluate(() => {
    Game.Creator.Editor.set('world.currency', undefined);
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.world.currency = { symbol: 'cr', name: 'credits', before: false };
    Game.Pack.setPreview(p);
  });
  await worldTab(page, 'goods');
  assert.equal(await page.textContent(first), '11 cr · good');
  await page.evaluate(() => Game.Pack.setPreview(null));
  await worldTab(page, 'goods');
  assert.equal(await page.textContent(first), '$11 · good');
  await addThrough(page, 'goods', '<b>Bold</b> soap');
  assert.equal(await page.textContent('.cr-entity[data-entity="goods"] .cr-detail-title'), '<b>Bold</b> soap');
  assert.equal(await page.$('#creator-body b'), null);
  assert.deepEqual((await draft(page)).world.tables.items.goods[40], { name: '<b>Bold</b> soap', price: 5, kind: 'good' });
});

s.test('an imported effect with an op this game does not know shows its raw JSON in a box and survives opening, checking and saving the draft unchanged; editing the box to a known op turns it into a row of fields', async h => {
  const page = await open(h);
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  const odd = { op: 'summonHeron', where: 'loc_old_bridge', count: 2, notes: { why: ['dawn', 1] } };
  const id = await page.evaluate(o => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'heron-copy';
    p.world.seeds[0].effects = [o, { op: 'setFlag', key: 'heronSeen', value: true }];
    const dr = Game.Storage.Drafts.put({ pack: p });
    Game.Creator.openEditor(dr.id);
    return dr.id;
  }, odd);
  assert.ok(id);
  await worldTab(page, 'story');
  const sid = await page.evaluate(() => Game.Creator.state.draft.world.seeds[0].id);
  await page.click(`.cr-entity[data-entity="seeds"] .cr-row[data-id="${sid}"]`);
  const box = '.cr-fx-row[data-unknown="1"] textarea.cr-raw';
  assert.equal(await page.$eval(box, t => t.value), JSON.stringify(odd, null, 2));
  assert.match(await page.textContent('.cr-fx-row[data-unknown="1"] .cr-fx-what'), /An op this game does not know: "summonHeron"/);
  const probs = await checkNow(page);
  assert.ok(probs.some(p => p.rule === 'engine.effect.op' && p.path === 'world.seeds[0].effects[0].op'), 'the validator still names it');
  await page.evaluate(() => Game.Creator.Editor.saveNow());
  const kept = await page.evaluate(i => Game.Storage.Drafts.get(i).pack.world.seeds[0].effects[0], id);
  assert.deepEqual(kept, odd, 'kept exactly');
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), 0, 'opening it changed nothing');
  // Bad JSON changes nothing and says so; a known op becomes a row.
  await page.fill(box, '{ nope');
  await page.$eval(box, e => e.dispatchEvent(new Event('change')));
  assert.match(await page.textContent('.cr-fx-row[data-unknown="1"] .cr-raw-note'), /not valid JSON; nothing was changed/);
  assert.deepEqual((await draft(page)).world.seeds[0].effects[0], odd);
  await page.fill(box, '{ "op": "giveItem", "name": "Heron feather" }');
  await page.$eval(box, e => e.dispatchEvent(new Event('change')));
  assert.deepEqual((await draft(page)).world.seeds[0].effects[0], { op: 'giveItem', name: 'Heron feather' });
  assert.deepEqual(await fieldsOf(page, 'world.seeds[0].effects[0]'), ['name', 'notes', 'qty']);
});

s.test('the five story lists pass the mobile audit at 375 and 390: each list, a faction with a clock open, a thread, a rumour, a seed, the event with a branch open, a good and a complication', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await openDraft(page, 'copy');
    const check = async label => { const a = await page.evaluate(audit, `${label} ${vp.width}`); assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a)); };
    for (const sub of ['factions', 'threads', 'rumours', 'story', 'goods']) { await worldTab(page, sub); await check(`${sub} list`); }
    await openClock(page, 'fac_sturdivant', 0);
    assert.equal(await page.isVisible('.cr-entity[data-entity="factions"] .cr-entity-list'), false, 'on a phone the detail replaces the list');
    await check('faction with a clock open');
    for (const [sub, key, id] of [['threads', 'threads', 'thr_bridge_vote'], ['rumours', 'rumours', 'rum_lunch_inspection']]) {
      await worldTab(page, sub);
      await page.click(`.cr-entity[data-entity="${key}"] .cr-row[data-id="${id}"]`);
      await check(`${key} detail`);
    }
    await worldTab(page, 'story');
    await page.click('.cr-entity[data-entity="seeds"] .cr-row >> nth=6');
    await check('seed detail');
    await page.click('.cr-entity[data-entity="seeds"] .cr-sticky [data-action="back-bar"]');
    await page.click('.cr-entity[data-entity="events"] .cr-row[data-id="evt_council_meeting"]');
    await page.click('details.cr-branch[data-path="world.events[0].branches[0]"] > summary');
    await check('event with a branch open');
    await worldTab(page, 'goods');
    await page.click('.cr-entity[data-entity="goods"] .cr-row[data-index="0"]');
    await check('good detail');
    await page.click('.cr-entity[data-entity="goods"] .cr-sticky [data-action="back-bar"]');
    await page.click('.cr-entity[data-entity="complications"] .cr-row[data-index="0"]');
    await check('complication detail');
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await openDraft(page, 'copy');
      await page.evaluate(() => Game.Creator.Editor.check());
      const cp = await openClock(page, 'fac_sturdivant', 0);
      await page.evaluate(p => { const c = document.querySelector(`details.cr-clock[data-path="${p}"]`); c.scrollIntoView({ block: 'start' }); document.getElementById('creator-scroll').scrollTop -= 60; }, cp);
      await shot(page, `creator-world-factions-clock-${vp.width}x${vp.height}-${theme}`);
      await worldTab(page, 'story');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-world-events-seeds-${vp.width}x${vp.height}-${theme}`);
      await page.click('.cr-entity[data-entity="events"] .cr-row[data-id="evt_council_meeting"]');
      await page.click('details.cr-branch[data-path="world.events[0].branches[0]"] > summary');
      await page.evaluate(() => { document.querySelector('details.cr-branch').scrollIntoView({ block: 'start' }); document.getElementById('creator-scroll').scrollTop -= 60; });
      await shot(page, `creator-world-event-branch-${vp.width}x${vp.height}-${theme}`);
      await worldTab(page, 'goods');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-world-goods-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
