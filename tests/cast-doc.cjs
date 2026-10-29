#!/usr/bin/env node
// Writes docs/CAST.md, the readable roster of everyone in the town, from the
// cast inlined in index.html (TOWN_DATA between the BEGIN/END CONTENT
// markers, read in a Node vm sandbox like tests/validate-town.cjs does).
// Usage: node tests/cast-doc.cjs          (rewrites docs/CAST.md)
//        node tests/cast-doc.cjs --check  (exits 1 when docs/CAST.md is out of date)
// tests/content.test.cjs runs the check, so the roster never drifts from the data.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILE = process.env.VALIDATE_FILE ? path.resolve(process.env.VALIDATE_FILE) : path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'docs', 'CAST.md');
const BEGIN = '// ===== BEGIN CONTENT =====';
const END = '// ===== END CONTENT =====';
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const PRONOUNS = { he: 'he/him', she: 'she/her', they: 'they/them' };

function load() {
  const html = fs.readFileSync(FILE, 'utf8');
  const src = html.slice(html.indexOf(BEGIN) + BEGIN.length, html.indexOf(END));
  return vm.runInNewContext(src + '\n;({ TOWN_DATA, LOOSE_ENDS })', {}, { filename: 'index.html#content', timeout: 5000 });
}

/* The roster as Markdown: the people in town grouped by where they live,
   then the people who live elsewhere and the dead, then every place with
   its history and hours, then the loose ends. */
function render(D) {
  const T = D.TOWN_DATA;
  const loc = id => T.locations.find(l => l.id === id);
  const place = id => { const l = loc(id); return l ? l.name.replace(/^The /, 'the ') : id; };
  const faction = id => { const f = (T.factions || []).find(x => x.id === id); return f ? f.name : null; };
  const presence = n => n.presence || 'here';
  const mark = n => (presence(n) === 'dead' ? ' (dead)' : presence(n) === 'away' ? ' (lives elsewhere)' : '');
  const where = n => {
    const at = {};
    for (const l of T.locations) for (const p of PHASES) if ((l.npcIdsBySchedule[p] || []).includes(n.id)) (at[l.id] = at[l.id] || []).push(p);
    return Object.keys(at).sort((a, b) => PHASES.indexOf(at[a][0]) - PHASES.indexOf(at[b][0]))
      .map(id => `${id === n.home ? 'home' : place(id)} (${at[id].length === 4 ? 'all day and night' : at[id].join(', ')})`).join(', ');
  };
  const isTo = n => T.npcs.flatMap(m => (m.relations || []).filter(r => r.npcId === n.id).map(r => `${r.relation} of ${m.name}${mark(m)}`));
  const head = n => `**${n.name}** (${Number.isInteger(n.age) ? `${n.age}, ` : ''}${PRONOUNS[n.pronouns] || n.pronouns}), ${n.role}.`;
  const tieLine = n => { const t = isTo(n); return t.length ? `${t.join('; ').replace(/^./, c => c.toUpperCase())}.` : ''; };
  const here = T.npcs.filter(n => presence(n) === 'here');
  const away = T.npcs.filter(n => presence(n) === 'away');
  const dead = T.npcs.filter(n => presence(n) === 'dead');
  const homes = [];
  for (const n of here) if (!homes.includes(n.home)) homes.push(n.home);
  // Town places first (in the data's order), then the homes the player finds.
  homes.sort((a, b) => (loc(a).discovered === false) - (loc(b).discovered === false) || T.locations.indexOf(loc(a)) - T.locations.indexOf(loc(b)));
  const outOfTown = T.locations.filter(l => l.away === true);
  const undiscovered = T.locations.filter(l => l.discovered === false && l.away !== true);
  const onMap = T.locations.filter(l => l.discovered !== false && l.away !== true);
  const out = [];
  out.push(`# The cast of ${T.name}`);
  out.push('');
  out.push(`Everyone the story can mention: ${T.npcs.length} people, every one written by hand in \`TOWN_DATA\` in \`index.html\`, with an age, pronouns, a role, a look, a voice, two traits, a goal, a secret, a history and who they are to whom. ${here.length} live in town, with a home and a place in every phase of the day; ${away.length} live elsewhere and ${dead.length} are dead: the story can talk about them, but they never appear. The game never makes a person up: anyone the story or the player mentions is one of these people or does not exist (see "The cast" in README.md).`);
  out.push('');
  out.push(`The town has ${T.locations.length} places. ${onMap.length} are on the map from the start; ${undiscovered.length} are homes the player finds when someone tells them about one (they then show on the map as "heard of" until visited); ${outOfTown.length} are out of town, talked about and never gone to.`);
  out.push('');
  out.push('This file is generated from the data: after editing the cast or the places, run `node tests/cast-doc.cjs` (and `node tests/validate-town.cjs`). Looks, voices, goals and secrets are in `index.html` only, so this roster spoils nothing.');
  for (const h of homes) {
    const l = loc(h);
    const people = here.filter(n => n.home === h);
    out.push('');
    out.push(`## ${l.name}${l.discovered === false ? ' (a home to find)' : ''}`);
    out.push('');
    out.push(`${l.description.split(/(?<=[.!?])\s+/)[0]}`);
    out.push('');
    for (const n of people) {
      const f = faction(n.factionId);
      const bits = [head(n)];
      const t = tieLine(n);
      if (t) bits.push(t);
      if (f) bits.push(`${f}.`);
      bits.push(`Usually: ${where(n)}.`);
      out.push(`- ${bits.join(' ')} \`${n.id}\``);
    }
  }
  if (away.length) {
    out.push('');
    out.push('## Elsewhere');
    out.push('');
    out.push('Alive and living out of town. The narrator is told where they are and how they can be reached; they are never scheduled and never in a scene.');
    out.push('');
    for (const n of away) {
      const bits = [head(n)];
      const t = tieLine(n);
      if (t) bits.push(t);
      bits.push(`Lives: ${n.where}.`);
      if (n.reach) bits.push(`Reached by: ${n.reach}.`);
      out.push(`- ${bits.join(' ')} \`${n.id}\``);
    }
  }
  if (dead.length) {
    out.push('');
    out.push('## Gone');
    out.push('');
    out.push('The dead, with their age when they died. People remember them; they never appear.');
    out.push('');
    for (const n of dead) {
      const bits = [head(n)];
      const t = tieLine(n);
      if (t) bits.push(t);
      bits.push(`Died: ${n.died}.`);
      if (n.buried) bits.push(`Buried: ${place(n.buried)}.`);
      out.push(`- ${bits.join(' ')} \`${n.id}\``);
    }
  }
  if (Array.isArray(T.offstage) && T.offstage.length) {
    out.push('');
    out.push('## Talked about, never in town');
    out.push('');
    out.push('People the story can mention who never appear (the dead, the far away). The narrator is told about them with the cast.');
    out.push('');
    for (const o of T.offstage) out.push(`- **${o.name}**: ${o.about}.`);
  }
  if (typeof T.history === 'string' && T.history) {
    out.push('');
    out.push('## The town');
    out.push('');
    out.push(T.history);
    if (Array.isArray(T.recent) && T.recent.length) {
      out.push('');
      for (const r of T.recent) out.push(`* ${r.when}: ${r.what}`);
    }
  }
  out.push('');
  out.push('## Places');
  out.push('');
  out.push('Every place, with how it came to be and when it is open. On the map from the start, a home to find, or out of town (never a destination).');
  out.push('');
  for (const l of onMap.concat(undiscovered, outOfTown)) {
    const kind = l.away === true ? `out of town: ${l.distance}` : l.discovered === false ? 'a home to find' : 'on the map';
    const bits = [`**${l.name}** (${l.type}; ${kind}).`];
    if (l.history) bits.push(l.history);
    if (l.hours) bits.push(`Hours: ${l.hours}.`);
    out.push(`- ${bits.join(' ')} \`${l.id}\``);
  }
  const L = D.LOOSE_ENDS || {};
  out.push('');
  out.push('## Loose ends');
  out.push('');
  out.push('Each loose end the player picks binds to someone in the cast: a free person carrying the tag of the option they kept, else the loose end\'s own tag (picked with the seeded dice, never someone already tied to another loose end while anyone else is left).');
  out.push('');
  for (const k of Object.keys(L)) {
    const link = L[k].link || {};
    const tags = Array.from(new Set([link.tag].concat(link.optionTags || []).filter(Boolean)));
    const who = tags.map(t => `${t}: ${here.filter(n => (n.tags || []).includes(t)).map(n => n.name).join(', ') || 'nobody'}`);
    out.push(`- **${L[k].label}** (${who.join('; ')})`);
  }
  out.push('');
  return out.join('\n');
}

const text = render(load());
if (process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (have !== text) {
    console.error('docs/CAST.md is out of date with the cast in index.html: run node tests/cast-doc.cjs');
    process.exit(1);
  }
  console.log('docs/CAST.md matches the cast');
} else {
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
