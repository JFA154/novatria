// ===== Module: World =====
/* The living world (SPEC.md section 8). It all runs in code, with no API
   call, and every write goes through State.apply (source 'world').

   tick(info) runs once for every phase that passes (Pipeline.passTime calls
   it from normal turns, /skip, /rest, /wait and defeat), in this order:
     a. Faction clocks. Every faction with a running clock rolls a d6 through
        Rng; a roll at or above its odds fills one segment (odds on the clock
        or the faction: a lowest roll 1 to 6, "4-6", or a chance below 1;
        default 5, so 5 or 6). Seeds with a clock trigger are checked right
        after the rolls, before a full clock hands over to the next.
     b. Clock complete. onComplete.requires is checked (conditionsMet); if it
        does not hold, onComplete.alt happens instead (its text and effects),
        or nothing does. The effects run through applyEffects (placeholders
        filled), the next clock in sequence starts (activeClock + 1, or -1
        when none are left), the text becomes town news (addNews, public,
        with the faction) and a quiet feed notice is posted only if the
        player could plausibly see it: an effect that changes a place or a
        person names the place they stand in or someone standing there with
        them, or an effect on the player. Otherwise it happens off-screen.
        The content's own addRumour carries the news to people (content note
        2); only a completion without one gets a rumour made from its text.
     c. A new morning, first: obligations that ran past their day
        (State.tickObligations) become town news (not public) and a due
        event: the person they are owed to comes looking.
     d. Schedules. Who is where is npcIdsBySchedule for the new phase
        (State.npcsAt). A loose-end NPC with no schedule gets a home picked
        by role and tags once their seed has fired (homeFor).
     e. Grudges and favours. A free NPC at attitude <= -60 with a memory of
        weight 3 plants a grudge seed from GRUDGE_TEMPLATES; one at >= 60
        with a memory of weight 2 or more plants a favour seed from
        FAVOUR_TEMPLATES. One feeling per memory (the seed's cause carries
        the memory's mark, feelingMark), at most one waiting per NPC, and
        none for FEELING_COOLDOWN (7) days after one of theirs fired.
        Templates that do not fit them (forTags / notForTags, with elderly,
        teenager and police read from age and role too) are left out. Day
        trigger: today plus the template's dayOffset, with {npc} and
        {player} filled in. When it fires, the template's effects run and,
        if the template is public, it is town news; a grudge that fires
        leaves them +10 ("got even").
     f. Town events (fireEvents): an event in the town's own copy
        (State.town.events) whose day and phase have come picks its first
        branch whose when holds, else its default; its effects run, its text
        is public news, and when the player stands at its place it is a due
        event there (the scene). The epilogue the same way, once, on its day
        or when one of its flags is set (news marked epilogue; flag
        epilogueShown).
     g. A new morning. Weather from TABLES.weather for the season
        (State.season(), else flags.season; never the same as yesterday);
        conditions that ran out are removed with a quiet line; attitudes
        drift DRIFT_PER_DAY (2) a day back toward where the town data put
        them (0 for someone it does not have), for anyone with no weight-3
        memory from the last DRIFT_QUIET_DAYS (5) days and no open loose
        end with the player. Wave 26: that is State's relDay (Rel.driftStep
        decides the step, liking moves in the everyday bucket), which also
        recomputes everyone's tracks for the new day.
     h. Appointments (wave 22): a meeting agreed in the story (a seed with
        appointment) whose last phase has passed is settled: kept (it fires)
        when the player was at its place as that phase ended, dropped
        quietly when its person can no longer keep it, else missed (the
        person remembers waiting, -3, a quiet line). A new morning places
        that day's meetings (visits).

   Seeds and due events (state.dueEvents):
     fireSeeds(ctx), Pipeline step 11, fires every unfired seed whose trigger
     is met: day (today >= value), location (the player is there; a list of
     places: any of them), npc (that NPC, or one of a list, is with the
     player), clock ("fac_x:N": the running clock has N filled); never
     before notBeforeDay. A fired seed is marked fired. If its requires
     holds, its effect is a due event and its effects run (State.apply,
     placeholders filled: a loose end's obligation is created then); if
     not, its alt is (text and effects), or nothing. A seed tied to an NPC
     (loose end, grudge, favour) whose NPC is no longer free fires as a
     no-op. A loose-end NPC whose seed fires comes to the player: a visit to
     where the player is. dueSeeds(ctx), step 6, hands at most MAX_DUE (2)
     due events to the narration, oldest first, and keeps a loose-end NPC's
     visit wherever the player is now; the rest wait. An event from a
     location trigger is only told in that location, and not in a turn that
     walks out of it (ctx.leaving). dueNarrated(events) consumes them.
     Engine events that are not seeds (a town event, a missed obligation,
     an arrest) are planted and fired at once as seeds of origin 'town'.

   Fights (the pipeline decides when): knockDown(npcId) leaves someone hurt
   for two days (State's npcFates hurt), gives everyone present a weight-3
   memory of it and makes it news in a public place; arrestPlayer() puts
   the player in the cells overnight with a fine and a memory on the chief.
   Both return the text to narrate.

   Reputation. driftReputation(before) runs after the bookkeeper's diff: the
   attitude changes of every NPC the player knows are summed, divided by 5,
   rounded and clamped to +/-5 a turn, and move reputation.town; the same sum
   per faction moves that faction's entry. Clock effects move it with the
   reputationDelta op. State.reputationTier() gives the narrator one word.

   Test and debug hooks: forceClockRoll(value) forces the d6 of every
   faction and forceClockRoll(value, factionId) of one (that wins over the
   all-factions value); forceClockRoll(null) clears them all and
   forceClockRoll(null, factionId) just that one. forceAttitude(npcId,
   value) sets an attitude through State.apply (wave 26: relSet, liking
   landed exactly in fix); recent lists the latest
   world events for the debug view (memory only, not saved; news is noted
   there too, kind 'news'), and forget(turn) drops those of turns taken
   back by /undo or a failed turn. */
const World = (() => {
  const MAX_DUE = 3;
  const GRUDGE_AT = -60;
  const FAVOUR_AT = 60;
  const REP_DIVISOR = 5;
  const REP_CAP = 5;
  const RECENT_MAX = 60;
  const FEELING_COOLDOWN = 7;
  const GOT_EVEN = 10;
  // The morning's drift (wave 26: Rel's own numbers, State's relDay).
  const DRIFT_PER_DAY = Rel.CAPS.everydayDrift;
  const DRIFT_QUIET_DAYS = Rel.CAPS.quietDays;
  const FINE = 50;
  const CLOCK_ODDS = 5;
  const W = { source: 'world' };
  const hooks = { clockRolls: {} }; // forced d6 per faction id, '*' for every faction
  const recent = [];
  let tickAt = null; // the phase a tick is for (State's clock has already moved on to the end of the turn's time)
  let tickCause = null; // what passed the time a tick is for ('rest', 'wait', 'skip', 'turn' ...)
  let ahead = null; // { key, turn, events }: a phase's clock steps run ahead of its tick (clocksAhead), with what they told
  // Time passed with the player not acting (wave 5, playtest Q8): a plan done in front of them is told by the narration that follows.
  const TOLD_CAUSES = ['rest', 'wait', 'skip'];
  /* Effects that change a place or a person, the ones a bystander sees;
     and effects on the player, which the player always sees. */
  const SEEN_OPS = ['closeLocation', 'openLocation', 'npcStatus', 'npcMove', 'openThread', 'threadStatus', 'banFrom'];
  const PLAYER_OPS = ['playerHp', 'playerGold', 'giveItem', 'takeItem', 'addCondition'];
  /* Places nobody walks into uninvited: a fight there is not town news. */
  const PRIVATE_TYPES = ['house', 'trailer', 'apartment', 'farm', 'bighouse', 'home'];
  /* Where a loose-end NPC with no schedule lives once their seed has fired:
     the first rule whose words match their tags and role names the location
     types to try, in either setting. */
  const HOME_RULES = [
    [/\b(lender|moneylender|loan|loans|creditor|banker|bookie|pawn\w*)\b/, ['pawn', 'bank', 'market', 'hall', 'bar', 'tavern', 'diner']],
    [/\b(priest|temple|church|pastor|preacher|reverend|register|chaplain|nun|monk|deacon)\b/, ['temple', 'church']],
    [/\b(innkeeper|inn|lodging|motel|landlord|landlady|bartender|barkeep|barman|publican|hotel)\b/, ['motel', 'tavern', 'bar']],
    [/\b(gossip|informant|dock|docks|boat\w*|ferry\w*|fisher\w*|marina|river|barge\w*)\b/, ['docks', 'marina', 'riverbank', 'market', 'bar', 'tavern']],
    [/\b(mechanic|garage|driver|trucker)\b/, ['garage', 'gas', 'highway', 'road']],
    [/\b(smith|blacksmith|forge)\b/, ['smithy', 'garage']],
    [/\b(cook|waitress|waiter|diner|baker)\b/, ['diner', 'tavern', 'bar', 'market']],
    [/\b(police|deputy|sheriff|watch|watchman|officer|constable)\b/, ['police', 'watch']],
    [/\b(enemy|thug|bruiser|drifter|stranger|muscle)\b/, ['motel', 'tavern', 'bar', 'slum', 'trailerpark']]
  ];
  const HOME_FALLBACK = ['tavern', 'bar', 'motel', 'market', 'diner'];

  // ----- helpers -----
  function st() { return State.current; }
  function note(text, extra) {
    const s = st();
    const at = tickAt || (s ? s.time : { day: 0, phase: '' });
    recent.push(Object.assign({ turn: s ? s.meta.turn : 0, day: at.day, phase: at.phase, text }, extra || {}));
    if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX);
  }
  const arr = v => (Array.isArray(v) ? v : []);
  const entries = v => (isObj(v) ? Object.entries(v) : []);
  /* The value (an id) of a trigger, or any of a list of them. */
  const anyOf = (v, fn) => (Array.isArray(v) ? v.some(fn) : fn(v));
  function activeClock(f) {
    return f && Array.isArray(f.clocks) && Number.isInteger(f.activeClock) && f.activeClock >= 0 ? (f.clocks[f.activeClock] || null) : null;
  }
  /* Ops this build's State.apply knows (State.EFFECT_OPS). */
  function hasOp(op) { return Array.isArray(State.EFFECT_OPS) && State.EFFECT_OPS.includes(op); }
  /* Effects through State.apply. An op this build does not have yet is
     left out and noted, not sent to be refused. */
  /* opts (wave 6): { holdReward: a town event's id, or 'ending' } for State.apply. */
  function applyEffects(effects, opts) {
    const list = arr(effects).filter(isObj);
    const known = list.filter(e => hasOp(e.op));
    const skipped = list.filter(e => !hasOp(e.op));
    if (skipped.length) note(`skipped ${skipped.map(e => e.op).join(', ')}: not an op in this build`, { kind: 'skipped' });
    const r = known.length ? State.apply({ effects: known }, opts ? Object.assign({}, W, opts) : W) : { applied: [], rejected: [] };
    r.skipped = skipped;
    return r;
  }
  /* Placeholders in an effect list filled for one person ("{npcId}",
     "{npc}", "{playerName}"; also "{player}", "{witnessId}", "{witness}",
     "{place}"). ctx: { npc (a record or an id), player (the player record
     or a name; the game's player by default), witnessId?, locationId? }.
     An effect left with a placeholder nothing could fill is dropped. */
  function fillEffects(effects, ctx) {
    ctx = ctx || {};
    const s = st();
    const n = typeof ctx.npc === 'string' ? State.npc(ctx.npc) : isObj(ctx.npc) ? ctx.npc : null;
    const p = ctx.player === undefined ? (s ? s.player : null) : ctx.player;
    const playerName = typeof p === 'string' ? p : isObj(p) ? p.name : null;
    const w = ctx.witnessId ? State.npc(ctx.witnessId) : null;
    const l = ctx.locationId ? State.loc(ctx.locationId) : null;
    // Wave 27: whom a report goes to ({protectorId}, {protector}).
    const pr = ctx.protectorId ? State.npc(ctx.protectorId) : null;
    // Wave 29: the leverage record a tell or a price is about ({leverageId}) and the price named ({amount}, {price}: "$100").
    const amount = Number.isInteger(ctx.amount) ? ctx.amount : null;
    return fillPlaceholders(effects, {
      npcId: n ? n.id : null, npc: n ? n.name : null, playerName, player: playerName,
      witnessId: w ? w.id : null, witness: w ? w.name : null, place: l ? placeIn(l) : null,
      protectorId: pr ? pr.id : null, protector: pr ? pr.name : null,
      leverageId: typeof ctx.leverageId === 'string' ? ctx.leverageId : null, amount: amount !== null ? String(amount) : null, price: amount !== null ? money(amount) : null
    });
  }
  /* Town news: State's addNews op does the push;
     it is noted in recent either way. opts: { factionId, public, epilogue,
     eventId?, seen? (it happened in front of the player), day?, phase? }. */
  function pushNews(text, opts) {
    const o = opts || {};
    const t = clipWords(text, o.epilogue === true ? 1500 : 400);
    if (!t) return false;
    note(t, { kind: 'news', factionId: o.factionId || null, public: o.public === true, epilogue: o.epilogue === true });
    if (!hasOp('addNews')) return false;
    const op = { op: 'addNews', text: t, factionId: o.factionId || null, public: o.public === true };
    if (o.epilogue) op.epilogue = true;
    if (o.eventId) op.eventId = o.eventId;
    if (o.seen === true) op.seen = true;
    if (Number.isInteger(o.day)) op.day = o.day;
    if (PHASES.includes(o.phase)) op.phase = o.phase;
    return !State.apply({ effects: [op] }, W).rejected.length;
  }
  function isFree(n) { return !!n && n.alive !== false && n.status === 'free'; }
  function scheduled(npcId) {
    return st().locations.some(l => PHASES.some(p => ((l.npcIdsBySchedule || {})[p] || []).includes(npcId)));
  }
  function looseEndOf(seedId) { return (st().player.looseEnds || []).find(le => le.seedId === seedId) || null; }
  /* The NPC a seed is about: its origin, else the loose end that planted it
     (wave 22: an appointment's person first). */
  function seedNpcId(sd) {
    if (isObj(sd.appointment) && typeof sd.appointment.npcId === 'string') return sd.appointment.npcId;
    if (sd.origin && sd.origin.npcId) return sd.origin.npcId;
    const le = looseEndOf(sd.id);
    return le ? le.npcId : null;
  }
  function seedStatus(sd) {
    if ((st().dueEvents || []).some(e => e.seedId === sd.id)) return 'due';
    return sd.fired ? 'fired' : 'waiting';
  }
  /* Where an NPC is right now (schedule or visit), or null when off-screen. */
  function whereIs(npcId) {
    const s = st();
    if (!s) return null;
    const l = s.locations.find(x => State.npcsAt(x.id).some(n => n.id === npcId));
    return l ? l.id : null;
  }
  function obligations() {
    const s = st();
    if (!s) return [];
    const list = State.obligations();
    return arr(list).filter(isObj);
  }
  /* How far a faction has got: every segment filled on its clocks, a
     finished clock counting in full ("the vote clock is at 4 or more" still
     holds once it is done and the next clock has started). */
  function clockProgress(factionId) {
    const f = State.faction(factionId);
    if (!f || !Array.isArray(f.clocks)) return 0;
    const at = Number.isInteger(f.activeClock) ? f.activeClock : 0;
    return f.clocks.reduce((sum, c, i) => sum + (at < 0 || i < at ? (c.segments | 0) : i === at ? (c.filled | 0) : 0), 0);
  }
  /* A seed's or a clock's requires, an event branch's when
     (docs/notes/engine-world.md): every part named must hold. npcFree: [ids] free;
     npcAt: { npcId: locationId } there now; flagsSet / flagsUnset: [keys];
     obligationOpen: [ids] still open; obligationStatus: { id: status };
     clockAtLeast: { factionId: n } (clockProgress); attitudeAtLeast:
     { npcId: n } (liking, for older town copies); attitudeBelow: { npcId:
     n } and threadOpen: [ids] (wave 5); relAtLeast and relBelow: {
     npcId: { liking, trust, fear, knows } } (wave 30); playerAt:
     locationId (the player is there when it is
     read: for a town event, the tick that fires it, after any walk into
     that phase). Nothing named, or no object: it holds. */
  function conditionsMet(c, opts) {
    if (!isObj(c)) return true;
    const s = st();
    const flags = (s && s.flags) || {};
    // opts.playerAt (wave 4): where the player is counted, for a walk that lands at a town event as it starts.
    const at = opts && typeof opts.playerAt === 'string' ? opts.playerAt : s && s.player ? s.player.locationId : null;
    if (typeof c.playerAt === 'string' && c.playerAt && ((opts && opts.playerAway) || at !== c.playerAt)) return false;
    if (arr(c.flagsSet).some(k => !flags[k])) return false;
    if (arr(c.flagsUnset).some(k => !!flags[k])) return false;
    if (arr(c.npcFree).some(id => !isFree(State.npc(id)))) return false;
    for (const [id, l] of entries(c.npcAt)) if (whereIs(id) !== l) return false;
    for (const [id, n] of entries(c.attitudeAtLeast)) { const p = State.npc(id); if (!p || !(p.attitude >= Number(n))) return false; }
    // Wave 5: attitudeBelow { npcId: n } (they still hold it against the player) and threadOpen [ids] (a loose end not settled yet).
    for (const [id, n] of entries(c.attitudeBelow)) { const p = State.npc(id); if (!p || !(p.attitude < Number(n))) return false; }
    /* Wave 30: relAtLeast / relBelow { npcId: { liking?, trust?, fear?,
       knows? } } (warmth and familiarity read as liking and knows), every
       track named at least or under its number (Rel.meets, Rel.below).
       Spark and romance are never readable here. */
    for (const [id, cond] of entries(c.relAtLeast)) { const p = State.npc(id); if (!p || !isObj(cond) || !Rel.meets(p, cond)) return false; }
    for (const [id, cond] of entries(c.relBelow)) { const p = State.npc(id); if (!p || !isObj(cond) || !Rel.below(p, cond)) return false; }
    // As it is, a status held for its news included (wave 7: State.threadNow).
    if (arr(c.threadOpen).some(id => { const t = State.thread(id); return !t || State.threadNow(t, 'status') !== 'open'; })) return false;
    for (const [id, n] of entries(c.clockAtLeast)) if (!(clockProgress(id) >= Number(n))) return false;
    const obl = obligations();
    if (arr(c.obligationOpen).some(id => !obl.some(o => o.id === id && o.status === 'open'))) return false;
    for (const [id, status] of entries(c.obligationStatus)) if (!obl.some(o => o.id === id && o.status === status)) return false;
    return true;
  }
  /* Something to tell now that is not a seed of the town's (a town event, a
     missed obligation, an arrest): a seed of origin 'town' planted and
     fired at once, so it is a due event like any other. opts: { key, text,
     npcId?, bring? (they come to the player), locationId? (told only
     there), scene? }. Returns the seed id, or null. */
  function dueNow(opts) {
    const s = st();
    const text = cleanText(opts.text, 400);
    if (!s || !text) return null;
    const n = opts.npcId ? State.npc(opts.npcId) : null;
    const id = uniqueId(`seed_due_${slugify(opts.key || 'event').slice(0, 30)}`, x => !!State.seed(x));
    const trigger = opts.locationId && State.loc(opts.locationId) ? { type: 'location', value: opts.locationId } : { type: 'day', value: s.time.day };
    const seed = { id, cause: `Engine: ${cleanText(opts.key, 60) || 'event'}`, effect: text, trigger, fired: false, hidden: true, origin: Object.assign({ kind: 'town' }, n ? { npcId: n.id } : {}) };
    if (applyEffects([{ op: 'plantSeed', seed }]).rejected.length) return null;
    const ev = { seedId: id, text };
    if (n) ev.npcId = n.id;
    if (opts.scene) ev.scene = true;
    if (opts.eventId) ev.eventId = opts.eventId;
    if (opts.obligationId) ev.obligationId = opts.obligationId;
    const diff = { seedsFired: [id], dueAdd: [ev] };
    if (n && opts.bring && isFree(n)) { ev.bring = true; diff.visits = [{ npcId: n.id, locationId: s.player.locationId }]; }
    State.apply(diff, W);
    return id;
  }

  // ----- a. faction clocks -----
  function rollD6(f) {
    const forced = Object.prototype.hasOwnProperty.call(hooks.clockRolls, f.id) ? hooks.clockRolls[f.id] : hooks.clockRolls['*'];
    return Number.isInteger(forced) ? forced : Rng.d(6);
  }
  /* The lowest d6 that fills a segment: odds on the clock, else on the
     faction (a number 1 to 6, "4-6" or "4+", or a chance below 1), else 5. */
  function oddsOf(f, c) {
    const v = c && c.odds !== undefined ? c.odds : f.odds;
    if (Number.isInteger(v) && v >= 1 && v <= 6) return v;
    if (typeof v === 'number' && v > 0 && v < 1) return clamp(7 - Math.round(v * 6), 1, 6);
    const m = typeof v === 'string' ? /^\s*([1-6])\s*(?:[-–+]|$)/.exec(v) : null;
    return m ? parseInt(m[1], 10) : CLOCK_ODDS;
  }
  function rollClocks() {
    const fills = [];
    // Once the ending is told the town's plans stop (wave 5, playtest Q9): nothing runs on to contradict it.
    if (st().flags.epilogueShown) return fills;
    for (const f of st().factions) {
      const c = activeClock(f);
      if (!c || c.filled >= c.segments) continue;
      const roll = rollD6(f);
      if (roll < oddsOf(f, c)) continue;
      fills.push({ factionId: f.id, delta: 1 });
      note(`${f.id} rolls ${roll}: "${c.label}" ${c.filled + 1}/${c.segments}`, { kind: 'clock', factionId: f.id });
    }
    if (fills.length) State.apply({ clockFill: fills }, W);
    return fills;
  }

  // ----- b. clock complete -----
  /* Could the player see it happen? Effects on the player always; else only
     effects that change a place or a person, and only if they name the
     place the player stands in or someone standing there with them
     (presence taken before the effects). Wave 8 (the final pass): what
     reaches the player wherever they are (WIDE_OPS: the town's prices,
     their own) is no sign of where it happens; and a plan with a place or
     a person of its own (the barriers on the old bridge) is seen only
     there, not wherever someone its thread links to stands (Royce at the
     Low Water): the links count only for a plan with neither. Else it is
     news (the morning's "Overnight in town", a "Meanwhile in town" line). */
  const WIDE_OPS = ['priceMultiplier', 'playerPrice'];
  function noticeable(effects, where) {
    const ids = new Set();
    const linked = new Set();
    for (const e of effects) {
      if (!isObj(e) || WIDE_OPS.includes(e.op)) continue;
      if (PLAYER_OPS.includes(e.op)) return true;
      if (!SEEN_OPS.includes(e.op)) continue;
      if (e.locationId) ids.add(e.locationId);
      if (e.npcId) ids.add(e.npcId);
      const t = e.op === 'openThread' ? e.thread : e.op === 'threadStatus' ? State.thread(e.threadId) : null;
      if (isObj(t) && Array.isArray(t.linkedIds)) t.linkedIds.forEach(x => linked.add(x));
    }
    if (!ids.size) linked.forEach(x => ids.add(x));
    return ids.has(where.locationId) || where.presentIds.some(id => ids.has(id));
  }
  function fallbackRumour(f, idx, text) {
    const src = st().npcs.find(n => n.factionId === f.id && isFree(n)) || null;
    return { id: uniqueId(`rum_${f.id.slice(4)}_clock_${idx + 1}`, id => !!State.rumour(id)), text, true: true, sourceNpcId: src ? src.id : null, heard: false };
  }
  function completeClock(f, c, phase, events, at) {
    const s = st();
    const idx = f.activeClock;
    const oc = isObj(c.onComplete) ? c.onComplete : {};
    // After the ending (wave 5, playtest Q9): nothing comes of a plan still running.
    const over = !!s.flags.epilogueShown;
    // requires: what the completion needs; else its alt, else nothing.
    const met = !over && conditionsMet(oc.requires);
    const alt = !over && !met && isObj(oc.alt) ? oc.alt : null;
    const text = cleanText(met ? oc.text : alt ? alt.text : '', 400);
    const effects = fillEffects(met ? oc.effects : alt ? alt.effects : [], {});
    if (text && !effects.some(e => isObj(e) && e.op === 'addRumour')) effects.push({ op: 'addRumour', rumour: fallbackRumour(f, idx, text) });
    // The faction's own people know the news of what it did.
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (isObj(e) && e.op === 'addRumour' && isObj(e.rumour) && !e.rumour.factionId) effects[i] = Object.assign({}, e, { rumour: Object.assign({}, e.rumour, { factionId: f.id }) });
    }
    // Where the player is for it (at: a walk's landing, when the clock steps run ahead for it), and who is there then.
    const where = isObj(at) && at.locationId ? { locationId: at.locationId, presentIds: State.npcsAt(at.locationId, at.phase, at.day).map(n => n.id) }
      : { locationId: s.player.locationId, presentIds: State.npcsAt(s.player.locationId, phase).map(n => n.id) };
    const seen = noticeable(effects, where);
    // One news item for it (its own addNews when it has one), seen already when it happened in front of the player (the quiet line below tells it).
    const own = effects.some(e => isObj(e) && e.op === 'addNews');
    const res = applyEffects(seen ? effects.map(e => (isObj(e) && e.op === 'addNews' ? Object.assign({}, e, { seen: true }) : e)) : effects);
    State.apply({ clockNext: [f.id] }, W);
    if (text && !own) pushNews(text, { factionId: f.id, public: true, seen: seen && !!text });
    const next = activeClock(f);
    const how = over ? ' (after the ending: nothing comes of it)' : met ? '' : alt ? ' (its requirements did not hold: the alternative)' : ' (its requirements did not hold: nothing happens)';
    note(`${f.id} completes "${c.label}"${how} ${seen ? 'where the player can see it' : 'off-screen'}${res.rejected.length ? ` (${res.rejected.length} effects rejected)` : ''}; ${next ? `next clock "${next.label}"` : 'no clocks left'}`, { kind: 'complete', factionId: f.id, clock: idx });
    const ev = { kind: 'clock', factionId: f.id, clock: idx, seen, rejected: res.rejected.length, met, alt: !!alt };
    // Done in front of a player who slept, waited or skipped through it (wave 5, playtest Q8): the narration that follows tells it, at their place; else a quiet line.
    if (seen && text && TOLD_CAUSES.includes(tickCause) && dueNow({ key: `clock_${f.id}_${idx + 1}`, text, locationId: where.locationId })) ev.told = true;
    else if (seen && text) ev.notice = text;
    events.push(ev);
  }
  function completeClocks(phase, events, at) {
    for (const f of st().factions) {
      for (let guard = 0; guard < 8; guard++) {
        const c = activeClock(f);
        if (!c || c.filled < c.segments) break;
        completeClock(f, c, phase, events, at);
      }
    }
  }
  /* The tick's clock steps (a and b) for a phase, run ahead of its tick
     (wave 5, the fourth review's risk): a walk that lands at a town event
     as it starts picks the event's branch after that phase's clocks, as a
     player already there would. flags.clocksAhead keeps the phase
     ("day.phase") so its tick does not run them again; what they told
     waits for that tick's events. at: { locationId, day, phase }. */
  function phaseKey(at) { return `${at.day}.${at.phase}`; }
  function clocksAhead(at) {
    const s = st();
    const key = phaseKey(at);
    if (s.flags.clocksAhead === key) return;
    const events = [];
    const outer = tickAt;
    tickAt = { day: at.day, phase: at.phase };
    try {
      rollClocks();
      fireWhere(sd => isObj(sd.trigger) && sd.trigger.type === 'clock');
      completeClocks(at.phase, events, at);
    } finally { tickAt = outer; }
    applyEffects([{ op: 'setFlag', key: 'clocksAhead', value: key }]);
    ahead = { key, turn: s.meta.turn, events };
  }

  // ----- c. obligations past their day -----
  /* State.tickObligations(day) settles every open obligation past its due
     day as missed (its onMiss effects applied there) and returns them. Each
     is a quiet line for the player ("Missed: <the task>"), one news item
     (not public: the player's own business; the obligation's own onMiss
     addNews when it has one, else content's missText, else that line) and
     a due event (missText, else a plain "comes looking" line). The person owed is owedTo (askerId, the
     older name), else the person it binds; an errand without one has
     nobody (the person the thing goes to may not know it exists). They
     remember it, and come to the player only when free and in town; a
     missText is told without them otherwise. */
  const MISSED_ABOUT = { debt: 'the money owed', blackmail: 'the money for keeping quiet', promise: 'the promise', errand: 'the errand', lodging: 'the room' };
  function owedId(o) {
    if (!o) return null;
    const owed = o.owedTo || o.askerId;
    if (owed) return owed;
    return o.kind === 'errand' ? null : o.npcId;
  }
  function missedObligations(day, events) {
    let missed = [];
    try { missed = arr(State.tickObligations(day, { detail: true })); } catch (err) { console.warn('[World] tickObligations failed', err); return []; }
    const list = obligations();
    const out = [];
    for (const m of missed) {
      const id = isObj(m) ? m.id : m;
      const o = list.find(x => x.id === id) || (isObj(m) && m.text !== undefined ? m : null);
      // What its onMiss took from the player (wave 6, the fifth review's bug 2): said in the Missed line.
      const took = isObj(m) && (m.gold > 0 || arr(m.items).length) ? m : null;
      const whoId = owedId(o);
      const n = whoId ? State.npc(whoId) : null;
      const what = cleanText(o ? o.text : String(id || ''), 300) || 'a promise';
      const missText = o && typeof o.missText === 'string' ? cleanText(o.missText, 300) : '';
      // The player's own line (the feed's quiet notice) names the task; the news is what happened.
      const taken = took ? andList((took.gold > 0 ? [`${money(took.gold)}${o && (o.kind === 'debt' || o.kind === 'blackmail') ? ' toward it' : ''}`] : []).concat(arr(took.items).map(x => `your ${x}`))) : '';
      const line = `Missed: ${what.replace(/[.!]$/, '')}${o && Number.isInteger(o.dueDay) ? ` (due Day ${o.dueDay})` : ''}.${taken ? ` ${n ? n.name : 'They'} took ${taken}.` : ''}`;
      const ownNews = arr(o && o.onMiss).some(e => isObj(e) && e.op === 'addNews');
      if (!ownNews) pushNews(missText || line, { public: false });
      if (n && n.alive !== false) {
        // They remember it (weight 3), unless the obligation's own onMiss already gave them a memory.
        const told = arr(o && o.onMiss).some(e => isObj(e) && e.op === 'addMemory' && e.npcId === n.id);
        if (!told) applyEffects([{ op: 'addMemory', npcId: n.id, text: `${st().player.name} let it go past due: ${lowerFirst(what).replace(/[.!]$/, '')}`, weight: 3 }]);
      }
      // The due event: content's missText, else a plain line. Only someone free and in town comes looking.
      // A missText tells its onMiss news too (wave 8, the final pass): that news (State.missedEventId) is seen once the due event is told, so "Overnight in town" does not tell it again.
      const sameNews = missText && ownNews && o ? { eventId: State.missedEventId(o) } : {};
      const comes = isFree(n) && presenceOf(n) === 'here';
      if (comes) {
        const text = missText || `${n.name} comes looking for ${st().player.name} about ${MISSED_ABOUT[o && o.kind] || 'what was promised'}, now past due.`;
        dueNow(Object.assign({ key: `missed_${id}`, text, npcId: n.id, bring: true, obligationId: o ? o.id : null }, sameNews));
      } else if (missText) {
        dueNow(Object.assign({ key: `missed_${id}`, text: missText, obligationId: o ? o.id : null }, sameNews));
      }
      note(`obligation ${id} missed`, { kind: 'obligation', id });
      events.push({ kind: 'obligation', id, notice: line });
      out.push(id);
    }
    return out;
  }

  // ----- d. schedules -----
  function homeFor(n) {
    const open = st().locations.filter(l => !l.closed && l.away !== true);
    const text = `${(n.tags || []).join(' ')} ${n.role || ''}`.toLowerCase();
    const ofType = types => { for (const t of types) { const l = open.find(x => x.type === t); if (l) return l; } return null; };
    for (const [re, types] of HOME_RULES) if (re.test(text)) { const l = ofType(types); if (l) return l; }
    const l = ofType(HOME_FALLBACK);
    if (l) return l;
    const busy = x => PHASES.reduce((k, p) => k + (((x.npcIdsBySchedule || {})[p] || []).length), 0);
    return open.slice().sort((a, b) => busy(b) - busy(a))[0] || null;
  }
  function settleHomes() {
    for (const le of st().player.looseEnds || []) {
      const sd = State.seed(le.seedId);
      const n = State.npc(le.npcId);
      if (!sd || !sd.fired || !isFree(n) || scheduled(n.id)) continue;
      // A home someone told the player about (State placesRevealed) wins over one picked by role.
      const told = n.home && n.home.revealed ? State.loc(n.home.locationId) : null;
      const home = told && !told.closed ? told : n.home ? null : homeFor(n);
      if (!home) continue;
      State.apply({ npcHome: [{ npcId: n.id, locationId: home.id, phases: 'all' }] }, W);
      note(`${n.id} settles in at ${home.id}`, { kind: 'home', npcId: n.id });
    }
  }

  // ----- e. grudges and favours -----
  const isFeeling = sd => !!(sd && sd.origin && (sd.origin.kind === 'grudge' || sd.origin.kind === 'favour'));
  function hasOpenFeeling(npcId) { return st().seeds.some(sd => !sd.fired && isFeeling(sd) && sd.origin.npcId === npcId); }
  /* The mark a feeling's seed carries for the memory it grew from, so one
     memory plants one feeling: its turn and the start of its words. */
  function feelingMark(m) { return `m${m.turn | 0}:${slugify(m.text).slice(0, 24)}`; }
  function feelingPlanted(n, m) {
    if (m.feelingPlanted === true) return true;
    const mark = `[${feelingMark(m)}]`;
    return st().seeds.some(sd => isFeeling(sd) && sd.origin.npcId === n.id && String(sd.cause || '').includes(mark));
  }
  /* The newest memory of at least minWeight that has not grown a feeling
     yet. grudge (wave 27, design section 6.2): only one that can grow a
     grudge (Rel.grudgeFit: a harm still unsettled, or settled the same day;
     never a copy of something seen, a loose end's line or a fact). A
     witness copy grows no favour either. */
  function freshMemory(n, minWeight, grudge) {
    // Not what they did to the player (act 'own', wave 6: the round-5 playtest's R3).
    const ms = (n.memories || []).filter(m => m.weight >= minWeight && m.act !== 'own' && !m.witness && !feelingPlanted(n, m) && (!grudge || Rel.grudgeFit(m)));
    return ms.length ? ms[ms.length - 1] : null;
  }
  /* The day the NPC's last feeling fired (its trigger day), or null. */
  function lastFeelingDay(npcId) {
    let last = null;
    for (const sd of st().seeds) {
      if (!sd.fired || !isFeeling(sd) || sd.origin.npcId !== npcId) continue;
      const d = sd.trigger && sd.trigger.type === 'day' ? toInt(sd.trigger.value) : null;
      if (d !== null && (last === null || d > last)) last = d;
    }
    return last;
  }
  /* The tags a template is matched against: the person's own, and what
     their age and role say (elderly at 70, a teenager under 18, police). */
  function feelingTags(n) {
    const tags = new Set((n.tags || []).map(t => String(t).toLowerCase()));
    if (Number.isInteger(n.age) && n.age >= 70) tags.add('elderly');
    if (Number.isInteger(n.age) && n.age < 18) { tags.add('teenager'); tags.add('teen'); }
    if (/\b(police|officer|chief|deputy|sheriff)\b/i.test(String(n.role || ''))) tags.add('police');
    return tags;
  }
  /* Wave 28: a template's needs ({ trust }, the photo and the ramp warning
     30, the alibi 40; Rel.meets) hold too, so a favour that has to be
     believed comes only from someone who trusts the player. */
  function templateFits(t, n) {
    const tags = feelingTags(n);
    const want = arr(t.forTags).map(x => String(x).toLowerCase());
    const not = arr(t.notForTags).map(x => String(x).toLowerCase());
    return (!want.length || want.some(x => tags.has(x))) && !not.some(x => tags.has(x)) && (!isObj(t.needs) || Rel.meets(n, t.needs));
  }
  function templatesOf(kind) { return kind === 'grudge' ? GRUDGE_TEMPLATES : FAVOUR_TEMPLATES; }
  /* What a grudge's memory is about, and what kind of answer a grudge
     template is. Wave 4 (playtest R6): the template says (kind: violence,
     police, gossip, money or ban), so a rumour that the player "has been
     talking to the police" is gossip, not the police; a template with no
     kind is read from its effects as before. */
  /* Wave 5 (playtest Q3): first the kind of turn the memory was made in
     (State keeps act: an attack is violence, a theft theft, words an
     insult), so "told me to beat it" is no beating; a memory without one
     (an older save, an effect's) is read by its words, the words of an
     insult first ("called me a thief", "said I fight like a girl").
     Wave 26: Rel.kindOf, the same reading for every line that moves no
     track; a typed memory (an event's) answers by its event. */
  function memoryKind(m) { return Rel.kindOf(m); }
  const GRUDGE_KINDS = ['violence', 'police', 'gossip', 'money', 'ban'];
  const GRUDGE_FOR = { violence: ['violence', 'police'], theft: ['police', 'gossip', 'money'], insult: ['gossip', 'ban', 'money'] };
  // Templates with a use of their own (wave 27: report; wave 29: tell, price, and the favour asked back: ask), never an ordinary grudge or favour.
  const OWN_KINDS = Object.freeze(['report', 'tell', 'price', 'ask']);
  function grudgeKind(t) {
    if (t && GRUDGE_KINDS.includes(t.kind)) return t.kind;
    const effects = arr(t && t.effects);
    if (effects.some(e => isObj(e) && e.op === 'playerHp')) return 'violence';
    if (effects.some(e => isObj(e) && (e.npcId === 'npc_marcus' || e.key === 'fac_police' || e.op === 'playerGold'))) return 'police';
    if (effects.some(e => isObj(e) && e.op === 'banFrom')) return 'ban';
    if (effects.some(e => isObj(e) && (e.op === 'playerPrice' || e.op === 'takeItem'))) return 'money';
    return 'gossip';
  }
  function templateOf(sd) {
    const list = isFeeling(sd) ? templatesOf(sd.origin.kind) : null;
    return list && Number.isInteger(sd.origin.template) ? (list[sd.origin.template] || null) : null;
  }
  /* opts (wave 27): rng (a draw of its own, Rel.rng, for the plants the
     new rules add: the tough answer to a beat-down, a report that has
     nobody to go to; today's plants keep the shared stream), kinds (only
     these kinds of answer), prefer (a template filter tried first), why
     (kept on the seed's origin: tough, nobody). A grudge's kind of answer
     comes from what the memory is about (design section 6.2): violence by
     violence if they are tough, else the police; a theft by the police,
     gossip or money; words by gossip, a ban or money; someone afraid of
     the player (fear 40) answers only with the police or gossip. A report
     template (kind report) is never a grudge's. */
  function plantFeeling(n, kind, memory, day, opts) {
    const s = st();
    const o = opts || {};
    const rng = o.rng || Rng;
    const list = templatesOf(kind);
    if (!Array.isArray(list) || !list.length) return null;
    // A template that fits them and that they have not used yet, if there is one.
    const used = s.seeds.filter(sd => sd.origin && sd.origin.kind === kind && sd.origin.npcId === n.id).map(sd => sd.origin.template);
    // A template that answers one kind of offence only (about; wave 6, the round-5 playtest's design note: the police told of things gone missing answer a theft, never a beating) answers nothing else.
    const about = kind === 'grudge' ? memoryKind(memory) : null;
    // Wave 29: a tell, a price or an ask is never an ordinary grudge's or favour's (o.filter picks among the templates further).
    const own = t => !OWN_KINDS.includes(t.kind) && (typeof o.filter !== 'function' || o.filter(t));
    const pick = typeof o.only === 'function' ? o.only : own;
    const fit = list.map((t, i) => (isObj(t) && pick(t) && templateFits(t, n) && (!Array.isArray(t.about) || t.about.includes(about))
      && (!Array.isArray(o.kinds) || o.kinds.includes(grudgeKind(t))) ? i : -1)).filter(i => i >= 0);
    if (!fit.length) return null;
    let idxs = fit.filter(i => !used.includes(i));
    if (!idxs.length) idxs = fit;
    // What the memory is about picks the kind of answer (wave 3; wave 27: violence by violence only from someone tough, else the police; fear 40 allows only the police or gossip).
    const ax = kind === 'grudge' ? Rel.axesOf(n) : null;
    let want = about === 'violence' ? (ax && ax.tough ? ['violence'] : ['police']) : GRUDGE_FOR[about];
    if (ax && Rel.tracksOf(n).f >= Rel.GATES.compliance.fear) want = (want || GRUDGE_KINDS).filter(k => k === 'police' || k === 'gossip');
    const fitting = want ? idxs.filter(x => want.includes(grudgeKind(list[x]))) : [];
    if (fitting.length) idxs = fitting;
    else if (about === 'violence') { const old = idxs.filter(x => GRUDGE_FOR.violence.includes(grudgeKind(list[x]))); if (old.length) idxs = old; }
    if (typeof o.prefer === 'function') { const pref = idxs.filter(x => o.prefer(list[x])); if (pref.length) idxs = pref; }
    const i = rng.pick(idxs);
    const t = list[i];
    const off = Array.isArray(t.dayOffset) && t.dayOffset.length ? t.dayOffset : [2, 5];
    const lo = clamp(toInt(off[0]) || 2, 1, 30);
    const hi = clamp(toInt(off.length > 1 ? off[1] : off[0]) || lo, lo, 30);
    const origin = { kind, npcId: n.id, template: i };
    if (typeof memory.key === 'string') origin.key = memory.key;
    if (typeof o.key === 'string') origin.key = o.key;
    if (typeof o.why === 'string') origin.why = o.why;
    const seed = {
      id: uniqueId(`seed_${kind}_${n.id.slice(4)}`, id => !!State.seed(id)),
      cause: `${kind === 'grudge' ? 'Grudge' : 'Favour'} [${feelingMark(memory)}]: ${n.name} (attitude ${n.attitude}) remembers "${memory.text}"`,
      effect: fillTemplate(t.effect, { npc: n.name, player: s.player.name, playerName: s.player.name }),
      trigger: { type: 'day', value: day + rng.int(lo, hi) },
      fired: false,
      hidden: true,
      origin
    };
    // Wave 29: what it does besides its template's (an owed favour ends square: owedSettle), carried on the seed.
    if (Array.isArray(o.effects) && o.effects.length) seed.effects = arr(t.effects).concat(o.effects);
    // A plant the new rules add is struck with its turn by /rewind (the old ones never were).
    if (o.rng) seed.turn = s.meta.turn;
    const r = applyEffects([{ op: 'plantSeed', seed }]);
    if (r.rejected.length) return null;
    note(`${n.id} plants a ${kind} seed (${seed.id}, day ${seed.trigger.value})`, { kind, npcId: n.id, seedId: seed.id });
    return seed;
  }
  /* Wave 28 (Rel.GATES.favour, design section 6.2): a favour needs liking
     50 and trust 20, and a help of theirs to answer: the newest memory of
     weight 2 or more, unsettled and first-hand, of something the player did
     for them (HELP_EVENTS: typed, or a legacy line by its words). */
  const HELP_EVENTS = Object.freeze(['did_favour', 'rescued', 'defended', 'kept_word', 'paid_back', 'gift', 'paid_silence']);
  function helpMemory(n) {
    const ms = (n.memories || []).filter(m => isObj(m) && m.weight >= 2 && m.act !== 'own' && !m.witness && !m.secondhand && !feelingPlanted(n, m)
      && HELP_EVENTS.includes(Rel.typeMemory(m)) && !Rel.settlements(m).length);
    return ms.length ? ms[ms.length - 1] : null;
  }
  function favourFits(n) { const c = Rel.tracksOf(n); return c.w >= Rel.GATES.favour.liking && c.t >= Rel.GATES.favour.trust; }
  /* Wave 29 (design section 6.2): the betrayals that grow a grudge by the
     trust route (trust -60 with one of them first-hand and unsettled, or
     the player telling their secret: exposed about them), answered by
     talk or the police. */
  const BETRAYALS = Object.freeze(['lied_caught', 'betrayed_confidence', 'cheated', 'informed_on', 'blackmailed', 'exposed']);
  const GRUDGE_TRUST = -60;
  function betrayal(n) {
    const ms = (n.memories || []).filter(m => isObj(m) && isObj(m.d) && BETRAYALS.includes(m.event) && !m.witness && !m.secondhand && m.act !== 'own' && Rel.harmful(m) && Rel.grudgeFit(m) && !feelingPlanted(n, m));
    return ms.length ? ms[ms.length - 1] : null;
  }
  /* The police bar lifted lately (the integration plan's 8.5): a record the
     player held over them, that they knew of, was spent or voided today or
     yesterday, so their grudge check runs at once, with no cooldown. */
  function barLifted(n, day) {
    return arr(st().leverage).some(x => isObj(x) && x.holder === 'player' && x.over === n.id && x.aware === true && (x.status === 'spent' || x.status === 'void')
      && arr(x.log).some(e => isObj(e) && (e.status === 'spent' || e.status === 'void') && Number.isInteger(e.day) && e.day >= day - Rel.GATES.leverage.liftDays));
  }
  /* A cash favour (a template whose effects pay the player), for the owed
     favour's guard: only at liking 25 and trust 0. */
  function cashFavour(t) { return arr(t && t.effects).some(e => isObj(e) && e.op === 'playerGold' && Number(e.delta) > 0); }
  /* What they owe the player (design section 6.2): owed +2 or more at any
     liking above -25 is paid back unasked, from a favour template with no
     cash in it, or the $100 work only at liking 25 and trust 0; the seed
     ends square (owedSettle), on its own draw. */
  function owedFavour(n, day) {
    const c = Rel.tracksOf(n);
    const G = Rel.GATES.owed;
    if (c.owed < G.net || c.w <= G.liking) return null;
    const owed = (n.rel && Array.isArray(n.rel.owed) ? n.rel.owed : []).filter(o => isObj(o) && Number(o.dir) > 0);
    if (!owed.length) return null;
    const last = owed[owed.length - 1];
    const memory = (n.memories || []).find(m => isObj(m) && m.key === last.key) || { turn: last.turn | 0, day: last.day, text: cleanText(last.why, 120) || 'a favour owed', key: last.key };
    const cashOk = c.w >= G.cashLiking && c.t >= G.cashTrust;
    return plantFeeling(n, 'favour', memory, day, { rng: Rel.rng('owedFavour', n.id, day), filter: t => cashOk || !cashFavour(t), why: 'owed', effects: [{ op: 'owedSettle', npcId: '{npcId}', dir: 1 }] });
  }
  /* What the player owes them (design section 6.2): after 5 days unpaid
     they ask for it back (a FAVOUR_TEMPLATES entry of kind ask, by their
     tags: the mechanic's engine, the bartender's delivery), again 3 days
     after that, and 3 days after the second a crossed-class memory ("never
     paid me back") and the debt is let go. Each on its own draw, keyed by
     the day the debt began. Returns a seed or null. */
  function owedAsk(n, day) {
    const owe = (n.rel && Array.isArray(n.rel.owed) ? n.rel.owed : []).filter(o => isObj(o) && Number(o.dir) < 0);
    if (!owe.length || Rel.tracksOf(n).owed >= 0) return null;
    const G = Rel.GATES.owed;
    const since = Math.min(...owe.map(o => (Number.isInteger(o.day) ? o.day : day)));
    const key = `owed-${since}`;
    const asks = st().seeds.filter(sd => sd.origin && sd.origin.kind === 'favour' && sd.origin.npcId === n.id && sd.origin.key === key);
    const first = asks.find(sd => sd.origin.why === 'ask');
    const second = asks.find(sd => sd.origin.why === 'ask_again');
    const dayOf = sd => (sd && sd.trigger && sd.trigger.type === 'day' ? toInt(sd.trigger.value) : null);
    const memory = { turn: owe[0].turn | 0, day: since, text: cleanText(owe[0].why, 120) || 'a favour owed', key };
    const ask = why => plantFeeling(n, 'favour', memory, day, { rng: Rel.rng(why === 'ask' ? 'owedAsk' : 'owedAskAgain', n.id, day), only: t => isObj(t) && t.kind === 'ask', why, key });
    if (!first) return day - since >= G.askDays ? ask('ask') : null;
    if (!second) return first.fired && day >= dayOf(first) + G.againDays ? ask('ask_again') : null;
    if (second.fired && day >= dayOf(second) + G.againDays) {
      const p = st().player.name;
      const why = cleanText(owe[0].why, 120);
      applyEffects([{ op: 'socialEvent', npcId: n.id, event: 'crossed', text: `${p} never paid me back${why ? `: ${lowerFirst(why).replace(/\.$/, '')}` : ''}`, weight: 2 }, { op: 'owedSettle', npcId: n.id, dir: -1 }]);
      note(`${n.id} gives up on what ${p} owes them: crossed`, { kind: 'owed', npcId: n.id });
    }
    return null;
  }
  /* What someone who holds something on the player does with it (design
     section 2.6.5), on draws of their own, once a record: at liking -60 or
     less they tell it (a GRUDGE_TEMPLATES entry of kind tell: told to
     whoever it matters to, the record spent); a mercenary holder at liking
     10 or less names a price for it (kind price: a blackmail of $50 x
     weight, due in two days, linked to the record). Never in a standoff,
     never the loose end's own record (its seed names its price), never a
     record already priced. */
  function plantHolders(day) {
    const s = st();
    const out = [];
    for (const rec of arr(s.leverage).slice()) {
      if (!isObj(rec) || rec.over !== 'player' || !Rel.LEV_LIVE.includes(rec.status) || isObj(rec.demand)) continue;
      const n = State.npc(rec.holder);
      if (!isFree(n) || Rel.isMinor(n) || Rel.standoff(n)) continue;
      if (s.seeds.some(sd => sd.origin && (sd.origin.kind === 'tell' || sd.origin.kind === 'price') && sd.origin.key === rec.id)) continue;
      const c = Rel.tracksOf(n);
      const L = Rel.GATES.leverage;
      let kind = null;
      if (c.w <= L.tellLiking) kind = 'tell';
      else if (Rel.axesOf(n).mercenary && c.w <= L.priceLiking && !(isObj(rec.about) && rec.about.kind === 'loose_end')) kind = 'price';
      if (!kind) continue;
      const sd = plantHeld(n, rec, kind, day);
      if (sd) out.push(sd);
    }
    return out;
  }
  function plantHeld(n, rec, kind, day) {
    const s = st();
    const rng = Rel.rng(kind, n.id, day);
    const fit = GRUDGE_TEMPLATES.map((t, i) => (isObj(t) && t.kind === kind && templateFits(t, n) ? i : -1)).filter(i => i >= 0);
    if (!fit.length) return null;
    const i = rng.pick(fit);
    const t = GRUDGE_TEMPLATES[i];
    const amount = kind === 'price' ? Rel.GATES.leverage.price * clamp(toInt(rec.weight) || 1, 1, 3) : null;
    const off = Array.isArray(t.dayOffset) && t.dayOffset.length ? t.dayOffset : [1, 2];
    const lo = clamp(toInt(off[0]) || 1, 1, 30);
    const hi = clamp(toInt(off.length > 1 ? off[1] : off[0]) || lo, lo, 30);
    const vars = { npc: n.name, player: s.player.name, playerName: s.player.name, price: amount !== null ? money(amount) : '' };
    const seed = {
      id: uniqueId(`seed_${kind}_${n.id.slice(4)}`, id => !!State.seed(id)),
      cause: `${kind === 'tell' ? 'Tell' : 'Price'}: ${n.name} (attitude ${n.attitude}) holds ${rec.id} over ${s.player.name}`,
      effect: fillTemplate(t.effect, vars),
      trigger: { type: 'day', value: day + rng.int(lo, hi) },
      fired: false,
      hidden: true,
      origin: { kind, npcId: n.id, template: i, key: rec.id },
      effects: fillEffects(arr(t.effects), { npc: n, leverageId: rec.id, amount: amount !== null ? amount : undefined }),
      turn: s.meta.turn
    };
    const r = applyEffects([{ op: 'plantSeed', seed }]);
    if (r.rejected.length) return null;
    note(`${n.id} plants a ${kind} seed for ${rec.id} (${seed.id}, day ${seed.trigger.value})`, { kind, npcId: n.id, seedId: seed.id });
    return State.seed(seed.id) || seed;
  }
  /* Wave 29: a backed ask refused (Pipeline's resolve, the integration plan's
     19.4): the tough answer with violence, planted now; the hard who are
     not tough talk (a gossip grudge) or go to their protector (a report),
     each on its own draw. memory: the blackmailed or threatened_to_tell
     memory it answers. */
  function leverageAnswered(npcId, how, memoryKey) {
    const s = st();
    const n = State.npc(npcId);
    if (!isFree(n)) return null;
    const day = s.time.day;
    const memory = (n.memories || []).find(m => isObj(m) && m.key === memoryKey) || (n.memories || []).slice().reverse().find(m => isObj(m) && (m.event === 'blackmailed' || m.event === 'threatened_to_tell'));
    if (!memory) return null;
    if (how === 'violence') return plantFeeling(n, 'grudge', memory, day, { rng: Rel.rng('levViolence', n.id, day), kinds: ['violence'], why: 'tough', prefer: t => arr(t.forTags).includes('tough') });
    const pr = Rel.protectorOf(n);
    if (pr && Array.isArray(pr.ids) && pr.ids.length) return plantReport(n, { why: 'threat', key: memory.key }, day, { rng: Rel.rng('levReport', n.id, day), force: true });
    return plantFeeling(n, 'grudge', memory, day, { rng: Rel.rng('levTalk', n.id, day), kinds: ['gossip'], why: 'nobody' });
  }
  function plantFeelings(day) {
    const planted = [];
    for (const n of st().npcs.slice()) {
      if (!isFree(n)) continue;
      // Wave 29: a favour the player owes them is asked for back on its own clock, whatever else is waiting.
      const ask = owedAsk(n, day);
      if (ask) planted.push(ask);
      if (hasOpenFeeling(n.id)) continue;
      // Wave 29: each holding something on the other, neither plants a grudge (the standoff).
      if (Rel.standoff(n)) continue;
      const last = lastFeelingDay(n.id);
      if (!barLifted(n, day) && last !== null && day < last + FEELING_COOLDOWN) continue;
      let kind = null;
      let memory = null;
      // Wave 29, the police bar: while the player holds what they know of over them, a grudge never goes to the police (unless they are hard).
      const barred = Rel.policeBarred(n);
      const opts = barred ? { kinds: GRUDGE_KINDS.filter(k => k !== 'police') } : undefined;
      if (n.attitude <= GRUDGE_AT) { memory = freshMemory(n, 3, true); kind = memory ? 'grudge' : null; }
      else if (favourFits(n)) { memory = helpMemory(n); kind = memory ? 'favour' : null; }
      if (!kind && Rel.tracksOf(n).t <= GRUDGE_TRUST && (memory = betrayal(n))) {
        const sd = plantFeeling(n, 'grudge', memory, day, { rng: Rel.rng('trustGrudge', n.id, day), kinds: barred ? ['gossip'] : ['gossip', 'police'], why: 'betrayal' });
        if (sd) planted.push(sd);
        continue;
      }
      if (!kind) { const sd = owedFavour(n, day); if (sd) planted.push(sd); continue; }
      const sd = plantFeeling(n, kind, memory, day, kind === 'grudge' ? opts : undefined);
      if (sd) planted.push(sd);
    }
    planted.push(...plantHolders(day));
    planted.push(...plantReports(day));
    return planted;
  }
  /* Wave 27 (design section 6.2): someone the player has frightened goes to
     whoever looks out for them. For each free person who means to tell
     (Rel.reportWhy: fear 40 from the player's threats, whatever their
     liking; or from violence, at liking 0 or less), once for the memory it
     grew from: a report seed to their protector (Rel.protectorOf), due in
     1 or 2 days, from a GRUDGE_TEMPLATES entry of kind report that suits
     whom it goes to (to: police, or family for a parent, a boss or anyone
     else) and what it is about (threat or violence). Someone with nobody
     to tell (a faction head, a loner) holds it as a grudge instead: gossip,
     or violence if they are tough (the feeling cooldown holds). Every draw
     is the report's own (Rel.rng), so the dice and the clocks do not move.
     Returns the seeds planted. */
  function plantReports(day) {
    const s = st();
    const out = [];
    for (const n of s.npcs.slice()) {
      // Someone under 18 has already told, at once (wave 28: minorHarm). Wave 29: in a standoff nobody reports.
      if (!isFree(n) || Rel.isMinor(n) || Rel.standoff(n)) continue;
      const why = Rel.reportWhy(n);
      if (!why || !why.key) continue;
      if (s.seeds.some(sd => sd.origin && sd.origin.npcId === n.id && sd.origin.key === why.key && (sd.origin.kind === 'report' || sd.origin.why === 'nobody'))) continue;
      const sd = plantReport(n, why, day);
      if (sd) out.push(sd);
    }
    return out;
  }
  /* opts (wave 28): rng (the report's own draw: minorReport, minorThreat,
     minorViolence, coercion), to ({ ids, fallback }: whom it goes to, in
     place of Rel.protectorOf: a guardian's report goes to the police,
     Rel.reportTo), force (a coercion's: "nobody" is a grudge whatever is
     waiting or the cooldown says), news (the town-news line when there is
     nobody at all to tell). */
  function plantReport(n, why, day, opts) {
    const s = st();
    const o = opts || {};
    const memory = (n.memories || []).find(m => isObj(m) && m.key === why.key) || null;
    // Wave 29: a forced report (coercion's) always goes through, past the police bar.
    const pr = isObj(o.to) ? { ids: arr(o.to.ids).filter(id => typeof id === 'string' && id !== n.id), hidden: false, fallback: o.to.fallback || null } : Rel.protectorOf(n, undefined, { anyway: o.force === true });
    const rng = o.rng || Rel.rng('report', n.id, day);
    if (pr && pr.nobody) {
      if (!memory) return null;
      if (!o.force) {
        if (hasOpenFeeling(n.id)) return null;
        const last = lastFeelingDay(n.id);
        if (last !== null && day < last + FEELING_COOLDOWN) return null;
      }
      return plantFeeling(n, 'grudge', memory, day, { rng, kinds: Rel.axesOf(n).tough ? ['violence'] : ['gossip'], why: 'nobody' });
    }
    if (!pr || !pr.ids.length) {
      if (typeof o.news === 'string' && o.news) { applyEffects([{ op: 'addNews', text: o.news }]); note(`${n.id} has nobody to tell: ${o.news}`, { kind: 'report', npcId: n.id }); }
      return null;
    }
    const first = State.npc(pr.ids[0]);
    const to = Rel.isPoliceNpc(first) ? 'police' : 'family';
    const fit = GRUDGE_TEMPLATES.map((t, i) => (isObj(t) && t.kind === 'report' && (!t.to || t.to === to) && (!Array.isArray(t.about) || t.about.includes(why.why)) ? i : -1)).filter(i => i >= 0);
    if (!fit.length) return null;
    const i = rng.pick(fit);
    const t = GRUDGE_TEMPLATES[i];
    const off = Array.isArray(t.dayOffset) && t.dayOffset.length ? t.dayOffset : Rel.GATES.report.days;
    const lo = clamp(toInt(off[0]) || 1, 1, 30);
    const hi = clamp(toInt(off.length > 1 ? off[1] : off[0]) || lo, lo, 30);
    const names = pr.ids.map(id => State.npc(id).name);
    const seed = {
      id: uniqueId(`seed_report_${n.id.slice(4)}`, id => !!State.seed(id)),
      cause: `Report [${memory ? feelingMark(memory) : why.key}]: ${n.name} (fear ${Rel.tracksOf(n).f}) means to tell ${andList(names)}${memory ? ` that "${memory.text}"` : ''}`,
      effect: fillTemplate(t.effect, { npc: n.name, player: s.player.name, playerName: s.player.name, protector: first.name }),
      trigger: { type: 'day', value: day + rng.int(lo, hi) },
      fired: false,
      hidden: true,
      origin: Object.assign({ kind: 'report', npcId: n.id, template: i, key: why.key, why: why.why, protectors: pr.ids.slice() }, pr.hidden ? { hidden: true } : {}, pr.fallback ? { fallback: pr.fallback } : {}),
      turn: s.meta.turn
    };
    const r = applyEffects([{ op: 'plantSeed', seed }]);
    if (r.rejected.length) return null;
    note(`${n.id} plants a report to ${pr.ids.join(', ')} (${seed.id}, day ${seed.trigger.value}${pr.hidden ? ', through a tie nobody knows' : ''})`, { kind: 'report', npcId: n.id, seedId: seed.id });
    return State.seed(seed.id) || seed;
  }
  /* Wave 28: the minor rule's and coercion's consequences (the integration
     plan's 6.2, 6.3, 19.1 and 19.3), each on its own draw and the town's
     standing outside the turn's cap (Rel.MINOR_RULE.rep). Whom the law is
     today: the police head, else the town's policeFallback (the county
     sheriff: a memory on his record and a line of news), else a line of
     news alone. */
  function lawFor(place) {
    const s = st();
    const to = Rel.reportTo();
    const fb = to.fallback ? State.npc(to.fallback) : null;
    return { ids: to.ids, fallback: to.fallback || null, news: fb ? fallbackNews(fb) : `Word reached the county about what happened at ${place || 'town'}.`, player: s.player.name };
  }
  function fallbackNews(fb) { return `A deputy from ${String(fb.where || 'the county').split(',')[0].trim() || 'the county'} came by asking about ${st().player.name}.`; }
  const placeWord = id => { const l = State.loc(id); return l ? String(l.name).replace(/^The /, 'the ') : 'town'; };
  /* A threat or a blow aimed at someone under 18 (design section 2.7 item
     3): reports from them to each guardian (Rel.guardiansOf, family only)
     and to the law (lawFor), at once, once for the memory it made (a threat
     again within three days, or the same fight's blows, is one memory and
     one report), on Rel.rng('minorThreat' or 'minorViolence'), and the
     town's standing -5 for a threat, -10 for violence. why: 'threat' or
     'violence'. Returns the seed or null. */
  function minorHarm(npcId, why) {
    const s = st();
    const n = State.npc(npcId);
    if (!n || !isFree(n) || !Rel.isMinor(n) || (why !== 'threat' && why !== 'violence')) return null;
    const cls = why === 'threat' ? 'threat' : 'violence';
    const m = (n.memories || []).slice().reverse().find(x => isObj(x) && isObj(x.d) && !x.witness && Rel.EVENTS[x.event] && Rel.EVENTS[x.event].dedupe === cls);
    // One report a fight (its key: the blows replace each other's memory) or a memory.
    const key = m ? (typeof m.fight === 'string' && m.fight ? m.fight : m.key) : null;
    if (!key || s.seeds.some(sd => sd.origin && sd.origin.kind === 'report' && sd.origin.npcId === n.id && sd.origin.key === key)) return null;
    const day = s.time.day;
    const g = Rel.guardiansOf(n);
    const law = lawFor(placeWord(s.player.locationId));
    const ids = (g.kind === 'parent' || g.kind === 'family' ? g.ids : []).concat(law.ids).filter((x, i, a) => a.indexOf(x) === i);
    const sd = plantReport(n, { why, key }, day, { rng: Rel.rng(why === 'threat' ? 'minorThreat' : 'minorViolence', n.id, day), to: { ids, fallback: law.fallback }, news: law.news });
    applyEffects([{ op: 'reputationDelta', key: 'town', delta: Rel.MINOR_RULE.rep[why] }]);
    note(`${n.id} is under 18: ${why} reported to ${ids.join(', ') || 'nobody (news)'}; town ${Rel.MINOR_RULE.rep[why]}`, { kind: 'minor', npcId: n.id });
    return sd;
  }
  /* An advance on someone under 18 with a named target and two signals (the
     full row; Pipeline.minorTurn decides): UNWANTED_ADVANCE for them, crossed
     at full and weight 3 for each guardian ("came on to my daughter at
     Pittman's"; a kin's or the police head's own words when that is who
     answers), a report from each guardian (not the police head) to the law
     at once on Rel.rng('minorReport', guardianId, day), the town -10. With
     nobody at all to answer for them, the law outside town takes it as a
     memory (and the news line), else the news line alone. Returns { ids
     (who answered), seeds }. */
  function minorAdvance(npcId) {
    const s = st();
    const n = State.npc(npcId);
    if (!n || !Rel.isMinor(n)) return null;
    const day = s.time.day;
    const place = placeWord(s.player.locationId);
    const R = Rel.MINOR_RULE;
    const fill = (tpl, more) => cleanText(fillTemplate(tpl, Object.assign({ player: s.player.name, place }, more || {})), 200);
    const g = Rel.guardiansOf(n);
    const law = lawFor(place);
    const events = [{ npcId: n.id, event: 'unwanted_advance', text: fill(R.advance) }];
    const answer = g.ids.slice();
    if (!answer.length && law.fallback) answer.push(law.fallback);
    for (const gid of answer) {
      const tpl = g.kind === 'parent' ? R.guardian.ward : g.kind === 'family' ? R.guardian.kin : R.guardian.police;
      // Wave 31: the guardians' anger is the minor rule's own answer, and goes no further along the town's ties (spread: false).
      events.push({ npcId: gid, event: R.guardian.event, weight: R.guardian.weight, text: fill(tpl, { ward: Rel.wardWord(n, gid), child: n.name }), spread: false });
    }
    const r = State.apply({ socialEvents: events, effects: [{ op: 'reputationDelta', key: 'town', delta: R.rep.advance }] }, W);
    if (r.rejected.length) note(`the minor rule for ${n.id}: ${r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ')}`, { kind: 'minor', npcId: n.id });
    const seeds = [];
    if ((g.kind === 'parent' || g.kind === 'family') && law.ids.length) {
      for (const gid of g.ids) {
        const gn = State.npc(gid);
        const m = gn ? (gn.memories || []).slice().reverse().find(x => isObj(x) && x.event === R.guardian.event && x.turn === s.meta.turn) : null;
        if (!m) continue;
        const sd = plantReport(gn, { why: 'advance', key: m.key }, day, { rng: Rel.rng('minorReport', gid, day), to: { ids: law.ids, fallback: law.fallback } });
        if (sd) seeds.push(sd);
      }
    } else if (g.kind !== 'police') applyEffects([{ op: 'addNews', text: law.news }]);
    note(`${n.id} is under 18: the advance answered by ${answer.join(', ') || 'nobody (news)'}; ${seeds.length} report${seeds.length === 1 ? '' : 's'}; town ${R.rep.advance}`, { kind: 'minor', npcId: n.id });
    return { ids: answer, seeds };
  }
  /* A romantic ask pushed with a threat or fear (the integration plan's
     19.1): the report goes to their protector at once (Rel.protectorOf;
     "nobody" is a grudge whatever is waiting; with nobody to hear it, the
     law), on Rel.rng('coercion', npcId, day), and the town -10. The
     events (blackmailed and crossed) are Pipeline's, at resolve. key: the
     memory the report is about. Wave 40: o.report false plants no report
     (a threat to the whole room), o.rep false leaves the town alone (it
     is hit once a turn, however many were pushed). */
  function coercion(npcId, key, o) {
    const s = st();
    const n = State.npc(npcId);
    if (!n) return null;
    o = o || {};
    if (o.report === false) {
      if (o.rep !== false) applyEffects([{ op: 'reputationDelta', key: 'town', delta: Rel.MINOR_RULE.rep.coercion }]);
      note(`${n.id} was pushed with a romantic line to the room: the threat row, no report; town ${o.rep !== false ? Rel.MINOR_RULE.rep.coercion : 'already hit'}`, { kind: 'coercion', npcId: n.id });
      return null;
    }
    const day = s.time.day;
    // A coercion's report goes through whatever the player holds over them (wave 29: the police bar does not stop it).
    const pr = Rel.protectorOf(n, undefined, { anyway: true });
    const law = lawFor(placeWord(s.player.locationId));
    const opts = { rng: Rel.rng('coercion', n.id, day), force: true, news: law.news };
    if (!pr || (!pr.nobody && !(pr.ids || []).length)) opts.to = { ids: law.ids, fallback: law.fallback };
    const sd = isFree(n) ? plantReport(n, { why: 'coercion', key }, day, opts) : null;
    if (o.rep !== false) applyEffects([{ op: 'reputationDelta', key: 'town', delta: Rel.MINOR_RULE.rep.coercion }]);
    note(`${n.id} was pushed with a romantic ask: ${sd ? `${sd.origin && sd.origin.kind === 'report' ? 'a report' : 'a grudge'} (${sd.id})` : 'nothing planted'}; town ${o.rep !== false ? Rel.MINOR_RULE.rep.coercion : 'already hit'}`, { kind: 'coercion', npcId: n.id });
    return sd;
  }
  /* Wave 27 (the integration plan's 19.6): a beat-down on someone tough is
     answered with violence, whatever their liking: a violence grudge for
     the beat-down's memory, planted at once (World.knockDown), on its own
     draw (Rel.rng('toughAnswer')), unless a feeling of theirs is waiting or
     the 7-day feeling cooldown holds. The beating itself first (forTags
     tough), else any violence that fits. */
  function toughAnswer(n, day) {
    if (!isFree(n) || !Rel.axesOf(n).tough || hasOpenFeeling(n.id)) return null;
    const last = lastFeelingDay(n.id);
    if (last !== null && day < last + FEELING_COOLDOWN) return null;
    const memory = (n.memories || []).slice().reverse().find(m => isObj(m) && m.event === 'beat_down' && isObj(m.d) && !m.witness);
    if (!memory) return null;
    return plantFeeling(n, 'grudge', memory, day, { rng: Rel.rng('toughAnswer', n.id, day), kinds: ['violence'], why: 'tough', prefer: t => arr(t.forTags).includes('tough') });
  }

  // ----- f. town events and the epilogue -----
  /* The town events already told: state.eventsFired, kept by State.apply's
     eventsFired when this build has it, else flags "event.<id>". */
  function eventsFired() {
    const s = st();
    if (!s) return [];
    const out = arr(s.eventsFired).filter(x => typeof x === 'string');
    for (const k of Object.keys(s.flags || {})) if (k.startsWith('event.') && s.flags[k] && !out.includes(k.slice(6))) out.push(k.slice(6));
    return out;
  }
  function eventKey(id) { return slugify(id).slice(0, 34); }
  function markEvent(id) {
    if (Array.isArray(State.ENGINE_KEYS) && State.ENGINE_KEYS.includes('eventsFired') && !State.apply({ eventsFired: [id] }, W).rejected.length) return;
    State.apply({ effects: [{ op: 'setFlag', key: `event.${eventKey(id)}`, value: st().time.day }] }, W);
  }
  function eventDone(id) { const done = eventsFired(); return done.includes(id) || done.includes(eventKey(id)); }
  function reached(day, phase, at) {
    if (!Number.isInteger(day)) return false;
    const p = PHASES.includes(phase) ? phase : PHASES[0];
    return at.day > day || (at.day === day && PHASES.indexOf(at.phase) >= PHASES.indexOf(p));
  }
  /* The first branch whose when holds, else the default. opts.playerAway:
     the player was not there for it whatever their place (slept or waited
     through it, or the clock jumped past it), so no playerAt holds. */
  function pickBranch(ev, opts) {
    const brs = arr(ev.branches);
    for (let i = 0; i < brs.length; i++) if (isObj(brs[i]) && conditionsMet(brs[i].when, opts)) return { branch: brs[i], index: i };
    return { branch: isObj(ev.default) ? ev.default : { text: '', effects: [] }, index: -1 };
  }
  /* A town event fires on the tick of its own day and phase. The news it
     makes is told once: the branch's own addNews when it has one (content
     writes the news in its own words), else its text; either carries the
     event's id, so once the player has watched it happen (its due event
     narrated: dueNarrated) the morning's "Overnight in town" leaves it out.
     An event the clock jumped past (/cheat time, a save loaded late) still
     happens, but as something that happened while the player was not
     looking: no scene, no one gathered, its news dated its own day and
     phase. */
  function fireEvents(at, events) {
    const s = st();
    if (!s) return [];
    const t = State.town || {};
    const now = at || { day: s.time.day, phase: s.time.phase };
    const fired = [];
    for (const ev of arr(t.events)) fireEvent(ev, now, events, fired);
    fireEpilogue(now, events, fired);
    return fired;
  }
  function fireEvent(ev, now, events, fired) {
    const s = st();
    if (!isObj(ev) || typeof ev.id !== 'string' || !ev.id || eventDone(ev.id) || !reached(ev.day, ev.phase, now)) return;
    const late = now.day > ev.day || (now.day === ev.day && PHASES.indexOf(now.phase) > PHASES.indexOf(PHASES.includes(ev.phase) ? ev.phase : PHASES[0]));
    // The scene itself only when this tick is now (not a phase slept or waited through on the way to a later one).
    const live = now.day === s.time.day && now.phase === s.time.phase;
    const { branch, index } = pickBranch(ev, { playerAway: late || !live });
    markEvent(ev.id);
    // The people it brings together are there for that phase (a visit), if they are free and in town today.
    if (!late && ev.locationId && now.day === s.time.day && now.phase === s.time.phase) {
      const come = arr(ev.attendees).map(id => State.npc(id)).filter(n => isFree(n) && presenceOf(n) === 'here'
        && !State.awayNow(n) && !State.laidUp(n));
      if (come.length) State.apply({ visits: come.map(n => ({ npcId: n.id, locationId: ev.locationId })) }, W);
    }
    const text = cleanText(branch.text, 600);
    // Its news is dated when it happened: the event's own day and phase when the clock jumped past it, the tick's when it was slept or waited through.
    const when = late ? { day: ev.day, phase: PHASES.includes(ev.phase) ? ev.phase : PHASES[0] } : !live ? { day: now.day, phase: now.phase } : {};
    const own = arr(branch.effects).map(e => (isObj(e) && e.op === 'addNews' ? Object.assign({ eventId: ev.id }, when, e) : e));
    // A thread it resolves holds its reward (its Resolved line) until its news is told (wave 6, the fifth review's bug 6).
    const res = applyEffects(fillEffects(own, { locationId: ev.locationId }), { holdReward: ev.id });
    if (text && !own.some(e => isObj(e) && e.op === 'addNews')) pushNews(text, Object.assign({ public: true, eventId: ev.id }, when));
    const here = !late && ev.locationId && s.player.locationId === ev.locationId;
    if (text && here) dueNow({ key: `event_${ev.id}`, text, locationId: ev.locationId, scene: live, eventId: ev.id });
    toldOrHeld(ev.id);
    note(`event ${ev.id} (${index >= 0 ? `branch ${index + 1}` : 'default'})${here ? ' with the player there' : ''}${late ? `, late: the clock passed day ${ev.day} ${ev.phase} without a tick there, so it is news only` : ''}${res.rejected.length ? ` (${res.rejected.length} effects rejected)` : ''}`, { kind: 'event', eventId: ev.id });
    if (events) events.push({ kind: 'event', id: ev.id, branch: index, here: !!here, late });
    fired.push({ id: ev.id, branch: index, here: !!here, late, day: late ? ev.day : now.day });
  }
  /* A town event that left no news for the player to hear (no text, or
     only private news): what it resolved is earned now, not held. */
  function toldOrHeld(eventId) {
    if (!State.news.some(x => isObj(x) && !x.seen && x.eventId === eventId && x.public !== false)) State.apply({ newsSeen: { eventId } }, W);
  }
  function fireEpilogue(now, events, fired) {
    const s = st();
    const ep = (State.town || {}).epilogue;
    if (isObj(ep) && !s.flags.epilogueShown && ((Number.isInteger(ep.onDay) && now.day >= ep.onDay) || arr(ep.orFlagsSet).some(k => !!s.flags[k]))) {
      const { branch, index } = pickBranch(ep);
      // What the ending resolves is earned once the ending is told (wave 6): its Resolved lines follow its narration however it comes.
      applyEffects(fillEffects(branch.effects, {}), { holdReward: 'ending' });
      State.apply({ effects: [{ op: 'setFlag', key: 'epilogueShown', value: true }] }, W);
      if (!pushNews(branch.text, { public: true, epilogue: true })) State.apply({ newsSeen: 'ending' }, W);
      note(`epilogue (${index >= 0 ? `branch ${index + 1}` : 'default'})`, { kind: 'event', eventId: 'epilogue' });
      if (events) events.push({ kind: 'epilogue', branch: index });
      fired.push({ id: 'epilogue', branch: index });
    }
  }
  /* The clock set outright (/cheat time; wave 5, the round-4 QA): what the
     jump passed happens now, in the order it would have, each dated to its
     own day: a seed due on a day (at the morning of it) and a town event
     (at its day and phase). The ending last. Wave 6 (the round-5
     playtest's R2 and R8): at.from (where the clock was) gives the mornings
     it passed, and each does what a new day does first (morningChores: an
     obligation past its day is missed, a condition or a ban that ran out
     ends); a town seed (no person of its own, not the player's: a loose
     end, a grudge, a favour or their past) is told as news of its day, in
     order with the events ("Meanwhile in town"), not as a due event told
     after them; the player's own come as due events in day order. Returns
     what fired, in order: [{ id, seed?: true, day, text? (a town seed's
     news), here?, late?, notice? (a morning's quiet line), prog (wave 8:
     the length of player.progression once it had fired) }]. */
  const OWN_SEEDS = ['loose_end', 'grudge', 'favour', 'background'];
  function townSeed(sd) { return !seedNpcId(sd) && !OWN_SEEDS.includes(sd.origin && sd.origin.kind); }
  function morningChores(day, fired) {
    const s = st();
    const evs = [];
    missedObligations(day, evs);
    const ended = s.player.conditions.filter(c => Number.isInteger(c.untilDay) && c.untilDay < day);
    if (ended.length) {
      State.apply({ conditionsRemoved: ended.map(c => c.id) }, W);
      for (const c of ended) evs.push({ kind: 'condition', notice: `Condition over: ${c.name}${c.effect ? ` (${c.effect})` : ''}.` });
    }
    State.expireDaily(day);
    // A meeting the jump passed (wave 22): missed, told under its day.
    settleAppointments({ day, phase: PHASES[0] }, null, evs);
    for (const e of evs) if (e && typeof e.notice === 'string') fired.push({ id: `${e.kind}_d${day}`, morning: true, day, notice: e.notice });
  }
  function catchUp(at) {
    const s = st();
    if (!s) return [];
    const now = at ? { day: at.day, phase: at.phase } : { day: s.time.day, phase: s.time.phase };
    const from = isObj(at) && isObj(at.from) && Number.isInteger(at.from.day) ? at.from : null;
    const order = [];
    if (from) for (let d = from.day + 1; d <= now.day; d++) order.push({ day: d, phase: PHASES[0], morning: true, rank: 0 });
    for (const sd of s.seeds) {
      // An appointment fires at its place, not on its day's morning (wave 22).
      if (isObj(sd.appointment)) continue;
      const d = isObj(sd.trigger) && sd.trigger.type === 'day' ? toInt(sd.trigger.value) : null;
      if (d !== null && ready(sd) && reached(d, PHASES[0], now)) order.push({ day: d, phase: PHASES[0], sd, rank: 1 });
    }
    for (const ev of arr((State.town || {}).events)) if (isObj(ev) && typeof ev.id === 'string' && !eventDone(ev.id) && reached(ev.day, ev.phase, now)) order.push({ day: ev.day, phase: PHASES.includes(ev.phase) ? ev.phase : PHASES[0], ev, rank: 2 });
    order.sort((a, b) => a.day - b.day || PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.rank - b.rank);
    const fired = [];
    // What each step earned as it fired (wave 8, the final pass): prog, the length of player.progression after it, so setClock prints a Resolved line under its own day.
    const earned = () => (Array.isArray(s.player.progression) ? s.player.progression.length : 0);
    for (const x of order) {
      const k = fired.length;
      if (x.morning) morningChores(x.day, fired);
      else if (x.ev) fireEvent(x.ev, now, null, fired);
      else if (!x.sd.fired) {
        const town = townSeed(x.sd);
        const told = fire(x.sd, { day: x.day, phase: x.phase, news: town });
        if (told) fired.push(Object.assign({ id: x.sd.id, seed: true, day: x.day }, typeof told === 'string' ? { text: told } : {}));
      }
      for (let i = k; i < fired.length; i++) fired[i].prog = earned();
    }
    // Wave 22: a meeting whose phases the clock has passed today is missed; today's still to come are kept (visits).
    const evs = [];
    settleAppointments(now, null, evs);
    for (const e of evs) if (e && typeof e.notice === 'string') fired.push({ id: `${e.kind}_d${now.day}`, morning: true, day: e.day || now.day, notice: e.notice, prog: earned() });
    appointmentVisits(now.day);
    fireEpilogue(now, null, fired);
    return fired;
  }

  /* A walk that lands at a town event's place in the event's own phase
     (wave 4, playtest R1: walking into Town Hall as the council meeting
     starts): the event happens as the player arrives, so the walk's
     narration tells it, with its people there. It fires now, for that
     phase, with the player counted there (playerAt): the people it brings
     are there for that phase (a visit), its scene is a due event at that
     place, and its news is the event's. The tick that reaches the phase
     finds it done. at: { locationId, day, phase }. Returns the ids fired. */
  function eventsOnArrival(at) {
    const s = st();
    if (!s || !isObj(at) || typeof at.locationId !== 'string' || !PHASES.includes(at.phase) || !Number.isInteger(at.day)) return [];
    const t = State.town || {};
    const fired = [];
    const when = { day: at.day, phase: at.phase };
    for (const ev of arr(t.events)) {
      if (!isObj(ev) || typeof ev.id !== 'string' || !ev.id || eventDone(ev.id) || ev.locationId !== at.locationId) continue;
      if (ev.day !== at.day || (PHASES.includes(ev.phase) ? ev.phase : PHASES[0]) !== at.phase) continue;
      // That phase's clocks first (wave 5, the fourth review's risk): the branch is the one a player already there would get.
      clocksAhead(at);
      if (eventDone(ev.id)) continue;
      const { branch, index } = pickBranch(ev, { playerAt: at.locationId });
      markEvent(ev.id);
      const come = arr(ev.attendees).map(id => State.npc(id)).filter(n => isFree(n) && presenceOf(n) === 'here' && !State.awayNow(n, at.phase, at.day) && !State.laidUp(n, at.day));
      if (come.length) State.apply({ visits: come.map(n => ({ npcId: n.id, locationId: ev.locationId, day: at.day, phase: at.phase })) }, W);
      const text = cleanText(branch.text, 600);
      // Its news is dated when it happens, as the player walks in (wave 5, the fourth review's bug 8), not the phase they set out in.
      const own = arr(branch.effects).map(e => (isObj(e) && e.op === 'addNews' ? Object.assign({ eventId: ev.id }, when, e) : e));
      const res = applyEffects(fillEffects(own, { locationId: ev.locationId }), { holdReward: ev.id });
      if (text && !own.some(e => isObj(e) && e.op === 'addNews')) pushNews(text, Object.assign({ public: true, eventId: ev.id }, when));
      if (text) dueNow({ key: `event_${ev.id}`, text, locationId: ev.locationId, scene: true, eventId: ev.id });
      toldOrHeld(ev.id);
      note(`event ${ev.id} (${index >= 0 ? `branch ${index + 1}` : 'default'}) as the player walks in at day ${at.day} ${at.phase}${res.rejected.length ? ` (${res.rejected.length} effects rejected)` : ''}`, { kind: 'event', eventId: ev.id });
      fired.push(ev.id);
    }
    return fired;
  }

  // ----- g. a new morning -----
  /* The drift (wave 4, playtest R5: a weight-3 memory from the last
     DRIFT_QUIET_DAYS days holds it; one from an older build with no day
     that the log no longer reaches back to is old). Wave 26: the morning's
     step for everyone is State's relDay (Rel.driftStep, the same rule),
     which lands it in the everyday bucket and recomputes every track. */
  function driftAttitudes(day) {
    const r = State.apply({ relDay: day }, W);
    const moved = r.drifted | 0;
    if (moved) note(`attitudes drift for ${moved} people`, { kind: 'drift' });
    return moved;
  }
  function season() {
    const s = st();
    const v = State.season();
    return SEASONS.includes(v) ? v : SEASONS.includes(s.flags.season) ? s.flags.season : 'spring';
  }
  function newMorning(day, events) {
    const s = st();
    const list = ((TABLES.weather && TABLES.weather[season()]) || []).filter(w => w !== s.flags.weather);
    const w = Rng.pick(list);
    if (w) State.apply({ weather: w }, W);
    const ended = s.player.conditions.filter(c => Number.isInteger(c.untilDay) && c.untilDay < day);
    if (ended.length) {
      State.apply({ conditionsRemoved: ended.map(c => c.id) }, W);
      for (const c of ended) events.push({ kind: 'condition', notice: `Condition over: ${c.name}${c.effect ? ` (${c.effect})` : ''}.` });
    }
    driftAttitudes(day);
  }

  function tick(info) {
    const s = st();
    const events = [];
    if (!s) return { phasesPassed: 0, events };
    const to = (info && info.to) || { day: s.time.day, phase: s.time.phase };
    const morning = to.phase === PHASES[0];
    tickAt = to;
    tickCause = (info && info.cause) || null;
    try {
      // a and b ran ahead for this phase (a walk into a town event): what they told is this tick's.
      if (s.flags.clocksAhead === phaseKey(to)) {
        applyEffects([{ op: 'setFlag', key: 'clocksAhead', value: null }]);
        if (ahead && ahead.key === phaseKey(to)) events.push(...ahead.events);
        ahead = null;
      } else {
        rollClocks();                                                     // a
        fireWhere(sd => isObj(sd.trigger) && sd.trigger.type === 'clock');  // a: clock seeds, before a full clock hands over
        completeClocks(to.phase, events);                                 // b
      }
      if (morning) missedObligations(to.day, events);                   // c
      settleHomes();                                                    // d
      plantFeelings(to.day);                                            // e
      fireEvents(to, events);                                           // f
      if (morning) newMorning(to.day, events);                          // g
      settleAppointments(to, info && info.from, events);                // h (wave 22): a meeting kept or missed
      if (morning) appointmentVisits(to.day);                           //   and the day's meetings kept
      deliverHearsay(to, events);                                       // i (wave 31): word gets round, by the kind of tie
      // Wave 27: the phase that ended, spent with someone, is time together (State's relTurn: spent_time, once a day).
      if (info && isObj(info.from) && Number.isInteger(info.from.day) && PHASES.includes(info.from.phase)) State.apply({ relTurn: { ended: { day: info.from.day, phase: info.from.phase } } }, W);
    } finally { tickAt = null; tickCause = null; }
    return { phasesPassed: (info && info.phasesPassed) || 1, events };
  }

  // ----- i. word gets round (wave 31) -----
  /* The news of what the player did reaches the people tied to whom it
     happened to (State's hearsayDeliver, the integration plan's 11.3): a
     spouse and the household at the night tick, other family and work by
     the morning, the rest when they share a place or in two days. No Rng.
     One line for it, held to the turn's end inside a turn as the tick's
     notices are; what was heard in the night is told with the morning's,
     so a night's sleep gives one line: "Word got round: Lorna, Colt and
     Wade Purvis have heard about the landing." (the people the player
     knows, in the order the player did it; up to three names, then "and
     others"). Returns the line or ''. */
  function deliverHearsay(to, events) {
    const s = st();
    if (!s || !Array.isArray(s.hearsay) || !s.hearsay.some(h => isObj(h) && (!Number.isInteger(h.deliveredTurn) || h.untold === true))) return '';
    const r = State.apply({ hearsayDeliver: { day: to.day, phase: to.phase } }, W);
    const heard = arr(r.hearsay);
    if (r.rejected.length) note(`hearsay: ${r.rejected.map(x => x.reason).join('; ')}`, { kind: 'hearsay' });
    if (!heard.length) return '';
    note(`word got round: ${heard.map(h => `${h.npcId} (about ${h.aboutId})`).join(', ')}`, { kind: 'hearsay' });
    const known = heard.map(h => State.npc(h.npcId)).filter((n, i, a) => n && n.knownToPlayer && n.alive !== false && a.indexOf(n) === i);
    if (!known.length) return '';
    // Strangers to the player are not named, nor counted (design section 7.2: "up to three names, then 'and others'").
    const text = Rel.hearsayLine(known.map(n => n.name), heard.filter(h => known.some(n => n.id === h.npcId)).map(h => h.about));
    if (text && Array.isArray(events)) events.push({ kind: 'hearsay', notice: text });
    return text;
  }

  // ----- appointments (wave 22) -----
  /* A meeting someone agreed to in the story (State.appointmentOf: a seed
     with appointment { npcId, locationId, day, phase, phases }). Its person
     is at its place for the phases it covers (visits: today's as it is
     planted, a later day's here at that day's morning). It fires (its due
     event: the meeting is on) when the player is there in one of those
     phases: as a walk lands there or a turn there begins (appointmentsHere,
     Pipeline step 6), at the end of a turn there (fireSeeds, step 11), or
     as the last of them ends with the player there (settleAppointments).
     Once they have all passed it is settled: kept, or missed. */
  const apptKey = (day, phase) => day * PHASES.length + PHASES.indexOf(phase);
  function pendingAppointments() { return arr((st() || {}).seeds).filter(sd => isObj(sd.appointment) && !sd.fired); }
  function covers(ap, day, phase) { return ap.day === day && arr(ap.phases).includes(phase); }
  // Its person can keep it that day: free, in town, not laid up.
  function canKeep(ap, day) { const n = State.npc(ap.npcId); return isFree(n) && presenceOf(n) === 'here' && !State.laidUp(n, day); }
  /* The day's meetings: each person at their place for the phases still to
     come today (visits with the seed's id; a refused one is noted). */
  function appointmentVisits(day) {
    const s = st();
    const now = apptKey(s.time.day, s.time.phase);
    const v = [];
    for (const sd of pendingAppointments()) {
      const ap = sd.appointment;
      if (ap.day !== day || ap.day !== s.time.day || !canKeep(ap, day)) continue;
      for (const ph of arr(ap.phases)) if (apptKey(ap.day, ph) >= now) v.push({ npcId: ap.npcId, locationId: ap.locationId, day: ap.day, phase: ph, seedId: sd.id });
    }
    if (!v.length) return 0;
    const r = State.apply({ visits: v }, W);
    if (r.rejected.length) note(`appointment visits refused: ${r.rejected.map(x => x.reason).join('; ')}`, { kind: 'seed' });
    return v.length - r.rejected.length;
  }
  /* The player is at a meeting's place in a phase it covers (at: {
     locationId, day, phase }: where a walk lands, or where a turn begins):
     it is kept, and fires now, so this narration tells it. Returns the ids. */
  function appointmentsHere(at) {
    const s = st();
    if (!s || !isObj(at) || typeof at.locationId !== 'string' || !PHASES.includes(at.phase) || !Number.isInteger(at.day)) return [];
    const fired = [];
    for (const sd of pendingAppointments()) {
      const ap = sd.appointment;
      if (ap.locationId !== at.locationId || !covers(ap, at.day, at.phase) || !canKeep(ap, at.day)) continue;
      if (fire(sd)) fired.push(sd.id);
    }
    return fired;
  }
  /* A meeting whose last phase has passed (to: the phase the clock has
     reached; from: the phase that just ended, on a tick): kept if the
     player was at its place as one of its phases ended (it fires: a walk
     that got there as the time ran out); dropped with nothing said if its
     person can no longer keep it (arrested, gone, dead, laid up); else
     missed: the seed goes, the person remembers waiting (weight 1) and is
     3 colder, and the player gets a quiet line ("Jodie Strayhorn waited at
     the Low Water and you never came."). events: the tick's (a notice
     each). Returns how many were missed. */
  function settleAppointments(to, from, events) {
    const s = st();
    if (!s || !isObj(to)) return 0;
    const at = apptKey(to.day, to.phase);
    let missed = 0;
    for (const sd of pendingAppointments()) {
      const ap = sd.appointment;
      const phases = arr(ap.phases);
      if (phases.length && apptKey(ap.day, phases[phases.length - 1]) >= at) continue;
      const n = State.npc(ap.npcId);
      const l = State.loc(ap.locationId);
      if (!l || !canKeep(ap, ap.day)) {
        State.apply({ seedsDropped: [sd.id] }, W);
        note(`${sd.id} dropped: ${ap.npcId} could not keep the meeting`, { kind: 'seed', seedId: sd.id });
        continue;
      }
      if (isObj(from) && covers(ap, from.day, from.phase) && s.player.locationId === ap.locationId) { fire(sd); continue; }
      State.apply({ seedsDropped: [sd.id] }, W);
      // A broken word at half (wave 27): liking -4, trust -8, a weight-1 memory.
      applyEffects([
        { op: 'socialEvent', npcId: n.id, event: 'broke_word', text: `waited for ${s.player.name} at ${placeIn(l)} and they never came`, weight: 1, scale: 0.5 }
      ]);
      if (Array.isArray(events)) events.push({ kind: 'appointment', id: sd.id, day: ap.day, notice: `${n.name} waited at ${placeIn(l)} and you never came.` });
      note(`${sd.id} missed: ${n.id} waited at ${l.id} and the player never came`, { kind: 'seed', seedId: sd.id });
      missed += 1;
    }
    return missed;
  }

  // ----- seeds and due events -----
  function triggerMet(sd, here, presentIds) {
    // An appointment (wave 22) is met at its place, in a phase it covers, with its person able to keep it.
    if (isObj(sd.appointment)) { const ap = sd.appointment; const t = st().time; return here === ap.locationId && covers(ap, t.day, t.phase) && canKeep(ap, t.day); }
    const tr = isObj(sd.trigger) ? sd.trigger : {};
    switch (tr.type) {
      case 'day': { const d = toInt(tr.value); return d !== null && st().time.day >= d; }
      case 'location': return anyOf(tr.value, v => here === v);
      case 'npc': return anyOf(tr.value, v => presentIds.includes(v));
      case 'clock': {
        const m = /^(fac_[a-z0-9_]+):(\d+)$/.exec(String(tr.value));
        const c = m ? activeClock(State.faction(m[1])) : null;
        return !!c && c.filled >= parseInt(m[2], 10);
      }
      default: return false;
    }
  }
  function ready(sd) { return !sd.fired && !(Number.isInteger(sd.notBeforeDay) && st().time.day < sd.notBeforeDay); }
  /* A seed fires: marked fired; if its NPC (if any) is free and its
     requires holds, its effect is a due event and its effects run (a
     grudge's or favour's from its template; a public one is news; a grudge
     leaves its holder +10, got even); if requires does not hold, its alt
     (text and effects) is told instead, or nothing. */
  /* when: { day, phase } to date its news (catchUp: a seed the clock jumped
     past). Wave 6 (the round-5 playtest's R2, R8 and design note): what it
     does counts from that day too (sinceDay: a ban, a condition, a due
     day, a follow-up planted some days on is that many days from now, not
     minutes after), and when.news (a town seed the jump passed) tells it as
     news, not as a due event: the text is returned for the "Meanwhile in
     town" line. */
  function sinceDay(effects, day) {
    const s = st();
    const gone = Number.isInteger(day) ? Math.max(0, s.time.day - day) : 0;
    if (!gone) return effects;
    return effects.map(e => {
      if (!isObj(e)) return e;
      if (e.op === 'banFrom' && Number.isInteger(e.days)) return e.days - gone >= 1 ? Object.assign({}, e, { days: e.days - gone }) : null;
      if (e.op === 'addCondition' && Number.isInteger(e.days)) return e.days - gone >= 0 ? Object.assign({}, e, { days: e.days - gone }) : null;
      if (e.op === 'addObligation' && e.dueDay === undefined && Number.isInteger(e.dueOffset)) { const o = Object.assign({}, e, { dueDay: day + e.dueOffset }); delete o.dueOffset; return o; }
      if (e.op === 'plantSeed' && isObj(e.seed) && isObj(e.seed.trigger) && e.seed.trigger.type === 'day' && Number.isInteger(e.seed.trigger.value)) {
        return Object.assign({}, e, { seed: Object.assign({}, e.seed, { trigger: { type: 'day', value: e.seed.trigger.value + gone } }) });
      }
      return e;
    }).filter(e => e !== null);
  }
  // The mark of the memory a feeling grew from, as its cause carries it (feelingMark), or null.
  function markOf(sd) { const m = /\[(m\d+:[a-z0-9_]*)\]/.exec(String(sd && sd.cause || '')); return m ? m[1] : null; }
  /* A report come due (wave 27): each protector it goes to who can still
     hear it takes the report template's effects for whom they are (to:
     police for the police, family for anyone else; what it is about: the
     seed's why), {protector} and {protectorId} filled; through a tie the
     town does not know (origin.hidden), their memory is secondhand and
     hidden (the card will say only "Hasn't said why"). */
  /* Wave 28: the law outside town (origin.fallback: the county sheriff,
     who lives elsewhere) takes it as a memory on his record, with the
     town-news line. */
  function reportEffects(sd, n) {
    const o = sd.origin || {};
    for (const id of arr(o.protectors)) {
      const pr = State.npc(id);
      const away = !!pr && o.fallback === id && pr.alive !== false && pr.status !== 'dead';
      if (!isFree(pr) && !away) continue;
      if (away) applyEffects([{ op: 'addNews', text: fallbackNews(pr) }]);
      const to = Rel.isPoliceNpc(pr) || away ? 'police' : 'family';
      const tpl = GRUDGE_TEMPLATES.find(t => isObj(t) && t.kind === 'report' && t.to === to && (!Array.isArray(t.about) || t.about.includes(o.why))) || templateOf(sd);
      if (!tpl) continue;
      const fx = fillEffects(arr(tpl.effects), { npc: n, protectorId: pr.id }).map(e => (isObj(e) && e.op === 'socialEvent' && o.hidden === true ? Object.assign({}, e, { secondhand: { via: n.id, hidden: true } }) : e));
      if (fx.length) applyEffects(fx);
    }
    /* Wave 29: a holder who reports spends what they hold over the player:
       told to whom they went to (told_anyway; through a hidden tie, hidden
       too), the record spent. */
    const to = arr(o.protectors).filter(id => isFree(State.npc(id)));
    const held = to.length ? arr(st().leverage).filter(x => isObj(x) && x.holder === n.id && x.over === 'player' && Rel.LEV_LIVE.includes(x.status)) : [];
    for (const rec of held) applyEffects([{ op: 'leverageSet', id: rec.id, status: 'spent', knownBy: to, tell: true, hidden: o.hidden === true }]);
  }
  /* A seed marked danger (wave 27: someone in trouble the player can step
     in on) has fired: whoever it names after its first name (the one doing
     it) is in danger at its place for this phase, and the one doing it is
     noted with them (flags['danger.<npcId>'] = "day|phase|place|by|turn"),
     so a successful action aimed at them there, this phase or the next,
     rescues them (Pipeline: the player reads of it in the next narration
     and steps in on the turn after). danger: true reads the names from its
     words; an id or a list of ids names who is in danger. */
  function markDanger(sd, text) {
    const s = st();
    const words = String(text || sd.effect || '');
    const named = s.npcs.filter(x => isObj(x) && x.alive !== false && Town.nameMentions(words, x)).map(x => ({ id: x.id, at: words.indexOf(x.name.split(' ')[0]) })).sort((a, b) => a.at - b.at).map(x => x.id);
    const given = typeof sd.danger === 'string' ? [sd.danger] : Array.isArray(sd.danger) ? sd.danger.filter(x => typeof x === 'string') : null;
    const by = given ? named.find(id => !given.includes(id)) || null : named[0] || null;
    const victims = given || named.slice(1);
    // Where it happens: where the player is as it fires (a location trigger is met only there).
    const where = s.player.locationId;
    const fx = victims.filter(id => State.npc(id)).map(id => ({ op: 'setFlag', key: `danger.${id}`, value: `${s.time.day}|${s.time.phase}|${where}|${by || ''}|${s.meta.turn}` }));
    if (fx.length) applyEffects(fx);
  }
  function fire(sd, when) {
    const s = st();
    const dated = isObj(when) && Number.isInteger(when.day) ? { day: when.day, phase: when.phase } : {};
    const asNews = isObj(when) && when.news === true;
    const npcId = seedNpcId(sd);
    const n = npcId ? State.npc(npcId) : null;
    const live = !npcId || isFree(n);
    const kind = sd.origin && sd.origin.kind;
    const tpl = templateOf(sd);
    const met = live && conditionsMet(sd.requires);
    const alt = live && !met && isObj(sd.alt) ? sd.alt : null;
    // A report through a tie the town does not know (wave 27: Hollis to Wade) happens off-screen: no due event names it.
    const quietReport = kind === 'report' && sd.origin.hidden === true;
    const text = met ? (quietReport ? '' : sd.effect) : alt ? cleanText(alt.text, 400) : '';
    const r = State.apply({ seedsFired: [sd.id] }, W);
    if (r.rejected.some(x => x.path.startsWith('seedsFired'))) return false;
    // Its effects first, so the due event can name the obligation they made (dropped untold once that is met).
    let obligationId = null;
    if (met && kind === 'report') reportEffects(sd, n);
    else if (met || alt) {
      const own = met ? (Array.isArray(sd.effects) ? sd.effects : tpl && Array.isArray(tpl.effects) ? tpl.effects : []) : arr(alt.effects);
      // Told to the player as its due event: its own news is not told again overnight (wave 3, the playtest's "seed news told twice").
      const filled = own.length ? sinceDay(fillEffects(own, { npc: n }), dated.day).map(e => (isObj(e) && e.op === 'addNews' ? Object.assign({}, dated, e, text ? { seen: true } : {}) : e)) : [];
      if (filled.length) applyEffects(filled);
      const ob = filled.find(e => isObj(e) && e.op === 'addObligation');
      const made = ob ? obligations().filter(o => o.kind === ob.kind && o.npcId === ob.npcId && o.createdTurn === s.meta.turn).pop() : null;
      if (made) obligationId = made.id;
    }
    // A grudge or favour done in public is news (wave 5, the fourth review's risk): seen once its due event is narrated (dueNarrated, by this id), told overnight if that never comes.
    const publicNews = met && n && (kind === 'grudge' || kind === 'favour') && (sd.public === true || (tpl && tpl.public === true)) && !!text;
    if (text && !asNews) {
      const ev = { seedId: sd.id, text };
      if (Number.isInteger(dated.day)) ev.day = dated.day;
      const diff = { dueAdd: [ev] };
      if (n) ev.npcId = n.id;
      if (obligationId) ev.obligationId = obligationId;
      if (publicNews) ev.eventId = sd.id;
      // A loose end's NPC comes to the player, for that scene (its follow-up too: wave 5).
      if (n && (looseEndOf(sd.id) || (isObj(sd.origin) && sd.origin.kind === 'loose_end'))) { ev.bring = true; diff.visits = [{ npcId: n.id, locationId: s.player.locationId }]; }
      State.apply(diff, W);
    }
    // A seed marked danger (wave 27): the people it puts in danger are there to be helped this phase (Pipeline's rescued).
    if (met && sd.danger !== undefined && sd.danger !== false) markDanger(sd, text);
    // A meeting kept (wave 27): the player came, so it is a kept word.
    if (met && n && isObj(sd.appointment) && s.player.locationId === sd.appointment.locationId) {
      const l = State.loc(sd.appointment.locationId);
      applyEffects([{ op: 'socialEvent', npcId: n.id, event: 'kept_word', text: `met ${s.player.name} at ${placeIn(l)} the way we said`, weight: 2 }]);
    }
    if (met && n && (kind === 'grudge' || kind === 'favour')) {
      // Getting even (wave 27): the memory it grew from is softened (relSettle; a line that moves nothing keeps today's +10).
      if (kind === 'grudge') State.apply({ relSettle: Object.assign({ npcId: n.id, by: 'got_even' }, sd.origin.key ? { key: sd.origin.key } : {}, { mark: markOf(sd) }) }, W);
      // Told to the player as its due event too, so "Overnight in town" does not tell it again (wave 4, the third review's bug 4, playtest R3).
      if (publicNews) pushNews(text, Object.assign({ public: true, eventId: sd.id }, dated));
    }
    const why = !live ? `, a no-op: ${n ? `${n.id} is ${n.alive === false ? 'dead' : n.status}` : 'its NPC is missing'}` : met ? '' : alt ? ', its requirements did not hold: the alternative' : ', its requirements did not hold: a no-op';
    note(`${sd.id} fires (${sd.trigger.type} ${[].concat(sd.trigger.value).join('/')})${why}${asNews && text ? ', told as news' : ''}`, { kind: 'seed', seedId: sd.id });
    return asNews && text ? text : true;
  }
  function fireWhere(pred, ctx) {
    const s = st();
    if (!s) return [];
    const here = (ctx && ctx.locationId) || s.player.locationId;
    const presentIds = ctx && Array.isArray(ctx.presentNpcIds) ? ctx.presentNpcIds : State.npcsAt(here).map(n => n.id);
    const fired = [];
    for (const sd of s.seeds.slice()) {
      if (!pred(sd) || !ready(sd) || !triggerMet(sd, here, presentIds)) continue;
      if (fire(sd)) fired.push(sd);
    }
    return fired;
  }
  function fireSeeds(ctx) { return fireWhere(() => true, ctx); }
  /* The due events to narrate now: at most MAX_DUE (ctx.max: more for a
     narration of time passing, /rest, /wait, /skip, so what a string of
     nights brought is told on time). Each keeps its day (firedDay), its
     scene flag and its town event. ctx.phase and ctx.day: the phase a walk
     lands in, so whoever comes for the player meets them there and is
     still there once the walk's time has passed (wave 3). ctx.hold (wave
     11, M4: thrown out of the card game): { npcIds, locationId, coldNpcIds
     } keeps an event whose person is one of npcIds, or whose place is
     locationId (its trigger's place, or a scene there), due for a later
     turn; one whose person is in coldNpcIds waits too unless it is about
     an obligation (a dealer who will not deal to the player does not come
     to invite them to his game). */
  function dueSeeds(ctx) {
    const s = st();
    if (!s || !Array.isArray(s.dueEvents) || !s.dueEvents.length) return [];
    const here = (ctx && ctx.locationId) || s.player.locationId;
    // Where in the day the player meets them (wave 3): the phase a walk lands in (ctx.phase, ctx.day), else now.
    const phase = ctx && PHASES.includes(ctx.phase) ? ctx.phase : s.time.phase;
    const day = ctx && Number.isInteger(ctx.day) ? ctx.day : s.time.day;
    const later = phase !== s.time.phase || day !== s.time.day;
    /* ctx.then (wave 4, the third review's bug 5): the phase and day the
       turn's time runs into while the player stays (no walk, or a walk to a
       shut door): whoever comes for them is there now and still there then. */
    const then = ctx && isObj(ctx.then) && PHASES.includes(ctx.then.phase) && Number.isInteger(ctx.then.day) && (ctx.then.phase !== phase || ctx.then.day !== day) ? ctx.then : null;
    const cap = ctx && (ctx.max === Infinity || (Number.isInteger(ctx.max) && ctx.max > 0)) ? ctx.max : MAX_DUE;
    const hold = ctx && isObj(ctx.hold) ? ctx.hold : null;
    const held = (ev, sd) => !!hold && ((!!ev.npcId && arr(hold.npcIds).includes(ev.npcId))
      || (!!ev.npcId && !ev.obligationId && arr(hold.coldNpcIds).includes(ev.npcId))
      || (!!hold.locationId && ((ev.scene === true && hold.locationId === here) || (!!sd && isObj(sd.trigger) && sd.trigger.type === 'location' && anyOf(sd.trigger.value, v => v === hold.locationId)))));
    const cands = [];
    const drop = [];
    for (const ev of s.dueEvents.slice()) {
      const n = ev.npcId ? State.npc(ev.npcId) : null;
      if (ev.npcId && !isFree(n)) { drop.push(ev.seedId); continue; } // they can no longer act on it
      // About an obligation that has been met since (paid before the confrontation was told): nothing left to confront.
      if (ev.obligationId && obligations().some(o => o.id === ev.obligationId && o.status === 'met')) { drop.push(ev.seedId); continue; }
      // A place's event is told in that place: if the player has moved on, it waits for them to come back.
      const sd = State.seed(ev.seedId);
      // A meeting (wave 22) not told by the phase after its last one: its moment has gone.
      const ap = sd && isObj(sd.appointment) && arr(sd.appointment.phases).length ? sd.appointment : null;
      if (ap && apptKey(day, phase) > apptKey(ap.day, ap.phases[ap.phases.length - 1]) + 1) { drop.push(ev.seedId); continue; }
      // An appointment's place is its own (wave 22: a day trigger's meeting too).
      const at = sd && isObj(sd.appointment) ? sd.appointment.locationId : sd && isObj(sd.trigger) && sd.trigger.type === 'location' ? sd.trigger.value : null;
      if (at && (!anyOf(at, v => v === here) || (ctx && ctx.leaving))) continue;
      // Held for a later turn (ctx.hold): kept due, not told now.
      if (held(ev, sd)) continue;
      const item = { seedId: ev.seedId, text: ev.text, npcId: ev.npcId || null };
      if (Number.isInteger(ev.firedDay)) item.firedDay = ev.firedDay;
      if (ev.scene === true) item.scene = true;
      if (ev.eventId) item.eventId = ev.eventId;
      // A loose end's person comes to the player; so does the person a seed fired on meeting (an npc trigger: a background's hook), if they have moved on since.
      cands.push({ item, n, bring: !!n && !!(ev.bring || (sd && isObj(sd.trigger) && sd.trigger.type === 'npc')) });
    }
    // The scene first (a town event here), then someone come for the player, then the rest: the narration leads with what is in front of them.
    // Sorted before the cap (wave 3), so a scene behind three waiting events is told now, not a turn late.
    const rank = e => (e.scene ? 0 : e.npcId ? 1 : 2);
    const out = [];
    for (const c of cands.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.item) - rank(b.c.item) || a.i - b.i).map(x => x.c)) {
      if (out.length >= cap) break;
      // Brought for the phase the player meets them in (a walk's landing phase), so they are still there after the walk.
      if (c.bring) {
        const v = [];
        if (!State.npcsAt(here, phase, day).some(x => x.id === c.n.id)) v.push(Object.assign({ npcId: c.n.id, locationId: here }, later ? { day, phase } : {}));
        if (then && !State.npcsAt(here, then.phase, then.day).some(x => x.id === c.n.id)) v.push({ npcId: c.n.id, locationId: here, day: then.day, phase: then.phase });
        if (v.length) State.apply({ visits: v }, W);
      }
      out.push(c.item);
    }
    if (drop.length) {
      State.apply({ dueDone: drop }, W);
      drop.forEach(id => note(`${id} dropped: its NPC can no longer act on it, or what it was about is settled`, { kind: 'seed', seedId: id }));
    }
    return out;
  }
  /* The due events just narrated are done; a town event the player watched
     happen has its news seen (the morning does not tell it again).
     Returns { revealed: the ids of places it named that are now known }. */
  function dueNarrated(events) {
    const s = st();
    if (!s || !Array.isArray(events) || !events.length) return { revealed: [] };
    const ids = events.map(e => e && e.seedId).filter(id => (s.dueEvents || []).some(x => x.seedId === id));
    const evs = events.map(e => (isObj(e) && e.seedId && ids.includes(e.seedId) ? e.eventId || ((s.dueEvents || []).find(x => x.seedId === e.seedId) || {}).eventId : null)).filter(Boolean);
    if (ids.length) State.apply({ dueDone: ids }, W);
    for (const id of Array.from(new Set(evs))) State.apply({ newsSeen: { eventId: id } }, W);
    // A place the town has that the player has not found, named in what was just told (wave 4, playtest R4: "come by the Parsonage for supper"): now they know it.
    const revealed = [];
    for (const e of events) if (isObj(e) && typeof e.text === 'string') revealed.push(...revealNamedPlaces(e.text, e.npcId || null));
    return { revealed };
  }
  /* The places not found yet (in town) that a text names by name or other
     name ("the Parsonage", "the pastor's house"): found, as the cast's
     homes are when someone names them (placesRevealed by name). Returns
     the ids revealed. */
  function revealNamedPlaces(text, byNpcId) {
    const s = st();
    const t = String(text || '').toLowerCase().replace(/[’‘]/g, "'");
    if (!s || !t) return [];
    const near = State.loc(s.player.locationId);
    if (!near || !near.discovered) return [];
    const out = [];
    // Wave 5 (the fourth review's risk): its name, or another name of its own that says whose or which it is (a capital or a possessive: "the pastor's house", "the Haskins place"), held by no other place; never a plain one ("the apartment", "the white house").
    const bare = x => String(x || '').toLowerCase().replace(/[’]/g, "'").replace(/^the\s+/, '').trim();
    const held = new Map();
    for (const l of s.locations) for (const x of [l.name].concat(Array.isArray(l.aka) ? l.aka : [])) held.set(bare(x), (held.get(bare(x)) || 0) + 1);
    const own = x => /[A-Z]/.test(String(x).replace(/^the\s+/i, '')) || /'s\b|s'(?=\s|$)/.test(String(x).replace(/[’]/g, "'"));
    for (const l of s.locations) {
      if (l.discovered !== false || l.away === true) continue;
      const names = [l.name].concat((Array.isArray(l.aka) ? l.aka : []).filter(x => own(x) && held.get(bare(x)) === 1)).map(bare).filter(x => x.length >= 5);
      if (!names.some(x => new RegExp(`(^|[^a-z'])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(t))) continue;
      const r = State.apply({ placesRevealed: [{ name: l.name, description: l.description || l.name, nearId: near.id, byNpcId: byNpcId || undefined, kind: (s.npcs || []).some(n => isObj(n.home) && n.home.locationId === l.id) ? 'home' : 'other' }] }, W);
      if (!r.rejected.length && l.discovered) out.push(l.id);
    }
    if (out.length) note(`named in a due event, now known: ${out.join(', ')}`, { kind: 'seed' });
    return out;
  }

  // ----- fights (the pipeline decides when to call these) -----
  function isPublicPlace(l) { return !!l && l.away !== true && !PRIVATE_TYPES.includes(l.type); }
  /* Three hits on one person in a scene: they go down. Hurt for two days
     (State.apply npcFates hurt, when this build has it) and town news in a
     public place. Wave 27: what they remember is the engine's beat_down,
     which replaces the fight's memory (the fight's key, from state.fight),
     and the people watching each take one lighter copy for the scene
     (State's witness rows) in place of the old weight-3 memory; done in
     public (news, or two watching), it costs the town reputation the
     fight has not cost yet (the heaviest blow's, once: a beating's -5). A
     beat-down on someone tough is answered with violence (toughAnswer).
     Returns { text, npcId, hurt, witnesses, grudge } (text to narrate), or
     null. */
  function knockDown(npcId) {
    const s = st();
    const n = s ? State.npc(npcId) : null;
    if (!n) return null;
    const l = State.loc(s.player.locationId);
    const place = placeIn(l);
    const witnesses = State.npcsAt(s.player.locationId).map(x => x.id).filter(id => id !== n.id);
    const f = isObj(s.fight) && s.fight.npcId === n.id ? s.fight : null;
    const key = f && typeof f.key === 'string' ? f.key : `f${s.meta.turn}-${n.id.slice(4)}`;
    const cost = f && Number.isInteger(f.rep) ? f.rep : 0;
    let hurt = false;
    if (Array.isArray(State.RECORD_KEYS) && State.RECORD_KEYS.includes('npcFates')) {
      const r = State.apply({ npcFates: [{ npcId: n.id, status: 'hurt' }] }, { source: 'world', present: [n.id].concat(witnesses), rollSuccess: true, attacked: n.id });
      hurt = !r.rejected.length;
    }
    const pub = isPublicPlace(l);
    State.apply({ socialEvents: [{ npcId: n.id, event: 'beat_down', text: `knocked me down in a fight at ${place}`, act: 'attack', fight: key, witnesses, public: pub, rep: Math.min(0, Rel.EVENTS.beat_down.rep - cost) }] }, W);
    // Town talk, but the player was there: the morning's news does not tell them their own fight.
    if (pub) pushNews(`${s.player.name} knocked ${n.name} down in a fight at ${place}.`, { public: true, seen: true });
    const grudge = toughAnswer(n, s.time.day);
    // Wave 28: a beating of someone under 18 goes to their family and the law (once a fight).
    minorHarm(n.id, 'violence');
    note(`${n.id} knocked down${hurt ? ', hurt for two days' : ''}; ${witnesses.length} saw it${grudge ? `; a tough answer planted (${grudge.id})` : ''}`, { kind: 'fight', npcId: n.id });
    return { text: `${n.name} goes down hard and does not get back up.`, npcId: n.id, hurt, witnesses, grudge: grudge ? grudge.id : null };
  }
  /* A fight with the police there, or at the police station: the cells
     overnight. The player is moved to the police station, fined up to FINE
     (what they have), the chief remembers it (weight 3), and a due event
     there tells it. Time to the next morning is the pipeline's to pass
     (timeCost 'rest', so the world ticks through the night). Returns
     { text, seedId, locationId, fine, chiefId, timeCost }, or null. */
  /* A place's name inside a sentence: "the Low Water", not "The Low Water". */
  function placeIn(l) { return l ? String(l.name).replace(/^The /, 'the ') : 'town'; }
  /* What the police take off someone they lock up (World.arrestPlayer):
     a gun, a knife, ammunition or a club, as Town.weaponOf reads the name
     (wave 4, the third review's bug 6: the head of the name, so gun oil, a
     gun case, a knife sharpener, a butter knife and a water pistol stay,
     and a .38, a 12-gauge or a Glock go). */
  const TAKEN_KINDS = ['gun', 'knife', 'ammo', 'club'];
  function isWeapon(item) {
    const w = isObj(item) ? Town.weaponOf(item.name) : null;
    return !!w && TAKEN_KINDS.includes(w.kind);
  }
  /* "the .38 revolver", not "the a .38 revolver"; a maker keeps its capital ("the Glock"). */
  /* Wave 6 (the round-5 playtest's R4): a name's own capitals are kept
     when it is a name (a gun's maker: "the Smith & Wesson", "the Colt
     Python"; a later word capitalised), and only a plain word is lowered
     ("the folding knife"). */
  function theThing(name) {
    const n = String(name || '').replace(/^(?:a|an|the|some)\s+/i, '');
    const words = n.split(/\s+/);
    const proper = Style.NAME_ALLOW.has(words[0]) || Town.makerFirst(n) || words.slice(1).some(w => /^[A-Z][a-z]/.test(w));
    return `the ${proper ? n : lowerFirst(n)}`;
  }
  /* What an arrest would be, without doing it (the pipeline tells it in the
     narration of the fight that caused it): { text, cellId, chiefId, fine,
     weapons: the names of what will be taken }. */
  /* The police chief, else any free officer, else null. */
  function chiefOf(s) {
    const police = n => (n.tags || []).includes('police') || /\b(police|officer)\b/i.test(String(n.role || ''));
    return s.npcs.find(n => isFree(n) && police(n) && ((n.tags || []).includes('chief') || /\bchief\b/i.test(String(n.role || '')))) || s.npcs.find(n => isFree(n) && police(n)) || null;
  }
  /* Sleeping rough in a public place (wave 4, the playtest's design note:
     Town Hall or the church every night, and nobody minds). Called after a
     night's sleep with its quality. Wave 5 (playtest Q4 and its design
     note): the nights in a row slept rough at the same public place
     (flags.roughNights, roughAt, roughDay: the morning it ended); a bed, a
     night not slept (a /wait, the cell) or another place starts the count
     again. A place someone lives in is not public for this, unless the one
     who lives there is the police (Loretta's Low Water is hers; Town Hall
     is the chief's station). On the second night the chief finds the
     player there in the morning and tells them to move along (a due event
     that brings him, told in that narration, and a memory); a third night
     running there, or the next time he finds them so (flags.movedOn), costs
     a $25 fine, or what cash there is (the integration of wave 5: told to
     move along and still there, the count runs on, and every night more is
     fined). Returns the seed id, or
     null. */
  const ROUGH_NIGHTS = 2;
  const ROUGH_FINE = 25;
  const ROUGH_FORGIVEN = 7; // clear nights after which the chief's warning starts again (flags.movedOnDay)
  // Wave 47: the police by tag or role (isPoliceNpc, in the helpers; this copy read the tag only, which no cast member's answer depended on).
  function roughPublic(l) {
    return isPublicPlace(l) && !st().npcs.some(n => n.alive !== false && isObj(n.home) && n.home.locationId === l.id && !isPoliceNpc(n));
  }
  function sleptRough(quality) {
    const s = st();
    if (!s) return null;
    const l = State.loc(s.player.locationId);
    const fl = s.flags;
    const was = toInt(fl.roughNights) || 0;
    const here = quality === 'rough' && !!l && roughPublic(l);
    const runOn = here && was > 0 && fl.roughAt === l.id && toInt(fl.roughDay) === s.time.day - 1;
    const count = here ? (runOn ? was + 1 : 1) : 0;
    const chief = count >= ROUGH_NIGHTS ? chiefOf(s) : null;
    const fx = [];
    // The count runs on past the chief (integration, wave 5): told to move along and there again the next night, the player is fined.
    if (count !== was) fx.push({ op: 'setFlag', key: 'roughNights', value: count });
    if (here && fl.roughAt !== l.id) fx.push({ op: 'setFlag', key: 'roughAt', value: l.id });
    if (here && fl.roughDay !== s.time.day) fx.push({ op: 'setFlag', key: 'roughDay', value: s.time.day });
    if (fx.length) applyEffects(fx);
    if (!chief) return null;
    // Seven clear nights since he last found them (wave 6, the round-5 playtest's design note): he lets it go, and the next time is a warning again.
    const lastSeen = toInt(fl.movedOnDay);
    const clean = !!(toInt(fl.movedOn) && lastSeen !== null && s.time.day - lastSeen > ROUGH_FORGIVEN);
    const times = (clean ? 0 : toInt(fl.movedOn) || 0) + 1;
    const place = placeIn(l);
    const fine = times >= 2 ? Math.min(ROUGH_FINE, Math.max(0, s.player.gold | 0)) : 0;
    // Wave 6 (the round-5 playtest's R9): what he takes when it is short of the fine, said plainly.
    const paid = fine === ROUGH_FINE ? `writes you a ${money(ROUGH_FINE)} fine for sleeping in public and takes it` : fine ? `writes you a ${money(ROUGH_FINE)} fine for sleeping in public and takes what you have, ${money(fine)}` : `writes you a ${money(ROUGH_FINE)} fine for sleeping in public, but you have nothing to pay it with`;
    const nth = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][count];
    const nights = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven'][count] || 'night after night';
    const running = nth ? `for the ${nth} morning running` : 'yet another morning running';
    const pro = chief.pronouns === 'she' ? 'she' : chief.pronouns === 'they' ? 'they' : 'he';
    applyEffects([{ op: 'setFlag', key: 'movedOn', value: times }, { op: 'setFlag', key: 'movedOnDay', value: s.time.day }].concat(fine ? [{ op: 'playerGold', delta: -fine }] : [], [{ op: 'addMemory', npcId: chief.id, weight: times >= 2 ? 3 : 2, act: 'own',
      // The nights as they were (wave 6, the fifth review's risk): the first time he comes may be the third night running, when he was not about on the second.
      text: times < 2 ? `found ${s.player.name} sleeping rough at ${place} ${nights === 'night after night' ? nights : `${nights} nights running`} and told them to move along`
        : count > ROUGH_NIGHTS ? `found ${s.player.name} still sleeping rough at ${place}, ${nights === 'night after night' ? nights : `${nights} nights running`}, after telling them to find a real bed, and fined them`
          : `found ${s.player.name} sleeping rough at ${place} two nights running again and fined them` }]));
    note(`${chief.id} finds the player: ${count} nights running rough at ${l.id}${times >= 2 ? `, again: fined ${money(fine)}` : ''}`, { kind: 'rough' });
    const text = times < 2 ? `${chief.name} finds you asleep at ${place} ${running} and tells you to move along and find a real bed somewhere.`
      : count > ROUGH_NIGHTS ? `${chief.name} finds you asleep at ${place} ${running}, still there after ${pro} told you to find a real bed, and ${paid}.`
        : `${chief.name} finds you asleep at ${place} for the second morning running, ${paid}, and tells you to find a real bed.`;
    return dueNow({ key: `moved_on_d${s.time.day}`, text, npcId: chief.id, bring: true, locationId: l.id });
  }
  function arrestPlan() {
    const s = st();
    if (!s) return null;
    const cell = s.locations.find(l => l.type === 'police' && !l.closed) || s.locations.find(l => l.type === 'watch' && !l.closed) || State.loc('loc_town_hall');
    const chief = chiefOf(s);
    const from = State.loc(s.player.locationId);
    const place = placeIn(from);
    const fine = Math.min(FINE, Math.max(0, s.player.gold | 0));
    const who = chief ? chief.name : 'The police';
    const weapons = s.player.inventory.filter(isWeapon).map(i => i.name);
    const taken = weapons.length ? ` ${chief ? (chief.pronouns === 'she' ? 'She' : chief.pronouns === 'they' ? 'They' : 'He') : 'They'} take${chief && chief.pronouns !== 'they' ? 's' : ''} ${andList(weapons.map(theThing))} off ${s.player.name}.` : '';
    const text = `${who} puts ${s.player.name} in the holding cell${cell ? ` at ${placeIn(cell)}` : ''} for the night over the fight at ${place}${fine ? `, with a ${money(fine)} fine` : ''}.${taken}`;
    return { text, cellId: cell ? cell.id : null, chiefId: chief ? chief.id : null, fine, place, weapons };
  }
  /* opts.told: the narration of the fight already told the arrest (the
     pipeline's ARREST line), so no due event tells it again. */
  function arrestPlayer(opts) {
    const s = st();
    if (!s) return null;
    const plan = arrestPlan();
    const cell = plan.cellId ? State.loc(plan.cellId) : null;
    const chief = plan.chiefId ? State.npc(plan.chiefId) : null;
    const fine = plan.fine;
    const diff = {};
    if (cell && cell.id !== s.player.locationId) diff.playerLocationId = cell.id;
    if (fine > 0) diff.goldDelta = -fine;
    // Weapons go with the arrest (wave 3): taken off the player, and the chief remembers taking them.
    const weapons = s.player.inventory.filter(isWeapon);
    if (weapons.length) diff.itemsLost = weapons.map(i => ({ id: i.id, qty: i.qty || 1 }));
    // The player by name (wave 4, the review's bug 8): plainMemory makes it "you".
    const took = weapons.length ? `, and took ${andList(weapons.map(i => theThing(i.name)))} off ${s.player.name}` : '';
    // What he did to the player (wave 27: noted, own; it grows no grudge).
    if (chief) diff.newMemories = [{ npcId: chief.id, text: `locked ${s.player.name} up overnight for fighting at ${plan.place}${took}`, weight: 3, act: 'own', event: 'noted' }];
    // A night in the cell is no night slept rough (wave 5, the fourth review's risk, playtest Q4): the count starts again.
    if (toInt(s.flags.roughNights)) diff.effects = [{ op: 'setFlag', key: 'roughNights', value: 0 }];
    State.apply(diff, W);
    const text = plan.text;
    const seedId = opts && opts.told ? null : dueNow({ key: `arrest_d${s.time.day}`, text, npcId: chief ? chief.id : null, bring: !!chief, locationId: cell ? cell.id : null });
    note(`arrested: ${cell ? cell.id : 'no cell'}, fine ${fine}${opts && opts.told ? ' (told in the narration of the fight)' : ''}`, { kind: 'fight' });
    return { text, seedId, locationId: cell ? cell.id : null, fine, chiefId: chief ? chief.id : null, timeCost: 'rest' };
  }

  // ----- reputation -----
  function attitudes() {
    const o = {};
    if (st()) for (const n of st().npcs) o[n.id] = n.attitude;
    return o;
  }
  /* Wave 27: only the factions' part (members' liking changes / REP_DIVISOR,
     REP_CAP a turn). The town's standing moves on what was done in public
     (State's socialEvent: two or more saw it, or it made news). */
  function driftReputation(before) {
    const s = st();
    if (!s || !isObj(before)) return {};
    const sums = {};
    for (const n of s.npcs) {
      if (!n.knownToPlayer || !Object.prototype.hasOwnProperty.call(before, n.id)) continue;
      const d = n.attitude - before[n.id];
      if (!d) continue;
      if (n.factionId && State.faction(n.factionId)) sums[n.factionId] = (sums[n.factionId] || 0) + d;
    }
    const out = {};
    const effects = [];
    for (const k of Object.keys(sums)) {
      const d = clamp(Math.round(sums[k] / REP_DIVISOR), -REP_CAP, REP_CAP);
      if (d) { out[k] = d; effects.push({ op: 'reputationDelta', key: k, delta: d }); }
    }
    if (effects.length) applyEffects(effects);
    return out;
  }

  // ----- test and debug hooks -----
  function forceClockRoll(value, factionId) {
    const v = Number.isInteger(value) ? clamp(value, 1, 6) : null;
    if (typeof factionId === 'string') { if (v === null) delete hooks.clockRolls[factionId]; else hooks.clockRolls[factionId] = v; }
    else if (v === null) hooks.clockRolls = {};
    else hooks.clockRolls = { '*': v };
    return Object.assign({}, hooks.clockRolls);
  }
  /* A turn taken back (/undo, or a turn that failed) takes its world events
     out of the debug list too, so the list never shows what did not happen. */
  function forget(turn) {
    for (let i = recent.length - 1; i >= 0; i--) if (recent[i].turn > turn) recent.splice(i, 1);
    if (ahead && ahead.turn > turn) ahead = null;
  }
  function forceAttitude(npcId, value) {
    const n = State.npc(npcId);
    if (!n) return null;
    const v = clamp(toInt(value) || 0, -100, 100);
    if (v !== n.attitude) State.apply({ relSet: { npcId: n.id, w: v } }, W);
    return State.npc(npcId).attitude;
  }

  return {
    MAX_DUE, GRUDGE_AT, FAVOUR_AT, REP_DIVISOR, REP_CAP, HOME_RULES, FEELING_COOLDOWN, GOT_EVEN, DRIFT_PER_DAY, DRIFT_QUIET_DAYS, FINE, CLOCK_ODDS, hooks, recent,
    tick, fireSeeds, dueSeeds, dueNarrated, applyEffects, fillEffects, conditionsMet, clockProgress, fireEvents, catchUp, eventsOnArrival, eventsFired, arrestPlan,
    appointmentsHere, settleAppointments, appointmentVisits,
    knockDown, arrestPlayer, feelingMark, oddsOf, sleptRough, isPoliceNpc, ROUGH_NIGHTS, ROUGH_FINE, ROUGH_FORGIVEN, memoryKind, freshMemory, plantFeeling, townSeed, theThing,
    plantReports, plantReport, toughAnswer, markDanger,
    // Wave 28: the minor rule's and coercion's consequences; what a favour answers.
    minorHarm, minorAdvance, coercion, lawFor, helpMemory, HELP_EVENTS,
    // Wave 29: what people hold (the backed ask's answer, the holders' tell and price, favours owed both ways, the trust route).
    leverageAnswered, plantHolders, owedFavour, owedAsk, barLifted, betrayal, BETRAYALS, OWN_KINDS, plantFeelings,
    attitudes, driftReputation, homeFor, activeClock, seedStatus, whereIs, forget,
    forceClockRoll, forceAttitude
  };
})();

