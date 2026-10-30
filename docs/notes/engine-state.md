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

- `goldDelta` held to +/-500 a turn (a per-turn ledger), `hpDelta` to +/-3 a
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
> what one turn can do: $500, 3 HP, two things, one plan, three days of a
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
