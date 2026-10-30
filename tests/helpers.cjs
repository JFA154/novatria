'use strict';
/* Shared test harness: a tiny suite runner on top of the preinstalled
   Playwright. Every test gets fresh browser contexts; any uncaught page error
   fails the test. Network is blocked: only file:, blob: and data: URLs load. */
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const GAME_PATH = path.resolve(ROOT, 'index.html');
const GAME_URL = 'file://' + GAME_PATH;
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 740 };

function suite(name) {
  const tests = [];
  return {
    test(title, fn) { tests.push({ title, fn }); },
    async run() {
      const only = process.env.TEST_FILTER ? new RegExp(process.env.TEST_FILTER, 'i') : null;
      const browser = await chromium.launch();
      let passed = 0;
      let failed = 0;
      console.log(name);
      for (const t of tests) {
        if (only && !only.test(t.title)) continue;
        const contexts = [];
        const errors = [];
        const h = {
          errors,
          async open(opts = {}) {
            const context = await browser.newContext(Object.assign({ viewport: opts.viewport || LAPTOP, colorScheme: opts.colorScheme || 'dark' }, opts.contextOptions || {}));
            contexts.push(context);
            await context.route('**/*', opts.route || (route => {
              const u = route.request().url();
              return /^(file|blob|data):/.test(u) ? route.continue() : route.abort();
            }));
            const page = await context.newPage();
            page.on('pageerror', e => errors.push(e));
            await page.goto(opts.url || GAME_URL);
            await page.waitForFunction(() => window.Game && window.Game.App);
            return page;
          }
        };
        const t0 = Date.now();
        try {
          await t.fn(h);
          if (errors.length) throw new Error('uncaught page error: ' + errors.map(e => e.message).join(' | '));
          passed++;
          console.log(`  PASS  ${t.title} (${Date.now() - t0} ms)`);
        } catch (err) {
          failed++;
          const msg = String((err && err.stack) || err).split('\n').slice(0, 8).join('\n        ');
          console.log(`  FAIL  ${t.title}\n        ${msg}`);
        } finally {
          for (const c of contexts) await c.close().catch(() => {});
        }
      }
      await browser.close();
      console.log(`RESULT ${name}: passed=${passed} failed=${failed}`);
      process.exitCode = failed ? 1 : 0;
    }
  };
}

/* Start a game without the form, using the inlined content data. */
async function quickStart(page, opts = {}) {
  await page.evaluate(({ seed, kinds, bgIndex, name }) => {
    const D = Game.data;
    const bg = D.BACKGROUNDS[bgIndex || 0];
    const ks = kinds || ['debt', 'enemy', 'secret'];
    Game.App.quickStart({
      name: name || 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats),
      goal: 'Find out who sent the letter', flaw: D.FLAWS[0],
      looseEnds: ks.map(k => ({ kind: k, text: D.LOOSE_ENDS[k].options[0] }))
    }, { seed });
  }, { seed: opts.seed === undefined ? 12345 : opts.seed, kinds: opts.kinds, bgIndex: opts.bgIndex, name: opts.name });
  await page.waitForSelector('#screen-game.active');
}

const stateJson = page => page.evaluate(() => JSON.stringify(Game.state));

/* Data-driven fixtures: every id and name a test needs comes from Game.data
   or Game.state, never from one particular town, so the suites keep working
   when the town is swapped (docs/BUILD_PLAN.md, setting change). */
function fixtures(page) {
  return page.evaluate(() => {
    const D = Game.data;
    const T = D.TOWN_DATA;
    const ofType = types => { for (const t of types) { const l = T.locations.find(x => x.type === t); if (l) return { id: l.id, name: l.name, type: l.type }; } return null; };
    return {
      town: T.name,
      currency: T.currency || null,
      gateBg: D.BACKGROUNDS.findIndex(b => b.arrival === 'gate'),
      docksBg: D.BACKGROUNDS.findIndex(b => b.arrival === 'docks'),
      start: T.startLocationIds,
      tavern: ofType(['tavern', 'bar']),
      watch: ofType(['police', 'watch']),
      slum: ofType(['slum', 'trailerpark'])
    };
  });
}
/* A place and phase (in the running game) where enough NPCs are present who
   match the filter, with names the mock parser can tell apart. opts: { min,
   watchy (true/false), minAtt (exclusive), maxAtt, rumour (has an unheard
   rumour), notTypes }. Resolves to { loc, phase, npcs } or null. */
function findScene(page, opts) {
  return page.evaluate(o => {
    const G = Game;
    const st = G.state;
    const watchy = n => (n.tags || []).some(t => t === 'watch' || t === 'police') || /\b(watch|police|deputy|sheriff|officer|constable|trooper|cop)/i.test(n.role);
    const risky = /\b(look|examine|rest|sleep|wait|go|walk|head|run|enter|attack|hit|fight|insult|mock|buy|try|my)\b/i;
    for (const l of st.locations) {
      if (l.closed || (o.notTypes || []).includes(l.type)) continue;
      for (const ph of ['morning', 'afternoon', 'evening', 'night']) {
        const here = G.State.npcsAt(l.id, ph);
        const npcs = here.filter(n => (o.watchy === undefined || watchy(n) === o.watchy)
          && (o.minAtt === undefined || n.attitude > o.minAtt) && (o.maxAtt === undefined || n.attitude <= o.maxAtt)
          && (!o.rumour || st.rumours.some(r => !r.heard && r.sourceNpcId === n.id))
          && !risky.test(n.name)
          && here.every(m => m === n || !G.Town.mentions(n.name.toLowerCase(), m)));
        if (npcs.length >= (o.min || 1)) return { loc: { id: l.id, name: l.name, type: l.type, description: l.description }, phase: ph, npcs: npcs.map(n => ({ id: n.id, name: n.name, role: n.role, attitude: n.attitude })), presentIds: here.map(n => n.id) };
      }
    }
    return null;
  }, opts || {});
}
/* Put the player somewhere at a given phase without a turn (engine writes). */
function place(page, locId, phase) {
  return page.evaluate(([locId, phase]) => {
    const G = Game;
    if (phase) while (G.state.time.phase !== phase) G.State.apply({ advanceTime: 'long' });
    if (locId) G.State.apply({ playerLocationId: locId });
  }, [locId, phase]);
}

/* The running game made over as a game from before the full cast (rules
   version 6): only the people the town's story names (threads, rumours,
   clock effects) and anyone tied to a loose end stay, the cast's homes the
   player has not found are gone (so those people are nowhere in the phases
   they spent at home), and nobody has relations or a home on record; not
   castFixed. Nor does it have what rules version 7 brought (a lived-in
   town): no ages or histories on people, no details, hours or history on
   places, no age for the player, and none of the dead, the far away or the
   places out of town (they are not in the stories the kept people come
   from). For the engine's older paths (a home someone names becomes a
   new place, a person the story names, fixPeople) and for older saves.
   opts.town: also make the game's own copy of the town match (State.town),
   as an older save carries. Resolves to the ids of the people kept. */
function legacyTown(page, opts) {
  return page.evaluate(o => {
    const LIVED = { people: ['age', 'presence', 'history', 'where', 'reach', 'died', 'buried'], places: ['away', 'distance', 'details', 'hours', 'history', 'aka'] };
    const G = Game;
    const st = G.state;
    const T = G.data.TOWN_DATA;
    const keep = new Set((st.player.looseEnds || []).map(le => le.npcId));
    for (const t of T.threads) for (const id of t.linkedIds) keep.add(id);
    for (const r of T.rumours) keep.add(r.sourceNpcId);
    for (const f of T.factions) for (const c of f.clocks) for (const e of c.onComplete.effects) {
      if (e.npcId) keep.add(e.npcId);
      if (e.rumour) keep.add(e.rumour.sourceNpcId);
      if (e.seed && e.seed.trigger && e.seed.trigger.type === 'npc') keep.add(e.seed.trigger.value);
    }
    const gone = new Set(st.locations.filter(l => l.discovered === false).map(l => l.id));
    st.npcs = st.npcs.filter(n => keep.has(n.id));
    st.locations = st.locations.filter(l => !gone.has(l.id));
    for (const l of st.locations) {
      l.exits = l.exits.filter(x => !gone.has(x));
      for (const p of Object.keys(l.npcIdsBySchedule)) l.npcIdsBySchedule[p] = l.npcIdsBySchedule[p].filter(id => keep.has(id));
    }
    for (const n of st.npcs) { delete n.relations; delete n.home; for (const k of LIVED.people) delete n[k]; }
    for (const l of st.locations) for (const k of LIVED.places) delete l[k];
    delete st.player.age;
    delete st.meta.castFixed;
    if (o && o.town) {
      const t = G.State.town;
      t.npcs = t.npcs.filter(n => keep.has(n.id)).map(n => { const c = Object.assign({}, n); delete c.relations; delete c.home; for (const k of LIVED.people) delete c[k]; return c; });
      t.locations = t.locations.filter(l => !gone.has(l.id)).map(l => { const c = Object.assign({}, l, { exits: l.exits.filter(x => !gone.has(x)), npcIdsBySchedule: Object.fromEntries(Object.entries(l.npcIdsBySchedule).map(([p, ids]) => [p, ids.filter(id => keep.has(id))])) }); for (const k of LIVED.places) delete c[k]; return c; });
      delete t.offstage;
      for (const k of ['year', 'history', 'recent']) delete t[k];
    }
    return st.npcs.map(n => n.id);
  }, opts || {});
}

/* Type into the composer and send with Enter; wait until the turn is over. */
async function sendText(page, text) {
  await page.fill('#cmd', text);
  await page.press('#cmd', 'Enter');
  await page.waitForFunction(() => !Game.Pipeline.busy);
}

/* Everything that sticks out horizontally at the given width. */
function overflowReport(page, width) {
  return page.evaluate(w => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > w) out.push('documentElement.scrollWidth=' + de.scrollWidth);
    if (document.body.scrollWidth > w) out.push('body.scrollWidth=' + document.body.scrollWidth);
    // Inside a box that scrolls sideways on purpose (the phone's Say row) and is itself on screen, content is scrolled, not overflowing.
    const scrolledInside = el => {
      for (let p = el.parentElement; p && p.id !== 'app'; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'auto' && ox !== 'scroll') continue;
        const pr = p.getBoundingClientRect();
        if (pr.left >= -1 && pr.right <= w + 1) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('#app *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if ((r.right > w + 1 || r.left < -1) && !scrolledInside(el)) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ').join('.') : ''} [${Math.round(r.left)}, ${Math.round(r.right)}]`);
    }
    for (const el of document.querySelectorAll('.page, .feed-scroll, .panel-body')) {
      if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) out.push(`horizontal scroll inside ${el.id || el.className}`);
    }
    return out;
  }, width);
}

module.exports = { suite, quickStart, legacyTown, stateJson, sendText, overflowReport, fixtures, findScene, place, ROOT, GAME_PATH, GAME_URL, LAPTOP, PHONE };
