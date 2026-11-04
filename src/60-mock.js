// ===== Module: Mock =====
/* Wave 47: the mock provider, its own module (it was the middle 1,500 lines
   of Api, between the transport and the exports): the offline demo's parser,
   narrator and bookkeeper, and what every test runs on. Api.provider() picks
   it when Settings.mockMode is on; Game.Mock and Game.Api.Mock are the same
   object (Api.Mock, Api.MOCK_ROMANCE and Api.MOCK_MORE read through to here).
   From Api it takes ApiError, FRIENDLY, recordFromWire and refusalOf. */
const Mock = (() => {
  const { ApiError, FRIENDLY, recordFromWire, refusalOf } = Api;
  // ----- mock provider -----
  /* Deterministic stand-ins, good enough to run the acceptance tests offline
     and to show the game without a key: a keyword parser (aboutIds for "ask
     X about Y", moveWhen before and after a walk, gamble at a bar), two to
     four plain sentences of narration built from the turn context (always
     naming the roll tier and any complication; a social roll answered with a
     place and a time or a plain no; the addressee's own words in Say mode;
     arrivals, due events and fresh town news worked in; a few variants per
     case picked by the turn, never by the dice; never a simile, never a name
     the town does not have), rule-based bookkeeping that reacts to what
     happened (insults by their words, buying where it is sold, a drink had,
     a debt paid, a knockout; memories in the MEMORY_RULES form), and a
     chronicle that starts with its day stamp and ends with "Open:". Every
     mock narration is tagged in the feed. Tests can queue canned replies per
     method (first in, first out):
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
  // A roll with no complication (the card game's) says nothing about one, never "null".
  const MOCK_TIER = {
    critical: r => `${capFirst(r.stat)} roll, critical success: it works, and better than planned.`,
    success: r => `${capFirst(r.stat)} roll, success: it works.`,
    partial: r => `${capFirst(r.stat)} roll, partial success: it works, but ${r.complication || 'not all the way'}.`,
    failure: r => `${capFirst(r.stat)} roll, failure: it does not work${r.complication ? `, and ${r.complication}` : ''}.`,
    critical_failure: r => `${capFirst(r.stat)} roll, critical failure: it goes badly wrong${r.complication ? `, and ${r.complication}` : ''}.`
  };
  // What a search looks for without naming a thing (wave 8, the final pass): no item is made of it ("Anything washed up").
  const MOCK_VAGUE = /^(?:(?:any|some|no)thing|whatever|stuff|things|clues?|signs?|traces?|evidence|anyone|anybody|someone|somebody)\b/;
  const HOME_NOUNS = ['house', 'home', 'place', 'trailer', 'apartment', 'farm'];
  /* Where a walk goes, and where in the words it was named: { id, at, end }
     (offsets in `lower`), or null. Places are named by their place, never by
     the person in their name ("I walk to Pittman's" is the station, not
     Royce Pittman): the longest of every name, map label and other name a
     place in town goes by, found or not yet (a home nobody has told the
     player about is still that home: the engine answers "You don't know
     where that is yet. Ask around."); a business by its possessive
     ("Pittman's", "Byrd's"); a home by the possessive of someone who lives
     there ("Dewayne's house", "the Pittman place", "Dewayne's" at the end of
     the words); else a kind of place ("the bar", "the pawn shop"). */
  function mockPlace(lower, packet) {
    const s = State.current;
    const norm = x => String(x || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^the /, '').trim();
    const known = [].concat(packet.exits || [], packet.knownLocations || []);
    // The places the packet lists (with the other names the game has for them), and the homes in town nobody has told the player about yet.
    const knownIds = new Set(known.map(l => l.id));
    // And the places out of town (wave 3, playtest D3): "I walk to Clayburn" is a walk there, which the engine refuses with its own line (nothing spent).
    const pool = known.map(l => (s && State.loc(l.id)) || l).filter((l, i, all) => all.findIndex(x => x.id === l.id) === i)
      .concat(s ? s.locations.filter(l => l.away !== true && l.discovered === false && !knownIds.has(l.id)) : [])
      .concat((packet.away || []).map(l => (s && State.loc(l.id)) || l).filter(l => l && l.id && !knownIds.has(l.id)));
    const cands = [];
    for (const l of pool) {
      const point = s && State.loc(l.id) === l ? State.mapPointOf(l) : null;
      for (const k of [l.name, l.map && l.map.label, point && point.label].concat(Array.isArray(l.aka) ? l.aka : [])) {
        const p = norm(k);
        if (p.length >= 3) cands.push({ p, id: l.id });
      }
      const poss = /^([a-z]+'s)\s/.exec(norm(l.name));
      if (poss) cands.push({ p: poss[1], id: l.id });
    }
    if (s) for (const n of s.npcs) {
      const homeId = typeof n.home === 'string' ? n.home : isObj(n.home) ? n.home.locationId : n.homeLocationId;
      const home = homeId ? State.loc(homeId) : null;
      if (!home || home.away === true || !pool.includes(home)) continue;
      const parts = norm(n.name).split(/\s+/).filter(w => w.length >= 3);
      for (const w of parts) for (const h of HOME_NOUNS) cands.push({ p: `${w}'s ${h}`, id: home.id });
      // "the Mangum place", "the Gentry house" (wave 4, playtest D5): a family's home by its name.
      if (parts.length > 1) for (const h of HOME_NOUNS) cands.push({ p: `the ${parts[parts.length - 1]} ${h}`, id: home.id });
      if (parts[0]) cands.push({ p: `${parts[0]}'s`, id: home.id, bare: true });
    }
    let best = null;
    for (const c of cands) {
      const m = new RegExp(`(^|[^a-z'])${escRe(c.p)}(?![a-z])`).exec(lower);
      if (!m) continue;
      const at = m.index + m[1].length;
      const end = at + c.p.length;
      // "Dewayne's" alone names his home only at the end of the words.
      if (c.bare && !/^\s*([.,!?]|$)/.test(lower.slice(end))) continue;
      if (!best || c.p.length > best.end - best.at) best = { id: c.id, at, end };
    }
    if (best) return best;
    // A kind of place ("the bar"), among the places the player knows.
    const hit = placeByPhrase(lower, known);
    if (!hit) return null;
    for (const [, re] of PLACE_PHRASES) {
      const m = re.exec(lower);
      if (m) return { id: hit.id, at: m.index, end: m.index + m[0].length };
    }
    return { id: hit.id, at: -1, end: -1 };
  }
  function mockDestination(lower, packet) {
    const hit = mockPlace(lower, packet);
    return hit ? hit.id : null;
  }
  /* The words with the place a walk names blanked out (and an owner's
     possessive just before it: "Hollis's pawn shop"), so nobody is looked for
     because their name is in a place's. */
  function withoutPlace(text, hit, offset) {
    if (!hit || hit.at < 0) return text;
    const at = Math.max(0, hit.at + (offset || 0));
    const end = Math.max(at, hit.end + (offset || 0));
    const head = text.slice(0, at).replace(/[A-Za-z]+['’]s\s+$/, m => ' '.repeat(m.length));
    return head + ' '.repeat(end - at) + text.slice(end);
  }
  // Wave 6 (the round-5 playtest's D14): a bus, a ride or a hitch somewhere is going there ("I take the bus to Calder": out of town, refused).
  const MOCK_GO = /\b(go|goes|walk|walks|head|heads|run|return|cross|enter|drive|drives|ride|make my way|back to|travel|travels|leave for|hitch|hitchhike|(?:take|takes|catch|catches|get|gets|bum|hop) (?:the|a) (?:bus|cab|taxi|train|ride|lift|greyhound))\b/;
  /* The names a person answers to in the mock's ear: the full name, then the
     first name. Never the family name alone: "Dewayne Mangum" is Dewayne,
     not Mavis Mangum too. */
  const NAME_TITLES = /^(mr|mrs|ms|miss|dr|doc|mister)\.?$/i;
  function personNames(n) {
    const parts = String((n && n.name) || '').split(/\s+/).filter(w => w && !NAME_TITLES.test(w));
    return parts.length ? [parts.join(' '), parts[0]] : [];
  }
  /* Named only by the family name ("Mangum owes me"), with no title before it
     ("Mrs. Pittman" still counts): not this person. A role ("the mechanic")
     still is. */
  function surnameOnly(n, lower) {
    const parts = String((n && n.name) || '').toLowerCase().split(/\s+/).filter(w => w && !NAME_TITLES.test(w));
    if (parts.length < 2) return false;
    const has = w => new RegExp(`(^|[^a-z])${escRe(w)}(?![a-z])`).test(lower);
    const last = parts[parts.length - 1];
    if (has(parts.join(' ')) || has(parts[0]) || !has(last)) return false;
    return !new RegExp(`\\b(mr|mrs|ms|miss|mister|chief|officer|mayor|pastor|deputy|dr|doc|reverend|coach)\\.?\\s+${escRe(last)}(?![a-z])`).test(lower);
  }
  /* Running off with no place named (Do mode): out through the first open exit. */
  const MOCK_FLEE = /\b(run|runs|get|gets|hurry|hurries|walk|walks)\s+away\b|\b(run|runs)\s+off\b|\b(flee|flees|bolt|bolts)\b/;
  /* Say mode: words that threaten or insult, and words that plead or bargain. */
  const MOCK_THREAT = /\b(idiot|moron|crook|liar|coward|fool|shut up|get lost|back off|or else|i'll hurt|i will hurt|you'll regret|you will regret)\b/;
  /* Wave 28: the demo parser's romantic field (the integration plan's 6.1):
     a flirt (MOCK_ROMANCE), or more than a flirt (MOCK_MORE: the night, a
     room, a bed). */
  const MOCK_ROMANCE = /\b(flirt\w*|kiss\w*|ask \w+ out|on a date|you'?re (pretty|cute|beautiful|handsome)|wink\w*)\b/i;
  const MOCK_MORE = /\b(spend the night|come up(?! with)|stay over|sleep with|my room|your place)\b/i;
  const MOCK_PLEA = /\b(please|trust me|come on|you should|you ought to|help me out|give me a chance|i'll pay|i can pay|how about)\b/;
  /* "I head to the bar and ask the bartender for a drink": a walk to a known
     place ("and", "then" or "and then"), then something done there. Every
     split point is tried in turn, so a place whose name has "and" in it
     still counts. Returns { dest, rest } or null. */
  function mockCompound(input, packet) {
    const text = String(input || '').replace(/[’]/g, "'");
    const re = /[\s,]+(?:and then|and|then)\s+/gi;
    // The place the whole line names: an "and" inside its name is no split (wave 4, playtest D1: "Pittman's Gas and Service").
    const whole = mockPlace(' ' + text.toLowerCase() + ' ', packet);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (whole && whole.at >= 0 && m.index + 1 >= whole.at && m.index + 1 < whole.end) continue;
      const left = ' ' + text.slice(0, m.index).toLowerCase() + ' ';
      const rest = text.slice(m.index + m[0].length).trim().replace(/^i\s+/i, '');
      if (!rest || !MOCK_GO.test(left)) continue;
      const dest = mockDestination(left, packet);
      if (dest) return { dest, rest };
    }
    return null;
  }
  /* The mock parser's ear for a thing an action needs (MOCK_NEEDS), checked against the inventory by name (Pipeline.carriedAs). */
  const MOCK_NEEDS = [[/\b(stab|stabs|stabbing|knife|blade)\b/, 'knife'], [/\b(shoot|shoots|shooting|gun|pistol|rifle)\b/, 'gun'], [/\b(drive|drives|driving)\b/, 'car']];
  function carriedAs(name, thing) { return Pipeline.carriedAs(name, thing); }
  // The verbs that use the thing; a noun alone needs it only when it is not looked for, bought, sold or asked about.
  const MOCK_NEED_VERBS = /^(stab|stabs|stabbing|shoot|shoots|shooting|drive|drives|driving)$/;
  const MOCK_NAMED_ONLY = /\b(for|search|searches|searching|look|looks|looking|find|finds|buy|buys|sell|sells|about|price|pawn)\b[^.!?]*$/;
  /* Betting at a card or dice game ("I bet $20 at cards", "deal me in"):
     actionType gamble where a game runs (a bar), the stake in the summary. */
  // Wave 6 (the round-5 playtest's D10): "I put $50 in" and "I ante up $20" are bets, as the README says.
  // Wave 11 (L1, H2): "another hand", "deal again", "one more hand", "deal me another", "I play a hand", "let's play", "I sit down at the card table", "I raise $20", "I go all in", "I'm in for $50".
  // Wave 12 (L7): bet and wager are a bet only as Style.betTalk reads them (the cards named, or a bare stake): "I bet he is lying" is not.
  // Wave 13: the game and the table size named: "deal me in at hold'em", "a hand of draw", "deal everyone in", "heads up" (with a hand, a game or a dealer).
  const MOCK_GAME_WORDS = /\b(?:(?:a|another|one more) (?:hand|game|round) of (?:five[\s-]*card\s+)?(?:draw|hold[\s'-]*'?em|holdem|texas hold[\s'-]*'?em)|(?:play|playing|let's play|deal|deal me in at|deal us in at|i'll play)\s+(?:some\s+)?(?:texas\s+)?(?:hold[\s'-]*'?em|holdem|draw poker|five[\s-]*card(?: draw)?)|deal (?:everyone|everybody|us all|all of us|the (?:whole )?table) in|heads[\s-]*up\s+(?:game|hand|poker|hold[\s'-]*'?em|holdem|draw|with)|(?:play|deal|let's play)\s+(?:it\s+)?heads[\s-]*up)\b/;
  // Wave 14 (QA #14): "a hand of cards", "sit in" ("Mind if I sit in?", "Can I sit in for a hand?"; not "sit in the corner"); and a game named in a short line ("hold'em? no, five card draw", "texas hold'em, twenty bucks": MOCK_GAME_NAME).
  const MOCK_GAME_NAME = /\b(?:five[\s-]*card\s+draw|texas\s+hold[\s'-]*'?em|hold[\s'-]*'?em|holdem|draw\s+poker)\b/;
  const MOCK_GAMBLE = /\b((?:a|another|one more) hand of (?:cards|poker)|sit(?:s|ting)?(?: down)? in(?=\s*(?:[.!?,]|$|for\b|with\b|tonight\b|today\b|this\b))|gamble|gambles|gambling|poker|deal me in|deal me (?:another|a hand|one more)|deal (?:again|another|one more)|(?:another|one more) hand|play (?:a|another|one more) hand|sit in on|sit (?:down )?(?:in )?at the (?:card|poker) (?:table|game)|buy into the game|join (?:the |a )?(?:card|poker|dice) game|shoot dice|roll dice|play (?:a hand of )?(?:cards|poker)|plays (?:cards|poker)|ante|antes|anted|ante up|(?:i'm|i am|count me) in for(?= (?:\$|\d|(?:five|ten|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a hundred|hundred)\b))|raises? (?:you |it |the pot )?(?:\$\s?\d+|\d+)|(?:i'm|i am|i go|go|going) all[ -]in\b|all[ -]in(?= for (?:\$|\d))|put (?:\$\s?\d+|\d+\s*(?:dollars|bucks)) (?:in|into the pot|in the pot|on the table)(?=\s*(?:[.!?,]|$|and\b)))\b|^\s*(?:let's play(?: cards| poker| a hand)?|(?:i\s+)?raise|all[ -]in)\s*[.!?]*\s*$/;
  const GAMBLE_PLACES = ['bar', 'tavern', 'inn', 'casino'];
  /* Wave 15 (QA N7): softer ways to sit in, read as a bet only where a
     dealer is at the card table now (mockDealerHere): "Mind if I join you
     for a hand?", "I join the game", "I take a seat at the card table", "I
     sit at the table", "Deal me into the game", "deal us in". "I sit in the
     corner", "I sit at the bar" and "Mind if I join you?" are not bets. */
  const MOCK_JOIN = /\bjoin (?:you(?: all| boys| fellas| folks| two| gentlemen)?|y'all|in)\b[^.!?]*\b(?:a hand|hands|a game|the game|your game|cards|poker|a round)\b|\bjoin (?:the|your) (?:card |poker )?(?:table|game)\b|\b(?:sit|sits|sat|sitting)(?: down| back)? at (?:the|his|your) (?:(?:card|poker) table\b|table(?=\s*(?:[.!?,;]|$|and\b|with\b|for\b|across\b)))|\b(?:take|takes|took|taking|grab|grabs|pull up|pulls up|find|finds) (?:a|the|an empty|my) (?:seat|chair|spot|place) at (?:the|his|your) (?:(?:card|poker) )?table\b|\bdeal (?:me|us) into\b|\bdeal us in\b|\bdeal (?:me|us) (?:some )?cards\b/;
  /* "Count me in", "I'm in" (wave 15): a bet only with the cards, a hand,
     the table or the game named in the line ("Count me in for a hand",
     "I'm in, deal the cards"), or right after a hand at the table; never
     "I'm in trouble" or "I'm in for a long night". */
  const MOCK_COUNT_IN = /\b(?:count (?:me|us)|i'm|i am|we're) in(?: too| again| on (?:the|this|that|your) (?:game|hand|next one)| for (?:a|another|one more|the next) (?:hand|game|round))?(?=\s*(?:[.!?,;:]|$))/;
  const MOCK_CARD_NAMED = /\b(?:cards?|hands?|poker|table|game|round|deal|hold[\s'-]*'?em|holdem)\b/;
  /* A dealer at the card table where the player is (the demo's parser, wave 15). */
  function mockDealerHere(packet) {
    const l = packet.location ? State.loc(packet.location.id) : null;
    return !!l && Pipeline.cardGameAt(l) && !!Pipeline.dealerOf((packet.present || []).map(n => n.id));
  }
  /* The turn before was a hand at the table (the log's newest entry has one). */
  function mockLastHand() {
    const s = State.current;
    const e = s && s.log.length ? s.log[s.log.length - 1] : null;
    return !!(e && isObj(e.cards));
  }
  function mockJoins(lower, packet) {
    if (!MOCK_JOIN.test(lower) && !MOCK_COUNT_IN.test(lower)) return false;
    if (!mockDealerHere(packet)) return false;
    return MOCK_JOIN.test(lower) || MOCK_CARD_NAMED.test(lower) || mockLastHand();
  }
  /* The words sit down at the card table (the gamble branch of mockParse):
     a bet, a hand or the game named, a join; l is the line in lower case
     with a space at each end. */
  function mockSitWords(l, raw, packet) {
    return MOCK_GAMBLE.test(l) || MOCK_GAME_WORDS.test(l) || (MOCK_GAME_NAME.test(l) && l.split(/\s+/).filter(Boolean).length <= 8) || ['bet', 'bare'].includes(Style.betTalk(raw)) || mockJoins(l, packet);
  }
  /* A sit-down with the dealer, the table or the hand named after it or
     before it (wave 20, QA N5): "all in, Curtis", "Curtis, all in", "I bet
     $20, Curtis", "all in at the table", "all in on this hand" sit down,
     as "all in" and "I bet $20" alone do (and "I go all in, Curtis"
     did); "shove, Curtis" no more than "shove". */
  const MOCK_BET_AT = /^(.+?)\s+(?:at|on)\s+(?:(?:the|this|his|your|that)\s+(?:card\s+|poker\s+)?(?:table|hand|game)|cards|poker)$/;
  function mockBetNamed(lower, packet) {
    if (!mockDealerHere(packet)) return false;
    const dealer = Pipeline.dealerOf((packet.present || []).map(n => n.id));
    const t = lower.trim().replace(/[.!?]+$/, '').trim();
    const him = x => x.trim().split(/\s+/).length <= 3 && Town.nameMentions(` ${x.trim()} `, dealer);
    const tail = /^(.+?)\s*,\s*([^,]+)$/.exec(t);
    const head = /^([^,]+?)\s*,\s*(.+)$/.exec(t);
    const at = MOCK_BET_AT.exec(t);
    const rest = tail && him(tail[2]) ? tail[1] : head && him(head[1]) ? head[2] : at ? at[1] : null;
    return !!rest && mockSitWords(` ${rest.trim()} `, rest.trim(), packet);
  }
  /* The object of a shove or a push (wave 20, QA N1): the words right
     after the verb, up to a comma or a stop, a preposition or a particle
     ("I shove Loretta", "push him away", "shove the old man into the
     wall"); none when a preposition comes first ("I push past Curtis to
     the bar") or the verb ends its clause ("shove, Curtis"). A possessive
     is no object of its own ("push Curtis's chips back": the chips). */
  const SHOVE_VERB = /\b(?:shove|shoves|shoved|shoving|push|pushes|pushed|pushing)\b/g;
  const SHOVE_STOP = new Set(['to', 'toward', 'towards', 'at', 'into', 'in', 'inside', 'on', 'onto', 'across', 'over', 'past', 'through', 'from', 'with', 'by', 'and', 'then', 'but', 'so', 'aside', 'away', 'back', 'down', 'off', 'out', 'up', 'along', 'forward', 'forwards', 'around', 'round', 'behind', 'against', 'until', 'till', 'while', 'as', 'or', 'because', 'for', 'if', 'when', 'before', 'after', 'again', 'hard', 'open']);
  const SHOVE_WHO = /^\s*(?:him|them|someone|somebody|anyone|anybody|everyone|everybody|each other|one another|her\s*$)/;
  const SHOVE_PERSON = /\b(?:man|men|woman|women|guy|guys|fellow|fellows|fella|fellas|feller|chap|boy|boys|girl|girls|kid|kids|lady|ladies|gentleman|gentlemen|stranger|strangers|drunk|drunks|old[\s-]?timer|bum|punk|thug|brute|idiot|fool|jerk|bastard|person|people|player|players|dealer|bartender|barman|barmaid|waitress|cop|officer|deputy|sheriff)\b/;
  function shoveObjects(lower) {
    const out = [];
    for (const m of lower.matchAll(SHOVE_VERB)) {
      const after = lower.slice(m.index + m[0].length).split(/[,.;:!?"()]/)[0];
      const words = [];
      for (const w of after.trim().split(/\s+/).filter(Boolean)) { if (SHOVE_STOP.has(w)) break; words.push(w); }
      if (words.length) out.push(` ${words.join(' ').replace(/\b[a-z][\w-]*'s?\s+(?=\S)/g, '')} `);
    }
    return out;
  }
  const MOCK_STAKE = /\$\s?(\d+)|\b(\d+)\s*(?:dollars|bucks)\b/;
  /* The demo's read of an ask for table stakes (wave 19, QA D1): the
     words plainly about the stakes (Pipeline.STAKES_ASK) where a dealer
     deals, aimed at him: his name or his game or table named
     (Pipeline.stakesNamed), or said as a request ("Can we play no
     limit?", "How about a bigger game?", "Let's take the limit off", "I
     want to raise the stakes"); never with someone else here named and
     not him ("I order a whiskey from Loretta, can we play no limit?" is
     the whiskey). "I bet he plays without a limit" is no ask.
     Wave 20 (QA N2, N3): the engine's own word rule (Pipeline.stakesWords:
     "Curtis, your greed has no limit." is talk) and the scene: at the
     card table with its dealer there (mockDealerHere), with nobody else
     named instead of him, the ask words alone ask ("no limit", "Take the
     limit off.", "Raise the stakes."), as the engine reads them. At a
     table already no limit today a line that sits down (sits: the gamble
     branch's words) deals instead (QA N8). */
  function mockStakes(lower, packet, named, sits) {
    if (!Pipeline.stakesWords(lower) || !mockDealerHere(packet)) return false;
    const dealer = Pipeline.dealerOf((packet.present || []).map(n => n.id));
    if (named.some(n => n !== dealer.id) && !named.includes(dealer.id)) return false;
    return !(sits && Pipeline.tableStructure(dealer) === 'nolimit');
  }
  /* "ask her about Wade, then walk to the bridge": something done here, then
     a walk on (moveWhen "after"). */
  const MOCK_THEN_GO = /^(.*?\S)(?:\s*,\s*|\s+)(?:and\s+then|then|and)\s+(?:i\s+)?(?:go|walk|head|run|drive|ride|make my way|leave for|cross)\b(.*)$/i;
  /* Wave 29: what the player holds over the one the words are aimed at
     (the packet's leverage), named in aboutIds when the words use it (a
     threat, or two words of it: Rel.references), and the words a threat
     then, as the parser is told. */
  function mockParse(packet) {
    const out = mockParseWords(packet);
    const recs = isObj(packet) && Array.isArray(packet.leverage) ? packet.leverage : [];
    if (!recs.length || packet.mode === 'fact' || packet.inner) return out;
    const input = String(packet.input || '');
    for (const x of recs) {
      if (!(out.targets || []).includes(x.npcId) || !Rel.references(input, x)) continue;
      out.aboutIds = (out.aboutIds || []).filter(id => id !== x.id).concat([x.id]);
      if (out.actionType === 'talk' || out.actionType === 'other') out.actionType = 'intimidate';
    }
    return out;
  }
  function mockParseWords(packet) {
    const input = String(packet.input || '');
    const lower = ' ' + input.toLowerCase().replace(/[’]/g, "'") + ' ';
    const has = re => re.test(lower);
    // Wave 28: romantic, from the words (MOCK_MORE, else MOCK_ROMANCE), whatever the action.
    const romantic = packet.mode === 'fact' ? null : MOCK_MORE.test(lower) ? 'more' : MOCK_ROMANCE.test(lower) ? 'flirt' : null;
    const out = { actionType: 'other', summary: cleanText(input, 160), targets: [], aboutIds: [], destinationId: null, moveWhen: null, needsRoll: false, stat: null, difficulty: null, usesItemId: null, missingItem: null, timeCost: 'short', declaresWorldFact: false, romantic };
    // A thing the action plainly needs: the inventory item that answers to it (usesItemId), else missingItem.
    for (const [re, thing] of MOCK_NEEDS) {
      const nm = re.exec(lower);
      if (!nm) continue;
      // A drive that is a thing (wave 6, the round-5 playtest's D11): a thumb drive, the long drive, a drive-in.
      if (thing === 'car' && (/\b(?:thumb|flash|hard|usb|disk|disc|zip|long|short|scenic|test|a|the|this|that)\s+$/.test(lower.slice(0, nm.index)) || /^-/.test(lower.slice(nm.index + nm[0].length)))) continue;
      // A thing named, not used (wave 4, playtest D4): looked for, bought or asked about ("I search the bays for a grease gun"), or something ordinary that only ends in the word (a grease gun).
      if (!MOCK_NEED_VERBS.test(nm[1])) {
        const before = lower.slice(0, nm.index);
        const phrase = before.split(/\s+/).filter(Boolean).slice(-3).concat(nm[1]).join(' ');
        if (MOCK_NAMED_ONLY.test(before) || ((thing === 'gun' || thing === 'knife') && !Town.weaponOf(phrase))) continue;
      }
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
      // Nobody here to hear a plea: words said to an empty room, no roll.
      const heard = out.targets.some(id => presentList.some(n => n.id === id));
      if (has(MOCK_THREAT)) out.actionType = 'intimidate';
      else if (has(MOCK_PLEA) && heard) { out.actionType = 'persuade'; roll('charm', 'normal'); }
      else out.actionType = 'talk';
      return out;
    }
    if (packet.mode !== 'fact' && !packet.inner) {
      /* A walk and then an action there (moveWhen "before"): the action is
         parsed from the part after the walk, with nobody assumed present at
         the destination (the people here count as known elsewhere), and
         carries the destination; the engine moves the player there first. A
         walk on to somewhere else is left to the plain move below. */
      const c = mockCompound(input, packet);
      const there0 = c ? [].concat(packet.knownLocations || [], packet.exits || []).find(l => l.id === c.dest) : null;
      const inner = c ? mockParse(Object.assign({}, packet, { input: 'I ' + c.rest, inner: true, present: [], knownNpcs: people, itemsHere: [], location: there0 ? { id: there0.id, name: there0.name, type: there0.type } : packet.location })) : null;
      if (inner && inner.actionType !== 'move') {
        return Object.assign(inner, { summary: out.summary, destinationId: c.dest, moveWhen: 'before', timeCost: inner.timeCost === 'instant' ? 'short' : inner.timeCost });
      }
      // Something done here and then a walk on (moveWhen "after"): the action as if alone, and where the player goes once it is done.
      const m = MOCK_THEN_GO.exec(input.replace(/[’]/g, "'"));
      const there = m ? mockDestination(' ' + m[2].toLowerCase() + ' ', packet) : null;
      if (there && !MOCK_GO.test(' ' + m[1].toLowerCase() + ' ')) {
        const first = mockParse(Object.assign({}, packet, { input: m[1], inner: true }));
        if (first.actionType !== 'move' && first.destinationId === null) {
          return Object.assign(first, { summary: out.summary, destinationId: there, moveWhen: 'after', timeCost: first.timeCost === 'instant' ? 'short' : first.timeCost });
        }
      }
    }
    /* The place a walk names, found first: the people in its name are not
       looked for ("I walk to Pittman's" is the station, not Royce Pittman;
       "I walk to Sturdivant House" does not ask for Vada). */
    const placeHit = has(MOCK_GO) ? mockPlace(lower, packet) : null;
    const lowerP = withoutPlace(lower, placeHit);
    const inputP = withoutPlace(input.replace(/[’]/g, "'"), placeHit, -1);
    const all = people.filter(n => Town.mentions(lowerP, n) && !surnameOnly(n, lowerP));
    // Someone in the cast the player has not met yet, named as a name ("I ask for Mavis"): their full name or their first name as written, never their family name alone ("Dewayne Mangum" is not Mavis), and not a word of a place's name.
    const placeWords = new Set([].concat(packet.knownLocations || [], packet.exits || []).flatMap(l => String(l.name || '').split(/[^A-Za-z]+/)).concat(String(packet.townName || '').split(/[^A-Za-z]+/)).filter(Boolean));
    const castNamed = (packet.cast || []).filter(n => !people.some(p => p.id === n.id) && personNames(n)
      .some(w => w.length >= 3 && !placeWords.has(w) && new RegExp(`(^|[^A-Za-z])${escRe(w)}(?![a-z])`).test(inputP)));
    all.push(...castNamed);
    /* Asked or talked about, not acted on ("ask Loretta about Wade"): whoever
       or wherever is named only after "about" goes in aboutIds, never in
       targets, so nobody is looked for who is not here. */
    const aboutAt = /\b(about|regarding)\b/.exec(lower);
    const about = [];
    if (aboutAt && packet.mode !== 'fact') {
      const head = lower.slice(0, aboutAt.index) + ' ';
      const tail = ' ' + lower.slice(aboutAt.index) + ' ';
      for (const n of all) if (Town.nameMentions(tail, n) && !Town.nameMentions(head, n) && !about.includes(n.id)) about.push(n.id);
      const placeName = l => String(l.name || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^the /, '');
      for (const l of [].concat(packet.knownLocations || [], packet.away || [])) {
        const nm = placeName(l);
        if (nm && tail.includes(nm) && !head.includes(nm) && !about.includes(l.id)) about.push(l.id);
      }
    }
    out.aboutIds = about;
    /* Who the text names. Anyone here answers to their name or role; someone
       who is not here only to their name, or to a role nobody else in the
       lists answers to ("the cook"), so a shared word ("the owner") picks
       the person in front of the player. /fact links whatever it names. */
    const byName = n => Town.nameMentions(lowerP, n);
    const acting = all.filter(n => !about.includes(n.id));
    const roleOnly = acting.filter(n => !byName(n));
    const named = packet.mode === 'fact' ? all
      : acting.filter(n => byName(n) || isHere(n) || (!roleOnly.some(isHere) && roleOnly.length === 1));
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
    const dest = placeHit ? placeHit.id : null;
    /* A thing, not a person: looking for one ("I look for some rope") may turn
       it up here (new:), and picking one up ("I pick up the rope") takes the
       item lying here by its id. */
    // "I look for some rope", "I look around for a crowbar", "I search the shelves for a flashlight" (wave 3).
    const seek = /\b(?:look|looks|search|searches|hunt|hunts|rummage|rummages|dig|digs)\b(?:\s+(?:around|through|in|inside|under|behind|on|the|a|an|his|her|my|their|some)\b[a-z' -]*?)?\s+for\s+(.+?)[\s.!?]*$/.exec(lower);
    const grab = /\b(?:pick|picks)\s+up\s+(.+?)[\s.!?]*$/.exec(lower);
    // Wave 8 (the final pass): "for anything washed up", "for clues" names nothing to find: a search with no item.
    const vague = !!seek && MOCK_VAGUE.test(seek[1].trim());
    const thing = (seek || grab) && !vague && !named.length && !fresh.length ? (seek || grab)[1].trim() : null;
    // Every thing lying here the words name ("the fishing rod and the tackle box": both; "the rod and reel": the one), longest names first.
    const named2 = thing ? (packet.itemsHere || []).filter(i => new RegExp(`(^|[^a-z])${escRe(i.name.toLowerCase())}([^a-z]|$)`).test(thing)) : [];
    const lyingAll = named2.filter(i => !named2.some(j => j !== i && j.name.length > i.name.length && j.name.toLowerCase().includes(i.name.toLowerCase())));
    const lying = lyingAll[0] || null;
    // Something carried that the words name: its whole name, else one of its longer words ("the knife" for a folding knife).
    const inv = packet.inventory || [];
    // Else the one whose words the line shares most ("the letter to Jodie" is the Letter for Jodie Strayhorn, not the Reference letter; wave 3), and on a tie the thing an errand is owed.
    const wordsOf = i => String(i.name || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4);
    const shared = i => wordsOf(i).filter(w => new RegExp(`(^|[^a-z])${escRe(w)}s?([^a-z]|$)`).test(lower)).length;
    const errandThing = i => { try { return State.obligations('owed').some(o => o.kind === 'errand' && o.itemName && String(o.itemName).toLowerCase() === String(i.name || '').toLowerCase()); } catch (e) { return false; } };
    const held = inv.find(i => new RegExp(`(^|[^a-z])${escRe(String(i.name || '').toLowerCase())}([^a-z]|$)`).test(lower))
      || inv.filter(i => shared(i) > 0).sort((x, y) => shared(y) - shared(x) || errandThing(y) - errandThing(x))[0];
    const where = (packet.location && packet.location.type) || '';
    // A bet at cards, a sit-down (the gamble branch below; wave 20, QA N5: a betting word with the dealer, the table or the hand named too).
    const sits = (mockSitWords(lower, input, packet) || mockBetNamed(lower, packet)) && GAMBLE_PLACES.includes(where) && !aboutAt;
    // A search for something not lying here rolls (the engine makes it only on a success; wave 3, playtest N12).
    if (vague) { out.actionType = 'search'; out.timeCost = 'short'; }
    else if (thing && seek) { out.actionType = 'search'; out.timeCost = 'short'; if (!lying) roll('wits', 'normal'); }
    else if (thing) { out.actionType = 'take'; out.timeCost = 'instant'; }
    else if (has(/^\s*(i\s+)?(look|examine|glance|listen|study the)\b/) && !has(/\b(try|tries|attempt)\b/)) { out.actionType = 'look'; out.timeCost = 'instant'; }
    // Watching the room ("I watch who comes and goes") is a look that takes a while, not a walk.
    else if (has(/^\s*(i\s+)?(watch|watches|observe|observes|keep an eye on|people-watch)\b/) && !has(/\b(try|tries|attempt)\b/)) { out.actionType = 'look'; out.timeCost = 'short'; }
    else if (has(/\b(rest|sleep|nap)\b/)) { out.actionType = 'rest'; out.timeCost = 'rest'; }
    else if (has(/\bwait\b/)) { out.actionType = 'wait'; out.timeCost = 'long'; }
    // Walking to where the player already is: a look around, not a walk that finds no way.
    else if (dest && packet.location && dest === packet.location.id) { out.actionType = 'look'; out.timeCost = 'instant'; }
    else if (dest) { out.actionType = 'move'; out.destinationId = dest; out.timeCost = 'short'; }
    else if (has(MOCK_FLEE)) {
      const exit = (packet.exits || []).find(x => !x.closed);
      out.actionType = 'move'; out.destinationId = exit ? exit.id : null; out.timeCost = 'short';
    }
    // Wave 6 (the round-5 playtest's D13): a shove, a push, a slap is an attack too.
    // Wave 19 (QA D2): a shove or a push only with a person as its object ("I shove Loretta", "I push him"); alone ("shove", "I shove", "push") it is the card table's all in, never an attack.
    // Wave 20 (QA N1): the person must be the verb's own object (shoveObjects): "I push my chips toward Curtis", "shove, Curtis" and "I push past Curtis to the bar" are no attack.
    else if ((has(/\b(attack|attacks|hit|hits|fight|fights|punch|punches|stab|shoot|shoots|swing at|brawl|beat up|tackle|tackles|slap|slaps|kick|kicks|headbutt|headbutts|elbow|elbows|smack|smacks)\b/) || shoveObjects(lower).some(o => SHOVE_WHO.test(o) || SHOVE_PERSON.test(o) || named.some(n => Town.mentions(o, n)) || MOCK_NEW.some(([re]) => re.test(o)))) && !has(/\b(?:push|pushes)\s+(?:open|the door|through|past|my way|on|for)\b/) || has(/\bknocks?\s+(?:\w+\s+){0,2}out\b/)) { out.actionType = 'attack'; roll('might', 'normal'); out.targets = target(); }
    else if (has(/\b(sneak|creep|pick|picks|steal|steals|pickpocket|lift a purse)\b/)) { out.actionType = has(/\b(steal|steals|pickpocket|lift a purse)\b/) ? 'steal' : has(/\b(sneak|creep)\b/) ? 'sneak' : 'use'; roll('stealth', 'normal'); }
    // Asking the dealer for table stakes (wave 18, amendment 2: "no limit", "a bigger game", "take the limit off"): a persuade aimed at the dealer here; the engine rolls it.
    // Wave 19 (QA D1): only when aimed at him (mockStakes), and nobody else here named instead. Wave 20 (QA N2, N3, N8): the engine's word rule, the ask words alone at his table, and a sit-down at a table already no limit deals.
    else if (mockStakes(lower, packet, present.concat(away).map(n => n.id).concat(fresh), sits)) { out.actionType = 'persuade'; roll('charm', 'normal'); out.targets = [Pipeline.dealerOf(presentList.map(n => n.id)).id]; out.timeCost = 'instant'; }
    else if (has(/\b(persuade|persuades|convince|convinces|talk \w+ into)\b/)) { out.actionType = 'persuade'; roll('charm', 'normal'); out.targets = target(); out.timeCost = 'instant'; }
    else if (has(/\b(insult|insults|mock|mocks|sneer at|curse at)\b/)) { out.actionType = 'intimidate'; out.targets = target(); out.timeCost = 'instant'; }
    else if (sits) {
      // The engine deals the hand: no roll here, and the stake goes in the summary.
      const st = MOCK_STAKE.exec(lower);
      out.actionType = 'gamble';
      out.summary = `bets $${st ? parseInt(st[1] || st[2], 10) : 10} at cards`;
      out.timeCost = 'short';
      out.targets = target();
    }
    // Asking what something would cost or bring is a question, not a give or a sale (wave 6, the round-5 playtest's D11: "what he would give me for a thumb drive").
    else if (has(/\b(ask|asks|asking)\b[^.!?]*\b(what|how much|whether|if|would|why|who|where|when)\b/)) { out.actionType = 'talk'; out.timeCost = 'instant'; out.targets = target(); }
    else if (has(/\b(buy|buys|purchase|pay for)\b/) || (has(/\b(order|orders|drink|drinks|eat|eats)\b/) && Town.goodsFor(lower))) { out.actionType = 'buy'; out.targets = present.map(n => n.id); }
    else if (has(/\b(sell|sells|pawn|pawns|hock)\b/)) { out.actionType = 'sell'; out.targets = target(); out.usesItemId = held ? held.id : out.usesItemId; out.timeCost = 'instant'; }
    // Wave 8 (the final pass): "I hand Jodie the letter", "I hand the letter to Jodie" give too (hand as the verb, not "my hand").
    else if (has(/\b(give|gives|hand over|hands over|pay|pays|repay|pay back|pay off)\b/) || has(/(?:^\s*|\b(?:i|we|then|and|just|quietly|quickly|slowly|carefully|silently)\s+)hand(?:s|ed)?\s+\S/)) { out.actionType = 'give'; out.targets = target(); out.usesItemId = held ? held.id : out.usesItemId; out.timeCost = 'instant'; }
    else if (has(/\b(talk|talks|ask|asks|say|says|tell|tells|greet|greets|chat|speak|apologi[sz]e|apologi[sz]es)\b/)) { out.actionType = 'talk'; out.timeCost = 'instant'; out.targets = target(); }
    else if (has(/\b(try|tries|attempt|attempts)\b/)) {
      if (has(/\b(climb|force|lift|break|swim|push|pull|carry)\b/)) roll('might', 'normal');
      else if (has(/\b(charm|haggle|lie|bluff|flatter)\b/)) { roll('charm', 'normal'); out.actionType = 'deceive'; }
      else { roll('wits', 'normal'); out.actionType = 'search'; }
    }
    // A flirt with nothing else to it is talk (wave 28), aimed at whoever is in front of the player.
    if (romantic && out.actionType === 'other') { out.actionType = 'talk'; out.timeCost = 'instant'; out.targets = target(); }
    // A move names someone who is not here only by their name.
    for (const n of named) if (!out.targets.includes(n.id) && (out.actionType !== 'move' || isHere(n) || byName(n))) out.targets.push(n.id);
    for (const f of fresh) if (!out.targets.includes(f)) out.targets.push(f);
    if (thing) for (const id of lyingAll.length ? lyingAll.map(i => i.id) : ['new:' + thing]) if (!out.targets.includes(id)) out.targets.push(id);
    return out;
  }
  /* A stable pick among variants: the same turn, words and person always give
     the same line (no dice are drawn, so a test's rolls never shift), and 30
     turns in a row still read differently. */
  function vary(list, key) {
    let h = 7;
    const t = String(key || '');
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return list[Math.abs(h) % list.length];
  }
  const POSSESSIVE = { he: 'his', she: 'her', they: 'their' };
  function possOf(n) { return POSSESSIVE[n && n.pronouns] || 'their'; }
  function mockGreeting(n, key) {
    const a = n.attitude | 0;
    if (a <= -60) return `${n.name} turns away and will not look at you.`;
    if (a <= -25) return `${n.name} gives you a cold look. "What now?"`;
    if (a < -5) return vary([`${n.name} eyes you warily.`, `${n.name} keeps one eye on you and says nothing yet.`, `${n.name} crosses both arms and waits.`], key);
    if (a <= 5) return vary([`${n.name} hears you out.`, `${n.name} listens, giving nothing away.`, `${n.name} stops to listen.`], key);
    if (a < 60) return vary([`${n.name} greets you with a nod.`, `${n.name} gives you a nod and waits.`, `${n.name} looks glad enough to see you.`], key);
    return vary([`${n.name} greets you warmly.`, `${n.name} brightens when you come over.`], key);
  }
  /* The habit in someone's voice line that is a phrase they say ("calls
     everybody 'hon'", "hedges with 'now, I'm not saying'"), or null. */
  function voiceHabit(n) {
    const m = /(?:^|[\s(])'(.+?)'(?=[\s,.;:)!?]|$)/.exec(String((n && n.voice) || '').replace(/[‘’]/g, "'"));
    const h = m ? m[1].trim() : '';
    return h && h.length <= 40 && !/\byou (know|think|feel|want|remember|say|said|ask|tell|wonder)\b/i.test(h) ? h : null;
  }
  /* What someone says back, in their own words where their voice has a
     habit: a short answer, a yes or a no as the roll went. */
  function mockSays(n, c, key) {
    const r = c.roll;
    const reply = r && r.success ? vary(['All right. You win that one', 'Fine. Just this once', 'Could be. Let me think on it'], key)
      : r ? vary(['No. Not happening', "That's a no", 'Not for you, not today'], key)
        : vary(["Couldn't tell you", 'Depends who is asking', 'Could be', 'Not much to tell'], key);
    const habit = voiceHabit(n);
    const line = !habit ? `${reply}.` : habit.split(/\s+/).length <= 2 ? `${reply}, ${habit}.` : `${capFirst(habit).replace(/[.!?]+$/, '')}. ${reply}.`;
    return `${n.name} says, "${line}"`;
  }
  /* A meeting the player proposes in Say mode (wave 22, the demo's one
     deterministic case): "meet me at <place> <time words>" said to someone
     present, with no roll or a roll that succeeded. The demo narration has
     them agree ("Jodie Strayhorn nods. "The Low Water, tonight.""), and the
     demo bookkeeper records the seed (State makes it an appointment).
     Returns { npc, place, when } or null. */
  const MOCK_MEET = /\bmeet me (?:at|by|in|outside|behind|over at|down at|out at) (.+?)\s*[.!?]*\s*$/i;
  function mockMeeting(c) {
    const s = State.current;
    const sp = c && c.speech;
    if (!s || !isSay(sp) || !sp.to || sp.to === 'everyone' || (c.roll && !c.roll.success)) return null;
    const m = MOCK_MEET.exec(String(c.input || '').replace(/[’‘]/g, "'"));
    if (!m) return null;
    const n = State.npc(sp.to);
    if (!n || !(c.presentIds || State.npcsAt(s.player.locationId).map(x => x.id)).includes(n.id)) return null;
    const rest = m[1].toLowerCase().replace(/^the\s+/, '');
    let best = null;
    for (const l of s.locations) {
      if (!l.discovered || l.away === true) continue;
      for (const name of [l.name].concat(Array.isArray(l.aka) ? l.aka : [])) {
        const bare = String(name).toLowerCase().replace(/[’]/g, "'").replace(/^the\s+/, '');
        if (bare.length >= 4 && rest.startsWith(bare) && !/^[a-z]/.test(rest.slice(bare.length)) && (!best || bare.length > best.len)) best = { l, len: bare.length };
      }
    }
    if (!best) return null;
    const when = rest.slice(best.len).replace(/^[\s,]+/, '').trim();
    if (!when || !/\b(?:tonight|tomorrow|today|morning|afternoon|evening|night|noon|midday|supper|dinner|breakfast|dawn|o'?clock|half past|quarter|at (?:\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|\d(?::\d\d)?\s*(?:am|pm))\b/.test(when)) return null;
    return { npc: n, place: best.l, when };
  }
  function mockMeetLine(meet) { return `${meet.npc.name} nods. "${capFirst(String(meet.place.name).replace(/^The /, 'the '))}, ${meet.when}."`; }
  /* Something asked of the player (wave 26, the demo's one deterministic
     case): "what do you want from me" or "what do you need" said in Say mode
     to someone present, with no roll or a roll that succeeded. The demo
     narration has them ask for the outboard part by the day after tomorrow
     ("Royce Pittman wants the outboard part by Day 3."), and the demo
     bookkeeper records the seed (State makes it an ask). Returns { npc, day,
     thing } or null. */
  const MOCK_ASK = /\bwhat (?:do|would) you (?:want|need)\b/i;
  function mockAsk(c) {
    const s = State.current;
    const sp = c && c.speech;
    if (!s || !isSay(sp) || !sp.to || sp.to === 'everyone' || (c.roll && !c.roll.success)) return null;
    if (!MOCK_ASK.test(String(c.input || '').replace(/[’‘]/g, "'"))) return null;
    const n = State.npc(sp.to);
    if (!n || !(c.presentIds || State.npcsAt(s.player.locationId).map(x => x.id)).includes(n.id)) return null;
    return { npc: n, day: s.time.day + 2, thing: 'the outboard part' };
  }
  function mockAskLine(ask) { return `${ask.npc.name} wants ${ask.thing} by Day ${ask.day}. "Bring it by ${State.weekday(ask.day)} and I'll make it worth your while."`; }
  /* The next stretch of the day, for a time someone names. */
  const LATER = { morning: 'this afternoon', afternoon: 'this evening', evening: 'tonight', night: 'in the morning' };
  /* A place someone can point to: where their schedule has them next, if the
     player knows it, else where the player stands. */
  function placeFor(n, s) {
    const i = PHASES.indexOf(s.time.phase);
    const next = PHASES[(i + 1) % PHASES.length];
    const l = s.locations.find(x => x.discovered && x.away !== true && ((x.npcIdsBySchedule || {})[next] || []).includes(n.id)) || State.loc(s.player.locationId);
    return String((l && l.name) || 'here').replace(/^The /, 'the ');
  }
  /* A social roll, answered: a success gives one concrete thing (a place and
     a time), a partial gives a little, a failure is a plain no. */
  function mockOutcome(n, c, s, key) {
    const r = c.roll;
    if (!r || !s) return null;
    const when = LATER[s.time.phase] || 'later';
    const place = placeFor(n, s);
    if (r.tier === 'partial') return vary([`${n.name} gives a little. "Maybe. Not here. Ask me at ${place}, ${when}."`, `${n.name} half nods. "Some of it. The rest at ${place}, ${when}."`], key);
    if (r.success) return vary([`${n.name} gives in. "All right. ${capFirst(place)}, ${when}. I'll be there."`, `${n.name} thinks it over, then nods. "Fine. Find me at ${place} ${when}."`, `${n.name} lowers ${possOf(n)} voice. "Ask again at ${place}, ${when}, when it's quieter."`], key);
    return vary([`${n.name} shakes ${possOf(n)} head. "No. That's my answer."`, `${n.name} doesn't budge. "I said what I said."`, `${n.name} just looks at you. "Ask somebody else."`], key);
  }
  /* The newest public town news, from today or yesterday, that the last
     turns have not told: its first clause, or null. Never a rumour's text
     word for word (a rumour is told once). */
  function freshNews(s) {
    if (!s) return null;
    const item = State.news.filter(x => isObj(x) && x.public !== false && typeof x.text === 'string' && Number.isInteger(x.day) && x.day >= s.time.day - 1).slice(-1)[0];
    if (!item) return null;
    // Wave 19 (QA D16): "Dr. Sayle" does not end the clause (SENTENCE_SPLIT).
    const clause = item.text.split(new RegExp(`${SENTENCE_SPLIT.source}|,\\s+|;\\s+`))[0].replace(/[.!?]+$/, '').trim();
    if (!clause || s.rumours.some(r => clause.includes(r.text) || r.text === clause)) return null;
    if (s.log.slice(-3).some(e => String(e.narration || '').includes(clause))) return null;
    return clause;
  }
  /* Say mode: the one spoken to answers first (with everyone, the first
     person here), in their own words; anyone else here reacts. room: the
     lines the narration has left for it. The answer itself always fits (it
     comes before anyone arriving or leaving); the greeting and the others'
     reaction only when there is room. Returns { lines, core } (core: the
     lines that must stay). */
  function mockReply(c, room) {
    const s = State.current;
    const sp = c.speech;
    const a = c.action || {};
    const here = (c.present || []).map(p => State.npc(p.id)).filter(Boolean);
    const to = sp.to === 'everyone' ? here : here.filter(n => n.id === sp.to);
    if (!to.length) { const only = here.length ? `${sp.toName || 'Whoever you meant'} is not here to hear it.` : 'Nobody is here to hear it.'; return { lines: [only], core: [only] }; }
    const first = to[0];
    const key = `${(s && s.meta.turn) || 0}|${c.input || ''}|${first.id}`;
    const opener = sp.to === 'everyone'
      ? `${andList(to.map(n => n.name))} ${to.length > 1 ? 'hear' : 'hears'} you, and ${first.name} answers first.`
      : `${first.name} answers you first.`;
    const told = c.rumour && c.rumour.npcId === first.id ? `${first.name} mentions something: "${c.rumour.text}"` : null;
    // "Meet me at the Low Water tonight" (wave 22): they agree, and the demo bookkeeper records the meeting.
    const meet = mockMeeting(c);
    // "What do you want from me?" (wave 26): they ask for something by a day, and the demo bookkeeper records it.
    const asked = mockAsk(c);
    const answer = meet && meet.npc.id === first.id ? mockMeetLine(meet) : asked && asked.npc.id === first.id ? mockAskLine(asked) : a.actionType === 'intimidate'
      ? ((first.attitude | 0) <= -25 ? `${first.name} has heard enough. "Get out of my sight."` : `${first.name} goes still. "Say that again."`)
      : mockSays(first, c, key);
    const core = [opener, answer].concat(told ? [told] : []);
    const left = Number.isFinite(room) ? room : 4;
    // The answer in their own words; a greeting before it only with room to spare (a rumour passed on takes its place).
    const greet = a.actionType !== 'intimidate' && !told && left > core.length ? mockGreeting(first, key) : null;
    const lines = greet ? [opener, greet].concat(core.slice(1)) : core.slice();
    const others = here.filter(n => !to.includes(n));
    if (others.length && left > lines.length) lines.push(`${andList(others.map(n => n.name))} ${others.length > 1 ? vary(['look over', 'stop to listen'], key) : vary(['looks over', 'stops to listen'], key)}.`);
    return { lines, core };
  }
  /* A due event written about the player by name ("Leon Varner walks up to
     Tomas Reed, reads Tomas Reed's name...") told to them: "you", "your". */
  function secondPerson(text) {
    const s = State.current;
    const name = s && s.player && String(s.player.name || '').trim();
    let t = String(text || '');
    if (!name) return t;
    const names = [name].concat(name.split(/\s+/).length > 1 ? [name.split(/\s+/)[0]] : []);
    for (const nm of names) {
      const re = escRe(nm);
      t = t.replace(new RegExp(`\\b${re}['’]s\\b`, 'g'), 'your').replace(new RegExp(`\\b${re}\\b`, 'g'), 'you');
    }
    // "you" as the subject takes the plain verb ("the way you stand", "you are"); after a preposition or a verb that takes a person, it is the object ("walks up to you", "watches you shuffle").
    const VERB = { is: 'are', was: 'were', has: 'have', does: 'do', goes: 'go', "doesn't": "don't", "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't" };
    t = t.replace(/\byou (is|was|has|does|doesn't|isn't|wasn't|hasn't)\b/g, (m, v) => `you ${VERB[v]}`);
    t = t.replace(/(\b[a-z]+\s+)?\byou ([a-z]+s)\b/g, (m, before, v) => {
      if (before && OBJECT_BEFORE.has(before.trim())) return m;
      if (!PLAIN_VERB.test(v)) return m;
      const plain = VERB[v] || v.replace(/(ch|sh|ss|x)es$/, '$1').replace(/ies$/, 'y').replace(/s$/, '');
      return `${before || ''}you ${plain}`;
    });
    return t.replace(/(^|[.!?]\s+)you\b/g, (m, pre) => `${pre}You`).replace(/(^|[.!?]\s+)your\b/g, (m, pre) => `${pre}Your`);
  }
  // Words before "you" that make it the object, and the verbs secondPerson puts in the plain form after a subject "you".
  const OBJECT_BEFORE = new Set(('to at with for from on in by about of toward towards behind beside near past into onto catches finds sees meets gives invites offers warns lets shows pays asks tells calls follows stops shoves beats hires thanks watches hands sells brings sends takes leaves helps owes').split(' '));
  const PLAIN_VERB = /^(stands|sits|looks|seems|knows|wants|needs|comes|goes|keeps|says|owes|works|lives|stays|sleeps|walks|talks|means|gets|makes|takes|plays|pays|drinks|smokes|tells|asks|shuffles|carries|tries|watches|holds|hides|runs|sells|buys|waits|leaves|owns|thinks|came|gives|finds|reads|writes|hears|sees|turns)$/;
  /* The card game as the engine dealt it (Pipeline.gamble: ctx.gamble):
     no game and why, or the hands by name and what the player won or lost
     (wave 10: the table showed the cards, so the cards are not listed);
     Curtis Pruett's Friday game at the back table when it is his and it is
     Friday. */
  function mockGamble(c, key) {
    const g = c.gamble;
    if (!g) return vary(['You buy into the next hand.', 'You get dealt into the next hand.', 'Cards go round the table, and you are in.'], key);
    if (!g.played) {
      if (/no money/.test(g.why || '')) return "You don't have a dollar to put up, so there is no game for you tonight.";
      // Wave 11 (L6, H2, L7): he will not deal to someone he caught; a bet said to someone else; when the dealer deals.
      // Someone not met yet is named as the Say picker names them (wave 12, L10).
      const dealerSaid = g.dealerLabel || g.dealerName || 'the dealer';
      if (g.refused) return `${capFirst(dealerSaid)} won't deal to you${g.caughtDay ? ', not after the marked deck' : ''}.`;
      if (g.saidTo) return `It's ${dealerSaid} who deals, and you said it to ${g.saidToLabel || g.saidTo}.`;
      if (/nobody is dealing/.test(g.why || '')) return `Nobody is dealing right now, so there is no game to sit in on.${g.hoursLabel || g.hours ? ` ${g.hoursLabel || g.hours}.` : ''}`;
      if (/ is shut /.test(g.why || '')) return 'The place is shut today, so there is no game.';
      return 'There is no card game here.';
    }
    const dealer = g.dealerId ? State.npc(g.dealerId) : null;
    const day = State.current ? State.current.time.day : 0;
    let weekday = '';
    try { weekday = State.weekday(day); } catch (e) { weekday = ''; }
    const table = dealer ? (weekday === 'Friday' && dealer.id === 'npc_curtis' ? `${dealer.name}'s Friday game at the back table` : `${dealer.name}'s table`) : 'the table';
    const theirs = dealer ? `${dealer.name}'s` : "the dealer's";
    const amount = money(Math.abs(g.delta | 0));
    // A hand's name in a sentence; one with a comma in it ("two pair, kings and sevens") closes with a comma before the verb.
    const hand = n => lowerFirst(String(n || 'hand'));
    const lead = n => (hand(n).includes(',') ? `${hand(n)},` : hand(n));
    let told;
    // Hold'em, or more than two at the table (wave 13): the game, who sat in and how each ended, briefly.
    const others = (g.seats || []);
    // The betting's big moments (wave 18): "you raised to $40 on the turn and Carter Sturdivant called".
    const moments = !g.caught && Array.isArray(g.moments) && g.moments.length ? `${g.moments.join('; ')}; ` : '';
    // Wave 18: a heads-up draw fold is told below, with when it was (before the draw, or after it).
    if (!g.caught && (g.game === 'holdem' || others.length || g.uncontested)) {
      const game = g.game === 'holdem' ? "Texas hold'em" : 'five-card draw';
      const with_ = others.length ? ` with ${andList(others.map(x => x.name))}` : '';
      const when = x => (g.game === 'holdem' ? ['before the flop', 'on the flop', 'on the turn', 'on the river'] : ['before the draw', 'after the draw'])[x.foldedOn] || '';
      // Heads up, the one who folds is named (wave 14, QA #21): "Curtis Pruett folds to you on the turn", never "everyone".
      const alone = g.uncontested && g.result === 'win' && !others.length;
      // Wave 19 (QA D8): a fold the moments told is not told again.
      const toldFolds = new Set(Array.isArray(g.foldsTold) ? g.foldsTold : []);
      const ends = alone ? [] : others.concat(g.dealerName ? [{ id: g.dealerId, name: g.dealerName, folded: g.dealerFolded, foldedOn: g.dealerFoldedOn, hand: g.dealer }] : [])
        .filter(x => x.folded && !toldFolds.has(x.id)).map(x => `${x.name} folds ${when(x) || (g.game === 'holdem' ? 'early' : 'without drawing')}`);
      const pot = money(g.pot | 0);
      let mine;
      if (g.result === 'fold') mine = `you fold your ${lead(g.player)}${when({ foldedOn: g.playerFoldedOn }) ? ` ${when({ foldedOn: g.playerFoldedOn })}` : ''} and give up ${amount}`;
      else if (alone && !toldFolds.has(g.dealerId)) mine = `${g.dealerName || 'the dealer'} folds to you${when({ foldedOn: g.dealerFoldedOn }) ? ` ${when({ foldedOn: g.dealerFoldedOn })}` : ''}, and the ${pot} pot is yours: you come out ${amount} ahead`;
      // Every fold is told already (in the moments, or one by one above): the pot, not "everyone folds" again.
      else if (g.result === 'win') mine = g.uncontested ? `the ${pot} pot is yours: you come out ${amount} ahead` : `your ${lead(g.player)} takes the ${pot} pot, and you come out ${amount} ahead`;
      else if (g.result === 'lose') mine = `${andList(g.winners || [])} ${(g.winners || []).length > 1 ? 'split' : 'takes'} the ${pot} pot, and you lose ${amount}`;
      else mine = `you split the ${pot} pot${(g.delta | 0) > 0 ? ` and come out ${amount} ahead` : (g.delta | 0) < 0 ? `, ${amount} down` : ''}`;
      told = `At ${table}, ${game}${with_}: ${moments}${ends.length ? `${ends.join(', ')}; ` : ''}${mine}.`;
    } else if (g.caught) told = `At ${table}, you lose ${amount}, and ${dealer ? dealer.name : 'the dealer'} takes your deck and throws you out for cheating.`;
    // Wave 18: a fold heads up at draw says when (before the draw, or after it in the betting).
    else if (g.result === 'fold') told = `At ${table}, ${moments}you fold your ${lead(g.player)}${Number.isInteger(g.playerFoldedOn) && g.ante ? ` ${['before the draw', 'after the draw'][g.playerFoldedOn] || 'before the draw'}` : ''} and give up ${amount}.`;
    else if (g.result === 'win') told = `At ${table}, ${moments}your ${lead(g.player)} beats ${theirs} ${hand(g.dealer)}, and you come out ${amount} ahead.`;
    else if (g.result === 'lose') told = `At ${table}, ${moments}${theirs} ${lead(g.dealer)} beats your ${hand(g.player)}, and you lose ${amount}.`;
    else told = `At ${table}, ${moments}your ${lead(g.player)} ties ${theirs} ${hand(g.dealer)}, and you split the pot.`;
    const street = g.caught && g.outsideName ? ` You end up outside on ${String(g.outsideName).replace(/^The /, 'the ')}.` : '';
    // A marked deck that was not caught: the roll went the player's way.
    const marks = g.deck && g.tier && !g.caught ? ` ${dealer ? dealer.name : 'The dealer'} never spots the marks.` : '';
    // New terms at this table (wave 18; wave 19, QA D14): the dealer states them as the player sits down, before the hand is told.
    const terms = g.rules ? `"${String(g.rules).replace(/\.$/, ',')}" ${dealer ? dealer.name : 'the dealer'} says as you sit down. ` : '';
    return terms + told + marks + street;
  }
  /* A good the words name, preferring one sold here and then the cheapest
     (Town.goodsFor's scoring): "a beer" at the bar is a bottle, not a case. */
  function mockGood(text, l) {
    const t = String(text || '').toLowerCase();
    let best = [];
    let top = 0;
    for (const g of TABLES.items.goods) {
      const words = g.name.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !['the', 'and', 'for', 'set', 'ten', 'five', 'dozen', 'cup', 'jug', 'bed', 'hot', 'old', 'round', 'pair', 'some'].includes(w));
      const score = words.filter(w => new RegExp(`(^|[^a-z])${w.replace(/s$/, '')}s?([^a-z]|$)`).test(t)).length;
      if (score > top) { best = [g]; top = score; } else if (score && score === top) best.push(g);
    }
    if (!best.length) return null;
    const own = Town.goodsFor(t);
    if (own && best.includes(own) && (best.length === 1 || mockSold(own, l))) return own;
    return best.find(g => mockSold(g, l)) || best.slice().sort((x, y) => x.price - y.price)[0];
  }
  /* What a good is (content may tag kind: good, service, drink or food). */
  function goodKind(g) {
    if (g && ['good', 'service', 'drink', 'food'].includes(g.kind)) return g.kind;
    const n = String((g && g.name) || '').toLowerCase();
    if (/\b(beer|whiskey|bourbon|shot|coffee|soda|energy drink)\b/.test(n) && !/\b(case|fifth|bottle of bourbon)\b/.test(n)) return 'drink';
    if (/\b(catfish|cheeseburger|fries|biscuit|basket|sandwich|plate)\b/.test(n)) return 'food';
    if (/\b(night at|rented|tune-up|patched|tow)\b/.test(n)) return 'service';
    return 'good';
  }
  /* Where it is sold: a good named for a place only there; else by what it is
     and the kind of place (drinks and food at a bar or the station, a room at
     the motel, bait at the landing, pawned things at the pawn shop, the rest
     at the station or the pawn shop). Never at a shut door. */
  const SOLD_AT = [
    [/\b(night at|room|motel)\b/, ['motel', 'inn']],
    [/\b(crickets|night crawlers|rod and reel|johnboat|outboard gas)\b/, ['marina', 'gas']],
    [/\b(pawned|used shotgun|guitar|wedding ring)\b/, ['pawn']],
    [/\b(tune-up|tire|tow)\b/, ['gas']],
    // Wave 4 (playtest D2): hair is done at home, at Riverbend, not at the station.
    [/\b(haircut|trim|shave|perm|hair)\b/, ['trailerpark', 'salon', 'barber']]
  ];
  function mockSold(g, l) {
    if (!g || !l || l.away === true) return false;
    const s = State.current;
    let shut = !!l.closed;
    shut = shut || !!State.isClosed(l);
    if (shut) return false;
    const name = g.name.toLowerCase().replace(/[’‘]/g, "'");
    const named = s ? s.locations.find(x => x.away !== true && [x.name].concat(Array.isArray(x.aka) ? x.aka : []).some(k => {
      const k2 = String(k || '').toLowerCase().replace(/[’‘]/g, "'").replace(/^the /, '');
      const poss = (/^([a-z]+'s)\b/.exec(k2) || [])[1];
      return (k2.length >= 5 && name.includes(k2)) || (poss && name.includes(poss));
    })) : null;
    if (named) return named.id === l.id;
    const rule = SOLD_AT.find(([re]) => re.test(name));
    if (rule) return rule[1].includes(l.type);
    const kind = goodKind(g);
    if (kind === 'drink' || kind === 'food') return ['bar', 'tavern', 'inn', 'gas', 'diner', 'cafe'].includes(l.type);
    return ['gas', 'pawn', 'shop', 'store', 'market', 'general', 'marina'].includes(l.type);
  }
  function mockNarration(c) {
    const s = State.current;
    const a = c.action || {};
    const loc = String(c.locationName || (c.location && c.location.name) || 'this place').replace(/^The /, 'the ');
    const mode = c.mode || 'normal';
    const phase = (s && s.time.phase) || 'day';
    const key = `${(s && s.meta.turn) || 0}|${c.input || ''}|${a.actionType || ''}`;
    const out = [];
    if (c.timePassed && mode !== 'arrival') out.push(sentence(c.timePassed.replace(/^the player\b/i, 'you').replace(/\bthey are\b/g, 'you are')));
    // A walk before the action (Pipeline's walkFirst): one short sentence, first.
    if (c.moved) out.push(`You walk over to ${String(c.moved.toName).replace(/^The /, 'the ')}.`);
    const np = c.notPresent || [];
    const missing = np.filter(x => x.reason === 'does_not_exist' || x.reason === 'unproven').map(x => x.label);
    if (missing.length) out.push(`There is no ${missing.join(' and no ')} here.`);
    const away = np.filter(x => x.reason === 'not_here' || x.reason === 'gone');
    if (away.length) out.push(`${away[0].label} is not here.`);
    // The card game's one roll is whether the dealer catches a marked deck (wave 10): mockGamble tells it, never as "it works".
    if (c.roll && !(c.gamble && c.gamble.played)) out.push(MOCK_TIER[c.roll.tier] ? MOCK_TIER[c.roll.tier](c.roll) : `${capFirst(c.roll.stat)} roll: ${c.roll.label}.`);
    if (c.pressed) out.push('The answer does not change.');
    // Asking the dealer for table stakes (wave 18, amendment 2): what came of it, as the engine settled it.
    if (c.stakes) {
      const n = c.stakes.dealerName || 'The dealer';
      out.push({
        yes: `You ask ${n} for table stakes, and ${n} agrees: no limit at the card table for the rest of today.`,
        no: `You ask ${n} for table stakes, and ${n} keeps the house limit.`,
        fumble: `You push ${n} for table stakes, and it sours the mood: ${n} won't hear of it again today.`,
        cold: `${n} won't hear of table stakes from you.`,
        again: `${n} has said no to table stakes once today, and says it again.`,
        already: `It is table stakes at ${n}'s table today already.`
      }[c.stakes.outcome] || '');
    }
    // Due events, told to the player ("you", not their name), are worked in at the end: every one that fits, the rest waiting (ctx.dueUntold, below).
    const dueFrom = (c.due || []).filter(d => sentence(secondPerson(d && d.text)));
    let due = dueFrom.map(d => sentence(secondPerson(d.text)));
    // Say mode: the answer comes before anyone arriving or leaving, so it is never the line cut.
    const lineBudget = Math.max(1, (mode === 'normal' ? (c.moved ? 4 : isSay(c.speech) ? 4 : 3) : 6) - due.length);
    // A bet said aloud is told as the hand (wave 11, H2: the demo plays the same game), not as a reply.
    const said = isSay(c.speech) && !c.beat && mode !== 'arrival' && !c.gamble ? mockReply(c, lineBudget - out.length) : null;
    if (said) out.push(...said.lines);
    // The comings and goings are told after what the action came to (wave 3, playtest D2: a knockdown or a card loss is never the line cut).
    const scenery = [];
    // An arrival or a look names who is here, and who came in among them (wave 8, the final pass: after /skip the evening crowd was "here" and then "arrived").
    const listsHere = !c.beat && (mode === 'arrival' || a.actionType === 'look');
    if (c.sceneChange) {
      const names = ids => ids.map(id => { const n = State.npc(id); return n ? n.name : id; });
      // Wave 14 (QA #15): whoever the action was with (its targets) is in the scene already, never one more arrival after it. Wave 15: after a hand of cards only those who sat at it (the dealer and the seats) are left out; whoever else came in still arrives.
      const seated = Pipeline.seatedAt(c.gamble);
      const came = listsHere ? [] : names(c.sceneChange.arrived.filter(id => !(a.targets || []).includes(id) && !seated.includes(id)));
      if (came.length) {
        scenery.push(`${andList(came)} ${came.length > 1 ? 'arrive' : 'arrives'}.`);
        scenery.push(vary([`${came[0]} sees you there.`, `${came[0]} looks your way.`, `${came[0]} gives the room a once-over.`], key));
      }
      if (c.sceneChange.left.length) scenery.push(`${andList(names(c.sceneChange.left))} ${c.sceneChange.left.length > 1 ? 'have' : 'has'} left.`);
    }
    if (c.defeated) out.push('You go down hard.');
    if (c.consequence) out.push(sentence(c.consequence.replace(/\s*\([^)]*\)$/, '')));
    const target = s && (a.targets || []).map(id => State.npc(id)).find(n => n && (c.presentIds || []).includes(n.id));
    const tkey = `${key}|${target ? target.id : ''}`;
    const here = s ? State.loc(s.player.locationId) : null;
    if (c.beat) {
      const names = (c.present || []).map(n => n.name);
      out.push(names.length ? `You wait. ${andList(names)} ${names.length > 1 ? 'carry' : 'carries'} on, and ${names[0]} speaks first: "Well?"` : 'You wait. Nothing happens for a while.');
    } else if (mode === 'arrival' || a.actionType === 'look') {
      const l = s && c.location ? State.loc(c.location.id) : null;
      out.push(mode === 'arrival' ? `You arrive at ${loc}.` : `You take in ${loc}.`);
      if (l && l.description) out.push(l.description);
      const arrived = c.sceneChange && Array.isArray(c.sceneChange.arrived) ? c.sceneChange.arrived : [];
      const names = (c.present || []).filter(n => !arrived.includes(n.id)).map(n => n.name);
      const came = (c.present || []).filter(n => arrived.includes(n.id)).map(n => n.name);
      const comeIn = came.length ? `${andList(came)} ${came.length > 1 ? 'come' : 'comes'} in` : '';
      out.push(names.length ? `${andList(names)} ${names.length > 1 ? 'are' : 'is'} here${comeIn ? `, and ${comeIn}` : ''}.` : comeIn ? `${comeIn}.` : 'Nobody here pays you any attention.');
    } else if (said) {
      // The reply is already told, before the scene changed.
    } else if (a.actionType === 'move') {
      const d = c.destination;
      // Shut, and why: barred from it ("not welcome there until day N") is not the same as a door shut for the day.
      const why = d && d.closed ? String(d.why || '') : '';
      const ban = /not welcome there(?: until day (\d+))?/.exec(why);
      const shutDay = /closed on (\w+)/.exec(why);
      const shut = !d || !d.closed ? '' : ban ? `, but you are not welcome there${ban[1] ? ` until Day ${ban[1]}` : ''}` : shutDay ? `, but it is shut on ${shutDay[1]}` : ', but it is shut';
      out.push(d ? `You make your way to ${d.name.replace(/^The /, 'the ')}${shut}.` : 'You look for the way there and do not find it.');
      if (d && !d.closed) out.push(d.present && d.present.length ? `${andList(d.present)} ${d.present.length > 1 ? 'are' : 'is'} there.` : 'Nobody there pays you any attention.');
    } else if (a.actionType === 'buy') {
      // The same reckoning as the mock bookkeeper: sold here, open, and affordable.
      const g = s ? mockGood(c.input || a.summary, here) : null;
      const price = g ? Tables.price(g.name) : null;
      if (target) out.push(mockGreeting(target, tkey));
      if (!g) out.push('Nobody here sells anything like that.');
      else if (!mockSold(g, here)) out.push(`Nobody at ${loc} sells that.`);
      else if (price !== null && s.player.gold < price) out.push(`It's ${money(price)}, and you don't have that much on you.`);
      else out.push(vary(['The deal is done quickly.', 'Money changes hands, and that is that.'], key));
    } else if (a.actionType === 'gamble') {
      out.push(mockGamble(c, key));
    } else if (target && a.actionType === 'attack') {
      // The engine's knockdown (the third clean hit: ctx.knockedDown) and arrest (ctx.arrest.plan) are told in this narration.
      const down = c.knockedDown === target.id || (c.roll && c.roll.success && /\bknocks?\s+(?:\w+\s+){0,2}out\b/i.test(c.input || ''));
      out.push(down ? `${target.name} goes down hard and stays down.` : `${target.name} ${c.roll && c.roll.success ? 'staggers back' : 'fights back'}.`);
      if (c.arrest && c.arrest.plan && c.arrest.plan.text) out.push(sentence(secondPerson(c.arrest.plan.text)));
    } else if (target && a.actionType === 'intimidate') {
      out.push((target.attitude | 0) <= -25 ? `${target.name} has heard enough. "Get out of my sight."` : c.roll && c.roll.success ? `${target.name} backs off a step.` : `${target.name} goes still. "Say that again."`);
    } else if (target && (a.actionType === 'give' || a.actionType === 'sell')) {
      out.push(mockGreeting(target, tkey));
      // Money the player does not have is not handed over (wave 4, playtest D3).
      const sum = a.actionType === 'give' ? MOCK_STAKE.exec(String(c.input || '').toLowerCase()) : null;
      const want = sum ? parseInt(sum[1] || sum[2], 10) : 0;
      if (s && want > (s.player.gold | 0)) out.push(`You reach for ${money(want)} and come up short: you have ${money(s.player.gold | 0)} on you.`);
      // Money is counted; a thing is not (wave 5, playtest D9: a letter).
      else out.push(a.actionType === 'give' ? vary(want ? [`${target.name} takes it.`, `${target.name} counts it and puts it away.`] : [`${target.name} takes it.`, `${target.name} looks it over and keeps it.`], tkey) : vary([`${target.name} looks it over.`, `${target.name} turns it over twice.`], tkey));
    } else if (c.stakes) {
      // Asking for table stakes (wave 18): told above, with no other answer from the dealer.
    } else if (target) {
      // A social roll is answered (a place and a time, or a plain no) in place of a greeting.
      const told = Dice.SOCIAL_ACTIONS.includes(a.actionType) ? mockOutcome(target, c, s, tkey) : null;
      out.push(told || mockGreeting(target, tkey));
      if (c.rumour && c.rumour.npcId === target.id) out.push(`${target.name} mentions something: "${c.rumour.text}"`);
      else if (!told && a.actionType === 'talk') {
        const news = freshNews(s);
        if (news) out.push(`${target.name} brings up the news: ${lowerFirst(news)}.`);
      }
    } else if (a.actionType === 'take') {
      const it = s && (a.targets || []).filter(id => /^item_/.test(id)).map(id => State.entityById(id)).find(Boolean);
      if (it) out.push(`You pick up the ${lowerFirst(it.name)}.`);
    } else if (a.actionType === 'search' && !c.roll && !(a.targets || []).length && !(c.created || []).length) {
      // A search for nothing in particular (wave 8): it takes a while and turns up nothing to keep.
      out.push(vary([`You look around ${loc} for a while and turn up nothing worth keeping.`, `You poke around ${loc} for a while; nothing turns up that you would carry off.`], key));
    }
    out.push(...scenery);
    for (const made of (c.created || []).filter(x => x.kind === 'npc')) out.push(`${capFirst(article(made.role))} ${made.role} called ${made.name} is here.`);
    for (const made of (c.created || []).filter(x => x.kind === 'item' && !x.carried)) out.push(`You find ${article(made.name)} ${lowerFirst(made.name)} here.`);
    if (!out.length && !due.length) out.push(vary([`At ${loc}, nothing pushes back yet.`, `Nothing at ${loc} gets in your way.`, `${capFirst(loc)} carries on around you.`], key));
    if (out.length + due.length < 2) {
      // Wave 11 (L8): not "nobody pays you much mind" at a hand, and not "it stays quiet" when you were thrown out.
      const g = c.gamble && c.gamble.played ? c.gamble : null;
      const fill = g && g.caught ? [`Behind you, ${loc} carries on without you.`]
        : [`Around you, ${loc} goes on with its ${phase}.`].concat(g ? [] : [`Nobody at ${loc} pays you much mind.`], [`It stays quiet at ${loc} for now.`]);
      out.push(vary(fill, key));
    }
    let body = out.slice(0, lineBudget);
    /* Keep to the style check's limit (Style.WORD_LIMITS) like a real
       narrator would: a place's description shrinks to its first sentence
       and then goes, other scenery goes from the end, and only then are the
       due events cut to their first clause. The roll stays. */
    const limit = (mode === 'normal' ? Style.WORD_LIMITS.normal : Style.WORD_LIMITS.zoom) - 5;
    const words = () => wordCount(body.concat(due).join(' '));
    const desc = s && c.location ? (State.loc(c.location.id) || {}).description : null;
    const keep = new Set(body.filter(x => /\broll[,:]/.test(x) || x === 'You go down hard.' || x.includes(' mentions something: ') || (said && said.core.includes(x))));
    const at = desc ? body.indexOf(desc) : -1;
    if (words() > limit && at >= 0) body[at] = firstSentence(desc).trim();
    if (words() > limit && at >= 0) body.splice(at, 1);
    for (let i = body.length - 1; i > 0 && words() > limit; i--) if (!keep.has(body[i])) body.splice(i, 1);
    // A due event shrinks to its first sentence (the council's count is in it), then to its first clause; the first one
    // (the engine puts the scene, or a person come for the player, first) stays whole.
    // Wave 19 (QA D16): a sentence ends at its full stop, never at "Dr." or an initial (firstSentence).
    if (words() > limit) due = due.map((t, i) => (i === 0 ? t : firstSentence(t)));
    /* Never cut inside a sentence (wave 6, the round-5 playtest's D12: the
       wave-5 D8 fix still made "From the holding cell." and "Boyd Teague
       comes up on you from the side.", the blow lost): a due event is told
       whole, or to its first sentence. Wave 8 (the final pass): as many as
       a turn holds (World.MAX_DUE) are told, briefly if need be, before any
       waits (three at dawn dropped the third while the engine marked it
       done, and the demo never named the blackmail's price): the first to
       its first sentence too, then the line that says how the time passed
       (the feed's divider has the day; the due events say what it brought),
       then the longest without its middle clauses (mockBrief: the subject,
       the first verb and the last clause stay), one at a time. One that
       does not fit waits, and is not marked done: ctx.dueUntold names it,
       and Pipeline hands it to the next narration (a dawn after many nights
       can bring six). */
    if (words() > limit) due[0] = firstSentence(due[0]);
    const untold = [];
    const wait = () => { due.pop(); untold.unshift(dueFrom[due.length].seedId); };
    while (words() > limit && due.length > World.MAX_DUE) wait();
    const passed = c.timePassed && mode !== 'arrival' ? sentence(c.timePassed.replace(/^the player\b/i, 'you').replace(/\bthey are\b/g, 'you are')) : null;
    if (words() > limit && due.length && passed && body[0] === passed && !keep.has(body[0])) body.splice(0, 1);
    while (words() > limit) {
      const longest = due.map((t, i) => i).filter(i => mockBrief(due[i]) !== due[i]).sort((x, y) => wordCount(due[y]) - wordCount(due[x]) || y - x)[0];
      if (longest === undefined) break;
      due[longest] = mockBrief(due[longest]);
    }
    while (words() > limit && due.length > 1) wait();
    if (isObj(c)) c.dueUntold = untold.filter(Boolean);
    return body.concat(due).join(' ');
  }
  /* A due event's sentence without its middle (wave 8): "walks up to you,
     reads your name off a folded paper, and says the money is due" ->
     "walks up to you and says the money is due"; "told Carter, in front of
     the whole bar, that ..." -> "told Carter that ...". Never a fragment:
     the subject, the first verb and the last clause stay. */
  function mockBrief(t) {
    return String(t || '')
      .replace(/^([^,"“]+), [^,"“]+, and (?=[a-z])/, '$1 and ')
      .replace(/, (?:in front of|in|at|on|with|from|for|by|after|before|under|over|near|behind|across|without|like) [^,"“]*,(?= )/, '');
  }
  /* The memory rewrite (Upgrade), by rule: keep weight 2 and up, cut each
     line to its first twelve words, merge lines that come out the same (from
     lists them all), and keep at most State.MEMORY_MAX per person (the
     heaviest, then the newest; the cap the real call is given), in their
     original order. */
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
        const keep = lines.slice().sort((a, b) => b.weight - a.weight || b.at - a.at).slice(0, State.MEMORY_MAX || 12);
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
        const hit = toks.some(t => new RegExp(`(^|[^a-z])${escRe(t)}'s\\b.*\\b(house|place)\\b`).test(lower)
          || (opts && opts.lives && new RegExp(`(^|[^a-z])${escRe(t)}\\b`).test(lower) && /\blives\b/.test(lower)));
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
    const listed = (packet.everyone || []).filter(x => x && x.name);
    const out = [];
    for (const p of packet.people || []) {
      const first = String(p.name || '').split(/\s+/)[0];
      const texts = (p.mentions || []).map(m => String(m.text || '').replace(/[’‘]/g, "'"));
      const nameRe = new RegExp(`(^|[^A-Za-z])${escRe(first)}(?![A-Za-z])`, 'g');
      // Pronouns: the words around each mention of the name.
      const near = [];
      for (const t of texts) for (let m = nameRe.exec(t); m; m = nameRe.exec(t)) near.push(t.slice(Math.max(0, m.index - 40), m.index + first.length + 60));
      const said = inferPronouns(near.join(' '));
      let relTo = null;
      let relation = null;
      for (const t of texts) {
        const pats = [
          new RegExp(`\\b([A-Z][a-z]+)'s\\s+([a-z]+),?\\s+${escRe(first)}\\b`),
          new RegExp(`\\b(?:his|her|my)\\s+([a-z]+),?\\s+${escRe(first)}\\b`, 'i'),
          new RegExp(`\\b${escRe(first)},\\s+([A-Z][a-z]+)'s\\s+([a-z]+)\\b`)
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
  /* Say mode: words that insult, by what they say (the bookkeeper hears the
     words, never the word "insult"), and the memory each leaves, in the
     MEMORY_RULES form ("called me a liar", "told me to shut up"). */
  const MOCK_INSULTS = [
    [/\bfuck (off|you)\b/, () => 'told me to fuck off'], [/\bshut up\b/, () => 'told me to shut up'], [/\bgo to hell\b/, () => 'told me to go to hell'],
    [/\b(piss off|get lost|drop dead)\b/, m => `told me to ${m[1]}`],
    [/\b(idiot|moron|liar|coward|crook|fool|loser|bitch|bastard|asshole|jackass|dumbass|redneck|drunk|cheat|thief)\b/, m => `called me ${article(m[1])} ${m[1]}`],
    [/\b(stupid|useless|pathetic|ugly|worthless|trash)\b/, m => `called me ${m[1]}`]
  ];
  const MOCK_THREATS = /\b(or else|i'll hurt|i will hurt|you'll regret|you will regret|i'll kill|i will kill|i'll burn|watch your back|you're dead)\b/;
  const MOCK_HELP = /\b(i help|i'll help|help (?:him|her|them) (?:out|load|carry|move|with)|work for|works for|side with|sides with|vote for|carry .+ for|deliver .+ for|load .+ for)\b/;
  const MOCK_HINDER = /\b(sabotage|sabotages|expose|exposes|rat out|rats out|report|reports|turn in|turns in|wreck|wrecks|tip off)\b/;
  const MOCK_SORRY = /\b(apologi[sz]e|apologi[sz]es|sorry|make it up to|make amends)\b/;
  const MOCK_MONEY = /\$\s?(\d+)|\b(\d+)\s*(?:dollars|bucks)\b/;
  /* The open obligations (State.obligations once it exists, else the
     player's list read directly). */
  function openObligations(s) {
    // What is still owed: the open ones and the missed ones that can be made good (paid late).
    return s ? State.obligations('owed') : [];
  }
  function mockBookkeep(packet) {
    const c = packet.context || packet;
    const a = c.action || {};
    const s = State.current;
    const input = String(c.input || '').toLowerCase().replace(/[’‘]/g, "'");
    const out = {
      attitudeChanges: [], newMemories: [], goldDelta: null, hpDelta: null, itemsGained: [], itemsLost: [], conditionsAdded: [],
      playerLocationId: a.actionType === 'move' && a.destinationId ? a.destinationId : null,
      npcKnownToPlayer: [], threadUpdates: [], clockNudges: [], newSeeds: [], rumoursHeard: [], placesRevealed: [],
      npcFates: [], memoriesSettled: [], obligationsSettled: [], journalEntry: null
    };
    // The three fields CONTRACTS section 10 adds go out only once the engine reads them.
    const known = k => Array.isArray(State.RECORD_KEYS) && State.RECORD_KEYS.includes(k);
    /* Wave 28 (the integration plan's 5.7): once the engine reads the
       bookkeeper's socialEvents, the demo sends events in the wire's own
       words ("npc_x insulted: called me a liar") in place of attitude
       numbers, memories and settled memories, and nothing at all for what
       the engine records itself (a threat, a fight, a theft, a gift, a debt
       paid, time together). */
    const events = known('socialEvents');
    if (events) { out.socialEvents = []; delete out.attitudeChanges; delete out.newMemories; delete out.memoriesSettled; }
    const finish = () => { for (const k of ['npcFates', 'memoriesSettled', 'obligationsSettled']) if (!known(k)) delete out[k]; return out; };
    if (!s) return finish();
    // One event a person from the demo (the wire allows two).
    const event = (n, ev, words) => { if (events && !out.socialEvents.some(x => x.startsWith(`${n.id} `))) out.socialEvents.push(`${n.id} ${ev}: ${cleanText(words, 120)}`); };
    // A home someone names in a quoted line becomes a place (State.apply checks it like any other).
    const told = mockHomeFrom(c.narration, { lives: true, nearId: s.player.locationId });
    if (told) out.placesRevealed = [told];
    const presentIds = c.presentIds || State.npcsAt(s.player.locationId).map(n => n.id);
    const npcs = (a.targets || []).map(id => State.npc(id)).filter(n => n && presentIds.includes(n.id));
    const first = npcs[0];
    const ok = !c.roll || c.roll.success;
    // The legacy demo's numbers and memories (before the engine read socialEvents): nothing once it does.
    const remember = (n, text, weight) => { if (!events && !out.newMemories.some(m => m.npcId === n.id)) out.newMemories.push({ npcId: n.id, text, weight }); };
    const feel = (n, delta) => { if (!events && !out.attitudeChanges.some(x => x.npcId === n.id)) out.attitudeChanges.push({ npcId: n.id, delta }); };
    const said = (n, re) => (n.memories || []).some(m => re.test(m.text));
    const again = (n, text) => (said(n, /\b(insulted|called me|told me to)\b/i) ? `${text} again` : text);
    if (first && ['talk', 'persuade', 'deceive', 'intimidate', 'buy', 'sell', 'give', 'attack', 'gamble'].includes(a.actionType)) {
      // A stranger introduced, or someone known (a loose end's person) not yet met face to face (wave 3, playtest N6).
      out.npcKnownToPlayer = npcs.filter(n => !n.knownToPlayer || !Number.isInteger(n.metTurn)).map(n => n.id);
    }
    // Insults: the words themselves in Say mode, the word "insult" in a Do line. Wave 28: an insult is the bookkeeper's event (the engine compounds it, and with two or more watching makes it a humiliation); a threat is the engine's, from the roll.
    if (first && isSay(c.speech)) {
      const hit = MOCK_INSULTS.map(([re, mem]) => { const m = re.exec(input); return m ? mem(m) : null; }).find(Boolean);
      if (MOCK_THREATS.test(input)) { feel(first, -20); remember(first, 'threatened me', 3); }
      else if (hit) {
        const before = said(first, /\b(insulted|called me|told me to)\b/i);
        feel(first, -15);
        remember(first, again(first, hit), before ? 3 : 2);
        event(first, 'insulted', hit);
      }
    } else if (first && /\b(insult|insults|mock|mocks|sneer|curse)/.test(input)) {
      const before = said(first, /\b(insulted|called me|told me to)\b/i);
      feel(first, -15);
      remember(first, before ? 'insulted me again' : 'insulted me', before ? 3 : 2);
      event(first, 'insulted', 'insulted me');
    }
    // Asking the dealer for table stakes (wave 18) changes no feeling: the engine settled it (a fumble's -5 is recorded already). Wave 28: a persuasion that works is time together, the engine's.
    if (first && a.actionType === 'persuade' && c.roll && c.roll.success && !c.stakes) feel(first, 8);
    // Making up for it: an apology that lands settles the grudge they remember (wave 28: apologised, in the words of what it is for).
    if (first && MOCK_SORRY.test(input) && ok) {
      const grudge = (first.memories || []).slice().reverse().find(m => /\b(insulted|called me|told me to|attacked|threatened)\b/i.test(m.text));
      if (grudge && !events) { out.memoriesSettled.push({ npcId: first.id, text: grudge.text }); feel(first, 10); }
      const harm = (first.memories || []).slice().reverse().find(m => isObj(m) && !m.witness && m.act !== 'own' && !State.protectedMemory(m) && Rel.harmful(m) && !Rel.settlements(m).length);
      if (harm) event(first, 'apologised', harm.text);
    }
    // Being attacked is "something major" (the bookkeeper's prompt): more than an insult, inside the ±25 clamp. Wave 28: the engine's hit or shove.
    if (first && a.actionType === 'attack') {
      feel(first, -20);
      remember(first, said(first, /\battacked\b/i) ? 'attacked me again' : 'attacked me', 3);
      // A knockout that lands lays them up (State.apply: hurt, home for two days).
      if (c.roll && c.roll.success && /\bknocks?\s+(?:\w+\s+){0,2}out\b|\bknockout\b/.test(input)) out.npcFates.push({ npcId: first.id, status: 'hurt' });
    }
    /* Wave 28, the demo's other events (the tests' rules): caught in a lie
       when the narration has them say so ("you lied"); a confidence of
       theirs when "tell me about yourself" works; a claim the player makes
       in Say mode ("I'm a surveyor") is held to them; their secret, when the
       narrator was given it (the engine holds that until wave 29). */
    if (events && first) {
      const narr = String(c.narration || '').toLowerCase().replace(/[’‘]/g, "'");
      if (/\byou lied\b/.test(narr)) {
        const lie = (first.rel && Array.isArray(first.rel.asks) ? first.rel.asks : []).slice().reverse().find(x => isObj(x) && x.act === 'deceive');
        event(first, 'lied_caught', lie && lie.about ? `lied to me: ${lowerFirst(lie.about).replace(/\.$/, '')}` : 'lied to me');
      }
      if (/\btell me about yourself\b/.test(input) && c.roll && c.roll.success) event(first, 'they_confided', 'heard me out about my life');
      const claim = isSay(c.speech) ? /\b(?:i'm|i am) (an?|the) ([a-z]+(?: [a-z]+){0,4}?)(?: from (?:the )?([a-z]+(?: [a-z]+)?))?[.!,]?(?:\s|$)/.exec(input) : null;
      if (claim && !/^(little|bit|lot|friend|stranger)\b/.test(claim[2])) {
        const sp = PRONOUN_FORMS[s.player.pronouns] || PRONOUN_FORMS.they;
        event(first, 'noted', `says ${sp.subj} ${sp.subj === 'they' ? 'are' : 'is'} ${claim[1]} ${claim[2]}${claim[3] ? ` from the ${claim[3]}` : ''}`);
      }
      // Wave 29: only when the narration shows it (two of their keys in its words), in the narration's words, never the secret field.
      if (Array.isArray(c.revealSecretFor) && c.revealSecretFor.includes(first.id) && Rel.keysIn(c.narration, Rel.keysOf(first)) >= Rel.GATES.leverage.keys) {
        const keys = Rel.keysOf(first);
        const said = String(c.narration || '').split(SENTENCE_SPLIT).find(x => Rel.keysIn(x, keys) >= 1) || String(c.narration || '');
        event(first, 'learned_secret', `let slip ${lowerFirst(cleanText(said, 110)).replace(/[.!?"]+$/, '')}`);
      }
    }
    if (first && /\b(arrest|arrests|cuff|cuffs|handcuff)\b/.test(input) && c.roll && c.roll.success) out.npcFates.push({ npcId: first.id, status: 'arrested' });
    if (a.actionType === 'take') {
      const l = State.loc(s.player.locationId);
      out.itemsGained = (a.targets || []).filter(id => /^item_/.test(id) && ((l && l.items) || []).some(i => i.id === id));
    }
    // Stealing: on a success the thing named (money goes to cash); caught, the one robbed remembers it.
    if (a.actionType === 'steal') {
      if (c.roll && c.roll.success) {
        const m = /\b(?:steal|steals|lift|lifts)\s+(?:the |a |an |some |his |her |their )?([a-z][a-z' -]*?)(?:\s+(?:from|off|out of)\b|[.!?]|\s*$)/.exec(input);
        let thing = m ? m[1].trim() : '';
        // "steal from the till", a pickpocket: money; a person's name is not a thing.
        const src = /^(?:from|off|out of)\s+(?:the |a |his |her |their )?(.+)$/.exec(thing);
        if (src) thing = /\b(till|register|wallet|purse|pocket|cash|tips)\b/.test(src[1]) ? 'money' : '';
        if (/\b(pickpocket|pickpockets|lift a purse)\b/.test(input)) thing = 'money';
        if (thing && s.npcs.some(n => Town.nameMentions(thing, n))) thing = '';
        if (/^(money|cash|wallet|purse|tips|till)$/.test(thing)) { out.goldDelta = 20; out.journalEntry = `Stole $20${first ? ` from ${first.name}` : ''}.`; }
        else if (thing) { out.itemsGained = [capFirst(thing)]; out.journalEntry = `Stole ${article(thing)} ${thing}.`; }
      } else if (first) {
        feel(first, -20);
        // In their words, about the player (wave 5, playtest D7): never "caught me stealing".
        remember(first, `${s.player.name} tried to steal from me`, 3);
      }
    }
    const l = State.loc(s.player.locationId);
    // Buying, drinking and eating: only where it is sold and open, and only what can be paid for. A drink or a meal is had, not carried.
    if (a.actionType === 'buy') {
      const g = mockGood(c.input || a.summary, l);
      const price = g ? Tables.price(g.name) : null;
      if (g && price !== null && mockSold(g, l) && s.player.gold >= price) {
        out.goldDelta = -price;
        const kind = goodKind(g);
        if (kind === 'drink') {
          out.journalEntry = `Had ${article(g.name)} ${lowerFirst(g.name)} for ${money(price)}.`;
          if (/\b(whiskey|bourbon|shot)\b/i.test(g.name)) out.conditionsAdded = [{ name: 'A little drunk', effect: '-1 wits', untilDay: s.time.day }];
        } else if (kind === 'food') {
          out.journalEntry = `Ate ${article(g.name)} ${lowerFirst(g.name)} for ${money(price)}.`;
          if (s.player.hp < s.player.maxHp) out.hpDelta = 1;
        } else {
          out.itemsGained = [g.name];
          out.journalEntry = `Bought ${lowerFirst(g.name)} for ${money(price)}.`;
        }
      }
    }
    // Selling, at the pawn shop: half the listed price, or ten for anything unlisted.
    if (a.actionType === 'sell' && l && l.type === 'pawn') {
      const it = s.player.inventory.find(i => i.id === a.usesItemId);
      if (it) {
        const listed = Tables.price(it.name);
        const got = listed ? Math.max(1, Math.round(listed / 2)) : 10;
        out.itemsLost = [it.id];
        out.goldDelta = got;
        out.journalEntry = `Sold ${lowerFirst(it.name)} for ${money(got)}.`;
      }
    }
    // Giving: money or a thing, to someone here. Paying off what is owed settles the debt and the memory of it.
    if (a.actionType === 'give' && first) {
      const m = MOCK_MONEY.exec(input);
      const it = a.usesItemId ? s.player.inventory.find(i => i.id === a.usesItemId) : null;
      if (m) {
        // More than the player has is not handed over at all, as the narration says ("come up short"; wave 5, playtest D6).
        const asked = parseInt(m[1] || m[2], 10);
        const amount = asked <= (s.player.gold | 0) ? asked : 0;
        if (amount > 0) {
          out.goldDelta = -amount;
          // Money toward what is owed them is a payment, not a gift (wave 3): no gift memory or warmth; the obligation's own onMet says what they think once it is paid.
          const owes = openObligations(s).find(o => o.npcId === first.id && (o.kind === 'debt' || o.kind === 'blackmail'));
          const left = owes && Number.isInteger(owes.amount) ? owes.amount - (owes.paid | 0) : null;
          if (owes && (left === null || amount >= left)) {
            out.obligationsSettled.push(owes.id);
            const owed = (first.memories || []).slice().reverse().find(x => !/^Loose end with /i.test(x.text) && /\b(owes? me|debt|money)\b/i.test(x.text));
            // Wave 28: paid back is the obligation's own event (onMet's paid_back): nothing from the demo.
            if (owed && !events) out.memoriesSettled.push({ npcId: first.id, text: owed.text });
            // Paid back: remembered once, by the obligation's own onMet when it has a memory there, else here.
            // Wave 27: or a socialEvent there (paid_back), which is that memory.
            if (!(Array.isArray(owes.onMet) && owes.onMet.some(e => isObj(e) && (e.op === 'addMemory' || e.op === 'socialEvent') && e.npcId === first.id))) { feel(first, 10); remember(first, `paid me back ${money(amount)}`, 2); }
            out.journalEntry = `Paid ${first.name} ${money(amount)}.`;
          } else if (owes) {
            // Part of it: the engine counts it toward the debt (the give is aimed at them).
            out.journalEntry = `Paid ${first.name} ${money(amount)} toward the ${money(owes.amount)} (${money(left - amount)} still owed).`;
          } else {
            feel(first, 5);
            remember(first, `gave me ${money(amount)}`, 2);
            out.journalEntry = `Gave ${first.name} ${money(amount)}.`;
          }
        }
      } else if (it) {
        out.itemsLost = [it.id];
        feel(first, 5);
        remember(first, `gave me ${article(lowerFirst(it.name))} ${lowerFirst(it.name)}`, 2);
        const errand = openObligations(s).find(o => o.npcId === first.id && o.kind === 'errand' && o.itemName && String(o.itemName).toLowerCase() === String(it.name).toLowerCase());
        if (errand) out.obligationsSettled.push(errand.id);
      }
    }
    // A faction's work, plainly helped or hindered (only its running clock moves).
    if (ok && a.actionType !== 'move' && !isSay(c.speech)) {
      const helps = MOCK_HELP.test(input) ? 1 : MOCK_HINDER.test(input) ? -1 : 0;
      if (helps) {
        const f = s.factions.find(x => (World.activeClock(x) && (input.includes(String(x.name).toLowerCase().replace(/^the /, '')) || npcs.some(n => n.factionId === x.id))));
        if (f) out.clockNudges = [{ factionId: f.id, delta: helps }];
      }
    }
    // "Only record changes the narration actually shows": the rumour is heard when the narration tells it.
    if (c.rumour && first && c.rumour.npcId === first.id && String(c.narration || '').includes(c.rumour.text)) out.rumoursHeard = [c.rumour.id];
    // A meeting the narration shows agreed (wave 22, the demo's "meet me at <place> <time>"): one seed, as the bookkeeper's prompt asks.
    const meet = mockMeeting(c);
    if (meet && String(c.narration || '').includes(mockMeetLine(meet))) {
      out.newSeeds = [{ effect: `${meet.npc.name} meets ${s.player.name} at ${String(meet.place.name).replace(/^The /, 'the ')} ${meet.when}, as agreed.`, triggerType: 'location', triggerValue: meet.place.id }];
    }
    // Something asked of the player that the narration shows (wave 26, the demo's "what do you want from me"): one seed, by its day.
    const asked = mockAsk(c);
    if (asked && !out.newSeeds.length && String(c.narration || '').includes(mockAskLine(asked))) {
      out.newSeeds = [{ effect: `${asked.npc.name} wants ${asked.thing} from ${s.player.name} by Day ${asked.day} (${State.weekday(asked.day)}); it will be worth ${s.player.name}'s while.`, triggerType: 'day', triggerValue: String(asked.day) }];
    }
    return finish();
  }
  /* The chronicle, by rule, the way SYSTEM.chronicle asks for it: the day
     stamp first ("Day 1:", "Days 1-2:"), what the player did (their words),
     then "Open:" and what is unresolved (the open threads they know and the
     open obligations), under 80 words. */
  function mockChronicle(entries) {
    const listed = Array.isArray(entries) ? entries : [];
    const from = listed.length ? listed[0].turn : 0;
    const to = listed.length ? listed[listed.length - 1].turn : 0;
    const days = listed.map(e => e && e.day).filter(Number.isInteger);
    const stamp = !days.length ? `Turns ${from}-${to}` : days[0] === days[days.length - 1] ? `Day ${days[0]}` : `Days ${days[0]}-${days[days.length - 1]}`;
    const head = `${stamp} (turns ${from} to ${to}, mock chronicle):`;
    const s = State.current;
    const open = [];
    if (s) {
      for (const t of s.threads || []) if (t.status === 'open' && t.knownToPlayer) open.push(lowerFirst(t.title));
      for (const o of openObligations(s)) open.push(`${cleanText(o.text, 60)}${Number.isInteger(o.dueDay) ? ` by day ${o.dueDay}` : ''}`);
    }
    // Whole words only: a cut line ends at a word with "…", and a quote is never left open ("who sold Ambe").
    const clip = (t, n) => {
      const x = cleanText(t, 4000);
      if (x.length <= n) return x;
      const cut = x.slice(0, n + 1).replace(/\s+\S*$/, '').replace(/[\s,;:.]+$/, '');
      return (cut || x.slice(0, n)) + '…';
    };
    const tail = `Open: ${open.length ? open.slice(0, 4).map(o => clip(o, 80)).join('; ') : 'nothing settled yet'}.`;
    const did = listed.map(e => (isSay(e) ? `said "${clip(e.input, 50)}" to ${sayTo(e)}` : clip(e && e.input, 60))).filter(Boolean);
    const room = Math.max(4, 79 - wordCount(head) - wordCount(tail));
    // What fits, item by item: an item that does not fit whole is left out (the first one is clipped to fit).
    const kept = [];
    for (const d of did) {
      if (wordCount(kept.concat(d).join('; ')) <= room) { kept.push(d); continue; }
      if (!kept.length) kept.push(/"/.test(d) ? d.replace(/"([^"]*)"/, (m, q) => `"${q.split(/\s+/).slice(0, Math.max(1, room - 4)).join(' ').replace(/[,;:.…]+$/, '')}…"`) : d.split(/\s+/).slice(0, room).join(' ').replace(/[,;:.]+$/, '') + '…');
      break;
    }
    let body = (kept.length ? kept.join('; ') : 'nothing of note').replace(/[;,:]$/, '');
    if (!/[.!?…"]$/.test(body)) body += '.';
    return `${head} ${body} ${tail}`;
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
      Mock.calls.push({ method, text: packet && typeof packet.text === 'string' ? packet.text : null, input: packet && packet.input, mode: packet && packet.mode });
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
    // Wave 28: read as the live reply is (recordFromWire), so the demo's event lines go through the same tolerant reader.
    async bookkeep(packet) {
      const canned = Mock.take('bookkeep', packet);
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      const auto = mockBookkeep(packet || {});
      return { result: recordFromWire(isObj(canned) ? Object.assign(auto, canned) : auto), usage: MOCK_ZERO, model: 'mock' };
    },
    async chronicle(entries) {
      const canned = Mock.take('chronicle', { text: null });
      if (isObj(canned) && canned.refusal) return Mock.refusal(canned);
      return { result: typeof canned === 'string' ? canned : mockChronicle(entries), usage: MOCK_ZERO, model: 'mock' };
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
  return Object.assign(Mock, { MOCK_ROMANCE, MOCK_MORE });
})();

