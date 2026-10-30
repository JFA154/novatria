// ===== Module: World =====
/* The living world (SPEC.md section 8). It all runs in code, with no API
   call, and every write goes through State.apply (source 'world').

   tick(info) runs once for every phase that passes (Pipeline.passTime calls
   it from normal turns, /skip, /rest, /wait and defeat), in this order:
     a. Faction clocks. At the morning and evening ticks only (CLOCK_PHASES:
        two rolls a day, direction change 12; SPEC section 8 rolls at every
        phase change, which finished the town's plot in about two weeks with
        no help from the player), every faction with a running clock rolls a
        d6 through Rng; 5 or 6 fills one segment. A six-segment clock takes
        about nine days on average, a faction's three about 27. The player's
        lever is the bookkeeper's clockNudges (+/-1 a turn). Seeds with a
        clock trigger are checked right after the rolls (at every tick, since
        a nudge can fill a clock too), before a full clock hands over to the
        next.
     b. Clock complete (every tick). Its onComplete.effects run through
        applyEffects, the next clock in sequence starts (activeClock + 1, or
        -1 when none are left), and a quiet feed notice is posted only if the
        player could plausibly see it: an effect that changes a place or a
        person names the place they stand in or someone standing there with
        them. Then the journal gets the same text, "Around town: ..."
        (journalNews). Otherwise it happens off-screen. The content's own
        addRumour carries the news (content note 2); only a completion
        without one gets a rumour made from its text, so there is never a
        second one. Its knownBy starts with its source and the faction's
        free members (State.firstKnowers).
     c. Schedules. Who is where is npcIdsBySchedule for the new phase
        (State.npcsAt). Arrested NPCs sit in the police station in every
        phase and gone or dead ones are nowhere (State's npcStatus and npcMove
        keep that true). A visit (someone who came to the player) lasts for
        its phase only. A loose-end NPC with no schedule stays off-screen
        until their seed fires; at the next tick they get a home picked by
        role and tags (homeFor).
     d. Grudges and favours. A free NPC at attitude <= -60 with a memory of
        weight 3 plants one grudge seed from GRUDGE_TEMPLATES; one at >= 60
        with a memory of weight 2 or more (so a favour is earned by something
        the player did, never inherited from the town data) plants a favour
        seed from FAVOUR_TEMPLATES. Day trigger: today plus the template's
        dayOffset (2 to 5 days), with {npc} and {player} filled in, and the
        template's effects with "{npc}" as this NPC (direction change 16:
        the beating is a fight, which fire() hands its seed id so it waits
        for the telling; its reason is the memory behind it). At most
        one unfired grudge or favour seed per NPC: nothing is planted for an
        NPC while one is waiting.
     e. News spreads (each morning, in f). Every rumour the player has not
        heard yet moves one step through the town (spreadRumours): the people
        who share a scheduled place with someone who knows it (listed at the
        same place in the same phase, any phase of the day; npcIdsBySchedule,
        not today's visits) and do not know it yet each learn it on a 1 in 2
        roll (SPREAD_CHANCE), at most SPREAD_CAP (2) of them a rumour a
        morning; a gossip (isGossip: informant, bartender, innkeeper) learns
        everything anyone at their place knows, for certain and outside the
        cap. Only the free tell or learn: the dead, the far away and the
        arrested never do. A false rumour spreads like a true one. One step
        a morning: who learns today tells from tomorrow. A rumour the player
        has heard stops spreading, since nothing reads who knows it any more
        (Pipeline.pickRumour offers only unheard ones), which also keeps the
        dice for the rumours that matter. Pipeline.pickRumour offers one
        fresh unheard rumour to the next person the player talks to who knows
        it (wouldKnow reads knownBy).
     f. A new morning. Weather is rolled from TABLES.weather for the season
        (never the same as yesterday) into flags.weather, conditions that
        ran out (untilDay before today) are removed with a quiet line, and
        the rumours spread (e).

   Seeds and due events (state.dueEvents):
     fireSeeds(ctx), Pipeline step 11, fires every unfired seed whose trigger
     is met: day (today >= value), location (the player is there), npc (that
     NPC is with the player), clock ("fac_x:N": the running clock has N
     filled); never before notBeforeDay, nor before notBeforeTurn (the first
     loose end fires on day 1, after the player's second turn, so it is due
     on the third). A fired seed is marked fired and becomes a due event. A
     seed tied to an NPC (loose end, grudge, favour) whose NPC is no longer
     free fires as a no-op. A loose-end NPC whose seed fires comes to the
     player: a visit to where the player is. A seed that fires live then runs
     its effects (direction change 14) through applyEffects, right after the
     due event is queued, so the world matches its sentence: Chief Bell is at
     the landing that phase (visit), the tackle box is under the bridge
     (placeItem). An effect State.apply refuses goes to the debug log and
     never fails the turn; the no-op path runs none.
     dueSeeds(ctx), step 6, hands at most MAX_DUE (2) due events to the
     narration, oldest first, and keeps a loose-end NPC's visit wherever the
     player is now, and a seed's own visit effects for the phase it is told
     in (it is narrated as already true, perhaps after a night's rest); the
     rest wait. An event from a location trigger is only
     told in that location, and not in a turn that walks out of it
     (ctx.leaving): the seed fires after the narration that brought the
     player there, so if they walk on at once it waits for their return.
     dueNarrated(events) consumes them.

   Reputation. driftReputation(before) runs after the bookkeeper's diff: the
   attitude changes of every NPC the player knows are summed, divided by 5,
   rounded and clamped to +/-5 a turn, and move reputation.town; the same sum
   per faction moves that faction's entry. Clock effects move it with the
   reputationDelta op. State.reputationTier() gives the narrator one word.

   Test and debug hooks: forceClockRoll(value) forces the d6 of every
   faction and forceClockRoll(value, factionId) of one (that wins over the
   all-factions value); forceClockRoll(null) clears them all and
   forceClockRoll(null, factionId) just that one. forceAttitude(npcId,
   value) sets an attitude through State.apply; spreadRumours() runs one
   morning's spread on its own (it returns who learned what); recent lists
   the latest world events for the debug view (memory only, not saved), and
   forget(turn) drops those of turns taken back by /undo or a failed turn. */
const World = (() => {
  const MAX_DUE = 2;
  const GRUDGE_AT = -60;
  const FAVOUR_AT = 60;
  const REP_DIVISOR = 5;
  const REP_CAP = 5;
  const RECENT_MAX = 60;
  const CLOCK_PHASES = ['morning', 'evening']; // the ticks at which the clocks roll (a)
  const SPREAD_CAP = 2;    // new knowers a rumour gains a morning, gossips aside (e)
  const SPREAD_CHANCE = 2; // a 1 in SPREAD_CHANCE roll for each of them
  const W = { source: 'world' };
  const hooks = { clockRolls: {} }; // forced d6 per faction id, '*' for every faction
  const recent = [];
  let tickAt = null; // the phase a tick is for (State's clock has already moved on to the end of the turn's time)
  /* Effects that change a place or a person, the ones a bystander sees. */
  const SEEN_OPS = ['closeLocation', 'openLocation', 'npcStatus', 'npcMove', 'openThread', 'threadStatus'];
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
  function activeClock(f) {
    return f && Array.isArray(f.clocks) && Number.isInteger(f.activeClock) && f.activeClock >= 0 ? (f.clocks[f.activeClock] || null) : null;
  }
  function applyEffects(effects) { return State.apply({ effects: Array.isArray(effects) ? effects : [] }, W); }
  function isFree(n) { return !!n && n.alive !== false && n.status === 'free'; }
  function scheduled(npcId) {
    return st().locations.some(l => PHASES.some(p => ((l.npcIdsBySchedule || {})[p] || []).includes(npcId)));
  }
  function looseEndOf(seedId) { return (st().player.looseEnds || []).find(le => le.seedId === seedId) || null; }
  /* The NPC a seed is about: its origin, else the loose end that planted it. */
  function seedNpcId(sd) {
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

  // ----- a. faction clocks -----
  function rollD6(f) {
    const forced = Object.prototype.hasOwnProperty.call(hooks.clockRolls, f.id) ? hooks.clockRolls[f.id] : hooks.clockRolls['*'];
    return Number.isInteger(forced) ? forced : Rng.d(6);
  }
  function rollClocks() {
    const fills = [];
    for (const f of st().factions) {
      const c = activeClock(f);
      if (!c || c.filled >= c.segments) continue;
      const roll = rollD6(f);
      if (roll < 5) continue;
      fills.push({ factionId: f.id, delta: 1 });
      note(`${f.id} rolls ${roll}: "${c.label}" ${c.filled + 1}/${c.segments}`, { kind: 'clock', factionId: f.id });
    }
    if (fills.length) State.apply({ clockFill: fills }, W);
    return fills;
  }

  // ----- b. clock complete -----
  /* Could the player see it happen? Only effects that change a place or a
     person count, and only if they name the place the player stands in or
     someone standing there with them (presence taken before the effects). */
  function noticeable(effects, where) {
    const ids = new Set();
    for (const e of effects) {
      if (!isObj(e) || !SEEN_OPS.includes(e.op)) continue;
      if (e.locationId) ids.add(e.locationId);
      if (e.npcId) ids.add(e.npcId);
      const t = e.op === 'openThread' ? e.thread : e.op === 'threadStatus' ? State.thread(e.threadId) : null;
      if (isObj(t) && Array.isArray(t.linkedIds)) t.linkedIds.forEach(x => ids.add(x));
    }
    return ids.has(where.locationId) || where.presentIds.some(id => ids.has(id));
  }
  function fallbackRumour(f, idx, text) {
    const src = st().npcs.find(n => n.factionId === f.id && isFree(n)) || null;
    return { id: uniqueId(`rum_${f.id.slice(4)}_clock_${idx + 1}`, id => !!State.rumour(id)), text, true: true, sourceNpcId: src ? src.id : null, heard: false };
  }
  function completeClock(f, c, phase, events) {
    const s = st();
    const idx = f.activeClock;
    const oc = isObj(c.onComplete) ? c.onComplete : {};
    const text = cleanText(oc.text, 400);
    const effects = Array.isArray(oc.effects) ? oc.effects.slice() : [];
    if (text && !effects.some(e => isObj(e) && e.op === 'addRumour')) effects.push({ op: 'addRumour', rumour: fallbackRumour(f, idx, text) });
    // The faction's own people know the news of what it did.
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (isObj(e) && e.op === 'addRumour' && isObj(e.rumour) && !e.rumour.factionId) effects[i] = Object.assign({}, e, { rumour: Object.assign({}, e.rumour, { factionId: f.id }) });
    }
    const where = { locationId: s.player.locationId, presentIds: State.npcsAt(s.player.locationId, phase).map(n => n.id) };
    const res = applyEffects(effects);
    State.apply({ clockNext: [f.id] }, W);
    const seen = noticeable(effects, where);
    const next = activeClock(f);
    note(`${f.id} completes "${c.label}" ${seen ? 'where the player can see it' : 'off-screen'}${res.rejected.length ? ` (${res.rejected.length} effects rejected)` : ''}; ${next ? `next clock "${next.label}"` : 'no clocks left'}`, { kind: 'complete', factionId: f.id, clock: idx });
    const ev = { kind: 'clock', factionId: f.id, clock: idx, seen, rejected: res.rejected.length };
    if (seen && text) {
      ev.notice = text;
      // What the player saw happen goes in the journal too, dated with the day of this tick.
      State.apply({ journalNews: [{ text: `Around town: ${text}`, day: (tickAt || s.time).day }] }, W);
    }
    events.push(ev);
  }
  function completeClocks(phase, events) {
    for (const f of st().factions) {
      for (let guard = 0; guard < 8; guard++) {
        const c = activeClock(f);
        if (!c || c.filled < c.segments) break;
        completeClock(f, c, phase, events);
      }
    }
  }

  // ----- c. schedules -----
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

  // ----- d. grudges and favours -----
  function hasOpenFeeling(npcId) {
    return st().seeds.some(sd => !sd.fired && sd.origin && (sd.origin.kind === 'grudge' || sd.origin.kind === 'favour') && sd.origin.npcId === npcId);
  }
  function lastMemory(n, minWeight) {
    const ms = (n.memories || []).filter(m => m.weight >= minWeight);
    return ms.length ? ms[ms.length - 1] : null;
  }
  function plantFeeling(n, kind, memory, day) {
    const s = st();
    const list = kind === 'grudge' ? GRUDGE_TEMPLATES : FAVOUR_TEMPLATES;
    if (!Array.isArray(list) || !list.length) return null;
    // A template this NPC has not used yet, if there is one.
    const used = s.seeds.filter(sd => sd.origin && sd.origin.kind === kind && sd.origin.npcId === n.id).map(sd => sd.origin.template);
    let idxs = list.map((_, i) => i).filter(i => !used.includes(i));
    if (!idxs.length) idxs = list.map((_, i) => i);
    const i = Rng.pick(idxs);
    const t = list[i];
    const off = Array.isArray(t.dayOffset) && t.dayOffset.length ? t.dayOffset : [2, 5];
    const lo = clamp(toInt(off[0]) || 2, 1, 30);
    const hi = clamp(toInt(off.length > 1 ? off[1] : off[0]) || lo, lo, 30);
    const seed = {
      id: uniqueId(`seed_${kind}_${n.id.slice(4)}`, id => !!State.seed(id)),
      cause: `${kind === 'grudge' ? 'Grudge' : 'Favour'}: ${n.name} (attitude ${n.attitude}) remembers "${memory.text}"`,
      effect: fillTemplate(t.effect, { npc: n.name, player: s.player.name }),
      trigger: { type: 'day', value: day + Rng.int(lo, hi) },
      fired: false,
      hidden: true,
      origin: { kind, npcId: n.id, template: i }
    };
    // The template's effects (direction change 16: the beating is a fight), "{npc}" being this person; a fight says why.
    if (Array.isArray(t.effects) && t.effects.length) {
      seed.effects = t.effects.map(e => {
        const o = deepCopy(e);
        if (o.npcId === '{npc}') o.npcId = n.id;
        if (o.op === 'fight' && !o.reason) o.reason = `a ${kind}: "${cleanText(memory.text, 100)}"`;
        return o;
      });
    }
    const r = applyEffects([{ op: 'plantSeed', seed }]);
    if (r.rejected.length) return null;
    note(`${n.id} plants a ${kind} seed (${seed.id}, day ${seed.trigger.value})`, { kind, npcId: n.id, seedId: seed.id });
    return seed;
  }
  function plantFeelings(day) {
    const planted = [];
    for (const n of st().npcs.slice()) {
      if (!isFree(n) || hasOpenFeeling(n.id)) continue;
      let kind = null;
      let memory = null;
      if (n.attitude <= GRUDGE_AT) { memory = lastMemory(n, 3); kind = memory ? 'grudge' : null; }
      else if (n.attitude >= FAVOUR_AT) { memory = lastMemory(n, 2); kind = memory ? 'favour' : null; }
      if (!kind) continue;
      const sd = plantFeeling(n, kind, memory, day);
      if (sd) planted.push(sd);
    }
    return planted;
  }

  // ----- e. news spreads -----
  /* Someone who can pass news on or take it in: alive, free and in town. */
  function talks(n) { return isFree(n) && presenceOf(n) === 'here'; }
  /* The people listed together at a place in a phase (the schedules, any
     phase of the day), only those who talk, each group of two or more. */
  function gatherings() {
    const groups = [];
    for (const l of st().locations) {
      if (l.away === true) continue;
      for (const p of PHASES) {
        const ids = Array.from(new Set(((l.npcIdsBySchedule || {})[p] || []).filter(id => talks(State.npc(id)))));
        if (ids.length > 1) groups.push(ids);
      }
    }
    return groups;
  }
  /* One step of every unheard rumour (e): returns [{ rumourId, npcIds }]
     for the people who learned one, after applying them. Everyone is judged
     on who knew it at dawn, so news moves one gathering a morning. */
  function spreadRumours() {
    const s = st();
    const groups = gatherings();
    const spread = [];
    for (const r of s.rumours) {
      if (!isObj(r) || r.heard) continue;
      const knows = new Set(Array.isArray(r.knownBy) ? r.knownBy : r.sourceNpcId ? [r.sourceNpcId] : []);
      const sure = [];
      const maybe = [];
      for (const g of groups) {
        if (!g.some(id => knows.has(id))) continue;
        for (const id of g) {
          if (knows.has(id) || sure.includes(id) || maybe.includes(id)) continue;
          (isGossip(State.npc(id)) ? sure : maybe).push(id);
        }
      }
      if (!sure.length && !maybe.length) continue;
      let learned = maybe.filter(() => Rng.int(1, SPREAD_CHANCE) === 1);
      while (learned.length > SPREAD_CAP) learned.splice(Rng.int(0, learned.length - 1), 1);
      // Gossips first, then the rest, in the order the schedules list them.
      const ids = sure.concat(learned);
      if (ids.length) spread.push({ rumourId: r.id, npcIds: ids });
    }
    if (!spread.length) return [];
    const res = State.apply({ rumourSpread: spread }, W);
    note(`rumours spread: ${spread.map(x => `${x.rumourId} +${x.npcIds.length}`).join(', ')}${res.rejected.length ? ` (${res.rejected.length} rejected)` : ''}`, { kind: 'rumour' });
    return spread;
  }

  // ----- f. a new morning -----
  function newMorning(day, events) {
    const s = st();
    const season = SEASONS.includes(s.flags.season) ? s.flags.season : 'spring';
    const list = ((TABLES.weather && TABLES.weather[season]) || []).filter(w => w !== s.flags.weather);
    const w = Rng.pick(list);
    if (w) State.apply({ weather: w }, W);
    const ended = s.player.conditions.filter(c => Number.isInteger(c.untilDay) && c.untilDay < day);
    if (ended.length) {
      State.apply({ conditionsRemoved: ended.map(c => c.id) }, W);
      for (const c of ended) events.push({ kind: 'condition', notice: `Condition over: ${c.name}${c.effect ? ` (${c.effect})` : ''}.` });
    }
    spreadRumours();                                                    // e
  }

  function tick(info) {
    const s = st();
    const events = [];
    if (!s) return { phasesPassed: 0, events };
    const to = (info && info.to) || { day: s.time.day, phase: s.time.phase };
    tickAt = to;
    try {
      if (CLOCK_PHASES.includes(to.phase)) rollClocks();                // a: twice a day
      fireWhere(sd => isObj(sd.trigger) && sd.trigger.type === 'clock');  // a: clock seeds, before a full clock hands over
      completeClocks(to.phase, events);                                 // b
      settleHomes();                                                    // c
      plantFeelings(to.day);                                            // d
      if (to.phase === PHASES[0]) newMorning(to.day, events);           // f
    } finally { tickAt = null; }
    return { phasesPassed: (info && info.phasesPassed) || 1, events };
  }

  // ----- seeds and due events -----
  function triggerMet(sd, here, presentIds) {
    const tr = isObj(sd.trigger) ? sd.trigger : {};
    switch (tr.type) {
      case 'day': { const d = toInt(tr.value); return d !== null && st().time.day >= d; }
      case 'location': return here === tr.value;
      case 'npc': return presentIds.includes(tr.value);
      case 'clock': {
        const m = /^(fac_[a-z0-9_]+):(\d+)$/.exec(String(tr.value));
        const c = m ? activeClock(State.faction(m[1])) : null;
        return !!c && c.filled >= parseInt(m[2], 10);
      }
      default: return false;
    }
  }
  function ready(sd) {
    const s = st();
    if (sd.fired) return false;
    if (Number.isInteger(sd.notBeforeDay) && s.time.day < sd.notBeforeDay) return false;
    return !(Number.isInteger(sd.notBeforeTurn) && s.meta.turn < sd.notBeforeTurn);
  }
  function fire(sd) {
    const s = st();
    const npcId = seedNpcId(sd);
    const n = npcId ? State.npc(npcId) : null;
    const live = !npcId || isFree(n);
    const diff = { seedsFired: [sd.id] };
    if (live) {
      const ev = { seedId: sd.id, text: sd.effect };
      if (n) ev.npcId = n.id;
      // A loose end's NPC comes to the player, for that scene.
      if (n && looseEndOf(sd.id)) { ev.bring = true; diff.visits = [{ npcId: n.id, locationId: s.player.locationId }]; }
      diff.dueAdd = [ev];
    }
    const r = State.apply(diff, W);
    if (r.rejected.some(x => x.path.startsWith('seedsFired'))) return false;
    // What the seed changes in the town, once its event is queued (a no-op seed changes nothing).
    // A fight waits for the telling of this seed's event (direction change 16), so it carries the seed's id.
    const fx = live && Array.isArray(sd.effects) && sd.effects.length ? applyEffects(sd.effects.map(e => (isObj(e) && e.op === 'fight' ? Object.assign({}, e, { seedId: sd.id }) : e))) : null;
    const did = fx ? `; ${fx.applied.length} effect${fx.applied.length === 1 ? '' : 's'}${fx.rejected.length ? `, ${fx.rejected.length} rejected` : ''}` : '';
    note(`${sd.id} fires (${sd.trigger.type} ${sd.trigger.value})${live ? did : `, a no-op: ${n ? `${n.id} is ${n.alive === false ? 'dead' : n.status}` : 'its NPC is missing'}`}`, { kind: 'seed', seedId: sd.id });
    return true;
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
  function dueSeeds(ctx) {
    const s = st();
    if (!s || !Array.isArray(s.dueEvents) || !s.dueEvents.length) return [];
    const here = (ctx && ctx.locationId) || s.player.locationId;
    const out = [];
    const drop = [];
    for (const ev of s.dueEvents.slice()) {
      const n = ev.npcId ? State.npc(ev.npcId) : null;
      if (ev.npcId && !isFree(n)) { drop.push(ev.seedId); continue; } // they can no longer act on it
      // A place's event is told in that place: if the player has moved on, it waits for them to come back.
      const sd = State.seed(ev.seedId);
      if (sd && isObj(sd.trigger) && sd.trigger.type === 'location' && (sd.trigger.value !== here || (ctx && ctx.leaving))) continue;
      if (out.length >= MAX_DUE) continue;
      if (ev.bring && !State.npcsAt(here).some(x => x.id === n.id)) State.apply({ visits: [{ npcId: n.id, locationId: here }] }, W);
      // Its visits hold for the phase it is told in too (a /rest can pass between firing and telling): the narration says it is so.
      const stay = sd && Array.isArray(sd.effects) ? sd.effects.filter(e => isObj(e) && e.op === 'visit' && !State.npcsAt(e.locationId).some(x => x.id === e.npcId)) : [];
      if (stay.length) applyEffects(stay);
      out.push({ seedId: ev.seedId, text: ev.text, npcId: ev.npcId || null });
    }
    if (drop.length) {
      State.apply({ dueDone: drop }, W);
      drop.forEach(id => note(`${id} dropped: its NPC can no longer act on it`, { kind: 'seed', seedId: id }));
    }
    return out;
  }
  function dueNarrated(events) {
    const s = st();
    if (!s || !Array.isArray(events) || !events.length) return;
    const ids = events.map(e => e && e.seedId).filter(id => (s.dueEvents || []).some(x => x.seedId === id));
    if (ids.length) State.apply({ dueDone: ids }, W);
  }

  // ----- reputation -----
  function attitudes() {
    const o = {};
    if (st()) for (const n of st().npcs) o[n.id] = n.attitude;
    return o;
  }
  function driftReputation(before) {
    const s = st();
    if (!s || !isObj(before)) return {};
    const sums = {};
    for (const n of s.npcs) {
      if (!n.knownToPlayer || !Object.prototype.hasOwnProperty.call(before, n.id)) continue;
      const d = n.attitude - before[n.id];
      if (!d) continue;
      sums.town = (sums.town || 0) + d;
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
  function forget(turn) { for (let i = recent.length - 1; i >= 0; i--) if (recent[i].turn > turn) recent.splice(i, 1); }
  function forceAttitude(npcId, value) {
    const n = State.npc(npcId);
    if (!n) return null;
    const v = clamp(toInt(value) || 0, -100, 100);
    if (v !== n.attitude) applyEffects([{ op: 'attitudeDelta', npcId: n.id, delta: v - n.attitude }]);
    return State.npc(npcId).attitude;
  }

  return {
    MAX_DUE, GRUDGE_AT, FAVOUR_AT, REP_DIVISOR, REP_CAP, HOME_RULES, CLOCK_PHASES, SPREAD_CAP, SPREAD_CHANCE, hooks, recent,
    tick, fireSeeds, dueSeeds, dueNarrated, applyEffects, spreadRumours,
    attitudes, driftReputation, homeFor, activeClock, seedStatus, whereIs, forget,
    forceClockRoll, forceAttitude
  };
})();

