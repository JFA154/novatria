'use strict';
/* Wave 37, Creator Mode, milestone 8 (task M8-C): the Story to Pack
   converter (plan decision I: extraction, never generation). The owner: "I
   want to keep the story itself away from AI generated ... ideally as
   little as possible generative AI in the creator mode." So the one AI
   control in the editor reads the author's own text ("Your story, in your
   words") and proposes records, each with the sentence it came from:
   Pack.jsonSchemaFor(kind) stays inside the API's grammar limit (40
   properties, every nested one counted, 3 enums; every property required,
   additionalProperties false, a source on each record, and no effect,
   clock, event or ending field); a 300-word harbour story in the demo mode
   gives places, people, factions, a thread and rumours, every quote a
   sentence of the text, and the review shows them; a record whose quote is
   not in the text is marked "not in your text" and unticked; Accept ticked
   writes exactly the ticked records and fields (loc_ and npc_ ids, nothing
   else in the draft changes), one Undo step each; the converter never
   writes an event, a clock or the ending; Gaps names a person with no
   schedule and the missing ending; on the real transport (routed inside
   the browser, nothing leaves the machine) every call is a json_schema
   output with no tool_choice and no cache_control, the author's text in
   the user message and max_tokens 4000; a refusal shows the notice and
   changes nothing; the Creator module calls a model in one place only; the
   review passes the mobile audit at 375 and 390. Screenshots of the review
   at 390x844 and 1280x800 in the Dark and Parchment themes go to $UI_SHOTS
   when it names a folder (none without it).
   Run with: node tests/run.cjs wave37-convert */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('wave37-convert');
const SIZES = [{ width: 375, height: 740 }, { width: 390, height: 844 }];
const API = 'https://api.anthropic.com/v1/messages';
const KEY = 'sk-ant-test-0123456789';
const KINDS = ['places', 'people', 'factions', 'threads', 'rumours', 'seeds', 'opening'];
const SHOTS = process.env.UI_SHOTS || null;
const shot = async (page, name) => {
  if (!SHOTS) return;
  try { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) { /* screenshots are for looking at, not for passing */ }
};

/* A harbour town in the author's own words: some 330 words, every kind the demo converter reads. */
const STORY = [
  'Saltmere is a small harbour town on a grey northern coast, where the tide decides most things.',
  'The harbour is the heart of it: a stone quay, a fish market and a row of tarred sheds that smell of rope and diesel.',
  'Most evenings the fishermen drink at the Gull Inn, a low room with a fire that never quite warms the corners.',
  'Mara Quell runs the chandlery on the quay.',
  'She is fifty, sharp with money and kind to children, and she keeps a ledger nobody else may read.',
  'In the mornings Mara is at Mara\'s chandlery, and at night she sleeps in the rooms above it.',
  'Tobias Wren is the harbourmaster, a tired man in a pressed coat who wants a quiet life and a full pension.',
  'His daughter Ellie Wren mends nets at the boatyard and wants to leave on the first ship that will take her.',
  'The Harbour Board wants to sell the old quay to a salt company from the south, and Tobias has already signed the first papers.',
  'The Net Menders Guild plans to block the sale by any means, and Mara funds them in secret.',
  'Nobody yet knows whether the sale will go through before the spring tides.',
  'They say the salt company has bought half the Harbour Board with a single dinner at the Gull Inn.',
  'There is a rumour that Ellie has been seen on the old quay at night with a lantern, signalling to a boat.',
  'The lighthouse stands dark at the end of the breakwater; its keeper left in the winter and nobody replaced him.',
  'On day 3 the Harbour Board meets in the back room of the Gull Inn to vote on the sale.',
  'You arrive on the evening ferry with a letter for Mara Quell and no idea what it says.',
  'What happens to the quay is up to you: it can be saved, sold, or burned before the vote, and every family in Saltmere will remember which.'
].join(' ');
const PLANTED = 'A silver mine runs under the hill behind the town, worked by night.';

/* A page with the Library and the drafts read, the demo answering at once. */
async function open(h, opts) {
  const page = await h.open(Object.assign({ contextOptions: { reducedMotion: 'reduce' } }, opts || {}));
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; Game.Storage.saveSettings({ mockMode: true }); });
  return page;
}
/* A new blank draft in the editor (the Library's New story), with the story typed into its box. */
async function draftWithStory(page, story) {
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  await page.click('#creator-empty-new');
  await page.waitForSelector('#creator-body [data-path="meta.title"]');
  if (story !== undefined) {
    await page.fill('[data-path="meta.storyText"]', story);
    await page.waitForFunction(t => Game.Creator.state.draft.meta.storyText === t, story);
  }
}
async function convert(page) {
  await page.click('#creator-convert-run');
  await page.waitForFunction(() => !Game.Creator.Convert.running && document.querySelector('#creator-convert-run') && !document.querySelector('.cr-convert[data-running="1"]'));
}
const review = page => page.evaluate(() => Game.Creator.Convert.review.map(i => ({ kind: i.kind, id: i.id, name: i.name, source: i.source, inText: i.inText, on: i.on, error: i.error, fields: i.fields.map(f => ({ k: f.k, value: f.value, on: f.on })) })));
const draftJson = page => page.evaluate(() => JSON.parse(JSON.stringify(Game.Creator.state.draft)));

/* Every property of every nested object, and every enum, in a JSON schema. */
function census(schema) {
  const out = { props: 0, enums: 0, objects: [], names: [] };
  (function walk(n, at) {
    if (Array.isArray(n)) { n.forEach(x => walk(x, at)); return; }
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n.enum)) out.enums += 1;
    if (n.properties) {
      out.objects.push({ at, keys: Object.keys(n.properties), required: n.required, additional: n.additionalProperties });
      for (const k of Object.keys(n.properties)) { out.props += 1; out.names.push(k); walk(n.properties[k], at + '.' + k); }
    }
    for (const k of ['items', 'anyOf']) if (n[k]) walk(n[k], at);
  })(schema, '');
  return out;
}

/* SPEC section 11's checks as tests/wave37-editor.test.cjs makes them: 44px tap targets, 16px inputs, nothing wider than the screen. */
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
  // The review's tick rows (checkboxes in labels) are 44px rows too.
  const ticks = [...document.querySelectorAll('.cr-cv-tick')].filter(vis).filter(el => el.getBoundingClientRect().height < 44).map(el => el.textContent.slice(0, 24));
  return { label, small: small.concat(ticks), fonts, wide: wide.slice(0, 10) };
}

s.test('Pack.jsonSchemaFor: each kind within the grammar limit (at most 40 properties counting every nested one, at most 3 enums), every property required, additionalProperties false, a source on each record, and no effect, clock, event, schedule or ending field', async h => {
  const page = await open(h);
  const got = await page.evaluate(kinds => kinds.map(k => ({ k, schema: Game.Pack.jsonSchemaFor(k) })), KINDS);
  assert.deepEqual(await page.evaluate(() => Game.Pack.CONVERT_KINDS.slice()), KINDS);
  const counts = {};
  for (const { k, schema } of got) {
    const c = census(schema);
    counts[k] = `${c.props} properties, ${c.enums} enum${c.enums === 1 ? '' : 's'}`;
    assert.ok(c.props <= 40, `${k}: ${c.props} properties`);
    assert.ok(c.enums <= 3, `${k}: ${c.enums} enums`);
    for (const o of c.objects) {
      assert.deepEqual(o.required, o.keys, `${k}${o.at}: every property is required`);
      assert.equal(o.additional, false, `${k}${o.at}: additionalProperties false`);
    }
    const record = k === 'opening' ? schema : schema.properties.items.items;
    if (k !== 'opening') assert.deepEqual(Object.keys(schema.properties), ['items']);
    assert.equal(record.properties.source.type, 'string', `${k}: a source on each record`);
    const forbidden = ['effects', 'clocks', 'onComplete', 'events', 'branches', 'epilogue', 'default', 'alt', 'requires', 'npcIdsBySchedule', 'id'];
    assert.deepEqual(c.names.filter(n => forbidden.includes(n)), [], `${k}: no effect, clock, event or ending field, and no id`);
    // Descriptions are short (the API notes: every word weighs on the grammar).
    for (const d of JSON.stringify(schema).match(/"description":"[^"]*"/g) || []) assert.ok(d.length < 170, `${k}: a short description: ${d}`);
  }
  console.log('        schema counts: ' + KINDS.map(k => `${k} ${counts[k]}`).join('; '));
  // A person's phases are place ids per phase, a list of strings; the refs are plain strings, never ids the model makes.
  const people = got.find(x => x.k === 'people').schema.properties.items.items.properties;
  assert.deepEqual(people.phases, { type: 'array', items: { type: 'string' }, description: people.phases.description });
  assert.deepEqual(people.home.anyOf, [{ type: 'string' }, { type: 'null' }]);
  assert.deepEqual(people.pronouns.anyOf[0].enum, ['he', 'she', 'they']);
  assert.equal(await page.evaluate(() => { try { Game.Pack.jsonSchemaFor('events'); return 'no'; } catch (e) { return 'threw'; } }), 'threw');
});

s.test('a 300-word harbour story in the demo mode: places, people, factions, a thread and rumours, every quote a sentence of the text; the review lists them with the quotes in italics, and nothing changes in the draft', async h => {
  const page = await open(h);
  await draftWithStory(page, STORY);
  assert.ok(STORY.split(/\s+/).length >= 300, 'about 300 words');
  const before = await draftJson(page);
  assert.equal(await page.textContent('.cr-convert .cr-section-title'), 'Turn your words into a story');
  assert.match(await page.textContent('.cr-convert > .cr-note'), /invents nothing/);
  await convert(page);
  const items = await review(page);
  const count = k => items.filter(i => i.kind === k).length;
  assert.ok(count('places') >= 3, 'places: ' + count('places'));
  assert.ok(count('people') >= 3, 'people');
  assert.ok(count('factions') >= 1, 'a faction');
  assert.ok(count('threads') >= 1, 'a thread');
  assert.ok(count('rumours') >= 2, 'rumours');
  assert.deepEqual(items.filter(i => i.kind === 'people').map(i => i.name), ['Mara Quell', 'Tobias Wren', 'Ellie Wren']);
  assert.ok(items.filter(i => i.kind === 'places').every(i => /^loc_/.test(i.id)) && items.filter(i => i.kind === 'people').every(i => /^npc_/.test(i.id)));
  for (const i of items) {
    assert.ok(i.source && STORY.includes(i.source), `${i.name}: its source is a sentence of the text: ${i.source}`);
    assert.equal(i.inText, true);
    assert.equal(i.on, true, `${i.name} is ticked`);
    assert.equal(i.error, null, `${i.name}: ${i.error}`);
  }
  // The steps said what each call found.
  assert.deepEqual(await page.$$eval('.cr-cv-steps li', ls => ls.map(l => l.dataset.kind)), KINDS);
  // The review: one row per record, its kind, name and id, the quote beside it in italics, a tick on the record and each field.
  const rows = await page.$$eval('#creator-convert .cr-cv-item', rs => rs.map(r => ({
    kind: r.dataset.kind, name: r.querySelector('.cr-cv-name').textContent, quote: r.querySelector('.cr-cv-quote').textContent,
    italic: getComputedStyle(r.querySelector('.cr-cv-quote')).fontStyle, ticked: r.querySelector('[data-cv=entity]').checked,
    fields: r.querySelectorAll('[data-cv=field]').length, flag: !!r.querySelector('.cr-cv-flag')
  })));
  assert.equal(rows.length, items.length);
  rows.forEach((r, n) => {
    assert.equal(r.name, items[n].name);
    assert.equal(r.quote, items[n].source);
    assert.equal(r.italic, 'italic');
    assert.equal(r.ticked, true);
    assert.equal(r.fields, items[n].fields.length);
    assert.equal(r.flag, false);
  });
  const mara = items.find(i => i.name === 'Mara Quell');
  assert.deepEqual(mara.fields.find(f => f.k === 'pronouns').value, 'she');
  assert.deepEqual(mara.fields.find(f => f.k === 'phases').value, ['loc_maras_chandlery', '', '', 'loc_maras_chandlery']);
  assert.match(await page.textContent('.cr-cv-sum'), /^\d+ records proposed\. Nothing changes until you accept\.$/);
  assert.deepEqual(await draftJson(page), before, 'nothing touches the draft until Accept');
  // The user message carried the kind, the place ids for people, and the author's text.
  const calls = await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'convert').map(c => c.text));
  assert.equal(calls.length, 7);
  assert.ok(calls.every(t => t.includes(STORY)));
  assert.match(calls[1], /^KIND: people\./);
  assert.match(calls[1], /PLACES \(id: name\):\nloc_harbour: The Harbour/);
  assert.match(calls[2], /PEOPLE \(id: name\):[\s\S]*npc_mara: Mara Quell/);
});

s.test('a record whose quote is not in the text is marked "not in your text" and unticked; Accept all leaves it out unless it is ticked by hand', async h => {
  const page = await open(h);
  await draftWithStory(page, STORY);
  await page.evaluate(planted => {
    const blank = { type: null, description: null, details: null, hours: null, aka: [], exits: [], away: null, distance: null };
    Game.Api.Mock.queue('convert', { items: [
      Object.assign({ name: 'The Gull Inn', source: 'Most evenings the fishermen drink at the Gull Inn, a low room with a fire that never quite warms the corners.' }, blank),
      // Near-verbatim: the case and the spacing folded, one word in ten changed.
      Object.assign({ name: 'The Lighthouse', source: 'the lighthouse   stands DARK at the end of the breakwater; its keeper left in the  spring and nobody replaced him' }, blank),
      Object.assign({ name: 'The Silver Mine', source: planted }, blank)
    ] });
  }, PLANTED);
  await convert(page);
  const items = await review(page);
  const mine = items.find(i => i.name === 'The Silver Mine');
  assert.deepEqual([mine.inText, mine.on], [false, false]);
  assert.deepEqual(items.filter(i => i.kind === 'places').map(i => [i.name, i.inText]), [['The Gull Inn', true], ['The Lighthouse', true], ['The Silver Mine', false]]);
  const row = '#creator-convert .cr-cv-item[data-key="places:loc_silver_mine"]';
  assert.equal(await page.textContent(row + ' .cr-cv-flag'), 'not in your text');
  assert.equal(await page.$eval(row + ' [data-cv=entity]', b => b.checked), false);
  assert.equal(await page.$eval(row, r => r.dataset.inText), '0');
  assert.match(await page.textContent('.cr-cv-sum'), /, 1 not in your text\./);
  assert.equal(await page.evaluate(() => Game.Creator.Convert.inText('The harbour is the heart of it.', 'THE HARBOUR is\n the heart  of it')), true);
  assert.equal(await page.evaluate(() => Game.Creator.Convert.inText('The harbour is a ruin.', 'The harbour is the heart of it.')), false);
  // Accept all: every record in the text, the planted one left out.
  await page.click('[data-cv=accept-all]');
  const d = await draftJson(page);
  assert.deepEqual(d.world.locations.map(l => l.id), ['loc_gull_inn', 'loc_lighthouse']);
  assert.ok(!JSON.stringify(d).includes('Silver Mine'));
  assert.deepEqual(await review(page).then(r => r.map(i => i.name)), ['The Silver Mine'], 'the planted record stays in the review');
});

s.test('Accept ticked writes exactly the ticked records and fields with loc_ and npc_ ids (the draft differs only there), one Undo step a record; no event, clock or ending is ever written', async h => {
  const page = await open(h);
  await draftWithStory(page, STORY);
  const before = await draftJson(page);
  const undo0 = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  await convert(page);
  // Keep the places and the people only, and of those leave out the Boatyard and Tobias Wren's goal.
  await page.evaluate(() => {
    for (const box of document.querySelectorAll('#creator-convert [data-cv=entity]')) {
      const kind = box.closest('.cr-cv-item').dataset.kind;
      const want = (kind === 'places' || kind === 'people') && box.dataset.key !== 'places:loc_boatyard';
      if (box.checked !== want) box.click();
    }
    document.querySelector('[data-cv=field][data-key="people:npc_tobias"][data-field="goal"]').click();
  });
  const ticked = await page.evaluate(() => Game.Creator.Convert.review.filter(i => i.on).map(i => i.id));
  assert.ok(ticked.length >= 8 && !ticked.includes('loc_boatyard'));
  await page.click('[data-cv=accept]');
  const after = await draftJson(page);
  // Only the places and the people changed.
  const changed = Object.keys(Object.assign({}, before, after)).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  assert.deepEqual(changed, ['world']);
  const worldChanged = Object.keys(Object.assign({}, before.world, after.world)).filter(k => JSON.stringify(before.world[k]) !== JSON.stringify(after.world[k]));
  assert.deepEqual(worldChanged, ['locations', 'npcs']);
  assert.deepEqual(after.world.locations.map(l => l.id).concat(after.world.npcs.map(n => n.id)), ticked);
  assert.ok(after.world.locations.every(l => /^loc_[a-z0-9_]+$/.test(l.id)) && after.world.npcs.every(n => /^npc_[a-z0-9_]+$/.test(n.id)));
  const tobias = after.world.npcs.find(n => n.id === 'npc_tobias');
  assert.deepEqual([tobias.name, tobias.role, tobias.pronouns, tobias.goal], ['Tobias Wren', 'harbourmaster', 'he', undefined], 'the unticked field stays out');
  // Mara's phases put her at her chandlery in the morning and at night.
  const ch = after.world.locations.find(l => l.id === 'loc_maras_chandlery');
  assert.deepEqual([ch.npcIdsBySchedule.morning, ch.npcIdsBySchedule.night], [['npc_mara'], ['npc_mara']]);
  assert.equal(after.world.npcs.find(n => n.id === 'npc_mara').home, 'loc_maras_chandlery');
  // The rest stays in the review; the accepted ones left it.
  assert.ok(await page.evaluate(() => Game.Creator.Convert.review.every(i => !['places', 'people'].includes(i.kind) || i.id === 'loc_boatyard')));
  // One Undo step a record, the last first.
  const undo1 = await page.evaluate(() => Game.Creator.Editor.undoDepth);
  assert.equal(undo1 - undo0, ticked.length);
  await page.evaluate(() => Game.Creator.Editor.undo());
  const once = await draftJson(page);
  assert.deepEqual(once.world.locations.map(l => l.id).concat(once.world.npcs.map(n => n.id)), ticked.slice(0, -1));
  await page.evaluate(n => { for (let i = 1; i < n; i++) Game.Creator.Editor.undo(); }, ticked.length);
  assert.deepEqual(await draftJson(page), before);
  // Accept all of a fresh run: factions get no clock, and no event or ending is written.
  await page.click('#creator-tab-overview');
  await convert(page);
  await page.click('[data-cv=accept-all]');
  const all = await draftJson(page);
  assert.ok(all.world.factions.length >= 2 && all.world.factions.every(f => Array.isArray(f.clocks) && f.clocks.length === 0));
  assert.deepEqual([all.world.events, all.world.epilogue], [before.world.events, before.world.epilogue]);
  assert.ok(!/"(effects|onComplete|branches)"/.test(JSON.stringify(all.world.factions.concat(all.world.seeds, all.world.rumours, all.world.threads))));
  assert.equal(all.opening.text, 'You arrive on the evening ferry with a letter for Mara Quell and no idea what it says.');
});

s.test('a record whose addition raises an engine error is shown with that error and unticked, and Accept ticked will not write it even when ticked by hand', async h => {
  const page = await open(h);
  await draftWithStory(page, STORY);
  // The fifth call (rumours): one that names "the Board", which is no person, place or faction of the story.
  await page.evaluate(() => Game.Api.Mock.queue('convert', null, null, null, null, { items: [
    { text: 'They say the Board pays Ellie Wren in silver.', true: null, sourceNpcId: null, tellerIds: [], threadId: null, factionId: null, source: 'They say the salt company has bought half the Harbour Board with a single dinner at the Gull Inn.' }
  ] }));
  await convert(page);
  const rum = (await review(page)).find(i => i.kind === 'rumours');
  // R8's S1: its text is not in its quote (an invented rumour riding a real sentence), so it is "not in your text" too.
  assert.equal(rum.inText, false);
  assert.equal(rum.on, false);
  assert.match(rum.error, /^world\.rumours\[0\]\.text: the name "Board" matches no person, place or faction/);
  const row = `#creator-convert .cr-cv-item[data-key="rumours:${rum.id}"]`;
  assert.match(await page.textContent(row + ' .cr-err'), /^Left out: adding it would break the story \(world\.rumours\[0\]\.text: the name "Board"/);
  assert.equal(await page.$eval(row + ' [data-cv=entity]', b => b.checked), false);
  assert.match(await page.textContent('.cr-cv-sum'), /, 1 left out\./);
  // Ticked by hand: tried again, refused again, nothing of it written.
  await page.click(row + ' [data-cv=entity]');
  await page.click('[data-cv=accept]');
  const d = await draftJson(page);
  assert.ok(d.world.locations.length > 0 && !d.world.rumours.some(r => /pays Ellie/.test(r.text)));
  assert.ok(await page.evaluate(() => Game.Creator.Convert.review.some(i => i.kind === 'rumours' && i.error && !i.on)));
});

s.test('Gaps, after the run, names what the text did not give: a person with no schedule, places with no exits, no start places, no ending, no backgrounds; each opens its tab', async h => {
  const page = await open(h);
  await draftWithStory(page, STORY);
  assert.equal(await page.$eval('#creator-gaps', g => g.hidden), true, 'no Gaps before a run');
  await convert(page);
  const gaps = await page.$$eval('#creator-gaps .cr-problem', bs => bs.map(b => ({ key: b.dataset.gap, tab: b.dataset.tab, text: b.querySelector('.cr-problem-msg').textContent, where: b.querySelector('.cr-problem-tab').textContent })));
  const by = k => gaps.find(g => g.key === k);
  assert.match(by('schedule:npc_tobias').text, /^Tobias Wren has no schedule and no home/);
  assert.match(by('schedule:npc_mara').text, /^Mara Quell has no schedule for afternoon, evening:/);
  assert.equal(by('schedule:npc_tobias').where, 'World tab · Schedules');
  assert.match(by('exits:loc_harbour').text, /^The Harbour has no exits/);
  assert.equal(by('ending').text, 'No ending: write how the story can end.');
  assert.ok(by('start') && by('backgrounds'));
  assert.equal(await page.evaluate(() => Game.Creator.Convert.gaps(Game.Creator.state.draft).some(g => g.key === 'ending')), true);
  // A gap opens its tab (the World tab on its Schedules list).
  await page.click('#creator-gaps [data-gap="schedule:npc_tobias"]');
  await page.waitForFunction(() => Game.Creator.state.tab === 'world');
  assert.equal(await page.$eval('#creator-tab-world', b => b.getAttribute('aria-selected')), 'true');
});

s.test('on the real transport: seven calls, each output_config.format json_schema with Pack.jsonSchemaFor(kind), no tool_choice or tools, no cache_control, CONVERT_SYSTEM, the parser model, max_tokens 4000, the author\'s text and the ids found in the user message', async h => {
  const page = await open(h);
  const bodies = [];
  await page.route(API, async route => {
    const body = JSON.parse(route.request().postData());
    bodies.push(body);
    const kind = /^KIND: (\w+)\./.exec(body.messages[0].content)[1];
    const reply = kind === 'places' ? { items: [{ name: 'The Gull Inn', type: 'inn', description: null, details: null, hours: null, aka: [], exits: [], away: null, distance: null, source: 'Most evenings the fishermen drink at the Gull Inn, a low room with a fire that never quite warms the corners.' }] }
      : kind === 'opening' ? { premise: null, text: null, firstTurn: null, source: '' } : { items: [] };
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'request-id': 'req_' + kind },
      body: JSON.stringify({ id: 'msg_' + kind, type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 900, output_tokens: 60 } }) });
  });
  await page.evaluate(k => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey(k, false); }, KEY);
  await draftWithStory(page, STORY);
  await convert(page);
  assert.equal(bodies.length, 7);
  const want = await page.evaluate(kinds => ({
    system: Game.Api.CONVERT_SYSTEM, model: Game.Storage.settings().parserModel, effort: Game.Api.roleEffort('bookkeeper'),
    schemas: kinds.map(k => Game.Pack.jsonSchemaFor(k)), max: Game.Api.MAX_TOKENS.creator
  }), KINDS);
  assert.equal(want.max, 4000);
  assert.match(want.system, /Extract only what the text states\. Never invent a name, a place, a trait, a number or a fact\. Where the text is silent, return null or an empty list\. For every entity, copy the sentence it comes from into source, word for word\./);
  bodies.forEach((b, i) => {
    assert.equal(b.output_config.format.type, 'json_schema');
    assert.deepEqual(b.output_config.format.schema, want.schemas[i]);
    assert.equal(b.output_config.effort, want.effort);
    assert.equal(b.tool_choice, undefined);
    assert.equal(b.tools, undefined);
    assert.ok(!JSON.stringify(b).includes('cache_control'), 'no cached block');
    assert.equal(b.system, want.system);
    assert.equal(b.model, want.model);
    assert.equal(b.max_tokens, 4000);
    assert.equal(b.messages.length, 1);
    assert.equal(b.messages[0].role, 'user');
    assert.ok(b.messages[0].content.includes(STORY), 'the author\'s text in the user message');
    assert.match(b.messages[0].content, new RegExp('^KIND: ' + KINDS[i] + '\\.'));
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.equal(b[k], undefined);
  });
  assert.match(bodies[1].messages[0].content, /PLACES \(id: name\):\nloc_gull_inn: The Gull Inn/);
  assert.ok(!JSON.stringify(bodies).includes(KEY), 'the key goes in a header, never the body');
  assert.deepEqual(await review(page).then(r => r.map(i => [i.id, i.inText])), [['loc_gull_inn', true]]);
  // Logged as the other calls are.
  assert.ok(await page.evaluate(() => Game.Api.responses.filter(r => r.role === 'creator').length === 7));
});

s.test('a refused call shows the notice and changes nothing; a failed one says so; Convert is off under 40 words and with no key outside the demo mode, with the reason', async h => {
  const page = await open(h);
  await draftWithStory(page, 'A short note about a town.');
  assert.equal(await page.$eval('#creator-convert-run', b => b.disabled), true);
  assert.match(await page.textContent('.cr-cv-why'), /^Write at least 40 words of your story first \(6 words so far\)\.$/);
  await page.fill('[data-path="meta.storyText"]', STORY);
  assert.equal(await page.$eval('#creator-convert-run', b => b.disabled), false, 'the button follows the box');
  await page.waitForFunction(t => Game.Creator.state.draft.meta.storyText === t, STORY);
  const before = await draftJson(page);
  await page.evaluate(() => { Game.Api.Mock.queue('convert', { items: [] }, { refusal: { category: 'mock', explanation: 'queued refusal' } }); });
  await convert(page);
  assert.equal(await page.textContent('.cr-cv-notice'), 'The model declined to read this text, so nothing was changed. (queued refusal)');
  assert.equal(await page.$eval('.cr-cv-notice', n => n.hidden), false);
  assert.deepEqual(await review(page), []);
  assert.equal(await page.$eval('#creator-convert', r => r.hidden), true);
  assert.equal(await page.$eval('#creator-gaps', r => r.hidden), true);
  assert.deepEqual(await draftJson(page), before);
  // An error (here the demo's queued one) says so and changes nothing either.
  await page.evaluate(() => Game.Api.Mock.queue('convert', { error: { type: 'overloaded', message: 'The service is busy.' } }));
  await convert(page);
  assert.match(await page.textContent('.cr-cv-notice'), /Nothing was changed\.$/);
  assert.deepEqual(await draftJson(page), before);
  // No key and the demo off: the button is off and says why.
  await page.evaluate(() => { Game.Storage.saveSettings({ mockMode: false }); Game.Storage.setApiKey('', false); Game.Creator.selectTab('json'); Game.Creator.selectTab('overview'); });
  assert.equal(await page.$eval('#creator-convert-run', b => b.disabled), true);
  assert.match(await page.textContent('.cr-cv-why'), /API key/);
});

s.test('the Creator module calls a model in one place only: Api.convert (no other AI control in the editor)', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = html.indexOf('// ===== Module: Creator =====');
  const b = html.indexOf('// ===== Module: Commands =====');
  assert.ok(a > 0 && b > a);
  const creator = html.slice(a, b);
  const calls = [...creator.matchAll(/\bApi\.([A-Za-z_]+)\s*\(/g)].map(m => m[1]);
  const MODEL_CALLS = ['parse', 'narrate', 'bookkeep', 'chronicle', 'rewriteMemories', 'revealPlaces', 'checkClock', 'fixPeople', 'convert', 'prewarm', 'checkKey'];
  assert.deepEqual(calls.filter(c => MODEL_CALLS.includes(c)), ['convert'], 'one call to a model: ' + calls.join(', '));
  // Every other Api reference there reads a constant or a prompt (the Rules, Prompts, Prompt view and Developer tabs).
  const refs = [...new Set([...creator.matchAll(/\bApi\.([A-Za-z_]+)/g)].map(m => m[1]))].sort();
  assert.deepEqual(refs, ['ENGINE_RULES_SHORT', 'PARSE_TYPES', 'convert', 'responses', 'systemFor']);
  // The converter's own region holds the call.
  const conv = creator.slice(creator.indexOf('// ----- Creator: Convert -----'));
  assert.equal((conv.match(/\bApi\.convert\(/g) || []).length, 1);
});

s.test('the review passes the mobile audit at 375 and 390; screenshots of it at 390x844 and 1280x800 in the Dark and Parchment themes', async h => {
  const plant = page => page.evaluate(planted => {
    const blank = { type: null, description: null, details: null, hours: null, aka: [], exits: [], away: null, distance: null };
    Game.Api.Mock.queue('convert', { items: [
      Object.assign({ name: 'The Harbour', source: 'The harbour is the heart of it: a stone quay, a fish market and a row of tarred sheds that smell of rope and diesel.' }, blank, { description: 'The harbour is the heart of it: a stone quay, a fish market and a row of tarred sheds that smell of rope and diesel.' }),
      Object.assign({ name: 'The Gull Inn', source: 'Most evenings the fishermen drink at the Gull Inn, a low room with a fire that never quite warms the corners.' }, blank, { type: 'inn' }),
      Object.assign({ name: 'The Silver Mine', source: planted }, blank)
    ] });
  }, PLANTED);
  for (const vp of SIZES) {
    const page = await open(h, { viewport: vp });
    await draftWithStory(page, STORY);
    await plant(page);
    await convert(page);
    await page.evaluate(() => document.getElementById('creator-convert').scrollIntoView({ block: 'start' }));
    const a = await page.evaluate(audit, `review ${vp.width}`);
    assert.deepEqual([a.small, a.fonts, a.wide], [[], [], []], JSON.stringify(a));
  }
  if (!SHOTS) return;
  for (const [theme, scheme] of [['dark', 'dark'], ['parchment', 'light']]) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      const page = await open(h, { viewport: vp, colorScheme: scheme, contextOptions: { reducedMotion: 'reduce', deviceScaleFactor: 2 } });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      await draftWithStory(page, STORY);
      await page.fill('[data-path="meta.title"]', 'Saltmere');
      await plant(page);
      await convert(page);
      await page.evaluate(() => document.querySelector('.cr-convert').scrollIntoView({ block: 'start' }));
      await shot(page, `creator-convert-review-${vp.width}x${vp.height}-${theme}`);
      await page.evaluate(() => document.getElementById('creator-gaps').scrollIntoView({ block: 'start' }));
      await shot(page, `creator-convert-gaps-${vp.width}x${vp.height}-${theme}`);
    }
  }
});

s.run();
