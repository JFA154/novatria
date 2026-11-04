# Known issues

What is open as of wave 51 (4 Nov 2026). Each item says what it waits on.
When one is settled, take it out here and say so in the wave's notes.

## Needs the owner's API key

- **The live grammar probe has never been run.** `ANTHROPIC_API_KEY=… node
  tests/probe-grammar.cjs` sends the bookkeeper's `record_changes` (34
  properties, 3 enums, with its 11-field core) and the parser's
  `parse_action` (14 fields) to the Standard and Thrifty models, with the
  41-property control from before wave 28. Waves 28 to 51 shipped on a schema
  that has never been sent to the live API.
- **The labelled eval has never run live.** `ANTHROPIC_API_KEY=… node
  tests/eval-classify.cjs` (`--record` appends the result to
  `docs/notes/prompts.md`). The set is 216 authored starter rows played in
  mock mode, not live turns; no passing report has been recorded, so the
  pass bar has never been met on record. B3 tuning (below) waits on it. A run
  is about $0.15 on Haiku, above the design's "under $0.10".
- **The rest of the live checklist** in
  [MAINTAINING.md, "Verified against the live API"](MAINTAINING.md#verified-against-the-live-api):
  the 1-hour cache on the narrator's blocks and (since wave 41) on the
  parser's and bookkeeper's system prompts; Check key from `file://`; the
  newer narrator packets; the bookkeeper and money in Say mode; how often the
  name check rewrites; whether the page can read `retry-after` across
  origins; the 404 model suggestion; what a turn really costs.

## Needs the owner's decision

- **A licence.** There is no LICENSE file, so the code is all rights
  reserved by default. Not chosen on the owner's behalf. (The inline
  Literata font is under the SIL Open Font License, its notice in the page.)
- **GitHub Pages on or off.** The README says "If GitHub Pages is on for
  this repository, the game is at https://jfa154.github.io/novatria/"; the
  sandbox could not reach github.io, so this is unverified.
- **The twelve relationship decisions** of
  [RELATIONSHIPS_PLAN.md §10](RELATIONSHIPS_PLAN.md): 1 to 5, 7, 8, 10 and 12
  are implemented as recommended and await sign-off; 6 (the eval's bar) is
  coded but never ratified; 9 was decided differently by the owner in wave
  34; 11 was done in wave 40.
- **The CSP hash option.** `node tools/build.cjs --csp-hash` replaces
  `script-src 'unsafe-inline'` with the hashes of the two inline scripts. It
  is off because any hand edit to `index.html` would then be blocked by the
  page's own CSP. Turning it on means building with it and changing both CI
  steps to `--check --csp-hash`.
- **A minor at fear 40 asked for the night** takes blackmailed and crossed on
  top of the minor rule's row (wave 38 finding). The minor row already holds;
  whether the extra rows should stack is the owner's call.

## For B3 tuning (the relationship numbers; waits on the live eval)

Findings of the wave 38 simulator (`node tests/relationships-sim.cjs`):

- A dense courtship opens the night on Day 12 (spark 51, romance 42, trust
  40, knows 100); a lighter one never does (trust peaks at 14).
- Trust is the bottleneck, and `kept_word` (+15) its only big source; knows
  reaches 100 by Day 9.
- Romance fades 58 → 44 over a week with no contact, while spark barely
  moves.
- A second successful romantic roll in the same phase earns half.
- Two threats take fear 0 → 25 → 63 in a day.
- With the parser flag only, a flirt at a minor is the light row (noted,
  liking -3) while confidences still warm her.
- A minor at fear 40 asked for the night also takes blackmailed and crossed
  on top of the minor row (also under decisions above).
- The default `canRaise` of $100 binds almost everyone, so a secret's weight
  barely matters; Curtis's `canRaise` 200 is unusable (he has no
  `leverageKeys`).
- Jolene pays $300 despite pride +1 (`leverageAnswer` has no pride row, per
  the plan's §19.4).
- Repeat demands cost liking 15, 23, 34; hard Loretta plants a report on
  every demand (7).
- By Day 21 Jolene, Hollis and Colt are arrested through holders' reports
  though the player told the police nothing.
- A held weight-1 record only adds fear 10 to romance.
- The blackmailer takes $1,700 from 13 payers by Day 8, against the plan's
  "about $900" cap (pending B3).

## Known rough edges

- **The top bar at 375 px** can wrap to a third line late in a game (day 10
  or later, in the afternoon, with four-figure money); nothing overflows
  (wave 43).
- **Police checks still differ** (wave 47): `isPoliceNpc` is one helper for
  Rel and World, but World's `chiefOf` reads the tag or police/officer, Rel
  near `policeHead` adds trooper, Cards' hard tags include bouncer, and
  validate-town has its own `law()`. The escape regex is still inline in
  about a dozen places.
- **The `.card` rule** (the playing card's) also styled the key card; wave 44
  undid it there with `.card.mode-key`, but `#summary-card.card.summary` may
  be affected too and is unchecked.
- **`Pipeline.updateGame`'s "changed" check** counts a paid re-read that
  changes nothing as changed, since the cost is now in the state (wave 43),
  so it keeps an /undo step.
- **Two tabs at once** (wave 48): between another tab's write and the storage
  event reaching this one, both tabs can write the per-step undo stores;
  nothing locks them. Once the event arrives this tab goes read only and
  forgets what it knew of the stores (`Storage.setReadOnly`), so its next
  write after "Play here instead" is a full rewrite. A narrow window, not
  seen in a test.
- **The mock's night check** matches "night" anywhere in the line (wave 39
  note), so a line that only mentions the night can read as asking for one
  in the offline demo.
- **The Settings hint** under Advanced says "The chronicle sums up every ten
  turns"; the code waits for 16 turns and keeps the newest 6
  (`CHRONICLE_AT`, `CHRONICLE_KEEP`). The hint is in `src/20-markup.html`.
- **CAST.md's header** (written by `tests/cast-doc.cjs`) says 'see "The
  cast" in README.md'; since wave 51 that section is in docs/MANUAL.md (the
  README links to it).
- **Test comments**: `tests/relationships-sim.cjs`'s header calls the
  eight-day cut "the CI guard" (the nightly workflow runs all 21 days), and
  `tests/ui-fixes.test.cjs` says "nothing written in CI" though CI sets
  `UI_SHOTS` since wave 36.
- **The eval's cost** is about $0.15 a run, above the design's $0.10.
- **No service worker**, on purpose: without versioned builds it would risk
  serving a stale game. Add to Home Screen works without one.

## Deliberately deferred refactors

- **Breaking up `State.applyDiff`** (about 1,437 lines). Its steps are
  order-coupled (what one writes the next reads), so a split needs its own
  wave and tests that pin the order.
- **Moving the card table out of `Pipeline`** into `Cards` or its own
  module.
- **Regrouping the wave-named test files by feature** (`wave10-cards` and
  the rest). The feature-to-suite table in
  [MAINTAINING.md](MAINTAINING.md#running-the-tests) maps them meanwhile.
