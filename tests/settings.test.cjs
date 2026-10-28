'use strict';
/* Settings defaults and the one-time upgrade of settings saved under the
   previous defaults (v1: Sonnet narrator, Haiku parser, every effort low).
   Anything the player typed themselves must survive the upgrade.
   Run with: node tests/run.cjs settings */
const assert = require('assert/strict');
const { suite } = require('./helpers.cjs');

const s = suite('settings');
const KEY = 'novatria.settings';
const NEW = { narratorModel: 'claude-opus-5-5', parserModel: 'claude-sonnet-5-5', effort: { narrator: 'medium', parser: 'low', bookkeeper: 'medium', chronicle: 'medium' } };

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
  assert.equal(raw.settingsVersion, 2);
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

s.test('the cheap models chosen on purpose after the upgrade are kept', async h => {
  const page = await h.open();
  const st = await reloadWith(page, { settingsVersion: 2, narratorModel: 'claude-sonnet-5-5', parserModel: 'claude-haiku-5-5', effort: { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' } });
  assert.equal(st.narratorModel, 'claude-sonnet-5-5');
  assert.equal(st.parserModel, 'claude-haiku-5-5');
  assert.deepEqual(st.effort, { narrator: 'low', parser: 'low', bookkeeper: 'low', chronicle: 'low' });
});

s.run();
