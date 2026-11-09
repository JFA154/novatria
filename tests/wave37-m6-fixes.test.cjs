'use strict';
/* Wave 37, Creator Mode, milestone 6 (the fixes the Rules and Freedom tabs
   asked for): rules.prices.factor reaches every listed price through
   State.priceFactor (1 for Low Water, so nothing changes there);
   rules.time.costs lets a story set the time an action type takes, over
   the parser's word, while an action it does not list keeps the parser's;
   the validator refuses freedom.create.people true ("not supported yet")
   and a lie floor that is not [trust at or below, difficulty]; the schema's
   help for the lie floors says trust, as Rel.difficultyFloor reads it.
   Mock mode. Run with: node tests/run.cjs wave37-m6-fixes */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave37-m6-fixes');

/* The built-in pack, copied, with these sections replaced, as the preview. */
function preview(page, patch) {
  return page.evaluate(p => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    for (const k of Object.keys(p)) c[k] = p[k];
    P.setPreview(c);
  }, patch);
}

s.test('rules.prices.factor 2 on a preview doubles State.priceFactor and every listed price; the built-in pack (factor 1) prices as before', async h => {
  const page = await h.open();
  await quickStart(page);
  const before = await page.evaluate(() => { const g = Game.Pack.tables().items.goods[0]; return { factor: Game.State.priceFactor(), name: g.name, listed: g.price, price: Game.Tables.price(g.name) }; });
  assert.equal(before.factor, 1);
  assert.equal(before.price, before.listed, 'a fresh game pays the listed price');
  await preview(page, { rules: { prices: { factor: 2 } } });
  const after = await page.evaluate(name => ({ factor: Game.State.priceFactor(), price: Game.Tables.price(name) }), before.name);
  assert.equal(after.factor, 2);
  assert.equal(after.price, before.listed * 2);
  await preview(page, { rules: { prices: { factor: 0 } } });
  assert.equal(await page.evaluate(() => Game.State.priceFactor()), 1, 'a factor that is not a positive number is ignored');
  await page.evaluate(() => Game.Pack.setPreview(null));
  assert.equal(await page.evaluate(name => Game.Tables.price(name), before.name), before.listed);
});

s.test('rules.time.costs: a story that says a look is long makes a parsed look long whatever the parser said, an action it does not list keeps the parser\'s word, and the built-in pack keeps the parser\'s every time', async h => {
  const page = await h.open();
  await quickStart(page);
  const parse = (type, cost) => page.evaluate(([t, c]) => Game.Pipeline.normaliseParse({ actionType: t, timeCost: c, summary: 'x' }, 'x').timeCost, [type, cost]);
  assert.equal(await parse('look', 'instant'), 'instant');
  await preview(page, { rules: { time: { costs: { look: 'long' } } } });
  assert.equal(await parse('look', 'instant'), 'long', 'the story\'s cost wins');
  assert.equal(await parse('look', 'short'), 'long');
  assert.equal(await parse('talk', 'short'), 'short', 'an action the story does not list keeps the parser\'s');
  await preview(page, { rules: { time: { costs: { look: 'forever' } } } });
  assert.equal(await parse('look', 'instant'), 'instant', 'a cost that is not one of the four is ignored');
  await page.evaluate(() => Game.Pack.setPreview(null));
  assert.equal(await parse('look', 'short'), 'short');
});

s.test('the validator refuses freedom.create.people true (engine.freedom.people) and a lie floor that is not [trust at or below, difficulty] (engine.floors.lie, one problem per bad row), and the schema\'s help for the lie floors says trust', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    c.freedom = { create: { people: true } };
    c.rules = { floors: { lie: [[-25, 'hard'], ['x', 'hard'], [-30], [-50, 'impossible'], [12.5, 'hard']] } };
    const probs = P.validate(c, { profile: 'play' }).filter(p => p.rule === 'engine.freedom.people' || p.rule === 'engine.floors.lie').map(p => `${p.severity} [${p.rule}] ${p.path}`);
    const ok = P.copy(P.builtIn());
    ok.freedom = { create: { people: false } };
    ok.rules = { floors: { lie: [[-25, 'hard'], [-50, 'very_hard']] } };
    const clean = P.validate(ok, { profile: 'strict' }).filter(p => p.rule === 'engine.freedom.people' || p.rule === 'engine.floors.lie');
    return { probs, clean: clean.length, help: P.SCHEMA.fields.rules.fields.floors.fields.lie.of.help };
  });
  assert.deepEqual(r.probs, [
    'error [engine.freedom.people] freedom.create.people',
    'error [engine.floors.lie] rules.floors.lie[1]',
    'error [engine.floors.lie] rules.floors.lie[2]',
    'error [engine.floors.lie] rules.floors.lie[3]',
    'error [engine.floors.lie] rules.floors.lie[4]'
  ]);
  assert.equal(r.clean, 0, 'people false and well-formed floors pass');
  assert.match(r.help, /trust at or below/);
  assert.doesNotMatch(r.help, /liking/);
});

s.run();
