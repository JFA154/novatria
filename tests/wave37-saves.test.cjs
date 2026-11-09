'use strict';
/* Wave 37, Creator Mode, milestone 2 (task M2-D): the story pack a game
   plays is on screen, and a save keeps playing it. The title names the
   selected pack ("Low Water · by Joe · adult") above the rest of the
   setting, and the Continue line adds "from the story pack …" when the
   autosave is not the built-in story; every Save / Load row names its pack
   and rating after the player and day. End to end through the page: a save
   keeps its frozen pack when the Library's copy is edited or deleted (the
   owner: "a save keeps playing the same way even if the pack is edited or
   deleted later"); an export plays on a device that never had the pack and
   puts it in the Library as from-save; a save whose pack is not on this
   device says which pack and cannot be continued or loaded (App.load
   refuses it); one whose pack changed since loads with a toast and plays
   the pack here. The envelope's shape is wave37-storage's and the state's
   is wave37-pack-state's: not repeated here.
   Run with: node tests/run.cjs wave37-saves */
const assert = require('assert/strict');
const { suite, quickStart, sendText } = require('./helpers.cjs');

const s = suite('wave37-saves');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const MISSING = 'This save needs the story pack Lost Pack (lost-pack), which is not on this device. Import the save\'s export file instead.';
const CHANGED = 'The story pack changed since this save; it plays with the pack you have now.';

/* A page with the Library read and the mock answering at once. */
async function ready(page) {
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; });
  return page;
}
async function open(h, opts) { return ready(await h.open(opts)); }
async function reload(page) { await page.reload(); return ready(page); }
/* Marrow Bend: a renamed copy of the built-in pack (its own id, title and
   author, so its hash differs) put in the Library and selected for New
   game. setting: another setting text, for the edited version. */
function putMarrow(page, setting) {
  return page.evaluate(text => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'marrow-bend';
    p.meta.title = 'Marrow Bend';
    p.meta.author = 'Tester';
    if (text) p.world.setting = text;
    const rec = Game.Storage.Library.put(p, { source: 'created' });
    Game.Storage.saveSettings({ selectedPackId: 'marrow-bend' });
    return rec.hash;
  }, setting || null);
}
/* Every queued IndexedDB write (the frozen copy, the Library) is done before a reload. */
const settle = page => page.evaluate(() => Game.Storage.undoIdle());
const titleView = page => page.evaluate(() => ({
  pack: document.getElementById('title-pack').textContent,
  sub: document.getElementById('continue-sub').textContent,
  note: document.getElementById('title-pack-note').hidden ? null : document.getElementById('title-pack-note').textContent,
  warn: document.getElementById('title-pack-note').classList.contains('warn'),
  continueOff: document.getElementById('btn-continue').disabled,
  setting: `${document.getElementById('title-setting').textContent} ${document.getElementById('title-setting-more').textContent}`.replace(/\s+/g, ' ').trim()
}));
const meta = (page, id) => page.textContent(`#${id} .slot-meta`);
/* An envelope of the running game that names a pack this device has never had, with no pack in it. */
function writeMissing(page, keys) {
  return page.evaluate(ks => {
    const St = Game.Storage;
    const env = St.envelope('Lost game');
    env.packRef = { id: 'lost-pack', version: '1.0.0', hash: '0123456789abcdef' };
    env.summary.packTitle = 'Lost Pack';
    delete env.pack;
    for (const k of ks) localStorage.setItem(k === 'autosave' ? St.KEYS.autosave : St.KEYS.slot(k), JSON.stringify(env));
  }, keys);
}
/* SPEC section 11's checks, as tests/mobile.test.cjs makes them (its audit, in short): 44px tap targets and nothing wider than the screen. */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  const small = [...document.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) wide.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ').join('.')} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
  }
  for (const el of document.querySelectorAll('.page')) if (vis(el) && el.scrollWidth > el.clientWidth + 1) wide.push('scrolls sideways: ' + (el.id || el.className));
  if (document.documentElement.scrollWidth > W) wide.push('document ' + document.documentElement.scrollWidth);
  return { label, small, wide: wide.slice(0, 10) };
}

s.test('a game of the built-in story: the title names "Low Water · by Joe · adult" above the setting, the Continue line says nothing about a pack, and its Save / Load row reads "… · Low Water · adult · …"', async h => {
  const page = await open(h);
  const first = await titleView(page);
  assert.equal(first.pack, 'Low Water · by Joe · adult');
  assert.equal(first.setting, await page.evaluate(() => Game.Pack.builtIn().world.setting.replace(/\s+/g, ' ').trim()), 'the setting is the selected pack\'s world.setting (Low Water has no opening premise)');
  await quickStart(page, { name: 'Tomas Reed' });
  await sendText(page, 'I look around the room');
  await page.evaluate(() => { Game.Storage.saveSlot(1, 'River'); Game.App.quitToTitle(); });
  const t = await titleView(page);
  const want = await page.evaluate(() => `Tomas Reed · Day ${Game.state.time.day} · ${Game.State.loc(Game.state.player.locationId).name}`);
  assert.equal(t.sub, want, 'nothing extra under Continue for the built-in story');
  assert.equal(t.note, null);
  assert.equal(t.continueOff, false);
  await page.click('#btn-load');
  await page.waitForSelector('#screen-saves.active');
  for (const id of ['slot-1', 'slot-auto']) assert.match(await meta(page, id), /^Tomas Reed · Day \d+ · (Morning|Afternoon|Evening|Night) · Low Water · adult · /, id);
  assert.equal(await page.locator('#slot-1 [data-pack]').count(), 0, 'no pack note');
});

s.test('a renamed copy of the built-in pack in the Library, selected and started: the title shows "Marrow Bend · by Tester · adult", Continue says "from the story pack Marrow Bend", and the rows read "Marrow Bend · adult" (the previous autosave, of the built-in story, "Low Water · adult")', async h => {
  const page = await open(h);
  // A built-in game first, so the Marrow Bend game moves it to the previous autosave.
  await quickStart(page, { name: 'Ada Lowe' });
  await putMarrow(page);
  await page.evaluate(() => Game.App.quitToTitle());
  assert.equal((await titleView(page)).pack, 'Marrow Bend · by Tester · adult', 'the pack New game plays');
  await quickStart(page, { name: 'Tomas Reed' });
  assert.equal(await page.evaluate(() => Game.State.pack.meta.id), 'marrow-bend');
  await sendText(page, 'I look around the room');
  await page.evaluate(() => { Game.Storage.saveSlot(1, 'Marrow'); Game.App.quitToTitle(); });
  const t = await titleView(page);
  assert.match(t.sub, /^Tomas Reed · Day \d+ · .+ · from the story pack Marrow Bend$/);
  assert.equal(t.note, null);
  assert.equal(t.continueOff, false);
  await page.click('#btn-load');
  await page.waitForSelector('#screen-saves.active');
  assert.match(await meta(page, 'slot-1'), /^Tomas Reed · Day \d+ · \w+ · Marrow Bend · adult · /);
  assert.match(await meta(page, 'slot-auto'), / · Marrow Bend · adult · /);
  assert.match(await meta(page, 'slot-prev'), /^Ada Lowe · Day \d+ · \w+ · Low Water · adult · /);
  // Continue plays it.
  await page.click('#saves-done');
  await page.click('#btn-continue');
  await page.waitForSelector('#screen-game.active');
  assert.equal(await page.evaluate(() => Game.State.pack.meta.title), 'Marrow Bend');
});

s.test('a save keeps its frozen pack after the Library\'s copy is edited: after a reload the slot loads the setting it was saved with and the pack hashes to its packRef, with no warning; a new game then plays the edited pack', async h => {
  const page = await open(h);
  const was = await putMarrow(page);
  await quickStart(page);
  await sendText(page, 'I look around the room');
  const before = await page.evaluate(() => { Game.Storage.saveSlot(1, 'Marrow'); return Game.State.pack.world.setting; });
  // One plain sentence more (a proper name would have to match a record: the validator's mention rule).
  const EDITED = `${before} The river is lower this year than anyone remembers.`;
  const now = await putMarrow(page, EDITED);
  assert.notEqual(now, was, 'the edit changes the pack\'s hash');
  await settle(page);
  await reload(page);
  assert.equal((await titleView(page)).setting, EDITED, 'the title tells the edited pack, the one New game plays');
  await page.evaluate(() => Game.App.loadSlot(1));
  await page.waitForSelector('#screen-game.active');
  const r = await page.evaluate(() => {
    const env = JSON.parse(localStorage.getItem(Game.Storage.KEYS.slot(1)));
    return { setting: Game.State.pack.world.setting, hash: Game.Pack.hash(Game.State.pack), ref: env.packRef.hash, warn: Game.Storage.loadSlot(1).packWarning || null };
  });
  assert.equal(r.setting, before, 'the saved game\'s text, not the edited one');
  assert.equal(r.hash, r.ref);
  assert.equal(r.ref, was);
  assert.equal(r.warn, null);
  assert.equal(await page.isHidden('#banner'), true);
  await quickStart(page, { seed: 777 });
  assert.equal(await page.evaluate(() => Game.State.pack.world.setting), EDITED, 'a new game plays the Library\'s edited pack');
});

s.test('a save keeps playing after the Library\'s copy is deleted: after a reload the slot loads from the frozen copy, with no warning, and plays a turn', async h => {
  const page = await open(h);
  const hash = await putMarrow(page);
  await quickStart(page);
  await page.evaluate(() => Game.Storage.saveSlot(1, 'Marrow'));
  assert.equal(await page.evaluate(() => Game.Storage.Library.remove('marrow-bend')), true);
  await settle(page);
  await reload(page);
  assert.equal(await page.evaluate(() => Game.Storage.Library.get('marrow-bend')), null, 'gone from the Library');
  await page.evaluate(() => Game.App.loadSlot(1));
  await page.waitForSelector('#screen-game.active');
  const r = await page.evaluate(() => ({ id: Game.State.pack.meta.id, hash: Game.Pack.hash(Game.State.pack), env: Game.Storage.loadSlot(1), turn: Game.state.meta.turn }));
  assert.equal(r.id, 'marrow-bend');
  assert.equal(r.hash, hash);
  assert.equal(r.env.packWarning, undefined);
  assert.equal(r.env.packMissing, undefined);
  assert.equal(await page.isHidden('#banner'), true);
  await sendText(page, 'I look around the room');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), r.turn + 1);
});

s.test('the export path: a Marrow Bend game exported and imported on a fresh device (no IndexedDB, no localStorage) joins the Library as from-save, plays, and its row reads "Marrow Bend · adult"', async h => {
  const page = await open(h);
  const hash = await putMarrow(page);
  await quickStart(page, { name: 'Tomas Reed' });
  await sendText(page, 'I look around the room');
  const text = await page.evaluate(() => Game.Storage.exportJson());
  // A new browser context: its own IndexedDB and localStorage, empty (no helper's 18+ yes either: tests/helpers.cjs).
  const fresh = await open(h, { consent: false });
  assert.deepEqual(await fresh.evaluate(() => [Game.Storage.Library.index().map(r => r.id), localStorage.length]), [['low-water'], 0]);
  await fresh.evaluate(() => Game.UI.showScreen('saves'));
  await fresh.setInputFiles('#import-file', { name: 'marrow-bend-tomas-reed-day-1.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  // Wave 37, Creator Mode, milestone 8 (task M8-B): Marrow Bend is rated adult, so the fresh device asks once before it plays.
  await fresh.waitForSelector('#consent[open]');
  await fresh.check('#consent-check');
  await fresh.click('#consent-yes');
  await fresh.waitForSelector('#screen-game.active');
  const r = await fresh.evaluate(() => {
    const rec = Game.Storage.Library.get('marrow-bend');
    return { rec: rec && [rec.source, rec.title, rec.hash], pack: Game.State.pack.meta.id, hash: Game.Pack.hash(Game.State.pack), turn: Game.state.meta.turn };
  });
  assert.deepEqual(r.rec, ['from-save', 'Marrow Bend', hash]);
  assert.equal(r.pack, 'marrow-bend');
  assert.equal(r.hash, hash);
  await sendText(fresh, 'I walk outside');
  assert.equal(await fresh.evaluate(() => Game.state.meta.turn), r.turn + 1, 'the game plays');
  await fresh.evaluate(() => { Game.Storage.saveSlot(1, 'Imported'); Game.UI.showScreen('saves'); });
  assert.match(await meta(fresh, 'slot-1'), /^Tomas Reed · Day \d+ · \w+ · Marrow Bend · adult · /);
  assert.match(await meta(fresh, 'slot-auto'), / · Marrow Bend · adult · /);
});

s.test('a save whose story pack is not on this device: the title says which pack under Continue in the warning colour and Continue is off; its Save / Load row says the same with Load off; and App.load refuses it without loading anything', async h => {
  const page = await open(h);
  await quickStart(page, { name: 'Tomas Reed' });
  await writeMissing(page, ['autosave', 2]);
  await reload(page);
  // The title waits for the Library before it explains a missing pack.
  await page.waitForFunction(() => !document.getElementById('title-pack-note').hidden);
  const t = await titleView(page);
  assert.equal(t.note, MISSING);
  assert.equal(t.warn, true);
  assert.equal(t.continueOff, true);
  assert.match(t.sub, /^Tomas Reed · Day \d+ · /, 'the Continue line still names the game');
  assert.doesNotMatch(t.sub, /story pack/, 'and no pack it cannot find');
  assert.match(await page.getAttribute('#btn-continue', 'aria-describedby'), /title-pack-note/);
  await page.click('#btn-load');
  await page.waitForSelector('#screen-saves.active');
  for (const id of ['slot-2', 'slot-auto']) {
    assert.equal(await page.textContent(`#${id} [data-pack="missing"]`), MISSING, id);
    assert.equal(await page.isDisabled(`#${id} [data-action="load"]`), true, id);
  }
  assert.match(await meta(page, 'slot-2'), / · Lost Pack · adult · /);
  // Through App: refused with the message, and no game is loaded.
  const r = await page.evaluate(() => ({ cont: Game.App.continueGame(), slot: Game.App.loadSlot(2), state: Game.state, banner: document.getElementById('banner-text').textContent }));
  assert.equal(r.cont, false);
  assert.equal(r.slot, false);
  assert.equal(r.state, null, 'State.load was never called');
  assert.ok(r.banner.includes(MISSING), r.banner);
  /* Before the Library is read (review M2-G5): a slow IndexedDB open, held
     until the test lets it through, keeps Library.ready waiting; the rows
     then have no note yet and Load off, and the message comes once it is read. */
  await page.context().addInitScript(() => {
    const real = IDBFactory.prototype.open;
    let release;
    const gate = new Promise(r => { release = r; });
    window.__releaseDb = () => release();
    IDBFactory.prototype.open = function (...args) {
      const self = this;
      const fake = {};
      gate.then(() => {
        const req = real.apply(self, args);
        req.onupgradeneeded = e => { fake.result = req.result; if (fake.onupgradeneeded) fake.onupgradeneeded(e); };
        req.onsuccess = e => { fake.result = req.result; if (fake.onsuccess) fake.onsuccess(e); };
        req.onerror = e => { if (fake.onerror) fake.onerror(e); };
        req.onblocked = e => { if (fake.onblocked) fake.onblocked(e); };
      });
      return fake;
    };
  });
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  let readYet = false;
  await page.evaluate(() => { Game.Storage.Library.ready.then(() => { window.__libRead = true; }); });
  await page.click('#btn-load');
  await page.waitForSelector('#screen-saves.active');
  readYet = await page.evaluate(() => window.__libRead === true);
  assert.equal(readYet, false, 'the Library is not read yet');
  for (const id of ['slot-2', 'slot-auto']) {
    assert.equal(await page.locator(`#${id} [data-pack="missing"]`).count(), 0, `${id}: no note before the Library is read`);
    assert.equal(await page.textContent(`#${id} .slot-info`).then(t => t.includes('not on this device')), false, id);
    assert.equal(await page.isDisabled(`#${id} [data-action="load"]`), true, `${id}: Load off meanwhile`);
  }
  await page.evaluate(() => window.__releaseDb());
  await page.waitForSelector('#slot-2 [data-pack="missing"]');
  for (const id of ['slot-2', 'slot-auto']) {
    assert.equal(await page.textContent(`#${id} [data-pack="missing"]`), MISSING, id);
    assert.equal(await page.isDisabled(`#${id} [data-action="load"]`), true, id);
  }
});

s.test('/load of a slot whose story pack is not on this device (review M2-G1), with an autosave of another game in no slot: no "Replace the autosave?" question, the banner gives the missing-pack message, and the game is unchanged', async h => {
  const page = await open(h);
  await quickStart(page, { name: 'Tomas Reed' });
  await sendText(page, 'I look around the room');
  await page.evaluate(() => {
    const St = Game.Storage;
    const env = St.envelope('Lost game');
    env.packRef = { id: 'lost-pack', version: '1.0.0', hash: '0123456789abcdef' };
    env.summary.packTitle = 'Lost Pack';
    delete env.pack;
    // Another game, so loading it would replace an autosave that is in no slot.
    env.state.meta.createdAt = '2020-01-01T00:00:00.000Z';
    env.state.meta.seed = 999;
    localStorage.setItem(St.KEYS.slot(1), JSON.stringify(env));
  });
  const before = await page.evaluate(() => JSON.stringify(Game.state));
  const r = await page.evaluate(() => {
    const asked = !!Game.App && Game.Storage.loadAutosave() && !Game.Storage.inSlot(Game.Storage.loadAutosave().state);
    const res = Game.Commands.run('/load 1');
    return { asked, ok: res && res.ok, banner: document.getElementById('banner-text').textContent, bannerShown: !document.getElementById('banner').hidden };
  });
  assert.equal(r.asked, true, 'the autosave is in no slot, so a load of another game would ask');
  assert.equal(r.ok, false);
  await page.waitForTimeout(100);
  assert.equal(await page.isVisible('#ask'), false, 'no dialog');
  assert.equal(await page.textContent('#ask-title'), '', 'the dialog was never filled');
  assert.equal(r.bannerShown, true);
  assert.equal(r.banner, 'That save could not be loaded: ' + MISSING);
  assert.equal(await page.evaluate(() => JSON.stringify(Game.state)), before, 'the game is unchanged');
  assert.equal(await page.isVisible('#screen-game.active'), true);
});

s.test('a slot whose packRef hash differs from the Library\'s Marrow Bend copy: its row shows the note and Load works, the load shows the warning as a toast and plays the Library\'s copy', async h => {
  const page = await open(h);
  const hash = await putMarrow(page);
  await quickStart(page);
  await page.evaluate(() => {
    const St = Game.Storage;
    St.saveSlot(1, 'Changed');
    const env = JSON.parse(localStorage.getItem(St.KEYS.slot(1)));
    env.packRef.hash = '00000000deadbeef';
    localStorage.setItem(St.KEYS.slot(1), JSON.stringify(env));
    Game.App.quitToTitle();
  });
  await page.click('#btn-load');
  await page.waitForSelector('#screen-saves.active');
  assert.equal(await page.textContent('#slot-1 [data-pack="warning"]'), CHANGED);
  assert.equal(await page.isDisabled('#slot-1 [data-action="load"]'), false);
  await page.click('#slot-1 [data-action="load"]');
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(t => document.getElementById('toast').textContent === t, CHANGED);
  const r = await page.evaluate(() => ({ same: Game.State.pack === Game.Storage.Library.get('marrow-bend').pack, hash: Game.Pack.hash(Game.State.pack), turn: Game.state.meta.turn }));
  assert.equal(r.same, true, 'the Library\'s copy');
  assert.equal(r.hash, hash);
  await sendText(page, 'I look around the room');
  assert.equal(await page.evaluate(() => Game.state.meta.turn), r.turn + 1);
});

for (const size of SIZES) {
  s.test(`${size.width}x${size.height}: the title (the pack line open, Continue from the story pack Marrow Bend) and Save / Load with the longer rows, a missing pack and a changed one keep 44px targets and nothing wider than the screen`, async h => {
    const page = await open(h, { viewport: size });
    await putMarrow(page);
    await quickStart(page, { name: 'Bartholomew Featherstonehaugh-Smythe' });
    await page.evaluate(() => {
      const St = Game.Storage;
      St.saveSlot(1, 'A long name for a save, forty characters');
      St.saveSlot(3, 'Changed');
      const env = JSON.parse(localStorage.getItem(St.KEYS.slot(3)));
      env.packRef.hash = '00000000deadbeef';
      localStorage.setItem(St.KEYS.slot(3), JSON.stringify(env));
    });
    await writeMissing(page, [2]);
    await page.evaluate(() => { Game.App.quitToTitle(); document.getElementById('title-more').open = true; });
    assert.match(await page.textContent('#continue-sub'), /from the story pack Marrow Bend$/);
    const results = [await page.evaluate(audit, 'title')];
    await page.evaluate(() => Game.UI.showScreen('saves'));
    assert.equal(await page.locator('#slot-2 [data-pack="missing"]').count(), 1);
    assert.equal(await page.locator('#slot-3 [data-pack="warning"]').count(), 1);
    results.push(await page.evaluate(audit, 'saves'));
    // The same title with the autosave's pack missing: the warning note under Continue.
    await writeMissing(page, ['autosave']);
    await page.evaluate(() => Game.UI.showScreen('title'));
    assert.equal(await page.textContent('#title-pack-note'), MISSING);
    results.push(await page.evaluate(audit, 'title, pack missing'));
    const bad = results.filter(x => x.small.length || x.wide.length);
    assert.deepEqual(bad, [], JSON.stringify(bad, null, 1));
  });
}

s.run();
