'use strict';
/* Wave 37, Creator Mode, milestone 9 (task M9-E): the second story pack,
   Corvid Station (packs/starport.json), played end to end in mock mode.
   The pack is imported into the Library from its file and selected, and a
   new game starts with one of its backgrounds and a fixed seed. Checked:
   the validator and the budget; the arrival (its opening, the pack pinned
   in meta and State.pack, credits after the number); twenty seeded turns
   (a buy priced from the pack's goods, a roll against the pack's DCs, a
   report to the security chief and an arrest into the brig with the night
   there, a lost fight costed by the pack's damage rules, the water tanker
   docking as a DUE EVENT, a hand at Lucien Ferro's table for the pack's
   stake, a save and a reload that resolves the pack by its hash); no name
   or "$" of Lockett's Ferry in anything sent to a model (the one exception
   is named below); the Library card and the Creator on the pack; and Low
   Water byte for byte the v36 snapshot's afterwards.
   Run with: node tests/run.cjs wave37-starport */
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { suite, presetCards, ROOT } = require('./helpers.cjs');

const s = suite('wave37-starport');
const FILE = path.join(ROOT, 'packs', 'starport.json');
const TEXT = fs.readFileSync(FILE, 'utf8');
const PACK = JSON.parse(TEXT);
const FIXTURE = require('./fixtures/prompts-v36.json');
const SEED = 12345;
// The courier: arrives through the shuttle gate (arrival "gate").
const BG = PACK.player.backgrounds.findIndex(b => b.id === 'bg_courier');
const LAW = PACK.world.law;
const loc = id => PACK.world.locations.find(l => l.id === id);
const npc = id => PACK.world.npcs.find(n => n.id === id);
const good = name => PACK.world.tables.items.goods.find(g => g.name === name);
const EVENT = PACK.world.events.find(e => e.id === 'evt_water_tanker');
/* What Lockett's Ferry (the built-in story) would leak into another story. */
const FOREIGN = ['Lockett', 'Low Water', 'Mavis', 'Jodie', 'Chief Bell', 'Clayburn', 'Royce', 'Curtis', 'Dewayne', '$'];
/* The one exception (task M9-C, commit 7093042, plan decision F's "Parser/bookkeeper example sentences"): the
   example sentences of the engine's own system prompts keep their illustration names, since they show the form
   of a line, not the story; only their amounts follow the pack's money. And MEMORY_RULES keeps its "$40" (Upgrade's
   memory rewrite quotes it word for word). Exactly these, and nothing more, may show in Api.systemFor(role). */
const KEPT = {
  parser: ['Dewayne'],
  bookkeeper: ['Low Water', 'Mavis', 'Jodie', 'Curtis', 'Dewayne'],
  people: ['Mavis', 'Dewayne'],
  memories: ['Dewayne', '$']
};

/* Whole-string equality; on a mismatch, where the two first differ (as tests/wave37-pack.test.cjs compares). */
function sameText(actual, expected, what) {
  assert.equal(typeof actual, 'string', what + ' is a string');
  if (actual === expected) return;
  let i = 0;
  while (i < actual.length && i < expected.length && actual[i] === expected[i]) i++;
  const ctx = t => JSON.stringify(t.slice(Math.max(0, i - 20), i + 80));
  assert.fail(`${what} differs from the v36 snapshot at index ${i} (lengths ${actual.length} now, ${expected.length} before)\n`
    + `        now:    ${ctx(actual)}\n        before: ${ctx(expected)}`);
}
const foreignIn = text => FOREIGN.filter(w => String(text).includes(w));

/* The page with the mock answering at once and the Library read; then the starport imported from its file. */
async function ready(page) {
  await page.waitForFunction(() => window.Game && Game.App);
  await page.evaluate(async () => { Game.Api.Mock.delay = 0; await Game.Storage.Library.ready; await Game.Storage.Drafts.ready; });
  return page;
}
async function openWithStarport(h, opts) {
  const page = await ready(await h.open(opts));
  const rec = await page.evaluate(t => { const r = Game.Storage.Library.importText(t); return { id: r.id, source: r.source, hash: r.hash }; }, TEXT);
  assert.equal(rec.id, 'starport');
  return page;
}
/* New game of the selected starport, by the engine's own quick start (the helpers' quickStart reads Game.data, which is
   the built-in story until a game of another one starts): the courier's background and stats, the pack's first flaw. */
async function startCorvid(page) {
  await page.evaluate(({ bgIndex, seed }) => {
    Game.Storage.saveSettings({ selectedPackId: 'starport' });
    const p = Game.Pack.selected();
    const bg = p.player.backgrounds[bgIndex];
    Game.App.quickStart({ name: 'Tess Harlow', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who took the filters', flaw: p.player.flaws[0], looseEnds: [] }, { seed });
  }, { bgIndex: BG, seed: SEED });
  await page.waitForSelector('#screen-game.active');
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
}

/* Everything sent to a model this turn: each mock call's text (parser, narrator, bookkeeper and the rest), the
   turn's packet (Pipeline.lastCtx) and any raw response kept (Api.responses). Drained after each turn. */
function drain(page) {
  return page.evaluate(() => {
    const out = Game.Api.Mock.calls.map(c => ({ where: 'mock ' + c.method, text: String(c.text || '') }));
    Game.Api.Mock.calls.length = 0;
    const ctx = Game.Pipeline.lastCtx;
    if (ctx) out.push({ where: 'lastCtx.packet', text: typeof ctx.packet === 'string' ? ctx.packet : JSON.stringify(ctx.packet || '') });
    for (const r of (Game.Api.responses || [])) out.push({ where: 'Api.responses', text: JSON.stringify(r) });
    return out;
  });
}
/* One turn typed into the composer; resolves to the narrator's packet of it (or '') and what was sent. */
async function turn(page, run, text) {
  await page.fill('#cmd', text);
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const sent = await drain(page);
  run.sent.push(...sent.map(x => Object.assign({ input: text }, x)));
  run.turns += 1;
  const narr = sent.filter(x => x.where === 'mock narrate');
  return narr.length ? narr[narr.length - 1].text : '';
}
const lineOf = (packet, label) => (packet.split('\n').find(l => l.startsWith(label + ':')) || '');
const now = page => page.evaluate(() => {
  const st = Game.state, p = st.player;
  return { loc: p.locationId, day: st.time.day, phase: st.time.phase, gold: p.gold, hp: p.hp, narration: st.log[st.log.length - 1].narration };
});
/* The static prompts as they stand: the playing style's system prompt, the town and cast blocks, and every role's
   system prompt (Api.systemFor). */
const statics = page => page.evaluate(() => {
  const out = { system: Game.Style.systemPrompt(), town: Game.Pipeline.townBlock(), cast: Game.Pipeline.castBlock(), roles: {} };
  for (const k of Object.keys(Game.Api.SYSTEM)) out.roles[k] = Game.Api.systemFor(k);
  return out;
});

/* The tests' default quick start (tests/helpers.cjs quickStart, as the v36 snapshot was made), but reading the selected
   story as the Create screen does (Pack.selected()), not Game.data: with the Corvid game still loaded behind the title
   screen, Game.data is that game's pack (Pack.current()). For the built-in story the lists are the same objects. */
async function startLowWater(page, seed) {
  await page.evaluate(sd => {
    const p = Game.Pack.selected().player;
    const bg = p.backgrounds[0];
    const ks = ['debt', 'enemy', 'secret'];
    Game.App.quickStart({
      name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats),
      goal: 'Find out who sent the letter', flaw: p.flaws[0],
      looseEnds: ks.map(k => ({ kind: k, text: p.looseEnds[k].options[0] }))
    }, { seed: sd });
  }, seed);
  await page.waitForSelector('#screen-game.active');
}

/* The twenty seeded turns, in order; each step's readings for the tests below. */
async function playCorvid(page) {
  const run = { turns: 0, sent: [], statics: [] };
  await startCorvid(page);
  run.sent.push(...(await drain(page)).map(x => Object.assign({ input: '(the arrival)' }, x)));
  run.start = await page.evaluate(() => ({ narration: Game.state.log[0].narration, bar: document.querySelector('.tb-gold').textContent, time: document.getElementById('tb-time').textContent }));
  // 1. A look at the gate: CARRYING in credits.
  run.look = await turn(page, run, 'I look around');
  // 2-3. The cantina, and a bulb of coffee priced from the pack's goods.
  await turn(page, run, 'I walk to the Slack Line');
  run.atCantina = await now(page);
  await turn(page, run, 'I buy a bulb of coffee');
  run.bought = await now(page);
  // 4. A persuade: a charm roll against the pack's normal DC.
  run.persuade = await turn(page, run, 'I persuade Lucien Ferro to tell me about the card game');
  run.dcs = await page.evaluate(() => Object.assign({}, Game.Pack.get('rules.dcs')));
  // 5. A hand of five-card draw at Lucien Ferro's table, heads up, standing pat; no stake named, so the pack's.
  run.beforeCards = await now(page);
  run.dealer = await page.evaluate(() => { const d = Game.Pipeline.dealerOf(Game.State.npcsAt(Game.state.player.locationId).map(n => n.id)); return d ? d.id : null; });
  await presetCards(page, { game: 'draw', seats: [] });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsPlay = { hold: 'all' }; });
  await turn(page, run, 'Deal me in.');
  run.cards = await page.evaluate(() => ({ table: [...document.querySelectorAll('#feed .f-cards')].map(e => e.innerText).pop() || '', gold: Game.state.player.gold, stake: Game.Pack.get('rules.gamble.stake') }));
  // 6-8. The evening at the Security Office, and a report to the security chief.
  await turn(page, run, '/wait evening');
  await turn(page, run, 'I walk to the Security Office');
  run.atOffice = await now(page);
  run.report = await turn(page, run, 'I tell Ruth Adeyemi that Lucien Ferro cheats at cards');
  run.law = await page.evaluate(() => {
    const plan = Game.World.arrestPlan();
    return { head: Game.Rel.policeHead(), reportTo: Game.Rel.reportTo().ids, chief: plan.chiefId, cell: plan.cellId, action: Game.Pipeline.lastTurn.action.targets };
  });
  // 9. A swing at the chief in her own office (a failure, not a defeat): the arrest, and the night in the brig.
  run.beforeArrest = await now(page);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(10));
  run.arrest = await turn(page, run, 'I punch Ruth Adeyemi');
  run.afterArrest = await page.evaluate(() => {
    const st = Game.state;
    return {
      loc: st.player.locationId, day: st.time.day, phase: st.time.phase, gold: st.player.gold,
      narration: st.log[st.log.length - 1].narration,
      dividers: [...document.querySelectorAll('#feed .f-divider')].map(e => e.textContent),
      memory: (Game.State.npc('npc_ruth').memories || []).map(m => m.text).filter(t => /locked/.test(t))
    };
  });
  // 10. The morning, in the brig.
  run.morning = await turn(page, run, 'I look around');
  run.inBrig = await now(page);
  // 11-13. The dock ring, and a fight the player loses: two fumbles.
  await turn(page, run, 'I walk to the Dock Ring');
  run.beforeFight = await now(page);
  run.damage = await page.evaluate(() => Object.assign({}, Game.Pack.get('rules.hp.damage')));
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  run.fight1 = await turn(page, run, 'I punch Dario Varro');
  run.afterFight1 = await now(page);
  await page.evaluate(() => Game.Pipeline.forceNextRoll(1));
  run.fight2 = await turn(page, run, 'I punch Dario Varro again');
  run.defeat = await page.evaluate(() => ({ last: Game.state.player.lastDefeat, hp: Game.state.player.hp, narration: Game.state.log[Game.state.log.length - 1].narration }));
  // 14-15. The water tanker: the fourth day (an engine write, as tests/integration.test.cjs sets it), /skip to the dock ring at its phase.
  await page.evaluate(d => Game.State.apply({ setTime: { day: d, phase: 'morning' } }), EVENT.day);
  run.event = await turn(page, run, `/skip to ${loc(EVENT.locationId).name} in the ${EVENT.phase}`);
  run.atEvent = await page.evaluate(e => ({
    loc: Game.state.player.locationId, phase: Game.state.time.phase, fired: Game.state.eventsFired.filter(x => x === e).length,
    here: Game.State.npcsAt(Game.state.player.locationId).map(n => n.id)
  }), EVENT.id);
  run.eventFree = await page.evaluate(ids => ids.filter(id => { const n = Game.State.npc(id); return n && n.status === 'free' && n.alive !== false && !Game.State.awayNow(n); }), EVENT.attendees);
  await turn(page, run, '/wait night');
  run.firedAfter = await page.evaluate(e => Game.state.eventsFired.filter(x => x === e).length, EVENT.id);
  // 16. A save to slot 1, then a look in this page.
  run.statics.push(await statics(page));
  run.saved = await page.evaluate(async () => { const ok = Game.Storage.saveSlot(1, 'Corvid'); await Game.Storage.undoIdle(); return { ok: !!ok, hash: Game.state.meta.packHash, turn: Game.state.meta.turn }; });
  run.beforeReload = await turn(page, run, 'I look around');
  // 17. Reloaded: the slot loads with the pack it names, and the same turn again gives the same packet.
  await page.reload();
  await ready(page);
  run.loaded = await page.evaluate(async () => {
    const ok = await Game.App.loadSlot(1);
    const P = Game.Pack, st = Game.state;
    const lib = Game.Storage.Library.get('starport');
    return { ok: !!ok, id: Game.State.pack && Game.State.pack.meta.id, hash: st.meta.packHash, own: P.hash(Game.State.pack), lib: lib && lib.hash, current: P.current() === Game.State.pack, frozen: Object.isFrozen(Game.State.pack), turn: st.meta.turn };
  });
  await page.waitForSelector('#screen-game.active');
  await page.evaluate(() => { Game.Api.Mock.calls.length = 0; });
  run.afterReload = await turn(page, run, 'I look around');
  // 18-20. Playing on.
  await turn(page, run, 'I walk to the Slack Line');
  await turn(page, run, 'I ask Margit Szabo about the water tanker');
  await turn(page, run, '/wait evening');
  run.end = await now(page);
  run.statics.push(await statics(page));
  run.toolbar = await page.evaluate(() => ({ time: document.getElementById('tb-time').textContent, dividers: [...document.querySelectorAll('#feed .f-divider')].map(e => e.textContent) }));
  return run;
}

s.test('the pack itself: validate-pack.cjs prints the OK line with its counts and exits 0 in play; Pack.validate finds no error and no engine.budget; its budget estimate is under Pack.TOKEN_BUDGET', async h => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'validate-pack.cjs'), FILE], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '', 'not even a warning in play');
  const w = PACK.world;
  const away = w.locations.filter(l => l.away === true).length;
  assert.match(r.stdout, new RegExp(`^OK Corvid Station: ${w.locations.length} locations, ${w.npcs.length} npcs \\(`));
  assert.ok(r.stdout.includes(`, ${w.locations.length - away} town places, ${away} out of town), ${w.factions.length} factions (`), r.stdout);
  assert.ok(r.stdout.includes(`, ${w.threads.length} threads, ${w.seeds.length} seeds, ${w.rumours.length} rumours (`), r.stdout);
  assert.ok(r.stdout.includes(`, ${PACK.player.backgrounds.length} backgrounds, ${PACK.player.flaws.length} flaws, `), r.stdout);
  const page = await openWithStarport(h);
  const v = await page.evaluate(() => {
    const P = Game.Pack;
    const p = Game.Storage.Library.get('starport').pack;
    const problems = P.validate(p);
    return {
      errors: P.errors(problems).map(x => `${x.rule} ${x.path}`), budgetRule: problems.filter(x => x.rule === 'engine.budget').length,
      strictErrors: P.errors(P.validate(p, { profile: 'strict' })).map(x => `${x.rule} ${x.path}`),
      est: P.budgetEstimate(p).total, budget: P.TOKEN_BUDGET, rating: p.meta.rating, frozen: Object.isFrozen(p)
    };
  });
  assert.deepEqual(v.errors, []);
  assert.equal(v.budgetRule, 0, 'no engine.budget problem');
  assert.deepEqual(v.strictErrors, [], 'nor an error under the strict profile');
  assert.ok(v.est > 0 && v.est < v.budget, `under the budget: ${v.est} of ${v.budget}`);
  console.log(`        budget estimate: ${v.est} of ${v.budget} tokens`);
  assert.equal(v.rating, 'teen', 'rated teen: no 18+ ask');
  assert.equal(v.frozen, true);
});

s.test('the arrival: the game starts at the courier\'s shuttle gate with the pack\'s own opening ({place} and {town} filled), meta.packId starport, State.pack frozen and current; the status bar reads the background\'s cash as "260 cr" and CARRYING says the same', async h => {
  const page = await openWithStarport(h);
  await startCorvid(page);
  const r = await page.evaluate(() => {
    const st = Game.state, P = Game.Pack, p = Game.State.pack;
    return {
      loc: st.player.locationId, gold: st.player.gold, narration: st.log[0].narration, packId: st.meta.packId, packVersion: st.meta.packVersion, hash: st.meta.packHash, own: P.hash(p),
      frozen: [Object.isFrozen(p), Object.isFrozen(p.world), Object.isFrozen(p.world.npcs[0])], current: P.current() === p, title: p.meta.title, town: st.meta.townName,
      bar: document.querySelector('.tb-gold').textContent, consentAsked: !document.getElementById('screen-game').classList.contains('active')
    };
  });
  const bg = PACK.player.backgrounds[BG];
  const gate = loc(PACK.world.startLocationIds[bg.arrival]);
  assert.equal(r.loc, gate.id, 'the background\'s arrival place');
  assert.equal(r.loc, 'loc_shuttle_gate');
  const opening = PACK.player.arrivals[bg.arrival].opening.replace('{place}', gate.name.replace(/^The /, 'the ')).replace('{town}', PACK.world.name);
  assert.ok(!/[{}]/.test(opening));
  assert.ok(r.narration.includes(opening), `the opening "${opening}" in: ${r.narration}`);
  assert.equal(r.packId, 'starport');
  assert.equal(r.packVersion, PACK.meta.version);
  assert.equal(r.hash, r.own, 'meta.packHash is the hash of the pack the game plays');
  assert.deepEqual(r.frozen, [true, true, true]);
  assert.equal(r.current, true, 'Pack.current() is State.pack');
  assert.equal(r.town, 'Corvid Station');
  assert.equal(r.gold, bg.gold);
  assert.equal(r.bar, `${bg.gold} cr`, 'credits after the number');
  await page.evaluate(() => { Game.Api.Mock.calls.length = 0; });
  await page.fill('#cmd', 'I look around');
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const packet = await page.evaluate(() => Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop().text);
  assert.match(lineOf(packet, 'CARRYING'), new RegExp(`; cash ${bg.gold} cr, known to the player alone`), lineOf(packet, 'CARRYING'));
  assert.doesNotMatch(lineOf(packet, 'CARRYING'), /\$/);
});

s.test('twenty seeded mock turns on Corvid Station: a buy priced from the goods, a roll against the pack\'s DC, a report to the security chief and an arrest into the brig with the night there, a lost fight costed by the pack\'s damage, the water tanker docking, a hand at the cards for the pack\'s stake in credits, and a save that reloads by the pack\'s hash and plays on', async h => {
  const page = await openWithStarport(h);
  const run = await playCorvid(page);
  assert.equal(run.turns, 20, 'twenty turns');
  assert.equal(run.start.bar, '260 cr');
  // The buy: the price of the pack's own good leaves the cash.
  assert.equal(run.atCantina.loc, 'loc_cantina');
  assert.equal(run.atCantina.gold - run.bought.gold, good('Bulb of coffee').price);
  assert.equal(good('Bulb of coffee').price, 4);
  // The roll: charm against the pack's normal DC.
  assert.equal(run.dcs.normal, 12);
  assert.match(lineOf(run.persuade, 'ROLL'), new RegExp(`^ROLL: Charm \\d+ [+−-] \\d+ = \\d+ vs ${run.dcs.normal} · `), lineOf(run.persuade, 'ROLL'));
  // The cards: Lucien Ferro deals, for the pack's stake, in credits.
  assert.equal(run.dealer, 'npc_lucien');
  assert.ok(npc('npc_lucien').tags.includes('cards'));
  assert.equal(run.cards.stake, PACK.rules.gamble.stake);
  assert.match(run.cards.table, new RegExp(`^LUCIEN FERRO'S TABLE · FIVE-CARD DRAW · ${PACK.rules.gamble.stake} CR TO SIT · `), run.cards.table);
  const net = run.cards.gold - run.beforeCards.gold;
  assert.ok(run.cards.table.includes(`${net < 0 ? `You lose ${-net} cr` : net > 0 ? `You win ${net} cr` : ''}`) && run.cards.table.includes(`cash ${run.cards.gold} cr`), run.cards.table);
  assert.doesNotMatch(run.cards.table, /\$/);
  // The report: the pack's security chief hears it (World.chiefOf, read through arrestPlan) and the brig is the cell.
  assert.equal(run.atOffice.loc, LAW.arrestPlaceId);
  assert.deepEqual(run.law, { head: LAW.headNpcId, reportTo: [LAW.headNpcId], chief: LAW.headNpcId, cell: LAW.arrestPlaceId, action: ['npc_ruth', 'npc_lucien'] });
  assert.equal(LAW.headNpcId, 'npc_ruth');
  // The arrest: the cell line names the brig (the Security Office), never Town Hall, with the pack's fine in credits.
  const arrest = lineOf(run.arrest, 'ARREST');
  assert.equal(arrest.indexOf(`ARREST: Ruth Adeyemi puts Tess Harlow in the holding cell at the Security Office for the night over the fight at the Security Office, with a ${PACK.rules.law.fine} cr fine.`), 0, arrest);
  assert.doesNotMatch(run.arrest, /Town Hall/);
  assert.equal(run.beforeArrest.gold - run.afterArrest.gold, PACK.rules.law.fine);
  assert.ok(run.afterArrest.narration.includes('Ruth Adeyemi puts you in the holding cell at the Security Office for the night'), run.afterArrest.narration);
  assert.equal(run.afterArrest.memory.length, 1, 'the chief remembers locking the player up');
  // The night in the brig: the morning (the pack's first shift) and the player still there.
  assert.deepEqual([run.afterArrest.loc, run.afterArrest.day, run.afterArrest.phase], [LAW.arrestPlaceId, 2, 'morning']);
  assert.ok(run.afterArrest.dividers.includes(`Day 2 · Tuesday · ${PACK.setting.phaseLabels.morning}`), JSON.stringify(run.afterArrest.dividers));
  assert.match(run.morning, /\nDAY 2 \([^)]*\), MORNING/);
  assert.equal(run.inBrig.loc, LAW.arrestPlaceId);
  // The fight lost: a fumble costs the pack's critical-failure damage, the next one beats the player.
  assert.equal(run.beforeFight.loc, 'loc_dock_ring');
  assert.equal(run.beforeFight.hp - run.afterFight1.hp, run.damage.critical_failure);
  assert.match(run.fight2, /\nDEFEAT: the player is beaten senseless\./);
  assert.ok(run.defeat.last && ['robbed', 'gutter', 'rescued', 'captured'].includes(run.defeat.last.outcome), JSON.stringify(run.defeat.last));
  assert.match(run.defeat.narration, /You black out\./);
  // The water tanker: its DUE EVENT line is one of its branches, its free attendees are present, and it fired once.
  const due = lineOf(run.event, 'DUE EVENT');
  assert.ok(EVENT.branches.some(b => due.startsWith(`DUE EVENT: ${b.text}`)), due);
  assert.deepEqual([run.atEvent.loc, run.atEvent.phase, run.atEvent.fired], [EVENT.locationId, EVENT.phase, 1]);
  assert.ok(run.eventFree.length >= 2 && run.eventFree.every(id => run.atEvent.here.includes(id)), JSON.stringify(run.atEvent));
  for (const id of run.eventFree) assert.ok(lineOf(run.event, 'PRESENT').includes(npc(id).name), `${npc(id).name} is PRESENT`);
  assert.equal(run.firedAfter, 1, 'once');
  // The save and the reload: the pack resolved by its hash, and the same turn after it is the same packet.
  assert.equal(run.saved.ok, true);
  assert.deepEqual(run.loaded, { ok: true, id: 'starport', hash: run.saved.hash, own: run.saved.hash, lib: run.saved.hash, current: true, frozen: true, turn: run.saved.turn });
  assert.ok(run.beforeReload.length > 500);
  assert.equal(run.afterReload, run.beforeReload, 'the turn after the reload sends the packet the same turn sent before it');
  assert.equal(run.end.loc, 'loc_cantina');
  assert.equal(run.end.phase, 'evening');
});

s.test('no Lockett\'s Ferry in sight: no packet, parser, narrator or bookkeeper call, town block, cast block or playing system prompt of the twenty turns names Lockett, Low Water, Mavis, Jodie, Chief Bell, Clayburn, Royce, Curtis, Dewayne or "$"; the role prompts keep only the example names task M9-C kept; the toolbar shows the pack\'s shifts while the packet keeps the engine\'s phase ids', async h => {
  const page = await openWithStarport(h);
  const run = await playCorvid(page);
  assert.ok(run.sent.length >= 60, 'every turn sent something: ' + run.sent.length);
  assert.ok(run.sent.some(x => x.where === 'mock parse') && run.sent.some(x => x.where === 'mock narrate') && run.sent.some(x => x.where === 'mock bookkeep'));
  const leaks = run.sent.map(x => ({ input: x.input, where: x.where, hits: foreignIn(x.text) })).filter(x => x.hits.length);
  assert.deepEqual(leaks, [], 'nothing sent names Lockett\'s Ferry');
  for (const st of run.statics) {
    assert.deepEqual(foreignIn(st.system), [], 'the playing style\'s system prompt');
    assert.deepEqual(foreignIn(st.town), [], 'the town block');
    assert.deepEqual(foreignIn(st.cast), [], 'the cast block');
    assert.ok(st.town.includes('Corvid Station') && st.cast.includes('Ruth Adeyemi'));
    for (const [role, text] of Object.entries(st.roles)) {
      if (typeof text !== 'string') continue;
      assert.deepEqual(foreignIn(text), KEPT[role] || [], `Api.systemFor('${role}') names only the example names M9-C kept`);
    }
    // The amounts in the kept examples are the pack's money.
    assert.ok(st.roles.parser.includes('bets 20 cr at cards'), 'the parser\'s stake example in credits');
    assert.ok(st.roles.bookkeeper.includes('Day 6; 500 cr cash,') && st.roles.bookkeeper.includes("'owes me 40 cr by Friday')."), 'the bookkeeper\'s amounts in credits');
  }
  // The phase labels: the toolbar and the feed's dividers are the pack's; the packet's clock line keeps the engine's ids.
  const L = PACK.setting.phaseLabels;
  assert.equal(run.start.time, `Day 1 · ${L.morning}`);
  assert.equal(run.toolbar.time, `Day ${run.end.day} · ${L.evening}`);
  assert.ok(run.toolbar.dividers.length >= 2 && run.toolbar.dividers.every(d => Object.values(L).some(x => d.endsWith(' · ' + x))), JSON.stringify(run.toolbar.dividers));
  const clock = run.sent.filter(x => x.where === 'mock narrate').map(x => (/^DAY \d+ \([^)]*\), ([A-Z]+)/m.exec(x.text) || [])[1]).filter(Boolean);
  assert.ok(clock.length >= 15, 'a clock line in every narrator packet');
  assert.ok(clock.every(p => ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].includes(p)), JSON.stringify(clock));
  assert.ok(run.sent.every(x => !/SHIFT|Sleep cycle/i.test((/^DAY \d+ .*$/m.exec(x.text) || [''])[0])), 'no shift name on the clock line');
});

s.test('the Library and the Creator: the starport\'s card shows "Corvid Station", "by Novatria · version 1.0.0", the teen chip and a full ring; Open in Creator opens its draft on the Town list with credits and the security chief\'s law; the Prompt view\'s meter is under the budget; the JSON tab is Pack.format of the pack', async h => {
  const page = await openWithStarport(h, { contextOptions: { reducedMotion: 'reduce' } });
  await page.click('#btn-create');
  await page.waitForSelector('#screen-creator.active #creator-library:not([hidden])');
  const c = await page.evaluate(() => {
    const el = document.querySelector('#creator-cards .cr-card[data-id="starport"]');
    return {
      title: el.querySelector('.cr-card-title').textContent, by: el.querySelector('.cr-card-by').textContent, badge: el.querySelector('.cr-badge').textContent,
      chip: el.querySelector('.cr-chip').textContent, chipRating: el.querySelector('.cr-chip').dataset.rating,
      ring: el.querySelector('.cr-ring').dataset.pct, ringLabel: el.querySelector('.cr-ring').getAttribute('aria-label'),
      premise: el.querySelector('.cr-card-premise').textContent, actions: [...el.querySelectorAll('button')].map(b => b.textContent),
      complete: Game.Pack.completeness(Game.Storage.Library.get('starport').pack)
    };
  });
  assert.deepEqual([c.title, c.by, c.chip, c.chipRating], ['Corvid Station', `by ${PACK.meta.author} · version ${PACK.meta.version}`, 'teen', 'teen']);
  assert.equal(PACK.meta.author, 'Novatria');
  assert.deepEqual([c.ring, c.ringLabel, c.complete], ['100', '100% complete', 1], 'a full completeness ring');
  assert.equal(c.badge, 'Imported');
  assert.equal(c.premise, PACK.opening.premise);
  assert.ok(c.actions.includes('Play this story') && c.actions.includes('Open in Creator'), JSON.stringify(c.actions));
  await page.click('#creator-cards .cr-card[data-id="starport"] [data-action=open]');
  await page.waitForSelector('#creator-editor:not([hidden])');
  await page.click('#creator-tab-world');
  await page.waitForSelector('#cr-world-body[data-sub="town"]');
  const town = await page.evaluate(() => {
    const b = document.getElementById('cr-world-body');
    const v = p => { const el = b.querySelector(`[data-path="${p}"]`); return el ? el.value : null; };
    return {
      name: v('world.name'), symbol: v('world.currency.symbol'), head: v('world.law.headNpcId'), faction: v('world.law.factionId'), cell: v('world.law.arrestPlaceId'), news: v('world.law.newsTemplate'),
      draftOf: Game.Storage.Drafts.get(Game.Creator.state.draftId).fromPackId
    };
  });
  assert.deepEqual(town, { name: 'Corvid Station', symbol: 'cr', head: LAW.headNpcId, faction: LAW.factionId, cell: LAW.arrestPlaceId, news: LAW.newsTemplate, draftOf: 'starport' });
  await page.click('#creator-tab-preview');
  await page.waitForSelector('#creator-preview .cr-pblock');
  const m = await page.evaluate(() => ({
    head: document.getElementById('creator-meter-num').textContent, over: document.getElementById('creator-meter').dataset.over,
    view: document.querySelector('#creator-preview .cr-preview-meter .cr-meter-num').textContent,
    est: Game.Pack.budgetEstimate(Game.Creator.state.draft).total, budget: Game.Pack.TOKEN_BUDGET, cached: Game.Creator.Preview.last.tokens.cachedTotal,
    system: document.querySelector('#creator-preview .cr-pblock .cr-pre').textContent
  }));
  const meter = `${m.est.toLocaleString('en-US')} of ${m.budget.toLocaleString('en-US')} tokens · estimate`;
  assert.ok(m.est < m.budget, m.head);
  assert.equal(m.over, '0');
  assert.equal(m.head, meter);
  assert.equal(m.view, meter);
  assert.equal(m.cached, m.est, 'the Prompt view and the meter count the same blocks');
  assert.deepEqual(foreignIn(m.system), [], 'the Prompt view\'s system prompt names nothing of Lockett\'s Ferry');
  await page.click('#creator-tab-json');
  const j = await page.evaluate(() => ({ shown: document.getElementById('creator-json').textContent, draft: Game.Pack.format(Game.Creator.state.draft), pack: Game.Pack.format(Game.Storage.Library.get('starport').pack) }));
  assert.equal(j.shown, j.pack, 'the JSON tab is Pack.format of the pack');
  assert.equal(j.shown, j.draft);
  assert.equal(j.pack, TEXT, 'and that is packs/starport.json byte for byte');
});

s.test('Low Water is untouched: after the twenty Corvid turns, a save and a reload in the same page, a new Low Water game\'s first packet and its system prompts and town and cast blocks are the v36 snapshot\'s byte for byte', async h => {
  const page = await openWithStarport(h);
  const run = await playCorvid(page);
  assert.equal(run.turns, 20);
  await page.evaluate(() => { Game.App.quitToTitle(); Game.Storage.saveSettings({ selectedPackId: 'low-water' }); Game.Api.Mock.delay = 0; });
  assert.equal(await page.evaluate(() => Game.Pack.selected() === Game.Pack.builtIn()), true);
  // As tests/wave37-pack.test.cjs starts the snapshot's game: the tests' default quick start, the arrival's turn over, the call list emptied.
  await startLowWater(page, FIXTURE.playthrough.seed);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  await page.evaluate(() => { Game.Api.Mock.calls.length = 0; });
  const blocks = await page.evaluate(() => ({
    packId: Game.state.meta.packId, builtIn: Game.State.pack === Game.Pack.builtIn(),
    casual: Game.Style.systemPrompt('casual'), literary: Game.Style.systemPrompt('literary'), town: Game.Pipeline.townBlock(), cast: Game.Pipeline.castBlock(),
    parser: Game.Api.systemFor('parser'), bookkeeper: Game.Api.systemFor('bookkeeper'), bar: document.querySelector('.tb-gold').textContent, time: document.getElementById('tb-time').textContent
  }));
  assert.equal(blocks.packId, 'low-water');
  assert.equal(blocks.builtIn, true);
  for (const k of ['casual', 'literary', 'town', 'cast', 'parser', 'bookkeeper']) sameText(blocks[k], FIXTURE[k], k);
  assert.match(blocks.bar, /^\$\d+$/, 'dollars before the number again');
  assert.match(blocks.time, /^Day 1 · Morning$/);
  await page.evaluate(t => Game.Pipeline.submit(t, { mode: 'do' }).catch(() => null), FIXTURE.playthrough.inputs[0]);
  await page.waitForFunction(() => !Game.Pipeline.busy);
  const first = await page.evaluate(() => { const c = Game.Api.Mock.calls.filter(x => x.method === 'narrate'); return c.length ? c[0].text : null; });
  sameText(first, FIXTURE.firstPacket, 'the first turn\'s narrator packet');
});

s.run();
