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
5. Type what you do and press Enter (Shift+Enter for a new line). The
   **Do / Say** switch at the left of the input says whether you are doing
   something or saying something (see below). Type `/` to list the commands.
   The side panel (on a phone, the tab bar above the input) has Character,
   People, Journal and Places.

## Do and Say

The switch at the left of the input box has two buttons.

- **Do** (the default): you type what you do. "I run away" means you run
  away. Anything in quotes inside the line is part of what you do.
- **Say**: you type only your words, exactly as you say them. "Run away" means
  you tell someone to run away. You stay where you are, and the person you
  speak to answers first. Talking, persuading, lying and threatening are all
  Say; the game decides from your words whether a roll is needed.

In Say mode a row of buttons appears above the input: **Everyone**, plus one
button for each person here, by name. One is always picked: the only person
here if there is just one, otherwise Everyone. Tap another to talk to them.
The row changes with the scene (after each turn, when you move, when you load
a game), and your pick is forgotten when you go somewhere else.

In the story, a Say line shows your words in quotes and who you said them to:
`“Run.” — to Royce Pittman` or `“Anybody here hiring?” — to everyone`.

**Quote shortcut.** In Do mode, a line that is only a quote is said, not done:
`"Run."`, `say "Run."` or `I say "Run."` all go out as Say, to whoever is
picked in the Say row (by default the only person here, or everyone). The
quotes are dropped. A quote anywhere else in the line, as in
`I shove past him and yell "Run!"`, keeps it a Do line. The switch itself
stays where it was.

Commands (`/look`, `/undo` and the rest) work in either mode. The switch is
remembered in this browser; who you were talking to is not.

## Places and the map

People can tell you about places that are not on the map yet. When someone
names a specific place you could walk to ("Dewayne's is the white house about
a mile up the river road"), it is added to the map, the Places list and the
roads, with a quiet "Added to the map: Dewayne's house." in the story. It
shows with a dashed marker, marked "heard of", until you visit. If it is
someone's home, they are there at the times they are nowhere else, usually at
night. Walk there like anywhere else ("I head to Dewayne's house", or tap it
on the map). The game adds at most one such place a turn and twelve a game.

## Time

A day has four phases: morning, afternoon, evening and night, shown in the
top bar. Talking and looking take no time. A short action (minutes to half an
hour: a walk across town, a search, a chore) takes a third of a phase, so
three of them move the clock on. A long one (an hour or more) takes a whole
phase. The town moves on at every change of phase.

**Night lasts until you sleep.** Short actions never carry the clock from
night into morning: after the third one it stays at night, late, however long
the scene runs. Morning comes when you `/rest` (sleep), `/wait morning`,
`/skip` ahead, or do something that takes hours. The narrator and the
bookkeeper are told where in the phase the scene is (early, mid or late), at
night that you have not slept yet, and on a morning you reached without
sleeping that you had no sleep last night.

## Settings

| Field | What it does |
|---|---|
| API key, Remember on this device | Your Anthropic key; where it is kept (see above). |
| Mock mode | Built-in dummy provider, no API calls. On by default. |
| Narrator model | Writes the story (streamed). Default `claude-opus-5-5`, the current Opus. |
| Parser model | Turns your text into an action, records what changed after each turn (the bookkeeper), and writes the chronicle every 10 turns. Default `claude-sonnet-5-5`. `claude-haiku-5-5` is the cheap option and works. |
| Effort (narrator, parser, bookkeeper, chronicle) | `low` / `medium` / `high` per role, sent as `output_config.effort`. Defaults: narrator, bookkeeper and chronicle `medium`, parser `low`. Higher effort means more thinking tokens: slower and dearer. |
| Show dice rolls | Shows the quiet roll line, e.g. `Wits 14 + 2 = 16 vs 15 · Success`. |
| Narration style | **Casual** (the default): plain and direct, like someone running the game at the table, with short sentences, no similes and little scenery. **Literary**: the original style guide, tighter and more like a novel. Takes effect from the next narration. |
| Permadeath | Off by default. Off: at 0 HP you are robbed, captured, left in a gutter or rescued, chosen from the scene. On: the story ends. |
| Theme | Dark or Parchment. The first load follows the system's light or dark setting. |
| Text size | Small, Medium or Large reading text (16, 18 or 20 px). |
| Game: Re-read this game with the latest rules | Brings the game you have open up to the latest rules again: rewrites what people remember in the current short form, adds places people told you about, and sets the clock back if it ran ahead of the story (see Updating an older game). About three API calls. |

When time passes while you stay put, anyone who arrives at or leaves your place is worked into the next scene as it happens: a truck pulling in, a door, a goodbye.

## Commands

| Command | What it does | API calls |
|---|---|---|
| `/look` | Describe the whole scene, with the longer zoom length | Narrator |
| `/zoom <action>` | Play the action as a normal turn with the longer limit, for big moments | Parser, narrator, bookkeeper |
| `/skip <goal>` | Jump ahead to a place and/or time ("/skip to the bar at night"). The world ticks once for each phase skipped; naming the phase it already is moves you with no time passing | Narrator |
| `/pass` (or press **Wait**: the Send button with nothing typed) | Say and do nothing for a few minutes and let the people here act, speak or react to your silence | Narrator, bookkeeper |
| `/rest` | Sleep until morning, heal 3 HP. The world ticks through the night. Night lasts until you sleep (see Time) | Narrator |
| `/wait <phase>` | Wait where you are until morning, afternoon, evening or night | Narrator |
| `/fact <statement>` | Spend a story point to make something true ("/fact the mechanic owes me a favour") | Parser |
| `/sheet` `/people` `/journal` `/places` | Open that panel | None |
| `/undo` | Take back the last turn exactly (up to 20 turns) | None |
| `/reroll` | Cheat: take back the last turn and roll its dice again, as often as you like, ignoring the no-retry rule. The same action replays with a fresh die | Narrator, bookkeeper |
| `/cheat success` (or `partial`, `fail`, `crit`, `fumble`, a number 1-20) | Cheat: redo the last roll with that outcome. With no roll to redo, it arms your next roll instead. `/cheat` alone lists these | Narrator, bookkeeper |
| `/cheat time <phase> [day]` (also `/cheat night`, `/cheat morning 2`) | Cheat: set the clock to the start of that phase, on that day (today if none). The world does not tick and nothing is narrated; the story shows the new day and phase and "Clock set to day 1, night." One `/undo` takes it back | None |
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

## Updating an older game

The rules for what people remember changed on 28 Oct 2026. People now
remember only what they would hold against you or thank you for later, as a
short line in their own words ("flirted with me", "told me to fuck off",
"lied about car trouble to get Dewayne outside"). Games saved before then hold
the old kind: long play-by-play accounts of whole scenes.

- **You don't have to do anything.** An older save loads and plays exactly as
  it is. Only new memories follow the new rules.
- **Update this game.** When the autosave is older, the title screen says
  "This game was saved under older rules" and shows **Update this game** next
  to **Continue**. The Saves screen marks each older slot "Saved under older
  rules" and gives it an **Update** button. Either one loads the game and
  re-reads everyone's memories. Each person keeps at most six short lines,
  only the ones that matter to them. Repeats are merged, and each line keeps
  the turn of the earliest memory it came from. Loose ends and `/fact` lines
  stay exactly as they were. The feed then says what happened, for example
  "Rewrote memories for 5 people: 23 memories became 9." The game stays loaded
  and is autosaved, and an updated slot is saved back under its own name.
- **Settings → Game → Re-read this game with the latest rules** does the same
  for the game you have open, and you can run it again at any time.
- **Cost:** about one call to the parser model (Sonnet 5.5 by default, at the
  bookkeeper's effort). Measured live on 28 Oct 2026: two people with eight
  memories cost $0.005 (1,682 tokens in, 183 out). A game with more than
  about 40 memories is sent in a few calls. Mock mode rewrites by a fixed rule
  instead and makes no calls.
- **If it fails** (no key, a network error, a refusal), nothing changes and
  the feed says why. The details are in the Debug tab. An update counts as one
  step for `/undo`, so `/undo` straight after it brings the old memories back.
- **Places people told you about** (added 28 Oct 2026, rules version 3). The
  same update also reads the game's story so far for places people named
  that are not on the map yet, and adds them as "heard of" places (see Places
  and the map). The feed says, for example, "Added 1 place people told you
  about: Dewayne's house." or "No new places to add." This is one more call
  to the parser model; mock mode finds a quoted line like "Dewayne's is the
  white house" by a fixed rule instead.
- **Clock follows the story** (added 29 Oct 2026, rules version 4). In older
  games a run of short actions could tick the clock from night into morning
  in the middle of a night scene. The update reads the clock and the last six
  turns and, when the story is clearly still earlier (the night before, say),
  sets the clock back to it, late in that phase. The feed says, for example,
  "Set the clock back to day 1, night: the story had not reached morning." or
  "The clock matches the story." It never moves the clock forward and the
  town does not move on. One more call to the parser model (none for a game
  still on its first morning); mock mode sets a morning clock back to the
  night before when the last scene has a lamp, a bed or a bedroom in it, or
  says night or tonight.

Behind the scenes a save carries `state.meta.rulesVersion` (4 now; a save
without it reads as 1). The steps that bring a game up to date are listed in
`Upgrade.MIGRATIONS` in `index.html`.

## What a turn costs

The defaults are set for the best play-through, not the cheapest: Opus 5.5 narrates, Sonnet 5.5 parses and bookkeeps, with medium effort where judgement matters. At those settings a turn is roughly 3 cents, so about $3 per 100 turns. The measured figures below were taken with the original cheap defaults (Sonnet 5.5 narrator, Haiku 5.5 parser, all effort low), which you can set in Settings if you want them back.

Measured against the live API on 28 Oct 2026, in a 4-turn run (the arrival
plus three turns) at the default models and effort `low` for every role. The
prices are those in `docs/API_NOTES.md`: Sonnet 5.5 at $2 / $10 per million
input / output tokens ($0.20 cache read), Haiku 5.5 at $0.10 / $0.50.

| Call | Input (measured) | Output (measured) |
|---|---|---|
| Parser | ~1,800 tokens | ~125 |
| Narrator | ~900 to 1,200 tokens of packet + ~830 cached system tokens | 160 to 510 |
| Bookkeeper | ~3,300 tokens | 180 to 340 |

- The whole run (arrival plus three turns) cost **$0.0297**: about
  **$0.0075 per turn**, so **100 turns is roughly $0.75**. Most of that is
  the narrator.
- The prompt cache was read on every narration after the first. The first
  narration of a session pays a little extra to write it, and the cache lasts
  about five minutes between turns.
- `/look`, `/rest`, `/wait` and `/skip` call only the narrator. A narration
  that fails the style check is written a second time, which adds one
  narrator call. Since the narrator packet ends with an explicit LENGTH
  line, six live turns on 28 Oct 2026 (talks, walk-and-talks, a persuade
  roll and a plain move) gave first drafts of 70 to 89 words, all within the
  90-word limit, so none was rewritten ($0.0301 for the six turns).
- The chronicle (parser model, every 10 turns) was not part of the run; it
  is estimated at about 1,000 input and 110 output tokens. Higher effort or
  the Opus model costs more. The Debug tab shows the real token counts and
  cost for the turn and the session.

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
- `tests/upgrade.test.cjs`: updating an older game (rules version, the
  Update buttons, the memory rewrite, the places re-read and the clock check
  in mock mode and against canned API replies, failure, refusal and `/undo`).
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

And from `docs/BUILD_PLAN.md` ("Direction changes"): narration is casual by
default, with the SPEC.md style guide kept as the Literary option, and the
input has the Do / Say switch described above.

## Verified against the live API on 28 Oct 2026

The live path was checked on 28 Oct 2026 with the default models at effort
`low`: an arrival plus several turns, including a walk and an action in one
line ("I head to the bar and ask the bartender..."). Every call returned 200,
and the narrator's prompt cache was read on every narration after the first.
The automated tests still run in mock mode, or against canned API responses
served inside the browser (`tests/api.test.cjs`).

The casual style and the Do / Say switch were checked live the same day at
the current defaults (Opus 5.5 narrator at medium effort, Sonnet 5.5 parser):
an arrival and three Do turns in the casual style (no similes, no rewrites),
Say "Run." to one person (the player stayed, he answered), Say "Anybody here
hiring?" to everyone (both people answered) and Do "I run away from Royce."
(the player ran off to another place).

The clock fix was checked live on 29 Oct 2026. A save at rules version 3
whose clock had ticked into day 2 morning in the middle of the night at
Dewayne's house went through **Update this game**. The parser model answered
`{"behind":true,"phase":"night","dayOffset":-1,...}`, and the clock went back
to day 1, night (late). Three short actions after that all stayed at night.
The whole check took 10 calls and cost $0.088.

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
