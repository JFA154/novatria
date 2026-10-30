# Build plan: One-Town Text RPG

Read SPEC.md first (the game design, authoritative), then docs/API_NOTES.md
(authoritative for every Claude API call), then this file (how the build is
organised and the shared data contract).

## Deliverable and hard constraints

- One built file: `index.html` at the repo root, assembled from parts by
  `build.cjs` (plain node, no dependencies) and committed (direction change
  17). Inline CSS and vanilla JavaScript. Playing needs no build step, no
  framework, no bundler, no backend: the committed file is what the player
  opens. Opening the file from disk must work (`file://`), so no module
  scripts and no fetches of local files. `node build.cjs --check` exits 1
  when the committed file is not what the parts build, and the constraints
  suite runs it.
- Script organised into clearly delimited sections, one per module, in this
  order: `TOWN_DATA`, `TABLES`, `BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`,
  `GRUDGE_TEMPLATES`, `FAVOUR_TEMPLATES`, `JOBS` (direction change 16) (all
  in `content/town.js`), `STYLE_GUIDE`, `EXAMPLE_TURNS`, the helpers, then
  modules `Rng`, `Dice`, `Tables`, `State`, `Town`, `World`, `Style`, `Api`,
  `Upgrade`, `Pipeline`, `Storage`, `UI`, `Commands`, `App`, each in its own
  file in `src/`. Each module starts with a banner comment:
  `// ===== Module: State =====`.
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
index.html              the game: built by build.cjs, committed, never edited by hand
build.cjs               joins the parts into index.html; --check exits 1 when it is stale
src/head.html           the document head, the CSS, the body markup, the start of the page script
content/town.js         the town and the character-creation data (between the content markers)
src/10-style-guides.js  the narrator's style guides and example turns
src/15-helpers.js       constants and helpers shared by every module
src/20-rng.js           Rng
src/25-dice.js          Dice
src/30-tables.js        Tables
src/35-state.js         State
src/40-town.js          Town
src/45-world.js         World
src/50-style.js         Style
src/55-api.js           Api (the real provider and the mock)
src/60-upgrade.js       Upgrade
src/65-pipeline.js      Pipeline
src/70-storage.js       Storage
src/75-ui.js            UI
src/80-commands.js      Commands
src/85-app.js           App
src/90-game.js          window.Game and the boot
src/tail.html           the end of the page script and of the document
SPEC.md                 the design spec (do not edit)
docs/API_NOTES.md       Claude API wire format (do not edit)
docs/BUILD_PLAN.md      this file
docs/CAST.md            the cast roster, written by tests/cast-doc.cjs
tests/                  Playwright scripts, CommonJS (.cjs), run with plain node
tests/run.cjs           runs the town check and every tests/*.test.cjs file, exits non-zero on failure
README.md               how to play, how to put in the key, how to edit the town, how to run tests
```

The engine parts are joined in the order of their numbers (a new module is
a new `NN-name.js`); the build adds only the two content markers and a
one-line banner at the top of the page script. The tests and the town tools
(`tests/validate-town.cjs`, `tests/mentions.cjs`, `tests/cast-doc.cjs`) read
the built `index.html`; the town check and the roster refuse a page that is
not the build, so `content/town.js` is the one place the content is written.

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
  locations: [{
    id, name, type,                 // type: tavern | market | docks | temple | manor | smithy | watch | slum | road | ...
    description,                    // two sentences
    exits: ["loc_..."],             // symmetric: if A lists B, B lists A
    npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] },
    discovered: true,               // town places true; a cast member's home (house, trailer,
                                    // apartment, farm) false until someone tells the player
    closed: false                   // set true by a clock effect; still exists
  }],
  npcs: [{                          // the whole cast, 40 to 45, written by hand (direction change 8)
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
    status: "free"                  // free | arrested | gone | dead
  }],                               // everyone is in npcIdsBySchedule in every phase
  offstage: [{ name, about }],      // optional: people the story names who never appear
  factions: [{
    id, name, goal, methods,
    clocks: [{                      // 2 or 3, run in sequence
      label, segments: 6, filled: 0,
      onComplete: { text: "...", effects: [ /* effect ops, below */ ] }
    }],
    activeClock: 0,                 // index into clocks; -1 when all done
    relations: { "fac_x": -50 }
  }],
  threads: [{ id, title, summary, status: "open", knownToPlayer: false, linkedIds: [] }],
  seeds: [{
    id, cause, effect,
    effects: [ /* optional: effect ops, below, run when it fires live (direction change 14) */ ],
    trigger: { type: "day" | "location" | "npc" | "clock", value },
    //  day → integer day; location → "loc_..."; npc → "npc_..."; clock → "fac_x:3"
    fired: false, hidden: true
    // engine-planted seeds may also carry notBeforeDay, notBeforeTurn and origin
  }],
  rumours: [{ id, text, true: true, sourceNpcId, heard: false }]
};
```

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
| `visit` | `npcId`, `locationId` | the NPC is at that place for the current day and phase only (a `visits` entry, as a loose end's person coming to the player); a no-op for someone not free, a closed place, or someone with the player somewhere else; refused out of town (direction change 14) |
| `placeItem` | `locationId`, `item` (`{ name, qty?, notes? }`) | a thing lying in that place (a scene item, id `item_<name>`), in ITEMS HERE until `itemsGained` takes it; refused out of town (direction change 14) |
| `fight` | `npcId`, `reason?` | that person comes at the player: it waits in `state.fights` and is fought on the next narrated turn, or, on a seed, the turn the seed's due event is told; the person is brought to the player for the phase and the player defends (might, normal; 1 to 3 damage on a failure, 3 on a critical failure); a no-op for someone not free or with a fight already waiting (direction change 16) |

### TABLES

```js
const TABLES = {
  npc: { firstNames: [30], occupations: [30] },  // read by Town to tell a person in a `new:` description
                                                 // ("Dakota", "a welder"); nobody is made from them
  location: { types: [15], details: [20], problems: [15] },
  items: { goods: [40 of { name, price }], trinkets: [20] },
  complications: [20],
  weather: { spring: [6], summer: [6], autumn: [6], winter: [6] }
};
```

### Character creation data

```js
const BACKGROUNDS = [{            // exactly 6
  id: "bg_...", name, blurb,       // blurb: one sentence
  stats: { might, wits, charm, stealth },   // each -1..3, total 3
  gold, items: [{ id, name, qty, notes }],  // 2 items
  arrival: "gate" | "docks"
}];
const FLAWS = [ "...", ... ];      // 8 one-line flaws
const LOOSE_ENDS = {               // keys: debt, enemy, secret, lost, promise
  debt: {
    label: "A debt",
    options: ["I owe someone money", ...],     // 3 presets, editable
    link: { tag: "lender", optionTags: ["lender", "collector", "bookie"] },
                                               // bind to a free cast member with the option's tag,
                                               // else the tag, else anyone free; never a new NPC
    seed: { dayOffset: [3, 5], effect: "...{npc}..." , trigger: "day" }
  }, ...
};
const GRUDGE_TEMPLATES = [ { effect: "...{npc}...", dayOffset: [2, 5], effects? }, ... ];  // 6+
const FAVOUR_TEMPLATES = [ { effect: "...{npc}...", dayOffset: [2, 5], effects? }, ... ];  // 6+
// effects (direction change 16): fight, visit or attitudeDelta ops for the seed,
// npcId "{npc}" standing for the person whose grudge or favour it is.
```

### Jobs

Paid work (direction change 16), after `FAVOUR_TEMPLATES`, checked by
`tests/validate-town.cjs`:

```js
const JOBS = [{                    // 6 to 8
  id: "job_...", label,            // label: a lower-case phrase ("a shift in the service bays at Pittman's")
  locationId: "loc_...",           // in town
  giverNpcId: "npc_...",           // here, and at locationId in every phase listed
  phases: ["morning", ...],        // when it is offered
  pay: [lo, hi],                   // whole dollars, 5..400
  stat: "might" | ... | null,      // null: no roll, always paid in the range
  difficulty: "normal" | ... | null,
  timeCost: "long",                // or "short"
  factionId: "fac_..." | null,
  repeatable: true | false,        // false: done once for good
  cooldownDays: 1,                 // 1..14: not on offer to the player again until day + this
  blurb,                           // one sentence: what the work is (the narrator's JOB line)
  stake?: true,                    // the pay range is won or lost (the card game); needs a stat
  onSuccess?: [ /* effect ops */ ], onFailure?: [ /* effect ops */ ]   // 1 to 4 each
}];
```

### Game state

Exactly SPEC.md section 3, plus:

```js
state.flags = { priceMultiplier: 1, weather: "..." };
state.time = { day: 1, phase: "morning", shorts: 0 };   // 3 shorts = one phase
state.meta = { seed, turn, createdAt, townName, townVersion: 1, lastRollKey: null, lastRoll: null };  // lastRoll: direction change 13
state.player.storyPoints // 0..3
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
checked, per SPEC.md section 10 "Validation in State.apply()".

## Module responsibilities

| Module | Owns |
|---|---|
| `Rng` | mulberry32 seeded by `meta.seed`; `Rng.int(a,b)`, `Rng.pick(arr)`, `Rng.d(n)`; advances a counter stored in `meta.rngCalls` so a loaded save continues deterministically |
| `Dice` | d20 + stat + modifiers vs difficulty, outcome tiers, complication selection, the retry lock (`meta.lastRollKey`, and `meta.lastRoll`: what the roll was and the asks granted in the scene) |
| `Tables` | a minor location, a listed price, a complication, the weather from `TABLES` via `Rng` (the NPC and item rolls went in direction change 17) |
| `State` | `newGame(town, character)`, `apply(diff)`, `snapshot()`, `restore()`, helpers like `npcsAt(locId, phase)`, `entityById(id)`, `reputationTier()` |
| `Town` | loads `TOWN_DATA` into state at new game; plausibility check for `new:` targets by location type |
| `World` | world tick (clocks, schedules, grudges, favours, news), seed firing, `applyEffects` |
| `Style` | banned-phrase and length checks |
| `Api` | real provider and mock provider behind one interface: `parse(packet)`, `narrate(packet, onDelta)`, `bookkeep(packet)`, `chronicle(entries)`; usage accounting |
| `Pipeline` | the 13 steps of SPEC.md section 6 |
| `Storage` | autosave, slots, export, import, settings (key storage per SPEC.md section 13) |
| `UI` | rendering, feed, panels, sheet, screens, autocomplete |
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

## Direction changes, second round (owner, 29 Oct 2026)

The owner read a review of the finished game and agreed with all of it:
"I agree with everything." The review's findings, in the order they were
ranked, are in the entries below. Each entry is written by the work package
that implements it, in the style of the entries above.

### 10. The narrator knows what everyone wants

The review the owner agreed with (findings 1 and 4): the narrator writes
Royce Pittman without knowing who holds his note and writes dialogue for
people whose wants it does not know; the player's goal, flaw, loose ends
and threads reach no prompt; on day 1 the creditor has never heard of the
player; and a conversation drifts after its third exchange. Root causes:
`Pipeline.npcLine` sent role, ties, look, voice, attitude and memories but
never `goal`, `secret` or `personality` (SPEC.md section 10 said never to
send secrets); the narrator packet carried nothing about the player beyond
PLAYER and CARRYING; `Pipeline.pickMemories` dropped every memory starting
"Loose end with ", which was the one memory `Town.resolveLooseEnd` wrote on
the loose end's person; and the packet's memory of the scene was
`LAST 3 TURNS`.

- **The people here carry their wants and a guarded secret.**
  `Pipeline.npcLine` adds `traits: <personality>`, `wants: <goal>` and
  `secret: <secret>` (final full stop dropped) to the line of everyone in
  PRESENT. `narratorPacket` puts one rule line right before PRESENT, and
  only when someone is there (`WANTS_RULE`, `WANTS AND SECRETS:`): wants and
  traits drive what people say and do; a secret is never told or hinted at
  in the narration, it decides what they avoid, lie about or bristle at, and
  they let part of it slip only when the player has earned it, caught them
  out or found proof; nobody else present knows it unless their own line
  says so. The rule is packet text, not style-guide text, so the fixed
  guides stay as they are. A `brief` line (people at a DESTINATION) and
  `castBlock` (cached; `tests/api.test.cjs` limits its size) carry no
  traits, goal or secret, so a secret reaches the narrator only while its
  keeper is in the scene. This is a deliberate deviation from SPEC.md
  section 10: without the secret the narrator cannot write the evasion, the
  lie or the slip.
- **The player's hooks.** `Pipeline.playerHooks`, after PLAYER and
  CARRYING: `WHY THEY CAME: <goal>`, `FLAW: <flaw> It colours what tempts
  or needles <name>; the narration never acts, speaks or decides on it for
  them.` (the NEVER rule stands) and `THREADS (what the player is caught up
  in): <title>: <summary> | ...` for the open threads the player knows, at
  most eight, each summary cut at 240 characters (loose ends are known
  threads that name their person, so they come along). A line is left out
  when its field is empty. Closed threads are left out: a thread keeps no
  turn for when it closed, so "recently resolved" cannot be told apart from
  long ago, and the chronicle and people's memories carry how it ended.
  `Pipeline.arrival` adds why they came to the arrival's ACTION ("Why they
  came (the opening may hint at it; nobody here knows it): ...", set after
  `normaliseParse`, whose 200-character cap would cut it).
- **The loose end's person knows.** `LOOSE_ENDS[kind].memory` is `{ text,
  options }`: one line per preset option and one for the kind, in the
  bookkeeper's own form (`Api.MEMORY_RULES`: under twelve words, that
  person's point of view, the player the unnamed subject; "owes me more
  money than they can pay", "testified against me, and I did years for it",
  "wrote to me asking after a brother who went quiet"). `Town.looseEndMemory
  (kind, text)` picks the option's line when the player kept a preset's
  words, else the kind's (`{player}` is filled if a line uses it), and
  `Town.resolveLooseEnd` writes it at weight 3 (`LOOSE_END_MEMORY_WEIGHT`)
  instead of "Loose end with ...". `pickMemories` no longer filters
  anything, so the line is in the person's PRESENT line and on their People
  card from day 1. `knowledgeLine` stays true (people know their remembers
  list and what happened in front of them: STORY SO FAR, THIS SCENE).
  `Upgrade.isProtected` also protects these lines (`Town.isLooseEndMemory`,
  every line the templates can make), so the memory rewrite leaves them as
  it left the old form. `tests/validate-town.cjs` requires `memory` on each
  loose end: `text`, and `options` one per preset when given, each under
  twelve words, no full stop, no `{npc}`.
- **This scene, not the last three turns.** Log entries gain `locationId`
  and `sceneFrom` (the `logEntry` normaliser in `State.apply`): the place
  given if it is known, else where the player stands when the entry is
  written (so a move's turn belongs to the place it arrived at, as
  `noteSeen` already assumed), and the turn the player came to that place,
  carried on from the entry before while the place is the same. `runTurn`,
  `arrival`, `/fact` and the opening all get it from the normaliser.
  `Pipeline.sceneTurns` takes the newest run of entries at the current
  place, oldest first, at most 12 entries and about 700 words (the oldest
  go first); `narratorPacket` sends `THIS SCENE (since the player came to
  <place>): ...` in place of `LAST 3 TURNS`, with "(earlier turns of this
  scene are left out to keep this short)" when capped, or "(earlier turns of
  this scene are in STORY SO FAR)" when the chronicle has already taken the
  scene's first turns out of the log (the newest entry's `sceneFrom` is
  older than the oldest kept). When the scene has fewer than three entries,
  `BEFORE THIS SCENE: ...` carries the three entries before it, so a fresh
  arrival keeps the thread. Each entry reads as before (`> input
  narration`, Say marked as speech), on one line. STORY SO FAR stays. The
  VARIETY line (`Style.lengthLine`) and the casual guide's DIALOGUE line
  name THIS SCENE instead of LAST 3 TURNS (only that label changed);
  `Style.check`'s repeated-phrase check still reads the last three
  narrations. The chronicle still drops summarised entries every ten turns
  (acceptance check 6), so a scene older than the last compression is
  partly in STORY SO FAR.
- **Older saves.** No rules version. `State.load` runs
  `fillLooseEndMemories` (the `fillPronouns` pattern): a "Loose end with
  <player> (<label>): <text>" memory on a loose end's person becomes that
  loose end's line at weight 3, its turn kept (the label picks which of
  that person's loose ends it is; the same line on anyone else is left
  alone). Log entries without `locationId` load as they are and belong to
  no scene: the next narration sends them as BEFORE THIS SCENE, the last
  three, as LAST 3 TURNS did.
- **Cost.** The narrator packet grows by the goal, traits and secret of
  each person here (about 90 tokens each, and one rule line of about 110), the player's hooks and the
  scene; see "What a turn costs" in README.md for the measured numbers. The
  cached blocks do not change.
- **Tests.** pipeline: wants, traits and secret on each present person's
  line under one rule right before PRESENT, nobody else's goal or secret in
  the narrator, parser or bookkeeper packets, a DESTINATION or the cached
  blocks, no rule with nobody here; WHY THEY CAME, FLAW and THREADS (a
  thread the player does not know or that closed is left out, no line for
  an empty goal or flaw); every loose-end line under twelve words, the
  option's or the kind's, the creditor's day-1 memory in PRESENT and on the
  card, untouched by the re-read; THIS SCENE holds every turn at the place
  and none from before, BEFORE THIS SCENE on a fresh arrival, the 12-entry
  and 700-word caps, the chronicle note, and an older save's log with no
  places. state: `locationId` and `sceneFrom` on log entries; the load-time
  rewrite of the old loose-end line. Changed on purpose: the full-turn
  packet test (THIS SCENE for LAST 3 TURNS; only absent people's goals and
  secrets are hidden), the knowledge line's wording, the api arrival's
  ACTION (it now says why they came), and the playtest's and world suite's
  clean-packet checks (a present person's secret and goal once, in their
  own line; nobody else's; THIS SCENE at most 12 turns).
  One follow-up from the same change: `Style.check`'s day-1 invented-past
  check (direction change 7) would now flag a loose end's person saying "I
  knew you'd show up", which is theirs to say. `Pipeline.narrate` passes
  `pastKnown` (someone tied to a loose end is present) and the check is
  skipped for that turn; the pipeline suite covers both cases.

### 11. The first impression

The review: mock mode is on by default, so someone who opens the game and
skips the README gets the placeholder narrator ("Royce Pittman greets you
with a nod. Around you, Pittman's Gas and Service goes on with its
morning.") and thinks the game is broken. The feed tagged it "Mock
narration" in small capitals, and the title screen's foot said "Mock mode is
on: no API calls.", but nothing said the real narrator needs an API key or
where it goes. The owner agreed. Nothing in the engine changes and no
default changes; mock mode plays exactly as before.

- **Who narrates** (`UI.narratorState`): `offline` (mock mode on, no key),
  `mock` (mock mode on, a key stored), `nokey` (mock mode off, no key) or
  null (Claude narrates). It reads `Api.providerName()` and
  `Storage.getApiKey()`. The `nokey` case goes beyond the brief: with mock
  mode off and no key the real provider is used and every turn fails with
  "There is no API key yet", and it is easy to reach, because a key that is
  not remembered on this device is forgotten when the tab closes while the
  mock setting stays off. Its texts say turns will fail rather than that
  the game plays offline. `UI.NARRATOR_NOTES` holds the banner text, the
  button and the title line for each case.
- **The banner** (`#narrator-banner`, `role="status"`, at the top of the
  story column, between the top bar and the feed; `UI.renderNarratorBanner`,
  called from `showScreen('game')`, so it is current after a new game, a
  load, Continue, an update and whenever Settings closes back to the game).
  It is in the column's flow, so it pushes the feed down and covers neither
  the feed nor the composer; on a laptop it lines up with the 680px feed and
  leaves the side panel alone. `offline`: "Offline: the story is placeholder
  text. Add an API key in Settings for the real narrator." with **Settings**
  (`UI.openKeySettings`: the settings screen with the key field focused, so
  a phone's keyboard comes up ready to paste). `mock`: "Mock mode is on: the
  story is placeholder text and your key is not used." with **Turn on the
  narrator**, which saves `mockMode: false` and hides the banner, with a
  toast; it is disabled while a turn runs (`UI.setBusy`), because the
  turn's later calls would go to the other provider. `nokey`: "No API key:
  mock mode is off, so turns will fail. Add a key in Settings." with
  **Settings**. The words up to the colon are bold. The x, or Escape with
  the focus inside the banner, dismisses it (`dismissNarratorBanner`) for
  the rest of the browser session: the kinds dismissed are kept in
  `sessionStorage` (`novatria.narratorBannerDismissed`, comma-separated), so
  it is back next session, and a different kind still shows (hiding
  "offline" does not hide "turns will fail"). Storage that throws keeps the
  choice for the page only, with no warning. Focus moves to the input after
  a dismiss (laptop). Text 16px, buttons 44px each way. On a phone the
  buttons sit in the top right corner and the text runs round them (a float
  as wide as the buttons, measured by `fitNarratorBanner` into
  `--nb-actions`): three lines, 84px tall at 375 and 390 wide; the sides
  clear the safe areas.
- **The title screen** (`#title-mode`, now a paragraph under the buttons
  instead of a span in the foot; `UI.renderTitle`): "No API key yet: the
  game plays offline with placeholder narration. Add one in Settings.",
  "Mock mode is on: placeholder narration, no API calls. Turn it off in
  Settings.", "No API key yet, and mock mode is off, so turns will fail. Add
  a key in Settings, or turn mock mode back on.", or nothing. 14px, the
  title screen's muted colour.
- **Settings**: the API key, Remember on this device and Mock mode were
  already together at the top. Mock mode's label is now just "Mock mode"
  (it said "use the built-in dummy narrator, no API calls"), with the line
  under it, tied by `aria-describedby`: "On: the built-in placeholder
  narrator, no API calls, free. Off: Claude narrates with your key."
- **Older saves and settings**: nothing is stored in a save; no settings
  field and no rules version.
- **Tests.** Shell: the banner in mock mode, where it sits, 16px text, its
  Settings button opening Settings with the key focused, a key turning it
  into the mock-mode banner, a key and mock mode off hiding it, the `nokey`
  banner, a loaded game; "Turn on the narrator" (saved, provider `claude`,
  Settings unticked, disabled while busy); dismissing with x and with
  Escape (hidden across a turn and a reload, per kind, back in a new
  context, and with `sessionStorage` blocked); the title line in each case,
  set through the settings screen. Mobile: the audit measures the game
  screen with the offline banner and with the mock-mode banner at 375x740
  and 390x844, and a new test per size checks the banner sits between the
  top bar and the feed, clear of the composer, at most 100px, 16px text,
  44px buttons, no overflow, and that with the viewport at 400px (the
  keyboard up) the input stays on screen and the feed keeps room; the safe
  area test reads the banner's side padding. Settings: mock mode still on
  by default, and the first three controls are the key, Remember and Mock
  mode, with the explanation. Acceptance check 9 runs with the banner shown
  (mock mode, no key) and is unchanged.

### 12. The town talks: clock pace, rumours that spread, news in the journal

The review the owner agreed with (finding 2): the plot resolves itself and
the player cannot see it. The pacing report showed the first clock
completing around day 4 and all nine by about day 14 in 200 of 200 runs,
with no player involvement; in the 37-turn playtest five completions
happened off-screen and the player heard one rumour. Root causes:
`World.rollClocks` rolled a d6 for every faction at every phase change
(SPEC.md section 8), four a day; `Pipeline.wouldKnow` let a rumour pass only
from its source, a faction mate or (for news) a gossip, and most of the cast
has no faction, so each of the town's ten rumours had exactly one person who
could tell it; and nothing dated reached the Journal when the town moved.

- **Clock pace** (`World.tick`). The clocks roll only at the morning and
  evening ticks (`World.CLOCK_PHASES`): two rolls a day, so a six-segment
  clock takes about nine days on average and a faction's three about 27.
  Clock-trigger seeds and completions still run at every tick (a
  bookkeeper's `clockNudges` can fill a clock at any phase). The player's
  lever stays `clockNudges` (+/-1 a turn). Measured (pacing report, 200
  seeded runs): a faction's first clock completes on day 9.6 on average
  (median 9, 10-90% days 6-13), the second on 18.6, the third on 25.4; the
  first completion anywhere in town comes on day 7.2; no run finishes every
  clock by day 14, 54 of 200 by day 29.
- **Who knows a rumour** (`knownBy`). Every rumour carries `knownBy`, the
  ids of the people who know it: its source first, then for a faction's
  news (`factionId`, set by `World.completeClock`) the faction's free
  members, then anyone an engine `addRumour` names (`State.firstKnowers`,
  called by `normaliseRumour`, which also accepts an optional `knownBy` of
  known npc ids). A new game fills it for the town's rumours
  (`State.fillKnownBy` in `newGame`). `State.mergePerson` (rules version 6)
  swaps a merged person's id in it.
- **Rumours spread** (`World.spreadRumours`, from `newMorning`, after the
  weather and the conditions). Every rumour the player has not heard moves
  one step each morning. The people who share a scheduled place with
  someone who knows it (listed at the same place in the same phase, any
  phase; `npcIdsBySchedule`, not the day's visits) and do not know it yet
  are the candidates; each learns it on a 1-in-2 roll through `Rng`
  (`SPREAD_CHANCE`), and when more than two succeed two are kept at random
  (`SPREAD_CAP`). A gossip (`isGossip`: `GOSSIP_TAGS` informant, bartender,
  innkeeper, or `GOSSIP_ROLE`; moved from Pipeline to the shared helpers so
  World and Pipeline both use them) learns everything anyone at their place
  knows, for certain and outside the cap. Everyone is judged on who knew it
  at dawn, so a rumour moves one gathering a morning. Only the free tell or
  learn (`talks`: alive, status free, in town), so the dead, the far away
  and the arrested never do, and a false rumour spreads like a true one.
  The learners go through the new engine-only op `rumourSpread` ([{
  rumourId, npcIds }]; `ENGINE_KEYS`), which refuses a whole entry when
  anyone in it is not free. One World event a morning lists the rumours
  that spread. Decision left open by the review: a rumour the player has
  heard stops spreading, because nothing reads who knows it any more
  (`pickRumour` offers only unheard ones), and that keeps the morning's
  dice for the rumours that matter. Measured (pacing report): the town's
  ten rumours are each known by 4.3 people on the morning of day 2, 10 on
  day 4, 17.4 on day 7 and 31.7 on day 14; 98% of the free town knows one
  the player has not heard by day 7.
- **`Pipeline.wouldKnow` reads `knownBy`**: 5 the source of news (a rumour
  with `addedTurn`), 4 anyone else who knows news, 3 the source of an older
  rumour, 2 anyone else who knows it, 0 otherwise. `pickRumour` is
  unchanged: social actions only, the people aimed at (or everyone present
  for a plain talk), nobody at attitude -25 or below, the best pair wins.
  A gossip no longer knows all news on the spot; they hear it at the next
  morning from anyone at their place.
- **News in the Journal.** A new engine-only op, `journalNews` ([{ text,
  day? }]), writes `{ turn, day, text, kind: 'news' }` (the day given if it
  is today or earlier, else today) and never the same text twice; the
  model's `journalEntry` stays the model's. `State.apply`'s `rumoursHeard`
  now reports `result.heard` (the rumours it marked heard). After the
  bookkeeper's diff, `Pipeline.newsHeard` (called from `runTurn` in place of
  the single `rumourToldBy` line) writes "Around town: <text, final stop
  dropped> (from <teller>)." for each, and records the teller when it is
  not the source (`rumourToldBy`, as before). The teller is whoever the
  rumour was offered by; for a rumour the bookkeeper marked heard without
  it being offered, someone present who knows it (the person spoken to
  first), else nobody and the line names no one. `World.completeClock`
  writes "Around town: <the completion text>" when the completion is
  `noticeable` (the same case as the quiet feed line), dated with the day
  of the tick it happened in. The Journal tab lists them as it lists every
  entry, newest first ("Turn N: ..."); the day is stored but the tab is
  unchanged.
- **Debug tab**: each rumour line adds "known by N".
- **Older saves.** No rules version. `State.load` runs `fillKnownBy` (the
  `fillPronouns` pattern): a rumour without `knownBy` gets
  `firstKnowers`, its source and, for a faction's news, the faction's free
  members (the people the old `wouldKnow` let tell it, apart from the
  gossips and, for older rumours, the source's faction mates at weight 1,
  who now hear it in the morning like anyone else); a list already there
  keeps only people in the game, each once. A save's clocks simply roll
  half as often from the next tick.
- **SPEC.md.** Section 8 rolls the clocks at every phase change: a
  deliberate deviation, listed in README.md. Its "someone likely to know"
  a rumour is now whoever has heard it.
- **Tests.** world: the clocks roll only at the morning and evening ticks
  (forced sixes fill at those ticks and not at afternoon or night; natural
  dice draw one d6 per running clock at the evening tick and none at the
  others), a clock a nudge filled still completes and fires its clock seed
  at an afternoon tick; the spread is the same for a seed, never adds
  someone who knew it, who cannot learn or who shared no place with a
  knower at dawn, adds two non-gossips a rumour a morning at most and every
  gossip with a knower at their place; a false rumour spreads, never to the
  dead or the arrested, and someone dead, far away or in the cells tells
  nobody (and `rumourSpread` refuses them); a heard rumour stops; an older
  save gets `knownBy` at load with no rules version; news of a completion
  is known by its source and the faction's free members, offered by one of
  them, written in the journal with the teller, once; a completion in view
  is journalled with its day and turn, an off-screen one is not. state:
  the town's rumours start with their source, a faction's news lists its
  source, the faction's free members and anyone named once each, an
  unknown name refuses the rumour; `rumourSpread` and `journalNews` are
  refused from the model, `rumourSpread` refuses a whole entry with someone
  dead, far away or unknown and adds a new person once; `journalNews`
  trims, dates (a future day reads as today) and never repeats a text;
  `rumoursHeard` reports only what it newly marked heard. pipeline:
  the fresh-rumour test also has a non-source offer a rumour once they have
  heard it, with the teller recorded and both journal lines. Changed on
  purpose: world's first clock test (one roll per faction at each morning
  and evening tick, not per phase; its forced loop allows 60 phases), its
  seed test (the forced six lands at the next morning or evening,
  `rollPhase`), its news test (rewritten for `knownBy`); acceptance [12]
  (the forced loop allows 16 phases instead of 8, since six segments need
  up to twelve at two rolls a day; its three natural days are unchanged);
  playtest's pacing report (it prints the new rule, every-clock-done counts
  by day 14 and 29 and the rumour spread on days 2, 4, 7 and 14; it asserts
  a first clock around day 9 to 10, none finished by day 14, and spread that
  grows and never passes the free town, where it asserted a mean completion
  day between 5 and 16).

### 13. A granted ask stays granted (the retry lock on successes)

The review the owner agreed with (finding 5): social successes can be
farmed. The playtest asked Lyman Coker to put in a good word seven times in
one phase; every ask rolled, every one succeeded, the mock bookkeeper added
attitude each time (8 a yes), and Lyman went from 0 to 61 ("loyal") and
planted a favour. With the real bookkeeper (5 to 15 a turn) it is slower but the same,
and the narrator was told each time "OUTCOME: the ask succeeded ... The
person goes along with what the player asked". Root cause: `Dice.lockFor`
returned the lock key only for `failure` and `critical_failure`, so SPEC.md
section 7's "the same roll can't be retried immediately unless the situation
changes" held only after a failure, and a success cleared the lock.

- **Every roll locks.** `Dice.lockFor(result, key)` returns the key for
  every tier. `Pipeline.resolve` stores a record with it, `meta.lastRoll`
  (`Dice.lockRecord`): `{ key, outcome, line, granted }`. `outcome` is
  `granted` (critical, success or partial: `Dice.outcomeOf`) or `failed`;
  `line` is the roll line; `granted` lists the asks granted in this scene
  (`[{ key, words, line }]`, at most 8, carried over to the next roll's
  record while its place, day and phase are the same, so rolling something
  else in between does not reopen them). The key itself is unchanged
  (action type, stat, targets, item, place, day, phase).
- **What the player asked for.** `Dice.askWords(text, skip)`: the input (a
  command's own name left off) lowercased, apostrophes dropped, a plural
  "s" folded, and stop words (function words, fillers, contractions and the
  verbs of asking: ask, persuade, convince, tell, try, beg, say, talk) and
  the names of the people it is aimed at left out; sorted and unique.
  `Dice.sameAsk(was, now)`: an ask with no content words of its own
  ("Please?") is the same; otherwise it is the same when at least 60 per
  cent (`SAME_ASK_SHARE`) of the shorter ask's words are in the other. "I
  persuade Lyman Coker to put in a good word for me" is {good, put, word};
  "Come on, put in a good word for me" is the same ask, "lend me twenty
  dollars until Friday" a new one. A threshold on the shorter ask means a
  repeat with more words added ("... with your boss") is still the same.
- **What a repeat gets** (`Pipeline.resolve`; `/reroll` and `/cheat`
  bypass all of it). An ask granted under this key in this scene that the
  words repeat (`Dice.grantedAsk`): in Say or a social action,
  `ctx.granted = { key, line, name }` (`agreedBy`: the person spoken to,
  else the only person here it was aimed at), no roll, and the scene
  answers; anything else (a lock picked again, a search made again) gets
  the locked notice and nothing is spent. Otherwise, when the lock holds
  and its latest roll failed (`Dice.lockedOutcome`), the behaviour of
  before: `ctx.pressed` in conversation (its roll line now from the
  record, else the log as before), the notice otherwise. Otherwise (no
  lock, or a different ask after a granted one) it rolls, and the record
  takes the new roll.
- **The packets.** For a granted repeat the narrator gets, right after
  `ROLL: none` where SAME ASK AGAIN goes for a failed one, `ALREADY GRANTED:
  the player asked this before and <name> agreed (<roll line>); there is no
  new roll and nothing more is gained. Show them noting it is already
  settled (a shrug, "I said yes", mild impatience) and move the scene on;
  grant nothing further.` ("the people here" when no one person said yes).
  There is no OUTCOME line, since nothing was rolled. The bookkeeper gets
  the same fact and "Record no attitude change, no memory and nothing
  gained; no move." The mock narrator says "<name> already said yes."; the
  mock bookkeeper records nothing on such a turn.
- **The notice.** `NOTICES.locked` covers both cases: "You already tried
  that here. Change something first: a different approach, something to
  use or offer, another place, or let time pass (/wait or /rest)." (It
  said "You just tried that and it failed.")
- **The lock lifts as before** once the situation changes: a new place,
  phase, day, target, stat or item makes a new key, and `runTurn` lifts it
  after a turn without a roll that moved the player, passed a phase or took
  time. One change there: a turn answered as SAME ASK AGAIN or ALREADY
  GRANTED does not lift it just by taking time (a real parser may call the
  repeat short), only by a move or a new phase, so a third identical ask is
  not rolled either. `State.apply` gains the engine-only `lastRoll` op
  (`Dice.cleanLock`; it must be the record of the current `lastRollKey`; a
  malformed one is refused, and the model may not send it), and a
  `lastRollKey` change without `lastRoll` in the same diff drops the
  record, so a record never outlives its key (the tests' and `runTurn`'s
  `lastRollKey: null` clear both). `/undo` restores both with the snapshot.
- **Older saves.** No rules version. `State.load` fills `meta.lastRoll`:
  null when it is missing, malformed or not the current lock's. A lock with
  no record can only come from before this change, when only failures
  locked, so `Dice.lockedOutcome` reads it as `failed`: exactly the old
  behaviour.
- **Cost.** Nothing on ordinary turns. The ALREADY GRANTED lines (about 70
  tokens each) go out only on a repeat, which has no OUTCOME line.
- **SPEC.md.** Not a deviation: section 7 never limited the rule to
  failures, and this brings the lock in line with it.
- **Not covered.** A roll of something else in between keeps a granted
  ask settled, but a failed roll is still reopened by one (as before), and
  any turn without a roll that takes time lifts the whole lock (as before).
  Rewording an ask in quite different words ("tell your boss I'm a hard
  worker" after "put in a good word for me") is a new ask by the words and
  rolls; the narrator and the bookkeeper still see the scene.
- **Tests.** pipeline: a granted ask asked again is settled (ALREADY
  GRANTED in both packets, no roll, no attitude change or memory, no
  notice, the lock kept when the repeat takes time), reworded in Say it is
  the same ask, a different ask to the same person rolls and the lock
  keeps both, going back to the first is still settled, and a new phase
  lifts the lock so the same ask rolls; something done that is not an ask
  and done again gets the notice whatever came between, a different
  attempt rolls, and a move lifts the lock; an older save with a lock and
  no record plays (SAME ASK AGAIN), the next roll writes the record, and a
  reload keeps it. state: `askWords` and `sameAsk` on examples, every tier
  locks, and the record's rules in `State.apply` and `State.load`. Changed
  on purpose: the notice's wording in acceptance check 3 and in the two
  pipeline lock tests; the `/reroll` test (a success now sets the lock, as
  granted, where it cleared it; `/reroll` still goes past it); the Dice
  unit test in the state suite (a success and a partial now lock); and the
  playtest's favour, which asked the same thing seven times and now asks
  seven different things, asserting along the way that the identical ask
  in the same phase gets ALREADY GRANTED and no gain (Lyman still ends at
  61, and the run is one turn longer). The pacing report is unchanged.

   Where this meets direction change 12 (rumours spread): `Pipeline.pickRumour`
   offers no rumour on a turn answered as SAME ASK AGAIN or ALREADY GRANTED.
   Nothing is gained on such a turn and the bookkeeper records nothing, so a
   rumour shown in that narration would never be marked heard and would be
   told again next turn (the merged playtest caught exactly that: Lyman, a
   gossip who had picked up a rumour by the morning spread, told it on a
   repeated ask). The pipeline suite checks all three cases.

### 14. Seeds are events: effects on seeds, loose ends that fit anywhere, a hook on day 1

The review the owner agreed with (findings 3 and 7): seeds are sentences,
not events, and nothing pulls on the player for the first two days. A fired
`seed_big_run` told the narrator that Chief Bell was at Purvis Landing
photographing tracks, but his schedule still had him at the Old Bridge, so
walking to the landing found nobody; `seed_tackle_box` described a tackle box
on a girder that was not a thing anyone could find or take. A loose end's
person was brought to wherever the player stood, with text written for one
place: in the playtest Carter "slides into the booth across from Tester" at
the motor court, and the enemy showed a photo "to the night clerk at the
Riverview" wherever the player was. The loose-end seeds fired on days 2 to 8
and the arrival carried no hook. Root causes: `State.normaliseSeed` kept only
the effect text, the trigger and the bookkeeping fields, and `World.fire`
turned a seed into a due event and nothing else; the five
`LOOSE_ENDS[kind].seed.effect` templates named a venue; `Town.resolveLooseEnd`
gave every loose end a day from its window, never earlier than tomorrow.

- **Seeds carry effects** (`State.normaliseSeed`, `seedEffects`,
  `checkEffect`). An engine seed (the `plantSeed` effect, so a clock's seeds,
  loose ends, grudges and favours) may carry `effects`, a list of effect ops,
  checked when it is planted the way the town check reads clock effects: a
  known op, the fields it needs and ids that exist (`locationId`, `npcId`,
  `threadId` or a thread an earlier effect in the same list opens, the
  factions of `factionRelation` and `reputationDelta`, no reserved flag, a
  `placeItem` thing with a name, no `visit` or `placeItem` out of town), at
  most `SEED_EFFECTS_MAX` (6). One bad effect refuses the whole seed, with its
  index in the reason (`effects[1]: unknown op "teleport"`). A copy is
  stored. The town's own seeds come into a new game through
  `Town.instantiate` as they are written, checked by `tests/validate-town.cjs`
  and `Town.validate`. The model's `newSeeds` keep no effects: no property
  was added to `record_changes` (docs/API_NOTES.md: it sits near the
  compiled-grammar limit), and any `effects` the model sends are left out,
  with "its effects were left out: the model plants none" on the applied
  line. `notBeforeTurn` and `origin` are engine-only too.
- **They run when the seed fires** (`World.fire`). A seed that fires live
  queues its due event as before and then runs its effects through
  `applyEffects` (`State.apply`, source `world`). An effect refused at that
  point (a thread a clock closed, a bad field the plant-time check does not
  look at) goes to the debug log like any refused world change and never
  fails the turn; the world events note "N effects, M rejected". The no-op
  path (a loose end, grudge or favour whose person is no longer free) runs
  none. `World.dueSeeds` also makes a seed's `visit` effects again for the
  phase its event is told in, when the person is not there already, because
  the narration says it is so and a `/rest` or `/wait` may pass between the
  firing (step 11 of one turn) and the telling (step 6 of the next).
- **Two new effect ops** (`EFFECTS` in State, so `EFFECT_OPS`, `Town.validate`
  and the validator's op table follow). `visit { npcId, locationId }`: the
  person is at that place for the current day and phase only, through the
  same `visits` entry a loose end's person gets (`addVisit`, now shared with
  the `visits` engine op). Like `npcMove` it is a no-op for someone arrested,
  gone or dead, and for a closed place; it is also a no-op for someone who
  is with the player somewhere else, so nobody vanishes from the scene the
  player is in (the pipeline's fight test caught Chief Bell being taken from
  a fight at Pittman's by the telling of `seed_big_run`); out of town it is
  refused. `placeItem { locationId, item: { name, qty?, notes? } }`: a scene
  item (`addSceneItem`, id `item_<name>`), in ITEMS HERE for the parser, the
  narrator and the bookkeeper until `itemsGained` takes it; the same name
  again adds to the pile; out of town it is refused. Both are in the
  effect-ops table above.
- **The town's seeds carry effects** where the text says the town changed.
  `seed_big_run`: Chief Bell and Wade Purvis visit Purvis Landing.
  `seed_tackle_box`: a "tackle box" at the Old Bridge (notes: the pill
  bottles and the prepaid phone). `seed_council_agenda`: the flag
  `policeVoteOnAgenda` and Chief Bell at Town Hall. `seed_lease_letter`: the
  land company and the Night Run sour on each other (`factionRelation` -10;
  the clock that pulls the lease does -20 more). `seed_engineer`: the flag
  `engineerWithdrew`. `seed_vada_doctor`: the flag `vadaNewWill`. No prose
  changed. Left without effects: `seed_overdose` (Tammy Lott "is telling
  everyone at the Low Water", but the Low Water opens at eleven and she is
  at home in the morning, when a day seed usually fires, and her story
  already travels as `rum_colt_pills`), and the three seeds clocks plant
  (`seed_vada_envelope`, `seed_hollis_deal`, `seed_travis_phone`): each
  asks the player to take something, which happens only if they agree, and
  an `npc` trigger fires wherever they meet, so there is no fixed place for
  a `placeItem`. No seed adds a rumour: its due event already tells the
  news, and a rumour would tell it a second time. The flags, like the
  clocks' flags, are kept for the Debug tab and later rules; nothing reads
  them yet.
- **Loose ends fit anywhere.** The five templates name no place and no
  furniture, since the person comes to wherever the player is, on any day:
  the creditor "comes straight up to {player} without a hello, holds out a
  folded printout with {player}'s name and the amount on it"; the enemy
  "turns up holding out a phone with a photo of {player} on it, asking
  anyone nearby whether they have seen this face, and goes still on finding
  {player} right there"; the one with the secret "draws {player} aside" and
  says a true detail "low enough that nobody else can hear"; the record
  keeper "seeks {player} out" (no "leaves word at the Low Water"); the
  bartender hands over "an unsigned envelope, left by a trucker passing
  through" (no "behind the bar"). Still one sentence each, `{npc}` and
  `{player}` in each, and `tests/mentions.cjs` passes.
- **A hook on day 1** (`Town.resolveLooseEnd`, `World.ready`). The first
  loose end the player picked (no loose end resolved yet when it runs) gets
  `trigger { type: 'day', value: <today> }` and `notBeforeTurn: <turn> +
  FIRST_HOOK_TURNS` (2): day 1 and turn 2 in a new game, so it fires at step
  11 of the player's second turn and is due on the third, with its person
  brought to wherever the player stands. The arrival is turn 0 and fires no
  seeds. Its day is still rolled from the window, so the seeded stream, and
  every person, weather and day drawn after it, is what it was. The other
  loose ends keep their windows. `World.ready` holds a seed while
  `meta.turn` is below `notBeforeTurn`, as it holds one before
  `notBeforeDay`. Direction change 10 already put the player's goal and
  loose ends in the arrival's ACTION and every packet, and lets the loose
  end's person speak of the shared past on day 1, so the third narration
  has the creditor knowing the debt.
- **Debug tab**: a seed line adds "(not before turn N)" and "then visit,
  placeItem, ..." (the ops it will run).
- **Older saves.** Nothing to fill and no rules version: a seed without
  `effects` or `notBeforeTurn` behaves as before. A save carries its own
  copy of the town's seeds, so a game begun before this keeps sentence-only
  town seeds and its loose ends' old texts and days.
- **SPEC.md.** Section 5's example ("plants a seed that they come to collect
  around day 3") and section 14's acceptance test 5 ("the lender confronts
  the player around day 3"): the first loose end picked now comes on day 1;
  a debt picked second or third still comes around day 3. Section 8 says a
  fired seed becomes a due event; an engine seed may now also change the
  town. Both are listed in README.md's deviations.
- **Cost.** No call and no packet line is added. The cost report's 15 inputs
  start with the debt picked first, so its person now comes into the scene
  on the third input (one more PRESENT line while they stay, one DUE EVENT):
  the narrator packet averages 8,339
  characters (11,980 at most), about 2,380 tokens, where it was 8,168 (11,455
  at most); an ordinary turn $0.0321 to $0.0382, 100 turns about $3.21 to
  $3.82 (README.md, What a turn costs).
- **Tests.** state: a seed planted with effects and `notBeforeTurn` keeps a
  copy of both; a seed without has neither field; an unknown op, person,
  place or thread, a `visit` out of town, a nameless thing, a reserved flag,
  too many effects or a non-list refuse the whole seed with the reason; a
  thread opened earlier in the list counts; the model's `newSeeds` keep no
  effects, `notBeforeTurn` or origin and say so; `visit` through `State.apply`
  (there this phase and nowhere else, gone the next, a no-op for the dead, a
  closed place and someone with the player, refused out of town and from
  the model); `placeItem` (one pile, its id from the name, refused out of
  town and without a name); `Town.validate` finds a seed's unknown op,
  unknown person and nameless thing. world: a seed with effects held by
  `notBeforeTurn` after the first turn, fired after the second with its
  visit (this day and phase), thing and flag, a refused `npcMove` in the
  debug log while the rest applied, its event told in the same phase, the
  visit gone the next phase, a later seed's visit made again when its event
  is told after a `/wait`, someone with the player left in the scene, a
  no-op seed (its person gone) that changes nothing, and the thing picked up
  through a turn; the town's own seeds, fired one by one, put their people,
  things, flags and faction relations where their text says; the first
  loose end fires after the second turn, its person comes to the player and
  it is told on the third, on day 1, the others keep their windows, and no
  loose-end text names a place (any name, map label or other name of one).
  content: `validate-town.cjs` refuses a seed effect with a mistyped op and
  one naming a person who does not exist. The validator checks seed effects
  like clock effects (1 to 4 a seed, the new ops' fields, a `visit` only by
  someone in town, a short lower-case item name, qty 1 to 99, notes up to
  120 characters) and registers the ids they create; its summary counts
  them. playtest: the first loose end reaches the narrator on day 1, turn 3,
  with its person present, and a fired seed's thing (the tackle box) is still
  where it was left. Changed on purpose: state's loose-end test (the first
  loose end is day 1 with `notBeforeTurn` 2, the rest in their windows);
  world's debt test picks the debt second, the generic seed test starts with
  no loose ends (the hook would be due beside its test seeds), and the
  schedules test allows for someone on a visit; acceptance [5] picks the
  debt second and keeps "around day 3", and first checks that the secret
  picked first is told on day 1 on the third turn with its person present;
  the effect-ops list test expects the two new ops.

### 15. Faster, cheaper turns

The review the owner agreed with (finding 8): each turn is three serial
calls and the input stays locked until the third returns; the parser and
bookkeeper packets carry the whole cast every turn, uncached (the parser's
averaged 11,000 characters); moving those lists into a cached system block,
letting the player type while the bookkeeper finishes, and using Haiku for
the parser would cut the felt wait and the cost. Root causes:
`Pipeline.parsePacket` wrote EVERYONE ELSE IN TOWN (every unmet person with
ties), NOT IN TOWN and OUT OF TOWN into the user message, and
`Pipeline.bookkeeperPacket` wrote EVERYONE ELSE IN TOWN and FACTIONS, so
about 6,000 tokens a turn went at the full input rate; one "Parser model"
setting (`Api.roleModel`) drove the parser, the bookkeeper, the chronicle
and every Upgrade call, so the parser could not be made cheaper without the
bookkeeper; and `UI.setBusy(true)` held Send off until `runTurn`'s
`finally`, after the bookkeeper. One finding of our own: the textarea was
never disabled during a turn (only Send, and Enter through `UI.send`), so
the box always took typing; what the player lacked after the narration was
the focus (a turn sent with the mouse left it on the disabled button), any
sign that the turn was closing, and a failure after the narration lost the
failed action when something had been typed meanwhile.

- **Cached cast lists for the parser and the bookkeeper.**
  `Pipeline.parserBlock()` (beside `castBlock` and `townBlock`):
  `EVERYONE IN TOWN (the whole cast, one a line; ...)`, then one line per
  person in town (`id — Name (pronouns; role; ties)`, `tieWords`), then
  `NOT IN TOWN (dead, or living elsewhere; ...)` and `OUT OF TOWN (never a
  destination; ...)` as they were in the message. `Pipeline.bookkeeperBlock()`:
  `EVERYONE IN TOWN (the whole cast, one a line: ids you may use; ...)`, one
  `who(n)` line per person in town, then `FACTIONS:`. Both list the whole
  cast rather than the people not met yet, and are built from the records
  alone (never knownToPlayer, attitudes, where anyone is now, what is
  discovered, nor arrests), so they stay byte-identical until the cast
  itself changes: an edit, a merge, a death, someone leaving town.
  `parsePacket` sets `packet.block = parserBlock()`, and its text drops the
  three lists (it keeps PLAYER INPUT, MODE, TIME, PLAYER, LOCATION, NPCS
  PRESENT with attitudes and looks, ITEMS HERE, INVENTORY, OTHER KNOWN NPCS
  and OTHER PLACES IN TOWN); the structured fields the mock parser reads
  (`present`, `knownNpcs`, `cast`, `absent`, `away`, ...) are unchanged.
  `bookkeeperPacket` drops EVERYONE ELSE IN TOWN and FACTIONS and says, under
  IDS YOU MAY USE, `EVERYONE ELSE AND THE FACTIONS: in the system prompt
  (EVERYONE IN TOWN, FACTIONS).`; `runTurn` passes `block:
  bookkeeperBlock()` to `Api.bookkeep`. `SYSTEM.parser` names the lists
  ("EVERYONE IN TOWN, after these instructions, has the whole cast (the
  message says who is here and whom the player knows), and NOT IN TOWN the
  dead and the people who live elsewhere") where it named EVERYONE ELSE IN
  TOWN.
- **The request.** `Api.requestBody` takes `cache: 'last'` beside the
  narrator's `cache: true`: the system prompt becomes `[{ type: 'text',
  text: prompt }, { type: 'text', text: block, cache_control: { type:
  'ephemeral' } }]`, one breakpoint on the block. The parser prompt alone is
  about 550 tokens and the bookkeeper's about 340, close to or under the
  512-token minimum, so the brief's fallback (merge the block into the
  prompt) is not needed: a breakpoint caches the whole prefix up to it, so
  prompt and block cache together (about 3,340 and 1,360 tokens), and the
  prompt is never padded. `Real.parse` and `Real.bookkeep` send
  `packet.block` (built on the spot when a caller left it out);
  `messageCall` passes `blocks` and `cache` through. The chronicle and the
  Upgrade calls stay uncached (a short prompt, every ten turns or once).
  `MAX_TOKENS` and `PRICES` were checked and need no change (Haiku's cache
  read is already $0.01).
- **A model per role.** `Storage` settings gain `bookkeeperModel`;
  `parserModel` now drives the parser only. `Api.roleModel`: narrator ->
  `narratorModel`, parser -> `parserModel`, everything else (bookkeeper,
  chronicle, memories, places, clock, people) -> `bookkeeperModel`. Defaults:
  parser `claude-haiku-5-5`, bookkeeper `claude-sonnet-5-5` (narrator
  unchanged). `SETTINGS_VERSION` 3; `cleanSettings`: below version 3 a saved
  parser model equal to its version's default (v1 Haiku, v2 Sonnet) becomes
  the new pair, Haiku parser and Sonnet bookkeeper; any other saved value
  was typed by the player and is kept for both fields; from version 3 both
  are read as saved (an empty one falls back to its default). The v1 rules
  for the narrator and an all-low effort set are unchanged and still apply
  to v1 only. The settings screen shows Narrator, Parser and Bookkeeper
  model (with their defaults as placeholders) and one line under them, tied
  by `aria-describedby`, saying what each does and its default.
- **Debug.** `Api.usage.byRole` keeps the session's totals per role and
  model (`record(model, raw, role)`); the Debug tab's API section lists them
  under the session line (`  parser claude-haiku-5-5: 2 calls, in 600, out
  160, cache read 1200, cache write 1200, $0.0003`), so the parser's and the
  bookkeeper's cache reads show on their own. The turn and session lines
  are unchanged.
- **Typing while the turn closes.** The composer has three states
  (`UI.setBusy(true | 'closing' | false)`, `UI.turnPhase`, `data-turn` on
  `.composer`): `busy` from the start of a turn to the end of its narration,
  `closing` from `runTurn`'s narration (after the style check and any
  refusal check) until its `finally`, while the bookkeeper and any chronicle
  run, and `idle`. Closing counts as busy for everything that checks
  `busy` (New game, Continue, Load, Import, Update, the map's Go, People
  edits, Turn on the narrator), Send stays disabled (its title says
  "Finishing the turn: you can type your next move"), Enter and Wait do
  nothing, and `Pipeline.busy` stays true, so `submit` (commands, `/undo`,
  `/load`) and `App`'s loads refuse as before. What closing adds: on a
  laptop the focus returns to the box unless the player has put it
  somewhere else, so the next line can be typed at once; the placeholder is
  unchanged. The typed text is kept when the turn closes and Send comes
  back. `UI.send`: a failed turn (restoreInput) puts its text back in the
  box as before, and a line typed while it ran now follows it on a new line
  instead of displacing it. The bookkeeper still runs inside the turn,
  never in the background of the next one (the snapshot and `/undo` model
  stays as it was). `arrival` has no bookkeeper and does not use closing.
- **Mock.** `Mock.calls` records `block`; a queued bookkeeper reply may
  carry `delay` (ms), honoured before an error or a refusal too, for the
  tests of the closing state. The mock parser and bookkeeper read the same
  structured fields as before.
- **Older saves and settings.** Nothing is stored in a save. Settings move
  to version 3 at load as above; nothing else changes.
- **Cost** (README "What a turn costs", from the playtest's cost report,
  which now prices each role's cached prefix at the cache-read rate and the
  message and schema at the input rate, and counts the narrator's town
  block, which it had left out). The parser's message fell from 10,980
  characters on average to 2,785 and the bookkeeper's from 5,462 to 2,895.
  An ordinary turn is $0.0213 to $0.0261 (it was $0.0318 to $0.0380), 100
  turns about $2.13 to $2.61; at the new models with the lists still in the
  messages it would be $0.0241 to $0.0288. The first call of a session
  writes each cache: narrator +$0.0656, parser +$0.0004, bookkeeper
  +$0.0031.
- **SPEC.md.** A deviation, listed in README.md: sections 6 and 13 give the
  bookkeeper and the chronicle the parser model; they have their own
  Bookkeeper model setting. The Haiku parser default is SPEC.md's own.
- **Not covered.** There is no API key in this session: the request shape is
  checked against canned responses (`tests/api.test.cjs`), but neither the
  API's acceptance of the two-block system prompt nor real cache reads on
  the second parse and bookkeeping, nor Haiku's parsing on this game's
  packets, were checked live. README "Verified against the live API" says
  what to look for in the Debug tab.
- **Tests.** api: the request test now checks a model per role (Haiku
  parser, Opus narrator, Sonnet bookkeeper; a bookkeeper model setting
  moves the bookkeeper and the chronicle, not the parser), the parser's
  and the bookkeeper's system as two blocks with `cache_control` on the
  second only, the blocks' heads, that they list everyone in town and stay
  byte-identical after the player meets someone, that each prefix is over
  512 tokens counted low, and that the messages no longer carry the lists;
  the usage test prices the Haiku parser and shows the parser's and the
  bookkeeper's cache writes and reads per role in the Debug tab; the
  chronicle runs on the bookkeeper model; the cast test reads the parser's
  cast from its block. settings: the new defaults and version 3, both
  upgrade rules (old default to Haiku plus Sonnet, from v1 and from v2; a
  typed model kept for both, from v1 and from v2), v3 read as saved, an
  emptied field back to its default, and the screen saving the bookkeeper
  field. pipeline: a new test drives a turn with a slow narrator and a slow
  bookkeeper: busy during the narration, closing once it is in (narration
  shown, bookkeeper not answered, focus back in the box after a mouse
  Send, placeholder unchanged), typing works, Enter, a submit, `/undo`,
  `/load`, `App.loadSlot`, Continue and New game are refused, the typed
  line survives the end of the turn and then sends as the next one; a
  delayed bookkeeper error puts the action back with the typed line after
  it and keeps nothing of the turn; with nothing typed, an error or a
  refusal after the narration restore the action as before. shell: the
  settings screen shows the three model fields with their defaults and the
  line under them, and saves the bookkeeper field. playtest: the cost
  report, as above, asserting every cached prefix is over 512 tokens, the
  blocks went with every call and never changed in the session, the
  parser's message is under 6,000 characters, and caching makes a turn
  cheaper. Changed on purpose: the pipeline checks that the parser hears
  the cast, the dead and the far away and the places out of town now read
  its block (`lastBlock`); the secret test also scans the two new blocks;
  the state suite's settings version is 3; the upgrade suite's labels say
  the bookkeeper model (the model asserted is the same, Sonnet).

   **The parser back to Sonnet** (owner, 30 Oct 2026: "Put the parser back
   to Sonnet. I want the best playthrough not the cheapest. But if haiku
   makes sense somewhere where sonnet would be overpriced then haiku it
   is."). The parser is not that place: it sets the difficulty of every
   roll, and since a social success is binding (direction change on 28 Oct)
   the difficulty is where all the doubt lives; a parser that calls a very
   hard ask normal makes the world push back less than it should, and
   nobody had checked Haiku on these packets live. Nowhere else in the
   pipeline is Sonnet overpriced: the bookkeeper writes what people
   remember, the chronicle is the narrator's long-term memory, and the
   Upgrade calls are judgement too. So `Storage.DEFAULTS.parserModel` is
   `claude-sonnet-5-5` again, the Parser and Bookkeeper fields stay (Haiku
   is one edit away), and the settings version is 4: a v3 parser left at
   Haiku follows Sonnet, a typed one is kept, and the v1 and v2 rules are
   unchanged (a parser at its version's default takes both defaults, a typed
   one is kept for both roles). The cost report measured the turn again
   (README "What a turn costs"); the api, settings and shell suites assert
   the new default and the v3-to-v4 rule.

### 16. Work and trouble: paid jobs and fights that come to the player

The review the owner agreed with (finding 9): money and fights are thin.
There is nothing to spend cash on and no way to earn it, yet the debt loose
end demands it; fights are one roll each and nobody ever starts one; a few
paid jobs (a shift at Pittman's, a night on a johnboat) would give the
economy and the factions a way in. Root causes: the only source of money
was a favour seed's sentence ("a day of cash work that pays a hundred
dollars"), told and never paid; an `attack` was the only way into a fight
(`Pipeline.resolve`), so a grudge that "pays two men to catch {player}
alone after dark ... and give them a beating" was narrated, cost nothing
and named two men the fixed cast does not have.

- **Jobs are content** (`JOBS`, after `FAVOUR_TEMPLATES`, exported with
  the rest and on `Game.data`; the shape is under "Jobs" above). Seven: a
  shift in the service bays at Pittman's for Dewayne (might, normal,
  $60-80), a shift at the bait shop for Lorna (might, easy, $40-55), a night
  on a johnboat for Wade (stealth, hard, $150-250, the Night Run, every
  three days: on success reputation +5 with the Night Run and the flag
  `ranWithNightRun`, which the police clocks may read later; on failure
  reputation -5 and the rumour `rum_johnboat_stranger`, from Travis Cagle,
  so the police know), a day's hauling at the Haskins farm for Lamar
  (might, normal, $50-70, once only; on success Lamar +10), turning over
  rooms at the motor court for Mavis (no roll, $30-45, out of the till), a
  seat at the card game at the Low Water with Curtis (charm, normal, a
  stake of $40-120) and a day in the back room at Byrd's for Hollis (wits,
  normal, $40-60). Each giver is scheduled at the place in every phase the
  work is offered. `tests/validate-town.cjs` checks it all (the keys, ids,
  a lower-case label, a one-sentence blurb, the giver here and scheduled,
  the pay range, a stat with a difficulty or neither, the time, the
  faction, repeatable, a cooldown of 1 to 14 days, a stake only with a
  stat, effects checked like a seed's, whose ids count), `tests/mentions.cjs`
  scans the text, and the summary counts the jobs.
- **What is on offer** (`Town`): `jobs()`, `job(id)`, `jobsAt(locationId,
  phase?)` (a place's jobs, in a phase), `jobsOnOffer(locationId)` (the
  place open, the phase right, the giver free and there now: schedule or
  visit), `workDone(jobId)` (state.work), `jobStatus(job)` ('done for
  today', 'again from day N', 'done') and `jobRefusal(job, locationId)`:
  one plain line, or null, for nobody hiring here, another place's job, a
  closed place, a giver dead, in a cell or gone, the wrong phase ("The
  mechanic hires for a shift in the service bays at Pittman's in the
  morning and afternoon, not in the evening."), the giver not here right
  now, a giver at attitude -25 or below (`JOB_COLD`: "will not take you on
  (cold)"; a decision of ours, so a beaten man does not hire his
  attacker), work done for good, a cooldown ("You already did ... today.
  There is more tomorrow."), and a stake with less cash than its low end.
  The giver is named by `npcLabel`, as everywhere for someone not met.
- **The parser** (`Pipeline.parsePacket`, `workLine`). The packet gains
  `jobs` (for the mock) and, when anything is on offer here, the message a
  last line `WORK ON OFFER HERE: job_service_bays — a shift in the service
  bays at Pittman's (for Dewayne Mangum; pays about $60-80; takes the rest
  of the phase)` (a stake reads "with Curtis Pruett; win or lose about
  $40-120"). The line goes in the message, not `parserBlock` (it changes
  with the place and the phase; the cached block stays byte-identical). It
  is listed whether or not the player has done it today, so asking again
  gets the plain refusal rather than a guess. `SYSTEM.parser` gains one
  short sentence ("WORK ON OFFER HERE, when the message has it, is paid
  work here: if the player takes it or asks for it, actionType is work and
  targets holds its job id; the engine sets the roll, the pay and the
  time."), and Say mode's MODE line adds "or work when the words take or
  ask for the WORK ON OFFER HERE" when there is any. `ACTION_TYPES` gains
  `work`, an enum value of `parse_action` (no property is added to either
  schema; `record_changes` is untouched). `sayAction` leaves `work` and its
  time alone ("Deal me in." in Say mode is taking the seat), and a job id
  among the targets of anything but work is dropped before step 4 (asking
  about the work is not taking it, and a job is nobody to look for).
- **The mock parser** (`MOCK_WORK`): in Do mode, with work on offer, "work
  a/the/for", "take the job", "a shift", "a job", "hire me", "deal me in",
  "for work" and "any work" are work, aimed at the job whose giver or label
  the words name, else the first. Asking what work there is, or persuading
  someone, stays talk or persuade; with nothing on offer it is what it was.
  A walk and then work ("I head to the landing and ask for a job") cannot
  see the destination's jobs: it is work with no job id, and the engine
  finds the job there. Say mode is unchanged (its tests say "hire me" as a
  plea).
- **Taking it** (`runTurn`). After `walkFirst`, a work action goes through
  `takeWork`: the job is its id in targets, else the job here of someone it
  is aimed at, else the first on offer here (a `/reroll` replays an action
  whose only target is already the giver); a refusal ends the turn with the
  line, the snapshot restored and nothing spent, the walk included, as
  `refuseAway` does (`refuseWork`). Otherwise the action becomes the job's:
  its stat and difficulty (or no roll), its `timeCost`, the giver as its
  only target, no missing item. The roll goes through `resolve`, so the
  retry lock and `/reroll` and `/cheat` treat it like any roll; the
  cooldown makes the lock moot in practice (a key holds for one phase, a
  job for a day). Right after `resolve`, `settleWork`: a critical pays the
  top of the range, a success a sum in it (`Rng.int`), a partial the low
  end, a failure nothing; no stat, a sum in it; a stake is won the same way
  and lost on a failure (a sum in the range, the top on a critical
  failure), never more than the player has. The money goes in as the
  engine's `goldDelta`, then the job's `onSuccess` (success, partial,
  critical, or no roll) or `onFailure` through `State.apply({ effects })`,
  then `workDone` and the journal line through `journalNews` with `kind:
  'work'` ("A shift in the service bays at Pittman's for Dewayne Mangum:
  paid $70.", "... with Curtis Pruett: lost $55."), and a quiet feed line
  ("You are paid $70 (cash $210)."). The time passes at step 10 as the
  action's own. A critical failure can still bring a lasting consequence,
  as any roll's does.
- **The packets.** The narrator gets, right after ROLL, `JOB: <label>, for
  <giver> (<blurb>): it goes fine; paid $70. The work takes the rest of the
  <phase>: tell it in a sentence or two and end on the money; nothing else
  is paid, won or lost.` (one wording per outcome and for a stake). The
  bookkeeper gets, under ALREADY APPLIED BY THE ENGINE, `the job, <label>
  for <giver id> (<outcome>): the pay, goldDelta +70, and its time; record
  no goldDelta this turn`, and `runTurn` drops any `goldDelta` it sends on a
  work turn (debug: "ignored: the engine already settled the job (+70)").
  The mock narrator says "You put in <label> for <giver>: paid $70."; the
  mock bookkeeper introduces the giver.
- **State.** `state.work` ({ jobId: { day, turn, times, outcome } }) is
  written only by the new engine-only op `workDone` ({ jobId, outcome }).
  `journalNews` takes `kind: 'work'`: such a line may repeat on another
  turn (the same shift on another day), never twice in a turn; news still
  never repeats.
- **Fights that come to the player.** A new effect op, `fight` ({ npcId,
  reason? }; in `EFFECTS`, so `EFFECT_OPS`, `Town.validate` and the
  validator's op table follow; `checkEffect` checks the person when a seed
  is planted). It rolls nothing: it leaves `{ id, npcId, reason?, seedId?,
  day, turn }` in `state.fights`, a no-op for someone not free or not in
  town, or with a fight already waiting. `World.fire` hands a seed's fight
  its seed id, so it waits for the telling. At step 6, after
  `World.dueSeeds`, `Pipeline.comeAt` fights the first one ready: a seed's
  fight on the turn that seed's due event is told (it waits while the event
  waits, and is dropped when the event went without it), any other on the
  next narrated turn; anyone no longer free drops theirs (engine-only
  `fightDone`). The person is brought to the player for the phase (a
  `visits` entry) and the scene re-read; the player defends with
  `Dice.resolve`: might, normal, +2 with a knife or a gun on them
  (`carriedAs`, the bonus `usesItemId` gives an attack), a natural 20
  earning a story point; a failure costs 1 to 3 HP and a critical failure
  3, added to `ctx.damage` with `ctx.defeated`, so DAMAGE, DEFEAT, the
  bookkeeper's hpDelta guard and `defeat` work as for a lost attack. It
  never touches the retry lock. `defeat` names as the foe someone who came
  at the player and hurt them, else the person the action was aimed at. A
  critical failure brings no lasting consequence on top of its 3 damage.
  The narrator gets `ATTACKED: <name> comes at the player (<reason>); the
  player did not start it and defends. <roll line with complication>.
  <what it means>` before DAMAGE; the bookkeeper "<id> came at the player,
  who defended (<roll line>)"; the mock narrator "<name> comes at you;
  might roll, failure: you get the worst of it." Test hook:
  `Pipeline.hooks.fightD20` forces the defending die once (else the
  `/undo` salt applies, as for any roll).
- **The grudge that comes to blows.** The template "{npc} pays two men to
  catch {player} alone after dark behind the Low Water and give them a
  beating as a warning." is now "{npc} has had enough of {player} and comes
  straight at them with both fists, done talking." with `effects: [{ op:
  "fight", npcId: "{npc}" }]`: nobody made up, and no venue, since the fight
  finds the player wherever they are. A grudge or favour template may carry
  `effects` (fight, visit or attitudeDelta, `npcId` "{npc}"; checked by the
  validator against someone in town); `World.plantFeeling` copies them onto
  the seed with "{npc}" as that person and gives a fight its reason, the
  memory behind the grudge (`a grudge: "insulted me twice"`). Cheap edit,
  as B2 suggested: the favour "leaves word for {player} at the Low Water
  about a day of cash work" now "tracks {player} down to pass on word of a
  day of cash work", since it reaches the player wherever they are.
- **UI.** A place's sheet (Places tab) has a "Work here" row (`workText`:
  "A shift in the service bays at Pittman's (for Dewayne Mangum, morning
  and afternoon)", the giver by `npcLabel` until met, "; done for today" or
  "; again from day N" or "; done" once worked). `/jobs` (`Commands`, after
  `/places` in the list and the autocomplete) prints the work at every
  place the player knows, by place, with the phase it is now; no turn. The
  Debug tab lists waiting fights under Due events and the work done under
  Meta. The Character tab is unchanged.
- **Older saves.** Nothing to fill and no rules version: a save without
  `work` or `fights` reads as none, and `JOBS`, like the templates, is read
  from the page, not the save, so an older game has work at once. A grudge
  seed planted before keeps its old sentence and no effects.
- **SPEC.md.** Section 10's `parse_action` enum gains a nineteenth type,
  `work`; section 7's fights can now come to the player. Both are listed in
  README.md's deviations.
- **Cost.** No call is added. The parser's message carries WORK ON OFFER
  HERE where work is on offer (about 45 tokens a job), its prompt one
  sentence and its schema one enum value: over the cost report's 15 inputs its
  message averages 2,887 characters (3,447 at most; it was 2,799 and 3,293),
  its prompt 2,139 (1,939), its schema 2,157 (2,150). An ordinary turn is
  unchanged at the report's precision ($0.0216 to $0.0263). A turn of work
  adds the JOB line (about 95 tokens) and a bookkeeper note (about 40); a
  fight the ATTACKED line (about 65).
- **Not covered.** `/reroll` and `/cheat` redo the player's own roll; a
  fight that came to them is fought again with the replayed turn (with a
  fresh die) only when the turn had a roll of its own, since a turn whose
  only roll was the defence logs no roll to redo. The narrator is not told
  about work before it is taken (no WORK line in its packet; the brief kept
  it out), so a giver asked "you hiring?" in conversation answers from
  their own wants; taking it is what the parser hears. The flag
  `ranWithNightRun` is kept, like the clocks' flags, for later rules;
  nothing reads it yet.
- **Tests.** content: JOBS in the block, and `validate-town.cjs` refuses a
  job given to someone who is not at its place when it is offered. state:
  the fight op (waiting in `state.fights` with its reason, once a person,
  a seed's id kept, a no-op for the dead and the far away, an unknown
  person refused), `fightDone`, `workDone` (the record and its count) and
  the three new keys refused from the model, a seed planted with a fight and
  one naming nobody refused whole, the job's journal line written again on
  another turn but not twice in one while news never repeats, and Town's
  `jobsAt`, `jobsOnOffer` and `jobRefusal` (the cooldown from `workDone`).
  pipeline: a job on offer in the parser's message (and out of its phases
  none; the Say mode clause), taking it in mock mode pays in its range,
  takes the rest of the phase, writes the journal line, tells the narrator
  (JOB after ROLL) and the bookkeeper, ignores the bookkeeper's own
  `goldDelta`, introduces the giver and locks like any roll; refusals spend
  nothing (out of its phases, nobody hiring, another place's, its giver
  elsewhere, its giver cold, done today, done for good, after a once-only
  job's `onSuccess` ran); the stake lost in Say mode within its range and
  too little cash refused, work with no roll paid in its range, a botched
  job paid nothing and `/cheat success` replaying it paid; a fight effect
  waits, then brings its person and costs 1 to 3 HP on a failed defence
  (with the knife's +2), costs nothing on a held one, is dropped for
  someone arrested, and at 1 HP a natural 1 costs 3 and defeats the player,
  the attacker named as the foe. world: the grudge template with the fight
  is planted with "{npc}" and its reason filled in, fires on its day and
  leaves the fight waiting (no ATTACKED in that narration), and the turn
  its event is told the person comes at the player, is in the scene and the
  failed defence hurts. map: a place's sheet lists its work (the giver by
  label, then by name once met, "done for today"), none where there is
  none, nothing overflows at 375 wide, and `/jobs` lists it with no turn.
  playtest: the script ends by taking a job where it is offered (paid in
  its range, the phase gone, the journal line, the JOB line, the story says
  the pay), the run is 37 turns, and the mock parser test checks the work
  phrases and the ones that stay talk or persuade. Changed on purpose:
  shell's command list (`/jobs` after `/places`); state's content shape
  test (a template may carry `effects`, one grudge is a fight, and the
  jobs' shape), with README's "34-turn playtest" now 37.

   Added at the merge: the narrator packet gets `WORK ON OFFER HERE` (the
   giver's name, the work and the pay range, with the note that nothing is
   paid, won or lost until the player takes it) whenever `Town.jobsOnOffer`
   has work here that `Town.jobRefusal` would not refuse, and not on a work
   turn (JOB says what was settled). Without it a giver asked "you hiring?"
   answered from their wants alone. The pipeline suite covers it.

### 17. Code health: built from parts, dead tables gone

The review the owner agreed with (its last section, "Code health"): the one
file holds about 185 KB of content and 590 KB of engine in a dozen modules,
and it works, but editing a 15,000-line file is the main cost of every
change, and the content the README invites the owner to edit by hand sits in
the middle of it; the `Tables` person generator and its tables, and the
fantasy plausibility vocabulary, predate the fixed cast. Keep the
single-file rule, build the file from a `src/` and `content/` pair with a
small node script, and drop the NPC tables. The `Upgrade` module stays,
untouched: the owner's own saves may not be updated yet. Nothing the player
sees or the models are sent changes; the whole suite, unchanged in meaning,
is the proof.

- **Built from parts.** `index.html` is still the one self-contained file
  the player opens, committed built, so GitHub Pages and `file://` serve it
  as before, but it is assembled by `build.cjs` at the repo root (plain
  node, no dependencies) from `src/head.html` (the doctype, head, CSS, body
  markup, the opening of the page script and the content comment; 58 KB),
  `content/town.js` (everything between the content markers, the
  `module.exports` guard line included; 189 KB), seventeen engine parts in
  the file's own order (`src/10-style-guides.js`, `15-helpers.js`,
  `20-rng.js`, `25-dice.js`, `30-tables.js`, `35-state.js`, `40-town.js`,
  `45-world.js`, `50-style.js`, `55-api.js`, `60-upgrade.js`,
  `65-pipeline.js`, `70-storage.js`, `75-ui.js`, `80-commands.js`,
  `85-app.js`, and `90-game.js`, which holds `window.Game` and the boot;
  673 KB in all) and `src/tail.html` (the end of the page script's function,
  of the script and of the document). The numbers step by five so all
  seventeen sort in two digits, in a directory listing and in the build
  alike (steps of ten would need three digits after the ninth part); the
  build joins every `src/NN-name.js` in the order of its number, so a new
  module is a new file. The parts are joined byte for byte: the build adds
  only the two marker lines (with a blank line after the end marker) and a
  one-line banner after the page script's `<script>` tag ("Built by
  build.cjs from src/ and content/town.js: edit those, not this file, then
  run node build.cjs ..."). A part saved without a final newline gets one,
  so it cannot run into the next, and a marker inside `content/town.js` is
  refused. `node build.cjs` writes the file; `node build.cjs --check [file]`
  exits 1 and names the first line that differs when `index.html` (or the
  file named) is not the build, the pattern of `tests/cast-doc.cjs
  --check`. Its exports (`build`, `isCurrent`, `engineParts`, the markers,
  the banner) serve the tools and the tests.
- **One source of truth.** The content is written only in
  `content/town.js`. The tools keep reading the built `index.html`, the file
  the player gets: `tests/validate-town.cjs` reads more than the content (the
  engine's `RESERVED_FLAGS` and relation lists, the narrator's example
  turns), it runs `tests/mentions.cjs` on what it loaded, and every
  Playwright suite opens the page. `validate-town.cjs` and `cast-doc.cjs`
  refuse a page that is not the build of the parts ("run node build.cjs"),
  so a check after an edit and before a build fails instead of passing the
  old text; with `VALIDATE_FILE` set (the content suite's hand-edit tests)
  they check that copy as it is. The two comments that said to edit the
  block in `index.html` (the content banner at the end of `src/head.html`
  and the header of `content/town.js`) now say to edit `content/town.js`
  and build, and `docs/CAST.md`'s first line says where the cast is written.
- **Dead code out**, each removal proved by grep over the whole built file
  and the tests (the `Upgrade` module and the mock provider count as
  reachable; nothing reaches `Tables` by a computed name: its only
  references are the module, the `Game` export and the `complication`,
  `weather`, `price` and `location` calls):
  - `Tables.npc`, the person generator, and its helper `fits`: called
    nowhere in the page; only `tests/state.test.cjs` called
    `Game.Tables.npc`. Nobody has been made in play since direction change
    8, and `Pipeline.createEntity` throws for a person.
  - `Tables.item` (a rolled good or trinket): called nowhere in the page;
    only the same state test called it.
  - `TABLES.npc.familyNames`, `traits`, `wants` and `speechQuirks` (100
    strings): read only by `Tables.npc`.
  - `PRONOUN_OBJECT` (helpers): read only by the generator's look line.
  - `State.canUndo`: read nowhere, in the page or the tests (the page uses
    `undoDepth`).
  The page is 5,014 bytes smaller (924,871 to 919,857). The built file
  differs from the one before this package only in these removals, the new
  comment above `TABLES`, the banner and the two comments on where to edit.
- **Kept, and why.** `TABLES.npc.firstNames` and `occupations` are live:
  `Town.properName` reads the first names (a bare "Dakota", "Jesse" or
  "Opal", three of them that `NAME_PRONOUNS` lacks, reads as a person, so
  `new:Dakota` is someone nobody in town answers to rather than a thing to
  create) and `Town.personWords` reads the occupations ("a welder", "a
  logger" are people, so nobody, not an item put in the bar). They stay in
  `TABLES.npc`, words unchanged, under a comment saying what they are for.
  `Town.plausible`'s vocabulary stays whole: `FANTASY_ONLY` is what refuses
  a sword or a knight in the present-day town, `MODERN_ONLY` judges a game
  whose saved town has no currency (`isModern()`; an older low-fantasy save
  still loads with its own copy of its town), `IMPLAUSIBLE` holds the dragon
  (acceptance test [1]) with the rest of the generic list, and the fantasy
  words in `PERSON_WORDS` make "a wizard" a person. Removing any of them
  changes a verdict, and the pipeline suite's "modern vocabulary" test and
  the state suite's plausibility test assert those verdicts (a knight
  refused in a modern town and accepted in a fantasy one, a pickup the
  other way round, a wizard a person). `TABLES.items.trinkets` is read by
  `State.knownItemName`, `Tables.location` and `Tables.price` by step 4 of
  the turn, and `CREATED_BY`'s `'tables'` and `Upgrade.MADE_BY` describe
  people an older game's tables made.
- **Older saves.** Nothing stored changes and there is no rules version; a
  save carries no table.
- **SPEC.md.** Section 2 asks for one self-contained file with no build
  step, section 4 for `TOWN_DATA` near the top of that file, edited by hand.
  The player still gets one self-contained file that needs no build, but it
  is built from parts and the town is edited in `content/town.js`. Listed in
  README.md's deviations.
- **Docs.** README "Editing the town" (the parts; edit `content/town.js`,
  run `node build.cjs`, then the validators; the engine the same way),
  "Running the tests" (the build check), "How to play", "The cast" and
  "Updating an older game" (where things now live), and the deviation; in
  this file "Deliverable and hard constraints" (one built file, assembled
  from parts by `build.cjs`, committed), "Repository layout", the `TABLES`
  contract and the `Tables` row of "Module responsibilities".
- **Tests.** constraints: a new test runs `node build.cjs --check` (it
  passes), finds the banner once at the top of the page script, and has a
  copy with one character changed in the engine refused with its first
  differing line. content: the layout assertion wants `content/town.js`,
  byte for byte the block between the markers, and nothing else in
  `content/` (it wanted no `content/` folder), and still no
  `content-modern/`. Removed with what they checked: the state suite's
  checks of `Tables.npc` (one seed, one person; its fields; pronouns from the
  noun, the role or the first name) and of `Tables.item` (the "Tables build"
  test keeps the place, the complication and the weather; the pronoun test
  keeps the town's people, `inferPronouns`, `addNpcs` and the load), and its
  content shape test's `TABLES.npc` keys (now `firstNames`, `occupations`);
  `validate-town.cjs`'s counts of the four lists, its family-name clash
  check and the family names in its example-turn name check. Every other
  test is unchanged and passes: 256 in all (254 before, and the build
  check).
