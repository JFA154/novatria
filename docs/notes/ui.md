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

## Integration (after the six merges)

- `heardDay` is stamped by State (`rumoursHeard`); App's `stampHeard` is gone.
- Random character takes a family name from a short list in the creation
  view (`PLAYER_SURNAMES`, never one anyone in town has): `TABLES.npc` has no
  family names any more.
- Debug: extra usage counters follow the cost, labelled ("1-hour cache
  write N").
- App's attitude band lines are the only ones (transport's copy is gone).

## Wave 2 (the visual, mobile and accessibility QA)

Region as before: CSS, HTML, Storage, UI, App. Every defect from the QA
report (D1 to D15), the REVIEW items it found only partly done (U8 to U14),
its polish list, its two docs-check items and three items from the playtest
report (B10, B11, the read-only wording) are fixed. Tests: 13 new ones in
`tests/ui-fixes.test.cjs` ("wave 2, …"); screenshots now go to
`os.tmpdir()/novatria-ui-shots` (or `UI_SHOTS`), never a session folder.

### One guard for anything that plays (D1)
- `UI.canAct(opts)` is the single check before Send, Wait, the ⋯ actions,
  the Undo link, Go there, the map's "Go to" chip, Spend, a pronoun chip,
  and Edit and Save on a person. It says no in a read-only tab
  (`Storage.readOnly`), without a game on screen, and while a turn runs
  (`opts.queue`: unless the Pipeline can queue this line; `opts.fill`: Spend
  only fills the box, so a turn does not block it). `opts.say` toasts the
  reason. The panel's controls are drawn disabled with the reason as their
  title, and `setBusy` re-checks them with the same guard.
- Going read only (`UI.otherTab`) closes the ⋯ list and the command list,
  drops a picked map place, takes the Undo link away and redraws the panel.
  The bar reads "This game is open in another tab, so this tab is
  read-only." with **Play here instead** as the one way out.
- **Play here instead** is `App.playHere` (B11): it loads the autosave the
  other tab wrote (drawn before anything is written, like any load), and
  only then `Storage.claim()` writes it back, which makes the other tab read
  only. An autosave this tab cannot read or draw is copied to
  `novatria.autosave.prev` first (`Storage.keepAside`), this tab's game is
  saved, and the banner says so. `Storage.takeOver` now calls
  `App.playHere`. A game loaded or begun in a read-only tab plays there the
  same way. A load resets App's attitude bands, so turns played in another
  tab (or a later slot of the same game) never produce "warms to you" lines.

### Phone composer, command list, Say (D2, D9, D10)
- The ⋯ button moves to the end of the tab row on a phone (`#act-btn-m`;
  `#act-btn` stays beside the toggle on a laptop), so the box is about 225px
  wide at 390 (was 178, and two lines). The phone placeholder is "What do
  you do?" / "What do you say?" and never wraps; `autosize` keeps an empty
  box at one line whatever the placeholder would wrap to.
- The command list is positioned on the input row, so it spans the row (359px
  at 375; was the box's 158) and each description fits on one line.
- With more than four people here, a phone's Say row is the "To:" picker
  alone (no chips after it), as wide as its longest name (`min-width: 12em`,
  `max-width: 100%`). Redrawing the row keeps the focus on the picker or the
  chip it was on.

### Map (D3, U9)
- **Expand map** is on the laptop too. The expanded map is a modal dialog
  (`role=dialog`, `aria-modal`, labelled "Map of …") with a bar and Close
  map: everything else (the story, the bars, the panel's tabs and the rest
  of the panel) is inert, Tab and Shift+Tab go round inside it, Close map
  takes the focus, Escape closes (a picked place first) and the focus goes
  back to Expand map. Its size (`expandedSize`): a phone fills the height
  below the bar and is at least 1.6 times the sheet's width (821 by 684 at
  375x740), panning sideways, opened centred on the player; a laptop fits
  the window (835px wide at 1280x800, against 320 in the panel). Labels are
  laid out again at 14px on screen, so there is more room between them. It
  is drawn again when the window changes.

### Focus never dropped (D4)
- `renderPanel` puts the focus back on the same control after any redraw
  (its id, else its class and a few data attributes inside its card or
  section); a control that is gone or off gives it to the panel's tab, never
  the page. So a People sort chip keeps it.
- Back to edit focuses the form's heading. Edit on a phone focuses the form
  (`tabindex=-1`, labelled "Edit …"; no keyboard pops up). Next and Back on
  a phone focus the step's heading (`tabindex=-1`), so the keyboard never
  covers the goal suggestions (D12).
- Review with errors: one message (`#cr-errsum`, `role=alert`; beside Review
  on a laptop, for screen readers only on a phone), such as "Fix 3 things
  first: Name, Background and age and Goal and flaw." The steps' own
  messages are plain text now (no five alerts at once); the first field to
  fix gets `aria-invalid`, `aria-describedby` and the focus.

### Contrast (D5, D7, D15)
- Parchment text tokens darkened to hold 4.5:1 on the page, the panel and
  an open card: `--accent #815219`, `--danger #9c3d28`, `--att-cold
  #416076`, `--att-cool #515e62`, `--att-mild #815029`, `--att-warm
  #8f4819` (`--focus` follows `--accent`). Dark passed already.
- `::placeholder` uses `--faint` at full opacity: 5.1:1 / 5.0:1 on a field.
- Controls (buttons, chips, choice cards, Say chips, segmented labels, the
  ⋯ and New buttons) have a `--field` edge (3:1 or more on every surface);
  `--border` stays for dividers and containers. The stat tiles show values
  and are not controls, so they keep `--border`.
- New map tokens: `--map-river` for the river's name on the water (5.2:1
  dark, 4.9:1 parchment, with a water halo) and `--map-dim` for a closed
  place's marker and label (5.1:1 / 4.7:1, no opacity). The "Rewriting…"
  draft is drawn in `--muted` (7:1) instead of at 45% opacity.

### Smaller fixes
- D6: while someone is being edited the People search and sort are not
  drawn, the panel has `scroll-padding-bottom`, and `keepFieldClear` scrolls
  a focused field above the sticky Save bar (also when the keyboard comes
  up).
- D8: the recap is one notice, `.f-notice.recap` (Continue, ⋯ Recap,
  `/recap`, after `/rest`): "Where things stand" drawn by CSS `::before` (so
  the node's text stays exactly `Pipeline.recapText()`), one line per kind
  with the kind in bold, `white-space: pre-line`. Its "In town" line is left
  out when an "Overnight in town" line is just above it. That line
  (`.f-quiet.f-news`) has an accent rule and a bold label.
- D11: a place's hours add "Closed Sundays" only when they do not already
  name the day; the place here reads "Gas station · Closed today (Sundays)".
- D12: a loose end's suggestion chips show their first four words with "…"
  (the whole line is the chip's name and tooltip, and goes in the field);
  the goal placeholder is "Why you came, in a line".
- D13: the toast sits just above the composer in the game (clear of the box,
  the top bar and the demo bar), near the bottom elsewhere and over the
  phone sheet (`--toast-bottom`). The title chip's texts fit one line at 375
  ("Offline demo (canned replies) · Add API key", "Claude, no API key yet ·
  Add API key", "… · Use Claude"). "Replace the autosave?" focuses Keep it.
- D14: a queued line shows as "Next: “…”" in the status line, with × to take
  it back once the Pipeline has `cancelQueued()`; Check key drops "Check the
  key in Settings." while in Settings; a damaged autosave reads "The
  autosave in this browser could not be read. The saved game is not valid
  JSON." (`Storage.parseEnvelope(text, 'The saved game')`); a newer-build
  autosave has a one-line note under Continue, and the banner after loading
  is one line.
- B10: Journal notes use the day and phase stored on the entry; "Story so
  far" sorts news and chronicle together by day, phase and turn, newest
  first (a chronicle entry with no day takes the last day known before it).
- Polish: with an autosave, Continue comes first and is the primary button;
  Wait is a plain button (a paid turn too); a failed turn's notice has **Try
  again** (the line again, without touching anything new typed in the box)
  and **Open Settings** when it names Settings (the key field takes the
  focus); the Character tab drops its Reputation row when the Standing list
  has the town; Random character over a started form asks (Keep mine is the
  default); choice cards line up at the top; the Wait until… list has a
  heading; five panel tabs (Debug on) fit at 375; the theme switch sits
  above the setting text; Send shows Stop whenever the turn can be stopped
  (`Pipeline.canStop`, when the engine has it) unless a typed line can be
  queued.
- Docs check: "Hurt, until day N" uses `State.isHurt(n)` when the engine has
  it, else `hurtUntilDay > day` (as `State.laidUp`); the Re-read hint names
  the arc step.
- The demo never reads like a test harness: its narration is tagged "Mock
  narration" and the demo bar says the replies are canned (no recorded live
  scene: that needs a real API call).

### Tests changed by design
- `tests/ui-fixes.test.cjs`: the chip text, the goal placeholder, the Say
  picker without chips, the toast above the composer (not at the top), the
  phone ⋯ in the tab row and its short placeholder.
- `tests/shell.test.cjs`: the busiest scene at 375 counts the picker's
  options when more than four people are here, and picks with it.

### Needs from the engine (coded defensively)
- One line at the top of `Pipeline.submit` (and of `runTurn`), belt and
  braces for D1:
  `if (Storage.readOnly) { UI.toast(UI.READ_ONLY_NOTICE); return { ok: false, reason: 'read-only' }; }`
- `Pipeline.cancelQueued()`: clear the queued line and return its text (the
  × appears once it exists).
- `State.isHurt(n)` (the same rule as `State.laidUp`).
- `Pipeline.canStop` (already planned): Stop shows only while it is true.
- `Pipeline.recapText()` wording, below.

### Recap wording for the engine
One line each, in this order; a line with nothing in it is left out, except
Here and Open. The UI adds the heading and bolds what comes before the first
colon.

    Day 2 (Friday 9 October), morning, at Pittman's Gas and Service.
    Here: Royce Pittman, Dewayne Mangum and Jodie Strayhorn.
    Open: A debt (I owe a man in this town six hundred dollars I don't have); An enemy (Someone I wronged is already here, waiting for me).
    Owed: You owe Royce Pittman $400 · due Day 3 (2 days).
    Warm to you: Royce Pittman (friendly), Loretta Gaddis (warm, remembers you fixed the fuel pump).
    Cold to you: Boyd Teague (cold, your loose end: an enemy), Lyman Coker (wary, remembers you called him a liar).
    Heard: "The council meets Tuesday about the bridge" (Royce Pittman).
    In town: Day 2: The council voted to close the old bridge.

- Here: names joined with commas and a final "and"; Warm and Cold: people
  joined with ", ".
- A person's bracket is their attitude word, then at most one reason: for
  someone tied to a loose end, "your loose end: " and its label in lower
  case ("an enemy", "a debt"); otherwise their newest memory of weight 2 or
  more in your words after "remembers " (the player's name becomes "you";
  "me" becomes "him", "her" or "them" by their pronouns), and only when it
  fits the side it is on (never "Warm … remembers you insulted him"). No
  memory in quotes, and never the raw "Loose end with …" form.

## Integration (wave 2)

- The read-only toast is shown once per refused action: the UI's guards
  return before the Pipeline is called, and the Pipeline's guards return
  before calling each other (`tests/integration.test.cjs` counts them).
- Stop shows during "Updating the town…" with the box empty and keeps the
  narration (checked through the button, not only `Pipeline.abort`).
- The Journal keeps a missed obligation that is still owed
  (`State.obligations('owed')`) with the open ones: "missed Day N, still
  owed", with what is paid so far; "Settled late" once it is made good.
- The expanded map scrolls a place reached with Tab into view (on a phone
  it pans sideways, and an SVG mark is not scrolled to on focus).

## Wave 3 (the round-2 visual, mobile and accessibility QA)

Region as before: CSS, HTML, Storage, UI, App. All eleven defects of the
round-2 UI report, its three partly-fixed items, the UI rows of its copy
table, the ⋯ trade-off, and two items from the round-2 playtest (N3, N15).
Tests: 12 new ones in `tests/ui-fixes.test.cjs` ("wave 3, …"); screenshots
only with `UI_SHOTS` set.

### Focus that is never dropped (defects 1 and 2)
- One rule for a turn started from a control other than the box (the ⋯
  list, Wait until…, the Undo link, Go there, the map's "Go to" chip): the
  control keeps the focus while the turn runs; if it has to go, the focus
  moves first to what stands in for it: the ⋯ button (or Menu) when the
  list closes, the place's marker when the chip goes, Expand map when the
  expanded map closes, the sheet's opener (else its tab-bar button) when a
  phone's sheet closes, the panel's tab when a redraw takes the control
  away. When the turn ends the focus goes to the box on a laptop and back
  to the opener, or the first stand-in still on screen, on a phone, but
  only if it is still where the turn left it (`holdTurnFocus`,
  `carryTurnFocus` / `moveFocus`, `releaseTurnFocus`).
- No control is disabled in place while it has the focus: `setOff` marks
  the focused one `aria-disabled` (dimmed, still focusable; its handler
  refuses through `canAct`) and disables the rest. That covers Send / Wait /
  Stop, Go there and the chip. Edit, Save and a pronoun chip that are on
  when a turn starts hand the focus to their card's head (Save: to Cancel)
  before they turn off, so `disabled` stays true for them.
- The Undo link keeps the focus while the turn it started runs (it stays
  where it is, marked off); when it has to go, the focus goes to the box (a
  phone: Send) first.
- Send and Wait put the focus back in the box after the turn only if it is
  still on the box, the button or nowhere (`focusStillOnComposer`): typing
  into the People search during a turn is never split with the box.
- Also never left on the page: Dismiss on the banner (the screen's own
  place: the box on a laptop's game), the demo bar's ×, the tip's ×, Play
  here instead, a failed turn's Try again row removed by the next turn, a
  Saves slot redrawn after Save here or Delete (the same button, else the
  first in its row, else the heading), a dialog whose opener went meanwhile,
  and Recap from the ⋯ list.

### Banner and modals (defect 3)
- The warning banner sits at z-index 30, under the phone sheet (40), the
  expanded map (55) and a dialog (the top layer), and `syncBanner` makes it
  inert while any of them is open (called from `setInert`,
  `syncMapModal` and `ask`); closed, it is as it was. A phone no longer has
  to Dismiss the banner to reach Close map or the sheet's ×.

### The live region (defect 4)
- `setBusy` no longer sets `aria-busy` on the story's `role=log`: the
  streaming narration node is `aria-hidden` until `endNarration` puts the
  finished text in, which is what is read out.
- The Undo link is one button, `#undo-btn` in `#undo-row`, after the feed
  and outside the live region, so it is not announced again with every
  turn. `placeUndo` lays it over the newest input line's right edge (as
  before: its bottom 9px under the line), again whenever the feed or its
  scroller changes size (a `ResizeObserver`).

### Layout and contrast (defects 5, 7, 8, 9, 10)
- A queued line: the status text never wraps (one line, ellipsis); "Next:
  “…”" is a 32px pill with a 16px radius; its × is a 44px target that hangs
  6px over the pill into the row's margins, so the status line is 32px (was
  48) and the × overlaps no other control.
- The laptop's Panel toggle, pressed: a `--field` edge (3:1) and a 3px
  `--accent` bar under the label, on `--surface-2`.
- A read-only tab's box: `--surface-2`, `--muted` text and a dashed
  `--field` edge, no opacity (text and placeholder 4.5:1 or more).
- The expanded map (`expandedSize`) fills the view below its bar on both
  axes: a phone covers it (upright it fills the height and pans sideways;
  on its side it fills the width and pans up and down; 740x375 is 740 by
  617, was 1184 by 987); a laptop fits the whole town (never smaller than
  1.6 times the panel's map) and the viewBox grows to the window, with land
  to the edges and the river and the roads that end on the town's frame
  running on past it (`runOn`). After a resize or a turn of the phone it
  is drawn for the new view and centred on the player again.
- A person's dot on the map has a ring in `--map-ink` (3:1 or more on the
  land in both themes); so does the legend's "Someone you know" swatch.
  The phone sheet's grip is `--field` (3:1 on the sheet).

### Smaller fixes
- Defect 6: `placeTypeLabel(type)`, one map for the line under the place
  here and each place's row: Gas station, Trailer park, Big house, Town
  hall (the town's police sit in it), Pawn shop, Care home, Farmland, Boat
  landing and so on; an id not listed reads as itself, spaced.
- Defect 11: `App.editPerson` and `App.setPronouns` start with
  `UI.canAct({ say: true })`: refused (one toast) in a read-only tab, while
  a turn runs, or without a game on screen; reasons `read-only`, `busy`,
  `no game`.
- The ⋯ trade-off: on a phone with the keyboard up (the tab row hidden),
  the ⋯ comes back beside the Do / Say toggle, as on a laptop (the box is
  still about 160px wide at 375); closing its list gives the focus to a ⋯
  in view.
- N3: "Exits from here" lists only places the player knows of (a home
  nobody has mentioned is no exit yet, as on the map).
- N15: a hurt person's card says "Hurt until Day N", N the last day they
  are hurt (`hurtUntilDay − 1`), the same day as the engine's "laid up …
  until day N".
- Partly fixed before: the newer-build note under Continue is one line at
  375 ("Saved by a newer version; it may not play right here.", allowed past
  the 320px button column); the banner after loading uses the same words
  (still two lines on a phone, beside Dismiss; one on a laptop).
- Copy (UI side of the table): "Banned you from the Low Water until Day 9";
  "Last seen: …, Day 1 · Morning"; "Hurt until Day 4"; Leads "… told you,
  Day 2"; "Up to Day N"; a memory note "…, Day 3"; a save's default name
  "Tomas Reed, Day 3" and a slot's line "… · Day 2 · Morning · …";
  creation step 2 "…, money, three things (one a prepaid phone), and …";
  the review summary "Fix 4 things first: name; background and age; goal
  and flaw; three loose ends."; "One point taken from Might. Press + on the
  stat that should get it."; an exit or the chip "(closed today)" for a
  place shut on the day, "(closed)" for one shut for good; Grown "+1 Wits";
  the replace dialog "…and Saved games (Load) can bring it back."; a damaged
  autosave "(Load → Restore previous)"; Check key "That key did not work:
  the API did not accept it."; "4–5¢" kept together; the Re-read hint a
  short list; the first-run card "(canned replies)".

### Tests changed by design
- `tests/ui-fixes.test.cjs`: the Undo link is `#undo-btn` (not in
  `#feed`); "Hurt until Day N" (the last day hurt); Leads "Day 1"; Check
  key's sentence; the newer-build banner text; the review summary's form.
- `tests/shell.test.cjs`: memory notes and "Last seen" in the Day form;
  the Places panel lists every exit the player knows of (not the
  undiscovered homes).
- `tests/pipeline.test.cjs` (one assertion, for N3): "moving between
  locations" checks the exits the player knows of are listed, not every
  exit id (the motor court's exit to the Haskins Farm is a home not found
  yet).

### README lines that change
- How to play, step 3: "Try the offline demo (placeholder text)" → "(canned
  replies)".
- The map: "on a phone it fills the height and pans sideways, on a laptop it
  fits the window" → fills the screen on both axes (a phone pans the other
  way, a laptop shows the whole town with land to the edges) and centres on
  you again when the phone turns.
- Places tab: "Exits from here" lists only places you know of; types read
  as words ("Gas station").
- People: "Hurt, until day 5" → "Hurt until Day 4"; "Banned you from the
  Low Water until day 9" → "until Day 9".
- Journal: "(Loretta Gaddis told you, day 2)" → "Day 2".
- Saves: the newer-build warning reads "Saved by a newer version; it may
  not play right here."
- ⋯: "on a phone at the end of the tab row" → add "(beside the Do / Say
  toggle while you type)".

## Integration (wave 3)

- "Until Day N" is the day it ends, for a hurt as for a ban: the People
  card says "Hurt until Day N" with N = `hurtUntilDay` (about again on Day
  N), the same day as `State.absentNote` ("laid up … until day N") and as
  "Banned you from the Low Water until Day 9" (welcome again on Day 9).
  This replaces N15's last-day form above; `ui-fixes.test.cjs`' People
  and copy tests follow (changed by design).
- `/help` is styled by `.f-notice.help` (pre-line, body text colour), no
  inline style. Commands help in the ⋯ list closes the list (focus back on
  ⋯) and runs `Commands.run('/help')`; it no longer puts "/" in the box.
  The ⋯ test follows (changed by design) and still checks the "/" list's
  descriptions on two lines on a phone.

## Wave 4 (the round-3 visual, mobile and accessibility QA)

Region as before: CSS, HTML, Storage, UI, App. Defects A to H of the
round-3 UI report, its three partly-fixed round-2 items and the UI rows of
its copy table. Tests: 9 new ones in `tests/ui-fixes.test.cjs` ("wave 4,
…"), each failing on the build before; screenshots only with `UI_SHOTS`.

### Focus (defect B, and any layout change)
- The box-side ⋯ (`#act-btn`, shown on a phone only while typing) holds the
  typing layout while it or its list has the focus (`syncTyping`): Shift+Tab
  from the box, or ⋯ then Look around inside the box's 250 ms, no longer
  hides the button from under the focus, and the open list does not jump.
  Leaving the ⋯ or its list looks again (`syncTypingSoon`, as the box's blur
  does). With the keyboard down and the list closed, the focus goes first to
  the tab row's ⋯ (`#act-btn-m`, carrying a turn's hold through `moveFocus`),
  then the layout changes; `closeActions` checks this too.
- A layout change across 900px hands the focus to a stand-in when the
  control that had it is not in the new layout (`keepFocusThroughLayout`):
  Panel, Save and Settings → Menu; Menu → Panel; one ⋯ → the other; the
  sheet's × → the panel's tab; a tab-row button → its panel tab; anything
  else (a card in the laptop panel, Close map) → Send on a phone, the box on
  a laptop. `lastFocus` (focusin) covers a browser that has already dropped
  the focus by the time the media query reports; `closeSheet`, finding the
  focus nowhere as the sheet turns into the laptop panel, gives it to the
  panel's tab.

### Layout
- A: `renderPanel` sets `scrollTop` every time: 0 on a tab change, the old
  value on a redraw of the same tab (Places no longer opens scrolled away).
- C: the tip's third line (`.f-tip-where`) is said per layout and said
  again on a layout change (`syncTip`). Phone: "Type / or press ⋯ (at the
  end of the tabs, or beside Do / Say while you type) for commands. The tabs
  above the box keep track of people, places and your journal."
- D: with a line queued the stage text keeps its width ("Updating the
  town…" whole at 320, 375 and 390); the pill takes the rest (at least
  96px) and cuts its own line short (its title has it all).
- E: a phone on its side (`(max-width: 899px) and (orientation:
  landscape)`): the ⋯ list is two columns (all seven items fit above the
  box at 740x375; with the keyboard up, 740x200, it scrolls and the last
  item is in reach). Typing there, the top bar steps aside too, and the Say
  row is the picker alone, in the input row (`compactComposer`; the input
  row is `display: contents` inside a wrapping flex row): the story keeps
  137px in Do and in Say (was 84 / 34). A picker with the focus stays a
  picker until it is left (a native list may be open over it).
- F: `runOn` makes one path: "M far L" before the line (its first move a
  line to the same point) and " L far" after it, along the tangent at each
  end (measured 0.25 units in), so no seam or kink shows where the run-on
  meets the river or a road. A path that does not start with an absolute
  move, or closes, gets separate pieces that overlap its ends by 3 units.

### Words
- G: a map marker shut today is "…, closed today" (as the exits and the
  chip say it); shut for good, "…, closed".
- The Bluff reads "Bluff" (`placeLabel(l)`: a `typeLabel` on the place in
  the town's data, else a per-place word, else the type's word); the Bypass
  stays "Highway".
- H: `/help`'s first line is a heading (`.f-help-h`, as the recap's: 12px,
  600, uppercase, `--muted`, 4.5:1 in both themes; a trailing colon
  dropped); the rest is one command a line. The engine's first line is
  "Commands", then "Type / to pick one."
- Copy: the storage warnings say "Save / Load" (not "the Saves screen");
  the toast is "Offline demo off: playing with Claude."; a condition reads
  "Bruised ribs (−1 Might)", "Tired (−1 to all)" (`effectText`, render only;
  the data keeps "-1 might"); "Last seen: the Low Water, Day 1 · Morning";
  an export is `locketts-ferry-tomas-reed-day-1.json`.

### Tests changed by design
- `tests/ui-fixes.test.cjs`: the demo-off toast (two places); "Last seen:
  the …"; a condition "(−1 Might)"; the type-label test compares with
  `placeLabel` (the Bluff).
- `tests/shell.test.cjs`: "Last seen: the …".

### README lines that change
- How to play, step 2: "Mock mode off: playing with Claude" → "Offline demo
  off: playing with Claude."
- Do and Say: add that on a phone on its side, while you type, the top bar
  steps aside and the Say row is the "To: …" picker beside the box.
- Wait, ⋯ and Undo: on a phone on its side the ⋯ list is two columns.
- Character tab (optional): conditions with what each does ("−1 Might").
- Saves (optional): an export is named for the town, you and the day
  (`locketts-ferry-tomas-reed-day-3.json`).
- Commands table, `/help` (with the engine's change): "under a Commands
  heading".

## Integration (wave 4)

- The Character tab's **Grown** line shows each progression entry's own
  `gain` through `Pipeline.gainText`, as the quiet line does ("+2 max HP"
  once the stat is capped; nothing after a loose end's thread title); an
  entry saved before gains were kept reads the thread's reward as before.
- No guard on a function the file always has: the `typeof State.x` /
  `Pipeline.x` / `Api.x` checks and their "older engine" fallbacks are
  gone (isHurt, absentNote, isClosed, isBanned, obligations, weekday,
  rulesVersion, recapText, setStatusListener, cancelQueued, abort,
  submit, checkKey). The Recap item is always listed; the queued line's ×
  is always shown (its `hidden` markup and the `data-cancel="0"` rule went
  with the guard).
- `focusInput` is folded into `focusComposer(opts)`: Do, Say and a Say chip
  call it with `{ stay: true }` (the box on a laptop; on a phone the focus
  stays on the button pressed while it is there, else Send).
- `restoreAction` syncs the Send label when it fills the box; the
  Pipeline's `restoreQueued` uses it (transport.md).
- A police-type place reads "Police station"; Town Hall is "Town hall" by
  its id (`PLACE_LABELS`, as the Bluff). `ui-fixes`' type-label test
  follows (changed by design).
- The Re-read hint says "none in the offline demo", as the toast ("Offline
  demo off: playing with Claude.") and the no-key notice ("… or try the
  offline demo (Settings → Advanced).") name it.
- Agreed with the engine: `/help`'s first line is "Commands" (no colon),
  styled as the heading; `placeLabel` reads an optional `typeLabel` the
  town's content does not use yet.
- Tests: the "wave 4" tests in `tests/integration.test.cjs`.

## Wave 5 (the round-4 visual, mobile and accessibility QA)

Region as before: CSS, HTML, Storage, UI, App. Defects 1 to 9 of the
round-4 UI report, its UI-side partly-fixed items (defects 2 and 5) and the
UI rows of its copy table. Tests: 10 new ones in `tests/ui-fixes.test.cjs`
("wave 5, …"), each failing on the build before; the focus tests run with
`reducedMotion: 'no-preference'` as well as `'reduce'`; screenshots only
with `UI_SHOTS`.

### Focus (defects 1, 3, 8, 9)
- 1: narrowed past 900px, the laptop's panel is the phone's shut sheet, which
  stays drawn for its 0.26s slide down and only then hides
  (`visibility` after the slide), so whatever had the focus in it looked
  focusable for that time and was dropped after. `focusableNow` now says no
  to anything in the panel while the sheet is shut (`inShutSheet`: a phone
  layout without `sheet-open`), so the layout change hands it on at once: a
  panel tab → its button in the tab row; a card, Expand map, Close map,
  Spend → Send. `keepFocusThroughLayout` runs again once the slide is over
  (`afterSheetSlide`: the panel's `visibility` transitionend, or 400ms at
  most) and leaves alone whatever has the focus then. As `focusableNow` is
  the one test, the turn's hold (`releaseTurnFocus`), `closeSheet`,
  `closeActions` and `focusComposer` never pick something in a sheet that is
  sliding shut either, and `renderPanel` drawing that sheet keeps nothing
  there (the ⋯ in view, else Send). Phone → laptop → phone: the card keeps
  the focus in the laptop's panel, then Send; the tab row's button → the
  panel's tab and back.
- 3: the phone's Menu closes when the window widens past 900px (the media
  query's handler), and the focus on one of its items goes to the laptop's
  own button for it: Save / Load → Save, Settings → Settings, Actions and
  commands → the box-side ⋯, Title screen → Panel; on Menu itself → Panel
  (as before). `closeMenu(true)` gives it to Menu, else Panel, else the box,
  never to a Menu a laptop hides.
- 8: the menus' arrow keys follow the layout as drawn (`wireMenuKeys`, by the
  items' positions): in the ⋯ list's two columns (a phone on its side) Down
  goes down the column and on from its foot to the head of the next (Up
  back), Left and Right go across to the item in the same row, or the
  nearest; Home and End are the first and last in that order. In one column
  it is the list's order, as before; an item that is off is passed over.
- 9: the sheet's opener (where the focus goes back when it closes) is only a
  control on screen, in the tab order and outside the panel (`openerOk`):
  never the game's visually hidden heading (which the phone's game screen
  focuses, so a sheet opened by code found it), nor anything hidden. Else
  the tab row's button for the tab: Escape, and Go there (through the walk
  and after), give the focus to it.

### Layout (defects 2, 4, 5, 6, 7)
- 2: the Say picker (`#say-pick`) holds the typing layout as the box-side ⋯
  does: `syncTyping` keeps `typing` while the picker has the focus and the
  keyboard (or the iOS picker wheel in its place) is up; leaving it, the
  layout is looked at again after 250ms (`syncTypingSoon` on the Say row's
  focusout). At 740x200 the box and Send stay beside the picker and the story
  keeps 137px (was 0, with the box and Send below the window); a pick keeps
  the focus on the picker and the layout as it is.
- 4: a third line while one waits (the Pipeline keeps one): Send's title is
  "One line is already waiting. Press × to change it." as soon as one waits
  (`lineWaiting`); pressed, or Enter, the line stays in the box (it is not
  handed to the Pipeline) and the status line says the same for 2.6s,
  wrapping beside the pill (`.turn-status.nudge.has-queued`) so it is read
  whole at 320. A `busy` refusal that hands a line back says it too. Once
  the queued line has run, Send's title is "Send" again.
- 5: a phone on its side with the keyboard up: the picker beside the box is
  narrower (at most 24vw, at least 7.5em; was 30vw and 9em), so the box is
  about 300px at 740 and a sentence takes two lines, not three; the box
  takes three lines at most there, then scrolls (`autosize`, and a CSS
  max-height; four again once the keyboard is down), so the story keeps 90px
  or more whatever is typed (115px with a 52-character sentence, 91px at
  three lines; was 91px and 68px). The `/` list has one-line rows there
  again (44px; they wrapped to 56px) and may use the story's strip above it
  (`renderAc` sets its max-height from the room above, at most 320px): three
  commands whole at 740x200 (was one and three quarters).
- 6: the flags on a person card wrap (`.pcard-flag`: no `nowrap`,
  `min-width: 0`): a long grey note ("At the county school in Clayburn until
  evening") wraps inside the 320px laptop panel instead of running past it;
  a short flag still takes a line of its own whole.
- 7: someone hurt gets the Hurt flag alone: the away-for-the-day note (for
  someone hurt, the engine's "hurt and laid up … until day N") is not added
  beside it.

### Words
- The box's markup placeholder (before the first draw): "What do you do? (/
  or ⋯ for commands)".
- Settings → Advanced: "Offline demo: canned replies, no API calls".
- "Replace the autosave?": "… and Save / Load can bring it back."
- Send's title while a line waits: "One line is already waiting. Press × to
  change it."
- For the engine (not changed here): `State.absentNote`'s "until day N" →
  "until Day N", and the offline demo's "not welcome there until day 9".

### Tests changed by design
- `tests/ui-fixes.test.cjs`, the wave-3 copy test: the replace-autosave
  question ends "and Save / Load can bring it back."

### README lines that change (the docs pass)
- "the Saves screen" → "Save / Load": the `/save` and `/load` rows of the
  commands table ("no name opens Save / Load"); Saves, export and import:
  "Three named slots in Save / Load", "Save / Load lists it as 'Previous
  autosave'", "Save / Load says when you last did"; Updating an older game:
  "Save / Load marks each older slot".
- How to play, step 5: after "runs as soon as the turn is done", add "A
  third line typed while one waits stays in the box, and the line above
  says 'One line is already waiting. Press × to change it.'"
- Wait, ⋯ and Undo: "on a phone on its side the list is two columns" → add
  "(the arrow keys go down a column and across a row)".
- Do and Say (optional): on a phone on its side, while you type, the picker
  is narrow and stays beside the box while it is open.
- People (optional): someone hurt shows "Hurt until Day N" alone.

## Wave 6 (the round-5 visual, mobile and accessibility QA)

Region as before: CSS, HTML, Storage, UI, App. The eight items of the
round-5 UI report (one Low, the rest polish). Tests: 8 new ones in
`tests/ui-fixes.test.cjs` ("wave 6, item N"), each failing on the build
before (f02f7a0) and passing now; the picker test runs with
`reducedMotion: 'no-preference'` as well as `'reduce'`; screenshots only with
`UI_SHOTS`.

### Focus and the keyboard (items 1, 5, 6)
- 1: a phone on its side, the Say picker tapped with the keyboard down: on
  iOS its wheel comes up in the keyboard's place (740x375 → 740x200, 568x320
  → 568x170), and the typing layout stayed off, so the story had 0px and the
  box and Send were below the window. `syncTyping` now lets the picker bring
  that layout on, not only hold it: `onPick` is `(was || (isMobile() &&
  landMq.matches)) && …`. At 740x200 the story keeps 137px, at 568x170 107px;
  the box, Send and the picker are on screen; a pick keeps the focus and the
  layout; the wheel gone (the window tall again), the bars come back and the
  focus stays on the picker. Upright nothing changes (there is room).
- 5: the ⋯ list's two columns (a phone on its side) are filled column by
  column (`grid-auto-flow: column`, `grid-template-rows:
  repeat(var(--act-rows), auto)`; `renderActions` sets `--act-rows` to the
  heading's row and half the items, rounded up; the heading `grid-row: 1`).
  The order read (down the first column, then the second), the markup's
  order and the arrow keys' order are now one: Look around, Wait until…,
  Sleep, Recap | Undo last turn, Spend a story point, Commands help; "Wait
  until…": the three phases in the day's order, then Back. `wireMenuKeys` is
  unchanged (it already went by the items' positions, column by column);
  Left and Right still go across a row.
- 6: the compact typing row (a phone on its side, keyboard up) is drawn Do,
  Say, ⋯, the picker, the box, Send, but the Say row came first in the
  markup, so Shift+Tab from the box skipped the picker and Tab went picker,
  Do, Say… `placeSayTo` (run by `renderComposer`, which runs whenever that
  layout comes or goes) moves the Say row in the markup to where it is drawn:
  into the input row between ⋯ and the box while compact, back before the
  status line after. It is never moved into the row while it has the focus
  (the keyboard or the picker wheel is up; moving it would drop the focus and
  shut the wheel): the CSS `order` rules, kept, draw it in its place
  meanwhile, and it moves once the focus leaves it (the Say row's focusout
  draws the composer again). Out of the row it goes at once, the focus kept
  on the picker. Upright and on a laptop the markup is as written.

### Layout (items 2, 4, 7, 8)
- 2: the `/` list's description beside the command (a laptop, a phone on
  its side) takes a second line when it is too long for the row (a two-line
  clamp: `display: -webkit-box`, `-webkit-line-clamp: 2`), instead of an
  ellipsis on one: the /cheat line ("…, or set the clock") is whole at 1280
  and 740 (two lines, a 59px row). A row whose description fits is one line,
  44px, as before; upright the description is on its own line under the
  command, as many lines as it needs. With the engine's shorter description
  ("Cheat: redo the last roll, or set the clock", Commands.LIST) /cheat fits
  on one line at 1280 and 740 and takes two at 568.
- 4: `autosize()` ran before Wait turned into Send, which is 5px wider and
  narrows the box: a pasted line at a wrap point left the box one line short
  and its last word cut. Send's label is set first now (the input handler,
  `restoreAction`, `fillBox`, `completeAc`), and `syncSendLabel` sizes the box
  again itself whenever the label changes (Wait, Send and Stop differ by a few
  px; a turn ending with text in the box), while the box is drawn.
- 7: the `/` list's height was set only in `renderAc`: the keyboard up, it
  kept half the window (100px) until the next key; the keyboard down, it kept
  the strip's 136px. `sizeAc` (out of `renderAc`) also runs on every viewport
  change (`initViewport`'s update, after `--app-h`): up, the story's strip
  (136px at 740x200, three commands whole); down, half the window again
  (187px at 740x375, no height left inline).
- 8: the phone's top bar is a wrapping flex row (was a grid with a fixed
  second row): the place on a line of its own (`order: -1`; it follows the
  time in the markup, and the bar has no focusable text), then the time, HP
  and the money; what does not fit there goes on a third line, never under
  Menu. At 320 that is the money even at "$140" (it ran past its column to
  Menu's edge; "$12345" was under the word); at 375 and wider
  a bar of up to five figures stays two lines. The phone's Menu opens just
  under the bar as drawn (`openMenu` sets its `top`; it was 52px fixed).

### Words
- A save with a blank name is named as the field's default: "Tomas Reed,
  Day 1" (was "Tomas Reed, day 1"; `Storage.envelope`).
- For the engine (not changed here): the /cheat description "Cheat: redo the
  last roll, or set the clock".

### Tests changed by design
- `tests/ui-fixes.test.cjs`, wave 5, defect 5: the `/` list at 740x200 has
  44px rows except one whose description takes two lines (the /cheat row
  until the engine's shorter description lands).
- `tests/ui-fixes.test.cjs`, wave 5, defect 8: Down in the two columns
  follows the list (Look around, Wait until…, Sleep, Recap, Undo, Spend,
  Commands help); Right from Look around is Undo, Left from Spend is Wait
  until…, Up from the top and End are Commands help.

### README lines that change (the docs pass)
- Do and Say: "it stays that way while the picker is open" → add "and
  tapping the picker with the keyboard down brings it on too (on an iPhone
  the picker wheel takes the keyboard's place)".
- Wait, ⋯ and Undo: "on a phone on its side the list is two columns (the
  arrow keys go down a column and across a row)" → "on a phone on its side
  the list is two columns, read down the first and then the second (the
  arrow keys follow that order, and go across a row)".
- Saves (optional): after "or with `/save <name>`", add "A save with no name
  is named after you and the day ('Tomas Reed, Day 3')."

## Integration (wave 6)

- **The feed's order after a reload or `/undo`** (the round-5 playtest's
  R7, the UI side of engine-state.md's "Wave 6"): `UI.feed.quiet` keeps
  each line with the time the feed showed when it was printed (its last
  divider: `shownTime`; dividers carry `data-day` and `data-phase`) and
  where in its turn it came (`turnMark`: a turn's input shown, its roll,
  its narration): `at: 'start'` (before the roll and the narration: a
  reroll's "Cheat: crit", what a `/wait` or `/rest` brought), `'before'`
  (after the roll: damage, a natural 20) or `'after'`. App's
  `attachNotes` writes them against the entry they go on (`noteFor`): a
  line at the entry's own time after its narration stays a plain string,
  as before; `'start'` reads `'before'` when the entry has no roll.
  `rebuildFeed` draws, per entry: the divider of `from` (else the entry's
  time) when it is not the one shown, the input, the `'start'` lines, the
  entry's own divider (a `/wait`, a `/rest`), the roll, the `'before'`
  lines, the narration, the rest; a divider before any line whose time is
  not the one shown. The feed after Continue and after `/undo` is now the
  one played: a turn that runs into a new phase ("won't forget that"
  under the new divider), `/wait`, `/rest` ("Missed: …" before the
  morning's narration, "Overnight in town" after), "Clock set" and
  "Meanwhile in town". A reroll rebuilds the feed before it plays, so
  this also keeps the earlier turns as they were shown.
- "Meanwhile in town, Day N: …" has the news style of "Overnight in
  town" (`quietNode`), so the recap after it leaves out In town too.
- The `/cheat` row with the engine's short description: one line (44px)
  beside the command at 1280 and 740, two at 568, its own line upright;
  `/help` shows the long form.
- Tests: "integration (playtest R7)" in `tests/ui-fixes.test.cjs`; the
  "quiet lines are kept with their turn" test there follows (changed by
  design: "Clock set to Day 1 · Night." printed under the night's divider
  is kept as `{ text, day, phase }`).

## Wave 10 (31 Oct 2026): the card table

The owner: "Poker is so confusing with texts. When playing poker, there
should be a proper ui to see everything and a cheat to win." The card game
is now five-card draw the player plays at a table in the feed (the engine
side: `docs/notes/engine-world.md`, Wave 10). Tests:
`tests/wave10-cards.test.cjs`.

### The block (`UI.feed.cards`, `cardsDone`, `cardsNode`)
- One `section.f-item.f-cards` (role `group`, its label the head) under the
  player's line and before the narration, built from nodes: the head
  "Curtis Pruett's table · stake $20 · pot $40"; the dealer's side (his
  name, "Your read: Curtis is sitting on something." or "… has nothing.",
  with a marked deck "Marked deck: you can read Curtis's cards.", and his
  five cards); the player's side ("You", five cards, the hint "Pick the
  cards to hold, then Draw: the rest are replaced."); then **Draw**
  (primary) and **Fold**.
- A card is a `.card` with its rank ("10" for a ten) over its suit sign
  (♠ ♥ ♦ ♣), named for screen readers ("King of spades"; role `img` when
  shown, "Face-down card" for a back). Hearts and diamonds (`.red`) are in
  the theme's red (`--danger`: 6.3:1 on a card in Dark, 4.7:1 in
  Parchment), spades and clubs in `--text`; a back is accent stripes. The
  dealer's are face down while the hand is open, face up with a marked
  deck (the player reads the marks).
- The player's cards are toggle buttons (`aria-pressed`): a click, Space or
  Enter holds or lets go; a held card lifts a little, takes the accent edge
  and shows a "Hold" tag. They answer only while `Pipeline.handOpen`.
  Draw sends the held positions, Fold a fold (`Pipeline.playHand`).
- `cardsDone(node, record)` fills the same block with the finished table:
  both hands face up (the dealer's after his draw, or as dealt on a fold),
  each hand's name under it ("Two pair, kings and sevens"), and the result
  line ("You win $20", "You lose $20", "Split pot", "You fold: −$10",
  "Caught cheating: you lose $20") with " · cash $45" after it. Nothing is
  left to press.
- Sizes come from the story's text size: the block is 0.8 of
  `--read-size` (Small, Medium, Large), the cards a five-column grid of up
  to 4.4em each with a 5:7 shape, so five fit a row at 320 px (about 47 px
  a card at Large) with no sideways scroll; the block's padding and gaps
  narrow under 420 px. Draw and Fold are 44 px buttons.

### Focus, the box and the status line
- When the table opens, the focus goes to the first card if it was on the
  box, Send or nowhere (a field the player moved to keeps it); a phone's
  keyboard goes down with it. When the hand is over and the focus was in
  the block, it goes back to the composer (the box on a laptop, Send on a
  phone).
- A hand is part of the turn: `Pipeline.busy` stays on, so the composer
  and everything `UI.canAct` guards wait as they do while a turn runs, and
  Send is Stop. Enter in the box says "Your hand is on the table: pick the
  cards to hold, then Draw or Fold. Stop calls the hand off." (the nudge).
  The status line reads "Your hand" (stage `cards`, from the Pipeline's
  status listener).
- Stop with a hand open: the turn fails as any stopped turn does (the
  table is taken back out of the feed with its turn, the line returns to
  the box, "Stopped. Your action was kept in the box.").

### Kept and drawn again
- The log entry keeps the finished table (`entry.cards`, checked by State's
  `logCards`). `rebuildFeed` draws it after the entry's input and its
  `'start'` lines and divider, before the roll (the marked deck's catch
  roll, which the live turn prints under the table): a reload (Continue)
  and an `/undo` show it exactly where it was played.

### Words
- The `/cheat` row's long form (`/help`): "Cheat: redo the last roll
  (success, partial, fail, crit, fumble or 1-20), win your next hand at
  cards (cards), or set the clock (forward only)"; the short form in the
  `/` list is as it was. `/cheat` alone adds "/cheat cards stacks the deck
  so you win your next hand at cards."

### Tests changed by design
- `tests/wave6-fixes.test.cjs`, "QA: the /cheat row": the `/help` line
  with the cards cheat.

## Wave 11 (31 Oct 2026): the card table after QA

QA played the wave 10 table on phones and laptops in both themes. What it
found, and what the table does now (the engine side:
`docs/notes/engine-world.md`, Wave 11). Tests:
`tests/wave11-cards.test.cjs`.

### The title screen (H1)
- `App.quitToTitle` (the phone menu's Title screen, Settings' Quit to
  title) refuses while a hand is open: the game screen stays (Settings
  goes back to it), the feed says "Finish the hand first: Draw or Fold
  (Stop folds).", and nothing changes. The turn waits for the player's
  Draw or Fold, so the title screen it used to show kept Continue, New
  game and Load off until a reload.
- Any other running turn may still go to the title screen; `setBusy`
  draws the title again when the turn ends (`renderTitle`), so Continue,
  New game and Load come back with Continue naming the game as it is now.

### The table (`fillCards`, `cardsNode`, `UI.feed.cards`)
- The head (`p.cards-head`, `tabindex="-1"`, an id) names the group
  (`aria-labelledby`, no `aria-label`, so the name is not said twice) and
  takes the focus when the table opens (M7), never a card: a card with the
  focus ring looked held. `UI.feed.cards(t, { replay })` skips the focus
  and the scroll for a hand replayed by `/reroll` or after a reload.
- The table in view (`showTable`, L3): when the whole table does not fit
  the story area (320×568 at Large, a phone with the keyboard up), its head
  goes to the top of the story and the feed stops sticking to the bottom
  (so the keyboard going down does not scroll it away); else all of it is
  in view.
- A card the player holds is a button named with its state ("Eight of
  hearts, not held" / "…, held", L11); `data-held` drives the look (no
  `aria-pressed` any more). The Hold tag and the New tag are `.card-tag`,
  `max(10px, .62em)` (10px at Small, L10); the head is `max(11px, .78em)`.
- The keyboard's ring on a card (M7) is a 2px `--accent-ink` outline 1px
  out, inside a 5px `--text` halo (`box-shadow`): 8.4:1 against the Hold
  edge (`--accent`) in Dark and 6.2:1 in Parchment, where the old ring
  (`--focus`) was 1.29:1 and 1.00:1.
- Draw says how many it replaces ("Draw 5", "Draw 3", "Stand pat" with
  all five held; `syncDraw` on every toggle) and Fold what it costs ("Fold
  −$10"); the hint ends "Stop folds the hand (−$10)." (S1, S4, M1). The
  box's nudge while the hand is open (`handNudge`): "Your hand is on the
  table: pick the cards to hold, then Draw or Fold. Stop folds the hand
  (−$10)."
- The head says why the stake is what it is (M5): "Curtis Pruett's table ·
  stake $140, all you have · pot $280", "… · stake $20, the usual · …".
- The read (M3, S3): "Your read: Curtis has something." / "… is
  bluffing."; not shown with a marked deck (his cards are face up), open
  or finished. After the showdown (not a fold) it says " You were right."
  or " You were wrong." (`.cards-verdict`).
- After the showdown (S2) the cards a side drew (positions not in its
  `held`) carry a "New" tag and say ", drawn" in their names; the
  dealer's hand name is followed by " · Curtis draws 3" or " · Curtis
  stands pat" (`.cards-drew`). A fold draws nothing. A fold by Stop reads
  "Stopped, so you fold: −$10".
- Suit signs carry U+FE0E (text presentation, `Cards.sign`, L12), so a
  phone draws ♥ and ♦ in the card's colour, not as emoji.
- The marked deck's roll under the table is labelled (L9): "Does Curtis
  spot the marks? Wits 17 + 3 = 20 vs 12 · Success" (the engine writes it
  into `roll.line`, so a reload shows it the same).

### The cash (M2)
- `UI.showCash()` writes the player's cash into the top bar (`#tb-gold`)
  and the Character panel (`.char-cash`, the Cash row's value) as soon as
  the hand moves money. The turn is still running (the state notifies its
  listeners when the turn's batch closes), so nothing else is drawn again.

### Stop and the composer
- Stop with a hand open folds it (`Pipeline.abort`); the turn goes on and
  is kept, so the line is not put back in the box and the table stays,
  folded, with the plain line under it and "Stopped: a hand on the table
  is folded, and the ante is gone." After the showdown a narrator that
  fails, is stopped or declines leaves the plain line and a notice ("…
  The hand stands as it was played, told plainly above."), with no Try
  again.

### Tests changed by design
- `tests/wave10-cards.test.cjs`: the suit signs, the read's odds (60%) and
  words, a fold of $25 costs $13, the head names the group and has the
  focus, a card's name says it is not held and `data-held` replaces
  `aria-pressed`, Draw and Fold read "Draw 5" and "Fold −$10", the nudge,
  the hand's name line carries the dealer's draw, Stop folds (the turn is
  kept and Send is Wait again), and the cheat test arms and checks
  `flags.cardsCheat`.

## Wave 12 (31 Oct 2026): the card table after the second QA

The second QA pass over the wave 11 table, and what the table does now
(the engine side: `docs/notes/engine-world.md`, Wave 12). Tests:
`tests/wave12-cards.test.cjs`.

### The story after a hand (M1)
- `UI.feed.cardsDone` follows the story again once the hand is played (a
  showdown, a fold, Stop): it scrolls to the bottom and sticks
  (`scrollToBottom`), so the catch roll, the narration and the notices
  that come after are on screen with no "↓ New" pill. Wave 11's
  `showTable` stays for the open table (its head at the top of a short
  phone, or all of it in view), but it had left the feed unstuck: on a
  320×640 phone every hand, and at 390×844 with the first-run tip under
  the feed, the narration landed below the fold behind the pill.
- `UI.feed.handNotice(text)`: a notice while the hand is open (the title
  screen's refusal, `App.quitToTitle`) goes just above the table, and
  `showTable(node, lead)` puts the notice and the table's head in view
  together; nothing is appended, so no pill covers Fold. Not at an open
  table, it is a plain notice.

### Focus (L6)
- After the refusal the focus goes to the table's head (it fell to the
  page on a phone, where the menu item that had it was hidden).

### Another tab (L3)
- `Storage.setReadOnly(true)` with a hand open calls
  `Pipeline.voidHand()`: `UI.feed.cardsVoid(node)` keeps the table as
  dealt, takes off `.open`, adds `.void` (its buttons disabled and dimmed),
  puts "Another tab took over; this hand is void here." where the hint
  was, and keeps the focus on the head if it was in the table. The turn
  ends with nothing kept and no call; "Play here instead" loads the game
  as the other tab left it.

### Words
- The fold of a hand left open when the page was closed (L4): "You left
  the table, so you fold: −$10 · cash $90" (`record.closed`); Stop's stays
  "Stopped, so you fold".
- The catch roll's label (L2): "Keeping the marks from Curtis: Wits 17 + 3
  = 20 vs 12 · Success", so a success is the player's.
- The head with a stake that was no stake (L8): "stake $20, the usual:
  $0.50 is no stake" (the amount as named, to the cent, `t.named`); half
  the cash: "stake $70, half of what you have".
- A ban's day (L9): the People card ("Banned you from the Low Water until
  Day 5"), the Places card ("You are banned until Day 5.") and `/skip`
  there ("You are not welcome at the Low Water until Day 5.") name the
  first day the place is open again (`Pipeline.banBackDay`), the day the
  OUTCOME names.

### Tests changed by design
- `tests/wave11-cards.test.cjs`: the catch roll's label (M1 Stop, L9), the
  narrator-failure notice (M1), the reload's fold is `closed` (M1), the
  invitation waits while the dealer is still colder than -10 a week on and
  is told once he is warmer (M4), the head says "−$5 is no stake" (M5),
  and the demo names a dealer not met by the Say picker's label (L7).
- `tests/ui-fixes.test.cjs`: the People card's "Banned you from … until
  Day N" (wave 3, copy) and the place sheet's "You are banned until Day N."
  (Places) name the first day the place is open from the ban's end: in
  both tests that day is a Sunday the place is shut, so it is the Monday.

## Wave 13 (31 Oct 2026): two games, more seats, the Win (cheat) control

The owner asked for Texas hold'em beside five-card draw, for more than the
two of them at some tables, and for a way to win a hand without playing it
(the engine side: `docs/notes/engine-world.md`, Wave 13). Tests:
`tests/wave13-holdem.test.cjs`.

### The chooser (`fillChooser`)
- With no game named or remembered the table opens (`UI.feed.cards({
  choose })`) before any card is dealt: the head "Curtis Pruett's table ·
  stake $20" (it takes the focus, as every table's does), "Which game?",
  **Five-card draw** and **Texas hold'em** (`.cards-game`, `data-game`),
  and the hint "Stop leaves the table (nothing lost)." with the Win (cheat)
  control at its end. Choosing fills the same block with the dealt table
  (`UI.feed.cardsShow`): the focus, if it was in the block, goes to the new
  head, and the table is kept in view (`showTable`).
- Stop at the chooser calls the turn off: the block goes with the turn, the
  line comes back to the box, "Stopped. Your action was kept in the box."
- The box's nudge while it is open: "The card table is open: pick
  Five-card draw or Texas hold'em. Stop leaves the table (nothing lost)."
  The title screen waits: "Pick a game first, or Stop to leave the table
  (nothing lost)." (above the table, `handNotice`).

### The table (`fillCards`, `seatRow`)
- The head names the game once it is known: "Curtis Pruett's table ·
  Texas hold'em · stake $20 · pot $12" (at hold'em the pot as it stands,
  updated each street; at draw the stake times the seats, as before).
- One row a seat (`.cards-side`, `data-seat` the person's id or
  "player"; Curtis's `.cards-dealer`, the others `.cards-seat`, the
  player's `.cards-you`, always last): a line (`.cards-top`) with the name
  (`.cards-who`, the name only), "(deals)" for the dealer (`.cards-deals`)
  and the status cell at its right (`.cards-status`: "checks", "bets $4",
  "calls $4", "folds", what the seat last did until it acts again; after
  the hand the hand's name, "folds on the turn", and "· takes the pot" or
  "· splits the pot" for the winner, whose row has `data-won` and a bolder
  status); the read when there is one; the cards. Hold'em: two cards at the
  left of the line (a grid: cards in the first column across three rows,
  the line and the read beside them), face down until the showdown, face
  up with a marked deck or after a win cheat; a seat that folded keeps
  them face down. Draw: five under the line, as before, each seat's hand
  name and its draw ("Royce draws 2") after the showdown.
- The board (hold'em, `.cards-board`): "The board" and the street at the
  right ("Pre-flop", "The flop", "The turn", "The river", "Showdown"),
  five slots face down until turned (the open table carries only the cards
  turned so far); its group is named "The board: the flop".
- The pot line (`.cards-pot`) on an open table: "Pot $24 · you're in for
  $8" (at draw "Pot $40 · you're in for $20").
- The buttons: draw as before (Draw N, Fold −$N); hold'em the street's
  choices: **Check** (primary) and **Bet $4**, or **Call $4** (primary) and
  **Fold** (`.cards-check`, `.cards-bet`, `.cards-call`, `.cards-fold`,
  `data-act`); only Check when the stake leaves no room for a bet.
- The hint after the buttons: draw "Pick the cards to hold, then Draw: the
  rest are replaced. Stop folds the hand (−$10). Name the game in your
  words to switch (hold'em or draw)."; hold'em "Stop folds the hand (−$8).
  Name the game …" (what the player has in); then the **Win (cheat)**
  control (`.cards-win`, a small button, 32px tall, at the end of the
  line, away from the hand's own buttons). It plays `{ win: true }`.
- The box's nudge at hold'em: "Your hand is on the table: Check or Bet.
  Stop folds the hand (−$4)." ("Call or Fold" facing a bet); the title
  screen's refusal "Finish the hand first: play it out or Fold (Stop
  folds)."; draw's are as before.
- After the hand (`cardsDone`) the result line: "You win $16", "You lose
  $12", "Split pot" (or "Split pot: you win $6" when a third seat's money
  makes the split pay), "You fold: −$8", "Caught cheating: you lose $20",
  with " · cash $96". The read's verdict ("You were right.") shows after a
  showdown, not after a fold or a win cheat.
- Each street at hold'em redraws the open block (`UI.feed.cardsShow`):
  the focus, if it was on a button there, goes to the head (the buttons
  are new), and `showTable` keeps the table in view as it grows. Stop, the
  two-tab void (`cardsVoid` turns the Win control off too), the stored
  hand, the redraw from the log entry after a reload or `/undo`, and the
  replay for `/reroll` work for both games, the chooser and any street.
- Phones: at 320 and 390 wide with four seats, Small, Medium and Large
  text and both themes, neither game sticks out sideways, open or
  finished, and every button is on screen.

### Tests changed by design
- `tests/wave10-cards.test.cjs`, `tests/wave11-cards.test.cjs`,
  `tests/wave12-cards.test.cjs`: their table setup remembers draw and seats
  nobody else (`fast` sets `hooks.cardsSeats = []` after a reload too); the
  head "Curtis Pruett's table · Five-card draw · stake $20 · pot $40"; the
  hint ends "… Name the game in your words to switch (hold'em or draw).
  Win (cheat)"; the `/help` row.
