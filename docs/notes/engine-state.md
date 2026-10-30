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
| `addMemory` | `npcId`, `text`, `weight` (1..3) | the memory path; a memory with the same first five words merges into the older one |
| `clockAdjust` | `factionId`, `delta` (-2, -1, 1, 2) | the running clock, clamped 0..segments, no completion check; a no-op when no clock runs |
| `threadUpdate` | `threadId`, `summary?`, `status?`, `knownToPlayer?` | status through `setThreadStatus`; a resolved thread's status never moves (no-op) |
| `addObligation` | `kind`, `npcId`, `text`, `amount?`, `dueDay?` or `dueOffset?` (0..60, from today), `itemName?`, `onMiss?`, `onMet?` (effect lists, 12 at most), `id?` (`obl_...`) | see Obligations |
| `settleObligation` | `id`, `status` (`met`/`missed`), `how?` | sets the status once and runs `onMet`/`onMiss` once; a no-op if already settled |
| `addNews` | `text`, `factionId?`, `public?` (default true), `epilogue?`, `day?`, `phase?` | pushes `{ day, phase, text, factionId, public, seen: false, epilogue? }`; keeps the newest 60 |

Existing ops changed: `npcStatus` dead now takes them off every schedule
and cancels their visit (review E14); `threadStatus` on a resolved thread
is a no-op.

New engine keys (`ENGINE_KEYS`): `expireDaily: <day>` and `newsSeen: true`
(marks every news item seen: for transport's morning "Overnight in town"
block, so it never writes state directly).

## Obligations (CONTRACTS section 4)

`state.player.obligations: [{ id, kind, npcId, text, amount, dueDay,
itemName, status, onMiss, onMet, createdTurn, createdDay, settledDay?,
settledTurn? }]`. Kinds: `debt, blackmail, promise, errand, lodging`. One
open obligation per (kind, npcId); the id is `obl_<kind>_<npc id without
npc_>` (`obl_debt_curtis_pruett`), with `_2`, `_3` for later ones, unless an
`id` is given. `text`, `itemName`, `onMiss` and `onMet` have `{npc}`,
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
  `arrival` or `defeat` (the narration of time already passed) does not
  count; a plain string counts.
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
  'defeat' }`. Mark news seen with `State.apply({ newsSeen: true })`. A
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
