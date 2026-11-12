# Engine-world fixes (wave 1)

> Wave 37 (Creator Mode): the names below are of their time. The content
> block, `TOWN_DATA` and its neighbours, is now the built-in story pack
> `packs/low-water.json` (read through `Pack`), and `tests/validate-town.cjs`
> and `tests/mentions.cjs` are now `tests/validate-pack.cjs` with the page's
> own validator (`Pack.validate`, the `engine.mention.*` rules). See
> `docs/notes/creator-mode.md`.

Region: Helpers, Rng, Dice, Tables (code and the `TABLES.complications`
data), Town, World in `index.html`. Tests: `tests/engine-world-fixes.test.cjs`
(19 tests, mock mode, driven through `window.Game`).

## What changed

### Dice

- **Conditions count their sign and size** (REVIEW E6). `Dice.conditionAffects(c, stat, day)`
  returns the summed modifier of every `<sign><n> <stat|all>` part in the
  effect text (`"-1 might"`, `"+1 charm, -1 wits"`, `"+2 might, feeling
  great"`, also `−2` and `-1 to wits`). Text with no number counts nothing;
  "charming" is not charm. `modifiersFor` pushes that value (was always −1).
- **The retry lock is a set of keys** (REVIEW E9, E10; SPEC section 7).
  `Dice.lockKey(action, ctx)` is the action's *family* (`Dice.FAMILIES`:
  talk and persuade are one `ask`; buy, sell and give a `deal`; deceive a
  `lie`; intimidate a `threaten`; attack a `fight`; sneak and steal a
  `sneak`; search and look a `search`; take; use, other, move, rest and wait
  `handle`), its targets and the item used, at this place, day and phase.
  The stat the parser picked is not in the key, except for an action aimed
  at nothing in particular (no targets, not social): there the stat is all
  that tells "climb the wall" from "pick the lock" (an acceptance test caught
  the two locking each other). Failed keys pile up in `meta.lastRollKey`
  (joined by `;`, written through `State.apply` as before), so a second
  failure does not lift the first. Every key carries its place and phase,
  so a move or a phase change lifts them even before anything clears the
  set. `ctx` is `{ presentIds?, locationId?, day?, phase? }` or a state (the
  old one-argument call still works).
  - **A fight goes on.** An attack on someone still present has no key
    (`lockKey` returns `null`): never locked.
  - API for the pipeline: `Dice.lockKey`, `Dice.isLocked(key)`,
    `Dice.lockFor(roll, key)` (the new `lastRollKey` value: the locks still
    in force here plus this key on a failure), `Dice.lock(key)` (lock now,
    through `State.apply`), `Dice.clearLocks({ move } | { phase })` (both
    false: no-op; no argument: clear).
  - **Repeated asks: diminishing returns, not a lock** (the choice the brief
    left open). A social success is recorded in the same set as `+key`; it
    locks nothing. `Dice.successes(key)` counts how often that ask (family +
    person) already worked here this phase; `Dice.diminishing(n)` is the
    share of an attitude gain the next one earns: 1, ½, ¼, then 0. Why not
    lock after a success: the key is family + person, so a lock would also
    refuse a second, different favour from the same person in the same
    evening, and the pipeline's "SAME ASK AGAIN" wording says the ask
    failed. The pipeline has to apply the factor (see Needs).
- **Fights.** `Dice.threat(npc)`: `hard` for police (tag or role), tag
  `armed` or `tough`; `easy` for tag `elderly`, `frail`, `teen`,
  `teenager`, or age 70+ or 17 and under; else `normal` (hard wins).
  `Dice.fightDamage(tier, rng?)`: partial 1, failure 1–3, critical failure
  3, else 0.
- **Complications fit the action** (REVIEW E15, section 4). `TABLES.complications`
  is now 20 objects `{ text, tiers, kinds, needsPerson?, notDay1?, effects? }`:
  7 partial costs, 12 failure twists, 1 for both. `tiers`: `partial`,
  `failure`, `both`. `kinds`: `social`, `physical`, `stealth`, `any`
  (`Dice.COMPLICATION_KIND`: talk, persuade, deceive, intimidate, buy, sell,
  give are social; sneak and steal stealth; everything else physical). An
  entry with `needsPerson` is only rolled with someone present, who is
  `{witness}` in its text and `"{witnessId}"` in its effects (the person the
  action was aimed at if present, else someone present). `notDay1` entries
  ("recognizes you from somewhere") never on day 1. Nobody in the table is
  made up. Five carry effects: `playerHp −1` (hurt doing it), `attitudeDelta
  −5` on the witness (takes it personally), `addMemory` weight 2 on the
  witness (catches you at it), `addRumour` about the player sourced by the
  witness (starts telling people), `addNews` not public (reports it to the
  police). `Dice.complication(ctx, rng?)` with `ctx = { actionType, tier,
  presentIds, day, locationId, witnessId? }` returns `{ text, effects,
  witnessId }`. `Dice.resolve` rolls one for a partial or a failure (people
  present from the state unless `opts.presentIds`; `opts.npcId` is the
  preferred witness) and puts the text on `roll.complication` (a string, as
  before) and the filled effects on `roll.complicationEffects`.
  `Tables.complication(rng)` returns a raw entry.
- `Tables.price` multiplies by the player's own factor too (`playerPrice`:
  `flags.playerPriceMultiplier`, a number or `{ factor, untilDay }`, with
  `flags.playerPriceUntilDay`; not after its day).

### Town

- **Who people mean** (REVIEW E11). `Town.rolePhrases(n)` also answers to
  the tags that name a kind of person (`TAG_PERSON`: dispatcher, foreman,
  bartender, cashier, clerk, maid, dealer, bookie...; not records, council,
  fence, police). `whoIs` (behind `Town.matchExisting`) then:
  - kin words: "Colt's dad", "Micah's grandma", "Austin's momma", "Colt's
    old man" (`KIN_SYNONYMS`, `KIN_NEUTRAL` in Helpers); the very relation
    on record first ("Kaylee's mother" is Darlene, never Royce), then a word
    for either of a pair ("Royce's kid"), then the she / he form for someone
    whose pronouns fit;
  - titles: "Mrs. Pittman" is a she, "Mr. Pittman" a he (the elder first);
  - words the roles do not use (`PEOPLE_WORDS`): cop / police / deputy /
    officer (tag police, or officer / chief in role), preacher / reverend
    (pastor), kid / teen (tag teenager or age 10–17; boy and girl by
    pronouns), cashier / clerk, maid / housekeeper, dealer, old man / old
    woman (65+ by pronouns, the oldest first), bartender / barkeep,
    mechanic, nurse, teacher, farmer, bookie. Someone here first, always.
  - "barmaid" is not a synonym: the cast has no barmaid and the tests say so.
- `Town.guessKind` reads the head noun: the last word of the head phrase
  decides (a word for a person, kin and work words included, makes a
  person; a place word a place); then a name; then a place or person word
  anywhere in the head phrase, leaving out capitalised words and an owner
  before the thing ("a deputy's hat" is a hat). So "the dispatcher", "the
  foreman", "the guy at the counter" are people (NOT PRESENT when nobody in
  the cast answers), never items; "a King James Bible" is a thing.
- **Plausibility tests the head noun** (REVIEW E12). The blocklists match
  only the end of the head phrase (one or more words: "a magic sword", "a
  ray gun") or an owner of it ("a dragon's egg"); "an Army jacket", "a King
  James Bible", "a laser level" pass, and a toy, costume or picture of
  something ("a toy robot", "a plastic dragon") is ordinary. Sword,
  crossbow and musket are no longer fantasy-only. Unknown location types
  get the generic judgement.
- **Places made in play** (step 4): `Town.matchExisting` reuses a made
  place (not in the town data, not revealed, no map point) only when it is
  the player's place or next door, so the diner's back room is not the
  bar's. `Town.plausible` refuses a 13th made place
  (`State.LIMITS.revealedPlaces`); `Town.placesMade()` counts them.
- `Town.sameRel(a, b)` is the one relation comparison (synonyms, either of
  a pair, she/he folded); `Town.relWord(r)` the canonical word. Upgrade
  still has its own copy (transport's region).
- `Town.validate` (the in-browser twin of the content check) reads list
  triggers, `requires`, `alt`, seed effects, town `events` and `epilogue`.

### World

- **Seeds**. `trigger.value` may be a list for
  `location` and `npc` triggers (any of them). At firing, `requires`
  (`npcFree`, `npcAt`, `flagsSet`, `flagsUnset`, `obligationOpen`; also
  `obligationStatus`, `clockAtLeast`, `attitudeAtLeast`) is checked
  (`World.conditionsMet`); if it fails the seed's `alt` is told and its
  effects run, else the seed fires as a logged no-op. A seed's `effects`
  run when it fires, through `World.fillEffects(effects, { npc, player,
  witnessId?, locationId? })` (fills `{npcId}`, `{npc}`, `{playerName}`,
  `{player}`, `{witnessId}`, `{witness}`, `{place}`; an effect left with a
  placeholder is dropped) then `State.apply({ effects })`. A loose end's
  `effects` (the obligation engine-state copies onto it) run the same way.
- **Clock completions** honour `onComplete.requires` / `alt` the same way,
  and every completion with text is town news (`addNews`, public, with the
  faction). `SEEN_OPS` gains `banFrom`; effects on the player (`playerHp`,
  `playerGold`, `giveItem`, `takeItem`, `addCondition`) are always seen.
  `clockAtLeast: { fac_x: n }` counts every segment the faction has filled
  across its clocks (a finished clock counts in full), so a condition on
  the first clock still holds once the second has started
  (`World.clockProgress`).
- **Clock odds**: a clock's or faction's `odds` (lowest d6 that fills: 1–6,
  `"4-6"`, `"4+"`, or a chance below 1); default 5 (5–6), as before.
  `World.oddsOf(f, c)`.
- **Town events and the epilogue** (`World.fireEvents`, inside `tick`):
  an event in the game's own town copy (`State.town.events`) whose day and
  phase have come (at or after) picks its first branch whose `when` holds,
  else `default`; its effects run, its text is public news, and when the
  player stands at its place it is a due event there (`scene: true` is
  passed to `dueAdd`). Fired ids: `state.eventsFired` through an
  `eventsFired` engine key when State has one, else flags `event.<id>`
  (`World.eventsFired()` reads both). The epilogue (`onDay` or any of
  `orFlagsSet`): its branch, news with `public: true, epilogue: true`,
  `flags.epilogueShown = true`, once.
- **Obligations**: on each new morning `State.tickObligations(to.day)`
  (guarded); each missed one is news (not public: `Missed: <text> (due day
  N).`), a quiet notice, and a due event `"<npc> came looking: <text>"`
  that brings them to the player.
- **Grudges and favours**: thresholds kept as they were (grudge: −60 and a
  weight-3 memory; favour: +60 and a memory of weight 2 or more, so a
  favour is earned). One feeling per memory: the seed's cause carries
  `[m<turn>:<words>]` (`World.feelingMark`), since State.apply has no
  writer for `memory.feelingPlanted` (honoured if it appears). No new
  feeling for 7 days after one of theirs fired (`FEELING_COOLDOWN`). A
  grudge that fires leaves them +10 ("got even"). Templates are filtered
  by `forTags` / `notForTags`, read against the person's tags plus what
  their age and role say (`elderly` at 70+, `teenager`/`teen` under 18,
  `police`); none fits, none planted. A template's `effects` run when the
  seed fires (looked up by `origin.template`, or the seed's own `effects`)
  and `public: true` makes it news.
- **Attitude drift**: each new morning, 2 points back toward the person's
  attitude in the town data (0 for anyone it does not have) for anyone with
  no weight-3 memory from the last 5 days and no open loose end with the
  player. Deliberately toward the town's own number rather than flat 0: the
  cast's written first impressions (Ray +15, Wade −10) would otherwise be
  gone in a week. A memory's day is `m.day` when it has one, else the
  log's; a memory older than the log counts as recent unless the log goes
  back five days (conservative: grudges hold longer, never shorter).
- **Weather** reads `State.season()` (guarded), else `flags.season`.
- **Fights**: `World.knockDown(npcId)` gives hurt (`npcFates`, when State
  has it), a weight-3 memory to them and everyone present, and news in a
  public place; returns `{ text, npcId, hurt, witnesses }`.
  `World.arrestPlayer()` moves the player to the police station, fines up
  to $50 (what they have), gives the chief a weight-3 memory and plants a
  due event there; returns `{ text, seedId, locationId, fine, chiefId,
  timeCost: 'rest' }`.
- `World.applyEffects` leaves out (and notes) ops this build's State does
  not have yet, instead of sending them to be refused.
- Every news line is also noted in `World.recent` (kind `news`, with
  `public`, `factionId`, `epilogue`), which the Debug tab lists.

## What the player sees

- Conditions that help actually help ("+2 might" is +2), and a mood word
  never costs a point.
- A fight continues: the second swing at someone still there rolls.
  Climbing a wall after a failed lockpick is a new try. The same ask of the
  same person pays less each time it works.
- Complications match what happened: no "costs more than you have" on a
  punch; a witness is someone actually in the scene, by name; some leave a
  mark (a lost HP, a cooler person, a memory, a rumour, a police report).
- "Ask the cop", "the preacher", "the kid", "Colt's dad", "Mrs. Pittman"
  find the cast's people; "the dispatcher" is Glenda, not an item; "an Army
  jacket" and "a King James Bible" exist.
- The town moves where you can see it: clock outcomes become news, town
  events happen on their day (as a scene if you are there), missed debts
  come looking, grudges fire once per offence and then cool off, and warm
  or cold feelings fade back over days without fresh cause.

## Needs from others

Names this region calls that another agent provides (all guarded):

- **engine-state**
  - `State.EFFECT_OPS` including `addNews` (with `epilogue: true` kept),
    `playerHp`, `playerGold`, `giveItem`, `takeItem`, `addCondition`,
    `addMemory`, `banFrom`, `addObligation`. Until then World skips them.
  - `State.tickObligations(day)` returning the missed ids (records also
    accepted); `State.obligations()`; `State.season()`.
  - `State.RECORD_KEYS` with `npcFates`, accepted from source `world` with
    `{ present, rollSuccess, attacked }` (knockDown).
  - `normaliseSeed` (plantSeed, newSeeds) keeping `effects`, `requires`,
    `alt`, `public`, and accepting a list `trigger.value` for location and
    npc triggers; town seeds keep them already (Town.instantiate copies).
  - `dueAdd` keeping `scene: true` (town events at the player's place).
  - Optional: an `eventsFired` engine key (else World uses flags
    `event.<id>`); `day` on every memory (`newMemories` sets it,
    `checkMemories` keeps it) so drift reads exact days; a writer for
    `memory.feelingPlanted` (World derives it from the seed's cause today).
  - `flags.playerPriceMultiplier` / `playerPriceUntilDay` as `Tables.price`
    reads them (number or `{ factor, untilDay }`).
  - Note: the existing weather test reads `flags.season`; once
    `State.season()` returns the calendar's season, `flags.season` should
    match it (or the test read `State.season()`).
- **transport (Pipeline)**
  - `resolve`: `Dice.lockKey(a, { presentIds: ctx.presentIds })`; keep
    `Dice.isLocked` / `Dice.lockFor`; replace the clearing rule at the end
    of `runTurn` with `Dice.clearLocks({ move: moved, phase: phaseChanged })`.
  - Read `n = Dice.successes(key)` *before* storing `lockFor`, and scale a
    positive bookkeeper `attitudeChanges` delta for the ask's target by
    `Dice.diminishing(n)`.
  - Apply `roll.complicationEffects` with `State.apply({ effects })` after
    the roll (the five ops above).
  - Attack difficulty from `Dice.threat(target)`; damage from
    `Dice.fightDamage(roll.tier)` (a partial now costs 1).
  - Call `World.knockDown(npcId)` on the third hit and `World.arrestPlayer()`
    for a fight with police present or at a police location; then
    `passTime(result.timeCost, 'arrest')`, and `World.dueNarrated([{ seedId }])`
    if the arrest is narrated in the same turn.
  - Upgrade: switch its `sameRel` to `Town.sameRel`.
- **content**
  - `TABLES.complications` is now this region's object table;
    `tests/validate-town.cjs` was given a matching check
    (`checkComplications`, replacing the string-list check for that one
    table). Merge note: a small edit in content's file.
  - Templates may carry `forTags`, `notForTags`, `effects`, `public`;
    events and the epilogue per contract; `clockAtLeast` counts all
    segments filled on the faction's clocks; `odds` on a clock or faction.
    Tags `tough`, `armed`, `elderly`, `frail` are read if present (age is
    read anyway).
- **prompts**: nothing new; `COMPLICATION:` stays the text.

## Tests

- New: `tests/engine-world-fixes.test.cjs` (19). Checks that need another
  agent's op (state.news, hurt) run only when this build has it.
- Changed by design: `tests/acceptance.test.cjs` [3] compared the roll's
  complication to the table's strings; it now matches the text against the
  table's entries with `{witness}` as a name.
- `tests/validate-town.cjs`: complications check (above).

## README / BUILD_PLAN text to fold in later

- README, Commands / Time: "A roll that fails can't be retried in the same
  place and phase, but a different approach can (persuading after a lie,
  climbing after a lockpick); in a fight you can keep swinging at someone
  who is still there. Asking the same person the same thing again pays
  less each time it works."
- README, People: "Ask for someone by what they are ('the cop', 'the
  preacher', 'the kid', 'the old man'), by who they are to someone ('Colt's
  dad', 'Kaylee's mom') or by title ('Mrs. Pittman'). Someone nobody in
  the cast answers to ('the guy at the counter') is simply not there."
- BUILD_PLAN, TABLES: `complications: [20 of { text, tiers, kinds,
  needsPerson?, notDay1?, effects? }]`.
- BUILD_PLAN, World tick: the order in the World module header (clocks;
  completions with requires/alt and news; missed obligations; schedules;
  grudges and favours; town events and the epilogue; a new morning with
  weather, conditions and drift).

## Integration (after the six merges)

- `Tables.npc()` is deleted (no person maker; the cast is written by hand).
  `TABLES.npc` keeps `firstNames` and `occupations` for the person matcher.
- `ACTION_TYPES` includes `gamble` (the card game the Pipeline deals);
  `Api.PARSE_TYPES` is the same list.
- Town events may carry `attendees: [npcIds]`: when the event fires at the
  current phase, those who are free, in town and not away or laid up today
  get a visit to its place for that phase (the council's five seats and the
  chief at the meeting). `World.fireEvents` records the id through State's
  `eventsFired` engine key (`state.eventsFired`), so the flags fallback is
  only for older builds.
- `dueSeeds`: a due event from a seed with an npc trigger (a background's
  hook) brings that person back to the player if they have moved on, like a
  loose end's.
- Attitude drift toward the town's starting attitude (not 0) and the favour
  threshold (a memory of weight 2 or more) stand as designed.

## Wave 2

Review bugs 5, 6, 8 (World side) and the playtest's B5, B6, B7, B9 and B18
(World and Town side). Tests: `tests/wave2-fixes.test.cjs`.

- `Tables.price` multiplies by `State.priceFactor()`; `Tables.playerFactor`
  (a second copy of it) is gone.
- `Dice.successes` / `Dice.diminishing` and `roll.complicationEffects` are
  now used by the Pipeline (see transport.md, Wave 2).
- **One loose-end obligation builder**: `Town.obligationFor(le, target?)`
  returns `{ effect, onStart }` (the `addObligation` effect with `dueOffset`,
  every placeholder filled, plus content's optional `missText` and
  `askerId`). `Town.resolveLooseEnd` and Upgrade version 8 both use it
  (Upgrade's own copy and the `State.obligationEffect` it asked for are not
  needed).
- **Plausibility** (playtest B5): outside a fact bought with a story point,
  a gun or ammunition is only where guns are kept (pawn, police, a farm or a
  home), explosives nowhere, a boat only by the river, a car or truck where
  one is parked (most places, not inside a flat or a trailer). A thing's head
  phrase ends at "and" ("a rifle and shells" is a rifle; the Pipeline splits
  "X and a Y" into two things); an item in the scene also matches by its own
  head phrase ("rod" finds "Rod and reel").
- **Town events** (review bug 8, playtest B9): one news item per event (the
  branch's own `addNews` when it has one, else its text), carrying the
  event's id; the due event at the player's place carries it too and
  `dueNarrated` marks that news seen, so "Overnight in town" never tells
  what the player watched. An event the clock jumped past (a `setTime`, a
  save loaded late) still happens but as news only, dated its own day and
  phase: no scene, nobody gathered.
- **Clock completions**: one news item (the completion's own `addNews` when
  it has one), already seen when it happened in front of the player (its
  quiet line tells it).
- **Due events** (playtest B6, SEAMS "told late"): `World.MAX_DUE` is 3;
  `dueSeeds({ max })` takes more (the Pipeline passes `Infinity` for a
  narration of time passing). Each comes out with its `firedDay`, `scene`
  and `eventId`, the scene first, then someone come for the player, then the
  rest. A due event about an obligation (`obligationId`: a loose end's seed
  that made it, a missed one's "comes looking") is dropped once that is met.
  `fire()` runs a seed's effects before adding its due event, so the event
  can name the obligation they made.
- **Missed obligations** (playtest B18): the person let down is the one owed,
  or for an errand its `askerId` (the person the thing goes to never comes
  looking: they may not know it exists). They get a weight-3 memory (unless
  the obligation's `onMiss` already gives them one) and, when they are in
  town, a due event: content's `missText`, else "<Name> comes looking for
  <player> about the money owed, now past due.".
- **Fights**: `World.arrestPlan()` says what an arrest would be without
  doing it (the Pipeline tells it in the fight's narration);
  `World.arrestPlayer({ told: true })` then plants no due event.
  `knockDown`'s news is marked seen (the player was there). Place names in
  these sentences read "the Low Water" (`placeIn`).

## Integration (wave 2)

- `Town.obligationFor` copies content's `owedTo` (filled; `askerId` read as
  the same) as well as `missText`. `World.missedObligations`: the person owed
  is `owedTo`, else the bound person (an errand without one has nobody); the
  news is the obligation's own `onMiss` addNews when it has one, else
  `missText`, else "Missed: <task>"; the quiet line stays "Missed: <task>
  (due day N)."; the due event is `missText` (or the plain "comes looking"
  line), bringing the person only when free and in town, else told with
  nobody brought.
- `conditionsMet(c, { playerAway })` reads `playerAt`; `pickBranch` passes
  `playerAway` for an event fired on a tick that is not now (slept or waited
  through) or late. A town event slept through dates its news to its own
  tick.
- `TABLES.complications`: the witness line no longer says the player was
  known before.

## Wave 3

The second code review's bugs 2, 5, 10 and its risks on the World, Town and
Dice side, its dead code, and the second playtest's engine items. Tests:
`tests/wave3-fixes.test.cjs`.

- **Brought at the end of a walk** (review bug 2): `World.dueSeeds({ phase,
  day })` brings a person for the phase the walk lands in, so DESTINATION
  names them and they are still there after the walk's time has passed.
- **Sorted, then capped** (review risk): the scene first, then someone come
  for the player, then the rest, and only then `MAX_DUE`; a person is
  brought only for an event that is told.
- **A seed told as a due event** has its own `addNews` marked seen (the
  playtest's "seed news told twice"): the narration tells it, "Overnight in
  town" does not.
- **Plausibility** (review bug 5): a word right before the head word that
  makes it something ordinary (`HARMLESS_BEFORE`: grease, staple, nail,
  caulk, water, squirt, peanut, taco, pecan, ink, toner, gravy, hand ...) lifts
  the gun, ammunition, boat and vehicle rules: a grease gun, peanut shells,
  ink cartridges, a gravy boat, a hand truck.
- **A possessive names a place** (review bug 10): `Town.matchExisting`
  checks `possessivePlace` before people: "Pittman's"/"Byrd's" alone is the
  business whose name starts so; "Royce's house" (place, home, trailer,
  apartment, farm) that person's home; "Hollis's pawn shop" or "Loretta's
  bar" a place of that name or kind tied to them (their name in it, they work
  or live there); "Pittman's gas" the business it starts. "Royce's truck"
  and "Dewayne's wife" are still not places.
- **Arrests** (the playtest's design note): `arrestPlan` lists the weapons
  the player carries (`WEAPON_RE`: guns, knives, shells and the like) and its
  text says the chief takes them; `arrestPlayer` takes them (`itemsLost`)
  and the chief's memory says so.
- **Grudges in kind** (design note): `plantFeeling` prefers templates that
  answer the memory: violence a beating or the police, a theft the police or
  talk, an insult talk (`memoryKind`, `grudgeKind`); any fitting template
  when none answers.
- **Dice**: `resolve({ complication: null | false })` rolls none (the card
  game); `roll.complicationWitness` and `Dice.lock` are gone (no reader, no
  caller; `engine-world-fixes.test.cjs` sets the same lock through `lockFor`,
  changed by design); a lock key never holds ";" (the separator of
  `meta.lastRollKey`).

## Integration (wave 3)

- An arrest takes what `isWeapon` calls a weapon: `WEAPON_RE`, unless the
  word before it makes it ordinary as plausibility reads it
  (`Town.harmlessHead`, now exported): a grease gun, peanut shells or ink
  cartridges stay with the player.

## Wave 4

The third code review's bugs 4, 5, 6 and 8 and its risks on the World and
Town side, and the third playtest's R1, R3 to R6, R10 and design notes.
Tests: `tests/wave4-fixes.test.cjs`.

- **A public grudge or favour is told once** (review bug 4, playtest R3):
  its news is pushed seen when its text is also a due event.
- **Brought through the phase the turn runs into** (review bug 5):
  `dueSeeds({ then: { phase, day } })` (the pipeline passes the turn's
  landing when the player stays: no walk, or a walk to a shut door) keeps
  whoever a due event brings there now and then.
- **A walk into a town event** (playtest R1): `eventsOnArrival({ locationId,
  day, phase })` fires an event whose place and phase a walk lands in as the
  player walks in (the branch read with `playerAt` there, the people it
  brings visiting for that phase, its scene a due event there), so the walk's
  narration tells it; the tick finds it done. It fires a moment before that
  phase's clocks roll. `conditionsMet` takes `opts.playerAt`.
- **Places named in what is told** (playtest R4): `dueNarrated` finds the
  places in town the player has not found that a narrated due event names
  (name or other name, five letters or more) and reveals them
  (`placesRevealed` by name, credited to the event's person); it returns
  `{ revealed }` and the pipeline prints "Added to the map: X.". Nadine's
  hook reveals the Parsonage, and any other seed that names a cast home does
  the same.
- **Attitudes drift for an active player** (playtest R5): `heldHard` reads a
  memory's day; one with no day that the log no longer reaches is old (it
  was "recent" for anyone who plays several turns a day, so nobody drifted).
- **Grudges answer in kind by their kind** (playtest R6): `grudgeKind` reads
  the template's `kind` (violence, police, gossip, money, ban; content.md);
  violence is answered with violence or the police, theft with the police,
  gossip or money, an insult with gossip, a ban or money. A template with no
  kind is read from its effects.
- **What an arrest takes** (review bug 6): `Town.weaponOf(name)` reads the
  head of the name (each part of "X and Y", "X, Y", "X (red)" alone; what a
  box "of" holds): a gun, knife, razor, ammunition or club word at the end,
  unless the word before makes it ordinary (`HARMLESS_BEFORE`, now with
  radar, tattoo, butter, putty, palette, plastic), or a gun by calibre,
  gauge or maker (a .38, a 12-gauge, a Glock 19). Gun oil, a gun case, a
  knife sharpener, a pistol grip and a grease gun cartridge are not weapons.
  The arrest line strips the article ("the .38 revolver"), keeps a maker's
  capital ("the Glock") and joins with commas (`andList`, now one helper
  for the whole file). The match is always at the end of the head, so
  `harmlessHead` reads the right word.
- **Plausibility**: a gun by calibre, gauge or maker is kept where guns are;
  a flare gun is ordinary at the river (`QUALIFIED_GUNS`: marina, bridge,
  landing, docks, ramp, riverbank, wharf, pier).
- **The chief's memory** names the player (review bug 8): "took the deer
  rifle off Nell Avery" (the narrator's memory line makes it "you").
- **Sleeping rough in public** (playtest design note): `sleptRough(quality)`
  after each `/rest` counts nights in a row slept rough in a public place
  (`flags.roughNights`); on the second the chief (`chiefOf`, shared with the
  arrest) moves the player on in the morning: a due event that brings him,
  told in that narration, and a memory (weight 2). The count starts again.
- **The tackle box** (playtest R10): its seed's `placeItem` leaves it where
  the player found it (the landing or the old bridge).

## Wave 5

The fourth code review's bugs 5, 6 and 8 and its World and Town risks; the
round-4 visual QA's /cheat time item; the round-4 playtest's Q3, Q4, Q8,
Q9, prose items and design notes. Tests: `tests/wave5-fixes.test.cjs`.

- **What a weapon is** (review bug 5): `Town.weaponOf` reads a maker
  before it splits a name ("Smith & Wesson", "Heckler & Koch"); the head
  ends before "for", "from", "to", "in", "on" ... ("a postcard from
  Winchester", "a deck of cards for blackjack", "a knife in a sheath"); a
  calibre, gauge or maker is a gun only as the whole head, with a maker or
  a model beside it ("Colt .45", "Sig Sauer P226", "Remington 870", "45
  ACP", "30-06"); a part after a comma that only gives a measure describes
  the part before ("Copper wire, 18 gauge"); a box, case, belt or rounds
  of a calibre is ammunition ("Box of 9mm"). New gun words: sawed-off,
  sawn-off, six-shooter, six-gun, scattergun (and penknife). A maker that is
  the whole name ("a Remington") stays a gun, as the design says.
  `guessKind` makes a gun by maker and model a thing, not a person named
  Smith. `harmlessHead` and `qualifiedHere` share `wordBefore`.
- **Arrival events** (review bug 8 and risk): `eventsOnArrival` runs that
  phase's clock steps first (`clocksAhead`: roll, clock seeds, completions,
  read at the destination), so a walking-in player gets the branch a player
  already there would; `flags.clocksAhead` ("day.phase") tells that tick
  not to run them again, and what they told waits for it. The event's news
  is dated to the arrival's day and phase.
- **/cheat time catches up** (round-4 QA): `catchUp({ day, phase })` fires
  what the jump passed in the order it would have come: a seed due on a
  day (dated that morning) and a town event (dated its own day and phase),
  then the ending. `fire(sd, when)` dates a seed's news.
- **A public grudge or favour** (review risk): its news carries the seed's
  id (`eventId`), and its due event too; it is seen once the due event is
  narrated (`dueNarrated`), and told overnight if that due event is dropped
  untold (its person arrested first).
- **Grudges by the turn** (playtest Q3): `memoryKind` reads the memory's
  `act` first (an attack is violence, a theft theft, words an insult); a
  memory without one is read by its words, an insult's first ("called me a
  thief", "said I", "told me to beat it"). Exported for tests.
- **Rough nights** (review risk, playtest Q4 and its design note):
  `sleptRough` counts nights in a row at the same public place
  (`flags.roughNights`, `roughAt`, `roughDay`); a bed, a night not slept
  (a /wait, the cell) or another place starts again, and an arrest sets it
  to 0. A place someone lives in is not public for this unless the one who
  lives there is the police (the Low Water is Loretta's; Town Hall is the
  chief's station). The first time the chief tells the player to move
  along; the next (`flags.movedOn`) he writes a `$25` fine and takes it, or
  what cash there is (`ROUGH_FINE`); the memory says which.
- **Plans told while the player sleeps** (playtest Q8): a completion done in
  front of a player who slept, waited or skipped through it
  (`TOLD_CAUSES`) is a due event at their place, told by the narration
  that follows, not a bare quiet line.
- **After the ending** (playtest Q9): once `flags.epilogueShown` is set the
  clocks do not roll, and a clock filled anyway completes as nothing ("after
  the ending: nothing comes of it").
- **Homes named in what is told** (review risk): `revealNamedPlaces` reads
  a place's name, or another name of its own (a capital or a possessive:
  "the pastor's house", "the Haskins place") that no other place holds;
  never a plain one ("the apartment", "the white house").
- **Conditions**: `attitudeBelow { npcId: n }` and `threadOpen [ids]`.
- **An enemy loose end comes good** (design note): the kind's `followUp`
  (content) is planted when the first beat fires, three to five days on
  (picked from the day and the person, no dice drawn), with `requires`
  `{ threadOpen: [the loose end's thread], attitudeBelow: { them: 0 } }`;
  it brings them to the player (origin `loose_end`); its `alt` when it does
  not hold.
- Prose: "Missed: … (due Day 7)."; `{place}` in an effect is the place as
  said inside a sentence ("after trouble at the Riverview Motor Court").

## Integration (wave 5)

- **Rough nights run on past the chief**: `sleptRough` no longer sets
  `flags.roughNights` back to 0 when the chief comes; `roughAt` and
  `roughDay` keep up too. So the second night running at the same public
  place he tells the player to move along, and a third night running there
  (or every night more, or the next time, by `flags.movedOn`) he writes the
  `$25` fine: "… for the third morning running, still there after he told
  you to find a real bed, and writes you a $25 fine …"; his memory says
  "still sleeping rough at …, three nights running, after telling them to
  find a real bed, and fined them". Before, the count started again after
  the move-along, so a third night was free and the fine came on the
  fourth. A bed, a night not slept, another place or the cell still start
  it again. `tests/wave4-fixes.test.cjs` follows (changed by design: the
  count is 2 after the move-along); `tests/integration.test.cjs` pins it.

## Wave 6

The fifth code review's bugs 2, 5 and 6, its World risks, and the round-5
playtest's R2, R3, R4, R5, R6, R8, R9 and design notes. Tests:
`tests/wave6-fixes.test.cjs`.

- **The Missed line says what was taken** (review bug 2): "Missed: Pay
  Hollis Byrd the three hundred dollars on the title-loan note (due Day 7).
  Hollis Byrd took $150 toward it and your Prepaid phone." (from
  `State.tickObligations(day, { detail: true })`); the collector's due event
  and the news as before.
- **A town event's reward waits for its news** (review bug 6, playtest R6):
  `fireEvent` and `eventsOnArrival` apply a branch's effects with
  `holdReward: <event id>`, the ending's with `holdReward: 'ending'`; an
  event that leaves no public news releases at once (`toldOrHeld`). So the
  council resolving the police vote while the player is at the Water Tower
  prints its Resolved line (and grants +1 Wits) after the next morning's
  "Overnight in town"; at Town Hall after `/cheat time evening 6`, after the
  narration of the meeting; an ending whose narration failed, after it is
  told (and again after an `/undo` of it).
- **/cheat time** (playtest R2, R8, the design note): `catchUp({ day,
  phase, from })` runs, for each morning the jump passed, what a new day
  does first (`morningChores`: an obligation past its day is missed with
  its Missed line, a condition or a ban that ran out ends); a town seed
  (`townSeed`: no person of its own, not a loose end, grudge, favour or the
  player's past) fires as news (`fire(sd, { news: true })` returns its
  text) for setClock's "Meanwhile in town, Day N: …" lines, in day order
  with the events; the player's own come as due events dated their day.
  What a passed seed does counts from its day (`sinceDay`): a ban, a
  condition, a due day, and a seed it plants some days on (the enemy's
  follow-up comes three to five days after the jump, not minutes after its
  first beat).
- **After the ending** (the review's risk, decided): only the town's plans
  stop; people's own business (a loose end's follow-up, a grudge, a favour)
  still comes due.
- **Grudges** (playtest R3 and its design note): `freshMemory` and
  `memoryKind` skip a memory of what the person did to the player (`act:
  'own'`: the enemy's beating, the repo man's seizure, the chief's cell and
  his move-along); a grudge template with `about` answers only those kinds
  of offence (the police told of things gone missing answer a theft; a new
  one reports an assault). Exported for tests: `freshMemory`,
  `plantFeeling`, `townSeed`, `theThing`, `ROUGH_FORGIVEN`.
- **Rough nights** (the review's risk, playtest R9 and the design note):
  the first time the chief comes says how many nights it has been ("for the
  third morning running" when he was not about on the second; his memory
  "three nights running"); the fine with less than $25 "takes what you
  have, $10", with nothing "but you have nothing to pay it with"; no
  "again,"; seven clear nights after he last found the player
  (`flags.movedOnDay`, `ROUGH_FORGIVEN`) and the next time is a warning
  again.
- **Weapons** (review bug 5, playtest R4 and R5): a maker beside a bare
  number of one or two digits is no gun ("Colt 45" is malt liquor; "Colt
  .45", "Colt 1911" are guns; so "Savage 99" is none now); Taurus only with
  a model or a calibre ("Ford Taurus", "Old Taurus" are none); a can, a
  six-pack, a forty, a bottle, a tallboy or a case of a maker is a drink; a
  calibre's rounds are ammunition ("9mm rounds", "Box of .38 rounds"), and
  so are buckshot, birdshot, slugs and hollow points; spent, empty, fired
  and disposable make it none; a Taser is a gun. An arrest keeps a maker's
  capitals ("the Smith & Wesson", `Town.makerFirst`) and lowers a plain word
  ("the folding knife").
- `TIME PASSED` says "until morning, Day 4".

## Wave 8 (30 Oct 2026)

The final verification pass's World items. Tests:
`tests/wave8-fixes.test.cjs`.

- **A jump's Resolved lines under their day**: `/cheat time` prints each
  day's Resolved lines right after that day's lines ("Meanwhile in town,
  Day 6: … the vote to end the police failed", then "Resolved: Disbanding
  the police. +1 Wits.", then Day 7), not after the last day's.
  `catchUp` gives each step it returns `prog` (the length of
  `player.progression` once it had fired), so what a seed or a morning
  earned outright goes under its own day; an event's held reward
  (`thread.rewardHeld`) goes under its event's day once `setClock` releases
  it with the news. They are printed in that order, so a reload and an
  `/undo` draw them the same way.
- **A missed obligation's news told once**: an obligation with a
  `missText` and its own public `addNews` in `onMiss` (the blackmail:
  "Glenda Pryor has been telling people what you are hiding") runs that
  news with `eventId: State.missedEventId(o)` ("missed_<id>"), and its due
  event (the missText) carries the same id. `newsWaits` keeps it out of
  "Overnight in town" while the due event waits; `dueNarrated` marks it
  seen once the missText is told. The item stays in the ledger (public,
  seen) for anyone to react to; an `onMiss` news with no missText is told
  overnight as before.
- **A plan's wide effects are no place**: `noticeable` skips `WIDE_OPS`
  (`priceMultiplier`, `playerPrice`: they reach the player wherever they
  are), and a plan with a place or a person of its own counts only those:
  the thread it settles links to people all over town, so its links count
  only for a plan with neither. The bridge barriers going up while the
  player is at the Low Water (Royce, linked to the bridge vote, beside
  them) are news for the morning, not a bare quiet line there; at the old
  bridge they happen in front of the player. `tests/world.test.cjs`'s
  `seenIds` follows (changed by design).

## Wave 10 (31 Oct 2026): five-card draw

The owner: "Poker is so confusing with texts. When playing poker, there
should be a proper ui to see everything and a cheat to win." The card game
was one hidden Wits roll (a win, half on a partial, a loss) that the
narrator then described; now the player plays five-card draw against the
dealer at a table in the feed (`docs/notes/ui.md`, Wave 10). Tests:
`tests/wave10-cards.test.cjs`.

- **The deck and the hands** (`Cards`, a module of its own after Dice,
  exported as `Game.Cards`): a card is two characters ("Ks", "Th");
  `deck`, `shuffle(rng)` (Fisher-Yates), `evaluate(hand)` ({ rank 0 high
  card to 8 straight flush, key [rank, tie-break ranks], name: "Two pair,
  kings and sevens", "Full house, threes over kings", "Straight, five high"
  for the wheel, "Royal flush" }), `compare` (above 0: the first wins; 0: a
  split pot; suits never break a tie), `dealerHolds`, `draw(hand, holds,
  pile)` (new cards where the ones let go were), `deal(rng, { stacked })`.
- **The deal** (`Pipeline.dealHand(cardSeed(state), readOdds(state),
  stacked)`): a generator made with `Rng.create` from the game's seed and
  the turn number (`cardSeed`), never the live stream, so the hand does not
  move the town's dice and `/undo` (or a Stop, or Try again) deals the same
  hand; `hooks.diceSalt` is not in it. Five each, then each one's draw
  pile: the dealer's comes off the deck first, so his hand after the draw
  is known at the deal and never hangs on what the player lets go.
- **The dealer's draw** (`Cards.dealerHolds`): a straight or better stands
  pat; three of a kind, two pair or a pair keeps the matched cards; else
  four to a flush, else four to a straight (an ace low too), else his two
  highest.
- **The read** (Wits is a read, not the result): right with probability
  55% + 12% a point of Wits (the stat, -1 to 3, plus `Dice.modifiersFor`'s
  conditions, capped as rolls are), 50% to 95% (`readOdds`); the coin is
  the deal's generator. It says "Curtis is sitting on something" (a pair or
  better after his draw) or "Curtis has nothing", the opposite when it is
  wrong. The table record keeps `read: { says, right, odds, text }`.
- **The hand** (`gamble`, async now; runTurn awaits it): the no-game cases
  are as before (shut, no game, nobody dealing, no money: no table). The
  stake is `stakeFrom`. The turn's status is `cards` ("Your hand"); the
  table is drawn (`UI.feed.cards`) and the turn waits for the player
  (`waitForHand`; `Pipeline.playHand({ hold: [0-4] })` or `({ fold: true
  })`; `hooks.cardsPlay` answers the next hand at once, for tests and the
  console). Draw replaces what is not held; the better hand wins. Money
  (`State.apply({ goldDelta })`): a win +stake, a loss −stake, a split 0, a
  fold −half the stake rounded down. A hand takes a short.
- **The marked deck** (`markedDeck`, the same test as before): the
  dealer's cards are face up while the hand is open, and once it is played
  (a draw or a fold) the one roll is made: Wits against normal, +2 for the
  deck, no complication, shown with `UI.feed.roll` under the table; a
  natural 20 still earns a story point. A fumble is caught cheating with
  every consequence as before (the deck taken, −20, a weight-3 memory,
  banned three days with today, the news, put out on the street outside),
  and the hand is void: the stake is lost whatever the showdown said
  (`result: 'caught'`). Without a marked deck nothing is rolled: no
  `needsRoll`, no `ROLL` line, and the old "accused on a fumble" case (a
  one-night ban, −10) is gone; an armed `/cheat fumble` waits for the next
  real roll.
- **`/cheat cards`** (`Pipeline.cheatCards`, `hooks.cardsCheat`): "Cheat
  armed: the next hand is yours." The next deal is stacked: three of one
  rank and two of another for the player, the fourth of the three and the
  other two of the pair first in their draw pile (so whatever they hold
  they end with a pair or better), and a dealer hand drawn from the other
  ranks that his own rule takes to nothing. Free: no catch roll even with a
  marked deck, nothing recorded about cheating; the record says `cheat:
  true`. A turn that does not go through (Stop, an error) gives the cheat
  back (`cheatTaken`).
- **Stop** (`Pipeline.abort`) rejects the open hand as `aborted`: the turn
  fails cleanly (the snapshot back, no money moved, the table out of the
  feed, the line back in the box).
- **What the turn keeps**: `ctx.cards` (the finished table) goes on the log
  entry as `cards` ({ stake, dealerId, dealerName, marked, cheat, read,
  player and dealer: { dealt, held, final, name }, result: win | lose |
  split | fold | caught, delta, cash }), sanitised by State's `logCards`
  (five valid cards a side, or nothing is kept). `ctx.gamble` keeps
  `{ played, stake, delta, result, caught, folded, cheat, dealerId, deck,
  player, dealer, tier }` (no `accused` any more).
- **The narrator** (OUTCOME): "the card game (the player put up $20): the
  player's two pair, kings and sevens, beats Curtis Pruett's pair of aces
  at the showdown: the player wins $20 (cash now $45). The money has
  already changed hands. The table was shown to the player card by card
  already: tell the moment and the people, do not list the cards again."
  A loss "loses to", a split "ties … a split pot, and no money changes
  hands (cash still $25)", a fold "the player folds ace high before the
  draw and gives up half the stake: the player loses $10", caught "the
  player loses $20, and Curtis Pruett catches them cheating with the marked
  deck; the hand is void" with the thrown-out and street lines as before.
  A marked deck not caught adds "The player read the dealer's cards off
  the marked deck through the hand, and Curtis Pruett did not catch it."
- **The bookkeeper**: "CARD GAME (already applied by the engine; do not
  record again): the player wins $20 at cards (cash now $45); record no
  goldDelta for it." (loses, "breaks even (a split pot)", "folds and loses
  $10"); its goldDelta is still ignored (`cleanDiff`).
- **The demo** (`mockGamble`): "At Curtis Pruett's table, your two pair,
  kings and sevens, beats Curtis Pruett's pair of aces, and you come out
  $20 ahead." (loses, splits the pot, "you fold your ace high and give up
  $10", caught as before); a marked deck not caught adds "Curtis Pruett
  never spots the marks."; the generic roll sentence ("Wits roll, success:
  it works.") is not said for a hand.
- **Tests changed by design**: the card tests in
  `tests/transport-fixes.test.cjs` (the showdown decides, a cheat wins, a
  fold is half), `tests/wave2-fixes.test.cjs` (no accusation without a
  marked deck), `tests/wave3-fixes.test.cjs` (bug 7: caught is three days;
  the accusation's night is gone), `tests/prompts-fixes.test.cjs` (the
  demo's words), `tests/wave5-fixes.test.cjs` (Q13: the accused player's
  line is gone; the caught one still ends on the street) and
  `tests/wave6-fixes.test.cjs` (the `/help` row); the rest that bet set
  `hooks.cardsPlay`.

## Wave 11 (31 Oct 2026): the card game after QA

QA's findings on the wave 10 card game, and the rules as built now (the
table: `docs/notes/ui.md`, Wave 11). Tests: `tests/wave11-cards.test.cjs`.

- **A dealt hand is final (M1).** Once the cards are dealt the ante is in.
  `Pipeline.abort` with a hand open resolves it as `{ fold, stopped }`
  instead of rejecting it: the fold price, the marked deck's catch roll,
  the record (`folded`, `stopped`), and the turn goes on to be kept, told
  by the engine (`plainNarration(ctx, 'folded')`: "You fold your pair of
  nines, get up from the table and give up $10."), with no narrator and
  no bookkeeper. After the showdown the hand is final: when the narrator
  throws (a network error, Stop while "Writing…") or declines, runTurn
  keeps the turn with `plainHandText` ("The hand is played: your two pair,
  kings and sevens, beats Curtis Pruett's pair of aces. You win $50.";
  loses to, ties, the fold, caught: "Curtis Pruett catches you with the
  marked deck: the hand is void. You lose $20 and the deck, and you are
  out on Front Street."). A plainly told turn empties `ctx.due` (what came
  due waits for the next narration), does not mark the scene change told,
  and asks no bookkeeper (the engine already moved the money and wrote
  what being caught does); the bookkeeper's own failure path (narration
  stands, not recorded, one retry) is as before.
- **A page closed on a hand (M1).** `Storage.holdHand` writes the hand
  (`novatria.hand`: the game's `createdAt`, the turn, the input, the Say
  addressee, the parsed action) when the cards are dealt, and again with
  the record and the catch die once it is played; runTurn's `finally`
  drops it. `App.load` then calls `Pipeline.resumeHand()` (after
  Continue's recap): the same game at the turn before plays that turn at
  once, `resume: 'open'` (folded, as Stop would, the same cards from the
  seed) or `'played'` (replayed from the record, the catch roll forced to
  the same die), told plainly ("The game was closed with a hand on the
  table, so the hand is folded and the ante is gone." / "… after this hand
  was played. It stands …"). The stored hand is used up.
- **`/undo`** of a kept hand is still the game's undo; a redone turn with
  the same words deals the same cards by design (the seed and the turn).
- **The fold price (L4)** is `foldPrice(stake)`, half rounded up: $1 of $1,
  $10 of $20, $13 of $25 (was rounded down, so a $1 fold cost nothing).
- **Stakes (M5)** come from `stakeFor(text, gold)` → `{ stake, named,
  note }`: "$50", "50 bucks", "$2.50" (whole dollars: $2), "-$5"
  (negative), "fifty dollars" and "a hundred bucks" (`Style.numberWords`,
  exported with `Style.NUMBER_WORD`), a bare number after a bet ("I raise
  20", "I'm in for fifty", "I put 30 in"); "everything", "all I have",
  "all in" is all the cash; nothing named, $0 or less is the usual $20.
  Never more than the cash. `note: 'all'` when the stake is all the cash
  (asked for, capped, or all of it), `'usual'` when the amount named was no
  stake; the table record keeps `stakeNote` and `named`, and the OUTCOME
  says "(the player put up $140, all they have; they named $500)" or
  "($20, the usual stake: −$5 is no stake)".
- **The split pot (M6).** "The money has already changed hands." follows
  the OUTCOME only when money moved.
- **The read (S3)** is right 60% + 12% a point of Wits, 50% to 95%
  (`READ_BASE`, `READ_STEP`), and reads on the man: `readText` "Curtis has
  something" / "Curtis is bluffing" (`says` stays 'something' |
  'nothing').
- **Say mode (H2).** `sayAction(a, sp, words)` keeps `gamble` when the
  parser said so, or when the words bet (`wordsBet`: "deal me in", "I'm in
  for $50", "ante up", "I'll play a hand", "another hand", "raise", "all
  in", "I raise $20", "put $30 in"…; "I'm in trouble", "raise your glass",
  "I bet you are tired" and "we're all in this together" are not) where
  there is a card game; anything else is talk as before. `gamble` deals when the dealer was spoken to or
  everyone was, and otherwise gives the no-game line ("the player said it
  to Loretta Gaddis, and Curtis Pruett is the one who deals"). The
  parser's Say MODE line allows gamble for such words.
- **Caught (L6, M4).** The OUTCOME names the first day from the ban's end
  that the place is open (`openDayFrom`: "back on Monday, Day 5" when Day
  4 is a Sunday the bar is shut) and says the dealer "won't deal to them
  for a week". The catch sets `flags['cardsCaught.<dealer id>']` to the
  day; `dealerRefusal` makes him refuse for `DEALER_GRUDGE_DAYS` (7, that
  day counted), and while his attitude is under `DEALER_COLD` (-10): the
  no-game reason "Curtis Pruett won't deal to the player, not since
  catching them cheating at cards on Day 2" (or "not the way things stand
  between them"). `dueHold(ctx)` passes `World.dueSeeds` a `hold`: on the
  turn he throws the player out, an event whose person is the dealer, or
  whose place is this one (a location trigger, or a scene here), stays due
  for a later turn; and for that week an event of his that is not about an
  obligation waits too (the poker hustler's invitation to his Friday game
  is not told on the street the turn after).
- **Nobody dealing (L7)** says when the dealer does (`dealerHours`, from
  who sits at the table each phase today): "nobody is dealing right now
  (Curtis Pruett deals in the afternoon, evening and night), so there is
  no game to sit in on".
- **The catch roll (L9)** is labelled in `roll.line`: "Does Curtis spot
  the marks? Wits 17 + 3 = 20 vs 12 · Success" (`packetLine` as before).
- **`/reroll` and `/cheat <tier>` (L5).** A redo of a gamble turn passes
  the log entry's table (`replayCards`) to runTurn: `gamble` replays it
  (the same cards, holds or fold; no table to play) and only the catch
  roll is new. A hand with no roll says "Nothing to reroll: the cards were
  dealt." (`/cheat <tier>` adds that before arming the next roll).
- **`/cheat cards` (L2)** is `flags.cardsCheat` (the engine-only State op
  `cardsCheat: true | false`; a reserved flag): a reload keeps it; the
  hand it is spent on spends it even when folded or stopped; a failed turn
  gives it back with the snapshot; `/undo` (and `/reroll`) keep an armed
  cheat armed (`keepCheat`) and an `/undo` of the hand it won arms it
  again ("You took back the last turn. The cards cheat is armed again: the
  next hand is yours."); a second `/cheat cards` says "Already armed: the
  next hand is yours." `hooks.cardsCheat` is gone; `hooks.cardsDeal` deals
  the next hand as given (tests, the console).
- **The demo (L1, L8, H2).** `MOCK_GAMBLE` reads "another hand", "deal
  again", "one more hand", "deal me another", "I play a hand", "let's
  play", "I sit down at the card table", "I raise $20", "I go all in",
  "I'm in for $50" as a bet ("I raise my glass" is not). `mockGamble`
  says "Curtis Pruett won't deal to you, not after the marked deck.",
  "It's Curtis Pruett who deals, and you said it to Loretta Gaddis.", and
  "Nobody is dealing right now, so there is no game to sit in on. Curtis
  Pruett deals in the afternoon, evening and night." A Say bet is told as
  the hand, not as a reply. The filler line after a hand is never "Nobody
  … pays you much mind", and after being thrown out "Behind you, the Low
  Water carries on without you." (not "It stays quiet …").
- **Fold words (L11)**: the OUTCOME says "the player folds their pair of
  nines before the draw".
- **Tests changed by design**: `tests/wave10-cards.test.cjs` (see
  `docs/notes/ui.md`, Wave 11), `tests/transport-fixes.test.cjs` (the
  cheat is armed with `State.apply({ cardsCheat: true })`) and
  `tests/wave3-fixes.test.cjs` (bug 7: the ban's day is the first the bar
  is open, with its weekday).

## Wave 12 (31 Oct 2026): the card game after the second QA

The second QA pass's findings on the card game, and the rules as built now
(the table: `docs/notes/ui.md`, Wave 12). Tests:
`tests/wave12-cards.test.cjs`.

- **A stored hand is bound to its game (M2).** `Storage.holdHand` writes
  `handMark(s)` with the hand: the game (`createdAt` and `seed`), the turn
  and `storyMark(s)` (a hash of the log's length and its last entry's day,
  phase, input and narration), plus the tab that dealt it and a token.
  `Pipeline.resumeHand()` resumes it only when all of these match the game
  just loaded at the turn before; otherwise it drops it, so loading an
  older save of the same game (or another game) and playing on to the same
  turn never folds a hand the player did not play there. `App.begin` (New
  game) drops it too. Only a tab another tab has taken over leaves it (it
  is that tab's). runTurn's `finally` drops only its own hand
  (`Storage.dropHand(token)`).
- **Two tabs (L3).** `Storage.tabId` is kept in sessionStorage (a reload is
  the same tab). A tab that loads the game (Continue, Load, Play here
  instead) holds it and resumes the hand: one dealt in another tab is
  folded with "A hand was left open in another tab, so it is folded here
  and the ante is gone." (or, played, "A hand was played in another tab
  before this one took over. It stands …"); one from this tab's reload
  keeps the wave 11 notices. The tab that lost the game voids its open hand
  (`Pipeline.voidHand`: the hand's promise rejects with `type: 'void'`,
  runTurn restores its snapshot without taking the table out of the feed,
  and nothing is called or saved).
- **The invitation waits while he will not deal (M3).** `dueHold` holds a
  dealer's non-obligation due events while `dealerRefusal` is true for any
  reason: the week after he caught the player (as before) and while his
  attitude is under `DEALER_COLD` (-10). A dealer is `isBookie` or
  `isCardDealer` (what `dealerOf` looks for).
- **`/cheat cards` on a resumed hand (L1).** A hand played before the page
  was closed is replayed from its record; it spends an armed cheat too (the
  autosave from before the turn still had it armed).
- **The catch roll (L2)** is labelled "Keeping the marks from Curtis:
  Wits 17 + 3 = 20 vs 12 · Success" in `roll.line` (a success is the
  player's: he did not notice).
- **A closed page's fold (L4)** is recorded `closed: true` (not `stopped`;
  State's `logCards` keeps it) and told "You fold your pair of nines, get
  up from the table and give up $10."
- **The narrator failing after the showdown (L5)**: the notice says what
  happened and how the hand stands, with no "try again"
  (`NOTICES.handUntold`): "The narrator could not be reached. The hand
  stands: you win $50." ("you lose $20", "a split pot", "you fold and give
  up $10", "you are caught cheating and lose $20"; a code error: "The story
  could not be written. …"). The error goes to the console and the debug
  log.
- **Bets that are not bets (L7).** `Style.betTalk(text)`: null (no bet or
  wager), `'clause'` (a bet followed by a clause: "I bet he is lying", "I
  bet you ten bucks it rains tomorrow", "I bet you are tired", "I bet
  Curtis is bluffing"), `'bet'` (the cards, a hand, the game or the pot
  named, or a bare stake: "I bet $20", "I'll bet you fifty.", "I bet a
  fiver", "I bet it all", "I bet half my money"), `'bare'` ("I bet.") or
  `'other'` ("I bet my watch", "I bet $20 on it"). `wordsBet` (Say mode)
  takes `'bet'`; `sayAction` makes a parser's gamble talk when the words
  are only a clause (`betIsTalk`); the demo's parser takes `'bet'` and
  `'bare'` (bet and wager are no longer in `MOCK_GAMBLE`). The parser's
  GAMBLE rubric and the Say MODE line say "I bet he is lying" is talk.
- **Stakes (L8).** `stakeFor` keeps the amount named to the cent ("0.50
  dollars" is named 0.5; under $1 is the usual $20, `note: 'usual'`, and
  the OUTCOME says "$20, the usual stake: $0.50 is no stake",
  `moneyNamed`); "a fiver" is $5, "a tenner" $10, "two grand" $2000;
  "half my money", "half of what I have" is half the cash rounded down, at
  least $1 (`note: 'half'`, "$70, half of what they have"); "I bet it
  all" is all of it; "I'll bet you fifty" is $50. `logCards` keeps
  `stakeNote: 'half'` and a `named` with cents.
- **One day for one ban (L9).** `banBackDay(ban)` is `openDayFrom` from the
  ban's `untilDay`: `shutReason` (the walk to the door, the narrator's
  packet, the demo's "you are not welcome there until Day 5"), `/skip`
  there, the People card and the Places card name the day the OUTCOME
  names ("back on Monday, Day 5").
- **The demo names who the player knows (L10).** The no-game lines use the
  Say picker's label (`npcLabel`) for someone not met: "It's the insurance
  man who deals, and you said it to the owner and bartender.", "The
  insurance man deals in the afternoon, evening and night."
  (`dealerHours(l, true)`); the narrator's CARD GAME line keeps the names.
- **Tests changed by design**: `tests/wave11-cards.test.cjs` (see
  `docs/notes/ui.md`, Wave 12).

## Wave 13 (31 Oct 2026): hold'em, more seats, the win cheat

The owner: "Keep both and build holdem too" (the game "where you have 2
cards"), "for some games have it so there's more than the 2 of us. Keep the
backslash cheat win or something so it narrates my win without playing",
"when the game start have a cheat win somewhere so i can skip the whole
game and win". Curtis Pruett's table now plays five-card draw or Texas
hold'em, with up to three of the Low Water's card players besides him (the
table: `docs/notes/ui.md`, Wave 13; the card players:
`docs/notes/content.md`, Wave 13). Tests: `tests/wave13-holdem.test.cjs`.

- **The game.** `gameFrom(words)`: hold'em, holdem, hold em, texas →
  `'holdem'`; draw, five-card, five card, 5-card, draw poker → `'draw'`
  (the last named, unless it is the one being left: "not draw, hold'em",
  "hold'em instead of draw"; "draw my gun" is no game). With no game in
  the words the remembered one (`flags.cardGame`, the engine-only State op
  `cardGame: 'draw' | 'holdem' | false`, a reserved flag, saved with the
  game); with neither, `gamble` opens the chooser (`UI.feed.cards({ choose
  })`, `waitForHand(…, 'choose')`) before anything is dealt or stored:
  Stop there rejects the turn as `aborted` (no cost, the line back in the
  box). Choosing or naming a game remembers it (`record.chose`, so a
  replay or a resumed hand remembers it again); the chooser's Win does not.
- **The seats** (`cardPeople`, `seatsFor`): the people present who are
  tagged `cardplayer` (or, in a game saved before this wave, whose
  `TOWN_DATA` record is), alive, not the dealer, attitude above -25, in the
  place's order. Per hand, from the hand's seed (`Rng.create(seed ^
  0x2545f491)`, not the town's dice): none, one or two of them, each a third
  of the time. The words first: `seatWords` 'all' ("deal everyone in",
  "everyone in", "the whole table") seats all of them, three at most;
  'none' ("heads up", "just me and Curtis", "just us") nobody else.
  `hooks.cardsSeats` (tests, the console) fixes them (ids of card people
  here; `[]` heads up) until a reload; a hand dealt as given
  (`hooks.cardsDeal`) has its own (`set.seats`) or none. The order at the
  table: the player, the seats, the dealer last.
- **Money.** The stake S (`stakeFor`, as before) is the most the player
  can lose; every seat risks the same, so there are no side pots. Draw:
  every seat puts up S, the best hand takes the pot (S × seats), a fold
  costs `foldPrice(S)` as before (heads up the hand ends there and Curtis's
  cards show as dealt; with others they draw and settle it among
  themselves). Hold'em: `unitFor(S)` = max(1, floor(S/5)); every seat antes
  it; on each of four streets (pre-flop, flop, turn, river; the board
  turned 0, 3, 4, 5) the player acts first (Check or Bet u), then each
  other seat in order; with a bet on the table each calls or folds, with
  none each may check or bet (the first bettor sets it); a bet sends
  everyone who has not matched it round again (the player gets Call u /
  Fold). No raises, so a seat puts in five units at most, never more than
  S (`h.cap`: under $5 a street with no room for a bet is checked
  through). Everyone else folding gives the player the pot at once
  (`uncontested`); the player folding settles the hand among the others at
  once (the board dealt out, the best of them takes it) and costs what the
  player put in. `settlePot(sides)`: the best of the live sides (by
  `Cards.evaluate` keys), all of them on a tie, the pot split evenly, the
  odd dollars to the player when they share it, else to the first winner.
  `delta` = what the player took back − what they put in (heads-up draw:
  ±S, 0, −fold price, as before).
- **Hold'em, pure** (`holdemRun(h, moves)`): from `h` ({ seed, unit, cap,
  stacked, board, seats: [{ key, hole, tilt }] }) and the player's moves
  (check, bet, call, fold, win) it plays the hand as far as the moves go
  and returns { street, in, folded, foldedOn, status (what each seat last
  did: "checks", "bets $4", "calls $4", "folds"), reads, pot, need (the
  player's choices) | done (playerFolded, uncontested, showdown) | win }.
  The live hand (`holdemHand`) redraws the table (`UI.feed.cardsShow`)
  after each move and waits (`waitForHand(…, 'holdem')`); a resumed or
  replayed hand runs the same moves to the same place.
- **Seat play** (`seatMove`): strength from `Cards.strength` (before the
  flop `Cards.preflop`: a pair from .55 to 1, else by the two ranks, a
  little more suited or close; after it what the cards make with the
  board, less when the board makes it alone, and a draw to a flush or a
  straight before the river) and a tilt from the personality (`tiltOf`:
  +0.1 for each of reckless, greedy, sly, ambitious, smooth, charming,
  ruthless…, −0.1 for each of cautious, cowardly, gloomy, honest,
  careful…, ±0.15 at most). No bet to face: bet at 0.62 − tilt or more,
  else a bluff when the coin is under 0.1 + tilt, else check. Facing a bet:
  call at 0.3 − tilt before the flop, 0.38 on the flop and the turn, 0.45
  on the river, or when the coin is under half the bluff chance; else fold.
  The coin (`coin(seed, seat, street, ask)`, `Rng.valueAt`) is the hand's
  own, so a hand plays the same after a reload, an `/undo` or a replay. At
  draw the seats draw by `Cards.dealerHolds` (the dealer's rule).
- **Best of seven** (`Cards.best(cards)`: the best five of five to seven,
  `{ cards, rank, key, name }`; `Cards.compareKeys`); `Cards.holdem(rng,
  n)` deals two to each seat round the table and the board after;
  `Cards.holeName` names two hole cards ("Pair of jacks", "Jack high");
  `Cards.deal(rng, { seats })` deals the extra draw seats from after the
  first twenty cards, so a heads-up deal is as before.
- **The reads** (hold'em): a seat's first bet gets a read (`holdemReads`):
  the truth is whether the bet was a bluff (the coin) or a value bet; it
  says so with the read's odds (`readOdds`, 60% + 12% a point of Wits,
  50–95%), from the hand's seed; "Leon has something" / "Leon is
  bluffing" (`readText`). The verdict shows after the showdown (not after
  the player folds, not on a win cheat). Draw keeps the dealer's read. None
  with a marked deck.
- **The marked deck**: every seat's cards face up; the catch roll exactly
  as before (once per hand, after it is played, "Keeping the marks from
  Curtis: …"); caught, the hand is void and the player loses S.
- **`/cheat cards`** at hold'em: `Cards.holdemStacked` gives the player a
  pocket pair whose two other cards are on a board with no other pair and
  no three of a suit, so four of a kind nobody can match or beat; `h.stacked`
  makes the others call every bet before the flop. At draw with seats the
  seats get hands that draw to nothing (`stacked(rng, extra)`).
- **`/cheat win`** (`Pipeline.cheatWin`, `winArmed`, `keepWin`; the
  engine-only State op `cardsWin`, `flags.cardsWin`, reserved): "Cheat
  armed: the next hand is yours without playing." / "Already armed: the
  next hand is yours without playing." The next bet is not played: no
  chooser (with no game named or remembered, hold'em), a stacked deal,
  `holdemRun(h, ['win'])` (or the draw's stand-pat full house), every seat
  still in calls every street (`in` = min(5u, S) at hold'em, S at draw),
  the pot forced to the player (`settlePot(sides, true)`): (seats − 1) × 5u
  at hold'em, (seats − 1) × S at draw. No catch roll, nothing about
  cheating; the seats' memories as for any win; `record.win: 'armed'`.
  `/undo` of the hand arms it again ("The win cheat is armed again: the
  next hand is yours without playing."), `/reroll` keeps an armed one, a
  resumed played hand spends it (the pre-turn autosave still has it).
- **The Win (cheat) control** (`playHand({ win: true })`, any open table):
  on the chooser it is the armed win at hold'em (not remembered as the
  game); mid-hand it ends the hand the player's (`record.win:
  'control'`): what was put in stays, every seat still in calls every
  street, and the cards still hidden are dealt so the player's hand is the
  best (`rigHoldem`: the player's two and the board already turned stay,
  the rest of the board dealt, the cards of the seats still in kept when
  that works, else replaced, a seat that folded keeping its own; `rigDraw`: the player's five as dealt stay, they keep their
  best group and draw the rest of its rank first, the others keep theirs
  when that still loses). If nothing can make the player's hand the best
  (a board that plays for everyone), the pot is still the player's.
- **What the seats make of it** (`seatMarks`, through `State.apply`, not
  when caught): a seat that loses the most it could to the player (S at
  draw, min(5u, S) at hold'em — the stake whenever it is a multiple of $5)
  gets "lost $20 to {player} at cards at the Low Water" (weight 1) and
  attitude −2; one that takes a pot the player had money in gets "took a
  pot off {player} at cards at the Low Water" (weight 1) and +1. Not the
  dealer: it is his game, and his attitude decides whether he deals
  (`DEALER_COLD`), so a winning streak (or the win cheat) does not end it.
- **The record** (`logCards`): `game`, at hold'em two cards dealt a side,
  `board`, `shown`, `street`, `unit`, `moves`; each side's `in`, `won`,
  `folded`, `foldedOn`, `read`; `seats` ([{ id, who, …a side }], three at
  most); `pot`, `winners` ('player' or ids), `showdown` (the result before
  any catch, so a replay can catch again), `uncontested`, `win` ('armed' |
  'control'), `chose`. A side's `final` is null at hold'em when it never
  showed. A wave 10–12 record (heads up at draw) is still kept and drawn;
  `playedHand` works its pot out again for a `/reroll`.
- **The stored hand** (`holdThis`, `storeHand`): the card game
  (`cardGame`, not `game`, which `handMark` uses for the game's id), the
  seats, the player's moves so far (written before each decision) and, at
  hold'em, the deal; `resumeHand` passes them on (`storedHand`), so a
  page closed mid-street folds there with the same cards and moves
  (`record.closed`).
- **The narrator** (OUTCOME): "the card game (the player put up $20):
  five-card draw, heads up with Curtis Pruett; the player's … beats Curtis
  Pruett's … at the showdown: …" (heads-up draw, as before after the
  game); "the card game (the player came in for at most $20; the ante and
  every bet $4): Texas hold'em with Royce Pittman and Curtis Pruett, Curtis
  Pruett dealing; Royce Pittman folded on the turn; Curtis Pruett showed a
  pair of tens; the player's two pair, aces and nines, takes the $28 pot:
  the player wins $16 (cash now $96)." (`tableWords`; a fold "the player
  folded their pair of nines on the flop and gave up the $8 they had put
  in", everyone folding "everyone else folded, so the player takes the
  $16 pot without a showdown", a split "splits the $40 pot with Curtis
  Pruett: no money changes hands"), the stake note as before, "Already
  recorded: Royce Pittman lost $20 to the player and holds it against them
  a little" when a seat's memory was written, and the standing "The table
  was shown to the player card by card already: tell the moment and the
  people, do not list the cards again." A win cheat is told as a plain
  win; caught keeps its line. The bookkeeper's CARD GAME line adds "The
  other players were …, with Curtis Pruett dealing; what they remember of
  the hand and how they feel about the player are recorded already: record
  no memory or attitude change for the hand." `plainHandText` and
  `handOutcome` tell the pot and who took it; heads-up draw as before.
- **The parsers.** The real parser's GAMBLE rule and the Say MODE line say
  the game and who sits in may be named in the words (the engine reads
  them from the input). The demo's parser (`MOCK_GAME_WORDS`), Say mode's
  `SAY_BET` and `Style.betTalk`'s card words read "deal me in at
  hold'em", "a hand of draw", "deal everyone in", "heads up with Curtis"
  as a bet; a bare "Heads up!" is not one.
- **The demo** (`mockGamble`): "At Curtis Pruett's table, Texas hold'em
  with Royce Pittman: Royce Pittman folds on the turn; your two pair, aces
  and nines, takes the $28 pot, and you come out $16 ahead." (and the
  draw with seats, a fold, a loss, a split); heads-up draw as before.
- **`/cheat`**: `/cheat win` is the win cheat ("win" was an alias of
  `/cheat success`; the roll cheat keeps success, succeed and pass). The
  `/help` row: "Cheat: redo the last roll (success, partial, fail, crit,
  fumble or 1-20), win your next hand at cards (cards), win it without
  playing it (win), or set the clock (forward only)".
- **Tests changed by design**: `tests/wave10-cards.test.cjs`,
  `tests/wave11-cards.test.cjs`, `tests/wave12-cards.test.cjs` (draw
  remembered and heads up in their setup, after a reload too; the head
  names the game; the hint ends with how to switch and the Win (cheat)
  control; OUTCOME names the game and the table; the `/help` row),
  `tests/transport-fixes.test.cjs`, `tests/prompts-fixes.test.cjs`,
  `tests/wave2-fixes.test.cjs`, `tests/wave3-fixes.test.cjs`,
  `tests/wave4-fixes.test.cjs` (draw remembered, heads up, where they bet)
  and `tests/wave6-fixes.test.cjs` (the `/help` row). `tests/helpers.cjs`
  has `presetCards(page, { game, seats })`.

## Wave 14 (31 Oct 2026): the card table after the hold'em QA

A QA player played about 300 hands of the wave 13 table (hold'em, more
seats, the win cheat) and reported 4 bugs, 11 rough edges and 9 nits; all
but one (the identical hand after `/undo`, by design) are fixed as decided
(the table's side: `docs/notes/ui.md`, Wave 14). Tests:
`tests/wave14-holdem-fixes.test.cjs`.

- **The win cheat changes nothing the player has seen (QA #1, #13).** Seen
  is the player's own cards, the board turned so far and, with a marked
  deck, every seat's cards. Mid-hand (the Win (cheat) control, or
  `/cheat win` typed with the hand open) at hold'em: the deal stands when
  it already makes the player's hand strictly the best of the seats still
  in (`beatsAll`); else `rigHoldem(rng, holes, board, shown, live, marked)`
  deals the board still to come with every hole card kept (every card with
  one to come, every pair with two, 3000 boards with five), and only with
  no marked deck changes the hidden hole cards of the seats still in (a
  seat that folded keeps its own). At draw `rigDraw(rng, player, others)`
  keeps every hand as dealt and what each other seat holds by the dealer's
  rule; only the draws are dealt: the player keeps their best group (or,
  failing that, the cards of one rank, or the highest) and draws the rest
  of its rank first on every other try, the others' draws are dealt from
  what is left so they lose. When nothing works (a board complete under a
  marked deck, a royal flush on the board, a pat four aces), the others
  fold to the player instead: at hold'em on the street the hand stands on
  (the player first calling a bet they faced, so no bet nobody matched is
  won), with `foldedOn` that street, the board as turned and the record
  `uncontested`; at draw they throw their hands in (`folded`, `final` the
  hand as dealt, no name). The player takes the pot as it stands.
  `settlePot` has no `force` any more: the cards (or everyone folding) make
  the player's hand the best, so the pot goes as any pot does, and no tie
  or weaker hand is ever shown taking it. An armed `/cheat win` (no table
  shown, nothing seen) keeps its stacked deal and its winnings as built:
  (seats − 1) × min(5u, S) at hold'em, (seats − 1) × S at draw.
- **The player folding with a bet unanswered (QA #2).** `holdemRun` no
  longer returns at the player's fold. The street's queue goes on: a seat
  that still owes a bet calls or folds it by `seatMove` (the same coin), a
  seat with nothing to answer checks, nobody bets after the player has
  gone, and the later streets are checked down. It returns `playerFolded`
  (with `showdown` when two or more are still in), so a seat that never
  matched a bet cannot win it and the record's `in` shows the calls. Stop,
  the reload fold ("You left the table") and the two-tab fold play the
  same `fold` move, so they take the same path.
- **Statuses (QA #5).** At each new street `holdemRun` clears the status of
  every seat still in; a folded seat keeps "folds" (the table says when).
- **The street of the record (QA #6).** `street` is 4 (the Showdown)
  whenever the board was dealt out (a showdown, or the player's fold played
  out by the others), else the street the hand stopped on (everyone folding
  to someone); `shown` is the cards turned.
- **Seat memories (QA #3)** (`seatMarks`, `SEAT_MARK_MIN` = $10): a losing
  seat gets "lost $X to {player} at cards at the Low Water" and −2 only
  when it lost the most it could and that most is $10 or more (the stake at
  draw, min(5u, S) at hold'em: never at a $1 to $9 stake); a seat that took
  a pot gets "took a pot off {player} …" and +1 only when its share of what
  the player put in is $10 or more (floor of the player's `in` × its `won`
  / the pot); and each seat has at most one such change a day, the first
  (the effect `setFlag` `cardsMark.<id>` = the day, written with it; a seat
  marked today is skipped). Curtis still never moves. A `/reroll` or
  `/undo` restores the flags with the turn.
- **Names at a showdown (QA #9).** `Cards.namesApart(finals)` names the
  hands shown together; two that share a name but differ get the deciding
  cards ("Pair of aces, nine kicker" / "eight kicker", "Two pair, jacks and
  eights, queen kicker", "Three of a kind, sevens, ace kicker", "Four of a
  kind, twos, king kicker"; a flush or high card by its top cards up to
  where they differ, "Flush, ace-king high" / "Flush, ace-queen high",
  "Ace-king high"); an exact tie keeps one name. Used for the record's
  names at hold'em and at draw, so OUTCOME, the plain line and the demo say
  the same.
- **The cap (QA #16).** `holdemCap(S, u)` = min(5u, S); `capWords(rec)` is
  the stake as before when they are equal, else "$20 of the $23 named" (the
  note in brackets: "(all they have)", "(half of what they have)"). OUTCOME:
  "the card game (the player came in for at most $20 of the $23 named; the
  ante and every bet $4)". `seatMarks` uses the same cap.
- **The words (QA #17).** `DRAW_WORD` no longer reads "draw to", "draw
  into", "draw one/two/three/four/five", "draw 1-5", "draw another", "draw
  some", "draw new" (with "a", "the", "my", "on" and the rest as before),
  nor "five cards" right after "draw" ("I draw five cards"). The last game
  named still wins ("I play texas hold'em, draw poker is for old men" is
  draw).
- **Varied cheat hands (QA #20).** `Cards.holdemStacked(rng, n)` picks a
  shape from the seed (`STACK_SHAPES`: a set, the nut flush, the top
  two of a straight six-high to king-high, a full house over the board's
  pair, four of a kind), checks the player's seven make exactly that, and
  gives each other seat two cards from a sample of 120 pairs: one of the
  three best that still lose to the player (`stackOthers`), so they hold a
  pair, two pair, a lower straight or flush… After 40 tries it falls back
  to wave 13's four of a kind (`quadsStacked`). At draw `stacked` deals a full house
  (as before), a flush (the pile five more of the suit: any draw stays a
  flush) or a straight (the pile five cards of its ranks: any draw keeps
  the straight or a pair), and the others still draw to nothing. `/cheat
  cards` at hold'em still makes the others call every bet before the flop.
- **/reroll after a cheat win (QA #12).** A hand the win cheat ended
  (`record.win`) answers "Nothing to reroll: that hand was yours."
  (`NOTICES.cardsWon`) and the cheat stays spent: only `/undo` of the hand
  arms it again; `/reroll` keeps a cheat that is armed and not yet used.
- **The chooser (QA #18, #19).** `status('choose')` while the chooser is
  open ("Choose the game: Five-card draw or Texas hold'em. Stop leaves the
  table (nothing lost)."), `status('cards')` once it is answered. Another
  tab taking the game over with the chooser open (`voidHand`, `kind`
  'choose') rejects the turn as `{ type: 'void', chooser: true }`: the turn
  is taken back as Stop takes it (its lines out of the story, the line back
  in the box) with the notice "Another tab took over; the table is closed
  here." (`NOTICES.chooserVoid`); nothing was dealt or stored, so nothing
  is lost in either tab.
- **The narrator.** `tableWords` heads up: "Curtis Pruett folded on the
  river; the player takes the $16 pot without a showdown" (not "everyone
  else"); a heads-up draw thrown in is told as the table's are, not as a
  showdown. `plainHandText`: "Curtis Pruett folds, and the $16 pot is
  yours" heads up.
- **The demo (QA #14, #15, #21).** `MOCK_GAMBLE` reads "a hand of cards"
  (another, one more; of poker too) and "sit in" when it ends the line or
  is followed by for, with, tonight, today or this ("Mind if I sit in?",
  "Can I sit in for a hand?"; "I sit in the corner" is not a bet);
  `MOCK_GAME_NAME` reads a game named in a line of eight words or fewer
  ("hold'em? no, five card draw", "texas hold'em, twenty bucks"; "I ask
  Curtis about hold'em" stays talk). The stake is the words' or the usual,
  the game the last named. `mockGamble` heads up: "Curtis Pruett folds to
  you on the turn, and the $24 pot is yours", never "everyone"; a draw
  thrown in is told as a fold. The arrival line leaves out the action's
  targets, and after a hand of cards nobody "arrives" at all (the people
  who came in while the player waited were at the table for it).
- **Tests changed by design**: `tests/wave13-holdem.test.cjs` (the hint
  without the switch line, the cleared statuses at a new street, the
  three-handed fold's $4 moves nobody, the chooser's hint, the nudge, the
  `/cheat cards` hand's shape), `tests/wave10-cards.test.cjs` (the stacked
  draw is a made hand of three shapes; the nudge),
  `tests/wave11-cards.test.cjs` (the draw hint) and
  `tests/wave12-cards.test.cjs` (the head's pot after a fold is $30).

## Wave 15 (31 Oct 2026): the card table's last rough spots

A verification QA pass played about 330 hands of the wave 14 table,
confirmed all 24 of its fixes and found one rough edge and seven nits; all
eight are fixed as decided (the table's side: `docs/notes/ui.md`, Wave 15).
Tests: `tests/wave15-table-polish.test.cjs`.

- **An old open draw hand (rough edge).** `resumeHand` gives a stored hand
  with no `cardGame` (one stored before wave 13, which could only be
  five-card draw) the game `'draw'` instead of null, so `gamble` never
  opens the chooser for it: it folds where it was left at the normal
  price ("You left the table, so you fold: −$5", the cards as dealt, the
  notice "The game was closed with a hand on the table, …"). Stop at the
  chooser now rejects with `chooser: true`; when the turn has no line to
  put back (a resumed turn, or none typed) `runTurn` takes it back with
  `NOTICES.chooserStopped`, "Stopped. Nothing lost.", and no
  `restoreInput`. A typed line still goes back in the box with "Stopped.
  Your action was kept in the box."
- **Kickers at one depth.** `Cards.namesApart` groups the shown hands by
  their name and gives each group of two or more one depth: the deepest
  place in the key where any two of them that differ first differ.
  `nameUpTo(e, upto)` names the kickers from the first one
  (`KICKER_AT`: after the pair, the trips or the four; after both pairs) to
  that depth, so the names line up and never read as if a lower kicker
  were the top one: "Pair of aces, king-jack kickers" / "king-ten kickers"
  / "nine-eight kickers"; "jack kicker" / "ten kicker" / "nine kicker" when
  the first kicker tells them all apart; "Three of a kind, sevens, ace-king
  kickers"; a flush or high card as before ("Flush, ace-king high"). An
  exact tie keeps one name. Heads up the same rule gives "Pair of aces,
  king-nine kickers" against "king-eight kickers" where wave 14 said "nine
  kicker" against "eight kicker".
- **Cheat deals (`stackOthers`).** Each other seat still gets one of the
  three best hands that lose to the player's from a sample of 120 pairs,
  but from those whose name differs from every hand already given (another
  shape, or other ranks), else whose key differs, else any. Over 400 seeds
  (`Rng.create(seed × 7 + n)`) two others alike went from 184 to 1 at five
  at the table, from 122 to 3 at four, and from 61 to 0 at three (the
  ones left are deals whose sample held no different hand that loses).
  Every other hand still loses to the player's; `/cheat cards` still makes
  the others call every bet before the flop.
- **Arrivals after a hand.** `seatedAt(ctx.gamble)` (Pipeline, exported):
  the dealer and the seats of a hand played this turn, else []. The
  narrator's packet leaves them out of "SINCE THE LAST TURN … arrived
  here: …" (and drops the line when nobody else came or went); the demo's
  narration leaves them and the action's targets out of its arrival line
  and keeps the rest ("Tammy Lott and Jodie Strayhorn arrive." after a
  hand with Royce Pittman and Elbert Gentry, who came in with them).
- **Words (the demo's parser).** `MOCK_JOIN`: "Mind if I join you for a
  hand?" (join you / in, with a hand, a game, cards, poker or a round in
  the line), "I join the game", "I take a seat at the card table", "I sit
  at the table" (the card table, or the table at the end of a clause),
  "Deal me into the game", "deal us in", "deal me some cards".
  `MOCK_COUNT_IN`: "Count me in", "I'm in" (with "too", "again", "on the
  game", "for a hand" and no more), a bet only when the line also names
  the cards, a hand, the table, the game or the deal (`MOCK_CARD_NAMED`),
  or the log's newest entry is a hand (`mockLastHand`). Both only where a
  dealer sits at the card table now (`mockDealerHere`: `cardGameAt` and
  `dealerOf` the people here), on top of the gamble branch's own checks;
  the bare "I'm in" is no longer a bet on its own. "I sit in the corner",
  "I sit at the bar", "Mind if I join you?", "I'm in trouble", "I'm in for
  a long night" and "I bet he is lying" are not bets. Say mode is as
  before (`SAY_BET`).
- **Words (`gameFrom`).** `PUT_DOWN`: a game named right before "is for"
  (not "is for me"), "isn't" or "is not" (not "… bad"), "is no", or "not
  for me" is the one being left, as `NOT_THIS` before it: "I play texas
  hold'em, draw poker is for old men" is hold'em, "hold'em isn't my game,
  deal draw" draw, "draw is no fun" hold'em. Otherwise the last game named
  still wins.
- **Tests changed by design**: `tests/wave14-holdem-fixes.test.cjs` (the
  heads-up kicker names "Pair of aces, king-nine kickers" / "king-eight
  kickers"; after a hand the arrival line names nobody who sat in, rather
  than no arrival at all).

## Wave 16 (31 Oct 2026): /undo with a hand open

The owner: "I was in the middle of a poker game and I can't undo to the
start of the game." Since wave 11 a dealt hand was final (Stop folds it at
a price) and wave 15 had `/undo` say to finish the hand first. Now `/undo`
with a hand open takes back the whole turn that dealt it, free (the stack
and `/rewind`: `docs/notes/engine-state.md`; the box and the link:
`docs/notes/ui.md`, Wave 16). Tests: `tests/wave16-undo.test.cjs`.

- **`Pipeline.takeBackHand()`** (beside `voidHand`, the other tab's path):
  the open hand (`hand`) is cleared and its promise rejected with `{ type:
  'undone', chooser }`, at the chooser, a draw hand or any hold'em street.
  Nothing is played out: `gamble` throws before the catch roll, the money,
  the record and the seats' memories. `runTurn` catches it as a rollback:
  `fail(snap, mark, null, { reason: 'undone', restoreInput: true })`, so
  the game is its pre-turn snapshot (a `/cheat cards` the deal spent is
  armed again), the feed loses everything from the turn's mark (the line
  and the table: unlike the void, no table is left), World forgets the
  turn, the `finally` drops this turn's stored hand (`Storage.dropHand`
  with its token) and `settle()` frees the pipeline; the line goes back in
  the box from the `send` that played it. The rollback gives back the redo
  stack the turn's snapshot put aside. Returns `whenIdle()`, so
  `Commands` (`/undo`, `/undo N`, `/rewind N`) carries on once the turn is
  over: the open turn is the first step, `State.undoSteps` the rest.
- **Stop is unchanged**: it still folds an open hand at its price (with
  the marked deck's catch roll) and keeps the turn; a page closed on a hand
  still folds it on load, and that fold-on-load turn is one undo step back
  to before the bet (its snapshot is the autosave's game; a kept step that
  is the same game is dropped when the stack is read back).
- The same hand is dealt again when the same line is sent after it (the
  deck is the game's seed and the turn, as before).

## Wave 18 (31 Oct 2026): betting for real, limit by the house, table stakes on asking

The owner: "Make the poker game interactive, as in I decide how much money
to add, go all in, etc." Two amendments followed: the story has Curtis
state the table's terms ("$20 to sit, $1 ante") and the earlier build's
$4 bet at a $20 stake stays a house rule; and the house game is limit, no
limit being something the player asks the dealer for (the table's side:
`docs/notes/ui.md`, Wave 18). Tests: `tests/wave18-betting.test.cjs`.

- **The buy-in.** The stake S (`stakeFor`, as before: "$20", "all in",
  "half my money", the usual $20) is the chips the player brings and the
  most they can lose. Every seat sits with S, so the stacks start equal
  and a seat that has matched every bet has what the player has left:
  there are no side pots. A new stake is named between hands as before.
- **The house rules** (from S): the ante a = `anteFor(S)` = max(1,
  floor(S/20)) ($1 at $20, $5 at $100) and the table's bet b =
  `unitFor(S)` = max(1, floor(S/5)) ($4 at $20, wave 13's unit). Every
  seat antes a. `rulesWords(S, structure)`: "Twenty to sit, a dollar ante,
  four-dollar limit." ("…, no limit." at table stakes; words up to $999,
  figures above); `rulesText`: "$20 to sit, $1 ante, $4 limit (every bet
  and raise $4)" or "…, no limit (bets from $4, up to all in)".
  `holdemCap(S)` is S now (the wave 14 cap under a stake that was not a
  multiple of $5 is gone with the fixed unit).
- **The structure** (`tableStructure(dealer)`, `STRUCTURES`): 'limit',
  the house game, unless the dealer agreed to table stakes today
  (`flags['cardsNoLimit.<id>']` is the day): 'nolimit'.
  `hooks.cardsStructure` ('limit' | 'nolimit', tests and the console)
  fixes it until a reload. It goes on the table (`base.structure`), the
  stored hand and the record.
- **A betting round** (`betRound(h, st, street, moves)`), from the player
  round the table; a seat with no chips left is passed over, and a round
  where fewer than two seats have chips is not bet (everyone all in: the
  board is dealt out). With nothing to call: check or bet; facing a bet:
  call, raise or fold. No limit: a bet from b, every amount a multiple of
  b (`clampTo(want, minTo, maxTo, b)`: not a multiple goes up to the next
  one, under the least is the least, at or over the stack is all in, and
  one that would leave less than b behind is all in), the least raise the
  bet and the last full raise, rounded up to a multiple of b (an all in
  short of a full raise does not set the next one); `sizeFor(ask, 'min' |
  'half' | 'pot' | 'allin')` is the call and half the pot after it (or the
  pot) on top, to the nearest b. Limit: a bet is b and a raise one more b
  whatever amount a move names, all in only when the stack is short of
  that. Four raises a round at most (`MAX_RAISES`), then only call or
  fold (with b a fifth of the stake the stacks run out first; the cap is
  the engine's). The player's ask: { toCall, level, put, left, pot,
  minTo, maxTo, unit (b), raises, limit }. Every action goes on the log
  ({ i, act, to: what that seat has bet on the round, add, street, allIn
  }); the player's, made legal with its amount, on `moves`.
- **Moves** (`Cards.move`, `Cards.moveText`): 'check', 'call', 'fold',
  'win', 'allin', 'bet:N', 'raise:N' (N the amount bet or raised to on
  the round), 'hold:024' at draw; wave 13's bare 'bet' (the least) still
  reads. All in is the biggest bet, raise or call there is; a bet facing
  one is a raise and a raise with none a bet.
- **Hold'em** (`holdemRun(h, moves)`, h { seed, ante, bet, stack, limit,
  stacked, board, seats }): four rounds, the player first; statuses
  cleared at a new round (a fold and an all in stay); everyone else
  folding ends it (uncontested); the player folding is played out as in
  wave 14 (a bet still owed called or folded, nobody bets again).
- **Five-card draw** (`drawRun(h, moves)`): the ante; the player's draw
  (or a fold before it, which costs only the ante, or the Win); one round
  of betting after the draw (street 1), the seats betting on their final
  hands (`drawStrength`: high card under .2, a pair .32 to .6, two pair
  about .7, three of a kind .82, a straight or better .9 and up); the
  showdown. Heads up a fold before the draw ends the hand there, the
  dealer's cards shown as dealt (as before); with others they draw and
  check it down. A draw hand that took the pot without being called is
  `hidden` (face down at the end). The deal is kept on the stored hand now
  (`drawDealOk`), as hold'em's is.
- **The seats** (`seatMove(h, i, k)`): with nothing to call, a value bet
  from 0.62 − tilt (half the pot or the least; the pot from .75; the pot
  or, after the flop and at draw, all in from .88), a bluff of half the
  pot under 0.1 + tilt, else check; facing a bet, a raise from 0.8 − tilt
  (0.1 more for a seat that has bet or raised this round), the least or
  half the pot, the pot or all in from .9, a bluff raise of the least now
  and then for the bold (not on the river); a call when the hand clears
  the round's bar (.3 before the flop, .38 on the flop and turn, .45 on
  the river and after the draw, less tilt) raised by the price (what the
  call is of the pot after it, over a quarter, and of the stack left);
  else fold. Carter, Elbert and Curtis (bold traits) bet and raise more,
  Lyman and Royce (careful) call down or fold. The coins are the hand's
  own (`coin`, the seat's decision number on the round), so the same
  moves play the same hand after a reload, `/undo` or a replay. A read on
  a seat's first bet or raise, as before. `/cheat cards`: the others call
  every bet before the flop (at draw every bet), never raising.
- **The money.** `c.pay(amount)`: the ante goes in at the deal and each
  bet or call as it is made (`State.apply({ goldDelta })`, the top bar and
  the Character panel following, `UI.showCash`); at the end the rest of
  the hand's result moves (delta + what was paid). The gold never goes
  under 0 (the stake is never more than the cash). `settlePot(sides)`: a
  bet nobody called comes back to whoever made it (the most anyone put in
  is cut to the second most; the side's `back`), then the pot is shared a
  layer at a time, each layer to the best hand still in among the seats
  that reached it (a short all in wins only what it matched), the odd
  dollars to the player when they share. A wave 10-12 record replayed
  keeps its uncalled money (`keepUncalled`).
- **The cheats.** The Win (cheat) mid-hand: every seat still in calls the
  bet on the table (the pot as it stands, matched), then the cards as in
  wave 14 (at draw after the draw only the others' draws, unseen without
  a marked deck, are dealt again; else they throw in their hands). An
  armed `/cheat win`: everyone all in, the player's hand the best:
  (seats − 1) × S at hold'em and at draw.
- **Typed bets** (`typedBet(text, table)`; the UI's `handCommand` with a
  hand open, neither parser involved): "check", "call" (with nothing to
  call it checks), "fold", "all in" ("go all in", "I'm all in", "shove",
  "jam", "push"), "bet 10", "bet ten dollars", "raise to 30", "raise 30"
  (to $30), "raise by 10", "make it 30", a bare "$30", and "min", "half
  pot", "pot"; at the draw "fold" and "stand pat". "I", "I'll", "okay"
  before them are fine. Amounts are clamped as the control clamps them,
  with a note; "check" facing a bet is answered with what the table
  offers and the line stays in the box.
- **Held to the limit** (amendment 2). At a limit table an amount past
  the limit ("all in" with the stack not short, "bet 20", "raise to 40", a
  pot bet that is more than b) is refused: `pushbackLine` picks one of
  three lines by the game's seed, the turn and how many were said this
  hand (Curtis taps the felt: "Four-dollar bets at this table."; Curtis
  doesn't touch the chips: "It's a four-dollar game. House rules."; "Four-
  dollar limit," Curtis says, and slides the chips back), the dealer's
  first name from the record; nothing is played or paid. The record keeps
  the count (`pushback`); OUTCOME adds "When the player tried to bet past
  the limit, Curtis Pruett held them to the house's $4 bets (twice)."
- **Asking for table stakes** (`STAKES_ASK`, `stakesAsked`, `stakesAsk`;
  `runTurn` resolves it before the gamble and the ordinary roll, whatever
  the parser called the action): "no limit", "table stakes", "raise the
  stakes", "a bigger game", "higher stakes", "play for real", "take the
  limit off", "lift the limit", "can we bet what we like" and the like,
  said or done where the card game is with its dealer here, to him or to
  nobody in particular. Cold (attitude under 0, `STAKES_COLD`): "Not with
  you." without a roll. Already no limit today: he says so. Refused today
  already: he repeats himself without a roll. Else a Charm persuade at
  normal against him (`Dice.resolve` with his id: the usual attitude
  modifier, the usual roll line, a story point on a 20): a success sets
  `cardsNoLimit.<id>` to the day ("Table stakes, then. Don't cry to me
  after."); a failure sets `cardsAsked.<id>` ("House rules," Curtis says.
  "We play the limit here."); a fumble the same and −5 attitude. The flags
  and the attitude go through the engine's `effects` (setFlag,
  attitudeDelta). The line is a quiet line; the narrator gets "TABLE
  STAKES: …" and the bookkeeper is told to record nothing for it. No hand
  is dealt that turn. Asked with a hand open, the box says to ask between
  hands.
- **The record** (`logCards`): `ante`, `unit` (the table's bet) and
  `moves` at draw too; `actions` ([{ seat, act, to, add, street, allIn }],
  160 at most), `structure`, `pushback`; a side's `back` and, at draw,
  `hidden`. `moves` hold up to 40.
- **The words.** `betMoments(rec, you)`: the betting's big moments, two
  at most (all-ins, then raises, then the biggest bets), each with how the
  table answered, a re-raise and its answer told with it ("the player
  raised to $120 before the flop, Curtis Pruett went all in and the player
  called"). OUTCOME: "the card game (the player bought in for $20; house
  rules: $20 to sit, $1 ante, $4 limit (every bet and raise $4), four
  rounds of betting): Texas hold'em, heads up with Curtis Pruett; the big
  moments; how each seat ended; …" (a heads-up draw showdown as before,
  with the amounts won); a fold says when ("before the draw and gave up
  the $1 ante", "on the flop and gave up the $5 they had put in"); at the
  first hand at a stake (none before it in the log, or one at another
  stake) "The player sits down at this stake for the first time: have
  Curtis Pruett state the table's terms as they sit ("Twenty to sit, a
  dollar ante, four-dollar limit.")." `plainHandText` opens with the
  moments ("You raised to $120 before the flop, Curtis Pruett went all in
  and you called."). Seat memories: a loss counts when the seat put $10 or
  more into a pot the player took (the wave 14 floor and once a day stay).
- **The demo.** `mockGamble` tells the moments ("you bet $8 after the
  draw and Curtis Pruett called; …"), a heads-up draw fold with when, and
  at a new stake: "Twenty to sit, a dollar ante, four-dollar limit,"
  Curtis Pruett said as you sat down. The demo's parser reads the table
  stakes words as a persuade aimed at the dealer; its narration tells the
  outcome ("You ask Curtis Pruett for table stakes, and Curtis Pruett
  agrees: no limit at the card table for the rest of today.") and its
  bookkeeper moves no feeling for it.
- **Hooks** (tests, the console): `hooks.cardsPlay` takes `{ moves: [...]
  }` of `Cards.move` strings (and `{ hold, moves }` at draw), `{}` still
  checks and calls down; `hooks.cardsBetting = 'call'` checks or calls the
  draw's round down; `hooks.cardsStructure` as above.
- **Tests changed by design**: `tests/wave10-cards.test.cjs`,
  `tests/wave11-cards.test.cjs`, `tests/wave12-cards.test.cjs` (the draw's
  round checked or called down by `hooks.cardsBetting`; the house rules in
  the head and once in the hint; the ante where the fold price was; the
  amounts from the record), `tests/wave13-holdem.test.cjs`,
  `tests/wave14-holdem-fixes.test.cjs` (the ante and $4 bets; table
  stakes where a test sizes its own bets; #16 and #23: no cap under the
  stake and always room for a bet; Royce's hand at $50, where a call is
  $10), `tests/wave15-table-polish.test.cjs`, `tests/wave16-undo.test.cjs`
  (the nudge, the ante), `tests/transport-fixes.test.cjs` (the draw's
  money and OUTCOME), and `tests/helpers.cjs` (`presetCards` takes
  `structure`).

## Wave 19 (31 Oct 2026): the betting table after its QA

A QA player played 150 hands of the wave 18 table (both games, both
structures, 2 to 5 seats, stakes $5 to $1,975, phones and laptops) and
found the money exact everywhere; the defects (D1-D17) were in words,
notices, layout and telling, fixed as decided (the table's side:
`docs/notes/ui.md`, Wave 19). Tests: `tests/wave19-betting-fixes.test.cjs`.

- **The ask for table stakes (D1).** `STAKES_ASK` is plainly about the
  game's stakes: "no limit" not followed by to, on, of, for or in ("no
  limit to what I'd do", "no limit on the whiskey" are not), "a bigger
  game" and "higher stakes" not followed by "than" ("bigger game than
  this town" is not). `stakesAsked` fires only when the line is also
  aimed at the dealer: Say mode to him (`sayAction` puts him in the
  targets), the parser's targets include him, his name is in the words
  (`Town.nameMentions`), or the words name the game or the table
  (`STAKES_GAME`: "table stakes", "no-limit game / poker / hold'em",
  "cards", "poker", "the table", "the game", "deal", "dealer": "take the
  limit off the table", "bet what we like at cards", "deal me in, no
  limit"; `stakesNamed`). A parser whose targets are someone else here and
  not him is never overridden (a whiskey ordered from Loretta stays a
  purchase), and Say mode to someone else is no ask, as before. The demo's
  parser (`mockStakes`) reads an ask only with the dealer named, his game
  or table named, or a request ("Can we play no limit?", "How about a
  bigger game?", "Let's take the limit off", "I want to raise the stakes",
  `MOCK_STAKES_REQUEST`), and never with someone else here named and not
  him; "I bet he plays without a limit" is no ask.
- **Shove and push; betting words between hands (D2, D12).** The demo's
  attack rule reads "shove", "shoves", "push", "pushes" as an attack only
  with a person as the object: someone named or by role, someone new, or
  "him", "her", "them", "someone" and the like ("I shove Loretta");
  "shove", "I shove", "push" alone are not. `Pipeline.betweenHands(text,
  speech)`, checked by `submit` before any turn (both parsers): when the
  newest log entry is a hand at the dealer here, today, a line that
  `typedBet` reads as a move (against a stand-in table facing a bet: "all
  in", "shove", "bet 10", "raise 30", "call", "check", "fold", "I'm all
  in", "I bet $20"; a bare amount is a stake and is left alone) is a
  notice, "No hand is on the table. 'Another hand' or 'deal me in for
  $20' starts one." (the last hand's stake), returned with `restoreInput`
  so the line stays in the box: no turn, no cost. Words that name the
  game, the hand, the table or the dealer are no bare move ("I go all in
  at cards", "all in, Curtis"), so they sit down as documented; after any
  other turn the sit-down phrases keep their meaning. Say mode to someone
  else than the dealer is left alone.
- **Fold notices (D3).** `NOTICES.handFolded`, `handLeftOpen` and
  `handOtherOpen` take what was lost (`handLost(ctx.gamble)`): "the $1
  ante is gone" when only the ante went in, else "the $15 you put in is
  gone"; caught with a marked deck, "you lose $20".
- **The amounts said (D7).** `clampWhy(want, minTo, maxTo, b, kind)` is
  `clampTo` with each step in words, in the order the table makes them:
  "Bets go in twenties: $50 rounds up to $60." (`betsIn`: fours,
  twenties, forties, hundreds, else "$140s"), "The least bet is $4." /
  "The least raise is to $16.", "That's more than you have, so it is all
  in $19.", "That would leave you less than a bet, so it is all in $110."
  (after a rounding too, both sentences); '' when nothing changed.
  `sizeWhy(k, 'half' | 'pot')` says a preset that comes to all in ("Half
  the pot ($60) would leave you less than a bet, so it is all in $75.",
  "The pot ($120) is more than you have, …", "Half the pot is all you
  have: all in $75."). `typedBet`'s notes are the same words.
- **A fold told once (D8).** `betMoments` returns its moments with
  `.folds`, the seats whose folds they told, and never tells the player's
  own fold as an answer (the result tells it, with what it cost: "Curtis
  Pruett bet $8 on the flop; … the player folded their king high on the
  flop and gave up the $5 they had put in"). `tableWords` leaves out a
  seat's "folded on the flop" when a moment told it, and an uncontested
  pot is "the player takes the $10 pot without a showdown" (each fold is
  told above it; no "everyone else folded, so"). `ctx.gamble.foldsTold`
  carries the seats to the demo (no "X folds after the draw" again, no
  "everyone folds to you": "the $3 pot is yours") and the plain line
  ("The hand is played: the $10 pot is yours." when the moments told every
  fold).
- **Typed forms (D9).** `typedBet` also reads "call $8" / "call 8" /
  "call eight" (`typedAmount`: the call when that is its price, or all of
  a short stack; another amount is answered "It's $8 to call: call $8,
  raise or fold."; nothing to call: check), "raise it to 30", "I'm going
  all in", "I fold", "I check", "I call"; at the draw "draw 3", "draw
  three (cards)", "I draw two" give `{ draw: n }` (the UI presses Draw when
  exactly n cards are not held). An all in facing a bet when no raise is
  on offer says why: "No more raises this round" after four, else "Nobody
  is left to answer a raise".
- **Pushbacks kept (D10, D11).** `pushbackLine` writes the count to the
  stored hand of the hand open now (`heldOpen`, set by `holdThis`;
  `storeHand`), `resumeHand` reads it back (`storedHand.pushback`) and
  `gamble` starts `pushes` from it, so a hand folded on a reload keeps
  `pushback` on its record and OUTCOME says it. The limit refusal's status
  names the buttons as they read: "Four-dollar limit: Call $4, All in $19
  or Fold." when the stack is short of a raise ("Check or All in $3" when
  short of a bet).
- **The terms (D13).** The narrator is told the terms when the stake or
  the structure differs from the last hand at this dealer's table (the
  newest log entry with a hand whose `dealerId` is his: none, another
  stake, or another structure, a record from before wave 18 having none):
  "Tomas Reed sits down at Curtis Pruett's twenty-dollar table ($1 ante,
  $4 limit): have Curtis Pruett state the table's terms as they sit ("Twenty
  to sit, a dollar ante, four-dollar limit.")." ("…'s hundred-dollar
  table ($5 ante, no limit)"; at $1000 and up "$2000 table"), never "for
  the first time"; going back to an earlier stake tells them again, and a
  limit → no limit change at the same stake is told once. A hand Stop
  folded is told in a plain line by design (wave 11, M1), so its terms are
  never said; the next hand at the same terms does not say them either.
- **The demo's terms first (D14).** `mockGamble` opens with the dealer
  stating them, before the hand is told: '"Twenty to sit, a dollar ante,
  four-dollar limit," Curtis Pruett says as you sit down. At Curtis
  Pruett's table, …'.
- **Words (D15, D16, D17).** `rulesWords`: an ante whose words start with
  "a" ($100-$199: "a hundred-dollar ante") takes no second "a". A
  sentence ends at a full stop, ! or ? before a space, never after "Dr.",
  "Mr.", "Mrs.", "Ms.", "St." or a single initial (`SENTENCE_END`,
  `firstSentence`, `SENTENCE_SPLIT`, shared): the demo's news clause
  (`freshNews`), its first sentence of a due event or a place, and the
  packets' `sentenceOne` (exposed as `Pipeline.sentenceOne`). The second
  `validMove` is gone.
- **Tests changed by design**: `tests/wave10-cards.test.cjs` (the terms
  line), `tests/wave11-cards.test.cjs` (the notices' amounts; L3: the
  first deal keeps the cards and the buttons in view; M5: "I bet fifty
  dollars at cards" right after a hand), `tests/wave12-cards.test.cjs`
  (the notices; M1: the cards and the buttons in view while a hand is
  open), `tests/wave13-holdem.test.cjs` (the notices, a fold told once,
  the demo's terms first, "Bets go in fours: $6 rounds up to $8."),
  `tests/wave14-holdem-fixes.test.cjs` (#21: the moment names the dealer
  who folds), `tests/wave15-table-polish.test.cjs` (the notice) and
  `tests/wave18-betting.test.cjs` (the amount notes).

## Wave 20 (31 Oct 2026): the betting table's words after its second QA

A verification QA of the wave 19 table confirmed its fixes and found
eleven leftovers (N1-N11), fixed as decided (the table's side:
`docs/notes/ui.md`, Wave 20). Tests: `tests/wave20-table-words.test.cjs`.

- **Shove and push (N1).** The demo's attack rule reads "shove" or "push"
  (and their -s, -ed, -ing forms) as an attack only with a person as the
  verb's own object (`shoveObjects`: the words right after the verb, up to
  a comma or a stop, a preposition or a particle; a possessive is no object
  of its own): someone named or by role, someone new, "him", "them",
  "someone" and the like, "her" alone, or a person's noun ("shove the old
  man", `SHOVE_PERSON`). "I push my chips toward Curtis", "I shove all my
  chips at Curtis", "I push the pot to Curtis", "shove, Curtis", "I push
  past Curtis to the bar" and "push Curtis's chips back" hurt nobody.
  `typedBet` reads a push or a shove of the chips, the money, the cash or
  the stack as all in (`TYPED_PUSH`: "I push my chips in", "shove all my
  money toward Curtis", "push it all in"), so with a hand open it is the
  all in (held to the limit at the house game) and right after a hand the
  between-hands notice (`Pipeline.betWord`, `betweenHands`).
- **The ask for table stakes (N2, N3).** `stakesWords(text)` is the word
  rule for the engine (`stakesAsked`), the demo (`mockStakes`) and the box
  with a hand open: a `STAKES_ASK` phrase that is not talk. `STAKES_ASK`
  loses "without a limit" and the possessive forms ("lift your limit",
  "take your limit off"); a phrase with "limit" in it is talk when know,
  knows, has, have, is, was, there, there's or without comes right before
  its limit (`LIMIT_TALK_BEFORE`: "your greed knows no limit", "Curtis,
  your greed has no limit.", "Is there no limit to your greed?") or a
  greed, a patience, a nerve or the like comes before it in its clause
  (`LIMIT_OWNER`: "Does your greed know no limit, Curtis?"). Talk (all
  tested): the first report's five lines, "Does your greed know no limit,
  Curtis?", "Curtis, your greed has no limit.", "He'll play without a
  limit, that one.", "Your greed has no limit." said to him. Asks (all
  tested, in Do mode and in the demo's parser): "no limit", "table
  stakes", "take the limit off", "lift the limit", "raise the stakes", "a
  bigger game", "play for real", "can we bet what we like", "let's take
  the limit off", "Curtis, table stakes?", "Can we play no limit?".
  `stakesAsked` no longer needs his name or his game in the words
  (`stakesNamed` and `STAKES_GAME` are gone): at the
  card table with its dealer there, said to him or to everyone in Say
  mode, or done with no one else as the parser's target (a parser aimed at
  someone else is still never overridden), the words are the ask.
  `mockStakes(lower, packet, named, sits)` reads the scene the same way:
  the card table with its dealer there (`mockDealerHere`), nobody else
  named instead of him; `MOCK_STAKES_REQUEST` is gone. `stakesAsk` makes
  the ask instant whatever the parser said (no time step for it).
- **Dealing at no limit (N8).** At a table already no limit today
  (`tableStructure`), a line the parser read as a bet at cards or whose
  words sit down (`wordsBet`: "deal me in for $50, no limit", "I bet $20
  at no-limit hold'em") is no ask: `stakesAsked` returns null and the hand
  is dealt; the demo's `mockStakes` gives way to the gamble branch
  (`sits`). On a limit day the same words are the request, as before.
- **What a typed amount went in as (N4).** `typedBet` returns `after`
  beside its note when the table changed what was typed (`wentIn`:
  "Your $70 went in as all in $95: that would have left you less than a
  bet.", "Your $300 went in as all in $95: that's more than you have.",
  "Your $50 went in as $60: bets go in twenties.", "Your raise to $130
  went in as a raise to $140: bets go in twenties.", "Your $2 went in as
  $4: four-dollar limit."; a preset: "The pot ($120) went in as all in
  $95: that's more than you have."; "all in" with no raise on offer: "Your
  all in went in as a call of $8: nobody is left to answer a raise.").
  The UI plays the move with it (`why` on the choice); `playHand` keeps it
  (`moveWhy`), and when that move is the one that finished the hand (not
  a fold, not a win cheat) `gamble` puts it on the record as `amountWhy`
  (`logCards` keeps it, 200 characters), so the finished table shows it
  after a reload, the `/undo` of a later turn, or a replay too.
- **Sitting down with Curtis named (N5).** The demo's parser reads a
  sit-down with the dealer named before or after it, or the table, the
  hand or the cards named after it (`mockBetNamed`, `mockSitWords`: "all
  in, Curtis", "Curtis, all in", "I bet $20, Curtis", "all in at the
  table", "all in on this hand") as a bet at cards, as "I go all in,
  Curtis" was; the words without the name must sit down on their own
  ("shove, Curtis" no more than "shove").
- **The terms after a plain line (N6).** A hand told in a plain line
  (`plainNarration`: Stop, a closed page, another tab, a narrator that
  failed, was stopped or declined) has `plain: true` on its record (a
  replay of it drops the mark), and the last hand at this dealer that
  decides whether the terms are told passes over records with `stopped`,
  `closed` or `plain`, so the next hand at a Stopped hand's stake tells
  them.
- **Sentence ends (N7).** `SENTENCE_END` also passes over "Prof.", "Sgt.",
  "Rev.", "Jr.", "Sr.", "Lt.", "Capt.", "Gen.", "Col." and "Hon." ("Main
  St. Then he left." stays one sentence, the price of "St. Jude"; the
  town's text has none of these at a sentence's end).
- **"another hand" (N9).** `stakeFor(text, gold, again)`: with no stake
  named, "another hand" or "one more hand" plays at `again`, the stake of
  the newest hand at this dealer today (`gamble` finds it in the log), so
  the notice's "'Another hand' or 'deal me in for $37'" agree; with none
  today it is the usual $20; never more than the cash.
- **Typed forms (N10).** `typedBet` also reads "calling", "I'm calling",
  "see that", "see your bet", "see your raise", "see the raise" (with "I",
  "I'll" before them as before) as a call (a check with nothing to call),
  and at the draw "draw a card" / "draw a new card" as `{ draw: 1 }`.
- **Tests changed by design**: `tests/wave19-betting-fixes.test.cjs` (D9:
  `typedBet`'s "raise it to 30" carries its `after`).

## Wave 22 (1 Nov 2026): meetings are kept

A meeting someone agrees to in the story is a seed with `appointment` (State,
on planting: `docs/notes/engine-state.md`, Wave 22). World keeps it. Tests:
`tests/wave22-appointments.test.cjs`.

- **Its person is there.** Today's phases are placed as it is planted
  (State); a later day's at that day's morning: `World.tick` step h,
  `appointmentVisits(day)` (visits with the seed's id for the phases still to
  come that day, through the visits op, so its "now or later today" rule
  holds; someone not free, away or laid up is not placed). `npcsAt` reads the
  visits, so the parser's NPCS PRESENT, the narrator's PRESENT and
  DESTINATION, the Say chips and the People card all have them.
- **It fires at its place, in one of its phases** (its trigger stays as the
  bookkeeper gave it; a day trigger's meeting fires at its place too, never at
  its day's morning, and `catchUp` passes over appointments):
  - `appointmentsHere({ locationId, day, phase })`: Pipeline step 6, before
    the due events are gathered, with where a walk lands (`dest`, its phase
    and day) or where the turn begins (not on a walk to a shut door, an
    arrest or an ending). It fires there and then, so the walk's narration
    has it as a DUE EVENT with its person present.
  - `triggerMet`: an appointment is met at its place, on its day, in one of
    its phases, with its person able to keep it (free, in town, not laid up),
    so `fireSeeds` (step 11, and before a narration of time passing) fires
    one the player is at when a turn ends.
  - `settleAppointments` (below): the player at the place as one of its
    phases ends (a walk that got there as the time ran out, or a meeting
    planted with the player already there).
  `fire` treats it as its person's (`seedNpcId` returns the appointment's
  person): their due event carries their id, and is dropped if they cannot
  act on it. `dueSeeds` holds an appointment's due event for its place, a day
  trigger's too (as a location seed's), and drops one still untold once the
  phase after its last has passed (its moment has gone). Kept: nothing more
  from the engine (a warm memory is the bookkeeper's, from the narration).
- **Missed.** `settleAppointments(to, from, events)`: `World.tick` step h, for
  every appointment not fired whose last phase is before the phase reached.
  Its person cannot keep it (arrested, gone, dead, laid up) or its place is
  gone: `seedsDropped`, a debug note, nothing said. The player at its place
  as the phase that just ended (one of its phases) ends: it fires (kept).
  Otherwise missed: `seedsDropped`, `addMemory` "waited for <player> at
  <place> and they never came" (weight 1), `attitudeDelta` -3, and the tick's
  notice "Jodie Strayhorn waited at the Low Water and you never came." (a
  quiet line after the turn's narration, as a missed obligation's is).
  `/cheat time` forward: `morningChores` settles each morning it passes, and
  `catchUp` settles at the time it lands and places that day's meetings
  (`appointmentVisits`); the lines are printed with the other catch-up lines.
  A clock set back changes nothing.
- Exported: `appointmentsHere`, `settleAppointments`, `appointmentVisits`.

## Wave 25 (1 Nov 2026): a narrated arrival is a visit

- `Pipeline.noteArrivals(narration, locationId)` runs after
  `noteIntroductions` on every narrated turn (the walk's destination when
  there is one). Outside quoted speech, a cast member's full name (or a
  first name unique in the cast, three letters or more) followed within three
  words by an arrival (`ARRIVAL_VERBS`: slips/steps/walks/comes in, shows or
  turns up, arrives, appears at the door, is at the door, knocks, joins you,
  sits down beside you) makes `State.apply({ visits: [{ npcId, locationId }] })`
  for this phase. Skipped: dead, not free (gone, arrested), laid up, unnamed,
  or already in `npcsAt`. A refusal (the place closed) is a `rejected` debug
  line; a placement an `arrival` one.

## Wave 27 (1 Nov 2026): what the engine sees

Wave A2 of `docs/RELATIONSHIPS_PLAN.md` (scope: `docs/relationships/
integration.md` section 16). World's side; State's is in
`docs/notes/engine-state.md`, Wave 27. Tests:
`tests/wave27-rel-engine.test.cjs`, `tests/relationships-examples.test.cjs`.

- **`knockDown`** writes the engine's `beat_down` for the one knocked down
  (replacing every memory of the fight, by `state.fight.key`) with the
  people watching (`witnesses`): each takes one lighter copy for the scene
  (State's witness rows); the old weight-3 memories for the victim and every
  witness are gone. Done in a public place it is news and public: the town's
  reputation moves by what the fight has not cost yet (`state.fight.rep`:
  the heaviest blow's, once, so three hits and the beating cost 5). A
  beat-down on someone tough is answered at once (`toughAnswer`): a
  violence grudge for the beat-down's memory, the beating first (a template
  with `forTags` tough), on `Rel.rng('toughAnswer', npcId, day)`, unless a
  feeling of theirs is waiting or the 7-day cooldown holds; `result.grudge`.
- **Step e** (`plantFeelings`): a grudge grows only from a memory
  `Rel.grudgeFit` takes (a line that moves nothing by the old rule; a typed
  one only for a harm still unsettled, or settled the same day; never a
  witness or secondhand copy, a loose end's line or a fact; `freshMemory(n,
  3, true)`); a witness copy grows no favour. `plantFeeling(n, kind, memory,
  day, opts)` takes `{ rng, kinds, prefer, why }`; a grudge's kind of answer
  is the memory's class (violence by violence only from someone tough, else
  the police; theft by the police, gossip or money; words by gossip, a ban
  or money); fear 40 leaves only the police or gossip; a `report` template
  is never a grudge's. Today's liking-route plants still draw from the
  shared stream (the same number of draws); every new plant draws from its
  own and is stamped with its turn (`/rewind` strikes it). The seed's
  origin keeps the memory's `key` and `why`.
- **Reports** (`plantReports`, then `plantReport(n, why, day)`, at the end
  of step e): someone `Rel.reportWhy` says means to tell, once for the
  memory it grew from, plants a report seed (`origin.kind: 'report'`, `key`,
  `why`, `protectors`, `hidden`; stamped with its turn) due in 1 or 2 days,
  from a `GRUDGE_TEMPLATES` entry of kind `report` that suits whom it goes
  to (`to`: police, or family) and what it is about (`about`: threat or
  violence), all on `Rel.rng('report', npcId, day)`. "Nobody"
  (`Rel.protectorOf`): a grudge instead (gossip, violence if tough), on the
  same stream, subject to the cooldown. When it fires (`reportEffects`)
  each protector still free takes the template for them, `{protector}` and
  `{protectorId}` filled (`fillEffects` takes `protectorId`); through a
  hidden tie the memory is `secondhand: { via, hidden: true }` and no due
  event tells it.
- **Getting even**: a grudge come due is `relSettle { npcId, key, mark, by:
  'got_even' }` (State) in place of `attitudeDelta +10`.
- **Danger** (`markDanger`): a seed with `danger` that fires marks the
  people it names after the first (or the ids given) as in danger where the
  player is, for this phase and the next (`flags['danger.<npcId>'] =
  "day|phase|place|by|turn"`); Pipeline's rescue reads it. Three content
  seeds carry it.
- **Appointments**: a missed one is `socialEvent broke_word`, `scale: 0.5`,
  weight 1 (liking -4, trust -8 before traits) in place of the memory and
  -3; a kept one (`fire` with the player at its place) is `kept_word`.
- **The morning** (step g): State's `relDay` moves only the everyday bucket
  (`Rel.driftStep`), so `driftAttitudes`' note counts the people whose
  small things drifted. `DRIFT_QUIET_DAYS` is kept but nothing reads it.
- **`driftReputation`** moves only the factions (members' liking changes /
  `REP_DIVISOR`, `REP_CAP` a turn); the town's standing moves on public
  events in State.
- **`arrestPlayer`**'s memory is `noted` (own); `sleptRough`'s was already
  (own).
- Exports: `plantReports`, `plantReport`, `toughAnswer`, `markDanger`.

## Wave 28 (1 Nov 2026): reports for minors and coercion, favours by trust

Wave A3 of `docs/RELATIONSHIPS_PLAN.md`.

- **`World.minorAdvance(npcId)`** (Pipeline's `minorTurn`, after the
  bookkeeper's apply, for a minor the full row fell on: a named target
  with two signals): the minor's `unwanted_advance` (W -20, T -20, F +10,
  weight 3; fear from it buys nothing), a weight-3 `crossed` for each
  guardian (`Rel.guardiansOf`: parents, else family, else the police head;
  in the guardian's words, "my daughter"), a report seed from each
  guardian to the law (`Rel.reportTo`) on its own sub-stream
  (`Rel.rng('minorReport', gid, day)`), town reputation -10 outside the
  turn's cap of 5, and a news line when no law can hear it. A single signal
  is the light row only: a `noted` of liking -3, "said something that made
  me uncomfortable at <place>".
- **`World.minorHarm(npcId, why)`**: a hit (`knockDown` and the fight) or
  a threat on a minor reports to their guardians and the law the same way;
  reputation -10 for violence, -5 for a threat. Minors are skipped by the
  ordinary `plantReports`.
- **`World.coercion(npcId, key)`**: a romantic ask with a threat behind it
  (Pipeline's `coerce`: no roll, the die burned, nothing given; the
  target's `blackmailed` and a weight-3 `crossed`) reports through their
  protector (`Rel.protectorOf`, on `Rel.rng('coercion', ...)`, forced past
  the usual conditions), else the law; reputation -10.
- **`plantReport(n, why, day, opts)`** takes `{ rng, to, force, news }`;
  `to.fallback` (the law outside town) is kept on the seed's origin, and
  `reportEffects` gives an away fallback a memory and a news line ("A
  deputy from Clayburn came by asking about <player>."). `World.lawFor` and
  `fallbackNews` build them.
- **Favours by trust.** `plantFeelings`' favour route is `favourFits(n)`
  (liking 50 and trust 20, `Rel.GATES.favour`) with `helpMemory(n)`: the
  newest unsettled first-hand memory of weight 2 or more of something the
  player did for them (`HELP_EVENTS`: did_favour, rescued, defended,
  kept_word, paid_back, gift, paid_silence; typed, or a legacy line by its
  words). `templateFits` reads a template's `needs` through `Rel.meets`.
- **Pipeline's trust gates** (the engine's side of them): `secretsFor`
  opens a secret by `Rel.secretOpen` (trust 40, knows-you 30) or fear 60
  after an intimidation that worked (never a minor's); `pickRumour` skips
  anyone at trust -25 or below unless a gossip; the dealer deals nobody at
  trust -40 or below and `cardPeople` seats nobody there.

## Wave 29 (1 Nov 2026): what people hold, in World, Town and Pipeline

Wave A4 of `docs/RELATIONSHIPS_PLAN.md`. Every new seed draws on a stream
of its own (`Rel.rng(kind, npcId, day)`: pay, inquiry, owedFavour, owedAsk,
owedAskAgain, tell, price, levViolence, levReport, levTalk, trustGrudge), so
the shared dice, the clocks and every older seed are draw for draw the same.

- **The backed ask** (Pipeline `backedAsk`, first in `resolve` after
  coercion): an intimidation or a persuasion with a held record in
  `aboutIds` (kept by `normaliseParse` only when the player's words use it:
  `Rel.references`) at the one it names. Weight 2 or more is no roll (the
  d20 burned, `Dice.burn`), weight 1 easy, a hard target normal, a minor
  as the parse had it. `Rel.leverageAnswer` decides before narration: a
  price in the words (`Rel.priceIn`, "three hundred", "$300") and they
  agree to pay tomorrow, capped at `canRaise` and 100 a weight, nothing now
  (a payment seed, origin leverage, the next day: the money, the record
  paid, their `paid_silence` at liking -5); no price and they go along; the
  hard who are not tough refuse and talk or report
  (`World.leverageAnswered`, levTalk / levReport), the tough answer with
  violence (levViolence); a failed roll is the bluff called; a price on a
  paid record is "already paid, and won't again" (`threatened_to_tell`, no
  money). The narrator gets the `LEVERAGE:` line, the bookkeeper "already
  applied", and the OUTCOME lines are left out. A minor's answer is $0 and
  `World.minorHarm(id, 'threat')`.
- **Coercion with a record** (`coerce`): the record named is `used` with
  `blackmailed` carrying its id; the report goes through the police bar
  (`plantReport(..., { force })` and `coercion` pass `protectorOf`'s
  `anyway`).
- **Caught at it** (`rolledEvents`): a theft, a sneak or a search with
  exactly one other person there, no news, gives that person's
  `caught_you_at` and their record over the player (`about.kind` seen,
  weight 2 for a theft or a lie, 1 for a sneak or a search, key
  `t<turn>-<actionType>`; it matters to the one robbed, else the police
  head).
- **The informant** (Town's `resolveLooseEnd`, a secret loose end): the person
  starts holding the record over the player, weight by the option (2, 2,
  3), mattering to the police head, the player not knowing it until the
  price is named (`playerKnows` then, "Glenda Pryor has something on
  you.").
- **`plantFeelings`** (step e) gains, in this order per person: the favour
  owed asked back (`owedAsk`: a FAVOUR_TEMPLATES `ask` by their tags 5 days
  after the debt began, again 3 days after that, 3 days after the second a
  crossed-class memory and the debt let go; on its own clock, whatever
  else is waiting); a standoff plants nothing (`Rel.standoff`); the police
  bar (`Rel.policeBarred`: no police grudge); `barLifted` (a record spent
  or voided in the last day: no cooldown, the check runs at once); the
  trust route (`betrayal`: trust -60 with one of `BETRAYALS` first-hand and
  unsettled, a gossip or police grudge on trustGrudge); the payback of
  favours owed (`owedFavour`: owed 2 at liking above -25, a non-cash
  favour unless liking 25 and trust 0, ending square with `owedSettle`);
  then `plantHolders` (someone holding a live record over the player: at
  liking -60 a `tell` grudge, the record spent and told to `mattersTo`; a
  mercenary holder at liking 10 or less a `price`, a blackmail of $50 a
  weight due in 2 days, linked by `leverageId`; never in a standoff, never
  the loose end's own record, never one already priced).
- **`plantReports`** skips a standoff; a report by a holder spends what
  they hold over the player, told to whom they went (`told_anyway`, hidden
  through a hidden tie).
- **`plantFeeling(n, kind, memory, day, o)`** takes `o.filter`, `o.only`,
  `o.key` (on the origin) and `o.effects` (added to the template's); tell,
  price, report and ask templates (`OWN_KINDS`) are never an ordinary
  grudge's or favour's. `fillEffects` fills `{leverageId}`, `{amount}` and
  `{price}`.
- **The romance step** (Pipeline): `Rel.romanceTurn` decides welcome and a
  night together before narration (`ROMANCE (decided by the engine): ...`
  for the narrator: open to it, not interested, says yes and fade to black,
  or not tonight, kindly); `romanceEvents` records the flirts (welcome:
  W +4, K +2, S 10 x sparkRate), the jealousy of whoever saw it
  (`Rel.jealousyOf`) and the night (`intimate`, private, a weight-3 scar).
  The bookkeeper is told what the engine recorded.
- **Secrets shown** (`secretsFor`): what the narrator was given is
  `secretShown` with how it opened.
- **World exports** `leverageAnswered`, `plantHolders`, `owedFavour`,
  `owedAsk`, `barLifted`, `betrayal`, `BETRAYALS`, `OWN_KINDS`,
  `plantFeelings`.

## Wave 31 (1 Nov 2026): word gets round, step i

Wave B1 of `docs/RELATIONSHIPS_PLAN.md` (the integration plan's 11.1 and
11.3). State's side: `docs/notes/engine-state.md`, Wave 31.

- **Step i, `deliverHearsay(to, events)`**, after the appointments (h),
  every tick: `State.apply({ hearsayDeliver: { day, phase } })`. An entry
  is heard when its time comes (`Rel.hearsayDue`: the night tick of its day
  for a spouse and the household, the next morning when it is already
  night; the next morning for other family, a boss and an employee, and
  for anything that made the town's news; the morning two days on for the
  rest) or, for a friend, a lover, a rival and the rest, as soon as the
  two share a place (who is where is worked out once a tick: `State.npcsAt`
  for every place). Someone not in town waits; four days on it goes
  unheard. It is written as `Rel.carry` plans it (the heard copy is dated
  the tick's day: the clock is already at the end of a passage while its
  ticks run), or, for an absent victim, as their own event at what hearing
  it is worth. Nothing goes further, and no Rng is drawn.
- **One line.** What gave someone a memory is told in one line for the
  tick, held to the turn's end inside a turn as the tick's notices are;
  what was heard in the night is told with the morning's, so a night's
  sleep gives one line: "Word got round: Wade Purvis, Tammy Lott and Austin
  Lott have heard about the landing." (`Rel.hearsayLine`: the people the
  player knows, in the order it was done, up to three, then "and others";
  one family name said once when everyone named shares it; strangers are
  neither named nor counted). Small things into everyday make no line.
- **The arrest route** is State's `npcStatus` with `by`; the three clock
  alternatives where Nikki Ballard makes the arrest name her (`by:
  "npc_nikki"`), the chief's take the police head.
- **Fights**: `knockDown`'s beat-down is the town's news when public, and
  its news makes the fight's earlier blows news for everyone they reach
  (State's `queueHearsay`), so a fight reaches each person at once, by the
  morning.

## Wave 32 (1 Nov 2026): ties that change, in World

Wave B2 of `docs/RELATIONSHIPS_PLAN.md`. State's side: `docs/notes/
engine-state.md`'s Wave 31 entry has the ties and hearsay; what changed:

- **A grudge's gossip goes along the ties.** Templates [7], [8] and [11]
  carry a `propagate` op from `{npcId}` (World.fillEffects fills it with the
  holder), so when the seed fires the word goes to the people tied to its
  holder, each by their tie (State queues it; step i delivers it): Pearl
  Gentry's Wednesday supper reaches her brother Elbert that night, not Ray
  and Nadine Dees by name; the department is whoever the holder works with.
- **Step i also brings an exposure home.** What the player told X about Y
  reaches Y by the tie between them (`own` hearsay, Y's own `exposed` scar,
  and the broken word when Y had paid): Mavis Mangum hears who told Dewayne
  that night, and the morning's line says "Word got round: Mavis Mangum has
  heard what you told Dewayne.". The memory is dated by the telling (the
  entry's `day`; State's `hearsayDeliver` sets it back), so her reason says
  Day 5 and it fades from then, as it did when it landed at once in tier A.
- **A secret told can set something going**: a `secretTies` entry's seed is
  planted hidden, due a day or two on (`Rel.rng('secretTie')`), and fires
  on its day as any seed does.
- **A clock can change a tie**: "Turn the swing vote" carries `tieDelta`
  (Darlene Pittman's trust in Loretta Gaddis -20, the tie known).
- **The town's standing** moves on what is done in public, as since wave
  27: news travelling the ties, a tie's change and gossip passed along move
  no reputation of their own (a gossip template's `reputationDelta` still
  does).

## Wave 33 (3 Nov 2026): a kiss lands on the one kissed

The owner: "You didn't add the 6th one which is spark … In my save, jodie
and I kissed … but she doesn't like me at all." Tests:
`tests/wave33-romance-target.test.cjs`; example 15 in
`tests/relationships-examples.test.cjs` and `docs/relationships/design.md`
section 6.4.

- **No fan-out** (`Rel.romanceTurn`): `open` is a Say to everyone and
  nothing else. A Do, or a Say to one person, that names nobody here is
  aimed at nobody: no answer, no flirt, no minor flag or phrase pointed at
  anyone. The debug line reads `romance: flirt aimed at nobody it could
  name`.
- **The target from the words** (`Pipeline.romanceTarget`, before
  `Rel.romanceTurn`): see `docs/notes/prompts.md`. The minor rule reads the
  same targets, so "I wink at her" with Kaylee the only woman here makes
  her a named target.
- **The late engine flirt** (`Rel.wireEvent`, State's `modelSocial` and
  `lateFlirt`): the romance step's aimed list rides in `opts.romance`
  (`turn.aimed`); with it empty on a romantic turn, a bookkeeper `flirted`
  for an adult here is written as the engine's (not as the model's, so its
  class dedupes the bookkeeper's compliment), welcome by `Rel.welcomeOf`
  then (the row: liking +4, knows +2, spark 10 x `sparkRate`) or unwelcome
  (liking -3 the first time, -6 after; trust -3, spark -5), with the
  jealousy of whoever saw it. A minor named that way is set aside for the
  minor rule as before; the parse's flag counts as theirs too, so with the
  bookkeeper's event that is two signals: the full row for them alone, as
  when the flag went to everyone here.
- **Arrivals** (`Pipeline.noteArrivals`): "Jodie's here", "is inside", "in
  the room", "in the doorway", "comes/walks/steps through the door",
  "pushes the door open" and "lets herself in" are arrivals, and a first
  name counts when it is unique among the people who could walk in
  (alive, free, not here, not laid up). The owner's turn 96 ("two quick
  knocks, and Jodie slips in") places her with the code as it was: that
  turn was played before wave 25 shipped (wave 25 was made from it).

## Wave 34 (3 Nov 2026): anyone can be won over, some the hard way

The owner: "There is characters that will go from 0 to 100 easier than
others. But everyone should be allowed to go to 100. Like if I try to
romance dewayne who's straight, i can succeed, barely, but Jodie should be
easier for example. You know. But everyone should have all 6. Romance and
spark included." Tests: `tests/wave34-romance-difficulty.test.cjs`; the
flirt rows of `tests/wave29-rel-hold.test.cjs`, `tests/wave33-romance-target.test.cjs`,
examples 10, 14 and 15 of `tests/relationships-examples.test.cjs` force their
rolls (`hooks.nextD20`, `hooks.nextTier`).

- **Everyone over 18 is eligible** (`Rel.eligible`: not a minor, and an
  adult player). The under-18 rules (`Rel.isMinor`, `Rel.playerMinor`, the
  minor rule) are unchanged; with a player under 18 nobody is eligible.
  `Rel.sparkGuard`, `pinOf`, the editor and imports follow `eligible`, so
  an older save's spark on an adult nobody listed now stays.
- **The list is tuning** (`Rel.tuningOf`, `Rel.ROMANCE_DEFAULTS`): `{
  sparkRate, opensAt, difficulty, listed }` from the person's entry, else
  rate 0.5, opens at knows 10, hard. `faithful: true` reads as very hard;
  `open` is no longer read. `Rel.sparkRate` reads it (a welcome flirt's
  spark is 10 x the rate, the row's `'rate'`).
- **A flirt rolls** (`Rel.romanceTurn`, `Pipeline.romanceStep`, `resolve`,
  `romanceLanded`). On a romantic turn at a named adult who knows the
  player at least their `opensAt` (`Rel.welcomeOf`), the romance step sets
  `roll: { npcId, stat: 'charm', difficulty }` and leaves the answer
  pending; Pipeline makes it the turn's roll whatever the parser said
  (`needsRoll`, charm, the difficulty, the person first in the targets;
  debug `flirt roll: charm, hard against npc_dewayne (hard, not listed;
  spark 0)`). The difficulty is `Rel.flirtDifficulty`: theirs, a step
  easier at spark 20 and two at 40 (`Rel.ROMANCE_EASE`), never below easy.
  The roll takes the liking modifier as a persuasion does (`rollOpts.actionType`
  is `persuade` for it), skips fear's no-roll compliance, and a critical
  failure gives no lasting condition (the awkward memory is its
  consequence). After resolve `Pipeline.romanceLanded` hands the tier to
  `Rel.romanceRolled`: critical, welcome with spark 15 x the rate;
  success, welcome (the row); partial, turned aside kindly, nothing
  written; failure, unwelcome (liking -3 the first time, -6 after, trust
  -3, spark -5); critical failure, unwelcome at twice the liking and
  weight 2, "came on to me and made it awkward" (`Rel.flirtAnswer`,
  `Rel.flirtEventOf`). The same failed flirt pushed again (the retry lock,
  `ctx.pressed`) is a no. Short of `opensAt`: no roll (a parse's
  `needsRoll` is dropped), "turns it aside, kindly", and an event with
  `soon: true` that `Rel.applyEvent` reads: the first marks
  `rel.soonOnce` and changes nothing, later ones cost liking 1 in everyday,
  no memory. A Say to everyone rolls nothing: each adult takes it lightly.
  Coercion never rolls (resolve's coercion comes first; the romance step
  sets no roll on a coerced turn).
- **The night** (`Rel.intimateGate`, spark 50, liking 40, trust 30, knows
  30, both adults): passed, "says yes; fade to black", no roll. Short, the
  ask rolls as a flirt, and a welcome answer is "not tonight; she says so
  kindly".
- **The late flirt** (`Rel.wireEvent`, State's `lateFlirt`): State.apply's
  opts carry the turn's `rollStat` and `rollTier`; a charm roll's tier
  decides it, no charm roll is turned aside kindly with nothing written,
  short of `opensAt` is the soon event. Its debug line names the tier.
- **Merging** (`Rel.applyEvent`): a harm merges only into a harmful memory
  of the same event, so an unwelcome flirt never folds into a welcome one.
- **The cast line** "open to a flirt" now shows only for someone a flirt
  would come easily to (`welcomeOf` ok and easy or normal now), so the
  narrator does not play every adult as flirty.

## Wave 35 (3 Nov 2026): romance is its own track

The owner: "I want 6 sliders with spark too.", then "Romance and spark are
different.", then "Do it 7 then, the more detailed the better." Tests: `tests/wave35-romance-track.test.cjs` (g); `tests/wave29-rel-hold.test.cjs`'s favours owed rows unchanged.

- **The favour seeds read a hand-set ledger.** `World.owedFavour` (net 2,
  liking above -25) and `World.owedAsk` (after 5 days, again 3 later, then
  crossed) read `rel.owed` as they did; an entry set by hand on the Edit
  form or by `relSet { owed }` (`why: 'set by hand'`, its day the edit's)
  plants the payback or the ask-back like any other.
- **Jealousy** (`Rel.jealousyOf`, run where World and Pipeline ran it): a
  witness at spark 30 takes romance -5 as well as spark -5.
- **The morning** (`relDay`): everyday romance drifts 1 a day toward 0 for
  someone the player did not see, beside liking and trust's 2.

## Wave 38 (12 Nov 2026): time with someone at its own table, turns from a button

The owner: "I don't give a shit about the story and only try to romance
people. Need to make it more visual not just text. Like that poker game is
amazing, I don't like that it's chat by chat tho". The UI side:
`docs/notes/ui.md`, Wave 38. Tests: `tests/wave38-date.test.cjs`.

- **`Pipeline.date(npcId)`** runs a turn with no parser call (the action is
  built in code: a talk aimed at them, a long). `runTurn`'s step 5 for it is
  `dateTurn`: the table opens in the feed and the turn waits at each moment
  on the same slot a hand of cards waits on (`waitForHand`, kind `date`), so
  Stop, `/undo`, another tab and the title screen all meet an open date the
  way they meet an open hand.
- **Who** (`dateOk`): `Rel.eligible` (an adult, an adult player, romance on
  in the story), here, alive and free, liking -10 or better, and not already
  this phase (the log's last `entry.date` for them). Anyone not eligible is
  `hide: true`: no button anywhere, and `date` refuses with a notice and no
  turn.
- **The moves** (`dateMoves`, `dateMove`), each written at once through
  `State.apply({ socialEvents })` with the rows as they are: ask (Wits at
  `dateTaste`'s difficulty: `complimented` with `d { w: 2, k: 3 }` "asked
  about me and listened", `they_confided` on a critical, `pried` on a
  failure), laugh (Charm: `complimented`, x1.5 on a critical; `insulted`
  x0.5 on a critical failure), open (`confided`, once), treat (`goldDelta`,
  `gift`, `giftGiven`, once and once a day), flirt (`Rel.welcomeOf` decides
  whether it is offered; the roll is Charm at `Rel.flirtDifficulty`;
  `Rel.flirtAnswer` and `Rel.flirtEventOf` land and record it with
  `Rel.jealousyOf` for who is watching; a no shuts it; two at most).
- **Taste** (`dateTaste`, from `Rel.axesOf`): ask is easy at guardedness 1
  or more, hard at -1 or less until trust is 20; laugh is easy at grudge 1
  or more, hard at grudge -1 or less or pride 1 or more; the mercenary flag
  makes a treat worth two of ease.
- **Ease** (`dateEase`, `easeMod`): starts 1 to 4 from liking (10, 40) and a
  spark of 20; a tier moves it +2, +1, 0, -1, -2; 4 or more is +1 on a
  roll ("at ease"), 1 or less -1 ("on edge"); 0 ends the date (`cut`).
- **Rolls** use `nextDie`, so `/cheat success` and `forceNextRoll` reach
  them; no complication is rolled, and they set no retry lock.
- **The end**: `relTurn` for the two of them, `npcKnownToPlayer`, the
  record (`ctx.dateRec`: beats, start, end, gains, stance before and after,
  what was spent) kept as `entry.date` (State's `logDate` checks it field by
  field), then one narration from a `TIME TOGETHER` line that lists the
  moments in order and forbids adding to them, and a bookkeeper told
  nothing of it is to be recorded again. `cleanDiff` drops any
  `attitudeChanges`, `socialEvents`, `newMemories` and `goldDelta` the
  bookkeeper sends for that person anyway. `turnTogether` leaves a date
  turn alone.
- **Told plainly** (`plainDateText`, through `plainNarration`): Stop at the
  table (no call at all), or a narrator that failed, was stopped or
  declined after the date; the demo's narration is the same account.
- **Limits**: nothing new. `Rel.CAPS.turn` holds what the whole date can
  move, the same-day repeat rules hold what a second date that day can, and
  the gift is the day's one gift.
- **`Pipeline.flirt(npcId)`**: a turn whose action is a talk with
  `romantic: 'flirt'` aimed at them; `romanceStep` does the rest.
  **`Pipeline.sitIn()`**: a gamble action aimed at the dealer here.
  **`Pipeline.dealAgain()`**: the same with `quickHand`: once the hand is
  played it is told by `plainNarration(ctx, 'quick')` (the engine's line,
  no notice), so there is no narrator and no bookkeeper call; it needs the
  newest log entry to be a hand at this dealer today.
