'use strict';
/* Wave 29 (A4 of docs/RELATIONSHIPS_PLAN.md: "What people hold: wanting,
   leverage and favours"; the integration plan's 16, 7, 8, 9.3, 19.1, 19.2,
   19.4 and 19.5). Spark with the shipped romance list (welcome before
   narration, the statuses read against caring liking, the feed once a
   week, jealousy, the night together and its gates), leverage (secrets the
   narrator was given and the narration showed, marked rumours, being
   caught, backed asks with the words check and the burned d20, the
   answers by tough and hard, paid is final, the money only by its seed,
   the blackmail loose end as one story, the standoff, the police bar and
   its lift, telling the police), and favours owed both ways. Mock mode.
   Run with: node tests/run.cjs wave29 */
const assert = require('assert/strict');
const { suite, quickStart } = require('./helpers.cjs');

const s = suite('wave29-rel-hold');

/* In the page: __put (the player somewhere with these people, now), __say
   (a Say line, its parse, narration and bookkeeper reply given), __feed
   (the quiet lines since), __give (the player holding someone's secret, as
   the narrator was given it), __model (the bookkeeper's events applied
   with the turn's narration), __tr (the tracks). */
const setup = page => page.evaluate(() => {
  const G = Game;
  G.Api.Mock.delay = 0;
  window.__put = (locId, ids, day, phase) => {
    const S = G.State;
    if (day) S.apply({ setTime: { day, phase: phase || 'evening' } });
    S.apply({ playerLocationId: locId });
    if (ids && ids.length) S.apply({ visits: ids.map(id => ({ npcId: id, locationId: locId })) });
    return S.npcsAt(locId).map(n => n.id);
  };
  /* Wave 34: a flirt is a charm roll at the person's difficulty. The flirt
     rows here are about what a welcome flirt (or an unwelcome one) does, so
     __say forces its tier: window.__tier (success unless a test says
     otherwise; null leaves it to the dice). */
  window.__tier = 'success';
  window.__say = async (to, words, parse, book, narration) => {
    if (parse && (parse.romantic === 'flirt' || parse.romantic === 'more') && window.__tier) G.Pipeline.hooks.nextTier = window.__tier;
    G.Api.Mock.queue('parse', Object.assign({ actionType: 'talk', summary: words, targets: to === 'everyone' ? G.State.npcsAt(G.state.player.locationId).map(n => n.id) : [to], needsRoll: false, timeCost: 'instant', romantic: null }, parse || {}));
    if (narration) G.Api.Mock.queue('narrate', { text: narration });
    if (book) G.Api.Mock.queue('bookkeep', book);
    return G.Pipeline.submit(words, { mode: 'say', to });
  };
  window.__feed0 = 0;
  window.__mark = () => { window.__feed0 = document.querySelectorAll('#feed .f-quiet').length; };
  window.__feed = () => [...document.querySelectorAll('#feed .f-quiet')].slice(window.__feed0).map(x => x.textContent);
  window.__give = (id, text, extra) => {
    const S = G.State;
    S.apply({ secretShown: [{ npcId: id, how: 'roll' }] });
    const n = S.npc(id);
    return S.apply({ leverageAdd: Object.assign({ holder: 'player', over: id, about: { kind: 'secret' }, text, weight: G.Rel.secretWeightOf(n), mattersTo: G.Rel.mattersToOf(n) }, extra || {}) });
  };
  window.__model = (events, present, narration, extra) => G.State.apply({ socialEvents: events }, Object.assign({ source: 'model', present, narration: narration || '' }, extra || {}));
  window.__tr = id => G.Rel.tracksOf(G.State.npc(id));
  window.__lev = (holder, over) => G.state.leverage.filter(x => (!holder || x.holder === holder) && (!over || x.over === over));
});
const start = async (h, opts) => { const page = await h.open(); await quickStart(page, Object.assign({ kinds: [] }, opts || {})); await setup(page); return page; };

s.test('learning a secret is leverage only when the narrator had it: a turn\'s words without it are refused, a marked rumour counts and she doesn\'t know you know', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    __put('loc_pittmans', ['npc_royce'], 2, 'morning');
    const narr = 'Royce says Carter Sturdivant holds the note on the station and has offered him the truck stop lease if he votes right.';
    // Never shown to the narrator: refused, whatever the narration says.
    out.unshown = __model([{ npcId: 'npc_royce', event: 'learned_secret', text: 'Carter holds the note on the station' }], ['npc_royce'], narr).rejected.map(x => x.reason);
    // Shown (a roll that worked put it in the packet), and the narration shows it: a record in the bookkeeper's words.
    S.apply({ secretShown: [{ npcId: 'npc_royce', how: 'roll' }] });
    __mark();
    out.shown = __model([{ npcId: 'npc_royce', event: 'learned_secret', text: 'Carter holds the note on the station' }], ['npc_royce'], narr);
    out.royce = __lev('player', 'npc_royce').map(x => [x.id, x.text, x.weight, x.aware, x.status, x.mattersTo]);
    out.memory = S.npc('npc_royce').memories.filter(m => m.event === 'learned_secret').map(m => [m.text, m.leverageId]);
    out.notSecretField = __lev('player', 'npc_royce').every(x => x.text !== S.npc('npc_royce').secret);
    out.roycePacket = G.Pipeline.parsePacket('Pay up or the note on the station gets out', { speech: { mode: 'do' } }).text.split('\n').find(l => /^WHAT THE PLAYER HOLDS/.test(l)) || null;
    out.royceFeed = __feed();
    // A marked rumour, heard: something on Mavis, and she does not know it (no fear, no tag); the secret counts as shown, by rumour.
    __mark();
    out.heard = S.apply({ rumoursHeard: ['rum_mavis_cash_rooms'] });
    out.mavis = __lev('player', 'npc_mavis').map(x => [x.text, x.aware, x.since.via, x.weight, x.mattersTo]);
    out.how = st.known.secrets.npc_mavis;
    out.mavisFear = __tr('npc_mavis').f;
    out.mavisTags = R.stance(S.npc('npc_mavis')).tags;
    out.mavisFeed = __feed();
    // A rumour no content marks is only a rumour.
    S.apply({ rumoursHeard: ['rum_lamar_check'] });
    out.lamar = __lev('player', 'npc_lamar').length;
    return out;
  });
  assert.match(r.unshown.join(' | '), /learned_secret for npc_royce refused: their secret was never in the narrator's packet/);
  assert.deepEqual(r.shown.rejected, []);
  assert.deepEqual(r.royce, [['lev_royce_1', 'Carter holds the note on the station', 3, true, 'held', ['npc_jolene', 'npc_darlene']]], 'weight 3 (content), aware, mattering to Jolene and Darlene');
  assert.deepEqual(r.memory, [['Carter holds the note on the station', 'lev_royce_1']], 'the memory carries its record');
  assert.equal(r.notSecretField, true, 'never the secret field');
  assert.equal(r.roycePacket, 'WHAT THE PLAYER HOLDS (put the id in aboutIds when the player\'s words use it, to threaten or to ask): lev_royce_1: what you have on Royce Pittman: Carter holds the note on the station');
  assert.ok(r.royceFeed.includes('Royce Pittman knows you know.'), JSON.stringify(r.royceFeed));
  assert.deepEqual(r.mavis, [['Mavis Mangum rings up a cash room at the motor court now and then that never makes it into the book.', false, 'rumour', 3, ['npc_dewayne']]]);
  assert.deepEqual([r.how.how, r.how.turn >= 0], ['rumour', true]);
  assert.equal(r.mavisFear, 0, 'she does not know: no fear of it');
  assert.ok(!r.mavisTags.some(t => /something on/.test(t)), 'and no tag: ' + r.mavisTags);
  assert.deepEqual(r.mavisFeed, ['You have something on Mavis Mangum now.']);
  assert.equal(r.lamar, 0);
});

s.test('leverage needs the story to show it: the secret in the packet but not in the narration is refused; two of its keys in the narration make the record', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    const out = {};
    __put('loc_byrds_pawn', ['npc_hollis'], 2, 'afternoon');
    out.keys = R.keysOf(S.npc('npc_hollis'));
    // A charm roll that works puts his secret in the narrator's packet (known.secrets, by roll) ...
    G.Pipeline.forceNextRoll(18);
    await __say('npc_hollis', 'What are these receipts really for?', { actionType: 'persuade', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_hollis learned_secret: runs the landing\'s cash through his books'] }, 'Hollis turns the toothpick over and says he does not ask where, only how much.');
    out.packet = /secret \(it can come out now/.test(G.Pipeline.lastTurn.packet);
    out.known = st.known.secrets.npc_hollis;
    out.none = __lev('player', 'npc_hollis').length;
    out.why = S.debugLog.filter(x => x.kind === 'rejected' && /learned_secret/.test(x.reason || '')).map(x => x.reason).slice(-1)[0] || null;
    // One key is not enough; two are.
    out.one = __model([{ npcId: 'npc_hollis', event: 'learned_secret', text: 'keeps a cash book' }], ['npc_hollis'], 'He pats the cash book under the counter.').rejected.map(x => x.reason);
    out.two = __model([{ npcId: 'npc_hollis', event: 'learned_secret', text: 'runs the landing\'s cash through his pawn books' }], ['npc_hollis'], '"I don\'t ask where," he says, and slides over the landing\'s cash book: pawn sales, every one.').rejected;
    out.rec = __lev('player', 'npc_hollis').map(x => [x.weight, x.aware, x.mattersTo]);
    out.tracks = __tr('npc_hollis');
    out.stance = R.stance(S.npc('npc_hollis'));
    out.reason = R.reasons(S.npc('npc_hollis'), 2)[0];
    // A late retry of the same turn still passes (the secret stays shown).
    out.again = __model([{ npcId: 'npc_hollis', event: 'learned_secret', text: 'his books' }], ['npc_hollis'], 'The cash book, the pawn sales.').applied.join(' | ');
    return out;
  });
  assert.deepEqual(r.keys, ['cash book', 'pawn sales', 'converters']);
  assert.equal(r.packet, true, 'the secret was in the narrator\'s packet');
  assert.equal(r.known.how, 'roll');
  assert.equal(r.none, 0, 'the narration did not show it: no record');
  assert.match(r.why, /the narration shows 0 of their 3 keys \(it takes 2\)/);
  assert.match(r.one.join(' | '), /shows 1 of their 3 keys/);
  assert.deepEqual(r.two, []);
  assert.deepEqual(r.rec, [[3, true, ['npc_marcus']]]);
  assert.equal(r.tracks.f, 30, 'the fear of what the player knows: 10 x weight 3');
  assert.deepEqual(r.stance.tags.slice(0, 1), ['you have something on them']);
  assert.equal(r.reason.leverage, 'lev_hollis_1');
  assert.match(r.again, /knows \+2 only \(the player already holds that\)/);
});

s.test('intimidation backed by what the player knows: weight 2 needs no roll and the die is still drawn, weight 1 is easy, a hard man may call the bluff and Wade makes it go away', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    const out = {};
    const ask = async (id, loc, words, parse) => {
      __put(loc, [id], 3, 'afternoon');
      const c0 = st.meta.rngCalls;
      await __say(id, words, Object.assign({ actionType: 'intimidate', aboutIds: R.holdsOver(S.npc(id)).map(x => x.id) }, parse || {}));
      const t = G.Pipeline.lastTurn;
      return { draws: st.meta.rngCalls - c0, roll: t.roll ? [t.roll.difficulty, t.roll.success] : null, line: t.packet.split('\n').filter(l => /^LEVERAGE/.test(l)), outcome: t.packet.split('\n').filter(l => /^OUTCOME/.test(l)).length,
        mems: S.npc(id).memories.filter(m => m.turn === st.meta.turn).map(m => m.event), rec: R.holdsOver(S.npc(id)).map(x => [x.status, x.aware, x.uses.map(u => u.event)]),
        seeds: st.seeds.filter(sd => sd.origin && sd.origin.npcId === id && sd.turn === st.meta.turn).map(sd => [sd.origin.kind, sd.origin.why || null]) };
    };
    // Weight 2 (Trent's grain truck; he is hard, so it rolls normal): the bluff can be called.
    __give('npc_tyler', 'copied the motel camera clips onto a thumb drive');
    __give('npc_lyman', 'steamed open the envelopes Carter left with him');
    __give('npc_carter', 'asked Dr. Sayle to find his mother unfit');
    __give('npc_wade', 'beat Calvin Ogletree half to death below the landing');
    // Lyman (weight 2, not hard): no roll, the die drawn on its own stream (a forced one used up, not rolled).
    out.lyman = await ask('npc_lyman', 'loc_low_water', 'Keep your mouth shut about me, or Loretta hears about those envelopes.');
    G.Pipeline.forceNextRoll(3);
    out.lymanAgain = await ask('npc_lyman', 'loc_low_water', 'And keep it shut, or Loretta hears about those envelopes.');
    out.forced = G.Pipeline.hooks.nextD20;
    // Tyler (weight 1): easy, a roll.
    G.Pipeline.forceNextRoll(2);
    out.tyler = await ask('npc_tyler', 'loc_motor_court', 'Hand me the drive, or Carter hears about those clips.', { stat: 'might' });
    // Carter (hard): normal; he refuses whatever the die says and talks.
    G.Pipeline.forceNextRoll(19);
    out.carter = await ask('npc_carter', 'loc_sturdivant_house', 'A hundred dollars, or Vada hears what you asked Dr. Sayle.', { stat: 'might' });
    // Wade (tough): he won't pay, and answers with violence.
    G.Pipeline.forceNextRoll(19);
    out.wade = await ask('npc_wade', 'loc_purvis_landing', 'Two hundred, or the chief hears about Calvin Ogletree.', { stat: 'might' });
    return out;
  });
  assert.equal(r.lyman.roll, null, 'weight 2: no roll');
  assert.ok(r.lyman.draws >= 1, 'the d20 drawn all the same: ' + r.lyman.draws);
  assert.equal(r.lymanAgain.roll, null);
  assert.equal(r.forced, null, 'the forced die was used up, not rolled');
  assert.deepEqual(r.lyman.line, ['LEVERAGE: Lyman Coker goes along with it; he knows what you know.']);
  assert.equal(r.lyman.outcome, 0, 'its outcome is the LEVERAGE line');
  assert.deepEqual(r.lyman.mems, ['threatened_to_tell'], 'no price: threatened_to_tell, never threatened on top');
  assert.deepEqual(r.lyman.rec, [['used', true, ['threatened_to_tell']]]);
  assert.deepEqual(r.tyler.roll, ['easy', false], 'weight 1: an easy roll (a 2 fails even that)');
  assert.deepEqual(r.tyler.line, ['LEVERAGE: Tyler Rasberry calls the bluff and gives nothing.']);
  assert.deepEqual(r.carter.roll, ['normal', true], 'a hard man: a normal roll');
  assert.deepEqual(r.carter.line, ['LEVERAGE: Carter Sturdivant refuses: "Tell them, then."'], 'he calls it, whatever the die');
  assert.deepEqual(r.carter.mems, ['blackmailed'], 'a price: blackmailed');
  assert.deepEqual(r.carter.seeds, [['grudge', 'nobody']], 'he talks: a gossip grudge (nobody to report to)');
  assert.deepEqual(r.wade.line, ['LEVERAGE: Wade Purvis won\'t pay and won\'t be pushed; he makes it plain he will answer for it.']);
  assert.deepEqual(r.wade.seeds, [['grudge', 'tough']], 'Wade makes it go away: a violence grudge, planted now');
});

s.test('a threat must use what the player knows: an ask of Hollis with no words about the books ignores the record and rolls', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    __give('npc_hollis', 'runs the landing\'s cash through his pawn books');
    __put('loc_byrds_pawn', ['npc_hollis'], 3, 'afternoon');
    const n = (input, ids) => G.Pipeline.normaliseParse({ actionType: 'intimidate', summary: 'x', targets: ['npc_hollis'], aboutIds: ids || ['lev_hollis_1'], needsRoll: true, stat: 'might', difficulty: 'normal' }, input).aboutIds;
    const out = {
      plain: n('Lend me fifty for the week.'), words: n('I saw the pawn books and the cash.'), threat: n('Fifty, or the chief hears about it.'), stray: n('Give me a deal.', ['lev_hollis_9']),
      debug: S.debugLog.filter(x => x.kind === 'rel' && /lev id ignored/.test(x.text)).map(x => x.text)
    };
    G.Pipeline.forceNextRoll(14);
    await __say('npc_hollis', 'Lend me fifty for the week.', { actionType: 'intimidate', aboutIds: ['lev_hollis_1'], needsRoll: true, stat: 'might', difficulty: 'normal' });
    const t = G.Pipeline.lastTurn;
    out.turn = { roll: t.roll ? t.roll.d20 : null, about: t.action.aboutIds, lev: t.packet.split('\n').some(l => /^LEVERAGE/.test(l)), backed: !!t.ctx.backed, rec: R.holdsOver(S.npc('npc_hollis'))[0].status };
    return out;
  });
  assert.deepEqual(r.plain, [], 'no words about the books: the id is dropped');
  assert.deepEqual(r.words, ['lev_hollis_1'], 'two words of the record');
  assert.deepEqual(r.threat, ['lev_hollis_1'], 'a threat phrase');
  assert.deepEqual(r.stray, [], 'an id the player holds nothing under');
  assert.ok(r.debug.some(x => /the words did not use it \(lev_hollis_1\)/.test(x)) && r.debug.some(x => /not a record the player holds \(lev_hollis_9\)/.test(x)), JSON.stringify(r.debug));
  assert.deepEqual(r.turn, { roll: 14, about: [], lev: false, backed: false, rec: 'held' }, 'an ordinary ask: rolled, the record untouched');
});

s.test('paid is final: a second demand costs the player and moves no money; a target owing a demand hands over nothing until the seed brings it', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    const out = {};
    __give('npc_hollis', 'runs the landing\'s cash through his pawn books');
    __put('loc_byrds_pawn', ['npc_hollis'], 3, 'afternoon');
    await __say('npc_hollis', 'Three hundred, or the sheriff gets your books.', { actionType: 'intimidate', aboutIds: ['lev_hollis_1'] });
    out.demand = R.demands().map(x => [x.npcId, x.amount, x.dueDay]);
    out.recap = G.Pipeline.recapText().split('\n').find(l => /^Owed:/.test(l)) || null;
    out.journal = (() => { G.UI.openPanel('journal'); const li = document.querySelector('#panel-body [data-section="owe"] [data-leverage="lev_hollis_1"]'); return li ? li.textContent : null; })();
    // The narration has him pay now: refused, the money comes with the seed.
    const g0 = st.player.gold;
    out.early = S.apply({ goldDelta: 300 }, { source: 'model', present: ['npc_hollis'] }).rejected.map(x => x.reason);
    out.gold = st.player.gold - g0;
    // The next morning the seed brings it.
    await G.Pipeline.submit('/rest');
    out.paid = [st.player.gold - g0, R.holdsOver(S.npc('npc_hollis'))[0].status, R.demands().length, S.npc('npc_hollis').memories.filter(m => m.event === 'paid_silence').map(m => [m.d.w, m.d.t])];
    out.journalPaid = (() => { G.UI.openPanel('journal'); const li = document.querySelector('#panel-body [data-section="owe"] [data-leverage="lev_hollis_1"]'); return li ? [li.className, li.textContent] : null; })();
    // A second demand: paid is final.
    __put('loc_byrds_pawn', ['npc_hollis'], st.time.day, 'afternoon');
    const t0 = __tr('npc_hollis');
    const g1 = st.player.gold;
    await __say('npc_hollis', 'Another three hundred, or the sheriff gets your books.', { actionType: 'intimidate', aboutIds: ['lev_hollis_1'] });
    const t1 = __tr('npc_hollis');
    out.second = { line: G.Pipeline.lastTurn.packet.split('\n').filter(l => /^LEVERAGE/.test(l)), mems: S.npc('npc_hollis').memories.filter(m => m.turn === st.meta.turn).map(m => m.event), d: [t1.w - t0.w, t1.t - t0.t], status: R.holdsOver(S.npc('npc_hollis'))[0].status,
      seeds: st.seeds.filter(sd => sd.origin && sd.origin.kind === 'leverage' && !sd.fired).length, demands: R.demands().length };
    await G.Pipeline.submit('/rest');
    out.second.gold = st.player.gold - g1;
    return out;
  });
  assert.deepEqual(r.demand, [['npc_hollis', 300, 4]], 'his $300 (canRaise 300, weight 3), due tomorrow');
  assert.match(r.recap, /Hollis Byrd: \$300 for keeping quiet, due Day 4 \(1 day\)/);
  assert.match(r.journal || '', /Hollis Byrd: \$300 for keeping quiet/);
  assert.match(r.early.join(' | '), /the payment arrives when they bring it/);
  assert.equal(r.gold, 0);
  assert.deepEqual(r.paid, [300, 'paid', 0, [[-5, 0]]], 'the seed: $300, the record paid, his paid_silence at liking -5');
  assert.ok(r.journalPaid && /jr-done/.test(r.journalPaid[0]) && /Settled/.test(r.journalPaid[1]), 'struck through, settled: ' + JSON.stringify(r.journalPaid));
  assert.deepEqual(r.second.line, ['LEVERAGE: Hollis Byrd says he already paid, and won\'t again.']);
  assert.deepEqual(r.second.mems, ['threatened_to_tell'], 'a demand on a paid record is a threat to tell');
  assert.ok(r.second.d[0] <= -14 && r.second.d[1] <= -15, 'it costs the player (trust -20 x his openness): ' + r.second.d);
  assert.deepEqual([r.second.status, r.second.seeds, r.second.demands, r.second.gold], ['paid', 0, 0, 0], 'still paid; no seed, no demand, no money');
});

s.test('the hard but not tough refuse and talk or report; the tough answer with violence; everyone else agrees to pay tomorrow and pays nothing now', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    const ask = async (id, loc, words) => {
      __put(loc, [id], 3, 'afternoon');
      const g0 = st.player.gold;
      await __say(id, words, { actionType: 'intimidate', aboutIds: R.holdsOver(S.npc(id)).map(x => x.id) });
      return { line: G.Pipeline.lastTurn.packet.split('\n').filter(l => /^LEVERAGE/.test(l))[0], gold: st.player.gold - g0, seeds: st.seeds.filter(sd => sd.origin && sd.origin.npcId === id && sd.turn === st.meta.turn).map(sd => [sd.origin.kind, sd.origin.why || null, sd.origin.protectors || null]) };
    };
    out.axes = ['npc_trent', 'npc_colt', 'npc_royce'].map(id => { const a = R.axesOf(S.npc(id)); return [id, a.hard, a.tough]; });
    __give('npc_trent', 'drives cases of liquor across the old bridge in the grain truck');
    __give('npc_colt', 'sold Amber the pills in the bottle she died with');
    __give('npc_royce', 'Carter holds the note on the station and offered him the truck stop');
    out.trent = await ask('npc_trent', 'loc_purvis_landing', 'Fifty bucks, or your father hears about the grain truck.');
    out.colt = await ask('npc_colt', 'loc_purvis_landing', 'A hundred, or Tammy hears about the pills.');
    out.royce = await ask('npc_royce', 'loc_pittmans', 'Three hundred dollars, or Jolene hears about the note on the station.');
    out.royceSeed = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'leverage').map(sd => [sd.origin.npcId, sd.trigger.value, sd.effects.map(e => e.op)]);
    out.canRaise = ['npc_hollis', 'npc_jolene', 'npc_curtis', 'npc_royce', 'npc_micah'].map(id => R.canRaise(S.npc(id)));
    return out;
  });
  assert.deepEqual(r.axes, [['npc_trent', true, false], ['npc_colt', true, true], ['npc_royce', false, false]]);
  assert.equal(r.trent.line, 'LEVERAGE: Trent Haskins refuses: "Tell them, then."');
  assert.deepEqual(r.trent.seeds, [['report', 'threat', ['npc_wade']]], 'he goes to his protector, Wade');
  assert.equal(r.colt.line, 'LEVERAGE: Colt Purvis won\'t pay and won\'t be pushed; he makes it plain he will answer for it.');
  assert.deepEqual(r.colt.seeds.map(x => x.slice(0, 2)), [['grudge', 'tough']]);
  assert.equal(r.royce.line, 'LEVERAGE: Royce Pittman agrees to pay $100, all he can raise, by tomorrow evening; he pays nothing now.', 'everyone else: within the $100 default');
  assert.equal(r.royce.gold, 0, 'nothing now');
  assert.deepEqual(r.royceSeed, [['npc_royce', 4, ['playerGold', 'leverageSet', 'socialEvent']]]);
  assert.deepEqual(r.canRaise, [300, 300, 200, 100, 0], 'raised for three people with money to hand; nothing from anyone under 18');
});

s.test('the $200 is one story: the price names it, paying keeps her quiet in the same step, missing it tells the chief, and holding something on her lets it drop', async h => {
  const page = await h.open();
  const one = async (how) => {
    await page.evaluate(() => Game.State.clear());
    await quickStart(page, { kinds: ['secret'] });
    await setup(page);
    return page.evaluate(async how => {
      const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
      const out = {};
      const le = st.player.looseEnds[0];
      const who = S.npc(le.npcId);
      out.who = who.id;
      out.start = __lev(who.id, 'player').map(x => [x.status, x.playerKnows, x.weight, x.mattersTo, x.about.kind, x.text === le.text]);
      if (how === 'standoff') __give(who.id, 'told me the tapes and the warning call');
      const sd = S.seed(le.seedId);
      S.apply({ setTime: { day: sd.trigger.value, phase: 'morning' } });
      __mark();
      W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
      const o = S.obligations().find(x => x.kind === 'blackmail');
      out.fired = [o ? o.id : null, __lev(who.id, 'player').map(x => [x.status, x.playerKnows, x.demand && x.demand.obligationId, x.uses.map(u => u.event)])];
      out.firedFeed = __feed();
      if (how === 'pay') {
        S.apply({ effects: [{ op: 'playerGold', delta: 300 }] });
        __put(st.player.locationId, [who.id]);
        S.apply({ goldDelta: -200, obligationsSettled: [o.id] }, { source: 'model', present: [who.id], targets: [who.id] });
        out.after = [o.status, __lev(who.id, 'player')[0].status, who.memories.filter(m => ['paid_silence', 'paid_back'].includes(m.event)).map(m => [m.event, m.d.w, m.d.t])];
      } else {
        S.apply({ setTime: { day: o.dueDay + 1, phase: 'morning' } });
        W.tick({ to: { day: o.dueDay + 1, phase: 'morning' } });
        out.after = [o.status, __lev(who.id, 'player')[0].status, __lev(who.id, 'player')[0].knownBy.map(x => x.npcId), S.npc('npc_marcus').memories.filter(m => m.event === 'told_anyway').length, __lev('player', who.id).map(x => x.status)];
        out.journal = (() => { G.UI.openPanel('journal'); const li = document.querySelector(`#panel-body [data-section="owe"] [data-obligation="${o.id}"]`); return li ? li.textContent : null; })();
      }
      out.feed = __feed();
      out.tag = R.stance(who).tags[0] || null;
      return out;
    }, how);
  };
  const pay = await one('pay');
  const miss = await one('miss');
  const standoff = await one('standoff');
  for (const x of [pay, miss, standoff]) {
    assert.equal(x.start.length, 1, 'the informant holds one record over the player at game start');
    assert.deepEqual(x.start[0].slice(0, 2), ['held', false], 'held, and the player does not know of it');
    assert.deepEqual([x.start[0][2], x.start[0][3], x.start[0][4], x.start[0][5]], [2, ['npc_marcus'], 'loose_end', true], 'weight 2, mattering to the chief, in the player\'s words');
    assert.equal(x.fired[1][0][0], 'used', 'the price names it');
    assert.deepEqual(x.fired[1][0].slice(1), [true, x.fired[0], ['blackmailed']]);
  }
  const name = id => ({ npc_glenda: 'Glenda Pryor', npc_tyler: 'Tyler Rasberry', npc_shayla: 'Shayla Rawls' })[id];
  assert.ok(pay.firedFeed.includes(`${name(pay.who)} has something on you.`), JSON.stringify(pay.firedFeed));
  assert.deepEqual(pay.after.slice(0, 2), ['met', 'paid'], 'paid in the same step');
  assert.deepEqual(pay.after[2].map(x => x[0]), ['paid_silence'], 'counted once, as silence');
  assert.ok(pay.feed.includes(`${name(pay.who)} will keep quiet.`));
  assert.equal(pay.tag, 'has something on you');
  assert.deepEqual(miss.after.slice(0, 4), ['missed', 'spent', ['npc_marcus'], 1], 'missed: told to the chief');
  assert.ok(miss.feed.includes(`${name(miss.who)} told.`), JSON.stringify(miss.feed));
  assert.deepEqual(standoff.after.slice(0, 2), ['lapsed', 'used'], 'a standoff: it lapses, her record stands');
  assert.deepEqual(standoff.after[4], ['held'], 'and so does the player\'s');
  assert.equal(standoff.after[3], 0, 'nobody told');
  assert.ok(standoff.feed.includes(`${name(standoff.who)} lets it drop.`), JSON.stringify(standoff.feed));
  assert.match(standoff.journal || '', /Dropped/);
  assert.equal(standoff.tag, 'you have something on each other');
});

s.test('the blackmail paid counts once, as silence', async h => {
  const page = await start(h, { kinds: ['secret'] });
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, W = G.World, st = G.state;
    const le = st.player.looseEnds[0];
    const sd = S.seed(le.seedId);
    S.apply({ setTime: { day: sd.trigger.value, phase: 'morning' } });
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    const o = S.obligations().find(x => x.kind === 'blackmail');
    // An older save's copied onMet still says paid_back: it is silence all the same.
    o.onMet = o.onMet.map(e => (e.event === 'paid_silence' ? Object.assign({}, e, { event: 'paid_back' }) : e)).concat([{ op: 'socialEvent', npcId: le.npcId, event: 'gift', text: 'and a tip' }]);
    const n = S.npc(le.npcId);
    const t0 = G.Rel.tracksOf(n);
    const res = S.apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'met' }] });
    const t1 = G.Rel.tracksOf(n);
    return { mems: n.memories.filter(m => m.d && G.Rel.EVENTS[m.event] && G.Rel.EVENTS[m.event].dedupe === 'money').map(m => m.event), d: [t1.w - t0.w, t1.t - t0.t], dropped: res.applied.join(' | '), rec: st.leverage.find(x => x.holder === le.npcId).status };
  });
  assert.deepEqual(r.mems, ['paid_silence'], 'one payment, one event: paid_silence, no paid_back, the tip a money event too many');
  assert.deepEqual(r.d, [5, 10], 'liking +5, trust +10 (good for it)');
  assert.match(r.dropped, /a money event for them was already counted/);
  assert.equal(r.rec, 'paid');
});

s.test('once it\'s out they come for you: the police bar lifts the moment the record is spent and the grudge check runs on the next tick', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const out = {};
    __give('npc_royce', 'Carter holds the note on the station and offered him the truck stop');
    const royce = S.npc('npc_royce');
    out.barred = [R.policeBarred(royce), R.protectorOf(royce)];
    // He hates the player for a theft, and the grudge cannot go to the police while the player holds the note over him.
    S.apply({ socialEvents: [{ npcId: 'npc_royce', event: 'stole_from', text: 'took the till money', weight: 3 }] });
    S.apply({ relSet: { npcId: 'npc_royce', w: -70 } });
    const day = st.time.day;
    W.plantFeelings(day);
    const g1 = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === 'npc_royce');
    out.first = g1.map(sd => W.GRUDGE_TEMPLATES ? null : G.data.GRUDGE_TEMPLATES[sd.origin.template].kind);
    // It comes due and fires (so the 7-day cooldown would hold him), then the player tells.
    for (const sd of g1) { S.apply({ seedsFired: [sd.id] }); sd.trigger.value = day; }
    S.apply({ socialEvents: [{ npcId: 'npc_royce', event: 'stole_from', text: 'took the cash box too', weight: 3 }] });
    S.apply({ relSet: { npcId: 'npc_royce', w: -70 } });
    W.plantFeelings(day + 1);
    out.held = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === 'npc_royce' && !sd.fired).length;
    S.apply({ effects: [{ op: 'leverageSet', id: R.holdsOver(royce)[0].id, status: 'spent', knownBy: ['npc_jolene'] }] });
    out.lifted = [R.policeBarred(royce), R.protectorOf(royce), W.barLifted(royce, day + 1)];
    S.apply({ setTime: { day: day + 1, phase: 'morning' } });
    W.plantFeelings(day + 1);
    out.after = st.seeds.filter(sd => sd.origin && sd.origin.kind === 'grudge' && sd.origin.npcId === 'npc_royce' && !sd.fired).map(sd => G.data.GRUDGE_TEMPLATES[sd.origin.template].kind);
    return out;
  });
  assert.deepEqual(r.barred, [true, { nobody: true, barred: true }], 'while the player holds it: no going to the police (a grudge instead)');
  assert.ok(r.first.length === 1 && r.first[0] !== 'police', 'the grudge is never the police: ' + r.first);
  assert.equal(r.held, 0, 'the cooldown holds him while the bar stands');
  assert.deepEqual(r.lifted, [false, { ids: ['npc_marcus'], hidden: false }, true], 'spent: the bar lifts');
  assert.equal(r.after.length, 1, 'and the grudge check runs at once, no cooldown: ' + r.after);
});

s.test('while each has something on the other, neither reports nor holds a grudge', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const tyler = S.npc('npc_tyler');
    // Tyler caught the player at the motel desk; the player holds his clips.
    S.apply({ leverageAdd: { holder: 'npc_tyler', over: 'player', about: { kind: 'seen' }, text: 'going through the guest register at the desk', weight: 1, mattersTo: ['npc_marcus'], playerKnows: true } });
    __give('npc_tyler', 'copied the camera clips onto a thumb drive');
    // Threatened twice (fear past 40) and hating the player for a theft: a report and a grudge, ordinarily.
    S.apply({ socialEvents: [{ npcId: 'npc_tyler', event: 'threatened', text: 'threatened me at the desk', act: 'intimidate' }] });
    S.apply({ socialEvents: [{ npcId: 'npc_tyler', event: 'threatened', text: 'threatened me at the desk again', act: 'intimidate' }, { npcId: 'npc_tyler', event: 'stole_from', text: 'took the cash drawer', weight: 3 }] });
    S.apply({ relSet: { npcId: 'npc_tyler', w: -70 } });
    const out = { standoff: R.standoff(tyler), fear: R.tracksOf(tyler).f, tag: R.stance(tyler).tags[0] };
    const day = st.time.day;
    W.plantFeelings(day);
    out.held = st.seeds.filter(sd => sd.origin && sd.origin.npcId === 'npc_tyler').map(sd => sd.origin.kind);
    // The player's record is voided: the standoff is over, and he reports and holds it against them.
    S.apply({ effects: [{ op: 'leverageSet', id: R.holdsOver(tyler)[0].id, status: 'void' }] });
    W.plantFeelings(day);
    out.after = st.seeds.filter(sd => sd.origin && sd.origin.npcId === 'npc_tyler').map(sd => sd.origin.kind).sort();
    return out;
  });
  assert.equal(r.standoff, true);
  assert.ok(r.fear >= 40, 'afraid: ' + r.fear);
  assert.equal(r.tag, 'you have something on each other');
  assert.deepEqual(r.held, [], 'nothing planted while both stand');
  assert.ok(r.after.includes('report') || r.after.includes('grudge') || r.after.includes('tell'), 'once one is gone, he acts: ' + r.after);
});

s.test('a lie Trent caught in the cab is a record that matters to nobody; a bar fight makes no record at all', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, M = G.Api.Mock, st = G.state;
    const out = {};
    __put('loc_haskins_farm', ['npc_trent'], 5, 'evening');
    const others = S.npcsAt('loc_haskins_farm').map(n => n.id).filter(id => id !== 'npc_trent');
    S.apply({ visits: others.map(id => ({ npcId: id, locationId: 'loc_front_street' })) });
    out.here = S.npcsAt('loc_haskins_farm').map(n => n.id);
    G.Pipeline.forceNextRoll(4);
    await __say('npc_trent', 'I was just looking for my phone.', { actionType: 'deceive', needsRoll: true, stat: 'charm', difficulty: 'normal' },
      { socialEvents: ['npc_trent caught_you_at: caught me in the grain truck cab, lying about my phone'] });
    out.trent = __lev('npc_trent', 'player').map(x => [x.about.kind, x.weight, x.mattersTo, x.playerKnows, x.since.via]);
    out.tag = R.stance(S.npc('npc_trent')).tags[0] || null;
    // A fight at the Low Water in front of everyone: a memory and news, never a record.
    __put('loc_low_water', ['npc_boyd', 'npc_loretta', 'npc_royce'], 6, 'night');
    const before = st.leverage.length;
    M.queue('parse', { actionType: 'attack', summary: 'Hits Boyd', targets: ['npc_boyd'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I hit Boyd');
    M.queue('parse', { actionType: 'attack', summary: 'Hits Boyd', targets: ['npc_boyd'], needsRoll: true, stat: 'might', difficulty: 'normal', timeCost: 'instant' });
    G.Pipeline.hooks.nextTier = 'success';
    await G.Pipeline.submit('I hit Boyd again', { }) ;
    // And the bookkeeper's caught_you_at for a fight is refused: violence is never a secret.
    out.refused = __model([{ npcId: 'npc_loretta', event: 'caught_you_at', text: 'caught them hitting Boyd' }], S.npcsAt('loc_low_water').map(n => n.id), '', { actionType: 'attack', targets: ['npc_boyd'] }).rejected.map(x => x.reason);
    out.fight = st.leverage.length - before;
    return out;
  });
  assert.deepEqual(r.here, ['npc_trent'], 'alone with Trent in the yard');
  assert.deepEqual(r.trent, [['seen', 2, [], true, 'caught_you_at']], 'a lie: weight 2, mattering to nobody, and the player knows');
  assert.equal(r.tag, 'has something on you');
  assert.equal(r.fight, 0, 'a bar fight makes no record');
  assert.match(r.refused.join(' | '), /never a fight/);
});

s.test('telling the chief about Hollis\'s books gives Marcus a serious memory and an inquiry that moves the police clock', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const out = {};
    __give('npc_hollis', 'runs the landing\'s cash through his pawn books');
    __put('loc_town_hall', ['npc_marcus'], 3, 'morning');
    const clock = () => { const f = S.faction('fac_police'); const c = W.activeClock(f); return c ? c.filled : null; };
    const c0 = clock();
    const h0 = __tr('npc_hollis');
    const m0 = __tr('npc_marcus');
    out.told = __model([{ npcId: 'npc_marcus', event: 'exposed', aboutId: 'npc_hollis', text: 'told me Hollis runs the landing\'s cash through his books' }], ['npc_marcus']);
    out.marcus = S.npc('npc_marcus').memories.filter(m => m.turn === st.meta.turn).map(m => [m.event, m.weight, m.text]);
    out.marcusT = __tr('npc_marcus').t - m0.t;
    // Changed by design in wave 32 (B2): Hollis is not there, so he hears who told by the tie between them (none: by the morning).
    out.queued = st.hearsay.filter(x => x.npcId === 'npc_hollis' && x.own).map(x => [x.event, x.via]);
    out.rec = st.leverage.map(x => [x.status, x.knownBy.map(k => k.npcId)]);
    const sd = st.seeds.find(x => x.origin && x.origin.kind === 'inquiry');
    out.seed = sd ? [sd.origin.npcId, sd.trigger.value - st.time.day, sd.effect, sd.effects.map(e => e.op)] : null;
    S.apply({ setTime: { day: sd.trigger.value, phase: 'morning' } });
    S.apply({ hearsayDeliver: { day: st.time.day, phase: 'morning' } });
    const h1 = __tr('npc_hollis');
    out.hollis = { d: [h1.w - h0.w, h1.t - h0.t], fear: [h0.f, h1.f], mem: S.npc('npc_hollis').memories.filter(m => m.event === 'exposed').map(m => [m.weight, m.decay, m.about, m.day]) };
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    out.clock = [c0, clock()];
    out.free = S.npc('npc_hollis').status;
    out.news = st.news.map(n => n.text).filter(t => /Byrd's Pawn/.test(t));
    out.hates = R.stance(S.npc('npc_hollis')).phrase;
    return out;
  });
  assert.deepEqual(r.told.rejected, []);
  assert.ok(r.marcus.some(m => m[0] === 'noted' && m[1] === 3 && m[2] === 'was told Hollis Byrd runs the landing\'s cash through his pawn books'), 'a serious memory, in the hook\'s words: ' + JSON.stringify(r.marcus));
  assert.ok(r.marcus.some(m => m[0] === 'exposed'), 'and the telling itself');
  assert.ok(r.marcusT >= 6, 'trust +8 for being told (x his guardedness): ' + r.marcusT);
  assert.deepEqual(r.rec, [['spent', ['npc_marcus']]], 'the record spent, told to him');
  assert.deepEqual(r.queued, [['exposed', 'morning']]);
  assert.deepEqual(r.hollis.mem, [[3, 'scar', 'npc_marcus', 3]], 'Hollis learns who told: a weight-3 scar, dated by the telling');
  assert.ok(r.hollis.d[0] <= -28 && r.hollis.d[1] <= -26, 'liking -30, trust -30: ' + r.hollis.d);
  assert.ok(r.hollis.fear[1] < r.hollis.fear[0], 'the fear of what the player knew goes');
  assert.ok(r.seed && r.seed[0] === 'npc_marcus' && r.seed[1] >= 1 && r.seed[1] <= 2, 'an inquiry in a day or two: ' + JSON.stringify(r.seed));
  assert.equal(r.seed[2], 'Chief Bell spends a morning at Byrd\'s Pawn going through the ledgers.');
  assert.deepEqual(r.seed[3], ['clockAdjust', 'addNews']);
  assert.equal(r.clock[1], r.clock[0] + 1, 'one segment of the police clock');
  assert.equal(r.free, 'free', 'never an arrest');
  assert.equal(r.news.length, 1);
});

s.test('wanting against caring: Shayla is using you, Jodie is sweet on you at almost the same spark; a partner who sees it cools; spark fades in days unless fed', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    // Shayla at her chair, Travis there: a lie caught, then flirts that are welcome (sparkRate 1.5, opens at 0).
    __put('loc_riverbend', ['npc_shayla', 'npc_travis'], 2, 'morning');
    const tv0 = __tr('npc_travis');
    S.apply({ relAsk: { npcId: 'npc_shayla', act: 'deceive', ok: false, about: 'went through the academy with Travis' } });
    __model([{ npcId: 'npc_shayla', event: 'lied_caught', text: 'never went through the academy with Travis' }], ['npc_shayla', 'npc_travis']);
    for (const d of [2, 3, 4, 5]) {
      __put('loc_riverbend', ['npc_shayla'].concat(d === 2 ? ['npc_travis'] : []), d, 'morning');
      await __say('npc_shayla', 'You look good today.', { romantic: 'flirt' });
    }
    out.travis = { d: [__tr('npc_travis').w - tv0.w, __tr('npc_travis').t - tv0.t], mem: S.npc('npc_travis').memories.filter(m => m.event === 'crossed').map(m => m.text) };
    const sh = S.npc('npc_shayla');
    out.shayla = { tr: R.tracksOf(sh), phrase: R.stance(sh).phrase, tags: R.stance(sh).tags, sp: R.sparkStatus(sh), cue: R.cue(sh) };
    // Jodie at the Low Water: known well enough (her opensAt is 20), helped twice, then flirts.
    __put('loc_low_water', ['npc_jodie'], 2, 'evening');
    S.apply({ relSet: { npcId: 'npc_jodie', k: 25 } });
    __model([{ npcId: 'npc_jodie', event: 'did_favour', text: 'covered her shift' }], ['npc_jodie']);
    S.apply({ setTime: { day: 3, phase: 'evening' } });
    __model([{ npcId: 'npc_jodie', event: 'did_favour', text: 'fixed the lock on her door' }], ['npc_jodie']);
    S.apply({ relSet: { npcId: 'npc_jodie', w: 28 } });
    // Changed by design in wave 35: those favours came before any spark, so they grew no romance (romance grows out of wanting plus substance).
    out.jodieEarly = R.tracksOf(S.npc('npc_jodie')).m;
    for (const d of [3, 4, 5, 6]) {
      __put('loc_low_water', ['npc_jodie'], d, 'evening');
      await __say('npc_jodie', 'You have a nice smile.', { romantic: 'flirt' });
      // Wave 35: once she has noticed (spark 20), substance grows romance: she confides, and (a turn later) the player does her a favour.
      if (d >= 4) {
        __model([{ npcId: 'npc_jodie', event: 'they_confided', text: `told me about her brother, night ${d}` }], ['npc_jodie']);
        await __say('npc_jodie', 'Anything I can do?');
        __model([{ npcId: 'npc_jodie', event: 'did_favour', text: `walked me to my car, night ${d}` }], ['npc_jodie']);
      }
    }
    const jo = S.npc('npc_jodie');
    out.jodie = { tr: R.tracksOf(jo), phrase: R.stance(jo).phrase, sp: R.sparkStatus(jo), cue: R.cue(jo) };
    // Unfed, spark fades: a week on.
    S.apply({ setTime: { day: 12, phase: 'morning' } });
    S.apply({ relDay: 12 });
    out.later = [R.tracksOf(S.npc('npc_shayla')).s, R.sparkStatus(S.npc('npc_shayla')), R.tracksOf(jo).s];
    return out;
  });
  const sh = r.shayla.tr;
  const jo = r.jodie.tr;
  assert.ok(Math.abs(sh.s - jo.s) <= 12, `almost the same spark: ${sh.s} and ${jo.s}`);
  assert.equal(r.shayla.sp, 'using you', JSON.stringify(r.shayla));
  assert.equal(r.shayla.phrase, 'suspicious of you');
  assert.deepEqual(r.shayla.tags, ['using you'], '"Suspicious of you · using you"');
  assert.match(r.shayla.cue, /^wants you around for one reason, doesn't ask about your day/);
  assert.equal(r.jodie.sp, 'sweet on you', JSON.stringify(r.jodie));
  // Changed by design in wave 35: romance, its own track, in place of caring liking.
  assert.equal(r.jodieEarly, 0, 'favours before any spark grow no romance');
  assert.ok(jo.m >= 30 && sh.m < 20, `romance: Jodie ${jo.m}, Shayla ${sh.m}`);
  assert.match(r.jodie.cue, /^lights up when you come in, remembers what you told her/);
  assert.deepEqual(r.travis.mem, ['flirted with Shayla Rawls in front of me'], 'her boyfriend saw it');
  assert.ok(r.travis.d[0] <= -15 && r.travis.d[1] <= -8, 'W -15 x (1 + 0.25 pride), T -10: ' + r.travis.d);
  assert.ok(r.later[0] < sh.s / 2 && r.later[1] !== 'using you', 'a week unfed and the spark is going: ' + r.later);
  assert.ok(r.later[2] < jo.s / 2, 'hers too');
});

s.test('favours owed: two favours plant a payback with no cash unless they like and trust the player; you owe them: asked twice, then crossed', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, W = G.World, st = G.state;
    const out = {};
    const T = G.data.FAVOUR_TEMPLATES;
    const cash = t => (t.effects || []).some(e => e.op === 'playerGold' && e.delta > 0);
    const owedSeed = id => st.seeds.find(sd => sd.origin && sd.origin.kind === 'favour' && sd.origin.npcId === id && sd.origin.why === 'owed' && !sd.fired);
    // Burl owes the player twice: a payback, never the cash work while his liking is under 25.
    S.apply({ socialEvents: [{ npcId: 'npc_burl', event: 'did_favour', text: 'got his motor up the ramp' }] });
    S.apply({ setTime: { day: 2, phase: 'afternoon' } });
    S.apply({ socialEvents: [{ npcId: 'npc_burl', event: 'did_favour', text: 'fetched the carb kit' }] });
    out.burl = [R.tracksOf(S.npc('npc_burl')).owed, R.stance(S.npc('npc_burl')).tags];
    const picks = { low: [], high: [] };
    for (const [k, w] of [['low', 15], ['high', 40]]) {
      S.apply({ relSet: { npcId: 'npc_burl', w, t: 10 } });
      // Each day's draw is its own (Rel.rng keyed by the day): the seed it plants is taken away again before the next.
      for (let day = 2; day < 32; day++) {
        W.owedFavour(S.npc('npc_burl'), day);
        const sd = owedSeed('npc_burl');
        if (sd) { picks[k].push(sd.origin.template); st.seeds.splice(st.seeds.indexOf(sd), 1); }
      }
    }
    out.low = picks.low.map(i => cash(T[i]));
    out.high = picks.high.map(i => cash(T[i]));
    out.highIdx = picks.high;
    S.apply({ relSet: { npcId: 'npc_burl', w: 15, t: 10 } });
    W.plantFeelings(2);
    const sd = owedSeed('npc_burl');
    out.seed = sd ? [sd.effects.map(e => e.op), sd.trigger.value] : null;
    S.apply({ setTime: { day: sd.trigger.value, phase: 'morning' } });
    W.fireSeeds({ turn: st.meta.turn, time: { day: st.time.day, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] });
    out.square = [R.tracksOf(S.npc('npc_burl')).owed, S.npc('npc_burl').rel.owed.length];
    // The player owes Dewayne (the mechanic): after five days he asks, again three days later, then he crosses it off.
    const day0 = st.time.day;
    S.apply({ socialEvents: [{ npcId: 'npc_dewayne', event: 'they_helped', text: 'towed my car out of the ditch' }] });
    out.owe = R.tracksOf(S.npc('npc_dewayne')).owed;
    const asks = () => st.seeds.filter(x => x.origin && x.origin.npcId === 'npc_dewayne' && (x.origin.why === 'ask' || x.origin.why === 'ask_again'));
    const fireDue = d => { S.apply({ setTime: { day: d, phase: 'morning' } }); W.plantFeelings(d); W.fireSeeds({ turn: st.meta.turn, time: { day: d, phase: 'morning' }, locationId: st.player.locationId, presentNpcIds: [], targetIds: [] }); };
    out.ask = [];
    for (let d = day0 + 1; d <= day0 + 16; d++) {
      fireDue(d);
      out.ask.push([d - day0, asks().length, asks().filter(x => x.fired).length]);
    }
    out.askText = asks().map(x => [x.origin.why, G.data.FAVOUR_TEMPLATES[x.origin.template].kind, x.effect]);
    out.crossed = S.npc('npc_dewayne').memories.filter(m => m.event === 'crossed').map(m => m.text);
    out.after = R.tracksOf(S.npc('npc_dewayne')).owed;
    out.broke = S.npc('npc_dewayne').memories.filter(m => m.event === 'broke_word').length;
    return out;
  });
  assert.deepEqual(r.burl, [2, ['owes you big']]);
  assert.ok(r.low.length >= 20 && r.low.every(x => x === false), 'at liking 15: never the cash work');
  assert.ok(r.high.some(x => x === true), 'at liking 40 and trust 10 the $100 work can come: ' + JSON.stringify(r.highIdx));
  assert.equal(r.seed[0][r.seed[0].length - 1], 'owedSettle', 'its effects end square');
  assert.deepEqual(r.square, [0, 0], 'and it spends the debt');
  assert.equal(r.owe, -1);
  const first = r.ask.find(x => x[1] >= 1);
  const second = r.ask.find(x => x[1] >= 2);
  assert.ok(first && first[0] >= 5, 'the first ask after five days: ' + JSON.stringify(r.ask));
  assert.ok(second && second[0] - first[0] >= 3, 'the second three days later: ' + JSON.stringify(r.ask));
  assert.ok(r.askText.every(x => x[1] === 'ask') && /pulling an engine Saturday/.test(r.askText[0][2]), JSON.stringify(r.askText));
  assert.equal(r.crossed.length, 1, 'then a crossed-class memory: ' + JSON.stringify(r.crossed));
  assert.match(r.crossed[0], /never paid me back/);
  assert.equal(r.broke, 0, 'not a broken word');
  assert.equal(r.after, 0, 'and he lets it go');
});

s.test('flirting alone never makes someone sweet on you: a flirt grows romance only a little (wave 35: romance is its own track)', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = [];
    __put('loc_low_water', ['npc_jodie'], 2, 'evening');
    S.apply({ relSet: { npcId: 'npc_jodie', k: 25, w: 22, t: 0 } });
    for (const d of [2, 3, 4, 5]) {
      __put('loc_low_water', ['npc_jodie'], d, 'evening');
      await __say('npc_jodie', 'You look nice tonight.', { romantic: 'flirt' });
      const jo = S.npc('npc_jodie');
      out.push([d, R.tracksOf(jo).w, R.tracksOf(jo).m, R.tracksOf(jo).s, R.sparkStatus(jo)]);
    }
    /* Real kindness, now that she wants the player (changed by design in
       wave 35: romance grows from substance with spark up; one favour is
       not enough, three evenings of it are). */
    for (const d of [6, 7, 8]) {
      __put('loc_low_water', ['npc_jodie'], d, 'evening');
      await __say('npc_jodie', 'How was your day?');
      __model([{ npcId: 'npc_jodie', event: 'they_confided', text: `told me what she is saving for, day ${d}` }], ['npc_jodie']);
      await __say('npc_jodie', 'Need a ride?');
      __model([{ npcId: 'npc_jodie', event: 'did_favour', text: `drove her to Clayburn, day ${d}` }], ['npc_jodie']);
    }
    const jo = S.npc('npc_jodie');
    out.push(['kindness', R.tracksOf(jo).w, R.tracksOf(jo).m, R.tracksOf(jo).s, R.sparkStatus(jo)]);
    return out;
  });
  for (const x of r.slice(0, -1)) assert.notEqual(x[4], 'sweet on you', 'flirts alone: ' + JSON.stringify(x));
  assert.ok(r.slice(0, -1).some(x => x[1] >= 25 && x[3] >= 30), 'though liking passed 25 and spark 30: ' + JSON.stringify(r));
  assert.ok(r.slice(0, -1).every(x => x[2] < 20), 'romance stays under 20 on flirts alone: ' + JSON.stringify(r));
  assert.equal(r[r.length - 1][4], 'sweet on you', 'kindness with spark up, and she is: ' + JSON.stringify(r[r.length - 1]));
});

s.test('Jodie, guarded from the start and wronged by nobody, wants you; she is never using you', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    out.start = __tr('npc_jodie').t;
    __put('loc_low_water', ['npc_jodie'], 2, 'evening');
    S.apply({ relSet: { npcId: 'npc_jodie', k: 25 } });
    for (const d of [2, 3, 4, 5, 6]) {
      __put('loc_low_water', ['npc_jodie'], d, 'evening');
      await __say('npc_jodie', 'You look nice tonight.', { romantic: 'flirt' });
    }
    const jo = S.npc('npc_jodie');
    out.now = [R.tracksOf(jo), R.sparkStatus(jo), R.cue(jo), R.earnedDistrust(jo, R.axesOf(jo))];
    // A lie caught makes it earned: then it is using.
    S.apply({ relAsk: { npcId: 'npc_jodie', act: 'deceive', ok: false, about: 'said I knew her uncle' } });
    __model([{ npcId: 'npc_jodie', event: 'lied_caught', text: 'never knew my uncle' }], ['npc_jodie']);
    out.lied = [R.tracksOf(jo).t, R.sparkStatus(jo)];
    return out;
  });
  assert.equal(r.start, -25, 'guarded from the start');
  assert.ok(r.now[0].s >= 40 && r.now[0].t <= -20, JSON.stringify(r.now[0]));
  assert.equal(r.now[1], 'wants you');
  assert.equal(r.now[2].split(', ').slice(0, 3).join(', '), "flirts back, keeps it light, doesn't trust you");
  assert.equal(r.now[3], false, 'no distrust she was given');
  assert.equal(r.lied[1], 'using you', 'a lie caught, and it is earned: ' + JSON.stringify(r.lied));
});

s.test('a status line prints once a week at most', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    S.apply({ npcKnownToPlayer: ['npc_jodie'] });
    __put('loc_low_water', ['npc_jodie'], 2, 'evening');
    __mark();
    S.apply({ relSet: { npcId: 'npc_jodie', s: 22 } });
    out.first = __feed();
    out.status = S.npc('npc_jodie').rel.status;
    // Turned down: she takes the hint.
    __mark();
    __model([{ npcId: 'npc_jodie', event: 'rebuffed', text: 'turned me down at the bar' }], ['npc_jodie']);
    out.lost = [__feed(), R.sparkStatus(S.npc('npc_jodie'))];
    // Back within the week: no line.
    __mark();
    S.apply({ setTime: { day: 4, phase: 'evening' } });
    S.apply({ relSet: { npcId: 'npc_jodie', s: 24 } });
    out.again = [__feed(), R.sparkStatus(S.npc('npc_jodie'))];
    // A week on, lost and found again: the line again.
    S.apply({ relSet: { npcId: 'npc_jodie', s: 0 } });
    S.apply({ setTime: { day: 10, phase: 'evening' } });
    __mark();
    S.apply({ relSet: { npcId: 'npc_jodie', s: 25 } });
    out.week = __feed();
    // Fading, and an edit, print nothing.
    __mark();
    S.apply({ setTime: { day: 30, phase: 'evening' } });
    S.apply({ editPerson: { npcId: 'npc_jodie', rel: { s: 0 } } }, { source: 'player' });
    out.quiet = __feed();
    return out;
  });
  assert.deepEqual(r.first, ['Jodie Strayhorn looks at you twice.']);
  assert.deepEqual(r.status, { name: 'has noticed you', day: 2 });
  assert.deepEqual(r.lost, [['Jodie Strayhorn takes the hint.'], null]);
  assert.deepEqual(r.again, [[], 'has noticed you'], 'back within seven days: nothing printed');
  assert.deepEqual(r.week, ['Jodie Strayhorn looks at you twice.']);
  assert.deepEqual(r.quiet, []);
});

s.test('the first unwelcome flirt costs a little, the next ones more', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = [];
    /* Annette opens at knowing the player 25. Changed by design in wave 34:
       short of that a flirt is turned aside kindly with no roll
       (tests/wave34-romance-difficulty.test.cjs); past it, a flirt whose
       charm roll fails is unwelcome, and that is what this pins. */
    S.apply({ relSet: { npcId: 'npc_annette', k: 25 } });
    window.__tier = 'failure';
    for (const d of [2, 3, 4]) {
      __put('loc_overstreet_house', ['npc_annette'], d, 'evening');
      const t0 = __tr('npc_annette');
      await __say('npc_annette', 'You look lovely tonight.', { romantic: 'flirt' });
      const t1 = __tr('npc_annette');
      out.push([t1.w - t0.w, t1.t - t0.t, G.Pipeline.lastTurn.packet.split('\n').find(l => /^ROMANCE/.test(l))]);
    }
    return out;
  });
  assert.equal(r[0][0], -3, 'the first: liking -3');
  assert.ok(r[1][0] <= -6 && r[2][0] <= -6, 'the next ones -6: ' + JSON.stringify(r));
  for (const x of r) { assert.ok(x[1] < 0, 'and trust'); assert.equal(x[2], 'ROMANCE (decided by the engine): Annette Overstreet isn\'t interested: she turns it aside.'); }
});

s.test('the night: with every gate met the narrator is told yes and to write the scene out at its own length, a scar-class memory is kept, nothing explicit is asked for; one gate short and she says not tonight, kindly; never with anyone under 18 on either side', async h => {
  const page = await start(h);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, R = G.Rel, st = G.state;
    const out = {};
    const ask = async (id, loc, words) => {
      __put(loc, [id], 6, 'night');
      await __say(id, words, { romantic: 'more' });
      return G.Pipeline.lastTurn.packet.split('\n').filter(l => /^ROMANCE|^UNDER 18/.test(l));
    };
    // Changed by design in wave 35: the night reads romance 40 where it read liking 40.
    S.apply({ relSet: { npcId: 'npc_jodie', s: 55, m: 45, w: 45, t: 35, k: 35 } });
    out.gate = R.intimateGate(S.npc('npc_jodie'));
    out.yes = await ask('npc_jodie', 'loc_low_water', 'Stay with me tonight.');
    const m = S.npc('npc_jodie').memories.filter(x => x.event === 'intimate');
    out.mem = m.map(x => [x.weight, x.decay, x.private === true, x.d.s > 0]);
    out.noFlirt = S.npc('npc_jodie').memories.filter(x => x.event === 'flirted' && x.turn === st.meta.turn).length;
    out.style = G.Style.systemPrompt('casual').includes('INTIMATE SCENES: when a ROMANCE line says someone says yes, write the scene out');
    out.length = G.Pipeline.lastTurn.packet.split('\n').find(l => l.startsWith('LENGTH:')) || null;
    out.mode = G.Pipeline.lastTurn.packet.split('\n').find(l => l.startsWith('MODE:')) || null;
    // Wave 36, second pass: a summary in place of the scene is a hard problem; a written-out scene is not.
    out.skip = ['the rest of the night goes the way you hoped.', 'She kisses you. Later she is gone.'].map(t => G.Style.check(t, { intimate: true, names: false }).problems.filter(p => p.type === 'skipped').map(p => p.hard));
    out.written = G.Style.check(Array(130).fill('kiss').join(' ') + '.', { intimate: true, names: false }).problems.filter(p => p.type === 'skipped').length;
    // One gate short (trust 25): not tonight, kindly, and a welcome flirt.
    S.apply({ relSet: { npcId: 'npc_shayla', s: 55, m: 45, w: 45, t: 25, k: 35 } });
    out.short = R.intimateGate(S.npc('npc_shayla')).short;
    out.no = await ask('npc_shayla', 'loc_riverbend', 'Come back to my room tonight.');
    out.noMem = S.npc('npc_shayla').memories.filter(x => x.turn === st.meta.turn).map(x => x.event);
    // A player of 16: nothing.
    st.player.age = 16;
    out.young = await ask('npc_jodie', 'loc_low_water', 'Stay with me tonight.');
    out.youngMem = S.npc('npc_jodie').memories.filter(x => x.event === 'intimate').length;
    st.player.age = 30;
    // Someone under 18: no answer, the minor's line, nothing recorded.
    out.minor = await ask('npc_micah', 'loc_purvis_landing', 'Stay with me tonight.');
    out.minorMem = S.npc('npc_micah').memories.filter(x => x.event === 'intimate').length;
    return out;
  });
  assert.equal(r.gate.ok, true);
  assert.deepEqual(r.yes, ['ROMANCE (decided by the engine): Jodie Strayhorn says yes; write the scene out, never skip to afterwards: the moment it tips, the kissing, hands, clothes, how they move and what they murmur, the room and the light, and Jodie\'s own way of being with the player, beat by beat. Sensual, not graphic: no anatomical close-ups. End on them afterwards.']);
  assert.deepEqual(r.mem, [[3, 'scar', true, true]], 'a weight-3 scar, private, with its spark');
  assert.equal(r.noFlirt, 0, 'the night, not a flirt besides');
  assert.equal(r.style, true, 'the cached block carries the rule');
  assert.ok(/^LENGTH: up to 12 sentences, under 230 words\./.test(r.length), 'the intimate length: ' + r.length);
  assert.ok(/^MODE: INTIMATE SCENE\. This turn is the scene itself/.test(r.mode) && /Never summarise or skip it/.test(r.mode), 'the intimate mode: ' + r.mode);
  assert.deepEqual(r.skip, [[true], [true]], 'a skip phrase or a summary is hard');
  assert.equal(r.written, 0, 'a scene written out at length passes');
  assert.deepEqual(r.short, ['trust 25 under 30']);
  assert.deepEqual(r.no, ['ROMANCE (decided by the engine): Shayla Rawls: not tonight; she says so kindly.']);
  assert.deepEqual(r.noMem, ['flirted'], 'it counts as a welcome flirt, no harm');
  assert.ok(r.young.some(l => /isn't interested/.test(l)) && r.young.some(l => /^UNDER 18: The player is under 18/.test(l)) && !r.young.some(l => /says yes|fade to black|not tonight/.test(l)), JSON.stringify(r.young));
  assert.equal(r.youngMem, 1, 'nothing more recorded');
  assert.ok(!r.minor.some(l => /says yes|fade to black|not tonight/.test(l)) && r.minor.some(l => /^UNDER 18: Micah Dees is 17/.test(l)), JSON.stringify(r.minor));
  assert.equal(r.minorMem, 0);
});

s.run();
