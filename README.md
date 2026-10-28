# One-Town Text RPG: Lockett's Ferry

A single-player text RPG set in one town: Lockett's Ferry, a present-day river
town of about eight hundred people where the state highway crosses the Lusk
River on an old steel bridge. A land company, a smuggling crew and a
three-officer police department each want something from the town, and the
player arrives with three loose ends of their own. You type any action and
Claude narrates it. The game's code owns every fact, number and dice roll.
Claude only describes what the game state says is there, and the town keeps
moving on its own: faction plans advance, grudges and favours come due, and
news spreads.

## How to play

1. Open `index.html` in a browser. It is one self-contained file, so it works
   straight from disk (`file://`) or from any static host. No build step, no
   server.
2. **Settings → API key**: paste an Anthropic API key from
   [console.anthropic.com](https://console.anthropic.com). The browser calls
   `https://api.anthropic.com/v1/messages` directly with your key. Nothing goes
   anywhere else.
   - **Remember on this device** ticked: the key is kept in this browser's
     `localStorage` and survives closing the browser, on this device only.
     Unticked: it is kept in `sessionStorage` and forgotten when the tab closes.
     The key is never written into a save or an export.
3. **Mock mode** is on by default. In mock mode a built-in dummy parser,
   narrator and bookkeeper run the whole turn loop offline. You can try the game,
   the dice, the commands and the living world without a key or any tokens.
   Mock narration is tagged "Mock narration" in the feed. Untick it in Settings
   to play with Claude.
4. **New game** walks you through character creation: name, background, one
   stat point to move, a goal, a flaw and three loose ends. Each loose end
   becomes a real person in town. Then press **Begin**.
5. Type what you do and press Enter (Shift+Enter for a new line). Type `/` to
   list the commands. The side panel (on a phone, the tab bar above the input)
   has Character, People, Journal and Places.

## Settings

| Field | What it does |
|---|---|
| API key, Remember on this device | Your Anthropic key; where it is kept (see above). |
| Mock mode | Built-in dummy provider, no API calls. On by default. |
| Narrator model | Writes the story (streamed). Default `claude-sonnet-5-5`. |
| Parser model | Turns your text into an action, records what changed after each turn (the bookkeeper), and writes the chronicle every 10 turns. Default `claude-haiku-5-5`. |
| Effort (narrator, parser, bookkeeper, chronicle) | `low` / `medium` / `high` per role, sent as `output_config.effort`. Default `low` for all. Higher effort means more thinking tokens: slower and dearer. |
| Show dice rolls | Shows the quiet roll line, e.g. `Wits 14 + 2 = 16 vs 15 · Success`. |
| Permadeath | Off by default. Off: at 0 HP you are robbed, captured, left in a gutter or rescued, chosen from the scene. On: the story ends. |
| Theme | Dark or Parchment. The first load follows the system's light or dark setting. |
| Text size | Small, Medium or Large reading text (16, 18 or 20 px). |

## Commands

| Command | What it does | API calls |
|---|---|---|
| `/look` | Describe the whole scene, with the longer zoom length | Narrator |
| `/zoom <action>` | Play the action as a normal turn with the longer limit, for big moments | Parser, narrator, bookkeeper |
| `/skip <goal>` | Jump ahead to a place and/or time ("/skip to the bar at night"). The world ticks once for each phase skipped | Narrator |
| `/rest` | Sleep until morning, heal 3 HP. The world ticks through the night | Narrator |
| `/wait <phase>` | Wait where you are until morning, afternoon, evening or night | Narrator |
| `/fact <statement>` | Spend a story point to make something true ("/fact the mechanic owes me a favour") | Parser |
| `/sheet` `/people` `/journal` `/places` | Open that panel | None |
| `/undo` | Take back the last turn exactly (up to 20 turns) | None |
| `/save <name>` | Save to a named slot (no name opens the Saves screen) | None |
| `/load <name>` | Load a named slot (no name opens the Saves screen) | None |
| `/debug` | Toggle the Debug tab: secrets, seeds, faction clocks, rumour truth, rejected changes, token totals and the last raw API responses | None |

Story points: you start with 2. You earn 1 when a thread resolves or on a
natural 20, up to 3.

## Saves, export and import

- **Autosave** after every turn, in this browser's `localStorage`. **Continue**
  on the title screen picks it up.
- **Three named slots** on the Saves screen (laptop: Save in the top bar; phone:
  Menu → Save / Load), or with `/save <name>`.
- **Export current game** downloads a `.json` file holding the full state and
  the town data, never the API key. **Import from file** loads one on any
  device, so a game moves between laptop and phone. Saves carry their own
  copy of the town, so editing the town later does not break old saves.
- If the browser refuses storage (private mode, full disk), a warning banner
  appears. Export to keep your game.

## What a turn costs

These are estimates at the default models, with the prices in
`docs/API_NOTES.md`: Sonnet 5.5 at $2 / $10 per million input / output tokens
($0.20 cache read), Haiku 5.5 at $0.10 / $0.50. The packet sizes were measured from the
mock calls over a mixed session (`node tests/run.cjs playtest` prints them).

| Call | Input (measured) | Output (assumed) |
|---|---|---|
| Parser | ~950 tokens (packet ~1,300 chars + system + schema) | ~90 |
| Narrator | ~720 tokens of packet (avg ~2,500 chars, max ~3,600) + ~630 cached system tokens | ~120 |
| Bookkeeper | ~1,600 tokens (packet ~2,150 chars + system + schema) | ~180 |
| Chronicle, every 10 turns | ~1,000 tokens | ~110 |

- An ordinary turn costs about **$0.003** without thinking tokens, or about
  **$0.005** with ~150 thinking tokens per call. Most of that is the narrator.
  **100 turns is roughly $0.30 to $0.50.**
- `/look`, `/rest`, `/wait` and `/skip` call only the narrator: about
  $0.003 to $0.004 each. A narration that fails the style check is written a
  second time, which adds one narrator call.
- The first narration of a session pays about $0.0014 extra to write the
  prompt cache. The cache lasts about five minutes between turns.
- Assumptions: 3.5 characters per token; the structured-output schema counted
  as input; the output sizes above; thinking at effort `low` is adaptive and
  may be smaller or larger than 150 tokens. Higher effort or the Opus model
  costs more. The Debug tab shows the real token counts and cost for the turn
  and the session.

## Editing the town

The whole town lives in `index.html` between the markers
`// ===== BEGIN CONTENT =====` and `// ===== END CONTENT =====`: `TOWN_DATA`
(places, people, factions and their clocks, threads, seeds, rumours), `TABLES`
(random tables), `BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`, `GRUDGE_TEMPLATES` and
`FAVOUR_TEMPLATES`. It is plain data with double-quoted strings. The shape is
in `docs/BUILD_PLAN.md` under "Shared data contract". After editing, run:

```
node tests/validate-town.cjs
```

It checks every field and cross-reference: ids, symmetric exits, schedules,
clock effects and seed triggers. It lists every problem it finds and exits 1.
A game already in progress keeps the town it started with.

## Running the tests

```
node tests/run.cjs              # everything: the town check, then every tests/*.test.cjs
node tests/run.cjs acceptance   # only files whose name contains "acceptance"
TEST_FILTER='\[4\]' node tests/acceptance.test.cjs     # tests whose title matches
PLAYTEST_TRANSCRIPT=1 node tests/playtest.test.cjs     # print the 30-turn playtest's story
```

The tests drive the game in headless Chromium with Playwright, in mock mode,
from `file://`, with the network blocked. Playwright is preinstalled in the
build environment. Elsewhere, run `npm i playwright` and
`npx playwright install chromium` in this folder first. There is no
`package.json` and nothing else to install.

- `tests/acceptance.test.cjs`: the twelve acceptance checks of SPEC.md section 14.
- `tests/playtest.test.cjs`: a scripted 30+ turn game, the pacing reports
  (faction clocks over 200 seeded runs, insult-to-grudge timing), the cost
  estimate, and the mock parser rules.
- `tests/mobile.test.cjs`: 375x740 and 390x844 checks for tap targets, input
  size, overflow and safe areas.
- `tests/constraints.test.cjs`: the single-file rules.
- `shell`, `state`, `pipeline`, `api`, `world` and `content`: the milestone suites.

## Deliberate deviations from SPEC.md

From `docs/BUILD_PLAN.md`:

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
present-day, not low fantasy. The narrator's three example turns are
rewritten as modern scenes, and money is shown as dollars (the state field is
still `player.gold`).

## Not yet exercised against the live API

Every test runs in mock mode, or against canned API responses served
inside the browser (`tests/api.test.cjs`). No request has been sent to the
real Claude API from this build. **Your first real turn is the live test.**

If a request fails, the feed shows a short message and your typed action stays
in the box. Type `/debug` and look in the Debug tab:

- **API errors**: each failure with its role (parser, narrator, bookkeeper,
  chronicle), HTTP status, `request-id` and the API's own message, verbatim.
- **Last raw responses**: the last four exchanges, with status, request-id,
  stop reason, token usage and the reply.
- **API (claude)**: token and cost totals for the turn and the session. On the
  second narration, "cache read" should be above zero.

Usual causes: 401, a bad key (check Settings); 404, a model name the API does
not know (check the two model fields); 400, a request the API rejects (the
message says what; please report it); 429 or 529, busy, already retried once,
so try again. To keep playing while you sort it out, tick Mock mode.
