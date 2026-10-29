'use strict';
/* Settings defaults and the one-time upgrade of settings saved under
   earlier defaults (v1: Sonnet narrator, Haiku parser, every effort low; v2:
   one Sonnet "parser model" for the parser, bookkeeper and chronicle, split
   in v3 into a Haiku parser and a Sonnet bookkeeper). Anything the player
   typed themselves must survive the upgrade. Also the top of the settings
   screen: the key, Remember and Mock mode with its line.
   Run with: node tests/run.cjs settings */
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('settings');
const KEY = 'novatria.settings';
const NEW = { narratorModel: 'claude-opus-5-5', parserModel: 'claude-haiku-5-5', bookkeeperModel: 'claude-sonnet-5-5', effort: { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' } };

async function reloadWith(page, saved) {
  await page.evaluate(([k, v]) => { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }, [KEY, saved]);
  await page.reload();
  return page.evaluate(() => JSON.parse(JSON.stringify(Game.Storage.settings())));
}

s.test('a fresh browser gets the current defaults and they are written with a settings version', async h => {
  const page = await h.open();
  const st = await reloadWith(page, null);
  assert.equal(st.narratorModel, NEW.narratorModel);
  assert.equal(st.parserModel, NEW.parserModel);
  assert.equal(st.bookkeeperModel, NEW.bookkeeperModel);
  assert.deepEqual(st.effort, NEW.effort);
  await page.evaluate(() => Game.Storage.saveSettings({ showRolls: false }));
  const raw = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.equal(raw.settingsVersion, 3);
  assert.deepEqual([raw.parserModel, raw.bookkeeperModel], [NEW.parserModel, NEW.bookkeeperModel]);
  assert.equal(raw.showRolls, false);
});

s.test('settings saved under the old defaults are upgraded to the new ones, other choices kept', async h => {
  const page = await h.open();
  const st = await reloadWith(page, { narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' }, mockMode: false, showRolls: false, textSize: 'L' });
  assert.equal(st.narratorModel, NEW.narratorModel, 'old default narrator upgraded');
  assert.equal(st.parserModel, NEW.parserModel, 'old default parser upgraded');
  assert.equal(st.bookkeeperModel, NEW.bookkeeperModel, 'and the bookkeeper gets its own default');
  assert.deepEqual(st.effort, NEW.effort, 'all-low effort upgraded');
  assert.equal(st.mockMode, false);
  assert.equal(st.showRolls, false);
  assert.equal(st.textSize, 'L');
});

s.test('models and effort the player typed under the old version survive the upgrade', async h => {
  const page = await h.open();
  const st = await reloadWith(page, { narratorModel: 'claude-opus-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'high', parser: 'low', bookkeeper: 'low', chronicle: 'low' } });
  assert.equal(st.narratorModel, 'claude-opus-5', 'a typed narrator model is kept');
  assert.equal(st.parserModel, NEW.parserModel, 'the untouched old default parser is upgraded');
  assert.equal(st.bookkeeperModel, NEW.bookkeeperModel);
  assert.deepEqual(st.effort, { narrator: 'high', parser: 'low', bookkeeper: 'low', chronicle: 'low' }, 'a changed effort set is kept as is');
  // A parser model typed under v1 drove the bookkeeper too: it is kept for both.
  const typed = await reloadWith(page, { narratorModel: 'claude-opus-5', parserModel: 'claude-opus-5', effort: { narrator: 'high', parser: 'low', bookkeeper: 'low', chronicle: 'low' } });
  assert.deepEqual([typed.parserModel, typed.bookkeeperModel], ['claude-opus-5', 'claude-opus-5']);
});

s.test('the cheap models chosen on purpose after the upgrade are kept', async h => {
  const page = await h.open();
  const st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' } });
  assert.equal(st.narratorModel, 'claude-sonnet-5-5');
  assert.equal(st.parserModel, 'claude-haiku-5-5');
  assert.equal(st.bookkeeperModel, 'claude-haiku-5-5', 'the cheap model was chosen for the bookkeeper too (v2 had one field)');
  assert.deepEqual(st.effort, { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' });
});

s.test('version 3: one parser model becomes two. Saved at the old default (Sonnet), it becomes a Haiku parser and a Sonnet bookkeeper; a model the player typed is kept for both roles; v3 settings are read as saved', async h => {
  const page = await h.open();
  // v2 at its defaults: the new pair, everything else kept.
  let st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'high', parser: 'low', bookkeeper: 'medium', chronicle: 'low' }, showRolls: false });
  assert.deepEqual([st.narratorModel, st.parserModel, st.bookkeeperModel], ['claude-opus-5-5', 'claude-haiku-5-5', 'claude-sonnet-5-5']);
  assert.deepEqual(st.effort, { narrator: 'high', parser: 'low', bookkeeper: 'medium', chronicle: 'low' }, 'effort untouched');
  assert.equal(st.showRolls, false);
  // Written back as version 3 at the next save, and read straight from then on.
  await page.evaluate(() => Game.Storage.saveSettings({ textSize: 'L' }));
  let raw = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.deepEqual([raw.settingsVersion, raw.parserModel, raw.bookkeeperModel], [3, 'claude-haiku-5-5', 'claude-sonnet-5-5']);
  // v2 with a model the player typed: kept for both roles.
  st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-opus-5-5', parserModel: 'claude-opus-5-5' });
  assert.deepEqual([st.parserModel, st.bookkeeperModel], ['claude-opus-5-5', 'claude-opus-5-5']);
  st = await reloadWith(page, { settingsVersion: 2, parserModel: '  claude-mystery-9 ' });
  assert.deepEqual([st.parserModel, st.bookkeeperModel], ['claude-mystery-9', 'claude-mystery-9']);
  // v3: as saved, Sonnet parser included (it is a choice now), and an empty field falls back to its default.
  st = await reloadWith(page, { settingsVersion: 3, narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', bookkeeperModel: 'claude-haiku-5-5' });
  assert.deepEqual([st.parserModel, st.bookkeeperModel], ['claude-sonnet-5-5', 'claude-haiku-5-5']);
  st = await reloadWith(page, { settingsVersion: 3, parserModel: '', bookkeeperModel: '' });
  assert.deepEqual([st.parserModel, st.bookkeeperModel], [NEW.parserModel, NEW.bookkeeperModel]);
  // The settings screen shows and saves the two fields.
  await reloadWith(page, null);
  await page.click('#btn-settings');
  assert.deepEqual([await page.inputValue('#set-parser-model'), await page.inputValue('#set-bookkeeper-model')], [NEW.parserModel, NEW.bookkeeperModel]);
  await page.fill('#set-bookkeeper-model', 'claude-opus-5-5');
  await page.press('#set-bookkeeper-model', 'Tab');
  raw = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.deepEqual([raw.parserModel, raw.bookkeeperModel], [NEW.parserModel, 'claude-opus-5-5']);
  await page.fill('#set-bookkeeper-model', '');
  await page.press('#set-bookkeeper-model', 'Tab');
  raw = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.equal(raw.bookkeeperModel, NEW.bookkeeperModel, 'an emptied field goes back to its default');
});

s.test('Narration style and the Do / Say mode: casual and Do by default, kept when saved, and the v1 upgrade still works with them', async h => {
  const page = await h.open();
  let st = await reloadWith(page, null);
  assert.equal(st.narrationStyle, 'casual');
  assert.equal(st.inputMode, 'do');
  st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', narrationStyle: 'literary', inputMode: 'say' });
  assert.equal(st.narrationStyle, 'literary');
  assert.equal(st.inputMode, 'say');
  st = await reloadWith(page, { settingsVersion: 2, narrationStyle: 'flowery', inputMode: 'shout' });
  assert.equal(st.narrationStyle, 'casual', 'an unknown style reads as casual');
  assert.equal(st.inputMode, 'do', 'an unknown mode reads as Do');
  // Settings from before the two fields existed (v1 defaults): upgraded as before, with the new defaults.
  st = await reloadWith(page, { narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' }, textSize: 'L' });
  assert.equal(st.narratorModel, NEW.narratorModel);
  assert.equal(st.parserModel, NEW.parserModel);
  assert.equal(st.bookkeeperModel, NEW.bookkeeperModel);
  assert.deepEqual(st.effort, NEW.effort);
  assert.equal(st.textSize, 'L');
  assert.equal(st.narrationStyle, 'casual');
  assert.equal(st.inputMode, 'do');
});

s.test('mock mode stays on by default; the API key, Remember on this device and Mock mode come first, together, with a line saying what Mock mode does', async h => {
  const page = await h.open();
  const st = await reloadWith(page, null);
  assert.equal(st.mockMode, true, 'still on by default');
  assert.equal(st.rememberKey, false);
  await page.click('#btn-settings');
  const form = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#settings-form input, #settings-form select, #settings-form button')].map(x => x.id || x.name);
    const first = document.querySelector('#settings-form fieldset');
    const mock = document.getElementById('set-mock');
    const hint = document.getElementById(mock.getAttribute('aria-describedby'));
    return { firstThree: controls.slice(0, 3), sameGroup: ['set-key', 'set-remember', 'set-mock'].every(id => first.contains(document.getElementById(id))), label: mock.closest('label').textContent.trim(), hint: hint && hint.textContent, hintAfter: !!hint && mock.closest('.field').contains(hint) };
  });
  assert.deepEqual(form.firstThree, ['set-key', 'set-remember', 'set-mock']);
  assert.ok(form.sameGroup, 'in the first group');
  assert.equal(form.label, 'Mock mode');
  assert.equal(form.hint, 'On: the built-in placeholder narrator, no API calls, free. Off: Claude narrates with your key.');
  assert.ok(form.hintAfter, 'the explanation sits under the box');
  assert.ok(await page.isChecked('#set-mock'));
});

s.run();
