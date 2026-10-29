'use strict';
/* The town inlined in index.html between the BEGIN/END CONTENT markers: it
   is the only town (no placeholder data left), it validates in the page and
   with tests/validate-town.cjs (which also catches a bad hand edit), and
   every background and loose end starts a playable game. Names and counts
   come from the data, so this suite survives a change of town. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');
const { suite, quickStart, ROOT, GAME_PATH } = require('./helpers.cjs');

const s = suite('content');
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';

s.test('the inlined town is the only town, with no placeholder data and no content/ or content-modern/ staging folder', async h => {
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  assert.equal(html.split(BEGIN).length, 2, 'BEGIN marker once');
  assert.equal(html.split(END).length, 2, 'END marker once');
  const block = html.slice(html.indexOf(BEGIN), html.indexOf(END));
  for (const name of ['TOWN_DATA', 'TABLES', 'BACKGROUNDS', 'FLAWS', 'LOOSE_ENDS', 'GRUDGE_TEMPLATES', 'FAVOUR_TEMPLATES']) assert.match(block, new RegExp(`\\nconst ${name} = `), name);
  for (const gone of ['Tallow Ford', 'Hobb Tanner', 'Jory Pike', 'PLACEHOLDER', 'placeholder data']) assert.ok(!html.includes(gone), 'leftover: ' + gone);
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
  assert.ok(info.name && block.includes(`name: "${info.name}",`), 'the town in the block is the town in the page');
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

s.test('validate-town.cjs passes on index.html and catches a hand-editing mistake', async h => {
  const page = await h.open();
  const t = await page.evaluate(() => ({ name: Game.data.TOWN_DATA.name, locs: Game.data.TOWN_DATA.locations.length, npcs: Game.data.TOWN_DATA.npcs.length }));
  const ok = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.startsWith(`OK ${t.name}: ${t.locs} locations, ${t.npcs} npcs`), ok.stdout);
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  // Point the first exit of the first location at a place that does not exist.
  const at = html.indexOf(BEGIN);
  const m = /exits: \[\s*"(loc_[a-z0-9_]+)"/.exec(html.slice(at));
  assert.ok(m, 'found an exits list');
  const cut = at + m.index;
  const broken = html.slice(0, cut) + m[0].replace(m[1], 'loc_nowhere') + html.slice(cut + m[0].length);
  assert.notEqual(broken, html, 'the edit applied');
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-')), 'index.html');
  fs.writeFileSync(tmp, broken);
  const bad = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /loc_nowhere/);
  const quoted = html.replace(`name: "${t.name}",`, `name: '${t.name}',`);
  assert.notEqual(quoted, html, 'the quote edit applied');
  fs.writeFileSync(tmp, quoted);
  const bad2 = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
  assert.equal(bad2.status, 1);
  assert.match(bad2.stderr, /single-quoted/);
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
    for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
      for (const n of inTown) if (!st.locations.some(l => G.State.npcsAt(l.id, ph).some(x => x.id === n.id))) nowhere.push(`${n.id} ${ph}`);
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

s.test('everything mentioned exists: tests/mentions.cjs finds no name or place in the content without a record, and validate-town.cjs refuses one added by hand; ages agree with looks and the family maths', async h => {
  const ok = spawnSync(process.execPath, [path.join(__dirname, 'mentions.cjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const html = fs.readFileSync(GAME_PATH, 'utf8');
  const page = await h.open();
  const T = await page.evaluate(() => Game.data.TOWN_DATA);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'novatria-mention-')), 'index.html');
  const check = text => { fs.writeFileSync(tmp, text); return spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) }); };
  // A new name in a description, and a new kind of place: both refused until there is a record.
  const loc = T.locations.find(l => !l.away);
  const named = html.replace(`description: ${JSON.stringify(loc.description)}`, `description: ${JSON.stringify(loc.description.replace(/\.$/, ', where Hank Pruitt waits by the cotton gin.'))}`);
  assert.notEqual(named, html, 'the edit applied');
  let r = check(named);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the name "Hank" matches no person, place or faction/);
  const placed = html.replace(`description: ${JSON.stringify(loc.description)}`, `description: ${JSON.stringify(loc.description.replace(/\.$/, ', two doors down from the old cotton gin.'))}`);
  r = check(placed);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /the place "the old cotton gin" matches no person, place or faction/);
  // An age the look disagrees with, and a mother younger than her daughter allows.
  const mother = T.npcs.find(n => (n.relations || []).some(x => x.relation === 'daughter') && /\b(?:woman|man) of (?:twenty|thirty|forty|fifty|sixty|seventy|eighty)/.test(n.look));
  const aged = html.replace(`name: ${JSON.stringify(mother.name)},\n      pronouns: ${JSON.stringify(mother.pronouns)},\n      age: ${mother.age},`, `name: ${JSON.stringify(mother.name)},\n      pronouns: ${JSON.stringify(mother.pronouns)},\n      age: ${mother.age + 30},`);
  assert.notEqual(aged, html, 'the age edit applied');
  r = check(aged);
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`${mother.id}\\)\\.age: is ${mother.age + 30}, but the look says ${mother.age}`));
  const daughter = T.npcs.find(n => n.id === mother.relations.find(x => x.relation === 'daughter').npcId);
  const young = html.replace(`name: ${JSON.stringify(daughter.name)},\n      pronouns: ${JSON.stringify(daughter.pronouns)},\n      age: ${daughter.age},`, `name: ${JSON.stringify(daughter.name)},\n      pronouns: ${JSON.stringify(daughter.pronouns)},\n      age: ${daughter.age + 25},`);
  assert.notEqual(young, html, 'the daughter edit applied');
  r = check(young);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /a parent is 16 to 60 years older/);
  // A dead person in a schedule is refused (the dead are never anywhere).
  const dead = T.npcs.find(n => n.presence === 'dead');
  const haunt = html.replace(/(npcIdsBySchedule: \{\n        morning: \[)/, `$1"${dead.id}", `);
  r = check(haunt);
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`${dead.id} is scheduled but is dead|is dead but scheduled in town`));
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

s.run();
