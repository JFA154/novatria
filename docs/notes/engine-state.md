# Engine-state: wave 1 of the review fixes

Region: the State module (`index.html`, `// ===== Module: State =====` to
`// ===== Module: Town =====`), plus two seams CONTRACTS gives this area:
`Town.resolveLooseEnd` (the loose end's obligation copied onto its seed,
CONTRACTS section 4) and the op-name table in `tests/validate-town.cjs`
(names only, see "Seams touched" below). Tests: `tests/engine-state-fixes.test.cjs`
(18 tests).

## Exported names (check against CONTRACTS section 16)

All on `State` (`window.Game.State`):

| Name | Shape |
|---|---|
| `EFFECT_OPS` | frozen list of every op `State.apply({ effects })` takes (13 old + 13 new) |
| `season()` | `town.calendar.season`, else `town.season`, else `flags.season` |
| `weekday(day?)` | `'Sunday'`..`'Saturday'`; from `town.calendar.startDate`, else day 1 = Thursday |
| `dateLine(day?)` | `'Thursday 8 October'`; the weekday alone without a start date |
| `isClosed(locOrId, day?)` | `loc.closed === true` or `loc.closedOn` includes that day's weekday |
| `isBanned(locOrId, day?)` | the ban record `{ locationId, untilDay, byNpcId? }` that holds that day, or `null` (truthy/falsy) |
| `priceFactor()` | `flags.priceMultiplier` x `flags.playerPriceMultiplier` (while `playerPriceUntilDay >= day`), rounded to 0.01. For `Tables.price` |
| `restQuality()` | `'bed'` or `'rough'` (CONTRACTS section 7) |
| `obligations(status?)` | a new array of the live obligation records, all or one status |
| `tickObligations(day)` | misses every open obligation with `dueDay < day` (onMiss runs once, through `apply`, source `'world'`); returns the ids missed |
| `expireDaily(day)` | bans, the player price and paid lodging that ran out before `day`, through `apply`; returns what ran out, in words. Idempotent |
| `news` | getter: the live `state.news` array (`[]` with no game) |
| `absentNote(n, phase?, day?)` | the global `absentNote(n)` (dead, far away), then `hurt and laid up at the Mangum House until day 5`, `at the county school in Clayburn until evening`; `''` when about |
| `awayNow(n, phase?, day?)`, `laidUp(n, day?)` | the two tests `npcsAt` uses |
| `attitudeWord(a)`, `reputationTier(key?)` | unchanged, except the -20 tier is now `'disliked'` (was `'feared'`) |
| `SEED_ORIGINS`, `OBLIGATION_KINDS`, `NPC_FATES`, `WEEKDAYS` | lists |
| `load(st, town)` | now returns `{ state, rulesVersion, newer }` (was the state; no caller used it). `newer` when the save's `meta.rulesVersion` is above `RULES_VERSION`: it still loads |
| `validateShape(st, town?)` | `[]` or `[firstProblem]` (deep; see below) |
| `snapshot()` / `restore(snap?)` | unchanged API; a snapshot now holds `State.town` too |

`State.apply` results gain `progressed: [{ threadId, gain }]` (a thread's
first resolution raised a stat or max HP: transport's quiet line) and
`settled: [{ id, status }]` (an obligation met or missed in that apply).

## Effect ops (CONTRACTS section 2), exactly as implemented

Every op returns a log line. Any of `npcId, locationId, factionId, threadId,
byNpcId, rumourId, seedId, id, key, a, b` that is a string starting with `{`
is refused ("a placeholder that was never filled in").

| Op | Fields | Result |
|---|---|---|
| `playerGold` | `delta` (int) | gold clamped at 0 ("took what there was") |
| `playerHp` | `delta` (int, held to -3..+3), `allowDefeat?` | never below 1 (or below the current HP if already 0) unless `allowDefeat: true` |
| `giveItem` | `name`, `notes?`, `qty?` (1..99) | stacks on a carried thing of that name (any case) |
| `takeItem` | `name` (or `id`), `qty?` (default 1) | by name, any case; a no-op when not carried |
| `addCondition` | `name`, `effect` (`"-1 might"`), `days` (0..30) | `untilDay = day + days` (active through that day) |
| `banFrom` | `locationId`, `days` (0..60), `byNpcId?` | `state.bans` gets `{ locationId, untilDay: day + days, byNpcId? }`; a second ban there keeps the later day |
| `playerPrice` | `factor` (>0, each step clamped 0.25..4), `days` (0..60) | `flags.playerPriceMultiplier` (multiplied in, 0.25..4) and `flags.playerPriceUntilDay` |
| `addMemory` | `npcId`, `text`, `weight` (1..3) | the memory path; a memory with the same first five words merges into the older one; a no-op for the dead (someone living elsewhere still remembers: they can be reached) |
| `clockAdjust` | `factionId`, `delta` (-2, -1, 1, 2) | the running clock, clamped 0..segments, no completion check; a no-op when no clock runs |
| `threadUpdate` | `threadId`, `summary?`, `status?`, `knownToPlayer?` | status through `setThreadStatus`; a resolved thread's status never moves (no-op) |
| `addObligation` | `kind`, `npcId`, `text`, `amount?`, `dueDay?` or `dueOffset?` (0..60, from today), `itemName?`, `onMiss?`, `onMet?` (effect lists, 12 at most), `id?` (`obl_...`) | see Obligations |
| `settleObligation` | `id`, `status` (`met`/`missed`), `how?` | sets the status once and runs `onMet`/`onMiss` once; a no-op if already settled |
| `addNews` | `text`, `factionId?`, `public?` (default true), `epilogue?`, `day?`, `phase?` | pushes `{ day, phase, text, factionId, public, seen: false, epilogue? }`; keeps the newest 60 |

Existing ops changed: `npcStatus` dead now takes them off every schedule
and cancels their visit (review E14); `threadStatus` on a resolved thread
is a no-op.

New engine keys (`ENGINE_KEYS`): `expireDaily: <day>`, `newsSeen: true`
(marks every news item seen) or `newsSeen: 'public'` (only the public items
that are not an ending: what transport's morning "Overnight in town" block
told, so it never writes state directly), and `eventsFired: [id]` (a town
event or the epilogue told, kept once in `state.eventsFired`; World's
`fireEvents` writes it, the Debug tab lists it).

## Obligations (CONTRACTS section 4)

`state.player.obligations: [{ id, kind, npcId, text, amount, dueDay,
itemName, status, onMiss, onMet, createdTurn, createdDay, settledDay?,
settledTurn? }]`. Kinds: `debt, blackmail, promise, errand, lodging`. One
open obligation per (kind, npcId); the id is `obl_<kind>_<npc id>` with the
full id (`obl_debt_npc_curtis`, the form the council meeting and the epilogue
read), with `_2`, `_3` for later ones, unless an `id` is given. `text`, `itemName`, `onMiss` and `onMet` have `{npc}`,
`{npcId}`, `{player}`, `{playerName}` filled with the obligation's own
person and the player.

Settled by play, in `State.apply` on a model diff with `present`: a
`goldDelta` that hands over at least `amount` with the creditor present
meets a `debt` (and a `blackmail`, which also has an amount); an
`itemsLost` of the errand's `itemName` (same words, or one inside the other)
with the person present meets an `errand`. `obligationsSettled: [id]` from
the model needs the person present; a debt or blackmail with an amount is
met only by paying it, an errand only once its thing is no longer carried.
From the engine it is met as asked.

Loose ends: `Town.resolveLooseEnd` reads the option's obligation (an option
written as `{ text, obligation }`, else `LOOSE_ENDS[kind].obligations[i]`,
else `LOOSE_ENDS[kind].obligation`; words the player typed take the first
option's), fills its placeholders now (the person and the player are
known) and puts it on the seed as `effects: [{ op: 'addObligation', kind,
npcId, text, amount, dueOffset, itemName, onMiss, onMet }]`. When World
fires the seed and applies its effects, `addObligation` sets `dueDay =
that day + dueOffset`. A kind missing on the obligation is taken from the
loose end (`debt -> debt, secret -> blackmail, promise -> promise, lost ->
errand`). Options that are plain strings still work (they are read through
`optionText`).

## Model diffs (CONTRACTS section 10)

`State.apply(diff, { source: 'model', present: [npcIds], rollSuccess:
bool, attacked: npcId|null })`:

- `goldDelta` held to +500 a turn (a per-turn ledger; a spend is held only by the cash carried, wave 24), `hpDelta` to +/-3 a
  turn; HP never goes from above 0 to 0 unless `attacked` and
  `rollSuccess === false` (held at 1).
- `itemsGained`: at most 2 things carried in a turn (services do not count);
  all refused ("not paid for") when the same diff's `goldDelta` was refused
  as unaffordable. A name matching a `TABLES.items.goods` entry of kind
  `service`, `drink` or `food` is not carried (logged); a lodging service
  (`lodging: true`, or a service named "Night at ..." / "Room at ...", or
  any bought "night at"/"room at" name with no table entry) sets
  `flags.lodgingPaidUntilDay = day + 1`. Goods without `kind` are carried, as
  before.
- `newSeeds`: 1 a turn from the model (the engine keeps 2).
- `conditionsAdded`: at most 3 days from the model (the engine 30).
- `npcFates: [{ npcId, status }]` (`arrested, gone, dead, hurt`): from the
  model only someone in `present`, one a turn, and `dead`/`arrested`/`gone`
  only with `rollSuccess === true`; no `present` list means no fate. `hurt`
  sets `n.hurtUntilDay = day + 2` (status unchanged; they are at home every
  phase until that day: `npcsAt`). The rest go through `npcStatus`. The
  engine (World.knockDown) may send it with no checks.
- `memoriesSettled: [{ npcId, text }]`: the first memory whose text holds
  the given words (or is held in them), any case, 6 characters at least, is
  removed.
- `obligationsSettled: [id]`: above.
- `npcKnownToPlayer`: `metTurn` is set only for ids in `present`. The first
  meeting (metTurn set; or, with no `present` list, a model's first mention)
  shifts a faction member's attitude by `round(reputation[faction] / 5)`
  once (`n.repApplied = true`).
- `clockNudges`: one segment per faction per day and phase, kept in
  `meta.nudges = { at: 'day:phase', used: { fac_x: n } }` (saved, so /undo
  takes a nudge back).
- `newMemories` from the model: one whose first five words match an older
  memory of that person merges into it (newer words, heavier weight, this
  turn). Engine memories (facts, loose ends, Upgrade) never merge.
- `rumoursHeard`: a rumour with `threadId` makes that thread known.
- `playerLocationId` from the model is refused into a place closed today
  (`isClosed`) or one the player is banned from.
- `journalEntry` lines now store `{ turn, day, phase, text }`.

## Time (review E5, E14, design #5; CONTRACTS section 8)

`advanceTime` takes a cost string or `{ cost, toPhaseStart?, cause? }`:

- `toPhaseStart: true`: a phase that passes lands at shorts 0 (for `/wait`
  and `/skip`). noSleep logic unchanged.
- `cause: 'defeat'` with a long: reaching morning is not a night without
  sleep (no `noSleep`, no Tired).
- Instants: every 6 `instant` costs make a short (`time.instants`), reset at
  any phase change. An instant whose `cause` is `rest`, `wait`, `skip`,
  `arrival`, `defeat`, `arrest` or `epilogue` (the narration of time already
  passed) does not count; a plain string counts.
- A new morning reached with `noSleep` adds `{ id: 'cond_tired', name:
  'Tired', effect: '-1 all', untilDay: null, untilRest: true }`; a rest
  removes it (and any `untilRest` condition).
- A rest asks `restQuality()`: `'bed'` heals 3 (a paid night is used up),
  `'rough'` heals 1 and adds `{ id: 'cond_stiff', name: 'Stiff', effect:
  '-1 might', untilDay: <the new day> }`. The result carries `quality`.
- Each new day runs the expiry (`expireDaily`'s work) inside `advanceTime`.
- The `advanceTime` result may also carry `cause`, `instants` and
  `instantShort: true` (the instant that made a short).

**Deviation from the brief:** `time.instants` is kept only while above 0,
like `late` and `noSleep` ("so a clock that never used them keeps its old
shape"), and `State.load` drops a value that is not a positive whole number
instead of filling `instants: 0`. A filled 0 changed the clock object's
shape in every save and broke the assertions in the state, pipeline and
upgrade suites that compare the clock exactly. **Read it as `time.instants | 0`.**

`restQuality()`: `'bed'` at a motel/inn/hotel with `flags.lodgingPaidUntilDay
>= day` (the paid night is used up by sleeping there), or at a motel or a
dwelling type (`DWELLING_TYPES`) where someone free whose home it is has
attitude 25 or more; otherwise `'rough'`. (CONTRACTS reads "a dwelling/motel
type with lodgingPaidUntilDay >= day or a resident with attitude >= 25"; a
paid motel night does not make a trailer a bed.)

## Calendar, closed days, away and hurt (CONTRACTS section 1)

- `newGame`: `flags.season` is `season()` when the town has a calendar (or
  a `season`); the old random pick still draws from the seeded stream and
  is used only without one, so a seed binds the same loose ends as before.
- `npcsAt(locId, phase)`: someone whose `awayOn` matches today's weekday
  and that phase is nowhere; someone `hurtUntilDay > day` (and free) is at
  their home in every phase and nowhere else. Visits do not override either.
- Dead people are taken off every schedule (npcStatus, npcFates, and once
  at load for older saves).

## Threads and progression (CONTRACTS section 9, review E4)

`setThreadStatus` awards a story point only the first time a thread is
resolved (`thread.resolvedOnce = true`; a thread already resolved in an
older save counts as resolved once when it is first moved). On that first
resolution, if the thread is `knownToPlayer`, the player gets +1 to
`thread.reward` (a stat; at most +3) or else +2 max HP (at most 16; HP rises
with it; also when the reward stat is already +3), recorded as
`player.progression.push({ turn, day, threadId, gain })` and in the
result's `progressed`. `openThread` keeps a valid `reward`; `addRumour`
keeps a valid `threadId`.

## Saves (CONTRACTS section 14, review R3, R4, R8 part, R9)

- `validateShape(st, town?)` is deep and returns the first problem only:
  every npc/location/faction/thread/seed/rumour an object with a string `id`
  (npcs, locations and factions a `name`), `player.inventory` a list of
  objects with id and name, a place's `items` likewise, `conditions`,
  `obligations`, `looseEnds`, `news`, `bans`, `dueEvents`, `visits` lists of
  objects, `eventsFired` a list of strings; no string longer than 4,000
  (`history` 400, a log `narration` 6,000). With the town: its top-level
  `history`/`setting` 8,000, any `history` 400, anything else 4,000.
  `State.load` checks the town too and throws with the reason.
- `State.load` fills `news: []`, `bans: []`, `eventsFired: []`,
  `player.obligations: []` when missing.
- Snapshots hold `State.town`, so `/undo` after an update restores the
  town copy; `snapshot()` still returns the game's JSON (App and transport
  compare it with `JSON.stringify(State.current)`).

## Background hooks

`BACKGROUNDS[id].hook = { effect, dayOffset?, trigger?, npcId?,
locationId?, effects?, requires?, alt?, cause? }` is planted at creation as
`seed_bg_<background>` (hidden, `origin: { kind: 'background', npcId? }`).
`dayOffset [a, b]` is read as the loose ends read theirs: day numbers from
day 1, never before tomorrow (default [2, 4]). `trigger` is `'day'`
(default), `'npc'` (with `npcId`), `'location'` (with `locationId`) or a
`{ type, value }` object. `{player}` (and `{npc}` with `npcId`) are filled.
Nothing happens without a hook.

## Seams touched outside the region

- `Town.resolveLooseEnd` (engine-world's module; CONTRACTS section 4 gives
  the copy to engine-state): `optionText`, `looseEndObligation`, `fillAll`
  and the seed's `effects`. Nothing else in Town changed.
- `tests/validate-town.cjs` (content's file): the 13 new op names added to
  the `OPS` table with their required fields only, so the existing
  state.test check "OPS names exactly State.EFFECT_OPS" passes. The content
  agent's version of the table (with the real field checks) supersedes it.

## Tests changed by design

- `state.test.cjs`: "gold cannot go below 0; HP is clamped" sends the
  out-of-range HP from the engine (the model is now capped);
  "new seeds" is 1 a turn from the model; "time: ..." expects a rough rest
  (heals 1).
- `pipeline.test.cjs`: `/rest` heals 1 at the arrival place ("recovered 1
  HP"); `/look` and the same-phase `/skip` compare the clock without
  `instants`; the insult memories are `[2, 3]`.
- `acceptance.test.cjs` [4] and `world.test.cjs` (three insults): the two
  identical "insulted them again" memories merge: `[2, 3]`.

## Needs from others

- **transport**: pass `{ source: 'model', present, rollSuccess, attacked }`
  with the bookkeeper's diff (without `present`, no npcFates, no metTurn,
  no settle by play). `passTime` should send `State.apply({ advanceTime: {
  cost, cause } })` so the narration of `/rest`, `/wait`, `/skip` and the
  arrival does not count as an instant; `/wait` and `/skip` longs with
  `toPhaseStart: true` (review E5); defeat with `{ cost: 'long', cause:
  'defeat' }`. Mark news seen with `State.apply({ newsSeen: 'public' })` (integration: done). A
  progression quiet line can read `result.progressed`.
- **engine-world**: `World.tick` should call `State.tickObligations(to.day)`
  on each new morning (expiry already runs inside `advanceTime`; calling
  `State.expireDaily(day)` too is harmless). `Tables.price` should multiply
  by `State.priceFactor()` instead of `flags.priceMultiplier`. Seeds carry
  `effects`, `requires` and `alt` through `plantSeed` (normaliseSeed keeps
  them for engine seeds only). `World.knockDown` can send `npcFates: [{
  npcId, status: 'hurt' }]` from the engine.
- **ui / Storage**: `parseEnvelope` should call
  `State.validateShape(env.state, env.town)` (the town caps); `State.load`
  throws on a bad town now. Show `State.load(...).newer`. The People card
  can use `State.absentNote(n)` for the hurt and the away.
- **prompts**: the clock line can use `State.dateLine()` / `State.weekday()`;
  the narrator's person line should keep `look` until `n.metTurn` is set.
  `record_changes` gains `npcFates`, `memoriesSettled`, `obligationsSettled`
  (44 properties; a live grammar probe is still needed).
- **content**: obligation shapes as above; `thread.reward` a stat name;
  `rumour.threadId`; goods `kind` and, for a night's lodging, a name
  starting "Night at" or `lodging: true`; `location.closedOn`; `npc.awayOn`;
  `BACKGROUNDS[].hook`; `TOWN_DATA.calendar`.

## README / BUILD_PLAN text to fold in

> The clock follows talk too: six instant actions make a short. A morning
> reached without sleep leaves you Tired (-1 to everything) until you rest;
> sleeping rough heals 1 HP and leaves you Stiff (-1 might) for the day,
> a paid motel night or a friend's couch heals 3. Drinks, meals and
> services are had where they are bought, not carried. The town keeps a
> calendar (day 1 is Thursday 8 October 2026): some places close on
> Sundays, the teacher and students are at school on weekday mornings.
> What you owe is a ledger: a debt, a promise or an errand has a due day,
> and missing it has consequences; paying in front of the creditor
> settles it. Resolving a thread you know about the first time earns a
> story point and +1 to a stat (or +2 max HP). The bookkeeper is held to
> what one turn can do: $500 gained (a spend by the cash carried), 3 HP, two things, one plan, three days of a
> condition, and nobody dies, is arrested or leaves without a roll that
> succeeded.

## Integration (after the six merges)

- `RULES_VERSION` is 8: new games are stamped 8, older saves show "Update
  this game" and run "An arc"; transport sends the `advanceTime` object form.
- Obligation ids carry the full npc id (`obl_debt_npc_curtis`).
- `addMemory` on the dead is a logged no-op; someone living elsewhere still
  remembers (they can be reached by `reach`). `clockAdjust` on a faction with
  no running clock was already a no-op.
- `rumoursHeard` stamps `heardDay` (the Journal's Leads); the UI no longer
  stamps it.
- `normaliseSeed` takes a list of places or people as an engine seed's
  `trigger.value` (1 to 8); a seed from the model still names one.
- Background hooks: a number `dayOffset` (content's form) means "not before
  day 1 + dayOffset" for a person or place trigger (0: from day 1, once the
  player meets them); a day trigger is still never before tomorrow.
- Engine keys `newsSeen: 'public'` and `eventsFired: [id]` (above).

## Wave 2

Review bugs 2 and 3, the review's risks and constraint list, and the
playtest's B12, B13, B14, B18 on the State side. Tests:
`tests/wave2-fixes.test.cjs`.

- **Every write through `State.apply`.** New engine keys (`ENGINE_KEYS`):
  - `fight: { npcId, hits (0..3), day, phase, locationId, turn } | null`:
    the fight in progress (the Pipeline's; saved, so `/undo` takes a hit
    back).
  - `logUpdate: { turn?, changes?: 'not recorded' | null, notes?: [text] }`:
    a logged turn changed afterwards (the newest entry when `turn` is left
    out): a late bookkeeper retry clears `changes`; the turn's quiet lines go
    on it as `notes` (at most 24 kept). App's `attachNotes` uses it.
  - `giftGiven: npcId`: `meta.gifts = { day, ids }`, today's gifts.
  - `arcFill: { town, seeds?: [{ seedId, effects }] }`: Upgrade version 8 (the
    town copy's calendar, events and epilogue, rumours' `tellerIds`/`threadId`
    and threads' `reward` in the copy and in the game, the arc's empty lists,
    effects for an unfired seed with none). Fills only what is missing;
    `result.arc` counts it.
  - `logEntry` keeps `changes: 'not recorded'` and `notes`.
  - `apply(diff, { quiet: true })` does not call the listeners (the notes on
    a log entry need no redraw). A change a listener makes while the
    listeners run is part of that notification (no second round).
- **Debts paid over time** (review bug 2). An obligation keeps `paid` (set
  only once something is paid). A model diff's payment goes toward an open
  (or missed, still owed) debt or blackmail whose person is present when the
  bookkeeper names it in `obligationsSettled`, or the action was aimed at
  that person (`opts.targets`, new; transport passes the action's targets),
  or nobody else is here. Money spent in front of the creditor on anything
  else pays nothing. Such a payment may move up to what is still owed in one
  turn (the usual cap is $500). It is met once `paid` covers `amount` (in one
  turn or several); `obligationsSettled` for a debt not yet covered is
  refused with what was paid so far.
- **A missed obligation can still be made good** (playtest B18). The status
  stays `'missed'` (content, the validator and the UI read met/missed), but
  `State.obligations('owed')` lists the open ones plus the missed ones still
  owed (a debt or blackmail not paid in full, an errand whose thing is still
  carried). Paying (or handing the thing over) later meets it: status
  `'met'`, `late: true`, and its `onMet` runs then.
- `addObligation` takes `missText` (the missed due event's words, filled)
  and `askerId` (an errand: who asked; the one who comes looking). An errand
  whose thing is no longer carried and whose person already remembers
  getting it (a memory with its head word: "letter") is met as it is made.
- `memoriesSettled` from the model needs the person present, and never
  drops a protected memory (`State.PROTECTED_MEMORIES`: a loose end's, a
  story point's fact; `State.protectedMemory(m)`; Upgrade uses the same).
- News: `addNews` takes `eventId` and `seen: true` (it happened in front of
  the player); `newsSeen` also takes `'ending'` (the epilogue's turn was
  narrated) and `{ eventId }` (the player watched that town event).
- `dueAdd` keeps `scene: true`, `eventId` and `obligationId` (a due event
  about an obligation is dropped untold once it is met).
- **Hurt** (coordinator item c): `n.hurtUntilDay` is the day they are about
  again. `State.isHurt(n, day?)` is true on every day before it (whatever
  their status); `laidUp` is hurt and free. `absentNote` reads "hurt and laid
  up at X until day N" with N the last day laid up (hurtUntilDay - 1). The UI
  card should use `State.isHurt` and show `hurtUntilDay - 1`.
- **A place closed today** (playtest B14): `npcsAt` holds only the people
  who live there and anyone sent there by a visit; `restQuality()` is
  `'rough'` there unless a resident friend (25+) lives there.
- **Saves** (playtest B12, B13): `validateShape(st, town?)` also checks
  every field the engine reads has its type (`typeProblem`): the player's
  gold, hp, maxHp, story points and stats are numbers (a number written as
  text, "140", passes and `load` reads it as the number: `coerceNumbers`);
  a place's exits and each phase's schedule are lists of ids, `closed` a
  boolean, `closedOn` a list; a person's memories a list of `{ text,
  weight }`, tags a list, home a place record; clocks numbers; a seed's
  trigger a record and effects a list; an obligation's id, kind, status,
  whole-number dueDay/amount/paid and a person who exists. The town copy
  (`townTypeProblem`): its lists are lists of records with ids, a place's
  exits and schedules lists, an event's day a number and its branches and
  attendees lists, the epilogue, calendar and map records. Storage's
  `parseEnvelope` now passes the town it carries.
- `State.NOT_ACTIONS` is exported (the Pipeline's TIME THIS TAKES reads it).

## Integration (wave 2)

- `addObligation` keeps content's `owedTo` (placeholders filled; `askerId`
  is read as the same and stored as `owedTo`); `validateShape` refuses an
  `owedTo` or `askerId` that names nobody and a `missText` that is not text.
- The mock's memory rewrite keeps `State.MEMORY_MAX` (it kept six);
  `tests/upgrade.test.cjs` follows (changed by design).

## Wave 3

The second code review's bugs 1, 3, 7 (State half), 9 and its risks on the
State side; the second playtest's N1, N2, N7 and the README row on beds.
Tests: `tests/wave3-fixes.test.cjs`.

- **A purchase is not a payment** (review bug 1, playtest N1). `apply` takes
  `opts.actionType` (transport passes the action's). Money in a model diff
  goes toward a debt or blackmail only when the bookkeeper names it in
  `obligationsSettled`, or it went to the creditor (aimed at them, or nobody
  else here) and bought nothing: not a `buy`, and no `itemsGained` (a cold
  drink from Hollis alone at his counter is the price of the drink). Only a
  payment raises the $500 cap to what is still owed.
- **Paid late** (review bug 3): `settle(o, 'met', how, lateNow)` runs the
  obligation's `onMet` with any memory that says "on time" (or "early",
  "before it was due") rewritten to ", but late" ("paid the six hundred in
  full, but late"). The settle-by-play paths pass `lateNow` instead of
  flipping the status to open first.
- **A loose end settled** (playtest N7): an obligation met (on time or late)
  resolves the open thread of the player's loose end with the same person
  and kind (debt: debt; secret: blackmail; promise: promise or errand; lost:
  errand) through `setThreadStatus` (`resolvedOnce`, the story point and the
  progression apply). Open no longer lists it.
- **Bans end before their day** (review bug 7, playtest N2): `isBanned` holds
  while `day < untilDay`, `expireDaily` drops a ban on its `untilDay`, so
  "until day N" means welcome again on day N and `banFrom { days: N }` is N
  days with today. A ban saved by an older build ends a day earlier than it
  did. The People card's "Banned you from ... until day N" and the Places
  sheet read the same (two one-character UI edits: `> day`).
- **Numbers written as text** (review bug 9): `typeProblem` also checks
  `meta.turn`, `meta.rngCalls`, an item's `qty` and `price` (carried or lying
  in a place), a ban's `untilDay` and a condition's `untilDay`; `coerceNumbers`
  converts them (and an age) at load.
- **mergePeople** (review risk): every reference moves: obligations (person,
  `owedTo`, the ids in `onMiss`/`onMet`), bans, the fight, today's gifts,
  seeds' effects, `alt` and `requires`, an npc trigger's value list, other
  people's relations and rumours' tellers; the pending scene's `before` too.
  A save merged after an obligation exists still loads.
- `visits` (engine) takes `{ day, phase }` for the phase a walk lands in (this
  phase or later today, or the morning after a night); `npcsAt(loc, phase,
  day)` takes the day. The phase-change filter keeps such a visit.
- `sceneChange` keeps `before` (who was here when the untold stretch began);
  passTime measures every later step against it.
- `restQuality`: a bed anywhere someone who lives there or owns the place
  (their role says "owner" and names it: Loretta and the Low Water) is free
  and at attitude 25 or more; a place shut today has only that bed; a paid
  motel night as before.
- `addNews` keeps an ending's text to 1,500 characters and cuts other news
  at a word with "…" (`clipWords`, a helper beside `cleanText`).

## Integration (wave 3)

- `absentNote` for someone laid up names `hurtUntilDay`, the day they are
  about again ("hurt and laid up at the Mangum House until day 5": about on
  day 5), as a ban's "until day N" is the day the player is welcome again.
  This replaces the coordinator item (c) form above (the last day laid up);
  `wave2-fixes.test.cjs`' hurt test follows (changed by design).

## Wave 4

The third code review's bug 1 (State half) and its risks on the State side;
the third playtest's R5 and R9 and its design notes. Tests:
`tests/wave4-fixes.test.cjs`.

- **A purchase in Say mode** (review bug 1): `apply` takes `opts.bought`
  (transport passes the turn's purchase, read before Say mode turns the
  action into talk). A purchase never pays a debt unless the bookkeeper
  names it, and never raises the cap.
- **A failed ask settles nothing with that person** (playtest design note):
  `apply` takes `opts.rolled` (a roll was made); a model's
  `obligationsSettled` for someone the turn's talk, persuade, deceive or
  intimidate roll failed against (aimed at them, or they are alone with the
  player) is refused ("No. Not happening." is no promise kept).
- **Memories carry their day** (playtest R5): `remember` stamps `day`;
  `checkMemories` (setMemories, editPerson) keeps a valid one. World's drift
  reads it (engine-world.md, Wave 4).
- **Visits**: one per person and phase (not one per person), so someone who
  came for the player now can also be kept there for the phase the turn runs
  into; `mergePeople` dedupes by person, day and phase.
- **banFrom days 0** is tonight, as days 1 is (review risk): a ban that
  never held was no ban.
- **restQuality** (review risk): an owner who does not live at their place
  gives a bed there only while they are there (`npcsAt`), so no friend's
  couch in a shut pawn shop or gas station.
- **ON_TIME_RE** starts at a word: "paid nearly all of it" is not "early".
- **placeItem** (effect op, playtest R10): `{ name, notes?, locationId? }`
  leaves a thing lying in a place (the player's by default) to be picked up;
  `tests/validate-town.cjs` knows it.
- **A loose end's thread** gives the story point only (playtest design
  note: paying blackmail made the player tougher): its progression entry has
  `gain: null`, no stat and no max HP. Every entry keeps its own `gain`
  ("charm +1", "max HP +2", or null); the UI's Grown line can read it
  (`Pipeline.gainText`).
- **arcFill refreshes the plans** (playtest R9): each faction clock, matched
  by its label, takes the town data's `onComplete` (text, effects, requires,
  alt) and, while nothing is filled, its segments; `filled`, `done` and the
  active clock stay, and the order is kept. An unfired seed matched by id
  takes its `requires` and `alt`, and its `effects` when it has none. In the
  game and in its town copy; `result.arc.plans` counts them, and Upgrade's
  "An arc" says "N of the town's plans now check the story before they
  happen." A re-read of a current game changes nothing.
- Dead: the `typeof State.x === 'function'` guards in Api, Pipeline and
  World (every function exists), the stale "beside DWELLING_TYPES" comment.

## Wave 5

The fourth code review's risks on the State side and the round-4
playtest's Q3, Q5, Q11, Q12 and design notes. Tests:
`tests/wave5-fixes.test.cjs`.

- **A failed ask settles nothing with that person only** (review risk):
  `apply` takes `opts.asked`, the one the turn's social roll was against
  (Pipeline's `ctx.rollNpcId`); said to everyone, a failed roll refuses an
  `obligationsSettled` for them alone, not for everyone present. Without
  `asked` the wave-4 rule stands (aimed at them, or alone with the player).
- **Memories carry the kind of turn** (playtest Q3): `remember` stamps
  `act` (`MEMORY_ACTS`: attack, steal, talk, persuade, deceive,
  intimidate) from the turn's action type; `checkMemories` keeps it, and
  the memory rewrite keeps it when every source agrees, with the newest
  `day` of its sources (review bug 6).
- **`obligationPaid`** (effect op, the playtest's design note):
  `{ id, amount, take? }` credits money toward a debt or blackmail (`paid`,
  at most what is still owed); `take: true` takes it from the player's cash
  first (what there is) and credits what it took; paid in full it is met
  (late when missed). An obligation's own `onMiss` and `onMet` can name
  `"{obligationId}"`, filled when it is made: the repo man's `$150` is now
  credited against the title-loan note. `tests/validate-town.cjs` knows it.
- **Known before resolved** (playtest Q12): `threadUpdate` and
  `threadUpdates` apply `knownToPlayer` before the status, so a thread made
  known and resolved at once earns its progression (the Resolved line, the
  gain).
- **A shop that is also a home** (playtest Q11): `restQuality` gives the
  bed of someone who lives there only when they are there now or there
  tonight (`npcsAt(l, 'night')`): Hollis fishes at the landing at night, so
  his pawn shop is no couch then.
- **News that waits for its narration** (review risk): `newsWaits(item)`
  is true while a due event with the item's `eventId` is still to be told
  wherever the player is (not a town event's scene, told only at its
  place); `newsSeen 'public'` leaves such items, and "Overnight in town"
  skips them.
- **Next-phase dates**: `addNews` takes a day up to the next phase (the
  morning after a night), so a walk at night into a morning event dates its
  news to that morning.
- **One /undo for a turn and its ending** (playtest Q5): `joinSnapshot(snap)`
  drops the ending turn's own snapshot once it is told, when a step lies
  under it.
- **"until Day N"** (round-4 QA): `absentNote` for someone hurt.

## Wave 6

The fifth code review's bugs 1, 2 and 6 and its State risks, and the
round-5 playtest's R1, R3, R6, R7 and R9. Tests:
`tests/wave6-fixes.test.cjs`.

- **A good by name** (review bug 1, the final design): `goodNamed(text)`
  is true when the text names a good (`GOOD_WORDS`: the words of the goods
  table's names, not the measures, numbers and plain words in them, and
  what a drink, food or service is called at a counter: a round, a cold
  one, a room, a tab), or a thing on sale where the player stands (a scene
  item with a price). `goodSource()` is the same as a regex source, for
  Pipeline's buying frames.
- **The payee rule** (review bug 1): a diff that gains a thing buys it only
  when the thing is a good (a title or a receipt handed back is no
  purchase), in Do mode too; `opts.paying` (a Say line's paying words)
  always makes the money a payment.
- **A seizure in its own onMiss** (review bug 2): while an obligation's
  `onMiss` runs (`missing`), `obligationPaid` credits `paid` but never
  meets it (no `onMet`, no late "paid off" memory). `tickObligations(day,
  { detail: true })` settles each in an apply of its own and returns
  `[{ id, gold, items }]`, what its onMiss took; without `detail` it
  returns every id it marked missed, whatever happened after.
- **A reward waits for its news** (review bug 6, playtest R6, the /cheat
  risks): `apply(diff, { holdReward })` (World: a town event's id, or
  `'ending'`) makes a thread those effects resolve hold its reward (the
  story point, the step of progression, so its Resolved line and gain):
  `thread.rewardHeld`. `newsSeen` releases it (`releaseRewards`) once no
  unseen public news of that event is left (an ending: no unseen ending),
  and the reward is earned in that turn, after what told it. Saved with the
  thread: `/undo`, a reload and a failed ending narration hold it the same
  way. `reward(t)` is what the first resolution earns.
- **What they did to the player** (playtest R3): `MEMORY_ACTS` gains
  `'own'`; `addMemory` takes `act` (one of them), and an engine
  `newMemories` entry its own `act`. World skips `'own'` memories for
  grudges.
- **The feed's order** (playtest R7, for the UI): a log entry keeps `from:
  { day, phase }`, the time its input was given, when the narration is told
  in another (a `/wait`, a `/skip`); its `notes` may be strings (after the
  narration, as before) or `{ text, day?, phase?, at?: 'before' | 'after' }`
  (`logNote`). What the UI needs to rebuild in the live order: record each
  quiet line's time and whether the turn's narration had been shown yet;
  in `rebuildFeed`, draw the divider for `from` (or the entry's time)
  before the input when it is not the last one drawn, the entry's own
  divider after the input when `from` is set, the `at: 'before'` notes
  before the narration, and a divider before a note whose time is not the
  last one drawn.
- **Due events in day order** (playtest R2): `dueAdd` takes `day` (a seed
  `/cheat time` passed, dated its own day: `firedDay`) and puts an older one
  before the newer ones.
- **The roll line** (playtest R9): one minus sign, "Might 1 − 2 = −1"
  (`Dice.formatLine`).

## Integration (wave 6)

- `logNote` also keeps `at: 'start'`: a line printed in a turn before its
  roll (and its narration), so a reroll's "Cheat: crit" comes before the
  roll line after a rebuild, and damage or a natural 20 (`'before'`)
  after it (ui.md, "Integration (wave 6)").

## Wave 7

The wave-6 integration's "What remains": a thread a town event the player
did not see settles already held its Resolved line, story point and gain
for the news (`rewardHeld`), but the Journal showed its new status and
summary at once. Tests: `tests/wave7-fixes.test.cjs`.

- **What the player is shown waits for the news too.** Under `apply(diff,
  { holdReward })` (World: a town event's id, or `'ending'`), a change to a
  thread the player knows, or one the change makes known, leaves the
  thread's `status`, `summary` and `knownToPlayer` as the player had them;
  the new values wait in `thread.pending`, a list in the order they
  happened of `{ news: <the event's id, or 'ending'>, status?, summary?,
  knownToPlayer? }` (`threadUpdate`, `threadStatus`, the `threadUpdates`
  key, and a loose end's thread an obligation settles: `setThreadStatus`,
  `setThreadKnown`, `setThreadSummary`). One entry per news: when a
  `/cheat time` passes the council and reaches the ending, the police
  vote's status and summary show with the council's "Meanwhile in town"
  line, and the ending's summary (and the bridge vote, which the ending
  makes known) with the ending's narration.
- **Released together.** `releaseRewards` (from `newsSeen`, so the
  overnight news, a "Meanwhile in town" line, a due event narrated in
  front of the player, the ending's narration, and an event with no public
  news at once) first shows every entry whose news is told (`showHeld`:
  known, then status, then summary; an older entry still waiting loses a
  field a newer one has just shown), then earns a held reward once its
  news is told and no status or knownness of that thread is still held. So
  the Journal's row, the recap's Open line, the narrator's OPEN and the
  Resolved line change in the same step and cannot diverge. A thread the
  player attends (the meeting walked into, or its scene narrated after a
  `/cheat time` there) is held only until that narration, in the same
  turn.
- **Who reads what.** Everything the player or the narrator sees reads the
  shown fields, unchanged: the Journal, `/recap`, OPEN, LOOSE ENDS, the
  bookkeeper's THREADS line, the People card, the mock chronicle.
  `State.threadNow(t, field)` is the field as it is (the newest held
  value, else the shown one), for what the engine decides by: a resolved
  thread never moves (`threadStatus`, `threadUpdate`), a loose end's thread
  still open (`looseEndThreads`; World's `threadOpen` condition and the
  drift's `tied`).
- **Changes that are not held.** Measured against what the player is shown:
  a bookkeeper that reads "open" and says "open" moves nothing held. A
  status or knownness that differs (an effect, the bookkeeper, a rumour
  heard) is newer and drops what was held of that field. A summary not
  held is shown now and a held one still takes its place with its news
  (the council's result, not a line the bookkeeper wrote that evening
  without knowing it). A thread the player has not been told of, which the
  change does not make known, is not held (its reward still is, as in
  wave 6).
- **Saved with the thread**: `/undo` and a reload hold it the same way;
  `State.load` drops a held value of the wrong shape (a status that is not
  open, resolved or failed, a summary that is not text, a list that is not
  one). A game saved under wave 6 with a thread already showing what an
  unseen event did keeps showing it (its old summary is gone; nothing to
  migrate).
- **Not changed**: the narrator's TOWN NEWS line is the town's last five
  public items, heard or not (as before), so someone in a scene may still
  talk about the meeting the evening it happened; the thread itself waits
  for the morning's news.
- Changed by design: `tests/wave6-fixes.test.cjs` (bug 6 / R6: the
  evening's shown status is `open`, `threadNow` is `resolved`) and
  `tests/content.test.cjs` (the ending's thread statuses read once the
  ending is told).

## Wave 16 (31 Oct 2026): undo that reaches back

The owner, mid-hand on a phone: "Let me undo multiple times. I was in the
middle of a poker game and I can't undo to the start of the game." The
stack lived in memory only (a phone that reloads a backgrounded tab lost
it), `/undo` took one step a call, and a hand open refused it. Tests:
`tests/wave16-undo.test.cjs` (the table's side: `docs/notes/engine-world.md`
and `docs/notes/ui.md`, Wave 16).

- **The stack.** `undo` entries are `{ json, town, turn }` (`turn`: the
  game's `meta.turn` then; `town` shares the string of the entry below when
  the same, as before). At most `UNDO_MAX` (20) and about `UNDO_BYTES`
  (8 MB of text, each distinct town string counted once; `undoBytes()`):
  the oldest go first, the newest always stays (`capStack`).
- **Several steps.** `undoSteps(n, onStep?)` takes back up to n steps,
  each one's game pushed on the redo stack first, and restores only the
  last (the ones between are passed as strings); `onStep(json)` hears each
  game passed through (Commands keeps a cheat armed in any of them armed,
  as n single `/undo` would). Returns how many. `restore()` (bare: `/reroll`)
  and `restore(snap)` are as before.
- **Redo** (memory only, never kept): `redoSteps(n, onStep?)` brings back
  the newest of what an undo took, each current game pushed on the undo
  stack first; `redoDepth()`. `snapshot()` (a new step) puts the redo
  stack aside in `redoKept`; `restore(snap)` of that same newest step (a
  rollback: a turn that failed, was refused, or was taken back with its
  hand open) gives it back; a bare `restore()` empties it; a load, a new
  game or a clear empties it. So it is emptied by a turn (or a `/cheat
  time`, `/cheat cash`, edit, update or `/rewind`) that goes through.
- **Kept in storage.** `onUndo(fn)` listeners hear `'switch'` before
  another game replaces this one (load, newGame, clear: the stack is still
  this game's) and `'push'`, `'pop'`, `'undo'`, `'redo'`, `'join'`,
  `'resume'` after a change. `undoRecord()` is what Storage writes: `{ v: 1,
  game: "<createdAt>|<seed>", turn, entries: [{ turn, json, t }], towns }`
  (`t` indexes `towns`, -1 for none; consecutive equal towns share one), or
  null with no game or a game not yet begun. `load` remembers the game as
  loaded (`loaded: { json, turn }`) and counts the stack's generation
  (`undoGen`); `resumeUndo(rec, gen)` merges a kept record under what was
  done since the load, if no other game came since: only entries with
  `turn` ≤ the turn loaded (a step kept after the autosave was written was
  never in it), in order, minus any at the top that are the game as loaded
  (nothing to take back), capped as above.
- **Storage** (`Storage.undo*`): IndexedDB database `novatria`, store
  `undo`, one record keyed by the game, written with the tab
  (`Storage.tabId`) and the time, `store.clear()` first so only one game's
  is ever kept. A change is written 250 ms later (`UNDO_WRITE_MS`), and at
  once on `'switch'` and when the page is hidden (`visibilitychange`,
  `pagehide`); every read and write runs in order on one chain, and a
  write waits while a read-back is under way. Never written in a read-only
  tab (another tab owns the game), with no game or a game not begun.
  `undoResume()` (App: Continue and Play here instead, after any claim)
  reads the record for the game loaded; `undoReset()` (a new game at
  Begin, a slot, an import, the previous autosave) writes the empty stack
  over it. Without IndexedDB, or when it fails (some private windows, a
  blocked `indexedDB`, a quota), every call quietly resolves to null and
  the stack is the page's only, as before. `undoKept()` and `undoIdle()`
  are for tests and the console. Left as a limit: a page killed within a
  quarter second of a step can leave the kept record one step behind; only
  its entries up to the turn the autosave holds are used.
- **`/rewind` (State op `rewind: { turn }`, engine only).** For turns no
  snapshot reaches (a game played on an older build, whose turns have no
  steps anywhere). Strikes every log entry after that turn (one entry at
  least is left), and every memory, journal note, progression entry and
  `seen` mark with a later `turn`; `metTurn` after it is deleted (the
  narrator describes them again); a person whose `created.turn` or a place
  whose `revealed.turn` is later goes, unless something else refers to it
  (the state's JSON without its own record, the schedules, the seen marks
  and exits, checked until nothing changes: someone's home, an
  obligation, a seed, the player standing there), and a cast
  home found later is unfound again (`discovered: false`, no `revealed`)
  unless the player is in it; a fight with a later turn is over. The clock
  goes to the time the first struck entry's input was given (`from`, else
  its own day and phase), shorts 0, with `late`, `noSleep` and `instants`
  dropped; a visit dated after that and an untold `pendingScene` go (all
  before the check above). That time passes again for the world as the
  player plays on, so its clocks roll for those phases again.
  `meta.turn` is not set back: the next turn is logged after the struck
  numbers, so what else carries a later turn (an obligation, a due event,
  a rumour's `addedTurn`, a defeat) stays consistent and an undo step kept
  from before the rewind still passes `resumeUndo` after a reload. Not
  taken back, having no turn: money, HP, things carried, attitudes, the
  player's place, rumours heard, clocks, loose ends, threads (a thread
  settled then stays settled and its gain stays; its progression entry
  goes). `result.rewound`: `{ struck, turn, day, phase, settled, people,
  places }`. Commands takes one snapshot before it (one `/undo` step).

## Wave 21 (31 Oct 2026): night holds a long; the clock may go back

- `advanceTime`: a `long` at night that is not yet late, with a cause that is
  an action (not rest, wait, skip, arrival, defeat, arrest, epilogue), sets
  `shorts` to 2 and `time.late = true` and passes no phase (`held`), like the
  third short. A long at a night already late goes to the next morning with
  `noSleep`, as before. `/wait` and `/skip` (cause wait/skip) and a defeat's
  long still pass the night at once.
- `Pipeline.setClock` (`/cheat time`): a day and phase earlier than now is
  allowed. It is the same `setTime` (shorts 0, no late) under a snapshot, with
  the divider and the quiet line "Clock set back to Day N · Phase. What has
  already happened stays in the story."; `World.catchUp` does not run, so
  nothing fires, and nothing told is untold.

## Wave 22 (1 Nov 2026): meetings are kept

The owner, at Pittman's in the morning: Jodie Strayhorn said "Low Water, back
door, half past ten", the player went and knocked twice, and Jodie was not
there (the engine had her on her own schedule). Tests:
`tests/wave22-appointments.test.cjs` (World's side: `docs/notes/engine-world.md`,
the bookkeeper's: `docs/notes/prompts.md`, Wave 22).

- **`newSeeds` plants appointments.** A seed planted through `newSeeds`
  carries `turn` (the turn it was planted on). `appointmentOf(seed)` (exported)
  reads its effect: someone in the cast named first in it (their full name,
  or a first name nobody else in `npcs` has, never the player's own first
  name; alive and `free`) and a place (its location trigger, or, for a day
  trigger, the place in town its words name first: its name, or another name
  of its own with a capital or a possessive that no other place has). Either
  missing, or a trigger of another type: a plain seed, as before (a location
  seed still waits a day). Otherwise `seed.appointment = { npcId, locationId,
  day, phase, phases, spot?, hour? }`:
  - **phase** from the time words (the earliest named; past or habitual ones,
    "last night", "yesterday morning", "every evening", are left out): morning
    ("morning", "dawn", "breakfast", "first thing", "before opening"),
    afternoon ("afternoon", "noon", "midday", "lunch"), evening ("evening",
    "supper", "dinner", "sundown"), night ("tonight", "night", "last call",
    "closing", "midnight"); an hour ("half past ten", "quarter to six",
    "10:30", "21:00", "ten thirty", "six o'clock", "6 pm", "at six", "before
    eleven") by 5-11 morning, 12-16 afternoon, 17-20 evening, 21-4 night. An
    hour without a.m. or p.m. is read with the time of day named ("this
    evening at seven" is 19, "tonight at ten" 22, "tonight at one" the small
    hours) and, with none named, 1 to 4 is the afternoon ("at two"); when the
    time of day and the hour fall in different phases ("tonight at eight")
    both are covered. null when nothing is named.
  - **day** from a day trigger, else "the day after tomorrow", "tomorrow",
    "tonight" / "today" / "this morning" (today), a weekday (the next one,
    today if it is today), else today. A day before today is no meeting.
  - **phases**: the phase(s) named, else the rest of today from now, or the
    whole of a later day. Today's phases already past are dropped; with none
    left, a time named without a day is tomorrow's ("at half past ten" said
    in the evening) and one with a day ("this morning" said in the evening)
    is no meeting (a plain seed).
  - **spot** ("the Low Water's back door", "the back door of the Low Water",
    "the Low Water (back door)": up to three words) and **hour** (the words of
    the hour as said) are kept for the words below.
  A new appointment replaces the same person's that day still to come (its
  visits from now on go). Its `notBeforeDay` is its day when that is later
  than today, else none (so a location trigger may come today).
- **Visits.** The visits op is `addVisit` now, shared: `{ npcId, locationId,
  day?, phase?, seedId? }` (`seedId`: the appointment that placed it; kept on
  the visit). `keepAppointment` places today's phases from now on as the seed
  is planted (one the op refuses is left out). Someone present with the player
  whose meeting is elsewhere stays in the scene while a later phase holds the
  meeting; when this phase is its only one, they go now and `pendingScene`
  gets them as `left` (cause `appointment`), so the next narration shows them
  leaving. `advanceTime` keeps a visit for a phase still to come (it kept only
  the phase reached before; every visit made before this wave was for now or
  the next phase, so nothing else changes).
- **`seedsDropped: [seedId]`** (engine key): a seed that will never fire (an
  appointment missed, or one its person can no longer keep) goes, with the
  visits it placed from now on (`dropSeed`).
- **Read helpers.** `appointmentWords(seed)`: for an appointment still to come
  (not fired, its person free, a phase of it not past) `{ seedId, npcId, name,
  locationId, place ("the Low Water"), spot, hour, detail ("back door, half
  past ten"), when ("this morning", "tonight", "tomorrow evening", "Friday
  evening (Day 9)", "today") }`, else null. `appointments(npcId?)`: those
  words for every such seed (or one person's).
- **`/rewind`.** A seed with a `turn` later than the turn kept that has not
  fired goes, with its visits (`result.rewound.seeds` counts them). A fired
  one stays, as a due event does. A seed planted before this wave has no
  `turn` and is never struck.
- **`mergePlaces` / `mergePeople`** move an appointment's place and person.
- `/undo` needs nothing new: the seed, its visits and the scene change are
  state.

## Wave 26 (1 Nov 2026): what people ask of the player

The owner wanted to track "what people asked me to do, by when". Tests:
`tests/wave26-objectives.test.cjs` (the tab: `docs/notes/ui.md`, the
bookkeeper's rule: `docs/notes/prompts.md`, Wave 26).

- **`newSeeds` marks asks.** After `appointmentOf`, a seed from the model
  (`source: 'model'`) that is no appointment goes through `askOf(seed)`
  (exported): the person its words name first (`apptPerson`, wave 22: a full
  name, or a first name nobody else in `npcs` has, never the player's own;
  alive and not dead or gone) makes it an ask, `seed.ask = { npcId, dueDay?,
  reward? }`. `dueDay` is a day trigger's day; `reward` is `askReward(text)`
  (exported): the words after the first semicolon or dash ("$500 cash, and
  deny knowing him if caught"), else a sum offered ("for $300 cash", "offers
  $40"), else a threat to the end ("or else he tells the chief"), else a bare
  sum; none: no `reward`. The applied line adds "; an ask: npc_carter by day
  6". An engine seed is never an ask. Nothing changes in how a seed fires,
  waits (`notBeforeDay`) or is struck (`/rewind`, wave 22).
- **Read helpers.** `askWords(seed)`: for an ask (or any seed planted with
  `hidden: false`, a plan the player was shown; none of the bookkeeper's are)
  that has not fired and is no appointment: `{ seedId, npcId, name, effect,
  said (the effect with "the player" and the player's name as "you" and
  "your"), what (said after the asker's name), reward (in the same words),
  dueDay, by ("by Day 6 (Tuesday)", "when you next see Travis Cagle", "at the
  Low Water"; null for a clock trigger), dueIn ("in 5 days", "tomorrow",
  "today", "overdue"; a day trigger's), seeNpcId, locationId, place, turn,
  gone (the person is dead or gone) }`, else null. `asks(npcId?)`: those
  words for every such seed (or one person's). `youWords(text)`: the same
  "you" swap.
- **`mergePeople`** moves an ask's person with the rest.
- `/undo` and `/rewind` need nothing new: the ask is on its seed.
- Left open: `LIMITS.modelSeedsPerTurn` is still 1, shared by asks, meetings
  and other plans; seeds planted before this wave are not made asks.

## Wave 26 (1 Nov 2026): the tracks under the number

The owner: "plan a complicated relationship system that isn't 2 dimensional,
what we have now is very basic." Wave A1 of `docs/RELATIONSHIPS_PLAN.md`
(scope: `docs/relationships/integration.md` section 16), a refactor: every
number the game shows or stores is what it was, and no existing test
changed. Tests: `tests/wave26-rel-tracks.test.cjs`.

- **`Rel`** (a new module between State and Town, on `window.Game`) is pure:
  frozen tables and functions that read a person, the state and the town
  and return values or a new rel record; it never writes. Tables: `EVENTS`
  (the design's 41 rows plus `card_win`, `card_loss`, `unwanted_advance`:
  each `{ src, w, t, f, k, s, weight, decay, dedupe, rep, proud?, money?,
  owed? }`), `WIRE_EVENTS`, `ALIASES`, `DEDUPE`, `TRAIT_AXES` (Appendix A),
  `FLAVOUR_TRAITS`, `AXIS_EFFECTS`, `MERCENARY`, `DECAY` (`mood` 2 days,
  `slight` 5 (floor 0.2 harm, 0 kind), `wound` 10 (0.4), `scar` 21 (0.6),
  `keeps`), `LIGHTER`, `FEAR_CLOCK` (4 days, floor 0), `CAPS`, `SETTLE`,
  `BANDS`, `STANCE_GRID`, `PHRASES`, `SIDES`, `OVERRIDES`, `TAGS`,
  `SPARK_STATUS`, `CUES`, `CONTEMPT_EVENTS`, `WITNESS`, `SECONDHAND_TEXT`,
  `LEVERAGE_WEIGHT`, `GATES` (every threshold of the plan, by wave; nothing
  reads them yet), `UNWANTED_ADVANCE`, `WORDS`.
- **The record.** `n.rel = { v: 1, start, everyday: { w, t, k, s }, fix: {
  w, t, f, k, s }, today, days, recent, asks, owed, w, t, f, k, s, net,
  levFear, bands }`. `Rel.startOf(n, townNpc)`: liking the town's written
  attitude (0 for someone nobody wrote, as the old drift's baseline), trust
  5 x guardedness, -10 for the police (tag or role) and smugglers, or the
  record's `start.trust`; fear `start.fear` or 0; knows and spark 0.
  `Rel.fill` gives a person with no rel their start and liking exactly
  their attitude (the difference in everyday, past its bound in fix).
  `Rel.repair` makes a hand-edited one whole. `Town.instantiate` gives
  every cast member theirs; `addNpc` and `peopleRevealed` theirs.
- **`Rel.recompute(n, day)`** is the cache: each track is start + everyday +
  fix + what each typed memory still carries (`Rel.remainder`: `d` x what
  settling left x the fade: `floor + (1 - floor) x 0.5^(age / half-life)`,
  harm half-lives x 2^(-r/2); fear on the one clock; spark on the slight
  clock; knows-you never fades; a witness or secondhand copy one class
  lighter with floor 0; a protected line while its loose end is open does
  not fade). Liking and trust -100..100, fear 0..100 with its leverage share
  (`levFear`, 10 x weight a record the player holds), a hard person's held
  to `CAPS.hardFear` (39); spark 0 unless `Rel.eligible`. Bands enter at
  their edge and leave 5 back toward the middle (the previous ones are read
  from the cache). Ages are whole days; a memory with no day takes
  `Rel.memoryDay` (World's, moved), else a week ago.
- **`relWrite(n)`** (State) runs in every op that touches a person's
  feelings or memories, before and after: the record made whole, a direct
  write to `n.attitude` since the last recompute folded into fix
  (`Rel.landTo`, so it holds exactly), the cache recomputed, the alias
  written (`n.attitude = rel.w`). `relWriteAll` after `setTime`, `/rewind`
  and at load. `Rel.landTo(n, targets, buckets)` lands each track exactly
  (integers, `Math.round` so a whole-number shift lands exactly); `relPin`
  holds the tracks across a memory change.
- **`attitudeDelta`, `attitudeChanges`, `meetingRep`** keep today's numbers
  and lines (`likingBy`): before + delta, clamped to -100..100, into
  everyday; past `CAPS.everyday` (15) the rest goes into fix, so the number
  reads exactly before + delta. The bookkeeper's 25 a turn is as before.
- **`socialEvent`** (effect op 29; and the engine key `socialEvents`, a list
  of the same; the model cannot send either): `{ npcId, event, text,
  weight?, act?, aboutId?, private?, leverageId?, d?, decay?, secondhand?,
  scale? }`. `Rel.applyEvent` plans it: the row (or `d`, whole numbers
  within +/-50), `scale`, the traits (pride on the proud rows' liking x (1 +
  0.25p); guardedness on trust gains x (1 + 0.2g) and losses x (1 - 0.15g);
  nerve on fear gains x (1 - 0.25n); mercenary money x2, blackmail x0.5),
  the repeats (kind things the same day 1, 1/2, 1/4, 0, `CAPS.sameDay` 1
  then 0 for gifts and time together; `spent_time` and `gift` in full the
  first 3 days per person, then reduced; harm within 3 days compounds x1.5
  then x2.25 and merges into one memory, its weight +1 up to 3, the old
  part folded in as it stood), the bounds (a turn's w 40, t 45, f 40, s 20;
  a hard person's fear 39; knows-you at least 2; spark 0 for anyone it
  cannot move for, logged), then the memory (`{ turn, day, text, weight,
  event, d, decay, key, n, place?, act?, about?, leverageId?, private?,
  secondhand? }`) or everyday (held to 15, nothing past it), what it settles
  (`SETTLE`: by its words, else the newest harm within 3 days), owed
  favours and the counters. A typed memory pushed out past 12 leaves its
  part in everyday. The dead: a no-op. The ledger keeps each person's
  totals this turn (`ledger.rel`) and the dedupe classes (`ledger.classes`,
  for wave 27).
- **Legacy memories.** `remember` (newMemories, addMemory) types each line
  (`Rel.typeMemory`: by its words, then its act) with `d: null`: it moves no
  track. `memoriesSettled` deletes such a line as before; a typed memory is
  softened instead (`Rel.settle`, `'settled'`: half the liking, a quarter of
  the trust), never deleted, at most two and getting even. `checkMemories`
  keeps the typed fields when they are well formed.
- **`relSet`** (engine key, `{ npcId, w?, t?, f?, k?, s? }` or a list):
  each track lands exactly in fix. `World.forceAttitude` is `relSet { w }`.
- **`relDay`** (engine key, a day number; World's `driftAttitudes` sends it
  each morning): for everyone, the fold, then the old drift exactly
  (`Rel.driftStep`: two a day toward the save's town copy, else 0; not for
  the dead, someone tied by an open loose end, or someone with a weight-3
  memory from the last `CAPS.quietDays` (5) days), landed in everyday,
  then every track recomputed. `result.drifted`; World keeps its note
  "attitudes drift for N people". `World.DRIFT_PER_DAY` and
  `DRIFT_QUIET_DAYS` read Rel's numbers; `World.memoryKind` is
  `Rel.kindOf` (the same reading for every legacy line).
- **`editPerson`** takes `rel: { w?, t?, f?, k?, s? }` (`EDIT_KEYS`,
  `EDIT_FIELDS` 'rel'); attitude and the tracks given land in fix; memories
  edited with no track given leave every track where it was. The line
  keeps its old words ("attitude 5 -> 10"), plus "trust -5 -> 12" for the
  others.
- **`setMemories` and `mergePeople`** pin the tracks; a fresh cast member's
  liking taken from the made-up record lands in fix.
- **`/rewind`** strikes, with the turns after the one kept: a kept memory's
  settlements, `rel.owed`, `rel.asks`, `rel.recent`, `rel.today` when it began
  on a struck turn, leverage records and their logs, secrets shown; the
  everyday and fix buckets and the across-days counts stay. Then everyone's
  tracks are recomputed.
- **The minor rule's anchors.** `Rel.isMinor(n)`: the lowest of the record's
  age, the save's town copy and the live `TOWN_DATA` record by id for the
  built-in town, under 18; or tagged teen or teenager; or no age anywhere
  and a role, tag or look that reads as a teen (fails closed).
  `Rel.playerMinor()`: the player under 18 or of no age. `Rel.eligible`
  adds the town's romance list (`Rel.romanceOf`), which does not exist yet,
  so spark is 0 for everyone. Spark above 0 is refused (rejected) at
  `socialEvent` (`d.s`), `relSet` and `editPerson`; a row's spark is held at
  0 and logged; the load fill, `setMemories`, an edit's memories and
  `mergePeople` set any spark found to 0 (`relGuard`, `Rel.sparkGuard`),
  logged as rejected changes (source 'rel').
- **Load** (no version bump): `state.leverage` and `state.known.secrets`
  made where missing; anyone without rel gets one (liking exactly their
  attitude; their memories stay untyped until rules version 9); the spark
  guard; everyone recomputed, before the game is remembered as loaded.
  `typeProblem` checks rel (`relProblem`), memories' `d` and `settled`,
  `leverage` and `known`; `coerceNumbers` reads their numbers written as
  text.
- **`newGame`** makes `leverage: []` and `known: { secrets: {} }`.
- **Read helpers.** `Rel.tracksOf(n)` (`{ w, t, f, k, s, owed }`, liking the
  alias), `Rel.stance(n)` (`{ phrase, grid, tags, side, cell, override,
  contempt, why }`: twelve phrases, "hates you" only with an unsettled
  weight-3 harm, "doesn't know you" with no memories and knows under 10,
  "loyal to you" only with trust above 0; the fear override only in [-60,
  25); tags in order: leverage, spark, fear, debts, uneasy), `Rel.cue(n)`
  (whole clauses, 12 words at most), `Rel.reasons(n, 2)`,
  `Rel.sparkStatus(n)` (null for anyone it cannot move for, before reading a
  number), `Rel.words(track, v)`, `Rel.axesOf(n)` (with `hard`: nerve 1 or
  more, tough, or a faction head by role), `Rel.debugLine(n)`,
  `Rel.debugMemory(m)`. Debug's person line ends `· w N t N f N k N s N ·
  <stance>[ · <tag>]`.
- **Wave 27's dice.** `Rel.rng(kind, npcId, day, n)`: `Rng.create` keyed by
  FNV-1a of the seed, kind, person, day and n, no shared draw.
  `Dice.burn()`: a forced die (`Pipeline.hooks.nextD20` or `nextTier`) is
  taken, else one d20 drawn and dropped. Nothing calls either yet.
- **Left for later waves**: witness rows, dedupe by class and legacy lines
  yielding to engine events (27); the bookkeeper's `socialEvents` and its
  preconditions, and the minor's line before narration (28); the romance
  list, leverage records and owed asks (29); the card, the narrator's line,
  the feed and rules version 9 (30).

## Wave 27 (1 Nov 2026): what the engine sees, people remember for what it was

Wave A2 of `docs/RELATIONSHIPS_PLAN.md` (scope: `docs/relationships/
integration.md` section 16). Numbers now change: fights, threats, thefts,
gifts, obligations and appointments are the engine's typed events, and the
morning drifts only the everyday bucket. Tests:
`tests/wave27-rel-engine.test.cjs`, `tests/relationships-examples.test.cjs`
(World's side: `docs/notes/engine-world.md`, Wave 27; content:
`docs/notes/content.md`, Wave 27).

- **`socialEvent`** (the op and the engine's `socialEvents`) takes, besides
  wave 26's fields, `fight` (a fight's key: one memory a fight,
  `Rel.applyEvent`), `witnesses` (`'present'`, `'none'` or ids: each who is
  here, alive and not laid up takes `Rel.witnessEvent`'s copy, merged per
  scene `loc:day:phase`; never for a private word), `public` (it made news;
  else two or more watching make it public), `rep` (what it costs the town
  when public, in place of the row's), and `secondhand` as `true` or `{ via,
  hidden }`. A public event moves the town's reputation by its row
  (`townRep`, held to 5 a turn by `ledger.rep`). Every engine event records
  its dedupe class (`ledger.classes`) and the sign of its liking
  (`ledger.engine`); within one apply the first money-class event for a
  person wins (engine against engine), the rest are no-ops with a debug
  line.
- **Dedupe by class** (`dedupeWhy`): an event marked as the bookkeeper's
  (`fromModel`, or `bookkeeper: true` until wave 28 sends them) is dropped
  when the engine recorded its class for that person this turn, or a class
  that drops it (`Rel.DEDUPE`: violence drops humiliated and threatened;
  money kept_word and did_favour; romance complimented and flirted; words an
  insult). The bookkeeper's events record no class.
- **The legacy yield**: in a model diff, `attitudeChanges` of the same sign
  as an engine event for that person this turn (`ledger.engine`, or one this
  diff will give: `opts.engineEvents`) are dropped, and so are their
  `newMemories`, each with a debug line ("the engine counted the fight for
  npc_x").
- **`opts.engineEvents`** (Pipeline: the gift or the bribe): processed after
  the money, the payees and `obligationsSettled`, before `socialEvents`. One
  marked `handed` counts only when money or a thing moved this diff
  (`handed`, `lostNames`) and none of it went to an obligation of theirs
  (`settledFor`); its words say what moved ("gave me $5").
- **`newMemories`** from the engine may name their `event` (a noted line:
  the captured defeat, the card seats, a fact, the failed-badly line);
  `remember` takes `opts.event`.
- **Eviction** past 12 (`Rel.evictIndex`, in `remember` and
  `Rel.applyEvent`): witness and secondhand copies first, then by how long
  a memory lasts (a typed one by its class; a line that moves nothing by
  its weight: 1 slight, 2 a wound, 3 a scar), kind before harm, oldest
  first; never a loose end's line, a fact or the newest three noted.
- **Fights in `Rel.applyEvent`**: with `fight`, a beat-down removes the
  fight's memories first; a heavier blow than the memory holds replaces it;
  the same blow again raises it x1.4 (`raiseFight`, within the turn's
  bounds and a hard person's 39); the person's standing is recomputed
  without what was replaced (a hard man's fear room). A memory carries
  `fight` (kept by `checkMemories`). `state.fight` keeps `key` and `rep`.
- **`relDay`**: `Rel.driftStep(n, day, s)` gives the everyday bucket's
  steps (liking and trust two toward 0) for someone the player did not see
  on the day just ended (`state.seen[id].day`) and no open loose end ties;
  everything else fades by its own age in `relWrite`. `fix` and knows-you
  never drift; the weight-3 hold is gone.
- **New engine keys** (never effect ops; `EFFECT_OPS` stays 29):
  - `relTurn { aimed, quiet }` (Pipeline, after the bookkeeper or on its
    own): knows +1 a turn aimed at someone (at most 3 a day, `rel.today.
    kAimed`, into everyday), and `spent_time` once a day unless the turn
    already moved them (`quiet`) or the player hurt them today.
  - `relAsk { npcId, act, ok, about }` or a list: the ask log, `rel.asks`
    (8, turn-stamped) for a lie, a theft, a search, an attack or a sneak.
  - `relSettle { npcId, key | mark, by: 'got_even' }`: a grudge come due
    softens its memory (`Rel.settle`, 0.4 of its liking); a line that moves
    nothing, or none found, gives today's +10 into everyday.
  - `relStart { npcId, w?, t?, k?, owed?, why? }` or a list: where someone
    stood before the player came (`rel.start`; knows "at least"; `owed` a
    turn-stamped entry). Town's loose ends (`LOOSE_END_ATTITUDE` with
    `LOOSE_END_TRUST = { debt: -10, enemy: -50, secret: -5, lost: 10,
    promise: 5 }` and knows 30, the liking as before: Boyd -10 to -50) and
    `/fact` write it.
- **`npcFates` hurt** from the bookkeeper on someone the player did not
  attack marks them in danger at home for this phase and the next
  (`flags['danger.<npcId>']`).
- **`reputationTier('town')`**: despised, then **feared** (3 or more in
  town at fear 20, `feared()`), then respected, known, disliked, noticed,
  unknown.
- **`priceFactor()`** includes `sellerMarkup()`: x1.25 while a seller here
  is against the player and marked (`flags['relPrice.<npcId>']`, Pipeline's
  `refuseSale`).
- **Seeds**: `SEED_ORIGINS` gains `report`; `normaliseSeed` keeps an engine
  seed's `origin.key`, `why`, `protectors`, `hidden` and its `turn` (so
  `/rewind` strikes a report or a tough answer with its turn).
- `lateEffects` makes a late socialEvent's words late too ("in full, but
  late").
- `/rewind` needs nothing new: every new writer stamps its turn (settled
  entries, owed entries, asks, recent, the new seeds).
- **Rel** gains `evictIndex`, `witnessEvent`, `grudgeFit`, `policeHead`,
  `protectorOf`, `isPoliceNpc`, `reportWhy`, `rollMod`, `complies`,
  `rescues`, `wontSell`, `factOf`, `FIGHT_RANK`, `FIGHT_RAISE`, and exports
  `harmful` and `settlements`; `SECONDHAND_TEXT` names the player
  (`{player}`); `GATES.social.actions`, `GATES.compliance.actions` and
  `difficulties`, `GATES.report.days`, `GATES.wontSell` (`essentialDays`,
  `liking`, `roles`).
- **Dice** reads `Rel.rollMod` (a lie keeps the old rule until wave 28).
- Left for later waves: the bookkeeper's own events on the wire, the trust
  gates and floors (28); leverage, spark and owed asks (29); the card, the
  narrator's line, the feed's words and rules version 9 (30).

## Wave 28 (1 Nov 2026): the bookkeeper's events, and nobody under 18

Wave A3 of `docs/RELATIONSHIPS_PLAN.md`. Tests:
`tests/wave28-social-events.test.cjs`, `tests/relationships.test.cjs`.

- **`socialEvents` is a model key** (`RECORD_KEYS`; out of `ENGINE_KEYS`).
  The three legacy keys stay readable. A model diff's events go to
  `modelSocial(items, opts, result, run, no)` as a whole, since the caps
  need every candidate: presence (here and not laid up); the minor rule (an
  event naming romance for someone under 18, or any event for a minor the
  turn's flag or phrase pointed at, is a no-op "set aside for the minor
  rule" and lands in `result.minors`); `Rel.wireEvent`'s preconditions (a
  refusal is rejected by name; a downgrade, such as `kept_word` without a
  day-old confidence and an asker present to `confided`, applies as the
  lighter event; `{ knows }` bumps the everyday bucket's knows-you only;
  `learned_secret` waits for wave 29 as a no-op with a debug line);
  `insulted` with two or more others here and not private is `humiliated`
  (witnessed by them); the diminish and gift scaling (`opts.diminish`,
  `opts.giftTo`); then the caps: two events a person and four a turn
  (`ledger.model`), the heaviest kept (by weight, then |w| + |t|, then the
  order sent), the rest no-ops with the reason. A model event of the same
  dedupe class as one of the turn's engine events (`ledger.events`,
  `opts.engineEvents`) gives way.
- **Settlement by words.** An `apologised` that lands (a persuade or talk
  aimed at them that worked, or liking above -25; else it only teaches
  knows-you 2) settles the harm its memory names (the words after the colon
  against the harm's text, `Rel`'s settleTarget), else the newest
  unsettled harm of the last three days; a confession (`came_clean`) marks
  the logged lie (`rel.asks[i].confessed`, `confessedTurn`).
- **The ledger** gains `events` (every event this turn applied: `{ npcId,
  event }`) and `model` (`{ per, total }`, the caps).
- **The couch** (`restQuality`) reads `Rel.GATES.couch`: liking 25 and
  trust 0, or owed 1 and liking above -25.
- **A report seed's origin** keeps `fallback` (the law outside town took
  it).
- **`Rel`** gains the wave-28 section after `factOf`: `ABOUT_EVENTS`,
  `WORDS_EVENTS`, `ROMANCE_EVENTS`, `MINOR_RULE`, `THREAT_PHRASES`,
  `ASKS`, `difficultyFloor`, `lieWord`, `secretOpen`, `meets`,
  `guardiansOf`, `policeFallback`, `reportTo`, `minorAge`, `minorLine`,
  `playerMinorLine`, `romanceTurn`, `wireEvent`, `handles`, `wardWord`,
  `guardianWord`. `rollMod` reads trust for a lie (+2 at trust 40, -1 at
  -25, -2 at -50); `complies` is false for any romantic action; a flirt at
  someone who dislikes the player marks `rel.unwelcomeOnce`. Every gate's
  threshold is in `Rel.GATES` (wave 28's: deceive, floors, secret, couch,
  seats, dealer, rumour, favour, needs).
- **`State.turnEvents()`** returns the turn's applied events (the
  ledger's).

## Wave 29 (1 Nov 2026): what people hold, in State and Rel

Wave A4 of `docs/RELATIONSHIPS_PLAN.md` (the integration plan's 7, 8, 16 A4
and 19.1 to 19.5). Tests: `tests/wave29-rel-hold.test.cjs`, examples 2, 6,
8, 10, 11, 12 and 14 in `tests/relationships-examples.test.cjs`, the
under-18 and coercion parts of `tests/relationships.test.cjs`.

- **`state.leverage`** holds records `{ id: lev_<slug>_<n>, holder, over
  ('player' or an id), about: { kind: secret | seen | loose_end }, text
  (120 at most, the bookkeeper's or the action's words, never the secret
  field), weight 1 to 3, since: { day, turn, via }, aware, playerKnows,
  status (held, used, paid, spent, void: Rel.LEV_STATUSES; LEV_NEXT is
  the only way it moves, paid then only to spent or void), log, demand?
  ({ amount, dueDay, turn, obligationId?, paid?, paidDay? }), uses: [{ turn,
  day, event }], knownBy: [{ npcId, turn }], mattersTo, key? }`. The engine
  alone writes them: `leverageAdd` (an engine key, one record a holder,
  over and key; a record's `text` is what the card and Journal show) and
  the op `leverageSet` (`{ id, status?, aware?, playerKnows?, demand?,
  use?, knownBy? (ids or 'mattersTo'), tell?, hidden? }`; `tell` with a
  spent record over the player gives each new knower `told_anyway`).
- **`state.known.secrets[npcId] = { turn, day, how }`** (`secretShown`, an
  engine key: how is roll, trust, fear or rumour). The narrator having been
  given a secret is the precondition of `learned_secret`, then or on a late
  retry.
- **Events wired to records** (`Rel.wireEvent`'s plan, applied in
  `modelSocial`): `learned_secret` (the narrator had it, and two of the
  person's `leverageKeys` are in the narration) makes the player's record,
  aware unless private, weight `secretWeight`, mattering to `mattersTo`;
  `caught_you_at` makes theirs over the player (Pipeline's, one other
  witness, no news, never violence); `exposed` (telling Y what the player
  holds over them, with a live record) spends it (`exposeTo`): Y's
  weight-3 scar `exposed` (W -30, T -30), a `broke_word` too when Y had
  paid, and `whenTold` when the one told is the police it matters to (a
  weight-3 `noted` for the officer; for a crime an inquiry seed on
  `Rel.rng('inquiry')`, one police clock segment and town news, never an
  arrest); `came_clean` to whom a loose end's secret would be told voids
  the record over the player (`cameClean`) and its blackmail lapses. A
  true rumour with `leverageOver` gives its hearer a private record
  (`rumourLeverage`, "You have something on Mavis Mangum now.").
- **The obligation link inside `settle`.** A blackmail met is the
  record over the player paid in the same step, and its onMet runs
  `paid_silence` (an older save's copied `paid_back` for that person reads
  as `paid_silence`): one payment, one event. Missed, the record is spent
  and told to whom it matters (`told_anyway`, "Glenda Pryor told."). With
  a standoff at the due day (`Rel.standoff`: each holds a live record over
  the other, the player's aware), the blackmail is **lapsed**: no onMiss,
  no onMet, "Glenda Pryor lets it drop."; `OBLIGATION_STATUSES` is open,
  met, missed, lapsed, and lapsed counts as done everywhere a met or
  missed one does (Journal "Dropped", `/recap` "· dropped").
- **goldDelta.** A bookkeeper's positive goldDelta is refused while
  someone present owes the player a demand (their payment seed brings it)
  and on the turn of a backed ask at someone present (`opts.backed`, from
  Pipeline: the engine's LEVERAGE line already said they hand over nothing
  now).
- **Favours owed.** `owedSettle` (`{ npcId, dir? }`, an op) clears what is
  owed one way or both; the feed says "<Name> owes you one." / "owes you
  again." / "is square with you." (`rel.owed` entries keep `{ dir, turn,
  day, key, why }`).
- **The feed queue.** `relFeed` (`feedLine`, `takeFeed`; App's State
  listener prints them as quiet lines before the band lines): a spark
  status reached prints its line unless the same one printed in the last
  7 days (`rel.status = { name, day }`, the last printed); one lost in a
  change (never by the morning's fading) prints "<Name> takes the hint.";
  "afraid of what you know" prints once as it is reached; the leverage
  lines ("knows you know", "has something on you", "has paid for your
  silence", "will keep quiet", "told"). `quietly(fn)` (`relQuiet`) keeps a
  load, an edit, a rewind, `relDay` and a clock set by hand silent;
  `muted` as before. `clear()` empties the queue.
- **`State.demandLine(x, day)`** ("Hollis Byrd: $300 for keeping quiet,
  due Day 4 (1 day)") for `/recap`.
- **Rel's wave-29 section** (after `guardianWord`): `SPARK_STATUS` gains
  each status's spark threshold and "wants you"'s distrust cue; new are
  `SPARK_LOST`, `LEVERAGE_WEIGHT`, `LEV_LIVE`, `LEV_STATUSES`, `LEV_NEXT`,
  `LEV_ABOUT`, `INTIMATE_ASK`, `NIGHT_PLACES`, `NUMBER_WORDS`, `STOPWORDS`,
  `WHEN_TOLD`;
  `authored` (a content field: the record's own, else the save's town
  copy, else the built-in town), `romanceEntry`, `sparkRate`, `welcomeOf`,
  `romanceLiking` (liking from romance-class memories: caring is w -
  wRom), `earnedDistrust`, `statusFor` (with hysteresis: the previous
  status keeps its thresholds 5 back), `intimateGate`, `jealousyOf`,
  `statusLine`; `priceIn`, `contentWords`, `overlap`, `keysOf`, `keysIn`,
  `secretWeightOf`, `mattersToOf`, `whenToldOf`, `canRaise`, `leverageOf`,
  `holdsOver`, `heldOverPlayer`, `policeBarred`, `standoff`, `references`
  (two content words of the record's text, a threat phrase, or for a
  secret one of its keys: "Then Bell hears your tapes."), `backedRecord`,
  `backedRoll`, `leverageAnswer`, `leverageLines`, `demands`, and `kinOf`
  exported. The recompute cache gains `wRom` and the bands `sp` (the spark
  status) and `ov` (the override), and `levFear` (wave 26's field) is now
  filled from the live records; `sparkStatus` reads `bands.sp`.
  `protectorOf(n, ctx, { anyway })`: while the player holds an aware record
  over them the police are barred (unless they are hard), so their report
  goes to their content protector or nobody; a coercion's report goes
  through anyway. `reasons(n, max)` leads with `leverageLines` (`{ text,
  day, event, settled: 0, weight, leverage: id, line }`), the record's own
  memory not told twice. The mercenary flag doubles money given to them on
  liking and halves `blackmailed`'s; any weight-3 harm halves spark at
  write time. `EFFECT_OPS` is 31 (owedSettle, leverageSet); `ENGINE_KEYS`
  gains `leverageAdd` and `secretShown`; `SEED_ORIGINS` gains leverage,
  inquiry, tell and price.

## Wave 30 (1 Nov 2026): what people show, and rules version 9

Wave A5 of `docs/RELATIONSHIPS_PLAN.md` (the integration plan's 10, 13.1,
14 and 16 A5). Tests: `tests/wave30-rel-people.test.cjs`, example 3 in
`tests/relationships-examples.test.cjs`, `tests/upgrade.test.cjs`.

- **`RULES_VERSION` 9.** `MIGRATIONS` gains `{ version: 9, title: 'People
  who remember', rerun: true, run: peopleRemember }`, no call.
- **The turn's feed marks.** `freshLedger` gains `touched` (each person's
  bands as they were at their first write of the turn, taken by `relWrite`
  when not quiet), `harm3` and `settled`; `relTouched()` returns `{ turn,
  touched, harm3: [ids], settled: [ids] }` for App.noteRel. `harm3` is a
  new first-hand weight-3 harm from `socialEvent` (or an old-style memory of
  weight 3 that reads as harm, from `remember`): never the person's own act,
  a witness or secondhand copy, a memory that belongs to a live leverage
  record (`leverageRec(id)` in `Rel.LEV_LIVE`), or the same fight growing
  (the event and key already weight 3 before this write). `settled` is a
  settlement that landed. `relDay` takes its baseline after the fading, so
  a morning prints no band line. `feedLine(text, npcId, rank)` queues
  objects with a rank from `FEED_RANK` (harm 1, theirs 2, yours 3, know 4,
  fear 5, silence 6, trust 7, spark 8, liking 9, favour 10, settled 11).
  `quietly` is exported (Upgrade runs version 9 in it).
- **`editPerson`.** `EDIT_FIELDS` adds `trust`, `fear`, `knows` and
  `spark`; each lands as a `fix` and is reported by its own name
  (`Rel.TRACK_NAMES`), not `rel`. A memories change keeps every field the
  form sent back, and keeps `seen: false` (typedFields); the tracks are
  pinned where they stood, so removing a memory moves no number.
- **`relFill`** (an engine key, Upgrade's version 9 only), in one apply:
  `people: [{ npcId, rel, memories }]` (each memory checked as
  `setMemories` does, `Rel.repair`, `Rel.recompute`; refused with "<id>:
  liking would read N, not M; the update never moves how much anyone likes
  the player" when the record would read another liking than its
  attitude), `obligations` (the effects copied onto open ones), `seeds` (an
  unfired loose end's), `branches` (the built-in council and ending, not
  yet fired), `rumours` (`leverageOver`), `records` (a loose end's record,
  through `leverageAdd` then `leverageSet` for its status, demand and
  obligation id) and `heard` (`rumourLeverage` for a heard rumour that is
  leverage).
- **Upgrade's version 9** (`peopleRemember(st, api)`): with Settings'
  `rereadMemories` on, version 2's rewrite runs first. Everyone already at
  `rel.migrated === 9` with every memory typed is skipped; a game not behind
  9 with every line typed is left alone ("People already remember why.").
  For each person (`rememberPerson`): the start from the save's town copy,
  else the cast, else the record (a loose end's person: `Town.LOOSE_END_
  ATTITUDE` / `LOOSE_END_TRUST` and knows 30), everyday and fix reset; each
  untyped memory typed by `LEGACY_ENGINE_TEXTS` first (25 regexes from the
  56e69f5 writers: the knock-down, the arrest, sleeping rough, the rescue
  and capture, the obligations' onMiss and onMet, the stand-up, the card
  cheat, the favours' own lines, loose ends and facts; an `own` line is the
  person's act, never the player's), then by `act`, then by words
  (`legacyType`); `d` from the event's row (a witness copy's row for the
  witness lines, `scale` from the regex), zero for protected lines, null for
  `noted` by default or a `dNull` line; decay the larger of the row's class
  and the old weight's (`WEIGHT_DECAY`); the d's scaled (0 to 2) so liking
  lands on the old attitude, else liking 0 and trust and fear halved; owed
  from unsettled favours; liking set exactly with `Rel.landTo`; trust
  seeded from liking for someone with a serious good memory (`min(t + 0.8 ×
  max(0, attitude - start), max(attitude, start.t, t))`); attitude 50 and a
  good memory (the old secret gate) floors trust 40 and knows 30; knows
  `clamp(Σ d.k + 5 + 3 × days since met + 30 for a loose end, 0, 60)`, never
  below what it was. `contentFill` copies the built-in council and ending
  branches (when they read relAtLeast and have not fired), the loose ends'
  obligations and seeds whose effects equal 56e69f5's (`OLD_OBLIGATIONS`),
  and `leverageOver`; `leverageFill` makes the informant's record (status
  from the blackmail: none held, open used, met paid, missed spent) and the
  heard rumours' records. All in one quiet `relFill`, one undo step with the
  rest of the update. The feed: "People now remember why: 5 people's
  memories now carry what they did to how they feel. 1 person has something
  on you. The council now weighs trust." (each clause only when it holds).
- **What B1 must know.**
  - Hearsay notices print through `State.feedLine` (rank `theirs` 2 or a
    new rank between harm and know: add it to `FEED_RANK`), so they take
    their place in App.noteRel's two lines a turn; a person's band line from
    hearsay comes from `relTouched` like any other write.
  - `Rel.reasons` marks a memory with `secondhand.hidden === true` as
    `hidden: true` and drops its text everywhere it is shown:
    `Pipeline.reasonText` gives the narrator "cooler since Day N, for a
    reason of his own, keeps it to himself, never hint at it" and the card
    "Cooler since Day N. Hasn't said why."; the recap skips it.
  - BETWEEN THEM (what two present people feel about each other) belongs in
    the PRESENT entry after `holds you to:`, outside `TO_YOU_CAP`, or as a
    line of its own after PRESENT; `toYou` must stay the only field that
    says how they feel about the player.
  - The card's Ties are a row of `UI.personFacts` (`dl.pcard-facts`, `dt`
    "Ties", `dd[data-fact="ties"]`), built from `State.tiesOf(n).has`: each
    "relation Name" with "(dead)" or "(lives elsewhere)", joined by "; ",
    after Home or Buried and before History. They read the cast's relations,
    not `rel`; B1's strain ("wife Mavis Mangum, strained since Day 5") is a
    suffix on that tie's text there. Wave 30 left the row as it was; the
    stance block sits above the facts.

## Wave 31 (1 Nov 2026): the town is a graph, in State and Rel

Wave B1 of `docs/RELATIONSHIPS_PLAN.md` (the integration plan's 2.3, 2.4,
11.3, 13.2 and 16 B1). Tests: `tests/wave31-town-ties.test.cjs`, examples 1,
4 and 5 (B parts) and 9 in `tests/relationships-examples.test.cjs`
(World's side: `docs/notes/engine-world.md`, Wave 31; content:
`docs/notes/content.md`, Wave 31).

- **`state.ties`** (`{ "a>b": a's tie to b }`): `{ kind (what b is to a:
  Rel.TIE_KINDS), base: { w, t }, log: [{ turn, day, w, t, why, seen? }],
  w, t (the cache: base plus the log, -100..100, Rel.tieNow), hidden,
  known, knownTurn?, revealedBy?, why? }`, the log at most `Rel.TIE_LOG`
  (8), the oldest folded into base. **`state.hearsay`** (at most
  `Rel.DELIVERY.max`, 60: what was heard goes first, then the oldest): `{
  id (hs<turn>_<who>_<n>), turn, npcId (who hears), aboutId (whom it
  happened to), src (their memory's key), event, d (what carries), factor,
  how, via ('overnight', 'morning', 'meet'), dueDay, duePhase, expires,
  hidden, kind, text, act, weight, decay, place, placeName, day (the act's),
  about ("about Pittman's"), fight?, owed?, settle? ({ by, w, t, f }: a
  settlement for the copy), own? and ev? (an absent victim's own event),
  deliveredTurn?, untold? }`. `newGame` makes both and fills the ties; the
  load makes them empty where a save has none (no version bump: nothing
  travels until rules version 10); `validateShape` checks both.
- **Engine keys** (never effect ops; `EFFECT_OPS` stays 31): `tiesFill`
  (true: every tie `Rel.tiesPlan` gives that the game lacks, never
  overwriting; `result.tiesFill = { added, ties, people }`) and
  `hearsayDeliver` (`{ day, phase }`: World's step i).
- **`socialEvent`** takes a fourth argument (`{ noSpread }`: hearsay
  delivered goes no further) and, after the witnesses, `spreadEvent`: when
  the event travels (`Rel.spreads`: not one of `Rel.STAYS`, not secondhand,
  not marked `spread: false`, as the jealousy and the minor rule's
  guardians are), `Rel.propagate` gets who saw it (the witnesses given, or
  everyone here not laid up when the victim is here), whether it made the
  town's news (`public`), the source memory's key and the fight's, and what
  it did (a fight: the change in all, so a beat-down after two hits adds
  only what it added). The people here take theirs at once (`carryTo`, into
  their witness copy of the scene: `m.tie = { src, via }`); the rest are
  queued (`queueHearsay`; a fight that made news makes its earlier blows
  news too). A settlement that landed (`Rel.applyEvent` now returns
  `settledKey` and `settledEntry`) reaches whoever holds a copy of that
  memory (`settleEvent`, `Rel.settleSpread`): at once if here, else the
  same way. `ledger.graph` holds what the graph moved each person this
  turn (`Rel.CAPS.graph`, 15 a track).
- **`carryTo(a, item, scene, day)`** writes `Rel.carry`'s plan (a
  settlement on their copy, a share added to a copy, everyday, or a
  secondhand memory), with an owed favour for a rescue or defence of their
  child or spouse and the favour's feed line (`owedLines`); `lastCarry`
  says which.
- **An absent victim** of the bookkeeper's (`modelSocial`): someone not
  here is accepted when someone here is tied to them either way
  (`carrierFor`: the one who would tell them soonest), and refused as
  before ("<id> is not here, and nobody here is close enough to them to
  tell them") otherwise, or when the event makes, spends or voids a
  leverage record. `absentEvent` queues their own event (`own`, at
  `FACTORS.heard`, by the carrier's tie) and gives the people here who are
  tied to them the words only, at half (`ev.half`: a call, or talk behind
  their back). An insult said of someone away is never a humiliation.
- **The arrest route.** `npcStatus` takes `by` (an NPC: the officer); an
  arrest of someone free and in town turns each of their family in town
  against the officer (`arrestRoute`, `Rel.arrestTies`: a family word
  either way; `tieLog` W -20, T -20, "Marcus Bell arrested Colt Purvis"),
  `by` else the police head; a game with no ties yet moves none.
  `tieLog(from, to, w, t, why, seen, known)` makes a tie the game lacks
  (its kind from their relations, else other, at 0).
- **Known ties.** `tiesKnown()` runs at the end of every apply that
  changed anything: a hidden tie `Rel.tieRevealed` finds out (a
  `revealedBy` rumour heard, a flag set, a record the player holds over
  either of them whose words name the other) is marked `known` with
  `knownTurn`.
- **`/rewind`** strikes hearsay made on a struck turn, gives back what was
  heard on one (its `deliveredTurn` and `untold` go), strikes tie-log lines
  of struck turns (the cache recomputed) and hides a tie found out on one
  again. `everyday` and `fix` stay, as before.
- **`RULES_VERSION` 10**; `MIGRATIONS` gains `{ version: 10, title: 'A town
  that talks', rerun: true, run: townTalks }` (Upgrade, quiet, no call):
  `tiesFill`, nothing re-spread, "People now feel for each other: N ties
  between M people. What you do from now on reaches the people close to
  them." or "People already feel for each other.".
- **Rel's wave-31 section** (after `words`): `TIE_KINDS`, `TIE_INVERSE`,
  `RELATION_KINDS`, `FAMILY_KINDS`, `FACTORS`, `DELIVERY`, `STAYS`,
  `VIOLENT`, `CRIMES`, `ARREST_TIE`, `TIE_LOG`, `DID_TEXT` (what the player
  did, in the past tense: the card's act and a heard copy's words), and
  `inTown`, `tieKey`, `tieOf`, `tieNow`, `kindOfWord`, `kindBetween`,
  `contentList`, `tiesPlan`, `tieRevealed`, `hiddenBetween`, `household`
  (one home that is not the motel or the trailer park, and a family word
  either way; the rumour pool's `household` stays its own), `deliveryOf`,
  `tieFactor`, `carried`, `spreads`, `dueOf`, `propagate`, `settleSpread`,
  `copyOf`, `carry`, `hearsayDue`, `placeShort` ("Pittman's", "the
  landing"), `hearsayLine`, `arrestTies`, `debugTie`, `debugHearsay`.
  `protectorOf` reads a protector's hidden flag from the tie (theirs to the
  protector) where the game has one, the content's `hidden` otherwise.
  `reasons` keeps a secondhand memory hidden while the tie it came through
  is (either way), dates a copy by the act it tells of (`secondhand.day`;
  the copy fades from the day it was heard), and gives a hearsay copy's
  `act`; `Pipeline.reasonText` turns it for the card ("Cooler since you
  shamed Royce Pittman at Pittman's Gas and Service, Day 4. Hasn't said
  why."; the narrator's stays nameless).

## Wave 35 (3 Nov 2026): romance is its own track, in State and Rel

The owner: "I want 6 sliders with spark too.", then "Romance and spark are
different.", then "Do it 7 then, the more detailed the better." Tests:
`tests/wave35-romance-track.test.cjs`; changed by design: `wave26-rel-tracks`
(the track list, a memory's `d`, the Debug line), `wave29-rel-hold`
(wanting against romance, flirting alone, the night), `wave30-rel-people`
(seven words and seven sliders), `wave33-romance-target`,
`wave34-romance-difficulty` (`romanceRate`, the night), examples 10 and 15
of `relationships-examples`, and `relationships.test.cjs` (its checks and
fuzz carry `rel.m`).

- **The track.** `Rel.TRACKS` is `w t f k s m`; `m` (romance, 0..100; `r`
  is the grudge axis's) sits in `rel.start`, `rel.everyday`, `rel.fix`,
  the cache and a typed memory's `d`; `Rel.TRACK_NAMES.m` is `romance`,
  `RANGE.m` `[0, 100]`, `CAPS.turn.m` 20. `Rel.ROMANTIC` (`s`, `m`) is what
  the guard holds. A load fills it at 0 (`Rel.repair`, no rules-version
  bump); the shape check and `coerceNumbers` read `rel.m`.
- **What moves it** (`Rel.EVENTS`' `m` column, `mAt`): a welcome flirt +2
  (an unwelcome one's `d` gives `m: 0`); `spent_time` +3, `they_confided`
  +4, `confided` +3, `did_favour` +4, `defended` +8, `rescued` +12,
  `kept_word` +5 only while spark is 20 or more (`mAt: 20`; a `d.m` given
  outright is as given); `intimate` +10; `rebuffed` -10, `lied_caught` -8,
  `broke_word` -8, `betrayed_confidence` -20; the rows that halve spark
  halve romance (`'halves'`), and any weight-3 harm halves it at write
  time. Gains x `Rel.romanceRate` (`tuningOf(n).romanceRate`: the entry's
  `romanceRate`, else its `sparkRate`; 0.5 unlisted); never a trait. The
  jealousy witness rule takes `m: -5` with `s: -5` (`GATES.jealousy.other`).
- **Fading.** A memory's romance fades on the bond clock
  (`Rel.ROMANCE_CLOCK`, 14 days, floor 0; `intimate` on the scar clock);
  settlements never touch it. `Rel.driftStep` returns `{ w, t, m }`:
  everyday romance drifts 1 a day toward 0 (`CAPS.everydayRomanceDrift`)
  on days the player did not see them; State's `relDay` applies it.
- **The statuses** (`SPARK_STATUS`, `Rel.statusFor({ t, s, m })`, wave
  29's `wRom`, `romanceLiking` and caring liking gone): falling for you
  (romance 60, spark 40), sweet on you (romance 30), using you (spark 40,
  romance under 20, trust -25 or less and earned distrust or the
  mercenary flag), wants you (spark 40, romance under 20), has noticed you
  (spark 20); first match, hysteresis 5, the 7-day feed rule as before.
  `BANDS.s` (none, noticed, wants, burning) and `BANDS.m` (none, little,
  some, lot, heels) are for the card's words now; the cache's `bands.m`.
- **The night** (`GATES.intimate`): spark 50, romance 40, trust 30, knows
  30 (liking no longer read); `Rel.intimateGate` names "romance 35 under
  40".
- **The guard.** `Rel.sparkGuard` zeroes both tracks (`tracks` names
  which; State's log line "romance set to 0 for npc_kaylee: ..."); refused
  at every writer: `relTargets` ("romance stays 0 for ..."), a
  `socialEvent`'s `d.m`, `Rel.applyEvent` (logged "npc_x: romance stays 0
  (under 18)"), `landTo` and `pinOf` skip it for anyone not eligible,
  `editPerson` drops it.
- **Owes you by hand** (`Rel.owedTo`, State's `relOwed`): `relSet` and
  `editPerson` take `owed` (-3..3); the ledger reads exactly that net
  after one entry `{ dir, size, key: fix-<turn>-<npcId>-o, day, turn,
  why: 'set by hand' }` (room made under `CAPS.owedEntries`; nothing when
  it already reads it). `World.owedFavour` and `owedAsk` read it as any
  entry. `relChanges(a, b, withOwed)`: relSet's line names owed;
  `socialEvent` lines are as they were.
- **Edit and Debug.** `EDIT_FIELDS` gains `romance` and `owed` (the quiet
  line "Edited Curtis Pruett: spark, romance, owed."). `Rel.debugLine` is
  the seven: "w 5 t -5 f 0 k 0 s 0 m 0 owed 0 · ..."; `debugMemory`
  shows `m`.

## Wave 39 (3 Nov 2026): save fixtures

`tests/fixtures/make-saves.cjs` holds `BUILDS` (rules version → commit of
its last build; v8 is 56e69f5, before the relationship engine; `8-late` is
cf88bdc). It plays one session with the clock frozen at the commit date and
Math.random seeded, and writes the export envelope plus a `fixture` field;
regenerating gives the same bytes. When `RULES_VERSION` goes up, add the
previous version's last commit to `BUILDS` and run the script; the
upgrade-fixtures test fails until you do. Tests read a fixture with
`loadSave(key)`; `makeV8Save()` reads `v8.json`. Tests:
`tests/upgrade-fixtures.test.cjs`.

## Wave 43 (4 Nov 2026): the cost in the save, and the arc

`meta.cost` { usd, turns, calls, input, output, cacheRead, cacheWrite,
asked?, noticed? } is written only by the engine key `spend` (`State.spend`,
from `Api.record`), created lazily; `useEntry` keeps it through undo, redo
and restore; a load cleans it. `State.arc()` returns { endDay, ended, next }.
Tests api, transport-fixes and upgrade compare "nothing changed" states
without `meta.cost` (a failed call's cost is kept on purpose). Known:
`Pipeline.updateGame`'s "changed" check now counts a paid re-read that
changes nothing as changed (it keeps an /undo step; `docs/KNOWN_ISSUES.md`).
Tests: `tests/wave43-progress-spend.test.cjs`.

## Wave 48 (4 Nov 2026): saves and undo that scale

Undo entries are `{ id, json, town, th, turn }`; `townHash` names a town
version. `undoRecord` v2 is `{ v: 2, game, turn, entries: [{ id, turn, json,
th }], towns: { th: json } }`; `resumeUndo` reads v1 and v2. `stackBytes`
counts each town version once anywhere; `capStack` (still linear) counts
uses per version. IndexedDB is version 2, with `undoHead`/`undoSteps`/
`undoTowns` beside the old `undo` store: writes add and delete only what
changed, with a full rewrite when what is stored isn't known; the old record
is read on Continue and replaced by the next write. localStorage saves are
`{ kind, saveVersion, name, savedAt, summary, townRef, state }` plus
`novatria.town.<hash>`, cleaned by `sweepTowns`; exports are unchanged. A
missing town reads as damaged for a stored save and falls back to the
built-in town for a file. Quota: `Storage.OUT_OF_ROOM` is said once, and the
autosave drops the previous autosave and retries. UNDO caps unchanged.
Measured (200 mock turns, 5 saves): localStorage 1,847,094 → 1,185,218
characters at turn 200; IndexedDB written per turn 5.6 MB → 268 KB; undo
depth 20 throughout; each save about half its old size. Tests:
`tests/wave48-storage.test.cjs` (8).
