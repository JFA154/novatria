// ===== Module: Rel =====
/* How each person feels about the player (docs/RELATIONSHIPS_PLAN.md; wave
   26 is its first step, A1): seven tracks under the one number (six until
   wave 35 gave romance its own). Liking (w,
   -100..100) is what attitude always was; trust (t, -100..100) is whether
   they believe the player and rely on them; fear (f, 0..100) fades in days;
   knows-you (k, 0..100) never fades; spark (s, 0..100) is wanting, and stays
   0 for anyone under 18 and with a player under 18 or of no recorded age
   (wave 34: every adult else; the town's romance list only tunes how
   easily); romance (m, 0..100, wave 35) is caring about someone that way,
   under the same rule; owed is a short list of favours
   outside the money obligations, net -3..+3.

   A person's n.rel holds where they stood before the player came (start:
   liking the town's written attitude, trust 5 x guardedness and -10 for the
   police and smugglers, or the record's start.trust), the small things not
   worth a memory (everyday, each held to CAPS.everyday), what was set
   outright (fix: the editor, relSet, a direct write to n.attitude, which is
   folded in at the next recompute; it never drifts), what the repeat rules
   count (today, days, recent), the ask log (asks, wave 27), owed favours,
   and the cache relWrite keeps: the six tracks, net owed, the share of fear
   leverage gives (levFear) and the band each track last entered (bands:
   the hysteresis reads it). A track is start + what each memory still
   carries + everyday + fix. A typed memory (socialEvent) keeps d, what it
   did to each track as applied; that fades by its class (DECAY), fear on
   one clock, and settlements soften it (combined, never locked). A memory
   with d null (every legacy line: newMemories, addMemory, the engine's
   own) moves no track. n.attitude stays on the record as the stored alias
   of liking, so everything that reads it reads liking.

   Rel is pure: frozen tables (Game.Rel.EVENTS and the rest) and functions
   that read a person, the state and the town and return values or a new
   rel record. It never writes. State's ops (attitudeDelta, attitudeChanges,
   socialEvent, relSet, relDay, editPerson, the memory writers, the load
   fill) call it and write what it returns, so State.apply stays the only
   writer. In wave 26 nothing reads the stance but Debug and the tests:
   every number the game shows or stores is what it was before.

   Wave 27 (A2, "what the engine sees, people remember for what it was"):
   the engine's own events are typed (a fight is one memory, the third hit
   a beat-down that replaces it; a threat, a theft, a gift, an obligation
   kept or broken, a rescue, a cheat caught, the card seats), the people
   who saw it get a lighter copy for the scene (witnessEvent), the morning
   drifts only the everyday bucket on days the player did not see them
   (driftStep), and the gates read the tracks: the dice (rollMod), fear's
   no-roll compliance (complies), rescue on a defeat, the grudge, the
   report to whoever looks out for them (protectorOf, policeHead,
   reportWhy) and the shop that won't sell (wontSell). Every new draw is
   rng's own stream.

   Wave 28 (A3, "the bookkeeper names the act, and minors are protected
   before the story is told"): what the bookkeeper may say (WIRE_EVENTS,
   ABOUT_EVENTS, WORDS_EVENTS) and what each line comes down to (wireEvent:
   the preconditions and downgrades; State applies them, with presence and
   the caps), its handles on what someone still holds (handles), and the
   gates by trust (difficultyFloor, lieWord, secretOpen, meets, rollMod's
   deceive). The minor rule is decided here before the narrator writes
   (romanceTurn: the flag, the phrase, coercion, the adults' answer;
   minorLine and playerMinorLine for the narrator) and reported through
   whoever looks out for the child (guardiansOf) or the law (reportTo, the
   town's policeFallback); MINOR_RULE holds its rows. Nobody is open to a
   flirt yet: spark's welcome is wave 29's.

   Wave 30 (A5, "what people show"): the stance is what the player and the
   narrator are given in place of the number. cueParts splits the cue into
   its pieces (the override's lead, the cell, pity, the tag's, a "takes it
   seriously") so the narrator's "to you" line can drop the cell's words
   first (cueText), words(track, v, prev) says each track for the card's
   "More", below() reads relBelow beside relAtLeast, and reasons() gives
   each its memory's index, turn and whether it is harm, came through a
   hidden tie (hidden: no name and no cause, ever), is a witness copy or was
   planted where the player has not seen them since (unseen). A romance
   line is never a reason for someone not eligible, and ROMANCE_TEXT keeps
   it off anyone under 18 whatever its event.

   Wave 31 (B1, "the town is a graph"): people have ties to each other
   (state.ties, directed: what B is to A, with A's liking and trust for B),
   from both sides of every relation (TIE_KINDS, RELATION_KINDS), the
   town's own ties (its secrets among them, hidden until something reveals
   them) and fellows of a faction (tiesPlan). What the player does to
   someone reaches the people tied to them, one hop only (propagate):
   those who saw it at once, the rest as hearsay by the kind of tie
   (DELIVERY: a spouse and the household overnight, family and work by the
   morning, the rest when they meet), at a factor by what the person is to
   them and how they feel about them, negative for a rival (FACTORS, with
   the police and clergy's limits); what carries is nothing, everyday or a
   secondhand memory (carry). A settlement reaches the copies others hold
   (settleSpread); an arrest turns the family against the officer
   (arrestTies). No draw anywhere.

   Wave 32 (B2, "ties that change"): what the player says and does moves how
   people feel about each other. Telling X what the player holds over Y
   moves X's tie to Y by the town's secretTies (secretTiesFor), and Y hears
   who told by the tie between them; a word against Y or for Y to X, on a
   persuade that worked, moves X's liking for Y as far as X trusts the
   player (wordsTie, WORDS_TIE); telling someone what they would rather not
   know about someone they love costs liking, not trust (MESSENGER). What
   the narrator and the card are told of it: BETWEEN THEM (betweenThem) and
   "strained since Day N" (tieWords), only for a tie the town knows and the
   player saw change.

   Wave 35 ("Romance and spark are different", the owner): romance (m) is
   stored beside spark, in start, everyday, fix and the cache, and the
   table's m column says what moves it (a welcome flirt +2; time, a
   confidence, a favour, a defence, a rescue, a word kept only while spark
   is 20 or more, mAt; the night +10; a rebuff, a lie caught, a broken
   word, a betrayed confidence down; a weight-3 harm halves it; a jealous
   onlooker -5), its gains x the person's romanceRate (the sparkRate when
   content gives none), never a trait. It fades on the bond clock
   (ROMANCE_CLOCK); everyday romance drifts 1 a day on days unseen. The
   statuses read spark and romance (SPARK_STATUS) in place of wave 29's
   caring liking; the night reads romance 40 in place of liking 40. Spark
   and romance are both the guard's (ROMANTIC, sparkGuard): 0, and refused
   at every writer, for anyone under 18 and with a player under 18. The
   favours owed can be set by hand (owedTo, the Edit form's Owes you).

   Wave 40 ("however the line is put"): coercion (romanceTurn) reads every
   named target, whatever the parser called the action: a romantic line
   at someone at fear 40 or more, or over whom the player holds a live
   record (aware, or named or used by the words), is refused as coerced
   when it is a walk to a motel room, a give or a use as much as a talk;
   a threatening romantic line to the whole room is refused by every
   adult there. intimateGate counts fear and any held record short, so
   the night never opens through them for any caller. */
const Rel = (() => {
  function deepFreeze(v) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); }
    return v;
  }
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  // An event's change rounded half away from zero (a halved -15 is -8, as a halved 15 is 8). Tracks round with Math.round, which lands exactly.
  function rnd(x) { return (x < 0 ? -Math.round(-x) : Math.round(x)) || 0; }
  const two = x => Math.round(x * 100) / 100 || 0;
  const list = v => (Array.isArray(v) ? v.filter(isObj) : []);

  /* Wave 35 (the owner: "Romance and spark are different"): romance (m;
     r is the grudge axis's) is its own track beside spark. Spark is
     wanting, romance is caring about someone that way; both 0 for anyone
     under 18 and with a player under 18 (ROMANTIC: the tracks the guard
     holds). */
  const TRACKS = Object.freeze(['w', 't', 'f', 'k', 's', 'm']);
  const ROMANTIC = Object.freeze(['s', 'm']);
  const TRACK_NAMES = Object.freeze({ w: 'liking', t: 'trust', f: 'fear', k: 'knows', s: 'spark', m: 'romance' });
  const RANGE = deepFreeze({ w: [-100, 100], t: [-100, 100], f: [0, 100], k: [0, 100], s: [0, 100], m: [0, 100] });

  /* The events (design section 3.1): what each does to each track before
     the person's traits and the repeat rules. s is a number or 'halves'
     (a weight-3 harm halves spark), 'rate' (a welcome flirt: 10 x the
     person's sparkRate) or 'warm' (+2 once spark is 10 or more). m (wave
     35): romance, a number or 'halves', never scaled by a trait, its gains
     x the person's romanceRate; mAt: the spark it needs before it moves
     (romance grows out of wanting plus substance). rep: town
     reputation when it happens in public (wave 27). weight 0: no memory,
     the change goes into everyday. decay: the fading class (DECAY;
     'everyday' rows make no memory, 'keeps' never fades). dedupe: the class
     an engine event drops the bookkeeper's duplicates by (DEDUPE, wave 27).
     src: E the engine sees it, B the bookkeeper names it (wave 28), EB
     both. proud: pride scales its liking; money: the mercenary flag doubles
     its liking; owed: the favours it puts on the ledger (+ they owe the
     player, - the player owes them, 'clear' clears what the player owes
     them). What settles is SETTLE. card_win, card_loss and
     unwanted_advance are code's own rows (a card seat's -2 / +1 a day; the
     minor rule, wave 28). */
  function row(src, w, t, f, k, s, m, weight, decay, dedupe, more) {
    return Object.assign({ src, w, t, f, k, s, m, weight, decay, dedupe: dedupe || null, rep: 0 }, more || {});
  }
  const EVENTS = deepFreeze({
    hit: row('E', -25, -10, 20, 2, 'halves', 'halves', 3, 'wound', 'violence', { rep: -3 }),
    shoved: row('E', -15, -5, 5, 2, 0, 0, 2, 'slight', 'violence', { rep: -2, proud: true }),
    beat_down: row('E', -35, -15, 35, 2, 'halves', 'halves', 3, 'scar', 'violence', { rep: -5 }),
    threatened: row('E', -10, -10, 25, 2, 0, 0, 2, 'slight', 'threat', { rep: -2 }),
    threatened_to_tell: row('E', -15, -20, 20, 2, 'halves', 'halves', 2, 'wound', 'threat'),
    blackmailed: row('E', -25, -30, 15, 2, 'halves', 'halves', 3, 'scar', 'threat', { proud: true }),
    stole_from: row('EB', -20, -25, 0, 2, 'halves', 'halves', 3, 'wound', 'theft', { rep: -5 }),
    gift: row('E', 5, 0, 0, 2, 0, 0, 1, 'slight', 'money', { money: true }),
    bribed: row('E', 3, 0, 0, 2, 0, 0, 2, 'slight', 'money', { money: true }),
    spent_time: row('E', 2, 0, 0, 4, 'warm', 3, 0, 'everyday', null, { mAt: 20 }),
    humiliated: row('E', -15, -5, 0, 2, 0, 0, 2, 'slight', 'words', { rep: -2, proud: true }),
    paid_back: row('E', 5, 10, 0, 2, 0, 0, 2, 'wound', 'money', { rep: 2, money: true, owed: 'clear' }),
    kept_word: row('EB', 5, 15, 0, 2, 0, 5, 2, 'wound', 'money', { rep: 2, mAt: 20 }),
    broke_word: row('E', -8, -15, 0, 2, 0, -8, 2, 'wound', null, { rep: -3 }),
    rescued: row('E', 25, 15, 0, 5, 0, 12, 3, 'scar', null, { rep: 5, owed: 2, mAt: 20 }),
    flirted: row('E', 4, 0, 0, 2, 'rate', 2, 1, 'mood', 'romance'),
    intimate: row('E', 10, 5, 0, 15, 15, 10, 3, 'scar', 'romance'),
    paid_silence: row('E', 5, 10, 0, 2, 0, 0, 1, 'slight', 'money', { money: true }),
    told_anyway: row('E', -5, -15, 0, 2, 0, 0, 2, 'wound', null, { rep: -5 }),
    cheated: row('EB', -15, -30, 0, 2, 'halves', 'halves', 3, 'scar', 'theft', { rep: -5 }),
    lied_caught: row('B', -5, -30, 0, 2, 0, -8, 2, 'wound', null, { rep: -2 }),
    came_clean: row('B', 0, 0, 0, 3, 0, 0, 2, 'wound', null),
    confided: row('B', 3, 5, 0, 8, 0, 3, 1, 'wound', null, { mAt: 20 }),
    they_confided: row('B', 5, 3, 0, 10, 0, 4, 2, 'wound', null, { mAt: 20 }),
    betrayed_confidence: row('B', -20, -40, 0, 2, 0, -20, 3, 'scar', null),
    exposed: row('B', 0, 8, 0, 3, 0, 0, 2, 'wound', null),
    complimented: row('B', 3, 0, 0, 2, 0, 0, 1, 'mood', 'words'),
    insulted: row('B', -10, 0, 0, 2, 0, 0, 1, 'mood', 'words', { proud: true }),
    apologised: row('B', 2, 0, 0, 2, 0, 0, 0, 'everyday', null),
    pried: row('B', -3, -3, 0, 3, 0, 0, 1, 'mood', 'words', { proud: true }),
    rebuffed: row('B', -5, 0, 0, 2, -15, -10, 1, 'slight', 'romance', { proud: true }),
    did_favour: row('B', 8, 5, 0, 3, 0, 4, 2, 'wound', null, { owed: 1, mAt: 20 }),
    they_helped: row('B', 2, 0, 0, 3, 0, 0, 1, 'wound', null, { owed: -1 }),
    defended: row('B', 15, 10, 0, 2, 0, 8, 2, 'wound', null, { rep: 3, mAt: 20 }),
    informed_on: row('B', -30, -35, 10, 2, 'halves', 'halves', 3, 'scar', null),
    crossed: row('B', -12, -12, 0, 2, 0, 0, 2, 'wound', null),
    badmouthed: row('B', 0, 0, 0, 2, 0, 0, 0, 'everyday', null, { tier: 'B' }),
    vouched_for: row('B', 0, 0, 0, 2, 0, 0, 0, 'everyday', null, { tier: 'B' }),
    noted: row('B', 0, 0, 0, 2, 0, 0, 1, 'keeps', null),
    learned_secret: row('EB', 0, 0, 0, 2, 0, 0, 1, 'keeps', null),
    caught_you_at: row('EB', -5, -10, 0, 2, 0, 0, 2, 'wound', null),
    card_win: row('E', 1, 0, 0, 2, 0, 0, 0, 'everyday', null),
    card_loss: row('E', -2, 0, 0, 2, 0, 0, 0, 'everyday', null),
    unwanted_advance: row('E', -20, -20, 10, 2, 0, 0, 3, 'wound', null, { fearBuysNothing: true })
  });
  const EVENT_NAMES = Object.freeze(Object.keys(EVENTS));
  // The words the bookkeeper may send (wave 28): 22 in tier A, two more in B.
  const WIRE_EVENTS = deepFreeze({
    insulted: 'A', complimented: 'A', pried: 'A', apologised: 'A', confided: 'A', they_confided: 'A', kept_word: 'A', came_clean: 'A',
    lied_caught: 'A', betrayed_confidence: 'A', exposed: 'A', did_favour: 'A', they_helped: 'A', defended: 'A', informed_on: 'A', crossed: 'A',
    rebuffed: 'A', noted: 'A', learned_secret: 'A', caught_you_at: 'A', stole_from: 'A', cheated: 'A', badmouthed: 'B', vouched_for: 'B'
  });
  // Spelling, tense, spaces and hyphens to the event's name (the wire reader, wave 28; eventName).
  const ALIASES = deepFreeze({
    apologized: 'apologised', apologise: 'apologised', apologize: 'apologised', apology: 'apologised', sorry: 'apologised',
    insult: 'insulted', compliment: 'complimented', complimented_me: 'complimented', thanked: 'complimented', praised: 'complimented',
    pry: 'pried', prying: 'pried', confide: 'confided', confided_in: 'confided', they_confide: 'they_confided', told_me_private: 'they_confided',
    kept_their_word: 'kept_word', kept_word: 'kept_word', keptword: 'kept_word', kept_a_secret: 'kept_word', kept_quiet: 'kept_word',
    owned_up: 'came_clean', come_clean: 'came_clean', confessed: 'came_clean', caught_lying: 'lied_caught', lied: 'lied_caught', lie_caught: 'lied_caught',
    betrayed: 'betrayed_confidence', betrayal: 'betrayed_confidence', expose: 'exposed', told_on: 'exposed', favour: 'did_favour', favor: 'did_favour',
    did_favor: 'did_favour', did_a_favour: 'did_favour', did_a_favor: 'did_favour', helped_me: 'they_helped', helped: 'they_helped', they_help: 'they_helped',
    defend: 'defended', stood_up_for: 'defended', informed: 'informed_on', snitched: 'informed_on', reported: 'informed_on', cross: 'crossed',
    rebuff: 'rebuffed', turned_down: 'rebuffed', note: 'noted', learnt_secret: 'learned_secret', learned_a_secret: 'learned_secret',
    caught_at: 'caught_you_at', caught_you: 'caught_you_at', stole: 'stole_from', steal: 'stole_from', theft: 'stole_from', cheat: 'cheated',
    bad_mouthed: 'badmouthed', vouched: 'vouched_for'
  });
  /* Dedupe by class (wave 27): an engine event of a class drops the
     bookkeeper's events of that class for the same person that turn, and
     these drop more besides. */
  const DEDUPE = deepFreeze({
    violence: { events: ['hit', 'shoved', 'beat_down'], drops: ['humiliated', 'threatened'] },
    threat: { events: ['threatened', 'threatened_to_tell', 'blackmailed'], drops: [] },
    theft: { events: ['stole_from', 'cheated'], drops: [] },
    money: { events: ['gift', 'bribed', 'paid_back', 'paid_silence', 'kept_word'], drops: ['kept_word', 'did_favour'] },
    romance: { events: ['flirted'], drops: ['complimented', 'flirted'] },
    words: { events: ['humiliated'], drops: ['insulted'] }
  });
  /* Four signed axes from the two written traits (design Appendix A):
     pride p (humble - / proud +), guardedness g (suspicious - / open +),
     nerve n (timid - / hard +), grudge-holding r (grudging - / forgiving
     +). Each trait gives [p, g, n, r]; a person's axis is the sum, held to
     +/-2. A trait not here is flavour only. */
  const TRAIT_AXES = deepFreeze((() => {
    const out = {};
    const put = (names, a) => { for (const t of names.split(' ')) out[t] = a; };
    put('proud imperious vain boastful officious', [1, 0, 0, 0]);
    put('stubborn', [1, 0, 0, -1]);
    put('earnest grateful', [-1, 1, 0, 0]);
    put('shy', [-1, 0, -1, 0]);
    put('genial sociable garrulous gossipy lonely charming', [0, 1, 0, 0]);
    put('kind gentle cheerful easygoing', [0, 1, 0, 1]);
    put('watchful guarded shrewd methodical discreet observant precise sharp careful calculating', [0, -1, 0, 0]);
    put('bitter', [0, -1, 0, -1]);
    put('cowardly frightened jumpy worried tired', [0, 0, -1, 0]);
    put('unflappable unshockable disciplined hard reckless', [0, 0, 1, 0]);
    put('ruthless merciless relentless', [0, 0, 1, -1]);
    put('grieving angry gloomy vindictive', [0, 0, 0, -1]);
    put('fair', [0, 0, 0, 1]);
    return out;
  })());
  const FLAVOUR_TRAITS = Object.freeze(['loyal', 'sentimental', 'ambitious', 'smooth', 'greedy', 'patient', 'nosy', 'honest', 'mercenary', 'bored', 'fussy',
    'restless', 'sly', 'curious', 'principled', 'practical', 'resourceful', 'dutiful']);
  /* What each axis does, per point (design section 3.4). */
  const AXIS_EFFECTS = deepFreeze({
    pride: { liking: 0.25, settle: -0.2, refusesAt: 1 },      // the proud rows' liking x (1 + 0.25p); settling x (1 - 0.2p)
    guarded: { startTrust: 5, gain: 0.2, loss: -0.15 },        // start trust 5g; trust gains x (1 + 0.2g), losses x (1 - 0.15g)
    nerve: { fear: -0.25, hardAt: 1 },                         // fear gains x (1 - 0.25n); hard at 1 or more
    grudge: { halfLife: -0.5, settle: 0.15 }                   // harm half-lives x 2^(-r/2); settling x (1 + 0.15r)
  });
  // The mercenary flag (content, wave 29: Hollis, Shayla, Tyler, Curtis, Leon): money counts double on liking, blackmail half.
  const MERCENARY = deepFreeze({ money: 2, blackmailed: 0.5 });
  /* How long things last: [half-life in days, floor] (slight's floor 0.2
     for harm, 0 for kind). Witness and secondhand copies fade one class
     lighter (LIGHTER) with floor 0. One fear clock for every source but
     leverage. */
  const DECAY = deepFreeze({ mood: [2, 0], slight: [5, { harm: 0.2, kind: 0 }], wound: [10, 0.4], scar: [21, 0.6], keeps: [Infinity, 1] });
  const LIGHTER = deepFreeze({ scar: 'wound', wound: 'slight', slight: 'mood', mood: 'mood', keeps: 'keeps' });
  const FEAR_CLOCK = Object.freeze([4, 0]);
  // Wave 35: romance's part of a memory fades on the bond clock, [half-life in days, floor] (slower than spark's slight clock; intimacy on the scar clock).
  const ROMANCE_CLOCK = Object.freeze([14, 0]);
  /* The bounds (design sections 3.3, 6.1-6.2). turn: what events may move
     one person in one turn; everyday: each everyday bucket's bound
     (knows-you is held only to its range there); compound: harm repeated
     within mergeDays (x1.5, then x2.25), merged into one memory; kindRepeat:
     the same kind thing to the same person on the same day (sameDay for
     the things that count once a day); acrossDays: time together and gifts
     count in full the first 3 days per person, then as after; hardFear:
     where a hard person's fear stops; quietDays: wave 26's drift hold (a
     weight-3 memory this fresh holds liking where it is). */
  const CAPS = deepFreeze({
    turn: { w: 40, t: 45, f: 40, s: 20, m: 20 }, everydayRomanceDrift: 1, graph: { w: 15, t: 15 }, everyday: 15, everydayDrift: 2, perPerson: 2, perTurn: 4, kMin: 2, kPerDayAimed: 3,
    owed: 3, owedEntries: 8, mergeDays: 3, compound: [1, 1.5, 2.25], kindRepeat: [1, 0.5, 0.25, 0],
    sameDay: { gift: [1, 0], bribed: [1, 0], spent_time: [1, 0], card_win: [1, 0], card_loss: [1, 0] },
    acrossDays: { spent_time: { full: 3, after: { w: 1, k: 2 } }, gift: { full: 3, after: { w: 1 } } },
    hardFear: 39, noted: 3, memories: 12, settlements: 2, hysteresis: 5, cuePerPerson: 50, cueWords: 12, recent: 4, asks: 8, quietDays: 5, staleTurns: 30
  });
  /* Settling (design section 5.3): the share of a memory's liking, trust
     and fear it takes away, and which memory: 'harm' (the one its words
     name, else the newest harm within mergeDays), 'debt' (named, else the
     newest broken word), an event's name (named, else the newest of that
     event), 'named' (only one its words name). Settlements combine as
     1 - (1-a)(1-b), at most CAPS.settlements a memory plus getting even;
     pride and grudge-holding scale them. 'settled' is a legacy
     memoriesSettled on a typed memory: it softens it as an apology does. */
  const SETTLE = deepFreeze({
    apologised: { w: 0.5, t: 0.25, f: 0, on: 'harm' },
    paid_back: { w: 1, t: 1, f: 0, on: 'debt' },
    came_clean: { w: 0, t: 0.4, f: 0, on: 'lied_caught' },
    kept_word: { w: 0.7, t: 0.35, f: 0, on: 'broke_word' },
    did_favour: { w: 0.5, t: 0.25, f: 0, on: 'named' },
    got_even: { w: 0.4, t: 0, f: 0, on: 'harm', extra: true },
    settled: { w: 0.5, t: 0.25, f: 0, on: 'named' }
  });
  /* Bands (design section 2.4). A track enters a band at its edge and
     leaves it only CAPS.hysteresis points back toward the middle (warm is
     entered at 25 and left below 20; distrusts entered at -25 and left
     above -20); the middle band (centre) has none. Fear's bands are the
     uneasy tag (20) and the override (40). Wave 35: spark's (wanting) and
     romance's (caring that way) are their own, for the card's words; the
     statuses read both numbers (SPARK_STATUS). */
  const BANDS = deepFreeze({
    w: [['hates', -100, -60], ['dislikes', -59, -25], ['cool', -24, -6], ['neutral', -5, 5], ['friendly', 6, 24], ['warm', 25, 59], ['devoted', 60, 100]],
    t: [['distrusts', -100, -25], ['unsure', -24, 24], ['trusts', 25, 100]],
    f: [['calm', 0, 19], ['uneasy', 20, 39], ['afraid', 40, 100]],
    s: [['none', 0, 19], ['noticed', 20, 39], ['wants', 40, 59], ['burning', 60, 100]],
    m: [['none', 0, 9], ['little', 10, 29], ['some', 30, 59], ['lot', 60, 84], ['heels', 85, 100]],
    centre: { w: 'neutral', t: 'unsure', f: 'calm', s: 'none', m: 'none' }
  });
  /* The stance: twelve phrases, liking against trust. "hates you" needs an
     unsettled weight-3 harm behind it, else it is "against you"; the
     neutral cell is "doesn't know you" with no memories and knows-you
     under 10; the devoted cell is "loyal to you" only with trust above 0,
     else "warm to you". */
  const STANCE_GRID = deepFreeze({
    hates: { distrusts: 'hates you', unsure: 'hates you', trusts: 'hates you' },
    dislikes: { distrusts: 'against you', unsure: 'against you', trusts: 'against you' },
    cool: { distrusts: 'suspicious of you', unsure: 'cool to you', trusts: 'takes you at your word' },
    neutral: { distrusts: 'suspicious of you', unsure: 'sizing you up', trusts: 'takes you at your word' },
    friendly: { distrusts: 'suspicious of you', unsure: 'friendly', trusts: 'friendly' },
    warm: { distrusts: "fond of you, doesn't trust you", unsure: 'warm to you', trusts: 'in your corner' },
    devoted: { distrusts: "fond of you, doesn't trust you", unsure: 'loyal to you', trusts: 'in your corner' }
  });
  const PHRASES = Object.freeze(['hates you', 'against you', 'suspicious of you', 'cool to you', 'sizing you up', "doesn't know you", 'takes you at your word',
    'friendly', "fond of you, doesn't trust you", 'warm to you', 'in your corner', 'loyal to you']);
  const SIDES = deepFreeze({
    'hates you': 'bad', 'against you': 'bad', 'suspicious of you': 'bad', 'cool to you': 'bad', 'sizing you up': 'neutral', "doesn't know you": 'neutral',
    'takes you at your word': 'good', friendly: 'good', "fond of you, doesn't trust you": 'mixed', 'warm to you': 'good', 'in your corner': 'good', 'loyal to you': 'good',
    'afraid of you': 'mixed', 'afraid of what you know': 'mixed'
  });
  /* Fear's override, checked first: fear 40 or more (the afraid band) and
     liking in [-60, 25) reads "afraid of what you know" when leverage the
     player holds is the larger share of the fear, else "afraid of you";
     below -60 the stance stands with "and afraid of you", from 25 up with
     "wary of your temper". Hard people stop at 39 and never get it. */
  const OVERRIDES = deepFreeze({ fear: 40, window: [-60, 25], know: 'afraid of what you know', you: 'afraid of you', below: 'and afraid of you', above: 'wary of your temper' });
  // The tags, in this order (the card shows two, the narrator one).
  const TAGS = deepFreeze({
    order: ['leverage', 'spark', 'fear', 'debts', 'uneasy'],
    leverage: { both: 'you have something on each other', theirs: 'has something on you', yours: 'you have something on them' },
    debts: { big: 'owes you big', owes: 'owes you', owe: 'you owe them', marker: 'holding your marker' },
    uneasy: 'uneasy around you'
  });
  /* The statuses (design section 2.5), first match wins, only for an
     eligible adult (sparkStatus returns null before reading a number).
     Wave 35 (the owner: "Romance and spark are different"): they read the
     two tracks, spark (wanting) and romance (caring that way), in place of
     wave 29's caring liking. spark: spark at least; romance: romance at
     least; below: romance under; distrust: trust at or below; earned:
     distrust the player earned (an unsettled first-hand harm with trust in
     it) or the mercenary flag. Each threshold leaves 5 back for the status
     they hold (CAPS.hysteresis). distrustCue: the cue at trust -25 or less
     ("wants you" that is not "using you"). The feed line is the design's. */
  const SPARK_STATUS = deepFreeze([
    { status: 'falling for you', romance: 60, spark: 40, cue: ['lights up when you come in', 'stands close', "asks where you've been"], feed: '{name} is falling for you.' },
    { status: 'sweet on you', romance: 30, cue: ['lights up when you come in', 'remembers what you told {them}'], feed: '{name} is sweet on you.' },
    { status: 'using you', spark: 40, below: 20, distrust: -25, earned: true, cue: ['wants you around for one reason', "doesn't ask about your day"], feed: "{name} is interested. It isn't friendship." },
    { status: 'wants you', spark: 40, below: 20, cue: ['flirts back', 'keeps it light', 'not sure {they} likes you'], distrustCue: ['flirts back', 'keeps it light', "doesn't trust you"], feed: '{name} is interested.' },
    { status: 'has noticed you', spark: 20, cue: ['looks twice', 'finds a reason to stand near you'], feed: '{name} looks at you twice.' }
  ]);
  // A status lost (not by fading): the feed's line (wave 29).
  const SPARK_LOST = '{name} takes the hint.';
  /* The narrator's cue, present demeanour only (design section 8, with
     "; " made ", ": a field separator never sits inside one). Each is a
     list of clauses, so a cue can stop at a whole clause. */
  const CUES = deepFreeze({
    'hates you': ["won't share a room with you if they can help it", 'says it with their face'],
    // Wave 30: "would rather you left" for the design's "wants you gone", which reads as the spark status "wants you" to the minor checks.
    'against you': ['polite as a locked door', 'would rather you left'],
    contempt: ['talks past you'],
    'suspicious of you': ['checks every answer', 'gives nothing for free'],
    'cool to you': ['civil and brief', 'waits for you to leave'],
    'sizing you up': ['watches what you do, not what you say'],
    "doesn't know you": ['treats you like a stranger'],
    'takes you at your word': ['matter-of-fact', 'believes what you tell them'],
    friendly: ['easy with you', 'small talk comes easy'],
    "fond of you, doesn't trust you": ['glad to see you', 'changes the subject or lies when pressed'],
    'warm to you': ['glad to see you', 'easy to ask small things of'],
    'in your corner': ['glad to see you', 'tells you things', 'asks your advice'],
    'loyal to you': ['takes your side out loud'],
    'afraid of you': ['agrees fast', "won't meet your eye", 'keeps their distance'],
    'afraid of what you know': ['careful with every word', "won't look at you long", 'hates you for it'],
    'uneasy around you': ['keeps a step back'],
    'wary of your temper': ['careful around you', "doesn't argue"],
    'has something on you': ['sure of themselves around you'],
    'you have something on them': ['careful around you'],
    'you have something on each other': ['careful around you'],
    seriously: ['takes you seriously'],
    // Wave 30 (design section 10): pity, liking 25 while the player is hurt, broke or beaten.
    pity: ['worries about you']
  });
  // Wave 30: words that read as romance; a minor's reasons and what they hold the player to never carry them.
  const ROMANCE_TEXT = /\b(flirt\w*|kiss\w*|wink\w*|dated?|dating|asked (me|him|her|them) out|pretty|cute|sweetheart|darling|beautiful|gorgeous|sexy|handsome|in love|crush)\b/i;
  // The harm a "talks past you" needs on top: words and honesty, never a hurt (exposed counts as harm).
  const CONTEMPT_EVENTS = Object.freeze(['insulted', 'pried', 'humiliated', 'lied_caught', 'broke_word', 'told_anyway', 'caught_you_at']);
  // What an onlooker takes (design section 4.3; wave 27): one class lighter, floor 0, one copy a scene.
  const WITNESS = deepFreeze({
    hit: { w: -5, t: -5, f: 8 }, shoved: { w: -3, f: 3 }, beat_down: { w: -8, t: -6, f: 12 }, threatened: { w: -3, f: 5 }, insulted: { w: -2 }, humiliated: { w: -2 },
    defended: { w: 5, t: 5 }, rescued: { w: 5, t: 5 }, kept_word: { t: 3 }, cheated: { t: -10 }, lied_caught: { t: -5 }
  });
  /* Their words for it, from the event and the place, never the victim's
     (design section 5.4; wave 27). {player} is the player's name, as every
     memory names them (the People card says "you"). */
  const SECONDHAND_TEXT = deepFreeze({
    seen: { hit: 'saw {player} hit {victim} at {place}', shoved: 'saw {player} shove {victim} at {place}', beat_down: 'saw {player} put {victim} down at {place}', threatened: 'saw {player} lean on {victim} at {place}',
      insulted: 'heard {player} run {victim} down at {place}', humiliated: 'saw {player} shame {victim} at {place}', defended: 'saw {player} stand up for {victim} at {place}', rescued: 'saw {player} help {victim} at {place}',
      kept_word: 'saw {player} keep their word to {victim}', cheated: 'saw {victim} catch {player} cheating at {place}', lied_caught: 'saw {player} caught lying to {victim}' },
    heard: { hit: 'heard {player} hit {victim} at {place}', beat_down: 'heard {player} put {victim} down at {place}', humiliated: 'heard {player} shamed {victim} at {place}', threatened: 'heard {player} leaned on {victim} at {place}' }
  });
  /* How much a leverage record weighs (wave 29): the informant loose end's
     options, what the player was caught at (a theft or a lie 2, a sneak or
     a search 1; violence never: it is already a memory and news), a
     secret's default. */
  const LEVERAGE_WEIGHT = deepFreeze({ looseEnd: [2, 2, 3], caught: { steal: 2, deceive: 2, sneak: 1, search: 1 }, secret: 2 });
  /* Every threshold the plan's gates read, as data (integration plan
     section 9.3), with the wave each lands in. Wave 27's are read now
     (rollMod, complies, the rescue on a defeat, the grudge and the report
     in World's step e, wontSell); the others still read attitude where
     they always did until their wave. */
  const GATES = deepFreeze({
    social: { wave: 27, liking: [[30, 1], [60, 2]], actions: ['persuade', 'talk', 'buy', 'sell', 'give'] },
    intimidate: { wave: 27, fear: [[20, 1], [40, 2]], likedAt: 40, liked: -1 },
    deceive: { wave: 28, trust: [[40, 2]], distrust: [[-25, -1], [-50, -2]] },
    floors: { wave: 28, ask: 'hard', lie: [[-25, 'hard'], [-50, 'very_hard']], intimidateHard: 'hard' },
    compliance: { wave: 27, fear: 40, actions: ['talk', 'persuade'], difficulties: ['easy', 'normal'] },
    secret: { wave: 28, trust: 40, knows: 30, fear: 60 },
    couch: { wave: 28, liking: 25, trust: 0, owedLiking: -25 },
    rescue: { wave: 27, liking: 25, owed: 1 },
    seats: { wave: 28, liking: -25, trust: -40 },
    dealer: { wave: 28, liking: -10, trust: -40 },
    rumour: { wave: 28, liking: -25, trust: -25 },
    grudge: { wave: 27, liking: -60, trust: -60 },
    favour: { wave: 28, liking: 50, trust: 20, owed: 2, owedLiking: -25, cashLiking: 25, cashTrust: 0 },
    report: { wave: 27, fear: 40, violenceLiking: 0, days: [1, 2] },
    wontSell: { wave: 27, days: 3, essentialDays: 1, markup: 1.25, liking: -25, roles: ['manager', 'owner', 'merchant', 'bartender', 'cashier'] },
    needs: { wave: 28, alibi: 40, ramp: 30, photo: 30 },
    /* Wave 29: spark (a status's feed line once a week a person; "wants
       you" at trust -25 or less says it does not trust the player), the
       night together (every gate, before narration), leverage (a demand at
       most 100 a weight and canRaise, $100 unless content raises it; keys
       in the narration and words in the ask; the price seed of a mercenary
       holder at liking 10, $50 a weight due in 2 days; the tell grudge at
       liking -60), favours owed (the payback at net 2 and liking above
       -25, cash only at liking 25 and trust 0; the ask-back after 5 days,
       again 3 later, then crossed), jealousy (a partner by label; someone
       at spark 30). */
    spark: { wave: 29, statusDays: 7, distrust: -25 },
    // Wave 35: the night reads romance 40 where it read liking 40.
    intimate: { wave: 35, spark: 50, romance: 40, trust: 30, knows: 30 },
    leverage: { wave: 29, perWeight: 100, canRaise: 100, keys: 2, overlap: 2, price: 50, priceDue: 2, priceLiking: 10, tellLiking: -60, liftDays: 1 },
    owed: { wave: 29, net: 2, liking: -25, cashLiking: 25, cashTrust: 0, askDays: 5, againDays: 3 },
    jealousy: { wave: 29, partner: { w: -15, t: -10 }, spark: 30, other: { w: -8, t: -5, s: -5, m: -5 }, partners: ['wife', 'husband', 'girlfriend', 'boyfriend', 'partner', 'spouse', 'fiance', 'fiancee'] },
    council: { wave: 30, royce: { trust: 30, knows: 25 }, friendly: { liking: 15 }, bought: { trust: 20 } },
    epilogue: { wave: 30, loretta: { liking: 40 } }
  });
  // The minor rule's row (wave 28): no spark part, and fear that buys nothing.
  const UNWANTED_ADVANCE = deepFreeze({ w: -20, t: -20, f: 10, k: 2, s: 0, m: 0, weight: 3, decay: 'wound', fearBuysNothing: true });
  const TEEN_RE = /\b(teens?|teenagers?|teenaged|student|schoolgirl|schoolboy|high school|middle school|county school|after school|kid|child|minor|freshman|sophomore|junior|senior at|grade)\b/i;

  // ----- context: the state and town a reading is for -----
  /* ctx: { s (a game state; the live one by default), town (its town copy),
     day, turn, place } . Tests may pass their own. */
  function context(ctx) {
    const c = isObj(ctx) ? ctx : {};
    const s = c.s !== undefined ? c.s : State.current;
    const town = c.town !== undefined ? c.town : State.town;
    const day = Number.isInteger(c.day) ? c.day : s && isObj(s.time) && Number.isInteger(s.time.day) ? s.time.day : 1;
    const turn = Number.isInteger(c.turn) ? c.turn : s && isObj(s.meta) ? s.meta.turn | 0 : 0;
    return { s: s || null, town: town || null, day, turn, place: c.place !== undefined ? c.place : s && s.player ? s.player.locationId : null, used: c.used };
  }
  function builtIn(ctx) { return !ctx.s || !isObj(ctx.s.meta) || ctx.s.meta.townName === TOWN_DATA.name; }
  function townRecord(id, ctx) { return ctx.town && Array.isArray(ctx.town.npcs) ? (ctx.town.npcs.find(x => isObj(x) && x.id === id) || null) : null; }
  /* A field content writes on a person (wave 29: secretWeight, canRaise,
     mattersTo, leverageKeys, whenTold, mercenary): the record's own, else
     the save's town copy, else (the built-in town) the live TOWN_DATA
     record by id, so an older save reads what the town says now. */
  function authored(n, key, ctx) {
    if (!isObj(n)) return undefined;
    ctx = context(ctx);
    if (n[key] !== undefined && n[key] !== null) return n[key];
    const rec = townRecord(n.id, ctx);
    if (rec && rec[key] !== undefined && rec[key] !== null) return rec[key];
    const live = builtIn(ctx) ? TOWN_DATA.npcs.find(x => x.id === n.id) : null;
    return live && live[key] !== undefined && live[key] !== null ? live[key] : undefined;
  }

  // ----- who someone is -----
  /* A faction's head: someone in a faction whose role says they lead it
     (head, boss, chief, leader): Carter, Wade and Marcus in the built-in
     town. */
  function isFactionHead(n) { return !!(isObj(n) && n.factionId && /\b(head|boss|chief|leader)\b/i.test(String(n.role || ''))); }
  /* { p, g, n, r, mercenary, hard, tough }: content's axes (on the record
     or its town record) where given, else the sum over TRAIT_AXES, each held
     to +/-2. Hard is nerve 1 or more, the tough tag, or a faction head. */
  function axesOf(n, ctx) {
    ctx = context(ctx);
    const rec = isObj(n) ? townRecord(n.id, ctx) : null;
    const own = isObj(n) && isObj(n.axes) ? n.axes : rec && isObj(rec.axes) ? rec.axes : null;
    const sum = { p: 0, g: 0, n: 0, r: 0 };
    for (const tr of isObj(n) && Array.isArray(n.personality) ? n.personality : []) {
      const a = TRAIT_AXES[String(tr).toLowerCase().trim()];
      if (a) { sum.p += a[0]; sum.g += a[1]; sum.n += a[2]; sum.r += a[3]; }
    }
    for (const k of ['p', 'g', 'n', 'r']) { if (own && Number.isFinite(own[k])) sum[k] = own[k]; sum[k] = clamp(Math.round(sum[k]), -2, 2); }
    const tags = isObj(n) && Array.isArray(n.tags) ? n.tags.map(t => String(t).toLowerCase()) : [];
    const tough = tags.includes('tough');
    const mercenary = authored(n, 'mercenary', ctx) === true;
    return { p: sum.p, g: sum.g, n: sum.n, r: sum.r, mercenary, tough, hard: sum.n >= AXIS_EFFECTS.nerve.hardAt || tough || isFactionHead(n) };
  }
  /* Under 18, by the strictest anchor (design section 2.7): the lowest of
     the record's age, the save's town copy and, for the built-in town, the
     live TOWN_DATA record by id; or tagged teen or teenager; or, with no age
     anywhere, a role, tag or look that reads as a teen (it fails closed).
     An edit can make someone a minor, never an adult. */
  function isMinor(n, ctx) {
    if (!isObj(n)) return true;
    ctx = context(ctx);
    const copy = townRecord(n.id, ctx);
    const live = builtIn(ctx) ? (TOWN_DATA.npcs.find(x => x.id === n.id) || null) : null;
    const recs = [n, copy, live].filter(isObj);
    const ages = recs.map(r => r.age).filter(a => Number.isInteger(a));
    if (ages.length && Math.min(...ages) < 18) return true;
    const tags = recs.flatMap(r => (Array.isArray(r.tags) ? r.tags : [])).map(t => String(t).toLowerCase());
    if (tags.includes('teen') || tags.includes('teenager')) return true;
    return !ages.length && recs.some(r => TEEN_RE.test(`${r.role || ''} ${(Array.isArray(r.tags) ? r.tags : []).join(' ')} ${r.look || ''}`));
  }
  // The player under 18, or of no recorded age (that counts as under 18 for romance only), or no game: no spark for anyone.
  function playerMinor(ctx) {
    ctx = context(ctx);
    const p = ctx.s && isObj(ctx.s.player) ? ctx.s.player : null;
    return !p || !Number.isInteger(p.age) || p.age < 18;
  }
  // The town's romance list ([{ npcId, sparkRate, opensAt, difficulty }], wave 29; tuning only since wave 34): the save's copy, else the built-in town's.
  function romanceOf(ctx) {
    ctx = context(ctx);
    if (ctx.town && Array.isArray(ctx.town.romance)) return ctx.town.romance.filter(isObj);
    return builtIn(ctx) && Array.isArray(TOWN_DATA.romance) ? TOWN_DATA.romance.filter(isObj) : [];
  }
  /* Spark can move for them: an adult, with an adult player. Wave 34 (the
     owner: "everyone should be allowed to go to 100"): the romance list no
     longer gates anyone; it is per-person tuning (tuningOf). */
  function eligible(n, ctx) {
    ctx = context(ctx);
    return isObj(n) && !isMinor(n, ctx) && !playerMinor(ctx);
  }
  function romanceEntry(n, ctx) { return isObj(n) ? romanceOf(ctx).find(x => x.npcId === n.id) || null : null; }
  /* Wave 34: how someone takes to the player's interest, their entry on
     the list over the defaults (anyone not listed: rate 0.5, opens at
     knows 10, hard). faithful: true (wave 29's word) reads as very_hard;
     an old save's open: false is no longer read. Wave 35: romanceRate,
     what romance's gains are scaled by, defaults to the sparkRate. Returns
     { sparkRate, romanceRate, opensAt, difficulty, listed }. */
  const ROMANCE_DEFAULTS = deepFreeze({ sparkRate: 0.5, opensAt: 10, difficulty: 'hard' });
  // The spark at which a flirt eases two steps, and one (never below easy).
  const ROMANCE_EASE = deepFreeze([[40, 2], [20, 1]]);
  function tuningOf(n, ctx) {
    const r = romanceEntry(n, ctx);
    const D = ROMANCE_DEFAULTS;
    if (!r) return { sparkRate: D.sparkRate, romanceRate: D.sparkRate, opensAt: D.opensAt, difficulty: D.difficulty, listed: false };
    const sr = Number.isFinite(r.sparkRate) ? clamp(r.sparkRate, 0.1, 2) : D.sparkRate;
    return {
      sparkRate: sr,
      romanceRate: Number.isFinite(r.romanceRate) ? clamp(r.romanceRate, 0.1, 2) : sr,
      opensAt: isObj(r.opensAt) && Number.isFinite(r.opensAt.knows) ? clamp(r.opensAt.knows, 0, 100) : D.opensAt,
      difficulty: r.faithful === true ? 'very_hard' : DIFFS.includes(r.difficulty) ? r.difficulty : D.difficulty,
      listed: true
    };
  }
  function sparkRate(n, ctx) { return tuningOf(n, ctx).sparkRate; }
  function romanceRate(n, ctx) { return tuningOf(n, ctx).romanceRate; }
  // A flirt's charm roll with them (wave 34): their difficulty, eased a step at spark 20 and two at 40, never below easy.
  function flirtDifficulty(n, ctx) {
    ctx = context(ctx);
    const base = DIFFS.indexOf(tuningOf(n, ctx).difficulty);
    const s = tracksOf(n, ctx).s;
    const ease = (ROMANCE_EASE.find(([at]) => s >= at) || [0, 0])[1];
    return DIFFS[Math.max(0, base - ease)];
  }
  /* Whether a flirt is taken as one now (design section 2.5; decided
     before the narrator writes): eligible (an adult, an adult player) and
     knowing the player at least their opensAt. Wave 34: it then rolls
     charm at flirtDifficulty and the tier decides how it lands
     (flirtAnswer, at resolve); short of opensAt it is turned aside,
     kindly, with no roll. Liking is not needed (the dice read it, rollMod):
     that is how "using you" happens. Returns { ok, why, soon?, difficulty? }. */
  function welcomeOf(n, ctx) {
    ctx = context(ctx);
    if (!eligible(n, ctx)) return { ok: false, why: isObj(n) && isMinor(n, ctx) ? 'under 18' : 'the player is under 18 or has no age' };
    const opens = tuningOf(n, ctx).opensAt;
    const k = cacheOf(n, ctx).k;
    if (k < opens) return { ok: false, soon: true, why: `knows the player ${k}, opens at ${opens}` };
    return { ok: true, why: null, difficulty: flirtDifficulty(n, ctx) };
  }
  /* How a flirt lands (wave 34), by the charm roll's tier (null: short of
     their opensAt, no roll): critical, welcome with spark 15 x their rate
     (liking +4, knows +2); success, welcome (the row: liking +4, knows +2,
     spark 10 x the rate); partial, turned aside kindly, nothing changes;
     failure, unwelcome (liking 3 the first time, 6 after; trust 3, spark
     5); critical failure, unwelcome at twice the liking and a weight-2
     memory, "came on to me and made it awkward". Too soon: turned aside
     kindly, the first time free, liking 1 after (soon: applyEvent reads
     it). Returns { answer: 'welcome' | 'aside' | 'no', tier, d?, weight?,
     awkward?, soon? }. */
  function flirtAnswer(n, tier, ctx) {
    ctx = context(ctx);
    if (!tier) return { answer: 'aside', tier: null, soon: true };
    if (tier === 'critical') return { answer: 'welcome', tier, d: { s: Math.round(15 * sparkRate(n, ctx)) } };
    if (tier === 'success') return { answer: 'welcome', tier };
    if (tier === 'partial') return { answer: 'aside', tier };
    const w = isObj(n) && isObj(n.rel) && n.rel.unwelcomeOnce === true ? -6 : -3;
    // Wave 35: an unwelcome flirt grows no romance (m 0 over the row's +2).
    if (tier === 'critical_failure') return { answer: 'no', tier, d: { w: 2 * w, t: -3, s: -5, m: 0 }, weight: 2, awkward: true };
    return { answer: 'no', tier: 'failure', d: { w, t: -3, s: -5, m: 0 } };
  }
  // The narrator's words for an answer, after the name (wave 34).
  function flirtWords(n, answer) {
    const they = !PRONOUN_FORMS[n.pronouns] || n.pronouns === 'they';
    const f = PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they;
    const s = they ? '' : 's';
    return answer === 'welcome' ? ` is open to it: ${f.subj} flirt${s} back, ${f.det} own way.` : answer === 'aside' ? ` turn${s} it aside, kindly.` : ` isn't interested: ${f.subj} turn${s} it aside.`;
  }
  /* The engine's flirted event for an answer (Pipeline's, and State's late
     flirt), or null when nothing changes (a partial). who: the player's
     name; place: where it happened. */
  function flirtEventOf(n, ans, who, place) {
    if (!isObj(n) || !isObj(ans)) return null;
    if (ans.answer === 'welcome') return Object.assign({ npcId: n.id, event: 'flirted', text: `${who} flirted with me at ${place}` }, ans.d ? { d: Object.assign({}, ans.d) } : {});
    if (ans.answer === 'no') return Object.assign({ npcId: n.id, event: 'flirted', d: Object.assign({}, ans.d), text: ans.awkward ? `${who} came on to me and made it awkward` : `${who} came on to me and I wasn't having it` }, ans.weight ? { weight: ans.weight } : {});
    if (ans.soon) return { npcId: n.id, event: 'flirted', soon: true, text: `${who} flirted with me before we knew each other` };
    return null;
  }

  // ----- the record -----
  /* Where someone stood before the player came. townNpc: their record in
     the town data (left out: n is that record); null: nobody wrote them,
     so liking starts at 0 (as the old drift's baseline did) and trust from
     their own traits and work. */
  function startOf(n, townNpc) {
    const rec = townNpc === undefined ? n : townNpc;
    const src = isObj(rec) ? rec : n;
    const ax = axesOf(src, { s: null, town: null });
    const tags = Array.isArray(src.tags) ? src.tags.map(t => String(t).toLowerCase()) : [];
    const police = tags.includes('police') || /\b(police|sheriff|deputy|trooper)\b/i.test(String(src.role || ''));
    let t = AXIS_EFFECTS.guarded.startTrust * ax.g - (police || tags.includes('smuggler') ? 10 : 0);
    if (isObj(src.start) && Number.isInteger(src.start.trust)) t = clamp(src.start.trust, -100, 100);
    const f = isObj(src.start) && Number.isInteger(src.start.fear) ? clamp(src.start.fear, 0, 100) : 0;
    const w = isObj(rec) && Number.isInteger(toInt(rec.attitude)) ? clamp(toInt(rec.attitude), -100, 100) : 0;
    return { w, t, f, k: 0, s: 0, m: 0 };
  }
  function emptyRel(start) {
    return { v: 1, start, everyday: { w: 0, t: 0, k: 0, s: 0, m: 0 }, fix: { w: 0, t: 0, f: 0, k: 0, s: 0, m: 0 }, today: null, days: {}, recent: [], asks: [], owed: [] };
  }
  /* A change into a person's everyday bucket, held to its bound; what
     would pass it goes into fix (attitudeDelta's exact meaning). Fear has
     no everyday bucket: it goes into fix. */
  function putEveryday(rel, x, K) {
    if (!K) return;
    if (x === 'f') { rel.fix.f = num(rel.fix.f) + K; return; }
    const cur = num(rel.everyday[x]);
    const lo = x === 'k' ? 0 : -CAPS.everyday;
    const hi = x === 'k' ? RANGE.k[1] : CAPS.everyday;
    const next = clamp(cur + K, lo, hi);
    rel.everyday[x] = next;
    if (cur + K !== next) rel.fix[x] = num(rel.fix[x]) + (cur + K - next);
  }
  /* A new rel for someone who has none (a new game's town, an older save,
     a person made in play): their start, and liking exactly their attitude
     (the difference in everyday, past its bound in fix). */
  function fill(n, townNpc) {
    const rel = emptyRel(startOf(n, townNpc));
    const a = toInt(n.attitude);
    putEveryday(rel, 'w', (a === null ? rel.start.w : clamp(a, -100, 100)) - rel.start.w);
    return rel;
  }
  const numbers = (o, keys) => keys.reduce((out, k) => { const v = isObj(o) ? o[k] : 0; out[k] = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : 0; return out; }, {});
  function wellFormed(r) {
    return isObj(r) && r.v === 1 && isObj(r.start) && isObj(r.everyday) && isObj(r.fix) && isObj(r.days) && (r.today === null || isObj(r.today))
      && Array.isArray(r.recent) && Array.isArray(r.asks) && Array.isArray(r.owed);
  }
  /* The person's rel made whole: as it is when it is, else every part
     checked (a hand-edited or older save), a missing record filled. */
  function repair(n, townNpc) {
    const r = n.rel;
    if (wellFormed(r)) {
      // Wave 35, no rules-version bump: a record from before romance gets it at 0 (a load-time fill).
      if (['start', 'everyday', 'fix'].every(b => r[b].m !== undefined)) return r;
      const out = Object.assign({}, r);
      for (const b of ['start', 'everyday', 'fix']) out[b] = r[b].m !== undefined ? r[b] : Object.assign({}, r[b], { m: 0 });
      return out;
    }
    if (!isObj(r)) return fill(n, townNpc);
    const out = Object.assign({}, r, { v: 1 });
    out.start = numbers(isObj(r.start) ? r.start : startOf(n, townNpc), TRACKS);
    out.everyday = numbers(r.everyday, ['w', 't', 'k', 's', 'm']);
    out.fix = numbers(r.fix, TRACKS);
    out.today = isObj(r.today) && Number.isInteger(r.today.day) ? Object.assign({}, r.today, { ev: isObj(r.today.ev) ? r.today.ev : {} }) : null;
    out.days = isObj(r.days) ? r.days : {};
    out.recent = list(r.recent);
    out.asks = list(r.asks);
    out.owed = list(r.owed);
    if (!isObj(out.bands)) delete out.bands;
    return out;
  }
  function copyRel(r) { return JSON.parse(JSON.stringify(r)); }

  // ----- memories -----
  /* The day a memory was made: its own day, else the log's day for its
     turn (World's own until wave 26; the drift's hold and fading both read
     it), null when the log no longer reaches back to it. */
  function memoryDay(m, s) {
    if (Number.isInteger(m.day)) return m.day;
    if (!(m.turn > 0)) return 1;
    const log = (s && Array.isArray(s.log) ? s.log : []).filter(e => isObj(e) && Number.isInteger(e.turn) && Number.isInteger(e.day));
    const at = log.filter(e => e.turn <= m.turn).pop();
    return at ? at.day : null;
  }
  // For fading: a memory with no day and none in the log is a week old.
  function dayOf(m, ctx, day) { const d = memoryDay(m, ctx.s); return d === null ? day - 7 : d; }
  function classOf(m) {
    if (typeof m.decay === 'string' && DECAY[m.decay]) return m.decay;
    const r = EVENTS[m.event];
    return r && DECAY[r.decay] ? r.decay : 'wound';
  }
  // Harm or kind, by what it did (a typed memory) or by its event.
  function harmful(m) {
    if (isObj(m.d)) { const v = num(m.d.w) + num(m.d.t); return v < 0 || (v === 0 && num(m.d.f) > 0); }
    const r = EVENTS[typeMemory(m)];
    return !!r && r.w + r.t < 0;
  }
  function settlements(m) { return list(m.settled).filter(e => !e.folded); }
  function settleShare(m, x) { let f = 1; for (const e of settlements(m)) f *= 1 - clamp(num(e[x]), 0, 1); return f; }
  /* What of a typed memory's part still counts after age whole days:
     floor + (1 - floor) x 0.5^(age / half-life), the half-life x 2^(-r/2)
     for harm; fear on its own clock; spark on the slight clock (intimacy on
     the scar clock); romance on the bond clock (wave 35: ROMANCE_CLOCK, 14
     days, floor 0; intimacy on the scar clock); knows-you always. held: a protected line while its
     loose end is open does not fade. */
  function fade(m, x, age, ax, held) {
    if (x === 'k') return 1;
    if (x === 'f') return Math.pow(0.5, age / FEAR_CLOCK[0]);
    if (x === 's') { const sc = m.event === 'intimate'; const half = sc ? DECAY.scar[0] : DECAY.slight[0]; const fl = sc ? DECAY.scar[1] : 0; return fl + (1 - fl) * Math.pow(0.5, age / half); }
    // Wave 35: romance fades on the bond clock (half-life 14 days, floor 0); a night together on the scar clock, as spark.
    if (x === 'm') { const sc = m.event === 'intimate'; const half = sc ? DECAY.scar[0] : ROMANCE_CLOCK[0]; const fl = sc ? DECAY.scar[1] : ROMANCE_CLOCK[1]; return fl + (1 - fl) * Math.pow(0.5, age / half); }
    if (held) return 1;
    const light = !!(m.witness || m.secondhand);
    let c = classOf(m);
    if (light) c = LIGHTER[c] || c;
    const [half, fl] = DECAY[c];
    if (!Number.isFinite(half)) return 1;
    const harm = harmful(m);
    const floor = light ? 0 : isObj(fl) ? (harm ? fl.harm : fl.kind) : fl;
    const gr = harm ? Math.pow(2, AXIS_EFFECTS.grudge.halfLife * num(ax && ax.r)) : 1;
    return floor + (1 - floor) * Math.pow(0.5, age / (half * gr));
  }
  function tiedByLooseEnd(n, s) {
    if (!s || !isObj(s.player)) return false;
    return (Array.isArray(s.player.looseEnds) ? s.player.looseEnds : []).some(le => {
      if (!isObj(le) || le.npcId !== n.id) return false;
      if (s === State.current) { const t = State.thread(le.threadId); return !t || State.threadNow(t, 'status') === 'open'; }
      const t = (Array.isArray(s.threads) ? s.threads : []).find(x => isObj(x) && x.id === le.threadId);
      return !t || t.status === 'open';
    });
  }
  /* A typed memory's remaining part on each track: d x what settling left x
     the fade. A memory with no d moves nothing. */
  function remainder(m, n, day, ax, ctx) {
    ctx = context(ctx);
    const out = { w: 0, t: 0, f: 0, k: 0, s: 0, m: 0 };
    if (!isObj(m) || !isObj(m.d)) return out;
    day = Number.isInteger(day) ? day : ctx.day;
    ax = ax || axesOf(n, ctx);
    const age = Math.max(0, day - dayOf(m, ctx, day));
    const held = !!(State.protectedMemory(m) && tiedByLooseEnd(n, ctx.s));
    for (const x of TRACKS) {
      const v = num(m.d[x]);
      if (v) out[x] = v * (x === 'k' || x === 's' || x === 'm' ? 1 : settleShare(m, x)) * fade(m, x, age, ax, held);
    }
    return out;
  }
  /* Every track before rounding and clamping: start + everyday + fix + what
     each memory still carries (fear without its leverage share). */
  function raw(n, day, ctx) {
    ctx = context(ctx);
    day = Number.isInteger(day) ? day : ctx.day;
    const r = isObj(n.rel) ? n.rel : fill(n, townRecord(n.id, ctx));
    const st = r.start || {}, ev = r.everyday || {}, fx = r.fix || {};
    const out = {};
    for (const x of TRACKS) out[x] = num(st[x]) + num(ev[x]) + num(fx[x]);
    const ax = axesOf(n, ctx);
    for (const m of list(n.memories)) {
      if (!isObj(m.d)) continue;
      const q = remainder(m, n, day, ax, ctx);
      for (const x of TRACKS) out[x] += q[x];
    }
    return out;
  }
  /* The fear leverage gives (wave 29): 10 x weight for each aware record the
     player holds over them (held, used or paid), halved at trust 40 and
     halved again once paid. It lasts while the record does. */
  function leverageFear(n, t, ctx) {
    const recs = ctx.s && Array.isArray(ctx.s.leverage) ? ctx.s.leverage : [];
    let f = 0;
    for (const x of recs) {
      if (!isObj(x) || x.holder !== 'player' || x.over !== n.id || x.aware !== true || !['held', 'used', 'paid'].includes(x.status)) continue;
      f += 10 * clamp(toInt(x.weight) || 1, 1, 3) * (t >= 40 ? 0.5 : 1) * (x.status === 'paid' ? 0.5 : 1);
    }
    return f;
  }
  /* Wave 35 (the Edit form's "Owes you"): the ledger brought to read
     exactly v (-3..3): one entry for the difference, set by hand ({ dir,
     size, key, day, turn, why }), after room is made for it under
     CAPS.owedEntries; nothing when it already reads v. It is an entry like
     any other, so the favour seeds (World.owedFavour, owedAsk) read it. */
  function owedTo(r, v, key, day, turn) {
    const keep = list(r && r.owed);
    const kept = keep.length >= CAPS.owedEntries ? keep.slice(-(CAPS.owedEntries - 1)) : keep.slice();
    const rawNet = kept.reduce((sum, o) => sum + Math.sign(num(o.dir)) * Math.abs(num(o.size) || 1), 0);
    if (owedNet({ owed: keep }) === v) return keep;
    if (rawNet === v) return kept;
    return kept.concat([{ dir: Math.sign(v - rawNet), size: Math.abs(v - rawNet), key, day, turn, why: 'set by hand' }]);
  }
  function owedNet(r) { return clamp(list(r && r.owed).reduce((sum, o) => sum + Math.sign(num(o.dir)) * Math.abs(num(o.size) || 1), 0), -CAPS.owed, CAPS.owed); }
  /* A band with its hysteresis: kept while the value is no more than
     CAPS.hysteresis back toward the middle; a band further out is entered
     at its own edge. */
  function band(track, v, prev) {
    const bands = BANDS[track];
    const at = bands.find(b => v >= b[1] && v <= b[2]) || (v < bands[0][1] ? bands[0] : bands[bands.length - 1]);
    if (!prev || prev === at[0]) return at[0];
    const pi = bands.findIndex(b => b[0] === prev);
    if (pi < 0) return at[0];
    const p = bands[pi];
    const ci = bands.findIndex(b => b[0] === BANDS.centre[track]);
    const H = CAPS.hysteresis;
    if (pi > ci && v >= p[1] - H && v <= p[2]) return prev;
    if (pi < ci && v <= p[2] + H && v >= p[1]) return prev;
    return at[0];
  }
  /* The cache relWrite keeps: { w, t, f, k, s, m, net, levFear, bands }.
     Liking and trust -100..100; fear 0..100 with its leverage share, a hard
     person's held to CAPS.hardFear; knows 0..100; spark and romance (wave
     35) 0 unless eligible (a minor, or a player under 18; wave 34: no list
     gates it); the
     bands entered, read against the previous ones (n.rel.bands). */
  function recompute(n, day, ctx) {
    ctx = context(ctx);
    day = Number.isInteger(day) ? day : ctx.day;
    const r = raw(n, day, ctx);
    const ax = axesOf(n, ctx);
    // (|| 0: a part faded to nothing reads 0, never -0.)
    const w = clamp(Math.round(r.w), -100, 100) || 0;
    const t = clamp(Math.round(r.t), -100, 100) || 0;
    const lev = leverageFear(n, t, ctx);
    const f = clamp(Math.round(r.f + lev), 0, ax.hard ? CAPS.hardFear : 100) || 0;
    const k = clamp(Math.round(r.k), 0, 100) || 0;
    const open = eligible(n, ctx);
    const s = open ? clamp(Math.round(r.s), 0, 100) || 0 : 0;
    const m = open ? clamp(Math.round(r.m), 0, 100) || 0 : 0;
    const prev = isObj(n.rel) && isObj(n.rel.bands) ? n.rel.bands : {};
    const bands = { w: band('w', w, prev.w), t: band('t', t, prev.t), f: band('f', f, prev.f), s: band('s', s, prev.s), m: band('m', m, prev.m) };
    /* The status with its hysteresis (sp: null for anyone it cannot move
       for; wave 35: read off spark and romance), and fear's override (ov:
       'know' when what the player holds is the larger share of the fear,
       'you', or null). */
    bands.sp = open ? statusFor({ t, s, m }, prev.sp, () => earnedDistrust(n, ax)) : null;
    const levR = Math.round(lev);
    bands.ov = bands.f === 'afraid' && !ax.hard && w >= OVERRIDES.window[0] && w < OVERRIDES.window[1] ? (levR > f - levR ? 'know' : 'you') : null;
    return { w, t, f, k, s, m, net: owedNet(n.rel), levFear: levR, bands };
  }
  /* Distrust the player earned (the integration plan's 19.5): an unsettled
     first-hand memory of a harm with trust in it (a caught lie, a theft, a
     blow, a cheat, being crossed, threatened or blackmailed; never a flirt,
     never what they did to the player), or the mercenary flag. */
  function earnedDistrust(n, ax) {
    if (ax && ax.mercenary) return true;
    return list(n.memories).some(m => isObj(m.d) && !m.witness && !m.secondhand && m.act !== 'own' && !ROMANCE_EVENTS.includes(m.event) && num(m.d.t) < 0 && harmful(m) && !settlements(m).length);
  }
  /* The spark status for these numbers (SPARK_STATUS, first match wins):
     the status held before (prev) keeps every threshold 5 back. earned: a
     function, read only when a status needs it. */
  function statusFor(c, prev, earned) {
    let known = null;
    const isEarned = () => (known === null ? (known = !!earned()) : known);
    for (const st of SPARK_STATUS) {
      const H = st.status === prev ? CAPS.hysteresis : 0;
      if (st.spark !== undefined && c.s < st.spark - H) continue;
      if (st.romance !== undefined && c.m < st.romance - H) continue;
      if (st.below !== undefined && c.m >= st.below + H) continue;
      if (st.distrust !== undefined && c.t > st.distrust + H) continue;
      if (st.earned && !isEarned()) continue;
      return st.status;
    }
    return null;
  }
  function cacheOf(n, ctx) {
    const r = isObj(n) ? n.rel : null;
    if (isObj(r) && TRACKS.every(x => Number.isInteger(r[x])) && isObj(r.bands)) return r;
    const tmp = Object.assign({}, n, { rel: isObj(r) ? repair(n, townRecord(n.id, context(ctx))) : fill(n, townRecord(n.id, context(ctx))) });
    return Object.assign({}, tmp.rel, recompute(tmp, undefined, ctx));
  }
  /* { w, t, f, k, s, m, owed }: what a gate or a card reads. Liking is the
     alias (n.attitude), so a direct write to it reads at once. */
  function tracksOf(n, ctx) {
    if (!isObj(n)) return { w: 0, t: 0, f: 0, k: 0, s: 0, m: 0, owed: 0 };
    const c = cacheOf(n, ctx);
    const a = toInt(n.attitude);
    return { w: a === null ? c.w : clamp(a, -100, 100), t: c.t, f: c.f, k: c.k, s: c.s, m: c.m | 0, owed: c.net | 0 };
  }
  /* The rel that makes each given track read exactly its target now
     (targets: { w?, t?, f?, k?, s?, m? }, whole numbers): the difference goes
     into fix ('fix', the editor and relSet) or everyday ('everyday', with
     what would pass its bound in fix; fear always in fix), or per track
     ({ w: 'fix', t: 'everyday' }). Returns a new rel; n is not touched. */
  function landTo(n, targets, buckets, ctx) {
    ctx = context(ctx);
    const tmp = Object.assign({}, n, { rel: copyRel(repair(n, townRecord(n.id, ctx))) });
    const open = eligible(n, ctx);
    for (let pass = 0; pass < 3; pass++) {
      const r = raw(tmp, ctx.day, ctx);
      const t = clamp(Math.round(r.t), -100, 100);
      r.f += leverageFear(tmp, t, ctx);
      let moved = false;
      for (const x of TRACKS) {
        if (!isObj(targets) || !Number.isInteger(targets[x]) || (ROMANTIC.includes(x) && !open)) continue;
        const K = targets[x] - Math.round(r[x]);
        if (!K) continue;
        moved = true;
        const b = typeof buckets === 'string' ? buckets : isObj(buckets) && buckets[x] ? buckets[x] : 'fix';
        if (b === 'fix') tmp.rel.fix[x] = num(tmp.rel.fix[x]) + K; else putEveryday(tmp.rel, x, K);
      }
      if (!moved) break;
    }
    return tmp.rel;
  }
  // Every track a pin holds: spark and romance only for someone they can move for.
  function pinOf(c, open) { const o = { w: c.w, t: c.t, f: c.f, k: c.k }; if (open) { o.s = c.s; o.m = c.m | 0; } return o; }

  // ----- the legacy typing -----
  const ACT_KIND = Object.freeze({ attack: 'violence', steal: 'theft', talk: 'insult', persuade: 'insult', deceive: 'insult', intimidate: 'insult' });
  const CLASS_KIND = Object.freeze({ violence: 'violence', theft: 'theft', threat: 'insult', words: 'insult' });
  const INSULT_WORDS = /\b(insult\w*|called me|calls me|said i|says i|told me to|mock\w*|laugh\w* at|liar|lied|threat\w*|cheat\w*|cuss\w*|curs\w*|spat at|spit at)\b/;
  const VIOLENCE_WORDS = /\b(attack\w*|hit|hits|punch\w*|beat|beaten|knock\w*|shov\w*|fight|fought|slapp?\w*|hurt)\b/;
  const THEFT_WORDS = /\b(stole|steal\w*|thief|rob\w*|took my|pickpocket\w*)\b/;
  /* What a grudge's memory is about (World.memoryKind): violence, theft,
     insult or null. A typed memory by its event; a legacy one by the kind
     of turn it was made in (act), else by its words (an insult's first). */
  function kindOf(m) {
    if (m && m.act === 'own') return null;
    if (m && isObj(m.d) && EVENTS[m.event]) { const r = EVENTS[m.event]; return r.w + r.t >= 0 ? null : (CLASS_KIND[r.dedupe] || 'insult'); }
    if (m && ACT_KIND[m.act]) return ACT_KIND[m.act];
    const t = String((m && m.text) || '').toLowerCase().replace(/[’]/g, "'");
    if (INSULT_WORDS.test(t)) return 'insult';
    if (VIOLENCE_WORDS.test(t)) return 'violence';
    if (THEFT_WORDS.test(t)) return 'theft';
    return null;
  }
  const KIND_WORDS = Object.freeze([
    [/\b(gave me|bought me|paid me|tipped me|brought me|paid back|paid up)\b/, 'gift'],
    [/\b(helped|fixed|carried|covered for|saved|pulled me|dragged me|looked after|gave me a ride|patched me)\b/, 'did_favour'],
    [/\b(thank\w*|compliment\w*|praised|was kind|was nice|stood up for)\b/, 'complimented'],
    [/\b(told me (about|that|how|where|why|what)|confided|trusted me)\b/, 'they_confided']
  ]);
  /* The event a legacy line would have been (its kind, for the stance and
     the reasons): by its words first, then by the turn it was made in;
     what they did to the player, a loose end and a fact are noted. It moves
     nothing (d stays null). */
  function typeMemory(m) {
    if (!isObj(m)) return 'noted';
    if (typeof m.event === 'string' && EVENTS[m.event]) return m.event;
    if (m.act === 'own' || State.protectedMemory(m)) return 'noted';
    const t = String(m.text || '').toLowerCase().replace(/[’]/g, "'");
    if (/\bthreat\w*/.test(t)) return 'threatened';
    if (/\b(liar|lied)\b/.test(t)) return 'lied_caught';
    if (/\bcheat\w*/.test(t)) return 'cheated';
    if (INSULT_WORDS.test(t)) return 'insulted';
    if (/\b(beat|beaten|knock\w* (me )?(down|out))\b/.test(t)) return 'beat_down';
    if (/\bshov\w*/.test(t)) return 'shoved';
    if (VIOLENCE_WORDS.test(t)) return 'hit';
    if (THEFT_WORDS.test(t)) return 'stole_from';
    for (const [re, ev] of KIND_WORDS) if (re.test(t)) return ev;
    if (m.act === 'attack') return 'hit';
    if (m.act === 'steal') return 'stole_from';
    if (m.act === 'intimidate') return 'threatened';
    return 'noted';
  }
  /* An event word as the bookkeeper may write it (wave 28): any case,
     spaces or hyphens, an alias, else a unique five-letter stem; null when
     it names nothing. */
  function eventName(word) {
    const w = String(word == null ? '' : word).toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, '');
    if (!w) return null;
    if (EVENTS[w]) return w;
    if (ALIASES[w]) return ALIASES[w];
    if (w.length < 5) return null;
    const hits = EVENT_NAMES.filter(e => e.slice(0, 5) === w.slice(0, 5));
    return hits.length === 1 ? hits[0] : null;
  }

  // ----- events -----
  // The text a settling event's words name, as memoriesSettled matches them: one holds the other, six characters at least.
  function named(m, want) {
    if (!want || want.length < 6 || State.protectedMemory(m)) return false;
    const t = String(m.text || '').toLowerCase();
    return t.includes(want) || (t.length >= 6 && want.includes(t));
  }
  function settleTarget(mems, how, text, day, ctx, skip) {
    const want = cleanText(text, 200).toLowerCase();
    const room = m => isObj(m.d) && m !== skip && (how.extra ? !list(m.settled).some(e => e.by === 'got_even' && !e.folded) : settlements(m).filter(e => e.by !== 'got_even').length < CAPS.settlements);
    const wanted = m => (how.on === 'harm' || how.on === 'named' ? harmful(m) : how.on === 'debt' ? m.event === 'broke_word' || harmful(m) : m.event === how.on);
    let i = mems.findIndex(m => room(m) && wanted(m) && named(m, want));
    if (i >= 0 || how.on === 'named') return i;
    for (let j = mems.length - 1; j >= 0; j--) {
      const m = mems[j];
      if (!room(m)) continue;
      if (how.on === 'harm' ? harmful(m) && day - dayOf(m, ctx, day) <= CAPS.mergeDays : how.on === 'debt' ? m.event === 'broke_word' : m.event === how.on) { i = j; break; }
    }
    return i;
  }
  function settleEntry(by, how, ax, ctx) {
    const scale = (1 + AXIS_EFFECTS.pride.settle * ax.p) * (1 + AXIS_EFFECTS.grudge.settle * ax.r);
    const part = a => two(clamp(num(a) * scale, 0, 1));
    return { turn: ctx.turn, day: ctx.day, by, w: part(how.w), t: part(how.t), f: part(how.f) };
  }
  /* A settlement on n's memory at index i (by: an event name, 'got_even' or
     'settled'): { rel, memories, ok, text, why }. Never deletes anything;
     at most CAPS.settlements plus getting even. */
  function settle(n, i, by, ctx) {
    ctx = context(ctx);
    const how = SETTLE[by] || SETTLE.settled;
    const mems = deepCopy(list(n.memories));
    const m = mems[i];
    if (!m || !isObj(m.d)) return { ok: false, why: 'that memory moves nothing to settle' };
    const used = settlements(m).filter(e => e.by !== 'got_even').length;
    if (how.extra ? list(m.settled).some(e => e.by === 'got_even' && !e.folded) : used >= CAPS.settlements) return { ok: false, why: `"${m.text}" is settled as far as it goes` };
    m.settled = list(m.settled).concat([settleEntry(by, how, axesOf(n, ctx), ctx)]);
    return { ok: true, rel: n.rel, memories: mems, text: m.text };
  }
  /* What one event does to a person (State's socialEvent): the plan, with
     nothing written. ev: { event, text, weight?, act?, aboutId?, private?,
     leverageId?, d? (a part of the row, as given), decay?, secondhand?,
     scale? }; ctx.used: what events moved them this turn so far. The
     row, then the person's traits, then the repeats (kind things the same
     day, time and gifts across days, harm that compounds and merges), then
     the bounds (a turn's, a hard person's fear, spark for nobody it cannot
     move for, knows-you at least CAPS.kMin), then the memory (or everyday),
     what it settles, the owed ledger and the counters. Returns { rel,
     memories, d, memory, merged, settled, refused, used }. */
  // A fight's blows, lightest first; a second blow of the same weight raises the fight's memory by this much (design section 3.1).
  const FIGHT_RANK = Object.freeze({ shoved: 1, hit: 2, beat_down: 3 });
  const FIGHT_RAISE = 1.4;
  /* The same blow again in one fight (applyEvent's ev.fight): its memory's
     part on liking, trust and fear raised to FIGHT_RAISE times (within the
     turn's bounds and a hard person's fear), its words the newest, knowing
     +CAPS.kMin; a lighter blow than the memory holds raises nothing. */
  function raiseFight(n, rel, mems, at, ev, ctx, now, ax, count) {
    const m = mems[at];
    const same = m.event === ev.event;
    const used = Object.assign({ w: 0, t: 0, f: 0, s: 0, m: 0 }, isObj(ctx.used) ? ctx.used : {});
    const d = { w: 0, t: 0, f: 0, k: CAPS.kMin, s: 0, m: 0 };
    if (same) {
      for (const x of ['w', 't', 'f']) {
        const v = rnd(num(m.d[x]) * (FIGHT_RAISE - 1));
        const cap = CAPS.turn[x];
        d[x] = clamp(used[x] + v, -cap, cap) - used[x];
        used[x] += d[x];
      }
      if (ax.hard && d.f > 0) { const room = Math.max(0, CAPS.hardFear - now.f); used.f -= d.f - Math.min(d.f, room); d.f = Math.min(d.f, room); }
      m.d = { w: two(num(m.d.w) + d.w), t: two(num(m.d.t) + d.t), f: two(num(m.d.f) + d.f), k: num(m.d.k) + d.k, s: num(m.d.s), m: num(m.d.m) };
      m.n = (num(m.n) || 1) + 1;
      m.turn = ctx.turn;
      m.day = ctx.day;
      const text = cleanText(ev.text, 400);
      if (text) m.text = text;
    } else m.d = Object.assign({}, m.d, { k: num(m.d.k) + d.k });
    rel.today.ev[ev.event] = count + 1;
    rel.recent = list(rel.recent).concat([{ ev: ev.event, day: ctx.day, at: ctx.place || null, turn: ctx.turn }]).slice(-CAPS.recent);
    return { rel, memories: mems, d, memory: m, merged: true, raised: same, settled: null, refused: [], used, weight: m.weight };
  }
  function applyEvent(n, ev, ctx) {
    ctx = context(ctx);
    const row = EVENTS[ev.event];
    if (!row) return null;
    const day = ctx.day;
    const turn = ctx.turn;
    const rel = copyRel(repair(n, townRecord(n.id, ctx)));
    const mems = deepCopy(list(n.memories));
    let now = recompute(Object.assign({}, n, { rel }), day, ctx);
    const ax = axesOf(n, ctx);
    const open = eligible(n, ctx);
    const refused = [];
    if (!isObj(rel.today) || rel.today.day !== day) rel.today = { day, turn, ev: {} };
    rel.today.turn = turn;
    const count = num(rel.today.ev[ev.event]);
    /* Wave 34: a flirt too soon (short of their opensAt, Rel.flirtAnswer's
       soon), turned aside kindly: the first time costs nothing and only
       marks it (rel.soonOnce); later ones liking 1, everyday, no memory. */
    if (ev.event === 'flirted' && ev.soon === true) {
      const d = { w: 0, t: 0, f: 0, k: 0, s: 0, m: 0 };
      const used = Object.assign({ w: 0, t: 0, f: 0, s: 0, m: 0 }, isObj(ctx.used) ? ctx.used : {});
      if (rel.soonOnce === true) {
        d.w = clamp(used.w - 1, -CAPS.turn.w, CAPS.turn.w) - used.w;
        used.w += d.w;
        putEverydayHeld(rel, 'w', d.w);
      } else rel.soonOnce = true;
      return { rel, memories: mems, d, memory: null, merged: false, settled: null, settledKey: null, settledEntry: null, refused, used, weight: 0 };
    }
    /* One fight, one memory (wave 27): ev.fight keys a fight's memory. A
       beat-down replaces every memory of its fight; a heavier blow than the
       memory holds (a hit after a shove) replaces it; the same again raises
       it x FIGHT_RAISE (a second hit), and a lighter one only teaches
       knowing. */
    const fightKey = typeof ev.fight === 'string' && ev.fight ? ev.fight : null;
    if (fightKey && FIGHT_RANK[ev.event]) {
      if (ev.event === 'beat_down') { for (let j = mems.length - 1; j >= 0; j--) if (mems[j].fight === fightKey) mems.splice(j, 1); }
      else {
        const at = mems.findIndex(m => m.fight === fightKey && isObj(m.d));
        const was = at >= 0 ? FIGHT_RANK[mems[at].event] || 0 : 0;
        if (at >= 0 && FIGHT_RANK[ev.event] > was) mems.splice(at, 1);
        else if (at >= 0) return raiseFight(n, rel, mems, at, ev, ctx, now, ax, count);
      }
      // Where they stand without what it replaced (a hard person's fear room is read from this).
      now = recompute(Object.assign({}, n, { rel, memories: mems }), day, ctx);
    }
    // The row, or what the reduced days give.
    const base = { w: row.w, t: row.t, f: row.f, k: row.k, s: row.s, m: row.m };
    const across = CAPS.acrossDays[ev.event];
    const reduced = !!across && num(rel.days[ev.event]) >= across.full;
    if (reduced) Object.assign(base, across.after);
    if (isObj(ev.d)) for (const x of TRACKS) if (Number.isFinite(ev.d[x])) base[x] = ev.d[x];
    if (base.s === 'halves') base.s = now.s > 0 ? -now.s / 2 : 0;
    else if (base.s === 'rate') base.s = 10 * sparkRate(n, ctx);
    else if (base.s === 'warm') base.s = now.s >= 10 ? 2 : 0;
    /* Wave 35: romance. A weight-3 harm's row halves it; substance moves it
       only while spark is at the row's mAt (romance grows out of wanting
       plus substance; a value the event gives outright is as given); its
       gains x the person's romanceRate, never a trait. */
    const givenM = isObj(ev.d) && Number.isFinite(ev.d.m);
    if (base.m === 'halves') base.m = now.m > 0 ? -now.m / 2 : 0;
    else if (!givenM && row.mAt && now.s < row.mAt) base.m = 0;
    if (num(base.m) > 0) base.m = num(base.m) * romanceRate(n, ctx);
    const scale = Number.isFinite(ev.scale) ? clamp(ev.scale, 0.1, 2) : 1;
    const d = { w: num(base.w) * scale, t: num(base.t) * scale, f: num(base.f) * scale, k: num(base.k), s: num(base.s) * scale, m: num(base.m) };
    // The person's traits. Spark and romance are never scaled by one.
    if (row.proud) d.w *= 1 + AXIS_EFFECTS.pride.liking * ax.p;
    // Money given to them counts double for the mercenary (wave 29: given, not taken: paid_silence when they pay the player is no gift).
    if (ax.mercenary && row.money && d.w > 0) d.w *= MERCENARY.money;
    if (ax.mercenary && ev.event === 'blackmailed') d.w *= MERCENARY.blackmailed;
    d.t *= d.t > 0 ? 1 + AXIS_EFFECTS.guarded.gain * ax.g : 1 + AXIS_EFFECTS.guarded.loss * ax.g;
    if (d.f > 0) d.f *= 1 + AXIS_EFFECTS.nerve.fear * ax.n;
    // Repeats.
    const harm = d.w + d.t < 0 || (d.w + d.t === 0 && d.f > 0);
    // Wave 29: any weight-3 harm halves their spark, at write time (design section 2.5).
    const wt0 = row.weight > 0 ? (Number.isInteger(ev.weight) ? clamp(ev.weight, 1, 3) : row.weight) : 0;
    if (harm && wt0 >= 3 && now.s > 0 && !(d.s < 0)) d.s = -now.s / 2;
    // Wave 35: and their romance the same.
    if (harm && wt0 >= 3 && now.m > 0 && !(d.m < 0)) d.m = -now.m / 2;
    let mergeAt = -1;
    if (harm && row.weight > 0) {
      // Wave 34: only into a harm of the same event (an unwelcome flirt never folds into a welcome one: the roll makes both common).
      for (let j = mems.length - 1; j >= 0; j--) if (mems[j].event === ev.event && isObj(mems[j].d) && harmful(mems[j]) && !mems[j].witness && day - dayOf(mems[j], ctx, day) <= CAPS.mergeDays) { mergeAt = j; break; }
      if (mergeAt >= 0) { const c = CAPS.compound[Math.min(num(mems[mergeAt].n) || 1, CAPS.compound.length - 1)]; d.w *= c; d.t *= c; d.f *= c; }
    } else if (!harm && (d.w > 0 || d.t > 0 || d.s > 0 || d.m > 0)) {
      // Knows-you too, down to CAPS.kMin: a second time together the same day teaches 2, not 4.
      const rep = CAPS.sameDay[ev.event] || CAPS.kindRepeat;
      const c = rep[Math.min(count, rep.length - 1)];
      d.w *= c; d.t *= c; d.s *= c; d.m *= c; d.k *= c;
    }
    // The bounds.
    for (const x of ROMANTIC) if (d[x] > 0 && !open) refused.push(`${n.id}: ${TRACK_NAMES[x]} stays 0 (${isMinor(n, ctx) ? 'under 18' : 'the player is under 18 or has no age'})`);
    if (!open) { d.s = 0; d.m = 0; }
    const used = Object.assign({ w: 0, t: 0, f: 0, s: 0, m: 0 }, isObj(ctx.used) ? ctx.used : {});
    for (const x of ['w', 't', 'f', 's', 'm']) {
      const v = rnd(d[x]);
      const cap = CAPS.turn[x];
      d[x] = clamp(used[x] + v, -cap, cap) - used[x];
      used[x] += d[x];
    }
    if (ax.hard && d.f > 0) { const room = Math.max(0, CAPS.hardFear - now.f); used.f -= d.f - Math.min(d.f, room); d.f = Math.min(d.f, room); }
    d.k = Math.max(CAPS.kMin, rnd(d.k));
    // The memory, or the everyday bucket.
    const weight = row.weight > 0 ? (Number.isInteger(ev.weight) ? clamp(ev.weight, 1, 3) : row.weight) : 0;
    let memory = null;
    let merged = false;
    let evicted = [];
    if (weight) {
      const text = cleanText(ev.text, 400);
      if (mergeAt >= 0) {
        // Merged: what the old one still carries (faded and settled) plus this; its settlements kept, as history, folded in.
        const old = mems.splice(mergeAt, 1)[0];
        const q = remainder(old, Object.assign({}, n, { rel }), day, ax, ctx);
        const nd = {};
        for (const x of TRACKS) nd[x] = x === 'k' ? num(old.d.k) + d.k : two(q[x] + d[x]);
        memory = Object.assign(old, { turn, day, text, weight: Math.min(3, Math.max(weight, num(old.weight)) + 1), d: nd, n: (num(old.n) || 1) + 1 });
        if (Array.isArray(memory.settled)) memory.settled = memory.settled.map(e => Object.assign({}, e, { folded: true }));
        if (fightKey) memory.fight = fightKey;
        merged = true;
      } else {
        memory = { turn, day, text, weight, event: ev.event, d: { w: d.w, t: d.t, f: d.f, k: d.k, s: d.s, m: d.m }, decay: typeof ev.decay === 'string' && DECAY[ev.decay] ? ev.decay : row.decay, key: `m${turn}-${n.id}`, n: 1 };
        if (ctx.place) memory.place = ctx.place;
        if (typeof ev.act === 'string' && ev.act) memory.act = ev.act;
        if (typeof ev.aboutId === 'string' && ev.aboutId) memory.about = ev.aboutId;
        if (typeof ev.leverageId === 'string' && ev.leverageId) memory.leverageId = ev.leverageId;
        if (ev.private === true) memory.private = true;
        // A secondhand memory (wave 27: a report's, a grudge's third party): true, or { via, hidden } when it came through a tie the town does not know.
        if (ev.secondhand === true) memory.secondhand = true;
        else if (isObj(ev.secondhand)) memory.secondhand = Object.assign({}, typeof ev.secondhand.via === 'string' ? { via: ev.secondhand.via } : {}, ev.secondhand.hidden === true ? { hidden: true } : {});
        if (fightKey) memory.fight = fightKey;
      }
      // As remember() does for every new memory: weight-1 lines older than CAPS.staleTurns go, then past CAPS.memories by evictIndex (wave 27: copies first, then the shortest-lived).
      const kept = mems.filter(x => x.weight > 1 || turn - x.turn <= CAPS.staleTurns);
      kept.push(memory);
      while (kept.length > CAPS.memories) kept.splice(evictIndex(kept), 1);
      // What a typed one that went still carried stays, pinned into everyday below.
      evicted = mems.concat([memory]).filter(x => !kept.includes(x) && isObj(x.d));
      mems.length = 0;
      mems.push(...kept);
    } else {
      for (const x of ['w', 't', 'k', 's', 'm']) putEverydayHeld(rel, x, d[x]);
    }
    // What it settles.
    let settledText = null;
    // Wave 31: which memory it settled and by how much (the copies others hold of it are settled by the same, design section 5.3).
    let settledKey = null;
    let settledEntry = null;
    const how = SETTLE[ev.event];
    if (how) {
      const i = settleTarget(mems, how, ev.text, day, ctx, memory);
      if (i >= 0) { settledEntry = settleEntry(ev.event, how, ax, ctx); mems[i].settled = list(mems[i].settled).concat([settledEntry]); settledText = mems[i].text; settledKey = typeof mems[i].key === 'string' ? mems[i].key : null; }
    }
    // The favours.
    if (row.owed === 'clear') rel.owed = list(rel.owed).filter(o => !(num(o.dir) < 0));
    else if (Number.isInteger(row.owed) && row.owed) rel.owed = list(rel.owed).concat([{ dir: Math.sign(row.owed), size: Math.abs(row.owed), key: `m${turn}-${n.id}`, day, turn, why: cleanText(ev.text, 120) }]).slice(-CAPS.owedEntries);
    // The counters.
    rel.today.ev[ev.event] = count + 1;
    if (across && count === 0 && !reduced) rel.days[ev.event] = num(rel.days[ev.event]) + 1;
    rel.recent = list(rel.recent).concat([{ ev: ev.event, day, at: ctx.place || null, turn }]).slice(-CAPS.recent);
    // Wave 28: an unwelcome flirt (liking down) is remembered as one: the next costs more (romanceTurn reads it).
    if (ev.event === 'flirted' && d.w < 0) rel.unwelcomeOnce = true;
    const out = { rel, memories: mems, d, memory, merged, settled: settledText, settledKey, settledEntry, refused, used, weight };
    if (evicted.length) out.rel = landTo(Object.assign({}, n, { rel, memories: mems }), pinOf(recompute(Object.assign({}, n, { rel, memories: mems.concat(evicted) }), day, ctx), open), 'everyday', ctx);
    return out;
  }
  // An event's everyday part: held to the bound, nothing past it (everyday stops at 15; knows-you only within its range).
  function putEverydayHeld(rel, x, v) {
    if (!v) return;
    const lo = x === 'k' ? 0 : -CAPS.everyday;
    const hi = x === 'k' ? RANGE.k[1] : CAPS.everyday;
    rel.everyday[x] = clamp(num(rel.everyday[x]) + v, lo, hi);
  }
  /* The import guard (design section 2.7 item 5): every spark and (wave
     35) romance value on someone they cannot move for set to 0, in rel and
     in their memories. Returns { rel, memories, cleared, tracks (the names
     of those set to 0) }. */
  function sparkGuard(n, ctx) {
    ctx = context(ctx);
    const rel = isObj(n.rel) ? copyRel(n.rel) : null;
    const mems = deepCopy(list(n.memories));
    if (eligible(n, ctx)) return { rel: n.rel, memories: n.memories, cleared: false };
    let cleared = false;
    const which = new Set();
    const zero = o => { if (!isObj(o)) return; for (const x of ROMANTIC) if (num(o[x]) !== 0) { o[x] = 0; cleared = true; which.add(x); } };
    if (rel) { zero(rel.start); zero(rel.everyday); zero(rel.fix); zero(rel); }
    for (const m of mems) zero(m.d);
    return cleared ? { rel, memories: mems, cleared, tracks: ROMANTIC.filter(x => which.has(x)).map(x => TRACK_NAMES[x]) } : { rel: n.rel, memories: n.memories, cleared };
  }
  /* The morning's step for one person (State's relDay, the morning of day):
     wave 27 (A2), fading replaces the old drift. Memories fade by their
     class on their own (recompute reads their age); what drifts is only the
     everyday bucket, liking and trust each CAPS.everydayDrift back toward
     0, and only when the player did not see them on the day just ended
     (state.seen[id].day) and no open loose end ties them; everyday
     romance (wave 35) 1 a day toward 0 the same way. fix (the editor,
     relSet, a direct write) and knows-you never drift. Returns { w, t, m }
     (the steps, signed) or null. */
  function driftStep(n, day, s) {
    if (!isObj(n) || n.alive === false || n.status === 'dead' || !isObj(n.rel) || !isObj(n.rel.everyday)) return null;
    if (tiedByLooseEnd(n, s)) return null;
    const seen = s && isObj(s.seen) && isObj(s.seen[n.id]) ? s.seen[n.id] : null;
    if (seen && Number.isInteger(seen.day) && seen.day >= day - 1) return null;
    const step = (v, by) => { const x = num(v); return x ? -Math.sign(x) * Math.min(by, Math.abs(x)) : 0; };
    const out = { w: step(n.rel.everyday.w, CAPS.everydayDrift), t: step(n.rel.everyday.t, CAPS.everydayDrift), m: step(n.rel.everyday.m, CAPS.everydayRomanceDrift) };
    return out.w || out.t || out.m ? out : null;
  }

  // ----- wave 27: the engine's events, who saw them, and the gates -----
  /* Where a memory stands when one has to go (the 12-memory cap, design
     section 5.1 and the integration plan's 9.2): witness and secondhand
     copies first, then by how long it lasts (mood, slight, wound, scar; a
     line that moves nothing by its weight: 1 slight, 2 a wound, 3 a scar, so
     a serious old line outlasts a passing one), kind before harm, oldest
     first. Never a loose end's line or a fact, nor the newest CAPS.noted
     noted lines. Returns the index to drop, or -1. */
  const EVICT_RANK = Object.freeze({ mood: 1, slight: 2, wound: 3, scar: 4, keeps: 5 });
  function evictIndex(mems) {
    const noted = mems.map((m, i) => (isObj(m) && m.event === 'noted' && isObj(m.d) ? i : -1)).filter(i => i >= 0).slice(-CAPS.noted);
    const rank = (m, i) => {
      if (!isObj(m)) return [-1, 0, 0];
      const light = m.witness || m.secondhand ? 0 : 1;
      const cls = isObj(m.d) ? EVICT_RANK[classOf(m)] || 3 : [0, 2, 3, 4][clamp(toInt(m.weight) || 1, 1, 3)];
      return [light, cls, harmful(m) ? 1 : 0, i];
    };
    let best = -1;
    let key = null;
    mems.forEach((m, i) => {
      if (State.protectedMemory(m) || noted.includes(i)) return;
      const k = rank(m, i);
      if (!key || k[0] < key[0] || (k[0] === key[0] && (k[1] < key[1] || (k[1] === key[1] && (k[2] < key[2] || (k[2] === key[2] && k[3] < key[3])))))) { key = k; best = i; }
    });
    if (best < 0 && mems.length) { const minW = Math.min(...mems.map(m => num(m && m.weight))); best = mems.findIndex(m => num(m && m.weight) === minW); }
    return best;
  }
  /* What an onlooker takes from something they saw the player do (the
     witness row, design section 4.3): WITNESS's row as the person takes it
     (guardedness on trust, nerve on fear, a hard person's fear held at
     CAPS.hardFear, the turn's bounds), as one copy a scene: a second thing
     seen in the same scene (ev.scene: place, day and phase) adds to the
     copy already there. A first sight under 2 on every track is nothing;
     2 to 4 goes into everyday (liking and trust; the fear of it passes
     with the scene); 5 or more is the copy: a memory one class lighter than
     the event with no floor (fade reads witness), weight 2 for a hit or a
     beating seen, else 1, in SECONDHAND_TEXT's words. ev: { event, victim
     (their name), victimId, place (its name), scene, player (the player's
     name) }. Returns { rel, memories, d, memory, merged, kind ('memory',
     'everyday' or 'none'), used } or null. */
  function witnessEvent(n, ev, ctx) {
    ctx = context(ctx);
    const row = WITNESS[ev.event];
    if (!row || !EVENTS[ev.event]) return null;
    const rel = copyRel(repair(n, townRecord(n.id, ctx)));
    const mems = deepCopy(list(n.memories));
    const now = recompute(Object.assign({}, n, { rel }), ctx.day, ctx);
    const ax = axesOf(n, ctx);
    const d = { w: num(row.w), t: num(row.t), f: num(row.f) };
    d.t *= d.t > 0 ? 1 + AXIS_EFFECTS.guarded.gain * ax.g : 1 + AXIS_EFFECTS.guarded.loss * ax.g;
    if (d.f > 0) d.f *= 1 + AXIS_EFFECTS.nerve.fear * ax.n;
    const used = Object.assign({ w: 0, t: 0, f: 0, s: 0 }, isObj(ctx.used) ? ctx.used : {});
    for (const x of ['w', 't', 'f']) { const v = rnd(d[x]); const cap = CAPS.turn[x]; d[x] = clamp(used[x] + v, -cap, cap) - used[x]; used[x] += d[x]; }
    if (ax.hard && d.f > 0) { const room = Math.max(0, CAPS.hardFear - now.f); used.f -= d.f - Math.min(d.f, room); d.f = Math.min(d.f, room); }
    const at = typeof ev.scene === 'string' ? mems.findIndex(m => isObj(m) && m.witness === true && m.scene === ev.scene && isObj(m.d)) : -1;
    const size = Math.max(Math.abs(d.w), Math.abs(d.t), Math.abs(d.f));
    const text = cleanText(fillTemplate(SECONDHAND_TEXT.seen[ev.event] || 'saw {player} with {victim} at {place}', { player: ev.player || 'the stranger', victim: ev.victim || 'someone', place: ev.place || 'town' }), 200);
    const heavy = ev.event === 'hit' || ev.event === 'beat_down';
    if (at >= 0) {
      const m = mems[at];
      m.d = { w: two(num(m.d.w) + d.w), t: two(num(m.d.t) + d.t), f: two(num(m.d.f) + d.f), k: num(m.d.k), s: num(m.d.s) };
      m.n = (num(m.n) || 1) + 1;
      // The heavier thing seen names the copy.
      if (heavy || !EVENTS[m.event] || (EVENTS[ev.event].weight > EVENTS[m.event].weight)) { m.event = ev.event; m.decay = EVENTS[ev.event].decay; m.text = text; }
      m.weight = Math.max(num(m.weight), heavy ? 2 : 1);
      m.turn = ctx.turn;
      return { rel, memories: mems, d, memory: m, merged: true, kind: 'memory', used };
    }
    if (size < 2) return { rel, memories: mems, d: { w: 0, t: 0, f: 0 }, memory: null, merged: false, kind: 'none', used: Object.assign({ w: 0, t: 0, f: 0, s: 0 }, isObj(ctx.used) ? ctx.used : {}) };
    if (size < 5) {
      putEverydayHeld(rel, 'w', d.w);
      putEverydayHeld(rel, 't', d.t);
      return { rel, memories: mems, d: { w: d.w, t: d.t, f: 0 }, memory: null, merged: false, kind: 'everyday', used };
    }
    const memory = { turn: ctx.turn, day: ctx.day, text, weight: heavy ? 2 : 1, event: ev.event, d: { w: d.w, t: d.t, f: d.f, k: 0, s: 0 }, decay: EVENTS[ev.event].decay, key: `m${ctx.turn}-${n.id}-w`, n: 1, witness: true };
    if (typeof ev.scene === 'string') memory.scene = ev.scene;
    if (ctx.place) memory.place = ctx.place;
    if (typeof ev.victimId === 'string') memory.about = ev.victimId;
    const kept = mems.filter(x => x.weight > 1 || ctx.turn - x.turn <= CAPS.staleTurns);
    kept.push(memory);
    while (kept.length > CAPS.memories) kept.splice(evictIndex(kept), 1);
    const evicted = mems.filter(x => !kept.includes(x) && isObj(x.d));
    let out = rel;
    if (evicted.length) out = landTo(Object.assign({}, n, { rel, memories: kept }), pinOf(recompute(Object.assign({}, n, { rel, memories: kept.concat(evicted) }), ctx.day, ctx), eligible(n, ctx)), 'everyday', ctx);
    return { rel: out, memories: kept, d, memory, merged: false, kind: 'memory', used };
  }
  /* Whether a memory can grow a grudge (World's step e, design section
     6.2): a line that moves nothing (an older save's, the bookkeeper's
     legacy line) by today's rule (not what they did to the player); a typed
     one only for a harm still unsettled, or settled the same day it was made
     (an apology on the spot does not stop a weight-3 harm growing); never a
     witness or secondhand copy, a loose end's line or a fact. */
  function grudgeFit(m) {
    if (!isObj(m) || m.act === 'own' || m.witness || m.secondhand || State.protectedMemory(m)) return false;
    if (!isObj(m.d)) return true;
    if (!harmful(m)) return false;
    const day = Number.isInteger(m.day) ? m.day : null;
    return settlements(m).every(e => e.by !== 'got_even' && day !== null && e.day === day);
  }
  /* The police head (design Appendix F): the town's policeHead (the save's
     town copy, else the built-in town's), else the first police person
     whose role says chief; free, in town and not laid up. An id or null. */
  function policeHead(ctx) {
    ctx = context(ctx);
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const named = ctx.town && typeof ctx.town.policeHead === 'string' ? ctx.town.policeHead : builtIn(ctx) && typeof TOWN_DATA.policeHead === 'string' ? TOWN_DATA.policeHead : null;
    const head = (named && npcs.find(x => isObj(x) && x.id === named)) || npcs.find(x => isPoliceNpc(x) && /\bchief\b/i.test(String(x.role || '')));
    return head && available(head, ctx) ? head.id : null;
  }
  // Someone who can hear about it: alive, free, in town, not laid up.
  function available(x, ctx) {
    if (!isObj(x) || x.alive === false || x.status !== 'free' || (x.presence !== undefined && x.presence !== 'here')) return false;
    return !(ctx.s === State.current && State.laidUp(x));
  }
  const GUARDIAN_WORDS = /^(father|mother|parent|dad|mom|grandfather|grandmother|grandparent|grandpa|grandma|stepfather|stepmother|guardian)$/i;
  const WARD_WORDS = /^(son|daughter|child|grandson|granddaughter|grandchild|stepson|stepdaughter|ward)$/i;
  const BOSS_WORDS = /^(boss|employer|foreman|manager)$/i;
  /* Who someone goes to when the player has frightened or hurt them
     (design section 4.6 and Appendix F): content's protector on the
     person (the record, the save's town copy or the built-in town's: an
     id, a list, "nobody", or { npcId, hidden: true } for a tie the town
     does not know about), else a minor's parents or grandparents in town
     and the police head, else a boss, else the police head. Someone who
     cannot hear it (arrested, gone, dead, laid up, out of town) is passed
     over. Returns { ids, hidden } , { nobody: true } (a faction head, a
     loner: a grudge instead) or null (nobody to tell today).
     Wave 29, the police bar (design section 2.6.5): while the player holds
     an aware record over them (held, used or paid), the police are passed
     over unless they are hard, so the report goes to their next protector,
     and with none it is a grudge ({ nobody, barred }); someone under 18
     still goes to the law. opts.anyway (a coercion's report) is never
     barred. */
  function protectorOf(n, ctx, opts) {
    ctx = context(ctx);
    if (!isObj(n)) return null;
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const byId = id => npcs.find(x => isObj(x) && x.id === id) || null;
    const barred = !(opts && opts.anyway) && policeBarred(n, ctx);
    const ok = id => id !== n.id && available(byId(id), ctx) && !(barred && isPoliceNpc(byId(id)));
    const rec = townRecord(n.id, ctx);
    const live = builtIn(ctx) ? (TOWN_DATA.npcs.find(x => x.id === n.id) || null) : null;
    const own = [n, rec, live].find(x => isObj(x) && x.protector !== undefined && x.protector !== null);
    const p = own ? own.protector : undefined;
    if (p === 'nobody') return { nobody: true };
    if (p !== undefined) {
      const items = (Array.isArray(p) ? p : [p]).map(x => (typeof x === 'string' ? { npcId: x } : isObj(x) ? x : null)).filter(x => x && typeof x.npcId === 'string');
      const ids = items.map(x => x.npcId).filter(ok);
      /* Wave 31: whether the town knows of the tie is read from the tie
         itself (theirs to the protector: Hollis Byrd's to Wade Purvis), the
         content's hidden flag where the game has no such tie. */
      const hid = x => { const t = tieOf(n.id, x.npcId, ctx); return t ? t.hidden === true && !tieRevealed(t, n.id, x.npcId, ctx) : x.hidden === true; };
      if (ids.length) return { ids, hidden: items.some(x => ids.includes(x.npcId) && hid(x)) };
    }
    const kin = [];
    for (const r of list(n.relations)) if (typeof r.npcId === 'string') kin.push({ id: r.npcId, word: String(r.relation || '') });
    for (const x of npcs) for (const r of list(isObj(x) ? x.relations : null)) if (r.npcId === n.id) kin.push({ id: x.id, word: String(r.relation || ''), back: true });
    const head = policeHead(ctx);
    if (isMinor(n, ctx)) {
      const guardians = kin.filter(k => (k.back ? WARD_WORDS : GUARDIAN_WORDS).test(k.word)).map(k => k.id).filter(ok);
      const ids = guardians.concat(head && !guardians.includes(head) && head !== n.id ? [head] : []).filter((x, i, a) => a.indexOf(x) === i);
      if (ids.length) return { ids, hidden: false };
    }
    const boss = kin.filter(k => !k.back && BOSS_WORDS.test(k.word)).map(k => k.id).find(ok);
    if (boss) return { ids: [boss], hidden: false };
    if (barred && head && head !== n.id) return { nobody: true, barred: true };
    return head && head !== n.id ? { ids: [head], hidden: false } : null;
  }
  // The police, by tag or role: isPoliceNpc, in the helpers (wave 47).
  /* Whether someone afraid of the player means to tell (design section
     6.2's report seed): fear at GATES.report.fear or more, and it came from
     the player's threats (whatever their liking), or from violence with
     liking at GATES.report.violenceLiking or less. Returns { why: 'threat'
     | 'violence', key (the memory it grew from) } or null. A hard person's
     fear stops at 39, so they never report out of fear. */
  function reportWhy(n, ctx) {
    ctx = context(ctx);
    if (!isObj(n)) return null;
    const c = cacheOf(n, ctx);
    if (c.f < GATES.report.fear) return null;
    const ax = axesOf(n, ctx);
    const part = { threat: 0, violence: 0 };
    const key = { threat: null, violence: null };
    for (const m of list(n.memories)) {
      if (!isObj(m.d) || m.witness || m.secondhand || m.act === 'own') continue;
      const r = EVENTS[m.event];
      const cls = r && (r.dedupe === 'threat' || r.dedupe === 'violence') ? r.dedupe : null;
      if (!cls) continue;
      const f = remainder(m, n, ctx.day, ax, ctx).f;
      if (f <= 0) continue;
      part[cls] += f;
      key[cls] = m.key || `m${m.turn | 0}-${n.id}`;
    }
    if (part.threat > 0 && part.threat >= part.violence) return { why: 'threat', key: key.threat };
    if (part.violence > 0 && c.w <= GATES.report.violenceLiking) return { why: 'violence', key: key.violence };
    return null;
  }
  /* The relationship's share of a roll (Dice, inside the +/-4 cap; design
     section 6.2): an intimidation by fear (+1 at 20, +2 at 40, -1 against
     someone who likes the player at 40 or more); a lie by trust (wave 28:
     +2 at 40, -1 at -25, -2 at -50); every other social roll (persuade,
     charm, talk, buy, sell, give) by liking, +/-1 at 30 and +/-2 at 60.
     Returns a whole number, 0 for nothing. */
  function rollMod(n, actionType, ctx) {
    if (!isObj(n)) return 0;
    const c = tracksOf(n, ctx);
    if (actionType === 'intimidate') {
      let v = 0;
      for (const [at, m] of GATES.intimidate.fear) if (c.f >= at) v = m;
      if (c.w >= GATES.intimidate.likedAt) v += GATES.intimidate.liked;
      return v;
    }
    // Wave 28: a lie by trust (+2 at 40 or more, -1 at -25 or less, -2 at -50 or less).
    if (actionType === 'deceive') {
      let v = 0;
      for (const [at, m] of GATES.deceive.trust) if (c.t >= at) v = m;
      for (const [at, m] of GATES.deceive.distrust) if (c.t <= at) v = m;
      return v;
    }
    let v = 0;
    for (const [at, m] of GATES.social.liking) { if (c.w >= at) v = m; if (c.w <= -at) v = -m; }
    return v;
  }
  /* Fear's ceiling (design section 6.2): an adult afraid of the player
     (fear 40 or more) who is not hard does a small thing (talk or persuade
     at easy or normal) with no roll; never someone under 18, never a
     romantic ask (wave 28: the parse's romantic, a flirt or more, for
     anyone: coercion is refused, the integration plan's 19.1). Pipeline
     burns the d20 it skips. */
  function complies(n, action, ctx) {
    if (!isObj(n) || !isObj(action) || action.romantic === true || action.romantic === 'flirt' || action.romantic === 'more') return false;
    if (!GATES.compliance.actions.includes(action.actionType) || !GATES.compliance.difficulties.includes(action.difficulty || 'normal')) return false;
    if (isMinor(n, ctx) || axesOf(n, ctx).hard) return false;
    return tracksOf(n, ctx).f >= GATES.compliance.fear;
  }
  /* Someone who picks the player up when they are beaten senseless (the
     defeat's rescue, design section 6.2): liking 25 or more, or a favour
     they owe the player, unless they are afraid of the player. */
  function rescues(n, ctx) {
    if (!isObj(n)) return false;
    const c = tracksOf(n, ctx);
    if (!(c.w >= GATES.rescue.liking || c.owed >= GATES.rescue.owed)) return false;
    return stance(n, ctx).phrase !== OVERRIDES.you;
  }
  /* A seller who will not serve the player (design section 6.3): a
     manager, owner, merchant, bartender or cashier (tag or role) who is
     against them or hates them (the liking band, with its hysteresis). */
  function wontSell(n, ctx) {
    if (!isObj(n)) return false;
    const words = GATES.wontSell.roles;
    const tags = Array.isArray(n.tags) ? n.tags.map(t => String(t).toLowerCase()) : [];
    const seller = tags.some(t => words.includes(t)) || new RegExp(`\\b(${words.join('|')})s?\\b`, 'i').test(String(n.role || ''));
    if (!seller) return false;
    const c = cacheOf(n, ctx);
    return (c.bands && (c.bands.w === 'hates' || c.bands.w === 'dislikes')) || tracksOf(n, ctx).w <= GATES.wontSell.liking;
  }
  /* What a story point's fact says about someone (/fact, the integration
     plan's 9.6): "owes me" or "owes ... a favour" (owed +1), "go back",
     "known ... for years", "old friend", "grew up with" (knows at least 30),
     "trusts me" (trust +15, at most 40), "likes me" (liking +10, at most 40).
     Never spark, never fear. Returns { owed?, knows?, trust?, liking? }. */
  function factOf(statement) {
    const t = String(statement || '').toLowerCase().replace(/[’]/g, "'");
    const out = {};
    if (/\bowes? me\b/.test(t) || /\bowes\b[^.]*\bfavou?r\b/.test(t)) out.owed = 1;
    if (/\b(go(?:es)? (?:way )?back|known [^.]*\bfor years|old friends?|grew up (?:with|together))\b/.test(t)) out.knows = 30;
    if (/\btrusts? me\b/.test(t)) out.trust = 15;
    if (/\blikes? me\b/.test(t)) out.liking = 10;
    return out;
  }

  // ----- wave 28: what the bookkeeper may say, the trust gates, nobody under 18 -----
  // The events that take an about-id (design section 3.6), the words events private applies to (section 3.2), the romance rows.
  const ABOUT_EVENTS = Object.freeze(['exposed', 'badmouthed', 'vouched_for', 'defended']);
  const WORDS_EVENTS = Object.freeze(['insulted', 'complimented', 'pried', 'confided', 'they_confided', 'apologised', 'noted']);
  const ROMANCE_EVENTS = Object.freeze(['flirted', 'rebuffed', 'intimate']);
  /* What a turn aimed at someone under 18 costs (the integration plan's 6.2
     and 19.3). One signal, or no named target: the light row, a weight-1
     noted line that fades in days and grows nothing. A named target and two
     signals: UNWANTED_ADVANCE for them, crossed at full and weight 3 for
     each guardian (in their words: ward, kin or the police head's), a report
     from each to the police, and the town's standing outside the turn's cap
     (rep; the same for a threat or a blow aimed at a minor, and for a
     romantic ask pushed with a threat or fear: coercion, 19.1). */
  const MINOR_RULE = deepFreeze({
    light: { event: 'noted', d: { w: -3, t: 0, f: 0, k: 2 }, weight: 1, decay: 'mood', text: 'said something that made me uncomfortable at {place}' },
    advance: '{player} came on to me at {place}',
    guardian: { event: 'crossed', weight: 3, ward: '{player} came on to my {ward} at {place}', kin: '{player} came on to {child} at {place}', police: '{player} came on to {child}, a kid, at {place}' },
    rep: { advance: -10, threat: -5, violence: -10, coercion: -10 }
  });
  /* A threat inside the words (the integration plan's 19.4): with a romantic
     ask it is coercion, whatever the parse called the action. */
  /* Wave 29: a backed ask must use what the player knows (normaliseParse
     keeps a lev_ id only for words like these, or two words of the
     record's): "or the sheriff in Clayburn gets a copy", "or Bell hears",
     "I know about", "I've seen your", "unless you want". */
  const THREAT_PHRASES = /\b(or (else|i'?ll tell|i tell|everyone (hears|knows)|(?:the |your |my |his |her )?[a-z]+(?: [a-z]+){0,3} (hears|hear|finds out|gets|sees|learns|knows))|unless you|i know about|i know what you|i'?ve seen your|keep (it|this) quiet|what i know)\b/i;
  // The asks a floor reads (design section 6.2: any ask of someone against the player), and the difficulties in order.
  const ASKS = Object.freeze(['talk', 'persuade', 'deceive', 'intimidate']);
  const DIFFS = Object.freeze(['easy', 'normal', 'hard', 'very_hard']);
  /* The least a roll can be for this person (design section 6.2; GATES.floors):
     at least hard for any ask of someone in the dislikes or hates rows (the
     liking band, with its hysteresis); a lie to someone at trust -25 or less
     hard, -50 or less very hard; a hard person at least hard to frighten.
     Returns a difficulty or null. */
  function difficultyFloor(n, actionType, ctx) {
    if (!isObj(n)) return null;
    const c = cacheOf(n, ctx);
    const t = tracksOf(n, ctx).t;
    let floor = null;
    const up = d => { if (!floor || DIFFS.indexOf(d) > DIFFS.indexOf(floor)) floor = d; };
    if (ASKS.includes(actionType) && isObj(c.bands) && (c.bands.w === 'hates' || c.bands.w === 'dislikes')) up(GATES.floors.ask);
    if (actionType === 'deceive') for (const [at, d] of GATES.floors.lie) if (t <= at) up(d);
    if (actionType === 'intimidate' && axesOf(n, ctx).hard) up(GATES.floors.intimidateHard);
    return floor;
  }
  // The parser's word for a lie to them (its packet's person row): normal, hard or very hard.
  function lieWord(n, ctx) { const f = difficultyFloor(n, 'deceive', ctx); return f === 'very_hard' ? 'very hard' : f === 'hard' ? 'hard' : 'normal'; }
  /* The secret gate by trust (GATES.secret, wave 28): trust 40 or more and
     knows-you 30 or more. A successful roll aimed at them, or fear 60 after
     a successful intimidation (never for someone under 18), are Pipeline's
     other ways in (secretsFor). */
  function secretOpen(n, ctx) {
    if (!isObj(n)) return false;
    const c = tracksOf(n, ctx);
    return c.t >= GATES.secret.trust && c.k >= GATES.secret.knows;
  }
  /* Whether someone meets a content condition ({ liking?, trust?, fear?,
     knows? }, each "at least"; warmth and familiarity are read as liking and
     knows): a favour template's needs (wave 28), the council's relAtLeast
     (wave 30). Spark and romance are never readable here. */
  const MEET_KEYS = Object.freeze({ liking: 'w', warmth: 'w', trust: 't', fear: 'f', knows: 'k', familiarity: 'k' });
  function meets(n, cond, ctx) {
    if (!isObj(n)) return false;
    if (!isObj(cond)) return true;
    const c = tracksOf(n, ctx);
    return Object.keys(cond).every(k => !MEET_KEYS[k] || !Number.isFinite(cond[k]) || c[MEET_KEYS[k]] >= cond[k]);
  }
  /* The other side of meets (wave 30: a town event's relBelow): every track
     named is under its number. */
  function below(n, cond, ctx) {
    if (!isObj(n)) return false;
    if (!isObj(cond)) return true;
    const c = tracksOf(n, ctx);
    return Object.keys(cond).every(k => !MEET_KEYS[k] || !Number.isFinite(cond[k]) || c[MEET_KEYS[k]] < cond[k]);
  }
  // Who someone is to whom, both ways: [{ id, word, back }] (back: the other person's label for them).
  function kinOf(n, ctx) {
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const out = [];
    for (const r of list(n.relations)) if (typeof r.npcId === 'string') out.push({ id: r.npcId, word: String(r.relation || '').toLowerCase(), back: false });
    for (const x of npcs) for (const r of list(isObj(x) ? x.relations : null)) if (r.npcId === n.id) out.push({ id: x.id, word: String(r.relation || '').toLowerCase(), back: true });
    return out;
  }
  const homeId = x => (isObj(x) && isObj(x.home) ? x.home.locationId : isObj(x) && typeof x.home === 'string' ? x.home : null) || null;
  /* Who answers for someone under 18 (the integration plan's 19.3): their
     parents and grandparents in town, by the relation labels both ways,
     free, alive and not laid up; else another adult of their family (a
     family label, or a relation and a shared home); else the police head
     alone. Returns { ids, kind: 'parent' | 'family' | 'police' | 'none' }. */
  function guardiansOf(n, ctx) {
    ctx = context(ctx);
    if (!isObj(n)) return { ids: [], kind: 'none' };
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const byId = id => npcs.find(x => isObj(x) && x.id === id) || null;
    const adult = id => { const x = byId(id); return !!x && x.id !== n.id && available(x, ctx) && !isMinor(x, ctx); };
    const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
    const kin = kinOf(n, ctx);
    const parents = uniq(kin.filter(k => (k.back ? WARD_WORDS : GUARDIAN_WORDS).test(k.word)).map(k => k.id)).filter(adult);
    if (parents.length) return { ids: parents, kind: 'parent' };
    const home = homeId(n);
    const family = uniq(kin.filter(k => familyWord(k.word) || (home && homeId(byId(k.id)) === home)).map(k => k.id)).filter(adult);
    if (family.length) return { ids: family, kind: 'family' };
    const head = policeHead(ctx);
    return head && head !== n.id ? { ids: [head], kind: 'police' } : { ids: [], kind: 'none' };
  }
  /* The law outside town for when the town's own cannot hear it (design
     Appendix F): the town's policeFallback (the save's copy, else the
     built-in town's: Sheriff Hoyt Bramlett in Clayburn), alive. An id or
     null. */
  function policeFallback(ctx) {
    ctx = context(ctx);
    const id = ctx.town && typeof ctx.town.policeFallback === 'string' ? ctx.town.policeFallback : builtIn(ctx) && typeof TOWN_DATA.policeFallback === 'string' ? TOWN_DATA.policeFallback : null;
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const x = id ? npcs.find(m => isObj(m) && m.id === id) : null;
    return x && x.alive !== false && x.status !== 'dead' ? x.id : null;
  }
  /* Where a report to the police goes: { ids: [the police head] } while one
     is free and here, else { ids: [the fallback], fallback } (a memory on
     their record and a line of town news), else { ids: [] } (the news line
     alone). */
  function reportTo(ctx) {
    const head = policeHead(ctx);
    if (head) return { ids: [head] };
    const fb = policeFallback(ctx);
    return fb ? { ids: [fb], fallback: fb } : { ids: [] };
  }
  // A minor's age as their strictest anchor gives it (the live town, the town copy, the record), or null.
  function minorAge(n, ctx) {
    ctx = context(ctx);
    const copy = townRecord(n.id, ctx);
    const live = builtIn(ctx) ? (TOWN_DATA.npcs.find(x => x.id === n.id) || null) : null;
    const ages = [n, copy, live].filter(isObj).map(r => r.age).filter(a => Number.isInteger(a));
    return ages.length ? Math.min(...ages) : null;
  }
  // What a guardian is to the child, in the child's words where it has them ("father"), else from the guardian's own label for the child.
  const GUARDIAN_OF = deepFreeze({ son: 'parent', daughter: 'parent', child: 'parent', kid: 'parent', stepson: 'stepparent', stepdaughter: 'stepparent', grandson: 'grandparent', granddaughter: 'grandparent', grandchild: 'grandparent', niece: 'aunt', nephew: 'aunt', ward: 'guardian' });
  const GUARDIAN_FORMS = deepFreeze({ parent: ['mother', 'father'], stepparent: ['stepmother', 'stepfather'], grandparent: ['grandmother', 'grandfather'], aunt: ['aunt', 'uncle'] });
  function guardianWord(n, gid, ctx) {
    ctx = context(ctx);
    const kin = kinOf(n, ctx).filter(k => k.id === gid);
    const own = kin.find(k => !k.back);
    if (own && own.word) return own.word;
    const back = kin.find(k => k.back && GUARDIAN_OF[k.word]);
    if (!back) return null;
    const g = (ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : []).find(x => isObj(x) && x.id === gid);
    const forms = GUARDIAN_FORMS[GUARDIAN_OF[back.word]];
    return forms ? (g && g.pronouns === 'she' ? forms[0] : g && g.pronouns === 'he' ? forms[1] : GUARDIAN_OF[back.word]) : GUARDIAN_OF[back.word];
  }
  // A child's word in their guardian's mouth ("my daughter"), by the child's pronouns and the tie.
  function wardWord(n, gid, ctx) {
    ctx = context(ctx);
    const kin = kinOf(n, ctx).filter(k => k.id === gid);
    const back = kin.find(k => k.back && k.word);
    if (back && WARD_WORDS.test(back.word)) return back.word;
    const own = kin.find(k => !k.back && k.word);
    const grand = own && /^grand/.test(own.word);
    return n.pronouns === 'she' ? (grand ? 'granddaughter' : 'daughter') : n.pronouns === 'he' ? (grand ? 'grandson' : 'son') : (grand ? 'grandchild' : 'child');
  }
  /* The narrator's line for someone under 18 in the scene, every turn they
     are there, whatever the parse said (the integration plan's 19.3; the
     front page's 4.5): "Kaylee Pittman is 16: any romantic or sexual advance
     is unwelcome and alarming; she is uncomfortable, gets away or goes to
     her father; never warm, never flirtatious." The guardian is the first
     of guardiansOf (in the child's own word for them), else "someone she
     trusts". */
  function minorLine(n, ctx) {
    ctx = context(ctx);
    if (!isObj(n)) return '';
    const age = minorAge(n, ctx);
    const f = PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they;
    const they = !PRONOUN_FORMS[n.pronouns] || n.pronouns === 'they';
    const g = guardiansOf(n, ctx);
    let to = `someone ${f.subj} trust${they ? '' : 's'}`;
    if (g.kind === 'parent' || g.kind === 'family') {
      const word = guardianWord(n, g.ids[0], ctx);
      const gn = (ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : []).find(x => isObj(x) && x.id === g.ids[0]);
      to = word ? `${f.det} ${word}` : gn ? gn.name : to;
    }
    return `${n.name} is ${age !== null ? age : 'under 18'}: any romantic or sexual advance is unwelcome and alarming; ${f.subj} ${they ? 'are' : 'is'} uncomfortable, ${they ? 'get' : 'gets'} away or ${they ? 'go' : 'goes'} to ${to}; never warm, never flirtatious.`;
  }
  /* The narrator's line every turn for a player under 18, or (an older
     save's player) with no age on record, who counts as under 18 for
     romance only; null for an adult. */
  function playerMinorLine(ctx) {
    ctx = context(ctx);
    const p = ctx.s && isObj(ctx.s.player) ? ctx.s.player : null;
    if (!p || !playerMinor(ctx)) return null;
    return Number.isInteger(p.age) ? 'The player is under 18: nobody in this town flirts with them or takes a flirt from them as anything but a kid talking.'
      : "The player's age is not on record, so for romance they count as under 18: nobody in this town flirts with them or takes a flirt from them as one.";
  }
  /* The romance step of a turn, decided before the narrator writes (the
     integration plan's 6.1, 19.1 and 19.3; Pipeline step 4). t: { action
     (the parse, with romantic: null, 'flirt' or 'more'), speech, presentIds,
     input, phrase (a hit on Api.MINOR_ROMANCE_PHRASES over the input) }.
     For each minor here: whether they are a named target (the Say chip, or
     a target of a Do action; never Say to everyone) and which signals point
     at them (the flag, the phrase list; the bookkeeper's is read after
     narration). On a romantic turn: who it was aimed at (the targets here;
     everyone here only on a Say to everyone. Wave 33: a Do, or a Say to
     one person, that names nobody here is aimed at nobody: no answer, no
     flirt, nothing fanned out to the room; Pipeline.romanceTarget has
     already read the words for a name or a pronoun), whether it is
     coercion (a romantic ask with an
     intimidation, a threat in the words, a lev_ id or the target's fear 40
     behind it: refused for anyone, the die burned, Pipeline.resolve), and
     each adult's answer with a flirt for a named adult (Pipeline sends it
     in opts.engineEvents). Wave 34 ("anyone can be won over, some the hard
     way"): a flirt at a named adult who knows the player at least their
     opensAt is a charm roll at their difficulty (welcomeOf,
     flirtDifficulty: roll, which Pipeline makes the turn's roll whatever
     the parser said), and the answer waits for it (pending; romanceRolled,
     at resolve: "<Name> is open to it: she flirts back, her own way", "<Name>
     turns it aside, kindly" or "<Name> isn't interested: she turns it
     aside", by flirtAnswer). Short of their opensAt: turned aside kindly
     with no roll. A line to the whole room is no flirt with anyone: each
     adult takes it lightly, nothing recorded. An ask for the night (the
     parse's "more", INTIMATE_ASK in a flirt's words, or a walk to a home
     or a motel room) at a named adult checks every gate (intimateGate):
     yes ("says yes; fade to black") is the engine's intimate, with no
     roll; short of a gate it rolls as a flirt, and a welcome one is "not
     tonight; she says so kindly". A player under 18 (or of no age) is
     answered no every time, nothing rolled and no flirt recorded. Returns
     { romantic, aimed, minors, answers, welcome, flirts: [{ npcId, ans }],
     intimate: [ids], coercion: { npcId, protectorHere, why, leverageId?,
     room, each: [{ npcId, protectorHere, why ('threat', 'leverage' or
     'fear'), leverageId?, room? }] (wave 40: everyone pushed; the first
     leads) } | null, lines (the
     narrator's, each with its label), pending: [{ npcId, more }], roll: {
     npcId, stat, difficulty } | null }. It writes nothing. */
  function romanceTurn(t, ctx) {
    ctx = context(ctx);
    const o = isObj(t) ? t : {};
    const a = isObj(o.action) ? o.action : {};
    const romantic = a.romantic === 'flirt' || a.romantic === 'more' ? a.romantic : a.romantic === true ? 'flirt' : null;
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const byId = id => npcs.find(x => isObj(x) && x.id === id) || null;
    const present = (Array.isArray(o.presentIds) ? o.presentIds : []).filter((id, i, all) => typeof id === 'string' && all.indexOf(id) === i && byId(id));
    const sp = isObj(o.speech) ? o.speech : null;
    const everyone = isSay(sp) && sp.to === 'everyone';
    const targets = (Array.isArray(a.targets) ? a.targets : []).filter(id => present.includes(id));
    const named = id => !everyone && ((isSay(sp) && sp.to === id) || targets.includes(id));
    // Wave 33: "a kiss lands on the one kissed": only a Say to everyone is open to the whole room.
    const open = everyone;
    const aimedAt = id => named(id) || open;
    const out = { romantic, aimed: [], minors: {}, answers: [], welcome: [], flirts: [], intimate: [], coercion: null, lines: [], pending: [], roll: null };
    for (const id of present) {
      if (!isMinor(byId(id), ctx)) continue;
      out.minors[id] = { named: named(id), flag: !!romantic && aimedAt(id), phrase: o.phrase === true && aimedAt(id) };
    }
    if (!romantic) return out;
    out.aimed = present.filter(aimedAt);
    const forms = n => { const they = !PRONOUN_FORMS[n.pronouns] || n.pronouns === 'they'; return { f: PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they, s: they ? '' : 's' }; };
    /* Wave 40 ("however the line is put"): coercion no longer waits on the
       action type, and every named target is checked, not only the first
       (pushedBy): a live record of the player's over them that the words
       name (a lev_ id) or use (references), a threat in the words or an
       intimidation, any lev_ id, an aware live record over them, or their
       fear at GATES.compliance.fear (leverage's share included), whatever
       the parser called the action (a walk to a motel room, a give, a
       use). A threatening line to the whole room (a Say to everyone) is
       refused as coerced by every adult here (room: the threat row for
       each, one hit to the town; someone under 18 keeps the minor rule's
       row). */
    const input = String(o.input || '').replace(/[’]/g, "'");
    const threat = a.actionType === 'intimidate' || THREAT_PHRASES.test(input);
    const levIds = (Array.isArray(a.aboutIds) ? a.aboutIds : []).map(String).filter(x => /^lev_/.test(x));
    const usedOver = n => holdsOver(n, ctx).find(x => levIds.includes(x.id)) || holdsOver(n, ctx).find(x => references(input, x, ctx)) || null;
    const pushedBy = n => {
      const used = usedOver(n);
      if (used) return { why: 'leverage', leverageId: used.id };
      if (threat) return { why: 'threat' };
      if (levIds.length || holdsOver(n, ctx, true).length) return { why: 'leverage' };
      return tracksOf(n, ctx).f >= GATES.compliance.fear ? { why: 'fear' } : null;
    };
    const each = [];
    for (const id of present.filter(named)) {
      const target = byId(id);
      const p = pushedBy(target);
      if (!p) continue;
      const pr = protectorOf(target, ctx);
      const by = pr && Array.isArray(pr.ids) ? pr.ids.find(x => present.includes(x)) || null : null;
      const { f, s } = forms(target);
      each.push(Object.assign({ npcId: target.id, protectorHere: by, why: p.why }, p.leverageId ? { leverageId: p.leverageId } : {}));
      out.lines.push(`COERCION (the engine: no roll, nothing given): ${target.name} refuses: ${f.subj} won't be pushed into that, and ${f.subj} ${by ? `call${s} for ${byId(by).name}` : `leave${s}`}.`);
    }
    if (everyone && (threat || levIds.length)) {
      const adults = present.filter(id => !isMinor(byId(id), ctx));
      for (const id of adults) {
        const used = usedOver(byId(id));
        each.push(Object.assign({ npcId: id, protectorHere: null, why: used ? 'leverage' : 'threat', room: true }, used ? { leverageId: used.id } : {}));
      }
      const names = adults.map(id => byId(id).name);
      if (names.length) out.lines.push(`COERCION (the engine: no roll, nothing given): ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} refuse` : `${names[0]} refuses`}: nobody here will be pushed into that, and nobody goes along with it.`);
    }
    // One record for the turn: the first one pushed leads it (resolve, the debug line and older readers take npcId); each holds every one.
    if (each.length) out.coercion = Object.assign({}, each[0], { each, room: each.some(x => x.room) });
    const coercedIds = each.map(x => x.npcId);
    // An ask for the night: the parse's "more", the words of one, or a walk to a home or a motel room.
    const dest = typeof a.destinationId === 'string' && ctx.s && Array.isArray(ctx.s.locations) ? ctx.s.locations.find(l => isObj(l) && l.id === a.destinationId) : null;
    const more = romantic === 'more' || INTIMATE_ASK.test(String(o.input || '')) || !!(dest && NIGHT_PLACES.includes(dest.type));
    const say = (n, words) => out.lines.push(`ROMANCE (decided by the engine): ${n.name}${words}`);
    for (const id of out.aimed) {
      const n = byId(id);
      if (isMinor(n, ctx) || coercedIds.includes(id)) continue;
      out.answers.push(id);
      // Wave 40: a turn that pushed anyone opens nothing for anyone else it named: turned aside, kindly, no roll and no night.
      if (out.coercion && named(id)) { say(n, flirtWords(n, 'aside')); continue; }
      // A kid flirting is answered no, every time, and nothing is recorded (the minor rule's other side).
      if (playerMinor(ctx)) { say(n, flirtWords(n, 'no')); continue; }
      // Wave 34: a line to the whole room is no flirt with anyone: nobody rolls, each takes it lightly, nothing is recorded.
      if (!named(id)) { say(n, flirtWords(n, 'aside')); continue; }
      if (more) {
        const gate = intimateGate(n, ctx);
        if (gate.ok) { say(n, ' says yes; fade to black, nothing explicit; pick up afterwards.'); out.welcome.push(id); out.intimate.push(id); continue; }
      }
      const wel = welcomeOf(n, ctx);
      // Short of their opensAt: no roll, turned aside kindly (the first time free).
      if (!wel.ok) { say(n, flirtWords(n, 'aside')); out.flirts.push({ npcId: id, ans: flirtAnswer(n, null, ctx) }); continue; }
      out.pending.push({ npcId: id, more });
      if (!out.roll) out.roll = { npcId: id, stat: 'charm', difficulty: wel.difficulty };
    }
    return out;
  }
  /* Wave 34: the answers the roll decides (Pipeline.resolve, after the
     charm roll a flirt makes: romanceTurn's roll). r: romanceTurn's result
     (it is filled in: lines, welcome, flirts); tier: the roll's (null: it
     did not roll, the answer is turned aside, kindly; pressed: the same
     failed flirt pushed again, the answer no). A night that fell short of
     its gate and lands is "not tonight; she says so kindly", and a welcome
     flirt. Returns the lines added. */
  function romanceRolled(r, tier, ctx) {
    ctx = context(ctx);
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const added = [];
    for (const p of isObj(r) && Array.isArray(r.pending) ? r.pending : []) {
      const n = npcs.find(x => isObj(x) && x.id === p.npcId);
      if (!n) continue;
      const ans = tier ? flirtAnswer(n, tier, ctx) : { answer: 'aside', tier: null };
      const f = PRONOUN_FORMS[n.pronouns] || PRONOUN_FORMS.they;
      const s = !PRONOUN_FORMS[n.pronouns] || n.pronouns === 'they' ? '' : 's';
      const words = p.more && ans.answer === 'welcome' ? `: not tonight; ${f.subj} say${s} so kindly.` : flirtWords(n, ans.answer);
      const line = `ROMANCE (decided by the engine): ${n.name}${words}`;
      r.lines.push(line);
      added.push(line);
      if (ans.answer === 'welcome') r.welcome.push(n.id);
      if (ans.answer !== 'aside') r.flirts.push({ npcId: n.id, ans });
    }
    r.pending = [];
    return added;
  }
  /* The bookkeeper's event for one person, against what the engine knows
     (design section 3.2; the integration plan's 5.4). ev: { event, text,
     aboutId, private }; t: the turn: { present (ids), targets, actionType,
     rollSuccess, speechTo, romantic }. Returns { event (the row to apply:
     the one sent, or what it comes down to), aboutId, private, scale?,
     confess? (the index in rel.asks of the lie owned up to), why? }, {
     knows: N, why } (it only teaches that much) or { refuse: why }.
     Presence, the minor rule, the caps and the writing are State's. */
  function wireEvent(n, ev, t, ctx) {
    ctx = context(ctx);
    const o = isObj(t) ? t : {};
    let name = isObj(ev) && typeof ev.event === 'string' ? ev.event : '';
    if (!EVENTS[name]) return { refuse: `"${(isObj(ev) && ev.event) || ''}" is no event the game knows` };
    if (name === 'flirted') {
      /* Wave 33: a romantic turn the engine could aim at nobody (o.aimed, the
         romance step's, empty): the bookkeeper naming someone here who is an
         adult is the engine's flirt, late. Wave 34: it lands by the turn's
         charm roll (o.rollStat, o.rollTier: flirtAnswer), short of their
         opensAt it is turned aside kindly (the first time free), and with
         no charm roll this turn it is turned aside kindly, nothing changed.
         State writes it as the engine's own (Rel.flirtEventOf). */
      const aimed = Array.isArray(o.aimed) ? o.aimed : null;
      if (o.romantic && aimed && !aimed.length && Array.isArray(o.present) && o.present.includes(n.id) && !isMinor(n, ctx) && !playerMinor(ctx)) {
        const wel = welcomeOf(n, ctx);
        const ans = !wel.ok ? flirtAnswer(n, null, ctx) : o.rollStat === 'charm' && typeof o.rollTier === 'string' ? flirtAnswer(n, o.rollTier, ctx) : { answer: 'aside', tier: null };
        return { event: 'flirted', late: true, ans, welcome: ans.answer === 'welcome', aboutId: null, private: false, why: 'the bookkeeper named who the flirt was aimed at' };
      }
      if (o.romantic) return { refuse: aimed && !aimed.length ? 'the flirt was aimed at nobody here the engine can take it for' : 'the engine records the flirt (the parse saw it)' };
      name = 'complimented';
    } else if (!WIRE_EVENTS[name]) return { refuse: `${name} is the engine's to record, never the bookkeeper's` };
    // Wave 32: tier B's words (badmouthed, vouched_for) are open now that the town has ties.
    const mems = list(n.memories);
    const asks = list(isObj(n.rel) ? n.rel.asks : null);
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const byId = id => npcs.find(x => isObj(x) && x.id === id) || null;
    const live = m => isObj(m.d) && !m.witness && !m.secondhand && !settlements(m).length;
    const out = { event: name, aboutId: ABOUT_EVENTS.includes(name) && typeof ev.aboutId === 'string' && ev.aboutId !== n.id ? ev.aboutId : null, private: ev.private === true && WORDS_EVENTS.includes(name) };
    if (name !== ev.event) out.why = 'a flirt the parse did not see is a compliment';
    const present = Array.isArray(o.present) ? o.present : [];
    const aimed = (Array.isArray(o.targets) && o.targets.includes(n.id)) || o.speechTo === n.id;
    const day = ctx.day;
    const confided = mems.filter(m => m.event === 'they_confided' && live(m));
    const down = (to, why) => Object.assign(out, { event: to, why, aboutId: ABOUT_EVENTS.includes(to) ? out.aboutId : null, private: out.private && WORDS_EVENTS.includes(to) });
    switch (name) {
      case 'kept_word': {
        // All three (design R4): a confidence of theirs a day old, an asker the words name who is here and is not them, and none in 3 days.
        const old = confided.some(m => dayOf(m, ctx, day) <= day - 1);
        const asker = npcs.find(x => isObj(x) && x.id !== n.id && present.includes(x.id) && Town.nameMentions(ev.text, x));
        const lately = mems.some(m => m.event === 'kept_word' && !m.witness && day - dayOf(m, ctx, day) < CAPS.mergeDays);
        if (!old) return down('confided', 'no confidence of theirs a day old to keep');
        if (!asker) return down('confided', 'nobody named who asked is here');
        if (lately) return down('confided', 'a kept word from them in the last three days');
        return out;
      }
      case 'came_clean': {
        // Wave 29: owning up to the one a loose end's secret would be told to voids the record held over the player, and its blackmail can no longer be.
        const loose = leverageOf(ctx).find(x => x.over === 'player' && liveRec(x) && isObj(x.about) && x.about.kind === 'loose_end' && Array.isArray(x.mattersTo) && x.mattersTo.includes(n.id));
        if (loose) out.voidRec = loose.id;
        if (mems.some(m => m.event === 'lied_caught' && live(m))) return out;
        let i = -1;
        asks.forEach((x, j) => { if (x.act === 'deceive' && !x.confessed) i = j; });
        if (i >= 0) return Object.assign(out, { confess: i });
        return loose ? out : { knows: 3, why: 'no lie to them on record to come clean about' };
      }
      case 'lied_caught': {
        const lies = asks.filter(x => x.act === 'deceive');
        const claim = mems.some(m => m.event === 'noted' && m.act !== 'own' && !m.witness && !State.protectedMemory(m));
        if (!lies.length && !claim) return { refuse: 'no lie to them and no claim of the player\'s on record' };
        if (!claim && lies.every(x => x.confessed)) out.scale = 0.25;
        return out;
      }
      /* Wave 29: telling X what the player holds over Y needs a live record
         over Y; it spends the record, and X takes trust +8 (a second
         exposure to the same X costs trust 8 instead). */
      case 'exposed': {
        const y = out.aboutId ? byId(out.aboutId) : null;
        const rec = y ? holdsOver(y, ctx).find(x => !isObj(x.about) || x.about.kind !== 'loose_end') : null;
        if (!rec) return { knows: 2, why: 'the player holds nothing over them to tell' };
        out.spend = rec.id;
        if (mems.some(m => m.event === 'exposed' && m.about === y.id && !m.witness)) Object.assign(out, { d: { w: 0, t: -8 }, why: 'told them about the same person again' });
        // Wave 32, the messenger (design section 4.5): someone who likes them at 60 or more takes it out on the one who told, liking -8 for the trust +8.
        else { const tie = tieOf(n.id, y.id, ctx); if (tie && tieNow(tie).w >= MESSENGER.likedAt) Object.assign(out, { d: { w: MESSENGER.w, t: 0 }, why: 'the messenger: they like them too well' }); }
        return out;
      }
      /* Wave 32: a word against someone or for them (design section 4.5):
         knowing the player a little better (the row: knows +2) whatever
         came of it; on a persuade aimed at them that worked, their liking
         for the one named moves (tie: State logs it on their tie, seen);
         badmouthing someone to a listener who likes them at 40 or more
         costs the player 5 of the listener's liking instead. */
      case 'badmouthed':
      case 'vouched_for': {
        const y = out.aboutId ? byId(out.aboutId) : null;
        if (!y) return { knows: 2, why: 'nobody named to say it about' };
        const plan = wordsTie(n, y.id, name, o, ctx);
        if (plan && plan.cost) return Object.assign(out, { d: { w: plan.cost }, why: plan.why });
        if (plan && plan.w) out.tie = { from: n.id, to: y.id, w: plan.w };
        else if (plan && plan.why) out.why = plan.why;
        return out;
      }
      case 'betrayed_confidence': return confided.length ? out : down('crossed', 'they confided nothing to pass on');
      case 'defended': {
        const z = out.aboutId ? byId(out.aboutId) : null;
        if (!z || !present.includes(z.id)) return down('complimented', 'whoever they were defended against is not here');
        const sameScene = m => isObj(m) && !m.witness && dayOf(m, ctx, day) === day && (!m.place || m.place === ctx.place) && harmful(m);
        const provoked = list(z.memories).some(sameScene) || list(isObj(z.rel) ? z.rel.asks : null).some(x => x.day === day && x.act === 'attack')
          || ((Array.isArray(o.targets) && o.targets.includes(z.id)) && ['attack', 'intimidate'].includes(o.actionType));
        return provoked ? down('complimented', `the player went for ${z.name} first`) : out;
      }
      case 'apologised': {
        const landed = (o.rollSuccess === true && ['persuade', 'talk'].includes(o.actionType) && aimed) || tracksOf(n, ctx).w > -25;
        return landed ? out : { knows: 2, why: 'the apology did not land' };
      }
      case 'rebuffed': return sparkStatus(n, ctx) ? out : { refuse: 'they made no advance to turn down' };
      /* Wave 29 (the integration plan's 19.4): a secret let slip is a record
         only when the narrator was given it (known.secrets) and the
         narration shows it: two of their leverageKeys in its words. The
         record's text is the bookkeeper's words, never the secret field;
         private means they do not know the player knows. */
      case 'learned_secret': {
        if (!(ctx.s && isObj(ctx.s.known) && isObj(ctx.s.known.secrets) && ctx.s.known.secrets[n.id])) return { refuse: 'their secret was never in the narrator\'s packet' };
        const keys = keysOf(n, ctx);
        const hit = keysIn(o.narration, keys);
        if (hit < GATES.leverage.keys) return { refuse: `the narration shows ${hit} of their ${keys.length} keys (it takes ${GATES.leverage.keys})` };
        if (holdsOver(n, ctx).some(x => isObj(x.about) && x.about.kind === 'secret')) return { knows: 2, why: 'the player already holds that' };
        out.private = ev.private === true;
        out.record = { holder: 'player', over: n.id, about: { kind: 'secret', npcId: n.id }, weight: secretWeightOf(n, ctx), mattersTo: mattersToOf(n, ctx), aware: ev.private !== true, playerKnows: true, via: 'learned_secret' };
        return out;
      }
      /* Caught at it (the integration plan's 19.4): the player's action this
         turn was a steal, a sneak, a search, or a lie to them; at most one
         other person here besides them; never violence. The record is
         theirs over the player: a theft matters to the one robbed, a sneak
         or a search to the police head, a lie to nobody. */
      case 'caught_you_at': {
        if (mems.some(m => m.event === 'caught_you_at' && m.turn === ctx.turn)) return { refuse: 'the engine already has it this turn' };
        const act = o.actionType;
        if (!(['steal', 'sneak', 'search'].includes(act) || (act === 'deceive' && aimed))) return { refuse: 'nothing was done this turn they could catch the player at (never a fight: it is a memory and news already)' };
        if (present.filter(id => id !== n.id).length > 1) return { refuse: 'more than one other person was there: no secret to hold' };
        const victim = act === 'steal' ? (Array.isArray(o.targets) ? o.targets.find(id => id !== n.id && byId(id)) : null) || n.id : null;
        out.record = { holder: n.id, over: 'player', about: { kind: 'seen' }, weight: LEVERAGE_WEIGHT.caught[act] || 1, mattersTo: act === 'steal' ? [victim] : act === 'deceive' ? [] : [policeHead(ctx)].filter(Boolean), aware: true, playerKnows: true, via: 'caught_you_at', act };
        return out;
      }
      case 'stole_from': return asks.some(x => x.act === 'steal') ? out : { refuse: 'no theft from them on record' };
      case 'cheated': return asks.some(x => x.act === 'steal' || x.act === 'deceive') ? out : { refuse: 'no deal with them on record' };
      default: return out;
    }
  }
  /* The bookkeeper's handles on what someone still holds (its packet; the
     integration plan's 5.6): the newest unsettled memories, at most max,
     each "<words> (<event>, Day N)". */
  function handles(n, max, ctx) {
    ctx = context(ctx);
    return list(n.memories).filter(m => !m.witness && !settlements(m).length).slice(-(Number.isInteger(max) && max > 0 ? max : 3))
      .map(m => `${cleanText(m.text, 100)} (${typeMemory(m)}, Day ${dayOf(m, ctx, ctx.day)})`);
  }

  // ----- wave 29: what people hold (leverage, the night together, jealousy) -----
  /* A leverage record (state.leverage; the integration plan's 2.3): { id,
     holder ('player' or an id), over (an id or 'player'), about: { kind:
     secret | seen | loose_end, npcId? }, text (the narration's words, never
     the secret field), weight 1-3, since: { day, turn, via }, aware (the one
     it is over knows), playerKnows, status, log: [{ turn, day, status }],
     demand ({ amount, dueDay, turn, paid?, paidDay? } owed to the player, or
     { obligationId } owed by them), uses: [{ turn, day, event }], knownBy:
     [{ npcId, turn }], mattersTo: [ids] }. A record is live while held,
     used or paid; paid is final for demands; spent (told) and void end it. */
  const LEV_LIVE = Object.freeze(['held', 'used', 'paid']);
  const LEV_STATUSES = Object.freeze(['held', 'used', 'paid', 'spent', 'void']);
  const LEV_NEXT = deepFreeze({ held: ['used', 'paid', 'spent', 'void'], used: ['paid', 'spent', 'void'], paid: ['spent', 'void'], spent: [], void: [] });
  const LEV_ABOUT = Object.freeze(['secret', 'seen', 'loose_end']);
  // A night together is asked for (the integration plan's 19.2): these words with a flirt, or the parse's "more", or a walk to a home or a motel room.
  const INTIMATE_ASK = /\b(spend the night|come (?:up|back) (?:to|with)|bed|sleep with|stay over|my room|your place)\b/i;
  const NIGHT_PLACES = Object.freeze(['house', 'trailer', 'apartment', 'bighouse', 'home', 'motel']);
  // A price named in the player's words: "$300", "300 dollars", "three hundred", "fifty bucks" (the integration plan's 8.3, with the words for it).
  const NUMBER_WORDS = deepFreeze({ a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 });
  function priceIn(text) {
    const t = ` ${String(text || '').toLowerCase().replace(/[’]/g, "'").replace(/(\d),(?=\d{3})/g, '$1')} `;
    let m = /\$\s?(\d+)/.exec(t) || /\b(\d+)\s+(?:dollars|bucks)\b/.exec(t) || /\b(\d+)\s+hundred\b/.exec(t);
    if (m) return (parseInt(m[1], 10) * (/hundred/.test(m[0]) ? 100 : 1)) || null;
    m = /\b(a|one|two|three|four|five|six|seven|eight|nine|ten)\s+hundred\b/.exec(t);
    if (m) return NUMBER_WORDS[m[1]] * 100;
    m = /\b(ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](one|two|three|four|five|six|seven|eight|nine))?\s+(?:dollars|bucks)\b/.exec(t);
    return m ? NUMBER_WORDS[m[1]] + (m[2] ? NUMBER_WORDS[m[2]] : 0) : null;
  }
  /* Words that carry the meaning (the content words of a record, a key, an
     ask), as rough stems: "books" is "book", "sales" "sale". */
  const STOPWORDS = new Set(('the and but for with from into onto over under about this that these those then than there here what which who whom whose when where why how all any some not you your yours his her hers him she they them their theirs our ours its was were are been being have has had will would shall should can could may might must just very too also only own same other again once now get got gets going say said tell told know knew does did done one ' +
    'out off for yes yeah okay let lets give gave want wants like back way well much more most less least ever every any anything something nothing everyone someone know ' +
    'through after before behind around down still even never always because while until since upon onto off without within among against else unless').split(' '));
  function stemWord(w) {
    if (w.length > 4 && /(?:ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function contentWords(text) {
    const out = [];
    for (const w of String(text || '').toLowerCase().replace(/[’']s\b/g, '').replace(/[’']/g, '').split(/[^a-z0-9]+/)) if (w.length >= 3 && !STOPWORDS.has(w)) { const s = stemWord(w); if (!out.includes(s)) out.push(s); }
    return out;
  }
  // How many content words two texts share.
  function overlap(a, b) { const B = contentWords(b); return contentWords(a).filter(w => B.includes(w)).length; }
  // A secret's keys (content's leverageKeys: 2 or 3 short phrases), how many a text holds (every content word of a key, as whole words in any order).
  function keysOf(n, ctx) { const k = authored(n, 'leverageKeys', ctx); return Array.isArray(k) ? k.filter(x => typeof x === 'string' && x.trim()) : []; }
  function keysIn(text, keys) {
    const words = contentWords(text);
    return (Array.isArray(keys) ? keys : []).filter(k => { const kw = contentWords(k); return kw.length > 0 && kw.every(w => words.includes(w)); }).length;
  }
  function secretWeightOf(n, ctx) { const v = toInt(authored(n, 'secretWeight', ctx)); return v !== null ? clamp(v, 1, 3) : LEVERAGE_WEIGHT.secret; }
  // Whom the telling would hurt them with (content's mattersTo), the ones that exist.
  function mattersToOf(n, ctx) {
    ctx = context(ctx);
    const v = authored(n, 'mattersTo', ctx);
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    return (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((id, i, a) => typeof id === 'string' && a.indexOf(id) === i && id !== n.id && (!npcs.length || npcs.some(x => isObj(x) && x.id === id)));
  }
  /* What telling the police their secret does (content's whenTold: {
     memory?, crime?, inquiry? }; design section 2.6.5). The default: a
     weight-3 noted memory for the officer it reaches ("knows what {npc} has
     been doing") and, for a crime, an inquiry seed that fills a segment of
     the police clock. */
  const WHEN_TOLD = deepFreeze({ memory: 'knows what {npc} has been doing', inquiry: '{police} starts asking around about {npc}.', days: [1, 2], news: 'Chief Bell has been asking questions about {npc}.' });
  function whenToldOf(n, ctx) { const v = authored(n, 'whenTold', ctx); return isObj(v) ? v : null; }
  /* The most a demand can take from them: $100 unless content raises it
     (canRaise; at most three people above 100), $0 for anyone under 18. */
  function canRaise(n, ctx) {
    if (!isObj(n) || isMinor(n, ctx)) return 0;
    const v = toInt(authored(n, 'canRaise', ctx));
    return v !== null ? clamp(v, 0, 1000) : GATES.leverage.canRaise;
  }
  function leverageOf(ctx) { ctx = context(ctx); return ctx.s && Array.isArray(ctx.s.leverage) ? ctx.s.leverage.filter(isObj) : []; }
  const liveRec = x => isObj(x) && LEV_LIVE.includes(x.status);
  // What the player holds over them, live (aware: only the ones they know about).
  function holdsOver(n, ctx, aware) { return isObj(n) ? leverageOf(ctx).filter(x => x.holder === 'player' && x.over === n.id && liveRec(x) && (!aware || x.aware === true)) : []; }
  // What they hold over the player, live (known: only what the player knows of).
  function heldOverPlayer(n, ctx, known) { return isObj(n) ? leverageOf(ctx).filter(x => x.holder === n.id && x.over === 'player' && liveRec(x) && (!known || x.playerKnows === true)) : []; }
  /* The police bar (design section 2.6.5): someone the player holds an aware
     record over cannot go to the police about them, unless they are hard. */
  function policeBarred(n, ctx) { return isObj(n) && holdsOver(n, ctx, true).length > 0 && !axesOf(n, ctx).hard; }
  /* A standoff (design section 2.6.4): each holds a live record over the
     other, the player's one they know of. Neither plants a grudge or a
     report against the other while both stand. */
  function standoff(n, ctx) { return holdsOver(n, ctx, true).length > 0 && heldOverPlayer(n, ctx).length > 0; }
  /* The player's words use what they hold (the integration plan's 19.4;
     design section 2.6.5, N9): two content words of the record's text, one
     of the secret's own keys ("Then Bell hears your tapes."), or a threat
     phrase. */
  function references(input, rec, ctx) {
    const t = String(input || '').replace(/[’]/g, "'");
    if (!t || !isObj(rec)) return false;
    if (overlap(t, rec.text) >= GATES.leverage.overlap || THREAT_PHRASES.test(t)) return true;
    ctx = context(ctx);
    const over = isObj(rec.about) && rec.about.kind === 'secret' && ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs.find(x => isObj(x) && x.id === rec.over) : null;
    return !!over && keysIn(t, keysOf(over, ctx)) >= 1;
  }
  /* A backed ask (design section 2.6.5): an intimidation or a persuasion
     aimed at them with the player's live record over them in aboutIds
     (normaliseParse let it through: the words used it). A romantic ask is
     never backed. Returns the record or null. */
  function backedRecord(n, action, ctx) {
    if (!isObj(n) || !isObj(action) || !['intimidate', 'persuade'].includes(action.actionType)) return null;
    if (action.romantic === true || action.romantic === 'flirt' || action.romantic === 'more') return null;
    const ids = (Array.isArray(action.aboutIds) ? action.aboutIds : []).filter(x => /^lev_/.test(String(x)));
    return holdsOver(n, ctx).find(x => ids.includes(x.id)) || null;
  }
  /* How a backed ask rolls: weight 2 or more no roll (the d20 burned), weight
     1 easy, a hard target normal, anyone under 18 as the parse had it.
     Returns { roll: false } or { roll: true, difficulty | null }. */
  function backedRoll(n, rec, ctx) {
    if (isMinor(n, ctx)) return { roll: true, difficulty: null };
    if (axesOf(n, ctx).hard) return { roll: true, difficulty: 'normal' };
    return (toInt(rec.weight) || 1) >= 2 ? { roll: false } : { roll: true, difficulty: 'easy' };
  }
  function pronounsOf(n) { const they = !isObj(n) || !PRONOUN_FORMS[n.pronouns] || n.pronouns === 'they'; return { f: (isObj(n) && PRONOUN_FORMS[n.pronouns]) || PRONOUN_FORMS.they, s: they ? '' : 's' }; }
  /* Their answer to a backed ask, decided at resolve (the integration plan's
     19.4): a demand on a paid record is refused as a demand (they already
     paid); the tough (Wade, Colt, Boyd, Leon, Dwight) won't pay and answer
     with violence; the hard who are not tough (Carter, Marcus, Loretta,
     Tammy, Nikki, Trent) refuse and talk or tell their protector; an ask
     that rolled and failed is a bluff called; everyone else complies,
     paying a price named within min(100 x weight, canRaise) tomorrow and
     nothing now. ask: { price, rolled, success }. Returns { answer:
     'paid' | 'violence' | 'refuses' | 'pays' | 'complies', amount, event
     (blackmailed with a price, else threatened_to_tell), grudge?, line (the
     narrator's, present tense) }. */
  function leverageAnswer(rec, n, ask, ctx) {
    ctx = context(ctx);
    const o = isObj(ask) ? ask : {};
    const { f, s } = pronounsOf(n);
    const price = Number.isInteger(o.price) && o.price > 0 ? o.price : null;
    if (price && rec.status === 'paid') return { answer: 'paid', amount: 0, event: 'threatened_to_tell', line: `LEVERAGE: ${n.name} says ${f.subj} already paid, and won't again.` };
    const event = price ? 'blackmailed' : 'threatened_to_tell';
    const ax = axesOf(n, ctx);
    const minor = isMinor(n, ctx);
    if (!minor && ax.tough) return { answer: 'violence', amount: 0, event, grudge: 'violence', line: `LEVERAGE: ${n.name} won't pay and won't be pushed; ${f.subj} make${s} it plain ${f.subj} will answer for it.` };
    if (!minor && ax.hard) return { answer: 'refuses', amount: 0, event, grudge: 'talk', line: `LEVERAGE: ${n.name} refuses: "Tell them, then."` };
    if (o.rolled && !o.success) return { answer: 'refuses', amount: 0, event, line: `LEVERAGE: ${n.name} calls the bluff and gives nothing.` };
    if (price) {
      const cap = Math.min(GATES.leverage.perWeight * clamp(toInt(rec.weight) || 1, 1, 3), canRaise(n, ctx));
      const amount = Math.min(price, cap);
      if (amount <= 0) return { answer: 'complies', amount: 0, event, line: `LEVERAGE: ${n.name} has no money to give; ${f.subj} pay${s} nothing.` };
      return { answer: 'pays', amount, event, line: `LEVERAGE: ${n.name} agrees to pay ${money(amount)}${amount < price ? `, all ${f.subj} can raise,` : ''} by tomorrow evening; ${f.subj} pay${s} nothing now.` };
    }
    return { answer: 'complies', amount: 0, event, line: `LEVERAGE: ${n.name} goes along with it; ${f.subj} know${s} what you know.` };
  }
  /* What is held between the player and them, as lines (the card's and the
     reasons', design section 7.1): { id, dir: 'yours' | 'theirs', text,
     day, event, weight, status, line }. Live records the player holds (and
     what was paid for them); a record over the player only once they know
     of it. */
  function leverageLines(n, ctx) {
    ctx = context(ctx);
    if (!isObj(n)) return [];
    const out = [];
    const { f } = pronounsOf(n);
    const Subj = capFirst(f.subj);
    for (const x of holdsOver(n, ctx)) {
      out.push({ id: x.id, dir: 'yours', text: x.text, day: isObj(x.since) ? x.since.day : null, event: isObj(x.since) && x.since.via ? x.since.via : 'learned_secret', weight: x.weight, status: x.status, line: `You know: ${x.text}.` });
      const dm = isObj(x.demand) ? x.demand : null;
      if (dm && dm.paid === true) out.push({ id: x.id, dir: 'yours', text: `paid ${money(dm.amount)} to keep it quiet`, day: dm.paidDay || null, event: 'paid_silence', weight: x.weight, status: x.status, line: `${Subj} paid ${money(dm.amount)} to keep it quiet.` });
      else if (dm && Number.isInteger(dm.amount) && dm.amount > 0) out.push({ id: x.id, dir: 'yours', text: `owes you ${money(dm.amount)} for keeping quiet`, day: isObj(x.since) ? x.since.day : null, event: 'blackmailed', weight: x.weight, status: x.status, line: `${Subj} owes you ${money(dm.amount)} for keeping quiet, due Day ${dm.dueDay}.` });
    }
    for (const x of heldOverPlayer(n, ctx, true)) out.push({ id: x.id, dir: 'theirs', text: x.text, day: isObj(x.since) ? x.since.day : null, event: isObj(x.since) && x.since.via ? x.since.via : 'caught_you_at', weight: x.weight, status: x.status, line: `${n.name} has something on you: ${x.text}${x.status === 'paid' ? ' (you paid to keep it quiet)' : ''}.` });
    return out;
  }
  // What the player is owed for their silence (the Journal's "are owed"): demands on live records not yet paid.
  function demands(ctx) {
    return leverageOf(ctx).filter(x => x.holder === 'player' && x.status === 'used' && isObj(x.demand) && Number.isInteger(x.demand.amount) && x.demand.amount > 0 && x.demand.paid !== true)
      .map(x => ({ id: x.id, npcId: x.over, amount: x.demand.amount, dueDay: x.demand.dueDay, turn: x.demand.turn }));
  }
  /* A night together, every gate before the narrator writes (the
     integration plan's 19.2): both adults (the player too), eligible and
     the flirt welcome, spark 50, romance 40 (wave 35; liking 40 before),
     trust 30, knows 30. Money never
     helps. Wave 40: nor does fear or leverage, a second barrier behind
     romanceTurn's coercion for any caller: fear at GATES.compliance.fear
     or more, or any live record the player holds over them (aware or
     not), is short. Returns { ok, welcome, short: [what fell short] }. */
  function intimateGate(n, ctx) {
    ctx = context(ctx);
    const short = [];
    const wel = welcomeOf(n, ctx);
    if (!wel.ok) short.push(wel.why);
    const c = tracksOf(n, ctx);
    const G = GATES.intimate;
    if (c.f >= GATES.compliance.fear) short.push(`fear ${c.f} at ${GATES.compliance.fear} or more`);
    if (holdsOver(n, ctx).length) short.push('the player holds something over them');
    if (c.s < G.spark) short.push(`spark ${c.s} under ${G.spark}`);
    if (c.m < G.romance) short.push(`romance ${c.m} under ${G.romance}`);
    if (c.t < G.trust) short.push(`trust ${c.t} under ${G.trust}`);
    if (c.k < G.knows) short.push(`knows ${c.k} under ${G.knows}`);
    return { ok: !short.length, welcome: wel.ok, short };
  }
  /* Jealousy, a witness rule (design section 3.1): a partner of theirs by
     label who sees the player flirt with them takes liking -15 x (1 +
     0.25 pride) and trust -10; someone at spark 30 for the player who sees
     it takes liking -8, trust -5, spark -5 and (wave 35) romance -5. Returns the events (crossed,
     "flirted with <name> in front of me"). */
  function jealousyOf(n, presentIds, ctx) {
    ctx = context(ctx);
    const npcs = ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs : [];
    const G = GATES.jealousy;
    const kin = isObj(n) ? kinOf(n, ctx) : [];
    const out = [];
    for (const id of Array.isArray(presentIds) ? presentIds : []) {
      const w = npcs.find(x => isObj(x) && x.id === id);
      if (!w || w.id === n.id || !available(w, ctx) || isMinor(w, ctx)) continue;
      const text = `flirted with ${n.name} in front of me`;
      if (kin.some(k => k.id === id && G.partners.includes(k.word))) {
        // Wave 31: a witness's own feeling, which goes no further along the town's ties (spread: false).
        out.push({ npcId: id, event: 'crossed', d: { w: rnd(G.partner.w * (1 + AXIS_EFFECTS.pride.liking * axesOf(w, ctx).p)), t: G.partner.t }, weight: 2, text, spread: false });
      } else if (eligible(w, ctx) && cacheOf(w, ctx).s >= G.spark) out.push({ npcId: id, event: 'crossed', d: Object.assign({}, G.other), weight: 1, decay: 'slight', text, spread: false });
    }
    return out;
  }
  // The feed's line for a spark status ("Jodie Strayhorn is sweet on you."), or for one lost ("Curtis Pruett takes the hint.").
  function statusLine(n, status) {
    if (!isObj(n)) return null;
    if (status === null) return fillTemplate(SPARK_LOST, { name: n.name });
    const st = SPARK_STATUS.find(x => x.status === status);
    return st ? fillTemplate(st.feed, { name: n.name }) : null;
  }

  // ----- what it reads as -----
  function unsettledHarm3(m) { return isObj(m) && m.weight >= 3 && harmful(m) && !settlements(m).length; }
  function holdsMarker(n, ctx) {
    const obs = ctx.s && isObj(ctx.s.player) && Array.isArray(ctx.s.player.obligations) ? ctx.s.player.obligations : [];
    return obs.some(o => isObj(o) && o.npcId === n.id && o.kind === 'debt' && (o.status === 'open' || (o.status === 'missed' && (o.paid | 0) < (o.amount | 0))));
  }
  function leverageBetween(n, ctx) {
    const recs = ctx.s && Array.isArray(ctx.s.leverage) ? ctx.s.leverage.filter(isObj) : [];
    const live = x => ['held', 'used', 'paid'].includes(x.status);
    return {
      yours: recs.some(x => x.holder === 'player' && x.over === n.id && x.aware === true && live(x)),
      theirs: recs.some(x => x.holder === n.id && x.over === 'player' && x.playerKnows === true && live(x))
    };
  }
  /* Spark's status, or null: null for anyone it cannot move for, before
     a number is read. */
  /* Wave 29: the status the recompute keeps with its hysteresis (the
     cache's bands.sp), read off the numbers when the cache has none yet. */
  function sparkStatus(n, ctx) {
    ctx = context(ctx);
    if (!eligible(n, ctx)) return null;
    const c = cacheOf(n, ctx);
    if (c.bands && c.bands.sp !== undefined) return c.bands.sp || null;
    const tmp = Object.assign({}, n, { rel: isObj(n.rel) ? repair(n, townRecord(n.id, ctx)) : fill(n, townRecord(n.id, ctx)) });
    return recompute(tmp, ctx.day, ctx).bands.sp || null;
  }
  /* The stance: { phrase, grid, tags, side, cell, override, contempt, why }.
     Bands from the cache (with their hysteresis); the memories decide
     "hates you", "doesn't know you" and contempt; tags in TAGS.order. */
  function stance(n, ctx) {
    ctx = context(ctx);
    const c = cacheOf(n, ctx);
    const ax = axesOf(n, ctx);
    const mems = list(n.memories);
    const wb = c.bands.w;
    const tb = c.bands.t;
    let grid = STANCE_GRID[wb] ? STANCE_GRID[wb][tb] : 'sizing you up';
    if (grid === 'hates you' && !mems.some(unsettledHarm3)) grid = 'against you';
    if (grid === 'sizing you up' && !mems.length && c.k < 10) grid = "doesn't know you";
    if (grid === 'loyal to you' && !(c.t > 0)) grid = 'warm to you';
    let phrase = grid;
    let override = null;
    const afraid = c.bands.f === 'afraid' && !ax.hard;
    if (afraid && c.w >= OVERRIDES.window[0] && c.w < OVERRIDES.window[1]) { override = c.levFear > c.f - c.levFear ? OVERRIDES.know : OVERRIDES.you; phrase = override; }
    const tags = [];
    const lev = leverageBetween(n, ctx);
    if (lev.yours && lev.theirs) tags.push(TAGS.leverage.both);
    else if (lev.theirs) tags.push(TAGS.leverage.theirs);
    else if (lev.yours && override !== OVERRIDES.know) tags.push(TAGS.leverage.yours);
    const sp = sparkStatus(n, ctx);
    if (sp) tags.push(sp);
    if (afraid && c.w < OVERRIDES.window[0]) tags.push(OVERRIDES.below);
    else if (afraid && c.w >= OVERRIDES.window[1]) tags.push(OVERRIDES.above);
    if (c.net >= 2) tags.push(TAGS.debts.big); else if (c.net >= 1) tags.push(TAGS.debts.owes); else if (c.net <= -1) tags.push(TAGS.debts.owe);
    if (holdsMarker(n, ctx)) tags.push(TAGS.debts.marker);
    if (c.bands.f === 'uneasy') tags.push(TAGS.uneasy);
    // Contempt: against them, and what holds them there is words or honesty, not a hurt.
    let contempt = false;
    if (grid === 'against you') {
      const day = ctx.day;
      const bad = mems.filter(m => harmful(m)).map(m => ({ m, size: isObj(m.d) ? -(remainder(m, n, day, ax, ctx).w + remainder(m, n, day, ax, ctx).t) : m.weight })).sort((a, b) => b.size - a.size).slice(0, 2);
      contempt = bad.length > 0 && bad.every(x => CONTEMPT_EVENTS.includes(typeMemory(x.m)));
    }
    return { phrase, grid, tags, side: SIDES[phrase] || 'neutral', cell: `${wb}/${tb}`, override, contempt, why: reasons(n, 2, { ctx }) };
  }
  /* How they carry it now, at most CAPS.cueWords words: the override's or
     spark status's clause first (never cut), then the cell's, then the
     first tag's, then "takes you seriously" (respected or feared in town,
     or trust 25) if it fits. Whole clauses only. */
  /* Wave 30: the cue in its parts, so the narrator's line can drop the
     cell's clause when it must (the integration plan's 10.1): lead (the
     override's or the spark status's, never cut), cell (the stance's own,
     or "talks past you" for contempt), pity ("worries about you": liking 25
     while the player is hurt, broke or beaten; design section 10), tag (the
     first tag's that has a clause) and seriously ("takes you seriously":
     respected or feared in town, or trust 25), each a list of clauses in
     their words ({them}, {they} filled). */
  function playerLow(ctx) {
    const p = ctx.s && isObj(ctx.s.player) ? ctx.s.player : null;
    if (!p) return false;
    const hurt = Number.isFinite(p.hp) && Number.isFinite(p.maxHp) && p.maxHp > 0 && p.hp < p.maxHp / 2;
    const broke = Number.isFinite(p.gold) && p.gold < 10;
    const beaten = (Array.isArray(p.conditions) ? p.conditions : []).some(c => isObj(c) && /^beaten\b/i.test(String(c.name || '')));
    return hurt || broke || beaten;
  }
  function cueParts(n, ctx) {
    ctx = context(ctx);
    const st = stance(n, ctx);
    const c = cacheOf(n, ctx);
    const pron = isObj(n) && n.pronouns === 'he' ? { them: 'him', they: 'he' } : isObj(n) && n.pronouns === 'she' ? { them: 'her', they: 'she' } : { them: 'them', they: 'they' };
    const fill = list => (list || []).map(x => fillTemplate(x, pron));
    const sp = SPARK_STATUS.find(x => st.tags.includes(x.status));
    // Wave 29: "wants you" from someone who distrusts the player says so ("doesn't trust you").
    const spCue = sp ? (sp.distrustCue && c.t <= GATES.spark.distrust ? sp.distrustCue : sp.cue) : [];
    const tag = st.tags.find(t => CUES[t] && !(sp && t === sp.status));
    const tier = ctx.s && ctx.s === State.current ? State.reputationTier('town') : null;
    return {
      stance: st,
      lead: fill(st.override ? CUES[st.override] : spCue),
      cell: fill(st.contempt ? CUES.contempt : CUES[st.grid]),
      pity: c.w >= 25 && playerLow(ctx) ? fill(CUES.pity) : [],
      tag: tag ? fill(CUES[tag]) : [],
      seriously: tier === 'respected' || tier === 'feared' || c.t >= 25 ? fill(CUES.seriously) : []
    };
  }
  /* The parts as one cue, whole clauses only, at most CAPS.cueWords words:
     the lead always (never cut), then the cell's (unless opts.noCell), the
     pity, the tag's and "takes you seriously" while they fit. */
  function cueText(parts, opts) {
    const words = x => x.split(/\s+/).filter(Boolean).length;
    const out = parts.lead.slice();
    let used = out.reduce((a, x) => a + words(x), 0);
    const add = clauses => { for (const x of clauses || []) { if (used + words(x) > CAPS.cueWords) return; out.push(x); used += words(x); } };
    if (!(opts && opts.noCell)) add(parts.cell);
    add(parts.pity);
    add(parts.tag);
    add(parts.seriously);
    return out.join(', ');
  }
  function cue(n, ctx) { return cueText(cueParts(n, ctx)); }
  /* The memories that hold them where they are, biggest first: typed ones
     by what they still carry, then legacy lines by weight and how new they
     are. [{ text, day, event, settled, weight }]. */
  /* Wave 29: what is held between them leads (design section 8: leverage
     text the player holds is a reason, it was narrated; a record over the
     player only once they know of it): { text, day, event, settled: 0,
     weight, leverage: id, line } from leverageLines, then the memories
     (the record's own learned_secret or caught_you_at memory is not told
     twice). */
  function reasons(n, max, opts) {
    const ctx = context(opts && opts.ctx);
    const ax = axesOf(n, ctx);
    const cap = Number.isInteger(max) && max > 0 ? max : 2;
    const lev = leverageLines(n, ctx).map(x => ({ text: x.text, day: x.day, event: x.event, settled: 0, weight: x.weight, leverage: x.id, line: x.line }));
    const levIds = new Set(lev.map(x => x.leverage));
    const rows = list(n.memories).filter(m => !(typeof m.leverageId === 'string' && levIds.has(m.leverageId))).map((m, i) => {
      const typed = isObj(m.d);
      const q = typed ? remainder(m, n, ctx.day, ax, ctx) : null;
      return { m, i, typed, size: q ? Math.abs(q.w) + Math.abs(q.t) + Math.abs(q.f) : 0 };
    });
    rows.sort((a, b) => (Number(b.typed) - Number(a.typed)) || (b.size - a.size) || (num(b.m.weight) - num(a.m.weight)) || (b.i - a.i));
    /* Wave 30: what the card and the narrator need besides: the memory's
       index and turn, whether it is a harm, whether it came through a tie
       the town does not know (hidden: the narrator gets no cause and no
       name; the card only the day) and whether it was planted off-screen
       and not seen yet (seen false: the card keeps it back until the player
       has been in a scene with them since). Spark reasons never for anyone
       it cannot move for. */
    const open = eligible(n, ctx);
    // For someone under 18, never a line that reads as romance, whatever it was typed as (the narrator and the card read these).
    const minor = isMinor(n, ctx);
    /* Wave 31: hidden while the tie it came through is (either way: Hollis
       Byrd's to Wade Purvis carries Wade's report), and with the act's words
       for the card when it was hearsay ("you shamed Royce Pittman at the
       counter"); a memory whose people have no tie in the game keeps its
       own flag. */
    const stillHidden = m => {
      const via = m.secondhand.via;
      if (typeof via !== 'string' || (!tieOf(n.id, via, ctx) && !tieOf(via, n.id, ctx))) return true;
      return hiddenBetween(n.id, via, ctx);
    };
    // A secondhand copy's reason is dated by the act it tells of (wave 31: secondhand.day), not the day it was heard.
    const dayFor = m => (isObj(m.secondhand) && Number.isInteger(m.secondhand.day) ? m.secondhand.day : dayOf(m, ctx, ctx.day));
    const mems = rows.filter(x => (open || !ROMANCE_EVENTS.includes(x.m.event)) && !(minor && ROMANCE_TEXT.test(String(x.m.text || '')))).map(x => Object.assign({ text: x.m.text, day: dayFor(x.m), event: typeMemory(x.m), settled: settlements(x.m).length, weight: x.m.weight, i: x.i, turn: x.m.turn, harm: harmful(x.m) },
      isObj(x.m.secondhand) && x.m.secondhand.hidden === true && stillHidden(x.m) ? Object.assign({ hidden: true }, typeof x.m.secondhand.act === 'string' && x.m.secondhand.act ? { act: x.m.secondhand.act } : {}) : {},
      x.m.seen === false ? { unseen: true } : {}, x.m.witness === true ? { witness: true } : {}));
    return lev.concat(mems).slice(0, cap);
  }
  /* The card's words for each track, behind its "More" fold (wave 30,
     design section 7.1): liking by its seven bands, trust by its three and
     "completely" from 60, fear by its three, knows-you by four steps, and
     wanting (spark) and caring that way (romance, wave 35), each by its own
     bands, never shown for anyone they cannot move for; and (wave 35)
     the favours owed by their net, words('owed', net). */
  const WORDS = deepFreeze({
    w: { hates: 'hates you', dislikes: 'no', cool: 'not much', neutral: 'either way', friendly: 'some', warm: 'a lot', devoted: 'completely' },
    t: { distrusts: 'no', unsure: 'not yet', trusts: 'yes', full: 'completely' },
    f: { calm: 'no', uneasy: 'a little', afraid: 'yes' },
    k: [[10, 'barely'], [30, 'a little'], [60, 'well'], [101, 'very well']],
    s: { none: 'no', noticed: 'a little', wants: 'yes', burning: 'very much' },
    m: { none: 'no', little: 'a little', some: 'some', lot: 'a lot', heels: 'head over heels' },
    owed: { '3': 'owes you a lot', '2': 'owes you a lot', '1': 'owes you one', '0': 'even', '-1': 'you owe them one', '-2': 'you owe them a lot', '-3': 'you owe them a lot' }
  });
  // The word for a track's value; prev: the band it held (the hysteresis the stance reads).
  function words(track, v, prev) {
    const x = toInt(v) || 0;
    if (track === 'k') return (WORDS.k.find(([at]) => x < at) || WORDS.k[WORDS.k.length - 1])[1];
    if (track === 'owed') return WORDS.owed[String(clamp(x, -CAPS.owed, CAPS.owed))];
    if (!BANDS[track] || !WORDS[track]) return null;
    if (track === 't' && x >= 60) return WORDS.t.full;
    return WORDS[track][band(track, x, prev)];
  }

  // ----- wave 31 (B1): the town is a graph -----
  /* People about each other (design section 4; the integration plan's 1.3,
     2.3, 11.3). A tie is one person's toward another, directed:
     state.ties["npc_mavis>npc_dewayne"] = { kind, base: { w, t }, log: [{
     turn, day, w, t, why, seen? }], hidden, known, revealedBy?, why? }. The
     kind is what B is to A (Dewayne is Mavis's spouse); w and t (liking and
     trust, -100..100) are base plus the log (tieNow), the log at most
     TIE_LOG long, older entries folded into base. Every relation label
     becomes a tie both ways with TIE_KINDS' defaults, content's ties
     override or add (the town's secrets among them, hidden with what
     reveals them), and members of one faction with no other tie are
     fellows. Only people in town take part (free, alive, here). */
  const TIE_KINDS = deepFreeze({
    spouse: { w: 50, t: 40 }, partner: { w: 50, t: 40 }, lover: { w: 80, t: 70 }, child: { w: 70, t: 30 }, parent: { w: 50, t: 40 }, sibling: { w: 40, t: 30 },
    grandchild: { w: 60, t: 40 }, grandparent: { w: 50, t: 40 }, nephew: { w: 40, t: 20 }, aunt: { w: 30, t: 20 }, cousin: { w: 30, t: 20 }, inlaw: { w: 20, t: 10 },
    friend: { w: 40, t: 30 }, employee: { w: 20, t: 20 }, boss: { w: 20, t: 10 }, payer: { w: 10, t: 10 }, landlord: { w: 5, t: 0 }, tenant: { w: 5, t: 0 },
    fellow: { w: 10, t: 10 }, enemy: { w: -60, t: -60 }, other: { w: 0, t: 0 }
  });
  // What A is to B when B is A's <kind> (a relation written on one side makes the tie both ways).
  const TIE_INVERSE = deepFreeze({
    spouse: 'spouse', partner: 'partner', lover: 'lover', child: 'parent', parent: 'child', sibling: 'sibling', grandchild: 'grandparent', grandparent: 'grandchild',
    nephew: 'aunt', aunt: 'nephew', cousin: 'cousin', inlaw: 'inlaw', friend: 'friend', employee: 'boss', boss: 'employee', payer: 'payer', landlord: 'tenant',
    tenant: 'landlord', fellow: 'fellow', enemy: 'enemy', other: 'other'
  });
  /* A relation word to its kind: the word as kinWord gives it for someone
     who goes by they ("wife" and "husband" are "spouse", "aunt" is "parent's
     sibling", "landlady" is "landlord"), then these. */
  const RELATION_KINDS = deepFreeze({
    spouse: 'spouse', 'widowed spouse': 'spouse', partner: 'partner', fiance: 'partner', lover: 'lover', child: 'child', stepchild: 'child', kid: 'child', baby: 'child',
    parent: 'parent', stepparent: 'parent', sibling: 'sibling', stepsibling: 'sibling', grandchild: 'grandchild', grandparent: 'grandparent', granny: 'grandparent',
    granddad: 'grandparent', "sibling's child": 'nephew', "parent's sibling": 'aunt', cousin: 'cousin', 'parent-in-law': 'inlaw', 'sibling-in-law': 'inlaw',
    'child-in-law': 'inlaw', 'in-law': 'inlaw', friend: 'friend', 'best friend': 'friend', boss: 'boss', employer: 'boss', foreman: 'boss', manager: 'boss',
    employee: 'employee', worker: 'employee', hand: 'employee', landlord: 'landlord', tenant: 'tenant', enemy: 'enemy', rival: 'enemy', 'ex-spouse': 'other'
  });
  // The kinds that are family (the household rule, the arrest route).
  const FAMILY_KINDS = Object.freeze(['spouse', 'partner', 'child', 'parent', 'sibling', 'grandchild', 'grandparent', 'nephew', 'aunt', 'cousin', 'inlaw']);
  /* How much of what the player does to B reaches A (design section 4.2):
     the base by what B is to A, times (0.5 + 0.5 x A's liking for B / 100);
     at A's liking for B of rival (-20) or less it is that liking / rivalDiv
     instead (negative: a rival warms when B is hurt), except that the
     police never warm over a crime and clergy never over violence; a teen
     victim's parents and grandparents x teen; saw it x saw, heard it x
     heard (a private word: x private, and only to a spouse or the
     household). Liking and trust carry at the factor (a rival's trust at
     rivalTrust), fear at fear and only for violence; spark and leverage
     never travel. A carried change under drop on every track is nothing,
     from drop to under memory goes into everyday, from memory up it is a
     secondhand memory, one class lighter with floor 0. */
  const FACTORS = deepFreeze({
    kinds: { child: 0.8, grandchild: 0.6, lover: 0.7, spouse: 0.6, partner: 0.6, sibling: 0.5, parent: 0.5, nephew: 0.5, friend: 0.4, cousin: 0.4, aunt: 0.4,
      grandparent: 0.4, inlaw: 0.3, employee: 0.25, boss: 0.2, payer: 0.2, fellow: 0.15, landlord: 0.1, tenant: 0.1, enemy: 0.1, other: 0.1 },
    saw: 1, heard: 0.75, private: 0.5, rival: -20, rivalDiv: 200, teen: 1.25, fear: 0.5, rivalTrust: 0.5, drop: 2, memory: 5
  });
  /* When it reaches them (design section 4.3): a spouse and the household
     (a shared home and a family relation, never the motel or the trailer
     park: notHomes) overnight (the next night tick, or the next morning if
     it is already night); other family, a boss and an employee the next
     morning; friends, lovers, rivals and everyone else at the next place
     they share with the one it happened to, or within meetDays, or the next
     morning when it was town news. Hearsay keeps expires days and the queue
     at most max (the oldest go first). */
  const DELIVERY = deepFreeze({
    overnight: ['spouse'], morning: ['child', 'parent', 'sibling', 'grandchild', 'grandparent', 'nephew', 'aunt', 'cousin', 'inlaw', 'boss', 'employee'],
    meetDays: 2, expires: 4, max: 60, notHomes: ['motel', 'trailerpark'], names: 3
  });
  /* What never travels: the romance rows and the minor rule's, leverage and
     what is held (blackmail, silence, a secret learned, being caught), what
     they did for the player, the card seats, a note and time together; the
     bookkeeper's badmouthing and vouching move ties instead (wave 32). */
  const STAYS = Object.freeze(['flirted', 'rebuffed', 'intimate', 'unwanted_advance', 'threatened_to_tell', 'blackmailed', 'paid_silence', 'told_anyway', 'learned_secret',
    'caught_you_at', 'exposed', 'they_helped', 'they_confided', 'card_win', 'card_loss', 'noted', 'spent_time', 'badmouthed', 'vouched_for']);
  const VIOLENT = Object.freeze(['hit', 'shoved', 'beat_down']);
  // A crime the police never warm over: violence, a theft, a cheat.
  const CRIMES = Object.freeze(['hit', 'shoved', 'beat_down', 'stole_from', 'cheated']);
  // What an arrest does to the family in town toward the officer (design section 4.5).
  const ARREST_TIE = deepFreeze({ w: -20, t: -20 });
  const TIE_LOG = 8;
  const npcIn = (id, ctx) => (ctx.s && Array.isArray(ctx.s.npcs) ? ctx.s.npcs.find(x => isObj(x) && x.id === id) || null : null);
  // In town for the graph: alive, free and living here.
  function inTown(x) { return isObj(x) && x.alive !== false && x.status === 'free' && (x.presence === undefined || x.presence === 'here'); }
  function tieKey(a, b) { return `${a}>${b}`; }
  function tieMap(ctx) { ctx = context(ctx); return ctx.s && isObj(ctx.s.ties) ? ctx.s.ties : {}; }
  function tieOf(a, b, ctx) { const t = tieMap(ctx)[tieKey(a, b)]; return isObj(t) ? t : null; }
  // A tie's liking and trust now: base plus its log, held to -100..100.
  function tieNow(tie) {
    const b = isObj(tie) && isObj(tie.base) ? tie.base : {};
    let w = num(b.w);
    let t = num(b.t);
    for (const e of list(tie && tie.log)) { w += num(e.w); t += num(e.t); }
    return { w: clamp(Math.round(w), -100, 100) || 0, t: clamp(Math.round(t), -100, 100) || 0 };
  }
  // The word a's relations use for b ("b is a's wife"), or null.
  function relationWord(a, b) {
    const r = isObj(a) && isObj(b) ? list(a.relations).find(x => x.npcId === b.id) : null;
    return r ? String(r.relation || '').toLowerCase().trim() : null;
  }
  function kindOfWord(word) {
    const w = String(word || '').toLowerCase().trim();
    if (!w) return null;
    const neutral = String(kinWord(w, 'they') || w).toLowerCase();
    return RELATION_KINDS[neutral] || RELATION_KINDS[w] || (/in-law$/.test(neutral) ? 'inlaw' : null);
  }
  // What b is to a, from the relations written on either side (a's word for b, else the other way round).
  function kindBetween(a, b) {
    const k = kindOfWord(relationWord(a, b));
    if (k) return k;
    const back = kindOfWord(relationWord(b, a));
    return back ? TIE_INVERSE[back] || back : null;
  }
  // A town's content list (ties, secretTies): the save's town copy, else the built-in town's.
  function contentList(key, ctx) {
    ctx = context(ctx);
    if (ctx.town && Array.isArray(ctx.town[key])) return ctx.town[key].filter(isObj);
    return builtIn(ctx) && Array.isArray(TOWN_DATA[key]) ? TOWN_DATA[key].filter(isObj) : [];
  }
  /* Every tie the town gives, for the people in town now (State's
     tiesFill writes the ones a game lacks, never overwriting): the
     relations both ways with their kind's defaults, then content's ties
     (overrides and additions: { from, to, kind?, w, t, hidden?,
     revealedBy?, why? }), then fellow members of a faction. Returns
     { key: tie }. */
  function tiesPlan(ctx) {
    ctx = context(ctx);
    const here = (ctx.s ? list(ctx.s.npcs) : []).filter(inTown);
    const byId = id => here.find(x => x.id === id) || null;
    const out = {};
    const put = (a, b, kind) => {
      const k = tieKey(a, b);
      if (a === b || out[k]) return;
      const d = TIE_KINDS[kind] || TIE_KINDS.other;
      out[k] = { kind: TIE_KINDS[kind] ? kind : 'other', base: { w: d.w, t: d.t }, log: [], hidden: false, known: true };
    };
    for (const a of here) for (const r of list(a.relations)) {
      const b = byId(r.npcId);
      if (!b) continue;
      const kind = kindOfWord(r.relation) || 'other';
      put(a.id, b.id, kind);
      put(b.id, a.id, TIE_INVERSE[kind] || kind);
    }
    for (const c of contentList('ties', ctx)) {
      const a = byId(c.from);
      const b = byId(c.to);
      if (!a || !b || a === b) continue;
      const k = tieKey(a.id, b.id);
      const kind = typeof c.kind === 'string' && TIE_KINDS[c.kind] ? c.kind : out[k] ? out[k].kind : kindBetween(a, b) || 'other';
      const tie = { kind, base: { w: clamp(toInt(c.w) || 0, -100, 100), t: clamp(toInt(c.t) || 0, -100, 100) }, log: [], hidden: c.hidden === true, known: c.hidden !== true };
      if (isObj(c.revealedBy)) tie.revealedBy = deepCopy(c.revealedBy);
      if (typeof c.why === 'string' && c.why.trim()) tie.why = cleanText(c.why, 160);
      out[k] = tie;
    }
    for (const a of here) {
      if (!a.factionId) continue;
      for (const b of here) if (b !== a && b.factionId === a.factionId) put(a.id, b.id, 'fellow');
    }
    return out;
  }
  /* A hidden tie the player has found out (design section 4.1): known
     already, a revealedBy rumour heard or flag set, or a leverage record
     the player holds over either of them whose words name the other. */
  function tieRevealed(tie, a, b, ctx) {
    ctx = context(ctx);
    if (!isObj(tie) || tie.hidden !== true || tie.known === true) return true;
    const s = ctx.s;
    if (!s) return false;
    const by = isObj(tie.revealedBy) ? tie.revealedBy : {};
    if (list(s.rumours).some(r => r.heard === true && Array.isArray(by.rumours) && by.rumours.includes(r.id))) return true;
    if (Array.isArray(by.flags) && isObj(s.flags) && by.flags.some(f => s.flags[f] !== undefined && s.flags[f] !== null && s.flags[f] !== false)) return true;
    const x = npcIn(a, ctx);
    const y = npcIn(b, ctx);
    const names = p => (isObj(p) ? [p.name].concat(String(p.name || '').split(/\s+/).slice(0, 1)).filter(w => w && w.length >= 3) : []);
    const says = (text, p) => names(p).some(nm => new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(String(text || '')));
    return list(s.leverage).some(r => r.holder === 'player' && ((r.over === a && says(r.text, y)) || (r.over === b && says(r.text, x))));
  }
  // A tie between two people that the town does not know (either way, still hidden).
  function hiddenBetween(a, b, ctx) {
    for (const [x, y] of [[a, b], [b, a]]) { const t = tieOf(x, y, ctx); if (t && t.hidden === true && !tieRevealed(t, x, y, ctx)) return true; }
    return false;
  }
  /* A household (the integration plan's 11.3): one home, not the motel or
     the trailer park, and a family relation between them (either side's
     word). The rumour pool's household() is wider on purpose. */
  function household(a, b, ctx) {
    ctx = context(ctx);
    if (!isObj(a) || !isObj(b) || a.id === b.id) return false;
    const h = homeId(a);
    if (!h || h !== homeId(b)) return false;
    const l = ctx.s ? list(ctx.s.locations).find(x => x.id === h) : null;
    if (l && DELIVERY.notHomes.includes(l.type)) return false;
    return [relationWord(a, b), relationWord(b, a)].some(w => !!w && (familyWord(w) || familyWord(String(kinWord(w, 'they') || '').toLowerCase())));
  }
  // How news of b reaches a: 'overnight' (a spouse, the household), 'morning' (other family, work) or 'meet'.
  function deliveryOf(a, b, tie, ctx) {
    if (!isObj(tie)) return 'meet';
    if (DELIVERY.overnight.includes(tie.kind) || household(a, b, ctx)) return 'overnight';
    return DELIVERY.morning.includes(tie.kind) ? 'morning' : 'meet';
  }
  const isClergy = x => isObj(x) && ((Array.isArray(x.tags) && x.tags.some(t => t === 'priest' || t === 'pastor')) || /\b(priest|pastor|preacher|reverend|minister)\b/i.test(String(x.role || '')));
  /* What of an event done to b reaches a, before saw or heard: { factor,
     rival, tie } or null (no tie, or a role that does not warm over it). */
  function tieFactor(a, b, event, ctx) {
    const tie = isObj(a) && isObj(b) ? tieOf(a.id, b.id, ctx) : null;
    if (!tie) return null;
    const now = tieNow(tie);
    if (now.w <= FACTORS.rival) {
      // The role limits (the integration plan's 9.4): the police never warm over a crime, clergy never over violence.
      if ((isPoliceNpc(a) && CRIMES.includes(event)) || (isClergy(a) && VIOLENT.includes(event))) return null;
      return { factor: now.w / FACTORS.rivalDiv, rival: true, tie };
    }
    let f = num(FACTORS.kinds[tie.kind] !== undefined ? FACTORS.kinds[tie.kind] : FACTORS.kinds.other) * (0.5 + 0.5 * now.w / 100);
    if ((tie.kind === 'child' || tie.kind === 'grandchild') && isMinor(b, ctx)) f *= FACTORS.teen;
    return { factor: f, rival: false, tie };
  }
  // What carries at a factor: liking and trust at it (a rival's trust at half), fear at half and only for violence (never a rival's).
  function carried(d, factor, event, rival) {
    const x = isObj(d) ? d : {};
    return {
      w: rnd(num(x.w) * factor),
      t: rnd(num(x.t) * factor * (rival ? FACTORS.rivalTrust : 1)),
      f: VIOLENT.includes(event) && !rival && factor > 0 && num(x.f) > 0 ? rnd(num(x.f) * factor * FACTORS.fear) : 0
    };
  }
  const size3 = c => Math.max(Math.abs(num(c.w)), Math.abs(num(c.t)), Math.abs(num(c.f)));
  // An event that travels the graph: not one of STAYS, not already secondhand (no hop 2).
  function spreads(ev) { return isObj(ev) && !!EVENTS[ev.event] && !STAYS.includes(ev.event) && !ev.secondhand; }
  /* When an entry is due: the next night tick (overnight; at night already,
     the next morning), the next morning (morning, or town news), or, for
     meet, the morning meetDays on unless they share a place first. */
  function dueOf(via, day, phase) {
    if (via === 'overnight') return phase === 'night' ? { dueDay: day + 1, duePhase: PHASES[0] } : { dueDay: day, duePhase: 'night' };
    if (via === 'morning') return { dueDay: day + 1, duePhase: PHASES[0] };
    return { dueDay: day + DELIVERY.meetDays, duePhase: PHASES[0] };
  }
  /* What the player did, in the past tense, for a secondhand line and the
     card's act ("Cooler since you shamed Royce Pittman at the counter"):
     {player}, {victim}, {place}. */
  const DID_TEXT = deepFreeze({
    hit: '{player} hit {victim} at {place}', shoved: '{player} shoved {victim} at {place}', beat_down: '{player} put {victim} down at {place}', threatened: '{player} leaned on {victim} at {place}',
    stole_from: '{player} stole from {victim}', cheated: '{player} cheated {victim} at cards', insulted: '{player} ran {victim} down at {place}', humiliated: '{player} shamed {victim} at {place}',
    pried: '{player} pried into what {victim} keeps to themselves', complimented: '{player} said something kind to {victim}', gift: '{player} gave {victim} something', bribed: '{player} paid {victim} to look away',
    paid_back: '{player} paid {victim} what they owed', kept_word: '{player} kept their word to {victim}', broke_word: '{player} broke their word to {victim}', rescued: '{player} helped {victim} out of a bad spot',
    lied_caught: '{player} was caught lying to {victim}', came_clean: '{player} owned up to {victim}', confided: '{player} confided in {victim}', betrayed_confidence: '{player} told what {victim} said in confidence',
    did_favour: '{player} did {victim} a favour', defended: '{player} stood up for {victim} at {place}', informed_on: '{player} informed on {victim}', crossed: '{player} crossed {victim}',
    apologised: '{player} apologised to {victim}', badmouthed: '{player} ran {victim} down', vouched_for: '{player} vouched for {victim}'
  });
  /* One event the player did to someone (src), as it reaches the people
     tied to them (the integration plan's 2.4: State's socialEvent calls it
     with the event as it landed). ev: { event, private?, present (ids here
     who saw it), news (it made town news or was done in front of two),
     weight, key (the source memory's), fight?, place (an id), placeName,
     victim, player, phase, half? (it happened to someone away: only the
     people here hear it, at FACTORS.private) }, d: what it did to src
     ({ w, t, f }). Returns
     { now: [items for the people here: saw it], later: [hearsay entries
     without id or turn] }, each { npcId, aboutId, event, factor, d (what
     carries), how ('saw' | 'heard'), via?, dueDay?, duePhase?, expires?,
     hidden, kind, owed?, text, act, weight, decay, src, fight?, place,
     placeName, day }. No Rng. */
  function propagate(s, srcId, ev, d, ctx) {
    ctx = context(Object.assign({}, isObj(ctx) ? ctx : {}, s !== undefined ? { s } : {}));
    const out = { now: [], later: [] };
    const b = npcIn(srcId, ctx);
    if (!b || !spreads(ev) || !isObj(d)) return out;
    const present = Array.isArray(ev.present) ? ev.present : [];
    const priv = ev.private === true;
    const phase = typeof ev.phase === 'string' ? ev.phase : ctx.s && isObj(ctx.s.time) ? ctx.s.time.phase : PHASES[0];
    const vars = { player: ev.player || 'the stranger', victim: ev.victim || b.name, place: ev.placeName || 'town' };
    const act = cleanText(fillTemplate(DID_TEXT[ev.event] || '{player} did something to {victim}', vars), 200);
    const ties = tieMap(ctx);
    for (const k of Object.keys(ties)) {
      if (!k.endsWith(`>${b.id}`)) continue;
      const a = npcIn(k.slice(0, k.length - b.id.length - 1), ctx);
      if (!a || a.id === b.id || !inTown(a)) continue;
      const tie = ties[k];
      const hh = household(a, b, ctx);
      if (priv && !(tie.kind === 'spouse' || hh)) continue;
      const saw = present.includes(a.id);
      // ev.half: what happened to someone away (a call, talk behind their back): only the people here hear it, and the words at half.
      if (ev.half === true && !saw) continue;
      const fx = tieFactor(a, b, ev.event, ctx);
      if (!fx) continue;
      const factor = fx.factor * (priv || ev.half === true ? FACTORS.private : saw ? FACTORS.saw : FACTORS.heard);
      const c = carried(d, factor, ev.event, fx.rival);
      // A fight's heavier blow travels even when it adds little (a beat-down after two hits): it renames the copy of the fight they hold.
      if (size3(c) < FACTORS.drop && !(typeof ev.fight === 'string' && FIGHT_RANK[ev.event] > 1)) continue;
      const hidden = !saw && tie.hidden === true && !tieRevealed(tie, a.id, b.id, ctx);
      const owed = (ev.event === 'rescued' || ev.event === 'defended') && factor > 0 && (tie.kind === 'child' || tie.kind === 'spouse') ? 1 : 0;
      const tpl = saw ? (SECONDHAND_TEXT.seen[ev.event] || `saw ${DID_TEXT[ev.event] || '{player} with {victim} at {place}'}`) : (SECONDHAND_TEXT.heard[ev.event] || `heard ${DID_TEXT[ev.event] || '{player} did something to {victim}'}`);
      const item = {
        npcId: a.id, aboutId: b.id, event: ev.event, factor: two(factor), d: c, how: saw ? 'saw' : 'heard', hidden, kind: tie.kind, rival: fx.rival,
        text: cleanText(fillTemplate(tpl, vars), 200), act, weight: clamp((toInt(ev.weight) || 1) - 1, 1, 3), decay: EVENTS[ev.event].decay,
        src: typeof ev.key === 'string' ? ev.key : null, place: typeof ev.place === 'string' ? ev.place : null, placeName: vars.place, day: ctx.day
      };
      if (typeof ev.fight === 'string') item.fight = ev.fight;
      if (owed) item.owed = 1;
      if (saw) { out.now.push(item); continue; }
      const via = deliveryOf(a, b, tie, ctx);
      const v = via === 'meet' && ev.news === true ? 'morning' : via;
      Object.assign(item, { via: v }, dueOf(v, ctx.day, phase), { expires: ctx.day + DELIVERY.expires });
      out.later.push(item);
    }
    return out;
  }
  /* A settlement on src's memory (key) as the people holding a copy of it
     take it (design section 5.3: the same factor, when the news of the
     settling reaches them). Returns [{ npcId, aboutId, src, settle: { by,
     w, t, f }, how, via?, dueDay?, duePhase?, expires? }]. */
  function settleSpread(s, srcId, key, entry, present, ctx) {
    ctx = context(Object.assign({}, isObj(ctx) ? ctx : {}, s !== undefined ? { s } : {}));
    const out = [];
    const b = npcIn(srcId, ctx);
    if (!b || typeof key !== 'string' || !isObj(entry)) return out;
    const phase = ctx.s && isObj(ctx.s.time) ? ctx.s.time.phase : PHASES[0];
    const pending = id => list(ctx.s && ctx.s.hearsay).some(h => h.npcId === id && h.src === key && !h.deliveredTurn && !h.settle);
    for (const a of list(ctx.s && ctx.s.npcs)) {
      if (!inTown(a) || a.id === b.id) continue;
      const holds = list(a.memories).some(m => copyOf(m, key));
      if (!holds && !pending(a.id)) continue;
      const settle = { by: entry.by, w: num(entry.w), t: num(entry.t), f: num(entry.f) };
      const item = { npcId: a.id, aboutId: b.id, src: key, settle, event: entry.by, how: present.includes(a.id) ? 'saw' : 'heard', day: ctx.day };
      if (item.how === 'heard') {
        const via = deliveryOf(a, b, tieOf(a.id, b.id, ctx), ctx);
        Object.assign(item, { via }, dueOf(via, ctx.day, phase), { expires: ctx.day + DELIVERY.expires });
      }
      out.push(item);
    }
    return out;
  }
  // A memory that carries src's memory key as its source (a secondhand copy, or a witness copy the tie added to).
  function copyOf(m, key) { return isObj(m) && isObj(m.d) && ((isObj(m.secondhand) && m.secondhand.src === key) || (isObj(m.tie) && m.tie.src === key)); }
  /* What reaches one person (State writes it: at once for the people who
     saw it, in World's step i for the rest): item as propagate or
     settleSpread gives it; ctx.graph: what the graph already moved them
     this turn ({ w, t }, held to CAPS.graph); ctx.scene: the scene a witness
     copy of it was made in (the tie's share joins that copy). A settlement
     settles their copy. Else what carries, under FACTORS.drop on every
     track after the turn's bound, is nothing; into a copy of the same
     source (or fight, or the scene's witness copy) it adds; under
     FACTORS.memory it goes into everyday; else it is a secondhand memory
     (one class lighter, floor 0; hidden: the town does not know the tie,
     with the act's words for the card). Returns { rel, memories, d,
     memory, merged, kind ('memory', 'everyday', 'settled', 'none'), used }. */
  function carry(n, item, ctx0) {
    const ctx = Object.assign(context(ctx0), { graph: isObj(ctx0) && isObj(ctx0.graph) ? ctx0.graph : null, scene: isObj(ctx0) && typeof ctx0.scene === 'string' ? ctx0.scene : null });
    const rel = copyRel(repair(n, townRecord(n.id, ctx)));
    const mems = deepCopy(list(n.memories));
    const used = Object.assign({ w: 0, t: 0 }, isObj(ctx.graph) ? ctx.graph : {});
    const none = { rel, memories: mems, d: { w: 0, t: 0, f: 0 }, memory: null, merged: false, kind: 'none', used };
    if (!isObj(item)) return none;
    if (isObj(item.settle)) {
      const m = mems.find(x => copyOf(x, item.src));
      if (!m || settlements(m).filter(e => e.by !== 'got_even').length >= CAPS.settlements) return none;
      m.settled = list(m.settled).concat([{ turn: ctx.turn, day: ctx.day, by: item.settle.by, w: two(clamp(num(item.settle.w), 0, 1)), t: two(clamp(num(item.settle.t), 0, 1)), f: two(clamp(num(item.settle.f), 0, 1)) }]);
      return Object.assign(none, { memory: m, kind: 'settled' });
    }
    const d = { w: num(item.d && item.d.w), t: num(item.d && item.d.t), f: num(item.d && item.d.f) };
    for (const x of ['w', 't']) { const cap = CAPS.graph[x]; const v = clamp(used[x] + d[x], -cap, cap) - used[x]; d[x] = v; used[x] += v; }
    const ax = axesOf(n, ctx);
    if (ax.hard && d.f > 0) d.f = Math.min(d.f, Math.max(0, CAPS.hardFear - cacheOf(n, ctx).f));
    const tieSrc = { src: item.src || null, via: item.aboutId };
    let at = item.how === 'saw' && typeof ctx.scene === 'string' ? mems.findIndex(m => isObj(m) && m.witness === true && m.scene === ctx.scene && m.about === item.aboutId && isObj(m.d)) : -1;
    if (at < 0) at = mems.findIndex(m => isObj(m) && isObj(m.d) && (m.secondhand || m.tie) && ((item.src && copyOf(m, item.src)) || (item.fight && m.fight === item.fight && m.about === item.aboutId)));
    // Under FACTORS.drop on every track it is nothing, unless it is a fight's heavier blow for a copy of the fight they hold (it names it).
    const renames = at >= 0 && item.fight && mems[at].fight === item.fight && (FIGHT_RANK[item.event] || 0) > (FIGHT_RANK[mems[at].event] || 0);
    if (size3(d) < FACTORS.drop && !renames) return Object.assign(none, { used });
    if (at >= 0) {
      const m = mems[at];
      m.d = { w: two(num(m.d.w) + d.w), t: two(num(m.d.t) + d.t), f: two(num(m.d.f) + d.f), k: num(m.d.k), s: num(m.d.s) };
      m.n = (num(m.n) || 1) + 1;
      m.turn = ctx.turn;
      if (m.witness) m.tie = tieSrc;
      else if (isObj(m.secondhand) && item.src) m.secondhand.src = item.src;
      // The heavier blow names the copy (a beat-down after a hit).
      if (EVENTS[item.event] && EVENTS[m.event] && (FIGHT_RANK[item.event] || 0) > (FIGHT_RANK[m.event] || 0) && !m.witness) { m.event = item.event; m.decay = EVENTS[item.event].decay; m.text = item.text; if (isObj(m.secondhand) && item.act) m.secondhand.act = item.act; }
      return { rel, memories: mems, d, memory: m, merged: true, kind: 'memory', used };
    }
    if (size3(d) < FACTORS.memory) {
      putEverydayHeld(rel, 'w', d.w);
      putEverydayHeld(rel, 't', d.t);
      return { rel, memories: mems, d: { w: d.w, t: d.t, f: 0 }, memory: null, merged: false, kind: 'everyday', used };
    }
    // It fades from the day they heard it; the act's own day is kept for the reason the card gives (secondhand.day).
    const sh = Object.assign({ src: item.src || null, via: item.aboutId }, Number.isInteger(item.day) ? { day: item.day } : {}, item.hidden === true ? { hidden: true, act: item.act || null } : {});
    const memory = { turn: ctx.turn, day: ctx.day, text: cleanText(item.text, 200), weight: clamp(toInt(item.weight) || 1, 1, 3), event: item.event,
      d: { w: d.w, t: d.t, f: d.f, k: 0, s: 0 }, decay: DECAY[item.decay] ? item.decay : (EVENTS[item.event] || {}).decay || 'slight', key: `m${ctx.turn}-${n.id}-h`, n: 1, secondhand: sh, about: item.aboutId };
    if (item.place) memory.place = item.place;
    if (item.fight) memory.fight = item.fight;
    if (item.how === 'saw' && typeof ctx.scene === 'string') memory.scene = ctx.scene;
    const kept = mems.filter(x => x.weight > 1 || ctx.turn - x.turn <= CAPS.staleTurns);
    kept.push(memory);
    while (kept.length > CAPS.memories) kept.splice(evictIndex(kept), 1);
    const evicted = mems.filter(x => !kept.includes(x) && isObj(x.d));
    let outRel = rel;
    if (evicted.length) outRel = landTo(Object.assign({}, n, { rel, memories: kept }), pinOf(recompute(Object.assign({}, n, { rel, memories: kept.concat(evicted) }), ctx.day, ctx), eligible(n, ctx)), 'everyday', ctx);
    return { rel: outRel, memories: kept, d, memory, merged: false, kind: 'memory', used };
  }
  // A hearsay entry due by now (at: { day, phase }): its day passed, or reached in its phase.
  function hearsayDue(h, at) {
    if (!isObj(h) || !isObj(at) || !Number.isInteger(h.dueDay)) return false;
    return h.dueDay < at.day || (h.dueDay === at.day && PHASES.indexOf(at.phase) >= Math.max(0, PHASES.indexOf(h.duePhase)));
  }
  /* A place said short, for the feed's one line: a possessive name to its
     owner's ("Pittman's"), else the first thing the town calls it ("the
     landing", "the motel"), else its name ("the Low Water"). */
  function placeShort(l) {
    if (!isObj(l)) return 'town';
    const name = String(l.name || '');
    const own = /^([A-Z][A-Za-z]*'s)\s/.exec(name);
    if (own) return own[1];
    const aka = Array.isArray(l.aka) ? l.aka.find(x => typeof x === 'string' && x.trim()) : null;
    return aka ? aka.trim() : name.replace(/^The /, 'the ') || 'town';
  }
  /* The one line word getting round makes ("Word got round: Lorna, Colt
     and Wade Purvis have heard about the landing."): up to DELIVERY.names
     names, then "and others"; one family name said once when all share it.
     abouts: what they heard about ("about the landing", "what you told
     Dewayne"); others: how many more heard than are named (people the
     player does not know). */
  function hearsayLine(names, abouts, others) {
    const ns = (Array.isArray(names) ? names : []).map(x => String(x || '')).filter((x, i, a) => x && a.indexOf(x) === i);
    if (!ns.length) return '';
    const shown = ns.slice(0, DELIVERY.names);
    const last = shown.map(x => x.split(/\s+/)).map(w => (w.length > 1 ? w[w.length - 1] : null));
    const one = shown.length > 1 && last.every(x => x && x === last[0]);
    const words = one ? shown.map((x, i) => (i === shown.length - 1 ? x : x.split(/\s+/).slice(0, -1).join(' '))) : shown;
    const more = ns.length > shown.length || (Number.isInteger(others) && others > 0);
    const who = more ? `${words.join(', ')} and others` : andList(words);
    const ab = (Array.isArray(abouts) ? abouts : [abouts]).filter((x, i, a) => typeof x === 'string' && x && a.indexOf(x) === i);
    return `Word got round: ${who} ${ns.length === 1 && !more ? 'has' : 'have'} heard ${ab.length ? andList(ab) : 'about it'}.`;
  }
  /* The arrest route (design section 4.5): when someone in town is
     arrested by an officer, each of their family in town (a family relation
     either way) turns against that officer. Returns [{ from, to }]. */
  function arrestTies(arrested, officerId, ctx) {
    ctx = context(ctx);
    if (!isObj(arrested) || typeof officerId !== 'string' || officerId === arrested.id) return [];
    const out = [];
    for (const k of kinOf(arrested, ctx)) {
      const x = npcIn(k.id, ctx);
      if (!x || x.id === officerId || !inTown(x) || out.some(y => y.from === x.id)) continue;
      const kind = k.back ? TIE_INVERSE[kindOfWord(k.word)] || kindOfWord(k.word) : kindOfWord(k.word);
      if (familyWord(k.word) || FAMILY_KINDS.includes(kind)) out.push({ from: x.id, to: officerId });
    }
    return out;
  }
  // Debug's lines: "npc_mavis>npc_dewayne spouse w 30 t 20 (hidden, known)" and "npc_mavis hears hit from npc_dewayne by morning x0.29".
  function debugTie(key, tie, ctx) {
    if (!isObj(tie)) return '';
    const now = tieNow(tie);
    const [a, b] = String(key).split('>');
    const known = tie.hidden === true ? (tieRevealed(tie, a, b, ctx) ? ' (hidden, now known)' : ' (hidden)') : '';
    const log = list(tie.log).map(e => `${e.w >= 0 ? '+' : ''}${e.w}/${e.t >= 0 ? '+' : ''}${e.t} day ${e.day}${e.why ? ` ${e.why}` : ''}`).join(', ');
    return `${key} ${tie.kind} w ${now.w} t ${now.t}${known}${log ? ` · ${log}` : ''}`;
  }
  function debugHearsay(h) {
    if (!isObj(h)) return '';
    const by = h.via === 'overnight' ? 'overnight' : h.via === 'morning' ? 'by morning' : 'when they meet';
    const what = isObj(h.settle) ? `${h.settle.by} (settling ${h.src || '?'})` : h.event;
    return `${h.npcId} hears ${what} from ${h.aboutId} ${by} x${h.factor !== undefined ? h.factor : 1}${h.hidden ? ' (hidden)' : ''} · due day ${h.dueDay} ${h.duePhase}${h.deliveredTurn ? ` · heard turn ${h.deliveredTurn}` : ''}`;
  }

  // ----- wave 32 (B2): ties that change -----
  /* A word against someone (badmouthed) or for them (vouched_for), on a
     persuade aimed at the listener that worked (design section 4.5): the
     listener's liking for them moves by this, times clamp((their trust in
     the player + 50) / 100, 0, 1), once a pair a day and at most total in
     all a tie from the player's words; badmouthing someone to a listener
     who likes them at likedAt or more costs the player cost of the
     listener's liking instead. */
  const WORDS_TIE = deepFreeze({ badmouthed: -10, vouched_for: 8, total: 20, cost: -5, likedAt: 40 });
  // The messenger (design section 4.5): what they would rather not know about someone they like at likedAt or more costs liking w, not the trust +8.
  const MESSENGER = deepFreeze({ likedAt: 60, w: -8 });
  // The town's secretTies for Y's secret told to X ([{ secretOf, learnedBy, ties: [{ from, to, w?, t? }], why, seed? }]: the save's town copy, else the built-in town's).
  function secretTiesFor(yId, xId, ctx) {
    return contentList('secretTies', ctx).filter(e => e.secretOf === yId && (Array.isArray(e.learnedBy) ? e.learnedBy.includes(xId) : e.learnedBy === xId) && Array.isArray(e.ties));
  }
  /* A word for or against Y said to X (wireEvent's plan; t: the turn): {
     cost, why } badmouthing Y to someone who likes them well; { w } the tie's
     change on a persuade aimed at X that worked; { why } nothing more (not
     today again, or the 20 used). null: no roll that worked. */
  function wordsTie(x, yId, event, t, ctx) {
    ctx = context(ctx);
    const tie = tieOf(x.id, yId, ctx);
    const now = tie ? tieNow(tie) : { w: 0, t: 0 };
    if (event === 'badmouthed' && now.w >= WORDS_TIE.likedAt) return { cost: WORDS_TIE.cost, why: 'they like them too well to hear it' };
    const o = isObj(t) ? t : {};
    const aimed = (Array.isArray(o.targets) && o.targets.includes(x.id)) || o.speechTo === x.id;
    if (!(o.rollSuccess === true && o.actionType === 'persuade' && aimed)) return null;
    const said = list(tie && tie.log).filter(e => e.words === true);
    if (said.some(e => e.day === ctx.day)) return { why: 'once a day about the same person' };
    const used = said.reduce((sum, e) => sum + num(e.w), 0);
    const scale = clamp((tracksOf(x, ctx).t + 50) / 100, 0, 1);
    const w = clamp(used + rnd(WORDS_TIE[event] * scale), -WORDS_TIE.total, WORDS_TIE.total) - used;
    return w ? { w } : { why: 'the player\'s words about them have moved them as far as words will' };
  }
  // A tie the town knows (not hidden, or found out), both ways.
  function knownBetween(a, b, ctx) { return !hiddenBetween(a, b, ctx); }
  /* What the narrator is told about two people here (the integration
     plan's 10.1): for at most two pairs of the present whose tie changed in
     front of the player (a log line seen), the town knowing the tie both
     ways, the newest first: "Dewayne Mangum and Mavis Mangum, strained
     since the garage money (Day 5)" (strained when what changed took from
     it, closer when it added). Never a hidden tie. */
  function betweenThem(ids, ctx) {
    ctx = context(ctx);
    const out = [];
    const done = new Set();
    const ps = (Array.isArray(ids) ? ids : []).filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i);
    for (const a of ps) for (const b of ps) {
      if (a === b || done.has(`${b}>${a}`)) continue;
      done.add(`${a}>${b}`);
      if (!knownBetween(a, b, ctx)) continue;
      const logs = [[a, b], [b, a]].flatMap(([x, y]) => { const t = tieOf(x, y, ctx); return list(t && t.log).filter(e => e.seen === true).map(e => Object.assign({ from: x, to: y }, e)); });
      if (!logs.length) continue;
      const last = logs.slice().sort((p, q) => (num(q.turn) - num(p.turn)) || (num(q.day) - num(p.day)))[0];
      const x = npcIn(last.from, ctx);
      const y = npcIn(last.to, ctx);
      if (!x || !y) continue;
      const sum = logs.reduce((acc, e) => acc + num(e.w) + num(e.t), 0);
      out.push({ turn: num(last.turn), text: `${x.name} and ${y.name}, ${sum < 0 ? 'strained' : 'closer'} since ${last.why || 'what happened'} (Day ${last.day})` });
    }
    return out.sort((p, q) => q.turn - p.turn).slice(0, 2).map(e => e.text);
  }
  /* The card's word on a tie (design section 4.5: "wife Mavis Mangum,
     strained since Day 5"): n's tie to otherId, known to the town both
     ways, changed in front of the player. '' otherwise. */
  function tieWords(n, otherId, ctx) {
    ctx = context(ctx);
    if (!isObj(n) || typeof otherId !== 'string' || !knownBetween(n.id, otherId, ctx)) return '';
    const t = tieOf(n.id, otherId, ctx);
    const seen = list(t && t.log).filter(e => e.seen === true);
    if (!seen.length) return '';
    const sum = seen.reduce((acc, e) => acc + num(e.w) + num(e.t), 0);
    const last = seen[seen.length - 1];
    return sum ? `${sum < 0 ? 'strained' : 'closer'} since Day ${last.day}` : '';
  }

  // ----- dice and debug -----
  // FNV-1a over a string: the key of a sub-stream.
  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  /* A dice stream of its own for one kind of relationship draw (a report,
     a price, a backed ask; wave 27 on), keyed by the game's seed, the kind,
     the person and the day, as the card code keys its decks: it depends on
     no call order, so the shared stream (the dice, the clocks) never
     shifts. Nothing draws from it yet. */
  function rng(kind, npcId, day, n) {
    const s = State.current;
    const seed = s && isObj(s.meta) ? s.meta.seed >>> 0 : 0;
    return Rng.create(fnv1a32(`${seed}|${kind}|${npcId}|${day}|${n | 0}`) || 1);
  }
  // Debug's person line, the seven (wave 35): "w 5 t -5 f 0 k 0 s 0 m 0 owed 0 · sizing you up · uneasy around you".
  function debugLine(n, ctx) {
    if (!isObj(n)) return '';
    const c = tracksOf(n, ctx);
    const st = stance(n, ctx);
    return `w ${c.w} t ${c.t} f ${c.f} k ${c.k} s ${c.s} m ${c.m} owed ${c.owed} · ${st.phrase}${st.tags.length ? ' · ' + st.tags[0] : ''}`;
  }
  // One memory as Debug shows it: its event, what it did, its class and settlements.
  function debugMemory(m) {
    if (!isObj(m)) return '';
    const ev = typeMemory(m);
    if (!isObj(m.d)) return `${ev} (moves nothing)`;
    return `${ev} w ${m.d.w} t ${m.d.t} f ${m.d.f} k ${m.d.k}${m.d.s ? ' s ' + m.d.s : ''}${m.d.m ? ' m ' + m.d.m : ''} · ${classOf(m)}${m.witness || m.secondhand ? ' (lighter)' : ''}${settlements(m).length ? ` · settled ${settlements(m).length}` : ''}${m.n > 1 ? ` · x${m.n}` : ''}`;
  }

  return {
    TRACKS, ROMANTIC, ROMANCE_CLOCK, TRACK_NAMES, RANGE, EVENTS, EVENT_NAMES, WIRE_EVENTS, ALIASES, DEDUPE, TRAIT_AXES, FLAVOUR_TRAITS, AXIS_EFFECTS, MERCENARY, DECAY, LIGHTER, FEAR_CLOCK,
    CAPS, SETTLE, BANDS, STANCE_GRID, PHRASES, SIDES, OVERRIDES, TAGS, SPARK_STATUS, CUES, CONTEMPT_EVENTS, WITNESS, SECONDHAND_TEXT, LEVERAGE_WEIGHT, GATES,
    UNWANTED_ADVANCE, WORDS,
    tracksOf, startOf, fill, repair, axesOf, isFactionHead, isMinor, playerMinor, eligible, romanceOf, recompute, raw, remainder, fade, band, landTo, pinOf,
    applyEvent, settle, settleTarget, sparkGuard, driftStep, owedTo, owedNet, stance, sparkStatus, cue, reasons, words, typeMemory, kindOf, memoryDay, eventName, rng, fnv1a32,
    debugLine, debugMemory,
    // Wave 27.
    FIGHT_RANK, FIGHT_RAISE, evictIndex, witnessEvent, grudgeFit, policeHead, protectorOf, isPoliceNpc, reportWhy, rollMod, complies, rescues, wontSell, factOf, harmful, settlements,
    // Wave 28.
    ABOUT_EVENTS, WORDS_EVENTS, ROMANCE_EVENTS, MINOR_RULE, THREAT_PHRASES, ASKS, difficultyFloor, lieWord, secretOpen, meets, guardiansOf, policeFallback, reportTo,
    minorAge, minorLine, playerMinorLine, romanceTurn, wireEvent, handles, wardWord, guardianWord,
    // Wave 29.
    SPARK_LOST, LEV_LIVE, LEV_STATUSES, LEV_NEXT, LEV_ABOUT, INTIMATE_ASK, NIGHT_PLACES, WHEN_TOLD, authored, romanceEntry, welcomeOf, intimateGate, earnedDistrust, statusFor, statusLine,
    priceIn, contentWords, overlap, keysOf, keysIn, secretWeightOf, mattersToOf, whenToldOf, canRaise, leverageOf, holdsOver, heldOverPlayer, policeBarred, standoff, references,
    backedRecord, backedRoll, leverageAnswer, leverageLines, demands, jealousyOf, kinOf,
    // Wave 30.
    ROMANCE_TEXT, below, cueParts, cueText, playerLow,
    // Wave 31: the town is a graph.
    TIE_KINDS, TIE_INVERSE, RELATION_KINDS, FAMILY_KINDS, FACTORS, DELIVERY, STAYS, VIOLENT, CRIMES, ARREST_TIE, TIE_LOG, DID_TEXT,
    inTown, tieKey, tieOf, tieNow, kindOfWord, kindBetween, contentList, tiesPlan, tieRevealed, hiddenBetween, household, deliveryOf, tieFactor, carried, spreads, dueOf,
    propagate, settleSpread, copyOf, carry, hearsayDue, placeShort, hearsayLine, arrestTies, debugTie, debugHearsay,
    // Wave 32: ties that change.
    WORDS_TIE, MESSENGER, secretTiesFor, wordsTie, betweenThem, tieWords,
    // Wave 34: anyone can be won over, some the hard way.
    ROMANCE_DEFAULTS, ROMANCE_EASE, tuningOf, sparkRate, romanceRate, flirtDifficulty, flirtAnswer, flirtWords, flirtEventOf, romanceRolled
  };
})();

