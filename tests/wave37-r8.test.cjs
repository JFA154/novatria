'use strict';
/* Wave 37, Creator Mode, milestone 8, the security review R8 (task M8-D):
   one test per fix, the reviewer's probes' cases reused.
   1 (M1) Pipeline.updateGame (Settings' "Re-read this game", App.updateSave)
     and Pipeline.arrival refuse a story waiting on the 18+ yes, with
     runTurn's notice: Api.Mock.calls, Api.responses and the log unchanged;
     with the yes back, the re-read runs.
   2 (S1) the converter: a record is "not in your text" unless its quote has
     six words or more, is in the text, and holds the record's name (or the
     sentence before it does); a string field starts ticked only when it is
     words of the text or a listed id, a number only when the quote states
     it, an enum always; Accept all writes the ticked fields only. The owner:
     "I want to keep the story itself away from AI generated".
   3 (S2) a draft's undo entries from IndexedDB are cleaned as the draft is
     (Pack.cleanStrings); a malformed one is dropped, not thrown.
   4 (S3) a pack's export blanks the API key (Storage.redact), the Library
     record unchanged.
   5 (S4) Play this story asks before it changes the selected story; Not now
     changes nothing, and a yes is not asked again by New game.
   6 (N2) UI.askConsent while its dialog is open: the same story gets the
     same promise; another story settles the first one false.
   7 (N3) the converter's ids and review come from cleaned names.
   8 (N4) the share sheet's file name falls back to story-0.0.0 for an id or
     version out of its schema's form.
   Run with: node tests/run.cjs wave37-r8 */
const assert = require('assert/strict');
const { suite, quickStart, consent } = require('./helpers.cjs');

const s = suite('wave37-r8');
const KEY = 'sk-ant-test-0123456789';
const NOTICE = 'This story needs your 18+ confirmation first; start it again from the title screen, which asks.';
const CTL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/;
const STORY = [
  'Saltmere is a small harbour town on a grey northern coast, where the tide decides most things.',
  'The harbour is the heart of it: a stone quay, a fish market and a row of tarred sheds that smell of rope and diesel.',
  'Most evenings the fishermen drink at the Gull Inn, a low room with a fire that never quite warms the corners.',
  'Mara Quell runs the chandlery on the quay.',
  'She is fifty, sharp with money and kind to children, and she keeps a ledger nobody else may read.',
  'Tobias Wren is the harbourmaster, a tired man in a pressed coat who wants a quiet life and a full pension.',
  'The Harbour Board wants to sell the old quay to a salt company from the south, and Tobias has already signed the first papers.',
  'The lighthouse stands dark at the end of the breakwater; its keeper left in the winter and nobody replaced him.',
  'You arrive on the evening ferry with a letter for Mara Quell and no idea what it says.'
].join(' ');

async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
// A new draft in the editor with the story typed into "Your story, in your words" (demo mode).
async function draftWithStory(page) {
  await page.evaluate(() => Game.Storage.saveSettings({ mockMode: true }));
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  // Wave 38: New story opens the first pages; their Skip makes the blank draft and opens the editor.
  await page.click('#creator-empty-new');
  await page.click('#creator-begin-skip');
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  await page.fill('[data-path="meta.storyText"]', STORY);
  await page.waitForFunction(t => Game.Creator.state.draft.meta.storyText === t, STORY);
}
// The people call answers with these records; every other call with nothing.
function queuePeople(page, rows) {
  return page.evaluate(rows => {
    const P = o => Object.assign({ pronouns: null, age: null, role: null, look: null, voice: null, personality: [], goal: null, secret: null, history: null, home: null, phases: [] }, o);
    Game.Api.Mock.queue('convert', { items: [] });
    Game.Api.Mock.queue('convert', { items: rows.map(P) });
    for (let i = 0; i < 4; i++) Game.Api.Mock.queue('convert', { items: [] });
    Game.Api.Mock.queue('convert', { premise: null, text: null, firstTurn: null, source: '' });
  }, rows);
}
async function convert(page) {
  await page.click('#creator-convert-run');
  await page.waitForFunction(() => !Game.Creator.Convert.running && !document.querySelector('.cr-convert[data-running="1"]'));
  return page.evaluate(() => Game.Creator.Convert.review.map(i => ({ kind: i.kind, id: i.id, name: i.name, inText: i.inText, on: i.on, fields: Object.fromEntries(i.fields.map(f => [f.k, f.on])) })));
}
const counts = page => page.evaluate(() => ({ mock: Game.Api.Mock.calls.length, responses: Game.Api.responses.length, log: Game.state.log.length }));

s.test('1 (M1): with the yes withdrawn mid-game, Re-read this game (App.updateGame) and the arrival send nothing and show the notice; with the yes back the re-read runs', async h => {
  const page = await open(h);
  await quickStart(page);
  await page.evaluate(() => Game.Storage.savePerPack('low-water', { adultOk: null }));
  const before = await counts(page);
  const r = await page.evaluate(() => Game.App.updateGame());
  assert.deepEqual(r, { ok: false, reason: 'consent' });
  const a = await page.evaluate(() => Game.Pipeline.arrival());
  assert.deepEqual(a, { ok: false, reason: 'consent' });
  assert.deepEqual(await counts(page), before, 'no Api call, no response, no log line');
  const notices = await page.$$eval('#feed .f-notice', ns => ns.map(n => n.textContent));
  assert.equal(notices.filter(t => t === NOTICE).length, 2, JSON.stringify(notices));
  // The yes back: the re-read runs (its steps reach the mock).
  await consent(page, 'low-water');
  const r2 = await page.evaluate(() => Game.App.updateGame());
  assert.equal(r2.ok, true, JSON.stringify(r2).slice(0, 200));
  assert.ok((await counts(page)).mock > before.mock, 'the re-read reached the (mock) Api');
});

s.test('2 (S1): an invented record riding a real quote, a one-word quote, and fields the quote contradicts are unticked; Accept all writes only the ticked', async h => {
  const page = await open(h);
  await draftWithStory(page);
  await queuePeople(page, [
    { name: 'Captain Zed Morrow', role: 'smuggler king', secret: 'He murdered the old keeper.', source: 'The lighthouse stands dark at the end of the breakwater; its keeper left in the winter and nobody replaced him.' },
    { name: 'Mara Quell', age: 90, look: 'cruel to children and generous with money', personality: ['sharp with money', 'kind to children'], pronouns: 'she', source: 'She is fifty, sharp with money and kind to children, and she keeps a ledger nobody else may read.' },
    { name: 'Tobias Wren', age: 50, role: 'harbourmaster', goal: 'a quiet life and a full pension', source: 'Tobias Wren is the harbourmaster, a tired man in a pressed coat who wants a quiet life and a full pension.' },
    { name: 'Igor the Butcher', goal: 'to rule Saltmere', source: 'harbour' }
  ]);
  const items = await convert(page);
  const by = n => items.find(i => i.name === n);
  assert.deepEqual([by('Captain Zed Morrow').inText, by('Captain Zed Morrow').on], [false, false], 'the lighthouse quote does not name him');
  assert.deepEqual([by('Igor the Butcher').inText, by('Igor the Butcher').on], [false, false], 'a one-word quote');
  // Mara: named in the sentence before her quote; her quoted words ticked, the invented ones not.
  assert.deepEqual([by('Mara Quell').inText, by('Mara Quell').on], [true, true]);
  assert.deepEqual(by('Mara Quell').fields, { pronouns: true, age: false, look: false, personality: true });
  // Tobias: an age the quote does not state is off; his own words on.
  assert.deepEqual(by('Tobias Wren').fields, { age: false, role: true, goal: true });
  // inText alone still answers the quote question.
  assert.equal(await page.evaluate(t => Game.Creator.Convert.inText('harbour', t), STORY), true);
  await page.click('[data-cv=accept-all]');
  const npcs = await page.evaluate(() => Game.Creator.state.draft.world.npcs.map(n => ({ name: n.name, age: n.age, look: n.look, role: n.role })));
  assert.deepEqual(npcs.map(n => n.name), ['Mara Quell', 'Tobias Wren'], 'Accept all skips the ones not in your text');
  assert.deepEqual([npcs[0].age, npcs[0].look, npcs[1].age, npcs[1].role], [undefined, undefined, undefined, 'harbourmaster']);
});

s.test('3 (S2): Undo onto a hostile entry from IndexedDB cleans it (control and bidi characters out); a malformed entry is dropped and the draft stays', async h => {
  const page = await open(h);
  const r = await page.evaluate(() => {
    const raw = Game.Pack.copy(Game.Pack.builtIn()); raw.meta.id = 'probe-draft'; raw.meta.title = 'Probe';
    const evil = Game.Pack.copy(raw); evil.meta.title = 'UNDO\u0007‮EVIL'; evil.meta.description = 'U'.repeat(60000);
    const dr = Game.Storage.Drafts.put({ fromPackId: null, pack: raw, undo: [JSON.stringify(evil), '{not json'] });
    Game.UI.showScreen('creator');
    const C = Game.Creator;
    C.state.view = 'editor'; C.state.draftId = dr.id; C.render();
    const out = {};
    out.first = C.Editor.undo();
    out.titleAfterBad = C.state.draft.meta.title;
    out.second = C.Editor.undo();
    out.title = C.state.draft.meta.title;
    out.desc = C.state.draft.meta.description.length;
    out.head = document.getElementById('creator-editor-title').textContent;
    return out;
  });
  assert.deepEqual([r.first, r.titleAfterBad], [false, 'Probe'], 'the malformed entry: no step, the draft as it was');
  assert.deepEqual([r.second, r.title, r.head], [true, 'UNDOEVIL', 'UNDOEVIL']);
  assert.equal(r.desc, 60000, 'lengths kept for the editor to report');
});

s.test('4 (S3): a key typed into a Library pack\'s notes is [redacted] in its export (by id and as a draft); the Library record keeps it', async h => {
  const page = await open(h);
  const r = await page.evaluate(k => {
    Game.Storage.setApiKey(k, false);
    const p = Game.Pack.copy(Game.Pack.builtIn()); p.meta.id = 'keyed'; p.meta.notes = 'my key is ' + k;
    Game.Storage.Library.put(p, { source: 'import' });
    return { byId: Game.Storage.Library.exportText('keyed'), asPack: Game.Storage.Library.exportText(p), rec: Game.Storage.Library.get('keyed').pack.meta.notes, redact: Game.Storage.redact('a ' + k + ' b') };
  }, KEY);
  for (const t of [r.byId, r.asPack]) { assert.ok(!t.includes(KEY)); assert.equal(JSON.parse(t).meta.notes, 'my key is [redacted]'); }
  assert.equal(r.rec, 'my key is ' + KEY, 'the record itself unchanged');
  assert.equal(r.redact, 'a [redacted] b');
});

s.test('5 (S4): Play this story on an adult card asks first; Not now leaves the selected story as it was; a yes selects it and New game does not ask again', async h => {
  const page = await open(h, { consent: false });
  await page.evaluate(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn()); p.meta.id = 'adult-two'; p.meta.title = 'Adult Two';
    Game.Storage.Library.put(p, { source: 'import' });
    window.__asks = 0;
    const d = document.getElementById('consent'); const show = d.showModal.bind(d); d.showModal = () => { window.__asks++; show(); };
  });
  const sel = () => page.evaluate(() => Game.Storage.settings().selectedPackId);
  const before = await sel();
  await page.click('#btn-create');
  const play = '#creator-cards .cr-card[data-id="adult-two"] [data-action=play]';
  await page.waitForSelector(play);
  await page.click(play);
  await page.waitForSelector('#consent[open]');
  assert.equal(await sel(), before, 'nothing changed while it asks');
  await page.click('#consent-no');
  await page.waitForFunction(() => !document.getElementById('consent').open);
  assert.deepEqual([await sel(), await page.evaluate(() => Game.UI.screen)], [before, 'creator']);
  await page.click(play);
  await page.waitForSelector('#consent[open]');
  await page.click('#consent-check');
  await page.click('#consent-yes');
  await page.waitForFunction(() => Game.UI.screen !== 'creator');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ asks: window.__asks, open: document.getElementById('consent').open, ok: Game.Storage.perPack('adult-two').adultOk }));
  assert.equal(await sel(), 'adult-two');
  assert.deepEqual(after, { asks: 2, open: false, ok: true }, 'two asks (Not now, then the yes), none from New game');
});

s.test('6 (N2): askConsent twice for the same story gives one promise and one Continue answers both; for another story the first is settled Not now and the second\'s Continue writes its yes', async h => {
  const page = await open(h, { consent: false });
  const r = await page.evaluate(async () => {
    const wait = () => new Promise(res => setTimeout(res, 100));
    const yes = () => { document.getElementById('consent-check').click(); document.getElementById('consent-yes').click(); };
    const p = Game.Pack.builtIn();
    const res = [];
    const a = Game.UI.askConsent(p);
    const b = Game.UI.askConsent(p);
    a.then(v => res.push(['first', v])); b.then(v => res.push(['second', v]));
    await wait();
    const same = a === b;
    yes();
    await wait();
    const other = Game.Pack.copy(p); other.meta.id = 'other-story'; other.meta.title = 'Other';
    const c = Game.UI.askConsent(Object.assign(Game.Pack.copy(p), { meta: Object.assign({}, p.meta, { id: 'third-story' }) }));
    const res2 = [];
    c.then(v => res2.push(['third', v]));
    await wait();
    const d = Game.UI.askConsent(other);
    d.then(v => res2.push(['other', v]));
    await wait();
    const openNow = document.getElementById('consent').open;
    const title = document.getElementById('consent-title').textContent;
    yes();
    await wait();
    return { same, res, res2, openNow, title, open: document.getElementById('consent').open, low: Game.Storage.perPack('low-water').adultOk, other: Game.Storage.perPack('other-story').adultOk, third: Game.Storage.perPack('third-story').adultOk };
  });
  assert.equal(r.same, true);
  assert.deepEqual(r.res, [['first', true], ['second', true]]);
  assert.equal(r.low, true);
  assert.deepEqual(r.res2, [['third', false], ['other', true]]);
  assert.deepEqual([r.openNow, r.title, r.open, r.other, r.third], [true, 'Other', false, true, undefined]);
});

s.test('7 (N3): a name with a control character and a text-direction mark comes out cleaned in the id, the review and the draft', async h => {
  const page = await open(h);
  await draftWithStory(page);
  await queuePeople(page, [{ name: 'Ell\u0007ie‮ Wren', role: 'the harbourmaster\u0007', source: 'Saltmere is a small harbour town on a grey northern coast, where the tide decides most things.' }]);
  const items = await convert(page);
  assert.deepEqual(items.map(i => [i.id, i.name]), [['npc_ellie', 'Ellie Wren']]);
  const shown = await page.textContent('#creator-convert');
  assert.ok(shown.includes('Ellie Wren') && !CTL.test(shown), 'the review draws no hidden character');
  const role = await page.evaluate(() => Game.Creator.Convert.review[0].fields.find(f => f.k === 'role').value);
  assert.equal(role, 'the harbourmaster');
  // Not in your text (the quote does not name her), so ticked by hand: the draft gets the cleaned record.
  const npc = await page.evaluate(() => { Game.Creator.Convert.review[0].on = true; Game.Creator.Convert.accept(); return Game.Creator.state.draft.world.npcs.map(n => [n.id, n.name, n.role]); });
  assert.deepEqual(npc, [['npc_ellie', 'Ellie Wren', 'the harbourmaster']]);
});

s.test('8 (N4): the share sheet names a draft with a "../" id and version story-0.0.0.json, and a well-formed one <id>-<version>.json', async h => {
  const page = await open(h, { contextOptions: { reducedMotion: 'reduce', acceptDownloads: true } });
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  // Wave 38: New story opens the first pages; their Skip makes the blank draft and opens the editor.
  await page.click('#creator-empty-new');
  await page.click('#creator-begin-skip');
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  const sheetName = async () => {
    await page.evaluate(() => Game.Creator.selectTab('json'));
    await page.click('#creator-json-download');
    await page.waitForSelector('#creator-share[open][data-sheet="share"]');
    const n = await page.textContent('#creator-share-file .cr-share-name');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }), page.click('#creator-share-download')]);
    return [n, dl.suggestedFilename()];
  };
  await page.evaluate(() => { Game.Creator.Editor.set('meta.id', '../../evil/x'); Game.Creator.Editor.set('meta.version', '1/../../../2'); });
  assert.deepEqual(await sheetName(), ['story-0.0.0.json', 'story-0.0.0.json']);
  await page.evaluate(() => { Game.Creator.Editor.set('meta.id', 'harbour-tale'); Game.Creator.Editor.set('meta.version', '1.2.0'); });
  assert.deepEqual(await sheetName(), ['harbour-tale-1.2.0.json', 'harbour-tale-1.2.0.json']);
});

s.run();
