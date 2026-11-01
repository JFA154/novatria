# People who remember: the relationship system plan

1 Nov 2026 · a plan being built. **Waves 26 to 29 have landed; wave 28's
live grammar probe is still to run** (`ANTHROPIC_API_KEY=… node
tests/probe-grammar.cjs`). A1 (wave
26, "The tracks under the number"): the `Rel` module, six tracks on every
person under the `attitude` alias, `socialEvent`, `relSet` and `relDay`, with
no number the game shows or stores changed (`docs/notes/engine-state.md`,
Wave 26; tests: `tests/wave26-rel-tracks.test.cjs`). A2 (wave 27, "What the
engine sees, people remember for what it was"): the engine's typed events,
witness copies, dedupe and the legacy yield, fading in place of the drift,
the 41 `attitudeDelta` sites converted, the wave's gates, reports to
protectors, public reputation and the feared tier (`docs/notes/
engine-state.md` and `engine-world.md`, Wave 27; tests:
`tests/wave27-rel-engine.test.cjs`, `tests/relationships-examples.test.cjs`).
A3 (wave 28, "The bookkeeper names the act, and minors are protected before
the story is told"): `socialEvents` on the wire in place of attitude deltas
and memories (34 properties, three enums; the core 11), `romantic` on the
parse (14), the model's rules (presence, preconditions, caps, settlement by
words), the trust gates and favours by trust, the whole minor rule and
coercion, fade to black, `start` and `axes` in the content, and the Debug
export of bookkeeper turns (`docs/notes/prompts.md`, `transport.md`,
`content.md`, `engine-state.md`, `engine-world.md`, Wave 28; tests:
`tests/wave28-social-events.test.cjs`, `tests/relationships.test.cjs`).
A4 (wave 29, "What people hold: wanting, leverage and favours"): spark for
the shipped twelve-adult romance list with welcome decided before
narration, statuses with hysteresis on caring liking, the gated night
together (fade to black), leverage in full (secrets shown, keys in the
narration, caught at it, the informant, backed asks and their answers, the
payment seed, the obligation link, the standoff, the police bar, tell and
price, `whenTold`), and favours owed both ways (`docs/notes/prompts.md`,
`transport.md`, `content.md`, `engine-state.md`, `engine-world.md`, Wave
29; tests: `tests/wave29-rel-hold.test.cjs`, examples 2, 6, 8, 10, 11, 12
and 14). A5 and B1 to B3 are still plans.
It was written on the branch `claude/magical-dijkstra-wvs3pi` against `main`
at `56e69f5`, and every line reference in it and in its appendices is to that
commit (wave 26 put `Rel` after State, so references below `index.html:12163`
have moved down).

The owner's brief: "plan a complicated relationship system that isn't 2
dimensional, what we have now is very basic." Then, before the write-up: spark
(attraction) in the first build, wanting kept apart from caring, leverage (who
has something on whom) as its own record, an airtight guard for anyone under
18, and a plain list of what the design still does not model.

**How this was made.** Four passes, each by its own agent, each read and
reconciled here: an audit of the code as it stands (`docs/relationships/audit.md`),
a design (`docs/relationships/design.md`, its second version), a red-team
review of the first design with eighteen ranked findings
(`docs/relationships/review.md`), and an engineering plan that maps the
design onto the modules, the saves, the tests and the docs
(`docs/relationships/integration.md`, its second version). The appendices
carry the detail: the full event table, every threshold, the thirteen worked
examples with their arithmetic, the per-wave list of tests that change. This
page is the plan. **Where an appendix and this page disagree, this page wins**;
the known disagreements are listed at the end.

---

## 1. What is thin today

The audit (appendix, 15-line summary at its top) found one number doing
everything:

- **Each person holds one integer,** `attitude` (-100..100, toward the
  player), and a list of up to 12 `memories` `{ turn, day, text, weight 1-3 }`.
  Weight is the only intensity. Nothing stores whether a memory was good or
  bad: `/recap` guesses with a regex, and a grudge's kind is guessed from `act`
  or the words.
- **That one number gates more than 20 unrelated behaviours,** with the cuts
  scattered across Dice, State, World, Pipeline, Api, the content and the mock:
  ±2 on social rolls past ±50; a secret opens at 50; a bed at 25; a rescue at
  25; card seats above -25; Curtis deals at -10; table stakes at 0; Royce's
  vote at 15, 20 and 30; Loretta's epilogue at 40; the recap at ±5. Royce at 30
  opens the same doors whether the player is his confidant or his best customer,
  even though the council branch is written as "somebody to talk it through
  with all week".
- **The bookkeeper picks the number** ("small attitude shifts (±5 to ±15)"),
  so nearly everything lands near -10, the same for Loretta and for Mavis, and
  the scale moves when the model does. It may move anyone's attitude, present
  or not.
- **Nothing connects people.** `relations` are static labels written on both
  sides ("wife", "boss"). Hitting Dewayne does nothing to his wife Mavis unless
  a template names her. The secrets that tie the town together (Loretta and
  Royce, Tammy and Colt, Wade and Calvin Ogletree) move nobody's feelings.
  Faction-to-faction numbers are written by clocks and read by nothing.
- **Drift erases earned warmth.** Everyone moves 2 a day back to their written
  value unless a weight-3 memory is under five days old or a loose end is open,
  so a weight-2 kindness is gone in a week.
- **Secrets are only text.** A successful roll sends a secret to the narrator
  once, and then nothing remembers that the player knows it. The $200 blackmail
  loose end is a money obligation with no record of what is being held over the
  player. Desire is not stored at all.

Three constraints the audit measured, which shaped every decision below:

| Constraint | Measured | Consequence |
|---|---|---|
| The bookkeeper's `record_changes` schema sits at the API's compiled-grammar limit | 41 properties and 4 enums pass; 47 properties were refused live (wave 17) | New per-person fields go in as **strings**, not nested objects, and the schema must shrink, not grow. A live probe with the owner's key gates the wave that changes it. |
| The narrator's cached system blocks (style, town, cast) | 12,671 of the 13,000 estimated tokens `tests/api.test.cjs` allows, about **330 tokens of headroom** | Per-turn feelings stay out of the cached cast block. The rewrite of the example turns, the fade-to-black rule and the hidden-tie wording are expected to take 220 to 320 of the 330, and are measured with the test's own estimator (words × 1.4) against a draft before anything more is added. |
| Old saves keep their own town copy (`State.town`) | Event thresholds, the epilogue and drift baselines are read from the save, not from `TOWN_DATA`; grudge and favour templates are resolved by index at fire time | Threshold changes reach old games only through a migration; templates are only ever appended. |

Also found in passing and queued as two separate fixes, outside this plan: the
"captured" defeat memory at `index.html:22143` carries no `act: 'own'`, so the
captor's own act can seed a grudge against the player; and the People editor
rebuilds every memory without its `day` and `act` (`25129`, `25227`). The
migration below tolerates memories with or without those fields, so neither fix
is a prerequisite.

---

## 2. The design in one page

- **Six tracks per person, about the player:** liking and trust (-100..100);
  fear, knows-you and spark (0..100); and owed favours (a short list, net -3..+3).
  Respect is derived, not stored. Internally `w t f k s`; in content and the
  docs `liking`, `trust`, `fear`, `knows`, `spark`.
- **A leverage record per pair:** who has something on whom, what (the
  narrated words, never the `secret` field), since when, and whether it has been
  used, paid for, spent or voided. One shape in both directions. The $200
  blackmail loose end becomes one story with it.
- **A stance in twelve phrases, computed by code** from liking against trust,
  with hysteresis: "hates you", "against you", "suspicious of you", "cool to
  you", "sizing you up", "doesn't know you", "takes you at your word",
  "friendly", "fond of you, doesn't trust you", "warm to you", "in your corner",
  "loyal to you". Overrides for fear ("afraid of you", "afraid of what you
  know") only while liking is between -60 and 25. One or two tags: "using you",
  "sweet on you", "owes you big", "has something on you", "wary of your
  temper". The People tab, `/recap` and the narrator all use the same words,
  and every stance comes with its dated reasons.
- **Wanting is spark; caring is liking and trust.** One stored spark track.
  Code derives the statuses: "has noticed you", "wants you", "using you"
  (spark high, liking and trust low), "sweet on you" (spark and liking up),
  "falling for you"; "seeing you" and "old flame" wait for tier C. The
  narrator's cue says the difference: "wants you around for one reason;
  doesn't ask about your day" against "lights up when you come in; remembers
  what you told her". Intimacy fades to black, by a rule in the narrator's
  cached block, and is recorded only when code has decided, before narration,
  that both are adults and it is welcome.
- **Events, not deltas.** The bookkeeper stops sending numbers. It names what
  happened from a closed vocabulary, as strings ("npc_dewayne apologised:
  hitting me over the tow bill"). Of 41 events, code derives 22 from what it can
  already see (rolls, money handed over, who was present, obligations, the
  parse); the bookkeeper names about 22, most with a precondition code checks.
  One table turns an event into changes on the tracks, scaled by four signed
  trait axes (pride, guardedness, nerve, grudge-holding) read from each
  person's two written traits. The schema goes from 41 properties to 34.
- **Memories carry the cause.** Each keeps its event, what it did to each
  track, and how fast it fades: four classes from a two-day mood to a
  three-week scar. Making good (an apology that lands, paying back, owning up,
  getting even) softens a memory, combines with other settlements, and never
  deletes it. So the card can say why: "You told Dewayne about the garage
  money. Day 5".
- **Tier B: the town is a graph, one hop.** The 120 relation labels plus about
  40 hand-written ties (the town's secrets) become directed ties with a liking
  and a trust that can change. What the player does to someone reaches the
  people tied to them, scaled by the kind of tie and how they feel about that
  person; rivals warm. Word travels by kind of tie: spouse and household
  overnight, other family and work by the next morning, friends within two
  days. Hidden ties leave a dated, named clue and nothing else.
- **New behaviour falls out.** Someone afraid of you does small things with no
  roll, then tells their protector. Someone who likes you but doesn't trust you
  helps with small things and lies about big ones. Someone you have something
  on cannot go to the police until it is told, and then comes for you. Royce's
  vote goes to whoever he trusts enough to talk it through with, not to whoever
  bought the most beers.
- **Nobody under 18, and no player under 18, ever has spark above 0 or a
  romance cue, in any tier.** Code decides this before the narrator writes, and
  a permanent test fails if it is ever otherwise.
- **Recommendation: tier B, built as A then B.** C (fade-to-black intimacy,
  households acting as one) waits.

---

## 3. Decisions made during planning

These were made by the owner, or by the orchestrator within the owner's brief,
and the appendices follow them. They are not open.

**From the owner (1 Nov):**

1. **Spark ships in tier A,** on the same record as the other tracks, with
   `flirted` and `rebuffed`. After the delta review, `intimate` (fade to
   black) ships in A too, as an engine-gated event (section 4.3), so a
   narrated night together persists in state; only the "seeing you" and "old
   flame" statuses, lasting jealousy and households wait for tier C.
2. **One spark track, statuses derived.** Caring is already stored as liking
   and trust and explained by memories; a second "affection" number would
   duplicate them and drift away from them. Every case the owner named (wants
   you but doesn't like you; wants you and doesn't trust you; falling for you;
   devoted with no desire; an old flame who still wants you) is a spark level
   read against liking and trust, and spark and liking already fade at
   different speeds.
3. **Leverage is a full per-pair record,** not a tag derived from "knows a
   secret of yours". The design already models the NPC-to-NPC side of secrets;
   the player's side without a record would be the one asymmetry left, and the
   events are strings, so they cost no schema properties. It stands alone in
   tier A without the tie graph.
4. **The minor guard is decided before narration** and restated in full
   (section 4.5).
5. **What the tracks still don't carry** is a section of the design
   (section 4.9 here), each feeling marked derived, deferred or dropped.

**From the red-team review, adopted** (the review's required changes 1 to 7, 9,
and the design parts of 8 and 10; the implementation parts went to the
integration plan): hidden-tie reasons reach the narrator with no cause and no
name; the physical and money events are engine-derived and duplicates are
dropped by class; self-reported events need code-checkable preconditions; the
dynamics are bounded (everyday ±15, diminishing time together, hysteresis, a
fixed eviction order); fear is fixed (hard people cap at 39, the override only
between -60 and 25, per-person protectors); hearsay travels by kind of tie, not
by schedule; cues describe present demeanour only; "won't sell" expires;
settlements combine and never lock.

**The review's proposed cuts, decided:**

| Cut proposed | Decision | Why |
|---|---|---|
| The owed-favours ledger | **Kept**, with guards: owed favours plant only non-cash templates, or the $100 cash work only at liking 25 or more and trust 0 or more; the ask-back chain ends in a `crossed`-class memory, not a broken word | The owner named it as a track |
| Hop-2 propagation and the faction-loyalty blend | **Dropped** | Ornament by the review's count; one hop carries the Dewayne-to-Mavis behaviour the owner asked for. Trent's personal warmth no longer beats the Night Run's standing, and the design says so |
| BETWEEN THEM lines to the narrator | **Kept for known ties only** | About 15 tokens, and no leak once hidden ties are excluded |
| Ten trait knobs | **Replaced by four signed axes** plus a `mercenary` flag on five people (Hollis, Shayla, Tyler, Curtis, Leon) | Opposites cancel; 66 traits map cleanly |
| Knows-you as a stored track | **Kept**, fed mostly by code (turns aimed at them, time together) plus at least +2 per event | The owner named it as a track |
| The card's words grid | **Folded** behind "More"; the open card shows the stance, tags, two dated reasons and ties | The owner's taste: no stat-sheet feel |
| The 21-cell stance grid | **Cut to 12 phrases** | Near-synonyms read as noise |

**Decided by the orchestrator, recorded as decisions:** the trust cap (`20 +
knows-you`) is dropped, since it only bound on days 1 and 2 and the event
preconditions do its job; the People card may name the act behind a
hidden-tie cooling without naming the tie ("Cooler since you shamed Royce at
the counter, Day 4. Hasn't said why."); the optional council fear branch is out
of this plan (two threats would have beaten four days of honest confidences);
content-facing names are `liking` and `knows`, not "warmth" and "familiarity";
the module is `Rel`.

---

## 4. The model

The design appendix has every table. This section gives what a builder and a
reviewer need to hold in their head.

### 4.1 Tracks and how a person starts

| Track | Scale | Meaning | Starts at |
|---|---|---|---|
| Liking `w` | -100..100 | Do they enjoy you? | the written `attitude`, unchanged (Wade -10, Ray 15, Mavis -5) |
| Trust `t` | -100..100 | Will they believe you, rely on you, tell you things? Distrust is active disbelief | 5 × guardedness (-10..+10), -10 for police and smugglers; hand overrides on about four people (Boyd -40, Jodie -25, Vada -10, Leon -15) |
| Fear `f` | 0..100 | Are they afraid of what you'll do, or of what you know? Fades fast; leverage feeds part of it | 0 |
| Knows you `k` | 0..100 | How well they know you. Never fades | 0; a loose-end person 30 |
| Spark `s` | 0..100 | Do they want you? Fades unless fed; 0 for anyone not on the eligibility list | 0 |
| Owed | net -3..+3 | Favours outside the money obligations | none; Curtis shows "holding your marker" from the card-debt obligation itself |

`n.attitude` stays on the record as a stored alias of liking, rewritten on every
recompute, so `attitudeAtLeast` in old saves' town copies, the validator, the
parser packet, the card code and about a hundred tests keep reading it (section
6.1).

### 4.2 The stance

Bands with 5 points of hysteresis (enter at the edge, leave 5 back): liking
hates ≤ -60, dislikes -25, cool -6, neutral -5..5, friendly 6, warm 25, devoted
60; trust distrusts ≤ -25, unsure between, trusts ≥ 25.

| Liking \ Trust | distrusts | unsure | trusts |
|---|---|---|---|
| hates | hates you | hates you | hates you |
| dislikes | against you | against you | against you |
| cool | suspicious of you | cool to you | takes you at your word |
| neutral | suspicious of you | sizing you up (or doesn't know you: no memories and knows under 10) | takes you at your word |
| friendly | suspicious of you | friendly | friendly |
| warm | fond of you, doesn't trust you | warm to you | in your corner |
| devoted | fond of you, doesn't trust you | loyal to you (trust above 0), else warm to you | in your corner |

"Hates you" needs an unsettled weight-3 harm behind it (being `exposed` counts
as harm), else it reads "against you", and it is always shown with its reason.
When the top negative memories are words or honesty rather than harm, "against
you" keeps its phrase and takes the cue "talks past you": contempt is a cue,
not a thirteenth phrase. Overrides, checked first: fear 40
or more, only while liking is between -60 and 25, gives "afraid of what you
know" when leverage the player holds is the largest share of the fear, else
"afraid of you"; below -60 "hates you" stands with the tag "and afraid of you";
above 25 the stance stays and "wary of your temper" is added. Hard people
(nerve +1 or more, the `tough` tag, the three faction heads) never pass fear 39
and never get the override.

Tags, in order (the card shows two, the narrator one): leverage ("you have
something on each other", "has something on you", "you have something on
them"); spark status; fear ("and afraid of you", "wary of your temper"); debts
("owes you big", "owes you", "you owe them", "holding your marker"); "uneasy
around you" (fear 20 to 39).

### 4.3 Spark

Statuses, first match wins, with hysteresis, only for an eligible adult:

| Status | When | Narrator cue | Feed line |
|---|---|---|---|
| falling for you | spark 60+, liking 50+, trust 25+ | "lights up when you come in; stands close; asks where you've been" | "Jodie Strayhorn is falling for you." |
| sweet on you | spark 30+, liking 25+ | "lights up when you come in; remembers what you told her" | "Jodie Strayhorn is sweet on you." |
| using you | spark 40+, liking under 25, trust -25 or less | "wants you around for one reason; doesn't ask about your day" | "Shayla Rawls is interested. It isn't friendship." |
| wants you | spark 40+, liking under 25, trust above -25 | "flirts back; keeps it light; not sure she likes you" | "Curtis Pruett is interested." |
| has noticed you | spark 20+ | "looks twice; finds a reason to stand near you" | "Jodie Strayhorn looks at you twice." |

A welcome flirt adds 10 × the person's written `sparkRate`; time together with
someone already at spark 10 adds 2; a rebuff takes 15; an unwelcome flirt takes
5; any weight-3 harm halves it. Spark from a flirt fades on the five-day clock
with no floor. **Welcome is decided by code before the narrator writes,** from
the parser's new `romantic` field (`"flirt"`, or `"more"` for a proposal that
goes past flirting: upstairs, the night, a kiss meant to lead somewhere): they
are eligible (`TOWN_DATA.romance`, adults only), knows-you is at least their
`opensAt`, they are not at "against you" or "hates you", and they are not
`faithful`. Liking is not
required, which is how "using you" happens. The narrator is told the answer for
the turn ("Shayla Rawls is open to it: she flirts back, her own way"); the
bookkeeper's version does not count. A jealous partner who sees it takes liking
-15 and trust -10, scaled by pride.

After the delta review: the caring thresholds of the statuses (liking 25 and
50) read liking **minus** the romance-class contributions, so flirting alone
never makes "sweet on you"; "using you" needs earned distrust (a first-hand
harm or honesty memory the player caused) or the `mercenary` flag, else it
reads "wants you" with the cue "flirts back; keeps it light; doesn't trust
you"; a status prints its feed line once per person per 7 days; the first
unwelcome flirt per person costs liking 3, later ones 6; and the eligibility
list ships with the twelve adults in the design's Appendix E (Jodie, Shayla,
Travis, Curtis, Trent, Nikki, Annette, Carter, Lamar, Glenda, Colt, Tyler),
for the owner to edit. **`intimate` is in A,** engine-gated: `romantic:
"more"`, both adults (the player too; a player with no recorded age counts as
under 18 for romance), eligible, welcome, spark 50 or more, liking 40, trust
30 and knows 30. Code decides before narration and tells the
narrator "yes, and fade to black" or "not tonight; she says so kindly"; the
scene is recorded as a weight-3 scar memory with the spark, liking and knows
effects in the table. A romantic ask is **never** backed by leverage and never
gets fear's no-roll compliance, for anyone, in any tier (section 4.4).

### 4.4 Leverage

```
state.leverage = [ { id, holder: "player" | npcId, over: npcId | "player",
  about: { kind: secret | seen | loose_end, npcId }, text, weight: 1-3,
  since: { day, turn, via }, aware, playerKnows, status: held | used | paid | spent | void,
  demand, uses: [...], knownBy: [...], mattersTo: [...] } ]
```

- **Gained by the player** with `learned_secret`, only when that person's
  secret was in this turn's narrator packet (a successful social roll aimed at
  them, or the trust-40-and-knows-30 gate) **and** the narration overlaps two
  or three content-written `leverageKeys` for that secret ("garage account",
  "tapes", "cash book"), or when a true rumour marked `leverageOver` is heard.
  Anything else is refused and logged. **Gained over the player** with
  `caught_you_at`, only for an act with at most one witness that is not public
  and not in the news, never violence (a fight is already a memory and news);
  one record per act, with `mattersTo` by kind: the victim for a theft, the
  police for a crime, nobody for a lie. The informant loose end starts the game
  holding a record over the player, with `playerKnows: false`.
- **Used** with `blackmailed` (a backed ask with a price) or
  `threatened_to_tell` (without one); both are engine events read from the
  parse, and both feed the fear clock and the report seed exactly as
  `threatened` does. An ask is backed only when the player's own words
  reference the record (an overlap with its text, or a threat phrase), so a
  stray `lev_` id from the parser never makes a threat by accident. A romantic
  ask is never backed. **Discharged** with `paid_silence` (the obligation met,
  or the player's demand paid by its seed; it replaces `paid_back` for a
  blackmail obligation, so nothing counts twice) or `told_anyway` (the
  obligation's `onMiss`, a "tell" grudge, a report that spends it, or the
  player exposing a paid-for secret, which also costs an engine `broke_word`).
  `paid` is terminal for demands: a second demand on a paid record is
  `threatened_to_tell` with no money, and costs the player.
- **One story with the blackmail loose end.** The seed that names the $200
  price records `blackmailed` on the informant's side and creates
  `obl_blackmail_<npc>` as today; paying marks the record `paid` in the same
  apply (W +5, T +10, "Glenda Pryor will keep quiet."); missing is
  `told_anyway` ("Glenda Pryor told."). A standoff, when the player holds aware
  leverage over the informant and the informant is not hard, is mutual
  deterrence: neither side's grudge or report is planted while both records
  are held, and the obligation lapses with no `onMiss`: "Glenda Pryor lets it
  drop."
- **What it does.** While the player holds aware leverage over someone, their
  fear gains a derived 10 × weight (halved at trust 40, halved again once
  paid). A backed ask skips the roll at weight 2 or more, is easy at weight 1,
  normal against a hard target, and always rolls against a minor; the d20 is
  drawn either way, so the dice stream holds. The answer is decided by code at
  resolve time and told to the narrator in the present tense ("LEVERAGE:
  Hollis Byrd agrees to pay the $300 by tomorrow evening; pays nothing now"):
  tough people (Wade, Colt, Boyd, Leon, Dwight) don't pay and plant a violence
  grudge at once; hard people who are not tough (Carter, Marcus, Loretta,
  Tammy, Nikki, Trent) refuse and plant a gossip grudge or a report to their
  protector; pride +1 with fear under 40 refuses; everyone else complies, up to
  weight × $100 and their written `canRaise`, which defaults to **$100** and is
  raised by content for at most three people with money. The payment arrives by
  seed, and `State.apply` refuses any `goldDelta` from a target with a pending
  demand, so the narrator cannot have them pay twice. Someone the player holds
  aware leverage over cannot go to the police about the player until the record
  is spent or void (hard people excepted); then the bar lifts and their grudge
  check runs on the next tick. Telling the police about someone runs that
  secret's `whenTold` content hook; by default the police member it matters to
  gets a weight-3 memory and, for a crime, an "inquiry" seed that fills one
  segment of the police clock. No automatic arrest.
- **What never leaks.** The record's text is the bookkeeper's words for what
  the narration showed, never the `secret` field. A record over the player
  reaches the card and the narrator only once `playerKnows`. A report delivered
  through a hidden protector tie (Hollis to Wade) follows the hidden-tie rule
  on the card and in the narrator line, so it shows nothing of the tie. Weight,
  who it matters to, `canRaise` and the answer before it happens stay hidden.

### 4.5 The minor guard

Kaylee Pittman (16), Micah Dees (17) and Austin Lott (15) are the cast's
minors; every Elsewhere and Gone record is an adult, and creation allows a
player of 16. A minor is anyone whose cast age in the save's town copy **or**
current age is under 18, whichever is stricter, or who is tagged `teen`: an
edit can make someone a minor, never an adult.

1. **Before narration, every turn a minor is present,** the narrator packet
   carries that minor's line (about 25 tokens): "Kaylee Pittman is 16: any
   romantic or sexual advance is unwelcome and alarming; she is uncomfortable,
   gets away or goes to her father; never warm, never flirtatious." It does not
   wait for the parser, so the parser is out of the safety path for narration.
   The parser's new `romantic` field (`null`, `"flirt"` or `"more"`; one
   property and one small enum on a schema far from the grammar limit) decides
   the mechanics below. For a player under 18, every welcome is
   no and the packet says nobody takes a flirt from them as anything but a kid
   talking.
2. **After narration, with corroboration.** A bare flag (no named target, or a
   Say to everyone) gives the minor a light row: a weight-1 memory ("made me
   uncomfortable at the register"), liking -3, knows +2, and nothing for
   parents or police, so "thanks, sweetheart" cannot brand the player. The full
   unwanted-advance row (W -20, T -20, F +10, weight 3) and the consequences
   below need the minor as a named target (the Say chip, or a Do action aimed
   at them) **and** a second signal: a bookkeeper romance event for that minor,
   or a hit on a code phrase list over the input. The same full row fires on
   any bookkeeper `flirted`, `rebuffed` or `intimate` naming a minor, flag or
   no flag. Whatever the bookkeeper reports instead is discarded. That fear
   never buys compliance.
3. **Consequences without the graph.** Each parent or grandparent in town,
   found from the static relation labels tier A already has, takes `crossed` at
   full strength with a weight-3 memory from a template ("came on to my daughter
   at the register") and plants a report to Chief Bell at once, whatever their
   liking. Town reputation -10, outside the per-turn cap. A missing guardian
   (arrested, gone, dead) means another adult with a family or household tie,
   else Chief Bell alone; a missing Chief Bell means the county sheriff from
   the Elsewhere list.
4. **No fear or leverage rewards from minors.** No no-roll compliance, no
   fear-opened secrets, `canRaise` $0, a leverage-backed ask always rolls; any
   threat or violence aimed at a minor always reports to each parent or
   grandparent and to Chief Bell, with town reputation -5 or -10 outside the
   cap.
5. **Spark cannot move.** Every write that would raise a minor's spark is
   refused and logged, from any source (model, world, edit, import, upgrade,
   cheat, `/fact`); an imported non-zero value is set to 0 at load; status
   derivation returns none before reading a number; the narrator, parser and
   bookkeeper packet builders each check age again; the Edit form has no
   Interested control for a minor; `validate-town.cjs` refuses a minor on the
   eligibility list.
6. **Anchors that cannot all be stripped.** Minor status is checked against the
   save's town copy, the current age, the `teen` tag **and** the live
   `TOWN_DATA` age by id for the built-in town; a record with no age whose
   role reads as a teen fails closed. The classification eval (section 8)
   carries about 50 labelled romantic lines, including euphemism and Do mode
   ("ask what time she gets off", "I wink at Micah"), with a recall target of
   98% or more for lines aimed at minors, and the code phrase list is the
   backstop.

The permanent test (`tests/relationships.test.cjs`, Appendix D of the design)
collects the minors from the data, never from names; asserts the set is exactly
those three today so a new minor fails until reviewed; drives a flagged flirt at
each, a Say to everyone with a minor present, a bookkeeper `flirted` without the
flag, threats and a hit at Austin, a leverage-backed ask at Micah, writes from
every source, an `/edit` raising Micah's age, an import with `spark: 60`, a
player of 16 flirting with Jodie, and 300 random event strings plus 50 random
romantic parses over every id for 20 turns. After the delta review it also
drives a leverage-backed romantic ask and a fear-backed one at an adult and at
a minor (both fail as coercion), an import that strips every anchor at once, an
unflagged kind remark to Kaylee (no consequence), the guardian-absent case, and
checks the status cue strings ("flirts back", "lights up when", "stands
close", "for one reason", "looks twice", "open to it") against every packet.
**It fails if any record under 18 by cast or current age has spark above 0, a
spark status, or a romance cue in any packet.**

### 4.6 Events

Forty-one events. The design's §3.1 table gives each one's source (engine,
bookkeeper, or both), its changes on every track, its reputation value when
public, its weight and fading class, and its dedupe class. The shape of it:

- **Engine-derived, from what code can see:** `hit`, `shoved` and `beat_down`
  by attack roll tier (one fight is one memory; the third hit replaces it);
  `threatened` by intimidate roll; `stole_from`; `gift` and `bribed` from the
  existing gift check (bribed = a gift plus an ask that turn); `spent_time` from
  a phase together with Say aimed at them, once a day; `humiliated` when an
  insult has two or more other witnesses; `paid_back`, `kept_word` and
  `broke_word` from obligations and appointments; `flirted`, `blackmailed` and
  `threatened_to_tell` from the parse; `intimate` from the parse and its gate;
  `rescued` from state (a fight, a hurt fate or a seed put them in danger,
  never danger the player caused); `paid_silence`, `told_anyway`, `card_win`,
  `card_loss`.
- **The bookkeeper names the rest**, about 22 words in A: `insulted`,
  `complimented`, `pried`, `apologised`, `confided`, `they_confided`,
  `kept_word` (a confidence kept), `came_clean`, `lied_caught`,
  `betrayed_confidence`, `exposed` (about Y), `did_favour`, `they_helped`,
  `defended` (against Z), `informed_on`, `crossed`, `rebuffed`, `noted`,
  `learned_secret`, `caught_you_at`, `stole_from` and `cheated` when found out
  later; in B also `badmouthed` and `vouched_for`. It classifies **the act as a
  neutral witness would name it**; the trait axes carry how this person takes
  it, so personality is applied once, in code.
- **Preconditions** (design §3.2): a kept confidence needs an unsettled
  `they_confided` from that person at least a day old and a named asker present
  this turn who is not the confider, once per three days, else it is
  `confided`; `came_clean` pays only when it settles a
  caught lie or a logged deceive, and net trust over a lie and its confession is
  never positive; `lied_caught` needs a logged deceive or a `noted` claim;
  `exposed` needs a leverage record over Y; `defended` needs the aggressor
  present and pays nothing to kin if the player provoked them; an apology must
  land (a successful persuade, or liking above -25) and never resets
  compounding; `private` applies to words events only.
- **Repeats.** Kind things to the same person on the same day earn 1, ½, ¼,
  then 0; `spent_time` and `gift` drop to a reduced value after three days per
  person, so a nightly round makes regulars warm, never devoted. Harm repeated
  within three days compounds ×1.5 then ×2.25, and the memories merge ("kept
  insulting me") with the weight rising to 3. Per turn per person: liking ±40,
  trust ±45, fear ±40, spark ±20; through the graph ±15.
- **The wire.** `socialEvents` is a list of strings, `"npc_id event[ npc_about][
  private]: what they would remember"`, read by a tolerant parser (an alias
  table for spelling, tense, hyphens and spaces; tokens consumed in any order;
  the colon optional; a missing about-id inferred from a cast name in the text;
  a spurious one ignored). It replaces `attitudeChanges`, `newMemories` and
  `memoriesSettled`: 41 properties and 4 enums become **34 and 3**; the core
  fallback goes from 13 fields to 11. At most 2 events per person and 4 per
  turn from the bookkeeper; over the cap, the heaviest are kept. An engine event
  of a class drops the bookkeeper's events of that class for the same person
  that turn, and engine violence also drops `humiliated` and `threatened` for
  that victim.
- **Traits.** Four signed axes, each trait giving -1, 0 or +1 to at most two,
  clamped to ±2 per person: pride scales liking from words-bad, `humiliated`,
  `shoved`, `blackmailed` and `rebuffed` by (1 + 0.25p) and settle factors by
  (1 − 0.2p); guardedness sets start trust 5g and scales trust gains (1 + 0.2g)
  and losses (1 − 0.15g); nerve scales fear gains (1 − 0.25n), and n ≥ 1 is
  "hard"; grudge-holding scales harm half-lives by 2^(−r/2) and settle factors
  by (1 + 0.15r). The `mercenary` flag doubles money's effect on liking and
  halves blackmail's. Spark is never scaled by a trait.

### 4.7 History and dynamics

- **The memory record** gains `event`, `d` (the change as applied, per
  track), `decay`, `settled` (a list), `secondhand`, `via`, `place`, `key`,
  `sourceKey`, `leverageId` and `seen`. The tracks are `start + Σ remaining +
  everyday` (each everyday bucket held to ±15) plus derived leverage fear,
  recomputed inside every State op that touches a person and every morning
  tick. At the 12-memory cap, eviction is secondhand first, then mood, slight,
  wound, scar, kind before harm within a class; `noted` (at most 3), loose-end
  memories and `/fact` lines are protected; an evicted remainder moves into
  everyday so no number jumps.
- **Fading.** `floor + (1 − floor) × 0.5^(age / halfLife)`: mood 2 days floor
  0 (insults, compliments, prying, the liking part of a flirt); slight 5 days,
  floor 0.2 for harm and 0 for kind (humiliation, threats, shoves, gifts,
  rebuffs, spark from flirts); wound 10 days floor 0.4 (a hit, a theft, a
  caught lie, crossing, a threat to tell, and the kind ones: a kept word, a
  favour, being defended, a confidence); scar 21 days floor 0.6 (a beating, a
  betrayed confidence, cheating, informing, a rescue, a blackmail). One fear
  clock, half-life 4 days, floor 0, except leverage fear, which lasts while the
  record does. Trust fades at the same speed as liking. Witness and secondhand
  copies fade one class lighter, have no floor, and merge into one memory per
  scene: bystanders recover, the people it happened to don't. Today's drift
  (2 a day toward the written value) is gone; only the everyday bucket drifts,
  2 a day toward 0 on days the player does not see the person.
- **Settling** combines as `1 − (1−a)(1−b)`, at most two per memory plus
  getting even, and nothing locks: an apology that lands 0.5 on liking and 0.25
  on trust, never fear; paying back a debt 1.0 plus liking +5; coming clean 0.4
  on trust; a kept word after a broken one 0.7 and 0.35; a favour "to make it up
  to him" 0.5 and 0.25; their grudge coming due 0.4 on liking (replacing
  today's flat +10). A weight-3 harm settled the same day it happened still
  grows a grudge. Leverage memories are ended by their record, not by words.
- **Thresholds that replace today's** (design §6.2 has the full table):
  persuade and charm by liking (±1 at 30, ±2 at 60), deceive by trust (+2 at 40;
  -1 at -25; -2 at -50), intimidate by fear (+1 at 20, +2 at 40, -1 against
  anyone who likes you at 40), all inside the existing ±4 cap; code floors the
  parser's difficulty (at least hard for any ask of someone against you; a lie
  at trust -25 hard, at -50 very hard; hard people at least hard to intimidate)
  and ceilings it (an adult at fear 40 does a small thing with no roll, the d20
  still drawn so the dice stream holds); the secret gate is trust 40 and knows
  30, or a successful roll aimed at them, or fear 60 after a successful
  intimidation, never for a minor; grudges at liking -60 with an unsettled
  weight-3 harm, or trust -60 with a first-hand betrayal, their kind from the
  event class, limited to police or gossip at fear 40, and barred from the
  police while the player holds aware leverage over them; favours at liking 50
  and trust 20 with a weight-2 help memory, or owed +2 at any liking above -25;
  the alibi needs trust 40, the ramp warning and the photo 30; a couch at liking
  25 and trust 0, or owed and liking above -25; rescue at liking 25 or owed,
  unless afraid of you; card seats at liking above -25 and trust above -40;
  Curtis deals at liking -10 and trust above -40; a rumour at liking above -25
  and trust above -25 unless tagged gossip; Royce's "talked it through" branch
  at `relAtLeast: { npc_royce: { trust: 30, knows: 25 } }`, the friendly face
  at `{ liking: 15 }` with `playerAt`, bought at `{ trust: 20 }`; Loretta's
  epilogue at `{ liking: 40 }`.
- **Coercion and compliance.** A romantic ask is never backed by leverage and
  never gets fear's no-roll ceiling, for anyone: it always fails, the narrator
  is told they refuse and what they do next, and it is recorded as
  `blackmailed` plus `crossed` at full, with a report to the protector and
  town reputation -10 outside the cap. A `beat_down` on a tough person plants
  a violence grudge whatever their liking: one public beating of Wade is
  answered. Every new seed (report, price, tell, owed favour, inquiry) and every
  backed or fear-ceilinged ask draws from its own `Rng.create` stream keyed by
  the game seed, the person and the day, with the d20 still drawn, so seeded
  tests and the faction clocks do not shift.
- **Seeds.** The report seed fires in 1 to 2 days, on its own dice stream, when
  fear is 40 or more from the player's threats whatever the liking, when fear is
  40 from violence and liking is 0 or less, and always for a threat or violence
  at a minor; it goes to the protector (content, Appendix F of the design, with
  defaults: a minor's parents plus Chief Bell, else a boss, else the police;
  "nobody" becomes a grudge), who takes a `crossed`-class event and a templated
  memory ("{npc} says you've been leaning on them"); a reporter holding
  leverage spends it. A price seed: a `mercenary` holder at liking 10 or less
  names $50 × weight, due in 2 days. The owed-favour seed spends the debt.
  "You owe them": they ask after 5 days, again after 3 more, then take a
  `crossed`-class memory.
- **Shops.** A manager, owner, merchant, bartender or cashier at "against
  you" or "hates you" won't sell for 3 days, then sells at 25% over. A bed,
  gas or food is never refused for more than one night unless a grudge template
  says so.

### 4.8 The graph (tier B)

- **Ties.** `state.ties["npc_mavis>npc_dewayne"] = { kind, w, t, hidden,
  known, log: [{ day, turn, why }] }`. Every relation label becomes a directed
  tie with defaults by kind (spouse 50/40, parent to child 70/30, child to
  parent 50/40, sibling 40/30, friend 40/30, boss to employee 20/20, and so
  on); about 40 hand-written ties override or add the town's secrets (Loretta
  and Royce lovers 80/70 hidden; Tammy to Colt -90 hidden; Boyd to Wade -90/-90
  hidden; Darlene to Royce 10/-40). Only people in town take part.
- **One hop.** When the player does E to B, each A tied to B takes E's change
  times a base factor by what B is to A (child 0.8, lover 0.7, spouse 0.6,
  sibling or parent 0.5, friend 0.4, in-law 0.3, employee 0.25, boss 0.2, fellow
  faction member 0.15, landlord 0.1), × (0.5 + 0.5 × A's liking for B / 100), a
  teen victim ×1.25 for parents, saw it ×1.0 or heard ×0.75. If A's liking for
  B is -20 or less the factor is A's liking for B / 200, negative: rivals warm,
  except police over crimes and clergy over violence. Fear carries at half and
  only for violence; spark and leverage never travel. Under 2 is dropped, 2 to 4
  goes to everyday, 5 and up is a secondhand memory one class lighter.
- **Who knows, and when.** Witnesses at once with the witness row (a hit: W
  -5, T -5, F +8; a beating: W -8, T -6, F +12; a threat: W -3, F +5; an insult:
  W -2; a defence or rescue: W +5, T +5; a cheat caught: T -10). Spouse and
  household (a shared home **and** a family relation; never the motel or the
  trailer park) overnight. Other family, boss and employee the next morning.
  Friends, lovers and rivals at the next co-location or within 2 days, or the
  next morning if it was town news. Hearsay lives in `state.hearsay` with the
  turn it was made, expires after 4 days, and moves only people tied to the
  person it happened to. One feed line overnight: "Word got round: Lorna, Colt
  and Wade Purvis have heard about the landing."
- **Ties change** in four ways: `exposed` about Y to X moves X's tie to Y by
  the `SECRET_TIES` table (Dewayne to Mavis: liking -20, trust -45) and Y learns
  who told; `badmouthed` and `vouched_for` move X's liking for Y by ∓10 / ±8
  scaled by X's trust in the player, only on a successful persuade, once per
  pair per day, ±20 in all; an arrest turns the victim's family in town against
  the arresting officer (W -20, T -20); content `tieDelta` ops, and the grudge
  and favour templates' hand-listed third-party deltas become `propagate` ops
  along the ties. BETWEEN THEM and the card's "wife Mavis Mangum, strained
  since Day 5" appear only for known ties the player was present for.

### 4.9 What the player sees, and what the narrator is told

**The People tab.** The list row shows the stance and one tag in one of three
tints: "Shayla Rawls · 25 — Suspicious of you · using you". The open card shows
the stance, up to two tags, two dated reasons ("You know about the landing's
cash in his books. Day 2" / "He paid $300 to keep it quiet. Day 4"), leverage
lines, owed, ties, then a "More" fold with the tracks in words (Likes you:
hates you / no / not much / either way / some / a lot / completely; Trusts you:
no / not yet / yes / completely; Scared: no / a little / yes; Knows you: barely
/ a little / well / very well; Interested, only for an eligible adult with a
status). Screen readers hear the stance, tags and reasons as one sentence. The
Edit form has four sliders that write to `start` (so an edit holds and does not
drift), Interested only for eligible adults, and an event picker (or `noted`)
for an added memory; it round-trips every memory field.

**The feed**, at most two lines a turn plus one collapsed overnight line, ranked:
"Dewayne Mangum won't forget that." / "Glenda Pryor has something on you." /
"Hollis Byrd knows you know." / "Hollis Byrd is afraid of what you know." /
"Tyler Rasberry is afraid of you." / "Tyler Rasberry gives you room." /
"Hollis Byrd has paid for your silence." / "Marcus Bell stops taking your
word." / "Trent Haskins is willing to hear you out again." / "Royce Pittman
takes you at your word now." / "Jodie Strayhorn is sweet on you." / "Shayla
Rawls is interested. It isn't friendship." / "Loretta Gaddis warms to you." /
"Burl Satterfield owes you one." / "Dewayne Mangum lets some of it go." /
"Word got round: …". Fading prints nothing; hysteresis stops flicker; undo,
loads and edits print nothing; no spark line ever names a minor.

**`/recap`** keeps Warm and Cold, each name with its stance and one reason
("Mavis Mangum (against you: you told Dewayne about the garage money)"), adds
**Careful** for anyone mixed ("Trent Haskins (fond of you, doesn't trust you),
Hollis Byrd (afraid of what you know)"), and folds favours and silence money
into **Owed**.

**The narrator.** In place of `attitude 5 (neutral); remembers: …`, each
present person's line carries:

```
to you: <stance>[; <tag>] — <reason> (Day N)[; <reason> (Day N)] — plays it: <cue>
[open to a flirt]
[holds you to: <noted fact>; <noted fact>]
```

For example: `to you: fond of you, doesn't trust you; has something on you —
caught you in his truck's cab (Day 5); drinks with you at the landing (3
nights) — plays it: glad to see you; changes the subject or lies when pressed`.
About 45 tokens a person, hard cap 50 (code trims the second reason, then the
tag, then the cell's clause; the status or override clause is never cut), so a
typical three-person turn is about even with today and a seven-person night at
the Low Water is about 350. Cues describe present demeanour only, never what
someone will do later. Through a hidden tie or a secret not yet open: `cooler
since Day 4, for a reason of her own; keeps it to herself, never hint at it`,
no cause and no name. Per-turn lines when they apply: `LEVERAGE: <answer>` in
the present tense, the flirt or intimacy answer, the minor's line whenever a
minor is present, the under-18 player line, `BETWEEN THEM` for known ties. The
cached style block gains two short rules: intimate scenes fade to black, and
nobody flirts back unless their line says "open to a flirt" or a turn line
says so, and nobody under 18 is ever flirted with or flirts. The parser gets
the stance, the lie difficulty and the
player's leverage ids per present person; the bookkeeper gets the stance, at
most 3 memory handles per person and the open leverage ids.

### 4.10 What the tracks still don't carry

| Feeling | Decision | Why |
|---|---|---|
| Contempt against hate | **Derived (A), cue only.** Liking -25 or less, fear under 10, and the top negative memories words or honesty rather than harm, keep the phrase "against you" and give the cue "talks past you" | A cue variant, not a thirteenth phrase, and no new number |
| Pity or protectiveness toward the player | **Derived (A), cue only.** Liking 25 or more while the player is hurt, broke or beaten adds "worries about you" | The player's state is already in state |
| Guilt on their side | **Dropped** | It needs NPCs making amends on their own, new content per person; the narrator can play remorse from the existing own-act memory |
| Dependence | **Deferred to C**; partly visible through owed and repeated paid work | It needs a record of what the player provides over time |
| Jealousy aimed at the player | **Derived (A)** as witness rules; lasting jealousy along lover ties is **C** | The moment is cheap; lasting jealousy needs romance states |
| Gratitude | **Derived:** owed plus liking | Already stored |
| Respect and standing | **Derived:** the town tier plus personal trust gives "takes you seriously"; SPEC's "feared" tier exists when 3 or more people are at fear 20 | Nothing new stored |
| Envy, admiration | **Dropped** | No behaviour turns on them |
| Shame about what you know | **Derived** from aware leverage | The record carries it |
| Guilt by association (time spent with Colt cools Tammy) | **Deferred** | It needs the graph to read the player's company, not only the player's acts |
| A parent noticing repeated gifts or private time with their child | **Deferred** | Worth a template once the graph is in; not a track |

---

## 5. Architecture

The integration appendix (its §0 to §11) has the function-by-function plan with
line references. The shape of it:

**A new module, `Rel`,** goes between State and Town (after State closes at
about `index.html:12168`), on `window.Game` like the others, with a
`// ===== Module: Rel =====` banner and a row in the build plan's module
table. It is pure functions and frozen tables (`EVENTS`, `WIRE_EVENTS`,
`ALIASES`, `DEDUPE`, `TRAIT_AXES`, `AXIS_EFFECTS`, `DECAY`, `CAPS`, `BANDS`,
`STANCE_GRID`, `OVERRIDES`, `TAGS`, `SPARK_STATUS`, `CUES`, `WITNESS`,
`SECONDHAND_TEXT`, `LEVERAGE_WEIGHT`, `GATES`, `UNWANTED_ADVANCE`; in B
`TIE_KINDS`, `RELATION_KINDS`, `FACTORS`, `DELIVERY`). **It never writes.**
State's ops call `Rel.applyEvent`, `Rel.recompute` and the other planners and
write what they return, so "every mutation goes through `State.apply`" still
holds. Dice, Pipeline, World and the UI read `Rel.tracksOf`, `Rel.stance`,
`Rel.cue`, `Rel.reasons`, `Rel.gate`, `Rel.rollMod`, `Rel.difficultyFloor`,
`Rel.complies`, `Rel.isMinor`, `Rel.eligible`, `Rel.romanceTurn`,
`Rel.leverageAnswer`, `Rel.protectorOf` and `Rel.guardiansOf`. The GATES
table holds every threshold as data, so Debug prints them and the README can
quote them: one table to tune, which the audit asked for.

**The record.** `n.rel = { start, everyday, fix, today, days, recent, asks,
owed, cache }`, with the six tracks derived as `start + Σ remaining(memories)
+ everyday (each bucket held to ±15) + fix`, fear adding the derived leverage
part and capping at 39 for hard people, spark forced to 0 for a minor, an
under-18 player or anyone not eligible. `n.attitude` **stays on the record as
the stored alias of liking**, rewritten by `relWrite` after every change, so
every existing reader (Dice, `restQuality`, World's `attitudeAtLeast`, the
cards code, `secretsFor`, the rumour pool, the mock, the recap, the UI, the
validator, about a hundred tests) keeps reading it; a direct write to it from a
test or a hand-edited save is folded into `fix` at the next recompute. The
memory record gains `event`, `d` (the change as applied; `null` for a legacy or
hand-added memory, which moves no track), `decay`, `place`, `key`, `fight`,
`settled[]` (turn-stamped, at most two plus getting even), `n` (merges),
`witness` and `scene`, `secondhand` (B), `leverageId`, `about` and `seen`.
State gains `leverage[]`, `known.secrets` (the first persistent record that
the player has been shown a secret, written the turn `secretsFor` puts it in
the packet), and in B `ties` and `hearsay`; `player.obligations[].status`
gains `lapsed` for the standoff and for coming clean.

**`attitudeDelta` keeps today's exact meaning** and lands in `everyday.w`
(overflow past ±15 goes to `fix`, so the number still reads `before + delta`).
All 41 content and engine uses keep their numbers until a wave converts the
ones whose number should come from the table (integration §4.6 lists every
site). The three old bookkeeper fields leave the wire in A3 but **stay in
`RECORD_KEYS` as a legacy path** for engine code, tests and old core replies; a
legacy memory is typed for its kind with `d: null`, and from A2 a legacy delta
or memory **yields** to an engine event for the same person in the same diff,
so the mock's "attacked me, -20" on top of an engine `hit` counts once.

**Ops.** `socialEvent` (an effect op, content and engine; A1), `socialEvents`
(the bookkeeper's field: in `ENGINE_KEYS` through A2, moved to `RECORD_KEYS`
in A3, which is what flips the mock through its existing `known(k)` guard),
`relSet`, `relDay`, `relTurn`, `relAsk`, `relSettle`, `owedSettle`,
`leverageAdd`, `leverageSet`, `secretShown`, `relFill` (Upgrade 9 only;
refused unless the recomputed liking equals the record's attitude), and in B
`tiesFill`, `hearsayDeliver`, `tieDelta`, `propagate`. `State.EFFECT_OPS` grows
28 → 29 → 31 → 33, and the validator's `OPS` list and `tests/state.test.cjs`
L980 follow in the same wave. **The editor's track edits land in `fix`**, not
in `start` as the design wrote, because Upgrade 9 is `rerun: true` and rebuilds
`start` from the town; `fix` never drifts either, which is what the design
wanted.

**Recompute** runs inside every op that touches a person (so a later op in
the same diff reads the new alias), on the morning tick (`relDay`, replacing
`driftAttitudes`), and after `setTime`, `rewind` and the load fill. Ages are
whole days; a memory with no `day` uses `World.memoryDay`, else "a week ago".
Caps are applied at event time and stored in `d`, never re-applied.
**`/undo`** restores a snapshot, so everything comes back exactly.
**`/rewind`** strikes everything stamped after the kept turn: memories (as
today), settlements, owed entries, `asks`, `recent`, leverage records and their
logs, `known.secrets`, hearsay and tie-log entries; `everyday`, `fix` and the
across-days counters stay, like money, and the README's `/rewind` row says so.
This is a change from today, where feelings are never rewound.

**Engine events** reach state in two ways: resolve-time events (`hit`,
`shoved`, `threatened`, `stole_from`, `caught_you_at`, the backed asks,
`rescued`) apply in their own `State.apply` at resolve, as complication
effects do today; turn-end events (`gift`, `bribed`, `flirted`, `spent_time`)
ride in `opts.engineEvents` and are processed after the money fields and
before the bookkeeper's `socialEvents`, so the class dedupe sees them. When the
bookkeeper fails, the engine's facts are applied on their own, as today.

**Dice stay deterministic.** Every new relationship draw (report, price,
tell, owed-favour, inquiry and tough-answer seeds; backed, fear-ceilinged and
coercion-refused asks) uses `Rel.rng(kind, npcId, day)`, an `Rng.create`
sub-stream keyed by the game seed, the kind, the person and the day, the way
the card code already does. When a roll is skipped, `Dice.burn()` consumes the
d20 that would have been drawn (or the test hook's forced value), so the next
real roll and the faction clocks land where they would have. A2 adds a
draw-for-draw test: a seeded game with a forced report seed and ten turns
matches the same game without it.

**The wire.** `socialEvents` strings are read by a token-consuming parser
(`Api.socialFromWire`): an npc id, an event word (aliases for spelling, tense,
hyphens and spaces, then a unique five-letter stem; two-word forms like "kept
word"), an optional about-id, `private`, in any order, with the colon optional
and the text starting at the first non-token, so "meet at 10:30" in the text
is safe. The schema goes from 41 properties and 4 enums to **34 and 3**; the
core fallback from 13 fields to **11**; `parse_action` from 13 properties to
**14** (one boolean, no enum; the parser has never been near the limit, and
the 31 October refusals were the bookkeeper's). The bookkeeper's system prompt
loses "Be conservative: small attitude shifts" and the `memoriesSettled`
sentence and gains `EVENT_RULES` (22 glosses, about 420 estimated tokens) and
`MEMORY_WORDS` (the wording rule and the good examples only), net about +164
tokens uncached; `MEMORY_RULES` itself stays word for word for Upgrade's
memory re-read, which a test pins, with a comment at both saying they diverge
on purpose.

---

## 6. Migration

**At load, with no version bump** (the pattern `fillPronouns` uses): every
person without `rel` gets one with liking exactly their attitude, trust from
the start rules, spark 0; `state.leverage` and `state.known` are created
empty; any spark on a minor or a non-eligible person in an imported save is
set to 0. The game plays as before, and memories stay untyped until the
update.

**Rules version 9 (A5), "People who remember"** (`Upgrade.peopleRemember`,
rerun-safe, no API call, one `/undo` step with the rest), for each person who
is not dead:

1. **Start** from the save's town copy (or the live cast, or the record). A
   loose-end person's `LOOSE_END_ATTITUDE` and trust and knows 30 move into
   `start`, and the old delta leaves `everyday`, so liking does not move.
2. **The engine's own strings first.** A frozen list of regexes built from the
   `56e69f5` writers and the content templates ("knocked me down in a fight
   at", "locked … up overnight for fighting", "Beat … in a fight and dragged
   them to the cells", "let the … go past due, so I took", "paid me two
   hundred dollars to keep quiet", "waited for … and they never came", "caught
   … cheating at cards", "Loose end with", "Fact (a story point):" and the
   rest) types each memory before any typing by words, so an editor-stripped
   "took the phone" is the repo man's own act and never a theft by the player,
   and the captured-defeat memory is `noted`, own, whether or not its separate
   fix has landed.
3. **Then by `act`, then by words**, then by the recap's sense regex; `day`
   from `World.memoryDay`, else a week ago.
4. **Fit to the old number.** The table values are scaled so that the
   memories' remaining liking adds up to `attitude − start.w` (×0 to ×2; if
   the signs disagree, liking 0 and trust and fear at half). **Liking equals
   the old attitude exactly for every person**; `relFill` refuses the write
   otherwise, and the wave's test asserts it.
5. **Trust seeded from the old attitude**: anyone with a weight-2 or better
   good memory gets `fix.t = 0.8 × max(0, attitude − start.w)`, so trust never
   exceeds the liking that earned it. **The secret floor:** anyone whose secret
   the old gate had open (attitude 50 with a good memory) gets trust at least
   40 and knows at least 30, so nobody who would have told the player their
   secret before the update stops after it.
6. **Knows** from the typed memories, meeting, days since met and loose ends
   (0..60). **Owed** from unsettled help memories. **Spark 0** for everyone.
7. **Leverage:** each informant loose end becomes a record with its status
   read from the obligation (none yet → held, `playerKnows: false`; open →
   used; met → paid; missed → spent); a heard rumour now marked `leverageOver`
   becomes a record with `aware: false`. Secrets shown in earlier narrator
   packets become nothing: no record of them exists.
8. **Content copied into the save:** open obligations and unfired loose-end
   seeds whose effects equal the previous content get the new `socialEvent`
   effects; the unfired built-in council and epilogue get their `relAtLeast`
   branches, as `arcFill` did for the arc; rumours get `leverageOver`; a town
   of the player's own is never touched.
9. **The feed:** "People now remember why: 14 people's memories now carry
   what they did to how they feel. 1 person has something on you." and "The
   council now weighs trust." when it applies.

The optional re-read: version 2's "Memories that matter" (`rewrite_memories`,
no new schema, cents for 41 people) can be offered again before typing, so
long old lines become short ones first. A new "type each memory" call would be
a new schema and its own probe, and is not recommended.

**Rules version 10 (B1), "A town that talks":** ties from both sides of every
relation plus the built-in hand-written ties through `tiesFill` (never
overwriting), `secretTies` copied, `hearsay` empty. Nothing that already
happened is spread again. "People now feel for each other: 118 ties between 41
people. What you do from now on reaches the people close to them."

**What does not reach old saves**, documented in the README section: secrets
revealed before the update; jealousy and fear from before it; trust built by
confidences before it, beyond the seeded trust and the secret floor; and the
ask log, so a bookkeeper `lied_caught` needs a lie told after the update or a
`noted` claim.

The README's "Updating an older game" table gains two rows (the integration
appendix §13.3 has the wording), `State.RULES_VERSION` and the Upgrade header
comment gain a paragraph each, and the "8 now" at `README.md:1156` changes.

---

## 7. Waves

Eight waves: five for tier A, three for tier B. Every wave leaves the game
playable and the suite green, and each one's scope, files, new tests (with
their titles), edited tests (by file and line), docs and acceptance check are
in the integration appendix §16. One wave, A3, ships only after the live
grammar probe. Sizes are lines of `index.html` code, content and validator,
new test lines, and existing tests edited.

| Wave | Name | What it does | Size |
|---|---|---|---|
| **A1** (26) | The tracks under the number | A pure refactor: `Rel` with every table as data; `n.rel` with six tracks and the alias; recompute, fading, combined settlements, hysteresis; spark stored as 0 with `Rel.isMinor`, `Rel.eligible` and spark writes refused at every writer; `state.leverage` and `state.known` empty; the `socialEvent` op (the bookkeeper cannot send it yet); `relSet`, `relDay` keeping today's drift exactly; `attitudeDelta` and the legacy fields into everyday; the load fill and import guard; `Rel.rng` and `Dice.burn` unused. **Every number is identical and no existing test changes.** Acceptance: the suite is green with no edits, and Debug shows `att N · w t f k s · stance` with `w = att` for everyone. | 550 / 10 / 480 / **0** |
| **A2** (27) | What the engine sees, people remember for what it was | Fights as one memory (`hit`, `shoved`, `beat_down` replacing it; the old weight-3 witness memories retired for lighter per-scene copies); `threatened`, `stole_from`, `gift`, `bribed`, `spent_time` and knows, obligations and appointments as kept and broken words, `cheated`, `rescued` from danger seeds, card wins and losses; dedupe by class and the legacy yield; fading replaces drift; getting even softens the memory; the 41 `attitudeDelta` sites converted or left as everyday; the typed engine memories (`/fact`, the captured defeat as own); the liking and fear dice modifiers, rescue, won't-sell; fear compliance with the burned d20; report seeds with protectors (hidden protector ties follow the hidden-tie rule) and the tough man's violence answer to a beating; town reputation from public events and the feared tier; `/rewind` stamps. Acceptance: knock Colt down at the landing and read one `beat_down`, two witness copies and reputation -5 in Debug; threaten Tyler twice and watch the drive change hands with no roll and a report seed to Mavis appear the next day. | 710 / 100 / 610 / ≈ 27 |
| **A3** (28) | The bookkeeper names the act, and minors are protected before the story is told | The wire (34 properties, 3 enums; core 11; the tolerant parser; 22 words with their preconditions; caps keep the heaviest; settlement by words; memory handles in the packet); `EVENT_RULES` and `MEMORY_WORDS`; the mock flips to events; `parse_action.romantic` (14) with the mock's romance regex; **the whole minor guard**, the coercion rule on the fear path, the fade-to-black rule in the cached block; the trust gates (secret, couch, seats, Curtis, rumours, deceive dice, difficulty floors); favour gates and `needs`; `start` and `axes` overrides; the Debug export of bookkeeper turns for the eval; `tests/probe-grammar.cjs`; the permanent `tests/relationships.test.cjs`. **Ships only after the probe passes.** Acceptance: the probe passes on both bookkeeper models and the parser; in a live game a flirt at Kaylee sends her to her father, leaves weight-3 memories on Royce and Darlene, two report seeds and reputation -10; an insult to Royce and an apology show `insulted` settled by `apologised`. | 790 + 190 probe and export / 50 / 920 / ≈ 25 |
| **A4** (29) | What people hold: wanting, leverage and favours | Spark with the shipped eligibility list, welcome before narration, statuses and cues, jealousy, `rebuffed`, `intimate` gated, the coercion rule on the leverage path; leverage in full: `known.secrets`, `learned_secret` with its keys, `caught_you_at` with its limits, backed asks with the reference check and the burned d20, the answers by hard and tough, the present-tense `LEVERAGE` line, `blackmailed` and `threatened_to_tell`, the payment seed, `paid_silence` and `told_anyway`, the obligation link inside `State.settle`, the `lapsed` standoff, coming clean, the police bar and its lift, tell and price templates, `whenTold` and inquiry seeds, the informant's record at game start, the Journal's "are owed"; favours owed with the cash guard and the ask-back chain. Acceptance: as the fired bookkeeper, win Hollis's secret with a roll and demand three hundred for his books: no roll, the LEVERAGE line in the packet, the money the next evening and the Journal line struck through; three mornings of flirting with Shayla reads "Suspicious of you · using you". | 1,020 / 210 / 980 / ≈ 6 |
| **A5** (30) | What people show | The People card with its stance chip, two dated reasons, leverage lines and the "More" fold; the editor's sliders, Interested for eligible adults, leverage lines and the event picker; `noteRel` with its ranking and the collapsed overnight line; `/recap` Careful and Owed; the narrator's `to you` line with the 50-token cap, `open to a flirt`, `holds you to`, the hidden-reason wording; the parser row and rubric; both styles' example turns, `Style.KNOWLEDGE`, the trimmed format note and the validator's two regexes; `relAtLeast`/`relBelow` with the council and epilogue rewritten (no fear branch); the contempt and pity cues; **rules version 9**; the simulator, the eval script and the eight-day CI guard. Acceptance: update an old save and see every "Likes you" word match the old meter and every open secret still open; open Hollis's card on a 375-pixel phone with no horizontal scroll; `node tests/relationships-sim.cjs confidant --assert` passes. | 740 + 490 sim and eval / 120 / 640 / ≈ 40 |
| **B1** (31) | The town is a graph | Ties from both sides of every relation plus about 40 hand-written ones; the factor table with the role limits; one-hop propagation at event time; absent victims through a witness; hearsay by kind of tie with the household rule and the collapsed overnight line; hidden ties with no-name narrator reasons and named-act cards; the arrest route; the hidden protector flag read from ties; **rules version 10**; Debug ties and hearsay. Acceptance: hit Dewayne at Pittman's in the morning, `/rest`, and read "Word got round: Mavis Mangum has heard about Pittman's." and her card at "cool to you" with the act dated. | 530 / 80 / 460 / ≈ 5 |
| **B2** (32) | Ties that change | `exposed` moving ties by `SECRET_TIES` and the target learning who told; `badmouthed` and `vouched_for` on a successful persuade (two more wire words, so the probe is re-run as a precaution); `tieDelta` and `propagate`, with the templates' third-party deltas converted in place; BETWEEN THEM for known ties; tie words on the card. | 380 / 110 / 350 / ≈ 3 |
| **B3** (33, optional) | Tuning | One pass over `EVENTS`, `AXIS_EFFECTS` and `GATES` after a playtest, **only once the labelled eval passes** and with the simulator's bands holding; richer report templates; a fourth simulator playstyle (blackmailer) if the playtest shows abuse. | 200 / 60 / 250 |

| Tier | Code | Tooling | Content and validator | New test lines | Existing tests edited |
|---|---|---|---|---|---|
| A (26-30) | ≈ 3,810 | ≈ 680 | ≈ 490 | ≈ 3,630 | ≈ 98 |
| B (31-33) | ≈ 1,110 | 0 | ≈ 250 | ≈ 1,060 | ≈ 8 |
| All | ≈ 4,920 | ≈ 680 | ≈ 740 | ≈ 4,690 | ≈ 106 |

Tier A is larger than the design's own estimate (2,500 to 3,000 lines in all)
because the plan keeps the legacy paths, the load fill, an exact A1, the yield
rule and the migration pre-pass, and because the delta review added the
coercion rule, intimacy, the corroborated minor guard and the leverage guards.
The edited-test count matches the audit's count of tests that pin today's
numbers. B can wait on A's playtest.

Each wave also gets its direction-change sub-bullet in the build plan under a
new entry **11. People who remember**, its `docs/notes/<module>.md` wave entry,
and its README changes (section 12).

---

## 8. Before any tuning

Four pieces of tooling, none of which exists today, gate the numbers:

- **The live grammar probe** (`tests/probe-grammar.cjs`, skipped by
  `run.cjs`, about 150 lines; needs the owner's key and network, so it cannot
  be run from this sandbox). It opens the game headless, builds a fixed
  bookkeeper packet and a fixed parser packet ("I flirt with Jodie") with the
  page's own packet builders, takes the exact request bodies and headers from
  `Api`, and posts the new `record_changes` (34/3), the new core (11), the new
  `parse_action` (14) and the `56e69f5` schema as a control, for each
  bookkeeper and parser model in the presets. It passes when every request
  returns 200, no reply mentions "grammar", the bookkeeper reply yields at
  least one known event and `State.apply` of it rejects nothing. The owner
  runs `ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs`; the result goes
  into the README's "Verified against the live API" and `docs/notes/prompts.md`.
  **A3 does not ship until it passes.** If `record_changes` is refused, the
  11-field core still records events; if the parser is refused, A3 waits
  rather than shipping without `romantic`.
- **The labelled eval** (`tests/eval-classify.cjs`, needs the owner's key).
  At least 150 live turns exported with A3's Debug button, each labelled by
  hand with the act a neutral witness would name, plus about 50 romantic-intent
  lines including euphemism, Do mode and false friends ("thanks, sweetheart"
  to Kaylee). It sends each packet with the real system prompt and schema,
  parses the reply, applies the preconditions offline so refused events count
  as the engine would, and reports exact accuracy, the neighbour-confusion rate
  over the review's six neighbourhoods, invented events, misses, romantic
  recall for lines aimed at minors (on the parser flag and on the phrase list,
  separately and together) and cost (under $0.10 a run on the Thrifty model).
  **The pass bar** (an owner decision, recommended): neighbour confusions
  under 20% of emitted events, exact accuracy 75% or more, invented events 5%
  or fewer, romantic recall for minors 98% or more, and no minor-related event
  emitted for a minor. No gloss, event or axis is tuned before the first
  passing report is recorded in `docs/notes/prompts.md`.
- **The 21-day simulator** (`tests/relationships-sim.cjs`, headless, mock
  mode, skipped by `run.cjs`). Three canned playstyles as scripts of
  `Pipeline.submit` lines plus queued mock events, printing each involved
  person's six tracks, stance and tags every morning; `--assert` exits 1 when a
  band fails: the beer-buyer's Royce and Curtis never pass "warm to you" and
  their trust never moves; the confidant reaches trust 30 and knows 25 with
  Royce by Day 6 by honest events, and the same run with a staged kept word
  (nobody else present) does not; the brawler's Wade is never "afraid of you"
  and reaches "hates you" with its reason, with fights on Days 2, 4 and 6 only
  and the bystanders' liking at -12 ± 2 on Day 14 and -7 ± 2 on Day 21 (-13
  for a grudging one). An eight-day cut of each band runs in the suite as a CI
  guard, so tuning cannot break them silently.
- **The thirteen worked examples as tests**
  (`tests/relationships-examples.test.cjs`), each scripted through the mock in
  the wave its features land: the tracks within ±2 of the design's arithmetic,
  the stance, tags, feed lines and narrator fragments exact. Where the code
  and the design disagree, the code's number is pinned and the design appendix
  corrected in the same wave.

---

## 9. Risks

| Risk | Likelihood / impact | Guard |
|---|---|---|
| Coercion is rewarded: leverage or fear buys sexual compliance (the delta review's blocker) | low after the rule / **severe** | A romantic ask turns off compliance and backed asks for everyone; refusal, `blackmailed` plus `crossed`, a report, reputation -10; permanent tests for adults and minors in `tests/relationships.test.cjs` |
| The minor guard has a hole: a path that warms a minor, buys compliance, or sends a romance cue | low / **severe** | Decided before narration with the minor's line every turn they are present; overridden after; spark refused at every writer from A1; re-checked in every packet builder and the card; anchors on the live cast age that an import cannot strip; a permanent suite test with a 300-string fuzz and a roster pin; any failure blocks the suite |
| False positives against the player: a kind word to Kaylee costs the full consequence row | low after corroboration / high | A bare flag gives a light row only; the heavy row needs a named target plus a second signal; the eval measures recall and false friends |
| The live probe cannot be run, or fails | low / high | Both schemas are smaller than or equal to shapes known to pass; only A3 waits; the core fallback still records events; A3 waits rather than shipping without the flag |
| Test churn: about 106 existing tests edited | certain / medium | A1 edits none; every edit is listed by wave, file and line; the legacy path and the yield rule keep about 25 queued-legacy call sites unchanged; pinned numbers become behaviour assertions where the number is no longer the point |
| Classifier accuracy: 22 words, neighbour confusion | medium / medium | 22 of 41 events are engine-derived; preconditions catch staged events; the eval gates tuning; the Debug export builds the set |
| The cached narrator block: about 48 tokens left after A5 (12,952 of 13,000) | medium / medium | Everything added is measured with the api test's own estimator; anything later comes out of the 48 or shortens two example entries; the api test fails at once if exceeded; A3's fade-to-black rule and A5's rewrite are measured against a draft before they land |
| Leverage balance: a blackmail money pump, or frustration that "Wade makes it go away" | medium / medium | Demands capped at min(weight × $100, `canRaise`), `canRaise` $100 by default and raised for at most three people, paid is terminal, repeat uses compound harm, holders' reports spend their leverage; a full pass yields at most about $900; a blackmailer playstyle joins the simulator in B3 if the playtest shows abuse |
| Rng drift in seeded tests and clocks | low / medium | Sub-streams for every new draw; the burned d20; the draw-for-draw test in A2 |
| Old saves | medium / medium | The load fill keeps liking exact; Upgrade 9 refuses any write that moves liking, recognises the engine's own strings first, seeds trust and floors open secrets; what does not reach old saves is documented |
| The design's arithmetic against the code in the thirteen examples | medium / low | ±2 tolerance; the code's number is pinned and the appendix corrected in the same wave |
| Size: about 3,810 lines of A code against the design's 2,500 to 3,000 in all | certain / medium | Five shippable waves; the tooling is separate; B can wait |
| Save size: typed memories, leverage, the ask log, B ties | low / low | About 250 KB worst case per snapshot; check the IndexedDB undo-stack limit in A1; hearsay capped at 60, asks at 8, recent at 4 |
| The two separately queued bug fixes (the captured memory, the editor strip) | — / low | Not prerequisites: A2 replaces the captured memory with `noted`/own, A5's editor round-trip covers `day` and `act`, and the migration's pre-pass and day fallback tolerate both before or after the fixes |

---

## 10. Open decisions for the owner

Recommendations first. Everything not listed here is decided (section 3).

1. **The SPEC acceptance test** "Insulting the same NPC three times" (`tests/acceptance.test.cjs` L198). Recommended: keep its title and its three behaviours, and change only the two pins that measure the old arithmetic (`attitude − 45` becomes "three insults compound: -10, -15, -22, at least 45 down"; the memory weights `[2, 3]` become one merged memory of weight 3), with the final check also asserting "hates you" with its reason. The design's "three insults to someone at pride +2, or four to anyone" becomes an extra test, not a rewrite.
2. **The corroboration threshold for minors.** Recommended: a named target plus one second signal (a bookkeeper romance event, or a phrase hit). Requiring both signals would miss the euphemisms the eval exists to measure.
3. **Is blackmail meant to fund the game?** Recommended: no. `canRaise` defaults to $100, at most three people above it.
4. **What telling the police does to the target.** Recommended: the `whenTold` default (a weight-3 memory for the police member it matters to, and for a crime an inquiry seed that fills one police-clock segment); no automatic arrest.
5. **Leverage in old saves.** Recommended: informant loose ends yes (the obligation is a recorded fact), heard rumours marked `leverageOver` yes with `aware: false`, secrets shown in earlier narrator packets no (nothing records them).
6. **The labelled-eval pass bar.** Recommended as in section 8.
7. **The optional memory re-read** during the version 9 update. Recommended: offer re-running version 2's "Memories that matter" as a Settings option; no new typing call.
8. **What a relationship `/fact` buys.** Recommended: "owes me" → owed +1; "go back", "old friend", "grew up with" → knows at least 30; "trusts me" → trust +15, at most 40; "likes me" → liking +10, at most 40; all into `start`, never spark or fear; the memory stays a protected fact that moves no track and never feeds a grudge.
9. **Curtis on the eligibility list.** He is separated. Recommended: keep him with `faithful: false`, noted in `docs/notes/content.md`.
10. **The "using you" fallback wording** when distrust is not earned: "wants you" (recommended: one tag, and the card's trust word says the rest) or "wants you, doesn't trust you".
11. **A clean, unseen steal that succeeds.** Recommended: no event at the time; a later bookkeeper "found out" after the logged steal.
12. **The new obligation status `lapsed`** for the standoff and for coming clean, shown as "Dropped" in the Journal. Recommended: yes.

Carried from the first integration plan and recommended as written: `attitudeDelta` lands in everyday; edited values never fade; `/rewind` takes back remembered feelings; the unfired built-in council in games already in progress gets the trust branches through version 9; a knock-down's witnesses keep a lighter copy rather than today's weight-3 memory.

---

## 11. Deviations from SPEC.md

To be added to the README's "Deliberate deviations from SPEC.md" as each wave lands:

- **§3, the state model.** `attitude` becomes the stored alias of a derived liking; the NPC record gains `rel`; state gains `leverage`, `known`, and in B `ties` and `hearsay`; obligations gain the status `lapsed`.
- **§10, the tool schemas.** `record_changes` loses `attitudeChanges`, `newMemories` and `memoriesSettled` and gains `socialEvents` (34 properties, 3 enums; the core fallback 11 fields); `parse_action` gains `romantic` (14 properties, one small enum). The ±25-a-turn attitude cap becomes per-track clamps (liking ±40, trust ±45, fear ±40, spark ±20; ±15 through the graph).
- **§7, dice.** The ±2 attitude modifier becomes a per-roll-type modifier (persuade by liking, deceive by trust, intimidate by fear), still inside the ±4 cap; code floors the parser's difficulty and lets an adult at fear 40, or a leverage-backed ask at weight 2, skip the roll with the d20 still drawn; a romantic ask never skips a roll and always fails.
- **§8, the living world.** Grudges and favours read the tracks and typed memories; report, price, tell, inquiry and owed-favour seeds are new; the "feared" reputation tier the spec lists now exists; drift toward the written value is replaced by fading memories.
- **Rule 7, content.** Kept, with a hand-written eligibility list for attraction, a fade-to-black rule in the narrator's cached block, and the minor guard.
- **The acceptance test** "Insulting the same NPC three times": see decision 1.

---

## 12. Docs to update as each wave lands

- **README.md**: People (how people take what you say; the card, the words
  behind More, the feed lines quoted; fading; "What people hold": leverage,
  the Journal's "are owed", favours; "Word gets around" in B; a new **"Nobody
  under 18"** paragraph in plain words in A3), The story moves (Grudges and
  favours: reports, protectors, getting even; Fights; Asking again), Journal,
  `/recap` (Careful), Commands (`/fact`), "What one turn can do" (two events a
  person, four a turn), "What a turn costs" (the bookkeeper system and both
  schemas), "Updating an older game" (rows 9 and 10; what does not reach old
  saves; the "8 now"), "Editing the town" (every new authored field: `start`,
  `axes`, `secretWeight`, `canRaise`, `mattersTo`, `leverageKeys`, `whenTold`,
  `protector`, `mercenary`, `romance`, `policeHead`, `policeFallback`,
  rumours' `leverageOver`, seeds' `danger`, templates' `needs`,
  `relAtLeast`/`relBelow`; B: `ties`, `secretTies`), "Running the tests" (the
  new suites, the simulator, the eval, the probe), "Verified against the live
  API" (the probe result), "Deliberate deviations" (section 11), and the stale
  property counts at 1168-1170 and 1382.
- **docs/BUILD_PLAN.md**: the NPC contract block (`rel`, the alias, the new
  authored fields), the Game state block (`leverage`, `known`, `ties`,
  `hearsay`), the `when` keys (`relAtLeast`, `relBelow`), the effect ops table
  (`socialEvent`, `owedSettle`, `leverageSet`, `tieDelta`, `propagate`; "28"
  becomes 29, 31, 33), the module table (`Rel`), `record_changes` and
  `parse_action` at 290-305, and **Direction change 11, "People who
  remember"** (the owner's words from this plan's opening) with a sub-bullet
  per wave.
- **docs/notes**: `engine-state.md` (the record, ops, recompute, leverage,
  `lapsed`, Upgrade 9 and 10), `engine-world.md` (events at resolve, the tick,
  seeds, sub-streams, hearsay), `prompts.md` (the wire, the rubric and the
  fork, the mock, the flag, the narrator line, the cached budget, the probe
  and eval results), `transport.md` (`cleanDiff`, the packet, `/rewind`),
  `ui.md` (the card, the editor, the feed, recap, Debug), `content.md` (every
  authored field, the ready-to-paste eligibility list, Appendix C and F
  tables); and the two existing disagreements the audit found
  (`transport.md:181`'s band cuts, the "20 turns" note).
- **docs/API_NOTES.md** 234-254: the schema counts.
- **docs/CAST.md**: regenerated by `tests/cast-doc.cjs`, which gains start
  trust, axes, hard, protector and secret weight columns.
- **This plan**: its status line at the top changes from "a plan, not a
  build" to the waves that have landed.

---

## 13. Where the appendices disagree with this page

The appendices were written in sequence and each later one corrects earlier
ones; where they still differ, this page is the plan.

- **Names.** The module is `Rel` (the design's test sketch says
  `Relationships.status`); the content condition keys are `liking` and `knows`
  (the design's §6.2 still writes `warmth` and `familiarity`; `Rel.meets`
  accepts both, the validator wants the canonical names); the narrator
  fragment opens `to you:` (the first integration plan wrote `toward you:`).
- **The design's Appendix F** calls `meetingRep` "a missed meeting". It is the
  faction-reputation shift on first meeting a faction member, which lands in
  everyday; the missed appointment at `index.html:14139` is the `broke_word`
  at half strength.
- **The editor's track edits** write to `fix` (the integration plan's choice),
  not to `start` (the design's), because Upgrade 9 re-runs rebuild `start`.
- **`intimate`** is in tier A, engine-gated (the design's third version and
  the integration plan's §19.2); the design's second version put it in C.
- **Contempt** is a cue on "against you", not the thirteenth phrase the
  design's §10 first proposed.
- **The eligibility list ships with twelve adults**; the design's second
  version and the integration plan's §7 said "empty by default", superseded by
  the delta review and the integration plan's §19.5.
- **`learned_secret`'s precondition** is `state.known.secrets` plus the
  narration overlapping the secret's `leverageKeys` (integration §19.4), not
  "the secret was in this turn's packet" alone (design §2.6.1).
- **The leverage answers**: the integration plan's §8.3 pride rule is
  superseded by its §19.4 (tough refuse with violence; hard-not-tough refuse
  with gossip or a report; everyone else complies).
- **`stole_from`** from a clean, unseen success is no event at the time
  (integration §1.5); the design's row implies otherwise.
- **The standoff**: the design's second version had a gossip grudge; the third
  and the integration plan suppress the grudge and the report while both
  records are held.
- **Counts.** The casual example set has nine PRESENT entries, not the
  design's "ten". The glosses measure about 420 estimated tokens, not "about
  350"; net +164 after removals. The cached block takes +281 of the 330-token
  headroom, not the design's "about 235". Tier A is about 3,810 lines of code,
  not the design's 2,500 to 3,000 in all. About 106 existing tests change,
  not "about 30".
- **The acceptance test**: the design rewrites it; the integration plan keeps
  its title and behaviours and changes two pins. This page recommends the
  integration plan's version (decision 1).
- **The county sheriff** as the police fallback is Hoyt Bramlett (`npc_hoyt`,
  in `docs/CAST.md`'s Elsewhere list, at the courthouse in Clayburn): the
  design's third version names him; the integration plan's "read the record if
  there is one, else a town-news line" resolves to him, with the town-news
  line "A deputy from Clayburn came by asking about you."
- **The `romantic` field.** The integration plan adds a boolean and tells a
  flirt from a proposal with a code phrase list; the design's third version
  makes it `null | "flirt" | "more"`. This page takes the design's field (the
  parser classifies better than a phrase list, and the schema is far from the
  limit) and keeps the integration plan's phrase list as the backstop and as
  the second signal for minors. The probe covers the field either way.
- **Corroboration for minors**: the integration plan says "a named target plus
  a second signal"; the design's third version says "a named target plus two
  of three signals (the parser field, a bookkeeper romance event, a phrase
  hit)". They are the same rule: the parser field is one of the signals, and a
  bare field alone gives the light row.
- **Two choices the design's third version made on its own, adopted:**
  a coercion report always goes through, even when the player holds leverage
  that would otherwise bar that person from the police; and a player with no
  recorded age counts as under 18 for romance only, so an older save cannot
  open spark until an age exists.
