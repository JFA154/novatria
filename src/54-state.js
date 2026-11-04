// ===== Module: State =====
/* The game state is one JSON object (SPEC.md section 3 plus the additions in
   BUILD_PLAN.md). State.apply(diff) is the only writer once a game exists.

   apply(diff, { source }) accepts:
   - the bookkeeper's record_changes shape (SPEC.md section 10),
   - effects: [{ op, ... }] using the effect-op table in BUILD_PLAN.md,
   - engine-only fields (source 'engine', the default): addNpcs, addLocations,
     addItems ([{ locationId, item }]: things noticed in a place, which
     itemsGained can then pick up), conditionsRemoved, storyPointsDelta,
     lastRollKey, beginTurn, advanceTime, setTime ({ day, phase, shorts,
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
     who had none) and rumourToldBy ([{ rumourId, npcId }]: who told the
     player a heard rumour, when it was not its source); and Upgrade's own:
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
   Wave 1 of the review fixes (docs/notes/engine-state.md has the list):
   apply(diff, { source: 'model', present: [npcIds], rollSuccess, attacked,
   targets, actionType }) (targets and actionType: the action's, which say
   whether money went to a creditor; wave 3)
   holds a bookkeeper's diff to what the turn could do: gold +/-500 and HP
   +/-3 a turn (HP never from above 0 to 0 unless attacked and the roll
   failed), at most 2 items carried in, items refused when their payment was
   refused, one seed, conditions of 3 days at most; npcFates (present
   people, one a turn; dead, arrested and gone only after a successful roll;
   hurt lays them up at home for two days), memoriesSettled (a memory
   matched by its words and dropped) and obligationsSettled; metTurn only
   for people present. A model's memory that starts with the same five
   words as one already held merges into it. Clock nudges are held to one
   segment per faction per day and phase (meta.nudges). New effect ops
   (EFFECT_OPS): playerGold, playerHp, giveItem, placeItem (wave 4: a thing
   left lying in a place), takeItem, addCondition,
   banFrom (state.bans), playerPrice (flags.playerPriceMultiplier until
   flags.playerPriceUntilDay), addMemory, clockAdjust, threadUpdate,
   addObligation and settleObligation (player.obligations), addNews
   (state.news, 60 kept); an id that is still a "{placeholder}" is refused.
   Engine keys: expireDaily (a day number: bans, a price and paid lodging
   that ran out go) and newsSeen (true: every news item seen). Threads
   award a story point and a step of progression (player.progression) only
   the first time they are resolved (resolvedOnce), and an effect never
   moves a resolved thread. The clock: advanceTime takes a cost or
   { cost, toPhaseStart, cause }; six instant actions make a short
   (time.instants); a morning reached without sleep adds Tired, a rough
   rest heals 1 and adds Stiff (restQuality). The calendar (season,
   weekday, dateLine, isClosed) and who is away (awayOn) or laid up
   (hurtUntilDay) are read helpers below.
   Wave 26 (Rel; docs/RELATIONSHIPS_PLAN.md): every person carries rel,
   the tracks under attitude (liking, trust, fear, knows-you, spark, owed),
   and attitude stays on the record as the stored alias of liking: relWrite
   rewrites it after every change, and a direct write to it holds (folded
   into fix at the next recompute). New: the socialEvent effect op and the
   engine's socialEvents (an event of Rel.EVENTS for someone, planned by
   Rel.applyEvent), relSet ({ npcId, w?, t?, f?, k?, s? }, or a list: tracks
   set outright, in fix), relDay (a day number: the morning's step, the old
   drift exactly) and editPerson's rel. attitudeDelta, attitudeChanges and
   meetingRep keep their exact numbers (liking moves in the everyday
   bucket, past its bound in fix); spark above 0 is refused for anyone it
   cannot move for, at every writer. state.leverage and state.known.secrets
   start empty (wave 29 fills them). result.drifted (relDay) counts who
   drifted.
   Wave 29 (what people hold): the engine's leverageAdd (a record, Rel's
   shape: lev_<slug>_<n>), secretShown (the secrets the narrator was given
   this turn, into known.secrets) and the effect ops owedSettle and
   leverageSet; a met blackmail is paid_silence in place of paid_back, in
   the same step, and lapsed is a third way an obligation ends. The
   bookkeeper's goldDelta is refused for someone present who owes the
   player a demand (their seed brings it) or whom the turn's backed ask
   was aimed at (opts.backed: the engine's LEVERAGE line said they hand
   over nothing now). The feed lines of how people stand queue in relFeed
   (takeFeed), quiet on a load, an edit, a rewind or the morning's step.
   Wave 43: spend (engine only; Api.record after every paid call) adds to
   meta.cost { usd, turns, calls, input, output, cacheRead, cacheWrite,
   asked?, noticed? }; an undo, a redo or a rolled-back turn keeps the
   cost the game has now (useEntry), since the money was spent. arc():
   the ending's day, whether it was told, and the next town event.
   Returns { applied: [string], rejected: [{ path, reason }], time?, revealed?, people?, merged?, livedIn?,
   progressed?: [{ threadId, gain }], settled?: [{ id, status }] }. */
const State = (() => {
  let current = null;
  let town = null;
  let muted = false;
  /* The undo stack (wave 16): one entry a step, oldest first, { json (the
     game before the step), town (its town copy, the string shared with the
     entry below when the same), turn (meta.turn then) }. At most UNDO_MAX
     entries and about UNDO_BYTES of text; the oldest go first. Storage
     keeps it in IndexedDB
     (onUndo), so it survives a reload. Wave 48: each entry also has an id
     (unique to it, so Storage writes and removes one IndexedDB record a
     step instead of the whole stack) and th (townHash of its town copy:
     the town is kept once per distinct version, entries refer to it). The redo stack (/redo) holds the
     steps an undo took back, newest last, in memory only; a new step
     empties it (snapshot), unless that step is rolled back (restore(snap):
     a turn that failed or was taken back mid-hand), which gives it back. */
  const undo = [];
  const redo = [];
  const UNDO_MAX = 20;
  const UNDO_BYTES = 8 * 1024 * 1024;
  let redoKept = null;
  // A load, a new game or a clear (stackGen): a stack read back from storage for what was there before is not merged in.
  let stackGen = 0;
  let loaded = null; // { json, turn }: the game as loaded (resumeUndo)
  // Wave 48: an id for each stack entry, unique across reloads (this page's start time, then a count).
  const entryBase = Date.now().toString(36);
  let entrySeq = 0;
  function newEntryId() { entrySeq += 1; return `${entryBase}.${entrySeq.toString(36)}`; }
  const undoListeners = [];
  const LOG_MAX = 30;
  const LOG_NOTES_MAX = 24; // quiet lines kept on one log entry (logEntry / logUpdate notes)
  /* A log entry's quiet lines: a string (shown after the narration, as
     before), or (wave 6, the round-5 playtest's R7: the feed rebuilt after
     /undo or a reload in the order it was shown) { text, day?, phase? (the
     time shown when it was printed: a divider goes before it when that is
     not the entry's), at?: 'before' (printed before the narration),
     'start' (before the roll too: a reroll's "Cheat: success"; the
     integration) or 'after' }. */
  const NOTE_AT = ['start', 'before', 'after'];
  function logNote(x) {
    if (typeof x === 'string') return x.trim() ? x.slice(0, 2000) : null;
    if (!isObj(x) || typeof x.text !== 'string' || !x.text.trim()) return null;
    const n = { text: x.text.slice(0, 2000) };
    if (Number.isInteger(x.day) && x.day >= 1 && PHASES.includes(x.phase)) { n.day = x.day; n.phase = x.phase; }
    if (NOTE_AT.includes(x.at)) n.at = x.at;
    return n;
  }
  function logNotes(v) { return (Array.isArray(v) ? v : []).map(logNote).filter(x => x !== null).slice(-LOG_NOTES_MAX); }
  /* A card game's table as it ended (wave 10; Pipeline.gamble): { stake,
     dealerId, dealerName, marked, cheat, read: { says: 'something' |
     'nothing', right, odds, text }, player and dealer: { dealt, held (the
     positions kept, 0-4), final (five cards each, as Cards writes them:
     'Ks', 'Th'), name }, result: win | lose | split | fold | caught, delta,
     cash (after) }. Wave 11: folded (the player folded, or Stop folded for
     them: stopped), stakeNote ('all': all the cash they had; 'usual': the
     amount named was no stake, so $20) and named (the amount they named,
     when it was not the stake). Wave 12: closed (folded because the page
     was closed with the hand open, L4), stakeNote 'half' (half their cash,
     as asked) and named to the cent ("$0.50 is no stake", L8). The feed
     draws it again after a reload or an /undo, and /reroll replays it;
     anything else is dropped. */
  const CARD_RESULTS = ['win', 'lose', 'split', 'fold', 'caught'];
  /* Wave 13: game ('draw' | 'holdem'; none is draw), at hold'em two cards
     dealt a side and its board (five), shown (how many of the board were
     turned: 0, 3, 4, 5), street (where it ended: 0-3, 4 at the showdown),
     unit (the ante and every bet) and the player's moves; each side's in
     (what it put in), won (what it took), folded and foldedOn (0-3), and
     its read (hold'em: a seat that bet); seats (the others at the table,
     three at most: { id, who, ...a side }); pot, winners ('player' or a
     person's id), showdown (the result before any catch), uncontested,
     win ('armed': /cheat win; 'control': the table's Win), chose (the turn
     set the remembered game). A side's final is null at hold'em when it
     never showed (folded). */
  /* Wave 18 (no-limit betting): moves are Cards.move strings (bet:8,
     raise:24, allin, hold:024 at draw; wave 13's check, bet, call, fold
     and win still read), at draw too; ante is the ante and unit the table's bet (wave 13's unit: the step of every bet), at draw too;
     actions is every action of the hand in order ({ seat: 'player' or an
     id, act: check | bet | raise | call | fold, to (what that seat had bet
     on the round after it), add (what it put in), street (0-3 at hold'em;
     at draw 0 before the draw, 1 after it), allIn }); a side's back is a
     bet nobody called, given back (its in is what stayed in), and hidden
     marks a draw hand that took the pot without being shown. */
  const CARD_SHOWDOWNS = ['win', 'lose', 'split', 'fold'];
  const CARD_ACTS = ['check', 'bet', 'raise', 'call', 'fold'];
  const CARD_MOVES_MAX = 40;
  const CARD_ACTIONS_MAX = 160;
  function logCards(x) {
    if (!isObj(x) || !CARD_RESULTS.includes(x.result)) return null;
    const holdem = x.game === 'holdem';
    const cardsOf = (v, n) => (Array.isArray(v) && v.length === n && v.every(c => Cards.valid(c)) ? v.slice() : null);
    const sum = v => clamp(toInt(v) || 0, 0, 10000000);
    const readOf = r => (isObj(r) && (r.says === 'something' || r.says === 'nothing') ? { says: r.says, right: r.right === true, odds: Number.isFinite(Number(r.odds)) ? clamp(Number(r.odds), 0, 1) : null, text: cleanText(r.text, 120) } : null);
    const side = v => {
      if (!isObj(v)) return null;
      const dealt = cardsOf(v.dealt, holdem ? 2 : 5);
      const fin = cardsOf(v.final, 5);
      if (!dealt || (!fin && !holdem)) return null;
      const out = holdem ? { dealt, final: fin, name: cleanText(v.name, 60) } : { dealt, held: Cards.holdsFrom(v.held), final: fin, name: cleanText(v.name, 60) };
      if (Number.isInteger(v.in)) out.in = sum(v.in);
      if (Number.isInteger(v.won)) out.won = sum(v.won);
      if (v.folded === true) out.folded = true;
      if (Number.isInteger(v.foldedOn) && v.foldedOn >= 0 && v.foldedOn <= 3) out.foldedOn = v.foldedOn;
      if (Number.isInteger(v.back) && v.back > 0) out.back = sum(v.back);
      if (!holdem && v.hidden === true) out.hidden = true;
      const r = holdem ? readOf(v.read) : null;
      if (r) out.read = r;
      return out;
    };
    const player = side(x.player);
    const dealer = side(x.dealer);
    if (!player || !dealer) return null;
    const out = {
      stake: clamp(toInt(x.stake) || 0, 0, 1000000), dealerId: typeof x.dealerId === 'string' && ID_RE.npc.test(x.dealerId) ? x.dealerId : null,
      dealerName: cleanText(x.dealerName, 80) || 'The dealer', marked: x.marked === true, cheat: x.cheat === true,
      player, dealer, result: x.result, delta: toInt(x.delta) || 0, cash: toInt(x.cash) || 0
    };
    if (x.game === 'draw' || holdem) out.game = holdem ? 'holdem' : 'draw';
    const moves = (Array.isArray(x.moves) ? x.moves : []).filter(m => typeof m === 'string' && Cards.move(m) !== null).slice(0, CARD_MOVES_MAX);
    if (holdem) {
      const board = cardsOf(x.board, 5);
      if (!board) return null;
      Object.assign(out, { board, unit: clamp(toInt(x.unit) || 1, 1, 1000000), shown: [0, 3, 4, 5].includes(x.shown) ? x.shown : 5, street: Number.isInteger(x.street) ? clamp(x.street, 0, 4) : 4, moves });
    } else {
      // Wave 18: a draw hand has its house rules (the ante, the table's bet) and its moves too.
      if (Number.isInteger(x.unit) && x.unit >= 1) out.unit = clamp(x.unit, 1, 1000000);
      if (moves.length) out.moves = moves;
    }
    if (Number.isInteger(x.ante) && x.ante >= 1) out.ante = clamp(x.ante, 1, 1000000);
    // Amendment 2: the table's structure (limit, the house game, or no limit) and how often the dealer held the player to the limit.
    if (x.structure === 'limit' || x.structure === 'nolimit') out.structure = x.structure;
    if (Number.isInteger(x.pushback) && x.pushback > 0) out.pushback = clamp(x.pushback, 1, 99);
    if (Array.isArray(x.actions) && x.actions.length) {
      out.actions = x.actions.slice(0, CARD_ACTIONS_MAX).map(a => (isObj(a) && (a.seat === 'player' || (typeof a.seat === 'string' && ID_RE.npc.test(a.seat))) && CARD_ACTS.includes(a.act)
        ? Object.assign({ seat: a.seat, act: a.act, to: sum(a.to), add: sum(a.add), street: clamp(toInt(a.street) || 0, 0, 3) }, a.allIn === true ? { allIn: true } : {}) : null)).filter(Boolean);
    }
    if (Array.isArray(x.seats) && x.seats.length) {
      out.seats = x.seats.slice(0, 3).map(v => {
        const sd = isObj(v) && typeof v.id === 'string' && ID_RE.npc.test(v.id) ? side(v) : null;
        return sd ? Object.assign({ id: v.id, who: cleanText(v.who, 80) || 'Someone' }, sd) : null;
      }).filter(Boolean);
    }
    if (Number.isInteger(x.pot)) out.pot = sum(x.pot);
    if (Array.isArray(x.winners)) out.winners = x.winners.filter(w => w === 'player' || (typeof w === 'string' && ID_RE.npc.test(w))).slice(0, 5);
    if (CARD_SHOWDOWNS.includes(x.showdown)) out.showdown = x.showdown;
    if (x.uncontested === true) out.uncontested = true;
    if (x.win === 'armed' || x.win === 'control') out.win = x.win;
    if (x.chose === true) out.chose = true;
    if (x.folded === true || x.result === 'fold') out.folded = true;
    if (x.stopped === true) out.stopped = true;
    if (x.closed === true) out.closed = true;
    // Told in a plain line, not narrated (wave 20, QA N6: its terms were not said).
    if (x.plain === true) out.plain = true;
    // What the move that finished the hand went in as, when the table changed a typed amount (wave 20, QA N4).
    if (typeof x.amountWhy === 'string' && x.amountWhy.trim()) out.amountWhy = cleanText(x.amountWhy, 200);
    if (x.stakeNote === 'all' || x.stakeNote === 'usual' || x.stakeNote === 'half') out.stakeNote = x.stakeNote;
    if (typeof x.named === 'number' && Number.isFinite(x.named)) out.named = Math.round(clamp(x.named, -1000000, 1000000) * 100) / 100;
    if (!holdem && isObj(x.read) && (x.read.says === 'something' || x.read.says === 'nothing')) out.read = readOf(x.read);
    return out;
  }
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
     an age: addCast, livedIn). 8: "An arc" (the town has a calendar, events
     and an ending; rumours carry their tellers and threads their rewards; a
     loose end still to come carries its obligation, a grudge or favour still
     to come its template's effects; the clock takes { cost, cause }: Upgrade
     anArc). 9: "People who remember" (wave 30: every memory gets the kind
     of thing it was and how long it lasts, trust, fear and knows-you are
     worked out from them with liking exactly the old attitude, an open
     secret stays open, the informant's hold on the player is a record, and
     a council or ending still to come weighs trust: Upgrade peopleRemember,
     relFill). 10: "A town that talks" (wave 31: people have ties to each
     other, from both sides of every relation and the town's own, and what
     the player does from now on reaches the people close to them, overnight
     for a husband or wife, by the next morning for family and work; nothing
     that already happened is spread again: Upgrade townTalks, tiesFill). */
  const RULES_VERSION = 10;
  /* Wave 46: which build this is, for a bug report: shown on the title
     screen's footer, in Settings under Advanced and at the head of Debug
     ("Build: wave 46 · rules v10"). A new wave bumps this one line, and
     CHANGELOG.md's top entry names the same wave (tests/wave46-head). */
  const BUILD = Object.freeze({ wave: 52, date: '2026-11-04' });
  function buildLine() { return `Build: wave ${BUILD.wave} · rules v${RULES_VERSION}`; }
  const DEBUG_MAX = 200;
  const listeners = [];
  const debugLog = [];
  let ledger = freshLedger(-1);
  let batchDepth = 0;
  let dirty = false;

  /* Wave 28: socialEvents is the bookkeeper's (it was the engine's alone
     through wave 27): the wire's events, read by modelSocial. The three
     fields it replaces on the wire (attitudeChanges, newMemories,
     memoriesSettled) stay here as a legacy path, still read when present
     (the engine's own writers, tests, an older core reply). */
  const RECORD_KEYS = ['attitudeChanges', 'newMemories', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'conditionsAdded',
    'playerLocationId', 'npcKnownToPlayer', 'threadUpdates', 'clockNudges', 'newSeeds', 'rumoursHeard', 'placesRevealed', 'peopleRevealed', 'journalEntry',
    'npcFates', 'memoriesSettled', 'obligationsSettled', 'socialEvents'];
  const ENGINE_KEYS = ['addLocations', 'addNpcs', 'addItems', 'effects', 'conditionsRemoved', 'storyPointsDelta', 'lastRollKey', 'beginTurn',
    'advanceTime', 'setTime', 'logEntry', 'seedsFired', 'chronicleEntry', 'weather', 'addLooseEnd', 'defeat',
    'clockFill', 'clockNext', 'dueAdd', 'dueDone', 'visits', 'npcHome', 'rumourToldBy', 'setMemories', 'fixPeople', 'editPerson', 'rulesVersion', 'sceneChange', 'sceneChangeDone',
    'addCast', 'recastPeople', 'mergePlaces', 'castSchedules', 'mergePeople', 'castFixed', 'livedIn', 'expireDaily', 'newsSeen', 'eventsFired',
    'fight', 'logUpdate', 'arcFill', 'giftGiven', 'cardsCheat', 'cardsWin', 'cardGame', 'rewind', 'seedsDropped',
    // Wave 26 (Rel): a track set outright, the morning's step (socialEvents moved to RECORD_KEYS in wave 28).
    'relSet', 'relDay',
    // Wave 27: a turn spent with people, the ask log, a grudge's getting even, where someone stood before the player came.
    'relTurn', 'relAsk', 'relSettle', 'relStart',
    // Wave 29: a leverage record made (the engine's alone), the secrets the narrator was given.
    'leverageAdd', 'secretShown',
    // Wave 30: rules version 9's people and content (Upgrade.peopleRemember).
    'relFill',
    // Wave 31: the town's ties made (a new game, rules version 10), and word getting round (World's step i).
    'tiesFill', 'hearsayDeliver',
    // Wave 43: what this game has cost (meta.cost), added after every paid call (Api.record).
    'spend'];
  /* A person's memories no bookkeeper may settle away (memoriesSettled) and
     no re-read may change (Upgrade): the loose end the player came with and
     a fact bought with a story point. */
  const PROTECTED_MEMORIES = Object.freeze([/^Loose end with /i, /^Fact \(a story point\):/i]);
  function protectedMemory(m) { return !!m && PROTECTED_MEMORIES.some(re => re.test(String(m.text || ''))); }
  // Where an engine-planted seed came from (World reads it for grudges and favours).
  // Wave 27: report, someone telling their protector what the player did (GRUDGE_TEMPLATES of kind report).
  /* Wave 29: leverage (a demand's payment coming), inquiry (the police
     looking into a secret they were told), tell (a holder telling what
     they have on the player), price (a holder naming a price for keeping
     quiet). Wave 40: found_out (someone noticing a clean theft nobody saw, Pipeline.foundOut). */
  const SEED_ORIGINS = Object.freeze(['grudge', 'favour', 'loose_end', 'clock', 'town', 'background', 'report', 'leverage', 'inquiry', 'tell', 'price', 'found_out']);
  const DEFEAT_OUTCOMES = ['robbed', 'captured', 'gutter', 'rescued', 'dead'];
  /* Per-turn and per-game limits. The model* ones hold a bookkeeper's diff
     (source 'model') to what one turn can do; the engine is not held to them. */
  const LIMITS = {
    attitudePerTurn: 25, seedsPerTurn: 2, clockPerTurn: 1, storyPoints: 3, placesPerTurn: 1, revealedPlaces: 12, peoplePerTurn: 1, revealedPeople: 12,
    modelGoldPerTurn: 500, modelHpPerTurn: 3, modelItemsPerTurn: 2, modelSeedsPerTurn: 1, modelConditionDays: 3, fatesPerTurn: 1,
    effectHp: 3, statCap: 3, maxHpCap: 16, instantsPerShort: 6, news: 60, effectList: 12
  };
  // Content note 7: setFlag may never overwrite these (they have their own writers).
  const RESERVED_FLAGS = Object.freeze(['priceMultiplier', 'weather', 'season', 'playerPriceMultiplier', 'playerPriceUntilDay', 'lodgingPaidUntilDay', 'cardsCheat', 'cardsWin', 'cardGame']);
  // What someone owes or is owed (player.obligations; CONTRACTS section 4).
  const OBLIGATION_KINDS = Object.freeze(['debt', 'blackmail', 'promise', 'errand', 'lodging']);
  /* Where an obligation stands (wave 29: lapsed, "can no longer be": a
     blackmail the player's own record over its person made a standoff of,
     or one voided by coming clean; no onMet or onMiss runs; the Journal
     says "Dropped"). */
  const OBLIGATION_STATUSES = Object.freeze(['open', 'met', 'missed', 'lapsed']);
  // What a bookkeeper's npcFates can do to someone present (CONTRACTS section 10).
  const NPC_FATES = Object.freeze(['arrested', 'gone', 'dead', 'hurt']);
  // The calendar (CONTRACTS section 1): day 1 is a Thursday unless the town's calendar says otherwise.
  const WEEKDAYS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DEFAULT_FIRST_WEEKDAY = 4;
  // Goods that are used up where they are bought (TABLES.items.goods kind), never carried.
  const SERVICE_KINDS = ['service', 'drink', 'food'];
  // A night's lodging bought by name ("Night at the motel", "Room at the Riverview").
  const LODGING_RE = /^(?:a\s+)?(?:night|nights|room)\s+(?:at|in)\b/i;
  // Where a paid night gives a real bed (restQuality); a friendly host's bed is anywhere they live or keep.
  const LODGING_TYPES = ['motel', 'inn', 'hotel'];

  /* rel: what events moved each person this turn ({ npcId: { w, t, f, s } },
     the per-turn bounds, Rel.CAPS.turn); classes: the dedupe classes the
     engine recorded for each person this turn (wave 27 drops the
     bookkeeper's duplicates by them); engine: the sign of liking each
     engine event moved for each person this turn ({ npcId: [-1, 1] }: the
     bookkeeper's legacy lines yield to them, wave 27); rep: the town
     reputation events gave this turn (held to World.REP_CAP); acts: the
     acts a caught_you_at was recorded for this turn (one record an act). */
  // Wave 28: events (the engine's this turn, for the bookkeeper's packet), model (the bookkeeper's counted against the caps).
  // Wave 30: touched (each person's bands as the turn found them), harm3 and settled (ids): what App.noteRel's feed lines read (relTouched).
  // Wave 31: graph (what the town's ties moved each person this turn, { w, t }, held to Rel.CAPS.graph).
  function freshLedger(turn) { return { turn, attitude: {}, clocks: {}, seeds: 0, places: 0, people: 0, gold: 0, hp: 0, items: 0, fates: 0, rel: {}, classes: {}, engine: {}, rep: 0, acts: {}, events: [], model: { per: {}, total: 0 }, touched: {}, harm3: {}, settled: {}, graph: {} }; }
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
    const out = { id: t.id, title, summary: cleanText(t.summary, 400), status, knownToPlayer: t.knownToPlayer === true, linkedIds: linked.slice() };
    // The stat its first resolution raises (setThreadStatus); without one it is max HP.
    if (STATS.includes(t.reward)) out.reward = t.reward;
    return out;
  }
  function normaliseRumour(r) {
    if (!isObj(r)) bad('rumour must be an object');
    if (typeof r.id !== 'string' || !ID_RE.rum.test(r.id)) bad('rumour id must look like rum_name');
    if (rumour(r.id)) bad(`rumour id "${r.id}" already exists`);
    const text = cleanText(r.text, 300);
    if (!text) bad('rumour needs text');
    if (r.sourceNpcId !== null && r.sourceNpcId !== undefined) needNpc(r.sourceNpcId);
    // Rumours added during play are news (Pipeline.pickRumour spreads them first);
    // one a faction's clock added also carries that faction (its members know it).
    const out = { id: r.id, text, true: r.true !== false, sourceNpcId: r.sourceNpcId || null, heard: r.heard === true, addedTurn: current.meta.turn, addedDay: current.time.day };
    if (typeof r.factionId === 'string' && faction(r.factionId)) out.factionId = r.factionId;
    // Hearing it makes its thread known (rumoursHeard).
    if (typeof r.threadId === 'string' && thread(r.threadId)) out.threadId = r.threadId;
    return out;
  }
  /* A list of effect ops kept to run later (a seed's effects, its alt, an
     obligation's onMet and onMiss): objects with a known op, at most
     LIMITS.effectList, copied. Placeholders are checked when they run. */
  function effectList(list, where) {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) bad(`${where} must be a list of effects`);
    if (list.length > LIMITS.effectList) bad(`${where}: at most ${LIMITS.effectList} effects`);
    return list.map((e, i) => {
      if (!isObj(e) || !EFFECT_OPS.includes(e.op)) bad(`${where}[${i}]: unknown op "${isObj(e) ? e.op : e}"`);
      return deepCopy(e);
    });
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
      case 'location':
      case 'npc': {
        // An engine seed may name several ("any of these places", CONTRACTS section 3); the model's names one.
        const need = tr.type === 'location' ? needLoc : needNpc;
        if (Array.isArray(value)) {
          if (requireAhead) bad(`a ${tr.type} trigger names one ${tr.type === 'location' ? 'place' : 'person'}`);
          const list = value.filter((x, i) => value.indexOf(x) === i);
          if (!list.length || list.length > 8) bad(`a ${tr.type} trigger names 1 to 8`);
          list.forEach(need);
          value = list.length === 1 ? list[0] : list;
        } else need(value);
        break;
      }
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
    let id = typeof raw.id === 'string' && ID_RE.seed.test(raw.id) ? raw.id : `seed_t${current.meta.turn}`;
    id = uniqueId(id, x => !!seed(x));
    const out = { id, cause: cleanText(raw.cause, 300) || 'unrecorded', effect, trigger: { type: tr.type, value }, fired: false, hidden: raw.hidden !== false };
    let notBefore = toInt(raw.notBeforeDay);
    if (requireAhead && tr.type !== 'day') notBefore = Math.max(notBefore || 0, day + 1);
    if (notBefore) out.notBeforeDay = notBefore;
    // Engine seeds only (never the bookkeeper's): who and what planted it.
    if (!requireAhead && isObj(raw.origin) && SEED_ORIGINS.includes(raw.origin.kind)) {
      out.origin = { kind: raw.origin.kind };
      if (typeof raw.origin.npcId === 'string' && npc(raw.origin.npcId)) out.origin.npcId = raw.origin.npcId;
      if (Number.isInteger(raw.origin.template)) out.origin.template = raw.origin.template;
      /* Wave 27: the memory a feeling or a report grew from (key: its
         settlement when it comes due, relSettle), what a report is about
         (why: threat, violence; a grudge planted for a beat-down on someone
         tough: tough), and whom it goes to (protectors: their ids; hidden:
         through a tie the town does not know). */
      if (typeof raw.origin.key === 'string' && raw.origin.key.length <= 80) out.origin.key = raw.origin.key;
      if (typeof raw.origin.why === 'string' && /^[a-z_]{1,20}$/.test(raw.origin.why)) out.origin.why = raw.origin.why;
      if (Array.isArray(raw.origin.protectors)) { const ids = raw.origin.protectors.filter(id => typeof id === 'string' && npc(id)).slice(0, 4); if (ids.length) out.origin.protectors = ids; }
      if (raw.origin.hidden === true) out.origin.hidden = true;
      // Wave 28: the law outside town a report goes to (the county sheriff: a memory on his record and the news), and what it is about (advance, coercion).
      if (typeof raw.origin.fallback === 'string' && npc(raw.origin.fallback)) out.origin.fallback = raw.origin.fallback;
    }
    // The turn an engine seed was planted on (wave 27: a report, the tough answer): /rewind strikes it with that turn, as it does the bookkeeper's.
    if (!requireAhead && Number.isInteger(raw.turn) && raw.turn >= 0 && raw.turn <= current.meta.turn) out.turn = raw.turn;
    /* Engine seeds may carry effects applied when they fire, what must hold
       then (requires) and what happens instead (alt): CONTRACTS section 3,
       fired by World. Never the bookkeeper's. */
    if (!requireAhead) {
      const effects = effectList(raw.effects, 'effects');
      if (effects.length) out.effects = effects;
      if (isObj(raw.requires)) out.requires = deepCopy(raw.requires);
      if (isObj(raw.alt)) {
        const alt = { text: cleanText(raw.alt.text, 400) };
        const altEffects = effectList(raw.alt.effects, 'alt.effects');
        if (altEffects.length) alt.effects = altEffects;
        out.alt = alt;
      }
    }
    return out;
  }
  /* ----- appointments (wave 22) -----
     The owner, at Pittman's in the morning: Jodie Strayhorn told the player
     "Low Water, back door, half past ten", the player went and knocked
     twice, and Jodie was not there: the engine still had her on her own
     schedule, so the meeting lived only in the narration. A seed planted
     through newSeeds (the bookkeeper's) whose effect names someone in the
     cast (their full name, or a first name nobody else in it has; alive,
     in town and free) and a place (its location trigger, or a day trigger
     with a place named in its words) is an appointment:
     seed.appointment = { npcId, locationId, day, phase, phases, spot?,
     hour? }. phase is the time of day its words name (null for none);
     phases are the phases it covers: that one (both, in day order, when a
     time of day and an hour disagree: "this afternoon at five"), else the
     rest of the day from now (today) or the whole day (a later day). spot
     ("back door") and hour ("half past ten") are the words for it. The
     person is there for those phases (visits: today's as it is planted,
     a later day's when that day's morning comes, World.tick); World fires
     the seed when the player is there in one of them and settles it once
     they have passed (kept, or missed). A seed that names nobody in the
     cast, or no place, is a plain seed as before. */
  const APPT_HOUR = '(1[0-2]|0?[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
  const APPT_AMPM = '(?:\\s*(a\\.?m\\.?|p\\.?m\\.?)(?![a-z]))';
  const APPT_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const APPT_HOURS = [
    // "half past ten", "quarter to six", "twenty past nine"
    { re: new RegExp(`\\b(half|quarter|twenty[- ]five|twenty|ten|five)(?: minutes)? (past|after|to|till|til|of) ${APPT_HOUR}(?![a-z])${APPT_AMPM}?`, 'i'), h: 3, ampm: 4, back: m => /^(?:to|till|til|of)$/i.test(m[2]) },
    // "10:30", "21:00", "10.30 pm"
    { re: new RegExp(`(?<![\\d$.])(2[0-3]|1\\d|0?\\d)[:.]([0-5]\\d)(?!\\d)${APPT_AMPM}?`, 'i'), h: 1, ampm: 3 },
    // "ten thirty", "six o'clock", "6 pm", "six p.m."
    { re: new RegExp(`\\b${APPT_HOUR} (?:thirty|fifteen|forty[- ]five|o'?clock)(?![a-z])${APPT_AMPM}?`, 'i'), h: 1, ampm: 2 },
    { re: new RegExp(`\\b${APPT_HOUR}${APPT_AMPM}`, 'i'), h: 1, ampm: 2 },
    // "at six", "before eleven", "around nine"
    { re: new RegExp(`\\b(?:at|by|around|about|before|after|till|until|toward|towards) ${APPT_HOUR}(?![a-z0-9]|\\s*(?:of|hundred|thousand|grand|dollars|bucks|minutes|hours|days|weeks|months|years|miles|people|men|women|times|more|others)\\b)`, 'i'), h: 1 }
  ];
  // Times that are past or every day ("last night", "yesterday morning", "every evening") name no meeting.
  const apptNotNow = t => t.replace(/\b(?:last|yesterday|the other|every)\s+(?:night|morning|afternoon|evening)s?\b|\byesterday\b|\bnights?\s+ago\b/g, ' ');
  // The times of day the words name, as the phase each falls in (the earliest named counts).
  const APPT_PHASE_WORDS = [
    ['night', /\b(?:tonight|to-night|at night|night|last call|closing(?: time)?|midnight)\b/],
    ['evening', /\b(?:evening|supper(?:time)?|dinner(?:time)?|sundown|sunset|dusk)\b/],
    ['afternoon', /\b(?:afternoon|noon|midday|lunch(?:time)?)\b/],
    ['morning', /\b(?:morning|dawn|daybreak|sunup|sunrise|breakfast|first thing|before (?:opening|it opens|they open|she opens|he opens|we open))\b/]
  ];
  // Words that end a spot ("the Low Water's back door at ...").
  const APPT_STOP = new Set(['at', 'by', 'around', 'about', 'before', 'after', 'in', 'on', 'to', 'for', 'when', 'from', 'with', 'and', 'until', 'till', 'as', 'so', 'where', 'while', 'if', 'then', 'tonight', 'tomorrow', 'today', 'this', 'that', 'once', 'because', 'or', 'but', 'the', 'a', 'an', 'is', 'was', 'will', 'waits', 'waiting', 'expects', 'meets']);
  const apptLower = text => String(text || '').toLowerCase().replace(/[’‘]/g, "'");
  // Where a word or name starts in lower-cased text, as a whole word; -1 when it is not there.
  function apptAt(t, phrase) {
    const m = new RegExp(`(^|[^a-z])${escRe(phrase)}(?![a-z])`).exec(t);
    return m ? m.index + m[1].length : -1;
  }
  /* The hour the words name: { h (1-12, or 0-23 written so), ampm ('am',
     'pm', or null), said (the words: "half past ten") }, or null. */
  function apptHour(text) {
    for (const x of APPT_HOURS) {
      const m = x.re.exec(String(text || ''));
      if (!m) continue;
      const raw = String(m[x.h]).toLowerCase();
      let h = APPT_NUM[raw] !== undefined ? APPT_NUM[raw] : parseInt(raw, 10);
      if (!Number.isInteger(h) || h > 23) continue;
      // "quarter to eleven" is in the ten o'clock hour.
      if (x.back && x.back(m)) h = h === 1 ? 12 : h - 1;
      const ampm = x.ampm && m[x.ampm] ? m[x.ampm].toLowerCase().replace(/\./g, '') : null;
      return { h, ampm, said: m[0].trim().replace(/[.,;:]+$/, '') };
    }
    return null;
  }
  function apptPhaseWord(t) {
    let best = null;
    for (const [phase, re] of APPT_PHASE_WORDS) {
      const m = re.exec(t);
      if (m && (!best || m.index < best.i)) best = { phase, i: m.index };
    }
    return best ? best.phase : null;
  }
  /* The phase an hour falls in: 5-11 morning, 12-16 afternoon, 17-20
     evening, 21-4 night. An hour without a.m. or p.m. is read with the
     time of day the words name ("this evening at seven" is 19, "tonight at
     one" the small hours); with none, 1 to 4 is the afternoon ("at two"). */
  function apptHourPhase(hour, said) {
    let h = hour.h;
    if (hour.ampm === 'pm' && h < 12) h += 12;
    else if (hour.ampm === 'am' && h === 12) h = 0;
    else if (!hour.ampm && h >= 1 && h <= 12) {
      if (said === 'night' && h === 12) h = 0;
      else if (said === 'night' && h <= 4) { /* the small hours */ }
      else if (said && said !== 'morning' && h < 12) h += 12;
      else if (!said && h <= 4) h += 12;
    }
    return h >= 5 && h <= 11 ? 'morning' : h >= 12 && h <= 16 ? 'afternoon' : h >= 17 && h <= 20 ? 'evening' : 'night';
  }
  /* The day the words name: { day, explicit } ("tomorrow", "the day after
     tomorrow", "tonight", "today", "this afternoon", a weekday: the next
     one, today if it is today), or null. */
  function apptDay(t, today) {
    if (/\b(?:the )?day after tomorrow\b/.test(t)) return { day: today + 2 };
    if (/\btomorrow\b/.test(t)) return { day: today + 1 };
    if (/\b(?:tonight|to-night|today|this (?:morning|afternoon|evening)|later today|later on)\b/.test(t)) return { day: today, explicit: true };
    const wd = WEEKDAYS.find(w => new RegExp(`\\b${w.toLowerCase()}s?\\b`).test(t));
    if (wd) for (let d = today; d < today + 7; d++) if (weekday(d) === wd) return { day: d, explicit: true };
    return null;
  }
  /* Who in the cast the words name first: a full name, or a first name
     nobody else in it has (never the player's own first name). */
  function apptPerson(text) {
    const s = current;
    const t = ' ' + apptLower(text);
    const firsts = new Map();
    for (const n of s.npcs) { const f = firstName(n).toLowerCase(); if (f) firsts.set(f, (firsts.get(f) || 0) + 1); }
    const mine = String(s.player.name || '').trim().split(/\s+/)[0].toLowerCase();
    let best = null;
    for (const n of s.npcs) {
      if (!n.name || n.unnamed) continue;
      let i = apptAt(t, String(n.name).toLowerCase());
      if (i < 0) {
        const f = firstName(n).toLowerCase();
        if (f.length >= 3 && firsts.get(f) === 1 && f !== mine) i = apptAt(t, f);
      }
      if (i >= 0 && (!best || i < best.i)) best = { n, i };
    }
    return best ? best.n : null;
  }
  /* A place's names the words may use: its name, and another name of its
     own (a capital or a possessive) no other place has (as World's
     revealNamedPlaces reads them), without "the". */
  function apptNames(l) {
    const bare = x => apptLower(x).replace(/^the\s+/, '').trim();
    const own = x => /[A-Z]/.test(String(x).replace(/^the\s+/i, '')) || /'s\b|s'(?=\s|$)/.test(String(x).replace(/[’]/g, "'"));
    const held = new Map();
    for (const m of current.locations) for (const x of [m.name].concat(Array.isArray(m.aka) ? m.aka : [])) held.set(bare(x), (held.get(bare(x)) || 0) + 1);
    return [l.name].concat((Array.isArray(l.aka) ? l.aka : []).filter(x => own(x) && held.get(bare(x)) === 1)).map(bare).filter(x => x.length >= 4);
  }
  // The place in town the words name first (a day trigger's meeting place).
  function apptPlace(text) {
    const t = ' ' + apptLower(text);
    let best = null;
    for (const l of current.locations) {
      if (l.away === true) continue;
      for (const x of apptNames(l)) {
        const i = apptAt(t, x);
        if (i >= 0 && (!best || i < best.i || (i === best.i && x.length > best.len))) best = { l, i, len: x.length };
      }
    }
    return best ? best.l : null;
  }
  /* The spot at the place: "the Low Water's back door", "the back door of
     the Low Water", "the Low Water (back door)"; up to three words. */
  function apptSpot(text, l) {
    const t = apptLower(text);
    const timeWord = w => APPT_PHASE_WORDS.some(([, re]) => re.test(w)) || APPT_NUM[w] !== undefined || /^\d/.test(w);
    for (const x of apptNames(l)) {
      const i = apptAt(t, x);
      if (i < 0) continue;
      const after = t.slice(i + x.length);
      const poss = /^'s?\s+([a-z][a-z -]*)/.exec(after);
      if (poss) {
        const out = [];
        for (const w of poss[1].trim().split(/\s+/)) { if (APPT_STOP.has(w) || timeWord(w)) break; out.push(w); if (out.length === 3) break; }
        if (out.length) return out.join(' ');
      }
      const before = /\bthe ((?:[a-z]+ ){0,2}[a-z]+) (?:of|behind|outside|beside) (?:the )?$/.exec(t.slice(0, i));
      if (before && !before[1].split(' ').some(w => APPT_STOP.has(w) || timeWord(w) || w === 'player')) return before[1];
      const par = /^\s*\(([^)]{2,40})\)/.exec(after);
      if (par) return par[1].trim();
    }
    return null;
  }
  /* The appointment a seed is (above), or null. */
  function appointmentOf(sd) {
    const s = current;
    const tr = isObj(sd) ? sd.trigger : null;
    if (!isObj(tr) || (tr.type !== 'location' && tr.type !== 'day')) return null;
    const n = apptPerson(sd.effect);
    if (!n || n.alive === false || n.status !== 'free') return null;
    const l = tr.type === 'location' ? (typeof tr.value === 'string' ? loc(tr.value) : null) : apptPlace(sd.effect);
    if (!l || l.away === true || l.closed === true) return null;
    const t = apptNotNow(apptLower(sd.effect));
    const today = s.time.day;
    const now = PHASES.indexOf(s.time.phase);
    const named = tr.type === 'day' ? { day: toInt(tr.value), explicit: true } : apptDay(t, today);
    let day = named && Number.isInteger(named.day) ? named.day : today;
    if (day < today) return null;
    const said = apptPhaseWord(t);
    const hour = apptHour(t);
    const phase = hour ? apptHourPhase(hour, said) : said;
    let phases = phase ? PHASES.filter(p => p === phase || p === said) : PHASES.slice();
    if (day === today) {
      const left = phases.filter(p => PHASES.indexOf(p) >= now);
      if (left.length) phases = left;
      // "at half past ten", said in the evening, is tomorrow's; "this morning", said in the evening, is no meeting left to keep.
      else if (named && named.explicit) return null;
      else day = today + 1;
    }
    const out = { npcId: n.id, locationId: l.id, day, phase: phase || null, phases };
    const spot = apptSpot(sd.effect, l);
    if (spot) out.spot = spot;
    if (hour) out.hour = hour.said;
    return out;
  }
  /* The person keeps today's appointment: at its place for each phase it
     covers from now on (the visits op; one it refuses is left out).
     Returns the phases placed. A later day's come at its morning (World). */
  function keepAppointment(sd) {
    const s = current;
    const ap = isObj(sd) ? sd.appointment : null;
    const t = s.time;
    if (!isObj(ap) || ap.day !== t.day) return [];
    // Someone with the player now who is to meet them elsewhere: they stay in this scene while a later phase holds the meeting;
    // when this phase is its only one, they go now, and the next narration shows them leaving (a change of scene).
    const here = s.player.locationId;
    const before = npcsAt(here).map(n => n.id);
    const withPlayer = here !== ap.locationId && before.includes(ap.npcId);
    const later = ap.phases.some(ph => PHASES.indexOf(ph) > PHASES.indexOf(t.phase));
    const placed = [];
    for (const ph of ap.phases) {
      if (PHASES.indexOf(ph) < PHASES.indexOf(t.phase)) continue;
      if (ph === t.phase && withPlayer && later) continue;
      try { addVisit({ npcId: ap.npcId, locationId: ap.locationId, day: ap.day, phase: ph, seedId: sd.id }); placed.push(ph); } catch (err) { if (!(err instanceof Reject)) throw err; }
    }
    if (withPlayer && placed.includes(t.phase) && !npcsAt(here).some(n => n.id === ap.npcId)) {
      const ps = isObj(s.pendingScene) && s.pendingScene.locationId === here ? s.pendingScene : null;
      if (ps) {
        ps.arrived = (Array.isArray(ps.arrived) ? ps.arrived : []).filter(x => x !== ap.npcId);
        if (!Array.isArray(ps.left)) ps.left = [];
        if (!ps.left.includes(ap.npcId)) ps.left.push(ap.npcId);
      } else s.pendingScene = { locationId: here, day: t.day, phase: t.phase, arrived: [], left: [ap.npcId], cause: 'appointment', before };
    }
    return placed;
  }
  /* The visits op: { npcId, locationId, day?, phase?, seedId? } puts
     someone in one place for one phase (npcsAt), and out of their
     scheduled one. For now, or (wave 3) for the phase a walk lands in:
     this phase or a later one today, or the morning after a night, so
     someone who comes for the player at the end of a walk that crosses
     into the next phase is there when they arrive (and stays, as visits
     for the phase that has come do). seedId (wave 22): the appointment
     that placed it, so the visit goes with its seed. */
  function addVisit(v) {
    const s = current;
    if (!isObj(v)) bad('must be an object');
    const n = needNpc(v.npcId);
    const l = needLoc(v.locationId);
    if (n.alive === false || n.status !== 'free') bad(`${n.id} is ${n.alive === false ? 'dead' : n.status}`);
    if (l.away === true) bad(`${l.id} is out of town`);
    if (l.closed) bad(`${l.id} is closed`);
    let day = s.time.day;
    let phase = s.time.phase;
    if (v.phase !== undefined && v.phase !== null) {
      if (!PHASES.includes(v.phase)) bad(`phase must be ${PHASES.join(', ')}`);
      const d = v.day === undefined || v.day === null ? s.time.day : toInt(v.day);
      const later = d === s.time.day ? PHASES.indexOf(v.phase) >= PHASES.indexOf(s.time.phase) : d === s.time.day + 1 && s.time.phase === 'night' && v.phase === PHASES[0];
      if (!later) bad('a visit is for now or the phase a walk lands in');
      day = d;
      phase = v.phase;
    }
    if (!Array.isArray(s.visits)) s.visits = [];
    // One visit per person and phase (wave 4): someone who came for the player now can be kept there for the phase the turn runs into too.
    s.visits = s.visits.filter(x => !(x.npcId === n.id && x.day === day && x.phase === phase));
    const entry = { npcId: n.id, locationId: l.id, day, phase };
    if (typeof v.seedId === 'string' && seed(v.seedId)) entry.seedId = v.seedId;
    s.visits.push(entry);
    return `${n.id} at ${l.id} for day ${day} ${phase}`;
  }
  /* A seed out of the story (seedsDropped, a replaced appointment): gone,
     with the visits it placed from now on. */
  function dropSeed(sd) {
    const s = current;
    s.seeds = s.seeds.filter(x => x !== sd);
    const at = s.time.day * PHASES.length + PHASES.indexOf(s.time.phase);
    if (Array.isArray(s.visits)) s.visits = s.visits.filter(v => !(isObj(v) && v.seedId === sd.id && Number.isInteger(v.day) && v.day * PHASES.length + PHASES.indexOf(v.phase) >= at));
  }
  /* For the narrator, the People card and the feed: the words of an
     appointment still to come (its seed not fired, its person free, a phase
     of it not yet past). { seedId, npcId, name, locationId, place ("the Low
     Water"), spot, hour, detail ("back door, half past ten"), when ("this
     morning", "tonight", "tomorrow evening", "Friday evening (Day 9)",
     "today") }. */
  function appointmentWords(sd) {
    const s = current;
    const ap = isObj(sd) ? sd.appointment : null;
    if (!s || !isObj(ap) || sd.fired) return null;
    const n = npc(ap.npcId);
    const l = loc(ap.locationId);
    if (!n || !l || n.alive === false || n.status !== 'free') return null;
    const phases = Array.isArray(ap.phases) ? ap.phases : [];
    const last = phases[phases.length - 1];
    if (!last || ap.day * PHASES.length + PHASES.indexOf(last) < s.time.day * PHASES.length + PHASES.indexOf(s.time.phase)) return null;
    const ph = ap.phase;
    const today = s.time.day;
    let when;
    if (ap.day === today) when = !ph ? 'today' : ph === 'night' ? 'tonight' : `this ${ph}`;
    else if (ap.day === today + 1) when = ph ? `tomorrow ${ph}` : 'tomorrow';
    else when = `${weekday(ap.day)}${ph ? ` ${ph}` : ''} (Day ${ap.day})`;
    const detail = [ap.spot, ap.hour].filter(x => typeof x === 'string' && x).join(', ');
    return { seedId: sd.id, npcId: n.id, name: n.name, locationId: l.id, place: String(l.name).replace(/^The /, 'the '), spot: ap.spot || null, hour: ap.hour || null, detail, when };
  }
  function appointments(npcId) {
    if (!current) return [];
    return current.seeds.filter(sd => isObj(sd.appointment) && (!npcId || sd.appointment.npcId === npcId)).map(appointmentWords).filter(Boolean);
  }
  /* ----- asks (wave 26) -----
     The owner: "a side panel with something like 'Objectives' to track
     what people asked me to do, by when". The bookkeeper records a favour
     or a job someone asks of the player as one newSeeds seed (a day
     trigger for its deadline, else an npc trigger with the person who
     asked), the effect starting with that person's full name. A model seed
     that is no appointment but names someone in the cast (apptPerson: a
     full name, or a first name nobody else has; alive and not gone) is an
     ask: seed.ask = { npcId, dueDay? (the day trigger's day), reward? (the
     reward or the threat its words give) }. Nothing changes in how the
     seed fires; the Objectives tab, the recap and the People card read it
     (askWords) until it fires. */
  // The reward or the threat in an ask's words: what follows a semicolon or a dash, else a sum offered, else "or else ...".
  const ASK_PAY = /\b(?:in exchange for|in return for|for|offering|offers|offered|pays?|paying|will pay|promised?)\s+(\$\s?\d[\d,]*(?:\.\d\d)?(?:\s+(?:cash|in cash|up front|a week|apiece|a head))?)/i;
  const ASK_THREAT = /\b((?:or else|otherwise|or (?:he|she|they)(?:'ll| will| would))\b.*)$/i;
  function askReward(text) {
    const t = cleanText(text, 400).replace(/[’]/g, "'");
    const after = /[;—]\s*(.+)$/.exec(t) || /\s-\s(.+)$/.exec(t);
    const pick = after ? after[1] : (ASK_PAY.exec(t) || [])[1] || (ASK_THREAT.exec(t) || [])[1] || (/\$\s?\d[\d,]*(?:\.\d\d)?/.exec(t) || [])[0] || '';
    return cleanText(pick.replace(/[.!]+$/, ''), 160) || null;
  }
  /* The ask a seed is (above), or null: never an appointment (Meetings
     has those), and never someone dead or gone. */
  function askOf(sd) {
    if (!isObj(sd) || typeof sd.effect !== 'string' || isObj(sd.appointment)) return null;
    const n = apptPerson(sd.effect);
    if (!n || n.alive === false || n.status === 'dead' || n.status === 'gone') return null;
    const out = { npcId: n.id };
    const tr = isObj(sd.trigger) ? sd.trigger : {};
    const d = tr.type === 'day' ? toInt(tr.value) : null;
    if (Number.isInteger(d)) out.dueDay = d;
    const reward = askReward(sd.effect);
    if (reward) out.reward = reward;
    return out;
  }
  /* For the Objectives tab, the recap and the People card: the words of an
     ask (or a plan the player was shown: a seed planted not hidden) that
     has not fired. { seedId, npcId, name, effect, what (the effect after
     the asker's name), reward, dueDay, by ("by Day 6 (Tuesday)", "when you
     next see Travis Cagle", "at the Low Water"), dueIn ("in 3 days",
     "tomorrow", "today", "overdue"; a day trigger's), seeNpcId, locationId,
     place, turn, gone (the person is dead or left town) }, else null. */
  // The player in an ask's words is "you" to the player ("asked the player to" is "asked you to"; "Tester's while" is "your while").
  function toYou(text) {
    let t = String(text || '');
    const name = String(current && current.player.name || '').trim();
    for (const nm of [name, 'the player'].filter(x => x.length >= 2)) {
      const re = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`\\b${re}['’]s\\b`, 'gi'), 'your').replace(new RegExp(`\\b${re}\\b`, 'gi'), 'you');
    }
    return t;
  }
  function askWords(sd) {
    if (!current || !isObj(sd) || sd.fired || isObj(sd.appointment)) return null;
    const ask = isObj(sd.ask) ? sd.ask : null;
    if (!ask && sd.hidden !== false) return null;
    const n = ask && typeof ask.npcId === 'string' ? npc(ask.npcId) : null;
    const tr = isObj(sd.trigger) ? sd.trigger : {};
    const today = current.time.day;
    const said = toYou(sd.effect);
    const out = { seedId: sd.id, npcId: n ? n.id : null, name: n ? n.name : null, effect: sd.effect, said, what: said, reward: ask && typeof ask.reward === 'string' ? toYou(ask.reward) : null,
      dueDay: null, by: null, dueIn: null, seeNpcId: null, locationId: null, place: null, turn: Number.isInteger(sd.turn) ? sd.turn : null, gone: !!n && (n.alive === false || n.status === 'dead' || n.status === 'gone') };
    if (n && said.startsWith(n.name)) out.what = said.slice(n.name.length).replace(/^[\s,:;—-]+/, '');
    if (tr.type === 'day') {
      const d = toInt(tr.value);
      if (Number.isInteger(d)) {
        out.dueDay = d;
        out.by = `by Day ${d} (${weekday(d)})`;
        const left = d - today;
        out.dueIn = left > 1 ? `in ${left} days` : left === 1 ? 'tomorrow' : left === 0 ? 'today' : 'overdue';
      }
    } else if (tr.type === 'npc' && typeof tr.value === 'string' && npc(tr.value)) {
      const m = npc(tr.value);
      out.seeNpcId = m.id;
      out.by = `when you next see ${m.name}`;
    } else if (tr.type === 'location' && typeof tr.value === 'string' && loc(tr.value)) {
      const l = loc(tr.value);
      out.locationId = l.id;
      out.place = String(l.name).replace(/^The /, 'the ');
      out.by = `at ${out.place}`;
    }
    return out;
  }
  function asks(npcId) {
    if (!current) return [];
    return current.seeds.map(askWords).filter(a => a && (!npcId || a.npcId === npcId));
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
    // How they feel (wave 26): their own start, liking exactly as given.
    relWrite(n);
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
     in the order written. Wave 8 (the final pass): a gendered word follows
     the pronouns of the one it names (kinWord), so after /pronouns Mavis he
     she is "husband of Dewayne Mangum, son of the late Inez Crocker" and
     Dewayne has "husband: Mavis Mangum"; the records keep what was written. */
  function tiesOf(n) {
    const has = [];
    const isTo = [];
    if (!n || !current) return { has, isTo };
    const add = (list, id, relation, named) => {
      if (typeof id !== 'string' || id === n.id || list.some(x => x.id === id)) return;
      const m = npc(id);
      if (m) list.push({ id, relation: relation ? kinWord(relation, (named === 'self' ? n : m).pronouns) : null });
    };
    for (const r of Array.isArray(n.relations) ? n.relations : []) if (isObj(r)) add(has, r.npcId, r.relation, 'other');
    const c = isObj(n.created) ? n.created : null;
    if (c && c.relationToNpcId) add(isTo, c.relationToNpcId, c.relation, 'self');
    for (const m of current.npcs) {
      if (m === n) continue;
      for (const r of Array.isArray(m.relations) ? m.relations : []) if (isObj(r) && r.npcId === n.id) add(isTo, m.id, r.relation, 'self');
      const mc = isObj(m.created) ? m.created : null;
      if (mc && mc.relationToNpcId === n.id) add(has, m.id, mc.relation, 'other');
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
      pick = g.find(x => HOUSEHOLD_RELATIONS.includes(x.relation)) || g.find(x => familyWord(x.relation)) || null;
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
    relWrite(n);
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
  /* A thread's status. Only its first resolution (resolvedOnce) earns a
     story point, and, when the player knows the thread, a step of
     progression (progress); flipping it back and forth earns nothing more.
     Wave 7: under a held town event (rewardHold) a thread the player knows
     keeps the status they are shown, and the new one waits in t.pending
     (holdField); measured against the status as it is (threadNow). Not
     held, it is measured against the status shown: a bookkeeper that reads
     "open" and says "open" again moves nothing held. */
  function setThreadStatus(t, status) {
    if (!THREAD_STATUSES.includes(status)) bad('status must be open, resolved or failed');
    const was = threadNow(t, 'status');
    const hold = holdsThread(t);
    if (was === status || (!hold && t.status === status)) return `${t.id} already ${status}`;
    // A thread resolved in a save from before resolvedOnce has been resolved once already.
    if (was === 'resolved') t.resolvedOnce = true;
    if (hold) holdField(t, 'status', status);
    else { t.status = status; dropPending(t, 'status'); }
    let extra = hold ? ` (shown once the news of ${rewardHold} is told)` : '';
    if (status === 'resolved' && t.resolvedOnce !== true) {
      t.resolvedOnce = true;
      if (rewardHold) { t.rewardHeld = rewardHold; extra += ` (its reward waits for the news of ${rewardHold})`; }
      else extra += reward(t);
    }
    return `${t.id} ${was} -> ${status}${extra}`;
  }
  /* Whether the player knows a thread (threadUpdate, threadUpdates): held
     like the status when a held town event makes it known (wave 7: the
     ending names the vote threads; they come into the Journal with its
     news). Returns the applied line, or null when nothing changes. */
  function setThreadKnown(t, known) {
    if (holdsThread(t, known)) {
      if (threadNow(t, 'knownToPlayer') === known) return null;
      holdField(t, 'knownToPlayer', known);
      return `${t.id} known ${known} (shown once the news of ${rewardHold} is told)`;
    }
    if (t.knownToPlayer === known) return null;
    t.knownToPlayer = known;
    dropPending(t, 'knownToPlayer');
    return `${t.id} known ${known}`;
  }
  /* A thread's summary (threadUpdate; threadUpdates with always: written
     even when it is the same, as before). Held like the status (wave 7).
     Not held, it is what the player is shown now; a held one still takes
     its place once its news is told (the council's result, not a line the
     bookkeeper wrote that evening without knowing it). */
  function setThreadSummary(t, summary, always) {
    if (holdsThread(t)) {
      if (threadNow(t, 'summary') === summary) return null;
      holdField(t, 'summary', summary);
      return `${t.id} summary updated (shown once the news of ${rewardHold} is told)`;
    }
    if (!always && summary === t.summary) return null;
    t.summary = summary;
    return `${t.id} summary updated`;
  }
  /* What a thread's first resolution earns: a story point, and a step of
     progression when the player knows the thread. */
  function reward(t) {
    const p = current.player;
    let extra = '';
    if (p.storyPoints < LIMITS.storyPoints) { p.storyPoints += 1; extra = ' (+1 story point)'; }
    if (t.knownToPlayer === true) extra += progress(t);
    return extra;
  }
  /* Wave 6 (the fifth review's bug 6, the round-5 playtest's R6): a thread
     a town event resolves (World passes apply's opts.holdReward: the
     event's id, or 'ending' for the ending's own) holds its reward, and so
     its Resolved line and its gain, until the player has the news of it:
     t.rewardHeld names the event. newsSeen releases it once no unseen news
     of that event is left (told overnight, as a "Meanwhile in town" line,
     as the scene of a narration, or as the ending's narration); the reward
     is earned then, in that turn, after what told it. Saved with the
     thread, so /undo and a reload hold it the same way. */
  let rewardHold = null;
  function heldWaits(key) {
    return (Array.isArray(current.news) ? current.news : []).some(x => isObj(x) && !x.seen && (key === 'ending' ? x.epilogue === true : x.eventId === key && x.public !== false));
  }
  /* Wave 7 (the wave-6 integration's "What remains"): what such an event
     (or the ending) changes in a thread the player knows, or makes known,
     is held with its reward: the thread keeps the status, summary and
     knownToPlayer the player is shown, and the new ones wait in
     t.pending, a list in the order they happened of
     { news: the event's id, or 'ending'; status?, summary?, knownToPlayer? }
     (the council's, then the ending's when a /cheat time passes both: the
     council's summary shows with its news, the ending's with the ending).
     releaseRewards shows each one once its news is told, in the same step
     that earns the held reward, and earns the reward only once no status
     or knownness is still held, so the Journal, the recap, OPEN and the
     Resolved line change together. What the player and the narrator see
     reads the shown fields; what the engine decides by (a resolved thread
     never moves, a loose end still open) reads threadNow. A thread the
     player has not been told of, which the change does not make known, is
     not held (nothing of it is shown). */
  const PENDING_FIELDS = ['knownToPlayer', 'status', 'summary'];
  const heldKey = (x, k) => isObj(x) && Object.prototype.hasOwnProperty.call(x, k);
  function heldList(t) { return isObj(t) && Array.isArray(t.pending) ? t.pending : []; }
  function hasPending(t, k) { return heldList(t).some(x => heldKey(x, k)); }
  /* A thread's field as it is, the newest held value included (State.threadNow). */
  function threadNow(t, k) {
    const list = heldList(t);
    for (let i = list.length - 1; i >= 0; i--) if (heldKey(list[i], k)) return list[i][k];
    return isObj(t) ? t[k] : undefined;
  }
  function holdsThread(t, known) { return !!rewardHold && (threadNow(t, 'knownToPlayer') === true || known === true); }
  /* Held under rewardHold: in the last entry when it waits for the same
     news, else in a new one. A value the player is already shown, with
     nothing of it held, needs no holding. */
  function holdField(t, k, v) {
    if (t[k] === v && !hasPending(t, k)) return;
    if (!Array.isArray(t.pending)) t.pending = [];
    let last = t.pending[t.pending.length - 1];
    if (!isObj(last) || last.news !== rewardHold) { last = { news: rewardHold }; t.pending.push(last); }
    last[k] = v;
  }
  /* A change not held is newer than anything held of that field. */
  function dropPending(t, k) {
    if (!hasPending(t, k)) return;
    for (const x of t.pending) if (isObj(x)) delete x[k];
    tidyPending(t);
  }
  function tidyPending(t) {
    if (!Array.isArray(t.pending)) { delete t.pending; return; }
    t.pending = t.pending.filter(x => PENDING_FIELDS.some(k => heldKey(x, k)));
    if (!t.pending.length) delete t.pending;
  }
  /* What is held whose news is told, shown now, oldest first (known first,
     then the status, as threadUpdate); an older entry still waiting loses a
     field a newer one has just shown. Returns " (status resolved, summary
     shown)", or '' when nothing showed. */
  function showHeld(t) {
    if (t.pending === undefined) return '';
    if (!Array.isArray(t.pending)) { delete t.pending; return ''; }
    const parts = [];
    t.pending.forEach((x, i) => {
      if (!isObj(x) || (typeof x.news === 'string' && heldWaits(x.news))) return;
      for (const k of PENDING_FIELDS) {
        if (!heldKey(x, k)) continue;
        for (let j = 0; j < i; j++) if (isObj(t.pending[j])) delete t.pending[j][k];
        t[k] = x[k];
        parts.push(k === 'summary' ? 'summary shown' : `${k === 'knownToPlayer' ? 'known' : k} ${t[k]}`);
      }
      t.pending[i] = null;
    });
    tidyPending(t);
    return parts.length ? ` (${parts.join(', ')})` : '';
  }
  function releaseRewards() {
    const out = [];
    for (const t of Array.isArray(current.threads) ? current.threads : []) {
      if (!isObj(t)) continue;
      const shown = showHeld(t);
      const key = typeof t.rewardHeld === 'string' ? t.rewardHeld : null;
      if (key && !heldWaits(key) && !hasPending(t, 'status') && !hasPending(t, 'knownToPlayer')) {
        delete t.rewardHeld;
        out.push(`${t.id}: the news of ${key} is told${shown}${t.status === 'resolved' ? reward(t) : ', but it is no longer resolved'}`);
      } else if (shown) out.push(`${t.id}: the news is told${shown}`);
    }
    return out;
  }
  /* Progression (CONTRACTS section 9): +1 to the stat the thread names as
     its reward (at most LIMITS.statCap), else +2 max HP (at most
     LIMITS.maxHpCap, and HP with it). Recorded in player.progression, each
     entry with its gain ("charm +1", "max HP +2", or null: nothing grew).
     Wave 4 (the third playtest's design note: paying blackmail made the
     player tougher): a loose end's thread gives the story point only, no
     stat and no max HP (gain null). */
  function looseEndThread(t) { return (current.player.looseEnds || []).some(le => isObj(le) && le.threadId === t.id); }
  function progress(t) {
    const p = current.player;
    if (!Array.isArray(p.progression)) p.progression = [];
    const stat = STATS.includes(t.reward) ? t.reward : null;
    let gain = null;
    if (looseEndThread(t)) gain = null;
    else if (stat && (p.stats[stat] | 0) < LIMITS.statCap) { p.stats[stat] = (p.stats[stat] | 0) + 1; gain = `${stat} +1`; }
    else if (p.maxHp < LIMITS.maxHpCap) {
      const add = Math.min(2, LIMITS.maxHpCap - p.maxHp);
      p.maxHp += add;
      p.hp = clamp(p.hp + add, 0, p.maxHp);
      gain = `max HP +${add}`;
    }
    p.progression.push({ turn: current.meta.turn, day: current.time.day, threadId: t.id, gain });
    // The apply's result lists it too (transport's quiet line).
    if (applyCtx) (applyCtx.result.progressed = applyCtx.result.progressed || []).push({ threadId: t.id, gain });
    return gain ? ` (${gain})` : '';
  }
  // ----- how people feel: the tracks under attitude (Rel, wave 26) -----
  /* Rel plans and State writes. relWrite(n) makes a person's rel record
     whole (Rel.repair: one filled for a person who has none: an older save,
     an /undo step from an older build, someone made in play), folds a
     direct write to n.attitude since the last recompute into fix (it holds,
     exactly), recomputes the tracks (Rel.recompute: the cache, with the
     bands' hysteresis read from the previous ones) and writes the alias:
     n.attitude = liking. Every op that touches a person's feelings or
     memories calls it before (so it reads what is there) and after. */
  function townRec(id) { return town && Array.isArray(town.npcs) ? (town.npcs.find(x => isObj(x) && x.id === id) || null) : null; }
  function relCtx(extra) { return Object.assign({ s: current, town, day: current.time.day, turn: current.meta.turn, place: current.player.locationId }, extra || {}); }
  function relWrite(n) {
    if (!isObj(n) || !current) return;
    const was = isObj(n.rel) && isObj(n.rel.bands) ? { sp: n.rel.bands.sp, ov: n.rel.bands.ov } : null;
    // Wave 30: the bands as the turn found them, at the first change of the turn that is not quiet (App.noteRel reads them: relTouched).
    if (!relQuiet && !muted) { syncLedger(); if (!Object.prototype.hasOwnProperty.call(ledger.touched, n.id)) ledger.touched[n.id] = isObj(n.rel) && isObj(n.rel.bands) ? Object.assign({}, n.rel.bands) : null; }
    n.rel = Rel.repair(n, townRec(n.id));
    const a = toInt(n.attitude);
    if (a !== null && (!Number.isInteger(n.rel.w) || clamp(a, -100, 100) !== n.rel.w)) n.rel = Rel.landTo(n, { w: clamp(a, -100, 100) }, 'fix', relCtx());
    Object.assign(n.rel, Rel.recompute(n, current.time.day, relCtx()));
    n.attitude = n.rel.w;
    if (was) relNotice(n, was);
  }
  /* Wave 29: the quiet lines a change in how people stand prints (the feed
     reads them after each change: takeFeed; App's listener), never during a
     load, an edit, the morning's fading or a clock set by hand, and only
     for someone the player knows. A spark status prints its line when it
     is reached, unless the same one printed in the last 7 days (rel.status
     = { name, day }: the last one printed, design section 2.5); one lost
     (by a rebuff, a harm, an unwelcome flirt; never by fading) prints
     "<Name> takes the hint."; the fear of what the player knows prints
     once as it is reached. */
  /* Wave 30: each line carries whom it is about and its rank (FEED_RANK,
     the integration plan's 14.3), so App.noteRel can print one a person,
     the most important first, two a turn. */
  const relFeed = [];
  let relQuiet = 0;
  const FEED_RANK = Object.freeze({ harm: 1, theirs: 2, yours: 3, know: 4, fear: 5, silence: 6, trust: 7, spark: 8, liking: 9, favour: 10, settled: 11 });
  function feedLine(text, npcId, rank) { if (text && current && !muted && !relQuiet) relFeed.push({ text: String(text), npcId: typeof npcId === 'string' ? npcId : null, rank: FEED_RANK[rank] || FEED_RANK.silence }); }
  function takeFeed() { const out = relFeed.slice(); relFeed.length = 0; return out; }
  /* The turn's touched people (wave 30): { touched: { id: bands as the
     turn found them }, harm3: [ids: a first-hand weight-3 harm this turn],
     settled: [ids: a settlement landed] }, for App.noteRel. */
  function relTouched() {
    syncLedger();
    return { turn: ledger.turn, touched: Object.assign({}, ledger.touched), harm3: Object.keys(ledger.harm3), settled: Object.keys(ledger.settled) };
  }
  function relNotice(n, was) {
    if (relQuiet || muted || !n.knownToPlayer || n.alive === false) return;
    const b = isObj(n.rel.bands) ? n.rel.bands : {};
    const day = current.time.day;
    if (was.sp !== undefined && b.sp !== undefined && b.sp !== was.sp) {
      const st = isObj(n.rel.status) ? n.rel.status : null;
      if (b.sp) {
        if (!st || st.name !== b.sp || day - (Number(st.day) || 0) >= Rel.GATES.spark.statusDays) { n.rel.status = { name: b.sp, day }; feedLine(Rel.statusLine(n, b.sp), n.id, 'spark'); }
      } else if (was.sp) feedLine(Rel.statusLine(n, null), n.id, 'spark');
    }
    if (was.ov !== undefined && b.ov === 'know' && was.ov !== 'know') feedLine(`${n.name} is afraid of what you know.`, n.id, 'know');
  }
  function relWriteAll() { for (const n of current.npcs) relWrite(n); }
  // Wave 29: a change that prints no feed line (a load, an edit, a rewind, the morning's fading, a clock set by hand).
  function quietly(fn) { relQuiet += 1; try { return fn(); } finally { relQuiet -= 1; } }
  // The tracks as they read now (after relWrite).
  function relNow(n) { const r = n.rel || {}; return { w: r.w, t: r.t, f: r.f, k: r.k, s: r.s, m: r.m, owed: r.net | 0 }; }
  /* A change of liking with attitude's own meaning (attitudeDelta,
     attitudeChanges, meetingRep): before + d, clamped to -100..100, into
     everyday; past everyday's bound the rest goes into fix, so the number
     reads exactly that. Returns [before, after]. */
  function likingBy(n, d) {
    relWrite(n);
    const before = n.attitude;
    const target = clamp(before + d, -100, 100);
    if (target !== before) { n.rel = Rel.landTo(n, { w: target }, 'everyday', relCtx()); relWrite(n); }
    return [before, n.attitude];
  }
  /* A change to someone's memories that should move no track (a legacy
     line arriving and evicting a typed one, setMemories, mergePeople, an
     edit): the tracks as they were, pinned (the difference into everyday,
     fear into fix). keep: the tracks to hold (relNow before the change). */
  function relPin(n, keep, buckets) {
    n.rel = Rel.landTo(n, Rel.pinOf(keep, Rel.eligible(n, relCtx())), Object.assign({ w: 'everyday', t: 'everyday', f: 'fix', k: 'everyday', s: 'everyday', m: 'everyday' }, buckets || {}), relCtx());
    relWrite(n);
  }
  /* A refused spark or romance write is logged where every refusal is
     (Debug's rejected changes), without failing what else the write did. */
  function relRefused(path, reason) { pushDebug({ turn: current ? current.meta.turn : 0, kind: 'rejected', source: 'rel', path, reason }); console.debug('[State.apply] refused', path, '-', reason); }
  function sparkWhy(n) { return Rel.isMinor(n, relCtx()) ? 'they are under 18' : 'the player is under 18 or has no age'; }
  /* Spark and (wave 35) romance on someone they cannot move for, wherever
     it came in (an import, a memory list an upgrade or the editor wrote, a
     merge), set to 0 and logged (Rel.sparkGuard). */
  function relGuard(n, path) {
    const g = Rel.sparkGuard(n, relCtx());
    if (!g.cleared) return;
    n.rel = g.rel;
    n.memories = g.memories;
    relRefused(path, `${g.tracks.join(' and ')} set to 0 for ${n.id}: ${sparkWhy(n)}`);
  }
  /* Track values as the engine and the editor give them ({ w?, t?, f?, k?,
     s?, m?, owed? }): whole numbers in each track's range (owed, wave 35:
     the favours' net, -3..3); spark or romance above 0 refused for anyone
     they cannot move for (a minor, an under-18 player); a hard person's
     fear held at Rel.CAPS.hardFear. */
  function relTargets(n, v, where) {
    if (!isObj(v)) bad(`${where} must be an object of tracks (w, t, f, k, s, m, owed)`);
    const out = {};
    for (const k of Object.keys(v)) {
      if (!Rel.TRACKS.includes(k) && k !== 'owed') bad(`${where}: unknown track "${k}" (w, t, f, k, s, m or owed)`);
      const x = typeof v[k] === 'number' || typeof v[k] === 'string' ? toInt(v[k]) : null;
      const [lo, hi] = k === 'owed' ? [-Rel.CAPS.owed, Rel.CAPS.owed] : Rel.RANGE[k];
      if (x === null || (typeof v[k] === 'number' && !Number.isInteger(v[k])) || x < lo || x > hi) bad(`${where}.${k} must be a whole number from ${lo} to ${hi}`);
      out[k] = x;
    }
    if (out.s > 0 && !Rel.eligible(n, relCtx())) bad(`spark stays 0 for ${n.id}: ${sparkWhy(n)}`);
    if (out.m > 0 && !Rel.eligible(n, relCtx())) bad(`romance stays 0 for ${n.id}: ${sparkWhy(n)}`);
    if (out.f !== undefined && Rel.axesOf(n, relCtx()).hard) out.f = Math.min(out.f, Rel.CAPS.hardFear);
    return out;
  }
  /* Wave 35: the favours owed set by hand (the Edit form's "Owes you",
     relSet's owed): the ledger brought to read exactly v (Rel.owedTo).
     Returns true when it changed. */
  function relOwed(n, v) {
    if (v === undefined || (n.rel.net | 0) === v) return false;
    n.rel.owed = Rel.owedTo(n.rel, v, `fix-${current.meta.turn}-${n.id}-o`, current.time.day, current.meta.turn);
    return true;
  }
  const RELWORD = Object.freeze({ w: 'liking', t: 'trust', f: 'fear', k: 'knows', s: 'spark', m: 'romance', owed: 'owed' });
  // withOwed: the favours' net as well (relSet, wave 35).
  const relChanges = (a, b, withOwed) => Rel.TRACKS.concat(withOwed ? ['owed'] : []).filter(x => a[x] !== b[x]).map(x => `${RELWORD[x]} ${a[x]} -> ${b[x]}`);
  /* Town reputation from an event done in public (wave 27; design section
     2.8): held to World's REP_CAP a turn (ledger.rep), whatever moved it.
     Returns the part that landed. */
  const EVENT_REP_CAP = 5;
  function townRep(d) {
    const used = ledger.rep | 0;
    const allowed = clamp(used + d, -EVENT_REP_CAP, EVENT_REP_CAP) - used;
    if (!allowed) return 0;
    ledger.rep = used + allowed;
    EFFECTS.reputationDelta({ key: 'town', delta: allowed });
    return allowed;
  }
  // A scene: the place, the day and the phase (witness copies merge by it).
  function sceneKey() { return `${current.player.locationId}:${current.time.day}:${current.time.phase}`; }
  /* One event for one person (the socialEvent op, the socialEvents field):
     checked, planned by Rel.applyEvent, written. The dead remember nothing
     (a no-op). Returns the applied line.
     Wave 27, the engine's fields: fight (the fight's key: one memory a
     fight, Rel.applyEvent), witnesses ('present', 'none' or a list of ids:
     who saw it; each who is here and not laid up takes Rel.witnessEvent's
     copy, merged per scene), public (true: it made news; else two or more
     witnesses make it public), rep (the town reputation it moves when
     public, in place of the row's), secondhand (true, or { via, hidden }).
     A public event moves the town's reputation by its row (townRep). Every
     event records its dedupe class (ledger.classes) and the sign of its
     liking (ledger.engine: the bookkeeper's legacy lines yield to it);
     within one apply the first money-class event for a person wins. */
  /* Dedupe by class (wave 27; the integration plan's 4.2): why the engine's
     events this turn (ledger.classes) leave nothing for the bookkeeper's
     event for this person: the same class, or what the class drops besides
     (Rel.DEDUPE: violence drops humiliated and threatened, money kept_word
     and did_favour, romance complimented and flirted, a humiliation an
     insult). Returns the class, or null. */
  function dedupeWhy(id, event) {
    const classes = ledger.classes[id] || [];
    const own = Rel.EVENTS[event] ? Rel.EVENTS[event].dedupe : null;
    if (own && classes.includes(own)) return own;
    return classes.find(c => Rel.DEDUPE[c] && Rel.DEDUPE[c].drops.includes(event)) || null;
  }
  /* Wave 31: what the player did reaches the people tied to them
     (spreadEvent, after the witnesses): those here at once, the rest as
     hearsay by their tie; a settlement reaches the copies others hold.
     how.noSpread: news arriving by hearsay goes no further (no hop 2). */
  function socialEvent(e, path, fromModel, how) {
    if (!isObj(e)) bad('must be an object');
    const n = needNpc(e.npcId);
    const row = typeof e.event === 'string' ? Rel.EVENTS[e.event] : null;
    if (!row) bad(`unknown event "${e.event}" (one of ${Rel.EVENT_NAMES.join(', ')})`);
    const text = cleanText(e.text, 400);
    if (!text) bad('needs text: what they would remember');
    if (presenceOf(n) === 'dead') return `no-op: ${n.id} is dead and remembers nothing`;
    // The bookkeeper's (wave 28 sends them; e.bookkeeper marks one as theirs until then): dropped when the engine already recorded its class.
    const model = fromModel === true || e.bookkeeper === true;
    const dup = model ? dedupeWhy(n.id, e.event) : null;
    if (dup) {
      pushDebug({ turn: current.meta.turn, kind: 'rejected', source: 'rel', path, reason: `the engine already recorded ${dup} for ${n.id} this turn: ${e.event} dropped` });
      return `no-op: the engine already recorded ${dup} for ${n.id} this turn (${e.event} dropped)`;
    }
    if (e.weight !== undefined && !(Number.isInteger(e.weight) && e.weight >= 1 && e.weight <= 3)) bad('weight must be 1, 2 or 3');
    if (e.act !== undefined && !MEMORY_ACTS.includes(e.act)) bad(`act must be one of ${MEMORY_ACTS.join(', ')}`);
    if (e.aboutId !== undefined && e.aboutId !== null) needNpc(e.aboutId);
    if (e.private !== undefined && typeof e.private !== 'boolean') bad('private must be true or false');
    if (e.decay !== undefined && !Object.prototype.hasOwnProperty.call(Rel.DECAY, e.decay)) bad(`decay must be one of ${Object.keys(Rel.DECAY).join(', ')}`);
    if (e.scale !== undefined && !(typeof e.scale === 'number' && e.scale >= 0.1 && e.scale <= 2)) bad('scale must be a number from 0.1 to 2');
    if (e.fight !== undefined && !(typeof e.fight === 'string' && /^[a-z0-9_-]{1,60}$/i.test(e.fight))) bad('fight must be a fight key');
    if (e.public !== undefined && typeof e.public !== 'boolean') bad('public must be true or false');
    if (e.rep !== undefined && !(Number.isInteger(e.rep) && Math.abs(e.rep) <= 10)) bad('rep must be a whole number within +/-10');
    if (e.secondhand !== undefined && typeof e.secondhand !== 'boolean' && !isObj(e.secondhand)) bad('secondhand must be true, false or { via, hidden }');
    const seen = e.witnesses === undefined || e.witnesses === 'none' ? [] : e.witnesses === 'present' ? npcsAt(current.player.locationId).map(x => x.id)
      : Array.isArray(e.witnesses) ? e.witnesses.filter(x => typeof x === 'string') : bad('witnesses must be "present", "none" or a list of ids');
    // Engine against engine (the integration plan's 19.4): one payment is one event for a person within one apply.
    if (row.dedupe === 'money' && applyCtx) {
      const paid = applyCtx.money || (applyCtx.money = new Set());
      if (paid.has(n.id)) { pushDebug({ turn: current.meta.turn, kind: 'rejected', source: 'rel', path, reason: `the engine already counted a money event for ${n.id} in this change: ${e.event} dropped` }); return `no-op: ${n.id} ${e.event}: a money event for them was already counted`; }
      paid.add(n.id);
    }
    let d;
    if (e.d !== undefined && e.d !== null) {
      if (!isObj(e.d)) bad('d must be an object of tracks (w, t, f, k, s, m)');
      d = {};
      for (const k of Object.keys(e.d)) {
        if (!Rel.TRACKS.includes(k)) bad(`d: unknown track "${k}"`);
        if (!Number.isInteger(e.d[k]) || Math.abs(e.d[k]) > 50) bad(`d.${k} must be a whole number within +/-50`);
        d[k] = e.d[k];
      }
      if (d.s > 0 && !Rel.eligible(n, relCtx())) bad(`spark stays 0 for ${n.id}: ${sparkWhy(n)}`);
      if (d.m > 0 && !Rel.eligible(n, relCtx())) bad(`romance stays 0 for ${n.id}: ${sparkWhy(n)}`);
    }
    relWrite(n);
    const before = relNow(n);
    const netBefore = n.rel.net | 0;
    // Wave 30: the serious harms already held (a fight's, a merged one's), so only a new one is "won't forget that".
    const w3Key = m => `${m.key || m.text}|${m.event || ''}`;
    const w3Before = new Set((n.memories || []).filter(m => isObj(m) && (m.weight | 0) >= 3 && Rel.harmful(m)).map(w3Key));
    const fight3 = typeof e.fight === 'string' && (n.memories || []).some(m => isObj(m) && m.fight === e.fight && (m.weight | 0) >= 3);
    const secondhand = e.secondhand === true ? true : isObj(e.secondhand) ? { via: typeof e.secondhand.via === 'string' ? e.secondhand.via : undefined, hidden: e.secondhand.hidden === true } : false;
    const plan = Rel.applyEvent(n, {
      event: e.event, text, weight: e.weight, act: e.act, aboutId: e.aboutId || null, private: e.private === true, leverageId: typeof e.leverageId === 'string' ? e.leverageId : null,
      d, decay: e.decay, secondhand, scale: e.scale, fight: e.fight, soon: e.event === 'flirted' && e.soon === true && !model
    }, relCtx({ used: ledger.rel[n.id] }));
    for (const why of plan.refused) relRefused(path, why);
    n.rel = plan.rel;
    n.memories = plan.memories;
    ledger.rel[n.id] = plan.used;
    // What the engine recorded (the bookkeeper's own events record nothing: they never drop each other).
    if (row.dedupe && !model) {
      const classes = ledger.classes[n.id] || (ledger.classes[n.id] = []);
      if (!classes.includes(row.dedupe)) classes.push(row.dedupe);
    }
    // Wave 28: the turn's engine events, for the bookkeeper's packet (ALREADY APPLIED: "engine events: npc_colt beat_down").
    if (!model && !(ledger.events || (ledger.events = [])).some(x => x.npcId === n.id && x.event === e.event)) ledger.events.push({ npcId: n.id, event: e.event });
    // The sign its liking moved (the row's, or the d given): what the bookkeeper's legacy lines for this person yield to.
    if (!model) {
      const sign = Math.sign(d && Number.isFinite(d.w) ? d.w : row.w);
      const signs = ledger.engine[n.id] || (ledger.engine[n.id] = []);
      if (!signs.includes(sign)) signs.push(sign);
    }
    relWrite(n);
    const moved = relChanges(before, relNow(n));
    // Wave 29: favours owed, as the feed says them (design section 7.2).
    const netAfter = n.rel.net | 0;
    if (netAfter !== netBefore && n.knownToPlayer) {
      if (netAfter > netBefore && netAfter > 0) feedLine(netBefore > 0 ? `${n.name} owes you again.` : `${n.name} owes you one.`, n.id, 'favour');
      else if (netAfter < netBefore && netAfter < 0) feedLine(`You owe ${n.name} one.`, n.id, 'favour');
      else if (netAfter === 0) feedLine(`${n.name} is square with you.`, n.id, 'favour');
    }
    // Wave 30, the feed's marks (App.noteRel): a first-hand weight-3 harm ("won't forget that"), and a settlement that landed ("lets some of it go").
    if (!relQuiet && !muted) {
      // Not a memory of leverage still in use (its record's own lines say it: "is afraid of what you know"), not one held already, not the same fight again.
      const pm = plan.memory;
      const levId = pm && typeof pm.leverageId === 'string' ? pm.leverageId : typeof e.leverageId === 'string' ? e.leverageId : null;
      const levLive = levId && leverageRec(levId) && Rel.LEV_LIVE.includes(leverageRec(levId).status);
      if (pm && (pm.weight | 0) >= 3 && !pm.witness && !pm.secondhand && pm.act !== 'own' && !levLive && !fight3 && !w3Before.has(w3Key(pm)) && Rel.harmful(pm)) ledger.harm3[n.id] = true;
      if (plan.settled) ledger.settled[n.id] = true;
    }
    const what = plan.memory ? `remembers "${plan.memory.text}" (weight ${plan.memory.weight}${plan.merged ? `, merged x${plan.memory.n}` : ''})` : 'everyday';
    // Who saw it: a lighter copy each, merged per scene (Rel.witnessEvent); never the laid up, never words said privately.
    const extra = [];
    const scene = sceneKey();
    const place = loc(current.player.locationId);
    const placeName = place ? String(place.name).replace(/^The /, 'the ') : 'town';
    let watchers = 0;
    if (e.private !== true && Rel.WITNESS[e.event]) {
      for (const id of seen.filter((x, i, a) => a.indexOf(x) === i && x !== n.id)) {
        const w = npc(id);
        if (!w || presenceOf(w) === 'dead' || laidUp(w)) continue;
        watchers += 1;
        relWrite(w);
        const wb = relNow(w);
        const wp = Rel.witnessEvent(w, { event: e.event, victim: n.name, victimId: n.id, place: placeName, scene, player: current.player.name }, relCtx({ used: ledger.rel[w.id] }));
        if (!wp || wp.kind === 'none') continue;
        w.rel = wp.rel;
        w.memories = wp.memories;
        ledger.rel[w.id] = wp.used;
        relWrite(w);
        const wm = relChanges(wb, relNow(w));
        if (wm.length || wp.memory) extra.push(`${w.id} saw it: ${wm.join(', ') || 'no change'}${wp.memory ? `; ${wp.merged ? 'adds to' : 'remembers'} "${wp.memory.text}"` : ''}`);
      }
    } else watchers = seen.filter(x => x !== n.id).length;
    // Done in public (two or more saw it besides them, or it made news): the town's reputation moves by its row.
    const pub = e.public === true || watchers >= 2;
    const rep = Number.isInteger(e.rep) ? e.rep : row.rep;
    if (pub && rep) { const got = townRep(rep); if (got) extra.push(`town reputation ${plusMinus(got)} (done in public)`); }
    if (!(isObj(how) && how.noSpread)) extra.push(...spreadEvent(n, e, plan, before, seen, pub));
    return `${n.id} ${e.event}: ${moved.join(', ') || 'no change'}; ${what}${plan.settled ? `; softens "${plan.settled}"` : ''}${extra.length ? `; ${extra.join('; ')}` : ''}`;
  }
  /* Wave 28: the bookkeeper's socialEvents (the integration plan's 5.4),
     read as a whole before any is written, so the caps can keep the
     heaviest. Each in turn: an object (Api.recordFromWire reads the wire's
     strings); the person alive, here this turn (opts.present) and not laid
     up (an absent victim is refused in tier A); someone under 18: a romance
     event naming them, or anything at all on a turn the parse's flag or the
     phrase list pointed at them (opts.romance.minors), is set aside for the
     minor rule (result.minors, the ids a romance event named; Pipeline's
     minorTurn applies the rule after this apply), never written; then
     Rel.wireEvent's preconditions: a downgrade (kept_word to confided, and
     the rest), a lesson in knowing only (an apology that did not land, a
     secret told, a confession with nothing to confess) or a refusal; an
     insult said with two or more others here who are not laid up, and not
     privately, becomes humiliated, in front of them; a kind event for the
     person the same ask already worked on (opts.diminish, cleanDiff's)
     counts for its factor, and not at all at 0. Over the caps (two a
     person, four a turn; ledger.model across the turn) the heaviest are
     kept, by weight, then by the size of their liking and trust, the rest
     refused. What is kept goes through socialEvent as the model's (an
     engine event of its class this turn drops it); a confession marks the
     lie it owns up to (rel.asks). */
  /* Wave 33: the late engine flirt (Rel.wireEvent's plan, late: a romantic
     turn aimed at nobody, and the bookkeeper named who): written as the
     engine writes its own (Rel.flirtEventOf, as Pipeline's flirtEvent;
     wave 34: by the turn's charm roll, p.ans), with the jealousy of
     whoever here saw it (Rel.jealousyOf). Turned aside kindly on a
     partial or with no charm roll: nothing written. */
  function lateFlirt(n, p, path, present) {
    const place = loc(current.player.locationId);
    const placeName = place ? String(place.name).replace(/^The /, 'the ') : 'town';
    const ev = Rel.flirtEventOf(n, p.ans, current.player.name, placeName);
    const said = p.ans.answer === 'welcome' ? 'open to it' : p.ans.answer === 'no' ? "isn't interested" : 'turned it aside, kindly';
    pushDebug({ turn: current.meta.turn, kind: 'rel', text: `the bookkeeper named who the flirt was aimed at: ${n.id}, ${said}${p.ans.tier ? ` (the charm roll: ${p.ans.tier})` : ''} (the engine's flirt, late)` });
    if (!ev) return `no-op: ${n.id} turned the flirt aside, kindly (the engine's flirt, late: nothing changes)`;
    const line = socialEvent(ev, path, false);
    const extra = [];
    if (!/^no-op/.test(line)) for (const j of Rel.jealousyOf(n, present, relCtx())) extra.push(socialEvent(j, `${path} jealousy`, false));
    return `${line} (the engine's flirt, late: the bookkeeper named who it was aimed at)${extra.length ? `; ${extra.join('; ')}` : ''}`;
  }
  function modelSocial(items, opts, result, run, no) {
    const s = current;
    const present = opts && Array.isArray(opts.present) ? opts.present.filter(x => typeof x === 'string') : [];
    const romance = opts && isObj(opts.romance) ? opts.romance : null;
    const turn = {
      present, targets: opts && Array.isArray(opts.targets) ? opts.targets.filter(x => typeof x === 'string') : [], actionType: opts && typeof opts.actionType === 'string' ? opts.actionType : null,
      rollSuccess: opts ? opts.rollSuccess : undefined, speechTo: opts && typeof opts.speechTo === 'string' ? opts.speechTo : null, romantic: !!(romance && romance.romantic),
      // Wave 33: whom the romance step aimed the turn at (none: a flirt the bookkeeper names someone here for is the engine's, late).
      aimed: romance && Array.isArray(romance.aimed) ? romance.aimed.filter(x => typeof x === 'string') : null,
      // Wave 34: the turn's roll (its stat and tier): a late flirt lands by a charm roll.
      rollStat: opts && typeof opts.rollStat === 'string' ? opts.rollStat : null, rollTier: opts && typeof opts.rollTier === 'string' ? opts.rollTier : null,
      // Wave 29: the turn's narration (a secret let slip is a record only when its words show it: Rel.wireEvent's learned_secret).
      narration: opts && typeof opts.narration === 'string' ? opts.narration : ''
    };
    const dim = opts && isObj(opts.diminish) && typeof opts.diminish.npcId === 'string' ? opts.diminish : null;
    const giftTo = opts && typeof opts.giftTo === 'string' ? opts.giftTo : null;
    const minors = romance && isObj(romance.minors) ? romance.minors : {};
    const ctx = relCtx();
    // Who under 18 a romance event names: the minor rule, whatever else the bookkeeper says for them.
    const named = new Set();
    for (const x of items) if (isObj(x) && typeof x.npcId === 'string' && Rel.ROMANCE_EVENTS.includes(x.event)) { const n = npc(x.npcId); if (n && Rel.isMinor(n, ctx)) named.add(n.id); }
    result.minors = Array.from(named);
    const cands = [];
    items.forEach((x, i) => run(`socialEvents[${i}]`, () => {
      if (!isObj(x)) bad('must be an object (Api.recordFromWire reads "npc_id event: what they would remember")');
      const n = needNpc(x.npcId);
      if (presenceOf(n) === 'dead') bad(`${n.id} is dead`);
      if (Rel.isMinor(n, ctx) && (named.has(n.id) || (isObj(minors[n.id]) && (minors[n.id].flag || minors[n.id].phrase)))) {
        return `no-op: ${n.id} is under 18 and this turn pointed something romantic at them: set aside for the minor rule (${x.event || 'no event'})`;
      }
      // Wave 31 (design section 4.4): someone away is told by whoever here is tied to them, by the kind of tie (carrierFor).
      const carrier = present.includes(n.id) ? null : carrierFor(n, present);
      if (!present.includes(n.id) && !carrier) bad(`${n.id} is not here, and nobody here is close enough to them to tell them`);
      if (!carrier && laidUp(n)) bad(`${n.id} is laid up at home`);
      const ev = Object.assign({}, x, { aboutId: typeof x.aboutId === 'string' && npc(x.aboutId) ? x.aboutId : null });
      relWrite(n);
      const plan = Rel.wireEvent(n, ev, turn, ctx);
      if (plan.refuse) bad(`${x.event || 'an event'} for ${n.id} refused: ${plan.refuse}`);
      if (plan.wait) { pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'rel', path: `socialEvents[${i}]`, reason: `${x.event} for ${n.id} held back: ${plan.wait}` }); return `no-op: ${n.id} ${x.event}: ${plan.wait}`; }
      if (carrier && (isObj(plan.record) || typeof plan.spend === 'string' || typeof plan.voidRec === 'string')) bad(`${x.event} for ${n.id} refused: what is held between them needs them here`);
      const c = { i, path: `socialEvents[${i}]`, n, raw: x, plan, text: shortMemory(x.text), carrier };
      if (!carrier && plan.event === 'insulted' && !plan.private && present.filter(id => id !== n.id && npc(id) && presenceOf(npc(id)) !== 'dead' && !laidUp(npc(id))).length >= 2) { plan.event = 'humiliated'; plan.why = 'said in front of two or more'; }
      const row = plan.event ? Rel.EVENTS[plan.event] : null;
      if (row && row.w + row.t > 0 && ((dim && dim.npcId === n.id) || giftTo === n.id)) {
        const f = dim && dim.npcId === n.id && Number.isFinite(dim.factor) ? dim.factor : 1;
        if (f <= 0 || (giftTo === n.id && dim && dim.gift)) bad(`${plan.event} for ${n.id}: ${dim && dim.gift ? 'another gift to them today counts for nothing more' : 'the same ask already worked here this phase'}`);
        if (f < 1) c.scale = Math.max(0.1, f);
      }
      c.weight = row ? row.weight : 0;
      c.size = row ? Math.abs(row.w) + Math.abs(row.t) : 0;
      cands.push(c);
      return null;
    }));
    // The caps (two a person, four a turn), the heaviest kept.
    const used = ledger.model || (ledger.model = { per: {}, total: 0 });
    const order = cands.slice().sort((a, b) => (b.weight - a.weight) || (b.size - a.size) || (a.i - b.i));
    const keep = new Set();
    const per = Object.assign({}, used.per);
    let total = used.total | 0;
    for (const c of order) {
      if (total >= Rel.CAPS.perTurn || (per[c.n.id] | 0) >= Rel.CAPS.perPerson) continue;
      keep.add(c);
      per[c.n.id] = (per[c.n.id] | 0) + 1;
      total += 1;
    }
    used.per = per;
    used.total = total;
    for (const c of cands) {
      if (!keep.has(c)) { no(c.path, `${c.raw.event} for ${c.n.id} dropped: over the cap (${Rel.CAPS.perPerson} a person, ${Rel.CAPS.perTurn} a turn; the heavier kept)`); continue; }
      run(c.path, () => {
        const n = c.n;
        const p = c.plan;
        const note = p.why ? ` (${c.raw.event} ${p.event ? `as ${p.event}` : 'as knowing only'}: ${p.why})` : '';
        if (p.knows) {
          relWrite(n);
          n.rel.everyday.k = clamp((Number(n.rel.everyday.k) || 0) + p.knows, 0, 100);
          relWrite(n);
          return `${n.id} ${c.raw.event}: knows +${p.knows} only (${p.why})`;
        }
        if (c.carrier) return absentEvent(n, p, c, present) + note;
        if (p.late) return lateFlirt(n, p, c.path, present);
        const others = p.event === 'humiliated' ? present.filter(id => id !== n.id) : undefined;
        const line = socialEvent(Object.assign({ npcId: n.id, event: p.event, text: c.text }, p.aboutId ? { aboutId: p.aboutId } : {}, p.private ? { private: true } : {}, isObj(p.d) ? { d: p.d } : {},
          Number.isFinite(p.scale) || Number.isFinite(c.scale) ? { scale: clamp((Number.isFinite(p.scale) ? p.scale : 1) * (Number.isFinite(c.scale) ? c.scale : 1), 0.1, 2) } : {}, others ? { witnesses: others } : {}), c.path, true);
        if (Number.isInteger(p.confess) && Array.isArray(n.rel.asks) && isObj(n.rel.asks[p.confess])) n.rel.asks[p.confess] = Object.assign({}, n.rel.asks[p.confess], { confessed: true, confessedTurn: s.meta.turn });
        // Wave 29: what the event makes, spends or voids of the leverage between them (Rel.wireEvent's plan).
        const extra = [];
        if (isObj(p.record) && !/^no-op/.test(line)) extra.push(leverageAdd(Object.assign({}, p.record, { text: cleanText(c.raw.text, 120) || c.text })));
        if (typeof p.spend === 'string' && !/^no-op/.test(line)) extra.push(...exposeTo(n, p.aboutId, p.spend));
        // Wave 32: a word for or against someone that moved the listener (Rel.wordsTie), on their tie, in front of the player.
        if (isObj(p.tie) && !/^no-op/.test(line) && npc(p.tie.to)) {
          const about = npc(p.tie.to);
          tieLog(p.tie.from, p.tie.to, p.tie.w, 0, `what you said ${p.event === 'vouched_for' ? 'for' : 'about'} ${about.name}`, true, false, { words: true });
          extra.push(`${p.tie.from}>${p.tie.to}: liking ${plusMinus(p.tie.w)} (the player's words)`);
        }
        if (typeof p.voidRec === 'string' && !/^no-op/.test(line)) extra.push(...cameClean(p.voidRec));
        return line + note + (extra.length ? `; ${extra.join('; ')}` : '');
      });
    }
  }

  // ----- wave 31: the town's ties, and word getting round -----
  /* state.ties ({ "a>b": a's tie to b }, Rel.tiesPlan's shape) and
     state.hearsay (the news of what the player did on its way to the people
     tied to whom it happened to: [{ id, npcId (who hears), aboutId (whom it
     happened to), src (their memory's key), event, d (what carries),
     factor, via ('overnight', 'morning', 'meet'), dueDay, duePhase,
     expires, turn, hidden, ... }], at most Rel.DELIVERY.max). Rel plans,
     State writes; every entry and tie-log line carries its turn, so
     /rewind strikes them. */
  function tieMapOf() { if (!isObj(current.ties)) current.ties = {}; return current.ties; }
  function hearsayList() { if (!Array.isArray(current.hearsay)) current.hearsay = []; return current.hearsay; }
  /* A change in a's tie to b (the arrest route; wave 32's exposure,
     badmouthing and tieDelta): a turn-stamped log line { turn, day, w, t,
     why, seen, ...extra (words: the player's words) }, the oldest folded
     into base past Rel.TIE_LOG. A tie the game lacks is made (its kind from
     their relations, else other, at 0). known: true makes it known.
     Returns the tie. */
  function tieLog(from, to, w, t, why, seen, known, extra) {
    const ties = tieMapOf();
    const k = Rel.tieKey(from, to);
    if (!isObj(ties[k])) ties[k] = { kind: Rel.kindBetween(npc(from), npc(to)) || 'other', base: { w: 0, t: 0 }, log: [], hidden: false, known: true };
    const tie = ties[k];
    if (!isObj(tie.base)) tie.base = { w: 0, t: 0 };
    if (!Array.isArray(tie.log)) tie.log = [];
    if (w || t) tie.log.push(Object.assign({ turn: current.meta.turn, day: current.time.day, w: w | 0, t: t | 0, why: cleanText(why, 120) }, seen ? { seen: true } : {}, isObj(extra) ? extra : {}));
    while (tie.log.length > Rel.TIE_LOG) { const old = tie.log.shift(); tie.base.w = clamp((Number(tie.base.w) || 0) + (Number(old.w) || 0), -100, 100); tie.base.t = clamp((Number(tie.base.t) || 0) + (Number(old.t) || 0), -100, 100); }
    if (known === true && tie.known !== true) { tie.known = true; tie.knownTurn = current.meta.turn; }
    Object.assign(tie, Rel.tieNow(tie));
    return tie;
  }
  /* The favours a change put on someone's ledger, as the feed says them
     (design section 7.2): "<Name> owes you one." / "owes you again." /
     "You owe <Name> one." / "<Name> is square with you." */
  function owedLines(n, before, after) {
    if (after === before || !n.knownToPlayer) return;
    if (after > before && after > 0) feedLine(before > 0 ? `${n.name} owes you again.` : `${n.name} owes you one.`, n.id, 'favour');
    else if (after < before && after < 0) feedLine(`You owe ${n.name} one.`, n.id, 'favour');
    else if (after === 0) feedLine(`${n.name} is square with you.`, n.id, 'favour');
  }
  /* What reaches one person through a tie, written (Rel.carry's plan): a
     settlement on their copy, a share added to a copy, everyday, or a
     secondhand memory, held to what the graph may move them in a turn
     (ledger.graph); a rescue or a defence of their child or spouse puts
     them owed one. scene: the witness copy a share for someone here joins;
     day: the day it is heard on. Returns the line, or null for nothing; lastCarry is what it was
     ('memory', 'everyday', 'settled' or 'none': step i names only those
     it gave a memory). */
  let lastCarry = 'none';
  function carryTo(a, item, scene, day) {
    lastCarry = 'none';
    if (!a || presenceOf(a) === 'dead') return null;
    relWrite(a);
    const before = relNow(a);
    const net = a.rel.net | 0;
    // day: the tick's (World's step i runs once a phase passed, the clock already at the end of the passage).
    const cp = Rel.carry(a, item, relCtx(Object.assign({ graph: ledger.graph[a.id], scene }, Number.isInteger(day) ? { day } : {})));
    if (!cp || cp.kind === 'none') return null;
    lastCarry = cp.kind;
    a.rel = cp.rel;
    a.memories = cp.memories;
    ledger.graph[a.id] = cp.used;
    if (item.owed && cp.kind !== 'settled') a.rel.owed = (Array.isArray(a.rel.owed) ? a.rel.owed : []).concat([{ dir: 1, size: 1, key: `m${current.meta.turn}-${a.id}-o`, day: current.time.day, turn: current.meta.turn, why: cleanText(item.act, 120) }]).slice(-Rel.CAPS.owedEntries);
    relWrite(a);
    owedLines(a, net, a.rel.net | 0);
    const moved = relChanges(before, relNow(a));
    const what = cp.kind === 'settled' ? `settles their copy of ${item.src}` : cp.memory ? `${cp.merged ? 'adds to' : 'remembers'} "${cp.memory.text}"` : 'everyday';
    return `${a.id} ${item.how === 'saw' ? 'saw it' : 'heard'} (x${item.factor !== undefined ? item.factor : 1}${item.hidden ? ', a tie the town does not know' : ''}): ${moved.join(', ') || 'no change'}; ${what}`;
  }
  // Hearsay queued, each with its id and turn; past the cap, what was already heard goes first, then the oldest.
  function queueHearsay(items) {
    const q = hearsayList();
    const turn = current.meta.turn;
    for (const it of items) {
      if (!isObj(it) || typeof it.npcId !== 'string') continue;
      let k = 1;
      const stem = `hs${turn}_${it.npcId.replace(/^npc_/, '')}`;
      while (q.some(h => isObj(h) && h.id === `${stem}_${k}`)) k += 1;
      q.push(Object.assign({ id: `${stem}_${k}`, turn }, it));
      // A fight that made news (a beat-down in public) is news for its earlier blows too: they reach each person when the soonest does.
      if (typeof it.fight === 'string' && Number.isInteger(it.dueDay)) {
        const same = q.filter(h => isObj(h) && h.npcId === it.npcId && h.fight === it.fight && !Number.isInteger(h.deliveredTurn));
        const soon = same.slice().sort((a, b) => (a.dueDay - b.dueDay) || (PHASES.indexOf(a.duePhase) - PHASES.indexOf(b.duePhase)))[0];
        for (const h of same) Object.assign(h, { via: soon.via, dueDay: soon.dueDay, duePhase: soon.duePhase });
      }
    }
    while (q.length > Rel.DELIVERY.max) { const i = q.findIndex(h => isObj(h) && Number.isInteger(h.deliveredTurn)); q.splice(i >= 0 ? i : 0, 1); }
  }
  /* What the player did to n reaches the people tied to n (design section
     4.2; Rel.propagate): who saw it (here, not laid up) take their tie's
     share at once, joined to their witness copy of the scene; everyone else
     tied to n hears it later, by the kind of tie (queueHearsay; World's
     step i delivers it). A fight carries what it did in all (a beat-down
     after two hits carries what it added). A settlement of a memory others
     hold a copy of reaches them the same way. Returns the lines. */
  function spreadEvent(n, e, plan, before, seen, pub) {
    if (!isObj(current.ties) || !Object.keys(current.ties).length || e.spread === false || !Rel.spreads({ event: e.event, secondhand: e.secondhand })) return settleEvent(n, plan, seen);
    const after = relNow(n);
    const d = typeof e.fight === 'string' ? { w: after.w - before.w, t: after.t - before.t, f: after.f - before.f } : plan.d;
    const here = npcsAt(current.player.locationId).filter(x => !laidUp(x)).map(x => x.id);
    const present = Array.isArray(e.witnesses) ? seen.filter(id => here.includes(id)) : e.witnesses === 'none' ? [] : here.includes(n.id) ? here.filter(id => id !== n.id) : [];
    const place = loc(current.player.locationId);
    const lines = [];
    const out = Rel.propagate(current, n.id, {
      event: e.event, private: e.private === true, present, news: e.public === true, weight: plan.weight || Rel.EVENTS[e.event].weight, key: plan.memory && typeof plan.memory.key === 'string' ? plan.memory.key : null,
      fight: typeof e.fight === 'string' ? e.fight : undefined, place: place ? place.id : null, placeName: place ? String(place.name).replace(/^The /, 'the ') : 'town', victim: n.name, player: current.player.name
    }, d, relCtx());
    const about = `about ${Rel.placeShort(place)}`;
    for (const it of out.now) { const line = carryTo(npc(it.npcId), it, sceneKey()); if (line) lines.push(line); }
    if (out.later.length) {
      queueHearsay(out.later.map(it => Object.assign({}, it, { about })));
      lines.push(`word will reach ${out.later.map(it => `${it.npcId} (${it.via})`).join(', ')}`);
    }
    return lines.concat(settleEvent(n, plan, present));
  }
  function settleEvent(n, plan, present) {
    if (!plan || !plan.settledKey || !isObj(plan.settledEntry) || !isObj(current.ties)) return [];
    const lines = [];
    const items = Rel.settleSpread(current, n.id, plan.settledKey, plan.settledEntry, Array.isArray(present) ? present : [], relCtx());
    for (const it of items.filter(x => x.how === 'saw')) { const line = carryTo(npc(it.npcId), it, null); if (line) lines.push(line); }
    const later = items.filter(x => x.how !== 'saw');
    if (later.length) { queueHearsay(later); lines.push(`the settling will reach ${later.map(x => x.npcId).join(', ')}`); }
    return lines;
  }
  /* The arrest route (design section 4.5): someone in town arrested by an
     officer (by, else the police head) turns their family in town against
     that officer, liking and trust each Rel.ARREST_TIE, logged with the
     turn. Returns the words for the line. */
  function arrestRoute(n, by) {
    // A game with no ties yet (an older save before rules version 10) carries nothing.
    if (!isObj(current.ties) || !Object.keys(current.ties).length) return '';
    const officer = typeof by === 'string' ? npc(by) : npc(Rel.policeHead(relCtx()));
    if (!officer || officer.id === n.id) return '';
    const pairs = Rel.arrestTies(n, officer.id, relCtx());
    for (const x of pairs) tieLog(x.from, x.to, Rel.ARREST_TIE.w, Rel.ARREST_TIE.t, `${officer.name} arrested ${n.name}`, false);
    return pairs.length ? `; ${pairs.map(x => x.from).join(', ')} turn against ${officer.id}` : '';
  }
  /* Whoever here would tell someone away what the player did to them (the
     integration plan's 5.4: an absent victim is accepted with a present
     witness): someone here, not laid up, tied to them either way, the one
     who would tell them soonest (overnight, then by morning, then when
     they meet). Returns { id, via } or null. */
  function carrierFor(n, present) {
    if (!isObj(current.ties) || !Rel.inTown(n)) return null;
    const ctx = relCtx();
    const rank = { overnight: 0, morning: 1, meet: 2 };
    let best = null;
    for (const id of present) {
      const w = npc(id);
      if (!w || w.id === n.id || laidUp(w) || !Rel.inTown(w)) continue;
      const tie = Rel.tieOf(n.id, w.id, ctx) || Rel.tieOf(w.id, n.id, ctx);
      if (!tie) continue;
      const via = Rel.deliveryOf(n, w, tie, ctx);
      if (!best || rank[via] < rank[best.via]) best = { id: w.id, via };
    }
    return best;
  }
  /* The bookkeeper's event for someone away (c.carrier: who here will tell
     them): theirs is on its way, by that tie, at what hearing it is worth
     (FACTORS.heard), and is their own memory when it reaches them (World's
     step i); the people here who are tied to them hear only the words (an
     insult, a kind word, prying), at half, as on a call (design section
     4.4). Returns the line. */
  function absentEvent(n, p, c, present) {
    const scale = clamp((Number.isFinite(p.scale) ? p.scale : 1) * (Number.isFinite(c.scale) ? c.scale : 1), 0.1, 2);
    const ev = Object.assign({ event: p.event, text: c.text }, p.aboutId ? { aboutId: p.aboutId } : {}, p.private ? { private: true } : {}, isObj(p.d) ? { d: p.d } : {}, { scale: Math.max(0.1, Math.round(scale * Rel.FACTORS.heard * 100) / 100) });
    const place = loc(current.player.locationId);
    queueHearsay([Object.assign({ npcId: n.id, aboutId: n.id, own: true, ev, event: p.event, via: c.carrier.via, factor: Rel.FACTORS.heard, carrier: c.carrier.id, hidden: false, about: `about ${Rel.placeShort(place)}`, expires: current.time.day + Rel.DELIVERY.expires },
      Rel.dueOf(c.carrier.via, current.time.day, current.time.phase))]);
    const lines = [`${n.id} ${p.event}: not here; ${c.carrier.id} will tell them (${c.carrier.via})`];
    if (isObj(current.ties) && (Rel.WORDS_EVENTS.includes(p.event) || p.event === 'humiliated')) {
      relWrite(n);
      const dry = Rel.applyEvent(n, Object.assign({}, ev, { scale }), relCtx());
      const here = present.filter(id => id !== n.id && npc(id) && !laidUp(npc(id)));
      const out = dry ? Rel.propagate(current, n.id, { event: p.event, private: p.private === true, present: here, half: true, weight: dry.weight, key: null, place: place ? place.id : null, placeName: place ? String(place.name).replace(/^The /, 'the ') : 'town', victim: n.name, player: current.player.name }, dry.d, relCtx()) : { now: [] };
      for (const it of out.now) { const line = carryTo(npc(it.npcId), it, null); if (line) lines.push(line); }
    }
    return lines.join('; ');
  }
  /* A hidden tie the player has found out (Rel.tieRevealed: a rumour
     heard, a flag set, a leverage record whose words name it) is marked
     known, with the turn (/rewind takes it back). Run at the end of each
     apply that changed anything. */
  function tiesKnown() {
    if (!current || !isObj(current.ties)) return;
    const ctx = relCtx();
    for (const k of Object.keys(current.ties)) {
      const t = current.ties[k];
      if (!isObj(t) || t.hidden !== true || t.known === true) continue;
      const [a, b] = k.split('>');
      if (Rel.tieRevealed(t, a, b, ctx)) { t.known = true; t.knownTurn = current.meta.turn; }
    }
  }

  // ----- wave 29: leverage, secrets shown, favours owed -----
  function leverageList() { if (!Array.isArray(current.leverage)) current.leverage = []; return current.leverage; }
  function leverageRec(id) { return typeof id === 'string' ? leverageList().find(x => isObj(x) && x.id === id) || null : null; }
  function knownSecrets() { if (!isObj(current.known)) current.known = { secrets: {} }; if (!isObj(current.known.secrets)) current.known.secrets = {}; return current.known.secrets; }
  const SECRET_HOWS = Object.freeze(['roll', 'trust', 'fear', 'rumour']);
  /* A secret given to the narrator this turn (Pipeline step 6: secretsFor),
     or a marked rumour heard: state.known.secrets[npcId] = { turn, day, how
     }, the first time only. Only then can the player hold it. */
  function secretShown(x) {
    if (!isObj(x)) bad('must be an object { npcId, how }');
    const n = needNpc(x.npcId);
    if (typeof n.secret !== 'string' || !n.secret.trim()) bad(`${n.id} has no secret`);
    if (!SECRET_HOWS.includes(x.how)) bad(`how must be ${SECRET_HOWS.join(', ')}`);
    const k = knownSecrets();
    if (isObj(k[n.id])) return null;
    k[n.id] = { turn: current.meta.turn, day: current.time.day, how: x.how };
    return `${n.id}'s secret shown to the player (${x.how})`;
  }
  /* A leverage record made (the integration plan's 2.4; Rel.leverageOf has
     the shape): one side the player, the other someone in the cast; text
     the story's words (120 at most, never the secret field); weight 1 to
     3; a record the player holds over a secret needs that secret shown to
     them (known.secrets: the narrator had it, or a marked rumour was
     heard). key: one record an act (caught at it). The id is
     lev_<their id>_<n>. Prints "Hollis Byrd knows you know." (aware), "You
     have something on Mavis Mangum now." (they do not know), or, over the
     player once they know of it, "Glenda Pryor has something on you.". */
  function leverageAdd(e) {
    if (!isObj(e)) bad('must be an object');
    const side = v => (v === 'player' ? 'player' : needNpc(v).id);
    const holder = side(e.holder);
    const over = side(e.over);
    if (holder === over) bad('the holder and the one it is over must differ');
    if (holder !== 'player' && over !== 'player') bad('one side must be the player');
    const about = isObj(e.about) ? e.about : {};
    if (!Rel.LEV_ABOUT.includes(about.kind)) bad(`about.kind must be ${Rel.LEV_ABOUT.join(', ')}`);
    const text = cleanText(e.text, 120);
    if (!text) bad('needs text: the words the story used for it');
    const weight = toInt(e.weight);
    if (weight === null || weight < 1 || weight > 3) bad('weight must be 1, 2 or 3');
    const them = npc(holder === 'player' ? over : holder);
    if (holder === 'player' && about.kind === 'secret' && !isObj(knownSecrets()[over])) bad(`${over}'s secret was never shown to the player`);
    const list = leverageList();
    if (typeof e.key === 'string' && e.key && list.some(x => isObj(x) && x.key === e.key)) return `no-op: a record for ${e.key} is already kept`;
    const slug = them.id.replace(/^npc_/, '');
    let k = 1;
    while (list.some(x => isObj(x) && x.id === `lev_${slug}_${k}`)) k += 1;
    const turn = current.meta.turn;
    const day = current.time.day;
    const mattersTo = (Array.isArray(e.mattersTo) ? e.mattersTo : []).filter((id, i, a) => typeof id === 'string' && a.indexOf(id) === i && id !== them.id && !!npc(id));
    const playerKnows = holder === 'player' ? true : e.playerKnows === true;
    const rec = {
      id: `lev_${slug}_${k}`, holder, over, about: Object.assign({ kind: about.kind }, about.kind === 'secret' ? { npcId: them.id } : {}), text, weight,
      since: { day, turn, via: cleanText(e.via, 30) || (about.kind === 'secret' ? 'learned_secret' : about.kind === 'seen' ? 'caught_you_at' : 'loose_end') },
      aware: holder === 'player' ? e.aware !== false : playerKnows, playerKnows, status: 'held', log: [{ turn, day, status: 'held' }], demand: null, uses: [], knownBy: [], mattersTo
    };
    if (typeof e.key === 'string' && e.key) rec.key = cleanText(e.key, 80);
    list.push(rec);
    // The memory the record grew from this turn (learned_secret, caught_you_at) carries its id, so it is told once.
    const held = holder === 'player' ? them : npc(holder);
    const m = held && Array.isArray(held.memories) ? held.memories.slice().reverse().find(x => isObj(x) && x.turn === turn && x.event === rec.since.via && !x.leverageId) : null;
    if (m) m.leverageId = rec.id;
    if (holder === 'player') feedLine(rec.aware ? `${them.name} knows you know.` : `You have something on ${them.name} now.`, them.id, 'yours');
    else if (playerKnows) feedLine(`${them.name} has something on you.`, them.id, 'theirs');
    // The fear of what the player knows is part of the tracks (Rel.recompute's levFear).
    relWrite(them);
    return `${rec.id}: ${holder === 'player' ? `the player holds ${them.id}` : `${them.id} holds the player`} (weight ${weight}${rec.aware ? '' : ', they do not know'}${mattersTo.length ? `; it matters to ${mattersTo.join(', ')}` : ''})`;
  }
  /* A record's change (the effect op leverageSet; the engine's too): {
     id, status? (held -> used -> paid; any live one -> spent or void; a
     status it cannot reach from where it is is a no-op), aware?,
     playerKnows?, demand? (merged: { amount?, dueDay?, turn?, obligationId?,
     paid?, paidDay? }), use? (an event of theirs: the uses log), knownBy?
     (ids, or "mattersTo": who was told), tell? (with spent: each of
     knownBy newly told takes told_anyway, "<holder> told me what <player>
     has been hiding") }. Every change is logged with its turn (/rewind). */
  function leverageSet(e) {
    if (!isObj(e)) bad('must be an object');
    const rec = leverageRec(e.id) || bad(`unknown leverage record "${e.id}"`);
    const turn = current.meta.turn;
    const day = current.time.day;
    const parts = [];
    const them = npc(rec.holder === 'player' ? rec.over : rec.holder);
    const was = rec.status;
    if (!Array.isArray(rec.log)) rec.log = [];
    if (e.status !== undefined && e.status !== rec.status) {
      if (!Rel.LEV_STATUSES.includes(e.status)) bad(`status must be ${Rel.LEV_STATUSES.join(', ')}`);
      if (!(Rel.LEV_NEXT[rec.status] || []).includes(e.status)) return `no-op: ${rec.id} is ${rec.status} and cannot become ${e.status}`;
      rec.status = e.status;
      rec.log.push({ turn, day, status: e.status });
      parts.push(`${was} -> ${e.status}`);
    }
    if (typeof e.aware === 'boolean' && rec.aware !== e.aware) { rec.aware = e.aware; parts.push(e.aware ? 'they know' : 'they do not know'); }
    let known = false;
    if (e.playerKnows === true && rec.playerKnows !== true) { rec.playerKnows = true; known = true; if (rec.over === 'player') rec.aware = true; parts.push('the player knows of it'); }
    if (isObj(e.demand)) {
      const d = Object.assign({}, isObj(rec.demand) ? rec.demand : {});
      for (const k of ['amount', 'dueDay', 'turn', 'paidDay']) if (Number.isInteger(toInt(e.demand[k]))) d[k] = clamp(toInt(e.demand[k]), 0, 1000000);
      if (typeof e.demand.obligationId === 'string') d.obligationId = e.demand.obligationId;
      if (typeof e.demand.paid === 'boolean') d.paid = e.demand.paid;
      if (!Number.isInteger(d.turn)) d.turn = turn;
      rec.demand = d;
      parts.push(`demand ${d.obligationId ? d.obligationId : `${money(d.amount | 0)} due day ${d.dueDay}`}`);
    }
    if (rec.status === 'paid' && was !== 'paid' && isObj(rec.demand) && rec.holder === 'player') { rec.demand.paid = true; rec.demand.paidDay = day; }
    if (typeof e.use === 'string' && Rel.EVENTS[e.use]) { rec.uses = (Array.isArray(rec.uses) ? rec.uses : []).concat([{ turn, day, event: e.use }]); parts.push(`used: ${e.use}`); }
    const told = [];
    if (e.knownBy !== undefined) {
      const ids = e.knownBy === 'mattersTo' ? (Array.isArray(rec.mattersTo) ? rec.mattersTo : []) : Array.isArray(e.knownBy) ? e.knownBy : [e.knownBy];
      rec.knownBy = Array.isArray(rec.knownBy) ? rec.knownBy : [];
      for (const id of ids) if (typeof id === 'string' && npc(id) && !rec.knownBy.some(x => x.npcId === id)) { rec.knownBy.push({ npcId: id, turn }); told.push(id); }
      if (told.length) parts.push(`told: ${told.join(', ')}`);
    }
    if (e.tell === true && rec.status === 'spent' && rec.over === 'player' && them) {
      for (const id of told) parts.push(socialEvent(Object.assign({ npcId: id, event: 'told_anyway', text: fillTemplate('{holder} told me what {player} has been hiding', { holder: them.name, player: current.player.name }), leverageId: rec.id }, e.hidden === true ? { secondhand: { via: them.id, hidden: true } } : {}), 'leverageSet'));
    }
    // The feed (design section 7.2).
    if (them) {
      if (rec.holder === 'player' && rec.status === 'paid' && was !== 'paid') feedLine(`${them.name} has paid for your silence.`, them.id, 'silence');
      if (rec.over === 'player' && rec.status === 'paid' && was !== 'paid') feedLine(`${them.name} will keep quiet.`, them.id, 'silence');
      if (rec.over === 'player' && rec.status === 'spent' && was !== 'spent') feedLine(`${them.name} told.`, them.id, 'silence');
      if (rec.over === 'player' && known && rec.status !== 'spent') feedLine(`${them.name} has something on you.`, them.id, 'theirs');
      if (rec.holder === 'player' && e.aware === true && parts.includes('they know')) feedLine(`${them.name} knows you know.`, them.id, 'yours');
      relWrite(them);
    }
    return parts.length ? `${rec.id}: ${parts.join('; ')}` : null;
  }
  /* The player told X what they hold over Y (the bookkeeper's exposed; the
     integration plan's 19.4): the record is spent (X knows), Y learns who
     told at once (in tier A always: liking -30, trust -30, a weight-3 scar
     that counts as harm), a paid-for secret told is a broken word too, and
     a secret that reaches the police it matters to runs its whenTold.
     Returns the lines. */
  function exposeTo(x, yId, recId) {
    const y = npc(yId);
    const rec = leverageRec(recId);
    if (!y || !rec) return [];
    const paid = rec.status === 'paid';
    const out = [leverageSet({ id: rec.id, status: 'spent', knownBy: [x.id] })].filter(Boolean);
    const p = current.player.name;
    // Wave 32: how X sees Y now (the town's secretTies: Dewayne's trust in Mavis 60 to 15), changed in front of the player, and what it sets going (seed).
    for (const st of Rel.secretTiesFor(y.id, x.id, relCtx())) {
      for (const t of st.ties) {
        if (!isObj(t) || !npc(t.from) || !npc(t.to)) continue;
        tieLog(t.from, t.to, toInt(t.w) || 0, toInt(t.t) || 0, st.why, true, true);
        out.push(`${t.from}>${t.to}: ${[toInt(t.w) ? `liking ${plusMinus(toInt(t.w))}` : '', toInt(t.t) ? `trust ${plusMinus(toInt(t.t))}` : ''].filter(Boolean).join(', ')} (${cleanText(st.why, 80)})`);
      }
      if (isObj(st.seed)) out.push(secretSeed(y, x, st));
    }
    const yEvents = [{ event: 'exposed', aboutId: x.id, text: `${p} told ${x.name} what I was hiding: ${rec.text}`, d: { w: -30, t: -30 }, weight: 3, decay: 'scar', leverageId: rec.id }];
    if (paid) yEvents.push({ event: 'broke_word', text: `${p} took my money to keep quiet and told anyway`, weight: 2, leverageId: rec.id });
    const here = npcsAt(current.player.locationId).some(m => m.id === y.id);
    if (here || !isObj(current.ties) || !Object.keys(current.ties).length) {
      // Y is here to hear it, or a game with no ties yet (before rules version 10): at once, as wave 29 had it.
      for (const ev of yEvents) out.push(socialEvent(Object.assign({ npcId: y.id }, ev), 'exposed'));
    } else {
      /* Wave 32 (design section 4.5): Y learns who told by the tie between
         them (a husband or wife and the household overnight, family and work
         by the morning, the rest when they meet; tied by nothing, by the
         morning), and takes it as their own (World's step i). */
      const ctx = relCtx();
      const tie = Rel.tieOf(y.id, x.id, ctx) || Rel.tieOf(x.id, y.id, ctx);
      const via = tie ? Rel.deliveryOf(y, x, tie, ctx) : 'morning';
      queueHearsay(yEvents.map(ev => Object.assign({ npcId: y.id, aboutId: y.id, own: true, ev, event: ev.event, via, factor: 1, hidden: false, about: `what you told ${firstName(x)}`, day: current.time.day, expires: current.time.day + Rel.DELIVERY.expires },
        Rel.dueOf(via, current.time.day, current.time.phase))));
      out.push(`${y.id} will hear who told (${via})`);
    }
    if (Rel.isPoliceNpc(x) && Array.isArray(rec.mattersTo) && rec.mattersTo.includes(x.id)) out.push(...whenTold(y, x, rec));
    return out;
  }
  /* What a secret told sets going (secretTies' seed: { effect, dayOffset }):
     a hidden seed, due a day or two on (its own draw, Rel.rng), told when it
     comes: Tammy Lott going after Colt Purvis. Returns the line. */
  function secretSeed(y, x, st) {
    const day = current.time.day;
    const off = Array.isArray(st.seed.dayOffset) && st.seed.dayOffset.length ? st.seed.dayOffset : [1, 2];
    const lo = clamp(toInt(off[0]) || 1, 1, 10);
    const hi = clamp(toInt(off.length > 1 ? off[1] : off[0]) || lo, lo, 10);
    const r = Rel.rng('secretTie', x.id, day);
    let id = `seed_told_${x.id.slice(4)}_${y.id.slice(4)}`;
    for (let k = 2; seed(id); k++) id = `seed_told_${x.id.slice(4)}_${y.id.slice(4)}_${k}`;
    const sd = normaliseSeed({ id, cause: `Told: ${x.name} learned ${y.name}'s secret from ${current.player.name}`, effect: cleanText(fillTemplate(st.seed.effect, { npc: x.name, player: current.player.name, playerName: current.player.name }), 400),
      trigger: { type: 'day', value: day + r.int(lo, hi) }, hidden: true, origin: { kind: 'town', npcId: x.id, key: `${x.id}>${y.id}` }, turn: current.meta.turn }, false);
    current.seeds.push(sd);
    return `${sd.id} planted (day ${sd.trigger.value})`;
  }
  /* A secret reaches the police it matters to (design section 2.6.5): the
     secret's whenTold ({ memory?, crime?, inquiry?, news? }), else the
     default: a weight-3 noted memory for the officer ("knows what Hollis
     Byrd has been doing"); for a crime, an inquiry seed due in a day or
     two on its own draw (Rel.rng('inquiry')) that moves the police clock
     one segment and makes town news. Never an arrest. */
  function whenTold(y, police, rec) {
    const hook = Rel.whenToldOf(y, relCtx()) || {};
    const W = Rel.WHEN_TOLD;
    const out = [socialEvent({ npcId: police.id, event: 'noted', text: cleanText(fillTemplate(hook.memory || W.memory, { npc: y.name }), 200), weight: 3, leverageId: rec.id }, 'whenTold')];
    if (hook.crime === true) {
      const day = current.time.day;
      const r = Rel.rng('inquiry', y.id, day);
      const due = day + r.int(W.days[0], W.days[1]);
      const fx = [{ op: 'clockAdjust', factionId: 'fac_police', delta: 1 }, { op: 'addNews', text: cleanText(fillTemplate(hook.news || W.news, { npc: y.name, police: police.name }), 300), public: true }].filter(e => e.op !== 'clockAdjust' || !!faction(e.factionId));
      const sd = normaliseSeed({ id: `seed_inquiry_${y.id.slice(4)}`, cause: `Inquiry: ${police.name} was told about ${y.name}`, effect: cleanText(fillTemplate(hook.inquiry || W.inquiry, { npc: y.name, police: police.name }), 400), trigger: { type: 'day', value: due }, hidden: true,
        origin: { kind: 'inquiry', npcId: police.id, key: rec.id }, turn: current.meta.turn, effects: fx }, false);
      current.seeds.push(sd);
      out.push(`seed ${sd.id} planted (an inquiry, day ${due})`);
    }
    return out;
  }
  /* The player came clean to the one a loose end's secret would be told to
     (the bookkeeper's came_clean, the integration plan's 8.4): the record
     over the player is void, and its blackmail can no longer be (lapsed,
     no onMiss). */
  function cameClean(recId) {
    const rec = leverageRec(recId);
    if (!rec) return [];
    const out = [leverageSet({ id: rec.id, status: 'void' })].filter(Boolean);
    const o = obligationList().find(x => x.status === 'open' && x.kind === 'blackmail' && ((isObj(rec.demand) && rec.demand.obligationId === x.id) || x.npcId === rec.holder));
    if (o) out.push(settle(o, 'lapsed', 'came clean'));
    return out;
  }
  // A heard rumour content marks leverageOver (rumoursHeard): the record, or null.
  function rumourLeverage(r) {
    const own = typeof r.leverageOver === 'string' ? r.leverageOver : null;
    const live = !own && current.meta.townName === TOWN_DATA.name ? (TOWN_DATA.rumours || []).find(x => x.id === r.id) : null;
    const over = own || (live && typeof live.leverageOver === 'string' ? live.leverageOver : null);
    const n = over ? npc(over) : null;
    if (!n || r.true === false || typeof n.secret !== 'string' || !n.secret.trim()) return null;
    if (Rel.holdsOver(n, relCtx()).some(x => isObj(x.about) && x.about.kind === 'secret')) return null;
    secretShown({ npcId: n.id, how: 'rumour' });
    return leverageAdd({ holder: 'player', over: n.id, about: { kind: 'secret' }, text: r.text, weight: Rel.secretWeightOf(n, relCtx()), mattersTo: Rel.mattersToOf(n, relCtx()), aware: false, via: 'rumour' });
  }
  // The record a blackmail obligation is about: its demand's, else the informant's loose end over the player.
  function blackmailRecord(o) {
    const list = leverageList().filter(isObj);
    return list.find(x => isObj(x.demand) && x.demand.obligationId === o.id) || list.find(x => x.holder === o.npcId && x.over === 'player' && isObj(x.about) && x.about.kind === 'loose_end' && Rel.LEV_LIVE.includes(x.status)) || null;
  }
  /* Favours owed cleared ({ npcId, dir? }: +1 what they owe the player, -1
     what the player owes them, neither both): "<Name> is square with you."
     when nothing is owed either way after it. */
  function owedSettle(e) {
    if (!isObj(e)) bad('must be an object');
    const n = needNpc(e.npcId);
    if (e.dir !== undefined && e.dir !== 1 && e.dir !== -1) bad('dir must be 1 or -1');
    relWrite(n);
    const before = n.rel.net | 0;
    const had = (Array.isArray(n.rel.owed) ? n.rel.owed : []).length;
    n.rel.owed = (Array.isArray(n.rel.owed) ? n.rel.owed : []).filter(o => isObj(o) && e.dir !== undefined && Math.sign(Number(o.dir) || 0) !== e.dir);
    relWrite(n);
    if (had === n.rel.owed.length) return `no-op: nothing owed ${e.dir === 1 ? 'to the player by' : e.dir === -1 ? 'by the player to' : 'between the player and'} ${n.id}`;
    if (before !== 0 && (n.rel.net | 0) === 0 && n.knownToPlayer) feedLine(`${n.name} is square with you.`, n.id, 'favour');
    return `${n.id} owed ${before} -> ${n.rel.net | 0}`;
  }

  // ----- memories -----
  /* The first five words of a memory, for telling near-identical ones apart. */
  function memoryKey(text) {
    return String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
  }
  /* A memory for a person (newMemories, the addMemory op). opts.model: the
     bookkeeper's (one per person per turn: a heavier one replaces a lighter
     one from the same turn, a lighter one is dropped). opts.merge: a memory
     that starts with the same five words as one already held merges into it
     (the newer words, the heavier weight, this turn) instead of piling up.
     Small things fade: weight-1 memories older than MEMORY_STALE_TURNS go
     when something new arrives; past MEMORY_MAX the lightest go first. */
  /* The kind of turn a memory was made in (wave 5, playtest Q3), kept on it
     (act) so what a grudge answers is read from what the player did, not
     from the words: a fight, a theft or words. */
  /* Wave 6 (the round-5 playtest's R3): 'own' marks what the person did to
     the player (the enemy's beating, the repo man taking the phone, the
     chief locking them up): no offence of the player's, so no grudge grows
     from it (World.freshMemory and memoryKind skip it). */
  const MEMORY_ACTS = Object.freeze(['attack', 'steal', 'talk', 'persuade', 'deceive', 'intimidate', 'own']);
  /* Wave 26 (Rel): a line written here is typed for its kind
     (Rel.typeMemory: event) with d null, so it moves no track; one that
     replaces or pushes out a typed memory (socialEvent's) leaves the tracks
     where they were (relPin). */
  function remember(n, text, w, opts) {
    const s = current;
    const model = !!(opts && opts.model);
    const act = opts && MEMORY_ACTS.includes(opts.act) ? opts.act : null;
    if (!Array.isArray(n.memories)) n.memories = [];
    relWrite(n);
    const keep = relNow(n);
    const typedBefore = n.memories.filter(x => isObj(x) && isObj(x.d));
    if (model) {
      const sameTurn = n.memories.findIndex(x => x.turn === s.meta.turn && x.model);
      if (sameTurn >= 0) {
        if (n.memories[sameTurn].weight >= w) bad(`${n.id} already has a memory this turn (one per person per turn)`);
        n.memories.splice(sameTurn, 1);
      }
    }
    n.memories = n.memories.filter(x => x.weight > 1 || s.meta.turn - x.turn <= MEMORY_STALE_TURNS);
    let merged = null;
    if (opts && opts.merge) {
      const key = memoryKey(text);
      const i = key ? n.memories.findIndex(x => memoryKey(x.text) === key) : -1;
      if (i >= 0) { merged = n.memories.splice(i, 1)[0]; w = Math.max(w, merged.weight | 0); }
    }
    // Its day too (wave 4, playtest R5): how old a memory is never depends on how far back the log reaches.
    const line = Object.assign({ turn: s.meta.turn, day: s.time.day, text, weight: w }, model ? { model: true } : {}, act ? { act } : {});
    n.memories.push(Object.assign(line, { event: opts && typeof opts.event === 'string' && Rel.EVENTS[opts.event] ? opts.event : Rel.typeMemory(line), d: null }));
    // Wave 30: a serious grievance is "won't forget that" in the feed (App.noteRel), as a typed one is.
    if (w >= 3 && !relQuiet && !muted && act !== 'own' && !protectedMemory(line) && Rel.harmful(line)) { syncLedger(); ledger.harm3[n.id] = true; }
    // Past MEMORY_MAX (wave 27, Rel.evictIndex): witness copies first, then the shortest-lived; never a loose end's line or a fact.
    while (n.memories.length > MEMORY_MAX) n.memories.splice(Rel.evictIndex(n.memories), 1);
    if (typedBefore.some(x => !n.memories.includes(x))) relPin(n, keep);
    return `${n.id} remembers "${text}" (weight ${w})` + (merged ? ` (merged with "${merged.text}")` : '');
  }
  // ----- the player's things and conditions -----
  /* Into the inventory by id (stacking, at most 99). */
  function carry(id, name, qty, notes) {
    const p = current.player;
    const held = p.inventory.find(i => i.id === id);
    if (held) held.qty = Math.min(99, held.qty + qty);
    else p.inventory.push({ id, name, qty, notes });
  }
  /* A condition on the player, replacing one with the same id. untilDay
     null lasts until the next rest (untilRest). */
  function putCondition(c) {
    const p = current.player;
    const cond = Object.assign({ id: c.id || 'cond_' + slugify(c.name) }, c);
    const i = p.conditions.findIndex(x => x.id === cond.id);
    if (i >= 0) p.conditions[i] = cond; else p.conditions.push(cond);
    return `condition ${cond.id}` + (Number.isInteger(cond.untilDay) ? ` until day ${cond.untilDay}` : ' until the next rest');
  }
  /* The goods table's entry a bought thing's name means, or null: the same
     words, or one name the start of the other ("Shot of whiskey" and "Shot
     of whiskey at the Low Water"). */
  function goodsEntry(name) {
    const goods = TABLES.items && Array.isArray(TABLES.items.goods) ? TABLES.items.goods : [];
    const norm = v => String(v || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(a|an|the|some) /, '');
    const want = norm(name);
    if (!want) return null;
    return goods.find(g => isObj(g) && norm(g.name) === want)
      || goods.find(g => isObj(g) && norm(g.name) && (want.startsWith(norm(g.name) + ' ') || norm(g.name).startsWith(want + ' '))) || null;
  }
  /* A good by name (wave 6, the fifth review's bug 1): words a good of the
     goods table goes by (GOOD_WORDS: the words of its names, but not the
     measures, numbers and plain words in them: "Thirty days of prepaid
     minutes" is minutes; and what a drink, food or service is called at a
     counter: a round, a cold one, a room, a tab), or the name of a thing on
     sale where the player stands (a scene item with a price). goodNamed(text)
     is true when the text names one; Pipeline reads a Say line with it, and
     State.apply the bookkeeper's itemsGained. */
  const GOOD_STOP = new Set('the and for set ten five dozen cup jug bed hot old pair some can case night thirty days off first aid work used pawned wedding rain roll bolt energy prepaid nasal scratch rented fifth tune five-gallon minutes ring'.split(' '));
  const GOOD_SYNONYMS = ['drink', 'drinks', 'beer', 'beers', 'round', 'rounds', 'shot', 'shots', 'coffee', 'coffees', 'soda', 'sodas', 'coke', 'cokes', 'pop', 'cola', 'whiskey', 'bourbon', 'cold one', 'cold ones',
    'tallboy', 'tallboys', 'six-pack', 'six-packs', 'refill', 'tab', 'food', 'plate', 'basket', 'burger', 'burgers', 'sandwich', 'sandwiches', 'biscuit', 'biscuits', 'fries', 'catfish',
    'room', 'rooms', 'haircut', 'trim', 'fill-up', 'tank', 'gas', 'cigarettes', 'smokes', 'scratch-off', 'scratch-offs', 'scratcher', 'scratchers', 'lottery ticket', 'lottery tickets', 'wedding ring', 'wedding rings', 'prepaid minutes'];
  let goodWordsRe = null;
  function goodWords() {
    if (goodWordsRe) return goodWordsRe;
    const goods = TABLES.items && Array.isArray(TABLES.items.goods) ? TABLES.items.goods : [];
    const words = new Set(GOOD_SYNONYMS);
    for (const g of goods) {
      if (!isObj(g) || typeof g.name !== 'string') continue;
      for (const w of g.name.toLowerCase().split(/[^a-z-]+/)) if (w.length >= 3 && !GOOD_STOP.has(w)) { words.add(w); words.add(/s$/.test(w) ? w.replace(/s$/, '') : w + 's'); }
      if (SERVICE_KINDS.includes(g.kind)) words.add(g.kind === 'service' ? 'service' : g.kind);
    }
    words.delete('service');
    const list = Array.from(words).filter(w => w.length >= 3).sort((a, b) => b.length - a.length).map(w => w.replace(/[-]/g, '[- ]?').replace(/\s+/g, '\\s+'));
    goodWordsRe = new RegExp(`(?:${list.join('|')})`);
    return goodWordsRe;
  }
  /* The names of things on sale where the player stands (scene items with a price), in lower case. */
  function forSaleHere() {
    const l = current ? find(current.locations, current.player.locationId) : null;
    return (l && Array.isArray(l.items) ? l.items : []).filter(i => isObj(i) && Number.isFinite(i.price) && i.price > 0 && typeof i.name === 'string').map(i => i.name.toLowerCase());
  }
  /* A regex source for a good: a goods word, or a word of a thing on sale here. */
  function goodSource() {
    const here = forSaleHere().flatMap(n => n.split(/[^a-z-]+/)).filter(w => w.length >= 3 && !GOOD_STOP.has(w)).map(w => w.replace(/[-]/g, '[- ]?'));
    return here.length ? `(?:${goodWords().source}|${here.join('|')})` : goodWords().source;
  }
  function goodNamed(text) {
    const t = String(text || '').toLowerCase().replace(/[’]/g, "'");
    if (!t.trim()) return false;
    if (goodsEntry(t)) return true;
    if (forSaleHere().includes(t.trim().replace(/^(?:a|an|the|some)\s+/, ''))) return true;
    return new RegExp(`(?:^|[^a-z])${goodSource()}(?![a-z])`).test(t);
  }
  /* What a bought thing is: { kind, lodging } when it is used up where it
     is bought (a service, a drink, food; CONTRACTS section 7), else null.
     A night or a room "at" somewhere is lodging even when the table has no
     entry for it. */
  function serviceOf(name) {
    const g = goodsEntry(name);
    if (g && SERVICE_KINDS.includes(g.kind)) return { kind: g.kind, lodging: g.kind === 'service' && (g.lodging === true || LODGING_RE.test(g.name)) };
    if (!g && LODGING_RE.test(String(name || ''))) return { kind: 'service', lodging: true };
    return null;
  }
  // ----- obligations (CONTRACTS section 4) -----
  function obligationList() {
    const p = current.player;
    if (!Array.isArray(p.obligations)) p.obligations = [];
    return p.obligations;
  }
  function obligation(id) { return current ? find(obligationList(), id) : null; }
  /* The obligations, all or those with one status (open, met, missed). */
  /* The obligations, all or those with one status (open, met, missed), or
     'owed': the open ones and the missed ones that can still be made good
     (wave 2: a missed debt or blackmail not paid in full, an errand whose
     thing is still carried; paying or handing it over late meets it, and
     its onMet runs then). */
  function stillOwed(o) {
    if (o.status !== 'missed') return false;
    if ((o.kind === 'debt' || o.kind === 'blackmail') && Number.isInteger(o.amount) && o.amount > 0) return (o.paid | 0) < o.amount;
    if (o.kind === 'errand' && o.itemName) return !!findHeld(o.itemName);
    return false;
  }
  function obligations(status) {
    if (!current) return [];
    const list = obligationList();
    if (status === 'owed') return list.filter(o => o.status === 'open' || stillOwed(o));
    return typeof status === 'string' ? list.filter(o => o.status === status) : list.slice();
  }
  /* The morning tick (World.tick calls it each new day): every open
     obligation whose dueDay is before day is missed (settleObligation, so
     its onMiss runs once). Returns the ids missed. */
  /* Wave 6 (the fifth review's bug 2): every one it marked missed is
     returned, whatever its onMiss did after (the repo man's seizure that
     pays the note off does not make it met). opts.detail: each as { id,
     gold, items }, what its onMiss took from the player (the cash, the
     names of the things), each settled in an apply of its own so what it
     took can be told ("Missed: … Hollis Byrd took $150 toward it and your
     Prepaid phone."). */
  function tickObligations(day, opts) {
    if (!current) return [];
    const d = Number.isInteger(day) ? day : current.time.day;
    const due = obligations('open').filter(o => Number.isInteger(o.dueDay) && o.dueDay < d);
    if (!due.length) return [];
    const out = [];
    for (const o of due) {
      /* Wave 29, the standoff (the integration plan's 8.4): a blackmail whose
         person the player holds an aware record over, someone not hard,
         lapses on its day with no onMiss; both records stand. */
      const holder = o.kind === 'blackmail' ? npc(o.npcId) : null;
      if (holder && Rel.holdsOver(holder, relCtx(), true).length && !Rel.axesOf(holder, relCtx()).hard) {
        apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'lapsed', how: 'a standoff' }] }, { source: 'world' });
        continue;
      }
      const p = current.player;
      const gold0 = p.gold | 0;
      const held0 = new Map(p.inventory.map(i => [i.id, i.qty | 0]));
      const names0 = new Map(p.inventory.map(i => [i.id, i.name]));
      const r = apply({ effects: [{ op: 'settleObligation', id: o.id, status: 'missed' }] }, { source: 'world' });
      if (!(r.settled || []).some(x => x.id === o.id && x.status === 'missed')) continue;
      const held = new Map(current.player.inventory.map(i => [i.id, i.qty | 0]));
      const items = Array.from(held0.keys()).filter(id => (held.get(id) || 0) < held0.get(id)).map(id => names0.get(id));
      out.push({ id: o.id, gold: Math.max(0, gold0 - (current.player.gold | 0)), items });
    }
    return opts && opts.detail ? out : out.map(x => x.id);
  }
  /* Bans, the player's own prices and paid lodging that ran out before day
     (advanceTime does this at each new morning; idempotent). Returns what
     ran out, in words. */
  function expireDaily(day) {
    if (!current) return [];
    const d = Number.isInteger(day) ? day : current.time.day;
    const r = apply({ expireDaily: d }, { source: 'world' });
    const line = r.applied.find(x => x.startsWith('expireDaily'));
    return line ? line.replace(/^expireDaily: /, '').split('; ') : [];
  }
  /* Fill {npc}, {npcId}, {player} and {playerName} in every string of a value. */
  function fillDeep(v, vars) {
    if (typeof v === 'string') return fillTemplate(v, vars);
    if (Array.isArray(v)) return v.map(x => fillDeep(x, vars));
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = fillDeep(v[k], vars); return o; }
    return v;
  }
  /* Whether an errand's thing already reached its person: they remember
     getting it (a memory with the thing's head word: "letter" for "Letter
     for Jodie Strayhorn"). */
  function errandDone(n, itemName) {
    const head = String(itemName || '').toLowerCase().replace(/^(a|an|the)\s+/, '').split(/\s+(?:for|from|to|of)\s+/)[0].trim();
    if (head.length < 3) return false;
    const re = new RegExp(`\\b${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i');
    return (Array.isArray(n.memories) ? n.memories : []).some(m => !protectedMemory(m) && re.test(String(m.text || '')));
  }
  /* An obligation met or missed: its onMet or onMiss effects run once, as
     part of the apply that settled it (their own lines and refusals). */
  const missing = new Set(); // the obligations whose onMiss is running now
  function settle(o, status, how, lateNow) {
    // A missed one still owed can be met late, once (late: true; its onMet runs then). lateNow: settled by play just now (paid in full, the thing handed over), so no longer "still owed".
    const late = o.status === 'missed' && status === 'met' && (lateNow === true || stillOwed(o));
    if (o.status !== 'open' && !late) return `no-op: ${o.id} is already ${o.status}`;
    o.status = status;
    if (late) o.late = true;
    o.settledDay = current.time.day;
    o.settledTurn = current.meta.turn;
    if (applyCtx) (applyCtx.result.settled = applyCtx.result.settled || []).push({ id: o.id, status });
    /* Wave 29: lapsed ("can no longer be": a standoff, or the player came
       clean) runs neither onMet nor onMiss. A standoff says so: "Glenda
       Pryor lets it drop." */
    if (status === 'lapsed') {
      const n = npc(o.npcId);
      if (n && how === 'a standoff') feedLine(`${n.name} lets it drop.`, n.id, 'silence');
      return `${o.id} lapsed${how ? ` (${how})` : ''}: it can no longer be`;
    }
    // Its own onMiss is running (wave 6): money it credits toward it (obligationPaid) never meets it.
    if (status === 'missed') missing.add(o.id);
    /* Wave 29: a blackmail met is silence paid for, once: an older save's
       copied onMet that still says paid_back for its person says
       paid_silence (the integration plan's 19.4: one payment, one event). */
    const onMet = o.kind === 'blackmail' && Array.isArray(o.onMet) ? o.onMet.map(e => (isObj(e) && e.op === 'socialEvent' && e.event === 'paid_back' && e.npcId === o.npcId ? Object.assign({}, e, { event: 'paid_silence' }) : e)) : o.onMet;
    let done;
    try { done = runNested(status === 'met' ? (late ? lateEffects(onMet) : onMet) : missNews(o), `${o.id}.${status === 'met' ? 'onMet' : 'onMiss'}`); } finally { if (status === 'missed') missing.delete(o.id); }
    // A loose end's obligation met (on time or late) settles the loose end: its thread is resolved (wave 3, playtest N7).
    if (status === 'met') for (const t of looseEndThreads(o)) done.push(setThreadStatus(t, 'resolved'));
    /* Wave 29, one story (the integration plan's 8.4): a blackmail met is
       the record paid in the same apply ("Glenda Pryor will keep quiet.");
       missed, it is spent, told to whom it matters ("Glenda Pryor told.";
       a price seed's record tells them itself, the loose end's onMiss
       already names its chief). */
    if (o.kind === 'blackmail') {
      const rec = blackmailRecord(o);
      if (rec && Rel.LEV_LIVE.includes(rec.status)) {
        const told = Array.isArray(o.onMiss) && o.onMiss.some(e => isObj(e) && e.op === 'socialEvent' && e.event === 'told_anyway');
        const r = status === 'met' ? leverageSet({ id: rec.id, status: 'paid' }) : leverageSet({ id: rec.id, status: 'spent', knownBy: 'mattersTo', tell: !told });
        if (r) done.push(r);
      }
    }
    return `${o.id} ${status}${how ? ` (${how})` : ''}${done.length ? `; ${done.join('; ')}` : ''}`;
  }
  /* Wave 8 (the final pass): the news of a missed obligation that its
     missText tells the player (World's due event, its eventId
     missedEventId) is the same news: its onMiss addNews carries that
     eventId, so the morning's "Overnight in town" leaves it out while the
     due event waits and it is seen once that is told (World.dueNarrated:
     newsSeen { eventId }). It stays in the ledger for everyone else. */
  function missedEventId(o) { return `missed_${String(o && o.id || '')}`.slice(0, 60); }
  function missNews(o) {
    if (!Array.isArray(o.onMiss) || typeof o.missText !== 'string' || !o.missText.trim()) return o.onMiss;
    return o.onMiss.map(e => (isObj(e) && e.op === 'addNews' && e.eventId === undefined ? Object.assign({}, e, { eventId: missedEventId(o) }) : e));
  }
  /* The open threads of the player's loose ends an obligation settles: the
     same person, and the kind of obligation that loose end makes (a debt a
     debt; a secret blackmail; a promise a promise or an errand; someone
     lost an errand). */
  const LOOSE_END_OBLIGATIONS = { debt: ['debt'], secret: ['blackmail'], promise: ['promise', 'errand'], lost: ['errand'] };
  function looseEndThreads(o) {
    return (Array.isArray(current.player.looseEnds) ? current.player.looseEnds : [])
      .filter(le => isObj(le) && le.npcId === o.npcId && (LOOSE_END_OBLIGATIONS[le.kind] || []).includes(o.kind) && le.threadId)
      .map(le => thread(le.threadId)).filter(t => t && threadNow(t, 'status') === 'open');
  }
  /* An obligation met late (wave 3): its onMet runs, but a memory that says
     it was on time says it was late ("paid the six hundred in full and on
     time" is remembered as "paid the six hundred in full, but late"). The
     words start at a word (wave 4): "paid nearly all of it" is not "early". */
  const ON_TIME_RE = /,?\s*\b(?:and\s+|but\s+)?(?:right\s+|just\s+)?(?:on time|ahead of time|before it was due|early)\b/i;
  function lateEffects(list) {
    if (!Array.isArray(list)) return list;
    // A socialEvent's memory too (wave 27: the paid_back of a debt paid late).
    return list.map(e => (isObj(e) && (e.op === 'addMemory' || e.op === 'socialEvent') && typeof e.text === 'string' && ON_TIME_RE.test(e.text) ? Object.assign({}, e, { text: lateText(e.text) }) : e));
  }
  function lateText(text) { return String(text).replace(ON_TIME_RE, ', but late'); }
  // ----- effects that run inside an apply -----
  /* The apply in progress, so effects run later in it (an obligation's
     onMet and onMiss) report their refusals in its result. */
  let applyCtx = null;
  // Fields that hold an id: one still reading "{npcId}" was never filled in (World.fillEffects).
  const ID_FIELDS = ['npcId', 'locationId', 'factionId', 'threadId', 'byNpcId', 'rumourId', 'seedId', 'id', 'key', 'a', 'b'];
  function runEffect(e) {
    if (!isObj(e) || typeof e.op !== 'string') bad('effect needs an op');
    const h = Object.prototype.hasOwnProperty.call(EFFECTS, e.op) ? EFFECTS[e.op] : null;
    if (!h) bad(`unknown op "${e.op}"`);
    for (const k of ID_FIELDS) if (typeof e[k] === 'string' && e[k].trim().startsWith('{')) bad(`${k} "${e[k]}" is a placeholder that was never filled in`);
    return `${e.op}: ${h(e)}`;
  }
  function runNested(list, label) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((e, i) => {
      try { out.push(runEffect(e)); } catch (err) {
        if (!(err instanceof Reject)) console.error(err);
        const reason = err instanceof Reject ? err.message : 'internal error: ' + err.message;
        if (applyCtx) applyCtx.no(`${label}[${i}]`, reason);
      }
    });
    return out;
  }
  /* A clock's active clock, or null. */
  function runningClock(f) { return f && f.activeClock >= 0 && Array.isArray(f.clocks) ? (f.clocks[f.activeClock] || null) : null; }
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
      // Wave 31: by, the officer who made an arrest (a clock's, else the police head): the arrest route.
      if (e.by !== undefined && (typeof e.by !== 'string' || !npc(e.by))) bad('by must be the id of the officer who made the arrest');
      const was = n.status;
      n.status = e.status;
      // The dead are on no schedule and make no visit (review E14).
      if (e.status !== 'free') current.visits = (current.visits || []).filter(v => v.npcId !== n.id);
      let route = '';
      if (e.status === 'dead') { n.alive = false; removeFromSchedules(n.id); }
      else if (e.status === 'arrested') { jail(n); if (was === 'free' && (n.presence === undefined || n.presence === 'here')) route = arrestRoute(n, e.by); }
      else if (e.status === 'gone') removeFromSchedules(n.id);
      else restoreSchedule(n);
      return `${n.id} is ${e.status}${route}`;
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
    /* Wave 32 (the integration plan's 2.4): a change in how one person
       feels about another, from content (a clock's completion: the
       photographs of Royce and Loretta): { fromId, toId, w?, t? (whole
       numbers within +/-100), known? (true: the town knows the tie now),
       why (80 at most) }: a turn-stamped line on the tie's log (State's
       tieLog), the tie made if the game lacks it. */
    tieDelta(e) {
      const a = needNpc(e.fromId);
      const b = needNpc(e.toId);
      if (a.id === b.id) bad('a tie is between two people');
      for (const k of ['w', 't']) if (e[k] !== undefined && !(Number.isInteger(e[k]) && Math.abs(e[k]) <= 100)) bad(`${k} must be a whole number within +/-100`);
      if (e.known !== undefined && typeof e.known !== 'boolean') bad('known must be true or false');
      const why = cleanText(e.why, 80);
      if (!why) bad('needs why: what changed between them, in a few words');
      if (!e.w && !e.t && e.known !== true) bad('needs w, t or known');
      const was = isObj(current.ties) && isObj(current.ties[Rel.tieKey(a.id, b.id)]) ? Rel.tieNow(current.ties[Rel.tieKey(a.id, b.id)]) : { w: 0, t: 0 };
      const tie = tieLog(a.id, b.id, e.w | 0, e.t | 0, why, false, e.known === true);
      const now = Rel.tieNow(tie);
      return `${a.id}>${b.id}: liking ${was.w} -> ${now.w}, trust ${was.t} -> ${now.t}${e.known === true ? ', known' : ''} (${why})`;
    },
    /* Wave 32: what someone says or does reaches the people tied to them,
       as if event had been done to them (a grudge's gossip, from its
       holder): { npcId, event (Rel.EVENTS, one that travels), factor?
       (0.1..2, times the row), via? ('now': heard at once; 'overnight',
       'morning' or 'meet' for everyone; else by each tie), text? (what
       they would remember, 200 at most) }. Rel.propagate plans it, one
       hop; nobody is there to see it. */
    propagate(e) {
      const n = needNpc(e.npcId);
      const row = typeof e.event === 'string' ? Rel.EVENTS[e.event] : null;
      if (!row) bad(`unknown event "${e.event}"`);
      if (!Rel.spreads({ event: e.event })) bad(`${e.event} does not travel (Rel.STAYS)`);
      if (e.factor !== undefined && !(typeof e.factor === 'number' && e.factor >= 0.1 && e.factor <= 2)) bad('factor must be a number from 0.1 to 2');
      if (e.via !== undefined && !['now', 'overnight', 'morning', 'meet'].includes(e.via)) bad('via must be now, overnight, morning or meet');
      if (e.text !== undefined && typeof e.text !== 'string') bad('text must be words');
      if (presenceOf(n) === 'dead') return `no-op: ${n.id} is dead`;
      if (!isObj(current.ties) || !Object.keys(current.ties).length) return `no-op: the game has no ties yet`;
      const f = Number.isFinite(e.factor) ? e.factor : 1;
      const d = { w: row.w * f, t: row.t * f, f: (Number(row.f) || 0) * f };
      const ctx = relCtx();
      const plan = Rel.propagate(current, n.id, { event: e.event, present: [], weight: row.weight || 1, key: null, victim: n.name, player: current.player.name, placeName: 'town' }, d, ctx);
      const text = cleanText(e.text, 200);
      const items = plan.later.map(it => Object.assign(it, text ? { text } : {}, { about: `what ${firstName(n)} has been saying` }));
      if (!items.length) return `${n.id} ${e.event}: it reaches nobody`;
      if (e.via === 'now') {
        const lines = items.map(it => carryTo(npc(it.npcId), it, null)).filter(Boolean);
        return `${n.id} ${e.event} reaches ${lines.length ? lines.join('; ') : 'nobody'}`;
      }
      if (e.via) for (const it of items) Object.assign(it, { via: e.via }, Rel.dueOf(e.via, current.time.day, current.time.phase));
      queueHearsay(items);
      return `${n.id} ${e.event}: word will reach ${items.map(it => `${it.npcId} (${it.via})`).join(', ')}`;
    },
    /* Liking by delta, clamped to -100..100, exactly as before wave 26: it
       lands in the everyday bucket, and past its bound in fix (likingBy). */
    attitudeDelta(e) {
      const n = needNpc(e.npcId);
      const d = toInt(e.delta);
      if (d === null) bad('delta must be an integer');
      const [before, after] = likingBy(n, d);
      return `${n.id} attitude ${before} -> ${after}`;
    },
    priceMultiplier(e) {
      const f = Number(e.factor);
      if (!Number.isFinite(f) || f <= 0) bad('factor must be a positive number');
      const before = current.flags.priceMultiplier || 1;
      current.flags.priceMultiplier = Math.round(clamp(before * clamp(f, 0.25, 4), 0.25, 4) * 100) / 100;
      return `price multiplier ${before} -> ${current.flags.priceMultiplier}`;
    },
    openThread(e) { const t = normaliseThread(e.thread); current.threads.push(t); return `thread ${t.id} opened`; },
    threadStatus(e) {
      const t = needThread(e.threadId);
      // A clock or an effect never moves a resolved thread (review E4), resolved by news still held too (wave 7).
      if (threadNow(t, 'status') === 'resolved' && e.status !== 'resolved' && THREAD_STATUSES.includes(e.status)) return `no-op: ${t.id} is resolved`;
      return setThreadStatus(t, e.status);
    },
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
    // ----- CONTRACTS section 2: ops that touch the player and the town's memory -----
    /* Money in or out; more taken than the player has takes what there is. */
    playerGold(e) {
      const d = toInt(e.delta);
      if (d === null) bad('delta must be an integer');
      const p = current.player;
      const before = p.gold;
      p.gold = clamp(before + d, 0, 1000000);
      return `gold ${before} -> ${p.gold}` + (before + d < 0 ? ' (took what there was)' : '');
    },
    /* -3..+3 HP; never below 1 unless allowDefeat (a beating is not a defeat). */
    playerHp(e) {
      const raw = toInt(e.delta);
      if (raw === null) bad('delta must be an integer');
      const d = clamp(raw, -LIMITS.effectHp, LIMITS.effectHp);
      const p = current.player;
      const before = p.hp;
      const floor = e.allowDefeat === true ? 0 : Math.min(1, before);
      p.hp = clamp(before + d, floor, p.maxHp);
      return `hp ${before} -> ${p.hp}` + (p.hp !== before + raw ? ' (clamped)' : '');
    },
    giveItem(e) {
      const name = cleanText(e.name, 60);
      if (!name) bad('item needs a name');
      const qty = clamp(toInt(e.qty) || 1, 1, 99);
      const held = findHeld(name);
      carry(held ? held.id : 'item_' + slugify(name), held ? held.name : name, qty, cleanText(e.notes, 120));
      return `gained ${held ? held.name : name} x${qty}`;
    },
    /* Wave 4 (playtest R10): a thing left lying in a place ({ name, notes?,
       locationId?: the player's place by default }), there to be picked up,
       as a seed tells it ("a tackle box wedged on a girder"). */
    placeItem(e) {
      const name = cleanText(e.name, 60);
      if (!name) bad('item needs a name');
      const where = e.locationId === undefined || e.locationId === null ? current.player.locationId : e.locationId;
      return addSceneItem({ locationId: where, item: { name, qty: clamp(toInt(e.qty) || 1, 1, 99), notes: cleanText(e.notes, 120) } });
    },
    /* By name (any case) or id; nothing happens when it is not carried. */
    takeItem(e) {
      const ref = cleanText(typeof e.name === 'string' ? e.name : e.id, 60);
      if (!ref) bad('item needs a name');
      const held = findHeld(ref);
      if (!held) return `no-op: not carrying ${ref}`;
      const qty = Math.min(held.qty, clamp(toInt(e.qty) || 1, 1, 99));
      held.qty -= qty;
      if (held.qty <= 0) current.player.inventory.splice(current.player.inventory.indexOf(held), 1);
      return `lost ${held.name} x${qty}`;
    },
    /* { name, effect: "-1 might", days }: until day + days. */
    addCondition(e) {
      const name = cleanText(e.name, 60);
      if (!name) bad('condition needs a name');
      const days = toInt(e.days);
      if (days === null || days < 0 || days > 30) bad('days must be a whole number from 0 to 30');
      return putCondition({ name, effect: cleanText(e.effect, 80), untilDay: current.time.day + days });
    },
    /* Not welcome at a place for `days` days, today counted: untilDay =
       day + days is the day they are welcome again (wave 3: a ban ends
       before its untilDay, so "until day N" means back on day N, and days 1
       is tonight only). A second ban there keeps the later day. */
    banFrom(e) {
      const l = needLoc(e.locationId);
      const days = toInt(e.days);
      if (days === null || days < 0 || days > 60) bad('days must be a whole number from 0 to 60');
      const by = e.byNpcId !== undefined && e.byNpcId !== null ? needNpc(e.byNpcId).id : null;
      if (!Array.isArray(current.bans)) current.bans = [];
      // days 0 is tonight, as days 1 is (wave 4, the third review's risk): a ban that never held would be no ban.
      const untilDay = current.time.day + Math.max(1, days);
      let b = current.bans.find(x => x.locationId === l.id);
      if (b) b.untilDay = Math.max(b.untilDay, untilDay);
      else current.bans.push(b = { locationId: l.id, untilDay });
      if (by) b.byNpcId = by;
      return `banned from ${l.id} until day ${b.untilDay}` + (by ? ` (${by})` : '');
    },
    /* The player's own prices (a grudge at the register): multiplied in, at
       0.25 to 4, until day + days; the morning after, they are gone. */
    playerPrice(e) {
      const f = Number(e.factor);
      if (!Number.isFinite(f) || f <= 0) bad('factor must be a positive number');
      const days = toInt(e.days);
      if (days === null || days < 0 || days > 60) bad('days must be a whole number from 0 to 60');
      const fl = current.flags;
      const day = current.time.day;
      const active = Number.isFinite(fl.playerPriceMultiplier) && !(Number.isInteger(fl.playerPriceUntilDay) && fl.playerPriceUntilDay < day);
      const before = active ? fl.playerPriceMultiplier : 1;
      fl.playerPriceMultiplier = Math.round(clamp(before * clamp(f, 0.25, 4), 0.25, 4) * 100) / 100;
      fl.playerPriceUntilDay = Math.max(active && Number.isInteger(fl.playerPriceUntilDay) ? fl.playerPriceUntilDay : 0, day + days);
      return `player prices ${before} -> ${fl.playerPriceMultiplier} until day ${fl.playerPriceUntilDay}`;
    },
    /* A memory through the same path as newMemories (a near-identical one
       merges). The dead remember nothing: a no-op, not a refusal (a clock's
       or an event's effects may name someone a story has since killed).
       Someone who lives elsewhere still remembers (they can be reached:
       npc.reach), as a missed promise's onMiss expects. */
    addMemory(e) {
      const n = needNpc(e.npcId);
      const text = cleanText(e.text, 400);
      if (!text) bad('memory needs text');
      if (presenceOf(n) === 'dead') return `no-op: ${n.id} is dead and remembers nothing`;
      if (e.act !== undefined && !MEMORY_ACTS.includes(e.act)) bad(`act must be one of ${MEMORY_ACTS.join(', ')}`);
      return remember(n, text, clamp(toInt(e.weight) || 1, 1, 3), { merge: true, act: e.act });
    },
    /* A faction's running clock moved 1 or 2 either way, within 0..segments;
       completion is the tick's to find. No running clock: nothing happens. */
    clockAdjust(e) {
      const f = needFaction(e.factionId);
      const d = toInt(e.delta);
      if (![-2, -1, 1, 2].includes(d)) bad('delta must be -2, -1, 1 or 2');
      const c = runningClock(f);
      if (!c) return `no-op: ${f.id} has no running clock`;
      const before = c.filled;
      c.filled = clamp(before + d, 0, c.segments);
      return `${f.id} "${c.label}" ${before} -> ${c.filled}/${c.segments}`;
    },
    /* { threadId, summary?, status?, knownToPlayer? }; a resolved thread's status never moves. */
    threadUpdate(e) {
      const t = needThread(e.threadId);
      const parts = [];
      if (e.status !== undefined && e.status !== null && !THREAD_STATUSES.includes(e.status)) bad('status must be open, resolved or failed');
      // Known first, then the status (wave 5, playtest Q12): a thread made known and resolved at once shows its Resolved line and its gain.
      // Under a held town event each waits for its news (wave 7: setThreadKnown, setThreadStatus, setThreadSummary).
      const known = typeof e.knownToPlayer === 'boolean' ? setThreadKnown(t, e.knownToPlayer) : null;
      if (known) parts.push(known);
      if (e.status !== undefined && e.status !== null) parts.push(threadNow(t, 'status') === 'resolved' && e.status !== 'resolved' ? `no-op: ${t.id} is resolved` : setThreadStatus(t, e.status));
      const summary = cleanText(e.summary, 400);
      const said = summary ? setThreadSummary(t, summary) : null;
      if (said) parts.push(said);
      return parts.join('; ') || `${t.id} unchanged`;
    },
    /* { kind, npcId, text, amount?, dueDay? or dueOffset?, itemName?, onMiss?,
       onMet?, id?, missText? (what happens when it is missed: the due
       event then; else a plain line), owedTo? (the person it is owed to
       when that is not npcId: an errand's asker, the father a promise was
       made to; askerId is accepted as the same) }: one open
       obligation per kind and person; dueOffset
       counts from today (a loose end's seed carries it to the day it fires).
       The obligation's own person and the player fill any placeholders left
       in its text and effects. */
    addObligation(e) {
      if (!OBLIGATION_KINDS.includes(e.kind)) bad(`kind must be ${OBLIGATION_KINDS.join(', ')}`);
      const n = needNpc(e.npcId);
      const list = obligationList();
      const open = list.find(o => o.status === 'open' && o.kind === e.kind && o.npcId === n.id);
      if (open) bad(`${open.id} is already open (one open ${e.kind} per person)`);
      const vars = { npc: n.name, npcId: n.id, player: current.player.name, playerName: current.player.name };
      const text = cleanText(fillTemplate(e.text, vars), 200);
      if (!text) bad('obligation needs text');
      let amount = null;
      if (e.amount !== undefined && e.amount !== null) {
        amount = toInt(e.amount);
        if (amount === null || amount < 0 || amount > 1000000) bad('amount must be a whole number, 0 or more');
      }
      const day = current.time.day;
      let dueDay = null;
      if (e.dueDay !== undefined && e.dueDay !== null) {
        dueDay = toInt(e.dueDay);
        if (dueDay === null) bad('dueDay must be a day number');
        dueDay = Math.max(dueDay, day);
      } else if (e.dueOffset !== undefined && e.dueOffset !== null) {
        const off = toInt(e.dueOffset);
        if (off === null || off < 0 || off > 60) bad('dueOffset must be a whole number from 0 to 60');
        dueDay = day + off;
      }
      const base = typeof e.id === 'string' && /^obl_[a-z0-9_]+$/.test(e.id) ? e.id : `obl_${e.kind}_${n.id}`;
      const id = uniqueId(base, x => list.some(o => o.id === x));
      // Its own id too (wave 5): "{obligationId}" in its onMiss credits a seizure against it (obligationPaid).
      const onMiss = effectList(fillDeep(e.onMiss, Object.assign({ obligationId: id }, vars)), 'onMiss');
      const onMet = effectList(fillDeep(e.onMet, Object.assign({ obligationId: id }, vars)), 'onMet');
      const itemName = cleanText(fillTemplate(e.itemName, vars), 60) || null;
      const o = { id, kind: e.kind, npcId: n.id, text, amount, dueDay, itemName, status: 'open', onMiss, onMet, createdTurn: current.meta.turn, createdDay: day };
      const missText = cleanText(fillTemplate(e.missText, vars), 300);
      if (missText) o.missText = missText;
      // The person owed when not the one it binds (content's owedTo; askerId the older name).
      const owed = e.owedTo !== undefined && e.owedTo !== null && e.owedTo !== '' ? e.owedTo : e.askerId;
      if (owed !== undefined && owed !== null && owed !== '') o.owedTo = needNpc(fillTemplate(owed, vars)).id;
      list.push(o);
      let line = `obligation ${id} (${e.kind} to ${n.id}${amount !== null ? `, ${money(amount)}` : ''}${dueDay !== null ? `, due day ${dueDay}` : ''})`;
      /* Wave 29, one story (the integration plan's 8.4; code, so a copied
         seed in an older save links too): a blackmail names its price on
         the record its person holds over the player (leverageId, a price
         seed's; else the informant's loose end), which is used now, the
         demand linked, the player knowing of it ("Glenda Pryor has
         something on you."). */
      if (o.kind === 'blackmail') {
        const rec = (typeof e.leverageId === 'string' ? leverageRec(e.leverageId) : null) || blackmailRecord(o);
        if (rec && rec.over === 'player' && rec.holder === n.id && Rel.LEV_LIVE.includes(rec.status)) {
          const r = leverageSet({ id: rec.id, status: 'used', demand: { obligationId: id }, playerKnows: true, use: 'blackmailed' });
          if (r) line += `; ${r}`;
        }
      }
      // An errand already done before it fell due (the letter handed over before its seed fired): met at once, its onMet once.
      if (o.kind === 'errand' && itemName && !findHeld(itemName) && errandDone(n, itemName)) return `${line}; ${settle(o, 'met', `${itemName} was already handed over`)}`;
      return line;
    },
    /* { id, status: 'met' | 'missed' | 'lapsed' }: its onMet or onMiss
       effects, once (wave 29: lapsed, "can no longer be", runs neither). */
    settleObligation(e) {
      if (e.status !== 'met' && e.status !== 'missed' && e.status !== 'lapsed') bad('status must be met, missed or lapsed');
      const o = obligation(e.id) || bad(`unknown obligation "${e.id}"`);
      return settle(o, e.status, cleanText(e.how, 80));
    },
    /* { id, amount, take? } (wave 5, the playtest's design note: the repo
       man's $150 was never credited to the note): money credited toward a
       debt or blackmail (paid), at most what is still owed. take: true takes
       it from the player's cash first (what there is, up to amount) and
       credits what it took. Paid in full, it is met (late when it was
       missed: its onMet runs then). */
    obligationPaid(e) {
      const o = obligation(e.id) || bad(`unknown obligation "${e.id}"`);
      const amt = toInt(e.amount);
      if (amt === null || amt < 1 || amt > 1000000) bad('amount must be a whole number, 1 or more');
      if (e.take !== undefined && typeof e.take !== 'boolean') bad('take must be true or false');
      if (!((o.kind === 'debt' || o.kind === 'blackmail') && Number.isInteger(o.amount) && o.amount > 0)) bad(`${o.id} is not owed in money`);
      const left = Math.max(0, o.amount - (o.paid | 0));
      if (!left) return `no-op: ${o.id} is paid in full`;
      let credit = Math.min(amt, left);
      const parts = [];
      if (e.take === true) {
        const p = current.player;
        const took = Math.min(credit, Math.max(0, p.gold | 0));
        if (took) { parts.push(`gold ${p.gold} -> ${p.gold - took}`); p.gold -= took; }
        credit = took;
      }
      if (!credit) return `no-op: no cash to take toward ${o.id}`;
      o.paid = (o.paid | 0) + credit;
      parts.push(`${o.id} paid ${money(o.paid)} of ${money(o.amount)}`);
      // Wave 6 (the fifth review's bug 2): taken by its own onMiss, it is credited but stays missed (no onMet, no "paid off" memory, the seizure told).
      if (missing.has(o.id)) parts.push('taken as it was missed: not met');
      else if (o.paid >= o.amount && (o.status === 'open' || o.status === 'missed')) parts.push(settle(o, 'met', 'paid in full', o.status === 'missed'));
      return parts.join('; ');
    },
    /* { text, factionId?, public? (default true), epilogue?, day?, phase?,
       eventId? (the town event that made it: newsSeen { eventId } marks it
       seen once the player has watched it happen), seen? (true: it happened
       in front of the player, so the morning's news does not tell it
       again) }: town news (state.news, the newest LIMITS.news kept). day
       and phase default to now (a tick may name the phase it ran for). */
    addNews(e) {
      // An ending is told whole (up to 1500 characters); other news to 400, cut at a word.
      const text = clipWords(e.text, e.epilogue === true ? 1500 : 400);
      if (!text) bad('news needs text');
      const factionId = e.factionId !== undefined && e.factionId !== null ? needFaction(e.factionId).id : null;
      const t = current.time;
      // At most the next phase (wave 5): a walk at night into a town event the next morning dates its news to that morning.
      const nextDay = t.phase === PHASES[PHASES.length - 1] && e.phase === PHASES[0] ? t.day + 1 : t.day;
      const day = Number.isInteger(e.day) && e.day >= 1 && e.day <= nextDay ? e.day : t.day;
      const item = { day, phase: PHASES.includes(e.phase) ? e.phase : t.phase, text, factionId, public: e.public !== false, seen: e.seen === true };
      if (e.epilogue === true) item.epilogue = true;
      if (typeof e.eventId === 'string' && /^[a-z0-9_.-]{1,60}$/i.test(e.eventId)) item.eventId = e.eventId;
      if (!Array.isArray(current.news)) current.news = [];
      current.news.push(item);
      if (current.news.length > LIMITS.news) current.news.splice(0, current.news.length - LIMITS.news);
      return `news day ${item.day} ${item.phase}: "${text.length > 60 ? text.slice(0, 57) + '...' : text}"`;
    },
    /* Wave 26: what happened to someone, as an event of Rel.EVENTS (the
       engine's own rows too): { npcId, event, text (what they would
       remember), weight?, act?, aboutId?, private?, leverageId?, d? (a
       part of the row, whole numbers within +/-50), decay?, secondhand?,
       scale? (0.1 to 2) }. Rel.applyEvent plans it (traits, repeats,
       bounds, the memory or everyday, what it settles, owed favours) and
       this writes the plan. Spark given above 0 for someone it cannot move
       for is refused; spark a row would give them is held at 0 and logged.
       The dead: a no-op. */
    socialEvent(e) { return socialEvent(e, 'socialEvent'); },
    /* Wave 29: favours owed cleared ({ npcId, dir? }; an owed favour's
       payback ends with it; owedSettle above). */
    owedSettle(e) { return owedSettle(e); },
    /* Wave 29: a leverage record's change ({ id, status?, aware?,
       playerKnows?, demand?, use?, knownBy?, tell? }; leverageSet above):
       a payment seed marks it paid, a tell grudge spends it. */
    leverageSet(e) { return leverageSet(e) || `no-op: ${e && e.id} unchanged`; }
  };
  const EFFECT_OPS = Object.freeze(Object.keys(EFFECTS));

  // ----- time -----
  /* SPEC section 7: a short adds one to time.shorts and SHORTS_PER_PHASE of
     them make a phase, a long is a phase, a rest sleeps until the next
     morning and heals 3. Night holds until the player sleeps: a short never
     crosses from night into morning. When the shorts would roll over at
     night the clock stays at night with shorts at the most (2) and
     time.late = true (the small hours); no phase passes, so World.tick does
     not run (Pipeline.passTime ticks per phase passed). A long action (an
     hour or more) at night that is not yet late does the same (wave 21: a
     wait until last call stays that night, with the people of the scene
     still there). Morning comes only with a rest, a long at a night already
     late, /wait or /skip (they pass longs with their own cause), or a
     defeat. A new day starts early (shorts 0); reached by anything but a
     rest it sets time.noSleep (no sleep last night), which a rest clears.
     Any phase change clears time.late. Both flags are kept only while
     true, so a clock that never used them keeps its old shape.
     The argument is a cost or { cost, toPhaseStart?, cause? }.
     toPhaseStart: a phase that passes lands at its start (shorts 0; /wait
     and /skip, review E5). cause 'defeat' with a long is not a night
     without sleep (the player was out cold). Talk takes no time, but every
     LIMITS.instantsPerShort instant actions make a short (time.instants,
     kept only while above 0 like late and noSleep, so read it as
     time.instants | 0; back to 0 at any phase change; design #5). An
     instant whose cause is a command that is not an action (rest, wait,
     skip, arrival, defeat, arrest, epilogue: the narration of time already
     passed) does not count. A rest heals 3 in a bed and
     1 sleeping rough, which also leaves the player Stiff (-1 might) for the
     day (restQuality; a paid night is used up); it ends Tired. A morning
     reached without sleep makes the player Tired (-1 all) until they rest.
     A new day lets bans, a player price and paid lodging run out
     (expireDaily). */
  const NOT_ACTIONS = ['rest', 'wait', 'skip', 'arrival', 'defeat', 'arrest', 'epilogue'];
  const TIRED = Object.freeze({ id: 'cond_tired', name: 'Tired', effect: '-1 all', untilDay: null, untilRest: true });
  const STIFF = Object.freeze({ id: 'cond_stiff', name: 'Stiff', effect: '-1 might' });
  function advanceTime(arg) {
    const spec = isObj(arg) ? arg : { cost: arg };
    const cost = spec.cost;
    if (!TIME_COSTS.includes(cost)) bad('time cost must be instant, short, long or rest');
    if (spec.toPhaseStart !== undefined && typeof spec.toPhaseStart !== 'boolean') bad('toPhaseStart must be true or false');
    const cause = typeof spec.cause === 'string' ? cleanText(spec.cause, 20) : null;
    const slept = cost === 'rest' || (cost === 'long' && cause === 'defeat');
    const t = current.time;
    const p = current.player;
    if (!PHASES.includes(t.phase)) t.phase = 'morning';
    const from = { day: t.day, phase: t.phase };
    let steps = 0;
    let healed = 0;
    let held = false;
    let quality = null;
    let short = cost === 'short';
    if (cost === 'instant' && !NOT_ACTIONS.includes(cause)) {
      t.instants = (t.instants | 0) + 1;
      if (t.instants >= LIMITS.instantsPerShort) { delete t.instants; short = true; }
    }
    if (short) {
      t.shorts = (t.shorts | 0) + 1;
      if (t.shorts >= SHORTS_PER_PHASE) {
        if (t.phase === 'night') { t.shorts = SHORTS_PER_PHASE - 1; t.late = true; held = true; }
        else { t.shorts = 0; steps = 1; }
      }
    } else if (cost === 'long') {
      // Wave 21: night holds one long too. An action of an hour or more at night that is not yet late (a wait until last call,
      // a long talk out back) lands in the small hours, still that night, with the scene and its people intact; the second
      // long, or /wait, /skip, a rest or a defeat, brings the morning.
      if (t.phase === 'night' && t.late !== true && !NOT_ACTIONS.includes(cause)) { t.shorts = SHORTS_PER_PHASE - 1; t.late = true; held = true; }
      else steps = 1;
    } else if (cost === 'rest') {
      quality = restQuality();
      // A night paid for is used by sleeping in it (where it was bought: a motel).
      const here = loc(p.locationId);
      if (quality === 'bed' && here && LODGING_TYPES.includes(String(here.type || '').toLowerCase())) delete current.flags.lodgingPaidUntilDay;
      steps = PHASES.length - PHASES.indexOf(t.phase);
      t.shorts = 0;
      const before = p.hp;
      p.hp = clamp(p.hp + (quality === 'bed' ? 3 : 1), 0, p.maxHp);
      healed = p.hp - before;
      delete t.noSleep;
      p.conditions = p.conditions.filter(c => !(isObj(c) && (c.untilRest === true || c.id === TIRED.id)));
    }
    let newDay = false;
    for (let i = 0; i < steps; i++) {
      const idx = PHASES.indexOf(t.phase);
      if (idx === PHASES.length - 1) {
        t.phase = PHASES[0]; t.day += 1; t.shorts = 0; newDay = true;
        if (slept) delete t.noSleep; else t.noSleep = true;
      } else t.phase = PHASES[idx + 1];
    }
    if (steps) {
      delete t.late;
      delete t.instants;
      if (spec.toPhaseStart === true) t.shorts = 0;
    }
    if (quality === 'rough') putCondition(Object.assign({}, STIFF, { untilDay: t.day }));
    if (newDay && t.noSleep === true) putCondition(Object.assign({}, TIRED));
    if (newDay) expireNow(t.day);
    // A visit lasts for the phase it was made in (World: the NPC came to the player for that scene); one for a phase still
    // to come stays for it (wave 22: an appointment's, made for later today).
    const nowKey = t.day * PHASES.length + PHASES.indexOf(t.phase);
    if (steps && Array.isArray(current.visits)) current.visits = current.visits.filter(v => isObj(v) && Number.isInteger(v.day) && PHASES.includes(v.phase) && v.day * PHASES.length + PHASES.indexOf(v.phase) >= nowKey);
    const out = { cost, from, to: { day: t.day, phase: t.phase }, phasesPassed: steps, healed, held };
    if (quality) out.quality = quality;
    if (cause) out.cause = cause;
    if (cost === 'instant') out.instants = t.instants | 0;
    if (cost === 'instant' && short) out.instantShort = true;
    return out;
  }
  /* 'bed' or 'rough': a bed at a motel (LODGING_TYPES) with a night paid for
     (flags.lodgingPaidUntilDay today or later), or anywhere someone who
     lives there, or owns the place and is there (their role says "owner
     of" it: Loretta and the Low Water; wave 4), has attitude 25 or more
     (wave 28: liking 25 and trust 0, or a favour they owe the player and
     liking above -25) and is in town (wave 3, the
     README's "rough unless a friend lives there", and the owner of a bar is
     a friend with a couch in the back); anywhere else is rough (CONTRACTS
     section 7). A place shut today has only that friend's bed (playtest
     B14). */
  function ownerOf(n, l) {
    const role = String(n.role || '').toLowerCase();
    const name = String(l.name || '').toLowerCase().replace(/^the /, '');
    return /\bown(?:er|s)\b/.test(role) && name.length >= 3 && role.includes(name);
  }
  function restQuality() {
    if (!current) return 'rough';
    const l = loc(current.player.locationId);
    if (!l) return 'rough';
    const type = String(l.type || '').toLowerCase();
    // An owner who does not live there gives a bed only while they are there (wave 4, the third review's risk: no friend's couch in a shut pawn shop).
    // Wave 5 (playtest Q11): one whose home is their shop gives it only while there now or there tonight (Hollis fishes at the landing at night).
    const here = npcsAt(l.id);
    const tonight = npcsAt(l.id, 'night', current.time.day);
    // Wave 28 (Rel.GATES.couch): a friend's couch is liking 25 and trust 0, or a favour they owe the player and liking above -25.
    const G = Rel.GATES.couch;
    const friend = n => { const c = Rel.tracksOf(n, relCtx()); return (c.w >= G.liking && c.t >= G.trust) || (c.owed >= 1 && c.w > G.owedLiking); };
    const host = current.npcs.some(n => n.alive !== false && n.status === 'free' && friend(n) && ((isObj(n.home) && n.home.locationId === l.id && (here.includes(n) || tonight.includes(n))) || (ownerOf(n, l) && here.includes(n))));
    if (isClosed(l)) return host ? 'bed' : 'rough';
    const paid = current.flags.lodgingPaidUntilDay;
    if (LODGING_TYPES.includes(type) && Number.isInteger(paid) && paid >= current.time.day) return 'bed';
    return host ? 'bed' : 'rough';
  }
  /* What runs out with a new day (the morning tick; advanceTime calls it, and
     State.expireDaily(day) does the same through apply): bans that ended
     before today, the player's own prices, a paid night not slept in. */
  function expireNow(day) {
    const out = [];
    const fl = current.flags;
    if (Number.isInteger(fl.playerPriceUntilDay) && fl.playerPriceUntilDay < day) {
      delete fl.playerPriceMultiplier; delete fl.playerPriceUntilDay; out.push('prices are back to normal');
    }
    if (Number.isInteger(fl.lodgingPaidUntilDay) && fl.lodgingPaidUntilDay < day) { delete fl.lodgingPaidUntilDay; out.push('the paid night is over'); }
    if (Array.isArray(current.bans)) {
      const ended = current.bans.filter(b => !(Number.isInteger(b.untilDay) && b.untilDay > day));
      if (ended.length) { current.bans = current.bans.filter(b => !ended.includes(b)); out.push(`no longer banned from ${ended.map(b => b.locationId).join(', ')}`); }
    }
    return out;
  }
  /* The ban on a place that holds today ({ locationId, untilDay, byNpcId? }),
     or null. A ban holds on the days before its untilDay (the day the
     player is welcome again). */
  function isBanned(where, day) {
    if (!current || !Array.isArray(current.bans)) return null;
    const id = isObj(where) ? where.id : where;
    const d = Number.isInteger(day) ? day : current.time.day;
    return current.bans.find(b => b.locationId === id && Number.isInteger(b.untilDay) && b.untilDay > d) || null;
  }
  /* What prices are multiplied by: the town's (flags.priceMultiplier) times
     the player's own while it lasts (Tables.price). */
  function priceFactor() {
    if (!current) return 1;
    const fl = current.flags || {};
    const town = Number.isFinite(fl.priceMultiplier) && fl.priceMultiplier > 0 ? fl.priceMultiplier : 1;
    const own = Number.isFinite(fl.playerPriceMultiplier) && fl.playerPriceMultiplier > 0
      && !(Number.isInteger(fl.playerPriceUntilDay) && fl.playerPriceUntilDay < current.time.day) ? fl.playerPriceMultiplier : 1;
    return Math.round(town * own * sellerMarkup() * 100) / 100;
  }
  /* Wave 27: a seller here who is against the player and has stopped
     refusing them (flags['relPrice.<npcId>'], Pipeline's refuseSale)
     charges a quarter over (Rel.GATES.wontSell.markup). */
  function sellerMarkup() {
    const fl = current.flags || {};
    const ids = Object.keys(fl).filter(k => k.startsWith('relPrice.') && Number.isInteger(fl[k])).map(k => k.slice('relPrice.'.length));
    if (!ids.length) return 1;
    const here = npcsAt(current.player.locationId);
    return here.some(n => ids.includes(n.id) && Rel.wontSell(n)) ? Rel.GATES.wontSell.markup : 1;
  }
  // ----- the calendar (CONTRACTS section 1) -----
  /* The town's calendar ({ season, startDate: "YYYY-MM-DD" }): this game's
     town copy, else nothing (an older save keeps its own season flag). */
  function calendar() { return town && isObj(town.calendar) ? town.calendar : null; }
  function startDate() {
    const c = calendar();
    const m = c && typeof c.startDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.startDate) : null;
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function dayOf(day) { return Number.isInteger(day) ? day : current ? current.time.day : 1; }
  /* The season: the calendar's, else the town's season, else the game's flag. */
  function season() {
    const c = calendar();
    if (c && SEASONS.includes(c.season)) return c.season;
    if (town && SEASONS.includes(town.season)) return town.season;
    return current && SEASONS.includes(current.flags.season) ? current.flags.season : 'spring';
  }
  /* 'Sunday' to 'Saturday' for a day (today when left out): from the
     calendar's start date, else day 1 is a Thursday. */
  function weekday(day) {
    const d = dayOf(day);
    const start = startDate();
    if (start !== null) return WEEKDAYS[new Date(start + (d - 1) * 86400000).getUTCDay()];
    return WEEKDAYS[(((DEFAULT_FIRST_WEEKDAY + d - 1) % 7) + 7) % 7];
  }
  /* "Thursday 8 October" (the weekday alone without a start date). */
  function dateLine(day) {
    const d = dayOf(day);
    const start = startDate();
    if (start === null) return weekday(d);
    const dt = new Date(start + (d - 1) * 86400000);
    return `${WEEKDAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  }
  /* Wave 43: what a game has cost (meta.cost): dollars, turns and calls
     that spent tokens, and the tokens (cacheWrite: both TTLs). asked and
     noticed are the spending ceiling (Settings, Spending) the player said
     Keep going at and was told of, so each happens once per amount. */
  const COST_KEYS = Object.freeze(['usd', 'turns', 'calls', 'input', 'output', 'cacheRead', 'cacheWrite']);
  function costRecord(raw) {
    const c = {};
    for (const k of COST_KEYS) { const n = isObj(raw) ? Number(raw[k]) : 0; c[k] = Number.isFinite(n) && n > 0 ? (k === 'usd' ? n : Math.round(n)) : 0; }
    for (const k of ['asked', 'noticed']) if (isObj(raw) && Number.isFinite(raw[k]) && raw[k] > 0) c[k] = raw[k];
    return c;
  }
  /* Wave 43: where the game is in the town's arc. endDay: the day the
     ending is told (the town's epilogue.onDay; null without one); ended:
     it has been told (it can come early); next: the next town event still
     to come ({ id, title, day, phase }), or null. A hidden event, or one
     without a day or a title, is never named. */
  function arc() {
    const t = town || TOWN_DATA;
    const ep = isObj(t) && isObj(t.epilogue) ? t.epilogue : null;
    const out = { endDay: ep && Number.isInteger(ep.onDay) ? ep.onDay : null, ended: !!(current && current.flags.epilogueShown), next: null };
    if (!current) return out;
    const done = new Set((Array.isArray(current.eventsFired) ? current.eventsFired : []).filter(x => typeof x === 'string'));
    for (const k of Object.keys(current.flags || {})) if (k.startsWith('event.') && current.flags[k]) done.add(k.slice(6));
    const now = current.time;
    const phaseOf = ev => (PHASES.includes(ev.phase) ? ev.phase : PHASES[0]);
    const ahead = ev => ev.day > now.day || (ev.day === now.day && PHASES.indexOf(phaseOf(ev)) >= PHASES.indexOf(now.phase));
    const list = (isObj(t) && Array.isArray(t.events) ? t.events : []).filter(ev => isObj(ev) && typeof ev.id === 'string' && Number.isInteger(ev.day)
      && typeof ev.title === 'string' && ev.title.trim() && ev.hidden !== true && !done.has(ev.id) && !done.has(slugify(ev.id).slice(0, 34)) && ahead(ev));
    list.sort((a, b) => (a.day - b.day) || (PHASES.indexOf(phaseOf(a)) - PHASES.indexOf(phaseOf(b))));
    if (list.length) out.next = { id: list[0].id, title: list[0].title.trim(), day: list[0].day, phase: phaseOf(list[0]) };
    return out;
  }
  /* Shut: closed by the story, or closed on this weekday (closedOn). */
  function isClosed(where, day) {
    const l = isObj(where) ? where : loc(where);
    if (!l) return false;
    return l.closed === true || (Array.isArray(l.closedOn) && l.closedOn.includes(weekday(day)));
  }
  // ----- who is away for the day, or laid up -----
  /* Away on a schedule (awayOn { days, phases, where }: school days) on that
     day and phase; days or phases left out mean every one. */
  function awayNow(n, phase, day) {
    const a = n && n.awayOn;
    if (!isObj(a) || !current) return false;
    const days = Array.isArray(a.days) ? a.days : WEEKDAYS;
    const phases = Array.isArray(a.phases) ? a.phases : PHASES;
    return days.includes(weekday(day)) && phases.includes(phase || current.time.phase);
  }
  /* Hurt (npcFates, World.knockDown): n.hurtUntilDay is the day they are
     about again. isHurt: hurt on that day (every day before hurtUntilDay;
     the last day hurt is hurtUntilDay - 1), whatever their status; laidUp:
     hurt and free, so at home in every phase (npcsAt). */
  function isHurt(n, day) { return !!n && Number.isInteger(n.hurtUntilDay) && n.hurtUntilDay > dayOf(day); }
  function laidUp(n, day) { return !!n && n.status === 'free' && isHurt(n, day); }
  /* Why someone is not about, in a few words: the dead and the far away
     (absentNote), then "hurt and laid up at the Mangum House until day 5"
     (about again on day 5, their hurtUntilDay: "until day N" is the day it
     ends, as for a ban), "at the county school in Clayburn until evening";
     '' when they are about. */
  function absentFor(n, phase, day) {
    if (!n) return '';
    const base = absentNote(n);
    if (base || !current) return base;
    const ph = PHASES.includes(phase) ? phase : current.time.phase;
    if (laidUp(n, day)) {
      const h = isObj(n.home) ? loc(n.home.locationId) : null;
      return `hurt and laid up ${h ? `at ${h.name.replace(/^The /, 'the ')}` : 'at home'} until Day ${n.hurtUntilDay}`;
    }
    if (awayNow(n, ph, day)) {
      const phases = Array.isArray(n.awayOn.phases) ? n.awayOn.phases : PHASES;
      const next = PHASES.slice(PHASES.indexOf(ph) + 1).find(x => !phases.includes(x));
      return `${cleanText(n.awayOn.where, 120) || 'away for the day'} until ${next || 'tomorrow'}`;
    }
    return '';
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
      // A day it already had is kept (wave 4), when it is a day the game has reached.
      const day = Number.isInteger(m.day) && m.day >= 1 && m.day <= current.time.day ? { day: m.day } : {};
      return Object.assign({ turn: m.turn }, day, { text, weight: m.weight }, m.model === true ? { model: true } : {}, MEMORY_ACTS.includes(m.act) ? { act: m.act } : {}, typedFields(m));
    });
  }
  /* What a typed memory carries besides its words (wave 26; the
     integration plan's section 2.2), kept when it is well formed and only
     when it is there: event, d (the change as applied, or null), decay,
     settled (its settlements), n (merges), place, key, witness, scene,
     secondhand, leverageId, about, private, seen. */
  function typedFields(m) {
    const out = {};
    const finite = v => typeof v === 'number' && Number.isFinite(v);
    if (typeof m.event === 'string' && Rel.EVENTS[m.event]) out.event = m.event;
    if (m.d === null) out.d = null;
    else if (isObj(m.d) && Object.keys(m.d).every(k => Rel.TRACKS.includes(k) && finite(m.d[k]))) out.d = Object.fromEntries(Rel.TRACKS.map(k => [k, finite(m.d[k]) ? m.d[k] : 0]));
    if (typeof m.decay === 'string' && Object.prototype.hasOwnProperty.call(Rel.DECAY, m.decay)) out.decay = m.decay;
    if (Array.isArray(m.settled)) {
      const list = m.settled.filter(x => isObj(x) && typeof x.by === 'string' && Number.isInteger(x.turn)).map(x => Object.assign({ turn: x.turn, day: Number.isInteger(x.day) ? x.day : null, by: x.by.slice(0, 30), w: finite(x.w) ? clamp(x.w, 0, 1) : 0, t: finite(x.t) ? clamp(x.t, 0, 1) : 0, f: finite(x.f) ? clamp(x.f, 0, 1) : 0 }, x.folded === true ? { folded: true } : {}));
      if (list.length) out.settled = list;
    }
    if (Number.isInteger(m.n) && m.n >= 1) out.n = m.n;
    for (const k of ['place', 'key', 'scene', 'leverageId', 'about', 'fight']) if (typeof m[k] === 'string' && m[k] && m[k].length <= 80) out[k] = m[k];
    for (const k of ['witness', 'private', 'seen']) if (m[k] === true) out[k] = true;
    // Wave 30: planted off-screen and not seen yet (the People card keeps it back until the player has been in a scene with them since).
    if (m.seen === false) out.seen = false;
    if (m.secondhand === true || isObj(m.secondhand)) out.secondhand = isObj(m.secondhand) ? deepCopy(m.secondhand) : true;
    return out;
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
  /* Wave 26: rel ({ w?, t?, f?, k?, s?, m?, owed? }, as relSet takes them:
     liking, trust, fear, knows-you, spark, romance (wave 35), favours owed
     (wave 35, the ledger's net)) sets tracks outright; they land in fix,
     which never drifts (owed: one entry set by hand), and spark or romance
     above 0 is refused for anyone they cannot move for. Memories edited
     with no track given leave every track where it was (pinned). */
  const EDIT_KEYS = ['npcId', 'name', 'age', 'pronouns', 'role', 'look', 'voice', 'history', 'personality', 'goal', 'secret', 'attitude', 'relationToNpcId', 'relation', 'homeLocationId', 'status', 'alive', 'memories', 'rel'];
  // Wave 30: the tracks by name (trust, fear, knows, spark; wave 35: romance, owed), so the quiet line reads "Edited Mavis Mangum: attitude, trust.".
  const EDIT_FIELDS = ['name', 'age', 'pronouns', 'role', 'look', 'voice', 'history', 'personality', 'attitude', 'trust', 'fear', 'knows', 'spark', 'romance', 'owed', 'relation', 'home', 'status', 'memories', 'goal', 'secret'];
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
    const tracks = given('rel') ? relTargets(n, e.rel, 'rel') : {};
    if (tracks.w !== undefined && want.attitude !== undefined && tracks.w !== want.attitude) bad('attitude and rel.w are the same track: give one');

    // 2. Change what is different, and say what.
    relWrite(n);
    const keep = relNow(n);
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
    // Liking (attitude, or rel.w) and the other tracks given land exactly, in fix, after the memories below.
    const liking = want.attitude !== undefined ? want.attitude : tracks.w;
    const land = {};
    if (liking !== undefined && liking !== n.attitude) { parts.push(`attitude ${n.attitude} -> ${liking}`); land.w = liking; fields.add('attitude'); }
    const others = Rel.TRACKS.filter(x => x !== 'w' && tracks[x] !== undefined && tracks[x] !== keep[x]);
    if (others.length) { parts.push(...others.map(x => `${RELWORD[x]} ${keep[x]} -> ${tracks[x]}`)); for (const x of others) { land[x] = tracks[x]; fields.add(Rel.TRACK_NAMES[x]); } }
    // Wave 35: favours owed, the ledger brought to the net given (one entry, set by hand).
    if (relOwed(n, tracks.owed)) { parts.push(`owed ${keep.owed} -> ${tracks.owed}`); fields.add('owed'); }
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
    // The tracks: what was given lands in fix; with the memories changed, every other track stays where it was.
    if (fields.has('memories')) { relGuard(n, `editPerson.${n.id}`); for (const x of Rel.TRACKS) if (land[x] === undefined) land[x] = keep[x]; }
    if (Object.keys(land).length) {
      const pinned = Object.keys(land).filter(x => !(x === 'w' ? fields.has('attitude') : others.includes(x)));
      n.rel = Rel.landTo(n, Object.assign({}, land, Rel.eligible(n, relCtx()) ? {} : { s: undefined, m: undefined }), Object.fromEntries(Rel.TRACKS.map(x => [x, pinned.includes(x) ? 'everyday' : 'fix'])), relCtx());
    }
    relWrite(n);
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
    for (const sd of s.seeds) {
      if (isObj(sd.trigger) && sd.trigger.type === 'location' && sd.trigger.value === from.id) sd.trigger.value = into.id;
      if (isObj(sd.appointment) && sd.appointment.locationId === from.id) sd.appointment.locationId = into.id;
    }
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
     seeds (and their effects), due events, visits, the player's loose ends
     and obligations, bans, the fight, gifts, rumours, seen, relations,
     told places' owners and the pending scene.
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
    // Wave 26: the cast member's tracks stay as they were (pinned), but for liking taken over from a fresh record, which lands in fix.
    relWrite(into);
    relWrite(from);
    const keep = relNow(into);
    if (fresh) keep.w = clamp(toInt(from.attitude) || 0, -100, 100);
    const mems = (into.memories || []).concat(from.memories || []).map((m, i) => ({ m, i })).sort((a, b) => ((a.m.turn | 0) - (b.m.turn | 0)) || a.i - b.i).map(x => x.m);
    while (mems.length > MEMORY_MAX) { const minW = Math.min(...mems.map(x => x.weight)); mems.splice(mems.findIndex(x => x.weight === minW), 1); }
    into.memories = mems;
    relGuard(into, `mergePeople.${into.id}`);
    relPin(into, keep, { w: fresh ? 'fix' : 'everyday' });
    const swap = id => (id === from.id ? into.id : id);
    for (const le of s.player.looseEnds || []) le.npcId = swap(le.npcId);
    for (const t of s.threads) t.linkedIds = Array.from(new Set(t.linkedIds.map(swap)));
    for (const sd of s.seeds) {
      if (isObj(sd.origin) && sd.origin.npcId === from.id) sd.origin.npcId = into.id;
      if (isObj(sd.trigger) && sd.trigger.type === 'npc' && sd.trigger.value === from.id) sd.trigger.value = into.id;
      if (isObj(sd.appointment) && sd.appointment.npcId === from.id) sd.appointment.npcId = into.id;
      if (isObj(sd.ask) && sd.ask.npcId === from.id) sd.ask.npcId = into.id;
    }
    for (const ev of s.dueEvents || []) if (ev.npcId === from.id) ev.npcId = into.id;
    if (Array.isArray(s.visits)) {
      const moved = s.visits.map(v => (v.npcId === from.id ? Object.assign({}, v, { npcId: into.id }) : v));
      s.visits = moved.filter((v, i) => moved.findIndex(w => w.npcId === v.npcId && w.day === v.day && w.phase === v.phase) === i);
    }
    for (const r of s.rumours) { if (r.sourceNpcId === from.id) r.sourceNpcId = into.id; if (r.heardFrom === from.id) r.heardFrom = into.id; }
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
    if (s.pendingScene) for (const k of ['arrived', 'left', 'before']) if (Array.isArray(s.pendingScene[k])) s.pendingScene[k] = Array.from(new Set(s.pendingScene[k].map(swap)));
    /* Wave 3 (the review's risk): everything else that names them, so the
       save still loads (validateShape checks an obligation's person exists):
       obligations (their person, who is owed, the ids in their effects),
       bans, the fight, today's gifts, seeds' effects, alternatives and
       requirements, everyone's relations and rumours' tellers. */
    const swapDeep = v => (typeof v === 'string' ? swap(v) : Array.isArray(v) ? v.map(swapDeep) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [swap(k), swapDeep(x)])) : v);
    for (const o of obligationList()) {
      o.npcId = swap(o.npcId);
      for (const k of ['owedTo', 'askerId']) if (typeof o[k] === 'string') o[k] = swap(o[k]);
      for (const k of ['onMiss', 'onMet']) if (Array.isArray(o[k])) o[k] = swapDeep(o[k]);
    }
    for (const b of Array.isArray(s.bans) ? s.bans : []) if (b.byNpcId === from.id) b.byNpcId = into.id;
    if (isObj(s.fight) && s.fight.npcId === from.id) s.fight.npcId = into.id;
    if (isObj(s.meta.gifts) && Array.isArray(s.meta.gifts.ids)) s.meta.gifts.ids = s.meta.gifts.ids.map(swap);
    for (const sd of s.seeds) {
      for (const k of ['effects', 'alt', 'requires']) if (sd[k] !== undefined) sd[k] = swapDeep(sd[k]);
      if (isObj(sd.trigger) && sd.trigger.type === 'npc') sd.trigger.value = swapDeep(sd.trigger.value);
    }
    for (const m of s.npcs) if (m !== from && Array.isArray(m.relations)) m.relations = m.relations.map(r => (isObj(r) && r.npcId === from.id ? Object.assign({}, r, { npcId: into.id }) : r)).filter(r => !(isObj(r) && r.npcId === m.id));
    for (const r of s.rumours) if (Array.isArray(r.tellerIds)) r.tellerIds = Array.from(new Set(r.tellerIds.map(swap)));
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
    const outer = applyCtx;
    const outerHold = rewardHold;
    applyCtx = { no, result };
    // A town event's effects (World): a thread they resolve holds its reward until its news is told (wave 6).
    if (opts && typeof opts.holdReward === 'string' && opts.holdReward) rewardHold = opts.holdReward;
    try { applyDiff(diff, opts, source, result, run, no); } finally { applyCtx = outer; rewardHold = outerHold; }
    return finish(result, source, !!(opts && opts.quiet));
  }
  function applyDiff(diff, opts, source, result, run, no) {
    syncLedger();
    const s = current;
    const p = s.player;
    /* What the turn was (transport passes it with a bookkeeper's diff): who
       was present, whether the roll succeeded, whom the player attacked. */
    const present = opts && Array.isArray(opts.present) ? opts.present.filter(x => typeof x === 'string') : null;
    const rollSuccess = opts ? opts.rollSuccess : undefined;
    const attacked = opts && typeof opts.attacked === 'string' && opts.attacked ? opts.attacked : null;
    // Whom the action was aimed at, and what it was (transport passes the action's targets and type with a bookkeeper's diff).
    const targets = opts && Array.isArray(opts.targets) ? opts.targets.filter(x => typeof x === 'string') : [];
    const actionType = opts && typeof opts.actionType === 'string' ? opts.actionType : null;
    // A purchase the turn made (wave 4: Say mode's too, which reaches here as talk).
    const boughtTurn = !!(opts && opts.bought === true);
    // A social roll that failed this turn (opts.rolled: a roll was made; wave 4), and whom it was made against (opts.asked; wave 5).
    const failedAsk = !!(opts && opts.rolled === true) && rollSuccess === false && ['talk', 'persuade', 'deceive', 'intimidate'].includes(actionType);
    const asked = opts && typeof opts.asked === 'string' && opts.asked ? opts.asked : null;
    const model = source === 'model';
    let goldRefused = false; // an unaffordable payment: what it bought is refused too (review E3)
    let paid = 0; // money the player handed over this diff (settles a debt by play)
    let handed = 0; // all of it (paid is what is left once the debts took theirs): a gift is money that moved (wave 27)
    const lostNames = []; // things the player gave up this diff (settles an errand by play)
    const settledFor = new Set(); // whose obligations this diff paid toward or settled (that money is no gift)
    const allowed = source === 'model' ? RECORD_KEYS : RECORD_KEYS.concat(ENGINE_KEYS);
    for (const k of Object.keys(diff)) {
      if (!allowed.includes(k)) no(k, ENGINE_KEYS.includes(k) ? 'not allowed from the model' : 'unknown field');
    }
    const val = k => (allowed.includes(k) && diff[k] !== undefined && diff[k] !== null ? diff[k] : undefined);
    /* What a payment in this diff goes toward (wave 2): an open debt or
       blackmail with an amount, its person present, and either the
       bookkeeper names it in obligationsSettled or the money plainly went to
       them (the action was aimed at them, or nobody else is here). Money
       spent in front of a creditor on anything else (a beer at their bar)
       pays nothing off. Such a payment may move up to what is still owed in
       one turn (the bookkeeper's usual cap is LIMITS.modelGoldPerTurn), and
       what is paid is kept on the obligation (paid), turn after turn, until
       it covers the amount. Wave 3: money that bought something (a buy, or
       a diff that gains anything: a cold drink from the creditor alone at
       his own counter) is the price of it, never a payment, unless the
       bookkeeper names the obligation; only a payment raises the cap.
       Wave 6 (the fifth review's bug 1, the final design): a diff that
       gains a thing buys it only when the thing is a good (goodNamed: the
       goods table, or a thing on sale here; a title or a receipt handed back
       is no purchase), and a Say line's paying words (opts.paying: "the
       rest", "toward", "what I owe") always make it a payment. */
    const named = Array.isArray(val('obligationsSettled')) ? val('obligationsSettled') : [];
    const gained = val('itemsGained');
    const gainedGood = Array.isArray(gained) && gained.some(x => goodNamed(typeof x === 'string' ? x : isObj(x) ? x.name : ''));
    const bought = !(opts && opts.paying === true) && (boughtTurn || actionType === 'buy' || gainedGood);
    const payees = model && present ? obligations('owed').filter(o => (o.kind === 'debt' || o.kind === 'blackmail') && Number.isInteger(o.amount) && o.amount > 0
      && present.includes(o.npcId) && (named.includes(o.id) || (!bought && (targets.includes(o.npcId) || present.length === 1)))) : [];
    const owedNow = payees.reduce((sum, o) => sum + Math.max(0, o.amount - (o.paid | 0)), 0);
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

    /* Wave 27, the legacy yield (the integration plan's 4.3): a bookkeeper's
       attitudeChanges and newMemories for someone the engine already gave an
       event this turn (ledger.engine: a fight, a threat, a theft; or one
       this diff will give: opts.engineEvents, a gift) yield to it. A liking
       change of the same sign is dropped, and so is their memory, with a
       debug line, so the demo's "attacked me, -20" on top of the engine's
       hit counts once. */
    const pending = model && opts && Array.isArray(opts.engineEvents) ? opts.engineEvents.filter(x => isObj(x) && typeof x.npcId === 'string' && Rel.EVENTS[x.event]) : [];
    const engineSigns = id => {
      const out = (ledger.engine[id] || []).slice();
      for (const x of pending) if (x.npcId === id) { const sg = Math.sign(isObj(x.d) && Number.isFinite(x.d.w) ? x.d.w : Rel.EVENTS[x.event].w); if (!out.includes(sg)) out.push(sg); }
      return out;
    };
    const yieldWhy = id => {
      const evs = pending.filter(x => x.npcId === id).map(x => x.event);
      const cls = (ledger.classes[id] || []).concat(evs.map(x => Rel.EVENTS[x].dedupe).filter(Boolean));
      return cls.includes('violence') ? 'the fight' : cls.includes('money') ? 'the gift' : cls.includes('threat') ? 'the threat' : cls.includes('theft') ? 'the theft' : 'what happened';
    };
    const yields = (id, sign) => model && engineSigns(id).some(sg => sign === undefined || sg === sign);
    // 2. record_changes
    each('attitudeChanges', c => {
      if (!isObj(c)) bad('must be an object');
      const n = needNpc(c.npcId);
      const d = toInt(c.delta);
      if (d === null) bad('delta must be an integer');
      if (d === 0) return null;
      if (yields(n.id, Math.sign(d))) { pushDebug({ turn: s.meta.turn, kind: 'rejected', source, path: 'attitudeChanges', reason: `the engine counted ${yieldWhy(n.id)} for ${n.id}: ${plusMinus(d)} dropped` }); return null; }
      const used = ledger.attitude[n.id] || 0;
      const allowedDelta = clamp(used + d, -LIMITS.attitudePerTurn, LIMITS.attitudePerTurn) - used;
      if (allowedDelta === 0) bad(`${n.id} attitude already moved ${LIMITS.attitudePerTurn} this turn`);
      // Into everyday, as attitudeDelta (wave 26: likingBy).
      const [before, after] = likingBy(n, allowedDelta);
      ledger.attitude[n.id] = used + allowedDelta;
      return `${n.id} ${before} -> ${after}` + (allowedDelta !== d ? ` (delta ${plusMinus(d)} clamped to ${plusMinus(allowedDelta)})` : '');
    });
    each('newMemories', m => {
      if (!isObj(m)) bad('must be an object');
      const n = needNpc(m.npcId);
      const text = model ? shortMemory(m.text) : cleanText(m.text, 400);
      if (!text) bad('memory needs text');
      if (yields(n.id)) { pushDebug({ turn: s.meta.turn, kind: 'rejected', source, path: 'newMemories', reason: `the engine counted ${yieldWhy(n.id)} for ${n.id}: "${text}" dropped` }); return null; }
      // The model's: one per person per turn, and one that says what an older one says merges into it.
      // The engine may say what kind of memory it is (wave 6: 'own', what they did to the player); the model's is the turn's.
      // Wave 27: and which event it is (event: a line the engine knows is noted, as the captured defeat's), else it is typed by its words.
      return remember(n, text, clamp(toInt(m.weight) || 1, 1, 3), { model, merge: model, act: !model && MEMORY_ACTS.includes(m.act) ? m.act : actionType, event: !model && typeof m.event === 'string' && Rel.EVENTS[m.event] ? m.event : null });
    });
    one('goldDelta', v => {
      const d0 = toInt(v);
      if (d0 === null) bad('must be an integer');
      if (d0 === 0) return null;
      let d = d0;
      // A bookkeeper may give the player at most LIMITS.modelGoldPerTurn in a turn (the model never invents money). What the player
      // hands over is held only by what they carry (wave 24: the owner paid $6,850 the story showed counted "in full" and the engine
      // took $500 of it); the affordability check below is the whole guard on spending.
      if (model && d0 > 0) {
        /* Wave 29: someone here who owes the player a demand pays it when
           their payment seed brings it, never in the narration (the
           integration plan's 19.4), so nobody pays twice. */
        const owing = present ? Rel.demands(relCtx()).filter(x => present.includes(x.npcId)) : [];
        if (owing.length) bad(`the payment arrives when they bring it (${owing.map(x => x.npcId).join(', ')} owes the player ${owing.map(x => money(x.amount)).join(', ')} for keeping quiet)`);
        // Nor on the turn the player leans on them with it: the engine's answer (LEVERAGE) already said they hand over nothing now.
        const backedId = opts && typeof opts.backed === 'string' ? opts.backed : null;
        if (backedId && (!present || present.includes(backedId))) bad(`the engine answered the demand on ${backedId} this turn: they hand over nothing now`);
        d = clamp(ledger.gold + d0, -Infinity, LIMITS.modelGoldPerTurn) - ledger.gold;
        if (d <= 0) bad(`money already gained ${money(LIMITS.modelGoldPerTurn)} this turn`);
      }
      if (p.gold + d < 0) { goldRefused = true; bad(`cannot afford ${money(-d)} (have ${money(p.gold)})`); }
      const before = p.gold;
      p.gold = Math.min(p.gold + d, 1000000);
      if (model) ledger.gold += d;
      if (d < 0) { paid += -d; handed += -d; }
      return `gold ${before} -> ${p.gold}` + (d !== d0 ? ` (${plusMinus(d0)} held to ${plusMinus(d)})` : '');
    });
    one('hpDelta', v => {
      const d0 = toInt(v);
      if (d0 === null) bad('must be an integer');
      if (d0 === 0) return null;
      let d = d0;
      // A bookkeeper moves HP at most LIMITS.modelHpPerTurn either way in a turn (review E2).
      if (model) {
        d = clamp(ledger.hp + d0, -LIMITS.modelHpPerTurn, LIMITS.modelHpPerTurn) - ledger.hp;
        if (d === 0) bad(`hp already moved ${LIMITS.modelHpPerTurn} this turn`);
      }
      const before = p.hp;
      let after = clamp(p.hp + d, 0, p.maxHp);
      // Only a fight the player lost (attacked, the roll failed) takes the last HP.
      let held = false;
      if (model && before > 0 && after === 0 && !(attacked && rollSuccess === false)) { after = 1; held = true; }
      p.hp = after;
      if (model) ledger.hp += d;
      return `hp ${before} -> ${p.hp}` + (p.hp !== before + d0 ? ' (clamped)' : '') + (held ? ' (no fight was lost: held at 1)' : '');
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
      // Bought with money the player did not have: not theirs either (review E3).
      if (goldRefused) bad(`not paid for: ${name}`);
      const fromScene = !!sceneItem(id);
      // A drink, a meal or a service is used where it is bought, never carried; a night's lodging is paid for (review E15).
      const service = fromScene ? null : serviceOf(name);
      if (service) {
        if (!service.lodging) return `${name}: ${service.kind}, had here (not carried)`;
        s.flags.lodgingPaidUntilDay = s.time.day + 1;
        return `${name}: lodging paid through day ${s.flags.lodgingPaidUntilDay} (not carried)`;
      }
      if (model && ledger.items >= LIMITS.modelItemsPerTurn) bad(`at most ${LIMITS.modelItemsPerTurn} things gained a turn`);
      carry(id, name, qty, notes);
      if (model) ledger.items += 1;
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
      lostNames.push(held.name);
      return `lost ${held.name} x${qty}`;
    });
    each('conditionsAdded', c => {
      if (!isObj(c)) bad('must be an object');
      const name = cleanText(c.name, 60);
      if (!name) bad('condition needs a name');
      const id = typeof c.id === 'string' && ID_RE.cond.test(c.id) ? c.id : 'cond_' + slugify(name);
      const day = s.time.day;
      // A bookkeeper's condition lasts LIMITS.modelConditionDays at most.
      const until = clamp(toInt(c.untilDay) === null ? day + 1 : toInt(c.untilDay), day, day + (model ? LIMITS.modelConditionDays : 30));
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
      // The bookkeeper cannot walk the player into a place shut today or one they are banned from.
      if (model && isClosed(l)) bad(`${l.id} is closed on ${weekday()}s`);
      if (model && isBanned(l.id)) bad(`${l.id} has banned the player until day ${isBanned(l.id).untilDay}`);
      const from = p.locationId;
      p.locationId = l.id;
      l.discovered = true;
      // A place the player had only heard of: the first visit makes it an ordinary place on the map.
      if (isObj(l.revealed) && !l.revealed.visited) l.revealed.visited = true;
      return `${from} -> ${l.id}`;
    });
    /* Known to the player; met (metTurn, the narrator stops describing
       their look) only when they were present. The first meeting shifts a
       faction member's attitude by the player's standing with their people
       (reputation / 5, once: repApplied). Without a present list, a model's
       first mention stands in for the meeting. */
    each('npcKnownToPlayer', id => {
      const n = needNpc(id);
      const parts = [];
      const firstKnown = !n.knownToPlayer;
      if (firstKnown) { n.knownToPlayer = true; parts.push(`${n.id} known`); }
      const met = !!present && present.includes(n.id) && !Number.isInteger(n.metTurn);
      if (met) { n.metTurn = s.meta.turn; parts.push(`${n.id} met`); }
      if (met || (firstKnown && model && !present)) parts.push(...meetingRep(n));
      return parts.join('; ') || null;
    });
    each('threadUpdates', u => {
      if (!isObj(u)) bad('must be an object');
      const t = needThread(u.threadId || u.id);
      if (u.status !== undefined && u.status !== null && !THREAD_STATUSES.includes(u.status)) bad('status must be open, resolved or failed');
      const parts = [];
      // Known first (wave 5, playtest Q12), as threadUpdate; held the same way (wave 7).
      const known = typeof u.knownToPlayer === 'boolean' ? setThreadKnown(t, u.knownToPlayer) : null;
      if (known) parts.push(known);
      if (u.status) parts.push(setThreadStatus(t, u.status));
      const summary = cleanText(u.summary, 400);
      const said = summary ? setThreadSummary(t, summary, true) : null;
      if (said) parts.push(said);
      return parts.join('; ') || null;
    });
    /* One segment per faction per day and phase (meta.nudges, saved, so
       /undo takes a nudge back with its turn): a talky phase of many turns
       nudges no more than one long one. */
    each('clockNudges', c => {
      if (!isObj(c)) bad('must be an object');
      const f = needFaction(c.factionId);
      const d = toInt(c.delta);
      if (d !== 1 && d !== -1) bad('delta must be 1 or -1');
      const clock = runningClock(f);
      if (!clock) bad(`${f.id} has no running clock`);
      const at = `${s.time.day}:${s.time.phase}`;
      if (!isObj(s.meta.nudges) || s.meta.nudges.at !== at || !isObj(s.meta.nudges.used)) s.meta.nudges = { at, used: {} };
      const used = s.meta.nudges.used[f.id] || 0;
      const allowedDelta = clamp(used + d, -LIMITS.clockPerTurn, LIMITS.clockPerTurn) - used;
      if (allowedDelta === 0) bad(`${f.id} clock already moved this ${s.time.phase}`);
      const before = clock.filled;
      clock.filled = clamp(before + allowedDelta, 0, clock.segments);
      s.meta.nudges.used[f.id] = used + allowedDelta;
      return `${f.id} "${clock.label}" ${before} -> ${clock.filled}/${clock.segments}`;
    });
    each('newSeeds', raw => {
      const cap = model ? LIMITS.modelSeedsPerTurn : LIMITS.seedsPerTurn;
      if (ledger.seeds >= cap) bad(`seed limit reached (${cap} per turn)`);
      const sd = normaliseSeed(raw, true);
      // The turn it was planted on (wave 22): /rewind strikes it with that turn.
      sd.turn = s.meta.turn;
      // A meeting someone agreed to in the story (wave 22): an appointment the engine keeps.
      const ap = appointmentOf(sd);
      if (ap) {
        // The same person's meeting that day, agreed before, is this one now (a time changed, or the meeting said again).
        for (const old of s.seeds.filter(x => isObj(x.appointment) && !x.fired && x.appointment.npcId === ap.npcId && x.appointment.day === ap.day)) dropSeed(old);
        sd.appointment = ap;
        // It may come today (a location trigger waits a day otherwise), and not before its day.
        if (ap.day > s.time.day) sd.notBeforeDay = ap.day; else delete sd.notBeforeDay;
      }
      // Something someone asked of the player in the story (wave 26): the Objectives tab lists it until it fires.
      const ask = !ap && model ? askOf(sd) : null;
      if (ask) sd.ask = ask;
      s.seeds.push(sd);
      ledger.seeds += 1;
      const placed = ap ? keepAppointment(sd) : [];
      return `seed ${sd.id} planted (${sd.trigger.type} ${sd.trigger.value})${ap ? `; an appointment: ${ap.npcId} at ${ap.locationId} on day ${ap.day} (${ap.phases.join(', ')})${placed.length ? `, there for ${placed.join(', ')}` : ''}` : ''}${ask ? `; an ask: ${ask.npcId}${Number.isInteger(ask.dueDay) ? ` by day ${ask.dueDay}` : ''}` : ''}`;
    });
    each('rumoursHeard', id => {
      const r = rumour(id) || bad(`unknown rumour id "${id}"`);
      if (r.heard) return null;
      r.heard = true;
      r.heardDay = s.time.day; // the Journal's Leads ("told you, day 2")
      /* Wave 29: a true rumour content marks leverageOver (the integration
         plan's 8.2; an older save's copy reads the built-in town's) is
         something the player holds over that person, and they do not know
         it: the secret counts as shown (how: rumour), the record's words are
         the rumour's. */
      const lev = rumourLeverage(r);
      const t = typeof r.threadId === 'string' ? thread(r.threadId) : null;
      // A rumour about a thread makes the thread known (design #6).
      if (t && !t.knownToPlayer) { t.knownToPlayer = true; dropPending(t, 'knownToPlayer'); return `${r.id} heard; ${t.id} known${lev ? `; ${lev}` : ''}`; }
      return `${r.id} heard${lev ? `; ${lev}` : ''}`;
    });
    one('journalEntry', v => {
      if (typeof v !== 'string') bad('must be a string');
      const text = cleanText(v, 300);
      if (!text) return null;
      s.journal.push({ turn: s.meta.turn, day: s.time.day, phase: s.time.phase, text });
      return `journal "${text}"`;
    });
    /* What happened to someone present (CONTRACTS section 10). From the
       model: someone in present, one a turn, and dead, arrested or gone only
       after a successful roll. hurt lays them up at home (hurtUntilDay, two
       days; npcsAt) with their status unchanged. */
    each('npcFates', f => {
      if (!isObj(f)) bad('must be an object');
      const n = needNpc(f.npcId);
      if (!NPC_FATES.includes(f.status)) bad(`status must be ${NPC_FATES.join(', ')}`);
      if (model) {
        if (ledger.fates >= LIMITS.fatesPerTurn) bad(`at most ${LIMITS.fatesPerTurn} fate a turn`);
        if (!present || !present.includes(n.id)) bad(`${n.id} is not here`);
        if (f.status !== 'hurt' && rollSuccess !== true) bad(`${f.status} needs a successful roll this turn`);
      }
      if (n.alive === false || n.status === 'dead' || n.status === 'gone') return `no-op: ${n.id} is already ${n.alive === false ? 'dead' : n.status}`;
      if (model) ledger.fates += 1;
      if (f.status !== 'hurt') return EFFECTS.npcStatus({ npcId: n.id, status: f.status });
      n.hurtUntilDay = Math.max(Number.isInteger(n.hurtUntilDay) ? n.hurtUntilDay : 0, s.time.day + 2);
      s.visits = (s.visits || []).filter(v => v.npcId !== n.id);
      // Hurt by someone else (wave 27): in need of help at home this phase and the next (Pipeline's rescued); never what the player did.
      if (model && attacked !== n.id) { const h = homeOf(n); if (h) s.flags[`danger.${n.id}`] = `${s.time.day}|${s.time.phase}|${h.id}||${s.meta.turn}`; }
      return `${n.id} hurt: laid up at home through day ${n.hurtUntilDay - 1}, about again on day ${n.hurtUntilDay}`;
    });
    /* A memory this turn resolved: the first of the person's memories whose
       words hold the given words (or are held in them), any case. From the
       model the person must be here; a loose end's memory and a story
       point's fact are never settled away (PROTECTED_MEMORIES). */
    each('memoriesSettled', m => {
      if (!isObj(m)) bad('must be an object');
      const n = needNpc(m.npcId);
      if (model && !(present && present.includes(n.id))) bad(`${n.id} is not here`);
      const want = cleanText(m.text, 200).toLowerCase();
      if (want.length < 6) bad('text must be at least 6 characters');
      const list = Array.isArray(n.memories) ? n.memories : [];
      const i = list.findIndex(x => { if (protectedMemory(x)) return false; const t = String(x.text || '').toLowerCase(); return t.includes(want) || (t.length >= 6 && want.includes(t)); });
      if (i < 0) bad(`${n.id} has no memory like "${m.text}"${list.some(protectedMemory) ? ' (a loose end or a fact is never settled away)' : ''}`);
      // Wave 26: a typed memory (an event's) is softened, never deleted (Rel.settle: combined, at most two); a line that moves nothing goes, as before.
      if (isObj(list[i].d)) {
        relWrite(n);
        const r = Rel.settle(n, i, 'settled', relCtx());
        if (!r.ok) return `no-op: ${n.id}: ${r.why}`;
        n.memories = r.memories;
        relWrite(n);
        return `${n.id} lets some of "${r.text}" go`;
      }
      const gone = list.splice(i, 1)[0];
      return `${n.id} let go of "${gone.text}"`;
    });
    /* Settling by play (model diffs, with who was present). Money: what this
       diff handed over goes to the payees above in order, kept as paid on
       each; one is met when paid covers its amount (over one turn or
       several). An errand: its thing given up in front of the person who
       wanted it meets it. */
    if (model && present) {
      for (const o of payees) {
        if ((o.status !== 'open' && !stillOwed(o)) || paid <= 0) continue;
        const give = Math.min(paid, o.amount - (o.paid | 0));
        if (give <= 0) continue;
        paid -= give;
        settledFor.add(o.npcId);
        o.paid = (o.paid | 0) + give;
        if (o.paid >= o.amount) {
          // Paid in full: met (a missed one late; stillOwed is false once paid, so it is settled here directly).
          const wasMissed = o.status === 'missed';
          run(`settled.${o.id}`, () => settle(o, 'met', `paid ${money(o.amount)}${o.paid > give ? ` in all (${money(give)} this time)` : ''}${wasMissed ? ', late' : ''}`, wasMissed));
        } else run(`paid.${o.id}`, () => `${money(give)} paid toward ${o.id}: ${money(o.paid)} of ${money(o.amount)}`);
      }
      for (const o of obligations()) {
        if ((o.status === 'open' || o.status === 'missed') && o.kind === 'errand' && o.itemName && present.includes(o.npcId) && lostNames.some(nm => sameThing(nm, o.itemName))) {
          const wasMissed = o.status === 'missed';
          settledFor.add(o.npcId);
          run(`settled.${o.id}`, () => settle(o, 'met', `handed over ${o.itemName}${wasMissed ? ', late' : ''}`, wasMissed));
        }
      }
    }
    /* Obligations the story settled. From the model: the person present; a
       debt with an amount is met only once what was paid toward it covers
       it (above), an errand only once its thing is no longer carried. */
    each('obligationsSettled', id => {
      const o = obligation(id) || bad(`unknown obligation "${id}"`);
      if (o.status !== 'open' && !stillOwed(o)) return null;
      if (model) {
        if (!present || !present.includes(o.npcId)) bad(`${o.npcId} is not here`);
        if ((o.kind === 'debt' || o.kind === 'blackmail') && Number.isInteger(o.amount) && o.amount > 0 && (o.paid | 0) < o.amount) bad(`${o.id} is met by paying ${money(o.amount)} (${money(o.paid | 0)} paid so far)`);
        if (o.kind === 'errand' && o.itemName && findHeld(o.itemName)) bad(`${o.itemName} is still carried`);
        // An ask of theirs that failed this turn settles nothing with them (wave 4, the playtest's design note: "No. Not happening." is no promise kept).
        // Wave 5 (the fourth review's risk): said to everyone, only the one the roll was against (opts.asked) is refused, not everyone here.
        if (failedAsk && (asked ? asked === o.npcId : (targets.includes(o.npcId) || (present.length === 1 && present[0] === o.npcId)))) bad(`the player's ${actionType} with ${o.npcId} failed this turn: nothing with them is settled`);
      }
      settledFor.add(o.npcId);
      return settle(o, 'met', 'in the story');
    });
    /* Wave 27: the turn's engine events that ride the bookkeeper's apply
       (opts.engineEvents, Pipeline's: a gift or a bribe), after the money
       and the obligations above and before the model's events, so the
       dedupe sees them. One marked handed counts only when money or a thing
       actually moved this diff and none of it went toward what the player
       owes them (that is a payment: the obligation's own event says what
       they think); its words say what moved. */
    if (opts && Array.isArray(opts.engineEvents)) {
      opts.engineEvents.forEach((x, i) => run(`engineEvents[${i}]`, () => {
        if (!isObj(x)) bad('must be an object');
        let ev = x;
        if (x.handed === true) {
          if ((handed <= 0 && !lostNames.length) || settledFor.has(x.npcId)) return null;
          const what = handed > 0 ? money(handed) : lostNames.map(nm => `${article(lowerFirst(nm))} ${lowerFirst(nm)}`).join(' and ');
          ev = Object.assign({}, x, { text: cleanText(x.text, 200) || `gave me ${what}` });
          delete ev.handed;
        }
        return socialEvent(ev, `engineEvents[${i}]`);
      }));
    }
    /* Wave 26: events for people (the engine's; the bookkeeper's from wave
       28), each as the socialEvent op takes it: after the money and the
       obligations above (an engine event sees what this diff paid) and
       before the effects. Wave 28: the bookkeeper's go through the model's
       rules first (modelSocial). */
    if (model) { const v = val('socialEvents'); if (v !== undefined) { if (!Array.isArray(v)) no('socialEvents', 'must be an array'); else modelSocial(v, opts, result, run, no); } }
    else each('socialEvents', e => socialEvent(e, 'socialEvents', model));

    // 3. Effect ops
    each('effects', runEffect);

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
        return v ? 'retry lock set' : 'retry lock cleared';
      });
    }
    // Wave 43: a paid call's cost added to the game's total (meta.cost); asked / noticed: the ceiling the player said Keep going at, and was told of.
    one('spend', v => {
      if (!isObj(v)) bad('must be an object');
      const c = costRecord(s.meta.cost);
      for (const k of COST_KEYS) {
        if (v[k] === undefined) continue;
        const n = Number(v[k]);
        if (!Number.isFinite(n) || n < 0) bad(`${k} must be a number of 0 or more`);
        c[k] = k === 'usd' ? Math.round((c[k] + n) * 1e9) / 1e9 : c[k] + Math.round(n);
      }
      for (const k of ['asked', 'noticed']) if (v[k] !== undefined) { if (!(Number.isFinite(v[k]) && v[k] > 0)) bad(`${k} must be an amount`); c[k] = v[k]; }
      s.meta.cost = c;
      return v.usd !== undefined ? `spent $${Number(v.usd).toFixed(4)} (this game $${c.usd.toFixed(2)})` : 'spending noted';
    });
    one('beginTurn', v => {
      if (v !== true) return null;
      s.meta.turn += 1;
      syncLedger();
      return `turn ${s.meta.turn}`;
    });
    one('advanceTime', v => {
      const info = advanceTime(v);
      result.time = info;
      return `${info.cost}: day ${info.to.day} ${info.to.phase}` + (info.healed ? ` (+${info.healed} hp)` : '') + (info.quality ? ` (${info.quality})` : '')
        + (info.instantShort ? ' (talk adds up: a short)' : '') + (info.held ? ' (late: night holds until the player sleeps)' : '');
    });
    // What runs out with a new day (advanceTime does it too): a day number.
    one('expireDaily', v => {
      if (!Number.isInteger(v)) bad('must be a day number');
      const out = expireNow(v);
      return out.length ? out.join('; ') : null;
    });
    /* The news the player has been shown. true: every item; 'public': the
       public ones that are not an ending (what the morning's "Overnight in
       town" block told); 'ending': the endings (their epilogue turn was
       narrated); { eventId }: what a town event made, once the player saw
       it happen (its due event narrated). */
    one('newsSeen', v => {
      const ev = isObj(v) && typeof v.eventId === 'string' && v.eventId ? v.eventId : null;
      if (v !== true && v !== 'public' && v !== 'ending' && !ev) bad('must be true, "public", "ending" or { eventId }');
      // 'public' leaves an item whose due event is still to be told (newsWaits; wave 5).
      const pick = x => (v === true ? true : v === 'public' ? x.public !== false && x.epilogue !== true && !newsWaits(x) : v === 'ending' ? x.epilogue === true : x.eventId === ev);
      const unseen = (Array.isArray(s.news) ? s.news : []).filter(x => !x.seen && pick(x));
      unseen.forEach(x => { x.seen = true; });
      // A reward held for the news (wave 6): earned now that it is told.
      const told = releaseRewards();
      const parts = (unseen.length ? [`${unseen.length} news seen`] : []).concat(told);
      return parts.length ? parts.join('; ') : null;
    });
    /* A gift handed to someone (Pipeline): meta.gifts = { day, ids } holds
       today's, so a second gift to the same person that day earns no warmth. */
    one('giftGiven', id => {
      const n = needNpc(id);
      const g = isObj(s.meta.gifts) && s.meta.gifts.day === s.time.day && Array.isArray(s.meta.gifts.ids) ? s.meta.gifts : { day: s.time.day, ids: [] };
      s.meta.gifts = { day: g.day, ids: g.ids.concat(n.id).slice(-20) };
      return `gift to ${n.id} (${s.meta.gifts.ids.filter(x => x === n.id).length} today)`;
    });
    /* The fight in progress (Pipeline: three clean hits on one person in one
       scene put them down): { npcId, hits, day, phase, locationId }, or null
       when it is over. Saved, so /undo takes a hit back with its turn. */
    if (Object.prototype.hasOwnProperty.call(diff, 'fight') && allowed.includes('fight')) {
      run('fight', () => {
        const f = diff.fight;
        if (f === null) { if (s.fight === undefined) return null; delete s.fight; return 'fight over'; }
        if (!isObj(f)) bad('must be an object or null');
        const n = needNpc(f.npcId);
        const hits = toInt(f.hits);
        if (hits === null || hits < 0 || hits > 3) bad('hits must be 0 to 3');
        if (!Number.isInteger(f.day) || !PHASES.includes(f.phase)) bad('needs day and phase');
        const l = needLoc(f.locationId);
        s.fight = { npcId: n.id, hits, day: f.day, phase: f.phase, locationId: l.id, turn: Number.isInteger(f.turn) ? f.turn : s.meta.turn };
        // Wave 27: the fight's key (its one memory) and the town reputation it has cost so far (the heaviest blow's, once).
        if (typeof f.key === 'string' && /^[a-z0-9_-]{1,60}$/i.test(f.key)) s.fight.key = f.key;
        if (Number.isInteger(f.rep) && f.rep <= 0 && f.rep >= -10) s.fight.rep = f.rep;
        return `fight with ${n.id}: ${hits} hit${hits === 1 ? '' : 's'}`;
      });
    }
    /* A town event (TOWN_DATA.events) or the epilogue told (World.fireEvents):
       its id goes in state.eventsFired, once (CONTRACTS section 11). */
    each('eventsFired', id => {
      if (typeof id !== 'string' || !/^[a-z0-9_.-]{1,60}$/i.test(id)) bad('must be an event id');
      if (!Array.isArray(s.eventsFired)) s.eventsFired = [];
      if (s.eventsFired.includes(id)) return null;
      s.eventsFired.push(id);
      return `event ${id} fired`;
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
      delete t.instants;
      // How old every memory is follows the clock (wave 26; wave 29: quietly, as fading is).
      quietly(relWriteAll);
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
      // Its day (wave 6, the round-5 playtest's R2): a seed /cheat time passed is dated its own day, and the due events stay in day order.
      const ev = { seedId: sd.id, text: cleanText(e.text, 400) || sd.effect, firedTurn: s.meta.turn, firedDay: Number.isInteger(e.day) && e.day >= 1 && e.day <= s.time.day ? e.day : s.time.day };
      if (e.npcId !== undefined && e.npcId !== null) ev.npcId = needNpc(e.npcId).id;
      if (e.bring === true && ev.npcId) ev.bring = true;
      // A town event at the player's place is the scene itself; its news is seen once it is narrated.
      if (e.scene === true) ev.scene = true;
      if (typeof e.eventId === 'string' && /^[a-z0-9_.-]{1,60}$/i.test(e.eventId)) ev.eventId = e.eventId;
      // The obligation it is about: once that is met the event is dropped untold (a debt confrontation after the debt was paid).
      if (typeof e.obligationId === 'string' && obligation(e.obligationId)) ev.obligationId = e.obligationId;
      const at = s.dueEvents.findIndex(x => Number.isInteger(x.firedDay) && x.firedDay > ev.firedDay);
      if (at >= 0) s.dueEvents.splice(at, 0, ev); else s.dueEvents.push(ev);
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
      // Who was here when it began (wave 3): a later change in the same untold stretch is measured from them, start to end.
      if (Array.isArray(sc.before)) s.pendingScene.before = sc.before.map(String).filter(id => npc(id)).slice(0, 40);
      return `scene at ${l.id}: arrived ${arrived.join(', ') || 'nobody'}; left ${left.join(', ') || 'nobody'}`;
    });
    one('sceneChangeDone', () => { delete s.pendingScene; return 'scene change narrated'; });
    /* /cheat cards armed (true) or spent (false) (wave 11, L2): kept in the
       game (flags.cardsCheat), so a reload keeps it and an /undo of the hand
       it won arms it again. */
    one('cardsCheat', v => {
      if (typeof v !== 'boolean') bad('must be true or false');
      if (!isObj(s.flags)) s.flags = {};
      if (v) s.flags.cardsCheat = true; else delete s.flags.cardsCheat;
      return v ? 'cards cheat armed' : 'cards cheat spent';
    });
    /* /cheat win armed (true) or spent (false) (wave 13): kept in the game
       (flags.cardsWin) as cardsCheat is. */
    one('cardsWin', v => {
      if (typeof v !== 'boolean') bad('must be true or false');
      if (!isObj(s.flags)) s.flags = {};
      if (v) s.flags.cardsWin = true; else delete s.flags.cardsWin;
      return v ? 'win cheat armed' : 'win cheat spent';
    });
    /* The card game the player plays at the table (wave 13): 'draw' or
       'holdem', remembered (flags.cardGame) once chosen or named; false
       forgets it (the chooser comes back). */
    one('cardGame', v => {
      if (v !== false && v !== 'draw' && v !== 'holdem') bad("must be 'draw', 'holdem' or false");
      if (!isObj(s.flags)) s.flags = {};
      if (v) s.flags.cardGame = v; else delete s.flags.cardGame;
      return v ? `card game ${v}` : 'card game forgotten';
    });
    /* /rewind (wave 16): { turn } strikes every turn after that one from the
       story, for turns the undo stack cannot reach (played before it was
       kept, or more than it holds). It works from the records that carry a
       turn number: log entries, memories, journal notes, progression and
       seen marks of later turns go; whoever was met later is not met (the
       narrator describes them again); a person or place first named later
       goes when nothing else refers to it (a home the cast wrote is not
       found again), else stays; a fight from those turns is over. The
       clock goes back to when the first struck turn was played (its
       input's time: its from, else its own), the start of that phase, and
       a visit after it and an untold change of scene go, as does a seed the
       bookkeeper planted on a struck turn that has not fired (wave 22: its
       turn; an appointment with its visits). meta.turn keeps
       counting (the next turn is logged after the struck numbers), so what
       else carries a later turn (an obligation, a due event, a rumour, a
       defeat) keeps it, and an undo step kept from before the rewind is
       still this game's after a reload.
       Not taken back (nothing records it by turn): money, health, things
       carried, attitudes, where the player is, rumours heard, clocks, loose
       ends and threads (a thread settled then stays settled, its gain
       kept). Wave 26: a memory's settlements, owed favours, the ask log and
       recent times together carry their turn and go with it, as do
       leverage records and secrets shown (wave 29); the everyday and fix
       buckets that attitude changes land in stay, so attitudes still do;
       everyone's tracks are recomputed. result.rewound: { struck, turn,
       day, phase, settled, people, places, seeds (how many seeds went) }. */
    one('rewind', v => {
      if (!isObj(v) || !Number.isInteger(v.turn) || v.turn < 0) bad('needs turn: the last turn kept');
      const T = v.turn;
      const later = x => Number.isInteger(x) && x > T;
      const kept = s.log.filter(e => !(isObj(e) && later(e.turn)));
      if (!kept.length) bad('nothing of the story would be left');
      const gone = s.log.filter(e => isObj(e) && later(e.turn));
      if (!gone.length) return null;
      const first = gone[0];
      const when = isObj(first.from) && Number.isInteger(first.from.day) && PHASES.includes(first.from.phase) ? first.from : first;
      s.log = kept;
      for (const n of s.npcs) {
        if (Array.isArray(n.memories)) n.memories = n.memories.filter(m => !(isObj(m) && later(m.turn)));
        if (later(n.metTurn)) delete n.metTurn;
        /* Wave 26: what carries a turn goes with it: a kept memory's
           settlements, owed favours, the ask log, recent times together, and
           today's counts when today began on a struck turn. The everyday
           and fix buckets and the across-days counts stay, as money does. */
        if (Array.isArray(n.memories)) for (const m of n.memories) if (isObj(m) && Array.isArray(m.settled)) { m.settled = m.settled.filter(x => !(isObj(x) && later(x.turn))); if (!m.settled.length) delete m.settled; }
        if (isObj(n.rel)) {
          for (const k of ['owed', 'asks', 'recent']) if (Array.isArray(n.rel[k])) n.rel[k] = n.rel[k].filter(x => !(isObj(x) && later(x.turn)));
          if (isObj(n.rel.today) && later(n.rel.today.turn)) n.rel.today = null;
        }
      }
      // Leverage records and what the player has been shown (wave 29), by their turns.
      if (Array.isArray(s.leverage)) {
        s.leverage = s.leverage.filter(x => !(isObj(x) && isObj(x.since) && later(x.since.turn)));
        for (const x of s.leverage) for (const k of ['log', 'uses', 'knownBy']) if (isObj(x) && Array.isArray(x[k])) x[k] = x[k].filter(y => !(isObj(y) && later(y.turn)));
        // Its status is the last change kept; a demand made on a struck turn goes (wave 29).
        for (const x of s.leverage) {
          if (!isObj(x)) continue;
          if (Array.isArray(x.log) && x.log.length && isObj(x.log[x.log.length - 1]) && typeof x.log[x.log.length - 1].status === 'string') x.status = x.log[x.log.length - 1].status;
          if (isObj(x.demand) && later(x.demand.turn)) x.demand = null;
          else if (isObj(x.demand) && x.demand.paid === true && x.status !== 'paid') { delete x.demand.paid; delete x.demand.paidDay; }
        }
      }
      if (isObj(s.known) && isObj(s.known.secrets)) for (const id of Object.keys(s.known.secrets)) if (isObj(s.known.secrets[id]) && later(s.known.secrets[id].turn)) delete s.known.secrets[id];
      /* Wave 31: the news on its way made on a struck turn goes, and what
         was heard on one is on its way again; a tie's log lines of a struck
         turn go (its liking and trust read from what is left), and a tie
         found out on one is hidden again until it is found out again. */
      if (Array.isArray(s.hearsay)) {
        s.hearsay = s.hearsay.filter(h => !(isObj(h) && later(h.turn)));
        for (const h of s.hearsay) if (isObj(h) && later(h.deliveredTurn)) { delete h.deliveredTurn; delete h.untold; }
      }
      if (isObj(s.ties)) for (const k of Object.keys(s.ties)) {
        const tie = s.ties[k];
        if (!isObj(tie)) continue;
        if (Array.isArray(tie.log)) tie.log = tie.log.filter(e => !(isObj(e) && later(e.turn)));
        if (later(tie.knownTurn)) { tie.known = false; delete tie.knownTurn; }
        Object.assign(tie, Rel.tieNow(tie));
      }
      s.journal = s.journal.filter(j => !(isObj(j) && later(j.turn)));
      const prog = Array.isArray(p.progression) ? p.progression : [];
      const settled = prog.filter(x => isObj(x) && later(x.turn)).length;
      p.progression = prog.filter(x => !(isObj(x) && later(x.turn)));
      if (isObj(s.seen)) for (const id of Object.keys(s.seen)) if (isObj(s.seen[id]) && later(s.seen[id].turn)) delete s.seen[id];
      if (isObj(s.fight) && later(s.fight.turn)) delete s.fight;
      // The clock as the first struck turn found it.
      const t = s.time;
      if (Number.isInteger(when.day) && when.day >= 1 && PHASES.includes(when.phase)) {
        t.day = when.day;
        t.phase = when.phase;
        t.shorts = 0;
        delete t.late;
        delete t.noSleep;
        delete t.instants;
      }
      const at = t.day * PHASES.length + PHASES.indexOf(t.phase);
      if (Array.isArray(s.visits)) s.visits = s.visits.filter(x => !(isObj(x) && Number.isInteger(x.day) && x.day * PHASES.length + PHASES.indexOf(x.phase) > at));
      // A seed the bookkeeper planted on a struck turn that has not fired (wave 22: an appointment too, with its visits) goes.
      const struckSeeds = s.seeds.filter(sd => isObj(sd) && later(sd.turn) && !sd.fired).map(sd => sd.id);
      if (struckSeeds.length) {
        s.seeds = s.seeds.filter(sd => !struckSeeds.includes(sd.id));
        if (Array.isArray(s.visits)) s.visits = s.visits.filter(x => !(isObj(x) && struckSeeds.includes(x.seedId)));
      }
      delete s.pendingScene;
      // People and places first named later: gone unless something else names them (their own record, the schedules, the seen marks and a place's exits back to it aside).
      const newPeople = s.npcs.filter(n => isObj(n.created) && later(n.created.turn));
      const newPlaces = s.locations.filter(l => isObj(l.revealed) && later(l.revealed.turn) && l.id !== p.locationId);
      const drop = new Set(newPeople.map(n => n.id).concat(newPlaces.filter(l => l.revealed.authored !== true).map(l => l.id)));
      // Until nothing changes: one kept because something names it may name another.
      for (let size = -1; drop.size && drop.size !== size;) {
        size = drop.size;
        const text = JSON.stringify(s, function (k, x) {
          if (k === 'npcIdsBySchedule' || k === 'seen' || k === 'exits') return undefined;
          if (Array.isArray(this) && isObj(x) && drop.has(x.id)) return undefined;
          return x;
        });
        for (const id of Array.from(drop)) if (text.includes(`"${id}"`)) drop.delete(id);
      }
      const people = [];
      const places = [];
      if (drop.size) {
        for (const n of s.npcs) if (drop.has(n.id)) people.push(n.name);
        for (const l of s.locations) if (drop.has(l.id)) places.push(l.name);
        s.npcs = s.npcs.filter(n => !drop.has(n.id));
        s.locations = s.locations.filter(l => !drop.has(l.id));
        for (const l of s.locations) {
          if (Array.isArray(l.exits)) l.exits = l.exits.filter(x => !drop.has(x));
          for (const ph of PHASES) { const sch = l.npcIdsBySchedule; if (isObj(sch) && Array.isArray(sch[ph])) sch[ph] = sch[ph].filter(x => !drop.has(x)); }
        }
        if (isObj(s.seen)) for (const id of Object.keys(s.seen)) if (drop.has(id)) delete s.seen[id];
      }
      // A home the cast wrote, found later: not found again.
      for (const l of newPlaces) if (l.revealed.authored === true && !drop.has(l.id)) { l.discovered = false; delete l.revealed; places.push(l.name); }
      // Everyone's tracks from what is left, at the clock as it is now (wave 29: quietly, as a load).
      quietly(relWriteAll);
      if (applyCtx) applyCtx.result.rewound = { struck: gone.length, turn: T, day: t.day, phase: t.phase, settled, people, places, seeds: struckSeeds.length };
      return `rewound to turn ${T}: ${gone.length} turn${gone.length === 1 ? '' : 's'} struck, the clock at day ${t.day} ${t.phase}${people.length ? `; gone: ${people.join(', ')}` : ''}${places.length ? `; places gone: ${places.join(', ')}` : ''}`;
    });
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
    each('visits', addVisit);
    /* Wave 22: seeds that will never fire now (an appointment missed, or
       one its person can no longer keep): out of the story, with the
       visits they placed from now on. */
    each('seedsDropped', id => {
      const sd = seed(id) || bad(`unknown seed id "${id}"`);
      dropSeed(sd);
      return `${sd.id} dropped`;
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
      // The time the input was given, when the narration is told in another (wave 6, R7: /wait, /skip): the feed shows the input, then that divider.
      if (isObj(e.from) && Number.isInteger(e.from.day) && e.from.day >= 1 && PHASES.includes(e.from.phase) && (e.from.day !== entry.day || e.from.phase !== entry.phase)) entry.from = { day: e.from.day, phase: e.from.phase };
      // The bookkeeper failed (the narration stands); logUpdate clears it when a late retry records the turn.
      if (e.changes === 'not recorded') entry.changes = 'not recorded';
      const notes = logNotes(e.notes);
      if (notes.length) entry.notes = notes;
      const cards = logCards(e.cards);
      if (cards) entry.cards = cards;
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
      s.log.push(entry);
      if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
      noteSeen(s, entry);
      return `log turn ${entry.turn}`;
    });
    /* A logged turn changed afterwards: { turn? (default the newest entry),
       changes?: 'not recorded' | null (a late bookkeeper retry recorded it),
       notes?: [text] (quiet lines for it, which the feed shows again after
       a reload; the newest LOG_NOTES_MAX kept) }. */
    one('logUpdate', v => {
      if (!isObj(v)) bad('must be an object');
      const e = v.turn === undefined || v.turn === null ? s.log[s.log.length - 1] : s.log.find(x => x.turn === toInt(v.turn));
      if (!e) bad(v.turn === undefined || v.turn === null ? 'the log is empty' : `no log entry for turn ${v.turn}`);
      const parts = [];
      if (v.changes === null && e.changes !== undefined) { delete e.changes; parts.push('changes recorded'); }
      else if (v.changes === 'not recorded' && e.changes !== 'not recorded') { e.changes = 'not recorded'; parts.push('changes not recorded'); }
      else if (v.changes !== undefined && v.changes !== null && v.changes !== 'not recorded') bad('changes must be "not recorded" or null');
      const notes = logNotes(v.notes);
      if (notes.length) { e.notes = (Array.isArray(e.notes) ? e.notes : []).concat(notes).slice(-LOG_NOTES_MAX); parts.push(`${notes.length} note${notes.length === 1 ? '' : 's'}`); }
      return parts.length ? `log turn ${e.turn}: ${parts.join(', ')}` : null;
    });
    /* Upgrade version 8 ("An arc"): { town (the town data), seeds?: [{ seedId,
       effects }] }. The game's town copy gains the calendar, events and
       epilogue it lacks; rumours (tellerIds, threadId) and threads (reward),
       in the copy and in the game, gain the fields they lack from the town
       data's record with the same id; the arc's lists (news, bans,
       eventsFired, player.obligations) are made where missing; an unfired
       seed with no effects of its own gets the effects given (a loose end's
       obligation, a grudge's template). Nothing the game has is overwritten,
       except (wave 4, playtest R9) what the town's plans are: each faction
       clock, matched by its label, takes the town data's completion (text,
       effects, requires, alt) and, while nothing is filled, its segments
       (filled, done and the active clock stay); an unfired seed matched by
       id takes its requires and alt, and its effects when it has none. An
       older game's clocks then check the town before they land ("if the vote
       has already been taken, something else happens instead").
       result.arc counts what was filled. */
    one('arcFill', v => {
      if (!isObj(v)) bad('must be an object');
      const T = isObj(v.town) ? v.town : null;
      const out = { town: [], rumours: 0, threads: 0, defaults: [], seeds: 0, plans: 0 };
      const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const plans = (factions, from) => {
        let k = 0;
        for (const f of Array.isArray(factions) ? factions : []) {
          const tf = isObj(f) && Array.isArray(from) ? from.find(x => isObj(x) && x.id === f.id) : null;
          if (!tf || !Array.isArray(f.clocks) || !Array.isArray(tf.clocks)) continue;
          for (const c of f.clocks) {
            const tc = isObj(c) ? tf.clocks.find(x => isObj(x) && String(x.label || '').toLowerCase() === String(c.label || '').toLowerCase()) : null;
            if (!tc) continue;
            let any = false;
            if (isObj(tc.onComplete) && !same(c.onComplete, tc.onComplete)) { c.onComplete = deepCopy(tc.onComplete); any = true; }
            if (!(c.filled | 0) && c.done !== true && Number.isInteger(tc.segments) && c.segments !== tc.segments) { c.segments = tc.segments; any = true; }
            if (any) k += 1;
          }
        }
        return k;
      };
      const seedRules = (seeds, from) => {
        let k = 0;
        for (const sd of Array.isArray(seeds) ? seeds : []) {
          const ts = isObj(sd) && !sd.fired && Array.isArray(from) ? from.find(x => isObj(x) && x.id === sd.id) : null;
          if (!ts) continue;
          let any = false;
          for (const key of ['requires', 'alt']) if (ts[key] !== undefined && !same(sd[key], ts[key])) { sd[key] = deepCopy(ts[key]); any = true; }
          // Its words as the town now writes them (wave 5, the round-4 playtest: an older save kept "catches you alone").
          if (typeof ts.effect === 'string' && ts.effect.trim() && ts.effect !== sd.effect) { sd.effect = ts.effect; any = true; }
          if (Array.isArray(ts.effects) && ts.effects.length && !(Array.isArray(sd.effects) && sd.effects.length)) { sd.effects = deepCopy(ts.effects); any = true; }
          if (any) k += 1;
        }
        return k;
      };
      const fill = (list, from, keys) => {
        if (!Array.isArray(list) || !Array.isArray(from)) return 0;
        let k = 0;
        for (const x of list) {
          const src = isObj(x) ? from.find(y => isObj(y) && y.id === x.id) : null;
          if (!src) continue;
          let any = false;
          for (const key of keys) if (x[key] === undefined && src[key] !== undefined) { x[key] = deepCopy(src[key]); any = true; }
          if (any) k += 1;
        }
        return k;
      };
      if (T && isObj(town) && town !== T) {
        for (const k of ['calendar', 'events', 'epilogue']) if (T[k] !== undefined && town[k] === undefined) { town[k] = deepCopy(T[k]); out.town.push(k); }
        fill(town.rumours, T.rumours, ['tellerIds', 'threadId']);
        fill(town.threads, T.threads, ['reward']);
      }
      if (T) {
        out.rumours = fill(s.rumours, T.rumours, ['tellerIds', 'threadId']);
        out.threads = fill(s.threads, T.threads, ['reward']);
        if (isObj(town) && town !== T) { plans(town.factions, T.factions); seedRules(town.seeds, T.seeds); }
        out.plans = plans(s.factions, T.factions) + seedRules(s.seeds, T.seeds);
      }
      const need = (obj, key, label) => { if (isObj(obj) && obj[key] === undefined) { obj[key] = []; out.defaults.push(label); } };
      need(s, 'news', 'news');
      need(s.player, 'obligations', 'obligations');
      need(s, 'bans', 'bans');
      need(s, 'eventsFired', 'events fired');
      for (const x of Array.isArray(v.seeds) ? v.seeds : []) {
        const sd = isObj(x) ? seed(x.seedId) : null;
        if (!sd || sd.fired) continue;
        // A loose end still to come in the words its kind now has (wave 5).
        const words = cleanText(x.effect, 400);
        if (words && words !== sd.effect) { sd.effect = words; out.plans += 1; }
        if (!Array.isArray(x.effects) || (Array.isArray(sd.effects) && sd.effects.length)) continue;
        let list = [];
        try { list = effectList(x.effects, `seed ${sd.id}`); } catch (err) { if (!(err instanceof Reject)) throw err; no(`arcFill.seeds.${sd.id}`, err.message); continue; }
        if (!list.length) continue;
        sd.effects = list;
        out.seeds += 1;
      }
      result.arc = out;
      if (!out.town.length && !out.rumours && !out.threads && !out.defaults.length && !out.seeds && !out.plans) return null;
      return `an arc: town ${out.town.join(', ') || 'unchanged'}; ${out.rumours} rumours, ${out.threads} threads filled; lists ${out.defaults.join(', ') || 'kept'}; ${out.seeds} seeds given effects; ${out.plans} plans as the town writes them`;
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
      // The words change, the feelings do not (wave 26: every track pinned).
      relWrite(n);
      const keep = relNow(n);
      n.memories = list;
      relGuard(n, `setMemories.${n.id}`);
      relPin(n, keep);
      return `${n.id} memories rewritten (${before} -> ${list.length})`;
    });
    /* Wave 30, rules version 9 ("People who remember", Upgrade.peopleRemember;
       the engine's alone): { people: [{ npcId, rel, memories }],
       obligations: [{ id, onMiss?, onMet? }], seeds: [{ seedId, effects }],
       branches: [{ eventId ('epilogue' for the ending), index, when }],
       rumours: [{ id, leverageOver }], records: [{ holder, text, weight,
       mattersTo, status, playerKnows, obligationId? }], heard: [rumour ids]
       }. A person's rel and typed memories are written only when the tracks
       they give read liking exactly the attitude the person has now: the
       update never moves how much anyone likes the player (refused, by
       name, otherwise). The rest is what the town's content now says,
       copied into the save as arcFill does (only what still to come: an open
       obligation, an unfired seed, the council and the ending before they
       happen, for the built-in town only) and what the save already
       implies (the informant's hold on the player; what a rumour heard
       gives the player). result.relFill counts them. */
    one('relFill', v => {
      if (!isObj(v)) bad('must be an object');
      const out = { people: 0, obligations: 0, seeds: 0, branches: 0, rumours: 0, records: 0, heard: 0 };
      const list = k => (Array.isArray(v[k]) ? v[k] : []);
      list('people').forEach((x, i) => run(`relFill.people[${i}]`, () => {
        if (!isObj(x) || !isObj(x.rel)) bad('needs { npcId, rel, memories }');
        const n = needNpc(x.npcId);
        const mems = checkMemories(Array.isArray(x.memories) ? x.memories : [], false);
        relWrite(n);
        const want = n.attitude;
        const rel = Rel.repair(Object.assign({}, n, { rel: deepCopy(x.rel) }), townRec(n.id));
        const tmp = Object.assign({}, n, { rel, memories: mems });
        const c = Rel.recompute(tmp, current.time.day, relCtx());
        if (c.w !== want) bad(`${n.id}: liking would read ${c.w}, not ${want}; the update never moves how much anyone likes the player`);
        n.memories = mems;
        n.rel = Object.assign(rel, c);
        relGuard(n, `relFill.${n.id}`);
        relWrite(n);
        out.people += 1;
        return null;
      }));
      list('obligations').forEach((x, i) => run(`relFill.obligations[${i}]`, () => {
        const o = isObj(x) ? obligationList().find(y => y.id === x.id) : null;
        if (!o || o.status !== 'open') return null;
        if (Array.isArray(x.onMiss)) o.onMiss = effectList(x.onMiss, 'onMiss');
        if (Array.isArray(x.onMet)) o.onMet = effectList(x.onMet, 'onMet');
        out.obligations += 1;
        return `${o.id} does what its loose end now does`;
      }));
      list('seeds').forEach((x, i) => run(`relFill.seeds[${i}]`, () => {
        const sd = isObj(x) ? seed(x.seedId) : null;
        if (!sd || sd.fired || !Array.isArray(x.effects)) return null;
        sd.effects = effectList(x.effects, `seed ${sd.id}`);
        out.seeds += 1;
        return `${sd.id} does what its loose end now does`;
      }));
      const builtIn = s.meta.townName === TOWN_DATA.name && isObj(town) && town !== TOWN_DATA;
      list('branches').forEach((x, i) => run(`relFill.branches[${i}]`, () => {
        if (!builtIn || !isObj(x) || !isObj(x.when) || !Number.isInteger(x.index)) return null;
        const ending = x.eventId === 'epilogue';
        if (ending ? !!s.flags.epilogueShown : (Array.isArray(s.eventsFired) && s.eventsFired.includes(x.eventId))) return null;
        const ev = ending ? town.epilogue : (Array.isArray(town.events) ? town.events.find(e => isObj(e) && e.id === x.eventId) : null);
        const b = isObj(ev) && Array.isArray(ev.branches) ? ev.branches[x.index] : null;
        if (!isObj(b)) return null;
        b.when = deepCopy(x.when);
        out.branches += 1;
        return `${x.eventId} branch ${x.index + 1} reads ${Object.keys(x.when).join(', ')}`;
      }));
      list('rumours').forEach((x, i) => run(`relFill.rumours[${i}]`, () => {
        if (!isObj(x) || typeof x.leverageOver !== 'string') return null;
        needNpc(x.leverageOver);
        let any = false;
        for (const r of [rumour(x.id), builtIn && Array.isArray(town.rumours) ? town.rumours.find(y => isObj(y) && y.id === x.id) : null]) if (isObj(r) && r.leverageOver === undefined) { r.leverageOver = x.leverageOver; any = true; }
        if (any) out.rumours += 1;
        return any ? `${x.id} is leverage over ${x.leverageOver}` : null;
      }));
      list('records').forEach((x, i) => run(`relFill.records[${i}]`, () => {
        if (!isObj(x)) bad('must be an object');
        const holder = needNpc(x.holder);
        if (leverageList().some(r => isObj(r) && r.holder === holder.id && r.over === 'player' && isObj(r.about) && r.about.kind === 'loose_end')) return null;
        const parts = [leverageAdd({ holder: holder.id, over: 'player', about: { kind: 'loose_end' }, text: x.text, weight: x.weight, mattersTo: x.mattersTo, playerKnows: x.playerKnows === true, via: 'loose_end' })];
        const rec = leverageList().filter(r => isObj(r) && r.holder === holder.id && r.over === 'player').pop();
        if (rec && typeof x.status === 'string' && x.status !== 'held') parts.push(leverageSet(Object.assign({ id: rec.id, status: x.status }, x.playerKnows === true ? { playerKnows: true } : {}, typeof x.obligationId === 'string' ? { demand: { obligationId: x.obligationId } } : {})));
        out.records += 1;
        return parts.filter(Boolean).join('; ');
      }));
      list('heard').forEach((id, i) => run(`relFill.heard[${i}]`, () => {
        const r = rumour(id);
        if (!r || !r.heard) return null;
        const line = rumourLeverage(r);
        if (line && !/^no-op/.test(line)) out.heard += 1;
        return line;
      }));
      result.relFill = out;
      return `people who remember: ${out.people} people, ${out.obligations} obligations, ${out.seeds} seeds, ${out.branches} branches, ${out.rumours} rumours, ${out.records + out.heard} records`;
    });
    /* Wave 31 (the engine's alone: State.newGame, and rules version 10's
       Upgrade.townTalks): the ties the town gives (Rel.tiesPlan: both sides
       of every relation, the town's own ties, fellows of a faction) that
       the game lacks, for the people in town; a tie already there is never
       overwritten, and nothing that already happened is spread. The news on
       its way starts empty. result.tiesFill = { added, ties, people }. */
    one('tiesFill', v => {
      if (v !== true && !isObj(v)) bad('must be true');
      const ties = tieMapOf();
      hearsayList();
      const plan = Rel.tiesPlan(relCtx());
      let added = 0;
      for (const k of Object.keys(plan)) if (!isObj(ties[k])) { ties[k] = Object.assign(plan[k], Rel.tieNow(plan[k])); added += 1; }
      const people = new Set();
      for (const k of Object.keys(ties)) for (const id of k.split('>')) people.add(id);
      result.tiesFill = { added, ties: Object.keys(ties).length, people: people.size };
      return added ? `${added} ties made (${Object.keys(ties).length} between ${people.size} people)` : null;
    });
    /* Wave 31, World's step i (the integration plan's 11.3), each tick: {
       day, phase } the tick reached. Each entry on its way that is due
       (Rel.hearsayDue: its night or its morning came) or, for a friend, a
       lover, a rival and the rest, whose two now share a place this phase
       (who is where is worked out once, State.npcsAt for every place) is
       heard: written as Rel.carry plans it (a secondhand memory, everyday,
       a settlement of the copy they hold), or, for someone it happened to
       away from them (own), as their own event, at what hearing it is
       worth. Someone not in town waits; an entry past its expiry goes
       unheard. Nothing goes further (no hop 2), and no Rng is drawn.
       result.hearsay = [{ npcId, aboutId, about }] for the one line World
       makes. A heard entry stays a while, marked deliveredTurn, so /rewind
       can give it back. */
    one('hearsayDeliver', v => {
      if (!isObj(v) || !Number.isInteger(v.day) || !PHASES.includes(v.phase)) bad('needs { day, phase }: the tick it is');
      const q = hearsayList();
      const at = { day: v.day, phase: v.phase };
      const where = {};
      if (q.some(h => isObj(h) && h.via === 'meet' && !h.deliveredTurn)) for (const l of s.locations) for (const x of npcsAt(l.id, v.phase, v.day)) if (!where[x.id]) where[x.id] = l.id;
      const heard = [];
      const parts = [];
      for (const h of q.slice()) {
        if (!isObj(h) || Number.isInteger(h.deliveredTurn)) continue;
        if (Number.isInteger(h.expires) && v.day > h.expires) { q.splice(q.indexOf(h), 1); parts.push(`${h.id} went unheard`); continue; }
        const a = npc(h.npcId);
        if (!a || presenceOf(a) === 'dead') { q.splice(q.indexOf(h), 1); continue; }
        if (!Rel.inTown(a)) continue;
        const met = h.via === 'meet' && !!where[h.npcId] && where[h.npcId] === where[h.aboutId];
        if (!met && !Rel.hearsayDue(h, at)) continue;
        h.deliveredTurn = s.meta.turn;
        let line = null;
        let kind = 'memory';
        if (h.own && isObj(h.ev)) {
          line = socialEvent(Object.assign({}, h.ev, { npcId: a.id }), `hearsayDeliver.${h.id}`, true, { noSpread: true });
          // Wave 32: dated by the telling, as it was when it landed at once (what you told Dewayne on Day 5, heard that night, is Day 5's).
          const late = Number.isInteger(h.day) ? (a.memories || []).filter(m => isObj(m) && m.turn === s.meta.turn && m.event === h.ev.event && Number.isInteger(m.day) && m.day > h.day && (m.leverageId || null) === (h.ev.leverageId || null)) : [];
          for (const m of late) m.day = h.day;
          if (late.length) relWrite(a);
        } else { line = carryTo(a, h, null, Math.min(v.day, s.time.day)); kind = lastCarry; }
        if (line && !/^no-op/.test(line)) {
          parts.push(line);
          // To be told in the feed's one line (what made a memory: a small thing into everyday is no news to tell), at this tick, or what was heard in the night at the morning's.
          if (!isObj(h.settle) && kind === 'memory') h.untold = true;
        }
      }
      // The one line's people: everyone heard and not told yet, unless it is night (the morning tells the night's with its own).
      if (v.phase !== 'night') for (const h of q) if (isObj(h) && h.untold === true) { heard.push({ npcId: h.npcId, aboutId: h.aboutId, about: typeof h.about === 'string' ? h.about : '' }); delete h.untold; }
      // Heard entries keep their place until their expiry has passed (rewind reads them).
      for (let i = q.length - 1; i >= 0; i--) if (isObj(q[i]) && Number.isInteger(q[i].deliveredTurn) && Number.isInteger(q[i].expires) && v.day > q[i].expires && q[i].untold !== true) q.splice(i, 1);
      result.hearsay = heard;
      return parts.length ? parts.join('; ') : null;
    });
    /* Wave 26: tracks set outright ({ npcId, w?, t?, f?, k?, s? }, or a
       list): each lands exactly, in fix (it never drifts). Spark above 0 is
       refused for anyone it cannot move for; a hard person's fear stops at
       Rel.CAPS.hardFear. World.forceAttitude is this. */
    const relSets = val('relSet');
    const relSetOne = (path, x) => run(path, () => {
      if (!isObj(x)) bad('must be an object');
      const n = needNpc(x.npcId);
      const want = relTargets(n, Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'npcId')), 'relSet');
      relWrite(n);
      const before = relNow(n);
      n.rel = Rel.landTo(n, want, 'fix', relCtx());
      relOwed(n, want.owed);
      relWrite(n);
      const moved = relChanges(before, relNow(n), true);
      return moved.length ? `${n.id} set: ${moved.join(', ')}` : null;
    });
    if (Array.isArray(relSets)) relSets.forEach((x, i) => relSetOne(`relSet[${i}]`, x));
    else if (relSets !== undefined) relSetOne('relSet', relSets);
    /* The morning (World step g, every morning): for everyone, a direct
       write to attitude folded in, then (wave 27: fading replaces the old
       drift) the everyday bucket's liking and trust two a day back toward
       0 for someone the player did not see on the day just ended and no
       open loose end ties (Rel.driftStep), then every track recomputed for
       the new day (memories fade by their age). result.drifted counts the
       people whose everyday bucket moved. */
    one('relDay', v => {
      if (!Number.isInteger(v) || v < 1) bad('must be a day number');
      let moved = 0;
      // Fading prints nothing (wave 29: no status line lost or changed overnight).
      relQuiet += 1;
      try {
        for (const n of s.npcs) {
          if (!isObj(n)) continue;
          relWrite(n);
          const step = Rel.driftStep(n, v, s);
          if (step) {
            n.rel.everyday.w = (Number(n.rel.everyday.w) || 0) + step.w;
            n.rel.everyday.t = (Number(n.rel.everyday.t) || 0) + step.t;
            // Wave 35: everyday romance, 1 a day.
            if (step.m) n.rel.everyday.m = (Number(n.rel.everyday.m) || 0) + step.m;
            moved += 1;
          }
          relWrite(n);
          // Wave 30: what faded overnight is where the turn's feed lines start from (fading prints nothing).
          if (Object.prototype.hasOwnProperty.call(ledger.touched, n.id) && isObj(n.rel.bands)) ledger.touched[n.id] = Object.assign({}, n.rel.bands);
        }
      } finally { relQuiet -= 1; }
      result.drifted = moved;
      return moved ? `attitudes drift for ${moved} people` : null;
    });
    /* Wave 27: time spent with people. { aimed: [ids], quiet: [ids] }
       (Pipeline, after the bookkeeper's apply or on its own when it
       failed): each the turn's words or social action were aimed at, here,
       learns the player a little (knows +1 a turn, at most
       Rel.CAPS.kPerDayAimed a day), and the phase is marked as one spent
       with them (rel.today.with), unless this turn already moved them
       (quiet: an event, a liking change, an ask of theirs that failed).
       { ended: { day, phase } } (World's tick, as a phase ends): everyone
       that phase was spent with takes spent_time, once a day, unless the
       player hurt them that day. */
    one('relTurn', v => {
      if (!isObj(v)) bad('must be an object');
      const aimed = (Array.isArray(v.aimed) ? v.aimed : []).filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i);
      const quiet = Array.isArray(v.quiet) ? v.quiet : [];
      const parts = [];
      const day = s.time.day;
      const hurtOn = (n, d) => (n.memories || []).some(m => isObj(m) && m.day === d && !m.witness && Rel.harmful(m));
      for (const id of aimed) {
        const n = npc(id);
        if (!n || presenceOf(n) === 'dead') continue;
        relWrite(n);
        const r = n.rel;
        if (!isObj(r.today) || r.today.day !== day) r.today = { day, turn: s.meta.turn, ev: {} };
        const k = r.today.kAimed | 0;
        if (k < Rel.CAPS.kPerDayAimed) { r.today.kAimed = k + 1; r.everyday.k = clamp((Number(r.everyday.k) || 0) + 1, 0, 100); r.today.turn = s.meta.turn; parts.push(`${id} knows the player a little better`); }
        if (!quiet.includes(id) && !hurtOn(n, day)) r.today.with = s.time.phase;
        relWrite(n);
      }
      if (isObj(v.ended) && Number.isInteger(v.ended.day) && PHASES.includes(v.ended.phase)) {
        for (const n of s.npcs) {
          const r = isObj(n) && isObj(n.rel) ? n.rel : null;
          if (!r || !isObj(r.today) || r.today.day !== v.ended.day || r.today.with !== v.ended.phase || presenceOf(n) === 'dead') continue;
          delete r.today.with;
          if ((r.today.ev && r.today.ev.spent_time) | 0 || hurtOn(n, v.ended.day)) continue;
          parts.push(socialEvent({ npcId: n.id, event: 'spent_time', text: `spent time with ${p.name}` }, 'relTurn'));
        }
      }
      return parts.length ? parts.join('; ') : null;
    });
    /* Wave 27: the ask log ({ npcId, act, ok, about }, or a list): what the
       player tried on someone (a lie, a theft, a search, an attack: the
       parse's), kept on their rel.asks (Rel.CAPS.asks, turn-stamped, so
       /rewind strikes it) for the bookkeeper's preconditions (wave 28). A
       clean theft nobody saw is only this. */
    const ASK_ACTS = ['deceive', 'steal', 'search', 'attack', 'sneak'];
    const asks = val('relAsk');
    const askOne = (path, x) => run(path, () => {
      if (!isObj(x)) bad('must be an object');
      const n = needNpc(x.npcId);
      if (!ASK_ACTS.includes(x.act)) bad(`act must be one of ${ASK_ACTS.join(', ')}`);
      if (typeof x.ok !== 'boolean') bad('ok must be true or false');
      relWrite(n);
      const entry = { turn: s.meta.turn, day: s.time.day, act: x.act, ok: x.ok, about: cleanText(x.about, 120) };
      n.rel.asks = (Array.isArray(n.rel.asks) ? n.rel.asks : []).concat([entry]).slice(-Rel.CAPS.asks);
      return `${n.id} asks: ${x.act} ${x.ok ? 'worked' : 'failed'}${entry.about ? ` (${entry.about})` : ''}`;
    });
    if (Array.isArray(asks)) asks.forEach((x, i) => askOne(`relAsk[${i}]`, x));
    else if (asks !== undefined) askOne('relAsk', asks);
    /* Wave 29: the secrets the narrator was given this turn ([{ npcId, how
       }], Pipeline's secretsFor: known.secrets) and a leverage record made
       by the engine (a record, or a list: leverageAdd above). */
    const shown = val('secretShown');
    if (Array.isArray(shown)) shown.forEach((x, i) => run(`secretShown[${i}]`, () => secretShown(x)));
    else if (shown !== undefined) run('secretShown', () => secretShown(shown));
    const levs = val('leverageAdd');
    if (Array.isArray(levs)) levs.forEach((x, i) => run(`leverageAdd[${i}]`, () => leverageAdd(x)));
    else if (levs !== undefined) run('leverageAdd', () => leverageAdd(levs));
    /* Wave 27: a grudge come due (World's fire): { npcId, key | mark, by:
       'got_even' }. The memory it grew from (its key, or the feeling's mark
       World.feelingMark) is softened by getting even (Rel.SETTLE.got_even:
       0.4 of its liking, turn-stamped); a line that moves nothing, or one
       no longer held, gives today's +10 into everyday instead. */
    one('relSettle', v => {
      if (!isObj(v)) bad('must be an object');
      const n = needNpc(v.npcId);
      if (v.by !== 'got_even') bad('by must be got_even');
      if (presenceOf(n) === 'dead') return `no-op: ${n.id} is dead`;
      const list = Array.isArray(n.memories) ? n.memories : [];
      const i = list.findIndex(m => isObj(m) && ((typeof v.key === 'string' && v.key && m.key === v.key) || (typeof v.mark === 'string' && v.mark && World.feelingMark(m) === v.mark)));
      relWrite(n);
      if (i >= 0 && isObj(list[i].d)) {
        const r = Rel.settle(n, i, 'got_even', relCtx());
        if (r.ok) {
          const before = n.attitude;
          n.memories = r.memories;
          relWrite(n);
          return `${n.id} got even: lets some of "${r.text}" go (${before} -> ${n.attitude})`;
        }
      }
      const [before, after] = likingBy(n, World.GOT_EVEN);
      return `${n.id} got even: ${before} -> ${after}`;
    });
    /* Wave 27: where someone stood before the player came (rel.start; it
       never fades): { npcId, w?, t? (added), k? (at least), owed? (+1:
       they owe the player one, -1: the player owes them), why? }, or a
       list. A loose end tied at character creation (Town) and a story
       point's fact (/fact) write it. */
    const starts = val('relStart');
    const startOne = (path, x) => run(path, () => {
      if (!isObj(x)) bad('must be an object');
      const n = needNpc(x.npcId);
      for (const k of ['w', 't', 'k']) if (x[k] !== undefined && !(Number.isInteger(x[k]) && Math.abs(x[k]) <= 100)) bad(`${k} must be a whole number within +/-100`);
      if (x.owed !== undefined && x.owed !== 1 && x.owed !== -1) bad('owed must be 1 or -1');
      relWrite(n);
      const before = relNow(n);
      const st0 = n.rel.start;
      if (x.w) st0.w = clamp((Number(st0.w) || 0) + x.w, -100, 100);
      if (x.t) st0.t = clamp((Number(st0.t) || 0) + x.t, -100, 100);
      if (Number.isInteger(x.k)) st0.k = Math.max(Number(st0.k) || 0, clamp(x.k, 0, 100));
      if (x.owed) n.rel.owed = (Array.isArray(n.rel.owed) ? n.rel.owed : []).concat([{ dir: x.owed, size: 1, key: `start-${n.id}`, day: s.time.day, turn: s.meta.turn, why: cleanText(x.why, 120) }]).slice(-Rel.CAPS.owedEntries);
      relWrite(n);
      const moved = relChanges(before, relNow(n));
      return `${n.id} as they were: ${moved.join(', ') || 'no change'}${x.owed ? `; owed ${plusMinus(x.owed)}` : ''}`;
    });
    if (Array.isArray(starts)) starts.forEach((x, i) => startOne(`relStart[${i}]`, x));
    else if (starts !== undefined) startOne('relStart', starts);
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
      // An edit prints nothing (wave 29).
      const r = quietly(() => editPerson(raw));
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
  }
  /* Two names for the same thing: the same words, or one inside the other. */
  function sameThing(a, b) {
    const x = String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const y = String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return !!x && !!y && (x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
  }
  /* A faction member's first meeting with the player: their attitude moves
     by the player's reputation with their people / 5, once (repApplied). */
  function meetingRep(n) {
    if (n.repApplied === true || !n.factionId) return [];
    n.repApplied = true;
    const rep = (current.player.reputation || {})[n.factionId] | 0;
    const d = Math.round(rep / 5);
    if (!d) return [];
    // Into everyday, the same number (wave 26: likingBy).
    const [before, after] = likingBy(n, d);
    return [`${n.id} attitude ${before} -> ${after} (what their people think of the player)`];
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

  /* quiet (opts.quiet): a change nothing on screen needs to redraw for (the quiet lines put on their log entry): the listeners are not called. */
  function finish(result, source, quiet) {
    const turn = current ? current.meta.turn : 0;
    for (const r of result.rejected) {
      pushDebug({ turn, kind: 'rejected', source, path: r.path, reason: r.reason });
      console.debug('[State.apply] rejected', r.path, '-', r.reason);
    }
    for (const a of result.applied) pushDebug({ turn, kind: 'applied', source, text: a });
    // Wave 31: a hidden tie found out by what this change did (a rumour heard, a flag, a record) is known from now on.
    if (result.applied.length && current) tiesKnown();
    if (result.applied.length && !quiet) notify();
    return result;
  }
  /* Wave 41: the one way into the debug log, for every module
     (State.pushDebug): at most DEBUG_MAX entries, the oldest go first. */
  function pushDebug(entry) {
    debugLog.push(entry);
    if (debugLog.length > DEBUG_MAX) debugLog.splice(0, debugLog.length - DEBUG_MAX);
  }
  /* A change a listener makes while the listeners run (App puts the turn's
     quiet lines on its log entry through logUpdate, then saves and draws)
     is part of this notification: the listeners run once, in order, and
     the ones after see it. */
  let notifying = false;
  function notify() {
    if (muted || !current) return;
    if (batchDepth > 0) { dirty = true; return; }
    if (notifying) return;
    notifying = true;
    try { for (const fn of listeners) { try { fn(current); } catch (e) { console.error(e); } } } finally { notifying = false; }
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
      meta: { seed: seedValue, turn: 0, createdAt: new Date().toISOString(), townName: t.name, townVersion: 1, lastRollKey: null, rngCalls: 0, rulesVersion: RULES_VERSION, castFixed: true },
      time: { day: 1, phase: 'morning', shorts: 0 },
      flags: { priceMultiplier: 1, weather: '', season: 'spring' },
      player: {
        name, age, background: bg.name, backgroundId: bg.id,
        goal: cleanText(character.goal, 160), flaw: cleanText(character.flaw, 160),
        stats, hp: 10, maxHp: 10, gold: bg.gold | 0,
        inventory: (bg.items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty || 1, notes: i.notes || '' })),
        conditions: [], reputation, storyPoints: 2, locationId: startId, looseEnds: [], obligations: [], progression: []
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
      seen: {},
      news: [],
      bans: [],
      eventsFired: [],
      // Wave 26: who has something on whom (wave 29 fills it), and each secret the player has been shown.
      leverage: [],
      known: { secrets: {} },
      // Wave 31: the town's ties to each other (tiesFill, below) and the news of the player on its way along them.
      ties: {},
      hearsay: []
    };
    undoSwitch();
    current = st;
    town = deepCopy(townData);
    muted = opts.pending === true;
    loaded = null;
    ledger = freshLedger(-1);
    /* The season is the calendar's (review E13). The old random pick still
       draws from the seeded stream, so a seed gives the same world as
       before; it is the season only for a town with no calendar. Weather
       comes from the stream too. */
    const drawn = Rng.pick(SEASONS);
    st.flags.season = calendar() || (town && SEASONS.includes(town.season)) ? season() : drawn;
    st.flags.weather = Tables.weather(st.flags.season);
    // Wave 31: the ties Town's cast gives (Rel.tiesPlan: every relation both ways, the town's own, fellows of a faction), before anything happens. No draw.
    apply({ tiesFill: true }, { quiet: true });
    for (const le of character.looseEnds || []) Town.resolveLooseEnd(le);
    plantHook(bg);
    notify();
    return st;
  }
  /* A background's hook (BACKGROUNDS[].hook: { effect or text, dayOffset?,
     trigger?, npcId?, locationId?, effects?, requires?, alt?, cause? }),
     planted as a hidden seed at creation (origin 'background'). dayOffset
     [a, b] reads as loose ends read it: day numbers counted from day 1,
     never before tomorrow. A number (content's form) means "not before day
     1 + dayOffset": a person or place trigger with 0 may fire on day 1, as
     soon as the player meets them; a day trigger is still never before
     tomorrow. trigger 'day' (the default), 'npc' (npcId) or 'location'
     (locationId), or a { type, value } trigger. {player} and {npc} are
     filled in. Nothing happens for a background without one. */
  function plantHook(bg) {
    const hk = bg && isObj(bg.hook) ? bg.hook : null;
    if (!hk) return null;
    const who = typeof hk.npcId === 'string' ? npc(hk.npcId) : null;
    const vars = { player: current.player.name, playerName: current.player.name };
    if (who) Object.assign(vars, { npc: who.name, npcId: who.id });
    const effect = cleanText(fillTemplate(hk.effect || hk.text || '', vars), 400);
    if (!effect) return null;
    const single = Number.isInteger(hk.dayOffset) && hk.dayOffset >= 0;
    const off = Array.isArray(hk.dayOffset) && hk.dayOffset.length ? hk.dayOffset : single ? [1 + hk.dayOffset] : [2, 4];
    const lo = clamp(toInt(off[0]) || 2, 1, 60);
    const hi = clamp(toInt(off.length > 1 ? off[1] : off[0]) || lo, lo, 60);
    const drawn = Rng.int(lo, hi);
    let day = Math.max(current.time.day + 1, drawn);
    let trigger = { type: 'day', value: day };
    if (isObj(hk.trigger) && typeof hk.trigger.type === 'string') trigger = deepCopy(hk.trigger);
    else if (hk.trigger === 'npc' && who) trigger = { type: 'npc', value: who.id };
    else if (hk.trigger === 'location' && typeof hk.locationId === 'string' && loc(hk.locationId)) trigger = { type: 'location', value: hk.locationId };
    if (trigger.type === 'day') trigger.value = Math.max(current.time.day + 1, toInt(trigger.value) || day);
    else if (single) day = Math.max(current.time.day, drawn);
    const sd = { id: 'seed_bg_' + slugify(String(bg.id).replace(/^bg_/, '')), cause: cleanText(hk.cause, 300) || `Background (${bg.name})`, effect, trigger, fired: false, hidden: true, origin: { kind: 'background' } };
    if (who) sd.origin.npcId = who.id;
    if (trigger.type !== 'day') sd.notBeforeDay = day;
    if (Array.isArray(hk.effects)) sd.effects = fillDeep(hk.effects, vars);
    if (isObj(hk.requires)) sd.requires = deepCopy(hk.requires);
    if (isObj(hk.alt)) sd.alt = fillDeep(hk.alt, vars);
    const r = apply({ effects: [{ op: 'plantSeed', seed: sd }] });
    if (r.rejected.length) console.warn('[State] background hook not planted', r.rejected);
    return r.rejected.length ? null : sd.id;
  }
  function commit() { muted = false; notify(); }
  function clear() { undoSwitch(); current = null; town = null; muted = false; loaded = null; relFeed.length = 0; }
  /* A save's shape, checked deep before anything loads it (review R3, R4):
     returns [] or a list holding the first problem. Every person, place,
     faction, thread, seed and rumour is an object with a string id (people,
     places and factions a name too), every carried thing an object with an
     id and a name, and no string is longer than the game ever writes one: a
     history 400, a log narration 6,000, anything else 4,000. With town data,
     its history and setting may be 8,000. */
  const SHAPE_MAX = Object.freeze({ text: 4000, history: 400, narration: 6000, townText: 8000 });
  function longString(v, path, depth, capOf) {
    if (typeof v === 'string') { const cap = capOf(path); return v.length > cap ? `${path.join('.') || 'text'} is longer than ${cap} characters` : null; }
    if (depth > 40) return `${path.join('.')} is nested too deep`;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { const e = longString(v[i], path.concat(String(i)), depth + 1, capOf); if (e) return e; } return null; }
    if (isObj(v)) { for (const k of Object.keys(v)) { const e = longString(v[k], path.concat(k), depth + 1, capOf); if (e) return e; } }
    return null;
  }
  function shapeProblem(st) {
    if (!isObj(st)) return 'state is not an object';
    if (st.version !== 1) return 'unsupported state version';
    if (!isObj(st.meta) || !Number.isFinite(st.meta.seed)) return 'meta.seed missing';
    if (!isObj(st.time) || !PHASES.includes(st.time.phase) || !Number.isInteger(st.time.day)) return 'time missing';
    if (!isObj(st.player) || !isObj(st.player.stats)) return 'player missing';
    for (const k of ['locations', 'npcs', 'factions', 'threads', 'seeds', 'rumours', 'log', 'chronicle', 'journal']) {
      if (!Array.isArray(st[k])) return `${k} missing`;
    }
    const named = { npcs: 'person', locations: 'place', factions: 'faction' };
    for (const k of ['npcs', 'locations', 'factions', 'threads', 'seeds', 'rumours']) {
      for (let i = 0; i < st[k].length; i++) {
        const x = st[k][i];
        if (!isObj(x) || typeof x.id !== 'string' || !x.id) return `${k}[${i}] is not a record with an id`;
        if (named[k] && typeof x.name !== 'string') return `${k}[${i}] (${x.id}) has no name`;
      }
    }
    for (const l of st.locations) if (l.items !== undefined && (!Array.isArray(l.items) || l.items.some(i => !isObj(i) || typeof i.id !== 'string' || typeof i.name !== 'string'))) return `${l.id}: the things there are not a list of items`;
    const inv = st.player.inventory;
    if (!Array.isArray(inv)) return 'player.inventory is not a list';
    for (let i = 0; i < inv.length; i++) if (!isObj(inv[i]) || typeof inv[i].id !== 'string' || typeof inv[i].name !== 'string') return `player.inventory[${i}] is not an item with an id and a name`;
    if (st.player.conditions !== undefined && (!Array.isArray(st.player.conditions) || st.player.conditions.some(c => !isObj(c)))) return 'player.conditions is not a list of conditions';
    for (const [k, v] of [['player.obligations', st.player.obligations], ['player.looseEnds', st.player.looseEnds], ['news', st.news], ['bans', st.bans], ['dueEvents', st.dueEvents], ['visits', st.visits]]) {
      if (v !== undefined && (!Array.isArray(v) || v.some(x => !isObj(x)))) return `${k} is not a list of records`;
    }
    if (st.eventsFired !== undefined && (!Array.isArray(st.eventsFired) || st.eventsFired.some(x => typeof x !== 'string'))) return 'eventsFired is not a list of ids';
    if (!st.locations.some(l => l.id === st.player.locationId)) return 'player location unknown';
    const typed = typeProblem(st);
    if (typed) return typed;
    return longString(st, [], 0, path => {
      const k = path[path.length - 1];
      if (path[0] === 'log' && k === 'narration') return SHAPE_MAX.narration;
      return k === 'history' ? SHAPE_MAX.history : SHAPE_MAX.text;
    });
  }
  /* Every field the engine reads has the type it reads it as (playtest B12,
     B13): lists are lists, records are records, numbers are finite numbers
     (a number written as text, "140", is read as the number at load:
     coerceNumbers), ids name something that exists. The first problem, or
     null. */
  const NUMERIC = /^\s*-?\d+(\.\d+)?\s*$/;
  function numberLike(v) { return (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && NUMERIC.test(v)); }
  function typeProblem(st) {
    const p = st.player;
    for (const k of ['gold', 'hp', 'maxHp', 'storyPoints']) if (p[k] !== undefined && !numberLike(p[k])) return `player.${k} is not a number`;
    if (!numberLike(p.gold) || !numberLike(p.hp) || !numberLike(p.maxHp)) return 'player.gold, hp or maxHp missing';
    for (const k of STATS) if (p.stats[k] !== undefined && !numberLike(p.stats[k])) return `player.stats.${k} is not a number`;
    if (typeof p.name !== 'string' || !p.name.trim()) return 'player.name missing';
    if (st.time.shorts !== undefined && !numberLike(st.time.shorts)) return 'time.shorts is not a number';
    // Wave 3 (review bug 9): every other number the engine counts with is a number too (text that reads as one is converted at load).
    for (const k of ['turn', 'rngCalls']) if (st.meta[k] !== undefined && st.meta[k] !== null && !numberLike(st.meta[k])) return `meta.${k} is not a number`;
    const thingNumbers = (list, where) => {
      for (const it of Array.isArray(list) ? list : []) for (const k of ['qty', 'price']) if (isObj(it) && it[k] !== undefined && it[k] !== null && !numberLike(it[k])) return `${where}: ${it.id}'s ${k} is not a number`;
      return null;
    };
    const invBad = thingNumbers(p.inventory, 'player.inventory');
    if (invBad) return invBad;
    for (const l of st.locations) { const bad = thingNumbers(l.items, l.id); if (bad) return bad; }
    for (const b of Array.isArray(st.bans) ? st.bans : []) if (!numberLike(b.untilDay)) return `bans: ${b.locationId} has no day it ends`;
    for (const c of Array.isArray(p.conditions) ? p.conditions : []) if (isObj(c) && c.untilDay !== undefined && c.untilDay !== null && !numberLike(c.untilDay)) return `player.conditions: ${c.name}'s untilDay is not a day`;
    const npcIds = new Set(st.npcs.map(n => n.id));
    const idList = (v, known) => Array.isArray(v) && v.every(x => typeof x === 'string' && (!known || known.has(x)));
    for (const l of st.locations) {
      if (!idList(l.exits)) return `${l.id}: exits is not a list of places`;
      if (l.npcIdsBySchedule !== undefined) {
        if (!isObj(l.npcIdsBySchedule)) return `${l.id}: npcIdsBySchedule is not a record`;
        for (const ph of Object.keys(l.npcIdsBySchedule)) if (!idList(l.npcIdsBySchedule[ph])) return `${l.id}: the ${ph} schedule is not a list of people`;
      }
      if (l.closed !== undefined && typeof l.closed !== 'boolean') return `${l.id}: closed is not true or false`;
      if (l.closedOn !== undefined && !idList(l.closedOn)) return `${l.id}: closedOn is not a list of days`;
    }
    for (const n of st.npcs) {
      if (n.attitude !== undefined && !numberLike(n.attitude)) return `${n.id}: attitude is not a number`;
      if (n.memories !== undefined && (!Array.isArray(n.memories) || n.memories.some(m => !isObj(m) || typeof m.text !== 'string' || (m.weight !== undefined && !numberLike(m.weight))))) return `${n.id}: memories is not a list of memories`;
      if (n.tags !== undefined && !idList(n.tags)) return `${n.id}: tags is not a list of words`;
      if (n.relations !== undefined && (!Array.isArray(n.relations) || n.relations.some(r => !isObj(r) || typeof r.npcId !== 'string'))) return `${n.id}: relations is not a list of ties`;
      if (n.home !== undefined && n.home !== null && (!isObj(n.home) || typeof n.home.locationId !== 'string')) return `${n.id}: home is not a place`;
      if (n.status !== undefined && typeof n.status !== 'string') return `${n.id}: status is not a word`;
      if (n.hurtUntilDay !== undefined && !Number.isInteger(n.hurtUntilDay)) return `${n.id}: hurtUntilDay is not a day`;
      // Wave 26: how they feel (rel) and what a typed memory did (d, settled).
      const relBad = relProblem(n.rel);
      if (relBad) return `${n.id}: ${relBad}`;
      for (const m of Array.isArray(n.memories) ? n.memories : []) {
        if (m.d !== undefined && m.d !== null && (!isObj(m.d) || Object.values(m.d).some(v => !numberLike(v)))) return `${n.id}: a memory's d is not a record of numbers`;
        if (m.settled !== undefined && (!Array.isArray(m.settled) || m.settled.some(x => !isObj(x)))) return `${n.id}: a memory's settled is not a list of records`;
      }
    }
    if (st.leverage !== undefined && (!Array.isArray(st.leverage) || st.leverage.some(x => !isObj(x)))) return 'leverage is not a list of records';
    if (st.known !== undefined && (!isObj(st.known) || (st.known.secrets !== undefined && !isObj(st.known.secrets)))) return 'known is not a record of secrets';
    // Wave 31: the ties ({ "a>b": tie }) and the news on its way.
    if (st.ties !== undefined && (!isObj(st.ties) || Object.values(st.ties).some(x => !isObj(x) || (x.log !== undefined && !Array.isArray(x.log))))) return 'ties is not a record of ties';
    if (st.hearsay !== undefined && (!Array.isArray(st.hearsay) || st.hearsay.some(x => !isObj(x)))) return 'hearsay is not a list of records';
    for (const f of st.factions) {
      if (f.clocks !== undefined && (!Array.isArray(f.clocks) || f.clocks.some(c => !isObj(c) || !numberLike(c.segments) || !numberLike(c.filled)))) return `${f.id}: clocks is not a list of clocks`;
      if (f.activeClock !== undefined && !Number.isInteger(f.activeClock)) return `${f.id}: activeClock is not a number`;
    }
    for (const t of st.threads) if (t.linkedIds !== undefined && !idList(t.linkedIds)) return `${t.id}: linkedIds is not a list of ids`;
    for (const sd of st.seeds) {
      if (sd.trigger !== undefined && !isObj(sd.trigger)) return `${sd.id}: trigger is not a record`;
      if (sd.effects !== undefined && (!Array.isArray(sd.effects) || sd.effects.some(e => !isObj(e)))) return `${sd.id}: effects is not a list of effects`;
    }
    for (const r of st.rumours) if (typeof r.text !== 'string') return `${r.id}: the rumour has no text`;
    for (const o of Array.isArray(p.obligations) ? p.obligations : []) {
      if (typeof o.id !== 'string' || !OBLIGATION_KINDS.includes(o.kind)) return 'player.obligations: an obligation without an id or a known kind';
      if (!npcIds.has(o.npcId)) return `${o.id}: npcId "${o.npcId}" is nobody in this game`;
      for (const k of ['owedTo', 'askerId']) if (o[k] !== undefined && o[k] !== null && !npcIds.has(o[k])) return `${o.id}: ${k} "${o[k]}" is nobody in this game`;
      if (o.missText !== undefined && o.missText !== null && typeof o.missText !== 'string') return `${o.id}: missText is not text`;
      if (!['open', 'met', 'missed'].includes(o.status)) return `${o.id}: status is not open, met or missed`;
      for (const k of ['dueDay', 'amount', 'paid']) if (o[k] !== undefined && o[k] !== null && !Number.isInteger(o[k])) return `${o.id}: ${k} is not a whole number`;
      for (const k of ['onMiss', 'onMet']) if (o[k] !== undefined && (!Array.isArray(o[k]) || o[k].some(e => !isObj(e)))) return `${o.id}: ${k} is not a list of effects`;
    }
    for (const e of Array.isArray(st.dueEvents) ? st.dueEvents : []) if (typeof e.seedId !== 'string' || typeof e.text !== 'string') return 'dueEvents: an event without a seed or text';
    for (const v of Array.isArray(st.visits) ? st.visits : []) if (typeof v.npcId !== 'string' || typeof v.locationId !== 'string') return 'visits: a visit by nobody or to nowhere';
    for (const n of Array.isArray(st.news) ? st.news : []) if (typeof n.text !== 'string') return 'news: an item without text';
    for (const c of p.conditions || []) if (typeof c.name !== 'string') return 'player.conditions: a condition without a name';
    for (const e of st.log) if (!isObj(e)) return 'log: an entry that is not a record';
    return null;
  }
  /* A person's rel (wave 26), when there is one: a record whose buckets
     are records of numbers, whose lists are lists of records, and whose
     cached tracks are numbers. The first problem, or null. */
  function relProblem(r) {
    if (r === undefined) return null;
    if (!isObj(r)) return 'rel is not a record';
    for (const k of ['start', 'everyday', 'fix', 'days', 'bands']) {
      if (r[k] === undefined) continue;
      if (!isObj(r[k])) return `rel.${k} is not a record`;
      if (k !== 'bands' && Object.values(r[k]).some(v => !numberLike(v))) return `rel.${k} is not a record of numbers`;
    }
    if (r.today !== undefined && r.today !== null && !isObj(r.today)) return 'rel.today is not a record';
    for (const k of ['recent', 'asks', 'owed']) if (r[k] !== undefined && (!Array.isArray(r[k]) || r[k].some(x => !isObj(x)))) return `rel.${k} is not a list of records`;
    for (const k of ['w', 't', 'f', 'k', 's', 'm', 'net', 'levFear']) if (r[k] !== undefined && !numberLike(r[k])) return `rel.${k} is not a number`;
    return null;
  }
  /* Numbers written as text ("140") read as numbers, once a save has passed
     typeProblem (load). */
  function coerceNumbers(s) {
    const num = (o, k) => { if (o && typeof o[k] === 'string' && NUMERIC.test(o[k])) o[k] = Number(o[k]); };
    for (const k of ['gold', 'hp', 'maxHp', 'storyPoints']) num(s.player, k);
    for (const k of STATS) num(s.player.stats, k);
    num(s.time, 'shorts');
    num(s.meta, 'turn');
    num(s.meta, 'rngCalls');
    num(s.player, 'age');
    for (const it of s.player.inventory || []) { num(it, 'qty'); num(it, 'price'); }
    for (const l of s.locations) for (const it of Array.isArray(l.items) ? l.items : []) { num(it, 'qty'); num(it, 'price'); }
    for (const b of Array.isArray(s.bans) ? s.bans : []) num(b, 'untilDay');
    for (const c of Array.isArray(s.player.conditions) ? s.player.conditions : []) num(c, 'untilDay');
    for (const n of s.npcs) { num(n, 'attitude'); num(n, 'age'); for (const m of n.memories || []) num(m, 'weight'); }
    // Wave 26: the tracks, their buckets, and what a typed memory did.
    for (const n of s.npcs) {
      const r = isObj(n.rel) ? n.rel : null;
      if (r) {
        for (const k of ['w', 't', 'f', 'k', 's', 'm', 'net', 'levFear']) num(r, k);
        for (const b of ['start', 'everyday', 'fix', 'days']) if (isObj(r[b])) for (const k of Object.keys(r[b])) num(r[b], k);
      }
      for (const m of n.memories || []) {
        if (isObj(m.d)) for (const k of Object.keys(m.d)) num(m.d, k);
        for (const x of Array.isArray(m.settled) ? m.settled : []) for (const k of ['w', 't', 'f']) num(x, k);
      }
    }
    for (const f of s.factions) for (const c of f.clocks || []) { num(c, 'segments'); num(c, 'filled'); }
  }
  /* The town copy a save carries is read the same way: its people and
     places records with ids (and the places' exits and schedules lists),
     its events records with an id, a day and their branches lists. */
  function townTypeProblem(t) {
    for (const k of ['npcs', 'locations', 'factions', 'threads', 'seeds', 'rumours', 'events']) {
      if (t[k] === undefined) continue;
      if (!Array.isArray(t[k])) return `the town's ${k} is not a list`;
      for (let i = 0; i < t[k].length; i++) if (!isObj(t[k][i]) || typeof t[k][i].id !== 'string' || !t[k][i].id) return `the town's ${k}[${i}] is not a record with an id`;
    }
    for (const l of t.locations || []) {
      if (l.exits !== undefined && (!Array.isArray(l.exits) || l.exits.some(x => typeof x !== 'string'))) return `the town's ${l.id}: exits is not a list`;
      if (l.npcIdsBySchedule !== undefined && (!isObj(l.npcIdsBySchedule) || Object.values(l.npcIdsBySchedule).some(v => !Array.isArray(v)))) return `the town's ${l.id}: npcIdsBySchedule is not a record of lists`;
    }
    for (const n of t.npcs || []) if (n.relations !== undefined && !Array.isArray(n.relations)) return `the town's ${n.id}: relations is not a list`;
    for (const e of t.events || []) {
      if (!Number.isInteger(e.day)) return `the town's event ${e.id}: day is not a day number`;
      if (e.branches !== undefined && (!Array.isArray(e.branches) || e.branches.some(b => !isObj(b)))) return `the town's event ${e.id}: branches is not a list`;
      if (e.attendees !== undefined && (!Array.isArray(e.attendees) || e.attendees.some(x => typeof x !== 'string'))) return `the town's event ${e.id}: attendees is not a list of people`;
    }
    for (const k of ['epilogue', 'calendar', 'map']) if (t[k] !== undefined && t[k] !== null && !isObj(t[k])) return `the town's ${k} is not a record`;
    if (isObj(t.epilogue) && t.epilogue.branches !== undefined && !Array.isArray(t.epilogue.branches)) return "the town's epilogue: branches is not a list";
    return null;
  }
  function townProblem(t) {
    if (!isObj(t)) return 'the town is not an object';
    for (const k of ['locations', 'npcs']) if (t[k] !== undefined && !Array.isArray(t[k])) return `the town's ${k} is not a list`;
    const typed = townTypeProblem(t);
    if (typed) return typed;
    return longString(t, ['town'], 0, path => {
      const k = path[path.length - 1];
      if (path.length === 2 && (k === 'history' || k === 'setting')) return SHAPE_MAX.townText;
      return k === 'history' ? SHAPE_MAX.history : SHAPE_MAX.text;
    });
  }
  function validateShape(st, townData) {
    const problem = shapeProblem(st) || (townData !== undefined && townData !== null ? townProblem(townData) : null);
    return problem ? [problem] : [];
  }
  /* Load a save (its state and its own copy of the town). Returns
     { state, rulesVersion, newer }: newer when the save was made by a later
     build than this one (meta.rulesVersion above RULES_VERSION): it loads,
     and the UI can say so. */
  function load(st, townData) {
    const errs = validateShape(st, townData);
    if (errs.length) throw new Error(errs.join('; '));
    const s = deepCopy(st);
    coerceNumbers(s);
    // Fill fields older saves may lack (no-ops for current saves).
    s.flags = Object.assign({ priceMultiplier: 1, weather: '', season: 'spring' }, s.flags);
    s.time.shorts = s.time.shorts | 0;
    // time.instants is kept only while above 0 (advanceTime); anything else reads as 0.
    if (!(Number.isInteger(s.time.instants) && s.time.instants > 0)) delete s.time.instants;
    if (!Number.isInteger(s.meta.rngCalls)) s.meta.rngCalls = 0;
    if (s.meta.lastRollKey === undefined) s.meta.lastRollKey = null;
    // Wave 43: a cost record of the wrong shape is read field by field (anything not a number of 0 or more is 0).
    if (s.meta.cost !== undefined) { if (isObj(s.meta.cost)) s.meta.cost = costRecord(s.meta.cost); else delete s.meta.cost; }
    if (!Array.isArray(s.player.looseEnds)) s.player.looseEnds = [];
    if (!Array.isArray(s.player.obligations)) s.player.obligations = [];
    if (!Array.isArray(s.news)) s.news = [];
    if (!Array.isArray(s.bans)) s.bans = [];
    if (!Array.isArray(s.eventsFired)) s.eventsFired = [];
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
    // What a thread holds for its news (wave 7) is kept as saved; a value that is not the right shape is dropped (the thread shows what it has).
    const heldOk = { status: v => THREAD_STATUSES.includes(v), summary: v => typeof v === 'string', knownToPlayer: v => typeof v === 'boolean' };
    for (const t of s.threads) {
      if (!isObj(t) || t.pending === undefined) continue;
      if (Array.isArray(t.pending)) for (const x of t.pending) if (isObj(x)) for (const k of PENDING_FIELDS) if (heldKey(x, k) && !heldOk[k](x[k])) delete x[k];
      tidyPending(t);
    }
    // Pronouns, once, for people saved before records carried them.
    fillPronouns(s, townData || TOWN_DATA);
    // The dead are on no schedule (review E14: a clock that killed someone used to leave them there).
    for (const n of s.npcs) {
      if (!isObj(n) || !(n.alive === false || n.status === 'dead')) continue;
      for (const l of s.locations) for (const ph of PHASES) { const sch = l.npcIdsBySchedule; if (isObj(sch) && Array.isArray(sch[ph]) && sch[ph].includes(n.id)) sch[ph] = sch[ph].filter(x => x !== n.id); }
    }
    undoSwitch();
    current = s;
    town = deepCopy(townData || TOWN_DATA);
    /* Wave 26 (Rel), no version bump: the leverage records and the secrets
       shown, empty where a save has none; a person with no rel gets one
       (their start from the save's town copy, liking exactly their
       attitude; their memories move nothing until rules version 9); and
       any spark or (wave 35) romance on someone they cannot move for (an
       import's) is set to 0, and logged; a record from before romance gets
       it at 0 (Rel.repair). Everyone's tracks recomputed for the save's day. */
    if (!Array.isArray(s.leverage)) s.leverage = [];
    if (!isObj(s.known)) s.known = { secrets: {} };
    else if (!isObj(s.known.secrets)) s.known.secrets = {};
    /* Wave 31, no version bump: an older save has no ties and nothing on
       its way (rules version 10 makes the ties; until then nothing travels). */
    if (!isObj(s.ties)) s.ties = {};
    if (!Array.isArray(s.hearsay)) s.hearsay = [];
    // A load prints nothing (wave 29: no status or leverage line for what was already so).
    relQuiet += 1;
    try {
      for (const n of s.npcs) {
        if (!isObj(n)) continue;
        relGuard(n, `load.${n.id}`);
        relWrite(n);
      }
    } finally { relQuiet -= 1; }
    relFeed.length = 0;
    muted = false;
    loaded = { json: JSON.stringify(s), turn: s.meta.turn | 0 };
    ledger = freshLedger(-1);
    notify();
    const rv = rulesVersion(s);
    return { state: current, rulesVersion: rv, newer: rv > RULES_VERSION };
  }
  // ----- the undo and redo stacks (wave 16) -----
  /* Listeners (Storage: the stack kept in IndexedDB; UI: the Undo link's
     count) hear 'switch' before another game takes this one's place (the
     stack is still this game's then), and 'push', 'pop', 'undo', 'redo',
     'join' and 'resume' after the stack changed. */
  function undoChanged(why) { for (const fn of undoListeners) { try { fn(why); } catch (e) { console.error(e); } } }
  function undoSwitch() {
    if (current) undoChanged('switch');
    undo.length = 0;
    redo.length = 0;
    redoKept = null;
    stackGen += 1;
  }
  /* Wave 48: a town copy's version, from its JSON (two 32-bit hashes and
     the length): the key it is kept under, once, in IndexedDB and in
     localStorage (Storage), however many steps and saves use it. */
  function townHash(str) {
    if (typeof str !== 'string') return null;
    let a = 0x811c9dc5;
    let b = 5381;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) + c) | 0; }
    return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${str.length.toString(36)}`;
  }
  /* The game's town copy now as { town (its JSON, the string an entry
     already holds when the same), th (its townHash) }. Wave 48: hashed only
     when it is not the newest entry's (a town changes only with an update
     or an edit), and shared with any entry of that version. */
  function townNow() {
    if (!town) return { town: null, th: null };
    const t = JSON.stringify(town);
    const last = undo[undo.length - 1] || redo[redo.length - 1];
    if (last && last.town === t) return { town: last.town, th: last.th };
    const th = townHash(t);
    const same = undo.find(e => e.th === th) || redo.find(e => e.th === th);
    return { town: same ? same.town : t, th };
  }
  /* The game as it is now, as a stack entry { id, json, town, th, turn }. */
  function entryNow(json) {
    const t = townNow();
    return { id: newEntryId(), json: typeof json === 'string' ? json : JSON.stringify(current), town: t.town, th: t.th, turn: current.meta.turn | 0 };
  }
  // Wave 48: each distinct town version counted once (by th), wherever it is in the list.
  function stackBytes(list) {
    let b = 0;
    const seen = new Set();
    for (const e of list) {
      b += e.json.length;
      if (typeof e.town !== 'string') continue;
      const k = e.th || e.town;
      if (!seen.has(k)) { seen.add(k); b += e.town.length; }
    }
    return b;
  }
  // At most UNDO_MAX steps and about UNDO_BYTES (the oldest go first; the newest is always kept).
  /* Wave 41: linear. The total is counted once, then each shift takes off
     the oldest entry's bytes. Wave 48: a town version is counted once
     wherever it is in the list (stackBytes), so each version's uses are
     counted and its bytes come off with its last use. */
  function capStack(list) {
    if (list.length > UNDO_MAX) list.splice(0, list.length - UNDO_MAX);
    const uses = new Map();
    let bytes = 0;
    for (const e of list) {
      bytes += e.json.length;
      if (typeof e.town !== 'string') continue;
      const k = e.th || e.town;
      const n = uses.get(k) || 0;
      if (!n) bytes += e.town.length;
      uses.set(k, n + 1);
    }
    while (list.length > 1 && bytes > UNDO_BYTES) {
      const gone = list.shift();
      bytes -= gone.json.length;
      if (typeof gone.town !== 'string') continue;
      const k = gone.th || gone.town;
      const n = uses.get(k) - 1;
      if (n) uses.set(k, n);
      else { uses.delete(k); bytes -= gone.town.length; }
    }
  }
  // An entry back as the game (and its town copy).
  function useEntry(e) {
    const spent = current && isObj(current.meta) ? { id: `${current.meta.createdAt}|${current.meta.seed}`, cost: current.meta.cost } : null;
    current = JSON.parse(e.json);
    // Wave 43: the money is spent: an undo, a redo or a rolled-back turn keeps what the game has cost so far.
    if (spent && isObj(spent.cost) && isObj(current.meta) && `${current.meta.createdAt}|${current.meta.seed}` === spent.id) current.meta.cost = spent.cost;
    if (e.town !== undefined) town = e.town === null ? null : JSON.parse(e.town);
    ledger = freshLedger(-1);
    // An undo or a rolled-back turn prints nothing of what it took back (wave 29).
    relFeed.length = 0;
  }
  /* A snapshot holds the game and the game's copy of the town (an update
     changes the town copy too; review R8), and returns the game's JSON, as
     before, for callers that compare it with State.current. A town copy the
     same as the last snapshot's shares its string. Wave 16: a new step, so
     what /redo could bring back is put aside (redoKept) and comes back only
     if this step is rolled back. */
  function snapshot() {
    if (!current) return null;
    const json = JSON.stringify(current);
    undo.push(entryNow(json));
    capStack(undo);
    redoKept = { json, list: redo.splice(0) };
    undoChanged('push');
    return json;
  }
  /* An ending told right after a turn is one /undo step with that turn
     (wave 5, playtest Q5): the ending's own snapshot is dropped once it is
     told, when it is the newest and a step lies under it. */
  function joinSnapshot(snap) {
    if (undo.length < 2 || undo[undo.length - 1].json !== snap) return false;
    undo.pop();
    undoChanged('join');
    return true;
  }
  /* restore() pops the newest snapshot; restore(snap) restores a given one
     (and drops it from the stack if it is the newest). The town copy comes
     back with it when the stack holds it. Wave 16: restore(snap) of the
     newest step (a rollback) gives back what /redo held before it; a bare
     restore() (/reroll) leaves nothing to redo. /undo is undoSteps. */
  function restore(snap) {
    let entry = null;
    if (snap === undefined) entry = undo.pop() || null;
    else if (undo.length && undo[undo.length - 1].json === snap) entry = undo.pop();
    else entry = undo.slice().reverse().find(e => e.json === snap) || (typeof snap === 'string' && snap ? { json: snap } : null);
    if (!entry || !entry.json) return false;
    useEntry(entry);
    if (snap !== undefined && redoKept && redoKept.json === snap) redo.splice(0, redo.length, ...redoKept.list);
    else if (snap === undefined) redo.length = 0;
    redoKept = null;
    undoChanged('pop');
    notify();
    return true;
  }
  /* /undo N (wave 16): up to n steps back, each one's game put on the redo
     stack first; onStep(json) hears each game passed through (the last is
     the one restored). Returns how many were taken back. */
  function undoSteps(n, onStep) {
    if (!current || muted) return 0;
    let cur = entryNow();
    let k = 0;
    while (k < n && undo.length) { redo.push(cur); cur = undo.pop(); k += 1; if (onStep) onStep(cur.json); }
    if (!k) return 0;
    if (redo.length > UNDO_MAX) redo.splice(0, redo.length - UNDO_MAX);
    useEntry(cur);
    redoKept = null;
    undoChanged('undo');
    notify();
    return k;
  }
  /* /redo N (wave 16): up to n of the steps an undo took back, brought back
     in order, each one's game put on the undo stack first. */
  function redoSteps(n, onStep) {
    if (!current || muted) return 0;
    let cur = entryNow();
    let k = 0;
    while (k < n && redo.length) { undo.push(cur); cur = redo.pop(); k += 1; if (onStep) onStep(cur.json); }
    if (!k) return 0;
    capStack(undo);
    useEntry(cur);
    redoKept = null;
    undoChanged('redo');
    notify();
    return k;
  }
  /* The stack as Storage keeps it (wave 48, v 2): { v, game, turn,
     entries: [{ id, turn, json, th (its town's townHash, null for none) }],
     towns: { th: town JSON } (each version once) }, or null with no game
     (or one not yet begun). */
  function undoRecord() {
    if (!current || muted) return null;
    const towns = {};
    const entries = undo.map(e => {
      const th = typeof e.town === 'string' ? (e.th || townHash(e.town)) : null;
      if (th) towns[th] = e.town;
      return { id: e.id, turn: e.turn, json: e.json, th };
    });
    return { v: 2, game: `${current.meta.createdAt || ''}|${current.meta.seed}`, turn: current.meta.turn | 0, entries, towns };
  }
  /* A stack read back from storage after a load of the autosave (Continue,
     Play here instead): only its steps for this game (the caller checked
     the game; gen: no other game loaded since), up to the turn the game was
     loaded at (a step kept from after it was never saved in the autosave),
     in order; steps at the top that are the game as loaded are dropped
     (nothing to take back), and what was done since the load stays on top.
     Returns how many were added. Wave 48: reads both layouts, v 2 (towns
     by townHash, entries with ids) and wave 16's v 1 (towns a list, t an
     index into it; its entries get ids and hashes here). */
  function resumeUndo(rec, gen) {
    if (gen !== stackGen || !current || muted || !loaded || !isObj(rec) || !Array.isArray(rec.entries)) return 0;
    const v2 = rec.v === 2 && isObj(rec.towns);
    const towns = v2 ? rec.towns : Array.isArray(rec.towns) ? rec.towns : [];
    const hashes = new Map();
    const list = [];
    for (const x of rec.entries) {
      if (!isObj(x) || typeof x.json !== 'string' || !x.json || !Number.isInteger(x.turn) || x.turn > loaded.turn) continue;
      let t = null;
      let th = null;
      if (v2) { if (typeof x.th === 'string' && typeof towns[x.th] === 'string') { t = towns[x.th]; th = x.th; } }
      else if (Number.isInteger(x.t) && typeof towns[x.t] === 'string') {
        t = towns[x.t];
        if (!hashes.has(x.t)) hashes.set(x.t, townHash(t));
        th = hashes.get(x.t);
      }
      list.push({ id: v2 && typeof x.id === 'string' && x.id ? x.id : newEntryId(), json: x.json, town: t, th, turn: x.turn });
    }
    while (list.length && list[list.length - 1].json === loaded.json) list.pop();
    if (!list.length) return 0;
    const merged = list.concat(undo);
    capStack(merged);
    const added = merged.length - undo.length;
    undo.splice(0, undo.length, ...merged);
    undoChanged('resume');
    return added;
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
     current day and phase only, and takes them out of their scheduled one.
     Today's calendar holds too: someone away for the day (awayOn: school)
     is nowhere in those phases, and someone hurt (hurtUntilDay) is at
     home, every phase, until they mend. */
  function npcsAt(locId, phase, onDay) {
    if (!current) return [];
    const l = loc(locId);
    if (!l) return [];
    const ph = phase || current.time.phase;
    // onDay (wave 3): the day a walk lands on (the morning after a night), else today.
    const day = Number.isInteger(onDay) ? onDay : current.time.day;
    const ids = ((l.npcIdsBySchedule && l.npcIdsBySchedule[ph]) || []).slice();
    const visits = (current.visits || []).filter(v => v.day === day && v.phase === ph);
    for (const v of visits) {
      const i = ids.indexOf(v.npcId);
      if (v.locationId === l.id) { if (i < 0) ids.push(v.npcId); } else if (i >= 0) ids.splice(i, 1);
    }
    let out = ids.map(npc).filter(n => n && n.alive && n.status !== 'gone' && n.status !== 'dead' && !laidUp(n, day) && !awayNow(n, ph, day));
    // A place shut today holds only the people who live there, and anyone sent there on purpose (a visit): no customers (playtest B14).
    if (isClosed(l, day)) out = out.filter(n => (isObj(n.home) && n.home.locationId === l.id) || visits.some(v => v.npcId === n.id && v.locationId === l.id));
    for (const n of current.npcs) if (laidUp(n, day) && n.alive !== false && isObj(n.home) && n.home.locationId === l.id && !out.includes(n)) out.push(n);
    return out;
  }
  /* A news item whose due event is still to be told wherever the player is
     (wave 5, the fourth review's risk): a grudge or favour done in public
     is told by its narration (dueNarrated marks its news seen), and only if
     that never comes (its person was arrested first) by "Overnight in
     town". A town event's scene, told only at its place, does not wait. */
  function newsWaits(x) {
    if (!current || !isObj(x) || !x.eventId) return false;
    return (Array.isArray(current.dueEvents) ? current.dueEvents : []).some(d => d.eventId === x.eventId && !(isObj((seed(d.seedId) || {}).trigger) && seed(d.seedId).trigger.type === 'location'));
  }
  /* Wave 27 (design section 2.8): the "feared" tier, for the town: 3 or
     more people in town (alive, free, here) at fear 20 or more. */
  const FEARED_PEOPLE = 3;
  const FEARED_AT = 20;
  function feared() {
    if (!current) return false;
    return current.npcs.filter(n => isObj(n) && n.alive !== false && n.status === 'free' && presenceOf(n) === 'here' && (n.presence === undefined || n.presence === 'here') && isObj(n.rel) && (Number(n.rel.f) || 0) >= FEARED_AT).length >= FEARED_PEOPLE;
  }
  function reputationTier(key) {
    if (!current) return 'unknown';
    const v = current.player.reputation[key || 'town'] || 0;
    // Wave 27: despised first, then feared (the town only), then the rest as before.
    if (v <= -50) return 'despised';
    if ((key || 'town') === 'town' && feared()) return 'feared';
    if (v >= 50) return 'respected';
    if (v >= 20) return 'known';
    if (v <= -20) return 'disliked';
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
    // Town news (CONTRACTS section 5): the live array, oldest first.
    get news() { return current && Array.isArray(current.news) ? current.news : []; },
    RECORD_KEYS, ENGINE_KEYS, LIMITS, LOG_MAX, DEFEAT_OUTCOMES, EFFECT_OPS, RESERVED_FLAGS,
    SEED_ORIGINS, OBLIGATION_KINDS, NPC_FATES, WEEKDAYS, NOT_ACTIONS,
    // Wave 43: the arc (its end day, whether the ending was told, the next town event) and what this game has cost.
    arc, COST_KEYS, cost: () => costRecord(current && current.meta.cost), spend: (v, opts) => apply({ spend: v }, opts),
    season, weekday, dateLine, isClosed, isBanned, priceFactor, restQuality, obligations, tickObligations, missedEventId, expireDaily, goodNamed, goodSource,
    absentNote: absentFor, awayNow, laidUp, isHurt, PROTECTED_MEMORIES, protectedMemory, newsWaits, MEMORY_ACTS,
    // Wave 22: meetings agreed in the story (appointments() the ones still to come, with their words).
    appointments, appointmentWords, appointmentOf,
    // Wave 26: what someone asked of the player in the story (asks() the ones not yet fired, with their words).
    asks, askWords, askOf, askReward, youWords: toYou,
    placeNames, mapPointOf, pathPoints, revealLabel, samePerson, personKey, relationPhrase, relationNote, tiesOf, inCast, castTown, firstName, cleanRelation, splitWho, fillPronouns, homeOf,
    RULES_VERSION, BUILD, buildLine, MEMORY_MAX, MEMORY_TEXT_MAX, EDIT_MAX, AGE_MIN, AGE_MAX, playerAge, rulesVersion, shortMemory, phasePart, clockLine,
    apply, newGame, commit, clear, load, validateShape, snapshot, restore, joinSnapshot, beginBatch, endBatch,
    canUndo: () => undo.length > 0,
    undoDepth: () => undo.length,
    // Wave 16: several steps at once, /redo, and the stack kept in storage.
    UNDO_MAX, UNDO_BYTES, undoSteps, redoSteps, undoRecord, resumeUndo,
    // Wave 41: capStack and stackBytes for tests (capStack works on the list it is given).
    capStack, stackBytes,
    // Wave 48: a town copy's version (Storage keeps each once, in IndexedDB and in localStorage).
    townHash,
    redoDepth: () => redo.length,
    undoBytes: () => stackBytes(undo),
    get undoGen() { return stackGen; },
    onUndo(fn) { undoListeners.push(fn); },
    onChange(fn) { listeners.push(fn); },
    // Wave 41: pushDebug is how every module writes to debugLog (capped at DEBUG_MAX); never debugLog.push.
    debugLog, pushDebug, DEBUG_MAX,
    npc, loc, faction, thread, threadNow, seed, rumour, entityById, npcsAt, reputationTier, attitudeWord,
    // Wave 28: the engine's events this turn ([{ npcId, event }], the bookkeeper's packet reads them).
    turnEvents() { syncLedger(); return (ledger.events || []).map(x => Object.assign({}, x)); },
    /* Wave 29: the obligation statuses (lapsed among them), the quiet lines
       waiting (App prints them after each change: takeFeed), a record by its
       id, and what the player is owed for their silence in words ("Hollis
       Byrd: $300 for keeping quiet, due Day 4 (1 day)"). */
    OBLIGATION_STATUSES, takeFeed, leverageRec: id => (current ? leverageRec(id) : null),
    demandLine(x, day) {
      const n = isObj(x) ? npc(x.npcId) : null;
      if (!n || !Number.isInteger(x.amount)) return '';
      const d = Number.isInteger(day) ? day : current ? current.time.day : 1;
      const left = Number.isInteger(x.dueDay) ? x.dueDay - d : null;
      const when = left === null ? '' : `, due Day ${x.dueDay} (${left > 1 ? `${left} days` : left === 1 ? '1 day' : left === 0 ? 'today' : 'overdue'})`;
      return `${n.name}: ${money(x.amount)} for keeping quiet${when}`;
    },
    /* Wave 30: the feed's ranks and the turn's touched people (App.noteRel),
       and a change that prints no feed line (Upgrade's version 9 runs in
       it). */
    FEED_RANK, relTouched, quietly
  };
})();

