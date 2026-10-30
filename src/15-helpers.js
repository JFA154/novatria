// ===== Helpers =====
const PHASES = ['morning', 'afternoon', 'evening', 'night'];
const STATS = ['might', 'wits', 'charm', 'stealth'];
const TIME_COSTS = ['instant', 'short', 'long', 'rest'];
const SHORTS_PER_PHASE = 3; // SPEC section 7: three shorts make a phase
// 'work': taking paid work on offer here (JOBS; direction change 16). An enum value of parse_action, not a record_changes property.
const ACTION_TYPES = ['move', 'talk', 'look', 'search', 'take', 'use', 'give', 'buy', 'sell', 'persuade', 'deceive', 'intimidate', 'sneak', 'steal', 'attack', 'rest', 'wait', 'work', 'other'];
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
function article(word) { return /^[aeiou]/i.test(String(word)) ? 'an' : 'a'; }
function slugify(s) {
  const out = String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '');
  return out || 'x';
}
function fillTemplate(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}
function cleanText(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max || 500) : ''; }
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
/* The town's gossips: an informant, a bartender or an innkeeper, by tag or
   by role. Each morning they hear everything anyone at their place knows
   (World's spread, direction change 12). */
const GOSSIP_TAGS = ['informant', 'bartender', 'innkeeper'];
const GOSSIP_ROLE = /\b(informant|bartender|barkeep|barman|barmaid|innkeeper|publican)\b/i;
function isGossip(n) { return !!n && ((Array.isArray(n.tags) && n.tags.some(t => GOSSIP_TAGS.includes(t))) || GOSSIP_ROLE.test(n.role || '')); }
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

