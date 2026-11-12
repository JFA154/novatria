'use strict';
/* Wave 37, Creator Mode, milestone 9 (task M9-C; plan decision F's rows
   for "Style NAME_ALLOW ... TEEN_RE", "Phase labels" and "Parser/
   bookkeeper example sentences"): the engine's last vocabulary readers as
   data. setting.vocabulary { police, essentials, teen, lodging } reaches
   the police checks (Rel.isPoliceNpc, Dice's hard role), Pipeline's
   essentials (a refused sale's "tonight") and State's goods words, Rel's
   teen words (which only add to the engine's) and State's lodging;
   setting.phaseLabels reaches the toolbar, the feed's day divider, /cheat
   time and the recap while the narrator's packet keeps "morning"; the
   parser's and bookkeeper's example amounts are written in the pack's
   money. The built-in pack reads exactly as before, and index.html's text
   (outside the JSON element and comments) names Low Water only where the
   last test says why. A pack's own values are set on a preview
   (Pack.setPreview, a copy of the built-in pack), the editor's way. Mock
   mode.
   Run with: node tests/run.cjs wave37-vocabulary */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { suite, quickStart, sendText, LAPTOP, ROOT } = require('./helpers.cjs');

const s = suite('wave37-vocabulary');
const CREDITS = { symbol: 'cr', name: 'credits', before: false, words: ['credits', 'creds'] };

/* The built-in pack, copied, with o.vocabulary, o.phaseLabels, o.currency
   and o.npcs (id -> fields merged onto that person) set, as the preview. */
function preview(page, o) {
  return page.evaluate(o => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    if (o.vocabulary) c.setting.vocabulary = o.vocabulary;
    if (o.phaseLabels) c.setting.phaseLabels = o.phaseLabels;
    if (o.currency) c.world.currency = o.currency;
    for (const [id, f] of Object.entries(o.npcs || {})) Object.assign(c.world.npcs.find(n => n.id === id), f);
    P.setPreview(c);
  }, o);
}
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
async function start(page) {
  await quickStart(page, { kinds: [] });
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  await fast(page);
}

s.test('the built-in pack: Pack.vocabulary gives the engine\'s lists, each reader\'s own police pattern comes back while the pack sets none, and the essentials, teen and lodging patterns built from the defaults read every sample as the old literals did', async h => {
  const page = await h.open();
  const r = await page.evaluate(() => {
    const P = Game.Pack;
    const OLD = {
      essentials: /\b(room|rooms|night|nights|bed|lodging|motel|gas|gasoline|fuel|diesel|fill (?:it|her|'er) up|tank|food|eat|meal|plate|sandwich|burger|breakfast|lunch|supper|dinner|biscuit|catfish|fries|soup|chili|coffee)\b/i,
      teen: /\b(teens?|teenagers?|teenaged|student|schoolgirl|schoolboy|high school|middle school|county school|after school|kid|child|minor|freshman|sophomore|junior|senior at|grade)\b/i,
      lodging: /^(?:a\s+)?(?:night|nights|room)\s+(?:at|in)\b/i
    };
    const samples = {
      essentials: ['I buy a tank of gas', 'fill \'er up', 'fill her up please', 'a room for the night', 'some catfish', 'a flashlight', 'roomy', 'gasket', 'I eat', 'breakfasts', 'COFFEE'],
      teen: ['a high school junior', 'student at the county school', 'teenaged', 'kids', 'grader', 'senior at Calder', 'senior citizen', 'a minor league umpire', 'the child', 'mechanic'],
      lodging: ['Night at the motel', 'a room in the Riverview', 'Rooms at the inn', 'a night out', 'room service', 'nights at the Motor Court', 'A berth at the dock hostel']
    };
    const read = {};
    for (const k of Object.keys(samples)) {
      const re = k === 'lodging' ? P.vocabularyRe('lodging', null, '^(?:a\\s+)?(?:{words})\\s+(?:at|in)\\b') : P.vocabularyRe(k);
      read[k] = samples[k].map(t => [re.test(t), OLD[k].test(t)]);
    }
    const engine = /\b(police|sheriff|deputy|officer)\b/i;
    return {
      lists: Object.fromEntries(P.VOCABULARY_KINDS.map(k => [k, P.vocabulary(k)])),
      own: P.VOCABULARY_KINDS.map(k => P.vocabulary(k, true).length),
      engineBack: P.vocabularyRe('police', engine) === engine,
      memo: P.vocabularyRe('teen') === P.vocabularyRe('teen'),
      read,
      phases: ['morning', 'afternoon', 'evening', 'night'].map(p => P.phaseLabel(p)),
      defaults: Object.isFrozen(P.DEFAULTS.setting.vocabulary.police) && JSON.stringify(P.DEFAULTS.setting.phaseLabels)
    };
  });
  assert.deepEqual(r.lists.police, ['police', 'officer', 'deputy', 'sheriff', 'trooper', 'constable', 'watchman', 'cop']);
  assert.deepEqual(r.lists.lodging, ['night', 'nights', 'room']);
  assert.equal(r.lists.essentials.length, 31);
  assert.equal(r.lists.teen.length, 20);
  assert.deepEqual(r.own, [0, 0, 0, 0], 'Low Water sets no list of its own');
  assert.ok(r.engineBack, 'a reader\'s own pattern while the pack sets none');
  assert.ok(r.memo, 'built once per pack');
  for (const k of Object.keys(r.read)) for (const [i, [now, old]] of r.read[k].entries()) assert.equal(now, old, `${k} sample ${i}`);
  assert.deepEqual(r.phases, ['Morning', 'Afternoon', 'Evening', 'Night']);
  assert.equal(r.defaults, '{}');
});

s.test('setting.vocabulary.police ["marshal", "watch"]: a "station marshal" is the police (Rel.isPoliceNpc, a hard fight in Dice, the head a report goes to with no law) and a "deputy" no longer is; the built-in pack reads the deputy as police and the marshal not', async h => {
  const page = await h.open();
  const read = () => page.evaluate(() => {
    const G = Game, R = G.Rel;
    const npcs = G.Pack.current().world.npcs;
    const noTags = n => Object.assign({}, n, { tags: [] });
    const marshal = noTags(npcs.find(n => n.id === 'npc_glenda'));
    const deputy = noTags(npcs.find(n => n.id === 'npc_teresa'));
    /* The head by role: a reading of a game that is not the live one and not
       the built-in story names no law and no head, so the head is the first
       free police person whose role says chief. */
    const chief = { id: 'npc_x_chief', name: 'Ada Vance', role: 'chief marshal of the ring', tags: [], status: 'free', alive: true, presence: 'here' };
    const ctx = { s: { npcs: [chief], meta: { packId: 'x-test', turn: 0 }, player: { locationId: null }, time: { day: 1, phase: 'morning' }, flags: {} }, town: { npcs: [chief] } };
    return {
      roles: [marshal.role, deputy.role],
      police: [R.isPoliceNpc(marshal), R.isPoliceNpc(deputy)],
      threat: [G.Dice.threat(marshal), G.Dice.threat(deputy), G.Dice.threat({ role: 'bouncer at the club', tags: [] })],
      head: R.policeHead(ctx)
    };
  });
  const npcs = { npc_glenda: { role: 'station marshal', tags: [], age: 40 }, npc_teresa: { role: 'deputy sheriff', tags: [], age: 40 } };
  await preview(page, { npcs });
  const built = await read();
  await preview(page, { npcs, vocabulary: { police: ['marshal', 'watch'] } });
  const own = await read();
  assert.deepEqual(own.roles, ['station marshal', 'deputy sheriff']);
  assert.deepEqual(own.police, [true, false], 'the marshal is the police, the deputy is not');
  assert.deepEqual(own.threat, ['hard', 'normal', 'hard'], 'a bouncer is hard in any story');
  assert.equal(own.head, 'npc_x_chief', 'the chief marshal is the head a report goes to');
  assert.deepEqual(built.police, [false, true], 'the built-in words: the deputy, not the marshal');
  assert.deepEqual(built.threat, ['normal', 'hard', 'hard']);
  assert.equal(built.head, null);
});

s.test('setting.vocabulary.essentials ["air tax", "a berth"]: a shop against the player refuses "the air tax" for tonight only, as it does a tank of gas in the built-in pack, where the air tax is no essential; the essentials are goods words too (State.goodNamed)', async h => {
  const page = await h.open();
  const sale = async () => {
    await start(page);
    return page.evaluate(async () => {
      const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
      S.apply({ relSet: { npcId: 'npc_royce', w: -40 } });
      const buy = async (what, input) => {
        S.apply({ setTime: { day: st.time.day, phase: 'morning' } });
        S.apply({ playerLocationId: 'loc_pittmans' });
        S.apply({ visits: [{ npcId: 'npc_royce', locationId: 'loc_pittmans' }] });
        M.queue('parse', { actionType: 'buy', summary: `Buys ${what}`, targets: ['npc_royce'], needsRoll: false, timeCost: 'instant' });
        M.queue('bookkeep', { goldDelta: -10, itemsGained: [what] });
        await G.Pipeline.submit(input);
        const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
        return (pk.split('\n').find(l => /^WON'T SELL/.test(l)) || '').replace(/^WON'T SELL: Royce Pittman is against \S+ and will not sell to them/, '');
      };
      return {
        tax: await buy('Air tax', 'I pay the air tax'),
        gas: await buy('Gas can', 'I buy a tank of gas'),
        named: ['air tax', 'a berth', 'the sunset'].map(t => S.goodNamed(t))
      };
    });
  };
  await preview(page, { vocabulary: { essentials: ['air tax', 'a berth'] } });
  const own = await sale();
  await page.evaluate(() => Game.Pack.setPreview(null));
  const built = await sale();
  assert.equal(own.tax, ' tonight; say so plainly. Nothing is bought.', 'the story\'s essential');
  assert.equal(own.gas, '; say so plainly. Nothing is bought.', 'gas is not this story\'s essential');
  assert.deepEqual(own.named, [true, true, false]);
  assert.equal(built.tax, '; say so plainly. Nothing is bought.');
  assert.equal(built.gas, ' tonight; say so plainly. Nothing is bought.');
  assert.deepEqual(built.named, [false, false, false]);
});

s.test('setting.vocabulary.teen ["youngster"]: someone with no age whose role says "youngster" is under 18 (Rel.isMinor), and the engine\'s words still count ("student"); in the built-in pack the youngster is not, the student is; a 16-year-old is, whatever the words', async h => {
  const page = await h.open();
  const read = () => page.evaluate(() => {
    const R = Game.Rel, ctx = { s: null, town: null };
    const who = (role, age) => Object.assign({ id: 'npc_x_' + role.replace(/\W+/g, '_'), name: 'Someone', role, tags: [] }, age === undefined ? {} : { age });
    return {
      minor: [R.isMinor(who('youngster on the docks'), ctx), R.isMinor(who('student at the academy'), ctx), R.isMinor(who('cargo loader'), ctx), R.isMinor(who('cargo loader', 16), ctx), R.isMinor(who('youngster on the docks', 30), ctx)],
      list: Game.Pack.vocabulary('teen').slice(-2)
    };
  });
  const built = await read();
  await preview(page, { vocabulary: { teen: ['youngster', 'Kid'] } });
  const own = await read();
  assert.deepEqual(own.minor, [true, true, false, true, false]);
  assert.deepEqual(own.list, ['grade', 'youngster'], 'added to the engine\'s, lower case, once');
  assert.deepEqual(built.minor, [false, true, false, true, false]);
});

s.test('setting.vocabulary.lodging ["berth"]: "a berth at the dock hostel" bought is a paid night, not a thing carried, and the goods table\'s "Night at the motel" no longer pays a night; the built-in pack reads them the other way round; a place typed "berth" gives a bed for a paid night', async h => {
  const page = await h.open();
  const buy = () => page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const out = {};
    for (const name of ['A berth at the dock hostel', 'Night at the motel']) {
      delete st.flags.lodgingPaidUntilDay;
      S.apply({ itemsGained: [name] });
      out[name] = { paid: st.flags.lodgingPaidUntilDay === st.time.day + 1, carried: st.player.inventory.some(i => i.name === name) };
    }
    // A paid night in a place of the story's lodging type is a bed.
    const l = st.locations.find(x => x.id === 'loc_motor_court');
    const was = l.type;
    l.type = 'berth';
    S.apply({ playerLocationId: l.id });
    st.flags.lodgingPaidUntilDay = st.time.day + 1;
    out.bed = S.restQuality();
    l.type = was;
    return out;
  });
  await preview(page, { vocabulary: { lodging: ['berth'] } });
  await start(page);
  const own = await buy();
  await page.evaluate(() => Game.Pack.setPreview(null));
  await start(page);
  const built = await buy();
  assert.deepEqual(own['A berth at the dock hostel'], { paid: true, carried: false });
  assert.equal(own['Night at the motel'].paid, false, 'a service of the goods table, had there, but no night paid');
  assert.equal(own.bed, 'bed');
  assert.deepEqual(built['A berth at the dock hostel'], { paid: false, carried: true });
  assert.deepEqual(built['Night at the motel'], { paid: true, carried: false });
});

s.test('setting.phaseLabels { morning: "First shift" }: the toolbar, the feed\'s day divider, /cheat time\'s line and the recap say it; the narrator\'s packet still says morning; the built-in pack says Morning', async h => {
  const page = await h.open({ viewport: LAPTOP });
  const read = async () => {
    await start(page);
    await sendText(page, '/cheat time morning 2');
    const ui = await page.evaluate(() => ({
      bar: document.getElementById('tb-time').textContent,
      divider: [...document.querySelectorAll('#feed .f-divider')].pop().textContent,
      quiet: [...document.querySelectorAll('#feed .f-quiet')].pop().textContent,
      recap: Game.Pipeline.recapText().split('\n')[0],
      label: Game.Pack.phaseLabel('evening')
    }));
    await sendText(page, 'I look around.');
    ui.packet = await page.evaluate(() => (Game.Api.Mock.calls.filter(c => c.method === 'narrate').pop() || {}).text || '');
    return ui;
  };
  await preview(page, { phaseLabels: { morning: '  First   shift  ', evening: '' } });
  const own = await read();
  await page.evaluate(() => Game.Pack.setPreview(null));
  const built = await read();
  assert.equal(own.bar, 'Day 2 · First shift');
  assert.match(own.divider, /^Day 2 · \w+ · First shift$/);
  assert.equal(own.quiet, 'Clock set to Day 2 · First shift.');
  assert.match(own.recap, /^Day 2 \([^)]*\), first shift, at /);
  assert.equal(own.label, 'Evening', 'an empty label keeps the engine\'s word');
  assert.match(own.packet, /\bmorning\b/i);
  assert.doesNotMatch(own.packet, /First shift/i, 'the packet keeps the phase ids');
  assert.equal(built.bar, 'Day 2 · Morning');
  assert.match(built.divider, /^Day 2 · \w+ · Morning$/);
  assert.equal(built.quiet, 'Clock set to Day 2 · Morning.');
  assert.match(built.recap, /^Day 2 \([^)]*\), morning, at /);
  // At most 24 characters.
  const long = await page.evaluate(() => { const P = Game.Pack, c = P.copy(P.builtIn()); c.setting.phaseLabels = { night: 'The long dark between the two watches' }; P.setPreview(c); const out = P.phaseLabel('night'); P.setPreview(null); return out; });
  assert.equal(long, 'The long dark between th');
});

s.test('the parser\'s and bookkeeper\'s example amounts: "bets 20 cr at cards", "500 cr cash" and "owes me 40 cr" under credits, in the prompts and the parse schema; the built-in pack\'s prompts and schema are today\'s, "$20", "$500" and "$40" (the snapshot suite pins every byte), and MEMORY_RULES keeps its "$40"', async h => {
  const page = await h.open();
  const read = () => page.evaluate(() => {
    const A = Game.Api;
    const parser = A.systemFor('parser'), book = A.systemFor('bookkeeper'), memories = A.systemFor('memories');
    return {
      parser: (parser.match(/bets [^"]* at cards/) || [''])[0], book: [(book.match(/Day 6; [^,]*,/) || [''])[0], (book.match(/'owes me [^']*'/) || [''])[0]],
      memories: (memories.match(/'owes me [^']*'/) || [''])[0],
      sameAsSystem: [parser === A.SYSTEM.parser, book === A.SYSTEM.bookkeeper], dollars: (parser + book).split('$').length - 1
    };
  });
  const built = await read();
  await preview(page, { currency: CREDITS });
  const own = await read();
  assert.deepEqual(built, { parser: 'bets $20 at cards', book: ['Day 6; $500 cash,', '\'owes me $40 by Friday\''], memories: '\'owes me $40 by Friday\'', sameAsSystem: [true, true], dollars: 3 });
  assert.deepEqual(own, { parser: 'bets 20 cr at cards', book: ['Day 6; 500 cr cash,', '\'owes me 40 cr by Friday\''], memories: '\'owes me $40 by Friday\'', sameAsSystem: [false, false], dollars: 0 });
  // The parse schema the real provider sends (Api.parseSchema): the constant itself for Low Water, a copy with the stake in credits under the preview.
  const schema = await page.evaluate(() => {
    const A = Game.Api;
    const own = A.parseSchema();
    const out = { own: own.properties.summary.description, copy: own !== A.SCHEMAS.parse_action, kept: A.SCHEMAS.parse_action.properties.summary.description };
    Game.Pack.setPreview(null);
    out.built = A.parseSchema() === A.SCHEMAS.parse_action;
    return out;
  });
  assert.match(schema.own, /\("bets 20 cr at cards"\)$/);
  assert.ok(schema.copy);
  assert.match(schema.kept, /\("bets \$20 at cards"\)$/, 'the constant is never written');
  assert.ok(schema.built);
});

/* The proper-noun sweep: index.html's text outside the JSON element and
   comments, line by line, against the built-in story's names. Each hit
   that stays is in one of these places, for the reason given. */
const NOUNS = /Chief Bell|Mavis|Jodie|Low Water|Clayburn|Lockett|Royce|Curtis|Dewayne|Carter|Pittman/;
const KEPT = [
  ['the page head\'s home-screen name, the app\'s own name and not the story\'s text', (mod, code) => mod === null && /apple-mobile-web-app-title/.test(code)],
  ['a list of common first names (the pronoun tables, Style\'s GIVEN_NAMES)', (mod, code) => /^(she|he): \['[A-Z]/.test(code) || /^'(?:[A-Z][a-z]+ )+[A-Z][a-z]+ ?' \+$/.test(code)],
  ['PackRules: the lockett-house set and the mentions check\'s allow-lists, Low Water\'s own house rules', mod => mod === 'PackRules'],
  ['Api\'s example sentences: they show the form of a line, not the story (plan decision F)', (mod, code, at) => mod === 'Api' && !at.mock && /^(const (MEMORY_RULES|RECORD_RULES|EVENT_RULES|MEMORY_WORDS) ?=|parser: "|people: "|name: \{ type: 'string', description:|role: \{ type: 'string', description:)/.test(code)],
  ['Api\'s Mock region (task M9-B\'s)', (mod, code, at) => mod === 'Api' && at.mock],
  ['Upgrade\'s legacy block, read only for a game of the built-in story', mod => mod === 'Upgrade'],
  ['the editor\'s placeholders (the Creator module)', (mod, code) => mod === 'Creator' && /placeholder: '/.test(code)]
];
s.test('index.html outside the JSON element and comments names Low Water\'s people and places only where it keeps them on purpose: the page head\'s name, the first-name lists, PackRules\' house set, Api\'s example sentences and Mock region, Upgrade\'s legacy block and the editor\'s placeholders; none in Dice, Rel, Town, World, Pipeline, State, UI or Pack', async () => {
  const lines = fs.readFileSync(path.join(ROOT, 'town.html'), 'utf8').split('\n');
  let inJson = false, inBlock = false, inHtml = false, mod = null, mock = false;
  const hits = [];
  lines.forEach((l, i) => {
    const marker = /^\/\/ ===== Module: (\w+) =====/.exec(l);
    if (marker) mod = marker[1];
    if (/^\s*\/\/ ----- mock provider -----/.test(l)) mock = true;
    if (/^\s*\/\/ ----- real provider -----/.test(l)) mock = false;
    if (/<script type="application\/json" id="pack-low-water">/.test(l)) { inJson = true; return; }
    if (inJson) { if (/<\/script>/.test(l)) inJson = false; return; }
    let code = '';
    for (let j = 0; j < l.length;) {
      if (inBlock) { const e = l.indexOf('*/', j); if (e < 0) break; inBlock = false; j = e + 2; continue; }
      if (inHtml) { const e = l.indexOf('-->', j); if (e < 0) break; inHtml = false; j = e + 3; continue; }
      const rest = l.slice(j);
      if (rest.startsWith('/*')) { inBlock = true; j += 2; continue; }
      if (rest.startsWith('<!--')) { inHtml = true; j += 4; continue; }
      if (/^\/\/\s/.test(rest) && (j === 0 || /\s/.test(l[j - 1]))) break;
      code += l[j]; j++;
    }
    code = code.trim();
    if (NOUNS.test(code)) hits.push({ line: i + 1, mod, code, mock });
  });
  const unexplained = hits.filter(x => !KEPT.some(([, ok]) => ok(x.mod, x.code, x)));
  assert.deepEqual(unexplained.map(x => `${x.line} (${x.mod}): ${x.code.slice(0, 100)}`), []);
  const engine = ['Pack', 'Dice', 'Rel', 'Town', 'World', 'Pipeline', 'State', 'UI'];
  assert.deepEqual(hits.filter(x => engine.includes(x.mod)).map(x => x.line), []);
  assert.ok(hits.some(x => x.mod === 'Api' && !x.mock), 'the sweep sees the example sentences, so it reads the code');
});

s.run();
