'use strict';
/* Nobody under 18 (docs/RELATIONSHIPS_PLAN.md section 4.5; the design's
   Appendix D and section 2.7; the integration plan's sections 6, 19.1 and
   19.3). A permanent suite, like acceptance: it lands in wave 28 (A3) and
   every later wave keeps it green. The minors come from the data, never
   from names, and the set is pinned, so a new minor in the cast fails here
   until it is reviewed. The narrator is told before it writes, every turn
   a minor is present; a kind word costs nothing; one signal is the light
   row; a named target and two signals is the full row with the guardians,
   the reports and the town; a romantic ask pushed with fear or a threat
   is refused for anyone; a threat or a blow at a minor goes to their
   family and the law; spark never moves, from any writer, and no packet
   ever carries a romance cue for a minor. Mock mode.
   Run with: node tests/run.cjs relationships.test */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('relationships');
const ROOT = path.resolve(__dirname, '..');
// The cues a minor must never carry in any packet (Appendix D step 9, with N11's additions), outside the minor instruction itself.
// "says yes" is the intimacy answer's form ("<Name> says yes; fade to black"), so Micah's "says yes ma'am" is no cue.
const CUE_RE = /open to a flirt|open to it|sweet on you|using you|wants you|has noticed you|falling for you|seeing you|old flame|interested|flirts back|lights up when|stands close|for one reason|looks twice|says yes[;:]|fade to black|not tonight/i;

/* In the page: every packet the mock sees (parser, narrator, bookkeeper),
   __put (the player somewhere with these people, now), __say (a Say line
   to someone, with the parse and the bookkeeper's reply given), and
   __check (what Appendix D forbids, for every minor by any anchor: spark,
   a spark status, an intimate memory, a cue in any packet line about them,
   a spark line in the feed or on their card). */
const setup = page => page.evaluate(() => {
  const G = Game;
  window.__packets = [];
  for (const m of ['parse', 'narrate', 'bookkeep']) {
    const f = G.Api.Mock[m];
    G.Api.Mock[m] = function (packet) { window.__packets.push({ kind: m, text: String((packet && packet.text) || '') }); return f.apply(this, arguments); };
  }
  G.Api.Mock.delay = 0;
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  window.__say = async (to, words, parse, book) => {
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: to === 'everyone' ? G.State.npcsAt(G.state.player.locationId).map(n => n.id) : [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (book) G.Api.Mock.queue('bookkeep', book);
    return G.Pipeline.submit(words, { mode: 'say', to });
  };
  window.__check = () => {
    const S = G.State, R = G.Rel, st = G.state;
    const problems = [];
    const minors = st.npcs.filter(n => R.isMinor(n));
    for (const n of minors) {
      if (n.rel.s > 0 || n.rel.start.s || n.rel.everyday.s || n.rel.fix.s) problems.push(`${n.id}: spark ${n.rel.s}`);
      if (n.memories.some(m => m.d && m.d.s > 0)) problems.push(`${n.id}: a memory with spark`);
      if (n.memories.some(m => m.event === 'intimate')) problems.push(`${n.id}: an intimate memory`);
      if (R.sparkStatus(n)) problems.push(`${n.id}: spark status ${R.sparkStatus(n)}`);
      if (R.stance(n).tags.some(t => R.SPARK_STATUS.some(x => x.status === t))) problems.push(`${n.id}: a spark tag`);
      const line = G.Pipeline.npcLine(n, st.meta.turn);
      if (CUE.test(line)) problems.push(`${n.id}: their person line carries a cue: ${line}`);
      for (const p of window.__packets) for (const l of p.text.split('\n')) {
        if (!l.includes(n.name) || /^UNDER 18: /.test(l)) continue;
        // Wave 29: an adult can carry a spark tag now, so every line that lists people is read one person at a time.
        // Wave 30: and an adult's own entry that names the minor as kin ("employee: Micah Dees") is the adult's, not one about the minor: the minor's entry is the one that starts with them.
        const listing = /^(PRESENT|NPCS PRESENT|OTHER KNOWN NPCS|NAMED IN THE NARRATION[^:]*|EVERYONE ELSE IN TOWN[^:]*): /;
        const parts = listing.test(l) ? l.replace(listing, '').split(/; (?=[A-Z][a-z]+ [A-Z][a-z'-]+(?: [A-Z][a-z'-]+)? \(|npc_)/).filter(x => x.startsWith(n.name) || x.startsWith(n.id)) : [l];
        for (const x of parts) if (CUE.test(x)) problems.push(`${n.id}: a ${p.kind} packet line carries a cue: ${x.slice(0, 200)}`);
      }
      const feed = [...document.querySelectorAll('#feed .f-quiet')].map(x => x.textContent).filter(t => t.includes(n.name));
      for (const t of feed) if (/is sweet on you|is falling for you|looks at you twice|is interested/.test(t)) problems.push(`${n.id}: a spark line in the feed: ${t}`);
    }
    return { problems, minors: minors.map(n => n.id) };
  };
  window.CUE = new RegExp(document.documentElement.dataset.cue || 'x^');
});
const install = async page => { await page.evaluate(re => { document.documentElement.dataset.cue = re; }, CUE_RE.source); await setup(page); await page.evaluate(() => { window.CUE = new RegExp(document.documentElement.dataset.cue, 'i'); }); };
const checked = async (page, what) => { const c = await page.evaluate(() => window.__check()); assert.deepEqual(c.problems, [], `${what}: ${c.problems.join(' | ')}`); return c; };

s.test('nobody under 18 ever carries spark, a spark status or a romance cue, and every advance, coercion, threat or blow aimed at a minor is handled before and after narration', async h => {
  // 1. The roster, from the data: every record a minor by any anchor; exactly Kaylee, Micah and Austin today; none on a romance list.
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const roster = await page.evaluate(() => {
    const R = Game.Rel, T = Game.data.TOWN_DATA;
    return { data: T.npcs.filter(n => R.isMinor(n, { s: null, town: null })).map(n => n.id).sort(), count: T.npcs.length, romance: Array.isArray(T.romance) ? T.romance.map(x => x.npcId) : [] };
  });
  assert.equal(roster.count, 66, 'every record in the cast');
  assert.deepEqual(roster.data, ['npc_austin', 'npc_kaylee', 'npc_micah'], 'a new minor fails here until it is reviewed');
  assert.ok(!roster.romance.some(id => roster.data.includes(id)), 'nobody under 18 on the romance list');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tmp = path.join(os.tmpdir(), `relationships-romance-${process.pid}.html`);
  fs.writeFileSync(tmp, html.replace('  policeFallback: "npc_hoyt",', '  policeFallback: "npc_hoyt",\n  romance: [{ npcId: "npc_jodie", sparkRate: 1.2 }, { npcId: "npc_kaylee", sparkRate: 1 }],'));
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, 'validate-town.cjs')], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { VALIDATE_FILE: tmp }) });
    assert.notEqual(run.status, 0, 'the validator refuses a minor on the romance list');
    assert.match(run.stdout + run.stderr, /npc_kaylee is under 18: nobody under 18 is ever on the romance list/);
    assert.doesNotMatch(run.stdout + run.stderr, /npc_jodie is under 18/);
  } finally { fs.unlinkSync(tmp); }
  // 2. A new game: spark 0 and no status for every minor.
  const fresh = await page.evaluate(() => Game.state.npcs.filter(n => Game.Rel.isMinor(n)).map(n => [n.id, n.rel.s, Game.Rel.sparkStatus(n)]));
  assert.deepEqual(fresh.sort(), [['npc_austin', 0, null], ['npc_kaylee', 0, null], ['npc_micah', 0, null]]);
  // 3. The line whenever a minor is present, flagged or not.
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
    const out = {};
    const last = () => window.__packets.filter(p => p.kind === 'narrate').pop().text;
    const rep = () => st.player.reputation.town || 0;
    const reports = () => st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report').length;
    const heavy = id => S.npc(id).memories.filter(m => m.weight === 3 && m.event === 'crossed').length;
    out.here = __put('loc_pittmans', ['npc_kaylee', 'npc_royce'], 2, 'evening');
    await __say('npc_royce', 'Evening, Royce.');
    out.plain = last();
    // 4a. A kind remark, unflagged: "thanks, sweetheart" is one weak word, no signal; the bookkeeper's compliment stands.
    const k0 = S.npc('npc_kaylee').attitude, rep0 = rep(), rp0 = reports();
    await __say('npc_kaylee', 'Thanks, sweetheart.', null, { socialEvents: ['npc_kaylee complimented: thanked me at the register'] });
    out.kind = { moved: S.npc('npc_kaylee').attitude - k0, ev: S.npc('npc_kaylee').memories.map(m => m.event), rep: rep() - rep0, reports: reports() - rp0, guard: heavy('npc_royce') + heavy('npc_darlene'), packet: last() };
    // 4b. One signal: the flag alone (no phrase, no event from the bookkeeper): the light row.
    const k1 = S.npc('npc_kaylee').attitude;
    await __say('npc_kaylee', 'Nice hoodie.', { romantic: 'flirt' });
    out.flag = { moved: S.npc('npc_kaylee').attitude - k1, light: S.npc('npc_kaylee').memories.filter(m => m.event === 'noted' && m.weight === 1 && /uncomfortable/.test(m.text)).length, rep: rep() - rep0, reports: reports() - rp0, guard: heavy('npc_royce') + heavy('npc_darlene') };
    // ... and in everyone mode: Kaylee is not a named target, so one signal at most.
    await __say('everyone', 'You all are a sight for sore eyes tonight.', { romantic: 'flirt' });
    out.everyone = { light: S.npc('npc_kaylee').memories.filter(m => m.event === 'noted' && /uncomfortable/.test(m.text)).length, rep: rep() - rep0, reports: reports() - rp0, guard: heavy('npc_royce') + heavy('npc_darlene'), packet: last() };
    // 4c. A named target and two signals (the flag and the phrase list), the bookkeeper's flirt replaced; an insult in front of two lands the same turn (capped).
    __put('loc_pittmans', ['npc_kaylee', 'npc_royce', 'npc_marcus', 'npc_dwight'], null);
    const t0 = { k: G.Rel.tracksOf(S.npc('npc_kaylee')), rep: rep(), reports: reports() };
    await __say('npc_kaylee', 'What time do you get off tonight, sweetheart?', { romantic: 'flirt' }, { socialEvents: ['npc_kaylee flirted: asked when I get off', 'npc_kaylee complimented: liked my nails', 'npc_marcus insulted: laughed at the chief'] });
    const ky = S.npc('npc_kaylee');
    const t1 = G.Rel.tracksOf(ky);
    out.full = {
      d: [t1.w - t0.k.w, t1.t - t0.k.t, t1.f - t0.k.f], events: ky.memories.filter(m => m.turn === st.meta.turn - 0 || m.event === 'unwanted_advance').map(m => m.event),
      royce: S.npc('npc_royce').memories.filter(m => m.event === 'crossed').map(m => [m.weight, m.text]), darlene: S.npc('npc_darlene').memories.filter(m => m.event === 'crossed').map(m => [m.weight, m.text]),
      seeds: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report' && sd.origin.why === 'advance').map(sd => [sd.origin.npcId, sd.origin.protectors]),
      rep: rep() - t0.rep, marcus: S.npc('npc_marcus').memories.filter(m => m.event === 'humiliated').length, packet: last(), spark: ky.rel.s
    };
    return out;
  });
  for (const id of ['npc_kaylee', 'npc_royce']) assert.ok(r.here.includes(id), id + ' is at the station');
  const kayleeLine = 'UNDER 18: Kaylee Pittman is 16: any romantic or sexual advance is unwelcome and alarming; she is uncomfortable, gets away or goes to her father; never warm, never flirtatious.';
  for (const p of [r.plain, r.kind.packet, r.everyone.packet, r.full.packet]) assert.ok(p.split('\n').includes(kayleeLine), 'her line every turn she is there, flagged or not');
  assert.ok(!/open to a flirt/.test(r.plain));
  await checked(page, 'steps 3 and 4');
  assert.deepEqual([r.kind.moved, r.kind.rep, r.kind.reports, r.kind.guard], [3, 0, 0, 0], 'a kind remark: a normal compliment, nothing else');
  assert.ok(r.kind.ev.includes('complimented'));
  assert.deepEqual([r.flag.moved, r.flag.light, r.flag.rep, r.flag.reports, r.flag.guard], [-3, 1, 0, 0, 0], 'the flag alone: the light row (liking -3, a weight-1 line), nothing for parents or police');
  assert.ok(r.everyone.light >= 1 && r.everyone.light <= 2, 'everyone mode: the light row at most');
  assert.deepEqual([r.everyone.rep, r.everyone.reports, r.everyone.guard], [0, 0, 0], 'never the full row without a named target');
  assert.equal(r.full.d[1], -23, 'the full row: trust -20 x1.15 (she is guarded)');
  assert.equal(r.full.d[0], -22, 'liking -20, and -2 for the humiliation she saw at the counter');
  assert.equal(r.full.d[2], 10, 'fear +10, which buys nothing');
  assert.ok(r.full.events.includes('unwanted_advance') && !r.full.events.includes('flirted') && !r.full.events.includes('complimented'), 'the bookkeeper\'s version replaced: ' + r.full.events);
  assert.deepEqual(r.full.royce.map(x => x[0]), [3], 'her father: one weight-3 crossed memory');
  assert.match(r.full.royce[0][1], /^Tester came on to my daughter at Pittman's Gas and Service$/);
  assert.deepEqual(r.full.darlene.map(x => x[0]), [3], 'her mother, at home: the same');
  assert.deepEqual(r.full.seeds.map(x => x[0]).sort(), ['npc_darlene', 'npc_royce'], 'each plants a report');
  for (const x of r.full.seeds) assert.deepEqual(x[1], ['npc_marcus'], 'to Chief Bell');
  assert.equal(r.full.marcus, 1, 'the insult in front of two others landed as a humiliation the same turn');
  assert.equal(r.full.rep, -12, 'the town -10 outside the cap, on top of the humiliation\'s capped -2');
  assert.equal(r.full.spark, 0);
});

s.test('a named target and two signals without the flag: the bookkeeper\'s flirt and a phrase hit at Micah; threats and a blow at Austin go to his mother and the chief; fear never opens a minor\'s secret or buys a thing; a lev_ id is no reason not to roll', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    const rep = () => st.player.reputation.town || 0;
    // Micah at the bait shop on Saturday: the parse misses the flag; the bookkeeper sends a flirt and the words hit the phrase list.
    __put('loc_purvis_landing', ['npc_micah'], 3, 'afternoon');
    const r0 = rep();
    await __say('npc_micah', 'Come sit with me in the truck a while.', { romantic: null }, { socialEvents: ['npc_micah flirted: asked me to sit in his truck'] });
    out.micah = { mems: S.npc('npc_micah').memories.map(m => m.event), ray: S.npc('npc_ray').memories.filter(m => m.event === 'crossed').map(m => m.text), nadine: S.npc('npc_nadine').memories.filter(m => m.event === 'crossed').map(m => m.text), rep: rep() - r0, seeds: st.seeds.filter(sd => sd.origin && sd.origin.why === 'advance').map(sd => sd.origin.npcId).sort() };
    // A threat and a blow at Austin: a report to his mother and the chief each time (once a memory), the town -5 and -10.
    __put('loc_riverbend', ['npc_austin'], 3, 'afternoon');
    const r1 = rep();
    M.queue('parse', { actionType: 'intimidate', summary: 'Threatens Austin', targets: ['npc_austin'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I tell Austin to keep his mouth shut or else');
    out.threat = { rep: rep() - r1, seeds: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report' && sd.origin.npcId === 'npc_austin').map(sd => [sd.origin.why, sd.origin.protectors]) };
    const r2 = rep();
    M.queue('parse', { actionType: 'attack', summary: 'Hits Austin', targets: ['npc_austin'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I hit Austin');
    out.blow = { rep: rep() - r2, seeds: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report' && sd.origin.npcId === 'npc_austin' && sd.origin.why === 'violence').map(sd => sd.origin.protectors) };
    // Kaylee at fear 60: a small ask rolls (no compliance), and an intimidation that works opens no secret.
    __put('loc_pittmans', ['npc_kaylee'], 3, 'evening');
    S.apply({ relSet: { npcId: 'npc_kaylee', f: 60 } });
    M.queue('parse', { actionType: 'persuade', summary: 'Asks for the till key', targets: ['npc_kaylee'], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.forceNextRoll(4);
    await G.Pipeline.submit('Hand me the till key.', { mode: 'say', to: 'npc_kaylee' });
    out.till = { roll: G.Pipeline.lastTurn.roll ? G.Pipeline.lastTurn.roll.d20 : null, complied: G.Pipeline.lastTurn.ctx.complied || null };
    M.queue('parse', { actionType: 'intimidate', summary: 'Leans on Kaylee for what she knows', targets: ['npc_kaylee'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.forceNextRoll(19);
    await G.Pipeline.submit('Tell me what you know.', { mode: 'say', to: 'npc_kaylee' });
    out.secret = [G.Pipeline.lastTurn.roll && G.Pipeline.lastTurn.roll.success, G.Pipeline.lastTurn.ctx.revealSecretFor || null];
    // A leverage-backed ask at Micah rolls as usual (the id is no reason to skip the die).
    // Changed by design in wave 29 (A4): the record is real now (his secret shown, the dock light held over him), and the words use it.
    __put('loc_purvis_landing', ['npc_micah'], 3, 'evening');
    S.apply({ relSet: { npcId: 'npc_micah', f: 50 } });
    S.apply({ secretShown: [{ npcId: 'npc_micah', how: 'roll' }] });
    S.apply({ leverageAdd: { holder: 'player', over: 'npc_micah', about: { kind: 'secret' }, text: 'flashes the dock light for Wade when a patrol car comes', weight: 2, mattersTo: ['npc_ray', 'npc_nadine'] } });
    const rec = st.leverage.find(x => x.over === 'npc_micah');
    const lr0 = st.player.reputation.town || 0;
    M.queue('parse', { actionType: 'persuade', summary: 'Leans on Micah with the dock light', targets: ['npc_micah'], aboutIds: [rec.id], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.forceNextRoll(11);
    await G.Pipeline.submit('Lend me your truck tonight, or Wade hears about the dock light.', { mode: 'say', to: 'npc_micah' });
    out.lev = [G.Pipeline.lastTurn.roll ? G.Pipeline.lastTurn.roll.d20 : null, G.Pipeline.lastTurn.ctx.complied || null, R.complies(S.npc('npc_micah'), { actionType: 'talk', difficulty: 'easy' })];
    out.levBacked = [rec.id, G.Pipeline.lastTurn.ctx.backed ? G.Pipeline.lastTurn.ctx.backed.id : null, R.canRaise(S.npc('npc_micah')), R.leverageAnswer(rec, S.npc('npc_micah'), { price: 100, rolled: true, success: true }).amount,
      st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report' && sd.origin.npcId === 'npc_micah' && sd.origin.why === 'threat').map(sd => sd.origin.protectors.slice().sort()), (st.player.reputation.town || 0) - lr0];
    return out;
  });
  await checked(page, 'Micah, Austin, Kaylee');
  assert.ok(r.micah.mems.includes('unwanted_advance') && !r.micah.mems.includes('flirted'), 'the full row, the bookkeeper\'s flirt replaced: ' + r.micah.mems);
  assert.deepEqual([r.micah.ray.length, r.micah.nadine.length], [1, 1], 'his grandparents: crossed each');
  assert.match(r.micah.ray[0], /came on to my grandson at Purvis Landing/);
  assert.deepEqual(r.micah.seeds, ['npc_nadine', 'npc_ray'], 'each reports to the chief');
  assert.equal(r.micah.rep, -10);
  assert.ok(r.threat.rep <= -5, 'a threat at a minor: the town -5 outside the cap (and the threat\'s own -2 if two others saw it): ' + r.threat.rep);
  assert.deepEqual(r.threat.seeds, [['threat', ['npc_tammy', 'npc_marcus']]], 'to his mother and the chief, at once');
  assert.ok(r.blow.rep <= -10, 'a blow at a minor: the town -10 more: ' + r.blow.rep);
  assert.deepEqual(r.blow.seeds, [['npc_tammy', 'npc_marcus']]);
  assert.equal(r.till.roll, 4, 'the ask rolls: no compliance from a minor, whatever her fear');
  assert.equal(r.till.complied, null);
  assert.equal(r.secret[0], true, 'the intimidation worked');
  assert.ok(!(r.secret[1] || []).includes('npc_kaylee'), 'and opened no secret');
  assert.deepEqual(r.lev, [11, null, false], 'a lev_ id at Micah: the die is rolled, no compliance');
  // Wave 29 (A4): it is a backed ask on his record, he can raise nothing ($0: no money from a minor), and the threat goes to his family and the chief.
  assert.equal(r.levBacked[1], r.levBacked[0], 'backed by the record');
  assert.deepEqual(r.levBacked.slice(2, 4), [0, 0], 'canRaise $0; a price named gets nothing');
  assert.deepEqual(r.levBacked[4], [['npc_marcus', 'npc_nadine', 'npc_ray']], 'reported to his grandparents and the chief');
  assert.ok(r.levBacked[5] <= -5, 'the town -5 for a threat at a minor: ' + r.levBacked[5]);
});

s.test('a romantic ask is never backed and never obeyed out of fear: "sleep with me or Bell hears about your tapes" to Glenda, and the same to an adult at fear 50, both refuse with the die still drawn, cost blackmail and crossed, plant a report and drop the town 10', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const out = {};
    const rep = () => st.player.reputation.town || 0;
    const ask = async (id, words, parse) => {
      const c0 = st.meta.rngCalls;
      const r0 = rep();
      const t0 = R.tracksOf(S.npc(id));
      M.queue('parse', Object.assign({ summary: words, targets: [id], needsRoll: true, stat: 'charm', difficulty: 'normal', timeCost: 'instant' }, parse));
      await G.Pipeline.submit(words, { mode: 'say', to: id });
      const t1 = R.tracksOf(S.npc(id));
      const narr = window.__packets.filter(p => p.kind === 'narrate').pop().text;
      const book = window.__packets.filter(p => p.kind === 'bookkeep').pop().text;
      return {
        roll: G.Pipeline.lastTurn.roll, draws: st.meta.rngCalls - c0, coerced: G.Pipeline.lastTurn.ctx.coerced || null, complied: G.Pipeline.lastTurn.ctx.complied || null,
        d: [t1.w - t0.w, t1.t - t0.t], mems: S.npc(id).memories.filter(m => m.turn === st.meta.turn).map(m => [m.event, m.weight]),
        line: narr.split('\n').find(l => l.startsWith('COERCION')) || null, book: book.split('\n').find(l => l.startsWith('COERCION')) || null,
        rep: rep() - r0, seeds: st.seeds.filter(sd => sd.origin && sd.origin.npcId === id && sd.turn === st.meta.turn).map(sd => [sd.origin.kind, sd.origin.why, sd.origin.protectors || null]), spark: S.npc(id).rel.s
      };
    };
    // Glenda at Town Hall; her protector, Chief Bell, is at the Old Bridge.
    __put('loc_town_hall', ['npc_glenda'], 6, 'afternoon');
    out.glenda = await ask('npc_glenda', 'Sleep with me or Bell hears about your tapes.', { actionType: 'intimidate', romantic: 'more' });
    // Tyler at fear 50, a small ask that fear alone would have bought with no roll.
    __put('loc_motor_court', ['npc_tyler'], 6, 'night');
    S.apply({ relSet: { npcId: 'npc_tyler', f: 50 } });
    out.fearOnly = R.complies(S.npc('npc_tyler'), { actionType: 'persuade', difficulty: 'normal' });
    G.Pipeline.forceNextRoll(17);
    out.tyler = await ask('npc_tyler', 'Come up to my room tonight.', { actionType: 'persuade', romantic: 'more' });
    out.forced = G.Pipeline.hooks.nextD20;
    return out;
  });
  await checked(page, 'coercion');
  for (const [who, x] of [['Glenda', r.glenda], ['Tyler', r.tyler]]) {
    assert.equal(x.roll, null, `${who}: no roll is made and nothing is given`);
    assert.ok(x.coerced, `${who}: coercion`);
    assert.equal(x.complied, null, `${who}: never compliance`);
    assert.deepEqual(x.mems.map(m => m[0]).sort(), ['blackmailed', 'crossed'], `${who}: blackmailed and crossed`);
    assert.ok(x.mems.every(m => m[1] === 3), `${who}: both weight 3`);
    assert.match(x.line, new RegExp(`^COERCION \\(the engine: no roll, nothing given\\): ${who === 'Glenda' ? 'Glenda Pryor' : 'Tyler Rasberry'} refuses: (she|he) won't be pushed into that, and (she|he) (leaves|calls for [A-Z][a-z]+ [A-Z][a-z]+)\\.$`));
    assert.match(x.book, /^COERCION \(already applied by the engine/);
    assert.ok(x.rep <= -10, `${who}: the town -10 outside the cap (${x.rep})`);
    assert.equal(x.seeds.length, 1, `${who}: a report planted at once: ${JSON.stringify(x.seeds)}`);
    assert.deepEqual(x.seeds[0].slice(0, 2), ['report', 'coercion']);
    assert.equal(x.spark, 0);
  }
  assert.ok(r.glenda.draws >= 1, 'the d20 is still drawn: ' + r.glenda.draws);
  assert.deepEqual(r.glenda.seeds[0][2], ['npc_marcus'], 'Glenda reports to Chief Bell, her protector');
  assert.ok(r.glenda.d[0] <= -35 && r.glenda.d[1] <= -40, 'blackmailed -25/-30 and crossed -12/-12: ' + r.glenda.d);
  assert.equal(r.fearOnly, true, 'Tyler at fear 50 would do a small thing with no roll');
  assert.equal(r.forced, null, 'the forced die was used up, not rolled');
  assert.deepEqual(r.tyler.seeds[0][2], ['npc_mavis'], 'Tyler reports to Mavis, his boss');
});

s.test('the same for Micah, with the guardians\' consequences: coercion and the minor rule, the town 20 down in all', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, M = G.Api.Mock, R = G.Rel, st = G.state;
    const rep = () => st.player.reputation.town || 0;
    __put('loc_purvis_landing', ['npc_micah'], 6, 'evening');
    const r0 = rep();
    const c0 = st.meta.rngCalls;
    M.queue('parse', { actionType: 'intimidate', summary: 'Pushes Micah with the dock light', targets: ['npc_micah'], aboutIds: ['lev_micah_1'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant', romantic: 'more' });
    M.queue('bookkeep', { socialEvents: ['npc_micah flirted: told me to sleep with him'] });
    await G.Pipeline.submit('Sleep with me or Wade hears about the dock light.', { mode: 'say', to: 'npc_micah' });
    const mi = S.npc('npc_micah');
    return {
      roll: G.Pipeline.lastTurn.roll, draws: st.meta.rngCalls - c0, rep: rep() - r0, mems: mi.memories.map(m => m.event).sort(), spark: mi.rel.s,
      ray: S.npc('npc_ray').memories.filter(m => m.event === 'crossed').length, nadine: S.npc('npc_nadine').memories.filter(m => m.event === 'crossed').length,
      seeds: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report').map(sd => [sd.origin.npcId, sd.origin.why, sd.origin.protectors]).sort(),
      line: window.__packets.filter(p => p.kind === 'narrate').pop().text.split('\n').filter(l => /^(COERCION|UNDER 18)/.test(l))
    };
  });
  await checked(page, 'Micah');
  assert.equal(r.roll, null, 'refused, the die burned');
  assert.ok(r.draws >= 1);
  assert.deepEqual(r.mems, ['blackmailed', 'crossed', 'unwanted_advance'], 'coercion and the full row; the bookkeeper\'s flirt replaced');
  assert.deepEqual([r.ray, r.nadine], [1, 1], 'his grandparents take it');
  assert.ok(r.seeds.some(x => x[0] === 'npc_micah' && x[1] === 'coercion' && x[2].includes('npc_ray') && x[2].includes('npc_nadine') && x[2].includes('npc_marcus')), 'his own report goes to his grandparents and the chief: ' + JSON.stringify(r.seeds));
  assert.ok(r.seeds.some(x => x[0] === 'npc_ray' && x[1] === 'advance') && r.seeds.some(x => x[0] === 'npc_nadine' && x[1] === 'advance'), 'and each of them to the chief');
  assert.equal(r.rep, -20, 'the town 20 down in all');
  assert.equal(r.spark, 0);
  assert.ok(r.line.some(l => /^COERCION .*Micah Dees refuses/.test(l)) && r.line.some(l => /^UNDER 18: Micah Dees is 17: /.test(l)), JSON.stringify(r.line));
});

s.test('an unflagged kind remark to Kaylee ("thanks, sweetheart") and a compliment to Darlene said to everyone with Kaylee there cost nothing heavy: the line to the narrator, a light weight-1 memory at most', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state;
    const rep = () => st.player.reputation.town || 0;
    __put('loc_pittmans', ['npc_kaylee', 'npc_darlene', 'npc_royce'], 2, 'evening');
    const r0 = rep();
    const before = { k: S.npc('npc_kaylee').memories.length };
    await __say('npc_kaylee', 'Thanks, sweetheart.');
    await __say('everyone', 'You look lovely today, Darlene.');
    const k = S.npc('npc_kaylee');
    return {
      rep: rep() - r0, heavy: k.memories.filter(m => m.weight >= 2).length, light: k.memories.filter(m => m.weight === 1 && /uncomfortable/.test(m.text)).length,
      reports: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report').length, guardians: ['npc_royce', 'npc_darlene'].map(id => S.npc(id).memories.filter(m => m.event === 'crossed').length),
      lines: window.__packets.filter(p => p.kind === 'narrate').map(p => p.text.split('\n').some(l => l.startsWith('UNDER 18: Kaylee Pittman is 16')))
    };
  });
  await checked(page, 'kind remarks');
  assert.deepEqual(r.lines.slice(-2), [true, true], 'the line to the narrator both times');
  assert.deepEqual([r.rep, r.heavy, r.reports, r.guardians], [0, 0, 0, [0, 0]], 'nothing heavy');
  assert.ok(r.light <= 1, 'a light weight-1 memory at most: ' + r.light);
});

s.test('an import that strips the town copy\'s age, the current age and the tags still finds Kaylee a minor from the live town; an ageless teen role fails closed; an edit that makes Micah 18 unlocks nothing; a write from any source moves no minor\'s spark', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(() => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = () => G.state;
    const out = {};
    const old = JSON.parse(JSON.stringify(st()));
    const town = JSON.parse(JSON.stringify(S.town));
    const k = old.npcs.find(x => x.id === 'npc_kaylee');
    delete k.age; k.tags = []; k.role = 'works the register at the station';
    const tk = town.npcs.find(x => x.id === 'npc_kaylee');
    delete tk.age; tk.tags = []; tk.role = 'works the register at the station';
    k.rel.s = 60; k.rel.fix.s = 60;
    S.load(old, town);
    out.kaylee = [R.isMinor(S.npc('npc_kaylee')), S.npc('npc_kaylee').rel.s, R.minorAge(S.npc('npc_kaylee'))];
    out.closed = R.isMinor({ id: 'npc_test_q', role: 'a high school student', tags: [] }, { s: null, town: null });
    S.apply({ editPerson: { npcId: 'npc_micah', age: 18 } }, { source: 'player' });
    out.micah = [S.npc('npc_micah').age, R.isMinor(S.npc('npc_micah')), R.complies(S.npc('npc_micah'), { actionType: 'talk', difficulty: 'easy' })];
    const refused = [];
    const add = r => refused.push(r.rejected.map(x => x.reason).join(' | '));
    add(S.apply({ socialEvents: [{ npcId: 'npc_austin', event: 'flirted', text: 'winked', d: { s: 10 } }] }));
    add(W.applyEffects([{ op: 'socialEvent', npcId: 'npc_austin', event: 'flirted', text: 'winked', d: { s: 10 } }]));
    add(S.apply({ relSet: { npcId: 'npc_austin', s: 5 } }));
    add(S.apply({ editPerson: { npcId: 'npc_austin', rel: { s: 5 } } }, { source: 'player' }));
    S.apply({ setMemories: [{ npcId: 'npc_austin', memories: [{ turn: 0, day: 1, text: 'brought me a soda', weight: 1, event: 'flirted', d: { w: 4, t: 0, f: 0, k: 2, s: 9 } }] }] });
    out.refused = refused;
    out.austin = [S.npc('npc_austin').rel.s, S.npc('npc_austin').memories.map(m => m.d && m.d.s)];
    return out;
  });
  await checked(page, 'anchors and writes');
  assert.deepEqual(r.kaylee, [true, 0, 16], 'still a minor by the live town (16), her imported spark set to 0');
  assert.equal(r.closed, true, 'no age anywhere and a teen role: a minor');
  assert.deepEqual(r.micah, [18, true, false], 'an edit can make someone a minor, never an adult');
  assert.equal(r.refused.length, 4);
  for (const x of r.refused) assert.match(x, /spark stays 0 for npc_austin: they are under 18/);
  assert.deepEqual(r.austin, [0, [0]], 'the upgrade\'s own write zeroed too');
});

s.test('with Tammy gone, Austin\'s guardian is another adult of his family, else Chief Bell; with the chief arrested, the county sheriff hears, else the town does', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const out = {};
    out.tammy = R.guardiansOf(S.npc('npc_austin'));
    out.line = R.minorLine(S.npc('npc_austin'));
    S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_tammy', status: 'gone' }] });
    // Another adult of his family: Lyman, an uncle for the test.
    S.npc('npc_lyman').relations.push({ npcId: 'npc_austin', relation: 'nephew' });
    out.family = R.guardiansOf(S.npc('npc_austin'));
    out.familyLine = R.minorLine(S.npc('npc_austin'));
    S.npc('npc_lyman').relations.pop();
    out.chief = R.guardiansOf(S.npc('npc_austin'));
    out.chiefLine = R.minorLine(S.npc('npc_austin'));
    // The full row with only the chief to answer: he takes it himself, no report.
    __put('loc_riverbend', ['npc_austin'], 3, 'afternoon');
    W.minorAdvance('npc_austin');
    out.chiefTook = S.npc('npc_marcus').memories.filter(m => m.event === 'crossed').map(m => m.text);
    // The chief arrested: the sheriff in Clayburn takes it on his record, and the town hears a deputy came asking.
    S.apply({ effects: [{ op: 'npcStatus', npcId: 'npc_marcus', status: 'arrested' }] });
    out.none = R.guardiansOf(S.npc('npc_austin'));
    out.law = W.lawFor('Riverbend');
    W.minorAdvance('npc_austin');
    out.hoyt = S.npc('npc_hoyt').memories.filter(m => m.event === 'crossed').map(m => m.text);
    out.news = st.news.map(n => n.text).filter(t => /deputy from Clayburn|Word reached the county/.test(t));
    // A threat at Austin now: the report goes to the sheriff, who takes it when it comes due.
    S.apply({ beginTurn: true });
    S.apply({ socialEvents: [{ npcId: 'npc_austin', event: 'threatened', text: 'threatened me at Riverbend', act: 'intimidate' }] });
    const sd = W.minorHarm('npc_austin', 'threat');
    out.seed = sd ? [sd.origin.protectors, sd.origin.fallback] : null;
    // It comes due in a day or two: the sheriff takes it on his record, and the town hears a deputy came asking.
    const n1 = st.news.length;
    for (let i = 0; i < 3 && !(sd && S.seed(sd.id) && S.seed(sd.id).fired); i++) await G.Pipeline.submit('/rest');
    // (His earlier memory of the advance takes it in: crossed again within three days merges, the newest words kept.)
    out.fired = [sd && S.seed(sd.id) ? S.seed(sd.id).fired : null, S.npc('npc_hoyt').memories.filter(m => m.event === 'crossed').map(m => [m.text, m.n]), st.news.slice(n1).map(n => n.text).filter(t => /deputy from Clayburn/.test(t)).length];
    // No sheriff either: the town hears it, nothing else.
    // (A record living elsewhere takes no npcStatus: the test writes his death by hand.)
    Object.assign(S.npc('npc_hoyt'), { alive: false, status: 'dead' });
    out.lawNone = W.lawFor('Riverbend');
    const n0 = st.news.length;
    W.minorAdvance('npc_austin');
    out.newsNone = st.news.slice(n0).map(n => n.text);
    return out;
  });
  await checked(page, 'fallbacks');
  assert.deepEqual(r.tammy, { ids: ['npc_tammy'], kind: 'parent' });
  assert.match(r.line, /^Austin Lott is 15: .* he is uncomfortable, gets away or goes to his mother; never warm, never flirtatious\.$/);
  assert.deepEqual(r.family, { ids: ['npc_lyman'], kind: 'family' }, 'another adult of his family');
  assert.match(r.familyLine, /goes to his uncle;/);
  assert.deepEqual(r.chief, { ids: ['npc_marcus'], kind: 'police' }, 'else Chief Bell alone');
  assert.match(r.chiefLine, /goes to someone he trusts;/);
  assert.deepEqual(r.chiefTook, ['Tester came on to Austin Lott, a kid, at Riverbend Trailer Park'], 'the chief takes it himself');
  assert.deepEqual(r.none, { ids: [], kind: 'none' });
  assert.deepEqual([r.law.ids, r.law.fallback], [['npc_hoyt'], 'npc_hoyt'], 'the county sheriff is the law now');
  assert.deepEqual(r.hoyt, ['Tester came on to Austin Lott, a kid, at Riverbend Trailer Park'], 'on his record');
  assert.ok(r.news.includes('A deputy from Clayburn came by asking about Tester.'), JSON.stringify(r.news));
  assert.deepEqual(r.seed, [['npc_hoyt'], 'npc_hoyt'], 'a threat\'s report goes to the sheriff');
  assert.equal(r.fired[0], true, 'it came due');
  assert.deepEqual(r.fired[1], [['Austin Lott came to me saying Tester has been leaning on them.', 2]], 'on the sheriff\'s record');
  assert.equal(r.fired[2], 1, 'with the town-news line');
  assert.deepEqual([r.lawNone.ids, r.lawNone.fallback], [[], null]);
  assert.deepEqual(r.newsNone, ['Word reached the county about what happened at Riverbend Trailer Park.'], 'else the town does');
});

s.test('a player under 18, or of no age on record: nobody\'s spark moves, every answer is no, nothing intimate is answered, and the line is there every turn', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    // Changed by design in wave 29 (A4): Jodie is eligible on the town's own shipped list (opens at knows-you 20), not a list the test made.
    const out = { eligibleAdult: R.eligible(S.npc('npc_jodie')), listed: (G.State.town.romance || []).filter(x => x.npcId === 'npc_jodie').map(x => [x.sparkRate, x.opensAt.knows]) };
    S.apply({ relSet: { npcId: 'npc_jodie', k: 40 } });
    st.player.age = 16;
    out.eligible16 = R.eligible(S.npc('npc_jodie'));
    __put('loc_pittmans', ['npc_jodie'], 2, 'morning');
    const lines = [];
    for (const w of ['You have nice eyes.', 'Want to go on a date?', 'Wink. You look great.', 'Stay over at my place tonight.']) {
      await __say('npc_jodie', w, { romantic: /stay over/i.test(w) ? 'more' : 'flirt' });
      const p = window.__packets.filter(x => x.kind === 'narrate').pop().text.split('\n');
      lines.push({ young: p.includes('UNDER 18: The player is under 18: nobody in this town flirts with them or takes a flirt from them as anything but a kid talking.'), answer: p.find(l => l.startsWith('ROMANCE')) || null, yes: p.some(l => /says yes|fade to black|not tonight/.test(l)) });
    }
    out.lines = lines;
    // Wave 29 (A4): the last ask was for the night (the intimate gate): refused, nothing intimate written, nothing logged as one.
    out.intimate = [S.npc('npc_jodie').memories.filter(m => m.event === 'intimate').length, S.debugLog.filter(x => /intimate/.test(x.reason || '') && /npc_jodie/.test(x.reason || '') && x.kind !== 'rejected').length];
    out.jodie = [S.npc('npc_jodie').rel.s, S.npc('npc_jodie').memories.filter(m => m.event === 'flirted').length, R.sparkStatus(S.npc('npc_jodie'))];
    delete st.player.age;
    await __say('npc_jodie', 'Want to get a drink sometime?', { romantic: 'flirt' });
    const p = window.__packets.filter(x => x.kind === 'narrate').pop().text.split('\n');
    out.ageless = [R.playerMinor(), p.filter(l => l.startsWith('UNDER 18: ')), R.eligible(S.npc('npc_jodie'))];
    st.player.age = 30;
    out.adult = R.eligible(S.npc('npc_jodie'));
    return out;
  });
  await checked(page, 'the young player');
  assert.equal(r.eligibleAdult, true, 'an adult player: Jodie is on the town\'s list');
  assert.deepEqual(r.listed, [[1.2, 20]], 'the shipped row: rate 1.2, opens at 20');
  assert.equal(r.eligible16, false);
  for (const x of r.lines) {
    assert.equal(x.young, true, 'the under-18 player line every turn');
    assert.match(x.answer, /^ROMANCE \(decided by the engine\): Jodie Strayhorn isn't interested: she turns it aside\.$/, 'every welcome is no');
    assert.equal(x.yes, false, 'no intimacy answer');
  }
  assert.deepEqual(r.intimate, [0, 0], '"Stay over at my place tonight." from a 16-year-old: refused, no intimate memory');
  assert.deepEqual(r.jodie, [0, 0, null], 'her spark stays 0; a flirt from a kid is no unwelcome flirt either');
  assert.equal(r.ageless[0], true);
  assert.deepEqual(r.ageless[1], ["UNDER 18: The player's age is not on record, so for romance they count as under 18: nobody in this town flirts with them or takes a flirt from them as one."]);
  assert.equal(r.ageless[2], false);
  assert.equal(r.adult, true, 'an adult player: Jodie is eligible on the town\'s list');
});

s.test('fuzz: 300 random event strings and 50 random romantic parses over every id for 20 turns leave every minor at spark 0, with no status, no intimate memory and no cue in any packet', async h => {
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    let seed = 20261101;
    const rnd = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed % n; };
    const pick = a => a[rnd(a.length)];
    const ids = st.npcs.map(n => n.id);
    const words = R.EVENT_NAMES.concat(Object.keys(R.ALIASES), ['kept word', 'caught you at', 'flirt', 'kissed', 'winked', 'glared', 'xyzzy', 'private', 'came-clean']);
    const texts = ['winked at me', 'asked me out', 'told me I was pretty', 'kissed me at the counter', 'called me a liar', 'meet at 10:30 by the pumps', 'helped with the till', 'stood close at the register', ''];
    const romantics = [null, 'flirt', 'more'];
    const types = ['talk', 'persuade', 'deceive', 'intimidate', 'attack', 'give'];
    const inputs = ['What time do you get off?', 'Come sit with me.', 'Thanks, sweetheart.', 'Sleep with me or else.', 'Nice weather.', 'You look lovely tonight.', 'I wink at you.'];
    const places = [['loc_pittmans', ['npc_kaylee', 'npc_royce', 'npc_jodie']], ['loc_purvis_landing', ['npc_micah', 'npc_lorna', 'npc_trent']], ['loc_riverbend', ['npc_austin', 'npc_shayla', 'npc_leon']]];
    let strings = 0;
    let parses = 0;
    const turns = [];
    for (let t = 0; t < 20; t++) {
      const [loc, who] = places[t % 3];
      __put(loc, who, 2 + Math.floor(t / 4), ['morning', 'afternoon', 'evening', 'night'][t % 4]);
      const here = S.npcsAt(loc).map(n => n.id);
      const lines = [];
      for (let i = 0; i < 15; i++) {
        const parts = [pick(ids), pick(words)];
        if (rnd(3) === 0) parts.push(pick(ids));
        if (rnd(4) === 0) parts.splice(rnd(parts.length + 1), 0, 'private');
        lines.push(`${parts.join(rnd(2) ? ' ' : ': ')}${rnd(2) ? ':' : ''} ${pick(texts)}`);
      }
      strings += lines.length;
      for (let j = 0; j < (t % 2 ? 3 : 2) && parses < 50; j++) {
        parses += 1;
        const target = rnd(2) ? pick(here.length ? here : ids) : pick(ids);
        M.queue('parse', { actionType: pick(types), summary: 'fuzz', targets: [target], aboutIds: rnd(2) ? [pick(ids), 'lev_' + target.slice(4) + '_1'] : [], needsRoll: rnd(2) === 0, stat: 'charm', difficulty: 'normal', timeCost: 'instant', romantic: pick(romantics) });
        M.queue('bookkeep', { socialEvents: j ? lines.slice(0, 7) : lines.slice(7) });
        G.Pipeline.hooks.nextTier = pick(['success', 'failure', 'partial']);
        const to = pick(here.concat(['everyone']));
        await G.Pipeline.submit(pick(inputs), { mode: 'say', to });
      }
      turns.push(st.meta.turn);
      const c = window.__check();
      if (c.problems.length) return { problems: c.problems, at: t, strings, parses };
    }
    return { problems: [], strings, parses, turns: turns.length, minors: st.npcs.filter(n => R.isMinor(n)).map(n => [n.id, n.rel.s, R.sparkStatus(n)]) };
  });
  assert.deepEqual(r.problems, [], JSON.stringify(r).slice(0, 2000));
  assert.ok(r.strings >= 300, 'at least 300 event strings: ' + r.strings);
  assert.equal(r.parses, 50, '50 random parses');
  assert.equal(r.turns, 20);
  assert.deepEqual(r.minors.map(x => [x[1], x[2]]), [[0, null], [0, null], [0, null]]);
  await checked(page, 'after the fuzz');
});

s.test('a flirt aimed at Kaylee: the narrator is told before it writes, her father and mother cool and report to the chief, the town drops 10, and nothing anyone says makes it warm', async h => {
  // Design example 13 (section 6.4): Day 2 (a Friday) evening at Pittman's register; Royce there, Darlene home.
  const page = await h.open();
  await quickStart(page, { kinds: [] });
  await install(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    const out = {};
    __put('loc_pittmans', ['npc_kaylee', 'npc_royce'], 2, 'evening');
    out.darleneHere = S.npcsAt('loc_pittmans').some(n => n.id === 'npc_darlene');
    const tr = id => R.tracksOf(S.npc(id));
    const rep0 = st.player.reputation.town || 0;
    // The kind remark first: no signal at all, a normal compliment.
    const k0 = tr('npc_kaylee');
    await __say('npc_kaylee', 'Thanks, sweetheart.', { romantic: null }, { socialEvents: ['npc_kaylee complimented: thanked me at the register'] });
    out.kind = tr('npc_kaylee').w - k0.w;
    // The advance: the flag and a strong phrase, Kaylee the named target.
    const k1 = tr('npc_kaylee');
    await __say('npc_kaylee', 'What time do you get off tonight, sweetheart?', { romantic: 'flirt' }, { socialEvents: ['npc_kaylee complimented: said I look nice tonight'] });
    const narr = window.__packets.filter(p => p.kind === 'narrate').pop().text;
    out.told = narr.split('\n').filter(l => l.startsWith('UNDER 18'));
    out.kaylee = { tracks: tr('npc_kaylee'), from: k1, stance: R.stance(S.npc('npc_kaylee')).phrase, complies: R.complies(S.npc('npc_kaylee'), { actionType: 'talk', difficulty: 'easy' }) };
    out.royce = tr('npc_royce');
    out.darlene = tr('npc_darlene');
    out.memories = ['npc_royce', 'npc_darlene'].map(id => S.npc(id).memories.filter(m => m.event === 'crossed').map(m => [m.weight, m.text]));
    out.seeds = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'report').map(sd => [sd.origin.npcId, sd.origin.protectors, sd.trigger.value - st.time.day]);
    out.rep = (st.player.reputation.town || 0) - rep0;
    // Nothing anyone says makes it warm: a bookkeeper's warmth for her, the next turn, is set aside while the flag points at her.
    const k2 = tr('npc_kaylee');
    await __say('npc_kaylee', 'Your nails look nice.', { romantic: 'flirt' }, { socialEvents: ['npc_kaylee complimented: said I have nice nails', 'npc_kaylee they_helped: rang me up quick'] });
    out.after = tr('npc_kaylee').w - k2.w;
    // The chief hears it when the reports come due: police row, -5 and -10 x1.15 each.
    const m0 = tr('npc_marcus');
    for (let i = 0; i < 3; i++) await G.Pipeline.submit('/rest');
    out.marcus = [tr('npc_marcus').w - m0.w, tr('npc_marcus').t - m0.t, S.npc('npc_marcus').memories.filter(m => m.event === 'crossed').map(m => m.n || 1)];
    return out;
  });
  await checked(page, 'example 13');
  assert.equal(r.darleneHere, false, 'Darlene is at home');
  assert.equal(r.kind, 3, 'a kind remark: a normal compliment (W +3)');
  assert.deepEqual(r.told, ['UNDER 18: Kaylee Pittman is 16: any romantic or sexual advance is unwelcome and alarming; she is uncomfortable, gets away or goes to her father; never warm, never flirtatious.'], 'told before it writes');
  const k = r.kaylee.tracks;
  assert.equal(k.w - r.kaylee.from.w, -20, 'Kaylee: liking -20 (design W -15 from her 5; here from 8, after the compliment)');
  assert.equal(k.t - r.kaylee.from.t, -23, 'trust -20 x1.15 (design T -28 from her -5)');
  assert.equal(r.kaylee.stance, 'suspicious of you');
  assert.equal(r.kaylee.complies, false, 'her fear buys nothing');
  assert.equal(k.s, 0, 'spark stays 0');
  assert.ok(Math.abs(r.royce.w - -2) <= 2 && Math.abs(r.royce.t - -5) <= 2, 'Royce: W -2, T -5 (crossed, he is open): ' + JSON.stringify(r.royce));
  assert.ok(Math.abs(r.darlene.w - -12) <= 2 && Math.abs(r.darlene.t - -19) <= 2, 'Darlene: W -12, T -19 (crossed, she is guarded): ' + JSON.stringify(r.darlene));
  assert.deepEqual(r.memories, [[[3, 'Tester came on to my daughter at Pittman\'s Gas and Service']], [[3, 'Tester came on to my daughter at Pittman\'s Gas and Service']]]);
  assert.deepEqual(r.seeds.map(x => x[0]).sort(), ['npc_darlene', 'npc_royce'], 'two report seeds');
  for (const x of r.seeds) { assert.deepEqual(x[1], ['npc_marcus']); assert.ok(x[2] >= 1 && x[2] <= 2, 'due in a day or two'); }
  assert.equal(r.rep, -10, 'the town -10');
  assert.ok(r.after <= 0, 'nothing anyone says makes it warm: ' + r.after);
  assert.equal(r.marcus[2].reduce((a, m) => a + m, 0), 2, 'the chief takes both reports (one memory, merged)');
  assert.ok(r.marcus[1] <= -20, 'about -11.5 each in trust: ' + r.marcus[1]);
});

s.run();
