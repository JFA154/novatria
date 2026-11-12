#!/usr/bin/env node
'use strict';
/* The 21-day relationship simulator (docs/RELATIONSHIPS_PLAN.md section 8;
   the integration plan's 15.2): three canned playstyles, each a script of
   Pipeline.submit lines with the mock's parses and bookkeeper events
   queued, played headless in mock mode, printing each involved person's
   six tracks (liking, trust, fear, knows, spark, owed), stance and tags
   every morning. Skipped by run.cjs (no ".test."); an 8-day cut of each
   band runs in tests/wave30-rel-people.test.cjs as the CI guard, so tuning
   (B3) cannot break them silently.

   - beer: a round nightly at the Low Water for Royce Pittman and Curtis
     Pruett. Neither ever passes "warm to you" and neither's trust moves.
   - confidant: afternoons with Royce from Day 2, a confidence each way on
     Day 4, and on Day 5 the player keeps quiet when Elbert Gentry asks how
     Royce will vote. Trust 30 and knows 25 with Royce by Day 6; the staged
     version (the "kept word" with nobody else there) does not get there.
   - brawler: fights at the Low Water on Days 2, 4 and 6 only (Wade Purvis
     each time), two regulars watching. Wade is never "afraid of you" and
     reaches "hates you" with its reason; the regulars recover by the
     wound clock (BRAWL: the design's -12 on Day 14, -7 on Day 21 and -13
     for a grudging one, at the code's witness row for a fight).

   Usage: node tests/relationships-sim.cjs [beer|confidant|brawler] [--assert] [--days N]
   (all three when none is named; --assert exits 1 when a band fails). */
const path = require('path');
const { chromium } = require('playwright');

const GAME_URL = 'file://' + path.resolve(__dirname, '..', 'town.html');
const STYLES = ['beer', 'confidant', 'brawler'];
/* The regulars' recovery, pinned at the code's arithmetic (the plan's rule
   for the worked examples: the code's number is pinned and the design
   appendix corrected). Design Appendix D assumed a fight seen leaves -8
   (the beat-down's witness row alone); wave 27's witness copy is one a
   scene with every blow seen added (-5, -5, -8: -18, as example 4 pins),
   so each band is the design's x 18/8 on the same clocks: -12 is -27 on
   Day 14, -7 is -17 on Day 21, and the grudging regular's -13 is -30. */
const BRAWL = Object.freeze({ day7: [-44, 3], day14: [-27, 2], day21: [-17, 2], grudging21: [-30, 2] });

/* The page side: helpers on window.__sim, one call a day. */
function install(page) {
  return page.evaluate(() => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel;
    M.delay = 0;
    const away = 'loc_front_street';
    const sim = window.__sim = {
      rows: [], notes: {},
      // The player at a place with these people there, now; everyone else there is sent up the street.
      put(loc, ids) {
        S.apply({ playerLocationId: loc });
        if (ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: loc })) });
        const others = S.npcsAt(loc).map(n => n.id).filter(id => !ids.includes(id));
        if (others.length) S.apply({ visits: others.map(id => ({ npcId: id, locationId: away })) });
      },
      async say(to, words, parse, book, narration) {
        M.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
        if (narration) M.queue('narrate', { text: narration });
        if (book) M.queue('bookkeep', book);
        return G.Pipeline.submit(words, { mode: 'say', to });
      },
      async hit(id, name) {
        for (let i = 0; i < 3; i++) {
          M.queue('parse', { actionType: 'attack', summary: `Hits ${name}`, targets: [id], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
          G.Pipeline.hooks.nextTier = 'success';
          await G.Pipeline.submit(`I hit ${name}`);
        }
      },
      // To the play phase of the day (ticks run), and on to the next morning by sleeping (relDay, the grudges).
      until(phase) { let k = 0; while (G.state.time.phase !== phase && k++ < 4) G.Pipeline.passTime({ cost: 'long', cause: 'wait' }, 'wait'); },
      sleep() { const d = G.state.time.day; let k = 0; while (G.state.time.day === d && k++ < 6) G.Pipeline.passTime({ cost: G.state.time.phase === 'night' ? 'rest' : 'long', cause: G.state.time.phase === 'night' ? 'rest' : 'wait' }, G.state.time.phase === 'night' ? 'rest' : 'wait'); },
      row(ids) {
        const d = G.state.time.day;
        for (const id of ids) {
          const n = S.npc(id);
          const t = R.tracksOf(n);
          const st = R.stance(n);
          sim.rows.push({ day: d, id, name: n.name, w: t.w, t: t.t, f: t.f, k: t.k, s: t.s, owed: t.owed, stance: st.phrase, tags: st.tags, why: st.why.map(x => x.text), start: n.rel.start.w });
        }
      },
      grudges(id) { return G.state.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === id).map(sd => ({ day: sd.trigger.value, turn: sd.turn })); }
    };
    // A regular for the brawler: an adult in town, not hard, not the police, never a minor, with grudge-holding r (0, or -2).
    sim.regular = r => G.state.npcs.filter(n => n.alive !== false && G.presenceOf(n) === 'here' && !R.isMinor(n) && !R.isPoliceNpc(n) && !R.axesOf(n).hard && R.axesOf(n).r === r && !['npc_wade', 'npc_royce', 'npc_curtis', 'npc_elbert'].includes(n.id) && n.status === 'free').map(n => n.id)[0] || null;
  });
}

/* One day of a playstyle (the morning row first). Returns nothing; rows build up on the page. */
function day(page, style, d, opts) {
  return page.evaluate(async ([style, d, staged]) => {
    const G = Game, S = G.State, sim = window.__sim;
    const people = sim.notes.people;
    sim.row(people);
    if (style === 'beer') {
      sim.until('evening');
      sim.put('loc_low_water', ['npc_royce', 'npc_curtis']);
      for (const [id, name] of [['npc_royce', 'Royce'], ['npc_curtis', 'Curtis']]) {
        await G.Pipeline.submit(`I hand ${name} $5 for a round`);
        await sim.say(id, 'Here is to a slow night.');
      }
    } else if (style === 'confidant') {
      sim.until('afternoon');
      const elbert = d === 5 && !staged;
      sim.put('loc_low_water', elbert ? ['npc_royce', 'npc_elbert'] : ['npc_royce']);
      if (d >= 2 && d <= 5) {
        if (d === 4) {
          await sim.say('npc_royce', 'Carter wrote you a note about the station?', null, { socialEvents: ['npc_royce they_confided: told me about the note Carter wrote on the station', 'npc_royce confided: I told him why I really came to town'] });
        } else if (d === 5) {
          await sim.say('npc_royce', 'I would not say.', null, { socialEvents: ['npc_royce kept_word: kept quiet when Elbert asked how I\'d vote'] },
            staged ? 'Royce Pittman nods slowly. "Carter asked me and I told him nothing," you say, and he lets out a breath.' : 'Elbert Gentry leans over from the card table. "So how\'s Royce going to vote?" he asks you. You say nothing, and Royce lets out a breath.');
        } else await sim.say('npc_royce', 'Quiet afternoon.');
      } else if (d > 5) await sim.say('npc_royce', 'Quiet afternoon.');
    } else if (style === 'brawler') {
      sim.until('evening');
      const watch = sim.notes.watch;
      if ([2, 4, 6].includes(d)) {
        sim.put('loc_low_water', ['npc_wade'].concat(watch));
        await sim.hit('npc_wade', 'Wade Purvis');
        sim.notes.fights = (sim.notes.fights || []).concat([d]);
        if (G.state.player.hp < G.state.player.maxHp) S.apply({ hpDelta: G.state.player.maxHp - G.state.player.hp });
      } else sim.put('loc_motor_court', []);
    }
    // Wherever the night left them, the player sleeps and the next morning comes.
    sim.sleep();
  }, [style, d, !!(opts && opts.staged)]);
}

async function runSim(browser, style, opts) {
  const o = Object.assign({ days: 21 }, opts || {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.route('**/*', r => (/^(file|blob|data):/.test(r.request().url()) ? r.continue() : r.abort()));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(GAME_URL);
    await page.waitForFunction(() => window.Game && window.Game.App);
    await page.evaluate(seed => {
      const D = Game.data;
      const bg = D.BACKGROUNDS[0];
      // Wave 37, Creator Mode, milestone 8 (task M8-B): Low Water is rated adult; the 18+ yes first, as tests/helpers.cjs gives it, or every turn is refused.
      Game.Storage.savePerPack('low-water', { adultOk: true });
      Game.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0], looseEnds: [] }, { seed });
    }, o.seed || 2026);
    await install(page);
    await page.evaluate(style => {
      const S = Game.State, sim = window.__sim;
      if (style === 'beer') sim.notes.people = ['npc_royce', 'npc_curtis'];
      if (style === 'confidant') sim.notes.people = ['npc_royce'];
      if (style === 'brawler') {
        // Two regulars: one even (grudge-holding 0) and one made grudging (-2: the cast has nobody both grudging and not hard), as the design's band has them.
        const even = sim.regular(0);
        const other = Game.state.npcs.find(n => n.id !== even && Game.Rel.axesOf(n).r === 0 && !Game.Rel.axesOf(n).hard && !Game.Rel.isMinor(n) && !Game.Rel.isPoliceNpc(n) && Game.presenceOf(n) === 'here' && n.status === 'free' && !['npc_wade', 'npc_royce', 'npc_curtis', 'npc_elbert'].includes(n.id));
        const copy = other && Game.State.town && Array.isArray(Game.State.town.npcs) ? Game.State.town.npcs.find(x => x.id === other.id) : null;
        if (copy) copy.axes = Object.assign({}, copy.axes || {}, { r: -2 });
        sim.notes.watch = [even, copy ? other.id : null].filter(Boolean);
        sim.notes.people = ['npc_wade'].concat(sim.notes.watch);
      }
      S.apply({ npcKnownToPlayer: sim.notes.people.concat(['npc_elbert']) });
    }, style);
    for (let d = 1; d <= o.days; d++) {
      const now = await page.evaluate(() => Game.state.time.day);
      if (now !== d) await page.evaluate(d => Game.State.apply({ setTime: { day: d, phase: 'morning' } }), d);
      await day(page, style, d, o);
    }
    await page.evaluate(() => window.__sim.row(window.__sim.notes.people));
    const out = await page.evaluate(() => ({ rows: window.__sim.rows, notes: window.__sim.notes, grudges: Object.fromEntries(window.__sim.notes.people.map(id => [id, window.__sim.grudges(id)])) }));
    out.errors = errors;
    return out;
  } finally {
    await context.close();
  }
}

/* The bands (design Appendix D, the plan's section 8), for the days the run reached. Returns [{ ok, what }]. */
function bands(style, run, staged) {
  const rows = run.rows;
  const at = (id, d) => rows.filter(r => r.id === id && r.day === d).pop() || null;
  const last = Math.max(...rows.map(r => r.day));
  const out = [];
  const check = (ok, what) => out.push({ ok: !!ok, what });
  if (style === 'beer') {
    for (const id of ['npc_royce', 'npc_curtis']) {
      const mine = rows.filter(r => r.id === id);
      const t0 = mine[0].t;
      check(mine.every(r => ['warm to you', 'friendly', 'sizing you up', "doesn't know you", 'cool to you', 'takes you at your word'].includes(r.stance) && r.stance !== 'in your corner' && r.stance !== 'loyal to you'), `${id} never passes "warm to you" (${Array.from(new Set(mine.map(r => r.stance))).join(', ')})`);
      check(mine.every(r => r.t === t0), `${id}'s trust never moves (${Array.from(new Set(mine.map(r => r.t))).join(', ')})`);
    }
  } else if (style === 'confidant') {
    const r6 = at('npc_royce', Math.min(6, last));
    if (last >= 6) {
      if (staged) check(r6 && !(r6.t >= 30 && r6.k >= 25), `staged: Royce does not reach trust 30 and knows 25 by Day 6 (t ${r6 && r6.t}, k ${r6 && r6.k})`);
      else check(r6 && r6.t >= 30 && r6.k >= 25, `Royce reaches trust 30 and knows 25 by Day 6 (t ${r6 && r6.t}, k ${r6 && r6.k})`);
    }
  } else if (style === 'brawler') {
    const wade = rows.filter(r => r.id === 'npc_wade');
    check(wade.every(r => r.stance !== 'afraid of you' && r.f <= 39), `Wade is never "afraid of you" (fear at most ${Math.max(...wade.map(r => r.f))})`);
    if (last >= 7) { const w7 = wade.filter(r => r.day >= 7); check(w7.some(r => r.stance === 'hates you' && r.why.length > 0), `Wade reaches "hates you" with its reason (${Array.from(new Set(w7.map(r => r.stance))).join(', ')})`); }
    check(JSON.stringify(run.notes.fights || []) === JSON.stringify([2, 4, 6].filter(d => d <= last)), `fights on Days 2, 4 and 6 only (${(run.notes.fights || []).join(', ')})`);
    const [even, grudging] = run.notes.watch || [];
    const delta = (id, d) => { const r = at(id, d); return r ? r.w - r.start : null; };
    const band = (id, d, [want, pm], what) => { const v = delta(id, d); check(v !== null && Math.abs(v - want) <= pm, `${what}: liking ${v} from start on Day ${d} (${want} +/- ${pm})`); };
    if (even && last >= 7) band(even, 7, BRAWL.day7, 'a regular who saw all three, the morning after the last');
    if (even && last >= 14) band(even, 14, BRAWL.day14, 'a regular who saw all three');
    if (even && last >= 21) band(even, 21, BRAWL.day21, 'a regular who saw all three');
    if (grudging && last >= 21) band(grudging, 21, BRAWL.grudging21, 'a grudging regular (grudge-holding -2)');
    // Bystanders recover, the man it happened to does not.
    if (even && last >= 14) check(delta(even, last) > delta(even, 7), `the regular recovers (${delta(even, 7)} on Day 7, ${delta(even, last)} on Day ${last})`);
  }
  return out;
}

function table(run) {
  const lines = [];
  for (const r of run.rows) lines.push(`Day ${String(r.day).padStart(2)}  ${r.name.padEnd(18)} w ${String(r.w).padStart(4)} t ${String(r.t).padStart(4)} f ${String(r.f).padStart(3)} k ${String(r.k).padStart(3)} s ${String(r.s).padStart(3)} owed ${String(r.owed).padStart(2)}  ${r.stance}${r.tags.length ? ' · ' + r.tags.join(', ') : ''}`);
  return lines.join('\n');
}

module.exports = { runSim, bands, table, STYLES, BRAWL };

if (require.main === module) {
  const args = process.argv.slice(2);
  const want = args.filter(a => STYLES.includes(a));
  const assertOn = args.includes('--assert');
  const di = args.indexOf('--days');
  const days = di >= 0 ? parseInt(args[di + 1], 10) || 21 : 21;
  (async () => {
    const browser = await chromium.launch();
    let bad = 0;
    try {
      for (const style of want.length ? want : STYLES) {
        const runs = style === 'confidant' ? [[false, await runSim(browser, style, { days })], [true, await runSim(browser, style, { days, staged: true })]] : [[false, await runSim(browser, style, { days })]];
        for (const [staged, run] of runs) {
          console.log(`\n=== ${style}${staged ? ' (staged)' : ''}, ${days} days ===`);
          console.log(table(run));
          if (run.errors.length) { console.log('page errors: ' + run.errors.join(' | ')); bad += 1; }
          for (const c of bands(style, run, staged)) { console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.what}`); if (!c.ok) bad += 1; }
        }
      }
    } finally { await browser.close(); }
    if (assertOn && bad) process.exit(1);
  })().catch(e => { console.error(e); process.exit(1); });
}
