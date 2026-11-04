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
      /* How they feel about the player (wave 26, Rel): where the town put
         them (Rel.startOf: liking the written attitude, trust from their
         traits and work or start.trust), with the tracks worked out. The
         authored start and axes stay in the town data. */
      delete o.start;
      delete o.rel;
      o.rel = Rel.fill(o, n);
      Object.assign(o.rel, Rel.recompute(o, 1, { s: null, town: townData }));
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
  /* Out of place in a modern town, ordinary in a low-fantasy one. A sword,
     a crossbow or a musket is not: an heirloom, a deer rifle's cousin, a
     Civil War piece on a wall. */
  const FANTASY_ONLY = ['knight', 'knights', 'squire', 'longsword', 'broadsword', 'suit of armour', 'chainmail', 'catapult'];
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
    'guy', 'guys', 'gal', 'fella', 'fellow', 'feller', 'dude', 'ladies', 'gentleman', 'folks', 'people', 'regulars', 'locals', 'youngster',
    'dispatcher', 'foreman', 'bookie', 'housekeeper', 'hairdresser', 'secretary', 'bookkeeper', 'inspector', 'columnist', 'writer', 'chief',
    'owner', 'landlord', 'landlady', 'tenant', 'neighbor', 'neighbour', 'policeman', 'policewoman', 'patrolman', 'smuggler', 'parolee',
    'convict', 'inmate', 'prisoner', 'collector', 'lender', 'moneylender', 'engineer', 'pharmacist', 'caregiver', 'drifter', 'shopkeeper',
    'storekeeper', 'housewife', 'councilman', 'councilwoman', 'clerk', 'repo man',
    'wizard', 'sorcerer', 'sorceress', 'witch', 'king', 'queen', 'prince', 'princess', 'emperor', 'empress', 'knight', 'lord', 'lady'];
  /* Tags that name a kind of person, which a person answers to as their
     role does ("the dispatcher", "the foreman"); other tags (records,
     council, fence, police) say something about them and are not names. */
  const TAG_PERSON = new Set(['bartender', 'merchant', 'mayor', 'boatman', 'smuggler', 'dealer', 'chief', 'priest', 'pastor', 'healer', 'nurse',
    'mechanic', 'clerk', 'cook', 'manager', 'bookkeeper', 'teenager', 'cashier', 'secretary', 'housekeeper', 'writer', 'dispatcher',
    'inspector', 'fisherman', 'teacher', 'farmer', 'driver', 'collector', 'bookie', 'gambler', 'parolee', 'stranger', 'waitress',
    'shopkeeper', 'maid', 'hairdresser', 'foreman', 'prisoner', 'engineer', 'hygienist', 'pharmacist', 'sheriff', 'doctor', 'lawyer',
    'caregiver', 'moneylender', 'lender', 'oldtimer', 'deckhand', 'bouncer']);
  /* Words that make a thing a toy, a picture or a costume of what follows
     ("a toy robot", "a poster of a dragon" reads as the poster anyway). */
  const PRETEND_WORDS = ['toy', 'toys', 'plastic', 'rubber', 'fake', 'replica', 'model', 'costume', 'cardboard', 'stuffed', 'paper', 'drawing',
    'picture', 'poster', 'photo', 'painting', 'statue', 'figurine', 'sticker', 'cartoon', 'halloween', 'souvenir', 'novelty', 'inflatable', 'wooden'];
  const PLACE_WORDS = ['alley', 'lane', 'street', 'yard', 'courtyard', 'shop', 'stall', 'house', 'cottage', 'room', 'cellar', 'attic',
    'loft', 'back room', 'stable', 'shed', 'warehouse', 'storehouse', 'well', 'garden', 'orchard', 'field', 'barn', 'mill', 'chapel',
    'shrine', 'bathhouse', 'den', 'workshop', 'office', 'kitchen', 'privy', 'parking lot', 'garage', 'booth', 'restroom',
    'bathroom', 'basement', 'porch', 'trailer', 'storage unit', 'motel room', 'back office', 'loading dock', 'stockroom', 'lockup'];
  function wordsRe(list) {
    const esc = list.filter(Boolean).map(w => String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    return new RegExp('\\b(' + esc.join('|') + ')\\b', 'i');
  }
  /* The same lists matched only at the end of a head phrase: its head noun
     ("a King James Bible" is a Bible, "an Army jacket" a jacket). */
  function tailRe(list) {
    const esc = list.filter(Boolean).map(w => String(w).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    return new RegExp("(^|[^a-z'-])(" + esc.join('|') + ")('s)?$", 'i');
  }
  /* Things that are not lying about just anywhere (playtest B5): a gun or
     its ammunition only where guns are kept or sold (a pawn shop, the police,
     a farm or a home: somebody's deer rifle); explosives nowhere a stranger
     could pick them up; a vehicle only where one is parked. A gas station
     does not stock pistols. Not for a fact bought with a story point. */
  const RESTRICTED = [
    { words: ['gun', 'guns', 'pistol', 'pistols', 'handgun', 'handguns', 'rifle', 'rifles', 'shotgun', 'shotguns', 'revolver', 'revolvers', 'deer rifle', 'hunting rifle', 'assault rifle', 'machine gun', 'ammo', 'ammunition', 'shells', 'shotgun shells', 'bullets', 'cartridges', 'rounds',
      'derringer', 'carbine', 'firearm', 'sawed-off', 'sawn-off', 'six-shooter', 'six-gun', 'scattergun'],
      where: ['pawn', 'police', 'watch', 'farm', 'house', 'home', 'bighouse', 'trailer', 'cabin', 'gunshop', 'armory'], what: 'guns and ammunition are kept' },
    { words: ['grenade', 'grenades', 'dynamite', 'stick of dynamite', 'explosive', 'explosives', 'bomb', 'bombs', 'pipe bomb', 'c4', 'tnt', 'rocket launcher', 'rocket launchers', 'landmine', 'landmines', 'detonator'],
      where: [], what: 'explosives are kept' },
    { words: ['boat', 'boats', 'johnboat', 'jet ski', 'skiff', 'canoe'], where: ['marina', 'bridge', 'fields', 'farm', 'mill', 'woods'], what: 'a boat is kept (the river)' },
    { words: ['car', 'cars', 'truck', 'trucks', 'pickup', 'pickup truck', 'van', 'motorcycle', 'motorbike', 'tractor', 'bus', 'four-wheeler', 'atv', 'semi'],
      where: ['road', 'highway', 'street', 'marina', 'farm', 'gas', 'motel', 'garage', 'trailerpark', 'bridge', 'fields', 'mill', 'house', 'bighouse', 'parking', 'bar', 'tavern', 'church', 'pawn', 'police', 'office', 'school', 'hospital', 'clinic', 'care', 'town', 'market', 'diner', 'store'], what: 'one is parked' }
  ].map(r => Object.assign(r, { re: tailRe(r.words) }));
  /* A word right before the head word that makes it an ordinary thing, not
     the restricted one (wave 3, review bug 5): a grease gun, a staple gun, a
     water pistol, peanut shells, taco shells, ink cartridges, a gravy boat,
     a hand truck. */
  const HARMLESS_BEFORE = new Set(('grease staple nail glue hot-glue caulk caulking spray paint heat water squirt nerf cap tape price label soldering solder rivet airbrush toy ' +
    'peanut pecan walnut pistachio sunflower taco pasta egg oyster clam crab snail turtle sea conch ' +
    'ink toner printer filter razor game propane gravy sauce paper model hand golf shopping ' +
    // Wave 4 (the third review's risk and bug 6): a radar gun, a tattoo gun, a butter knife, a putty knife.
    'radar tattoo butter putty palette plastic').split(/\s+/));
  /* The word just before the head word at the end of thing (weaponOf reads
     the head of a name, so its match is always there), or null. */
  function wordBefore(thing, hit) {
    const words = String(thing || '').toLowerCase().split(/\s+/).filter(Boolean);
    const n = String(hit || '').toLowerCase().split(/\s+/).filter(Boolean).length;
    return words.length > n ? words[words.length - n - 1] : null;
  }
  /* The word before the head word makes it ordinary. */
  function harmlessHead(thing, hit) { return HARMLESS_BEFORE.has(wordBefore(thing, hit)); }
  /* A gun that is ordinary in some places (wave 4, the review's risk): a
     flare gun on a boat or at the river. */
  const QUALIFIED_GUNS = { flare: ['marina', 'bridge', 'landing', 'docks', 'dock', 'ramp', 'riverbank', 'wharf', 'pier', 'river'] };
  function qualifiedHere(thing, hit, type) {
    const places = QUALIFIED_GUNS[wordBefore(thing, hit)];
    return Array.isArray(places) && places.includes(String(type || '').toLowerCase());
  }
  /* What a thing is, when it is a weapon (wave 4, the third review's bug 6
     and the playtest's R7): the weapon word at the head of its name, where
     the name ends ("a deer rifle", "a box of shells": what a box of is),
     or a gun named by its calibre, gauge or maker ("a .38", "a 12-gauge",
     "a Glock 19"). A word after it makes it something else (gun oil, a gun
     case, a knife sharpener, a pistol grip), a word before it an ordinary
     thing (HARMLESS_BEFORE: a grease gun, a water pistol, a butter knife),
     and each part of "X and Y", "X, Y" or "X (red)" is read alone.
     Wave 5 (the fourth review's bug 5): a maker is read before the name is
     split ("Smith & Wesson"); the head ends before "for", "from", "to",
     "in" ... ("a postcard from Winchester", "a deck of cards for
     blackjack"); a calibre, gauge or maker is a gun only when it is the
     whole head, with a maker or a model beside it ("Colt .45", "Sig Sauer
     P226", "Remington 870"); a part after a comma that only gives a
     measure describes the part before it ("Copper wire, 18 gauge"); and a
     box (a case, a belt, rounds) of a calibre is ammunition ("Box of 9mm").
     Returns { word, kind: 'gun' | 'knife' | 'razor' | 'ammo' | 'club',
     name: the part, without its article }, or null. */
  const WEAPON_WORDS = { gun: ['gun', 'guns', 'pistol', 'pistols', 'rifle', 'rifles', 'shotgun', 'shotguns', 'revolver', 'revolvers', 'handgun', 'handguns', 'derringer', 'derringers', 'carbine', 'carbines', 'firearm', 'firearms',
    'sawed-off', 'sawed-offs', 'sawn-off', 'sawn-offs', 'six-shooter', 'six-shooters', 'six-gun', 'six-guns', 'scattergun', 'scatterguns', 'taser', 'tasers'],
    knife: ['knife', 'knives', 'switchblade', 'switchblades', 'pocketknife', 'pocketknives', 'penknife', 'penknives', 'machete', 'machetes', 'dagger', 'daggers', 'bayonet', 'bayonets'],
    razor: ['razor', 'razors'], ammo: ['ammo', 'ammunition', 'shells', 'bullets', 'cartridges', 'buckshot', 'birdshot', 'slugs', 'hollow points', 'hollow-points', 'hollowpoints'], club: ['brass knuckles', 'blackjack', 'billy club', 'nightstick'] };
  const WEAPON_TAIL = new RegExp("(?:^|[^a-z0-9'-])(" + Object.values(WEAPON_WORDS).flat().sort((a, b) => b.length - a.length).map(w => w.replace(/\s/g, '\\s+')).join('|') + ")$");
  // Gun makers: those that name a gun on their own, and those that do only beside a calibre or a model ("Colt .45", "Marlin 336").
  // Wave 6 (the fifth review's bug 5): Taurus (a Ford too) only beside a calibre or a model.
  const GUN_MAKERS = 'glock|ruger|beretta|mossberg|sig sauer|sig|smith-wesson|remington|winchester|walther|kimber|benelli|hi-point|kel-tec|ar-15|ak-47|uzi|tec-9|m16|m-16';
  const GUN_MAKERS_BESIDE = 'colt|browning|marlin|savage|springfield|henry|heckler-koch|h&k|taurus';
  /* A model beside a maker: letters and a number ("A5", "P226"), a number of
     three digits or more ("1911", "870"), or "Model 10". A bare number of
     one or two digits is none (wave 6, the fifth review's bug 5): "Colt 45"
     is the malt liquor, "Colt .45" the gun. */
  const GUN_MODEL = '(?:model\\s+\\d+|[a-z]{1,3}-?\\d+[a-z]{0,3}|\\d{3,}[a-z]{0,3}|\\d{1,2}[a-z]{1,3}|\\d+[/-]\\d+)';
  const CALIBRE = '(?:\\.\\d{2,3}(?:-\\d{2,3})?|\\d{2,3}[- ]?(?:cal|caliber|calibre)|\\d{2}-(?:06|30|20|40|250)|\\d{1,2}[- ]?(?:gauge|ga)|(?:ten|twelve|sixteen|twenty)[- ]gauge|four-ten|\\.410|\\d{1,2} ?mm|\\d{2,3} (?:acp|magnum|mag|special|auto|lr|win|wsm))';
  const GUN_SUFFIX = '(?:\\s+(?:model\\s+\\d+|[a-z]{0,3}-?\\d+[a-z]{0,3}|special|magnum|mag|auto|automatic|semi-auto|semiautomatic|pump|pump-action|lever-action|long|short|lr|acp|win|wsm))*';
  // The whole head: a maker (and a model), a calibre or gauge (after a maker or not), nothing else ("a postcard from Winchester" is no gun).
  const GUN_FORM = new RegExp(`^((?:(?:${GUN_MAKERS}|${GUN_MAKERS_BESIDE})${GUN_SUFFIX}\\s+)?${CALIBRE}${GUN_SUFFIX}|(?:${GUN_MAKERS})${GUN_SUFFIX}|(?:${GUN_MAKERS_BESIDE})(?:\\s+${GUN_MODEL})+${GUN_SUFFIX})$`);
  const CALIBRE_ONLY = new RegExp(`^${CALIBRE}${GUN_SUFFIX}$`);
  // A calibre's rounds (wave 6, the round-5 playtest's R5): "9mm rounds", ".38 rounds", "Box of .38 rounds".
  const CALIBRE_ROUNDS = new RegExp(`^${CALIBRE}${GUN_SUFFIX}\\s+(?:rounds?|loads?|hollow ?points?)$`);
  // What a drink comes in (wave 6, the fifth review's bug 5): a can, a six-pack, a forty of Colt 45 is malt liquor, whatever the maker.
  const DRINK_HOLDERS = /(?:^|\s)(?:can|cans|six-pack|six-packs|twelve-pack|12-pack|forty|forties|40|40oz|bottle|bottles|tallboy|tallboys|case|cases|pint|pints|quart|quarts|glass|swig|sip)$/;
  // Spent, empty: no weapon ("Spent shells", "Empty shotgun shells"); a disposable razor shaves.
  const SPENT_RE = /(?:^|\s)(?:spent|empty|fired|disposable)\s/;
  // What holds ammunition: a box of 9mm, a belt of .30-06, two rounds of buckshot.
  const AMMO_HOLDERS = /(?:^|\s)(?:box|boxes|carton|cartons|case|cases|pack|packs|packet|bag|belt|belts|clip|clips|magazine|magazines|mag|mags|handful|tin|crate|sack|bandolier|round|rounds)$/;
  // Where the head of a name ends ("a postcard from Winchester", "a knife in a sheath").
  const HEAD_ENDS = /\s+(?:for|from|to|in|on|at|by|inside|under|behind|near|without|that|which)\s+.*$/;
  function weaponOf(name) {
    const lower = String(name || '').toLowerCase().replace(/[’]/g, "'").replace(/\([^)]*\)/g, ' ')
      .replace(/\bsmith\s*(?:&|and)\s*wesson\b/g, 'smith-wesson').replace(/\bheckler\s*(?:&|and)\s*koch\b/g, 'heckler-koch');
    const parts = lower.split(/(,|;|\s+(?:and|&|with|plus)\s+)/);
    for (let i = 0; i < parts.length; i += 2) {
      const raw = parts[i];
      const part = raw.replace(/[^a-z0-9.'&\- ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:a|an|the|some|my|his|her|their|one|two|three|four|five|old|new)\s+/, '');
      if (!part) continue;
      // After a comma, a measure alone ("18 gauge", "12 ga") describes the part before it.
      if (i > 0 && parts[i - 1] === ',' && /^(?:\d|\.\d|ten |twelve |sixteen |twenty )/.test(part) && !WEAPON_TAIL.test(part)) continue;
      const cut = part.replace(HEAD_ENDS, '');
      const of = cut.lastIndexOf(' of ');
      const holder = of >= 0 ? cut.slice(0, of) : '';
      const head = (of >= 0 ? cut.slice(of + 4) : cut).replace(/^(?:a|an|the|some)\s+/, '').trim();
      if (CALIBRE_ROUNDS.test(head)) return { word: head, kind: 'ammo', name: part };
      const m = WEAPON_TAIL.exec(head);
      if (m) {
        const word = m[1].replace(/\s+/g, ' ');
        if (!harmlessHead(head, word) && !SPENT_RE.test(` ${head.slice(0, head.length - m[1].length)}`)) return { word, kind: Object.keys(WEAPON_WORDS).find(k => WEAPON_WORDS[k].includes(word)), name: part };
        continue;
      }
      // A can, a six-pack or a forty of it is something to drink, not a gun.
      if (holder && DRINK_HOLDERS.test(holder) && !CALIBRE_ONLY.test(head)) continue;
      const g = GUN_FORM.exec(head);
      if (!g) continue;
      const word = g[1].trim().replace(/smith-wesson/, 'smith & wesson').replace(/heckler-koch/, 'heckler & koch');
      // A box of a calibre is what goes in the gun.
      if (holder && AMMO_HOLDERS.test(holder) && CALIBRE_ONLY.test(head)) return { word, kind: 'ammo', name: part };
      return { word, kind: 'gun', name: part };
    }
    return null;
  }
  /* Does the name start with a gun's maker ("Smith & Wesson", "Colt", "Glock")? Its capitals are its own (World.theThing). */
  const MAKER_FIRST = new RegExp(`^(?:${GUN_MAKERS}|${GUN_MAKERS_BESIDE}|smith|heckler)(?![a-z])`);
  function makerFirst(name) {
    const t = String(name || '').trim();
    return /^[A-Z]/.test(t) && MAKER_FIRST.test(t.toLowerCase().replace(/\bsmith\s*(?:&|and)\s*wesson\b/, 'smith-wesson').replace(/\bheckler\s*(?:&|and)\s*koch\b/, 'heckler-koch'));
  }
  const IMPLAUSIBLE_RE = tailRe(IMPLAUSIBLE);
  const MODERN_ONLY_RE = tailRe(MODERN_ONLY);
  const FANTASY_ONLY_RE = tailRe(FANTASY_ONLY);
  const PRETEND_RE = wordsRe(PRETEND_WORDS);
  /* Words for a person: PERSON_WORDS, the tables' occupations and every
     relation word (kin, work, other: "Colt's dad", "the boss"; not "hand",
     which is mostly a hand). */
  const PERSON_LIST = () => PERSON_WORDS.concat(TABLES.npc.occupations || [], FAMILY_RELATIONS, Object.keys(KIN_SYNONYMS), Object.keys(KIN_NEUTRAL),
    WORK_RELATIONS.filter(w => w !== 'hand'), OTHER_RELATIONS);
  let personRe = null;
  let personTail = null;
  let placeRe = null;
  let placeTail = null;
  function personWords() { return personRe || (personRe = wordsRe(PERSON_LIST())); }
  /* One word that names a kind of person ("bartender", "wife", "man"): Style reads who says something with it (wave 4). */
  function isPersonWord(w) { const t = String(w || '').trim(); return !!t && !/\s/.test(t) && personWords().test(t); }
  function placeWords() { return placeRe || (placeRe = wordsRe(PLACE_WORDS.concat(TABLES.location.types || []))); }
  /* What a `new:` description is: read from its head phrase (the words
     before "at", "by", "of", "who" ...). Its last word is the head noun: a
     word for a person makes a person, a place word a place; then a name
     ("Mavis") is a person; then a place word or a person word anywhere in
     the head phrase, leaving out capitalised words (part of a name: "the
     King James Bible", "the Army jacket"); else a thing. */
  function guessKind(desc) {
    personWords();
    placeWords();
    if (!personTail) personTail = tailRe(PERSON_LIST());
    if (!placeTail) placeTail = tailRe(PLACE_WORDS.concat(TABLES.location.types || []));
    const raw = cleanText(String(desc || '').replace(/^new:/i, ''), 200);
    // A gun by its maker and model is a thing, not a person named Smith (wave 5: "a Smith and Wesson Model 10").
    const gun = weaponOf(raw);
    if (gun && gun.kind === 'gun' && GUN_FORM.test(gun.name)) return 'item';
    const head = headPhrase(raw, 'npc').replace(/\s+(named|called)\s.*$/, '');
    if (!head) return properName(raw) ? 'npc' : 'item';
    if (personTail.test(head)) return 'npc';
    if (placeTail.test(head)) return 'location';
    // "a King James Bible", "a Ford Ranger": capitalised words after "a" are a make of thing, not someone's name.
    if (properName(raw) && !/^(a|an)\s+[A-Z]/.test(raw)) return 'npc';
    const capitalised = new Set((raw.match(/[A-Za-z][\w'-]*/g) || []).filter((w, i) => i > 0 && /^[A-Z]/.test(w)).map(w => w.toLowerCase()));
    // Nor an owner before the thing ("a deputy's hat" is a hat).
    const plain = head.split(/\s+/).filter((w, i, all) => !capitalised.has(w) && !(i < all.length - 1 && /'s$/.test(w))).join(' ');
    if (placeRe.test(plain)) return 'location';
    if (personRe.test(plain)) return 'npc';
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
  /* The blocklists are tested against the head noun of the description
     (the end of its head phrase, one or more words: "a magic sword", "a
     ray gun"), or a word before it that owns it ("a dragon's egg"); a
     modifier is not the thing ("an Army jacket", "a King James Bible", "a
     laser level"), and a toy, a costume or a picture of one is ordinary
     ("a toy robot"). A new place (step 4) is refused once the game has
     made State.LIMITS.revealedPlaces (12) of them, as places people tell
     the player about are. */
  function blockHit(re, head) {
    const words = head.split(/\s+/).filter(Boolean);
    const tail = re.exec(head);
    if (tail) {
      const before = head.slice(0, tail.index + tail[1].length);
      return PRETEND_RE.test(before) ? null : tail[2];
    }
    // "a dragon's egg": a blocked word that owns the thing.
    for (let i = 0; i < words.length - 1; i++) {
      const m = /^(.+)'s$/.exec(words[i]);
      if (m && re.test(m[1]) && !PRETEND_RE.test(words.slice(0, i).join(' '))) return m[1];
    }
    return null;
  }
  function placesMade() {
    const s = State.current;
    if (!s) return 0;
    const town = new Set(((data() && data().locations) || []).map(l => l.id));
    return s.locations.filter(l => made(l, town)).length;
  }
  /* A place made in play from a `new:` description: not in the town data,
     not a place someone told the player about, not on the town map. */
  function made(l, town) { return !!l && !(town || new Set(((data() && data().locations) || []).map(x => x.id))).has(l.id) && !isObj(l.revealed) && !isObj(l.map); }
  function plausible(description, locationType, opts) {
    const d = cleanText(String(description || '').replace(/^new:/i, ''), 200);
    if (!d) return { plausible: false, kind: 'other', reason: 'nothing was described' };
    const kind = guessKind(d);
    const modern = opts && opts.era ? opts.era === 'modern' : isModern();
    const head = headPhrase(d, 'npc') || plainName(d);
    const hit = blockHit(IMPLAUSIBLE_RE, head) || blockHit(modern ? FANTASY_ONLY_RE : MODERN_ONLY_RE, head);
    if (hit) return { plausible: false, kind, reason: `"${hit}" does not exist in this town` };
    if (kind === 'item' && !(opts && opts.fact)) {
      const thing = headPhrase(d, 'item') || head;
      for (const r of RESTRICTED) {
        const h = blockHit(r.re, thing);
        if (h && !harmlessHead(thing, h) && !qualifiedHere(thing, h, locationType) && !r.where.includes(String(locationType || '').toLowerCase())) return { plausible: false, kind, reason: `no ${h} here: this is not a place where ${r.what}` };
      }
    }
    // A gun by its calibre, gauge or maker (wave 4): "a .38", "a 12-gauge", "a Glock" are kept where guns are.
    if (kind !== 'npc' && kind !== 'location' && !(opts && opts.fact)) {
      const w = weaponOf(d);
      if (w && w.kind === 'gun' && !WEAPON_WORDS.gun.includes(w.word) && !RESTRICTED[0].where.includes(String(locationType || '').toLowerCase())) return { plausible: false, kind: 'item', reason: `no ${w.word} here: this is not a place where ${RESTRICTED[0].what}` };
    }
    const cap = State.LIMITS && Number.isInteger(State.LIMITS.revealedPlaces) ? State.LIMITS.revealedPlaces : 12;
    if (kind === 'location' && placesMade() >= cap) return { plausible: false, kind, reason: `no more new places in this game (${cap} made already)` };
    return { plausible: true, kind, reason: locationType ? `ordinary enough for a ${locationType}` : 'ordinary enough' };
  }

  // ----- naming and matching (step 4 reuses existing entities before creating) -----
  const LEAD_WORDS = new Set(['a', 'an', 'the', 'some', 'my', 'your', 'his', 'her', 'their', 'our', 'this', 'that', 'any', 'one']);
  const BREAK_WORDS = new Set(['by', 'at', 'behind', 'in', 'on', 'near', 'next', 'beside', 'under', 'over', 'from', 'with', 'of', 'who',
    'that', 'which', 'to', 'for', 'across', 'inside', 'outside', 'into', 'around', 'through', 'and', 'or', 'is', 'are', 'was', 'lives',
    'works', 'owes', 'knows', 'has', 'keeps', 'runs']);
  const TITLES = new Set(['father', 'mother', 'miss', 'mrs', 'pastor', 'reverend', 'chief', 'officer', 'deputy', 'mayor', 'doc', 'captain', 'master', 'mistress', 'old', 'young', 'sir', 'lady', 'lord', 'brother', 'sister', 'saint', 'st']);
  /* The core noun phrase of a description: "a barmaid behind the bar" ->
     "barmaid", "my cousin" -> "cousin", "a coil of rope" -> "coil of rope"
     (items keep "of"). At most four words. */
  function headPhrase(desc, kind) {
    const words = cleanText(String(desc || '').replace(/^new:/i, ''), 200).toLowerCase().replace(/[^a-z0-9'\- ]+/g, ' ').split(/\s+/).filter(Boolean);
    while (words.length && LEAD_WORDS.has(words[0])) words.shift();
    const out = [];
    for (const w of words) {
      // A thing keeps "of" (a coil of rope); "and" ends it (a rifle and shells is a rifle; Pipeline splits "X and a Y" into two things).
      if (out.length && BREAK_WORDS.has(w) && !(kind === 'item' && w === 'of')) break;
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
     "head of Sturdivant Land and Timber" -> "head"; then the tags that name
     a kind of person (TAG_PERSON: Glenda's "dispatcher", Dwight's
     "foreman"). */
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
    for (const t of Array.isArray(n.tags) ? n.tags : []) {
      const w = String(t).toLowerCase();
      if (TAG_PERSON.has(w) && !out.includes(w)) out.push(w);
    }
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
  /* The place a possessive names, or null (the mock parser's mockPlace
     reads walks the same way): "Pittman's" or "Byrd's" alone is the
     business whose name starts so; "Royce's house" (place, home, trailer,
     apartment, farm) the home of someone by that name; "Hollis's pawn shop"
     or "Loretta's bar" a place of that name or kind tied to that person (its
     name has theirs, they work there or live there); "Pittman's gas" the
     business whose name it starts. A person's own things and kin ("Royce's
     truck", "Dewayne's wife") are not places: null. */
  const POSSESSIVE_HOMES = ['house', 'home', 'place', 'trailer', 'apartment', 'farm'];
  function possessivePlace(want, s) {
    const m = /^([a-z][a-z-]*(?: [a-z][a-z-]*)?)'s?(?:\s+(.*))?$/.exec(String(want || ''));
    if (!m) return null;
    const owner = m[1];
    const rest = (m[2] || '').trim();
    const poss = `${owner}'s`;
    const names = l => [l.name].concat(Array.isArray(l.aka) ? l.aka : []).map(plainName);
    const places = s.locations.filter(l => isObj(l));
    const people = s.npcs.filter(n => nameTokens(n).includes(owner) || plainName(n.name) === owner);
    const homeOf = n => { const id = isObj(n.home) ? n.home.locationId : typeof n.home === 'string' ? n.home : null; return id ? State.loc(id) : null; };
    // A business whose own name starts with the possessive ("Pittman's Gas and Service", "Byrd's Pawn").
    const business = places.find(l => names(l).some(x => x === poss || x.startsWith(`${poss} `)));
    if (!rest) return business || people.map(homeOf).find(Boolean) || null;
    if (business && names(business).some(x => x.startsWith(`${poss} ${rest}`))) return business;
    if (POSSESSIVE_HOMES.includes(rest)) return people.map(homeOf).find(Boolean) || business || null;
    // "Hollis's pawn shop", "Loretta's bar": a place of that name or kind tied to them.
    const tied = l => names(l).some(x => x.includes(poss)) || people.some(n => homeOf(n) === l || PHASES.some(ph => ((l.npcIdsBySchedule || {})[ph] || []).includes(n.id)));
    const byName = places.filter(l => names(l).includes(rest));
    if (byName.length) return byName.find(tied) || (byName.length === 1 ? byName[0] : null);
    return placeByPhrase(rest, places.filter(tied));
  }
  /* An existing entity a `new:` description already names, or null. NPCs who
     are present win over absent ones. ctx: { locationId }. A place made in
     play (made: "Back room") is per building: only one here or next door
     is reused, so the diner's back room is not the bar's. */
  function matchExisting(desc, ctx) {
    const s = State.current;
    if (!s) return null;
    const head = headPhrase(desc, 'npc');
    if (!head) return null;
    const here = (ctx && ctx.locationId) || s.player.locationId;
    // A place's exact name first: "Dewayne's house" is the house, not Dewayne. Then any other name it goes by ("the county seat").
    const want = plainName(head);
    const town = new Set(((data() && data().locations) || []).map(x => x.id));
    const near = x => x.id === here || (Array.isArray(x.exits) && x.exits.includes(here));
    const byName = s.locations.filter(x => plainName(x.name) === want);
    const l = byName.find(x => !made(x, town)) || byName.find(x => made(x, town) && near(x))
      || s.locations.find(x => Array.isArray(x.aka) && x.aka.some(a => plainName(a) === want));
    if (l) return { kind: 'location', id: l.id };
    // A possessive that names a place, not its owner (wave 3, review bug 10): "Pittman's", "Hollis's pawn shop", "Dewayne's house".
    const owned = possessivePlace(want, s);
    if (owned) return { kind: 'location', id: owned.id };
    const presentIds = State.npcsAt(here).map(n => n.id);
    // The living in town first; then the dead and the people who live elsewhere, who exist and can be talked about but are never here.
    const inTown = s.npcs.filter(n => n.alive !== false && n.status !== 'dead' && n.status !== 'gone');
    const absent = s.npcs.filter(n => !inTown.includes(n));
    const person = whoIs(head, inTown, presentIds) || whoIs(head, absent, presentIds);
    if (person) return { kind: 'npc', id: person };
    const itemWant = plainName(headPhrase(desc, 'item'));
    const here2 = State.loc(here);
    const items = s.player.inventory.concat((here2 && here2.items) || []);
    const it = items.find(i => plainName(i.name) === itemWant) || items.find(i => plainName(headPhrase(i.name, 'item')) === itemWant);
    if (it) return { kind: 'item', id: it.id };
    return null;
  }

  // ----- relations: the one comparison (Upgrade can read Town.sameRel too) -----
  /* A relation word as the cast data writes it: "dad" -> "father", "momma"
     -> "mother", "kid" -> "child" (KIN_SYNONYMS); "his wife" -> "wife". */
  function relWord(r) {
    const w = State.cleanRelation ? State.cleanRelation(r) : cleanText(r, 30).toLowerCase();
    return KIN_SYNONYMS[w] || w;
  }
  /* Which gender a relation word names, or null ("child", "cousin"). */
  function relGender(w) {
    for (const [she, he] of GENDERED_WORDS) { if (w === she) return 'she'; if (w === he) return 'he'; }
    return null;
  }
  /* How well a relation asked for fits one on record: 3 the same word
     (after KIN_SYNONYMS: "dad" is "father"), 2 a word for either of a pair
     ("kid" and "son"), 1 the same once the she and he forms are folded
     ("mother" and "father"), 0 not the same. */
  function relRank(asked, recorded) {
    const a = relWord(asked);
    const b = relWord(recorded);
    if (!a || !b) return 0;
    if (a === b) return 3;
    if ((KIN_NEUTRAL[a] || []).includes(b) || (KIN_NEUTRAL[b] || []).includes(a)) return 2;
    return relGender(a) && genderWord(a, 'she') === genderWord(b, 'she') ? 1 : 0;
  }
  /* Two relation words for the same tie, either way round ("dad" and
     "father", "wife" and "husband" as the same tie told from either pronoun). */
  function sameRel(a, b) { return relRank(a, b) > 0; }

  // ----- people by what they are: words the cast's roles do not use -----
  const isTag = (n, ...tags) => (Array.isArray(n.tags) ? n.tags : []).some(t => tags.includes(String(t).toLowerCase()));
  const roleOf = n => String(n.role || '').toLowerCase();
  const isTeen = n => isTag(n, 'teenager', 'teen') || (Number.isInteger(n.age) && n.age >= 10 && n.age <= 17);
  const isOld = n => isTag(n, 'elderly', 'oldtimer') || (Number.isInteger(n.age) && n.age >= 65);
  /* [head phrase, who answers to it, order]: "the cop" is anyone tagged
     police or an officer or chief by role, "the kid" a teenager, "the old
     man" a he of 65 or more (the oldest first). Someone here first. */
  const PEOPLE_WORDS = [
    [/^(cops?|police|policem[ae]n|policewom[ae]n|deput(y|ies)|officers?|patrolman|lawman|the law)$/, n => isTag(n, 'police') || /\b(officer|chief)\b/.test(roleOf(n))],
    [/^(preacher|pastor|reverend|minister|priest|parson)$/, n => isTag(n, 'pastor', 'priest') || /\b(pastor|preacher|reverend|minister|priest)\b/.test(roleOf(n))],
    [/^(kids?|teens?|teenagers?|youngsters?)$/, isTeen],
    [/^(boy|lad|young man|young fella)$/, n => isTeen(n) && n.pronouns === 'he'],
    [/^(girl|lass|young woman|young lady)$/, n => isTeen(n) && n.pronouns === 'she'],
    [/^(cashier|clerk|checkout girl|register girl)$/, n => isTag(n, 'cashier', 'clerk') || /\b(cashier|clerk|register)\b/.test(roleOf(n))],
    [/^(maid|housekeeper|cleaning lady|cleaner)$/, n => isTag(n, 'maid', 'housekeeper') || /\b(maid|housekeeper)\b/.test(roleOf(n))],
    [/^(dealer|drug dealer|pusher)$/, n => isTag(n, 'dealer')],
    [/^(old man|old guy|old fella|old feller|old-timer|old timer|oldtimer)$/, n => n.pronouns === 'he' && isOld(n), 'oldest'],
    [/^(old woman|old lady|old gal)$/, n => n.pronouns === 'she' && isOld(n), 'oldest'],
    [/^(bartender|barkeep|barkeeper)$/, n => isTag(n, 'bartender') || /\b(bartender|barkeep)\b/.test(roleOf(n))],
    [/^(mechanic|grease monkey)$/, n => isTag(n, 'mechanic') || /\bmechanic\b/.test(roleOf(n))],
    [/^nurse$/, n => isTag(n, 'nurse') || /\bnurse\b/.test(roleOf(n))],
    [/^(teacher|schoolteacher)$/, n => isTag(n, 'teacher') || /\bteacher\b/.test(roleOf(n))],
    [/^farmer$/, n => isTag(n, 'farmer') || /\bfarmer\b/.test(roleOf(n))],
    [/^(bookie|bookmaker)$/, n => isTag(n, 'bookie')]
  ];
  /* The id of the person in the list a description's head phrase names, or null. */
  function whoIs(head, live, presentIds) {
    /* "Dewayne's wife" is not Dewayne: a possessive name before a word for a
       person names whoever is that to them (the story's own record, or a role
       that says so); a name beside it ("Mavis, Dewayne's wife") may still be
       someone here; otherwise nobody yet. A kin word counts as a word for a
       person ("Colt's dad", "Micah's grandma"). */
    const pw = personWords();
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isPersonWord = w => pw.test(w) || FAMILY_RELATIONS.includes(w) || has(KIN_SYNONYMS, w) || has(KIN_NEUTRAL, w);
    const own = Array.from(head.matchAll(/([a-z][a-z-]*)'s\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/g)).map(m => {
      const two = m[3] ? `${m[2]} ${m[3]}` : null;
      const rel = two && (has(KIN_SYNONYMS, two) || (isPersonWord(two) && isPersonWord(m[3]))) ? two : isPersonWord(m[2]) ? m[2] : null;
      return rel ? { owner: m[1], rel, phrase: `${m[1]}'s ${rel}` } : null;
    }).filter(Boolean)[0];
    const byPresence = list => list.sort((a, b) => presentIds.includes(b.id) - presentIds.includes(a.id));
    const older = (a, b) => (Number.isInteger(b.age) ? b.age : 0) - (Number.isInteger(a.age) ? a.age : 0);
    if (own) {
      const owners = State.current.npcs.filter(n => nameTokens(n).includes(own.owner));
      const rel = relWord(own.rel);
      const wants = relGender(rel);
      /* Who is that to them, the closest fit first: the very relation on
         record ("Kaylee's mother" is Darlene, not Royce, her father), then
         a word for either of a pair ("Royce's kid"), then the she or he
         form of it, for someone whose pronouns fit the word asked; a
         relation made in play or a role that says so is the very one. */
      const rank = n => {
        let best = 0;
        for (const o of owners) {
          for (const x of State.tiesOf(o).has) {
            if (x.id !== n.id || !x.relation) continue;
            let r = relRank(rel, x.relation);
            if (r > 0 && r < 3 && wants && (n.pronouns === 'she' || n.pronouns === 'he') && n.pronouns !== wants) r = 0;
            best = Math.max(best, r);
          }
          if (isObj(n.created) && o.id === n.created.relationToNpcId && n.created.relation && relRank(rel, n.created.relation) === 3) best = 3;
        }
        if (hasPhrase(roleOf(n), `${own.owner}'s ${own.rel}`) || hasPhrase(roleOf(n), `${own.owner}'s ${rel}`) || plainName(n.name) === plainName(own.phrase)) best = 3;
        return best;
      };
      const ranked = live.map(n => ({ n, r: rank(n) })).filter(x => x.r > 0);
      if (ranked.length) {
        const top = Math.max(...ranked.map(x => x.r));
        return byPresence(ranked.filter(x => x.r === top).map(x => x.n))[0].id;
      }
      const rest = head.replace(own.phrase, ' ').replace(/\s+/g, ' ').trim();
      const named = rest ? live.filter(n => nameMentions(' ' + rest + ' ', n)) : [];
      return named.length ? byPresence(named)[0].id : null;
    }
    // "Mrs. Pittman" is a she and "Mr. Pittman" a he: the title sorts the family out (Mr. and Mrs.: the elder first).
    const title = /^(mr|mister|mrs|missus|ms|miss)\s+\S/.exec(head);
    const fits = n => !title || n.pronouns === (/^(mr|mister)$/.test(title[1]) ? 'he' : 'she');
    const npcs = live.filter(n => mentions(' ' + head + ' ', n) && fits(n));
    if (title && /^(mr|mister|mrs|missus)$/.test(title[1])) npcs.sort(older);
    byPresence(npcs);
    if (npcs.length) return npcs[0].id;
    // A one-word job ("the clerk", "the officer") is the person whose role ends in it, someone here first.
    if (/^[a-z][a-z-]+$/.test(head) && head.length >= 4 && personWords().test(head)) {
      const ends = live.filter(n => rolePhrases(n).some(x => x === head || x.endsWith(' ' + head)));
      if (ends.length) return byPresence(ends)[0].id;
    }
    // A word the roles do not use ("the cop", "the preacher", "the kid", "the old man").
    for (const [re, who, order] of PEOPLE_WORDS) {
      if (!re.test(head)) continue;
      const found = live.filter(n => who(n));
      if (order === 'oldest') found.sort(older);
      return found.length ? byPresence(found)[0].id : null;
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
    // ids that clock effects create later also count as known
    const effectsOf = f => arr(f.clocks).flatMap(c => (isObj(c.onComplete) ? arr(c.onComplete.effects) : []));
    arr(t.factions).forEach(f => effectsOf(f).forEach(ef => {
      if (ef && ef.op === 'openThread' && ef.thread) ids.add(ef.thread.id);
      if (ef && ef.op === 'addRumour' && ef.rumour) ids.add(ef.rumour.id);
      if (ef && ef.op === 'plantSeed' && ef.seed) ids.add(ef.seed.id);
    }));
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
    // A location or npc trigger may name several ("any of these places").
    const checkTrigger = (where, tr) => {
      if (!isObj(tr)) { e(`${where}: trigger missing`); return; }
      const many = v => (Array.isArray(v) ? (v.length ? v : [undefined]) : [v]);
      if (tr.type === 'day') { if (!Number.isInteger(tr.value)) e(`${where}: day trigger needs an integer`); }
      else if (tr.type === 'location') many(tr.value).forEach(v => checkRef(where, 'loc', v));
      else if (tr.type === 'npc') many(tr.value).forEach(v => checkRef(where, 'npc', v));
      else if (tr.type === 'clock') { const m = /^(fac_[a-z0-9_]+):(\d+)$/.exec(String(tr.value)); if (!m) e(`${where}: bad clock trigger ${tr.value}`); else checkRef(where, 'fac', m[1]); }
      else e(`${where}: bad trigger type ${tr.type}`);
    };
    /* requires (seeds, clock completions) and an event branch's when: the
       ids they name exist (World.conditionsMet reads them). */
    const checkWhen = (w, c) => {
      if (c === undefined || c === null) return;
      if (!isObj(c)) { e(`${w}: must be an object`); return; }
      arr(c.npcFree).forEach(id => checkRef(w, 'npc', id));
      for (const [id, l] of Object.entries(isObj(c.npcAt) ? c.npcAt : {})) { checkRef(w, 'npc', id); checkRef(w, 'loc', l); }
      for (const id of Object.keys(isObj(c.attitudeAtLeast) ? c.attitudeAtLeast : {})) checkRef(w, 'npc', id);
      // Wave 30: relAtLeast / relBelow { npcId: { liking, trust, fear, knows } }.
      for (const k of ['relAtLeast', 'relBelow']) for (const [id, v] of Object.entries(isObj(c[k]) ? c[k] : {})) { checkRef(w, 'npc', id); if (!isObj(v)) e(`${w}.${k}.${id}: must be { liking, trust, fear, knows }`); }
      for (const id of Object.keys(isObj(c.clockAtLeast) ? c.clockAtLeast : {})) checkRef(w, 'fac', id);
      if (c.playerAt !== undefined) { if (typeof c.playerAt !== 'string') e(`${w}.playerAt: must be a place id`); else checkRef(w, 'loc', c.playerAt); }
      for (const k of ['flagsSet', 'flagsUnset', 'npcFree', 'obligationOpen']) if (c[k] !== undefined && !Array.isArray(c[k])) e(`${w}.${k}: must be a list`);
    };
    const checkEffect = (w, ef) => {
      if (!isObj(ef) || !EFFECT_OPS.includes(ef.op)) { e(`${w}: unknown op ${ef && ef.op}`); return; }
      if (ef.locationId !== undefined) checkRef(w, 'loc', ef.locationId);
      if (ef.npcId !== undefined) checkRef(w, 'npc', ef.npcId);
      if (ef.threadId !== undefined) checkRef(w, 'thr', ef.threadId);
      if (ef.factionId !== undefined && ef.factionId !== null) checkRef(w, 'fac', ef.factionId);
      if (ef.op === 'factionRelation') { checkRef(w, 'fac', ef.a); checkRef(w, 'fac', ef.b); }
      // Wave 32: a tie's change names its two people.
      if (ef.op === 'tieDelta') { checkRef(w, 'npc', ef.fromId); checkRef(w, 'npc', ef.toId); }
      if (ef.op === 'reputationDelta' && ef.key !== 'town') checkRef(w, 'fac', ef.key);
      if (ef.op === 'plantSeed' && isObj(ef.seed)) {
        checkTrigger(w, ef.seed.trigger);
        checkWhen(`${w}.seed.requires`, ef.seed.requires);
        checkAlt(`${w}.seed`, ef.seed.alt);
        arr(ef.seed.effects).forEach((x, k) => checkEffect(`${w}.seed.effects[${k}]`, x));
      }
      if (ef.op === 'setFlag' && State.RESERVED_FLAGS.includes(ef.key)) e(`${w}: flag ${ef.key} is reserved`);
    };
    const checkAlt = (w, alt) => {
      if (alt === undefined || alt === null) return;
      if (!isObj(alt) || typeof alt.text !== 'string') { e(`${w}.alt: needs text`); return; }
      arr(alt.effects).forEach((x, k) => checkEffect(`${w}.alt.effects[${k}]`, x));
    };
    for (const f of arr(t.factions)) {
      if (!arr(f.clocks).length) e(`${f.id}: needs clocks`);
      arr(f.clocks).forEach((c, i) => {
        const where = `${f.id}.clocks[${i}]`;
        if (!Number.isInteger(c.segments) || c.segments < 1) e(`${where}: segments must be a positive integer`);
        if (!isObj(c.onComplete) || typeof c.onComplete.text !== 'string' || !Array.isArray(c.onComplete.effects)) { e(`${where}: onComplete needs text and effects`); return; }
        c.onComplete.effects.forEach((ef, j) => checkEffect(`${where}.effects[${j}]`, ef));
        checkWhen(`${where}.requires`, c.onComplete.requires);
        checkAlt(where, c.onComplete.alt);
      });
      for (const r of Object.keys(f.relations || {})) if (!facIds.has(r)) e(`${f.id}: relation to unknown ${r}`);
    }
    for (const th of arr(t.threads)) for (const id of arr(th.linkedIds)) if (!ids.has(id)) e(`${th.id}: linked unknown ${id}`);
    for (const sd of arr(t.seeds)) {
      checkTrigger(sd.id, sd.trigger);
      checkWhen(`${sd.id}.requires`, sd.requires);
      checkAlt(sd.id, sd.alt);
      arr(sd.effects).forEach((x, k) => checkEffect(`${sd.id}.effects[${k}]`, x));
    }
    // Town events (World.fireEvents) and the epilogue: a day, a phase, a place, branches and a default.
    const checkBranches = (w, ev) => {
      arr(ev.branches).forEach((br, k) => {
        if (!isObj(br) || typeof br.text !== 'string') { e(`${w}.branches[${k}]: needs text`); return; }
        checkWhen(`${w}.branches[${k}].when`, br.when);
        arr(br.effects).forEach((x, j) => checkEffect(`${w}.branches[${k}].effects[${j}]`, x));
      });
      if (!isObj(ev.default) || typeof ev.default.text !== 'string') e(`${w}: needs a default with text`);
      else arr(ev.default.effects).forEach((x, j) => checkEffect(`${w}.default.effects[${j}]`, x));
    };
    const eventIds = new Set();
    arr(t.events).forEach((ev, i) => {
      const w = `events[${i}]`;
      if (!isObj(ev) || typeof ev.id !== 'string' || !ev.id) { e(`${w}: needs an id`); return; }
      if (eventIds.has(ev.id)) e(`${w}: duplicate event id ${ev.id}`);
      eventIds.add(ev.id);
      if (!Number.isInteger(ev.day) || ev.day < 1) e(`${ev.id}: day must be a whole number, 1 or more`);
      if (ev.phase !== undefined && !PHASES.includes(ev.phase)) e(`${ev.id}: bad phase ${ev.phase}`);
      if (ev.locationId !== undefined && ev.locationId !== null) checkRef(ev.id, 'loc', ev.locationId);
      if (ev.attendees !== undefined && !Array.isArray(ev.attendees)) e(`${ev.id}: attendees must be a list of npc ids`);
      for (const id of arr(ev.attendees)) checkRef(ev.id, 'npc', id);
      checkBranches(ev.id, ev);
    });
    if (t.epilogue !== undefined && t.epilogue !== null) {
      if (!isObj(t.epilogue)) e('epilogue must be an object');
      else {
        if (t.epilogue.onDay !== undefined && !Number.isInteger(t.epilogue.onDay)) e('epilogue: onDay must be a whole number');
        checkBranches('epilogue', t.epilogue);
      }
    }
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
     day 1, so [3, 5] fires on day 3, 4 or 5 (never earlier than tomorrow). */
  const LOOSE_END_ATTITUDE = { debt: -10, enemy: -40, secret: -5, lost: 10, promise: 5 };
  // What a loose end does to their trust (wave 27; the integration plan's 4.6, site 34), into their start with the liking.
  const LOOSE_END_TRUST = Object.freeze({ debt: -10, enemy: -50, secret: -5, lost: 10, promise: 5 });
  function firstScheduledLocation(npcId) {
    const s = State.current;
    for (const p of PHASES) for (const l of s.locations) if (((l.npcIdsBySchedule || {})[p] || []).includes(npcId)) return l.id;
    return null;
  }
  /* The obligation a loose end's option carries (CONTRACTS section 4:
     obligation { kind, amount?, dueOffset, text, itemName?, onStart?,
     onMiss, onMet }): an option written as { text, obligation }, else the
     kind's obligations[i] (lined up with options, like link.optionTags),
     else the kind's own obligation. Words the player wrote themselves take
     the kind's own obligation (its default), else the first option's. */
  const LOOSE_END_OBLIGATION = { debt: 'debt', secret: 'blackmail', promise: 'promise', lost: 'errand' };
  function looseEndObligation(def, at) {
    if (at < 0 && isObj(def.obligation)) return def.obligation;
    const i = at >= 0 ? at : 0;
    const o = Array.isArray(def.options) ? def.options[i] : null;
    if (isObj(o) && isObj(o.obligation)) return o.obligation;
    if (Array.isArray(def.obligations) && isObj(def.obligations[i])) return def.obligations[i];
    return isObj(def.obligation) ? def.obligation : null;
  }
  function fillAll(v, vars) {
    if (typeof v === 'string') return fillTemplate(v, vars);
    if (Array.isArray(v)) return v.map(x => fillAll(x, vars));
    if (isObj(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = fillAll(v[k], vars); return o; }
    return v;
  }
  /* An option is its words, or { text, obligation? } (content may write either). */
  function optionText(o) { return cleanText(typeof o === 'string' ? o : isObj(o) ? (o.text || o.label || '') : '', 200); }
  /* The obligation a loose end carries, as the addObligation effect its seed
     runs when it fires (dueOffset days from that day) and the onStart
     effects that happen as it is tied (the letter an errand delivers), with
     every placeholder filled for the person it is tied to and the player.
     le: { kind, text, npcId? }; target: that person's record (else le.npcId).
     The one builder: a new game (resolveLooseEnd) and Upgrade version 8 use
     it. Returns { effect, onStart } or null. */
  function obligationFor(le, target) {
    const s = State.current;
    const def = le && LOOSE_ENDS[le.kind];
    const n = target || (le ? State.npc(le.npcId) : null);
    if (!s || !def || !n) return null;
    const text = cleanText(le.text, 200) || optionText((def.options || [])[0]);
    const at = (def.options || []).findIndex(o => optionText(o) === text);
    const obl = looseEndObligation(def, at);
    if (!obl) return null;
    const ov = { npc: n.name, npcId: n.id, player: s.player.name, playerName: s.player.name, text };
    const kinds = State.OBLIGATION_KINDS || [];
    const effect = {
      op: 'addObligation', kind: kinds.includes(obl.kind) ? obl.kind : (LOOSE_END_OBLIGATION[le.kind] || 'promise'), npcId: n.id,
      text: cleanText(fillTemplate(obl.text || text, ov), 200), amount: Number.isInteger(obl.amount) ? obl.amount : null,
      dueOffset: Number.isInteger(obl.dueOffset) ? obl.dueOffset : 3, itemName: obl.itemName ? fillTemplate(obl.itemName, ov) : null,
      onMiss: fillAll(Array.isArray(obl.onMiss) ? obl.onMiss : [], ov), onMet: fillAll(Array.isArray(obl.onMet) ? obl.onMet : [], ov)
    };
    // What content may add (wave 2): the missed due event's words, and the
    // person owed when it is not the one it binds (owedTo: the woman who
    // wrote the letter, not the daughter it is for; askerId is the older
    // name for the same thing). "{npcId}" in it is the bound person.
    if (typeof obl.missText === 'string' && obl.missText.trim()) effect.missText = cleanText(fillTemplate(obl.missText, ov), 300);
    const owed = fillTemplate(typeof obl.owedTo === 'string' ? obl.owedTo : typeof obl.askerId === 'string' ? obl.askerId : '', ov);
    if (owed && State.npc(owed)) effect.owedTo = owed;
    return { effect, onStart: fillAll(Array.isArray(obl.onStart) ? obl.onStart : [], ov).filter(isObj) };
  }
  function resolveLooseEnd(le) {
    const s = State.current;
    const def = le && LOOSE_ENDS[le.kind];
    if (!def) throw new Error('unknown loose end: ' + (le && le.kind));
    const text = cleanText(le.text, 200) || optionText((def.options || [])[0]);
    const used = new Set((s.player.looseEnds || []).map(x => x.npcId));
    const link = isObj(def.link) ? def.link : {};
    const at = (def.options || []).findIndex(o => optionText(o) === text);
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
    const day = Math.max(s.time.day + 1, Rng.int(lo, hi));
    let trigger = { type: 'day', value: day };
    if (sd.trigger === 'npc') trigger = { type: 'npc', value: target.id };
    else if (sd.trigger === 'location') trigger = { type: 'location', value: firstScheduledLocation(target.id) || s.player.locationId };
    const vars = { npc: target.name, player: s.player.name, text };
    const seedId = uniqueId('seed_le_' + le.kind, id => !!State.seed(id));
    const threadId = uniqueId('thr_le_' + le.kind, id => !!State.thread(id));
    const seedObj = { id: seedId, cause: `Loose end (${def.label}): ${text}`, effect: fillTemplate(sd.effect || '{npc} turns up.', vars), trigger, fired: false, hidden: true, origin: { kind: 'loose_end', npcId: target.id } };
    if (trigger.type !== 'day') seedObj.notBeforeDay = day;
    /* The option's obligation rides on the seed and is made when it fires
       (World), due dueOffset days after that day (State's addObligation
       reads dueOffset against the day it runs). Placeholders are filled now:
       the person and the player are known. Its onStart effects happen now,
       as the loose end is tied (the letter the player carries). */
    const ob = obligationFor({ kind: le.kind, text }, target);
    const onStart = ob ? ob.onStart : [];
    if (ob) seedObj.effects = [ob.effect];
    /* What the first beat threatens comes good (wave 5, the round-4
       playtest: "it gets settled before the week is out", then nothing):
       the kind's followUp is planted when that beat fires, some days on,
       and happens only while the loose end is open and they still hold it
       against the player; else its alt. */
    const fu = isObj(def.followUp) ? def.followUp : null;
    if (fu && trigger.type === 'day') {
      const fv = { npc: target.name, npcId: target.id, player: s.player.name, playerName: s.player.name };
      const fo = Array.isArray(fu.dayOffset) && fu.dayOffset.length ? fu.dayOffset : [3, 5];
      // Picked from the day and the person, not the dice: tying a loose end draws no more numbers than before.
      const flo = toInt(fo[0]) || 3;
      const after = flo + ((day + target.id.length) % Math.max(1, (toInt(fo.length > 1 ? fo[1] : fo[0]) || flo) - flo + 1));
      const fillAll = v => (typeof v === 'string' ? fillTemplate(v, fv) : Array.isArray(v) ? v.map(fillAll) : isObj(v) ? Object.fromEntries(Object.keys(v).map(k => [k, fillAll(v[k])])) : v);
      const follow = { id: `${seedId}_due`, cause: `Loose end (${def.label}), what was threatened: ${text}`, effect: fillTemplate(fu.effect, fv), trigger: { type: 'day', value: day + after }, fired: false, hidden: true,
        origin: { kind: 'loose_end', npcId: target.id }, requires: { threadOpen: [threadId], attitudeBelow: { [target.id]: 0 } }, effects: fillAll(fu.effects || []) };
      if (isObj(fu.alt)) follow.alt = fillAll(fu.alt);
      seedObj.effects = (seedObj.effects || []).concat([{ op: 'plantSeed', seed: follow }]);
    }
    /* Where they stood before the player came (wave 27): the loose end's
       liking and trust go into their start (rel.start, relStart), with
       knows-you 30, so nothing fades or drifts it away; the liking reads as
       before (Boyd -10 becomes -50). */
    const attitude = LOOSE_END_ATTITUDE[le.kind] || 0;
    const trust = LOOSE_END_TRUST[le.kind] || 0;
    /* Wave 29 (the integration plan's 8.2): the informant starts the game
       holding what they know over the player, in the player's own words,
       weighed by the option ([2, 2, 3]), mattering to the police head; the
       player does not know of the record until the price is named. */
    const head = le.kind === 'secret' ? Rel.policeHead() : null;
    const lev = le.kind === 'secret' ? { leverageAdd: { holder: target.id, over: 'player', about: { kind: 'loose_end' }, text, weight: at >= 0 ? Rel.LEVERAGE_WEIGHT.looseEnd[at] || 2 : 2, mattersTo: head ? [head] : [], playerKnows: false, via: 'loose_end' } } : {};
    const r = State.apply({
      ...lev,
      relStart: { npcId: target.id, w: attitude, t: trust, k: 30 },
      effects: [
        { op: 'plantSeed', seed: seedObj },
        { op: 'openThread', thread: { id: threadId, title: def.label, summary: `${text} (${target.name}, ${target.role})`, status: 'open', knownToPlayer: true, linkedIds: [target.id] } },
        ...onStart
      ].filter(Boolean),
      newMemories: [{ npcId: target.id, text: `Loose end with ${s.player.name} (${lowerFirst(def.label)}): ${text}`, weight: 2 }],
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

  return { data, instantiate, plausible, guessKind, properName, validate, resolveLooseEnd, obligationFor, openingScene, EFFECT_OPS, headPhrase, rolePhrases, mentions, nameMentions, matchExisting, placeType, goodsFor, sameRel, relWord, placesMade, harmlessHead, isPersonWord, weaponOf, makerFirst,
    // Wave 30: where a loose end's person starts (Upgrade's version 9 reads them).
    LOOSE_END_ATTITUDE: Object.freeze(Object.assign({}, LOOSE_END_ATTITUDE)), LOOSE_END_TRUST };
})();

