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

   Wave 38: two more, for the largest untuned surface (waves 33 to 35's
   romance, wave 29's leverage). Every roll they make lands at a set tier
   (Pipeline.hooks.nextTier), so the bands measure the arithmetic, not the
   dice.
   - romance: a courtship of Tyler Rasberry (normal to win over: spark
     rate 0.8, opens at knows 15) at the Low Water every evening to Day 14
     (a word, a $5 drink every third day, one thing of substance an
     evening: a confidence each way, a favour, a word kept when his cousin
     asks; a flirt a day, from Day 8 the night asked for until it is yes),
     then seven days apart; the charm rolls land success but for a failure
     on Day 5 and a partial on Day 7. No welcome before his opensAt; spark
     and romance rise only on a welcome answer, +8 and +2 a flirt; the
     night (Day 12) no earlier than the day all four of GATES.intimate are
     met; romance 58 on Day 15 falls 14 +/- 3 by Day 22 (FADE). Three more
     runs of the same lines: at Kaylee Pittman (16), no spark, no romance,
     no answer, the minor rule's row every time and the full row with a
     report for the night; with Tyler threatened to fear 40 from Day 7, and
     with his secret held from Day 3, the night never opens and compliance
     never fires, each also asking the night as a walk to the motor court
     (a motel). Two of those bands wait on wave 40 (the walk is no ask, so
     fear never makes it coercion, and intimateGate reads neither fear nor
     leverage): PENDING, skipped unless --pending.
   - blackmailer: every adult whose secret can be shown (two leverageKeys)
     talked round three an evening (Days 1 to 7, the secret let slip, the
     bookkeeper's learned_secret), $300 demanded of each the evening it is
     learned and every third evening after; a lie a witness catches (Day 2)
     and two threats at them (Days 3 and 4); Royce's paid-for secret told
     on Day 6. $1700 from 13 payers by Day 8 (EXTRACT; the plan's "about
     $900" is a band PENDING the owner's B3 tuning); paid_silence terminal
     per person; repeat demands compound harm and plant grudges or
     reports; the witness's report spends what they held over the player;
     Royce's police bar holds while his record is live and lifts after
     the day it is spent.

   Usage: node tests/relationships-sim.cjs [beer|confidant|brawler|romance|blackmailer] [--assert] [--days N] [--pending]
   (all five when none is named; --assert exits 1 when a band fails;
   --pending runs the bands that wait on another wave as bands). */
const path = require('path');
const { chromium } = require('playwright');

const GAME_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const STYLES = ['beer', 'confidant', 'brawler', 'romance', 'blackmailer'];
const NEW_STYLES = ['romance', 'blackmailer'];
/* The regulars' recovery, pinned at the code's arithmetic (the plan's rule
   for the worked examples: the code's number is pinned and the design
   appendix corrected). Design Appendix D assumed a fight seen leaves -8
   (the beat-down's witness row alone); wave 27's witness copy is one a
   scene with every blow seen added (-5, -5, -8: -18, as example 4 pins),
   so each band is the design's x 18/8 on the same clocks: -12 is -27 on
   Day 14, -7 is -17 on Day 21, and the grudging regular's -13 is -30. */
const BRAWL = Object.freeze({ day7: [-44, 3], day14: [-27, 2], day21: [-17, 2], grudging21: [-30, 2] });
/* Wave 38: the courtship's plan (romance) and the four runs of it. */
const ROMANCE = Object.freeze({ target: 'npc_tyler', minor: 'npc_kaylee', contactDays: 14, nightFrom: 8, threatFrom: 7, tiers: Object.freeze({ 5: 'failure', 7: 'partial' }),
  substance: Object.freeze(['they_confided', 'confided', 'did_favour', 'kept_word']) });
const ROMANCE_VARIANTS = Object.freeze([null, 'minor', 'fear', 'leverage']);
// Wave 38: the blackmailer's plan.
const BLACKMAIL = Object.freeze({ learnPerDay: 3, againDays: 3, exposeDay: 6, exposed: 'npc_royce', liftDays: 1 });
/* Wave 38: the pins, at the code's arithmetic as measured (the plan's rule
   for the worked examples). FADE: the courtship's romance on the first
   morning with no contact (Day 15) and on Day 22, after seven days apart
   (58 to 44: the bond clock, half-life 14, plus the everyday drift of 1 a
   day). EXTRACT: what the blackmailer takes, all of it by Day 8 (every
   payer pays once, the next morning): $1700 from 13 people, against the
   plan's "at most about $900" (PLAN_CAP: a band pending the owner's B3
   tuning). */
const FADE = Object.freeze({ from: 15, to: 22, at: [58, 3], drop: [14, 3] });
const EXTRACT = Object.freeze({ byDay: 8, total: [1700, 100], payers: 13 });
const PLAN_CAP = 900;

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
          sim.rows.push({ day: d, id, name: n.name, w: t.w, t: t.t, f: t.f, k: t.k, s: t.s, m: t.m, owed: t.owed, stance: st.phrase, tags: st.tags, why: st.why.map(x => x.text), start: n.rel.start.w });
        }
      },
      grudges(id) { return G.state.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === id).map(sd => ({ day: sd.trigger.value, turn: sd.turn })); },
      // Wave 38: wait for a turn still running (a scene the last one set going) before the next line.
      async idle() { let k = 0; while (G.Pipeline.busy && k++ < 500) await new Promise(r => setTimeout(r, 10)); },
      /* Wave 38: a romantic line (a flirt; the night asked as a Say or as a
         walk to a motel room), the gate and the tracks before it, and what
         the engine answered (lastTurn's romance step), kept in notes.asks. */
      async romantic(to, words, parse, book) {
        await sim.idle();
        const n0 = S.npc(to), turn0 = G.state.meta.turn;
        const before = R.tracksOf(n0), gate = R.intimateGate(n0), opens = R.welcomeOf(n0), held = R.holdsOver(n0).length;
        const p = Object.assign({ romantic: 'flirt' }, parse || {});
        // The charm roll a flirt makes lands at the plan's tier for the day (success unless the plan says otherwise); a line that rolls nothing leaves no tier behind.
        G.Pipeline.hooks.nextTier = sim.notes.tier || 'success';
        if (p.actionType === 'move') {
          M.queue('parse', Object.assign({ summary: words, targets: [to], needsRoll: false, timeCost: 'short' }, p));
          if (book) M.queue('bookkeep', book);
          await G.Pipeline.submit(words);
        } else await sim.say(to, words, p, book);
        G.Pipeline.hooks.nextTier = null;
        const t = G.Pipeline.lastTurn;
        const c = t && t.ctx && G.state.meta.turn > turn0 ? t.ctx : {};
        const r = c.romance || null;
        const n = S.npc(to), after = R.tracksOf(n);
        const answer = !r ? 'none' : r.intimate.includes(to) ? 'yes' : r.coercion && r.coercion.npcId === to ? 'coerced' : r.welcome.includes(to) ? 'welcome'
          : r.flirts.some(f => f.npcId === to && f.ans.answer === 'no') ? 'no' : r.answers.includes(to) ? 'aside' : 'none';
        const rec = { day: G.state.time.day, kind: p.actionType === 'move' ? 'move' : p.romantic, words, answer, tier: t && t.roll && c.romance ? t.roll.tier || null : null,
          before, after, gate: gate.ok, short: gate.short, opens: opens.ok, held, complied: !!c.complied, coerced: !!c.coerced,
          night: (n.memories || []).some(m => m && m.event === 'intimate' && m.turn > turn0),
          // Someone under 18: which row of the minor rule the turn sent (the light one, or the full one with its consequences), and the reports it planted.
          minorRow: ((S.debugLog.filter(x => x.turn > turn0 && x.kind === 'rel' && /is under 18: the (full|light) row/.test(x.text || '') && x.text.indexOf(to) === 0).pop() || {}).text || '').replace(/^.*?: the (full|light) row.*$/, '$1') || null,
          reports: G.state.seeds.filter(sd => sd.turn > turn0 && sd.origin && sd.origin.kind === 'report' && sd.origin.why === 'advance').length };
        (sim.notes.asks = sim.notes.asks || []).push(rec);
        return rec;
      }
    };
    // A regular for the brawler: an adult in town, not hard, not the police, never a minor, with grudge-holding r (0, or -2).
    sim.regular = r => G.state.npcs.filter(n => n.alive !== false && G.presenceOf(n) === 'here' && !R.isMinor(n) && !R.isPoliceNpc(n) && !R.axesOf(n).hard && R.axesOf(n).r === r && !['npc_wade', 'npc_royce', 'npc_curtis', 'npc_elbert'].includes(n.id) && n.status === 'free').map(n => n.id)[0] || null;
  });
}

/* Wave 38: the two new playstyles' days, on the page beside install's helpers. */
function installNew(page) {
  return page.evaluate(plan => {
    /* A courtship (the romance playstyle, every variant the same lines):
       evenings at the Low Water up to Day plan.contactDays, a word, a $5
       drink every third day, one thing of substance an evening from Day 2
       (plan.substance in turn: a confidence of theirs, one of the
       player's, a favour, a word kept when Tyler's cousin Brianna asks),
       and one romantic line a day at the day's tier (plan.tiers): a flirt,
       or from Day plan.nightFrom the night asked for until it is yes. After that the player stays away (the
       fade). fear: the player threatens them each evening from Day
       plan.threatFrom until their fear is 40 before asking; leverage: the
       player learns their secret on Day 3 (a talk that works, the
       narration showing two of its keys). Both coercion variants also ask
       the night as a walk to the motor court (a motel: the walk that wave
       40 closes). */
    window.__simRomanceDay = async (G, S, sim0, d, variant) => {
      const sim = Object.assign(Object.create(sim0), { say: async (...a) => { await sim0.idle(); return sim0.say(...a); } });
      const R = G.Rel, T = sim.notes.target, nm = sim.notes.first, him = sim.notes.him;
      if (d > plan.contactDays) { sim.until('evening'); sim.put('loc_old_bridge', []); return; }
      sim.until('evening');
      sim.notes.tier = plan.tiers[d] || 'success';
      sim.put('loc_low_water', d >= 2 && plan.substance[(d - 2) % plan.substance.length] === 'kept_word' ? [T, 'npc_brianna'] : [T]);
      await sim.say(T, 'Slow night?');
      if (d % 3 === 2) { await sim0.idle(); await G.Pipeline.submit(`I hand ${nm} $5 for a drink`); }
      // One thing of substance an evening from Day 2, in turn: a confidence of theirs, one of the player's, a favour, a word kept when the target's cousin asks.
      const what = d >= 2 ? plan.substance[(d - 2) % plan.substance.length] : null;
      if (what === 'they_confided') await sim.say(T, 'Where did you grow up?', null, { socialEvents: [`${T} they_confided: told me about growing up out at Riverbend (${d})`] });
      if (what === 'confided') await sim.say(T, 'I will tell you something.', null, { socialEvents: [`${T} confided: I told ${him} why I really came to town (${d})`] });
      if (what === 'did_favour') await sim.say(T, 'Let me carry those for you.', null, { socialEvents: [`${T} did_favour: carried the cases in from the truck for me (${d})`] });
      if (what === 'kept_word') {
        await sim.say(T, 'That stays between us.', null, { socialEvents: [`${T} kept_word: kept quiet when Brianna asked what I told about Riverbend`] },
          `Brianna Tolliver leans in from the next stool. "What's ${nm} been telling you about Riverbend?" she asks. You shrug and say nothing, and ${nm} lets out a breath.`);
      }
      if (variant === 'leverage' && d === 3) {
        G.Pipeline.forceNextRoll(18);
        await sim.say(T, 'What does that camera out front catch?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
          { socialEvents: [`${T} learned_secret: keeps the camera's clips on a thumb drive`] },
          `${nm} glances at the door. "That camera catches the whole lot," ${sim.notes.he} mutters. "I keep the clips on a thumb drive."`);
      }
      if (variant === 'fear' && d >= plan.threatFrom) {
        for (let k = 0; k < 3 && R.tracksOf(S.npc(T)).f < 40; k++) {
          G.Pipeline.hooks.nextTier = 'success';
          await sim.say(T, 'Keep your mouth shut about me, or you will be sorry.', { actionType: 'intimidate', needsRoll: true, stat: 'might', difficulty: 'normal' });
          G.Pipeline.hooks.nextTier = null;
          (sim.notes.threats = sim.notes.threats || []).push([d, R.tracksOf(S.npc(T)).f]);
        }
      }
      if (d >= plan.nightFrom && !sim.notes.night) {
        if (variant === 'fear' || variant === 'leverage') {
          const walk = await sim.romantic(T, `I walk ${nm} back to my room at the motor court.`, { actionType: 'move', destinationId: 'loc_motor_court', romantic: 'more' });
          if (walk.night) { sim.notes.night = d; return; }
          sim.put('loc_low_water', [T]);
        }
        const ask = await sim.romantic(T, 'Come back to my room with me tonight?', { romantic: 'more' });
        if (ask.night) sim.notes.night = d;
      } else await sim.romantic(T, 'You have a good laugh, you know that?');
    };
    /* The blackmailer: every adult here whose secret the story can show (two
       of its leverageKeys) and who can be held (the ceiling: every roll
       made lands at success, so this is the most a player can take). Each
       evening the player gets plan.learnPerDay more of them talking (a
       charm roll that works, the narration showing two keys, the
       bookkeeper's learned_secret); each evening the player demands $300
       of everyone held whose last demand is plan.againDays old or more
       (the first demand the evening it was learned, then again and
       again). Day 2 the player lies to a witness (no keys of their own) and
       is caught at it (caught_you_at: they hold it over the player), then
       threatens them Days 3 and 4 (fear 40: a report to whoever looks out
       for them, which spends what they hold). Day plan.exposeDay the player
       tells someone free to hear it what Royce Pittman paid to keep quiet
       (exposed: Royce's record spent, his police bar lifted). */
    window.__simBlackmailDay = async (G, S, sim0, d) => {
      const sim = Object.assign(Object.create(sim0), { say: async (...a) => { await sim0.idle(); return sim0.say(...a); } });
      const R = G.Rel, st = G.state, P = plan.blackmail;
      const heal = () => { if (st.player.hp < st.player.maxHp) S.apply({ hpDelta: st.player.maxHp - st.player.hp }); };
      const recOf = id => R.leverageOf().find(x => x.holder === 'player' && x.over === id && x.about && x.about.kind === 'secret') || null;
      const bar = sim.notes.bar = sim.notes.bar || [];
      const roy = S.npc(P.exposed);
      bar.push({ day: d, barred: R.policeBarred(roy), lifted: G.World.barLifted(roy, d), status: (recOf(P.exposed) || {}).status || null });
      sim.until('evening');
      // Learn: the next few on the list, one talk each.
      const todo = sim.notes.targets.filter(id => !recOf(id) && !(sim.notes.tried || []).includes(id)).slice(0, P.learnPerDay);
      for (const id of todo) {
        const n = S.npc(id), keys = R.keysOf(n);
        (sim.notes.tried = sim.notes.tried || []).push(id);
        sim.put('loc_low_water', [id]);
        G.Pipeline.hooks.nextTier = 'success';
        await sim.say(id, 'So what keeps you up at night?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
          { socialEvents: [`${id} learned_secret: let slip about the ${keys[0]} and the ${keys[1]}`] },
          `${n.name} lowers their voice and lets slip more than they meant to, about the ${keys[0]} and the ${keys[1]}.`);
        G.Pipeline.hooks.nextTier = null;
        if (recOf(id)) sim.notes.learned.push([d, id]);
      }
      // The witness: a lie they catch (Day 2), then two threats (Days 3 and 4).
      const W = sim.notes.witness;
      if (W && d === 2) {
        sim.put('loc_low_water', [W]);
        G.Pipeline.hooks.nextTier = 'success';
        await sim.say(W, 'I am with the county water board.', { actionType: 'deceive', needsRoll: true, stat: 'wits', difficulty: 'normal' },
          { socialEvents: [`${W} caught_you_at: caught me lying about being with the water board`] });
        G.Pipeline.hooks.nextTier = null;
      }
      if (W && (d === 3 || d === 4)) {
        sim.put('loc_low_water', [W]);
        G.Pipeline.hooks.nextTier = 'success';
        await sim.say(W, 'Keep your mouth shut about me, or you will be sorry.', { actionType: 'intimidate', needsRoll: true, stat: 'might', difficulty: 'normal' });
        G.Pipeline.hooks.nextTier = null;
        heal();
      }
      // Demand: everyone held, again every plan.againDays.
      for (const id of sim.notes.targets) {
        const rec = recOf(id);
        if (!rec || !R.LEV_LIVE.includes(rec.status)) continue;
        const last = sim.notes.demanded[id];
        if (last !== undefined && d - last < P.againDays) continue;
        const n = S.npc(id);
        if (!n || n.status !== 'free' || n.alive === false) continue;
        sim.notes.demanded[id] = d;
        sim.put('loc_low_water', [id]);
        const t0 = R.tracksOf(n), turn0 = st.meta.turn;
        G.Pipeline.hooks.nextTier = 'success';
        await sim.say(id, `Three hundred dollars by tomorrow, or Bell hears about the ${R.keysOf(n)[0]}.`, { actionType: 'intimidate', aboutIds: [rec.id], needsRoll: true, stat: 'might', difficulty: 'normal' });
        G.Pipeline.hooks.nextTier = null;
        const c = st.meta.turn > turn0 ? (G.Pipeline.lastTurn && G.Pipeline.lastTurn.ctx) || {} : null;
        sim.notes.demands.push({ day: d, id, answer: !c ? 'no turn' : c.backed ? c.backed.answer : 'unbacked', status: (recOf(id) || {}).status, w: [t0.w, R.tracksOf(S.npc(id)).w], t: [t0.t, R.tracksOf(S.npc(id)).t] });
        heal();
      }
      if (d === P.exposeDay) {
        // Whoever is free to hear it: an adult the player holds nothing over, not the witness.
        const L = st.npcs.find(n => n.alive !== false && G.presenceOf(n) === 'here' && n.status === 'free' && !R.isMinor(n) && !sim.notes.targets.includes(n.id) && n.id !== sim.notes.witness && !R.isPoliceNpc(n));
        sim.put('loc_low_water', [L.id]);
        await sim.say(L.id, 'You want to know what Royce paid me for?', null, { socialEvents: [`${L.id} exposed ${P.exposed}: told me what Royce Pittman paid to keep quiet`] });
        sim.notes.exposed = { day: d, to: L.id, status: (recOf(P.exposed) || {}).status };
      }
      heal();
    };
  }, Object.assign({ blackmail: BLACKMAIL }, ROMANCE));
}

/* One day of a playstyle (the morning row first). Returns nothing; rows build up on the page. */
function day(page, style, d, opts) {
  return page.evaluate(async ([style, d, staged, variant]) => {
    const romanceDay = window.__simRomanceDay, blackmailDay = window.__simBlackmailDay;
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
    } else if (style === 'romance') await romanceDay(G, S, sim, d, variant);
    else if (style === 'blackmailer') await blackmailDay(G, S, sim, d);
    // Wherever the night left them, the player sleeps and the next morning comes.
    sim.sleep();
  }, [style, d, !!(opts && opts.staged), (opts && opts.variant) || null]);
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
      Game.App.quickStart({ name: 'Tester', backgroundId: bg.id, stats: Object.assign({}, bg.stats), goal: 'Find out who sent the letter', flaw: D.FLAWS[0], looseEnds: [] }, { seed });
    }, o.seed || 2026);
    await install(page);
    await installNew(page);
    await page.evaluate(([style, variant, plan]) => {
      const S = Game.State, sim = window.__sim;
      if (style === 'beer') sim.notes.people = ['npc_royce', 'npc_curtis'];
      if (style === 'confidant') sim.notes.people = ['npc_royce'];
      if (style === 'romance') {
        const n = S.npc(variant === 'minor' ? plan.minor : plan.target);
        const f = n.pronouns === 'she' ? ['she', 'her'] : ['he', 'him'];
        Object.assign(sim.notes, { target: n.id, first: n.name.split(' ')[0], he: f[0], him: f[1], variant, people: [n.id] });
      }
      if (style === 'blackmailer') {
        // Everyone here who can be held: an adult in town, free, with two keys or more for the story to show.
        const R = Game.Rel;
        const here = Game.state.npcs.filter(n => n.alive !== false && Game.presenceOf(n) === 'here' && n.status === 'free' && !R.isMinor(n));
        const targets = here.filter(n => R.keysOf(n).length >= 2).map(n => n.id);
        // The witness: no keys of their own (never a target), not hard, not the police, someone looks out for them.
        const W = here.find(n => !targets.includes(n.id) && !R.axesOf(n).hard && !R.isPoliceNpc(n) && (R.protectorOf(n) || {}).ids && R.protectorOf(n).ids.length);
        Object.assign(sim.notes, { targets, witness: W ? W.id : null, gold0: Game.state.player.gold, learned: [], demanded: {}, demands: [], people: targets.concat(W ? [W.id] : []) });
      }
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
    }, [style, o.variant || null, ROMANCE]);
    for (let d = 1; d <= o.days; d++) {
      const now = await page.evaluate(() => Game.state.time.day);
      if (now !== d) await page.evaluate(d => Game.State.apply({ setTime: { day: d, phase: 'morning' } }), d);
      await day(page, style, d, o);
    }
    await page.evaluate(() => window.__sim.row(window.__sim.notes.people));
    if (style === 'blackmailer') {
      await page.evaluate(() => {
        // What the run took and what it left: each record, its demand, and the seeds the people it was over planted.
        const G = Game, R = G.Rel, sim = window.__sim, st = G.state;
        sim.notes.records = R.leverageOf().map(x => ({ id: x.id, holder: x.holder, over: x.over, status: x.status, weight: x.weight, demand: x.demand || null, knownBy: x.knownBy || [], log: (x.log || []).map(e => [e.day, e.status]) }));
        sim.notes.paid = st.npcs.map(n => [n.id, (n.memories || []).filter(m => m && m.event === 'paid_silence').length]).filter(x => x[1]);
        sim.notes.seeds = st.seeds.filter(sd => sd.origin && ['grudge', 'report', 'tell', 'price'].includes(sd.origin.kind)).map(sd => ({ id: sd.id, kind: sd.origin.kind, npcId: sd.origin.npcId, why: sd.origin.why || null, day: sd.trigger && sd.trigger.value, fired: !!sd.fired, tpl: Number.isInteger(sd.origin.template) ? G.data.GRUDGE_TEMPLATES[sd.origin.template].kind : null, protectors: sd.origin.protectors || [] }));
        sim.notes.gold = st.player.gold;
        sim.notes.status = Object.fromEntries(sim.notes.people.map(id => [id, G.State.npc(id).status]));
        sim.notes.payments = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'leverage').map(sd => ({ npcId: sd.origin.npcId, key: sd.origin.key, day: sd.trigger.value, fired: !!sd.fired, amount: ((sd.effects || []).find(e => e.op === 'playerGold') || {}).delta || 0 }));
      });
    }
    const out = await page.evaluate(() => ({ rows: window.__sim.rows, notes: window.__sim.notes, grudges: Object.fromEntries(window.__sim.notes.people.map(id => [id, window.__sim.grudges(id)])) }));
    out.errors = errors;
    // Wave 38: the new playstyles carry their style and romantic lines (the first three's output is as it was).
    if (NEW_STYLES.includes(style)) Object.assign(out, { style, variant: o.variant || null, asks: out.notes.asks || [] });
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
  } else if (style === 'romance') romanceBands(run, staged, last, at, check, (ok, what, why) => out.push({ ok: !!ok, what, pending: why }));
  else if (style === 'blackmailer') blackmailBands(run, last, check, (ok, what, why) => out.push({ ok: !!ok, what, pending: why }));
  return out;
}

const listOf = xs => Array.from(new Set(xs)).join(', ') || 'none';

/* Wave 38: the romance playstyle's bands (variant: null, the courtship;
   minor, the same lines at Kaylee; fear and leverage, the coercion
   checks). pending(ok, what, why): a band that waits on another wave,
   printed PENDING and skipped unless --pending. */
function romanceBands(run, variant, last, at, check, pending) {
  const asks = run.asks || [];
  const T = run.notes.target;
  const mine = run.rows.filter(r => r.id === T);
  const up = a => a.after.s > a.before.s || a.after.m > a.before.m;
  // Rises only on a welcome answer (or the night's yes), every variant; before the first welcome, nothing at all.
  check(asks.length > 0 && asks.every(a => !up(a) || ['welcome', 'yes'].includes(a.answer)), `spark and romance rise only on a welcome answer (the answers they rose on: ${listOf(asks.filter(up).map(a => a.answer))})`);
  const first = asks.find(a => ['welcome', 'yes'].includes(a.answer));
  check(mine.filter(r => !first || r.day <= first.day).every(r => r.s === 0 && r.m === 0), `no spark or romance before the first welcome (Day ${first ? first.day : 'never'})`);
  if (variant === 'minor') {
    check(mine.every(r => r.s === 0 && r.m === 0) && asks.every(a => a.answer === 'none' || a.answer === 'coerced'), `Kaylee: no spark, no romance and no answer, ever (answers: ${listOf(asks.map(a => a.answer))})`);
    check(asks.every(a => a.minorRow || a.answer === 'coerced'), `every romantic line at her sends the minor rule's row (${listOf(asks.map(a => a.minorRow ? `the ${a.minorRow} row` : a.answer))})`);
    const more = asks.filter(a => a.kind === 'more' && a.answer !== 'coerced');
    if (last >= ROMANCE.nightFrom) check(more.length > 0 && more.every(a => a.minorRow === 'full') && more[0].reports > 0, `the night asked of her is the full row, with a report to the law (Day ${more.length ? more[0].day : '-'}: ${more.length ? more[0].reports : 0} report seeds)`);
    check(asks.every(a => !a.night), 'never a night');
    return;
  }
  // Too soon: short of their opensAt there is no roll and no welcome.
  const soon = asks.filter(a => !a.opens);
  check(soon.length > 0 && soon.every(a => a.answer === 'aside' && !a.tier), `no welcome before their opensAt on knows (${soon.length} turned aside with no roll, Days ${listOf(soon.map(a => a.day))})`);
  // The night opens only on a turn that met every gate, and never before the day the four were met.
  const nights = asks.filter(a => a.night);
  const met = asks.find(a => a.gate);
  check(nights.every(a => a.gate) && (!nights.length || (met && nights[0].day >= met.day)), `the night opens no earlier than the day all four thresholds are met (met Day ${met ? met.day : 'never'}, the night Day ${nights.length ? nights[0].day : 'never'})`);
  if (!variant) {
    const welcome = asks.filter(a => a.answer === 'welcome');
    check(welcome.length > 0 && welcome.every(a => a.after.s - a.before.s === 8 && a.after.m - a.before.m === 2), `each welcome flirt is spark +8 and romance +2 (10 and 2 x Tyler's rate 0.8: ${listOf(welcome.map(a => `${a.after.s - a.before.s}/${a.after.m - a.before.m}`))})`);
    if (last >= FADE.to) {
      const a = at(T, FADE.from), b = at(T, FADE.to);
      const days = mine.filter(r => r.day >= FADE.from && r.day <= FADE.to);
      check(a && b && Math.abs(a.m - FADE.at[0]) <= FADE.at[1] && Math.abs((a.m - b.m) - FADE.drop[0]) <= FADE.drop[1] && days.every((r, i) => !i || r.m <= days[i - 1].m) && b.m > 0,
        `romance fades with no contact: ${a && a.m} on Day ${FADE.from} (${FADE.at[0]} +/- ${FADE.at[1]}), ${b && b.m} on Day ${FADE.to}, down ${a && b ? a.m - b.m : '?'} (${FADE.drop[0]} +/- ${FADE.drop[1]}), every morning lower or level`);
    }
    return;
  }
  // The coercion checks: fear 40 by threats, or a record held over them.
  const pushed = asks.filter(a => (variant === 'fear' && a.before.f >= 40) || (variant === 'leverage' && a.held > 0));
  check(asks.every(a => !a.complied), 'compliance never fires on a romantic line');
  if (variant === 'fear') {
    check(pushed.length > 0 && asks.every(a => !a.night), `the night never opens at fear 40 by threats (fear before each ask for the night: ${listOf(asks.filter(a => a.kind !== 'flirt').map(a => a.before.f))})`);
    check(pushed.filter(a => a.kind !== 'move').every(a => a.answer === 'coerced'), `a Say at fear 40 or more is refused as coercion (${listOf(pushed.filter(a => a.kind !== 'move').map(a => a.answer))})`);
    pending(pushed.every(a => a.answer === 'coerced'), `at fear 40 or more every romantic line is coercion, the walk to a motel room too (the walk: ${listOf(pushed.filter(a => a.kind === 'move').map(a => a.answer))})`, 'wave 40');
  } else {
    pending(pushed.length > 0 && pushed.every(a => !a.night), `the night never opens with a record held over them (the night: ${nights.length ? `Day ${nights[0].day}, by the ${nights[0].kind === 'move' ? 'walk' : 'Say'}` : 'never'})`, 'wave 40');
  }
}

/* Wave 38: the blackmailer's bands. */
function blackmailBands(run, last, check, pending) {
  const n = run.notes;
  const took = n.gold - n.gold0;
  const pays = n.payments || [];
  const payers = new Set(pays.map(p => p.npcId)).size;
  if (last >= EXTRACT.byDay) {
    check(Math.abs(took - EXTRACT.total[0]) <= EXTRACT.total[1] && payers === EXTRACT.payers, `the blackmailer takes $${took} from ${payers} people by Day ${last} ($${EXTRACT.total[0]} +/- ${EXTRACT.total[1]} from ${EXTRACT.payers})`);
    pending(took <= PLAN_CAP, `a full pass takes at most about $${PLAN_CAP} (the plan's figure; $${took} today)`, 'B3 tuning');
  }
  // paid_silence is terminal: one payment a person, and every demand after it is refused as already paid.
  const by = {};
  for (const p of pays) by[p.npcId] = (by[p.npcId] || 0) + 1;
  const paidRecs = (n.records || []).filter(x => x.holder === 'player' && x.demand && x.demand.paid);
  const later = n.demands.filter(x => paidRecs.some(r => r.over === x.id && x.day >= r.demand.paidDay));
  check(Object.values(by).every(v => v === 1) && paidRecs.every(r => by[r.over] === 1) && later.length > 0 && later.every(x => x.answer === 'paid'),
    `paid_silence is terminal per person: one payment each (${paidRecs.length} paid), and the ${later.length} demands after it all answered "already paid" (${listOf(later.map(x => x.answer))})`);
  // Repeat demands compound harm: each costs liking and trust, the second more than the first, and every one of them plants a grudge or a report.
  const rep = paidRecs.map(r => ({ id: r.over, ds: later.filter(x => x.id === r.over) })).filter(x => x.ds.length);
  const falls = rep.every(x => x.ds.every(d => (d.w[0] === -100 || d.w[1] < d.w[0]) && (d.t[0] === -100 || d.t[1] < d.t[0])));
  const twice = rep.filter(x => x.ds.length >= 2 && x.ds[1].w[0] > -60);
  const grows = twice.every(x => x.ds[0].w[0] - x.ds[0].w[1] < x.ds[1].w[0] - x.ds[1].w[1]);
  // Everyone demanded again twice or more has planted a grudge or a report by the last morning.
  const again = rep.filter(x => x.ds.length >= 2);
  const bare = again.filter(x => !(n.seeds || []).some(sd => sd.npcId === x.id && ['grudge', 'report'].includes(sd.kind))).map(x => x.id);
  check(rep.length > 0 && falls && twice.length > 0 && grows && again.length > 0 && !bare.length, `repeat demands compound harm: liking and trust fall on every repeat (${rep.length} people), the second repeat costs more liking than the first (${listOf(twice.map(x => `${x.ds[0].w[0] - x.ds[0].w[1]} then ${x.ds[1].w[0] - x.ds[1].w[1]}`))}), and all ${again.length} demanded again twice or more plant a grudge or a report (without: ${listOf(bare)})`);
  // A holder's report spends what they hold: the witness's record over the player is spent, told to whom the report went.
  const W = n.witness;
  const held = (n.records || []).find(x => x.holder === W && x.over === 'player');
  const rep1 = (n.seeds || []).find(sd => sd.npcId === W && sd.kind === 'report' && sd.fired);
  const spentOn = held ? (held.log.find(e => e[1] === 'spent') || [])[0] : null;
  if (last >= 6) check(held && rep1 && held.status === 'spent' && held.knownBy.some(k => rep1.protectors.includes(k.npcId)) && spentOn === rep1.day,
    `a holder's report spends their leverage: ${W}'s record over the player ${held ? held.status : 'missing'} on Day ${spentOn}, told to ${held ? held.knownBy.map(k => k.npcId).join(', ') : '-'} (the report: Day ${rep1 ? rep1.day : '-'} to ${rep1 ? rep1.protectors.join(', ') : '-'})`);
  // The police bar: up every morning while the record is live, down once it is spent; the grudge check's lift lasts the day after the recorded day only.
  const bar = n.bar || [];
  const spentDay = n.exposed ? n.exposed.day : null;
  const live = bar.filter(b => b.status && b.status !== 'spent' && b.status !== 'void');
  check(live.length > 0 && live.every(b => b.barred), `Royce's police bar holds every morning his record is live (Days ${live.length ? `${live[0].day} to ${live[live.length - 1].day}` : '-'})`);
  if (spentDay && last > spentDay + BLACKMAIL.liftDays) {
    const post = bar.filter(b => b.day > spentDay);
    check(n.exposed.status === 'spent' && post.every(b => !b.barred) && post.every(b => b.lifted === (b.day <= spentDay + BLACKMAIL.liftDays)),
      `the police bar lifts after the recorded day (spent Day ${spentDay}; barred after: ${listOf(post.map(b => b.barred))}; the grudge check's lift on Day ${listOf(post.filter(b => b.lifted).map(b => b.day))} only)`);
  }
}

function table(run) {
  const lines = [];
  // Wave 38: the new playstyles print romance (m) too; the first three print as they always have.
  const m = r => (NEW_STYLES.includes(run.style) ? ` m ${String(r.m).padStart(3)}` : '');
  // The blackmailer's twenty people print on Days 1, 7, 14 and the last morning only.
  const last = Math.max(...run.rows.map(r => r.day));
  const rows = run.style === 'blackmailer' ? run.rows.filter(r => [1, 7, 14, last].includes(r.day)) : run.rows;
  for (const r of rows) lines.push(`Day ${String(r.day).padStart(2)}  ${r.name.padEnd(18)} w ${String(r.w).padStart(4)} t ${String(r.t).padStart(4)} f ${String(r.f).padStart(3)} k ${String(r.k).padStart(3)} s ${String(r.s).padStart(3)}${m(r)} owed ${String(r.owed).padStart(2)}  ${r.stance}${r.tags.length ? ' · ' + r.tags.join(', ') : ''}`);
  return lines.join('\n');
}
// Wave 38: each romantic line, its gate and what came of it.
function asksTable(run) {
  const tr = x => `s ${x.s} m ${x.m} t ${x.t} k ${x.k} f ${x.f}`;
  return (run.asks || []).map(a => `  Day ${String(a.day).padStart(2)} ${a.kind.padEnd(5)} ${a.answer.padEnd(8)}${a.tier ? ` (${a.tier})` : ''}  before ${tr(a.before)} -> ${tr(a.after)}${a.gate ? '  gate met' : `  short: ${a.short.join('; ')}`}${a.held ? ', held over them' : ''}${a.complied ? ', COMPLIED' : ''}${a.night ? ', THE NIGHT' : ''}`).join('\n');
}
// The romance playstyle's four runs: the courtship, the same lines at a minor, and the two coercion checks.
async function variantRuns(browser, days) {
  const out = [];
  for (const v of ROMANCE_VARIANTS) out.push([v, await runSim(browser, 'romance', { days, variant: v })]);
  return out;
}

module.exports = { runSim, bands, table, asksTable, variantRuns, STYLES, NEW_STYLES, BRAWL, ROMANCE, ROMANCE_VARIANTS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const want = args.filter(a => STYLES.includes(a));
  const assertOn = args.includes('--assert');
  const pendingOn = args.includes('--pending');
  const di = args.indexOf('--days');
  const days = di >= 0 ? parseInt(args[di + 1], 10) || 21 : 21;
  (async () => {
    const browser = await chromium.launch();
    let bad = 0;
    try {
      for (const style of want.length ? want : STYLES) {
        const runs = style === 'confidant' ? [[false, await runSim(browser, style, { days })], [true, await runSim(browser, style, { days, staged: true })]]
          : style === 'romance' ? await variantRuns(browser, days)
          : [[false, await runSim(browser, style, { days })]];
        for (const [staged, run] of runs) {
          console.log(`\n=== ${style}${staged === true ? ' (staged)' : staged ? ` (${staged})` : ''}, ${days} days ===`);
          console.log(table(run));
          if (run.asks) console.log(asksTable(run));
          if (run.errors.length) { console.log('page errors: ' + run.errors.join(' | ')); bad += 1; }
          for (const c of bands(style, run, staged)) {
            const skip = c.pending && !pendingOn;
            console.log(`  ${skip ? `PENDING ${c.pending}` : c.ok ? 'PASS' : 'FAIL'}  ${c.what}${skip ? ` (${c.ok ? 'holds today' : 'fails today'}; run with --pending)` : ''}`);
            if (!c.ok && !skip) bad += 1;
          }
        }
      }
    } finally { await browser.close(); }
    if (assertOn && bad) process.exit(1);
  })().catch(e => { console.error(e); process.exit(1); });
}
