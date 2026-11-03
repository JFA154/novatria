'use strict';
/* A saved game from before wave 26 (rules version 8, the build at 56e69f5).
   Wave 39: a thin wrapper over tests/fixtures/make-saves.cjs. makeV8Save()
   reads the committed fixture (tests/fixtures/saves/v8.json, no git history
   needed) and resolves to { env, debtor, rules } as it always did; the
   script it was played with (an insult, a beer bought, a favour, a
   confidence that warms someone to 50, a debt gone past due with the repo
   man's own line, the same line once more as the old editor left it with
   its act stripped, a few nights) is make-saves.cjs's SCRIPT.
   Usage: node tests/fixtures/make-v8-save.cjs   rebuilds v8.json from git
   history (the same as node tests/fixtures/make-saves.cjs 8). */
const { loadSave, BUILDS } = require('./make-saves.cjs');

const COMMIT = BUILDS[8].commit;

async function makeV8Save() {
  const env = loadSave(8);
  return { env, debtor: env.fixture.debtor, rules: env.fixture.rulesVersion };
}

module.exports = { makeV8Save, COMMIT };

if (require.main === module) {
  require('./make-saves.cjs').main(['8']).catch(e => { console.error(e); process.exit(1); });
}
