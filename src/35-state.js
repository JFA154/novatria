// ===== Module: State =====
/* The game state is one JSON object (SPEC.md section 3 plus the additions in
   BUILD_PLAN.md). State.apply(diff) is the only writer once a game exists.

   apply(diff, { source }) accepts:
   - the bookkeeper's record_changes shape (SPEC.md section 10),
   - effects: [{ op, ... }] using the effect-op table in BUILD_PLAN.md,
   - engine-only fields (source 'engine', the default): addNpcs, addLocations,
     addItems ([{ locationId, item }]: things noticed in a place, which
     itemsGained can then pick up), conditionsRemoved, storyPointsDelta,
     lastRollKey (a new or cleared key drops meta.lastRoll unless the same
     diff brings it), lastRoll (Dice.lockRecord: what the roll under
     lastRollKey was; null clears it), beginTurn, advanceTime, setTime ({ day, phase, shorts,
     late }: the clock set outright, /cheat time and Upgrade version 4; no
     phase passes, so nothing ticks), logEntry, seedsFired,
     chronicleEntry, weather, addLooseEnd, defeat ({ outcome }), and the
     living world's own (milestone 4, written by World): clockFill
     ([{ factionId, delta }]: a faction's roll, no per-turn limit), clockNext
     ([factionId]: start the next clock in sequence), dueAdd ([{ seedId, text,
     npcId?, bring? }]: a fired seed waiting for narration), dueDone
     ([seedId]: narrated or dropped), visits ([{ npcId, locationId }]: the NPC
     is there for the current day and phase only, whatever their schedule
     says), npcHome ([{ npcId, locationId, phases }]: a schedule for an NPC
     who had none), rumourToldBy ([{ rumourId, npcId }]: who told the
     player a heard rumour, when it was not its source), rumourSpread
     ([{ rumourId, npcIds }]: people who heard a rumour this morning, added
     to its knownBy; only the free can learn) and journalNews ([{ text }]:
     a line the engine writes in the journal, { turn, day, text, kind:
     'news' }, never twice the same; the model's journalEntry stays the
     model's); and Upgrade's own:
     setMemories ([{ npcId, memories: [{ turn, text, weight }] }]: a person's
     memories replaced outright, in the order given, at most MEMORY_MAX),
     fixPeople ([{ npcId, name?, pronouns?, role?, look?, voice?,
     relationToNpcId?, relation?, homeLocationId? }]: a person's record
     corrected to match the story, version 5; fields left out or null are
     kept, memories and the id always are) and rulesVersion (the rules the
     game has been brought up to); and the player's own (source 'player',
     App.editPerson from the People card's editor and /edit): editPerson
     ({ npcId, name?, pronouns?, role?, look?, voice?, personality?, goal?,
     secret?, attitude?, relationToNpcId?, relation?, homeLocationId?,
     status?, alive?, memories? }, or a list of them: anything about a
     person, town people and made people alike). Everything is checked
     first (name 2-40 and not taken, pronouns, role 1-60, look and voice
     200, goal 200, secret 300, personality 0-3 traits of 30, attitude a
     whole number clamped to -100..100 with no per-turn limit, a living
     other person or null for the relation (30, cleanRelation; a relation
     word alone applies to the person already on record), a known place or
     null for the home, a status of NPC_STATUSES, memories as setMemories
     with text refused over 400); only what differs changes. New pronouns
     turn a gendered relation, role, tag, look and voice with them, unless
     the edit states those. A null home takes them off the home's phases
     and clears home; a place moves them in (setHome). Dead or gone takes
     them off every schedule, arrested puts them in the cells, free brings
     them back alive to the town's schedule or their home. A relation on
     someone without created gives them created { turn: null, day: null,
     by: 'edit', relationToNpcId, relation }, cleared again with it.
     result.edited lists { id, fields } (EDIT_FIELDS order).
   A logEntry also notes who the player saw: state.seen[npcId] = { locationId,
   day, phase, turn } for everyone present with them in the narrated scene
   (People: "Last seen"). Display only; no model ever reads it.
   With { source: 'model' } only the record_changes fields are accepted, so a
   bookkeeper reply can never plant effects or touch time.
   placesRevealed ([{ name, type, description, nearId, ownerNpcId, kind,
   byNpcId?, turn?, day? }]: a place someone in the narration named that is
   not in the town yet) is the one record_changes field that creates an
   entity: validated, refused when it duplicates a place by name, at most
   LIMITS.placesPerTurn from the model in a turn (the engine, Upgrade's
   re-read, is not held to that) and LIMITS.revealedPlaces in a game. It
   becomes a discovered location with an exit to and from nearId, map
   coordinates chosen now beside nearId (revealSpot), and `revealed`
   ({ turn, day, byNpcId, ownerNpcId, kind, visited }); someone's home also
   holds its owner in every phase they are scheduled nowhere. turn and day
   are taken only from the engine. result.revealed lists the new ids.
   peopleRevealed ([{ name, pronouns, relationToNpcId, who }] from the
   bookkeeper, read into the long form [{ name, unnamed, pronouns, role,
   look, relationToNpcId, relation, locationId, kind, byNpcId? }], which the
   engine and tests may send as is: a specific person someone in the
   narration named, by name or by a clear relation, who is not in the game
   yet) is the other: validated (name 2 to 40 characters, pronouns he, she
   or they, a known relation target and place), refused when it is someone
   already here by name (samePerson) or by the same relation to the same
   person, at most LIMITS.peoplePerTurn from the model in a turn and
   LIMITS.revealedPeople in a game. An unnamed one ("Dewayne's wife",
   unnamed true) is replaced in place when a later entry names them with the
   same relationToNpcId and relation: the name changes, the id stays. A new
   one becomes npc_<slug> with knownToPlayer false, status free, attitude 0,
   no memories, tags from kind and relation, empty voice, goal and secret,
   pronouns, and created { turn, day, by: 'story', relationToNpcId,
   relation, locationId, byNpcId }; a wife, husband, partner or child
   (HOUSEHOLD_RELATIONS) shares the home of the person they are related to
   (a home someone told the player about, or one of the dwelling types) in
   every phase no schedule holds them, otherwise they have no schedule and
   are off-screen until met. A home revealed later takes them in then.
   result.people lists { id, named, renamed }.
   Every NPC carries pronouns (he, she or they): addNpcs takes them or reads
   them from the role and look, then the first name. Engine-made people
   carry created { turn, day, by } (CREATED_BY). A save from before pronouns
   gets them at load (fillPronouns).
   The cast (rules version 6): every person is written by hand in TOWN_DATA,
   with relations ([{ npcId, relation }]: "npcId is this person's
   relation", written on both sides) and a home (a location; in state
   { locationId, phases }). A new game has meta.castFixed; with it the
   model's peopleRevealed is refused ("the cast is fixed"), and nothing in
   the engine makes a person in play (Pipeline step 4 and the loose ends bind
   to the cast). tiesOf(n) reads both kinds of relation: the authored lists
   and a made person's created relation. A placesRevealed entry that names
   a cast member's home, or any place the player has not discovered yet,
   discovers that place (with the same revealed record and "heard of"
   marker) instead of making a second one. Upgrade version 6's own ops:
   addCast ({ locations, npcs }: town records missing by id, added as a new
   game would have them, exits both ways), mergePlaces ([{ fromId, intoId
   }]: a home someone told the player about folded into the authored home it
   was: schedules, homes, visits, seen, seeds and the player move over, the
   told place goes), castSchedules ([{ locationId, phase, npcId }]: a
   schedule entry, unless they are already somewhere in that phase),
   mergePeople ([{ fromId, intoId }]: a person the game made up merged onto
   the cast member they were: the cast member keeps their own record and
   takes over the made-up person's knownToPlayer, attitude, memories and
   every reference to them; the made-up record goes) and castFixed (true).
   result.merged lists { fromId, intoId, from } for each person merged.
   Upgrade version 7's: livedIn ({ town }: the ages, histories, presence,
   death or whereabouts, places' details, hours, history, other names and
   away flag, and the player's age that an older game lacks, filled in from
   the town data and never overwritten; result.livedIn counts them). A place
   out of town (away) is never a playerLocationId or a visit. editPerson
   also takes age (a whole number 0 to 120, null to clear) and history
   (text, at most 400).
   Every rumour carries knownBy (direction change 12): the ids of the people
   who know it, its source first, then for a faction's news (factionId) the
   faction's free members, then anyone an engine rumour names; World adds
   to it each morning (rumourSpread) and Pipeline.wouldKnow reads it. A save
   from before gets it at load (fillKnownBy). rumoursHeard lists the
   rumours it marks heard in result.heard.
   Seeds are events (direction change 14): an engine seed (plantSeed, and
   the town's own seeds) may carry effects, a list of effect ops checked when
   it is planted (seedEffects: known op, its fields, ids that exist) and run
   by World.fire when it fires live, and notBeforeTurn (it waits until that
   turn; the first loose end's hook). The model's newSeeds keep neither: any
   effects it sends are left out. Two effect ops serve them: visit ({ npcId,
   locationId }: there for the current day and phase, as a visits entry;
   never out of the scene the player is in) and placeItem ({ locationId,
   item: { name, qty?, notes? } }: a scene item).
   Work and trouble (direction change 16): the fight effect op ({ npcId,
   reason?, seedId? }: someone will come at the player; it waits in
   state.fights, [{ id, npcId, reason?, seedId?, day, turn }], for
   Pipeline to resolve, and is a no-op for someone not free or already
   waiting) and two engine-only ops: fightDone ([id]: a waiting fight
   resolved or dropped) and workDone ({ jobId, outcome }: state.work[jobId]
   = { day, turn, times, outcome }, the cooldown Town.jobRefusal reads).
   journalNews takes kind 'work' for a job's line, which may repeat on
   another turn.
   Returns { applied: [string], rejected: [{ path, reason }], time?, revealed?, people?, merged?, livedIn?, heard? }. */
const State = (() => {
  let current = null;
  let town = null;
  let muted = false;
  const undo = [];
  const UNDO_MAX = 20;
  const LOG_MAX = 30;
  const MEMORY_MAX = 12; // per person; the oldest, lightest go first (State.apply newMemories)
  const MEMORY_TEXT_MAX = 120;
  const MEMORY_STALE_TURNS = 30; // weight-1 memories older than this are forgotten when a new one arrives
  /* The rules a game has been brought up to: meta.rulesVersion (a save
     without it reads as 1, see rulesVersion()). A new game starts at
     RULES_VERSION. When the rules change in a way an older game should catch
     up with, bump it and add the step to Upgrade.MIGRATIONS. 2: "Memories
     that matter" (short memories, only what a person would hold against the
     player or thank them for). 3: "Places people told you about" (a place
     someone named becomes a place on the map, placesRevealed). 4: "Clock
     follows the story" (night holds until the player sleeps; a clock that
     ran ahead of its story is set back, setTime). 5: "People match the
     story" (every person has pronouns; people the story names become real,
     peopleRevealed; someone the game made up before the story said who they
     were is corrected, fixPeople). 6: "A full cast" (every person is
     written by hand in TOWN_DATA and the game never makes one; an older game
     gains the cast and the homes it lacks, and the people it made up are
     merged onto the cast members they were: addCast, mergePlaces,
     castSchedules, mergePeople, castFixed). 7: "A lived-in town" (everyone
     the story names is a record, the dead and the far away included, with
     an age and a history; places have a history, details and hours; the
     places out of town exist but are never a destination; the player has
     an age: addCast, livedIn). */
  const RULES_VERSION = 7;
  const DEBUG_MAX = 200;
  const listeners = [];
  const debugLog = [];
  let ledger = freshLedger(-1);
  let batchDepth = 0;
  let dirty = false;

  const RECORD_KEYS = ['attitudeChanges', 'newMemories', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'conditionsAdded',
    'playerLocationId', 'npcKnownToPlayer', 'threadUpdates', 'clockNudges', 'newSeeds', 'rumoursHeard', 'placesRevealed', 'peopleRevealed', 'journalEntry'];
  const ENGINE_KEYS = ['addLocations', 'addNpcs', 'addItems', 'effects', 'conditionsRemoved', 'storyPointsDelta', 'lastRollKey', 'lastRoll', 'beginTurn',
    'advanceTime', 'setTime', 'logEntry', 'seedsFired', 'chronicleEntry', 'weather', 'addLooseEnd', 'defeat',
    'clockFill', 'clockNext', 'dueAdd', 'dueDone', 'visits', 'npcHome', 'rumourToldBy', 'rumourSpread', 'journalNews', 'setMemories', 'fixPeople', 'editPerson', 'rulesVersion', 'sceneChange', 'sceneChangeDone',
    'workDone', 'fightDone',
    'addCast', 'recastPeople', 'mergePlaces', 'castSchedules', 'mergePeople', 'castFixed', 'livedIn'];
  // Where an engine-planted seed came from (World reads it for grudges and favours).
  const SEED_ORIGINS = ['grudge', 'favour', 'loose_end', 'clock', 'town'];
  const DEFEAT_OUTCOMES = ['robbed', 'captured', 'gutter', 'rescued', 'dead'];
  const LIMITS = { attitudePerTurn: 25, seedsPerTurn: 2, clockPerTurn: 1, storyPoints: 3, placesPerTurn: 1, revealedPlaces: 12, peoplePerTurn: 1, revealedPeople: 12 };
  // Content note 7: setFlag may never overwrite these (they have their own writers).
  const RESERVED_FLAGS = Object.freeze(['priceMultiplier', 'weather', 'season']);

  function freshLedger(turn) { return { turn, attitude: {}, clocks: {}, seeds: 0, places: 0, people: 0 }; }
  function syncLedger() { if (current && ledger.turn !== current.meta.turn) ledger = freshLedger(current.meta.turn); }

  class Reject extends Error {}
  function bad(reason) { throw new Reject(reason); }

  // ----- lookups -----
  function find(list, id) { return typeof id === 'string' && Array.isArray(list) ? (list.find(x => x.id === id) || null) : null; }
  function npc(id) { return current ? find(current.npcs, id) : null; }
  function loc(id) { return current ? find(current.locations, id) : null; }
  function faction(id) { return current ? find(current.factions, id) : null; }
  function thread(id) { return current ? find(current.threads, id) : null; }
  function seed(id) { return current ? find(current.seeds, id) : null; }
  function rumour(id) { return current ? find(current.rumours, id) : null; }
  function entityById(id) {
    if (!current || typeof id !== 'string') return null;
    switch (id.split('_')[0]) {
      case 'npc': return npc(id);
      case 'loc': return loc(id);
      case 'fac': return faction(id);
      case 'thr': return thread(id);
      case 'seed': return seed(id);
      case 'rum': return rumour(id);
      case 'item': return find(current.player.inventory, id) || sceneItem(id); // carried, or lying where the player is
      case 'cond': return find(current.player.conditions, id);
      default: return null;
    }
  }
  const needNpc = id => npc(id) || bad(`unknown npc id "${id}"`);
  const needLoc = id => loc(id) || bad(`unknown location id "${id}"`);
  const needFaction = id => faction(id) || bad(`unknown faction id "${id}"`);
  const needThread = id => thread(id) || bad(`unknown thread id "${id}"`);

  // ----- schedules -----
  function phasesOf(v) {
    if (v === 'all' || v === undefined || v === null) return PHASES.slice();
    if (Array.isArray(v) && v.length && v.every(p => PHASES.includes(p))) return Array.from(new Set(v));
    return null;
  }
  function removeFromSchedules(npcId, phases) {
    for (const l of current.locations) {
      const sch = l.npcIdsBySchedule || (l.npcIdsBySchedule = {});
      for (const p of phases || PHASES) if (Array.isArray(sch[p])) sch[p] = sch[p].filter(x => x !== npcId);
    }
  }
  function addToSchedule(l, phase, npcId) {
    const sch = l.npcIdsBySchedule || (l.npcIdsBySchedule = {});
    if (!Array.isArray(sch[phase])) sch[phase] = [];
    if (!sch[phase].includes(npcId)) sch[phase].push(npcId);
  }
  function restoreSchedule(n) {
    removeFromSchedules(n.id);
    let placed = false;
    if (town && Array.isArray(town.locations)) {
      for (const tl of town.locations) {
        for (const p of PHASES) {
          const ids = (tl.npcIdsBySchedule && tl.npcIdsBySchedule[p]) || [];
          const l = loc(tl.id);
          if (ids.includes(n.id) && l) { addToSchedule(l, p, n.id); placed = true; }
        }
      }
    }
    if (!placed && n.home && loc(n.home.locationId)) n.home.phases.forEach(p => addToSchedule(loc(n.home.locationId), p, n.id));
    // A home someone told the player about (placesRevealed) holds them again in the phases it filled, where nothing else does.
    const told = placed && n.home && n.home.revealed ? loc(n.home.locationId) : null;
    if (told) for (const p of n.home.phases) if (!current.locations.some(x => ((x.npcIdsBySchedule || {})[p] || []).includes(n.id))) addToSchedule(told, p, n.id);
  }

  // ----- normalisers (validate fully, then return a clean object) -----
  function normaliseThread(t) {
    if (!isObj(t)) bad('thread must be an object');
    if (typeof t.id !== 'string' || !ID_RE.thr.test(t.id)) bad('thread id must look like thr_name');
    if (thread(t.id)) bad(`thread id "${t.id}" already exists`);
    const title = cleanText(t.title, 120);
    if (!title) bad('thread needs a title');
    const status = t.status === undefined || t.status === null ? 'open' : t.status;
    if (!THREAD_STATUSES.includes(status)) bad('thread status must be open, resolved or failed');
    const linked = Array.isArray(t.linkedIds) ? t.linkedIds : [];
    for (const id of linked) if (!entityById(id)) bad(`unknown linked id "${id}"`);
    return { id: t.id, title, summary: cleanText(t.summary, 400), status, knownToPlayer: t.knownToPlayer === true, linkedIds: linked.slice() };
  }
  function normaliseRumour(r) {
    if (!isObj(r)) bad('rumour must be an object');
    if (typeof r.id !== 'string' || !ID_RE.rum.test(r.id)) bad('rumour id must look like rum_name');
    if (rumour(r.id)) bad(`rumour id "${r.id}" already exists`);
    const text = cleanText(r.text, 300);
    if (!text) bad('rumour needs text');
    if (r.sourceNpcId !== null && r.sourceNpcId !== undefined) needNpc(r.sourceNpcId);
    if (r.knownBy !== undefined && r.knownBy !== null) {
      if (!Array.isArray(r.knownBy)) bad('knownBy must be a list of npc ids');
      r.knownBy.forEach(needNpc);
    }
    // Rumours added during play are news (Pipeline.pickRumour offers them first);
    // one a faction's clock added also carries that faction (its members know it).
    const out = { id: r.id, text, true: r.true !== false, sourceNpcId: r.sourceNpcId || null, heard: r.heard === true, addedTurn: current.meta.turn, addedDay: current.time.day };
    if (typeof r.factionId === 'string' && faction(r.factionId)) out.factionId = r.factionId;
    out.knownBy = firstKnowers(out, current.npcs, r.knownBy);
    return out;
  }
  /* Who knows a rumour to begin with (direction change 12): its source,
     then, for a faction's news, the faction's free members (the people
     wouldKnow always let tell it), then anyone else given; each once, and
     only people in the game. World's morning spread adds the rest. */
  function firstKnowers(r, npcs, extra) {
    const list = Array.isArray(npcs) ? npcs : [];
    const ids = [];
    const add = id => { if (typeof id === 'string' && !ids.includes(id) && list.some(n => isObj(n) && n.id === id)) ids.push(id); };
    add(r.sourceNpcId);
    if (r.factionId) for (const n of list) if (isObj(n) && n.factionId === r.factionId && n.alive !== false && n.status === 'free') add(n.id);
    if (Array.isArray(extra)) extra.forEach(add);
    return ids;
  }
  function normaliseSeed(raw, requireAhead) {
    if (!isObj(raw)) bad('seed must be an object');
    const effect = cleanText(raw.effect, 400);
    if (!effect) bad('seed needs an effect');
    const tr = isObj(raw.trigger) ? raw.trigger : { type: raw.triggerType, value: raw.triggerValue };
    const day = current.time.day;
    let value = tr.value;
    switch (tr.type) {
      case 'day':
        value = toInt(value);
        if (value === null) bad('a day trigger needs a day number');
        if (requireAhead && value < day + 1) bad(`trigger must be at least 1 day ahead (today is day ${day}, trigger is day ${value})`);
        break;
      case 'location': needLoc(value); break;
      case 'npc': needNpc(value); break;
      case 'clock': {
        const m = /^(fac_[a-z0-9_]+):(\d+)$/.exec(String(value));
        if (!m) bad('a clock trigger value must look like fac_name:3');
        needFaction(m[1]);
        const n = parseInt(m[2], 10);
        if (n < 1 || n > 12) bad('clock trigger segment out of range');
        value = `${m[1]}:${n}`;
        break;
      }
      default: bad('trigger type must be day, location, npc or clock');
    }
    // Engine seeds only: what the seed changes when it fires, checked before anything is planted.
    const effects = !requireAhead && raw.effects !== undefined && raw.effects !== null ? seedEffects(raw.effects) : [];
    let id = typeof raw.id === 'string' && ID_RE.seed.test(raw.id) ? raw.id : `seed_t${current.meta.turn}`;
    id = uniqueId(id, x => !!seed(x));
    const out = { id, cause: cleanText(raw.cause, 300) || 'unrecorded', effect, trigger: { type: tr.type, value }, fired: false, hidden: raw.hidden !== false };
    let notBefore = toInt(raw.notBeforeDay);
    if (requireAhead && tr.type !== 'day') notBefore = Math.max(notBefore || 0, day + 1);
    if (notBefore) out.notBeforeDay = notBefore;
    // Engine seeds only (never the bookkeeper's): who and what planted it, the
    // turn it waits for (the first loose end's hook on day 1) and its effects.
    if (!requireAhead) {
      if (isObj(raw.origin) && SEED_ORIGINS.includes(raw.origin.kind)) {
        out.origin = { kind: raw.origin.kind };
        if (typeof raw.origin.npcId === 'string' && npc(raw.origin.npcId)) out.origin.npcId = raw.origin.npcId;
        if (Number.isInteger(raw.origin.template)) out.origin.template = raw.origin.template;
      }
      const notBeforeTurn = toInt(raw.notBeforeTurn);
      if (notBeforeTurn !== null && notBeforeTurn >= 1) out.notBeforeTurn = notBeforeTurn;
      if (effects.length) out.effects = effects;
    }
    return out;
  }
  /* A seed's effects (direction change 14): effect ops that World.fire runs
     through EFFECTS when the seed fires live. Checked when the seed is
     planted the way the town check reads clock effects: a known op, the
     fields it needs and ids that exist (a thread an earlier effect in the
     list opens counts), at most SEED_EFFECTS_MAX. One bad effect refuses the
     whole seed, with its index in the reason. */
  const SEED_EFFECTS_MAX = 6;
  function seedEffects(list) {
    if (!Array.isArray(list)) bad('effects must be a list of effect ops');
    if (list.length > SEED_EFFECTS_MAX) bad(`a seed carries at most ${SEED_EFFECTS_MAX} effects`);
    const opened = new Set();
    return list.map((e, i) => {
      try { checkEffect(e, opened); } catch (err) { if (err instanceof Reject) bad(`effects[${i}]: ${err.message}`); throw err; }
      if (e.op === 'openThread') opened.add(e.thread.id);
      return deepCopy(e);
    });
  }
  function checkEffect(e, opened) {
    if (!isObj(e) || typeof e.op !== 'string') bad('effect needs an op');
    if (!Object.prototype.hasOwnProperty.call(EFFECTS, e.op)) bad(`unknown op "${e.op}"`);
    const place = () => { const l = needLoc(e.locationId); if (l.away === true && (e.op === 'visit' || e.op === 'placeItem')) bad(`${l.id} is out of town`); };
    switch (e.op) {
      case 'closeLocation': case 'openLocation': place(); break;
      case 'npcStatus': case 'attitudeDelta': needNpc(e.npcId); break;
      case 'npcMove': case 'visit': needNpc(e.npcId); place(); break;
      case 'placeItem':
        place();
        if (!isObj(e.item) || !cleanText(e.item.name, 60)) bad('placeItem needs an item with a name');
        break;
      case 'threadStatus': if (!(opened && opened.has(e.threadId))) needThread(e.threadId); break;
      case 'openThread': if (!isObj(e.thread) || typeof e.thread.id !== 'string') bad('openThread needs a thread with an id'); break;
      case 'addRumour': if (!isObj(e.rumour)) bad('addRumour needs a rumour'); break;
      case 'plantSeed': if (!isObj(e.seed)) bad('plantSeed needs a seed'); break;
      case 'factionRelation': needFaction(e.a); needFaction(e.b); break;
      case 'reputationDelta': if (e.key !== 'town') needFaction(e.key); break;
      case 'setFlag': if (RESERVED_FLAGS.includes(e.key)) bad(`flag "${e.key}" is reserved`); break;
      case 'fight': needNpc(e.npcId); break;
      default: break;
    }
  }
  function addNpc(raw) {
    if (!isObj(raw)) bad('npc must be an object');
    if (typeof raw.id !== 'string' || !ID_RE.npc.test(raw.id)) bad('npc id must look like npc_name');
    if (npc(raw.id)) bad(`npc id "${raw.id}" already exists`);
    const name = cleanText(raw.name, 60);
    if (!name) bad('npc needs a name');
    if (raw.factionId !== null && raw.factionId !== undefined) needFaction(raw.factionId);
    let home = null;
    if (raw.home) {
      const l = needLoc(raw.home.locationId);
      const ph = phasesOf(raw.home.phases) || bad('home phases must be "all" or a list of phases');
      home = { locationId: l.id, phases: ph };
    }
    if (raw.pronouns !== undefined && raw.pronouns !== null && !validPronouns(raw.pronouns)) bad('pronouns must be he, she or they');
    const role = cleanText(raw.role, 60) || 'townsfolk';
    const look = cleanText(raw.look, 200);
    const said = inferPronouns(`${role} ${look}`);
    const n = {
      id: raw.id, name, pronouns: validPronouns(raw.pronouns) || (said !== 'they' ? said : namePronouns(name) || 'they'),
      role, factionId: raw.factionId || null,
      tags: strArr(raw.tags), look, voice: cleanText(raw.voice, 200),
      personality: strArr(raw.personality).slice(0, 3), goal: cleanText(raw.goal, 200), secret: cleanText(raw.secret, 300),
      attitude: clamp(toInt(raw.attitude) || 0, -100, 100), memories: [], alive: true,
      knownToPlayer: raw.knownToPlayer === true, status: 'free'
    };
    // How the engine came to make them (the tables, a context call, a loose end, a story point): when, and who they are to someone.
    if (isObj(raw.created)) {
      const rel = typeof raw.created.relationToNpcId === 'string' && npc(raw.created.relationToNpcId) ? raw.created.relationToNpcId : null;
      n.created = { turn: current.meta.turn, day: current.time.day, by: CREATED_BY.includes(raw.created.by) ? raw.created.by : 'tables', relationToNpcId: rel, relation: rel ? cleanRelation(raw.created.relation) || null : null };
    }
    if (home) n.home = home;
    current.npcs.push(n);
    if (home) home.phases.forEach(p => addToSchedule(loc(home.locationId), p, n.id));
    return `added ${n.id} (${n.name})`;
  }
  function addLocation(raw) {
    if (!isObj(raw)) bad('location must be an object');
    if (typeof raw.id !== 'string' || !ID_RE.loc.test(raw.id)) bad('location id must look like loc_name');
    if (loc(raw.id)) bad(`location id "${raw.id}" already exists`);
    const name = cleanText(raw.name, 60);
    if (!name) bad('location needs a name');
    const exits = Array.isArray(raw.exits) ? raw.exits : [];
    exits.forEach(needLoc);
    const l = {
      id: raw.id, name, type: cleanText(raw.type, 40).toLowerCase() || 'place', description: cleanText(raw.description, 400),
      exits: Array.from(new Set(exits)), npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] },
      discovered: raw.discovered !== false, closed: raw.closed === true
    };
    current.locations.push(l);
    for (const x of l.exits) { const o = loc(x); if (!o.exits.includes(l.id)) o.exits.push(l.id); }
    return `added ${l.id} (${l.name})`;
  }
  /* A thing noticed in a place (Pipeline step 4 creates them for plausible
     `new:` items). It stays there until itemsGained picks it up. */
  function addSceneItem(raw) {
    if (!isObj(raw)) bad('must be an object');
    const l = needLoc(raw.locationId);
    const it = raw.item;
    if (!isObj(it)) bad('item must be an object');
    const name = cleanText(it.name, 60);
    if (!name) bad('item needs a name');
    const id = typeof it.id === 'string' && ID_RE.item.test(it.id) ? it.id : 'item_' + slugify(name);
    const qty = clamp(toInt(it.qty) || 1, 1, 99);
    if (!Array.isArray(l.items)) l.items = [];
    const here = l.items.find(i => i.id === id);
    if (here) here.qty = Math.min(99, here.qty + qty);
    else {
      const o = { id, name, qty, notes: cleanText(it.notes, 120) };
      const price = toInt(it.price);
      if (price !== null && price >= 0) o.price = price;
      l.items.push(o);
    }
    return `${name} at ${l.id}`;
  }
  /* Someone at a place for the current day and phase only (the visits op and
     the visit effect; npcsAt reads it). A newer visit replaces an older one. */
  function addVisit(n, l) {
    const s = current;
    if (!Array.isArray(s.visits)) s.visits = [];
    s.visits = s.visits.filter(x => x.npcId !== n.id);
    s.visits.push({ npcId: n.id, locationId: l.id, day: s.time.day, phase: s.time.phase });
    return `${n.id} at ${l.id} for day ${s.time.day} ${s.time.phase}`;
  }
  function sceneItem(id) {
    const l = current && loc(current.player.locationId);
    return l && Array.isArray(l.items) ? (l.items.find(i => i.id === id) || null) : null;
  }
  function takeFromScene(id, qty) {
    const l = loc(current.player.locationId);
    const it = sceneItem(id);
    if (!it) return;
    it.qty -= qty;
    if (it.qty <= 0) l.items.splice(l.items.indexOf(it), 1);
  }
  // ----- places people tell the player about (placesRevealed) -----
  /* The forms a place's name goes by, for the duplicate check: lower case,
     no leading "the", with and without a trailing house / home / place, and
     each with and without a possessive, so "Dewayne's", "Dewaynes house" and
     "Dewayne's house" all meet at "dewayne". */
  function placeNames(name) {
    const base = String(name || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
    const out = new Set();
    for (const f of [base, base.replace(/ (house|home|place)$/, '')]) {
      const bare = f.replace(/('s|s'|')$/, '');
      for (const x of [f, bare, bare.length > 3 ? bare.replace(/s$/, '') : bare]) if (x.trim()) out.add(x.trim());
    }
    return out;
  }
  /* The map a game is drawn on, and a place's point on it: the same sources
     as UI.renderMap (this game's town, else the built-in town's map for a
     save of the same town), so a stored point matches what is drawn. */
  function mapFrame() {
    if (town && isObj(town.map)) return town.map;
    return current && current.meta.townName === TOWN_DATA.name && isObj(TOWN_DATA.map) ? TOWN_DATA.map : null;
  }
  function mapPointOf(l) {
    if (!l) return null;
    let c = isObj(l.map) ? l.map : null;
    if (!c) {
      const src = (town && Array.isArray(town.locations) ? town.locations.find(x => x.id === l.id) : null)
        || (current && current.meta.townName === TOWN_DATA.name ? TOWN_DATA.locations.find(x => x.id === l.id) : null);
      c = src && isObj(src.map) ? src.map : null;
    }
    return c && Number.isFinite(c.x) && Number.isFinite(c.y) ? c : null;
  }
  /* Points along an SVG path (absolute M, L, C and Q, the commands the
     town's river uses); anything else gives no points, and so no river to
     keep away from. */
  function pathPoints(d) {
    const toks = typeof d === 'string' ? (d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || []) : [];
    const pts = [];
    let i = 0;
    let cmd = null;
    let x = 0;
    let y = 0;
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
      const at = i;
      if (cmd === 'M' || cmd === 'L') { x = num(); y = num(); pts.push({ x, y }); if (cmd === 'M') cmd = 'L'; }
      else if (cmd === 'C' || cmd === 'Q') {
        const c = cmd === 'C' ? [num(), num(), num(), num(), num(), num()] : [num(), num(), num(), num()];
        const ex = c[c.length - 2];
        const ey = c[c.length - 1];
        for (let k = 1; k <= 16; k++) {
          const t = k / 16;
          const u = 1 - t;
          pts.push(cmd === 'C'
            ? { x: u * u * u * x + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * ex, y: u * u * u * y + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * ey }
            : { x: u * u * x + 2 * u * t * c[0] + t * t * ex, y: u * u * y + 2 * u * t * c[1] + t * t * ey });
        }
        x = ex;
        y = ey;
      } else return [];
      if (i === at) return [];
    }
    return pts.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)) ? pts : [];
  }
  /* A map label of at most three words: the name without "The", cut before
     a word that starts describing the way there ("white house up the river
     road" -> "white house"). */
  const LABEL_BREAKS = new Set(['up', 'down', 'on', 'by', 'at', 'near', 'past', 'off', 'behind', 'across', 'along', 'over', 'in', 'from', 'beyond', 'under', 'outside', 'out']);
  function revealLabel(name) {
    const words = String(name || '').replace(/^the\s+/i, '').split(/\s+/).filter(Boolean);
    const out = [];
    for (const w of words) { if (out.length && LABEL_BREAKS.has(w.toLowerCase())) break; out.push(w); if (out.length >= 3) break; }
    return out.join(' ') || String(name || '').slice(0, 20);
  }
  /* Where a revealed place goes on the map: around the place it is reached
     from (or that place's first mapped exit), in eight directions at a
     radius of 34 (then 46, 58, 70 if nothing fits), inside the map with the
     same margins as UI.mapLayout, at least 28 from every marker; of those,
     the spot farthest from every other marker, with a heavy penalty near the
     river's banks and a light one a little further out. The label goes on
     the side away from the near place when it fits there without covering a
     marker, else the first side that does. Null when nothing is mapped. */
  const REVEAL_RADII = [34, 46, 58, 70];
  function revealSpot(near, label) {
    const frame = mapFrame() || {};
    const W = Number.isFinite(frame.width) && frame.width >= 120 ? frame.width : 360;
    const H = Number.isFinite(frame.height) && frame.height >= 100 ? frame.height : 300;
    const from = mapPointOf(near) || near.exits.map(id => mapPointOf(loc(id))).find(Boolean);
    if (!from) return null;
    const marks = current.locations.map(mapPointOf).filter(Boolean);
    const others = marks.filter(c => c.x !== from.x || c.y !== from.y);
    const river = pathPoints(frame.river);
    const rw = Number.isFinite(frame.riverWidth) && frame.riverWidth > 0 ? frame.riverWidth : 34;
    const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);
    let best = null;
    for (const r of REVEAL_RADII) {
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 2 - i * Math.PI / 4; // north first, then clockwise
        const x = Math.round(from.x + Math.cos(a) * r);
        const y = Math.round(from.y - Math.sin(a) * r);
        if (x < 24 || x > W - 24 || y < 20 || y > H - 20) continue;
        if (marks.some(c => dist(c, x, y) < 28)) continue;
        const clear = others.length ? Math.min(...others.map(c => dist(c, x, y))) : 999;
        const bank = river.length ? Math.min(...river.map(w => dist(w, x, y))) - rw / 2 : Infinity;
        const score = clear - (bank < 12 ? 1000 : bank < 26 ? 40 : 0);
        if (!best || score > best.score) best = { x, y, score };
      }
      if (best && best.score > 0) break;
    }
    if (!best) return null;
    // The label block, estimated as UI.mapPlace sizes it (11px type on a 316px map, two lines past 13 letters).
    const k = W / 316;
    const chars = label.length <= 13 || !label.includes(' ') ? label.length : Math.ceil(label.length / 2) + 2;
    const w = chars * 11 * k * 0.58;
    const h = (label.length <= 13 || !label.includes(' ') ? 1 : 2) * 13.2 * k;
    const dx = best.x - from.x;
    const dy = best.y - from.y;
    const away = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'e' : 'w') : (dy < 0 ? 'n' : 's');
    const box = side => side === 'e' ? [best.x + 11, best.y - h / 2, best.x + 11 + w, best.y + h / 2]
      : side === 'w' ? [best.x - 11 - w, best.y - h / 2, best.x - 11, best.y + h / 2]
        : side === 'n' ? [best.x - w / 2, best.y - 11 - h, best.x + w / 2, best.y - 11]
          : [best.x - w / 2, best.y + 11, best.x + w / 2, best.y + 11 + h];
    const fits = b => b[0] >= 3 && b[2] <= W - 3 && b[1] >= 2 && b[3] <= H - 2;
    const covers = b => others.some(c => c.x > b[0] - 7 && c.x < b[2] + 7 && c.y > b[1] - 7 && c.y < b[3] + 7);
    const sides = [away].concat(['e', 'w', 'n', 's'].filter(x => x !== away));
    const anchor = sides.find(x => fits(box(x)) && !covers(box(x))) || sides.find(x => fits(box(x))) || away;
    return { x: best.x, y: best.y, label, anchor };
  }
  /* A place the town has that the player has not found yet (a cast member's
     home, discovered false), which a placesRevealed entry names: by its name
     or map label, as the owner's home, or as the home of the person the
     name belongs to ("Dewayne's house"). Or null. */
  const HOME_WORDS = /\b(house|home|place|trailer|apartment|farm|cabin)\b/i;
  function hiddenPlace(name, owner, kind) {
    const unseen = current.locations.filter(l => l.discovered === false && l.away !== true);
    if (!unseen.length) return null;
    const want = placeNames(name);
    for (const l of unseen) {
      const c = mapPointOf(l);
      for (const known of [l.name, c && c.label]) if (known && [...placeNames(known)].some(x => want.has(x))) return l;
    }
    const homeOfPerson = n => { const h = n && n.home ? loc(n.home.locationId) : null; return h && h.discovered === false ? h : null; };
    if (owner && kind !== 'business' && homeOfPerson(owner)) return homeOfPerson(owner);
    const pm = /^(?:the\s+)?([A-Za-z][\w-]*)'s?\b/i.exec(String(name).replace(/[’‘]/g, "'"));
    if (pm && (kind === 'home' || HOME_WORDS.test(name))) {
      const who = current.npcs.filter(n => n.alive !== false && !n.unnamed && (firstName(n).toLowerCase() === pm[1].toLowerCase() || String(n.name).split(/\s+/).slice(-1)[0].toLowerCase() === pm[1].toLowerCase()));
      const h = who.map(homeOfPerson).find(Boolean);
      if (h) return h;
    }
    return null;
  }
  /* One placesRevealed entry (see the apply() header). Returns { id, line }. */
  function revealPlace(raw, source) {
    if (!isObj(raw)) bad('must be an object');
    const s = current;
    if (source === 'model' && ledger.places >= LIMITS.placesPerTurn) bad(`at most ${LIMITS.placesPerTurn} new place a turn`);
    const name = capFirst(cleanText(String(typeof raw.name === 'string' ? raw.name : '').replace(/[’‘]/g, "'").replace(/^["“”\s]+|["“”.,;:!?\s]+$/g, ''), 80));
    if (name.length < 2 || name.length > 40) bad('name must be 2 to 40 characters');
    const type = typeof raw.type === 'string' && REVEALED_TYPES.includes(raw.type.trim().toLowerCase()) ? raw.type.trim().toLowerCase() : 'other';
    const description = cleanText(raw.description, 240);
    if (!description) bad('needs a description');
    const near = needLoc(raw.nearId);
    if (!near.discovered) bad(`${near.id} is not a place the player knows`);
    const owner = raw.ownerNpcId === null || raw.ownerNpcId === undefined || raw.ownerNpcId === '' ? null : needNpc(raw.ownerNpcId);
    const kind = REVEALED_KINDS.includes(raw.kind) ? raw.kind : 'other';
    let turn = s.meta.turn;
    let day = s.time.day;
    if (source !== 'model') {
      if (Number.isInteger(raw.turn) && raw.turn >= 0 && raw.turn <= s.meta.turn) turn = raw.turn;
      if (Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= s.time.day) day = raw.day;
    }
    const byNpcId = typeof raw.byNpcId === 'string' && npc(raw.byNpcId) ? raw.byNpcId : null;
    // Somewhere the town already has, not found yet (Dewayne's house, written in the cast): now the player knows it.
    const hidden = hiddenPlace(name, owner, kind);
    if (hidden) {
      const resident = owner || s.npcs.find(n => n.home && n.home.locationId === hidden.id) || null;
      hidden.discovered = true;
      hidden.revealed = { turn, day, byNpcId, ownerNpcId: resident ? resident.id : null, kind: kind === 'other' ? 'home' : kind, visited: false, authored: true };
      if (source === 'model') ledger.places += 1;
      return { id: hidden.id, line: `${hidden.id} (${hidden.name}) discovered as "${name}"${resident ? `; home of ${resident.id}` : ''}` };
    }
    // Someone written into the cast lives where the cast says: a second home for them is never made.
    const ownHome = kind === 'home' && owner && !isObj(owner.created) && owner.home ? loc(owner.home.locationId) : null;
    if (ownHome && ownHome.discovered && !isObj(ownHome.revealed)) bad(`${owner.id} lives at ${ownHome.id} (${ownHome.name})`);
    if (s.locations.filter(l => isObj(l.revealed) && !l.revealed.authored).length >= LIMITS.revealedPlaces) bad(`at most ${LIMITS.revealedPlaces} places people told you about in one game`);
    const want = placeNames(name);
    for (const l of s.locations) {
      const c = mapPointOf(l);
      for (const known of [l.name, c && c.label]) {
        if (known && [...placeNames(known)].some(x => want.has(x))) bad(`already a place: ${l.id} (${l.name})`);
      }
    }
    if (kind === 'home' && owner && owner.home && isObj((loc(owner.home.locationId) || {}).revealed)) bad(`${owner.id} already has a home on the map (${owner.home.locationId})`);
    const id = uniqueId('loc_' + slugify(name.replace(/'/g, '')), x => !!loc(x));
    const l = {
      id, name, type, description, exits: [near.id],
      npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] },
      discovered: true, closed: false, items: [],
      revealed: { turn, day, byNpcId, ownerNpcId: owner ? owner.id : null, kind, visited: false }
    };
    const spot = revealSpot(near, revealLabel(name));
    if (spot) l.map = spot;
    s.locations.push(l);
    if (!near.exits.includes(l.id)) near.exits.push(l.id);
    if (source === 'model') ledger.places += 1;
    // Someone's home: they are there in every phase their schedule puts them nowhere (usually the night); nothing is taken away.
    let home = '';
    if (kind === 'home' && owner) {
      const nowhere = PHASES.filter(p => !s.locations.some(x => ((x.npcIdsBySchedule || {})[p] || []).includes(owner.id)));
      // A loose-end person kept off-screen until their seed fires settles here then (World.settleHomes), not now.
      const waiting = nowhere.length === PHASES.length && (s.player.looseEnds || []).some(le => le.npcId === owner.id && seed(le.seedId) && !seed(le.seedId).fired);
      const phases = owner.alive !== false && owner.status === 'free' && !waiting ? nowhere : [];
      phases.forEach(p => addToSchedule(l, p, owner.id));
      if (!owner.home) owner.home = { locationId: l.id, phases: waiting ? PHASES.slice() : phases, revealed: true };
      home = `; home of ${owner.id}` + (phases.length ? ` (there ${phases.join(', ')})` : waiting ? ' (once their loose end comes due)' : '');
      // People the story named who live with the owner (a wife, a son) and are nowhere yet move in.
      for (const m of s.npcs) {
        if (!isObj(m.created) || m.created.relationToNpcId !== owner.id || !HOUSEHOLD_RELATIONS.includes(m.created.relation) || scheduledPhases(m.id).length) continue;
        if (moveIn(m, l).length) home += `; ${m.id} lives there too`;
      }
    } else if (owner) home = `; ${kind === 'business' ? 'business' : 'place'} of ${owner.id}`;
    return { id, line: `${id} (${name}) reached from ${near.id}${home}${spot ? `; on the map at ${spot.x},${spot.y}` : ''}` };
  }
  // ----- people the story names (peopleRevealed) -----
  /* A person's name for the duplicate check: lower case, no punctuation, no
     title ("Mrs", "Old", "Officer"). */
  const PERSON_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'doc', 'old', 'young', 'big', 'little', 'aunt', 'auntie', 'uncle', 'cousin', 'granny', 'pastor', 'reverend', 'officer', 'chief', 'deputy', 'mayor', 'sheriff']);
  function personKey(name) {
    return String(name || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/)
      .filter(w => w && !PERSON_TITLES.has(w)).join(' ');
  }
  /* Two names for one person: the same once normalised, or one is a single
     first name the other starts with ("Mavis" and "Mavis Toler"). */
  function samePerson(a, b) {
    const x = personKey(a);
    const y = personKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const xs = x.split(' ');
    const ys = y.split(' ');
    return (xs.length === 1 && ys.length > 1 && ys[0] === xs[0]) || (ys.length === 1 && xs.length > 1 && xs[0] === ys[0]);
  }
  function firstName(n) {
    if (!n) return '';
    if (n.unnamed) return String(n.name || '');
    const words = String(n.name || '').split(/\s+/);
    return words.find(w => !PERSON_TITLES.has(w.toLowerCase().replace(/\.$/, ''))) || words[0] || '';
  }
  /* "wife", "older brother": lower case, without "his", "my" or "the". */
  function cleanRelation(v) {
    return cleanText(v, 30).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z' -]+/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/^(his|her|my|their|our|your|the|a|an)\s+/, '').trim();
  }
  /* "Dewayne's wife", from who they are to someone. */
  function relationPhrase(relTo, relation) { return relTo && relation ? `${firstName(relTo)}'s ${relation}` : ''; }
  /* Who someone is to whom, both ways, from the cast's own relations lists
     ([{ npcId, relation }]: "npcId is this person's relation") and from a
     made person's created relation: has, the people who are this person's
     something ({ id, relation }: Dewayne has his wife Mavis), and isTo,
     what this person is to someone ({ id, relation }: Mavis is Dewayne's
     wife). Only people still in the game, each other person once a side,
     in the order written. */
  function tiesOf(n) {
    const has = [];
    const isTo = [];
    if (!n || !current) return { has, isTo };
    const add = (list, id, relation) => { if (typeof id === 'string' && id !== n.id && npc(id) && !list.some(x => x.id === id)) list.push({ id, relation: relation || null }); };
    for (const r of Array.isArray(n.relations) ? n.relations : []) if (isObj(r)) add(has, r.npcId, r.relation);
    const c = isObj(n.created) ? n.created : null;
    if (c && c.relationToNpcId) add(isTo, c.relationToNpcId, c.relation);
    for (const m of current.npcs) {
      if (m === n) continue;
      for (const r of Array.isArray(m.relations) ? m.relations : []) if (isObj(r) && r.npcId === n.id) add(isTo, m.id, r.relation);
      const mc = isObj(m.created) ? m.created : null;
      if (mc && mc.relationToNpcId === n.id) add(has, m.id, mc.relation);
    }
    return { has, isTo };
  }
  /* Who someone is to someone, for a line that shows their role too (the
     narrator's person line, the People card): "Dewayne's brother", or
     "related to Dewayne Pruitt" with no relation word; '' when there is no
     relation or the role already says it. A relation the story or the
     player gave (created) comes first, then the family the cast data
     gives them (a household relation first: "Dewayne's wife"); work and
     other ties are left to the person's ties list. */
  function relationNote(n) {
    if (!n) return '';
    const c = isObj(n.created) ? n.created : null;
    const isTo = tiesOf(n).isTo;
    // The people in town first, then those who live elsewhere, then the dead ("Trent's father", not "Ruth's husband").
    let pick = isTo.find(x => c && x.id === c.relationToNpcId) || null;
    for (const p of ['here', 'away', 'dead']) {
      if (pick) break;
      const g = isTo.filter(x => presenceOf(npc(x.id)) === p);
      pick = g.find(x => HOUSEHOLD_RELATIONS.includes(x.relation)) || g.find(x => FAMILY_RELATIONS.includes(x.relation)) || null;
    }
    const t = pick ? npc(pick.id) : null;
    if (!t) return '';
    const phrase = pick.relation ? relationPhrase(t, pick.relation) : `related to ${t.name}`;
    return String(n.role || '').toLowerCase().replace(/[’‘]/g, "'").includes(phrase.toLowerCase()) ? '' : phrase;
  }
  /* The bookkeeper's one-line who, split into the relation and the rest:
     "wife, night clerk at the motor court" -> wife + "night clerk at the
     motor court"; "his older brother who runs the bait shop" -> older
     brother + "runs the bait shop". With no relation word, the first clause
     is the relation and the rest follows. */
  function splitWho(who) {
    const text = cleanText(who, 200).replace(/[’‘]/g, "'");
    if (!text) return { relation: '', rest: '' };
    const m = RELATION_RE.exec(text);
    if (!m) {
      const parts = text.split(/[,;]/);
      return { relation: cleanRelation(parts[0]), rest: parts.slice(1).join(',').trim() };
    }
    const before = text.slice(0, m.index).replace(/\S+'s\s*$/, '').replace(/\b(his|her|their|my|our|the|a|an)\s*$/i, '').trim();
    const after = text.slice(m.index + m[0].length).replace(/^[\s,;:.-]+/, '').replace(/^(who|that|which|and)\s+/i, '').trim();
    const rest = [before, after].filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '');
    return { relation: cleanRelation(m[0]), rest };
  }
  /* What kind of person a relation makes them: family, someone's worker or
     boss, else other. */
  function kindOfRelation(relation) {
    const word = (RELATION_RE.exec(relation || '') || [])[2];
    if (!word) return 'other';
    const w = word.toLowerCase();
    if (WORK_RELATIONS.includes(w)) return 'worker';
    return FAMILY_RELATIONS.includes(w) ? 'relative' : 'other';
  }
  /* A name that is only who they are to someone ("Dewayne's wife", "his
     brother"): no proper name in it but the related person's first name. */
  const NAME_STOP = new Set(['his', 'her', 'their', 'my', 'our', 'your', 'the', 'a', 'an', 'that', 'this', 'some', 'one', 'another']);
  function looksUnnamed(name, relTo) {
    const first = relTo ? firstName(relTo).toLowerCase() : '';
    return !String(name || '').split(/\s+/).some(w => {
      const bare = w.replace(/^["'(]+|["',.)]+$/g, '');
      const lower = bare.toLowerCase().replace(/'s$/, '');
      return /^[A-Z]/.test(bare) && !PERSON_TITLES.has(lower) && !NAME_STOP.has(lower) && lower !== first;
    });
  }
  /* The one-line role: the relation first ("Dewayne's wife"), then what was
     said about them if it adds something ("Dewayne's wife, night clerk at
     the motor court"); with no relation, what was said, else townsfolk. */
  function personRole(given, relTo, relation) {
    const g = cleanText(given, 60).replace(/[.;]+$/, '');
    const phrase = relationPhrase(relTo, relation);
    if (!phrase) return g || 'townsfolk';
    if (!g || new RegExp('\\b' + relation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(g)) return phrase;
    const first = (/^\S+/.exec(g) || [''])[0];
    const proper = current.npcs.some(n => String(n.name).split(/\s+/).includes(first)) || current.locations.some(l => String(l.name).split(/\s+/).includes(first));
    const both = `${phrase}, ${proper ? g : lowerFirst(g)}`;
    return both.length <= 60 ? both : phrase;
  }
  /* Where someone lives, for a household member who shares it: the home
     someone told the player about, else their home if it is a dwelling. */
  const DWELLING_TYPES = ['house', 'home', 'bighouse', 'trailer', 'trailerpark', 'farm', 'cabin', 'apartment'];
  function homeOf(target) {
    if (!target || !current) return null;
    const told = current.locations.find(l => isObj(l.revealed) && l.revealed.kind === 'home' && l.revealed.ownerNpcId === target.id && !l.closed);
    if (told) return told;
    const h = target.home && loc(target.home.locationId);
    return h && !h.closed && DWELLING_TYPES.includes(h.type) ? h : null;
  }
  function scheduledPhases(id) { return PHASES.filter(p => current.locations.some(x => ((x.npcIdsBySchedule || {})[p] || []).includes(id))); }
  /* Someone settles at a home: there in every phase no schedule holds them. */
  function moveIn(n, l) {
    if (n.alive === false || n.status !== 'free') return [];
    const busy = scheduledPhases(n.id);
    const phases = PHASES.filter(p => !busy.includes(p));
    if (!phases.length) return [];
    phases.forEach(p => addToSchedule(l, p, n.id));
    n.home = { locationId: l.id, phases, revealed: true };
    return phases;
  }
  function storyPeople() { return current.npcs.filter(n => isObj(n.created) && n.created.by === 'story'); }
  /* One peopleRevealed entry (see the apply() header). Returns { id, named, renamed, line }. */
  function revealPerson(raw, source) {
    if (!isObj(raw)) bad('must be an object');
    const s = current;
    if (source === 'model' && ledger.people >= LIMITS.peoplePerTurn) bad(`at most ${LIMITS.peoplePerTurn} new person a turn`);
    const name = capFirst(cleanText(String(typeof raw.name === 'string' ? raw.name : '').replace(/[’‘]/g, "'").replace(/^["“”\s]+|["“”.,;:!?\s]+$/g, ''), 80));
    if (name.length < 2 || name.length > 40) bad('name must be 2 to 40 characters');
    const pronouns = validPronouns(raw.pronouns) || bad('pronouns must be he, she or they');
    let relTo = raw.relationToNpcId === null || raw.relationToNpcId === undefined || raw.relationToNpcId === '' ? null : needNpc(raw.relationToNpcId);
    // The bookkeeper's compact entry (name, pronouns, relationToNpcId, who): the rest is read from it.
    const compact = typeof raw.who === 'string' && raw.relation === undefined;
    let unnamed = raw.unnamed === true;
    let relationIn = raw.relation;
    let roleIn = raw.role;
    let lookIn = raw.look;
    let atIn = raw.locationId;
    let kindIn = raw.kind;
    if (compact) {
      const d = splitWho(raw.who);
      if (!relTo) {
        // "Royce's cousin" with relationToNpcId left empty: the name or the line says whose.
        const pm = /\b([A-Z][\w-]+)'s\s/.exec(`${name} ${raw.who}`);
        const owner = pm && s.npcs.find(n => n.alive !== false && !n.unnamed && firstName(n).toLowerCase() === pm[1].toLowerCase());
        if (owner) relTo = owner;
      }
      relationIn = relTo ? d.relation : '';
      roleIn = relTo ? d.rest : cleanText(raw.who, 60);
      lookIn = '';
      atIn = null;
      kindIn = relTo && d.relation ? kindOfRelation(d.relation) : 'other';
      unnamed = looksUnnamed(name, relTo); // "the propane man" with nobody to belong to is refused below
    }
    const relation = relTo ? cleanRelation(relationIn) || null : null;
    if (unnamed && !relation) bad('someone without a name needs a relation to a listed person');
    const at = atIn === null || atIn === undefined || atIn === '' ? null : needLoc(atIn);
    const kind = REVEALED_PERSON_KINDS.includes(kindIn) ? kindIn : 'other';
    const byNpcId = typeof raw.byNpcId === 'string' && npc(raw.byNpcId) ? raw.byNpcId : null;
    // Who is already this to the same person, and one of them still waiting for a name.
    const kin = relation ? s.npcs.filter(n => isObj(n.created) && n.created.relationToNpcId === relTo.id && n.created.relation === relation) : [];
    const waiting = unnamed ? null : kin.find(n => n.unnamed === true) || null;
    if (unnamed && kin.length) bad(`already a person: ${kin[0].id} (${kin[0].name})`);
    if (!waiting && kin.length && SINGLE_RELATIONS.includes(relation)) bad(`${relTo.id} already has a ${relation}: ${kin[0].id} (${kin[0].name})`);
    for (const n of s.npcs) if (n !== waiting && samePerson(n.name, name)) bad(`already a person: ${n.id} (${n.name})`);
    const look = cleanText(lookIn, 200);
    const household = !!relation && HOUSEHOLD_RELATIONS.includes(relation);
    if (waiting) {
      // Named at last: the same person, the same id.
      const was = waiting.name;
      waiting.name = name;
      delete waiting.unnamed;
      if (pronouns !== 'they' || !validPronouns(waiting.pronouns)) waiting.pronouns = pronouns;
      if (cleanText(roleIn, 60)) waiting.role = personRole(roleIn, relTo, relation);
      if (look) waiting.look = look;
      if (at && !waiting.created.locationId) waiting.created.locationId = at.id;
      const h = household && !scheduledPhases(waiting.id).length ? homeOf(relTo) : null;
      const ph = h ? moveIn(waiting, h) : [];
      if (source === 'model') ledger.people += 1;
      return { id: waiting.id, named: true, renamed: true, line: `${waiting.id} (${was}) is ${name} (${pronounLabel(waiting.pronouns)})${ph.length ? `; lives at ${h.id} (there ${ph.join(', ')})` : ''}` };
    }
    if (storyPeople().length >= LIMITS.revealedPeople) bad(`at most ${LIMITS.revealedPeople} people the story named in one game`);
    let turn = s.meta.turn;
    let day = s.time.day;
    if (source !== 'model') {
      if (Number.isInteger(raw.turn) && raw.turn >= 0 && raw.turn <= s.meta.turn) turn = raw.turn;
      if (Number.isInteger(raw.day) && raw.day >= 1 && raw.day <= s.time.day) day = raw.day;
    }
    const id = uniqueId('npc_' + slugify(name.replace(/'/g, '')), x => !!npc(x));
    const tags = Array.from(new Set([kind].concat(relation ? relation.split(/\s+/).filter(w => /^[a-z]+$/.test(w)) : [])));
    const n = {
      id, name, pronouns, role: personRole(roleIn, relTo, relation), factionId: null, tags, look, voice: '', personality: [], goal: '', secret: '',
      attitude: 0, memories: [], alive: true, knownToPlayer: false, status: 'free',
      created: { turn, day, by: 'story', relationToNpcId: relTo ? relTo.id : null, relation, locationId: at ? at.id : null, byNpcId }
    };
    if (unnamed) n.unnamed = true;
    s.npcs.push(n);
    if (source === 'model') ledger.people += 1;
    const h = household ? homeOf(relTo) : null;
    const ph = h ? moveIn(n, h) : [];
    return {
      id, named: !unnamed, renamed: false,
      line: `${id} (${name}${unnamed ? ', no name yet' : ''}; ${pronounLabel(pronouns)})${relation ? ` ${relation} of ${relTo.id}` : ''}${ph.length ? `; lives at ${h.id} (there ${ph.join(', ')})` : '; off-screen until met'}`
    };
  }
  /* Pronouns for people saved before records carried them (State.load and
     Upgrade version 5): the town's own (this game's town data, else the
     built-in town of the same name), else what their role and look say
     (woman, wife, mother, she: she; man, husband, father, he: he; else
     they). Returns the ids filled. */
  function fillPronouns(s, townData) {
    const own = townData && Array.isArray(townData.npcs) ? townData.npcs : [];
    const builtIn = s.meta && s.meta.townName === TOWN_DATA.name ? TOWN_DATA.npcs : [];
    const filled = [];
    for (const n of Array.isArray(s.npcs) ? s.npcs : []) {
      if (!isObj(n) || validPronouns(n.pronouns)) continue;
      const t = own.find(x => x.id === n.id && validPronouns(x.pronouns)) || builtIn.find(x => x.id === n.id && validPronouns(x.pronouns));
      n.pronouns = t ? t.pronouns : inferPronouns(`${n.role || ''} ${n.look || ''}`);
      filled.push(n.id);
    }
    return filled;
  }
  /* A loose end's person in a game saved before 30 Oct 2026 holds
     "Loose end with <player> (a debt): <the option's words>", which the
     narrator never saw. State.load rewrites it once to the line a new game
     writes (Town.looseEndMemory: "owes me more money than they can pay",
     weight 3), keeping its turn; the label picks which of that person's
     loose ends it is. Returns the ids rewritten. */
  const OLD_LOOSE_END = /^Loose end with .*? \(([^)]*)\): /i;
  function fillLooseEndMemories(s) {
    const done = [];
    const ends = isObj(s.player) && Array.isArray(s.player.looseEnds) ? s.player.looseEnds.filter(le => isObj(le) && LOOSE_ENDS[le.kind]) : [];
    for (const n of Array.isArray(s.npcs) ? s.npcs : []) {
      if (!isObj(n) || !Array.isArray(n.memories)) continue;
      const mine = ends.filter(le => le.npcId === n.id);
      if (!mine.length) continue;
      for (const m of n.memories) {
        const old = isObj(m) && typeof m.text === 'string' ? OLD_LOOSE_END.exec(m.text) : null;
        if (!old) continue;
        const label = old[1].trim().toLowerCase();
        const le = mine.find(x => lowerFirst(LOOSE_ENDS[x.kind].label).toLowerCase() === label) || mine[0];
        const text = Town.looseEndMemory(le.kind, le.text || m.text.slice(old[0].length), s.player.name);
        if (!text) continue;
        m.text = text;
        m.weight = Town.LOOSE_END_MEMORY_WEIGHT;
        if (!done.includes(n.id)) done.push(n.id);
      }
    }
    return done;
  }
  /* Who knows each rumour, for a new game and for a game saved before
     rumours carried knownBy (direction change 12; State.newGame and
     State.load, no rules version): firstKnowers, so an older save's news
     is still known by its source and the faction's free members. A list
     already there keeps only people in the game, each once. Returns the ids
     of the rumours filled. */
  function fillKnownBy(s) {
    const npcs = Array.isArray(s.npcs) ? s.npcs : [];
    const filled = [];
    for (const r of Array.isArray(s.rumours) ? s.rumours : []) {
      if (!isObj(r)) continue;
      if (Array.isArray(r.knownBy)) {
        r.knownBy = r.knownBy.filter((id, i, a) => typeof id === 'string' && a.indexOf(id) === i && npcs.some(n => isObj(n) && n.id === id));
        continue;
      }
      r.knownBy = firstKnowers(r, npcs);
      filled.push(r.id);
    }
    return filled;
  }
  function setThreadStatus(t, status) {
    if (!THREAD_STATUSES.includes(status)) bad('status must be open, resolved or failed');
    if (t.status === status) return `${t.id} already ${status}`;
    const was = t.status;
    t.status = status;
    let extra = '';
    if (status === 'resolved' && was !== 'resolved') {
      const p = current.player;
      if (p.storyPoints < LIMITS.storyPoints) { p.storyPoints += 1; extra = ' (+1 story point)'; }
    }
    return `${t.id} ${was} -> ${status}${extra}`;
  }
  function findHeld(ref) {
    const inv = current.player.inventory;
    if (typeof ref !== 'string' || !ref.trim()) return null;
    const r = ref.trim();
    return inv.find(i => i.id === r) || inv.find(i => i.name.toLowerCase() === r.toLowerCase()) || inv.find(i => i.id === 'item_' + slugify(r)) || null;
  }
  function knownItemName(id) {
    const all = [].concat(current.player.inventory, ...BACKGROUNDS.map(b => b.items || []));
    const hit = all.find(i => i && i.id === id);
    if (hit) return hit.name;
    const g = TABLES.items.goods.find(x => 'item_' + slugify(x.name) === id);
    if (g) return g.name;
    const t = TABLES.items.trinkets.find(x => 'item_' + slugify(x) === id);
    return t ? capFirst(t) : capFirst(id.slice(5).replace(/_/g, ' '));
  }

  // ----- effect ops (BUILD_PLAN.md table) -----
  const EFFECTS = {
    closeLocation(e) { const l = needLoc(e.locationId); l.closed = true; return `${l.id} closed`; },
    openLocation(e) { const l = needLoc(e.locationId); l.closed = false; return `${l.id} open`; },
    npcStatus(e) {
      const n = needNpc(e.npcId);
      if (!NPC_STATUSES.includes(e.status)) bad('status must be free, arrested, gone or dead');
      // Content note 6: clocks may contradict each other, so an NPC who is
      // already gone or dead stays that way (a no-op, not a rejection).
      if (n.status === 'gone' || n.status === 'dead' || n.alive === false) return `no-op: ${n.id} is already ${n.alive === false ? 'dead' : n.status}`;
      n.status = e.status;
      if (e.status === 'dead') n.alive = false;
      else if (e.status === 'arrested') jail(n);
      else if (e.status === 'gone') removeFromSchedules(n.id);
      else restoreSchedule(n);
      return `${n.id} is ${e.status}`;
    },
    npcMove(e) {
      const n = needNpc(e.npcId);
      const l = needLoc(e.locationId);
      const ph = phasesOf(e.phases) || bad('phases must be "all" or a list of phases');
      // Like npcStatus: someone in the cells, gone or dead stays where they are.
      if (n.alive === false || n.status === 'gone' || n.status === 'dead' || n.status === 'arrested') return `no-op: ${n.id} is ${n.alive === false ? 'dead' : n.status}`;
      removeFromSchedules(n.id, ph);
      ph.forEach(p => addToSchedule(l, p, n.id));
      return `${n.id} at ${l.id} (${ph.join(', ')})`;
    },
    attitudeDelta(e) {
      const n = needNpc(e.npcId);
      const d = toInt(e.delta);
      if (d === null) bad('delta must be an integer');
      const before = n.attitude;
      n.attitude = clamp(before + d, -100, 100);
      return `${n.id} attitude ${before} -> ${n.attitude}`;
    },
    priceMultiplier(e) {
      const f = Number(e.factor);
      if (!Number.isFinite(f) || f <= 0) bad('factor must be a positive number');
      const before = current.flags.priceMultiplier || 1;
      current.flags.priceMultiplier = Math.round(clamp(before * clamp(f, 0.25, 4), 0.25, 4) * 100) / 100;
      return `price multiplier ${before} -> ${current.flags.priceMultiplier}`;
    },
    openThread(e) { const t = normaliseThread(e.thread); current.threads.push(t); return `thread ${t.id} opened`; },
    threadStatus(e) { return setThreadStatus(needThread(e.threadId), e.status); },
    addRumour(e) { const r = normaliseRumour(e.rumour); current.rumours.push(r); return `rumour ${r.id} added`; },
    plantSeed(e) { const s = normaliseSeed(e.seed, false); current.seeds.push(s); return `seed ${s.id} planted (${s.trigger.type} ${s.trigger.value})`; },
    factionRelation(e) {
      const a = needFaction(e.a);
      const b = needFaction(e.b);
      if (a === b) bad('a and b must be different factions');
      const d = toInt(e.delta);
      if (d === null) bad('delta must be an integer');
      a.relations = a.relations || {};
      b.relations = b.relations || {};
      const v = clamp((a.relations[b.id] || 0) + d, -100, 100);
      a.relations[b.id] = v;
      b.relations[a.id] = v;
      return `${a.id} <-> ${b.id} ${v}`;
    },
    setFlag(e) {
      if (typeof e.key !== 'string' || !/^[A-Za-z][\w.-]{0,40}$/.test(e.key)) bad('key must be a short name');
      if (RESERVED_FLAGS.includes(e.key)) bad(`flag "${e.key}" is reserved`);
      const v = e.value;
      if (!(v === null || ['string', 'number', 'boolean'].includes(typeof v))) bad('value must be a string, number, boolean or null');
      if (typeof v === 'number' && !Number.isFinite(v)) bad('value must be finite');
      current.flags[e.key] = typeof v === 'string' ? v.slice(0, 200) : v;
      return `flag ${e.key} = ${JSON.stringify(current.flags[e.key])}`;
    },
    reputationDelta(e) {
      if (e.key !== 'town' && !faction(e.key)) bad(`unknown reputation key "${e.key}"`);
      const d = toInt(e.delta);
      if (d === null) bad('delta must be an integer');
      const rep = current.player.reputation;
      const before = rep[e.key] || 0;
      rep[e.key] = clamp(before + d, -100, 100);
      return `reputation ${e.key} ${before} -> ${rep[e.key]}`;
    },
    /* Direction change 14 (a seed's effects): someone is at a place for the
       current day and phase only (a visit, as when a loose end's person comes
       to the player), whatever their schedule says. Like npcMove, someone in
       the cells, gone or dead stays put, and nobody visits a closed place: a
       no-op, not a rejection, since a clock may have got there first. Nor
       is anyone taken out of the scene the player is in (they would vanish
       mid-conversation, or mid-fight): someone with the player somewhere
       else stays with them. */
    visit(e) {
      const n = needNpc(e.npcId);
      const l = needLoc(e.locationId);
      if (l.away === true) bad(`${l.id} is out of town`);
      if (n.alive === false || n.status !== 'free') return `no-op: ${n.id} is ${n.alive === false ? 'dead' : n.status}`;
      if (l.closed) return `no-op: ${l.id} is closed`;
      const at = current.player.locationId;
      if (l.id !== at && npcsAt(at).some(x => x.id === n.id)) return `no-op: ${n.id} is with the player at ${at}`;
      return addVisit(n, l);
    },
    /* A thing put in a place (the scene items Pipeline step 4 makes): it lies
       there, in ITEMS HERE, until itemsGained picks it up. */
    placeItem(e) {
      const l = needLoc(e.locationId);
      if (l.away === true) bad(`${l.id} is out of town`);
      const it = isObj(e.item) ? e.item : {};
      return addSceneItem({ locationId: l.id, item: { name: it.name, qty: it.qty, notes: it.notes } });
    },
    /* Direction change 16: someone comes at the player, a fight the player
       did not start. Nothing is rolled here: the fight waits in
       state.fights ({ id, npcId, reason?, seedId?, day, turn }) and
       Pipeline resolves it on the next narrated turn, or, for a seed's
       fight (World.fire passes seedId), on the turn that seed's due event
       is told, so the beating happens when the player meets it, not at the
       tick. A no-op for someone not free or not in town, and for someone
       who already has a fight waiting. */
    fight(e) {
      const n = needNpc(e.npcId);
      if (n.alive === false || n.status !== 'free' || presenceOf(n) !== 'here') return `no-op: ${n.id} is ${n.alive === false ? 'dead' : n.status}`;
      if (!Array.isArray(current.fights)) current.fights = [];
      if (current.fights.some(f => f.npcId === n.id)) return `no-op: ${n.id} already has a fight waiting`;
      const f = { id: uniqueId(`fight_${n.id.slice(4)}`, id => current.fights.some(x => x.id === id)), npcId: n.id, day: current.time.day, turn: current.meta.turn };
      const reason = cleanText(e.reason, 160);
      if (reason) f.reason = reason;
      if (typeof e.seedId === 'string' && seed(e.seedId)) f.seedId = e.seedId;
      current.fights.push(f);
      return `${n.id} will come at the player${f.seedId ? ` when ${f.seedId} is told` : ' on the next turn'}`;
    }
  };
  const EFFECT_OPS = Object.freeze(Object.keys(EFFECTS));

  // ----- time -----
  /* SPEC section 7: a short adds one to time.shorts and SHORTS_PER_PHASE of
     them make a phase, a long is a phase, a rest sleeps until the next
     morning and heals 3. Night holds until the player sleeps: a short never
     crosses from night into morning. When the shorts would roll over at
     night the clock stays at night with shorts at the most (2) and
     time.late = true (the small hours); no phase passes, so World.tick does
     not run (Pipeline.passTime ticks per phase passed). Morning comes only
     with a rest, a long (an hour or more; /wait and /skip pass longs) or a
     defeat. A new day starts early (shorts 0); reached by anything but a
     rest it sets time.noSleep (no sleep last night), which a rest clears.
     Any phase change clears time.late. Both flags are kept only while
     true, so a clock that never used them keeps its old shape. */
  function advanceTime(cost) {
    if (!TIME_COSTS.includes(cost)) bad('time cost must be instant, short, long or rest');
    const t = current.time;
    if (!PHASES.includes(t.phase)) t.phase = 'morning';
    const from = { day: t.day, phase: t.phase };
    let steps = 0;
    let healed = 0;
    let held = false;
    if (cost === 'short') {
      t.shorts = (t.shorts | 0) + 1;
      if (t.shorts >= SHORTS_PER_PHASE) {
        if (t.phase === 'night') { t.shorts = SHORTS_PER_PHASE - 1; t.late = true; held = true; }
        else { t.shorts = 0; steps = 1; }
      }
    } else if (cost === 'long') {
      steps = 1;
    } else if (cost === 'rest') {
      steps = PHASES.length - PHASES.indexOf(t.phase);
      t.shorts = 0;
      const p = current.player;
      const before = p.hp;
      p.hp = clamp(p.hp + 3, 0, p.maxHp);
      healed = p.hp - before;
      delete t.noSleep;
    }
    for (let i = 0; i < steps; i++) {
      const idx = PHASES.indexOf(t.phase);
      if (idx === PHASES.length - 1) {
        t.phase = PHASES[0]; t.day += 1; t.shorts = 0;
        if (cost !== 'rest') t.noSleep = true;
      } else t.phase = PHASES[idx + 1];
    }
    if (steps) delete t.late;
    // A visit lasts for the phase it was made in (World: the NPC came to the player for that scene).
    if (steps && Array.isArray(current.visits)) current.visits = current.visits.filter(v => v.day === t.day && v.phase === t.phase);
    return { cost, from, to: { day: t.day, phase: t.phase }, phasesPassed: steps, healed, held };
  }
  /* Where in its phase the clock is: early, mid or late (shorts 0, 1, 2 or
     more; the late-night flag is late too). */
  function phasePart(t) {
    t = t || (current && current.time) || {};
    const n = t.shorts | 0;
    return t.late === true || n >= SHORTS_PER_PHASE - 1 ? 'late' : n >= 1 ? 'mid' : 'early';
  }
  /* The clock as the narrator and the bookkeeper read it, e.g.
     "DAY 1, NIGHT (late; the player has not slept)" or
     "DAY 2, MORNING (early; no sleep last night)". */
  function clockLine(t) {
    t = t || current.time;
    const notes = [phasePart(t)];
    if (t.phase === 'night') notes.push('the player has not slept');
    else if (t.phase === 'morning' && t.noSleep === true) notes.push('no sleep last night');
    return `DAY ${t.day}, ${String(t.phase).toUpperCase()} (${notes.join('; ')})`;
  }
  function clockWords(t) { return `day ${t.day} ${t.phase}, shorts ${t.shorts | 0}${t.late === true ? ', late' : ''}${t.noSleep === true ? ', no sleep' : ''}`; }

  // ----- correcting a person (fixPeople, editPerson) -----
  /* A person's new name, cleaned and checked: 2 to 40 characters, and
     nobody else's (samePerson). */
  function personName(n, raw) {
    const name = capFirst(cleanText(String(raw).replace(/[’‘]/g, "'").replace(/^["“”\s]+|["“”.,;:!?\s]+$/g, ''), 80));
    if (name.length < 2 || name.length > 40) bad('name must be 2 to 40 characters');
    const other = current.npcs.find(m => m !== n && samePerson(m.name, name));
    if (other) bad(`the name ${name} is taken: ${other.id} (${other.name})`);
    return name;
  }
  /* A full list of memories (setMemories, editPerson): each { turn 0 to
     meta.turn, text, weight 1 to 3 }, at most MEMORY_MAX, in the order
     given. strict (the player's edit) refuses text over 400 characters
     instead of cutting it. */
  function checkMemories(list, strict) {
    if (!Array.isArray(list)) bad('memories must be an array');
    if (list.length > MEMORY_MAX) bad(`at most ${MEMORY_MAX} memories per person (got ${list.length})`);
    return list.map((m, i) => {
      if (!isObj(m)) bad(`memories[${i}] must be an object`);
      if (strict && typeof m.text === 'string' && cleanText(m.text, 100000).length > 400) bad(`memories[${i}]: text must be at most 400 characters`);
      const text = cleanText(m.text, 400);
      if (!text) bad(`memories[${i}] needs text`);
      if (!Number.isInteger(m.turn) || m.turn < 0 || m.turn > current.meta.turn) bad(`memories[${i}]: turn must be 0 to ${current.meta.turn}`);
      if (!Number.isInteger(m.weight) || m.weight < 1 || m.weight > 3) bad(`memories[${i}]: weight must be 1, 2 or 3`);
      return Object.assign({ turn: m.turn, text, weight: m.weight }, m.model === true ? { model: true } : {});
    });
  }
  /* New pronouns turn a gendered relation with them (husband -> wife), and
     the tags and the role that carry the word (unless roleStated); they
     leaves the word alone. Returns the parts for the applied line. */
  function turnRelation(n, pron, roleStated) {
    const parts = [];
    if (pron === 'they' || !isObj(n.created) || !n.created.relation) return parts;
    const was = n.created.relation;
    const now = genderPhrase(was, pron);
    if (now === was) return parts;
    n.created.relation = now;
    n.tags = (n.tags || []).map(t => genderWord(t, pron));
    if (!roleStated && n.role) { const r = genderPhrase(n.role, pron); if (r !== n.role) { parts.push(`role ${JSON.stringify(n.role)} -> ${JSON.stringify(r)}`); n.role = r; } }
    parts.push(`${was} -> ${now} of ${n.created.relationToNpcId}`);
    return parts;
  }
  /* New pronouns turn the look and voice lines with them (turnLook from the
     old pronouns: "A man with a bitter look about him" -> "A woman with a
     bitter look about her"), each unless stated(k) says the same change
     gives it. */
  function turnLines(n, pron, stated, from) {
    const parts = [];
    for (const k of ['look', 'voice']) {
      if (stated(k) || !n[k]) continue;
      const t = turnLook(n[k], pron, from);
      if (t !== n[k]) { n[k] = t; parts.push(`${k} turned to ${pronounLabel(pron)}`); }
    }
    return parts;
  }
  /* A new home takes over from the old one: they leave the old home's
     phases and are at the new one in every phase no schedule holds them
     (moveIn). Someone in the cells, gone or dead keeps their schedule (as
     npcMove); only the home on record changes. */
  function setHome(n, home) {
    const free = n.alive !== false && n.status === 'free';
    if (free && n.home && Array.isArray(n.home.phases)) removeFromSchedules(n.id, n.home.phases);
    const ph = free ? moveIn(n, home) : [];
    if (!ph.length) n.home = { locationId: home.id, phases: n.home && Array.isArray(n.home.phases) ? n.home.phases : PHASES.slice(), revealed: true };
    return `lives at ${home.id}${ph.length ? ` (there ${ph.join(', ')})` : ''}`;
  }
  /* No home any more: off the home's phases there, and no home on record. */
  function leaveHome(n) {
    const l = n.home && loc(n.home.locationId);
    if (l) {
      const sch = l.npcIdsBySchedule || (l.npcIdsBySchedule = {});
      for (const p of Array.isArray(n.home.phases) ? n.home.phases : PHASES) if (Array.isArray(sch[p])) sch[p] = sch[p].filter(x => x !== n.id);
    }
    delete n.home;
  }
  /* In the cells: at the police station (else the watch house) in every phase. */
  function jail(n) {
    removeFromSchedules(n.id);
    const watch = current.locations.find(l => l.type === 'police') || current.locations.find(l => l.type === 'watch');
    if (watch) PHASES.forEach(p => addToSchedule(watch, p, n.id));
  }
  /* The player sets a status outright (editPerson; unlike npcStatus, the
     dead and the gone can come back): dead or gone takes them off every
     schedule (dead also alive false), arrested puts them in the cells, and
     free makes them alive and puts them back where they belong (the town's
     schedule, else their home: restoreSchedule). A visit is cancelled. */
  function setStatus(n, status, was) {
    current.visits = (current.visits || []).filter(v => v.npcId !== n.id);
    n.status = status;
    n.alive = status !== 'dead';
    if (status === 'dead' || status === 'gone') removeFromSchedules(n.id);
    else if (status === 'arrested') jail(n);
    else restoreSchedule(n);
    return `status ${was} -> ${status}`;
  }
  /* editPerson: the player's edit of anyone's record (see the apply()
     header). The fields the editor may send, the fields an edit reports
     (in the editor's order) and the limits. */
  const EDIT_KEYS = ['npcId', 'name', 'age', 'pronouns', 'role', 'look', 'voice', 'history', 'personality', 'goal', 'secret', 'attitude', 'relationToNpcId', 'relation', 'homeLocationId', 'status', 'alive', 'memories'];
  const EDIT_FIELDS = ['name', 'age', 'pronouns', 'role', 'look', 'voice', 'history', 'personality', 'attitude', 'relation', 'home', 'status', 'memories', 'goal', 'secret'];
  const EDIT_MAX = Object.freeze({ name: 40, role: 60, look: 200, voice: 200, history: 400, goal: 200, secret: 300, relation: 30, trait: 30, traits: 3, memory: 400, age: 120 });
  /* Returns { id, fields, line }, or null when nothing changed. */
  function editPerson(e) {
    if (!isObj(e)) bad('must be an object');
    const n = needNpc(e.npcId);
    for (const k of Object.keys(e)) if (!EDIT_KEYS.includes(k)) bad(`unknown field "${k}"`);
    const given = k => e[k] !== undefined;
    const text = (k, max) => {
      if (typeof e[k] !== 'string') bad(`${k} must be text`);
      const v = cleanText(e[k], 100000);
      if (v.length > max) bad(`${k} must be at most ${max} characters (it is ${v.length})`);
      return v;
    };
    // 1. Check everything; nothing changes unless all of it passes.
    const want = {};
    if (given('name')) { if (typeof e.name !== 'string') bad('name must be text'); want.name = personName(n, e.name); }
    // Age: a whole number of years, 0 to 120 (the dead: their age at death); null or empty clears it.
    if (given('age')) {
      if (e.age === null || e.age === '') want.age = null;
      else {
        const a = typeof e.age === 'number' ? e.age : typeof e.age === 'string' && /^\s*\d+\s*$/.test(e.age) ? Number(e.age) : NaN;
        if (!Number.isInteger(a) || a < 0 || a > EDIT_MAX.age) bad(`age must be a whole number from 0 to ${EDIT_MAX.age}`);
        want.age = a;
      }
    }
    if (given('pronouns')) want.pronouns = validPronouns(e.pronouns) || bad('pronouns must be he, she or they');
    if (given('role')) { want.role = text('role', EDIT_MAX.role); if (!want.role) bad('role cannot be empty: say who they are or what they do'); }
    for (const k of ['look', 'voice', 'history', 'goal', 'secret']) if (given(k)) want[k] = text(k, EDIT_MAX[k]);
    if (given('personality')) {
      if (!Array.isArray(e.personality)) bad('personality must be a list of traits');
      const traits = e.personality.map((x, i) => { if (typeof x !== 'string') bad(`personality[${i}] must be text`); return cleanText(x, 100000); }).filter(Boolean);
      if (traits.length > EDIT_MAX.traits) bad(`at most ${EDIT_MAX.traits} personality traits (got ${traits.length})`);
      const long = traits.find(x => x.length > EDIT_MAX.trait);
      if (long) bad(`a personality trait must be at most ${EDIT_MAX.trait} characters ("${long.slice(0, 40)}")`);
      want.personality = traits;
    }
    if (given('attitude')) {
      const a = typeof e.attitude === 'number' || typeof e.attitude === 'string' ? toInt(e.attitude) : null;
      if (a === null) bad('attitude must be a whole number from -100 to 100');
      want.attitude = clamp(a, -100, 100);
    }
    const c = isObj(n.created) ? n.created : null;
    const curTo = c && c.relationToNpcId ? c.relationToNpcId : null;
    const curRel = curTo ? c.relation || null : null;
    let relTo = curTo;
    if (given('relationToNpcId')) {
      const v = e.relationToNpcId;
      if (v === null || v === '') relTo = null;
      else {
        const t = needNpc(v);
        if (t.id === n.id) bad('a person cannot be related to themself');
        if (t.alive === false && t.id !== curTo) bad(`${t.name} is dead: a relation needs a living person`);
        relTo = t.id;
      }
    }
    let relation = relTo ? curRel : null;
    if (given('relation')) {
      if (e.relation !== null && typeof e.relation !== 'string') bad('relation must be text');
      const raw = cleanText(e.relation || '', 100000);
      if (raw.length > EDIT_MAX.relation) bad(`relation must be at most ${EDIT_MAX.relation} characters (it is ${raw.length})`);
      const r = cleanRelation(raw) || null;
      if (r && !relTo) bad('a relation needs someone to be related to (relationToNpcId)');
      relation = relTo ? r : null;
    }
    const relChanged = relTo !== curTo || relation !== curRel;
    let home;
    if (given('homeLocationId')) home = e.homeLocationId === null || e.homeLocationId === '' ? null : needLoc(e.homeLocationId);
    const wasStatus = n.alive === false ? 'dead' : NPC_STATUSES.includes(n.status) ? n.status : 'free';
    let status = wasStatus;
    if (given('status')) { if (!NPC_STATUSES.includes(e.status)) bad('status must be free, arrested, gone or dead'); status = e.status; }
    if (given('alive')) {
      if (typeof e.alive !== 'boolean') bad('alive must be true or false');
      if (given('status') && e.alive === (status === 'dead')) bad(`alive ${e.alive} does not go with status ${status}`);
      if (!e.alive) status = 'dead';
      else if (status === 'dead') status = 'free';
    }
    const memories = given('memories') ? checkMemories(e.memories, true) : null;

    // 2. Change what is different, and say what.
    const fields = new Set();
    const parts = [];
    const show = v => JSON.stringify(v);
    if (want.name !== undefined && want.name !== n.name) { parts.push(`name ${show(n.name)} -> ${show(want.name)}`); n.name = want.name; delete n.unnamed; fields.add('name'); }
    const ageWas = Number.isInteger(n.age) ? n.age : null;
    if (want.age !== undefined && want.age !== ageWas) {
      parts.push(`age ${ageWas === null ? 'none' : ageWas} -> ${want.age === null ? 'none' : want.age}`);
      if (want.age === null) delete n.age; else n.age = want.age;
      fields.add('age');
    }
    const pronWas = n.pronouns;
    const pronChanged = want.pronouns !== undefined && want.pronouns !== pronWas;
    if (pronChanged) { parts.push(`pronouns ${show(n.pronouns)} -> ${show(want.pronouns)}`); n.pronouns = want.pronouns; fields.add('pronouns'); }
    for (const k of ['role', 'look', 'voice', 'history', 'goal', 'secret']) {
      if (want[k] === undefined || want[k] === (n[k] || '')) continue;
      parts.push(k === 'role' ? `role ${show(n.role || '')} -> ${show(want.role)}` : `${k} replaced`);
      n[k] = want[k];
      fields.add(k);
    }
    if (want.personality && show(want.personality) !== show(n.personality || [])) { parts.push(`personality ${show(n.personality || [])} -> ${show(want.personality)}`); n.personality = want.personality; fields.add('personality'); }
    if (want.attitude !== undefined && want.attitude !== n.attitude) { parts.push(`attitude ${n.attitude} -> ${want.attitude}`); n.attitude = want.attitude; fields.add('attitude'); }
    if (relChanged) {
      if (relTo) {
        // A town person has no created record until the player gives them a relation.
        if (!isObj(n.created)) n.created = { turn: null, day: null, by: 'edit', relationToNpcId: null, relation: null };
        n.created.relationToNpcId = relTo;
        n.created.relation = relation;
        parts.push(`${relation || 'related'} of ${relTo}`);
      } else {
        parts.push(`no relation (was ${curRel || 'related'} of ${curTo})`);
        if (c.by === 'edit') delete n.created;
        else { c.relationToNpcId = null; c.relation = null; }
      }
      fields.add('relation');
    } else if (pronChanged && !given('relationToNpcId') && !given('relation')) {
      const role = n.role;
      const turned = turnRelation(n, n.pronouns, given('role'));
      if (turned.length) { parts.push(...turned); fields.add('relation'); if (n.role !== role) fields.add('role'); }
    }
    if (pronChanged) for (const part of turnLines(n, n.pronouns, given, pronWas)) { parts.push(part); fields.add(part.split(' ')[0]); }
    if (status !== wasStatus) { parts.push(setStatus(n, status, wasStatus)); fields.add('status'); }
    if (home !== undefined) {
      const cur = n.home && n.home.locationId ? n.home.locationId : null;
      if (home === null && cur) { leaveHome(n); parts.push(`no home (was ${cur})`); fields.add('home'); }
      else if (home && home.id !== cur) { parts.push(setHome(n, home)); fields.add('home'); }
    }
    if (memories && show(memories) !== show(n.memories || [])) { parts.push(`memories ${(n.memories || []).length} -> ${memories.length}`); n.memories = memories; fields.add('memories'); }
    if (!fields.size) return null;
    return { id: n.id, fields: EDIT_FIELDS.filter(f => fields.has(f)), line: `${n.id} edited: ${parts.join('; ')}` };
  }

  // ----- the full cast (Upgrade version 6) -----
  /* The town data people and places come from: this game's own copy, or
     the built-in town's for a game of that town. */
  function castTown() {
    if (current && current.meta.townName === TOWN_DATA.name) return TOWN_DATA;
    return town && Array.isArray(town.npcs) ? town : null;
  }
  /* Is this person written in the town's cast (not made in play)? */
  function inCast(id) {
    const t = castTown();
    return !!(t && t.npcs.some(n => n.id === id)) || !!(town && Array.isArray(town.npcs) && town.npcs.some(n => n.id === id));
  }
  /* addCast { town }: every place and person of that town data missing here
     by id, as a new game has them (Town.instantiate): places with their
     map point, discovered as written (a home starts undiscovered), exits
     both ways to places here, and an empty schedule (castSchedules fills
     it); people with their relations, home, no memories, not met. A town
     person already here who has no relations or no home on record gets
     the cast's. The game's copy of the town takes in what was added, so
     a person freed from the cells goes back to the cast's schedule. */
  function addCast(v) {
    if (!isObj(v) || !isObj(v.town) || !Array.isArray(v.town.locations) || !Array.isArray(v.town.npcs)) bad('needs a town with locations and npcs');
    const t = v.town;
    for (const n of t.npcs) if (n.factionId && !faction(n.factionId)) bad(`${n.id}: unknown faction ${n.factionId}`);
    const inst = Town.instantiate(Object.assign({ factions: [], threads: [], seeds: [], rumours: [] }, deepCopy({ locations: t.locations, npcs: t.npcs })));
    const newLocs = inst.locations.filter(l => !loc(l.id));
    const newNpcs = inst.npcs.filter(n => !npc(n.id));
    const ids = new Set(current.locations.map(l => l.id).concat(newLocs.map(l => l.id)));
    for (const l of newLocs) {
      const out = { id: l.id, name: l.name, type: l.type, description: l.description, exits: (l.exits || []).filter(x => ids.has(x)),
        npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] }, discovered: l.discovered !== false, closed: l.closed === true, items: [] };
      if (isObj(l.map)) out.map = deepCopy(l.map);
      for (const k of PLACE_FIELDS) if (l[k] !== undefined) out[k] = deepCopy(l[k]);
      if (out.away === true) { out.exits = []; out.discovered = false; }
      current.locations.push(out);
    }
    for (const l of newLocs) for (const x of loc(l.id).exits) { const o = loc(x); if (o && !o.exits.includes(l.id)) o.exits.push(l.id); }
    const people = new Set(current.npcs.map(n => n.id).concat(newNpcs.map(n => n.id)));
    const keepTies = list => (Array.isArray(list) ? list : []).filter(r => isObj(r) && people.has(r.npcId)).map(r => ({ npcId: r.npcId, relation: r.relation }));
    for (const n of newNpcs) {
      const o = deepCopy(n);
      o.relations = keepTies(o.relations);
      if (o.home && !loc(o.home.locationId)) delete o.home;
      current.npcs.push(o);
    }
    let filled = 0;
    for (const n of inst.npcs) {
      const here = npc(n.id);
      if (!here || newNpcs.includes(n)) continue;
      let did = false;
      if (!Array.isArray(here.relations)) { here.relations = keepTies(n.relations); did = true; }
      if (!here.home && n.home && loc(n.home.locationId)) { here.home = deepCopy(n.home); did = true; }
      if (did) filled += 1;
    }
    // The game's copy of the town follows (it is what restoreSchedule and the cast block read).
    if (town && Array.isArray(town.locations) && Array.isArray(town.npcs) && town !== t) {
      for (const l of t.locations) if (!town.locations.some(x => x.id === l.id)) town.locations.push(deepCopy(l));
      for (const l of t.locations) { const x = town.locations.find(y => y.id === l.id); if (x) x.npcIdsBySchedule = deepCopy(l.npcIdsBySchedule); }
      for (const n of t.npcs) if (!town.npcs.some(x => x.id === n.id)) town.npcs.push(deepCopy(n));
      for (const n of t.npcs) { const x = town.npcs.find(y => y.id === n.id); if (x) { if (!Array.isArray(x.relations)) x.relations = deepCopy(n.relations || []); if (x.home === undefined) x.home = n.home; } }
      if (Array.isArray(t.offstage) && !Array.isArray(town.offstage)) town.offstage = deepCopy(t.offstage);
    }
    if (!newLocs.length && !newNpcs.length && !filled) return null;
    return `added ${newLocs.length} places (${newLocs.map(l => l.id).join(', ') || 'none'}) and ${newNpcs.length} people (${newNpcs.map(n => n.id).join(', ') || 'none'}); ${filled} town people gained their relations or home`;
  }
  /* livedIn { town } (Upgrade version 7, "A lived-in town"): what the town
     data says and an older game lacks, filled in and never overwritten.
     Every cast member here gets the town's age, history and presence (and
     where and how to reach them, or when they died) where their own record
     has none, and any written relation to someone who is now in the game
     (the dead and the far away arrive with addCast); every place gets its
     details, hours, history, other names and, out of town, away and
     distance (a place out of town loses its roads and is never discovered);
     the player gets their background's age when they have none; the game's
     own copy of the town takes the same fields, the town's history, recent
     events and year, and drops the offstage list once all of its names are
     records. result.livedIn counts what was filled. */
  function livedIn(v) {
    if (!isObj(v) || !isObj(v.town) || !Array.isArray(v.town.locations) || !Array.isArray(v.town.npcs)) bad('needs a town with locations and npcs');
    const t = v.town;
    const out = { ages: 0, histories: 0, people: 0, places: 0, ties: 0, playerAge: null };
    const missing = x => x === undefined || x === null || x === '';
    const fillPerson = (n, rec, live) => {
      let did = false;
      for (const k of PERSON_FIELDS) {
        if (rec[k] === undefined || !missing(n[k])) continue;
        n[k] = deepCopy(rec[k]);
        did = true;
        if (live && k === 'age') out.ages += 1;
        if (live && k === 'history') out.histories += 1;
      }
      return did;
    };
    for (const rec of t.npcs) {
      const n = npc(rec.id);
      if (!n) continue;
      if (fillPerson(n, rec, true)) out.people += 1;
      // A written relation to someone the game has now (both sides are written, so the other side fills itself).
      if (!Array.isArray(n.relations)) n.relations = [];
      for (const r of Array.isArray(rec.relations) ? rec.relations : []) {
        if (!isObj(r) || !npc(r.npcId) || n.relations.some(x => x.npcId === r.npcId)) continue;
        n.relations.push({ npcId: r.npcId, relation: r.relation });
        out.ties += 1;
      }
    }
    for (const rec of t.locations) {
      const l = loc(rec.id);
      if (!l) continue;
      let did = false;
      for (const k of PLACE_FIELDS) if (rec[k] !== undefined && missing(l[k])) { l[k] = deepCopy(rec[k]); did = true; }
      if (l.away === true) {
        // Out of town: no roads in or out, never on the map, nobody scheduled there.
        for (const o of current.locations) if (o !== l) o.exits = o.exits.filter(x => x !== l.id);
        l.exits = [];
        l.discovered = false;
        l.npcIdsBySchedule = { morning: [], afternoon: [], evening: [], night: [] };
      }
      if (did) out.places += 1;
    }
    const p = current.player;
    if (!Number.isInteger(p.age)) {
      const bg = BACKGROUNDS.find(b => b.id === p.backgroundId);
      p.age = bg && Number.isInteger(bg.age) ? bg.age : 30;
      out.playerAge = p.age;
    }
    // The game's own copy of the town follows (the narrator's town and cast blocks read it).
    if (town && town !== t && Array.isArray(town.npcs) && Array.isArray(town.locations)) {
      for (const k of ['year', 'history', 'recent']) if (t[k] !== undefined && missing(town[k])) town[k] = deepCopy(t[k]);
      for (const rec of t.npcs) { const x = town.npcs.find(y => y.id === rec.id); if (x) { fillPerson(x, rec, false); if (!Array.isArray(x.relations)) x.relations = deepCopy(rec.relations || []); for (const r of rec.relations || []) if (!x.relations.some(y => y.npcId === r.npcId)) x.relations.push(deepCopy(r)); } }
      for (const rec of t.locations) { const x = town.locations.find(y => y.id === rec.id); if (x) for (const k of PLACE_FIELDS) if (rec[k] !== undefined && missing(x[k])) x[k] = deepCopy(rec[k]); }
      if (Array.isArray(town.offstage) && town.offstage.every(o => !isObj(o) || town.npcs.some(n => samePerson(n.name, o.name)) || t.npcs.some(n => samePerson(n.name, o.name)))) delete town.offstage;
    }
    if (!out.people && !out.places && !out.ties && out.playerAge === null) return null;
    return { counts: out, line: `lived in: ${out.ages} ages and ${out.histories} histories filled for ${out.people} people, ${out.places} places, ${out.ties} relations${out.playerAge !== null ? `, the player is ${out.playerAge}` : ''}` };
  }
  /* recastPeople { npcId }: someone the game made up in play under an id
     the cast now has (a story's "Mavis" made as npc_mavis): their record
     becomes the cast's (name, pronouns, role, faction, tags, look, voice,
     personality, goal, secret, relations, home), their memories, attitude,
     meetings and every reference stay (the id is the same), the made-in-
     play record (created, unnamed) goes, and they leave their old schedule
     (castSchedules gives them the cast's). */
  function recastPerson(e) {
    if (!isObj(e)) bad('must be an object');
    const n = needNpc(e.npcId);
    const t = castTown();
    const rec = t ? t.npcs.find(x => x.id === n.id) : null;
    if (!rec) bad(`${n.id} is not in the cast`);
    if (!isObj(n.created) || n.created.by === 'edit') bad(`${n.id} is the cast's own already`);
    const inst = Town.instantiate({ locations: t.locations, npcs: [rec], factions: [], threads: [], seeds: [], rumours: [] }).npcs[0];
    const was = n.name;
    for (const k of ['name', 'pronouns', 'role', 'factionId', 'tags', 'look', 'voice', 'personality', 'goal', 'secret']) n[k] = deepCopy(inst[k]);
    if (n.factionId && !faction(n.factionId)) n.factionId = null;
    n.relations = (inst.relations || []).filter(r => npc(r.npcId)).map(r => ({ npcId: r.npcId, relation: r.relation }));
    delete n.created;
    delete n.unnamed;
    removeFromSchedules(n.id);
    if (inst.home && loc(inst.home.locationId)) n.home = deepCopy(inst.home); else delete n.home;
    return `${n.id} (${was}) is the cast's ${n.name}`;
  }
  /* castSchedules [{ locationId, phase, npcId }]: each one a schedule entry,
     unless that person is already somewhere in that phase, is not free, or
     is dead. One line for the lot. */
  function castSchedules(list) {
    if (!Array.isArray(list)) bad('must be an array');
    let put = 0;
    let skipped = 0;
    for (const e of list) {
      if (!isObj(e) || !PHASES.includes(e.phase)) { skipped += 1; continue; }
      const l = loc(e.locationId);
      const n = npc(e.npcId);
      if (!l || !n || n.alive === false || n.status !== 'free' || scheduledPhases(n.id).includes(e.phase)) { skipped += 1; continue; }
      addToSchedule(l, e.phase, n.id);
      put += 1;
    }
    return put || skipped ? `${put} schedule entries placed${skipped ? `, ${skipped} skipped (already somewhere then, or not free)` : ''}` : null;
  }
  /* mergePlaces { fromId, intoId }: a home someone told the player about
     (a placesRevealed place) that the cast has written: everything that
     points at it moves to the written place, which takes over the told
     record (discovered, heard of until visited), and the told place goes. */
  function mergePlace(e) {
    if (!isObj(e)) bad('must be an object');
    const from = needLoc(e.fromId);
    const into = needLoc(e.intoId);
    if (from === into) bad('a place cannot be merged into itself');
    if (!isObj(from.revealed)) bad(`${from.id} is not a place someone told the player about`);
    const s = current;
    for (const p of PHASES) for (const id of ((from.npcIdsBySchedule || {})[p] || [])) addToSchedule(into, p, id);
    for (const n of s.npcs) {
      if (n.home && n.home.locationId === from.id) n.home.locationId = into.id;
      if (isObj(n.created) && n.created.locationId === from.id) n.created.locationId = into.id;
    }
    if (s.player.locationId === from.id) s.player.locationId = into.id;
    for (const v of s.visits || []) if (v.locationId === from.id) v.locationId = into.id;
    for (const k of Object.keys(s.seen || {})) if (isObj(s.seen[k]) && s.seen[k].locationId === from.id) s.seen[k].locationId = into.id;
    for (const sd of s.seeds) if (isObj(sd.trigger) && sd.trigger.type === 'location' && sd.trigger.value === from.id) sd.trigger.value = into.id;
    for (const t of s.threads) t.linkedIds = Array.from(new Set(t.linkedIds.map(x => (x === from.id ? into.id : x))));
    if (s.pendingScene && s.pendingScene.locationId === from.id) s.pendingScene.locationId = into.id;
    if (Array.isArray(from.items) && from.items.length) into.items = (into.items || []).concat(from.items);
    for (const l of s.locations) if (l !== from) l.exits = l.exits.filter(x => x !== from.id);
    into.discovered = true;
    into.revealed = Object.assign({}, from.revealed, { authored: true });
    s.locations.splice(s.locations.indexOf(from), 1);
    return `${from.id} (${from.name}) is ${into.id} (${into.name})`;
  }
  /* mergePeople { fromId, intoId }: someone the game made up (not in the
     cast) who is a cast member: the cast member keeps their own record and
     takes over knownToPlayer, the made-up person's attitude (when nobody
     had met the cast member yet) and memories (both lists, oldest first,
     at most MEMORY_MAX), and every reference: log addressees, threads,
     seeds, due events, visits, the player's loose ends, rumours, seen,
     relations made in play, told places' owners and the pending scene.
     The made-up record and its schedule go. */
  function mergePerson(e) {
    if (!isObj(e)) bad('must be an object');
    const from = needNpc(e.fromId);
    const into = needNpc(e.intoId);
    if (from === into) bad('a person cannot be merged into themself');
    if (inCast(from.id)) bad(`${from.id} is in the cast; only someone the game made up is merged`);
    const s = current;
    const fresh = !into.knownToPlayer && !(into.memories || []).length;
    if (from.knownToPlayer) into.knownToPlayer = true;
    if (fresh) into.attitude = clamp(toInt(from.attitude) || 0, -100, 100);
    const mems = (into.memories || []).concat(from.memories || []).map((m, i) => ({ m, i })).sort((a, b) => ((a.m.turn | 0) - (b.m.turn | 0)) || a.i - b.i).map(x => x.m);
    while (mems.length > MEMORY_MAX) { const minW = Math.min(...mems.map(x => x.weight)); mems.splice(mems.findIndex(x => x.weight === minW), 1); }
    into.memories = mems;
    const swap = id => (id === from.id ? into.id : id);
    for (const le of s.player.looseEnds || []) le.npcId = swap(le.npcId);
    for (const t of s.threads) t.linkedIds = Array.from(new Set(t.linkedIds.map(swap)));
    for (const sd of s.seeds) {
      if (isObj(sd.origin) && sd.origin.npcId === from.id) sd.origin.npcId = into.id;
      if (isObj(sd.trigger) && sd.trigger.type === 'npc' && sd.trigger.value === from.id) sd.trigger.value = into.id;
    }
    for (const ev of s.dueEvents || []) if (ev.npcId === from.id) ev.npcId = into.id;
    if (Array.isArray(s.visits)) {
      const moved = s.visits.map(v => (v.npcId === from.id ? Object.assign({}, v, { npcId: into.id }) : v));
      s.visits = moved.filter((v, i) => moved.findIndex(w => w.npcId === v.npcId) === i);
    }
    for (const r of s.rumours) {
      if (r.sourceNpcId === from.id) r.sourceNpcId = into.id;
      if (r.heardFrom === from.id) r.heardFrom = into.id;
      if (Array.isArray(r.knownBy)) r.knownBy = Array.from(new Set(r.knownBy.map(swap)));
    }
    for (const entry of s.log) if (entry.to === from.id) { entry.to = into.id; entry.toName = into.name; }
    if (isObj(s.seen) && s.seen[from.id]) {
      const a = s.seen[from.id];
      const b = s.seen[into.id];
      if (!b || (a.turn | 0) > (b.turn | 0)) s.seen[into.id] = a;
      delete s.seen[from.id];
    }
    for (const m of s.npcs) {
      if (m === from || !isObj(m.created) || m.created.relationToNpcId !== from.id) continue;
      if (m === into) { m.created.relationToNpcId = null; m.created.relation = null; if (m.created.by === 'edit') delete m.created; }
      else m.created.relationToNpcId = into.id;
    }
    for (const l of s.locations) if (isObj(l.revealed)) { if (l.revealed.ownerNpcId === from.id) l.revealed.ownerNpcId = into.id; if (l.revealed.byNpcId === from.id) l.revealed.byNpcId = into.id; }
    if (s.pendingScene) for (const k of ['arrived', 'left']) if (Array.isArray(s.pendingScene[k])) s.pendingScene[k] = Array.from(new Set(s.pendingScene[k].map(swap)));
    removeFromSchedules(from.id);
    s.npcs.splice(s.npcs.indexOf(from), 1);
    return { fromId: from.id, intoId: into.id, from: from.name, line: `${from.id} (${from.name}) merged into ${into.id} (${into.name}); memories ${mems.length}` };
  }

  // ----- apply -----
  function apply(diff, opts) {
    const source = (opts && opts.source) || 'engine';
    const result = { applied: [], rejected: [] };
    const ok = (path, what) => result.applied.push(`${path}: ${what}`);
    const no = (path, reason) => result.rejected.push({ path, reason });
    const run = (path, fn) => {
      try {
        const r = fn();
        if (r !== undefined && r !== null && r !== '') ok(path, r);
      } catch (err) {
        if (err instanceof Reject) no(path, err.message);
        else { no(path, 'internal error: ' + err.message); console.error(err); }
      }
    };
    if (!current) { no('', 'no game in progress'); return finish(result, source); }
    if (!isObj(diff)) { no('', 'diff must be an object'); return finish(result, source); }
    syncLedger();
    const s = current;
    const p = s.player;
    const allowed = source === 'model' ? RECORD_KEYS : RECORD_KEYS.concat(ENGINE_KEYS);
    for (const k of Object.keys(diff)) {
      if (!allowed.includes(k)) no(k, ENGINE_KEYS.includes(k) ? 'not allowed from the model' : 'unknown field');
    }
    const val = k => (allowed.includes(k) && diff[k] !== undefined && diff[k] !== null ? diff[k] : undefined);
    const each = (k, fn) => {
      const list = val(k);
      if (list === undefined) return;
      if (!Array.isArray(list)) { no(k, 'must be an array'); return; }
      list.forEach((item, i) => run(`${k}[${i}]`, () => fn(item)));
    };
    const one = (k, fn) => { const v = val(k); if (v !== undefined) run(k, () => fn(v)); };

    // 1. Creation (engine): new entities first so later fields can refer to them.
    each('addLocations', addLocation);
    each('addNpcs', addNpc);
    each('addItems', addSceneItem);
    // A place someone named (record_changes, or Upgrade's re-read as the engine).
    each('placesRevealed', raw => {
      const r = revealPlace(raw, source);
      (result.revealed = result.revealed || []).push(r.id);
      return r.line;
    });
    // A person someone named (record_changes), after the places, so a home named in the same turn takes them in.
    each('peopleRevealed', raw => {
      // The cast is written by hand (rules version 6): the model can name people, never add them.
      if (source === 'model' && s.meta.castFixed === true) bad('the cast is fixed: everyone in town is already written, so nobody new is added');
      const r = revealPerson(raw, source);
      (result.people = result.people || []).push({ id: r.id, named: r.named, renamed: r.renamed });
      return r.line;
    });

    // 2. record_changes
    each('attitudeChanges', c => {
      if (!isObj(c)) bad('must be an object');
      const n = needNpc(c.npcId);
      const d = toInt(c.delta);
      if (d === null) bad('delta must be an integer');
      if (d === 0) return null;
      const used = ledger.attitude[n.id] || 0;
      const allowedDelta = clamp(used + d, -LIMITS.attitudePerTurn, LIMITS.attitudePerTurn) - used;
      if (allowedDelta === 0) bad(`${n.id} attitude already moved ${LIMITS.attitudePerTurn} this turn`);
      const before = n.attitude;
      n.attitude = clamp(before + allowedDelta, -100, 100);
      ledger.attitude[n.id] = used + allowedDelta;
      return `${n.id} ${before} -> ${n.attitude}` + (allowedDelta !== d ? ` (delta ${plusMinus(d)} clamped to ${plusMinus(allowedDelta)})` : '');
    });
    each('newMemories', m => {
      if (!isObj(m)) bad('must be an object');
      const n = needNpc(m.npcId);
      const text = source === 'model' ? shortMemory(m.text) : cleanText(m.text, 400);
      if (!text) bad('memory needs text');
      const w = clamp(toInt(m.weight) || 1, 1, 3);
      // The model gets one memory per person per turn: a heavier one replaces a lighter one from the same turn, a lighter one is dropped.
      if (source === 'model') {
        const sameTurn = n.memories.findIndex(x => x.turn === s.meta.turn && x.model);
        if (sameTurn >= 0) {
          if (n.memories[sameTurn].weight >= w) bad(`${n.id} already has a memory this turn (one per person per turn)`);
          n.memories.splice(sameTurn, 1);
        }
      }
      // Small things fade: weight-1 memories older than MEMORY_STALE_TURNS go when something new arrives.
      n.memories = n.memories.filter(x => x.weight > 1 || s.meta.turn - x.turn <= MEMORY_STALE_TURNS);
      n.memories.push(Object.assign({ turn: s.meta.turn, text, weight: w }, source === 'model' ? { model: true } : {}));
      while (n.memories.length > MEMORY_MAX) {
        const minW = Math.min(...n.memories.map(x => x.weight));
        n.memories.splice(n.memories.findIndex(x => x.weight === minW), 1);
      }
      return `${n.id} remembers "${text}" (weight ${w})`;
    });
    one('goldDelta', v => {
      const d = toInt(v);
      if (d === null) bad('must be an integer');
      if (d === 0) return null;
      if (p.gold + d < 0) bad(`cannot afford ${money(-d)} (have ${money(p.gold)})`);
      const before = p.gold;
      p.gold = Math.min(p.gold + d, 1000000);
      return `gold ${before} -> ${p.gold}`;
    });
    one('hpDelta', v => {
      const d = toInt(v);
      if (d === null) bad('must be an integer');
      if (d === 0) return null;
      const before = p.hp;
      p.hp = clamp(p.hp + d, 0, p.maxHp);
      return `hp ${before} -> ${p.hp}` + (p.hp !== before + d ? ' (clamped)' : '');
    });
    each('itemsGained', it => {
      let id = null;
      let name = '';
      let qty = 1;
      let notes = '';
      if (typeof it === 'string') {
        const t = it.trim();
        if (!t) bad('empty item');
        if (ID_RE.item.test(t)) { id = t; name = (sceneItem(t) || {}).name || knownItemName(t); } else { name = cleanText(t, 60); id = 'item_' + slugify(name); }
      } else if (isObj(it)) {
        name = cleanText(it.name, 60);
        id = typeof it.id === 'string' && ID_RE.item.test(it.id) ? it.id : (name ? 'item_' + slugify(name) : null);
        if (id && !name) name = (sceneItem(id) || {}).name || knownItemName(id);
        qty = clamp(toInt(it.qty) || 1, 1, 99);
        notes = cleanText(it.notes, 120);
      } else bad('item must be a name, an item id or an object');
      if (!id || !name) bad('item needs a name');
      const held = p.inventory.find(i => i.id === id);
      if (held) held.qty = Math.min(99, held.qty + qty);
      else p.inventory.push({ id, name, qty, notes });
      const fromScene = !!sceneItem(id);
      if (fromScene) takeFromScene(id, qty);
      return `gained ${name} x${qty}` + (fromScene ? ' (picked up here)' : '');
    });
    each('itemsLost', it => {
      const ref = isObj(it) ? (it.id || it.name) : it;
      const qty = isObj(it) ? clamp(toInt(it.qty) || 1, 1, 99) : 1;
      const held = findHeld(ref);
      if (!held) bad(`not in inventory: "${ref}"`);
      if (qty > held.qty) bad(`only holding ${held.qty} of ${held.name}`);
      held.qty -= qty;
      if (held.qty <= 0) p.inventory.splice(p.inventory.indexOf(held), 1);
      return `lost ${held.name} x${qty}`;
    });
    each('conditionsAdded', c => {
      if (!isObj(c)) bad('must be an object');
      const name = cleanText(c.name, 60);
      if (!name) bad('condition needs a name');
      const id = typeof c.id === 'string' && ID_RE.cond.test(c.id) ? c.id : 'cond_' + slugify(name);
      const day = s.time.day;
      const until = clamp(toInt(c.untilDay) === null ? day + 1 : toInt(c.untilDay), day, day + 30);
      const cond = { id, name, effect: cleanText(c.effect, 80), untilDay: until };
      const i = p.conditions.findIndex(x => x.id === id);
      if (i >= 0) p.conditions[i] = cond; else p.conditions.push(cond);
      return `condition ${id} until day ${until}`;
    });
    one('playerLocationId', v => {
      const l = needLoc(v);
      if (l.id === p.locationId) return null;
      // A place out of town is talked about, never gone to: the story stays in town.
      if (l.away === true) bad(`${l.id} is out of town; the game never goes there`);
      if (l.closed) bad(`${l.id} is closed`);
      const from = p.locationId;
      p.locationId = l.id;
      l.discovered = true;
      // A place the player had only heard of: the first visit makes it an ordinary place on the map.
      if (isObj(l.revealed) && !l.revealed.visited) l.revealed.visited = true;
      return `${from} -> ${l.id}`;
    });
    each('npcKnownToPlayer', id => { const n = needNpc(id); if (n.knownToPlayer) return null; n.knownToPlayer = true; return `${n.id} known`; });
    each('threadUpdates', u => {
      if (!isObj(u)) bad('must be an object');
      const t = needThread(u.threadId || u.id);
      if (u.status !== undefined && u.status !== null && !THREAD_STATUSES.includes(u.status)) bad('status must be open, resolved or failed');
      const parts = [];
      if (u.status) parts.push(setThreadStatus(t, u.status));
      if (typeof u.knownToPlayer === 'boolean' && u.knownToPlayer !== t.knownToPlayer) { t.knownToPlayer = u.knownToPlayer; parts.push(`${t.id} known ${u.knownToPlayer}`); }
      const summary = cleanText(u.summary, 400);
      if (summary) { t.summary = summary; parts.push(`${t.id} summary updated`); }
      return parts.join('; ') || null;
    });
    each('clockNudges', c => {
      if (!isObj(c)) bad('must be an object');
      const f = needFaction(c.factionId);
      const d = toInt(c.delta);
      if (d !== 1 && d !== -1) bad('delta must be 1 or -1');
      const clock = f.activeClock >= 0 && Array.isArray(f.clocks) ? f.clocks[f.activeClock] : null;
      if (!clock) bad(`${f.id} has no running clock`);
      const used = ledger.clocks[f.id] || 0;
      const allowedDelta = clamp(used + d, -LIMITS.clockPerTurn, LIMITS.clockPerTurn) - used;
      if (allowedDelta === 0) bad(`${f.id} clock already moved this turn`);
      const before = clock.filled;
      clock.filled = clamp(before + allowedDelta, 0, clock.segments);
      ledger.clocks[f.id] = used + allowedDelta;
      return `${f.id} "${clock.label}" ${before} -> ${clock.filled}/${clock.segments}`;
    });
    each('newSeeds', raw => {
      if (ledger.seeds >= LIMITS.seedsPerTurn) bad(`seed limit reached (${LIMITS.seedsPerTurn} per turn)`);
      const sd = normaliseSeed(raw, true);
      s.seeds.push(sd);
      ledger.seeds += 1;
      // The model plants no effects (record_changes has no field for them); any it sends are left out.
      const dropped = isObj(raw) && raw.effects !== undefined && raw.effects !== null ? '; its effects were left out: the model plants none' : '';
      return `seed ${sd.id} planted (${sd.trigger.type} ${sd.trigger.value})${dropped}`;
    });
    each('rumoursHeard', id => {
      const r = rumour(id) || bad(`unknown rumour id "${id}"`);
      if (r.heard) return null;
      r.heard = true;
      // The engine writes the news in the journal with who told it (Pipeline.newsHeard).
      (result.heard = result.heard || []).push(r.id);
      return `${r.id} heard`;
    });
    one('journalEntry', v => {
      if (typeof v !== 'string') bad('must be a string');
      const text = cleanText(v, 300);
      if (!text) return null;
      s.journal.push({ turn: s.meta.turn, text });
      return `journal "${text}"`;
    });

    // 3. Effect ops
    each('effects', e => {
      if (!isObj(e) || typeof e.op !== 'string') bad('effect needs an op');
      const h = Object.prototype.hasOwnProperty.call(EFFECTS, e.op) ? EFFECTS[e.op] : null;
      if (!h) bad(`unknown op "${e.op}"`);
      return `${e.op}: ${h(e)}`;
    });

    // 4. Engine bookkeeping
    each('conditionsRemoved', id => {
      const i = p.conditions.findIndex(c => c.id === id);
      if (i < 0) bad(`no condition "${id}"`);
      p.conditions.splice(i, 1);
      return `removed ${id}`;
    });
    one('storyPointsDelta', v => {
      const d = toInt(v);
      if (d === null) bad('must be an integer');
      if (p.storyPoints + d < 0) bad(`not enough story points (have ${p.storyPoints})`);
      const before = p.storyPoints;
      p.storyPoints = clamp(p.storyPoints + d, 0, LIMITS.storyPoints);
      return `story points ${before} -> ${p.storyPoints}`;
    });
    if (Object.prototype.hasOwnProperty.call(diff, 'lastRollKey') && allowed.includes('lastRollKey')) {
      run('lastRollKey', () => {
        const v = diff.lastRollKey;
        if (v !== null && typeof v !== 'string') bad('must be a string or null');
        if (s.meta.lastRollKey === v) return null;
        s.meta.lastRollKey = v;
        // The record belongs to its key: a new or cleared key drops it, unless this diff brings the new one.
        if (!Object.prototype.hasOwnProperty.call(diff, 'lastRoll')) s.meta.lastRoll = null;
        return v ? 'retry lock set' : 'retry lock cleared';
      });
    }
    if (Object.prototype.hasOwnProperty.call(diff, 'lastRoll') && allowed.includes('lastRoll')) {
      run('lastRoll', () => {
        const v = diff.lastRoll === null ? null : Dice.cleanLock(diff.lastRoll);
        if (diff.lastRoll !== null && !v) bad('must be { key, outcome: granted | failed, line, granted } or null');
        if (v && v.key !== s.meta.lastRollKey) bad('must be the record of the current retry lock (lastRollKey)');
        s.meta.lastRoll = v;
        return v ? `retry lock: ${v.outcome}` : null;
      });
    }
    one('beginTurn', v => {
      if (v !== true) return null;
      s.meta.turn += 1;
      syncLedger();
      return `turn ${s.meta.turn}`;
    });
    one('advanceTime', v => {
      const info = advanceTime(v);
      result.time = info;
      return `${v}: day ${info.to.day} ${info.to.phase}` + (info.healed ? ` (+${info.healed} hp)` : '') + (info.held ? ' (late: night holds until the player sleeps)' : '');
    });
    /* The clock set outright (/cheat time, Upgrade version 4). No phase
       passes, so nothing ticks, and the no-sleep note goes. late needs
       night and the last short (SHORTS_PER_PHASE - 1). */
    one('setTime', v => {
      if (!isObj(v)) bad('must be an object');
      if (!PHASES.includes(v.phase)) bad('phase must be ' + PHASES.join(', '));
      if (!Number.isInteger(v.day) || v.day < 1) bad('day must be a whole number, 1 or more');
      const shorts = v.shorts === undefined || v.shorts === null ? 0 : v.shorts;
      if (!Number.isInteger(shorts) || shorts < 0 || shorts >= SHORTS_PER_PHASE) bad(`shorts must be 0 to ${SHORTS_PER_PHASE - 1}`);
      if (v.late !== undefined && v.late !== null && typeof v.late !== 'boolean') bad('late must be true or false');
      const late = v.late === true;
      if (late && v.phase !== 'night') bad('late is only for night');
      if (late && shorts !== SHORTS_PER_PHASE - 1) bad(`late needs shorts ${SHORTS_PER_PHASE - 1}`);
      const t = s.time;
      const before = clockWords(t);
      t.day = v.day;
      t.phase = v.phase;
      t.shorts = shorts;
      if (late) t.late = true; else delete t.late;
      delete t.noSleep;
      const after = clockWords(t);
      return before === after ? null : `clock ${before} -> ${after}`;
    });
    one('weather', v => {
      if (typeof v !== 'string') bad('must be a string');
      s.flags.weather = cleanText(v, 120);
      return `weather "${s.flags.weather}"`;
    });
    each('seedsFired', id => {
      const sd = seed(id) || bad(`unknown seed id "${id}"`);
      if (sd.fired) bad(`${id} already fired`);
      sd.fired = true;
      return `${id} fired`;
    });
    // ----- the living world (milestone 4) -----
    each('clockFill', c => {
      if (!isObj(c)) bad('must be an object');
      const f = needFaction(c.factionId);
      const clock = f.activeClock >= 0 && Array.isArray(f.clocks) ? f.clocks[f.activeClock] : null;
      if (!clock) bad(`${f.id} has no running clock`);
      const d = toInt(c.delta);
      if (d === null || d === 0) bad('delta must be a non-zero integer');
      const before = clock.filled;
      clock.filled = clamp(before + d, 0, clock.segments);
      return `${f.id} "${clock.label}" ${before} -> ${clock.filled}/${clock.segments}`;
    });
    each('clockNext', id => {
      const f = needFaction(id);
      if (!(f.activeClock >= 0)) bad(`${f.id} has no running clock`);
      const was = f.activeClock;
      f.activeClock = was + 1 < (f.clocks || []).length ? was + 1 : -1;
      return f.activeClock >= 0 ? `${f.id} clock ${was + 1} done, clock ${f.activeClock + 1} starts` : `${f.id} clock ${was + 1} done, no clocks left`;
    });
    each('dueAdd', e => {
      if (!isObj(e)) bad('must be an object');
      const sd = seed(e.seedId) || bad(`unknown seed id "${e.seedId}"`);
      if (!Array.isArray(s.dueEvents)) s.dueEvents = [];
      if (s.dueEvents.some(x => x.seedId === sd.id)) bad(`${sd.id} is already due`);
      const ev = { seedId: sd.id, text: cleanText(e.text, 400) || sd.effect, firedTurn: s.meta.turn, firedDay: s.time.day };
      if (e.npcId !== undefined && e.npcId !== null) ev.npcId = needNpc(e.npcId).id;
      if (e.bring === true && ev.npcId) ev.bring = true;
      s.dueEvents.push(ev);
      return `${sd.id} due`;
    });
    each('dueDone', id => {
      const list = Array.isArray(s.dueEvents) ? s.dueEvents : [];
      const i = list.findIndex(x => x.seedId === id);
      if (i < 0) bad(`"${id}" is not due`);
      list.splice(i, 1);
      return `${id} done`;
    });
    /* Who came and went at the player's place while time passed (Pipeline.passTime).
       The next narration works it in, then sceneChangeDone clears it. */
    one('sceneChange', sc => {
      if (!isObj(sc)) bad('must be an object');
      const l = loc(sc.locationId);
      if (!l) bad('unknown location');
      const ids = arr => (Array.isArray(arr) ? arr : []).map(String).filter(id => npc(id)).slice(0, 6);
      const arrived = ids(sc.arrived);
      const left = ids(sc.left);
      if (!arrived.length && !left.length) { delete s.pendingScene; return 'scene unchanged'; }
      s.pendingScene = { locationId: l.id, day: s.time.day, phase: s.time.phase, arrived, left, cause: cleanText(sc.cause, 20) || 'time' };
      return `scene at ${l.id}: arrived ${arrived.join(', ') || 'nobody'}; left ${left.join(', ') || 'nobody'}`;
    });
    one('sceneChangeDone', () => { delete s.pendingScene; return 'scene change narrated'; });
    each('npcHome', hm => {
      if (!isObj(hm)) bad('must be an object');
      const n = needNpc(hm.npcId);
      const l = needLoc(hm.locationId);
      const ph = phasesOf(hm.phases) || bad('phases must be "all" or a list of phases');
      n.home = { locationId: l.id, phases: ph };
      if (n.alive !== false && n.status === 'free') { removeFromSchedules(n.id, ph); ph.forEach(x => addToSchedule(l, x, n.id)); }
      return `${n.id} lives at ${l.id} (${ph.join(', ')})`;
    });
    each('rumourToldBy', t => {
      if (!isObj(t)) bad('must be an object');
      const r = rumour(t.rumourId) || bad(`unknown rumour id "${t.rumourId}"`);
      const n = needNpc(t.npcId);
      if (!r.heard) bad(`${r.id} has not been heard`);
      if (r.heardFrom === n.id) return null;
      r.heardFrom = n.id;
      return `${r.id} heard from ${n.id}`;
    });
    /* The morning's spread (World): people who learned a rumour. Only the
       free learn (the dead, the far away and the arrested never do); the
       whole entry is checked before anyone is added. */
    each('rumourSpread', t => {
      if (!isObj(t)) bad('must be an object');
      const r = rumour(t.rumourId) || bad(`unknown rumour id "${t.rumourId}"`);
      if (!Array.isArray(t.npcIds)) bad('npcIds must be a list of npc ids');
      for (const id of t.npcIds) {
        const n = needNpc(id);
        if (n.alive === false || n.status !== 'free') bad(`${n.id} is ${n.alive === false ? 'dead' : n.status} and hears nothing`);
      }
      if (!Array.isArray(r.knownBy)) r.knownBy = firstKnowers(r, s.npcs);
      const added = [];
      for (const id of t.npcIds) if (!r.knownBy.includes(id)) { r.knownBy.push(id); added.push(id); }
      return added.length ? `${r.id} now known by ${added.join(', ')} (${r.knownBy.length} in all)` : null;
    });
    /* A line the engine writes in the journal (news the player heard or saw
       happen: "Around town: ..."), dated: the day given (World passes the
       day of the tick it happened in, which a long rest may have left
       behind), else today. The same text is never written twice. kind
       'work' (direction change 16: a job's line, "A shift ... for Dewayne
       Mangum: paid $70.") may say the same thing again on another turn,
       since the same shift can be worked again another day. */
    each('journalNews', v => {
      const text = cleanText(isObj(v) ? v.text : v, 500);
      if (!text) bad('needs text');
      const d = isObj(v) ? toInt(v.day) : null;
      const day = d !== null && d >= 1 && d <= s.time.day ? d : s.time.day;
      const kind = isObj(v) && v.kind === 'work' ? 'work' : 'news';
      if (s.journal.some(j => j.text === text && (kind === 'news' || j.turn === s.meta.turn))) return null;
      s.journal.push({ turn: s.meta.turn, day, text, kind });
      return `journal "${text}"`;
    });
    /* Work done (direction change 16): a job's record in state.work, keyed by
       job id ({ day, turn, times, outcome }), which Town.jobRefusal reads
       for the cooldown and for work done once and for all. */
    one('workDone', v => {
      if (!isObj(v) || typeof v.jobId !== 'string' || !/^job_[a-z0-9_]+$/.test(v.jobId)) bad('needs a jobId');
      if (!isObj(s.work)) s.work = {};
      const was = isObj(s.work[v.jobId]) ? s.work[v.jobId] : null;
      const outcome = cleanText(v.outcome, 30) || 'done';
      s.work[v.jobId] = { day: s.time.day, turn: s.meta.turn, times: (was && Number.isInteger(was.times) ? was.times : 0) + 1, outcome };
      return `${v.jobId} worked on day ${s.time.day} (${outcome})`;
    });
    /* A waiting fight resolved or dropped (Pipeline.comeAt). */
    each('fightDone', id => {
      const list = Array.isArray(s.fights) ? s.fights : [];
      const i = list.findIndex(f => f.id === id);
      if (i < 0) bad(`no fight "${id}" is waiting`);
      list.splice(i, 1);
      return `${id} done`;
    });
    each('visits', v => {
      if (!isObj(v)) bad('must be an object');
      const n = needNpc(v.npcId);
      const l = needLoc(v.locationId);
      if (n.alive === false || n.status !== 'free') bad(`${n.id} is ${n.alive === false ? 'dead' : n.status}`);
      if (l.away === true) bad(`${l.id} is out of town`);
      if (l.closed) bad(`${l.id} is closed`);
      return addVisit(n, l);
    });
    one('chronicleEntry', c => {
      if (!isObj(c)) bad('must be an object');
      const from = toInt(c.fromTurn);
      const to = toInt(c.toTurn);
      const summary = typeof c.summary === 'string' ? c.summary.trim().slice(0, 1200) : '';
      if (from === null || to === null || to < from) bad('needs fromTurn <= toTurn');
      if (!summary) bad('needs a summary');
      s.chronicle.push({ fromTurn: from, toTurn: to, summary });
      const before = s.log.length;
      s.log = s.log.filter(e => e.turn < from || e.turn > to);
      return `chronicle ${from}-${to} (${before - s.log.length} log entries dropped)`;
    });
    one('logEntry', e => {
      if (!isObj(e)) bad('must be an object');
      const entry = {
        turn: s.meta.turn,
        day: toInt(e.day) || s.time.day,
        phase: PHASES.includes(e.phase) ? e.phase : s.time.phase,
        input: typeof e.input === 'string' ? e.input.trim().slice(0, 2000) : '',
        roll: isObj(e.roll) ? deepCopy(e.roll) : null,
        narration: typeof e.narration === 'string' ? e.narration.trim().slice(0, 6000) : ''
      };
      if (e.mock === true) entry.mock = true;
      /* How the input was meant (the composer's Do / Say): mode 'do' or
         'say'; a Say entry also names who it was said to (to: an npc id or
         'everyone', toName: their name then). input is then the exact
         words. Entries without a mode (older saves, commands, the arrival)
         read as Do. */
      if (e.mode === 'do') entry.mode = 'do';
      else if (e.mode === 'say') {
        entry.mode = 'say';
        entry.to = typeof e.to === 'string' && (e.to === 'everyone' || ID_RE.npc.test(e.to)) ? e.to : 'everyone';
        entry.toName = entry.to === 'everyone' ? null : (cleanText(e.toName, 80) || null);
        // What the player called them at the time ('the mechanic' before an introduction); display only.
        entry.toLabel = entry.to === 'everyone' ? null : (cleanText(e.toLabel, 80) || null);
      }
      /* Where the narration left the player (a known place given, else
         where they stand when the entry is written: a move's turn belongs to
         the place it arrived at), and the turn the player came to that
         place (sceneFrom: carried on from the entry before while they stay,
         so it survives the chronicle dropping older entries). The narrator's
         THIS SCENE is every entry since (Pipeline.sceneTurns). Entries
         without them (older saves) belong to no scene. */
      entry.locationId = typeof e.locationId === 'string' && s.locations.some(l => l.id === e.locationId) ? e.locationId : p.locationId;
      const prev = s.log[s.log.length - 1];
      entry.sceneFrom = prev && prev.locationId === entry.locationId && Number.isInteger(prev.sceneFrom) ? prev.sceneFrom : entry.turn;
      s.log.push(entry);
      if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
      noteSeen(s, entry);
      return `log turn ${entry.turn}`;
    });
    one('defeat', d => {
      if (!isObj(d) || !DEFEAT_OUTCOMES.includes(d.outcome)) bad('outcome must be ' + DEFEAT_OUTCOMES.join(', '));
      p.lastDefeat = { turn: s.meta.turn, day: s.time.day, outcome: d.outcome };
      p.defeats = (p.defeats | 0) + 1;
      if (d.outcome === 'dead') { p.dead = true; p.hp = 0; }
      return `defeated: ${d.outcome}`;
    });
    one('addLooseEnd', le => {
      if (!isObj(le) || !LOOSE_END_KINDS.includes(le.kind)) bad('needs a loose-end kind');
      needNpc(le.npcId);
      p.looseEnds = p.looseEnds || [];
      p.looseEnds.push({
        kind: le.kind, label: cleanText(le.label, 60), text: cleanText(le.text, 200), npcId: le.npcId,
        seedId: le.seedId || null, threadId: le.threadId || null, created: le.created === true
      });
      return `loose end ${le.kind} -> ${le.npcId}`;
    });
    // ----- bringing an older game up to date (Upgrade) -----
    each('setMemories', e => {
      if (!isObj(e)) bad('must be an object');
      const n = needNpc(e.npcId);
      const list = checkMemories(e.memories, false);
      const before = (n.memories || []).length;
      n.memories = list;
      return `${n.id} memories rewritten (${before} -> ${list.length})`;
    });
    /* A person's record corrected to match the story (Upgrade version 5;
       the People card's pronoun chips and /pronouns). Everything is checked
       before anything changes; the id and memories stay. New pronouns turn
       a gendered relation, role and tag with them (turnRelation) and the
       look and voice lines (turnLines), unless the fix states those itself.
       A new home takes over from the old one (setHome). */
    each('fixPeople', f => {
      if (!isObj(f)) bad('must be an object');
      const n = needNpc(f.npcId);
      const has = k => f[k] !== undefined && f[k] !== null && f[k] !== '';
      const name = has('name') ? personName(n, f.name) : null;
      const pron = has('pronouns') ? (validPronouns(f.pronouns) || bad('pronouns must be he, she or they')) : null;
      const pronWas = n.pronouns;
      const pronChanged = !!pron && pronWas !== pron;
      const relTo = has('relationToNpcId') ? needNpc(f.relationToNpcId) : null;
      if (relTo && relTo.id === n.id) bad('a person cannot be related to themself');
      const relation = relTo ? cleanRelation(f.relation) || null : null;
      const home = has('homeLocationId') ? needLoc(f.homeLocationId) : null;
      const parts = [];
      const set = (k, v, show) => { if (v && n[k] !== v) { parts.push(show ? `${k} ${JSON.stringify(n[k] || '')} -> ${JSON.stringify(v)}` : `${k} replaced`); n[k] = v; } };
      if (name) { set('name', name, true); delete n.unnamed; }
      if (pron) set('pronouns', pron, true);
      set('role', cleanText(f.role, 60), true);
      set('look', cleanText(f.look, 200), false);
      set('voice', cleanText(f.voice, 200), false);
      if (relTo) {
        if (!isObj(n.created)) n.created = { turn: null, day: null, by: CREATED_BY.includes(f.by) ? f.by : 'tables' };
        if (n.created.relationToNpcId !== relTo.id || n.created.relation !== relation) { n.created.relationToNpcId = relTo.id; n.created.relation = relation; parts.push(`${relation || 'related'} of ${relTo.id}`); }
      } else if (pron) parts.push(...turnRelation(n, pron, has('role')));
      if (pronChanged) parts.push(...turnLines(n, pron, has, pronWas));
      // A wife, husband or child with no home named moves in with the person they belong to, as a person the story names does
      // (a tables-made person was put wherever the player first asked for them, so "home" was the gas station).
      const shared = !home && relTo && relation && HOUSEHOLD_RELATIONS.includes(relation) ? homeOf(relTo) : null;
      const at = home || shared;
      if (at && !(n.home && n.home.locationId === at.id && scheduledPhases(n.id).length)) parts.push(setHome(n, at));
      return parts.length ? `${n.id}: ${parts.join('; ')}` : null;
    });
    /* The player's own edit of a person (the People card's editor, /edit:
       App.editPerson, source 'player'). One object, or a list of them. */
    const edits = val('editPerson');
    const editOne = (path, raw) => run(path, () => {
      const r = editPerson(raw);
      if (!r) return null;
      (result.edited = result.edited || []).push({ id: r.id, fields: r.fields });
      return r.line;
    });
    if (Array.isArray(edits)) edits.forEach((x, i) => editOne(`editPerson[${i}]`, x));
    else if (edits !== undefined) editOne('editPerson', edits);
    // ----- the full cast (Upgrade version 6), in this order -----
    one('addCast', v => addCast(v));
    each('recastPeople', e => recastPerson(e));
    each('mergePlaces', e => mergePlace(e));
    one('castSchedules', list => castSchedules(list));
    each('mergePeople', e => {
      const r = mergePerson(e);
      (result.merged = result.merged || []).push({ fromId: r.fromId, intoId: r.intoId, from: r.from });
      return r.line;
    });
    one('livedIn', v => { const r = livedIn(v); if (!r) return null; result.livedIn = r.counts; return r.line; });
    one('castFixed', v => {
      if (v !== true) bad('must be true');
      if (s.meta.castFixed === true) return null;
      s.meta.castFixed = true;
      return 'the cast is fixed: nobody is made up in play';
    });
    one('rulesVersion', v => {
      if (!Number.isInteger(v) || v < 1 || v > RULES_VERSION) bad(`must be a whole number from 1 to ${RULES_VERSION}`);
      if (s.meta.rulesVersion === v) return null;
      const before = rulesVersion(s);
      s.meta.rulesVersion = v;
      return `rules version ${before} -> ${v}`;
    });

    return finish(result, source);
  }
  /* A model's memory line, made short: no "Remembers:" label or full stop,
     at most MEMORY_TEXT_MAX characters, cut at a word (the bookkeeper's
     newMemories and Upgrade's rewrite). */
  function shortMemory(v) {
    let text = cleanText(v, 400).replace(/^(remembers|memory)\s*[:-]\s*/i, '').replace(/\.$/, '');
    if (text.length > MEMORY_TEXT_MAX) { text = text.slice(0, MEMORY_TEXT_MAX); const sp = text.lastIndexOf(' '); if (sp > 60) text = text.slice(0, sp); }
    return text;
  }
  /* The rules a game is up to: meta.rulesVersion, or 1 for a save from
     before the field existed. Loading never adds it, so an older save stays
     exactly as it was until it is updated. */
  function rulesVersion(st) {
    const v = st && isObj(st.meta) ? st.meta.rulesVersion : undefined;
    return Number.isInteger(v) && v >= 1 ? v : 1;
  }

  function finish(result, source) {
    const turn = current ? current.meta.turn : 0;
    for (const r of result.rejected) {
      pushDebug({ turn, kind: 'rejected', source, path: r.path, reason: r.reason });
      console.debug('[State.apply] rejected', r.path, '-', r.reason);
    }
    for (const a of result.applied) pushDebug({ turn, kind: 'applied', source, text: a });
    if (result.applied.length) notify();
    return result;
  }
  function pushDebug(entry) {
    debugLog.push(entry);
    if (debugLog.length > DEBUG_MAX) debugLog.splice(0, debugLog.length - DEBUG_MAX);
  }
  function notify() {
    if (muted || !current) return;
    if (batchDepth > 0) { dirty = true; return; }
    for (const fn of listeners) { try { fn(current); } catch (e) { console.error(e); } }
  }
  /* Batching: the Pipeline wraps each turn in beginBatch()/endBatch() so the
     listeners (autosave, render) hear about it once, when the outermost batch
     closes, and never see a half-applied turn (SPEC.md section 13: one
     autosave after every turn). Depth-counted, so batches nest. A change
     outside any batch (character creation, a load, /undo) notifies at once. */
  function beginBatch() { batchDepth += 1; }
  function endBatch() {
    if (batchDepth > 0) batchDepth -= 1;
    if (batchDepth === 0 && dirty) { dirty = false; notify(); }
  }

  // ----- lifecycle -----
  function checkStats(stats, base) {
    if (!isObj(stats)) throw new Error('stats missing');
    let up = 0;
    let down = 0;
    for (const k of STATS) {
      const v = stats[k];
      if (!Number.isInteger(v) || v < -1 || v > 3) throw new Error(`${k} must be between -1 and 3`);
      const d = v - (base[k] | 0);
      if (d > 0) up += d; else down -= d;
    }
    if (up !== down || up > 1) throw new Error('you may move one point from one stat to another');
    return STATS.reduce((o, k) => { o[k] = stats[k]; return o; }, {});
  }
  /* The player's age: a whole number from AGE_MIN to AGE_MAX, else the
     background's default (character creation, newGame, Upgrade v7). */
  const AGE_MIN = 16;
  const AGE_MAX = 90;
  function playerAge(v, bg) {
    const a = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
    if (Number.isInteger(a) && a >= AGE_MIN && a <= AGE_MAX) return a;
    if (v !== undefined && v !== null && v !== '') throw new Error(`age must be a whole number from ${AGE_MIN} to ${AGE_MAX}`);
    return bg && Number.isInteger(bg.age) ? bg.age : 30;
  }
  /* character: { name, age?, backgroundId, stats, goal, flaw, looseEnds: [{ kind, text }] }
     opts: { seed, pending } — pending keeps the new game silent (no autosave,
     no render) until commit(), so an abandoned creation never overwrites the
     autosave. */
  function newGame(townData, character, opts) {
    opts = opts || {};
    const bg = BACKGROUNDS.find(b => b.id === character.backgroundId);
    if (!bg) throw new Error('unknown background');
    const name = cleanText(character.name, 40);
    if (!name) throw new Error('name required');
    const stats = checkStats(character.stats || bg.stats, bg.stats);
    const age = playerAge(character.age, bg);
    const t = Town.instantiate(townData);
    const startId = (t.startLocationIds && t.startLocationIds[bg.arrival]) || t.locations[0].id;
    const seedValue = Number.isInteger(opts.seed) ? (opts.seed >>> 0) : Rng.newSeed();
    const reputation = { town: 0 };
    t.factions.forEach(f => { reputation[f.id] = 0; });
    const st = {
      version: 1,
      meta: { seed: seedValue, turn: 0, createdAt: new Date().toISOString(), townName: t.name, townVersion: 1, lastRollKey: null, lastRoll: null, rngCalls: 0, rulesVersion: RULES_VERSION, castFixed: true },
      time: { day: 1, phase: 'morning', shorts: 0 },
      flags: { priceMultiplier: 1, weather: '', season: 'spring' },
      player: {
        name, age, background: bg.name, backgroundId: bg.id,
        goal: cleanText(character.goal, 160), flaw: cleanText(character.flaw, 160),
        stats, hp: 10, maxHp: 10, gold: bg.gold | 0,
        inventory: (bg.items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty || 1, notes: i.notes || '' })),
        conditions: [], reputation, storyPoints: 2, locationId: startId, looseEnds: []
      },
      locations: t.locations,
      npcs: t.npcs,
      factions: t.factions,
      threads: t.threads,
      seeds: t.seeds,
      rumours: t.rumours,
      log: [],
      chronicle: [],
      journal: [],
      dueEvents: [],
      visits: [],
      seen: {}
    };
    // Who knows each rumour: its source to begin with (World spreads it each morning).
    fillKnownBy(st);
    current = st;
    town = deepCopy(townData);
    muted = opts.pending === true;
    undo.length = 0;
    ledger = freshLedger(-1);
    // Season and weather come from the seeded stream, so a seed reproduces a game.
    st.flags.season = Rng.pick(SEASONS);
    st.flags.weather = Tables.weather(st.flags.season);
    for (const le of character.looseEnds || []) Town.resolveLooseEnd(le);
    notify();
    return st;
  }
  function commit() { muted = false; notify(); }
  function clear() { current = null; town = null; muted = false; undo.length = 0; }
  function validateShape(st) {
    const errs = [];
    if (!isObj(st)) return ['state is not an object'];
    if (st.version !== 1) errs.push('unsupported state version');
    if (!isObj(st.meta) || !Number.isFinite(st.meta.seed)) errs.push('meta.seed missing');
    if (!isObj(st.time) || !PHASES.includes(st.time.phase) || !Number.isInteger(st.time.day)) errs.push('time missing');
    if (!isObj(st.player) || !isObj(st.player.stats)) errs.push('player missing');
    for (const k of ['locations', 'npcs', 'factions', 'threads', 'seeds', 'rumours', 'log', 'chronicle', 'journal']) {
      if (!Array.isArray(st[k])) errs.push(`${k} missing`);
    }
    if (!errs.length && !st.locations.some(l => l.id === st.player.locationId)) errs.push('player location unknown');
    return errs;
  }
  function load(st, townData) {
    const errs = validateShape(st);
    if (errs.length) throw new Error(errs.join('; '));
    const s = deepCopy(st);
    // Fill fields older saves may lack (no-ops for current saves).
    s.flags = Object.assign({ priceMultiplier: 1, weather: '', season: 'spring' }, s.flags);
    s.time.shorts = s.time.shorts | 0;
    if (!Number.isInteger(s.meta.rngCalls)) s.meta.rngCalls = 0;
    if (s.meta.lastRollKey === undefined) s.meta.lastRollKey = null;
    // The lock's record (Dice.lockRecord). A save from before granted asks were locked has none: its lock, if any, was a failure, and reads as one.
    const lockRecord = s.meta.lastRollKey ? Dice.cleanLock(s.meta.lastRoll) : null;
    s.meta.lastRoll = lockRecord && lockRecord.key === s.meta.lastRollKey ? lockRecord : null;
    if (!Array.isArray(s.player.looseEnds)) s.player.looseEnds = [];
    // An age that is not a whole number from AGE_MIN to AGE_MAX is dropped; a save without one gets it from Upgrade version 7.
    if (s.player.age !== undefined && !(Number.isInteger(s.player.age) && s.player.age >= AGE_MIN && s.player.age <= AGE_MAX)) delete s.player.age;
    // A person's age or history that is not the right shape is dropped the same way (version 7 fills them from the town).
    for (const n of s.npcs) {
      if (!isObj(n)) continue;
      if (n.age !== undefined && !(Number.isInteger(n.age) && n.age >= 0 && n.age <= EDIT_MAX.age)) delete n.age;
      if (n.history !== undefined && typeof n.history !== 'string') delete n.history;
    }
    if (!Array.isArray(s.dueEvents)) s.dueEvents = [];
    if (!Array.isArray(s.visits)) s.visits = [];
    if (!isObj(s.seen)) s.seen = {};
    // Pronouns, once, for people saved before records carried them.
    fillPronouns(s, townData || TOWN_DATA);
    // A loose end's person remembers it in the short form the narrator reads (older saves held "Loose end with ...").
    fillLooseEndMemories(s);
    // Who knows each rumour (direction change 12): older saves start from its source.
    fillKnownBy(s);
    current = s;
    town = deepCopy(townData || TOWN_DATA);
    muted = false;
    undo.length = 0;
    ledger = freshLedger(-1);
    notify();
    return current;
  }
  function snapshot() {
    if (!current) return null;
    const snap = JSON.stringify(current);
    undo.push(snap);
    if (undo.length > UNDO_MAX) undo.splice(0, undo.length - UNDO_MAX);
    return snap;
  }
  /* restore() pops the newest snapshot; restore(snap) restores a given one
     (and drops it from the stack if it is the newest). */
  function restore(snap) {
    let json = snap;
    if (json === undefined) json = undo.pop();
    else if (undo[undo.length - 1] === json) undo.pop();
    if (!json) return false;
    current = JSON.parse(json);
    ledger = freshLedger(-1);
    notify();
    return true;
  }

  /* Called by the logEntry writer: everyone present with the player in the
     narrated scene (its day and phase), then everyone present now if time
     has moved on since, is seen at the player's location. */
  function noteSeen(s, entry) {
    if (!isObj(s.seen)) s.seen = {};
    const here = s.player.locationId;
    const mark = (day, phase) => {
      for (const n of npcsAt(here, phase)) s.seen[n.id] = { locationId: here, day, phase, turn: s.meta.turn };
    };
    if (entry.day !== s.time.day || entry.phase !== s.time.phase) mark(entry.day, entry.phase);
    mark(s.time.day, s.time.phase);
  }

  // ----- read helpers -----
  /* Who is at a place in a phase: the schedule, except that a visit (an NPC
     who came to the player, World.dueSeeds) puts someone in one place for the
     current day and phase only, and takes them out of their scheduled one. */
  function npcsAt(locId, phase) {
    if (!current) return [];
    const l = loc(locId);
    if (!l) return [];
    const ph = phase || current.time.phase;
    const ids = ((l.npcIdsBySchedule && l.npcIdsBySchedule[ph]) || []).slice();
    const visits = (current.visits || []).filter(v => v.day === current.time.day && v.phase === ph);
    for (const v of visits) {
      const i = ids.indexOf(v.npcId);
      if (v.locationId === l.id) { if (i < 0) ids.push(v.npcId); } else if (i >= 0) ids.splice(i, 1);
    }
    return ids.map(npc).filter(n => n && n.alive && n.status !== 'gone' && n.status !== 'dead');
  }
  function reputationTier(key) {
    if (!current) return 'unknown';
    const v = current.player.reputation[key || 'town'] || 0;
    if (v >= 50) return 'respected';
    if (v >= 20) return 'known';
    if (v <= -50) return 'despised';
    if (v <= -20) return 'feared';
    if (Math.abs(v) >= 5) return 'noticed';
    return 'unknown';
  }
  function attitudeWord(a) {
    if (a <= -60) return 'hostile';
    if (a <= -25) return 'cold';
    if (a < -5) return 'wary';
    if (a <= 5) return 'neutral';
    if (a < 25) return 'friendly';
    if (a < 60) return 'warm';
    return 'loyal';
  }

  return {
    get current() { return current; },
    get town() { return town; },
    get muted() { return muted; },
    RECORD_KEYS, ENGINE_KEYS, LIMITS, LOG_MAX, DEFEAT_OUTCOMES, EFFECT_OPS, RESERVED_FLAGS, SEED_EFFECTS_MAX,
    placeNames, mapPointOf, pathPoints, revealLabel, samePerson, personKey, relationPhrase, relationNote, tiesOf, inCast, castTown, firstName, cleanRelation, splitWho, fillPronouns, fillKnownBy, firstKnowers, homeOf,
    RULES_VERSION, MEMORY_MAX, MEMORY_TEXT_MAX, EDIT_MAX, AGE_MIN, AGE_MAX, playerAge, rulesVersion, shortMemory, phasePart, clockLine,
    apply, newGame, commit, clear, load, validateShape, snapshot, restore, beginBatch, endBatch,
    canUndo: () => undo.length > 0,
    undoDepth: () => undo.length,
    onChange(fn) { listeners.push(fn); },
    debugLog,
    npc, loc, faction, thread, seed, rumour, entityById, npcsAt, reputationTier, attitudeWord
  };
})();

