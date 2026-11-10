#!/usr/bin/env node
// Writes docs/CAST.md, the readable roster of everyone in the town, from the
// built-in Story Pack, packs/low-water.json (wave 37, Creator Mode: the
// pack is the source of truth, and node tests/pack-inline.cjs copies it into
// index.html). The eight old content names are read from it where they now
// live: TOWN_DATA is world, TABLES world.tables, BACKGROUNDS, FLAWS,
// LOOSE_ENDS and GOAL_PRESETS the player's backgrounds, flaws, looseEnds
// and goalPresets, and the grudge and favour templates world's.
// Usage: node tests/cast-doc.cjs          (rewrites docs/CAST.md)
//        node tests/cast-doc.cjs --check  (exits 1 when docs/CAST.md is out of date)
//        PACK_FILE=other.json node tests/cast-doc.cjs --check   (another pack)
// tests/content.test.cjs runs the check, so the roster never drifts from the data.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = process.env.PACK_FILE ? path.resolve(process.env.PACK_FILE) : path.join(ROOT, 'packs', 'low-water.json');
const OUT = path.join(ROOT, 'docs', 'CAST.md');
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const PRONOUNS = { he: 'he/him', she: 'she/her', they: 'they/them' };

function load() {
  const pack = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const w = pack.world;
  const p = pack.player;
  return {
    TOWN_DATA: w, TABLES: w.tables, BACKGROUNDS: p.backgrounds, FLAWS: p.flaws, LOOSE_ENDS: p.looseEnds,
    GRUDGE_TEMPLATES: w.grudgeTemplates, FAVOUR_TEMPLATES: w.favourTemplates, GOAL_PRESETS: p.goalPresets
  };
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
  // School days and the like (awayOn): "weekdays (morning, afternoon) at the county school in Clayburn".
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const awayLine = n => {
    const a = n.awayOn;
    if (!a || !Array.isArray(a.days)) return '';
    const days = WEEKDAYS.every(d => a.days.includes(d)) && a.days.length === 5 ? 'weekdays' : a.days.join(', ');
    return `Away ${days} (${(a.phases || []).join(', ')}) ${a.where}.`;
  };
  // Wave 28: where someone stands with a stranger when it is written by hand (start: trust, fear) and the axes set by hand (pride, guardedness, nerve, grudge-holding).
  const AXIS_NAMES = { p: 'pride', g: 'guardedness', n: 'nerve', r: 'grudge-holding' };
  const signed = v => (v > 0 ? `+${v}` : `${v}`);
  const startLine = n => {
    const parts = [];
    if (n.start && Number.isInteger(n.start.trust)) parts.push(`trust ${signed(n.start.trust)}`);
    if (n.start && Number.isInteger(n.start.fear)) parts.push(`fear ${n.start.fear}`);
    const axes = n.axes ? Object.keys(n.axes).map(k => `${AXIS_NAMES[k] || k} ${signed(n.axes[k])}`) : [];
    return (parts.length ? `Starts with a stranger at ${parts.join(', ')}.` : '') + (axes.length ? `${parts.length ? ' ' : ''}Axes: ${axes.join(', ')}.` : '');
  };
  /* Wave 29: whom they go to when the player frightens or hurts them (a
     protector the town knows of; a hidden one is left out, it would spoil
     a secret), what their secret weighs as leverage and the most a demand
     can take from them, the mercenary flag, and (wave 34) how they take to
     the player's interest when the romance list tunes them: spark rate,
     how well they must know the player first, how hard a flirt rolls.
     Every adult can be interested; anyone not listed takes the defaults. */
  const name = id => { const m = T.npcs.find(x => x.id === id); return m ? m.name : id; };
  const romance = Array.isArray(T.romance) ? T.romance : [];
  const holdLine = n => {
    const parts = [];
    const p = n.protector;
    if (p === 'nobody') parts.push('Goes to nobody when leaned on (a grudge instead).');
    else if (p !== undefined) {
      const ids = (Array.isArray(p) ? p : [p]).filter(x => typeof x === 'string' || (x && x.hidden !== true)).map(x => (typeof x === 'string' ? x : x.npcId));
      if (ids.length) parts.push(`Goes to ${ids.map(name).join(' and ')} when leaned on.`);
    }
    if (Number.isInteger(n.secretWeight)) parts.push(`Secret weight ${n.secretWeight}${Number.isInteger(n.canRaise) ? `; a demand can take $${n.canRaise}` : ''}.`);
    else if (Number.isInteger(n.canRaise)) parts.push(`A demand can take $${n.canRaise}.`);
    if (n.mercenary === true) parts.push('Mercenary.');
    const r = romance.find(x => x && x.npcId === n.id);
    if (r) { const hard = (r.faithful === true ? 'very_hard' : r.difficulty || 'hard').replace('_', ' '); parts.push(`${hard[0].toUpperCase() + hard.slice(1)} to win over (spark rate ${r.sparkRate}; opens at knows ${r.opensAt && Number.isInteger(r.opensAt.knows) ? r.opensAt.knows : 10}).`); }
    return parts.join(' ');
  };
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
  out.push(`Everyone the story can mention: ${T.npcs.length} people, every one written by hand in the story pack (\`packs/low-water.json\`, wave 37), with an age, pronouns, a role, a look, a voice, two traits, a goal, a secret, a history and who they are to whom. ${here.length} live in town, with a home and a place in every phase of the day; ${away.length} live elsewhere and ${dead.length} are dead: the story can talk about them, but they never appear. The game never makes a person up: anyone the story or the player mentions is one of these people or does not exist (see "The cast" in README.md).`);
  out.push('');
  out.push(`The town has ${T.locations.length} places. ${onMap.length} are on the map from the start; ${undiscovered.length} are homes the player finds when someone tells them about one (they then show on the map as "heard of" until visited); ${outOfTown.length} are out of town, talked about and never gone to.`);
  out.push('');
  out.push(`Every adult can be won over (wave 34). The ${romance.length} the romance list tunes say how hard ("Easy to win over", "Normal to win over"); anyone else over 18 is hard (spark rate 0.5; opens at knows 10). Nobody under 18 ever is.`);
  out.push('');
  out.push('This file is generated from the data in `packs/low-water.json`: after editing the cast or the places, run `node tests/cast-doc.cjs` (and `node tests/validate-pack.cjs`). Looks, voices, goals and secrets are in the pack only, so this roster spoils nothing.');
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
      const aw = awayLine(n);
      if (aw) bits.push(aw);
      const sl = startLine(n);
      if (sl) bits.push(sl);
      const hl = holdLine(n);
      if (hl) bits.push(hl);
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
      const sl = startLine(n);
      if (sl) bits.push(sl);
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
    // The calendar, the council and the set pieces (no outcomes: this roster spoils nothing).
    const council = here.filter(n => (n.tags || []).includes('council'));
    const extra = [];
    if (T.calendar && T.calendar.startDate) {
      const [y, m, d] = T.calendar.startDate.split('-').map(Number);
      const day1 = new Date(Date.UTC(y, m - 1, d));
      const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day1.getUTCDay()];
      const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
      extra.push(`Day 1 is ${wd} ${d} ${month} ${y}, in the ${T.calendar.season}.`);
    }
    if (council.length) extra.push(`The town council: ${council.map(n => n.name).join(', ')}.`);
    for (const ev of T.events || []) extra.push(`On day ${ev.day}, in the ${ev.phase}, at ${place(ev.locationId)}: ${ev.title.replace(/^The /, 'the ')}.`);
    if (T.epilogue && Number.isInteger(T.epilogue.onDay)) extra.push(`The story's ending is told on day ${T.epilogue.onDay}, or as soon as the bridge question is settled; then play goes on.`);
    if (extra.length) { out.push(''); out.push(extra.join(' ')); }
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
    const shut = (Array.isArray(l.closedOn) ? l.closedOn : []).filter(d => !String(l.hours || '').includes(d));
    if (shut.length) bits.push(`Shut on ${shut.join(' and ')}s.`);
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
    // Each preset option and who it binds to; what it binds the player to (obligations).
    (L[k].options || []).forEach((o, i) => {
      const tag = (link.optionTags && link.optionTags[i]) || link.tag;
      const ob = (Array.isArray(L[k].obligations) && L[k].obligations[i]) || L[k].obligation || null;
      const owes = ob ? `; ${ob.kind}${Number.isInteger(ob.amount) ? ` of $${ob.amount}` : ''}, due ${ob.dueOffset} days after it comes up` : '';
      out.push(`  - "${o}" (${tag}${owes})`);
    });
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
