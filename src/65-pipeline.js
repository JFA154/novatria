// ===== Module: Pipeline =====
/* The turn loop of SPEC.md section 6. runTurn() does every step for normal
   input and for the commands that narrate (/look /zoom /skip /rest /wait)
   or parse (/fact):
     1 snapshot  2 commands (submit)  3 parse (then walkFirst: a walk and an
     action there moves the player before anything else)  4 check and create  5 resolve
     6 narrate (streamed)  7 style check, one regenerate  8 bookkeep
     9 apply (source 'model'), then reputation drift (World.driftReputation);
     a place someone named (placesRevealed) is credited to whoever the player
     was talking to and gets a quiet "Added to the map" line;
     arriveIfLeftBehind completes a plain move the bookkeeper left out
     10 advance time, World.tick per phase  11 World.fireSeeds (due events
     for the next narration)  12 compressIfDue (chronicle every 10 turns)
     13 log, autosave, render
   Any error or refusal restores the snapshot, takes the turn's lines back
   out of the feed and puts the player's text back in the box.
   Do / Say (the composer's toggle; speechFor): a Say turn carries
   ctx.speech = { mode: 'say', to, toName } and its input is the player's
   exact words. The parser hears MODE say, the action is forced social and
   aimed at the addressee (sayAction), nobody moves, the narrator gets
   PLAYER SAYS instead of ACTION, and the log entry keeps mode and addressee.
   A Do turn carries { mode: 'do' }.
   Work and trouble (direction change 16): a work action takes a job on
   offer here (takeWork, after the walk and before step 4; a job that
   cannot be taken now is refused with a plain line and nothing spent),
   rolls through resolve like any action, and is settled right after it
   (settleWork: the pay, the job's effects, the journal line, the
   cooldown); the narrator gets JOB and the bookkeeper the settled pay. At
   step 6, after the due events, a fight someone brings to the player is
   fought (comeAt: ATTACKED, the damage and defeat of a lost attack). */
const Pipeline = (() => {
  const NOTICES = {
    refused: 'The narrator declined that one. Try it another way.',
    noReroll: 'Nothing to reroll: the last turn had no dice roll.',
    // A roll repeated while the retry lock holds, failed or already done (Dice; resolve).
    locked: 'You already tried that here. Change something first: a different approach, something to use or offer, another place, or let time pass (/wait or /rest).',
    dead: 'Your story has ended. Load a saved game or start a new one.'
  };
  const CONSEQUENCES = {
    might: { name: 'Wrenched shoulder', effect: '-1 might' },
    wits: { name: 'Rattled', effect: '-1 wits' },
    charm: { name: 'Red-faced', effect: '-1 charm' },
    stealth: { name: 'Twisted ankle', effect: '-1 stealth' }
  };
  let busy = false;
  let lastTurn = null;
  let turnState = null; // the State.current a running turn or arrival started on
  /* Test and debug hook: force the next d20 (e.g. 20 for a critical). */
  const hooks = { nextD20: null, fightD20: null };

  // ----- small helpers -----
  function here() { return State.loc(State.current.player.locationId); }
  /* Someone the story named (peopleRevealed) whom the player has heard of by
     name but not met: People lists them under Heard of. */
  function heardOf(n) { return !!n && isObj(n.created) && n.created.by === 'story' && !n.unnamed && !n.knownToPlayer && n.alive !== false; }
  function who(n) { return `${n.id} — ${n.name} (${pronounLabel(n.pronouns)}; ${n.role})`; }
  /* Who someone is to whom, in words: "wife of Dewayne Mangum, employee of
     Royce Pittman" (what they are to others), and "wife: Mavis Mangum, boss:
     Royce Pittman" (who their people are), from State.tiesOf. */
  /* Family first (a household relation, then any other), then work and the rest, each kept in the order written. */
  function tieRank(x) { return HOUSEHOLD_RELATIONS.includes(x.relation) ? 0 : FAMILY_RELATIONS.includes(x.relation) ? 1 : 2; }
  function byRank(list) { return list.map((x, i) => ({ x, i })).sort((a, b) => tieRank(a.x) - tieRank(b.x) || a.i - b.i).map(o => o.x); }
  /* A name in someone's ties, marked so a late wife is never taken for a
     living one: "the late Ruth Haskins", "Dale Purvis [lives elsewhere]". */
  function tieName(n) { const p = presenceOf(n); return p === 'dead' ? `the late ${n.name}` : p === 'away' ? `${n.name} [lives elsewhere]` : n.name; }
  function tieWords(n) {
    return byRank(State.tiesOf(n).isTo).slice(0, 4).map(x => `${x.relation || 'related'} of ${tieName(State.npc(x.id))}`).join(', ');
  }
  function hasWords(n) {
    return byRank(State.tiesOf(n).has).slice(0, 5).map(x => `${x.relation || 'related'}: ${tieName(State.npc(x.id))}`).join(', ');
  }
  /* Where the town's schedule has someone and where they live: "usually at
     the Riverview Motor Court (evening, night); home: the Mangum House
     (morning, afternoon)". A cast member's schedule is read from the town
     data (so it does not move with a visit or a clock), anyone else's from
     the game. */
  function usualPlaces(n, s) {
    const t = State.town;
    const fromTown = t && Array.isArray(t.locations) && Array.isArray(t.npcs) && t.npcs.some(x => x.id === n.id);
    const locs = fromTown ? t.locations : s.locations;
    const at = {};
    for (const l of locs) for (const p of PHASES) if (((l.npcIdsBySchedule || {})[p] || []).includes(n.id)) (at[l.id] = at[l.id] || []).push(p);
    const homeId = n.home && n.home.locationId ? n.home.locationId : null;
    const name = id => { const l = State.loc(id) || locs.find(x => x.id === id); return l ? String(l.name).replace(/^The /, 'the ') : id; };
    const out = [];
    const when = id => (at[id].length === PHASES.length ? 'all day and night' : at[id].join(', '));
    const away = Object.keys(at).filter(id => id !== homeId).sort((a, b) => PHASES.indexOf(at[a][0]) - PHASES.indexOf(at[b][0])).map(id => `${name(id)} (${when(id)})`);
    if (away.length) out.push(`usually at ${away.join(', ')}`);
    if (homeId) out.push(`home: ${name(homeId)}${at[homeId] ? ` (${when(homeId)})` : ''}`);
    return out.join('; ');
  }
  /* The narrator's second cached system block (Api.narrate sends it after
     the style block): everyone who exists in this town, one line each
     ("id — Name (pronouns; role; wife of X; usually at Z; home: W)"), the
     rule that nobody else does, and the people the story may talk about who
     are never in town (TOWN_DATA.offstage). Built from the records alone,
     never from anything that changes turn to turn, so it stays
     byte-identical, and stays cached, until the cast itself changes (an
     edit, a merge, an arrest or a death). */
  const CAST_HEAD = 'CAST (everyone who exists in this town; never invent anyone else):';
  const CAST_RULE = 'Anyone a character mentions (a wife, a husband, a brother, a boss, a friend, a neighbor, a customer) is one of the people above or does not exist: never make up a relative, a worker or a stranger, and never give someone a family the list does not show. People not in PRESENT can be talked about, but they never appear in the scene unless the packet lists them.';
  const ABSENT_HEAD = 'NOT IN TOWN (they can be talked about, but they never appear): the dead and the people who live elsewhere, one a line. Nobody here sees them; anyone may mention them, the way people talk about the dead and the far away.';
  /* "Mavis Mangum (41, she/her" without the closing: the name, then the age and pronouns. */
  function nameHead(n) { const a = ageText(n.age); return `${n.name}${n.unnamed ? ' (no name yet)' : ''} (${a ? `${a}, ` : ''}${pronounLabel(n.pronouns)}`; }
  function castBlock(st) {
    const s = st || State.current;
    if (!s) return '';
    const lines = [CAST_HEAD];
    const absent = [];
    for (const n of s.npcs) {
      if (presenceOf(n) !== 'here') { absent.push(n); continue; }
      const parts = [n.role || 'townsfolk'];
      const ties = tieWords(n);
      if (ties) parts.push(ties);
      const where = usualPlaces(n, s);
      if (where) parts.push(where);
      if (n.status === 'arrested') parts.push('under arrest, in the cell at the police station');
      lines.push(`${n.id} — ${nameHead(n)}; ${parts.join('; ')})${n.history ? ` History: ${n.history}` : ''}`);
    }
    lines.push(CAST_RULE);
    // The dead and the far away, from their own records; an older game's offstage names that are not records yet, after them.
    const t = State.town && Array.isArray(State.town.offstage) ? State.town : null;
    const off = t ? t.offstage.filter(o => isObj(o) && o.name && !s.npcs.some(n => State.samePerson(n.name, o.name))) : [];
    if (absent.length || off.length) {
      lines.push(ABSENT_HEAD);
      for (const n of absent) {
        const parts = [n.role || 'townsfolk'];
        const ties = tieWords(n);
        if (ties) parts.push(ties);
        if (presenceOf(n) === 'dead') parts.push(n.died ? `dead: ${n.died}` : 'dead');
        else {
          parts.push(n.where ? `lives elsewhere: ${n.where}` : 'gone from town');
          if (n.reach) parts.push(`reached by: ${n.reach}`);
        }
        lines.push(`${n.id} — ${nameHead(n)}; ${parts.join('; ')})${n.history ? ` History: ${n.history}` : ''}`);
      }
      for (const o of off) lines.push(`${o.name}: ${o.about}.`);
    }
    return lines.join('\n');
  }
  /* The narrator's town block, a cached system block between the style
     block and the cast (Api.narrate): the town's history and recent events,
     how each place came to be and when it is open, and the places out of
     town, which are talked about and never gone to. Built from the game's
     own copy of the town (else the built-in town of the same name) and its
     places, never from anything that changes turn to turn, so it stays
     byte-identical and cached. '' for a town with no history. */
  const TOWN_HEAD = 'THE TOWN (background everyone here knows; let it show in what people say and notice, never as a history lesson):';
  function townBlock(st) {
    const s = st || State.current;
    if (!s) return '';
    const t = State.town && typeof State.town.history === 'string' ? State.town : s.meta.townName === TOWN_DATA.name ? TOWN_DATA : null;
    if (!t || typeof t.history !== 'string' || !t.history) return '';
    const lines = [TOWN_HEAD, `HISTORY: ${t.history}`];
    const recent = Array.isArray(t.recent) ? t.recent.filter(r => isObj(r) && r.when && r.what) : [];
    if (recent.length) lines.push(`RECENT (oldest first${Number.isInteger(t.year) ? `; it is ${t.year} now` : ''}): ${recent.map(r => `${r.when}: ${r.what}`).join(' ')}`);
    const places = s.locations.filter(l => l.away !== true && (l.history || l.hours));
    // Hours that say nothing ("A private home", "Always open") are left out.
    const hours = h => (h && !/^(a private home|always open)\.?$/i.test(String(h).trim()) ? `Open: ${h}.` : '');
    if (places.length) lines.push(`PLACES (how each came to be; when it is open): ${places.map(l => `${l.id} — ${l.name}: ${[l.history, hours(l.hours)].filter(Boolean).join(' ')}`).join(' | ')}`);
    const away = s.locations.filter(l => l.away === true);
    if (away.length) lines.push(`OUT OF TOWN (talked about, never a scene; the story stays in ${s.meta.townName || 'town'}): ${away.map(l => `${l.id} — ${l.name} (${l.distance || 'out of town'}): ${l.history || sentenceOne(l.description)}`).join(' | ')}`);
    return lines.join('\n');
  }
  /* The parser's and the bookkeeper's cached system blocks: Api.parse and
     Api.bookkeep send each after the role's prompt, with one cache
     breakpoint, so the lists that do not change turn to turn are read from
     the cache and the user message carries only what does (who is here and
     whom the player knows, with attitudes; the places they know; items;
     threads). Like castBlock, built from the records alone, never from who
     the player has met, where anyone is now, attitudes or what has been
     discovered, so each stays byte-identical, and cached, until the cast
     itself changes (an edit, a merge, a death, someone leaving town).
     parserBlock: everyone in town (id, name, pronouns, role, ties), the dead
     and the people who live elsewhere, and the places out of town.
     bookkeeperBlock: everyone in town (id, name, pronouns, role) and the
     factions. '' with no game. */
  const PARSER_CAST_HEAD = 'EVERYONE IN TOWN (the whole cast, one a line; nobody else exists. NPCS PRESENT and OTHER KNOWN NPCS in the message say who is here and whom the player knows):';
  const BOOK_CAST_HEAD = 'EVERYONE IN TOWN (the whole cast, one a line: ids you may use; nobody else exists. Who is here and whom the player knows, with attitudes, is in the message):';
  function parserBlock(st) {
    const s = st || State.current;
    if (!s) return '';
    const town = s.npcs.filter(n => presenceOf(n) === 'here');
    const absent = s.npcs.filter(n => presenceOf(n) !== 'here');
    const away = s.locations.filter(x => x.away === true);
    return [PARSER_CAST_HEAD]
      .concat(town.map(n => { const ties = tieWords(n); return `${n.id} — ${n.name} (${pronounLabel(n.pronouns)}; ${n.role}${ties ? `; ${ties}` : ''})`; }))
      .concat([
        `NOT IN TOWN (dead, or living elsewhere; talked about, never met): ${absent.map(n => `${n.id} — ${n.name} (${presenceOf(n) === 'dead' ? 'dead' : 'lives elsewhere'}; ${n.role})`).join('; ') || 'none'}`,
        `OUT OF TOWN (never a destination; the story stays here): ${away.map(x => `${x.id} — ${x.name}${x.type ? ` (${x.type})` : ''}`).join('; ') || 'none'}`
      ]).join('\n');
  }
  function bookkeeperBlock(st) {
    const s = st || State.current;
    if (!s) return '';
    const town = s.npcs.filter(n => presenceOf(n) === 'here');
    return [BOOK_CAST_HEAD]
      .concat(town.map(n => `${who(n)}${n.unnamed ? ' (no name yet)' : ''}`))
      .concat([`FACTIONS: ${s.factions.map(f => `${f.id} — ${f.name}`).join('; ') || 'none'}`]).join('\n');
  }
  function sentenceOne(text) { const m = /^.*?[.!?](?=\s|$)/.exec(String(text || '')); return m ? m[0] : String(text || ''); }
  function isRefusal(x) { return Api.isRefusal(x); }
  function nowTime() { const t = State.current.time; return { day: t.day, phase: t.phase }; }
  function sameTime(a, b) { return a.day === b.day && a.phase === b.phase; }
  function phaseSteps(target) {
    const cur = PHASES.indexOf(State.current.time.phase);
    const want = PHASES.indexOf(target);
    return (want - cur + PHASES.length) % PHASES.length;
  }
  function phaseWord(text) {
    const m = /\b(morning|afternoon|evening|night|dawn|noon|midday|dusk|midnight|tonight)\b/i.exec(String(text || ''));
    if (!m) return null;
    const w = m[1].toLowerCase();
    return { dawn: 'morning', noon: 'afternoon', midday: 'afternoon', dusk: 'evening', midnight: 'night', tonight: 'night' }[w] || w;
  }
  /* Time passes: State.apply advances the clock, then World.tick runs once
     for every phase that went by, in order (SPEC section 8). A short held at
     night (night holds until the player sleeps: State advanceTime) passes
     no phase, so nothing ticks. */
  function passTime(cost, cause) {
    const s0 = State.current;
    const here = s0 ? s0.player.locationId : null;
    const wasHere = here ? State.npcsAt(here).map(n => n.id) : [];
    const t = State.apply({ advanceTime: cost }).time;
    if (!t || !t.phasesPassed) return t || null;
    let cur = { day: t.from.day, phase: t.from.phase };
    for (let i = 0; i < t.phasesPassed; i++) {
      const idx = PHASES.indexOf(cur.phase);
      const next = idx === PHASES.length - 1 ? { day: cur.day + 1, phase: PHASES[0] } : { day: cur.day, phase: PHASES[idx + 1] };
      const res = World.tick({ from: cur, to: next, phasesPassed: 1, step: i + 1, of: t.phasesPassed, cause: cause || 'turn' });
      for (const ev of (res && Array.isArray(res.events) ? res.events : [])) if (ev && typeof ev.notice === 'string') UI.feed.quiet(ev.notice);
      cur = next;
    }
    // Who came and went where the player stands: the next narration shows it happening.
    if (here && State.current === s0) {
      const nowHere = State.npcsAt(here).map(n => n.id);
      const arrived = nowHere.filter(id => !wasHere.includes(id));
      const left = wasHere.filter(id => !nowHere.includes(id));
      if (arrived.length || left.length) State.apply({ sceneChange: { locationId: here, arrived, left, cause: cause || 'turn' } });
    }
    return t;
  }
  function firstPerson(text, name) {
    return String(text || '')
      .replace(/\bI am\b/g, `${name} is`).replace(/\bI'm\b/g, `${name} is`).replace(/\bI've\b/g, `${name} has`)
      .replace(/\bI\b/g, name).replace(/\bme\b/gi, name).replace(/\bmy\b/gi, `${name}'s`).replace(/\bmine\b/gi, `${name}'s`);
  }
  function labelFor(desc) {
    const head = Town.headPhrase(desc, 'npc') || cleanText(desc, 60);
    return /^\s*my\b/i.test(desc) ? `${head} of yours` : head;
  }

  // ----- what the player carries -----
  /* The owner, 29 Oct 2026: "I stabbed someone successfully but I didn't
     have a knife in my inventory." The narrator now hears what the player
     carries (CARRYING, every turn), the parser names a thing the action
     needs that the player does not have (missingItem), and when nothing
     carried or lying here answers to it, the narrator and the bookkeeper
     are told it is NOT CARRIED: the turn goes on, the roll stands for what
     can be done without it (an attack is bare-handed), and nothing happens
     that needs it. No refusal and no extra call. */
  const ITEM_KINDS = { knife: ['knife', 'blade', 'switchblade', 'pocketknife', 'machete', 'razor'], gun: ['gun', 'pistol', 'rifle', 'shotgun', 'revolver', 'handgun'], car: ['car', 'truck', 'pickup', 'van'], key: ['key'] };
  const ITEM_STOP = new Set(['the', 'some', 'my', 'and', 'for', 'with', 'pair', 'set', 'old', 'new', 'little', 'big', 'one']);
  function itemWords(text) { return String(text || '').toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !ITEM_STOP.has(w)).map(w => (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w)); }
  /* Does an item's name answer to a thing: "Folding knife" is a knife, "Car keys" a car, "Socket set" not a gun. */
  function carriedAs(name, thing) {
    const have = itemWords(name);
    const want = itemWords(thing);
    return want.flatMap(w => ITEM_KINDS[w] || [w]).some(k => have.includes(k));
  }
  /* The parser's missingItem, unless the player carries something that answers to it (then it is usesItemId) or it lies here. */
  function missingThing(ctx) {
    const a = ctx.action;
    if (!a || !a.missingItem) return null;
    const s = State.current;
    const held = s.player.inventory.find(i => i.qty > 0 && carriedAs(i.name, a.missingItem));
    if (held) { if (!a.usesItemId) a.usesItemId = held.id; return null; }
    if ((here().items || []).some(i => carriedAs(i.name, a.missingItem))) return null;
    State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'missingItem', item: a.missingItem, reason: `the player has no ${a.missingItem}: the narrator and the bookkeeper were told it is not carried` });
    return { name: a.missingItem };
  }
  const CANNOT = [[/\b(knife|blade|switchblade|pocketknife|machete|razor)\b/i, 'they cannot stab or cut anyone'], [/\b(gun|pistol|rifle|shotgun|revolver|handgun)\b/i, 'they cannot shoot anyone'], [/\b(car|truck|pickup|van)\b/i, 'they cannot drive anywhere, and if they go somewhere they go on foot'], [/\bkeys?\b/i, 'they cannot unlock anything with one']];
  function notCarriedLine(m) {
    const cant = (CANNOT.find(([re]) => re.test(m.name)) || [null, 'nothing they do this turn can use one'])[1];
    return `NOT CARRIED: ${article(m.name)} ${m.name}. The player has no ${m.name} and nothing like one; ${cant}. Narrate what they can do without it (bare hands, bluff, or realising they have nothing), and nothing happens that needs it.`;
  }
  /* "CARRYING: Folding knife, Dog tags; cash $140 (nothing else: ...)", every turn. */
  function carryingLine(p) {
    const things = p.inventory.filter(i => i.qty > 0).map(i => i.name + (i.qty > 1 ? ` x${i.qty}` : ''));
    return `CARRYING: ${things.join(', ') || 'nothing'}; ${moneyLine(p.gold)} (nothing else: no weapon, tool, phone, keys, car or money beyond this).`;
  }

  // ----- step 3: parse -----
  function normaliseParse(raw) {
    const r = isObj(raw) ? raw : {};
    const out = {
      actionType: ACTION_TYPES.includes(r.actionType) ? r.actionType : 'other',
      summary: cleanText(r.summary, 200),
      targets: strArr(r.targets, 120),
      destinationId: typeof r.destinationId === 'string' && r.destinationId ? r.destinationId : null,
      needsRoll: r.needsRoll === true,
      stat: STATS.includes(r.stat) ? r.stat : null,
      difficulty: DIFFICULTIES.includes(r.difficulty) ? r.difficulty : null,
      usesItemId: typeof r.usesItemId === 'string' && r.usesItemId ? r.usesItemId : null,
      missingItem: typeof r.missingItem === 'string' && cleanText(r.missingItem, 60) ? cleanText(r.missingItem, 60).replace(/^(a|an|the|some|my)\s+/i, '') : null,
      timeCost: TIME_COSTS.includes(r.timeCost) ? r.timeCost : 'instant',
      declaresWorldFact: r.declaresWorldFact === true
    };
    if (out.destinationId && /^new:/i.test(out.destinationId)) {
      if (!out.targets.includes(out.destinationId)) out.targets.push(out.destinationId);
      out.destinationId = null;
    }
    return out;
  }
  /* Structured packet for the parser (the mock reads the fields, the real
     parser reads `text`, a labelled plain-text version of what changes
     turn to turn, after `block`, the cached parserBlock with the whole
     cast, the dead and the far away, and the places out of town). */
  function parsePacket(input, opts) {
    const s = State.current;
    const p = s.player;
    const l = State.loc(p.locationId);
    const mode = opts && opts.mode === 'fact' ? 'fact' : 'action';
    const sp = mode === 'fact' ? null : isSay(opts && opts.speech) ? opts.speech : { mode: 'do' };
    const packet = {
      input,
      mode,
      speech: sp ? Object.assign({}, sp) : null,
      playerName: p.name,
      location: { id: l.id, name: l.name, type: l.type },
      // Only the ways out the player knows: a home nobody has told them about is not one.
      exits: l.exits.map(id => State.loc(id)).filter(x => x && x.discovered).map(x => ({ id: x.id, name: x.name, type: x.type, closed: !!x.closed })),
      present: State.npcsAt(l.id).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role, look: n.look, attitude: n.attitude })),
      itemsHere: (l.items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      inventory: p.inventory.map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      // People the player knows, and people the story named whom they have only heard of.
      knownNpcs: s.npcs.filter(n => (n.knownToPlayer || heardOf(n)) && n.alive !== false).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role, heard: heardOf(n) })),
      knownLocations: s.locations.filter(x => x.discovered).map(x => ({ id: x.id, name: x.name, type: x.type, closed: !!x.closed })),
      // Paid work that can be asked for here and now (direction change 16): the giver is here and it is the right time.
      jobs: mode === 'fact' ? [] : Town.jobsOnOffer(l.id).map(j => ({ id: j.id, label: j.label, giverNpcId: j.giverNpcId, giverName: (State.npc(j.giverNpcId) || {}).name || '', pay: j.pay.slice(), stake: !!j.stake }))
    };
    // Everyone else who exists (the cast is fixed): a person the player names or describes is one of these ids.
    // These three lists are for the mock parser; the real parser reads them in the cached block (parserBlock).
    const listed = new Set(packet.present.map(n => n.id).concat(packet.knownNpcs.map(n => n.id)));
    packet.cast = s.npcs.filter(n => n.alive !== false && n.status !== 'gone' && !listed.has(n.id)).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role, ties: tieWords(n) }));
    // The dead and the people who live elsewhere: a person the player names may be one of them (talked about, never met).
    packet.absent = s.npcs.filter(n => presenceOf(n) !== 'here' && !listed.has(n.id)).map(n => ({ id: n.id, name: n.name, role: n.role, presence: presenceOf(n) }));
    // Places out of town: never a destination (the engine refuses one), but the player may name them.
    packet.away = s.locations.filter(x => x.away === true).map(x => ({ id: x.id, name: x.name, type: x.type }));
    const ids = arr => arr.map(x => `${x.id} — ${x.name}${x.role ? ` (${x.role})` : ''}${x.type ? ` (${x.type})` : ''}${x.closed ? ' (closed)' : ''}${x.qty > 1 ? ` x${x.qty}` : ''}`).join('; ') || 'none';
    const presentIds = packet.present.map(n => n.id);
    let modeLine;
    if (mode === 'fact') modeLine = 'MODE: fact. The player is spending a story point to make this statement true in the world. Put the ids of existing people, places and things it refers to in targets, and new:<short description> for anyone or anything it adds. Set declaresWorldFact to true, needsRoll to false and timeCost to instant.';
    else if (isSay(sp)) {
      const all = sp.to === 'everyone';
      modeLine = `MODE: say, to ${all ? 'everyone present' : `${sp.to} (${sp.toName})`}. The input is the player's exact spoken words, said aloud to ${all ? 'everyone here' : sp.toName}; nothing else was done. actionType must be talk, persuade, deceive or intimidate${packet.jobs.length ? ', or work when the words take or ask for the WORK ON OFFER HERE' : ''}: choose by what the words do, and decide the roll as usual. targets must include ${all ? `every NPC present (${presentIds.join(', ') || 'nobody is here'})` : sp.to}. destinationId must be null. A person mentioned in the words is one of the listed ids; never use new: for a person.`;
    } else modeLine = 'MODE: do. The input is what the player does; any speech inside it is incidental to the action.';
    packet.text = [
      isSay(sp) ? `PLAYER INPUT: "${input}"` : `PLAYER INPUT: ${input}`,
      modeLine,
      `TIME: day ${s.time.day}, ${s.time.phase} (${State.phasePart(s.time)})`,
      `PLAYER: ${p.name} (${ageText(p.age) ? `${p.age}; ` : ''}${p.background}); ${STATS.map(k => `${k} ${fmtMod(p.stats[k])}`).join(', ')}; ${moneyLine(p.gold)}; hp ${p.hp}/${p.maxHp}`,
      `LOCATION: ${l.id} — ${l.name} (${l.type})`,
      // Looks let "the big man with the pens" resolve to the person who matches, not to new:<description>.
      `NPCS PRESENT: ${packet.present.map(n => `${n.id} — ${n.name} (${pronounLabel(n.pronouns)}; ${n.role}; attitude to the player ${n.attitude | 0} on -100..100)${n.look ? `: ${n.look}` : ""}`).join("; ") || "none"}`,
      `ITEMS HERE: ${ids(packet.itemsHere)}`,
      `INVENTORY: ${ids(packet.inventory)}`,
      `OTHER KNOWN NPCS (not here): ${packet.knownNpcs.filter(n => !presentIds.includes(n.id)).map(n => `${who(n)}${n.heard ? ' (heard of, not met)' : ''}`).join('; ') || 'none'}`,
      // Every discovered place, by type too ("the bar"): one move reaches any of them.
      `OTHER PLACES IN TOWN (one move reaches any): ${ids(packet.knownLocations.filter(x => x.id !== l.id))}`
    ].concat(packet.jobs.length ? [`WORK ON OFFER HERE: ${packet.jobs.map(workLine).join('; ')}`] : []).join('\n');
    // Everyone else in town, the dead and the far away, and the places out of town: the cached block, not the message.
    packet.block = parserBlock();
    return packet;
  }

  /* One job on offer, for the parser: "job_service_bays — a shift in the
     service bays at Pittman's (for Dewayne Mangum; pays about $60-80; takes
     the rest of the phase)". A stake is won or lost at the table. */
  function workLine(j) {
    const pay = `${money(j.pay[0])}-${j.pay[1]}`;
    return `${j.id} — ${j.label} (${j.stake ? `with ${j.giverName}; win or lose about ${pay}` : `for ${j.giverName}; pays about ${pay}`}; takes the rest of the phase)`;
  }

  // ----- step 3b: a walk, then an action there -----
  /* "I head to the bar and ask the bartender...": a parsed action that is
     not itself a move but names a destination. The engine walks the player
     there first (no roll; the turn costs at least a short), so step 4 and
     everything after it run at the destination: who is present, what gets
     created, the roll, the narration (MOVED line) and the bookkeeping. A
     plain move keeps its own path (narrated as the walk, with the
     DESTINATION line). A closed destination turns the action into a walk to
     the closed door (no roll, and nothing new is made). Returns ctx.moved,
     or null. */
  function walkFirst(ctx) {
    const a = ctx.action;
    const from = here();
    const to = a.destinationId ? State.loc(a.destinationId) : null;
    if (a.actionType === 'move' || !to || to.id === from.id) return null;
    if (to.closed) {
      // Nothing behind the shut door is looked for or made out here.
      Object.assign(a, { actionType: 'move', needsRoll: false, stat: null, difficulty: null, targets: a.targets.filter(t => State.entityById(t)) });
      return null;
    }
    if (State.apply({ playerLocationId: to.id }).rejected.length || State.current.player.locationId !== to.id) return null;
    if (a.timeCost === 'instant') a.timeCost = 'short';
    ctx.moved = { fromId: from.id, fromName: from.name, toId: to.id, toName: to.name };
    return ctx.moved;
  }

  // ----- step 3c: Say mode -----
  /* The player only spoke. Whatever the parser made of it, the action is
     talk, persuade, deceive or intimidate, aimed at whoever was spoken to
     (everyone present for "Everyone"), it goes nowhere and it takes a short
     at most. What was changed is logged as a rejected model field. */
  const SAY_TYPES = ['talk', 'persuade', 'deceive', 'intimidate'];
  function sayAction(a, sp) {
    const s = State.current;
    const presentIds = State.npcsAt(s.player.locationId).map(n => n.id);
    const fixed = [];
    // Words that take the work on offer here ("Deal me in") stay work (direction change 16): the job sets its own time.
    const work = a.actionType === 'work';
    if (!SAY_TYPES.includes(a.actionType) && !work) { fixed.push(`actionType ${a.actionType} became talk`); a.actionType = 'talk'; }
    if (a.destinationId) { fixed.push(`destinationId ${a.destinationId} dropped`); a.destinationId = null; }
    if (!work && (a.timeCost === 'long' || a.timeCost === 'rest')) { fixed.push(`timeCost ${a.timeCost} became short`); a.timeCost = 'short'; }
    const want = sp.to === 'everyone' ? presentIds : presentIds.filter(id => id === sp.to);
    const missing = want.filter(id => !a.targets.includes(id));
    if (missing.length) fixed.push(`added the addressee ${missing.join(', ')}`);
    a.targets = want.concat(a.targets.filter(t => !want.includes(t)));
    if (fixed.length) State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'model', path: 'parse', reason: `say mode: ${fixed.join('; ')}` });
    return a;
  }

  /* Do mode: running off with no place named ("I run away from Royce") that
     the parser left without a destination goes out through the first open
     exit, so the state follows the narration (the narrator then gets the
     DESTINATION line). Only for a move, and only when the words say running
     or fleeing. Returns the exit id, or null. */
  const FLEEING = /\b(run|runs|running|ran|flee|flees|fleeing|fled|bolt|bolts|escape|escapes|get out of here)\b/i;
  function fleeExit(ctx) {
    const a = ctx.action;
    if (a.actionType !== 'move' || a.destinationId || !ctx.speech || ctx.speech.mode !== 'do' || !FLEEING.test(ctx.input || '')) return null;
    const exit = here().exits.map(id => State.loc(id)).find(l => l && l.discovered && !l.closed);
    if (!exit) return null;
    a.destinationId = exit.id;
    State.debugLog.push({ turn: State.current.meta.turn, kind: 'rejected', source: 'engine', path: 'destinationId', reason: `a move with no place named: the engine sends the player out through ${exit.id}` });
    return exit.id;
  }

  /* After bookkeeping, a plain move the bookkeeper did not carry out (it
     left playerLocationId out, or set it back to the origin) is applied by
     the engine, so arriving never depends on the model. Not when the place
     is closed, a roll for the move failed, or the player is down; and a
     bookkeeper that put the player somewhere else is respected. */
  function arriveIfLeftBehind(ctx) {
    const s = State.current;
    const a = ctx.action;
    const d = a.actionType === 'move' && a.destinationId ? State.loc(a.destinationId) : null;
    if (!d || d.closed || d.id === ctx.location.id || s.player.locationId !== ctx.location.id) return false;
    if ((ctx.roll && !ctx.roll.success) || s.player.hp <= 0 || s.player.dead) return false;
    if (State.apply({ playerLocationId: d.id }).rejected.length) return false;
    State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'playerLocationId', reason: `the bookkeeper left the player at ${ctx.location.id} after a move; the engine moved them to ${d.id}` });
    return true;
  }

  // ----- step 4: check and create -----
  /* For every `new:` target: reuse an entity that already answers to the
     description (Town.matchExisting: a name, a role, "Dewayne's wife" read
     through the cast's relations, a one-word job); otherwise a place or a
     thing is created if it is plausible here (a back room, a coil of rope)
     and marked does_not_exist if not (a dragon). A person is never created:
     the whole cast is written in TOWN_DATA (rules version 6), so someone
     who is not one of them is NOT PRESENT with reason does_not_exist
     ("nobody like that lives in this town"), for every game, an older one
     not yet updated too. A claimed world fact without a story point
     creates nothing. Existing NPC targets who are not in the scene are
     flagged "not here", except someone the story named in an older game who
     has no schedule and is asked for where they live or work: they come to
     the door (a visit for this phase). Created entities are saved through
     State.apply before the narrator hears about them. */
  async function createEntity(kind, desc, opts) {
    const l = here();
    if (kind === 'npc') throw new Error('the cast is fixed: a person is never created in play');
    if (kind === 'location') {
      const head = Town.headPhrase(desc, 'location') || 'side room';
      const loc = Tables.location({ name: capFirst(head), type: Town.placeType(head), fromId: opts.fromId || l.id });
      const r = State.apply({ addLocations: [loc] });
      if (r.rejected.length) throw new Error(`could not create ${head}: ${r.rejected[0].reason}`);
      return { kind, id: loc.id, name: loc.name, label: head };
    }
    const head = Town.headPhrase(desc, 'item') || 'thing';
    const name = capFirst(head);
    const id = 'item_' + slugify(name);
    const g = Town.goodsFor(head);
    const price = g ? Tables.price(g.name) : null;
    if (opts.fact) State.apply({ itemsGained: [{ id, name, qty: 1, notes: 'yours, by a story point' }] });
    else State.apply({ addItems: [{ locationId: l.id, item: { id, name, qty: 1, notes: '', price } }] });
    return { kind: 'item', id, name, label: head, carried: !!opts.fact };
  }
  /* Someone the story named who is nowhere right now (no schedule, or not
     this phase) and is asked for at the place they live or work. */
  function comesToDoor(n, l) {
    if (!isObj(n.created) || n.created.by !== 'story' || n.status !== 'free' || l.closed || World.whereIs(n.id)) return false;
    const rel = n.created.relationToNpcId ? State.npc(n.created.relationToNpcId) : null;
    return (n.home && n.home.locationId === l.id) || n.created.locationId === l.id || (!!rel && HOUSEHOLD_RELATIONS.includes(n.created.relation) && State.homeOf(rel) === l);
  }
  async function checkAndCreate(action, opts) {
    opts = opts || {};
    const s = State.current;
    const l = here();
    const presentIds = State.npcsAt(l.id).map(n => n.id);
    const out = { targets: [], created: [], notPresent: [], links: [] };
    const unproven = action.declaresWorldFact && !opts.fact;
    const keep = id => { if (!out.targets.includes(id)) out.targets.push(id); };
    const existing = (id, ref) => {
      const e = State.entityById(id);
      if (!e) { out.notPresent.push({ ref, label: labelFor(ref), reason: 'does_not_exist' }); return; }
      if (id.startsWith('npc_')) {
        if (e.alive === false || e.status === 'dead' || e.status === 'gone') { out.notPresent.push({ ref, id, label: e.name, reason: 'gone', why: absentNote(e) }); return; }
        if (!presentIds.includes(id) && !opts.fact) {
          if (comesToDoor(e, l) && !State.apply({ visits: [{ npcId: id, locationId: l.id }] }).rejected.length) presentIds.push(id);
          else out.notPresent.push({ ref, id, label: e.name, reason: 'not_here' });
        }
      }
      if (opts.fact && /^(npc|loc)_/.test(id)) out.links.push({ kind: id.startsWith('npc_') ? 'npc' : 'location', id, name: e.name });
      keep(id);
    };
    const linkedLoc = action.targets.find(t => t.startsWith('loc_') && State.loc(t));
    for (const raw of action.targets) {
      let desc;
      if (/^new:/i.test(raw)) desc = cleanText(raw.slice(4), 200);
      else if (State.entityById(raw)) { existing(raw, raw); continue; }
      else {
        // An id the model made up ("npc_dragon") is treated as new:dragon.
        const m = /^(?:npc|loc|item)_([a-z0-9_]+)$/.exec(raw);
        if (!m) { out.notPresent.push({ ref: raw, label: cleanText(raw, 60), reason: 'does_not_exist' }); continue; }
        desc = m[1].replace(/_/g, ' ');
      }
      const match = Town.matchExisting(desc, { locationId: l.id });
      if (match) { existing(match.id, raw); continue; }
      if (unproven) { out.notPresent.push({ ref: raw, label: labelFor(desc), reason: 'unproven' }); continue; }
      const verdict = Town.plausible(desc, l.type);
      if (!verdict.plausible) { out.notPresent.push({ ref: raw, label: labelFor(desc), reason: 'does_not_exist', why: verdict.reason }); continue; }
      // Everyone who exists is in the cast: a person nobody in it answers to is simply not there.
      if (verdict.kind === 'npc') { out.notPresent.push({ ref: raw, label: labelFor(desc), reason: 'does_not_exist', person: true, why: 'nobody like that lives in this town' }); continue; }
      const made = await createEntity(verdict.kind, desc, { fact: !!opts.fact, homeId: linkedLoc, fromId: linkedLoc, input: opts.input });
      if (State.current !== s) throw Object.assign(new Error('another game was loaded'), { replaced: true });
      if (made.existing) { existing(made.existing, raw); continue; }
      out.created.push(made);
      keep(made.id);
    }
    action.targets = out.targets;
    // Destination: a real location, or a place this turn created.
    if (action.destinationId && !State.loc(action.destinationId)) action.destinationId = null;
    if (action.actionType === 'move' && !action.destinationId) {
      const made = out.created.find(c => c.kind === 'location') || null;
      const known = out.targets.find(t => t.startsWith('loc_') && t !== l.id);
      action.destinationId = made ? made.id : known || null;
    }
    if (action.destinationId === l.id) action.destinationId = null;
    if (action.usesItemId && !s.player.inventory.some(i => i.id === action.usesItemId)) action.usesItemId = null;
    return out;
  }

  // ----- step 5: resolve -----
  function lastingConsequence(ctx) {
    const s = State.current;
    const p = s.player;
    const a = ctx.action;
    const witness = a.targets.map(id => State.npc(id)).find(n => n && ctx.presentIds.includes(n.id));
    if (witness && Dice.SOCIAL_ACTIONS.includes(a.actionType)) {
      State.apply({ newMemories: [{ npcId: witness.id, text: `Watched ${p.name} fail badly: ${lowerFirst(a.summary)}`, weight: 2 }] });
      return `${witness.name} will remember this`;
    }
    const c = CONSEQUENCES[ctx.roll.stat] || CONSEQUENCES.wits;
    State.apply({ conditionsAdded: [{ name: c.name, effect: c.effect, untilDay: s.time.day + 2 }] });
    return `lasting consequence: ${lowerFirst(c.name)} (${c.effect} until day ${s.time.day + 2})`;
  }
  /* Cheat support: the die that gives a wanted outcome for this roll, found
     by probing the roll's numbers (no dice are drawn by the probe). */
  const TIER_ALIASES = { success: 'success', succeed: 'success', win: 'success', pass: 'success', partial: 'partial', fail: 'failure', failure: 'failure', lose: 'failure', crit: 'critical', critical: 'critical', nat20: 'critical', fumble: 'critical_failure', botch: 'critical_failure', nat1: 'critical_failure' };
  function dieFor(want, rollOpts) {
    if (Number.isInteger(want)) return clamp(want, 1, 20);
    const tier = TIER_ALIASES[String(want).toLowerCase()] || 'success';
    if (tier === 'critical') return 20;
    if (tier === 'critical_failure') return 1;
    const probe = Dice.resolve(Object.assign({}, rollOpts, { d20: 10, complication: 'none' }));
    const base = probe.target - probe.statValue - probe.modifier; // the die that exactly meets the target
    const pick = d => clamp(d, 2, 19);
    let d = tier === 'success' ? pick(base) : tier === 'partial' ? pick(base - 2) : pick(base - 5);
    const tierOf = x => Dice.tier(x, x + probe.statValue + probe.modifier, probe.target);
    if (tier === 'success' && !Dice.isSuccess(tierOf(d))) d = 20;
    if (tier === 'failure' && tierOf(d) !== 'failure') d = tierOf(2) === 'failure' ? 2 : 1;
    if (tier === 'partial' && tierOf(d) !== 'partial') { for (let x = 19; x >= 2; x--) if (tierOf(x) === 'partial') { d = x; break; } }
    return d;
  }
  /* Who said yes to a granted ask, by name: the one person spoken to in Say
     mode, else the only person here the ask was aimed at; else null. */
  function agreedBy(ctx, people) {
    const sp = ctx.speech;
    if (isSay(sp) && sp.to !== 'everyone') return sp.toName || (State.npc(sp.to) || {}).name || null;
    const here = people.filter(n => (ctx.presentIds || []).includes(n.id));
    return here.length === 1 ? here[0].name : null;
  }
  /* The retry lock (SPEC section 7; see Dice). Returns { locked: true } when
     the roll may not be made again and nobody in the scene answers it: a
     failed roll repeated while its key holds, or something already done
     (granted) done again. In conversation (Say, or a social action) the
     scene answers instead, with no roll: a failed ask pushed again gets
     ctx.pressed (the person holds their ground), a granted ask asked again
     gets ctx.granted (it is settled, and nothing more is gained). A clearly
     different ask after a granted one rolls, and the lock records it. An
     action without a roll leaves the lock alone here: runTurn lifts it once
     the situation has changed. /reroll and /cheat (ctx.reroll) bypass it. */
  function resolve(ctx) {
    const s = State.current;
    const a = ctx.action;
    if (!a.needsRoll) return {};
    const key = Dice.lockKey(a);
    const people = a.targets.map(id => State.npc(id)).filter(Boolean);
    // What was asked for: the typed words (a command's own name left off), less the names of the people it is aimed at.
    const words = Dice.askWords(String(ctx.input || '').replace(/^\/\S+\s*/, ''), people.map(n => n.name));
    if (!ctx.reroll) {
      const social = isSay(ctx.speech) || Dice.SOCIAL_ACTIONS.includes(a.actionType);
      const granted = Dice.grantedAsk(key, words);
      if (granted) {
        if (!social) return { locked: true };
        ctx.granted = { key, line: granted.line, name: agreedBy(ctx, people) };
        return {};
      }
      if (Dice.lockedOutcome(key) === 'failed') {
        // Pushing the same point in conversation again: no new roll (the dice
        // are not re-rolled), but the scene still answers, so the player sees
        // the person hold their ground instead of a system notice.
        if (social) {
          const rec = Dice.lockState();
          const last = s.log.slice().reverse().find(e => e.roll && /fail/i.test(String(e.roll.tier || e.roll.line || '')));
          ctx.pressed = { key, line: (rec && rec.line) || (last && last.roll && last.roll.line ? last.roll.line : null) };
          return {};
        }
        return { locked: true };
      }
    }
    const npcTarget = a.targets.find(t => ctx.presentIds.includes(t));
    // After /undo or /reroll the restored state would hand back the very
    // same die; a salt kept outside the save shifts the draw instead.
    let forced = Number.isInteger(hooks.nextD20) ? hooks.nextD20 : (hooks.diceSalt ? ((Rng.d(20) - 1 + hooks.diceSalt * 7) % 20) + 1 : undefined);
    hooks.nextD20 = null;
    if (hooks.nextTier) { forced = dieFor(hooks.nextTier, { stat: a.stat || 'wits', difficulty: a.difficulty || 'normal', usesItemId: a.usesItemId, npcId: npcTarget, actionType: a.actionType }); hooks.nextTier = null; }
    const roll = Dice.resolve({ stat: a.stat || 'wits', difficulty: a.difficulty || 'normal', usesItemId: a.usesItemId, npcId: npcTarget, actionType: a.actionType, d20: forced });
    ctx.roll = roll;
    // Every outcome locks; the record says how it went and keeps this scene's granted asks.
    State.apply({ lastRollKey: Dice.lockFor(roll, key), lastRoll: Dice.lockRecord(roll, key, words, s.meta.lastRoll) });
    UI.feed.roll(roll);
    if (roll.tier === 'critical' && s.player.storyPoints < State.LIMITS.storyPoints) {
      State.apply({ storyPointsDelta: 1 });
      ctx.storyPoint = true;
      UI.feed.quiet(`Natural 20: you earn a story point (${s.player.storyPoints} of ${State.LIMITS.storyPoints}).`);
    }
    // Fights (SPEC section 7): 1 to 3 damage on a failure, 3 on a critical failure.
    if (a.actionType === 'attack' && (roll.tier === 'failure' || roll.tier === 'critical_failure')) {
      const dmg = roll.tier === 'critical_failure' ? 3 : Rng.int(1, 3);
      State.apply({ hpDelta: -dmg });
      ctx.damage = dmg;
      ctx.defeated = s.player.hp <= 0;
      UI.feed.quiet(`You take ${dmg} damage (HP ${s.player.hp}/${s.player.maxHp}).`);
    }
    if (roll.tier === 'critical_failure') ctx.consequence = lastingConsequence(ctx);
    return {};
  }

  /* The memories that matter: every serious one (newest w3), the newest notable
     ones (w2), and a small one only if recent; oldest first, capped. Shared by
     the narrator packet and the People cards. A loose end's own line
     (Town.looseEndMemory, weight 3) is one of them, so the creditor knows
     about the debt from day 1. */
  function pickMemories(list, turn, o) {
    const ms = Array.isArray(list) ? list : [];
    const keep = new Set([].concat(
      ms.filter(m => m.weight >= 3).slice(-o.w3),
      ms.filter(m => m.weight === 2).slice(-o.w2),
      ms.filter(m => m.weight <= 1 && turn - m.turn <= o.recent).slice(-o.w1)));
    return ms.filter(m => keep.has(m)).slice(-o.cap);
  }

  // ----- introductions -----
  /* The arrival has no bookkeeper, and on normal turns the bookkeeper can miss
     an introduction. If the narration uses a present person's name in the
     player's hearing, the player knows it now: the packet tells the narrator
     who is still a stranger, so a name in the text means it was given. */
  /* The dead and the people who live elsewhere are never met, so the
     player knows of them when the story names them: their full name or
     their first name, as written, in the narration. People lists them
     under Elsewhere or Gone from then on. */
  function noteMentioned(narration) {
    const s = State.current;
    if (!s || typeof narration !== 'string' || !narration) return [];
    const ids = s.npcs.filter(n => !n.knownToPlayer && presenceOf(n) !== 'here' && !n.unnamed && [n.name, String(n.name || '').split(/\s+/)[0]].some(w => w && w.length >= 3 && new RegExp('(^|[^A-Za-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z])').test(narration))).map(n => n.id);
    if (ids.length) State.apply({ npcKnownToPlayer: ids });
    return ids;
  }
  function noteIntroductions(narration, locationId) {
    const s = State.current;
    if (!s || typeof narration !== 'string' || !narration) return [];
    const ids = [];
    for (const n of State.npcsAt(locationId || s.player.locationId)) {
      if (n.knownToPlayer || n.alive === false || n.unnamed) continue;
      // A surname that is also part of a place name ('Pittman's Gas and Service') proves nothing on its own.
      const placeNames = s.locations.map(x => String(x.name || '').toLowerCase());
      const names = String(n.name || '').trim().split(/\s+/).filter((w, i) => w.length >= 3 && (i === 0 || !placeNames.some(pn => pn.includes(w.toLowerCase())))).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!names.length) continue;
      if (new RegExp('(^|[^A-Za-z])(?:' + names.join('|') + ')(?![A-Za-z])').test(narration)) ids.push(n.id);
    }
    if (ids.length) State.apply({ npcKnownToPlayer: ids });
    return ids;
  }

  // ----- step 6: the narrator's packet -----
  /* SPEC section 13: only memories of weight 2 or more or from the last 20
     turns (the newest three of those). brief (people at a destination, not
     yet in the scene) leaves memories out altogether. */
  /* Pronouns come right after the name ("Mavis Toler (she/her; ...)"), so
     the narration and the People card always agree. Someone in the scene
     also carries their traits, what they want and their secret (direction
     change 10: the narrator cannot write an evasion, a lie or a slip for a
     secret it does not know), under the packet's one WANTS AND SECRETS rule;
     a brief line (someone at a destination, not in the scene yet) never
     does, and nor does the cached cast block, so nobody's secret reaches the
     narrator unless they are standing in front of the player. */
  function npcLine(n, turn, brief) {
    const mems = brief ? [] : pickMemories(n.memories || [], turn, { w3: 3, w2: 2, w1: 1, recent: 10, cap: 5 }).map(m => m.text);
    const age = ageText(n.age);
    const parts = [(age ? `${age}, ` : '') + pronounLabel(n.pronouns), n.role];
    const rel = State.relationNote(n);
    if (rel) parts.push(rel);
    // Their people, by name ("wife: Mavis Mangum"), so nobody gets a family the cast does not give them.
    const has = hasWords(n);
    if (has) parts.push(has);
    if (!n.knownToPlayer && n.look) parts.push('look: ' + lowerFirst(n.look).replace(/\.$/, ''));
    if (heardOf(n)) parts.push('not met yet: the player has heard of them by this name from others, but has never met them');
    else if (!n.knownToPlayer) parts.push('not yet introduced: the player does not know this name; go by the look until they give it');
    const traits = brief ? [] : strArr(n.personality, 30);
    if (traits.length) parts.push('traits: ' + traits.join(', '));
    if (n.voice) parts.push('voice (a habit, not every line): ' + lowerFirst(n.voice).replace(/\.$/, ''));
    parts.push('attitude ' + n.attitude);
    if (!brief && n.goal) parts.push('wants: ' + noStop(n.goal));
    if (!brief && n.secret) parts.push('secret: ' + noStop(n.secret));
    if (mems.length) parts.push('remembers: ' + mems.join(' / '));
    return `${n.name} (${parts.join('; ')})`;
  }
  function noStop(t) { return cleanText(t, 400).replace(/[.]+$/, ''); }
  /* The player's own words as one sentence: a full stop unless they end in ? or !. */
  function asSentence(t) { const b = noStop(t); return /[!?]$/.test(b) ? b : `${b}.`; }
  /* The packet's one rule for the wants and secrets in PRESENT (just before
     it): a secret shapes what its keeper dodges and lies about and is never
     told or hinted at in narration, and nobody else knows it. STYLE_GUIDE's
     "mention anything not in the packet" is about what exists, so the rule
     is spelled out here rather than in the fixed style guide. */
  const WANTS_RULE = 'WANTS AND SECRETS: what someone in PRESENT wants and their traits drive what they say and do. Their secret is never told or hinted at in the narration; it only decides what they avoid, lie about or bristle at, and they let part of it slip only when the player has earned it, caught them out or found proof. Nobody else present knows someone\'s secret unless their own line says so.';
  /* One fresh rumour a present NPC might share when the player talks to them
     (SPEC section 8, news spreads). Who knows a rumour is its knownBy (the
     source, a faction's free members for its news, and whoever World's
     morning spread has reached since; direction change 12). How well an
     NPC would know it:
       5  news (a rumour the world added during play, such as a clock that
          completed off-screen) that they are the source of
       4  news they know from someone else
       3  an older rumour of their own (sourceNpcId)
       2  an older rumour they know from someone else
       0  a rumour they have not heard
     The best pair wins; ties go to the NPC the player is talking to first,
     then to the newest news, then to the town's own order. Hostile NPCs
     (attitude -25 or below) share nothing. */
  function wouldKnow(n, r) {
    const own = !!r.sourceNpcId && r.sourceNpcId === n.id;
    const knowers = Array.isArray(r.knownBy) ? r.knownBy : [];
    if (!own && !knowers.includes(n.id)) return 0;
    if (Number.isInteger(r.addedTurn)) return own ? 5 : 4;
    return own ? 3 : 2;
  }
  function pickRumour(ctx) {
    const s = State.current;
    const a = ctx.action;
    if (!a || !Dice.SOCIAL_ACTIONS.includes(a.actionType)) return null;
    // A pushed or already granted ask gains nothing (ALREADY GRANTED, SAME ASK
    // AGAIN: the bookkeeper records nothing), so no news is offered on it either.
    if (ctx.pressed || ctx.granted) return null;
    const present = State.npcsAt(s.player.locationId);
    const aimed = present.filter(n => a.targets.includes(n.id));
    const pool = (aimed.length ? aimed : (a.actionType === 'talk' ? present : [])).filter(n => n.attitude > -25);
    const age = r => (Number.isInteger(r.addedTurn) ? r.addedTurn : -1);
    const fresh = s.rumours.filter(r => !r.heard).sort((x, y) => age(y) - age(x));
    let best = null;
    for (const n of pool) {
      for (const r of fresh) {
        const k = wouldKnow(n, r);
        if (k && (!best || k > best.k)) best = { k, n, r };
      }
    }
    return best ? { id: best.r.id, npcId: best.n.id, npcName: best.n.name, text: best.r.text } : null;
  }
  /* After the bookkeeper's diff: the rumours it marked heard this turn
     (State.apply's result.heard) go in the journal as news, "Around town:
     <text> (from <teller>).", and a teller who is not the source is
     recorded (rumourToldBy, so People lists it under them). The teller is
     whoever it was offered by (RUMOUR), else someone here who knows it, the
     person the player spoke to first; with nobody, the line names no one. */
  function newsHeard(ctx, ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const present = State.npcsAt(State.current.player.locationId);
    const spoke = speakerOf(ctx);
    const told = [];
    const lines = [];
    for (const id of ids) {
      const r = State.rumour(id);
      if (!r) continue;
      let teller = ctx.rumour && ctx.rumour.id === r.id ? State.npc(ctx.rumour.npcId) : null;
      if (!teller) {
        const knows = present.filter(n => wouldKnow(n, r) > 0);
        teller = knows.find(n => n.id === spoke) || knows[0] || null;
      }
      if (teller && teller.id !== r.sourceNpcId) told.push({ rumourId: r.id, npcId: teller.id });
      lines.push({ text: `Around town: ${noStop(r.text)}${teller ? ` (from ${teller.name})` : ''}.` });
    }
    if (told.length || lines.length) State.apply({ rumourToldBy: told, journalNews: lines });
  }
  /* Fills the scene part of the turn context (shared by the narrator packet,
     the bookkeeper packet and the mock provider). */
  function scene(ctx) {
    const s = State.current;
    const l = here();
    const present = State.npcsAt(l.id);
    ctx.location = { id: l.id, name: l.name, type: l.type, closed: !!l.closed };
    ctx.locationName = l.name;
    ctx.present = present.map(n => ({ id: n.id, name: n.name, role: n.role, attitude: n.attitude }));
    ctx.presentIds = present.map(n => n.id);
    ctx.time = nowTime();
    const a = ctx.action;
    const d = a && a.actionType === 'move' && a.destinationId ? State.loc(a.destinationId) : null;
    ctx.destination = d ? { id: d.id, name: d.name, closed: !!d.closed, present: State.npcsAt(d.id).map(n => n.name) } : null;
    ctx.turn = s.meta.turn;
    return ctx;
  }
  /* Labelled plain text per SPEC.md section 10. Seeds, rumour truth and the
     secrets and goals of anyone not in the scene are never included; the
     people in PRESENT carry theirs under WANTS_RULE (direction change 10,
     a deliberate deviation from section 10). */
  /* What people can know about the player: they came to town on day 1 and
     were a stranger before; each person knows only their own memories (a
     loose end's creditor or enemy remembers the past they share, from day
     1: Town.looseEndMemory) and what has happened in front of them. The
     narrator invents the rest otherwise ("I've known a while", "he called
     me last night" on day 1). */
  function knowledgeLine(s) {
    const p = s.player;
    const days = s.time.day - 1;
    const since = days === 0 ? 'today (day 1)' : days === 1 ? 'yesterday (this is day 2)' : `${days} days ago (this is day ${s.time.day})`;
    return `WHAT PEOPLE KNOW: ${p.name} came to ${s.meta.townName || 'town'} ${since} and was a stranger here before that. Each person knows about ${p.name} only what their own "remembers" list says and what has happened in front of them (STORY SO FAR, THIS SCENE). Anyone with no memory of a past with ${p.name} never met them, heard of them, or got a call, news or a warning about them before they came. Nothing about ${p.name} happened "last night" or "a while ago" that the story does not show.`;
  }
  /* The player's hooks, after PLAYER and CARRYING: why they came (the goal
     from creation), their flaw (what tempts or needles them, never acted on
     for them: the style guide's NEVER rule stands) and the threads they
     know are open, loose ends included (each names its person). Closed
     threads are left out: a thread keeps no turn for when it closed, and
     the chronicle and people's memories carry how it ended. */
  const THREADS_MAX = 8;
  function playerHooks(s) {
    const p = s.player;
    const out = [];
    if (cleanText(p.goal, 200)) out.push(`WHY THEY CAME: ${asSentence(p.goal)}`);
    if (cleanText(p.flaw, 200)) out.push(`FLAW: ${asSentence(p.flaw)} It colours what tempts or needles ${p.name}; the narration never acts, speaks or decides on it for them.`);
    const open = (s.threads || []).filter(t => isObj(t) && t.knownToPlayer && t.status === 'open').slice(0, THREADS_MAX);
    if (open.length) out.push(`THREADS (what the player is caught up in): ${open.map(t => `${cleanText(t.title, 80)}: ${shortText(t.summary, 240)}`).join(' | ')}`);
    return out;
  }
  function shortText(t, max) {
    const c = cleanText(t, 2000);
    if (c.length <= max) return c;
    const cut = c.slice(0, max);
    return cut.slice(0, cut.lastIndexOf(' ') > max / 2 ? cut.lastIndexOf(' ') : max).replace(/[,;:]$/, '') + '...';
  }
  /* One log entry as the narrator reads it: "> input narration", a Say line
     marked as speech, on one line (a narration's paragraph breaks become
     spaces, so every label in the packet stays one line). */
  function turnText(e) { return `${e.input ? '> ' + (isSay(e) ? `(says to ${sayTo(e)}) "${e.input}"` : e.input) + ' ' : ''}${e.narration}`.replace(/\s+/g, ' ').trim(); }
  /* THIS SCENE: every log entry since the player last came to the place
     they are in (the newest run of entries whose locationId is here), oldest
     first, at most SCENE_MAX.entries entries and about SCENE_MAX.words words (the
     oldest go first, and the line says so). The chronicle drops summarised
     entries from the log, so a scene that began before them (the newest
     entry's sceneFrom is older than the first one kept) says its earlier
     turns are in STORY SO FAR. With fewer than three entries, BEFORE THIS
     SCENE carries the three turns before it, so a fresh arrival keeps the
     thread; entries with no locationId (older saves) are never part of a
     scene and come in that way, as the last three turns did. */
  const SCENE_MAX = { entries: 12, words: 700 };
  function sceneTurns(s, locId) {
    const log = s.log || [];
    let i = log.length;
    while (i > 0 && log[i - 1].locationId === locId) i--;
    const all = log.slice(i);
    const turns = [];
    let words = 0;
    for (let k = all.length - 1; k >= 0 && turns.length < SCENE_MAX.entries; k--) {
      const t = turnText(all[k]);
      const w = wordCount(t);
      if (turns.length && words + w > SCENE_MAX.words) break;
      turns.unshift(t);
      words += w;
    }
    const newest = all[all.length - 1];
    const chronicled = !!newest && Number.isInteger(newest.sceneFrom) && newest.sceneFrom < all[0].turn;
    return {
      turns,
      note: turns.length < all.length ? '(earlier turns of this scene are left out to keep this short) ' : chronicled ? '(earlier turns of this scene are in STORY SO FAR) ' : '',
      before: all.length < 3 ? log.slice(Math.max(0, i - 3), i).map(turnText) : []
    };
  }
  function narratorPacket(ctx) {
    const s = State.current;
    const p = s.player;
    const l = here();
    const turn = s.meta.turn;
    const conds = p.conditions.map(c => c.name.toLowerCase()).join(', ') || 'none';
    const present = State.npcsAt(l.id).map(n => npcLine(n, turn));
    const story = s.chronicle.map(c => c.summary).join(' ').split(/\s+/).filter(Boolean).slice(-150).join(' ');
    const sc = sceneTurns(s, l.id);
    const a = ctx.action || {};
    const roll = ctx.roll;
    const lines = [
      `${State.clockLine(s.time)} · Location: ${l.name} — ${l.description}${l.closed ? ' (closed)' : ''}`
    ];
    // What you notice inside and when it is open (the town block has how it came to be).
    if (l.details || l.hours) lines.push(`PLACE: ${[l.details, l.hours ? `Open: ${l.hours}.` : ''].filter(Boolean).join(' ')}`);
    lines.push(
      `PLAYER: ${p.name} (${ageText(p.age) ? `${p.age}, ` : ''}${p.background.toLowerCase()}). Reputation: ${State.reputationTier()}. Conditions: ${conds}.${p.hp < p.maxHp ? ` HP ${p.hp}/${p.maxHp}.` : ''}`,
      carryingLine(p),
      ...playerHooks(s)
    );
    // One rule for everyone's wants and secrets, right before the people it is about (none when nobody is here).
    if (present.length) lines.push(WANTS_RULE);
    lines.push(
      `PRESENT: ${present.join('; ') || 'nobody'}.`,
      knowledgeLine(s)
    );
    if (s.flags.weather) lines.push(`WEATHER: ${s.flags.weather}`);
    const items = (l.items || []).map(i => i.name + (i.qty > 1 ? ` x${i.qty}` : ''));
    if (items.length) lines.push(`ITEMS HERE: ${items.join(', ')}.`);
    // Paid work here (direction change 16): the giver may bring it up or answer
    // when asked. Nothing is settled until the player takes it (then JOB says so).
    if (!ctx.job) {
      const offers = Town.jobsOnOffer(l.id).filter(j => !Town.jobRefusal(j, l.id));
      if (offers.length) lines.push(`WORK ON OFFER HERE (the one offering may bring it up if it fits, and answers if asked; nothing is paid, won or lost until the player takes it): ${offers.map(j => `${(State.npc(j.giverNpcId) || {}).name || j.giverNpcId}: ${j.label} (${j.stake ? 'win or lose' : 'pays'} about ${money(j.pay[0])}-${j.pay[1]})`).join('; ')}.`);
    }
    const np = (ctx.notPresent || []).map(x => {
      if (x.reason === 'not_here') return `${x.label} (not here right now)`;
      if (x.reason === 'gone') return `${x.label} (${x.why || 'gone from town'})`;
      if (x.reason === 'unproven') return `${x.label} (the player claims this, but it is not true in this world; nobody like that is here)`;
      return `${x.label} (does not exist in this town; it is simply not there)`;
    });
    if (np.length) lines.push(`NOT PRESENT: ${np.join('; ')}.`);
    const made = (ctx.created || []).filter(c => !c.carried).map(c => (c.kind === 'npc' ? `${c.name} (${c.role}, new to the scene)` : `${c.name} (${c.kind === 'location' ? 'a place just off this one' : 'here'})`));
    if (made.length) lines.push(`NEW IN THE SCENE: ${made.join('; ')}.`);
    if (ctx.destination) {
      const d = State.loc(ctx.destination.id);
      const there = State.npcsAt(d.id).map(n => npcLine(n, turn, true));
      lines.push(`DESTINATION: ${d.name} — ${d.description}${d.closed ? ' (closed: the player cannot go in)' : ''} Present there: ${there.join('; ') || 'nobody'}.`);
    }
    if (ctx.moved) lines.push(`MOVED: from ${ctx.moved.fromName} to ${ctx.moved.toName}, just now. The action happens here; give the walk one clause at most.`);
    if (isSay(ctx.speech)) {
      // Say mode: the words themselves, and who answers first.
      const sp = ctx.speech;
      const all = sp.to === 'everyone';
      const answer = all
        ? (present.length ? 'Show how the people here answer; each may react in their own way.' : 'Nobody is here to hear it.')
        : `Show how ${sp.toName} answers first; others present may react.`;
      lines.push(`PLAYER SAYS (to ${all ? 'everyone present' : sp.toName}): "${ctx.input}"`);
      lines.push(`These are the player's exact words, already spoken; do not repeat them in full. ${answer}`);
    } else {
      lines.push(`ACTION: ${a.summary || ctx.input || 'none'}`);
      if (ctx.beat) lines.push('BEAT: the player says and does nothing this turn and waits. The people here carry on: let them act, speak, press, or react to the silence, and move the scene forward a step. The player does not act or speak.');
      else if (ctx.speech && ctx.speech.mode === 'do') lines.push('The player did not say anything beyond what the ACTION line states.');
    }
    if (ctx.missing) lines.push(notCarriedLine(ctx.missing));
    lines.push(`ROLL: ${roll ? roll.line : 'none'}`);
    if (ctx.job) lines.push(jobLine(ctx.job, s.time.phase));
    if (ctx.pressed) lines.push(`SAME ASK AGAIN: the player already tried this and it failed${ctx.pressed.line ? ` (${ctx.pressed.line})` : ''}; there is no new roll and the answer does not change. Show them holding their position and reacting to being pushed (shorter, cooler or amused). Nothing new is granted.`);
    if (ctx.granted) lines.push(`ALREADY GRANTED: the player asked this before and ${ctx.granted.name || 'the people here'} agreed${ctx.granted.line ? ` (${ctx.granted.line})` : ''}; there is no new roll and nothing more is gained. Show them noting it is already settled (a shrug, "I said yes", mild impatience) and move the scene on; grant nothing further.`);
    lines.push(`COMPLICATION: ${[roll && roll.complication, ctx.consequence].filter(Boolean).join('; ') || 'none'}`);
    if (roll && !roll.success && Dice.SOCIAL_ACTIONS.includes(a.actionType)) lines.push('OUTCOME: the ask failed. The person does not give the player what they asked for, in any form; the complication is on top of the refusal, not instead of it.');
    if (roll && roll.success && Dice.SOCIAL_ACTIONS.includes(a.actionType)) lines.push(`OUTCOME: the ask succeeded. ${roll.tier === 'critical' ? 'It works, and then some.' : roll.tier === 'partial' ? 'It works, but at the cost named in COMPLICATION.' : 'It works.'} The person goes along with what the player asked, at least in part, whatever they said before; do not narrate a refusal or a watered-down substitute. If it seems out of character, the difficulty already allowed for that: the dice decided.`);
    if (ctx.attacked) lines.push(attackedLine(ctx.attacked));
    if (ctx.damage) lines.push(`DAMAGE: the player takes ${ctx.damage} damage.`);
    if (ctx.defeated) lines.push('DEFEAT: the player is beaten senseless. Narrate them going down and stop there; the engine decides what happens after.');
    // SPEC step 11: work due events in naturally (at most World.MAX_DUE of them).
    const due = (ctx.due || []).map(d => d.text).join(' / ');
    const ps = s.pendingScene;
    if (ps && ps.locationId === l.id && ((ps.arrived || []).length || (ps.left || []).length)) {
      ctx.sceneChange = ps;
      const who = ids => ids.map(id => { const n = State.npc(id); if (!n) return id; const home = n.home && n.home.locationId === l.id ? ' (this is their home)' : ''; return n.name + home; }).join(', ');
      const parts = [];
      if (ps.arrived.length) parts.push(`arrived here: ${who(ps.arrived)}`);
      if (ps.left.length) parts.push(`left: ${who(ps.left)}`);
      lines.push(`SINCE THE LAST TURN (time moved on to ${s.time.phase}${s.time.late ? ', late' : ''}): ${parts.join('; ')}. The player has not acted in between. Show the arrival or departure as it happens or has just happened (a truck pulling in, a door, a goodbye), and let them react to finding the player here.`);
    }
    lines.push(`DUE EVENT: ${due ? `${due} (already true; work it into the scene naturally, not as an announcement)` : 'none'}`);
    if (ctx.rumour) lines.push(`RUMOUR: ${ctx.rumour.npcName} might mention this, if it fits: "${ctx.rumour.text}"`);
    if (ctx.timePassed) lines.push(`TIME PASSED: ${ctx.timePassed}`);
    lines.push(`STORY SO FAR: ${story || 'nothing yet'}`);
    if (sc.before.length) lines.push(`BEFORE THIS SCENE: ${sc.before.join(' | ')}`);
    lines.push(`THIS SCENE (since the player came to ${String(l.name).replace(/^The /, 'the ')}): ${sc.note}${sc.turns.join(' | ') || 'nothing yet; the player has just got here'}`);
    lines.push(`MODE: ${ctx.mode === 'zoom' ? 'ZOOM' : ctx.mode === 'arrival' ? 'arrival (ZOOM length allowed)' : 'normal'}`);
    // Last, so it is the freshest instruction: the length the style check enforces.
    lines.push(Style.lengthLine(ctx.mode === 'zoom' || ctx.mode === 'arrival'));
    return lines.join('\n');
  }
  /* Steps 6 and 7: stream the narration into the feed, check it, regenerate
     once with a note naming the problem, keep the second try either way. */
  async function narrate(ctx) {
    const zoom = ctx.mode === 'zoom' || ctx.mode === 'arrival';
    const style = Style.current();
    const text = narratorPacket(ctx);
    ctx.packet = text;
    const mock = Api.providerName() === 'mock';
    const node = UI.feed.beginNarration({ mock });
    const once = async extra => {
      UI.feed.stream(node, '');
      const res = await Api.narrate({ text: extra ? `${text}\n${extra}` : text, system: Style.systemPrompt(style), town: townBlock(), cast: castBlock(), context: ctx }, (chunk, soFar) => UI.feed.stream(node, soFar));
      return res;
    };
    try {
      let res = await once(null);
      if (isRefusal(res)) { node.remove(); return { refusal: res }; }
      let narration = String((res && res.text) || '').trim();
      const previous = mock ? [] : State.current.log.slice(-3).map(e => e.narration).filter(Boolean);
      // Someone here who shares a past with the player (a loose end) may speak of it, even on day 1.
      const pastKnown = (State.current.player.looseEnds || []).some(le => (ctx.presentIds || []).includes(le.npcId));
      let check = Style.check(narration, { zoom, style, previous, day: State.current.time.day, pastKnown });
      ctx.style = [check];
      if (!check.ok) {
        State.debugLog.push({ turn: State.current.meta.turn, kind: 'style', attempt: 1, problems: check.problems });
        const note = Style.regenerationNote(check.problems);
        ctx.regenerated = note;
        res = await once(note);
        if (isRefusal(res)) { node.remove(); return { refusal: res }; }
        const second = String((res && res.text) || '').trim();
        if (second) narration = second;
        check = Style.check(narration, { zoom, style, previous, day: State.current.time.day, pastKnown });
        ctx.style.push(check);
        if (!check.ok) State.debugLog.push({ turn: State.current.meta.turn, kind: 'style', attempt: 2, problems: check.problems, kept: true });
      }
      if (!narration) throw new Api.ApiError('bad_response', 'The narrator sent back nothing. Try again.');
      UI.feed.endNarration(node, narration);
      return { narration, node, mock };
    } catch (err) {
      node.remove(); // never leave an empty "pending" placeholder behind
      throw err;
    }
  }

  // ----- step 8: the bookkeeper's packet -----
  function bookkeeperPacket(ctx) {
    const s = State.current;
    const p = s.player;
    const l = here();
    const a = ctx.action || {};
    const presentIds = ctx.presentIds || [];
    const npcRow = n => `${n.id} — ${n.name} (${pronounLabel(n.pronouns)}; ${n.role}; attitude ${n.attitude})${n.unnamed ? ' (no name yet)' : ''}`;
    const engine = [];
    if (ctx.job) engine.push(`the job, ${ctx.job.label} ${ctx.job.stake ? 'with' : 'for'} ${ctx.job.giverId} (${ctx.job.outcome}): ${ctx.job.paid ? `${ctx.job.paid > 0 ? 'the pay' : 'the loss'}, goldDelta ${plusMinus(ctx.job.paid)}` : 'no pay'}, and its time; record no goldDelta this turn`);
    if (ctx.attacked) engine.push(`${ctx.attacked.npcId} came at the player, who defended (${ctx.attacked.roll.line})`);
    if (ctx.damage) engine.push(`fight damage: the player lost ${ctx.damage} HP`);
    if (ctx.consequence) engine.push(ctx.consequence);
    if (ctx.storyPoint) engine.push('a story point for the natural 20');
    for (const c of ctx.created || []) engine.push(`created ${c.id} (${c.kind}: ${c.name})`);
    if (ctx.moved) engine.push(`the walk from ${ctx.moved.fromId} to ${ctx.moved.toId} (the player is at ${ctx.moved.toId} now)`);
    engine.push('time passing (never record time)');
    const lines = [
      `TURN ${s.meta.turn} · ${State.clockLine(s.time)}. Any new seed must trigger on day ${s.time.day + 1} or later.`,
      `PLAYER: ${p.name}; ${moneyLine(p.gold)} (goldDelta is in these units); hp ${p.hp}/${p.maxHp}; at ${l.id} (${l.name}); carrying ${p.inventory.map(i => `${i.id} (${i.name}${i.qty > 1 ? ' x' + i.qty : ''})`).join(', ') || 'nothing'}`,
      isSay(ctx.speech) ? `INPUT: "${ctx.input}"` : `INPUT: ${ctx.input || '(none)'}`,
      ...(isSay(ctx.speech)
        ? [`MODE: say, to ${ctx.speech.to === 'everyone' ? 'everyone present' : `${ctx.speech.to} (${ctx.speech.toName})`}. INPUT is the player's exact spoken words; they did nothing else and stayed where they are (playerLocationId null).`]
        : ctx.speech ? ['MODE: do'] : []),
      `ACTION: ${a.summary || ''} [type ${a.actionType}; targets ${(a.targets || []).join(', ') || 'none'}${a.destinationId ? '; destination ' + a.destinationId : ''}]`,
      `ROLL: ${ctx.roll ? `${ctx.roll.line}${ctx.roll.complication ? ' · Complication: ' + ctx.roll.complication : ''}` : 'none'}`,
      `ALREADY APPLIED BY THE ENGINE (do not record again): ${engine.join('; ')}`
    ];
    // The same fact the narrator had: record no use of the thing and nothing that needed it.
    if (ctx.missing) lines.push(`${notCarriedLine(ctx.missing)} Record no use of it, no item used or lost, and nothing that needed it.`);
    if (ctx.pressed) lines.push('SAME ASK AGAIN: this repeats an ask that already failed; grant nothing new; a small attitude drop (-5 to -10) for the person pushed is reasonable; no move.');
    if (ctx.granted) lines.push(`ALREADY GRANTED: the player asked this before and ${ctx.granted.name || 'the people here'} agreed${ctx.granted.line ? ` (${ctx.granted.line})` : ''}; there is no new roll. Record no attitude change, no memory and nothing gained; no move.`);
    if (ctx.beat) lines.push('BEAT: the player did and said nothing; record only what the others did.');
    const missing = (ctx.notPresent || []).filter(x => x.reason === 'does_not_exist' || x.reason === 'unproven').map(x => x.label);
    if (missing.length) lines.push(`DOES NOT EXIST (record nothing about it): ${missing.join(', ')}`);
    if (ctx.rumour) lines.push(`RUMOUR OFFERED: ${ctx.rumour.id} by ${ctx.rumour.npcId}: "${ctx.rumour.text}" (list it in rumoursHeard only if the narration shows it being told)`);
    lines.push(`NARRATION: ${ctx.narration || ''}`);
    lines.push('IDS YOU MAY USE:');
    lines.push(`NPCS PRESENT: ${State.npcsAt(l.id).map(npcRow).join('; ') || 'none'}`);
    lines.push(`OTHER KNOWN NPCS: ${s.npcs.filter(n => n.knownToPlayer && !presentIds.includes(n.id)).map(npcRow).join('; ') || 'none'}`);
    // Someone the narration names who is neither here nor known yet (whose home was just described, say), so placesRevealed can name the owner.
    const named = s.npcs.filter(n => !n.knownToPlayer && !presentIds.includes(n.id) && n.alive !== false && Town.nameMentions(ctx.narration || '', n));
    if (named.length) lines.push(`NAMED IN THE NARRATION (not here): ${named.map(npcRow).join('; ')}`);
    // Everyone else in the cast (so a home someone names can say whose it is; the cast is fixed: nobody new is added) and the factions are in the cached block (bookkeeperBlock).
    lines.push('EVERYONE ELSE AND THE FACTIONS: in the system prompt (EVERYONE IN TOWN, FACTIONS).');
    // The places the player knows. A home in the cast they have not found yet is not listed, so a line that tells them about it goes in placesRevealed (the engine finds it).
    lines.push(`LOCATIONS (the places list): ${s.locations.filter(x => x.discovered).map(x => `${x.id} — ${x.name}${l.exits.includes(x.id) ? ' (exit from here)' : ''}${x.closed ? ' (closed)' : ''}`).join('; ')}`);
    lines.push(`ITEMS HERE: ${(l.items || []).map(i => `${i.id} (${i.name})`).join(', ') || 'none'}`);
    lines.push(`THREADS: ${s.threads.map(t => `${t.id} — ${t.title} (${t.status}${t.knownToPlayer ? '' : '; player does not know it yet'})`).join('; ') || 'none'}`);
    return lines.join('\n');
  }

  /* "Mavis Toler (Dewayne's wife)": the name, and who they are to someone
     (else the first part of the role). */
  function personTag(n) {
    if (!n) return '';
    const rel = isObj(n.created) && n.created.relationToNpcId ? State.relationPhrase(State.npc(n.created.relationToNpcId), n.created.relation) : '';
    const role = rel || String(n.role || '').split(',')[0].trim();
    return role && role !== 'townsfolk' ? `${n.name} (${role})` : n.name;
  }
  /* Who the player was talking to this turn, for a place they named: the
     one person addressed in Say mode, else the first person present the
     action was aimed at, else the only person present; or null. */
  function speakerOf(ctx) {
    const present = ctx.presentIds || [];
    if (isSay(ctx.speech) && ctx.speech.to !== 'everyone' && present.includes(ctx.speech.to)) return ctx.speech.to;
    const aimed = ((ctx.action && ctx.action.targets) || []).find(id => present.includes(id));
    return aimed || (present.length === 1 ? present[0] : null);
  }

  // ----- defeat at 0 HP -----
  /* Chosen by code from context (SPEC section 7): rescued by a friendly NPC
     in the scene, captured when the watch is involved, robbed when there is
     gold to take, otherwise left in a gutter. Death only with Permadeath. */
  function defeat(ctx) {
    const s = State.current;
    const p = s.player;
    const l = here();
    const present = State.npcsAt(l.id);
    // Who did it: someone who came at the player and hurt them (a fight effect), else the person the action was aimed at.
    const attacker = ctx.attacked && ctx.attacked.damage ? present.find(n => n.id === ctx.attacked.npcId) : null;
    const foe = attacker || ((ctx.action && ctx.action.targets) || []).map(id => State.npc(id)).find(n => n && present.includes(n)) || null;
    const watchy = n => !!n && ((n.tags || []).some(t => t === 'watch' || t === 'police') || /\b(watch|police|deputy|sheriff|officer|constable|trooper|cop)/i.test(n.role));
    let outcome;
    let npc = null;
    let dest = null;
    if (Storage.settings().permadeath) outcome = 'dead';
    else {
      const friend = present.filter(n => n !== foe && n.attitude >= 25).sort((x, y) => y.attitude - x.attitude)[0];
      if (friend) { outcome = 'rescued'; npc = friend; }
      else if (watchy(foe) || PLACE_KINDS.watch.includes(l.type)) { outcome = 'captured'; npc = foe; dest = findPlace('watch'); }
      else if (p.gold > 0) { outcome = 'robbed'; npc = foe; }
      else { outcome = 'gutter'; dest = findPlace('slum', l.id); }
    }
    const lost = p.gold;
    const diff = { defeat: { outcome } };
    if (outcome !== 'dead') {
      diff.hpDelta = outcome === 'rescued' ? 3 : outcome === 'captured' ? 2 : 1;
      diff.conditionsAdded = [{ name: 'Beaten', effect: '-1 might', untilDay: s.time.day + 2 }];
      if (outcome === 'robbed' && lost > 0) diff.goldDelta = -lost;
      if (dest && dest.id !== l.id) diff.playerLocationId = dest.id;
      if (npc && outcome === 'rescued') diff.newMemories = [{ npcId: npc.id, text: `Found ${p.name} beaten senseless and helped them`, weight: 2 }];
      if (npc && outcome === 'captured') diff.newMemories = [{ npcId: npc.id, text: `Beat ${p.name} in a fight and dragged them to the cells`, weight: 3 }];
    }
    State.apply(diff);
    if (outcome !== 'dead') passTime('long', 'defeat');
    const text = {
      rescued: () => `You black out. When you come to, ${npc.name} is kneeling beside you, and the fight is over.`,
      captured: () => (dest ? `You black out. You wake on the floor of a cell in ${dest.name.replace(/^The /, 'the ')}, aching all over.` : 'You black out and wake under guard, aching all over.'),
      robbed: () => `You black out. When you come to, your ${isModern() ? 'wallet' : 'purse'} is gone, and ${money(lost)} with it.`,
      gutter: () => `You black out. You wake in a gutter in ${dest ? dest.name.replace(/^The /, 'the ') : 'a back lane'}, soaked and aching, with no memory of getting there.`,
      dead: () => 'You go down and do not get up. Your story ends here.'
    }[outcome]();
    return { outcome, npcId: npc ? npc.id : null, text };
  }

  // ----- work (direction change 16) -----
  /* A work action takes a job, found before anything is spent: its id in
     targets (the parser's, from WORK ON OFFER HERE), else the job here of
     someone the action is aimed at, else the first one on offer here (a
     /reroll replays an action whose only target is already the giver).
     Town.jobRefusal says why it cannot be taken now, and runTurn refuses the
     turn with that line, like a trip out of town. Otherwise the action
     becomes the job's: its roll (stat and difficulty, or none), its time,
     and its giver as the only target. Returns { job } or { refuse }. */
  function takeWork(ctx) {
    const s = State.current;
    const a = ctx.action;
    const at = s.player.locationId;
    const offer = Town.jobsOnOffer(at);
    const mine = Town.jobsAt(at);
    const j = a.targets.map(t => Town.job(t)).find(Boolean)
      || offer.find(x => a.targets.includes(x.giverNpcId)) || mine.find(x => a.targets.includes(x.giverNpcId))
      || offer[0] || mine[0] || null;
    const why = Town.jobRefusal(j, at);
    if (why) return { refuse: why };
    Object.assign(a, { targets: [j.giverNpcId], needsRoll: !!j.stat, stat: j.stat || null, difficulty: j.stat ? j.difficulty : null, timeCost: j.timeCost, missingItem: null, declaresWorldFact: false });
    return { job: j };
  }
  function refuseWork(text, opts, ctx, snap, mark) {
    const r = fail(snap, mark, null, { reason: 'work' });
    UI.feed.input(opts.input, ctx.speech);
    UI.feed.notice(text);
    return r;
  }
  /* The work is done (step 5, after its roll went through resolve, so the
     retry lock and /reroll treat it like any roll). Pay goes in as the
     engine's goldDelta: a critical earns the top of the pay range, a success
     a sum in it (Rng), a partial the low end, a failure nothing; with no
     stat it is a sum in the range. A stake (the card game) is won the same
     way and lost on a failure (a sum in the range; the top on a critical
     failure), never more than the player has. Then the job's onSuccess or
     onFailure effects, the journal line ("A shift ... for Dewayne Mangum:
     paid $70.") and state.work, which keeps it from being taken again too
     soon. The time is the action's own and passes at step 10. Returns what
     the narrator (JOB) and the bookkeeper are told. */
  function settleWork(ctx, j) {
    const s = State.current;
    const p = s.player;
    const outcome = j.stat ? (ctx.roll ? ctx.roll.tier : 'failure') : 'done';
    const good = outcome === 'done' || Dice.isSuccess(outcome);
    const lo = j.pay[0];
    const hi = j.pay[1];
    let delta = 0;
    if (outcome === 'critical') delta = hi;
    else if (outcome === 'success' || outcome === 'done') delta = Rng.int(lo, hi);
    else if (outcome === 'partial') delta = lo;
    else if (j.stake && ctx.roll) delta = -Math.min(p.gold, outcome === 'critical_failure' ? hi : Rng.int(lo, hi));
    if (delta) State.apply({ goldDelta: delta });
    const fx = (good ? j.onSuccess : j.onFailure) || [];
    const done = fx.length ? State.apply({ effects: fx }) : null;
    const giver = State.npc(j.giverNpcId);
    const cash = delta > 0 ? `${j.stake ? 'won' : 'paid'} ${money(delta)}` : delta < 0 ? `lost ${money(-delta)}` : 'paid nothing';
    State.apply({ workDone: { jobId: j.id, outcome }, journalNews: [{ text: `${capFirst(j.label)} ${j.stake ? 'with' : 'for'} ${giver.name}: ${cash}.`, kind: 'work' }] });
    UI.feed.quiet(delta > 0 ? `You ${j.stake ? 'win' : 'are paid'} ${money(delta)} (${moneyLabel().toLowerCase()} ${money(p.gold)}).` : delta < 0 ? `You lose ${money(-delta)} at the table (${moneyLabel().toLowerCase()} ${money(p.gold)}).` : 'Nothing is paid.');
    return { id: j.id, label: j.label, giverId: giver.id, giverName: giver.name, blurb: j.blurb, outcome, paid: delta, stake: !!j.stake, effects: done ? done.applied.length : 0 };
  }
  /* The JOB line: what the work was, how it went and the money, already settled. */
  function jobLine(job, phase) {
    const m = money(Math.abs(job.paid));
    const how = job.stake
      ? { critical: `the cards run the player's way all night; won ${m}`, success: `the cards run the player's way; won ${m}`, partial: `the player comes out a little ahead; won ${m}`,
        failure: `the cards go against the player; lost ${m}`, critical_failure: `the player loses badly; lost ${m}` }[job.outcome]
      : { done: `it gets done; paid ${m}`, critical: `it goes better than anyone expected; paid ${m}, the top rate`, success: `it goes fine; paid ${m}`,
        partial: `it gets done, but not well (the complication); paid ${m}, the low end`, failure: 'it goes wrong (the complication); paid nothing', critical_failure: 'it goes badly wrong (the complication); paid nothing' }[job.outcome];
    return `JOB: ${job.label}, ${job.stake ? 'with' : 'for'} ${job.giverName} (${noStop(job.blurb)}): ${how}. The work takes the rest of the ${phase}: tell it in a sentence or two and end on the money; nothing else is paid, won or lost.`;
  }

  // ----- fights the player did not start (direction change 16) -----
  /* A fight effect leaves someone waiting to come at the player
     (state.fights). Each narrated turn, after the due events are picked,
     the first fight that is ready is resolved: a seed's fight on the turn
     its due event is told (it waits while the event waits, and goes when
     the event went without it), any other fight on the next turn. Someone
     no longer free or in town drops theirs. The attacker is brought to the
     player for the phase (a visit), and the player defends: a might roll at
     normal difficulty, +2 with a knife or a gun on them (as usesItemId does
     for an attack); a failure costs 1 to 3 HP and a critical failure 3,
     through ctx.damage and ctx.defeated like a lost attack, and a natural
     20 earns a story point like any roll. It never touches the retry lock.
     Returns what the narrator (ATTACKED) and the bookkeeper are told, or
     null. Test hook: hooks.fightD20 forces the defending die once. */
  function comeAt(ctx) {
    const s = State.current;
    const list = Array.isArray(s.fights) ? s.fights : [];
    if (!list.length) return null;
    const told = (ctx.due || []).map(d => d.seedId);
    const drop = [];
    let f = null;
    for (const x of list) {
      const n = State.npc(x.npcId);
      if (!n || n.alive === false || n.status !== 'free' || presenceOf(n) !== 'here') { drop.push(x.id); continue; }
      if (x.seedId && !told.includes(x.seedId)) { if (!(s.dueEvents || []).some(e => e.seedId === x.seedId)) drop.push(x.id); continue; }
      if (!f) f = x;
    }
    if (drop.length) State.apply({ fightDone: drop });
    if (!f) return null;
    const n = State.npc(f.npcId);
    const at = s.player.locationId;
    State.apply({ fightDone: [f.id] });
    if (!State.npcsAt(at).some(x => x.id === n.id) && State.apply({ visits: [{ npcId: n.id, locationId: at }] }).rejected.length) return null;
    const weapon = s.player.inventory.find(i => i.qty > 0 && (carriedAs(i.name, 'knife') || carriedAs(i.name, 'gun')));
    let forced = Number.isInteger(hooks.fightD20) ? hooks.fightD20 : (hooks.diceSalt ? ((Rng.d(20) - 1 + hooks.diceSalt * 7) % 20) + 1 : undefined);
    hooks.fightD20 = null;
    const roll = Dice.resolve({ stat: 'might', difficulty: 'normal', usesItemId: weapon ? weapon.id : undefined, npcId: n.id, actionType: 'attack', d20: forced });
    UI.feed.roll(roll);
    if (roll.tier === 'critical' && s.player.storyPoints < State.LIMITS.storyPoints) {
      State.apply({ storyPointsDelta: 1 });
      ctx.storyPoint = true;
      UI.feed.quiet(`Natural 20: you earn a story point (${s.player.storyPoints} of ${State.LIMITS.storyPoints}).`);
    }
    let dmg = 0;
    if (roll.tier === 'failure' || roll.tier === 'critical_failure') {
      dmg = roll.tier === 'critical_failure' ? 3 : Rng.int(1, 3);
      State.apply({ hpDelta: -dmg });
      ctx.damage = (ctx.damage || 0) + dmg;
      ctx.defeated = s.player.hp <= 0;
      UI.feed.quiet(`You take ${dmg} damage (HP ${s.player.hp}/${s.player.maxHp}).`);
    }
    return { npcId: n.id, name: n.name, reason: f.reason || null, seedId: f.seedId || null, roll, damage: dmg };
  }
  /* The ATTACKED line: who comes at the player, why, the defending roll and what it means. */
  function attackedLine(x) {
    const r = x.roll;
    const how = r.tier === 'critical' ? `The player gets the better of ${x.name}, who is driven off.`
      : r.tier === 'success' ? `The player holds their own: ${x.name} gets nowhere and backs off.`
      : r.tier === 'partial' ? `The player holds ${x.name} off, at the cost in that complication.`
      : r.tier === 'failure' ? `${x.name} gets the better of the player (DAMAGE).` : `${x.name} beats the player badly (DAMAGE).`;
    return `ATTACKED: ${x.name} comes at the player${x.reason ? ` (${x.reason})` : ''}; the player did not start it and defends. ${r.packetLine}. ${how}`;
  }

  // ----- step 12: chronicle compression -----
  /* Every 10 turns the oldest 10 log entries become one chronicle entry
     (Api.chronicle: the bookkeeper model in plain text, or the mock's
     deterministic summary) through State.apply({ chronicleEntry }), which
     drops them from the log; the log keeps the rest. Due when the log holds
     10 entries and 10 turns have passed since the last entry's toTurn, so a
     turn that skips this step (/fact) or a failed call only puts it off to
     the next turn. A refusal, an error or an empty reply never fails the
     turn. The narrator's STORY SO FAR is the summaries joined, trimmed to
     the last 150 words (narratorPacket). Returns the entry, or null. */
  const CHRONICLE_EVERY = 10;
  async function compressIfDue() {
    const s = State.current;
    if (!s) return null;
    const last = s.chronicle[s.chronicle.length - 1];
    if (s.log.length < CHRONICLE_EVERY || s.meta.turn - (last ? last.toTurn : 0) < CHRONICLE_EVERY) return null;
    const entries = deepCopy(s.log.slice(0, CHRONICLE_EVERY));
    const skip = reason => { State.debugLog.push({ turn: s.meta.turn, kind: 'chronicle', reason }); return null; };
    let summary;
    try { summary = await Api.chronicle(entries); } catch (err) { return skip(`chronicle failed: ${(err && (err.detail || err.message)) || err}`); }
    if (isRefusal(summary)) return skip('chronicle refused');
    if (typeof summary !== 'string' || !summary.trim()) return skip('chronicle came back empty');
    if (State.current !== s) return null;
    const entry = { fromTurn: entries[0].turn, toTurn: entries[entries.length - 1].turn, summary: summary.trim() };
    const r = State.apply({ chronicleEntry: entry });
    return r.rejected.length ? null : entry;
  }

  // ----- the turn -----
  /* A place out of town the action would go to: its destination, or for a
     move a place among its targets. Or null. */
  function awayTarget(a) {
    if (!a) return null;
    const d = a.destinationId ? State.loc(a.destinationId) : null;
    if (d && d.away === true) return d;
    if (a.actionType === 'move') return (a.targets || []).map(id => State.loc(id)).find(l => l && l.away === true) || null;
    return null;
  }
  /* The plain line for a trip out of town: how far it is, and that the story stays here. */
  function awayLine(l) {
    const town = (State.current && State.current.meta.townName) || 'town';
    return `${String(l.name).replace(/^The /, 'the ').replace(/^./, c => c.toUpperCase())} is out of town${l.distance ? ` (${l.distance})` : ''}. The story stays in ${town}: you can talk about it, but you can't go there.`;
  }
  function refuseAway(l, opts, ctx, snap, mark) {
    const r = fail(snap, mark, null, { reason: 'away', placeId: l.id });
    UI.feed.input(opts.input, ctx.speech);
    UI.feed.notice(awayLine(l));
    return r;
  }
  function fail(snap, mark, notice, extra) {
    // Defensive: if another game was loaded mid-turn, do not restore over it or touch its feed.
    if (turnState && State.current !== turnState) return Object.assign({ ok: false }, extra, { reason: 'replaced' });
    State.restore(snap);
    World.forget(State.current.meta.turn);
    UI.feed.rollback(mark);
    if (notice) UI.feed.notice(notice.text, notice.kind);
    return Object.assign({ ok: false }, extra);
  }
  /* opts: { input (shown and logged), mode: 'normal' | 'zoom' | 'arrival',
     parse (text for the parser; default input), action (preset action or
     fn(ctx) -> action: skips the parser), fact (statement: /fact),
     prepare (fn(ctx), runs after the snapshot: time skips), bookkeep (false
     to skip steps 8-9), cause (for World.tick) } */
  async function runTurn(opts) {
    const s = State.current;
    busy = true;
    UI.setBusy(true);
    Api.beginTurn();
    const snap = State.snapshot();
    const mark = UI.feed.mark();
    const ctx = { input: opts.input, mode: opts.mode || 'normal', speech: opts.speech || null, action: null, roll: null, created: [], notPresent: [], links: [], due: [], reroll: !!opts.reroll, beat: !!opts.beat };
    // Step 13: the autosave and the render run once, when this batch closes
    // (finally below), after the whole turn or its rollback.
    State.beginBatch();
    turnState = s;
    const replaced = () => State.current !== s;
    try {
      State.apply({ beginTurn: true });
      UI.feed.input(opts.input, ctx.speech);
      const startTime = nowTime();
      const startLoc = s.player.locationId;
      if (opts.prepare) opts.prepare(ctx);
      if (!sameTime(startTime, nowTime())) UI.feed.divider(s.time.day, s.time.phase);
      // Step 3. Parse.
      let action;
      if (opts.action) action = normaliseParse(typeof opts.action === 'function' ? opts.action(ctx) : opts.action);
      else {
        const parsed = await Api.parse(parsePacket(opts.parse || opts.input, { mode: opts.fact ? 'fact' : 'action', speech: ctx.speech }));
        if (replaced()) return fail(snap, mark, null, {});
        if (isRefusal(parsed)) return fail(snap, mark, { text: NOTICES.refused }, { reason: 'refused', restoreInput: true });
        action = normaliseParse(parsed);
      }
      if (!action.summary) action.summary = cleanText(opts.parse || opts.input, 160);
      ctx.action = action;
      // Step 3c. Say mode: the player only spoke, to whoever they addressed.
      if (!opts.fact && isSay(ctx.speech)) sayAction(action, ctx.speech);
      // A place out of town is never a destination: a plain line, nothing spent (before anything moves).
      if (!opts.fact && awayTarget(action)) return refuseAway(awayTarget(action), opts, ctx, snap, mark);
      // Step 3b. A walk and then an action there: the engine moves the player first.
      if (!opts.fact) walkFirst(ctx);
      // Work (direction change 16): the job it takes, or a plain line why not, before anything is spent (the walk too).
      let job = null;
      if (!opts.fact && action.actionType === 'work') {
        const w = takeWork(ctx);
        if (w.refuse) return refuseWork(w.refuse, opts, ctx, snap, mark);
        job = w.job;
      } else action.targets = action.targets.filter(t => !Town.job(t)); // asking about a job is not taking it, and a job is nobody to look for
      // Step 4. Check and create.
      Object.assign(ctx, await checkAndCreate(action, { fact: !!opts.fact, input: opts.parse || opts.input }));
      if (replaced()) return fail(snap, mark, null, {});
      if (opts.fact) return finishFact(ctx, opts, snap, mark);
      if (awayTarget(action)) return refuseAway(awayTarget(action), opts, ctx, snap, mark);
      fleeExit(ctx);
      scene(ctx);
      // Something the action needs that the player does not carry: told to the narrator and the bookkeeper (NOT CARRIED).
      ctx.missing = missingThing(ctx);
      // Step 5. Resolve.
      if (resolve(ctx).locked) {
        const r = fail(snap, mark, null, { reason: 'retry-locked' });
        UI.feed.input(opts.input, ctx.speech);
        UI.feed.notice(NOTICES.locked);
        return r;
      }
      // The work is done: paid, its effects, its journal line and its cooldown (the time passes at step 10).
      if (job) ctx.job = settleWork(ctx, job);
      // Step 6. Narrate, with any due events (step 11 of an earlier turn) and one fresh rumour.
      const narrTime = nowTime();
      const leaving = action.actionType === 'move' && !!action.destinationId && action.destinationId !== ctx.location.id;
      ctx.due = World.dueSeeds({ turn: s.meta.turn, time: narrTime, locationId: ctx.location.id, presentNpcIds: ctx.presentIds, targetIds: action.targets.slice(), mode: ctx.mode, leaving }) || [];
      // Someone comes at the player (a fight effect): the turn its seed's event is told, or the turn after it was made.
      ctx.attacked = comeAt(ctx);
      if (ctx.due.length || ctx.attacked) scene(ctx); // a due event or a fight may have brought someone into the scene
      ctx.rumour = pickRumour(ctx);
      const told = await narrate(ctx);
      if (replaced()) return fail(snap, mark, null, {});
      if (told.refusal) return fail(snap, mark, { text: NOTICES.refused }, { reason: 'refused', restoreInput: true });
      // The story is written: the composer is handed back for the next line while the bookkeeper (and any chronicle) finish.
      // busy stays true, so nothing is sent, loaded or undone before the turn closes (finally).
      UI.setBusy('closing');
      let narration = told.narration;
      ctx.narration = narration;
      noteIntroductions(narration, ctx.location && ctx.location.id);
      noteMentioned(narration);
      // Steps 8-9. Bookkeep, then apply the diff as model output.
      if (opts.bookkeep !== false) {
        const diff = await Api.bookkeep({ text: bookkeeperPacket(ctx), block: bookkeeperBlock(), context: ctx });
        if (replaced()) return fail(snap, mark, null, {});
        if (isRefusal(diff)) return fail(snap, mark, { text: NOTICES.refused }, { reason: 'refused', restoreInput: true });
        const clean = isObj(diff) ? Object.assign({}, diff) : {};
        if (ctx.damage && toInt(clean.hpDelta) < 0) {
          State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'model', path: 'hpDelta', reason: 'ignored: the engine already applied fight damage' });
          delete clean.hpDelta;
        }
        // The job's money is the engine's (direction change 16): the bookkeeper was told it is settled.
        if (ctx.job && toInt(clean.goldDelta)) {
          State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'model', path: 'goldDelta', reason: `ignored: the engine already settled the job (${plusMinus(ctx.job.paid)})` });
          delete clean.goldDelta;
        }
        if (isSay(ctx.speech) && clean.playerLocationId && clean.playerLocationId !== s.player.locationId) {
          State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'model', path: 'playerLocationId', reason: 'ignored: in Say mode the player only spoke and stays where they are' });
          delete clean.playerLocationId;
        }
        if (ctx.moved && clean.playerLocationId === ctx.moved.fromId) {
          State.debugLog.push({ turn: s.meta.turn, kind: 'rejected', source: 'model', path: 'playerLocationId', reason: `ignored: the engine walked the player from ${ctx.moved.fromId} to ${ctx.moved.toId} this turn` });
          delete clean.playerLocationId;
        }
        // A place someone named: credited to whoever the player was talking to (the bookkeeper does not say who told it).
        const by = speakerOf(ctx);
        for (const k of ['placesRevealed', 'peopleRevealed']) {
          if (Array.isArray(clean[k])) clean[k] = clean[k].map(x => (isObj(x) && by ? Object.assign({}, x, { byNpcId: by }) : x));
        }
        const before = World.attitudes();
        ctx.applied = State.apply(clean, { source: 'model' });
        // Step 13 renders the map and the Places list from state; the feed says what was added.
        ctx.revealed = (ctx.applied.revealed || []).slice();
        for (const id of ctx.revealed) UI.feed.quiet(`Added to the map: ${State.loc(id).name}.`);
        // A person the story named: a quiet line once they have a name (someone known only as "Dewayne's wife" is added silently).
        ctx.people = (ctx.applied.people || []).slice();
        for (const x of ctx.people) if (x.named) UI.feed.quiet(`Added to People: ${personTag(State.npc(x.id))}.`);
        ctx.reputation = World.driftReputation(before);
        // A rumour heard: news in the journal, and People lists it under a teller who is not its source.
        newsHeard(ctx, ctx.applied.heard);
      }
      arriveIfLeftBehind(ctx);
      // Defeat at 0 HP, from the fight or from the bookkeeper's hpDelta.
      if (s.player.hp <= 0 && !s.player.dead) {
        ctx.defeat = defeat(ctx);
        narration = `${narration}\n\n${ctx.defeat.text}`;
        UI.feed.endNarration(told.node, narration);
        if (ctx.defeat.outcome === 'dead') UI.feed.notice(NOTICES.dead, 'error');
      }
      // Step 10. Advance time; World.tick runs for every phase that passes.
      if (!s.player.dead) passTime(action.timeCost, opts.cause || 'turn');
      // Step 11. The due events just narrated are consumed; seeds whose trigger is now met fire and become due events for the next narration.
      if (ctx.due.length) World.dueNarrated(ctx.due);
      if (s.pendingScene) State.apply({ sceneChangeDone: true });
      World.fireSeeds({ turn: s.meta.turn, time: nowTime(), locationId: s.player.locationId, movedFrom: ctx.moved ? ctx.moved.fromId : ctx.location.id, presentNpcIds: State.npcsAt(s.player.locationId).map(n => n.id), targetIds: action.targets.slice() });
      // Retry lock (SPEC section 7): a roll set it in resolve(). An
      // action without a roll lifts it only once the situation has changed:
      // the action took time, time passed or the player moved. An instant
      // look or chat in the same place leaves it on. The ask repeated (SAME
      // ASK AGAIN, ALREADY GRANTED) changes nothing by taking time itself.
      const asked = !!(ctx.pressed || ctx.granted);
      if (!ctx.roll && s.meta.lastRollKey && ((!asked && action.timeCost !== 'instant') || !sameTime(startTime, nowTime()) || s.player.locationId !== startLoc)) State.apply({ lastRollKey: null });
      if (!sameTime(narrTime, nowTime())) UI.feed.divider(s.time.day, s.time.phase);
      // Step 12. Chronicle compression every 10 turns (never fails the turn).
      try { await compressIfDue(); } catch (e) { console.warn('[Pipeline] compression failed', e); }
      if (replaced()) return fail(snap, mark, null, {});
      // Step 13. Log; the autosave and render follow when the batch closes.
      const said = isSay(ctx.speech) ? { mode: 'say', to: ctx.speech.to, toName: ctx.speech.toName, toLabel: ctx.speech.toLabel || null } : ctx.speech ? { mode: 'do' } : {};
      State.apply({ logEntry: Object.assign({ input: opts.input, roll: rollForLog(ctx.roll), narration, day: narrTime.day, phase: narrTime.phase, mock: told.mock }, said) });
      lastTurn = { action, roll: ctx.roll, narration, style: ctx.style, ctx: deepCopy(Object.assign({}, ctx, { packet: undefined })), packet: ctx.packet };
      return { ok: true, defeat: ctx.defeat ? ctx.defeat.outcome : undefined };
    } catch (err) {
      console.error(err);
      return fail(snap, mark, { text: errorText(err), kind: 'error' }, { reason: 'error', restoreInput: true, error: err && err.type });
    } finally {
      turnState = null;
      State.endBatch(); // listeners see the finished turn, or the restored state after a failure
      busy = false;
      UI.setBusy(false);
    }
  }
  function errorText(err) {
    const msg = err instanceof Api.ApiError ? err.message : `Something went wrong: ${(err && err.message) || err}.`;
    return `${msg} Your action was kept in the box.`;
  }
  function rollForLog(r) {
    return r ? { stat: r.stat, d20: r.d20, statValue: r.statValue, modifier: r.modifier, total: r.total, target: r.target, tier: r.tier, complication: r.complication, line: r.line } : null;
  }
  /* /fact: no narration. Save each new entity or link, spend the point. */
  function finishFact(ctx, opts, snap, mark) {
    const s = State.current;
    const p = s.player;
    const statement = cleanText(opts.fact, 200);
    if (!ctx.created.length && !ctx.links.length) {
      const why = ctx.notPresent.some(x => x.person) ? `Nobody like that lives in ${s.meta.townName}: everyone in town is already written, so a story point can make something true about someone here, but it cannot add a person.`
        : ctx.notPresent.some(x => x.reason === 'does_not_exist') ? `That cannot be true in ${s.meta.townName}.` : 'Nothing in that could be made true. Name a person, place or thing in town.';
      return fail(snap, mark, { text: `${why} No story point was spent.` }, { reason: 'fact-refused', restoreInput: true });
    }
    const memory = `Fact (a story point): ${firstPerson(statement, p.name)}`;
    const npcIds = ctx.created.filter(c => c.kind === 'npc').map(c => c.id).concat(ctx.links.filter(c => c.kind === 'npc').map(c => c.id));
    State.apply({
      storyPointsDelta: -1,
      newMemories: npcIds.map(id => ({ npcId: id, text: memory, weight: 3 })),
      npcKnownToPlayer: npcIds,
      journalEntry: `Fact: ${statement}`
    });
    const made = ctx.created.map(c => (c.kind === 'npc' ? `${c.name}, ${c.role}` : c.name));
    const text = `It is now true: ${statement}${made.length ? ` (New: ${made.join('; ')}.)` : ''}`;
    UI.feed.notice(`Story point spent (${p.storyPoints} left). ${text}`);
    State.apply({ logEntry: { input: opts.input, roll: null, narration: text } });
    lastTurn = { action: ctx.action, roll: null, narration: text, style: null, ctx: deepCopy(ctx), packet: null };
    return { ok: true, fact: true };
  }

  // ----- Do / Say -----
  /* The quote shortcut: in Do mode, a line that is only a quote is said
     ("Run.", or say "Run." / I say "Run."), and the words are what is inside
     the quotes. A quote anywhere else in the line ("I shove him and yell
     "Run!"") leaves it a Do line. In Say mode the same rule strips the
     quotes from a quoted line. Returns the words, or null. */
  const QUOTED_LINE = /^(?:(?:i\s+)?say\s*[:,]?\s*)?["“]([^"“”]*)["”]?\s*([.!?…]*)\s*$/i;
  function spokenWords(text) {
    const m = QUOTED_LINE.exec(String(text || '').trim());
    if (!m) return null;
    const words = (m[1].trim() + (m[2] || '')).trim();
    return words || null;
  }
  /* opts: { mode: 'do' | 'say', to: an npc id | 'everyone' } from the
     composer. Returns { mode: 'do' } or { mode: 'say', words, to, toName,
     auto } (auto: a Do line the quote shortcut made a Say line). An
     addressee who is not here falls back to the default: the only person
     present, else everyone. */
  function defaultAddressee(present) { return present.length === 1 ? present[0].id : 'everyone'; }
  function speechFor(text, opts) {
    const o = opts || {};
    const quoted = spokenWords(text);
    if (o.mode !== 'say' && quoted === null) return { mode: 'do' };
    const present = State.current ? State.npcsAt(State.current.player.locationId) : [];
    let to = o.to;
    if (to !== 'everyone' && !present.some(n => n.id === to)) to = defaultAddressee(present);
    const n = to === 'everyone' ? null : State.npc(to);
    return { mode: 'say', words: quoted !== null ? quoted : String(text || '').trim(), to, toName: n ? n.name : null, toLabel: n ? npcLabel(n) : null, auto: o.mode !== 'say' };
  }

  // ----- entry points -----
  /* Returns { ok, restoreInput?, reason? }. restoreInput tells the UI to put
     the player's text back in the box (SPEC.md section 2, errors). opts:
     the composer's { mode, to } (speechFor); commands ignore it. */
  /* Cheat: take back the last turn and play it again with a fresh die,
     ignoring the retry lock. The parsed action is reused (no parser call);
     the narrator and bookkeeper run again on the new result, so it costs a
     narrator and a bookkeeper call. Repeatable without limit. */
  function wantedOutcome(arg) {
    const w = String(arg || '').trim().toLowerCase();
    if (!w) return null;
    if (/^\d+$/.test(w)) return clamp(parseInt(w, 10), 1, 20);
    return TIER_ALIASES[w] ? w : null;
  }
  async function reroll(arg) {
    const want = wantedOutcome(arg);
    if (String(arg || '').trim() && want === null) { UI.feed.notice('Say which outcome: success, partial, fail, crit, fumble, or a number from 1 to 20.'); return { ok: false, reason: 'usage', restoreInput: true }; }
    const s = State.current;
    const entry = s && s.log.length ? s.log[s.log.length - 1] : null;
    const last = lastTurn;
    if (!entry || !entry.roll || !last || !last.action || !last.action.needsRoll || (last.ctx && last.ctx.mode === 'arrival')) {
      if (want !== null) {
        hooks.nextTier = want;
        UI.feed.notice(`Cheat armed: your next roll will be ${Number.isInteger(want) ? 'a ' + want : /^(fail|failure|lose)$/.test(want) ? 'a failure' : /^(crit|critical|nat20)$/.test(want) ? 'a natural 20' : /^(fumble|botch|nat1)$/.test(want) ? 'a natural 1' : /^partial$/.test(want) ? 'a partial success' : 'a success'}.`);
        return { ok: true };
      }
      UI.feed.notice(NOTICES.noReroll);
      return { ok: false, reason: 'no-roll' };
    }
    if (want !== null) hooks.nextTier = want;
    const input = entry.input;
    const speech = entry.mode === 'say' ? { mode: 'say', to: entry.to, toName: entry.toName, toLabel: entry.toLabel || null } : (entry.mode === 'do' ? { mode: 'do' } : null);
    const mode = last.ctx && last.ctx.mode === 'zoom' ? 'zoom' : 'normal';
    if (!State.restore()) { UI.feed.notice('There is nothing to take back, so nothing to reroll.'); return { ok: false, reason: 'nothing' }; }
    World.forget(State.current.meta.turn);
    hooks.diceSalt = (hooks.diceSalt || 0) + 1;
    UI.rebuildFeed();
    return runTurn({ input, mode, speech, action: last.action, reroll: true, prepare: () => UI.feed.quiet('Rerolled.') });
  }

  async function submit(rawText, opts) {
    const text = String(rawText || '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    if (busy) return { ok: false, reason: 'busy', restoreInput: true };
    if (!State.current) return { ok: false, reason: 'no game' };
    // Step 2. Commands are handled in code (some of them run a turn below).
    if (text.startsWith('/')) return Commands.run(text);
    if (State.current.player.dead) { UI.feed.notice(NOTICES.dead); return { ok: false, reason: 'dead' }; }
    const speech = speechFor(text, opts);
    if (isSay(speech)) return runTurn({ input: speech.words, mode: 'normal', speech: { mode: 'say', to: speech.to, toName: speech.toName, toLabel: speech.toLabel || null } });
    return runTurn({ input: text, mode: 'normal', speech: { mode: 'do' } });
  }
  /* A beat: the player says and does nothing and lets the scene come to them.
     Costs a short (a few minutes); the people here act, speak or react. */
  function pass() {
    return runTurn({
      input: 'You wait and see.', mode: 'normal', beat: true, speech: { mode: 'do' },
      action: () => {
        const st = State.current;
        const ids = State.npcsAt(st.player.locationId).map(n => n.id);
        return { actionType: 'wait', summary: `${st.player.name} says nothing and waits to see what ${ids.length ? 'the people here do' : 'happens'}`, targets: ids, needsRoll: false, timeCost: 'short', declaresWorldFact: false };
      }
    });
  }
  function look() {
    return runTurn({ input: '/look', mode: 'zoom', bookkeep: false, action: () => ({ actionType: 'look', summary: `${State.current.player.name} takes in the whole scene`, targets: [], needsRoll: false, timeCost: 'instant' }) });
  }
  function zoom(text) { return runTurn({ input: `/zoom ${text}`, parse: text, mode: 'zoom', speech: { mode: 'do' } }); }
  function fact(statement) {
    if (State.current.player.storyPoints < 1) {
      UI.feed.notice('You have no story points to spend. You earn them when a thread is resolved or on a natural 20.');
      return { ok: false, reason: 'no-points', restoreInput: true };
    }
    return runTurn({ input: `/fact ${statement}`, parse: statement, fact: statement, mode: 'normal' });
  }
  function rest() {
    return runTurn({
      input: '/rest', mode: 'normal', bookkeep: false, cause: 'rest',
      prepare: ctx => {
        const t = passTime('rest', 'rest');
        ctx.timePassed = `the player slept until morning, day ${State.current.time.day}${t && t.healed ? `, and recovered ${t.healed} HP` : ''}`;
      },
      action: () => ({ actionType: 'rest', summary: `${State.current.player.name} wakes after a night's sleep`, targets: [], needsRoll: false, timeCost: 'instant' })
    });
  }
  function wait(arg) {
    const phase = phaseWord(arg);
    if (!phase) { UI.feed.notice('Wait until when? Try /wait evening (morning, afternoon, evening or night).'); return { ok: false, reason: 'usage', restoreInput: true }; }
    if (phase === State.current.time.phase) { UI.feed.notice(`It is already ${phase}.`); return { ok: false, reason: 'same-phase' }; }
    return runTurn({
      input: `/wait ${arg}`, mode: 'normal', bookkeep: false, cause: 'wait',
      prepare: ctx => {
        const n = phaseSteps(phase);
        for (let i = 0; i < n; i++) passTime('long', 'wait');
        ctx.timePassed = `the player waited where they are until ${phase}`;
      },
      action: () => ({ actionType: 'wait', summary: `${State.current.player.name} waits until ${phase}`, targets: [], needsRoll: false, timeCost: 'instant' })
    });
  }
  /* "/skip to the docks at night": a known place (by name or kind) and/or a
     phase. Code moves time a phase at a time (World.tick each), moves the
     player, then the narrator describes the arrival. A skip to a place with
     no phase takes a short; one that names the phase it already is arrives
     in that phase (no time passes), so a late short never carries it over. */
  function skipGoal(goal) {
    const s = State.current;
    const lower = ' ' + String(goal || '').toLowerCase() + ' ';
    const known = s.locations.filter(l => l.discovered);
    let loc = known.find(l => lower.includes(l.name.toLowerCase().replace(/^the /, ''))) || null;
    if (!loc) loc = placeByPhrase(lower, known);
    return { location: loc, phase: phaseWord(goal) };
  }
  function skip(goal) {
    const s = State.current;
    const g = skipGoal(goal);
    if (!g.location && !g.phase) {
      UI.feed.notice('Skip to where, or when? Try /skip to the docks at night.');
      return { ok: false, reason: 'usage', restoreInput: true };
    }
    if (g.location && g.location.closed) { UI.feed.notice(`${g.location.name} is closed.`); return { ok: false, reason: 'closed', restoreInput: true }; }
    if (!g.location && g.phase === s.time.phase) { UI.feed.notice(`It is already ${g.phase}.`); return { ok: false, reason: 'same-phase' }; }
    if (g.location && g.location.id === s.player.locationId && (!g.phase || g.phase === s.time.phase)) {
      UI.feed.notice(`You are already at ${g.location.name}.`);
      return { ok: false, reason: 'already-there' };
    }
    return runTurn({
      input: `/skip ${goal}`, mode: 'arrival', bookkeep: false, cause: 'skip',
      prepare: ctx => {
        const steps = g.phase ? phaseSteps(g.phase) : 0;
        if (!g.phase) passTime('short', 'skip');
        for (let i = 0; i < steps; i++) passTime('long', 'skip');
        if (g.location) State.apply({ playerLocationId: g.location.id });
        const st = State.current;
        ctx.timePassed = `the player skipped ahead to ${here().name}, ${st.time.phase} of day ${st.time.day}`;
      },
      action: () => ({ actionType: 'move', summary: `${State.current.player.name} arrives at ${here().name}`, targets: [], needsRoll: false, timeCost: 'instant' })
    });
  }
  /* The first narration of a game (MODE arrival), used when mock mode is off
     and a key is set. Same discipline as runTurn: one batch (one autosave),
     and a refusal or failure takes the arrival's changes and feed lines back
     out before the notice and the local opening text. The snapshot is a
     private copy, not an /undo step. */
  async function arrival() {
    const s = State.current;
    if (!s || busy) return { ok: false };
    busy = true;
    UI.setBusy(true);
    Api.beginTurn();
    const snap = JSON.stringify(s);
    const mark = UI.feed.mark();
    State.beginBatch();
    turnState = s;
    try {
      let narration = null;
      let mock = false;
      let notice = null;
      try {
        const bg = BACKGROUNDS.find(b => b.id === s.player.backgroundId);
        const ctx = { input: '', mode: 'arrival', roll: null, created: [], notPresent: [], links: [], due: [] };
        ctx.action = normaliseParse({ actionType: 'move', summary: `${s.player.name} arrives in ${s.meta.townName} for the first time, ${bg && bg.arrival === 'docks' ? 'arriving by the river' : 'arriving by the road'}, at ${here().name}`, targets: [], timeCost: 'instant' });
        // Why they came, so the opening can hint at it (set after normaliseParse, whose 200-character cap would cut it).
        const goal = cleanText(s.player.goal, 200);
        if (goal) ctx.action.summary += `. Why they came (the opening may hint at it; nobody here knows it): ${asSentence(goal)}`;
        scene(ctx);
        ctx.due = World.dueSeeds({ turn: s.meta.turn, time: nowTime(), locationId: ctx.location.id, presentNpcIds: ctx.presentIds, targetIds: [], mode: 'arrival' }) || [];
        if (ctx.due.length) scene(ctx);
        const told = await narrate(ctx);
        if (State.current !== s) return { ok: false, reason: 'replaced' };
        if (told.refusal) notice = { text: NOTICES.refused };
        else { narration = told.narration; mock = told.mock; if (ctx.due.length) World.dueNarrated(ctx.due); if (s.pendingScene) State.apply({ sceneChangeDone: true }); }
      } catch (err) {
        console.error(err);
        if (State.current !== s) return { ok: false, reason: 'replaced' };
        notice = { text: `${err instanceof Api.ApiError ? err.message : 'The narrator could not be reached.'} The arrival below is the game's own text.`, kind: 'error' };
      }
      const local = narration === null;
      if (local) {
        State.restore(snap);
        UI.feed.rollback(mark);
        if (notice) UI.feed.notice(notice.text, notice.kind);
        narration = Town.openingScene(State.current);
        UI.feed.narration(narration);
      }
      const t = State.current.time;
      noteIntroductions(narration, State.current.player.locationId);
      noteMentioned(narration);
      State.apply({ logEntry: { input: '', roll: null, narration, day: t.day, phase: t.phase, mock } });
      return { ok: !local, local };
    } finally {
      turnState = null;
      State.endBatch();
      busy = false;
      UI.setBusy(false);
    }
  }
  /* /cheat time <phase> [day] (also /cheat night, /cheat morning 2): the
     clock set outright through State.apply({ setTime }), at the start of
     that phase (shorts 0), the day unchanged unless given. No world tick
     and no narration; the feed shows the new day and phase and a quiet
     line. One /undo step (nothing is kept when the clock is already there). */
  function setClock(phase, dayArg) {
    const s = State.current;
    if (!PHASES.includes(phase)) { UI.feed.notice('Set the clock to which phase? Try /cheat time night (morning, afternoon, evening or night), or /cheat morning 2 for a day too.'); return { ok: false, reason: 'usage', restoreInput: true }; }
    const day = dayArg === undefined || dayArg === null ? s.time.day : dayArg;
    if (!Number.isInteger(day) || day < 1) { UI.feed.notice('The day must be 1 or more.'); return { ok: false, reason: 'usage', restoreInput: true }; }
    const snap = State.snapshot();
    const r = State.apply({ setTime: { day, phase, shorts: 0, late: false } });
    if (r.rejected.length) { State.restore(snap); UI.feed.notice(`The clock was not changed: ${r.rejected[0].reason}.`); return { ok: false, reason: 'rejected' }; }
    if (JSON.stringify(State.current) === snap) { State.restore(snap); UI.feed.notice(`The clock is already at day ${day}, ${phase}.`); return { ok: false, reason: 'same-time' }; }
    UI.feed.divider(day, phase);
    UI.feed.quiet(`Clock set to day ${day}, ${phase}.`);
    return { ok: true, time: deepCopy(State.current.time) };
  }
  /* Bring the loaded game up to the current rules (Upgrade.pending: the
     steps newer than the game, or at the current version the ones that
     re-read it). Like a turn: the composer is busy, the feed says what is
     happening, and it is all one State batch (one autosave, one render)
     after one snapshot, which stays as an /undo step when something changed.
     A refusal or an error restores the state exactly and the feed says why;
     the API's own words are in the debug view. Resolves to { ok, summaries,
     from, to, changed } or { ok: false, reason }. */
  async function updateGame() {
    const s = State.current;
    if (!s || State.muted) return { ok: false, reason: 'no game' };
    if (busy) return { ok: false, reason: 'busy' };
    busy = true;
    UI.setBusy(true);
    Api.beginTurn();
    const from = State.rulesVersion(s);
    const steps = Upgrade.pending(s);
    const clock0 = { day: s.time.day, phase: s.time.phase };
    UI.feed.notice(Upgrade.NOTICES.start);
    const snap = State.snapshot();
    State.beginBatch();
    turnState = s;
    try {
      const summaries = [];
      for (const m of steps) {
        const sum = await m.run(s, Api);
        if (State.current !== s) return { ok: false, reason: 'replaced' };
        const r = State.apply({ rulesVersion: Math.max(m.version, State.rulesVersion(s)) });
        if (r.rejected.length) throw new Error(r.rejected[0].reason);
        summaries.push(Object.assign({ version: m.version, title: m.title }, sum));
      }
      const to = State.rulesVersion(State.current);
      const text = summaries.map(x => x.text).join(' ');
      // Nothing changed (a re-read that kept every line): not worth an /undo step.
      const changed = JSON.stringify(State.current) !== snap;
      if (!changed) State.restore(snap);
      State.debugLog.push({ turn: State.current.meta.turn, kind: 'upgrade', reason: `rules ${from} -> ${to}: ${text}` });
      UI.feed.notice(text);
      // The clock was set back (version 4): the feed starts the new day and phase.
      const t = State.current.time;
      if (t.day !== clock0.day || t.phase !== clock0.phase) UI.feed.divider(t.day, t.phase);
      return { ok: true, summaries, from, to, changed };
    } catch (err) {
      if (State.current !== s) return { ok: false, reason: 'replaced' };
      State.restore(snap);
      if (err && err.refused) {
        State.debugLog.push({ turn: State.current.meta.turn, kind: 'upgrade', reason: `refused${err.refusal && err.refusal.category ? ` (${err.refusal.category})` : ''}` });
        UI.feed.notice(Upgrade.NOTICES.refused);
        return { ok: false, reason: 'refused' };
      }
      console.error(err);
      State.debugLog.push({ turn: State.current.meta.turn, kind: 'upgrade', reason: `failed: ${(err && (err.type ? `${err.type}: ` : '') + (err.detail || err.message)) || err}` });
      const msg = err instanceof Api.ApiError ? err.message : `Something went wrong: ${(err && err.message) || err}.`;
      UI.feed.notice(`${msg} ${Upgrade.NOTICES.failed}`, 'error');
      return { ok: false, reason: 'error', error: err && err.type };
    } finally {
      turnState = null;
      State.endBatch();
      busy = false;
      UI.setBusy(false);
    }
  }
  return { noteIntroductions, reroll, pickMemories, pass, updateGame, setClock,
    submit, runTurn, look, zoom, skip, rest, wait, fact, arrival,
    speechFor, spokenWords, defaultAddressee, sayAction, SAY_TYPES,
    normaliseParse, parsePacket, narratorPacket, bookkeeperPacket, checkAndCreate, pickRumour, wouldKnow, newsHeard, compressIfDue, passTime, castBlock, townBlock, parserBlock, bookkeeperBlock, usualPlaces, tieWords, hasWords, CAST_RULE,
    noteMentioned, awayTarget, awayLine, carriedAs, carryingLine, notCarriedLine,
    ACTION_TYPES, NOTICES, hooks,
    forceNextRoll(d20) { hooks.nextD20 = Number.isInteger(d20) ? clamp(d20, 1, 20) : null; },
    get busy() { return busy; },
    get lastTurn() { return lastTurn; }
  };
})();

