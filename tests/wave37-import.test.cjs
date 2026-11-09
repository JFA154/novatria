'use strict';
/* Wave 37, Creator Mode, milestone 8 (task M8-A): import strictness and the
   share sheet (plan decision J, fixed rule 4: packs are data; R8: every
   import path). The hostile pack is a copy of the built-in one with a
   50,000-character meta.description, control characters and bidi marks in a
   person's name, <script> and <img onerror> in a place's description, a
   rumour's text and meta.title, javascript: strings in notes, an unknown
   top-level key and an unknown field on a person, a person with a dangling
   homeLocationId (the format calls a person's home "home", so it is a field
   the game ignores, reported where it stands), a relation cycle (a and b each
   the other's "rival"), a nesting bomb 30 deep under the unknown key's
   notes, and 5,000 tags. Pack.importText refuses it for its "<"s, naming
   each by path; with the "<"s taken out it imports after the import sheet
   ("Import anyway"), its long text cut, its hidden characters gone, its
   lists and nesting capped, the cycle kept as data, and its strings shown
   as text on the card, in the editor's header, in the Overview's fields and
   on New game's Review card. Export then import round-trips byte for byte,
   the unknown fields kept and flagged again; a save's embedded pack and a
   draft edited by hand in IndexedDB are cleaned on the way in. The share
   sheet names the file and its size; Download, Copy JSON and Share (only
   where navigator.canShare takes a File) work; both sheets pass the mobile
   audit at 375 and 390. Screenshots of both sheets at 390x844 and 1280x800
   in the Dark and Parchment themes go to $UI_SHOTS when it names a folder.
   Run with: node tests/run.cjs wave37-import */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, consent, quickStart } = require('./helpers.cjs');

const s = suite('wave37-import');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const FIXTURE = path.join(__dirname, 'fixtures', 'hostile-pack.json');
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  // Wave 37, Creator Mode, milestone 8 (task M8-B): the 18+ yes for the adult copies this file makes (helpers' consent).
  await consent(page, 'hostile-town', 'marrow-bend', 'hand-edit');
  return page;
}
async function library(page) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
}
const card = id => `#creator-cards .cr-card[data-id="${id}"]`;
const toast = page => page.waitForFunction(() => document.getElementById('toast').classList.contains('show')).then(() => page.textContent('#toast'));
const hideToast = page => page.evaluate(() => document.getElementById('toast').classList.remove('show'));

/* The hostile pack's text, made in the page from the built-in pack. fix: the "<"s left out (everything else the same). */
function hostileText(page, fix) {
  return page.evaluate(f => {
    const LT = f ? '' : '<';
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'hostile-town';
    p.meta.title = `${LT}script>alert(1)${LT}/script> Hostile "Town" & Co`;
    p.meta.description = 'D'.repeat(50000);
    p.meta.notes = 'javascript:alert(document.cookie)';
    p.meta.tags = Array.from({ length: 5000 }, (_, i) => 'tag' + i);
    const a = p.world.npcs[0];
    const b = p.world.npcs[1];
    // Control characters and bidi marks inside the name: once taken out, the name is the one the story uses.
    a.name = a.name.slice(0, 2) + '‮\u0007' + a.name.slice(2) + '⁦‏\u0000';
    a.notes = 'javascript:void(0)';
    a.x_mood = 'kept';
    b.homeLocationId = 'loc_nowhere';
    a.relations.push({ npcId: b.id, relation: 'rival' });
    b.relations.push({ npcId: a.id, relation: 'rival' });
    p.world.locations[0].description += ` ${LT}script>alert(1)${LT}/script> ${LT}img src=x onerror=alert(1)>`;
    p.world.rumours[0].text += ` ${LT}img src=x onerror=alert(1)>`;
    let bomb = 'bottom';
    for (let i = 0; i < 30; i++) bomb = { deeper: bomb };
    p.x_tooling = { notes: bomb, link: 'javascript:alert(1)' };
    return JSON.stringify(p);
  }, !!fix);
}
// The deepest nesting of objects and lists in a value (a scalar is 0).
const DEPTH = `(function depth(v) { return v && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0; })`;

s.test('the hostile pack is refused for its "<"s, each named by path; cleanStrings caps the description, strips the marks, cuts the tags to 2,000 and the bomb to 12 levels, and keeps the relation cycle; the Library\'s Import says so and adds nothing', async h => {
  const page = await open(h);
  const text = await hostileText(page, false);
  fs.writeFileSync(FIXTURE, text);
  try {
    const r = await page.evaluate(t => {
      try { Game.Pack.importText(t); return { threw: false }; } catch (e) { return { threw: true, message: e.message, problems: e.problems.map(p => [p.rule, p.path]) }; }
    }, text);
    assert.equal(r.threw, true);
    assert.deepEqual(r.problems, [['engine.markup', 'meta.title'], ['engine.markup', 'world.locations[0].description'], ['engine.markup', 'world.rumours[0].text']]);
    assert.match(r.message, /^That story pack has a problem at meta\.title: holds a "<"/);
    assert.match(r.message, / Also at world\.locations\[0\]\.description: holds a "<"/);
    assert.match(r.message, / Also at world\.rumours\[0\]\.text: holds a "<"/);
    // What the cleaning makes of it, before the check.
    const c = await page.evaluate(([t, D]) => {
      const raw = JSON.parse(t);
      const report = [];
      const p = Game.Pack.cleanStrings(raw, { report });
      const depth = eval(D);
      const [a, b] = p.world.npcs;
      return {
        description: p.meta.description.length, name: a.name, want: Game.Pack.builtIn().world.npcs[0].name, tags: p.meta.tags.length, lastTag: p.meta.tags[1999],
        bomb: depth(p.x_tooling), whole: depth(p), builtInDepth: depth(Game.Pack.builtIn()),
        cycle: [a.relations.slice(-1)[0], b.relations.slice(-1)[0]], ids: [a.id, b.id], home: b.homeLocationId, notes: [p.meta.notes, a.notes, p.x_tooling.link],
        lt: p.meta.title, rules: report.map(x => x.rule + ' ' + x.path.replace(/(\.deeper)+$/, '.deeper…')),
        same: Game.Pack.format(Game.Pack.cleanStrings(Game.Pack.builtIn())) === Game.Pack.format(Game.Pack.builtIn())
      };
    }, [text, DEPTH]);
    assert.equal(c.description, 600, 'cut to meta.description\'s cap');
    assert.equal(c.name, c.want, 'the control characters and bidi marks are gone, the name as the story wrote it');
    assert.equal(c.tags, 2000);
    assert.equal(c.lastTag, 'tag1999');
    assert.ok(c.whole <= 12 && c.bomb <= 11 && c.bomb >= 10, `the bomb is cut at 12 levels from the root (x_tooling ${c.bomb}, the pack ${c.whole})`);
    assert.ok(c.builtInDepth <= 11, 'the built-in pack is under the cap');
    assert.deepEqual(c.cycle, [{ npcId: c.ids[1], relation: 'rival' }, { npcId: c.ids[0], relation: 'rival' }], 'a relation cycle is data');
    assert.equal(c.home, 'loc_nowhere', 'an unknown field is kept');
    assert.deepEqual(c.notes, ['javascript:alert(document.cookie)', 'javascript:void(0)', 'javascript:alert(1)'], 'javascript: is only text');
    assert.match(c.lt, /^<script>/, 'a "<" is not cleaned away: the check refuses it');
    assert.deepEqual(c.rules, ['lint.import.cut meta.description', 'lint.import.cut meta.tags', 'lint.import.stripped world.npcs[0].name', 'lint.import.depth x_tooling.notes.deeper…']);
    assert.equal(c.same, true, 'a clean pack comes back byte for byte');
    // The Library's Import: the toast is the refusal, and nothing joins.
    await library(page);
    await page.setInputFiles('#creator-import-file', FIXTURE);
    assert.equal(await toast(page), r.message);
    assert.equal(await page.evaluate(() => document.getElementById('creator-share').open), false, 'no sheet for a refusal');
    assert.equal(await page.evaluate(() => Game.Storage.Library.get('hostile-town')), null);
    // Library.importText is the same path.
    assert.equal(await page.evaluate(t => { try { Game.Storage.Library.importText(t); return null; } catch (e) { return e.message; } }, text), r.message);
  } finally { fs.rmSync(FIXTURE, { force: true }); }
});

s.test('with the "<"s taken out it imports after the sheet: the warnings by path (cut, cleaned, unknown fields, the dangling homeLocationId), Cancel adds nothing, Import anyway adds the card; the title and description are text on the card, the editor header, the Overview fields and New game\'s Review card', async h => {
  const page = await open(h);
  const text = await hostileText(page, true);
  const read = await page.evaluate(t => { const r = Game.Pack.importText(t); return { rules: r.problems.map(p => [p.severity, p.rule, p.path]), unknown: r.unknown, errors: Game.Pack.errors(r.problems).length }; }, text);
  assert.equal(read.errors, 0);
  assert.deepEqual(read.unknown, ['world.npcs[0].x_mood', 'world.npcs[1].homeLocationId', 'x_tooling']);
  for (const want of [['lint.import.cut', 'meta.description'], ['lint.import.cut', 'meta.tags'], ['lint.import.stripped', 'world.npcs[0].name'], ['lint.unknownField', 'world.npcs[1].homeLocationId'], ['lint.unknownField', 'x_tooling']]) {
    assert.ok(read.rules.some(x => x[0] === 'warning' && x[1] === want[0] && x[2] === want[1]), JSON.stringify(want));
  }
  assert.ok(!read.rules.some(x => /relations/.test(x[2])), 'the relation cycle draws no problem');
  const scripts = await page.evaluate(() => document.scripts.length);
  await library(page);
  const file = { name: 'hostile-town-1.0.0.json', mimeType: 'application/json', buffer: Buffer.from(text) };
  await page.setInputFiles('#creator-import-file', file);
  await page.waitForSelector('#creator-share[open][data-sheet="import"]');
  const sheet = await page.evaluate(() => ({
    title: document.getElementById('creator-share-title').textContent,
    text: document.getElementById('creator-share-text').textContent,
    items: [...document.querySelectorAll('#creator-share-list li')].map(li => [li.querySelector('.cr-sheet-path').textContent, li.querySelector('.cr-sheet-msg').textContent]),
    more: document.getElementById('creator-share-more') ? document.getElementById('creator-share-more').textContent : null,
    buttons: [...document.querySelectorAll('#creator-share-btns button')].map(b => b.textContent),
    focus: document.activeElement.id
  }));
  assert.equal(sheet.title, 'Import "script>alert(1)/script> Hostile "Town" & Co"?');
  assert.equal(sheet.text, `The story can be played. The game noticed ${read.rules.length} things in hostile-town-1.0.0.json:`);
  assert.equal(sheet.items.length, Math.min(20, read.rules.length));
  assert.equal(sheet.more, read.rules.length > 20 ? `and ${read.rules.length - 20} more` : null);
  assert.deepEqual(sheet.items.find(x => x[0] === 'world.npcs[1].homeLocationId'), ['world.npcs[1].homeLocationId', 'is not a field this pack format knows; it is kept, and the game ignores it.']);
  assert.deepEqual(sheet.items.find(x => x[0] === 'meta.description'), ['meta.description', 'was 50,000 characters; it was cut to the most, 600 characters.']);
  assert.deepEqual(sheet.buttons, ['Cancel', 'Import anyway']);
  assert.equal(sheet.focus, 'creator-share-no', 'the safe answer has the focus');
  await page.click('#creator-share-no');
  assert.equal(await page.evaluate(() => [document.getElementById('creator-share').open, Game.Storage.Library.get('hostile-town')]).then(x => JSON.stringify(x)), '[false,null]', 'Cancel adds nothing');
  await page.setInputFiles('#creator-import-file', file);
  await page.waitForSelector('#creator-share[open][data-sheet="import"]');
  await page.click('#creator-share-yes');
  const title = 'script>alert(1)/script> Hostile "Town" & Co';
  assert.equal(await toast(page), `Imported "${title}".`);
  await page.waitForSelector(card('hostile-town'));
  const rec = await page.evaluate(() => { const r = Game.Storage.Library.get('hostile-town'); return { source: r.source, x: r.pack.x_tooling.link, home: r.pack.world.npcs[1].homeLocationId, desc: r.pack.meta.description.length }; });
  assert.deepEqual(rec, { source: 'import', x: 'javascript:alert(1)', home: 'loc_nowhere', desc: 600 });
  // Text, never markup: the card's title is the string, and no element was made from it anywhere.
  const noMarkup = () => page.evaluate(n => ({ img: document.querySelectorAll('img').length, scripts: document.scripts.length === n, alerts: window.__alerts || 0 }), scripts);
  await page.evaluate(() => { window.__alerts = 0; window.alert = () => { window.__alerts += 1; }; });
  assert.equal(await page.textContent(`${card('hostile-town')} .cr-card-title`), title);
  assert.equal(await page.evaluate(sel => document.querySelector(sel).children.length, `${card('hostile-town')} .cr-card-title`), 0);
  assert.deepEqual(await noMarkup(), { img: 0, scripts: true, alerts: 0 });
  // The editor: its header and the Overview's title and description fields.
  await page.click(`${card('hostile-town')} [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  const ed = await page.evaluate(() => ({
    head: document.getElementById('creator-editor-title').textContent, kids: document.getElementById('creator-editor-title').children.length,
    title: document.querySelector('#creator-body [data-path="meta.title"]').value, desc: document.querySelector('#creator-body [data-path="meta.description"]').value
  }));
  assert.deepEqual(ed, { head: title, kids: 0, title, desc: 'D'.repeat(600) });
  assert.deepEqual(await noMarkup(), { img: 0, scripts: true, alerts: 0 });
  // A place's description and the rumour on their tabs are text as well (the World tab's Places list).
  // New game: the pack is selected and creation reached; the title screen's pack line and the Review card are text.
  await page.click('#creator-back');
  await page.waitForSelector('#creator-library:not([hidden])');
  await page.evaluate(() => Game.Storage.saveSettings({ playChoice: 'demo' }));
  await page.click(`${card('hostile-town')} [data-action=play]`);
  await page.waitForSelector('#screen-create.active');
  assert.equal(await page.evaluate(() => Game.Pack.selected().meta.id), 'hostile-town');
  await page.click('#cr-random');
  await page.waitForSelector('#create-summary-view:not([hidden])');
  const review = await page.evaluate(() => ({ kids: [...document.querySelectorAll('#summary-card *')].map(n => n.tagName.toLowerCase()).filter(t => !['h2', 'h3', 'p', 'dl', 'dt', 'dd', 'ul', 'li', 'strong', 'span'].includes(t)), text: document.getElementById('summary-card').textContent }));
  assert.deepEqual(review.kids, [], 'the Review card is made of its own elements only');
  assert.doesNotMatch(review.text, /[\u0000-\u0008‎‏‪-‮⁦-⁩]/);
  assert.deepEqual(await noMarkup(), { img: 0, scripts: true, alerts: 0 });
  // Back out of creation (it returns to the Library it came from), then the title screen.
  await page.evaluate(() => { Game.App.cancelPrepare(); Game.UI.showScreen('title'); });
  await page.waitForSelector('#screen-title.active');
  assert.equal(await page.textContent('#title-pack'), `${title} · by Joe · adult`);
  assert.equal(await page.evaluate(() => document.getElementById('title-pack').children.length), 0);
});

s.test('export then import round-trips byte for byte (Pack.format of both equal), the unknown fields kept and flagged again; the share sheet names "<id>-<version>.json" and its size, Download gives that text, Copy JSON puts it on the clipboard, and Share is absent without navigator.canShare', async h => {
  const page = await open(h, { contextOptions: { reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] } });
  // No Web Share here, whatever the browser has: the button is absent.
  await page.evaluate(() => { try { delete Navigator.prototype.canShare; delete Navigator.prototype.share; } catch (e) { /* not there */ } });
  const text = await hostileText(page, true);
  await page.evaluate(t => Game.Storage.Library.put(Game.Pack.importText(t).pack, { source: 'import' }), text);
  await library(page);
  const want = await page.evaluate(() => { const t = Game.Pack.format(Game.Storage.Library.get('hostile-town').pack); return { text: t, kb: `${(new TextEncoder().encode(t).length / 1024).toFixed(0)} KB` }; });
  await page.click(`${card('hostile-town')} [data-action=export]`);
  await page.waitForSelector('#creator-share[open][data-sheet="share"]');
  const sh = await page.evaluate(() => ({
    title: document.getElementById('creator-share-title').textContent,
    name: document.querySelector('#creator-share-file .cr-share-name').textContent, size: document.querySelector('#creator-share-file .cr-share-size').textContent,
    note: document.getElementById('creator-share-note').textContent,
    buttons: [...document.querySelectorAll('#creator-share-btns button')].map(b => [b.id, b.textContent]), focus: document.activeElement.id
  }));
  assert.equal(sh.title, 'Share "script>alert(1)/script> Hostile "Town" & Co"');
  assert.deepEqual([sh.name, sh.size], ['hostile-town-1.0.0.json', want.kb]);
  assert.equal(sh.note, 'A story pack holds your story and its settings. It never holds your API key or a saved game.');
  assert.deepEqual(sh.buttons, [['creator-share-download', 'Download'], ['creator-share-copy', 'Copy JSON'], ['creator-share-close', 'Close']], 'no Share without navigator.canShare');
  assert.equal(sh.focus, 'creator-share-download');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#creator-share-download')]);
  assert.equal(download.suggestedFilename(), 'hostile-town-1.0.0.json');
  const got = fs.readFileSync(await download.path(), 'utf8');
  assert.equal(got, want.text);
  assert.equal(await toast(page), 'Downloaded hostile-town-1.0.0.json.');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'export', 'the focus goes back to Export');
  // The file read back: the same text, the unknown fields flagged again, nothing cut or cleaned this time.
  const again = await page.evaluate(t => { const r = Game.Pack.importText(t); return { same: Game.Pack.format(r.pack) === t, unknown: r.unknown, cleaned: r.problems.filter(p => /^lint\.import\./.test(p.rule)).length }; }, got);
  assert.deepEqual(again, { same: true, unknown: ['world.npcs[0].x_mood', 'world.npcs[1].homeLocationId', 'x_tooling'], cleaned: 0 });
  // Copy JSON.
  await hideToast(page);
  await page.click(`${card('hostile-town')} [data-action=export]`);
  await page.waitForSelector('#creator-share[open]');
  await page.click('#creator-share-copy');
  assert.match(await toast(page), /^Copied the JSON \(\d+ KB\)\.$/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), want.text);
  // Close and Escape close it with nothing done.
  await page.click(`${card('hostile-town')} [data-action=export]`);
  await page.waitForSelector('#creator-share[open]');
  await page.click('#creator-share-close');
  assert.equal(await page.evaluate(() => document.getElementById('creator-share').open), false);
  await page.click(`${card('hostile-town')} [data-action=export]`);
  await page.waitForSelector('#creator-share[open]');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('creator-share').open);
  // The JSON tab's Download .json opens the same sheet for the draft.
  await page.click(`${card('hostile-town')} [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  await page.click('#creator-tab-json');
  await page.click('#creator-json-download');
  await page.waitForSelector('#creator-share[open][data-sheet="share"]');
  assert.equal(await page.textContent('#creator-share-file .cr-share-name'), 'hostile-town-1.0.0.json');
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#creator-share-download')]);
  assert.equal(fs.readFileSync(await d2.path(), 'utf8'), await page.evaluate(() => Game.Pack.format(Game.Creator.state.draft)));
});

s.test('Share is offered when navigator.canShare takes a File (a stub through addInitScript) and receives a File of the pack\'s text; a refusal other than the person\'s cancel says so in a toast', async h => {
  const page = await h.open({ contextOptions: { reducedMotion: 'reduce' } });
  // Before the page's own scripts (so after a reload): a browser that can share files, recording what it was handed.
  await page.context().addInitScript(() => {
    window.__shared = [];
    Object.defineProperty(Navigator.prototype, 'canShare', { configurable: true, value: data => !!(data && Array.isArray(data.files) && data.files.every(f => f instanceof File)) });
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: async data => {
      if (window.__shareFails) throw Object.assign(new Error(window.__shareFails), { name: window.__shareFails === 'cancel' ? 'AbortError' : 'NotAllowedError' });
      const f = data.files[0];
      window.__shared.push({ name: f.name, type: f.type, text: await f.text(), title: data.title });
    } });
  });
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  await library(page);
  await page.click(`${card('low-water')} [data-action=export]`);
  await page.waitForSelector('#creator-share[open]');
  assert.deepEqual(await page.$$eval('#creator-share-btns button', bs => bs.map(b => b.textContent)), ['Download', 'Share', 'Copy JSON', 'Close']);
  await page.click('#creator-share-share');
  await page.waitForFunction(() => window.__shared.length === 1);
  const got = await page.evaluate(() => window.__shared[0]);
  assert.deepEqual({ name: got.name, type: got.type, title: got.title }, { name: 'low-water-1.0.0.json', type: 'application/json', title: 'Low Water' });
  assert.equal(got.text, await page.evaluate(() => Game.Pack.format(Game.Pack.builtIn())));
  // The person closing the share sheet: nothing said. Another failure: a toast.
  await page.evaluate(() => { window.__shareFails = 'cancel'; });
  await page.click(`${card('low-water')} [data-action=export]`);
  await page.click('#creator-share-share');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => document.getElementById('toast').classList.contains('show')), false);
  await page.evaluate(() => { window.__shareFails = 'Permission denied'; });
  await page.click(`${card('low-water')} [data-action=export]`);
  await page.click('#creator-share-share');
  assert.equal(await toast(page), 'This browser would not share the file (Permission denied). Use Download instead.');
});

s.test('a save exported with an embedded pack whose person\'s name carries a control character loads with it stripped; one whose pack holds a "<" is refused by path, as a missing pack is', async h => {
  const page = await open(h);
  await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'marrow-bend';
    p.meta.title = 'Marrow Bend';
    Game.Storage.Library.put(p, { source: 'created' });
    Game.Storage.saveSettings({ selectedPackId: 'marrow-bend' });
  });
  await quickStart(page, { name: 'Tomas Reed' });
  const [clean, bad, want] = await page.evaluate(() => {
    const env = JSON.parse(Game.Storage.exportJson());
    const n = env.pack.world.npcs[3];
    const name = n.name;
    n.name = name.slice(0, 1) + '\u0007‮' + name.slice(1);
    const one = JSON.stringify(env);
    env.pack.world.locations[1].description += ' <img src=x onerror=alert(1)>';
    return [one, JSON.stringify(env), name];
  });
  // A fresh device: its own IndexedDB and localStorage.
  const fresh = await open(h);
  await fresh.evaluate(() => Game.UI.showScreen('saves'));
  await fresh.setInputFiles('#import-file', { name: 'marrow-bend-tomas-reed-day-1.json', mimeType: 'application/json', buffer: Buffer.from(clean) });
  await fresh.waitForSelector('#screen-game.active');
  const r = await fresh.evaluate(() => ({ pack: Game.State.pack.meta.id, name: Game.State.pack.world.npcs[3].name, lib: Game.Storage.Library.get('marrow-bend').pack.world.npcs[3].name }));
  assert.deepEqual(r, { pack: 'marrow-bend', name: want, lib: want });
  const other = await open(h);
  const said = await other.evaluate(async t => { try { await Game.Storage.importFile(new File([t], 'bad.json', { type: 'application/json' })); return null; } catch (e) { return e.message; } }, bad);
  assert.equal(said, 'This save\'s story pack Marrow Bend cannot be played: it has a problem at world.locations[1].description: holds a "<": pack text is shown as plain text and inlined in the page, so it may not carry markup.');
  assert.equal(await other.evaluate(() => Game.Storage.Library.get('marrow-bend')), null, 'nothing joins the Library');
});

s.test('a draft edited by hand in IndexedDB (an unknown key, hidden characters in its title) still opens after a reload, cleaned, the unknown key kept and listed as a warning', async h => {
  const page = await open(h);
  const id = await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    p.meta.id = 'hand-edit';
    p.meta.title = 'Hand Edit';
    return Game.Storage.Drafts.put({ pack: p }).id;
  });
  await page.evaluate(() => Game.Storage.undoIdle());
  // The hand edit, straight into the store.
  await page.evaluate(i => new Promise((resolve, reject) => {
    const req = indexedDB.open(Game.Storage.UNDO_DB);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction('drafts', 'readwrite');
      const st = t.objectStore('drafts');
      const g = st.get(i);
      g.onsuccess = () => {
        const rec = g.result;
        rec.pack.meta.title = 'Hand‮\u0007 Edit';
        rec.pack.world.npcs[0].x_secret = 'by‏ hand';
        st.put(rec);
      };
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
  }), id);
  await page.reload();
  await page.waitForFunction(() => window.Game && window.Game.App);
  await page.evaluate(async () => { await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  assert.equal(await page.evaluate(i => Game.Storage.Drafts.get(i).pack.meta.title, id), 'Hand‮\u0007 Edit', 'the store holds the hand edit');
  await library(page);
  await page.click(`${card(id)} [data-action=open]`);
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  const d = await page.evaluate(() => ({ title: Game.Creator.state.draft.meta.title, head: document.getElementById('creator-editor-title').textContent, x: Game.Creator.state.draft.world.npcs[0].x_secret }));
  assert.deepEqual(d, { title: 'Hand Edit', head: 'Hand Edit', x: 'by hand' });
  await page.waitForFunction(() => Game.Creator.Editor.problems.some(p => p.rule === 'lint.unknownField'), null, { timeout: 3000 });
  const flagged = await page.evaluate(() => Game.Creator.Editor.problems.filter(p => p.rule === 'lint.unknownField').map(p => [p.severity, p.path]));
  assert.deepEqual(flagged, [['warning', 'world.npcs[0].x_secret']]);
  assert.equal(await page.evaluate(() => Game.Pack.errors(Game.Creator.Editor.problems).length), 0);
});

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider than the screen. */
function audit(label) {
  const W = window.innerWidth;
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const TAP = 'button, [role=tab], [role=menuitem], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, .seg label, #ac li, a[href]';
  // With a modal sheet open only the sheet can be touched.
  const top = document.querySelector('dialog[open]') || document;
  const small = [...top.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...top.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
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
  const d = document.querySelector('dialog[open]');
  const dr = d ? d.getBoundingClientRect() : null;
  return { label, small, fonts, wide: wide.slice(0, 10), inside: !dr || (dr.left >= 0 && dr.right <= W && dr.top >= 0 && dr.bottom <= window.innerHeight + 1) };
}
/* Both sheets open in turn on page: the import sheet (the hostile pack without its "<"s), then the share sheet of that pack. */
async function sheets(page, text, each) {
  await library(page);
  await page.setInputFiles('#creator-import-file', { name: 'hostile-town-1.0.0.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForSelector('#creator-share[open][data-sheet="import"]');
  await each('import');
  await page.click('#creator-share-yes');
  await page.waitForSelector(card('hostile-town'));
  await hideToast(page);
  await page.click(`${card('hostile-town')} [data-action=export]`);
  await page.waitForSelector('#creator-share[open][data-sheet="share"]');
  await each('share');
  await page.click('#creator-share-close');
}

s.test('both sheets pass the mobile audit at 375 and 390 (44px buttons, nothing wider than the screen, the sheet inside it); screenshots at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    const text = await hostileText(page, true);
    await sheets(page, text, async kind => {
      const a = await page.evaluate(audit, `${kind} ${vp.width}`);
      assert.deepEqual([a.small, a.fonts, a.wide, a.inside], [[], [], [], true], JSON.stringify(a));
      if (kind === 'share') {
        const hs = await page.$$eval('#creator-share-btns .cr-share-btns button', bs => bs.map(b => Math.round(b.getBoundingClientRect().height)));
        assert.ok(hs.length === 2 && hs.every(x => x >= 44), JSON.stringify(hs));
      }
    });
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      const text = await hostileText(page, true);
      await sheets(page, text, kind => shot(page, `creator-${kind}-sheet-${vp.width}x${vp.height}-${theme}`));
    }
  }
});

s.run();
