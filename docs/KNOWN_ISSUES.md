# Known issues

What is open as of wave 53 (4 Nov 2026). Each item says what it waits on.
When one is settled, take it out here and say so in the wave's notes.

## Needs the owner's API key

- **The grammar probe passed on 4 Nov 2026** (wave 52; the record is in
  [MAINTAINING.md, "Verified against the live API"](MAINTAINING.md#verified-against-the-live-api)).
  Nothing is open here.
- **The labelled eval's bookkeeper is near the bar (wave 53, 4 Nov 2026)**:
  at high effort, the Standard bookkeeper (Sonnet 5.5) names 94.2% of its
  social events exactly, invents 5.8% (bar 5%), misses 8.7% of the
  expected labels and sends none for a minor; the Thrifty one (Haiku 5.5)
  93.0% exact, 7.0% invented, 15.7% missed, none for a minor. Both
  records are in `docs/notes/prompts.md` with the before and after table
  (it was 13% to 60% exact). What is left is a handful of readings a
  person could defend (the one stood up to given crossed or insulted, an
  identity owned up to read as a confidence, the listener of a passed-on
  confidence given exposed, a theft found out left unsent). Romantic
  recall for lines aimed at minors is 97.6% on Sonnet's parser (one line
  of 42 missed by both signals, the ambiguous "wasted on this register";
  bar 98%) and 100% on Haiku's, which still reads 3 of 17 false friends as
  a flirt (a bare flag: the light row only). The set is still the 216
  authored rows: measure again on live exports before B3 tuning (the
  rubric was tuned against this set; its examples are new scenes, not the
  set's).
- **Still unverified live**: `retry-after` on a 429 (none happened); the
  chronicle call; the council meeting as a due event; an arrest; a flirt that
  reaches a charm roll.

## Found live on 4 Nov 2026 (wave 52)

- **The narrator invents unnamed extras and gives them ties to the cast.**
  At the motor court it added "a thin girl in a motel smock" who said "Tyler's
  my cousin … he's asleep at our trailer", and two card players. The name
  check only catches named people, so unnamed extras with invented relations
  pass. A style rule ("extras have no names and no ties to anyone in the
  cast") would close it; it is not added yet because a prompt change should
  be measured.
- **False friends to a minor read as romantic by the parser**: "Thanks, hon.
  Keep the change.", "Tell your daddy I said hey, sugar.", "Honey, that's the
  best coffee on the river." and "I smile at Kaylee and pay for the gas." (4
  of 17 in the eval). A bare flag gives only the light row (liking -3, a
  weight-1 memory), so the cost of a false positive is small, but it is
  there; two of 42 romantic lines aimed at minors were missed by both
  signals.
- **Kaylee was not at the register on a weekday afternoon** although
  `npcIdsBySchedule.afternoon` lists her (the game keeps school hours; the
  minor check had to use the evening). Confirm the schedule is meant that
  way.
- **The parser targets absent people** ("I ask the clerk…" at the motor court
  by day gave `npc_tyler`, the night clerk, as the target); the narrator
  handled it ("no clerk till tonight"), so no harm, but a target not present
  could be filtered before the roll.

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
