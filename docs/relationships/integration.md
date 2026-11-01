# People who remember: integration plan, v2

This is the engineering plan for the design in `design.md` (this folder), against `/home/user/novatria` at `56e69f5` (1 Nov 2026). It also answers the implementation findings in `review.md` part one (findings 8 and 10, and required change 8), and its §19 carries the items from `review.md` part two (the delta review). The front page is `docs/RELATIONSHIPS_PLAN.md`; where the two disagree, the front page wins.

Version names in this document: "design-v2" is the design's second version (spark, leverage and the minor guard added); "design-v3" is its third, which is the `design.md` in this folder; "redteam.md" and "redteam-v2.md" are parts one and two of `review.md`. Section numbers are the same across the design's versions.

- **Line references** are `index.html:LINE` unless a file is named. They match `audit.md`.
- **Read-only.** Nothing in the repo was changed while this was written.
- **Measurements** come from scratch scripts that read `index.html` and the draft texts (the rewritten example turns and the 22 glosses), using the estimator `tests/api.test.cjs` uses (words × 1.4). They are not kept; rerun them against the real text when the wave is built.
- **This plan replaces the first integration plan**, which was written against the design's first version and is not kept.

---

## Changes from v1

### What v2 forced

| Area | v1 plan | v2 plan | Why |
|---|---|---|---|
| Tracks | five (w, t, f, k, owed) | **six: spark `s` 0..100 added in A1** (always 0 until eligibility content exists), with derived spark statuses | design-v2 §2.5, owner change 1-2 |
| Leverage | none | **a per-pair record `state.leverage`, plus `state.known.secrets`** (the first persistent record that the player has seen a secret), six events, the blackmail-obligation link in `State.settle`, a new obligation status `lapsed`, the parser's `lev_` ids, the police bar | design-v2 §2.6 |
| Minor guard | an under-18 rule on the bookkeeper's `flirted` only | **decided before narration** by a new `parse_action.romantic` flag (13 → 14 properties); per-turn narrator lines; overrides after narration; guardians via relation labels; reports and reputation outside the cap; refused writes at every writer; a permanent `tests/relationships.test.cjs` | design-v2 §2.7, red team F2 |
| Event split | the bookkeeper sends 31 words; the engine converts ~25 write paths | **41 events: 22 engine-derived** (rolls, money, presence, the parse, obligations, state); **the bookkeeper sends 22 words in A** (24 in B); duplicates removed **by class**; **legacy fields yield to engine events** | design-v2 §3.1, F3/F9 |
| Wire parser | a strict regex | **a token-consuming tolerant parser**: aliases plus a unique 5-letter stem, optional colon, about-id inferred from a cast name, spurious about-ids ignored, the heaviest kept at the caps | design-v2 §3.6 |
| Preconditions | 11 model rules | **a precondition table that code checks**, reading a new per-person ask log `rel.asks` (deceive, steal and search attempts aimed at them) | design-v2 §3.2 |
| Traits | 10 knobs | **four signed axes `p g n r` plus a `mercenary` flag**; opposites cancel | design-v2 §3.4 |
| Decay | 5 classes; trust at half speed; fear clocks per event | **4 classes, one fear clock (half-life 4 days, floor 0), trust at the same speed**; witness and secondhand copies one class lighter with floor 0, merged per scene | design-v2 §3.5 |
| Bounds | the trust cap `20 + k` | **the trust cap dropped**; everyday ±15; `spent_time` and gifts diminish across days; the devoted row needs trust > 0; a fixed eviction order with `noted` protected; 5 points of band hysteresis; every event gives knows +2 or more | design-v2 §6.1-6.2, F6 |
| Fear | TIMID/HARD knobs | hard people (nerve ≥ 1, `tough`, faction heads) **capped at 39**; the override only when liking is in [-60, 25); **protectors** from content with defaults from relations; "nobody" turns a report into a grudge | F7, Appendix F |
| Settling | locks after the first | **combines** as `1 − (1−a)(1−b)`, at most two plus getting even; each settlement is turn-stamped | F15 |
| Hearsay (B) | schedules, plus hop 2 | **by kind of tie** (spouse and household overnight; other family, boss and employee next morning; friends at co-location or within 2 days); **household = shared home AND a family relation** (not `household()` at 21676); **hop 2 dropped**; one collapsed overnight line | F8 |
| Factions | the loyalty blend | **dropped**; faction reputation stays as today; **town reputation from a per-event `rep` on public events** (A2) | design-v2 §2.8, §4.6 |
| Council | trust branches plus an optional fear branch | **trust branches only; the fear branch is out** | design-v2 §9 |
| Narrator | `toward you:` | **`to you:`** (v2's word); cues describe present demeanour only; a 50-token cap per person with a fixed trim order; hidden-tie reasons carry **no cause and no name**; `open to a flirt`; per-turn `LEVERAGE` and flirt-answer lines | design-v2 §8, F1, F11 |
| Cached budget | +142 measured | **+300 measured for the full v2 rewrite; +250 with the trimmed format note** (12,921 of 13,000) | §10.4 |
| Rng | not addressed | **`Rng.create` sub-streams keyed by (seed, kind, npcId, day)** for every new relationship draw; **the d20 is burned** when compliance or a backed ask skips a roll | red team F10, §11.4 |
| `/rewind` | memories, owed, hearsay and tie log | **turn stamps on everything**: settlements, owed, hearsay, tie log, leverage `since` and `uses`, `known.secrets`, `rel.asks`, the dated parts of `rel.today` | F10, §3.3 |
| Migration | words and act typing | **a pre-pass that recognises the engine's own strings** (frozen from `56e69f5`), **trust seeded from the old attitude**, a floor that keeps any secret the old 50-gate had open, informant loose ends turned into leverage records; the Haiku re-read stays an owner option | F10, §13 |
| Tooling | the grammar probe | adds **executable worked examples** (13, by wave), **a 21-day simulator** and **a labelled-eval script**, plus a debug export that feeds the eval | Appendix D |
| Waves | A in 4 waves, B in 3 | **A in 5**: core, engine events, wire with the minor guard, what people hold (spark, leverage, favours), what people show. **B in 3.** | §16 |
| Size | ~1,750 code lines for A | **~3,810 code lines for A, plus ~680 of tooling** (after the delta review); about 100 existing tests edited | §16, §19.9 |
| Delta review (design v3) | — | **coercion is never rewarded; `intimate` in tier A with fade to black; the minor line whenever a minor is present, heavy consequences only with corroboration; stricter leverage, `kept_word` and `caught_you_at`; spark caring without the flirts** | **§19 (it wins over earlier text)** |

### What stayed

- The pure `Rel` module between State and Town.
- `n.attitude` as the stored alias of liking.
- `attitudeDelta` landing in everyday.
- The legacy `RECORD_KEYS` path.
- `relWrite` inside each op.
- `/undo` by snapshot.
- One probe-gated wave. The `romantic` flag and the wire ship together in A3, so one probe run covers both schema changes.
- Content names `liking`, `trust`, `fear`, `knows`.
- The editor's offsets go in `fix`, not `start`; the reason is in §2.6. That meets the design's requirement that edited values do not drift.

---

## 0. Decisions in one screen

| # | Decision | Where |
|---|---|---|
| 1 | A new module, **`Rel`**, goes between State and Town (after 12168). It is pure functions plus tables, and it never writes. State's ops call it and write what it returns. | §1 |
| 2 | **Six tracks under `n.rel`** (`w t f k s` plus owed). **`n.attitude` is the stored alias of liking.** | §1.4, §2 |
| 3 | Liking = `start + Σ remaining(memories) + everyday (±15) + fix`. Fear adds a derived leverage part, and hard people are capped at 39. Spark is 0 for minors and for anyone not eligible. | §3 |
| 4 | **22 events are engine-derived.** The bookkeeper sends 22 words in A, through a tolerant parser. Duplicates are removed by class, and **legacy `attitudeChanges`/`newMemories` yield to an engine event for the same person**. | §4, §5 |
| 5 | **The minor guard is in code, before narration**, in A3. It is a permanent test (`tests/relationships.test.cjs`), with spark writes refused at every writer from A1. | §6 |
| 6 | **Leverage is a record**, linked to `obl_blackmail_<npcId>` inside `State.settle`. **`state.known.secrets`** persists each secret the narrator was given. | §8 |
| 7 | **Every new relationship draw uses an `Rng.create` sub-stream**, and the d20 is burned when a roll is skipped, so seeded tests and clocks do not shift. | §11.4 |
| 8 | `record_changes` goes from 41/4 to **34/3**, core from 13/18 to **11/11**, and `parse_action` from 13 to **14**. The live probe covers all three, and **only A3 waits on it**. | §5.2, §5.9 |
| 9 | Old saves get `rel` at load (liking exact). **Rules version 9** types memories (with the own-string pre-pass), seeds trust, and builds leverage from informant loose ends. **Version 10** seeds ties. Neither makes an API call. | §13 |

---

## 1. Architecture

### 1.1 Placement

`Rel` sits after State closes (about 12168) and before Town (12169).

- State, Dice (6704), Town, World, Api, Pipeline and UI reference `Rel` only at call time, so there is no temporal-dead-zone issue.
- Add `Rel` to `window.Game` (29275).
- Add a BUILD_PLAN module row (307-323): `| Rel | how people feel about the player (liking, trust, fear, knows-you, spark, owed), leverage, the event table, trait axes, decay, stance, cue and reasons, the minor rule; tier B ties and hearsay plans. Pure: State's ops write what it returns |`.

### 1.2 Public API

| Function | Returns | Callers |
|---|---|---|
| `Rel.tracksOf(n)` | `{ w, t, f, k, s, owed }`. `w` comes from `n.attitude`. A record with no `rel` reads `{ w: attitude, t: startOf.t, f: 0, k: metTurn ? 10 : 0, s: 0 }`. | every gate, UI, packets |
| `Rel.startOf(n, townNpc?)` | `{ w: attitude, t: 5·g − 10·[police\|smuggler] (or start.trust), f: start.fear\|0, k: 0, s: 0 }`. A loose-end person gets `k: 30`, and their `LOOSE_END_ATTITUDE`/`LOOSE_END_TRUST` folded in (§4.6). | Town.instantiate, `resolveLooseEnd`, the load fill, Upgrade 9 |
| `Rel.axesOf(n)` | `{ p, g, n, r, mercenary, hard }`. Content `n.axes` overrides; otherwise the sum of `TRAIT_AXES` over `n.personality`, clamped to ±2. `hard` = nerve ≥ 1, the `tough` tag, or `Rel.isFactionHead(n)`. | applyEvent, decay, gates |
| `Rel.isMinor(n)` | true when the minimum of `castTown()` age, `State.town` age and current `n.age` is under 18, or `n.tags` has `teen`/`teenager`. Editing age can make someone a minor, never an adult. | everywhere spark, flirting, fear compliance or leverage asks are decided |
| `Rel.playerMinor()` | `player.age < 18` (AGE_MIN is 16, 11572) | the romance decision, packets |
| `Rel.eligible(n)` | not a minor, the player not a minor, and on `town.romance` (`Rel.romanceOf`: `State.town.romance`, falling back to `castTown().romance` for the built-in town) | spark writes, statuses, the flirt welcome |
| `Rel.recompute(n, day)` | the new cache (§3.1) | State `relWrite` only |
| `Rel.stance(n)` | `{ phrase, tags[], side, cell, override, why }`, with hysteresis from `n.rel.bands` | UI, recap, packets, feed |
| `Rel.sparkStatus(n)` | `null \| 'has noticed you' \| 'wants you' \| 'using you' \| 'sweet on you' \| 'falling for you'`. It returns null **before reading any number** for a minor, an under-18 player or anyone not eligible. | tags, cue, feed, card |
| `Rel.cue(n)` | the present-demeanour clause, ≤ 12 words | narrator |
| `Rel.reasons(n, max = 2, { for })` | dated reasons (§10.5) | card, recap, narrator |
| `Rel.heldTo(n)` | ≤ 2 `noted` lines, loose-end lines, facts | narrator |
| `Rel.applyEvent(s, n, ev, ctx)` | the plan: `{ d, memory\|merge\|replace, everyday, settle[], owed, leverage, witnesses[], guardians[], reports[], rep, hearsay[] (B), lines[] }` | State's `socialEvent`/`socialEvents` handlers only |
| `Rel.romanceTurn(ctx)` | `{ targets: [{ npcId, minor, welcome, line }], playerMinor }` before narration | Pipeline step 4 |
| `Rel.leverageAnswer(rec, n, ask)` | `{ answer: 'pays'\|'refuses'\|'violence', amount, line }` at resolve | Pipeline.resolve |
| `Rel.protectorOf(n, ctx)` | `[npcIds]` or `'nobody'`. Content first, then relation defaults (a minor's parents or grandparents plus the police head; else a boss; else the police head). The police are skipped while the player holds aware leverage over `n`, unless `n` is hard. | report seeds |
| `Rel.guardiansOf(n)` | the parents and grandparents in town, from `n.relations` labels both ways (`tiesOf`, 8673) | the minor guard |
| `Rel.rollMod(n, actionType)` / `Rel.difficultyFloor(n, action)` / `Rel.complies(n, action)` | as §9.3 | Dice.modifiersFor, Pipeline.normaliseParse/resolve |
| `Rel.gate(name, n, ctx)` | bool, from `GATES` | Dice, `restQuality`, Pipeline, World, Cards |
| `Rel.meets(n, need)` | bool: `{ liking?, trust?, fear?, knows? }` "at least", and `below`. **Spark is never readable** by conditions. | conditionsMet, template `needs` |
| `Rel.typeMemory(m)` / `Rel.kindOf(m)` | the legacy typing; the grudge kind | legacy writers, the migration, World |
| `Rel.rng(kind, npcId, day, n = 0)` | `Rng.create(fnv1a32(`${seed}\|${kind}\|${npcId}\|${day}\|${n}`) \|\| 1)` | every new relationship draw (§11.4) |
| `Rel.words(track, v)` | the card word | UI |
| `Rel.debugLine(n)` / `Rel.debugMemory(m)` | Debug strings | UI debug |
| B: `Rel.propagate`, `Rel.tickHearsay` | one-hop plans, delivery by tie class | applyEvent, World step i |

### 1.3 Tables (`Object.freeze`, exposed as `Game.Rel.X`)

| Table | Shape / content | Source |
|---|---|---|
| `EVENTS` | 41 rows plus `card_win`, `card_loss` and `unwanted_advance`. Each row: `{ w, t, f, k, s, owed?, rep, weight (0 = no memory), decay, dedupe, src: 'E'\|'B'\|'EB', gk?, settles?, minorFlags? }` | design-v2 §3.1 |
| `WIRE_EVENTS` | the 22 B and EB words for A, with a tier flag (`badmouthed` and `vouched_for` open in B) | §3.1 |
| `ALIASES` | spelling, tense, spaces and hyphens to the canonical name (§5.1) | §3.6 |
| `DEDUPE` | `violence: [hit, shoved, beat_down]` also drops B `humiliated` and `threatened`; `threat: [threatened, threatened_to_tell, blackmailed]`; `theft: [stole_from, cheated]`; `money: [gift, bribed, paid_back, paid_silence, kept_word(E)]` also drops B `kept_word` and `did_favour`; `romance: [flirted]` also drops B `complimented` and `flirted`; `words: [humiliated]` drops B `insulted` | §3.6 |
| `TRAIT_AXES` | the 66 traits → `[p, g, n, r]` deltas (Appendix A); `FLAVOUR_TRAITS` | App. A |
| `AXIS_EFFECTS` | pride: words-bad, humiliated, shoved, blackmailed and rebuffed liking × (1 + 0.25p), settle × (1 − 0.2p), refuses demands at p ≥ 1 and fear < 40. Guardedness: start trust 5g, trust gains × (1 + 0.2g), losses × (1 − 0.15g). Nerve: fear gains × (1 − 0.25n), hard at n ≥ 1. Grudge-holding: harm half-life × 2^(−r/2), settle × (1 + 0.15r). | §3.4 |
| `MERCENARY_IDS` (content) | Hollis, Shayla, Tyler, Curtis, Leon: money liking ×2, `blackmailed` liking ×0.5, may name a price | §3.4 |
| `DECAY` | `{ mood: [2, 0], slight: [5, { harm: 0.2, kind: 0 }], wound: [10, 0.4], scar: [21, 0.6], keeps: [∞, 1] }`; `FEAR_CLOCK = [4, 0]`. **One class lighter** for witness and secondhand copies (scar → wound → slight → mood), floor 0. | §3.5 |
| `CAPS` | `turn: { w: 40, t: 45, f: 40, s: 20 }`, `graph: { w: 15, t: 15 }`, `everyday: 15`, `everydayDrift: 2`, `perPerson: 2`, `perTurn: 4`, `kMin: 2`, `kPerDayAimed: 3`, `owed: 3`, `mergeDays: 3`, `compound: [1, 1.5, 2.25]`, `kindRepeat: [1, 0.5, 0.25, 0]`, `acrossDays: { spent_time: { full: 3, after: { w: 1, k: 2 } }, gift: { full: 3, after: { w: 1 } } }`, `hardFear: 39`, `noted: 3`, `memories: 12`, `settlements: 2`, `hysteresis: 5`, `cuePerPerson: 50` (tokens). **No `trustCapBase`.** | §3.3, §6 |
| `BANDS` | liking enter values -60, -25, -6, [-5..5], 6, 25, 60; trust -25, 25; spark statuses as §2.5; every band leaves 5 points back | §2.4 |
| `STANCE_GRID` | the 12-phrase grid (design §2.4), with `side` and the cell's cue clause (design §8). Devoted × unsure reads "loyal to you" only when trust > 0, else "warm to you". | §2.4, §8 |
| `OVERRIDES` | fear ≥ 40 **and** liking in [-60, 25): "afraid of what you know" when leverage the player holds is the largest share of fear, else "afraid of you". Below -60: "hates you" plus the tag "and afraid of you". At 25 or more: the tag "wary of your temper". | §2.4 |
| `TAGS` | the order: leverage, spark, fear, debts, uneasy. The card shows 2, the narrator 1. | §2.4 |
| `SPARK_STATUS` | the design §2.5 table: when / cue / feed line | §2.5 |
| `CUES` | design §8's table, rewritten without `; ` (§10.1) | §8 |
| `WITNESS` | design §4.3's witness rows (with `shoved`) | §4.3 |
| `SECONDHAND_TEXT` | templates by event: "heard you hit {victim} at {place}", "saw you put {victim} down at {place}", "heard you shamed {victim} at {place}", and so on | §5.4 |
| `LEVERAGE_WEIGHT` | the loose-end options `[2, 2, 3]`; caught by action type (theft or lie 2, violence 3, sneak or search 1); NPC secrets from content `secretWeight` (default 2) | §2.6.3 |
| `GATES` | the thresholds of §9.3 as data | §6.2 |
| `UNWANTED_ADVANCE` | `{ w: -20, t: -20, f: 10, k: 2, s: 0, weight: 3, decay: 'wound', fearBuysNothing: true }` | §2.7 |
| B: `TIE_KINDS`, `RELATION_KINDS`, `FACTORS`, `DELIVERY` | as design §4.1-4.3 | B |

### 1.4 `n.attitude` as an alias (unchanged from v1)

- **Write.** `relWrite(n)` sets the cache and `n.attitude = n.rel.w`.
- **Read.** Readers read `n.attitude` for liking, so every existing gate, `attitudeAtLeast`, the mock, the validator and the tests keep working.
- **Outside writes.** A direct write to `n.attitude` (5 tests, or a hand-edited save) is folded into `fix.w` at the next recompute. Readers see the alias in between.
- **Lifetime.** The alias is never removed.

### 1.5 Where the design and the code conflict, and what this plan chooses

| Design-v2 says | Plan | Why |
|---|---|---|
| Content conditions `{ trust: 30, familiarity: 25 }`, `{ warmth: 15 }` | `liking`, `trust`, `fear`, `knows`. `Rel.meets` accepts `warmth` and `familiarity` as aliases; the validator wants the canonical names. | Same words as the card and README |
| `to you: <stance>[; <tag>] — <reason>; <reason> — plays it: a; b` | `; ` only between person fields; ` / ` between reasons; `, ` inside the cue | A reason that starts with a name ("…(Day 3); Royce Pittman told you (Day 4)") would split the validator's person parser (§10.4), and `; ` already separates fields |
| The editor's track edits write to `start` | they write to **`fix`**, which also never drifts | Upgrade 9 is `rerun: true` and rebuilds `start` from the town, so a re-read would wipe edits kept in `start`. The authored start also stays visible in Debug. |
| Appendix F: "`meetingRep` (a missed meeting) → `broke_word` ×0.5" | the **missed appointment** (14139) becomes `broke_word` ×0.5; **`meetingRep`** (11490, first meeting a faction member) becomes an everyday entry | The design's row mixes up two sites |
| Appendix F: `LOOSE_END_ATTITUDE` → start values; §6.1: "loose-end memories don't fade while the loose end is open" | **start values** (`rel.start`), with the protected loose-end memory left as `d: null` | Appendix F is concrete; the person was this way before the player arrived |
| `learned_secret` needs "X's secret in this turn's narrator packet" | it needs **`state.known.secrets[X]`**, written the same turn the secret enters the packet, and kept | A late background retry (22311) of that turn's bookkeeper still passes. The leak guard is the same: the secret did reach the narrator. |
| `stole_from` (E): "a steal they saw or were present for (a failed attempt counts ×0.5)" | E fires on a **failed or partial** steal with the victim present (×0.5), or a success **with a witness other than the victim** (full). A clean success is logged in `rel.asks` for a later B "found out". | A clean pickpocket that succeeded was by definition not seen |
| Town reputation moves only on public events | **A2**: per-event `rep` when ≥ 2 witnesses or news; the faction part of `driftReputation` stays | Faction reputation "stays as today" (§4.6) |
| The under-18 test calls `Relationships.status(n)` | `Game.Rel.sparkStatus(n)` | The module name |
| §3.6: "about 350 tokens" of glosses | **≈ 420 measured** (300 words), net **+164** after the removals | `glosses-v2.txt` |
| §8: "about 235 of 330" cached tokens | **300 measured** with the full note; **250 trimmed** | §10.4 |

---

## 2. State shape and ops

### 2.1 The NPC record

```js
n.attitude = 12;                                   // alias of rel.w
n.rel = {
  v: 2,
  start:    { w: 5, t: -5, f: 0, k: 0, s: 0 },
  everyday: { w: 0, t: 0, k: 0, s: 0 },            // each clamped to ±15 (k only up); w and t drift 2 a day toward 0 on days unseen
  fix:      { w: 0, t: 0, f: 0, k: 0, s: 0 },      // editor and outside writes; never fades; s forced 0 for minors
  today:    { day: 3, turn: 21, ev: { spent_time: 1, gift: 2 }, kAimed: 2 },
  days:     { spent_time: 4, gift: 3 },            // days on which each counted at full value (the across-days rule)
  recent:   [ { ev: 'spent_time', day: 3, at: 'loc_low_water', turn: 21 } ],          // ≤ 4, for "(3 nights)"
  asks:     [ { turn: 14, day: 2, act: 'deceive', ok: false, about: 'claims to be a surveyor' } ],   // ≤ 8: the precondition log
  owed:     [ { dir: 1, size: 1, key: 'm41-npc_burl', day: 2, turn: 14, why: '…' } ],
  // cache (relWrite)
  w: 12, t: -4, f: 0, k: 9, s: 0, net: 1, levFear: 0,
  bands: { w: 'friendly', t: 'unsure', s: null, f: 0 },   // the entered band (hysteresis needs the last one)
  stance: 'friendly', tags: ['owes you'], side: 'good'
};
```

- **Authored fields** (validator whitelist at 1191), all optional:
  - `start: { trust?, fear? }`
  - `axes: { p?, g?, n?, r? }` (an override)
  - `secretWeight: 1..3`, `canRaise: 0..1000`, `mattersTo: [npcIds]`, `protector: npcId | [ids] | "nobody"` (Appendix C/F)
  - `mercenary: true` (5 people)
  - **`factionLoyalty` is not added**: the blend was dropped.
- **Town-level content:**
  - `TOWN_DATA.romance: [{ npcId, open, sparkRate, opensAt: { knows }, faithful }]`, **empty by default** (Appendix E is a ready-to-paste block in `docs/notes/content.md`)
  - `TOWN_DATA.policeHead: "npc_marcus"` (optional; otherwise the first `police`-tagged person whose role matches /chief/)

### 2.2 The memory record

```js
{ turn: 41, day: 5, text: "…", weight: 3, model?: true, act?: 'talk',
  event: 'hit', d: { w: -25, t: -12, f: 20, k: 2, s: 0 } | null,   // null: moves no track (legacy, addMemory, setMemories)
  decay: 'wound', place: 'loc_pittmans', key: 'm41-npc_dewayne',
  fight: 'f40-npc_dewayne',                                       // hit/shoved memories of one fight (replaced by beat_down)
  settled: [ { turn: 44, day: 6, by: 'apologised', w: 0.5, t: 0.25, f: 0 } ],   // ≤ 2 + got_even; combined
  n: 1,                                                           // merges (harm repeats)
  witness: true | undefined, scene: 'loc_pittmans:3:morning',     // a witness copy, merged per scene
  secondhand: { src: 'm41-npc_dewayne', via: 'npc_dewayne', hidden: false } | undefined,   // B
  leverageId: 'lev_mavis_1' | undefined, about: 'npc_mavis' | undefined, seen: true }
```

- **`checkMemories`** (9983) keeps every typed field when it is well formed.
- **`shapeProblem`/`typeProblem`** (11742) accept `rel` and `d` as objects or null.
- **`coerceNumbers`** (11808) converts the `rel.*` numbers and `d.*`.

### 2.3 State-level fields

| Field | Wave | Shape | Rewind |
|---|---|---|---|
| `state.leverage` | A1 (empty), A4 | `[{ id, holder, over, about: { kind, npcId? }, text, weight, since: { day, turn, via }, aware, playerKnows, status, log: [{ turn, day, status }], demand, uses: [{ turn, day, event }], knownBy: [{ npcId, turn }], mattersTo }]` | records with `since.turn > T` are dropped; `log`, `uses` and `knownBy` entries after T are dropped; `status` = the last log entry |
| `state.known` | A1 (empty), A4 | `{ secrets: { npcId: { turn, day, how: 'roll'\|'trust'\|'fear'\|'rumour' } } }` | entries with `turn > T` are dropped |
| `state.ties` | B1 | design-v2 §4.1, every log entry with `turn` | log entries after T are dropped |
| `state.hearsay` | B1 | `[{ id, npcId, aboutId, src, event, d, factor, via: 'overnight'\|'morning'\|'meet', dueDay, duePhase, expires, turn, hidden }]`, ≤ 60 | entries after T are dropped |
| `player.obligations[].status` | A4 | gains **`lapsed`** ("can no longer be") | as today |
| `ledger` (in memory, not saved) | A1 | `rel: {}` (per-person track totals this turn), `events`, `perPerson`, `engineClasses: Map(npcId → Set(class))`, `touched: Set`, `scenes: Map` (witness merge) | resets per turn and on load |

### 2.4 Ops and fields

| Name | Kind | Fields | Validation | Result |
|---|---|---|---|---|
| **`socialEvent`** (A1) | `EFFECT_OPS` | `{ op, npcId, event, text, weight?, act?, aboutId?, private?, leverageId?, witnesses?: 'present'\|'none'\|[ids], d?, decay?, secondhand?, scale? }` | `event` in EVENTS (engine rows allowed); NPC (dead → no-op); `text` ≤ 400 after `fillEffects`; `d` values whole numbers \|≤ 50\| (`checkDelta(…, 50)`); `d.s` > 0 refused for a non-eligible person or a minor (logged); `scale` 0.1..2 | applied lines; ledger classes; witness rows |
| **`socialEvents`** | A1: `ENGINE_KEYS`; A3: moved to `RECORD_KEYS` (this flips the mock) | `[{ npcId, event, aboutId?, private?, text }]` | model: §5.3-5.5; engine: as the op | as above |
| `attitudeDelta` (kept) | EFFECT_OPS | unchanged | unchanged | `everyday.w += landed` |
| `attitudeChanges` / `newMemories` / `memoriesSettled` (legacy) | RECORD_KEYS | unchanged | unchanged, plus **yield** (§4.3) | everyday; `d: null` memories; delete an untyped match / settle a typed one |
| **`relSet`** (A1) | ENGINE_KEYS | `{ npcId, w?, t?, f?, k?, s? }` | whole numbers in range; **`s` refused for a minor, an under-18 player or a non-eligible person** | `fix` lands each track exactly |
| **`relDay`** (A1) | ENGINE_KEYS | `day` | | everyday drift, then `relWrite` for everyone |
| **`relTurn`** (A2) | ENGINE_KEYS | `{ aimed: [ids], said: [ids], present: [ids] }` | ids present | knows +1 per aimed turn (≤ 3 a day), `spent_time` once a day per person (§4.1) |
| **`relAsk`** (A2) | ENGINE_KEYS | `{ npcId, act, ok, about }` | | the `rel.asks` log |
| **`relSettle`** (A2) | ENGINE_KEYS | `{ npcId, key \| mark, by }` | | a turn-stamped settlement; a legacy match gets GOT_EVEN in everyday |
| **`owedSettle`** (A4) | EFFECT_OPS | `{ op, npcId, dir? }` | | owed entries cleared; "… is square with you." |
| **`leverageAdd`** (A4) | ENGINE_KEYS | a record (§2.3), without an id | `holder`/`over` = 'player' or an NPC, and they differ; `text` ≤ 120; weight 1..3; **a player-held record needs `known.secrets[over]` or a marked rumour heard** | `lev_<npc>_<n>` |
| **`leverageSet`** (A4) | ENGINE_KEYS, and EFFECT_OPS for templates | `{ id, status?, aware?, playerKnows?, demand?, use?, knownBy? }` | the status follows the lifecycle (held → used → paid; held, used or paid → spent or void) | log entry with `turn` |
| **`secretShown`** (A4) | ENGINE_KEYS | `[{ npcId, how }]` | NPC with a secret | `known.secrets` |
| **`relFill`** (A5) | ENGINE_KEYS | `[{ npcId, rel, memories }]` | **refused unless the recomputed liking equals `attitude`** | Upgrade 9 |
| `editPerson` (extended, A5) | ENGINE_KEYS | adds `rel: { w?, t?, f?, k?, s? }` (`s` refused for minors and the non-eligible) and `leverage: { id, delete: true }` | as relSet | §2.6 |
| B: `tiesFill`, `hearsayDeliver` (ENGINE_KEYS); `tieDelta`, `propagate` (EFFECT_OPS) | | as v1, with turns | | |

- **`State.EFFECT_OPS`** grows from 28 to 29 (A1: `socialEvent`), 31 (A4: `owedSettle`, `leverageSet`) and 33 (B2: `tieDelta`, `propagate`). The validator's `OPS` (607) gains each in the same wave. `state.test L980` keeps the two lists equal.
- **Placeholders.** `fillEffects` gains `{protector}`, `{protectorId}` (report templates) and `{leverageId}` (tell templates). The validator's placeholder list gains them.

### 2.5 `attitudeDelta`

`attitudeDelta` stays, with today's exact observable meaning. It writes `everyday.w`.

- The everyday clamp (±15) applies to everyday only; the landed value is still exact.
- If a delta would push everyday past ±15, the overflow goes to `fix.w`, so `n.attitude` still reads `before + delta`. The tests that "set to X" (41 uses) keep working.

The op-by-op conversion of the 41 sites is §4.6.

### 2.6 The editor

The order inside `editPerson` (10073-10200): validate everything, replace `memories`, `relWrite`, then land each given track in `fix`.

- **Pinning.** Memories edited without track values pin all six tracks.
- **Round-trip.** `editBase` (25129) and `editChanges` (25227) carry **every** memory field. The form edits only `text` and `weight`. This is the same fix being made separately for the `day`/`act` strip; it is **not a prerequisite**, because A5 extends whatever is there to the typed fields.
- **"Add a memory"** offers a short event picker (`noted`, `complimented`, `insulted`, `did_favour`, `they_helped`, `crossed`; the table value lands as an event with `d`), or saves the line as `noted`.
- **Interested.** The slider is rendered and accepted only for an eligible adult.
- **Leverage.** Leverage lines can be deleted (`status: 'void'` with a log entry).
- **Why `fix`, not `start`.** The design asks for `start`. `fix` gives the same "never drifts" behaviour and survives Upgrade 9 re-runs (§1.5).

### 2.7 Old saves at load (pattern 1, no version bump)

`State.load` (11865), after `fillPronouns`:

- every NPC without `rel` gets `Rel.fill(n, townNpc)`, with liking exact and `s` 0;
- `state.leverage ||= []`, `state.known ||= { secrets: {} }`;
- **any `rel.s` or `rel.*.s` on a minor or a non-eligible person is set to 0** (the import guard).

The game plays as before. Memories stay `d: null` until Upgrade 9.

---

## 3. Recompute

### 3.1 The rule

```
fade(m, track, age) =
   w,t: floor + (1 − floor) × 0.5^(age / (half × gr))     // DECAY[m.decay]; gr = 2^(−r/2) for harm, 1 for kind; witness/secondhand: one class lighter, floor 0
   f:   0.5^(age / 4)                                      // the one fear clock (TIMID/HARD act on gains, not on fading)
   s:   slight (5 days, floor 0) for flirts; scar for intimacy (C)
   k:   1
   protected memory whose loose end is open: 1
settle(m, X) = Π over m.settled of (1 − a_X)                // combined: 1 − (1−a)(1−b); at most 2 plus got_even
rem_X(m)     = m.d.X × settle(m, X) × fade(m, X, D − m.day)

w = clamp(round(start.w + Σ rem_w + everyday.w + fix.w), −100, 100)
t = clamp(round(start.t + Σ rem_t + everyday.t + fix.t), −100, 100)
f = clamp(round(start.f + Σ rem_f + fix.f + levFear), 0, hard ? 39 : 100)
    levFear = Σ over aware records the player holds over n (held/used/paid): 10 × weight × (t ≥ 40 ? 0.5 : 1) × (paid ? 0.5 : 1)
k = clamp(round(start.k + Σ m.d.k + everyday.k + fix.k), 0, 100)
s = minor or player minor or !eligible ? 0 : clamp(round(start.s + Σ rem_s + everyday.s + fix.s), 0, 100)
bands: enter at the band edge, leave 5 points back (the previous bands are read from the cache)
```

- **Ages are whole days.**
- **A memory missing `day`** uses `World.memoryDay` (13983), else `D − 7`.
- **Landing is exact** for integer deltas added to a bucket.
- **Caps are applied at event time** and stored in `d`: per turn, the hard 39, and the minor's spark.
- **No trust cap.**

### 3.2 When it runs

| Trigger | What |
|---|---|
| Inside every op that touches a person's inputs | `relWrite(n)` at once |
| Morning, step g (replaces `driftAttitudes`, 14002) | `State.apply({ relDay: day }, W)` |
| `setTime`, `rewind`, load fill | `relWrite` for everyone |

**Everyday drift** in `relDay` moves `w` and `t` 2 toward 0, except on these days:

- The person is tied by an open loose end.
- (A2 onward) the player saw them on the day just ended. This reads `state.seen[id].day` (12075); the doc comment at 7517 changes from "no model ever reads it" to "the engine reads it for everyday drift".
- (A1 only) a weight-3 memory within `DRIFT_QUIET_DAYS`, plus moving the *total* toward `start.w`. This keeps A1 exact.

`k` and `fix` never drift.

**Cost:** 12 memories × 5 tracks per person, about 66 people on a morning: microseconds.

### 3.3 `/undo` and `/rewind`

- **`/undo`** restores a snapshot (a deep copy). Everything comes back exactly.
- **`/rewind T`** (11137) drops everything stamped with a turn after T:
  - memories, as today;
  - `settled[]` entries;
  - `owed` entries;
  - `rel.asks`;
  - `rel.recent`;
  - `rel.today` when `today.turn > T` (reset);
  - leverage records, their `log`, `uses` and `knownBy`;
  - `known.secrets`;
  - hearsay;
  - tie log entries;
  - feeling, report, price and tell seeds already go with the struck turns' seeds (`seedsDropped`).

  Then `relWrite` runs for everyone.
- **What stays:** `everyday`, `fix` and `rel.days` (the across-days counters), as money does. This is documented in the README `/rewind` row and the comment at 11120.
- **Background retry:** the late diff applies while its turn is newest, so the ledger is still that turn's.

---

## 4. Engine-derived events

### 4.1 The 22, where each is emitted and in what order

| Event | Emitted by | When in the turn | Notes |
|---|---|---|---|
| `hit` / `shoved` | `Pipeline.fight` (19127) | step 5 (resolve), right after the roll | Success → `hit`; partial or failure → `shoved`. Same fight (`state.fight` turn chain): the second hit **raises the existing fight memory ×1.4** (the `fight` key) rather than adding one. |
| `beat_down` | `World.knockDown` (14376) | the third hit | **Replaces** every memory with this `fight` key ("beat me down at the Low Water"). The witness rows are merged per scene. **The weight-3 witness memories (14388-14391) are retired.** |
| `threatened` | Pipeline.resolve | an intimidate roll aimed at X | Success: as the row; failure: W -10, F +5; with ≥ 2 other witnesses W -15. |
| `threatened_to_tell` / `blackmailed` | Pipeline.resolve | a backed ask (`aboutIds` ∋ a held `lev_` id; a price in the input → `blackmailed`) | §8 |
| `stole_from` | Pipeline.resolve | a steal aimed at X or X's place with X present | §1.5 rule. A success unseen goes to `relAsk` only. |
| `gift` / `bribed` | **inside the bookkeeper's `State.apply`**, after `goldDelta`/`itemsLost` and before the model's `socialEvents` | step 9 | `opts.giftTo = ctx.giftTo` (`giftCheck`, 19055). It fires only if money or a thing actually moved this diff (`paid` / `lostNames` in applyDiff) and `giftIn` holds. `bribed` when the turn's action was persuade or deceive aimed at the same person. Repeats: same day 1/0; across days, full the first 3 days, then +1. |
| `spent_time` | `relTurn` after the bookkeeper apply (or on its own if the bookkeeper failed) | step 9 | once a day per person: Say aimed at them (`ctx.speech.to`) or a social action aimed at them; first 3 days full, then W +1, K +2; spark +2 if s ≥ 10 |
| `humiliated` | State, model rules | step 9 | a model `insulted` with ≥ 2 present witnesses besides the target is upgraded |
| `paid_back` / `kept_word` / `broke_word` | `State.settle` (9286), through the new content onMet/onMiss; appointments in World `settleAppointments` (14120) | when settled | the kept appointment fires `kept_word` (with the player present); missed → `broke_word` ×0.5 |
| `paid_silence` / `told_anyway` | `State.settle` for blackmail (code link, §8.4); templates; reports | | |
| `rescued` | Pipeline.resolve | a successful action aimed at X while X is in **danger**: the target or victim of a due event from a seed marked `danger: true` this phase, or a hurt fate this turn from someone else | content marks 3-4 seeds `danger`; without them, `rescued` never fires (documented) |
| `flirted` | `Rel.romanceTurn` decides (step 4); applied with the bookkeeper apply as an engine event | | §6, §7 |
| `cheated` | the marked deck caught (21293) | | `d: { w: -20 }` override, table trust -30 |
| `learned_secret` | `rumoursHeard` apply for a rumour with `leverageOver` | step 9 | `aware: false` |
| `caught_you_at` | the complication "{witness} catches you at it" (5309), or a failed or partial steal or sneak, or an attack, seen by X | step 5 | weight from the action type |
| `intimate` | `Rel.romanceTurn` (A4; engine-gated, §19.2) | decided before narration | the scar memory; fade to black |

**How engine events reach the bookkeeper's apply:**

- **Resolve-time events** apply in their own `State.apply` at resolve (as `complicationEffects` does, 19091). They fill `ledger.engineClasses`.
- **Turn-end events** (`gift`, `bribed`, `flirted`, `spent_time`) go in `opts.engineEvents`. `State.apply` processes them **after the money fields and before the model's `socialEvents`**, so dedupe sees them.
- **When the bookkeeper fails,** `Pipeline` applies `opts.engineEvents` minus `gift` and `bribed` (no money moved) on their own, in the failure path. The engine's facts stand, as today.

### 4.2 Dedupe by class

`ledger.engineClasses` maps each NPC to the classes the engine recorded this turn. A model event is dropped (debug line "the engine already recorded violence for npc_x this turn") when:

- its class is in the set; or
- a violence class is in the set and the model event is `humiliated` or `threatened`; or
- a money class is in the set and the model event is `kept_word` or `did_favour`; or
- a romance class is in the set and the model event is `complimented` or `flirted`; or
- `humiliated` is in the set and the model event is `insulted`.

### 4.3 Legacy fields yield to engine events (new)

The mock stays legacy until A3, and tests queue `attitudeChanges`. From A2, for any person with an engine event this turn, the legacy fields in the same diff yield:

- `attitudeChanges` whose sign matches the engine event's liking sign are dropped;
- `newMemories` for that person are dropped;
- a debug line says "the engine counted the gift (or the fight) for npc_x".

So a mock attack (-20, "attacked me" w3) on top of an engine `hit` counts once, as `hit`. A test that queues a gift's +5 with `goldDelta: -5` sees the engine `gift` +5 and nothing else. The legacy ±25 and the diminishing rules stay for whatever does not yield.

### 4.4 Witness rows

Present people other than the target get the `WITNESS` row. Exceptions: the laid up, and everyone when the event is `private` (words only).

- The row is applied as a **witness copy**: one class lighter, floor 0, text from `SECONDHAND_TEXT`.
- Copies **merge per scene** (`scene = loc:day:phase`): a second event in the same scene adds to the same copy.
- Under 2 on every track → dropped; 2-4 → everyday; 5 or more → the copy memory.
- **Jealousy** is a witness rule (A4):
  - a partner by static label (wife, husband, girlfriend, boyfriend, partner) who sees the player flirt with theirs: W -15 × (1 + 0.25p), T -10, template "flirted with {victim} in front of me";
  - someone at s ≥ 30 who sees a flirt with another: W -8, T -5, S -5.

### 4.5 Reputation from events (A2)

When an event is **public** (≥ 2 witnesses besides the target, or it made news), `reputationDelta { key: 'town', delta: row.rep }` applies, held to ±5 a turn by `ledger.rep`.

- The minor penalties (-10 / -5) go **outside** the cap.
- `World.driftReputation` (14538) keeps only the faction part (members' liking changes / 5, ±5).
- The town part goes. `ctx.reputation` (22305) stays unused.
- **The "feared" tier** in `State.reputationTier` (12116): 3 or more in-town people at fear ≥ 20. Order: despised, feared, respected, known, noticed, unknown.

### 4.6 The `attitudeDelta` conversions, site by site (41 sites; reconciled with design-v2 Appendix F)

**Content: LOOSE_ENDS obligations.**

| # | Site | Today | Becomes (A2 unless marked) |
|---|---|---|---|
| 1 | 5545 debt $400 onMiss | -15 + w3 own memory | `socialEvent broke_word`, `d: { w: -15 }` (table trust -15), weight 3, `act: 'own'`, same text |
| 2 | 5550 debt $400 onMet | +10 + w2 | `socialEvent paid_back`, `d: { w: 10 }` (table trust +10, +2 rep), weight 2, same text; settles the debt memory fully |
| 3-4 | 5563 / 5568 debt $600 | -15 / +10 | as 1-2 |
| 5-6 | 5581 / 5586 title note | -10 / +10 | as 1-2 |
| 7-8 | 5598 / 5603 card debt | -20 / +10 | as 1-2 (rep -3 public, news) |
| 9 | 5657 blackmail onMiss, Marcus | w2 + -10 | `socialEvent told_anyway` on `npc_marcus` (W -5, T -15), same text, `leverageId: '{leverageId}'` |
| 10 | 5658 blackmail onMiss, the informant | -10 + w3 own | `socialEvent broke_word` ("would not pay"), `d: { w: -10 }`, own |
| 10b | blackmail onMet (5662) | w2 memory only | adds `socialEvent paid_silence` (W +5, T +10) |
| 11-12 | 5700 / 5704 promise | -10 / +10 | `broke_word` / `kept_word`, `d.w` = today's |
| 13 | 5723 errand (letter) onMet | +15 | `kept_word`, `d: { w: 15 }` |
| 14-15 | 5737 / 5751 promises (Dale's boy; bring daughter home) | +10 | `kept_word`, `d: { w: 10 }` |

**Content: the complication.**

| # | Site | Today | Becomes |
|---|---|---|---|
| 16 | 5308 "takes it personally" | -5 | **unchanged (everyday -5)**, as Appendix F |

**Content: GRUDGE_TEMPLATES (edited in place, index-stable).**

| # | Site | Today | Becomes |
|---|---|---|---|
| 17 | 5777 [0] Marcus | -10 | `socialEvent crossed`, `secondhand: true`, `d: { w: -10, t: -10 }`, text "heard {playerName} took what wasn't theirs" (Appendix F: "crossed-class secondhand memories (A)") |
| 18 | 5808 [3] Loretta | -5 | the same, `d: { w: -5, t: -5 }` |
| 19-21 | 5852-5854 [7] Wade, Colt, Trent | -10 each | the same, `d: { w: -10, t: -10 }` |
| 22-23 | 5865-5866 [8] Ray, Nadine | -10 | the same |
| 24-26 | 5898-5900 [11] Marcus, Nikki, Travis | -10 | the same |
| 27 | 5911 [12] Shayla | -5 | the same |
| 28 | 5925 [13] Marcus | -10 | the same |

These become `propagate` in B2. Unfired seeds keep their copied effects (Upgrade 8 at 18127), which are still valid `attitudeDelta`s, i.e. everyday.

**Content: FAVOUR_TEMPLATES.**

| # | Site | Today | Becomes |
|---|---|---|---|
| 29 | 5986 [5] Marcus | +5 | **unchanged (everyday +5)**, as Appendix F |
| 30-32 | 6022-6024 [9] Marcus, Nikki, Travis | +5 | unchanged |
| 33 | 6042 [11] Loretta | +10 | unchanged |

**Engine sites.**

| # | Site | Today | Becomes |
|---|---|---|---|
| 34 | 13094 `resolveLooseEnd` | `LOOSE_END_ATTITUDE` delta | **into `rel.start`**: w += LOOSE_END_ATTITUDE[kind]; t += LOOSE_END_TRUST[kind] = { debt: -10, enemy: -50, secret: -5, lost: 10, promise: 5 }; k = 30. The informant also gets `leverageAdd` (§8). Liking numbers are the same: Boyd -10 → -50. |
| 35 | 14013 `driftAttitudes` | drift | `relDay` (A1 exact, A2 everyday-only) |
| 36 | 14140 missed appointment | -3 + w1 | `socialEvent broke_word`, `scale: 0.5` (W -4, T -8), weight 1 |
| 37 | 14233 GOT_EVEN | +10 | `relSettle { by: 'got_even' }` (0.4 × liking); a legacy memory keeps +10 |
| 38 | 14583 `forceAttitude` | delta | `relSet { w }` (A1) |
| 39-40 | 20826 / 20830 card seats | -2 / +1 | `socialEvent card_loss` / `card_win` (everyday); the w1 note as `noted` with `d: null` |
| 41 | 21066 table-stakes fumble | -5 | **unchanged (everyday -5)** |
| 42 | 21299 caught cheating | -20 | `socialEvent cheated`, `d: { w: -20 }` |

**Not `attitudeDelta`, but also converted.**

| # | Site | Today | Becomes |
|---|---|---|---|
| 43 | `meetingRep` (11490) | `+= rep / 5` | everyday (same number) |
| 44 | legacy `attitudeChanges` | | everyday, with yield |

Sites 1-15 change the content constant. That reaches new games and new obligations at once. Obligations already copied into saves keep the old ops (valid), unless Upgrade 9 rewrites them (§13).

### 4.7 Memories the engine writes, typed (A2)

| Writer | Event |
|---|---|
| `arrestPlayer` (14528) | `noted`, weight 3, own |
| `sleptRough` (14486) | `noted`, own |
| defeat rescued (22142) | `they_helped`, weight 2, owed -1 |
| defeat captured (22143) | `noted`, weight 3, own (the separate fix is not a prerequisite) |
| `/fact` (22728) | `fact` (protected, `d: null`, never a grudge) plus a relationship fact (§9.6) |
| critical social failure (18938) | `noted` |
| FAVOUR self-memories ([2], [10]) | `noted`, own |

---

## 5. The bookkeeper's wire format

### 5.1 The tolerant parser (`Api.socialFromWire`, used by `recordFromWire`)

```js
function socialFromWire(v) {
  if (isObj(v)) return v;
  const words = String(v == null ? '' : v).replace(/[“”]/g, '"').trim().split(/(\s+|[,:;]\s*|\s+[–—-]\s+)/);
  const out = { npcId: '', event: '', aboutId: null, private: false, text: '' };
  let i = 0;
  for (; i < words.length; i++) {                        // consume tokens until the first word that is none of them
    const w = words[i].trim(); if (!w || /^[,:;–—-]+$/.test(w)) continue;
    const id = /^npc_[a-z0-9_]+$/i.test(w) ? w.toLowerCase() : null;
    if (id && !out.npcId) { out.npcId = id; continue; }
    if (id && !out.aboutId) { out.aboutId = id; continue; }
    if (/^private$/i.test(w)) { out.private = true; continue; }
    const ev = !out.event && Rel.eventWord(w, words[i + 2]);  // 1- and 2-word forms ("kept word"); alias table; unique 5-letter stem
    if (ev) { out.event = ev.name; i += ev.used - 1; continue; }
    break;
  }
  out.text = words.slice(i).join('').replace(/^[\s,:;–—-]+/, '').trim();
  return out;
}
```

- **What it accepts:** `"npc_dewayne: hit: …"`, `"npc_dewayne hit me in my bay"` (event `hit`, text "me in my bay"), `"npc_x apologized …"`, `"kept-word"`, `"keptword"`, and `"npc_x private threatened: …"`.
- **Colons in the text** ("meet at 10:30") are safe: tokens stop at the first non-token.
- **A missing about-id** on `exposed`, `badmouthed`, `vouched_for` or `defended` is inferred from the first cast name in the text (`Town.nameMentions`; a full name, or a unique first name).
- **A spurious about-id** on an event that takes none is ignored.
- **Unknown or engine-only words** (`hit`, `gift`, `flirted`, …) from the model are dropped and logged.
- **A model `flirted`** without the parser's flag becomes `complimented` for an adult, and the minor rule for a minor.

### 5.2 The schema

- **The change.** `record_changes` loses `attitudeChanges` (3), `newMemories` (4) and `memoriesSettled` (1), and gains `socialEvents: list(STR, desc)` (1).
- **The result:** **34 properties, 3 enums**, by the wave17 counter.
- **`RECORD_CORE_FIELDS`:** `['socialEvents', 'goldDelta', 'hpDelta', 'itemsGained', 'itemsLost', 'playerLocationId', 'npcKnownToPlayer', 'rumoursHeard', 'npcFates', 'obligationsSettled', 'journalEntry']`, **11 counted**.
- **`RECORD_EMPTY`** gains `socialEvents: []`.
- **`parse_action`** gains `romantic: { type: 'boolean', description: 'True when the player\'s words or action show romantic or sexual interest in someone here' }`: **13 → 14 properties**, no new enum.
- **How we know `parse_action` is far from the limit:**
  - It has 13 properties and 5 enums (`actionType`, `moveWhen`, `stat`, `difficulty`, `timeCost`), and it compiles live on every turn today. The 31 Oct refusals were the bookkeeper's only (`docs/notes/prompts.md:682-687`).
  - The shape known to pass is 41 properties and 4 enums. The refused one was 45 and 6.
  - Adding one boolean adds no enum and one property. That is the cheapest addition the grammar has. `wave17-grammar L77` pins `count(parse) === 13` and becomes 14.
  - It is still in the probe.
- **The fallback.** A parser reply without `romantic` (canned test replies, an older model) reads as false (`normaliseParse`). The romantic regex in the mock parser sets it for mock mode (§6.1).

### 5.3 The rubric

- **The prompt:** `SYSTEM.bookkeeper = "You record what changed … Only record changes the narration actually shows. " + RECORD_RULES + " " + PLACE_RULE + " At most one per turn. " + EVENT_RULES + " " + MEMORY_WORDS`.
- **Deleted:** "Be conservative: …" and RECORD_RULES' `memoriesSettled` sentence.
- **`EVENT_RULES`** has 22 glosses (a draft of 300 words ≈ **420 estimated tokens**; the wave writes the real text). It names the act "as a neutral witness would name it" and lists what the engine records so it is never sent.
- **`MEMORY_RULES` is forked deliberately (red-team item f):**
  - `MEMORY_RULES` stays word for word for `SYSTEM.memories` (`upgrade.test L361`).
  - The bookkeeper gets `MEMORY_WORDS` (53 words): the wording rule and the good examples only. That drops "saw them hit the bartender" (witnesses are code now) and "At most one memory per person per turn" (two events a person).
  - A comment at both says they diverge on purpose.
- **Net cost:** +300 + 53 − 193 − 31 − 12 = **+117 words ≈ +164 tokens**, uncached. The schema shrinks by about 70 tokens.

### 5.4 Preconditions (§3.2 of the design), checked in State

| Event | Code check (reads) | Fails → |
|---|---|---|
| `kept_word` | an unsettled `they_confided` memory from X, and `opts.present` has another NPC; no `kept_word` from X in 3 days | `confided` |
| `came_clean` | settles a `lied_caught` (trust × 0.6), else marks the newest `rel.asks` `deceive` entry `confessed` (a later `lied_caught` about it ×0.25) | K +3 |
| `lied_caught` | a `rel.asks` `deceive` aimed at X, or a `noted` claim of X's | refused |
| `exposed` (about Y) | the player holds a record over Y (status held, used or paid); a second exposure to the same X → trust -8 | A: K +2 (B: `badmouthed`) |
| `betrayed_confidence` | an unsettled `they_confided` from X | `crossed` |
| `defended` (against Z) | Z present; Z not targeted by the player earlier this scene (`rel.asks`/log) | `complimented` |
| `apologised` | the turn's roll succeeded (persuade or talk aimed at X), or liking > -25; it never resets compounding | K +2 |
| `rebuffed` | X has a spark status for the player | refused |
| `learned_secret` | `known.secrets[X]` | refused |
| `caught_you_at` | this turn's action was steal, sneak, search, attack, or a deceive aimed at X | refused |
| `stole_from`, `cheated` (B) | a `rel.asks` steal or deal aimed at X | refused |
| `private` | words events only; on `learned_secret` it means "they don't know" | ignored |
| Presence | X alive and in `present`, not laid up. An absent victim is refused in A; in B1 it is accepted with a present witness. | refused |
| Caps | 2 a person, 4 a turn; over the cap, keep the heaviest (weight, then \|Δw\| + \|Δt\|) | dropped and logged |

### 5.5 Settling (combined, never locked)

The target memory is found by the words (the `memoriesSettled` matching at 10832), else the newest unsettled harm within 3 days. Each settlement:

- pushes `{ turn, day, by, w, t, f }` with factors scaled by pride and grudge-holding;
- stops at two (got_even is extra);
- never deletes anything;
- **still lets a same-day weight-3 harm grow a grudge** (`plantFeelings` checks the settlement's `day === m.day`).

A `blackmailed` memory takes an apology at half factor, and only once its record is `paid` or `void`.

### 5.6 `cleanDiff` and the bookkeeper packet

- **`cleanDiff`** (22257) passes `opts.diminish`, `opts.giftTo` and `opts.engineEvents` through. The legacy `attitudeChanges` scaling stays.
- **The packet** (22027):
  - `npcRow` becomes `stance: <phrase>[, <tag>]`;
  - `presentRow` lists **at most 3 unsettled memory handles** `(<event>, Day N)` and the person's open `lev_` ids;
  - ALREADY APPLIED gains `engine events: npc_colt beat_down; npc_tyler threatened`;
  - the SAME ASK AGAIN line loses its "-5 to -10";
  - CARD GAME and TABLE STAKES say "record no social event".

### 5.7 The mock bookkeeper (16784)

The mock flips through its existing `known(k)` guard when A3 moves `socialEvents` into `RECORD_KEYS`.

| Mock rule | A3 |
|---|---|
| Say insult / Do insult | `insulted: <words>` (the engine compounds; ≥ 2 witnesses → `humiliated`) |
| Threat | **nothing**: the engine's `threatened` from the roll |
| Persuade success | nothing: `spent_time` comes from `relTurn` |
| An apology that lands | `apologised: <memory words>` |
| Attack | **nothing**: the engine's `hit` or `shoved` |
| Failed steal | **nothing**: the engine's `stole_from` ×0.5 |
| Gift | **nothing**: the engine's `gift` |
| Debt paid | **nothing**: onMet's `paid_back` |
| New rules for the tests | `npc_x lied_caught: …` on "you lied"; `npc_x they_confided: …` on "tell me about yourself" when the roll succeeded; `npc_x noted: …` on a Say claim ("I'm a surveyor"); `npc_x learned_secret: …` when `ctx.revealSecretFor` has X |

### 5.8 Live grammar probe (blocks A3 only)

The probe is `tests/probe-grammar.cjs` (not a `.test.` file, so `run.cjs` skips it; about 150 lines). It:

1. Opens `index.html` headless with `quickStart` seed 12345.
2. Builds a fixed bookkeeper packet with `Pipeline.bookkeeperPacket` and a fixed parser packet with `Pipeline.parsePacket` ("I flirt with Jodie").
3. Gets the bodies from `Game.Api.requestBody(role, { system, user, schema })` and the headers from `Game.Api.headers(key)`.
4. From Node, posts each to `https://api.anthropic.com/v1/messages`, for each model in `PROBE_MODELS` (default: the Standard and Thrifty bookkeeper and parser models from the presets). The cases are:
   - the new `record_changes` (34/3);
   - the new core (11);
   - the new `parse_action` (14);
   - the control `record_changes` from `56e69f5` (41/4).
5. Prints the status, request-id, stop reason, the counts, and the parsed `socialEvents` (through `recordFromWire` in the page) and `romantic`.

It **passes** when every request returns 200, no reply mentions "grammar", the bookkeeper reply yields at least one known event, and `State.apply` of it rejects nothing.

The owner runs `ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs`. The result goes into README "Verified against the live API" (1375) and `docs/notes/prompts.md`.

---

## 6. The minor guard (A3)

> **Tightened by §19.3:**
> - the minor line goes to the narrator **whenever a minor is present**, not only on flagged turns;
> - the heavy consequences of §6.2 need a **named target plus a second signal** (a bare flag gives a light row);
> - the minor anchors add the **live `TOWN_DATA` age** and fail closed;
> - the guardians and the police head have fallbacks;
> - coercion is refused for everyone (§19.1).

### 6.1 Before narration

1. **The flag.** `parse_action.romantic`. The mock parser (16117 area) gains `MOCK_ROMANCE = /\b(flirt\w*|kiss\w*|ask \w+ out|on a date|you'?re (pretty|cute|beautiful|handsome)|wink\w*)\b/i`, which sets it.
2. **The decision.** `Pipeline` step 4 (after `normaliseParse`/`checkAndCreate`) calls `ctx.romance = Rel.romanceTurn(ctx)` when `romantic` is set. The aimed people are the targets in `presentIds`, or **everyone present** for a Say to everyone or a romantic line with no target.
3. **The lines.** `Rel.romanceTurn` writes per-turn lines into `ctx.narratorLines` (spliced after COMPLICATION, 21935-21948):
   - for each minor: `Kaylee Pittman is 16: any romantic or sexual advance is unwelcome and alarming; she is uncomfortable, gets away or goes to her father; never warm, never flirtatious.` The guardian named is the first of `Rel.guardiansOf`; with none, "goes to someone she trusts";
   - for an eligible adult, the answer: "Shayla Rawls is open to it: she flirts back, her own way", or "Annette Overstreet isn't interested: she turns it aside";
   - for anyone else: "<Name> isn't interested: <they> turn it aside".
4. **The under-18 player.** When `Rel.playerMinor()`, **every** turn carries "The player is under 18: nobody in this town flirts with them or takes a flirt from them as anything but a kid talking." (uncached, about 25 tokens).

### 6.2 After narration

`State.apply` (model rules), for any person `Rel.isMinor` holds for:

- a model `flirted`, `rebuffed` or `intimate`, **or any event at all on a turn where `ctx.romance` aimed at them**, is replaced by the engine's `unwanted_advance` row (W -20, T -20, F +10, weight 3, wound, `fearBuysNothing`);
- the guardians (`Rel.guardiansOf`: parent or grandparent labels in `n.relations` and their inverses, alive, in town) each take `socialEvent crossed` at full (W -12, T -12, scaled by guardedness), weight 3, from a template ("came on to my daughter at the register");
- **each plants a report** to the police head at once (`Rel.rng('minorReport', guardianId, day)`);
- `reputationDelta town -10`, **outside** the ±5 cap.

### 6.3 Fear and leverage on minors

- `Rel.complies` returns false for minors.
- The secret gate's fear route is closed for minors.
- A backed ask aimed at a minor rolls as usual, and `canRaise` is $0.
- **Any `threatened`, `threatened_to_tell`, `blackmailed`, `shoved`, `hit` or `beat_down` on a minor** plants reports to each guardian and to the police head (sub-streams), plus town reputation -5 (threat) or -10 (violence), outside the cap.

### 6.4 Spark can never move for a minor

The rule is enforced at every writer, plus `relWrite` (§3.1):

- `socialEvent`/`socialEvents` zero `d.s` and log the refusal;
- `relSet`, `editPerson` and `relFill` refuse an `s` (the edit is refused, with a reason);
- `State.load` zeroes it;
- `/fact` never writes spark.

The packet builders and the card check `Rel.isMinor` again. `Rel.sparkStatus` returns null first.

### 6.5 The permanent test

`tests/relationships.test.cjs` (a non-wave suite, like acceptance) holds design-v2 Appendix D's test **as written**: steps 1-10, including the 300-string fuzz. It lands in **A3**.

- Steps 7-9 (eligible Jodie, the under-18 player) use a temporary `Game.town.romance` entry in A3. A4 switches them to the content list.
- The roster assertion pins exactly Kaylee, Micah and Austin, so a new minor fails until it is reviewed.
- `validate-town.cjs` refuses a minor on `romance` from A4 (the content key arrives then). An A3 check on a temporary copy asserts the refusal code path.

---

## 7. Spark (A4)

- **Content.** `TOWN_DATA.romance` (validator: keys `npcId`, `open`, `sparkRate` 0.5..1.5, `opensAt: { knows }`, `faithful`; nobody who `Rel.isMinor`, by cast age or tag). **It ships with the 12 adults of Appendix E** (§19.5; this replaces "ships empty").
- **Welcome,** decided in `Rel.romanceTurn` before narration:
  - eligible;
  - knows ≥ `opensAt.knows`;
  - not in the dislikes or hates rows;
  - not `faithful`.
- **The `flirted` event.**
  - Welcome: W +4, K +2, S +10 × `sparkRate`.
  - Unwelcome adult: W -6, T -3, S -5.
  - Minor: §6.
- **Other spark changes.**
  - `spent_time` adds S +2 at s ≥ 10.
  - `rebuffed` S -15 (B word, precondition).
  - A weight-3 harm halves spark: `d.s = −round(s / 2)` at write time.
- **Statuses** come from `Rel.sparkStatus`, with hysteresis. Their cues, feed lines and card tags are as the design table. "Curtis Pruett takes the hint." is printed when a status is lost.
- **Never read by town events** (`Rel.meets` has no `spark` key).

---

## 8. Leverage (A4)

### 8.1 What persists

- **`state.known.secrets[npcId] = { turn, day, how }`.** It is written through `secretShown` in Pipeline step 6, the turn `secretsFor` (19107) puts a secret into the narrator packet. `how` is `roll` (a successful social roll), `trust` (the trust 40 and knows 30 gate), `fear` (fear ≥ 60 after a successful intimidation, adults only), or `rumour`.
- **Today nothing persists** a revealed secret: the log entry keeps input, roll and narration only (11238-11262). So old saves have no record. They get none: "the player's past secrets are not turned into leverage after the fact" (design §9).
- **`state.leverage`** records (§2.3).

### 8.2 Gained

| Way | Source | Rule |
|---|---|---|
| `learned_secret` (B) | `npc_x learned_secret: <words>` | precondition `known.secrets[X]`; `text` = the model's words (≤ 120), **never the `secret` field**; `weight` = `secretWeight` (default 2); `mattersTo` from content; `aware` true unless `private` |
| `learned_secret` (E) | `rumoursHeard` apply, for a rumour with `leverageOver: npc` (content field; the validator's rumour keys gain it) | `aware: false`; `known.secrets[X] = { how: 'rumour' }` |
| `caught_you_at` (E) | the "{witness} catches you at it" complication (5309: its effects gain `socialEvent caught_you_at`); a failed or partial steal or sneak, or an attack, with X present | holder X over the player, `playerKnows: true` (it happened in front of them); weight by action type |
| `caught_you_at` (B) | precondition §5.4 | as E |
| The informant loose end | `Town.resolveLooseEnd` for kind `secret` (13091) | `leverageAdd { holder: informant, over: 'player', about: { kind: 'loose_end' }, text: <the player's words>, weight: [2, 2, 3][option] or 2, mattersTo: [police head], playerKnows: false }` |

### 8.3 Used, at resolve

- **The parser.**
  - The parse packet lists each held record as an entity line: `lev_hollis_1: what you have on Hollis Byrd: the landing's cash in his books`.
  - `normaliseParse` lets `lev_` ids through **`aboutIds` only**, and only for records the player holds with status held, used or paid.
- **A backed ask** is `intimidate` or `persuade` aimed at X with X's record in `aboutIds`:
  - `Rel.difficultyFloor`/`complies`: weight ≥ 2 → no roll (**the d20 is burned**, §11.4); weight 1 → easy; a hard target → normal; a minor → the roll is made as usual.
  - **The answer** (`Rel.leverageAnswer`). **Superseded by §19.4:** tough → violence grudge; hard but not tough → refuses, with a gossip grudge or a protector report; everyone else complies (the pride rule is dropped); `canRaise` defaults to $100; `paid` is terminal; a romantic ask is never backed (§19.1). v2's version was:
    - hard and tough → refuses, and a violence grudge seed is planted now;
    - pride ≥ 1 with fear < 40 → refuses;
    - else pays, within `min(100 × weight, canRaise)`.
  - **The packet line:** `LEVERAGE: Hollis Byrd will pay the $300 by tomorrow evening, and hate it.`
- **Events.**
  - With a price in the input (`/\$\s?\d+|\b\d+\s+(?:dollars|bucks)\b/`): `blackmailed`, and the demand `{ amount, dueDay: day + 1, turn }` goes on the record. A payment seed is planted (`origin.kind: 'leverage'`; effects `playerGold +amount`, `leverageSet { status: 'paid' }`, `socialEvent paid_silence` from them, W -5; `Rel.rng('pay', npc, day)`).
  - Without a price: `threatened_to_tell`, and `aware` is set.
- **The Journal** gains "are owed": "Hollis Byrd: $300 for keeping quiet, due Day 4 (1 day)" (UI Journal panel). `/recap` Owed lists it too.

### 8.4 The obligation link (one story), inside `State.settle` (9286)

This is code, not content, so old saves' copied effects still work. For `o.kind === 'blackmail'`, the record is the one with `demand.obligationId === o.id`, else the informant's loose-end record over the player by `o.npcId`.

- **The seed fires** (World `fire`, when its effects include `addObligation` kind blackmail): `leverageSet { status: 'used', demand: { obligationId }, playerKnows: true, use: 'blackmailed' }`. Feed: "Glenda Pryor has something on you."
- **`met`:** `leverageSet { status: 'paid' }` **in the same apply as the onMet effects**. The new content onMet adds `paid_silence`. Feed: "Glenda Pryor will keep quiet."
- **`missed`:** `leverageSet { status: 'spent', knownBy: mattersTo }`. New content onMiss carries `told_anyway` (Marcus) and `broke_word` (the informant), §4.6 rows 9-10. Feed: "Glenda Pryor told."
- **The standoff.** In `tickObligations` (9238), before marking a blackmail missed: if the player holds an aware record over the informant (held, used or paid) and the informant is not hard, the obligation is settled **`lapsed`**, with no onMiss. Both records stay `held`. Feed: "Glenda Pryor lets it drop." `obligationLine`, the Journal ("Dropped"), `World.missedObligations` and `conditionsMet`'s `obligationStatus` accept `lapsed`. The validator's `obligationStatus` values add it.
- **Coming clean** (B `came_clean` aimed at someone in `mattersTo`, about the loose end): `leverageSet { status: 'void' }`, and the obligation goes `lapsed`.

### 8.5 What leverage does elsewhere

- **Fear of what you know:** `levFear` (§3.1).
- **The police bar.** While the player holds an aware record over X (held, used or paid), X's grudge choices drop the police kinds and `Rel.protectorOf` skips the police, unless X is hard. When the record turns spent or void, the bar lifts, and X's grudge check runs on the next tick (`plantFeelings` treats a just-lifted bar as no cooldown).
- **NPC holders:**
  - at liking ≤ -60, a **tell** grudge (a new template kind `tell`, appended GRUDGE_TEMPLATES [14]: effects `socialEvent told_anyway` to each `mattersTo`, `leverageSet spent`);
  - a holder's report spends it;
  - a `mercenary` holder at liking ≤ 10 gets a **price** seed (appended [15]: `addObligation` blackmail of $50 × weight due +2, linked to the record).
  - Each uses its own sub-stream.
- **Tags:** "you have something on each other", "has something on you" (only once `playerKnows`), "you have something on them" (dropped under "afraid of what you know").

### 8.6 What never leaks

- A player-held record needs `known.secrets` or a marked rumour.
- Its `text` is the model's or the rumour's words, never `n.secret`. Debug shows both.
- A record over the player reaches the card and the narrator only once `playerKnows`, or on the due turn of the holder's seed.
- Weight, `mattersTo`, `canRaise` and the answer before it happens stay in Debug.
- The narrator's leverage reason for a record the player holds is the record text (it was narrated).
- `exposed` (B) needs a held record over Y.

---

## 9. Dynamics, bounds and gates

### 9.1 Traits

- `Rel.axesOf` over `TRAIT_AXES` (66 traits; the wave test asserts every cast trait is mapped or in `FLAVOUR_TRAITS`).
- The `mercenary` flag comes from content.
- **Hard** = nerve ≥ 1, `tough`, or a faction head. The design lists eleven; a test asserts that exact list.
- Spark is never scaled by traits.

### 9.2 Repeats and bounds

- **Kind repeats the same day:** 1, ½, ¼, 0 (`rel.today`).
- **Across days:** `spent_time` and `gift` count in full on the first 3 days per person (`rel.days`), then reduced.
- **Harm compounding:** ×1.5, then ×2.25 within 3 days. It merges into one memory, with weight +1 up to 3. Settling never resets the count, and leverage uses on the same record compound the same way.
- **Clamps per person per turn:** liking ±40, trust ±45, fear ±40, spark ±20.
- **Everyday:** ±15.
- **Knows:** every event gives at least +2.
- **Eviction at 12:** secondhand and witness copies first, then mood, slight, wound and scar, kind before harm within a class. `noted` (≤ 3), loose-end and `/fact` memories are protected. The remainder goes to everyday.

### 9.3 Gates (`Rel.GATES`, with the wave each lands in)

| Gate | Today | New | Wave |
|---|---|---|---|
| Dice social modifier (6753-6769) | ±2 at ±50 | persuade, charm, talk, buy, sell, give: liking ±1 at 30, ±2 at 60; intimidate: fear +1 at 20, +2 at 40, -1 vs liking ≥ 40 | A2 |
| | | deceive: trust +2 at ≥ 40, -1 at ≤ -25, -2 at ≤ -50 | A3 |
| Difficulty floors (`normaliseParse`) | the rubric's "-25" | hard for an ask of someone in the dislikes or hates rows; a lie at trust ≤ -25 hard, ≤ -50 very hard; hard people at least hard to intimidate | A3 (the rubric sentence changes in A5) |
| Fear compliance | — | an adult at fear ≥ 40 (not hard, not a minor) does a small thing (talk or persuade at easy or normal) with **no roll; the d20 is burned** | A2 |
| Secret (`secretsFor` 19117) | attitude ≥ 50 | trust ≥ 40 and knows ≥ 30, or a successful social roll, or fear ≥ 60 after a successful intimidation (adults only) | A3 |
| Couch (`restQuality` 9833) | ≥ 25 | liking ≥ 25 and trust ≥ 0, or owed ≥ 1 and liking > -25 | A3 |
| Rescue (22129) | ≥ 25 | liking ≥ 25 or owed ≥ 1, unless the stance is "afraid of you" | A2 |
| Seats (19480), Curtis (19332) | -25, -10 | plus trust > -40 | A3 |
| Rumour pool (21700) | > -25 | plus (trust > -25 or gossip) | A3 |
| Grudge | ≤ -60 + w3 | liking ≤ -60 + an unsettled (or same-day-settled) w3 harm | A2 |
| | | trust ≤ -60 + a first-hand betrayal, or `exposed` about them; the kind from the class; fear ≥ 40 → police or gossip only; the police bar; a hard tough person → violence | A3/A4 |
| Favour | ≥ 60 + w2 | liking ≥ 50, trust ≥ 20, an unsettled help memory w ≥ 2; template `needs` (alibi trust 40, ramp and photo 30) | A3 |
| Owed favour | — | net ≥ 2 and liking > -25; non-cash templates only, or the $100 work at liking ≥ 25 and trust ≥ 0; spends the debt | A4 |
| You owe them | — | after 5 days unpaid they ask, again 3 days later, then a `crossed`-class memory ("never paid me back for the boat"), not `broke_word` (a template by tag) | A4 |
| Report seed | — | fear ≥ 40 from threats (`threatened`, `threatened_to_tell`, `blackmailed`), whatever the liking; or fear ≥ 40 from violence and liking ≤ 0; always for a minor. To `Rel.protectorOf`; "nobody" → a gossip grudge (a violence grudge if tough). The protector takes `crossed`-class W -5 T -10 (police) or W -10 T -10 (family or boss), from a template. A report by a holder spends its leverage. | A2 (threat and violence), A4 (leverage parts) |
| Won't sell | — | a manager, owner, merchant, bartender or cashier in the dislikes or hates rows refuses for 3 days, then a 25% markup (`playerPrice`-like, per seller: `flags['relPrice.<npcId>']`). **Essentials** (a bed, gas, food) are never refused more than one night unless a grudge template says so. | A2 |

### 9.4 Fear

- **One clock** (§3.1).
- **Hard cap 39** at write time.
- **The override window** is liking in [-60, 25) (§1.3).
- **Protectors:** content `protector`, else the relations defaults.
- **Role limits** on the rival rule (B1): police never warm over violence, theft or cheating; clergy (`priest`, `pastor` tags or role) never over violence.

### 9.5 Settling

Settlements combine (§5.5); the factors are design §5.3's table.

### 9.6 `/fact` (A2)

A `/fact` naming a cast member is classified in code by its words. It writes to `rel.start` (it was true before the player came), never spark, never fear:

| Words in the fact | What it writes |
|---|---|
| "owes me", "owe(s) … a favour" | owed +1 |
| "go back", "known … for years", "old friend", "grew up with" | knows = max(knows, 30) |
| "trusts me" | trust +15, at most 40 |
| "likes me" | liking +10, at most 40 |

The memory itself stays a protected `fact` with `d: null`. This is an owner decision (§18): the design names "four things" without the mapping.

### 9.7 Derived feelings (design §10)

- **"Has no use for you"** (contempt): liking ≤ -25, fear < 10, and the top negative memories are words or honesty, not harm. Cue: "talks past you". (A5)
- **"Worries about you"** (pity): liking ≥ 25 and the player hurt (HP < half), broke (< $10) or beaten (the condition). (A5)

---

## 10. The narrator and the parser

### 10.1 The person line (`Pipeline.npcLine`, 21627)

`attitude N (word); remembers: …` becomes:

```
to you: <stance>[, <tag>][ — <reason> (Day N[, made good])[ / <reason> (Day N)]] — plays it: <cue>
open to a flirt                         (an eligible adult who would welcome one now; never a minor, never with an under-18 player)
holds you to: <noted> / <loose end line> / <fact>
```

- **Separators.** No `; ` inside a field (§1.5). The design's cue table is used with `; ` changed to `, `.
- **Present demeanour only:** no "will tell someone after", no "means to square it".
- **The per-person cap is 50 tokens** (3.5 characters each). The trim order: the second reason, then the tag (when the stance implies it), then the cell's clause of the cue. The status or override clause is never cut. `holds you to` sits outside the cap.
- **Hidden-tie and secret-derived reasons:** `cooler since Day 4, for a reason of her own; keeps it to herself, never hint at it` (no cause, no name) until the tie is known or the secret gate is open.
- **Brief** (DESTINATION): `to you: <stance>`.
- **Per-turn lines** go in `ctx.narratorLines`: `LEVERAGE:` (A4), the flirt answer (A3/A4), the minor instruction (A3), the under-18 player (A3), `BETWEEN THEM:` for known ties only (B2). Each carries its own one-clause instruction inline, e.g. `LEVERAGE (true; use it, never explain it): …`, so the cached block doesn't need to explain them.

### 10.2 The parser

- **The row** (18625): `toward the player: <stance>; lies to them: normal|hard|very hard` plus the person's `lev_` ids.
- **The rubric** (15335): "…or when asking anything of someone at attitude -25 or below" becomes "…or when asking anything of someone who is against the player or hates them (the engine also sets a floor)".
- **The flag:** `romantic` is in the schema, and a line in `SYSTEM.parser` explains it.

### 10.3 The cached blocks

The measurement is a scratch script over a draft of the rewritten example turns, using the api test's estimate (words × 1.4); A5 repeats it against the real text before the examples land.

| Item | Words | Tokens |
|---|---|---|
| Casual examples: 9 PRESENT entries in the v2 format, including a spark tag with "open to a flirt" (Dot) and a leverage tag (Charlene, "has something on you") | +120 | +168 |
| `Style.KNOWLEDGE` (14610): `"remembers" list` becomes `"to you" reasons, what they hold you to` | +6 | +8 |
| Format note in `Style.systemPrompt`, **trimmed**: `Each person's "to you" is where they stand with the player and why; "plays it" is how they carry it now: play it, never say it. Nobody flirts back unless their line says "open to a flirt" or a turn line says so, and nobody under 18 ever flirts or is flirted with.` | +53 | +74 |
| **Total (trimmed)** | **+179** | **+250 of 330 → 12,921 / 13,000 (≈ 79 left)** |
| (The full note, which also explains `holds you to`, LEVERAGE and BETWEEN THEM) | (+88) | (+123 → total 300; only ≈ 29 left) |

- **Decision: the trimmed note.** LEVERAGE and BETWEEN THEM explain themselves per turn, as above.
- **After the delta review** (§19.7), the fade-to-black rule (+18, A3) and the hidden-reason wording (+13, A5) bring the total to **+281 → 12,952 / 13,000 (48 left)**.
- **Literary:** "Mechanic: gruff, short sentences, attitude −10." becomes "…, cool to you." (+1 word, not in the default measure).
- **The cast block** is untouched.

### 10.4 The validator

- **L1919** becomes `/^Mechanic: .*\b(cool to you|[a-z' ,]+ you)\.$/`, and a new rule: no `attitude -?\d` anywhere in either set.
- **L1946** ("two people present") becomes `.split(/\); (?=[A-Z][a-z]+ [A-Z][a-z]+ \(\d)/)`: a close paren, `; `, then a two-word name and `(` with an age. Measured: identical counts to today's split ([1, 2, 1, 0, 2, 1, 1, 1]).
- **`PACKET_LABELS`** (1931) gain nothing: `LEVERAGE` and `BETWEEN THEM` are not used in the examples.

### 10.5 Reasons and tokens per turn

Reasons come from `Rel.reasons`. The words are made by `Pipeline.turnMemory`, the turning code of `recapReason` (23290-23319), refactored. Secondhand and witness text comes from `SECONDHAND_TEXT`, never by rewriting the victim's words.

| Packet part | Today | After A5 |
|---|---|---|
| Narrator PRESENT relationship part, 3 people with history | ≈ 129 | ≈ 3 × 45 = 135 (cap 150) |
| …3 strangers | 21 | ≈ 3 × 12 = 36 |
| …7 at the Low Water at night | up to ~450 | ≤ 350 |
| Per-turn lines (romance, leverage, minor, under-18) | 0 | 0-60, only when they apply |
| Bookkeeper system | ~2,900 | +164 |
| Bookkeeper schema | 41 properties | 34 (≈ -70) |
| Bookkeeper rows | | ≤ 3 handles per person (≈ +15 for 3 people), open `lev_` ids |
| Parser rows | ~9 per person | ~12 per person (with `lev_` ids) |
| `parse_action` schema | 13 | 14 (+1 boolean, ≈ +25 tokens of description) |

The cost is about +0.05 cents a Standard turn. The playtest band (1-6 cents, L478) and the packet limit (< 12,000 characters, L482) hold.

---

## 11. The world tick

### 11.1 Step order (`tick`, 14036)

```
a clocks · b completions · c missed obligations (mornings; blackmail standoff → lapsed) · d homes
e plantFeelings          ← new gates; report, price, tell and owed seeds on sub-streams
f events, epilogue       ← relAtLeast / relBelow (A5)
g newMorning: weather, conditions, relDay
h appointments           ← kept_word / broke_word ×0.5
i deliverHearsay (B1)    ← by tie class
```

### 11.2 Step e

Today's liking-route grudge and favour plants keep the shared `Rng` (13744-13753), so the same plants draw the same numbers. Every plant that the new rules add uses `Rel.rng(kind, npcId, day)`:

- the trust-route grudge;
- reports (threat, violence, minor);
- price, tell and owed-favour seeds;
- the leverage payment seed;
- the hard person's violence answer.

Template choice and day offset come from that sub-stream.

### 11.3 Step i (B1): hearsay by tie class

- **Spouse and household** (shared home **and** a family relation word; `Rel.household(a, b)` replaces the use of `household()` at 21676 for this purpose, while rumours keep theirs): the next night tick, or the next morning if it is already night.
- **Other family, boss and employee:** the next morning.
- **Friends, lovers, rivals and others:** the next co-location (`State.npcsAt`, built once per tick into a `loc → ids` map), or 2 days, or the next morning if it was town news.
- **No hop 2.** Expiry is 4 days. **One collapsed overnight line:** "Word got round: Lorna, Colt and Wade Purvis have heard about the landing." (up to 3 names, then "and others").
- **No Rng** is drawn.
- **The arrest route** (B1): `npcStatus arrested` with an arresting officer (`ctx.arrest`, the clock effect's actor) adds `tieDelta` W -20, T -20 from each in-town family member of the arrested to the officer, turn-stamped. If the player's `informed_on` or tip caused it, the usual spread reaches the player.

### 11.4 Rng stability (red-team item b)

- **The shared stream** (`meta.rngCalls`) is used by today's draws only: the dice (18974 / 6849), clocks (13441), weather, complications, and the legacy liking-route grudge and favour plants.
- **Sub-streams.** `Rel.rng(kind, npcId, day, n)` is `Rng.create(fnv1a32(`${meta.seed}|${kind}|${npcId}|${day}|${n}`) || 1)`, the pattern the card code uses (19451, 19554). It depends on no call order.
- **Burned d20.** When `Rel.complies` or a backed ask skips a roll, `Pipeline.resolve` calls `Dice.burn()`. That consumes `hooks.nextD20`/`nextTier` if set, else draws `Rng.d(20)` and discards it, so the next real roll is the one it would have been. Complication draws are not burned: the outcome differs, so those draws would differ anyway, and no current test reaches fear 40.
- **The test.** `tests/wave27-rel-engine.test.cjs`: a seeded game with a forced report seed, then 10 turns; the clock and dice values match the same game without the report, draw for draw.

---

## 12. Content

| Change | Wave | Validator (`tests/validate-town.cjs`) | Reaches old saves by |
|---|---|---|---|
| `socialEvent` in LOOSE_ENDS onMiss/onMet and the "catches you at it" complication | A2 | OPS + event checks; text through mentions | new obligations at once; copied ones by Upgrade 9 (JSON-equal to the old content) |
| GRUDGE templates' third-party → `crossed` secondhand | A2 | OPS | new seeds at once; unfired seeds keep their copies |
| `start: { trust?, fear? }` (Boyd -40, Jodie -25, Vada -10, Leon -15, …), `axes` | A3 | NPC whitelist (1191): optional `start`, `axes`, `secretWeight`, `canRaise`, `mattersTo`, `protector`, `mercenary` | read-time `castTown()` for the built-in town; Upgrade 9 |
| Favour `needs: { trust }` ([4] 30, [5] 40, [6] 30) | A3 | template keys (1827-1879) add `needs` | at once (global constant) |
| `TOWN_DATA.romance` (empty) | A4 | top-level key (927) optional; each entry checked; **a minor refused** | read-time fallback to TOWN_DATA for the built-in town |
| `secretWeight`, `canRaise`, `mattersTo` (Appendix C), `protector` (Appendix F), `mercenary` (5) | A4 | as above | read-time `castTown()` |
| Rumours `leverageOver: npc` (Mavis's cash rooms, Darlene's folder, Micah at the landing) | A4 | rumour keys add `leverageOver` (an NPC) | Upgrade 9 fills the rumour records (as v8 filled tellers) |
| GRUDGE_TEMPLATES appended [14] `tell`, [15] `price`, [16] `report` (`{protector}`) | A4 | `kind` adds `tell`, `price`, `report`; placeholders | at once |
| Seeds `danger: true` (3-4) | A2 | seed keys add `danger` | read-time by seed id for the built-in town |
| "Owed you" ask-back templates by tag (mechanic, bartender, …) | A4 | template list `OWED_ASK` (in FAVOUR_TEMPLATES with `kind: 'ask'`; validator) | at once |
| Council `relAtLeast` (R ≥ 30 → `{ trust: 30, knows: 25 }`; at hall R ≥ 15 → `{ liking: 15 }`; bought R ≥ 20 → `{ trust: 20 }`; the twins), epilogue Loretta `{ liking: 40 }`; **no fear branch** | A5 | `checkWhen` (743) adds `relAtLeast`, `relBelow`; seed `requires` the same | Upgrade 9 replaces the unfired built-in council and epilogue |
| `TOWN_DATA.policeHead` | A2 | top-level optional | read-time |
| B: `ties`, `secretTies` | B1/B2 | top-level; checks as v1 | Upgrade 10 / read-time |
| `docs/CAST.md` | A3, A4 | `cast-doc.cjs` gains start trust, axes, hard, protector, secret weight | `--check` |

The validator's `attitude -20..20` (L1265) and `memories: []` (L1266) are unchanged.

---

## 13. Migration

### 13.1 Rules version 9 (A5): "People who remember" (`Upgrade.peopleRemember`, rerun-safe, no call)

1. **Idempotence.** A person whose memories are all typed (`event` and `d` present) and who has `rel.migrated === 9` is skipped.
2. **Start.** `Rel.startOf(townCopyNpc || castNpc || n)`. A loose-end person gets `LOOSE_END_ATTITUDE`/`TRUST` and `k: 30` into `start`, and the old delta (sitting in `everyday`) is removed from there in the same step, so liking is unchanged.
3. **The pre-pass: the engine's own strings (red-team item d).** `Upgrade.LEGACY_ENGINE_TEXTS` is a frozen list of regexes **taken from the `56e69f5` writers**, tried before any typing by words:

   | Old string (writer) | Typed as |
   |---|---|
   | `^knocked me down in a fight at` (knockDown victim) | `beat_down` |
   | `^saw .+ knock .+ down at` (knockDown witness) | witness copy of `beat_down` (weight 2, wound class) |
   | `^locked .+ up overnight for fighting` (arrest) | `noted`, own |
   | `^found .+ (still )?sleeping rough at` (sleptRough, three forms) | `noted`, own |
   | `^Found .+ beaten senseless and helped them` (defeat rescued) | `they_helped` |
   | `^Beat .+ in a fight and dragged them to the cells` (defeat captured, the no-own bug) | `noted`, **own** |
   | `let the .+ go past due, so I took` / `would not pay, so I told Chief Bell` / `welshed on .+, and I made sure` (onMiss) | `broke_word`, own |
   | `paid (the )?.+ in full( and on time\|, but late)` (onMet) | `paid_back` |
   | `paid me two hundred dollars to keep quiet` | `paid_silence` |
   | `brought me a letter` / promise onMet texts | `kept_word` |
   | `^waited for .+ and they never came` | `broke_word` (×0.5) |
   | `^caught .+ sneaking around` | `caught_you_at` (a leverage record is **not** created after the fact) |
   | `^caught .+ cheating at cards` | `cheated` |
   | `^(lost \$\d+ to\|took a pot off) .+ at cards` | `noted`, `d: null` |
   | `^Watched .+ fail badly` | `noted` |
   | `^(Pointed\|Told) .+` (favour self-memories) | `noted`, own |
   | `^Loose end with` | `loose_end` (protected) |
   | `^Fact \(a story point\):` | `fact` |

   The list is built from the content constants' own `addMemory` texts, by turning each template into a regex (`{placeholder}` → `.+?`), plus the code writers above. **Editor-stripped memories** (no `act`) are matched by these strings first, so "took the phone" never types as the player's `stole_from`.
4. **Then by `act`, then by words** (`Rel.typeMemory`, as v1 §9.1 step 2), then `memorySense`. `day` comes from `World.memoryDay`, else `D − 7`.
5. **Fit to the old number:** scale the table values so Σ remaining liking equals `attitude − start.w` (clamped ×0..×2). If the signs disagree, use liking 0 and trust and fear at ×0.5. **Liking is exactly the old attitude** (`relFill` refuses otherwise).
6. **Trust seeded from the old attitude.** For a person with a weight ≥ 2 good memory (typed kind, or sense +1): `fix.t = round(0.8 × max(0, attitude − start.w))`, so trust ≤ attitude.
7. **The secret floor.** **If the old gate had their secret open** (attitude ≥ 50 and a w ≥ 2 good memory): trust is at least 40 and knows at least 30. Nobody who would have told the player their secret before the update stops after it. This answers the red team's "Royce at 55 loses his open secret".
8. **Knows:** `clamp(Σ d.k + 5·[metTurn] + 3 × days since met + 30·[loose end], 0, 60)`.
9. **Owed** from unsettled `did_favour`, `they_helped` and `rescued` (rare in old saves).
10. **Spark is 0** for everyone.
11. **Leverage:**
    - each informant loose end (`player.looseEnds` kind secret) gets its record, with its status from the obligation: no obligation yet → held, `playerKnows: false`; open → used; met → paid; missed → spent;
    - **heard rumours** now marked `leverageOver` → records with `aware: false` (owner decision, §18: recommended yes, because the rumour's `heard` is a recorded fact);
    - **secrets shown before the update** → nothing (no record exists).
12. **Content copied into the save:**
    - open obligations and unfired loose-end seeds whose effects equal the previous LOOSE_ENDS JSON get the new effects;
    - the unfired built-in council and epilogue get their `relAtLeast` branches;
    - rumours get `leverageOver`;
    - a town of the player's own is never touched.
13. **Feed:** "People now remember why: 14 people's memories now carry what they did to how they feel. 1 person has something on you." (with "The council now weighs trust." when it applies).

**The optional re-read (owner decision, §18).**

- Before step 3, Upgrade's existing version-2 step "Memories that matter" (`rewrite_memories`, `SYSTEM.memories`) can be re-run, so that very long old lines become short ones first. That needs no new schema: 41 people cost cents.
- A further option, a new `type_memories` call returning an event word per memory, would be a new schema and need its own probe. It is not recommended for A5.

### 13.2 Rules version 10 (B1): "A town that talks"

- Ties from relations plus the built-in `ties`, through `tiesFill` (never overwriting).
- The `secretTies` copy.
- `hearsay: []`. Nothing is re-spread.
- Feed: "People now feel for each other: 118 ties between 41 people. What you do from now on reaches the people close to them."

### 13.3 README rows ("Updating an older game", 1132)

```
| 9 (date) | People who remember | Gives everyone's feelings about you their reasons: each memory gets the kind of thing it was and how long it lasts; trust, fear and how well they know you are worked out from them, and anyone who would have told you their secret still will; how much they like you stays exactly as it was. Someone who was holding your secret over you now has a record of it. A council or ending still to come weighs trust | None |
| 10 (date) | A town that talks | Ties between people start to count: from now on what you do to someone reaches the people close to them, overnight for a husband or wife, by the next morning for family and work; nothing that already happened is spread again | None |
```

Also: the RULES_VERSION comment (7774), the Upgrade header (17420), and README 1156 ("9 now").

**What does not reach old saves**, documented in the README section:

- secrets revealed before the update;
- jealousy and fear from before it;
- trust built by confidences before it (except the seeded trust and the secret floor);
- `rel.asks` history (so `lied_caught` from the bookkeeper needs a deceive made after the update, or a `noted` claim).

---

## 14. UI

### 14.1 The People card (`personCard` 25047)

- **The list row.** The meta slot has `stanceChip(n)` in place of `attitudeMeter` (24941): the phrase plus **one** tag, three tints (`--att-warm`/`--att-mild`/`--att-cold`).
- **The open card**, in order:
  1. the stance and up to **2 tags**;
  2. **two dated reasons** ("Hates you" always shows its reason);
  3. leverage lines ("You know about the landing's cash in his books. Day 2" / "He paid $300 to keep it quiet. Day 4"; a record over the player only once `playerKnows`);
  4. Owed;
  5. Ties (B2: "strained since Day 5", known ties only);
  6. Notes;
  7. **"▸ More"**, a `details` fold with the **five-word grid** (Likes you / Trusts you / Scared / Knows you / **Interested**).
- **Interested** is rendered only for an eligible adult with a spark status. It is **never** rendered for a minor, or for anyone when the player is under 18.
- **Grid layout:** `grid-template-columns: repeat(2, minmax(0, 1fr))`, each `dt` above its `dd`, about 159px a column at 375.
- **Screen readers** hear the stance, tags and reasons as one sentence. The grid is read only when opened.
- **Hidden-tie changes:** "Cooler since you shamed Royce at the counter, Day 4. Hasn't said why." (the act and its day, never the tie).
- **Sort** (26182): `['attitude', 'How they feel']`, by liking then trust.

### 14.2 The Edit form (`editForm` 25133, `editBase` 25121, `readForm`, `editChanges` 25214)

- **"How they feel about you"** has four sliders: Likes, Trusts, Scared, Knows.
- **Interested** (0..100) only for an eligible adult: disabled and 0 for a minor, absent when the player is under 18.
- **Leverage lines** show their status, with a Delete button.
- **Memory rows** show a read-only "hit · fades in weeks" label. **Add** has the event picker.
- **Values land in `fix`** (§2.6).

### 14.3 Feed lines (`App.noteRel`, replacing `noteBands` 28973 in A5)

- **Who.** People in `State.relTouched()` who are known and alive.
- **How many.** One line per person (the highest-ranked), then the top 2 across people.
- **The rank:**
  1. weight-3 harm ("won't forget that");
  2. leverage known over the player;
  3. leverage gained;
  4. afraid of what you know;
  5. fear 40, then fear 20;
  6. silence lines;
  7. trust bands (four lines, both directions);
  8. spark statuses (and "takes the hint");
  9. liking bands;
  10. favours;
  11. settled ("lets some of it go").
- **Overnight:** the hearsay line is the tick's one collapsed notice.
- **Hysteresis** stops flicker. **Fading, undo, loads and edits print nothing. No spark line ever names a minor.**
- `noteBands` stays until A5, so `ui-fixes L381` and `transport L610` stay green until then.

### 14.4 `/recap` (`recapText` 23333)

- Warm, Cold and **Careful** (mixed: fond-but-distrusts, using you, afraid of what you know, has something on you, any fear override).
- **Owed** gains "Glenda Pryor wants $200 for her silence, due Day 7; Hollis Byrd: $300 for yours, due Day 4; Burl Satterfield owes you one".

### 14.5 Unchanged and Debug

- **Character Standing** is unchanged, except that the tier word can now read "Feared".
- **Debug** adds: the tracks, axes, hard, the everyday, fix and today buckets, each memory's remaining effect, leverage records (with the `secret` field side by side), `known.secrets`, `rel.asks`, and the GATES table.
- **A3 adds an "Export bookkeeper turns" button**, active when Settings → Advanced → "Keep bookkeeper packets" is on. Pipeline then keeps the last 200 `{ turn, packet, reply }` in memory and exports them as JSONL for the eval (§15.3).

---

## 15. Tests and tooling

### 15.1 Executable worked examples (`tests/relationships-examples.test.cjs`)

Each example is scripted through the mock, with `Api.Mock.queue` for parses and bookkeeper events. **The tracks match within ±2, and the stance, tags, feed lines and narrator fragments match exactly.** Where the design's arithmetic and the code disagree, the code's number is pinned and the design doc is corrected in the same wave.

| Example | A wave | B wave |
|---|---|---|
| 1 Dewayne (hit, witnesses, apology lands, gift) | A3 | Mavis's copy: B1 |
| 2 The garage money (`learned_secret`, `exposed` spends) | A4 | the tie: B2 |
| 3 Royce three ways ((b) drinks A3, (c) bully A2, (a) confidant + council A5) | A5 (whole) | — |
| 4 Colt on the ground (beat_down, witness rows) | A2 | kin, rivals, Tammy: B1 |
| 5 The surveyor (`noted`, `lied_caught`) | A3 | the department: B1 |
| 6 Trent (caught_you_at, lied_caught, kept_word) | A4 | — |
| 7 Tyler (threat, compliance with the d20 burned, report to Mavis) | A2 | — |
| 8 Burl (owed, non-cash favour) | A4 | — |
| 9 Loretta (hidden tie, named act) | — | B1 |
| 10 Shayla and Jodie (spark against caring, jealousy) | A4 | — |
| 11 Hollis (leverage gained and used) | A4 | the hidden tie to Wade: B2 |
| 12 Glenda and the $200 (paid, missed, standoff) | A4 | — |
| 13 Kaylee (the minor guard) | A3 (also in `relationships.test.cjs`) | — |

### 15.2 The simulator (`tests/relationships-sim.cjs`)

- **Skipped by `run.cjs`** (no `.test.`). Headless, mock mode, about 250 lines.
- **Three playstyles,** each a 21-day script of `Pipeline.submit` lines plus queued mock events (beer-buyer, confidant, brawler).
- **Output:** each involved person's six tracks, stance and tags every morning, as a table.
- **`--assert`** exits 1 when design-v2 Appendix D's bands fail:
  - Royce and Curtis never pass "warm to you";
  - the confidant reaches trust 30 and knows 25 by Day 6, and the staged version doesn't;
  - Wade is never "afraid of you" and reaches "hates you" with its reason;
  - bystanders are within 5 of start by Day 14.
- **A CI guard.** A shortened 8-day run of each playstyle's band checks lives in `tests/wave30-rel-people.test.cjs`, so tuning can't silently break them.
- **Usage:** `node tests/relationships-sim.cjs [beer|confidant|brawler] [--assert]`.

### 15.3 The labelled eval (`tests/eval-classify.cjs`, needs the owner's key)

- **The set.** `tests/eval/labelled.jsonl`, one turn a line: `{ "id": "pt-2026-11-04-t41", "packet": "<the bookkeeper packet text>", "labels": [ { "npcId": "npc_royce", "event": "insulted", "aboutId": null, "private": false } ], "note": "…" }`, at least 150 turns. The turns come from live sessions exported with the A3 debug button and labelled by hand with the act a neutral witness would name. An empty `labels` means no event.
- **The run.** `ANTHROPIC_API_KEY=… EVAL_MODEL=<bookkeeper model> node tests/eval-classify.cjs [set]` sends each packet with the real `SYSTEM.bookkeeper` and `record_changes` through `requestBody`, parses with `recordFromWire`, and applies the §5.4 rules **offline** (so code-refused events are counted as the engine would).
- **The report:** exact accuracy; the neighbour confusion rate, using the design §3.8 neighbourhoods (the red team's 6 groups); invented events (no label and no neighbour); misses; and cost.
- **The pass bar (owner decision, §18):** recommended neighbour confusions < 20% of emitted events (the design's bar), exact accuracy ≥ 75%, invented events ≤ 5%, and no minor-related event emitted for a minor (the engine overrides them anyway). It costs under $0.10 a run on Haiku.
- **No tuning** of EVENTS or the glosses before the first passing report is recorded in `docs/notes/prompts.md`.

### 15.4 The permanent minor test

`tests/relationships.test.cjs` (§6.5), from A3.

### 15.5 Other new tests

The other new tests go in the wave files (§16). They cover design-v2 Appendix D's "Also add" list, and each item is placed in the wave where its feature lands.

---

## 16. Milestones

Wave numbers follow the repo (25 is the latest). Sizes are lines in `index.html` (code / content and validator), new test lines, and **existing tests edited** (the full list is in the appendix).

### A1, wave 26: "The tracks under the number" (a refactor; no number changes; **no test edits**)

- **Scope:**
  - `Rel` with all tables as data;
  - `n.rel` with six tracks, the alias, `relWrite`, recompute (4 classes, the fear clock, combined settlements, hysteresis cache);
  - **spark stored as 0, with `Rel.isMinor`, `Rel.eligible` and the refused spark writes at every writer** (nothing raises spark yet);
  - `state.leverage = []`, `state.known = {}`;
  - the `socialEvent` op and `socialEvents` in `ENGINE_KEYS`;
  - `relSet`, `relDay` (A1-exact drift);
  - `attitudeDelta` and the legacy fields into everyday;
  - Town.instantiate start; the load fill and import guard; shape checks;
  - `forceAttitude` → `relSet`; `mergePeople`/`setMemories` pinning;
  - `Rel.rng`, `Dice.burn` (unused yet);
  - the Debug view numbers.
- **Files:** new `Rel`; State (`freshLedger`, `remember`, `checkMemories`, EFFECTS, `applyDiff`, `editPerson` with `rel`, `mergePeople`, `setMemories`, `rewind`, `setTime`, `load`, shape checks, key lists); Town.instantiate; World `driftAttitudes`, `forceAttitude`; Dice; UI debug; `window.Game`; validator OPS.
- **Tests added:** `tests/wave26-rel-tracks.test.cjs`:
  - `the tracks under the number: rel with six tracks on every person, attitude reads liking exactly, an attitudeDelta lands where it says even past the everyday bound, a direct write to attitude holds`
  - `socialEvent: a hit costs liking, trust and gives fear as one wound memory that keeps what it did; pride, guardedness, nerve and grudge-holding scale it and opposites cancel; hard people stop at 39`
  - `fading: four classes, one fear clock, trust at the speed of liking; witness copies one class lighter with nothing left over; settlements combine and never lock`
  - `repeats and bounds: kind things diminish the same day and across days, harm compounds and merges, everyday stops at 15, every event teaches at least 2 of knowing`
  - `the stance: twelve phrases with five points of hysteresis, devoted needs trust above zero, the fear override only between -60 and 25`
  - `spark stays 0 for Kaylee, Micah and Austin and for anyone not eligible, from every writer: model, world, edit, import, upgrade, cheat`
  - `/undo restores everything; /rewind strikes stamped settlements, owed entries and asks and keeps the everyday small things`
  - `an older save loads with liking exactly its attitude and plays as before`
- **Tests edited:** 0.
- **Docs:** BUILD_PLAN contract (74-91: `rel`, the alias; Game state: `leverage`, `known`), the ops table (`socialEvent`; 28 → 29), the module row, **Direction change 11 "People who remember"** with a Wave 26 sub-bullet; `docs/notes/engine-state.md`.
- **Acceptance (owner):** `node tests/run.cjs` is green with no edits. In Debug, each person reads `att N · w t f k s · stance` with `w = att`.
- **Size:** 550 / 10 / 480; 0 edited.

### A2, wave 27: "What the engine sees, people remember for what it was"

- **Scope:**
  - the engine events `hit`, `shoved`, `beat_down` (replacing the fight's memories; **the knockDown w3 witness memories retired**), `threatened`, `stole_from`, `gift`, `bribed`, `spent_time`/knows (`relTurn`), `paid_back`/`kept_word`/`broke_word` (LOOSE_ENDS and appointments), `cheated`, `rescued` (danger seeds), `card_win`/`card_loss`;
  - witness rows merged per scene; dedupe by class; **legacy yields**;
  - decay replaces drift (everyday drift on unseen days); `relSettle` (got even);
  - the conversions of §4.6;
  - the typed engine memories of §4.7 (captured → own, `/fact` → `fact` plus the relationship fact);
  - the liking and fear gates (Dice persuade/intimidate, rescue, **won't sell**); fear compliance with `Dice.burn`;
  - the report seed (threat and violence) with protectors (content `protector` and defaults) and "nobody" → grudge, on sub-streams;
  - reputation per event on public events; the feared tier; `/rewind` stamps; `relAsk`.
- **Files:** Pipeline (`fight`, `resolve`, `applyBookkeeping`, `defeat`, `fact`, the crit-fail memory, `seatMarks`, the cheat catch, rescue, `giftCheck` hand-off, the KNOCKED DOWN line, step 4 burn); World (`knockDown`, `arrestPlayer`, `sleptRough`, `plantFeelings`/`plantFeeling`, `fire`, `settleAppointments`, `newMorning`, `driftReputation`); State (`reputationTier`, `settle`, `applyDiff` engine events); Town (`resolveLooseEnd` → start); content (LOOSE_ENDS, the complication, GRUDGE third-party, `danger`, `policeHead`, `protector`); the validator.
- **Tests added:** `tests/wave27-rel-engine.test.cjs`:
  - `a fight is one memory: the second hit raises it, the third is a beat-down that replaces it, and the people who saw it get one lighter copy for the scene, never the old weight-3 memory`
  - `the engine wins: its hit drops the bookkeeper's humiliated and threatened for that person, its gift drops kept_word, and the demo's own attack and gift numbers yield to the engine's`
  - `threat-made fear plants a report to the person's protector whatever their liking; a faction head has nobody and holds a grudge instead; the dice and clocks after it are the same draw for draw`
  - `an adult afraid of the player does a small thing with no roll and the die is still drawn`
  - `missed and kept meetings, missed and paid debts are broken and kept words with trust; a missed meeting costs half`
  - `the town's standing moves on what happened in front of two people or more; three people at fear 20 make the player feared`
  - `a shop that is against the player won't sell for three days, then charges a quarter more; a bed, gas or food is never refused two nights`
  - `/fact: "Loretta owes me a favour" puts her in the player's debt; "Royce and I go back" means he knows them`
  - Executable examples 4 (Colt: A part) and 7 (Tyler).
- **Tests edited (≈ 27):**
  - `engine-world-fixes` L595, L652, L688, L724
  - `wave4` L493, L126
  - `wave5` L346, L298, L81 (Hollis is mercenary: a gift counts ×2)
  - `wave6` L121, L133 (the same), L146
  - `wave22` L192 (-3 → -4, with trust)
  - `pipeline` L241, L251, L279 (attack numbers: engine `hit` -25, the text from the template)
  - `transport` L473, L488, L645
  - `prompts-fixes` L444 (the knockout memory yields)
  - `state` L678 (loose end into start)
  - `content` L168, L409
  - `engine-state` L844 (the reputation setup)
  - `world` L699
  - `playtest` L74, L356
- **Docs:** README People (fading, fights, witnesses), **Grudges and favours** (643-660: reports, protectors, getting even), "What one turn can do" (982-991), "Fights", the `/fact` row; `docs/notes/engine-world.md`, `engine-state.md`, `content.md`.
- **Acceptance (owner):** knock Colt down at the landing. Debug shows one `beat_down` memory, Lorna and Trent each hold one witness copy, and town reputation fell by 5. Threaten Tyler twice at the motel: he hands over the drive with no roll, and the next day Debug shows a report seed to Mavis.
- **Size:** 710 / 100 / 610; ≈ 27 edited (after the delta: hidden protector ties, the tough answer, `rescued` excluding danger the player caused; §19.9).

### A3, wave 28: "The bookkeeper names the act, and minors are protected before the story is told" (**ships only after the live probe**)

- **Scope:**
  - the wire: `socialEvents` into `RECORD_KEYS`, 34/3, core 11, the tolerant parser, the 22 words with preconditions (`rel.asks` read), caps keep the heaviest, settlements by words, the packet handles;
  - `EVENT_RULES` + `MEMORY_WORDS` (the `MEMORY_RULES` fork); the mock flip;
  - **`parse_action.romantic` (14)** and the mock romance regex;
  - **the minor guard, all of §6**;
  - the trust gates (secret, couch, seats, Curtis, rumours, deceive dice, difficulty floors);
  - favour gates and `needs`; `start` overrides and `axes`;
  - the A3 debug export;
  - `tests/probe-grammar.cjs`.
- **Files:** Api (schemas, core, `RECORD_EMPTY`, `recordFromWire`, `socialFromWire`, `SYSTEM.bookkeeper`/`parser`, `mockBookkeep`, the mock parser); Pipeline (`bookkeeperPacket`, `cleanDiff`, `applyBookkeeping`, `normaliseParse`, `secretsFor`, the romance step, `narratorPacket` per-turn lines, the debug export); State (model rules, `restQuality`); Cards (`dealerRefusal`, `cardPeople`); World (`plantFeelings`, `templateFits`); content (`start`, `axes`, `needs`); validator; cast-doc.
- **Tests added:**
  - `tests/wave28-social-events.test.cjs`:
    - `the wire: event strings with or without colons, American spellings, a missing about-id found from a name and a spurious one ignored; 34 properties and three enums, a core of eleven, a parser of fourteen`
    - `a model's events: only for people here, at most two a person and four a turn keeping the heaviest; a precondition that fails downgrades kept_word to confided and refuses a lied_caught with no lie on record`
    - `an apology must land and never resets the count; a beating settled the same day still grows a grudge`
    - `trust opens the doors liking used to: a secret at trust 40 and knowing 30, a couch at trust 0 or a debt owed; lies to someone who distrusts the player are hard`
    - Executable examples 1 (A part), 3(b) and 5 (A part).
  - **`tests/relationships.test.cjs`**: the permanent under-18 test, steps 1-10 including the fuzz, plus `a flirt aimed at Kaylee: the narrator is told before it writes, her father and mother cool and report to the chief, the town drops 10, and nothing anyone says makes it warm` (example 13).
- **Tests edited (≈ 24):**
  - `api` L18/L25 helpers (one edit), L150-160, L316
  - `transport` L25/L30 helpers (one edit), L678 (the secret gate)
  - `wave17-grammar` L63, L82, L107, L131
  - `prompts-fixes` L383, L419, L444 (the mock's events)
  - `pipeline` L633
  - **`acceptance` [4]** (§18.1)
  - `world` L312, L367
  - `state` L1029
  - `wave3` L733, `wave4` L298, `wave5` L563, `engine-state` L578 (a host needs trust ≥ 0; set with `relSet`)
  - `playtest` L74 (the mock's events must all be valid)
- **Docs:** README People (how people take what you say), "What one turn can do", "What a turn costs" (the bookkeeper system and both schemas), "Verified against the live API" (the probe result), **a new "Nobody under 18" paragraph** (what the game does, in plain words), "Deliberate deviations" (SPEC §10, §7), the counts at 1168-1170 and 1382; `docs/notes/prompts.md` (the grammar, rubric, the fork, the mock, the flag), `transport.md`, `content.md`; `docs/API_NOTES.md` 234-254; BUILD_PLAN 290-305.
- **Acceptance (owner):** `ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs` passes. In a live game, flirt with Kaylee at the register in Say mode: she goes to her father; Royce and Darlene hold weight-3 memories; Debug shows two report seeds and town reputation -10. Insult Royce, then apologise, and Debug shows `insulted` settled by `apologised`.
- **Size:** 790 + 150 probe + 40 export / 50 / 920; ≈ 25 edited (after the delta: coercion on the fear path, the minor line whenever a minor is present, corroboration, anchors and fallbacks, the stricter `kept_word`, the fade-to-black rule; the extra tests in `relationships.test.cjs`; §19.1, §19.3, §19.9).

### A4, wave 29: "What people hold: wanting, leverage and favours"

- **Scope:**
  - spark (§7): `TOWN_DATA.romance` (empty), welcome, statuses, cues, jealousy, `rebuffed`;
  - leverage (§8): `state.known`, `secretShown`, `learned_secret` (B and E), `caught_you_at` (B and E), backed asks with the burned d20, `leverageAnswer`, the `LEVERAGE` line, `blackmailed`/`threatened_to_tell`, the payment seed, `paid_silence`/`told_anyway`, **the obligation link in `settle`**, the `lapsed` standoff, came clean voids, the police bar and its lift, `levFear`, tell and price templates, the informant's record at game start, the Journal "are owed";
  - favours owed: `owedSettle`, the owed-favour seed with the cash guard, the ask-back chain;
  - the report seed's leverage parts.
- **Files:** Rel; State (`settle`, `tickObligations`, `obligationLine`, `leverageAdd`/`Set`, `secretShown`, `OBLIGATION` statuses); Pipeline (`parsePacket` entities, `normaliseParse`, `resolve`, `secretsFor`, `narratorPacket`); World (`fire`, `plantFeelings`, `missedObligations`, `conditionsMet` `lapsed`); Town (`resolveLooseEnd` for secret); UI (Journal, People leverage lines); content (`romance`, Appendix C fields, `protector`, `mercenary`, rumours `leverageOver`, templates [14]-[16], the ask templates); validator.
- **Tests added:** `tests/wave29-rel-hold.test.cjs`:
  - `learning a secret is leverage only when the narrator had it: a turn's words without it are refused, a marked rumour counts and she doesn't know you know`
  - `intimidation backed by what the player knows: weight 2 needs no roll and the die is still drawn, weight 1 is easy, a hard man may call the bluff and Wade makes it go away`
  - `the $200 is one story: the price names it, paying keeps her quiet in the same step, missing it tells the chief, and holding something on her lets it drop`
  - `once it's out they come for you: the police bar lifts the moment the record is spent and the grudge check runs on the next tick`
  - `wanting against caring: Shayla is using you, Jodie is sweet on you at almost the same spark; a partner who sees it cools; spark fades in days unless fed`
  - `favours owed: two favours plant a payback with no cash unless they like and trust the player; you owe them: asked twice, then crossed`
  - Executable examples 2 (A part), 6, 8, 10, 11 and 12.
  - **`relationships.test.cjs` steps 7-9** move to the content list.
- **Tests edited (≈ 5):** `engine-state` L148, L256; `wave2` L113; `content` L168 (the blackmail ops); `state` L322 (the obligation status list).
- **Docs:** README People ("What people hold": leverage, the Journal's "are owed", favours), Journal; `docs/notes/engine-state.md` (leverage, `lapsed`), `content.md` (romance, Appendix C, ready-to-paste Appendix E), `prompts.md` (LEVERAGE, the flirt answer); BUILD_PLAN contract (`romance`, the new NPC fields, `leverageOver`), ops (`owedSettle`, `leverageSet`; 29 → 31), Game state.
- **Acceptance (owner):** as the fired bookkeeper, win Hollis's secret with a roll, then "Three hundred, or the sheriff gets your books". There is no roll; the LEVERAGE line is in the narrator packet; the next evening $300 arrives and the Journal strikes it through. With Appendix E pasted in, flirt with Shayla three mornings: People shows "Suspicious of you · using you".
- **Size:** 1,020 / 210 / 980; ≈ 6 edited (after the delta: `intimate`, coercion on the leverage path, leverage keys, the reference check, `paid` terminal, `canRaise` $100, `paid_silence` in place of `paid_back`, no money with a pending demand, the answers, `caught_you_at` limits, the standoff suppression, `whenTold` and inquiry seeds, and spark caring without the flirts; §19.2, §19.4, §19.5, §19.9).

### A5, wave 30: "What people show" (UI, narrator, council, rules version 9)

- **Scope:** §14 (card with fold, chip, editor with Interested and leverage lines and picker, `noteRel`, recap Careful and Owed, Debug); §10 (`npcLine` `to you`/`holds you to`/`open to a flirt`, the cue cap and trim, hidden-tie reasons, parser rows and rubric, the examples, KNOWLEDGE, the trimmed format note, the validator at 1919/1946); `relAtLeast`/`relBelow` (council and epilogue, no fear branch); the derived contempt and pity; Upgrade 9 with the pre-pass; RULES_VERSION 9; the simulator and eval scripts; the CI sim guard.
- **Files:** UI (`personCard`, `stanceChip`, `personNotes`, `personFacts`, editor functions, `SORTS`, CSS, Journal, debug); App (`noteRel`, `editPerson` quiet line); Pipeline (`npcLine`, `recapText`, `turnMemory`, `parsePacket`, `narratorPacket`); Api `SYSTEM.parser`; Style (`KNOWLEDGE`, the note); World `conditionsMet`; Upgrade (step, `LEGACY_ENGINE_TEXTS`, MIGRATIONS); State (`RULES_VERSION`, `relFill`); content (events, epilogue, EXAMPLE_TURNS_*); validator.
- **Tests added:** `tests/wave30-rel-people.test.cjs`:
  - `People: the stance and one tag on the row, two dated reasons and the leverage lines on the card, five words behind More that fit a 375-pixel phone, and nothing about wanting for a minor`
  - `Edit: four sliders, and Interested only for an eligible adult, land exactly; removing a memory keeps the numbers; every memory field survives a save`
  - `the feed: two lines a turn, the most important first, one line overnight for everyone who heard; fading prints nothing`
  - `/recap: Careful for who wants or fears the player without liking or trusting them; Owed carries silence and favours`
  - `the narrator hears "to you" with reasons and a present-tense way to play the person, never a number, never more than 50 tokens a person; a hidden reason has no name and no cause; the cached blocks stay under 13,000`
  - `the council weighs trust: the confidant tables it, the drinking buddy only from the back row, the bully gets nothing`
  - `rules version 9: liking stays exactly the old attitude for everyone; the engine's own memories are recognised before the words ("took the phone" is never a theft by the player); anyone whose secret was open still opens it; the informant's hold on the player becomes a record; nothing is called`
  - The 8-day simulator guard.
  - Executable example 3 (whole).
- **Tests edited (≈ 40):**
  - `prompts-fixes` L96, L331
  - `pipeline` L574, L1453, L1894, L2079
  - `world` L581
  - `shell` L718, L789, L647
  - `ui-fixes` L381, L592, L1024, L1866, L3140
  - `transport` L574, L610, L850
  - `wave2` L752; `wave3` L233, L752; `wave5` L232, L618
  - `content` L484, L572
  - `integration` L324
  - `upgrade`: 12 tests with `rulesVersion, 8` pins → `RULES_VERSION` (L171, L230, L267, L321, L428, L562, L632, L686, L727, L812, L995 and L1060 groups), plus L553
  - `mobile` L54
- **Docs:** README People (the card, the words, the feed lines quoted), `/recap`, "Updating an older game" (row 9, what does not reach old saves, 1156), "Editing the town" (all new fields), "Running the tests" (the new suites, the sim, the eval, the probe), "Deliberate deviations" (SPEC §3, acceptance [4]); `docs/notes/ui.md`, `prompts.md`, `content.md`; fix `transport.md:181` and the SPEC 371 note; BUILD_PLAN (`when` keys, Game state, the sub-bullet).
- **Acceptance (owner):** update an old save. Every person's "Likes you" word matches the old meter, and anyone who was at 50 with a good memory still tells their secret. On a 375 phone, open Hollis's card: there is no horizontal scroll, and More shows five words. `node tests/relationships-sim.cjs confidant --assert` passes.
- **Size:** 740 + 270 sim + 220 eval / 120 / 640; ≈ 40 edited (after the delta: the contempt cue variant, the hidden-reason wording, the brawler band, the eval's romantic set; §19.6, §19.9).

### B1, wave 31: "The town is a graph" (one hop)

- **Scope:** ties (relations plus `TOWN_DATA.ties`); TIE_KINDS and FACTORS with role limits; propagation at event time (witness plus tie); absent victims through a witness; hearsay by tie class with the new household rule; step i; expiry; the collapsed overnight line; hidden ties with no-name narrator reasons and named-act cards; the arrest route; Upgrade 10; RULES_VERSION 10; Debug ties and hearsay.
- **Tests added:** `tests/wave31-town-ties.test.cjs`:
  - `ties from both sides of every relation, overridden or added by hand`
  - `Mavis hears overnight; Marcus's department by the next morning; a friend at the next meeting or in two days`
  - `the motel and the trailer park are not households`
  - `police and clergy never warm when a man they dislike is beaten`
  - `the arrest turns the family against the officer`
  - `one line overnight`
  - `rules version 10 spreads nothing old`
  - Examples 1, 4, 5 (B parts) and 9.
- **Tests edited (≈ 5):** `world` L531; `playtest` L74; `engine-world-fixes` L595; `upgrade` L553 (the chain); `transport` L850.
- **Size:** 520 / 80 / 450.

### B2, wave 32: "Ties that change"

- **Scope:** `exposed` with `SECRET_TIES` (the tie change; Y learns who told, by tie class); `badmouthed`/`vouched_for` (+2 wire words; a description-only schema change, so **the probe script is re-run** as a precaution); `tieDelta`/`propagate` (template third-party edited in place again); BETWEEN THEM (known ties); tie words on the card.
- **Tests added:** `tests/wave32-ties-change.test.cjs`, with examples 2 and 11 (B parts).
- **Tests edited (≈ 3):** `content` L409; `engine-world-fixes` L724; `transport` L762/L805.
- **Size:** 380 / 110 / 350.

### B3, wave 33 (optional, after a playtest): "Tuning"

- **Scope:** one tuning pass of EVENTS, AXIS_EFFECTS and GATES, **only after the labelled eval passes**, with the simulator's bands holding; report templates that name protectors in more words; household-lite lines.
- **Tests added:** `tests/wave33-rel-tuning.test.cjs`.
- **Size:** 200 / 60 / 250.

### Totals (honest)

| Tier | Code | Tooling | Content + validator | New test lines | Existing tests edited |
|---|---|---|---|---|---|
| A (26-30) | ≈ 3,810 | ≈ 680 (probe, sim, eval, export) | ≈ 490 | ≈ 3,630 | **≈ 98** |
| B (31-33) | ≈ 1,110 | 0 | ≈ 250 | ≈ 1,060 | ≈ 8 |
| **All** | **≈ 4,920** | **≈ 680** | **≈ 740** | **≈ 4,690** | **≈ 106** |

These totals include the delta review (§19.9). Before it they were A 3,200 / 620 / 400 / 2,940 / 96.

The design-v2 estimate for A is 2,500-3,000 lines "in all". This plan's A code alone is about 3,810, because it keeps the legacy paths, the load fill, the exact A1, the yield rule and the migration pre-pass, and because of the delta items. The edited-test count matches the audit's ~100.

---

## 17. Red-team implementation findings, answered

| Item | Where answered |
|---|---|
| (a) The op-by-op conversion of about 40 `attitudeDelta` sites, reconciled with Appendix F and the 22 engine events | §4.6 (all 41 sites + `meetingRep` + legacy; the Appendix F mislabel resolved in §1.5); §4.1 (the 22); §4.3 (legacy yields) |
| (b) `Rng.create` sub-streams keyed by (seed, npcId, day); the d20 kept when compliance skips a roll | §11.4 (`Rel.rng`, `Dice.burn`, and a draw-for-draw test in A2); §11.2 (which plants stay on the shared stream) |
| (c) Turn stamps on `settled`, the tie log, owed entries and hearsay | §2.2-2.3 and §3.3 (also leverage `since`/`log`/`uses`/`knownBy`, `known.secrets`, `rel.asks`, `rel.today`, `rel.recent`); what stays (`everyday`, `fix`, `rel.days`) is documented |
| (d) A migration pre-pass for own-memory strings; trust seeded from the old attitude; the optional Haiku re-read | §13.1 steps 3-7 (`LEGACY_ENGINE_TEXTS` frozen from `56e69f5`, built from content templates plus code writers; seeded trust plus the secret floor); the re-read as owner decision §18 |
| (e) The cached-block budget, `KNOWLEDGE`, the validator at 1919 and 1946 | §10.3-10.4. **Measured: +300 with the full note; +250 with the trimmed one (12,921 / 13,000).** The new split gives counts identical to today's. |
| (f) `MEMORY_RULES` forked | §5.3 (`MEMORY_WORDS` for the bookkeeper; `MEMORY_RULES` unchanged for `SYSTEM.memories`, with comments at both) |
| (g) The test estimate rebased to about 100 | §16 per wave and the appendix: ≈ 96 in A, ≈ 8 in B |
| F2 (minors) | §6, permanent test §6.5 |
| F4 (editor) | §2.6, §14.2 |
| F8 (hearsay) | §11.3 |
| F10 "A depends on B" | Tier A uses relation labels for guardians and protectors (`Rel.guardiansOf`, `Rel.protectorOf`); no ties are needed |

---

## 18. Risks and decisions for the owner

### 18.1 Decisions (recommendation first)

1. **SPEC acceptance [4]** (`tests/acceptance.test.cjs` L198). **Keep SPEC's title and its three behaviours.**
   - Change `x.attitude − 45` to "three insults compound: -10, -15, -22 (×pride), at least 45 down".
   - Change `[2, 3]` to `[3]`: one merged memory.
   - The "keep insulting until -60" loop and the mock greeting (through the alias) stand. The final "hostile" check also asserts that the stance is "hates you" with its reason.
   - Design-v2's "three insults to someone at pride +2, or four to anyone" becomes an extra test, not a rewrite of [4].
2. **Do leverage records reach old saves?** Recommended:
   - informant loose ends → yes (the obligation is a recorded fact);
   - heard rumours marked `leverageOver` → yes, `aware: false`;
   - secrets shown in earlier narrator packets → no (nothing records them).
3. **The labelled-eval pass bar.** Recommended: neighbour confusions < 20%, exact ≥ 75%, invented ≤ 5%, and no tuning before the first pass.
4. **The optional re-read before typing.** Recommended: offer re-running version 2 "Memories that matter" (no new schema) as a Settings option during the version 9 update. A new `type_memories` call is not recommended.
5. **What a relationship `/fact` buys** (§9.6: owed +1, knows 30, trust +15, liking +10, into `start`, never spark or fear). Recommended as written. The design names four things without the mapping.
6. **The eligibility list** (settled by the delta, §19.5): it ships with Appendix E's 12 adults. Curtis's place on it is decision §19.8-4.
7. **`stole_from` from a clean, unseen success** (§1.5). Recommended: no immediate event; a later "found out" from the bookkeeper, after a logged steal.
8. **The new obligation status `lapsed`** for the standoff and for coming clean. Recommended: yes. The Journal says "Dropped".
9. **Carried forward from v1:**
   - `attitudeDelta` into everyday;
   - editor values never fade (in `fix`);
   - `/rewind` takes back remembered feelings;
   - the unfired built-in council gets the trust branches through Upgrade 9;
   - content names `liking`/`knows`;
   - knockDown witnesses at weight 2 (now: a lighter copy).
10. **Settled by v2, no longer open:** the trust cap (dropped), the council fear branch (out), the faction-loyalty blend (dropped), caching the bookkeeper prompt (not needed; the cost is small).

### 18.2 Risks

| Risk | Likelihood / impact | Guard |
|---|---|---|
| **Coercion is rewarded** (leverage or fear buys sexual compliance; red-team blocker N1) | low after §19.1 / **severe** | `romantic` turns off compliance and backed asks for everyone; refusal, `blackmailed` + `crossed`, a report, reputation -10; permanent tests for adults and minors |
| **False positives against players** (a kind word to Kaylee costs the full consequence row) | low after §19.3 / high | The narrator line is always on; the heavy row needs a named target plus a second signal; the eval measures recall at ≥ 98% and false friends |
| **The minor guard has a hole** (a path that warms a minor, gives fear compliance, or sends a romance cue) | low / **severe** | Decided before narration, overridden after, refused at every writer from A1, re-checked in every packet builder and the card. The permanent `tests/relationships.test.cjs` includes a 300-string fuzz and a roster pin. Any failure blocks the suite. |
| **The live probe can't be run, or fails** (now two schemas: 34/3 and parser 14) | low / high | Both are smaller or near-identical to shapes known to pass. Only A3 waits. If `record_changes` is refused, the 11-field core still records events. If the parser is refused, ship A3 without `romantic` **only after** a fallback guard that treats any Say containing `MOCK_ROMANCE` words aimed at a minor as romantic. Recommended: wait for the probe instead. |
| **Test churn** (≈ 104 edited) | certain / medium | A1 edits none. Each wave lists its edits. The legacy path plus the yield rule keep about 25 queued-legacy call sites unchanged. |
| **Classifier accuracy** (22 words; neighbour confusion) | medium / medium | 22 of 41 events are engine-derived. Preconditions catch staged events. The eval gates any tuning. The Debug export builds the set. |
| **The cached-block budget** (≈ 48 tokens left after A5, with the fade-to-black rule and the hidden-reason wording, §19.7) | medium / medium | Everything is measured. Anything later must come out of the 48, or shorten two examples (the design's own fallback). The api test fails at once if it is exceeded. |
| **Leverage balance** (a blackmail money pump; frustration over "Wade makes it go away") | medium / medium | Demands are capped at $100 × weight and `canRaise`. Repeat uses compound harm. Report seeds spend NPC holders' leverage. The simulator gets a fourth playstyle (blackmailer) in B3 if the playtest shows abuse. |
| **Rng drift in seeded tests** | low / medium | Sub-streams for every new draw; the burned d20; the draw-for-draw test in A2. |
| **Old saves** | medium / medium | The load fill keeps liking exact. Upgrade 9 refuses any write that moves liking, recognises the engine's own strings first, seeds trust, and floors open secrets. What does not reach old saves is documented. |
| **The design's arithmetic against the code** in the 13 executable examples | medium / low | ±2 tolerance; the code's number is pinned and the design doc corrected in the same wave. |
| **Size** (≈ 3,810 lines of A code against the design's 2,500-3,000 "in all") | certain / medium | Five shippable waves; the tooling is separate; B can wait. |
| **The two separately queued bug fixes** (the captured memory, the editor strip) | — / low | **Not prerequisites.** A2 replaces the captured memory with `noted`/own. A5's editor round-trip includes `day`/`act`. The migration's pre-pass and day fallback tolerate both, before or after the fixes. |
| **Save size** (typed memories, leverage, `rel.asks`; B ties) | low / low | ≈ 250 KB worst case per snapshot. Check the IndexedDB undo stack limit in A1. Cap hearsay at 60, `asks` at 8 and `recent` at 4. |

---

## 19. Delta review items (design v3)

These items come from the red team's delta review of the design's second version (`review.md` part two, Part 3, approved with 10 changes). The design's third version (`design.md` in this folder) carries the final wording; this section is the implementation. **Where it contradicts an earlier section of this plan, this section wins**, and the earlier text points here.

### 19.1 Coercion is never rewarded (blocker; A3 for fear, A4 for leverage)

- **The rule.** When `ctx.action.romantic` is set, both `Rel.complies(n, action)` and the backed-ask path (`Rel.difficultyFloor`, `Rel.leverageAnswer`) **return false or "refuses" for everyone**, adult or minor. The ask rolls as an ordinary ask, and its outcome is overridden to a refusal: **the d20 is burned**, not used.
- **What it costs the player, applied as engine events at resolve:**
  - `blackmailed` on the target, with `leverageId` when a record was named; without one, the track row only;
  - plus `crossed` at full (W -12, T -12, weight 3);
  - a report seed to `Rel.protectorOf(n)` on the `Rel.rng('coercion', npcId, day)` sub-stream;
  - `reputationDelta town -10` **outside** the ±5 cap.
  - For a minor this sits on top of the §6 consequences (§19.3), and `crossed` goes to the guardians.
- **The per-turn narrator line:** `<Name> refuses: <she> won't be pushed into that, and <she> leaves / calls for <protector>.` (about 20 tokens), via `Rel.romanceTurn`.
- **Ordering.** `Rel.romanceTurn` runs before `resolve`. Pipeline.resolve checks `ctx.romance.coercion` first, so neither the fear ceiling (A2) nor a backed ask (A4) can fire.
- **Tests** (in `tests/relationships.test.cjs`, so they are permanent):
  - `a romantic ask is never backed and never obeyed out of fear: "sleep with me or Bell hears about your tapes" to Glenda, and the same to an adult at fear 50, both refuse with the die still drawn, cost blackmail and crossed, plant a report and drop the town 10`
  - the same for Micah, with the guardians' consequences;
  - the parse fuzz (step 10) gains romantic plus intimidate plus `lev_` combinations.

### 19.2 `intimate` moves into tier A (A4)

- **The gates,** all of them, checked in `Rel.romanceTurn` before narration on a `romantic` turn whose input asks for more than a flirt. That is the code phrase list `INTIMATE_ASK` (/\b(spend the night|come (up|back) (to|with)|bed|sleep with|stay over|my room|your place)\b/i), or the parser's `romantic` plus a destination that is a home or a motel room:
  - both adults, the player included;
  - `Rel.eligible`, and the flirt welcome holds;
  - spark ≥ 50, liking ≥ 40, trust ≥ 30, knows ≥ 30;
  - not coercion (§19.1).
- **The per-turn line:**
  - gates pass: `<Name> says yes; fade to black, nothing explicit; pick up afterwards.`
  - gates fail: `<Name>: not tonight; <she> says so kindly.` (a flirt-class answer: no harm).
- **What it records:** engine `intimate`, design row (W +10, T +5, K +15, S +15), weight 3, **scar** class, no reputation. Its spark part fades on the scar clock. The bookkeeper's `intimate` is still dropped (engine-only).
- **The fade-to-black rule** goes into the cached style block **in A3** (it is the safety wave, and SPEC rule 7 is absent from the prompt today): `Intimate scenes fade to black before anything explicit: the next line is afterwards.` That is **+18 estimated tokens**.
- **C keeps** only "seeing you", "old flame", lasting jealousy and households.
- **Tests** (`tests/wave29-rel-hold.test.cjs`):
  - `fade to black: with every gate met the narrator is told yes and to fade to black, a scar-class memory is kept, nothing explicit is asked for; one gate short and she says not tonight, kindly; never with anyone under 18 on either side`
  - the under-18 test (step 9) adds an intimate ask by a 16-year-old player.

### 19.3 The minor guard, tightened (A3)

- **The narrator line whenever a minor is present.** For each minor in PRESENT, every turn, regardless of the flag: `Kaylee Pittman is 16: any romantic or sexual advance is unwelcome and alarming; …` This is per turn and uncached, about 25 tokens a minor present. That takes the parser out of the narration safety path.
- **Heavy consequences need corroboration.** The full unwanted-advance row, the guardians' `crossed`, the reports and reputation -10 need **both**:
  1. the minor is a **named target** (`ctx.speech.to === minorId`, or `minorId ∈ action.targets`; never Say to everyone); and
  2. a **second signal**:
     - a bookkeeper `flirted`, `rebuffed` or `intimate` naming that minor (overridden as before); or
     - a hit on the code phrase list `MINOR_ROMANCE_PHRASES` over the input (flirt, kiss, date, "what time you get off", wink, pet names used romantically, "you're pretty", "come sit with me", …; kept beside `MOCK_ROMANCE`, and the eval tunes it).
- **A bare flag** (or a phrase alone, or Say to everyone) gives the narrator instruction plus a **light row**: weight-1 `noted`-class memory "said something that made me uncomfortable", W -3, K +2. There are no guardians, reports or reputation, and it is never a grudge.
- **Minor anchors.** `Rel.isMinor` takes the minimum over:
  - the **live `TOWN_DATA` age by id** (`castTown()`, pattern 3, for the built-in town);
  - the `State.town` age;
  - the current age;
  - the tags `teen`/`teenager`.

  It **fails closed**: a record with no age at all whose role matches /\b(teen\|teenager\|high school\|student\|schoolgirl\|schoolboy\|kid)\b/ is a minor.
- **Guardians.** `Rel.guardiansOf` takes the parents and grandparents in town (free, alive, here). Else another adult with a family relation label, or a household tie (shared home and family). Else **Chief Bell alone**.
- **The police head.** `Rel.policeHead()` is the in-town police head if free and here. Else content **`TOWN_DATA.policeFallback`** (the county sheriff record from `docs/CAST.md`'s Elsewhere list; a report to an away record still lands as a memory, as `addMemory` does for the away today, 9559). Else an `addNews` line: "Word reached the county about what happened at <place>." The validator whitelists `policeFallback` (it must be an NPC, presence elsewhere).
- **The eval** (§15.3) gains **about 50 labelled romantic lines**: euphemism, Do mode ("ask what time she gets off", "I wink at Micah"), and false friends ("thanks, sweetheart", "you look lovely today" said to everyone with Kaylee there). The **recall target is ≥ 98% for lines aimed at minors**, measured on the parser's `romantic` and on the phrase list separately and together. The report prints both, and the phrase list is the backstop.
- **Tests** (`relationships.test.cjs` gains, per red-team N11):
  - `an unflagged kind remark to Kaylee ("thanks, sweetheart") and a compliment to Darlene said to everyone with Kaylee there cost nothing heavy: the line to the narrator, a light weight-1 memory at most`
  - `an import that strips the town copy's age, the current age and the tags still finds Kaylee a minor from the live town`
  - `with Tammy gone, Austin's guardian is another adult of his family, else Chief Bell; with the chief arrested, the county sheriff hears, else the town does`
  - the step-8 regex gains `flirts back|lights up when|stands close|for one reason|looks twice|open to it`.

### 19.4 Leverage (A4)

| Item | Implementation |
|---|---|
| `learned_secret` needs the narration to show it | precondition: `known.secrets[X]` **and** the turn's narration contains at least 2 of X's content **`leverageKeys`** (2-3 short phrases a secret: "garage account", "tapes", "cash book"; case-insensitive whole words). The E rumour path checks the rumour text. NPC field `leverageKeys: [str]`, validator-whitelisted; each secret with a `secretWeight` must have 2 or more. |
| A backed ask must reference the record | `normaliseParse` keeps a `lev_` id in `aboutIds` only when the input overlaps the record's text (2 or more content words, stopwords removed) or matches `THREAT_PHRASES` (/\b(or (else\|i tell\|everyone hears\|bell hears)\|unless you\|i know about\|keep (it\|this) quiet\|what i know)\b/i). Otherwise it is stripped, with a debug line "lev id ignored: the words did not use it", and the ask is ordinary. This stops accidental no-roll threats. |
| `paid` is terminal | a demand on a `paid` record is refused as a demand: the engine records `threatened_to_tell` (W -15, T -20, F +20), no money moves, the LEVERAGE line says "<Name> says they already paid, and won't again". The player pays for the attempt. |
| `canRaise` | the default is **$100** (not $200); content may raise it for at most three people (the validator counts `canRaise > 100` ≤ 3). The demand cap is `min(100 × weight, canRaise)`. |
| `paid_silence` replaces `paid_back` | `State.settle` for kind `blackmail` runs **no** `paid_back`, only `paid_silence`. **Engine-against-engine dedupe:** within one apply, the first engine money-class event for a person wins, and later ones of the same class for that person are dropped with a debug line (`ledger.engineClasses` checked for engine sources too). |
| No money from a target with a pending demand | `State.apply` (model source) refuses a positive `goldDelta` when anyone present has a pending demand to the player (`demand` with no `paid`), with the reason "the payment arrives when they bring it". The payment seed's own `playerGold` is the engine's and is not refused. |
| The LEVERAGE line | `LEVERAGE: Hollis Byrd agrees to pay $300 by tomorrow evening; he pays nothing now.` |
| The d20 on backed asks | always drawn (`Dice.burn`) when the ask skips the roll; a weight-1 "easy" ask rolls normally |
| The answers (replacing the pride rule in §8.3) | **tough** (Wade, Colt, Boyd, Leon, Dwight): refuses, and a **violence grudge** is planted now. **Hard but not tough** (Carter, Marcus, Loretta, Tammy, Nikki, Trent): refuses, and a **gossip grudge or a protector report** (the report when they have a protector who is not the player's target, else gossip). **Everyone else complies.** All on sub-streams. |
| `caught_you_at` (E) | only when the act had **at most one witness** besides the victim (that witness is the holder); the place is not public, or the act made no news; **never violence** (it is already a memory and news). One record per act (key: turn and action). `mattersTo` by kind: **theft** → the victim; **a crime** (sneaking into a place, a search) → `Rel.policeHead()`; **a lie** → nobody (`[]`, so it can't be told to anyone in particular). |
| The standoff | while both records are held (the player's aware record over X, and X's over the player; status held, used or paid), **X's grudge and report checks are suppressed**. Example 12's gossip grudge becomes "suppressed", and the standoff stands until one record is spent or void. |
| Telling the police (`whenTold`) | a per-secret content hook on the NPC: `whenTold: { memory?: text, crime?: bool }`. **The default:** when the secret reaches a police member in `mattersTo` (`exposed` to them, or `told_anyway` to them), that member gets a weight-3 `noted` memory from the template ("knows what {npc} has been doing"). For a crime, an **inquiry seed** (`origin.kind: 'inquiry'`; `SEED_ORIGINS` gains it; `Rel.rng('inquiry', npcId, day)`) fires in 1-2 days with `clockAdjust fac_police +1` and town news. The validator whitelists `whenTold`. |
| Hidden protector ties (A2, with reports) | content `protector` may be `{ npcId, hidden: true }` (Hollis → Wade). A report delivered that way writes the protector's memory with `secondhand.hidden: true`. The card says "Cooler since <the act>, Day N. Hasn't said why."; the narrator gets no cause and no name. In B1 the flag is read from the tie instead. |
| `exposed` about them | counts as **harm** for "hates you" (with a weight-3 memory), and in the contempt check (§19.6) |

**Tests** (`tests/wave29-rel-hold.test.cjs`):

- `leverage needs the story to show it: the secret in the packet but not in the narration is refused; two of its keys in the narration make the record`
- `a threat must use what the player knows: an ask of Hollis with no words about the books ignores the record and rolls`
- `paid is final: a second demand costs the player and moves no money; a target owing a demand hands over nothing until the seed brings it`
- `the hard but not tough refuse and talk or report; the tough answer with violence; everyone else agrees to pay tomorrow and pays nothing now`
- `a lie Trent caught in the cab is a record that matters to nobody; a bar fight makes no record at all`
- `while each has something on the other, neither reports nor holds a grudge`
- `telling the chief about Hollis's books gives Marcus a serious memory and an inquiry that moves the police clock`
- `the blackmail paid counts once, as silence`

### 19.5 Spark (A4)

- **Caring without the flirts.** `Rel.recompute` tracks `wRom` = Σ `rem_w` over romance-class memories (`flirted`, `rebuffed`, `intimate`) in the cache. The spark statuses' caring thresholds (liking 25 / 50) read **`w − wRom`**. The stance still reads `w`.
- **"Using you"** needs earned distrust or the flag:
  - earned distrust: an unsettled first-hand memory of class harm or honesty with `d.t < 0`;
  - or `mercenary`.
  - Otherwise the status is **"wants you"** (design-v3 wording; "wants you, doesn't trust you" if the owner prefers, §19.8).
- **The status feed line once per person per 7 days.** `rel.sparkSeen = { status, day }`; the cache holds the current status with its own hysteresis (each status's thresholds leave 5 back). A re-entry inside 7 days prints nothing.
- **The eligibility list ships with the 12 adults of Appendix E** (this replaces "ships empty" in §7 and decision §18.1-6). The validator still refuses a minor or a teen tag on it.
- **The first unwelcome flirt per person** costs W -3 (`rel.unwelcomeOnce = true` after), later ones W -6.
- **Tests:**
  - `flirting alone never makes someone sweet on you: the flirts' own warmth doesn't count toward caring`
  - `Jodie, guarded from the start and wronged by nobody, wants you; she is never using you`
  - `a status line prints once a week at most`
  - `the first unwelcome flirt costs a little, the next ones more`

### 19.6 Contempt, dynamics and tooling

- **Contempt** is a **cue variant on "against you"** ("talks past you"), not a 13th phrase. The condition (A5): liking ≤ -25, fear < 10, and the top negative memories are words or honesty (an `exposed` about them counts as harm, so it never reads as contempt).
- **A `beat_down` on a tough person** (Wade, Colt, Boyd, Leon, Dwight) plants a **violence grudge at once, whatever the liking** (A2). It is planted at `knockDown` time on the `Rel.rng('toughAnswer', npcId, day)` sub-stream, subject to the 7-day feeling cooldown.
- **The brawler simulator band** (A5, `tests/relationships-sim.cjs`): fights on Days 2, 4 and 6 only. The recovery band is design-v3's (bystanders' liking back within its stated distance of start by its stated day). The 8-day CI guard checks the Day 2-6 part.
- **Sub-streams.** Every new seed (report, price, tell, owed favour, **inquiry**, the tough answer, coercion reports) and every backed, fear-ceilinged or coercion-refused ask draws from `Rel.rng(kind, npcId, day)`, with the d20 kept (§11.4). The draw-for-draw test in A2 gains an inquiry and a coercion turn in A4.
- **The validator** (1919, 1946) and **`Style.KNOWLEDGE`** are rewritten with the example turns in A5 (§10.3-10.4). The split regex is unchanged by this delta.

### 19.7 The cached block, re-measured

The measure is the api test's estimator (words × 1.4) against the draft of the rewritten entries. The casual set has **9** PRESENT person entries; design-v3 says "ten", but there are 9 people across the 8 casual examples.

| Item | Tokens | Wave |
|---|---|---|
| Casual examples (9 entries, with a spark tag and "open to a flirt" on Dot, a leverage tag on Charlene) | +168 | A5 |
| `Style.KNOWLEDGE` | +8 | A5 |
| The trimmed format note | +74 | A5 |
| **The hidden-reason wording**: `A reason "of their own" is never hinted at.` | +13 | A5 |
| **The fade-to-black rule** | +18 | **A3** |
| **Total** | **+281 of 330 → 12,952 / 13,000 (48 left)** | |

This is inside the red team's expected 220-320. The per-turn lines (the minor line, coercion, intimate, LEVERAGE) are uncached. Nothing more goes into the cached block without shortening two example entries (the fallback).

### 19.8 New owner decisions from the delta

1. **The corroboration threshold for minors.** Recommended as §19.3: a named target plus one second signal. A stricter variant (both a bookkeeper romance event and a phrase hit) would miss the euphemisms the eval is built to measure.
2. **Is blackmail meant to fund the game?** Recommended: no. `canRaise` defaults to $100 and three people at most above it. With these rules a full pass yields at most about $900.
3. **What telling the police does.** Recommended: the `whenTold` default (a weight-3 memory, and an inquiry seed for crimes).
4. **Curtis on the eligibility list.** He is "separated", and the red team flags him against "married people left off". Recommended: keep him with `faithful: false`, as Appendix E has it, and note it in `docs/notes/content.md`.
5. **The "using you" fallback wording:** "wants you" or "wants you, doesn't trust you". Recommended: "wants you" (one tag, and the card's trust word says the rest).

### 19.9 What this changes in the waves

| Wave | What it adds (§) | Code | Content + validator | New test lines | Existing tests edited |
|---|---|---|---|---|---|
| A2 | the hidden protector ties, the tough answer to a beat-down, `rescued` excluding danger the player caused (the danger source is not the player: no attack by the player on the aggressor or the victim this scene, not a fate the player's action caused) | 650 → **710** | 90 → **100** | 560 → **610** | 27 → 27 |
| A3 | coercion (the fear path), the minor line whenever present, corroboration with the light row, the anchors with fail-closed, guardian and police fallbacks, the stricter `kept_word` (a **named asker** present this turn, not the confider, named in the narration, and a `they_confided` at least a day old; else `confided`), the fade-to-black rule | 600 → **790** | 40 → **50** | 650 → **920** | 24 → **25** (`api` L171: the budget is re-checked, not edited; `pipeline` L2061 if its packet pins the line count with Kaylee present) |
| A4 | `intimate`, coercion (the leverage path), §19.4 in full, §19.5 in full | 700 → **1,020** | 140 → **210** (leverage keys for about 21 secrets, `whenTold`, the 12-person list, protectors `hidden`) | 650 → **980** | 5 → **6** (`content` L168 again for `paid_silence` in place of `paid_back`) |
| A5 | the contempt cue variant, the hidden-reason wording in the note, the brawler band, the eval's romantic set with the recall report | 700 → **740**; tooling 430 → **490** | 120 → 120 | 600 → **640** | 40 → 40 |
| B1 | the hidden protector flag read from ties | 520 → 530 | — | 450 → 460 | 5 → 5 |

**The totals become:**

| Tier | Code | Tooling | Content + validator | New test lines | Existing tests edited |
|---|---|---|---|---|---|
| A (26-30) | ≈ 3,200 → **≈ 3,810** | ≈ 620 → **≈ 680** | ≈ 400 → **≈ 490** | ≈ 2,940 → **≈ 3,630** | ≈ 96 → **≈ 98** |
| B (31-33) | ≈ 1,100 → **≈ 1,110** | 0 | ≈ 250 | ≈ 1,050 → **≈ 1,060** | ≈ 8 |
| **All** | **≈ 4,920** | **≈ 680** | **≈ 740** | **≈ 4,690** | **≈ 106** |

**Waves that grew:**

- A4 grew most: +320 code, +330 new test lines, +70 content.
- A3: +190 code, +270 test lines.
- A2: +60 code.
- A5: +40 code, +60 tooling.

The live probe still gates **A3 only**. The schema shapes are unchanged by the delta: `romantic` stays a boolean, and `intimate` and coercion need no new property.

---

## Appendix: existing tests edited, by wave (≈ 106 with the delta review: A3 +1, A4 +1; §19.9)

| File | A2 | A3 | A4 | A5 | B |
|---|---|---|---|---|---|
| acceptance | — | [4] | — | — | — |
| state | L678 | L1029 | L322 | — | — |
| world | L699 | L312, L367 | — | L581 | L531 |
| engine-world-fixes | L595, L652, L688, L724 | — | — | — | L595, L724 |
| engine-state-fixes | L844 | L578 | L148, L256 | — | — |
| pipeline | L241, L251, L279 | L633 | — | L574, L1453, L1894, L2079 | — |
| prompts-fixes | L444 | L383, L419, L444 | — | L96, L331 | — |
| transport-fixes | L473, L488, L645 | helpers, L678 | — | L574, L610, L850 | L762, L805, L850 |
| api | — | helpers, L150, L316 | — | — | — |
| wave17-grammar | — | L63, L82, L107, L131 | — | — | — |
| ui-fixes | — | — | — | L381, L592, L1024, L1866, L3140 | — |
| shell | — | — | — | L647, L718, L789 | — |
| content | L168, L409 | — | L168 | L484, L572 | L409 |
| integration | — | — | — | L324 | — |
| wave2 | — | — | L113 | L752 | — |
| wave3 | — | L733 | — | L233, L752 | — |
| wave4 | L126, L493 | L298 | — | — | — |
| wave5 | L81, L298, L346 | L563 | — | L232, L618 | — |
| wave6 | L121, L133, L146 | — | — | — | — |
| wave22 | L192 | — | — | — | — |
| upgrade | — | — | — | 12 version pins, L553 | L553 |
| playtest | L74, L356 | L74 | — | — | L74 |
| mobile | — | — | — | L54 | — |
| **Count** | **≈ 27** | **≈ 25** | **≈ 6** | **≈ 40** | **≈ 8** |

**Checked and expected unchanged:**

- the card suites (`d` overrides keep -20, -2, +1, -5, and trust > -40 holds for their setups);
- `wave3` L813 and `wave4` L529 (grudge kinds from hand-set legacy memories);
- `wave2` L28/L781, `wave3` L422-L447, `wave4` L59 (gifts and asks through the yield rule; Hollis-based ones are listed);
- `engine-state` L466 (`meetingRep`);
- `state` L117 and L183;
- `api` L171 (it passes at about 12,921).
