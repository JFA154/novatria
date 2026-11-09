'use strict';
/* The town, Low Water, is the built-in Story Pack now (wave 37, Creator
   Mode): packs/low-water.json, inlined in index.html as the one JSON
   element pack-low-water. It is the only town (no placeholder data left),
   it validates in the page, Game.Pack.validate refuses each kind of hand
   edit slip with a rule id and a path, the Node wrapper
   tests/validate-pack.cjs reads the page it is pointed at, and every
   background and loose end starts a playable game. Names and counts come
   from the data, so this suite survives a change of town. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { suite, quickStart, ROOT, GAME_PATH } = require('./helpers.cjs');

const s = suite('content');
const PACK_FILE = path.join(ROOT, 'packs', 'low-water.json');
const OPEN = '<script type="application/json" id="pack-low-water">';

/* The validator runs in the page now (wave 37, Creator Mode; plan decision
   B: the old Node validator and its mentions check are gone, their checks
   are Pack.validate's rules), so a hand-editing slip is shown on an edited
   copy of the built-in pack (Pack.copy: builtIn() is frozen) under the
   strict profile, where Low Water's house rules are errors. `edit` crosses
   into the page as its source text, so it can use only its arguments:
   (p, { W, PL, npc, loc, ni, li, idx, arg }), W and PL the copy's world and
   player, ni/li an id's index in world.npcs/world.locations, idx(list,
   test, what) an index that must exist. It returns the path of the slip
   (or a list of paths), for the asserts. One page per test, on first use. */
const pages = new WeakMap();
async function editedProblems(h, edit, arg) {
  if (!pages.has(h)) pages.set(h, h.open());
  const page = await pages.get(h);
  return page.evaluate(`(() => {
    const p = Game.Pack.copy(Game.Pack.builtIn());
    const W = p.world, PL = p.player;
    const idx = (list, test, what) => { const i = list.findIndex(test); if (i < 0) throw new Error('the edit found no ' + what); return i; };
    const ni = id => idx(W.npcs, n => n.id === id, id);
    const li = id => idx(W.locations, l => l.id === id, id);
    const npc = id => W.npcs[ni(id)];
    const loc = id => W.locations[li(id)];
    const at = (${edit})(p, { W, PL, npc, loc, ni, li, idx, arg: ${JSON.stringify(arg === undefined ? null : arg)} });
    return { at, problems: Game.Pack.validate(p, { profile: 'strict' }) };
  })()`);
}
/* The problem with this rule at this path, with this wording where the old
   test checked it, and an error unless said otherwise; a miss lists
   everything the validator did find. */
function problemAt(r, rule, path, re, severity) {
  const hit = r.problems.find(p => p.rule === rule && p.path === path);
  assert.ok(hit, `expected ${rule} at ${path}; found:\n          ` + r.problems.map(p => `${p.severity} [${p.rule}] ${p.path}: ${p.message}`).join('\n          '));
  if (re) assert.match(hit.message, re);
  assert.equal(hit.severity, severity || 'error', rule + ' at ' + path);
  return hit;
}

s.test('the inlined town is the only town: index.html holds exactly one JSON pack element, its JSON deep-equals packs/low-water.json and node tests/pack-inline.cjs --check passes; no placeholder data and no content/ or content-modern/ staging folder', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  // Wave 37, Creator Mode (plan decision A): the town is one inert JSON element, a copy of packs/low-water.json, where the content block of constants was.
  assert.equal(html.split('<script type="application/json"').length - 1, 1, 'exactly one JSON element');
  assert.equal(html.split(OPEN).length - 1, 1, 'and it is pack-low-water');
  const start = html.indexOf(OPEN) + OPEN.length;
  assert.deepEqual(JSON.parse(html.slice(start, html.indexOf('</script>', start))), pack, 'the element is packs/low-water.json');
  const inline = spawnSync(process.execPath, [path.join(__dirname, 'pack-inline.cjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(inline.status, 0, inline.stdout + inline.stderr);
  for (const gone of ['Tallow Ford', 'Hobb Tanner', 'Jory Pike', 'placeholder data']) assert.ok(!html.includes(gone), 'leftover: ' + gone);
  // As a whole word: wave 37's PackRules names its {npc}-token pattern PLACEHOLDER_RE, which is code, not placeholder data.
  assert.doesNotMatch(html, /\bPLACEHOLDER\b/, 'leftover: PLACEHOLDER');
  for (const dir of ['content', 'content-modern']) assert.ok(!fs.existsSync(path.join(ROOT, dir)), dir + '/ was removed after inlining');
  const page = await h.open();
  const info = await page.evaluate(() => {
    const T = Game.data.TOWN_DATA;
    const by = p => T.npcs.filter(n => (n.presence || 'here') === p).length;
    return {
      name: T.name, errors: Game.Town.validate(T), title: document.getElementById('title-name').textContent, doc: document.title,
      npcs: by('here'), away: by('away'), dead: by('dead'), all: T.npcs.length,
      locs: T.locations.filter(l => l.discovered !== false && !l.away).length, homes: T.locations.filter(l => l.discovered === false && !l.away).length, out: T.locations.filter(l => l.away).length
    };
  });
  assert.equal(info.name, pack.world.name, 'the town in the pack is the town in the page');
  assert.deepEqual(info.errors, []);
  assert.equal(info.title, info.name, 'title screen');
  assert.equal(info.doc, info.name, 'document title');
  assert.ok(info.npcs >= 40 && info.npcs <= 45, 'the full cast in town, 40 to 45 people: ' + info.npcs);
  // Everyone the story names is a record too (direction change 9): the dead and the people who live elsewhere.
  assert.ok(info.away >= 1 && info.dead >= 1 && info.all === info.npcs + info.away + info.dead && info.all <= 90, `people by presence: ${info.npcs} here, ${info.away} away, ${info.dead} dead`);
  assert.ok(info.locs >= 8 && info.locs <= 16, 'town places: ' + info.locs);
  assert.ok(info.homes >= 1 && info.homes <= 12, 'homes to find: ' + info.homes);
  assert.ok(info.out >= 1, 'places out of town: ' + info.out);
});

s.test('validate-pack.cjs prints the OK line for index.html (38 locations, 66 npcs) and, pointed by VALIDATE_FILE at an edited copy with one exit misspelt, exits 1 naming the path', async h => {
  const page = await h.open();
  const t = await page.evaluate(() => ({ name: Game.data.TOWN_DATA.name, locs: Game.data.TOWN_DATA.locations.length, npcs: Game.data.TOWN_DATA.npcs.length }));
  const ok = spawnSync(process.execPath, [path.join(__dirname, 'validate-pack.cjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.startsWith(`OK ${t.name}: ${t.locs} locations, ${t.npcs} npcs`), ok.stdout);
  // The counts the old Node validator printed for this town.
  assert.match(ok.stdout, /: 38 locations, 66 npcs \(41 here, 17 away, 8 dead;/);
  /* The one test that still edits a copy of the page (wave 37, Creator
     Mode): every other slip is shown in the page on a copy of the pack;
     this proves the wrapper validates the file VALIDATE_FILE names, not
     index.html. Two letters of the first exit of the first place with exits
     swap places, inside the inlined JSON. */
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const pack = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  const i = pack.world.locations.findIndex(l => Array.isArray(l.exits) && l.exits.length);
  const loc = pack.world.locations[i];
  const exit = loc.exits[0];
  const typo = exit.slice(0, -2) + exit.slice(-1) + exit.slice(-2, -1);
  assert.ok(!pack.world.locations.some(l => l.id === typo), 'the typo is no place');
  const from = html.indexOf(`"id": "${loc.id}"`, html.indexOf(OPEN));
  assert.ok(from > 0, 'found ' + loc.id + ' in the JSON element');
  const cut = html.indexOf(`"${exit}"`, html.indexOf('"exits"', from));
  const broken = html.slice(0, cut) + `"${typo}"` + html.slice(cut + exit.length + 2);
  assert.notEqual(broken, html, 'the edit applied');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-')), 'index.html');
  fs.writeFileSync(tmp, broken);
  try {
    const bad = spawnSync(process.execPath, [path.join(__dirname, 'validate-pack.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.ok(bad.stderr.includes(`  - world.locations[${i}].exits[0]: exit "${typo}" is not a location [engine.location.exit]`), bad.stderr);
  } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
});

s.test('the cast: everyone written by hand with a home, relations both ways and a place every phase; docs/CAST.md matches it; a new game has them all, castFixed, and nobody is ever made', async h => {
  // The roster is generated from the data and kept in sync.
  const doc = spawnSync(process.execPath, [path.join(__dirname, 'cast-doc.cjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(doc.status, 0, doc.stderr);
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'CAST.md'), 'utf8');
  const page = await h.open();
  const T = await page.evaluate(() => Game.data.TOWN_DATA);
  // Everyone with their age and pronouns, the way the narrator gets them ("**Mavis Mangum** (41, she/her)"), and every place with its history.
  for (const n of T.npcs) assert.ok(md.includes(`**${n.name}** (${n.age}, `) && md.includes('`' + n.id + '`'), 'CAST.md lists ' + n.id);
  for (const l of T.locations) assert.ok(md.includes(`**${l.name}** (${l.type}; `) && md.includes(l.history) && md.includes('`' + l.id + '`'), 'CAST.md lists the place ' + l.id);
  assert.equal((md.match(/^- \*\*/gm) || []).length, T.npcs.length + T.locations.length + (T.offstage || []).length + Object.keys(await page.evaluate(() => Game.data.LOOSE_ENDS)).length, 'one line per person, place, offstage name and loose end');
  for (const l of T.locations.filter(x => T.npcs.some(n => (n.presence || 'here') === 'here' && n.home === x.id))) assert.ok(md.includes(`## ${l.name}`), 'a section per home: ' + l.id);
  for (const h of ['## Elsewhere', '## Gone', '## The town', '## Places']) assert.ok(md.includes(h), h);
  // In a new game: the whole cast, every one somewhere in every phase, castFixed.
  await quickStart(page, { kinds: ['debt', 'enemy', 'lost'] });
  const r = await page.evaluate(() => {
    const G = Game;
    const st = G.state;
    const nowhere = [];
    const inTown = st.npcs.filter(n => Game.presenceOf(n) === 'here');
    // The people in town are somewhere every phase; the dead and the far away are nowhere, ever.
    const absentSeen = [];
    // (Except someone away on today's weekday in that phase: the teacher and the students on a school day, once State.weekday exists.)
    const weekday = typeof G.State.weekday === 'function' ? G.State.weekday() : null;
    const awayNow = (n, ph) => !!(weekday && n.awayOn && (n.awayOn.days || []).includes(weekday) && (n.awayOn.phases || []).includes(ph));
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      for (const n of inTown) if (!awayNow(n, ph) && !st.locations.some(l => G.State.npcsAt(l.id, ph).some(x => x.id === n.id))) nowhere.push(`${n.id} ${ph}`);
      for (const n of st.npcs.filter(x => !inTown.includes(x))) if (st.locations.some(l => G.State.npcsAt(l.id, ph).some(x => x.id === n.id))) absentSeen.push(`${n.id} ${ph}`);
    }
    const asym = [];
    for (const n of st.npcs) for (const t of n.relations || []) if (!(G.State.npc(t.npcId).relations || []).some(x => x.npcId === n.id)) asym.push(`${n.id} -> ${t.npcId}`);
    return {
      fixed: st.meta.castFixed, npcs: st.npcs.length, ids: st.npcs.map(n => n.id), nowhere, asym, absentSeen,
      homes: inTown.filter(n => !n.home || !G.State.loc(n.home.locationId) || !n.home.phases.length).map(n => n.id),
      ages: st.npcs.filter(n => !Number.isInteger(n.age)).map(n => n.id), histories: st.npcs.filter(n => typeof n.history !== 'string' || !n.history).map(n => n.id),
      awayPlaces: st.locations.filter(l => l.away).map(l => ({ id: l.id, exits: l.exits.length, discovered: l.discovered, people: ['morning', 'afternoon', 'evening', 'night'].some(p => l.npcIdsBySchedule[p].length) })),
      undiscovered: st.locations.filter(l => !l.discovered).map(l => l.id), made: st.npcs.filter(n => n.created).map(n => n.id),
      tied: st.player.looseEnds.map(le => le.npcId)
    };
  });
  assert.equal(r.fixed, true, 'a new game has meta.castFixed');
  assert.deepEqual(r.ids, T.npcs.map(n => n.id), 'exactly the cast, in order');
  assert.deepEqual(r.nowhere, [], 'World.whereIs always answers: everyone in town is somewhere in every phase');
  assert.deepEqual(r.absentSeen, [], 'the dead and the people who live elsewhere are never anywhere in town');
  assert.deepEqual([r.ages, r.histories], [[], []], 'everyone has an age and a history');
  assert.ok(r.awayPlaces.length && r.awayPlaces.every(l => l.exits === 0 && l.discovered === false && !l.people), 'places out of town: no roads, not on the map, nobody there');
  assert.deepEqual(r.asym, [], 'relations are written on both sides');
  assert.deepEqual(r.homes, [], 'everyone in town has a home they are at in some phase');
  assert.deepEqual(r.undiscovered, T.locations.filter(l => l.discovered === false).map(l => l.id), 'the homes start undiscovered');
  assert.deepEqual(r.made, [], 'nobody was made, the loose ends included');
  assert.ok(r.tied.every(id => T.npcs.some(n => n.id === id)), 'every loose end is someone in the cast');
});

s.test('everything mentioned exists: Pack.validate finds no engine.mention problem in the built-in pack and refuses a name or a place added by hand (engine.mention.name, engine.mention.place); ages agree with looks and the family maths (house.npc.age, house.family); the dead are never scheduled (engine.npc.schedule)', async h => {
  // The old Node mentions check is Pack's engine.mention.* rules now (wave 37, Creator Mode), so the editor checks it live.
  const page = await h.open();
  const clean = await page.evaluate(() => Game.Pack.validate(Game.Pack.builtIn(), { profile: 'strict' }).filter(p => /^engine\.mention\./.test(p.rule)));
  assert.deepEqual(clean, [], 'nobody and nowhere named without a record');
  let r = await editedProblems(h, (p, { W }) => { W.seeds[0].effect = W.seeds[0].effect.replace(/\.$/, ', and Zebediah is waiting.'); return 'world.seeds[0].effect'; });
  problemAt(r, 'engine.mention.name', r.at, /the name "Zebediah" matches no person, place or faction/);
  // A new name in a description, and a new kind of place: both refused until there is a record.
  r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.locations, l => !l.away, 'a place in town');
    W.locations[i].description = W.locations[i].description.replace(/\.$/, ', where Hank Pruitt waits by the cotton gin.');
    return 'world.locations[' + i + '].description';
  });
  problemAt(r, 'engine.mention.name', r.at, /the name "Hank" matches no person, place or faction/);
  r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.locations, l => !l.away, 'a place in town');
    W.locations[i].description = W.locations[i].description.replace(/\.$/, ', two doors down from the old cotton gin.');
    return 'world.locations[' + i + '].description';
  });
  problemAt(r, 'engine.mention.place', r.at, /the place "the old cotton gin" matches no place/);
  // An age the look disagrees with, and a mother younger than her daughter allows.
  r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.npcs, n => (n.relations || []).some(x => x.relation === 'daughter') && /\b(?:woman|man) of (?:twenty|thirty|forty|fifty|sixty|seventy|eighty)/.test(n.look), 'a mother whose look gives her age');
    W.npcs[i].age += 30;
    return { path: 'world.npcs[' + i + '].age', id: W.npcs[i].id, age: W.npcs[i].age - 30 };
  });
  problemAt(r, 'house.npc.age', r.at.path, new RegExp('^is ' + (r.at.age + 30) + ', but the look says ' + r.at.age + '$'));
  r = await editedProblems(h, (p, { W, idx, ni }) => {
    const i = idx(W.npcs, n => (n.relations || []).some(x => x.relation === 'daughter') && /\b(?:woman|man) of (?:twenty|thirty|forty|fifty|sixty|seventy|eighty)/.test(n.look), 'a mother whose look gives her age');
    const k = W.npcs[i].relations.findIndex(x => x.relation === 'daughter');
    W.npcs[ni(W.npcs[i].relations[k].npcId)].age += 25;
    return 'world.npcs[' + i + '].relations[' + k + ']';
  });
  problemAt(r, 'house.family', r.at, /a parent is 16 to 60 years older/);
  // A dead person in a schedule is refused (the dead are never anywhere).
  r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.npcs, n => n.presence === 'dead', 'someone dead');
    W.locations[idx(W.locations, l => l.npcIdsBySchedule && Array.isArray(l.npcIdsBySchedule.morning), 'a schedule')].npcIdsBySchedule.morning.unshift(W.npcs[i].id);
    return 'world.npcs[' + i + ']';
  });
  problemAt(r, 'engine.npc.schedule', r.at, /is dead but scheduled in town \(morning\)/);
});

s.test('every background starts at its arrival point and every loose end resolves, then a turn runs', async h => {
  const page = await h.open();
  const bgs = await page.evaluate(() => Game.data.BACKGROUNDS.map(b => b.id));
  assert.equal(bgs.length, 6);
  const kinds = ['debt', 'enemy', 'secret', 'lost', 'promise'];
  for (let i = 0; i < bgs.length; i++) {
    const pick = [kinds[i % 5], kinds[(i + 1) % 5], kinds[(i + 2) % 5]];
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { bgIndex: i, kinds: pick, seed: 1000 + i });
    const r = await page.evaluate(async () => {
      const G = Game;
      const st = G.state;
      const bg = G.data.BACKGROUNDS.find(b => b.id === st.player.backgroundId);
      const res = await G.Pipeline.submit('I look around');
      return { loc: st.player.locationId, want: G.town.startLocationIds[bg.arrival], le: G.state.player.looseEnds.length, opening: G.state.log[0].narration, ok: res.ok, json: G.Storage.exportJson().length, log: G.state.log.length };
    });
    assert.equal(r.loc, r.want, bgs[i]);
    assert.equal(r.le, 3);
    assert.ok(r.opening.length > 40);
    assert.ok(r.ok);
    assert.equal(r.log, 2);
    assert.ok(r.json > 1000);
  }
});

/* ---------------------------------------------------------------------------
   The content pass of the review (docs/notes/content.md): the calendar, the
   facts that disagreed, nobody who does not exist, loose ends that bind and
   bite, backgrounds with a phone and a lead, grudges and favours that do
   something, staggered clocks that hold in either order, the council
   meeting, the epilogue, rumours that spread, goods that say what they are.
   Most of it is read straight from packs/low-water.json (as cast-doc.cjs
   does); Pack.validate is shown, on an edited copy in the page, to refuse
   each kind of slip.
   ------------------------------------------------------------------------- */
/* The eight names the content block declared, from the pack (wave 37,
   Creator Mode: the town is packs/low-water.json now; Game.data keeps the
   same names as aliases into it). */
function content() {
  const P = JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));
  return {
    TOWN_DATA: P.world, TABLES: P.world.tables, BACKGROUNDS: P.player.backgrounds, FLAWS: P.player.flaws, LOOSE_ENDS: P.player.looseEnds,
    GRUDGE_TEMPLATES: P.world.grudgeTemplates, FAVOUR_TEMPLATES: P.world.favourTemplates, GOAL_PRESETS: P.player.goalPresets
  };
}
const npcOf = (D, id) => D.TOWN_DATA.npcs.find(n => n.id === id);
const locOf = (D, id) => D.TOWN_DATA.locations.find(l => l.id === id);

s.test('the calendar: day 1 is Thursday 8 October 2026 in autumn; the bar and the pawn shop shut on Sundays; the teacher and the students are at school on weekdays; the vote is set for this October', async h => {
  const D = content();
  const T = D.TOWN_DATA;
  assert.deepEqual(T.calendar, { season: 'autumn', startDate: '2026-10-08' });
  assert.equal(new Date(Date.UTC(2026, 9, 8)).getUTCDay(), 4, 'a Thursday');
  assert.deepEqual(locOf(D, 'loc_low_water').closedOn, ['Sunday']);
  assert.deepEqual(locOf(D, 'loc_byrds_pawn').closedOn, ['Sunday']);
  for (const id of ['npc_annette', 'npc_kaylee', 'npc_austin', 'npc_micah']) {
    const a = npcOf(D, id).awayOn;
    assert.deepEqual(a, { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], phases: ['morning', 'afternoon'], where: 'at the county school in Clayburn' }, id);
  }
  const sept = T.recent.find(r => r.when === 'September 2026');
  assert.match(sept.what, /Tuesday, October 13/, 'the vote is this October, not "this month" of a September present');
  assert.match(npcOf(D, 'npc_curtis').secret, /in October/, 'Royce lost the money in October, which is now');
  // The validator: a day that is no weekday, hours that name a shut day with no closedOn, a student with no school days.
  let r = await editedProblems(h, (p, { W, idx }) => { const i = idx(W.locations, l => l.hours === '9 to 6, Monday to Saturday', 'the shop open 9 to 6'); W.locations[i].closedOn = ['Sundays']; return 'world.locations[' + i + '].closedOn[0]'; });
  problemAt(r, 'engine.shape.enum', r.at, /^"Sundays" is not one of: Sunday, Monday/);
  r = await editedProblems(h, (p, { W, li }) => { const i = li('loc_low_water'); delete W.locations[i].closedOn; return 'world.locations[' + i + '].closedOn'; });
  problemAt(r, 'house.location.text', r.at, /^the hours name days it is shut/);
  r = await editedProblems(h, (p, { W, ni }) => { const i = ni('npc_austin'); delete W.npcs[i].awayOn; return 'world.npcs[' + i + '].awayOn'; });
  problemAt(r, 'house.npc.school', r.at, /a teacher or a student is at school on weekdays/);
});

s.test('schedules: every public place has someone at some time of day, each where their own story puts them; Nikki runs the river road in the morning, Odessa answers Vada\'s door in the evening', async h => {
  const D = content();
  const at = (locId, ph) => locOf(D, locId).npcIdsBySchedule[ph];
  assert.ok(at('loc_water_tower', 'night').includes('npc_kaylee'), 'Kaylee drives up to the water tower at night');
  assert.match(npcOf(D, 'npc_kaylee').secret, /water tower at night/);
  assert.ok(at('loc_river_road', 'morning').includes('npc_nikki'), 'Nikki runs the river road every morning');
  assert.match(npcOf(D, 'npc_nikki').history, /river road every morning/);
  assert.ok(at('loc_front_street', 'morning').includes('npc_elbert'), 'Elbert on the Front Street bench');
  assert.ok(at('loc_cemetery', 'morning').includes('npc_tammy'), 'Tammy at Amber\'s grave');
  assert.ok(at('loc_bluff', 'evening').includes('npc_travis'), 'Travis runs radar at the bluff');
  assert.ok(at('loc_sturdivant_house', 'evening').includes('npc_odessa') && at('loc_sturdivant_house', 'evening').includes('npc_vada'), 'Odessa is home when Miss Vada receives');
  assert.ok(at('loc_pittmans', 'morning').includes('npc_lamar'), 'Lamar drinks his coffee by the window at Pittman\'s');
  assert.match(locOf(D, 'loc_pittmans').details, /Lamar Haskins drinks his coffee by the window/);
  for (const l of D.TOWN_DATA.locations.filter(x => x.discovered !== false && !x.away)) {
    assert.ok(['morning', 'afternoon', 'evening', 'night'].some(p => l.npcIdsBySchedule[p].length), 'somebody is at ' + l.id + ' some time');
  }
  // Wave 37, Creator Mode: a house rule of the lockett-house set, an error under strict as the old validator's was (CI keeps that strength); another pack gets a warning.
  const r = await editedProblems(h, (p, { W, li, idx }) => {
    const tower = W.locations[li('loc_water_tower')];
    tower.npcIdsBySchedule.night = tower.npcIdsBySchedule.night.filter(id => id !== 'npc_kaylee');
    W.locations[idx(W.locations, l => JSON.stringify(l.npcIdsBySchedule && l.npcIdsBySchedule.night) === '["npc_royce","npc_darlene"]', 'Royce and Darlene at night')].npcIdsBySchedule.night.push('npc_kaylee');
    return 'world.locations[' + li('loc_water_tower') + '].npcIdsBySchedule';
  });
  problemAt(r, 'house.place.empty', r.at, /^a public place nobody is ever at/, 'error');
});

s.test('the facts agree: Wiley three springs ago, Travis paying down his boat, Dwight\'s stakes, the engineer the state sent, four overdoses and one death, the mayor in the holding cell, prices, the river road, Amos\'s whiskey, the bridge Annette crossed, Boyd\'s check-in, Loretta\'s bypass fight, a five-seat council', async () => {
  const D = content();
  const T = D.TOWN_DATA;
  const n = id => npcOf(D, id);
  assert.match(n('npc_wiley').history, /three springs ago/);
  assert.match(n('npc_ruth').history, /three winters ago/);
  const boat = T.rumours.find(r => r.id === 'rum_travis_boat').text;
  assert.match(boat, /pays the note down/);
  assert.match(n('npc_travis').goal, /until his boat is paid off/);
  assert.match(n('npc_dwight').secret, /off the Haskins forty and onto the Sturdivant bottomland/);
  assert.match(n('npc_virgil').secret, /Warren Pettit, the engineer the state sent/);
  const pills = T.threads.find(t => t.id === 'thr_riverbend_pills').summary;
  assert.match(pills, /died of an overdose at Riverbend in August, and four more people/);
  assert.match(n('npc_june').secret, /reversed four overdoses/);
  const police = T.factions.find(f => f.id === 'fac_police');
  assert.match(police.clocks[2].onComplete.text, /walks Jolene Overstreet down to the holding cell/);
  // Prices: the goods list says what the places' details say.
  const goods = Object.fromEntries(D.TABLES.items.goods.map(g => [g.name, g.price]));
  assert.equal(goods['Bottle of beer'], 3);
  assert.equal(goods['Catfish basket'], 9);
  assert.match(locOf(D, 'loc_low_water').details, /A beer is three dollars, a catfish basket nine/);
  assert.equal(goods['Night at the motel'], 49);
  assert.match(locOf(D, 'loc_motor_court').details, /forty-nine dollars a night/);
  assert.equal(goods['Tube of crickets'], 3);
  assert.equal(goods['Cup of coffee'], 2);
  // The river road goes upriver only; nothing says it runs to Riverbend or the ramp it has no road to.
  const road = locOf(D, 'loc_river_road');
  assert.deepEqual(road.exits.slice().sort(), ['loc_mangum_house', 'loc_pittmans']);
  assert.doesNotMatch(road.history + road.description, /Riverbend|Purvis Landing|ramp/);
  assert.doesNotMatch(locOf(D, 'loc_purvis_landing').description, /river road/);
  // Amos ran whiskey long enough for Elbert, born 1938, to row it as a boy.
  assert.match(n('npc_amos').secret, /into the 1950s, the last years with Elbert Gentry rowing it/);
  assert.equal(2026 - n('npc_elbert').age, 1938);
  // The school bus goes north to Clayburn and never crosses the bridge.
  assert.doesNotMatch(n('npc_annette').secret, /bus/);
  assert.match(n('npc_teresa').secret, /missed his check-in last week/);
  assert.match(n('npc_boyd').history, /a week ago/);
  // Loretta was home to lead the bypass fight before she bought the bar.
  assert.match(n('npc_loretta').history, /came home in 1991\. She and Clyde Pittman led the losing side of the bypass fight/);
  // Three to two needs five seats: the mayor, Royce, Lamar, and the two who vote no, Hollis and Elbert.
  const council = T.npcs.filter(x => (x.tags || []).includes('council')).map(x => x.id).sort();
  assert.deepEqual(council, ['npc_elbert', 'npc_hollis', 'npc_jolene', 'npc_lamar', 'npc_royce']);
  assert.match(n('npc_hollis').role, /town council/);
  assert.match(n('npc_elbert').role, /town council/);
  assert.match(n('npc_hollis').history, /sat on the town council since 2002/);
  assert.match(n('npc_elbert').history, /sat on the town council since 1983/);
});

s.test('nobody who does not exist: Tyler lives with Brianna, the overdose is Brianna, places name the cast, Jodie\'s real name and Boyd\'s man are written down, the old bank and the old drugstore are Front Street; the validator refuses a made-up crowd', async h => {
  const D = content();
  const T = D.TOWN_DATA;
  assert.match(npcOf(D, 'npc_tyler').history, /shares a trailer at Riverbend with his cousin Brianna/);
  assert.doesNotMatch(npcOf(D, 'npc_tyler').history, /two other boys/);
  assert.match(T.seeds.find(x => x.id === 'seed_overdose').effect, /brought Brianna Tolliver back/);
  assert.match(npcOf(D, 'npc_brianna').secret, /owes Colt Purvis forty dollars/);
  for (const [id, re] of [['loc_pittmans', /Lamar Haskins/], ['loc_motor_court', /Lyman Coker, Leon Varner and Curtis Pruett/], ['loc_purvis_landing', /Burl Satterfield/], ['loc_bluff', /Travis Cagle/], ['loc_water_tower', /Kaylee Pittman/], ['loc_front_street', /Elbert Gentry and Burl Satterfield/]]) assert.match(locOf(D, id).details, re, id);
  assert.match(npcOf(D, 'npc_jodie').secret, /Her real name is Jodie Ogletree/);
  assert.match(npcOf(D, 'npc_bernice').secret, /her daughter Jodie/);
  assert.match(npcOf(D, 'npc_boyd').secret, /he came for Wade Purvis/);
  assert.match(npcOf(D, 'npc_wade').secret, /beat Calvin Ogletree half to death/);
  assert.match(npcOf(D, 'npc_lorna').secret, /^Calvin Ogletree, the man Wade beat/);
  assert.ok(['the old bank', 'the old drugstore'].every(a => locOf(D, 'loc_front_street').aka.includes(a)));
  assert.deepEqual(npcOf(D, 'npc_jodie').relations, [{ npcId: 'npc_loretta', relation: 'boss' }], 'her family stays a secret: no tie on her card');
  // No unnamed crowd in the templates, the loose ends or the seeds.
  const text = JSON.stringify([D.GRUDGE_TEMPLATES, D.FAVOUR_TEMPLATES, D.LOOSE_ENDS, T.seeds]);
  for (const bad of ['a couple of kids', 'two men', 'the night clerk', 'a boy at Riverbend', 'a trucker', 'slides into the booth', 'a doctor in the city']) assert.ok(!text.includes(bad), 'gone: ' + bad);
  const r = await editedProblems(h, (p, { W, ni }) => {
    const n = W.npcs[ni('npc_tyler')];
    const was = n.history;
    n.history = was.replace('He shares a trailer at Riverbend with his cousin Brianna,', 'He rents a trailer at Riverbend with two other boys and his cousin Brianna,');
    if (n.history === was) throw new Error('the edit did not apply');
    return 'world.npcs[' + ni('npc_tyler') + '].history';
  });
  problemAt(r, 'engine.mention.person', r.at, /^"two other boys" puts someone in the story who is not in the cast/);
});

s.test('loose ends: every preset option binds to the person it means (the waitress for the letter and the daughter, Lorna for the towboat friend, Nadine for the group home, Colt for the man in the pen), the enemy is already here, and the debt, the blackmail and the promise name what is owed and when', async h => {
  const D = content();
  const L = D.LOOSE_ENDS;
  assert.deepEqual(L.debt.link.optionTags, ['lender', 'collector', 'bookie']);
  assert.deepEqual(L.lost.link.optionTags, ['bereaved', 'secretary', 'witness']);
  assert.deepEqual(L.promise.link.optionTags, ['runaway', 'dealer', 'runaway']);
  assert.ok(L.enemy.options.every(o => /already here/.test(o)), 'the enemy was here before the player');
  for (const k of Object.keys(L)) assert.doesNotMatch(L[k].seed.effect, /booth|night clerk|trucker|Low Water/, k + ': no setting assumed; the person comes to the player');
  // Who carries each option's tag: the cast member the option means.
  const carriers = tag => D.TOWN_DATA.npcs.filter(n => (n.presence || 'here') === 'here' && n.tags.includes(tag)).map(n => n.id);
  assert.deepEqual(carriers('runaway'), ['npc_jodie']);
  assert.deepEqual(carriers('witness'), ['npc_lorna']);
  assert.deepEqual(carriers('secretary'), ['npc_nadine']);
  assert.deepEqual(carriers('dealer'), ['npc_colt']);
  assert.deepEqual(carriers('bookie'), ['npc_curtis']);
  assert.deepEqual(carriers('enemy').sort(), ['npc_boyd', 'npc_leon']);
  // Obligations: the bet is $400, scaled per option, due three days on; a missed debt costs something.
  assert.deepEqual(L.debt.obligations.map(o => [o.kind, o.amount, o.dueOffset]), [['debt', 600, 3], ['debt', 300, 3], ['debt', 400, 3]]);
  assert.ok(L.debt.obligations.every(o => o.onMiss.some(e => ['takeItem', 'playerGold', 'banFrom'].includes(e.op))));
  assert.deepEqual([L.secret.obligation.kind, L.secret.obligation.amount, L.secret.obligation.dueOffset], ['blackmail', 200, 2]);
  assert.match(L.secret.seed.effect, /two hundred dollars, by the day after tomorrow/);
  const errand = L.promise.obligations[0];
  assert.equal(errand.kind, 'errand');
  assert.equal(errand.itemName, 'Letter for {npc}');
  assert.deepEqual(errand.onStart.map(e => [e.op, e.name]), [['giveItem', 'Letter for {npc}']]);
  // In a game: each option, alone, binds to someone with its tag, never someone made.
  const page = await h.open();
  for (const kind of Object.keys(L)) {
    for (let i = 0; i < L[kind].options.length; i++) {
      await page.evaluate(() => Game.State.clear());
      await page.evaluate(([kind, text, i]) => {
        const B = Game.data.BACKGROUNDS[0];
        Game.App.quickStart({ name: 'Tester', backgroundId: B.id, stats: Object.assign({}, B.stats), goal: 'g', flaw: Game.data.FLAWS[0], looseEnds: [{ kind, text }] }, { seed: 500 + i });
      }, [kind, L[kind].options[i], i]);
      await page.waitForSelector('#screen-game.active');
      const got = await page.evaluate(() => { const le = Game.state.player.looseEnds[0]; const n = Game.State.npc(le.npcId); return { id: n.id, tags: n.tags, made: !!n.created }; });
      const tag = (L[kind].link.optionTags || [])[i] || L[kind].link.tag;
      assert.ok(got.tags.includes(tag) && !got.made, `${kind}[${i}] binds by "${tag}": ${got.id}`);
    }
  }
});

s.test('backgrounds: everyone arrives with a prepaid phone and a first lead from someone in the cast; the town answers the marked deck, the cartons and the blank birth certificate', async h => {
  const D = content();
  const hooks = { bg_veteran: 'npc_marcus', bg_dropout: 'npc_dewayne', bg_fired_bookkeeper: 'npc_hollis', bg_river_deckhand: 'npc_wade', bg_group_home_kid: 'npc_nadine', bg_poker_hustler: 'npc_curtis' };
  for (const b of D.BACKGROUNDS) {
    assert.equal(b.items.length, 3, b.id);
    assert.ok(b.items.some(i => i.name === 'Prepaid phone'), b.id + ' carries a phone');
    assert.equal(b.hook.npcId, hooks[b.id], b.id);
    assert.deepEqual(b.hook.trigger, { type: 'npc', value: hooks[b.id] });
    assert.ok([0, 1].includes(b.hook.dayOffset));
    assert.ok(b.hook.text.includes('{player}'));
  }
  const rum = id => D.TOWN_DATA.rumours.find(r => r.id === id).text;
  assert.match(rum('rum_curtis_deck'), /marked deck/);
  assert.match(rum('rum_wade_cartons'), /buys cartons for cash at the landing/);
  assert.match(rum('rum_nadine_books'), /church record as proof of birth/);
  const page = await h.open();
  for (let i = 0; i < D.BACKGROUNDS.length; i++) {
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { bgIndex: i, kinds: [] });
    const inv = await page.evaluate(() => Game.state.player.inventory.map(x => x.name));
    assert.ok(inv.includes('Prepaid phone'), D.BACKGROUNDS[i].id + ': ' + inv.join(', '));
  }
  const r = await editedProblems(h, (p, { PL, idx }) => {
    const i = idx(PL.backgrounds, b => b.id === 'bg_poker_hustler', 'bg_poker_hustler');
    PL.backgrounds[i].items.splice(idx(PL.backgrounds[i].items, x => x.id === 'item_phone_hustler', 'item_phone_hustler'), 1);
    return 'player.backgrounds[' + i + '].items';
  });
  problemAt(r, 'house.background.items', r.at, /^should be 3 things: two of the background's own and a prepaid phone/);
});

s.test('grudges and favours do something: effects in code, public or not, held only by people who could; nobody old, young or a cop beats anyone; no phone or vehicle assumed', async h => {
  const D = content();
  const all = D.GRUDGE_TEMPLATES.concat(D.FAVOUR_TEMPLATES);
  assert.ok(D.GRUDGE_TEMPLATES.length >= 8 && D.FAVOUR_TEMPLATES.length >= 8);
  for (const t of all) {
    assert.ok(Array.isArray(t.effects) && t.effects.length, t.effect);
    assert.equal(typeof t.public, 'boolean');
    assert.doesNotMatch(t.effect, /a couple of kids|two men|texts \{player\}|whatever \{player\} has been riding/);
  }
  const holders = t => D.TOWN_DATA.npcs.filter(n => (n.presence || 'here') === 'here' && (!t.forTags || t.forTags.some(g => n.tags.includes(g))) && !(t.notForTags || []).some(g => n.tags.includes(g)));
  const beatings = D.GRUDGE_TEMPLATES.filter(t => t.effects.some(e => e.op === 'playerHp' && e.delta < 0));
  assert.ok(beatings.some(t => t.effects.some(e => e.op === 'playerHp' && e.delta === -3) && t.effects.some(e => e.op === 'addCondition' && e.effect === '-1 might' && e.days === 2)), 'a beating: -3 HP and Beaten for two days');
  for (const t of beatings) for (const n of holders(t)) assert.ok(!['elderly', 'teen', 'police'].some(g => n.tags.includes(g)), `${n.id} could hold "${t.effect}"`);
  assert.ok(D.GRUDGE_TEMPLATES.some(t => t.effects.some(e => e.op === 'playerPrice' && e.days === 5)), 'prices up for five days');
  assert.ok(D.GRUDGE_TEMPLATES.some(t => t.effects.some(e => e.op === 'banFrom' && e.locationId === 'loc_low_water' && e.days === 3)), 'barred from the Low Water for three days');
  assert.ok(D.GRUDGE_TEMPLATES.some(t => (t.forTags || []).includes('police') && t.effects.some(e => e.op === 'playerGold')), 'the police use a ticket');
  assert.ok(D.FAVOUR_TEMPLATES.some(t => /a hundred dollars/.test(t.effect) && t.effects.some(e => e.op === 'playerGold' && e.delta === 100)), 'the cash work pays $100 when it fires');
  for (const n of D.TOWN_DATA.npcs.filter(x => (x.presence || 'here') === 'here')) {
    assert.ok(D.GRUDGE_TEMPLATES.some(t => holders(t).includes(n)), n.id + ' has a grudge to hold');
    assert.ok(D.FAVOUR_TEMPLATES.some(t => holders(t).includes(n)), n.id + ' has a favour to give');
  }
  // The validator refuses a beating anyone could hold.
  const r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.grudgeTemplates, t => JSON.stringify(t.forTags) === '["tough"]' && JSON.stringify(t.notForTags) === '["elderly","teen","police"]', 'the beating for the tough');
    delete W.grudgeTemplates[i].forTags;
    W.grudgeTemplates[i].notForTags = ['police'];
    return 'world.grudgeTemplates[' + i + ']';
  });
  problemAt(r, 'house.templates.beating', r.at, /a beating, but .*npc_vada.* could hold it/);
});

s.test('the clocks: staggered, each completion true in either order (requires and alt), rivals set back by clockAdjust, and the main threads reward a stat', async () => {
  const D = content();
  const T = D.TOWN_DATA;
  const fac = id => T.factions.find(f => f.id === id);
  assert.deepEqual(T.factions.map(f => [f.id, f.clocks.map(c => c.segments)]), [['fac_sturdivant', [6, 6, 6]], ['fac_police', [5, 5, 5]], ['fac_nightrun', [8, 8, 8]]]);
  const P = fac('fac_police').clocks;
  const N = fac('fac_nightrun').clocks;
  const S = fac('fac_sturdivant').clocks;
  assert.deepEqual(P[2].onComplete.requires, { npcFree: ['npc_marcus', 'npc_jolene'] });
  assert.match(P[2].onComplete.alt.text, /With Chief Bell gone, Nikki Ballard/);
  assert.deepEqual(N[2].onComplete.requires, { npcFree: ['npc_marcus', 'npc_jolene'] });
  assert.match(N[2].onComplete.text, /the mayor suspends him/);
  assert.match(N[2].onComplete.alt.text, /the council suspends him/);
  assert.deepEqual(S[2].onComplete.requires, { flagsUnset: ['bridgeReportVoid'] });
  assert.match(S[2].onComplete.alt.text, /the state orders a second inspection/);
  assert.ok(S[2].onComplete.alt.effects.some(e => e.op === 'clockAdjust'), 'the second inspection moves a clock');
  assert.ok(P[0].onComplete.effects.some(e => e.op === 'clockAdjust' && e.factionId === 'fac_nightrun' && e.delta === -2), 'catching Colt sets the Night Run back two');
  // The Night Run's photographs and Carter's money race to the council meeting; both hold after it too.
  assert.equal(N[0].label, 'Turn the swing vote');
  // Changed by design in wave 5 (the round-4 playtest): each also needs the other side not to have got to Royce first.
  assert.deepEqual(S[0].onComplete.requires, { flagsUnset: ['councilVoted', 'royceTurned'] });
  assert.deepEqual(N[0].onComplete.requires, { flagsUnset: ['councilVoted', 'royceBought'] });
  // The buy-the-night-shift text holds whether or not the police caught a boat first.
  assert.doesNotMatch(N[1].onComplete.text, /boats cross every night/);
  const od = T.seeds.find(x => x.id === 'seed_overdose');
  assert.deepEqual(od.requires, { npcFree: ['npc_colt', 'npc_brianna'] });
  // Past tense: it holds with Trent in the cell too (the police's alt arrests him).
  assert.match(od.alt.text, /Trent Haskins has been selling Colt's pills for him/);
  const eng = T.seeds.find(x => x.id === 'seed_engineer');
  assert.ok(eng.trigger.type === 'day' && eng.trigger.value <= 5, 'the engineer cancels before Tuesday\'s meeting');
  const box = T.seeds.find(x => x.id === 'seed_tackle_box');
  assert.deepEqual(box.trigger, { type: 'location', value: ['loc_old_bridge', 'loc_purvis_landing'] }, 'found from the landing too, after the bridge closes');
  assert.equal(box.notBeforeDay, 3);
  assert.deepEqual(T.threads.map(t => t.reward), ['charm', 'wits', 'stealth']);
  // Wave 2: the race to Royce is closer. The lease letter (day 3) and the big run (day 4) push the
  // Night Run's photographs on; the engineer's no-show (day 4) sets Carter's money back.
  const seedOf = id => T.seeds.find(x => x.id === id);
  const nudge = (list, fac) => (list || []).filter(e => e.op === 'clockAdjust' && e.factionId === fac).map(e => e.delta);
  assert.deepEqual(nudge(seedOf('seed_lease_letter').effects, 'fac_nightrun'), [1]);
  assert.deepEqual(nudge(seedOf('seed_big_run').effects, 'fac_nightrun'), [1]);
  assert.deepEqual(nudge(seedOf('seed_engineer').effects, 'fac_sturdivant'), [-1]);
  // The police catching a boat (either way) pulls the boats up, and the big run waits on that.
  for (const list of [P[0].onComplete.effects, P[0].onComplete.alt.effects]) assert.ok(list.some(e => e.op === 'setFlag' && e.key === 'boatsPulledUp'), 'boatsPulledUp');
  const run = seedOf('seed_big_run');
  assert.deepEqual(run.requires, { npcFree: ['npc_marcus', 'npc_wade', 'npc_colt'], flagsUnset: ['boatsPulledUp'] });
  assert.match(run.alt.text, /the run has not gone/);
});

s.test('the council meeting on Tuesday (day 6, evening, Town Hall) turns on the clocks, the bought report, Royce\'s regard for the player and Curtis\'s debt, with the police vote as item four; the epilogue comes on day 21 or when the bridge is decided', async h => {
  const D = content();
  const T = D.TOWN_DATA;
  assert.deepEqual(T.events.map(e => e.id), ['evt_council_meeting']);
  const ev = T.events.find(e => e.id === 'evt_council_meeting');
  assert.deepEqual([ev.id, ev.day, ev.phase, ev.locationId], ['evt_council_meeting', 6, 'evening', 'loc_town_hall']);
  const whens = ev.branches.map(b => b.when);
  assert.ok(whens.some(w => (w.flagsSet || []).includes('bridgeReportVoid')), 'the report thrown out');
  // Changed by design in wave 30: the council reads trust and how well Royce knows the player (relAtLeast), not liking alone; no fear branch.
  assert.ok(whens.some(w => w.relAtLeast && w.relAtLeast.npc_royce && w.relAtLeast.npc_royce.trust >= 25 && w.relAtLeast.npc_royce.knows >= 25), 'Royce trusts the player');
  assert.ok(whens.some(w => w.playerAt && w.relAtLeast && w.relAtLeast.npc_royce && w.relAtLeast.npc_royce.liking === 15), 'a friendly face in the room');
  assert.ok(whens.some(w => (w.flagsSet || []).includes('royceBought') && w.relAtLeast && w.relAtLeast.npc_royce && w.relAtLeast.npc_royce.trust === 20), 'bought, with second thoughts');
  assert.ok(!whens.some(w => w.attitudeAtLeast || (w.relAtLeast && Object.values(w.relAtLeast).some(c => c.fear !== undefined))), 'no attitude number and no fear branch');
  assert.ok(whens.some(w => w.obligationStatus && w.obligationStatus.obl_debt_npc_curtis), 'Curtis\'s debt');
  assert.ok(whens.some(w => (w.flagsSet || []).includes('royceBought')) && whens.some(w => (w.flagsSet || []).includes('royceTurned')), 'Carter\'s money and the Night Run\'s photographs');
  assert.ok(whens.some(w => w.clockAtLeast && w.clockAtLeast.fac_sturdivant), 'how close Carter is');
  for (const b of ev.branches.concat([ev.default])) {
    assert.match(b.text, /item four|police|Item four/, 'the police vote is on the same agenda');
    assert.ok(b.effects.some(e => e.op === 'setFlag' && e.key === 'councilVoted'), 'the meeting happened');
    assert.ok(b.effects.some(e => e.op === 'addNews' && e.public === true), 'the town hears');
    assert.ok(b.effects.filter(e => e.op === 'threadUpdate').length === 2, 'both threads move on');
  }
  const E = T.epilogue;
  assert.equal(E.onDay, 21);
  assert.deepEqual(E.orFlagsSet, ['oldBridgeClosed', 'secondInspectionOrdered']);
  // Changed by design in wave 5: up to seven (the open-bridge ending settles the police both ways).
  assert.ok(E.branches.length >= 3 && E.branches.length <= 7);
  // Wave 30: Loretta's ending reads her liking (relAtLeast { liking: 40 }).
  assert.ok(E.branches.some(b => b.when.obligationStatus) && E.branches.some(b => b.when.relAtLeast && b.when.relAtLeast.npc_loretta && b.when.relAtLeast.npc_loretta.liking === 40), 'endings read obligations and attitudes too');
  // The validator refuses a branch that reads a flag nothing sets, and an op the engine does not have.
  let r = await editedProblems(h, (p, { W, idx }) => {
    const e = idx(W.events, x => x.id === 'evt_council_meeting', 'the council meeting');
    const b = idx(W.events[e].branches, x => JSON.stringify(x.when) === '{"flagsSet":["royceBought","royceTurned"],"npcFree":["npc_jolene","npc_royce","npc_lamar","npc_hollis","npc_elbert"]}', 'the bought-and-turned branch');
    W.events[e].branches[b].when.flagsSet[1] = 'royceDanced';
    return 'world.events[' + e + '].branches[' + b + '].when.flagsSet[1]';
  });
  problemAt(r, 'engine.flag.unset', r.at, /^reads the flag "royceDanced", which nothing in the pack sets/);
  // The default's first effect.
  r = await editedProblems(h, (p, { W, idx }) => {
    const e = idx(W.events, x => x.id === 'evt_council_meeting', 'the council meeting');
    const first = W.events[e].default.effects[0];
    if (first.op !== 'setFlag' || first.key !== 'councilVoted') throw new Error('the default no longer starts with councilVoted');
    first.op = 'throwParty';
    return 'world.events[' + e + '].default.effects[0].op';
  });
  problemAt(r, 'engine.effect.op', r.at, /^"throwParty" is not one of the engine's effect ops/);
});

s.test('rumours spread: twenty, each with two or more people who can tell it, most bearing on a thread; Gerald, Pearl and Nadine are gossips; nearly everyone in town is in the story now', async h => {
  const D = content();
  const T = D.TOWN_DATA;
  assert.equal(T.rumours.length, 20);
  for (const r of T.rumours) {
    const tellers = new Set([r.sourceNpcId].concat(r.tellerIds || []));
    const src = npcOf(D, r.sourceNpcId);
    for (const n of T.npcs) if (n.factionId && n.factionId === (r.factionId || src.factionId)) tellers.add(n.id);
    assert.ok(tellers.size >= 2, r.id + ' has two tellers');
  }
  assert.ok(T.rumours.filter(r => r.threadId).length >= 12);
  for (const id of ['npc_gerald', 'npc_pearl', 'npc_nadine']) assert.ok(npcOf(D, id).tags.includes('gossip'), id);
  const story = JSON.stringify([T.factions, T.seeds, T.rumours, T.threads, T.events, D.BACKGROUNDS.map(b => b.hook)]);
  const plotless = T.npcs.filter(n => (n.presence || 'here') === 'here' && !story.includes(`"${n.id}"`) && !story.includes(n.name)).map(n => n.id);
  assert.ok(plotless.length <= 4, 'people in town in no clock, seed, rumour, thread, event or hook: ' + plotless.join(', '));
  // Changed by design in wave 29 (A4): the rumour is leverage over Mavis once heard (leverageOver), so the edit keeps that field.
  const r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.rumours, x => x.id === 'rum_mavis_cash_rooms' && JSON.stringify(x.tellerIds) === '["npc_tyler"]' && x.leverageOver === 'npc_mavis', 'rum_mavis_cash_rooms told by Tyler');
    delete W.rumours[i].tellerIds;
    return 'world.rumours[' + i + '].tellerIds';
  });
  problemAt(r, 'engine.rumour.tellers', r.at, /^only npc_brianna can tell it/);
});

s.test('goods say what they are and name no place; TABLES.npc keeps only the lists something reads; GOAL_PRESETS offers four to six goals from the town\'s threads', async h => {
  const D = content();
  for (const g of D.TABLES.items.goods) {
    assert.ok(['good', 'service', 'drink', 'food'].includes(g.kind), g.name);
    assert.doesNotMatch(g.name, /Low Water|Pittman|Riverview|Byrd/, g.name);
  }
  const kind = name => D.TABLES.items.goods.find(g => g.name === name).kind;
  assert.deepEqual(['Night at the motel', 'Shot of whiskey', 'Catfish basket', 'Lighter'].map(kind), ['service', 'drink', 'food', 'good']);
  assert.deepEqual(Object.keys(D.TABLES.npc).sort(), ['firstNames', 'occupations']);
  assert.ok(D.GOAL_PRESETS.length >= 4 && D.GOAL_PRESETS.length <= 6);
  assert.ok(D.GOAL_PRESETS.every(g => typeof g === 'string' && g.length <= 140));
  // The UI reads GOAL_PRESETS inside the page script; once Game.data carries it, it is the same list.
  const page = await h.open();
  const fromPage = await page.evaluate(() => Game.data.GOAL_PRESETS || null);
  if (fromPage) assert.deepEqual(fromPage, D.GOAL_PRESETS);
  const r = await editedProblems(h, (p, { W, idx }) => {
    const goods = W.tables.items.goods;
    const i = idx(goods, g => g.name === 'Shot of whiskey' && g.price === 6 && g.kind === 'drink', 'the shot of whiskey');
    goods[i].name = 'Shot of whiskey at the Low Water';
    return 'world.tables.items.goods[' + i + '].name';
  });
  problemAt(r, 'house.goods.name', r.at, /names a place \("low water"\)/);
});

// ----- Wave 2 (docs/notes/content.md, "Wave 2") -----

/* The branch the council meeting would take now: its index (-1 for the
   default) and the flags it would set. In the page, with World's own
   conditions. */
const meetingPick = page => page.evaluate(() => {
  const ev = Game.data.TOWN_DATA.events.find(e => e.id === 'evt_council_meeting');
  const i = ev.branches.findIndex(b => Game.World.conditionsMet(b.when));
  const b = i >= 0 ? ev.branches[i] : ev.default;
  return { i, text: b.text, flags: b.effects.filter(e => e.op === 'setFlag' && e.key !== 'councilVoted').map(e => e.key).sort().join('+') };
});
/* Set the meeting's levers: flags on or off, people free or arrested, Royce's attitude. */
const levers = (page, o) => page.evaluate(o => {
  const S = Game.State;
  const effects = [];
  for (const k of ['royceBought', 'royceTurned', 'bridgeReportVoid']) effects.push({ op: 'setFlag', key: k, value: (o.flags || []).includes(k) });
  for (const id of ['npc_jolene', 'npc_royce', 'npc_lamar', 'npc_hollis', 'npc_elbert']) effects.push({ op: 'npcStatus', npcId: id, status: (o.jailed || []).includes(id) ? 'arrested' : 'free' });
  // Wave 30: Royce's regard is liking, trust and how well he knows the player (relSet lands each exactly).
  const r = S.apply({ effects, relSet: { npcId: 'npc_royce', w: o.royce === undefined ? 10 : o.royce, t: o.trust === undefined ? 5 : o.trust, k: o.knows === undefined ? 0 : o.knows } });
  return r.rejected.map(x => x.reason);
}, o);

s.test('wave 2: the council meeting counts only members who are free (a councilman in the cell does not vote: his chair is empty and the count changes), and Royce\'s regard, the report, Curtis\'s debt and the clocks\' race decide it', async h => {
  const D = content();
  const ev = D.TOWN_DATA.events.find(e => e.id === 'evt_council_meeting');
  const FIVE = ['npc_jolene', 'npc_royce', 'npc_lamar', 'npc_hollis', 'npc_elbert'];
  const nameOf = id => npcOf(D, id).name;
  // Every member the text has acting (not as an owner: "Hollis Byrd's chair") is free in its when.
  for (const [i, b] of ev.branches.entries()) {
    const free = b.when.npcFree || [];
    const t = b.text.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+'s\b/g, ' ');
    for (const id of FIVE) {
      const [first] = nameOf(id).split(' ');
      if (new RegExp(`\\b${first}\\b`).test(t)) assert.ok(free.includes(id), `branch ${i + 1} has ${id} acting: ${b.text}`);
    }
  }
  // Each outcome with all five there has a twin for Hollis Byrd's empty chair, right after it, with the count it makes.
  const same = (a, b) => JSON.stringify(Object.assign({}, a, { npcFree: null })) === JSON.stringify(Object.assign({}, b, { npcFree: null }));
  let twins = 0;
  ev.branches.forEach((b, i) => {
    const free = b.when.npcFree || [];
    if (!FIVE.every(id => free.includes(id))) return;
    const next = ev.branches[i + 1];
    assert.ok(next && same(b.when, next.when) && !(next.when.npcFree || []).includes('npc_hollis'), `branch ${i + 1} has a Hollis-out twin`);
    assert.match(next.text, /Hollis Byrd's chair empty/);
    assert.match(next.text, /two to two|three to one|two to one|one to two/);
    twins++;
  });
  assert.ok(twins >= 6, 'twins: ' + twins);
  assert.doesNotMatch(ev.default.text, /Royce|Hollis|Elbert|Lamar|Jolene|mayor/, 'the default names nobody acting: ' + ev.default.text);
  // The validator refuses a branch that has Hollis voting without him free.
  const r = await editedProblems(h, (p, { W, idx }) => {
    const e = idx(W.events, x => x.id === 'evt_council_meeting', 'the council meeting');
    const b = idx(W.events[e].branches, x => JSON.stringify(x.when) === '{"flagsSet":["royceBought"],"npcFree":["npc_jolene","npc_royce","npc_lamar","npc_hollis","npc_elbert"]}', 'the bought branch with all five free');
    W.events[e].branches[b].when.npcFree = W.events[e].branches[b].when.npcFree.filter(id => id !== 'npc_hollis');
    return 'world.events[' + e + '].branches[' + b + '].when.npcFree';
  });
  problemAt(r, 'engine.event.actors', r.at, /^the text has npc_hollis acting: add them to npcFree/);
  // Attendance (playerAt) names a town place the player can be in.
  const r2 = await editedProblems(h, (p, { W }) => {
    const at = [];
    W.events.forEach((ev, e) => ev.branches.forEach((b, k) => { if (b.when && b.when.playerAt === 'loc_town_hall') { b.when.playerAt = 'loc_nowhere'; at.push('world.events[' + e + '].branches[' + k + '].when.playerAt'); } }));
    return at;
  });
  assert.ok(r2.at.length >= 1, 'a branch read playerAt');
  for (const at of r2.at) problemAt(r2, 'engine.condition', at, /^"loc_nowhere" is no place/);

  // In the page: what each lever does.
  const page = await h.open();
  await quickStart(page, { kinds: ['debt', 'secret', 'promise'] });
  const pick = async o => { assert.deepEqual(await levers(page, o), []); return meetingPick(page); };
  const bought = await pick({ flags: ['royceBought'] });
  assert.equal(bought.flags, 'councilBackedDownstream+policeDissolutionPassed', 'Carter\'s money alone: downstream, police ended');
  // Wave 30: the bought branch reads trust 20, the talked-it-through branch trust 30 and knows 25.
  assert.equal((await pick({ flags: ['royceBought'], royce: 20, trust: 20 })).flags, 'bridgeVoteTabled+policeKept', 'a Royce who has come to trust the player abstains: a tie');
  assert.equal((await pick({ flags: ['royceBought'], royce: 40, trust: 5 })).flags, 'councilBackedDownstream+policeDissolutionPassed', 'warmth alone, bought: no second thoughts');
  assert.equal((await pick({ flags: ['royceBought', 'royceTurned'], royce: 30, trust: 30, knows: 25 })).flags, 'bridgeVoteTabled+policeKept', 'a Royce who trusts the player tables it, bought or not');
  assert.equal((await pick({ flags: ['royceTurned'] })).flags, 'councilBackedInTown+policeDissolutionPassed', 'the photographs alone: in town');
  const out = await pick({ flags: ['royceBought'], jailed: ['npc_hollis'] });
  assert.equal(out.flags, 'councilBackedDownstream+policeKept', 'Hollis in the cell: downstream three to one, and the police vote ties');
  assert.match(out.text, /Hollis Byrd's chair empty the council backs the downstream bridge site three to one/);
  assert.doesNotMatch(out.text, /over Hollis Byrd/);
  assert.equal((await pick({ flags: ['royceTurned'], jailed: ['npc_hollis'] })).flags, 'bridgeVoteTabled+policeKept', 'in town without Hollis ties two to two');
  const voided = await pick({ flags: ['bridgeReportVoid'], jailed: ['npc_jolene', 'npc_hollis'] });
  assert.equal(voided.flags, 'bridgeVoteTabled+policeKept');
  assert.match(voided.text, /two chairs empty, the mayor's and Hollis Byrd's/);
  assert.match(voided.text, /three to nothing/);
  const short = await pick({ flags: ['royceBought'], jailed: ['npc_lamar'] });
  assert.equal(short.i, -1, 'another seat empty: the default, which counts nobody');
  // Curtis's card debt paid: Royce goes back on whatever he promised.
  const curtis = await page.evaluate(() => {
    const S = Game.State;
    const r = S.apply({ effects: [{ op: 'addObligation', kind: 'debt', npcId: 'npc_curtis', text: 'Pay Curtis Pruett the four hundred dollars from the card game.', amount: 400, dueOffset: 3 }] });
    const id = (S.current.player.obligations || []).find(o => o.npcId === 'npc_curtis').id;
    const r2 = S.apply({ effects: [{ op: 'settleObligation', id, status: 'met' }] });
    return { id, rejected: r.rejected.concat(r2.rejected).map(x => x.reason) };
  });
  assert.deepEqual(curtis, { id: 'obl_debt_npc_curtis', rejected: [] });
  const paid = await pick({ flags: ['royceBought'] });
  assert.equal(paid.flags, 'bridgeVoteTabled+policeKept');
  assert.match(paid.text, /Curtis Pruett, flush with the four hundred dollars/);

  // A live meeting: Hollis arrested in the afternoon, Carter's money in; the town hears the count without him.
  // (The engine tells an event once: the branch's own addNews, not its text as well, so the news is the twin's count.)
  await levers(page, { flags: ['royceBought'], jailed: ['npc_hollis'] });
  const live = await page.evaluate(() => {
    const ev = Game.data.TOWN_DATA.events.find(e => e.id === 'evt_council_meeting');
    const b = ev.branches.find(x => Game.World.conditionsMet(x.when)) || ev.default;
    Game.State.apply({ setTime: { day: 6, phase: 'afternoon', shorts: 0 } });
    Game.Pipeline.passTime('long', 'wait');
    const st = Game.state;
    return { voted: !!st.flags.councilVoted, text: b.text, own: b.effects.find(e => e.op === 'addNews').text, news: st.news.filter(n => n.day === 6).map(n => n.text) };
  });
  assert.ok(live.voted, 'the meeting happened');
  assert.match(live.text, /with Hollis Byrd's chair empty/);
  assert.deepEqual(live.news.filter(t => /council/.test(t)), [live.own], 'told once, in the branch\'s own news');
  assert.doesNotMatch(live.news.join(' | '), /three to two|over Hollis Byrd and Elbert Gentry/);
});

s.test('wave 2: the ending never says how long it has been when a flag brings it early, gives Jolene a court date wherever she is, settles the vote threads and plants what happens next, which happens', async h => {
  const D = content();
  const E = D.TOWN_DATA.epilogue;
  for (const b of E.branches) {
    assert.doesNotMatch(b.text, /weeks? (on|in|later)|three weeks/i, 'an ending a flag can bring early: ' + b.text.slice(0, 60));
    assert.doesNotMatch(b.text, /were done at the end of October|waiting on a court date/, b.text.slice(0, 60));
    const statuses = b.effects.filter(e => e.op === 'threadUpdate' && e.status).map(e => `${e.threadId}:${e.status}`);
    assert.ok(statuses.some(x => /^thr_bridge_vote:/.test(x)) && statuses.some(x => /^thr_police_vote:/.test(x)), 'both votes settled: ' + statuses);
    const seeds = b.effects.filter(e => e.op === 'plantSeed');
    assert.ok(seeds.length >= 2 && seeds.length <= 3, 'aftermath seeds: ' + seeds.length);
  }
  assert.match(E.branches[0].text, /Jolene Overstreet has a court date in Clayburn/);
  assert.match(E.default.text, /^Three weeks in/, 'only the default (day 21 alone brings it) counts the weeks');
  // The validator refuses a time word in an early ending.
  const r = await editedProblems(h, (p, { W, idx }) => {
    const i = idx(W.epilogue.branches, b => b.text.startsWith('The barriers are up on the old bridge, and the town police are finished'), 'the early ending with the police finished');
    W.epilogue.branches[i].text = 'Three weeks on, the' + W.epilogue.branches[i].text.slice(3);
    return 'world.epilogue.branches[' + i + '].text';
  });
  problemAt(r, 'house.epilogue.howLong', r.at, /^says how long it has been \("Three weeks"\)/);

  // Live: the bridge closes on day 18 with the police vote passed.
  const page = await h.open();
  await quickStart(page, { kinds: ['debt', 'secret', 'promise'] });
  const live = await page.evaluate(() => {
    const S = Game.State, W = Game.World;
    // Changed by design in wave 5: the meeting is marked held, as its flags say (the council's branch now settles the police thread it decides).
    S.apply({ setTime: { day: 18, phase: 'morning', shorts: 0 }, eventsFired: ['evt_council_meeting'], effects: [{ op: 'setFlag', key: 'councilVoted', value: true }, { op: 'setFlag', key: 'policeDissolutionPassed', value: true }, { op: 'setFlag', key: 'oldBridgeClosed', value: true }] });
    W.fireEvents({ day: 18, phase: 'morning' });
    const st = Game.state;
    const th = id => { const t = S.thread(id); return `${t.status}/${t.knownToPlayer}`; };
    // Changed by design (wave 7): what the ending says of a thread (and that the player knows it) shows once the ending is told.
    const before = { bridge: th('thr_bridge_vote'), police: th('thr_police_vote') };
    S.apply({ newsSeen: 'ending' });
    const out = {
      ending: (st.news.find(n => n.epilogue) || {}).text || '',
      before, bridge: th('thr_bridge_vote'), police: th('thr_police_vote'),
      planted: st.seeds.filter(x => /^seed_after_/.test(x.id)).map(x => x.id).sort()
    };
    // Six days on, the county takes over: the aftermath seed fires on its day.
    S.apply({ setTime: { day: 24, phase: 'morning', shorts: 0 } });
    W.fireSeeds({});
    out.due = (st.dueEvents || []).map(e => e.text).join(' | ');
    out.news = st.news.filter(n => n.day === 24).map(n => n.text).join(' | ');
    return out;
  });
  assert.match(live.ending, /^The barriers are up on the old bridge, and the town police are finished at the end of the month/);
  assert.deepEqual(live.before, { bridge: 'open/false', police: 'open/false' }, 'not before the ending is told');
  assert.equal(live.bridge, 'failed/true');
  assert.equal(live.police, 'failed/true');
  assert.deepEqual(live.planted, ['seed_after_bar_for_sale', 'seed_after_deputy', 'seed_after_wade_river']);
  assert.match(live.due, /On the last day of October the town police hand their keys to the county/);
  assert.match(live.news, /a county deputy from Clayburn/);

  // Live: the report thrown out and the police kept: both threads resolved, and Chief Bell turns to the pills.
  const page2 = await h.open();
  await quickStart(page2, { kinds: ['debt', 'secret', 'promise'] });
  const won = await page2.evaluate(() => {
    const S = Game.State, W = Game.World;
    const sp = Game.state.player.storyPoints;
    S.apply({ setTime: { day: 15, phase: 'morning', shorts: 0 }, effects: [{ op: 'setFlag', key: 'councilVoted', value: true }, { op: 'setFlag', key: 'policeKept', value: true }, { op: 'setFlag', key: 'bridgeReportVoid', value: true }, { op: 'setFlag', key: 'secondInspectionOrdered', value: true }] });
    W.fireEvents({ day: 15, phase: 'morning' });
    // Changed by design (wave 6, the fifth review's bug 6): what the ending settles is earned once the ending is told (its news seen), not before.
    const held = Game.state.player.storyPoints - sp;
    S.apply({ newsSeen: 'ending' });
    const out = { bridge: S.thread('thr_bridge_vote').status, police: S.thread('thr_police_vote').status, held, points: Game.state.player.storyPoints - sp, pillsKnown: S.thread('thr_riverbend_pills').knownToPlayer };
    S.apply({ playerLocationId: 'loc_town_hall' });
    W.fireSeeds({});
    out.due = (Game.state.dueEvents || []).map(e => e.text).join(' | ');
    out.pillsAfter = S.thread('thr_riverbend_pills').knownToPlayer;
    return out;
  });
  assert.equal(won.bridge, 'resolved');
  assert.equal(won.police, 'resolved');
  assert.equal(won.held, 0, 'nothing before the ending is told');
  assert.ok(won.points >= 1, 'a settled ending pays a story point: ' + won.points);
  assert.equal(won.pillsKnown, false);
  assert.match(won.due, /says the next thing on (his|her) list is whoever is selling pills at Riverbend/);
  assert.equal(won.pillsAfter, true);
});

s.test('wave 2: the big run waits on the boats; people in seeds and templates get their own pronouns or a name; a missed obligation says what happens and errands are owed to whoever asked; loose ends are told to "you"; Curtis\'s hook names his Friday game', async h => {
  const D = content();
  // Nobody bound to a loose end is "they" in its seed (Tammy, Lorna, Leon, Nadine...).
  for (const [k, le] of Object.entries(D.LOOSE_ENDS)) assert.doesNotMatch(le.seed.effect, /\b(they|their|them|themselves)\b/, k + ': ' + le.seed.effect);
  // A loose end happens to the player: told to "you" (the due event reaches the narration as written).
  for (const [k, le] of Object.entries(D.LOOSE_ENDS)) assert.ok(/\byou(r)?\b/.test(le.seed.effect) && !le.seed.effect.includes('{player}'), k + ': ' + le.seed.effect);
  assert.equal(D.LOOSE_ENDS.debt.seed.effect, '{npc} walks up to you, reads your name off a folded paper with a number written under it, and says the money is due in three days.');
  // The fixture follows the wave-4 wording (playtest R11: "draws you aside", not "finds you alone", since the person may come into a crowd).
  const tpl = await editedProblems(h, (p, { PL }) => {
    const k = Object.keys(PL.looseEnds).find(x => PL.looseEnds[x].seed.effect.startsWith('{npc} draws you aside and says, low,'));
    if (!k) throw new Error('the edit found no loose end that draws you aside');
    PL.looseEnds[k].seed.effect = PL.looseEnds[k].seed.effect.replace('{npc} draws you aside', '{npc} draws {player} aside');
    return 'player.looseEnds.' + k + '.seed.effect';
  });
  problemAt(tpl, 'engine.looseEnd', tpl.at, /^a loose end happens to the player: write it to "you", not \{player\}/);
  const all = D.GRUDGE_TEMPLATES.concat(D.FAVOUR_TEMPLATES).map(t => t.effect).join('\n');
  for (const gone of ['on their own phone', 'was with them all night', 'something they saw', 'gives them the creeps']) assert.ok(!all.includes(gone), gone);
  // Every obligation says what happens when its day goes by, and an errand is owed to whoever asked.
  const obls = [];
  for (const le of Object.values(D.LOOSE_ENDS)) obls.push(...[le.obligation].concat(le.obligations || []).filter(Boolean));
  assert.equal(obls.length, 9);
  for (const o of obls) {
    assert.ok(typeof o.missText === 'string' && o.missText.length > 20 && !/came looking:/.test(o.missText), JSON.stringify(o.missText));
    const owed = o.owedTo || '{npcId}';
    // Changed by design in wave 27 (A2): a broken word is a socialEvent, a memory with what it did (or an addMemory where no number moves).
    assert.ok(o.onMiss.some(e => (e.op === 'addMemory' || e.op === 'socialEvent') && e.npcId === owed), 'the person owed remembers: ' + o.text);
  }
  const letter = D.LOOSE_ENDS.promise.obligations[0];
  assert.deepEqual([letter.kind, letter.owedTo], ['errand', 'npc_bernice']);
  assert.match(letter.missText, /still in \{playerName\}'s pocket/);
  assert.deepEqual(D.LOOSE_ENDS.promise.obligations.map(o => o.owedTo), ['npc_bernice', 'npc_dale', 'npc_bernice']);
  const black = D.LOOSE_ENDS.secret.obligation;
  assert.match(black.missText, /has told Chief Bell what \{playerName\} is hiding/);
  // Changed by design in wave 27 (A2): the chief's memory is told_anyway, the collector's a broken word (own), each a socialEvent.
  assert.ok(black.onMiss.some(e => (e.op === 'addMemory' || (e.op === 'socialEvent' && e.event === 'told_anyway')) && e.npcId === 'npc_marcus'), 'the chief knows');
  assert.ok(D.LOOSE_ENDS.debt.obligations[1].onMiss.some(e => (e.op === 'addMemory' || e.op === 'socialEvent') && e.npcId === '{npcId}' && e.weight === 3), 'Leon remembers the title loan he collected');
  const r = await editedProblems(h, (p, { PL }) => {
    const k = Object.keys(PL.looseEnds).find(x => (PL.looseEnds[x].obligations || []).some(o => o.owedTo === 'npc_bernice' && /^The letter for/.test(o.missText)));
    if (!k) throw new Error('the edit found no letter owed to Bernice');
    const i = PL.looseEnds[k].obligations.findIndex(o => o.owedTo === 'npc_bernice' && /^The letter for/.test(o.missText));
    delete PL.looseEnds[k].obligations[i].owedTo;
    return 'player.looseEnds.' + k + '.obligations[' + i + '].owedTo';
  });
  problemAt(r, 'engine.obligation', r.at, /^an errand is owed to whoever asked for it/);
  // Curtis Pruett's hook names his Friday night game at the back table (the mock deals it there on a Friday).
  const hook = D.BACKGROUNDS.find(b => b.id === 'bg_poker_hustler').hook;
  assert.equal(hook.npcId, 'npc_curtis');
  assert.match(hook.text, /his Friday night game at the back table of the Low Water/);

  // Live: with the boats pulled up the big run does not go (its alt is told, and the Night Run gets no push).
  const page = await h.open();
  await quickStart(page, { kinds: ['debt', 'secret', 'promise'] });
  const run = await page.evaluate(() => {
    const S = Game.State, W = Game.World;
    const filled = () => { const f = S.faction('fac_nightrun'); return f.clocks[f.activeClock].filled; };
    S.apply({ setTime: { day: 4, phase: 'morning', shorts: 0 }, effects: [{ op: 'setFlag', key: 'boatsPulledUp', value: true }] });
    const before = filled();
    W.fireSeeds({});
    return { due: (Game.state.dueEvents || []).filter(e => e.seedId === 'seed_big_run').map(e => e.text), delta: filled() - before };
  });
  assert.equal(run.due.length, 1);
  assert.match(run.due[0], /the run has not gone/);
  // The lease letter (day 3) still pushes the Night Run; the big run does not.
  assert.ok(run.delta <= 1, 'the big run gave no push: ' + run.delta);
});

s.run();
