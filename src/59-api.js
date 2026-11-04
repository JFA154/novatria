// ===== Module: Api =====
/* One interface over two providers (Settings.mockMode picks one):
     parse(packet)            -> parse_action object; packet from Pipeline.parsePacket()
     narrate(packet, onDelta) -> { text, stopReason }; onDelta(chunk, textSoFar) while
                                 streaming; packet = { text, system, town, cast, context }
                                 (system: the style block; town: Pipeline.townBlock();
                                 cast: Pipeline.castBlock(); three cached system blocks)
     bookkeep(packet)         -> record_changes object (applied with source 'model');
                                 packet = { text, context }
     chronicle(entries)       -> summary string (entries are log entries)
     rewriteMemories(packet)  -> { people: [{ npcId, memories: [{ from, text, weight }] }] };
                                 packet from Upgrade.memoryPacket() (an older game's
                                 memories brought up to the current rules; parser model)
     revealPlaces(packet)     -> { placesRevealed: [{ name, type, description, nearId,
                                 ownerNpcId, kind, turn }] }; packet from
                                 Upgrade.placesPacket() (places people named in an older
                                 game's story; parser model)
     checkClock(packet)       -> { behind, phase, dayOffset, reason }; packet from
                                 Upgrade.clockPacket() (whether an older game's clock ran
                                 ahead of its story; parser model)
     fixPeople(packet)        -> { people: [{ npcId, name, pronouns, role, look, voice,
                                 relationToNpcId, relation, homeLocationId }] }; packet from
                                 Upgrade.peoplePacket() (people the game made up, checked
                                 against what the story says about them; parser model)
   Any of them may instead resolve to a refusal { refused: true, role,
   category, explanation }, which the Pipeline turns into an in-feed notice.
   Failures throw ApiError with a player-facing message (err.detail holds the
   API's own words, shown in the debug view).
   Providers return { result, usage: <raw API usage>, model, refusal? };
   call() adds the usage to the turn and session totals.
   The real provider follows docs/API_NOTES.md exactly: structured outputs
   for JSON (never tools or tool_choice), SSE streaming for the narrator, no
   temperature/top_p/top_k/thinking.
   Transport (docs/notes/transport.md): every request runs under an
   AbortController with an idle timeout (TIMEOUTS: 45 s with no byte on a
   stream, reset by every byte; 120 s for a JSON call), and abort() (the
   Stop button, via Pipeline.abort) cancels whatever is in flight. A
   transient failure is tried once more: HTTP 429/500/502/503/504/529, a
   network error, a timeout, a stream that ends before message_stop or
   carries an overloaded_error/api_error event, a body that is not JSON;
   the wait is the retry-after header (at most 60 s since wave 41) or 1.5 s. A reply cut
   off by max_tokens is asked for once more with twice the limit, then
   fails: a truncated reply is never returned as finished. The narrator's
   max_tokens follows its effort (low 2000, medium 3000, high 6000). The
   narrator's three system blocks are cached for an hour (ttl 1h), so a
   cache write is priced at 2x input; prewarm() writes the cache in
   parallel with the parser when the last narration was over 50 minutes
   ago. Usage from every attempt is counted, a retried one too.
   Wave 41: retry-after is honoured up to 60 s and counted down in the
   status line (onWait; Stop ends the wait); an overloaded API (529, 503, a
   mid-stream overloaded_error) gets two retries with a little jitter,
   everything else one. A 404 that names the model asks GET /v1/models for
   a current one of the same family and names it. A model with no price is
   said to be uncounted (priceNote). A malformed SSE data line is logged,
   and one that lost part of the reply makes the stream cut short. The
   parser's and the bookkeeper's system prompts are cached too, and the
   session's cache reads and writes are kept by role (usage.cache,
   cacheLine). Every module writes the debug log through State.pushDebug.
   Wave 47: the mock provider is its own module, Mock, right after this one
   (Api.Mock is it).
   Wave 43: each call that spent tokens is also added to the game's own
   total (State.spend into meta.cost: dollars, turns, calls, tokens), which
   the save keeps and /undo never takes back; onSpend(fn) hears of it (the
   top bar's cost chip). */
const Api = (() => {
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const MODELS_ENDPOINT = 'https://api.anthropic.com/v1/models';
  const API_VERSION = '2026-10-21';
  const MAX_TOKENS = { narrator: 3000, parser: 2000, bookkeeper: 4000, chronicle: 2000, memories: 8000, places: 6000, clock: 3000, people: 6000 }; // thinking tokens count toward these
  const NARRATOR_MAX_TOKENS = Object.freeze({ low: 2000, medium: 3000, high: 6000 }); // the narrator thinks more at a higher effort
  const EFFORTS = ['low', 'medium', 'high'];
  const RETRY_DELAY_MS = 1500;
  // Wave 41: retry-after is honoured up to a minute (it was 10 s, so a 429 asking for 30 s came back too early and failed the turn).
  const RETRY_AFTER_MAX_MS = 60000;
  const RETRY_STATUSES = [429, 500, 502, 503, 504, 529];
  /* Wave 41: an overloaded API (529, a 503, a mid-stream overloaded_error)
     gets two retries, everything else one. RETRY.jitter: up to this many ms
     added to an overloaded retry's wait, so many tabs do not come back at
     once. RETRY.scale: tests shorten every retry wait by this factor (the
     countdown still reads in the API's seconds). */
  const RETRY_LIMITS = Object.freeze({ overloaded_error: 2 });
  const RETRY = { jitter: 400, scale: 1 };
  /* Idle timeouts in ms: a stream gives up after this long with no byte (reset
     by every byte), a JSON call after this long in all; key: Settings' key
     check. Mutable for tests. */
  const TIMEOUTS = { stream: 45000, json: 120000, key: 20000 };
  const CACHE_CONTROL = Object.freeze({ type: 'ephemeral', ttl: '1h' });
  const PREWARM_AFTER_MS = 50 * 60 * 1000;
  /* What an HTTP header can carry: printable ASCII, no spaces. A key pasted
     with a zero-width space or a line break fails this. */
  const KEY_RE = /^[\x21-\x7e]+$/;
  const RESPONSES_MAX = 20;
  const PRICES = { // USD per million tokens
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 }
  };
  /* SPEC.md section 10, word for word; the parser's prompt then adds a few
     sentences: LAST TURN (a short reply is read against it), a walk before
     or after the action (destinationId and moveWhen), aboutIds for who or
     what is only talked about, a person named by role is never swapped for
     a listed person who does not match, and the packet's MODE line says
     whether the input is something done (do) or the player's exact words
     (say; the composer's Do / Say toggle), with one more for running off in
     do mode; then the rubric (REVIEW section 2.6: when to roll, the four
     difficulties with their numbers, which stat), gamble, and one on things
     the player does not carry (missingItem: the narrator then hears NOT
     CARRIED). Short and static: everything volatile goes in the user
     message as a labelled packet. The bookkeeper's prompt carries the field
     rubric (RECORD_RULES).
     MEMORY_RULES is the bookkeeper's memory rule; the memory rewrite
     (Upgrade) states it word for word, so an updated game holds the same
     kind of memory a new one records. PLACE_RULE is the bookkeeper's rule
     for placesRevealed (a place someone names that is not in the town
     yet), shared word for word with Upgrade's re-read of a saved game's
     story (SYSTEM.places); it sits before MEMORY_RULES so the bookkeeper's
     prompt still ends with the memory rules. */
  const PLACE_RULE = "Add a place to placesRevealed only when someone in the narration names a specific place in or near town that the player could walk to and that is not in the places list: a house, a shop, a spot by the river. Use the name they would use for it. Not for vague mentions, places far away, or places already listed.";
  /* Wave 28: MEMORY_RULES and MEMORY_WORDS diverge on purpose (the
     integration plan's 5.3, red-team item f). MEMORY_RULES stays word for
     word for Upgrade's memory re-read (SYSTEM.memories quotes it, and
     tests/upgrade.test.cjs pins it); the bookkeeper now names events, and
     gets only MEMORY_WORDS: how the words after the colon are written. */
  const MEMORY_RULES ="A memory is only something this person would still hold against the player, thank them for, or hold them to later: an insult, a threat, a lie caught, a favour, a flirt or a compliment that lands, a promise, a debt, a gift, a fight, a secret shared, what the player claimed about themselves (a name, a job, a story about why they are here), and terms agreed, with the amount and the deadline kept ('owes me $40 by Friday'). Someone who only saw something serious happen (a fight, a theft, a threat) can remember that too ('saw them hit the bartender'). Ordinary talk, questions, small talk and the mechanics of a scene are not memories, and neither is anything already on that person's remembers list. At most one memory per person per turn, written as a short plain line from that person's point of view, under twelve words, with no scene detail (good: 'flirted with me', 'told me to fuck off', 'lied about car trouble to get Dewayne outside', 'says he is a surveyor from the state'). Weight 1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help).";
  /* The bookkeeper's field rubric (REVIEW section 2.6): what each field is
     for and what it is not for. */
  const RECORD_RULES = "FIELDS: itemsGained only for things the player now keeps and carries (a drink drunk, a meal eaten or a night's room is not an item). goldDelta only for money that changed hands in the narration (an offer, a price named or a debt talked about is not a payment). npcKnownToPlayer only for people the player met face to face this turn, or whose name they heard while that person was there. newSeeds is usually empty: only a concrete later event the narration sets up, with its day, place or person. A meeting someone in the narration agrees to with the player, later today or on a later day, is one seed: triggerType location with that place's id as triggerValue (or triggerType day with the day number when it is another day, with the place named in the effect), and the effect starts with that person's full name and says where exactly and when ('Jodie Strayhorn waits at the Low Water's back door at half past ten, before opening'; 'Curtis Pruett expects the player at the Low Water tomorrow evening for the game'); one seed per meeting, none for a vague 'see you around'. Someone saying they will come to where the player is (\"I'll come by your room in ten minutes\") is a meeting at the player's place, now: triggerType location with the player's place as triggerValue, the effect naming them and 'now' or the time they said. A favour or a job someone in the narration asks of the player (something to fetch, find out, deliver, keep quiet about, say or do; an offer with a reward; a warning with a threat) is one seed too: triggerType day with its deadline's day number when it has one ('before the council vote' is the day THREADS or TOWN NEWS give for it; 'by Friday' is that day; DAYS on the TURN line numbers the weekdays), else triggerType npc with that person's id as triggerValue (it comes due when the player next meets them); the effect starts with that person's full name and says what they asked, the reward or the threat, and the deadline in words ('Carter Sturdivant wants copies of the station's debts from Darlene Pittman's back office before the council vote on Day 6; $500 cash, and deny knowing him if caught'; 'Travis Cagle asked the player to say nothing about his parked cruiser and to report Boyd Teague's questions to him'); one seed per ask, none for small talk. threadUpdates: status resolved only when the narration settles the thread for good, failed only when it is lost for good, otherwise only a new summary, and knownToPlayer true when the player first learns of it. clockNudges only when the action plainly helps or hinders the aim of a faction's CLOCK as FACTIONS shows it, at most one. npcFates only when the narration shows it happening to someone present: arrested, gone (left town for good), dead, or hurt (beaten badly enough to be laid up for days). obligationsSettled: the id of an OPEN obligation the narration shows being met (paid in full, the thing delivered, the errand done).";
  /* Wave 28 (the integration plan's 5.3): the bookkeeper names the act, the
     engine decides what it does to the person (Rel.EVENTS, their traits,
     the repeats). The 22 words it may send in tier A, each with a gloss and
     some with an example line, and what the engine records itself so it is
     never sent. */
  const EVENT_RULES = "socialEvents: what a person here will remember of this turn, one line each, \"npc_id event: the memory\" (exposed and defended take the other person's id after the event; put private after it for words nobody else could hear). Name the act as a neutral witness would name it, not as this person feels it: the game knows who they are. Usually none or one; at most two a person and four a turn. The events: insulted (a put-down: \"npc_x insulted: called me a liar\"); complimented (praise or thanks that lands); pried (pressed on what they did not want to talk about); apologised (owned a wrong done to them: \"npc_dewayne apologised: hitting me over the tow bill\"); confided (the player told them something private); they_confided (they told the player something private); kept_word (kept their secret when someone named asked: \"npc_royce kept_word: kept quiet when Elbert asked how I'd vote\"); came_clean (owned up to a lie told them); lied_caught (they found out the player lied to them); betrayed_confidence (passed on what they told in confidence); exposed (told them someone else's secret: \"npc_dewayne exposed npc_mavis: told me Mavis spent the garage money\"); did_favour (real help they asked for or needed); they_helped (they helped the player); defended (stood up for them against someone here); informed_on (told the law or their boss on them, and they know); crossed (worked against what they want, and they know); rebuffed (the player turned down their advance); noted (a claim, terms or a promise they will hold the player to: \"npc_marcus noted: says she is a surveyor from the state\"); learned_secret (they let their own secret slip to the player); caught_you_at (they caught the player at something done behind their back); stole_from and cheated (they found out later). The engine records these itself, so never send them: a fight, a threat, a theft or a cheat seen as it happened, money or a thing handed over, a debt paid, a promise or a meeting kept or missed, a flirt, time spent together.";
  const MEMORY_WORDS = "The words after the colon are the memory: a short plain line from that person's point of view, the player its unnamed subject, under twelve words, with no scene detail (good: 'told me to fuck off', 'lied about car trouble to get Dewayne outside', 'says he is a surveyor from the state', 'owes me $40 by Friday').";
  const SYSTEM = {
    parser: "You convert a player's free-text action into structured data for a game engine. Use only the entity ids provided. If the player refers to something not in the lists, use `new:<short description>`. Decide whether the outcome is uncertain enough to need a roll. Never narrate. LAST TURN is what the narrator said just before this: read a short reply (\"Deal.\", \"I'll take it\", \"fine, show me\") as the answer to what was just offered or asked there. If the player goes somewhere and then does something there, set destinationId to that place, actionType to what they do there and moveWhen to \"before\"; the engine moves them first. If they do something here and then go somewhere (\"ask her about the boat, then walk to the bridge\"), set actionType to what they do here, destinationId to the place and moveWhen to \"after\". Otherwise moveWhen is null. targets are who and what the action is aimed at; a person, place or thing the player only asks or talks about goes in aboutIds, not targets (\"ask the bartender about the mayor\": the bartender is the target, the mayor goes in aboutIds). Everyone who exists in this town is in the lists (EVERYONE ELSE IN TOWN has the people the player has not met): a person the player names or describes, by name, by job or by who they are to someone (\"Dewayne's wife\"), is one of those ids, and `new:` is never used for a person; never substitute a listed person who does not match, and when nobody listed fits, leave them out of targets. The MODE line says how to read the input: in do mode it is what the player does, and any speech in it is incidental to the action; in say mode it is only the player's exact spoken words to whoever MODE names, so actionType is talk, persuade, deceive or intimidate, targets include whoever is spoken to, and destinationId is null. In do mode, running off or leaving with no place named is a move: set destinationId to the listed place that fits best. ROLL: needsRoll is true only when the outcome is uncertain and failing would change something: a fight, sneaking, stealing, picking a lock, a lie, pressing someone for what they would rather not give, a risky climb or chase. Never roll walking somewhere, looking around, ordinary talk, a question someone has no reason to dodge, buying at a listed price, or anything the person is glad to do. DIFFICULTY: easy (8) when most people would manage it; normal (12) when it takes some skill or luck; hard (15) when a professional would sweat, when lying to a police officer, or when asking anything of someone who is against the player or hates them (the engine also sets a floor); very_hard (18) when it goes against what the person wants (their traits and wants are listed), their nature, or what they just refused in LAST TURN. The engine makes a success a success, so put the doubt into the difficulty, never into the outcome. STAT: might for force, fights, lifting, climbing, running and holding on; wits for noticing, searching, working something out, fixing things and keeping a cool head; charm for persuading, bargaining, flattering and most lies told face to face; stealth for sneaking, hiding, picking locks and pockets, and slipping something past someone. GAMBLE: betting or playing cards or dice for money where a game runs (a bar) is actionType gamble, with no roll (the engine deals the hand) and the stake in summary (\"bets $20 at cards\"); the game (Texas hold'em or five-card draw) and who sits in (\"deal everyone in\", \"heads up\") may be named in the words, and the engine reads them from the input; \"I bet he is lying\" or \"I bet you ten bucks it rains tomorrow\" is a way of speaking, not gamble. The player has only what INVENTORY lists and what ITEMS HERE shows: when the action needs anything else (a knife to stab with, a gun, a car, a key, a tool), name it in missingItem, and use usesItemId only for a listed item. ROMANTIC: romantic is \"flirt\" when the words or action show romantic or sexual interest in someone (flirting, a compliment on their looks meant that way, asking them out, a wink, a kiss), \"more\" when the player proposes going further than that (upstairs, the night, a bed, a kiss meant to lead somewhere), and null otherwise: thanks, a kind word or a pet name in passing is null.",
    bookkeeper: "You record what changed in the game world after this turn. Use only the ids provided. Only record changes the narration actually shows. " + RECORD_RULES + " " + PLACE_RULE + " At most one per turn. " + EVENT_RULES + " " + MEMORY_WORDS,
    people: "You check the people a saved text RPG made up during play against what its story says about them. The game made each of them when the player first asked for them, sometimes from random tables before anything in the story was taken into account, so a record can contradict the story (someone the story calls a man's wife recorded as a man). For each person listed, return the record corrected to match the story: name (keep it unless the story calls this person something else), pronouns from how the story refers to them, a one-line role (who they are to someone, like \"Dewayne's wife\", or their job), a one-line look and a one-line voice (keep the old ones when nothing contradicts them, else make them fit), relationToNpcId and relation only when the story states them, and homeLocationId: the listed place the story says they live, else null. Who a person is comes from what the characters state about them (\"his wife Mavis\", \"my brother Earl\", \"that's my wife you hear in there\"), and a stated relation outranks everything else: a wife or a mother is she, a husband or a brother is he, otherwise they. The pronouns the narration itself used for this person are not evidence, and neither are the player's words: the narration followed the record you are checking, so a wrong record makes the story call a wife \"he\" for turns on end, and a player sometimes corrects the story the wrong way. A line from before they were named (\"his wife's gonna be thrilled when you knock\") counts when it is clearly about them. When this person calls a man their husband and another line calls them his wife, they are his wife, she. Never add anything the story does not support. Return every person listed, in the order given.",
    clock: "You check the clock of a saved text RPG against its story. The clock has four phases a day, in order: morning, afternoon, evening, night, then the next day's morning. In older versions of the game it could run ahead of the story, for example ticking into morning in the middle of a night scene. Read the last turns (oldest first, each stamped with the clock when it was narrated) and decide where the latest narration actually is in time. behind is true only when the story is clearly earlier than CLOCK NOW: the scene is still plainly in an earlier phase (lamps on, going to bed, nobody has slept yet, while the clock says morning). phase is the phase the latest narration takes place in. dayOffset is 0 when that phase is on the clock's day and -1 when it is the day before (the night before the clock's morning). When the story fits the clock, behind is false, phase is the clock's phase and dayOffset is 0. reason is one short sentence.",
    places: "You read the story so far of a saved text RPG and list the places people in it told the player about that the game does not have yet. " + PLACE_RULE + " List each place once, even if it comes up more than once. Choose nearId from the places list by what was said; when nothing says, use the player's current place. ownerNpcId is a listed person's id only when it is their home or business. The description is one sentence built only from what was said. turn is the TURN the mention comes from, or null when it comes from a summary. Return an empty list when there is nothing to add.",
    // Wave 28: MEMORY_RULES here word for word; the bookkeeper's own prompt has diverged from it on purpose (MEMORY_WORDS).
    memories: "You bring the memories in a saved game up to the game's current rules. Each person listed remembers things about the player, written under older, looser rules: many are long play-by-play accounts of a scene. The current rules, which the game's bookkeeper follows for every new memory, are: \"" + MEMORY_RULES + "\" Rewrite each person's list to follow them. Keep only what this person would still hold against the player or thank them for; drop the rest (ordinary talk, questions, what they only saw, what they did themselves, the mechanics of a scene). Merge memories about the same thing into one line, and list in from the number of every memory a line comes from. At most " + State.MEMORY_MAX + " per person, the ones that matter most to them. A line that already follows these rules (short and plain, from their point of view) stays as it is. Each line is short and plain, from that person's point of view (the player is the unnamed subject; the person is 'me'), under twelve words, with no scene detail. Weight 1 small, 2 notable, 3 serious. In the old lines the player may appear by name, as 'you' or as 'the player'. Never add anything their memories do not say. Return every person listed, with memories empty when nothing is worth keeping.",
    chronicle: "Summarise these turns for the narrator's memory, under 100 words, past tense, full names. Keep every number, deadline, promise, debt, threat, and any lie the player told and to whom. Skip scenery and small talk. End with 'Open:' and what is unresolved. Begin with the day or days the turns cover, like 'Day 2:' or 'Days 2-3:'."
  };

  // ----- JSON schemas for structured outputs -----
  /* Every object (nested ones too) lists all its properties in `required`
     and has additionalProperties:false; optional values are nullable via
     anyOf. No minimum/maximum/length keywords: State.apply clamps instead. */
  const STR = { type: 'string' };
  const INT = { type: 'integer' };
  const BOOL = { type: 'boolean' };
  const nullable = (t, description) => Object.assign(description ? { description } : {}, { anyOf: [t, { type: 'null' }] });
  const list = (items, description) => Object.assign({ type: 'array', items }, description ? { description } : {});
  const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  /* One place someone named (record_changes.placesRevealed, and Upgrade's
     reveal_places with a turn added). */
  const placeItem = extra => obj(Object.assign({
    name: { type: 'string', description: "The short name a local would call it: \"Dewayne's house\" for where Dewayne lives, \"the bait shop\". Never the directions to it (\"past the bridge\", \"up the river road\"): those belong in description" },
    type: { type: 'string', enum: REVEALED_TYPES, description: 'What kind of place it is' },
    description: { type: 'string', description: 'One sentence built only from what was said about it' },
    nearId: { type: 'string', description: 'The id of the listed place it is reached from: usually where the player is, or the listed place it was described relative to' },
    ownerNpcId: nullable(STR, "A listed person's id when it is their home or business, else null"),
    kind: { type: 'string', enum: REVEALED_KINDS }
  }, extra || {}));
  /* The parser's action types: the engine's (ACTION_TYPES, gamble included:
     a card game the engine deals). */
  const PARSE_TYPES = ACTION_TYPES.slice();
  const SCHEMAS = {
    parse_action: obj({
      actionType: { type: 'string', enum: PARSE_TYPES },
      summary: { type: 'string', description: 'One line restating the intended action; for gamble, the stake ("bets $20 at cards")' },
      targets: list(STR, 'Entity ids the action is aimed at, or new:<short description> for anything not in the lists'),
      aboutIds: list(STR, 'Ids of people, places or things the player only asks or talks about ("ask the bartender about the mayor": the mayor); never the one spoken to; usually empty'),
      destinationId: nullable(STR, 'The location id the player goes to this turn: for a move, or for an action done before or after walking there; otherwise null'),
      moveWhen: nullable({ type: 'string', enum: ['before', 'after'] }, '"before": walk to destinationId first, then act there ("I head to the bar and ask..."); "after": act here, then walk there ("ask her, then go to the bridge"); null for a plain move or no move'),
      needsRoll: { type: 'boolean', description: 'True only if the outcome is uncertain and failure would be interesting. Walking somewhere, ordinary talk, buying at listed prices and gamble never roll.' },
      stat: nullable({ type: 'string', enum: STATS }, 'The stat for the roll, or null when no roll'),
      difficulty: nullable({ type: 'string', enum: DIFFICULTIES }, 'The difficulty of the roll, or null when no roll'),
      usesItemId: nullable(STR, 'An inventory item id the action relies on, or null'),
      missingItem: nullable(STR, 'A thing the action needs that is not in INVENTORY and not lying here (a knife, a gun, a car, a key, a tool), named plainly; else null. usesItemId is for a listed item.'),
      timeCost: { type: 'string', enum: TIME_COSTS, description: 'instant: talking, looking, a quick thing. short: minutes to half an hour (walking across town, a search, a chore, a short drive). long: an hour or more. rest: sleep until morning.' },
      declaresWorldFact: { type: 'boolean', description: 'True if the player is asserting a fact about the world rather than acting' },
      // Wave 28: the engine decides the answer to a flirt before the narrator writes, and nobody under 18 is ever on the end of one (Rel.romanceTurn).
      romantic: nullable({ type: 'string', enum: ['flirt', 'more'] }, '"flirt" when the words or action show romantic or sexual interest in someone; "more" when they propose going further (upstairs, the night); else null')
    }),
    /* record_changes sits near the API's grammar limit. The limit is on the
       compiled grammar, not a plain count: a live probe once passed 46
       properties (nested ones counted) and refused 47, then on 31 Oct 2026
       the API refused 45 properties with six enums for every turn ("The
       compiled grammar is too large"). So the schema is kept to the shape
       that is known to pass live: 41 properties and three enums outside the
       nullables (the 31 Oct build of main, which recorded turns that same
       morning). npcFates and memoriesSettled go over the wire as "npc_id:
       ..." strings (recordFromWire turns them into the engine's objects),
       the clock delta and the seed trigger type are plain values the engine
       checks, and attitudeChanges' reason and newSeeds' cause are gone
       (nothing read them). If the API ever refuses the grammar again,
       bookkeep() asks once more with record_changes_core, the essentials
       only, so the turn is still recorded.
       Wave 28 (the integration plan's 5.2): attitudeChanges, newMemories and
       memoriesSettled leave the wire for socialEvents, a list of strings
       ("npc_id event: the memory", Api.socialFromWire reads them): 34
       properties and three enums. The three still reach State.apply on the
       legacy path when an older core reply or the engine sends them. */
    record_changes: obj({
      socialEvents: list(STR, 'What a person here will remember of this turn, one line each, "npc_id event[ npc_about][ private]: the memory", e.g. "npc_dewayne apologised: hitting me over the tow bill" or "npc_marcus noted: says she is a surveyor from the state"; usually none or one. Also badmouthed or vouched_for with the other person\'s id, when the player ran someone down to them or spoke up for someone'),
      goldDelta: nullable(INT, "Change in the player's money, in whole units of the town's currency (negative when spending), or null"),
      hpDelta: nullable(INT, "Change in the player's HP, or null"),
      itemsGained: list(STR, 'Item names or ids the player now carries'),
      itemsLost: list(STR, 'Inventory item ids or names the player no longer carries'),
      conditionsAdded: list(obj({ name: STR, effect: { type: 'string', description: 'e.g. "-1 might"' }, untilDay: INT })),
      playerLocationId: nullable(STR, 'Where the player is now, if the narration moved them; otherwise null'),
      npcKnownToPlayer: list(STR, 'NPC ids the player has now met or learned the name of'),
      threadUpdates: list(obj({
        threadId: STR,
        status: nullable({ type: 'string', enum: THREAD_STATUSES }),
        knownToPlayer: nullable(BOOL),
        summary: nullable(STR)
      })),
      clockNudges: list(obj({ factionId: STR, delta: { type: 'integer', description: '1 when the action helps the aim, -1 when it hinders it' } }), "Only when the action plainly helps (+1) or hinders (-1) the aim of the faction's CLOCK shown in FACTIONS; at most one, usually none"),
      newSeeds: list(obj({
        effect: { type: 'string', description: 'What will happen later and why, in one sentence' },
        triggerType: { type: 'string', description: 'One of: day, location, npc, clock' },
        triggerValue: { type: 'string', description: 'day: a day number at least tomorrow; location: loc_ id; npc: npc_ id; clock: fac_id:segment' }
      }), 'Usually empty: only a concrete later event the narration sets up'),
      rumoursHeard: list(STR, 'Rumour ids the narration shows the player hearing'),
      placesRevealed: list(placeItem(), 'A specific place someone in the narration named that is not in LOCATIONS; at most one, usually none'),
      npcFates: list(STR, 'What the narration shows happening to someone present, written "npc_id: status" with the status one of arrested, gone (left town for good), dead or hurt (laid up for days): "npc_wade: hurt"; at most one, usually none'),
      obligationsSettled: list(STR, 'Ids of OPEN obligations the narration shows being met; usually none'),
      journalEntry: nullable(STR, "One plain line for the player's journal, or null")
    }),
    fix_people: obj({
      people: list(obj({
        npcId: STR,
        name: { type: 'string', description: 'The name the story uses for this person (the record\'s, unless the story says otherwise)' },
        pronouns: { type: 'string', enum: PRONOUNS },
        role: { type: 'string', description: 'One plain line: who they are to someone ("Dewayne\'s wife"), or their job' },
        look: { type: 'string', description: 'One plain line that fits the story' },
        voice: { type: 'string', description: 'One plain line that fits the story' },
        relationToNpcId: nullable(STR, 'The id of the listed person the story says they are related to, else null'),
        relation: nullable(STR, 'What they are to that person: "wife", "brother"; else null'),
        homeLocationId: nullable(STR, 'The id of the listed place the story says they live, else null')
      }), 'Every person listed, in the order given')
    }),
    check_clock: obj({
      behind: { type: 'boolean', description: 'True only when the latest narration is clearly earlier than CLOCK NOW' },
      phase: { type: 'string', enum: PHASES, description: 'The phase the latest narration takes place in' },
      dayOffset: { type: 'integer', enum: [0, -1], description: "0: on the clock's day; -1: the day before" },
      reason: { type: 'string', description: 'One short sentence' }
    }),
    reveal_places: obj({
      placesRevealed: list(placeItem({ turn: nullable(INT, 'The TURN the mention comes from, or null when it comes from a summary') }), 'Every place to add, each once; empty when there is nothing to add')
    }),
    rewrite_memories: obj({
      people: list(obj({
        npcId: STR,
        memories: list(obj({
          from: list(INT, 'The numbers of the listed memories this line comes from: one, or several when it merges them'),
          text: { type: 'string', description: "Under twelve words, from this person's point of view, only for something they would hold against the player or thank them for; no scene detail." },
          weight: { type: 'integer', enum: [1, 2, 3], description: '1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help)' }
        }), `At most ${State.MEMORY_MAX}, oldest first; empty when nothing is worth keeping`)
      }), 'Every person listed, in the order given')
    })
  };

  /* The essentials of record_changes (the fallback when the API refuses the
     full grammar): what moved money, health, things, people's feelings and
     memories (wave 28: their events), where the player is, who they met,
     what they heard and the journal line. The rest (conditions, threads,
     clocks, seeds, places) is left for a turn the full schema is accepted.
     Eleven fields, eleven properties counted. */
  const RECORD_CORE_FIELDS = ['socialEvents', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'playerLocationId', 'npcKnownToPlayer', 'rumoursHeard', 'npcFates', 'obligationsSettled', 'journalEntry'];
  SCHEMAS.record_changes_core = obj(Object.fromEntries(RECORD_CORE_FIELDS.map(k => [k, SCHEMAS.record_changes.properties[k]])));
  /* What an empty record holds for each field of the schema (a core reply
     gets the rest filled in; wave 28: socialEvents in place of the three
     legacy fields, which are no longer filled in). */
  const RECORD_EMPTY = Object.freeze({ socialEvents: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [], playerLocationId: null, npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], placesRevealed: [], npcFates: [], obligationsSettled: [], journalEntry: null });
  /* The bookkeeper's reply as the engine reads it: "npc_id: status" and
     "npc_id: memory text" strings become { npcId, status } and { npcId, text }
     (objects pass through, so the mock's reply reads the same); a clock
     delta is 1 or -1 (0 or nothing is dropped); fields a core reply left
     out are empty. A string without an id becomes an object State.apply
     rejects by name. Wave 28: socialEvents lines through socialFromWire. */
  const WIRE_ID = /^\s*(npc_[a-z0-9_]+)\s*(?:[:\-\u2013\u2014]\s*|\s+)(.+?)\s*$/i;
  /* The bookkeeper's event lines (wave 28; the integration plan's 5.1),
     read tolerantly: tokens are consumed in any order up to the first word
     that is none of them, and the rest is the memory. The tokens: an npc id
     (the first is the person, a second the about-id), the event word
     (Rel.eventName: any case, spaces or hyphens, an alias, else a unique
     five-letter stem; a two- or three-word form such as "kept word" or
     "caught you at" only when it names an event exactly) and private.
     Colons, commas and dashes between them are skipped, so "npc_x:
     insulted: called me a liar" and "npc_x insulted called me a liar" read
     the same, and "meet at 10:30" in the memory is safe. An event that takes
     an about-id (exposed, badmouthed, vouched_for, defended) with none
     takes the first person its memory names (a full name, or a first name
     only one person has); an about-id on any other event is dropped. An
     object passes through. Returns { npcId, event, aboutId, private, text }
     (event '' when no word names one: State.apply refuses it by name). */
  const SEP_RE = /^[\s,:;\u2013\u2014-]*$/;
  function wordKey(w) { return String(w || '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z_]/g, ''); }
  function eventAt(words, i) {
    const toks = [];
    for (let j = i; j < words.length && toks.length < 3; j++) { if (SEP_RE.test(words[j])) { if (/[,:;]/.test(words[j])) break; continue; } toks.push({ w: words[j], j }); }
    for (let k = toks.length; k >= 2; k--) {
      const key = toks.slice(0, k).map(t => wordKey(t.w)).join('_');
      const name = Rel.EVENTS[key] ? key : Rel.ALIASES[key] || null;
      if (name) return { name, end: toks[k - 1].j };
    }
    const one = toks.length ? Rel.eventName(toks[0].w) : null;
    return one ? { name: one, end: toks[0].j } : null;
  }
  function firstNamed(text, except) {
    const s = State.current;
    if (!s || !text) return null;
    const t = String(text).toLowerCase().replace(/[\u2019]/g, "'");
    const people = s.npcs.filter(n => isObj(n) && n.id !== except && typeof n.name === 'string' && n.name);
    const at = needle => { const m = new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).exec(t); return m ? m.index + m[1].length : -1; };
    const firstOf = n => n.name.toLowerCase().split(/\s+/)[0];
    let best = null;
    for (const n of people) {
      let pos = at(n.name.toLowerCase());
      const first = firstOf(n);
      if (pos < 0 && first.length >= 3 && people.filter(m => firstOf(m) === first).length === 1) pos = at(first);
      if (pos >= 0 && (!best || pos < best.pos)) best = { id: n.id, pos };
    }
    return best ? best.id : null;
  }
  function socialFromWire(v) {
    if (isObj(v)) return v;
    const words = String(v == null ? '' : v).replace(/[\u201c\u201d]/g, '"').replace(/[\u2019]/g, "'").trim().split(/(\s+[\u2013\u2014-]\s+|\s*[,:;]\s*|\s+)/);
    const out = { npcId: '', event: '', aboutId: null, private: false, text: '' };
    let i = 0;
    for (; i < words.length; i++) {
      const w = words[i];
      if (SEP_RE.test(w)) continue;
      const id = /^npc_[a-z0-9_]+$/i.test(w) ? w.toLowerCase() : null;
      if (id && !out.npcId) { out.npcId = id; continue; }
      if (id && !out.aboutId) { out.aboutId = id; continue; }
      if (/^private$/i.test(w)) { out.private = true; continue; }
      if (!out.event) { const ev = eventAt(words, i); if (ev) { out.event = ev.name; i = ev.end; continue; } }
      break;
    }
    out.text = words.slice(i).join('').replace(/^[\s,:;\u2013\u2014-]+/, '').trim();
    if (Rel.ABOUT_EVENTS.includes(out.event)) { if (!out.aboutId) out.aboutId = firstNamed(out.text, out.npcId); }
    else out.aboutId = null;
    return out;
  }
  function recordFromWire(d) {
    if (!isObj(d)) return d;
    const out = Object.assign({}, d);
    const split = v => { const m = WIRE_ID.exec(String(v == null ? '' : v)); return m ? { npcId: m[1].toLowerCase(), rest: m[2] } : { npcId: String(v == null ? '' : v).trim(), rest: '' }; };
    if (Array.isArray(out.socialEvents)) out.socialEvents = out.socialEvents.map(socialFromWire);
    if (Array.isArray(out.npcFates)) out.npcFates = out.npcFates.map(f => { if (isObj(f)) return f; const x = split(f); return { npcId: x.npcId, status: x.rest.toLowerCase().replace(/[^a-z]/g, '') }; });
    if (Array.isArray(out.memoriesSettled)) out.memoriesSettled = out.memoriesSettled.map(m => { if (isObj(m)) return m; const x = split(m); return { npcId: x.npcId, text: x.rest }; });
    if (Array.isArray(out.clockNudges)) out.clockNudges = out.clockNudges.filter(c => !isObj(c) || (Number(c.delta) || 0) !== 0).map(c => isObj(c) ? Object.assign({}, c, { delta: (Number(c.delta) || 0) > 0 ? 1 : -1 }) : c);
    for (const k of Object.keys(RECORD_EMPTY)) if (!(k in out)) out[k] = deepCopy(RECORD_EMPTY[k]);
    return out;
  }
  /* The API refusing the schema's grammar as too large (31 Oct 2026). */
  const grammarRefused = err => !!err && err.type === 'invalid_request_error' && /grammar/i.test(String(err.detail || err.message || ''));

  // ----- errors -----
  class ApiError extends Error {
    constructor(type, message, extra) { super(message); this.name = 'ApiError'; this.type = type; Object.assign(this, extra || {}); }
  }
  const FRIENDLY = {
    no_key: 'There is no API key yet. Add yours in Settings, or try the offline demo (Settings → Advanced).',
    invalid_request_error: 'The API rejected the request; that is a bug in the game. The details are in the debug view.',
    authentication_error: 'The API key was not accepted. Check the key in Settings.',
    permission_error: 'This API key is not allowed to do that. Check the key and the model names in Settings.',
    not_found_error: 'The API does not know that model. Check the model names in Settings.',
    request_too_large: 'The request was too large for the API.',
    rate_limit_error: 'The API is rate limiting this key. Wait a moment and try again.',
    api_error: 'The API had an internal error. Try again in a moment.',
    overloaded_error: 'The API is overloaded right now. Try again in a moment.',
    network: 'Could not reach the API. Check your connection and try again.',
    timeout: 'The API stopped answering, so the game gave up waiting. Try again.',
    broken_stream: 'The connection dropped before the reply finished. Try again.',
    aborted: 'Stopped.',
    bad_key: 'The API key has a space or an invisible character in it (often from copying). Paste it again in Settings.',
    max_tokens: 'The reply was cut off before it finished. Try again.',
    bad_response: 'The API sent a reply the game could not read. Try again.',
    http: 'The API returned an unexpected error. Try again.'
  };
  const STATUS_TYPES = { 400: 'invalid_request_error', 401: 'authentication_error', 403: 'permission_error', 404: 'not_found_error', 413: 'request_too_large', 429: 'rate_limit_error', 500: 'api_error', 502: 'api_error', 503: 'overloaded_error', 504: 'api_error', 529: 'overloaded_error' };
  function httpError(status, payload, requestId) {
    const e = isObj(payload) && isObj(payload.error) ? payload.error : {};
    const type = STATUS_TYPES[status] || (typeof e.type === 'string' && FRIENDLY[e.type] ? e.type : 'http');
    return new ApiError(type, FRIENDLY[type] || FRIENDLY.http, { status, requestId: requestId || null, detail: cleanText(e.message, 1000) || null, retryable: RETRY_STATUSES.includes(status) });
  }
  /* retry-after: seconds, or an HTTP date; capped at RETRY_AFTER_MAX_MS. Null when absent or unreadable. */
  function retryAfterMs(h) {
    if (h === null || h === undefined || String(h).trim() === '') return null;
    const secs = Number(String(h).trim());
    let ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(String(h)) - Date.now();
    if (!Number.isFinite(ms)) return null;
    return clamp(Math.round(ms), 0, RETRY_AFTER_MAX_MS);
  }
  function validKey(key) { return typeof key === 'string' && KEY_RE.test(key); }

  // ----- in flight: timeouts and Stop -----
  /* watch(ms): an AbortController whose timer fires after ms of silence;
     kick() restarts it (every byte of a stream), stop() clears it when the
     call is over. abort() (Stop) aborts every watch in flight, wakes every
     retry wait and rejects every pending call() with ApiError 'aborted'. */
  const inflight = new Set();
  const wakers = new Set();
  let abortGen = 0;
  function watch(ms) {
    const ctl = new AbortController();
    const w = { signal: ctl.signal, why: null, ms, timer: null };
    w.kick = () => { clearTimeout(w.timer); if (!w.why) w.timer = setTimeout(() => { w.why = 'timeout'; ctl.abort(); }, ms); };
    w.stop = () => { clearTimeout(w.timer); inflight.delete(w); };
    w.abort = why => { if (!w.why) w.why = why; clearTimeout(w.timer); ctl.abort(); };
    inflight.add(w);
    w.kick();
    return w;
  }
  function abortedError() { return new ApiError('aborted', FRIENDLY.aborted, { retryable: false }); }
  function timeoutError(w) {
    const secs = Math.round(w.ms / 1000);
    return new ApiError('timeout', FRIENDLY.timeout, { retryable: true, detail: w.ms === TIMEOUTS.stream ? `timed out after ${secs} s with no data` : `timed out after ${secs} s` });
  }
  /* What a failed fetch or body read means: Stop, a timeout, or the network. */
  function transportError(err, w) {
    if (w && w.why === 'user') return abortedError();
    if (w && w.why === 'timeout') return timeoutError(w);
    if (err instanceof ApiError) return err;
    return new ApiError('network', FRIENDLY.network, { retryable: true, detail: String((err && err.message) || err) });
  }
  /* A retry's wait; Stop cuts it short with ApiError 'aborted'. Wave 41:
     the listeners (onWait: the Pipeline's status line) hear { role,
     seconds } as each second of it passes ("Busy; trying again in 23 s"),
     then null when it is over, however it ends. RETRY.scale shortens the
     real wait for tests; the seconds stay the API's. */
  const waitFns = new Set();
  function tellWait(ev) { for (const fn of Array.from(waitFns)) { try { fn(ev); } catch (e) { console.error(e); } } }
  function pause(ms, gen, role) {
    const scale = Number.isFinite(RETRY.scale) && RETRY.scale > 0 ? RETRY.scale : 1;
    const sec = 1000 * scale;
    const end = Date.now() + ms * scale;
    return new Promise((resolve, reject) => {
      let t = null;
      let over = false;
      const done = () => {
        if (over) return;
        over = true;
        clearTimeout(t); wakers.delete(done);
        if (role) tellWait(null);
        if (gen !== abortGen) reject(abortedError()); else resolve();
      };
      const step = () => {
        const left = end - Date.now();
        if (left <= 0) return done();
        if (role) tellWait({ role, seconds: Math.ceil(left / sec) });
        // Wake when the seconds shown change (or at the end).
        t = setTimeout(step, Math.max(1, ((left - 1) % sec) + 1));
      };
      wakers.add(done);
      step();
    });
  }
  function abort() {
    abortGen += 1;
    for (const w of Array.from(inflight)) w.abort('user');
    for (const wake of Array.from(wakers)) wake();
    return true;
  }

  // ----- usage and the debug ring -----
  /* Wave 41: unpriced lists the models that spent tokens with no entry in
     PRICES (their cost is not counted: priceNote says so); usage.cache is
     the session's cache reads and writes by role (the narrator's three
     blocks, and the parser's and bookkeeper's system prompts). */
  function blankUsage() { return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cacheWrite1h: 0, cost: 0, priced: true, calls: 0, unpriced: [] }; }
  const usage = { turn: blankUsage(), session: blankUsage(), cache: {} };
  const responses = [];
  /* Wave 43: who hears of each paid call (UI's cost chip), with the game's total. */
  const spendFns = new Set();
  /* Cache writes by TTL: usage.cache_creation.ephemeral_1h_input_tokens and
     ephemeral_5m_input_tokens when the API breaks them down; otherwise the
     old cache_creation_input_tokens, all of it 1-hour (every block this game
     caches has ttl 1h). */
  function cacheWrites(raw) {
    const all = raw.cache_creation_input_tokens | 0;
    const cc = isObj(raw.cache_creation) ? raw.cache_creation : null;
    if (cc && (Number.isFinite(cc.ephemeral_1h_input_tokens) || Number.isFinite(cc.ephemeral_5m_input_tokens))) {
      const h1 = cc.ephemeral_1h_input_tokens | 0;
      const m5 = cc.ephemeral_5m_input_tokens | 0;
      return { h1, m5, all: Math.max(all, h1 + m5) };
    }
    return { h1: all, m5: 0, all };
  }
  function addRaw(total, raw) {
    if (!isObj(raw)) return total;
    const before = cacheWrites(total);
    for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) total[k] = (total[k] | 0) + (raw[k] | 0);
    const add = cacheWrites(raw);
    total.cache_creation = { ephemeral_1h_input_tokens: before.h1 + add.h1, ephemeral_5m_input_tokens: before.m5 + add.m5 };
    return total;
  }
  function roleModel(role) { const s = Storage.settings(); return role === 'narrator' ? s.narratorModel : s.parserModel; }
  /* The memory rewrite, the places re-read and the clock check (Upgrade) are the bookkeeper's judgement applied to an old game, so they think at the bookkeeper's effort. */
  const EFFORT_OF = { memories: 'bookkeeper', places: 'bookkeeper', clock: 'bookkeeper', people: 'bookkeeper' };
  function roleEffort(role) { const e = Storage.settings().effort || {}; const k = EFFORT_OF[role] || role; return EFFORTS.includes(e[k]) ? e[k] : 'low'; }
  function headers(apiKey) {
    return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' };
  }
  /* The narrator's max_tokens by its effort (thinking counts toward it). */
  function narratorMaxTokens() { return NARRATOR_MAX_TOKENS[roleEffort('narrator')] || MAX_TOKENS.narrator; }
  /* No temperature/top_p/top_k, no thinking, no tools or tool_choice, never a
     trailing assistant message. JSON comes from output_config.format.
     opts.messages replaces the one user message (the narrator's rewrite as
     an edit: user packet, assistant draft, user note; it ends with user). */
  function requestBody(role, opts) {
    opts = opts || {};
    const max = opts.maxTokens || (role === 'narrator' ? narratorMaxTokens() : MAX_TOKENS[role]) || 1500;
    const messages = Array.isArray(opts.messages) && opts.messages.length ? opts.messages.map(m => ({ role: m.role, content: String(m.content || '') })) : [{ role: 'user', content: String(opts.user || '') }];
    const body = { model: roleModel(role), max_tokens: max, messages };
    // The narrator's system prompt is cached for an hour: the style block, then any further blocks (the town, the cast), each its own cache breakpoint.
    // Wave 41: the parser's and the bookkeeper's too (opts.cache with no blocks: their one system block).
    if (opts.system) body.system = opts.cache ? [opts.system].concat(Array.isArray(opts.blocks) ? opts.blocks.filter(b => typeof b === 'string' && b) : []).map(text => ({ type: 'text', text, cache_control: Object.assign({}, CACHE_CONTROL) })) : opts.system;
    body.output_config = { effort: roleEffort(role) };
    if (opts.schema) body.output_config.format = { type: 'json_schema', schema: opts.schema };
    if (opts.stream) body.stream = true;
    return body;
  }
  /* The price table by model id; a dated alias ("claude-opus-5-5-20261001") prices as its model. */
  function priceOf(model) {
    const m = String(model || '');
    return PRICES[m] || PRICES[m.replace(/-20\d{2}[-\d]*$/, '')] || null;
  }
  /* USD for one call's usage: input, output and cache reads at the table's
     rates; a 5-minute cache write at 1.25x input, a 1-hour one at 2x.
     u.cacheWrite1h / u.cacheWrite5m split the writes; without them every
     write (cacheCreation) is a 1-hour one. */
  function costOf(model, u) {
    const p = priceOf(model);
    if (!p) return null;
    const m5 = u.cacheWrite5m | 0;
    const h1 = u.cacheWrite1h !== undefined ? u.cacheWrite1h | 0 : Math.max(0, (u.cacheCreation | 0) - m5);
    return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + m5 * p.input * 1.25 + h1 * p.input * 2) / 1e6;
  }
  function record(model, raw, role) {
    const w = cacheWrites(raw);
    const u = { input: raw.input_tokens | 0, output: raw.output_tokens | 0, cacheRead: raw.cache_read_input_tokens | 0, cacheCreation: w.all, cacheWrite1h: w.h1, cacheWrite5m: w.m5 };
    const spent = u.input + u.output + u.cacheRead + u.cacheCreation > 0;
    const c = costOf(model, u);
    // Wave 43: the game's own running total (State's meta.cost, kept in the save and never taken back by /undo), added by the same call that adds the session's.
    const firstOfTurn = usage.turn.calls === 0;
    if (spent && State.current) {
      State.spend({ usd: c === null ? 0 : c, turns: firstOfTurn ? 1 : 0, calls: 1, input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheCreation });
      for (const fn of Array.from(spendFns)) { try { fn(State.cost()); } catch (e) { console.error(e); } }
    }
    for (const b of [usage.turn, usage.session]) {
      b.input += u.input; b.output += u.output; b.cacheRead += u.cacheRead; b.cacheCreation += u.cacheCreation; b.cacheWrite1h = (b.cacheWrite1h | 0) + u.cacheWrite1h; b.calls += 1;
      if (c === null) {
        if (spent) { b.priced = false; if (!Array.isArray(b.unpriced)) b.unpriced = []; if (!b.unpriced.includes(String(model))) b.unpriced.push(String(model)); }
      } else b.cost += c;
    }
    if (role && (u.cacheRead || u.cacheCreation)) {
      const k = role === 'prewarm' ? 'narrator' : role;
      const r = usage.cache[k] || (usage.cache[k] = { read: 0, write: 0 });
      r.read += u.cacheRead; r.write += u.cacheCreation;
    }
  }
  /* Wave 41: "no price known for claude-mystery-9: cost not counted", or ''
     when every model that spent tokens has a price (b: usage.turn or
     usage.session; the session by default). */
  function priceNote(b) {
    const x = b || usage.session;
    const list = x && Array.isArray(x.unpriced) ? x.unpriced : [];
    return list.length ? `no price known for ${list.join(', ')}: cost not counted` : '';
  }
  /* Wave 41: the session's cache reads and writes by role, one line
     ("narrator read 700, write 700; parser read 1100, write 0"), or ''. */
  function cacheLine() {
    return ['narrator', 'parser', 'bookkeeper', 'chronicle'].concat(Object.keys(usage.cache).filter(k => !['narrator', 'parser', 'bookkeeper', 'chronicle'].includes(k)))
      .filter(k => usage.cache[k]).map(k => `${k} read ${usage.cache[k].read}, write ${usage.cache[k].write}`).join('; ');
  }
  function remember(entry) {
    responses.push(Object.assign({ at: new Date().toISOString() }, deepCopy(entry)));
    if (responses.length > RESPONSES_MAX) responses.shift();
  }
  /* Every real HTTP exchange lands here: status, request-id, stop reason,
     usage and the reply (or the error, verbatim). */
  function logCall(role, info) {
    const err = info.error;
    remember({
      role, provider: 'claude', attempt: info.attempt || 1, status: info.status || null, requestId: info.requestId || (err && err.requestId) || null,
      stopReason: info.stopReason || null, usage: info.usage || null, maxTokens: info.maxTokens || null,
      error: err ? { type: err.type, message: err.detail || err.message } : null, data: info.data === undefined ? null : info.data
    });
    if (err) State.pushDebug({ turn: State.current ? State.current.meta.turn : 0, kind: 'api', role, status: info.status || null, requestId: info.requestId || null, reason: `${err.type}: ${err.detail || err.message}${info.note || ''}` });
  }
  function refusalOf(details) {
    const d = isObj(details) ? details : {};
    return { category: typeof d.category === 'string' ? d.category : null, explanation: typeof d.explanation === 'string' ? d.explanation : null };
  }

  // ----- the minor rule's phrase list (read in every game, so it stays in Api; wave 47) -----
  /* The minor rule's backstop and its second signal (the integration plan's
     19.3; design section 2.7), once beside Mock's MOCK_ROMANCE: words that make a
     line an advance, over the input, lowercased, on word boundaries. One
     strong phrase is enough; weak words need two different ones ("thanks,
     sweetheart" is one weak word and no hit; "what time do you get off,
     sweetheart" is a strong one). The labelled eval (tests/eval-classify.cjs,
     wave 30) tunes it. */
  const MINOR_ROMANCE_PHRASES = Object.freeze({
    strong: /\b(flirt\w*|kiss\w*|make out|making out|hook up|hooking up|sleep with|sleeping with|go to bed with|come to bed|go out with me|on a date|a date with me|take you out|ask \w+ out|what time (?:do )?you get off|when (?:do )?you get off|(?:to|at|back to) (?:your|my) place|come upstairs|come up to my|come home with me|come back to my|spend the night|stay the night|stay over|my room|come sit with me|sit on my lap|wink\w*|stroke\w*|hand on (?:her|his|your) (?:knee|thigh|waist|leg)|you(?:'?re| are) (?:so |real )?(?:pretty|cute|beautiful|gorgeous|hot|sexy)|sexy)\b/i,
    weak: Object.freeze(['sweetheart', 'honey', 'babe', 'baby', 'darling', 'darlin', 'sugar', 'gorgeous', 'pretty', 'beautiful', 'cute', 'lovely', 'you look', 'smile at'])
  });
  function minorPhraseHit(text) {
    const t = ` ${String(text || '').toLowerCase().replace(/[’‘]/g, "'")} `;
    if (MINOR_ROMANCE_PHRASES.strong.test(t)) return true;
    return MINOR_ROMANCE_PHRASES.weak.filter(w => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}(?![a-z])`).test(t)).length >= 2;
  }

  // ----- real provider -----
  /* One POST with the four headers under the watch w. Resolves to the ok
     Response; anything else throws ApiError (retryable per RETRY_STATUSES,
     with retryAfterMs from the retry-after header and the body for the
     debug view). The caller logs and retries. */
  async function send(role, body, w) {
    const key = Storage.getApiKey();
    if (!key) throw new ApiError('no_key', FRIENDLY.no_key, { retryable: false });
    if (!validKey(key)) throw new ApiError('bad_key', FRIENDLY.bad_key, { retryable: false, detail: 'the key has a character outside printable ASCII (a space, a line break or an invisible character)' });
    let res;
    try {
      res = await fetch(ENDPOINT, { method: 'POST', headers: headers(key), body: JSON.stringify(body), signal: w.signal });
    } catch (err) { throw transportError(err, w); }
    w.kick();
    const requestId = res.headers.get('request-id');
    if (res.ok) return { res, requestId };
    let raw = '';
    let payload = null;
    try { raw = await res.text(); payload = JSON.parse(raw); } catch (e) { /* not JSON */ }
    const err = httpError(res.status, payload, requestId);
    err.retryAfterMs = retryAfterMs(res.headers.get('retry-after'));
    err.logData = payload || raw.slice(0, 2000);
    throw err;
  }
  /* After a failed try: log it, then either throw (not retryable, Stop, or
     the retries already spent) or wait (retry-after, else 1.5 s) and let
     the caller try again. tries.transient counts the retries spent.
     Wave 41: two retries for an overloaded API (RETRY_LIMITS), the second
     wait twice the first and both with a little jitter; retry-after up to
     60 s, counted down in the status line (pause), and Stop ends the wait.
     The debug entry of an HTTP failure that is retried says what the wait
     was based on: the retry-after header, or the fixed wait when the page
     could not read one (a browser reads it across origins only when the
     API lists it in access-control-expose-headers). A 404 that names the
     model asks GET /v1/models for a current one of the same family
     (suggestModel). */
  function retriesFor(err) { return RETRY_LIMITS[err && err.type] || 1; }
  function retryWait(err, tries) {
    if (err.type === 'bad_response' || err.type === 'broken_stream') return 0;
    const after = Number.isFinite(err.retryAfterMs);
    const base = after ? err.retryAfterMs : RETRY_DELAY_MS * (tries.transient + 1);
    return base + (err.type === 'overloaded_error' ? Math.round(Math.random() * RETRY.jitter) : 0);
  }
  async function failedTry(role, err, info, tries, gen) {
    const again = err.type !== 'aborted' && gen === abortGen && !!err.retryable && tries.transient < retriesFor(err);
    const wait = again ? retryWait(err, tries) : 0;
    let note = '';
    if (again && err.status && err.type !== 'bad_response') {
      note = Number.isFinite(err.retryAfterMs) ? `; retry-after ${Math.round(err.retryAfterMs / 100) / 10} s, trying again` : `; no retry-after header the page could read, so the fixed ${Math.round(wait / 100) / 10} s wait, trying again`;
    }
    logCall(role, Object.assign({ error: err, data: err.logData, note }, info));
    if (err.type === 'not_found_error' && gen === abortGen) await suggestModel(role, err);
    if (err.type === 'aborted' || gen !== abortGen) throw err.type === 'aborted' ? err : abortedError();
    if (!again) throw err;
    tries.transient += 1;
    if (wait > 0) await pause(wait, gen, role);
    else if (gen !== abortGen) throw abortedError();
  }
  /* Wave 41: a 404 for a model the API does not know (a retired one): the
     same GET /v1/models Check key makes (same headers, the key timeout),
     and a current model of the same family (opus, sonnet, haiku) named in
     the message and the debug view. When the list call fails or has no such
     model, the message stays as it was. */
  const FAMILY_RE = /\b(opus|sonnet|haiku)\b/i;
  function modelFamily(id) { const m = FAMILY_RE.exec(String(id || '').replace(/-/g, ' ')); return m ? m[1].toLowerCase() : null; }
  // GET /v1/models: one request for Check key and the retired-model check alike.
  function getModels(key, w) { return fetch(MODELS_ENDPOINT, { method: 'GET', headers: headers(key), signal: w.signal }); }
  async function listModels() {
    const key = Storage.getApiKey();
    if (!validKey(key)) return null;
    const w = watch(TIMEOUTS.key);
    try {
      const res = await getModels(key, w);
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data && data.data) ? data.data.map(m => m && typeof m.id === 'string' ? m.id : null).filter(Boolean) : null;
    } catch (e) { return null; } finally { w.stop(); }
  }
  async function suggestModel(role, err) {
    const model = String(err.model || '');
    const detail = String(err.detail || '');
    if (!model || !(detail.includes(model) || /\bmodel\b/i.test(detail))) return null;
    const fam = modelFamily(model);
    const ids = fam ? await listModels() : null;
    const pick = ids ? ids.find(id => id !== model && modelFamily(id) === fam && !/-20\d{6}$/.test(id)) || ids.find(id => id !== model && modelFamily(id) === fam) : null;
    if (!pick) return null;
    err.suggestedModel = pick;
    err.message = `The API does not know the model ${model} (it may have been retired). Try ${pick} in Settings.`;
    State.pushDebug({ turn: State.current ? State.current.meta.turn : 0, kind: 'api', role, status: err.status || 404, requestId: err.requestId || null, reason: `not_found_error: ${model} is not a model the API knows; GET /v1/models lists ${pick} (the same family), named in the message` });
    return pick;
  }
  function textOf(data) {
    const block = Array.isArray(data && data.content) ? data.content.find(b => b && b.type === 'text') : null;
    return block && typeof block.text === 'string' ? block.text : '';
  }
  /* Parser, bookkeeper (structured outputs), chronicle (plain text) and the
     Upgrade calls. One retry for a transient failure; a reply cut off by
     max_tokens is asked for once more with twice the limit, then fails. */
  async function messageCall(role, opts) {
    const total = {};
    const tries = { transient: 0, grown: false };
    const gen = abortGen;
    let maxTokens = MAX_TOKENS[role];
    for (let attempt = 1; ; attempt++) {
      const body = requestBody(role, { system: opts.system, user: opts.user, schema: opts.schema, maxTokens, cache: !!opts.cache });
      const fail = (type, extra) => new ApiError(type, FRIENDLY[type], Object.assign({ usage: total, model: body.model, retryable: false }, extra));
      const w = watch(TIMEOUTS.json);
      let res = null;
      let requestId = null;
      let data;
      try {
        ({ res, requestId } = await send(role, body, w));
        try { data = await res.json(); } catch (e) {
          // A body that is not JSON (a cut-off transfer, a proxy page): once more, then give up.
          if (w.why) throw transportError(e, w);
          throw fail('bad_response', { requestId, status: res.status, detail: 'reply was not JSON', retryable: true });
        }
      } catch (err) {
        w.stop();
        const e = transportError(err, w);
        Object.assign(e, { usage: total, model: body.model, requestId: e.requestId || requestId });
        await failedTry(role, e, { attempt, status: e.status || (res && res.status) || null, requestId: e.requestId, maxTokens }, tries, gen);
        continue;
      }
      w.stop();
      addRaw(total, data.usage);
      const text = textOf(data);
      logCall(role, { attempt, status: res.status, requestId, stopReason: data.stop_reason, usage: data.usage, maxTokens, data: { text: text.slice(0, 4000), stop_details: data.stop_details || null } });
      if (data.stop_reason === 'refusal') return { result: null, refusal: refusalOf(data.stop_details), usage: total, model: body.model, logged: true };
      if (data.stop_reason === 'max_tokens') {
        if (!tries.grown) { tries.grown = true; maxTokens *= 2; continue; }
        throw fail('max_tokens', { requestId });
      }
      if (!opts.schema) return { result: text.trim(), usage: total, model: body.model, logged: true };
      try { return { result: JSON.parse(text), usage: total, model: body.model, logged: true }; }
      catch (e) {
        const err = fail('bad_response', { requestId, detail: 'reply did not match the schema', retryable: true });
        await failedTry(role, err, { attempt, status: res.status, requestId, maxTokens }, tries, gen);
      }
    }
  }
  /* Server-sent events per docs/API_NOTES.md: text_delta is appended,
     thinking and signature deltas are ignored, stop_reason comes from
     message_delta, usage from message_start plus message_delta. Every chunk
     kicks the watch w (the idle timeout). A stream must end with
     message_stop: one that closes before it is broken (ApiError
     broken_stream, retryable). An error event throws; overloaded_error and
     api_error are retryable.
     Wave 41: a data line that is not JSON is logged (role, the line cut to
     200 characters, how many so far: out.malformed). When it was a text
     delta or a JSON fragment (part of the reply may be gone), the stream
     counts as cut short (broken_stream, retried once) even if
     message_stop came. */
  async function readStream(res, onDelta, w, role) {
    const out = { text: '', stopReason: null, stopDetails: null, usage: {}, model: null, events: 0, complete: false, malformed: 0, lost: false };
    const blocks = {};
    const handle = block => {
      let data = '';
      let name = '';
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('data:')) data += line.slice(5).replace(/^ /, '');
        else if (line.startsWith('event:')) name = line.slice(6).trim();
      }
      if (!data || data === '[DONE]') return;
      let ev;
      try { ev = JSON.parse(data); } catch (e) {
        out.malformed += 1;
        const lost = name === 'content_block_delta' || /text_delta/.test(data) || /^\s*[{[]/.test(data);
        if (lost) out.lost = true;
        State.pushDebug({ turn: State.current ? State.current.meta.turn : 0, kind: 'api', role: role || 'narrator', status: null, requestId: null, reason: `malformed SSE data line ${out.malformed}${lost ? ' (part of the reply lost: the stream counts as cut short)' : ''}: ${data.slice(0, 200)}` });
        return;
      }
      out.events += 1;
      switch (ev.type) {
        case 'message_start':
          if (isObj(ev.message)) { out.model = ev.message.model || null; Object.assign(out.usage, isObj(ev.message.usage) ? ev.message.usage : {}); }
          break;
        case 'content_block_start':
          if (isObj(ev.content_block)) blocks[ev.index] = ev.content_block.type;
          break;
        case 'content_block_delta':
          if (isObj(ev.delta) && ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string' && (blocks[ev.index] === undefined || blocks[ev.index] === 'text')) {
            out.text += ev.delta.text;
            if (onDelta) onDelta(ev.delta.text, out.text);
          }
          break;
        case 'message_delta':
          if (isObj(ev.delta) && ev.delta.stop_reason) out.stopReason = ev.delta.stop_reason;
          if (isObj(ev.delta) && ev.delta.stop_details) out.stopDetails = ev.delta.stop_details;
          if (isObj(ev.usage)) for (const k of Object.keys(ev.usage)) if (typeof ev.usage[k] === 'number') out.usage[k] = ev.usage[k];
          break;
        case 'message_stop':
          out.complete = true;
          break;
        case 'error': {
          const e = isObj(ev.error) ? ev.error : {};
          const type = FRIENDLY[e.type] ? e.type : 'api_error';
          throw new ApiError(type, FRIENDLY[type], { detail: cleanText(e.message, 1000) || null, retryable: type === 'overloaded_error' || type === 'api_error', usage: out.usage, partial: out.text });
        }
        default: break; // ping, content_block_stop
      }
    };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (w && value && value.length) w.kick();
        if (value) buf += dec.decode(value, { stream: true });
        if (done) buf += dec.decode();
        let m;
        while ((m = /\r?\n\r?\n/.exec(buf))) {
          const block = buf.slice(0, m.index);
          buf = buf.slice(m.index + m[0].length);
          handle(block);
        }
        if (done) { if (buf.trim()) handle(buf); break; }
      }
    } catch (err) {
      try { reader.cancel(); } catch (e) { /* already closed */ }
      if (err instanceof ApiError) throw err;
      const e = transportError(err, w);
      if (!e.usage) e.usage = out.usage;
      throw e;
    }
    if (!out.complete && out.stopReason !== 'refusal') {
      throw new ApiError('broken_stream', FRIENDLY.broken_stream, { retryable: true, detail: `the stream ended before message_stop${out.stopReason ? ` (stop_reason ${out.stopReason})` : ''}`, usage: out.usage, partial: out.text });
    }
    if (out.lost && out.stopReason !== 'refusal') {
      throw new ApiError('broken_stream', FRIENDLY.broken_stream, { retryable: true, detail: `${out.malformed} malformed SSE data line${out.malformed === 1 ? '' : 's'}: part of the reply was lost`, usage: out.usage, partial: out.text });
    }
    return out;
  }
  function chronicleText(entries) {
    return (Array.isArray(entries) ? entries : []).map(e => {
      const when = e.day ? ` (day ${e.day}, ${e.phase || ''})` : '';
      const player = isSay(e) ? `PLAYER SAID (to ${sayTo(e)}): "${e.input}"` : `PLAYER: ${e.input || '(none)'}`;
      return `TURN ${e.turn}${when}\n${player}${e.roll && e.roll.line ? `\nROLL: ${e.roll.line}` : ''}\nNARRATION: ${e.narration || ''}`;
    }).join('\n\n');
  }
  /* The narrator's three cached blocks for a packet: the style guide with
     its examples, the town, the cast. */
  function narratorBlocks(packet) {
    return { system: packet.system || Style.systemPrompt(), blocks: [packet.town !== undefined ? packet.town : Pipeline.townBlock(), packet.cast || Pipeline.castBlock()] };
  }
  /* A rewrite is sent as an edit: the packet, the first draft as the
     assistant's reply, then the note (the conversation ends with the user,
     as the API requires). Null for a first draft. */
  const EDIT_RULE = 'Change only what the note names; keep everything else in the draft as it is.';
  function editMessages(packet) {
    if (!isObj(packet) || typeof packet.draft !== 'string' || !packet.draft.trim() || typeof packet.note !== 'string') return null;
    return [{ role: 'user', content: String(packet.base || packet.text || '') }, { role: 'assistant', content: packet.draft.trim() }, { role: 'user', content: `${packet.note}\n${EDIT_RULE}` }];
  }
  let lastNarratorAt = null; // when the narrator cache was last written or read (ms), for prewarm()
  const Real = {
    name: 'claude',
    /* Wave 41: the parser's and the bookkeeper's system prompts (static, the
       rubric in them; the packet is the user message) are one cached block
       each, with the narrator's cache_control. Below the API's minimum
       prefix nothing is cached and nothing else changes. */
    parse(packet) { return messageCall('parser', { system: SYSTEM.parser, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.parse_action, cache: true }); },
    async bookkeep(packet) {
      const user = packet.text || JSON.stringify(packet);
      let r;
      try { r = await messageCall('bookkeeper', { system: SYSTEM.bookkeeper, user, schema: SCHEMAS.record_changes, cache: true }); } catch (err) {
        if (!grammarRefused(err)) throw err;
        // The API refused the full record as too large a grammar: once more with the essentials, so the turn is still recorded.
        State.pushDebug({ turn: State.current ? State.current.meta.turn : 0, kind: 'api', role: 'bookkeeper', status: err.status || 400, requestId: err.requestId || null, reason: 'the API refused the record_changes grammar as too large; asking again with the core fields only' });
        r = await messageCall('bookkeeper', { system: SYSTEM.bookkeeper, user, schema: SCHEMAS.record_changes_core, cache: true });
      }
      if (r && isObj(r.result)) r.result = recordFromWire(r.result);
      return r;
    },
    chronicle(entries) { return messageCall('chronicle', { system: SYSTEM.chronicle, user: chronicleText(entries) }); },
    rewriteMemories(packet) { return messageCall('memories', { system: SYSTEM.memories, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.rewrite_memories }); },
    revealPlaces(packet) { return messageCall('places', { system: SYSTEM.places, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.reveal_places }); },
    checkClock(packet) { return messageCall('clock', { system: SYSTEM.clock, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.check_clock }); },
    fixPeople(packet) { return messageCall('people', { system: SYSTEM.people, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.fix_people }); },
    /* Streamed. A stream that breaks, times out or carries an overloaded or
       internal error is asked for once more (the feed is cleared through
       onDelta('', '') first); a reply cut off by max_tokens is asked for once
       more with twice the limit, then fails, so a truncated narration is
       never returned. Usage adds up over the tries. */
    async narrate(packet, onDelta) {
      const sys = narratorBlocks(packet);
      const messages = editMessages(packet);
      const total = {};
      const tries = { transient: 0, grown: false };
      const gen = abortGen;
      let maxTokens = narratorMaxTokens();
      const reset = () => { if (onDelta) onDelta('', ''); };
      for (let attempt = 1; ; attempt++) {
        const body = requestBody('narrator', { system: sys.system, blocks: sys.blocks, user: packet.text, messages, cache: true, stream: true, maxTokens });
        const w = watch(TIMEOUTS.stream);
        let res = null;
        let requestId = null;
        let out;
        try {
          ({ res, requestId } = await send('narrator', body, w));
          if (/json/i.test(res.headers.get('content-type') || '')) {
            let data;
            try { data = await res.json(); } catch (e) {
              if (w.why) throw transportError(e, w);
              throw new ApiError('bad_response', FRIENDLY.bad_response, { requestId, retryable: true, detail: `${String(e && e.message)}${tries.transient < 1 ? '; trying again' : ''}` });
            }
            out = { text: textOf(data), stopReason: data.stop_reason || null, stopDetails: data.stop_details || null, usage: data.usage || {}, model: data.model || null, events: 0, complete: true };
            if (onDelta && out.text) onDelta(out.text, out.text);
          } else out = await readStream(res, onDelta, w, 'narrator');
        } catch (err) {
          w.stop();
          const e = transportError(err, w);
          if (isObj(e.usage) && e.usage !== total) addRaw(total, e.usage);
          Object.assign(e, { usage: total, model: body.model, requestId: e.requestId || requestId });
          if (e.retryable && tries.transient < retriesFor(e)) reset();
          await failedTry('narrator', e, { attempt, status: e.status || (res && res.status) || null, requestId: e.requestId, maxTokens }, tries, gen);
          continue;
        }
        w.stop();
        addRaw(total, out.usage);
        lastNarratorAt = Date.now();
        logCall('narrator', { attempt, status: res.status, requestId, stopReason: out.stopReason, usage: out.usage, maxTokens, data: { text: out.text.slice(0, 4000), events: out.events, stop_details: out.stopDetails } });
        if (out.stopReason === 'refusal') return { result: { text: out.text, stopReason: 'refusal' }, refusal: refusalOf(out.stopDetails), usage: total, model: body.model, logged: true };
        if (out.stopReason === 'max_tokens') {
          if (!tries.grown) { tries.grown = true; maxTokens *= 2; reset(); continue; }
          throw new ApiError('max_tokens', FRIENDLY.max_tokens, { requestId, retryable: false, usage: total, model: body.model, partial: out.text });
        }
        return { result: { text: out.text.trim(), stopReason: out.stopReason || 'end_turn' }, usage: total, model: body.model, logged: true };
      }
    }
  };
  /* The narrator's blocks are cached for an hour. When the last narration was
     over PREWARM_AFTER_MS ago (the cache has gone or is about to), one
     max_tokens 1 call with the same three blocks writes it while the parser
     works, so the narration reads it; the write was due anyway. Fire and
     forget: its usage is counted, a failure only logged. Real provider
     only, and only when a narration has happened this session. packet is
     the narrator's blocks, or a function that builds them (only when due). */
  function prewarm(packet) {
    if (provider() !== Real || !validKey(Storage.getApiKey()) || lastNarratorAt === null || Date.now() - lastNarratorAt <= PREWARM_AFTER_MS) return false;
    const sys = narratorBlocks((typeof packet === 'function' ? packet() : packet) || {});
    const body = requestBody('narrator', { system: sys.system, blocks: sys.blocks, user: 'Reply with one word: ready.', cache: true, maxTokens: 1 });
    body.output_config.effort = 'low';
    lastNarratorAt = Date.now();
    (async () => {
      const w = watch(TIMEOUTS.json);
      let res = null;
      try {
        let requestId;
        ({ res, requestId } = await send('narrator', body, w));
        const data = await res.json();
        w.stop();
        if (isObj(data.usage)) record(body.model, data.usage, 'prewarm');
        logCall('prewarm', { status: res.status, requestId, stopReason: data.stop_reason, usage: data.usage, maxTokens: 1, data: { text: textOf(data).slice(0, 200) } });
      } catch (err) {
        w.stop();
        const e = transportError(err, w);
        remember({ role: 'prewarm', provider: 'claude', status: e.status || (res && res.status) || null, requestId: e.requestId || null, error: { type: e.type, message: e.detail || e.message }, data: null });
      }
    })();
    return true;
  }
  /* Settings' "Check key": GET /v1/models with the key. Resolves to
     { ok, status, message }; never throws. */
  async function checkKey(k) {
    const key = k === undefined ? Storage.getApiKey() : String(k || '').trim();
    if (!key) return { ok: false, status: null, message: FRIENDLY.no_key };
    if (!validKey(key)) return { ok: false, status: null, message: FRIENDLY.bad_key };
    const w = watch(TIMEOUTS.key);
    try {
      const res = await getModels(key, w);
      if (res.ok) return { ok: true, status: res.status, message: 'The key works.' };
      let payload = null;
      try { payload = await res.json(); } catch (e) { /* not JSON */ }
      const e = httpError(res.status, payload, res.headers.get('request-id'));
      return { ok: false, status: res.status, message: e.message, detail: e.detail || null };
    } catch (err) {
      const e = transportError(err, w);
      return { ok: false, status: null, message: e.message, detail: e.detail || null };
    } finally { w.stop(); }
  }

  function provider() { return Storage.settings().mockMode ? Mock : Real; }
  function isRefusal(x) { return !!(x && x.refused === true); }
  /* Every call goes through here: usage is recorded, a refusal becomes
     { refused, role, ... }, and Stop (abort) rejects it at once with
     ApiError 'aborted', whichever provider is answering. */
  async function call(role, method, args) {
    const p = provider();
    let out;
    let cancel = null;
    const stopped = new Promise((resolve, reject) => { cancel = () => reject(abortedError()); wakers.add(cancel); });
    stopped.catch(() => {});
    try {
      out = await Promise.race([p[method].apply(p, args), stopped]);
    } catch (err) {
      if (err && err.usage && err.type !== 'aborted') record(err.model || roleModel(role), err.usage, role);
      throw err;
    } finally { wakers.delete(cancel); }
    if (out && out.usage) record(out.model || roleModel(role), out.usage, role);
    if (!out.logged) remember({ role, provider: p.name, data: out.refusal ? { refusal: out.refusal } : out.result });
    if (out.refusal) return { refused: true, role, category: out.refusal.category, explanation: out.refusal.explanation };
    return out.result;
  }
  return {
    ENDPOINT, MODELS_ENDPOINT, API_VERSION, MAX_TOKENS, NARRATOR_MAX_TOKENS, PRICES, RETRY_DELAY_MS, RETRY_AFTER_MAX_MS, RETRY_STATUSES, TIMEOUTS, CACHE_CONTROL, PREWARM_AFTER_MS, KEY_RE,
    // Wave 41: retry limits and the test-shortened waits, the wait countdown, the price note, the cache by role, the model family.
    RETRY, RETRY_LIMITS, priceNote, cacheLine, modelFamily,
    onWait(fn) { if (typeof fn !== 'function') return () => {}; waitFns.add(fn); return () => waitFns.delete(fn); },
    // Wave 43: fn(cost) after every call that spent tokens, cost being the game's total (State.cost()).
    onSpend(fn) { if (typeof fn !== 'function') return () => {}; spendFns.add(fn); return () => spendFns.delete(fn); },
    SYSTEM, SCHEMAS, FRIENDLY, MEMORY_RULES, PLACE_RULE, RECORD_RULES, PARSE_TYPES, RECORD_CORE_FIELDS, recordFromWire, grammarRefused,
    // Wave 28: the bookkeeper's events on the wire, its rubric, and the romance phrase lists (the mock parser's and the minor rule's).
    EVENT_RULES, MEMORY_WORDS, RECORD_EMPTY, socialFromWire, MINOR_ROMANCE_PHRASES, minorPhraseHit,
    // Wave 47: the mock provider is the Mock module; these read through to it (Mock is made after Api).
    get Mock() { return Mock; },
    get MOCK_ROMANCE() { return Mock.MOCK_ROMANCE; },
    get MOCK_MORE() { return Mock.MOCK_MORE; },
    ApiError, Real, usage, responses, refusalOf,
    headers, requestBody, costOf, priceOf, roleModel, roleEffort, narratorMaxTokens, isRefusal, readStream, chronicleText, retryAfterMs, validKey, editMessages,
    providerName: () => provider().name,
    beginTurn() { usage.turn = blankUsage(); },
    abort,
    checkKey,
    prewarm,
    get lastNarratorAt() { return lastNarratorAt; },
    set lastNarratorAt(v) { lastNarratorAt = Number.isFinite(v) ? v : null; },
    parse: packet => call('parser', 'parse', [packet]),
    narrate: (packet, onDelta) => call('narrator', 'narrate', [packet, onDelta]),
    bookkeep: packet => call('bookkeeper', 'bookkeep', [packet]),
    chronicle: entries => call('chronicle', 'chronicle', [entries]),
    rewriteMemories: packet => call('memories', 'rewriteMemories', [packet]),
    revealPlaces: packet => call('places', 'revealPlaces', [packet]),
    checkClock: packet => call('clock', 'checkClock', [packet]),
    fixPeople: packet => call('people', 'fixPeople', [packet])
  };
})();

