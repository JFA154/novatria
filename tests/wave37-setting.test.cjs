'use strict';
/* Wave 37, Creator Mode, milestone 4 (task M4-C; plan decision F's rows
   for the currency, the law, the locale lists and the police regexes,
   "Pack format v1" and "Milestone 4"): the setting as data across the
   engine. world.currency { symbol, name, before, words } reaches money()
   and its helpers (the status bar, the Character tab, CARRYING), and
   every money pattern outside Pipeline and Commands is built from
   Pack.moneyRe at call time (State's ask reward and appointment hour,
   Rel's price, Style's money leak and bet stake, the card table's amount
   field). world.law { factionId, headNpcId, fallbackNpcId, arrestPlaceId,
   newsTemplate } routes the report, the arrest, the inquiry and its news
   and World.grudgeKind; rules.law and rules.narration.maxDue replace
   World's FINE, ROUGH_* and MAX_DUE. setting.locale extends Style's name
   lists. The built-in pack reads exactly as before ("$", Chief Bell, Town
   Hall); a pack's own values are set on a preview (Pack.setPreview, a copy
   of the built-in pack), the editor's way. Mock mode.
   Run with: node tests/run.cjs wave37-setting */
const assert = require('assert/strict');
const { suite, quickStart, sendText, presetCards, LAPTOP } = require('./helpers.cjs');

const s = suite('wave37-setting');
const CREDITS = { symbol: 'cr', name: 'credits', before: false, words: ['credits', 'creds'] };
const LAW = { factionId: 'fac_sturdivant', headNpcId: 'npc_dewayne', fallbackNpcId: 'npc_hoyt', arrestPlaceId: 'loc_motor_court', newsTemplate: 'Station security under {police} is asking around about {npc}.' };

/* The built-in pack, copied, with these parts set (o.currency, o.law: an
   object, or null to drop the pack's own; o.rules; o.locale; o.npcs: id ->
   fields merged onto that person), as the preview. */
function preview(page, o) {
  return page.evaluate(o => {
    const P = Game.Pack;
    const c = P.copy(P.builtIn());
    if (o.currency) c.world.currency = o.currency;
    if (o.law === null) delete c.world.law;
    else if (o.law) c.world.law = o.law;
    if (o.rules) c.rules = o.rules;
    if (o.locale) c.setting.locale = o.locale;
    for (const [id, f] of Object.entries(o.npcs || {})) Object.assign(c.world.npcs.find(n => n.id === id), f);
    P.setPreview(c);
  }, o);
}
const fast = page => page.evaluate(() => { Game.Api.Mock.delay = 0; Game.Api.Mock.clear(); });
const lastPacket = page => page.evaluate(() => { const c = Game.Api.Mock.calls.filter(x => x.method === 'narrate'); return c.length ? c[c.length - 1].text : ''; });
const line = (packet, label) => (packet.split('\n').find(l => l.startsWith(label + ':')) || '');
async function start(page, opts) {
  await quickStart(page, Object.assign({ kinds: [] }, opts || {}));
  await page.waitForFunction(() => !Game.Pipeline.busy && Game.state.log.length >= 1);
  await fast(page);
}
/* Everything the money reads, at a cash of 138: the status bar, the
   Character tab, money() and Pack.moneyText, the money leak, the ask's
   reward, the price, the bet stake and the appointment hour. */
const moneyRead = page => page.evaluate(() => {
  const G = Game, S = G.State;
  S.apply({ goldDelta: 138 - G.state.player.gold });
  G.UI.renderGame();
  G.UI.openPanel('character');
  const leak = (t, o) => G.Style.check(t, Object.assign({ gold: 40, input: 'I ask about a truck', names: false }, o || {})).problems.filter(p => p.type === 'money').map(p => p.amount);
  const R = G.Pack.moneyRe;
  return {
    bar: document.querySelector('.tb-gold').textContent, ch: document.getElementById('panel-body').innerText,
    money: [G.Pack.moneyText(40), G.Pack.moneyText(0)], re: { before: R.before, wordList: R.wordList, wordForms: R.wordForms, digits: R.digits.flags },
    leak: {
      symAfter: leak('"You\'ve got 40 cr left," she says.'), symBefore: leak('"You\'ve got $40 left," she says.'),
      wordsPack: leak('"You\'ve got forty credits left," she says.'), wordsOld: leak('"You\'ve got forty dollars left," she says.'),
      price: leak('"That\'s 40 cr," she says.')
    },
    reward: [S.askReward('Mavis Pittman asked you to fix the sign for 50 cr up front.'), S.askReward('Mavis Pittman asked you to fix the sign for $50 up front.')],
    price: ['I want 300 cr for it', 'I want $300 for it', 'forty credits and we are square', 'forty dollars and we are square', 'fifty bucks'].map(t => G.Rel.priceIn(t)),
    bet: ['I bet 20 cr', 'I bet $20', 'I bet twenty credits', 'I bet twenty dollars'].map(t => G.Style.betTalk(t))
  };
});

s.test('credits after the number: the status bar and the Character tab read "138 cr", CARRYING says "cash 138 cr", Pack.moneyText writes "40 cr", and every money pattern outside Pipeline and Commands reads credits: the money leak flags "40 cr" and "forty credits" and no longer "$40", an ask\'s reward is "50 cr up front", a price of "300 cr" or "forty credits" is read, a stake in credits is a bet', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await preview(page, { currency: CREDITS });
  await start(page);
  const r = await moneyRead(page);
  assert.equal(r.bar, '138 cr');
  assert.match(r.ch, /Cash\s+138 cr/);
  assert.deepEqual(r.money, ['40 cr', '0 cr']);
  assert.deepEqual(r.re, { before: false, wordList: 'credits|creds', wordForms: 'credits?|creds?', digits: 'gi' });
  assert.deepEqual(r.leak, { symAfter: [40], symBefore: [], wordsPack: [40], wordsOld: [], price: [] });
  assert.deepEqual(r.reward, ['50 cr up front', null]);
  assert.deepEqual(r.price, [300, null, 40, null, null]);
  assert.deepEqual(r.bet, ['bet', 'other', 'bet', 'other']);
  await sendText(page, 'I look around');
  const carrying = line(await lastPacket(page), 'CARRYING');
  assert.match(carrying, /; cash 138 cr, known to the player alone/, carrying);
  assert.doesNotMatch(carrying, /\$/);
});

s.test('the built-in pack reads "$" as before: the status bar and the Character tab "$138", CARRYING "cash $138", the money leak flags "$40" and "forty dollars" and not "40 cr", the ask\'s reward "$50 up front", the price "$300" and "fifty bucks", a dollar stake a bet', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const r = await moneyRead(page);
  assert.equal(r.bar, '$138');
  assert.match(r.ch, /Cash\s+\$138/);
  assert.deepEqual(r.money, ['$40', '$0']);
  assert.deepEqual(r.re, { before: true, wordList: 'dollars|bucks', wordForms: 'dollars?|bucks?', digits: 'gi' });
  assert.deepEqual(r.leak, { symAfter: [], symBefore: [40], wordsPack: [], wordsOld: [40], price: [] });
  assert.deepEqual(r.reward, [null, '$50 up front']);
  assert.deepEqual(r.price, [null, 300, null, 40, 50]);
  assert.deepEqual(r.bet, ['other', 'bet', 'other', 'bet']);
  await sendText(page, 'I look around');
  assert.match(line(await lastPacket(page), 'CARRYING'), /; cash \$138, known to the player alone/);
});

/* A no-limit hold'em table open at the card game's place, its amount field
   showing: the hand asked for with no stake named ("Deal me in."), so the
   stake words (Pipeline's, the follow-up's) play no part. The field read
   after typing v: the symbol, which side of the field it is on, the note. */
async function amountField(page, pack) {
  if (pack) await preview(page, pack);
  await start(page);
  await page.evaluate(() => Game.State.apply({ goldDelta: 200 }));
  const spot = await page.evaluate(() => {
    const G = Game, S = G.State, st = G.state;
    const l = st.locations.find(x => G.Pipeline.cardGameAt(x));
    const PH = ['morning', 'afternoon', 'evening', 'night'];
    for (const ph of ['evening', 'night', 'afternoon']) {
      let d = st.time.day + (PH.indexOf(ph) < PH.indexOf(st.time.phase) ? 1 : 0);
      while (S.isClosed(l, d)) d++;
      S.apply({ setTime: { day: d, phase: ph }, playerLocationId: l.id });
      const dealer = G.Pipeline.dealerOf(S.npcsAt(l.id).map(n => n.id));
      if (dealer) return { loc: l.id };
    }
    return null;
  });
  assert.ok(spot, 'a table with its dealer');
  await presetCards(page, { game: 'holdem', seats: [], structure: 'nolimit' });
  await page.evaluate(() => { Game.Pipeline.hooks.cardsDeal = { holes: [['Ah', 'Ad'], ['7s', '2d']], board: ['2c', '7d', '9h', '3s', 'Jc'], seats: [] }; });
  await page.fill('#cmd', 'Deal me in.');
  await page.press('#cmd', 'Enter');
  await page.waitForSelector('#feed .f-cards.open .cards-amt');
  return async v => {
    await page.fill('#feed .f-cards.open .cards-amt', v);
    return page.evaluate(() => {
      const wrap = document.querySelector('#feed .f-cards.open .cards-amt-wrap');
      return { cur: wrap.querySelector('.cards-amt-cur').textContent, first: wrap.firstElementChild.className, note: document.querySelector('#feed .f-cards.open .cards-amt-note').textContent };
    });
  };
}

s.test('the card table\'s amount field: "$" before the amount and "Type an amount in dollars." with the built-in pack; with credits after the number the symbol "cr" follows the field and the notes say credits ("Type an amount in credits.", "Whole credits at this table: 12 cr.")', async h => {
  const opts = { viewport: LAPTOP, contextOptions: { reducedMotion: 'reduce' } };
  const dollarsField = await amountField(await h.open(opts));
  const dollars = await dollarsField('abc');
  assert.equal(dollars.cur, '$');
  assert.equal(dollars.first, 'cards-amt-cur', 'the symbol before the amount');
  assert.match(dollars.note, /^Type an amount in dollars\. The least bet is \$\d+\.$/);
  assert.match((await dollarsField('12.5')).note, /^Whole dollars at this table: \$12\./);
  const creditsField = await amountField(await h.open(opts), { currency: CREDITS });
  const credits = await creditsField('abc');
  assert.equal(credits.cur, 'cr');
  assert.equal(credits.first, 'cards-amt', 'the symbol after the amount');
  assert.match(credits.note, /^Type an amount in credits\. The least bet is \d+ cr\.$/);
  assert.match((await creditsField('12.5')).note, /^Whole credits at this table: 12 cr\./);
  assert.doesNotMatch((await creditsField('12 cr')).note, /Type an amount|Whole/);
});

s.test('a world.law with a security chief: a report goes to the law head (Rel.policeHead, Rel.reportTo), an arrest puts the player in the law\'s arrest place, World.grudgeKind reads the law\'s head and faction, and a secret told to the chief plants an inquiry whose news is the pack\'s template with the chief\'s name and whose clock is the law\'s faction', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await preview(page, { law: LAW, npcs: { npc_dewayne: { tags: ['police'] } } });
  await start(page);
  const r = await page.evaluate(async () => {
    const G = Game, S = G.State, st = G.state, W = G.World;
    const out = {};
    out.head = G.Rel.policeHead();
    out.report = G.Rel.reportTo().ids;
    out.fallback = G.Rel.policeFallback();
    out.news = G.Rel.WHEN_TOLD.news;
    const kind = e => W.grudgeKind({ effects: [e] });
    out.kinds = [kind({ op: 'addMemory', npcId: 'npc_dewayne', text: 'x' }), kind({ op: 'addMemory', npcId: 'npc_marcus', text: 'x' }), kind({ op: 'setFlag', key: 'fac_sturdivant' }), kind({ op: 'setFlag', key: 'fac_police' })];
    // A secret the player holds over Carter Haskins (a crime) told to the chief, who is here.
    S.apply({ visits: [{ npcId: 'npc_dewayne', locationId: st.player.locationId }] });
    S.apply({ npcKnownToPlayer: ['npc_carter', 'npc_dewayne'] });
    S.apply({ secretShown: [{ npcId: 'npc_carter', how: 'roll' }] });
    S.apply({ leverageAdd: { holder: 'player', over: 'npc_carter', about: { kind: 'secret' }, text: 'runs stolen diesel through the yard', weight: 3, mattersTo: ['npc_dewayne'] } });
    const rec = st.leverage.find(x => x.over === 'npc_carter');
    // A Say turn whose bookkeeper names the telling (the relationships examples' way).
    G.Api.Mock.queue('parse', { actionType: 'talk', summary: 'tell Dewayne', targets: ['npc_dewayne'], needsRoll: false, timeCost: 'instant', romantic: null });
    G.Api.Mock.queue('bookkeep', { socialEvents: ['npc_dewayne exposed npc_carter: told me Carter runs stolen diesel through the yard'] });
    await G.Pipeline.submit('Carter runs stolen diesel through his yard.', { mode: 'say', to: 'npc_dewayne' });
    out.applied = S.debugLog.filter(x => /exposed|lev_carter/.test(x.text || x.reason || '')).map(x => x.text || x.reason).join(' | ');
    out.rec = st.leverage.find(x => x.id === rec.id).status;
    const sd = st.seeds.find(x => x.id === 'seed_inquiry_carter');
    out.inquiry = sd ? { effect: sd.effect, fx: sd.effects.map(e => [e.op, e.factionId || e.text]) } : null;
    out.names = [S.npc('npc_dewayne').name, S.npc('npc_carter').name];
    // The arrest: the law's place, not Town Hall.
    out.plan = W.arrestPlan().cellId;
    W.arrestPlayer();
    out.at = st.player.locationId;
    return out;
  });
  assert.equal(r.head, 'npc_dewayne');
  assert.deepEqual(r.report, ['npc_dewayne']);
  assert.equal(r.fallback, 'npc_hoyt');
  assert.equal(r.news, LAW.newsTemplate);
  assert.deepEqual(r.kinds, ['police', 'gossip', 'police', 'gossip']);
  assert.equal(r.plan, 'loc_motor_court');
  assert.equal(r.at, 'loc_motor_court');
  assert.equal(r.rec, 'spent', r.applied);
  assert.ok(r.inquiry, `an inquiry seed: ${r.applied}`);
  assert.equal(r.inquiry.effect, `${r.names[0]} starts asking around about ${r.names[1]}.`);
  assert.deepEqual(r.inquiry.fx, [['clockAdjust', 'fac_sturdivant'], ['addNews', `Station security under ${r.names[0]} is asking around about ${r.names[1]}.`]]);
});

s.test('the built-in law is what it was: Marcus Bell hears reports, Hoyt Bramlett is the fallback, an arrest is in Town Hall, the inquiry news is "Chief Bell has been asking questions about {npc}." and grudgeKind reads npc_marcus and fac_police; a pack with no law reads the built-in ids and the engine\'s "{police} has been asking questions about {npc}."', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const read = () => page.evaluate(() => {
    const G = Game, W = G.World;
    const kind = e => W.grudgeKind({ effects: [e] });
    return { head: G.Rel.policeHead(), fallback: G.Rel.policeFallback(), news: G.Rel.WHEN_TOLD.news, cell: W.arrestPlan().cellId,
      kinds: [kind({ op: 'addMemory', npcId: 'npc_marcus', text: 'x' }), kind({ op: 'setFlag', key: 'fac_police' }), kind({ op: 'setFlag', key: 'fac_sturdivant' })] };
  });
  assert.deepEqual(await read(), { head: 'npc_marcus', fallback: 'npc_hoyt', news: 'Chief Bell has been asking questions about {npc}.', cell: 'loc_town_hall', kinds: ['police', 'police', 'gossip'] });
  await preview(page, { law: null });
  assert.deepEqual(await read(), { head: 'npc_marcus', fallback: 'npc_hoyt', news: '{police} has been asking questions about {npc}.', cell: 'loc_town_hall', kinds: ['police', 'police', 'gossip'] });
});

/* Two (or n) nights asleep in Town Hall in a row: the due line of each
   morning, the chief's memory of it, Stiff, and the cash taken. */
const roughNights = (page, n) => page.evaluate(async n => {
  const G = Game, S = G.State, M = G.Api.Mock, st = G.state;
  const l = S.loc('loc_town_hall');
  const gold0 = st.player.gold;
  const nights = [];
  for (let i = 0; i < n; i++) {
    S.apply({ setTime: { day: st.time.day, phase: 'night' }, playerLocationId: l.id });
    await G.Pipeline.rest();
    const pk = (M.calls.filter(c => c.method === 'narrate').pop() || {}).text || '';
    nights.push({ due: (/^DUE EVENT: .*$/m.exec(pk) || [''])[0], stiff: st.player.conditions.some(c => c.name === 'Stiff'), count: st.flags.roughNights || 0 });
  }
  const chief = st.npcs.filter(x => (x.memories || []).some(m => /sleeping rough at/.test(m.text))).map(x => x.id);
  return { nights, chief, fined: gold0 - st.player.gold, R: [G.World.ROUGH_NIGHTS, G.World.ROUGH_FINE, G.World.ROUGH_FORGIVEN, G.World.FINE] };
}, n);

s.test('rules.law.roughSleeping false: two nights asleep in Town Hall bring no chief, no fine and no Stiff; with the rule on (the default) the chief comes on the second morning and the sleeper is Stiff', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await preview(page, { rules: { law: { roughSleeping: false } } });
  await start(page);
  await page.evaluate(() => Game.State.apply({ goldDelta: 100 }));
  const off = await roughNights(page, 3);
  assert.deepEqual(off.chief, [], 'no chief');
  assert.equal(off.fined, 0, 'no fine');
  assert.ok(off.nights.every(x => !/move along|fine/.test(x.due) && !x.stiff && x.count === 0), JSON.stringify(off.nights));
  const page2 = await h.open({ viewport: LAPTOP });
  await start(page2);
  const on = await roughNights(page2, 2);
  assert.deepEqual(on.R, [2, 25, 7, 50], 'the defaults');
  assert.deepEqual(on.chief, ['npc_marcus']);
  assert.match(on.nights[1].due, /tells you to move along and find a real bed/);
  assert.ok(on.nights.every(x => x.stiff), 'Stiff each morning');
});

s.test('rules.law.roughFine 60 and fine 80: the third night running in Town Hall costs 60 ("writes you a $60 fine"), and an arrest takes 80', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await preview(page, { rules: { law: { roughFine: 60, fine: 80 } } });
  await start(page);
  await page.evaluate(() => Game.State.apply({ goldDelta: 300 }));
  const r = await roughNights(page, 3);
  assert.deepEqual(r.R, [2, 60, 7, 80]);
  assert.equal(r.fined, 60);
  assert.match(r.nights[2].due, /writes you a \$60 fine for sleeping in public and takes it/);
  const fine = await page.evaluate(() => { const g = Game.state.player.gold; Game.World.arrestPlayer(); return [Game.World.arrestPlan ? g - Game.state.player.gold : null]; });
  assert.deepEqual(fine, [80]);
});

s.test('rules.narration.maxDue 1: World.MAX_DUE reads 1, and of two events due at a place one is told and the second waits for the next turn', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await preview(page, { rules: { narration: { maxDue: 1 } } });
  await start(page, { seed: 31 });
  assert.equal(await page.evaluate(() => Game.World.MAX_DUE), 1);
  const dest = await page.evaluate(() => {
    const here = Game.State.loc(Game.state.player.locationId);
    const l = here.exits.map(id => Game.State.loc(id)).find(x => !x.closed && !/morning|afternoon|evening|night/i.test(x.name)
      && !Game.state.seeds.some(sd => !sd.fired && sd.trigger.type === 'location' && sd.trigger.value === x.id && !(sd.notBeforeDay > Game.state.time.day)));
    return { id: l.id, name: l.name };
  });
  await page.evaluate(() => Game.World.forceClockRoll(1));
  await page.evaluate(id => {
    const r = Game.State.apply({ effects: [1, 2].map(i => ({ op: 'plantSeed', seed: { id: `seed_test_due_${i}`, cause: 'test', fired: false, hidden: true, effect: `Test due event number ${i} happens here.`, trigger: { type: 'location', value: id } } })) });
    if (r.rejected.length) throw new Error(JSON.stringify(r.rejected));
  }, dest.id);
  await sendText(page, `I walk to ${dest.name}`);
  assert.equal(await page.evaluate(() => Game.state.player.locationId), dest.id);
  await sendText(page, 'I look around');
  assert.match(line(await lastPacket(page), 'DUE EVENT'), /^DUE EVENT: Test due event number 1 happens here\. \(already true/);
  assert.deepEqual(await page.evaluate(() => Game.state.dueEvents.map(e => e.seedId)), ['seed_test_due_2'], 'the second waits');
  await sendText(page, 'I look around');
  assert.match(line(await lastPacket(page), 'DUE EVENT'), /^DUE EVENT: Test due event number 2 happens here\./);
});

s.test('setting.locale extends the name lists: "a Nebula Cola" is flagged by the name check until the pack\'s brandPhrases has it; nameAllow lets a lone word pass and givenNames makes a first name and a surname someone; the built-in lists stay (Dr Pepper still passes)', async h => {
  const page = await h.open({ viewport: LAPTOP });
  await start(page);
  const names = () => page.evaluate(() => {
    const n = t => Game.Style.check(t, {}).problems.filter(p => p.type === 'name').flatMap(p => p.names);
    const marked = t => Game.Style.nameHits(t, {}).filter(x => x.marked).map(x => x.word);
    return { cola: n('You buy a Nebula Cola from the machine.'), pepper: n('You buy a Dr Pepper from the machine.'), lone: n('The radio plays Zorblax tunes all night long.'), given: marked('Out back, Quillon Vance is cheap here.') };
  });
  const before = await names();
  assert.deepEqual(before.cola, ['Nebula', 'Cola']);
  assert.deepEqual(before.pepper, []);
  assert.deepEqual(before.lone, ['Zorblax']);
  await preview(page, { locale: { brandPhrases: ['Nebula Cola'], nameAllow: ['Zorblax'], givenNames: ['Quillon'] } });
  const after = await names();
  assert.deepEqual(after.cola, [], 'the brand passes');
  assert.deepEqual(after.pepper, [], 'the engine\'s brands stay');
  assert.deepEqual(after.lone, [], 'a word the pack allows');
  assert.deepEqual([before.given, after.given], [[], ['Quillon', 'Vance']], 'a first name the pack gives, with a surname before "is", is someone');
});

s.run();
