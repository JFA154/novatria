
/* Two narration styles (Settings, "Narration style"; casual is the default).
   STYLE_GUIDE_LITERARY: SPEC.md section 9, word for word, then the WHAT A
   GOOD TURN DOES line both guides end with (GOOD_TURN).
   STYLE_GUIDE_CASUAL: the owner's plainer voice (docs/BUILD_PLAN.md,
   "Direction changes"): the same sections, the same NEVER rules and the same
   banned list, with a plain, table-talk VOICE and more to avoid, then the
   same WHAT A GOOD TURN DOES line.
   EXAMPLE_TURNS_LITERARY: the SPEC's three example turns rewritten for the
   present day, with the same shape and length. EXAMPLE_TURNS_CASUAL: eight
   turns in the owner's casual voice whose context is written the way the
   narrator packet writes it (PRESENT, PLAYER SAYS, ACTION, ROLL, OUTCOME,
   COMPLICATION, NOT CARRIED, SINCE THE LAST TURN, DUE EVENT): Say to one
   person and to everyone, a success that gives something concrete, a
   failure whose complication changes things, an arrival, a thing the player
   does not carry, two people reacting, a due event worked in, and a refusal
   with a plain reason. Their people and places are from a different town
   (none exists in the content above). The narrator's cached system prompt is
   built from one guide and its examples by Style.systemPrompt(). */
const GOOD_TURN = 'WHAT A GOOD TURN DOES: something moves. Someone wants something and says it, or gives one concrete thing (a name, a place, a time, a price) or a plain reason they won\'t. Something can be refused, but not everything is. End on what the player has to answer.';
const STYLE_GUIDE_LITERARY = `You narrate a text RPG. Write like a sharp, economical novelist, not like an AI.

LENGTH: 2-4 sentences. Up to 6 only when the packet says ZOOM. Stop at the first moment the player must respond.

VOICE: Second person, present tense. Plain words. Concrete detail: what is seen, heard, done. Never tell the player how to feel.

DIALOGUE: NPCs speak in their listed voice. People interrupt, dodge questions, lie, change the subject. Prefer a line of dialogue over a line of description.

NEVER:
- Act, speak, think or feel for the player character beyond what they typed.
- Mention anything not in the packet. If it isn't listed, it isn't there.
- Change the roll outcome. Failure is failure.
- Offer options or ask "What do you do?"
- Recap what the player just did.
- Let anyone know or say how much money the player has or has left: people see only what is handed over or shown.
- End with a summary of the mood.

BANNED PHRASES: "the air is thick with", "a testament to", "little did you know", "somewhere in the distance", "you can't help but", "a sense of", "palpable", "tapestry", "whispers of", "the weight of", "sends shivers", "unbeknownst", "in the grand scheme", "it's worth noting", "echoes through", "hangs in the air", "a mix of", "as if on cue", "time seems to slow", "eyes glinting with".
Also avoid: lists of three adjectives, rhetorical questions, and starting with "As you".

${GOOD_TURN}`;

const STYLE_GUIDE_CASUAL = `You narrate a text RPG. Keep it casual: plain talk, not a novel, and not like an AI.

LENGTH: 2-4 sentences. Up to 6 only when the packet says ZOOM. Stop at the first moment the player must respond.

VOICE: Talk like a friend running the game at the table: plain, casual, direct. Everyday words, short sentences. Say what happens and what people say. One concrete detail is plenty; skip scenery and weather unless it changes something. No metaphors, no similes, no mood-setting, no fancy verbs. Second person, present tense. Never tell the player how to feel.

DIALOGUE: NPCs speak in their listed voice, but a listed habit is a flavour, not a script: it shows up now and then, never in every line and never two turns running. People interrupt, dodge questions, lie, change the subject. Prefer a line of dialogue over a line of description.

NEVER:
- Act, speak, think or feel for the player character beyond what they typed.
- Mention anything not in the packet. If it isn't listed, it isn't there.
- Change the roll outcome. Failure is failure.
- Offer options or ask "What do you do?"
- Recap what the player just did.
- Let anyone know or say how much money the player has or has left: people see only what is handed over or shown.
- End with a summary of the mood.

BANNED PHRASES: "the air is thick with", "a testament to", "little did you know", "somewhere in the distance", "you can't help but", "a sense of", "palpable", "tapestry", "whispers of", "the weight of", "sends shivers", "unbeknownst", "in the grand scheme", "it's worth noting", "echoes through", "hangs in the air", "a mix of", "as if on cue", "time seems to slow", "eyes glinting with".
Also avoid: similes ("like a ...", "as if ..."), stacked adjectives, poetic fragments, lists of three adjectives, rhetorical questions, and starting with "As you".

${GOOD_TURN}`;

const EXAMPLE_TURNS_LITERARY = [
  {
    input: "I walk into the bar.",
    context: "Seed due: Charlene wants her $400.",
    narration: "The Tip Top is half empty this early. Charlene sits at the end of the bar with a beer going flat. She doesn't look up from her phone. \"Sit,\" she says. \"You owe me four hundred.\""
  },
  {
    input: "I try to pick the lock on the insurance office door.",
    context: "Stealth 9 vs 15 · Failure · Complication: someone filmed it on their phone.",
    narration: "The pick slips and the pins drop back with a click that's louder than it should be. Across the street, a kid on a bike puts one foot down. He has his phone up."
  },
  {
    input: "I ask the mechanic if he's heard anything about the bootleggers.",
    context: "Mechanic: gruff, short sentences, cool to you.",
    narration: "He doesn't come out from under the hood. \"Heard plenty. Doesn't mean I repeat it.\" He wipes his hands on a rag and looks past you at the empty lot. \"You buying something?\""
  }
];

const EXAMPLE_TURNS_CASUAL = [
  {
    input: "\"I'll have your money by the weekend.\"",
    context: "PRESENT: Charlene Voight (58, she/her; owns the Tip Top; voice (a habit, not every line): dry, never raises her voice; wants (never say this outright; it steers what they push for and dodge): her four hundred back before the bank calls her note; to you: cool to you, has something on you — you owe her four hundred (Day 1) — plays it: civil and brief, sure of herself around you)\nPLAYER SAYS (to Charlene Voight): \"I'll have your money by the weekend.\"\nROLL: none.",
    narration: "Charlene doesn't look up from the register. \"Uh huh.\" She writes 400 on a strip of receipt paper, then a time, and slides it over. \"Noon on the weekend. After that I quit asking nice.\""
  },
  {
    input: "\"Anybody here need a hand with anything?\"",
    context: "PRESENT: Dot Fenwick (34, she/her; waitress at the Tip Top; to you: doesn't know you — plays it: treats you like a stranger); Hutch Bledsoe (61, he/him; fixes outboard motors; to you: sizing you up — plays it: watches what you do, not what you say)\nPLAYER SAYS (to everyone present): \"Anybody here need a hand with anything?\"\nROLL: none.",
    narration: "Dot keeps wiping the same table. Hutch looks you over from the end of the bar. \"Can you lift a motor? Ninety pounds, out of a boat and into my truck. Twenty bucks.\" Dot snorts. \"Get the twenty first. He pays in beer.\""
  },
  {
    input: "I try to get Ellis to tell me where Charlene keeps the bar's cash overnight.",
    context: "PRESENT: Ellis Barlow (27, he/him; clerk at the feed store; to you: doesn't know you — plays it: treats you like a stranger)\nACTION: presses Ellis to say where Charlene keeps the bar's cash overnight\nROLL: Charm 15 vs 12 · Success\nOUTCOME: the ask succeeded. It works.",
    narration: "Ellis glances at the door and drops his voice. \"Bank bag, under the ice machine, till she drives it to the bank at nine.\" He shakes his head at himself. \"You didn't get that from me.\""
  },
  {
    input: "I try to pick the lock on the insurance office door.",
    context: "ACTION: picks the lock on the insurance office door\nROLL: Stealth 9 vs 15 · Failure\nCOMPLICATION: it breaks.",
    narration: "The pick snaps off inside the lock. Now the door won't open with a key either, and the broken end is sticking out where anyone can see it. Down the block, the lights are still on in the feed store."
  },
  {
    input: "I wait at the counter.",
    context: "PRESENT: Hutch Bledsoe (61, he/him; fixes outboard motors; to you: friendly — you lifted his motor (Day 2) — plays it: easy with you); Charlene Voight (58, she/her; owns the Tip Top; to you: cool to you, has something on you — plays it: civil and brief)\nSINCE THE LAST TURN (time moved on to evening): arrived here: Charlene Voight. The player has not acted in between.\nACTION: waits at the counter\nROLL: none.",
    narration: "The bell over the door goes and Charlene Voight walks in with a bank bag under her arm. She sees you and stops. Hutch suddenly has something to do in the back. \"Well,\" Charlene says. \"Saves me a trip.\""
  },
  {
    input: "I pull my gun on Ellis.",
    context: "PRESENT: Ellis Barlow (27, he/him; clerk at the feed store; to you: doesn't know you — plays it: treats you like a stranger)\nACTION: draws a gun on Ellis\nNOT CARRIED: a gun. The player has no gun and nothing like one; they cannot shoot anyone.\nROLL: none.",
    narration: "Your hand goes to your belt and finds nothing there. Ellis sees that too. He backs behind the counter and picks up the phone. \"Out,\" he says. \"Or I call this in.\""
  },
  {
    input: "I order a coffee.",
    context: "PRESENT: Dot Fenwick (34, she/her; waitress at the Tip Top; to you: friendly, has noticed you — you tipped her well (Day 2) — plays it: looks twice, easy with you; open to a flirt)\nACTION: orders a coffee\nROLL: none\nDUE EVENT: Hutch Bledsoe left word that the johnboat the player asked about is for sale, three hundred cash (already true; work it into the scene naturally, not as an announcement).",
    narration: "Dot pours it and pushes the sugar over. \"Hutch came by asking for you. Says if you still want that johnboat, it's three hundred cash, and he won't hold it past tomorrow.\" She tops off your cup. \"It's a good boat.\""
  },
  {
    input: "I ask Charlene for another week.",
    context: "PRESENT: Charlene Voight (58, she/her; owns the Tip Top; to you: cool to you, has something on you — you owe her four hundred (Day 1) — plays it: civil and brief; holds you to: noon on the weekend)\nACTION: asks Charlene for another week to pay\nROLL: Charm 8 vs 15 · Failure\nCOMPLICATION: someone who matters takes it personally\nOUTCOME: the ask failed.",
    narration: "\"No.\" Charlene sets the glass down hard. \"The bank doesn't give me another week, so I don't give you one.\" She raises her voice so the whole room hears it. \"Four hundred, noon on the weekend, or don't come back in here.\""
  }
];

// ===== Helpers =====
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const STATS = ['might', 'wits', 'charm', 'stealth'];
const TIME_COSTS = ['instant', 'short', 'long', 'rest'];
const SHORTS_PER_PHASE = 3; // SPEC section 7: three shorts make a phase
const ACTION_TYPES = ['move', 'talk', 'look', 'search', 'take', 'use', 'give', 'buy', 'sell', 'persuade', 'deceive', 'intimidate', 'sneak', 'steal', 'attack', 'gamble', 'rest', 'wait', 'other'];
const DIFFICULTIES = ['easy', 'normal', 'hard', 'very_hard'];
const THREAD_STATUSES = ['open', 'resolved', 'failed'];
const NPC_STATUSES = ['free', 'arrested', 'gone', 'dead'];
const LOOSE_END_KINDS = ['debt', 'enemy', 'secret', 'lost', 'promise'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
/* Places people tell the player about (State.apply placesRevealed, proposed
   by the bookkeeper's record_changes and by Upgrade version 3): what kind of
   place it is, and whose. */
const REVEALED_TYPES = ['house', 'shop', 'bar', 'spot', 'church', 'farm', 'dock', 'road', 'other'];
const REVEALED_KINDS = ['home', 'business', 'spot', 'other'];
/* Pronouns: every NPC record carries one (town data, the tables, people the
   story names). The packets and the People card show the label. */
const PRONOUNS = ['he', 'she', 'they'];
const PRONOUN_LABELS = { he: 'he/him', she: 'she/her', they: 'they/them' };
const PRONOUN_OBJECT = { he: 'him', she: 'her', they: 'them' };
/* People someone in the story names (State.apply peopleRevealed, proposed by
   the bookkeeper's record_changes): what kind of person, and how a person
   came to be in the game (npc.created.by; town people have no created,
   unless the player gave them a relation in the People editor: 'edit'). */
const REVEALED_PERSON_KINDS = ['relative', 'worker', 'visitor', 'other'];
const CREATED_BY = ['story', 'tables', 'context', 'loose_end', 'fact', 'edit'];
/* Relations that live under the same roof as the person they are related
   to (a revealed person shares that person's home), and relations a person
   has only one of. */
const HOUSEHOLD_RELATIONS = ['wife', 'husband', 'spouse', 'partner', 'girlfriend', 'boyfriend', 'fiance', 'fiancee', 'son', 'daughter', 'child', 'kid', 'boy', 'girl', 'stepson', 'stepdaughter', 'baby'];
const SINGLE_RELATIONS = ['wife', 'husband', 'spouse', 'mother', 'father', 'mom', 'dad', 'stepmother', 'stepfather'];
/* Words that name a relation, for reading the bookkeeper's one-line who
   ("wife, night clerk at the motor court"): family, then work. */
const FAMILY_RELATIONS = HOUSEHOLD_RELATIONS.concat(['brother', 'sister', 'mother', 'mom', 'momma', 'mama', 'father', 'dad', 'daddy', 'grandmother', 'grandma', 'granny', 'grandfather', 'grandpa', 'granddad',
  'aunt', 'uncle', 'cousin', 'nephew', 'niece', 'mother-in-law', 'father-in-law', 'sister-in-law', 'brother-in-law', 'son-in-law', 'daughter-in-law', 'in-law', 'ex-wife', 'ex-husband', 'ex', 'widow', 'widower', 'stepmother', 'stepfather', 'stepbrother', 'stepsister', 'grandson', 'granddaughter']);
/* The she and he forms of a gendered word: new pronouns turn a relation
   and a role with them ("Dewayne's husband" -> "Dewayne's wife"). */
const GENDERED_WORDS = [['wife', 'husband'], ['girlfriend', 'boyfriend'], ['fiancee', 'fiance'], ['daughter', 'son'], ['stepdaughter', 'stepson'], ['sister', 'brother'], ['stepsister', 'stepbrother'],
  ['mother', 'father'], ['mom', 'dad'], ['momma', 'daddy'], ['mama', 'papa'], ['stepmother', 'stepfather'], ['grandmother', 'grandfather'], ['grandma', 'grandpa'], ['granddaughter', 'grandson'],
  ['aunt', 'uncle'], ['niece', 'nephew'], ['mother-in-law', 'father-in-law'], ['sister-in-law', 'brother-in-law'], ['daughter-in-law', 'son-in-law'], ['widow', 'widower'], ['ex-wife', 'ex-husband'],
  ['girl', 'boy'], ['woman', 'man'], ['lady', 'gentleman'], ['landlady', 'landlord'], ['waitress', 'waiter'], ['actress', 'actor']];
function genderWord(word, pronouns, pairs) {
  const w = String(word || '').toLowerCase();
  for (const [she, he] of pairs || GENDERED_WORDS) if (w === she || w === he) return pronouns === 'she' ? she : pronouns === 'he' ? he : w;
  return w;
}
/* pairs: the word pairs to turn (default GENDERED_WORDS; a look uses LOOK_WORDS). */
function genderPhrase(text, pronouns, pairs) {
  return String(text || '').replace(/[A-Za-z][a-z-]*/g, w => { const g = genderWord(w, pronouns, pairs); return g === w.toLowerCase() ? w : (/^[A-Z]/.test(w) ? capFirst(g) : g); });
}
/* Wave 8 (the final pass): the word for someone who goes by they, for each
   pair of GENDERED_WORDS ("spouse of Dewayne Mangum", "child: Mavis"). */
const THEY_WORDS = { wife: 'spouse', husband: 'spouse', girlfriend: 'partner', boyfriend: 'partner', fiancee: 'fiance', fiance: 'fiance', daughter: 'child', son: 'child',
  stepdaughter: 'stepchild', stepson: 'stepchild', sister: 'sibling', brother: 'sibling', stepsister: 'stepsibling', stepbrother: 'stepsibling', mother: 'parent', father: 'parent',
  mom: 'parent', dad: 'parent', momma: 'parent', daddy: 'parent', mama: 'parent', papa: 'parent', stepmother: 'stepparent', stepfather: 'stepparent', grandmother: 'grandparent',
  grandfather: 'grandparent', grandma: 'grandparent', grandpa: 'grandparent', granddaughter: 'grandchild', grandson: 'grandchild', aunt: "parent's sibling", uncle: "parent's sibling",
  niece: "sibling's child", nephew: "sibling's child", 'mother-in-law': 'parent-in-law', 'father-in-law': 'parent-in-law', 'sister-in-law': 'sibling-in-law',
  'brother-in-law': 'sibling-in-law', 'daughter-in-law': 'child-in-law', 'son-in-law': 'child-in-law', widow: 'widowed spouse', widower: 'widowed spouse', 'ex-wife': 'ex-spouse',
  'ex-husband': 'ex-spouse', girl: 'child', boy: 'child', woman: 'person', man: 'person', lady: 'person', gentleman: 'person', landlady: 'landlord', landlord: 'landlord',
  waitress: 'server', waiter: 'server', actress: 'actor', actor: 'actor' };
/* The family words THEY_WORDS gives (a tie ranks and reads as family with them). */
const THEY_FAMILY = ['spouse', 'partner', 'fiance', 'child', 'stepchild', 'sibling', 'stepsibling', 'parent', 'stepparent', 'grandparent', 'grandchild', "parent's sibling", "sibling's child",
  'parent-in-law', 'sibling-in-law', 'child-in-law', 'widowed spouse', 'ex-spouse'];
function familyWord(w) { return FAMILY_RELATIONS.includes(w) || THEY_FAMILY.includes(w); }
/* A relation word in the form the pronouns of the person it names take
   (wave 8, the final pass: a tie follows /pronouns): "wife" for she,
   "husband" for he, "spouse" for they; any other word as it is. */
function kinWord(relation, pronouns) {
  const r = String(relation || '');
  if (!r || !PRONOUNS.includes(pronouns)) return r;
  if (pronouns !== 'they') return genderPhrase(r, pronouns);
  return r.replace(/[A-Za-z][a-z-]*/g, w => { const g = THEY_WORDS[w.toLowerCase()]; return g ? (/^[A-Z]/.test(w) ? capFirst(g) : g) : w; });
}
/* Words that say what a person is (not who they are to someone: kin words
   in a look are about someone else), for turning a look with new pronouns. */
const LOOK_WORDS = [['woman', 'man'], ['women', 'men'], ['girl', 'boy'], ['lady', 'gentleman'], ['gal', 'guy'], ['landlady', 'landlord'], ['waitress', 'waiter'], ['actress', 'actor'],
  ['barmaid', 'barman'], ['saleswoman', 'salesman'], ['businesswoman', 'businessman'], ['policewoman', 'policeman'], ['cowgirl', 'cowboy']];
const PRONOUN_FORMS = {
  he: { subj: 'he', obj: 'him', det: 'his', pos: 'his', refl: 'himself' },
  she: { subj: 'she', obj: 'her', det: 'her', pos: 'hers', refl: 'herself' },
  they: { subj: 'they', obj: 'them', det: 'their', pos: 'theirs', refl: 'themself' }
};
const PRONOUN_KIND = { he: 'subj', she: 'subj', they: 'subj', him: 'obj', them: 'obj', their: 'det', hers: 'pos', theirs: 'pos', himself: 'refl', herself: 'refl', themself: 'refl', themselves: 'refl' };
/* After "her" or "his", a word that makes it him / her / hers rather than his / her hat. */
const NOT_OWNED = new Set(['and', 'or', 'but', 'nor', 'so', 'to', 'in', 'on', 'at', 'by', 'with', 'from', 'for', 'of', 'off', 'out', 'up', 'down', 'over', 'about', 'around', 'away', 'again',
  'too', 'as', 'like', 'than', 'then', 'when', 'while', 'if', 'the', 'a', 'an', 'that', 'this', 'these', 'those', 'is', 'was', 'be', 'been', 'are', 'were', 'alone', 'anyway', 'though', 'now',
  'here', 'there', 'yet', 'still', 'all', 'both', 'much', 'more', 'well', 'before', 'after', 'into', 'onto', 'through', 'since', 'until', 'because', 'any', 'some', 'what', 'who', 'how', 'why', 'where']);
const VERB_PLURAL = { is: 'are', was: 'were', has: 'have', does: 'do', "doesn't": "don't", "isn't": "aren't", "wasn't": "weren't", "hasn't": "haven't" };
const VERB_SINGULAR = { are: 'is', were: 'was', have: 'has', do: 'does', "don't": "doesn't", "aren't": "isn't", "weren't": "wasn't", "haven't": "hasn't" };
const VERB_SKIP = new Set(['always', 'never', 'often', 'sometimes', 'usually', 'rarely', 'seldom', 'still', 'just', 'only', 'also', 'even', 'barely', 'hardly', 'mostly', 'really', 'probably']);
const NOT_A_VERB = new Set(['can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'had', 'did', 'used', 'ought', "can't", "won't", "couldn't", "wouldn't", "shouldn't", "didn't",
  "hadn't", 'perhaps', 'towards', 'afterwards', 'besides', 'unless', 'this', 'thus', 'yes', 'plus', 'its', 'his', 'hers', 'us', 'less', 'as', 'too', 'and', 'or', 'but', 'not', 'the', 'a', 'an']);
/* A look or voice line turned to new pronouns (State's fixPeople and
   editPerson when the pronouns change and the same edit does not state the
   line; the mock's people check): the words that say what the person is
   (LOOK_WORDS: a man -> a woman; they leaves them alone, as genderPhrase
   does) and the third-person pronouns (he, him, his, himself; she, her,
   hers, herself; and they, them, their, theirs, themself only when the
   person went by they before, from, since otherwise "all of them" is
   about something else; with no from, as the mock's check sends, all of
   them), with the plain verb after a subject whose number changes ("she
   says" -> "they say", "they are" -> "he is"). Words in quotes are
   someone's speech and stay. */
function turnLook(text, pronouns, from) {
  const to = PRONOUN_FORMS[pronouns];
  if (!to) return String(text || '');
  const theyToo = !from || from === 'they';
  // Quoted words: "...", “...”, or '...' (an apostrophe inside, as in 'he's fine', does not end it).
  const segs = String(text || '').split(/("[^"]*"|“[^”]*”|(?<![\p{L}\p{N}])'(?:[^']|'(?=[\p{L}\p{N}]))*'(?![\p{L}\p{N}]))/u);
  return segs.map((seg, i) => (i % 2 ? seg : turnSegment(seg, pronouns, to, theyToo))).join('');
}
const THEY_FORMS = new Set(['they', 'them', 'their', 'theirs', 'themself', 'themselves']);
function turnSegment(seg, pronouns, to, theyToo) {
  const words = [];
  const re = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
  for (let m = re.exec(seg); m; m = re.exec(seg)) words.push({ at: m.index, w: m[0] });
  const keepCase = (w, r) => (/^[A-Z]/.test(w) ? capFirst(r) : r);
  let agree = null; // 'plural' (now they) or 'singular' (now he or she): the verb after a turned subject
  for (let i = 0; i < words.length; i++) {
    const t = words[i];
    const raw = t.w;
    const w = raw.toLowerCase().replace(/’/g, "'");
    const next = words[i + 1];
    const nextWord = next && /^\s+$/.test(seg.slice(t.at + raw.length, next.at)) ? next.w.toLowerCase() : null;
    if (agree) {
      const mode = agree;
      agree = null;
      if (VERB_SKIP.has(w)) { agree = mode; continue; }
      let r = null;
      if (mode === 'plural') {
        if (VERB_PLURAL[w]) r = VERB_PLURAL[w];
        else if (!NOT_A_VERB.has(w) && /^[a-z]+s$/.test(w) && !/(ss|us|is)$/.test(w)) r = /ies$/.test(w) && w.length > 4 ? w.slice(0, -3) + 'y' : /(sh|ch|x|z|o)es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);
      } else if (VERB_SINGULAR[w]) r = VERB_SINGULAR[w];
      else if (!NOT_A_VERB.has(w) && !PRONOUN_KIND[w] && /^[a-z]+$/.test(w) && !/(ed|s)$/.test(w)) r = /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(sh|ch|x|z|o)$/.test(w) ? w + 'es' : w + 's';
      if (r) { t.r = keepCase(raw, r); continue; }
    }
    const c = /^(he|she|they)'(s|re|ve|d|ll)$/.exec(w);
    if (c && (theyToo || c[1] !== 'they')) {
      let suffix = c[2];
      if (to.subj === 'they' && suffix === 's') suffix = nextWord === 'got' || nextWord === 'been' ? 've' : 're';
      else if (to.subj !== 'they' && (suffix === 're' || suffix === 've')) suffix = 's';
      t.r = keepCase(raw, `${to.subj}'${suffix}`);
      continue;
    }
    let kind = PRONOUN_KIND[w];
    if (w === 'his') kind = nextWord && !NOT_OWNED.has(nextWord) ? 'det' : 'pos';
    if (w === 'her') kind = nextWord && !NOT_OWNED.has(nextWord) ? 'det' : 'obj';
    if (!kind || (!theyToo && THEY_FORMS.has(w))) continue;
    t.r = keepCase(raw, to[kind]);
    if (kind === 'subj' && (w === 'they') !== (to.subj === 'they')) agree = to.subj === 'they' ? 'plural' : 'singular';
  }
  let out = '';
  let pos = 0;
  for (const t of words) if (t.r !== undefined && t.r !== t.w) { out += seg.slice(pos, t.at) + t.r; pos = t.at + t.w.length; }
  out += seg.slice(pos);
  return pronouns === 'they' ? out : genderPhrase(out, pronouns, LOOK_WORDS);
}
/* Kin words people say for a relation the cast writes another way ("Colt's
   dad" is his father, "Tammy's boy" her son), and the words that name
   either one of a pair ("Royce's kid" is his son or his daughter): read by
   Town.sameRel, the one place that compares two relations. */
const KIN_SYNONYMS = {
  dad: 'father', daddy: 'father', pa: 'father', papa: 'father', pop: 'father', 'old man': 'father',
  mom: 'mother', momma: 'mother', mama: 'mother', ma: 'mother', mommy: 'mother',
  grandma: 'grandmother', granny: 'grandmother', nana: 'grandmother', grandmama: 'grandmother',
  grandpa: 'grandfather', granddad: 'grandfather', granddaddy: 'grandfather', gramps: 'grandfather',
  hubby: 'husband', missus: 'wife', bro: 'brother', sis: 'sister', stepmom: 'stepmother', stepdad: 'stepfather',
  boy: 'son', girl: 'daughter', kid: 'child', baby: 'child'
};
const KIN_NEUTRAL = {
  child: ['son', 'daughter'], parent: ['mother', 'father'], spouse: ['wife', 'husband'], sibling: ['brother', 'sister'],
  grandparent: ['grandmother', 'grandfather'], grandchild: ['grandson', 'granddaughter'], partner: ['wife', 'husband', 'girlfriend', 'boyfriend']
};
const WORK_RELATIONS = ['boss', 'employee', 'worker', 'hand', 'helper', 'apprentice', 'employer', 'manager'];
const OTHER_RELATIONS = ['friend', 'buddy', 'neighbor', 'neighbour', 'roommate', 'landlord', 'landlady', 'tenant', 'lodger', 'rival', 'enemy'];
const RELATION_RE = new RegExp("\\b((?:older|younger|elder|eldest|oldest|youngest|little|big|baby|half|step|ex|late|second|first|middle|twin|kid|old|new)[- ]?)?(" +
  FAMILY_RELATIONS.concat(WORK_RELATIONS, OTHER_RELATIONS).slice().sort((a, b) => b.length - a.length).join('|') + ")\\b", 'i');
/* Words that say she or he: nouns count twice, pronouns once, so "his wife"
   is she and "her husband" is he. */
const SHE_NOUNS = ['woman', 'women', 'wife', 'wives', 'mother', 'mom', 'momma', 'mama', 'girl', 'girls', 'lady', 'ladies', 'gal', 'daughter', 'sister', 'aunt', 'auntie', 'niece',
  'grandmother', 'grandma', 'granny', 'widow', 'girlfriend', 'waitress', 'barmaid', 'fiancee', 'mrs', 'ms', 'miss', "ma'am", 'stepmother', 'stepdaughter',
  'granddaughter', 'landlady', 'housewife', 'nun', 'actress', 'hostess', 'bride', 'missus', 'cowgirl', 'saleswoman', 'businesswoman', 'policewoman', 'sis'];
const HE_NOUNS = ['man', 'men', 'husband', 'father', 'dad', 'daddy', 'boy', 'boys', 'guy', 'fella', 'fellow', 'gentleman', 'son', 'brother', 'uncle', 'nephew',
  'grandfather', 'grandpa', 'widower', 'boyfriend', 'fiance', 'mr', 'sir', 'stepfather', 'stepson', 'grandson', 'barman', 'cowboy', 'salesman',
  'businessman', 'policeman', 'fisherman', 'ferryman', 'boatman', 'deliveryman', 'mailman', 'repairman', 'handyman', 'lineman', 'foreman', 'doorman', 'bro'];
const SHE_PRONOUNS = ['she', 'her', 'hers', 'herself'];
const HE_PRONOUNS = ['he', 'him', 'his', 'himself'];
/* Which of the tables' first names read as she or he (names in neither list
   go either way; a name the tables do not have tells nothing). */
const NAME_PRONOUNS = {
  she: ['Ashley', 'Brandi', 'Crystal', 'Faye', 'Heather', 'Keisha', 'Lacey', 'Mavis', 'Misty', 'Patsy', 'Rhonda', 'Trina', 'Wanda'],
  he: ['Bobby', 'Clint', 'Darrell', 'Dusty', 'Earl', 'Gary', 'Jamal', 'Kenny', 'Lonnie', 'Odell', 'Randy', 'Shawn', 'Terrell', 'Vernon', 'Wesley']
};
const ID_RE = {
  loc: /^loc_[a-z0-9_]+$/, npc: /^npc_[a-z0-9_]+$/, fac: /^fac_[a-z0-9_]+$/, thr: /^thr_[a-z0-9_]+$/,
  seed: /^seed_[a-z0-9_]+$/, rum: /^rum_[a-z0-9_]+$/, item: /^item_[a-z0-9_]+$/, cond: /^cond_[a-z0-9_]+$/, bg: /^bg_[a-z0-9_]+$/
};

function deepCopy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function toInt(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}
function capFirst(s) { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); }
function lowerFirst(s) { s = String(s == null ? '' : s); return s.charAt(0).toLowerCase() + s.slice(1); }
function sentence(s) {
  s = String(s == null ? '' : s).trim();
  if (!s) return '';
  s = capFirst(s);
  return /[.!?"'”)]$/.test(s) ? s : s + '.';
}
/* The end of a sentence (wave 19, QA D16): a full stop, ! or ? before a space or the end, but not the stop of "Dr.", "Mr.",
   "Mrs.", "Ms.", "St." or a single initial ("Carter brought Dr. Sayle up" is one sentence); wave 20 (QA N7): nor of "Prof.",
   "Sgt.", "Rev.", "Jr.", "Sr.", "Lt.", "Capt.", "Gen.", "Col." or "Hon." ("Main St. Then he left." is one sentence, the price of
   "St. Jude"). firstSentence: up to the first one. */
const SENTENCE_END = /(?:[!?]|(?<!(?:^|[^A-Za-z])(?:Dr|Mr|Mrs|Ms|St|Prof|Sgt|Rev|Jr|Sr|Lt|Capt|Gen|Col|Hon|[A-Z]))\.)(?=\s|$)/;
const FIRST_SENTENCE = new RegExp(`^.*?${SENTENCE_END.source}`);
const SENTENCE_SPLIT = new RegExp(`(?<=${SENTENCE_END.source.replace('(?=\\s|$)', '')})\\s+`);
function firstSentence(text) { const t = String(text == null ? '' : text); const m = FIRST_SENTENCE.exec(t); return m ? m[0] : t; }
function article(word) { return /^[aeiou]/i.test(String(word)) ? 'an' : 'a'; }
function slugify(s) {
  const out = String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '');
  return out || 'x';
}
function fillTemplate(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}
/* Effect placeholders (docs/notes/engine-world.md): inside any string of an effect
   list, "{npcId}" and "{npc}" (the person a seed, template or obligation is
   about: their id, their name), "{playerName}" (also "{player}"),
   "{witnessId}" and "{witness}" (someone present, for a complication) and
   "{place}" (a place's name) are filled from vars. An effect that still
   holds one of them afterwards (nobody to fill it with) is dropped, so
   State.apply never sees a placeholder. Returns a new list. */
// Wave 27: protectorId and protector, whom a report goes to (GRUDGE_TEMPLATES of kind report).
const FILL_SLOTS = ['npcId', 'npc', 'playerName', 'player', 'witnessId', 'witness', 'place', 'protectorId', 'protector'];
function fillPlaceholders(effects, vars) {
  vars = vars || {};
  const re = new RegExp(`\\{(${FILL_SLOTS.join('|')})\\}`, 'g');
  const left = new RegExp(re.source);
  const fill = v => (typeof v === 'string' ? v.replace(re, (m, k) => (vars[k] !== undefined && vars[k] !== null && vars[k] !== '' ? String(vars[k]) : m))
    : Array.isArray(v) ? v.map(fill) : isObj(v) ? Object.fromEntries(Object.keys(v).map(k => [k, fill(v[k])])) : v);
  const unfilled = v => (typeof v === 'string' ? left.test(v) : Array.isArray(v) ? v.some(unfilled) : isObj(v) ? Object.keys(v).some(k => unfilled(v[k])) : false);
  return (Array.isArray(effects) ? effects : []).filter(isObj).map(fill).filter(e => !unfilled(e));
}
function cleanText(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max || 500) : ''; }
/* Text held to max characters at a whole word, with "…" when it was cut
   (wave 3: the ending's news was cut mid-word, "she always said t."). */
function clipWords(v, max) {
  const t = cleanText(v, 100000);
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const i = head.lastIndexOf(' ');
  return `${(i > max * 0.5 ? head.slice(0, i) : head).replace(/[\s,;:—–-]+$/, '')}…`;
}
function strArr(v, max) { return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => cleanText(x, max || 60)) : []; }
function fmtMod(n) { n = n | 0; return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0'; }
function plusMinus(n) { return n > 0 ? '+' + n : String(n); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
/* Pronouns from what a text says about a person: she or he words (nouns
   count twice, pronouns once), else they. */
function inferPronouns(text) {
  const words = String(text || '').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) || [];
  let she = 0;
  let he = 0;
  for (const w0 of words) {
    const w = w0.replace(/'s$/, '');
    if (SHE_NOUNS.includes(w)) she += 2; else if (SHE_PRONOUNS.includes(w)) she += 1;
    if (HE_NOUNS.includes(w)) he += 2; else if (HE_PRONOUNS.includes(w)) he += 1;
  }
  return she > he ? 'she' : he > she ? 'he' : 'they';
}
/* Pronouns a first name gives (NAME_PRONOUNS), or null. */
function namePronouns(name) {
  const words = String(name || '').trim().split(/\s+/);
  const title = (words[0] || '').toLowerCase().replace(/\.$/, '');
  if (['mrs', 'ms', 'miss'].includes(title)) return 'she';
  if (title === 'mr') return 'he';
  const first = words.find(w => !/^(mr|mrs|ms|miss|dr)\.?$/i.test(w)) || '';
  return NAME_PRONOUNS.she.includes(first) ? 'she' : NAME_PRONOUNS.he.includes(first) ? 'he' : null;
}
function pronounLabel(p) { return PRONOUN_LABELS[p] || PRONOUN_LABELS.they; }
/* A lived-in town (direction change 9): the fields a place and a person
   carry beyond the original contract, which the town data fills and
   Upgrade version 7 (State livedIn) brings to an older game. */
const PLACE_FIELDS = ['away', 'distance', 'details', 'hours', 'history', 'aka'];
const PERSON_FIELDS = ['age', 'presence', 'history', 'where', 'reach', 'died', 'buried'];
/* Where someone is in the story: 'dead' (alive false or status dead),
   'away' (status gone: they live elsewhere, or have left town), else 'here'.
   The dead and the away are never scheduled and never present. */
function presenceOf(n) { return !n ? 'here' : n.alive === false || n.status === 'dead' ? 'dead' : n.status === 'gone' ? 'away' : 'here'; }
/* Why someone is not in the scene, in a few words: "dead (August 2026, an
   overdose at Riverbend)", "not in town (the state penitentiary, ...)",
   "gone from town"; '' for someone here. */
function absentNote(n) {
  const p = presenceOf(n);
  if (p === 'dead') return n.died ? `dead (${n.died})` : 'dead';
  if (p === 'away') return n.where ? `not in town (${n.where})` : 'gone from town';
  return '';
}
/* "34" for a whole-number age, else ''. */
function ageText(a) { return Number.isInteger(a) && a >= 0 ? String(a) : ''; }
function validPronouns(p) { return PRONOUNS.includes(p) ? p : null; }
/* Do / Say (the composer's toggle, Pipeline.speechFor): a turn's speech or a
   log entry with mode 'say' was the player's exact words, said to one person
   (to: their id, toName: their name) or to everyone present. */
function isSay(x) { return !!(x && x.mode === 'say'); }
function sayTo(x) { return x && x.to !== 'everyone' && x.toName ? x.toName : 'everyone present'; }
/* How the player sees someone they have not been introduced to: 'the mechanic',
   'the owner and bartender'. Once knownToPlayer, their name. Display only; the
   models always get the real name. */
function npcLabel(npc) {
  if (!npc) return 'someone';
  if (npc.knownToPlayer) return npc.name;
  let r = String(npc.role || '').trim().split(/,| who | which | that /)[0].trim();
  // "Dewayne's wife" (someone the story named by who they are to someone): as it is.
  if (/^[A-Z][\w-]*['’]s\s+\S/.test(r) && r.split(/\s+/).length <= 4) return r;
  if (r.split(/\s+/).length > 4) {
    const cut = r.split(/ of | at | in | on | for | from | behind /)[0].trim();
    r = /^(head|man|woman|boy|girl|person)$/i.test(cut) ? (r.split(/\s+/).length <= 7 ? r : r.split(/\s+/).slice(0, 5).join(' ')) : cut;
  }
  r = r.replace(/^(The|A|An|the|a|an) /, '');
  r = r.charAt(0).toLowerCase() + r.slice(1);
  return r ? 'the ' + r : 'someone';
}
/* Money. The state field is player.gold whatever the setting. A town with
   TOWN_DATA.currency ({ symbol, name }) is shown as cash ("$12"); without it
   the money is gold ("12 gold"). See docs/BUILD_PLAN.md, setting change. */
function currency() {
  const t = State.town || TOWN_DATA;
  return t && isObj(t.currency) && typeof t.currency.symbol === 'string' ? t.currency : null;
}
function money(n) { const c = currency(); return c ? `${c.symbol}${n}` : `${n} gold`; }
function moneyLabel() { return currency() ? 'Cash' : 'Gold'; }
/* For packets the models read: "15 gold" or "cash $15". */
function moneyLine(n) { return currency() ? `cash ${money(n)}` : money(n); }
/* The setting decides what is an anachronism: a town with a currency is
   modern day, otherwise low fantasy. */
function isModern() { return !!currency(); }
/* Location types that play the same part in either setting. */
const PLACE_KINDS = {
  watch: ['police', 'watch'],
  slum: ['slum', 'trailerpark'],
  tavern: ['tavern', 'bar'],
  docks: ['docks', 'marina'],
  road: ['road', 'highway']
};
/* How players name kinds of place, in either setting, and the location
   types each phrase can mean (first match wins). Used by the mock parser and
   /skip when a goal names a kind of place rather than a place. */
const PLACE_PHRASES = [
  [['police', 'watch'], /\b(watch ?house|police station|police|sheriff'?s? office|station house)\b/],
  [['tavern', 'bar'], /\b(tavern|inn|taproom|pub|alehouse|bar|saloon)\b/],
  [['diner'], /\b(diner|cafe|restaurant)\b/],
  [['gas'], /\b(gas station|filling station|gas pumps?)\b/],
  [['motel'], /\bmotel\b/],
  [['docks', 'marina'], /\b(docks?|quay|wharf|harbou?r|jetty|marina|boat ramp|ramp|landing)\b/],
  [['market'], /\b(market|square)\b/],
  [['temple', 'church'], /\b(temple|church|chapel|shrine)\b/],
  [['smithy'], /\b(forge|smithy)\b/],
  [['garage', 'gas'], /\b(garage|body shop|auto shop|service bays?)\b/],
  [['slum', 'trailerpark'], /\b(slums?|shacks|trailer park|trailers)\b/],
  [['manor', 'bighouse'], /\b(manor|mansion|big house|house on the hill)\b/],
  [['road', 'highway'], /\b(gate|gatehouse|road out|highway|interstate)\b/],
  [['riverbank'], /\b(piers?|riverbank|mudflat)\b/],
  [['pawn'], /\b(pawn ?shop|pawnbroker)\b/],
  [['hall', 'police'], /\b(town hall|city hall)\b/],
  [['hall'], /\b(community hall|hall)\b/],
  [['bridge'], /\bbridge\b/]
];
/* A location among `list` that a phrase names by kind ("the docks", "the bar"). */
function placeByPhrase(text, list) {
  const t = String(text || '').toLowerCase();
  for (const [types, re] of PLACE_PHRASES) {
    if (!re.test(t)) continue;
    for (const type of types) { const l = list.find(x => x.type === type); if (l) return l; }
  }
  return null;
}
function findPlace(kind, except) {
  const types = PLACE_KINDS[kind] || [kind];
  const list = State.current ? State.current.locations : [];
  for (const t of types) { const l = list.find(x => x.type === t && !x.closed && x.id !== except); if (l) return l; }
  return null;
}
function wordCount(s) { return (String(s || '').trim().match(/\S+/g) || []).length; }
/* "a, b and c" (wave 4: one helper for the mock, the pipeline and the arrest line). */
function andList(list) { list = Array.isArray(list) ? list : []; return list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`; }
/* Wave 47: helpers more than one module had its own copy of, kept here once. */
// A string as a literal inside a RegExp (Town's and Style's escRe, the mock's escMock and its two esc, State's apptEsc).
function escRe(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/* The police, by tag or by role (who takes a report as the law; Rel's copy).
   Wave 47: World's own copy read the tag only. The tag is not validated for
   every role that says police (the away sheriff, the dispatcher, people the
   story makes), so the role words count everywhere. */
function isPoliceNpc(x) { return isObj(x) && ((Array.isArray(x.tags) && x.tags.includes('police')) || /\b(police|sheriff|deputy|officer)\b/i.test(String(x.role || ''))); }
// The weekday of a game day ('Friday', State.weekday), '' with no game to read it from (wave 47: Pipeline's and UI's copies).
function weekdayOf(day) { try { const w = State.weekday(day); return typeof w === 'string' ? w : ''; } catch (e) { return ''; } }
function uniqueId(base, exists) {
  if (!exists(base)) return base;
  for (let i = 2; ; i++) { const c = base + '_' + i; if (!exists(c)) return c; }
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
/* Build DOM nodes. Strings become text nodes, never markup, so model output and
   player input can be passed straight in. */
function el(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') node[k] = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (let i = 2; i < arguments.length; i++) appendKids(node, arguments[i]);
  return node;
}
function appendKids(node, kid) {
  if (kid === null || kid === undefined || kid === false) return;
  if (Array.isArray(kid)) { kid.forEach(k => appendKids(node, k)); return; }
  node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
}

