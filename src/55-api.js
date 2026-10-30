// ===== Module: Api =====
/* One interface over two providers (Settings.mockMode picks one):
     parse(packet)            -> parse_action object; packet from Pipeline.parsePacket()
                                 ({ text, block, ... }: block is Pipeline.parserBlock(),
                                 a cached system block after the parser's prompt)
     narrate(packet, onDelta) -> { text, stopReason }; onDelta(chunk, textSoFar) while
                                 streaming; packet = { text, system, town, cast, context }
                                 (system: the style block; town: Pipeline.townBlock();
                                 cast: Pipeline.castBlock(); three cached system blocks)
     bookkeep(packet)         -> record_changes object (applied with source 'model');
                                 packet = { text, block, context } (block:
                                 Pipeline.bookkeeperBlock(), cached like the parser's)
     chronicle(entries)       -> summary string (entries are log entries; bookkeeper model)
     rewriteMemories(packet)  -> { people: [{ npcId, memories: [{ from, text, weight }] }] };
                                 packet from Upgrade.memoryPacket() (an older game's
                                 memories brought up to the current rules; bookkeeper model)
     revealPlaces(packet)     -> { placesRevealed: [{ name, type, description, nearId,
                                 ownerNpcId, kind, turn }] }; packet from
                                 Upgrade.placesPacket() (places people named in an older
                                 game's story; bookkeeper model)
     checkClock(packet)       -> { behind, phase, dayOffset, reason }; packet from
                                 Upgrade.clockPacket() (whether an older game's clock ran
                                 ahead of its story; bookkeeper model)
     fixPeople(packet)        -> { people: [{ npcId, name, pronouns, role, look, voice,
                                 relationToNpcId, relation, homeLocationId }] }; packet from
                                 Upgrade.peoplePacket() (people the game made up, checked
                                 against what the story says about them; bookkeeper model)
   Models per role (Settings): the narrator model narrates, the parser model
   only parses, and the bookkeeper model does everything else (the
   bookkeeper, the chronicle and every Upgrade call).
   Any of them may instead resolve to a refusal { refused: true, role,
   category, explanation }, which the Pipeline turns into an in-feed notice.
   Failures throw ApiError with a player-facing message (err.detail holds the
   API's own words, shown in the debug view).
   Providers return { result, usage: <raw API usage>, model, refusal? };
   call() adds the usage to the turn and session totals.
   The real provider follows docs/API_NOTES.md exactly: structured outputs
   for JSON (never tools or tool_choice), SSE streaming for the narrator, no
   temperature/top_p/top_k/thinking, retry once after 1.5 s on network
   errors, 429, 500 and 529 and never on anything else. */
const Api = (() => {
  const ENDPOINT = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = '2026-10-21';
  const MAX_TOKENS = { narrator: 3000, parser: 2000, bookkeeper: 4000, chronicle: 2000, memories: 8000, places: 6000, clock: 3000, people: 6000 }; // thinking tokens count toward these
  const EFFORTS = ['low', 'medium', 'high'];
  const RETRY_DELAY_MS = 1500;
  const RETRY_STATUSES = [429, 500, 529];
  const RESPONSES_MAX = 20;
  const PRICES = { // USD per million tokens
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 }
  };
  /* SPEC.md section 10, word for word; the parser's prompt then adds a few
     sentences: a walk followed by an action there carries the destination
     (Pipeline moves the player first), a person named by role is never
     swapped for a listed person who does not match, and the packet's MODE
     line says whether the input is something done (do) or the player's
     exact words (say; the composer's Do / Say toggle), with one more for
     running off in do mode, and one on things the player does not carry
     (missingItem: the narrator then hears NOT CARRIED). Short and static:
     everything volatile goes in the user message as a labelled packet, and
     the lists that do not change turn to turn (the cast, the dead and the
     far away, the places out of town) follow the prompt as a cached system
     block (Pipeline.parserBlock; the bookkeeper's is
     Pipeline.bookkeeperBlock).
     MEMORY_RULES is the bookkeeper's memory rule; the memory rewrite
     (Upgrade) states it word for word, so an updated game holds the same
     kind of memory a new one records. PLACE_RULE is the bookkeeper's rule
     for placesRevealed (a place someone names that is not in the town
     yet), shared word for word with Upgrade's re-read of a saved game's
     story (SYSTEM.places); it sits before MEMORY_RULES so the bookkeeper's
     prompt still ends with the memory rules. */
  const PLACE_RULE = "Add a place to placesRevealed only when someone in the narration names a specific place in or near town that the player could walk to and that is not in the places list: a house, a shop, a spot by the river. Use the name they would use for it. Not for vague mentions, places far away, or places already listed.";
  const MEMORY_RULES = "A memory is only something this person would still hold against the player or thank them for later: an insult, a threat, a lie caught, a favour, a flirt or a compliment that lands, a promise, a debt, a gift, a fight, a secret shared. Ordinary talk, questions, small talk and the mechanics of a scene are not memories. At most one memory per person per turn, written as a short plain line from that person's point of view, under twelve words, with no scene detail (good: 'flirted with me', 'told me to fuck off', 'lied about car trouble to get Dewayne outside'). Weight 1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help).";
  const SYSTEM = {
    parser: "You convert a player's free-text action into structured data for a game engine. Use only the entity ids provided. If the player refers to something not in the lists, use `new:<short description>`. Decide whether the outcome is uncertain enough to need a roll. Never narrate. If the player goes somewhere and then does something there, set destinationId to that place and actionType to what they do there; the engine moves them first. Everyone who exists in this town is in the lists: EVERYONE IN TOWN, after these instructions, has the whole cast (the message says who is here and whom the player knows), and NOT IN TOWN the dead and the people who live elsewhere; a person the player names or describes, by name, by job or by who they are to someone (\"Dewayne's wife\"), is one of those ids, and `new:` is never used for a person; never substitute a listed person who does not match, and when nobody listed fits, leave them out of targets. The MODE line says how to read the input: in do mode it is what the player does, and any speech in it is incidental to the action; in say mode it is only the player's exact spoken words to whoever MODE names, so actionType is talk, persuade, deceive or intimidate, targets include whoever is spoken to, and destinationId is null. In do mode, running off or leaving with no place named is a move: set destinationId to the listed place that fits best. Set difficulty by how unlikely the person is to go along: an everyday request is easy or normal; something they would resist is hard; something against their stated stance, their nature or what they just refused is very_hard. The engine makes a success a success, so put the doubt into the difficulty, never into the outcome. The player has only what INVENTORY lists and what ITEMS HERE shows: when the action needs anything else (a knife to stab with, a gun, a car, a key, a tool), name it in missingItem, and use usesItemId only for a listed item. WORK ON OFFER HERE, when the message has it, is paid work here: if the player takes it or asks for it, actionType is work and targets holds its job id; the engine sets the roll, the pay and the time.",
    bookkeeper: "You record what changed in the game world after this turn. Use only the ids provided. Only record changes the narration actually shows. Be conservative: small attitude shifts (±5 to ±15) unless something major happened. " + PLACE_RULE + " At most one per turn. " + MEMORY_RULES,
    people: "You check the people a saved text RPG made up during play against what its story says about them. The game made each of them when the player first asked for them, sometimes from random tables before anything in the story was taken into account, so a record can contradict the story (someone the story calls a man's wife recorded as a man). For each person listed, return the record corrected to match the story: name (keep it unless the story calls this person something else), pronouns from how the story refers to them, a one-line role (who they are to someone, like \"Dewayne's wife\", or their job), a one-line look and a one-line voice (keep the old ones when nothing contradicts them, else make them fit), relationToNpcId and relation only when the story states them, and homeLocationId: the listed place the story says they live, else null. Who a person is comes from what the characters state about them (\"his wife Mavis\", \"my brother Earl\", \"that's my wife you hear in there\"), and a stated relation outranks everything else: a wife or a mother is she, a husband or a brother is he, otherwise they. The pronouns the narration itself used for this person are not evidence, and neither are the player's words: the narration followed the record you are checking, so a wrong record makes the story call a wife \"he\" for turns on end, and a player sometimes corrects the story the wrong way. A line from before they were named (\"his wife's gonna be thrilled when you knock\") counts when it is clearly about them. When this person calls a man their husband and another line calls them his wife, they are his wife, she. Never add anything the story does not support. Return every person listed, in the order given.",
    clock: "You check the clock of a saved text RPG against its story. The clock has four phases a day, in order: morning, afternoon, evening, night, then the next day's morning. In older versions of the game it could run ahead of the story, for example ticking into morning in the middle of a night scene. Read the last turns (oldest first, each stamped with the clock when it was narrated) and decide where the latest narration actually is in time. behind is true only when the story is clearly earlier than CLOCK NOW: the scene is still plainly in an earlier phase (lamps on, going to bed, nobody has slept yet, while the clock says morning). phase is the phase the latest narration takes place in. dayOffset is 0 when that phase is on the clock's day and -1 when it is the day before (the night before the clock's morning). When the story fits the clock, behind is false, phase is the clock's phase and dayOffset is 0. reason is one short sentence.",
    places: "You read the story so far of a saved text RPG and list the places people in it told the player about that the game does not have yet. " + PLACE_RULE + " List each place once, even if it comes up more than once. Choose nearId from the places list by what was said; when nothing says, use the player's current place. ownerNpcId is a listed person's id only when it is their home or business. The description is one sentence built only from what was said. turn is the TURN the mention comes from, or null when it comes from a summary. Return an empty list when there is nothing to add.",
    memories: "You bring the memories in a saved game up to the game's current rules. Each person listed remembers things about the player, written under older, looser rules: many are long play-by-play accounts of a scene. The current rules, which the game's bookkeeper follows for every new memory, are: \"" + MEMORY_RULES + "\" Rewrite each person's list to follow them. Keep only what this person would still hold against the player or thank them for; drop the rest (ordinary talk, questions, what they only saw, what they did themselves, the mechanics of a scene). Merge memories about the same thing into one line, and list in from the number of every memory a line comes from. At most 6 per person, the ones that matter most to them. Each line is short and plain, from that person's point of view (the player is the unnamed subject; the person is 'me'), under twelve words, with no scene detail. Weight 1 small, 2 notable, 3 serious. In the old lines the player may appear by name, as 'you' or as 'the player'. Never add anything their memories do not say. Return every person listed, with memories empty when nothing is worth keeping.",
    chronicle: "Summarise these 10 turns in under 80 words: what the player did, who they met, what changed, what's unresolved. Past tense, plain facts."
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
  const SCHEMAS = {
    parse_action: obj({
      actionType: { type: 'string', enum: ACTION_TYPES },
      summary: { type: 'string', description: 'One line restating the intended action' },
      targets: list(STR, 'Entity ids the action is aimed at, or new:<short description> for anything not in the lists'),
      destinationId: nullable(STR, 'The location id the player goes to this turn: for a move, or for an action done after walking there ("I head to the bar and ask..."); otherwise null'),
      needsRoll: { type: 'boolean', description: 'True only if the outcome is uncertain and failure would be interesting. Walking somewhere, ordinary talk and buying at listed prices never roll.' },
      stat: nullable({ type: 'string', enum: STATS }, 'The stat for the roll, or null when no roll'),
      difficulty: nullable({ type: 'string', enum: DIFFICULTIES }, 'The difficulty of the roll, or null when no roll'),
      usesItemId: nullable(STR, 'An inventory item id the action relies on, or null'),
      missingItem: nullable(STR, 'A thing the action needs that is not in INVENTORY and not lying here (a knife, a gun, a car, a key, a tool), named plainly; else null. usesItemId is for a listed item.'),
      timeCost: { type: 'string', enum: TIME_COSTS, description: 'instant: talking, looking, a quick thing. short: minutes to half an hour (walking across town, a search, a chore, a short drive). long: an hour or more. rest: sleep until morning.' },
      declaresWorldFact: { type: 'boolean', description: 'True if the player is asserting a fact about the world rather than acting' }
    }),
    record_changes: obj({
      attitudeChanges: list(obj({ npcId: STR, delta: INT, reason: STR })),
      newMemories: list(obj({ npcId: STR, text: { type: 'string', description: "Under twelve words, from this person's point of view, only for something they would hold against the player or thank them for later; no scene detail." }, weight: { type: 'integer', enum: [1, 2, 3], description: '1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help)' } })),
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
      clockNudges: list(obj({ factionId: STR, delta: { type: 'integer', enum: [-1, 1] } })),
      newSeeds: list(obj({
        cause: STR,
        effect: STR,
        trigger: obj({
          type: { type: 'string', enum: ['day', 'location', 'npc', 'clock'] },
          value: { type: 'string', description: 'day: a day number at least tomorrow; location: loc_ id; npc: npc_ id; clock: fac_id:segment' }
        })
      })),
      rumoursHeard: list(STR, 'Rumour ids the narration shows the player hearing'),
      placesRevealed: list(placeItem(), 'A specific place someone in the narration named that is not in LOCATIONS; at most one, usually none'),
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
        }), 'At most 6, oldest first; empty when nothing is worth keeping')
      }), 'Every person listed, in the order given')
    })
  };

  // ----- errors -----
  class ApiError extends Error {
    constructor(type, message, extra) { super(message); this.name = 'ApiError'; this.type = type; Object.assign(this, extra || {}); }
  }
  const FRIENDLY = {
    no_key: 'There is no API key yet. Add yours in Settings, or turn on mock mode to play offline.',
    invalid_request_error: 'The API rejected the request; that is a bug in the game. The details are in the debug view.',
    authentication_error: 'The API key was not accepted. Check the key in Settings.',
    permission_error: 'This API key is not allowed to do that. Check the key and the model names in Settings.',
    not_found_error: 'The API does not know that model. Check the model names in Settings.',
    request_too_large: 'The request was too large for the API.',
    rate_limit_error: 'The API is rate limiting this key. Wait a moment and try again.',
    api_error: 'The API had an internal error. Try again in a moment.',
    overloaded_error: 'The API is overloaded right now. Try again in a moment.',
    network: 'Could not reach the API. Check your connection and try again.',
    max_tokens: 'The reply was cut off before it finished. Try again.',
    bad_response: 'The API sent a reply the game could not read. Try again.',
    http: 'The API returned an unexpected error. Try again.'
  };
  const STATUS_TYPES = { 400: 'invalid_request_error', 401: 'authentication_error', 403: 'permission_error', 404: 'not_found_error', 413: 'request_too_large', 429: 'rate_limit_error', 500: 'api_error', 529: 'overloaded_error' };
  function httpError(status, payload, requestId) {
    const e = isObj(payload) && isObj(payload.error) ? payload.error : {};
    const type = STATUS_TYPES[status] || (typeof e.type === 'string' && FRIENDLY[e.type] ? e.type : 'http');
    return new ApiError(type, FRIENDLY[type] || FRIENDLY.http, { status, requestId: requestId || null, detail: cleanText(e.message, 1000) || null, retryable: RETRY_STATUSES.includes(status) });
  }

  // ----- usage and the debug ring -----
  function blankUsage() { return { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, cost: 0, priced: true, calls: 0 }; }
  /* turn and session totals; byRole: the session's totals per role and
     model ("parser claude-haiku-5-5"), so the Debug tab shows each role's
     cache reads and cost, the parser's and the bookkeeper's included. */
  const usage = { turn: blankUsage(), session: blankUsage(), byRole: {} };
  const responses = [];
  function addRaw(total, raw) {
    if (!isObj(raw)) return total;
    for (const k of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) total[k] = (total[k] | 0) + (raw[k] | 0);
    return total;
  }
  /* A model per role: the narrator, the parser, and the bookkeeper model for
     everything else (the bookkeeper, the chronicle and the Upgrade calls,
     which are the bookkeeper's judgement applied to an old game). */
  function roleModel(role) { const s = Storage.settings(); return role === 'narrator' ? s.narratorModel : role === 'parser' ? s.parserModel : s.bookkeeperModel; }
  /* The memory rewrite, the places re-read and the clock check (Upgrade) are the bookkeeper's judgement applied to an old game, so they think at the bookkeeper's effort. */
  const EFFORT_OF = { memories: 'bookkeeper', places: 'bookkeeper', clock: 'bookkeeper', people: 'bookkeeper' };
  function roleEffort(role) { const e = Storage.settings().effort || {}; const k = EFFORT_OF[role] || role; return EFFORTS.includes(e[k]) ? e[k] : 'low'; }
  function headers(apiKey) {
    return { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'anthropic-dangerous-direct-browser-access': 'true' };
  }
  /* No temperature/top_p/top_k, no thinking, no tools or tool_choice, never a
     trailing assistant message. JSON comes from output_config.format.
     A cached system prompt is a list of text blocks: the role's prompt,
     then its further blocks (opts.blocks). cache true (the narrator) puts a
     breakpoint on every block, so its style block stays cached on its own
     when the cast changes. cache 'last' (the parser and the bookkeeper)
     puts one on the last block only: their prompts are close to or under
     the 512-token minimum on their own, so prompt and lists are cached
     together as one prefix, and nothing is padded. Without blocks the
     prompt stays a plain string. */
  function requestBody(role, opts) {
    opts = opts || {};
    const body = { model: roleModel(role), max_tokens: opts.maxTokens || MAX_TOKENS[role] || 1500, messages: [{ role: 'user', content: String(opts.user || '') }] };
    if (opts.system) {
      const texts = [opts.system].concat(Array.isArray(opts.blocks) ? opts.blocks.filter(b => typeof b === 'string' && b) : []);
      const block = (text, cached) => (cached ? { type: 'text', text, cache_control: { type: 'ephemeral' } } : { type: 'text', text });
      if (opts.cache === true) body.system = texts.map(text => block(text, true));
      else if (opts.cache === 'last' && texts.length > 1) body.system = texts.map((text, i) => block(text, i === texts.length - 1));
      else body.system = opts.system;
    }
    body.output_config = { effort: roleEffort(role) };
    if (opts.schema) body.output_config.format = { type: 'json_schema', schema: opts.schema };
    if (opts.stream) body.stream = true;
    return body;
  }
  function costOf(model, u) {
    const p = PRICES[model];
    if (!p) return null;
    return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheCreation * p.input * 1.25) / 1e6;
  }
  function record(model, raw, role) {
    const u = { input: raw.input_tokens | 0, output: raw.output_tokens | 0, cacheRead: raw.cache_read_input_tokens | 0, cacheCreation: raw.cache_creation_input_tokens | 0 };
    const spent = u.input + u.output + u.cacheRead + u.cacheCreation > 0;
    const c = costOf(model, u);
    const key = `${role || 'call'} ${model || 'unknown'}`;
    const byRole = usage.byRole[key] || (usage.byRole[key] = blankUsage());
    for (const b of [usage.turn, usage.session, byRole]) {
      b.input += u.input; b.output += u.output; b.cacheRead += u.cacheRead; b.cacheCreation += u.cacheCreation; b.calls += 1;
      if (c === null) { if (spent) b.priced = false; } else b.cost += c;
    }
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
    if (err) State.debugLog.push({ turn: State.current ? State.current.meta.turn : 0, kind: 'api', role, status: info.status || null, requestId: info.requestId || null, reason: `${err.type}: ${err.detail || err.message}` });
  }
  function refusalOf(details) {
    const d = isObj(details) ? details : {};
    return { category: typeof d.category === 'string' ? d.category : null, explanation: typeof d.explanation === 'string' ? d.explanation : null };
  }

  // ----- mock provider -----
  /* Deterministic stand-ins, good enough to run the acceptance tests offline:
     a keyword parser, two or three plain sentences of narration built from
     the turn context (always naming the roll tier and any complication), and
     small, rule-based bookkeeping. Every mock narration is tagged in the
     feed. Tests can queue canned replies per method (first in, first out):
       Mock.queue('parse', { needsRoll: true, stat: 'wits' })   merged over the keyword result
       Mock.queue('narrate', 'Exact text.')  or { text, stopReason, delay }
                                       (delay: hold the reply that many ms before it streams;
                                        without text, the usual mock narration)
       Mock.queue('bookkeep', { goldDelta: 5 })                  merged over the default diff
       Mock.queue('chronicle', 'Summary.')
       Mock.queue('rewriteMemories', { people: [...] })         instead of the rule-based rewrite
       Mock.queue('revealPlaces', { placesRevealed: [...] })     instead of the rule-based re-read
       Mock.queue('checkClock', { behind, phase, dayOffset, reason })  instead of the rule-based check
       Mock.queue('fixPeople', { people: [...] })                instead of the rule-based check of people
       Mock.queue(any, { refusal: true })      a refusal (stop_reason "refusal")
       Mock.queue(any, { error: { type, message } })   throws ApiError
     Mock.calls lists every call ({ method, text, input, mode }). */
  const MOCK_ZERO = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  /* People and things the mock treats as `new:` targets when nobody in the
     scene answers to them: low-fantasy and modern-day nouns alike. */
  const MOCK_NEW = [
    [/\bdragons?\b/, 'dragon'], [/\bwizards?\b/, 'wizard'], [/\bbarmaids?\b/, 'barmaid'], [/\bserving girls?\b/, 'serving girl'],
    [/\bstable ?boys?\b/, 'stable boy'], [/\bbartenders?\b/, 'bartender'], [/\bwaitress(es)?\b/, 'waitress'], [/\bclerks?\b/, 'clerk'],
    [/\bmechanics?\b/, 'mechanic'], [/\bdeput(y|ies)\b/, 'deputy'], [/\bmy cousin\b/, 'my cousin']
  ];
  const MOCK_TIER = {
    critical: r => `${capFirst(r.stat)} roll, critical success: it works, and better than planned.`,
    success: r => `${capFirst(r.stat)} roll, success: it works.`,
    partial: r => `${capFirst(r.stat)} roll, partial success: it works, but ${r.complication}.`,
    failure: r => `${capFirst(r.stat)} roll, failure: it does not work, and ${r.complication}.`,
    critical_failure: r => `${capFirst(r.stat)} roll, critical failure: it goes badly wrong, and ${r.complication}.`
  };
  function mockDestination(lower, packet) {
    const cands = [].concat(packet.exits || [], packet.knownLocations || []);
    for (const l of cands) {
      const nm = String(l.name || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^the /, '');
      if (nm && lower.includes(nm)) return l.id;
    }
    // "I go to Dewayne's" for Dewayne's house: the possessive alone, at the end of a phrase.
    for (const l of cands) {
      const m = /^(.+'s) (house|home|place)$/.exec(String(l.name || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^the /, ''));
      if (m && new RegExp(`(^|[^a-z])${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s*([.,!?]|$))`).test(lower.trim())) return l.id;
    }
    const hit = placeByPhrase(lower, cands);
    return hit ? hit.id : null;
  }
  const MOCK_GO = /\b(go|goes|walk|walks|head|heads|run|return|cross|enter|drive|drives|ride|make my way)\b/;
  /* Running off with no place named (Do mode): out through the first open exit. */
  const MOCK_FLEE = /\b(run|runs|get|gets|hurry|hurries|walk|walks)\s+away\b|\b(run|runs)\s+off\b|\b(flee|flees|bolt|bolts)\b/;
  /* Say mode: words that threaten or insult, and words that plead or bargain. */
  const MOCK_THREAT = /\b(idiot|moron|crook|liar|coward|fool|shut up|get lost|back off|or else|i'll hurt|i will hurt|you'll regret|you will regret)\b/;
  const MOCK_PLEA = /\b(please|trust me|come on|you should|you ought to|help me out|give me a chance|i'll pay|i can pay|how about)\b/;
  /* "I head to the bar and ask the bartender for a drink": a walk to a known
     place ("and", "then" or "and then"), then something done there. Every
     split point is tried in turn, so a place whose name has "and" in it
     still counts. Returns { dest, rest } or null. */
  function mockCompound(input, packet) {
    const text = String(input || '').replace(/[’]/g, "'");
    const re = /[\s,]+(?:and then|and|then)\s+/gi;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const left = ' ' + text.slice(0, m.index).toLowerCase() + ' ';
      const rest = text.slice(m.index + m[0].length).trim().replace(/^i\s+/i, '');
      if (!rest || !MOCK_GO.test(left)) continue;
      const dest = mockDestination(left, packet);
      if (dest) return { dest, rest };
    }
    return null;
  }
  /* Taking or asking for paid work (direction change 16): "I work a shift",
     "I ask Dewayne for work", "hire me", "deal me in". Only in Do mode and
     only with work on offer here (packet.jobs); a walk and then work there
     ("I head to the landing and ask for a job") cannot see the place's jobs,
     so it is work with no job id and the engine finds the job there. Asking
     what work there is, or persuading someone, stays talk. */
  const MOCK_WORK = /\b(work (?:a|an|the|for)\b|working for|take (?:a|the) (?:shift|job|work)\b|(?:a|the|that) (?:shift|job)\b|hire me|deal me in|for work|any work)/;
  /* The mock parser's ear for a thing an action needs (MOCK_NEEDS), checked against the inventory by name (Pipeline.carriedAs). */
  const MOCK_NEEDS = [[/\b(stab|stabs|stabbing|knife|blade)\b/, 'knife'], [/\b(shoot|shoots|shooting|gun|pistol|rifle)\b/, 'gun'], [/\b(drive|drives|driving)\b/, 'car']];
  function carriedAs(name, thing) { return Pipeline.carriedAs(name, thing); }
  function mockParse(packet) {
    const input = String(packet.input || '');
    const lower = ' ' + input.toLowerCase().replace(/[’]/g, "'") + ' ';
    const has = re => re.test(lower);
    const out = { actionType: 'other', summary: cleanText(input, 160), targets: [], destinationId: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'short', declaresWorldFact: false };
    // A thing the action plainly needs: the inventory item that answers to it (usesItemId), else missingItem.
    for (const [re, thing] of MOCK_NEEDS) {
      if (!re.test(lower)) continue;
      const item = (packet.inventory || []).find(i => carriedAs(i.name, thing));
      if (item) out.usesItemId = item.id; else out.missingItem = thing;
      break;
    }
    const roll = (stat, difficulty) => { out.needsRoll = true; out.stat = stat; out.difficulty = difficulty; };
    const presentList = packet.present || [];
    const isHere = n => presentList.some(p => p.id === n.id);
    const people = [].concat(presentList, (packet.knownNpcs || []).filter(k => !isHere(k)));
    /* MODE say: the input is only the player's words, to the addressee or to
       everyone here. Nobody moves and nothing new is looked for; the words
       decide talk, persuade (a roll) or intimidate. */
    const sp = packet.speech;
    if (sp && sp.mode === 'say') {
      out.timeCost = 'instant';
      out.targets = sp.to === 'everyone' ? presentList.map(n => n.id) : [sp.to];
      if (has(MOCK_THREAT)) out.actionType = 'intimidate';
      else if (has(MOCK_PLEA)) { out.actionType = 'persuade'; roll('charm', 'normal'); }
      else out.actionType = 'talk';
      return out;
    }
    /* A walk and then an action there: the action is parsed from the part
       after the walk, with nobody assumed present at the destination (the
       people here count as known elsewhere), and carries the destination;
       Pipeline moves the player there first. A walk on to somewhere else is
       left to the plain move below. */
    if (packet.mode !== 'fact' && !packet.inner) {
      const c = mockCompound(input, packet);
      const inner = c ? mockParse(Object.assign({}, packet, { input: 'I ' + c.rest, inner: true, present: [], knownNpcs: people, itemsHere: [], jobs: [] })) : null;
      if (inner && inner.actionType !== 'move') {
        return Object.assign(inner, { summary: out.summary, destinationId: c.dest, timeCost: inner.timeCost === 'instant' ? 'short' : inner.timeCost });
      }
    }
    // Work on offer here, taken or asked for: the job whose giver or label the words name, else the first.
    const jobs = Array.isArray(packet.jobs) ? packet.jobs : [];
    if (packet.mode !== 'fact' && (jobs.length || packet.inner) && has(MOCK_WORK) && !has(/\b(persuade|persuades|convince|convinces)\b/)) {
      const score = j => String(j.label).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4 && lower.includes(w)).length + (j.giverName && lower.includes(j.giverName.split(/\s+/)[0].toLowerCase()) ? 2 : 0);
      const pick = jobs.slice().sort((x, y) => score(y) - score(x))[0];
      return Object.assign(out, { actionType: 'work', targets: pick ? [pick.id] : [], timeCost: 'long' });
    }
    const all = people.filter(n => Town.mentions(lower, n));
    // Someone in the cast the player has not met yet, named as a name ("I ask for Mavis"): capitalised as written, and not a surname that is part of a place's name.
    const placeWords = new Set([].concat(packet.knownLocations || [], packet.exits || []).flatMap(l => String(l.name || '').split(/[^A-Za-z]+/)).concat(String(packet.townName || '').split(/[^A-Za-z]+/)).filter(Boolean));
    const castNamed = (packet.cast || []).filter(n => !people.some(p => p.id === n.id) && String(n.name || '').split(/\s+/)
      .some(w => w.length >= 3 && !placeWords.has(w) && new RegExp(`(^|[^A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(input)));
    all.push(...castNamed);
    /* Who the text names. Anyone here answers to their name or role; someone
       who is not here only to their name, or to a role nobody else in the
       lists answers to ("the cook"), so a shared word ("the owner") picks
       the person in front of the player. /fact links whatever it names. */
    const byName = n => Town.nameMentions(lower, n);
    const roleOnly = all.filter(n => !byName(n));
    const named = packet.mode === 'fact' ? all
      : all.filter(n => byName(n) || isHere(n) || (!roleOnly.some(isHere) && roleOnly.length === 1));
    const fresh = [];
    for (const [re, desc] of MOCK_NEW) {
      if (!re.test(lower)) continue;
      const head = Town.headPhrase(desc, 'npc');
      if (named.some(n => Town.mentions(' ' + head + ' ', n))) continue;
      fresh.push('new:' + desc);
    }
    if (packet.mode === 'fact') {
      out.declaresWorldFact = true;
      out.timeCost = 'instant';
      if (!named.length && !fresh.length) {
        const m = /^\s*((?:the|a|an|my)\s+[a-z' -]+?)\s+(?:is|are|was|lives|owes|works|keeps|knows|has|runs|hides|sells)\b/i.exec(input);
        if (m) fresh.push('new:' + m[1].trim().toLowerCase());
      }
      out.targets = named.map(n => n.id).concat(fresh);
      return out;
    }
    if (has(/\bmy cousin\b/)) out.declaresWorldFact = true;
    const present = presentList.filter(n => named.some(m => m.id === n.id));
    const away = named.filter(n => !isHere(n));
    // Talking with nobody named: whoever is in front of the player. Someone
    // named who is not here, or someone new, is the target instead.
    const target = () => (present.length ? [present[0].id] : (fresh.length || away.length) ? [] : (presentList[0] ? [presentList[0].id] : []));
    const dest = has(MOCK_GO) ? mockDestination(lower, packet) : null;
    /* A thing, not a person: looking for one ("I look for some rope") may turn
       it up here (new:), and picking one up ("I pick up the rope") takes the
       item lying here by its id. */
    const seek = /\b(?:look|looks|search|searches|hunt|hunts|rummage|rummages)\s+(?:around\s+)?for\s+(.+?)[\s.!?]*$/.exec(lower);
    const grab = /\b(?:pick|picks)\s+up\s+(.+?)[\s.!?]*$/.exec(lower);
    const thing = (seek || grab) && !named.length && !fresh.length ? (seek || grab)[1].trim() : null;
    const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lying = thing ? (packet.itemsHere || []).find(i => new RegExp(`(^|[^a-z])${escRe(i.name.toLowerCase())}([^a-z]|$)`).test(thing)) : null;
    if (thing && seek) { out.actionType = 'search'; out.timeCost = 'short'; }
    else if (thing) { out.actionType = 'take'; out.timeCost = 'instant'; }
    else if (has(/^\s*(i\s+)?(look|examine|glance|listen|study the)\b/) && !has(/\b(try|tries|attempt)\b/)) { out.actionType = 'look'; out.timeCost = 'instant'; }
    else if (has(/\b(rest|sleep|nap)\b/)) { out.actionType = 'rest'; out.timeCost = 'rest'; }
    else if (has(/\bwait\b/)) { out.actionType = 'wait'; out.timeCost = 'long'; }
    else if (dest) { out.actionType = 'move'; out.destinationId = dest; out.timeCost = 'short'; }
    else if (has(MOCK_FLEE)) {
      const exit = (packet.exits || []).find(x => !x.closed);
      out.actionType = 'move'; out.destinationId = exit ? exit.id : null; out.timeCost = 'short';
    }
    else if (has(/\b(attack|attacks|hit|hits|fight|fights|punch|punches|stab|shoot|shoots|swing at|brawl)\b/)) { out.actionType = 'attack'; roll('might', 'hard'); out.targets = target(); }
    else if (has(/\b(sneak|creep|pick|picks|steal|steals|pickpocket|lift a purse)\b/)) { out.actionType = has(/\b(steal|steals|pickpocket|lift a purse)\b/) ? 'steal' : has(/\b(sneak|creep)\b/) ? 'sneak' : 'use'; roll('stealth', 'normal'); }
    else if (has(/\b(persuade|persuades|convince|convinces|talk \w+ into)\b/)) { out.actionType = 'persuade'; roll('charm', 'normal'); out.targets = target(); out.timeCost = 'instant'; }
    else if (has(/\b(insult|insults|mock|mocks|sneer at|curse at)\b/)) { out.actionType = 'intimidate'; out.targets = target(); out.timeCost = 'instant'; }
    else if (has(/\b(buy|buys|purchase|pay for)\b/)) { out.actionType = 'buy'; out.targets = present.map(n => n.id); }
    else if (has(/\b(talk|talks|ask|asks|say|says|tell|tells|greet|greets|chat|speak)\b/)) { out.actionType = 'talk'; out.timeCost = 'instant'; out.targets = target(); }
    else if (has(/\b(try|tries|attempt|attempts)\b/)) {
      if (has(/\b(climb|force|lift|break|swim|push|pull|carry)\b/)) roll('might', 'normal');
      else if (has(/\b(charm|haggle|lie|bluff|flatter)\b/)) { roll('charm', 'normal'); out.actionType = 'deceive'; }
      else { roll('wits', 'normal'); out.actionType = 'search'; }
    }
    // A move names someone who is not here only by their name.
    for (const n of named) if (!out.targets.includes(n.id) && (out.actionType !== 'move' || isHere(n) || byName(n))) out.targets.push(n.id);
    for (const f of fresh) if (!out.targets.includes(f)) out.targets.push(f);
    if (thing) out.targets.push(lying ? lying.id : 'new:' + thing);
    return out;
  }
  function mockGreeting(n) {
    const a = n.attitude | 0;
    if (a <= -60) return `${n.name} turns away and will not look at you.`;
    if (a <= -25) return `${n.name} gives you a cold look. "What now?"`;
    if (a < -5) return `${n.name} eyes you warily.`;
    if (a <= 5) return `${n.name} hears you out.`;
    if (a < 60) return `${n.name} greets you with a nod.`;
    return `${n.name} greets you warmly.`;
  }
  /* Say mode: the one spoken to answers first (with everyone, the first
     person here); anyone else here may react. */
  function mockReply(c) {
    const sp = c.speech;
    const a = c.action || {};
    const here = (c.present || []).map(p => State.npc(p.id)).filter(Boolean);
    const to = sp.to === 'everyone' ? here : here.filter(n => n.id === sp.to);
    if (!to.length) return [here.length ? `${sp.toName || 'Whoever you meant'} is not here to hear it.` : 'Nobody is here to hear it.'];
    const first = to[0];
    const lines = [sp.to === 'everyone'
      ? `${joinAnd(to.map(n => n.name))} ${to.length > 1 ? 'hear' : 'hears'} you, and ${first.name} answers first.`
      : `${first.name} answers you first.`];
    if (c.rumour && c.rumour.npcId === first.id) lines.push(`${first.name} mentions something: "${c.rumour.text}"`);
    if (a.actionType === 'intimidate') lines.push((first.attitude | 0) <= -25 ? `${first.name} has heard enough. "Get out of my sight."` : `${first.name} goes still. "Say that again."`);
    else lines.push(mockGreeting(first));
    const others = here.filter(n => !to.includes(n));
    if (others.length) lines.push(`${joinAnd(others.map(n => n.name))} ${others.length > 1 ? 'look' : 'looks'} over.`);
    return lines;
  }
  function mockNarration(c) {
    const s = State.current;
    const a = c.action || {};
    const loc = String(c.locationName || (c.location && c.location.name) || 'this place').replace(/^The /, 'the ');
    const mode = c.mode || 'normal';
    const out = [];
    if (c.timePassed && mode !== 'arrival') out.push(sentence(c.timePassed.replace(/^the player\b/i, 'you').replace(/\bthey are\b/g, 'you are')));
    // A walk before the action (Pipeline's walkFirst): one short sentence, first.
    if (c.moved) out.push(`You walk over to ${String(c.moved.toName).replace(/^The /, 'the ')}.`);
    const np = c.notPresent || [];
    const missing = np.filter(x => x.reason === 'does_not_exist' || x.reason === 'unproven').map(x => x.label);
    if (missing.length) out.push(`There is no ${missing.join(' and no ')} here.`);
    const away = np.filter(x => x.reason === 'not_here' || x.reason === 'gone');
    if (away.length) out.push(`${away[0].label} is not here.`);
    if (c.roll) out.push(MOCK_TIER[c.roll.tier] ? MOCK_TIER[c.roll.tier](c.roll) : `${capFirst(c.roll.stat)} roll: ${c.roll.label}.`);
    if (c.pressed) out.push('The answer does not change.');
    if (c.granted) out.push(`${c.granted.name || 'They'} already said yes.`);
    // Work (direction change 16): what it was and the money; a fight that came to the player and how it went.
    if (c.job) out.push(mockJob(c.job));
    if (c.attacked) out.push(mockAttacked(c.attacked));
    if (c.sceneChange) {
      const names = ids => ids.map(id => { const n = State.npc(id); return n ? n.name : id; });
      if (c.sceneChange.arrived.length) out.push(`${joinAnd(names(c.sceneChange.arrived))} ${c.sceneChange.arrived.length > 1 ? 'arrive' : 'arrives'}.`);
      if (c.sceneChange.left.length) out.push(`${joinAnd(names(c.sceneChange.left))} ${c.sceneChange.left.length > 1 ? 'have' : 'has'} left.`);
    }
    if (c.defeated) out.push('You go down hard.');
    if (c.consequence) out.push(sentence(c.consequence.replace(/\s*\([^)]*\)$/, '')));
    const target = s && (a.targets || []).map(id => State.npc(id)).find(n => n && (c.presentIds || []).includes(n.id));
    if (c.beat) {
      const names = (c.present || []).map(n => n.name);
      out.push(names.length ? `You wait. ${joinAnd(names)} ${names.length > 1 ? 'carry' : 'carries'} on, and ${names[0]} speaks first: "Well?"` : 'You wait. Nothing happens for a while.');
    } else if (mode === 'arrival' || a.actionType === 'look') {
      const l = s && c.location ? State.loc(c.location.id) : null;
      out.push(mode === 'arrival' ? `You arrive at ${loc}.` : `You take in ${loc}.`);
      if (l && l.description) out.push(l.description);
      const names = (c.present || []).map(n => n.name);
      out.push(names.length ? `${joinAnd(names)} ${names.length > 1 ? 'are' : 'is'} here.` : 'Nobody here pays you any attention.');
    } else if (isSay(c.speech)) {
      out.push(...mockReply(c));
    } else if (a.actionType === 'move') {
      const d = c.destination;
      out.push(d ? `You make your way to ${d.name.replace(/^The /, 'the ')}${d.closed ? ', but it is shut' : ''}.` : 'You look for the way there and do not find it.');
      if (d && !d.closed) out.push(d.present && d.present.length ? `${joinAnd(d.present)} ${d.present.length > 1 ? 'are' : 'is'} there.` : 'Nobody there pays you any attention.');
    } else if (target && a.actionType === 'attack') {
      out.push(`${target.name} ${c.roll && c.roll.success ? 'staggers back' : 'fights back'}.`);
    } else if (target && a.actionType === 'intimidate') {
      out.push((target.attitude | 0) <= -25 ? `${target.name} has heard enough. "Get out of my sight."` : `${target.name} goes still. "Say that again."`);
    } else if (target) {
      out.push(mockGreeting(target));
      if (c.rumour && c.rumour.npcId === target.id) out.push(`${target.name} mentions something: "${c.rumour.text}"`);
    } else if (a.actionType === 'buy') {
      out.push('The deal is done quickly.');
    } else if (a.actionType === 'take') {
      const it = s && (a.targets || []).filter(id => /^item_/.test(id)).map(id => State.entityById(id)).find(Boolean);
      if (it) out.push(`You pick up the ${lowerFirst(it.name)}.`);
    }
    for (const made of (c.created || []).filter(x => x.kind === 'npc')) out.push(`${capFirst(article(made.role))} ${made.role} called ${made.name} is here.`);
    for (const made of (c.created || []).filter(x => x.kind === 'item' && !x.carried)) out.push(`You find ${article(made.name)} ${lowerFirst(made.name)} here.`);
    // Due events (at most two) are always worked in, at the end.
    let due = (c.due || []).slice(0, 2).map(d => sentence(d && d.text)).filter(Boolean);
    if (!out.length && !due.length) out.push(`At ${loc}, nothing pushes back yet.`);
    if (out.length + due.length < 2) out.push(`Around you, ${loc} goes on with its ${(s && s.time.phase) || 'day'}.`);
    let body = out.slice(0, Math.max(1, (mode === 'normal' ? (c.moved ? 4 : 3) : 6) - due.length));
    /* Keep to the style check's limit (Style.WORD_LIMITS) like a real
       narrator would: a place's description shrinks to its first sentence
       and then goes, other scenery goes from the end, and only then are the
       due events cut to their first clause. The roll stays. */
    const limit = (mode === 'normal' ? Style.WORD_LIMITS.normal : Style.WORD_LIMITS.zoom) - 5;
    const words = () => wordCount(body.concat(due).join(' '));
    const desc = s && c.location ? (State.loc(c.location.id) || {}).description : null;
    const keep = new Set(body.filter(x => /\broll[,:]/.test(x) || x === 'You go down hard.' || x.includes(' mentions something: ') || (c.job && x === mockJob(c.job)) || (c.attacked && x === mockAttacked(c.attacked))));
    const at = desc ? body.indexOf(desc) : -1;
    if (words() > limit && at >= 0) body[at] = (/^.*?[.!?](\s|$)/.exec(desc) || [desc])[0].trim();
    if (words() > limit && at >= 0) body.splice(at, 1);
    for (let i = body.length - 1; i > 0 && words() > limit; i--) if (!keep.has(body[i])) body.splice(i, 1);
    if (words() > limit) due = due.map(t => sentence(t.split(/,\s+/)[0]));
    if (words() > limit) {
      const room = Math.max(4, Math.floor((limit - wordCount(body.join(' '))) / Math.max(1, due.length)));
      due = due.map(t => (wordCount(t) > room ? t.split(/\s+/).slice(0, room).join(' ').replace(/[,;:.]$/, '') + '.' : t));
    }
    return body.concat(due).join(' ');
  }
  function joinAnd(list) { return list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`; }
  function mockJob(j) {
    const m = money(Math.abs(j.paid));
    return `You put in ${j.label} ${j.stake ? 'with' : 'for'} ${j.giverName}: ${j.paid > 0 ? `${j.stake ? 'you win' : 'paid'} ${m}` : j.paid < 0 ? `you lose ${m}` : 'nothing paid'}.`;
  }
  function mockAttacked(x) {
    const ok = x.roll && x.roll.success;
    return `${x.name} comes at you${x.roll ? `; might roll, ${x.roll.label.toLowerCase()}` : ''}: ${ok ? 'you hold your own' : 'you get the worst of it'}.`;
  }
  /* The memory rewrite (Upgrade), by rule: keep weight 2 and up, cut each
     line to its first twelve words, merge lines that come out the same (from
     lists them all), and keep at most six per person (the heaviest, then the
     newest), in their original order. */
  function mockRewrite(packet) {
    return {
      people: (packet.people || []).map(p => {
        const lines = [];
        for (const m of p.memories || []) {
          if (!(m.weight >= 2)) continue;
          const text = String(m.text || '').split(/\s+/).filter(Boolean).slice(0, 12).join(' ').replace(/[,;:.]+$/, '');
          const same = lines.find(x => x.text.toLowerCase() === text.toLowerCase());
          if (same) { same.from.push(m.n); same.weight = Math.max(same.weight, m.weight); } else lines.push({ from: [m.n], text, weight: m.weight, at: lines.length });
        }
        const keep = lines.slice().sort((a, b) => b.weight - a.weight || b.at - a.at).slice(0, 6);
        return { npcId: p.npcId, memories: lines.filter(x => keep.includes(x)).map(x => ({ from: x.from, text: x.text, weight: x.weight })) };
      })
    };
  }
  /* The mock's ear for a home someone names: a quoted line with a listed
     person's possessive name followed by "house" or "place" ("Dewayne's is
     the white house about a mile up the river road"), or with opts.lives
     their name and "lives", that names no place already in town (a road or
     a street is the way there, not a place). Resolves
     to that person's house as a placesRevealed entry, or null. */
  const ROUTE_TYPES = ['road', 'highway', 'street'];
  function mockHomeFrom(text, opts) {
    const s = State.current;
    if (!s) return null;
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const quotes = String(text || '').replace(/[’‘]/g, "'").match(/“[^”]+”|"[^"]+"/g) || [];
    for (const raw of quotes) {
      const q = raw.slice(1, -1).trim();
      const lower = q.toLowerCase();
      // A road or a street is the way there ("up the river road"), not the place; a place out of town is not a place in town.
      const known = s.locations.some(l => { if (l.away === true || ROUTE_TYPES.includes(l.type)) return false; const c = State.mapPointOf(l); return [l.name, c && c.label].some(k => k && lower.includes(k.toLowerCase().replace(/^the /, ''))); });
      if (!q || known) continue;
      for (const n of s.npcs) {
        if (n.alive === false || (n.home && isObj((State.loc(n.home.locationId) || {}).revealed))) continue;
        const toks = Array.from(new Set([n.name].concat(String(n.name || '').split(/\s+/)).map(t => t.toLowerCase()).filter(t => t.length >= 3)));
        const hit = toks.some(t => new RegExp(`(^|[^a-z])${esc(t)}'s\\b.*\\b(house|place)\\b`).test(lower)
          || (opts && opts.lives && new RegExp(`(^|[^a-z])${esc(t)}\\b`).test(lower) && /\blives\b/.test(lower)));
        if (!hit) continue;
        return { name: `${String(n.name).split(/\s+/)[0]}'s house`, type: 'house', description: sentence(cleanText(q, 240)), nearId: (opts && opts.nearId) || s.player.locationId, ownerNpcId: n.id, kind: 'home' };
      }
    }
    return null;
  }
  /* Upgrade's re-read of a saved game's story, by rule: every home the
     mock's ear (mockHomeFrom) hears in a log narration, once per person,
     reached from where the player is now, dated to that turn. */
  function mockRevealPlaces(packet) {
    const out = [];
    for (const e of packet.entries || []) {
      if (e.kind !== 'turn') continue;
      const p = mockHomeFrom(e.narration, { nearId: packet.locationId });
      if (p && !out.some(x => x.ownerNpcId === p.ownerNpcId)) out.push(Object.assign(p, { turn: e.turn }));
    }
    return { placesRevealed: out };
  }
  /* Upgrade's clock check, by rule: a clock at morning whose last narration
     has a lamp, a bed or bedroom, "night" or "tonight" in it is behind, at
     the night before; anything else fits the clock. */
  function mockCheckClock(packet) {
    const t = isObj(packet.time) ? packet.time : {};
    const entries = Array.isArray(packet.entries) ? packet.entries : [];
    const last = entries.length ? String(entries[entries.length - 1].narration || '') : '';
    if (t.phase === 'morning' && /\b(lamps?|beds?|bedrooms?|night|tonight)\b/i.test(last)) {
      return { behind: true, phase: 'night', dayOffset: -1, reason: 'The last scene is still at night (mock rule).' };
    }
    return { behind: false, phase: PHASES.includes(t.phase) ? t.phase : PHASES[0], dayOffset: 0, reason: 'The story fits the clock (mock rule).' };
  }
  /* Upgrade version 5's check of people the game made up, by rule: for each
     person, pronouns from the words near their name in what the story says
     ("his wife Mavis", "she"), a relation from a phrase like "Dewayne's
     wife Mavis", "his wife Mavis" (whose: the nearest listed person named
     before it) or "Mavis, Dewayne's wife", and then the role "Dewayne's
     wife" and the home of that person if they share it. A look built on
     the other pronoun's words ("A man with ... about them") is turned
     around (turnLook). Everything else is kept. */
  function mockFixPeople(packet) {
    const s = State.current;
    const esc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const listed = (packet.everyone || []).filter(x => x && x.name);
    const out = [];
    for (const p of packet.people || []) {
      const first = String(p.name || '').split(/\s+/)[0];
      const texts = (p.mentions || []).map(m => String(m.text || '').replace(/[’‘]/g, "'"));
      const nameRe = new RegExp(`(^|[^A-Za-z])${esc(first)}(?![A-Za-z])`, 'g');
      // Pronouns: the words around each mention of the name.
      const near = [];
      for (const t of texts) for (let m = nameRe.exec(t); m; m = nameRe.exec(t)) near.push(t.slice(Math.max(0, m.index - 40), m.index + first.length + 60));
      const said = inferPronouns(near.join(' '));
      let relTo = null;
      let relation = null;
      for (const t of texts) {
        const pats = [
          new RegExp(`\\b([A-Z][a-z]+)'s\\s+([a-z]+),?\\s+${esc(first)}\\b`),
          new RegExp(`\\b(?:his|her|my)\\s+([a-z]+),?\\s+${esc(first)}\\b`, 'i'),
          new RegExp(`\\b${esc(first)},\\s+([A-Z][a-z]+)'s\\s+([a-z]+)\\b`)
        ];
        let m = pats[0].exec(t);
        if (m) { relTo = listed.find(x => x.id !== p.npcId && x.name.split(/\s+/)[0] === m[1]) || null; relation = m[2]; }
        if (!relTo && (m = pats[2].exec(t))) { relTo = listed.find(x => x.id !== p.npcId && x.name.split(/\s+/)[0] === m[1]) || null; relation = m[2]; }
        if (!relTo && (m = pats[1].exec(t))) {
          // Whose: the nearest listed person named before the phrase.
          const before = t.slice(0, m.index);
          let best = null;
          for (const x of listed) {
            if (x.id === p.npcId) continue;
            const at = before.lastIndexOf(x.name.split(/\s+/)[0]);
            if (at >= 0 && (!best || at > best.at)) best = { x, at };
          }
          if (best) { relTo = best.x; relation = m[1].toLowerCase(); }
        }
        if (relTo && Town.guessKind(relation) === 'npc') break;
        relTo = null;
        relation = null;
      }
      // What the story states about them (a relation) outranks the pronouns the narration used for them.
      let pronouns = relation ? inferPronouns(relation) : 'they';
      if (pronouns === 'they') pronouns = said;
      if (pronouns === 'they') pronouns = validPronouns(p.pronouns) || 'they';
      const owner = relTo && s ? State.npc(relTo.id) : null;
      const home = owner && HOUSEHOLD_RELATIONS.includes(relation) ? State.homeOf(owner) : null;
      out.push({
        npcId: p.npcId, name: p.name, pronouns,
        role: owner ? `${owner.name.split(/\s+/)[0]}'s ${relation}` : p.role,
        look: pronouns !== p.pronouns ? turnLook(p.look, pronouns) : p.look,
        voice: p.voice || '',
        relationToNpcId: owner ? owner.id : (p.relationToNpcId || null), relation: owner ? relation : (p.relation || null),
        homeLocationId: home ? home.id : (p.homeLocationId || null)
      });
    }
    return { people: out };
  }
  function mockBookkeep(packet) {
    const c = packet.context || packet;
    const a = c.action || {};
    const s = State.current;
    const input = String(c.input || '').toLowerCase();
    const out = {
      attitudeChanges: [], newMemories: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [],
      playerLocationId: a.actionType === 'move' && a.destinationId ? a.destinationId : null,
      npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], placesRevealed: [], journalEntry: null
    };
    if (!s) return out;
    // A home someone names in a quoted line becomes a place (State.apply checks it like any other).
    const told = mockHomeFrom(c.narration, { lives: true, nearId: s.player.locationId });
    if (told) out.placesRevealed = [told];
    // ALREADY GRANTED: an ask repeated after a yes records no attitude change, no memory and nothing gained.
    if (c.granted) return out;
    const presentIds = c.presentIds || State.npcsAt(s.player.locationId).map(n => n.id);
    const npcs = (a.targets || []).map(id => State.npc(id)).filter(n => n && presentIds.includes(n.id));
    const first = npcs[0];
    if (first && ['talk', 'persuade', 'deceive', 'intimidate', 'buy', 'sell', 'give', 'attack', 'work'].includes(a.actionType)) {
      out.npcKnownToPlayer = npcs.filter(n => !n.knownToPlayer).map(n => n.id);
    }
    if (first && /\b(insult|insults|mock|mocks|sneer|curse)/.test(input)) {
      const again = first.memories.some(m => /insulted/i.test(m.text));
      out.attitudeChanges.push({ npcId: first.id, delta: -15, reason: 'insulted' });
      out.newMemories.push({ npcId: first.id, text: again ? `${s.player.name} insulted them again` : `${s.player.name} insulted them`, weight: again ? 3 : 2 });
    }
    if (first && a.actionType === 'persuade' && c.roll && c.roll.success) out.attitudeChanges.push({ npcId: first.id, delta: 8, reason: 'persuaded' });
    // Being attacked is "something major" (the bookkeeper's prompt): more than an insult, inside the ±25 clamp.
    if (first && a.actionType === 'attack') {
      const again = first.memories.some(m => /attacked/i.test(m.text));
      out.attitudeChanges.push({ npcId: first.id, delta: -20, reason: 'attacked' });
      out.newMemories.push({ npcId: first.id, text: again ? `${s.player.name} attacked them again` : `${s.player.name} attacked them`, weight: 3 });
    }
    if (a.actionType === 'take') {
      const l = State.loc(s.player.locationId);
      out.itemsGained = (a.targets || []).filter(id => /^item_/.test(id) && ((l && l.items) || []).some(i => i.id === id));
    }
    if (a.actionType === 'buy') {
      const g = Town.goodsFor(input);
      const price = g ? Tables.price(g.name) : null;
      if (g && price !== null && s.player.gold >= price) {
        out.goldDelta = -price;
        out.itemsGained = [g.name];
        out.journalEntry = `Bought ${lowerFirst(g.name)} for ${money(price)}.`;
      }
    }
    // "Only record changes the narration actually shows": the rumour is heard when the narration tells it.
    if (c.rumour && first && c.rumour.npcId === first.id && String(c.narration || '').includes(c.rumour.text)) out.rumoursHeard = [c.rumour.id];
    return out;
  }
  const Mock = {
    name: 'mock',
    delay: 12,
    pending: { parse: [], narrate: [], bookkeep: [], chronicle: [], rewriteMemories: [], revealPlaces: [], checkClock: [], fixPeople: [] },
    calls: [],
    queue(method) {
      if (!Mock.pending[method]) throw new Error('unknown mock method ' + method);
      for (let i = 1; i < arguments.length; i++) Mock.pending[method].push(arguments[i]);
      return Mock.pending[method].length;
    },
    clear() { for (const k of Object.keys(Mock.pending)) Mock.pending[k].length = 0; Mock.calls.length = 0; },
    take(method, packet) {
      Mock.calls.push({ method, text: packet && typeof packet.text === 'string' ? packet.text : null, block: packet && typeof packet.block === 'string' ? packet.block : null, input: packet && packet.input, mode: packet && packet.mode });
      if (Mock.calls.length > 60) Mock.calls.shift();
      const canned = Mock.pending[method].length ? Mock.pending[method].shift() : undefined;
      if (isObj(canned) && canned.error) {
        const e = isObj(canned.error) ? canned.error : { type: String(canned.error) };
        throw new ApiError(e.type || 'api_error', e.message || FRIENDLY[e.type] || FRIENDLY.http, { retryable: false, detail: e.message || null });
      }
      return canned;
    },
    refusal(canned) {
      return { result: null, refusal: refusalOf(isObj(canned.refusal) ? canned.refusal : { category: 'mock', explanation: 'queued refusal' }), usage: MOCK_ZERO, model: 'mock' };
    },
    async parse(packet) {
      const canned = Mock.take('parse', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      const auto = mockParse(packet || {});
      return { result: isObj(canned) ? Object.assign(auto, canned) : auto, usage: MOCK_ZERO, model: 'mock' };
    },
    async narrate(packet, onDelta) {
      packet = packet || {};
      const canned = Mock.take('narrate', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      if (isObj(canned) && Number.isFinite(canned.delay) && canned.delay > 0) await sleep(canned.delay);
      const text = typeof canned === 'string' ? canned : isObj(canned) && typeof canned.text === 'string' ? canned.text : mockNarration(packet.context || {});
      const parts = text.match(/\S+\s*/g) || [text];
      let soFar = '';
      for (let i = 0; i < parts.length; i += 3) {
        const chunk = parts.slice(i, i + 3).join('');
        soFar += chunk;
        if (onDelta) onDelta(chunk, soFar);
        await sleep(Mock.delay);
      }
      return { result: { text: soFar.trim(), stopReason: (isObj(canned) && canned.stopReason) || 'end_turn' }, usage: MOCK_ZERO, model: 'mock' };
    },
    async bookkeep(packet) {
      // A queued { delay } (ms) holds the reply back, an error or a refusal with it too: a slow bookkeeper, for the tests of the closing turn.
      const next = Mock.pending.bookkeep[0];
      if (isObj(next) && Number.isFinite(next.delay) && next.delay > 0) await sleep(next.delay);
      const canned = Mock.take('bookkeep', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      const auto = mockBookkeep(packet || {});
      const extra = isObj(canned) ? Object.assign({}, canned) : null;
      if (extra) delete extra.delay;
      return { result: extra ? Object.assign(auto, extra) : auto, usage: MOCK_ZERO, model: 'mock' };
    },
    async chronicle(entries) {
      const canned = Mock.take('chronicle', { text: null });
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      const listed = Array.isArray(entries) ? entries : [];
      const from = listed.length ? listed[0].turn : 0;
      const to = listed.length ? listed[listed.length - 1].turn : 0;
      // Deterministic: the turns, the days and what the player typed, under 80 words.
      const days = listed.map(e => e && e.day).filter(Number.isInteger);
      const did = listed.map(e => (isSay(e) ? `said "${cleanText(e.input, 50)}" to ${sayTo(e)}` : cleanText(e && e.input, 60))).filter(Boolean);
      const auto = `Turns ${from} to ${to}${days.length ? `, day ${days[0]} to day ${days[days.length - 1]}` : ''} (mock chronicle): ${did.length ? did.join('; ') : 'nothing of note'}.`;
      const summary = auto.split(/\s+/).slice(0, 79).join(' ');
      return { result: typeof canned === 'string' ? canned : summary, usage: MOCK_ZERO, model: 'mock' };
    },
    async rewriteMemories(packet) {
      const canned = Mock.take('rewriteMemories', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      await sleep(Mock.delay);
      return { result: isObj(canned) && Array.isArray(canned.people) ? canned : mockRewrite(packet || {}), usage: MOCK_ZERO, model: 'mock' };
    },
    async revealPlaces(packet) {
      const canned = Mock.take('revealPlaces', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      await sleep(Mock.delay);
      return { result: isObj(canned) && Array.isArray(canned.placesRevealed) ? canned : mockRevealPlaces(packet || {}), usage: MOCK_ZERO, model: 'mock' };
    },
    async checkClock(packet) {
      const canned = Mock.take('checkClock', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      await sleep(Mock.delay);
      return { result: isObj(canned) && typeof canned.behind === 'boolean' ? canned : mockCheckClock(packet || {}), usage: MOCK_ZERO, model: 'mock' };
    },
    async fixPeople(packet) {
      const canned = Mock.take('fixPeople', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      await sleep(Mock.delay);
      return { result: isObj(canned) && Array.isArray(canned.people) ? canned : mockFixPeople(packet || {}), usage: MOCK_ZERO, model: 'mock' };
    },
  };

  // ----- real provider -----
  /* POST with the four headers. One retry after 1.5 s for network errors and
     HTTP 429, 500 and 529; none for anything else. Every attempt is logged
     with its request-id. Resolves to the ok Response. */
  async function post(role, body) {
    const key = Storage.getApiKey();
    if (!key) throw new ApiError('no_key', FRIENDLY.no_key, { retryable: false });
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) await sleep(RETRY_DELAY_MS);
      let res;
      try {
        res = await fetch(ENDPOINT, { method: 'POST', headers: headers(key), body: JSON.stringify(body) });
      } catch (err) {
        lastErr = new ApiError('network', FRIENDLY.network, { retryable: true, detail: String((err && err.message) || err) });
        logCall(role, { attempt, error: lastErr, maxTokens: body.max_tokens });
        continue;
      }
      const requestId = res.headers.get('request-id');
      if (res.ok) return { res, requestId, attempt };
      let raw = '';
      let payload = null;
      try { raw = await res.text(); payload = JSON.parse(raw); } catch (e) { /* not JSON */ }
      lastErr = httpError(res.status, payload, requestId);
      logCall(role, { attempt, status: res.status, requestId, error: lastErr, maxTokens: body.max_tokens, data: payload || raw.slice(0, 2000) });
      if (!lastErr.retryable) break;
    }
    throw lastErr;
  }
  function textOf(data) {
    const block = Array.isArray(data && data.content) ? data.content.find(b => b && b.type === 'text') : null;
    return block && typeof block.text === 'string' ? block.text : '';
  }
  /* Parser, bookkeeper (structured outputs) and chronicle (plain text). A
     JSON reply cut off by max_tokens is retried once with twice the limit.
     opts.blocks and opts.cache: the cached system blocks (requestBody). */
  async function messageCall(role, opts) {
    const total = {};
    let maxTokens = MAX_TOKENS[role];
    for (let attempt = 1; ; attempt++) {
      const body = requestBody(role, { system: opts.system, blocks: opts.blocks, cache: opts.cache, user: opts.user, schema: opts.schema, maxTokens });
      const fail = (type, extra) => new ApiError(type, FRIENDLY[type], Object.assign({ usage: total, model: body.model, retryable: false }, extra));
      const { res, requestId } = await post(role, body);
      let data;
      try { data = await res.json(); } catch (e) {
        // A body that is not JSON (a cut-off transfer, a proxy page): once more, then give up.
        const err = fail('bad_response', { requestId, detail: 'reply was not JSON' });
        if (attempt === 1) { logCall(role, { attempt, status: res.status, requestId, error: err }); continue; }
        throw err;
      }
      addRaw(total, data.usage);
      const text = textOf(data);
      logCall(role, { status: res.status, requestId, stopReason: data.stop_reason, usage: data.usage, maxTokens, data: { text: text.slice(0, 4000), stop_details: data.stop_details || null } });
      if (data.stop_reason === 'refusal') return { result: null, refusal: refusalOf(data.stop_details), usage: total, model: body.model, logged: true };
      if (opts.schema && data.stop_reason === 'max_tokens') {
        if (attempt === 1) { maxTokens *= 2; continue; }
        throw fail('max_tokens', { requestId });
      }
      if (!opts.schema) return { result: text.trim(), usage: total, model: body.model, logged: true };
      try { return { result: JSON.parse(text), usage: total, model: body.model, logged: true }; }
      catch (e) {
        const err = fail('bad_response', { requestId, detail: 'reply did not match the schema' });
        if (attempt === 1) { logCall(role, { attempt, status: res.status, requestId, error: err }); continue; }
        throw err;
      }
    }
  }
  /* Server-sent events per docs/API_NOTES.md: text_delta is appended,
     thinking and signature deltas are ignored, stop_reason comes from
     message_delta, usage from message_start plus message_delta. */
  async function readStream(res, onDelta) {
    const out = { text: '', stopReason: null, stopDetails: null, usage: {}, model: null, events: 0 };
    const blocks = {};
    const handle = block => {
      let data = '';
      for (const line of block.split(/\r?\n/)) if (line.startsWith('data:')) data += line.slice(5).replace(/^ /, '');
      if (!data || data === '[DONE]') return;
      let ev;
      try { ev = JSON.parse(data); } catch (e) { return; }
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
        case 'error': {
          const e = isObj(ev.error) ? ev.error : {};
          const type = FRIENDLY[e.type] ? e.type : 'api_error';
          throw new ApiError(type, FRIENDLY[type], { detail: cleanText(e.message, 1000) || null, retryable: false, usage: out.usage, partial: out.text });
        }
        default: break; // ping, content_block_stop, message_stop
      }
    };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
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
      throw err;
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
  const Real = {
    name: 'claude',
    // The parser and the bookkeeper: the role's prompt, then its cast lists (Pipeline.parserBlock, Pipeline.bookkeeperBlock: the same until the cast changes), cached together as one prefix.
    parse(packet) { return messageCall('parser', { system: SYSTEM.parser, blocks: [typeof packet.block === 'string' ? packet.block : Pipeline.parserBlock()], cache: 'last', user: packet.text || JSON.stringify(packet), schema: SCHEMAS.parse_action }); },
    bookkeep(packet) { return messageCall('bookkeeper', { system: SYSTEM.bookkeeper, blocks: [typeof packet.block === 'string' ? packet.block : Pipeline.bookkeeperBlock()], cache: 'last', user: packet.text || JSON.stringify(packet), schema: SCHEMAS.record_changes }); },
    chronicle(entries) { return messageCall('chronicle', { system: SYSTEM.chronicle, user: chronicleText(entries) }); },
    rewriteMemories(packet) { return messageCall('memories', { system: SYSTEM.memories, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.rewrite_memories }); },
    revealPlaces(packet) { return messageCall('places', { system: SYSTEM.places, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.reveal_places }); },
    checkClock(packet) { return messageCall('clock', { system: SYSTEM.clock, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.check_clock }); },
    fixPeople(packet) { return messageCall('people', { system: SYSTEM.people, user: packet.text || JSON.stringify(packet), schema: SCHEMAS.fix_people }); },
    async narrate(packet, onDelta) {
      // Three cached system blocks: the style guide with its examples (byte-identical per style), the town (Pipeline.townBlock: its history, recent events and places; it never changes in play), then the cast (Pipeline.castBlock, the same until the cast changes).
      const body = requestBody('narrator', { system: packet.system || Style.systemPrompt(), blocks: [packet.town !== undefined ? packet.town : Pipeline.townBlock(), packet.cast || Pipeline.castBlock()], user: packet.text, cache: true, stream: true });
      // A stream cut off part-way (the phone locking, a dropped connection) is asked for once more before the turn fails.
      for (let attempt = 1; ; attempt++) {
        const { res, requestId } = await post('narrator', body);
        let out;
        try {
          if (/json/i.test(res.headers.get('content-type') || '')) {
            const data = await res.json();
            out = { text: textOf(data), stopReason: data.stop_reason || null, stopDetails: data.stop_details || null, usage: data.usage || {}, model: data.model || null, events: 0 };
            if (onDelta && out.text) onDelta(out.text, out.text);
          } else out = await readStream(res, onDelta);
        } catch (err) {
          if (err instanceof ApiError) { err.requestId = requestId; err.model = body.model; logCall('narrator', { attempt, status: res.status, requestId, error: err, usage: err.usage }); throw err; }
          const e = new ApiError('bad_response', FRIENDLY.bad_response, { requestId, retryable: false, detail: `${String(err && err.message)}${attempt === 1 ? '; trying again' : ''}`, model: body.model });
          logCall('narrator', { attempt, status: res.status, requestId, error: e });
          if (attempt === 1) { if (onDelta) onDelta('', ''); continue; }
          throw e;
        }
        logCall('narrator', { attempt, status: res.status, requestId, stopReason: out.stopReason, usage: out.usage, maxTokens: body.max_tokens, data: { text: out.text.slice(0, 4000), events: out.events, stop_details: out.stopDetails } });
        if (out.stopReason === 'refusal') return { result: { text: out.text, stopReason: 'refusal' }, refusal: refusalOf(out.stopDetails), usage: out.usage, model: body.model, logged: true };
        return { result: { text: out.text.trim(), stopReason: out.stopReason || 'end_turn' }, usage: out.usage, model: body.model, logged: true };
      }
    }
  };

  function provider() { return Storage.settings().mockMode ? Mock : Real; }
  function isRefusal(x) { return !!(x && x.refused === true); }
  async function call(role, method, args) {
    const p = provider();
    let out;
    try {
      out = await p[method].apply(p, args);
    } catch (err) {
      if (err && err.usage) record(err.model || roleModel(role), err.usage, role);
      throw err;
    }
    if (out && out.usage) record(out.model || roleModel(role), out.usage, role);
    if (!out.logged) remember({ role, provider: p.name, data: out.refusal ? { refusal: out.refusal } : out.result });
    if (out.refusal) return { refused: true, role, category: out.refusal.category, explanation: out.refusal.explanation };
    return out.result;
  }
  return {
    ENDPOINT, API_VERSION, MAX_TOKENS, PRICES, RETRY_DELAY_MS, RETRY_STATUSES, SYSTEM, SCHEMAS, FRIENDLY, MEMORY_RULES, PLACE_RULE,
    ApiError, Mock, Real, usage, responses,
    headers, requestBody, costOf, roleModel, roleEffort, isRefusal, readStream, chronicleText,
    providerName: () => provider().name,
    beginTurn() { usage.turn = blankUsage(); },
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

