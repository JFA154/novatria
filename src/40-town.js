// ===== Module: Town =====
/* Town data at new game (copied into state by State.newGame), validation of a
   TOWN_DATA object, plausibility of `new:` targets, loose ends at character
   creation, and the local opening scene. */
const Town = (() => {
  function data() { return State.town || TOWN_DATA; }
  /* A deep copy of a TOWN_DATA object with every runtime default filled in,
     ready to become the world part of a new game's state. */
  function instantiate(townData) {
    const t = deepCopy(townData);
    t.locations = t.locations.map(l => Object.assign({ discovered: true, closed: false }, l));
    /* A cast member's home is a location id in the town data; in a game it
       is { locationId, phases }: the phases the schedule has them there. */
    const homeOf = n => {
      const l = t.locations.find(x => x.id === n.home);
      return { locationId: n.home, phases: l ? PHASES.filter(p => ((l.npcIdsBySchedule || {})[p] || []).includes(n.id)) : [] };
    };
    t.npcs = t.npcs.map(n => {
      const o = Object.assign({ tags: [], memories: [], alive: true, knownToPlayer: false, status: 'free', attitude: 0, relations: [] }, n,
        { pronouns: validPronouns(n.pronouns) || inferPronouns(`${n.role || ''} ${n.look || ''}`) });
      if (typeof n.home === 'string' && n.home) o.home = homeOf(n);
      else if (!isObj(n.home)) delete o.home;
      return o;
    });
    t.factions = t.factions.map(f => Object.assign({ relations: {} }, f, { activeClock: Number.isInteger(f.activeClock) ? f.activeClock : 0 }));
    t.threads = t.threads || [];
    t.seeds = t.seeds || [];
    t.rumours = t.rumours || [];
    return t;
  }

  // ----- plausibility of `new:` targets (SPEC.md section 6 step 4) -----
  /* Never in this town, whatever the setting: monsters, magic, the
     supernatural, the futuristic, royalty and armies. */
  const IMPLAUSIBLE = ['dragon', 'dragons', 'demon', 'demons', 'devil', 'unicorn', 'griffin', 'gryphon', 'wyvern', 'basilisk', 'phoenix',
    'monster', 'monsters', 'wizard', 'wizards', 'sorcerer', 'sorceress', 'warlock', 'necromancer', 'lich', 'vampire', 'werewolf', 'zombie', 'ghost', 'ghosts',
    'spectre', 'wraith', 'troll', 'ogre', 'elf', 'elves', 'dwarf', 'dwarves', 'goblin', 'orc', 'orcs', 'fairy', 'faerie', 'pixie', 'angel',
    'god', 'goddess', 'spellbook', 'magic sword', 'magic ring', 'magic wand', 'wand', 'potion', 'potions', 'portal', 'teleporter',
    'robot', 'airship', 'spaceship', 'starship', 'alien', 'aliens', 'cyborg', 'android', 'laser', 'ray gun', 'jetpack', 'hoverboard',
    'time machine', 'flying car', 'hologram',
    'king', 'queen', 'emperor', 'empress', 'prince', 'princess', 'chosen one', 'prophecy', 'dark lord', 'army', 'treasure hoard'];
  /* Anachronisms in a low-fantasy town, ordinary in a modern one. */
  const MODERN_ONLY = ['gun', 'guns', 'pistol', 'handgun', 'rifle', 'shotgun', 'revolver', 'cannon', 'computer', 'laptop', 'phone',
    'cellphone', 'cell phone', 'smartphone', 'car', 'truck', 'pickup', 'pickup truck', 'van', 'motorbike', 'motorcycle', 'television',
    'tv', 'radio', 'camera', 'flashlight', 'cigarette', 'cigarettes', 'beer can', 'gas station', 'motel', 'police car', 'credit card'];
  /* Out of place in a modern town, ordinary in a low-fantasy one. */
  const FANTASY_ONLY = ['knight', 'knights', 'squire', 'sword', 'swords', 'longsword', 'broadsword', 'crossbow', 'musket', 'suit of armour', 'chainmail', 'catapult'];
  const PERSON_WORDS = ['man', 'woman', 'men', 'women', 'boy', 'girl', 'child', 'kid', 'person', 'someone', 'somebody', 'stranger',
    'guard', 'watchman', 'soldier', 'barmaid', 'barman', 'barkeep', 'bartender', 'innkeeper', 'cook', 'servant', 'maid', 'sailor',
    'bargeman', 'bargehand', 'boatman', 'ferryman', 'fisherman', 'fishwife', 'merchant', 'trader', 'pedlar', 'peddler', 'beggar',
    'thief', 'pickpocket', 'drunk', 'patron', 'customer', 'priest', 'monk', 'nun', 'clerk', 'scribe', 'smith', 'farmer', 'carter',
    'porter', 'labourer', 'worker', 'widow', 'minstrel', 'musician', 'healer', 'gambler', 'player', 'lad', 'lass', 'ostler',
    'groom', 'stableboy', 'potboy', 'waitress', 'cousin', 'brother', 'sister', 'mother', 'father', 'uncle', 'aunt', 'nephew',
    'niece', 'friend', 'wife', 'husband', 'son', 'daughter', 'lover', 'sweetheart', 'creditor', 'debtor', 'informer',
    'mechanic', 'deputy', 'sheriff', 'cop', 'officer', 'trooper', 'trucker', 'driver', 'cashier', 'attendant', 'waiter', 'server',
    'busboy', 'dishwasher', 'nurse', 'doctor', 'paramedic', 'teacher', 'pastor', 'preacher', 'reverend', 'janitor', 'manager',
    'bouncer', 'dealer', 'biker', 'hunter', 'ranger', 'lawyer', 'mailman', 'mayor', 'reporter', 'teenager', 'teen', 'tourist',
    'deckhand', 'roughneck', 'hitchhiker',
    'wizard', 'sorcerer', 'sorceress', 'witch', 'king', 'queen', 'prince', 'princess', 'emperor', 'empress', 'knight', 'lord', 'lady'];
  const PLACE_WORDS = ['alley', 'lane', 'street', 'yard', 'courtyard', 'shop', 'stall', 'house', 'cottage', 'room', 'cellar', 'attic',
    'loft', 'back room', 'stable', 'shed', 'warehouse', 'storehouse', 'well', 'garden', 'orchard', 'field', 'barn', 'mill', 'chapel',
    'shrine', 'bathhouse', 'den', 'workshop', 'office', 'kitchen', 'privy', 'parking lot', 'garage', 'booth', 'restroom',
    'bathroom', 'basement', 'porch', 'trailer', 'storage unit', 'motel room', 'back office', 'loading dock', 'stockroom', 'lockup'];
  function wordsRe(list) {
    const esc = list.filter(Boolean).map(w => String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    return new RegExp('\\b(' + esc.join('|') + ')\\b', 'i');
  }
  const IMPLAUSIBLE_RE = wordsRe(IMPLAUSIBLE);
  const MODERN_ONLY_RE = wordsRe(MODERN_ONLY);
  const FANTASY_ONLY_RE = wordsRe(FANTASY_ONLY);
  let personRe = null;
  let placeRe = null;
  function personWords() { return personRe || (personRe = wordsRe(PERSON_WORDS.concat(TABLES.npc.occupations || []))); }
  function guessKind(desc) {
    personWords();
    if (!placeRe) placeRe = wordsRe(PLACE_WORDS.concat(TABLES.location.types || []));
    if (personRe.test(desc)) return 'npc';
    if (placeRe.test(desc)) return 'location';
    if (properName(desc)) return 'npc';
    return 'item';
  }
  /* A description that is someone's name ("Mavis", "Mrs. Toler", "Earl
     Hux"): a title and a name, two or three capitalised words, or one that
     is a first name the tables or the town use. Returns the name, or null. */
  function properName(desc) {
    const d = cleanText(String(desc || '').replace(/^new:/i, ''), 80).replace(/[’‘]/g, "'").replace(/^(the|a|an)\s+/i, '').replace(/[.!?]+$/, '').trim();
    const words = d.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 3) return null;
    const cap = w => /^[A-Z][a-z'-]+$/.test(w);
    if (/^(mr|mrs|ms|miss|dr)\.?$/i.test(words[0]) && words.length > 1 && words.slice(1).every(cap)) return d;
    if (!words.every(cap)) return null;
    if (words.length > 1) return d;
    const firsts = TABLES.npc.firstNames.concat(NAME_PRONOUNS.she, NAME_PRONOUNS.he, ((State.current && State.current.npcs) || []).map(n => String(n.name || '').split(/\s+/)[0]));
    return firsts.includes(words[0]) ? d : null;
  }
  /* description: the text after `new:`. locationType may be any string;
     unknown types get the generic judgement (content note 5). opts.era
     ('modern' | 'fantasy') overrides the setting read from the town. */
  function plausible(description, locationType, opts) {
    const d = cleanText(String(description || '').replace(/^new:/i, ''), 200);
    if (!d) return { plausible: false, kind: 'other', reason: 'nothing was described' };
    const kind = guessKind(d);
    const modern = opts && opts.era ? opts.era === 'modern' : isModern();
    const hit = IMPLAUSIBLE_RE.exec(d) || (modern ? FANTASY_ONLY_RE : MODERN_ONLY_RE).exec(d);
    if (hit) return { plausible: false, kind, reason: `"${hit[1]}" does not exist in this town` };
    return { plausible: true, kind, reason: locationType ? `ordinary enough for a ${locationType}` : 'ordinary enough' };
  }

  // ----- naming and matching (step 4 reuses existing entities before creating) -----
  const LEAD_WORDS = new Set(['a', 'an', 'the', 'some', 'my', 'your', 'his', 'her', 'their', 'our', 'this', 'that', 'any', 'one']);
  const BREAK_WORDS = new Set(['by', 'at', 'behind', 'in', 'on', 'near', 'next', 'beside', 'under', 'over', 'from', 'with', 'of', 'who',
    'that', 'which', 'to', 'for', 'across', 'inside', 'outside', 'into', 'around', 'through', 'and', 'or', 'is', 'are', 'was', 'lives',
    'works', 'owes', 'knows', 'has', 'keeps', 'runs']);
  const TITLES = new Set(['father', 'mother', 'miss', 'mrs', 'pastor', 'reverend', 'chief', 'officer', 'deputy', 'mayor', 'doc', 'captain', 'master', 'mistress', 'old', 'young', 'sir', 'lady', 'lord', 'brother', 'sister', 'saint', 'st']);
  function escRe(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* The core noun phrase of a description: "a barmaid behind the bar" ->
     "barmaid", "my cousin" -> "cousin", "a coil of rope" -> "coil of rope"
     (items keep "of"). At most four words. */
  function headPhrase(desc, kind) {
    const words = cleanText(String(desc || '').replace(/^new:/i, ''), 200).toLowerCase().replace(/[^a-z0-9'\- ]+/g, ' ').split(/\s+/).filter(Boolean);
    while (words.length && LEAD_WORDS.has(words[0])) words.shift();
    const out = [];
    for (const w of words) {
      if (out.length && BREAK_WORDS.has(w) && !(kind === 'item' && (w === 'of' || w === 'and'))) break;
      if (out.length && /ing$/.test(w) && kind !== 'item') break;
      out.push(w);
      if (out.length >= 4) break;
    }
    return out.join(' ');
  }
  function hasPhrase(text, phrase) {
    return !!phrase && new RegExp('(^|[^a-z])' + escRe(phrase) + "('s)?([^a-z]|$)").test(text);
  }
  function nameTokens(n) { return String(n.name || '').toLowerCase().split(/\s+/).filter(t => t.length >= 3 && !TITLES.has(t)); }
  /* The nouns a role answers to: "owner and bartender of the Low Water" ->
     "owner", "bartender"; "mayor and town clerk" -> "mayor", "town clerk";
     "head of Sturdivant Land and Timber" -> "head". */
  function rolePhrases(n) {
    const words = cleanText(String(n.role || ''), 200).toLowerCase().replace(/[^a-z0-9'\- ]+/g, ' ').split(/\s+/).filter(Boolean);
    while (words.length && LEAD_WORDS.has(words[0])) words.shift();
    const group = [];
    for (const w of words) {
      if (group.length && w !== 'and' && (BREAK_WORDS.has(w) || /ing$/.test(w))) break;
      group.push(w);
      if (group.length >= 7) break;
    }
    const out = group.join(' ').split(/\s+and\s+/).map(x => headPhrase(x, 'npc'));
    // "Tester's cousin" also answers to "cousin" ("my cousin").
    const own = /^[^']+'s\s+(.+)$/.exec(String(n.role || '').toLowerCase());
    if (own) out.push(headPhrase(own[1], 'npc'));
    return out.filter(x => x.length >= 3);
  }
  /* A role word right after a subject ("I head to the bar", "we cook") is a
     verb, not a reference to whoever holds that role. */
  const VERB_LEAD = /(^|[^a-z'])(i|we|you|they|he|she|then|to|and|or|i'll|we'll|let's|lets)\s+$/;
  function hasRolePhrase(t, phrase) {
    const re = new RegExp('(^|[^a-z])' + escRe(phrase) + "('s)?(?=[^a-z]|$)", 'g');
    for (let m = re.exec(t); m; m = re.exec(t)) {
      if (!VERB_LEAD.test(t.slice(0, m.index + m[1].length))) return true;
      re.lastIndex = m.index + 1;
    }
    return false;
  }
  /* Does free text name this NPC: their full name, or a given or family name?
     A family name they share with someone whose own first or full name is
     in the text is that person's ("Pearl Gentry" is not her brother Elbert). */
  function nameMentions(text, n) {
    const t = String(text || '').toLowerCase();
    if (hasPhrase(t, String(n.name || '').toLowerCase())) return true;
    const toks = nameTokens(n);
    const first = String(n.name || '').toLowerCase().split(/\s+/).find(w => !TITLES.has(w)) || '';
    const others = State.current ? State.current.npcs.filter(m => m !== n && m.id !== n.id) : [];
    const theirs = x => others.some(m => nameTokens(m).includes(x) && (hasPhrase(t, String(m.name || '').toLowerCase()) || nameTokens(m).some(y => y !== x && hasPhrase(t, y))));
    return toks.some(x => hasPhrase(t, x) && (x === first || !theirs(x)));
  }
  /* Does free text refer to this NPC: by name, or by the head of their role
     ("the smith", "the bartender")? */
  function mentions(text, n) {
    return nameMentions(text, n) || rolePhrases(n).some(x => hasRolePhrase(String(text || '').toLowerCase(), x));
  }
  function plainName(x) { return String(x || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  /* An existing entity a `new:` description already names, or null. NPCs who
     are present win over absent ones. ctx: { locationId }. */
  function matchExisting(desc, ctx) {
    const s = State.current;
    if (!s) return null;
    const head = headPhrase(desc, 'npc');
    if (!head) return null;
    const here = (ctx && ctx.locationId) || s.player.locationId;
    // A place's exact name first: "Dewayne's house" is the house, not Dewayne. Then any other name it goes by ("the county seat").
    const want = plainName(head);
    const l = s.locations.find(x => plainName(x.name) === want) || s.locations.find(x => Array.isArray(x.aka) && x.aka.some(a => plainName(a) === want));
    if (l) return { kind: 'location', id: l.id };
    const presentIds = State.npcsAt(here).map(n => n.id);
    // The living in town first; then the dead and the people who live elsewhere, who exist and can be talked about but are never here.
    const inTown = s.npcs.filter(n => n.alive !== false && n.status !== 'dead' && n.status !== 'gone');
    const absent = s.npcs.filter(n => !inTown.includes(n));
    const person = whoIs(head, inTown, presentIds) || whoIs(head, absent, presentIds);
    if (person) return { kind: 'npc', id: person };
    const itemWant = plainName(headPhrase(desc, 'item'));
    const here2 = State.loc(here);
    const items = s.player.inventory.concat((here2 && here2.items) || []);
    const it = items.find(i => plainName(i.name) === itemWant);
    if (it) return { kind: 'item', id: it.id };
    return null;
  }
  /* The id of the person in the list a description's head phrase names, or null. */
  function whoIs(head, live, presentIds) {
    /* "Dewayne's wife" is not Dewayne: a possessive name before a word for a
       person names whoever is that to them (the story's own record, or a role
       that says so); a name beside it ("Mavis, Dewayne's wife") may still be
       someone here; otherwise nobody yet. */
    const pw = personWords();
    const own = Array.from(head.matchAll(/([a-z][a-z-]*)'s\s+([a-z]+)(?:\s+([a-z]+))?/g)).map(m => {
      const rel = pw.test(m[2]) ? m[2] : m[3] && pw.test(`${m[2]} ${m[3]}`) && pw.test(m[3]) ? `${m[2]} ${m[3]}` : null;
      return rel ? { owner: m[1], rel, phrase: `${m[1]}'s ${rel}` } : null;
    }).filter(Boolean)[0];
    const byPresence = list => list.sort((a, b) => presentIds.includes(b.id) - presentIds.includes(a.id));
    if (own) {
      const owners = State.current.npcs.filter(n => nameTokens(n).includes(own.owner));
      const rel = State.cleanRelation(own.rel);
      // Who is that to them: the cast's own relations ("Dewayne's wife" is Mavis), a relation made in play, or a role that says so.
      const sameRel = (a, b) => a === b || genderWord(a, 'she') === genderWord(b, 'she');
      const kin = live.filter(n => owners.some(o => State.tiesOf(o).has.some(x => x.id === n.id && x.relation && sameRel(State.cleanRelation(x.relation), rel)))
        || (isObj(n.created) && owners.some(o => o.id === n.created.relationToNpcId) && n.created.relation === rel)
        || hasPhrase(String(n.role || '').toLowerCase(), `${own.owner}'s ${rel}`) || plainName(n.name) === plainName(own.phrase));
      if (kin.length) return byPresence(kin)[0].id;
      const rest = head.replace(own.phrase, ' ').replace(/\s+/g, ' ').trim();
      const named = rest ? live.filter(n => nameMentions(' ' + rest + ' ', n)) : [];
      return named.length ? byPresence(named)[0].id : null;
    }
    const npcs = live.filter(n => mentions(' ' + head + ' ', n)).sort((a, b) => presentIds.includes(b.id) - presentIds.includes(a.id));
    if (npcs.length) return npcs[0].id;
    // A one-word job ("the clerk", "the officer") is the person whose role ends in it, someone here first.
    if (/^[a-z][a-z-]+$/.test(head) && head.length >= 4 && personWords().test(head)) {
      const ends = live.filter(n => rolePhrases(n).some(x => x === head || x.endsWith(' ' + head)));
      if (ends.length) return byPresence(ends)[0].id;
    }
    return null;
  }
  function placeType(head) {
    if (!placeRe) placeRe = wordsRe(PLACE_WORDS.concat(TABLES.location.types || []));
    const m = placeRe.exec(String(head || ''));
    return m ? m[1].toLowerCase() : 'place';
  }
  /* A listed price for something described loosely ("some rope" -> the
     goods line with "rope" in it), or null. */
  const PRICE_STOP = new Set(['the', 'and', 'for', 'set', 'ten', 'five', 'dozen', 'cup', 'jug', 'bed', 'hot', 'old', 'round', 'pair', 'some']);
  function goodsFor(text) {
    const t = String(text || '').toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const g of TABLES.items.goods) {
      const words = g.name.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !PRICE_STOP.has(w));
      const score = words.filter(w => hasPhrase(t, w) || hasPhrase(t, w.replace(/s$/, ''))).length;
      if (score > bestScore) { best = g; bestScore = score; }
    }
    return best;
  }

  // ----- work (direction change 16) -----
  /* Paid work is content (JOBS): a job is offered at its place, in its
     phases, by its giver, who is scheduled there then (tests/validate-town.cjs
     checks it). jobsAt(locationId, phase?) lists a place's jobs (in that
     phase); jobsOnOffer(locationId) the ones that can be asked for right now:
     the place open, the phase right and the giver free and there.
     jobRefusal(job, locationId) says, in one plain line, why a job cannot be
     taken now (nothing is spent): not here, the wrong time, its giver away or
     cold to the player, done today (cooldownDays) or done for good (a job
     that is not repeatable), or, for a stake, too little cash to sit in; null
     when it can. workDone(jobId) is the job's record in state.work. */
  function jobs() { return typeof JOBS !== 'undefined' && Array.isArray(JOBS) ? JOBS : []; }
  function job(id) { return typeof id === 'string' ? (jobs().find(j => j.id === id) || null) : null; }
  function jobsAt(locationId, phase) { return jobs().filter(j => j.locationId === locationId && (!phase || j.phases.includes(phase))); }
  function jobsOnOffer(locationId) {
    const s = State.current;
    const l = s ? State.loc(locationId) : null;
    if (!l || l.closed || l.away === true) return [];
    const here = State.npcsAt(l.id).map(n => n.id);
    return jobsAt(l.id, s.time.phase).filter(j => here.includes(j.giverNpcId));
  }
  function workDone(jobId) { const w = State.current && State.current.work; return isObj(w) && isObj(w[jobId]) ? w[jobId] : null; }
  const phaseList = ph => (ph.length < 3 ? ph.join(' and ') : `${ph.slice(0, -1).join(', ')} and ${ph[ph.length - 1]}`);
  const JOB_COLD = -25; // a giver at this attitude or below will not take the player on
  function jobRefusal(j, locationId) {
    const s = State.current;
    const l = State.loc(locationId);
    const place = l ? String(l.name).replace(/^The /, 'the ') : 'here';
    if (!j) return `Nobody at ${place} is hiring right now. The Places tab shows the work in town (or type /jobs).`;
    const what = capFirst(j.label);
    const at = State.loc(j.locationId);
    if (!at || j.locationId !== locationId) return `${what} is at ${at ? String(at.name).replace(/^The /, 'the ') : 'another place'}, not here.`;
    if (at.closed) return `${capFirst(place)} is closed.`;
    const n = State.npc(j.giverNpcId);
    const who = npcLabel(n);
    if (!n || n.alive === false || n.status !== 'free') return `${what} was ${who}'s to give, and ${n && n.alive === false ? `${who} is dead` : n && n.status === 'arrested' ? `${who} is in a cell` : `${who} is gone`}.`;
    if (!j.phases.includes(s.time.phase)) return `${capFirst(who)} hires for ${j.label} in the ${phaseList(j.phases)}, not in the ${s.time.phase}.`;
    if (!State.npcsAt(l.id).some(x => x.id === n.id)) return `${capFirst(who)} is not here right now, and ${j.label} is ${({ he: 'his', she: 'hers' })[n.pronouns] || 'theirs'} to give.`;
    if ((n.attitude | 0) <= JOB_COLD) return `${capFirst(who)} will not take you on (${State.attitudeWord(n.attitude)}).`;
    const done = workDone(j.id);
    if (done && j.repeatable === false) return `You already did ${j.label}; it was one job, and it is done.`;
    const back = done ? done.day + Math.max(1, toInt(j.cooldownDays) || 1) : 0;
    if (done && s.time.day < back) return `You already did ${j.label} ${done.day === s.time.day ? 'today' : `on day ${done.day}`}. There is more ${back === s.time.day + 1 ? 'tomorrow' : `from day ${back}`}.`;
    if (j.stake && s.player.gold < j.pay[0]) return `You need at least ${money(j.pay[0])} to sit in (you have ${money(s.player.gold)}).`;
    return null;
  }
  /* How the player stands with a job, for the Places sheet and /jobs: '' (it can be taken again), 'done for today', 'again from day N' or 'done' (once only). */
  function jobStatus(j) {
    const s = State.current;
    const done = s ? workDone(j.id) : null;
    if (!done) return '';
    if (j.repeatable === false) return 'done';
    const back = done.day + Math.max(1, toInt(j.cooldownDays) || 1);
    return s.time.day >= back ? '' : back === s.time.day + 1 ? 'done for today' : `again from day ${back}`;
  }

  // ----- TOWN_DATA validation (in-browser twin of tests/validate-town.cjs, lighter) -----
  // The ops and reserved flags are State's own, so the two can never disagree.
  const EFFECT_OPS = State.EFFECT_OPS;
  function validate(t) {
    const errs = [];
    const e = msg => errs.push(msg);
    if (!isObj(t)) return ['TOWN_DATA is not an object'];
    const arr = v => (Array.isArray(v) ? v : []);
    if (!cleanText(t.name)) e('name missing');
    for (const k of ['locations', 'npcs', 'factions', 'threads', 'seeds', 'rumours']) if (!Array.isArray(t[k])) e(`${k} must be an array`);
    const ids = new Set();
    const reg = (id, kind) => {
      if (typeof id !== 'string' || !ID_RE[kind].test(id)) e(`bad ${kind} id: ${id}`);
      else if (ids.has(id)) e(`duplicate id: ${id}`);
      else ids.add(id);
    };
    arr(t.locations).forEach(l => reg(l.id, 'loc'));
    arr(t.npcs).forEach(n => reg(n.id, 'npc'));
    arr(t.factions).forEach(f => reg(f.id, 'fac'));
    arr(t.threads).forEach(x => reg(x.id, 'thr'));
    arr(t.seeds).forEach(x => reg(x.id, 'seed'));
    arr(t.rumours).forEach(x => reg(x.id, 'rum'));
    // ids that clock effects and seed effects create later also count as known
    const effectsOf = f => arr(f.clocks).flatMap(c => (isObj(c.onComplete) ? arr(c.onComplete.effects) : []));
    const seedEffectsOf = sd => (isObj(sd) ? arr(sd.effects) : []);
    const madeBy = ef => {
      if (ef && ef.op === 'openThread' && ef.thread) ids.add(ef.thread.id);
      if (ef && ef.op === 'addRumour' && ef.rumour) ids.add(ef.rumour.id);
      if (ef && ef.op === 'plantSeed' && ef.seed) { ids.add(ef.seed.id); seedEffectsOf(ef.seed).forEach(madeBy); }
    };
    arr(t.factions).forEach(f => effectsOf(f).forEach(madeBy));
    arr(t.seeds).forEach(sd => seedEffectsOf(sd).forEach(madeBy));
    const locById = new Map(arr(t.locations).map(l => [l.id, l]));
    const npcIds = new Set(arr(t.npcs).map(n => n.id));
    const facIds = new Set(arr(t.factions).map(f => f.id));
    for (const k of ['gate', 'docks']) if (!t.startLocationIds || !locById.has(t.startLocationIds[k])) e(`startLocationIds.${k} must be a location id`);
    const scheduled = new Set();
    for (const l of arr(t.locations)) {
      // A place out of town is never reached: no exits, nobody scheduled, not discovered.
      if (l.away === true) {
        if (arr(l.exits).length) e(`${l.id}: a place out of town has no exits`);
        if (l.discovered !== false) e(`${l.id}: a place out of town is never discovered`);
        if (isObj(l.npcIdsBySchedule) && PHASES.some(p => arr(l.npcIdsBySchedule[p]).length)) e(`${l.id}: nobody is scheduled out of town`);
      }
      for (const x of arr(l.exits)) {
        if (!locById.has(x)) e(`${l.id}: exit to unknown ${x}`);
        else if (locById.get(x).away === true) e(`${l.id}: exit to ${x}, a place out of town`);
        else if (!arr(locById.get(x).exits).includes(l.id)) e(`${l.id}: exit to ${x} is not symmetric`);
      }
      if (isObj(l.npcIdsBySchedule)) for (const p of PHASES) for (const n of arr(l.npcIdsBySchedule[p])) scheduled.add(n);
      if (!isObj(l.npcIdsBySchedule)) { e(`${l.id}: npcIdsBySchedule missing`); continue; }
      for (const p of PHASES) {
        if (!Array.isArray(l.npcIdsBySchedule[p])) e(`${l.id}: schedule has no ${p}`);
        else for (const n of l.npcIdsBySchedule[p]) if (!npcIds.has(n)) e(`${l.id}: ${p} lists unknown ${n}`);
      }
    }
    for (const n of arr(t.npcs)) {
      if (n.factionId !== null && n.factionId !== undefined && !facIds.has(n.factionId)) e(`${n.id}: unknown faction ${n.factionId}`);
      if (!Array.isArray(n.tags)) e(`${n.id}: tags must be an array`);
      if (!NPC_STATUSES.includes(n.status)) e(`${n.id}: bad status ${n.status}`);
      if (!PRONOUNS.includes(n.pronouns)) e(`${n.id}: pronouns must be he, she or they`);
      // The dead and the people who live elsewhere are never in a schedule.
      const pres = n.presence || (n.alive === false || n.status === 'dead' ? 'dead' : n.status === 'gone' ? 'away' : 'here');
      if (!['here', 'away', 'dead'].includes(pres)) e(`${n.id}: presence must be here, away or dead`);
      if (pres === 'dead' && (n.alive !== false || n.status !== 'dead')) e(`${n.id}: dead needs alive false and status dead`);
      if (pres === 'away' && n.status !== 'gone') e(`${n.id}: away needs status gone`);
      if (pres !== 'here' && scheduled.has(n.id)) e(`${n.id}: is ${pres} but scheduled in town`);
      if (n.age !== undefined && !(Number.isInteger(n.age) && n.age >= 0 && n.age <= 120)) e(`${n.id}: age must be a whole number from 0 to 120`);
      // The cast's home and relations (written on both sides; tests/validate-town.cjs checks the words too).
      if (n.home !== undefined && n.home !== null && !locById.has(n.home)) e(`${n.id}: home ${n.home} is not a location`);
      if (n.relations !== undefined && !Array.isArray(n.relations)) e(`${n.id}: relations must be an array`);
      for (const r of arr(n.relations)) {
        if (!isObj(r) || !npcIds.has(r.npcId)) { e(`${n.id}: relation to unknown ${r && r.npcId}`); continue; }
        const other = arr(t.npcs).find(x => x.id === r.npcId);
        if (!arr(other.relations).some(x => isObj(x) && x.npcId === n.id)) e(`${n.id}: ${r.npcId} does not list ${n.id} back`);
      }
    }
    const checkRef = (where, kind, id) => { const ok = kind === 'loc' ? locById.has(id) : kind === 'npc' ? npcIds.has(id) : kind === 'fac' ? facIds.has(id) : ids.has(id); if (!ok) e(`${where}: unknown ${kind} ${id}`); };
    const checkTrigger = (where, tr) => {
      if (!isObj(tr)) { e(`${where}: trigger missing`); return; }
      if (tr.type === 'day') { if (!Number.isInteger(tr.value)) e(`${where}: day trigger needs an integer`); }
      else if (tr.type === 'location') checkRef(where, 'loc', tr.value);
      else if (tr.type === 'npc') checkRef(where, 'npc', tr.value);
      else if (tr.type === 'clock') { const m = /^(fac_[a-z0-9_]+):(\d+)$/.exec(String(tr.value)); if (!m) e(`${where}: bad clock trigger ${tr.value}`); else checkRef(where, 'fac', m[1]); }
      else e(`${where}: bad trigger type ${tr.type}`);
    };
    /* One effect op, from a clock or a seed (direction change 14: seeds carry
       effects too, checked the same way). */
    const checkEffect = (w, ef) => {
      if (!isObj(ef) || !EFFECT_OPS.includes(ef.op)) { e(`${w}: unknown op ${ef && ef.op}`); return; }
      if (ef.locationId !== undefined) checkRef(w, 'loc', ef.locationId);
      if (ef.npcId !== undefined) checkRef(w, 'npc', ef.npcId);
      if (ef.threadId !== undefined) checkRef(w, 'thr', ef.threadId);
      if (ef.op === 'factionRelation') { checkRef(w, 'fac', ef.a); checkRef(w, 'fac', ef.b); }
      if (ef.op === 'reputationDelta' && ef.key !== 'town') checkRef(w, 'fac', ef.key);
      if (ef.op === 'plantSeed' && ef.seed) { checkTrigger(w, ef.seed.trigger); checkSeedEffects(`${w}.seed`, ef.seed); }
      if (ef.op === 'setFlag' && State.RESERVED_FLAGS.includes(ef.key)) e(`${w}: flag ${ef.key} is reserved`);
      if ((ef.op === 'visit' || ef.op === 'placeItem') && locById.has(ef.locationId) && locById.get(ef.locationId).away === true) e(`${w}: ${ef.locationId} is out of town`);
      if (ef.op === 'placeItem' && !(isObj(ef.item) && cleanText(ef.item.name, 60))) e(`${w}: placeItem needs an item with a name`);
    };
    const checkSeedEffects = (where, sd) => {
      if (!isObj(sd) || sd.effects === undefined) return;
      if (!Array.isArray(sd.effects)) { e(`${where}: effects must be an array`); return; }
      if (sd.effects.length > State.SEED_EFFECTS_MAX) e(`${where}: at most ${State.SEED_EFFECTS_MAX} effects`);
      sd.effects.forEach((ef, j) => checkEffect(`${where}.effects[${j}]`, ef));
    };
    for (const f of arr(t.factions)) {
      if (!arr(f.clocks).length) e(`${f.id}: needs clocks`);
      arr(f.clocks).forEach((c, i) => {
        const where = `${f.id}.clocks[${i}]`;
        if (!Number.isInteger(c.segments) || c.segments < 1) e(`${where}: segments must be a positive integer`);
        if (!isObj(c.onComplete) || typeof c.onComplete.text !== 'string' || !Array.isArray(c.onComplete.effects)) { e(`${where}: onComplete needs text and effects`); return; }
        c.onComplete.effects.forEach((ef, j) => checkEffect(`${where}.effects[${j}]`, ef));
      });
      for (const r of Object.keys(f.relations || {})) if (!facIds.has(r)) e(`${f.id}: relation to unknown ${r}`);
    }
    for (const th of arr(t.threads)) for (const id of arr(th.linkedIds)) if (!ids.has(id)) e(`${th.id}: linked unknown ${id}`);
    for (const sd of arr(t.seeds)) { checkTrigger(sd.id, sd.trigger); checkSeedEffects(sd.id, sd); }
    for (const r of arr(t.rumours)) if (r.sourceNpcId !== null && r.sourceNpcId !== undefined && !npcIds.has(r.sourceNpcId)) e(`${r.id}: unknown source ${r.sourceNpcId}`);
    return errs;
  }

  // ----- loose ends (SPEC.md section 5 step 6) -----
  /* Each loose end binds to someone in the cast (the game never makes a
     person): a free person carrying the tag of the option the player kept
     (LOOSE_ENDS[kind].link.optionTags, when the text is that option's
     words), else the kind's link.tag, else anyone free, never someone
     already tied to another loose end while anyone else is left; picked
     with the seeded Rng. They become known to the player, get a memory and
     a small attitude shift, a known thread records the loose end, and a
     hidden seed is planted. Their schedule already places them in town;
     when the seed fires they come to the player for that scene
     (World.fireSeeds). dayOffset [a, b] is read as day numbers counted from
     day 1, so [3, 5] fires on day 3, 4 or 5 (never earlier than tomorrow).
     The first loose end the player picked is the hook on day 1 (direction
     change 14: nothing pulled on the player for the first two days): its
     seed fires today, once FIRST_HOOK_TURNS turns have been played
     (notBeforeTurn 2 in a new game, so it fires after the player's second
     turn and is due on the third). Its day is still rolled, so the seeded
     stream is unchanged. The others keep their windows. */
  const LOOSE_END_ATTITUDE = { debt: -10, enemy: -40, secret: -5, lost: 10, promise: 5 };
  const FIRST_HOOK_TURNS = 2;
  function firstScheduledLocation(npcId) {
    const s = State.current;
    for (const p of PHASES) for (const l of s.locations) if (((l.npcIdsBySchedule || {})[p] || []).includes(npcId)) return l.id;
    return null;
  }
  /* What the loose end's person remembers about the player from day 1, in
     the bookkeeper's own form (Api.MEMORY_RULES: under twelve words, their
     point of view, the player the unnamed subject), so the narrator's
     person line has the creditor knowing about the debt before anything is
     said: LOOSE_ENDS[kind].memory.options for the preset option the player
     kept, else memory.text (a text the player wrote themselves). Weight 3,
     so it outlasts the small things (State.apply's MEMORY_MAX, the
     narrator's pickMemories). */
  const LOOSE_END_MEMORY_WEIGHT = 3;
  function looseEndMemory(kind, text, playerName) {
    const def = LOOSE_ENDS[kind];
    if (!def) return '';
    const m = isObj(def.memory) ? def.memory : {};
    const at = (def.options || []).findIndex(o => cleanText(o, 200) === cleanText(text, 200));
    const tpl = (at >= 0 && Array.isArray(m.options) && m.options[at]) || m.text || `tied to me by ${lowerFirst(def.label)}`;
    return cleanText(fillTemplate(tpl, { player: playerName || (State.current && State.current.player.name) || 'the newcomer' }), 120);
  }
  /* Every line looseEndMemory can write. Upgrade's memory rewrite leaves
     these alone, as it does /fact lines: the loose end set them, not play. */
  function isLooseEndMemory(text) {
    const t = cleanText(text, 400);
    if (!t) return false;
    const name = State.current ? State.current.player.name : '';
    return Object.keys(LOOSE_ENDS).some(k => {
      const m = isObj(LOOSE_ENDS[k].memory) ? LOOSE_ENDS[k].memory : {};
      return [m.text].concat(Array.isArray(m.options) ? m.options : []).some(x => typeof x === 'string' && cleanText(fillTemplate(x, { player: name }), 120) === t);
    });
  }
  function resolveLooseEnd(le) {
    const s = State.current;
    const def = le && LOOSE_ENDS[le.kind];
    if (!def) throw new Error('unknown loose end: ' + (le && le.kind));
    const text = cleanText(le.text, 200) || def.options[0];
    const used = new Set((s.player.looseEnds || []).map(x => x.npcId));
    const link = isObj(def.link) ? def.link : {};
    const at = (def.options || []).findIndex(o => cleanText(o, 200) === text);
    const tags = [Array.isArray(link.optionTags) && at >= 0 ? link.optionTags[at] : null, link.tag].filter(Boolean);
    const free = s.npcs.filter(n => n.alive !== false && n.status === 'free' && !n.unnamed);
    const tagged = tag => free.filter(n => Array.isArray(n.tags) && n.tags.includes(tag));
    let cands = [];
    for (const tag of tags) { cands = tagged(tag).filter(n => !used.has(n.id)); if (cands.length) break; }
    if (!cands.length) cands = free.filter(n => !used.has(n.id));
    if (!cands.length) cands = free;
    if (!cands.length) throw new Error('nobody in town is free to tie a loose end to');
    const target = Rng.pick(cands);
    const created = false;
    const sd = def.seed || {};
    const off = Array.isArray(sd.dayOffset) && sd.dayOffset.length ? sd.dayOffset : [3, 5];
    const lo = toInt(off[0]) || 3;
    const hi = toInt(off.length > 1 ? off[1] : off[0]) || lo;
    // The day is rolled for the first loose end too, so the seeded stream (and every later roll) is what it was.
    const rolled = Math.max(s.time.day + 1, Rng.int(lo, hi));
    const first = (s.player.looseEnds || []).length === 0;
    const day = first ? s.time.day : rolled;
    let trigger = { type: 'day', value: day };
    if (sd.trigger === 'npc') trigger = { type: 'npc', value: target.id };
    else if (sd.trigger === 'location') trigger = { type: 'location', value: firstScheduledLocation(target.id) || s.player.locationId };
    const vars = { npc: target.name, player: s.player.name, text };
    const seedId = uniqueId('seed_le_' + le.kind, id => !!State.seed(id));
    const threadId = uniqueId('thr_le_' + le.kind, id => !!State.thread(id));
    const seedObj = { id: seedId, cause: `Loose end (${def.label}): ${text}`, effect: fillTemplate(sd.effect || '{npc} turns up.', vars), trigger, fired: false, hidden: true, origin: { kind: 'loose_end', npcId: target.id } };
    if (trigger.type !== 'day') seedObj.notBeforeDay = day;
    if (first) seedObj.notBeforeTurn = s.meta.turn + FIRST_HOOK_TURNS;
    const attitude = LOOSE_END_ATTITUDE[le.kind] || 0;
    const r = State.apply({
      effects: [
        attitude ? { op: 'attitudeDelta', npcId: target.id, delta: attitude } : null,
        { op: 'plantSeed', seed: seedObj },
        { op: 'openThread', thread: { id: threadId, title: def.label, summary: `${text} (${target.name}, ${target.role})`, status: 'open', knownToPlayer: true, linkedIds: [target.id] } }
      ].filter(Boolean),
      newMemories: [{ npcId: target.id, text: looseEndMemory(le.kind, text, s.player.name), weight: LOOSE_END_MEMORY_WEIGHT }],
      npcKnownToPlayer: [target.id],
      addLooseEnd: { kind: le.kind, label: def.label, text, npcId: target.id, seedId, threadId, created }
    });
    if (r.rejected.length) console.warn('[Town] loose end partly rejected', r.rejected);
    return { npcId: target.id, seedId, threadId, created };
  }

  // ----- opening scene -----
  /* Local arrival text, used in mock mode, without an API key, or when the
     narrated arrival fails. Present NPCs are introduced in a sentence built
     around their look ("You notice a thick-necked young watchman ..."). */
  function lookPhrase(n) {
    const look = String(n.look || '').trim().replace(/[.!]+$/, '');
    if (!look) return `${article(n.role || 'stranger')} ${n.role || 'stranger'}`;
    if (/^(a|an|the)\s/i.test(look)) return lowerFirst(look);
    return `${article(look)} ${lowerFirst(look)}`;
  }
  function openingScene(s) {
    s = s || State.current;
    const p = s.player;
    const l = State.loc(p.locationId);
    const bg = BACKGROUNDS.find(b => b.id === p.backgroundId);
    const place = l.name.replace(/^The /, 'the ');
    const first = bg && bg.arrival === 'docks'
      ? `You step off a river boat onto ${place} in ${s.meta.townName}, your pack on your shoulder.`
      : `You come in on foot by the road and stop at ${place}, on the edge of ${s.meta.townName}.`;
    const weather = s.flags.weather ? sentence(s.flags.weather) + ' ' : '';
    const here = State.npcsAt(l.id, s.time.phase).slice(0, 2);
    const intro = here.map((n, i) => sentence(i === 0 ? `You notice ${lookPhrase(n)}` : `Not far off is ${lookPhrase(n)}`)).join(' ');
    const second = here.length ? intro : 'Nobody here pays you any attention yet.';
    return `${weather}${first} ${l.description}\n\n${second}`;
  }

  return { data, instantiate, plausible, guessKind, properName, validate, resolveLooseEnd, looseEndMemory, isLooseEndMemory, LOOSE_END_MEMORY_WEIGHT, FIRST_HOOK_TURNS, openingScene, EFFECT_OPS, headPhrase, rolePhrases, mentions, nameMentions, matchExisting, placeType, goodsFor,
    jobs, job, jobsAt, jobsOnOffer, jobRefusal, jobStatus, workDone, phaseList, JOB_COLD };
})();

