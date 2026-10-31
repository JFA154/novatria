# Build plan: One-Town Text RPG

Read SPEC.md first (the game design, authoritative), then docs/API_NOTES.md
(authoritative for every Claude API call), then this file (how the build is
organised and the shared data contract).

## Deliverable and hard constraints

- One file: `index.html` at the repo root. Inline CSS and vanilla JavaScript.
  No build step, no framework, no bundler, no backend. Opening the file from
  disk must work (`file://`), so no module scripts and no fetches of local files.
- Script organised into clearly delimited sections, one per module, in this
  order: `TOWN_DATA`, `TABLES`, `BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`,
  `GRUDGE_TEMPLATES`, `FAVOUR_TEMPLATES`, `STYLE_GUIDE`, `EXAMPLE_TURNS`,
  then modules `Rng`, `Dice`, `Tables`, `State`, `Town`, `World`, `Style`,
  `Api`, `Pipeline`, `Storage`, `UI`, `Commands`, `App`. Each module starts
  with a banner comment: `// ===== Module: State =====`.
- Expose every module on `window.Game` (`Game.State`, `Game.Dice`, ...) so
  Playwright tests can drive the engine with `page.evaluate`. Also expose
  `Game.state` (the live state object, read-only by convention) and
  `Game.town` (the loaded `TOWN_DATA`).
- Only one Google Font (Literata), loaded with a `<link>`; fall back to
  Georgia. Nothing else external. The font will not load in this sandbox and
  that is fine.
- Strict mode, no globals besides `Game`. No `innerHTML` with
  unescaped model output or player input: build DOM nodes or escape text.

## Repository layout

```
index.html          the game
SPEC.md             the design spec (do not edit)
docs/API_NOTES.md   Claude API wire format (do not edit)
docs/BUILD_PLAN.md  this file
docs/CAST.md        the cast roster, written by tests/cast-doc.cjs (never by hand)
docs/notes/         one file per area of the 30 Oct 2026 review fixes (direction change 10)
content/            staging area for authored data; deleted once inlined
tests/              Playwright scripts, CommonJS (.cjs), run with plain node
tests/run.cjs       runs every tests/*.test.cjs file, exits non-zero on failure
.github/workflows/  tests.yml: tests/run.cjs on every push and pull request
README.md           how to play, how to put in the key, how to run tests
```

Tests use the Playwright that is preinstalled in this sandbox:
`const { chromium } = require('playwright'); const browser = await chromium.launch();`
Do not run `npx playwright install` and do not add a `package.json`
dependency on Playwright. Open the game with
`page.goto('file://' + path.resolve('index.html'))`. Test on two viewports:
1280x800 and 375x740. Fail a test on any uncaught page error (`page.on('pageerror')`).

## Shared data contract

All ids are lowercase slugs with a type prefix: `loc_`, `npc_`, `fac_`,
`thr_`, `seed_`, `rum_`, `item_`, `cond_`, `bg_`. Ids never change.

### TOWN_DATA

```js
const TOWN_DATA = {
  name: "...",                      // the town's name
  setting: "...",                   // one paragraph, shown on the title screen
  startLocationIds: { gate: "loc_...", docks: "loc_..." },
  calendar: { season: "autumn", startDate: "2026-10-08" },  // day 1; weekdays and dates follow (direction change 10)
  locations: [{
    id, name, type,                 // type: tavern | market | docks | temple | manor | smithy | watch | slum | road | ...
    description,                    // two sentences
    exits: ["loc_..."],             // symmetric: if A lists B, B lists A
    npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] },
    discovered: true,               // town places true; a cast member's home (house, trailer,
                                    // apartment, farm) false until someone tells the player
    closed: false,                  // set true by a clock effect; still exists
    closedOn: ["Sunday"]            // optional: weekday names it is shut (State.isClosed)
  }],
  npcs: [{                          // the whole cast, written by hand (direction change 8): 41 here,
                                    // plus the away and the dead (presence, direction change 9)
    id, name, pronouns, role, factionId,  // factionId may be null; role never just "man" / "woman"
    tags: ["lender", ...],          // free-form, used to link loose ends (see LOOSE_ENDS)
    look, voice,                    // one line each
    personality: ["trait", "trait"],
    goal, secret,
    attitude: 0,                    // -100..100
    relations: [{ npcId, relation }],  // "npcId is this person's relation", written on both sides
    home: "loc_...",                // where they live; they are there in at least one phase
    memories: [],                   // { turn, text, weight: 1|2|3 }
    alive: true, knownToPlayer: false,
    status: "free",                 // free | arrested | gone | dead
    awayOn: { days: ["Monday", ...], phases: ["morning", "afternoon"], where: "at the county school in Clayburn" }
                                    // optional: nowhere in town on those days and phases (State.npcsAt)
  }],                               // everyone is in npcIdsBySchedule in every phase
  offstage: [{ name, about }],      // optional: people the story names who never appear
  factions: [{
    id, name, goal, methods,
    clocks: [{                      // 2 or 3, run in sequence
      label, segments: 6, filled: 0,  // segments 4 to 10 (police 5, Sturdivant 6, Night Run 8)
      odds,                         // optional, here or on the faction: lowest d6 that fills (default 5)
      onComplete: { text: "...", effects: [ /* effect ops, below */ ],
                    requires, alt } // optional; see "requires and alt" below
    }],
    activeClock: 0,                 // index into clocks; -1 when all done
    relations: { "fac_x": -50 }
  }],
  threads: [{ id, title, summary, status: "open", knownToPlayer: false, linkedIds: [],
              reward: "charm" }],   // optional: the stat its first resolution raises
  seeds: [{
    id, cause, effect,
    trigger: { type: "day" | "location" | "npc" | "clock", value },
    //  day → integer day; location → "loc_..." or a list of them (any);
    //  npc → "npc_..." or a list; clock → "fac_x:3"
    notBeforeDay,                   // optional
    effects: [],                    // optional: effect ops applied when it fires
    requires, alt,                  // optional; see below
    fired: false, hidden: true
  }],
  rumours: [{ id, text, true: true, sourceNpcId, heard: false,
              tellerIds: ["npc_..."],  // at least two people besides the source who can tell it
              threadId, factionId }],  // optional: the thread it reveals when heard; whose people know it
  events: [{                        // town events (World.fireEvents): the council meeting
    id: "evt_...", day, phase, locationId, title,
    attendees: ["npc_..."],         // optional: free people there for that phase
    branches: [{ when: { flagsSet?, flagsUnset?, clockAtLeast?: { fac_x: n }, npcFree?,
                         attitudeAtLeast?: { npc_x: n }, obligationStatus?: { obl_id: "met"|"missed" } },
                 text, effects }],  // the first branch whose when all holds
    default: { text, effects }
  }],
  epilogue: { onDay: 21, orFlagsSet: [], branches, default }  // the same branch shape, no place
};
```

`requires` and `alt` (on a seed or a clock's `onComplete`): `requires: {
npcFree?: [npcIds], npcAt?: { npcId: locationId }, flagsSet?: [keys],
flagsUnset?: [keys], obligationOpen?: [ids] }` (World also reads
`obligationStatus`, `clockAtLeast`, `attitudeAtLeast`, and since wave 5
`attitudeBelow` and `threadOpen` there), `alt: {
text, effects? }`. When it fires and `requires` does not hold, the `alt`
text and effects are used instead; with no `alt` it fires as a logged no-op.
`clockAtLeast` counts every segment the faction has filled across its
clocks. Every completion and every event branch is town news.

Effect ops (applied by `World.applyEffects` through `State.apply`):

| op | fields | result |
|---|---|---|
| `closeLocation` | `locationId` | `closed = true`; narrator told it is shut |
| `openLocation` | `locationId` | `closed = false` |
| `npcStatus` | `npcId`, `status` (`arrested` / `gone` / `dead` / `free`) | sets status; `dead` also sets `alive = false`; `arrested` moves them to the watch house in every phase; `gone` removes them from all schedules |
| `npcMove` | `npcId`, `locationId`, `phases` (array or `"all"`) | rewrites that NPC's schedule |
| `attitudeDelta` | `npcId`, `delta` | clamped to -100..100 |
| `priceMultiplier` | `factor` | `state.flags.priceMultiplier *= factor` |
| `openThread` | `thread` (full thread object) | adds it |
| `threadStatus` | `threadId`, `status` | open / resolved / failed |
| `addRumour` | `rumour` (full rumour object) | adds it |
| `plantSeed` | `seed` (full seed object) | adds it |
| `factionRelation` | `a`, `b`, `delta` | symmetric |
| `setFlag` | `key`, `value` | `state.flags[key] = value` |
| `reputationDelta` | `key` (`town` or a faction id), `delta` | clamped -100..100 |
| `playerGold` | `delta` | gold clamped at 0 (a loss beyond cash takes what there is) |
| `playerHp` | `delta` (-3..+3), `allowDefeat?` | never below 1 unless `allowDefeat: true` |
| `giveItem` | `name`, `notes?`, `qty?` | stacks on a carried thing of that name |
| `takeItem` | `name` (or `id`), `qty?` | by name, any case; a no-op when not carried |
| `addCondition` | `name`, `effect` (`"-1 might"`), `days` (0..30) | `untilDay = day + days` |
| `banFrom` | `locationId`, `days` (0..60), `byNpcId?` | `state.bans` gets `{ locationId, untilDay, byNpcId? }`; `State.isBanned` |
| `playerPrice` | `factor`, `days` (0..60) | `flags.playerPriceMultiplier` (0.25..4) until `flags.playerPriceUntilDay`; `Tables.price` multiplies by it |
| `addMemory` | `npcId`, `text`, `weight` (1..3), `act?` (`"own"`) | the memory path; a no-op for the dead; someone living elsewhere still remembers; `act: "own"` (wave 6): what they did to the player, which starts no grudge |
| `clockAdjust` | `factionId`, `delta` (-2, -1, 1, 2) | the running clock, clamped, no completion check; a no-op with no running clock |
| `threadUpdate` | `threadId`, `summary?`, `status?`, `knownToPlayer?` | status through `setThreadStatus`; a resolved thread never moves |
| `addObligation` | `kind`, `npcId`, `text`, `amount?`, `dueDay?` or `dueOffset?`, `itemName?`, `onMiss?`, `onMet?`, `id?` | see Game state; one open per (kind, npcId) |
| `settleObligation` | `id`, `status` (`met` / `missed`), `how?` | runs `onMet` / `onMiss` once; a no-op if already settled |
| `obligationPaid` | `id`, `amount`, `take?` | credits money toward a debt or blackmail (at most what is still owed); `take: true` takes it from the player's cash first and credits what it took; paid in full it is met (wave 5), except inside that obligation's own `onMiss`, where it only credits (wave 6) |
| `addNews` | `text`, `factionId?`, `public?` (default true), `epilogue?` | pushes `{ day, phase, text, factionId, public, seen: false, epilogue? }`; keeps the newest 60 |

`State.EFFECT_OPS` is the list (28 with `placeItem` and `obligationPaid`),
and `tests/validate-town.cjs` keeps the same list in `OPS`. Placeholders
`{npcId}`, `{npc}`, `{playerName}` (also `{player}`, `{witnessId}`,
`{witness}`, `{place}`, and an obligation's own `{obligationId}` in its
`onMiss` and `onMet`) are filled by
`World.fillEffects` before `State.apply`, which refuses an id that still
starts with `{`. In content they appear only in loose ends and templates.

### TABLES

```js
const TABLES = {
  npc: { firstNames: [30], occupations: [30] },   // read by the person matcher only; nothing makes a person
  location: { types: [15], details: [20], problems: [15] },
  items: { goods: [40 of { name, price, kind }], trinkets: [20] },
                                    // kind: good | service | drink | food; only goods are carried;
                                    // a service named "Night at ..." is a paid night (State.restQuality)
  complications: [20 of { text, tiers, kinds, needsPerson?, notDay1?, effects? }],
                                    // tiers: partial | failure | both; kinds: social | physical | stealth | any;
                                    // needsPerson: only with someone present, who is {witness}
  weather: { spring: [6], summer: [6], autumn: [6], winter: [6] }
};
```

### Character creation data

```js
const BACKGROUNDS = [{            // exactly 6
  id: "bg_...", name, blurb,       // blurb: one sentence
  stats: { might, wits, charm, stealth },   // each -1..3, total 3
  gold, items: [{ id, name, qty, notes }],  // 3 items, one of them a "Prepaid phone"
  arrival: "gate" | "docks",
  hook: { npcId, text: "...{player}...", dayOffset: 0 | 1,
          trigger: { type: "npc" | "day" | "location", value } }
                                    // planted at creation as seed_bg_<id>: the person brings
                                    // the background a first job or question
}];
const FLAWS = [ "...", ... ];      // 8 one-line flaws
const LOOSE_ENDS = {               // keys: debt, enemy, secret, lost, promise
  debt: {
    label: "A debt",
    options: ["I owe someone money", ...],     // 3 presets, editable
    link: { tag: "lender", optionTags: ["lender", "collector", "bookie"] },
                                               // bind to a free cast member with the option's tag,
                                               // else the tag, else anyone free; never a new NPC
    seed: { dayOffset: [3, 4], effect: "...{npc}..." , trigger: "day" },
    obligation: { kind, amount?, dueOffset, text, itemName?, onStart?, onMiss: [], onMet: [] },
                                               // the kind's default (also for words the player typed)
    obligations: [ /* one per option, lined up with options, same shape */ ]
                                               // copied onto the seed as an addObligation effect,
                                               // dueDay = the day it fires + dueOffset; onStart is
                                               // applied when the loose end is tied (the letter)
  }, ...
};
const GRUDGE_TEMPLATES = [{        // 14
  effect: "...{npc}...", dayOffset: [2, 5],
  effects: [ /* effect ops, applied when it fires */ ],
  public: false,                   // true: town news
  forTags: [], notForTags: [],     // optional: who can hold it (tags, plus elderly/teen/police from age and role)
  about: ["theft"]                 // optional (wave 6): the offences it answers (violence, theft, insult)
}, ...];
const FAVOUR_TEMPLATES = [ /* 12, the same shape */ ];
const GOAL_PRESETS = [ "...", ... ];  // 6 goal suggestions, 140 characters at most; on Game.data
```

Obligation ids are `obl_<kind>_<npc id>` with the full id (`obl_debt_npc_curtis`),
`_2`, `_3` for later ones; the council meeting and the epilogue read them.

### Game state

Exactly SPEC.md section 3, plus:

```js
state.flags = { priceMultiplier: 1, weather: "..." };   // also season, playerPriceMultiplier,
                                    // playerPriceUntilDay, lodgingPaidUntilDay, epilogueShown
state.time = { day: 1, phase: "morning", shorts: 0 };   // 3 shorts = one phase; late, noSleep and
                                    // instants (6 instants = a short) are kept only while set
state.meta = { seed, turn, createdAt, townName, townVersion: 1, lastRollKey: null };
                                    // lastRollKey: the retry locks, keys joined by ";"
state.player.storyPoints // 0..3
state.player.obligations = [{ id, kind: "debt"|"blackmail"|"promise"|"errand"|"lodging",
  npcId, text, amount, dueDay, itemName, status: "open"|"met"|"missed",
  onMiss: [], onMet: [], createdTurn, createdDay }];
state.player.progression = [{ turn, day, threadId, gain }];   // a thread's first resolution
state.news = [{ day, phase, text, factionId, public, seen, epilogue? }];   // newest 60
state.bans = [{ locationId, untilDay, byNpcId? }];
state.eventsFired = ["evt_..."];
state.fight = { npcId, hits, day, phase, locationId };   // the Pipeline's, inside the turn
npc.hurtUntilDay                    // knocked down: at home every phase until then
```

### Map

Optional. `TOWN_DATA.map` and each location's `map` draw the town map at the
top of the Places tab (`UI.renderMap`, an inline SVG; numbers are viewBox
units):

```js
TOWN_DATA.map = {
  width: 360, height: 300,             // the viewBox
  river: "M0,226 C...",                // optional: SVG path of the river's centre line
  riverWidth: 34,                      // optional (default 34)
  riverLabel: { text, x, y, rotate },  // optional; rotate in degrees
  bridges: ["M266,216 L270,266"],      // optional: crossings drawn over the river
  roads: ["M264,0 C..."],              // decorative only (the highway in and out)
  labels: [{ text, x, y, anchor }]     // area labels; anchor start | middle | end
};
location.map = { x, y, label, anchor }; // label 1-3 words; anchor n | s | e | w: the label's side
```

Roads between places come from `exits` (one per connected pair, a gentle
curve toward open space, never into the river). Once `TOWN_DATA.map` exists,
`tests/validate-town.cjs` wants `map` on every location, inside the bounds,
places at least 28 apart. A place without `map` (made in play, or a town
without map data) goes beside its first mapped exit, else on a grid. People
the player has met show by where they were last seen (`state.seen`). A tap on
another place asks "Go to ...?"; only that chip sends the Do turn "I head to
<place>." through `Pipeline.submit`.

`State.apply(diff)` is the only writer. It accepts the bookkeeper's
`record_changes` shape (SPEC.md section 10) plus an `effects` array of the
ops above. It returns `{ applied: [...], rejected: [{ path, reason }] }` and
pushes rejections to the debug console. Every number is clamped, every id
checked, per SPEC.md section 10 "Validation in State.apply()". The
bookkeeper's diff comes with `{ source: 'model', present: [npcIds],
rollSuccess, attacked }` and is held to one turn: `goldDelta` ±500, `hpDelta`
±3 and never from above 0 to 0 unless `attacked` and the roll failed, two
things carried, one seed, conditions of three days at most, and items refused
when their payment was. `record_changes` gains `npcFates: [{ npcId, status:
'arrested'|'gone'|'dead'|'hurt' }]` (someone present, one a turn, all but
`hurt` only after a roll that succeeded; `hurt` sets `hurtUntilDay = day +
2`), `memoriesSettled: [{ npcId, text }]` and `obligationsSettled: [id]`. A
debt or blackmail is also met by a `goldDelta` that hands over the amount
with the person present, an errand by an `itemsLost` of its `itemName`. The
result adds `progressed` and `settled`.

## Module responsibilities

| Module | Owns |
|---|---|
| `Rng` | mulberry32 seeded by `meta.seed`; `Rng.int(a,b)`, `Rng.pick(arr)`, `Rng.d(n)`; advances a counter stored in `meta.rngCalls` so a loaded save continues deterministically |
| `Dice` | d20 + stat + modifiers vs difficulty, outcome tiers, complications that fit the action (`complication(ctx)`), the retry locks (`lockKey`, `isLocked`, `lockFor`, `lock`, `clearLocks`; a set in `meta.lastRollKey`), `threat(npc)` and `fightDamage(tier)` |
| `Tables` | minor location / item / complication / weather from `TABLES` via `Rng`; `price` (with the player's own factor). No person maker |
| `State` | `newGame(town, character)`, `apply(diff)`, `snapshot()`, `restore()`, the undo and redo stacks (`undoSteps`, `redoSteps`, `undoRecord`, `resumeUndo`), helpers like `npcsAt(locId, phase)`, `entityById(id)`, `reputationTier()`; the calendar (`season`, `weekday`, `dateLine`, `isClosed`, `isBanned`), `restQuality`, `obligations`, `tickObligations`, `expireDaily`, `news` |
| `Town` | loads `TOWN_DATA` into state at new game; plausibility check for `new:` targets by location type; who people mean (`matchExisting`: names, roles, tags, kin words, titles); `resolveLooseEnd` (the obligation onto the seed) |
| `World` | world tick (clocks with `requires`/`alt` and news, missed obligations, schedules, grudges and favours, town events and the epilogue, a new morning's weather, conditions and drift), seed firing, `applyEffects`, `fillEffects`, `knockDown`, `arrestPlayer` |
| `Style` | banned-phrase and length checks, hard and soft problems, invented names |
| `Api` | real provider and mock provider behind one interface: `parse(packet)`, `narrate(packet, onDelta)`, `bookkeep(packet)`, `chronicle(entries)`; usage accounting (1-hour cache writes); timeouts, `abort()`, retries, `checkKey()`, `prewarm()` |
| `Pipeline` | the 13 steps of SPEC.md section 6; the status listener, `abort()`, the one-deep queue, the card game, `/recap`, the epilogue turn |
| `Storage` | autosave (and the previous autosave), slots, export, import, settings and presets (key storage per SPEC.md section 13), the second-tab guard, the undo stack kept in IndexedDB |
| `UI` | rendering, feed, panels, sheet, screens, autocomplete, the ⋯ actions, the status line |
| `Commands` | the `/` commands |
| `App` | boot, screen routing |

## Milestones and who builds them

Agents do not commit. The coordinator reviews and commits after each
milestone so every milestone is a checkout-able state.

1. **Shell** (agent A, parallel with content): layout, themes, feed, input,
   side panel and mobile sheet, title / settings / load-save screens,
   `Storage` with export and import, `State` with full validation, `Rng`,
   `Dice`, `Tables`, character creation. Uses a small placeholder
   `TOWN_DATA` and `TABLES` that follow the contract exactly.
2. **Content** (agent B, parallel with shell): `content/town-data.js`
   defining `TOWN_DATA`, `TABLES`, `BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`,
   `GRUDGE_TEMPLATES`, `FAVOUR_TEMPLATES` per SPEC.md section 4 and 5 and
   the contract above, plus `content/validate.cjs` that checks every
   cross-reference.
3. **Pipeline + mock API + real API** (agent C): inline the content, build
   `Api` (mock and real), `Pipeline`, `Style`, `Commands`.
4. **Living world** (agent D): `World`, seeds and due events, grudges and
   favours, rumours, chronicle compression, debug view.
5. **Polish** (agent E): acceptance tests from SPEC.md section 14 as
   Playwright tests in mock mode, 30-turn scripted playtest, mobile checks,
   README.

## Deviations from SPEC.md (deliberate)

- API version header is `2026-10-21`, not `2023-06-01` (docs/API_NOTES.md).
- JSON comes from structured outputs, not forced tool use, because forced
  `tool_choice` is rejected on Sonnet 5.5 and Opus 5.5 and the models are
  user-editable.
- `max_tokens` are larger than the spec's because thinking tokens count
  toward them; narration length is enforced by prompt and style check.
- All milestones are built in one session with a commit per milestone,
  instead of pausing for manual testing between them, because the session
  runs unattended. Each milestone is verified by Playwright tests instead.

## Content notes the engine must honour (from the content author)

The real town is Ommelveer (`content/town-data.js`, validated by
`content/validate.cjs`). Decisions taken there that bind later milestones:

1. Seeds planted by clock effects use `npc` or `location` triggers, never a
   fixed day, because the day a clock completes is unknown.
2. Every clock completion adds its own rumour through `addRumour`. The world
   tick must not add a second one for the same completion.
3. No clock resolves a thread (that would hand out story points for things
   the world did). One clock sets `thr_bridge_charter` to `failed`.
4. Loose-end seeds use `trigger: "day"`; `dayOffset` counts from day 1 of
   the game. The `enemy` loose end has `link: null` and always creates a new
   NPC. `newNpc` fields contain no placeholders. (Superseded by direction
   change 8: every loose end links to the cast and `newNpc` is retired.)
5. Location types are open-ended (the Old Piers are `"riverbank"`). The
   plausibility check must accept unknown types and fall back to a generic
   judgement.
6. Clocks from different factions can contradict (arrest an NPC another
   clock already sent away). `npcStatus` must be a no-op for NPCs whose
   status is already `gone` or `dead`.
7. Flags used by content: `bridgeCharterSigned`, `riverUnwatched`.
   `setFlag` may never overwrite `priceMultiplier` or `weather`.
8. The style-guide example turns in SPEC.md section 9 mention Mara and the
   Crooked Lantern, which do not exist in Ommelveer. Keep the examples word
   for word but introduce them in the system prompt with: "EXAMPLES (from a
   different town; none of these people or places exist in this game):".
9. The dead tally clerk Jouke Feikema is referenced in text only and is not
   an NPC record.
10. Lockett's Ferry (30 Oct 2026, direction change 10). Flags set by
    content: `royceBought`, `royceTurned`, `riverUnwatched`, `coltArrested`,
    `bridgeReportVoid`, `oldBridgeClosed`, `secondInspectionOrdered`,
    `engineerNoShow`, `vadaNewWill`, and from the council meeting
    `councilVoted`, `councilBackedDownstream`, `councilBackedInTown`,
    `bridgeVoteTabled`, `policeDissolutionPassed`, `policeKept`; every flag a
    condition reads is set somewhere (the validator checks). The council has
    five seats: Jolene Overstreet (mayor), Royce Pittman (the swing vote),
    Lamar Haskins, Hollis Byrd and Elbert Gentry. The factions run 5
    (police), 6 (Sturdivant) and 8 (Night Run) segments a clock, and a
    completion never adjusts its own faction's clock. Seeds may carry
    `effects`, `requires`, `alt` and `notBeforeDay`, and a location trigger
    may name several places (the tackle box). Tags read by rules: `elderly`,
    `teen`, `tough`, `police` and `gossip` (`armed` and `frail` too, though
    nobody carries them yet); `council` marks the five seats for people only.

## Setting change: modern day (owner direction, 27 Oct)

The owner wants the game set in the present day, not a fantasy era: modern
but not futuristic. This supersedes the "grounded low fantasy" line in
SPEC.md section 4. Everything else in the spec stands. Ommelveer is being
replaced by a modern town written to the same data contract.

What "modern" means here:

- A real-feeling small town of roughly 800 people today: phones, pickup
  trucks, a gas station, a bar, a motel, a church, a police station, a
  trailer park, a marina or boat ramp, a highway out. The river crossing
  stays as the town's reason to exist (an ageing bridge, a ferry, a boat
  ramp, whatever the author chooses).
- No supernatural. People tell stories about the river; nobody credible
  has seen anything. That replaces "magic is rare and rumoured".
- Cell signal is patchy in the valley, so business is done face to face.
  That keeps the game's present-NPC model honest without hand-waving.
- Money is cash in dollars. The state field stays `player.gold` and the
  bookkeeper field stays `goldDelta` (no engine churn), but every label the
  player or the model sees says cash / dollars. `TOWN_DATA.currency =
  { symbol: "$", name: "dollars" }` drives the UI label.
- Mature themes, violence and crime are fine (SPEC rule 7). Smuggling,
  debts, affairs, small-town corruption are the stuff of it. Nothing
  glamorising; keep it grounded and consequence-driven.

Engine adjustments to make when the modern town is swapped in:

1. Location types are modern (`bar`, `diner`, `gas`, `motel`, `church`,
   `bighouse`, `garage`, `police`, `trailerpark`, `highway`, `marina`,
   `pawn`, `hall`, ...). The `arrested` status moves NPCs to the location
   of type `police` (accept `watch` as an alias). `Town.plausible` needs
   modern vocabulary (bartender, mechanic, deputy, clerk, trucker ...).
2. The mock parser's keyword rules use modern nouns too (`bartender`,
   `waitress`, `clerk`); "dragon" stays as the implausible test case.
3. The three example turns in the narrator prompt are rewritten as modern
   scenes with the same shape and length (a creditor in a bar; a failed
   lock pick on an office door seen by a kid; a mechanic who won't talk).
   The style guide itself stays word for word.
4. UI: top bar and Character tab show cash with the currency symbol.
5. Tests read ids and names from `Game.data`, never hardcoded town names.

## Direction changes (owner, 28 Oct)

The owner: "I want it more casual, like the writing is too 'novely' for me in
a bad way. Also, it would be good to have a separate action or talking thing.
Because if I type 'run away' I can mean I run away or I tell them to? And when
talking, I can direct it to one person or all."

1. **Casual narration by default; literary kept as an option.** Settings
   gains Narration style (`settings.narrationStyle`: `casual` default, or
   `literary`; no settings version bump). `STYLE_GUIDE` becomes
   `STYLE_GUIDE_LITERARY` (SPEC.md section 9, word for word) and
   `STYLE_GUIDE_CASUAL` (same sections, NEVER rules and banned list; a plain
   table-talk VOICE; similes, stacked adjectives and poetic fragments added to
   "Also avoid"). `EXAMPLE_TURNS` becomes `EXAMPLE_TURNS_LITERARY` and
   `EXAMPLE_TURNS_CASUAL` (same three scenes, plain register; both checked by
   `tests/validate-town.cjs`). `Style.systemPrompt()` picks by the setting
   and is byte-identical per style. `Style.check` adds a casual-only check for
   "like a" / "as if" outside dialogue, under the same regenerate-once rule.
2. **Do / Say input modes with an addressee.** A Do | Say toggle sits left of
   the input (remembered per browser as `settings.inputMode`). Say mode shows
   chips above the input: Everyone plus each NPC present, one pressed (the
   only person present, else Everyone; a pick lasts only while the player
   stays put and is never saved). A Do line that is only a quote is sent as
   Say (`Pipeline.spokenWords`). The parse and bookkeeper packets carry
   `MODE: do` or `MODE: say, to npc_x (Name)` / `to everyone present`; the
   parser's system prompt gains two sentences (MODE, and running off with no
   place named is a move). The engine keeps Say social, aimed at the
   addressee and in place (`Pipeline.sayAction`; a bookkeeper move is
   ignored); a Do move that says running with no place goes out the first
   open exit. The narrator gets `PLAYER SAYS (to Name): "words"` and a rule
   line instead of ACTION; in Do mode ACTION is followed by "The player did
   not say anything beyond what the ACTION line states." Log entries keep
   `mode`, `to` and `toName` (through /undo, saves and the chronicle; entries
   without them read as Do), and the feed shows `“words” — to Name`.
3. **Places people tell you about become real places** (owner: "After he says
   that, white house (or Dewayne) should unlock on the map"). The bookkeeper's
   `record_changes` gains `placesRevealed` ({ name, type, description, nearId,
   ownerNpcId, kind }); `State.apply` validates it (no duplicate by name, a
   known `nearId`, one a turn from the model, 12 a game) and makes a
   discovered location with exits both ways, `map` coordinates chosen once
   beside `nearId`, and a `revealed` record; a home holds its owner in the
   phases no schedule does. The map draws it dashed ("Heard of") until the
   first visit. Rules version 3 adds the same to older saves from their log.
4. **The clock follows the story** (owner, 29 Oct: "The day night cycle thing
   isn't context aware. Change that and update it so it's not morning yet.").
   Night holds until the player sleeps: a short never crosses from night into
   morning. When the shorts would roll over at night the clock stays at night
   with shorts 2 and `time.late = true` (cleared on any phase change), and
   nothing ticks. Morning comes with `/rest`, a long action (`/wait` and
   `/skip` pass longs) or a defeat; a new day starts at shorts 0 and, reached
   without a rest, sets `time.noSleep` (a rest clears it). The narrator and
   bookkeeper packets say where in the phase it is
   (`DAY 1, NIGHT (late; the player has not slept)`: early / mid / late from
   shorts 0 / 1 / 2, "no sleep last night" on such a morning); the parser's
   TIME line adds the part and `parse_action.timeCost` describes the costs.
   `/cheat time <phase> [day]` sets the clock through the engine-only
   `setTime` (no tick, one `/undo` step). Rules version 4, "Clock follows the
   story" (rerun), asks the parser model whether an older game's last six
   turns are still earlier than its clock and sets it back, never forward. A
   `/skip` that names the current phase now arrives in it with no time passing.
5. **People match the story** (owner, 29 Oct: "Dewayne referred to Mavis as
   'she' but I corrected him to 'he' because it says it is a man. But he said
   he has a wife. And now Mavis says that they are his wife. But the people
   sheet says man."). Root causes: NPC records had no pronouns; people the
   narration named entered state only when the player targeted them; and the
   tables made them with no regard for the story. Now every NPC record has
   `pronouns: "he" | "she" | "they"` (all 15 in `TOWN_DATA`, checked against
   each look by `tests/validate-town.cjs`; the tables, loose ends and
   `addNpcs` set it from the role, the look, then the first name; a save
   without it is filled once at load, `State.fillPronouns`). The narrator's
   person line carries it right after the name (`Mavis Toler (she/her;
   ...)`), as do the parser and bookkeeper packets and the People card.
   Engine-made people carry `created: { turn, day, by, relationToNpcId,
   relation }` (`by`: story, tables, context, loose_end, fact).
   `record_changes` gains `peopleRevealed`. The bookkeeper sends the compact
   entry { name, pronouns, relationToNpcId, who } (the API compiles each
   structured-output schema to a grammar with a size limit, and
   `record_changes` sits right at it: 46 properties pass, 47 are refused as
   "compiled grammar too large", so a field added anywhere in it needs a
   live probe first); `State.apply` reads it into the long form { name,
   unnamed, pronouns, role, look, relationToNpcId, relation, locationId,
   kind } (`State.splitWho`: the relation word first, the rest becomes the
   role; a name with no proper name in it is unnamed), which the engine and
   the tests may send as is, with the discipline
   of `placesRevealed`: `State.apply` validates it (name 2-40, pronouns, a
   known relation target and place; no duplicate by name, `State.samePerson`,
   or by the same relation to the same person), one a turn from the model,
   12 a game; an unnamed one ("Dewayne's wife") is renamed in place when a
   later entry names her with the same relation; a household relation shares
   the relation's home (a revealed home taken later moves them in), anyone
   else is off-screen until met and comes to the door when asked for where
   they live or work. The feed says "Added to People: Mavis Toler
   (Dewayne's wife)." only once they have a name; People lists them under
   Heard of. A `new:` person the player targets is made, with the real
   provider, by one `create_person` structured call on the parser model (the
   description, the last three turns, everyone, a shortlist rolled from the
   tables; `existingNpcId` reuses someone), checked like the tables' person,
   with the tables as the fallback; the tables path (and mock mode) takes
   pronouns from the description's words, rolls an occupation for a bare
   "man" or "woman" (kept as a tag), keeps a name the description gives and
   reads "X's wife" as a relation to X. Rules version 5, "People match the
   story" (rerun), sends every person made during play whom the story
   mentions, with those mentions, to the parser model (`fix_people`) and
   applies the corrected record through the engine-only `fixPeople`. The
   mentions include up to four lines from before the person was named that
   speak of someone's kin (how they came into the story: "his wife's gonna
   be thrilled"), marked as possibly about someone else; the rule says a
   stated relation outranks the pronouns the narration used afterwards and
   the player's words, because the narration followed the record being
   checked. The player can set anyone's pronouns directly (chips on the
   People card, `/pronouns <name> <pronoun>`, `App.setPronouns`): the
   engine turns a gendered relation, role and tag with them (husband ->
   wife; `genderPhrase`), unless the same fix states those itself.
6. **Edit anyone, fully** (owner, 29 Oct: "Let me edit characters fully",
   after a wife recorded as a man). The engine-only `editPerson` op
   (`ENGINE_KEYS`; `State.apply(diff, { source: 'player' })`, so the debug
   log names the player) takes `{ npcId, name?, pronouns?, role?, look?,
   voice?, personality?, goal?, secret?, attitude?, relationToNpcId?,
   relation?, homeLocationId?, status?, alive?, memories? }` (or a list),
   checks all of it before changing anything (name 2-40 and not someone
   else's by `samePerson`; pronouns; role 1-60; look, voice and goal 200;
   secret 300; 0-3 traits of 30; attitude a whole number clamped to
   -100..100 with no per-turn ledger; a living other person or null for the
   relation, the word cleaned by `cleanRelation`; a known place or null for
   the home; `NPC_STATUSES`; memories as `setMemories`, text refused over
   400) and changes only what differs, reporting `result.edited = [{ id,
   fields }]`. It shares its helpers with `fixPeople` (`personName`,
   `checkMemories`, `turnRelation`, `turnLines`, `setHome`). A null home
   takes them off the home's phases; a place moves them in where nothing
   else holds them. Dead or gone takes them off every schedule (dead: alive
   false); arrested puts them in the cells; free brings them back alive to
   the town's schedule and their home. A relation on someone without
   `created` (a town person) gives them `created { turn: null, day: null,
   by: 'edit', relationToNpcId, relation }` ('edit' is in `CREATED_BY` and
   Upgrade's `MADE_BY`; a town person is never `madeUp`), removed again when
   the relation is cleared. New pronouns, through `editPerson` or
   `fixPeople` (the chips), now also turn the look and voice lines
   (`turnLook`, shared with the mock's people check: person words such as
   man/woman via `genderPhrase` with `LOOK_WORDS`, never kin words; he, him,
   his, himself and the she forms, and the they forms only from they; the
   verb after a subject that changes number; quoted words untouched),
   unless the same change states them. The narrator's person line adds who
   someone is to whom when the role does not already say it
   (`State.relationNote`), as does the card's role line. UI: every People
   card has **Edit** beside the pronoun chips (off, with a title, while a
   turn runs); it swaps the card body for a form (name, pronouns, role,
   look, voice, three trait fields, an attitude slider with
   `State.attitudeWord`, related-to select and relation, home select,
   status, memory lines with weight and Remove plus "Add a memory", and a
   `<details>` "Hidden from you: goal and secret"). Save sends only what
   differs from the values the form opened with to `App.editPerson`: one
   snapshot, one `editPerson`, the snapshot dropped when nothing changed,
   restored on a refusal (the reason in the feed and above the buttons, the
   form kept as typed); a quiet line "Edited Mavis Toler: pronouns, role,
   home." Escape cancels; Enter in a one-line field does nothing. The draft
   survives re-renders. `/edit <who>` (after `/pronouns` in the list) opens
   it.
7. **What people know, and unreadable replies** (29 Oct 2026). On day 1
   an NPC told the player "I've known a while" and "he called me last
   night": the narrator was never told how long the player had been in
   town or what anyone could know. Every narrator packet now carries a
   `WHAT PEOPLE KNOW` line (`Pipeline.knowledgeLine`): the player came to
   town on day 1 (today, yesterday, N days ago) and was a stranger before;
   each person knows only their own memories and what happened in front of
   them. On day 1, `Style.check` (given `day`) flags a quoted line to the
   player that claims a past (`Style.inventedPast`: last night, known you,
   a while now, since you came) and the rewrite note says why. A reply the
   game cannot read (a narrator body that is not JSON, a structured reply
   that does not parse, a non-JSON body) is asked for once more before the
   turn fails with "The API sent a reply the game could not read".
8. **A full cast, written by hand** (owner, 29 Oct 2026: "So since this has
   characters, I want you to create all of them and proper. Don't let the
   AI in game make them cz it is messy."). The game had made people up on
   demand (the tables when the player asked for someone, the
   `create_person` call, the bookkeeper's `peopleRevealed`), and it went
   wrong: a wife built as a man, put at the gas station, with no voice.
   Now every person who can appear is in `TOWN_DATA.npcs`: 41 people (the
   15 of the town plus their households, the staff and regulars of each
   place, a dispatcher and a third officer, a teacher, a farmer and his
   family, an old-timer, three teenagers, the people the loose ends need),
   each with `relations` ([{ npcId, relation }]: "npcId is this person's
   relation", written on both sides, words from the engine's relation
   lists) and a `home` (a location id; in state `{ locationId, phases }`,
   the phases the schedule has them there), and a place in every phase.
   The 8 homes the town lacked are locations of a dwelling type with
   `discovered: false`; `TOWN_DATA.offstage` ([{ name, about }]) names the
   people the story may mention who never appear (Amber Lott, the bridge
   engineer). `tests/validate-town.cjs` checks the cast (40 to 45 people,
   symmetric relations whose words answer each other and match the
   pronouns of the person they describe, everyone somewhere every phase,
   unique names, no role that is only "man" or "woman", homes that exist
   and that they are at, undiscovered homes reached from a discovered
   place, loose-end tags carried by two people or more); `docs/CAST.md` is
   the roster, written by `tests/cast-doc.cjs` and checked by
   `tests/content.test.cjs`.
   - **Nobody is made in play.** A new game has `meta.castFixed: true`.
     Step 4 resolves a `new:` person through `Town.matchExisting` (a name,
     a role, a one-word job, "Dewayne's wife" read through the cast's
     relations) and otherwise marks them NOT PRESENT, `does_not_exist`
     ("nobody like that lives in this town"); that holds for every game,
     one not yet updated too (`createPerson`, `tablesPerson`,
     `contextPerson`, the `create_person` schema and `SYSTEM.person` are
     gone). A `/fact` cannot add a person either. Loose ends bind to the
     cast: `LOOSE_ENDS[kind].link = { tag, optionTags? }` (`newNpc` is
     retired); the option the player kept picks the tag (a note sold to
     someone here is the repo man, a lost bet is the man who runs the card
     game), then the kind's tag, then anyone free. `peopleRevealed` is out
     of `record_changes` (41 properties now, under the grammar limit of
     46) and of the bookkeeper's prompt and the mock; `State.apply` keeps
     the op for the engine and refuses the model's with "the cast is
     fixed". The parser is told that everyone who exists is listed (its
     packet gains `EVERYONE ELSE IN TOWN`) and never to use `new:` for a
     person.
   - **The narrator gets the cast.** `Api.narrate` sends two cached system
     blocks: `Style.systemPrompt()` (unchanged, byte-identical per style)
     and `Pipeline.castBlock()`: "CAST (everyone who exists in this town;
     never invent anyone else):", one line per person (`id — Name
     (pronouns; role; wife of X, employee of Y; usually at Z (phases);
     home: W)`), the rule that anyone mentioned is one of them or does not
     exist, and the offstage names. It is built from the records only, so
     it changes only when the cast does (an edit, a merge, an arrest) and
     the cache holds. A person line in the packet shows their people
     ("wife: Mavis Mangum"); the People card adds a Ties note.
   - **Homes to find.** A `placesRevealed` entry that names a home the cast
     has written (by name or map label, as the owner's home, or as the
     home of the person whose name it carries: "Dewayne's house") discovers
     that location, with the same `revealed` record and dashed "heard of"
     marker, instead of making a second one; a home for a town person who
     already lives somewhere known is refused. The parser's exits, the
     flee exit and the bookkeeper's and re-read's place lists leave
     undiscovered places out.
   - **Rules version 6, "A full cast"** (rerun). `Upgrade.fullCast`, with
     no model call: `addCast` (every person and place missing by id, homes
     undiscovered; the game's town copy takes them in), `recastPeople`
     (someone made up under an id the cast now has keeps their history and
     takes the cast's record), `mergePlaces` (a told home folded into the
     cast's: "Dewayne's house is the Mangum House"), `mergePeople` (a
     made-up person onto the cast member they were, by relation, by name,
     or by first name and role: knownToPlayer, attitude, memories and every
     reference move over, the made-up record goes), `castSchedules` (the
     cast's schedule wherever someone is nowhere) and `castFixed`. Anyone
     nobody matches is kept and named in the summary. `Upgrade.madeUp`
     treats cast members as town people.
9. **A lived-in town** (owner, 29 Oct 2026: "Add everything in the
   database like locations, all the characters, even if only mentioned by
   name. Make the character sheet better too, like some have an age some
   don't. Have the age next to the name for example, and make the world
   lived in.").
   - **Everything mentioned exists.** `TOWN_DATA.npcs` is 66 people: the
     41 who appear (`presence: "here"`), 17 who live elsewhere
     (`presence: "away"`, `alive: true`, `status: "gone"`, `where`,
     `reach`, `home` an out-of-town place or null) and 8 dead
     (`presence: "dead"`, `alive: false`, `status: "dead"`, `died`,
     optional `buried`, `home: null`). `offstage` is gone from the data (a
     save's copy is still read: its names stay in the cast block). The
     dead and the away are never in a schedule, never PRESENT, never
     brought by a visit, and a `new:` person or a name that is one of them
     resolves to them as NOT PRESENT with why (`absentNote`). Named in the
     narration (full or first name), they become known to the player and
     the People tab lists them under Elsewhere or Gone. `TOWN_DATA.locations`
     is 38 places: 15 public town places on the map (Front Street, Riverside
     Cemetery, the Water Tower, the Bluff and the River Road are new), 8
     homes to find, and 15 out of town (`away: true`, `distance`, no map,
     `exits: []`, `discovered: false`, empty schedules). An out-of-town
     place is never a destination, never `playerLocationId`, never visited
     and never a home the bookkeeper finds: a move there is refused before
     anything is spent, with a plain line ("Clayburn is out of town
     (...). The story stays in Lockett's Ferry: you can talk about it, but
     you can't go there."). `tests/mentions.cjs` scans every content string
     for capitalised names and "the <kind of place>" phrases with no
     record (a short ALLOW list: titles, the calendar, Bible, Army, Civil
     War, Christmas, Room); `tests/validate-town.cjs` runs it.
   - **Ages.** Every person has `age` (0 to 120; the cast's fit their look
     and their family: parent 16 to 60 years older, grandparent 32 or more,
     spouses within 20, siblings within 25) and `history` (two or three
     sentences, 400 characters at most). `BACKGROUNDS[].age` is the
     default player age (veteran 34, dropout 19, fired bookkeeper 38, river
     deckhand 36, group home kid 18, poker hustler 31); creation asks for an
     age on the background step (`State.playerAge`, 16 to 90) and stores
     `player.age`. The age shows beside the name on the Character tab and the
     summary ("Tomas Reed · 34", with the background's blurb), on People
     cards ("Mavis Mangum · 41" then pronouns), in the cast block and every
     person line ("Mavis Mangum (41, she/her; ...)"), on the narrator's and
     parser's PLAYER lines and in `docs/CAST.md`. The People editor gains Age
     and History (`editPerson` refuses an age outside 0 to 120 or not whole;
     blank clears it). A save with a bad age or history loads without it.
   - **A lived-in town.** `TOWN_DATA` gains `year` (2026), `history` and
     `recent` ([{ when, what }], eleven events from January 2024 to September
     2026); every place gains `details`, `hours` and `history` (and optional
     `aka`, its other names). The narrator now sends three cached system
     blocks: the style guide, `Pipeline.townBlock()` (THE TOWN: HISTORY,
     RECENT, PLACES with history and hours, OUT OF TOWN) and
     `Pipeline.castBlock()` (everyone here with age, pronouns, role, ties,
     usual places and history; then NOT IN TOWN, the dead and the people
     elsewhere one a line). About 11,500 tokens cached in all (words x 1.4;
     the api suite fails over 12,000). The packet gains a PLACE line (what
     you notice, when it is open). The People card's open section shows
     Age, Home (or Lives, Reach, Buried), Ties and History; the Places tab
     lists the places you know and the places out of town, each opening to
     a sheet (how far, inside, hours, history, who lives, works, drinks or is
     buried there, who is here now).
   - **Rules version 7, "A lived-in town"** (rerun, no model call).
     `Upgrade.livedInTown`: `addCast` for every person and place missing by
     id, the cast's schedules for the people added, then the engine-only
     `livedIn` op, which fills ages, histories and the presence fields of
     people from the town data, places' details, hours, history and aka,
     ties written on both sides, and the player's age from their
     background, never overwriting what the game already has. It says what
     it did ("Added 25 people the story names (8 dead, 17 living
     elsewhere) and 20 places (5 in town, 15 out of town). Filled in ...")
     or "The town is already lived in."; `/undo` takes it back.
   - **Only what you carry** (owner, 29 Oct 2026: "I stabbed someone
     successfully but I didn't have a knife in my inventory."). The
     narrator packet carries `CARRYING: <items with qty>; <money> (nothing
     else: no weapon, tool, phone, keys, car or money beyond this).` right
     after PLAYER, every turn. `parse_action` gains `missingItem`
     (nullable string: a thing the action needs that is not in INVENTORY
     and not lying here; `usesItemId` stays for a listed item), and
     `SYSTEM.parser` one sentence about it; the bookkeeper's schema is
     unchanged. When the parser names one and nothing carried or lying here
     answers to it by name (`Pipeline.carriedAs`: a folding knife is a
     knife, car keys a car), the narrator packet gets `NOT CARRIED: a knife.
     The player has no knife and nothing like one; they cannot stab or cut
     anyone. Narrate what they can do without it (bare hands, bluff, or
     realising they have nothing), and nothing happens that needs it.` and
     the bookkeeper packet the same fact (record no use of it). The turn is
     not refused and no call is added; the roll stands with no item bonus
     (an attack is bare-handed), and the debug log records the missing item
     (`path: "missingItem"`). When something carried does answer to it, it
     becomes `usesItemId`. The mock parser sets `missingItem` for stab,
     knife, shoot, gun and drive with no matching item.
10. **The approved review** (owner, 30 Oct 2026). Six reviews of the code at
    8c11bad were consolidated into one the owner approved: the narrator did
    not know the story (goals, loose ends, threads, what the clocks did), the
    living world talked to itself, actions did not bite, the first five
    minutes misled (the demo was the default), and robustness had holes (no
    timeouts, truncated turns saved, autosaves overwritten). Six agents fixed
    it in parallel, one area each, to written contracts between the areas,
    and an integration pass joined the seams. Each area's full notes are in
    `docs/notes/` (`content`, `engine-world`, `engine-state`, `prompts`,
    `transport`, `ui`), each ending with what changed at integration. The
    shapes are in "Shared data contract" above. Rules version 8.
   - **Content.** The calendar (`TOWN_DATA.calendar`; day 1 is Thursday 8
     October 2026), `closedOn: ["Sunday"]` on the Low Water and Byrd's Pawn,
     school days (`awayOn`) for the teacher and the three teenagers, and
     people put where their own text says they are. Facts that agree (prices,
     dates, the river road, a five-seat council). Nobody made up in any
     string (`tests/mentions.cjs` gains a `NOBODY` list of made-up crowds).
     Every loose-end option binds by its own tag to the person it means and
     carries an obligation (`obligation`, `obligations[i]`, `onStart` for the
     letter). Every background has a prepaid phone and a `hook`. 13 grudges
     and 12 favours with `effects`, `public`, `forTags` / `notForTags` (new
     tags `elderly`, `teen`, `tough`, `gossip`). Clocks of 5, 6 and 8
     segments with `requires` / `alt` and `clockAdjust` reactions; seeds with
     `effects`, `requires`, `alt`, `notBeforeDay` and a list trigger. The
     council meeting (`TOWN_DATA.events`: day 6, evening, Town Hall, six
     attendees, seven branches and a default, the police dissolution as item
     four in every branch) and the epilogue (day 21 or `oldBridgeClosed` /
     `secondInspectionOrdered`, five branches and a default). 20 rumours with
     `tellerIds`, `threadId`, `factionId`; thread `reward`s; goods `kind`s;
     `GOAL_PRESETS`. `TABLES.npc` keeps `firstNames` and `occupations` only.
   - **Engine state.** The 13 new effect ops. `State.season`, `weekday`,
     `dateLine`, `isClosed`, `isBanned`, `priceFactor`, `restQuality`,
     `obligations`, `tickObligations`, `expireDaily`, `news`, `absentNote`,
     `awayNow`, `laidUp`. The ledger in `player.obligations` (ids
     `obl_<kind>_<npc id>`; settled by an engine op, by the bookkeeper's
     `obligationsSettled` with the person present, or by paying or handing
     over in play). Time: `advanceTime` takes `{ cost, toPhaseStart?, cause?
     }`; `/wait` and `/skip` land at shorts 0; six instants make a short
     except when the cause is `rest`, `wait`, `skip`, `arrival`, `defeat`,
     `arrest` or `epilogue`; a sleepless morning adds Tired (`-1 all`,
     until a rest); a rest heals 3 in a bed, 1 rough with Stiff (`-1 might`)
     for the day; a defeat is not a sleepless night. The bookkeeper's diff is
     capped (see above) and gains `npcFates`, `memoriesSettled`,
     `obligationsSettled`. A story point only on a thread's first resolution
     (`resolvedOnce`), with progression: +1 to `thread.reward` (at most +3),
     else +2 max HP (at most 16), in `player.progression`. The dead leave
     every schedule. `validateShape` is deep with string caps and checks the
     town too; snapshots hold `State.town`; `load` returns `{ state,
     rulesVersion, newer }`. Engine keys `expireDaily`, `newsSeen` (`true`,
     or `'public'` for what "Overnight in town" told) and `eventsFired`.
     `RULES_VERSION` is 8.
   - **Engine world.** Conditions count sign and size (`"+2 might"` is +2;
     words with no number count nothing). The retry lock is a set of keys:
     the action's family (talk and persuade `ask`; buy, sell, give `deal`;
     deceive `lie`; intimidate `threaten`; attack `fight`; sneak, steal
     `sneak`; search, look `search`; `take`; the rest `handle`), its targets
     and item, at that place, day and phase; an attack on someone still
     present has no key. `Dice.threat`, `Dice.fightDamage` (partial 1,
     failure 1 to 3, fumble 3), `Dice.complication` (20 object entries that
     fit the action's kind, the tier and who is present; five carry
     effects). `Dice.successes` and `Dice.diminishing` (1, ½, ¼, then 0) are
     there for repeated asks, but nothing calls them yet (see the
     transport bullet). Who people mean: `Town.matchExisting` reads tags, kin
     words ("Colt's dad"), titles ("Mrs. Pittman") and words like cop,
     preacher, kid, old man; `guessKind` and plausibility read the head
     noun; a 13th made place is refused. World honours `requires` / `alt` on
     seeds and completions, applies seed and template effects through
     `fillEffects`, makes every completion news, fires town events (the
     attendees come for that phase; a scene when the player is there) and
     the epilogue once (`flags.epilogueShown`), ticks obligations each
     morning (a missed one is private news and a due event that brings the
     person), plants a grudge or favour from the templates whose filters fit
     (one per memory, none for 7 days after one fires, +10 when a grudge
     fires), drifts attitudes 2 a day toward the town's starting attitude
     without a fresh weight-3 memory, reads `State.season()` for the weather,
     and has `knockDown` and `arrestPlayer`. `Tables.npc()` is gone;
     `ACTION_TYPES` has `gamble`.
   - **Prompts.** The narrator packet runs oldest to newest: STORY SO FAR
     (the chronicle, up to 400 words of whole day-stamped entries), EARLIER
     (the last ten journal lines), LAST 3 TURNS, the clock line with the
     date (`DAY 2 (Friday 9 October), EVENING (late)`), PLACE, PLAYER with
     goal and flaw, a CARRYING line derived from what is carried, PRESENT
     with traits, `wants` and loose-end ties, WHAT PEOPLE KNOW (its rules
     moved into the cached style block), LOOSE ENDS, OPEN (threads and
     obligations), TOWN NEWS (the last five public items; the cached town
     block says TOWN NEWS wins), DESTINATION saying why a place is shut,
     THEN for a walk after the action, TIME THIS TAKES, PLAYER TYPED, and
     `MODE: epilogue`. Secrets only for `ctx.revealSecretFor`. `Style.check`
     marks each problem hard or soft and catches names the town does not
     have; the rewrite note leads with the hard ones. Eight casual example
     turns written in the packet's field format. The parser gets LAST TURN,
     a difficulty and stat rubric, `moveWhen`, `aboutIds` and `gamble`; the
     bookkeeper a field rubric, each present person's last three memories,
     the running clocks, thread clauses, open obligations and news.
     `record_changes` has 45 properties: the three new fields add seven, so
     `attitudeChanges[].reason`, `newSeeds[].cause` and the nested
     `newSeeds[].trigger` (now flat `triggerType` / `triggerValue`) were
     dropped. A live grammar probe is still owed. Rumours spread through
     `tellerIds`, the `gossip` tag and households. The mock plays like a
     demo.
   - **Transport.** Every call runs under an `AbortController`: 45 s idle on
     streams, 120 s on JSON calls, and `Api.abort()` behind Stop. One retry
     on 429, 500, 502, 503, 504, 529, a network error, a timeout, a broken
     stream or a mid-stream overload, after `retry-after` (at most 10 s) or
     1.5 s. A `max_tokens` stop retries once at twice the limit and is never
     committed; the narrator's `max_tokens` follows its effort (2000, 3000,
     6000). `cache_control: { type: 'ephemeral', ttl: '1h' }` on the
     narrator's three blocks, writes priced at 2x from
     `usage.cache_creation.ephemeral_1h_input_tokens`, `prewarm` after 50
     minutes; `checkKey` (`GET /v1/models`) and `validKey`. A narration is
     rewritten only for a hard problem, as an edit of the draft, which stays
     on screen. A bookkeeper failure keeps the narration (`changes: 'not
     recorded'`, one retry in the background). The chronicle runs after the
     turn is saved, once the log has 16 entries, keeping 6.
     `setStatusListener`, `abort`, `acceptsQueue` and a one-deep `submit`
     queue. A `new:` item an action rolls for is made only when the roll
     succeeds (a failed search finds nothing); narrated due
     events are bookkept on `/look`, `/rest`, `/wait`, `/skip`; scene
     changes are shown the turn after they happen; a defeat is not charged
     its action's time. Shut doors (`closedOn`, bans) wherever a walk
     happens; `/skip to X at <phase>` walks first. The card game, fights
     (`state.fight`, written directly inside the turn's snapshot; the third
     hit knocks down; police present arrests), `revealSecretFor`, `/recap`,
     "Overnight in town", the epilogue turn, "Cheat: success". The Pipeline
     stores the retry lock through `Dice.lock`, which locks a social roll
     that succeeded as well as one that failed; `Dice.diminishing` is not
     applied. Upgrade stamps each step as it completes and keeps the ones
     that worked, never cuts memories within `MEMORY_MAX`, refuses a newer
     save, and adds version 8, "An arc". The CI workflow.
   - **UI.** The demo is no longer the default (`settings.playChoice`; the
     choice view; the demo bar; a chip on the title; entering a key turns
     the demo off). The title puts the buttons first. Creation is five
     steps on a phone with Random character, stat steppers, goal suggestions
     and loose-end chips; a first-turn tip. The status line, Stop and
     Queued; Enter on an empty box does nothing; the phone Say row with its
     "To:" picker; the ⋯ actions; quiet lines kept on their log entry
     (`notes`); attitude band lines. The Journal's five sections; People
     search, sort and folded groups; map labels that avoid each other, Go
     there and Expand map; closed and banned places; Character standings,
     Spend and Grown; Debug's news, obligations, bans and events. Settings
     presets (Thrifty, Standard, Best; the rest under Advanced), Check key,
     the session line and the warning beside Remember. Saves: the previous
     autosave, asking before replacing an unslotted one, drawing a loaded
     game before saving it, the second-tab guard, the newer-save banner, the
     5 MB import cap, the damaged autosave's download. A content security
     policy (`connect-src https://api.anthropic.com`). Focus moves to each
     screen's heading, the phone sheet is modal, the tablist takes arrow
     keys, streaming stays out of the live region, and `--faint` meets
     4.5:1.
   - **Left open** (from the first integration pass; wave 2 closed all but
     the last two): a due event can be narrated
     many turns late after a string of `/rest` (two a narration); a town
     event the clock jumps over (`/cheat time`) fires late with its "on
     Tuesday" text; `state.fight` has no op; `State.obligationEffect`, which
     Upgrade asks for, does not exist (its fallback builds the same effect);
     the live grammar probe for `record_changes`; no recorded live opening
     scene for the demo.
   - **Wave 2** (30 Oct 2026). A QA playtest of the merged wave (20 bugs),
     a second code review (10 bugs, state written outside `State.apply`,
     risks) and a visual, mobile and accessibility QA (15 defects) were
     fixed by three agents in parallel (engine, UI, content with the mock),
     then joined by a second integration pass. Notes: each `docs/notes/*`
     file's "Wave 2" section; tests: `tests/wave2-fixes.test.cjs`, the area
     suites and `tests/integration.test.cjs`.
     - Rolls and asks: a success locks nothing (`Dice.lockFor` stored
       through `State.apply({ lastRollKey })`); the same ask that already
       worked this phase earns half, a quarter, then nothing
       (`Dice.diminishing` scales the bookkeeper's positive attitude
       change); a second gift to someone in a day earns none (`meta.gifts`);
       complication effects are applied; an attack or plea at someone not
       here rolls nothing; the witness complication reads "will know your
       face from now on".
     - Fights: one fight is the same person and place, attack after
       attack, across a phase change (`state.fight` through `State.apply`);
       the third hit's knockdown and an arrest are told in that turn's
       narration (OUTCOME, ARREST; TIME THIS TAKES says the night in the
       cell) and never again the next turn.
     - Things: a take of anything not lying here makes nothing; guns and
       ammunition, boats and vehicles only where they fit, explosives
       nowhere; "X and a Y" is two things; `/reroll` and `/cheat` replay
       the action as parsed.
     - Time and the town: three due events a turn and all of them on
       `/rest`, `/wait` and `/skip`, told where the player now is (the
       person comes there); DESTINATION shows the phase a walk lands in;
       one news item per town event, not retold overnight once watched; an
       event the clock jumped over is news only, and one slept through is
       dated when it happened; a place shut today holds only its residents,
       has no card game and is a rough night; `/skip` refuses a place shut
       on the day of arrival.
     - Obligations: paid over several turns (`paid`; a payment to the
       person may pass the $500 cap up to what is still owed); a missed one
       stays owed and is met late with its `onMet`; content's `missText` is
       the miss's due event and `owedTo` the person owed (`askerId` read as
       the same), who comes looking only when free and in town; an errand
       already done is met as it is made; the Journal keeps a missed one
       still owed with the open ones.
     - Content: the council counts who is free (each voting branch names
       its voters in `npcFree` and has a twin for Hollis Byrd's empty
       chair), leans toward the player's levers (Royce at 30, Curtis paid,
       a bought Royce at 20) and has an attendance branch (`playerAt:
       "loc_town_hall"` with Royce at 15; World's conditions and both
       validators read `playerAt`, true at the tick that fires the event,
       after any walk or `/skip` into it, false for a phase slept through);
       the ending settles the bridge and police threads and plants two or
       three aftermath seeds (days 21 to 30); the big run waits on the
       boats; loose ends are told to "you", hooks name the player.
     - Turn lifecycle: a late bookkeeper retry applies only while its turn
       is the newest and never moves the player; Stop while the town is
       updated keeps the narration (not recorded, no retry) and puts a
       queued line back in the box; the ending is seen only once its own
       turn commits; `Pipeline.canStop`, `cancelQueued` and read-only
       guards on every entry point (one toast, the UI's or the Pipeline's);
       new engine keys `fight`, `logUpdate`, `giftGiven`, `arcFill`;
       `validateShape` type-checks every field the engine reads, the town
       copy too, and numbers written as text load as numbers.
     - Style and the mock: brands and regional words are on the allow
       list, a lone unknown capitalised word is soft and a marked one hard;
       the mock walks to places by name, tells due events to "you", keeps a
       Say reply when people come and go, deals Curtis's Friday game, and
       its memory rewrite keeps `State.MEMORY_MAX`.
     - UI: one guard (`UI.canAct`) for everything that plays; **Play here
       instead** loads the newer game before this tab writes; the phone
       composer keeps its width and the command list spans the row; the
       expanded map is a modal dialog on a laptop too and scrolls a place
       reached with Tab into view; focus is never dropped; parchment text
       at 4.5:1 and control edges at 3:1; the recap is one notice under
       "Where things stand"; "Next: …" with ×; Stop during the town update.
     - Left open: the live grammar probe for `record_changes` and a
       recorded live opening scene (both need a real API call); a rough
       night in a public place costs nothing beyond the HP.
   - **Wave 3** (30 Oct 2026). The second code review (10 bugs, its risks
     and dead code), the second playtest (N1 to N16, D1 to D5) and the
     second visual, mobile and accessibility QA (11 defects) were fixed by
     two agents in parallel (engine with content and the mock; UI), then a
     third integration pass. Notes: each `docs/notes/*` file's "Wave 3"
     section; tests: `tests/wave3-fixes.test.cjs` and the "wave 3" tests
     in `tests/ui-fixes.test.cjs`. A purchase is never a payment, a late
     payment is remembered late, and a loose end's obligation met closes
     its thread; "until Day N" is the day a ban or a hurt ends (welcome or
     about again) in State, the absent note, the People card, the Places
     sheet and the narrator, so an accusation at cards is tonight only;
     narrator-only commands fire what is due first (the morning's visitor
     is in that `/rest`), a long wait is one scene change, and a walk's end
     brings, names and introduces the destination's people; an arrest
     tells nothing else and takes the player's weapons (a grease gun is
     none); searches always roll, fights take the target's threat, one
     "Resolved" line per thread, `/help`; names at a sentence start and
     soft brands, possessive places, the recap's reasons. The UI holds the
     focus on the control that started a turn, puts the banner under
     modals and Undo outside the live region, names place types, lists
     only known exits and fills the view with the expanded map. Left open:
     as in wave 2.
   - **Wave 4** (30 Oct 2026). The third code review (8 bugs, its risks
     and dead code), the third playtest (R1 to R11, D1 to D5 and its
     design notes) and the third visual, mobile and accessibility QA
     (defects A to H) were fixed by two agents in parallel (engine with
     content and the mock; UI), then a fourth integration pass. Notes:
     each `docs/notes/*` file's "Wave 4" section; tests:
     `tests/wave4-fixes.test.cjs`, the "wave 4" tests in
     `tests/ui-fixes.test.cjs` and `tests/integration.test.cjs`. A
     purchase in Say mode is no payment and no gift; a failed ask settles
     nothing with that person; a loose end's thread gives the story point
     only, and the Character tab's Grown line shows each entry's own gain;
     names: an adverb before a known name or what a sign "says" is no name,
     two unknown words the story points at are; a walk that lands in the
     next phase or at the council meeting tells it there, once; thrown out
     of cards onto Front Street; a due event that names a home reveals it;
     memories carry their day, so attitudes drift; grudges answer by their
     template's kind; arrests and what the player carries read a weapon by
     the head of its name; two rough nights in public and Chief Bell moves
     the player on (closing wave 2's "rough night costs nothing");
     `/cheat time` past a town event fires it; an updated game takes the
     town's plans as now written. The UI keeps the focus through layout
     changes, gives a phone on its side room to type, and styles `/help`'s
     "Commands" heading. Integration removed every guard on a function the
     file always has, merged the composer's two focus helpers, and made a
     failed queued line go back through the UI (it was dropped when
     something new was typed). Left open: the live grammar probe and a
     recorded live opening scene.
   - **Wave 5** (30 Oct 2026). The fourth code review (8 bugs, its risks
     and dead code), the fourth playtest (Q1 to Q13, D6 to D9, its prose
     items and design notes) and the fourth visual, mobile and
     accessibility QA (defects 1 to 9) were fixed by two agents in parallel
     (engine with content and the mock; UI), then a fifth integration pass.
     Notes: each `docs/notes/*` file's "Wave 5" section; tests:
     `tests/wave5-fixes.test.cjs`, the "wave 5" tests in
     `tests/ui-fixes.test.cjs` and `tests/integration.test.cjs`. In Say
     mode money to the one spoken to is a payment or a gift unless the line
     buys; a failed ask blocks a settlement only with the one asked; a
     name a person says ("Royce finally says Darnell") is an invented name,
     past adverbs and a placed speaker, and titles, street abbreviations
     and brands at a sentence start are not; memories carry the kind of turn, so a grudge answers by it;
     weapons by maker and head; the sixth instant lands where its short
     does; arrival events run that phase's clocks first; `/cheat time`
     fires what it passed in order, each dated, and `/undo` forgets a
     noted ending; a turn and the ending it brought are one `/undo`, told
     as narration, Resolved lines, recap, "This is one ending."; the
     divider before "Overnight in town"; a plan done while the player
     sleeps is narrated; plans stop after the ending; an enemy loose end
     comes back three to five days on; the repo man's seizure counts
     toward the note (`obligationPaid`); the council's keeping the police
     resolves that thread; Royce is bought or turned, never both; rough
     nights count at the same public place, a third night running (or a
     second time) costs a $25 fine, and the cell starts the count again;
     a friend's couch only when they are there now or tonight. The UI hands the
     focus on as the phone sheet slides shut, closes the phone Menu on
     widening, keeps the typing layout for the Say picker, says "One line
     is already waiting", gives a phone on its side more story, wraps
     long person-card flags, shows a hurt person one flag, and follows the
     two-column ⋯ list with the arrow keys. Integration let the rough-night
     count run on past the chief (a third night was free), told the
     narrator when someone present is hurt ("hurt: laid up until Day N",
     as the People card and the absent note say it), and renamed "the
     Saves screen" to Save / Load in the README. Left open: the live
     grammar probe and a recorded live opening scene.
   - **Wave 6** (30 Oct 2026). The fifth code review (6 bugs, its risks
     and dead code), the fifth playtest (R1 to R9, D10 to D14 and its
     design notes) and the fifth visual, mobile and accessibility QA (8
     items) were fixed by two agents in parallel (engine with content and
     the mock; UI), then a sixth integration pass. Notes: each
     `docs/notes/*` file's "Wave 6" section; tests:
     `tests/wave6-fixes.test.cjs`, the "wave 6" tests in
     `tests/ui-fixes.test.cjs` and `tests/integration.test.cjs`. In Say
     mode money to the one spoken to pays what is owed them, else is a
     gift, unless the parser read a buy, what is gained is a good
     (`State.goodNamed`) or the line orders one ("I'll take a beer");
     paying words (the rest, what's left, owe) always pay; a seizure in its
     own `onMiss` credits the debt without meeting it, and the Missed line
     says what was taken; a thread a town event resolves holds its reward
     (`thread.rewardHeld`, saved) until its news is told, and the ending's
     until its narration; what someone did to the player (`act: "own"`)
     starts no grudge, and a grudge template answers only its `about`;
     an invented person who plays pool or stands by someone is a hard
     name, a sign's back that says something is not; Colt 45 in a can is
     malt liquor, .38 rounds and buckshot are ammunition; only a pickpocket
     of someone away rolls nothing; `/cheat time` goes forward only, with a
     "Meanwhile in town, Day N" line a day and each morning's missed
     obligations; a week clear and the chief warns again; a log entry
     keeps the time its input was given (`from`) and its quiet lines their
     time and place in the turn. The UI lets the Say picker bring the
     typing layout on, wraps the `/` list's description to two lines,
     names a blank save "…, Day 1", sizes the box after Send's label,
     fills the two-column ⋯ list down the columns, puts the Say picker in
     the focus order where it is drawn, sizes the `/` list on keyboard
     changes and wraps the phone's top bar at 320. Integration drew the
     feed after a reload or `/undo` in the order it was shown (the UI side
     of R7: each quiet line kept with its time and whether the turn's roll
     and narration had been shown, `at: 'start' | 'before' | 'after'`),
     printed a `/cheat time` jump's Resolved lines under the "Meanwhile in
     town" line that told them (held for the ending, an `/undo` of the turn
     that told it lost them), and gave "Meanwhile in town, Day N" the
     news style. Left open: the live grammar probe and a recorded live
     opening scene.
   - **Wave 7** (30 Oct 2026). The one engine item the fifth QA left (the
     Journal showed a thread settled by a town event the player had not
     seen) was fixed by one agent, beside wave 8. Notes: the "Wave 7"
     section of `docs/notes/engine-state.md`; tests:
     `tests/wave7-fixes.test.cjs`. A change to a thread the player knows,
     made while applying an unseen town event or the ending, no longer
     touches its shown `status`, `summary` or `knownToPlayer`: the new
     values wait in `thread.pending` (an ordered list, one entry per news,
     saved and undone with the state) next to `rewardHeld`, and
     `releaseRewards` shows them when `newsSeen` tells that news and pays
     the held reward only once nothing is still held, so the Journal row,
     the recap's Open line, the narrator's OPEN line and the Resolved line
     change in the same step. A meeting the player walks into settles its
     thread in that turn. Engine decisions (a resolved thread never moves,
     `looseEndThreads`, World's `threadOpen`, the drift's `tied`) read the
     real value through `State.threadNow`; everything shown reads the
     shown fields. A bookkeeper change that is not held is compared with
     what the player is shown, so repeating "open" moves nothing held and
     a different status wins. Left open: a wave-6 save whose thread already
     shows an unseen result keeps showing it, having nothing to migrate
     from.
   - **Wave 8** (30 Oct 2026). The last items of the final verification
     pass (six in the code, two in the README) were fixed by one agent,
     beside the Journal hold fixed in parallel. Notes: the "Wave 8" sections
     of `docs/notes/engine-world.md` and `docs/notes/prompts.md`; tests:
     `tests/wave8-fixes.test.cjs`. `/pronouns` turns a person's ties with
     them wherever they are read (the cast block, PRESENT, the People card:
     "husband of Dewayne Mangum, son of the late Inez Crocker"; spouse,
     child, parent, sibling for they), the records left as written; a first
     name and a surname the town does not have, before what a person is or
     does or after "watch", "see", "meet" or "hear", is a hard invented
     name ("Earl Hux is cheap, Royce says.", "You watch Earl Hux playing
     pool."), while brands, the radio and what a sign says stay soft;
     `/cheat time` prints each day's Resolved lines under that day's lines;
     a missed obligation's news that its missText tells is seen once that
     is told, not repeated in "Overnight in town"; a plan's price changes
     and the people its thread links to no longer make it seen wherever the
     player is, only at its own place; the mock gives with "hand", searches
     for "anything" without making it an item, names a skip's crowd once
     and tells the due events briefly, one it has no room for waiting for
     the next narration instead of being marked done. The README says
     `/undo` is for the current sitting and lists what a live session
     should still check (the newer packets, Say-mode money, how often the
     name check rewrites, the cost of a turn). Left open: those live
     checks.
   - **Wave 9** (31 Oct 2026). The first live turns of the round (the owner
     playing the Say-mode money rule) found what the mock could not: told
     the player's cash on CARRYING, the narrator had Jodie say "You've got
     five bucks left to your name" after a $20 tip from $25. Notes: the
     "Wave 9" section of `docs/notes/prompts.md`; tests:
     `tests/wave9-fixes.test.cjs`. The packet marks the cash as the
     player's alone, WHAT PEOPLE KNOW and both style guides say nobody in
     the scene sees it, and `Style.check` makes a spoken line that knows
     the total (digits or words, before or after what the input hands over)
     a hard problem, rewritten once; the player's own figure, a price and
     narration outside quotes pass. Left open: the rest of the live list.
   - **Wave 10** (31 Oct 2026). The owner asked for a card game they can
     see ("Poker is so confusing with texts. When playing poker, there
     should be a proper ui to see everything and a cheat to win"), built by
     one agent. Notes: the "Wave 10" sections of
     `docs/notes/engine-world.md` and `docs/notes/ui.md`; tests:
     `tests/wave10-cards.test.cjs`. The card game is five-card draw against
     the dealer at a table in the feed: a `Cards` module (the deck, hand
     ranking with its tie-breaks, the dealer's draw) deals from a generator
     seeded by the game's seed and the turn, so `/undo` deals the same hand;
     the player holds cards and draws, or folds; the better hand wins (the
     stake either way, a split pot moves nothing, a fold costs half) and the
     money moves through `State.apply` as before. Wits is a read of the
     dealer (right 55% + 12% a point, 50 to 95%), not the result. A marked
     deck turns the dealer's cards up and is the only roll, its fumble
     caught with every old consequence; the accusation without one is gone.
     `/cheat cards` stacks the next hand so the player wins it, with no roll
     and nothing on record. The table is built from nodes, kept on the log
     entry and drawn again in place after a reload or `/undo`; Stop with a
     hand open calls the turn off. OUTCOME names both hands, the
     bookkeeper's CARD GAME line and its ignored goldDelta are as before,
     and the demo tells the hands. Left open: a live narrator's telling of a
     hand.
   - **Wave 11** (31 Oct 2026). QA played the wave 10 table on phones and
     laptops and found two high, seven medium and twelve low items, fixed
     by one agent with four of its suggestions. Notes: the "Wave 11"
     sections of `docs/notes/engine-world.md` and `docs/notes/ui.md`;
     tests: `tests/wave11-cards.test.cjs`. A dealt hand is final: Stop
     with it open folds it (the fold price, now half rounded up, and the
     marked deck's catch roll), a narrator that fails, is stopped or
     declines after the showdown leaves the hand told in one plain engine
     line, and a page closed on a hand finds it on the next load (folded,
     or as played); `/reroll` replays a hand from its record and rolls only
     the catch. The title screen waits for an open hand. A bet said in Say
     mode deals when said to the dealer or to everyone. Stakes come from
     figures or words, all in is all the cash, a capped or defaulted stake
     is said. The read is 60% + 12% a point and reads on the man; it is
     hidden over a marked deck and says afterwards whether it was right.
     Caught, the ban names the first day the bar is open, the dealer will
     not deal for a week (or while colder than -10) and his due events
     wait; nobody dealing says when he deals. `/cheat cards` lives in the
     game (survives a reload and `/undo`). The table's head takes the
     focus and names the group, a card says whether it is held, the
     keyboard ring is not the Hold edge, Draw and Fold say what they do,
     drawn cards are marked, the catch roll is labelled, the cash follows
     the hand at once, a short phone opens the table at its head, and suit
     signs ask for text presentation. Left open: a live narrator's telling
     of a hand, as before.
   - **Wave 12** (31 Oct 2026). A second QA pass over the wave 11 table
     found three medium and ten low items, fixed by one agent. Notes: the
     "Wave 12" sections of `docs/notes/engine-world.md` and
     `docs/notes/ui.md`; tests: `tests/wave12-cards.test.cjs`. Once a hand
     is played the story is followed again on a phone (the narration was
     left below the fold under the "New" pill), and the title screen's
     refusal shows above the table with the focus on its head. A hand left
     on the table is bound to the game, the turn and the story it was
     dealt in, and to its tab: any load that does not match (an older save
     of the same game, another game, New game) drops it; another tab that
     takes the game over folds it there, and the first tab's table is void.
     The dealer's invitation waits while he will not deal for any reason.
     A `/cheat cards` hand resumed after a reload spends the cheat. The
     catch roll reads "Keeping the marks from Curtis", a closed page's fold
     "You left the table, so you fold", and a narrator that fails after the
     showdown says so and how the hand stands, with no "try again". "I bet
     he is lying" is talk, not a bet; "a fiver", "half my money" and "$0.50
     is no stake" are stakes as said; every line about a ban names the
     first day the place is open; the demo names someone not met as the Say
     picker does. Left open: a live narrator's telling of a hand, as
     before.
   - **Wave 13** (31 Oct 2026). The owner asked for Texas hold'em beside
     five-card draw ("Keep both and build holdem too"), for tables with
     "more than the 2 of us", and for a cheat that "narrates my win without
     playing" and a way at the start of a hand to "skip the whole game and
     win"; built by one agent. Notes: the "Wave 13" sections of
     `docs/notes/engine-world.md`, `docs/notes/ui.md` and
     `docs/notes/content.md`; tests: `tests/wave13-holdem.test.cjs`. The
     game is named in the words or remembered (`flags.cardGame`, an
     engine-only State op); the first time the table opens with a chooser
     (Stop there costs nothing). Five of the Low Water's regulars are card
     players (`cardplayer`): per hand none, one or two of those present sit
     in ("deal everyone in", "heads up" steer it). The stake is the most
     anyone can lose, so there are no side pots; hold'em antes and bets a
     fifth of it, four streets, no raises, best five of seven; the seats
     play by hand strength and nature, deterministically from the hand's
     seed, and draw seats draw by the dealer's rule. The table shows a row
     a seat with a status cell, the board, a pot line and the street's
     buttons; reads name a seat when it bets. `/cheat cards` works at
     hold'em; `/cheat win` (armed in the game) and a Win (cheat) button on
     every open table end the hand the player's, told as a plain win. A
     card player who loses big to the player, or takes a pot off them,
     remembers it. Everything waves 11 and 12 built for a hand (Stop, a
     closed page, another tab, the redraw, `/reroll`) works for both games
     and any street. Left open: a live narrator's telling of a hand, as
     before.
   - **Wave 14** (31 Oct 2026). A QA player played about 300 hands of the
     wave 13 table and found 4 bugs, 11 rough edges and 9 nits, fixed by
     one agent as decided (all but `/undo` dealing the same hand again,
     kept by design). Notes: the "Wave 14" sections of
     `docs/notes/engine-world.md` and `docs/notes/ui.md`; tests:
     `tests/wave14-holdem-fixes.test.cjs`. The Win (cheat) never changes a
     card the player has seen (their own, the board so far, every seat's
     with a marked deck): only what is unseen is dealt so their hand is
     the best, and when nothing can do that the others fold to them and
     they take the pot as it stands, so no tie and no weaker hand ever
     takes it. The player folding with a bet unanswered no longer ends the
     hand for the others: whoever owes the bet calls or folds it, the rest
     is checked down, and a seat that never matched a bet cannot win it
     (Stop, a closed page and another tab the same). A card player is
     marked by a hand only for $10 or more (a loss of the most it could, or
     its share of the player's money), once a day. On a phone the table no
     longer jumps back to its head at every press: the player's cards and
     the buttons stay in view. A new street starts with the statuses
     cleared, five cards up is the Showdown, a verdict shows only where the
     cards were shown, the head's pot is the real one (a fold at draw too),
     hands of one name are told apart by their kickers, a stake that is not
     a multiple of $5 says "at most $20 in" (and the narrator "of the $23
     named"), and Check alone says there is no room for a bet. `/cheat win`
     typed with a hand open is the Win (cheat) control and `/cheat cards`
     says the cards are dealt; the switch hint is on the chooser and the
     newest finished table only; `/reroll` after a cheat-win hand says
     "Nothing to reroll: that hand was yours." (only `/undo` arms the cheat
     again); the chooser has its own status line, and another tab taking
     over at the chooser takes the turn back with nothing lost. The cheat
     hands vary (at hold'em a set, the nut flush, a straight, a full house
     or four of a kind against hands that lose; at draw a full house, a
     flush or a straight). The demo reads "a hand of cards", "Mind if I sit
     in?" and a game named in a short line as a bet, says "Curtis Pruett
     folds to you" heads up, and never has the people at the table
     "arrive" after the hand; "draw to an inside straight" is no game. The
     Win (cheat) control is 44px tall on a phone. Left open: a live
     narrator's telling of a hand, as before.
   - **Wave 15** (31 Oct 2026). A verification QA pass over the wave 14
     table confirmed all 24 of its fixes and found one rough edge and seven
     nits, fixed by one agent as decided. Notes: the "Wave 15" sections of
     `docs/notes/engine-world.md` and `docs/notes/ui.md`; tests:
     `tests/wave15-table-polish.test.cjs`. A draw hand left open in a game
     saved before wave 13 (no game stored with it) folds on load at the
     normal price instead of opening the chooser, and Stop at a chooser with
     no line to put back says only "Stopped. Nothing lost." Hands of one
     name at a showdown are named to one depth from the first kicker
     ("king-jack kickers" / "king-ten kickers" / "nine-eight kickers"). A
     cheat deal at hold'em gives the other seats hands that differ from one
     another when the deck allows (two alike in about 1 of 400 five-seat
     deals, from 184), every one still losing. After a hand only the dealer
     and the seats are left out of who arrived, in the demo and in the
     narrator's packet. After a press the focus goes to the table's first
     button, in view; the head has it only when the table first appears.
     With a hand open `/help` works and `/undo` says to finish the hand or
     Stop it first. The demo reads "Mind if I join you for a hand?", "I take
     a seat at the card table", "I sit at the table" and "Deal me into the
     game" as bets where a dealer sits, and "Count me in" or "I'm in" with
     the cards, a hand, the table or the game named, or right after a hand.
     A game named and then put down ("draw poker is for old men") is the
     one being left. Left open: a live narrator's telling of a hand, as
     before.
   - **Wave 16** (31 Oct 2026). The owner, playing on a phone: "Let me undo
     multiple times. I was in the middle of a poker game and I can't undo
     to the start of the game."; then, for turns played as plain text on
     the build before the card table, which have no undo step anywhere, a
     way to strike them from the story. Built by one agent. Notes: the
     "Wave 16" sections of `docs/notes/engine-state.md`,
     `docs/notes/engine-world.md` and `docs/notes/ui.md`; tests:
     `tests/wave16-undo.test.cjs`. `/undo` with a hand open (typed, the
     Undo link, which now shows with a hand or the chooser open, or the ⋯
     list's Undo) takes back the whole turn that dealt it, free, at the
     chooser, at draw and on any hold'em street, with a marked deck too: no
     fold price, no catch roll, nothing recorded, the table and the line
     out of the story, the line back in the box, the stored hand dropped,
     the pipeline free, a cheat the hand spent armed again ("You took back
     the last turn; the hand is off the table."); Stop still folds at a
     price. The undo stack (20 steps, about 8 MB at most) is kept in
     IndexedDB for the game in the autosave, written a moment after each
     step and when the page is hidden, never by a tab another tab has
     taken over; Continue and Play here instead read it back (its steps up
     to the turn loaded), a new game, a slot, an import or the previous
     autosave start it empty and clear it, and without IndexedDB undo is
     the page's own as before, with nothing said. `/undo 3` and `/undo all`
     take back several steps, every notice ending with how many more can
     be ("2 more can be taken back.") and the Undo link's name counting
     them; asked for more than there is, it takes back what it can and
     names `/rewind` for the rest. `/redo` (`/redo 2`, `/redo all`) puts
     back what an undo took, in memory only, emptied by the next step
     played or another game. `/rewind N` (`/rewind to turn 12`, `/rewind
     day 2`) strikes turns from the story from the records that carry a
     turn (the log, memories, journal notes, progression, seen marks, who
     was met, people and places first named then that nothing else names),
     sets the clock back to when the first struck turn began and says what
     it cannot take back (money, health, things carried, feelings, where
     the player is, what they heard); it is one undo step, an engine-only
     op (`rewind`), and the turn count goes on. `/cheat cash <amount>` sets
     the cash (one undo step, nothing in the story). The fold on load after
     a reload is one step back to before the bet, and `/undo` after an
     update still takes back exactly the update. Left open: a live
     narrator's telling of a hand, as before.
