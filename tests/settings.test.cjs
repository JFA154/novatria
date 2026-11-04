'use strict';
/* Settings defaults and the one-time upgrade of settings saved under the
   previous defaults (v1: Sonnet narrator, Haiku parser, every effort low).
   Anything the player typed themselves must survive the upgrade.
   Run with: node tests/run.cjs settings */
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('settings');
const KEY = 'novatria.settings';
// Wave 53: the bookkeeper's effort is high in Standard (and Thrifty): the labelled eval's lever.
const NEW = { narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'medium', parser: 'low', bookkeeper: 'high', chronicle: 'medium' } };

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
  assert.deepEqual(st.effort, NEW.effort);
  await page.evaluate(() => Game.Storage.saveSettings({ showRolls: false }));
  const raw = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
  assert.equal(raw.settingsVersion, 3);
  assert.equal(raw.showRolls, false);
});

s.test('settings saved under the old defaults are upgraded to the new ones, other choices kept', async h => {
  const page = await h.open();
  const st = await reloadWith(page, { narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' }, mockMode: false, showRolls: false, textSize: 'L' });
  assert.equal(st.narratorModel, NEW.narratorModel, 'old default narrator upgraded');
  assert.equal(st.parserModel, NEW.parserModel, 'old default parser upgraded');
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
  assert.deepEqual(st.effort, { narrator: 'high', parser: 'low', bookkeeper: 'low', chronicle: 'low' }, 'a changed effort set is kept as is');
});

s.test('the cheap models chosen on purpose after the upgrade are kept (and version 2\'s Thrifty becomes wave 53\'s Thrifty)', async h => {
  const page = await h.open();
  const st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' } });
  assert.equal(st.narratorModel, 'claude-sonnet-5-5');
  assert.equal(st.parserModel, 'claude-haiku-5-5');
  assert.deepEqual(st.effort, { narrator: 'low', parser: 'low', bookkeeper: 'high', chronicle: 'low' });
  assert.equal(await page.evaluate(() => Game.Storage.presetOf()), 'thrifty');
});

/* Wave 53: settings version 3. Version 2's Thrifty and Standard, exactly,
   take the bookkeeper's new effort (high), so a player on a preset stays on
   it; any other effort set under version 2 is the player's and is kept; a
   version 3 setting is never touched. */
s.test('version 2\'s Standard moves to the new Standard; a version 2 effort of the player\'s own, and any version 3 setting, are kept', async h => {
  const page = await h.open();
  let st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' } });
  assert.deepEqual(st.effort, NEW.effort);
  assert.equal(await page.evaluate(() => Game.Storage.presetOf()), 'standard');
  st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'high', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' } });
  assert.deepEqual(st.effort, { narrator: 'high', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' }, 'not a preset: kept as is');
  st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-opus-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' } });
  assert.equal(st.effort.bookkeeper, 'low', 'Thrifty\'s effort on other models is the player\'s own');
  st = await reloadWith(page, { settingsVersion: 3, narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' } });
  assert.equal(st.effort.bookkeeper, 'medium', 'a version 3 choice is kept');
  assert.equal(await page.evaluate(() => Game.Storage.presetOf()), 'custom');
  await page.evaluate(() => Game.Storage.saveSettings({ showRolls: false }));
  assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('novatria.settings')))).settingsVersion, 3);
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
  assert.deepEqual(st.effort, NEW.effort);
  assert.equal(st.textSize, 'L');
  assert.equal(st.narrationStyle, 'casual');
  assert.equal(st.inputMode, 'do');
});

s.run();
