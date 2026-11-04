// ===== Module: Style =====
/* Banned-phrase, length, simile, repeat, invented-past and invented-name
   checks (SPEC.md section 9 and the owner's rules) and the narrator's cached
   system prompt, in one of two styles (Settings.narrationStyle: casual, the
   default, or literary). Every problem is hard or soft (check().hard says
   whether any is hard): Pipeline step 7 rewrites once with
   regenerationNote() for a hard problem and logs the soft ones.
   Wave 42: the cached style block says the cash rule once (the NEVER line;
   KNOWLEDGE keeps only what the player carries is theirs), and the two Say
   examples' inputs no longer repeat whom PLAYER SAYS names; the casual
   DIALOGUE line leaves "do not reuse a phrase from LAST 3 TURNS" to the
   packet's VARIETY line, which says it every turn. */
const Style = (() => {
  const EXAMPLES_INTRO = 'EXAMPLES (from a different town; none of these people or places exist in this game):';
  /* The rule half of the packet's WHAT PEOPLE KNOW line. It never changes, so
     it sits in the cached style block (between the guide and the examples,
     byte-identical per style); the packet keeps only when the player came to
     town and who knew them before (Pipeline.knowledgeLine).
     Wave 42: its last clause (nobody knows or names the total) left it: the
     guide's NEVER line says it. */
  const KNOWLEDGE = 'WHAT PEOPLE KNOW: the player is new in town (the packet says since when). Each person knows about the player only what their "to you" reasons, what they hold you to and LOOSE ENDS say and what happened in front of them (STORY SO FAR, EARLIER, LAST 3 TURNS). Nobody else met them, heard of them or was warned about them before they came, and nothing about them happened "last night" or "a while ago" that the story does not show. Anyone may have heard the TOWN NEWS. What the player carries and how much money they have is theirs alone to know: a person sees only what the player shows, hands over or says.';
  const STYLES = {
    casual: { guide: STYLE_GUIDE_CASUAL, examples: EXAMPLE_TURNS_CASUAL },
    literary: { guide: STYLE_GUIDE_LITERARY, examples: EXAMPLE_TURNS_LITERARY }
  };
  const NAMES = Object.keys(STYLES);
  const DEFAULT = 'casual';
  // Both guides carry the same BANNED PHRASES line (SPEC section 9).
  const BANNED = (() => {
    const line = STYLE_GUIDE_LITERARY.split('\n').find(l => l.startsWith('BANNED PHRASES:')) || '';
    return Array.from(line.matchAll(/"([^"]+)"/g), m => m[1].toLowerCase());
  })();
  const WORD_LIMITS = { normal: 90, zoom: 150 };
  /* A problem is hard (worth a second paid narration) or soft (logged only):
     hard is a narration more than HARD_OVER words over its limit, a past
     invented on day 1, "What do you do" outside dialogue, or a name nobody in
     the town has. Everything else (a banned phrase, a simile, "As you", a
     repeated spoken phrase, a few words over) is soft. */
  const HARD_OVER = 15;
  /* Casual only: a simile outside dialogue ("like a", "like an", "as if").
     Quoted speech is left out, so "I'd like a beer," she says passes, and so
     is "like a" after looks, sounds, seems, feels, something, about or
     would: "looks like a cop", "something like a hundred bucks". */
  const SIMILE = /\b(like an?|as if)\b/gi;
  const NOT_SIMILE = /(?:\b(?:looks?|looked|looking|sounds?|sounded|seems?|seemed|feels?|felt|something|about|would)|'d)\s+$/i;
  const prompts = {};
  function pick(style) { return NAMES.includes(style) ? style : DEFAULT; }
  /* The style in Settings now (an unknown value reads as casual). */
  function current() {
    let s = null;
    try { s = Storage.settings().narrationStyle; } catch (e) { s = null; }
    return pick(s);
  }
  /* Byte-identical every call for a given style so it caches
     (docs/API_NOTES.md): nothing volatile goes in here, only that style's
     guide, the WHAT PEOPLE KNOW rules and its example turns. Caches are per
     style and per model, so switching the style starts the cache cold once. */
  /* Wave 28 (SPEC rule 7; the integration plan's 19.2): one rule both
     styles carry, in the cached block between the guide and the WHAT
     PEOPLE KNOW rules (13 words, about 18 tokens by the api test's
     estimate). Whether a scene is intimate at all is the engine's (wave 29). */
  const FADE_TO_BLACK = 'Intimate scenes fade to black before anything explicit: the next line is afterwards.';
  /* Wave 30 (the integration plan's 10.3 and 19.7, the trimmed note): how
     to read a person's "to you" line, the flirt rule and the hidden reason,
     after the fade-to-black rule (about 87 tokens by the api test's
     estimate; the LEVERAGE and BETWEEN THEM lines explain themselves per
     turn). */
  const PEOPLE_NOTE = 'Each person\'s "to you" is where they stand with the player and why; "plays it" is how they carry it now: play it, never say it. Nobody flirts back unless their line says "open to a flirt" or a turn line says so, and nobody under 18 ever flirts or is flirted with. A reason "of their own" is never hinted at.';
  function systemPrompt(style) {
    const k = pick(style === undefined ? current() : style);
    if (prompts[k] === undefined) {
      const ex = STYLES[k].examples.map(t => `Input: ${t.input}\n(${t.context})\n${t.narration}`).join('\n\n');
      prompts[k] = `${STYLES[k].guide}\n\n${PEOPLE_NOTE}\n\n${FADE_TO_BLACK}\n\n${KNOWLEDGE}\n\n${EXAMPLES_INTRO}\n\n${ex}`;
    }
    return prompts[k];
  }
  function unquoted(t) { return t.replace(/"[^"]*"|“[^”]*”?/g, ' '); }
  function simileIn(outside) {
    SIMILE.lastIndex = 0;
    for (let m = SIMILE.exec(outside); m; m = SIMILE.exec(outside)) {
      const w = m[1].toLowerCase();
      if (w !== 'as if' && NOT_SIMILE.test(outside.slice(Math.max(0, m.index - 24), m.index))) continue;
      SIMILE.lastIndex = 0;
      return w;
    }
    return null;
  }

  // ----- the names a narration may use -----
  /* tests/mentions.cjs, ported: a capitalised word that does not start a
     sentence (or two in a row anywhere) has to be someone or somewhere the
     game has. Known: everyone in the game (full, first and last names, and
     "the Gentrys"), every place (name, map label, other names), the
     factions, the town and its map labels, the player, the calendar, NAME_ALLOW
     (titles, kin words used as names, faith, holidays, the services, brands,
     regional words, states and a few cities), BRAND_PHRASES (brands and
     names of two or more words: "Mountain Dew", "Dr Pepper", "Ole Miss")
     and every capitalised word in the narrator's own packet (what the player
     typed, a due event, the news). Sentence starts, "I" and words in
     capitals are never names.
     Wave 2: an unknown word is a hard problem (worth a paid rewrite) only
     when something marks it as a person or a place: a title or a kin word
     before it ("Miss Earline", "his cousin Bo"), a place or person word
     before it ("at Hux's", "in the Shack", "to Earl", "ask Bobby"), a
     possessive ("Earl's truck"), a speech or gesture verb after it ("Earl
     says", "Bo nods"), or another unknown capitalised word beside it ("Earl
     Hux"). A lone one ("a Yoo-hoo", "spits Red Seal") is soft: noted, not
     rewritten. Brand names that are also first names (Wendy, Winston,
     Harley) stay out of NAME_ALLOW, so "Wendy says" is still caught. */
  const NAME_ALLOW = new Set(('Mr Mrs Ms Miss Mister Dr Doc Chief Pastor Preacher Reverend Deacon Brother Sister Mayor Officer Sheriff Deputy Judge Coach Captain Sergeant Sarge Major Colonel General Corporal Private Senator Governor President Councilman Councilwoman Trooper ' +
    // Wave 5 (the fourth review's risk): more titles and the words said with a name ("Old Pittman", "Royce Junior", "Miz Gaddis").
    'Miz Lieutenant Lt Detective Nurse Old Junior Senior Jr Sr ' +
    "Mama Momma Mom Mommy Ma Daddy Dad Pa Pop Pops Granny Grandma Grandpa Granddad Granddaddy Nana Papa Aunt Auntie Uncle Cousin Sir Ma'am Honey Hon Sugar Darlin Darling Baby Babe Buddy Pal Boss Son Kid Sweetheart Sweetie Friend Mister " +
    'God Lord Jesus Christ Bible Scripture Heaven Amen Baptist Baptists Methodist Methodists Catholic Catholics Christian Christians Gospel Psalm Psalms Genesis Revelation Revelations School ' +
    'Pentecostal Pentecostals Lutheran Presbyterian Holy ' +
    'Christmas Easter Thanksgiving Halloween Fourth Independence Labor Memorial Veterans New Year Eve Day ' +
    'Army Navy Marines Marine Corps Air Force National Guard Coast Civil War VA ' +
    'America American Americans English Spanish Mexican Mexicans Mexico Canada Canadian Yankee Yankees Southern Northern Confederate Union Vietnam Iraq Afghanistan Korea Kuwait Germany German France French ' +
    // Wave 4: countries a label or a story names ("Made in China").
    'China Chinese Japan Japanese Taiwan Russia Russian England Ireland Irish Scotland Scottish Italy Italian Cuba Cuban Jamaica Philippines India Africa African Europe Asia Australia Brazil Honduras Guatemala ' +
    'Ford Chevy Chevrolet Dodge Toyota Honda Jeep Buick Coke Coca-Cola Pepsi Budweiser Coors Marlboro Walmart Styrofoam Velcro Facebook Google Internet Polaroid Folgers ' +
    // Wave 2: brands and regional words a narrator reaches for (review item 7).
    'Skoal Copenhagen Grizzly Bic Zippo Sprite Fanta Gatorade Doritos Fritos Cheetos Twinkie Twinkies Snickers Skittles Hershey Spam Velveeta Jell-O Kool-Aid Pop-Tarts ' +
    'Kleenex Tylenol Advil Bayer Narcan Xanax Valium Percocet Percocets Lortab Lortabs Vicodin OxyContin Oxy Benadryl Sudafed Vaseline Crisco Tupperware Clorox Lysol Pampers ' +
    'Marlboros Camels Newports Kools Busch Michelob Schlitz Pabst Smirnoff Bacardi Fireball Everclear ' +
    'Wrangler Wranglers Carhartt Carhartts Dickies Levis Stetson Realtree Remington Winchester Browning Ruger Glock Mossberg Zebco Shimano Rapala Yeti Igloo ' +
    'Evinrude Mercury Yamaha Suzuki Kawasaki Polaris Stihl Husqvarna Craftsman DeWalt Makita Kubota Silverado Tahoe Cadillac Pontiac Oldsmobile Mustang Camaro Corvette Bronco Peterbilt Kenworth Freightliner Harley-Davidson ' +
    'Hardee McDonald Lowe Dillard Applebee Sonic Popeyes Krystal Kroger Walgreens Wal-Mart Winn-Dixie Amazon Netflix YouTube Android Samsung Motorola Verizon Greyhound Amtrak FedEx Visa Mastercard Powerball Lotto Bingo Yahtzee Monopoly Timex ' +
    'Delta Ozarks Ozark Appalachia Dixie Cajun Cajuns Creole Mason Vienna Saints Titans Falcons Braves Cardinals Razorbacks Volunteers Vols Gators Bulldogs Rebels Longhorns Aggies Daytona Talladega Superdome Opry Graceland ' +
    'Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada Ohio Oklahoma Oregon Pennsylvania Tennessee Texas Utah Vermont Virginia Washington Wisconsin Wyoming Carolina Dakota Jersey Hampshire York Rhode Island ' +
    'Memphis Nashville Atlanta Orleans Birmingham Houston Dallas Chicago Detroit Tulsa Biloxi Knoxville Chattanooga Louisville Little Rock Shreveport Baton Rouge Gulf ' +
    'Room Highway Route Interstate County State').split(/\s+/));
  // Brands and regional names of more than one word: known as a whole, never word by word.
  const BRAND_PHRASES = ['Mountain Dew', 'Dr Pepper', 'John Deere', 'Ole Miss', 'Piggly Wiggly', 'Dollar General', 'Family Dollar', 'Dollar Tree', 'Waffle House',
    'Cracker Barrel', 'Maxwell House', "Jack Daniel's", 'Jack Daniels', 'Jim Beam', 'Wild Turkey', 'Old Crow', 'Evan Williams', 'Southern Comfort', 'Busch Light',
    'Bud Light', 'Miller Lite', 'Miller High Life', 'Natural Light', 'Natty Light', 'Pabst Blue Ribbon', 'Red Man', 'Big Red', 'Moon Pie', 'Moon Pies', 'RC Cola',
    'Royal Crown', 'Sun Drop', 'Little Debbie', 'Western Union', 'Crimson Tide', 'Grand Ole Opry', 'Bass Pro', 'Bass Pro Shops', 'Tractor Supply', 'Red Wing',
    'Red Wings', 'Mossy Oak', 'Smith and Wesson', 'Smith & Wesson', 'Dairy Queen', 'Burger King', 'Taco Bell', 'Pizza Hut', 'Food Lion', 'Kentucky Fried Chicken',
    'Super Bowl', 'World Series', 'Monday Night Football', 'Mardi Gras', "Mother's Day", "Father's Day", "Valentine's Day", 'Holy Spirit', 'Holy Ghost',
    'Bible Belt', 'Deep South', 'Church of Christ', 'Highway Patrol', 'State Patrol', 'Social Security',
    // Wave 8: brands named like a person, now that a first name and a surname before "is" are someone.
    'Sam Adams', 'Samuel Adams', 'Johnnie Walker', 'Jose Cuervo', 'Captain Morgan', 'Earl Grey', 'Jimmy Dean', 'Betty Crocker', 'Ronald McDonald'];
  const CALENDAR = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  // Words that open a sentence before a name without being part of it ("Ask Bobby", "Tell Earl").
  const SENTENCE_STARTS = new Set('Ask Tell Try Go Get Come Let See Look Find Call Give Take Bring Send Leave Meet Thank Thanks Hey Hi Hello Well Yes Yeah No Nope Oh Maybe Sure Then Now So But And Or Just Only Even Tonight Today Tomorrow Here There This That When Where Why How What Who If Because Before After Since While Until Unless Like Said Says Asked Told'.split(' '));
  /* What marks an unknown capitalised word as a person or a place (lower
     case): a title or kin word just before it, a word that puts a place or a
     person after it ("at", "to", "ask", "named"), or a speech or gesture
     verb just after it. */
  const MARK_BEFORE = new Set(('mr mrs ms miss mister dr doc chief pastor preacher reverend deacon brother sister mayor officer sheriff deputy judge coach captain sergeant sarge ' +
    'major colonel general corporal private senator governor president councilman councilwoman trooper aunt auntie uncle cousin granny grandma grandpa nana papa miz lieutenant lt detective nurse ' +
    'saint st wife husband son daughter boy girl friend buddy boss nephew niece grandson granddaughter mama daddy named called ' +
    'at in to from into toward towards near inside outside for ask asks asked tell tells told thank meet meets met hand hands handed pay pays paid introduces hey hi hello howdy bye').split(/\s+/));
  // Wave 3: a name told about, right after the verb ("She says Darnell owes her money", "Royce mentions Darnell"); not two back ("says the Feds" is not a place).
  const MARK_TOLD = new Set('say says said mention mentions mentioned'.split(' '));
  const MARK_AFTER = new Set(('says said asks asked tells told answers answered replies replied shouts shouted yells yelled calls whispers whispered mutters muttered ' +
    'nods nodded shrugs shrugged laughs laughed grins grinned smiles smiled sighs sighed winks winked frowns frowned snorts snorted adds added agrees agreed waves waved').split(/\s+/));
  // Ordinary words that open a sentence capitalised: never a name, and never the unknown word beside one ("The Shack" is one unknown word, not two).
  // Wave 4: and the adverbs and interjections a narrator opens with ("Slowly Royce nods", "Okay Bell says"), which are no part of a name beside them.
  const COMMON = new Set(Array.from(SENTENCE_STARTS).concat(('The A An His Her Their My Your Our Its These Those Some Every Each One Two Three Four Five Another Somebody Someone Nobody Everyone Everybody Anyone Anybody ' +
    'He She It We They You Which All Both Most Many Few Nothing Something Everything Behind Outside Inside Across Over Under Past Through Down Up Out Back Off Later Soon Still Yet Again Not Never Always ' +
    'Okay Ok Alright Fine Good Right Sorry Please Listen Finally Suddenly Slowly Quietly Quickly Meanwhile Instead Eventually Afterward Afterwards Somehow Once Twice Nearby Beside Besides Upstairs Downstairs ' +
    'Anyway Otherwise Sometimes Usually Probably Perhaps Apparently Clearly Honestly Seriously Really Actually Gently Carefully Silently Briefly Immediately Instantly Outdoors Indoors Overhead Hmm Huh Uh Um Wow Whoa ' +
    'Neither Either None Whoever Whatever Whichever Wherever Whenever ' +
    // Wave 5 (the round-4 playtest): what answers or speaks without being anyone ("Silence answers.").
    'Silence Laughter Thunder Static Music Applause Quiet Rumor Rumour Gossip').split(/\s+/)));
  /* Wave 4 (the third review): within a sentence, two unknown capitalised
     words together are a name (worth a rewrite) unless what comes before
     them makes them a thing: a word that puts a thing after it (THING_BEFORE:
     "a", "the", "his", "of", a number; or one of them two back across a
     plain word, "an old Johnny Cash song") or a verb a person does to a
     thing (THING_VERBS: "He dips Red Seal", "The radio plays Conway
     Twitty"). Whoever "says" it is a person unless it is a thing (saidByPerson). */
  const THING_BEFORE = new Set(('a an the his her their my your our its this that these those some any another every each no one two three four five six seven eight nine ten ' +
    'several few many more most such what which whose of half').split(/\s+/));
  const THING_VERBS = new Set(('dip dips dipped dipping play plays played playing drink drinks drank drinking drive drives drove driving smoke smokes smoked smoking ' +
    'chew chews chewed chewing wear wears wore wearing read reads reading sing sings sang singing hum hums hummed humming eat eats ate eating sip sips sipped sipping ' +
    'pour pours poured pouring order orders ordered ordering sell sells sold selling buy buys bought buying open opens opened opening crack cracks cracked cracking ' +
    'light lights lit lighting spit spits spat spitting watch watches watched watching whistle whistles whistled whistling blast blasts blasted blasting stock stocks stocked ' +
    'serve serves served serving mix mixes mixed fry fries fried cook cooks cooked shows showed showing').split(/\s+/));
  /* Wave 5 (the fourth review's bug 2): what "says" something without being
     anyone, a sign, a label, a note, a cap, the radio (SAYING_THINGS); the
     words between whoever speaks and the verb (SAY_FILLER: "Royce finally
     says", "Everybody here says"); and the words that end the one who
     speaks before what places them (SUBJECT_CUTS: "The woman at the
     register", "The sign that hangs over the door"). */
  const SAYING_THINGS = new Set(('sign signs card cards label labels radio radios tv television screen cap caps hat hats shirt shirts t-shirt jacket door window note notes letter letters ' +
    'flyer flyers poster posters paper papers newspaper headline headlines text texts message messages board menu plaque tag tags sticker stickers banner marquee billboard ' +
    'tattoo receipt envelope ledger map ticket mug bottle box sheet page pages book bible headstone stone marker calendar clock phone voicemail email notice placard report ' +
    'file record records form photo picture caption mailbox display logo writing graffiti chalkboard whiteboard bumper plate jersey patch stamp postcard program bulletin agenda ' +
    'scanner speaker jukebox song songs lyrics station broadcast forecast weatherman it this that').split(/\s+/));
  // The side of a thing that says something ("The front says", "The back of the card says"): a thing, or, with "of", what it is the side of (wave 6, the fifth review's bug 4).
  const SIDE_WORDS = new Set('front back side cover inside outside top bottom face spine edge corner'.split(' '));
  const SAY_FILLER = new Set('also even then just only never still finally again too here there now once always often both all quietly softly simply suddenly'.split(' '));
  const SUBJECT_CUTS = new Set('at by on in behind from near next beside under over across inside outside with of around along past to who that which whose wearing holding'.split(' '));
  // Before a name, words that make it someone ("the late Earl Hux", "a certain Earl Hux"), never a thing.
  const PERSON_ADJ = new Set('late certain notorious infamous'.split(' '));
  /* A run followed by what only a thing does at a sentence start or inside
     one ("Red Seal is cheap here", "Conway Twitty plays on the radio"): a
     brand or a song, soft. Wave 6 (the fifth review's bug 3): only wording a
     person never fits; "Earl Hux plays pool", "sells bait", "tastes the
     coffee", "costs the town money" are someone, hard. */
  const ON_AIR = '(?:the )?(?:radio|jukebox|tv|television|speaker|speakers|stereo|box)';
  const THING_AFTER = new RegExp(`^\\s+(?:(?:plays|played|is playing|was playing|comes|came|is|was|are|were) on ${ON_AIR}|(?:comes|came) on(?:\\s*[.,!;]|\\s+(?:loud|again|low|now|then|and|as|while|over))|(?:is|was|are|were) (?:cheap|expensive|on sale|sold out|out of stock|half off|playing on ${ON_AIR})|(?:costs?|cost) (?:\\$\\d|\\d|a (?:dollar|buck|quarter|nickel|dime)|(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty|a hundred)\\b)|(?:tastes?|tasted|smells?|smelled) like|fizzes|crackles|blares)(?![a-z])`, 'i');
  // A work that "by" names the maker of (wave 6, the fifth review's bug 3): "something by Patsy Cline", "a song by"; anything else by a run is a person ("stand by Earl Hux", "a letter by Earl Hux").
  const WORKS = new Set('song songs something anything record records album albums tune tunes book books painting paintings number numbers track tracks single singles hit hits ballad ballads novel novels cover covers'.split(' '));
  /* Wave 8 (the final pass): a first name and a surname the town does not
     have, before what a person is or does ("Earl Hux is cheap, Royce
     says.", "Earl Hux playing pool") or after seeing, hearing or meeting
     them ("You watch Earl Hux"), are someone: hard, whatever THING_AFTER
     or THING_VERBS say. The first name is one the tables, the pronoun
     lists or GIVEN_NAMES know (so "Red Seal is cheap here." stays a brand);
     never a place ("Lee County is"), a voice on the radio ("Patsy Cline is
     on the jukebox") or what a sign says. */
  const GIVEN_NAMES = ('Aaron Adam Al Alan Albert Alvin Andrew Andy Anthony Archie Arthur Barry Ben Benny Bert Billy Bo Bob Bobby Boyd Brad Bradley Brandon Brent Brett Brian Bruce Bryan Buddy ' +
    'Byron Calvin Carl Carlos Cecil Charles Charlie Chester Chris Chuck Clarence Clayton Cletus Cliff Clifford Clint Clyde Cody Cole Colton Corey Craig Curtis Dale Dan Daniel Danny Darnell ' +
    'Darrell Darren Darryl Daryl Dave David Dean Dennis Derek Dewey Dexter Don Donald Donnie Doug Douglas Duane Dwayne Dwight Earl Ed Eddie Edgar Edward Elmer Emmett Eric Ernest Ernie Eugene ' +
    'Floyd Frank Frankie Fred Freddie Gene George Gerald Glen Glenn Gordon Greg Gregory Hank Harold Harvey Herbert Herman Homer Howard Hoyt Hubert Ira Jake Jamal James Jamie Jared Jason ' +
    'Jeff Jeffrey Jerome Jerry Jesse Jim Jimmy Joe Joel Joey John Johnny Jon Jonathan Joseph Josh Joshua Juan Justin Keith Ken Kenneth Kenny Kevin Kirk Kyle Lamar Lance Larry Leon Leroy ' +
    'Lester Lloyd Lonnie Louis Luke Luther Marcus Marvin Matt Matthew Maurice Melvin Merle Michael Mike Mitch Morris Nathan Neal Ned Nick Norman Odell Otis Pat Patrick Paul Pete Peter Phil ' +
    'Philip Ralph Randall Randy Raymond Reggie Rex Richard Rick Ricky Rob Robert Rodney Roger Roland Ron Ronald Ronnie Roscoe Ross Roy Sam Scott Shane Shawn Sonny Stan Stanley Steve Steven ' +
    'Stuart Ted Terry Thomas Tim Timothy Todd Tom Tommy Tony Travis Trent Troy Tyler Vernon Victor Virgil Wallace Walter Wendell Wesley Willard William Willie Woody Zack ' +
    'Alice Amanda Amy Angela Angie Ann Anna Anne Annie Barbara Becky Bernice Bertha Beth Betty Beverly Bonnie Brenda Brittany Carla Carol Carolyn Carrie Cassie Catherine Cathy Charlene ' +
    'Cheryl Christy Cindy Clara Connie Darlene Debbie Deborah Denise Diane Donna Doris Dorothy Dot Edna Eileen Elaine Ellen Emily Emma Erica Ethel Eunice Evelyn Flora Frances Gail ' +
    'Geraldine Gladys Glenda Gloria Gwen Hattie Hazel Helen Ida Inez Irene Jackie Janet Janice Jeanette Jennifer Jenny Jessica Jill Joan Joann Jodie Josie Joyce Judy Julie Karen Kathy ' +
    'Kelly Kristy Laura Laverne Leah Lena Linda Lisa Lois Loretta Lori Louise Lucille Lucy Lula Mabel Mae Marcy Margaret Maria Marie Marilyn Marlene Martha Mary Maxine Melba Melissa ' +
    'Michelle Mildred Minnie Myrtle Nancy Naomi Nell Nellie Nora Norma Patty Paula Peggy Phyllis Rachel Rebecca Regina Renee Rita Roberta Rosa Ruth Sally Samantha Sandra Sara Sarah ' +
    'Shannon Sharon Sheila Shelby Shirley Stacy Stephanie Sue Susan Sylvia Tammy Tanya Teresa Terri Thelma Tina Tonya Tracy Trudy Valerie Vera Vicki Viola Wilma Yvonne Zelda').split(' ');
  let givenSet = null;
  function givenName(w) {
    if (!givenSet) givenSet = new Set(TABLES.npc.firstNames.concat(NAME_PRONOUNS.she, NAME_PRONOUNS.he, GIVEN_NAMES));
    return givenSet.has(w);
  }
  const PERSON_NEXT = new Set(('is was isn\'t wasn\'t says said sits sat sitting stands stood standing leans leaned leaning walks walked walking laughs laughed laughing ' +
    'waits waited waiting looks looked looking nods nodded playing watches watched watching stares stared staring works worked working talks talked talking ' +
    'drinks drank drinking smokes smoked smoking lives lived').split(' '));
  const SEE_BEFORE = new Set('watch watches watched watching see sees saw seeing meet meets met meeting greet greets greeted greeting hear hears heard hearing spot spots spotted notice notices noticed'.split(' '));
  const PLACE_TAIL = new Set(('county counties street st road rd avenue ave lane drive river creek lake bayou church chapel store shop hall school bridge park highway hwy bank court house ' +
    'hospital station farm farms mill landing ferry motel hotel inn bar grill cafe diner market center college university city town parish').split(' '));
  const ON_AIR_NEXT = new RegExp(`^\\s+(?:(?:is|was|are|were|comes|came|plays|played|sings|sang|playing|singing|is playing|was playing|is singing|was singing)\\s+)?(?:on|from|over|through) ${ON_AIR}(?![a-z])`, 'i');
  /* What a known name was, once it is blanked out of the text (wave 4): a
     person's first name, a surname (or "the Gentrys"), a whole name or
     another part of one, or anything else (a place, a faction, a brand). The
     blank is never a space, so the words on either side of a known name are
     not side by side ("Slowly Royce nods": "Slowly" is not before "nods"). */
  const BLANK = { first: '\u0001', last: '\u0002', other: '\u0003', person: '\u0004' };
  function nameKinds(s) {
    const kinds = new Map();
    const set = (k, v) => { if (k && !kinds.has(k)) kinds.set(k, v); };
    const people = [];
    if (s) {
      for (const n of s.npcs || []) people.push(n.name);
      if (s.player && s.player.name) people.push(s.player.name);
      const t = State.town;
      if (t && Array.isArray(t.offstage)) for (const o of t.offstage) if (o && o.name) people.push(o.name);
    }
    const parts = people.map(x => String(x || '').trim().split(/\s+/).map(w => w.replace(/'s$/, '')).filter(Boolean)).filter(p => p.length);
    // A first name that is someone else's surname too stays a first name.
    for (const p of parts) set(p[0], 'first');
    for (const p of parts) if (p.length > 1) { set(p[p.length - 1], 'last'); set(p[p.length - 1] + 's', 'last'); }
    for (const p of parts) { set(p.join(' '), 'person'); p.slice(1, -1).forEach(w => set(w, 'person')); }
    return kinds;
  }
  /* Whoever "says" or "mentions" something (the text before the verb) is a
     person, unless the one speaking is a thing (wave 5, the fourth review's
     bug 2): the head word of the clause before the verb, past the words
     between ("Royce finally says", "Everybody here says") and before what
     places it ("The woman at the register says", "An old man by the door
     says"), is a sign, a label, a note, a cap or the radio (SAYING_THINGS:
     "The sign on the door says Closed"). A line of dialogue ('"Fine," says
     Darnell') and a person's name are a person. */
  function saidByPerson(before) {
    let t = String(before || '').replace(/\s+$/, '');
    // A clause set off by commas is left out ("The bartender, wiping a glass, says").
    t = t.replace(/,[^,]*,$/, '').replace(/\s+$/, '');
    if (!t || /["“”,]$/.test(t)) return true;
    const clause = t.split(/[.!?;:"“”()]|\s(?:and|but|while|as|when|so|because|though)\s/i).pop();
    const words = clause.match(/[A-Za-z][A-Za-z'-]*|[\u0001-\u0004]+/g) || [];
    while (words.length > 1 && (SAY_FILLER.has(words[words.length - 1].toLowerCase()) || /^[a-z]+ly$/.test(words[words.length - 1]))) words.pop();
    const cut = words.findIndex((w, i) => i > 0 && SUBJECT_CUTS.has(w.toLowerCase()));
    let head = (cut > 0 ? words.slice(0, cut) : words).pop();
    // "The back of the card": the card; "The front": a thing.
    if (head && SIDE_WORDS.has(head.toLowerCase()) && cut > 0 && words[cut].toLowerCase() === 'of') {
      const rest = words.slice(cut + 1);
      const cut2 = rest.findIndex((w, i) => i > 0 && SUBJECT_CUTS.has(w.toLowerCase()));
      const of = (cut2 > 0 ? rest.slice(0, cut2) : rest).pop();
      if (of) head = of;
    } else if (head && SIDE_WORDS.has(head.toLowerCase())) return false;
    if (!head) return true;
    if (/^[\u0001\u0002\u0004]/.test(head)) return true;
    if (/^\u0003/.test(head)) return false;
    const w = head.replace(/('s|s'|')$/, '').toLowerCase();
    return !SAYING_THINGS.has(w);
  }
  /* Every name the game has, as written (longest first). opts.names adds more. */
  function nameList(s, extra) {
    const out = new Set();
    const add = x => {
      if (typeof x !== 'string') return;
      const t = x.trim().replace(/^the /, '');
      if (!t || !/[A-Z]/.test(t)) return;
      out.add(t);
      out.add(t.replace(/^The /, ''));
    };
    const words = x => String(x || '').split(/\s+/).forEach(w => add(w.replace(/'s$/, '')));
    BRAND_PHRASES.forEach(add);
    if (s) {
      const town = s.meta && s.meta.townName;
      add(town);
      words(town);
      for (const n of s.npcs || []) {
        add(n.name);
        const parts = String(n.name || '').split(/\s+/).filter(Boolean);
        parts.forEach(add);
        if (parts.length > 1) add(parts[parts.length - 1] + 's');
      }
      for (const l of s.locations || []) for (const k of [l.name, l.map && l.map.label].concat(Array.isArray(l.aka) ? l.aka : [])) add(k);
      for (const f of s.factions || []) add(f.name);
      if (s.player && s.player.name) { add(s.player.name); words(s.player.name); }
      const t = State.town;
      const m = (t && t.map) || (town === TOWN_DATA.name ? TOWN_DATA.map : null);
      if (m) for (const lab of [m.riverLabel].concat(Array.isArray(m.labels) ? m.labels : [])) if (lab && typeof lab.text === 'string') { add(lab.text); words(lab.text); }
      if (t && Array.isArray(t.offstage)) for (const o of t.offstage) if (o && o.name) { add(o.name); words(o.name); }
    }
    for (const x of extra || []) { add(x); words(x); }
    return Array.from(out).sort((a, b) => b.length - a.length);
  }
  let nameCache = { key: null, res: null, lower: null };
  let packetWords = new Set();
  /* Pipeline.narratorPacket hands its text here, so the check that follows
     knows what the packet named (Style.check also takes opts.packet). */
  function notePacket(text) { packetWords = capitalised(text); }
  function capitalised(text) { return new Set(String(text || '').match(/\b[A-Z][a-z][A-Za-z'-]*/g) || []); }
  /* { res: name RegExps, lower: name words in lower case, single: words
     allowed on their own } for the running game, or null with no game. */
  function known(o) {
    o = o || {};
    const s = o.state !== undefined ? o.state : State.current;
    if (!s && !Array.isArray(o.names)) return null;
    const list = nameList(s, o.names);
    const key = list.join('|');
    if (nameCache.key !== key) {
      const kinds = nameKinds(s);
      nameCache = {
        key,
        res: list.map(n => ({ re: new RegExp(`(^|[^A-Za-z])${escRe(n)}(?=('s|s'|')?(?![A-Za-z]))`, 'g'), ch: BLANK[kinds.get(n) || 'other'] })),
        lower: new Set(list.flatMap(n => n.toLowerCase().split(/[^a-z]+/)).filter(w => w.length >= 2).concat(CALENDAR.map(d => d.toLowerCase())))
      };
    }
    const single = new Set(NAME_ALLOW);
    for (const d of CALENDAR) { single.add(d); single.add(d + 's'); }
    for (const w of (typeof o.packet === 'string' ? capitalised(o.packet) : packetWords)) single.add(w.replace(/('s|s'|')$/, ''));
    for (const w of Array.isArray(o.allow) ? o.allow : []) single.add(w);
    return { res: nameCache.res, lower: nameCache.lower, single };
  }
  /* Every capitalised word the game does not know, once each, with marked:
     true when something marks it as a person or a place (see NAME_ALLOW's
     note), false when it stands alone. Unknown words side by side are one
     name ("Earl Hux", "Red Seal"): what marks one marks them all. Wave 3
     (the owner's rule and the review's bug 4): at a sentence start a name
     is marked by a speech or gesture verb after it ("Darnell says the
     bridge is out", "Bobby waves you over") as well as by being two words
     or more ("Earl Hux leans on the counter"); within a sentence two words
     or more are not a mark of their own ("He dips Red Seal", "The radio
     plays Conway Twitty": soft), only the marks above are (a title, a
     place word, "says", a possessive, a speech verb).
     Wave 4 (the third review): a known name is blanked with a mark of what
     it was (BLANK), so an adverb before a known name and a verb is no name
     ("Slowly Royce nods", "Finally Loretta Gaddis says nothing"); an
     unknown word beside a person's surname or after their first name is
     part of a name ("Bobby Gaddis nods", "You see Loretta Smith"). Within a
     sentence two words or more are a name unless what comes before makes
     them a thing (THING_BEFORE, THING_VERBS) or they follow another run in
     a list ("plays Conway Twitty and Merle Haggard"); a title, a place word,
     "with", a person's "says", a possessive or a speech verb always marks
     them ("You notice Earl Hux at the bar", "The only other customer is
     Bobby Lee Tate"). "says" marks the word after it only when a person
     says it ("She says Darnell owes her money", not "The sign on the door
     says Closed" or "The card says Happy Birthday": soft). */
  function nameHits(text, k) {
    if (!k) return [];
    // "Mr. Hux" and "Dr. Pepper" read as "Mr Hux" and "Dr Pepper".
    let s = String(text || '').replace(/[‘’]/g, "'").replace(/[\u0001-\u0004]/g, ' ');
    // "Front St." is Front Street (wave 5, the fourth review's risk), "Willow Rd." Willow Road; the period stays when a sentence ends there.
    s = s.replace(/\b([A-Z][a-z]+) (St|Ave|Rd|Blvd)\./g, (m, w, ab, at, all) => `${w} ${{ St: 'Street', Ave: 'Avenue', Rd: 'Road', Blvd: 'Boulevard' }[ab]}${/^(\s+["“]?[A-Z]|\s*$)/.test(all.slice(at + m.length)) ? '.' : ''}`);
    s = s.replace(/\b(Mr|Mrs|Ms|Dr|St)\.(?=\s)/g, '$1');
    for (const { re, ch } of k.res) s = s.replace(re, (m, pre) => pre + ch.repeat(m.length - pre.length));
    const words = [...s.matchAll(/[A-Za-z][A-Za-z'-]*/g)];
    const strip = w => w.replace(/('s|s'|')$/, '');
    const unknown = w => /^[A-Z][a-z]/.test(w) && !k.single.has(w) && !COMMON.has(w);
    // The text between two words: only spaces means they belong together.
    const gap = (a, b) => s.slice(a.index + a[0].length, b.index);
    const hits = new Map();
    let last = null; // the run before this one ({ end, marked }), for a list of names
    for (let i = 0; i < words.length; i++) {
      if (!unknown(strip(words[i][0]))) continue;
      // The run of unknown capitalised words that starts here ("Earl Hux"), side by side with only spaces between.
      let j = i;
      while (j + 1 < words.length && /^\s+$/.test(gap(words[j], words[j + 1])) && unknown(strip(words[j + 1][0])) && !/('s|s')$/.test(words[j][0])) j++;
      const run = words.slice(i, j + 1);
      let start = words[i].index;
      let end = words[j].index + words[j][0].length;
      // Part of a name with a person's first name before it or their surname after it.
      const first = /\u0001+\s+$/.exec(s.slice(0, start));
      const sur = !/('s|s')$/.test(words[j][0]) && /^\s+\u0002+/.exec(s.slice(end));
      if (first) start = first.index;
      if (sur) end += sur[0].length;
      const two = run.length >= 2 || !!first || !!sur;
      const head = s.slice(0, start);
      const lead = head.replace(/["'“”(\s]+$/, '');
      // An opening quote starts a sentence too ('she says, "Now, listen"'); a closing one does not ('"Fine," Earl says').
      const opening = /(^|[\s(\[—–-])["“]\s*$/.test(head);
      const starts = opening || lead === '' || /[.!?:;…—–]$/.test(lead) || /\s-$/.test(lead);
      const nx = /^\s+([A-Za-z][A-Za-z'-]*)/.exec(s.slice(end));
      const speaks = !!(nx && MARK_AFTER.has(nx[1].toLowerCase()));
      // What a thing does after it (wave 5, the round-4 playtest): "Red Seal is cheap here", "Conway Twitty plays on the radio".
      const thingNext = !speaks && THING_AFTER.test(s.slice(end));
      const owns = run.some(w => /('s|s')$/.test(w[0])) || (!!sur && /^('s|s')(?![A-Za-z])/.test(s.slice(end)));
      // A first name and a surname (wave 8): a known person's first name before it, or a first name GIVEN_NAMES knows, and no place word last ("Lee County").
      const tail = strip(run[run.length - 1][0]).toLowerCase();
      const fullName = two && run.length <= 3 && (!!first || givenName(strip(run[0][0]))) && !PLACE_TAIL.has(tail) && !owns && !ON_AIR_NEXT.test(s.slice(end));
      const doing = fullName && !!nx && PERSON_NEXT.has(nx[1].toLowerCase());
      let marked;
      if (starts) {
        // A sentence start is an ordinary word, unless a speech or gesture verb follows the name or it is two words or more (SENTENCE_STARTS such as "Ask" are COMMON: never in a run).
        if (!two && !speaks) { i = j; last = null; continue; }
        marked = !thingNext || doing;
      } else {
        // The word just before (only spaces or a comma between; none when a known name is), and the word before that.
        const pm = /([A-Za-z][A-Za-z'-]*)([\s,]*)$/.exec(head);
        const prev = pm ? strip(pm[1]).toLowerCase() : null;
        const pm2 = pm ? /([A-Za-z][A-Za-z'-]*)\s+$/.exec(head.slice(0, pm.index)) : null;
        const prev2 = pm2 ? strip(pm2[1]).toLowerCase() : null;
        // "at the Shack", "to the Delta": a place word two back, with "the" between.
        const titled = !!prev && (MARK_BEFORE.has(prev) || (prev === 'the' && !!prev2 && MARK_BEFORE.has(prev2)));
        // "says Darnell", and "says that Darnell" (wave 5).
        const told = prev && MARK_TOLD.has(prev) ? saidByPerson(head.slice(0, pm.index))
          : prev === 'that' && prev2 && MARK_TOLD.has(prev2) && /^\s+$/.test(pm[2]) ? saidByPerson(head.slice(0, pm2.index)) : null;
        if (two) {
          const plain = pm && /^\s+$/.test(pm[2]);
          // "by" a maker, not a doer: "something by Patsy Cline", not "beaten by Earl Hux" (wave 5).
          const byMaker = prev === 'by' && !!prev2 && WORKS.has(prev2);
          const thing = told === false || thingNext || byMaker || (!!prev && (THING_BEFORE.has(prev) || THING_VERBS.has(prev) || /^\d/.test(prev)))
            || (plain && !!prev2 && THING_BEFORE.has(prev2) && !Town.isPersonWord(prev) && !MARK_TOLD.has(prev) && !PERSON_ADJ.has(prev));
          const listed = !!last && last.end <= start && /^\s*(?:,\s*)?(?:(?:and|or|nor|&)\s+)?$/.test(s.slice(last.end, start));
          // Someone seen, met or heard, or someone being or doing what a person does (wave 8), unless a sign or the radio says the name.
          const someone = told !== false && (doing || (fullName && !!prev && SEE_BEFORE.has(prev)));
          marked = titled || told === true || owns || speaks || prev === 'with' || someone || (listed ? last.marked : !thing);
        } else marked = titled || told === true || owns || speaks;
      }
      for (const w of run) { const x = strip(w[0]); hits.set(x, hits.get(x) || marked); }
      last = { end, marked };
      i = j;
    }
    return Array.from(hits, ([word, m]) => ({ word, marked: m }));
  }
  function unknownNames(text, k) { return nameHits(text, k).map(h => h.word); }

  // ----- spoken phrases said again -----
  /* Spoken lines only, as 4-word phrases. A phrase counts only with two
     words in it that are neither filler nor part of a name (a person, a
     place, its other names, the calendar), and never with a number in it:
     naming the Riverview Motor Court again, or "four hundred by Friday", is
     not a verbal habit. Used to catch a person's catchphrase turning up again. */
  const FILLER = new Set(("i you he she it we they the a an to of in on and but or not is was are am do don't didn't what that this my your his her me him them up out for with at be have has had so if as no yes now then there here just like know say said says one all can can't get got go going come see well right ok okay oh hey man son sir ma'am hon you're i'm it's that's there's he's she's we're they're").split(' '));
  const NUMBER_WORDS = new Set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million dozen half dollar dollars buck bucks cent cents'.split(' '));
  function spokenPhrases(t, nameWords) {
    const names = nameWords instanceof Set ? nameWords : new Set();
    const out = new Set();
    const quotes = String(t || '').replace(/[‘’]/g, "'").match(/"[^"]*"|“[^”]*”/g) || [];
    for (const q of quotes) {
      const words = q.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
      for (let i = 0; i + 4 <= words.length; i++) {
        const gram = words.slice(i, i + 4);
        if (gram.some(w => /\d/.test(w) || NUMBER_WORDS.has(w))) continue;
        if (gram.filter(w => !FILLER.has(w) && !names.has(w.replace(/'s?$/, ''))).length >= 2) out.add(gram.join(' '));
      }
    }
    return out;
  }
  /* A quoted line that addresses the player ("you") and claims a past with
     them: having met or known them, having seen or called them last night or
     yesterday, them having been around a while. On day 1 there is no such
     past. Bare time words are not a claim ("the fight at the landing last
     night", "the paper said yesterday"). Returns the phrase, or null. */
  const PAST_RE = /\b(known you|knew you|we've met|we have met|met you before|seen you before|(?:saw|seen|met|called|phoned|watched|heard from) you (?:last night|yesterday|the other day|the other night|last week|last month)|you were (?:here|in here|around) (?:last night|yesterday|the other day|the other night|last week)|you've been (?:here|around|in town)|you been (?:here|around|in town)|been (?:here|around) a while|known a while|for a while now|a while now|go way back|since you (?:came|got|showed up|turned up|rolled in)|the last time you|every time you)\b/i;
  function inventedPast(text) {
    const quotes = String(text || '').replace(/[‘’]/g, "'").match(/"[^"]*"|“[^”]*”/g) || [];
    for (const q of quotes) {
      if (!/\b(you|your|you're|you've|you'd|you'll)\b/i.test(q)) continue;
      const m = PAST_RE.exec(q);
      if (m) return m[1].toLowerCase();
    }
    return null;
  }
  function repeatedPhrase(text, previous, nameWords) {
    const seen = new Set();
    for (const p of previous || []) for (const g of spokenPhrases(p, nameWords)) seen.add(g);
    for (const g of spokenPhrases(text, nameWords)) if (seen.has(g)) return g;
    return null;
  }
  /* opts: { zoom, style, previous, day, packet, names, allow, state }
     (style defaults to the current setting; previous: recent narrations, for
     the repeated-phrase check; day: the invented-past check runs on day 1;
     packet: the narrator packet, whose capitalised words may be used, else
     the last one Pipeline built; names: false to skip the name check, or
     more names to allow). Returns { ok, hard, problems, words, style }: ok
     when there is no problem at all, hard when one is worth a rewrite. */
  /* A person in the scene cannot see the player's money. A quoted line that
     says what the player has or has left ("You've got five bucks left to your
     name") with the player's real total, before or after what their input
     hands over, is a hard problem; the player saying their own figure makes
     it public, and a price ("That's five bucks") is nobody's wallet. */
  const NUMWORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const NUMWORD = `(?:a|an|and|hundred|${Object.keys(NUMWORDS).join('|')})`;
  const MONEY_WORDS = new RegExp(`\\b(${NUMWORD}(?:[\\s-]+${NUMWORD})*)\\s+(?:bucks?|dollars?)\\b`, 'gi');
  const MONEY_DIGITS = /\$\s*(\d[\d,]*)(?:\.\d+)?|\b(\d[\d,]*)\s*(?:\$|bucks?|dollars?)\b/g;
  const OWN_MONEY = /\b(?:you(?:'ve| have)?(?: only| just| still)? (?:got|have)|you're (?:down to|left with)|left to your name|to your name|all you(?:'ve| have)? got|all you have|on you\b|in your (?:pocket|pockets|wallet|purse)|your last)\b/i;
  function numberWords(str) {
    let total = 0, any = false;
    for (const w of str.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean)) {
      if (w === 'and') continue;
      if (w === 'a' || w === 'an') { if (!any) total = 1; continue; }
      if (w === 'hundred') { total = (total || 1) * 100; any = true; continue; }
      if (NUMWORDS[w] === undefined) return null;
      total += NUMWORDS[w]; any = true;
    }
    return any ? total : null;
  }
  /* "Bet" as a way of speaking (wave 12, L7): "I bet he is lying", "I bet
     you ten bucks it rains tomorrow", "I bet you are tired" is talk, not a
     bet at the card table. betTalk(text) is null when nothing in it bets
     or wagers; 'clause' when the bet is followed by a clause (talk);
     'bet' when it is a bet at cards: the cards, a hand, the game or the
     pot named, or a bare stake ("I bet $20", "I'll bet you fifty.", "I bet
     a fiver", "I bet everything", "I bet half my money"); 'bare' for "I
     bet." alone; 'other' for a bet on something that is not the cards ("I
     bet my watch", "I bet $20 on it"). */
  const BET_VERB = /\b(?:bet|bets|betting|wager|wagers|wagering)\b/i;
  const CARD_TALK = /\b(?:cards?|hands?|game|games|pot|poker|deal|deals|dealt|dealer|table|ante|antes|chips?|showdown|draw|blinds?|hold[\s'-]*'?em|holdem|texas|flop|river)\b/i;
  const BET_STAKE = `(?:-?\\$\\s?-?\\d[\\d,]*(?:\\.\\d+)?|-?\\d[\\d,]*(?:\\.\\d+)?|${NUMWORD}(?:[\\s-]+${NUMWORD})*)(?:\\s*(?:dollars?|bucks?|grand))?|(?:${NUMWORD}\\s+)?(?:fivers?|tenners?)`;
  const BET_SUBJECT = `(?:he|she|they|it|we|i|you|there|this|someone|somebody|nobody|no one|everyone|everybody|he's|she's|they're|it's|it'll|there's|that's|you're|i'm|we're|they'll|he'll|she'll|you'll|i'll|we'll|he'd|she'd|they'd|you'd|the\\s+(?!whole\\b|entire\\b|lot\\b|rest\\b|pot\\b)[a-z]+)`;
  const BET_CLAUSE = new RegExp(`\\b(?:bet|bets|betting|wager|wagers)\\s+(?:(?:you|him|her|them|ya)\\s+)?(?:(?:${BET_STAKE})\\s+)?(?:that\\b|${BET_SUBJECT}\\s+(?!all\\b)(?!${NUMWORD}\\b)[a-z']+)`, 'i');
  // "I bet Curtis is bluffing": a name and a verb (the name is capitalised, so this one is case-sensitive).
  const BET_NAME_CLAUSE = /\b(?:bet|bets|wager|wagers)\s+(?:(?:you|him|her|them)\s+)?(?:\S+\s+){0,2}?[A-Z][a-z]+\s+(?:is|was|will|would|can|could|has|had|did|does|knows|thinks|wants|isn't|wasn't|won't|can't|doesn't|didn't|never|always|just|already|still)\b/;
  const BET_BARE = new RegExp(`\\b(?:bet|bets|betting|wager|wagers)\\s+(?:(?:you|him|her|them)\\s+)?(?:${BET_STAKE}|everything(?:\\s+i\\s+(?:have|got))?|it\\s+all|all\\s+i\\s+(?:have|got)|all\\s+(?:of\\s+)?my\\s+(?:money|cash)|the\\s+(?:whole|entire)\\s+(?:roll|stack|bankroll|wad|pile)|half\\s+(?:of\\s+)?(?:my\\s+(?:money|cash)|what\\s+i\\s+(?:have|got)|everything))\\s*[.!?]*\\s*$`, 'i');
  function betTalk(text) {
    const t = String(text || '').replace(/[’]/g, "'").replace(/[−–]/g, '-');
    if (!BET_VERB.test(t)) return null;
    if (BET_CLAUSE.test(t) || BET_NAME_CLAUSE.test(t)) return 'clause';
    if (CARD_TALK.test(t) || BET_BARE.test(t)) return 'bet';
    if (/\b(?:bet|bets|wager|wagers)\s*[.!?]*\s*$/i.test(t)) return 'bare';
    return 'other';
  }
  function moneyAmounts(str) {
    const out = [];
    const t = String(str || '');
    MONEY_DIGITS.lastIndex = 0;
    for (let m = MONEY_DIGITS.exec(t); m; m = MONEY_DIGITS.exec(t)) out.push(parseInt((m[1] || m[2]).replace(/,/g, ''), 10));
    MONEY_WORDS.lastIndex = 0;
    for (let m = MONEY_WORDS.exec(t); m; m = MONEY_WORDS.exec(t)) { const n = numberWords(m[1]); if (n !== null) out.push(n); }
    return out.filter(n => Number.isFinite(n));
  }
  function moneyLeak(t, o) {
    if (!Number.isInteger(o.gold)) return null;
    const said = moneyAmounts(o.input);
    const bare = String(o.input || '').match(/\b\d{1,5}\b/g) || [];
    const handed = said.concat(bare.map(n => parseInt(n, 10)));
    const totals = new Set([o.gold]);
    for (const n of handed) { if (o.gold - n > 0) totals.add(o.gold - n); totals.add(o.gold + n); }
    for (const n of said) totals.delete(n);
    totals.delete(0);
    const spoken = [];
    for (const m of t.matchAll(/"([^"]*)"|“([^”]*)”?/g)) spoken.push(m[1] || m[2] || '');
    for (const q of spoken) {
      if (!OWN_MONEY.test(q)) continue;
      const hit = moneyAmounts(q).find(n => totals.has(n));
      if (hit !== undefined) return { amount: hit, phrase: q.trim().slice(0, 80) };
    }
    return null;
  }
  function check(text, opts) {
    const o = opts || {};
    const zoom = !!o.zoom;
    const style = pick(o.style !== undefined ? o.style : current());
    const t = String(text || '').replace(/[‘’]/g, "'");
    const outside = unquoted(t);
    const lowerOut = outside.toLowerCase();
    const problems = [];
    for (const b of BANNED) if (lowerOut.includes(b)) problems.push({ type: 'banned', detail: b, hard: false });
    const words = wordCount(t);
    const limit = zoom ? WORD_LIMITS.zoom : WORD_LIMITS.normal;
    if (words > limit) problems.push({ type: 'length', detail: `${words} words, limit ${limit}`, words, limit, hard: words > limit + HARD_OVER });
    if (/what do you do/i.test(outside)) problems.push({ type: 'question', detail: 'contains "What do you do"', hard: true });
    if (/^\s*["“]?as you\b/i.test(t)) problems.push({ type: 'opening', detail: 'starts with "As you"', hard: false });
    if (style === 'casual') {
      const m = simileIn(outside);
      if (m) problems.push({ type: 'simile', detail: `a simile ("${m}")`, hard: false });
    }
    const k = o.names === false ? null : known(Object.assign({}, o, { names: Array.isArray(o.names) ? o.names : undefined }));
    const again = Array.isArray(o.previous) && o.previous.length ? repeatedPhrase(t, o.previous, k ? k.lower : null) : null;
    if (again) problems.push({ type: 'repeat', detail: `repeats the spoken phrase "${again}" from an earlier turn`, phrase: again, hard: false });
    // Day 1: nobody here had a past with the player, so a spoken line to them about having met or known them invents one.
    if (o.day === 1) {
      const past = inventedPast(t);
      if (past) problems.push({ type: 'past', detail: `on day 1, someone speaks to the player of a past that never happened ("${past}")`, phrase: past, hard: true });
    }
    // The owner's first rule, in code: nobody and nowhere the town does not have.
    // Marked as a person or a place: hard. A lone capitalised word (a brand nobody listed): soft, noted and kept.
    const hits = nameHits(t, k);
    const odd = hits.filter(h => h.marked).map(h => h.word);
    const lone = hits.filter(h => !h.marked).map(h => h.word);
    if (odd.length) problems.push({ type: 'name', detail: `names someone or somewhere that does not exist: ${odd.join(', ')}`, names: odd, hard: true });
    if (lone.length) problems.push({ type: 'name', detail: `capitalises a word the town does not have (fine for a brand or a thing, not for a person or a place): ${lone.join(', ')}`, names: lone, hard: false });
    // Nobody can see into the player's pocket: a spoken line that knows their total is a leak.
    const leak = moneyLeak(t, o);
    if (leak) problems.push({ type: 'money', detail: `someone says how much money the player has ("${leak.phrase}"), which nobody in the scene can know`, phrase: leak.phrase, amount: leak.amount, hard: true });
    return { ok: problems.length === 0, hard: problems.some(p => p.hard), problems, words, style };
  }
  /* Names the problems and asks for a rewrite. The hard ones lead (they are
     why the rewrite happens); soft ones ride along as "if you can". A length
     problem names the word count and the limit. opts.draft: the attempt
     being fixed, sent back so the rewrite is an edit. */
  const NAME_FIX = 'Everyone who exists is in CAST and every place in THE TOWN or the packet: use those names, and never give a name to anyone or anywhere else.';
  function describe(p) { return p.type === 'banned' ? `banned phrase "${p.detail}"` : p.detail; }
  function regenerationNote(problems, opts) {
    const list = Array.isArray(problems) ? problems : [];
    const hard = list.filter(p => p.hard);
    const main = hard.length ? hard : list;
    const rest = hard.length ? list.filter(p => !p.hard) : [];
    const what = main.map(describe).join('; ');
    const long = main.find(p => p.type === 'length');
    const others = main.some(p => p.type !== 'length');
    const has = t => main.some(p => p.type === t);
    const plain = (has('money') ? " Nobody can see the player's money: people know only what the player hands over, shows or says, so no one names the total the player has or has left." : '') + (has('past') ? ' It is day 1: the player came to town today, nobody here knew them or heard of them before, and nothing about them happened last night or earlier. People know only what they have seen since the player arrived and what their remembers list says.' : '') + (has('simile') ? ' Say it plainly, with no comparisons.' : '') + (has('repeat') ? ' Give that person different words this time: no catchphrase, no story they already told, a plain answer is fine.' : '') + (has('name') ? ` ${NAME_FIX}` : '');
    const fix = long
      ? `Write it again${others ? ' without that,' : ''} in ${lengthRule(long.limit > WORD_LIMITS.normal)}: keep the action and its outcome, and cut scenery and bystanders first.${plain}`
      : `Write it again without that.${plain}`;
    let note = `STYLE CHECK FAILED on your last attempt: ${what}. ${fix}`;
    if (rest.length) note += ` If you can, also fix: ${rest.map(describe).join('; ')}.`;
    const draft = opts && typeof opts.draft === 'string' ? opts.draft.trim() : '';
    if (draft) note += `\nYOUR LAST ATTEMPT (edit it rather than starting over; change only what the problems above need):\n${draft}`;
    return note;
  }
  /* The narrator packet's last line (Pipeline.narratorPacket) and the
     rewrite note share these numbers with check(). */
  function lengthRule(zoom) { return zoom ? `up to 6 sentences, under ${WORD_LIMITS.zoom} words` : `2 to 4 sentences, under ${WORD_LIMITS.normal} words`; }
  function lengthLine(zoom) { return `LENGTH: ${lengthRule(zoom)}. Stop at the first moment the player must respond.${zoom ? '' : ' Not everyone and everything listed needs a mention.'}\nVARIETY: do not repeat a phrase, opener, joke or verbal habit used in LAST 3 TURNS; a person's habit shows at most once in a scene, and they can answer plainly.`; }
  return { BANNED, WORD_LIMITS, HARD_OVER, EXAMPLES_INTRO, KNOWLEDGE, FADE_TO_BLACK, PEOPLE_NOTE, GOOD_TURN, NAME_ALLOW, STYLES: NAMES, DEFAULT, systemPrompt, current, check, regenerationNote, lengthLine, spokenPhrases, repeatedPhrase, inventedPast, unknownNames: (text, opts) => unknownNames(text, known(opts)), nameHits: (text, opts) => nameHits(text, known(opts)), BRAND_PHRASES, notePacket,
    // Wave 11 (the card table's stakes in words): "fifty", "a hundred", "two hundred and fifty" as a number, or null.
    numberWords, NUMBER_WORD: NUMWORD,
    // Wave 12 (L7): "I bet he is lying" is a way of speaking, not a bet at cards.
    betTalk };
})();

