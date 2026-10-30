# Wave 1 notes: prompts (what the models read, and the mock provider)

Region: `STYLE_GUIDE_*` / `EXAMPLE_TURNS_*`, the Style module, in Api the
SYSTEM prompts, `MEMORY_RULES`, the schemas and the mock provider, in Pipeline
the packet builders (`npcLine`, `pickMemories`, `knowledgeLine`,
`narratorPacket`, `castBlock`, `townBlock`, `parsePacket` and `normaliseParse`,
`bookkeeperPacket`, `wouldKnow`/gossip, the chronicle prompt text). Items:
REVIEW 2.1, 2.2 (packet side), 2.6 (style checks, parser and bookkeeper
rubrics), the prompting parts of 3.9 and 3.10, and "Rumours barely spread"
(section 4). Tests: `tests/prompts-fixes.test.cjs` (14 tests).

## What changed

### The narrator knows the story (REVIEW 2.1)

The narrator packet is now ordered oldest to newest: the story so far, the
scene, the people, this turn, then the rules.

```
STORY SO FAR: Day 1: ... Open: ... Days 2-3: ...          (chronicle, up to 400 words, whole entries, day stamps)
EARLIER: Day 1 morning: Bought a lighter for $2. | ...      (the last 10 journal lines before LAST 3 TURNS)
LAST 3 TURNS: ...                                            (one line each now: an arrival's paragraphs are joined)
DAY 2 (Friday 9 October), EVENING (late) · Location: The Low Water[ — full description on an arrival, a move or a look]
PLACE: [details with the full description] Open: <hours>.
WEATHER / ITEMS HERE / SINCE THE LAST TURN
PLAYER: Tomas (34, veteran). Reputation: unknown. Conditions: none. Came here to: <goal>. Flaw: <flaw>.
CARRYING: ...; cash $140 (nothing else: no <only what is not carried> or money beyond this).
PRESENT: Name (60, she/her; role; ties; look: <until metTurn>; voice; traits: a, b; wants (never say this outright; it steers what they push for and dodge): <goal>; attitude 5 (neutral); remembers: ... / tied to Tomas by a debt (see LOOSE ENDS)[; secret (it can come out now, if the talk goes there): ...]).
WHAT PEOPLE KNOW: Tomas came to Lockett's Ferry today (day 1) and was a stranger here before that. Only X, Y and Z knew of Tomas before, as LOOSE ENDS says.
LOOSE ENDS: Curtis Pruett is owed money by Tomas from before Tomas came here, and wants it (here now; Tomas's own words: "...") | ...
OPEN: The bridge vote: <first sentence of its summary>; You owe Curtis Pruett $400, due day 7 (Wednesday, in 2 days)
TOWN NEWS: Day 5: ...; Day 6: ...
NOT PRESENT / NEW IN THE SCENE / DESTINATION (says "closed" by State.isClosed when the engine has it) / MOVED
ASKED ABOUT: Wade Purvis (talked about, not in the scene)
TIME THIS TAKES: a few minutes; it will still be evening (late)  |  an hour or more; it will be night when this is done  |  a moment, no time passes
PLAYER TYPED: "the typed words" (Do mode only, not a beat)
ACTION / PLAYER SAYS ... / NOT CARRIED / ROLL / SAME ASK AGAIN / COMPLICATION / OUTCOME / DAMAGE / DEFEAT / DUE EVENT / RUMOUR / TIME PASSED
MODE: normal | ZOOM | arrival ... | epilogue (ZOOM length). This is an ending: close the threads named in DUE EVENT; the player may keep playing afterwards.
LENGTH ... / VARIETY ...
```

- `pickMemories(list, turn, { ..., looseEnds: true })` keeps a loose end's
  memory for the narrator (the People card still leaves it out); `npcLine`
  writes it as one line from the person's side ("tied to Tomas by a debt (see
  LOOSE ENDS)"). `knowledgeLine` names the people of a debt, an enemy or a
  secret as the ones who knew of the player before; a lost one's or a
  promise's lead has never met them.
- The rule half of WHAT PEOPLE KNOW moved into the cached style block
  (`Style.KNOWLEDGE`, between the guide and the examples; byte-identical per
  style). The packet keeps when the player came and who knew them.
- The town block (cached) ends with "Anything under TOWN NEWS in the message
  is newer than this and wins." (`Pipeline.TOWN_NEWER`).
- Secrets: only through `ctx.revealSecretFor` (an array of npc ids; transport
  sets it). Goals now reach the narrator as the `wants` of people present,
  never anyone else's; seeds and rumour truth never.
- `CARRYING` is derived: a carried weapon, tool, phone, keys or car drops out
  of the "nothing else" list (a phone carried is never "no phone").
- Calendar: `Pipeline.dateText(day)` / `weekdayOf(day)` use `State.dateLine` /
  `State.weekday` when the engine has them, else the town's
  `calendar.startDate` (else 2026-10-08, Thursday). The clock line is
  `State.clockLine` with the date inserted (`Pipeline.clockText`); the parser's
  TIME line gets it too. The bookkeeper's TURN line is unchanged.
- Obligations and news are read through `State.obligations('open')` and
  `State.news` when they exist, else straight from `player.obligations` /
  `state.news`, so the lines work before and after the merge.

### Memory (REVIEW 2.2, prompt side)

- STORY SO FAR: the chronicle, newest entries kept whole first, up to 400
  words; an entry that does not start with a day stamp is stamped with its
  turns ("Turns 10-19: ...").
- EARLIER: the journal's last ten lines from before LAST 3 TURNS, each with
  its day and phase (the entry's own `day`/`phase` if it has them, else its
  turn's log entry, else "Turn N").
- `SYSTEM.chronicle`: "Summarise these turns for the narrator's memory, under
  100 words, past tense, full names. Keep every number, deadline, promise,
  debt, threat, and any lie the player told and to whom. Skip scenery and
  small talk. End with 'Open:' and what is unresolved." plus "Begin with the
  day or days the turns cover, like 'Day 2:' or 'Days 2-3:'." (the stamp the
  packet relies on). The mock chronicle does the same, under 80 words.

### Style checks (REVIEW 2.6)

- `Style.check` returns `{ ok, hard, problems, words, style }`; every problem
  has `hard: true|false`. Hard: over the limit by more than `HARD_OVER` (15)
  words, an invented past on day 1, "What do you do" outside dialogue, a name
  the town does not have. Soft: banned phrases, "As you", similes, a repeated
  spoken phrase, a few words over. `ok` still means "no problem at all".
- SIMILE: "like a" after looks/sounds/seems/feels/something/about/would/'d is
  not a simile; "as if" is soft like every simile.
- The repeated-phrase check skips 4-grams with a number in them and needs two
  words that are neither filler nor part of a name (cast, places and their
  aka, the town, the calendar).
- `PAST_RE` drops bare time words (last night, yesterday, the other day, last
  week/month) and keeps the relationship markers, plus "saw/met/called you
  last night" and "you were here yesterday".
- Banned phrases and "what do you do" are checked outside quotes only.
- `regenerationNote(problems, { draft })`: the hard problems lead ("Write it
  again without that."), the soft ones follow as "If you can, also fix: ...",
  and a draft is appended as "YOUR LAST ATTEMPT (edit it ...)". With only
  soft problems the note reads as before.
- Both guides end with WHAT A GOOD TURN DOES (`Style.GOOD_TURN`); the
  literary guide is otherwise SPEC section 9 word for word.

### Invented names (D)

`Style.check` ports the capitalised-name scan of `tests/mentions.cjs`: known
are the game's people (full, first and last names, "the Gentrys"), places
(name, map label, aka), factions, the town and its map labels, the player,
the calendar, `Style.NAME_ALLOW` (titles, kin words used as names, faith,
holidays, the services, a few brands, states and southern cities) and every
capitalised word of the narrator packet just built (`Style.notePacket`, or
`opts.packet`): what the player typed, a due event, the news. Sentence starts
(an opening quote counts), "I" and words in capitals are never names; a
sentence start followed by an unknown capitalised word is ("Earl Hux nods"),
unless it is a common opener ("Ask Bobby" flags only Bobby). No game, no
check; `names: false` skips it. A hit is the hard problem "names someone or
somewhere that does not exist: X" and the note says to use CAST and THE TOWN.

### Examples (E)

`EXAMPLE_TURNS_CASUAL` is eight turns (35 to 43 words each) whose context is
written in the packet's own field format: Say to one person, Say to
everyone with two people reacting, a success that gives something concrete,
a failure whose complication changes things, an arrival (SINCE THE LAST
TURN), NOT CARRIED, a DUE EVENT worked in, and a refusal with a plain
reason. People and places from another town (Charlene Voight, Hutch Bledsoe,
Dot Fenwick, Ellis Barlow, the Tip Top). The literary three are unchanged.

### Parser (F)

- Packet: `LAST TURN: <previous narration>` after MODE; NPCS PRESENT gives
  traits and wants; TIME has the weekday and date.
- `SYSTEM.parser`: LAST TURN, moveWhen before/after, aboutIds, and the rubric
  (when to roll; easy 8 / normal 12 / hard 15 (a pro would sweat, lying to a
  cop, attitude -25 or below) / very_hard 18 (against their wants, nature or
  what they just refused); which stat), GAMBLE.
- `parse_action`: `aboutIds: [ids]`, `moveWhen: 'before'|'after'|null`,
  actionType enum `Api.PARSE_TYPES` (the engine's `ACTION_TYPES` plus
  `gamble` until the engine list has it). `normaliseParse` keeps them:
  moveWhen only with a destination, aboutIds only known ids that are not
  targets.
- Mock parser: "ask X about Y" puts Y (a person or a place) in aboutIds, not
  targets; "..., then walk to Z" is moveWhen after; the old walk-first
  compound is moveWhen before; bet / play cards / deal me in at a bar is
  gamble with `summary: "bets $N at cards"` and no roll; sell/pawn, give/pay,
  order/drink/eat (buy) and knock out (attack) are recognised.

### Bookkeeper (G)

- `record_changes` gains `npcFates [{ npcId, status }]`, `memoriesSettled
  [{ npcId, text }]`, `obligationsSettled [id]` (CONTRACTS section 10).
- **Property count: 45, not 44.** CONTRACTS counted one per new field; the
  API's grammar counts every property of every nested object (that is how
  the live probe found "46 pass, 47 refused", and how `tests/api.test.cjs`
  counts). The three fields with their item properties add seven (48), so
  the schema drops `attitudeChanges[].reason` (State.apply never reads it),
  `newSeeds[].cause` (normaliseSeed defaults it) and the nested
  `newSeeds[].trigger` object for flat `triggerType`/`triggerValue`
  (normaliseSeed already reads that shape): 45. **A live grammar probe is
  still owed** before shipping (the probe was of a different shape).
- `SYSTEM.bookkeeper` adds the field rubric (`Api.RECORD_RULES`) before the
  place rule; it still ends with `MEMORY_RULES`, which now covers the
  player's claims and cover story, agreed terms with amount and deadline,
  what a bystander saw, and no duplicates of what the remembers list holds.
- Packet: present people with their last three memories; FACTIONS with the
  running clock (`fac_x — Name; clock "Buy the swing vote" 3/6`); THREADS with
  a clause of their summary; `OPEN OBLIGATIONS` with ids; TOWN NEWS; ACTION
  lists aboutIds.
- Mock bookkeeper: Say-mode insults by their words ("called me a liar",
  "told me to fuck off"; the word "insult" itself is not one), threats; Do
  "I insult X" as before ("insulted me", "insulted me again"); an apology
  that lands settles the grudge (memoriesSettled); buying only where it is
  sold and open (a good named for a place only there; drinks and food at a
  bar or the station; a room at the motel; bait at the landing; pawned
  things at the pawn shop; the rest at the station or the pawn shop), a drink
  had and a meal eaten (gold, no item; whiskey: "A little drunk -1 wits"
  today; food heals 1 when hurt); selling at the pawn shop for half the
  price; stealing (the thing, or $20 of cash; caught: "caught me stealing");
  giving money or a thing; paying a debt in full (obligationsSettled and the
  "owes me" memory settled); a knockout that lands (`npcFates hurt`), an
  arrest; a clock nudged when the action plainly helps or hinders a faction.
  The three new fields are emitted only once `State.RECORD_KEYS` has them.

### Mock narrator and chronicle (H)

A social roll is answered with a place and a time (success), a little
(partial) or a plain no (failure); in Say mode the addressee answers in
their own words (the quoted habit in their voice line, e.g. "hon"); arrivals
get a follow-up; fresh public news from today or yesterday comes up in talk
(a clause of it, never a rumour's text word for word); buying says when it
is not sold here or cannot be paid for; gamble deals the player in. Variants
are picked by turn and words (`vary`), never by the dice, so test rolls do
not shift. Never a simile; never a name the town does not have (the
style check would rewrite it). "Mock narration" tag unchanged.

### Rumours (I)

`wouldKnow`: own 3; a starting rumour's `tellerIds` 2; faction mate 1; after
day 2 anyone tagged `gossip` or of the source's household (same home, or a
household relation either way) 1. News: own 5, mate or gossip (tag
`gossip` added to the gossip tags) 4. One fresh rumour a turn, as before.

## What the player sees

- Live: people act like they know who the player is and what they want
  (the creditor is no stranger), the story holds across chronicle cuts, the
  clock and the date match the scene, a phone carried is never "not
  carried", fewer wipe-and-rewrites (soft problems no longer need one once
  transport switches to `check.hard`), and a made-up name gets rewritten.
- Mock: a playable demo (concrete answers, voices, news, purchases that
  make sense, a drink that is not an item).

## Measured

- Cached system blocks (words x 1.4): casual about 12,490 tokens (style
  1,174 words, town 1,901, cast 5,844), literary about 11,570. Budget in
  `tests/api.test.cjs` raised from 12,000 to 13,000.
- Playtest (15 inputs): narrator packet avg 7,051 chars (max 10,161; was
  5,189 / 7,559), parser 11,985 (was 10,980), bookkeeper 6,274 (was 5,459);
  system prompts parser 3,546 chars (was 1,820), bookkeeper 2,932 (was
  1,195). Cost per ordinary turn at Opus + Sonnet: $0.035 without thinking,
  $0.041 with ~150 thinking tokens (was $0.028 / $0.035).

## Existing tests changed (behaviour changed by design)

- `api.test.cjs`: record_changes 45 properties and 10 nested objects; the
  cached-block budget 13,000; the narrator packet starts with STORY SO FAR
  and the clock line has the date; the CARRYING regex allows a derived list;
  the chronicle system prompt text.
- `pipeline.test.cjs`: the packet labels (date in the clock line, STORY SO FAR
  first); the hidden-field check (J): secrets and unfired seeds never, goals
  only as the wants of people present; clock lines found by " · Location: "
  rather than line 0, with the date; the parser's TIME line; the rewrite note
  leads with the hard problem; WHAT PEOPLE KNOW's packet half; CARRYING
  derived.
- `state.test.cjs`: the literary guide is SPEC + GOOD_TURN; the casual
  examples are six to eight in packet format; the PLAYER line has the goal and
  flaw.
- `upgrade.test.cjs`: the clock line with the date, found by " · Location: ".
- `world.test.cjs`: STORY SO FAR up to 400 words with whole stamped entries;
  the mock chronicle starts with its day stamp and ends with "Open:".
- `shell.test.cjs`: the People card shows the mock's memory in the
  MEMORY_RULES form ("Remembers: insulted me, day 1").
- `playtest.test.cjs`: narrator packet limit 8,000 -> 12,000 chars.
- `validate-town.cjs` (content's file; seam): section 8 checks the casual
  examples by their new rules (6 to 8, 60 words at most, context lines in
  the packet's field format, the eight cases covered) and the literary ones
  as before.
- `world.test.cjs` and `playtest.test.cjs` still assert that no goal is in the
  narrator packet with the exact case; they pass because `wants` lowercases
  the first letter. They were left alone; the pipeline test carries the new
  rule.

## Needs from others (seams)

- **transport**: rewrite only when `Style.check(...).hard`; log the soft
  problems; pass `packet: ctx.packet` to Style.check (optional: it falls back
  to the packet just built) and `{ draft }` to `regenerationNote` for an
  edit-style rewrite; `MODE: epilogue` needs `zoom` in the check and
  `ctx.mode = 'epilogue'`; `walkFirst` must honour `moveWhen: 'after'` (today
  any destination on a non-move action walks first, so "ask her about Wade,
  then walk to the bridge" talks at the bridge); `aboutIds` are never
  targets (checkAndCreate never sees them); resolve `gamble` (stake in
  `summary`, "bets $N at cards"); set `ctx.revealSecretFor`; pass
  `ctx.action.timeCost` (it is there today). The compressIfDue comment still
  says STORY SO FAR is 150 words.
- **engine-state**: add `npcFates`, `memoriesSettled`, `obligationsSettled` to
  `RECORD_KEYS` (the mock sends them only then); keep `normaliseSeed`
  reading flat `triggerType`/`triggerValue` and defaulting `cause` (the
  schema now sends that shape); stamp journal entries with `day` and `phase`
  (EARLIER reads them; after a chronicle cut a journal line otherwise says
  "Turn N"); `metTurn`; `State.weekday`, `State.dateLine`, `State.news`,
  `State.obligations`, `State.isClosed` are read defensively.
- **engine-world**: add `gamble` to `ACTION_TYPES` (Api.PARSE_TYPES adds it
  until then).
- **content**: `tellerIds` on rumours and the `gossip` tag (Gerald, Pearl,
  Nadine); goods `kind` (the mock reads it, else guesses from the name).
- **ui**: memories in the MEMORY_RULES form read "insulted me" on the People
  card.

## Not done, and why

- A LONG AGO paragraph merging the oldest chronicle entries (REVIEW 3.9):
  needs a merge step in compressIfDue (transport). STORY SO FAR drops the
  oldest whole entries past 400 words instead.
- The "scribe" second structured call (REVIEW 3.9): lifecycle, transport.
- First-launch demo choice and the mock toggle (REVIEW 3.10): ui/transport.

## README / BUILD_PLAN text to fold in

- README, Costs: cached blocks about 12,500 tokens (casual), about $0.035 a
  turn warm without thinking, about $0.041 with light thinking; the narrator
  packet now carries the story (EARLIER, LOOSE ENDS, OPEN, TOWN NEWS,
  wants).
- BUILD_PLAN, Direction changes: "The narrator knows the story (wave 1)":
  the packet order and lines above; secrets only through revealSecretFor;
  hard and soft style problems; invented names caught in code; eight casual
  examples in packet format; parser rubric with LAST TURN, moveWhen,
  aboutIds and gamble; bookkeeper rubric and three fields (45 properties,
  probe owed); rumours spread through tellers, gossips and households.

## Integration (after the six merges)

- `gamble` is in the engine's `ACTION_TYPES`; `Api.PARSE_TYPES` is a copy.
- NOT PRESENT with reason `not_found`: "<thing> (looked for and not found:
  the search turns up nothing like it, and the player does not get it)".
- DESTINATION names why a place is shut: "(closed on Sundays: ...)", "(the
  player is not welcome there until day N: ...)".
- New line after MOVED: `THEN: once this is done the player walks on to
  <place>...` for `moveWhen: 'after'`; the bookkeeper's ALREADY APPLIED says
  the engine makes the walk.
- The rewrite note is built from all the problems (hard ones lead, soft ones
  "If you can, also fix").
- The mock's Say reply answers in the person's own words before it passes on
  a rumour (the rumour takes the greeting's place).

## Wave 2 (the QA playtest and the second review)

Region: the Style module and the mock provider. Tests:
`tests/prompts-fixes.test.cjs` (three new tests).

### Style: brands are not invented people (review item 7)

- `NAME_ALLOW` gains the brands and regional words a narrator reaches for
  (Skoal, Copenhagen, Bic, Zippo, Sprite, Gatorade, Narcan, Wranglers,
  Carhartt, Evinrude, Kubota, Hardee's, Sonic, Kroger, Delta, Ozarks, Dixie,
  Mason, Saints, Razorbacks, Talladega, Opry ...), and `BRAND_PHRASES` the
  ones of two or more words, known only whole ("Mountain Dew", "Dr Pepper",
  "John Deere", "Ole Miss", "Piggly Wiggly", "Dollar General", "Jack
  Daniel's", "Moon Pie", "Crimson Tide", "Bass Pro" ...). "Dr. Pepper"
  reads as "Dr Pepper". Brands that are also first names (Wendy, Winston,
  Harley) stay out, so "Wendy says" is still caught.
- `Style.nameHits(text)` (exported, like `unknownNames`) gives every unknown
  capitalised word with `marked`: true when something marks it as a person
  or a place, else false. Marks: a title or kin word before it ("Miss
  Earline", "his cousin Darnell"), a place or person word before it, with
  or without "the" ("at the Shack", "to Earl", "ask Bobby", "hey, Bobby"), a
  possessive ("Earl's place"), a speech or gesture verb after it ("Bobby
  nods", "Hux says"), or another unknown capitalised word beside it ("Earl
  Hux", "Tri-State Gas"). A sentence start is still an ordinary word unless
  an unknown capitalised word follows it; ordinary sentence openers ("The",
  "His", "Somebody") never count as the unknown word beside one, so "The
  Shack is closed" is one lone word.
- `Style.check`: marked words are the hard "names someone or somewhere that
  does not exist" (a rewrite); lone ones a soft "capitalises a word the
  town does not have (fine for a brand or a thing, not for a person or a
  place)" (logged, kept). The rewrite note's NAME_FIX rides only on a hard
  one.

### Mock parser (demo only)

- Walks name places, never the people in their names. `mockPlace` finds the
  longest of every name, map label and other name of a place in town,
  found or not (a home nobody has told the player about is still that
  home), a business by its possessive ("Pittman's", "Byrd's"), a home by
  the possessive of someone who lives there ("Dewayne's house", "Royce's
  place", "Dewayne's" at the end of the words), else a kind of place; the
  words of the place it found (and an owner's possessive before them:
  "Hollis's pawn shop") are blanked before anyone is looked for. So "I walk
  to Pittman's" goes to the station (not "Royce Pittman is not here"), "I
  walk to Sturdivant House" does not ask for Vada, and "I walk to Dewayne's
  house" parses as a move to the undiscovered Mangum House, which the
  engine answers with "You don't know where that is yet. Ask around."
  (nothing spent). "back to" is a walk.
- Walking to where the player already is: a look (instant), not "You look
  for the way there and do not find it".
- "I watch who comes and goes" (watch, observe, keep an eye on): a look that
  takes a short, never a move.
- Names: a person is named by their full name or their first name, never by
  the family name alone (`personNames`, `surnameOnly`; a title before it,
  "Mrs. Pittman", still counts): `/fact Dewayne Mangum owes me fifty
  dollars` links Dewayne only, not Mavis Mangum.
- Say mode with nobody to hear a plea: talk, no Charm roll (the parser half
  of B17; the engine's `resolve` still rolls a social action with no target
  present).

### Mock narration (demo only)

- `MOCK_TIER`: a roll without a complication (the card game's) says "it
  works, but not all the way" or "it does not work", never "null" (B16).
- The card game as the engine dealt it (`ctx.gamble`): no game and why ("You
  don't have a dollar to put up, so there is no game for you tonight.",
  nobody dealing, no game here), or "At Curtis Pruett's table, you lose
  $20." (on a Friday with Curtis dealing, "his Friday game at the back
  table"), and the cheating throw-out.
- A walk to a place the player is barred from: "but you are not welcome
  there until day N" (from `destination.why`); a place shut for the day:
  "but it is shut on Sundays".
- Say mode: the answer (who answers first and what they say, and a rumour
  passed on) comes before anyone arriving or leaving and is never the line
  cut; the greeting and the others' reaction only when there is room; four
  lines in Say mode (three otherwise) less the due events.
- Due events are told to the player: `secondPerson` turns the player's name
  into "you" and "your" ("walks up to you, reads your name"), puts a
  subject "you" with the plain verb ("the way you stand", "you are") and
  leaves an object alone ("watches you shuffle").
- A due event too long for the limit shrinks to its first sentence (the
  council's count is in it) before its first clause.
- The chronicle cuts at a whole word with "…" and keeps whole items: a
  quote is never cut mid-word or left open (no more "who sold Ambe" in
  STORY SO FAR).

### Needs from others

- Two tests outside the prompts region compare a due event's text with the
  mock narration word for word (`acceptance.test.cjs` [5], `world.test.cjs`
  "the debt loose end ... is in the narration"). Content wrote the loose-end
  seeds in the second person ("{npc} walks up to you, reads your name"), so
  those stay verbatim; a due event written with the player's name (a
  background hook, a template, an engine line) is now told as "you" by the
  mock.
- B17's engine half: `Pipeline.resolve` rolls no social action whose target
  is not present.

## Integration (wave 2)

- `mockRewrite` keeps `State.MEMORY_MAX` per person (it kept six), the cap
  the real call is given.
- The two hooks that called the player "they" name the player instead, so
  `secondPerson` tells them as "you" ("asks where you served").
- The mock reads what wave 2's engine decides before the narration: the
  third hit's knockdown (`ctx.knockedDown`: "goes down hard and stays
  down"), the arrest (`ctx.arrest.plan`, told to "you"), a card-game
  accusation without a marked deck (`ctx.gamble.accused`: out for the
  night) and a bar shut for the day ("The place is shut today, so there is
  no game."). `tests/wave2-fixes.test.cjs` checks the first three in the
  narration.

## Wave 3

Review bug 4 (Style) and the second playtest's demo items. Tests:
`tests/wave3-fixes.test.cjs`.

### Style.nameHits

- Unknown capitalised words side by side are one name; what marks one marks
  them all ("Earl Hux nods", "at Earl Hux's").
- At a sentence start a lone word is a name when a speech or gesture verb
  follows it ("Darnell says the bridge is out", "Bobby waves you over"), or
  when it is two words or more ("Earl Hux leans on the counter").
- Within a sentence two unknown words together are not a mark of their own
  ("He dips Red Seal", "The radio plays Conway Twitty": soft); a title or
  kin word, a place word, a possessive or a speech verb marks them.
- "says", "said", "mention(s/ed)" right before a word mark it ("She says
  Darnell owes her money"); two back they do not ("says the Feds").

### The mock (demo only)

- Searches: "I search the shelves for a flashlight" is a search; a search
  for a thing not lying here rolls Wits.
- Picking up: every thing lying here the words name ("the fishing rod and
  the tackle box"), a longer name over one inside it ("Rod and reel").
- A given thing: the full name, else the one sharing the most words with the
  line, and on a tie the thing an errand is owed ("the letter to Jodie" is
  the Letter for Jodie Strayhorn, not the Reference letter).
- A walk to a place out of town is parsed as one; the engine refuses it.
- Attacks are parsed at normal (the engine sets the target's threat).
- The narration tells what the action came to (a knockdown, a card loss)
  before anyone arriving or leaving, so the line budget never cuts it.
- Money toward a debt is a payment: no "gave me" memory or warmth; paid in
  full, "paid me back" only when the obligation's `onMet` has no memory for
  them. The mock bookkeeper meets a loose end's person talked to who is
  known but not yet met.
- `freshNews` reads `State.news` (its function fallback was dead).

## Wave 4

The third code review's bugs 2 and 3 and the invented-name middle ground
(Style), and the third playtest's demo items D1 to D5. Tests:
`tests/wave4-fixes.test.cjs`.

### Style.nameHits

- A known name is blanked with a mark of what it was (a person's first name,
  a surname, a whole name or another part of one, anything else), never with
  spaces: the words either side of it are not side by side. "Slowly Royce
  nods", "Finally Loretta Gaddis nods" and "Okay Royce says" are no invented
  name (they were a paid rewrite in wave 3). Common sentence adverbs and
  interjections ("Okay", "Finally", "Slowly", "Meanwhile", "Sorry") are
  `COMMON`.
- An unknown word before a person's surname or after their first name is
  part of a name: "Bobby Gaddis nods", "You see Loretta Smith" (hard).
- Within a sentence, two unknown words or more are a name (hard) unless what
  comes before makes them a thing: an article, a possessive, a number or
  "of" (`THING_BEFORE`, also two back across a plain word: "an old Johnny
  Cash song"), a verb done to a thing (`THING_VERBS`: dips, plays, drinks,
  drives, smokes, wears, watches ...), or they follow another run in a list
  ("plays Conway Twitty and Merle Haggard"). A title, a place word, "with",
  a person's "says", a possessive or a speech verb always marks them: "You
  notice Earl Hux at the bar", "Sitting at the end of the bar is Earl Hux",
  "The only other customer is Bobby Lee Tate", "He drinks with Earl Hux",
  "He lives on Willow Street" are hard.
- "says", "said" and "mention(s/ed)" mark the word after them only when a
  person says it (`saidByPerson`: a cast name, a pronoun, a person word such
  as "the bartender", an unknown name, or a line of dialogue: '"Fine," says
  Darnell'). "The sign on the door says Closed", "The card says Happy
  Birthday", "The radio said Tornado Watch" are soft.
- `NAME_ALLOW` has a few more countries ("Made in China").

### The mock (demo only)

- D1: a split at "and" inside the name of the place the whole line names
  is no compound ("I head to Pittman's Gas and Service." is one walk, with
  DESTINATION).
- D2: a haircut (a trim, a shave) is had at the trailer park, where the
  hairdresser works, not at the station.
- D3: "I give Royce $100" with less on you: "You reach for $100 and come
  up short."
- D4: a thing an action needs is only the verb (stab, shoot, drive) or the
  noun not looked for, bought, sold or asked about, and a weapon by
  `Town.weaponOf` ("I search the bays for a grease gun" needs no gun).
- D5: "the Mangum place" or "the Gentry house" names a family's home; one
  not found yet is refused ("You don't know where that is yet"), nothing
  spent.
- Card game: "takes your deck and throws you out", and "You end up outside
  on Front Street."

## Integration (wave 4)

- `COMMON` gains the function words "Neither", "Either", "None",
  "Whoever", "Whatever", "Whichever", "Wherever" and "Whenever": "Neither
  says a word." and "Whoever calls, she answers." were a hard invented name
  (a paid rewrite) since wave 3. "Silence answers." and "Bartender nods."
  stay hard, as before.
