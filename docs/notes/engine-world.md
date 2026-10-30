# Engine-world fixes (wave 1)

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
