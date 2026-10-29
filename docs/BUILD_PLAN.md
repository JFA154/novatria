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
content/            staging area for authored data; deleted once inlined
tests/              Playwright scripts, CommonJS (.cjs), run with plain node
tests/run.cjs       runs every tests/*.test.cjs file, exits non-zero on failure
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
  locations: [{
    id, name, type,                 // type: tavern | market | docks | temple | manor | smithy | watch | slum | road | ...
    description,                    // two sentences
    exits: ["loc_..."],             // symmetric: if A lists B, B lists A
    npcIdsBySchedule: { morning: [], afternoon: [], evening: [], night: [] },
    discovered: true,               // starter locations are discovered
    closed: false                   // set true by a clock effect; still exists
  }],
  npcs: [{
    id, name, role, factionId,      // factionId may be null
    tags: ["lender", ...],          // free-form, used to link loose ends (see LOOSE_ENDS)
    look, voice,                    // one line each
    personality: ["trait", "trait"],
    goal, secret,
    attitude: 0,                    // -100..100
    memories: [],                   // { turn, text, weight: 1|2|3 }
    alive: true, knownToPlayer: false,
    status: "free"                  // free | arrested | gone | dead
  }],
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
    trigger: { type: "day" | "location" | "npc" | "clock", value },
    //  day → integer day; location → "loc_..."; npc → "npc_..."; clock → "fac_x:3"
    fired: false, hidden: true
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

### TABLES

```js
const TABLES = {
  npc: { firstNames: [30], familyNames: [30], occupations: [30], traits: [30], wants: [20], speechQuirks: [20] },
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
    link: { tag: "lender" },                   // link to an existing NPC with this tag, else create one
    newNpc: { role: "moneylender", ... },      // used only if no tagged NPC exists
    seed: { dayOffset: [3, 5], effect: "...{npc}..." , trigger: "day" }
  }, ...
};
const GRUDGE_TEMPLATES = [ { effect: "...{npc}...", dayOffset: [2, 5] }, ... ];  // 6+
const FAVOUR_TEMPLATES = [ { effect: "...{npc}...", dayOffset: [2, 5] }, ... ];  // 6+
```

### Game state

Exactly SPEC.md section 3, plus:

```js
state.flags = { priceMultiplier: 1, weather: "..." };
state.time = { day: 1, phase: "morning", shorts: 0 };   // 3 shorts = one phase
state.meta = { seed, turn, createdAt, townName, townVersion: 1, lastRollKey: null };
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
| `Dice` | d20 + stat + modifiers vs difficulty, outcome tiers, complication selection, the retry lock (`meta.lastRollKey`) |
| `Tables` | create NPC / minor location / item / complication / weather from `TABLES` via `Rng` |
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
   NPC. `newNpc` fields contain no placeholders.
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
   applies the corrected record through the engine-only `fixPeople`.
