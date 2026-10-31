# One-Town Text RPG — Build Spec

Oct 27, 2026 · @Joe

## How to use this spec

Paste everything below this section into Claude Code as one message, or save it as `SPEC.md` in an empty folder and tell Claude Code: "Read SPEC.md and build milestone 1. Stop after each milestone so I can test."

Build one milestone at a time (see the last section). Don't ask for the whole game in one go: the turn pipeline and the state validation are where bugs hide, and you want to test each before stacking the next on top.

## 1. Vision and non-negotiable rules

Build a single-player text RPG set in one town. The player can type any action. Claude narrates. The game's code owns all facts, numbers and dice. The world reacts to the player more than it happens to them.

**Core principle: the AI is the narrator, not the author.** The world exists in saved state, the rules decide outcomes, and the player acts.

Non-negotiable rules:

1. **The narrator never invents facts.** It may only describe entities that already exist in game state (locations, NPCs, items, factions, threads). Anything new enters the world only through the creation step in the turn pipeline, which uses random tables and is validated and saved by code before narration.
2. **Code rolls the dice.** The LLM never decides success or failure. It receives the result and must narrate it faithfully, including failure.
3. **Code owns all numbers.** HP, gold, inventory, attitudes, clocks and time live in state. The LLM proposes changes as JSON; code validates, clamps and applies them.
4. **The narrator never acts for the player.** It never decides what the player character says, thinks, feels or does beyond what the player typed.
5. **Short turns.** Default narration is 2 to 4 sentences, ending at the first moment that needs the player's input. No option menus.
6. **No unearned surprises.** Every surprise must trace back to something already in state: a hidden seed, a faction clock, an NPC's goal, or the player's own past actions or backstory.
7. **Content:** mature themes, violence and romance are fine; intimate scenes fade to black.
8. **Everything persists.** Nothing important lives only in chat history. If it matters later, it is in state.

## 2. Tech setup

- **One self-contained file:** `index.html` with inline CSS and vanilla JavaScript. No build step, no framework, no backend. It must run by opening the file in a browser or hosting it on any static host.
- **Organise the script into clear modules** inside the file (plain objects or classes): `State`, `Town`, `Tables`, `Dice`, `Api`, `Pipeline`, `World`, `Style`, `UI`, `Storage`.
- **Claude API, called directly from the browser** with the player's own API key:
  - `POST https://api.anthropic.com/v1/messages`
  - Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`, `anthropic-dangerous-direct-browser-access: true`
  - Narrator model default: `claude-sonnet-5-5`. Parser and bookkeeper default: `claude-haiku-5-5`. Both editable in Settings.
  - Check current model names and request format against docs.claude.com before coding.
- **Get JSON reliably with tool use.** For every call that must return data, define one tool with an `input_schema` and force it with `tool_choice: {"type":"tool","name":"..."}`. Read the result from the `tool_use` block. Never parse JSON out of free prose.
- **Errors:** retry once on network errors or 429/529 with a short backoff. On a second failure, show a clear message and keep the player's typed input in the box so nothing is lost.
- **No external libraries required.** Optional: one Google Font for the reading text.

## 3. Game state data model

All game state is one JSON object. Every entity has a stable `id` (lowercase slug, e.g. `npc_mara`, `loc_crooked_lantern`). The LLM may only reference entities by these ids.

```
{
  "version": 1,
  "meta": { "seed": 12345, "turn": 0, "createdAt": "..." },
  "time": { "day": 1, "phase": "morning" },        // phases: morning, afternoon, evening, night
  "player": {
    "name": "", "background": "", "goal": "", "flaw": "",
    "stats": { "might": 0, "wits": 0, "charm": 0, "stealth": 0 },   // -1 to +3
    "hp": 10, "maxHp": 10,
    "gold": 20,
    "inventory": [ { "id": "item_knife", "name": "Knife", "qty": 1, "notes": "" } ],
    "conditions": [ { "id": "cond_cut_arm", "name": "Cut arm", "effect": "-1 might", "untilDay": 4 } ],
    "reputation": { "town": 0 },                 // -100 to 100, plus one entry per faction
    "storyPoints": 2,
    "locationId": "loc_..."
  },
  "locations": [ { "id", "name", "type", "description", "exits": ["loc_..."], "npcIdsBySchedule": { "morning": [], ... }, "discovered": true } ],
  "npcs": [ {
    "id", "name", "role", "factionId": null,
    "look": "one line", "voice": "how they talk, one line",
    "personality": ["trait", "trait"],
    "goal": "what they want", "secret": "hidden from player",
    "attitude": 0,                               // -100 to 100 toward the player
    "memories": [ { "turn": 12, "text": "Player skipped out on a 40 silver dice debt", "weight": 3 } ],
    "alive": true, "knownToPlayer": false
  } ],
  "factions": [ { "id", "name", "goal", "methods", "clock": { "label", "segments": 6, "filled": 0, "onComplete": "what happens" }, "relations": { "fac_x": -50 } } ],
  "threads": [ { "id", "title", "summary", "status": "open|resolved|failed", "knownToPlayer": true, "linkedIds": [] } ],
  "seeds": [ { "id", "cause": "what planted it", "effect": "what will happen", "trigger": { "type": "day|location|npc|clock", "value": "..." }, "fired": false, "hidden": true } ],
  "rumours": [ { "id", "text", "true": true, "sourceNpcId", "heard": false } ],
  "log": [ { "turn", "input", "roll", "narration" } ],   // keep last 30 only
  "chronicle": [ { "fromTurn", "toTurn", "summary" } ],     // compressed history
  "journal": [ { "turn", "text" } ]                        // player-visible notes
}
```

Rules for state:

- **Hidden fields** (`secret`, `seeds`, rumour truth, faction clocks, NPC goals) are never shown in the player UI except in Debug mode.
- **Every mutation goes through one function**, `State.apply(diff)`, which validates ids, clamps values and records the change. No other code edits state directly.
- **Snapshot before every turn** so `/undo` can restore the previous turn.

## 4. The starter town

The town is written once, as data, and locked. Put it in a clearly marked `TOWN_DATA` constant near the top of the file so I can edit it by hand. Claude Code writes the first version at build time following these rules; it is not generated during play.

**Setting:** grounded low fantasy. A small trade town of about 800 people on a river crossing. Magic is rare, rumoured and never casual. No prophecies, chosen ones, dark lords or hooded mysterious strangers.

**Contents of `TOWN_DATA`:**

- **8 to 10 locations**, connected by exits: e.g. a tavern, market square, docks, temple, a noble's house, a smithy, the town watch house, a poor quarter, the road out. Each has a two-sentence description and a schedule of which NPCs are there in each time phase.
- **12 to 15 named NPCs**, each with role, faction, look, voice, 2 personality traits, a goal, and a secret. At least half the secrets must connect to another NPC or a faction. Voices must be clearly different from each other.
- **3 factions** whose goals conflict, e.g. the merchant guild, the town watch, a smuggling crew. Each has a 6-segment clock with a concrete `onComplete` outcome that changes the town.
- **2 or 3 existing tensions** already under way when the game starts, as threads with `knownToPlayer: false`.
- **10 rumours**, about 7 true and 3 false, each tied to an NPC who might share it.
- **5 to 8 hidden seeds** tied to faction plans, firing on days 3 to 15.

**Random tables (`TABLES` constant)** are used only when the player asks about or goes somewhere the town data doesn't cover:

- NPC: first names, family names, occupations, traits (30 each), wants (20), quirks of speech (20)
- Minor location: types (15), one notable detail (20), a small problem there (15)
- Items: common goods with prices (40), trinkets (20)
- Complications on a failed roll (20), e.g. "someone saw you", "it breaks", "it costs more"
- Weather by season (4 x 6)

Tables are rolled by code with a seeded RNG (store the seed in `meta.seed`) so the same save behaves the same way.

## 5. Character creation

A short, guided form before the first turn. It takes about two minutes and is the source of the player's personal hooks.

1. **Name** (free text).
2. **Background**: pick one of 6 (e.g. ex-soldier, runaway apprentice, disgraced clerk, river trader, temple foundling, card sharp). Each sets starting stats, gold and 2 items.
3. **Stats**: the background gives a base; the player can move one point from one stat to another.
4. **Goal** (free text, one line): why they came to this town.
5. **Flaw** (pick or write): e.g. gambles, can't back down, lies easily, owes everyone.
6. **Three loose ends**, each picked from a short list then optionally edited: a debt, an enemy, a secret, a lost person, a promise. Code turns each into a real entity: a new NPC or a link to an existing one, plus a hidden seed. Example: "I owe someone money" → links to a town NPC who is a lender and plants a seed that they come to collect around day 3.

After creation, show a one-screen summary card and a **Begin** button. The first turn's narration places the player arriving in town on day 1, morning, at the gate or the docks depending on background.

## 6. Turn pipeline

Every player input runs through these steps in order. Only steps 3, 6, 8 and 12 call the API.

1. **Snapshot** the state for `/undo`.
2. **Commands first.** If the input starts with `/`, handle it in code (section 12) and stop. No API call unless the command says so.
3. **Parse the action** (parser model, tool `parse_action`). Input: the player's text, current location, NPCs present, inventory, and lists of known entity ids and names. Output: action type, the entities it targets (existing ids, or `new:<short description>` for things not in state), whether a roll is needed, which stat, difficulty, and how much time it takes.
4. **Check and create.** For each `new:` target, code decides:
   - Plausible for this location (a barmaid in a tavern, a rope at the docks) → roll on the tables, create the entity, save it, and replace the `new:` target with the real id.
   - Implausible (a dragon in the tavern) → mark it `does_not_exist` so the narrator says it isn't there.
   - The player is trying to declare a fact about the world ("my cousin lives here") → only allowed by spending a story point (section 12). Otherwise it doesn't exist.
5. **Resolve.** If a roll is needed, code rolls (section 7) and produces an outcome tier. If a failure needs a complication, code rolls one from the table.
6. **Narrate** (narrator model, streamed plain text). Send the context packet: style guide, current scene, present NPCs with voice and attitude and relevant memories, the action, the roll result, any complication, any due events (step 11), recent log, and the chronicle summary. The narrator describes only what's in the packet.
7. **Style check.** Scan the narration for banned phrases and length over the limit (section 9). On a hit, regenerate once with a note naming the problem. If the second try still fails, keep it.
8. **Bookkeep** (parser model, tool `record_changes`). Input: the action, roll result and final narration, plus the same entity list. Output: a state diff (section 10).
9. **Apply** the diff through `State.apply()`. Reject anything that references an unknown id, clamp every number, and log rejections to the debug console.
10. **Advance time** by the parsed time cost. If the phase or day changed, run the world tick (section 8).
11. **Fire seeds** whose trigger is met. Each fired seed becomes a **due event** that the next narration must work in naturally (not dumped as a sudden announcement).
12. **Compress.** Every 10 turns, summarise the oldest 10 log entries into one chronicle entry (parser model) and drop them from the log.
13. **Save** to the autosave slot and render the UI.

## 7. Rules: dice, failure, time

**When to roll.** Only when the outcome is uncertain and failure would be interesting. Walking somewhere, ordinary talk and buying at listed prices never roll.

**The roll:** d20 + stat + modifiers against a difficulty.

| Difficulty | Target |
| --- | --- |
| Easy | 8 |
| Normal | 12 |
| Hard | 15 |
| Very hard | 18 |

**Modifiers** (code applies, capped at ±4 total): +2 with a fitting tool or item, +2 or −2 for an NPC's attitude above 50 or below −50 on social rolls, −1 per relevant condition.

**Outcome tiers:**

| Result | Tier | What happens |
| --- | --- | --- |
| Natural 20 | Critical | Success plus a bonus |
| Total ≥ target | Success | It works |
| Total within 3 below | Partial | It works, but with a cost: roll a complication |
| Lower | Failure | It doesn't work, and the situation changes: roll a complication |
| Natural 1 | Critical failure | Failure plus a lasting consequence (a condition, lost item, or NPC memory) |

Failure must always move the story; it never means "nothing happens, try again". The same roll can't be retried immediately unless the situation changes.

**Fights** are a series of normal rolls. On a failure the player takes 1 to 3 damage, on a critical failure 3. At 0 HP the player is **defeated**: robbed, captured, left in a gutter or rescued, chosen by code from context. Death only happens if Settings has "Permadeath" on.

**Time.** The parser assigns each action a cost: `instant` (talking, looking), `short` (3 shorts = 1 phase), `long` (1 phase) or `rest` (until next morning, heals 3 HP). Four phases make a day.

**Show the roll** in the story feed as a small, quiet line, e.g. `Wits 14 + 2 = 16 vs 15 · Success`. Toggle in Settings.

## 8. Living world: factions, clocks, seeds

The town keeps moving whether or not the player is involved. All of this runs in code during the world tick, with no API call.

**World tick (on every phase change):**

1. **Faction clocks.** Each faction rolls d6; on 5 or 6 its clock fills one segment. Player actions can add or remove at most 1 segment per turn (via the bookkeeper's diff), e.g. sabotaging the smugglers removes one.
2. **Clock complete.** Apply its `onComplete` outcome to state as concrete changes: a location closes, an NPC is arrested or leaves, prices rise, a new thread opens. Add a rumour describing it. Each faction has 2 or 3 clocks in sequence in `TOWN_DATA`; the next one starts when the last finishes.
3. **Schedules.** NPCs move to their location for the new phase.
4. **Grudges and favours.** Any NPC with attitude ≤ −60 and a memory of weight 3 plants a seed to act against the player within 2 to 5 days, using a template list (report them to the watch, raise prices, send someone, spread a rumour). Attitude ≥ 60 plants a favour seed the same way (a tip-off, a discount, a warning).
5. **News spreads.** Off-screen events become rumours. When the player next talks to someone likely to know, the narrator packet includes one fresh rumour as something that NPC might mention.

**Seeds** are how surprises are earned. A seed is created by town data at start, by character creation (loose ends), by grudges and favours, by clocks, and by the bookkeeper when the player does something with an obvious future consequence. Trigger types: `day` (on or after a day), `location` (when the player enters a place), `npc` (next time they meet an NPC), `clock` (when a clock reaches N). When a seed fires it becomes a due event for the next narration.

**Reputation** changes how NPCs greet the player. Code passes a one-word tier to the narrator: `unknown`, `noticed`, `known`, `respected`, `feared`, `despised`.

## 9. Writing style guide

Store this in a `STYLE_GUIDE` constant and put it in the narrator's system prompt word for word.

```
You narrate a text RPG. Write like a sharp, economical novelist, not like an AI.

LENGTH: 2-4 sentences. Up to 6 only when the packet says ZOOM. Stop at the first moment the player must respond.

VOICE: Second person, present tense. Plain words. Concrete detail: what is seen, heard, done. Never tell the player how to feel.

DIALOGUE: NPCs speak in their listed voice. People interrupt, dodge questions, lie, change the subject. Prefer a line of dialogue over a line of description.

NEVER:
- Act, speak, think or feel for the player character beyond what they typed.
- Mention anything not in the packet. If it isn't listed, it isn't there.
- Change the roll outcome. Failure is failure.
- Offer options or ask "What do you do?"
- Recap what the player just did.
- Let anyone know or say how much money the player has or has left: people see only what is handed over or shown.
- End with a summary of the mood.

BANNED PHRASES: "the air is thick with", "a testament to", "little did you know", "somewhere in the distance", "you can't help but", "a sense of", "palpable", "tapestry", "whispers of", "the weight of", "sends shivers", "unbeknownst", "in the grand scheme", "it's worth noting", "echoes through", "hangs in the air", "a mix of", "as if on cue", "time seems to slow", "eyes glinting with".
Also avoid: lists of three adjectives, rhetorical questions, and starting with "As you".
```

**Example turns** (include these in the system prompt after the rules):

> *Input:* I walk into the tavern. *(Seed due: Mara wants her 40 silver.)* The Lantern is half empty this early. Mara is at the end of the bar with a cup she isn't drinking. She doesn't turn around. "Sit," she says. "You owe me forty."

> *Input:* I try to pick the lock on the counting-house door. *(Stealth 9 vs 15 · Failure · Complication: someone saw you.)* The pick slips and the tumbler snaps back with a click that's louder than it should be. Across the lane, a shutter opens a hand's width. A boy is watching you.

> *Input:* I ask the smith if he's heard anything about the smugglers. *(Smith: gruff, short sentences, attitude −10.)* He keeps hammering. "Heard plenty. Doesn't mean I talk about it." He sets the tongs down and looks at your empty hands. "You buying something?"

**Code-side checks:** reject and regenerate if the narration contains a banned phrase (case-insensitive), runs over 90 words (150 in zoom), contains "What do you do", or starts with "As you".

## 10. Prompts and tool schemas

### Parser: tool `parse_action`

System prompt: "You convert a player's free-text action into structured data for a game engine. Use only the entity ids provided. If the player refers to something not in the lists, use `new:<short description>`. Decide whether the outcome is uncertain enough to need a roll. Never narrate."

```
{
  "type": "object",
  "properties": {
    "actionType": { "enum": ["move","talk","look","search","take","use","give","buy","sell","persuade","deceive","intimidate","sneak","steal","attack","rest","wait","other"] },
    "summary": { "type": "string", "description": "One line restating the intended action" },
    "targets": { "type": "array", "items": { "type": "string" } },
    "destinationId": { "type": "string" },
    "needsRoll": { "type": "boolean" },
    "stat": { "enum": ["might","wits","charm","stealth"] },
    "difficulty": { "enum": ["easy","normal","hard","very_hard"] },
    "usesItemId": { "type": "string" },
    "timeCost": { "enum": ["instant","short","long","rest"] },
    "declaresWorldFact": { "type": "boolean" }
  },
  "required": ["actionType","summary","targets","needsRoll","timeCost","declaresWorldFact"]
}
```

### Narrator: streamed plain text

System prompt = `STYLE_GUIDE` + examples (cacheable). User message = the context packet, built by code as labelled plain text:

```
DAY 3, EVENING · Location: The Crooked Lantern — low beams, river damp, a fire that smokes.
PLAYER: Tomas (card sharp). Reputation: noticed. Conditions: cut arm.
PRESENT: Mara (lender; voice: dry, patient, never raises her voice; attitude -35; remembers: player skipped a 40 silver debt).
ACTION: Tomas sits down across from Mara and offers 10 silver now.
ROLL: Charm 11 + 1 = 12 vs 12 · Success
DUE EVENT: none
STORY SO FAR: <chronicle summary, max 150 words>
LAST 3 TURNS: <input + narration>
MODE: normal
```

Never send hidden NPC secrets or seeds the narrator shouldn't reveal; send only what this scene needs.

### Bookkeeper: tool `record_changes`

System prompt: "You record what changed in the game world after this turn. Use only the ids provided. Only record changes the narration actually shows. Be conservative: small attitude shifts (±5 to ±15) unless something major happened."

```
{
  "type": "object",
  "properties": {
    "attitudeChanges": { "type": "array", "items": { "type": "object", "properties": { "npcId": {"type":"string"}, "delta": {"type":"integer"}, "reason": {"type":"string"} } } },
    "newMemories": { "type": "array", "items": { "type": "object", "properties": { "npcId": {"type":"string"}, "text": {"type":"string"}, "weight": {"enum":[1,2,3]} } } },
    "goldDelta": { "type": "integer" },
    "hpDelta": { "type": "integer" },
    "itemsGained": { "type": "array", "items": { "type": "string" } },
    "itemsLost": { "type": "array", "items": { "type": "string" } },
    "conditionsAdded": { "type": "array", "items": { "type": "object" } },
    "playerLocationId": { "type": "string" },
    "npcKnownToPlayer": { "type": "array", "items": { "type": "string" } },
    "threadUpdates": { "type": "array", "items": { "type": "object" } },
    "clockNudges": { "type": "array", "items": { "type": "object", "properties": { "factionId": {"type":"string"}, "delta": {"enum":[-1,1]} } } },
    "newSeeds": { "type": "array", "items": { "type": "object" } },
    "rumoursHeard": { "type": "array", "items": { "type": "string" } },
    "journalEntry": { "type": "string", "description": "One plain line for the player's journal, or empty" }
  }
}
```

**Validation in `State.apply()`:** attitude delta clamped to ±25 per turn; gold can't go below 0 (an unaffordable spend is rejected); HP clamped 0 to max; items lost must exist in inventory; ids must exist; new seeds limited to 2 per turn and must have a trigger at least 1 day ahead.

### Chronicle: every 10 turns

Parser model, plain text: "Summarise these 10 turns in under 80 words: what the player did, who they met, what changed, what's unresolved. Past tense, plain facts."

## 11. UI: laptop and mobile

The story is the main thing on screen. Everything else is one tap away but out of the way.

**Look and feel**

- Dark theme by default (warm near-black background, off-white text), plus a light "parchment" theme. Respect `prefers-color-scheme` on first load.
- Reading text in a book-style serif (e.g. Literata or EB Garamond from Google Fonts, falling back to Georgia), 18px, line height 1.6. UI labels in a system sans-serif.
- Story feed styles: player input as a short, muted, italic line with a small marker; narration as normal paragraphs; roll results as one quiet small line; day changes as a thin divider ("Day 4 · Morning").
- Narration streams in as it arrives. Auto-scroll to the newest text unless the player has scrolled up; then show a "↓ New" button.
- No emoji, no clutter, no animations beyond a gentle fade.

**Laptop (≥ 900px wide)**

- Top bar: day and phase, current location, HP, gold, and buttons for Settings and Save.
- Centre: the story feed, max 680px wide for comfortable reading.
- Right: a 320px side panel with tabs: **Character** (stats, conditions, inventory, story points), **People** (NPCs the player knows, with name, role, a one-word attitude like "warm" or "hostile", and things the player has learned about them), **Journal** (known threads and journal entries), **Places** (discovered locations and exits from here). Panel can be collapsed.
- Bottom of the feed: a multi-line input that grows to 4 lines, Enter to send, Shift+Enter for a new line.

**Mobile (< 900px)**

- One column. Compact top bar: location, day/phase, HP, gold.
- The side panel becomes a full-height sheet that slides up, opened from a small tab bar above the input (Character · People · Journal · Places). Swipe down or tap X to close.
- Input bar fixed to the bottom and kept above the on-screen keyboard (use `visualViewport` to adjust). Input font size at least 16px so iOS doesn't zoom.
- Respect safe areas (`env(safe-area-inset-*)`), tap targets at least 44px, no horizontal scrolling anywhere.
- Test at 375px wide.

**Other screens:** title screen (New game, Continue, Load, Settings), character creation (one step per screen on mobile, one page on laptop), settings, and a load/save screen.

## 12. Commands

Typed in the input box. Show a small autocomplete list when the player types `/`.

| Command | What it does | API call? |
| --- | --- | --- |
| `/look` | Re-describe the current scene in full (zoom mode) | Narrator |
| `/zoom <action>` | Run the action with the longer zoom limit, for big moments | Normal turn |
| `/skip <goal>` | Jump ahead to a goal ("to the docks at night"). Code advances time, runs world ticks for each phase skipped, then narrates arrival | Narrator |
| `/rest` | Sleep until morning, heal, run world ticks | Narrator |
| `/wait <phase>` | Wait until a phase in the same place | Narrator |
| `/fact <statement>` | Spend 1 story point to declare a fact ("the ferryman owes me a favour"). Parser turns it into an entity or link; code saves it | Parser |
| `/sheet` `/people` `/journal` `/places` | Open that panel tab | No |
| `/undo` | Restore the snapshot from before the last turn | No |
| `/save <name>` `/load` | Manual save slots | No |
| `/debug` | Toggle debug view: hidden secrets, seeds, clocks, last raw API responses | No |

**Story points:** start with 2, earn 1 when a thread resolves or on a natural 20. Max 3.

## 13. Saving, settings and cost control

**Saving**

- `localStorage`: one autosave (after every turn) plus 3 named slots. Wrap every read and write in try/catch and show a warning if storage fails.
- **Export** a save as a `.json` file download and **Import** one from a file, so saves can move between laptop and phone.
- Saves include the full state and the town data, so editing `TOWN_DATA` later doesn't break old saves.

**Settings**

- API key, with a "Remember on this device" checkbox (`localStorage` if ticked, `sessionStorage` if not). The key is never included in exported saves.
- Narrator model and parser model (text fields with the defaults filled in).
- Show dice rolls (on/off), Permadeath (off by default), Theme (dark/parchment), Text size (S/M/L).

**Cost control**

- Use prompt caching: put the style guide and examples in the system prompt with `cache_control: {"type":"ephemeral"}` so they're cached across turns.
- Keep the context packet small: only NPCs present, only memories with weight ≥ 2 or from the last 20 turns, last 3 turns of log, and the chronicle trimmed to 150 words.
- `max_tokens`: narrator 300, parser 400, bookkeeper 600, chronicle 200.
- Read the `usage` field from each response and show turn and session token totals in debug view.

## 14. Build order and acceptance tests

Build and test one milestone at a time. Stop after each so I can try it.

1. **Shell.** Responsive layout, themes, story feed, input bar, side panel and mobile sheet using dummy data. Save, load, export and import working.
2. **World and state.** `TOWN_DATA`, `TABLES`, seeded RNG, `State.apply()` with all validation, character creation. Panels show real data.
3. **Pipeline with a fake API.** Mock parser, narrator and bookkeeper responses so the full turn loop, dice, time, commands and `/undo` can be tested without spending tokens. Keep the mock mode as a Settings toggle.
4. **Real API.** Parser, streamed narrator, bookkeeper, style check and regeneration, error handling, settings.
5. **Living world.** World tick, faction clocks, seeds and due events, grudges and favours, rumours, chronicle compression, debug view.
6. **Polish.** Playtest 30+ turns, fix pacing, tune difficulty and attitude swings, check mobile on a real phone.

**Acceptance tests**

- [ ] "I talk to the dragon by the fire" in the tavern → narration says there's no dragon; nothing is created.
- [ ] Asking for a barmaid who isn't in the town data → one is created from the tables, appears in People, and is still there after reload.
- [ ] A failed lockpick → the failure is narrated, something changes, and the identical retry is refused.
- [ ] Insulting the same NPC three times → attitude drops, their greeting turns cold, and a grudge seed is planted once attitude reaches −60.
- [ ] A debt loose end from character creation → the lender confronts the player around day 3.
- [ ] After 10 turns, a chronicle entry exists and the log has been trimmed.
- [ ] Normal narration never exceeds 90 words and never contains "What do you do" or a banned phrase.
- [ ] The narrator never describes what the player character says or feels beyond the typed input (check 20 turns).
- [ ] At 375px wide: no horizontal scroll, the keyboard doesn't cover the input, the sheet opens and closes.
- [ ] Export a save on laptop, import on phone, and the game continues from the same point.
- [ ] `/undo` restores the previous turn exactly.
- [ ] In debug view, faction clocks visibly advance over several in-game days and a completed clock changes the town.
