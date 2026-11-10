'use strict';
/* Wave 38, the first pages (Creator.Begin). The owner: "Creating a story
   should be an experience, not something clunky and daunting." The
   Library's New story opens nine steps, one question each, with the story's
   title page filling in beside them; the last step plays the story or opens
   the editor.
   - New story opens the first pages and makes nothing until something is
     typed; leaving them untouched leaves no draft, and one typed in and
     emptied again is taken away.
   - The first key makes the draft; each step writes the pack; walking all
     nine gives a story with no error (two places with exits to each other,
     one at each arrival point; a person somewhere in all four phases; a
     background with its age, stats, money, things and arrival), with ids
     slugged from the finished names and the pack's id from the title.
   - The title page shows what was written and ghost lines for the rest.
   - Step inside starts a test game from the draft, which opens with the
     author's first lines (opening.text, read by the game since this wave)
     and then the arrival: the local text in the demo, the narrator's with a
     key. A story without first lines opens as before. Back to the editor
     returns to the draft. Keep writing and Skip to the full editor open the
     editor; Back keeps the draft and says so.
   - The last step names what is missing, each a button to its step, and
     Step inside is off until the story can be played.
   - Opened on a draft that already has places and people (the Overview's
     Open the first pages), a step changes only the field typed in: no id
     renamed, no exit added, no schedule moved, nothing removed.
   - Enter goes on from a one-line field; the header's Undo never walks
     back through the first pages.
   - Every step passes the mobile audit at 375 and 390 (44px targets, 16px
     inputs, nothing wider than the screen).
   Screenshots go to $UI_SHOTS when it names a folder (none without it).
   Run with: node tests/run.cjs wave38-begin */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite, overflowReport } = require('./helpers.cjs');

const s = suite('wave38-begin');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

/* A page on the Library with the stores read, and the mock answering at once. */
async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  await page.click('#btn-create');
  return page;
}
const step = page => page.evaluate(() => Game.Creator.Begin.STEPS[Game.Creator.Begin.state.step].id);
const draft = page => page.evaluate(() => Game.Creator.state.draft);
const drafts = page => page.evaluate(() => Game.Storage.Drafts.index().length);
const next = page => page.click('#creator-begin-next');
const pick = (page, group, value) => page.locator(`#creator-begin-${group} input[value="${value}"]`).check({ force: true });

/* The nine steps, written as an author would. */
async function writeStory(page) {
  await page.click('#creator-empty-new');
  await page.fill('#creator-begin-title', 'The Salt Road');
  await page.fill('#creator-begin-author', 'Sam Ortiz');
  await next(page);
  await pick(page, 'era', 'fantasy');
  await page.fill('#creator-begin-town', 'Harrowmere');
  await page.fill('#creator-begin-about', 'A walled town at the end of a causeway. The sea takes the road twice a day.');
  await next(page);
  await page.fill('#creator-begin-premise', 'The causeway bell rang last night with nobody at the rope.');
  await next(page);
  await page.fill('#creator-begin-a-name', 'The Causeway Gate');
  await page.fill('#creator-begin-a-text', 'Salt-eaten stone and a rusted portcullis.');
  await page.fill('#creator-begin-b-name', 'The Lantern Inn');
  await page.fill('#creator-begin-b-text', 'Low beams and a peat fire.');
  await next(page);
  await page.fill('#creator-begin-who', 'Mara Voss');
  await page.fill('#creator-begin-role', 'keeps the inn');
  await pick(page, 'pronouns', 'she');
  await page.fill('#creator-begin-look', 'A tall, tired woman with ink on her fingers.');
  await next(page);
  await page.fill('#creator-begin-you', 'Sellsword');
  await page.fill('#creator-begin-blurb', 'You walked the causeway at low tide with a sword you still owe money on.');
  await next(page);
  await pick(page, 'voice', 'literary');
  await pick(page, 'rating', 'teen');
  await next(page);
  await page.fill('#creator-begin-first', 'The tide is already over the stones behind you.');
  await next(page);
}

s.test('New story opens the first pages on their first step and makes no draft; Back leaves none; a draft typed in and emptied again is taken away', async h => {
  const page = await open(h);
  assert.deepEqual(await page.$$eval('#creator-empty button', bs => bs.map(x => x.textContent)), ['Begin a story', 'Import a .json']);
  await page.click('#creator-empty-new');
  assert.equal(await page.evaluate(() => Game.Creator.state.view), 'begin');
  assert.ok(await page.isVisible('#creator-begin'));
  assert.ok(!(await page.isVisible('#creator-library')) && !(await page.isVisible('#creator-editor')));
  assert.equal(await step(page), 'name');
  assert.equal(await page.textContent('#creator-begin-q'), 'What is your story called?');
  assert.equal(await page.textContent('.cr-begin-count'), 'Page 1 of 9');
  assert.equal(await page.textContent('#creator-title'), 'A new story');
  assert.deepEqual(await page.$$eval('#creator-begin-steps .cr-begin-step', bs => bs.map(b => b.textContent)), ['Name', 'World', 'Trouble', 'Places', 'Someone', 'You', 'Voice', 'First line', 'Ready']);
  assert.ok(!(await page.isVisible('#creator-begin-prev')), 'the first step has no Back of its own');
  assert.equal(await drafts(page), 0);
  assert.equal(await draft(page), null);
  // Walking the steps with nothing written still makes nothing.
  await next(page);
  assert.equal(await step(page), 'world');
  assert.ok(await page.isVisible('#creator-begin-prev'));
  await page.click('#creator-begin-prev');
  assert.equal(await step(page), 'name');
  assert.equal(await drafts(page), 0);
  await page.click('#creator-back');
  assert.equal(await page.evaluate(() => Game.Creator.state.view), 'library');
  assert.equal(await drafts(page), 0);
  // Typed and emptied: the draft made by the first key goes again on the way out.
  await page.click('#creator-empty-new');
  await page.fill('#creator-begin-title', 'A');
  assert.equal(await drafts(page), 1);
  await page.fill('#creator-begin-title', '');
  await page.click('#creator-back');
  assert.equal(await drafts(page), 0);
  assert.ok(await page.isVisible('#creator-empty'));
});

s.test('the nine steps write a story that validates: two linked places at the arrival points, a person in all four phases, a background that can start, ids from the finished names', async h => {
  const page = await open(h);
  await writeStory(page);
  assert.equal(await step(page), 'ready');
  const d = await draft(page);
  assert.equal(d.meta.title, 'The Salt Road');
  assert.equal(d.meta.author, 'Sam Ortiz');
  assert.match(d.meta.id, /^the-salt-road-[a-z0-9]{4}$/);
  assert.equal(d.meta.rating, 'teen');
  assert.equal(d.setting.era, 'fantasy');
  assert.equal(d.setting.blurb, 'A walled town at the end of a causeway.');
  assert.equal(d.world.name, 'Harrowmere');
  assert.equal(d.world.setting, 'A walled town at the end of a causeway. The sea takes the road twice a day.');
  assert.deepEqual(d.opening, { premise: 'The causeway bell rang last night with nobody at the rope.', text: 'The tide is already over the stones behind you.' });
  assert.deepEqual(d.narration, { preset: 'literary' });
  assert.deepEqual(d.world.locations.map(l => [l.id, l.name, l.exits]), [['loc_causeway_gate', 'The Causeway Gate', ['loc_lantern_inn']], ['loc_lantern_inn', 'The Lantern Inn', ['loc_causeway_gate']]]);
  assert.deepEqual(d.world.startLocationIds, { gate: 'loc_causeway_gate', docks: 'loc_lantern_inn' });
  const who = d.world.npcs[0];
  assert.deepEqual([d.world.npcs.length, who.id, who.name, who.role, who.pronouns, who.look, who.home], [1, 'npc_mara', 'Mara Voss', 'keeps the inn', 'she', 'A tall, tired woman with ink on her fingers.', 'loc_causeway_gate']);
  for (const p of ['morning', 'afternoon', 'evening', 'night']) assert.deepEqual(d.world.locations[0].npcIdsBySchedule[p], ['npc_mara'], p);
  const bg = d.player.backgrounds[0];
  assert.deepEqual([d.player.backgrounds.length, bg.id, bg.name, bg.arrival, Array.isArray(bg.items)], [1, 'bg_sellsword', 'Sellsword', 'gate', true]);
  assert.deepEqual(await page.evaluate(() => Game.Pack.errors(Game.Pack.validate(Game.Creator.state.draft, { profile: 'play' }))), []);
  // The draft is kept as it is written (the editor's autosave), with no undo steps from the first pages.
  await page.waitForFunction(() => { const r = Game.Storage.Drafts.index()[0]; return r && r.pack.meta.title === 'The Salt Road' && r.pack.world.npcs.length === 1; }, null, { timeout: 2000 });
  assert.equal(await page.evaluate(() => Game.Creator.Editor.undoDepth), 0);
  // The last step: ready, the page whole, both ways on.
  assert.equal(await page.textContent('#creator-begin-q'), 'Your story is ready.');
  assert.equal(await page.$('#creator-begin-missing'), null);
  assert.ok(await page.isEnabled('#creator-begin-play'));
  const final = await page.textContent('#creator-begin-final');
  for (const t of ['A fantasy', 'The Salt Road', 'by Sam Ortiz', 'Harrowmere', 'A walled town at the end of a causeway.', 'The Causeway Gate', 'The Lantern Inn', 'Mara Voss, keeps the inn', 'Sellsword', 'Told like a novel · For teens and up']) assert.ok(final.includes(t), `the page says "${t}"`);
  assert.equal(await page.$$eval('#creator-begin-final .cr-page-ghost', g => g.length), 0);
  assert.ok(!(await page.isVisible('#creator-begin-next')) && !(await page.isVisible('#creator-begin-skip')));
  assert.deepEqual(await page.$$eval('#creator-begin-steps .cr-begin-step', bs => bs.map(b => b.dataset.done)), ['1', '1', '1', '1', '1', '1', '1', '1', '1']);
  await shot(page, 'begin-ready-1280');
});

s.test('the title page beside the steps fills in as the story is written, with ghost lines for what is not there yet; the era changes the examples', async h => {
  const page = await open(h);
  await page.click('#creator-empty-new');
  assert.ok(await page.isVisible('#creator-begin-page'), 'the page shows beside the step at 1280');
  assert.equal(await page.textContent('#creator-begin-page .cr-page-title'), 'Untitled');
  const ghosts = await page.$$eval('#creator-begin-page .cr-page-ghost', g => g.length);
  assert.ok(ghosts >= 8, `an empty page is ghost lines (${ghosts})`);
  await page.fill('#creator-begin-title', 'Night Ferry');
  assert.equal(await page.textContent('#creator-begin-page .cr-page-title'), 'Night Ferry');
  assert.equal(await page.$('#creator-begin-page .cr-page-by'), null);
  await page.fill('#creator-begin-author', 'Ada');
  assert.equal(await page.textContent('#creator-begin-page .cr-page-by'), 'by Ada');
  assert.ok((await page.$$eval('#creator-begin-page .cr-page-ghost', g => g.length)) < ghosts);
  await next(page);
  assert.equal(await page.textContent('#creator-begin-page .cr-page-kicker'), 'A story of the present day');
  const before = await page.getAttribute('#creator-begin-town', 'placeholder');
  await pick(page, 'era', 'future');
  assert.equal(await page.textContent('#creator-begin-page .cr-page-kicker'), 'A story of the future');
  assert.notEqual(await page.getAttribute('#creator-begin-town', 'placeholder'), before);
  // The place goes by the story's name until it has one of its own; then the page shows it.
  assert.equal((await draft(page)).world.name, 'Night Ferry');
  assert.equal(await page.$('#creator-begin-page .cr-page-town'), null);
  await page.fill('#creator-begin-town', 'Tessera Station');
  assert.equal(await page.textContent('#creator-begin-page .cr-page-town'), 'Tessera Station');
  assert.equal((await draft(page)).world.name, 'Tessera Station');
  // A step's name on the strip goes to it, and what was written is there again.
  await page.click('#creator-begin-steps [data-step="name"]');
  assert.equal(await step(page), 'name');
  assert.equal(await page.inputValue('#creator-begin-title'), 'Night Ferry');
  assert.equal(await page.getAttribute('#creator-begin-steps [data-step="name"]', 'aria-current'), 'step');
});

s.test('Step inside starts a test game from the draft and Back to the editor returns to it; Keep writing opens the editor; the header\'s Back keeps the draft and says so', async h => {
  const page = await open(h);
  await writeStory(page);
  const id = await page.evaluate(() => Game.Creator.state.draftId);
  await page.click('#creator-begin-play');
  await page.waitForFunction(() => Game.UI.screen === 'game' && !Game.Pipeline.busy);
  const meta = await page.evaluate(() => ({ source: Game.State.current.meta.packSource, draftId: Game.State.current.meta.draftId, title: Game.State.pack.meta.title, at: Game.State.current.player.locationId, bg: Game.State.current.player.backgroundId }));
  assert.deepEqual(meta, { source: 'draft', draftId: id, title: 'The Salt Road', at: 'loc_causeway_gate', bg: 'bg_sellsword' });
  assert.ok(await page.isVisible('#test-bar'));
  // The author's first lines open the story, word for word, and the arrival follows in the same entry.
  const log = await page.evaluate(() => Game.state.log.map(e => e.narration));
  assert.equal(log.length, 1);
  assert.ok(log[0].startsWith('The tide is already over the stones behind you.\n\n'), log[0]);
  assert.ok(log[0].includes('You come in on foot by the road and stop at the Causeway Gate, on the edge of Harrowmere. Salt-eaten stone and a rusted portcullis.'), log[0]);
  assert.ok(log[0].endsWith('You notice a tall, tired woman with ink on her fingers.'), 'someone made here is where the newcomer arrives, introduced by their look');
  assert.equal((await page.innerText('#feed')).split('The tide is already over the stones behind you.').length, 2, 'shown once');
  await page.click('#test-bar-back');
  assert.deepEqual(await page.evaluate(() => [Game.UI.screen, Game.Creator.state.view, Game.Creator.state.draftId]), ['creator', 'editor', id]);
  // From the editor's Overview the first pages open again on the same draft, and Keep writing comes back.
  await page.evaluate(() => Game.Creator.selectTab('overview'));
  await page.click('#creator-begin-again');
  assert.deepEqual(await page.evaluate(() => [Game.Creator.state.view, Game.Creator.state.draftId]), ['begin', id]);
  assert.equal(await page.inputValue('#creator-begin-title'), 'The Salt Road');
  await page.evaluate(() => Game.Creator.Begin.go('ready'));
  await page.click('#creator-begin-edit');
  assert.deepEqual(await page.evaluate(() => [Game.Creator.state.view, Game.Creator.state.draftId, Game.Creator.state.tab]), ['editor', id, 'overview']);
  assert.equal(await page.textContent('#creator-editor-title'), 'The Salt Road');
  assert.equal(await page.textContent('#creator-editor-sub'), 'by Sam Ortiz · version 0.1.0');
  // Back from the first pages: the Library, the draft's card, and a word that it was kept.
  await page.click('#creator-begin-again');
  await page.click('#creator-back');
  assert.equal(await page.evaluate(() => Game.Creator.state.view), 'library');
  assert.match(await page.textContent('#toast'), /Kept "The Salt Road" as a draft\./);
  assert.deepEqual(await page.$$eval('#creator-cards .cr-card[data-kind="draft"] .cr-card-title', t => t.map(x => x.textContent)), ['The Salt Road']);
});

/* The narrator's stream, as tests/api.test.cjs answers it. */
const API = 'https://api.anthropic.com/v1/messages';
const NARRATED = 'The gatekeeper counts you in without looking up.';
function sse(text) {
  const ev = [
    { type: 'message_start', message: { id: 'msg_s', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, usage: { input_tokens: 900, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_details: null }, usage: { output_tokens: 42 } },
    { type: 'message_stop' }
  ];
  return ev.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

s.test('with a key, the author\'s first lines open the story and the narrator\'s arrival follows them; a story without first lines opens with the arrival alone', async h => {
  const page = await open(h);
  const reqs = [];
  await page.route(API, async route => {
    reqs.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*', 'access-control-expose-headers': 'request-id', 'request-id': 'req_1' }, body: sse(NARRATED) });
  });
  await writeStory(page);
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('sk-ant-test-0123456789', false); });
  await page.evaluate(() => Game.Creator.Begin.go('ready'));
  assert.match(await page.textContent('#creator-begin .cr-begin-go + .cr-note'), /real narrator on your API key/);
  await page.click('#creator-begin-play');
  await page.waitForFunction(() => Game.UI.screen === 'game' && !Game.Pipeline.busy && Game.state.log.length === 2);
  assert.deepEqual(await page.evaluate(() => Game.state.log.map(e => [e.input, e.narration])), [['', 'The tide is already over the stones behind you.'], ['', NARRATED]]);
  assert.equal(reqs.length, 1);
  assert.ok(reqs[0].stream, 'the one call is the narrator\'s arrival');
  assert.match(reqs[0].messages[0].content, /\nMODE: arrival /);
  const feed = await page.innerText('#feed');
  assert.ok(feed.indexOf('The tide is already over the stones behind you.') < feed.indexOf(NARRATED), 'the first lines, then the arrival');
  // No first lines: one entry, the arrival, as before this wave.
  await page.click('#test-bar-back');
  await page.evaluate(() => Game.Creator.Editor.set('opening.text', undefined));
  await page.evaluate(() => Game.Creator.Test.start(Game.Creator.state.draft, Game.Creator.Test.choice()));
  await page.waitForFunction(() => Game.UI.screen === 'game' && !Game.Pipeline.busy && Game.state.log.length === 1);
  assert.deepEqual(await page.evaluate(() => Game.state.log.map(e => e.narration)), [NARRATED]);
  assert.equal(await page.evaluate(() => Game.Town.ownOpening()), '');
});

s.test('the last step names what is missing, each a button to its step, and Step inside is off until the story can be played; Skip to the full editor opens the editor on what was written', async h => {
  const page = await open(h);
  await page.click('#creator-empty-new');
  await page.fill('#creator-begin-title', 'Half a Story');
  await page.evaluate(() => Game.Creator.Begin.go('places'));
  await page.fill('#creator-begin-a-name', 'The Quay');
  await page.evaluate(() => Game.Creator.Begin.go('ready'));
  assert.equal(await page.textContent('#creator-begin-q'), 'Nearly there.');
  assert.deepEqual(await page.$$eval('#creator-begin-missing button', bs => bs.map(b => [b.dataset.step, b.textContent])), [
    ['places', 'A second place, so there is somewhere to go'], ['person', 'Someone to meet'], ['you', 'Who the player is']]);
  assert.ok(await page.isDisabled('#creator-begin-play'));
  assert.equal(await page.evaluate(() => Game.Creator.Begin.enter()), false);
  assert.equal(await page.evaluate(() => Game.UI.screen), 'creator');
  await page.click('#creator-begin-missing button[data-step="person"]');
  assert.equal(await step(page), 'person');
  // Someone written before there is a second place is put where the newcomer arrives; a place emptied again goes, and they with nowhere to be are on no schedule.
  await page.fill('#creator-begin-who', 'Ines');
  let d = await draft(page);
  assert.deepEqual([d.world.npcs[0].home, d.world.locations[0].npcIdsBySchedule.night], ['loc_quay', [d.world.npcs[0].id]]);
  await page.evaluate(() => Game.Creator.Begin.go('places'));
  assert.equal((await draft(page)).world.npcs[0].id, 'npc_ines', 'the id follows the name once the step is left');
  await page.fill('#creator-begin-a-name', '');
  d = await draft(page);
  assert.deepEqual([d.world.locations, d.world.startLocationIds, d.world.npcs[0].home], [[], {}, null]);
  // A person emptied again goes too.
  await page.evaluate(() => Game.Creator.Begin.go('person'));
  await page.fill('#creator-begin-who', '');
  assert.deepEqual((await draft(page)).world.npcs, []);
  await page.click('#creator-begin-skip');
  assert.deepEqual(await page.evaluate(() => [Game.Creator.state.view, Game.Creator.state.tab, Game.Creator.state.draft.meta.title]), ['editor', 'overview', 'Half a Story']);
  assert.match(await page.evaluate(() => Game.Creator.state.draft.meta.id), /^half-a-story-[a-z0-9]{4}$/);
});

s.test('opened on a story that already has places and people, a step changes only the field typed in: no id renamed, no exit added, no schedule moved, nothing removed', async h => {
  const page = await open(h);
  // A copy of the built-in story as a draft, opened in the first pages.
  const id = await page.evaluate(() => {
    const dr = Game.Storage.Drafts.put({ fromPackId: null, pack: Game.Pack.copy(Game.Pack.builtIn()) });
    Game.Creator.Begin.open(dr.id);
    return dr.id;
  });
  const was = await draft(page);
  assert.equal(await page.evaluate(() => Game.Creator.state.draftId), id);
  await page.evaluate(() => Game.Creator.Begin.go('places'));
  const gate = was.world.locations.find(l => l.id === was.world.startLocationIds.gate);
  const docks = was.world.locations.find(l => l.id === was.world.startLocationIds.docks);
  assert.equal(await page.inputValue('#creator-begin-a-name'), gate.name);
  assert.equal(await page.inputValue('#creator-begin-b-name'), docks.name);
  await page.fill('#creator-begin-a-name', 'Pittman\'s Fuel');
  await page.evaluate(() => Game.Creator.Begin.go('person'));
  assert.equal(await page.inputValue('#creator-begin-who'), was.world.npcs[0].name);
  assert.equal(await page.$('#creator-begin-at'), null, 'where they are found is asked only of someone made here');
  await page.fill('#creator-begin-role', 'owner of the Low Water');
  await page.fill('#creator-begin-who', '');
  await page.evaluate(() => Game.Creator.Begin.go('you'));
  await page.fill('#creator-begin-you', 'Old soldier');
  await page.evaluate(() => Game.Creator.Begin.go('ready'));
  const now = await draft(page);
  const expect = JSON.parse(JSON.stringify(was));
  expect.world.locations.find(l => l.id === gate.id).name = 'Pittman\'s Fuel';
  expect.world.npcs[0].role = 'owner of the Low Water';
  expect.world.npcs[0].name = '';
  expect.player.backgrounds[0].name = 'Old soldier';
  assert.deepEqual(now, expect);
});

s.test('Enter goes on from a one-line field and Ctrl+Enter from a box; the editor\'s Undo never walks back through the first pages', async h => {
  const page = await open(h);
  await page.click('#creator-empty-new');
  await page.fill('#creator-begin-title', 'Keys');
  await page.press('#creator-begin-title', 'Enter');
  assert.equal(await step(page), 'world');
  await page.fill('#creator-begin-about', 'A place.');
  await page.press('#creator-begin-about', 'Enter');
  assert.equal(await step(page), 'world', 'Enter in a box is a new line');
  await page.press('#creator-begin-about', 'Control+Enter');
  assert.equal(await step(page), 'trouble');
  await page.click('#creator-begin-skip');
  assert.equal(await page.evaluate(() => Game.Creator.state.view), 'editor');
  assert.ok(await page.isDisabled('#creator-undo'));
  // An edit in the editor is one step back, to the story as the first pages left it.
  await page.evaluate(() => Game.Creator.Editor.set('meta.author', 'Kit'));
  await page.click('#creator-undo');
  assert.deepEqual(await page.evaluate(() => [Game.Creator.state.draft.meta.title, Game.Creator.state.draft.meta.author, Game.Creator.state.draft.world.setting]), ['Keys', undefined, 'A place.']);
});

/* SPEC section 11's checks, as tests/wave37-editor.test.cjs makes them: 44px tap targets and 16px inputs. */
function audit(label) {
  const vis = el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.closest('[hidden]');
  };
  const root = document.getElementById('screen-creator');
  const TAP = 'button, [role=tab], select, input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, label.check, label.cr-opt, a[href]';
  const small = [...root.querySelectorAll(TAP)].filter(vis).map(el => ({ el, r: el.getBoundingClientRect() })).filter(x => x.r.width < 44 || x.r.height < 44)
    .map(x => `${label}: ${x.el.tagName.toLowerCase()}${x.el.id ? '#' + x.el.id : ''} "${(x.el.textContent || '').trim().slice(0, 24)}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
  const fonts = [...root.querySelectorAll('input, textarea, select')].filter(vis).filter(el => !['checkbox', 'radio', 'file'].includes(el.type))
    .map(el => [el.id || el.className, parseFloat(getComputedStyle(el).fontSize)]).filter(x => x[1] < 16).map(x => `${label}: ${x[0]} ${x[1]}px`);
  return small.concat(fonts);
}

s.test('every step passes the mobile audit at 375 and 390: 44px targets, 16px inputs, nothing wider than the screen; the page waits for the last step on a phone', async h => {
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await writeStory(page);
    const ids = await page.evaluate(() => Game.Creator.Begin.STEPS.map(x => x.id));
    for (const id of ids) {
      await page.evaluate(x => Game.Creator.Begin.go(x), id);
      assert.deepEqual(await overflowReport(page, vp.width), [], `${id} at ${vp.width}`);
      assert.deepEqual(await page.evaluate(audit, `${id} at ${vp.width}`), []);
      assert.equal(await page.isVisible('#creator-begin-page'), false, 'the side page is for wide screens');
      assert.equal(await page.isVisible('#creator-begin-steps'), false, 'a phone has the bars, not the named buttons');
      assert.equal(await page.$$eval('#creator-begin-bar span', b => b.length), 9);
      if (vp.width === 390) await shot(page, `begin-${id}-390`);
    }
    assert.ok(await page.isVisible('#creator-begin-final'));
    // The Library's invitation and the editor's row back to the first pages too.
    await page.click('#creator-begin-edit');
    assert.deepEqual(await overflowReport(page, vp.width), [], `the editor at ${vp.width}`);
    assert.deepEqual(await page.evaluate(audit, `overview at ${vp.width}`), []);
  }
  // A long title and long names wrap inside the page and the steps.
  const page = await open(h, { viewport: SIZES[0] });
  await page.click('#creator-empty-new');
  await page.fill('#creator-begin-title', 'Pneumonoultramicroscopicsilicovolcanoconiosis and the Unreasonably Long Afternoon of Everything');
  await page.fill('#creator-begin-author', 'Bartholomew-Alexander Featherstonehaugh-Cholmondeley the Third');
  assert.deepEqual(await overflowReport(page, 375), []);
  await page.evaluate(() => Game.Creator.Begin.go('ready'));
  assert.deepEqual(await overflowReport(page, 375), []);
});

s.test('the editor\'s tabs are marked where their group changes (the story, the telling, the rules, the workings, the test)', async h => {
  const page = await open(h);
  await page.evaluate(() => Game.Creator.newStory());
  assert.deepEqual(await page.$$eval('#creator-tabs [role=tab]', bs => bs.filter(b => b.dataset.crGroupStart === '1').map(b => b.dataset.crTab)), ['narrator', 'rules', 'prompts', 'test']);
  assert.deepEqual(await page.evaluate(() => Game.Creator.TABS.map(t => t.group)), ['story', 'story', 'story', 'story', 'telling', 'telling', 'rules', 'rules', 'workings', 'workings', 'workings', 'test']);
});

s.run();
