# UI wave 1: what changed

Region: CSS, HTML, Storage, UI, App (and the CSP meta at the top). Review
items: §2.5 U1 to U14, §2.4 R3, R4 (the Storage side), R5, R9 (warning and
key check), §3.6 (Journal, feed lines), §3.10 (the demo is not the default),
plus the UI for obligations, news, weekdays, bans, presets, cost and Check
key. Tests: `tests/ui-fixes.test.cjs` (26 tests). Screenshots from a run go
to the scratchpad `shots2/` folder (set `UI_SHOTS` to put them elsewhere).

## What the player sees

### First five minutes
- **Title**: name, a one-line tagline (`TOWN_DATA.tagline` if the town has
  one, else a generic line), then the buttons, so New game is above the fold
  at 375x740 and 1280x800. Under them a chip: "Offline demo — canned replies
  · Add API key" or "Playing with Claude · claude-opus-5-5" (or "Playing
  with Claude, no API key yet · Add API key"). Then the first two sentences
  of the setting and a "More about the town" disclosure for the rest.
  Continue has a line under it from the autosave: "Tomas Reed · Day 3 · The
  Low Water". A damaged autosave is explained here with **Download it**
  (the stored text, byte for byte, as `damaged-autosave.json`).
- **The demo is no longer the default.** With no key and no choice yet,
  New game first asks "How do you want to play?": **Play with Claude (paste
  your API key)** opens a key field (with Remember and its warning) and
  Continue; **Try the offline demo (placeholder text)** goes to the form and
  is remembered (`settings.playChoice`: `'demo'` or `'claude'`). Entering a
  key anywhere (that view, Settings, the title chip) turns the demo off with
  the toast "Mock mode off: playing with Claude". While the demo is on, a
  slim bar under the top bar says "Offline demo: replies are canned." with
  **Add key** (or **Play with Claude** when a key is already set) and ×.
  Storage keeps `mockMode` as before (Api reads it): with no setting saved
  it is on only while there is no key, since nothing else can run.
- **Creation** (5 steps on a phone, one page on a laptop): **Random
  character** at the top fills every step (a name nobody in town has, a
  background, maybe a moved point, a suggested goal, a flaw, three loose
  ends) and goes to the summary. Stats are tiles with a line each saying
  what the stat is for, and − / + steppers: one point taken from one stat
  and given to another (half a move is refused with a reason). Goal and
  flaw share a step; the goal has suggestion chips from
  `Game.data.GOAL_PRESETS` (fallback: "Find out what happened to my
  brother") and a placeholder that cannot be mistaken for a value ("Type
  why you came here, or tap a suggestion"). Each loose end picked is one
  editable line with its options as suggestion chips (the select is gone).
- **The first narration** of a new game is followed by a three-line tip
  (Do vs Say, Wait, `/` or ⋯ for commands, the panel), once per browser
  (`settings.tipSeen`); × closes it, and it goes by itself after a few
  turns. It sits just after the feed (`#feed-after`), not in it.

### The core loop
- **Status line** above the input while a turn runs: "Reading your action…",
  "Writing…", "Rewriting…", "Updating the town…", "Summarising…" (a dot
  pulses; it holds still under reduced motion). Driven by
  `Pipeline.setStatusListener` when the Pipeline has it; until then the UI
  infers the stage from the feed (input line, narration start, end).
- **Send becomes Stop** while a turn runs, when `Pipeline.abort` exists
  (otherwise it is off, as before). While `Pipeline.acceptsQueue` is true
  the box stays usable and Send queues through `Pipeline.submit`, with a
  small "Queued" note. Enter during a turn that cannot queue keeps the line
  in the box and the status line says why.
- **Enter on an empty box does nothing.** Wait (a paid turn) only comes
  from the button (the phone keyboard's Send key is Enter).
- **The kept-input notice is true**: a failed turn's line goes back in the
  box only if the box is empty (or still holds it); otherwise "Your action
  was kept in the box." in the notice becomes "Your action: “…”".
- **Say on a phone**: one 44px row that scrolls sideways (the pressed chip
  is scrolled into view); with more than 4 people here a "To: Everyone ▾"
  picker leads the row and stays put while the chips scroll.
- **Typing on a phone** (the box has the focus and the keyboard is up, from
  `visualViewport` or a shrunken window): the tab bar and the demo bar step
  aside. With the keyboard down (Android back key) they come back even if
  the box keeps the focus.
- **Quiet lines are kept**: `UI.feed.quiet` also records the line in
  `UI.pendingNotes`; App puts them on the newest log entry as `notes: []`
  when the turn commits (State's listener), or at once outside a turn (an
  edit, a pronoun, `/cheat time`). `rebuildFeed` shows them after that
  entry's narration, so "Added to the map", "Edited …", damage and the like
  survive a reload; a failed turn's lines go with it, an undo takes them
  back.
- **Attitude lines** (§3.6): after a turn, each known person whose attitude
  crossed a band gets a quiet line: "Loretta Gaddis warms to you.", "…
  cools toward you.", or "… won't forget that." (down to wary or worse).
  Loads, undos and edits do not.
- **Recap on Continue**: if the Pipeline has `recapText()` (or `recap()`),
  its text is shown as a notice after Continue.
- `UI.feed.rewriting(node, on)` dims the first draft under "Rewriting…";
  `endNarration` puts the final text in.
- The feed keeps its scroll position across Settings and Saves; the toast
  sits under the top bar on a phone; dividers read "Day 2 · Friday ·
  Evening" and the top bar "Fri · Day 2 · Evening" once `State.weekday`
  exists (the weekday is its own span, `#tb-wd`, so `#tb-time` still reads
  "Day 2 · Evening").
- **Undo** is a small link at the end of the newest input line (a sibling
  of the line laid over its right edge, so the line's text stays as typed).

### Panels
- **Journal**: Story so far (public town news the player has had, with day
  labels, and the chronicle, newest first), Leads (rumours heard, "Loretta
  Gaddis told you, day 2"), Threads (open, resolved, failed; the people a
  thread links are chips that open their card), You owe / are owed
  (obligations with "due Day 7 (2 days)", overdue in red, met and missed
  struck through), Notes (journal entries with "Day 1 · Morning").
- **People**: a search box (name, role, place seen or home) that stays at
  the top while the list scrolls; sort chips for the Known group (last
  seen, attitude, name); Elsewhere and Gone folded away (opened by a search
  that matches in them, or when their card is the open one); "Hurt, until
  day 5", an away-today note, "Banned you from X until day 9" on the card.
  The editor folds Look, voice and history away, and Save / Cancel stay at
  the bottom of the panel.
- **Places**: labels try the place's own anchor, the four sides, the four
  corners, and slid or closer variants, measured with the real font, and
  keep the spot that hides fewest markers and labels (`hides()`, shared
  with the "Go to" chip), over a few orders. From every place a game starts
  knowing there is no overlap at all (the old map had 38 over the same 30
  positions); with every place found, 36 small touches over 46 positions
  (was 207). "You are here" is gone: a ring and a bold label. **Expand
  map** on a phone (full screen, Close map or Escape). **Go there** on each
  exit and in a place's sheet (the same Do turn as the map chip).
  "Closed Sundays" (from `closedOn`) beside the hours, "(closed today)", and
  "You are banned until Day N" in the sheet.
- **Character**: a Standing row per faction (`State.reputationTier(k)`),
  **Spend** beside story points (fills `/fact `), "Grown" (resolved threads
  and what they gave), conditions with days left.
- **Debug**: News, Obligations, Bans, Events fired at the top; the API block
  adds any extra usage counters the transport keeps (1-hour cache writes),
  the narrator's `cache_control` (the TTL) and the session cost.

### Settings and saves
- **Quality**: Thrifty (Sonnet narrator, Haiku parser, all low; about 1¢ a
  turn), Standard (the defaults), Best (Opus and Sonnet, high effort). The
  model fields, the effort selects and the demo switch are under
  **Advanced** (open when the settings match no preset: "Custom").
- **Check key** (needs `Api.checkKey()`; a key with a space or a hidden
  character is caught before any call, R9). "This session: N turns · $X"
  from `Api.usage` at the top. A warning beside "Remember on this device":
  other HTML files opened in the same browser can read a remembered key.
- Saves: "Last exported: N days ago / never"; **Restore previous** when a
  previous autosave is kept; `navigator.storage.persist()` asked once (on
  Begin or the first load).

### Storage safety (R3, R4, R9; CONTRACTS §14)
- Before the autosave is written with a different game (another
  `meta.createdAt` or seed), the old one is copied to
  `novatria.autosave.prev` (a damaged one too). Saves screen: "Previous
  autosave · Restore previous" (the two swap, so nothing is lost).
- New game, Load, Import and a slot's Update over an autosave that is in no
  slot ask first ("Replace the autosave?", a modal `<dialog>`; Keep it /
  Go ahead). `App.newGame`, `App.enter` and `App.loadSlot` stay synchronous
  when nothing needs asking and return a promise when they ask.
- A loaded game (Continue, slot, import, previous) is drawn inside a State
  batch, so the autosave is written only once it is on screen; if drawing
  throws, the game that was open comes back and nothing of the new one is
  saved.
- A `storage` event for the autosave from another tab makes this tab read
  only: a banner "This game is open in another tab. This tab will not save
  until you play here instead." with **Play here instead** (which writes,
  and so makes the other tab read only).
- A save from a newer build (`State.load` returning `{ newer: true }`, or
  its rules version above `State.RULES_VERSION`) shows a warning banner.
- Import: files over 5 MB are refused before reading; a refusal shows
  `State.validateShape`'s reason (an array, a string or `{ ok, reason }`
  are all read).
- **CSP** (R5): `default-src 'none'; script-src 'unsafe-inline';
  style-src 'unsafe-inline' https://fonts.googleapis.com; font-src
  https://fonts.gstatic.com; connect-src https://api.anthropic.com;
  img-src data: blob:; base-uri 'none'; form-action 'none'`. Checked from
  `file://` in headless Chromium: the game runs, the font link is allowed
  (the tests block it at the network), a fetch to any other host is refused
  by the page.

### Accessibility (U13)
- `showScreen` focuses the new screen's h1 (`tabindex=-1`; the game screen
  has a hidden "The story" heading; on a laptop the input takes the focus).
- The phone sheet is modal: `inert` on the story, the top bar and the bars
  while it is open; Escape or × gives the focus back to the button that
  opened it. The tab bar buttons have `aria-controls="panel"` and
  `aria-expanded`.
- The tablist has one tab stop and arrow keys (Home, End). The Menu and the
  ⋯ list move the focus into their items (arrow keys, Escape back).
- Streaming: the feed is `aria-live="off"` and the narration node
  `aria-hidden` while it streams; the finished text is put in once.
- `--faint` is 5.5:1 / 5.1:1 (dark, on page / panel) and 5.5:1 / 5.0:1
  (parchment); a new `--field` token gives inputs, selects and the
  composer a 3:1 edge; map roads are 4:1 (dark) and 3.3:1 (parchment) on
  the land. Parchment `--muted` is darker to stay above `--faint`.

### Commands (U8)
- A **⋯** button beside the Do / Say toggle (and "Actions and commands" in
  the phone Menu): Look around, Wait until… (the other three phases), Sleep,
  Recap (when the Pipeline or Commands has one), Undo last turn, Spend a
  story point (fills `/fact `), Commands help (opens the `/` list).
- The command list shows descriptions on a second line on phones. The phone
  placeholder is "/ or ⋯ for commands" (the box is about 140px wide next to
  the toggle, ⋯ and Send); the laptop's "What do you do? (/ or ⋯ for
  commands)".

## Tests changed by design (and why)
- `tests/helpers.cjs` `overflowReport` and the audit in
  `tests/mobile.test.cjs`: content inside a box that scrolls sideways on
  purpose (the phone's Say row) and is itself on screen is scrolled, not
  overflow.
- `tests/mobile.test.cjs`: the how-to-play view after New game, the
  steppers instead of the move selects, goal and flaw on one step,
  Elsewhere opened before clicking a card in it.
- `tests/shell.test.cjs`: New game shows the choice first (`#choose-demo`);
  five steps (6 → 5), steppers, loose-end chips; the divider may carry a
  weekday; the settings test opens Advanced and checks Standard; the export
  test turns the demo back on after typing a key (a key now turns it off).
- `tests/pipeline.test.cjs`: the editor test opens "Look, voice and
  history"; the Elsewhere test opens the group; divider checks ignore the
  weekday (`noWeekday`), so they hold before and after the calendar lands.
- `tests/upgrade.test.cjs`: the same `noWeekday` on two divider checks.
- `tests/map.test.cjs`: no "You are here" caption (the ring and a bold label).
- `tests/constraints.test.cjs`: no `innerHTML`, `outerHTML`,
  `insertAdjacentHTML` or `document.write` in index.html.
- `tests/settings.test.cjs` needed no change: it never asserted the demo
  default.

## Needs from others (coded defensively; works without them)
- transport: `Pipeline.setStatusListener(fn)` with `{ stage, message }`
  (stages parse, narrate, rewrite, bookkeep, chronicle, idle), and an `idle`
  at the end; `Pipeline.abort()`; `Pipeline.acceptsQueue` and
  `Pipeline.submit` returning `{ ok: true, queued: true }`;
  `UI.feed.rewriting(node, true)` before a rewrite and `endNarration` after;
  quiet lines through `UI.feed.quiet`; `Api.checkKey(key?)` resolving
  `true` or `{ ok, message? }`; extra usage counters as numbers on
  `Api.usage.turn` / `.session`; `Pipeline.recapText()` (or `recap()`).
  The error notice should keep the sentence "Your action was kept in the
  box." (the UI rewrites it when it cannot keep that promise).
- engine-state: `State.weekday(day)`, `State.isClosed(loc)`,
  `State.isBanned(id)`, `State.obligations()`, `State.news` (array or
  getter), `State.reputationTier(k)` (exists), `State.load` returning
  `{ newer: true }` (or keep `State.rulesVersion` and `RULES_VERSION`),
  `State.validateShape` with a reason. It would help if `rumoursHeard`
  stamped `heardDay` itself: the UI stamps it today in State's listener (new
  ones get the day, ones heard before a load get `null`).
- content: `Game.data.GOAL_PRESETS` (strings, or `{ text }`), and
  optionally `TOWN_DATA.tagline` for the title.

## README / BUILD_PLAN text to fold in
- How to play, step 3: "The first time you start a game the game asks how
  you want to play: with Claude (paste your API key) or the offline demo
  (placeholder text, no API calls). Entering a key turns the demo off. The
  demo switch is under Settings → Advanced."
- Settings table: replace the Mock mode, Narrator model, Parser model and
  Effort rows with "Quality: Thrifty / Standard / Best, the models and
  effort per role under Advanced"; add "Check key", "This session: N turns
  · $X", the warning beside Remember.
- Saves: "Before the autosave is replaced by a different game, the old one
  is kept as the previous autosave (Saves → Restore previous). Replacing an
  autosave that is in no slot asks first. A second tab with the same game
  goes read only." "Last exported" line.
- Commands: the ⋯ button lists Look around, Wait until…, Sleep, Recap,
  Undo, Spend a story point and Commands help; Undo is also a link on the
  newest line. Enter on an empty box does nothing; Wait is the button.
- Do and Say: on a phone the Say chips are one row that scrolls sideways,
  with a "To:" picker when more than four people are here.

## Not done, and why
- Map labels with every place found still touch in a few spots around
  Pittman's and River road (dense corner of a 360-wide map); the test
  holds zero overlaps for the places a game starts with and at most two
  elsewhere.
- No recorded live opening scene for the demo (§3.10's "ship one recorded
  live opening scene"): it needs a real narration, which is content.
