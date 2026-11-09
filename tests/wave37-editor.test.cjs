'use strict';
/* Wave 37, Creator Mode, milestone 5 (task M5-A): the Library of story
   cards and the editor's shell (plan decisions H and L; the owner asked for
   a "very pretty" Creator Mode in the same visual world as the game). The
   title's Create opens the Library: the built-in story first ("Low Water",
   "by Joe", the rating chip, a full completeness ring, "Built in"), then the
   Library's packs (a pack from a save says so), then the drafts. New story
   makes a draft (Storage.Drafts) and opens the editor's shell with its
   twelve tabs; Open in Creator on the built-in story edits a copy and says
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
const TAB_LABELS = ['Overview', 'World', 'Player', 'Opening', 'Narrator', 'Directions', 'Rules', 'Freedom', 'Prompts', 'JSON', 'Prompt view', 'Test'];
const PLACEHOLDER = 'This tab arrives with the next task.';
// Task M5-B draws these two tabs, task M5-C1 the World tab (Places first, its Start places above the list); the first heading each shows.
const DRAWN = { Overview: 'About this story', World: 'Start places', Player: 'Backgrounds', JSON: 'Your story as JSON' };
// Task M6-A draws the Opening, Narrator, Directions and Prompts tabs (tests/wave37-editor-narrator.test.cjs tests them).
Object.assign(DRAWN, { Opening: 'Opening', Narrator: 'Voice', Directions: 'Directions', Prompts: 'Prompts' });
// Task M6-B draws the Rules and Freedom tabs.
Object.assign(DRAWN, { Rules: 'When to roll', Freedom: 'Preset' });
const BUILT_IN_NOTE = 'Opened a copy; the built-in story cannot be changed.';
// Screenshots only when UI_SHOTS names a folder for them (as tests/ui-fixes.test.cjs takes them).
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};
// Task M6-C draws the Prompt view (tests/wave37-prompt-view.test.cjs); a line of its own, so the milestone's tasks add theirs apart.
DRAWN['Prompt view'] = 'Show me the prompt';

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

s.test('New story makes a blank draft in Storage.Drafts and opens the editor shell: the header card with its title and the meter, twelve tabs, and each later tab\'s placeholder (Overview and JSON are drawn since task M5-B); Back returns to the Library, which shows the draft card with Play off', async h => {
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
    const got = await page.evaluate(() => ({ h: document.querySelector('#creator-body h2').textContent, p: document.querySelector('#creator-body .cr-note').textContent }));
    if (DRAWN[label]) assert.equal(got.h, DRAWN[label], label);
    else assert.deepEqual(got, { h: label, p: PLACEHOLDER }, label);
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

/* ----- Task M5-B: the form renderer, the editor, the Overview and the JSON tab (plan decisions H, I and L; owner
   decision 9: Creator Mode "converts the story to a json", the editor's output a JSON file shown live) ----- */

/* The Library, from the title or from the editor's Back. */
async function toLibrary(page) {
  if (await page.isVisible('#creator-library')) return;
  await library(page);
}
/* A new blank draft in the editor, from the Library's New story. */
async function newDraft(page) {
  await toLibrary(page);
  await page.click('#creator-empty-new');
  await page.waitForSelector('#creator-editor:not([hidden])');
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  return page.evaluate(() => Game.Creator.state.draftId);
}
/* A copy of the built-in story with an id of its own, as a draft opened from its card. */
async function openCopy(page, id, title) {
  const draftId = await page.evaluate(([i, t]) => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = i;
    p.meta.title = t;
    return Game.Storage.Drafts.put({ pack: p }).id;
  }, [id || 'harbour-copy', title || 'Harbour Copy']);
  await toLibrary(page);
  // The card was drawn before the draft was put: draw the Library again.
  await page.evaluate(() => Game.Creator.renderLibrary());
  await page.click(`${card(page, draftId)} [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  return draftId;
}
const errLines = (page, path) => page.$$eval(`#creator-body .cr-err[data-err-for="${path}"] .cr-err-line`, ls => ls.map(l => ({ text: l.textContent, sev: l.dataset.sev })));
const tabCounts = page => page.$$eval('#creator-tabs [role=tab]', ts => Object.fromEntries(ts.filter(t => t.dataset.count).map(t => [t.dataset.crTab, Number(t.dataset.count)])));
const hideToast = page => page.evaluate(() => document.getElementById('toast').classList.remove('show'));

s.test('Pack.SCHEMA carries the editor\'s words: every leaf, list and map has a label; meta has its order (title first), meta.id is read-only, packFormat, the tables and the templates are hidden, short strings are one line, and storyText has its placeholder', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const unlabelled = [];
    const S = Game.Pack.SCHEMA;
    (function walk(n, path) {
      if (n.type !== 'object' && !(typeof n.label === 'string' && n.label.trim())) unlabelled.push(path);
      if (n.type === 'object') for (const k of Object.keys(n.fields)) walk(n.fields[k], path ? path + '.' + k : k);
      else if (n.type === 'list') walk(n.of, path + '[]');
      else if (n.type === 'map') walk(n.of, path + '{}');
    })(S, '');
    const f = S.fields;
    return {
      unlabelled, frozen: Object.isFrozen(f.meta.fields.title),
      order: f.meta.order.slice(0, 7), idRead: f.meta.fields.id.readOnly,
      hidden: [f.packFormat.hidden, f.world.fields.tables.hidden, f.world.fields.grudgeTemplates.hidden, f.world.fields.favourTemplates.hidden],
      oneLine: [f.meta.fields.title.oneLine, f.world.fields.npcs.of.fields.name.oneLine, f.world.fields.map.fields.river.oneLine === undefined],
      story: [f.meta.fields.storyText.type, f.meta.fields.storyText.max, f.meta.fields.storyText.placeholder],
      lists: [f.world.fields.locations.label, f.meta.fields.contentWarnings.label, f.player.fields.flaws.label],
      // Additive only: the types, caps and the built-in pack's verdict are what they were.
      types: [f.meta.fields.title.type, f.meta.fields.version.pattern, f.packFormat.const],
      builtIn: Game.Pack.validate(Game.Pack.builtIn(), { profile: 'strict' }).length
    };
  });
  assert.deepEqual(r.unlabelled, []);
  assert.equal(r.frozen, true);
  assert.deepEqual(r.order, ['title', 'id', 'author', 'version', 'rating', 'description', 'storyText']);
  assert.equal(r.idRead, true);
  assert.deepEqual(r.hidden, [true, true, true, true]);
  assert.deepEqual(r.oneLine, [true, true, true], 'the river\'s 4,000-character path is not one line');
  assert.deepEqual(r.story, ['text', 40000, 'Your story, in your words…']);
  assert.deepEqual(r.lists, ['Places', 'Content warnings', 'Flaws']);
  assert.deepEqual(r.types, ['string', '^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$', 1]);
  assert.equal(r.builtIn, 0);
});

s.test('a blank draft opens on the Overview: the title field, the id read-only in monospace, "Your story, in your words" with its placeholder and its note, and Problems listing the blank pack\'s errors with their paths, each a button to the tab that owns it', async h => {
  const page = await open(h);
  await newDraft(page);
  const f = await page.evaluate(() => {
    const q = s => document.querySelector('#creator-body ' + s);
    const id = q('[data-path="meta.id"]');
    const story = q('[data-path="meta.storyText"]');
    return {
      order: [...document.querySelectorAll('#creator-body [data-path]')].map(c => c.dataset.path),
      title: [q('[data-path="meta.title"]').tagName, q('[data-path="meta.title"]').type, q('[data-path="meta.title"]').value, q('label[for="cr-f-meta-title"]').firstChild.textContent],
      id: [id.value, id.readOnly, id.classList.contains('cr-mono'), getComputedStyle(id).fontFamily === getComputedStyle(q('.cr-mono')).fontFamily, id.value === Game.Creator.state.draft.meta.id],
      story: [story.tagName, story.placeholder, story.maxLength, story.closest('section').querySelector('h2').textContent, story.closest('section').querySelector('.cr-note').textContent],
      rating: [...q('[data-path="meta.rating"]').options].map(o => o.value),
      notes: q('[data-path="meta.notes"]').tagName,
      about: document.getElementById('creator-about').textContent,
      problems: [...document.querySelectorAll('#creator-problems .cr-problem')].map(b => ({ path: b.querySelector('.cr-problem-path').textContent, tab: b.dataset.tab, sev: b.dataset.sev, msg: b.querySelector('.cr-problem-msg').textContent })),
      want: Game.Pack.validate(Game.Creator.state.draft, { profile: 'play' }).map(p => ({ path: p.path, tab: Game.Creator.Editor.tabFor(p.path), sev: p.severity })),
      sum: document.querySelector('#creator-problems .cr-problems-sum').textContent
    };
  });
  assert.deepEqual(f.order.slice(0, 4), ['meta.title', 'meta.id', 'meta.author', 'meta.version']);
  assert.deepEqual(f.order.slice(-6), ['setting.era', 'setting.blurb', 'opening.premise', 'opening.text', 'meta.storyText', 'meta.notes']);
  assert.deepEqual(f.title, ['INPUT', 'text', 'Untitled story', 'Title']);
  assert.deepEqual(f.id.slice(1), [true, true, true, true]);
  assert.match(f.id[0], /^untitled-story-[a-z0-9]{4}$/);
  assert.deepEqual(f.story.slice(0, 4), ['TEXTAREA', 'Your story, in your words…', 40000, 'Your story, in your words']);
  assert.match(f.story[4], /stays in the pack and is never sent to the game's narrator\.$/);
  assert.deepEqual(f.rating, ['', 'general', 'teen', 'mature', 'adult'], 'an enum the pack need not set has a "Not set" choice');
  assert.equal(f.notes, 'TEXTAREA');
  assert.match(f.about, /^About this file: untitled-story-[a-z0-9]{4} · version 0\.1\.0 · hash [0-9a-f]{8} · [\d.]+ KB · 10% complete$/);
  assert.deepEqual(f.problems.map(p => p.path), ['world.startLocationIds.gate', 'world.startLocationIds.docks']);
  assert.deepEqual(f.problems.map(p => ({ path: p.path, tab: p.tab, sev: p.sev })), f.want, 'every problem of Pack.validate, each with the tab its path belongs to');
  assert.equal(f.sum, '2 errors and 0 warnings. Errors stop the story being saved as a pack; warnings do not.');
  assert.deepEqual(await tabCounts(page), { world: 2 });
  assert.equal(await page.getAttribute('#creator-tab-world', 'aria-label'), 'World, 2 errors');
  assert.equal(await page.textContent('#creator-tab-world'), 'World', 'the count is drawn, not text');
  await page.click('#creator-problems .cr-problem >> nth=0');
  assert.equal(await page.evaluate(() => Game.Creator.state.tab), 'world');
  assert.equal(await page.getAttribute('#creator-tab-world', 'aria-selected'), 'true');
});

s.test('typing a title changes the header card at once and the JSON tab within a second; a required field emptied says "Is required." under its control, the Overview tab counts it, and a list item\'s problem sits under the list (the longest data-path prefix)', async h => {
  const page = await open(h);
  await newDraft(page);
  await page.fill('[data-path="meta.title"]', 'Harbour Lights');
  await page.waitForFunction(() => document.getElementById('creator-editor-title').textContent === 'Harbour Lights', null, { timeout: 1000 });
  assert.equal(await page.evaluate(() => Game.Creator.state.draft.meta.title), 'Harbour Lights');
  await page.click('#creator-tab-json');
  assert.match(await page.textContent('#creator-json'), /"title": "Harbour Lights"/);
  // Live: a change while the JSON tab is open reaches its view within a second.
  await page.evaluate(() => Game.Creator.Editor.set('meta.author', 'Sam Ortiz'));
  await page.waitForFunction(() => document.getElementById('creator-json').textContent.includes('"author": "Sam Ortiz"'), null, { timeout: 1000 });
  assert.equal(await page.textContent('#creator-editor-sub'), await page.evaluate(() => `by Sam Ortiz · version 0.1.0 · id ${Game.Creator.state.draft.meta.id}`));
  await page.click('#creator-tab-overview');
  assert.equal(await page.inputValue('[data-path="meta.author"]'), 'Sam Ortiz', 'the form shows the change made elsewhere');
  await page.fill('[data-path="meta.title"]', '');
  await page.waitForFunction(() => document.querySelector('#creator-tab-overview').dataset.count === '1', null, { timeout: 1000 });
  assert.equal(await page.evaluate(() => 'title' in Game.Creator.state.draft.meta), false, 'an emptied field takes the key away');
  const p = await page.evaluate(() => Game.Creator.Editor.problems.filter(x => x.path === 'meta.title'));
  assert.deepEqual(p.map(x => [x.message, x.severity, x.rule]), [['is required.', 'error', 'engine.shape.required']]);
  assert.deepEqual(await errLines(page, 'meta.title'), [{ text: 'Is required.', sev: 'error' }]);
  assert.equal(await page.getAttribute('[data-path="meta.title"]', 'aria-invalid'), 'true');
  assert.match(await page.getAttribute('[data-path="meta.title"]', 'aria-describedby'), /cr-f-meta-title-err/);
  assert.equal(await page.textContent('#creator-editor-title'), await page.evaluate(() => Game.Creator.state.draft.meta.id), 'with no title the header names the id');
  assert.deepEqual(await tabCounts(page), { overview: 1, world: 2 });
  // A tag with markup: its problem is at meta.tags[0], whose longest prefix with a control is the tags list.
  await page.fill('#cr-f-meta-tags-add', '<b>noir</b>');
  await page.press('#cr-f-meta-tags-add', 'Enter');
  await page.waitForFunction(() => document.querySelector('#creator-tab-overview').dataset.count === '2', null, { timeout: 1000 });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cr-f-meta-tags-add', 'the Add field keeps the focus');
  const tag = await errLines(page, 'meta.tags');
  assert.equal(tag.length, 1);
  assert.match(tag[0].text, /^\[0\]: Holds a "<"/);
  assert.equal(await page.$$eval('#creator-body .cr-field[data-field="meta.tags"] .cr-chip-text', cs => cs.map(c => c.textContent).join()), '<b>noir</b>');
  assert.equal(await page.$$eval('#creator-body .cr-chips b', bs => bs.length), 0, 'pack text is text');
  await page.click('#creator-body .cr-field[data-field="meta.tags"] .cr-chip-x');
  await page.waitForFunction(() => document.querySelector('#creator-tab-overview').dataset.count === '1', null, { timeout: 1000 });
  assert.deepEqual(await page.evaluate(() => Game.Creator.state.draft.meta.tags), []);
  // A warning is muted: an unknown field.
  await page.evaluate(() => Game.Creator.Editor.set('meta.mood', 'grey'));
  await page.evaluate(() => Game.Creator.Editor.check());
  assert.deepEqual(await page.evaluate(() => Game.Creator.Editor.problems.filter(x => x.path === 'meta.mood').map(x => x.severity)), ['warning']);
  assert.deepEqual(await page.$$eval('#creator-problems .cr-problem[data-sev=warning] .cr-problem-path', ps => ps.map(x => x.textContent)), ['meta.mood']);
});

s.test('Undo restores the previous title and Redo puts it back, each disabled when its stack is empty; the stack keeps Storage.Drafts.UNDO_MAX snapshots, dropping the oldest', async h => {
  const page = await open(h);
  await newDraft(page);
  const off = () => page.evaluate(() => [document.getElementById('creator-undo').disabled, document.getElementById('creator-redo').disabled]);
  assert.deepEqual(await off(), [true, true]);
  await page.fill('[data-path="meta.title"]', 'First Title');
  await page.waitForFunction(() => Game.Creator.state.draft.meta.title === 'First Title');
  await page.fill('[data-path="meta.title"]', 'Second Title');
  await page.waitForFunction(() => Game.Creator.state.draft.meta.title === 'Second Title');
  assert.deepEqual(await off(), [false, true]);
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), 2);
  await page.click('#creator-undo');
  assert.equal(await page.inputValue('[data-path="meta.title"]'), 'First Title');
  assert.equal(await page.textContent('#creator-editor-title'), 'First Title');
  assert.deepEqual(await off(), [false, false]);
  await page.click('#creator-redo');
  assert.equal(await page.inputValue('[data-path="meta.title"]'), 'Second Title');
  assert.equal(await page.textContent('#creator-editor-title'), 'Second Title');
  assert.deepEqual(await off(), [false, true]);
  await page.click('#creator-undo');
  await page.click('#creator-undo');
  assert.equal(await page.inputValue('[data-path="meta.title"]'), 'Untitled story');
  assert.deepEqual(await off(), [true, false]);
  // A new change empties Redo.
  await page.fill('[data-path="meta.author"]', 'Ann');
  await page.waitForFunction(() => Game.Creator.state.draft.meta.author === 'Ann');
  assert.deepEqual(await off(), [false, true]);
  const cap = await page.evaluate(() => {
    for (let i = 0; i < 25; i++) Game.Creator.Editor.set('meta.description', 'Take ' + i);
    const E = Game.Creator.Editor;
    const top = E.undoDepth;
    let back = 0;
    while (E.undo()) back++;
    return { max: Game.Storage.Drafts.UNDO_MAX, top, back, desc: Game.Creator.state.draft.meta.description, same: E.set('meta.description', Game.Creator.state.draft.meta.description) };
  });
  assert.deepEqual(cap, { max: 20, top: 20, back: 20, desc: 'Take 4', same: false }, 'twenty steps back reach the fifth take; setting a value to itself is no step');
});

s.test('the draft autosaves to Storage.Drafts within a second of typing, and a reload reopens it from its card with the typed title', async h => {
  const page = await open(h);
  const id = await newDraft(page);
  await page.fill('[data-path="meta.title"]', 'The Night Ferry');
  await page.fill('[data-path="opening.premise"]', 'The last boat leaves at midnight.');
  await page.waitForFunction(i => { const d = Game.Storage.Drafts.get(i); return d && d.pack.meta.title === 'The Night Ferry' && d.pack.opening && d.pack.opening.premise === 'The last boat leaves at midnight.'; }, id, { timeout: 1000 });
  assert.equal(await page.evaluate(i => Game.Storage.Drafts.get(i).undo.length, id), 2, 'the undo stack is kept with the draft');
  await page.evaluate(() => Game.Storage.undoIdle());
  await page.reload();
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(async () => { await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  await library(page);
  assert.equal((await cards(page)).find(c => c.id === id).title, 'The Night Ferry');
  await page.click(`${card(page, id)} [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  assert.equal(await page.textContent('#creator-editor-title'), 'The Night Ferry');
  assert.equal(await page.inputValue('[data-path="meta.title"]'), 'The Night Ferry');
  assert.equal(await page.inputValue('[data-path="opening.premise"]'), 'The last boat leaves at midnight.');
  assert.deepEqual(await page.evaluate(() => [document.getElementById('creator-undo').disabled, Game.Creator.Editor.undoDepth]), [false, 2]);
  // Back keeps what is still being typed (no wait for the timers).
  await page.fill('[data-path="meta.author"]', 'Quick Hands');
  await page.click('#creator-back');
  assert.equal(await page.evaluate(i => Game.Storage.Drafts.get(i).pack.meta.author, id), 'Quick Hands');
  assert.equal(await page.evaluate(() => Game.Creator.state.draft), null);
});

s.test('Save as pack: with errors it toasts "Fix 2 problems first.", focuses Problems and saves nothing; a copy of the built-in story with an id of its own saves to the Library with the patch version raised, twice (check() timed)', async h => {
  const page = await open(h);
  await newDraft(page);
  await page.click('#creator-save');
  assert.equal(await toast(page), 'Fix 2 problems first.');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'creator-problems');
  assert.deepEqual(await page.evaluate(() => Game.Storage.Library.index().map(r => r.id)), ['low-water']);
  await page.click('#creator-back');
  await hideToast(page);
  const draftId = await openCopy(page, 'harbour-copy', 'Harbour Copy');
  const timing = await page.evaluate(() => {
    const ms = [];
    for (let i = 0; i < 5; i++) { Game.Creator.Editor.check(); ms.push(Game.Creator.Editor.checkMs); }
    return { ms, kb: Game.Pack.format(Game.Creator.state.draft).length / 1024, problems: Game.Creator.Editor.problems.length };
  });
  console.log(`        check() on the built-in copy (${timing.kb.toFixed(0)} KB): ${timing.ms.map(x => x.toFixed(0)).join(', ')} ms`);
  assert.equal(timing.problems, 0);
  await page.click('#creator-save');
  assert.equal(await toast(page), 'Saved to your Library as Harbour Copy 1.0.1.');
  const rec = await page.evaluate(i => {
    const r = Game.Storage.Library.get('harbour-copy');
    const d = Game.Storage.Drafts.get(i);
    return { version: r.version, source: r.source, packVersion: r.pack.meta.version, title: r.title, draft: d.pack.meta.version, from: d.fromPackId, working: Game.Creator.state.draft.meta.version, same: Game.Pack.hash(r.pack) === Game.Pack.hash(Game.Creator.state.draft) };
  }, draftId);
  assert.deepEqual(rec, { version: '1.0.1', source: 'created', packVersion: '1.0.1', title: 'Harbour Copy', draft: '1.0.1', from: 'harbour-copy', working: '1.0.1', same: true });
  assert.equal(await page.inputValue('[data-path="meta.version"]'), '1.0.1');
  assert.match(await page.textContent('#creator-editor-sub'), /version 1\.0\.1/);
  await hideToast(page);
  await page.click('#creator-save');
  assert.equal(await toast(page), 'Saved to your Library as Harbour Copy 1.0.2.');
  assert.equal(await page.evaluate(() => Game.Storage.Library.get('harbour-copy').version), '1.0.2');
  assert.deepEqual(await page.evaluate(() => ['1.4.9', '2.0.0-beta.1', '', 'x'].map(Game.Creator.Editor.bumpVersion)), ['1.4.10', '2.0.1', '0.1.0', '0.1.0']);
  await page.click('#creator-back');
  assert.deepEqual((await cards(page)).filter(c => c.id === 'harbour-copy').map(c => [c.badge, c.by]), [['Saved', 'by Joe · version 1.0.2']]);
});

s.test('the JSON tab shows Pack.format of the draft with its line count and size; Copy JSON puts it on the clipboard, Download names "<id>-<version>.json", Import asks and then replaces the draft (its problems shown, Undo bringing the draft back); a file over 400 KB shows its first 200 lines', async h => {
  const page = await open(h, { contextOptions: { reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] } });
  await openCopy(page, 'harbour-copy', 'Harbour Copy');
  await page.click('#creator-tab-json');
  const v = await page.evaluate(() => {
    const text = Game.Pack.format(Game.Creator.state.draft);
    return { same: document.getElementById('creator-json').textContent === text, stats: document.querySelector('.cr-json-stats').textContent, lines: text.split('\n').length - 1, kb: Math.round(new TextEncoder().encode(text).length / 1024), cut: document.querySelector('.cr-json-cut').hidden };
  });
  assert.equal(v.same, true);
  assert.equal(v.stats, `${v.lines.toLocaleString('en-US')} lines · ${v.kb} KB`);
  assert.equal(v.cut, true);
  assert.deepEqual(await page.$$eval('.cr-json-bar button', bs => bs.map(b => [b.id, b.textContent])), [['creator-json-copy', 'Copy JSON'], ['creator-json-download', 'Download .json'], ['creator-json-import', 'Import']]);
  await page.click('#creator-json-copy');
  assert.equal(await toast(page), `Copied the JSON (${v.kb} KB).`);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await page.evaluate(() => Game.Pack.format(Game.Creator.state.draft)));
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#creator-json-download')]);
  assert.equal(download.suggestedFilename(), 'harbour-copy-1.0.0.json');
  assert.equal(fs.readFileSync(await download.path(), 'utf8'), await page.evaluate(() => Game.Pack.format(Game.Creator.state.draft)));
  // Import: a bad file says why; a pack file is asked about first; Keep the draft keeps it; Replace replaces it.
  await hideToast(page);
  await page.setInputFiles('#creator-body .cr-json-file', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  assert.equal(await toast(page), 'That file is not valid JSON.');
  const other = await page.evaluate(() => { const p = Game.Pack.blank('Imported Tale'); p.meta.id = 'imported-tale'; return Game.Pack.format(p); });
  await page.setInputFiles('#creator-body .cr-json-file', { name: 'imported-tale-0.1.0.json', mimeType: 'application/json', buffer: Buffer.from(other) });
  await page.waitForSelector('#ask[open]');
  assert.equal(await page.textContent('#ask-title'), 'Replace this draft with the file?');
  assert.match(await page.textContent('#ask-text'), /^Everything in "Harbour Copy" is replaced by "Imported Tale" from imported-tale-0\.1\.0\.json\./);
  await page.click('#ask-no');
  assert.equal(await page.evaluate(() => Game.Creator.state.draft.meta.id), 'harbour-copy');
  await hideToast(page);
  await page.setInputFiles('#creator-body .cr-json-file', { name: 'imported-tale-0.1.0.json', mimeType: 'application/json', buffer: Buffer.from(other) });
  await page.waitForSelector('#ask[open]');
  await page.click('#ask-yes');
  assert.equal(await toast(page), 'Replaced the draft with "Imported Tale".');
  assert.equal(await page.evaluate(() => Game.Pack.format(Game.Creator.state.draft)), other);
  assert.equal(await page.textContent('#creator-editor-title'), 'Imported Tale');
  assert.equal(await page.textContent('#creator-json'), other, 'the view is drawn again at once');
  assert.deepEqual(await tabCounts(page), { world: 2 }, 'an unfinished pack is taken; its problems are listed, not refused');
  await page.click('#creator-undo');
  assert.equal(await page.textContent('#creator-editor-title'), 'Harbour Copy');
  await page.waitForFunction(() => !document.querySelector('#creator-tabs [data-count]'), null, { timeout: 1000 });
  // Over 400 KB: the first 200 lines and a note; Copy still gives the whole file.
  await page.evaluate(() => Game.Creator.Editor.set('world.longNote', 'y'.repeat(100000)));
  await page.waitForFunction(() => !document.querySelector('.cr-json-cut').hidden, null, { timeout: 1000 });
  const big = await page.evaluate(() => ({ lines: document.getElementById('creator-json').textContent.split('\n').length - 1, note: document.querySelector('.cr-json-cut').textContent }));
  assert.equal(big.lines, 200);
  assert.match(big.note, /^Showing the first 200 of [\d,]+ lines\. Copy JSON and Download \.json give the whole file\.$/);
});

s.test('Creator.Form.render draws any subtree from Pack.SCHEMA: rules.permadeath is a .check box and narration.preset a select, each writing its path; a number has its bounds, text waits 150 ms, a ref picks the draft\'s people and refs are chips; lists of objects and maps say which tab edits them', async h => {
  const page = await open(h);
  await page.evaluate(() => {
    const F = Game.Creator.Form;
    const S = Game.Pack.SCHEMA.fields;
    const calls = [];
    window.calls = calls;
    const on = (p, v) => calls.push([p, v]);
    const host = document.createElement('div');
    host.id = 'scratch';
    host.append(
      F.render(S.rules, { permadeath: false, dcs: { easy: 8 } }, 'rules', on),
      F.render(S.narration, {}, 'narration', on),
      F.render(S.world.fields.law, { headNpcId: 'npc_marcus' }, 'world.law', on, { pack: Game.Pack.builtIn() }),
      F.render(S.world.fields.rumours.of, { tellerIds: ['npc_marcus'] }, 'world.rumours[0]', on, { pack: Game.Pack.builtIn(), title: 'Rumour' }));
    document.body.append(host);
  });
  const r = await page.evaluate(() => {
    const q = s => document.querySelector('#scratch ' + s);
    const perm = q('[data-path="rules.permadeath"]');
    const preset = q('[data-path="narration.preset"]');
    const easy = q('[data-path="rules.dcs.easy"]');
    const head = q('[data-path="world.law.headNpcId"]');
    const people = Game.Pack.builtIn().world.npcs;
    return {
      perm: [perm.type, perm.checked, perm.closest('label').className, perm.closest('label').textContent.trim()],
      preset: [preset.tagName, [...preset.options].map(o => o.value)],
      easy: [easy.type, easy.getAttribute('inputmode'), easy.value],
      gamble: q('[data-path="rules.gamble.stake"]').getAttribute('inputmode'),
      head: [head.value, head.options.length === people.length + 1, head.options[0].textContent, head.selectedOptions[0].textContent === people.find(n => n.id === 'npc_marcus').name],
      lie: q('.cr-field[data-field="rules.floors.lie"] .cr-note').textContent,
      costs: q('.cr-field[data-field="rules.time.costs"] .cr-note').textContent,
      sections: [...document.querySelectorAll('#scratch > .cr-section > h2')].map(x => x.textContent),
      nested: q('.cr-sub[data-section="rules.romance"] > h3').textContent,
      tellers: [...q('.cr-chips[data-path="world.rumours[0].tellerIds"]').querySelectorAll('.cr-chip-text')].map(c => c.textContent)
    };
  });
  assert.deepEqual(r.perm, ['checkbox', false, 'check', 'Permadeath']);
  assert.deepEqual(r.preset, ['SELECT', ['', 'casual', 'literary', 'custom']]);
  assert.deepEqual(r.easy, ['number', 'numeric', '8']);
  assert.equal(r.gamble, 'numeric');
  assert.deepEqual(r.head, ['npc_marcus', true, 'None', true]);
  assert.equal(r.lie, 'Edited on the Rules tab');
  assert.equal(r.costs, 'Edited on the Rules tab');
  assert.deepEqual(r.sections, ['Rules', 'Narration', 'The law', 'Rumour']);
  assert.equal(r.nested, 'Romance');
  assert.equal(r.tellers.length, 1);
  const calls = await page.evaluate(() => {
    const q = s => document.querySelector('#scratch ' + s);
    const fire = (node, type) => node.dispatchEvent(new Event(type, { bubbles: true }));
    const perm = q('[data-path="rules.permadeath"]');
    perm.checked = true; fire(perm, 'change');
    const preset = q('[data-path="narration.preset"]');
    preset.value = 'literary'; fire(preset, 'change');
    preset.value = ''; fire(preset, 'change');
    const easy = q('[data-path="rules.dcs.easy"]');
    easy.value = '9'; fire(easy, 'change');
    const head = q('[data-path="world.law.headNpcId"]');
    head.value = ''; fire(head, 'change');
    const add = q('.cr-chips[data-path="world.rumours[0].tellerIds"] select');
    add.value = add.options[1].value; fire(add, 'change');
    return window.calls.slice();
  });
  assert.deepEqual(calls.slice(0, 5), [['rules.permadeath', true], ['narration.preset', 'literary'], ['narration.preset', undefined], ['rules.dcs.easy', 9], ['world.law.headNpcId', undefined]]);
  assert.equal(calls[5][0], 'world.rumours[0].tellerIds');
  assert.equal(calls[5][1].length, 2);
  // Typed text: one onChange 150 ms after the last key, not one a key.
  const typed = await page.evaluate(async () => {
    window.calls.length = 0;
    const box = document.querySelector('#scratch [data-path="narration.customGuide"]');
    for (const t of ['S', 'Sh', 'Sho', 'Short']) { box.value = t; box.dispatchEvent(new Event('input', { bubbles: true })); }
    const at0 = window.calls.length;
    await new Promise(r => setTimeout(r, 250));
    return { at0, after: window.calls.slice(), rows: box.rows, tag: box.tagName };
  });
  assert.deepEqual(typed, { at0: 0, after: [['narration.customGuide', 'Short']], rows: 3, tag: 'TEXTAREA' });
});

s.test('the Overview (a blank draft with its problems, and the built-in copy) and the JSON tab pass the mobile audit at 375 and 390; screenshots at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await newDraft(page);
    await page.fill('[data-path="meta.title"]', '');
    await page.waitForFunction(() => document.querySelector('#creator-tab-overview').dataset.count === '1');
    for (const tab of ['overview', 'json']) {
      await page.click('#creator-tab-' + tab);
      const a = await page.evaluate(audit, `blank ${tab} ${vp.width}`);
      assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    }
    await page.click('#creator-back');
    await openCopy(page, 'harbour-copy', 'Harbour Copy');
    for (const tab of ['overview', 'json']) {
      await page.click('#creator-tab-' + tab);
      const a = await page.evaluate(audit, `copy ${tab} ${vp.width}`);
      assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
    }
    // Controls are never wider than the screen, and the chips' remove buttons are 44px.
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('#creator-body .input')].every(i => i.getBoundingClientRect().right <= window.innerWidth)));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      await newDraft(page);
      await page.fill('[data-path="meta.title"]', 'The Long Night at Pittman\'s Crossing');
      await page.fill('[data-path="meta.author"]', 'Sam Ortiz');
      await page.fill('#cr-f-meta-tags-add', 'storm');
      await page.press('#cr-f-meta-tags-add', 'Enter');
      await page.fill('[data-path="meta.version"]', '0.1');
      await page.waitForFunction(() => document.querySelector('#creator-tab-overview').dataset.count === '1');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-overview-blank-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.querySelector('[data-path="meta.version"]').scrollIntoView({ block: 'center' }));
      await shot(page, `creator-overview-blank-errors-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.getElementById('creator-problems').scrollIntoView({ block: 'start' }));
      await shot(page, `creator-overview-blank-problems-${vp.width}x${vp.height}-${theme}`);
      await page.click('#creator-back');
      await openCopy(page, 'harbour-copy', 'Harbour Copy');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-overview-copy-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.querySelector('[data-path="meta.storyText"]').scrollIntoView({ block: 'center' }));
      await shot(page, `creator-overview-copy-story-${vp.width}x${vp.height}-${theme}`);
      await page.click('#creator-tab-json');
      await page.evaluate(() => { document.getElementById('creator-scroll').scrollTop = 0; });
      await shot(page, `creator-json-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
