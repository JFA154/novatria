# Transport and turn lifecycle (wave 1)

Region: `Api` (everything but the system prompts, schemas, `MEMORY_RULES` and
the mock provider), the `Pipeline` lifecycle, the whole `Commands` and
`Upgrade` modules, and the CI workflow. Tests: `tests/transport-fixes.test.cjs`
(27 tests). REVIEW items: E1, E5, E7, E8, E14 (time side), E15 `/cheat`; R1, R2,
R6, R7, R8, R9, R10; the cost and latency bullets of 2.6; 3.5/3.6 (`/recap`,
feed lines, undiscovered homes), 3.8 (card game), the epilogue turn.

## What changed

### Api transport (CONTRACTS 15)

- **Timeouts and Stop.** Every request runs under an `AbortController`
  (`watch(ms)`). Streams give up after `Api.TIMEOUTS.stream` = 45 s with no
  byte (every chunk resets the timer); JSON calls after `TIMEOUTS.json` =
  120 s. `Api.abort()` aborts everything in flight, wakes any retry wait, and
  makes every pending `Api.*` call reject at once with `ApiError('aborted')`,
  mock provider included (the race is in `call()`). The debug view's API
  error line for a stall reads `timeout: timed out after 45 s with no data`.
- **Retries.** One retry for 429/500/502/503/504/529, network errors,
  timeouts, a stream that ends before `message_stop` (`broken_stream`), a
  mid-stream `overloaded_error`/`api_error` event, and a body that is not
  JSON. The wait is `retry-after` (seconds or an HTTP date, capped at 10 s)
  or 1.5 s. A JSON reply that does not parse, or a broken stream, retries at
  once. Every attempt is logged with its request-id.
- **Truncation.** A `max_tokens` stop on any call (narrator, chronicle,
  parser, bookkeeper, Upgrade) retries once with twice `max_tokens`, then
  fails with "The reply was cut off". `Pipeline.narrate` also refuses a mock
  reply whose `stopReason` is `max_tokens`. A truncated narration is never
  committed.
- **Narrator max_tokens by effort:** low 2000, medium 3000, high 6000
  (`Api.NARRATOR_MAX_TOKENS`).
- **Cache TTL 1 h** on the narrator's three system blocks
  (`cache_control: { type: 'ephemeral', ttl: '1h' }`). Cost: a 1-hour write
  is 2x input, a 5-minute write 1.25x; the split comes from
  `usage.cache_creation.ephemeral_1h_input_tokens` / `_5m_`, and without
  it every `cache_creation_input_tokens` is a 1-hour write. `usage.turn` and
  `.session` gain `cacheWrite1h`. A dated model id (`claude-opus-5-5-20261001`)
  prices as its model (`Api.priceOf`).
- **Usage of retried calls**: tokens from every attempt are added up (a
  stream that broke, a cut-off reply), so the Debug tab's cost is what was
  billed.
- **Pre-warm.** `Api.prewarm(blocksOrThunk)`: when the last narration was
  more than 50 minutes ago (`Api.lastNarratorAt`), the parse step sends a
  `max_tokens: 1`, effort low, non-streaming call with the same three
  blocks, in parallel with the parser. Fire and forget; usage counted; a
  failure only logged (`role: 'prewarm'` in the response ring). Not on the
  first narration of a session (nothing to compare with).
- **Key check.** `Api.checkKey(key?)` → `GET /v1/models` with the key →
  `{ ok, status, message }` (never throws). `Api.validKey(key)` tests
  `/^[\x21-\x7e]+$/`; a key that fails is never sent and the turn says "The
  API key has a space or an invisible character in it (often from copying).
  Paste it again in Settings."
- **Refusal wording per role**: "The narrator declined that one…", "The
  parser declined that one…"; a bookkeeper refusal no longer fails the turn
  (below).

### Narration lifecycle

- `narrate()` rewrites only for a **hard** style problem (`p.hard !== false`;
  until the prompts change lands every problem counts as hard, as before).
  Soft ones go to the debug view (`kind: 'style', soft: true`).
- The rewrite is an **edit**: `messages: [user packet, assistant draft, user
  note + "Change only what the note names; keep everything else in the
  draft as it is."]` (ends with the user, per API_NOTES). The mock still
  receives `packet + "\n" + note` as `text`, so its tests are unchanged.
- The first draft **stays on screen**: `UI.feed.rewriting(node, true)` while
  the rewrite streams into a buffer, then `rewriting(node, false)` and
  `endNarration(node, text)`. Without `UI.feed.rewriting` (before the ui
  merge) the old clear-and-stream is used. A rewrite that fails, is refused
  or is cut off leaves the first draft as the narration.
- **Bookkeeper failure keeps the narration.** The engine's own changes stand
  (time, an arrival the bookkeeper would have made, due events consumed), the
  log entry gets `changes: 'not recorded'`, a quiet line says so, and the
  bookkeeper is asked once more in the background; its diff is applied when
  no turn is running and only if that log entry is still there and still
  not recorded (an `/undo` in between drops it). A bookkeeper refusal does
  the same without the retry.
- The **chronicle** runs after the turn is logged, autosaved and rendered
  (its own State batch), while the composer accepts a queued input.

### Status, Stop, queue (CONTRACTS 13)

- `Pipeline.setStatusListener(fn)`: `fn({ stage, message })`, stages
  `parse` (Reading your action…), `narrate` (Writing…), `rewrite`
  (Rewriting…), `bookkeep` (Updating the town…), `chronicle`, `idle`.
- `Pipeline.abort()` → `Api.abort()`: the turn fails cleanly (snapshot
  restored, feed lines taken out), the input goes back, notice "Stopped. Your
  action was kept in the box." Returns false when nothing runs.
- `Pipeline.acceptsQueue` is true from the end of the narration until the
  turn ends (bookkeeper, chronicle). `Pipeline.submit(text)` then returns
  `{ ok: true, queued: true }` and runs it when the turn ends (one deep; a
  second gets `busy`). `Pipeline.pass()` queues the same way. `Pipeline.queued`
  is the waiting text. A queued line that fails goes back in the box through
  `UI.restoreInput(text)` if the UI has it, else straight into `#cmd` if
  that is empty.
- `busy` is unchanged for everything else: `/undo`, loads, edits and updates
  still refuse while a turn runs (`runTurn` itself now also refuses when
  busy). `Pipeline.whenIdle()` resolves when no turn runs.

### Turn correctness

- **E1** `checkAndCreate(…, { defer: true })` holds back a `new:` item for an
  action that rolls; `createDeferred` makes it after the roll only if there
  was no roll or it succeeded. Otherwise NOT PRESENT with reason
  `not_found` and the bookkeeper gets `NOT FOUND (…): <thing>`.
- **E5** the last long of `/wait` and `/skip` is
  `advanceTime: { cost: 'long', toPhaseStart: true }`. The object form is
  sent only to an engine at rules version 8 (`State.RULES_VERSION >= 8`);
  an older one, or one that rejects it, gets the plain `'long'` and then
  `time.shorts = 0` here (so no rejected diff shows up before the merge).
- **E7** `/look`, `/rest`, `/wait`, `/skip` run the bookkeeper when a due
  event was narrated.
- **E8** the scene change a narration showed is cleared right after it
  (before this turn's time passes); the comings and goings this turn's time
  causes stay for the next narration.
- **E14** a defeat passes `{ cost: 'long', cause: 'defeat' }` (rules 8, as
  above; the word before) and the action's own time is no longer charged on
  top.
- **E15** `/cheat success` prints "Cheat: success" (`Cheat: 7` for a number);
  `/reroll` still prints "Rerolled.".
- **3.6** a move (or a walk-then-act) to a place with `discovered: false`
  says "You don't know where that is yet. Ask around." and spends nothing.
- **News**: on each new morning in `passTime`, unseen public `state.news`
  items show as one quiet line "Overnight in town: …" and are marked seen.
  An unseen item with `epilogue: true` is marked seen and its turn runs when
  the current turn ends: a narrator-only turn (no parser, no bookkeeper,
  no time) with the ending as `DUE EVENT`, `MODE: epilogue (ZOOM length
  allowed) …` and the zoom LENGTH line, then the quiet line "This is one
  ending. You can keep playing."
- **Chronicle threshold**: compress when `log.length >= 16`, all but the
  newest 6 (`Pipeline.CHRONICLE_AT`, `CHRONICLE_KEEP`).

### Fights, fates, secrets (CONTRACTS 10, 12)

- `State.apply(diff, { source: 'model', present, rollSuccess, attacked })`
  for the bookkeeper's diff (and the background retry).
- Attack difficulty: `Dice.threat(target)` when the parser gave none or
  `normal`. Damage: `Dice.fightDamage(tier)`; without it 1 on a partial, 1–3
  on a failure, 3 on a fumble.
- Locks: `Dice.lockKey`, `Dice.isLocked`, and `Dice.lock(key, roll)` /
  `Dice.clearLocks()` when engine-world has them (clearLocks on a move or a
  phase change); otherwise `meta.lastRollKey` as before. An attack on someone
  still present is never locked.
- `state.fight = { npcId, hits, day, phase, locationId }` (written directly
  inside the turn's snapshot: there is no op for it); the third successful
  hit (partials count) calls `World.knockDown(npcId, { turn, locationId })`
  before the narration, so its due event is narrated this turn.
- An attack with a police-tagged person present, or in a watch/police place,
  calls `World.arrestPlayer({ npcId, locationId, turn })` after the
  narration and the bookkeeper, instead of the action's time (if it leaves
  the clock where it was, a `rest` passes).
- `ctx.revealSecretFor = [npcId]` after a successful social roll aimed at a
  present person, and for anyone aimed at with attitude ≥ 50.

### Card game (REVIEW 3.8)

`actionType: 'gamble'` (accepted by `normaliseParse` whether or not the
shared `ACTION_TYPES` has it) is resolved in code by `gamble(ctx)`: a place
with `cardGame: true` or "card game" in its details/description, and a
present dealer (tag `bookie`, or tag `dealer` with cards in the role:
Curtis; Colt's `dealer` tag is the other kind). Stake from the words (`$50`,
`50 bucks`; default $20; at most the cash). Wits vs normal, +2 with a deck
carried. Win +stake, partial +half, failure −stake, fumble −stake and caught
cheating: weight-3 memory on the dealer, `banFrom` the place for 3 days,
public `addNews`, and the player is put out through the first open exit.
The narrator gets an `OUTCOME: the card game …` line after COMPLICATION; the
bookkeeper is told the money moved and its `goldDelta` is ignored. No game
or no dealer: no roll, a `CARD GAME: no game: …` line, no money.

### /recap and feed lines

`Pipeline.recap()` / `recapText()` (no API call): `Day N (date), phase, at
place.` / `Here:` / `Open:` threads with their summary / `Owed:` obligations
with "due Day 7 (2 days)" / `Warm to you:` and `Cold to you:` (top 3 by
attitude, with the latest memory) / `Heard:` last 3 rumours / `In town:` last
2 news items. `/recap` prints it (`Pipeline.printRecap`, a notice with
class `recap` and `white-space: pre-line`); `/rest` prints it after the
narration. Quiet lines: "<Name> warms to you." / "<Name> won't forget that."
when a known person's attitude crosses −60, −25, 25 or 60 on the
bookkeeper's diff; "Resolved: <thread>. +1 Charm." when
`player.progression` grows.

### Upgrade (R8, R9)

- **Per step**: `updateGame` keeps a private snapshot (state and the town
  copy) before each step; each step stamps `rulesVersion` when it completes.
  A failure or refusal at step N takes back only step N; steps before it
  stay, and the notice says which ("The step "…" changed nothing. The step
  before it (…) was kept: …"). With nothing done before, it is all taken
  back as before. The whole update stays one `/undo` step.
- **Re-read never cuts**: `PER_PERSON = State.MEMORY_MAX`; a person whose
  lines are all short already (≤ 12 words) and within the cap is not sent.
- **Newer saves**: `Upgrade.newer(st)`; `pending()` returns nothing and
  `updateGame` refuses with "This game was saved by a newer version…".
- **Version 8 "An arc"** (`anArc`, deterministic, no call): the town copy
  gains `calendar`, `events`, `epilogue` where it has none, and its rumours
  `tellerIds`/`threadId`, its threads `reward` (only missing fields: nothing
  is overwritten); the state's rumours and threads the same; defaults for
  `news`, `player.obligations`, `bans`, `eventsFired`, `time.instants`; an
  **unfired** loose-end seed gets `effects: [addObligation …]` from its
  option's `obligation` (dueDay = firing day + dueOffset). A loose end whose
  seed already fired gets nothing: its moment has passed and inventing a
  debt now would contradict the story. An unfired grudge/favour seed gets
  its template's `effects` when its text matches the template exactly.
  Goods `kind`s live in `TABLES` (code, not saved), so they need no copy.
- `Upgrade` uses `Town.sameRel` when Town exports it.

### CI (R10)

`.github/workflows/tests.yml`: push and pull request, Node 20, 20 minutes,
`node tests/run.cjs`. Playwright and Chromium are installed outside the
checkout and found through `NODE_PATH`, because `constraints.test.cjs`
asserts there is no `package.json` (`npm i playwright` in the checkout
would create one). The cost test in `playtest.test.cjs` now counts the
town block and asserts a band (1–6¢ a warm turn, under 8¢ with thinking,
a cache write under 12¢).

## What the player sees

- A stalled turn ends by itself within about two minutes at worst (45 s +
  retry + 45 s); Stop ends it at once. Either way the words go back in the
  box and nothing changed.
- No more half sentences saved as a turn.
- A style rewrite no longer blanks what they are reading; if the rewrite
  fails they keep the first draft.
- A bookkeeper hiccup no longer throws away the narration they just read.
- They can type the next line while the town updates; it runs right after.
- New lines in the feed: "Overnight in town: …", "Loretta warms to you.",
  "Lyman won't forget that.", "Resolved: …. +1 Charm.", "Cheat: success",
  "You don't know where that is yet. Ask around.", "This is one ending. You
  can keep playing.", and `/recap`.
- Cards at the Low Water when Curtis is dealing.

## Tests changed by design

- `api.test.cjs`: cache_control has `ttl: '1h'`; cost uses 2x for the write;
  a parser refusal says "The parser declined…"; a bookkeeper refusal keeps
  the narration (`changes: 'not recorded'`); a mid-stream overload is retried
  once, so the error test queues two.
- `pipeline.test.cjs`: ttl in the cached blocks; the refusal test covers
  parser and narrator with their own words (the bookkeeper case moved here).
- `state.test.cjs`: ttl in `requestBody`.
- `shell.test.cjs`: `/recap` in the command list.
- `acceptance.test.cjs` [6], `world.test.cjs` (two), `playtest.test.cjs`: the
  chronicle at 16 entries keeping 6 (turn 15 and 25 instead of 10 and 20);
  the cost test counts the town block, prices the 1-hour write and asserts a
  band.
- `constraints.test.cjs`: `fetch` may reach `ENDPOINT` and
  `MODELS_ENDPOINT` (both literal `https://api.anthropic.com/v1/…`), the
  models list from one place only. The intent (the game talks only to the
  API) is kept and both URLs are asserted.

## Needs from others

- **engine-state**: bump `RULES_VERSION` to 8 (new games at 8). Until then
  version 8 is dormant (`Upgrade.known()` filters steps above
  `State.RULES_VERSION`) and the `advanceTime` object form is not sent.
  `advanceTime` taking `{ cost, toPhaseStart, cause }` at rules 8 (I fall back
  to the word and zero `shorts` when it refuses). `logEntry` keeping
  `changes: 'not recorded'` (I set it on the entry directly when the op drops
  it). An op for `state.fight` if you prefer it to my direct write. If you
  expose a helper that turns a loose end's obligation into the seed's effect
  (`State.obligationEffect(le, seed, obligation)`), version 8 uses it;
  otherwise it writes `{ op: 'addObligation', kind, npcId, text, amount,
  dueDay, itemName, onMiss, onMet }`. `State.news` getter (I fall back to
  `state.news`). Ops `banFrom`, `addNews` (the card game uses them through
  `State.apply({ effects })`; rejected and logged until they exist).
- **engine-world**: `Dice.threat`, `Dice.fightDamage(tier)`,
  `Dice.lock(key, roll)` / `Dice.clearLocks()` (lock only failures, or decide
  from `roll`), `World.knockDown(npcId, { turn, locationId })`,
  `World.arrestPlayer({ npcId, locationId, turn })` (time to the next
  morning; I tick a `rest` if it does not move the clock),
  `World.tick` writing `state.news` with `seen: false`. `Town.sameRel`.
- **prompts**: `Style.check` problems with `hard: true|false`; render
  NOT PRESENT reason `not_found` as "(not found: …)" (until then the default
  "does not exist" wording is used); `MODE: epilogue` in `narratorPacket` (I
  replace the MODE and LENGTH lines when it is missing); `actionType:
  'gamble'` in the parser schema and the mock parser; the memory re-read's
  "At most 6 per person" (SYSTEM.memories, the schema description and
  `mockRewrite`) could now say 12 (`State.MEMORY_MAX`); secrets in
  `npcLine` for `ctx.revealSecretFor`.
- **ui**: `UI.feed.rewriting(node, on)`; Send → Stop calling
  `Pipeline.abort()`; keep the input usable while `Pipeline.acceptsQueue`
  and show "Queued" on `{ queued: true }`; optionally `UI.restoreInput(text)`
  for a queued line that fails; show the status stages; call
  `Pipeline.printRecap()` (or show `Pipeline.recapText()`) on Continue;
  `.f-notice.recap { white-space: pre-line }` (set inline for now);
  Settings' "Check key" → `Api.checkKey()`; warn on `State.load` newer.
- **content**: `cardGame: true` on the Low Water if you prefer it to the
  details text; `obligation` on LOOSE_ENDS options and `effects` on the
  grudge/favour templates (version 8 copies them).

## Not done, and why

- **"Count every 6 instant inputs as one short" (pace)**: the clock is
  engine-state's (`time.instants`); version 8 only fills the default.
- **A failed defend/flee roll dealing 1–3**: there is no defend action type;
  only attacks deal damage to the player here.
- **Upgrade dead-code removal** beyond `sameRel` (wave 1 rule).
- **README / BUILD_PLAN**: text below for the docs pass.

## README text to fold in (What a turn costs)

> The narrator's three system blocks (style guide, town, cast: about 11,500
> tokens) are cached for an hour, so a slow reader no longer pays a cache
> write after every five-minute pause. A write costs 2x input (about 9 cents
> with Opus 5.5) and is needed about once an hour; when you come back after
> more than 50 minutes the game warms the cache while your action is being
> read, so the narration itself reads it. With medium-effort thinking a
> warm turn is about 4 to 5 cents. Debug shows the real token counts and
> cost, a retried call included.

> A stalled reply ends after 45 seconds with nothing arriving (two minutes
> for the parser and bookkeeper); a busy or failing API is tried once more,
> waiting what the API asks (at most 10 s). Stop cancels a turn. A reply cut
> off by its length limit is asked for again with twice the room and is
> never saved half finished.

## BUILD_PLAN text to fold in (Direction changes)

> Transport (wave 1): timeouts and Stop; retries honour retry-after; a cut-off
> or broken reply is never saved; the narrator cache lasts an hour; the
> bookkeeper and chronicle run while the next line can be queued, and a
> bookkeeper failure keeps the narration. `/recap` built in code. Updates
> stamp each step and keep the steps that worked. CI runs the suite on every
> push.

## Integration (after the six merges)

- Only a hard style problem asks for a rewrite (`check.hard`), and the note
  carries the soft ones too; one debug entry per attempt (soft-only: `soft:
  true, kept: true`).
- A place shut today (`State.isClosed`: `closedOn`) or barred to the player
  (`State.isBanned`) is a shut door for a walk-then-act, a flight, the
  engine's arrival after a move, being thrown out, and `/skip` ("You are not
  welcome at X until day N.").
- `moveWhen: 'after'`: the action happens here, then `walkOn` moves the
  player after the bookkeeper (not when shut, down, or already moved); the
  turn costs at least a short.
- `/skip to X at <phase>` moves first and waits there, so an event at X
  happens in front of the player.
- "Overnight in town" runs at the end of step 11 (after the day's seeds
  fire), once per morning, and marks what it told with `State.apply({
  newsSeen: 'public' })`; an ending is picked up first (`noteEnding`).
- The attitude quiet lines ("warms to you") are App's alone now (they came
  twice).
- `state.fight` is still written directly inside the turn's snapshot (no
  op); it is undone with the turn.
- `passTime(cost, cause)` sends `{ cost, cause }` at rules 8, so the
  narration turn of `/rest`, `/wait`, `/skip`, an arrival, a defeat, an
  arrest or an epilogue is not counted as an instant (State's
  `NOT_ACTIONS`); an ordinary turn's cause is `turn` and counts.

## Wave 2

The code review's bugs 1, 3, 4, 5, 6, 9, 10 and its risks on the turn side,
SEAMS "what remains", and the playtest's turn items. Tests:
`tests/wave2-fixes.test.cjs`.

### Rolls, asks, fights

- **A success locks nothing** (review bug 1). After a roll the Pipeline
  stores `Dice.lockFor(roll, key)` through `State.apply({ lastRollKey })`:
  the locks still in force here, plus the key on a failure, or `+key` on a
  social success (which locks nothing). Only a failure of the same ask is a
  "SAME ASK AGAIN". **Diminishing returns apply**: `Dice.successes(key)`
  before the roll; on a social success with earlier ones this phase the
  bookkeeper's positive attitude change for that person is scaled by
  `Dice.diminishing(n)` (full, half, a quarter, then nothing) and the
  narrator gets `ASKED BEFORE: ...`.
- **Gifts**: the second gift (`give`) to the same person in a day earns no
  attitude (`State.apply({ giftGiven })`, `meta.gifts`).
- **Complications act** (review bug 6): `roll.complicationEffects` are
  applied with the roll; the bookkeeper's ALREADY APPLIED says so; the
  debug log has a `complication` entry.
- **No roll without someone there** (playtest B4, B17): an attack or a
  social action aimed only at people who are not here (NOT PRESENT says
  so), or a social action with nobody here at all, has no roll: no damage,
  no complication, no lock, no story point.
- **Fights** (review bug 5, playtest B2, B7): one fight is the same person,
  the same place, attack turn after attack turn (a phase may roll over in
  the middle; a miss keeps it going). `state.fight` is written through
  `State.apply({ fight })`. The third clean hit: `OUTCOME: <Name> goes down
  hard ...` in this narration, the one knocked down stays in PRESENT for it
  (`ctx.stillHere`), and the bookkeeper is told it is done. An attack with
  the police here: `ARREST: <the plan>` in this narration, TIME THIS TAKES
  says the night in the cell, and no due event tells it again next turn.
- **Cards**: a fumble without a marked deck is an accusation (dealer -10,
  a weight-2 memory, out for the night); with a marked deck it is caught
  (dealer -20, weight-3 memory, three days out, news). Only a marked deck
  gives +2. No game at a place shut today.
- **Takes** (playtest B5, REVIEW E1): a take of a `new:` thing never makes
  it: NOT PRESENT "nothing like that is here to take" (only ITEMS HERE can
  be picked up). "X and a Y" is two things.

### Due events, scenes, time

- Due events (playtest B6): three a turn (`World.MAX_DUE`), every one that
  is waiting on `/rest`, `/wait`, `/skip` (`DUE_QUIET`); such a narration
  with more than three may run to ZOOM length. A walk to an open place: the
  due events are those of the destination and whoever comes for the player
  meets them there. The DUE EVENT line marks a town event at the player's
  place as the scene, and one from an earlier day says so ("this came up on
  day N; any days it counts are from then, and OPEN has them as of today").
- DESTINATION shows who is there in the phase the walk lands in (REVIEW
  E8, playtest B8).
- TIME THIS TAKES: the instant that makes six says "a moment, but the talk
  has added up to a few minutes" (from `time.instants`); an arrest says the
  night in the cell.
- `/skip` (review bug 9): a place shut the day the player gets there
  (closed, closed that weekday, barred) is refused; one shut now but open
  then is walked to after the wait.
- `/rest` in a place shut today: the narration hears they slept rough and
  that the place is shut.

### Turn lifecycle

- **The late bookkeeper** (review bug 3): its diff is applied only while
  that turn's log entry is still the newest (else the turn stays not
  recorded, noted in the debug log), never moves the player, runs under that
  turn's caps, clears `changes` through `logUpdate`, and its quiet line goes
  on that entry.
- **Stop while the town is updated** (review risk, coordinator): the
  narration stays, the turn is logged with `changes: 'not recorded'` (no
  retry), a quiet line says so, and a queued line goes back in the box
  instead of running. `Pipeline.canStop` is true while any turn runs.
- **The ending** (review bug 4): marked seen only when its own turn commits
  (`newsSeen: 'ending'`); a failed or stopped ending stays unseen and is
  told at the end of the next turn, with a notice that says so (no "kept in
  the box": it has no input).
- **`/reroll` and `/cheat`** (review bug 10): the turn is replayed from the
  action as parsed (`lastTurn.parsed`), so a failed search can find the
  thing on a success.
- **A read-only tab** (coordinator item e): see "Queue and read-only" below.
- Removed: the pre-rules-8 `advance()` fallback that wrote `time.shorts`,
  the direct `seen` writes, Pipeline's own calendar (`calendarDay`, its
  weekday and month lists: `State.weekday` / `State.dateLine`), the second
  `obligationsOpen`, the `State.news` function fallbacks.
- `noteIntroductions` passes who is present, so someone introduced in front
  of the player is met (`metTurn`, playtest B19).
- Player-facing lines built by the engine say "the Low Water" mid-sentence
  (notices, the arrest, the knockdown, the card game, the recap); the packet's
  own lines (MOVED, THEN, TIME PASSED) keep a place's name as written.

### The recap (coordinator item f, playtest B20)

`Pipeline.recapText(opts)`, one line each, in this order (the UI adds the
heading "Where things stand" and bolds what comes before the first colon):

```
Day 2 (Friday 9 October), morning, at Pittman's Gas and Service.
Here: Royce Pittman, Dewayne Mangum and Jodie Strayhorn.
Open: A debt (I owe a man in this town six hundred dollars I don't have); An enemy (...).
Owed: You owe Royce Pittman $400 · due Day 3 (2 days).
Warm to you: Royce Pittman (friendly), Loretta Gaddis (warm, remembers you fixed the fuel pump).
Cold to you: Boyd Teague (cold, your loose end: an enemy), Lyman Coker (wary, remembers you called him a liar).
Heard: "The council meets Tuesday about the bridge" (Royce Pittman).
In town: Day 2: The council voted to close the old bridge.
```

Here and Open always; the rest only when there is something. A warm or
cold person's bracket is the attitude word and at most one reason: "your
loose end: <its label>" for someone tied to one, else their newest memory of
weight 2 or more after "remembers", read with the player as "you" and the
person's "me" as him, her or them (never the raw memory, never "Loose end
with ..."). Owed lists the open obligations and the missed ones still owed
(with part payments). Long text is cut at a word with "…"; rumours are in the
order heard (`heardDay`). Once the ending has happened (`flags.epilogueShown`)
the first line is followed by "The story has reached an ending; you can keep
playing.", and the recap after `/rest` (`{ brief: true }`) is only those two
lines.

### Queue and read-only (the UI's asks)

- `Pipeline.cancelQueued()`: the line waiting in the queue is taken back (it
  will not run); returns its text, or null when nothing waits.
- A read-only tab: `runTurn`, `submit` (a line), `pass`, `reroll`,
  `setClock`, `arrival` and `/undo` show `UI.toast(UI.READ_ONLY_NOTICE)` (a
  notice of their own when the UI has none) and return `{ ok: false,
  reason: 'read-only', restoreInput: true }` before any snapshot or call.

### Commands, Upgrade, Api

- `/save` and `/load` list `[name]`.
- Upgrade version 8 writes through `State.apply({ arcFill })` and builds a
  loose end's obligation with `Town.obligationFor`.
- `SYSTEM.memories` and the re-read schema say "At most 12" (State.MEMORY_MAX,
  Upgrade.PER_PERSON) and that a line already in the current form stays as
  it is (coordinator item a; the mock's own rewrite still keeps six, a mock
  matter).

### Small edits outside this region (for the UI agent's merge)

- App `attachNotes`: `State.apply({ logUpdate: { notes } }, { quiet: true })`
  instead of writing `e.notes`.
- UI `canStop`: Stop also while the town is updated (`Pipeline.canStop`),
  unless a typed line is to be queued.
- UI `newsOf`: reads `State.news` (the function fallback was dead).
- Storage `keepPrevious`: only a readable autosave of another game is copied
  to `.prev`. Storage `parseEnvelope` / `shapeProblems`: the town is checked.
- Mock narrator (now the content agent's): keeps the first due event whole
  when it has to shorten, and takes every due event the engine hands it.

### Tests changed by design

- `engine-state-fixes.test.cjs` (memoriesSettled needs the person present).
- `engine-world-fixes.test.cjs` (the missed obligation's due event is plain
  words, not the task text).
- `world.test.cjs` (three due events a turn, four planted; a narration of
  time passing may carry more).
- `transport-fixes.test.cjs` (the recap's heading and person lines).
- `upgrade.test.cjs` (the re-read prompt's cap is PER_PERSON).
- `ui-fixes.test.cjs` (screenshots only with `UI_SHOTS`; coordinator item d).
