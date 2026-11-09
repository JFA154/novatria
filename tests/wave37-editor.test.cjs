'use strict';
/* Wave 37, Creator Mode, milestone 5 (task M5-A): the Library of story
   cards and the editor's shell (plan decisions H and L; the owner asked for
   a "very pretty" Creator Mode in the same visual world as the game). The
   title's Create opens the Library: the built-in story first ("Low Water",
   "by Joe", the rating chip, a full completeness ring, "Built in"), then the
   Library's packs (a pack from a save says so), then the drafts. New story
   makes a draft (Storage.Drafts) and opens the editor's shell with its
   eleven tabs; Open in Creator on the built-in story edits a copy and says
   so; Play this story selects a pack and reaches character creation;
   Duplicate, Export ("<id>-<version>.json", Pack.format's text), Import
   (and a bad file's reason) and Delete (asked first) work from the cards;
   Settings' Developer mode writes settings.developerMode; a pack's strings
   are text, never markup; the Library and the shell pass the mobile audit at
   375 and 390. Screenshots of both at 390x844 and 1280x800 in the Dark and
   Parchment themes go to $UI_SHOTS when it names a folder (none without it).
   Run with: node tests/run.cjs wave37-editor */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('wave37-editor');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const TAB_LABELS = ['Overview', 'World', 'Player', 'Opening', 'Narrator', 'Directions', 'Rules', 'Freedom', 'Prompts', 'JSON', 'Test'];
const PLACEHOLDER = 'This tab arrives with the next task.';
const BUILT_IN_NOTE = 'Opened a copy; the built-in story cannot be changed.';
// Screenshots only when UI_SHOTS names a folder for them (as tests/ui-fixes.test.cjs takes them).
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

/* A page with the Library and the drafts read, and the mock answering at once. */
async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
async function library(page) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
}
/* Marrow Bend: a renamed copy of the built-in pack in the Library (as tests/wave37-saves.test.cjs puts one). */
function putMarrow(page, source) {
  return page.evaluate(src => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'marrow-bend';
    p.meta.title = 'Marrow Bend';
    p.meta.author = 'Tester';
    p.meta.rating = 'teen';
    return Game.Storage.Library.put(p, { source: src || 'from-save' }).id;
  }, source || null);
}
/* What each card shows, in order. */
const cards = page => page.evaluate(() => [...document.querySelectorAll('#creator-cards .cr-card')].map(c => ({
  id: c.dataset.id,
  kind: c.dataset.kind,
  title: c.querySelector('.cr-card-title').textContent,
  by: c.querySelector('.cr-card-by').textContent,
  badge: c.querySelector('.cr-badge').textContent,
  chip: c.querySelector('.cr-chip') ? c.querySelector('.cr-chip').textContent : null,
  chipRating: c.querySelector('.cr-chip') ? c.querySelector('.cr-chip').dataset.rating : null,
  ring: c.querySelector('.cr-ring').dataset.pct,
  ringLabel: c.querySelector('.cr-ring').getAttribute('aria-label'),
  dash: c.querySelector('.cr-ring-fill') ? c.querySelector('.cr-ring-fill').getAttribute('stroke-dasharray') : null,
  premise: c.querySelector('.cr-card-premise').textContent,
  actions: [...c.querySelectorAll('button')].map(b => b.textContent),
  playOff: c.querySelector('[data-action=play]').disabled,
  note: c.querySelector('.cr-note') ? c.querySelector('.cr-note').textContent : null
})));
const card = (page, id) => `#creator-cards .cr-card[data-id="${id}"]`;
const toast = page => page.waitForFunction(() => document.getElementById('toast').classList.contains('show')).then(() => page.textContent('#toast'));

/* SPEC section 11's checks, as tests/mobile.test.cjs makes them (its audit, in short): 44px tap targets, 16px inputs,
   and nothing wider than the screen (a strip that scrolls sideways on purpose, the tab strip, is scrolled, not wide). */
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

s.test('Create (after Load on the title) opens the Library, whose first card is the built-in story: "Low Water", "by Joe · version 1.0.0", the adult chip, a full completeness ring, the "Built in" badge and its premise', async h => {
  const page = await open(h);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#menu-list > .btn')].map(b => b.id)).then(ids => ids.slice(ids.indexOf('btn-load'), ids.indexOf('btn-load') + 2)), ['btn-load', 'btn-create']);
  assert.equal(await page.textContent('#btn-create'), 'Create');
  await library(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'creator-title', 'the heading takes the focus');
  assert.equal(await page.textContent('#creator-title'), 'Your stories');
  const list = await cards(page);
  assert.equal(list.length, 1);
  const b = list[0];
  assert.equal(b.kind, 'built-in');
  assert.equal(b.title, 'Low Water');
  assert.equal(b.by, 'by Joe · version 1.0.0');
  assert.equal(b.badge, 'Built in');
  assert.equal(b.chip, 'adult');
  assert.equal(b.chipRating, 'adult', 'the chip is tinted through data-rating');
  assert.equal(b.ring, '100');
  assert.equal(b.ringLabel, '100% complete');
  const [len, circ] = b.dash.split(' ').map(Number);
  assert.ok(Math.abs(len - circ) < 0.01, 'the ring is drawn all the way round');
  assert.equal(b.premise, await page.evaluate(() => Game.Pack.builtIn().setting.blurb), 'the premise is the setting\'s blurb (Low Water has no opening premise)');
  assert.deepEqual(b.actions, ['Play this story', 'Open in Creator', 'Export', 'Duplicate'], 'the built-in story cannot be deleted');
  assert.equal(await page.evaluate(() => Game.Pack.completeness(Game.Pack.builtIn())), 1);
  // Nothing else here yet: the empty state's one sentence and two buttons, and the header's pair steps aside.
  assert.ok(await page.isVisible('#creator-empty'));
  assert.deepEqual(await page.$$eval('#creator-empty button', bs => bs.map(x => x.textContent)), ['New story', 'Import a .json']);
  assert.ok(!(await page.isVisible('#creator-toolbar')));
  await page.click('#creator-back');
  await page.waitForSelector('#screen-title.active');
});

s.test('New story makes a blank draft in Storage.Drafts and opens the editor shell: the header card with its title and the meter, eleven tabs, and each tab\'s placeholder; Back returns to the Library, which shows the draft card with Play off', async h => {
  const page = await open(h);
  await library(page);
  await page.click('#creator-empty-new');
  await page.waitForSelector('#creator-editor:not([hidden])');
  const st = await page.evaluate(() => ({ state: Object.assign({}, Game.Creator.state), drafts: Game.Storage.Drafts.index() }));
  assert.equal(st.state.view, 'editor');
  assert.equal(st.drafts.length, 1);
  const dr = st.drafts[0];
  assert.equal(st.state.draftId, dr.id);
  assert.match(dr.id, /^d_[a-z0-9]+$/);
  assert.equal(dr.fromPackId, null);
  assert.deepEqual([dr.undo, dr.redo], [[], []]);
  assert.equal(dr.pack.packFormat, 1);
  assert.equal(dr.pack.meta.title, 'Untitled story');
  assert.equal(dr.pack.meta.version, '0.1.0');
  assert.equal(dr.pack.meta.rating, 'general');
  assert.match(dr.pack.meta.id, /^untitled-story-[a-z0-9]{4}$/);
  const blank = await page.evaluate(() => {
    const a = Game.Pack.blank('Untitled story');
    const b = Game.Pack.blank('Untitled story');
    const b0 = Game.Pack.builtIn();
    return {
      clash: a.meta.id === b.meta.id,
      errors: Game.Pack.errors(Game.Pack.validate(a)).length,
      tables: JSON.stringify(a.world.tables) === JSON.stringify(b0.world.tables) && a.world.tables !== b0.world.tables && !Object.isFrozen(a.world.tables),
      stats: JSON.stringify(a.player.stats) === JSON.stringify(b0.player.stats),
      share: Game.Pack.completeness(a)
    };
  });
  assert.equal(blank.clash, false, 'two blanks never share an id');
  assert.ok(blank.errors > 0, 'a blank pack fails validation on purpose');
  assert.ok(blank.tables, 'the tables are an editable copy of the built-in ones');
  assert.ok(blank.stats);
  assert.equal(blank.share, 0.1, 'a blank has only its title');
  assert.equal(await page.textContent('#creator-title'), 'Story editor');
  assert.equal(await page.textContent('#creator-editor-title'), 'Untitled story');
  assert.match(await page.textContent('#creator-meter-num'), /^[\d,]+ of 13,000 tokens · estimate$/);
  const tabs = await page.$$eval('#creator-tabs [role=tab]', ts => ts.map(t => ({ text: t.textContent, on: t.getAttribute('aria-selected') })));
  assert.deepEqual(tabs.map(t => t.text), TAB_LABELS);
  assert.deepEqual(tabs.filter(t => t.on === 'true').map(t => t.text), ['Overview']);
  for (const label of TAB_LABELS) {
    await page.click(`#creator-tabs [role=tab]:text-is("${label}")`);
    assert.deepEqual(await page.evaluate(() => ({ h: document.querySelector('#creator-body h2').textContent, p: document.querySelector('#creator-body .cr-note').textContent })), { h: label, p: PLACEHOLDER }, label);
  }
  // The arrow keys move along the strip, as the panel tabs do.
  await page.focus('#creator-tab-test');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'creator-tab-overview');
  await page.click('#creator-back');
  await page.waitForSelector('#creator-library:not([hidden])');
  const list = await cards(page);
  assert.deepEqual(list.map(c => [c.kind, c.badge]), [['built-in', 'Built in'], ['draft', 'Draft']]);
  assert.equal(list[1].title, 'Untitled story');
  assert.equal(list[1].playOff, true, 'a draft is tested from the editor (milestone 7)');
  assert.equal(list[1].note, 'Test it from the editor');
  assert.equal(list[1].ring, '10');
  await page.click(`${card(page, dr.id)} [data-action=open]`);
  await page.waitForSelector('#creator-editor:not([hidden])');
  assert.equal(await page.evaluate(() => Game.Creator.state.draftId), dr.id, 'Open in Creator on a draft opens that draft');
});

s.test('Open in Creator on the built-in card edits a copy: a toast says so, the copy is a pack of its own (low-water-copy) and the draft edits it; the built-in story is unchanged', async h => {
  const page = await open(h);
  await library(page);
  const before = await page.evaluate(() => Game.Pack.hash(Game.Pack.builtIn()));
  await page.click(`${card(page, 'low-water')} [data-action=open]`);
  await page.waitForSelector('#creator-editor:not([hidden])');
  assert.equal(await toast(page), BUILT_IN_NOTE);
  const st = await page.evaluate(() => {
    const dr = Game.Storage.Drafts.get(Game.Creator.state.draftId);
    return { from: dr.fromPackId, id: dr.pack.meta.id, title: dr.pack.meta.title, frozen: Object.isFrozen(dr.pack), rec: Game.Storage.Library.get('low-water-copy').source, hash: Game.Pack.hash(Game.Pack.builtIn()) };
  });
  assert.deepEqual(st, { from: 'low-water-copy', id: 'low-water-copy', title: 'Low Water (copy)', frozen: false, rec: 'duplicate', hash: before });
  assert.equal(await page.textContent('#creator-editor-title'), 'Low Water (copy)');
  await page.click('#creator-back');
  assert.deepEqual((await cards(page)).map(c => [c.title, c.badge]), [['Low Water', 'Built in'], ['Low Water (copy)', 'Copy'], ['Low Water (copy)', 'Draft']]);
});

s.test('a Library pack from a save shows "From a save" and its rating; Play this story selects it for New game and reaches character creation; Open in Creator twice opens the one draft', async h => {
  const page = await open(h);
  await page.evaluate(() => Game.Storage.saveSettings({ mockMode: true, playChoice: 'demo' }));
  await putMarrow(page, 'from-save');
  await library(page);
  const list = await cards(page);
  assert.deepEqual(list.map(c => c.id), ['low-water', 'marrow-bend']);
  assert.equal(list[1].badge, 'From a save');
  assert.equal(list[1].chip, 'teen');
  assert.equal(list[1].by, 'by Tester · version 1.0.0');
  assert.ok(await page.isVisible('#creator-toolbar'), 'with a pack of its own the header has New story and Import');
  assert.ok(!(await page.isVisible('#creator-empty')));
  await page.click(`${card(page, 'marrow-bend')} [data-action=open]`);
  await page.waitForSelector('#creator-editor:not([hidden])');
  const first = await page.evaluate(() => Game.Creator.state.draftId);
  await page.click('#creator-back');
  await page.click(`${card(page, 'marrow-bend')} [data-action=open]`);
  assert.equal(await page.evaluate(() => Game.Creator.state.draftId), first);
  assert.equal(await page.evaluate(() => Game.Storage.Drafts.index().length), 1);
  assert.equal(await page.evaluate(() => Game.Storage.Drafts.get(Game.Creator.state.draftId).fromPackId), 'marrow-bend');
  await page.click('#creator-back');
  await page.click(`${card(page, 'marrow-bend')} [data-action=play]`);
  await page.waitForSelector('#screen-create.active');
  assert.ok(await page.isVisible('#create-form-view'));
  assert.equal(await page.evaluate(() => Game.Storage.settings().selectedPackId), 'marrow-bend');
  assert.equal(await page.evaluate(() => Game.Pack.selected().meta.id), 'marrow-bend');
});

s.test('Duplicate adds a -copy record; Export downloads "<id>-<version>.json" whose text is Pack.format of the pack (the built-in, a Library pack and a draft)', async h => {
  const page = await open(h);
  await putMarrow(page, 'from-save');
  await library(page);
  await page.click(`${card(page, 'marrow-bend')} [data-action=duplicate]`);
  assert.equal(await toast(page), 'Made "Marrow Bend (copy)".');
  const rec = await page.evaluate(() => { const r = Game.Storage.Library.get('marrow-bend-copy'); return r && { source: r.source, title: r.title }; });
  assert.deepEqual(rec, { source: 'duplicate', title: 'Marrow Bend (copy)' });
  assert.deepEqual((await cards(page)).map(c => c.id), ['low-water', 'marrow-bend', 'marrow-bend-copy']);
  for (const [id, name] of [['low-water', 'low-water-1.0.0.json'], ['marrow-bend', 'marrow-bend-1.0.0.json']]) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click(`${card(page, id)} [data-action=export]`)]);
    assert.equal(download.suggestedFilename(), name);
    const text = fs.readFileSync(await download.path(), 'utf8');
    assert.equal(text, await page.evaluate(i => Game.Pack.format(Game.Storage.Library.get(i).pack), id), id);
  }
  // A draft exports its own pack the same way.
  const draftId = await page.evaluate(() => Game.Storage.Drafts.put({ pack: Game.Pack.blank('Harbour Lights') }).id);
  await page.click('#creator-back');
  await library(page);
  const want = await page.evaluate(i => { const p = Game.Storage.Drafts.get(i).pack; return { name: `${p.meta.id}-0.1.0.json`, text: Game.Pack.format(p) }; }, draftId);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(`${card(page, draftId)} [data-action=export]`)]);
  assert.equal(download.suggestedFilename(), want.name);
  assert.equal(fs.readFileSync(await download.path(), 'utf8'), want.text);
  await page.click(`${card(page, draftId)} [data-action=duplicate]`);
  assert.deepEqual(await page.evaluate(() => Game.Storage.Drafts.index().map(d => d.pack.meta.title).sort()), ['Harbour Lights', 'Harbour Lights (copy)']);
});

s.test('Import a .json adds the pack\'s card ("Imported"); a file that is not JSON, a saved game and a broken pack each toast the reason and add nothing', async h => {
  const page = await open(h);
  await library(page);
  const good = await page.evaluate(() => { const p = Game.Pack.copy(Game.Pack.builtIn()); p.meta.id = 'harbour-town'; p.meta.title = 'Harbour Town'; return Game.Pack.format(p); });
  await page.setInputFiles('#creator-import-file', { name: 'harbour-town-1.0.0.json', mimeType: 'application/json', buffer: Buffer.from(good) });
  assert.equal(await toast(page), 'Imported "Harbour Town".');
  await page.waitForSelector(card(page, 'harbour-town'));
  const c = (await cards(page)).find(x => x.id === 'harbour-town');
  assert.equal(c.badge, 'Imported');
  assert.equal(c.ring, '100');
  assert.equal(await page.evaluate(() => Game.Storage.Library.get('harbour-town').source), 'import');
  const bad = [
    ['notes.json', 'this is not json', 'That file is not valid JSON.'],
    ['save.json', JSON.stringify({ kind: 'novatria-save', state: {} }), 'That file is a saved game, not a story pack. Import it from Save / Load.'],
    ['broken.json', null, null]
  ];
  bad[2][1] = await page.evaluate(() => { const p = Game.Pack.copy(Game.Pack.builtIn()); p.meta.id = 'broken-town'; p.world.locations[0].exits = ['loc_nowhere']; return Game.Pack.format(p); });
  for (const [name, text, msg] of bad) {
    await page.evaluate(() => { document.getElementById('toast').classList.remove('show'); });
    await page.setInputFiles('#creator-import-file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    const said = await toast(page);
    if (msg) assert.equal(said, msg, name);
    else assert.match(said, /^That story pack has a problem at world\.locations\[0\]\.exits\[0\]: /, name);
  }
  assert.deepEqual((await cards(page)).map(x => x.id), ['low-water', 'harbour-town'], 'nothing added by a bad file');
});

s.test('Delete asks first with the title in the question; Keep it keeps the pack, Delete removes it (and a selected pack gives New game back to the built-in story); a draft is deleted the same way', async h => {
  const page = await open(h);
  await putMarrow(page, 'created');
  await page.evaluate(() => { Game.Storage.saveSettings({ selectedPackId: 'marrow-bend' }); Game.Storage.Drafts.put({ pack: Game.Pack.blank('Night Ferry') }); });
  await library(page);
  assert.equal((await cards(page)).find(c => c.id === 'marrow-bend').badge, 'Saved');
  await page.click(`${card(page, 'marrow-bend')} [data-action=delete]`);
  await page.waitForSelector('#ask[open]');
  assert.equal(await page.textContent('#ask-title'), 'Delete this story?');
  assert.match(await page.textContent('#ask-text'), /^"Marrow Bend" goes from this device\./);
  await page.click('#ask-no');
  assert.ok(await page.evaluate(() => !!Game.Storage.Library.get('marrow-bend')));
  await page.click(`${card(page, 'marrow-bend')} [data-action=delete]`);
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-yes');
  await page.waitForFunction(() => !document.querySelector('#creator-cards .cr-card[data-id="marrow-bend"]'));
  assert.equal(await page.evaluate(() => Game.Storage.Library.get('marrow-bend')), null);
  assert.equal(await page.evaluate(() => Game.Storage.settings().selectedPackId), 'low-water');
  assert.equal(await toast(page), 'Deleted "Marrow Bend".');
  const draftId = await page.evaluate(() => Game.Storage.Drafts.index()[0].id);
  await page.click(`${card(page, draftId)} [data-action=delete]`);
  await page.waitForSelector('#ask[open]');
  assert.equal(await page.textContent('#ask-title'), 'Delete this draft?');
  assert.match(await page.textContent('#ask-text'), /"Night Ferry"/);
  await page.click('#ask-yes');
  await page.waitForFunction(() => Game.Storage.Drafts.index().length === 0);
  assert.deepEqual((await cards(page)).map(c => c.id), ['low-water']);
  // The drafts store keeps what is written: a draft put and a reload bring it back.
  const kept = await page.evaluate(() => Game.Storage.Drafts.put({ pack: Game.Pack.blank('Kept Story') }).id);
  await page.evaluate(() => Game.Storage.undoIdle());
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(() => Game.Storage.Drafts.ready);
  assert.equal(await page.evaluate(i => (Game.Storage.Drafts.get(i) || {}).pack.meta.title, kept), 'Kept Story');
  assert.equal(await page.evaluate(() => Game.Storage.Drafts.persistent), true);
});

s.test('Settings: the Developer mode box under Advanced writes settings.developerMode and shows it again', async h => {
  const page = await open(h);
  await page.click('#btn-settings');
  await page.click('#set-advanced > summary');
  assert.equal(await page.isChecked('#set-developer'), false);
  assert.match(await page.textContent('#developer-hint'), /^Shows the developer tools during play: the last packet and reply, the style check, and every command whatever the story hides\.$/);
  await page.check('#set-developer');
  assert.equal(await page.evaluate(() => Game.Storage.settings().developerMode), true);
  await page.click('#settings-done');
  await page.click('#btn-settings');
  assert.equal(await page.isChecked('#set-developer'), true);
  await page.uncheck('#set-developer');
  assert.equal(await page.evaluate(() => Game.Storage.settings().developerMode), false);
});

s.test('every pack string on a card and in the editor header is text: a draft titled "<b>x</b>" by "<i>me</i>" shows the angle brackets and makes no element', async h => {
  const page = await open(h);
  const id = await page.evaluate(() => {
    const p = Game.Pack.blank('Plain');
    p.meta.title = '<b>x</b>';
    p.meta.author = '<i>me</i>';
    p.setting.blurb = '<img src=x onerror="window.hit=1">';
    return Game.Storage.Drafts.put({ pack: p }).id;
  });
  await library(page);
  const c = (await cards(page)).find(x => x.id === id);
  assert.equal(c.title, '<b>x</b>');
  assert.equal(c.by, 'by <i>me</i> · version 0.1.0');
  assert.equal(c.premise, '<img src=x onerror="window.hit=1">');
  assert.equal(await page.evaluate(i => document.querySelectorAll(`#creator-cards .cr-card[data-id="${i}"] b, #creator-cards .cr-card[data-id="${i}"] i, #creator-cards img`).length, id), 0);
  await page.click(`${card(page, id)} [data-action=open]`);
  await page.waitForSelector('#creator-editor:not([hidden])');
  assert.equal(await page.textContent('#creator-editor-title'), '<b>x</b>');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#creator-editor-head b, #creator-editor-head i').length + (window.hit ? 1 : 0)), 0);
});

s.test('the Library (with a built-in, a Library pack and a draft card) and the editor shell pass the mobile audit at 375 and 390; screenshots at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await putMarrow(page, 'from-save');
    await page.evaluate(() => {
      const p = Game.Pack.blank('The Long Night at Pittman\'s Crossing');
      p.meta.author = 'A writer with a rather long name';
      p.setting.blurb = 'A truck stop on the interstate where the night shift knows everything and says nothing, until the storm closes the road.';
      Game.Storage.Drafts.put({ pack: p });
    });
    await library(page);
    const a = await page.evaluate(audit, `library ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    assert.deepEqual(await page.$$eval('#creator-cards .cr-badge:not(.on)', bs => bs.map(b => b.textContent)), ['Built in', 'From a save', 'Draft']);
    // One column on a phone.
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('creator-cards')).gridTemplateColumns.split(' ').length), 1);
    await page.click(`${card(page, 'marrow-bend')} [data-action=open]`);
    await page.waitForSelector('#creator-editor:not([hidden])');
    const e = await page.evaluate(audit, `editor ${vp.width}`);
    assert.deepEqual([e.small, e.fonts, e.wide], [[], [], []], JSON.stringify(e));
    // The tab strip scrolls sideways inside itself; the page never does.
    assert.ok(await page.evaluate(() => { const t = document.getElementById('creator-tabs'); return t.scrollWidth > t.clientWidth && getComputedStyle(t).overflowX === 'auto'; }));
    await page.click('#creator-tab-test');
    assert.ok(await page.evaluate(() => { const t = document.getElementById('creator-tab-test').getBoundingClientRect(); return t.left >= 0 && t.right <= window.innerWidth; }), 'the chosen tab is scrolled into view');
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await putMarrow(page, 'from-save');
      await page.evaluate(() => {
        const p = Game.Pack.blank('The Long Night at Pittman\'s Crossing');
        p.meta.author = 'Sam Ortiz';
        p.setting.blurb = 'A truck stop on the interstate where the night shift knows everything and says nothing, until the storm closes the road.';
        Game.Storage.Drafts.put({ pack: p });
      });
      await library(page);
      await shot(page, `creator-library-${vp.width}x${vp.height}-${theme}`);
      await page.click(`${card(page, 'marrow-bend')} [data-action=open]`);
      await page.waitForSelector('#creator-editor:not([hidden])');
      await shot(page, `creator-editor-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
