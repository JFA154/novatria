# Lockett's Ferry: maintaining the game

For whoever changes the game or looks after a copy of it. Players want the
[README](../README.md) and the [manual](MANUAL.md). Future Claude Code
sessions start at [CLAUDE.md](../CLAUDE.md); [docs/README.md](README.md)
says which documents are current.

- [Saves, export and import](#saves-export-and-import)
- [Updating an older game](#updating-an-older-game)
- [What a turn costs](#what-a-turn-costs)
- [Editing the town](#editing-the-town)
- [Editing the game](#editing-the-game)
- [Running the tests](#running-the-tests)
- [Verified against the live API](#verified-against-the-live-api)
- [Deliberate deviations from SPEC.md](#deliberate-deviations-from-specmd)

## Saves, export and import

- **Autosave** after every turn, in this browser's `localStorage`.
  **Continue** on the title screen picks it up, with a line under it saying
  who, which day and where ("Tomas Reed · Day 3 · The Low Water"). While
  there is an autosave, Continue is the first button and New game comes
  after it. With nothing to continue (a first visit), Continue is not shown.
- **Undo history** (wave 16): the last 20 steps of the game in the autosave
  are kept in this browser's IndexedDB as well (one record a step, and each
  version of the town once, so a turn writes only its own step), written a moment after each step and when the page
  is hidden, so a phone that reloads a tab left in the background can still
  `/undo` after **Continue**. Only the game in the autosave has one: a new
  game, a slot, an import or the previous autosave start it empty. `/redo`
  is never kept. A game kept from an older build keeps its undo history on
  Continue.
- **Three named slots** in Save / Load (laptop: Save in the top bar; phone:
  Menu → Save / Load), or with `/save <name>`. A slot saved with its name
  left blank is named after you and the day ("Tomas Reed, Day 3").
- **Nothing is replaced without a copy.** Before the autosave is written with
  a different game, the old one is kept as the previous autosave: Save / Load
  lists it as "Previous autosave" with **Restore previous** (the two
  swap, so nothing is lost). New game, Load, Import and a slot's Update over
  an autosave that is in no slot ask first ("Replace the autosave?", with
  Keep it and Go ahead). A loaded game is drawn before anything is saved: if
  it cannot be shown, the game that was open comes back and nothing of the
  new one is written.
- **Two tabs.** When another tab writes the autosave, this one goes read only,
  with the bar "This game is open in another tab, so this tab is read-only."
  Nothing there plays a turn or changes the game (the box, Send, Wait, the ⋯
  list, Undo, Go there, Edit and the pronoun buttons are off; trying says once
  "This game is open in another tab. Press "Play here instead" to play it in
  this one."). **Play here instead** first loads the game as the other tab
  saved it, then plays it here, which makes the other tab the read-only one;
  an autosave it cannot read is kept as the previous autosave, and the banner
  says so. Loading or starting a game in a read-only tab plays it there.
- **Export current game** downloads a `.json` file named for the town, you
  and the day (`locketts-ferry-tomas-reed-day-3.json`), holding the full state
  and the town data, never the API key; Save / Load says when you last did
  ("Last exported: 3 days ago", or never). **Import from file** loads one on
  any device, so a game moves between laptop and phone. Saves carry their own
  copy of the town, so editing the town later does not break old saves. In
  this browser, saves of the same town share one stored copy of it; an
  exported file always carries the town in full.
- **Import checks.** A file over 5 MB is refused before it is read. A save
  whose shape is wrong is refused with the first problem found, and nothing
  changes: a record without its id or name, a list that is not a list, or a
  string longer than the game ever writes one (a history over 400 characters,
  a narration over 6,000, anything else over 4,000, the town's own history or
  setting over 8,000).
- **A damaged autosave** is explained on the title screen with **Download
  it**, which saves the stored text exactly as it is, as
  `damaged-autosave.json`.
- **A save from a newer build** of the game says so under Continue on the
  title screen and loads with a one-line warning ("Saved by a newer version;
  it may not play right here.") and is never updated.
- The game asks the browser once to keep its storage. If the browser refuses
  storage (private mode, full disk), a warning banner appears. Export to keep
  your game.
- **Out of room.** If the browser's storage is full, the game plays on and
  the feed says once "This device is out of room for saves; export your
  game." The previous autosave is given up first to keep the autosave.
- **Delete all game data on this device** (Settings, This device) removes
  everything the game keeps in this browser: every `novatria.*` entry in
  localStorage and sessionStorage (settings, the key, the autosave and
  previous autosave, the slots, a hand left on the table) and the IndexedDB
  `novatria` database (the undo history). Other pages' storage on the same
  origin is left alone.

## Updating an older game

The rules for what people remember changed on 28 Oct 2026. People now
remember only what they would hold against you or thank you for later, as a
short line in their own words ("flirted with me", "told me to fuck off",
"lied about car trouble to get Dewayne outside"). Games saved before then hold
the old kind: long play-by-play accounts of whole scenes. Later rule changes
added steps of their own, listed in the README's table.

The player's side (Update this game, Re-read, and the table of steps by
rules version) is in the README's
[Updating an older game](../README.md#updating-an-older-game); the table
stays there because `tests/wave31-town-ties.test.cjs` pins its version 10
row in README.md. The rest is here.

- **Cost:** about one call to the parser model ($0.005 for two people with
  eight memories, live on 28 Oct 2026); more than about 40 memories go in a
  few calls. The offline demo rewrites by a fixed rule and makes no calls.
- **Step by step.** Each step stamps the game's rules version as it completes.
  If a step fails or is refused (no key, a network error, a refusal), only
  that step is taken back and the feed says which; the details are in the
  Debug tab. The whole update is one `/undo` step.

- **An arc** (added 30 Oct 2026, rules version 8). Games from before this
  change have no calendar, council meeting, ending, ledger of what you owe or
  town news. The update gives the game's copy of the town the calendar, the
  town events and the ending, its rumours their tellers and threads, and its
  threads their rewards, filling in only what is missing (a town of your own
  is never overwritten), and starts the news, obligations, bans and events
  lists. A loose end whose moment has not come yet gets the obligation its
  option now carries (an undelivered letter goes into your pocket); one that
  has come gets nothing, since a debt invented now would contradict the story.
  A grudge or favour still to come gets its template's effects, and a seed
  still to come the words the town and its loose ends now give it. It also
  gives
  the town's plans as the town now writes them (each clock's ending, what it
  checks first and what happens instead), so an older game's council does not
  vote before its meeting; a game updated earlier gets them from a Re-read.
  The feed says, for example, "2 loose ends still to come now carry
  obligations. 14 of the town's plans now check the story before they
  happen." No call.

A ban saved by an earlier build ends a day earlier than it did: since 30 Oct
2026 "until day N" means welcome again on day N.

What people hold (1 Nov 2026) needs no step: an older game loads with nobody
holding anything over anyone and no secret shown yet; the romance list and
what its people hold (how heavy a secret is, its words, what they can raise)
come from the built-in town wherever the game's copy has none; a secret loose
end tied before then holds nothing over you beyond the blackmail it already
carries (version 9 gives it its record), and that blackmail, met, is silence
paid for.

**People who remember** (version 9) is worked out from what the game already
holds, with no call: the game's own lines ("knocked me down in a fight at the
Low Water", "let the four hundred go past due, so I took the phone") are
recognised as what they were before any line is read by its words, so a
repo man's own line is never your theft. The feed says what it did ("People
now remember why: 5 people's memories now carry what they did to how they
feel. 1 person has something on you. The council now weighs trust."), and a
game already up to date says "People already remember why." **What does not
reach an older game:** a secret shown before the update (nobody holds it
over anyone), jealousy and fear from before it, trust built by confidences
before it (beyond the trust worked out from how much they liked you, and the
secret anyone would have told you), and what you asked people before it (so
a lie of yours the bookkeeper catches later needs one told after the update,
or a claim on record). **Rewrite memories in the short form first**
(Settings → Game, off by default) makes Update and Re-read run the memory
rewrite (version 2's step, a call to the parser model, cents for the whole
cast) before version 9, so very long old lines become short ones first.

**A town that talks** (version 10) makes the ties a new game starts with, for
the people in town: both sides of every relation, the town's own ties (its
secrets among them) and the people of one faction; a tie the game already
has is never changed. Nothing that already happened is spread again: a fight
from before the update reaches nobody new, and until the update nothing
travels at all. The feed says "People now feel for each other: 121 ties
between 40 people. What you do from now on reaches the people close to them."
(a game already up to date: "People already feel for each other."). No call.

**A kiss lands on the one kissed** (3 Nov 2026) needs no step and changes no
version: from the next turn a flirt finds its target as People says. A kiss
already in an older game's story before then is not read again, so someone
who kissed you back then may show no interest on their card; set
Spark (then "Interested") on the person's card (Edit) to where the story is.

**Anyone can be won over, some the hard way** (3 Nov 2026) needs no step and
changes no version: an older game's town copy reads its romance list as
tuning from the next turn (an old `open: false` no longer shuts anyone out,
an old `faithful: true` is very hard), every adult has Interested on the
Edit form, and from then on a flirt rolls charm as People says.

**Romance is its own track** (3 Nov 2026) needs no step and changes no
version: an older game loads with romance 0 for everyone and everything
else as it was. Someone who was "sweet on you" by the old reading (a spark
and real liking) may read "wants you" or "has noticed you" until romance
grows; set Romance on their card (Edit) to where the story is.

Behind the scenes a save carries `state.meta.rulesVersion` (10 now; a save
without it reads as 1). The steps that bring a game up to date are listed in
`Upgrade.MIGRATIONS` in `index.html`.

The bookkeeper's reply format gained three fields with this change (people
hurt, arrested, gone or dead; memories a turn settled; obligations met). Since
wave 28 its people are one field, `socialEvents` (one line each, "npc_id
event: the memory"), in place of the three it had for attitudes, memories and
what a turn settled: 34 properties and 3 enums (41 and 4 before, the shape
known to pass the API's grammar limit), with an 11-field core to fall back
on; the parser's reply is 14 fields with `romantic`. Neither has been sent to
the live API yet (see Verified against the live API).

Every older rules version, from a game saved before rules versions existed
(read as 1) up to 9, is tested: a real save from that version's last build
is imported, updated in mock mode, and must keep the player's name, day,
money, every person and how much each likes the player. The saves are
frozen in `tests/fixtures/saves/` (see Running the tests).

**A rules change** (anything that changes what an older save means) bumps
`RULES_VERSION` in `src/54-state.js`, adds a step to `Upgrade.MIGRATIONS`
(`src/61-upgrade.js`), adds the previous version's last commit to `BUILDS`
in `tests/fixtures/make-saves.cjs` and runs it to freeze that version's
save (`tests/upgrade-fixtures.test.cjs` fails until you do), and adds a
row to the README's table.

## What a turn costs

The defaults (the Standard preset) are set for the best play-through, not the
cheapest. Prices are those in [`docs/API_NOTES.md`](API_NOTES.md): Opus 5.5 at $4 / $20 per
million input / output tokens, Sonnet 5.5 at $2 / $10, both $0.20 for a
cache read; Haiku 5.5 at $0.10 / $0.50.

Every narration carries three cached system blocks: the style guide (since
wave 28 with the one-line fade-to-black rule, about 18 tokens), the town and
the cast. Together they are about 12,600 tokens by the api suite's estimate
of 1.4 tokens a word (about 14,700 at 3.5 characters a token); the suite
fails over 14,000, and its PASS line prints each block's measure. The limit
is a cost choice, not an API limit: a cache read is $0.20 per million tokens
on Opus 5.5 and Sonnet 5.5, so every 1,000 cached tokens cost 0.02 cents a
narration, and the hourly cache write (twice the input price) costs 0.8
cents more per 1,000 on Opus 5.5 and 0.4 cents on Sonnet 5.5. Using all of
today's room (about 1,400 tokens) would add about 0.03 cents a narration and
about 1.1 cents (Opus) or 0.6 cents (Sonnet) to each write. Read from the
cache the three blocks cost about 0.3 cents a narration; writing them costs
twice the input price on Opus, about 10 to 12 cents.

**Warm and cold.** The cache is kept for an hour (`ttl: '1h'`), so the write
(about 25 times a read) is paid once a session and again only after an hour
away, not after every five-minute pause; coming back after more than 50
minutes, the game warms the cache with a one-token call while your action is
being read, so the narration finds it warm.

Since wave 41 the parser's and the bookkeeper's system prompts (about 1,200
and 1,340 tokens) are cached too, with the same one-hour `cache_control`. A
warm turn reads them for about 0.05 cents instead of paying about 0.5 cents,
after a write of about 1 cent once a session. The Debug tab's API block
shows cache reads and writes by role ("cache by role"). A model with no
known price says "no price known for <model>: cost not counted" in Settings
and Debug.

A chip in the top bar shows what this game has cost so far ("$1.23"); tap it
for Spending. The total is kept in the save, an export and an import, and
/undo never takes it back, nor does a failed turn. Not shown in the offline
demo. With a pause set, the turn that reaches it says so once, and the next
paid turn asks "You have spent $10.00 on this game. Keep going?" (Keep going
/ Stop; Stop keeps your words in the box).

These figures come from the playtest suite's cost test, which measures the
packets the game builds over a 15-input mock session and prices them at the
default models (tokens estimated at 3.5 characters each, output assumed):

| Call | Input per turn | Output assumed |
|---|---|---|
| Parser | ~5,500 tokens (packet ~12,000 characters, system prompt 4,200, schema 3,000) | ~90 |
| Narrator | ~2,000 tokens of packet (7,100 characters on average, at most 9,500) plus the cached blocks | ~120 |
| Bookkeeper | ~4,700 tokens (packet ~6,900 characters, system prompt 4,700 with the events' rubric, schema 4,900) | ~180 |
| Chronicle (once 16 turns have piled up; it keeps the newest 6) | ~1,100 tokens | ~110 |

- A warm turn is about **3.7 cents** with no thinking and about 4.3 cents with
  some 150 thinking tokens a call; at medium effort the models often think
  longer, so expect 4 to 5 cents. A hundred warm turns are about $3.65 to
  $4.25 plus the cache writes.
- The first narration of a session, or the first after an hour away, adds
  the cache write: about 12 cents.
- `/look`, `/rest`, `/wait` and `/skip` call only the narrator (plus the
  bookkeeper when they tell something due, such as the morning's visitor
  after a sleep: one more call then): about 1.4 to 1.7 cents.
- A narration with a hard style problem (more than 15 words over the length
  limit, a past invented on day 1, "What do you do?" outside dialogue, a
  person or place the town does not have) is rewritten once, one more narrator
  call. Softer problems (a simile, a banned phrase, a few words over, a
  capitalised word nothing marks as a name, such as a brand) never cause a
  rewrite on their own. The first draft stays on screen, dimmed, until the
  rewrite is in (and stays if it fails).
- Thrifty is about 1 cent a turn; Best costs more for the extra thinking.
- None of this was measured against the live API this round. The Debug tab
  shows the real token counts and cost for the turn and the session, a
  retried call included, and Settings shows the session's total.

**When a call fails or stalls.** A reply that stops arriving gives up after
45 seconds with nothing new (two minutes in all for the parser and the
bookkeeper). A busy or failing API (429, 500, 502, 503, 504, 529, a network
error, a stream cut short or with a garbled line) is tried once more. An
overloaded API (529, 503) is tried twice more, the second wait longer, with
a little jitter. The wait is what the API asks for in `retry-after` (up to a
minute) or 1.5 seconds, counted down above the input ("Busy; trying again in
23 s"), and Stop cancels it and keeps your words. A 404 for a retired model
looks up the current models and names one of the same family. A reply cut off by its length limit
is asked for again with twice the room and is never saved half finished.
Either way, if the turn fails, nothing changes and your words go back in the
box.

## Editing the town

The whole town lives in `src/30-content.js` (built into `index.html`; see
Editing the game) between the markers `// ===== BEGIN CONTENT =====` and
`// ===== END CONTENT =====`: `TOWN_DATA`
(places, people, factions and their clocks, threads, seeds, rumours, the
calendar, town events and the ending), `TABLES` (random tables),
`BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`, `GRUDGE_TEMPLATES`, `FAVOUR_TEMPLATES`
and `GOAL_PRESETS`. It is plain data with double-quoted strings. The shape is
in [`docs/BUILD_PLAN.md`](BUILD_PLAN.md) under "Shared data contract". The fields that make
the town move:

- `TOWN_DATA.calendar = { season, startDate }` (day 1 is that date); a
  place's `closedOn: ["Sunday"]`; a person's `awayOn: { days, phases, where }`
  (school days).
- Faction clocks of 4 to 10 `segments`, and on a clock's `onComplete`
  and on a seed, `requires: { npcFree, npcAt, flagsSet, flagsUnset,
  obligationOpen }` with an `alt: { text, effects }` for when it does not
  hold. Seeds also take `effects` (applied when they fire), `notBeforeDay`
  and a list of places or people as a trigger's value (any of them).
- Effect ops beyond the original thirteen: `playerGold`, `playerHp`,
  `giveItem`, `takeItem`, `addCondition`, `banFrom`, `playerPrice`,
  `addMemory`, `clockAdjust`, `threadUpdate`, `addObligation`,
  `settleObligation` and `addNews`. Placeholders (`{npc}`, `{npcId}`,
  `{playerName}`) only in loose ends and templates. Wave 29 adds
  `owedSettle` (`{ npcId, dir? }`: a favour owed cleared, either way) and
  `leverageSet` (`{ id, status?, aware?, playerKnows?, knownBy?, tell?,
  use? }`: a leverage record's change; `id` may be `{leverageId}` in a
  template).
- `TOWN_DATA.events` (the council meeting: a day, phase, place, `attendees`,
  and `branches` of `{ when, text, effects }` with a `default`; the first
  branch whose `when` holds wins) and `TOWN_DATA.epilogue` (`onDay`,
  `orFlagsSet`, the same branches).
- Rumours: `tellerIds` (at least two people besides the source who can tell
  it), `threadId`, `factionId`. Threads: `reward` (the stat it raises).
- `LOOSE_ENDS[kind].obligation` (the kind's default) and `obligations` (one
  per option, lined up with `options`): `{ kind, amount, dueOffset, text,
  itemName, onStart, onMiss, onMet }`.
- `BACKGROUNDS[].hook = { npcId, text, dayOffset, trigger }`, the first lead
  for a background.
- Grudge and favour templates: `effects`, `public`, `forTags` and
  `notForTags` (who can hold it).
- Goods: `kind` (`good`, `service`, `drink` or `food`); only goods are
  carried. Complications: objects `{ text, tiers, kinds, needsPerson,
  notDay1, effects }`.
- How people take things (wave 27): the `socialEvent` op (`{ npcId, event,
  text, weight?, act?, d?, scale?, secondhand?, public? }`, an event of the
  relationship table, `d` overriding the row within +/-50), which loose
  ends' obligations and the grudge templates use for a word kept or broken
  and what a third party hears. A person's `protector` (whom they go to when
  you frighten or hurt them: an id, a list, `"nobody"`, or `{ npcId, hidden:
  true }` for a tie the town does not know); `TOWN_DATA.policeHead` (whom a
  report to the police goes to); a seed's `danger: true` (someone in trouble
  the player can step in on: the people its words name after the first, the
  one doing it; it needs a location trigger and `requires.npcFree` for
  everyone it names); grudge templates of kind `report`, with `to`
  (`police` or `family`), `about` (`threat` or `violence`), a 1 to 2 day
  `dayOffset` and `{protector}` / `{protectorId}`.
- What people hold (wave 29): `TOWN_DATA.romance` (wave 34: how easily each
  adult is won over, `{ npcId, sparkRate, opensAt: { knows }, difficulty }`:
  `sparkRate` 0.1 to 2 scales a welcome flirt's spark (and, wave 35, what
  grows romance, unless an optional `romanceRate` 0.1 to 2 says otherwise), `opensAt.knows` is
  how well they must know the player before a flirt is taken as one,
  `difficulty` (`easy`, `normal`, `hard`, `very_hard`) is the charm roll a
  flirt makes with them; adults only. Every adult can be interested whether
  listed or not; anyone not listed is rate 0.5, opens at knows 10, hard.
  Add an entry for anyone to make them easier or harder. `open` is gone;
  `faithful: true` still reads as `very_hard`), and on a person
  `secretWeight` (1 to 3: how heavy their secret is to hold over them),
  `leverageKeys` (the words that show it in a narration, two needed),
  `mattersTo` (whom it would be told to), `whenTold` (`{ memory, crime,
  inquiry, news }`: what the police do when it is told them), `canRaise`
  (what they can pay for silence: $100 by default, at most three above 100,
  $0 for anyone under 18) and `mercenary: true` (money counts double with
  them, blackmail half, and they name prices). A true rumour's
  `leverageOver` (the person a hearer holds it over). Grudge templates of
  kind `tell` and `price` (what a holder does with what they hold: `{leverageId}`,
  `{price}`, `{amount}`) and favour templates of kind `ask` (a favour the
  player owes, asked back, by the holder's tags).
- Where people stand (wave 30), in an event's or the ending's `when` and in
  a `requires`: `relAtLeast` and `relBelow`, `{ npcId: { liking, trust,
  fear, knows } }` (liking and trust -100 to 100, fear and knows 0 to 100;
  every track named must hold). The council reads them: Royce tables the vote with
  `relAtLeast: { npc_royce: { trust: 30, knows: 25 } }`, gives the friendly
  face from the back row at `{ liking: 15 }` with `playerAt`, and has second
  thoughts after Carter bought him at `{ trust: 20 }`; the ending's Loretta
  line is `{ liking: 40 }`. `attitudeAtLeast` still works and reads liking.
  Spark is not readable by a condition, and there is no branch on fear.
- How people feel about each other (wave 31): `TOWN_DATA.ties`, `[{ from,
  to, kind?, w, t, hidden?, revealedBy?: { rumours?, flags? }, why? }]`.
  Every relation in the cast is already a tie both ways with its kind's
  liking and trust (`w`, `t`, -100 to 100: a parent toward a child 70/30, a
  child toward a parent 50/40, a husband or wife 50/40, a boss toward an
  employee 20/20, and so on); an entry for two people with a relation sets
  one side's numbers, one for two without names its `kind` (`lover`,
  `enemy`, `payer`, `friend`, `other` or any relation kind). `hidden: true`
  is a tie the town does not know (news travels through it and nobody says
  why), and it needs `revealedBy`: rumour ids that show it when heard, or
  flag names that show it when set (a leverage record whose words name it
  does too). One entry a direction; `why` says it in plain words, naming
  only the cast. A clock's arrest may name its officer: `npcStatus` with
  `by` (someone tagged police; else the police head), whose arrest turns the
  family of the arrested against them.
- Ties that change (wave 32): `TOWN_DATA.secretTies`, `[{ secretOf,
  learnedBy, ties: [{ from, to, w?, t? }], why, seed? }]`: when the player
  tells `learnedBy` what they hold over `secretOf` (who must have a secret),
  each tie listed moves by liking `w` and trust `t` (whole numbers within
  +/-100), known from then on; `why` is the few words the narrator gets
  ("the garage money"); `seed: { effect, dayOffset: [lo, hi] }` is what it
  sets going. One entry a secret and a listener. Effect ops: `tieDelta`
  (`{ fromId, toId, w?, t?, known?, why }`: a change in how one person feels
  about another, `why` 80 characters at most; a clock's completion may carry
  one besides its five) and `propagate` (`{ npcId, event, factor?, via?,
  text? }`: what someone says or does reaches the people tied to them, as if
  the event had been done to them; `via` `now`, `overnight`, `morning` or
  `meet`, else by each tie; `text` what they would remember). Three grudge
  templates (the gossip at the landing, at Wednesday supper and in the
  department) pass the word along their holder's ties this way.

After editing, rebuild and run the content check:

```
node tools/build.cjs
node tests/validate-town.cjs
```

It checks every field and cross-reference. For the cast: unique ids and
names, pronouns that match the look, a real role, relations written on both
sides with matching words, homes, a place in every phase, ages that fit looks
and families, histories, the dead and the people elsewhere. For places:
symmetric exits, homes reachable from the map, details, hours and history,
hours that name a shut day matched by `closedOn`, someone in every public
place. For the moving parts: the calendar, school days for the teacher and
the teenagers, rumours (10 to 20, two tellers each), clock lengths (4 to
10), `requires` and `alt`, events and the ending, every flag a condition
reads set somewhere, every effect op and its fields, obligations, a grudge
and a favour for everyone in town and no beating from the old, the young or
the police, no template that assumes your phone or a vehicle, the
backgrounds' phone and hook, goods' kinds, the goal suggestions and the
narrator's example turns. It runs `tests/mentions.cjs`, so a name, a place
or a crowd the content mentions with no record fails. It lists every problem
it finds and exits 1. After changing the cast, regenerate the roster:

```
node tests/cast-doc.cjs           # rewrites docs/CAST.md from the data
node tests/cast-doc.cjs --check   # exits 1 when docs/CAST.md is out of date (the content suite runs this)
```

A game already in progress keeps the town it started with.

## Editing the game

`index.html` is still the one deliverable: it plays from `file://` and on any
static host with no build. Since wave 50 it is generated from `src/`. To
change the game, edit the files under `src/`, run `node tools/build.cjs`,
and commit both `src/` and `index.html`. Never hand-edit `index.html`.
`tests/build.test.cjs` and CI's `node tools/build.cjs --check` step fail when
the two disagree. The build is a byte-for-byte concatenation with no
transforms: plain Node, no dependencies, and still no `package.json`.

The parts, in order: `00-head.html` (doctype through `<style>`, with the CSP
on line 8 and the first-paint script), `10-styles.css`, `20-markup.html`
(`</style>` through the body markup and the main `<script>` opening with
`'use strict'`), `30-content.js` (BEGIN/END CONTENT markers included; still
checked by `node tests/validate-town.cjs`), `40-helpers.js`, `50-rng.js` …
`66-app.js` (one per module, each starting with its `// ===== Module: X
=====` banner, in banner order: Rng, Dice, Cards, Tables, State, Rel, Town,
World, Style, Api, Mock, Upgrade, Pipeline, Storage, UI, Commands, App),
`90-tail.js` (`window.Game`, boot, end of the outer IIFE), `99-foot.html`. A
new part must be added to `PARTS` in `tools/build.cjs`.

Flags: `--check` builds in memory and exits 1 with a short diff summary
naming the part if `index.html` differs; `--list` prints the parts and their
line counts; `--csp-hash` replaces `script-src 'unsafe-inline'` with the
sha256 hashes of the two inline scripts. It is off by default because with
it on any hand edit to `index.html` is blocked by the page's own CSP (to
turn it on, build with `--csp-hash` and change both CI steps to `--check
--csp-hash`). The tests still read the built `index.html`.

**Each wave** bumps the one `BUILD` line in `src/54-state.js` (`const BUILD
= Object.freeze({ wave: N, date: 'YYYY-MM-DD' });`) and adds CHANGELOG.md's
top entry for the same wave and date; `tests/wave46-head.test.cjs` checks
both. The Literata font is inline in `10-styles.css` (two base64 woff2
faces, with the OFL notice); `manifest.webmanifest`, `icon-192.png` and
`icon-512.png` beside `index.html` are optional extras for a host.

## Running the tests

```
node tests/run.cjs                # everything: the town check, then every tests/*.test.cjs, three at a time
node tests/run.cjs acceptance     # only files whose name contains "acceptance"
node tests/run.cjs -j 1           # one file at a time, output as it comes (the old serial run)
node tests/run.cjs --shard 2/4    # the second of four balanced shares of the files
node tests/run.cjs --list wave4   # which files a set of arguments picks; runs nothing
TEST_FILTER='\[4\]' node tests/acceptance.test.cjs     # tests whose title matches
PLAYTEST_TRANSCRIPT=1 node tests/playtest.test.cjs     # print the 30-turn playtest's story
UI_SHOTS=/some/folder node tests/ui-fixes.test.cjs     # keep the screenshots the UI suite takes there
node tools/build.cjs --check                           # index.html equals a fresh build of src/
node tests/cast-doc.cjs --check                        # docs/CAST.md matches the cast
node tests/eval-classify.cjs --dry                     # the labelled eval's set, offline
ANTHROPIC_API_KEY=… node tests/eval-classify.cjs       # the labelled eval, live (needs a key)
ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs       # the live grammar probe (needs a key)
```

The tests drive the game in headless Chromium with Playwright, in mock mode,
from `file://`, with the network blocked; `tests/static-host.test.cjs` also
serves the folder over http:// from a small local server and plays a game
there, so "any static host" is tested: no CSP violation, autosave, the
IndexedDB undo store and /undo. Playwright is preinstalled in the build
environment. Elsewhere, install it outside this folder (as the CI workflow
does) and point `NODE_PATH` at it, because `tests/constraints.test.cjs`
checks there is no `package.json` here. There is nothing else to install.

On 4 Nov 2026 (wave 51) the suite is 68 test files and 938 tests. `node
tests/run.cjs` runs three test files at a time by default (`-j N` to change
it, `-j 1` for the old one-at-a-time run with output as it comes); the whole
run takes about nine minutes at `-j 3` on a four-CPU machine. Every 60 s it
prints which files are still running, and it ends with each file's time,
slowest first. `--shard i/n` runs the i-th of n balanced shares of the files
(CI runs four shards); `--list` shows which files a set of arguments picks.
The shared helpers live in `tests/helpers.cjs`. The suite has no fixed
waits: it waits on conditions, with generous ceilings.

Older saves are frozen in `tests/fixtures/saves/v<N>.json` (one per older
rules version, played in that version's own build);
`tests/upgrade-fixtures.test.cjs` updates each one. No test needs the git
history, so a shallow clone runs the whole suite. To regenerate a fixture
(this needs the full history), run `node tests/fixtures/make-saves.cjs
[versions]`.

| Feature | Suites (`node tests/run.cjs <name>`) |
|---|---|
| The single-file rules, the byte budget (3,250,000), the CSP, the inline font, the Build line | `constraints`, `wave46-head` |
| `index.html` equals a build of `src/`; the `--check`, `--list` and `--csp-hash` flags | `build` |
| Module order, `Mock` as its own module, shared helpers | `wave47-modules` |
| The twelve acceptance checks of SPEC.md section 14 | `acceptance` |
| A scripted 30+ turn game, pacing, the cost band (1 to 6 cents a warm turn, under 8 with thinking, a cache write under 12) | `playtest` |
| Screens, panels, the feed, the input, Settings | `shell`, `settings`, `ui-fixes`, `wave2-fixes` |
| Phone sizes | `mobile`, `ui-fixes` |
| The first five minutes, Forget key, Delete all game data | `wave44-onboarding` |
| Accessibility | `wave45-a11y` |
| The top bar's progress, the cost chip and the spending pause | `wave43-progress-spend` |
| State, `apply`, undo and redo | `state`, `engine-state-fixes`, `wave16-undo` |
| Saves, the IndexedDB undo store, storage that scales | `shell`, `wave48-storage`, `static-host` |
| The turn pipeline, Do and Say, the seams between modules | `pipeline`, `integration` |
| The real provider against canned replies, retries, timeouts, caching | `api`, `transport-fixes`, `wave41-api` |
| The schemas' size (the grammar limit) | `wave17-grammar` |
| Prompts, packets, style checks, the cached blocks' budget | `prompts-fixes`, `wave42-headroom` |
| The living world: clocks, seeds, sleep, the night | `world`, `engine-world-fixes`, `wave21-night-clock` |
| The map | `map` |
| The cast, the calendar, loose ends, grudges and favours, the council and the ending, `docs/CAST.md` | `content` |
| Meetings kept, narrated arrivals, the Objectives tab | `wave22-appointments`, `wave25-arrivals`, `wave26-objectives` |
| The card table: draw, hold'em, betting, its words | `wave10-cards`, `wave11-cards`, `wave12-cards`, `wave13-holdem`, `wave14-holdem-fixes`, `wave15-table-polish`, `wave18-betting`, `wave19-betting-fixes`, `wave20-table-words` |
| Relationships: tracks, the event engine, the bookkeeper's acts, what people hold and show | `wave26-rel-tracks`, `wave27-rel-engine`, `wave28-social-events`, `wave29-rel-hold`, `wave30-rel-people` |
| Ties between people and the town as a graph | `wave31-town-ties`, `wave32-ties-change` |
| Romance: the target, the charm roll, the romance track | `wave33-romance-target`, `wave34-romance-difficulty`, `wave35-romance-track` |
| The minor rule and coercion, the anchors, a fuzz of the wire | `relationships`, `wave40-coercion`, `wave40-wire-refusals` |
| The design's worked examples, played through | `relationships-examples` |
| The simulator's eight-day cut (romance and blackmailer) | `relationships-sim-guard` |
| The labelled eval's set, offline | `eval-set` |
| Updating older games, every step and every frozen save | `upgrade`, `upgrade-fixtures` |
| The later review rounds (mixed) | `wave3-fixes` to `wave9-fixes` |

Not test files (run by hand, or by a test, or nightly):

- `tests/validate-town.cjs`: the content check (`run.cjs` runs it first;
  see Editing the town). It runs `tests/mentions.cjs`.
- `tests/cast-doc.cjs`: rewrites `docs/CAST.md`; `--check` exits 1 when it
  is out of date (the content suite runs it).
- `tests/probe-grammar.cjs` sends the bookkeeper's and the parser's schemas
  to the live API (`PROBE_DRY=1` builds the requests and stops before the
  network; `PROBE_MODELS=a,b` picks the models). It needs a key and has
  never been run (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md)).
- `node tests/relationships-sim.cjs [beer|confidant|brawler|romance|blackmailer]
  [--assert] [--days N] [--pending]` runs the 21-day simulator: each
  playstyle played in mock mode, each person's tracks and stance printed
  every morning; `--assert` exits 1 when a band fails. Bands that wait on
  another wave print PENDING and are skipped unless `--pending` is given.
  `node tests/run.cjs relationships-sim-guard` runs the eight-day cut of
  romance and blackmailer; `SIM_PENDING=1` asserts the pending bands too.
  The nightly workflow runs all 21 days with `--assert`.
- `tests/eval-classify.cjs` is the labelled eval of the bookkeeper's acts
  and the romantic-intent lines, against `tests/eval/labelled.jsonl` (see
  `tests/eval/README.md`). The set ships with 216 authored starter rows
  played through the game in mock mode; replace or extend them with live
  turns: turn on Settings → Advanced → "Keep bookkeeper packets", play,
  press **Export bookkeeper turns** in Debug, and label each line by hand
  with the act a neutral witness would name. `node tests/eval-classify.cjs
  --dry` checks the set offline (no key) and runs in the suite as
  `tests/eval-set.test.cjs`; `ANTHROPIC_API_KEY=… node
  tests/eval-classify.cjs` runs it live and exits 1 below the bar
  (neighbour confusions under 20%, exact 75% or more, invented 5% or fewer,
  romantic recall for minors 98% over at least 40 lines, no minor-related
  event for a minor); `--record` appends the result to
  `docs/notes/prompts.md`. A live run is about $0.15 on Haiku.
- `tests/fixtures/make-saves.cjs` freezes the older saves (see above).

**CI.** `.github/workflows/tests.yml` runs on every push and pull request
(Node 20): first `node tools/build.cjs --check`, then `node tests/run.cjs`
in four shards at `-j 2`. It caches Playwright, cancels superseded runs, and
uploads the run log and screenshots (`UI_SHOTS`) when a shard fails.
`.github/workflows/nightly.yml` (04:17 UTC, or by hand) runs the same check,
then the whole suite one file at a time and the 21-day simulator with its
bands asserted (`node tests/relationships-sim.cjs --assert`). Playwright is
pinned to 1.63.0 in both workflows' `PLAYWRIGHT_VERSION`; bump it there when
the local install changes. CI installs Playwright and Chromium itself (`npx
playwright install`) outside the checkout; that is CI's own machine, not the
sandbox, where Playwright is preinstalled and must not be installed again.

## Verified against the live API

**Nothing from 30 Oct 2026 to wave 51 (4 Nov 2026) has been checked against the live API.** It was
verified in mock mode and against canned API replies served inside the
browser (`tests/api.test.cjs`, `tests/transport-fixes.test.cjs`). Before
relying on it with a key, a short live session should confirm:

- the bookkeeper's `record_changes`, now 34 properties and 3 enums (with its
  11-field core), and the parser's `parse_action`, now 14 fields with
  `romantic`, compile (the API refused 47 properties in an earlier probe with
  "compiled grammar too large"; 46 passed, and 41 since wave 17).
  `ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs` posts the three and the
  41-property control from before wave 28 to the Standard and Thrifty
  models; it has not been run yet (it needs a key), so waves 28 to 51 shipped on an unprobed schema;
- the 1-hour cache is accepted as `cache_control: { "type": "ephemeral",
  "ttl": "1h" }` on the narrator's system blocks, and the usage reports the
  write under `cache_creation.ephemeral_1h_input_tokens` (on the second
  narration `cache_read_input_tokens` should be above zero);
- **Check key** (`GET /v1/models` with the key) answers 200 for a good key and
  401 for a bad one, from `file://` under the page's content security policy;
- the real narrator with the newer packets: `TIME PASSED` ("… until morning,
  Day 4"), `ARREST`, a `DUE EVENT` that is the scene itself (the council
  meeting), `SINCE THE LAST TURN` (who came and went while time passed), and
  the narration read beside the "Meanwhile in town" lines and the Resolved
  lines held until their news is told;
- the real bookkeeper with money in Say mode: a part payment ("Here's fifty.
  I'll get you the rest Friday."), an order that buys ("I'll take a beer")
  and a gift ("Get yourself a beer"). The mock never moves money on a Say
  line, so only a live session shows what the bookkeeper sends there;
- how often the name check sends a narration back to be written again (the
  Debug tab's style entries), now that a first name and a surname before "is"
  or after "you watch" count as someone;
- the parser's and the bookkeeper's system blocks with `cache_control` ttl
  1h (from the second turn `cache_read_input_tokens > 0` on both; the API
  skips caching silently below its minimum prefix, which is harmless);
- whether the browser can read `retry-after` across origins
  (`access-control-expose-headers`); otherwise the Debug entry says "no
  retry-after header the page could read";
- a 404 for a retired model and the `/v1/models` suggestion of a current
  model of the same family;
- what a turn really costs (the Debug tab's session cost, with the 1-hour
  cache writes).

The first live turns of this round (31 Oct 2026, on the Say-mode money rule)
found one thing the mock could not: told the player's cash on the CARRYING
line, the narrator had Jodie say "You've got five bucks left to your name"
after a $20 tip from $25. The packet now marks the cash as the player's alone,
both style guides forbid anyone naming it, and a spoken line that knows the
total is a hard style problem and is rewritten. Still to confirm live: the
rest of the list above, and that the rewrite rarely fires.

Earlier rounds were checked live: on 28 Oct 2026 an arrival, several turns,
the casual style and the Do / Say switch (every call 200, the cache read on
every narration after the first); on 29 Oct 2026 the clock fix through
**Update this game** (10 calls, $0.088).

If a request fails, the feed shows a short message and your typed action stays
in the box. Type `/debug` and look in the Debug tab:

- **API errors**: each failure with its role (parser, narrator, bookkeeper,
  chronicle), HTTP status, `request-id` and the API's own message, verbatim.
  A stall reads "timed out after 45 s with no data".
- **Last raw responses**: the latest exchanges, with status, request-id,
  stop reason, token usage and the reply.
- **API (claude)**: token and cost totals for the turn and the session, the
  1-hour cache writes after the cost, and the narrator's `cache_control`. On
  the second narration, "cache read" should be above zero.

Usual causes: 401, a bad key (Settings → Check key); 404, a model name the
API does not know (check the model fields under Advanced); 400, a request the
API rejects (the message says what; please report it); 429, 5xx or 529,
busy, already retried (once, or twice for 529 and 503), so try again. To keep playing while you sort it
out, turn on the offline demo under Settings → Advanced.

## Deliberate deviations from SPEC.md

From [`docs/BUILD_PLAN.md`](BUILD_PLAN.md):

- API version header is `2026-10-21`, not `2023-06-01` (`docs/API_NOTES.md`).
- JSON comes from structured outputs, not forced tool use, because forced
  `tool_choice` is rejected on Sonnet 5.5 and Opus 5.5 and the models are
  user-editable.
- `max_tokens` are larger than the spec's because thinking tokens count toward
  them; narration length is enforced by prompt and style check.
- All milestones are built in one session with a commit per milestone, instead
  of pausing for manual testing between them, because the session runs
  unattended. Each milestone is verified by Playwright tests instead.

Also from `docs/BUILD_PLAN.md` ("Setting change: modern day"): the town is
present-day, not low fantasy. The narrator's example turns are modern scenes,
and money is shown as dollars (the state field is still `player.gold`).

And from `docs/BUILD_PLAN.md` ("Direction changes"): narration is casual by
default, with the SPEC.md style guide kept as the Literary option, and the
input has the Do / Say switch described above. Direction change 8 (a full
cast): every person is written by hand and the game never creates one in play,
so SPEC.md's NPC creation in "check and create" (and the bookkeeper's new
people) is gone; loose ends tie to cast members instead of new NPCs. Direction
change 10 (the approved review, 30 Oct 2026): the offline demo is no longer
the default; the town keeps a calendar and an arc (obligations with due days,
town news, a council meeting on day 6 and an ending by day 21); seeds, clocks
and templates carry their effects in code; the retry lock no longer stops a
fight, and a success locks nothing (wave 2); the chronicle waits for 16 turns
and keeps the newest 6, so the narrator always has its last turns; the
narrator's cache lasts an hour instead of five minutes; and the casual example
turns are eight, written in the packet's own format.

And from the relationship plan ([`docs/RELATIONSHIPS_PLAN.md`](RELATIONSHIPS_PLAN.md), waves 26 to 31):
the bookkeeper (SPEC.md section 10) no longer sends attitude deltas or
memories. It names what a person will remember of the turn as an event
(`socialEvents`, "npc_id event: the memory"), and the game decides what that
does to their liking, trust, fear and how well they know you; the parser
also says whether an action is romantic (`romantic`). The dice (SPEC.md
section 7) read trust as well as liking: a lie is harder to someone who
distrusts you and easier to someone who trusts you, anyone against you is at
least hard to ask, and someone afraid of you does a small thing with no
roll. Acceptance check 4 (three insults) holds with the numbers the events
give: insults compound (-10, -15, -22), a humiliation in front of others is
heavier, and the grudge comes at liking or trust -60.

Wave 29 (what people hold) adds to SPEC.md section 8's seeds: besides the
grudges and favours that grow from how someone feels, the engine plants seeds
from what people hold (a payment for silence the day after it is agreed, a
holder telling what they know or naming a price, an inquiry when a crime is
told to the police) and from favours owed (paid back unasked, or asked for
back), each on a dice stream of its own, so the shared dice and the clocks
stay exactly as they were. A spark and a night together are the engine's to
decide before narration, not the narrator's.

Wave 30 (what people show) changes what is shown of the numbers. SPEC.md
section 3's `attitude` stays on each person as the stored name for liking,
beside the record of all its tracks (`rel`: six then, seven since wave 35). The narrator (sections 6 and 10)
is no longer sent "attitude -35": each person present has a "to you" line,
where they stand and up to two dated reasons, then how they play it now
("to you: cool to you, has something on you — you owe her four hundred
(Day 1) — plays it: civil and brief"), at most about 50 tokens a person, and
the example turn's "(Smith: gruff, short sentences, attitude −10.)" (section
9) reads "cool to you" in the example sets. The People panel (section 11)
shows that stance in words with its reasons, not a one-word attitude, and the
editor sets the tracks (seven sliders since wave 35), not one number. A council or ending that read
attitude now reads trust where trust is the point.

Wave 31 (the town is a graph) adds to SPEC.md section 3's state the ties
between people (`ties`) and the news of the player on its way along them
(`hearsay`), and to section 8's living world one hop of it: what you do to
someone reaches the people tied to them, by the kind of tie and at most 15
of liking and of trust a turn through it, without an API call and without a
roll.

Waves 32 to 35 (ties that change, and romance): what you tell someone about
a third person moves how they feel about each other (SPEC.md section 8 has
no such thing). The relationship plan's "a romantic ask always fails" for
anyone off a hand-written eligibility list (section 11 of the plan) is
superseded by wave 34: every adult is eligible, a flirt rolls charm against
how hard they are, and some are easier than others. Wave 35 made romance a
seventh track of its own, apart from spark.

Beyond SPEC.md altogether, built at the owner's request: the card table
(five-card draw and Texas hold'em, with real betting, waves 10 to 20); the
Objectives tab (wave 26); the town map with tap-to-travel; the `/cheat`
commands; `/rewind` and `/redo` beside `/undo`; and editing people by hand
(`/edit`, every track).

Waves 36 to 51 (the overnight round, 3 to 4 Nov 2026):

- Section 2 (tech setup): `index.html` is still the one file that plays with
  no build, but since wave 50 it is generated from `src/` by
  `tools/build.cjs`; the Literata font is inline instead of a Google Fonts
  link (wave 46); a web manifest and two icons sit beside it for a host.
- Section 7 (dice): coercion is decided by fear, leverage and threats at
  every named target, never by the parser's action type (wave 40).
- Section 13 (cost control): a spending pause (Settings → Spending) and the
  game's total cost kept in the save (wave 43); the parser's and the
  bookkeeper's system prompts are cached too (wave 41).
- Tests beyond section 14: frozen saves from every older rules version
  (wave 39), a labelled eval set (wave 37), and a 21-day simulator with
  romance and blackmail playstyles (wave 38).
