// ===== Module: Pipeline =====
/* The turn loop of SPEC.md section 6. runTurn() does every step for normal
   input and for the commands that narrate (/look /zoom /skip /rest /wait)
   or parse (/fact):
     1 snapshot  2 commands (submit)  3 parse (then walkFirst: a walk and an
     action there moves the player before anything else)  4 check and create  5 resolve
     (a bet at cards: the hand, played at a table in the feed until the
     player draws or folds; gamble)  6 narrate (streamed)  7 style check, one regenerate  8 bookkeep
     9 apply (source 'model'), then reputation drift (World.driftReputation);
     a place someone named (placesRevealed) is credited to whoever the player
     was talking to and gets a quiet "Added to the map" line;
     arriveIfLeftBehind completes a plain move the bookkeeper left out
     10 advance time, World.tick per phase  11 World.fireSeeds (due events
     for the next narration)  12 compressIfDue (a chronicle entry once the
     log holds CHRONICLE_AT entries, keeping the newest CHRONICLE_KEEP)
     13 log, autosave, render
   Any error or refusal restores the snapshot, takes the turn's lines back
   out of the feed and puts the player's text back in the box.
   Do / Say (the composer's toggle; speechFor): a Say turn carries
   ctx.speech = { mode: 'say', to, toName } and its input is the player's
   exact words. The parser hears MODE say, the action is forced social and
   aimed at the addressee (sayAction), nobody moves, the narrator gets
   PLAYER SAYS instead of ACTION, and the log entry keeps mode and addressee.
   A Do turn carries { mode: 'do' }.
   Lifecycle (docs/notes/transport.md): setStatusListener(fn) hears each
   stage (parse, cards, narrate, rewrite, bookkeep, chronicle, idle); abort() is
   the Stop button (the turn fails cleanly, the input goes back; a hand on
   the table is called off with it); once the
   narration is in, acceptsQueue is true and submit() keeps one input to run
   when the turn ends. A bookkeeper that fails keeps the narration: the
   engine's own changes stand, the log entry says changes 'not recorded',
   and the bookkeeper is asked once more in the background. The chronicle
   runs after the turn is logged and saved.
   Wave 42: the town and cast blocks lose what repeats itself (castTies,
   castHistory, the place ids, the NOT IN TOWN head's restatement), so the
   three cached blocks have room under tests/api.test.cjs's budget.
   Wave 53: the bookkeeper's packet marks a minor present ("UNDER 18 (16)",
   minorMark); wave 52 had put the mark in the parser's packet only. */
const Pipeline = (() => {
  const NOTICES = {
    refused: 'The narrator declined that one. Try it another way.',
    refusedBy: {
      narrator: 'The narrator declined that one. Try it another way.',
      parser: 'The parser declined that one. Try it another way.',
      bookkeeper: 'The bookkeeper declined to record this turn, so the story stands but what changed was not recorded.'
    },
    noReroll: 'Nothing to reroll: the last turn had no dice roll.',
    // The card table (wave 11): a hand is final once it is dealt.
    cardsDealt: 'Nothing to reroll: the cards were dealt.',
    // Wave 14 (QA #12): a hand the win cheat ended; the cheat stays spent (only /undo arms it again).
    cardsWon: 'Nothing to reroll: that hand was yours.',
    // Wave 14 (QA #19): another tab took the game over while the chooser was open here.
    chooserVoid: 'Another tab took over; the table is closed here.',
    // Wave 19 (QA D3): what was lost, to the dollar (lost: handLost's words, "the $15 you put in is gone" or "the $1 ante is gone").
    handFolded: lost => `Stopped: a hand on the table is folded, and ${lost}.`,
    handStopped: 'Stopped. The hand stands as it was played, told plainly above.',
    handRefused: 'The narrator declined to tell that hand. It stands as it was played, told plainly above.',
    // Wave 12, L5: no "try again" when there is nothing to try again.
    handUntold: (reached, outcome) => `${reached ? 'The narrator could not be reached' : 'The story could not be written'}. The hand stands: ${outcome}.`,
    handLeftOpen: lost => `The game was closed with a hand on the table, so the hand is folded and ${lost}.`,
    handLeftPlayed: 'The game was closed after this hand was played. It stands as it was played, told plainly above.',
    // Wave 12, L3: a hand dealt in another tab, which this tab took the game over from.
    handOtherOpen: lost => `A hand was left open in another tab, so it is folded here and ${lost}.`,
    handOtherPlayed: 'A hand was played in another tab before this one took over. It stands as it was played, told plainly above.',
    locked: 'You just tried that and it failed. Change something first: a different approach, something to use or offer, another place, or let time pass (/wait or /rest).',
    dead: 'Your story has ended. Load a saved game or start a new one.',
    aborted: 'Stopped. Your action was kept in the box.',
    // Wave 15: Stop at the chooser when there is no line to put back in the box.
    chooserStopped: 'Stopped. Nothing lost.',
    bookFailed: 'What changed this turn could not be recorded yet (the bookkeeper did not answer); the story stands. Trying once more in the background.',
    bookLate: 'What changed on that turn is recorded now.',
    bookStopped: 'Stopped while the town was being updated: the story stands, but what changed this turn was not recorded.',
    unknownPlace: "You don't know where that is yet. Ask around.",
    epilogueEnd: 'This is one ending. You can keep playing.',
    endingStopped: 'Stopped. The ending will be told after your next turn.',
    endingLater: why => `The ending could not be told just now${why ? ` (${why})` : ''}. It will be told after your next turn.`
  };
  /* The status line above the input (ui), one per stage. */
  const STATUS_TEXT = { parse: 'Reading your action…', cards: 'Your hand', choose: "Choose the game: Five-card draw or Texas hold'em. Stop leaves the table (nothing lost).", narrate: 'Writing…', rewrite: 'Rewriting…', bookkeep: 'Updating the town…', chronicle: 'Writing up the story so far…', idle: '' };
  const CONSEQUENCES = {
    might: { name: 'Wrenched shoulder', effect: '-1 might' },
    wits: { name: 'Rattled', effect: '-1 wits' },
    charm: { name: 'Red-faced', effect: '-1 charm' },
    stealth: { name: 'Twisted ankle', effect: '-1 stealth' }
  };
  let busy = false;
  let lastTurn = null;
  /* Wave 28 (the integration plan's 14.5 and 15.3): while Settings ->
     Advanced -> "Keep bookkeeper packets" is on, the last BOOK_TURNS_MAX
     bookkeeper turns of this session, in memory only ({ turn, day, packet,
     reply }), for the Debug view's export: JSONL in the labelled eval's
     input shape, { id, packet, labels: [], note }, the labels left empty
     for labelling by hand and the note saying what the model sent. */
  const BOOK_TURNS_MAX = 200;
  const bookTurns = [];
  function keepBookTurn(turn, packet, reply) {
    let on = false;
    try { on = Storage.settings().keepPackets === true; } catch (e) { on = false; }
    if (!on) return false;
    const s = State.current;
    bookTurns.push({ turn, day: s ? s.time.day : null, packet: String(packet || ''), reply: isObj(reply) ? deepCopy(reply) : reply });
    if (bookTurns.length > BOOK_TURNS_MAX) bookTurns.splice(0, bookTurns.length - BOOK_TURNS_MAX);
    return true;
  }
  const wireLine = e => (isObj(e) ? `${e.npcId} ${e.event || '?'}${e.aboutId ? ` ${e.aboutId}` : ''}${e.private ? ' private' : ''}: ${e.text || ''}` : String(e));
  function bookTurnsJsonl(today) {
    const date = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);
    return bookTurns.map(t => {
      const sent = isObj(t.reply) && Array.isArray(t.reply.socialEvents) ? t.reply.socialEvents.map(wireLine) : [];
      return JSON.stringify({ id: `pt-${date}-t${t.turn}`, packet: t.packet, labels: [], note: sent.length ? `the model sent: ${sent.join(' | ')}` : 'the model sent no events' });
    }).join('\n') + (bookTurns.length ? '\n' : '');
  }
  let turnState = null; // the State.current a running turn or arrival started on
  let acceptsQueue = false; // the narration is in; the bookkeeper or the chronicle is running
  let queued = null; // { text, opts }: one input waiting for the turn to end
  let pendingEpilogue = null; // { text }: an ending in the news, narrated when this turn ends
  let holdEnding = false; // the ending's own turn just failed: it waits for the end of the next turn
  // A narration of time passing (/rest, /wait, /skip, no bookkeeper of its own) tells every due event that is waiting (World.dueSeeds max).
  const DUE_QUIET = Infinity;
  let morningNews = false; // a new morning came this turn: its news is told once the seeds have fired (runTurn step 11)
  let heldNotices = []; // the tick's quiet lines in a turn, printed after the divider (flushNotices)
  let afterEnding = null; // { game, earned, after }: a turn's Resolved lines and recap, held for after the ending it brought (wave 5)
  function flushNotices() { const list = heldNotices; heldNotices = []; for (const t of list) UI.feed.quiet(t); }
  let statusFn = null;
  const idleWaiters = [];
  /* Test and debug hook: force the next d20 (e.g. 20 for a critical). */
  const hooks = { nextD20: null };
  let shownStage = 'idle'; // the last stage told to the status line (a retry's countdown comes back to it)
  function status(stage, message) {
    shownStage = stage;
    if (typeof statusFn !== 'function') return;
    try { statusFn({ stage, message: message === undefined ? (STATUS_TEXT[stage] || '') : message }); } catch (e) { console.error(e); }
  }
  /* Wave 41: while a call waits to try again (a 429 with retry-after, an
     overloaded API), the status line counts it down ("Busy; trying again in
     23 s", stage 'retry'), then goes back to the stage it showed. Stop
     ends the wait like any other cancel. Nothing is shown when no turn
     runs (a background bookkeeper retry). */
  const retryText = secs => `Busy; trying again in ${secs} s`;
  let retryShown = false;
  Api.onWait(ev => {
    if (typeof statusFn !== 'function') return;
    if (ev && Number.isFinite(ev.seconds)) {
      if (shownStage === 'idle' || (!busy && !acceptsQueue)) return;
      retryShown = true;
      try { statusFn({ stage: 'retry', message: retryText(ev.seconds), role: ev.role, seconds: ev.seconds }); } catch (e) { console.error(e); }
    } else if (retryShown) {
      retryShown = false;
      const back = shownStage;
      try { statusFn({ stage: back, message: STATUS_TEXT[back] || '' }); } catch (e) { console.error(e); }
    }
  });
  /* Resolves when no turn is running (at once if none is). */
  function whenIdle() { return busy ? new Promise(resolve => idleWaiters.push(resolve)) : Promise.resolve(); }
  /* A tab that lost the game to another tab (Storage.readOnly) plays
     nothing: no snapshot, no call, nothing saved. Returns the refusal, or
     null when this tab may play. */
  function readOnlyRefusal() {
    let ro = false;
    try { ro = typeof Storage !== 'undefined' && !!Storage.readOnly; } catch (e) { ro = false; }
    if (!ro) return null;
    UI.toast(UI.READ_ONLY_NOTICE);
    return { ok: false, reason: 'read-only', restoreInput: true };
  }

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
  function tieRank(x) { return HOUSEHOLD_RELATIONS.includes(x.relation) ? 0 : familyWord(x.relation) ? 1 : 2; }
  function byRank(list) { return list.map((x, i) => ({ x, i })).sort((a, b) => tieRank(a.x) - tieRank(b.x) || a.i - b.i).map(o => o.x); }
  /* A name in someone's ties, marked so a late wife is never taken for a
     living one: "the late Ruth Haskins", "Dale Purvis [lives elsewhere]". */
  function tieName(n) { const p = presenceOf(n); return p === 'dead' ? `the late ${n.name}` : p === 'away' ? `${n.name} [lives elsewhere]` : n.name; }
  // Wave 47: what n is to others ("wife of Dewayne Mangum"); exported as Pipeline.tieWords. Rel.tieWords is the card's "strained since Day 5".
  function isToWords(n) {
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
  // Wave 42: the head no longer says twice that they are talked about and never seen, nor that each has a line.
  const ABSENT_HEAD = 'NOT IN TOWN (they can be talked about, but they never appear): the dead and the people who live elsewhere.';
  /* "Mavis Mangum (41, she/her" without the closing: the name, then the age and pronouns. */
  function nameHead(n) { const a = ageText(n.age); return `${n.name}${n.unnamed ? ' (no name yet)' : ''} (${a ? `${a}, ` : ''}${pronounLabel(n.pronouns)}`; }
  /* Wave 42: the cast block's ties say a relation once for everyone it
     covers ("boss of Tammy Lott, Lyman Coker and Jodie Strayhorn", "son of
     Vada Sturdivant and the late Harlan Voss"), in the order isToWords has
     them; isToWords itself (Pipeline.tieWords, the parser's packet) is unchanged. */
  function castTies(n) {
    const groups = [];
    for (const x of byRank(State.tiesOf(n).isTo).slice(0, 4)) {
      const rel = x.relation || 'related';
      const g = groups.find(o => o.rel === rel);
      const name = tieName(State.npc(x.id));
      if (g) g.names.push(name); else groups.push({ rel, names: [name] });
    }
    const and = a => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);
    return groups.map(g => `${g.rel} of ${and(g.names)}`).join(', ');
  }
  /* Wave 42: a history follows its person's line without a label, and one
     that opens with the full name the line starts with opens with "He" or
     "She" instead (they/them keep the name: "They has run" would not read). */
  function castHistory(n) {
    const h = String(n.history || '');
    if (!h) return '';
    const p = { he: 'He', she: 'She' }[n.pronouns];
    const rest = h.startsWith(n.name + ' ') ? h.slice(n.name.length + 1) : null;
    return ' ' + (p && rest && /^[a-z]/.test(rest) ? `${p} ${rest}` : h);
  }
  function castBlock(st) {
    const s = st || State.current;
    if (!s) return '';
    const lines = [CAST_HEAD];
    const absent = [];
    for (const n of s.npcs) {
      if (presenceOf(n) !== 'here') { absent.push(n); continue; }
      const parts = [n.role || 'townsfolk'];
      const ties = castTies(n);
      if (ties) parts.push(ties);
      const where = usualPlaces(n, s);
      if (where) parts.push(where);
      if (n.status === 'arrested') parts.push('under arrest, in the cell at the police station');
      lines.push(`${n.id} — ${nameHead(n)}; ${parts.join('; ')})${castHistory(n)}`);
    }
    lines.push(CAST_RULE);
    // The dead and the far away, from their own records; an older game's offstage names that are not records yet, after them.
    const t = State.town && Array.isArray(State.town.offstage) ? State.town : null;
    const off = t ? t.offstage.filter(o => isObj(o) && o.name && !s.npcs.some(n => State.samePerson(n.name, o.name))) : [];
    if (absent.length || off.length) {
      lines.push(ABSENT_HEAD);
      for (const n of absent) {
        const parts = [n.role || 'townsfolk'];
        const ties = castTies(n);
        if (ties) parts.push(ties);
        if (presenceOf(n) === 'dead') parts.push(n.died ? `dead: ${n.died}` : 'dead');
        else {
          parts.push(n.where ? `lives elsewhere: ${n.where}` : 'gone from town');
          if (n.reach) parts.push(`reached by: ${n.reach}`);
        }
        lines.push(`${n.id} — ${nameHead(n)}; ${parts.join('; ')})${castHistory(n)}`);
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
    // Wave 42: places by name alone; the narrator's packets never give it an id.
    if (places.length) lines.push(`PLACES (how each came to be; when it is open): ${places.map(l => `${l.name}: ${[l.history, hours(l.hours)].filter(Boolean).join(' ')}`).join(' | ')}`);
    const away = s.locations.filter(l => l.away === true);
    if (away.length) lines.push(`OUT OF TOWN (talked about, never a scene; the story stays in ${s.meta.townName || 'town'}): ${away.map(l => `${l.name} (${l.distance || 'out of town'}): ${l.history || sentenceOne(l.description)}`).join(' | ')}`);
    // Clocks complete and votes are held after this was written: the message's news is the newer word.
    lines.push(TOWN_NEWER);
    return lines.join('\n');
  }
  const TOWN_NEWER = 'Anything under TOWN NEWS in the message is newer than this and wins.';
  function sentenceOne(text) { return firstSentence(String(text || '')); }
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
  /* The clock moves through State.apply({ advanceTime }). cost is a time
     cost word, or { cost, toPhaseStart?, cause? } (the last long of /wait
     and /skip lands at the start of its phase; a defeat's long is not a
     night without sleep). */
  function advance(cost) { return State.apply({ advanceTime: cost }); }
  /* Town news (World writes state.news through State.apply addNews). */
  function newsList() { return State.news; }
  /* An ending (TOWN_DATA.epilogue) in the news that has not been told: its
     narrator-only turn runs when this turn is over (settle). It is marked
     seen only when that turn commits (newsSeen 'ending'); an ending whose
     narration fails or is stopped stays unseen and is told at the end of
     the next turn. */
  function unseenEnding() { return newsList().find(n => isObj(n) && n.epilogue === true && !n.seen) || null; }
  function noteEnding() {
    const end = unseenEnding();
    if (!end || pendingEpilogue) return;
    pendingEpilogue = { text: cleanText(end.text, 1500), day: end.day };
  }
  /* /undo: an ending noted for after the next turn goes with what it undid (wave 5), and the lines held for it. */
  function forgetEnding() { pendingEpilogue = null; afterEnding = null; }
  /* A new morning: the news the player has not heard yet, as one quiet
     block, then those items are marked seen through the engine (newsSeen
     'public'; an ending is noteEnding's, a private item is never told). */
  function overnightNews() {
    // Not what a due event still to be told will tell (wave 5: a grudge done in public waits for its narration; State.newsWaits).
    const unseen = newsList().filter(n => isObj(n) && n.public !== false && !n.seen && n.epilogue !== true && !State.newsWaits(n));
    if (!unseen.length) return;
    const told = unseen.map(n => cleanText(n.text, 300)).filter(Boolean).slice(-6);
    if (told.length) UI.feed.quiet(`Overnight in town: ${told.join(' ')}`);
    State.apply({ newsSeen: 'public' });
  }
  /* Time passes: State.apply advances the clock, then World.tick runs once
     for every phase that went by, in order (SPEC section 8). A short held at
     night (night holds until the player sleeps: State advanceTime) passes
     no phase, so nothing ticks. A new morning brings the overnight news. */
  function passTime(cost, cause, shown) {
    const s0 = State.current;
    const here = s0 ? s0.player.locationId : null;
    // shown (wave 4, playtest R1): who the narration showed where the player stands (a walk's DESTINATION, in the phase it lands in), else who is here now.
    const wasHere = here && isObj(shown) && shown.locationId === here && Array.isArray(shown.ids) ? shown.ids.slice() : here ? State.npcsAt(here).map(n => n.id) : [];
    // With its cause: the narration of /rest, /wait, /skip, an arrival or a defeat is no instant action (State's pace).
    const spec = cause ? (isObj(cost) ? Object.assign({ cause }, cost) : { cost, cause }) : cost;
    const t = advance(spec).time;
    if (!t || !t.phasesPassed) return t || null;
    let cur = { day: t.from.day, phase: t.from.phase };
    let morning = false;
    for (let i = 0; i < t.phasesPassed; i++) {
      const idx = PHASES.indexOf(cur.phase);
      const next = idx === PHASES.length - 1 ? { day: cur.day + 1, phase: PHASES[0] } : { day: cur.day, phase: PHASES[idx + 1] };
      const res = World.tick({ from: cur, to: next, phasesPassed: 1, step: i + 1, of: t.phasesPassed, cause: cause || 'turn' });
      // Inside a turn the quiet lines wait for the new day's divider (wave 5, playtest Q8): runTurn prints them after it.
      for (const ev of (res && Array.isArray(res.events) ? res.events : [])) if (ev && typeof ev.notice === 'string') { if (turnState === s0) heldNotices.push(ev.notice); else UI.feed.quiet(ev.notice); }
      if (next.phase === PHASES[0]) morning = true;
      cur = next;
    }
    // Who came and went where the player stands: the next narration shows it happening. Measured from who was here
    // when the untold stretch began (wave 3, playtest N9: a /wait over three phases is one start-to-end change, not the last phase's).
    if (here && State.current === s0) {
      const nowHere = State.npcsAt(here).map(n => n.id);
      const ps = s0.pendingScene;
      const base = ps && ps.locationId === here && Array.isArray(ps.before) ? ps.before : wasHere;
      const arrived = nowHere.filter(id => !base.includes(id));
      const left = base.filter(id => !nowHere.includes(id));
      if (arrived.length || left.length || (ps && ps.locationId === here)) State.apply({ sceneChange: { locationId: here, arrived, left, before: base, cause: cause || 'turn' } });
    }
    if (State.current === s0) {
      noteEnding();
      // The morning's news is told at the end of the turn's step 11, so what the
      // dawn brings (a seed that fires on that day) is in it too, not a day late.
      if (morning) { if (turnState === s0) morningNews = true; else overnightNews(); }
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
    const want = itemWords(thing);
    // A gun or a knife (wave 4, playtest R7): what the name is at its head, as Town.weaponOf reads it ("Grease gun" and "Gun oil" are no gun).
    const arm = want.find(w => w === 'gun' || w === 'knife') || (want.some(w => (ITEM_KINDS.gun || []).includes(w)) ? 'gun' : want.some(w => (ITEM_KINDS.knife || []).includes(w)) ? 'knife' : null);
    if (arm) { const w = Town.weaponOf(name); return !!w && (w.kind === arm || (arm === 'knife' && w.kind === 'razor')); }
    const have = itemWords(name);
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
    State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'missingItem', item: a.missingItem, reason: `the player has no ${a.missingItem}: the narrator and the bookkeeper were told it is not carried` });
    return { name: a.missingItem };
  }
  const CANNOT = [[/\b(knife|blade|switchblade|pocketknife|machete|razor)\b/i, 'they cannot stab or cut anyone'], [/\b(gun|pistol|rifle|shotgun|revolver|handgun)\b/i, 'they cannot shoot anyone'], [/\b(car|truck|pickup|van)\b/i, 'they cannot drive anywhere, and if they go somewhere they go on foot'], [/\bkeys?\b/i, 'they cannot unlock anything with one']];
  function notCarriedLine(m) {
    const cant = (CANNOT.find(([re]) => re.test(m.name)) || [null, 'nothing they do this turn can use one'])[1];
    return `NOT CARRIED: ${article(m.name)} ${m.name}. The player has no ${m.name} and nothing like one; ${cant}. Narrate what they can do without it (bare hands, bluff, or realising they have nothing), and nothing happens that needs it.`;
  }
  /* "CARRYING: Folding knife, Dog tags; cash $140 (nothing else: ...)", every
     turn. The "nothing else" list comes from what is carried: someone with a
     phone is never told "no phone", someone with a knife never "no weapon". */
  const CARRY_KINDS = [
    ['weapon', /\b(knife|blade|switchblade|pocketknife|machete|razor|gun|pistol|rifle|shotgun|revolver|handgun|bat|club|crowbar|brass knuckles)\b/i],
    ['tool', /\b(socket set|wrench|screwdriver|hammer|crowbar|pliers|bolt cutters|flashlight|lighter|rope|duct tape|toolbox|tools?|lock picks?|pick set|multitool|saw)\b/i],
    ['phone', /\b(phone|cellphone|cell phone|smartphone)\b/i],
    ['keys', /\bkeys?\b/i],
    ['car', /\b(car|truck|pickup|van|car keys|truck keys)\b/i]
  ];
  function carryingLine(p) {
    const held = p.inventory.filter(i => i.qty > 0);
    const things = held.map(i => i.name + (i.qty > 1 ? ` x${i.qty}` : ''));
    const none = CARRY_KINDS.filter(([, re]) => !held.some(i => re.test(i.name))).map(([k]) => k);
    return `CARRYING: ${things.join(', ') || 'nothing'}; ${moneyLine(p.gold)}, known to the player alone: people see only what is shown or handed over, and nobody says the total or what is left (nothing else: no ${none.length ? `${none.join(', ')} or ` : ''}money beyond this).`;
  }

  // ----- step 3: parse -----
  /* The parser's action types (Api.PARSE_TYPES: the engine's ACTION_TYPES, gamble included). */
  const PARSE_TYPES = Array.isArray(Api.PARSE_TYPES) ? Api.PARSE_TYPES : ACTION_TYPES;
  const MOVE_WHEN = ['before', 'after'];
  function normaliseParse(raw, input) {
    const r = isObj(raw) ? raw : {};
    const out = {
      actionType: PARSE_TYPES.includes(r.actionType) ? r.actionType : 'other',
      summary: cleanText(r.summary, 200),
      targets: strArr(r.targets, 120),
      destinationId: typeof r.destinationId === 'string' && r.destinationId ? r.destinationId : null,
      moveWhen: MOVE_WHEN.includes(r.moveWhen) ? r.moveWhen : null,
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
    if (!out.destinationId) out.moveWhen = null;
    // Talked about, not acted on: only ids the game has, and never one of the targets.
    out.aboutIds = strArr(r.aboutIds, 120).filter((id, i, all) => all.indexOf(id) === i && !out.targets.includes(id) && !!(State.current && State.entityById(id)));
    // Wave 28: romantic, a flirt or more (a reply without it, or an older one's false, is null; an older true is a flirt).
    out.romantic = r.romantic === 'flirt' || r.romantic === 'more' ? r.romantic : r.romantic === true ? 'flirt' : null;
    /* Wave 29 (the integration plan's 19.4): a lev_ id is let through, in
       aboutIds only, for a record the player holds (held, used or paid),
       and only when the player's words use it (two words of its text, or a
       threat phrase: Rel.references); otherwise it is dropped with a debug
       line and the ask is an ordinary one, so a stray id never makes a
       threat by accident. */
    const words = typeof input === 'string' ? input : '';
    for (const id of strArr(r.aboutIds, 120).filter((x, i, all) => /^lev_/.test(x) && all.indexOf(x) === i)) {
      const rec = State.current ? State.leverageRec(id) : null;
      const why = !rec || rec.holder !== 'player' || !Rel.LEV_LIVE.includes(rec.status) ? 'not a record the player holds' : !Rel.references(words, rec) ? 'the words did not use it' : null;
      if (why) { if (State.current) State.pushDebug({ turn: State.current.meta.turn, kind: 'rel', text: `lev id ignored: ${why} (${id})` }); continue; }
      out.aboutIds.push(id);
    }
    /* Wave 28: the engine's floors on a roll aimed at someone (Rel.difficultyFloor;
       design section 6.2): at least hard to ask anything of someone against the
       player or who hates them, a lie to someone who distrusts them hard (very
       hard at -50), a hard person at least hard to frighten. */
    if (out.needsRoll && State.current) {
      const n = out.targets.map(id => State.npc(id)).find(Boolean);
      const floor = n ? Rel.difficultyFloor(n, out.actionType) : null;
      if (floor && DIFFICULTIES.indexOf(out.difficulty || 'normal') < DIFFICULTIES.indexOf(floor)) out.difficulty = floor;
    }
    return out;
  }
  /* Structured packet for the parser (the mock reads the fields, the real
     parser reads `text`, a labelled plain-text version). */
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
      exits: l.exits.map(id => State.loc(id)).filter(x => x && x.discovered).map(x => ({ id: x.id, name: x.name, type: x.type, closed: isShut(x) })),
      present: State.npcsAt(l.id).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role, look: n.look, attitude: n.attitude, traits: Array.isArray(n.personality) ? n.personality.slice(0, 3) : [], goal: typeof n.goal === 'string' ? n.goal : '' })),
      itemsHere: (l.items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      inventory: p.inventory.map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      // People the player knows, and people the story named whom they have only heard of.
      knownNpcs: s.npcs.filter(n => (n.knownToPlayer || heardOf(n)) && n.alive !== false).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role, heard: heardOf(n) })),
      knownLocations: s.locations.filter(x => x.discovered).map(x => ({ id: x.id, name: x.name, type: x.type, closed: isShut(x) }))
    };
    // Everyone else who exists (the cast is fixed): a person the player names or describes is one of these ids.
    const listed = new Set(packet.present.map(n => n.id).concat(packet.knownNpcs.map(n => n.id)));
    packet.cast = s.npcs.filter(n => n.alive !== false && n.status !== 'gone' && !listed.has(n.id)).map(n => ({ id: n.id, name: n.name, pronouns: n.pronouns, role: n.role, ties: isToWords(n) }));
    // The dead and the people who live elsewhere: a person the player names may be one of them (talked about, never met).
    packet.absent = s.npcs.filter(n => presenceOf(n) !== 'here' && !listed.has(n.id)).map(n => ({ id: n.id, name: n.name, role: n.role, presence: presenceOf(n) }));
    // Places out of town: never a destination (the engine refuses one), but the player may name them.
    packet.away = s.locations.filter(x => x.away === true).map(x => ({ id: x.id, name: x.name, type: x.type }));
    // Wave 29: what the player holds over people (an id for aboutIds when the words use it: Rel.references), never the secret itself.
    packet.leverage = Rel.leverageOf().filter(x => x.holder === 'player' && Rel.LEV_LIVE.includes(x.status)).map(x => { const n = State.npc(x.over); return n ? { id: x.id, npcId: n.id, name: n.name, text: x.text, over: n.id, about: x.about } : null; }).filter(Boolean);
    // What the narrator said last, so a short reply ("Deal.") is read against it.
    const prev = s.log.length ? s.log[s.log.length - 1] : null;
    packet.lastTurn = prev && prev.narration ? cleanText(prev.narration, 1200) : '';
    const ids = arr => arr.map(x => `${x.id} — ${x.name}${x.role ? ` (${x.role})` : ''}${x.type ? ` (${x.type})` : ''}${x.closed ? ' (closed)' : ''}${x.qty > 1 ? ` x${x.qty}` : ''}`).join('; ') || 'none';
    const presentIds = packet.present.map(n => n.id);
    let modeLine;
    if (mode === 'fact') modeLine = 'MODE: fact. The player is spending a story point to make this statement true in the world. Put the ids of existing people, places and things it refers to in targets, and new:<short description> for anyone or anything it adds. Set declaresWorldFact to true, needsRoll to false and timeCost to instant.';
    else if (isSay(sp)) {
      const all = sp.to === 'everyone';
      modeLine = `MODE: say, to ${all ? 'everyone present' : `${sp.to} (${sp.toName})`}. The input is the player's exact spoken words, said aloud to ${all ? 'everyone here' : sp.toName}; nothing else was done. actionType must be talk, persuade, deceive or intimidate (or gamble when the words buy into a card game here: a bet at cards, "deal me in", "I'm in for $50", "another hand", "deal me in at hold'em", "a hand of draw", "deal everyone in", "heads up"; the game and the table size may be named in the words; "I bet he is lying" is talk): choose by what the words do, and decide the roll as usual. targets must include ${all ? `every NPC present (${presentIds.join(', ') || 'nobody is here'})` : sp.to}. destinationId must be null. A person mentioned in the words is one of the listed ids; never use new: for a person.`;
    } else modeLine = 'MODE: do. The input is what the player does; any speech inside it is incidental to the action.';
    // Traits and wants steer the difficulty (very_hard against what they want); the look lets "the big man with the pens" resolve to the person who matches.
    // Wave 28: where they stand with the player (the stance, Rel.stance) and how hard a lie to them is (Rel.lieWord), in place of the number.
    const standing = id => { const x = State.npc(id); if (!x) return { stance: 'sizing you up', lies: 'normal' }; const st = Rel.stance(x); return { stance: st.phrase, lies: Rel.lieWord(x) }; };
    const presentRow = n => {
      const sd = standing(n.id);
      const extra = [`${pronounLabel(n.pronouns)}; ${n.role}; toward the player: ${sd.stance}; lies to them: ${sd.lies}`];
      // Wave 52: the parser is told who is under 18 (wave 53: the age alone, minorMark; the bookkeeper's packet adds its rule).
      if (Rel.isMinor(n)) extra.push(minorMark(n, true));
      if (n.traits.length) extra.push(`traits: ${n.traits.join(', ')}`);
      if (n.goal) extra.push(`wants: ${lowerFirst(n.goal).replace(/\.$/, '')}`);
      return `${n.id} — ${n.name} (${extra.join('; ')})${n.look ? `: ${n.look}` : ''}`;
    };
    packet.text = [
      isSay(sp) ? `PLAYER INPUT: "${input}"` : `PLAYER INPUT: ${input}`,
      modeLine,
      `LAST TURN: ${packet.lastTurn || 'none (the story is just starting)'}`,
      `TIME: day ${s.time.day} (${dateText(s.time.day)}), ${s.time.phase} (${State.phasePart(s.time)})`,
      `PLAYER: ${p.name} (${ageText(p.age) ? `${p.age}; ` : ''}${p.background}); ${STATS.map(k => `${k} ${fmtMod(p.stats[k])}`).join(', ')}; ${moneyLine(p.gold)}; hp ${p.hp}/${p.maxHp}`,
      `LOCATION: ${l.id} — ${l.name} (${l.type})`,
      `NPCS PRESENT: ${packet.present.map(presentRow).join('; ') || 'none'}`,
      `ITEMS HERE: ${ids(packet.itemsHere)}`,
      `INVENTORY: ${ids(packet.inventory)}`,
      `OTHER KNOWN NPCS (not here): ${packet.knownNpcs.filter(n => !presentIds.includes(n.id)).map(n => `${who(n)}${n.heard ? ' (heard of, not met)' : ''}`).join('; ') || 'none'}`,
      `EVERYONE ELSE IN TOWN (not met yet; nobody else exists): ${packet.cast.map(n => `${n.id} — ${n.name} (${pronounLabel(n.pronouns)}; ${n.role}${n.ties ? `; ${n.ties}` : ''})`).join('; ') || 'none'}`,
      // Every discovered place, by type too ("the bar"): one move reaches any of them.
      `OTHER PLACES IN TOWN (one move reaches any): ${ids(packet.knownLocations.filter(x => x.id !== l.id))}`,
      `NOT IN TOWN (dead, or living elsewhere; talked about, never met): ${packet.absent.map(n => `${n.id} — ${n.name} (${n.presence === 'dead' ? 'dead' : 'lives elsewhere'}; ${n.role})`).join('; ') || 'none'}`,
      `OUT OF TOWN (never a destination; the story stays here): ${ids(packet.away)}`
    ].concat(packet.leverage.length ? [`WHAT THE PLAYER HOLDS (put the id in aboutIds when the player's words use it, to threaten or to ask): ${packet.leverage.map(x => `${x.id}: what you have on ${x.name}: ${x.text}`).join('; ')}`] : []).join('\n');
    return packet;
  }

  /* Why the player cannot go into a place now, in a few words, or '': shut
     for the story (closed), shut today (State.isClosed: closedOn, a weekday),
     or barred to them (State.isBanned: a grudge, a card game). A move there
     is a walk to a shut door (CONTRACTS sections 1 and 2). */
  function shutReason(l, day) {
    if (!l) return '';
    const ban = State.isBanned(l.id, day);
    if (ban) return `the player is not welcome there until day ${banBackDay(ban)}`;
    if (l.closed) return 'closed';
    if (State.isClosed(l, day)) return `closed on ${State.weekday(day)}s`;
    return '';
  }
  function isShut(l, day) { return !!shutReason(l, day); }

  // ----- step 3b: a walk, then an action there -----
  /* "I head to the bar and ask the bartender...": a parsed action that is
     not itself a move but names a destination. The engine walks the player
     there first (no roll; the turn costs at least a short), so step 4 and
     everything after it run at the destination: who is present, what gets
     created, the roll, the narration (MOVED line) and the bookkeeping. A
     plain move keeps its own path (narrated as the walk, with the
     DESTINATION line). A closed destination (or one the player is barred
     from) turns the action into a walk to the shut door (no roll, and
     nothing new is made). An action done here first and then a walk on
     (moveWhen "after": "ask her, then go to the bridge") stays here: the
     walk comes after the narration (walkOn). Returns ctx.moved, or null. */
  function walkFirst(ctx) {
    const a = ctx.action;
    const from = here();
    const to = a.destinationId ? State.loc(a.destinationId) : null;
    if (a.actionType === 'move' || !to || to.id === from.id) return null;
    if (a.moveWhen === 'after') {
      ctx.walkAfter = { toId: to.id, toName: to.name, shut: shutReason(to) || null };
      return null;
    }
    if (isShut(to)) {
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
     at most. What was changed is logged as a rejected model field.
     Wave 11 (H2): a bet said aloud is still a bet. A line the parser read
     as gamble, or whose words bet where there is a card game ("Deal me
     in", "I'm in for $50", "ante up", "I'll play a hand", "another hand",
     "raise", "all in": SAY_BET), stays gamble: Pipeline.gamble deals when
     the dealer was spoken to (or everyone was), and otherwise gives the
     no-game line. */
  const SAY_TYPES = ['talk', 'persuade', 'deceive', 'intimidate'];
  const SAY_NUM = '(?:\\$\\s?\\d|\\d|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a hundred|hundred)\\b)';
  const SAY_BET = [
    /\bdeal me (?:in|another|a hand|one more)\b/i,
    /\bdeal (?:again|another|one more)\b/i,
    new RegExp(`\\b(?:i'?m|i am|count me) in(?:\\s+for\\s+${SAY_NUM}|\\s*[.!?,…]*\\s*$)`, 'i'),
    /\bante(?:\s+up)?\b/i,
    /\b(?:i'?ll|i will|let me|i) play (?:a hand|another hand|one more hand|another|one more|cards|poker)\b/i,
    /^\s*let'?s play(?:\s+(?:cards|poker|a hand))?\s*[.!?]*\s*$/i,
    /\b(?:another|one more) hand\b/i,
    /^\s*(?:i\s+)?raise(?:\s+(?:you|it|the pot))?\s*[.!?]*\s*$/i,
    new RegExp(`\\b(?:raise|raises)(?:\\s+(?:you|it|the pot))?\\s+${SAY_NUM}`, 'i'),
    // All in as a bet ("I'm all in", "I go all in", "All in.", "all in for $50"), not "we're all in this together".
    new RegExp(`\\b(?:i'?m|i am|i go|go|going)\\s+all[\\s-]in\\b|^\\s*all[\\s-]in\\s*[.!?]*\\s*$|\\ball[\\s-]in\\s+for\\s+${SAY_NUM}`, 'i'),
    /\bput (?:\$\s?\d+|\d+(?:\s*(?:dollars|bucks))?) (?:in|on the table|in the pot|into the pot)\b/i,
    // Wave 13: the game and the table size named ("deal me in at hold'em", "a hand of draw", "deal everyone in", "heads up").
    /\b(?:a|another|one more) (?:hand|game|round) of (?:five[\s-]*card\s+)?(?:draw|hold[\s'-]*'?em|holdem|texas hold[\s'-]*'?em|poker)\b/i,
    /\b(?:play|playing|let'?s play|deal|deal me in at|deal us in at|i'?ll play)\s+(?:some\s+)?(?:texas\s+)?(?:hold[\s'-]*'?em|holdem|draw poker|five[\s-]*card(?:\s+draw)?)\b/i,
    /\bdeal (?:everyone|everybody|us all|all of us|the (?:whole )?table) in\b/i,
    /\bheads[\s-]*up\s+(?:game|hand|poker|hold[\s'-]*'?em|holdem|draw|with)\b|\b(?:play|deal|let'?s play)\s+(?:it\s+)?heads[\s-]*up\b/i
  ];
  /* A bet or a wager is a bet at cards only as Style.betTalk reads it (wave
     12, L7: the cards, a hand, the game or the pot named, or a bare stake);
     "I bet you ten bucks it rains tomorrow" and "I bet he is lying" are
     talk. */
  function wordsBet(words) { const t = String(words || '').replace(/[’]/g, "'"); return SAY_BET.some(re => re.test(t)) || Style.betTalk(t) === 'bet'; }
  // Only a figure of speech: a bet followed by a clause, and nothing else in the words that bets.
  function betIsTalk(words) { const t = String(words || '').replace(/[’]/g, "'"); return Style.betTalk(t) === 'clause' && !SAY_BET.some(re => re.test(t)); }
  function sayAction(a, sp, words) {
    const s = State.current;
    const presentIds = State.npcsAt(s.player.locationId).map(n => n.id);
    const fixed = [];
    // A bet (wave 11, H2): the parser's gamble, or words that bet where a card game is.
    // "I bet he is lying" is talk even when the parser read a bet (wave 12, L7).
    const bet = (a.actionType === 'gamble' && !betIsTalk(words)) || (wordsBet(words) && cardGameAt(here()));
    if (bet && a.actionType !== 'gamble') { fixed.push(`actionType ${a.actionType} became gamble (the words bet at the card game)`); a.actionType = 'gamble'; }
    else if (!bet && !SAY_TYPES.includes(a.actionType)) { fixed.push(`actionType ${a.actionType} became talk`); a.actionType = 'talk'; }
    if (a.destinationId) { fixed.push(`destinationId ${a.destinationId} dropped`); a.destinationId = null; }
    if (a.timeCost === 'long' || a.timeCost === 'rest') { fixed.push(`timeCost ${a.timeCost} became short`); a.timeCost = 'short'; }
    const want = sp.to === 'everyone' ? presentIds : presentIds.filter(id => id === sp.to);
    const missing = want.filter(id => !a.targets.includes(id));
    if (missing.length) fixed.push(`added the addressee ${missing.join(', ')}`);
    a.targets = want.concat(a.targets.filter(t => !want.includes(t)));
    if (fixed.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'model', path: 'parse', reason: `say mode: ${fixed.join('; ')}` });
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
    const exit = here().exits.map(id => State.loc(id)).find(l => l && l.discovered && !isShut(l) && l.away !== true);
    if (!exit) return null;
    a.destinationId = exit.id;
    State.pushDebug({ turn: State.current.meta.turn, kind: 'rejected', source: 'engine', path: 'destinationId', reason: `a move with no place named: the engine sends the player out through ${exit.id}` });
    return exit.id;
  }

  /* "Do this here, then go there" (moveWhen "after"): once the action is
     narrated and bookkept the engine walks the player on, unless the place
     is shut to them, they are down, or the bookkeeper already moved them.
     The turn costs at least a short. Returns the place id, or null. */
  function walkOn(ctx) {
    const w = ctx.walkAfter;
    const s = State.current;
    if (!w || w.shut || s.player.hp <= 0 || s.player.dead || s.player.locationId !== ctx.location.id) return null;
    const to = State.loc(w.toId);
    if (!to || isShut(to) || State.apply({ playerLocationId: to.id }).rejected.length || s.player.locationId !== to.id) return null;
    if (ctx.action.timeCost === 'instant') ctx.action.timeCost = 'short';
    return to.id;
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
    if (!d || isShut(d) || d.id === ctx.location.id || s.player.locationId !== ctx.location.id) return false;
    if ((ctx.roll && !ctx.roll.success) || s.player.hp <= 0 || s.player.dead) return false;
    if (State.apply({ playerLocationId: d.id }).rejected.length) return false;
    State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'playerLocationId', reason: `the bookkeeper left the player at ${ctx.location.id} after a move; the engine moved them to ${d.id}` });
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
  /* opts.defer (a turn, not a fact): a thing that would be made for an
     action that rolls is only noted in out.deferred and its new: target
     kept; createDeferred() makes it after the roll, and only if the roll
     succeeded (a failed search finds nothing). */
  async function checkAndCreate(action, opts) {
    opts = opts || {};
    const s = State.current;
    const l = here();
    const presentIds = State.npcsAt(l.id).map(n => n.id);
    const out = { targets: [], created: [], notPresent: [], links: [], deferred: [] };
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
    // "a rifle and a box of shells": two things, each judged on its own (playtest B5).
    action.targets = action.targets.flatMap(raw => {
      const m = /^new:(.+?)\s+and\s+((?:a|an|the|some|my|his|her|their|two|three|four|another|a few|a pair of)\s+.+)$/i.exec(String(raw));
      return m ? [`new:${m[1]}`, `new:${m[2]}`] : [raw];
    });
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
      const verdict = Town.plausible(desc, l.type, { fact: !!opts.fact });
      if (!verdict.plausible) { out.notPresent.push({ ref: raw, label: labelFor(desc), reason: 'does_not_exist', why: verdict.reason }); continue; }
      // A take picks up what is lying here (ITEMS HERE, matched above): it never makes a thing out of nothing (playtest B5, REVIEW E1).
      if (action.actionType === 'take' && !opts.fact && verdict.kind === 'item') { out.notPresent.push({ ref: raw, label: labelFor(desc), reason: 'nothing_here', why: 'nothing like that is here to take' }); continue; }
      // Everyone who exists is in the cast: a person nobody in it answers to is simply not there.
      if (verdict.kind === 'npc') { out.notPresent.push({ ref: raw, label: labelFor(desc), reason: 'does_not_exist', person: true, why: 'nobody like that lives in this town' }); continue; }
      // A search for something that is not lying here always rolls (Wits, normal) and finds it only on a success (wave 3, playtest N12).
      if (opts.defer && !opts.fact && verdict.kind === 'item' && action.actionType === 'search' && !action.needsRoll) Object.assign(action, { needsRoll: true, stat: STATS.includes(action.stat) ? action.stat : 'wits', difficulty: DIFFICULTIES.includes(action.difficulty) ? action.difficulty : 'normal' });
      if (opts.defer && !opts.fact && verdict.kind === 'item' && action.needsRoll) { out.deferred.push({ raw, desc }); keep(raw); continue; }
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
  /* After the roll: the things checkAndCreate held back exist only if the
     roll succeeded (wave 3, playtest N12: no roll, nothing made); otherwise
     they are not found (NOT PRESENT, and the bookkeeper hears to record
     nothing for them). */
  async function createDeferred(ctx) {
    const list = Array.isArray(ctx.deferred) ? ctx.deferred : [];
    ctx.deferred = [];
    if (!list.length) return;
    const a = ctx.action;
    const found = !!ctx.roll && ctx.roll.success;
    const lost = [];
    for (const d of list) {
      const i = a.targets.indexOf(d.raw);
      if (found) {
        const made = await createEntity('item', d.desc, { fact: false });
        ctx.created.push(made);
        if (i >= 0) a.targets[i] = made.id; else a.targets.push(made.id);
      } else {
        if (i >= 0) a.targets.splice(i, 1);
        ctx.notPresent.push({ ref: d.raw, label: labelFor(d.desc), reason: 'not_found', why: 'not found: the search turns up nothing like it' });
        lost.push(labelFor(d.desc));
      }
    }
    if (lost.length) (ctx.bookLines = ctx.bookLines || []).push(`NOT FOUND (the roll failed; it does not exist, record nothing about it): ${lost.join(', ')}`);
  }

  // ----- step 5: resolve -----
  function lastingConsequence(ctx) {
    const s = State.current;
    const p = s.player;
    const a = ctx.action;
    const witness = a.targets.map(id => State.npc(id)).find(n => n && ctx.presentIds.includes(n.id));
    if (witness && Dice.SOCIAL_ACTIONS.includes(a.actionType)) {
      // Something they hold the player to (wave 27: noted; it moves no track).
      State.apply({ newMemories: [{ npcId: witness.id, text: `Watched ${p.name} fail badly: ${lowerFirst(a.summary)}`, weight: 2, event: 'noted' }] });
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
    // Wave 21: a success is a success, not a partial (the owner, Tired and at Charm -1: "Charm 19 - 2 = 17 vs 18 · Partial"); when only a 20 reaches the target it is the 20.
    if (tier === 'success' && tierOf(d) !== 'success' && tierOf(d) !== 'critical') d = 20;
    if (tier === 'failure' && tierOf(d) !== 'failure') d = tierOf(2) === 'failure' ? 2 : 1;
    if (tier === 'partial' && tierOf(d) !== 'partial') { for (let x = 19; x >= 2; x--) if (tierOf(x) === 'partial') { d = x; break; } }
    return d;
  }
  /* The die for the next roll: a forced one (forceNextRoll, a cheat), or
     after /undo or /reroll a draw shifted by a salt kept outside the save
     (the restored state would hand back the very same die). */
  function nextDie(rollOpts) {
    let forced = Number.isInteger(hooks.nextD20) ? hooks.nextD20 : (hooks.diceSalt ? ((Rng.d(20) - 1 + hooks.diceSalt * 7) % 20) + 1 : undefined);
    hooks.nextD20 = null;
    if (hooks.nextTier) { forced = dieFor(hooks.nextTier, rollOpts); hooks.nextTier = null; }
    return forced;
  }
  /* The retry lock after a roll (Dice.lockFor, stored through State.apply):
     the locks still in force here, plus this key when the roll failed, or
     '+key' when a social ask worked (that locks nothing; Dice.successes
     counts it, for diminishing returns). exempt: a swing at someone still
     standing here adds nothing. */
  function lockAfter(roll, key, exempt) {
    State.apply({ lastRollKey: Dice.lockFor(roll, exempt ? null : key) });
  }
  /* Gifts (playtest: money bought feelings, +5 a gift all day): the first
     gift to someone in a day may warm them; another to the same person that
     day earns no attitude at all. Wave 3 (the review's risk, the playtest's
     design note): who a gift would go to is noted before the narration
     (ctx.giftTo: the person the action is aimed at, a give or words in Say
     mode alike), but it is a gift only when the bookkeeper's diff hands
     them money or a thing (giftIn), it counts only once that diff is
     applied (applyBookkeeping records giftGiven), and money toward what is
     owed them, or the thing an errand brings them, is a payment, not a
     gift. */
  const NOT_GIFTS = ['buy', 'sell', 'gamble', 'steal', 'attack'];
  /* Wave 4 (the third review's bug 1): what the player bought is the price
     of it, in Say mode too, where every action becomes talk. Wave 6 (the
     fifth review's bug 1 and the round-5 playtest's R1: the final design,
     after three waves that each over-corrected): in Say mode money that goes
     to the one spoken to is a payment toward what is owed them when
     something is, else a gift, unless
       (a) the parser read a buy,
       (b) the bookkeeper's diff gains a good (State.apply and giftIn read
           itemsGained with State.goodNamed: the goods table's goods,
           services, drinks and food, or a thing on sale here), or
       (c) the line names a good in a buying frame (BUYING_FRAMES: "I'll
           take a beer", "gimme one of those cold drinks", "how much for a
           flashlight", "two beers, please", "another round", "fill it up").
     A frame is anchored on the good, never on the words alone: "give me a
     second", "can I get a few more days", "I'll take the fifty", "I'll take
     care of the rest" buy nothing. "Get yourself a beer", "buy yourself
     lunch" (GIFT_PHRASES) are a gift. Paying words (PAYING_WORDS: the rest,
     what's left, the balance, the note, the loan, toward, owe) always win:
     the money is a payment (ctx.paying, State.apply's opts.paying). A
     parsed give is never a purchase. Pinned line by line in
     tests/wave6-fixes.test.cjs. */
  const PAYING_WORDS = /\b(?:(?<!keep )the rest\b|what'?s left|what is left|(?:is|are) left\b|left to pay|left on (?:it|the|that)|(?:the|my|that) balance|the note\b|the loan\b|title loan|toward|towards|owe|owed|owes|owing|debts?\b|what i borrowed|i borrowed|paid|pay(?:ing)? (?:you|it|off|back|up|that|this|what|down)|settle (?:up|it|this|that|what|with)|(?:all )?square(?:d)? (?:up|with)|(?:us|we'?re|we are|call it) even)(?![a-z])/i;
  // "get yourself a beer", "buy yourself lunch", "let me buy you a drink": a gift, whatever it names.
  const GIFT_PHRASES = /\b(?:get|buy|grab|treat|pour|have)\s+(?:yourself|yourselves|you|your\s+\w+|the kids|him|her|them)\b[^.!?]*/gi;
  // What may stand between a buying word and the good it buys: a count, an article, a size or a container.
  const GOOD_FILLER = "(?:(?:a|an|the|one|two|three|four|five|six|some|another|couple|of|those|these|them|that|this|your|cold|hot|cheap|little|big|small|large|fresh|more|few|pack|bottle|glass|cup|can|order|plate|bag|box|round|tall|regular|whole|full|new|used|good|next|last|other)\\s+)";
  function buyingFrame(words) {
    const good = goodRe();
    const frames = [
      `\\b(?:gimme|give me|get me|sell me|bring me|pour me|hand me|grab me|i'?ll (?:take|have|get|buy|grab)|i'?d (?:take|have|get)|we'?ll (?:take|have)|let me (?:get|have|buy|grab)|(?:can|could|may) (?:i|we) (?:get|have|buy|grab)|i(?:'d| would) like|i want|i need)\\s+${GOOD_FILLER}{0,4}${good}`,
      `\\bone of (?:those|these|them|your)\\s+${GOOD_FILLER}{0,2}${good}`,
      `\\bhow much (?:for|is|are|does|do|'s|would)\\s+${GOOD_FILLER}{0,3}${good}`,
      `\\b${good}(?:\\s+[a-z']+){0,3},?\\s+please\\b`,
      `\\b(?:another|one more)\\s+${GOOD_FILLER}{0,2}${good}`,
      `\\bfor (?:the|my|that|this|those|these|two|three|both|our)\\s+${GOOD_FILLER}{0,2}${good}`,
      `(?:^|[.!?]\\s*)(?:a|an|one|two|three|four|five|six|another|some)\\s+${GOOD_FILLER}{0,2}${good}\\s*(?:[.!?]|$)`,
      `\\bfill (?:it|her|'er|them) up\\b`, `\\bon pump\\b`
    ];
    return frames.some(f => new RegExp(f, 'i').test(words));
  }
  // A good as the line names it (State's goods words, and the things on sale here), ending at a word's end.
  function goodRe() { return `(?:${State.goodSource()})(?![a-z])`; }
  function sayWords(ctx) { return String(ctx.input || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim(); }
  function payingIn(ctx) { return isSay(ctx.speech) && PAYING_WORDS.test(sayWords(ctx)); }
  function boughtIn(a, ctx) {
    if (!a) return false;
    if (ctx.paying) return false;
    if (a.actionType === 'buy') return true;
    if (!isSay(ctx.speech) || a.actionType === 'give') return false;
    return buyingFrame(sayWords(ctx).toLowerCase().replace(GIFT_PHRASES, ' '));
  }
  function giftCheck(ctx) {
    const a = ctx.action;
    ctx.giftTo = null;
    if (!a || NOT_GIFTS.includes(a.actionType) || ctx.bought) return;
    // Said to everyone (wave 4, the review's risk): a gift only when one person is here to take it.
    if (isSay(ctx.speech) && ctx.speech.to === 'everyone' && (ctx.presentIds || []).length !== 1) return;
    const to = (a.targets || []).find(t => /^npc_/.test(t) && (ctx.presentIds || []).includes(t));
    if (!to) return;
    const s = State.current;
    const g = s.meta.gifts;
    const times = isObj(g) && g.day === s.time.day && Array.isArray(g.ids) ? g.ids.filter(x => x === to).length : 0;
    ctx.giftTo = { npcId: to, times };
  }
  /* A shop that is against the player (wave 27, design section 6.3; Rel.wontSell:
     a manager, owner, merchant, bartender or cashier against them or hating
     them): for a purchase this turn, the seller it is aimed at (else the
     first seller here) will not sell for GATES.wontSell.days days from the
     first time they refused (flags['relPrice.<npcId>']: that day), then
     sells at a quarter over (State.priceFactor). A bed, gas or food is
     never refused for more than one night. Told to the narrator and the
     bookkeeper (cleanDiff drops the money and the goods). A seller no
     longer against the player starts again. */
  const ESSENTIALS = /\b(room|rooms|night|nights|bed|lodging|motel|gas|gasoline|fuel|diesel|fill (?:it|her|'er) up|tank|food|eat|meal|plate|sandwich|burger|breakfast|lunch|supper|dinner|biscuit|catfish|fries|soup|chili|coffee)\b/i;
  function refuseSale(ctx) {
    const s = State.current;
    const a = ctx.action;
    if (!a || !(ctx.bought || a.actionType === 'buy')) return;
    const present = (ctx.presentIds || []).map(id => State.npc(id)).filter(Boolean);
    const sellers = present.filter(n => Rel.GATES.wontSell.roles.some(r => (n.tags || []).includes(r) || new RegExp(`\\b${r}s?\\b`, 'i').test(String(n.role || ''))));
    const seller = sellers.find(n => (a.targets || []).includes(n.id)) || sellers[0];
    if (!seller) return;
    const key = `relPrice.${seller.id}`;
    const since = toInt(s.flags[key]);
    if (!Rel.wontSell(seller)) { if (since !== null) State.apply({ effects: [{ op: 'setFlag', key, value: null }] }); return; }
    const day = s.time.day;
    if (since === null) State.apply({ effects: [{ op: 'setFlag', key, value: day }] });
    const start = since === null ? day : since;
    const essential = ESSENTIALS.test(`${ctx.input || ''} ${a.summary || ''}`);
    const hold = essential ? Rel.GATES.wontSell.essentialDays : Rel.GATES.wontSell.days;
    if (day - start < hold) {
      ctx.noSale = seller.id;
      ctx.narratorLines.push(`WON'T SELL: ${seller.name} is against ${s.player.name} and will not sell to them${essential ? ' tonight' : ''}; say so plainly. Nothing is bought.`);
      ctx.bookLines.push(`NO SALE (the engine): ${seller.name} would not sell to the player; record no goldDelta and no itemsGained for a purchase.`);
      return;
    }
    ctx.marked = seller.id;
    ctx.narratorLines.push(`PRICE: ${seller.name} sells to ${s.player.name}, but charges a quarter over the usual price, and makes sure they notice.`);
  }
  /* The first of these people the player owes something (an obligation still owed), or null. */
  function obligeeAmong(ids) {
    const owed = State.obligations('owed');
    return (ids || []).find(id => owed.some(o => o.npcId === id)) || null;
  }
  /* What the person is owed by the player: money (a debt or blackmail not
     yet paid in full) or a thing (an errand). */
  function owedTo(npcId, kind) {
    return State.obligations('owed').some(o => o.npcId === npcId && (kind === 'money'
      ? (o.kind === 'debt' || o.kind === 'blackmail') && Number.isInteger(o.amount) && o.amount > (o.paid | 0)
      : o.kind === 'errand' && !!o.itemName));
  }
  /* The gift in this diff ({ npcId, times }), or null: money or a thing
     handed to the person the action was aimed at, that is not a payment. */
  function giftIn(ctx, diff) {
    const g = ctx.giftTo;
    if (!g || !isObj(diff)) return null;
    const money = toInt(diff.goldDelta) < 0;
    const things = Array.isArray(diff.itemsLost) && diff.itemsLost.length > 0;
    if (!money && !things) return null;
    // A Say line whose diff gains a good bought it (wave 6, the final design's (b)), unless its words pay what is owed.
    if (isSay(ctx.speech) && !ctx.paying && Array.isArray(diff.itemsGained) && diff.itemsGained.some(x => State.goodNamed(typeof x === 'string' ? x : isObj(x) ? x.name : ''))) return null;
    if (money && !things && owedTo(g.npcId, 'money')) return null;
    if (things && !money && owedTo(g.npcId, 'thing')) return null;
    return g;
  }
  /* What a complication does (Dice: a lost HP, a cooler witness, a memory, a
     rumour, a police report), applied with the roll; the bookkeeper is told
     it is done. */
  function complicationEffects(ctx, roll) {
    const list = Array.isArray(roll.complicationEffects) ? roll.complicationEffects.filter(isObj) : [];
    if (!list.length) return;
    const r = State.apply({ effects: list });
    const done = r.applied.map(x => x.replace(/^effects\[\d+\]: /, ''));
    State.pushDebug({ turn: State.current.meta.turn, kind: 'complication', text: roll.complication, applied: done, rejected: r.rejected });
    if (done.length) ctx.complicationDone = done;
  }
  function storyPointFor(ctx, roll) {
    const s = State.current;
    if (roll.tier === 'critical' && s.player.storyPoints < State.LIMITS.storyPoints) {
      State.apply({ storyPointsDelta: 1 });
      ctx.storyPoint = true;
      UI.feed.quiet(`Natural 20: you earn a story point (${s.player.storyPoints} of ${State.LIMITS.storyPoints}).`);
    }
  }
  /* Secrets reach the narrator (narratorPacket) only for the people in
     ctx.revealSecretFor: someone a social roll just succeeded with, or anyone
     aimed at whose attitude is 50 or more. Wave 28 (Rel.GATES.secret): trust
     40 and knowing the player 30 in place of the attitude (Rel.secretOpen),
     or fear 60 after an intimidation that just worked, never for someone
     under 18 (fear opens nothing in a child). */
  function secretsFor(ctx) {
    const a = ctx.action || {};
    const present = ctx.presentIds || [];
    const aimed = (a.targets || []).filter(id => present.includes(id));
    const ids = new Set();
    const how = {};
    const social = isSay(ctx.speech) || Dice.SOCIAL_ACTIONS.includes(a.actionType);
    const scared = a.actionType === 'intimidate';
    // A child frightened into it opens nothing (wave 28): no secret from a minor on a threat, however it rolled.
    if (ctx.roll && ctx.roll.success && social && aimed.length && !(scared && Rel.isMinor(State.npc(aimed[0])))) { ids.add(aimed[0]); how[aimed[0]] = 'roll'; }
    for (const id of aimed) {
      const n = State.npc(id);
      if (!n) continue;
      if (Rel.secretOpen(n)) { ids.add(id); how[id] = how[id] || 'trust'; }
      else if (scared && ctx.roll && ctx.roll.success && !Rel.isMinor(n) && Rel.tracksOf(n).f >= Rel.GATES.secret.fear) { ids.add(id); how[id] = 'fear'; }
    }
    if (!ids.size) return;
    ctx.revealSecretFor = Array.from(ids);
    /* Wave 29 (the integration plan's 8.1): what the narrator is given is
       kept (known.secrets, how it opened), so the bookkeeper's
       learned_secret can make it a record, then or on a late retry. */
    const shown = ctx.revealSecretFor.filter(id => { const n = State.npc(id); return n && typeof n.secret === 'string' && n.secret.trim(); }).map(id => ({ npcId: id, how: how[id] || 'roll' }));
    if (shown.length) State.apply({ secretShown: shown });
  }
  function isPolice(n) { return !!n && (n.tags || []).includes('police'); }
  /* A fight (CONTRACTS section 12): the player takes Dice.fightDamage(tier)
     (1 on a partial, 1 to 3 on a failure, 3 on a fumble); a hit on someone
     counts toward state.fight (one person, one scene) and the third puts
     them down (World.knockDown: the due event is narrated this turn); an
     attack with the police here, or in a police station, ends in the cell
     after the narration (ctx.arrest, World.arrestPlayer). */
  function fight(ctx, roll, npcTarget) {
    const s = State.current;
    const p = s.player;
    if (npcTarget) ctx.attacked = npcTarget;
    const dmg = Math.max(0, toInt(Dice.fightDamage(roll.tier)) || 0);
    if (dmg > 0) {
      State.apply({ hpDelta: -dmg });
      ctx.damage = dmg;
      ctx.defeated = p.hp <= 0;
      UI.feed.quiet(`You take ${dmg} damage (HP ${p.hp}/${p.maxHp}).`);
    }
    if (npcTarget) {
      const t = s.time;
      const f = isObj(s.fight) ? s.fight : null;
      // One fight: the same person, the same place, attack after attack (turn after turn; a phase may roll over in the middle of it). A turn of anything else, a move or another target starts a new one.
      const same = !!f && f.npcId === npcTarget && f.locationId === p.locationId && f.turn === s.meta.turn - 1;
      const hits = (same ? (f.hits | 0) : 0) + (roll.success ? 1 : 0);
      ctx.hits = { [npcTarget]: hits };
      /* Wave 27: what they remember is the engine's (one memory a fight,
         keyed by it): a clean hit (success) is hit, anything less shoved;
         the second hit raises it, the third is the beat-down (knockDown).
         The people watching take a lighter copy each; done in front of two
         or more, it costs the town the fight's heaviest blow, once. */
      const key = same && typeof f.key === 'string' ? f.key : `f${s.meta.turn}-${npcTarget.slice(4)}`;
      let cost = same && Number.isInteger(f.rep) ? f.rep : 0;
      if (!(roll.success && hits >= 3)) {
        const target = State.npc(npcTarget);
        const event = roll.tier === 'success' || roll.tier === 'critical' ? 'hit' : 'shoved';
        const seen = ctx.presentIds.filter(id => id !== npcTarget && !State.laidUp(State.npc(id)));
        const pub = seen.length >= 2;
        const rep = pub ? Math.min(0, Rel.EVENTS[event].rep - cost) : 0;
        const place = placeName(here());
        const r = State.apply({ socialEvents: [{ npcId: npcTarget, event, text: event === 'hit' ? `hit me in a fight at ${place}` : `took a swing at me in a fight at ${place}`, act: 'attack', fight: key, witnesses: seen, public: pub, rep }] });
        if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'fight', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
        // Wave 28: a blow at someone under 18 goes to their family and the law, once a fight (World.minorHarm).
        World.minorHarm(npcTarget, 'violence');
        if (pub) cost = Math.min(cost, Rel.EVENTS[event].rep);
        if (target) ctx.bookLines.push(`FIGHT (already applied by the engine: what ${target.name} and the people watching make of it; record no social event for the fight).`);
      }
      if (roll.success && hits >= 3) {
        // They go down in this narration: told to the narrator (OUTCOME) and kept in the scene for it, though from now on they are laid up at home.
        const down = World.knockDown(npcTarget, { turn: s.meta.turn, locationId: p.locationId });
        if (down) {
          ctx.knockedDown = down.npcId;
          ctx.stillHere = (ctx.stillHere || []).concat(down.npcId);
          ctx.narratorLines.push(`OUTCOME: ${down.text} That is the third clean hit; the fight is over for them.`);
          ctx.bookLines.push(`KNOCKED DOWN BY THE ENGINE (already applied: hurt and laid up at home for two days, the memories, the news; record no npcFates for ${down.npcId}): ${down.text}`);
        }
        State.apply({ fight: null });
      } else State.apply({ fight: { npcId: npcTarget, hits, day: t.day, phase: t.phase, locationId: p.locationId, turn: s.meta.turn, key, rep: cost } });
    }
    const l = here();
    const cop = State.npcsAt(l.id).find(isPolice) || null;
    if (cop || (PLACE_KINDS.watch || []).includes(l.type) || l.type === 'police') {
      ctx.arrest = { npcId: cop ? cop.id : null, locationId: l.id };
      // Decided now, so this narration tells it (the night in the cell passes after it): once, not again next turn. A player beaten senseless here is the defeat's to tell.
      const plan = !ctx.defeated ? World.arrestPlan() : null;
      if (plan) {
        ctx.arrest.plan = plan;
        ctx.narratorLines.push(`ARREST: ${plan.text} Narrate the fight being broken up and ${p.name} being taken in; the night in the cell passes after this narration.`);
        ctx.bookLines.push(`ARRESTED BY THE ENGINE (already applied after this turn: the cell, the fine, the chief's memory${plan.weapons && plan.weapons.length ? ', the weapons taken' : ''}; record no playerLocationId, no goldDelta${plan.weapons && plan.weapons.length ? ' and no itemsLost' : ''} for them): ${plan.text}`);
      }
    }
  }
  /* A theft from a person, not from a place or a thing: aimed only at people
     (no thing among its targets), and its words name no place or thing it
     is taken from (THEFT_FROM: "the cash from Hollis's register"). */
  const THEFT_FROM = /\b(?:register|till|drawer|safe|counter|shelf|shelves|desk|cabinet|cooler|display|case|jar|box|crate|truck|car|boat|house|home|shop|store|office|room|trailer|garage|shed|barn|porch|locker|tackle|stock|lot|yard|kitchen|bar|back|place)\b/i;
  function pickpocket(a, ctx) {
    if (a.targets.some(t => !/^npc_/.test(t))) return false;
    return !THEFT_FROM.test(String(ctx.input || a.summary || '').replace(/[’]/g, "'"));
  }
  /* Returns { locked: true } when the identical failed roll is retried. An
     action without a roll leaves the lock alone here: runTurn lifts it once
     the situation has changed (SPEC section 7). An attack's difficulty is
     the target's threat (Dice.threat) unless the parser named one above
     normal, and a fight goes on: another swing at someone still here is
     never locked. */
  /* Wave 28 (the integration plan's 6.1, 19.1 and 19.3): the romance step
     of a turn (Pipeline step 4, after the parse and the scene): Rel.romanceTurn
     over the parse, the words and who is here, with the minor rule's phrase
     list (Api.minorPhraseHit) over the input. Its lines go to the narrator
     (after COMPLICATION: each adult's answer, a coercion's refusal), the
     bookkeeper hears what the engine decided, and the decision is kept for
     resolve (coercion), applyBookkeeping (the unwelcome flirts, the model's
     rules for minors) and minorTurn. The line for anyone under 18 in the
     scene is narratorPacket's own, every turn. */
  /* Wave 33 ("a kiss lands on the one kissed"): on a romantic parse that
     names nobody here (the parser read "kiss her" as aimed at nobody, or at
     someone not in the scene), the words decide before the romance step
     does: a person here named in them (their full name, or a first name
     unique among the people here), else a pronoun (her or she, him or he,
     them or they) that fits exactly one person here (the Say addressee
     first), else nobody. The one found goes into the parse's targets, so
     the roll and the rest of the turn follow it. A pronoun two or more
     people here share goes to the one the last turn was said to, else the
     one the last narration walked in ("Jodie slips in": the owner's scene,
     with Brianna at her cart two doors down), else nobody; so does a line
     with two kinds of pronoun. Nobody: the bookkeeper may still name who it
     was (Rel.wireEvent's late flirt). Returns the id or null. */
  const ROMANCE_PRONOUNS = Object.freeze({ she: /\b(?:her|she|hers|herself)\b/i, he: /\b(?:him|he|his|himself)\b/i, they: /\b(?:them|they|themself|themselves)\b/i });
  function romanceTarget(ctx) {
    const s = State.current;
    const a = ctx.action;
    if (!s || !isObj(a) || !(a.romantic === 'flirt' || a.romantic === 'more' || a.romantic === true)) return null;
    const here = (ctx.presentIds || []).filter(id => State.npc(id));
    const sp = ctx.speech;
    if (isSay(sp) && (sp.to === 'everyone' || here.includes(sp.to))) return null;
    if ((Array.isArray(a.targets) ? a.targets : []).some(id => here.includes(id))) return null;
    const input = String(ctx.input || '').replace(/[’]/g, "'");
    const t = input.toLowerCase();
    const people = here.map(id => State.npc(id)).filter(n => typeof n.name === 'string' && n.name);
    const firstOf = n => n.name.toLowerCase().split(/\s+/)[0];
    const at = w => { const m = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).exec(t); return m ? m.index + m[1].length : -1; };
    let best = null;
    for (const n of people) {
      let pos = at(n.name.toLowerCase());
      const f = firstOf(n);
      if (pos < 0 && f.length >= 3 && people.filter(m => firstOf(m) === f).length === 1) pos = at(f);
      if (pos >= 0 && (!best || pos < best.pos)) best = { id: n.id, pos, how: 'named in the words' };
    }
    if (!best) {
      const kinds = Object.keys(ROMANCE_PRONOUNS).filter(k => ROMANCE_PRONOUNS[k].test(input));
      if (kinds.length === 1) {
        const k = kinds[0];
        const fits = people.filter(n => (PRONOUNS.includes(n.pronouns) ? n.pronouns : 'they') === k);
        // Two or more it fits: the one the last turn was said to, else the one the last narration walked in ("Jodie slips in"), if only one.
        const last = Array.isArray(s.log) && s.log.length ? s.log[s.log.length - 1] : null;
        const prev = isObj(last) && last.mode === 'say' ? fits.find(n => n.id === last.to) : null;
        const outside = isObj(last) && typeof last.narration === 'string' ? last.narration.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ') : '';
        const walked = fits.length > 1 && outside ? fits.filter(n => [n.name].concat(firstOf(n).length >= 3 && people.filter(m => firstOf(m) === firstOf(n)).length === 1 ? [n.name.split(/\s+/)[0]] : []).some(nm => arrivalRe(nm).test(outside))) : [];
        const word = `"${PRONOUN_OBJECT[k]}"`;
        const kind = k === 'they' ? 'person' : k === 'she' ? 'woman' : 'man';
        const to = isSay(sp) ? fits.find(n => n.id === sp.to) : null;
        const pick = to ? [to, `${word} is the one the words are said to`] : fits.length === 1 ? [fits[0], `${word} is the one ${kind} here`]
          : prev ? [prev, `${word}: the last turn was said to them`] : walked.length === 1 ? [walked[0], `${word}: the last narration walked them in`] : null;
        const one = pick ? pick[0] : null;
        if (one) best = { id: one.id, how: pick[1] };
        else State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `romance target: "${PRONOUN_OBJECT[k]}" ${fits.length ? `fits ${fits.length} people here` : 'fits nobody here'}: aimed at nobody` });
      } else if (kinds.length > 1) State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `romance target: the words have ${kinds.map(k => PRONOUN_OBJECT[k]).join(' and ')}: aimed at nobody` });
    }
    if (!best) return null;
    const was = Array.isArray(a.targets) && a.targets.length ? a.targets.join(', ') : 'nobody';
    a.targets = [best.id].concat((Array.isArray(a.targets) ? a.targets : []).filter(id => id !== best.id && !/^npc_/.test(String(id))));
    State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `romance target: ${best.id} (${best.how}; the parse had ${was})` });
    return best.id;
  }
  function romanceStep(ctx) {
    const a = ctx.action || {};
    romanceTarget(ctx);
    ctx.romance = Rel.romanceTurn({ action: a, speech: ctx.speech, presentIds: ctx.presentIds || [], input: ctx.input, phrase: Api.minorPhraseHit(ctx.input) });
    const r = ctx.romance;
    ctx.narratorLines.push(...r.lines);
    /* Wave 34: a flirt at an adult who knows the player well enough is a
       charm roll at their difficulty, whatever the parser said (the roll
       follows them: they lead the targets); resolve rolls it and
       romanceLanded decides the answers. Coercion never rolls. */
    if (r.roll && !r.coercion) {
      Object.assign(a, { needsRoll: true, stat: r.roll.stat, difficulty: r.roll.difficulty });
      a.targets = [r.roll.npcId].concat((a.targets || []).filter(id => id !== r.roll.npcId));
      ctx.romanceRoll = r.roll.npcId;
      const n = State.npc(r.roll.npcId);
      State.pushDebug({ turn: State.current.meta.turn, kind: 'rel', text: `flirt roll: charm, ${r.roll.difficulty} against ${n.id} (${Rel.tuningOf(n).difficulty}${Rel.tuningOf(n).listed ? '' : ', not listed'}; spark ${Rel.tracksOf(n).s})` });
    } else {
      // A flirt answered with no roll (too soon, a line to the room, a kid's, the night said yes to) rolls nothing, whatever the parser said.
      const at = (a.targets || []).find(id => (ctx.presentIds || []).includes(id));
      if (!r.coercion && a.needsRoll && at && r.answers.includes(at)) a.needsRoll = false;
      ctx.narratorLines.push(...Rel.romanceRolled(r, null));
      romanceBook(ctx);
    }
    // Wave 33: a romantic move the engine could not place: nobody answers in the narrator's packet, and the bookkeeper may say who it was.
    if (r.romantic && !r.aimed.length) ctx.bookLines.push('ROMANCE (seen by the engine): a romantic move aimed at nobody it could name; if the narration shows who it was aimed at and they are here, send "npc_id flirted: ..." for them, and the engine decides how it lands.');
    const minors = Object.keys(r.minors).filter(id => r.minors[id].flag || r.minors[id].phrase);
    if (r.romantic || minors.length) State.pushDebug({ turn: State.current.meta.turn, kind: 'rel', text: `romance: ${r.romantic || 'no flag'}${r.aimed.length ? ` at ${r.aimed.join(', ')}` : r.romantic ? ' aimed at nobody it could name' : ''}${r.coercion ? `; coercion on ${r.coercion.each.map(x => `${x.npcId} (${x.why}${x.room ? ', to the room' : ''})`).join(', ')}` : ''}${minors.length ? `; under 18: ${minors.map(id => `${id} (${['named', 'flag', 'phrase'].filter(k => r.minors[id][k]).join(', ')})`).join(', ')}` : ''}` });
    return r;
  }
  // Wave 29: who turned it aside, who was open to it, who said yes to the night; the engine records each (wave 34: told once the roll has decided).
  function romanceBook(ctx) {
    const r = ctx.romance;
    const names = ids => ids.map(id => State.npc(id).name).join(', ');
    const no = r.answers.filter(id => !r.welcome.includes(id));
    const open = r.welcome.filter(id => !r.intimate.includes(id));
    if (no.length) ctx.bookLines.push(`ROMANCE (decided by the engine): ${names(no)} turned it aside; record no flirt or compliment for it.`);
    if (open.length) ctx.bookLines.push(`ROMANCE (decided by the engine): ${names(open)} ${open.length > 1 ? 'were' : 'was'} open to it, and the engine records the flirt; record no flirt or compliment for it, and no newSeeds for it.`);
    if (r.intimate.length) ctx.bookLines.push(`ROMANCE (decided by the engine): ${names(r.intimate)} said yes to the night; the engine records it, and it is private; record nothing more for it, and no newSeeds for it.`);
  }
  /* Wave 34: after resolve, the flirt's answers by the charm roll
     (Rel.romanceRolled): the roll's tier; the same failed flirt pushed
     again (ctx.pressed: no new roll) is a no; no roll at all (a table's
     own resolution) is turned aside, kindly. The narrator and the
     bookkeeper are told. */
  function romanceLanded(ctx) {
    const r = ctx.romance;
    if (!r || !ctx.romanceRoll) return;
    const tier = ctx.roll && ctx.rollNpcId === ctx.romanceRoll ? ctx.roll.tier : ctx.pressed ? 'failure' : null;
    ctx.narratorLines.push(...Rel.romanceRolled(r, tier));
    romanceBook(ctx);
    State.pushDebug({ turn: State.current.meta.turn, kind: 'rel', text: `flirt landed: ${r.answers.map(id => `${id} ${r.welcome.includes(id) ? 'welcome' : r.flirts.some(f => f.npcId === id && f.ans.answer === 'no') ? 'no' : 'aside'}`).join(', ')}${tier ? ` (${tier})` : ' (no roll)'}` });
  }
  /* Wave 28 (the integration plan's 19.1): a romantic ask pushed with a
     threat, an intimidation, a lev_ id or the target's fear is refused, for
     anyone: no roll and nothing given, the d20 it would have drawn burned
     (Dice.burn), so fear's no-roll compliance never buys it. The engine
     records it at once: blackmailed (its row; the leverage record is wave
     29's) and crossed at full and weight 3 on them, a report to whoever
     looks out for them (World.coercion: always, "nobody" a grudge), the town
     -10 outside the turn's cap. Someone under 18 takes the minor rule on
     top, after narration (minorTurn). Wave 40: every one pushed
     (romance.coercion.each), on one burned d20 and one hit to the town:
     a named target as above (blackmailed carries the record the words
     named or used); a threat to the whole room (room) is the threat row
     for each adult here (threatened at its weight; blackmailed and crossed
     only where a record was named), with no report of its own. */
  function coerce(ctx) {
    const s = State.current;
    const each = (ctx.romance.coercion.each || [ctx.romance.coercion]).filter(x => State.npc(x.npcId));
    if (!each.length) return {};
    Dice.burn();
    ctx.coerced = each[0].npcId;
    ctx.coercedIds = each.map(x => x.npcId);
    ctx.rollNpcId = each[0].npcId;
    const place = placeName(here());
    // Wave 29 (the integration plan's 19.1): a record the player named is the threat it was: blackmailed carries it, and it is used, never backed.
    const ids = Array.isArray(ctx.action && ctx.action.aboutIds) ? ctx.action.aboutIds : [];
    let rep = true;
    for (const c of each) {
      const n = State.npc(c.npcId);
      const rec = Rel.holdsOver(n).find(x => x.id === c.leverageId || ids.includes(x.id)) || null;
      const events = c.room && !rec ? [{ npcId: n.id, event: 'threatened', text: `tried to push everyone into it with a threat at ${place}`, act: 'intimidate' }]
        : [Object.assign({ npcId: n.id, event: 'blackmailed', text: `tried to push me into it with a threat at ${place}`, act: 'intimidate' }, rec ? { leverageId: rec.id } : {}),
          { npcId: n.id, event: 'crossed', weight: 3, text: `tried to force me at ${place}` }];
      const r = State.apply(Object.assign({ socialEvents: events }, rec ? { effects: [Object.assign({ op: 'leverageSet', id: rec.id, aware: true, use: 'blackmailed' }, rec.status === 'held' ? { status: 'used' } : {})] } : {}));
      if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'coercion', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
      const m = (n.memories || []).slice().reverse().find(x => isObj(x) && x.event === events[0].event && x.turn === s.meta.turn);
      // The report for a named target; the town's word once a turn, however many were pushed.
      World.coercion(n.id, m ? m.key : `m${s.meta.turn}-${n.id}`, { report: !c.room, rep });
      rep = false;
    }
    const names = each.map(x => State.npc(x.npcId).name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    const idList = each.map(x => x.npcId).join(', ');
    ctx.bookLines.push(`COERCION (already applied by the engine: ${list} refused; what it cost the player with ${names.length > 1 ? 'each' : 'them'}, ${each.some(x => !x.room) ? 'the report' : 'the threat'} and the town's word): record no social event for ${idList}, no newSeeds for it (the engine has it), and nothing changes hands.`);
    State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `coercion refused for ${idList}: no roll, the d20 burned` });
    return {};
  }
  /* Wave 29 (the integration plan's 8.3 and 19.4): an ask backed by what
     the player holds over the one it is aimed at (an intimidation or a
     persuasion with the record in aboutIds, the words using it: never
     romantic, that is coercion). Weight 2 or more is no roll (the d20
     burned), weight 1 easy, a hard target normal, someone under 18 as the
     parse had it. Their answer is decided now (Rel.leverageAnswer) and told
     to the narrator in the present tense (LEVERAGE: ...): a price in the
     words (Rel.priceIn) is blackmailed, the demand on the record and a
     payment seed for the next day (origin leverage: the money, the record
     paid, paid_silence from them, liking -5), never money now; without one
     it is threatened_to_tell, and they know. A demand on a paid record is
     refused as one, and costs the player. The tough answer with violence,
     planted now; the hard who are not tough talk or report
     (World.leverageAnswered). Someone under 18 can raise nothing and goes
     to their family and the law (World.minorHarm). */
  function backedAsk(ctx, n, rec) {
    const s = State.current;
    const a = ctx.action;
    const p = s.player;
    const how = Rel.backedRoll(n, rec);
    ctx.backed = { id: rec.id, npcId: n.id };
    ctx.rollNpcId = n.id;
    let roll = null;
    if (!how.roll) {
      Dice.burn();
      State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `${n.id}: an ask backed by ${rec.id} (weight ${rec.weight}): no roll, the d20 burned` });
    } else {
      const rollOpts = { stat: a.stat || (a.actionType === 'intimidate' ? 'might' : 'charm'), difficulty: how.difficulty || a.difficulty || 'normal', usesItemId: a.usesItemId, npcId: n.id, actionType: a.actionType, presentIds: ctx.presentIds.slice() };
      roll = Dice.resolve(Object.assign({}, rollOpts, { d20: nextDie(rollOpts) }));
      ctx.roll = roll;
      lockAfter(roll, Dice.lockKey(a), false);
      UI.feed.roll(roll);
      complicationEffects(ctx, roll);
      storyPointFor(ctx, roll);
    }
    const price = Rel.priceIn(ctx.input);
    const ans = Rel.leverageAnswer(rec, n, { price, rolled: !!roll, success: roll ? roll.success : true });
    ctx.backed.answer = ans.answer;
    const day = s.time.day;
    const f = PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they;
    const text = ans.event === 'blackmailed' ? `${p.name} wanted ${money(price)} for keeping quiet` : `${p.name} threatened to tell what they know about me`;
    const set = { op: 'leverageSet', id: rec.id, aware: true, use: ans.event };
    if (rec.status === 'held') set.status = 'used';
    const effects = [set];
    if (ans.answer === 'pays' && ans.amount > 0) {
      set.demand = { amount: ans.amount, dueDay: day + 1, turn: s.meta.turn };
      const r = Rel.rng('pay', n.id, day);
      const words = [`${n.name} brings the ${money(ans.amount)} ${f.subj} agreed to and hands it over without a word.`, `${n.name} slips ${p.name} an envelope with the ${money(ans.amount)} in it and does not stay.`];
      effects.push({ op: 'plantSeed', seed: { id: `seed_pay_${n.id.slice(4)}_${s.meta.turn}`, cause: `Leverage: ${n.name} pays ${money(ans.amount)} for ${rec.id}`, effect: r.pick(words), trigger: { type: 'day', value: day + 1 }, hidden: true,
        origin: { kind: 'leverage', npcId: n.id, key: rec.id }, turn: s.meta.turn,
        effects: [{ op: 'playerGold', delta: ans.amount }, { op: 'leverageSet', id: rec.id, status: 'paid' }, { op: 'socialEvent', npcId: n.id, event: 'paid_silence', d: { w: -5, t: 0 }, text: `paid ${p.name} ${money(ans.amount)} to keep quiet`, leverageId: rec.id }] } });
    }
    const r = State.apply({ socialEvents: [{ npcId: n.id, event: ans.event, text: cleanText(text, 200), act: a.actionType === 'persuade' ? 'persuade' : 'intimidate', leverageId: rec.id }], effects });
    if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'leverage', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
    const m = (n.memories || []).slice().reverse().find(x => isObj(x) && x.event === ans.event && x.turn === s.meta.turn);
    if (ans.grudge) World.leverageAnswered(n.id, ans.grudge === 'violence' ? 'violence' : 'talk', m ? m.key : null);
    // A threat at someone under 18 goes to their family and the law at once (wave 28).
    World.minorHarm(n.id, 'threat');
    ctx.narratorLines.push(ans.line);
    ctx.bookLines.push(`LEVERAGE (already applied by the engine: ${n.name}'s answer, the threat and what it cost the player with them${ans.answer === 'pays' ? '; the money comes tomorrow, by the engine' : ''}): record no social event for ${n.id}, no goldDelta from them and no newSeeds for the payment: the engine has it.`);
    State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `${n.id}: backed by ${rec.id}, ${ans.event}, answer ${ans.answer}${ans.amount ? ` (${money(ans.amount)})` : ''}` });
    return {};
  }
  function resolve(ctx) {
    const s = State.current;
    const a = ctx.action;
    // Wave 28: coercion first, so neither fear's no-roll ceiling nor a backed ask (wave 29) can fire.
    if (ctx.romance && ctx.romance.coercion) return coerce(ctx);
    // Wave 29: an ask backed by what the player holds over the one it is aimed at (Rel.backedRecord), rolled or not, before anything else.
    const backedAt = a.targets.map(t => (ctx.presentIds.includes(t) ? State.npc(t) : null)).find(Boolean) || null;
    const backed = backedAt ? Rel.backedRecord(backedAt, a) : null;
    if (backed) return backedAsk(ctx, backedAt, backed);
    if (!a.needsRoll) return {};
    const npcTarget = a.targets.find(t => ctx.presentIds.includes(t));
    const attack = a.actionType === 'attack';
    /* Nobody to swing at or to ask (playtest B4, B17): a fight or an ask
       aimed only at people who are not here (NOT PRESENT says so), or an
       ask with nobody here at all to hear it, has no roll: no damage, no
       complication, no lock, no story point. */
    const social = Dice.SOCIAL_ACTIONS.includes(a.actionType) || isSay(ctx.speech);
    /* A theft from someone's person (wave 5, playtest Q10): their pocket is
       not here either. Wave 6 (the fifth review's risk): only a pickpocket;
       a theft from a place or a thing (their register, a thing here) still
       rolls Stealth while they are away. */
    const theft = a.actionType === 'steal' && pickpocket(a, ctx);
    const aimedAtPeople = a.targets.some(t => /^npc_/.test(t)) || (ctx.notPresent || []).some(x => x.reason === 'not_here' || x.reason === 'gone' || x.person);
    if ((attack || social || theft) && !npcTarget && (aimedAtPeople || (social && !ctx.presentIds.length))) {
      Object.assign(a, { needsRoll: false });
      return {};
    }
    // Who you fight sets how hard it is (wave 3, playtest D5): the target's threat wins over whatever difficulty the parser gave.
    if (attack && npcTarget) {
      const d = Dice.threat(State.npc(npcTarget));
      if (DIFFICULTIES.includes(d)) a.difficulty = d;
    }
    const key = Dice.lockKey(a);
    const exempt = attack && !!npcTarget;
    if (!exempt && Dice.isLocked(key) && !ctx.reroll) {
      // Pushing the same point in conversation again: no new roll (the dice
      // are not re-rolled), but the scene still answers, so the player sees
      // the person hold their ground instead of a system notice.
      if (isSay(ctx.speech) || Dice.SOCIAL_ACTIONS.includes(a.actionType)) {
        const last = s.log.slice().reverse().find(e => e.roll && /fail/i.test(String(e.roll.tier || e.roll.line || '')));
        ctx.pressed = { key, line: last && last.roll && last.roll.line ? last.roll.line : null };
        return {};
      }
      return { locked: true };
    }
    // Wave 34: a flirt's charm roll takes the liking modifier as a persuasion does (Rel.rollMod), whatever the parse called the action.
    const flirt = !!ctx.romanceRoll && npcTarget === ctx.romanceRoll;
    const rollOpts = { stat: a.stat || 'wits', difficulty: a.difficulty || 'normal', usesItemId: a.usesItemId, npcId: npcTarget, actionType: flirt ? 'persuade' : a.actionType, presentIds: ctx.presentIds.slice() };
    /* Fear's ceiling (wave 27, Rel.complies): an adult afraid of the player
       who is not hard does a small thing (talk or persuade, easy or normal)
       with no roll. The d20 that would have been drawn is still used up
       (Dice.burn), so the next roll and the clocks land where they would. */
    const asked = npcTarget ? State.npc(npcTarget) : null;
    if (asked && !flirt && Rel.complies(asked, a)) {
      Dice.burn();
      ctx.complied = asked.id;
      ctx.rollNpcId = asked.id;
      ctx.narratorLines.push(`AFRAID (no roll): ${asked.name} is afraid of ${s.player.name} and goes along with it at once; play it as fear, never as goodwill.`);
      ctx.bookLines.push(`NO ROLL (the engine: ${asked.name} is afraid of the player and did as asked): record what the narration shows them agreeing to or handing over.`);
      State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `${asked.id} complies out of fear (fear ${Rel.tracksOf(asked).f}): no roll, the d20 burned` });
      return {};
    }
    // How often this very ask (family and person) already worked here this phase: the next success earns less (Dice.diminishing).
    const before = key ? Dice.successes(key) : 0;
    const roll = Dice.resolve(Object.assign({}, rollOpts, { d20: nextDie(rollOpts) }));
    ctx.roll = roll;
    /* Whom the roll was against (wave 5): a failed ask settles nothing with
       them, and only with them. Wave 6 (the fifth review's risk): said to
       everyone, the one of them the player owes (an open obligation), when
       there is one among them, not just the first. */
    ctx.rollNpcId = flirt ? npcTarget : obligeeAmong(a.targets.filter(t => ctx.presentIds.includes(t))) || npcTarget || null;
    lockAfter(roll, key, exempt);
    if (roll.success && before > 0 && npcTarget && Dice.SOCIAL_FAMILIES.includes(Dice.family(a.actionType))) {
      ctx.diminish = { npcId: npcTarget, times: before, factor: Dice.diminishing(before) };
      const n = State.npc(npcTarget);
      ctx.narratorLines.push(`ASKED BEFORE: ${n ? n.name : 'they'} already went along with this same ask ${before === 1 ? 'once' : `${before} times`} this ${s.time.phase}. It works again, but it wears thinner: less warmth, a look, a shorter answer.`);
    }
    UI.feed.roll(roll);
    complicationEffects(ctx, roll);
    storyPointFor(ctx, roll);
    if (attack) fight(ctx, roll, npcTarget);
    rolledEvents(ctx, roll, npcTarget);
    // A flirt's critical failure is its own lasting consequence (the awkward memory: Rel.flirtAnswer).
    if (roll.tier === 'critical_failure' && !flirt) ctx.consequence = lastingConsequence(ctx);
    return {};
  }
  /* What the engine sees in a roll (wave 27; the integration plan's 4.1),
     applied at resolve as complications are: a threat (intimidate aimed at
     someone here: threatened, as its row on a success, liking -10 and fear
     +5 on a failure, liking -15 with two or more watching); a theft from
     someone here (a failed or partial one is stole_from at half, a success
     only when someone else saw it; a clean one nobody saw is only in their
     ask log); caught at it (a failed or partial theft or sneak that exactly
     one other person saw: caught_you_at for them, one record an act, never
     a fight); a rescue (rescueOf); and the ask log (relAsk) for a lie, a
     theft, a search or an attack aimed at someone. */
  /* Wave 40 (RELATIONSHIPS_PLAN section 10, decision 11): a clean theft
     from someone that nobody saw is no event at the time, but they may
     notice later. Each of the next FOUND_OUT.days days is a FOUND_OUT.chance
     on Rel.rng('foundOut', npcId, day, turn) (its own stream: the shared
     dice and every other seed draw the same), drawn now; the first day
     that comes up plants a hidden day seed (origin found_out). When it
     fires: their stole_from (the theft row at its own weight), the effect
     told to the player as a due event, and its news line in the Journal
     ("<Name> noticed what went missing, and has a fair idea who took
     it."). Nothing comes up: they never notice. No report seed of its
     own (the report templates are about threats and violence). */
  const FOUND_OUT = Object.freeze({ days: 3, chance: 0.4 });
  function foundOut(ctx, n) {
    const s = State.current;
    const day = s.time.day;
    const turn = s.meta.turn;
    const r = Rel.rng('foundOut', n.id, day, turn);
    let due = null;
    for (let d = 1; d <= FOUND_OUT.days && due === null; d++) if (r.next() < FOUND_OUT.chance) due = day + d;
    if (due === null) { State.pushDebug({ turn, kind: 'rel', text: `${n.id}: a clean theft nobody saw; they never notice` }); return null; }
    const words = `${n.name} noticed what went missing, and has a fair idea who took it.`;
    const seed = { id: `seed_found_${n.id.slice(4)}_${turn}`, cause: `Found out: ${n.name} notices the theft (${cleanText(ctx.action.summary || ctx.input, 120) || 'a theft'})`, effect: words,
      trigger: { type: 'day', value: due }, hidden: true, origin: { kind: 'found_out', npcId: n.id, key: `t${turn}-steal` }, turn,
      effects: [{ op: 'socialEvent', npcId: n.id, event: 'stole_from', text: `${s.player.name} stole from me`, act: 'steal' }, { op: 'addNews', text: words }] };
    const res = State.apply({ effects: [{ op: 'plantSeed', seed }] });
    if (res.rejected.length) { State.pushDebug({ turn, kind: 'rejected', source: 'engine', path: 'found out', reason: res.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') }); return null; }
    State.pushDebug({ turn, kind: 'rel', text: `${n.id}: a clean theft nobody saw; they notice on day ${due} (${seed.id})` });
    return seed;
  }
  function rolledEvents(ctx, roll, npcTarget) {
    const s = State.current;
    const p = s.player;
    const a = ctx.action;
    const target = npcTarget ? State.npc(npcTarget) : null;
    const place = placeName(here());
    const others = ctx.presentIds.filter(id => id !== npcTarget && !State.laidUp(State.npc(id)));
    const clean = roll.tier === 'success' || roll.tier === 'critical';
    const events = [];
    const asks = [];
    if (target && a.actionType === 'intimidate') {
      const crowd = others.length >= 2;
      const d = roll.success ? (crowd ? { w: -15 } : undefined) : { w: crowd ? -15 : -10, t: 0, f: 5 };
      events.push(Object.assign({ npcId: target.id, event: 'threatened', text: `threatened me at ${place}`, act: 'intimidate', witnesses: others, public: crowd }, d ? { d } : {}));
    }
    if (a.actionType === 'steal') {
      if (target) {
        if (!clean) events.push({ npcId: target.id, event: 'stole_from', text: `${p.name} tried to steal from me`, act: 'steal', scale: 0.5, public: others.length >= 2 });
        else if (others.length) events.push({ npcId: target.id, event: 'stole_from', text: `${p.name} stole from me`, act: 'steal', public: others.length >= 2 });
        // Wave 40 (decision 11): a clean one nobody saw may be found out in the days after (foundOut).
        else foundOut(ctx, target);
        asks.push({ npcId: target.id, act: 'steal', ok: roll.success, about: cleanText(a.summary, 120) });
      }
    }
    // Caught at it by the one other person who saw (wave 27: the memory and the ask log). Wave 29: a search too, and the record they hold over the player.
    const sneaky = a.actionType === 'steal' || a.actionType === 'sneak' || a.actionType === 'search';
    const watcher = others.length === 1 ? State.npc(others[0]) : !target && ctx.presentIds.length === 1 ? State.npc(ctx.presentIds[0]) : null;
    const caught = sneaky && !clean && watcher && watcher.id !== npcTarget ? watcher : null;
    if (caught && !(caught.memories || []).some(m => isObj(m) && m.event === 'caught_you_at' && m.turn === s.meta.turn)) {
      events.push(Object.assign({ npcId: caught.id, event: 'caught_you_at', text: a.actionType === 'steal' && target ? `caught ${p.name} trying to steal from ${target.name} at ${place}` : `caught ${p.name} ${a.actionType === 'search' ? 'going through things' : 'sneaking around'} ${place}` }, a.actionType === 'steal' ? { act: 'steal' } : {}));
      asks.push({ npcId: caught.id, act: a.actionType === 'steal' ? 'steal' : a.actionType === 'search' ? 'search' : 'sneak', ok: false, about: cleanText(a.summary, 120) });
    }
    if (target && (a.actionType === 'deceive' || a.actionType === 'search' || a.actionType === 'attack')) asks.push({ npcId: target.id, act: a.actionType, ok: roll.success, about: cleanText(a.summary, 120) });
    if (roll.success) events.push(...rescueOf(ctx, place));
    if (!events.length && !asks.length && !caught) return;
    /* Wave 29 (the integration plan's 19.4): the one who caught the player,
       with nobody else to see it and no news made, holds it over them (one
       record an act: its turn and action; never violence): a theft matters
       to the one robbed, a sneak or a search to the police head. The
       complication "{witness} catches you at it" gives the same memory and,
       by these limits, the same record. */
    const levs = [];
    if (caught) {
      const head = Rel.policeHead();
      levs.push({ holder: caught.id, over: 'player', about: { kind: 'seen' }, text: cleanText(a.summary || ctx.input, 120) || `${a.actionType} at ${place}`, weight: Rel.LEVERAGE_WEIGHT.caught[a.actionType] || 1,
        mattersTo: a.actionType === 'steal' && target ? [target.id] : head ? [head] : [], playerKnows: true, key: `t${s.meta.turn}-${a.actionType}`, via: 'caught_you_at' });
    }
    const r = State.apply(Object.assign(events.length ? { socialEvents: events } : {}, asks.length ? { relAsk: asks } : {}, levs.length ? { leverageAdd: levs } : {}));
    if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'rolled events', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
    // Wave 28: a threat at someone under 18 goes to their family and the law at once (World.minorHarm).
    if (events.some(e => e.event === 'threatened')) World.minorHarm(target.id, 'threat');
    const told = events.filter(e => e.event !== 'caught_you_at').map(e => `${State.npc(e.npcId).name} (${e.event.replace(/_/g, ' ')})`);
    if (told.length) ctx.bookLines.push(`ALREADY RECORDED BY THE ENGINE: ${told.join('; ')}: record no social event for it.`);
  }
  /* A rescue (wave 27; design section 3.1): a successful action aimed at
     someone in danger here (flags['danger.<id>'], World.markDanger: a seed
     marked danger fired this phase or the last, or a hurt the bookkeeper
     recorded from someone else), or an attack on the one putting them in
     it, is rescued (liking +25, trust +15, owed +2, a scar-class memory),
     with a lighter copy for the people watching. Never danger the player
     made: not when the player had already gone for the victim or the one
     doing it in this scene before the danger, and never for someone the
     player is attacking. The danger is used up. Returns the events. */
  function rescueOf(ctx, place) {
    const s = State.current;
    const a = ctx.action;
    const p = s.player;
    const fl = isObj(s.flags) ? s.flags : {};
    const out = [];
    const nowAt = PHASES.indexOf(s.time.phase);
    for (const id of ctx.presentIds) {
      const raw = fl[`danger.${id}`];
      if (typeof raw !== 'string') continue;
      const [day, phase, where, by, turn] = raw.split('|');
      const at = PHASES.indexOf(phase);
      if (toInt(day) !== s.time.day || at < 0 || nowAt - at < 0 || nowAt - at > 1 || where !== p.locationId) continue;
      const aimed = a.targets.includes(id) && !(a.actionType === 'attack' && a.targets[0] === id);
      const onAggressor = a.actionType === 'attack' && !!by && a.targets.includes(by);
      if (!aimed && !onAggressor) continue;
      // The player's own doing: they had already gone for either of them here before it began.
      const since = toInt(turn) || 0;
      const fought = [id, by].filter(Boolean).some(x => ((State.npc(x) || {}).memories || []).some(m => isObj(m) && isObj(m.d) && Rel.EVENTS[m.event] && Rel.EVENTS[m.event].dedupe === 'violence' && !m.witness && m.place === p.locationId && m.day === s.time.day && m.turn <= since));
      if (fought) continue;
      const aggressor = by ? State.npc(by) : null;
      out.push({ npcId: id, event: 'rescued', text: `${p.name} stepped in for me${aggressor ? ` when ${aggressor.name} had me` : ''} at ${place}`, witnesses: ctx.presentIds.filter(x => x !== id && x !== by) });
      State.apply({ effects: [{ op: 'setFlag', key: `danger.${id}`, value: null }] });
    }
    return out;
  }

  // ----- the card game -----
  /* REVIEW 3.8: a card game played in code where there is one (a place
     whose record says so: cardGame, or "card game" in its details) and its
     dealer is here (a person tagged bookie, or tagged dealer with cards in
     their role). The stake comes from the words (stakeFor), no more than
     the player has.
     Wave 10 (the owner: "Poker is so confusing with texts. When playing
     poker, there should be a proper ui to see everything and a cheat to
     win"): five-card draw, played at a table in the feed (UI.feed.cards).
     The deck is shuffled from a generator seeded by the game's seed and the
     turn (cardSeed), so /undo and a replay deal the same hand. Five each;
     the player holds what they like and draws, or folds; the dealer draws
     by Cards.dealerHolds; the better hand wins. A win pays the stake, a
     loss costs it, a split pot moves nothing, a fold costs half (rounded
     up since wave 11: foldPrice). Wits is a read, not the result: one line
     over the dealer's cards, right 60% + 12% a point of Wits (its modifiers
     too), 50 to 95% (readOdds). A marked deck on the player turns the
     dealer's cards face up (they read the marks) and is the only roll:
     Wits against normal, +2 for the deck, once the hand is played; a
     fumble is caught cheating (the hand is void, the stake lost, the deck
     taken, a weight-3 memory, -20, banned three days with today, news, put
     out on the street, and the dealer will not deal to them for a week).
     /cheat cards (flags.cardsCheat) stacks the next hand so the player
     wins it, with no roll and nothing on record. The money moves here; the
     narrator hears the hands and the result (OUTCOME) and the bookkeeper
     that it is done (its goldDelta is ignored); the log entry keeps the
     table (entry.cards) for the feed.
     Wave 11 (the QA of the table): once the cards are dealt the ante is
     in. Stop with the hand open folds it (the fold price, and the marked
     deck's catch roll), and the turn is committed, told plainly by the
     engine (plainNarration); after the showdown the hand is final, so a
     narrator that fails, is stopped or declines leaves the hand told
     plainly too, never taken back and dealt again. /reroll of a hand
     replays it from its record and rolls only the catch again. */
  const GAMBLE_STAKE = 20;
  // Caught cheating: not welcome for three days, today counted (the narrator's "three days" and the ban agree).
  const CAUGHT_BAN_DAYS = 3;
  // After catching the player the dealer will not deal to them for a week, today counted, nor while he is this cold to them (wave 11, L6).
  const DEALER_GRUDGE_DAYS = 7;
  const DEALER_COLD = -10;
  // The read (wave 11, S3: so Wits matters): right READ_BASE% + READ_STEP% a point of Wits, 50% to 95%.
  const READ_BASE = 60;
  const READ_STEP = 12;
  /* What a fold costs: half the stake, rounded up (wave 11, L4: $1 of $1, $10 of $20, $13 of $25). */
  function foldPrice(stake) { return Math.ceil(Math.max(0, toInt(stake) || 0) / 2); }
  /* The street outside a place (wave 4, playtest R2): an exit that is a
     street, a road or a lot, else the first open exit; known, open and in
     town. Where someone thrown out of the card game ends up. */
  const OUTSIDE_TYPES = ['street', 'road', 'parking', 'lot', 'highway', 'town'];
  function outsideOf(l) {
    const exits = ((l && l.exits) || []).map(id => State.loc(id)).filter(x => x && x.discovered && !isShut(x) && x.away !== true);
    return exits.find(x => OUTSIDE_TYPES.includes(String(x.type || '').toLowerCase())) || exits[0] || null;
  }
  function cardGameAt(l) {
    if (!l) return false;
    if (l.cardGame === true || (Array.isArray(l.tags) && l.tags.includes('cards'))) return true;
    return /\b(card game|poker game|card table)\b/i.test(`${l.details || ''} ${l.description || ''}`);
  }
  // Who deals cards: a person tagged bookie, or tagged dealer with cards in their role.
  function isBookie(n) { return !!n && (n.tags || []).includes('bookie'); }
  function isCardDealer(n) { return !!n && (n.tags || []).includes('dealer') && /\bcards?\b|card game|poker/i.test(n.role || ''); }
  function dealerOf(presentIds) {
    const people = (presentIds || []).map(id => State.npc(id)).filter(Boolean);
    return people.find(isBookie) || people.find(isCardDealer) || null;
  }
  /* When a place's dealer sits at its table today (wave 11, L7): "Curtis
     Pruett deals in the afternoon, evening and night", or '' when nobody
     does. labelled (the demo's words, wave 12, L10): someone the player has
     not met is named as the Say picker names them ("The card dealer deals
     …"). */
  function dealerHours(l, labelled) {
    const by = [];
    for (const ph of PHASES) {
      const d = dealerOf(State.npcsAt(l.id, ph).map(n => n.id));
      if (!d) continue;
      let row = by.find(x => x.id === d.id);
      if (!row) by.push(row = { id: d.id, name: labelled ? capFirst(npcLabel(d)) : d.name, phases: [] });
      row.phases.push(ph);
    }
    return by.length ? `${by[0].name} deals in the ${andList(by[0].phases)}` : '';
  }
  /* Whether the dealer will deal to the player (wave 11, L6): not for a
     week after he caught them cheating (flags['cardsCaught.<id>'] is the
     day), nor while his attitude to them is under DEALER_COLD. Returns {
     caughtDay } or { cold: true }, or null when he deals. */
  // Wave 28 (Rel.GATES.dealer): nor while he does not trust them at all (trust -40 or less).
  function dealerRefusal(dealer, s) {
    if (!dealer || !s) return null;
    const caught = toInt(isObj(s.flags) ? s.flags[`cardsCaught.${dealer.id}`] : null);
    if (caught !== null && s.time.day - caught < DEALER_GRUDGE_DAYS) return { caughtDay: caught };
    if ((toInt(dealer.attitude) || 0) < DEALER_COLD || Rel.tracksOf(dealer).t <= Rel.GATES.dealer.trust) return { cold: true };
    return null;
  }
  /* The first day from `day` on that a place is open (wave 11, L6: a ban
     that ends on a Sunday the bar is shut says the Monday). */
  function openDayFrom(l, day) {
    let d = day;
    for (let i = 0; i < 7 && l && State.isClosed(l, d); i++) d++;
    return d;
  }
  /* The day a ban lets the player back in (wave 12, L9): the first day from
     its untilDay that the place is open, so every line about one ban (the
     walk to the door, Go there, the People card, the Places panel, the
     OUTCOME of being caught) names the same day. */
  function banBackDay(ban) {
    if (!isObj(ban) || !Number.isInteger(ban.untilDay)) return null;
    return openDayFrom(State.loc(ban.locationId), ban.untilDay);
  }
  /* The stake the words name (wave 11, M5): "$50", "50 bucks", "$2.50" (a
     dollar amount is whole: $2), "fifty dollars", "a hundred bucks", a bare
     number after a bet ("I raise 20", "I'm in for fifty", "I put 30 in");
     "-$5" is negative; "a fiver", "a tenner", "two grand" (wave 12, L8).
     "Everything", "all I have", "all in" (and nothing named) is all the
     cash; "half my money", "half of what I have" is half of it, rounded
     down, at least $1 (wave 12, L8). stakeFor(text, gold) -> { stake,
     named (the amount named, to the cent, or null), note: 'all' (the stake
     is all the cash they have: asked for, or more than they have, or all
     of it) | 'half' (half of it, as asked) | 'usual' (an amount under $1,
     zero or negative, so the usual $20: "$0.50 is no stake") | null }. A
     stake is never more than the cash, and at least $1. */
  const ALL_IN = /\b(?:all[\s-]in|it\s+all|everything(?:\s+i(?:\s+have|'ve got|\s+got))?|all\s+(?:i|i've)\s+(?:have|got)|all\s+(?:of\s+)?my\s+(?:money|cash)|every\s+(?:dollar|cent|penny)|the\s+(?:whole|entire)\s+(?:roll|stack|bankroll|wad|pile))\b/i;
  const ONLY_ARTICLES = /^(?:(?:a|an|and)[\s-]*)+$/i;
  const HALF_IN = /\bhalf\s+(?:of\s+)?(?:(?:my|the)\s+(?:money|cash|stack|roll|bankroll|wad|pile|winnings)|what\s+i(?:\s+have|'ve\s+got|\s+got)|everything(?:\s+i\s+have)?|it\s+all|all\s+(?:i|i've)\s+(?:have|got))\b/i;
  // An amount to the cent, as named ("0.50 dollars" is 0.5): the stake is its whole dollars.
  const cents = n => Math.round(n * 100) / 100;
  function namedStake(text) {
    const t = String(text || '').replace(/[’]/g, "'").replace(/[−–]/g, '-');
    const d = /(-)?\s*\$\s*(-)?\s*(\d[\d,]*(?:\.\d+)?)|(-)?\b(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|bucks?)\b/i.exec(t);
    if (d) {
      const n = cents(parseFloat((d[3] || d[5]).replace(/,/g, '')));
      if (Number.isFinite(n)) return d[1] || d[2] || d[4] ? -n : n;
    }
    const NUM = Style.NUMBER_WORD;
    // "a fiver", "two tenners", "a grand", "5 grand" (wave 12, L8).
    const slang = new RegExp(`\\b(?:(\\d+|${NUM}(?:[\\s-]+${NUM})*)\\s+)?(fiver|tenner)s?\\b|\\b(\\d+|${NUM}(?:[\\s-]+${NUM})*)\\s+grand\\b`, 'i').exec(t);
    if (slang) {
      const count = slang[1] || slang[3] || '';
      const k = !count || ONLY_ARTICLES.test(count.trim()) ? 1 : /\d/.test(count) ? parseInt(count, 10) : Style.numberWords(count.trim());
      if (Number.isFinite(k) && k > 0) return k * (slang[2] ? (/^f/i.test(slang[2]) ? 5 : 10) : 1000);
    }
    const w = new RegExp(`\\b(${NUM}(?:[\\s-]+${NUM})*)\\s+(?:dollars?|bucks?)\\b`, 'i').exec(t);
    if (w && !ONLY_ARTICLES.test(w[1].trim())) { const n = Style.numberWords(w[1]); if (n !== null) return n; }
    const put = /\bput\s+(\d[\d,]*)\s+(?:in|into|on|down)\b/i.exec(t);
    if (put) return parseInt(put[1].replace(/,/g, ''), 10);
    const bare = new RegExp(`\\b(?:bet|bets|betting|wager|wagers|raise|raises|raising|stake|in for|put in|ante up|play for)\\s+(?:(?:you|ya)\\s+)?(-?\\d[\\d,]*(?:\\.\\d+)?|${NUM}(?:[\\s-]+${NUM})*)(?![\\w$])`, 'i').exec(t);
    if (bare) {
      const x = bare[1].trim();
      if (/\d/.test(x)) { const n = Math.floor(parseFloat(x.replace(/,/g, ''))); if (Number.isFinite(n)) return n; }
      else if (!ONLY_ARTICLES.test(x)) { const n = Style.numberWords(x); if (n !== null) return n; }
    }
    return null;
  }
  /* again (wave 20, QA N9): the stake of the last hand at this table today,
     which "another hand" with no stake named plays at (gamble). */
  const ANOTHER_HAND = /\b(?:another|one more)\s+hand\b/i;
  function stakeFor(text, gold, again) {
    const cash = Math.max(0, toInt(gold) || 0);
    const named = namedStake(text);
    const words = String(text || '').replace(/[’]/g, "'");
    const half = named === null && HALF_IN.test(words);
    const all = named === null && !half && ALL_IN.test(words);
    // Whole dollars: under $1 is no stake (the usual $20).
    const whole = named === null ? null : Math.floor(named);
    const last = whole === null && Number.isInteger(again) && again >= 1 && ANOTHER_HAND.test(words) ? again : null;
    const want = all ? cash : half ? Math.floor(cash / 2) : last !== null ? last : whole === null || whole <= 0 ? GAMBLE_STAKE : whole;
    const stake = clamp(want, 1, Math.max(1, cash));
    const note = stake >= cash ? 'all' : whole !== null && whole <= 0 ? 'usual' : half ? 'half' : null;
    return { stake, named, note };
  }
  function stakeFrom(text, gold) { return stakeFor(text, gold).stake; }
  /* An amount as named, to the cent when it has cents: "$0.50", "−$5", "$500". */
  function moneyNamed(n) { const v = Math.abs(n); return `${n < 0 ? '−' : ''}${money(Number.isInteger(v) ? v : v.toFixed(2))}`; }
  /* The stake as the narrator hears it: "$140, all they have; they named $500", "$20, the usual stake: $0.50 is no stake", "$70, half of what they have". */
  function stakeWords(t) {
    const named = Number.isFinite(t.named) ? t.named : null;
    if (t.stakeNote === 'all') return `${money(t.stake)}, all they have${named !== null && named > t.stake ? `; they named ${moneyNamed(named)}` : ''}`;
    if (t.stakeNote === 'usual') return `${money(t.stake)}, the usual stake${named !== null ? `: ${moneyNamed(named)} is no stake` : ''}`;
    if (t.stakeNote === 'half') return `${money(t.stake)}, half of what they have`;
    return money(t.stake);
  }
  /* The most a seat can put in (wave 14, QA #16: five units at hold'em,
     less than a stake that was not a multiple of $5). Wave 18: bets are
     free, so it is the whole stake (the buy-in) in both games. */
  function holdemCap(stake) { return toInt(stake) || 0; }
  /* A marked deck on the player: it shows them the dealer's cards, and is what gets them caught; a plain deck is only cards. */
  function markedDeck(p) { return p.inventory.find(i => i.qty > 0 && /\bdeck\b/i.test(i.name) && /\bmarked\b/i.test(`${i.name} ${i.notes || ''}`)) || null; }
  /* The deck's generator for this turn: the game's seed and the turn number, nothing else (the same hand after /undo). */
  function cardSeed(s) { return ((Math.imul((s.meta.seed >>> 0) ^ 0x5bd1e995, 0x01000193) ^ Math.imul((s.meta.turn | 0) + 1, 0x9e3779b1)) >>> 0) || 1; }
  /* How often the player's read of the dealer is right: 60% + 12% a point of Wits (and of its modifiers: Tired and the like), 50% to 95%. */
  function readOdds(s) {
    const wits = clamp(toInt(s.player.stats && s.player.stats.wits) || 0, -1, 3) + Dice.sumModifiers(Dice.modifiersFor(s, { stat: 'wits', actionType: 'gamble', social: false }));
    return clamp(READ_BASE + READ_STEP * wits, 50, 95) / 100;
  }
  /* The read in words (wave 11, S3: a read on the man, not his hand). */
  function readText(says, first) { return says === 'something' ? `${first} has something` : `${first} is bluffing`; }
  /* A turn's hand from its seed (cardSeed): the deal, the dealer's draw
     (it never hangs on the player's) and the player's read of how he ends
     up, right with the odds given (readOdds): says 'something' (a pair or
     better after his draw) or 'nothing'. stacked: /cheat cards. set: {
     player, dealer, playerPile, dealerPile, seatHands: [{ hand, pile }] }
     dealt as given (tests: hooks.cardsDeal), the read still from the seed.
     Wave 13: seats (0-3) are the other players at a multi-way table, each
     dealt five after the dealer's and the player's and drawing by the
     dealer's rule (seatPlay), so a heads-up deal is as it was. */
  function dealHand(seed, odds, stacked, set, seats) {
    const rng = Rng.create(seed);
    const given = isObj(set) && Array.isArray(set.player) && Array.isArray(set.dealer);
    const n = given ? (Array.isArray(set.seatHands) ? set.seatHands.length : 0) : clamp(toInt(seats) || 0, 0, SEATS_MAX);
    const dealt = given
      ? { player: set.player.slice(), dealer: set.dealer.slice(), playerPile: (set.playerPile || []).slice(), dealerPile: (set.dealerPile || []).slice(), seats: (set.seatHands || []).map(x => ({ hand: x.hand.slice(), pile: (x.pile || []).slice() })) }
      : Cards.deal(rng, { stacked: !!stacked, seats: n });
    const dealerHolds = Cards.dealerHolds(dealt.dealer);
    const dealerFinal = Cards.draw(dealt.dealer, dealerHolds, dealt.dealerPile);
    const has = Cards.evaluate(dealerFinal).rank >= 1;
    const right = rng.next() < odds;
    const seatPlay = (dealt.seats || []).map(x => { const held = Cards.dealerHolds(x.hand); return { dealt: x.hand.slice(), held, final: Cards.draw(x.hand, held, x.pile) }; });
    return Object.assign(dealt, { dealerHolds, dealerFinal, seatPlay, read: { says: right === has ? 'something' : 'nothing', right, odds } });
  }

  // ----- wave 13: two games, more seats, the win cheat -----
  /* The owner: "Keep both and build holdem too", "for some games have it so
     there's more than the 2 of us", "when the game start have a cheat win
     somewhere so i can skip the whole game and win". The game is named in
     the words (gameFrom) or remembered (flags.cardGame, the engine-only
     State op cardGame); with neither, the table opens with a chooser. Other
     seats come from the card people present (tagged cardplayer: alive, not
     the dealer, warmer than -25): per hand, from the hand's seed, none, one
     or two of them sit in; "deal everyone in" seats all of them (three at
     most), "heads up" or "just me and Curtis" none. Each seat risks at most
     the stake, so there are no side pots. */
  const CARD_GAMES = Object.freeze(['draw', 'holdem']);
  const GAME_NAMES = Object.freeze({ draw: 'Five-card draw', holdem: "Texas hold'em" });
  const CARD_TAG = 'cardplayer';
  const SEATS_MAX = 3;
  const SEAT_COLD = -25;
  // The board turned over at each street: none before the flop, three at the flop, one at the turn, one at the river.
  const STREET_CARDS = Object.freeze([0, 3, 4, 5]);
  const STREET_WORDS = Object.freeze(['before the flop', 'on the flop', 'on the turn', 'on the river']);
  // The first word of a name ("Wade" of "Wade Purvis"; wave 47: not State.firstName, which takes a person and skips titles).
  function firstWord(name) { return String(name || '').split(/\s+/)[0]; }
  /* The game the words name: hold'em (hold'em, holdem, hold em, texas) or
     draw (draw, five-card, five card, 5-card, draw poker); the last one
     named, unless it is the one being left ("not draw", "instead of
     hold'em"); null when neither is. Wave 14 (QA #17): drawing cards is
     not the game: "draw to an inside straight", "draw two", "draw three
     cards", "draw five cards", "draw a card", "draw the queen". Wave 15: a
     game named right before it is put down ("draw poker is for old men",
     "hold'em isn't my game", "draw is no fun", "hold'em is not for me",
     "draw, not for me") is the one being left too. */
  const HOLDEM_WORD = /\btexas\b|\bhold[\s'-]*'?em\b|\bholdem\b/gi;
  const DRAW_WORD = /(?<!\bdraw(?:ing|s)?\s+)\b(?:five|5)[\s-]*cards?(?:\s+draw)?\b|\bdraw\s+poker\b|\bdraw\b(?!\s+(?:my|a|an|the|his|her|their|your|our|it|them|him|me|us|out|from|on|up|back|cards?|breath|attention|blood|straws?|lots|near|close|closer|level|steel|iron|fire|water|money|cash|gun|pistol|knife|to|into|one|two|three|four|five|[1-5]|another|some|new)\b)/gi;
  const NOT_THIS = /(?:\bnot|\binstead\s+of|\brather\s+than|\bno\s+more|\bswitch(?:ing)?\s+from|\bfrom|\bover)\s+(?:a\s+(?:hand|game)\s+of\s+|the\s+)?$/i;
  // Said of the game just named (wave 15): the rest of its name ("texas" then "hold'em", "draw" then "poker"), then a put-down; "is for me" is not one.
  const PUT_DOWN = /^(?:\s*(?:texas|hold[\s'-]*'?em|holdem|poker|draw|five[\s-]*card|5[\s-]*card))*\s*(?:(?:is|'s)\s+for\b(?!\s+(?:me|us|real|keeps)\b)|(?:isn'?t|(?:is|'s)\s+not)\b(?!\s+(?:so\s+|too\s+|half\s+)?bad\b)|(?:is|'s)\s+no\b|[,;:-]?\s*not\s+for\s+me\b)/i;
  function gameFrom(words) {
    const t = String(words || '').replace(/[’‘]/g, "'");
    const found = [];
    for (const [game, re] of [['holdem', HOLDEM_WORD], ['draw', DRAW_WORD]]) {
      re.lastIndex = 0;
      for (let m = re.exec(t); m; m = re.exec(t)) found.push({ game, at: m.index, away: NOT_THIS.test(t.slice(0, m.index)) || PUT_DOWN.test(t.slice(m.index + m[0].length)) });
    }
    found.sort((a, b) => a.at - b.at);
    const kept = found.filter(x => !x.away);
    if (kept.length) return kept[kept.length - 1].game;
    // Only the one being left is named ("not hold'em"): the other.
    const away = found.length ? found[found.length - 1].game : null;
    return away ? (away === 'holdem' ? 'draw' : 'holdem') : null;
  }
  function rememberedGame() { const s = State.current; const g = s && isObj(s.flags) ? s.flags.cardGame : null; return CARD_GAMES.includes(g) ? g : null; }
  /* How many sit in, from the words: 'all' ("deal everyone in", "everyone
     in"), 'none' ("heads up", "just me and Curtis", "just us"), or null. */
  const SEATS_ALL = /\b(?:deal|deals|dealing|let)\s+(?:everyone|everybody|every\s+body|us\s+all|all\s+of\s+us|the\s+(?:whole\s+)?table)\s+in\b|\b(?:everyone|everybody)(?:'s)?\s+in\b|\b(?:full|whole)\s+table\b|\beveryone\s+(?:plays|sits\s+in|at\s+the\s+table)\b/i;
  const SEATS_NONE = /\bheads[\s-]*up\b|\bjust\s+(?:me\s+and\s+(?:you|him|her|the\s+dealer|[a-z]+)|you\s+and\s+me|us(?:\s+two)?|the\s+two\s+of\s+us)\b|\bone[\s-]+on[\s-]+one\b|\bnobody\s+else\b/i;
  function seatWords(words) {
    const t = String(words || '').replace(/[’‘]/g, "'");
    if (SEATS_NONE.test(t)) return 'none';
    if (SEATS_ALL.test(t)) return 'all';
    return null;
  }
  /* The card people here who can sit in (the cast's own: the game never
     makes a person): tagged cardplayer, alive, not the dealer, attitude
     above SEAT_COLD; in the order the place lists them. */
  function cardPeople(presentIds, dealer) {
    const s = State.current;
    // A game saved before wave 13 has the cast without the tag: the town's own record says who plays (the built-in town).
    const cast = s && s.meta.townName === TOWN_DATA.name ? new Set(TOWN_DATA.npcs.filter(x => (x.tags || []).includes(CARD_TAG)).map(x => x.id)) : new Set();
    // Wave 28 (Rel.GATES.seats): and trust above -40.
    return (presentIds || []).map(id => State.npc(id)).filter(n => n && (!dealer || n.id !== dealer.id) && n.alive !== false && ((n.tags || []).includes(CARD_TAG) || cast.has(n.id)) && (toInt(n.attitude) || 0) > SEAT_COLD && Rel.tracksOf(n).t > Rel.GATES.seats.trust);
  }
  /* Who sat at a hand played this turn (wave 15): the dealer and the seats
     (ids), from ctx.gamble; [] when no hand was played. They were at the
     table for it, so neither the narrator's packet nor the demo tells them
     as arriving after it. */
  function seatedAt(g) {
    if (!isObj(g) || g.played !== true) return [];
    return [g.dealerId].concat((Array.isArray(g.seats) ? g.seats : []).map(x => x && x.id)).filter(id => typeof id === 'string');
  }
  /* Who sits in this hand besides the player and the dealer: the words
     first, then the hand's seed (none, one or two, each a third of the
     time). hooks.cardsSeats (tests, the console): these ids, of the card
     people here, for every hand until it is cleared; a hand dealt as given
     (hooks.cardsDeal) has its own seats (set.seats) or none. */
  function seatsFor(ctx, dealer, seed, set) {
    const pool = cardPeople(ctx.presentIds, dealer);
    const pickIds = ids => ids.map(id => pool.find(n => n.id === id)).filter(Boolean).slice(0, SEATS_MAX);
    if (set) return pickIds(Array.isArray(set.seats) ? set.seats : []);
    if (Array.isArray(hooks.cardsSeats)) return pickIds(hooks.cardsSeats);
    const w = seatWords(ctx.input);
    if (w === 'none') return [];
    if (w === 'all') return pool.slice(0, SEATS_MAX);
    const rng = Rng.create(((seed ^ 0x2545f491) >>> 0) || 1);
    const k = Math.min(rng.int(0, 2), pool.length);
    const chosen = Cards.shuffle(rng, pool.map(n => n.id)).slice(0, k);
    return pool.filter(n => chosen.includes(n.id));
  }
  /* A seat's play (wave 13): from how good the hand is (Cards.strength) and
     a tilt from who they are: a reckless, greedy or sly sort bets and
     bluffs more, a cautious one folds more. coin: a draw of the hand's
     seed for one seat, street and question, so the same hand plays the
     same way after a reload, an /undo or a replay. */
  const BOLD_TRAIT = /^(?:reckless|greedy|bold|brash|hot-?headed|impulsive|ambitious|sly|cocky|arrogant|ruthless|smooth|flashy|showy|charming|daring|wild|swaggering)$/i;
  const CAREFUL_TRAIT = /^(?:cautious|careful|cowardly|timid|nervous|anxious|gloomy|honest|meek|shy|worried|frugal|thrifty|stingy|prudent|wary|guarded|fearful)$/i;
  function tiltOf(n) {
    let t = 0;
    for (const x of (n && n.personality) || []) { if (BOLD_TRAIT.test(x)) t += 0.1; else if (CAREFUL_TRAIT.test(x)) t -= 0.1; }
    return clamp(t, -0.15, 0.15);
  }
  function coin(seed, seat, street, ask) {
    return Rng.valueAt(((seed >>> 0) ^ Math.imul(seat + 1, 0x9e3779b1) ^ Math.imul(street + 1, 0x85ebca6b) ^ Math.imul(ask + 1, 0xc2b2ae35)) >>> 0, 0);
  }
  /* ----- wave 18: no-limit betting -----
     The owner: "Make the poker game interactive, as in I decide how much
     money to add, go all in, etc." The stake S is the buy-in: the chips
     the player brings to the table and the most they can lose; every seat
     sits with S, so the stacks start equal and there are no side pots (a
     seat that has matched every bet has as much left as the player). The
     house rules come from S (the owner's story: "$20 to sit, $1 ante", and
     the earlier build's $4 bet at $20): the ante a (anteFor: a twentieth of
     S, at least $1) and the bet b (unitFor: a fifth of S, at least $1, wave
     13's unit). Every seat antes a. Hold'em has four rounds of betting, the
     player first on each; five-card draw one, after the draw. On a round:
     check, or bet b or more in multiples of b, up to all in (whatever is
     left, the one amount that need not be a multiple); facing a bet: call,
     raise to at least the bet plus the last raise (rounded up to a multiple
     of b; when the stack is short of that, all in is the raise), or fold.
     Four raises a round at most, then only call or fold. An amount that is
     not a multiple of b goes up to the next one, and one that would leave
     less than b behind is all in. The player's moves are Cards.move
     strings (bet:8, raise:24, allin, call, check, fold, win; hold:024 at
     draw), kept on the stored hand and the record, so a hand plays again
     exactly from them. */
  const MAX_RAISES = 4;
  const DRAW_WORDS = Object.freeze(['before the draw', 'after the draw']);
  function anteFor(stake) { return Math.max(1, Math.floor((toInt(stake) || 0) / 20)); }
  /* The table's bet (wave 13's unit, a fifth of the stake, at least $1: $4 at $20, $20 at $100): wave 18 keeps it as the least bet and the step of every bet and raise. */
  function unitFor(stake) { return Math.max(1, Math.floor((toInt(stake) || 0) / 5)); }
  /* The house rules in words, as the dealer says them: "Twenty to sit, a dollar ante, four-dollar limit." ("…, no limit." at table stakes). */
  const SMALL_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function countWords(n) {
    if (n < 20) return SMALL_WORDS[n];
    if (n < 100) return TENS_WORDS[Math.floor(n / 10)] + (n % 10 ? `-${SMALL_WORDS[n % 10]}` : '');
    const h = Math.floor(n / 100);
    return `${h === 1 ? 'a' : SMALL_WORDS[h]} hundred${n % 100 ? ` and ${countWords(n % 100)}` : ''}`;
  }
  function dollarWords(n) { return n === 1 ? 'one-dollar' : n < 1000 ? `${countWords(n)}-dollar` : money(n); }
  function rulesWords(stake, structure) {
    const S = toInt(stake) || 0;
    const a = anteFor(S);
    const sit = S < 1000 ? capFirst(countWords(S)) : money(S);
    // Wave 19 (QA D15): an ante of $100-$199 is "a hundred-dollar ante" (its words start with "a" already), never "a a".
    const ante = a === 1 ? 'a dollar' : a < 1000 ? (/^a /.test(countWords(a)) ? dollarWords(a) : `${/^(?:eight|eleven|eighteen|eighty)/.test(countWords(a)) ? 'an' : 'a'} ${dollarWords(a)}`) : `a ${money(a)}`;
    return `${sit} to sit, ${ante} ante, ${structure === 'nolimit' ? 'no limit' : `${dollarWords(unitFor(S))} limit`}.`;
  }
  /* The house rules as figures, for the narrator: "$20 to sit, $1 ante, $4 limit" or "…, no limit (bets from $4, up to all in)". */
  function rulesText(stake, structure) {
    return `${money(stake)} to sit, ${money(anteFor(stake))} ante, ${structure === 'nolimit' ? `no limit (bets from ${money(unitFor(stake))}, up to all in)` : `${money(unitFor(stake))} limit (every bet and raise ${money(unitFor(stake))})`}`;
  }
  /* The table's structure today (wave 18, amendment 2: the owner's story
     has the dealer set the terms, so the house game is limit and no limit
     is something the player asks for). Limit, unless the dealer agreed to
     table stakes today (flags['cardsNoLimit.<id>'] is the day, set through
     the engine's setFlag effect by stakesAsk). hooks.cardsStructure (tests,
     the console): 'limit' or 'nolimit' for every hand until a reload. */
  const STRUCTURES = Object.freeze(['limit', 'nolimit']);
  function tableStructure(dealer) {
    if (STRUCTURES.includes(hooks.cardsStructure)) return hooks.cardsStructure;
    const s = State.current;
    return dealer && s && isObj(s.flags) && s.flags[`cardsNoLimit.${dealer.id}`] === s.time.day ? 'nolimit' : 'limit';
  }
  /* The dealer holding the player to the limit (wave 18, amendment 2): an
     amount typed past it (all in, bet 20, raise to 40) is refused in
     character, at no cost, one of three lines picked by the turn and how
     many times it was said this hand; the dealer's own name. */
  const PUSHBACK = [
    (first, b) => `${first} taps the felt. "${capFirst(dollarWords(b))} bets at this table."`,
    (first, b) => `${first} doesn't touch the chips. "It's a ${dollarWords(b)} game. House rules."`,
    (first, b) => `"${capFirst(dollarWords(b))} limit," ${first} says, and slides the chips back.`
  ];
  let pushes = 0; // the pushbacks of the hand open now (gamble resets it, or takes it from a stored hand resumed; the record keeps it)
  function pushbackLine(dealerName, b) {
    const s = State.current;
    const k = Math.floor(Rng.valueAt((((s ? s.meta.seed : 1) >>> 0) ^ Math.imul(((s ? s.meta.turn : 0) | 0) + 1, 0x9e3779b1) ^ Math.imul(pushes + 1, 0x85ebca6b)) >>> 0, 0) * PUSHBACK.length);
    pushes += 1;
    // Wave 19 (QA D10): the count goes on the stored hand too, so a page reloaded mid-hand keeps it on the record.
    storeHand(heldOpen, { pushback: pushes });
    return PUSHBACK[clamp(k, 0, PUSHBACK.length - 1)](firstWord(dealerName), b);
  }
  function validMove(m) { return (typeof m === 'string' || isObj(m)) && Cards.move(m) !== null; }
  /* An amount to bet or raise to on a round, as the table allows it (b,
     the table's bet): not a multiple of b, the next one up; under the least,
     the least; at or over the stack, all in; and one that would leave less
     than b behind, all in. */
  function clampTo(want, minTo, maxTo, b) {
    const step = Math.max(1, b | 0);
    let to = Number.isFinite(want) ? Math.ceil(Math.floor(want) / step) * step : minTo;
    if (to < minTo) to = minTo;
    if (to > maxTo) to = maxTo;
    if (to < maxTo && maxTo - to < step) to = maxTo;
    return to;
  }
  /* A size for a bet or a raise (the table's presets and the seats' bets):
     min, the least; half, the call and half the pot after it on top (a bet:
     half the pot); pot, the call and the pot after it (a bet: the pot), the
     two rounded to the nearest multiple of the table's bet; allin, the
     rest of the stack. k: a round's ask ({ toCall, level, pot, minTo,
     maxTo, unit: the table's bet }). */
  function sizeFor(k, kind) {
    if (kind === 'allin') return k.maxTo;
    if (kind === 'min') return k.minTo;
    const step = Math.max(1, k.unit | 0);
    const want = k.level + (kind === 'pot' ? 1 : 0.5) * (k.pot + k.toCall);
    return clampTo(Math.max(step, Math.round(want / step) * step), k.minTo, k.maxTo, step);
  }
  /* What an amount was changed to and why, in the order the table changes
     it (wave 19, QA D7: the amount control never surprises): { to, why },
     to as clampTo has it, why each step in words: "Bets go in twenties:
     $50 rounds up to $60.", "The least bet is $4." ("The least raise is to
     $16."), "That's more than you have, so it is all in $19.", "That would
     leave you less than a bet, so it is all in $110." (after a rounding
     too: "Bets go in forties: $50 rounds up to $80. That would leave you
     less than a bet, so it is all in $110."); '' when nothing changed. */
  function betsIn(b) {
    if (b === 100) return 'hundreds';
    if (b >= 100) return `${money(b)}s`;
    const w = countWords(b);
    return /y$/.test(w) ? `${w.slice(0, -1)}ies` : /x$/.test(w) ? `${w}es` : `${w}s`;
  }
  function clampWhy(want, minTo, maxTo, b, kind) {
    const step = Math.max(1, b | 0);
    if (!Number.isFinite(want)) return { to: minTo, why: '' };
    const w = Math.floor(want);
    const allIn = `so it is all in ${money(maxTo)}`;
    if (w >= maxTo) return { to: maxTo, why: w > maxTo ? `That's more than you have, ${allIn}.` : '' };
    const why = [];
    let to = w;
    if (w < minTo) { to = minTo; why.push(kind === 'raise' ? `The least raise is to ${money(minTo)}.` : `The least bet is ${money(minTo)}.`); }
    else if (w % step) { to = Math.ceil(w / step) * step; why.push(`Bets go in ${betsIn(step)}: ${money(w)} rounds up to ${money(to)}.`); }
    if (to >= maxTo) { if (to > maxTo) why.push(`That's more than you have, ${allIn}.`); to = maxTo; }
    else if (maxTo - to < step) { to = maxTo; why.push(`That would leave you less than a bet, ${allIn}.`); }
    return { to, why: why.join(' ') };
  }
  /* A preset that comes to all in says so (wave 19, QA D7): ½ pot or Pot
     past the stack, or leaving less than a bet behind. { to, why }. */
  // Half the pot or the pot before it is held to the stack (wave 20: typedBet says what it went in as).
  function sizeRaw(k, kind) { const step = Math.max(1, k.unit | 0); return Math.max(step, Math.round((k.level + (kind === 'pot' ? 1 : 0.5) * (k.pot + k.toCall)) / step) * step); }
  function sizeWhy(k, kind) {
    const to = sizeFor(k, kind);
    if ((kind !== 'half' && kind !== 'pot') || to < k.maxTo) return { to, why: '' };
    const raw = sizeRaw(k, kind);
    const name = kind === 'pot' ? 'The pot' : 'Half the pot';
    const why = raw > k.maxTo ? `${name} (${money(raw)}) is more than you have, so it is all in ${money(k.maxTo)}.`
      : raw === k.maxTo ? `${name} is all you have: all in ${money(k.maxTo)}.`
        : `${name} (${money(raw)}) would leave you less than a bet, so it is all in ${money(k.maxTo)}.`;
    return { to, why };
  }
  /* How good a five-card hand is for the draw's betting round, 0 to 1, read
     as Cards.strength reads hold'em: high card under .2, a pair .32 (deuces)
     to .6 (aces), two pair about .7, three of a kind .82, a straight or
     better .9 and up. */
  function drawStrength(final) {
    if (!Array.isArray(final) || final.length !== 5) return 0.1;
    const e = Cards.evaluate(final);
    const k = e.key;
    if (e.rank === 0) return 0.08 + (k[1] - 2) / 12 * 0.12;
    if (e.rank === 1) return 0.32 + (k[1] - 2) / 12 * 0.28;
    if (e.rank === 2) return 0.68 + (k[1] - 2) / 12 * 0.08;
    if (e.rank === 3) return 0.82;
    return Math.min(1, 0.88 + e.rank * 0.01);
  }
  /* One seat's move on a round (wave 18; wave 13 bet or called a unit).
     v is how good the hand is (Cards.strength at hold'em, drawStrength at
     draw), t the seat's tilt (tiltOf: Carter, Elbert and Curtis bet, raise
     and bluff more; careful Lyman and Royce call down or fold). With
     nothing to call: a value bet from 0.62 − t (half the pot or the least;
     the pot from .75; the pot or all in from .88, all in only after the
     flop and at draw), a bluff of half the pot when the coin falls under
     0.1 + t, else check. Facing a bet: a raise from 0.8 − t (higher for a
     seat that has bet or raised this round already), the least raise or
     half the pot, the pot or all in from .9; now and then a bluff raise of
     the least for the bold (the coin under a third of the bluff chance,
     never on the river); a call when the hand clears the round's bar (.3
     before the flop, .38 on the flop and the turn, .45 on the river and
     after the draw, less t), raised by the price (what the call is of the
     pot after it, over a quarter, and of the stack left); else fold. The
     coins are the hand's own (coin: the seat, the round and the seat's
     decision on it), so a hand plays the same way after a reload, an
     /undo or a replay given the same moves. /cheat cards: the others call
     every bet before the flop (at draw, every bet), never raising. */
  function seatMove(h, i, k) {
    const seat = h.seats[i];
    const draw = h.game === 'draw';
    const v = draw ? drawStrength(seat.final) : Cards.strength(seat.hole, h.board.slice(0, STREET_CARDS[k.street]));
    const t = seat.tilt || 0;
    const bluff = Math.max(0, 0.1 + t);
    const c = coin(h.seed, i, k.street, 2 * k.ask + (k.toCall ? 1 : 0));
    const c2 = coin(h.seed, i, k.street, 2 * k.ask + 41);
    const late = draw || k.street > 0;
    const go = (act, kind, bluffed) => ({ act, to: sizeFor(k, kind), bluff: !!bluffed });
    if (!k.toCall) {
      if (!k.canBet) return { act: 'check' };
      if (v >= 0.62 - t) return go('bet', v >= 0.88 ? (late && c2 < 0.3 + t ? 'allin' : 'pot') : v >= 0.75 ? (c2 < 0.5 ? 'pot' : 'half') : (c2 < 0.3 ? 'min' : 'half'));
      if (c < bluff) return go('bet', 'half', true);
      return { act: 'check' };
    }
    if (h.stacked && (draw || k.street === 0)) return { act: 'call' };
    if (k.canRaise) {
      if (v >= 0.8 - t + (k.raised ? 0.1 : 0)) return go('raise', v >= 0.9 ? (late && c2 < 0.35 + t ? 'allin' : 'pot') : (c2 < 0.5 ? 'min' : 'half'));
      if (!k.raised && (draw || k.street < 3) && c < bluff / 3) return go('raise', 'min', true);
    }
    const base = draw || k.street === 3 ? 0.45 : k.street === 0 ? 0.3 : 0.38;
    const price = k.toCall / (k.pot + k.toCall);
    const committed = Math.min(1, k.toCall / Math.max(1, k.left));
    const need = base - t + 0.6 * Math.max(0, price - 0.25) + 0.2 * committed;
    return { act: v >= need || (c < bluff / 2 && committed < 0.5) ? 'call' : 'fold' };
  }
  /* The table as a hand starts: every seat's ante in (st.inn: what each has
     put in), nobody folded. h: { ante, bet, stack } (wave 13's unit, the
     ante and the bet then, and cap still read). st.u is the table's bet. */
  function tableStart(h) {
    const n = h.seats.length;
    const a0 = toInt(h.ante) || toInt(h.unit) || 1;
    const S = toInt(h.stack) || toInt(h.cap) || 5 * a0;
    const b = toInt(h.bet) || toInt(h.unit) || unitFor(S);
    const a = Math.min(a0, S);
    return { n, u: b, S, limit: h.limit === true, inn: Array(n).fill(a), folded: Array(n).fill(false), foldedOn: Array(n).fill(null), status: Array(n).fill(''), reads: Array(n).fill(null), log: [], played: [], m: 0, gone: false };
  }
  /* One round of betting (wave 18), from the player round the table, as far
     as the player's moves go (st.m is the next one). A seat with no chips
     left (all in) is passed over; a round where fewer than two seats still
     have chips is not bet at all (everyone is all in: the board is dealt
     out). Returns null when the round is over, { need, ask } when it waits
     for the player (need: their choices; ask: { toCall, level, put, left,
     pot, minTo, maxTo, unit, raises }), { win } for the Win (cheat). Every
     action goes on st.log ({ i, act, to, add, street, allIn }); the player's,
     made legal and with its amount, on st.played. A seat's first bet or
     raise of the hand gets the player's read (st.reads). After the player
     has folded (st.gone) a bet still owed is called or folded and nobody
     bets again. At a limit table (st.limit, amendment 2: the house game) a
     bet is the table's bet and a raise one more of it, whatever amount a
     move names; all in only when the stack is short of that. */
  function betRound(h, st, street, moves) {
    const n = st.n;
    const u = st.u;
    const left = i => st.S - st.inn[i];
    const put = Array(n).fill(0);
    const raised = Array(n).fill(false);
    const asks = Array(n).fill(0);
    let level = 0;
    let lastRaise = u;
    let raises = 0;
    const live = () => st.folded.reduce((k, f) => k + (f ? 0 : 1), 0);
    const can = i => !st.folded[i] && left(i) > 0;
    const queue = [];
    for (let i = 0; i < n; i++) if (can(i)) queue.push(i);
    if (queue.length < 2) return null;
    while (queue.length && live() > 1) {
      const i = queue.shift();
      if (!can(i)) continue;
      const toCall = Math.max(0, level - put[i]);
      const maxTo = put[i] + left(i);
      // Someone else still in with chips to answer a bet or a raise.
      const answer = st.folded.some((f, j) => j !== i && !f && left(j) > 0);
      const k = {
        street, ask: asks[i]++, toCall: Math.min(toCall, left(i)), level, put: put[i], left: left(i), pot: st.inn.reduce((a, b) => a + b, 0), unit: u, raises,
        minTo: toCall ? Math.min(Math.ceil((level + lastRaise) / u) * u, maxTo) : Math.min(u, maxTo), maxTo,
        canRaise: !st.gone && answer && raises < MAX_RAISES && maxTo > level, canBet: !st.gone && answer, raised: raised[i]
      };
      // The least that would leave less than a bet behind: all in is the only amount.
      if (st.limit) {
        // Limit (wave 18, the house game): a bet is the table's bet and a raise one more of it, all in only when the stack is short of that.
        k.minTo = Math.min(toCall ? level + u : u, maxTo);
        k.limit = true;
      } else if (k.minTo < maxTo && maxTo - k.minTo < u) k.minTo = maxTo;
      let act;
      let to = null;
      let bluff = false;
      if (i === 0) {
        const opts = toCall ? ['call'].concat(k.canRaise ? ['raise'] : [], ['fold']) : ['check'].concat(k.canBet ? ['bet'] : []);
        if (st.m >= moves.length) return { need: opts, ask: k };
        const mv = Cards.move(moves[st.m++]) || { act: toCall ? 'call' : 'check' };
        if (mv.act === 'win') { st.played.push('win'); return { win: true }; }
        act = mv.act;
        // What the table offers: all in is the biggest bet, raise or call there is; a bet facing one is a raise, a raise with none a bet.
        if (act === 'allin') act = toCall ? (k.canRaise ? 'raise' : 'call') : k.canBet ? 'bet' : 'check';
        else if (act === 'bet' && toCall) act = 'raise';
        else if (act === 'raise' && !toCall) act = 'bet';
        else if (act === 'hold') act = toCall ? 'call' : 'check';
        if (act === 'raise' && !k.canRaise) act = 'call';
        if (act === 'bet' && !k.canBet) act = 'check';
        if (act === 'call' && !toCall) act = 'check';
        if (act === 'check' && toCall) act = 'call';
        if (act === 'bet' || act === 'raise') to = st.limit ? k.minTo : clampTo(mv.act === 'allin' ? maxTo : Number.isFinite(mv.to) ? mv.to : k.minTo, k.minTo, maxTo, u);
        st.played.push(Cards.moveText({ act, to }));
      } else {
        const r = seatMove(h, i, k);
        act = r.act;
        to = r.to;
        bluff = r.bluff === true;
        if (act === 'raise' && !toCall) act = 'bet';
        if ((act === 'bet' && !k.canBet) || (act === 'raise' && !k.canRaise)) act = toCall ? 'call' : 'check';
        if (act === 'bet' || act === 'raise') to = st.limit ? k.minTo : clampTo(to, k.minTo, maxTo, u);
      }
      const before = st.inn[i];
      if (act === 'fold') {
        st.folded[i] = true;
        st.foldedOn[i] = street;
        st.status[i] = 'folds';
        if (i === 0) st.gone = true;
      } else if (act === 'check') st.status[i] = 'checks';
      else if (act === 'call') {
        const add = Math.min(toCall, left(i));
        put[i] += add;
        st.inn[i] += add;
        st.status[i] = left(i) ? `calls ${money(put[i])}` : `all in ${money(put[i])}`;
      } else {
        // A full bet or raise sets the least raise after it; a short all in does not.
        if (to - level >= lastRaise) lastRaise = to - level;
        if (level) raises += 1;
        level = Math.max(level, to);
        st.inn[i] += to - put[i];
        put[i] = to;
        raised[i] = true;
        st.status[i] = !left(i) ? `all in ${money(put[i])}` : act === 'bet' ? `bets ${money(to)}` : `raises to ${money(to)}`;
        if (i && !st.reads[i]) st.reads[i] = { bluff, street };
        // Everyone who has not matched it answers it, round the table from the bettor.
        for (let d = 1; d < n; d++) { const j = (i + d) % n; if (can(j) && put[j] < level && !queue.includes(j)) queue.push(j); }
      }
      st.log.push({ i, act, to: put[i], add: st.inn[i] - before, street, allIn: act !== 'fold' && act !== 'check' && left(i) === 0 });
    }
    return null;
  }
  function runOut(st, street, extra) {
    return Object.assign({ street, in: st.inn.slice(), folded: st.folded.slice(), foldedOn: st.foldedOn.slice(), status: st.status.slice(), reads: st.reads.slice(), pot: st.inn.reduce((a, b) => a + b, 0), moves: st.played.slice(), log: st.log.slice() }, extra);
  }
  /* A hand of hold'em as far as the player's moves take it (wave 13; wave
     18: no limit): pure, from h ({ seed, ante, stack, stacked, board,
     seats: [{ key, hole, tilt }], the player first and the dealer last })
     and moves (Cards.move strings or objects). Every seat antes; four
     rounds (betRound), the player first on each; each new round starts
     with the statuses of the seats still in cleared (a fold and an all in
     stay). Everyone else folding ends it (uncontested); with everyone all
     in the rounds left are not bet and the board is dealt out. Wave 14
     (QA #2): the player folding does not end it for the others: a bet
     still owed is called or folded, nobody bets again, and the rest is
     checked down (playerFolded with showdown). Returns { street, in,
     folded, foldedOn, status, reads, pot, moves (the player's as played),
     log, need and ask | done (playerFolded, uncontested, showdown) | win }. */
  function holdemRun(h, moves) {
    const st = tableStart(h);
    const list = Array.isArray(moves) ? moves : [];
    const live = () => st.folded.reduce((k, f) => k + (f ? 0 : 1), 0);
    for (let street = 0; street < 4; street++) {
      if (street) for (let i = 0; i < st.n; i++) if (!st.folded[i] && st.inn[i] < st.S) st.status[i] = '';
      const r = betRound(h, st, street, list);
      if (r && r.need) return runOut(st, street, { need: r.need, ask: r.ask });
      if (r && r.win) return runOut(st, street, { win: true });
      if (live() === 1) return runOut(st, street, st.gone ? { done: true, playerFolded: true } : { done: true, uncontested: true });
    }
    return runOut(st, 4, st.gone ? { done: true, playerFolded: true, showdown: true } : { done: true, showdown: true });
  }
  /* A hand of five-card draw as far as the player's moves go (wave 18):
     pure, from h ({ seed, ante, stack, stacked, seats: [{ key, dealt, held,
     final, tilt }]: the player first, the dealer last; each other seat's
     draw by the dealer's rule known from the deal }). The ante; the
     player's draw (hold:…), or a fold before it (it costs the ante), or the
     Win; then one round of betting after the draw (street 1), the seats
     betting on their final hands; the showdown. A fold heads up before the
     draw ends the hand there. Returns runOut's shape with phase ('draw' |
     'bet') and holds (the player's, null before the draw or after a fold
     there). */
  function drawRun(h, moves) {
    const st = tableStart(h);
    const list = Array.isArray(moves) ? moves : [];
    const live = () => st.folded.reduce((k, f) => k + (f ? 0 : 1), 0);
    if (!list.length) return runOut(st, 0, { phase: 'draw', holds: null, need: ['draw', 'fold'] });
    const first = Cards.move(list[0]);
    st.m = 1;
    if (first && first.act === 'win') { st.played.push('win'); return runOut(st, 0, { phase: 'draw', holds: null, win: true }); }
    let holds = null;
    if (first && first.act === 'fold') {
      st.folded[0] = true;
      st.foldedOn[0] = 0;
      st.status[0] = 'folds';
      st.gone = true;
      st.played.push('fold');
      st.log.push({ i: 0, act: 'fold', to: 0, add: 0, street: 0, allIn: false });
    } else {
      holds = first && first.act === 'hold' ? first.hold : [0, 1, 2, 3, 4];
      st.played.push(Cards.moveText({ act: 'hold', hold: holds }));
    }
    const at = { phase: 'bet', holds };
    if (live() === 1) return runOut(st, 1, Object.assign(at, { done: true, playerFolded: true }));
    const r = betRound(h, st, 1, list);
    if (r && r.need) return runOut(st, 1, Object.assign(at, { need: r.need, ask: r.ask }));
    if (r && r.win) return runOut(st, 1, Object.assign(at, { win: true }));
    if (live() === 1) return runOut(st, 1, Object.assign(at, st.gone ? { done: true, playerFolded: true } : { done: true, uncontested: true }));
    return runOut(st, 1, Object.assign(at, st.gone ? { done: true, playerFolded: true, showdown: true } : { done: true, showdown: true }));
  }
  /* The hand's actions for the record (wave 18): each with the seat's key. */
  function actionsOf(log, keys) {
    return (log || []).map(x => Object.assign({ seat: keys[x.i], act: x.act, to: x.to | 0, add: x.add | 0, street: x.street | 0 }, x.allIn ? { allIn: true } : {}));
  }
  /* A bet typed in the box with a hand open (wave 18): the table's own
     words, not the parser's (the box otherwise waits while a hand is
     open). On a betting round: "check"; "call" (with nothing to call it
     checks); "fold"; "all in" ("go all in", "I'm all in", "shove", "jam",
     "push"); "bet 10", "bet $10", "bet ten dollars", "raise to 30", "raise
     30" (to $30, as the control's amount is), "raise by 10" (on top of the
     bet), "make it 30", a bare "$30" or "30" (a bet, or a raise to it); and
     "min", "half pot", "pot" after bet or raise, or alone. At the draw:
     "fold" and "stand pat". "I", "I'll" and "okay" before them are fine.
     An amount the table does not allow is clamped as the control clamps
     it, and the note says so. At a limit table (amendment 2) an amount
     past the limit ("all in" with the stack not short, "bet 20", "raise to
     40", "pot") is refused by the dealer in character at no cost: { refuse:
     his line (pushbackLine), say: "Four-dollar limit: Check or Bet $4. Ask
     Curtis for table stakes if you want a bigger game." }, and the words
     stay in the box; one under the limit goes up to it. Returns null when
     the line is none of these; { choice, note? } to play; { say } for the
     status line when the table offers no such move ("There's a bet to
     you: call $8, raise or fold."). t: the open table (Pipeline.openHand).
     Wave 19 (QA D9): also "call $8" / "call 8" (the call's own price),
     "raise it to 30", "I'm going all in", "I fold", "I check", "I call";
     at the draw "draw 3" / "draw three" / "I draw two" ({ draw: n }: the
     UI presses Draw when exactly n cards are not held, else says how). */
  const TYPED_FOLD = /^(?:fold|folds|folding|muck|i'm out|im out)(?: (?:it|my hand|this hand|this one|then))?$/;
  const TYPED_BETWORD = /^(?:check|call|bet|bets|raise|raises|re-?raise|make it|all[\s-]?in|go all[\s-]?in|shove|jam|push|min|pot|half(?: the)? pot|\$\s*\d|\d)/;
  // "push my chips in", "I shove all my money toward Curtis", "push it all in" (wave 20, QA N1): all in.
  const TYPED_PUSH = /^(?:shove|shoves|push|pushes)(?: (?:it|them))? (?:all[\s-]?in|everything|(?:all (?:of )?)?(?:my |the |these |those |your |our )?(?:chips|money|cash|stack|pile|bankroll))\b/;
  /* An amount in figures or words ("$8", "8", "eight dollars"), or null. */
  function typedAmount(str) {
    const rest = String(str || '').trim();
    const num = /^\$?\s*(\d[\d,]*)(?:\.\d+)?(?:\s*(?:dollars?|bucks?))?$/.exec(rest);
    if (num) return parseInt(num[1].replace(/,/g, ''), 10);
    const words = rest.replace(/\s*(?:dollars?|bucks?)$/, '').trim();
    return words && new RegExp(`^${Style.NUMBER_WORD}(?:[\\s-]+${Style.NUMBER_WORD})*$`, 'i').test(words) ? Style.numberWords(words) : null;
  }
  function typedBet(text, t) {
    const raw = String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/[.!?]+\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!raw || raw.startsWith('/') || !isObj(t)) return null;
    const w = raw.replace(/^(?:(?:ok|okay|fine|alright|all right|right|well|then)\b,?\s*)+/, '').replace(/^(?:i(?:'ll| will)?|i'm going to|i want to|let me)\s+/, '').trim();
    const opts = Array.isArray(t.options) ? t.options : [];
    if (opts[0] === 'draw') {
      if (TYPED_FOLD.test(w)) return { choice: { fold: true } };
      if (/^stand(?:s|ing)? pat$/.test(w)) return { choice: { hold: 'all' } };
      // "draw 3", "draw three (cards)": the Draw button as it stands, when it replaces that many (the UI checks the holds).
      const dn = /^draws? (.+?)(?: (?:new )?cards?)?$/.exec(w);
      // Wave 20 (QA N10): "draw a card" is one.
      const n = dn ? (/^an?$/.test(dn[1]) ? 1 : typedAmount(dn[1])) : null;
      if (Number.isInteger(n) && n >= 1 && n <= 5) return { draw: n };
      if (TYPED_BETWORD.test(w) && !/^\d+ ?(?:,|and|\d)/.test(w)) return { say: 'Pick the cards to hold, then Draw: the betting comes after the draw.' };
      return null;
    }
    const a = isObj(t.ask) ? t.ask : null;
    if (!a || !opts.length) return null;
    const facing = opts[0] === 'call';
    const kind = opts.includes('raise') ? 'raise' : opts.includes('bet') ? 'bet' : null;
    const callWords = `call ${money(a.toCall)}${a.toCall >= a.left ? ' (all in)' : ''}`;
    // Amendment 2: at a limit table an amount past the limit is refused by the dealer, in character, at no cost; the words stay in the box.
    const first = firstWord(t.dealerName || 'The dealer');
    const refuse = () => {
      // Wave 19 (QA D11): the names the buttons have ("All in $19" when the stack is short of the raise).
      const short = a.minTo >= a.maxTo;
      const offer = facing ? `Call ${money(a.toCall)}${kind ? `, ${short ? `All in ${money(a.maxTo)}` : `Raise to ${money(a.minTo)}`}` : ''} or Fold` : kind ? `Check or ${short ? `All in ${money(a.maxTo)}` : `Bet ${money(a.minTo)}`}` : 'Check';
      return { refuse: pushbackLine(t.dealerName || 'The dealer', a.unit), say: `${capFirst(dollarWords(a.unit))} limit: ${offer}. Ask ${first} for table stakes if you want a bigger game.` };
    };
    if (TYPED_FOLD.test(w)) return { choice: { fold: true } };
    if (/^(?:check|checks|check it|knock)$/.test(w)) return facing ? { say: `There's a bet to you: ${callWords}${kind ? ', raise' : ''} or fold.` } : { choice: { act: 'check' } };
    // Wave 20 (QA N10): "I'm calling", "I see your bet", "I'll see that" too.
    if (/^(?:call|calls|calling|call it|call that|call the bet|call you|i call|(?:i'm|im|i am) calling|see it|see that|see you|see the bet|see your (?:bet|raise)|see the raise)$/.test(w)) return { choice: { act: facing ? 'call' : 'check' } };
    // "call $8", "call 8": the call, when that is its price.
    const cm = /^(?:i )?(?:call|calls|see)(?: (?:it|that|the bet|you))?(?: for)? (.+)$/.exec(w);
    const cn = cm ? typedAmount(cm[1]) : null;
    if (Number.isInteger(cn)) {
      if (!facing) return { choice: { act: 'check' } };
      if (cn === a.toCall || (cn > a.toCall && a.toCall >= a.left)) return { choice: { act: 'call' } };
      return { say: `It's ${money(a.toCall)} to call: ${callWords}${kind ? ', raise' : ''} or fold.` };
    }
    // Wave 20 (QA N1): a push or a shove of the chips, the money or the stack is all in too ("I push my chips toward Curtis", "shove all my chips in").
    if (/^(?:(?:go |going |i go |i'm |im |i am |i'm going |im going |i am going )?all[\s-]?in|shove(?: it)?|jam(?: it)?|push(?: it)?|all of it)$/.test(w) || TYPED_PUSH.test(w)) {
      if (kind && a.limit && a.minTo < a.maxTo) return refuse();
      if (kind) return { choice: { act: 'allin' } };
      if (!facing) return null;
      if (a.toCall >= a.left) return { choice: { act: 'call' }, note: `Calling ${money(a.toCall)} puts you all in.` };
      const none = (a.raises | 0) >= MAX_RAISES ? 'No more raises this round' : 'Nobody is left to answer a raise';
      return { choice: { act: 'call' }, note: `${none}, so you ${callWords}.`, after: `Your all in went in as a call of ${money(a.toCall)}: ${lowerFirst(none)}.` };
    }
    // "raise it to 30": the verb, then "it" or "that", then to or by and the amount.
    const m = /^(?:(bet|bets|raise|raises|re-?raise|make it|make that)\b\s*)?(?:(?:it|that)\s+(?=to\b|by\b))?(?:(to|by)\s+)?(.*)$/.exec(w);
    const verb = m[1] || null;
    const prep = m[2] || null;
    const rest = m[3].replace(/^(?:it|that)\s+/, '').trim();
    let size = null;
    let amount = null;
    if (!rest) size = verb ? 'min' : null;
    else if (/^(?:the )?(?:min|minimum)(?:[\s-]?raise| bet)?$/.test(rest)) size = 'min';
    else if (/^half(?: of)?(?: the)? pot$/.test(rest)) size = 'half';
    else if (/^(?:the )?pot$/.test(rest)) size = 'pot';
    else if (/^(?:all[\s-]?in|it all|everything)$/.test(rest)) size = 'allin';
    else {
      const num = /^\$?\s*(\d[\d,]*)(?:\.\d+)?(?:\s*(?:dollars?|bucks?))?$/.exec(rest);
      if (num) amount = parseInt(num[1].replace(/,/g, ''), 10);
      else if (verb) {
        const words = rest.replace(/\s*(?:dollars?|bucks?)$/, '').trim();
        const n = new RegExp(`^${Style.NUMBER_WORD}(?:[\\s-]+${Style.NUMBER_WORD})*$`, 'i').test(words) ? Style.numberWords(words) : null;
        if (n === null) return null;
        amount = n;
      } else return null;
    }
    if (size === null && amount === null) return null;
    // No raise on offer: four raises are in, or nobody left could answer one (everyone else all in).
    if (!kind) return { say: facing ? ((a.raises | 0) >= MAX_RAISES ? `No more raises this round: ${callWords} or fold.` : `Nobody is left to answer a raise: ${callWords} or fold.`) : 'Check only: nobody is left to bet against.' };
    if (a.limit) {
      // The limit's one amount (all in only when the stack is short of it); under it goes up to it, past it is refused.
      const want = size === 'min' ? a.minTo : size === 'allin' ? a.maxTo : size ? sizeFor(Object.assign({}, a, { minTo: a.unit }), size) : prep === 'by' && kind === 'raise' ? a.level + amount : amount;
      if (want > a.minTo) return refuse();
      return Object.assign({ choice: { act: kind, to: a.minTo } }, want < a.minTo ? { note: `${capFirst(dollarWords(a.unit))} limit, so ${a.minTo >= a.maxTo ? 'you go all in' : kind === 'bet' ? `you bet ${money(a.minTo)}` : `you raise to ${money(a.minTo)}`}.`, after: `${typedWas(want, kind)} went in as ${wentAs(a.minTo, a, kind)}: ${dollarWords(a.unit)} limit.` } : {});
    }
    // Wave 19 (QA D7): a preset that comes to all in, and an amount the table changes, say why as the control does (sizeWhy, clampWhy).
    if (size) {
      const z = sizeWhy(a, size);
      // Wave 20 (QA N4): what it went in as, for a table this move finishes ("The pot ($120) went in as all in $95: that's more than you have.").
      const raw = z.why ? sizeRaw(a, size) : null;
      const after = raw !== null && raw !== a.maxTo ? `${size === 'pot' ? 'The pot' : 'Half the pot'} (${money(raw)}) went in as all in ${money(a.maxTo)}: ${raw > a.maxTo ? "that's more than you have" : 'that would have left you less than a bet'}.` : '';
      return Object.assign({ choice: { act: size === 'allin' ? 'allin' : kind, to: z.to } }, z.why ? { note: z.why } : {}, after ? { after } : {});
    }
    const want = prep === 'by' && kind === 'raise' ? a.level + amount : amount;
    const c = clampWhy(want, a.minTo, a.maxTo, a.unit, kind);
    return Object.assign({ choice: { act: kind, to: c.to } }, c.why ? { note: c.why, after: wentIn(want, c.to, a, kind) } : {});
  }
  /* What a typed amount the table changed went in as (wave 20, QA N4: said
     under the result when that move finished the hand, so the change is
     never lost to the narration): "Your $70 went in as all in $95: that
     would have left you less than a bet.", "Your $300 went in as all in
     $95: that's more than you have.", "Your $50 went in as $60: bets go in
     twenties.", "Your raise to $130 went in as a raise to $140: bets go in
     twenties.", "Your $5 went in as $20: the least bet is $20." */
  function typedWas(w, kind) { return kind === 'raise' ? `Your raise to ${money(w)}` : `Your ${money(w)}`; }
  function wentAs(to, a, kind) { return to >= a.maxTo ? `all in ${money(a.maxTo)}` : kind === 'raise' ? `a raise to ${money(to)}` : money(to); }
  function wentIn(want, to, a, kind) {
    const w = Math.floor(want);
    if (!Number.isFinite(w) || w === to) return '';
    const step = Math.max(1, a.unit | 0);
    let why;
    if (w > a.maxTo) why = "that's more than you have";
    else if (to >= a.maxTo) {
      const up = w < a.minTo ? a.minTo : Math.ceil(w / step) * step;
      why = up > a.maxTo ? `bets go in ${betsIn(step)}, and ${money(up)} is more than you have` : up < a.maxTo ? 'that would have left you less than a bet' : `bets go in ${betsIn(step)}`;
    } else why = w < a.minTo ? (kind === 'raise' ? `the least raise is to ${money(a.minTo)}` : `the least bet is ${money(a.minTo)}`) : `bets go in ${betsIn(step)}`;
    return `${typedWas(w, kind)} went in as ${wentAs(to, a, kind)}: ${why}.`;
  }
  /* The Win (cheat) at hold'em mid-hand (wave 13): the player's two cards
     and the board already turned stay; the rest of the board is dealt so
     the player's hand beats every other seat still in (live), keeping
     their cards when that works and else giving them ones that lose (a
     seat that folded keeps its cards). Returns { board, holes } (every
     seat's), or null when nothing does (the board alone ties everyone).
     Wave 14 (QA #1, #13): what the player has seen never changes. The
     cards still to come on the board are tried first, every one of them
     (one or two to come) or thousands of boards (five), with every hole
     card kept; the hole cards of the seats still in change only when they
     are hidden (marked false: no marked deck). null: the others fold to
     the player instead (holdemHand). */
  function beatsAll(mine, others, bd) {
    const k = Cards.best(mine.concat(bd)).key;
    return others.every(x => Cards.compareKeys(k, Cards.best(x.concat(bd)).key) > 0);
  }
  function rigHoldem(rng, holes, board, shown, live, marked) {
    const mine = holes[0];
    const fixed = board.slice(0, shown);
    const idx = holes.map((x, i) => i).filter(i => i > 0 && (!live || live[i]));
    const others = idx.map(i => holes[i]);
    const all = hs => holes.map((x, i) => (idx.includes(i) ? hs[idx.indexOf(i)].slice() : x.slice()));
    const beats = (bd, hs) => beatsAll(mine, hs, bd);
    // The board to come, with every hole card as dealt.
    const rest = Cards.shuffle(rng, Cards.deck().filter(c => !holes.flat().includes(c) && !fixed.includes(c)));
    const need = 5 - shown;
    if (need === 0 && beats(fixed, others)) return { board: fixed.slice(), holes: all(others) };
    if (need === 1) for (const c of rest) { const bd = fixed.concat([c]); if (beats(bd, others)) return { board: bd, holes: all(others) }; }
    if (need === 2) for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) { const bd = fixed.concat([rest[a], rest[b]]); if (beats(bd, others)) return { board: bd, holes: all(others) }; }
    if (need > 2) for (let t = 0; t < 3000; t++) { const bd = fixed.concat(Cards.shuffle(rng, rest).slice(0, need)); if (beats(bd, others)) return { board: bd, holes: all(others) }; }
    // A marked deck shows every seat's cards: nothing more can change.
    if (marked) return null;
    // The hidden hole cards of the seats still in, with the board to come (a seat that folded keeps its own).
    const pool = Cards.deck().filter(c => !mine.includes(c) && !fixed.includes(c) && !holes.some((x, i) => i > 0 && !idx.includes(i) && x.includes(c)));
    for (let t = 0; t < (shown === 5 ? 1 : 20); t++) {
      const p = Cards.shuffle(rng, pool);
      const bd = fixed.concat(p.slice(0, 5 - shown));
      let left = p.slice(5 - shown);
      const hs = [];
      const k = Cards.best(mine.concat(bd)).key;
      for (let s = 0; s < others.length; s++) {
        let found = null;
        for (let a = 0; a < left.length && !found; a++) for (let b = a + 1; b < left.length && !found; b++) {
          if (Cards.compareKeys(k, Cards.best([left[a], left[b]].concat(bd)).key) > 0) found = [left[a], left[b]];
        }
        if (!found) break;
        hs.push(found);
        left = left.filter(c => !found.includes(c));
      }
      if (hs.length === others.length) return { board: bd, holes: all(hs) };
    }
    return null;
  }
  /* The Win (cheat) at a draw hand (wave 13). Wave 14 (QA #1): every hand
     as dealt stays (the player's, and the others', face up with a marked
     deck), and so do the cards each other seat holds by the dealer's rule;
     only the cards drawn are new. The player keeps their best group (all
     five with a straight or better; else, failing that, the cards of one
     rank, or the highest) and draws the rest of its rank first, the
     others' draws are dealt from what is left so they lose. others: [{
     dealt, held }]. Returns { holds, pFinal, others: [{ dealt, held, final
     }] }, or null when nothing does (a pat hand nothing beats): the others
     throw in their hands instead (drawHand). */
  /* Wave 18: mine ({ holds, final }), after the player has drawn: their five
     are seen and stay; only the others' draws are dealt again. */
  function rigDraw(rng, player, others, mine) {
    const e = Cards.evaluate(player);
    const vals = player.map(Cards.value);
    const ALL5 = [0, 1, 2, 3, 4];
    const plans = mine ? [mine.holds.slice()] : [e.rank >= 4 ? ALL5 : e.rank >= 1 ? ALL5.filter(i => vals.filter(v => v === vals[i]).length >= 2) : [vals.indexOf(Math.max(...vals))]];
    if (!mine && e.rank < 4) for (const v of Array.from(new Set(vals)).sort((a, b) => b - a)) plans.push(ALL5.filter(i => vals[i] === v));
    const taken = new Set(player.concat(others.flatMap(o => o.dealt), mine ? mine.final : []));
    for (const holds of plans) {
      const ranks = new Set(holds.map(i => player[i][0]));
      for (let t = 0; t < 120; t++) {
        const pool = Cards.shuffle(rng, Cards.deck().filter(c => !taken.has(c)));
        // Every other try draws the held rank first (four of a kind, a full house); the rest draw what comes (a flush, a straight).
        const order = t % 2 ? pool : pool.filter(c => ranks.has(c[0])).concat(pool.filter(c => !ranks.has(c[0])));
        const pile = mine ? [] : order.slice(0, 5 - holds.length);
        const pFinal = mine ? mine.final.slice() : Cards.draw(player, holds, pile);
        let left = pool.filter(c => !pile.includes(c));
        const outs = [];
        for (const o of others) {
          const k = 5 - o.held.length;
          let got = null;
          for (let a = 0; a + k <= left.length && a < 40 && !got; a += Math.max(1, k)) {
            const fin = Cards.draw(o.dealt, o.held, left.slice(a, a + k));
            if (Cards.compare(pFinal, fin) > 0) got = { dealt: o.dealt.slice(), held: o.held.slice(), final: fin, used: left.slice(a, a + k) };
          }
          if (!got) break;
          left = left.filter(c => !got.used.includes(c));
          outs.push({ dealt: got.dealt, held: got.held, final: got.final });
        }
        if (outs.length === others.length) return { holds: holds.slice(), pFinal, others: outs };
      }
    }
    return null;
  }
  /* Who takes the pot (wave 13; wave 18: no limit). First a bet nobody
     called goes back to whoever made it: the most anyone put in is cut to
     the second most (the side's back; its in is what stayed in), so an all
     in for less than the bet, or a bet everyone folded to, costs only what
     was matched. Then the pot is shared a layer at a time (side pots,
     should the stacks ever differ; with equal stacks there is one): each
     layer to the best hand still in among the seats that put that much in,
     all of them on a tie, the odd dollars to the player when they share it
     (else to the first winner). sides: { key, in, live, final }; each gets
     won. Returns { pot (what stayed in), winners (the best hand still in) }.
     opts.keepUncalled (a wave 10-12 record replayed): nothing goes back. */
  function settlePot(sides, opts) {
    for (const x of sides) { x.in = Math.max(0, x.in | 0); x.won = 0; delete x.back; }
    if (!(opts && opts.keepUncalled) && sides.length > 1) {
      const ins = sides.map(x => x.in).sort((a, b) => b - a);
      const top = sides.find(x => x.in === ins[0]);
      if (ins[0] > ins[1] && top) { top.back = ins[0] - ins[1]; top.in = ins[1]; }
    }
    const live = sides.filter(x => x.live);
    const keyOf = x => (Array.isArray(x.final) && x.final.length === 5 ? Cards.evaluate(x.final).key : [-1]);
    const best = group => {
      if (group.length <= 1) return group.slice();
      const keys = group.map(keyOf);
      let top = keys[0];
      for (const k of keys) if (Cards.compareKeys(k, top) > 0) top = k;
      return group.filter((x, i) => Cards.compareKeys(keys[i], top) === 0);
    };
    const winners = best(live);
    const levels = Array.from(new Set(sides.map(x => x.in).filter(v => v > 0))).sort((a, b) => a - b);
    let prev = 0;
    for (const lv of levels) {
      const layer = sides.reduce((t, x) => t + Math.max(0, Math.min(x.in, lv) - prev), 0);
      const reach = live.filter(x => x.in >= lv);
      const take = reach.length ? best(reach) : winners;
      if (take.length) {
        const share = Math.floor(layer / take.length);
        for (const x of take) x.won += share;
        const rest = layer - share * take.length;
        if (rest) (take.find(x => x.key === 'player') || take[0]).won += rest;
      }
      prev = lv;
    }
    const pot = sides.reduce((t, x) => t + x.in, 0);
    return { pot, winners: winners.map(x => x.key) };
  }
  function showdownOf(winners, folded) { return folded ? 'fold' : winners.length === 1 && winners[0] === 'player' ? 'win' : winners.includes('player') ? 'split' : 'lose'; }
  /* What the player's hand makes so far (as they fold): the best five with three or more on the board, else the two hole cards by name. */
  function handSoFar(hole, board) {
    if (board.length >= 3) { const b = Cards.best(hole.concat(board)); return { final: b.cards, name: b.name }; }
    return { final: null, name: Cards.holeName(hole) };
  }
  /* The stored hand (wave 11, M1; wave 13: the game, the seats and the
     player's moves so far, so a page closed mid-street folds there). */
  function holdThis(c, moves, dealt) {
    const { s, ctx } = c;
    const held = Object.assign(handMark(s), { input: ctx.input, speech: ctx.speech || null, action: ctx.parsed || null, tab: Storage.tabId, token: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, cardGame: c.game, seats: c.seats.map(n => n.id), moves: (moves || []).slice(), chose: !!c.chose, structure: c.base.structure || null }, dealt ? { deal: dealt } : {}, pushes ? { pushback: pushes } : {});
    if (Storage.holdHand(held)) handHeld = held.token;
    heldOpen = held;
    return held;
  }
  function storeHand(held, extra) { if (held && handHeld === held.token) Storage.holdHand(Object.assign(held, extra || {})); }
  /* The open hand: the player's Draw or Fold (UI.feed.cards' buttons, or
     playHand) settles it; Stop (abort) folds it (wave 11: { fold, stopped
     }), so the ante is never taken back. Wave 13: kind 'choose' is the
     chooser (a game, or the Win; Stop there calls the turn off, as no card
     is dealt yet: hooks.cardsChoose answers it), 'holdem' a decision at
     hold'em. Wave 18: 'draw' is the draw itself ({ hold }), 'drawbet' the
     draw's betting round; a betting decision is { act: check | bet | call
     | raise | allin, to } (to: the amount bet or raised to on the round),
     { fold } or { win }. hooks.cardsPlay (takeAuto) plays a hand at once,
     as if clicked (tests, the console). */
  let hand = null;
  let handHeld = false; // this turn's hand is written to storage (Storage.holdHand) until the turn ends: its token
  let heldOpen = null; // the stored hand of the hand open now (holdThis), which a pushback updates (wave 19)
  let moveWhy = null; // what the player's last move went in as, when the table changed a typed amount (wave 20, QA N4: { why } on the choice)
  function waitForHand(table, node, kind) {
    return new Promise((resolve, reject) => {
      hand = { resolve, reject, table, node: node || null, kind: kind || 'draw' };
      // The Undo link comes with an open hand (wave 16: /undo takes its turn back, free).
      try { UI.markUndo(); } catch (e) { console.error(e); }
      if (hand.kind === 'choose') {
        const pick = hooks.cardsChoose;
        if (pick) { hooks.cardsChoose = null; Promise.resolve().then(() => playHand(pick === 'win' ? { win: true } : { game: pick })); }
        return;
      }
    });
  }
  function stoppedAtTable() { return Object.assign(new Error('stopped at the card table'), { type: 'aborted' }); }
  function playHand(choice) {
    if (!hand) return false;
    const h = hand;
    hand = null;
    const c = isObj(choice) ? choice : {};
    moveWhy = h.kind !== 'choose' && typeof c.why === 'string' && c.why ? cleanText(c.why, 200) : null;
    if (h.kind === 'choose') {
      // Stop at the chooser: nothing was dealt, so the turn is called off at no cost (the line back in the box).
      if (c.fold === true) { h.reject(Object.assign(stoppedAtTable(), { chooser: true })); return true; }
      h.resolve(c.win === true ? { win: true } : { game: CARD_GAMES.includes(c.game) ? c.game : 'holdem' });
      return true;
    }
    if (c.win === true) h.resolve({ win: true });
    else if (c.fold === true) h.resolve({ fold: true, stopped: c.stopped === true });
    else if (h.kind === 'draw') h.resolve({ hold: Cards.holdsFrom(c.hold) });
    else {
      const mv = Cards.move({ act: c.act, to: c.to });
      h.resolve(mv && mv.act !== 'hold' && mv.act !== 'win' ? mv : { act: 'check' });
    }
    return true;
  }
  /* Another tab took the game over (wave 12, L3: Storage.setReadOnly) while
     a hand is open here: this tab can save nothing, so the hand is void
     here (the table stays, its buttons off, with a line saying so: the
     other tab resumed it from storage, or it is gone with the game the
     other tab loaded), and the turn ends without a call or a save. Wave 14
     (QA #19): at the chooser nothing was dealt, so the turn is taken back
     as Stop takes it (the line back in the box, nothing lost in either
     tab), with "Another tab took over; the table is closed here." */
  function voidHand() {
    if (!hand) return false;
    const h = hand;
    hand = null;
    const chooser = h.kind === 'choose';
    if (!chooser) { try { UI.feed.cardsVoid(h.node); } catch (e) { console.error(e); } }
    h.reject(Object.assign(new Error('another tab took over'), { type: 'void', chooser }));
    return true;
  }
  /* /undo with a hand open (wave 16; the owner: "I can't undo to the start
     of the game" from the middle of a hand): the whole turn is taken back,
     free, at the chooser, at draw and on any hold'em street. Like the void
     above nothing is played out: no fold price, no catch roll, nothing
     recorded; the turn ends as a rollback (runTurn: fail), so the game is as
     its snapshot had it (a cheat the hand spent is armed again), the table
     and the turn's lines leave the feed, the stored hand is dropped and the
     line goes back in the box. Returns a promise that resolves once the
     turn is over (the pipeline free), or null with no hand open. */
  function takeBackHand() {
    if (!hand) return null;
    const h = hand;
    hand = null;
    const done = whenIdle();
    h.reject(Object.assign(new Error('taken back with /undo'), { type: 'undone', chooser: h.kind === 'choose' }));
    return done;
  }
  /* /cheat cards (wave 11, L2): armed in the game itself (State
     cardsCheat), so it survives a reload; a second one says it is armed
     already. */
  function cheatArmed() { const s = State.current; return !!(s && isObj(s.flags) && s.flags.cardsCheat === true); }
  function cheatCards() {
    const ro = readOnlyRefusal();
    if (ro) return ro;
    if (!State.current) return { ok: false, reason: 'no game' };
    if (cheatArmed()) { UI.feed.notice('Already armed: the next hand is yours.'); return { ok: true, already: true }; }
    State.apply({ cardsCheat: true });
    UI.feed.notice('Cheat armed: the next hand is yours.');
    return { ok: true };
  }
  /* An armed /cheat cards survives taking a turn back (/undo, /reroll):
     armed before, armed after. Returns true when it was put back. */
  function keepCheat(armed) {
    if (!armed || cheatArmed() || !State.current) return false;
    State.apply({ cardsCheat: true });
    return true;
  }
  /* /cheat win (wave 13; the owner: "Keep the backslash cheat win or
     something so it narrates my win without playing"): the next hand is not
     played; the table is shown finished, the player's. Armed in the game
     (State cardsWin, flags.cardsWin) as /cheat cards is: a reload keeps it,
     an /undo of the hand it won arms it again, a second one says so. */
  function winArmed() { const s = State.current; return !!(s && isObj(s.flags) && s.flags.cardsWin === true); }
  function cheatWin() {
    const ro = readOnlyRefusal();
    if (ro) return ro;
    if (!State.current) return { ok: false, reason: 'no game' };
    if (winArmed()) { UI.feed.notice('Already armed: the next hand is yours without playing.'); return { ok: true, already: true }; }
    State.apply({ cardsWin: true });
    UI.feed.notice('Cheat armed: the next hand is yours without playing.');
    return { ok: true };
  }
  function keepWin(armed) {
    if (!armed || winArmed() || !State.current) return false;
    State.apply({ cardsWin: true });
    return true;
  }
  /* Which game, and where in it, a hand was dealt (wave 12, M2): the game
     (its createdAt and seed), the turn, and a mark of the story it follows
     (how long the log is and its last entry's words), so a hand is resumed
     only by the game it came from at the turn it was dealt in, never by an
     older save of that game played on to the same turn. */
  function storyMark(s) {
    const last = s.log[s.log.length - 1] || {};
    const text = `${s.log.length}|${last.day}|${last.phase}|${last.input || ''}|${last.narration || ''}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36);
  }
  function handMark(s) { return { game: s.meta.createdAt, seed: s.meta.seed, turn: s.meta.turn, story: storyMark(s) }; }
  /* A hand the page was closed on (wave 11, M1): loaded again, the game
     whose turn it was (the same game, the turn before it, the same story:
     handMark) plays that turn at once: a hand left open is folded (the
     fold price; a marked deck's catch roll), a hand already played stands
     as it ended (its catch roll the same die), and either is told plainly.
     The stored hand is used up either way, and dropped whenever it is not
     resumed (wave 12, M2: another game, an older save of this one, New
     game, an import), except in a tab another tab has taken over, where it
     is that tab's. Returns the turn's promise, or null. */
  function resumeHand() {
    const m = Storage.heldHand();
    if (!m) return null;
    if (Storage.readOnly) return null;
    const s = State.current;
    Storage.dropHand();
    if (!s || busy || State.muted || !isObj(m.action)) return null;
    const at = handMark(s);
    if (m.game !== at.game || m.seed !== at.seed || (at.turn | 0) + 1 !== m.turn || m.story !== at.story) return null;
    const cards = isObj(m.cards) ? m.cards : null;
    if (cards && Number.isInteger(m.d20)) hooks.nextD20 = clamp(m.d20, 1, 20);
    const speech = isObj(m.speech) ? m.speech : { mode: 'do' };
    // Dealt in this tab before a reload, or in another tab (wave 12, L3): the notice says which.
    const other = !!m.tab && m.tab !== Storage.tabId;
    // Wave 13: the game, the seats and the moves already made (a hold'em hand folds where it was left).
    // Wave 15: a hand stored before wave 13 has no game, and could only be five-card draw: it folds as one (never the chooser).
    const storedHand = { game: CARD_GAMES.includes(m.cardGame) ? m.cardGame : 'draw', seats: Array.isArray(m.seats) ? m.seats.filter(x => typeof x === 'string') : [], moves: Array.isArray(m.moves) ? m.moves.filter(validMove) : [], chose: m.chose === true, deal: isObj(m.deal) ? m.deal : null, structure: STRUCTURES.includes(m.structure) ? m.structure : null, pushback: Number.isInteger(m.pushback) && m.pushback > 0 ? Math.min(m.pushback, 99) : 0 };
    return runTurn({ input: String(m.input || ''), mode: 'normal', speech, action: deepCopy(m.action), resume: cards ? 'played' : 'open', resumeOther: other, replayCards: cards, storedHand });
  }
  /* A hand's name inside a sentence: "two pair, kings and sevens," (the comma closes it). */
  function handWords(name) { const t = lowerFirst(name); return t.includes(',') ? `${t},` : t; }
  /* The record /reroll replays (wave 11, L5): the hand as it was played, its cards and its holds. */
  function replayable(r) {
    if (!isObj(r) || !isObj(r.player) || !isObj(r.dealer) || !Array.isArray(r.player.dealt) || !Array.isArray(r.dealer.dealt)) return null;
    // Wave 13: a hold'em hand has its board (a hand folded early has no final five).
    return r.game === 'holdem' ? (Array.isArray(r.board) ? r : null) : Array.isArray(r.player.final) && Array.isArray(r.dealer.final) ? r : null;
  }
  /* A deal kept on the stored hand (wave 18: draw keeps its deal too, as
     hold'em does): five cards and a pile of five for the player, the
     dealer and each of n seats. */
  function drawDealOk(d, n) {
    const five = v => Array.isArray(v) && v.length === 5 && v.every(Cards.valid);
    return isObj(d) && five(d.player) && five(d.dealer) && five(d.playerPile) && five(d.dealerPile) && Array.isArray(d.seatHands) && d.seatHands.length === n && d.seatHands.every(x => isObj(x) && five(x.hand) && five(x.pile));
  }
  /* A hand of five-card draw (wave 10; wave 13: with the other seats,
     drawing by the dealer's rule, the Win (cheat) control and the armed
     win). Wave 18: every seat antes u (anteFor) instead of putting up the
     stake; the player draws (or folds, for the ante); then one round of
     no-limit betting after the draw (drawRun), the seats on their final
     hands; the best hand left takes the pot. A fold heads up before the
     draw ends the hand there (the dealer's cards as dealt); with others
     they draw and check it down among themselves. The money goes in as it
     is put in (c.pay). Returns the hand as played: { record, sides,
     winners, pot, showdown, folded, stopped, closed, win, node, held }. */
  async function drawHand(c) {
    const { s, dealer, seats, stake } = c;
    const u = anteFor(stake);
    const n = seats.length;
    const hookSet = isObj(hooks.cardsDeal) && Array.isArray(hooks.cardsDeal.player) ? hooks.cardsDeal : null;
    if (hookSet) hooks.cardsDeal = null;
    // A hand resumed after the page was closed (resumeHand) has its cards as stored.
    const kept = c.stored && drawDealOk(c.stored.deal, n) ? c.stored.deal : null;
    const dealt = dealHand(c.seed, readOdds(s), c.cheat || c.winNow, kept || hookSet, n);
    const people = [null].concat(seats, [dealer]);
    const keys = people.map(x => (x ? x.id : 'player'));
    // The others in table order (the seats, the dealer last), each with its draw by the dealer's rule.
    const plays = dealt.seatPlay.map(x => ({ dealt: x.dealt.slice(), held: x.held.slice(), final: x.final.slice() }))
      .concat([{ dealt: dealt.dealer.slice(), held: dealt.dealerHolds.slice(), final: dealt.dealerFinal.slice() }]);
    const h = { game: 'draw', seed: c.seed, ante: u, bet: unitFor(stake), stack: stake, limit: c.base.structure === 'limit', stacked: !!c.cheat, seats: [{ key: 'player', dealt: dealt.player.slice(), final: null, tilt: 0 }].concat(plays.map((x, k) => Object.assign({ key: keys[k + 1], tilt: tiltOf(people[k + 1]) }, x))) };
    const read = Object.assign({}, dealt.read, { text: readText(dealt.read.says, c.first) });
    const pFinalOf = holds => Cards.draw(dealt.player, holds, dealt.playerPile);
    let moves = c.stored && Array.isArray(c.stored.moves) ? c.stored.moves.filter(validMove) : [];
    let run = drawRun(h, moves);
    let win = null;
    let stopped = false;
    let closed = false;
    if (c.winNow) { win = c.win; run = drawRun(h, ['win']); }
    else if (c.left && run.need) { moves = run.moves.concat(['fold']); run = drawRun(h, moves); closed = true; }
    // The open table: before the draw the hands as dealt; after it the player's five (the new ones marked), each seat's draw, the round's choices.
    const view = () => {
      const bet = run.phase === 'bet' && !!run.holds;
      const pf = bet ? pFinalOf(run.holds) : null;
      const side = (i, extra) => Object.assign({ status: run.status[i], in: run.in[i] }, run.folded[i] ? { folded: true, foldedOn: run.foldedOn[i] } : {}, extra);
      const other = i => side(i, Object.assign({ dealt: h.seats[i].dealt.slice() }, bet ? { held: h.seats[i].held.slice() } : {}, bet && c.base.marked ? { final: h.seats[i].final.slice() } : {}));
      return Object.assign({ game: 'draw' }, c.base, {
        cheat: c.cheat, first: !run.moves.length && !c.node, phase: bet ? 'bet' : 'draw', read, pot: run.pot, playerIn: run.in[0], options: run.need ? run.need.slice() : null, ask: run.ask || null,
        player: side(0, Object.assign({ dealt: dealt.player.slice() }, pf ? { held: run.holds.slice(), final: pf, name: Cards.evaluate(pf).name } : {})),
        dealer: other(n + 1),
        seats: seats.map((x, k) => Object.assign({ id: x.id, who: x.name }, other(k + 1)))
      });
    };
    // The win cheat before any card is played (/cheat win, or Win at the chooser): the table is shown finished, never open.
    let node = c.winNow ? c.node : c.node ? UI.feed.cardsShow(c.node, view()) : UI.feed.cards(view(), c.left ? { replay: true } : null);
    c.pay(run.in[0]);
    const held = !c.left && !c.ctx.reroll ? holdThis(c, run.moves, { player: dealt.player.slice(), dealer: dealt.dealer.slice(), playerPile: dealt.playerPile.slice(), dealerPile: dealt.dealerPile.slice(), seatHands: (dealt.seats || []).map(x => ({ hand: x.hand.slice(), pile: x.pile.slice() })) }) : null;
    const auto = c.winNow || c.left ? null : takeAuto();
    while (run.need) {
      storeHand(held, { moves: run.moves.slice() });
      const drawing = run.phase === 'draw';
      // hooks.cardsBetting 'call' (tests, the console): the round after the draw is checked or called down, as a draw hand was played before wave 18.
      const choice = autoMove(auto, run.need) || (!drawing && hooks.cardsBetting === 'call' ? { act: run.need[0] } : null) || await waitForHand(view(), node, drawing ? 'draw' : 'drawbet');
      let mv;
      if (choice.win) mv = 'win';
      else if (choice.fold) { mv = 'fold'; stopped = choice.stopped === true; }
      else if (drawing) mv = Cards.moveText({ act: 'hold', hold: Cards.holdsFrom(choice.hold) });
      else mv = Cards.moveText(Cards.move(choice) || { act: run.need[0] });
      moves = run.moves.concat([mv]);
      run = drawRun(h, moves);
      if (run.win) win = 'control';
      c.pay(run.in[0]);
      if (run.need) UI.feed.cardsShow(node, view());
    }
    const folded = !!run.playerFolded;
    const n2 = n + 2;
    const inn = run.in.slice();
    const foldedArr = run.folded.slice();
    const foldedOn = run.foldedOn.slice();
    let holds = run.holds ? run.holds.slice() : [];
    let pFinal = run.holds ? pFinalOf(run.holds) : dealt.player.slice();
    let others = plays.map(x => ({ dealt: x.dealt.slice(), held: x.held.slice(), final: x.final.slice() }));
    // The win cheat (wave 14, QA #1): never a card the player has seen changed. Before the draw: the hand as it would end (the player standing on what the dealer's rule holds; an armed win stands pat on its stacked hand) when that is already the player's, else the draws dealt so it is (rigDraw), else everyone else throws in their hand. After the draw (wave 18): the player's five stay; the others' draws, unseen without a marked deck, are dealt again so they lose, else they throw in their hands.
    let foldOut = false;
    const atDraw = !run.holds;
    if (win) {
      const live = foldedArr.map(f => !f);
      const rng = Rng.create(((c.seed ^ 0x6a09e667) >>> 0) || 1);
      const beats = fin => others.every((o, k) => !live[k + 1] || Cards.compare(fin, o.final) > 0);
      if (atDraw) {
        const mine = c.winNow ? [0, 1, 2, 3, 4] : Cards.dealerHolds(dealt.player);
        const natural = Cards.draw(dealt.player, mine, dealt.playerPile);
        if (beats(natural)) { holds = mine; pFinal = natural; }
        else {
          const rig = rigDraw(rng, dealt.player, others.map(o => ({ dealt: o.dealt, held: o.held })));
          if (rig) { holds = rig.holds; pFinal = rig.pFinal; others = rig.others.map(o => ({ dealt: o.dealt, held: o.held, final: o.final })); }
          else { foldOut = true; holds = [0, 1, 2, 3, 4]; pFinal = dealt.player.slice(); }
        }
      } else if (!beats(pFinal)) {
        const rig = c.base.marked ? null : rigDraw(rng, dealt.player, others.map(o => ({ dealt: o.dealt, held: o.held })), { holds, final: pFinal });
        if (rig) others = rig.others.map(o => ({ dealt: o.dealt, held: o.held, final: o.final }));
        else foldOut = true;
      }
      if (foldOut) {
        // The others throw in their hands where the hand stands; a bet the player faced is called first (a bet nobody matched is never won).
        inn[0] = Math.max(...inn.filter((x, i) => live[i]));
        for (let i = 1; i < n2; i++) if (live[i]) { foldedArr[i] = true; foldedOn[i] = atDraw ? 0 : 1; }
      } else if (c.winNow) {
        // The armed win (wave 18): everyone all in, the player's hand the best.
        for (let i = 0; i < n2; i++) inn[i] = stake;
      } else {
        // Every seat still in calls the bet on the table (wave 18): the pot as it stands, matched.
        const top = Math.max(...inn.filter((x, i) => live[i]));
        for (let i = 0; i < n2; i++) if (live[i]) inn[i] = top;
      }
    }
    // Thrown in without drawing (a fold heads up before the draw, or the win cheat's fold-out there): the cards as dealt.
    const thrown = (foldOut && atDraw) || (folded && atDraw && !n);
    const sides = [{ key: 'player', in: inn[0], live: !foldedArr[0], final: pFinal }]
      .concat(others.map((o, k) => ({ key: keys[k + 1], in: inn[k + 1], live: !foldedArr[k + 1], final: thrown ? o.dealt.slice() : o.final.slice() })));
    const { pot, winners } = settlePot(sides);
    const shownAll = sides.filter(x => x.live).length >= 2;
    // The names at the showdown, apart where two of the same name differ (wave 14, QA #9).
    const names = Cards.namesApart(sides.map(x => (x.live && shownAll ? x.final : null)));
    const otherRec = k => {
      const o = others[k];
      const i = k + 1;
      const x = sides[i];
      const out = { dealt: o.dealt.slice(), held: thrown ? [0, 1, 2, 3, 4] : o.held.slice(), final: x.final.slice(), name: names[i] || (thrown && !foldedArr[i] ? Cards.evaluate(x.final).name : null), in: x.in, won: x.won };
      if (x.back) out.back = x.back;
      if (foldedArr[i]) Object.assign(out, { folded: true, foldedOn: foldedOn[i] });
      // Took the pot unseen after the draw: its cards stay face down (heads up, a hand thrown in before the draw shows as dealt, as before).
      else if (!shownAll && !thrown) out.hidden = true;
      return out;
    };
    const record = Object.assign({ game: 'draw' }, c.base, {
      cheat: c.cheat, read, moves: run.moves.slice(),
      player: Object.assign({ dealt: dealt.player.slice(), held: holds.slice(), final: pFinal.slice(), name: names[0] || Cards.evaluate(pFinal).name, in: sides[0].in, won: sides[0].won }, sides[0].back ? { back: sides[0].back } : {}, folded ? { foldedOn: foldedOn[0] } : {}),
      dealer: otherRec(n),
      seats: seats.map((x, k) => Object.assign({ id: x.id, who: x.name }, otherRec(k))),
      pot, winners, showdown: showdownOf(winners, folded), actions: actionsOf(run.log, keys)
    });
    if (folded) { record.folded = true; if (stopped) record.stopped = true; if (closed) record.closed = true; }
    if (foldOut || (!!run.uncontested && !win)) record.uncontested = true;
    if (win) record.win = win;
    if (c.chose) record.chose = true;
    if (!node) node = UI.feed.cards(record, { replay: true });
    return { record, sides, winners, pot, showdown: record.showdown, folded, stopped: folded && stopped, closed: folded && closed, win, node, held };
  }
  /* The player's reads at hold'em (wave 13): when a seat first bets (wave
     18: or raises), a read on whether it has something or is bluffing,
     right with the read's odds (60% + 12% a point of Wits, 50 to 95%:
     readOdds), from the hand's seed. None with a marked deck: every seat's
     cards are face up then. */
  function holdemReads(h, run, odds, people) {
    return h.seats.map((x, i) => {
      const r = run.reads[i];
      if (!i || !r) return null;
      const truth = r.bluff ? 'nothing' : 'something';
      const right = coin(h.seed, i, 8, r.street) < odds;
      const says = right ? truth : truth === 'something' ? 'nothing' : 'something';
      return { says, right, odds, text: readText(says, firstWord(people[i].name)) };
    });
  }
  /* The open hold'em table for the UI: the board turned so far (the rest is
     not in it), each seat's two cards and what it last did, the pot and
     what the player has in, and the player's choices (wave 18: with the
     round's ask, the amounts the table allows). */
  function holdemView(c, h, run, odds, people) {
    const n = h.seats.length;
    const street = Math.min(run.street, 3);
    const shown = STREET_CARDS[street];
    const reads = c.base.marked ? [] : holdemReads(h, run, odds, people);
    const side = i => Object.assign({ dealt: h.seats[i].hole.slice(), status: run.status[i], in: run.in[i] }, run.folded[i] ? { folded: true, foldedOn: run.foldedOn[i] } : {}, reads[i] ? { read: reads[i] } : {});
    return Object.assign({ game: 'holdem' }, c.base, {
      cheat: c.cheat, first: !run.moves.length && !c.node, street, shown, board: h.board.slice(0, shown), pot: run.pot, playerIn: run.in[0], options: run.need ? run.need.slice() : null, ask: run.ask || null,
      player: side(0), dealer: side(n - 1), seats: c.seats.map((x, k) => Object.assign({ id: x.id, who: x.name }, side(k + 1)))
    });
  }
  /* hooks.cardsPlay (tests, the console): it lasts the hand. { moves: [...] }
     plays those (Cards.move strings or objects: 'bet:8', 'raise:24',
     'allin', 'call', 'check', 'fold', 'win', 'hold:024') and then waits for
     the table; { fold } or { win } is the first decision; at draw { hold:
     [0-4] | 'all' } is the draw; anything else checks and calls to the end
     (at draw after drawing what hold says: none held, five new). */
  function takeAuto() {
    const a = hooks.cardsPlay;
    hooks.cardsPlay = null;
    return isObj(a) ? Object.assign({}, a, Array.isArray(a.moves) ? { moves: a.moves.slice() } : {}) : null;
  }
  function autoMove(auto, need) {
    if (!auto) return null;
    if (auto.win === true) return { win: true };
    if (auto.fold === true) return { fold: true };
    const listed = Array.isArray(auto.moves);
    if (need[0] === 'draw' && !(listed && auto.moves.length && /^hold:/.test(String(auto.moves[0])))) {
      if (auto.drawn) return null;
      auto.drawn = true;
      return { hold: Cards.holdsFrom(auto.hold) };
    }
    if (listed) {
      if (!auto.moves.length) return null;
      const mv = Cards.move(auto.moves.shift());
      if (!mv) return null;
      return mv.act === 'win' ? { win: true } : mv.act === 'fold' ? { fold: true } : mv.act === 'hold' ? { hold: mv.hold } : mv;
    }
    return { act: need[0] };
  }
  /* A hand of Texas hold'em (wave 13; the owner: "the one where you have 2
     cards"). Wave 18: no limit. The stake S is the buy-in; every seat
     antes u (anteFor) and bets what it likes on four rounds (holdemRun);
     the money goes in as it is put in (c.pay). A page closed with it open
     folds it after the moves already made; Stop folds it (what the player
     has put in is lost). The Win (cheat) control ends it the player's:
     every seat still in calls the bet on the table and the player's hand
     is the best; an armed /cheat win is everyone all in, the player's hand
     the best. Wave 14 (QA #1, #13): the win cheat changes no card the
     player has seen: the deal stands when it already makes the player's
     hand the best, else rigHoldem deals what is still unseen; when nothing
     can, the seats still in fold to the player on that street (the player
     calling a bet they faced first) and the player takes the pot as it
     stands, told as everyone folding (uncontested). No tie and no weaker
     hand ever takes the pot. (QA #6) The board's label follows it: five
     cards up at the end is the Showdown; a hand everyone folded stops on
     its street. */
  async function holdemHand(c) {
    const { s, dealer, seats, stake } = c;
    const u = anteFor(stake);
    const people = [null].concat(seats, [dealer]);
    const n = people.length;
    const set = isObj(hooks.cardsDeal) && Array.isArray(hooks.cardsDeal.holes) ? hooks.cardsDeal : null;
    if (set) hooks.cardsDeal = null;
    const rng = Rng.create(c.seed);
    const given = set && set.holes.length === n && set.holes.every(x => Array.isArray(x) && x.length === 2) && Array.isArray(set.board) && set.board.length === 5;
    // A hand resumed after the page was closed (resumeHand) has its cards as stored: the very hand that was dealt.
    const kept = c.stored && isObj(c.stored.deal) && Array.isArray(c.stored.deal.holes) && c.stored.deal.holes.length === n && c.stored.deal.holes.every(x => Array.isArray(x) && x.length === 2 && x.every(Cards.valid)) && Array.isArray(c.stored.deal.board) && c.stored.deal.board.length === 5 && c.stored.deal.board.every(Cards.valid) ? c.stored.deal : null;
    const dealt = kept ? { holes: kept.holes.map(x => x.slice()), board: kept.board.slice() } : given ? { holes: set.holes.map(x => x.slice()), board: set.board.slice() } : c.cheat || c.winNow ? Cards.holdemStacked(rng, n) : Cards.holdem(rng, n);
    const h = { game: 'holdem', seed: c.seed, ante: u, bet: unitFor(stake), stack: stake, limit: c.base.structure === 'limit', stacked: !!c.cheat, board: dealt.board.slice(), seats: people.map((x, i) => ({ key: x ? x.id : 'player', hole: dealt.holes[i].slice(), tilt: x ? tiltOf(x) : 0 })) };
    let moves = c.stored && Array.isArray(c.stored.moves) ? c.stored.moves.filter(validMove) : [];
    const odds = readOdds(s);
    let run = holdemRun(h, moves);
    let win = null;
    let stopped = false;
    let closed = false;
    if (c.winNow) { win = c.win; run = holdemRun(h, ['win']); }
    else if (c.left && run.need) { moves = run.moves.concat(['fold']); run = holdemRun(h, moves); closed = true; }
    const view = () => holdemView(c, h, run, odds, people);
    let node = c.winNow ? c.node : c.node ? UI.feed.cardsShow(c.node, view()) : UI.feed.cards(view(), c.left ? { replay: true } : null);
    c.pay(run.in[0]);
    const held = !c.left && !c.ctx.reroll ? holdThis(c, run.moves, { holes: h.seats.map(x => x.hole.slice()), board: h.board.slice() }) : null;
    const auto = c.winNow || c.left ? null : takeAuto();
    while (run.need) {
      storeHand(held, { moves: run.moves.slice() });
      const choice = autoMove(auto, run.need) || await waitForHand(view(), node, 'holdem');
      let mv;
      if (choice.win) mv = 'win';
      else if (choice.fold) { mv = 'fold'; stopped = choice.stopped === true; }
      else mv = Cards.moveText(Cards.move(choice) || { act: run.need[0] });
      moves = run.moves.concat([mv]);
      run = holdemRun(h, moves);
      if (run.win) win = 'control';
      c.pay(run.in[0]);
      if (run.need) UI.feed.cardsShow(node, view());
    }
    let board = h.board.slice();
    let holes = h.seats.map(x => x.hole.slice());
    const inn = run.in.slice();
    const folded = run.folded.slice();
    const foldedOn = run.foldedOn.slice();
    const endStreet = Math.min(run.street, 3);
    let foldOut = false;
    if (win) {
      const live = folded.map(f => !f);
      if (!beatsAll(holes[0], holes.filter((x, i) => i > 0 && live[i]), board)) {
        // What the player has seen: the board so far, their own two and, with a marked deck, everyone's. An armed win was never on the table: nothing was seen.
        const rig = rigHoldem(Rng.create(((c.seed ^ 0x6a09e667) >>> 0) || 1), holes, board, c.winNow ? 0 : STREET_CARDS[endStreet], live, !c.winNow && !!c.base.marked);
        if (rig) { board = rig.board; holes = rig.holes; } else foldOut = true;
      }
      if (foldOut) {
        // The others fold to the player where the hand stands; a bet the player faced is called first (a bet nobody matched is never won).
        inn[0] = Math.max(...inn.filter((x, i) => live[i]));
        for (let i = 1; i < n; i++) if (live[i]) { folded[i] = true; foldedOn[i] = endStreet; }
      } else if (c.winNow) {
        // The armed win (wave 18): everyone all in, the player's hand the best.
        for (let i = 0; i < n; i++) inn[i] = stake;
      } else {
        // Every seat still in calls the bet on the table (wave 18): the pot as it stands, matched.
        const top = Math.max(...inn.filter((x, i) => live[i]));
        for (let i = 0; i < n; i++) if (live[i]) inn[i] = top;
      }
    }
    const playerFolded = !!run.playerFolded;
    const uncontested = foldOut || (!!run.uncontested && !win);
    // At a showdown (and when the others play the player's fold out among themselves) the board is complete; a hand everyone folded stops where it was.
    const complete = !uncontested && !!(win || run.showdown || playerFolded);
    const shownEnd = complete ? 5 : STREET_CARDS[endStreet];
    const sides = h.seats.map((x, i) => ({ key: x.key, in: inn[i], live: !folded[i], final: !folded[i] && complete ? Cards.best(holes[i].concat(board)).cards : null }));
    const { pot, winners } = settlePot(sides);
    // The names at the showdown, apart where two of the same name differ (wave 14, QA #9).
    const names = Cards.namesApart(sides.map(x => x.final));
    const reads = c.base.marked ? [] : holdemReads(h, run, odds, people);
    const side = i => {
      const x = sides[i];
      const out = { dealt: holes[i].slice(), final: x.final ? x.final.slice() : null, name: x.final ? names[i] : null, in: x.in, won: x.won };
      if (x.back) out.back = x.back;
      if (folded[i] && i > 0) Object.assign(out, { folded: true, foldedOn: foldedOn[i] });
      if (reads[i]) out.read = reads[i];
      return out;
    };
    const mine = side(0);
    if (playerFolded || uncontested) {
      // Folded: what their cards made with the board they saw; everyone folded to them: with the board as it stands.
      const so = handSoFar(holes[0], board.slice(0, playerFolded ? STREET_CARDS[foldedOn[0]] : shownEnd));
      Object.assign(mine, { final: so.final, name: so.name });
      if (playerFolded) mine.foldedOn = foldedOn[0];
    }
    const record = Object.assign({ game: 'holdem' }, c.base, {
      cheat: c.cheat, board: board.slice(), shown: shownEnd, street: complete ? 4 : endStreet, moves: run.moves.slice(),
      player: mine, dealer: side(n - 1), seats: seats.map((x, k) => Object.assign({ id: x.id, who: x.name }, side(k + 1))),
      pot, winners, showdown: showdownOf(winners, playerFolded), actions: actionsOf(run.log, h.seats.map(x => x.key))
    });
    if (uncontested) record.uncontested = true;
    if (playerFolded) { record.folded = true; if (stopped) record.stopped = true; if (closed) record.closed = true; }
    if (win) record.win = win;
    if (c.chose) record.chose = true;
    if (!node) node = UI.feed.cards(record, { replay: true });
    return { record, sides, winners, pot, showdown: record.showdown, folded: playerFolded, stopped: playerFolded && stopped, closed: playerFolded && closed, win, node, held };
  }
  /* A hand replayed from its record (/reroll; a hand played before the page
     was closed): its seats and its money as played. A wave 10-12 record
     (heads up at draw, no money per seat) has its pot worked out again. */
  function playedHand(r) {
    const rec = deepCopy(r);
    for (const k of ['result', 'delta', 'cash']) delete rec[k];
    const folded = rec.folded === true || r.result === 'fold';
    const list = [Object.assign({ key: 'player' }, rec.player)].concat((rec.seats || []).map(x => Object.assign({ key: x.id }, x)), [Object.assign({ key: rec.dealerId || 'dealer' }, rec.dealer)]);
    if (!Array.isArray(rec.winners) || !['win', 'lose', 'split', 'fold'].includes(rec.showdown) || list.some(x => !Number.isInteger(x.in) || !Number.isInteger(x.won))) {
      const sides = [{ key: 'player', in: folded ? foldPrice(rec.stake) : rec.stake, live: !folded, final: rec.player.final }, { key: list[list.length - 1].key, in: rec.stake, live: true, final: rec.dealer.final }];
      const st = settlePot(sides, { keepUncalled: true });
      Object.assign(list[0], { in: sides[0].in, won: sides[0].won });
      Object.assign(list[list.length - 1], { in: sides[1].in, won: sides[1].won });
      Object.assign(rec.player, { in: sides[0].in, won: sides[0].won });
      Object.assign(rec.dealer, { in: sides[1].in, won: sides[1].won });
      Object.assign(rec, { game: rec.game || 'draw', pot: st.pot, winners: st.winners, showdown: showdownOf(st.winners, folded) });
    }
    const node = UI.feed.cards(r, { replay: true });
    return { record: rec, sides: list, winners: rec.winners, pot: rec.pot, showdown: rec.showdown, folded, stopped: rec.stopped === true, closed: rec.closed === true, win: rec.win || null, node, held: null };
  }
  /* What the other seats make of the hand (wave 13), recorded by the engine:
     one that lost the most it could to the player (the stake at draw, five
     units at hold'em: the stake when it is a multiple of $5) remembers it
     and likes the player 2 less; one that took a pot the player had money
     in remembers it and likes them 1 more. Not the dealer: it is his game
     (and his attitude decides whether he deals). Wave 14 (QA #3): only for
     money that matters and once a day, so small hands cannot be used to
     move a card player: the loss counts only when the most the seat could
     lose is SEAT_MARK_MIN ($10) or more, the win only when the seat took
     $10 or more of the player's own money (its share of what the player
     put in), and each seat has at most one such memory and attitude change
     a day, the first (flags['cardsMark.<id>'] is the day of it). Wave 18
     (no limit: "the most it could" is the whole stake, all in): a loss
     counts when the seat put $10 or more into a pot the player took. */
  const SEAT_MARK_MIN = 10;
  function seatMarks(out, p, place) {
    const playerTook = out.winners.includes('player');
    const mems = [];
    const effects = [];
    const told = [];
    const s = State.current;
    const today = s.time.day;
    const pot = out.sides.reduce((t, x) => t + (x.in | 0), 0);
    for (const x of out.sides.slice(1, -1)) {
      const n = State.npc(x.key);
      if (!n || (isObj(s.flags) && s.flags[`cardsMark.${n.id}`] === today)) continue;
      const took = out.winners.includes(x.key);
      // What the seat took of the player's money: its share of the pot, of what the player put in.
      const fromPlayer = pot > 0 ? Math.floor((out.sides[0].in | 0) * (x.won | 0) / pot) : 0;
      // Wave 27: the seat's liking moves as card_loss / card_win (everyday, the same -2 / +1); the line is a noted one, moving nothing.
      if (playerTook && !took && (x.in | 0) >= SEAT_MARK_MIN) {
        mems.push({ npcId: n.id, text: `lost ${money(x.in)} to ${p.name} at cards at ${place}`, weight: 1, event: 'noted' });
        effects.push({ op: 'socialEvent', npcId: n.id, event: 'card_loss', text: `lost ${money(x.in)} to ${p.name} at cards at ${place}`, d: { w: -2 } }, { op: 'setFlag', key: `cardsMark.${n.id}`, value: today });
        told.push({ id: n.id, name: n.name, lost: x.in });
      } else if (took && !playerTook && fromPlayer >= SEAT_MARK_MIN) {
        mems.push({ npcId: n.id, text: `took a pot off ${p.name} at cards at ${place}`, weight: 1, event: 'noted' });
        effects.push({ op: 'socialEvent', npcId: n.id, event: 'card_win', text: `took a pot off ${p.name} at cards at ${place}`, d: { w: 1 } }, { op: 'setFlag', key: `cardsMark.${n.id}`, value: today });
        told.push({ id: n.id, name: n.name, took: true });
      }
    }
    if (mems.length) {
      const r = State.apply({ newMemories: mems, effects });
      if (r.rejected.length) State.pushDebug({ turn: State.current.meta.turn, kind: 'rejected', source: 'engine', path: 'gamble seats', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
    }
    return told;
  }
  /* A hand's name as something shown: "a pair of tens", "two pair, aces and nines", "ace high", "a flush, king high". */
  function handPhrase(name) {
    const t = lowerFirst(String(name || 'a hand'));
    return /^(?:pair|flush|straight|full house|royal)\b/.test(t) ? `a ${t}` : t;
  }
  /* The big moments of a hand's betting (wave 18), for the narrator, the
     demo and the plain line, never every action: at most two, the all-ins
     first, then the raises, then the biggest bets, told in the order they
     came, each with how the table answered: "the player raised to $40 on
     the turn and Carter Sturdivant called", "Lyman Coker went all in on the
     river and the player called", "the player bet $10 after the draw and
     everyone folded". you: "you" for the player (the demo, the plain line).
     Wave 19 (QA D8): a fold is told once. The player's own fold is never
     an answer here (the result tells it, with what it cost), and the
     returned list carries .folds, the seats whose folds these moments
     told, so the rest of the telling (tableWords, the demo, the plain
     line) leaves them out. */
  function betMoments(rec, you) {
    const acts = Array.isArray(rec && rec.actions) ? rec.actions : [];
    const names = new Map([['player', you ? 'you' : 'the player']].concat((rec.seats || []).map(x => [x.id, x.who]), [[rec.dealerId, rec.dealerName]]));
    const who = k => names.get(k) || 'someone';
    const holdem = rec.game === 'holdem';
    const when = st => (holdem ? STREET_WORDS[st] : DRAW_WORDS[st]) || '';
    const big = acts.map((x, i) => ({ x, i })).filter(({ x }) => x.act === 'bet' || x.act === 'raise');
    if (!big.length) return Object.assign([], { folds: [] });
    const score = ({ x }) => (x.allIn ? 3e7 : 0) + (x.act === 'raise' ? 1e7 : 0) + (x.to | 0);
    const pick = big.slice().sort((a, b) => score(b) - score(a) || a.i - b.i).slice(0, 2).sort((a, b) => a.i - b.i);
    const others = Math.max(0, (rec.seats || []).length + 1);
    const what = x => (x.allIn ? 'went all in' : x.act === 'bet' ? `bet ${money(x.to)}` : `raised to ${money(x.to)}`);
    // The answers to the action at i: what came after it on that round, up to the next bet or raise (its index, -1 when none).
    const answers = i => {
      const x = acts[i];
      const calls = [];
      const folds = [];
      const foldKeys = [];
      let next = -1;
      for (let j = i + 1; j < acts.length && acts[j].street === x.street; j++) {
        const y = acts[j];
        if (y.act === 'bet' || y.act === 'raise') { next = j; break; }
        if (y.act === 'call') calls.push(who(y.seat));
        else if (y.act === 'fold' && y.seat !== 'player') { folds.push(who(y.seat)); foldKeys.push(y.seat); }
      }
      const parts = [];
      if (calls.length) parts.push(`${andList(calls)} called`);
      if (folds.length) parts.push(!calls.length && next < 0 && folds.length === others && others > 1 ? 'everyone folded' : `${andList(folds)} folded`);
      return { parts, next, foldKeys };
    };
    const out = [];
    const told = new Set();
    const tell = a => { for (const k of a.foldKeys) told.add(k); };
    for (let k = 0; k < pick.length; k++) {
      const { x, i } = pick[k];
      const at = when(x.street);
      const a = answers(i);
      let text = `${who(x.seat)} ${what(x)}${at ? ` ${at}` : ''}`;
      if (a.next >= 0) {
        // The bet or raise that answered it, and how that was answered (the second big moment, when it is that one, is told here).
        const y = acts[a.next];
        const b = answers(a.next);
        if (pick[k + 1] && pick[k + 1].i === a.next) k += 1;
        text += `${a.parts.length ? `, ${a.parts.join(', ')}` : ''}, ${who(y.seat)} ${what(y)}${b.parts.length ? ` and ${b.parts.join(', ')}` : ''}`;
        tell(a);
        tell(b);
      } else if (a.parts.length === 1) { text += ` and ${a.parts[0]}`; tell(a); }
      // More than one answer after a colon: "Lyman Coker went all in on the river: you called, Royce Pittman folded".
      else if (a.parts.length) { text += `: ${a.parts.join(', ')}`; tell(a); }
      out.push(text);
    }
    return Object.assign(out, { folds: [...told] });
  }
  /* How a table of more than two (or hold'em) ended, for the narrator (wave
     13): each other seat ("Royce Pittman folded on the turn", "Elbert
     Gentry showed a pair of tens", "Curtis Pruett's straight, nine high,
     takes the $36 pot"), then the player ("the player's two pair, aces and
     nines, takes the $60 pot: the player wins $40"). Wave 18: the betting's
     big moments first (betMoments), and draw's folds before or after the
     draw. */
  function tableWords(rec, delta, extra) {
    const others = (rec.seats || []).map(x => ({ key: x.id, name: x.who, side: x })).concat([{ key: rec.dealerId, name: rec.dealerName, side: rec.dealer }]);
    const pot = money(rec.pot | 0);
    const co = others.filter(o => rec.winners.includes(o.key));
    const holdem = rec.game === 'holdem';
    const when = st => (holdem ? STREET_WORDS[st] : DRAW_WORDS[st]) || (holdem ? 'before the showdown' : 'before the draw');
    const moments = extra ? [] : betMoments(rec, false);
    // Wave 19 (QA D8): a fold the moments told is not told again.
    const told = new Set(moments.folds || []);
    const parts = moments.slice();
    for (const o of others) {
      const x = o.side;
      if (x.folded) { if (!told.has(o.key)) parts.push(`${o.name} folded ${when(x.foldedOn)}`); }
      else if (co.includes(o) && !rec.winners.includes('player')) parts.push(`${o.name}${x.name && !x.hidden ? `'s ${handWords(x.name)}` : ''} ${co.length > 1 ? 'splits' : 'takes'} the ${pot} pot${x.hidden ? ' without showing' : ''}`);
      else if (x.name && !x.hidden) parts.push(`${o.name} showed ${handPhrase(x.name)}`);
    }
    const me = rec.player;
    const mine = handWords(me.name || 'hand');
    const amount = money(Math.abs(delta | 0));
    let part;
    if (rec.folded) {
      const gave = !holdem && Number.isInteger(rec.ante) && me.in === rec.ante ? `the ${money(me.in)} ante` : `the ${money(me.in)} they had put in`;
      part = holdem || Number.isInteger(rec.ante) ? `the player folded their ${mine} ${when(me.foldedOn)} and gave up ${gave}` : `the player folds their ${mine} before the draw and gives up half the stake: the player loses ${amount}`;
    }
    // Each seat that folded is named already, above or in the moments (wave 14, QA #21; wave 19, QA D8): no "everyone else folded" again.
    else if (rec.uncontested) part = `the player takes the ${pot} pot without a showdown: the player wins ${amount}`;
    else if (rec.showdown === 'win') part = `the player's ${mine} takes the ${pot} pot: the player wins ${amount}`;
    else if (rec.showdown === 'split') part = `the player's ${mine} splits the ${pot} pot with ${andList(co.map(o => o.name))}: ${delta > 0 ? `the player wins ${amount}` : delta < 0 ? `the player loses ${amount}` : 'no money changes hands'}`;
    else part = `the player's ${mine} loses: the player loses ${amount}`;
    return parts.concat([extra || part]).join('; ');
  }
  /* Asking for a bigger game (wave 18, amendment 2: the dealer sets the
     terms, so no limit is something the player asks for). Said or done at
     the card table, or to its dealer, between hands: "no limit", "table
     stakes", "raise the stakes", "a bigger game", "higher stakes", "play
     for real", "take the limit off", "lift the limit", "can we bet what we
     like" and the like (STAKES_ASK, the engine's own word rule, read
     whatever the parser called the action). stakesAsked(ctx) is the dealer
     asked, or null. stakesAsk resolves it as a Charm persuade at normal
     difficulty against the dealer (Dice's attitude modifier as for any
     persuasion): a dealer colder than STAKES_COLD refuses without a roll
     ("Not with you."); a success makes his table no limit for the rest of
     the day (flags['cardsNoLimit.<id>'] = the day); a failure is his "no"
     (flags['cardsAsked.<id>']); a fumble is a "no" that costs 5 attitude.
     Asked again the same day after a "no", he repeats himself without a
     roll; a table already no limit says so. Each outcome is a plain line
     in the dealer's voice, the usual roll line when there was one, and a
     STAKES line for the narrator. The flags go through the engine's
     setFlag effect (engine-only).
     Wave 19 (QA D1: "There's no limit to what I'd do for her" and a
     whiskey ordered from Loretta "no limit on the whiskey" were asks): the
     words must be plainly about the game's stakes ("no limit" not followed
     by to, on, of, for or in; "a bigger game" not followed by "than") and
     aimed at the dealer: said to him in Say mode, the parser's targets
     include him, his name is in the words, or the words name the game or
     the table itself (STAKES_GAME: "table stakes", "no-limit poker", "the
     limit off the table", "bet what we like at cards", "deal me in, no
     limit"). A parser that aimed the line at someone else is never
     overridden.
     Wave 20 (QA N2, N3): the words carry it, and the aim is the scene. A
     "limit" that is talk is never an ask (stakesWords): one after a
     possessive ("your limit", "my limit"), after know, has, have, is,
     there's or without ("Curtis, your greed has no limit.", "He'll play
     without a limit, that one."), or one with a greed, a patience or the
     like before it in its clause ("Does your greed know no limit,
     Curtis?"). The ask words alone are enough at the dealer's place with
     him there: said to him (or to everyone) in Say mode, or done with no
     one else as the target ("no limit", "Take the limit off.", "Raise the
     stakes."). At a table already no limit today a line that sits down
     ("deal me in for $50, no limit") is no ask: it deals (QA N8). The
     wave 19 test of a name or the game in the words (stakesNamed,
     STAKES_GAME) is gone with it. */
  const STAKES_ASK = /\b(?:no[\s-]?limit(?!\s+(?:to|on|of|for|in)\b)|table[\s-]stakes|(?:raise|up|lift)\s+the\s+(?:stakes|limit)|(?:a\s+)?bigger\s+(?:game|stakes|bets)(?!\s+than\b)|higher\s+stakes(?!\s+than\b)|play\s+for\s+real|(?:take|lift|drop)\s+the\s+limit\s+off|take\s+off\s+the\s+limit|(?:lift|drop|scrap|lose|ditch|forget)\s+the\s+limit|bet\s+(?:what(?:ever)?|anything)\s+(?:we|i|you)\s+(?:like|want))\b/i;
  const STAKES_COLD = 0;
  // A "limit" that is talk (wave 20, QA N2): after know, has, is, there's or without (a possessive one never matches STAKES_ASK), or with a greed or the like before it in its clause.
  const LIMIT_TALK_BEFORE = /(?:^|[^a-z'])(?:know|knows|knew|knowing|has|have|had|having|is|was|are|were|there|there's|theres|without)\s+$/i;
  const LIMIT_OWNER = /\b(?:greed|greediness|patience|appetite|ambition|nerve|gall|cheek|luck|thirst|hunger|love|kindness|generosity|imagination|cruelty|stupidity|pride|temper|mercy|charity|ego|vanity|gluttony|spite|malice|meanness|cunning|courage|daring|folly|madness)\b/i;
  /* The words ask for a bigger game (wave 20, QA N2): a STAKES_ASK phrase
     that is not talk. "table stakes", "a bigger game", "raise the stakes"
     always ask; one with "limit" in it asks unless its limit is talk
     (LIMIT_TALK_BEFORE right before it, a LIMIT_OWNER before it in its
     clause). STAKES_ASK has no possessive limit ("lift your limit" is
     talk) and no "without a limit". */
  function stakesWords(text) {
    const t = String(text || '').replace(/[’‘]/g, "'");
    const re = new RegExp(STAKES_ASK.source, 'gi');
    for (let m = re.exec(t); m; m = re.exec(t)) {
      if (!/limit/i.test(m[0])) return true;
      const before = t.slice(0, m.index);
      const lead = before + m[0].slice(0, m[0].search(/(?:no[\s-]?)?limit/i));
      if (LIMIT_TALK_BEFORE.test(lead) || LIMIT_OWNER.test(before.split(/[,;:.!?]/).pop())) continue;
      return true;
    }
    return false;
  }
  function stakesAsked(ctx) {
    const a = ctx.action;
    const text = String(ctx.input || '').replace(/[’‘]/g, "'");
    if (!a || !stakesWords(text)) return null;
    if (['attack', 'steal', 'move'].includes(a.actionType)) return null;
    const l = here();
    if (!l || !cardGameAt(l) || shutReason(l)) return null;
    const dealer = dealerOf(ctx.presentIds);
    if (!dealer) return null;
    // Said or aimed at someone else here: not an ask of the dealer.
    if (isSay(ctx.speech) && ctx.speech.to && ctx.speech.to !== 'everyone' && ctx.speech.to !== dealer.id) return null;
    const targets = a.targets || [];
    const others = targets.filter(t => /^npc_/.test(t) && t !== dealer.id && ctx.presentIds.includes(t));
    if (others.length && !targets.includes(dealer.id)) return null;
    // Wave 20 (QA N8): his table is no limit today already, so a line that sits down deals ("deal me in for $50, no limit").
    if (tableStructure(dealer) === 'nolimit' && (a.actionType === 'gamble' || wordsBet(text))) return null;
    // Wave 20 (QA N3): at his place, said to him or done with nobody else as the target, the words alone are the ask.
    return dealer;
  }
  function stakesAsk(ctx, dealer) {
    const s = State.current;
    const a = ctx.action;
    const day = s.time.day;
    const fl = isObj(s.flags) ? s.flags : {};
    const name = dealer.name;
    const first = firstWord(name);
    a.actionType = 'persuade';
    a.targets = [dealer.id].concat((a.targets || []).filter(t => t !== dealer.id));
    // Wave 20 (QA N3): an ask is a sentence at the table, whatever the parser made of its time.
    Object.assign(a, { needsRoll: false, stat: 'charm', difficulty: 'normal', timeCost: 'instant' });
    let outcome;
    let roll = null;
    if (fl[`cardsNoLimit.${dealer.id}`] === day) outcome = 'already';
    else if (fl[`cardsAsked.${dealer.id}`] === day) outcome = 'again';
    else if ((toInt(dealer.attitude) || 0) < STAKES_COLD) outcome = 'cold';
    else {
      a.needsRoll = true;
      const rollOpts = { stat: 'charm', difficulty: 'normal', npcId: dealer.id, actionType: 'persuade', presentIds: ctx.presentIds.slice() };
      roll = Dice.resolve(Object.assign({}, rollOpts, { d20: nextDie(rollOpts) }));
      ctx.roll = roll;
      ctx.rollNpcId = dealer.id;
      UI.feed.roll(roll);
      storyPointFor(ctx, roll);
      outcome = roll.success ? 'yes' : roll.tier === 'critical_failure' ? 'fumble' : 'no';
    }
    const line = {
      yes: `${first} shrugs. "Table stakes, then. Don't cry to me after."`,
      no: `"House rules," ${first} says. "We play the limit here."`,
      fumble: `${first}'s face closes. "Ask me that again and you can find another game."`,
      cold: `${first} doesn't look up. "Not with you."`,
      again: `"You heard me," ${first} says. "House rules."`,
      already: `"Table stakes already," ${first} says. "Bet what you like."`
    }[outcome];
    const effects = outcome === 'yes' ? [{ op: 'setFlag', key: `cardsNoLimit.${dealer.id}`, value: day }]
      : outcome === 'no' || outcome === 'fumble' ? [{ op: 'setFlag', key: `cardsAsked.${dealer.id}`, value: day }].concat(outcome === 'fumble' ? [{ op: 'attitudeDelta', npcId: dealer.id, delta: -5 }] : []) : [];
    if (effects.length) {
      const r = State.apply({ effects });
      if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'stakes', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
    }
    UI.feed.quiet(line);
    const told = {
      yes: `the roll succeeded: ${name} agrees, and the card table plays table stakes (no limit: any bet from the table's bet up to all in) for the rest of today. Show ${name} agreeing, in character`,
      no: `the roll failed: ${name} keeps the house limit. Show ${name} turning it down, in character`,
      fumble: `the roll fumbled: ${name} turns it down and is put out by the asking (recorded already: a little colder), and will not hear it again today`,
      cold: `${name} is too cold to the player to consider it and turns it down flat`,
      again: `${name} said no to it earlier today and says it again, shorter`,
      already: `${name}'s table is table stakes today already; ${name} says so`
    }[outcome];
    ctx.narratorLines.push(`TABLE STAKES: the player asked ${name} to take the limit off the card game; ${told}. No hand is dealt this turn and no money changes hands.`);
    ctx.bookLines.push(`TABLE STAKES (already applied by the engine; do not record again): the player asked ${name} for a no-limit game (${outcome === 'yes' ? 'agreed' : 'refused'}); record no social event, flag or goldDelta for it.`);
    ctx.stakes = { outcome, dealerId: dealer.id, dealerName: name, line };
    return {};
  }
  async function gamble(ctx) {
    const s = State.current;
    const p = s.player;
    const a = ctx.action;
    const l = here();
    const dealer = dealerOf(ctx.presentIds);
    const nl = ctx.narratorLines = ctx.narratorLines || [];
    const bl = ctx.bookLines = ctx.bookLines || [];
    if (a.timeCost === 'instant') a.timeCost = 'short';
    // Why it is shut, in words (wave 3, playtest N8), and "today" before the evening.
    const shut = shutReason(l);
    const game0 = !shut && cardGameAt(l);
    // He will not deal to someone he caught (wave 11, L6); a bet said to someone else in Say mode is no bet (wave 11, H2).
    const cold = game0 && dealer ? dealerRefusal(dealer, s) : null;
    const saidTo = game0 && dealer && isSay(ctx.speech) && ctx.speech.to && ctx.speech.to !== 'everyone' && ctx.speech.to !== dealer.id ? State.npc(ctx.speech.to) : null;
    if (!game0 || !dealer || cold || saidTo || (p.gold | 0) < 1) {
      Object.assign(a, { needsRoll: false, stat: null, difficulty: null });
      const when = ['evening', 'night'].includes(s.time.phase) ? 'tonight' : 'today';
      // Nobody dealing: when the dealer does (wave 11, L7).
      const hours = game0 && !dealer ? dealerHours(l) : '';
      const why = shut ? `${placeName(l)} is shut (${shut}), so there is no game ${when}` : !game0 ? 'there is no card game here'
        : !dealer ? `nobody is dealing right now${hours ? ` (${hours})` : ''}, so there is no game to sit in on`
          : cold ? `${dealer.name} won't deal to the player${cold.caughtDay ? `, not since catching them cheating at cards on Day ${cold.caughtDay}` : ', not the way things stand between them'}`
            : saidTo ? `the player said it to ${saidTo.name}, and ${dealer.name} is the one who deals`
              : 'the player has no money to put up';
      nl.push(`CARD GAME: no game: ${why}. No money changes hands.`);
      bl.push(`CARD GAME: no game was played (${why}); record no goldDelta and no social event for it.`);
      // The demo's words name someone the player has not met as the Say picker does (wave 12, L10: "the owner and bartender"); the narrator always gets the name.
      ctx.gamble = { played: false, why, dealerId: dealer ? dealer.id : null, dealerName: dealer ? dealer.name : null, dealerLabel: dealer ? npcLabel(dealer) : null, hours: hours || null, hoursLabel: hours ? dealerHours(l, true) : null, refused: !!cold, caughtDay: cold && cold.caughtDay ? cold.caughtDay : null, saidTo: saidTo ? saidTo.name : null, saidToLabel: saidTo ? npcLabel(saidTo) : null };
      return {};
    }
    // A /reroll of a hand (wave 11, L5): the hand as it was played; only the catch roll is new. A hand the page was closed on after it was played (resumeHand): the same.
    const replay = ctx.reroll || ctx.resume ? replayable(ctx.replayCards) : null;
    // "another hand" (wave 20, QA N9): at the stake of the last hand at this table today, as the between-hands notice pairs them; else the usual.
    const lastToday = s.log.slice().reverse().find(e => isObj(e.cards) && e.cards.dealerId === dealer.id && e.day === s.time.day);
    const st = replay ? { stake: replay.stake, named: Number.isFinite(replay.named) ? replay.named : null, note: replay.stakeNote || null } : stakeFor(ctx.input, p.gold, lastToday ? lastToday.cards.stake : null);
    const stake = st.stake;
    // The action as told (ACTION) names the stake the engine plays, not the parser's guess (wave 3: "Deal me in" is $20, not "bets $10").
    a.summary = /\$\s*\d/.test(String(a.summary || '')) ? String(a.summary).replace(/\$\s*\d[\d,]*/, money(stake)) : `bets ${money(stake)} at cards`;
    const deck = markedDeck(p);
    const first = firstWord(dealer.name);
    const seed = cardSeed(s);
    // A hand the page was closed on before it was played (resumeHand): folded, as if the player got up and left (wave 12, L4: closed, not stopped), after the moves already made (wave 13).
    const left = !replay && ctx.resume === 'open';
    const stored = !replay && isObj(ctx.storedHand) ? ctx.storedHand : null;
    a.targets = [dealer.id].concat(a.targets.filter(t => t !== dealer.id));
    // Wave 18: the house rules (the ante and the table's bet) go with the table and the record.
    // Amendment 2: the structure (limit, the house game; no limit once the dealer agreed today), as played on a replay, as stored on a hand resumed.
    const structure = replay ? (STRUCTURES.includes(replay.structure) ? replay.structure : null) : stored && STRUCTURES.includes(stored.structure) ? stored.structure : tableStructure(dealer);
    const base = { dealerId: dealer.id, dealerName: dealer.name, stake, ante: anteFor(stake), unit: unitFor(stake), marked: !!deck };
    if (structure) base.structure = structure;
    // The dealer's pushbacks so far this hand (wave 19, QA D10: kept on a stored hand resumed after a reload).
    pushes = stored ? stored.pushback | 0 : 0;
    heldOpen = null;
    if (st.note) base.stakeNote = st.note;
    if (st.note && st.named !== null && st.named !== stake) base.named = st.named;
    status('cards');
    /* The game (wave 13): as played (a replay), as stored (a page closed on
       the hand), named in the words, or the one played last; with none,
       the table opens with a chooser before any card is dealt (Stop there
       costs nothing: the turn is called off). A game chosen or named is
       remembered (flags.cardGame). */
    const named = replay || stored ? null : gameFrom(ctx.input);
    let game = replay ? (replay.game === 'holdem' ? 'holdem' : 'draw') : stored && CARD_GAMES.includes(stored.game) ? stored.game : named || rememberedGame();
    let chose = replay ? replay.chose === true : stored ? stored.chose === true : !!named;
    // /cheat win (wave 13): armed, this hand is not played; it is the player's, the table shown finished.
    let win = !replay && !left && winArmed() ? 'armed' : null;
    let node = null;
    if (!game && !win) {
      const pick = Object.assign({ choose: true }, base);
      // The status line asks for the game (wave 14, QA #18): no hand is dealt yet.
      status('choose');
      node = UI.feed.cards(pick);
      const choice = await waitForHand(pick, node, 'choose');
      status('cards');
      if (choice.win) win = 'control';
      else { game = choice.game; chose = true; }
    }
    if (!game) game = 'holdem';
    if (chose && rememberedGame() !== game) State.apply({ cardGame: game });
    const cheat = replay ? replay.cheat === true : !win && cheatArmed();
    // Spent with this deal: a turn that does not go through gives it back with the snapshot. A hand played before the page was closed (resumeHand) spends it too (wave 12, L1: the pre-turn autosave still has it armed).
    if (cheat && cheatArmed() && (!replay || ctx.resume)) State.apply({ cardsCheat: false });
    if (win === 'armed' || (replay && ctx.resume && replay.win === 'armed' && winArmed())) State.apply({ cardsWin: false });
    const set = !replay && isObj(hooks.cardsDeal) ? hooks.cardsDeal : null;
    const seats = replay ? (replay.seats || []).map(x => State.npc(x.id)).filter(Boolean) : stored && Array.isArray(stored.seats) ? stored.seats.map(id => State.npc(id)).filter(Boolean) : seatsFor(ctx, dealer, seed, set);
    const c = { s, ctx, dealer, seats, stake, deck, cheat, win, winNow: !!win, base, seed, first, left, stored, node, game, chose, paid: 0 };
    /* The money goes in as it is put in (wave 18): the ante at the deal and
       each bet or call as it is made (the top bar and the Character panel
       follow); the hand's settlement at the end moves the rest. */
    c.pay = amount => {
      const d = (amount | 0) - c.paid;
      if (d <= 0) return;
      const r = State.apply({ goldDelta: -d });
      if (r.rejected.length) { State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'gamble pay', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') }); return; }
      c.paid += d;
      UI.showCash();
    };
    moveWhy = null;
    const out = replay ? playedHand(replay) : game === 'holdem' ? await holdemHand(c) : await drawHand(c);
    const rec0 = out.record;
    // The move that finished the hand was a typed amount the table changed (wave 20, QA N4): what it went in as stays under the result.
    if (!replay && moveWhy && !out.folded && !out.win) rec0.amountWhy = moveWhy;
    moveWhy = null;
    // The dealer held the player to the limit this hand (amendment 2): how many times, on the record.
    if (pushes && !replay) rec0.pushback = pushes;
    // Stop folded it (wave 11, M1): the ante is in; the turn is committed and told plainly.
    if (out.folded && out.stopped && !replay) ctx.handStopped = true;
    // Only the marked deck rolls (whether the dealer catches it), and not on a /cheat cards hand or a win cheat.
    const rolls = !!deck && !cheat && !out.win;
    Object.assign(a, { needsRoll: rolls, stat: rolls ? 'wits' : null, difficulty: rolls ? 'normal' : null });
    // The marked deck's one roll, once the hand is played (no complication at cards: being caught is what goes wrong).
    let roll = null;
    if (rolls) {
      const mods = Dice.modifiersFor(s, { stat: 'wits', actionType: 'gamble', social: false }).concat([{ label: deck.name, value: 2 }]);
      const rollOpts = { stat: 'wits', difficulty: 'normal', actionType: 'gamble', modifiers: mods, complication: null };
      roll = Dice.resolve(Object.assign({}, rollOpts, { d20: nextDie(rollOpts) }));
      // What the roll is for, under the table (wave 11, L9), read so that a success is the player's (wave 12, L2): "Keeping the marks from Curtis: Wits 17 + 3 = 20 vs 12 · Success".
      roll.line = `Keeping the marks from ${first}: ${roll.line}`;
      ctx.roll = roll;
      UI.feed.roll(roll);
      storyPointFor(ctx, roll);
    }
    const caught = !!roll && roll.tier === 'critical_failure';
    const result = caught ? 'caught' : out.showdown;
    const me = out.sides[0];
    const delta = caught ? -stake : (me.won | 0) - (me.in | 0);
    // What was paid in as the hand went (c.pay) is already off the cash: the rest of the hand's result moves now.
    if (delta + c.paid) State.apply({ goldDelta: delta + c.paid });
    // The top bar and the Character panel show the cash the table shows (wave 11, M2), mid-turn as it is.
    UI.showCash();
    const record = Object.assign({}, rec0, { result, delta, cash: p.gold });
    delete record.plain;
    ctx.cards = record;
    UI.feed.cardsDone(out.node, record);
    // Played: a page closed before the turn is kept finds the hand as it ended, and the catch roll's die.
    storeHand(out.held, { cards: record, d20: roll ? roll.d20 : null });
    const place = String(l.name).replace(/^The /, 'the ');
    // What the other seats make of it (wave 13); nothing when the hand is void.
    const marks = caught ? [] : seatMarks(out, p, place);
    // Put out (wave 4, playtest R2): onto the street outside, which the narration tells; the engine moves the player there after it.
    const street = caught ? outsideOf(l) : null;
    // Heads up at draw, as told before wave 13; a fold-out (wave 14: the win cheat's) is told as the table's are.
    // Wave 18: only a showdown is told that way; a fold (before or after the draw) is told as the table's are.
    const headsUpDraw = game === 'draw' && !seats.length && rec0.uncontested !== true && !out.folded;
    // The betting's big moments (wave 18): for the narrator, the demo ("you") and the plain line.
    const moments = caught ? [] : betMoments(rec0, false);
    const nameOf = key => (key === 'player' ? 'the player' : (State.npc(key) || {}).name || 'someone');
    ctx.gamble = {
      played: true, game, stake, unit: rec0.unit || null, ante: rec0.ante || null, delta, result, caught, folded: out.folded, stopped: !!ctx.handStopped, cheat, win: out.win || null,
      dealerId: dealer.id, dealerName: dealer.name, deck: deck ? deck.name : null, player: rec0.player.name, dealer: rec0.dealer.name, tier: roll ? roll.tier : null, locationId: l.id,
      pot: out.pot, uncontested: rec0.uncontested === true, headsUp: !seats.length, winners: out.winners.filter(k => k !== 'player').map(nameOf),
      seats: (rec0.seats || []).map(x => ({ id: x.id, name: x.who, hand: x.name, folded: x.folded === true, foldedOn: Number.isInteger(x.foldedOn) ? x.foldedOn : null, won: x.won | 0 })),
      dealerFolded: rec0.dealer.folded === true, dealerFoldedOn: Number.isInteger(rec0.dealer.foldedOn) ? rec0.dealer.foldedOn : null, marks,
      playerFoldedOn: Number.isInteger(rec0.player.foldedOn) ? rec0.player.foldedOn : null, dealerHidden: rec0.dealer.hidden === true,
      moments: caught ? [] : betMoments(rec0, true)
    };
    // The seats whose folds the moments tell (wave 19, QA D8): the demo and the plain line do not tell them again.
    ctx.gamble.foldsTold = (ctx.gamble.moments.folds || []).slice();
    if (street) Object.assign(ctx.gamble, { outsideId: street.id, outsideName: street.name });
    const onto = street ? ` onto ${placeName(street)}` : '';
    const ph = handWords(rec0.player.name || 'hand');
    const dh = handWords(rec0.dealer.name || 'hand');
    const caughtHow = `the player loses ${money(stake)}, and ${dealer.name} catches them cheating with the ${deck ? lowerFirst(deck.name) : 'deck'}; the hand is void`;
    const won = money(Math.abs(delta));
    const how = caught && game === 'draw' && !seats.length ? caughtHow : headsUpDraw ? moments.concat([{
      win: `the player's ${ph} beats ${dealer.name}'s ${dh} at the showdown: the player wins ${won}`,
      lose: `the player's ${ph} loses to ${dealer.name}'s ${dh} at the showdown: the player loses ${won}`,
      split: `the player's ${ph} ties ${dealer.name}'s ${dh} at the showdown: a split pot, and no money changes hands`
    }[result]]).join('; ') : tableWords(rec0, delta, caught ? caughtHow : null);
    // The game and who sat in (wave 13): "five-card draw, heads up with Curtis Pruett", "Texas hold'em with Royce Pittman and Curtis Pruett, Curtis Pruett dealing". Wave 18: the buy-in and the ante, no limit.
    const around = seats.map(n => n.name).concat([dealer.name]);
    // The house rules (wave 18: "$20 to sit, $1 ante, $4 bets"); a hand recorded before them (a replay of a wave 10-17 draw hand) is told as it was.
    const fresh = Number.isInteger(rec0.ante) || game === 'holdem';
    const lead = !fresh
      ? `the card game (the player put up ${stakeWords(rec0)}): five-card draw${seats.length ? ` with ${andList(around)}, ${money(stake)} each` : `, heads up with ${dealer.name}`}`
      : `the card game (the player bought in for ${stakeWords(rec0)}; house rules: ${rulesText(stake, rec0.structure)}, ${game === 'holdem' ? 'four rounds of betting' : 'one round of betting after the draw'}): ${game === 'holdem' ? "Texas hold'em" : 'five-card draw'}${seats.length ? ` with ${andList(around)}, ${dealer.name} dealing` : `, heads up with ${dealer.name}`}`;
    /* The terms said as the player sits down (wave 19, QA D13): when the
       stake or the structure differs from the last hand at this dealer's
       table (none before it in the story, another stake, or limit then and
       no limit now), not "for the first time". A hand Stop folded is told
       in a plain line (wave 11, by design), so its terms are not said.
       Wave 20 (QA N6): so the last hand here is the last one narrated: a
       hand told in a plain line (Stop, a closed page, another tab, a
       narrator that failed or was stopped: stopped, closed or plain on its
       record) is passed over, and the next hand at its stake says them. */
    const prevHand = s.log.slice().reverse().find(e => isObj(e.cards) && e.cards.dealerId === dealer.id && !e.cards.stopped && !e.cards.closed && !e.cards.plain);
    const newTerms = fresh && !caught && (!prevHand || prevHand.cards.stake !== stake || (prevHand.cards.structure || null) !== (rec0.structure || null));
    ctx.gamble.rules = newTerms ? rulesWords(stake, rec0.structure) : null;
    const tableSize = stake < 1000 ? dollarWords(stake).replace(/^a /, '') : money(stake);
    const terms = newTerms ? ` ${p.name} sits down at ${dealer.name}'s ${tableSize} table (${money(anteFor(stake))} ante, ${rec0.structure === 'nolimit' ? 'no limit' : `${money(unitFor(stake))} limit`}): have ${dealer.name} state the table's terms as they sit ("${rulesWords(stake, rec0.structure)}").` : '';
    // Held to the limit (amendment 2): one clause, so the narrator can show it; the amounts were on the table already.
    const heldTo = (rec0.pushback | 0) > 0 ? ` When the player tried to bet past the limit, ${dealer.name} held them to the house's ${money(unitFor(stake))} bets${rec0.pushback > 1 ? ` (${rec0.pushback === 2 ? 'twice' : `${rec0.pushback} times`})` : ''}.` : '';
    ctx.gamble.pushback = rec0.pushback | 0;
    const cash = delta ? `cash now ${money(p.gold)}` : `cash still ${money(p.gold)}`;
    // Said only when money moved (wave 11, M6): a split pot moves none.
    const moved = delta ? ' The money has already changed hands.' : '';
    const readMarks = rolls && !caught ? ` The player read the dealer's cards off the ${lowerFirst(deck.name)} through the hand, and ${dealer.name} did not catch it.` : '';
    // What the seats make of it is recorded already (wave 13).
    const kept = marks.length ? ` Already recorded: ${marks.map(m => (m.lost ? `${m.name} lost ${money(m.lost)} to the player and holds it against them a little` : `${m.name} took a pot off the player and is pleased about it`)).join('; ')}.` : '';
    // Back on the first day the place is open (wave 11, L6), and the dealer will not deal to them for a week.
    const back = caught ? openDayFrom(l, s.time.day + CAUGHT_BAN_DAYS) : null;
    const thrown = caught ? ` ${dealer.name} takes the ${lowerFirst(deck.name)} and throws the player out of ${place}${onto}, and they are not welcome back for three days (today counted: back on ${State.weekday(back)}, Day ${back}); ${dealer.name} won't deal to them for a week.` : '';
    nl.push(`OUTCOME: ${lead}; ${how} (${cash}).${moved}${readMarks}${kept}${heldTo}${terms} The table was shown to the player card by card already: tell the moment and the people, do not list the cards again.${thrown}${street ? ` End the narration with the player outside on ${placeName(street)}: the engine moves them there.` : ''}`);
    const amount = money(Math.abs(delta));
    const said = caught ? `loses ${money(stake)}` : result === 'fold' ? `folds and loses ${amount}` : result === 'split' ? (delta ? `${delta > 0 ? 'wins' : 'loses'} ${amount} (a split pot)` : 'breaks even (a split pot)') : result === 'win' ? `wins ${amount}` : `loses ${amount}`;
    const seatLine = seats.length ? ` The other players were ${andList(seats.map(n => n.name))}, with ${dealer.name} dealing; what they remember of the hand and how they feel about the player are recorded already: record no social event for the hand.` : '';
    bl.push(`CARD GAME (already applied by the engine; do not record again): the player ${said} at cards (cash now ${money(p.gold)}); record no goldDelta for it.${caught ? ` ${dealer.name} caught them cheating: his memory, his attitude, the three-day ban and the deck he took are recorded already.` : ''}${seatLine}${street ? ` The engine puts the player out on ${placeName(street)}: record no playerLocationId.` : ''}`);
    // Wave 28: the table's feelings are the engine's (the seats' wins and losses, a cheat caught).
    bl.push('THE TABLE: record no social event for the card game.');
    if (caught) {
      const r = State.apply({
        // Caught with a marked deck (wave 4, the playtest's design note): the dealer keeps it.
        itemsLost: [{ id: deck.id, qty: deck.qty || 1 }],
        // A ban ends before its untilDay (State.isBanned): three days is today and the two after (wave 3). The day he caught them: no game for a week (dealerRefusal).
        // Wave 27: cheated, with today's -20 (trust -30 from the row), the memory its own (weight 3); the others at the table see it.
        effects: [{ op: 'socialEvent', npcId: dealer.id, event: 'cheated', text: `caught ${p.name} cheating at cards in ${place}`, weight: 3, d: { w: -20 }, witnesses: (ctx.presentIds || []).filter(id => id !== dealer.id), public: true }, { op: 'banFrom', locationId: l.id, days: CAUGHT_BAN_DAYS, byNpcId: dealer.id },
          { op: 'setFlag', key: `cardsCaught.${dealer.id}`, value: s.time.day },
          { op: 'addNews', text: `${dealer.name} caught ${p.name} cheating at cards at ${place} and threw them out.`, public: true, seen: true }]
      });
      if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'gamble', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
    }
    return {};
  }
  /* The hand told by the engine (wave 11, M1): when Stop folded it, or the
     narrator failed, was stopped or declined after the showdown. One plain
     paragraph ("The hand is played: your two pair, kings and sevens, beats
     Curtis Pruett's pair of aces. You win $50."); nothing else this turn is
     told, so what came due waits (ctx.due emptied) and the bookkeeper is
     not asked. */
  function plainHandText(ctx) {
    const g = ctx.gamble || {};
    const c = ctx.cards || {};
    const name = g.dealerName || 'The dealer';
    const amount = money(Math.abs(g.delta | 0));
    const lead = t => (t.includes(',') ? `${t},` : t);
    const yours = lowerFirst(String(g.player || 'hand'));
    const theirs = lowerFirst(String(g.dealer || 'hand'));
    // Heads up at draw, as before; at hold'em or with more at the table (wave 13), the pot and who took it.
    const headsUpDraw = g.game !== 'holdem' && !(g.seats || []).length && !g.uncontested;
    const pot = money(g.pot | 0);
    const takers = Array.isArray(g.winners) && g.winners.length ? andList(g.winners) : name;
    // Everyone folding to the player: heads up it is the dealer who folds (wave 14, QA #21); not again when the moments told every fold (wave 19, QA D8).
    const toldAll = Array.isArray(g.foldsTold) && [g.dealerId].concat((g.seats || []).map(x => x.id)).every(k => g.foldsTold.includes(k));
    const foldedTo = toldAll ? '' : (g.seats || []).length ? 'everyone else folds' : `${name} folds`;
    let text;
    if (g.caught) text = `${name} catches you with the ${lowerFirst(g.deck || 'deck')}: the hand is void. You lose ${amount} and the deck${g.outsideName ? `, and you are out on ${String(g.outsideName).replace(/^The /, 'the ')}` : ''}.`;
    else if (g.result === 'fold') text = c.stopped || c.closed ? `You fold your ${yours}, get up from the table and give up ${amount}.` : `You fold your ${lead(yours)} and give up ${amount}.`;
    else if (!headsUpDraw && g.result === 'win') text = g.uncontested ? `The hand is played: ${foldedTo ? `${foldedTo}, and ` : ''}the ${pot} pot is yours. You win ${amount}.` : `The hand is played: your ${lead(yours)} takes the ${pot} pot. You win ${amount}.`;
    else if (!headsUpDraw && g.result === 'lose') text = `The hand is played: ${takers} ${(g.winners || []).length > 1 ? 'split' : 'takes'} the ${pot} pot, and your ${yours} loses. You lose ${amount}.`;
    else if (!headsUpDraw) text = `The hand is played: your ${lead(yours)} splits the ${pot} pot. ${(g.delta | 0) > 0 ? `You win ${amount}.` : (g.delta | 0) < 0 ? `You lose ${amount}.` : 'Nothing changes hands.'}`;
    else if (g.result === 'win') text = `The hand is played: your ${lead(yours)} beats ${name}'s ${theirs}. You win ${amount}.`;
    else if (g.result === 'lose') text = `The hand is played: your ${lead(yours)} loses to ${name}'s ${theirs}. You lose ${amount}.`;
    else text = `The hand is played: your ${lead(yours)} ties ${name}'s ${theirs}. You split the pot.`;
    if (g.deck && g.tier && !g.caught) text += ` ${name} never spots the marks.`;
    // The betting's big moments first (wave 18): "You raised to $40 on the turn and Carter Sturdivant called."
    const moments = !g.caught && Array.isArray(g.moments) ? g.moments : [];
    return moments.length ? `${capFirst(moments.join('; '))}. ${text}` : text;
  }
  /* What waits after a hand (wave 11, M4): thrown out, an event whose
     person is the dealer, or whose place is this place, is told on a later
     turn, kept due; and while a dealer will not deal to the player
     (dealerRefusal, for any reason: wave 12, M3 — the week after he caught
     them, or while he is colder to them than DEALER_COLD), an event of his
     that is not about an obligation waits too (he does not come to invite
     them to his game). */
  function dueHold(ctx) {
    const s = State.current;
    const g = ctx && ctx.gamble;
    const npcIds = [];
    let locationId = null;
    if (g && g.played && g.caught) { npcIds.push(g.dealerId); locationId = g.locationId || null; }
    const fl = isObj(s.flags) ? s.flags : {};
    const cold = new Set(Object.keys(fl).filter(k => k.startsWith('cardsCaught.') && Number.isInteger(fl[k]) && s.time.day - fl[k] < DEALER_GRUDGE_DAYS).map(k => k.slice('cardsCaught.'.length)));
    for (const n of s.npcs) if ((isBookie(n) || isCardDealer(n)) && n.alive !== false && dealerRefusal(n, s)) cold.add(n.id);
    const coldNpcIds = [...cold];
    return npcIds.length || coldNpcIds.length ? { npcIds, locationId, coldNpcIds } : null;
  }
  /* What the hand came to, for a notice (wave 12, L5): "you win $50",
     "you lose $20", "a split pot", "you fold and give up $10", "you are
     caught cheating and lose $20". */
  function handOutcome(g) {
    const amount = money(Math.abs((g && g.delta) | 0));
    return !g ? 'as it was played' : g.caught ? `you are caught cheating and lose ${amount}` : g.result === 'win' ? `you win ${amount}`
      : g.result === 'lose' ? `you lose ${amount}` : g.result === 'fold' ? `you fold and give up ${amount}` : (g.delta | 0) > 0 ? `a split pot: you win ${amount}` : (g.delta | 0) < 0 ? `a split pot: you lose ${amount}` : 'a split pot';
  }
  /* What a hand folded by Stop, a closed page or another tab cost, for its
     notice (wave 19, QA D3: never "the ante" when more went in): "the $1
     ante is gone" when only the ante went in, else "the $15 you put in is
     gone"; caught with a marked deck, "you lose $20". */
  function handLost(g) {
    const n = Math.abs(((g && g.delta) | 0));
    if (g && g.caught) return `you lose ${money(n)}`;
    return g && Number.isInteger(g.ante) && n === g.ante ? `the ${money(n)} ante is gone` : `the ${money(n)} you put in is gone`;
  }
  function plainNarration(ctx, why, err) {
    const text = plainHandText(ctx);
    ctx.plain = why;
    ctx.due = [];
    ctx.rumour = null;
    const node = UI.feed.narration(text, false);
    // A hand left open was folded; one already played stands. Left in this tab (a reload) or in another one (wave 12, L3).
    if (why === 'left') UI.feed.notice(ctx.resume === 'open' ? (ctx.resumeOther ? NOTICES.handOtherOpen : NOTICES.handLeftOpen)(handLost(ctx.gamble)) : (ctx.resumeOther ? NOTICES.handOtherPlayed : NOTICES.handLeftPlayed));
    else if (why === 'folded') UI.feed.notice(NOTICES.handFolded(handLost(ctx.gamble)));
    else if (why === 'stopped') UI.feed.notice(NOTICES.handStopped);
    else if (why === 'refused') UI.feed.notice(NOTICES.handRefused);
    else {
      // The narrator failed after the showdown (wave 12, L5): there is nothing to try again, so the notice says what happened and how the hand stands, not "try again".
      if (err) { console.warn('[Pipeline] the narrator failed after a hand', err); State.pushDebug({ turn: State.current.meta.turn, kind: 'narrator', reason: `the narrator failed after the hand (${(err && (err.type || err.message)) || err}); told plainly` }); }
      UI.feed.notice(NOTICES.handUntold(err instanceof Api.ApiError || !err, handOutcome(ctx.gamble)), 'error');
    }
    return { narration: text, node, mock: false, plain: true };
  }

  /* The memories that matter: every serious one (newest w3), the newest notable
     ones (w2), and a small one only if recent; oldest first, capped. Shared by
     the narrator packet and the People cards. A loose end's memory ("Loose end
     with Tomas (a debt): ...") is the player's own words about the past, so
     the People card leaves it out; the narrator keeps it (o.looseEnds), on
     top of the cap, because it is who this person is to the player. */
  const LOOSE_MEMORY = /^Loose end with /i;
  function pickMemories(list, turn, o) {
    const all = list || [];
    const ms = all.filter(m => !LOOSE_MEMORY.test(m.text));
    const keep = new Set([].concat(
      ms.filter(m => m.weight >= 3).slice(-o.w3),
      ms.filter(m => m.weight === 2).slice(-o.w2),
      ms.filter(m => m.weight <= 1 && turn - m.turn <= o.recent).slice(-o.w1)));
    const picked = ms.filter(m => keep.has(m)).slice(-o.cap);
    if (!o.looseEnds) return picked;
    return all.filter(m => LOOSE_MEMORY.test(m.text) || picked.includes(m));
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
  /* Wave 25: a narrated arrival. The narrator is told who is here and never
     invents anyone, but when the story has set it up (someone said they
     would come by in ten minutes, a meeting the engine did not catch) it
     writes the person walking in, and the engine's scene must follow or the
     player cannot speak to them. A sentence with a cast member's name as the
     subject of an arrival ("Jodie slips in", "Curtis Pruett shows up at the
     door", "Royce knocks and lets himself in") makes a visit for this phase
     where the player is. Not for the dead, the gone, the arrested, the laid
     up or someone already here, and not from reported speech ("Curtis saw
     me come in": Curtis is not the one arriving). Wave 33: "Jodie's here",
     "is in the doorway", "comes through the door", "pushes the door open"
     count too, and a first name is read as theirs when nobody else who
     could walk in has it (a namesake dead, gone or here does not matter). */
  const ARRIVAL_VERBS = "(?:slips?|steps?|walks?|comes?|ducks?|pushes|lets? (?:her|him|them)self|eases) (?:back )?in(?:to the room| the door|side)?\\b|(?:comes?|walks?|shows?|turns?) up\\b|arrives?\\b|appears? (?:in|at) the door(?:way)?\\b|(?:is|stands) (?:at|in) the door(?:way)?\\b|knocks?(?: twice| once| on the door)?\\b|joins? you\\b|sits? down (?:next to|beside|across from) you\\b"
    // Wave 33: someone simply there, or through the door.
    + "|(?:is|'s) (?:here|inside|in the room|in the doorway)\\b|(?:comes?|walks?|steps?) through the door\\b|pushes? the door open\\b|lets? (?:her|him|them)self in\\b";
  const ARRIVAL_RE_CACHE = new Map();
  function arrivalRe(name) {
    if (!ARRIVAL_RE_CACHE.has(name)) ARRIVAL_RE_CACHE.set(name, new RegExp("(^|[^A-Za-z'\"])" + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "(?:(?:[,\\s]+[a-z'-]+){0,5}[,\\s]+(?:" + ARRIVAL_VERBS + ")|['\u2019]s (?:here|inside|in the room|in the doorway)\\b)", 'i'));
    return ARRIVAL_RE_CACHE.get(name);
  }
  function noteArrivals(narration, locationId) {
    const s = State.current;
    if (!s || typeof narration !== 'string' || !narration) return [];
    const l = State.loc(locationId || s.player.locationId);
    if (!l || l.away === true || l.closed) return [];
    const here = new Set(State.npcsAt(l.id).map(n => n.id));
    // Reported speech is not an arrival: look only outside quotes.
    const outside = narration.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ');
    // Wave 33: a first name counts when it is unique among the people who could walk in (a namesake dead, gone or here is no one arriving).
    const could = s.npcs.filter(n => !here.has(n.id) && n.alive !== false && n.status === 'free' && !n.unnamed && !State.laidUp(n));
    const first = {};
    for (const n of could) { const f = String(n.name || '').split(/\s+/)[0]; first[f] = (first[f] || 0) + 1; }
    const ids = [];
    for (const n of could) {
      const f = String(n.name || '').split(/\s+/)[0];
      const names = [n.name].concat(f && f.length >= 3 && first[f] === 1 ? [f] : []).filter(Boolean);
      if (names.some(nm => arrivalRe(nm).test(outside))) ids.push(n.id);
    }
    for (const id of ids) {
      const r = State.apply({ visits: [{ npcId: id, locationId: l.id }] });
      if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'arrival', reason: `${id} walked in by the story but could not be placed: ${r.rejected[0].reason}` });
      else State.pushDebug({ turn: s.meta.turn, kind: 'arrival', reason: `${id} walked in by the story: here at ${l.id} this phase` });
    }
    return ids;
  }
  /* Wave 3 (playtest N5, N6): on a walk, the people where it lands (when:
     { phase, day }) are the ones introduced; and someone already known
     (a loose end's person) is met, so the narrator stops describing their
     look, once the narration names them in front of the player or the
     player speaks to them (also: ids spoken to). */
  function noteIntroductions(narration, locationId, when, also) {
    const s = State.current;
    if (!s || typeof narration !== 'string' || !narration) return [];
    const ids = [];
    const here = State.npcsAt(locationId || s.player.locationId, when && when.phase, when && when.day);
    const done = n => n.knownToPlayer && Number.isInteger(n.metTurn);
    for (const id of also || []) { const n = here.find(x => x.id === id); if (n && n.knownToPlayer && !done(n) && n.alive !== false) ids.push(n.id); }
    for (const n of here) {
      if (done(n) || ids.includes(n.id) || n.alive === false || n.unnamed) continue;
      // A surname that is also part of a place name ('Pittman's Gas and Service') proves nothing on its own.
      const placeNames = s.locations.map(x => String(x.name || '').toLowerCase());
      const names = String(n.name || '').trim().split(/\s+/).filter((w, i) => w.length >= 3 && (i === 0 || !placeNames.some(pn => pn.includes(w.toLowerCase())))).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!names.length) continue;
      if (new RegExp('(^|[^A-Za-z])(?:' + names.join('|') + ')(?![A-Za-z])').test(narration)) ids.push(n.id);
    }
    // Introduced in front of the player: met (metTurn), so the narrator stops describing their look (playtest B19).
    if (ids.length) State.apply({ npcKnownToPlayer: ids }, { present: here.map(n => n.id) });
    return ids;
  }

  // ----- step 6: the narrator's packet -----
  /* The calendar (CONTRACTS section 1) is State's: State.weekday, State.dateLine. */
  function dateText(day) { return State.dateLine(day); }
  /* "DAY 2 (Friday 9 October), EVENING (late)": State.clockLine with the date. */
  function clockText(t) { return State.clockLine(t).replace(/^DAY (\d+)/, (m, d) => `${m} (${dateText(parseInt(d, 10))})`); }
  /* TIME THIS TAKES, from the action's time cost and the clock now (time
     passes after the narration): how long, and where in the day it will be. */
  function timeTakes(ctx) {
    const a = ctx.action || {};
    let cost = TIME_COSTS.includes(a.timeCost) ? a.timeCost : 'instant';
    const t = State.current.time;
    let lead = 'a few minutes';
    // Beaten senseless in this fight: the narration stops as they go down (DEFEAT); what comes after, and the time it takes, is the engine's (wave 3: never a night in a cell it will not give).
    if (ctx.defeated) return 'the fight ends with the player going down; the narration stops there, and the engine decides what comes after and how long it takes';
    // An arrest (decided before this narration, and only when it will happen: ctx.arrest.plan): the night in the cell follows it.
    if (ctx.arrest && ctx.arrest.plan) return `the fight is broken up and the player spends the night in a cell; it will be morning (day ${t.day + 1}, ${weekdayOf(t.day + 1)}) when this is done`;
    if (cost === 'instant') {
      // Every LIMITS.instantsPerShort instant actions make a short (State advanceTime; the narration of /rest, /wait, /skip and the like never counts): the one that tips it takes a few minutes.
      const counts = !State.NOT_ACTIONS.includes(ctx.cause || 'turn');
      if (!counts || (t.instants | 0) + 1 < State.LIMITS.instantsPerShort) return 'a moment, no time passes';
      cost = 'short';
      lead = 'a moment, but the talk has added up to a few minutes';
    }
    const i = PHASES.indexOf(t.phase);
    const next = i === PHASES.length - 1 ? { day: t.day + 1, phase: PHASES[0] } : { day: t.day, phase: PHASES[i + 1] };
    const nextText = `${next.phase}${next.day !== t.day ? ` (day ${next.day}, ${weekdayOf(next.day)})` : ''}`;
    if (cost === 'rest') return `sleep until morning; it will be morning (day ${t.day + 1}, ${weekdayOf(t.day + 1)}) when this is done`;
    if (cost === 'long') return `an hour or more; it will be ${nextText} when this is done`;
    const shorts = (t.shorts | 0) + 1;
    // Night holds until the player sleeps (State advanceTime): a short there stays late at night.
    if (shorts < SHORTS_PER_PHASE) return `${lead}; it will still be ${t.phase} (${State.phasePart({ phase: t.phase, shorts })})`;
    if (t.phase === 'night') return `${lead}; it will still be night (late)`;
    return `${lead}; it will be ${nextText} when this is done`;
  }
  /* The town's news (CONTRACTS section 5): the public items. */
  function newsItems() {
    return newsList().filter(x => isObj(x) && typeof x.text === 'string' && x.text.trim() && x.public !== false);
  }
  /* "TOWN NEWS: Day 5: ...; Day 6: ...": the last five public items, oldest first. */
  function newsLine() {
    const items = newsItems().slice(-5);
    return items.length ? `TOWN NEWS: ${items.map(x => `${Number.isInteger(x.day) ? `Day ${x.day}` : 'Lately'}: ${cleanText(x.text, 300).replace(/[.]$/, '')}`).join('; ')}` : null;
  }
  /* What is still owed on a debt paid in part (State keeps paid). */
  function paidPart(o) { return Number.isInteger(o.amount) && (o.paid | 0) > 0 && o.paid < o.amount ? `${money(o.paid)} paid, ${money(o.amount - o.paid)} still owed` : ''; }
  // Wave 47: the narrator's clause for an obligation, with its due day; UI's obligationText is the player's words for one.
  function obligationClause(o, s) {
    const n = o.npcId ? State.npc(o.npcId) : null;
    const text = cleanText(o.text, 160).replace(/[.]$/, '') || `${o.kind || 'a promise'} to ${n ? n.name : 'someone'}`;
    const part = paidPart(o);
    const amount = part ? ` (${part})` : Number.isInteger(o.amount) && !text.includes(money(o.amount)) ? ` (${money(o.amount)})` : '';
    const d = o.dueDay;
    const due = o.status === 'missed' ? `, missed: it was due day ${d} and is still owed (paying it now still counts, late)`
      : Number.isInteger(d) ? `, due day ${d} (${weekdayOf(d)}${d === s.time.day ? ', today' : d === s.time.day + 1 ? ', tomorrow' : d < s.time.day ? ', overdue' : `, in ${d - s.time.day} days`})` : '';
    return `${text}${amount}${due}`;
  }
  /* One clause of a thread's summary: its first sentence, at most 25 words. */
  function firstClause(text) {
    const one = sentenceOne(cleanText(text, 600));
    const words = one.split(/\s+/).filter(Boolean);
    return words.length > 25 ? `${words.slice(0, 25).join(' ')}...` : one.replace(/[.]$/, '');
  }
  /* OPEN: the threads the player knows that are still open, one clause
     each (a loose end's thread is under LOOSE ENDS), and the open
     obligations with their due day. */
  function openLine(s) {
    const loose = new Set((s.player.looseEnds || []).map(le => le.threadId).filter(Boolean));
    const items = (s.threads || []).filter(t => t.status === 'open' && t.knownToPlayer && !loose.has(t.id)).map(t => `${t.title}: ${firstClause(t.summary)}`);
    for (const o of State.obligations('owed')) items.push(obligationClause(o, s));
    return items.length ? `OPEN: ${items.join('; ')}` : null;
  }
  /* APPOINTMENTS (wave 22): the meetings agreed in the story still to come
     (State.appointments), so the story keeps them before the player gets
     there: "Jodie Strayhorn at the Low Water (back door, half past ten)
     this morning, as agreed". Its person is at the place then (visits). */
  function appointmentsLine() {
    const list = State.appointments();
    return list.length ? `APPOINTMENTS: ${list.map(a => `${a.name} at ${a.place}${a.detail ? ` (${a.detail})` : ''} ${a.when}, as agreed`).join('; ')}` : null;
  }
  /* LOOSE ENDS: who the player's past ties them to, written from that
     person's side, with the player's own words. Those of a debt, an enemy
     or a secret knew of the player before (knowledgeLine); a lost one's or a
     promise's lead has never met them. A loose end whose thread is settled
     drops out. */
  const KNEW_BEFORE = ['debt', 'enemy', 'secret'];
  const LOOSE_SIDE = {
    debt: (npc, p) => `${npc} is owed money by ${p} from before ${p} came here, and wants it`,
    enemy: (npc, p) => `${npc} has a score to settle with ${p} from before ${p} came here`,
    secret: (npc, p) => `${npc} knows what ${p} is hiding and has not let on yet`,
    lost: (npc, p) => `${npc} has a lead on what ${p} came looking for, though they have never met`,
    promise: (npc, p) => `${npc} is part of the promise ${p} came here to keep, though they have never met`
  };
  function openLooseEnds(s) {
    return (s.player.looseEnds || []).filter(le => {
      const n = State.npc(le.npcId);
      const t = le.threadId ? State.thread(le.threadId) : null;
      return !!n && (!t || t.status === 'open');
    });
  }
  /* Where a loose end's obligation stands, for LOOSE ENDS: paid, missed
     and still owed, or paid in part. */
  const LOOSE_OBLIGATION = { debt: 'debt', secret: 'blackmail', promise: 'promise', lost: 'errand' };
  function looseState(le) {
    const o = State.obligations().filter(x => x.npcId === le.npcId && x.kind === LOOSE_OBLIGATION[le.kind]).pop();
    if (!o) return '';
    if (o.status === 'met') return `; settled on day ${o.settledDay}${o.late ? ', late' : ''}`;
    if (o.status === 'missed') return `; it went past due on day ${o.dueDay}${State.obligations('owed').includes(o) ? ' and is still owed' : ''}`;
    if ((o.paid | 0) > 0 && Number.isInteger(o.amount)) return `; ${money(o.paid)} of ${money(o.amount)} paid so far`;
    return '';
  }
  function looseEndsLine(s, presentIds) {
    const p = s.player;
    const parts = openLooseEnds(s).map(le => {
      const n = State.npc(le.npcId);
      const side = (LOOSE_SIDE[le.kind] || ((npc, pl) => `${npc} is tied to ${pl}'s past`))(n.name, p.name);
      const where = presentIds.includes(n.id) ? 'here now' : presenceOf(n) === 'dead' ? 'dead' : 'not here';
      return `${side} (${where}${looseState(le)}; ${p.name}'s own words: "${cleanText(le.text, 200)}")`;
    });
    return parts.length ? `LOOSE ENDS: ${parts.join(' | ')}` : null;
  }
  /* A loose end's memory, one line for the narrator: "tied to Tomas by a
     debt (see LOOSE ENDS)". */
  function memoryText(text) {
    const m = /^Loose end with (.+?) \((.+?)\): /i.exec(String(text || ''));
    return m ? `tied to ${m[1]} by ${m[2]} (see LOOSE ENDS)` : text;
  }
  /* SPEC section 13: only memories of weight 2 or more or from the last 20
     turns (the newest three of those), and a loose end's. brief (people at a
     destination, not yet in the scene) leaves memories, traits and wants out
     altogether. */
  /* Pronouns come right after the name ("Mavis Toler (she/her; ...)"), so
     the narration and the People card always agree. The look stays until
     they have met face to face (metTurn); traits and wants steer the
     person; the secret only with opts.secret (ctx.revealSecretFor: a social
     roll that landed on them, or attitude 50 and up). */
  /* Wave 30 (the integration plan's 10.1): where they stand is "to you:
     <stance>[, <tag>] — <reasons> — plays it: <cue>" (toYou, at most 50
     tokens), then "open to a flirt" for an eligible adult a flirt would be
     welcome with now (never a minor, never with a player under 18), then
     "holds you to: ..." (what they hold the player to: a claim noted, the
     loose end, a story point); in place of "attitude N (word); remembers:
     ...". Never a number. brief: "to you: <stance>" only. */
  function npcLine(n, turn, brief, opts) {
    const o = opts || {};
    const age = ageText(n.age);
    const parts = [(age ? `${age}, ` : '') + pronounLabel(n.pronouns), n.role];
    const rel = State.relationNote(n);
    if (rel) parts.push(rel);
    // Their people, by name ("wife: Mavis Mangum"), so nobody gets a family the cast does not give them.
    const has = hasWords(n);
    if (has) parts.push(has);
    // Hurt (integration, wave 5): the narrator hears it as the People card ("Hurt until Day N") and the absent note say it.
    if (State.isHurt(n)) parts.push(`hurt: laid up until Day ${n.hurtUntilDay}`);
    if (n.look && !Number.isInteger(n.metTurn)) parts.push('look: ' + lowerFirst(n.look).replace(/\.$/, ''));
    if (heardOf(n)) parts.push('not met yet: the player has heard of them by this name from others, but has never met them');
    else if (!n.knownToPlayer) parts.push('not yet introduced: the player does not know this name; go by the look until they give it');
    if (n.voice) parts.push('voice (a habit, not every line): ' + lowerFirst(n.voice).replace(/\.$/, ''));
    if (!brief) {
      const traits = (Array.isArray(n.personality) ? n.personality : []).filter(x => typeof x === 'string' && x.trim()).slice(0, 3);
      if (traits.length) parts.push('traits: ' + traits.join(', '));
      if (typeof n.goal === 'string' && n.goal.trim()) parts.push('wants (never say this outright; it steers what they push for and dodge): ' + lowerFirst(n.goal.trim()).replace(/\.$/, ''));
    }
    if (brief) parts.push(`to you: ${Rel.stance(n).phrase}`);
    else {
      parts.push(toYou(n));
      // Wave 34: every adult can be won over, but only one a flirt would come easily to (easy or normal now, Rel.flirtDifficulty) carries it.
      const wel = Rel.welcomeOf(n);
      if (wel.ok && (wel.difficulty === 'easy' || wel.difficulty === 'normal')) parts.push('open to a flirt');
      const holds = holdsYouTo(n, turn);
      if (holds.length) parts.push(`holds you to: ${holds.join(' / ')}`);
    }
    if (!brief && o.secret && typeof n.secret === 'string' && n.secret.trim()) parts.push('secret (it can come out now, if the talk goes there): ' + lowerFirst(n.secret.trim()).replace(/\.$/, ''));
    return `${n.name} (${parts.join('; ')})`;
  }
  /* One fresh rumour a present NPC might share when the player talks to them
     (SPEC section 8, news spreads). How well an NPC would know a rumour:
       5  news (a rumour the world added during play, such as a clock that
          completed off-screen) that they are the source of
       4  news from someone in their faction or about their faction's doings
          (a clock's rumour carries its factionId), or any news if they are
          a gossip, informant, bartender or innkeeper (by tag or role)
       3  an older rumour of their own (sourceNpcId)
       2  an older rumour they are one of the tellers of (tellerIds)
       1  an older rumour from someone in their faction; and after day 2 any
          older rumour, if they are tagged gossip or share a home or a
          household with its source (news gets around)
     The best pair wins; ties go to the NPC the player is talking to first,
     then to the newest news, then to the town's own order. Hostile NPCs
     (attitude -25 or below) share nothing. */
  const GOSSIP_TAGS = ['informant', 'bartender', 'innkeeper', 'gossip'];
  const GOSSIP_ROLE = /\b(informant|bartender|barkeep|barman|barmaid|innkeeper|publican)\b/i;
  function gossip(n) { return (n.tags || []).some(t => GOSSIP_TAGS.includes(t)) || GOSSIP_ROLE.test(n.role || ''); }
  // Wave 47: the rumour pool's household (a shared home or a household relation), wider on purpose than Rel.household.
  function rumourHousehold(a, b) {
    if (!a || !b || a.id === b.id) return false;
    if (isObj(a.home) && isObj(b.home) && a.home.locationId && a.home.locationId === b.home.locationId) return true;
    const tie = (x, y) => (Array.isArray(x.relations) ? x.relations : []).some(r => r && r.npcId === y.id && HOUSEHOLD_RELATIONS.includes(r.relation));
    return tie(a, b) || tie(b, a);
  }
  function wouldKnow(n, r) {
    const src = r.sourceNpcId ? State.npc(r.sourceNpcId) : null;
    const own = r.sourceNpcId === n.id;
    const mate = !own && !!n.factionId && ((src && src.factionId === n.factionId) || r.factionId === n.factionId);
    if (Number.isInteger(r.addedTurn)) return own ? 5 : (mate || gossip(n)) ? 4 : 0;
    if (own) return 3;
    if (Array.isArray(r.tellerIds) && r.tellerIds.includes(n.id)) return 2;
    if (mate) return 1;
    const day = State.current ? State.current.time.day : 1;
    if (day > 2 && ((n.tags || []).includes('gossip') || rumourHousehold(n, src))) return 1;
    return 0;
  }
  function pickRumour(ctx) {
    const s = State.current;
    const a = ctx.action;
    if (!a || !Dice.SOCIAL_ACTIONS.includes(a.actionType)) return null;
    const present = State.npcsAt(s.player.locationId);
    const aimed = present.filter(n => a.targets.includes(n.id));
    // Wave 28 (Rel.GATES.rumour): and trust above -25, unless they are a gossip (they tell anyone).
    const pool = (aimed.length ? aimed : (a.actionType === 'talk' ? present : [])).filter(n => n.attitude > Rel.GATES.rumour.liking && (Rel.tracksOf(n).t > Rel.GATES.rumour.trust || (n.tags || []).includes('gossip')));
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
  /* Fills the scene part of the turn context (shared by the narrator packet,
     the bookkeeper packet and the mock provider). */
  /* The phase a walk that takes this time cost lands in: a long passes one;
     a short the last of its phase rolls into the next (not at night, which
     holds until the player sleeps); an instant stays, unless it is the one
     that makes up a short. */
  function arrivalPhase(cost, counts) {
    const t = State.current.time;
    const next = PHASES[(PHASES.indexOf(t.phase) + 1) % PHASES.length];
    // The instant that makes up a short (wave 5, the fourth review's bug 3): it lands where that short does. counts false: the narration of time passed (/rest, /wait ...) counts no instant.
    if (counts !== false && !['short', 'long', 'rest'].includes(cost) && (t.instants | 0) + 1 >= State.LIMITS.instantsPerShort) cost = 'short';
    if (cost === 'long') return next;
    if (cost === 'short' && t.phase !== 'night' && (t.shorts | 0) + 1 >= SHORTS_PER_PHASE) return next;
    return t.phase;
  }
  /* Who is in the scene: everyone here now, and anyone the turn keeps in it
     for this narration (ctx.stillHere: someone knocked down this turn, laid
     up at home from now on, is still on the floor in this scene). */
  function presentNow(ctx) {
    const l = here();
    const present = State.npcsAt(l.id);
    for (const id of (ctx && ctx.stillHere) || []) { const n = State.npc(id); if (n && !present.includes(n)) present.push(n); }
    return present;
  }
  function scene(ctx) {
    const s = State.current;
    const l = here();
    const present = presentNow(ctx);
    ctx.location = { id: l.id, name: l.name, type: l.type, closed: !!l.closed || !!State.isClosed(l) };
    ctx.locationName = l.name;
    ctx.present = present.map(n => ({ id: n.id, name: n.name, role: n.role, attitude: n.attitude }));
    ctx.presentIds = present.map(n => n.id);
    ctx.time = nowTime();
    const a = ctx.action;
    const d = a && a.actionType === 'move' && a.destinationId ? State.loc(a.destinationId) : null;
    // Who is there when the player gets there: the phase the walk lands in (REVIEW E8, playtest B8).
    // A narration of time already passed (/rest, /wait ...) counts no instant (State's NOT_ACTIONS).
    const counts = !State.NOT_ACTIONS.includes(ctx.cause || 'turn');
    const landPhase = arrivalPhase(a && a.timeCost, counts);
    // The day it lands on: the morning after, for a long walk at night.
    const landDay = s.time.phase === 'night' && landPhase === PHASES[0] ? s.time.day + 1 : s.time.day;
    ctx.destination = d ? { id: d.id, name: d.name, closed: isShut(d), why: shutReason(d) || null, phase: landPhase, day: landDay, present: State.npcsAt(d.id, landPhase, landDay).map(n => n.name) } : null;
    // Where the turn's time lands, walk or not (wave 4: someone a due event brings stays through it).
    ctx.landing = { phase: landPhase, day: landDay };
    ctx.turn = s.meta.turn;
    return ctx;
  }
  /* What people can know about the player: they came to town on day 1 and
     were a stranger before, and only the people of a debt, an enemy or a
     secret (LOOSE ENDS) knew of them. The rule itself (each person knows
     only their own memories and what happened in front of them) is in the
     cached style block (Style.KNOWLEDGE). The narrator invents the rest
     otherwise ("I've known a while", "he called me last night" on day 1). */
  function knowledgeLine(s) {
    const p = s.player;
    const days = s.time.day - 1;
    const since = days === 0 ? 'today (day 1)' : days === 1 ? 'yesterday (this is day 2)' : `${days} days ago (this is day ${s.time.day})`;
    const knew = openLooseEnds(s).filter(le => KNEW_BEFORE.includes(le.kind)).map(le => State.npc(le.npcId).name).filter((x, i, all) => all.indexOf(x) === i);
    const who = knew.length ? ` Only ${andList(knew)} knew of ${p.name} before, as LOOSE ENDS says.` : ` Nobody here knew ${p.name} before.`;
    return `WHAT PEOPLE KNOW: ${p.name} came to ${s.meta.townName || 'town'} ${since} and was a stranger here before that.${who}`;
  }
  /* STORY SO FAR: the chronicle, newest kept whole first, up to 400 words,
     each entry with its day stamp ("Days 2-3: ..."; an entry written without
     one says its turns). */
  const STORY_WORDS = 400;
  function storySoFar(s) {
    const parts = [];
    let total = 0;
    for (let i = s.chronicle.length - 1; i >= 0; i--) {
      const c = s.chronicle[i];
      const sum = String(c.summary || '').replace(/\s*\n+\s*/g, ' ').trim();
      const text = /^days?\s+\d/i.test(sum) ? sum : `Turns ${c.fromTurn}-${c.toTurn}: ${sum}`;
      const w = wordCount(text);
      if (total + w > STORY_WORDS) {
        if (!parts.length) parts.unshift(text.split(/\s+/).slice(-STORY_WORDS).join(' '));
        break;
      }
      parts.unshift(text);
      total += w;
    }
    return parts.join(' ');
  }
  /* EARLIER: the journal's last ten lines from before LAST 3 TURNS, each
     with its day and phase (the entry's own, else its turn's log entry). */
  function earlierLine(s) {
    const shown = new Set(s.log.slice(-3).map(e => e.turn));
    const lines = (Array.isArray(s.journal) ? s.journal : []).filter(j => isObj(j) && typeof j.text === 'string' && j.text.trim() && !shown.has(j.turn)).slice(-10);
    if (!lines.length) return null;
    const when = j => {
      const e = s.log.find(x => x.turn === j.turn) || {};
      const day = Number.isInteger(j.day) ? j.day : e.day;
      const phase = typeof j.phase === 'string' ? j.phase : e.phase;
      return Number.isInteger(day) ? `Day ${day}${phase ? ` ${phase}` : ''}` : `Turn ${j.turn}`;
    };
    return `EARLIER: ${lines.map(j => `${when(j)}: ${cleanText(j.text, 200)}`).join(' | ')}`;
  }
  /* Labelled plain text per SPEC.md section 10, oldest to newest: the story
     so far (chronicle, journal, last turns), the scene, the people, this
     turn, then the rules. A person's secret only through ctx.revealSecretFor;
     seeds and rumour truth never. The place's full description only on an
     arrival, a move or a look; otherwise its name. */
  function narratorPacket(ctx) {
    const s = State.current;
    const p = s.player;
    const l = here();
    const turn = s.meta.turn;
    const a = ctx.action || {};
    const roll = ctx.roll;
    const reveal = Array.isArray(ctx.revealSecretFor) ? ctx.revealSecretFor : [];
    const presentNpcs = presentNow(ctx);
    const presentIds = presentNpcs.map(n => n.id);
    const present = presentNpcs.map(n => npcLine(n, turn, false, { secret: reveal.includes(n.id) }));
    const conds = p.conditions.map(c => c.name.toLowerCase()).join(', ') || 'none';
    // One line each (an arrival's two paragraphs too), so every packet label starts a line.
    const flat = t => String(t || '').replace(/\s*\n+\s*/g, ' ');
    const last3 = s.log.slice(-3).map(e => `${e.input ? '> ' + (isSay(e) ? `(says to ${sayTo(e)}) "${flat(e.input)}"` : flat(e.input)) + ' ' : ''}${flat(e.narration)}`).join(' | ');
    const long = roomy(ctx);
    const full = ctx.mode === 'arrival' || ctx.mode === 'epilogue' || !!ctx.moved || a.actionType === 'look' || a.actionType === 'move';
    const lines = [];
    // The story so far, oldest first.
    lines.push(`STORY SO FAR: ${storySoFar(s) || 'nothing yet'}`);
    const earlier = earlierLine(s);
    if (earlier) lines.push(earlier);
    lines.push(`LAST 3 TURNS: ${last3 || 'none'}`);
    // The scene: when and where (what you notice inside, with the full description; when it is open, always).
    lines.push(`${clockText(s.time)} · Location: ${l.name}${full ? ` — ${l.description}` : ''}${l.closed || State.isClosed(l) ? ' (closed)' : ''}`);
    const place = [full ? l.details : null, l.hours ? `Open: ${l.hours}.` : null].filter(Boolean);
    if (place.length) lines.push(`PLACE: ${place.join(' ')}`);
    if (s.flags.weather) lines.push(`WEATHER: ${s.flags.weather}`);
    const items = (l.items || []).map(i => i.name + (i.qty > 1 ? ` x${i.qty}` : ''));
    if (items.length) lines.push(`ITEMS HERE: ${items.join(', ')}.`);
    const ps = s.pendingScene;
    if (ps && ps.locationId === l.id && ((ps.arrived || []).length || (ps.left || []).length)) {
      ctx.sceneChange = ps;
      const who = ids => ids.map(id => { const n = State.npc(id); if (!n) return id; const home = n.home && n.home.locationId === l.id ? ' (this is their home)' : ''; return n.name + home; }).join(', ');
      // Wave 15: whoever sat at a hand of cards this turn (the dealer, the seats) was at the table for it, and is not told as arriving after it.
      const seated = seatedAt(ctx.gamble);
      const arrived = (ps.arrived || []).filter(id => !seated.includes(id));
      const parts = [];
      if (arrived.length) parts.push(`arrived here: ${who(arrived)}`);
      if (ps.left.length) parts.push(`left: ${who(ps.left)}`);
      if (parts.length) lines.push(`SINCE THE LAST TURN (time moved on to ${s.time.phase}${s.time.late ? ', late' : ''}): ${parts.join('; ')}. The player has not acted in between. Show the arrival or departure as it happens or has just happened (a truck pulling in, a door, a goodbye), and let them react to finding the player here.`);
    }
    // The people: the player, what they carry, who is here, what they know, and what is still open.
    const goal = cleanText(p.goal, 160).replace(/[.!]+$/, '');
    const flaw = cleanText(p.flaw, 160).replace(/[.!]+$/, '');
    lines.push(
      `PLAYER: ${p.name} (${ageText(p.age) ? `${p.age}, ` : ''}${p.background.toLowerCase()}). Reputation: ${State.reputationTier()}. Conditions: ${conds}.${p.hp < p.maxHp ? ` HP ${p.hp}/${p.maxHp}.` : ''}${goal ? ` Came here to: ${lowerFirst(goal)}.` : ''}${flaw ? ` Flaw: ${lowerFirst(flaw)}.` : ''}`,
      carryingLine(p),
      `PRESENT: ${present.join('; ') || 'nobody'}.`,
      knowledgeLine(s)
    );
    /* Wave 32 (the integration plan's 10.1): how two people here are with
       each other now, when the player saw it change and the town knows the
       tie (Rel.betweenThem; never a hidden one), one line, two pairs at most. */
    const between = Rel.betweenThem(presentIds);
    if (between.length) lines.push(`BETWEEN THEM: ${between.join('; ')}.`);
    /* Wave 28 (the integration plan's 19.3): every turn someone under 18 is in
       the scene, their line, whatever the parse said (the parser is out of
       the safety path for narration); a player under 18, or with no age on
       record, theirs every turn. */
    for (const n of presentNpcs) if (Rel.isMinor(n)) lines.push(`UNDER 18: ${Rel.minorLine(n)}`);
    const young = Rel.playerMinorLine();
    if (young) lines.push(`UNDER 18: ${young}`);
    for (const line of [looseEndsLine(s, presentIds), openLine(s), appointmentsLine(), newsLine()]) if (line) lines.push(line);
    // This turn.
    const np = (ctx.notPresent || []).map(x => {
      if (x.reason === 'not_here') return `${x.label} (not here right now)`;
      if (x.reason === 'gone') return `${x.label} (${x.why || 'gone from town'})`;
      if (x.reason === 'unproven') return `${x.label} (the player claims this, but it is not true in this world; nobody like that is here)`;
      if (x.reason === 'not_found') return `${x.label} (looked for and not found: the search turns up nothing like it, and the player does not get it)`;
      if (x.reason === 'nothing_here') return `${x.label} (nothing like that is here to take: only what ITEMS HERE lists can be picked up, and the player does not get it)`;
      return `${x.label} (does not exist in this town; it is simply not there)`;
    });
    if (np.length) lines.push(`NOT PRESENT: ${np.join('; ')}.`);
    const made = (ctx.created || []).filter(c => !c.carried).map(c => (c.kind === 'npc' ? `${c.name} (${c.role}, new to the scene)` : `${c.name} (${c.kind === 'location' ? 'a place just off this one' : 'here'})`));
    if (made.length) lines.push(`NEW IN THE SCENE: ${made.join('; ')}.`);
    if (ctx.destination) {
      const d = State.loc(ctx.destination.id);
      const there = State.npcsAt(d.id, ctx.destination.phase || s.time.phase, ctx.destination.day).map(n => npcLine(n, turn, true));
      const shut = shutReason(d);
      lines.push(`DESTINATION: ${d.name} — ${d.description}${shut ? ` (${shut}: the player cannot go in)` : ''} Present there: ${there.join('; ') || 'nobody'}.`);
    }
    if (ctx.moved) lines.push(`MOVED: from ${ctx.moved.fromName} to ${ctx.moved.toName}, just now. The action happens here; give the walk one clause at most.`);
    if (ctx.walkAfter) lines.push(`THEN: once this is done the player walks on to ${ctx.walkAfter.toName}${ctx.walkAfter.shut ? ` and finds it shut (${ctx.walkAfter.shut})` : ''}. The action happens here; end as they set off, one clause at most.`);
    // Talked about, not in the scene: never brought in for being named.
    const about = (Array.isArray(a.aboutIds) ? a.aboutIds : []).map(id => State.entityById(id)).filter(Boolean).filter(e => !presentIds.includes(e.id));
    if (about.length) lines.push(`ASKED ABOUT: ${about.map(e => e.name).join('; ')} (talked about, not in the scene)`);
    lines.push(`TIME THIS TAKES: ${timeTakes(ctx)}`);
    if (ctx.speech && ctx.speech.mode === 'do' && !ctx.beat && ctx.input) lines.push(`PLAYER TYPED: "${String(ctx.input).replace(/^\/zoom\s+/i, '')}"`);
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
    if (ctx.pressed) lines.push(`SAME ASK AGAIN: the player already tried this and it failed${ctx.pressed.line ? ` (${ctx.pressed.line})` : ''}; there is no new roll and the answer does not change. Show them holding their position and reacting to being pushed (shorter, cooler or amused). Nothing new is granted.`);
    lines.push(`COMPLICATION: ${[roll && roll.complication, ctx.consequence].filter(Boolean).join('; ') || 'none'}`);
    // Wave 29: a backed ask's outcome is its LEVERAGE line (the engine decided their answer), never these.
    if (roll && !ctx.backed && !roll.success && Dice.SOCIAL_ACTIONS.includes(a.actionType)) lines.push('OUTCOME: the ask failed. The person does not give the player what they asked for, in any form; the complication is on top of the refusal, not instead of it.');
    if (roll && !ctx.backed && roll.success && Dice.SOCIAL_ACTIONS.includes(a.actionType)) lines.push(`OUTCOME: the ask succeeded. ${roll.tier === 'critical' ? 'It works, and then some.' : roll.tier === 'partial' ? 'It works, but at the cost named in COMPLICATION.' : 'It works.'} The person goes along with what the player asked, at least in part, whatever they said before; do not narrate a refusal or a watered-down substitute. If it seems out of character, the difficulty already allowed for that: the dice decided.`);
    if (ctx.damage) lines.push(`DAMAGE: the player takes ${ctx.damage} damage.`);
    if (ctx.defeated) lines.push('DEFEAT: the player is beaten senseless. Narrate them going down and stop there; the engine decides what happens after.');
    // SPEC step 11: work due events in naturally. A town event at the player's place is the scene itself (scene); one from an
    // earlier day says so, so a "due in three days" it carries is read against OPEN's dates, which are as of now.
    const dueText = d => `${d.text}${Number.isInteger(d.firedDay) && d.firedDay < s.time.day && ctx.mode !== 'epilogue' ? ` (this came up on day ${d.firedDay}; any days it counts are from then, and OPEN has them as of today)` : ''}`;
    const isScene = d => d.scene === true && ctx.mode !== 'epilogue';
    const dueScene = (ctx.due || []).filter(isScene).map(d => `${dueText(d)} (the scene: it happens here, now, in front of the player; make it the heart of this narration)`);
    const dueRest = (ctx.due || []).filter(d => !isScene(d)).map(dueText);
    const due = dueScene.concat(dueRest.length ? [`${dueRest.join(' / ')} (already true; work it into the scene naturally, not as an announcement)`] : []);
    lines.push(`DUE EVENT: ${due.length ? due.join(' / ') : 'none'}`);
    if (ctx.rumour) lines.push(`RUMOUR: ${ctx.rumour.npcName} might mention this, if it fits: "${ctx.rumour.text}"`);
    if (ctx.timePassed) lines.push(`TIME PASSED: ${ctx.timePassed}${shutHereLine(ctx)}`);
    // The rules, last: the mode, then the length the style check enforces.
    lines.push(ctx.mode === 'epilogue'
      ? 'MODE: epilogue (ZOOM length). This is an ending: close the threads named in DUE EVENT; the player may keep playing afterwards.'
      : `MODE: ${ctx.mode === 'zoom' ? 'ZOOM' : ctx.mode === 'arrival' ? 'arrival (ZOOM length allowed)' : 'normal'}`);
    lines.push(Style.lengthLine(long));
    const text = lines.join('\n');
    // The style check that follows may use any name this packet gives (what the player typed, a due event, the news).
    Style.notePacket(text);
    return text;
  }
  /* Lines the turn adds to the narrator's packet (the card game's OUTCOME):
     after the COMPLICATION line. An epilogue turn says MODE: epilogue, with
     the zoom length. Replacements are functions, so a "$20" stays as it is. */
  function withTurnLines(text, ctx) {
    let out = String(text || '');
    if (ctx.mode === 'epilogue') {
      const mode = 'MODE: epilogue (ZOOM length allowed). The DUE EVENT is how this part of the story ends in town: tell it as the scene, through what the player sees and hears, then stop.';
      out = /^MODE: .*$/m.test(out) ? out.replace(/^MODE: .*$/m, () => mode) : `${out}\n${mode}`;
      out = out.replace(/^LENGTH: .*$/m, () => Style.lengthLine(true).split('\n')[0]);
    }
    const lines = (Array.isArray(ctx.narratorLines) ? ctx.narratorLines : []).filter(Boolean);
    if (!lines.length) return out;
    const add = lines.join('\n');
    if (/^COMPLICATION: .*$/m.test(out)) return out.replace(/^COMPLICATION: .*$/m, m => `${m}\n${add}`);
    if (/^MODE: /m.test(out)) return out.replace(/^MODE: /m, m => `${add}\n${m}`);
    return `${out}\n${add}`;
  }
  /* A reply cut off (stop_reason max_tokens) is never a narration. The real
     provider already asked once more with twice the limit. */
  function cutOff(res) {
    if (res && res.stopReason === 'max_tokens') throw new Api.ApiError('max_tokens', Api.FRIENDLY.max_tokens, { retryable: false });
  }
  /* A style problem the prompts mark hard: false is only noted (debug); any
     other (hard: true, or a check that does not mark them) is rewritten. */
  function isHard(p) { return !!p && p.hard !== false; }
  /* Steps 6 and 7: stream the narration into the feed, check it, and when
     the check finds a hard problem rewrite it once as an edit (the packet,
     the draft, the note). The draft stays on screen, dimmed
     (UI.feed.rewriting), while the rewrite streams into a buffer; the
     rewrite replaces it when it comes, and if it fails or is refused the
     draft stands. Soft problems go to the debug view only. */
  /* The longer length (ZOOM's): a zoom, an arrival, an ending, or a narration of time passing with more due events than a turn holds (World.MAX_DUE). */
  function roomy(ctx) { return ctx.mode === 'zoom' || ctx.mode === 'arrival' || ctx.mode === 'epilogue' || (ctx.due || []).length > World.MAX_DUE; }
  /* The due events the narration told (wave 8, the final pass): all of
     them, but for those the offline demo had no room for (ctx.dueUntold,
     set by the mock), which stay due for the next narration. */
  function toldDue(ctx) {
    const later = Array.isArray(ctx.dueUntold) ? ctx.dueUntold : [];
    return later.length ? ctx.due.filter(d => !(d && later.includes(d.seedId))) : ctx.due;
  }
  async function narrate(ctx) {
    const zoom = roomy(ctx);
    const style = Style.current();
    const text = withTurnLines(narratorPacket(ctx), ctx);
    ctx.packet = text;
    const mock = Api.providerName() === 'mock';
    const node = UI.feed.beginNarration({ mock });
    const blocks = { system: Style.systemPrompt(style), town: townBlock(), cast: castBlock() };
    try {
      UI.feed.stream(node, '');
      const res = await Api.narrate(Object.assign({ text, context: ctx }, blocks), (chunk, soFar) => UI.feed.stream(node, soFar));
      if (isRefusal(res)) { node.remove(); return { refusal: res }; }
      cutOff(res);
      let narration = String((res && res.text) || '').trim();
      if (!narration) throw new Api.ApiError('bad_response', 'The narrator sent back nothing. Try again.');
      const previous = mock ? [] : State.current.log.slice(-3).map(e => e.narration).filter(Boolean);
      let check = Style.check(narration, { zoom, style, previous, day: State.current.time.day, gold: State.current.player.gold, input: ctx.input });
      ctx.style = [check];
      const problems = Array.isArray(check.problems) ? check.problems : [];
      const hard = problems.filter(isHard);
      const soft = problems.filter(p => !isHard(p));
      // One debug entry per attempt: soft problems alone are only noted (the draft is kept).
      if (soft.length && !hard.length) State.pushDebug({ turn: State.current.meta.turn, kind: 'style', attempt: 1, problems: soft, soft: true, kept: true });
      if (hard.length) {
        State.pushDebug({ turn: State.current.meta.turn, kind: 'style', attempt: 1, problems });
        // The hard problems lead the note; the soft ones ride along ("If you can, also fix").
        const note = Style.regenerationNote(problems);
        ctx.regenerated = note;
        status('rewrite');
        UI.feed.rewriting(node, true);
        let second = null;
        try {
          const res2 = await Api.narrate(Object.assign({ text: `${text}\n${note}`, base: text, draft: narration, note, context: ctx }, blocks), null);
          if (isRefusal(res2)) State.pushDebug({ turn: State.current.meta.turn, kind: 'style', attempt: 2, reason: 'the rewrite was refused; the first draft stands' });
          else { cutOff(res2); second = String((res2 && res2.text) || '').trim() || null; }
        } catch (err) {
          if (err && err.type === 'aborted') throw err;
          State.pushDebug({ turn: State.current.meta.turn, kind: 'style', attempt: 2, reason: `the rewrite failed (${(err && (err.type || err.message)) || err}); the first draft stands` });
        }
        UI.feed.rewriting(node, false);
        if (second) {
          narration = second;
          check = Style.check(narration, { zoom, style, previous, day: State.current.time.day, gold: State.current.player.gold, input: ctx.input });
          ctx.style.push(check);
          if (!check.ok) State.pushDebug({ turn: State.current.meta.turn, kind: 'style', attempt: 2, problems: check.problems, kept: true });
        } else ctx.rewriteFailed = true;
      }
      UI.feed.endNarration(node, narration);
      return { narration, node, mock };
    } catch (err) {
      node.remove(); // never leave an empty "pending" placeholder behind
      throw err;
    }
  }

  // ----- step 8: the bookkeeper's packet -----
  /* What the bookkeeper needs to judge the turn (REVIEW section 2.6): each
     present person's last three memories (so nothing is recorded twice and
     a paid debt can be settled), each faction's running clock with its aim
     and progress (so a clock nudge is aimed), the threads with their
     summaries, the open obligations by id, and the town's news. */
  /* Wave 53: the mark a minor's row carries in the parser's packet ("UNDER 18 (16)": its ROMANTIC rule already says such a
     line is never null) and in the bookkeeper's, with the bookkeeper's rule after it. The age when the record has one. */
  function minorMark(n, parser) {
    const age = [n, State.npc(n.id)].map(x => (x ? x.age : null)).find(a => Number.isInteger(a));
    return `UNDER 18${age !== undefined ? ` (${age})` : ''}${parser ? '' : ': no event about a romantic or flirting line at them'}`;
  }
  function bookkeeperPacket(ctx) {
    const s = State.current;
    const p = s.player;
    const l = here();
    const a = ctx.action || {};
    const presentIds = ctx.presentIds || [];
    /* Wave 28 (the integration plan's 5.6): where each stands with the player
       in words (the stance and its first tag), and for the people here at
       most three handles on what they still hold, each with its event and
       day, so an apology or a kept word can name what it answers. */
    const stanceOf = n => { const st = Rel.stance(n); return `${st.phrase}${st.tags.length ? `, ${st.tags[0]}` : ''}`; };
    const npcRow = (n, mark) => `${n.id} — ${n.name} (${pronounLabel(n.pronouns)}; ${n.role}; stance: ${stanceOf(n)}${mark ? '; ' + mark : ''})${n.unnamed ? ' (no name yet)' : ''}`;
    // Wave 53: a minor present is marked, so EVENT_RULES' "anyone marked UNDER 18" has a mark to read.
    const presentRow = n => {
      const held = Rel.handles(n, 3);
      return `${npcRow(n, Rel.isMinor(n) ? minorMark(n) : '')}${held.length ? ` remembers: ${held.join(' / ')}` : ''}`;
    };
    const engine = [];
    // Wave 28: the engine's own events this turn, so the bookkeeper never sends them again.
    const engineEvents = State.turnEvents().filter(x => x.event !== 'spent_time');
    if (engineEvents.length) engine.push(`engine events: ${engineEvents.map(x => `${x.npcId} ${x.event}`).join('; ')}`);
    if (ctx.damage) engine.push(`fight damage: the player lost ${ctx.damage} HP`);
    if (ctx.consequence) engine.push(ctx.consequence);
    if (ctx.complicationDone) engine.push(`the complication's effects: ${ctx.complicationDone.join('; ')}`);
    if (ctx.storyPoint) engine.push('a story point for the natural 20');
    for (const c of ctx.created || []) engine.push(`created ${c.id} (${c.kind}: ${c.name})`);
    if (ctx.moved) engine.push(`the walk from ${ctx.moved.fromId} to ${ctx.moved.toId} (the player is at ${ctx.moved.toId} now)`);
    if (ctx.walkAfter && !ctx.walkAfter.shut) engine.push(`the walk on to ${ctx.walkAfter.toId} once this is done (the engine moves the player there; record no playerLocationId)`);
    engine.push('time passing (never record time)');
    // The week ahead by day number (wave 26), so a deadline said as a weekday ("before Tuesday's vote") becomes a day trigger.
    const week = [];
    for (let d = s.time.day; d < s.time.day + 8; d++) { const w = weekdayOf(d); if (w) week.push(`Day ${d} ${w}`); }
    const lines = [
      `TURN ${s.meta.turn} · ${State.clockLine(s.time)}. A new seed's day trigger is day ${s.time.day + 1} or later; a meeting agreed for later today triggers on its place (location).${week.length ? ` DAYS: ${week.join(', ')}.` : ''}`,
      `PLAYER: ${p.name}; ${moneyLine(p.gold)} (goldDelta is in these units); hp ${p.hp}/${p.maxHp}; at ${l.id} (${l.name}); carrying ${p.inventory.map(i => `${i.id} (${i.name}${i.qty > 1 ? ' x' + i.qty : ''})`).join(', ') || 'nothing'}`,
      isSay(ctx.speech) ? `INPUT: "${ctx.input}"` : `INPUT: ${ctx.input || '(none)'}`,
      ...(isSay(ctx.speech)
        ? [`MODE: say, to ${ctx.speech.to === 'everyone' ? 'everyone present' : `${ctx.speech.to} (${ctx.speech.toName})`}. INPUT is the player's exact spoken words; they did nothing else and stayed where they are (playerLocationId null).`]
        : ctx.speech ? ['MODE: do'] : []),
      `ACTION: ${a.summary || ''} [type ${a.actionType}; targets ${(a.targets || []).join(', ') || 'none'}${(a.aboutIds || []).length ? '; about ' + a.aboutIds.join(', ') : ''}${a.destinationId ? '; destination ' + a.destinationId : ''}]`,
      `ROLL: ${ctx.roll ? `${ctx.roll.line}${ctx.roll.complication ? ' · Complication: ' + ctx.roll.complication : ''}` : 'none'}`,
      `ALREADY APPLIED BY THE ENGINE (do not record again): ${engine.join('; ')}`
    ];
    // The same fact the narrator had: record no use of the thing and nothing that needed it.
    if (ctx.missing) lines.push(`${notCarriedLine(ctx.missing)} Record no use of it, no item used or lost, and nothing that needed it.`);
    if (ctx.pressed) lines.push('SAME ASK AGAIN: this repeats an ask that already failed; grant nothing new; an event only if they took it badly (pried or insulted); no move.');
    if (ctx.beat) lines.push('BEAT: the player did and said nothing; record only what the others did.');
    const missing = (ctx.notPresent || []).filter(x => x.reason === 'does_not_exist' || x.reason === 'unproven' || x.reason === 'nothing_here').map(x => x.label);
    if (missing.length) lines.push(`DOES NOT EXIST (record nothing about it): ${missing.join(', ')}`);
    if (ctx.rumour) lines.push(`RUMOUR OFFERED: ${ctx.rumour.id} by ${ctx.rumour.npcId}: "${ctx.rumour.text}" (list it in rumoursHeard only if the narration shows it being told)`);
    lines.push(`NARRATION: ${ctx.narration || ''}`);
    lines.push('IDS YOU MAY USE:');
    lines.push(`NPCS PRESENT: ${State.npcsAt(l.id).map(presentRow).join('; ') || 'none'}`);
    lines.push(`OTHER KNOWN NPCS: ${s.npcs.filter(n => n.knownToPlayer && !presentIds.includes(n.id)).map(npcRow).join('; ') || 'none'}`);
    // Someone the narration names who is neither here nor known yet (whose home was just described, say), so placesRevealed can name the owner.
    const named = s.npcs.filter(n => !n.knownToPlayer && !presentIds.includes(n.id) && n.alive !== false && Town.nameMentions(ctx.narration || '', n));
    if (named.length) lines.push(`NAMED IN THE NARRATION (not here): ${named.map(npcRow).join('; ')}`);
    // Everyone else in the cast, so a home someone names can say whose it is (the cast is fixed: nobody new is added).
    const listed = new Set(presentIds.concat(named.map(n => n.id)));
    const rest = s.npcs.filter(n => presenceOf(n) === 'here' && !listed.has(n.id) && !n.knownToPlayer && !State.npcsAt(l.id).includes(n));
    lines.push(`EVERYONE ELSE IN TOWN (not met; the whole cast, nobody else exists): ${rest.map(n => `${who(n)}${n.unnamed ? ' (no name yet)' : ''}`).join('; ') || 'none'}`);
    // The places the player knows. A home in the cast they have not found yet is not listed, so a line that tells them about it goes in placesRevealed (the engine finds it).
    lines.push(`LOCATIONS (the places list): ${s.locations.filter(x => x.discovered).map(x => `${x.id} — ${x.name}${l.exits.includes(x.id) ? ' (exit from here)' : ''}${isShut(x) ? ' (closed)' : ''}`).join('; ')}`);
    lines.push(`ITEMS HERE: ${(l.items || []).map(i => `${i.id} (${i.name})`).join(', ') || 'none'}`);
    // A faction's running clock is what a nudge moves: its aim and how far along it is.
    lines.push(`FACTIONS: ${s.factions.map(f => { const c = World.activeClock(f); return `${f.id} — ${f.name}${c ? `; clock "${c.label}" ${c.filled}/${c.segments}` : '; no clock running'}`; }).join('; ')}`);
    lines.push(`THREADS: ${s.threads.map(t => `${t.id} — ${t.title} (${t.status}${t.knownToPlayer ? '' : '; player does not know it yet'}): ${firstClause(t.summary)}`).join('; ') || 'none'}`);
    const owed = State.obligations('owed');
    if (owed.length) lines.push(`OPEN OBLIGATIONS (obligationsSettled takes these ids; money handed over toward one is counted on it, a part payment too): ${owed.map(o => `${o.id} — ${obligationClause(o, s)}${o.npcId ? ` [${o.npcId}]` : ''}`).join('; ')}`);
    const news = newsLine();
    if (news) lines.push(news);
    return lines.join('\n');
  }

  /* "Mavis Toler (Dewayne's wife)": the name, and who they are to someone
     (else the first part of the role). */
  function personTag(n) {
    if (!n) return '';
    const rel = isObj(n.created) && n.created.relationToNpcId ? State.relationPhrase(State.npc(n.created.relationToNpcId), kinWord(n.created.relation, n.pronouns)) : '';
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
    const foe = ((ctx.action && ctx.action.targets) || []).map(id => State.npc(id)).find(n => n && present.includes(n)) || null;
    const watchy = n => !!n && ((n.tags || []).some(t => t === 'watch' || t === 'police') || /\b(watch|police|deputy|sheriff|officer|constable|trooper|cop)/i.test(n.role));
    let outcome;
    let npc = null;
    let dest = null;
    if (Storage.settings().permadeath) outcome = 'dead';
    else {
      // Wave 27 (Rel.rescues): liking 25 or more, or a favour they owe, unless they are afraid of the player.
      const friend = present.filter(n => n !== foe && Rel.rescues(n)).sort((x, y) => y.attitude - x.attitude)[0];
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
      // Wave 27: the rescuer did the player a favour (they_helped, weight 2: the player owes them one); the captor's is what they did to the player (noted, own: no grudge grows from it).
      if (npc && outcome === 'rescued') diff.socialEvents = [{ npcId: npc.id, event: 'they_helped', text: `Found ${p.name} beaten senseless and helped them`, weight: 2 }];
      if (npc && outcome === 'captured') diff.newMemories = [{ npcId: npc.id, text: `Beat ${p.name} in a fight and dragged them to the cells`, weight: 3, act: 'own', event: 'noted' }];
    }
    State.apply(diff);
    // One long, and not a night without sleep (REVIEW E14); runTurn charges nothing else for the action.
    if (outcome !== 'dead') passTime({ cost: 'long', cause: 'defeat' }, 'defeat');
    const text = {
      rescued: () => `You black out. When you come to, ${npc.name} is kneeling beside you, and the fight is over.`,
      captured: () => (dest ? `You black out. You wake on the floor of a cell in ${dest.name.replace(/^The /, 'the ')}, aching all over.` : 'You black out and wake under guard, aching all over.'),
      robbed: () => `You black out. When you come to, your ${isModern() ? 'wallet' : 'purse'} is gone, and ${money(lost)} with it.`,
      gutter: () => `You black out. You wake in a gutter in ${dest ? dest.name.replace(/^The /, 'the ') : 'a back lane'}, soaked and aching, with no memory of getting there.`,
      dead: () => 'You go down and do not get up. Your story ends here.'
    }[outcome]();
    return { outcome, npcId: npc ? npc.id : null, text };
  }

  // ----- step 12: chronicle compression -----
  /* When the log holds CHRONICLE_AT entries, all but the newest
     CHRONICLE_KEEP become one chronicle entry (Api.chronicle: the parser
     model in plain text, or the mock's deterministic summary) through
     State.apply({ chronicleEntry }), which drops them from the log. The
     narrator's LAST 3 TURNS always has the newest turns to read (REVIEW
     2.2: compressing every 10 turns left it one turn to read). Runs after
     the turn is logged and saved (runTurn), so it never holds up the
     player. A refusal, an error or an empty reply never fails anything: it
     is tried again after the next turn. Returns the entry, or null. */
  const CHRONICLE_AT = 16;
  const CHRONICLE_KEEP = 6;
  function chronicleDue(s) { return !!s && s.log.length >= CHRONICLE_AT; }
  async function compressIfDue() {
    const s = State.current;
    if (!chronicleDue(s)) return null;
    const entries = deepCopy(s.log.slice(0, s.log.length - CHRONICLE_KEEP));
    const skip = reason => { State.pushDebug({ turn: s.meta.turn, kind: 'chronicle', reason }); return null; };
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
  /* A place in town the player has not found yet (a home nobody has told
     them about): its destination, or for a move a place among its targets.
     Walking there by name spends nothing; they have to ask around. */
  function unknownTarget(a) {
    if (!a) return null;
    const hidden = l => !!l && l.discovered === false && l.away !== true;
    const d = a.destinationId ? State.loc(a.destinationId) : null;
    if (hidden(d)) return d;
    if (a.actionType === 'move') return (a.targets || []).map(id => State.loc(id)).find(hidden) || null;
    return null;
  }
  function refuseUnknown(l, opts, ctx, snap, mark) {
    const r = fail(snap, mark, null, { reason: 'unknown-place', placeId: l.id });
    UI.feed.input(opts.input, ctx.speech);
    UI.feed.notice(NOTICES.unknownPlace);
    return r;
  }
  function fail(snap, mark, notice, extra) {
    pendingEpilogue = null;
    morningNews = false;
    heldNotices = [];
    // Defensive: if another game was loaded mid-turn, do not restore over it or touch its feed.
    if (turnState && State.current !== turnState) return Object.assign({ ok: false }, extra, { reason: 'replaced' });
    State.restore(snap);
    World.forget(State.current.meta.turn);
    UI.feed.rollback(mark);
    if (notice) UI.feed.notice(notice.text, notice.kind);
    return Object.assign({ ok: false }, extra);
  }
  function refusedText(role) { return NOTICES.refusedBy[role] || NOTICES.refused; }

  /* Someone a due event brought to the player is no longer among those who
     left, and is told by the due event, not as one more arrival (wave 3,
     playtest N4: "Jodie Strayhorn has left" while she walks up). */
  function squareScene(ctx) {
    const s = State.current;
    const ps = s.pendingScene;
    if (!ps || ps.locationId !== s.player.locationId) return;
    const now = State.npcsAt(ps.locationId).map(n => n.id);
    const brought = (ctx.due || []).map(d => d && d.npcId).filter(Boolean);
    const left = (ps.left || []).filter(id => !now.includes(id));
    const arrived = (ps.arrived || []).filter(id => now.includes(id) && !brought.includes(id));
    if (left.length === (ps.left || []).length && arrived.length === (ps.arrived || []).length) return;
    State.apply({ sceneChange: { locationId: ps.locationId, arrived, left, before: ps.before, cause: ps.cause } });
  }
  // ----- steps 8 and 9: the bookkeeper's diff -----
  /* The diff made safe for this turn: what the engine already did (fight
     damage, the card game's money) is not recorded twice, a Say turn and a
     walk the engine made keep the player where the engine put them, and a
     place someone named is credited to whoever the player was talking to. */
  function cleanDiff(ctx, diff) {
    const s = State.current;
    const clean = isObj(diff) ? Object.assign({}, diff) : {};
    const reject = (path, reason) => State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'model', path, reason });
    if (ctx.damage && toInt(clean.hpDelta) < 0) { reject('hpDelta', 'ignored: the engine already applied fight damage'); delete clean.hpDelta; }
    if (ctx.gamble && toInt(clean.goldDelta)) { reject('goldDelta', ctx.gamble.played ? 'ignored: the engine already moved the card game\'s money' : 'ignored: no card game was played, so no money moved at cards'); delete clean.goldDelta; }
    if (isSay(ctx.speech) && clean.playerLocationId && clean.playerLocationId !== s.player.locationId) { reject('playerLocationId', 'ignored: in Say mode the player only spoke and stays where they are'); delete clean.playerLocationId; }
    if (ctx.moved && clean.playerLocationId === ctx.moved.fromId) { reject('playerLocationId', `ignored: the engine walked the player from ${ctx.moved.fromId} to ${ctx.moved.toId} this turn`); delete clean.playerLocationId; }
    // Wave 27: the seller would not sell (refuseSale): no money paid for it and nothing bought.
    if (ctx.noSale) {
      if (toInt(clean.goldDelta) < 0) { reject('goldDelta', `ignored: ${ctx.noSale} would not sell to the player`); delete clean.goldDelta; }
      if (Array.isArray(clean.itemsGained)) clean.itemsGained = clean.itemsGained.filter(x => { const bought = State.goodNamed(typeof x === 'string' ? x : isObj(x) ? x.name : ''); if (bought) reject('itemsGained', `ignored: ${ctx.noSale} would not sell ${typeof x === 'string' ? x : x.name}`); return !bought; });
    }
    // The same ask worked here before this phase (Dice.diminishing): a warmer attitude counts for less each time; another gift to the same person today, none at all.
    const gift = giftIn(ctx, clean);
    ctx.gift = gift ? gift.npcId : null;
    const dim = gift && gift.times > 0 ? { npcId: gift.npcId, times: gift.times, factor: 0, gift: true } : ctx.diminish;
    if (dim && Array.isArray(clean.attitudeChanges)) {
      clean.attitudeChanges = clean.attitudeChanges.map(c => {
        if (!isObj(c) || c.npcId !== dim.npcId || !(toInt(c.delta) > 0)) return c;
        const d = Math.round(toInt(c.delta) * dim.factor);
        reject('attitudeChanges', `${c.npcId} ${plusMinus(toInt(c.delta))} held to ${plusMinus(d)}: ${dim.gift ? `another gift to them today (${dim.times} before)` : `the same ask already worked ${dim.times} time${dim.times === 1 ? '' : 's'} here this phase`}`);
        return d > 0 ? Object.assign({}, c, { delta: d }) : null;
      }).filter(c => c !== null);
    }
    // A place someone named: credited to whoever the player was talking to (the bookkeeper does not say who told it).
    const by = speakerOf(ctx);
    for (const k of ['placesRevealed', 'peopleRevealed']) {
      if (Array.isArray(clean[k])) clean[k] = clean[k].map(x => (isObj(x) && by ? Object.assign({}, x, { byNpcId: by }) : x));
    }
    /* Wave 28 (the integration plan's 5.6): what State.apply's model rules
       read besides the diff, passed through as opts (ctx.bookOpts): the
       diminishing (the same ask again, another gift today: the bookkeeper's
       kind events for them count for its factor), whom the gift went to,
       and the turn's own engine events (wave 27: a gift or a bribe; wave 28:
       an unwelcome flirt for each adult named, Rel.romanceTurn's). */
    const at = ctx.action || {};
    const engineEvents = ctx.gift ? [{ npcId: ctx.gift, event: (at.actionType === 'persuade' || at.actionType === 'deceive') && (at.targets || []).includes(ctx.gift) ? 'bribed' : 'gift', handed: true }] : [];
    if (!ctx.flirtsDone) engineEvents.push(...romanceEvents(ctx));
    ctx.bookOpts = { diminish: dim || null, giftTo: ctx.gift || null, engineEvents };
    return clean;
  }
  /* A flirt, as the engine records it (Rel.romanceTurn's, landed by the
     charm roll since wave 34: Rel.flirtAnswer, Rel.flirtEventOf): welcome,
     the row (liking +4, knows +2, spark 10 x their sparkRate; 15 x on a
     critical); unwelcome, liking 3 the first time, 6 after, trust 3, spark
     5 (the liking doubled and weight 2 on a critical failure); too soon,
     the first free and liking 1 after. null: nothing changes. */
  function flirtEvent(f) {
    return Rel.flirtEventOf(State.npc(f.npcId), f.ans, State.current.player.name, placeName(here()));
  }
  /* Wave 29: the turn's romance events (Rel.romanceTurn): each flirt, with
     the jealousy of whoever saw it (Rel.jealousyOf: a partner by label, or
     someone sweet on the player), and a night together said yes to (the
     engine's intimate: a private, weight-3 scar; nothing explicit is ever
     asked for). */
  function romanceEvents(ctx) {
    const r = ctx.romance;
    if (!r) return [];
    const out = [];
    for (const f of Array.isArray(r.flirts) ? r.flirts : []) {
      const ev = flirtEvent(f);
      if (!ev) continue;
      out.push(ev);
      const n = State.npc(f.npcId);
      if (n) out.push(...Rel.jealousyOf(n, ctx.presentIds || []));
    }
    for (const id of Array.isArray(r.intimate) ? r.intimate : []) out.push({ npcId: id, event: 'intimate', text: `spent the night with ${State.current.player.name}`, private: true });
    return out;
  }
  /* Wave 28: the turn's flirts when the bookkeeper did not run or failed
     (its apply carries them otherwise: ctx.flirtsDone). Wave 29: the
     jealousy and the night together with them. */
  function flirtsAlone(ctx) {
    const s = State.current;
    if (!s || ctx.flirtsDone || !ctx.romance) return;
    ctx.flirtsDone = true;
    const events = romanceEvents(ctx);
    if (!events.length) return;
    const r = State.apply({ socialEvents: events });
    if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'flirts', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
  }
  /* Apply the bookkeeper's diff as model output, with this turn's context
     for State.apply (who was present, whether the roll succeeded, who was
     attacked), then the quiet lines for what it added and the reputation
     drift. Shared by the turn and the background retry. */
  function applyBookkeeping(ctx, diff) {
    const s = State.current;
    const clean = cleanDiff(ctx, diff);
    const before = World.attitudes();
    const offered = ctx.rumour ? State.rumour(ctx.rumour.id) : null;
    const wasHeard = !!(offered && offered.heard);
    const targets = ((ctx.action && ctx.action.targets) || []).filter(id => typeof id === 'string' && id.startsWith('npc_'));
    /* Wave 27: the turn's own events that ride this apply (opts.engineEvents,
       cleanDiff's since wave 28): a gift, or a bribe when the turn's action
       was a persuade or a lie aimed at them; State counts it only once money
       or a thing actually moved to them, and the bookkeeper's legacy lines
       for them yield to it. Wave 28: the model's rules read whom the words
       were said to (speechTo), the romance step (romance: the minor rule's
       signals) and the diminishing (diminish, giftTo). */
    const bo = isObj(ctx.bookOpts) ? ctx.bookOpts : {};
    ctx.flirtsDone = true;
    ctx.applied = State.apply(clean, { source: 'model', present: (ctx.presentIds || []).slice(), rollSuccess: !!(ctx.roll && ctx.roll.success) || !!ctx.complied, attacked: ctx.attacked || null, targets, actionType: (ctx.action && ctx.action.actionType) || null, bought: !!ctx.bought, paying: !!ctx.paying, rolled: !!ctx.roll, asked: (ctx.roll && ctx.rollNpcId) || null,
      engineEvents: Array.isArray(bo.engineEvents) ? bo.engineEvents : [], diminish: bo.diminish || null, giftTo: bo.giftTo || null, speechTo: isSay(ctx.speech) && ctx.speech.to !== 'everyone' ? ctx.speech.to : null, romance: ctx.romance || null,
      narration: ctx.narration || '', backed: ctx.backed ? ctx.backed.npcId : null, rollStat: ctx.roll ? ctx.roll.stat : null, rollTier: ctx.roll ? ctx.roll.tier : null });
    // A gift counts once it was handed over (the money or the thing went), and is no payment toward what they are owed.
    const handed = ctx.applied.applied.some(x => /^(goldDelta|itemsLost)/.test(x)) && !ctx.applied.applied.some(x => /^(paid|settled)\./.test(x));
    if (ctx.gift && handed) State.apply({ giftGiven: ctx.gift });
    // Step 13 renders the map and the Places list from state; the feed says what was added.
    ctx.revealed = (ctx.applied.revealed || []).slice();
    for (const id of ctx.revealed) UI.feed.quiet(`Added to the map: ${State.loc(id).name}.`);
    // A person the story named: a quiet line once they have a name (someone known only as "Dewayne's wife" is added silently).
    ctx.people = (ctx.applied.people || []).slice();
    for (const x of ctx.people) if (x.named) UI.feed.quiet(`Added to People: ${personTag(State.npc(x.id))}.`);
    ctx.reputation = World.driftReputation(before);
    // "<Name> warms to you." and the like: App's State listener writes them once the turn is in (one place, any cause).
    // Someone other than its source told it: People lists it under the teller.
    if (offered && !wasHeard && offered.heard && offered.sourceNpcId !== ctx.rumour.npcId) State.apply({ rumourToldBy: [{ rumourId: offered.id, npcId: ctx.rumour.npcId }] });
    return ctx.applied;
  }
  /* Wave 28: the minor rule after narration (the integration plan's 6.2 as
     tightened by 19.3), for each minor the romance step found in the scene,
     with up to three signals: the parse's flag aimed at them (or at
     everyone with them there), the phrase list over the input, and a
     bookkeeper romance event naming them (State set it aside:
     ctx.applied.minors). A named target (the Say chip, a target of a Do
     action; never Say to everyone) with two signals or more: the full row
     and its consequences (World.minorAdvance: their guardians, the reports,
     the town). A romance event from the bookkeeper without that: the full
     row for them alone (it never warms them, whatever was sent). One signal
     otherwise: the light row (a weight-1 line that fades in days and grows
     nothing; no guardians, reports or reputation), so "thanks, sweetheart"
     with a false flag cannot brand the player. Nothing at all with no
     signal: a kind word is a kind word. Spark never moves (Rel.eligible). */
  function minorTurn(ctx) {
    const s = State.current;
    const r = ctx.romance;
    if (!s || !r || !isObj(r.minors)) return;
    const named = new Set(ctx.applied && Array.isArray(ctx.applied.minors) ? ctx.applied.minors : []);
    const place = placeName(here());
    const R = Rel.MINOR_RULE;
    for (const id of Object.keys(r.minors)) {
      const m = Object.assign({}, r.minors[id]);
      const book = named.has(id);
      // Wave 33: a romantic parse the engine could aim at nobody, and the bookkeeper's romance event names them: the parse's flag is theirs too (as it was when the flag went to everyone here).
      if (book && !m.flag && r.romantic && Array.isArray(r.aimed) && !r.aimed.length) m.flag = true;
      const signals = (m.flag ? 1 : 0) + (m.phrase ? 1 : 0) + (book ? 1 : 0);
      const n = State.npc(id);
      if (!signals || !n) continue;
      let what;
      if (m.named && signals >= 2) { World.minorAdvance(id); what = 'the full row and its consequences'; }
      else {
        const ev = book ? { npcId: id, event: 'unwanted_advance', text: fillTemplate(R.advance, { player: s.player.name, place }) }
          : Object.assign({ npcId: id, text: fillTemplate(R.light.text, { place }) }, { event: R.light.event, d: Object.assign({}, R.light.d), weight: R.light.weight, decay: R.light.decay });
        const res = State.apply({ socialEvents: [ev] });
        if (res.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'minor rule', reason: res.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
        what = book ? 'the full row for them alone (a romance event from the bookkeeper)' : 'the light row';
      }
      State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `${id} is under 18: ${what} (${['named', 'flag', 'phrase'].filter(k => m[k]).concat(book ? ['bookkeeper'] : []).join(', ')})` });
    }
    for (const id of named) if (!r.minors[id]) State.pushDebug({ turn: s.meta.turn, kind: 'rel', text: `${id} is under 18 and not here: the bookkeeper's romance event for them dropped` });
  }
  /* Wave 27 (the integration plan's 4.1): the people a turn was spent with,
     for State's relTurn: whoever the words were said to (Say, not to
     everyone) or a social action was aimed at, here. Anyone the turn
     already moved (their liking, or a new memory) is quiet: the turn was
     about that, not time together. */
  function turnTogether(ctx) {
    const s = State.current;
    // A card game, or an ask for table stakes, is the table's business (it changes no feeling), not time together.
    if (!s || !ctx.action || !isObj(ctx.attStart) || ctx.stakes || ctx.gamble) return;
    const a = ctx.action;
    const here = ctx.presentIds || [];
    const aimed = [];
    if (isSay(ctx.speech) && ctx.speech.to && ctx.speech.to !== 'everyone' && here.includes(ctx.speech.to)) aimed.push(ctx.speech.to);
    if (Dice.SOCIAL_ACTIONS.includes(a.actionType)) for (const id of a.targets || []) if (here.includes(id) && !aimed.includes(id)) aimed.push(id);
    if (!aimed.length) return;
    // A turn that moved them, or an ask of theirs that failed (a "no" is no time together), counts no time together.
    const refused = ctx.roll && !ctx.roll.success ? (a.targets || []) : [];
    const quiet = aimed.filter(id => { const n = State.npc(id); return !n || refused.includes(id) || n.attitude !== ctx.attStart[id] || (n.memories || []).length !== (ctx.memStart || {})[id]; });
    const r = State.apply({ relTurn: { aimed, quiet } });
    if (r.rejected.length) State.pushDebug({ turn: s.meta.turn, kind: 'rejected', source: 'engine', path: 'relTurn', reason: r.rejected.map(x => `${x.path}: ${x.reason}`).join('; ') });
  }
  /* A bookkeeper that failed (not a refusal, not a Stop): asked once more in
     the background. Its diff is applied when no turn is running, and only
     while that turn's log entry is still the newest and still 'not
     recorded' (not taken back with /undo, not another game, and no later
     turn has been played on top of it: a diff read against an older scene
     would undo what came after, so then the turn stays not recorded). A
     late diff never moves the player (the engine already made any walk the
     turn narrated). The quiet line goes on that entry. */
  /* Which game a state is (its createdAt and seed: the same through every
     turn, a restore and a reload), and which log entry a turn is (its turn
     number, its input and its narration): a failed later turn restores a
     snapshot as a new state object, so object identity says nothing
     (wave 3, the review's risk). */
  function gameKey(st) { return isObj(st) && isObj(st.meta) ? `${st.meta.createdAt || ''}|${st.meta.seed}` : null; }
  function entryStamp(e) { return isObj(e) ? { turn: e.turn, input: e.input || '', narration: e.narration || '' } : null; }
  function sameEntry(e, stamp) { return !!e && !!stamp && e.turn === stamp.turn && (e.input || '') === stamp.input && (e.narration || '') === stamp.narration; }
  function retryBookkeeper(s, turn, packet, ctx) {
    const game = gameKey(s);
    const stamp = entryStamp(s.log.find(e => e.turn === turn));
    const drop = why => State.pushDebug({ turn, kind: 'bookkeeper', reason: `the retry came back ${why}; turn ${turn} stays not recorded` });
    (async () => {
      let diff;
      try { diff = await Api.bookkeep(packet); } catch (err) {
        State.pushDebug({ turn, kind: 'bookkeeper', reason: `the retry failed too (${(err && (err.type || err.message)) || err}); turn ${turn} stays not recorded` });
        return;
      }
      if (isRefusal(diff)) { State.pushDebug({ turn, kind: 'bookkeeper', reason: `the retry was refused; turn ${turn} stays not recorded` }); return; }
      while (busy) await whenIdle();
      const cur = State.current;
      if (!cur || gameKey(cur) !== game) { drop('after another game was loaded'); return; }
      const entry = cur.log.find(e => sameEntry(e, stamp));
      if (!entry) { drop('after the turn was taken back'); return; }
      if (entry.changes !== 'not recorded') return;
      if (cur.log[cur.log.length - 1] !== entry || cur.meta.turn !== turn) { drop('after a later turn'); return; }
      const late = isObj(diff) ? Object.assign({}, diff) : {};
      if (late.playerLocationId) {
        State.pushDebug({ turn, kind: 'rejected', source: 'model', path: 'playerLocationId', reason: 'ignored: a late bookkeeper never moves the player' });
        delete late.playerLocationId;
      }
      State.beginBatch();
      try {
        applyBookkeeping(ctx, late);
        State.apply({ logUpdate: { turn, changes: null } });
        UI.feed.quiet(NOTICES.bookLate);
        State.pushDebug({ turn, kind: 'bookkeeper', reason: `the retry recorded turn ${turn}` });
      } catch (err) { console.error(err); } finally { State.endBatch(); }
    })();
  }

  // ----- what the turn earned -----
  function progressMark(s) {
    const p = s.player;
    return { n: Array.isArray(p.progression) ? p.progression.length : 0, stats: Object.assign({}, p.stats), maxHp: p.maxHp };
  }
  /* A thread resolved for the first time gives a stat or max HP (State,
     player.progression): one quiet line per thread, each with its own gain
     (wave 3, playtest N11: "wits +1" on the entry reads "+1 Wits"). An
     entry from an older build without its gain: the turn's whole gain on
     the last line, as before. */
  function gainText(g) {
    const m = /^(\w+) \+(\d+)$/.exec(String(g || ''));
    if (m && STATS.includes(m[1])) return `+${m[2]} ${capFirst(m[1])}`;
    const hp = /^max HP \+(\d+)$/.exec(String(g || ''));
    return hp ? `+${hp[1]} max HP` : '';
  }
  function progressLines(s, before) {
    const p = s.player;
    const list = Array.isArray(p.progression) ? p.progression : [];
    if (list.length <= before.n) return;
    const gains = [];
    for (const k of STATS) { const d = (p.stats[k] | 0) - (before.stats[k] | 0); if (d > 0) gains.push(`+${d} ${capFirst(k)}`); }
    if (p.maxHp > before.maxHp) gains.push(`+${p.maxHp - before.maxHp} max HP`);
    const fresh = list.slice(before.n);
    const own = fresh.every(x => isObj(x) && Object.prototype.hasOwnProperty.call(x, 'gain'));
    fresh.forEach((x, i) => UI.feed.quiet(resolvedText(x, own ? gainText(x.gain) : i === fresh.length - 1 ? gains.join(', ') : '')));
  }
  function resolvedText(x, g) {
    const t = x && x.threadId ? State.thread(x.threadId) : null;
    return `Resolved: ${t ? t.title : 'a thread'}.${g ? ` ${g}.` : ''}`;
  }

  /* opts: { input (shown and logged), mode: 'normal' | 'zoom' | 'arrival' |
     'epilogue', parse (text for the parser; default input), action (preset
     action or fn(ctx) -> action: skips the parser), fact (statement: /fact),
     prepare (fn(ctx), runs after the snapshot: time skips), bookkeep (false
     to skip steps 8-9 unless a due event is narrated), cause (for
     World.tick), epilogue ({ text }: a narrator-only ending), afterCommit
     (fn, after the turn is logged: /rest's recap) } */
  async function runTurn(opts) {
    if (busy) return { ok: false, reason: 'busy', restoreInput: true };
    const ro = readOnlyRefusal();
    if (ro) return ro;
    const s = State.current;
    busy = true;
    acceptsQueue = false;
    UI.setBusy(true);
    Api.beginTurn();
    const snap = State.snapshot();
    const mark = UI.feed.mark();
    const ctx = { input: opts.input, mode: opts.mode || 'normal', speech: opts.speech || null, cause: opts.cause || 'turn', action: null, roll: null, created: [], notPresent: [], links: [], due: [], reroll: !!opts.reroll, beat: !!opts.beat, narratorLines: [], bookLines: [], replayCards: opts.replayCards || null, resume: opts.resume || null, resumeOther: opts.resumeOther === true, storedHand: opts.storedHand || null };
    // Step 13: the autosave and the render run when this batch closes: once
    // the turn is logged (then the chronicle runs), or after a rollback.
    State.beginBatch();
    let batchOpen = true;
    let committed = false;
    let later = null;
    turnState = s;
    morningNews = false;
    const replaced = () => State.current !== s;
    try {
      State.apply({ beginTurn: true });
      if (opts.input || !opts.epilogue) UI.feed.input(opts.input, ctx.speech);
      const startTime = nowTime();
      const startLoc = s.player.locationId;
      const earned = progressMark(s);
      if (opts.prepare) opts.prepare(ctx);
      if (!sameTime(startTime, nowTime())) UI.feed.divider(s.time.day, s.time.phase);
      flushNotices();
      // Step 3. Parse (and warm the narrator's cache alongside it when it has gone cold).
      let action;
      if (opts.action) action = normaliseParse(typeof opts.action === 'function' ? opts.action(ctx) : opts.action, opts.parse || opts.input);
      else {
        status('parse');
        if (!opts.fact) { try { Api.prewarm(() => ({ system: Style.systemPrompt(), town: townBlock(), cast: castBlock() })); } catch (e) { console.warn('[Pipeline] prewarm', e); } }
        const parsed = await Api.parse(parsePacket(opts.parse || opts.input, { mode: opts.fact ? 'fact' : 'action', speech: ctx.speech }));
        if (replaced()) return fail(snap, mark, null, {});
        if (isRefusal(parsed)) return fail(snap, mark, { text: refusedText('parser') }, { reason: 'refused', restoreInput: true });
        action = normaliseParse(parsed, opts.parse || opts.input);
      }
      if (!action.summary) action.summary = cleanText(opts.parse || opts.input, 160);
      // The action as parsed, before the steps below change it (a walk, a thing made or not found): /reroll replays this.
      const parsedAction = deepCopy(action);
      ctx.action = action;
      ctx.parsed = parsedAction;
      // A purchase, as the parser read it or (Say mode) as the words say it, before Say mode makes it talk (wave 4): its money pays no debt and is no gift.
      ctx.paying = !opts.fact && payingIn(ctx);
      ctx.bought = !opts.fact && boughtIn(action, ctx);
      // Step 3c. Say mode: the player only spoke, to whoever they addressed (a bet is still a bet: wave 11, H2).
      if (!opts.fact && isSay(ctx.speech)) sayAction(action, ctx.speech, ctx.input);
      // A place out of town is never a destination, and a place not found yet cannot be walked to: a plain line, nothing spent.
      if (!opts.fact && awayTarget(action)) return refuseAway(awayTarget(action), opts, ctx, snap, mark);
      if (!opts.fact && unknownTarget(action)) return refuseUnknown(unknownTarget(action), opts, ctx, snap, mark);
      // Step 3b. A walk and then an action there: the engine moves the player first.
      if (!opts.fact) walkFirst(ctx);
      // Step 4. Check and create (a thing looked for with a roll waits for the roll: createDeferred).
      Object.assign(ctx, await checkAndCreate(action, { fact: !!opts.fact, input: opts.parse || opts.input, defer: true }));
      if (replaced()) return fail(snap, mark, null, {});
      if (opts.fact) return finishFact(ctx, opts, snap, mark);
      if (awayTarget(action)) return refuseAway(awayTarget(action), opts, ctx, snap, mark);
      if (unknownTarget(action)) return refuseUnknown(unknownTarget(action), opts, ctx, snap, mark);
      fleeExit(ctx);
      scene(ctx);
      // Something the action needs that the player does not carry: told to the narrator and the bookkeeper (NOT CARRIED).
      ctx.missing = missingThing(ctx);
      // Wave 28: the romance step, decided before anything is narrated (Rel.romanceTurn): each adult's answer, coercion, and what points at anyone under 18.
      romanceStep(ctx);
      // Step 5. Resolve (the card game is played in code, at a table the player plays: wave 10).
      // Wave 18 (amendment 2): asking the dealer for table stakes is its own resolution (the engine's word rule, whatever the parser called it).
      const asked = ctx.replayCards ? null : stakesAsked(ctx);
      // How everyone stood before the turn did anything to them (wave 27: a turn that moved someone is not also time spent with them).
      ctx.attStart = World.attitudes();
      ctx.memStart = Object.fromEntries(s.npcs.map(n => [n.id, (n.memories || []).length]));
      const resolved = asked ? stakesAsk(ctx, asked) : action.actionType === 'gamble' ? await gamble(ctx) : resolve(ctx);
      if (replaced()) return fail(snap, mark, null, {});
      if (resolved.locked) {
        const r = fail(snap, mark, null, { reason: 'retry-locked' });
        UI.feed.input(opts.input, ctx.speech);
        UI.feed.notice(NOTICES.locked);
        return r;
      }
      // Wave 34: how the flirt landed, by the charm roll it made (romanceLanded).
      romanceLanded(ctx);
      await createDeferred(ctx);
      if (replaced()) return fail(snap, mark, null, {});
      giftCheck(ctx);
      secretsFor(ctx);
      refuseSale(ctx);
      // Step 6. Narrate, with any due events (step 11 of an earlier turn) and one fresh rumour.
      const narrTime = nowTime();
      const leaving = action.actionType === 'move' && !!action.destinationId && action.destinationId !== ctx.location.id;
      // A narration of time passing (/rest, /wait, /skip) tells more of what came due meanwhile, so a string of nights does not leave events to be told days late.
      const quiet = opts.bookkeep === false;
      // A walk to an open place: what is due is told where the player arrives, and whoever comes for them meets them there (playtest B6).
      const dest = leaving && ctx.destination && !ctx.destination.closed ? ctx.destination : null;
      // A narration of time passing (/rest, /wait, /skip, /look) fires what is due now before it is told (wave 3, playtest N4): the morning's visitor is in this narration, not "has left".
      if (quiet && !opts.epilogue) World.fireSeeds({ turn: s.meta.turn, time: narrTime, locationId: s.player.locationId, movedFrom: ctx.location.id, presentNpcIds: State.npcsAt(s.player.locationId).map(n => n.id), targetIds: [] });
      // A walk that lands at a town event as it starts (wave 4, playtest R1): it happens as the player walks in, told in this narration.
      if (dest && !opts.epilogue && !(ctx.arrest && ctx.arrest.plan) && (dest.phase !== narrTime.phase || dest.day !== narrTime.day)) World.eventsOnArrival({ locationId: dest.id, day: dest.day, phase: dest.phase });
      // A meeting agreed in the story (wave 22): the player at its place in a phase it covers, as a walk lands there or a turn there
      // begins, keeps it; it fires now, so this narration tells it (its person is there: their visit).
      if (!opts.epilogue && !(ctx.arrest && ctx.arrest.plan) && (dest || !leaving)) World.appointmentsHere(dest ? { locationId: dest.id, day: dest.day, phase: dest.phase } : { locationId: ctx.location.id, day: narrTime.day, phase: narrTime.phase });
      // An arrest this turn is all that happens next (wave 3): what else came due waits for the next narration.
      ctx.due = opts.epilogue ? [{ seedId: null, text: opts.epilogue.text, scene: true }] : ctx.arrest && ctx.arrest.plan ? []
        : World.dueSeeds({ turn: s.meta.turn, time: narrTime, locationId: dest ? dest.id : ctx.location.id, phase: dest ? dest.phase : undefined, day: dest ? dest.day : undefined, then: dest ? undefined : ctx.landing, presentNpcIds: dest ? State.npcsAt(dest.id, dest.phase, dest.day).map(n => n.id) : ctx.presentIds, targetIds: action.targets.slice(), mode: ctx.mode, leaving: leaving && !dest, max: quiet ? DUE_QUIET : undefined, hold: dueHold(ctx) }) || [];
      // Whoever came for the player is there in the phase the walk lands in (wave 3: and stays once the walk's time has passed).
      if (dest && ctx.due.length) ctx.destination.present = State.npcsAt(dest.id, dest.phase, dest.day).map(n => n.name);
      // Who this narration shows where the player ends up (wave 4, playtest R1): the next scene change is measured from them.
      if (dest) ctx.shown = { locationId: dest.id, ids: State.npcsAt(dest.id, dest.phase, dest.day).map(n => n.id) };
      if (ctx.due.length) { squareScene(ctx); scene(ctx); } // a due event may have brought someone into the scene
      ctx.rumour = opts.epilogue ? null : pickRumour(ctx);
      status('narrate');
      /* A hand at cards is final once it is played (wave 11, M1): Stop with
         it open folded it, and a narrator that fails, is stopped or
         declines leaves it told plainly by the engine; the turn is kept. */
      const played = !!(ctx.gamble && ctx.gamble.played);
      let told;
      // A hand the page was closed on (resumeHand): told plainly, as it was left.
      if (played && ctx.resume) told = plainNarration(ctx, 'left');
      else if (played && ctx.handStopped) told = plainNarration(ctx, 'folded');
      else {
        try { told = await narrate(ctx); } catch (err) {
          if (!played || replaced()) throw err;
          told = plainNarration(ctx, err && err.type === 'aborted' ? 'stopped' : 'failed', err);
        }
        if (replaced()) return fail(snap, mark, null, {});
        if (told.refusal && played) told = plainNarration(ctx, 'refused');
      }
      if (told.refusal) return fail(snap, mark, { text: opts.epilogue ? NOTICES.endingLater('the narrator declined it') : refusedText('narrator') }, { reason: 'refused', restoreInput: true });
      let narration = told.narration;
      ctx.narration = narration;
      // Who the narration introduces: on a walk, the people where it lands (wave 3, playtest N5); the one spoken to is met too.
      noteIntroductions(narration, dest ? dest.id : ctx.location && ctx.location.id, dest ? { phase: dest.phase, day: dest.day } : null, isSay(ctx.speech) && ctx.speech.to && ctx.speech.to !== 'everyone' ? [ctx.speech.to] : []);
      noteMentioned(narration);
      // The narration is in: from here the next input can wait in the queue.
      acceptsQueue = true;
      // The comings and goings this narration showed are done now, before this turn's time records new ones (a hand told plainly showed none).
      if (s.pendingScene && !told.plain) State.apply({ sceneChangeDone: true });
      // Steps 8-9. Bookkeep, then apply the diff as model output. A due event narrated on /look, /rest, /wait or /skip is bookkept too.
      // A hand told plainly (wave 11, M1) has nothing for the bookkeeper: the engine moved the money and wrote what being caught does.
      const book = !opts.epilogue && !told.plain && (opts.bookkeep !== false || ctx.due.length > 0);
      let notRecorded = null;
      if (book) {
        status('bookkeep');
        const packet = { text: [bookkeeperPacket(ctx)].concat(ctx.bookLines).join('\n'), context: ctx };
        let diff = null;
        try { diff = await Api.bookkeep(packet); } catch (err) {
          if (replaced()) throw err;
          // Stop while the town is being updated: the narration the player read stands; this turn's changes are not recorded and not retried.
          notRecorded = err && err.type === 'aborted' ? { stopped: true } : { error: err, packet };
        }
        if (replaced()) return fail(snap, mark, null, {});
        if (!notRecorded && isRefusal(diff)) notRecorded = { refused: true };
        if (notRecorded) {
          const why = notRecorded.stopped ? 'was stopped' : notRecorded.refused ? 'refused' : `failed: ${(notRecorded.error && (notRecorded.error.type ? `${notRecorded.error.type}: ` : '') + (notRecorded.error.detail || notRecorded.error.message)) || notRecorded.error}`;
          State.pushDebug({ turn: s.meta.turn, kind: 'bookkeeper', reason: `the bookkeeper ${why}; the narration stands and the turn's changes were not recorded` });
          UI.feed.quiet(notRecorded.stopped ? NOTICES.bookStopped : notRecorded.refused ? refusedText('bookkeeper') : NOTICES.bookFailed);
        } else {
          // Wave 28: kept for the eval's export while the setting is on.
          keepBookTurn(s.meta.turn, packet.text, diff);
          applyBookkeeping(ctx, diff);
        }
      }
      // Wave 28: an unwelcome flirt the bookkeeper's apply did not carry, then the minor rule after narration (minorTurn).
      flirtsAlone(ctx);
      minorTurn(ctx);
      // A turn spent with someone (wave 27, relTurn): after the bookkeeper's apply, or on its own when it failed.
      turnTogether(ctx);
      arriveIfLeftBehind(ctx);
      walkOn(ctx);
      // Caught cheating at cards: put out onto the street the narration named (wave 4: not the first exit, the motel).
      if (ctx.gamble && ctx.gamble.caught && s.player.locationId === ctx.location.id) {
        const out = ctx.gamble.outsideId ? State.loc(ctx.gamble.outsideId) : null;
        if (out && !isShut(out)) State.apply({ playerLocationId: out.id });
      }
      // Defeat at 0 HP, from the fight or from the bookkeeper's hpDelta.
      if (s.player.hp <= 0 && !s.player.dead) {
        ctx.defeat = defeat(ctx);
        narration = `${narration}\n\n${ctx.defeat.text}`;
        UI.feed.endNarration(told.node, narration);
        if (ctx.defeat.outcome === 'dead') UI.feed.notice(NOTICES.dead, 'error');
      }
      // Step 10. Advance time; World.tick runs for every phase that passes. A defeat
      // already took its long (and the action's own time is not charged on top); an
      // attack in front of the police ends with a night in the cell (World.arrestPlayer).
      if (!s.player.dead && !ctx.defeat) {
        if (ctx.arrest) {
          const t0 = JSON.stringify(s.time);
          // Told in this narration (ARREST): no due event for the next one.
          World.arrestPlayer({ npcId: ctx.arrest.npcId, locationId: ctx.arrest.locationId, turn: s.meta.turn, told: !!ctx.arrest.plan });
          if (State.current === s && JSON.stringify(s.time) === t0) passTime('rest', 'arrest');
        } else passTime(action.timeCost, opts.cause || 'turn', ctx.shown);
      }
      // Wave 25: someone the story walked in where the player stands is in the scene for the phase the turn lands in (so after its time).
      if (!s.player.dead && !ctx.defeat) noteArrivals(narration, s.player.locationId);
      // Step 11. The due events just narrated are consumed; seeds whose trigger is now met fire and become due events for the next narration.
      if (ctx.due.length) for (const id of (World.dueNarrated(toldDue(ctx)) || {}).revealed || []) UI.feed.quiet(`Added to the map: ${State.loc(id).name}.`);
      World.fireSeeds({ turn: s.meta.turn, time: nowTime(), locationId: s.player.locationId, movedFrom: ctx.moved ? ctx.moved.fromId : ctx.location.id, presentNpcIds: State.npcsAt(s.player.locationId).map(n => n.id), targetIds: action.targets.slice() });
      // Retry lock (SPEC section 7): a roll set or cleared it in resolve().
      // The locks hold for a place and a phase: a move or a new phase
      // clears them (Dice.clearLocks).
      if (s.player.locationId !== startLoc || startTime.phase !== s.time.phase || startTime.day !== s.time.day) Dice.clearLocks();
      // The new day's divider first, then what the night brought (wave 5, playtest Q7 and Q8): the tick's quiet lines, then the morning's news.
      if (!sameTime(narrTime, nowTime())) UI.feed.divider(s.time.day, s.time.phase);
      flushNotices();
      if (morningNews) { morningNews = false; overnightNews(); }
      if (replaced()) return fail(snap, mark, null, {});
      // Step 13. Log; the autosave and render follow when the batch closes.
      const said = isSay(ctx.speech) ? { mode: 'say', to: ctx.speech.to, toName: ctx.speech.toName, toLabel: ctx.speech.toLabel || null } : ctx.speech ? { mode: 'do' } : {};
      const entry = Object.assign({ input: opts.input, roll: rollForLog(ctx.roll), narration, day: narrTime.day, phase: narrTime.phase, mock: told.mock }, said, sameTime(startTime, narrTime) ? {} : { from: { day: startTime.day, phase: startTime.phase } });
      if (notRecorded) entry.changes = 'not recorded';
      // The card table as it ended (wave 10): the feed draws it again after a reload or an /undo.
      if (ctx.cards) entry.cards = ctx.plain ? Object.assign({}, ctx.cards, { plain: true }) : ctx.cards;
      State.apply({ logEntry: entry });
      // The ending has been told: its news is seen now, not before (a failed or stopped ending is told after the next turn).
      // One /undo takes it back with the turn that brought it (wave 5, playtest Q5).
      if (opts.epilogue) { State.apply({ newsSeen: 'ending' }); State.joinSnapshot(snap); }
      lastTurn = { action, parsed: parsedAction, roll: ctx.roll, narration, style: ctx.style, ctx: deepCopy(Object.assign({}, ctx, { packet: undefined })), packet: ctx.packet };
      committed = true;
      // A turn that brought the ending (wave 5, the round-4 playtest): its Resolved lines and its recap wait for the ending's narration, which resolves them.
      if (!opts.epilogue && pendingEpilogue && unseenEnding()) holdForEnding(s, earned, opts.afterCommit ? () => opts.afterCommit(ctx) : null);
      else {
        const held = opts.epilogue && afterEnding && afterEnding.game === s.meta.createdAt ? afterEnding : null;
        progressLines(s, held ? held.earned : earned);
        if (held) { afterEnding = null; if (held.after) { try { held.after(); } catch (e) { console.error(e); } } }
        if (opts.afterCommit) { try { opts.afterCommit(ctx); } catch (e) { console.error(e); } }
      }
      if (opts.epilogue) UI.feed.quiet(NOTICES.epilogueEnd);
      if (notRecorded && !notRecorded.refused && !notRecorded.stopped) {
        const turn = s.meta.turn;
        const keep = deepCopy(Object.assign({}, ctx, { packet: undefined, applied: undefined }));
        later = () => retryBookkeeper(s, turn, notRecorded.packet, keep);
      }
      // The turn is in: autosave and render now; the chronicle runs after, in a batch of its own.
      State.endBatch();
      batchOpen = false;
      // Step 12. Chronicle compression (never fails the turn).
      if (chronicleDue(s)) {
        status('chronicle');
        State.beginBatch();
        batchOpen = true;
        try { await compressIfDue(); } catch (e) { console.warn('[Pipeline] compression failed', e); }
      }
      return { ok: true, defeat: ctx.defeat ? ctx.defeat.outcome : undefined, notRecorded: notRecorded ? true : undefined };
    } catch (err) {
      if (committed) { console.error(err); return { ok: true }; }
      // Another tab took over with the hand open (wave 12, L3: voidHand): the void table stays where it is; nothing here is kept.
      // At the chooser (wave 14, QA #19) nothing was dealt: the turn's lines go, the line goes back in the box, and the notice says why.
      if (err && err.type === 'void' && err.chooser) return fail(snap, mark, { text: NOTICES.chooserVoid }, { reason: 'void', restoreInput: true });
      if (err && err.type === 'void') return fail(snap, UI.feed.mark(), null, { reason: 'void' });
      // Taken back with /undo while the hand was open (wave 16: takeBackHand): nothing played, nothing kept, the line back in the box; /undo says so.
      if (err && err.type === 'undone') return fail(snap, mark, null, { reason: 'undone', restoreInput: true });
      // Stop at the chooser of a turn with no line to put back (wave 15: a resumed turn, or none typed): nothing was dealt, and the box is not said to hold anything.
      if (err && err.type === 'aborted' && err.chooser && (ctx.resume || !String(opts.input || '').trim())) return fail(snap, mark, { text: NOTICES.chooserStopped }, { reason: 'aborted' });
      if (err && err.type === 'aborted') return fail(snap, mark, { text: opts.epilogue ? NOTICES.endingStopped : NOTICES.aborted }, { reason: 'aborted', restoreInput: true });
      console.error(err);
      return fail(snap, mark, { text: opts.epilogue ? NOTICES.endingLater(err instanceof Api.ApiError ? cleanText(err.message, 160).replace(/[.]$/, '') : '') : errorText(err), kind: 'error' }, { reason: 'error', restoreInput: true, error: err && err.type });
    } finally {
      turnState = null;
      // A hand left open (a failure elsewhere) is gone; a /cheat cards the turn did not keep came back with the snapshot.
      hand = null;
      // The turn is over, kept or not: the hand it dealt is no longer on the table (a closed page would have left it: resumeHand). Only this turn's hand (wave 12, L3: another tab may have put its own there since).
      if (handHeld) { Storage.dropHand(handHeld); handHeld = false; }
      if (batchOpen) State.endBatch(); // listeners see the finished turn, or the restored state after a failure
      if (later) later();
      // An ending that could not be told waits for the end of the next turn (not this settle, or it would be tried again at once).
      if (opts.epilogue && !committed) holdEnding = true;
      settle();
    }
  }
  /* The end of a turn (or an arrival or an update): the composer is free,
     then an ending that came up in the news is narrated, else the queued
     input runs. */
  function settle() {
    busy = false;
    acceptsQueue = false;
    UI.setBusy(false);
    // An ending noted earlier that an /undo or a load has since taken back is not told (wave 5, the fourth review's bug 4).
    let ending = pendingEpilogue && unseenEnding() ? pendingEpilogue : null;
    pendingEpilogue = null;
    // An ending still untold (its own turn failed or was stopped last time, or this turn passed no phase): told now.
    if (!ending && !holdEnding && State.current && !State.muted) { const end = unseenEnding(); if (end) ending = { text: cleanText(end.text, 1500), day: end.day }; }
    holdEnding = false;
    // What a turn held for the ending it brought is printed now when that ending is not told now (its turn failed, or it was taken back).
    if (afterEnding && !(ending && State.current && State.current.meta.createdAt === afterEnding.game && !State.muted)) flushAfterEnding();
    if (ending && State.current && !State.muted) epilogue(ending);
    else if (queued) {
      const q = queued;
      queued = null;
      if (State.current && !State.muted) {
        (q.pass ? pass() : submit(q.text, q.opts)).then(r => { if (r && r.restoreInput && q.text) restoreQueued(q.text); }, err => { console.error(err); if (q.text) restoreQueued(q.text); });
      }
    }
    if (!busy) {
      status('idle');
      while (idleWaiters.length) { try { idleWaiters.shift()(); } catch (e) { console.error(e); } }
    }
  }
  /* Held for the ending's narration: the earliest mark (a /cheat time that
     reached the ending, then a turn) and every recap, in order. */
  function holdForEnding(s, earned, after) {
    const prev = afterEnding && afterEnding.game === s.meta.createdAt ? afterEnding : null;
    const both = prev && prev.after && after ? () => { prev.after(); after(); } : (prev && prev.after) || after;
    afterEnding = { game: s.meta.createdAt, earned: prev ? prev.earned : earned, after: both || null };
  }
  function flushAfterEnding() {
    const held = afterEnding;
    afterEnding = null;
    if (!held || !State.current || State.muted || State.current.meta.createdAt !== held.game) return;
    progressLines(State.current, held.earned);
    if (held.after) { try { held.after(); } catch (e) { console.error(e); } }
  }
  /* A queued input that failed goes back in the box, or, when the player
     has typed something since, into a notice ("Your action: …"), so
     nothing is lost (UI.restoreAction, as the queued line's ×). */
  function restoreQueued(text) { UI.restoreAction(text); }
  /* An ending (TOWN_DATA.epilogue, through the news): a narrator-only turn
     in MODE epilogue with the ending as its due event, then a quiet line. */
  function epilogue(item) {
    return runTurn({
      input: '', mode: 'epilogue', bookkeep: false, cause: 'epilogue', epilogue: item, speech: null,
      action: () => ({ actionType: 'wait', summary: `${State.current.player.name} is there as this part of the story ends`, targets: [], needsRoll: false, timeCost: 'instant' })
    });
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
    /* Wave 27 (the integration plan's 9.6): what the fact says about how they
       stand with the player was so before the player came (relStart, never
       spark or fear): "owes me" a favour owed, "go back" or "old friend"
       knows-you at least 30, "trusts me" trust +15 (to 40 at most), "likes
       me" liking +10 (to 40 at most). The memory itself is a fact: kept,
       moving nothing, never a grudge. */
    const said = Rel.factOf(statement);
    const starts = npcIds.map(id => {
      const c = Rel.tracksOf(State.npc(id));
      const x = { npcId: id, why: statement };
      if (said.owed) x.owed = 1;
      if (said.knows) x.k = said.knows;
      if (said.trust) x.t = clamp(40 - c.t, 0, said.trust);
      if (said.liking) x.w = clamp(40 - c.w, 0, said.liking);
      return x;
    }).filter(x => x.owed || x.k || x.t || x.w);
    State.apply(Object.assign({
      storyPointsDelta: -1,
      newMemories: npcIds.map(id => ({ npcId: id, text: memory, weight: 3, event: 'noted' })),
      npcKnownToPlayer: npcIds,
      journalEntry: `Fact: ${statement}`
    }, starts.length ? { relStart: starts } : {}));
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
    const ro = readOnlyRefusal();
    if (ro) return ro;
    const want = wantedOutcome(arg);
    if (String(arg || '').trim() && want === null) { UI.feed.notice('Say which outcome: success, partial, fail, crit, fumble, or a number from 1 to 20.'); return { ok: false, reason: 'usage', restoreInput: true }; }
    const s = State.current;
    const entry = s && s.log.length ? s.log[s.log.length - 1] : null;
    const last = lastTurn;
    // A hand at cards (wave 11, L5): with no catch roll the cards were dealt, and there is nothing to redo.
    // A hand the win cheat ended (wave 14, QA #12): it was the player's; the cheat stays spent (only /undo arms it again).
    const dealtNote = entry && isObj(entry.cards) && !entry.roll ? (entry.cards.win ? NOTICES.cardsWon : NOTICES.cardsDealt) : null;
    if (!entry || !entry.roll || !last || !last.action || !last.action.needsRoll || (last.ctx && last.ctx.mode === 'arrival')) {
      if (want !== null) {
        hooks.nextTier = want;
        UI.feed.notice(`${dealtNote ? `${dealtNote} ` : ''}Cheat armed: your next roll will be ${Number.isInteger(want) ? 'a ' + want : /^(fail|failure|lose)$/.test(want) ? 'a failure' : /^(crit|critical|nat20)$/.test(want) ? 'a natural 20' : /^(fumble|botch|nat1)$/.test(want) ? 'a natural 1' : /^partial$/.test(want) ? 'a partial success' : 'a success'}.`);
        return { ok: true };
      }
      UI.feed.notice(dealtNote || NOTICES.noReroll);
      return { ok: false, reason: 'no-roll' };
    }
    if (want !== null) hooks.nextTier = want;
    const input = entry.input;
    const speech = entry.mode === 'say' ? { mode: 'say', to: entry.to, toName: entry.toName, toLabel: entry.toLabel || null } : (entry.mode === 'do' ? { mode: 'do' } : null);
    const mode = last.ctx && last.ctx.mode === 'zoom' ? 'zoom' : 'normal';
    // The hand as it was played (wave 11, L5): replayed from its record, only the marked deck's catch rolled again.
    const replayCards = isObj(entry.cards) ? deepCopy(entry.cards) : null;
    const armed = cheatArmed();
    const winning = winArmed();
    if (!State.restore()) { UI.feed.notice('There is nothing to take back, so nothing to reroll.'); return { ok: false, reason: 'nothing' }; }
    keepCheat(armed);
    keepWin(winning);
    World.forget(State.current.meta.turn);
    hooks.diceSalt = (hooks.diceSalt || 0) + 1;
    UI.rebuildFeed();
    // "/cheat success" says so; a plain /reroll says it rolled again.
    const said = want === null ? 'Rerolled.' : `Cheat: ${Number.isInteger(want) ? want : String(want).toLowerCase()}`;
    // The action as it was parsed: the turn's own steps (a walk, a thing looked for) run again from the restored state.
    return runTurn({ input, mode, speech, action: deepCopy(last.parsed || last.action), reroll: true, replayCards, prepare: () => UI.feed.quiet(said) });
  }

  /* While the bookkeeper or the chronicle runs after a narration
     (acceptsQueue), one input waits and runs when the turn ends:
     { ok: true, queued: true }. Otherwise a running turn refuses it. */
  /* A betting word typed with no hand open, just after a hand at this
     table (wave 19, QA D12: "all in" typed a moment late dealt a new hand
     for all the cash): a bare "all in", "shove", "bet 10", "raise 30",
     "call", "check", "fold" (the forms typedBet reads, a bare amount
     aside, which is a stake) when the newest log entry is a hand at the
     dealer here, today. Words that name the game, the hand, the table or
     the dealer ("I go all in at cards", "all in, Curtis") are no bare
     betting word, and after any other turn the sit-down phrases keep
     their meaning. Returns the notice's words, or null. */
  const BETWEEN_TABLE = Object.freeze({ options: ['call', 'raise', 'fold'], ask: { toCall: 1, level: 1, put: 0, left: 99, pot: 3, minTo: 2, maxTo: 99, unit: 1, raises: 1, limit: false }, dealerName: 'The dealer' });
  function betweenHands(text, speech) {
    const s = State.current;
    const e = s && s.log.length ? s.log[s.log.length - 1] : null;
    if (!e || !isObj(e.cards) || e.day !== s.time.day) return null;
    if (isSay(speech) && speech.to && speech.to !== 'everyone' && speech.to !== e.cards.dealerId) return null;
    const dealer = dealerOf(State.npcsAt(s.player.locationId).map(n => n.id));
    if (!dealer || dealer.id !== e.cards.dealerId) return null;
    if (!betWord(text)) return null;
    return `No hand is on the table. 'Another hand' or 'deal me in for ${money(e.cards.stake | 0 || 20)}' starts one.`;
  }
  /* A move typedBet reads (against a stand-in table facing a bet), a bare amount aside, which is a stake (wave 19; wave 20: the demo's sit-down with the dealer or the table named reads it too). */
  function betWord(text) {
    const t = String(text || '').trim();
    if (/^\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:dollars?|bucks?)?[.!?]*$/i.test(t)) return false;
    return typedBet(t, BETWEEN_TABLE) !== null;
  }
  async function submit(rawText, opts) {
    const text = String(rawText || '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    if (busy) {
      if (acceptsQueue && !queued) { queued = { text, opts: opts ? Object.assign({}, opts) : null }; return { ok: true, queued: true }; }
      return { ok: false, reason: 'busy', restoreInput: true };
    }
    if (!State.current) return { ok: false, reason: 'no game' };
    // Step 2. Commands are handled in code (some of them run a turn below; each of those refuses in a read-only tab itself).
    if (text.startsWith('/')) return Commands.run(text);
    const ro = readOnlyRefusal();
    if (ro) return ro;
    if (State.current.player.dead) { UI.feed.notice(NOTICES.dead); return { ok: false, reason: 'dead' }; }
    const speech = speechFor(text, opts);
    // Betting words just after a hand (wave 19, QA D12): a notice, the line kept in the box, no turn.
    const noHand = betweenHands(isSay(speech) ? speech.words : text, speech);
    if (noHand) { UI.feed.notice(noHand); return { ok: false, reason: 'no-hand', restoreInput: true }; }
    if (isSay(speech)) return runTurn({ input: speech.words, mode: 'normal', speech: { mode: 'say', to: speech.to, toName: speech.toName, toLabel: speech.toLabel || null } });
    return runTurn({ input: text, mode: 'normal', speech: { mode: 'do' } });
  }
  /* A beat: the player says and does nothing and lets the scene come to them.
     Costs a short (a few minutes); the people here act, speak or react.
     Pressed while the bookkeeper runs, it waits in the queue like a line. */
  function pass() {
    const ro = readOnlyRefusal();
    if (ro) return Promise.resolve(ro);
    if (busy) {
      if (acceptsQueue && !queued) { queued = { pass: true, text: '' }; return Promise.resolve({ ok: true, queued: true }); }
      return Promise.resolve({ ok: false, reason: 'busy' });
    }
    return runTurn({
      input: 'You wait and see.', mode: 'normal', beat: true, speech: { mode: 'do' },
      action: () => {
        const st = State.current;
        const ids = State.npcsAt(st.player.locationId).map(n => n.id);
        return { actionType: 'wait', summary: `${st.player.name} says nothing and waits to see what ${ids.length ? 'the people here do' : 'happens'}`, targets: ids, needsRoll: false, timeCost: 'short', declaresWorldFact: false };
      }
    });
  }
  /* /look, /rest, /wait and /skip have no bookkeeper of their own (bookkeep:
     false), but one runs when a due event was narrated, so what it did is
     recorded (runTurn). */
  function look() {
    return runTurn({ input: '/look', mode: 'zoom', bookkeep: false, action: () => ({ actionType: 'look', summary: `${State.current.player.name} takes in the whole scene`, targets: [], needsRoll: false, timeCost: 'instant' }) });
  }
  function zoom(text) { return runTurn({ input: `/zoom ${text}`, parse: text, mode: 'zoom', speech: { mode: 'do' } }); }
  /* A question or a how-to is not a fact (wave 23: the owner typed "/fact how to seduce Jodie" and it became a "fact" on her
     card): refused at no cost, with what /fact is for. */
  const NOT_A_FACT = /^(?:how|what|why|when|where|who|whom|which|can|could|should|would|is|are|am|do|does|did|will|tell me|any way|anyway)\b|\?\s*$/i;
  function fact(statement) {
    if (State.current.player.storyPoints < 1) {
      UI.feed.notice('You have no story points to spend. You earn them when a thread is resolved or on a natural 20.');
      return { ok: false, reason: 'no-points', restoreInput: true };
    }
    if (NOT_A_FACT.test(String(statement).trim())) {
      UI.feed.notice('A fact is a statement to make true, not a question: /fact Jodie grew up in Clayburn, or /fact the mechanic owes me a favour. To find something out, ask someone in the story ("I ask Royce what he knows about Jodie").');
      return { ok: false, reason: 'not-a-fact', restoreInput: true };
    }
    return runTurn({ input: `/fact ${statement}`, parse: statement, fact: statement, mode: 'normal' });
  }
  /* A place shut today where the player slept (wave 4, playtest R11): who
     is about, read when the packet is built, after the due events brought
     anyone: those who live there, and whoever came to find the player. */
  function shutHereLine(ctx) {
    const sh = ctx && ctx.shutHere;
    const l = sh ? State.loc(sh.locationId) : null;
    if (!l || State.current.player.locationId !== l.id) return '';
    const came = State.npcsAt(l.id).filter(n => !(isObj(n.home) && n.home.locationId === l.id)).map(n => n.name);
    return `; ${placeName(l)} is shut today (${sh.why}), and nobody who does not live here is about${came.length ? ` but ${andList(came)}, come to find the player` : ''}`;
  }
  /* After a night's sleep the recap (where you are, what is open) follows the narration. */
  function rest() {
    return runTurn({
      input: '/rest', mode: 'normal', bookkeep: false, cause: 'rest',
      prepare: ctx => {
        const t = passTime('rest', 'rest');
        // Two nights running rough in a public place: the police move them on in the morning (wave 4), told in this narration.
        if (t) World.sleptRough(t.quality);
        // A place shut today (they slept where they should not be): the morning says so (playtest B14).
        // Why it is shut, in words (wave 3, playtest N8: never "(true)").
        const shut = shutReason(here());
        ctx.timePassed = `the player slept until morning, Day ${State.current.time.day}${t && t.healed ? `, and recovered ${t.healed} HP` : ''}${t && t.quality === 'rough' ? ', sleeping rough' : ''}`;
        // Who is about is said once the due events have brought anyone (wave 4, playtest R11): the packet's TIME PASSED.
        if (shut) ctx.shutHere = { locationId: here().id, why: shut };
      },
      afterCommit: () => printRecap({ brief: true }),
      action: () => ({ actionType: 'rest', summary: `${State.current.player.name} wakes after a night's sleep`, targets: [], needsRoll: false, timeCost: 'instant' })
    });
  }
  /* The last long of a wait or a skip lands at the start of its phase
     (REVIEW E5): the next short action does not tick the world again. */
  const TO_PHASE_START = Object.freeze({ cost: 'long', toPhaseStart: true });
  function wait(arg) {
    const phase = phaseWord(arg);
    if (!phase) { UI.feed.notice('Wait until when? Try /wait evening (morning, afternoon, evening or night).'); return { ok: false, reason: 'usage', restoreInput: true }; }
    if (phase === State.current.time.phase) { UI.feed.notice(`It is already ${phase}.`); return { ok: false, reason: 'same-phase' }; }
    return runTurn({
      input: `/wait ${arg}`, mode: 'normal', bookkeep: false, cause: 'wait',
      prepare: ctx => {
        const n = phaseSteps(phase);
        for (let i = 0; i < n; i++) passTime(i === n - 1 ? Object.assign({}, TO_PHASE_START) : 'long', 'wait');
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
    if (!g.location && g.phase === s.time.phase) { UI.feed.notice(`It is already ${g.phase}.`); return { ok: false, reason: 'same-phase' }; }
    if (g.location && g.location.id === s.player.locationId && (!g.phase || g.phase === s.time.phase)) {
      UI.feed.notice(`You are already at ${placeName(g.location)}.`);
      return { ok: false, reason: 'already-there' };
    }
    // The day the player gets there (a phase past night is tomorrow): a place shut that day (closed, closed on that weekday, or barred to them) is a shut door, as for a walk (shutReason).
    const steps = g.phase ? phaseSteps(g.phase) : 0;
    const arrivalDay = s.time.day + (g.phase && PHASES.indexOf(s.time.phase) + steps >= PHASES.length ? 1 : 0);
    const shutThen = g.location && g.location.id !== s.player.locationId ? shutReason(g.location, arrivalDay) : null;
    if (shutThen) { const ban = State.isBanned(g.location.id, arrivalDay); UI.feed.notice(ban ? `You are not welcome at ${placeName(g.location)} until Day ${banBackDay(ban)}.` : `${capFirst(placeName(g.location))} is shut then (${shutThen}).`); return { ok: false, reason: State.isBanned(g.location.id, arrivalDay) ? 'banned' : 'closed', restoreInput: true }; }
    // Open then but shut now (the night before it opens): wait first and walk over when it opens.
    const waitFirst = !!(g.location && g.location.id !== s.player.locationId && isShut(g.location));
    // Already there (with a phase to skip to): the player stays and waits, so the narration is no arrival (wave 3).
    const stays = !g.location || g.location.id === s.player.locationId;
    return runTurn({
      input: `/skip ${goal}`, mode: stays ? 'normal' : 'arrival', bookkeep: false, cause: 'skip',
      prepare: ctx => {
        // The player goes there and waits there, so a town event at that place (the council meeting) happens in front of them.
        if (g.location && !waitFirst) State.apply({ playerLocationId: g.location.id });
        if (!g.phase) passTime('short', 'skip');
        for (let i = 0; i < steps; i++) passTime(i === steps - 1 ? Object.assign({}, TO_PHASE_START) : 'long', 'skip');
        if (g.location && waitFirst) State.apply({ playerLocationId: g.location.id });
        const st = State.current;
        ctx.timePassed = `the player skipped ahead to ${here().name}, ${st.time.phase} of day ${st.time.day}`;
      },
      action: () => (stays ? { actionType: 'wait', summary: `${State.current.player.name} stays at ${here().name} until ${State.current.time.phase}`, targets: [], needsRoll: false, timeCost: 'instant' }
        : { actionType: 'move', summary: `${State.current.player.name} arrives at ${here().name}`, targets: [], needsRoll: false, timeCost: 'instant' })
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
    if (readOnlyRefusal()) return { ok: false, reason: 'read-only' };
    busy = true;
    acceptsQueue = false;
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
        scene(ctx);
        ctx.due = World.dueSeeds({ turn: s.meta.turn, time: nowTime(), locationId: ctx.location.id, presentNpcIds: ctx.presentIds, targetIds: [], mode: 'arrival' }) || [];
        if (ctx.due.length) scene(ctx);
        status('narrate');
        const told = await narrate(ctx);
        if (State.current !== s) return { ok: false, reason: 'replaced' };
        if (told.refusal) notice = { text: NOTICES.refused };
        else { narration = told.narration; mock = told.mock; if (ctx.due.length) World.dueNarrated(toldDue(ctx)); if (s.pendingScene) State.apply({ sceneChangeDone: true }); }
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
      settle();
    }
  }
  /* /cheat time <phase> [day] (also /cheat night, /cheat morning 2): the
     clock set outright through State.apply({ setTime }), at the start of
     that phase (shorts 0), the day unchanged unless given. No world tick
     and no narration; the feed shows the new day and phase and a quiet
     line. One /undo step (nothing is kept when the clock is already there). */
  function setClock(phase, dayArg) {
    const ro = readOnlyRefusal();
    if (ro) return ro;
    const s = State.current;
    if (!PHASES.includes(phase)) { UI.feed.notice('Set the clock to which phase? Try /cheat time night (morning, afternoon, evening or night), or /cheat morning 2 for a day too.'); return { ok: false, reason: 'usage', restoreInput: true }; }
    const day = dayArg === undefined || dayArg === null ? s.time.day : dayArg;
    if (!Number.isInteger(day) || day < 1) { UI.feed.notice('The day must be 1 or more.'); return { ok: false, reason: 'usage', restoreInput: true }; }
    // Wave 21: the clock may go back too (the owner, with a scene the clock had left behind: "I can't talk to Jodie now cz the clock
    // moved forward by itself?"). Nothing is caught up on the way back and nothing already told is untold: the news and the seeds
    // that fired stay fired, a missed obligation stays missed. Wave 6 had refused this (the round-5 playtest's R8).
    const backwards = day < s.time.day || (day === s.time.day && PHASES.indexOf(phase) < PHASES.indexOf(s.time.phase));
    const from = { day: s.time.day, phase: s.time.phase };
    const snap = State.snapshot();
    const earned = progressMark(s);
    const r = State.apply({ setTime: { day, phase, shorts: 0, late: false } });
    if (r.rejected.length) { State.restore(snap); UI.feed.notice(`The clock was not changed: ${r.rejected[0].reason}.`); return { ok: false, reason: 'rejected' }; }
    if (JSON.stringify(State.current) === snap) { State.restore(snap); UI.feed.notice(`The clock is already at Day ${day} · ${capFirst(phase)}.`); return { ok: false, reason: 'same-time' }; }
    UI.feed.divider(day, phase);
    if (backwards) {
      UI.feed.quiet(`Clock set back to Day ${day} · ${capFirst(phase)}. What has already happened stays in the story.`);
      return { ok: true };
    }
    UI.feed.quiet(`Clock set to Day ${day} · ${capFirst(phase)}.`);
    // A town event the clock jumped past happens now, as news of its own day (wave 4, the playtest's design note: not at the next tick, two days late).
    // Wave 5 (the round-4 QA): with the seeds of the days it passed, in the order they would have come, each dated to its own day.
    // One whose place the player is at as the clock lands on it happens in front of them instead (the next narration's scene; the fourth review's risk).
    // Wave 6 (the round-5 playtest's R2): in the order it happened, a line for each day: the town's seeds and events it passed ("Meanwhile in town, Day 4: …"), and what each morning did (a missed obligation, a condition over).
    const fired = (World.catchUp({ day, phase, from }) || []).filter(f => f && f.id !== 'epilogue');
    const events = fired.filter(f => !f.seed && !f.morning);
    const lines = [];
    const meanwhile = (d, text) => {
      const last = lines[lines.length - 1];
      if (last && last.day === d && last.meanwhile) last.texts.push(text); else lines.push({ day: d, meanwhile: true, texts: [text] });
    };
    for (const f of fired) {
      if (f.morning) lines.push({ day: f.day, text: f.notice });
      else if (f.seed) { if (f.text) meanwhile(f.day, cleanText(f.text, 300)); }
      else if (!f.here) for (const n of State.news.filter(x => isObj(x) && x.public !== false && !x.seen && x.eventId === f.id)) meanwhile(n.day, cleanText(n.text, 300));
    }
    // A thread what the jump brought resolved (the council): its Resolved line now, under the "Meanwhile in town" line that told it (wave 6: what the
    // ending itself resolves is held by the engine until its narration, which prints it). Never held for the ending here (the wave-6 integration,
    // the fifth review's /cheat risk): one /undo of the turn that told the ending would lose the line of a gain the jump kept.
    // Wave 8 (the final pass): under its own day's lines, not after the last day's. The day of each: what a step earned as it fired (catchUp's
    // prog), and an event's held reward (rewardHeld), released by its news now, its event's day.
    const prog = () => (Array.isArray(State.current.player.progression) ? State.current.player.progression : []);
    const dayOf = new Map();
    let k = earned.n;
    for (const f of fired) for (; Number.isInteger(f.prog) && k < f.prog; k++) dayOf.set(k, f.day);
    const heldDay = new Map();
    for (const f of events) if (!f.here) for (const t of State.current.threads) if (isObj(t) && t.rewardHeld === f.id) heldDay.set(t.id, f.day);
    const n0 = prog().length;
    for (const f of events) if (!f.here) State.apply({ newsSeen: { eventId: f.id } });
    noteEnding();
    prog().forEach((x, i) => { if (i >= n0 && isObj(x) && heldDay.has(x.threadId)) dayOf.set(i, heldDay.get(x.threadId)); });
    const fresh = prog().map((x, i) => ({ x, i })).slice(earned.n);
    const shown = new Set();
    const resolved = d => {
      for (const r of fresh) {
        if (shown.has(r.i) || (d !== null && dayOf.get(r.i) !== d)) continue;
        shown.add(r.i);
        UI.feed.quiet(resolvedText(r.x, isObj(r.x) ? gainText(r.x.gain) : ''));
      }
    };
    lines.forEach((x, i) => {
      UI.feed.quiet(x.meanwhile ? `Meanwhile in town, Day ${x.day}: ${x.texts.join(' ')}` : x.text);
      if (!lines[i + 1] || lines[i + 1].day !== x.day) resolved(x.day);
    });
    resolved(null);
    return { ok: true, time: deepCopy(State.current.time), events: events.map(f => f.id), seeds: fired.filter(f => f.seed).map(f => f.id) };
  }
  /* Bring the loaded game up to the current rules (Upgrade.pending: the
     steps newer than the game, or at the current version the ones that
     re-read it). Like a turn: the composer is busy, the feed says what is
     happening, and it is all one State batch (one autosave, one render)
     after one snapshot, which stays as an /undo step when something changed.
     A refusal or an error restores the state exactly and the feed says why;
     the API's own words are in the debug view. Resolves to { ok, summaries,
     from, to, changed } or { ok: false, reason }. */
  /* Each step is stamped (rulesVersion) as it completes and has a private
     snapshot of its own, the game's copy of the town included, so a step
     that fails or is refused is taken back alone: the steps before it stay
     (their paid calls are not thrown away) and the feed says which were
     kept. The whole update is still one /undo step. A save from a newer
     build is never updated here. */
  function townJson() { return State.town ? JSON.stringify(State.town) : null; }
  function restoreTown(json) {
    const t = State.town;
    if (!t || json === null) return;
    for (const k of Object.keys(t)) delete t[k];
    Object.assign(t, JSON.parse(json));
  }
  async function updateGame() {
    const s = State.current;
    if (!s || State.muted) return { ok: false, reason: 'no game' };
    if (busy) return { ok: false, reason: 'busy' };
    if (Upgrade.newer(s)) { UI.feed.notice(Upgrade.NOTICES.newer); return { ok: false, reason: 'newer' }; }
    busy = true;
    acceptsQueue = false;
    UI.setBusy(true);
    Api.beginTurn();
    const from = State.rulesVersion(s);
    const steps = Upgrade.pending(s);
    const clock0 = { day: s.time.day, phase: s.time.phase };
    UI.feed.notice(Upgrade.NOTICES.start);
    const snap = State.snapshot();
    const town0 = townJson();
    State.beginBatch();
    turnState = s;
    const summaries = [];
    let step = null;
    try {
      for (const m of steps) {
        step = { m, state: JSON.stringify(State.current), town: townJson() };
        const sum = await m.run(s, Api);
        if (State.current !== s) return { ok: false, reason: 'replaced' };
        const r = State.apply({ rulesVersion: Math.max(m.version, State.rulesVersion(s)) });
        if (r.rejected.length) throw new Error(r.rejected[0].reason);
        summaries.push(Object.assign({ version: m.version, title: m.title }, sum));
        step = null;
      }
      const to = State.rulesVersion(State.current);
      const text = summaries.map(x => x.text).join(' ');
      // Nothing changed (a re-read that kept every line): not worth an /undo step.
      const changed = JSON.stringify(State.current) !== snap || townJson() !== town0;
      if (!changed) State.restore(snap);
      State.pushDebug({ turn: State.current.meta.turn, kind: 'upgrade', reason: `rules ${from} -> ${to}: ${text}` });
      UI.feed.notice(text);
      // The clock was set back (version 4): the feed starts the new day and phase.
      const t = State.current.time;
      if (t.day !== clock0.day || t.phase !== clock0.phase) UI.feed.divider(t.day, t.phase);
      return { ok: true, summaries, from, to, changed };
    } catch (err) {
      if (State.current !== s) return { ok: false, reason: 'replaced' };
      // Only the failed step is taken back; with nothing done before it, the whole update (and its /undo step) goes.
      if (summaries.length && step) { State.restore(step.state); restoreTown(step.town); }
      else { State.restore(snap); restoreTown(town0); }
      const kept = summaries.length ? ` ${Upgrade.NOTICES.kept(summaries.map(x => x.title))} ${summaries.map(x => x.text).join(' ')}` : '';
      if (summaries.length) State.pushDebug({ turn: State.current.meta.turn, kind: 'upgrade', reason: `rules ${from} -> ${State.rulesVersion(State.current)} (kept ${summaries.map(x => x.version).join(', ')}): ${summaries.map(x => x.text).join(' ')}` });
      if (err && err.refused) {
        State.pushDebug({ turn: State.current.meta.turn, kind: 'upgrade', reason: `refused${err.refusal && err.refusal.category ? ` (${err.refusal.category})` : ''}${step ? ` at version ${step.m.version}` : ''}` });
        UI.feed.notice(summaries.length ? `${Upgrade.NOTICES.refusedStep(step ? step.m.title : '')}${kept}` : Upgrade.NOTICES.refused);
        return { ok: false, reason: 'refused', kept: summaries.map(x => x.version) };
      }
      if (!(err && err.type === 'aborted')) console.error(err);
      State.pushDebug({ turn: State.current.meta.turn, kind: 'upgrade', reason: `failed: ${(err && (err.type ? `${err.type}: ` : '') + (err.detail || err.message)) || err}${step ? ` (at version ${step.m.version})` : ''}` });
      const msg = err instanceof Api.ApiError ? err.message : `Something went wrong: ${(err && err.message) || err}.`;
      UI.feed.notice(summaries.length ? `${msg} ${Upgrade.NOTICES.failedStep(step ? step.m.title : '')}${kept}` : `${msg} ${Upgrade.NOTICES.failed}`, 'error');
      return { ok: false, reason: 'error', error: err && err.type, kept: summaries.map(x => x.version) };
    } finally {
      turnState = null;
      State.endBatch();
      settle();
    }
  }

  // ----- /recap -----
  /* Built from the state alone, no API call: where and when, who is here,
     the open threads with the last thing known, open obligations with how
     long is left, who is warm or cold and why (attitude and their latest
     memory), the last rumours heard and the latest town news. /recap prints
     it; /rest and Continue show it too (recapText). */
  function placeName(l) { return l ? String(l.name).replace(/^The /, 'the ') : 'nowhere'; }
  function tryCall(fn) { try { return fn(); } catch (e) { return null; } }
  function obligationLine(o, day) {
    const n = o.npcId ? State.npc(o.npcId) : null;
    const who = n ? n.name : 'someone';
    const owed = Number.isFinite(o.amount) ? o.amount - (o.paid | 0) : null;
    // Part payments for any obligation with an amount (wave 4, playtest R8: blackmail too), as the Journal shows them.
    const part = owed !== null && o.paid > 0 ? ` (${money(o.paid)} of ${money(o.amount)} paid)` : '';
    const what = o.kind === 'debt' ? `You owe ${who}${owed !== null ? ` ${money(owed)}${part}` : ''}`
      : `${capFirst(o.kind || 'promise')} for ${who}${o.text ? `: ${lowerFirst(cutWords(o.text, 120)).replace(/\.$/, '')}` : ''}${part}`;
    // The Journal's form (wave 3): "missed Day 7, still owed". Wave 29: lapsed, "dropped" (it can no longer be).
    if (o.status === 'missed') return `${what} · missed Day ${o.dueDay}, still owed`;
    if (o.status === 'lapsed') return `${what} · dropped`;
    if (!Number.isInteger(o.dueDay)) return what;
    const left = o.dueDay - day;
    const when = left > 1 ? `${left} days` : left === 1 ? '1 day' : left === 0 ? 'today' : 'overdue';
    return `${what} · due Day ${o.dueDay} (${when})`;
  }
  /* Text cut to n characters at a word boundary, with "…" when it was cut (playtest B20). */
  function cutWords(text, n) {
    const t = cleanText(String(text || ''), 4000);
    if (t.length <= n) return t;
    const head = t.slice(0, n);
    const i = head.lastIndexOf(' ');
    return `${(i > n * 0.5 ? head.slice(0, i) : head).replace(/[\s,;:.—–-]+$/, '')}…`;
  }
  /* Why someone is warm or cold, in a few plain words for the recap: for
     someone tied to one of the player's loose ends "your loose end: a debt"
     (either side); otherwise their newest memory of weight 2 or more whose
     sense fits the side (side 'warm': a good one, side 'cold': a bad one;
     wave 3: never "Warm to you: ... remembers you insulted him"), after
     "remembers ", the player's name read as "you" and the person's "me" as
     him, her or them ("remembers you called him a liar", "remembers he saw
     you hit Royce Pittman"); else nothing. Never the raw memory. The verb
     after "you" and after the person's "I" agrees ("you were", "you
     have", "he thinks"; never "you was", "he think"). */
  const PRESENT_VERB = { is: 'are', was: 'were', has: 'have', owes: 'owe', says: 'say', claims: 'claim', wants: 'want', knows: 'know', works: 'work', lives: 'live', does: 'do', goes: 'go', calls: 'call', keeps: 'keep', seems: 'seem', drinks: 'drink', plays: 'play', thinks: 'think', looks: 'look', needs: 'need', runs: 'run', talks: 'talk', asks: 'ask', "doesn't": "don't", "hasn't": "haven't", "wasn't": "weren't", "isn't": "aren't" };
  // The person's own "I <verb>" told as "he <verb>s" (a they keeps the plain form; "I am" is "they are").
  const FIRST_VERB = { am: 'is', have: 'has', do: 'does', "don't": "doesn't", "haven't": "hasn't", go: 'goes', guess: 'guesses', wish: 'wishes', think: 'thinks', know: 'knows', want: 'wants', figure: 'figures', reckon: 'reckons', believe: 'believes', hope: 'hopes', need: 'needs', like: 'likes', trust: 'trusts', owe: 'owes', say: 'says', hate: 'hates', love: 'loves', mean: 'means', see: 'sees', hear: 'hears', feel: 'feels', bet: 'bets', swear: 'swears', doubt: 'doubts', suppose: 'supposes', remember: 'remembers', expect: 'expects', heard: 'heard', saw: 'saw', was: 'was' };
  const PRONOUN_FORMS = { he: { subj: 'he', obj: 'him', pos: 'his', self: 'himself' }, she: { subj: 'she', obj: 'her', pos: 'her', self: 'herself' }, they: { subj: 'they', obj: 'them', pos: 'their', self: 'themselves' } };
  /* The sense of a memory, for the side it is told on: -1 a grievance, 1 a
     kindness, 0 neither. A grievance word wins ("never paid", "would not
     pay"). */
  const MEMORY_BAD = /\b(insult\w*|attack\w*|threat\w*|hit|hits|punch\w*|slap\w*|shov\w*|knock\w*|beat|beaten|fight|fought|stole|steal\w*|rob\w*|cheat\w*|lie|lied|lies|liar|lying|welsh\w*|swindl\w*|cop|cops|police|report\w*|arrest\w*|locked|spit|spat|curs\w*|yell\w*|mock\w*|laugh\w* at|called me|told me to|never|would not|wouldn't|refus\w*|past due|late|let .* go|broke|broken|hurt|hurts|threw|thrown|banned|mean|rude|nasty|trouble|creep|hiding|blackmail\w*|accus\w*|caught|sneak\w*|snoop\w*|dragged|ignored|embarrass\w*|humiliat\w*|wrong\w*|owes? me)\b/i;
  const MEMORY_GOOD = /\b(help\w*|fix\w*|paid|pays|repaid|gave|given|brought|bought|saved|thank\w*|kind\w*|good for|trust\w*|kept|stood up|apologi[sz]\w*|sorry|came around|friend\w*|look\w* out for|listened|backed|defended|tipped|shared|warned|returned|honest|straight with|did right|treated)\b/i;
  function memorySense(text) {
    const t = String(text || '');
    if (MEMORY_BAD.test(t)) return -1;
    return MEMORY_GOOD.test(t) ? 1 : 0;
  }
  /* Wave 30 (the integration plan's 10.5): a memory in the player's words,
     the turning code the recap's reason had (recapGroups gives the recap
     its reasons now), on its own. The player's name is
     "you" with the verb that goes with it ("you were", "you have"), the
     person's "I", "me" and "my" are him, her or them with agreeing verbs
     ("he thinks"); a line about what the player did to them ("called me a
     liar") is "you called him a liar", one about what they did ("caught
     Tester in my truck's cab", "saw Tester hit Dewayne") is "he caught you
     in his truck's cab", "she saw you hit Dewayne". Witness and secondhand
     lines are already in SECONDHAND_TEXT's words. No "remembers", no full
     stop; '' for nothing. */
  // The kinds of memory where the person, not the player, did the thing (turnMemory).
  const PERSON_ACTS = Object.freeze(['they_helped', 'they_confided', 'caught_you_at', 'told_anyway', 'learned_secret']);
  function turnMemory(n, m, player) {
    const pName = typeof player === 'string' ? player : isObj(player) ? player.name : State.current ? State.current.player.name : '';
    const pr = PRONOUN_FORMS[isObj(n) ? n.pronouns : ''] || PRONOUN_FORMS.they;
    // The player's name, then the bare "the player" a line may use for them (as the People card reads it).
    const names = [pName].concat(String(pName || '').split(/\s+/).filter(w => w.length >= 3)).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).concat(['[Tt]he player']);
    // Curly apostrophes read as straight ones (wave 5, the fourth review's bug 7): "I’m sure" is "she's sure" too, "Tester’s" is "your".
    let t = cleanText(String((isObj(m) ? m.text : m) || ''), 300).replace(/[‘’]/g, "'").replace(/[.!]+$/, '').replace(/^Fact \(a story point\):\s*/i, '');
    if (!t) return '';
    // The player named as the one doing something: "you" with the verb that goes with it ("you were", "you have").
    const youVerb = (all, v) => `you ${PRESENT_VERB[v.toLowerCase()] || v}`;
    const named = names.some(nm => new RegExp(`\\b${nm}\\b`).test(t));
    for (const nm of names) {
      t = t.replace(new RegExp(`\\b${nm}'s\\b`, 'g'), 'your');
      t = t.replace(new RegExp(`\\b${nm}\\s+([A-Za-z']+)\\b`, 'g'), youVerb);
      t = t.replace(new RegExp(`\\b${nm}\\b`, 'g'), 'you');
    }
    // Wave 30: in their words a line that never names the player calls them "them" ("kept quiet about what I told them"): "you". A line that names the player keeps its "them" (someone else); "they never came" after the name is the player's.
    const toYouWords = x => x.replace(/\bthey\b/g, 'you').replace(/\bthem\b/g, 'you').replace(/\btheir\b/g, 'your').replace(/\bthemselves\b/g, 'yourself');
    if (!named) t = toYouWords(t);
    // The engine's own lines (act own: "found Tester sleeping rough ... and told them to move along") write "them" for the player after the name.
    else if (isObj(m) && m.act === 'own') t = t.replace(/^(.*?\byou(?:r)?\b)([\s\S]*)$/, (all, a, b) => a + toYouWords(b));
    else t = t.replace(/\band they never came\b/g, 'and you never came');
    const mine = /\b(me|my|myself|I)\b/.test(t);
    // Their "I think" is "he thinks" (or "they think"): the verb after the swapped "I" agrees.
    const iVerb = (all, v) => {
      const w = v.toLowerCase();
      if (pr.subj === 'they') return `they ${w === 'am' ? 'are' : w === 'was' ? 'were' : v}`;
      return `${pr.subj} ${FIRST_VERB[w] || v}`;
    };
    // "I'm", "I've", "I'd", "I'll" first (wave 4, the third review's bug 7: never "she'm sure").
    const iContraction = (all, c) => {
      const k = c.toLowerCase();
      if (pr.subj === 'they') return `they${{ m: "'re", ve: "'ve", d: "'d", ll: "'ll" }[k]}`;
      return `${pr.subj}${{ m: "'s", ve: "'s", d: "'d", ll: "'ll" }[k]}`;
    };
    const swap = x => x.replace(/\bI'(m|ve|d|ll)\b/gi, iContraction).replace(/\bI\s+([A-Za-z']+)\b/g, iVerb).replace(/\bmyself\b/g, pr.self).replace(/\bme\b/g, pr.obj).replace(/\bmy\b/g, pr.pos).replace(/\bI\b/g, pr.subj);
    if (/^you\b/i.test(t)) return swap(lowerFirst(t));
    /* What the player did to them ("called me a liar", "owes me $40 by
       Friday"); not when the player is named in it ("caught you in my cab":
       that is theirs). Wave 30: a line that names nobody ("helped carry the
       motor down to the ramp") is the player's too when its kind says the
       player did it (a favour, a gift, a word), never what they saw, heard
       or did themselves. */
    const theirs = isObj(m) && (m.act === 'own' || m.witness || m.secondhand || PERSON_ACTS.includes(m.event));
    const playerDid = isObj(m) && typeof m.event === 'string' && !theirs && !/^(saw|heard|watched|noticed|caught|found|locked|took|waited)\b/.test(t);
    if ((mine || playerDid) && /^[a-z]/.test(t) && !named) { const w = t.split(/\s+/); w[0] = PRESENT_VERB[w[0]] || w[0]; return `you ${swap(w.join(' '))}`; }
    // What they did about the player ("saw them hit the bartender", "locked you up", "caught you in my cab").
    if (/^[a-z]/.test(t)) return `${pr.subj} ${swap(t)}`;
    // A name keeps its capital ("Glenda Pryor told him ..."; wave 3, playtest N10); an ordinary first word does not.
    const ordinary = /^(The|A|An|He|She|They|It|We|This|That|These|Those|His|Her|Their|Its|My|Our|Your|Some|Someone|Somebody|Everyone|Everybody|Nobody|Once|When|After|Before|Last|Today|Yesterday)\b/.test(t);
    return ordinary ? lowerFirst(swap(t)) : swap(t);
  }

  // ----- wave 30: where a person stands, in words -----
  /* The narrator's "to you" field (the integration plan's 10.1): "to you:
     <stance>[, <tag>][ — <reason> (Day N[, made good])[ / <reason> (Day
     N)]] — plays it: <cue>". No "; " inside it (fields are joined with
     "; "): reasons with " / ", the cue with ", ". At most TO_YOU_CAP tokens
     (3.5 characters each), trimmed in order: the second reason, then the
     tag, then the cell's clause of the cue (the status or override clause
     is never cut); a first reason still too long is cut at a word. A
     reason through a tie the town does not know (a report through a hidden
     protector, secondhand.hidden) gives no cause and no name: "cooler since
     Day 4, for a reason of her own, keeps it to herself, never hint at it". */
  const TO_YOU_CAP = 50;
  const CHARS_PER_TOKEN = 3.5;
  /* One reason in words: { text (the narrator's, second person, no full
     stop), card (the People card's sentence), day, meta (the card's "Day 3
     · you apologised"), hidden }. */
  const SETTLED_BY = { apologised: 'you apologised', paid_back: 'you paid it back', came_clean: 'you came clean', kept_word: 'you kept your word', did_favour: 'you made it up to them', got_even: 'they got even', settled: 'it was settled' };
  function reasonText(n, r, opts) {
    const pr = PRONOUN_FORMS[isObj(n) ? n.pronouns : ''] || PRONOUN_FORMS.they;
    const day = Number.isInteger(r.day) ? r.day : null;
    if (r.hidden) {
      const cooler = r.harm !== false ? 'cooler' : 'warmer';
      /* Wave 31 (design section 5.2): news that came through a tie the town
         does not know names the act on the card, with the act's day, never
         the tie ("Cooler since you shamed Royce Pittman at the counter, Day
         4. Hasn't said why."); a report through a hidden protector, only the
         day. The narrator gets neither. */
      const act = typeof r.act === 'string' && r.act ? turnMemory(n, { text: r.act }, opts && opts.player) : '';
      const card = act ? `${capFirst(cooler)} since ${act}, Day ${day || '?'}. Hasn't said why.` : `${capFirst(cooler)} since Day ${day || '?'}. Hasn't said why.`;
      return { hidden: true, day, text: `${cooler} since Day ${day || '?'}, for a reason of ${pr.pos} own, keeps it to ${pr.self}, never hint at it`, card, meta: '' };
    }
    let text;
    if (r.leverage) {
      const line = String(r.line || '').replace(/\.$/, '');
      const what = String(r.text || '').replace(/[.!]+$/, '');
      text = /^You know: /.test(line) ? `you know: ${what}` : /^[A-Z]/.test(line) && r.event !== 'paid_silence' && r.event !== 'blackmailed' ? `has something on you: ${what}` : `${pr.subj} ${what}`;
    }
    const mem = isObj(n) && Array.isArray(n.memories) && Number.isInteger(r.i) ? n.memories[r.i] : null;
    if (!r.leverage) text = turnMemory(n, isObj(mem) ? mem : { text: r.text, event: r.event }, opts && opts.player);
    const by = mem ? Rel.settlements(mem).map(e => e.by).filter(b => b !== 'got_even').pop() : null;
    const made = r.settled > 0;
    const meta = [day ? `Day ${day}` : '', made && by ? SETTLED_BY[by] || 'made good' : ''].filter(Boolean).join(' · ');
    return { hidden: false, day, text, card: r.leverage ? String(r.line || '') : `${capFirst(text)}.`, meta, made };
  }
  /* What the person holds the player to, outside the cap: their noted
     lines (claims and facts the player gave them, not what they did to the
     player), the loose end's line and a story point, at most three. */
  function holdsYouTo(n, turn) {
    const out = [];
    for (const m of Array.isArray(n.memories) ? n.memories : []) {
      if (!isObj(m)) continue;
      if (/^Loose end with /i.test(m.text)) out.push(memoryText(m.text));
      else if (/^Fact \(a story point\):/i.test(m.text)) out.push(cleanText(m.text.replace(/^Fact \(a story point\):\s*/i, ''), 120).replace(/[.]$/, ''));
      // A noted claim the bookkeeper named (typed, d kept); an older line only typed noted by default is no claim.
      else if (m.event === 'noted' && isObj(m.d) && m.act !== 'own' && !m.witness && !m.secondhand && !/\bat cards\b|^Watched /i.test(String(m.text || ''))) out.push(turnMemory(n, m));
    }
    // Someone under 18 holds the player to nothing that reads as romance.
    return out.filter(Boolean).filter(x => !(Rel.isMinor(n) && Rel.ROMANCE_TEXT.test(x))).slice(-3).map(x => x.replace(/; /g, ', '));
  }
  function toYou(n, opts) {
    const o = opts || {};
    const parts = Rel.cueParts(n);
    const st = parts.stance;
    const tag = st.tags[0] || null;
    // The loose end's line and a story point are what they hold the player to (holdsYouTo), not reasons.
    const mems = Array.isArray(n.memories) ? n.memories : [];
    const why = Rel.reasons(n, 4).filter(r => !(Number.isInteger(r.i) && State.protectedMemory(mems[r.i]))).slice(0, 2);
    const said = why.map(r => reasonText(n, r, o)).map(r => ({ text: r.text.replace(/; /g, ', '), day: r.hidden ? '' : ` (Day ${r.day || '?'}${r.made ? ', made good' : ''})` }));
    const reasons = said.map(r => r.text + r.day);
    // Dropping the cell's words never leaves "plays it" empty: with nothing else to play, its first clause stays.
    const cue = noCell => Rel.cueText(parts, { noCell }) || parts.cell[0] || Rel.cueText(parts);
    const build = (rs, withTag, noCell) => `to you: ${st.phrase}${withTag && tag ? `, ${tag}` : ''}${rs.length ? ` — ${rs.join(' / ')}` : ''} — plays it: ${cue(noCell)}`;
    const max = Math.floor(TO_YOU_CAP * CHARS_PER_TOKEN);
    const tries = [[reasons, true, false], [reasons.slice(0, 1), true, false], [reasons.slice(0, 1), false, false], [reasons.slice(0, 1), false, true]];
    for (const [rs, t, nc] of tries) { const line = build(rs, t, nc); if (line.length <= max) return line; }
    // Still over: the first reason cut at a word (its day kept), else none.
    const bare = build([], false, true);
    const room = said.length ? max - bare.length - 3 - said[0].day.length : 0;
    return room >= 20 ? build([cutWords(said[0].text, room).replace(/…$/, '') + said[0].day], false, true) : bare;
  }
  /* /recap's people (wave 30, the integration plan's 14.4): Warm (on the
     player's side), Cold (against them) and Careful (mixed: fond but not
     trusting, using the player, afraid of them or of what they know, or
     holding something over them), at most three each, each with its stance
     and, for Warm and Cold, one reason that fits the side ("Mavis Mangum
     (against you: you told Dewayne about the garage money)"; a loose end's
     person: "your loose end: a debt"). Returns { warm, cold, careful }. */
  const CAREFUL_TAGS = ['using you', Rel.TAGS.leverage.theirs, Rel.TAGS.leverage.both];
  /* Someone as they stand now: when their attitude was written straight (a
     hand-edited save, a test) and nothing has recomputed them yet, a copy
     with it landed (Rel.landTo, as State's next recompute will), so the
     recap reads the number they have. */
  function standingNow(n) {
    const a = toInt(n.attitude);
    if (!isObj(n.rel) || a === null || n.rel.w === a) return n;
    const rel = Rel.landTo(n, { w: clamp(a, -100, 100) }, 'fix');
    const tmp = Object.assign({}, n, { rel });
    return Object.assign(tmp, { rel: Object.assign({}, rel, Rel.recompute(tmp)) });
  }
  function recapGroups(list, p) {
    const out = { warm: [], cold: [], careful: [] };
    const rows = [];
    for (const n0 of list) {
      const n = standingNow(n0);
      const st = Rel.stance(n);
      const c = Rel.tracksOf(n);
      const tag = st.tags.find(x => CAREFUL_TAGS.includes(x));
      const side = st.override || st.side === 'mixed' || tag ? 'careful' : st.side === 'good' ? 'warm' : st.side === 'bad' ? 'cold' : null;
      if (side) rows.push({ n, st, c, side, tag });
    }
    // A reason that fits the side: a typed memory by what it did, a line that moves nothing by its sense (wave 3: never an insult under Warm).
    const fits = (n, r, side) => {
      const m = Number.isInteger(r.i) && Array.isArray(n.memories) ? n.memories[r.i] : null;
      if (m && !isObj(m.d)) return memorySense(r.text) === (side === 'cold' ? -1 : 1);
      return side === 'cold' ? r.harm : !r.harm;
    };
    const why = (n, st, side) => {
      const le = (p.looseEnds || []).find(x => x.npcId === n.id && (!x.threadId || !State.thread(x.threadId) || State.thread(x.threadId).status === 'open'));
      if (le) return { loose: true, text: `your loose end: ${lowerFirst(le.label || le.kind || 'a loose end')}` };
      const mems = Array.isArray(n.memories) ? n.memories : [];
      const r = Rel.reasons(n, 6).find(x => !x.hidden && !x.leverage && !(Number.isInteger(x.i) && State.protectedMemory(mems[x.i])) && fits(n, x, side)) || null;
      return r ? { text: cutWords(reasonText(n, r, { player: p }).text, 110) } : null;
    };
    const entry = x => {
      if (x.side === 'careful') return `${x.n.name} (${x.st.override || x.tag || x.st.phrase})`;
      const t = x.st.tags[0] && !CAREFUL_TAGS.includes(x.st.tags[0]) ? `, ${x.st.tags[0]}` : '';
      const r = why(x.n, x.st, x.side);
      return `${x.n.name} (${x.st.phrase}${t}${r ? `${r.loose ? ', ' : ': '}${r.text}` : ''})`;
    };
    const by = (a, b) => (b.c.w - a.c.w) || (b.c.t - a.c.t);
    out.warm = rows.filter(x => x.side === 'warm').sort(by).slice(0, 3).map(entry);
    out.cold = rows.filter(x => x.side === 'cold').sort((a, b) => -by(a, b)).slice(0, 3).map(entry);
    out.careful = rows.filter(x => x.side === 'careful').sort((a, b) => (b.c.f - a.c.f) || by(a, b)).slice(0, 3).map(entry);
    return out;
  }
  /* Whether the story's ending has happened: its news item has been told
     (seen: its own turn was narrated; wave 3), not only fired (an ending
     that came with a /rest, or whose narration failed, is told after the
     next turn, and the recap does not announce it before then). A game
     with no ending news item (older) reads flags.epilogueShown. */
  function endingFired() {
    const s = State.current;
    if (!s) return false;
    const ends = (Array.isArray(s.news) ? s.news : []).filter(n => isObj(n) && n.epilogue === true);
    if (ends.length) return ends.some(n => n.seen === true);
    return !!(s.flags && s.flags.epilogueShown);
  }
  const ENDING_LINE = 'The story has reached an ending; you can keep playing.';
  /* An ask in a few words (wave 26; State.askWords), for the recap and the
     People card: its words up to the reward or the threat, cut short, and
     when it comes due unless the words already say. opts.bare (the People
     card, under the person's own name): without the name and the asking
     ("asked you to", "wants"). */
  const ASK_LEAD = /^(?:has\s+)?(?:asked|asks|wants|wanted|needs|needed|told)\s+you\s+to\s+|^(?:wants|wanted|needs|needed|asked for|asks for|is after)\s+/i;
  function askShort(a, opts) {
    const bare = !!(opts && opts.bare);
    let t = String((bare ? a.what : a.said) || a.effect || '').split(/\s*[;—]\s*/)[0].replace(/[.!]+$/, '').trim();
    if (bare) t = t.replace(ASK_LEAD, '');
    t = cutWords(t, bare ? 100 : 140);
    const said = Number.isInteger(a.dueDay) && new RegExp(`\\bDay ${a.dueDay}\\b`).test(t);
    // "when you next see him" when the one to see is the one who asked (their name is already there).
    const n = a.seeNpcId && a.seeNpcId === a.npcId ? State.npc(a.npcId) : null;
    const by = n ? `when you next see ${(PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they).obj}` : a.by;
    return `${t}${by && !said ? `, ${by}` : ''}${a.gone ? ' (no longer in town)' : ''}`;
  }
  /* The recap, one line each (the UI adds the heading "Where things stand"
     and bolds what comes before the first colon): where and when; once the
     ending has happened, that line; Here and Open always, Asked of you when someone has; Owed, Warm to you, Careful (mixed feelings),
     Cold to you, Heard and In town when there is something. opts.brief (the
     recap after a night's sleep): once the story has ended, only the first
     two lines, not the same list every morning. */
  function recapText(opts) {
    const s = State.current;
    if (!s) return '';
    const p = s.player;
    const t = s.time;
    const l = State.loc(p.locationId);
    const out = [`Day ${t.day} (${State.dateLine(t.day)}), ${t.phase}, at ${placeName(l)}.`];
    if (endingFired()) {
      out.push(ENDING_LINE);
      if (opts && opts.brief) return out.join('\n');
    }
    const present = State.npcsAt(p.locationId);
    const labels = present.map(n => (n.knownToPlayer ? n.name : npcLabel(n)));
    // A serial comma when a label has "and" in it ("the new waitress, and the farmer and council member"; wave 3).
    const serial = labels.length > 2 && labels.some(x => /\band\b/.test(x));
    out.push(`Here: ${!labels.length ? 'nobody' : serial ? `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}` : andList(labels)}.`);
    const threads = s.threads.filter(x => x.status === 'open' && x.knownToPlayer);
    out.push(`Open: ${threads.length ? threads.map(x => `${x.title}${x.summary ? ` (${cutWords(sentenceOne(cleanText(x.summary, 400)), 220).replace(/\.$/, '')})` : ''}`).join('; ') : 'nothing'}.`);
    // What people asked of the player in the story, not yet come due (wave 26; the Objectives tab has them in full).
    const asks = State.asks().sort((a, b) => (b.turn | 0) - (a.turn | 0));
    if (asks.length) out.push(`Asked of you: ${asks.map(askShort).join('; ')}.`);
    const obls = State.obligations('owed');
    // Wave 29: what the player is owed for their silence ("Hollis Byrd: $300 for keeping quiet, due Day 4 (1 day)"), after what they owe.
    const silence = Rel.demands().map(x => State.demandLine(x, t.day)).filter(Boolean);
    // Only people the player has dealt with (wave 3): met face to face, tied to a loose end, or remembering something of them; never a stranger at their starting attitude.
    const dealt = n => Number.isInteger(n.metTurn) || (p.looseEnds || []).some(le => le.npcId === n.id) || (n.memories || []).some(m => (m.weight | 0) >= 2 && !State.protectedMemory(m));
    const known = s.npcs.filter(n => n.knownToPlayer && n.alive !== false && presenceOf(n) === 'here' && dealt(n));
    // Wave 30: favours owed either way ("Burl Satterfield owes you one"), after the money.
    const favours = s.npcs.filter(n => n.knownToPlayer && n.alive !== false && isObj(n.rel) && (n.rel.net | 0) !== 0).map(n => ((n.rel.net | 0) >= 2 ? `${n.name} owes you big` : (n.rel.net | 0) >= 1 ? `${n.name} owes you one` : `you owe ${n.name} one`));
    if (obls.length || silence.length || favours.length) out.push(`Owed: ${obls.map(o => obligationLine(o, t.day)).concat(silence, favours).join('; ')}.`);
    const g = recapGroups(known, p);
    if (g.warm.length) out.push(`Warm to you: ${g.warm.join(', ')}.`);
    if (g.cold.length) out.push(`Cold to you: ${g.cold.join(', ')}.`);
    if (g.careful.length) out.push(`Careful: ${g.careful.join(', ')}.`);
    // The rumours heard last (by the day they were heard; the order heard within a day).
    const heard = s.rumours.filter(r => r.heard);
    const order = r => (Number.isInteger(r.heardDay) ? r.heardDay : -1);
    const lastHeard = heard.map((r, i) => ({ r, i })).sort((a, b) => order(a.r) - order(b.r) || a.i - b.i).slice(-3).map(x => x.r);
    if (lastHeard.length) out.push(`Heard: ${lastHeard.map(r => { const n = State.npc(r.heardFrom || r.sourceNpcId); return `"${cutWords(r.text, 140).replace(/[.]$/, '')}"${n ? ` (${n.name})` : ''}`; }).join('; ')}.`);
    // The latest two by their day (wave 3: a skipped-over event dated its own day is not listed after a later one).
    const when = n => (Number.isInteger(n.day) ? n.day : 0) * 10 + Math.max(0, PHASES.indexOf(n.phase));
    const news = newsList().filter(n => isObj(n) && n.public !== false && n.text && n.epilogue !== true).map((n, i) => ({ n, i })).sort((a, b) => when(a.n) - when(b.n) || a.i - b.i).map(x => x.n).slice(-2);
    if (news.length) out.push(`In town: ${news.map(n => `${Number.isInteger(n.day) ? `Day ${n.day}: ` : ''}${cutWords(n.text, 200)}`).join(' ')}`);
    return out.join('\n');
  }
  function printRecap(opts) {
    const text = recapText(opts);
    if (!text) return null;
    const node = UI.feed.notice(text, 'recap');
    if (node && node.style) node.style.whiteSpace = 'pre-line';
    return node;
  }
  return { noteIntroductions, reroll, pickMemories, pass, updateGame, setClock, forgetEnding,
    // Wave 28: the romance step, coercion and the minor rule after narration; the bookkeeper turns kept for the eval.
    romanceStep, minorTurn, BOOK_TURNS_MAX, keepBookTurn, bookTurnsJsonl, get bookTurns() { return bookTurns.slice(); },
    submit, runTurn, look, zoom, skip, rest, wait, fact, arrival, epilogue,
    speechFor, spokenWords, defaultAddressee, sayAction, SAY_TYPES,
    normaliseParse, parsePacket, narratorPacket, bookkeeperPacket, checkAndCreate, pickRumour, compressIfDue, passTime, castBlock, townBlock, usualPlaces, tieWords: isToWords, hasWords, CAST_RULE,
    noteMentioned, awayTarget, awayLine, unknownTarget, carriedAs, carryingLine, notCarriedLine, cardGameAt, dealerOf, stakeFrom, stakeFor, outsideOf, markedDeck, cardSeed, readOdds, readText, dealHand, dealerHours, dealerRefusal, wordsBet, plainHandText, gainText, shutHereLine, moneyNamed, openDayFrom, banBackDay,
    recap: recapText, recapText, printRecap, askShort,
    // Wave 30: a memory's sense and its words for "you" (the card, the recap, the narrator's "to you"), and the line itself.
    memorySense, turnMemory, toYou, reasonText, holdsYouTo, recapGroups, TO_YOU_CAP,
    CHRONICLE_AT, CHRONICLE_KEEP, STATUS_TEXT,
    npcLine, wouldKnow, knowledgeLine, timeTakes, clockText, dateText, weekdayOf, storySoFar, earlierLine, openLine, newsLine, TOWN_NEWER, looseEndsLine,
    ACTION_TYPES, NOTICES, hooks,
    forceNextRoll(d20) { hooks.nextD20 = Number.isInteger(d20) ? clamp(d20, 1, 20) : null; },
    setStatusListener(fn) { statusFn = typeof fn === 'function' ? fn : null; },
    /* Stop: whatever the running turn is waiting on is cancelled; the turn
       fails cleanly and the input goes back (NOTICES.aborted). */
    abort() {
      if (!busy) return false;
      if (acceptsQueue && queued) { const q = queued; queued = null; if (q.text) restoreQueued(q.text); }
      // A hand on the table (wave 11, M1): the ante is in, so Stop folds it (the fold price, the marked deck's catch roll) and the turn is kept, told plainly.
      if (hand) { playHand({ fold: true, stopped: true }); return true; }
      Api.abort();
      return true;
    },
    /* The open hand (wave 10): Draw ({ hold: [0-4] }) or Fold ({ fold: true }); false when no hand is open. */
    playHand,
    voidHand,
    takeBackHand,
    cheatCards,
    get cheatArmed() { return cheatArmed(); },
    keepCheat,
    cheatWin,
    get winArmed() { return winArmed(); },
    keepWin,
    gameFrom, seatWords, cardPeople, seatsFor, seatedAt, rememberedGame, holdemRun, drawRun, settlePot, unitFor, anteFor, holdemCap, rigHoldem, rigDraw, CARD_GAMES, GAME_NAMES, CARD_TAG,
    // Wave 18: no-limit betting (the table's amounts, a seat's move, the hand's big moments, a bet typed with a hand open).
    clampTo, clampWhy, sizeFor, sizeWhy, seatMove, drawStrength, betMoments, typedBet, MAX_RAISES, rulesWords, rulesText, STAKES_ASK, stakesWords, stakesAsked, betweenHands, betWord, tableStructure, STRUCTURES,
    // Wave 19: the first sentence of a text, never cut at "Dr." or an initial (the demo's and the packets' split).
    sentenceOne,
    resumeHand,
    foldPrice,
    get handOpen() { return !!hand; },
    /* The open hand's table (stake, dealer, cards as dealt), or null (wave 11: the box's nudge names the fold price). Wave 13: kind is 'choose', 'draw' or 'holdem'. */
    get openHand() { return hand ? hand.table : null; },
    get handKind() { return hand ? hand.kind : null; },
    whenIdle,
    get busy() { return busy; },
    /* Stop does something now: in any stage of a running turn. While the
       town is being updated after the narration, Stop keeps the narration
       (changes not recorded) and puts a queued line back in the box. */
    get canStop() { return busy; },
    get acceptsQueue() { return busy && acceptsQueue; },
    get queued() { return queued ? queued.text : null; },
    /* The line waiting in the queue taken back (the UI's "Next: ..." and its
       x): it will not run. Returns its text, or null when nothing waits. */
    cancelQueued() { if (!queued) return null; const q = queued; queued = null; return q.text || ''; },
    get lastTurn() { return lastTurn; },
    /* /rewind (wave 16): the turn /reroll would replay is struck from the story. */
    forgetLastTurn() { lastTurn = null; }
  };
})();

