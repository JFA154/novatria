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
    link: { tag: "lender", optionTags: ["lender", "collector", "bookie"] },
                                               // bind to a free cast member with the option's tag,
                                               // else the tag, else anyone free; never a new NPC
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

(written by the package that implements it)

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

(written by the package that implements it)

### 13. A granted ask stays granted (the retry lock on successes)

(written by the package that implements it)

### 14. Seeds are events: effects on seeds, loose ends that fit anywhere, a hook on day 1

(written by the package that implements it)

### 15. Faster, cheaper turns

(written by the package that implements it)

### 16. Work and trouble: paid jobs and fights that come to the player

(written by the package that implements it)

### 17. Code health: built from parts, dead tables gone

(written by the package that implements it)
