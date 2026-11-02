# People who remember: a relationship system for Lockett's Ferry (v3)

Design, 1 Nov 2026. It replaces the single `attitude` number. This is the
design appendix of `docs/RELATIONSHIPS_PLAN.md`; where the two disagree, the
front page wins, and its last section lists the known differences. The
engineering plan for it is `integration.md` in this folder.

- The first version was reviewed in `review.md` part one.
- v2 covered the owner's six changes and that review.
- v3 folds in the delta review of v2 (`review.md` part two, approve with ten changes).

- Code owns every number.
- The bookkeeper names acts; code derives everything it can see for itself.
- The narrator gets reasons and how to play the person, never a score.

## Changes from v2

Marked by the numbers in `review.md` part two: R is its re-check of the first review, N a new finding.

- **[N1, blocker] Coercion always fails.**
  - A romantic ask is never backed by leverage and never gets fear's no-roll ceiling, for anyone, in any tier.
  - Code fails it before narration, and the narrator is told the person refuses and what they do in the scene.
  - The events are `blackmailed` plus `crossed` at full. A report goes to their protector (or Chief Bell), and town reputation takes -10 outside the cap.
  - Tested for adults and for minors (2.5, 2.6.5, 6.2, example 14, Appendix D).
- **[N2, N6] Fade to black, and `intimate` moves into tier A.**
  - A cached-block rule (about 20 tokens): intimate scenes fade to black, nothing explicit.
  - `intimate` is an engine-gated tier A event, so a narrated night together persists. The gate needs all of these: the `romantic` flag; both adults (the player too); eligible; welcome; spark 50, liking 40, trust 30, knows-you 30.
  - Code decides before narration ("yes, and fade to black", or "not tonight; she says so kindly") and records a weight-3 scar memory.
  - `romantic` becomes `null | "flirt" | "more"`.
  - Tier C keeps only "seeing you", "old flame", lasting jealousy along lover ties, households and dependence.
- **[N6, N7] The minor guard.**
  - (a) The minor's narrator line goes in whenever a minor is present, so the parser is out of the narration safety path.
  - (b) The heavy consequences need the minor as a named target plus two signals out of three: the flag, a bookkeeper romance event, or a code phrase list. One signal gives only a light row.
  - (c) 50 labelled romantic-intent lines join the eval, with recall of 98% or more for lines aimed at minors.
  - (d) Anchors add the live `TOWN_DATA` age by id, and any record with no age and a teen-sounding role is treated as a minor.
  - (e) Fallbacks: another adult with a family or household tie, else Chief Bell alone; no police means Sheriff Hoyt Bramlett.
  - The Appendix D test grows by N11's items.
- **[N8, R3]**
  - `caught_you_at` arises only from acts with at most one witness. Never in public, never in the news, never violence. One record per act, and `mattersTo` set by kind.
  - `rescued` excludes danger the player caused.
- **[R4, scenario 3]** `kept_word` needs a named asker who is present this turn and isn't the confider, plus a `they_confided` at least a day old.
- **[N9, R9, N10a] Leverage.**
  - `learned_secret` needs the narration to contain 2 of the secret's content `leverageKeys`.
  - A backed ask needs the player's own words to reference the record.
  - `paid` is terminal for demands. A second demand is `threatened_to_tell` with no money (its own row: W -15, T -20, F +20; the integration plan's review drops the "W -10, T -15 more", and wave 29's code follows it).
  - Default `canRaise` is $100; Hollis and Jolene $300, Curtis $200.
  - `paid_silence` replaces `paid_back` for blackmail obligations.
  - No `goldDelta` is accepted from a target with a pending demand. The `LEVERAGE:` line is present-tense.
  - The d20 is drawn on every backed ask.
  - Hard-but-not-tough people refuse. Tough people plant a violence grudge. Only people who are neither comply.
- **[N3, N4, N5, N13] Spark.**
  - The caring thresholds read liking minus romance-class liking.
  - "Using you" needs earned distrust or the `mercenary` flag.
  - A status prints its feed line once per person per 7 days (`rel.status`).
  - The eligibility list ships with the 12 adults in Appendix E.
  - "Small favours come easily" is cue-only.
  - The first unwelcome flirt per person costs W -3.
- **[R1, N10b, N10c, the 13th phrase]**
  - A report through a hidden protector tie follows the hidden-tie rule.
  - Mutual deterrence suppresses grudges and reports entirely.
  - A per-secret `whenTold` hook covers telling the police: a weight-3 memory and, for a crime, an inquiry seed. Never an automatic arrest.
  - Contempt is a cue on "against you", and `exposed` counts as harm.
- **[Scenario 2, R6]**
  - A `beat_down` on a tough person plants a violence grudge whatever the liking.
  - The brawler simulator fights on Days 2, 4 and 6 only, with computed bands.
  - Every new seed and every backed or fear-ceilinged ask uses its own dice stream, with the d20 kept.
- **[R8]** §5.1 adds the validator rewrites, `Style.KNOWLEDGE`, and measuring the cached block with `tests/api.test.cjs`'s estimator (words × 1.4). The expected range is 220 to 320.
- **[N12]** §10 adds guilt by association, and a parent noticing private time with their child. Both are deferred.
- **Slips fixed.** Example 1's Day 4 line keeps "uneasy around you": fear 17 is above the band's exit at 15. Example 3c's Marcus takes T -11.5.
- **Examples.** 1, 2, 3, 4, 6, 10, 11, 12 and 13 are recomputed where these changes touch them. Example 14 (coercion) is new.

## Changes from v1 (made in v2)

### The owner's changes

1. **Spark is in tier A.** Every `rel` record carries a sixth track, spark (0 to 100), from the first build. `flirted` and `rebuffed` ship with it. `intimate` (fade to black), "seeing you" and "old flame" stay in tier C, and code refuses `intimate` in A and B.
2. **Wanting and caring are separated with one stored spark track.** Caring is liking and trust, which are already stored. Code derives five statuses from spark against those two: "has noticed you", "wants you", "using you", "sweet on you" and "falling for you". Each has its own feed line, card tag and narrator cue (2.5).
3. **Leverage is its own record, in tier A.** One record shape covers both directions: the player has something on someone, or someone has something on the player. Six events gain, use and discharge it. It links to the $200 blackmail obligation, so the money and the silence are one story. It adds stance tags, a parser rule, limits on grudges and report seeds, and a leak guard. It needs no tie graph (2.6).
4. **The minor guard is restated and airtight in tier A (2.7).**
   - It covers Kaylee (16), Micah (17) and Austin (15). Every Elsewhere and Gone record in `docs/CAST.md` is an adult; Amber Lott died at 19.
   - It also covers a player under 18 (creation allows 16).
   - The exact test is in Appendix D.
5. **New section 10:** the feelings the tracks still don't carry, and for each whether it is derived, deferred or dropped.
6. **New worked examples:** 10 (Shayla, using you, against Jodie, sweet on you), 11 (Hollis, leverage gained and used), 12 (Glenda, the $200 loose end as one leverage story) and 13 (a flirt aimed at Kaylee). Every example is recomputed against the revised tables.

### Red-team changes

Each entry is marked with the review's finding number (F1 to F18).

- **[F1] Hidden ties and secret-derived reasons.**
  - The narrator gets no cause and no name until the tie is `known` or the person's secret gate opens: "cooler since Day 4, for a reason of her own; keeps it to herself, never hint at it".
  - The card gives the day of the act, not the day the news arrived.
  - **Decision:** the card may name the act without naming the tie ("Cooler since you shamed Royce at the counter, Day 4. Hasn't said why.").
  - BETWEEN THEM lines are only sent for known ties.
- **[F2] The minor guard is decided before narration.**
  - A `romantic` intent flag on `parse_action` lets code decide before the narrator writes, and send a per-turn instruction for a minor.
  - Whatever the bookkeeper reports is overridden.
  - Parents and grandparents get `crossed` through the relation labels, so no graph is needed.
  - A minor is anyone whose cast age or current age is under 18, whichever is stricter.
  - Minors never comply out of fear and never give up secrets out of fear.
  - A threat or violence aimed at a minor always reports to a parent and to Chief Bell, and costs town reputation.
  - Tests for all of it are in tier A.
- **[F3, F9] Code derives every event it can see.**
  - From rolls: `hit` and `shoved` by attack tier, `beat_down` on the third hit (it replaces the earlier hits' memories), `threatened`, `stole_from`.
  - From money handed over: `gift` and `bribed`.
  - From presence: `spent_time`.
  - From witness counts: `humiliated`.
  - From obligations and appointments: `paid_back`, `kept_word`, `broke_word`.
  - From the parse: `flirted`, `blackmailed`, `threatened_to_tell`.
  - From state: `rescued`.
  - Duplicates are removed by class, not by word. The old weight-3 witness memory written by `knockDown` is retired.
  - The bookkeeper classifies the act as a neutral witness would name it, from about 22 words. The trait axes carry the personality.
  - The parser that reads its strings is tolerant of spelling and format slips. At the caps, the heaviest events are kept.
- **[F5] Self-reported events need preconditions code can check:** `kept_word`, `came_clean`, `exposed`, `defended`, `rebuffed`, `lied_caught`, `learned_secret` and `caught_you_at`.
  - `rescued` is engine-only.
  - `private` applies only to words.
  - Threat-made fear plants a report whatever the liking.
  - An apology must land, and it doesn't reset compounding.
  - A weight-3 harm settled the same day can still grow a grudge.
- **[F6] Bounds.**
  - The everyday bucket is held to ±15.
  - `spent_time` and gifts earn full value for the first three days, then less.
  - The devoted row needs trust above 0.
  - Witness and secondhand copies fade one class lighter, have no floor, and merge into one memory per scene.
  - Memories are evicted in a fixed order, and `noted` facts are protected.
  - Every event gives knows-you +2 or more.
  - Bands have 5 points of hysteresis.
  - **Decision:** the trust cap is dropped. The preconditions do its job.
- **[F7] Fear.**
  - Hard people (nerve +1 or more, the `tough` tag, faction heads) cap at 39 and answer violence in kind.
  - The "afraid" override applies only when liking is between -60 and 25.
  - Each person has a protector.
  - Rivals never warm police over crimes or clergy over violence.
- **[F8] Hearsay travels by kind of tie, not by schedule.**
  - Spouse and household hear overnight. Other family, boss and employee hear the next morning. Friends and others hear at the next co-location or within 2 days.
  - A household is a shared home and a family tie.
  - Hop 2 is dropped.
  - The overnight lines collapse into one.
- **[F11] Cues describe present demeanour only.**
- **[F12]** "Won't sell to you" lasts 3 days, then becomes a 25% markup. Essentials are never refused for more than a night.
- **[F13, F10] The design is made compatible with implementation:**
  - executable worked examples and a 21-day simulator (Appendix D);
  - a labelled eval of at least 150 turns before any tuning;
  - engine `attitudeDelta` effects become typed events or everyday entries;
  - turn stamps on every settled mark, tie log entry, owed entry and hearsay item;
  - track edits in the editor write to `start` (5.1).
  - The other implementation items in the review go to the integration agent.
- **[F14] What the player sees.**
  - The card's four-word grid sits behind a "more" fold.
  - The stance grid is cut to 12 phrases.
  - "Hates you" always shows its reason.
  - Feed lines change when a track crosses a band in either direction (trust coming back up has its own line).
- **[F15]** Settlements combine as `1 − (1−a)(1−b)`, at most two per memory plus getting even. Nothing locks.
- **[F16] Smaller fixes.**
  - The knobs are now a set (four signed axes; opposites cancel).
  - Each event has a reputation value.
  - Secondhand memory text comes from a template.
  - The trust route to a grudge needs a first-hand memory (except being exposed).
  - The couch rule needs liking above -25.
  - The arithmetic slips are fixed.
  - The trait count is 66, not 65.
- **[F17]** The bookkeeper's prompt is not cached today. The cost is trivial anyway.
  - The grammar goes from 41 properties to 34.
  - `parse_action` goes from 13 to 14.
  - The narrator's cached block is budgeted against its 330 tokens of headroom.
  - At most 3 memory handles a person go to the bookkeeper.
- **[F18] Missing pieces.**
  - "Takes you seriously" is derived from the town tier plus personal trust.
  - SPEC's "feared" tier comes from 3 or more people at fear 20 or more.
  - One engine route makes ties live: an arrest turns the victim's family against the arresting officer.
  - A relationship `/fact` buys one of four things, and `/fact` memories no longer feed grudges.
- **Cuts, as decided.**
  - **Kept, with guards:** the owed ledger. Owed favours plant only non-cash templates, or cash work only at liking 25 or more and trust 0 or more. The ask-back chain is "they ask twice, then a `crossed`-class memory".
  - **Dropped:** hop 2, and the faction-loyalty blend. Faction reputation stays as today. Trent's personal warmth no longer beats the Night Run's standing.
  - **Kept:** BETWEEN THEM, for known ties only.
  - **Replaced:** ten knobs become four signed trait axes, plus a `mercenary` flag on 5 people.
  - **Simplified:** fading uses four classes and one fear clock, and trust no longer fades at half speed.
  - **Kept:** knows-you as a stored track, fed mostly by code.
- **Owner-facing decisions:**
  - The council fear branch is out of this plan (listed in section 9 with the red team's objection).
  - The card names the act behind a hidden-tie change.
  - The trust cap is dropped.

## In one page

- **Six tracks per person, about you:** liking and trust (-100 to 100); fear, knows-you and spark (0 to 100); owed favours. Respect is derived, not stored.
- **A leverage record per pair:** who has something on whom, what, since when, and whether it has been used.
- **Wanting is spark; caring is liking and trust.** "Using you" and "sweet on you" are derived by code, and the narrator's cue says the difference. Flirting alone never reads as caring.
- **A night together is recorded in tier A.** Code gates it before narration, and the scene fades to black.
- **Coercion always fails.** A romantic ask backed by leverage or fear is refused, reported and costs the town's regard, for anyone.
- **A stance in 12 phrases,** plus overrides ("afraid of you", "afraid of what you know") and one or two tags ("using you", "owes you", "has something on you"). It is computed by code with hysteresis, and it always comes with its dated reasons.
- **Events:** 41 words. Code derives 22 of them from what it can see: rolls, money, presence, obligations and the parse. 17 are engine-only, and 5 the engine and the bookkeeper share. The bookkeeper names acts with 22 words in tier A, most of them with a precondition. Code scales everything by four trait axes.
- **Memories carry the cause:** four fading classes, settlements that combine, no deleting.
- **Leverage:** intimidation backed by real leverage skips the roll, but only when the player's words invoke it. Someone you have something on won't go to the police. Once it's told, they come for you. Paying for silence settles the money obligation, and a paid demand can't be made again.
- **Tier B adds one hop of spread along family, spouse, lover and boss ties,** by kind of tie, with rivals and role limits.
- **Nobody under 18,** and no player under 18, ever has spark above 0 or a romance cue, in any tier. Whenever a minor is present, the narrator is told so. The heavy consequences need a named target and two signals.
- **Recommendation:** tier B, built as A then B.

---

## 0. What is thin today, concretely

- **One number per person.** Royce at 30 opens the same doors whether you are his confidant or his best customer.
- **The model picks the number** ("±5 to ±15"), so nearly everything lands near -10.
- **Fading is one rule for everything,** and settling a memory deletes it.
- **Nothing connects people.**
- **Secrets are only text.** A successful roll sends a secret to the narrator once, and then nothing remembers that the player knows it. The $200 blackmail is a money obligation, with no record of what is being held over the player.
- **Desire isn't stored at all.**

---

## 1. Prior art, briefly

| Design | Steal | Why not as-is |
|---|---|---|
| **CK3 opinion modifiers and hooks** | Named, decaying contributions, so the reasons can always be shown. Hooks as stored leverage, spent once. | Hundreds of modifier types, numbers on screen, one opinion per pair. Its hooks are abstract tokens; ours carry the secret's own narrated words and tie to a money obligation. |
| **Dwarf Fortress / RimWorld thoughts** | Typed memories with expiry. Chitchat kept apart from big events. | Simulates everyone with everyone. Our NPCs never narrate to each other. |
| **The Sims friendship / romance** | Romance as its own track with named states. | Two stored bars to grind. We store one desire track and derive the states. |
| **Fallout: New Vegas fame / infamy** | Two counters read through a grid of named cells. | Per faction, with jokey names. |
| **Prom Week / Comme il Faut** | Social exchanges; a queryable history; several networks per pair. | Thousands of authored rules and a menu of exchanges. Free text needs a classifier, which is our bookkeeper. |
| **Versu** | A small-town code of conduct, scored when it is broken: pay your debts; don't hit a man's wife; don't run to the law; don't come on to a man's daughter. | Needs a logic engine. |
| **Shadow of Mordor Nemesis** | Callbacks and scars. | Generates characters; enemies only. |
| **Façade** | Free text classified into about 30 discourse acts. | A brittle keyword classifier; one scene. |

Takeaway: sourced, decaying contributions plus hooks; a closed set of social acts; a queryable history. And, from the review, code derives everything it can see, so the classifier names only what code can't.

---

## 2. The model

### 2.1 What each person holds about you

```
npc.rel = {
  start:   { w: 5, t: -10, f: 0, k: 0, s: 0 },   // from TOWN_DATA; editor track edits write here (5.1)
  w, t, f, k, s,                                 // derived: start + memories + everyday (+ leverage fear), recomputed by code
  owed:    [ { dir: +1, size: 2, key: "m41", day: 7, turn: 52 } ],  // +1 they owe you, -1 you owe them
  everyday:{ w: 0, t: 0, k: 0, s: 0 },           // small things not worth a memory; each held to ±15
  bands:   { w: "warm", t: "unsure", f: "uneasy" },  // with hysteresis (2.4)
  status:  { now: "sweet on you", printed: "sweet on you", printedDay: 6 },  // spark status with hysteresis; feed line once per 7 days (2.5)
  romance: null,                                 // tier C ("seeing you", "old flame")
  stance: "warm to you", tags: ["sweet on you"]  // cache for UI and conditions
}
state.leverage = [ ... ]                         // per pair, both directions (2.6)
```

| Track | Scale | Meaning |
|---|---|---|
| **Liking** `w` | -100..100 | Do they enjoy you? It is today's `attitude`, so tuning and old saves carry over. |
| **Trust** `t` | -100..100 | Will they believe you, rely on you, tell you things? Distrust is active disbelief, not just the absence of trust. |
| **Fear** `f` | 0..100 | Are they afraid of what you'll do, or of what you know? It fades fast. Leverage feeds part of it. |
| **Knows you** `k` | 0..100 | How well they know you. It never fades. Mostly code feeds it (turns aimed at them, time together), and every event adds at least +2. |
| **Spark** `s` | 0..100 | Do they want you? It fades unless it is fed. It is held at 0 for anyone not eligible (2.7). |
| **Owed** | favours, net -3..+3 | Who owes whom, apart from money. |

- **No trust cap.** v1's cap of `20 + k` only bound on days 1 and 2 (F6). The preconditions in 3.2 stop the staged gains it was meant to stop.
- **Respect is derived, not stored** (2.8).

### 2.2 How a hand-written person starts

- **Liking:** `attitude`, as written in `TOWN_DATA`.
- **Trust:** 5 × guardedness (Appendix A; -10 to +10). Then -10 for police (tag or role) and smugglers. Optional `start` overrides: Boyd -40, Jodie -25, Vada -10, Leon -15.
- **Fear:** 0.
- **Knows you:** 0. A loose-end person starts at 30.
- **Spark:** 0. Only people on the eligibility list (Appendix E, empty by default) can ever go above 0.
- **Loose ends:** the informant starts holding a leverage record over the player (2.6.4). Curtis shows "holding your marker" from the obligation itself.

### 2.3 What each track controls, mechanically

| Track | Controls |
|---|---|
| Liking | Persuade modifiers. Sitting in at cards. A couch for the night. Rescue on defeat. Sharing a rumour. Grudges and favours. The stance row. Whether a spark status reads as caring. |
| Trust | Deceive modifiers and the lie difficulty floor. Whether their secret reaches the narrator. Favours that need trust. Tips acted on. The stance column. "Using you" against "wants you". |
| Fear | Intimidate modifiers. Compliance without a roll (adults only). Report seeds. Limiting grudges to indirect kinds. The overrides. The "feared" reputation tier. |
| Knows you | With trust, the secret gate. Stranger handling in the cue. When a flirt is welcome (`opensAt`). |
| Spark | Whether a flirt is welcome (with eligibility). The five statuses and their cues (on caring liking). Jealousy. The intimacy gate (2.5). |
| Owed | Paying it back unasked (non-cash favours, or cash at liking 25 or more and trust 0 or more). Asking for it back. Rescue on defeat. |
| Leverage *(record)* | Backed intimidation. Whether they can afford to go to the police. The "tell" grudge kind. Reports that spend it. Price seeds. The leverage tags. Payment for silence. |

### 2.4 The stance: twelve phrases, computed by code

**Bands, with hysteresis:** a track enters a band at its edge value and leaves it only 5 points back. For example, "warm" is entered at 25 and left below 20; "distrusts" is entered at -25 and left above -20.

| Liking band | enter at | Trust band | enter at |
|---|---|---|---|
| hates | -60 | distrusts | -25 |
| dislikes | -25 | unsure | (between) |
| cool | -6 | trusts | 25 |
| neutral | -5..5 | | |
| friendly | 6 | | |
| warm | 25 | | |
| devoted | 60 | | |

**The grid** has 12 distinct phrases. The six the review named are kept.

| Liking \ Trust | distrusts | unsure | trusts |
|---|---|---|---|
| **hates** | hates you | hates you | hates you |
| **dislikes** | against you | against you | against you |
| **cool** | suspicious of you | cool to you | takes you at your word |
| **neutral** | suspicious of you | sizing you up · *doesn't know you* (no memories and knows-you under 10) | takes you at your word |
| **friendly** | suspicious of you | friendly | friendly |
| **warm** | fond of you, doesn't trust you | warm to you | in your corner |
| **devoted** | fond of you, doesn't trust you | loyal to you if trust is above 0, else warm to you | in your corner |

"Hates you" is always shown with its reason. It also needs an unsettled weight-3 harm behind it, or it reads "against you". `exposed` about them counts as harm.

Contempt is not a 13th phrase. "Against you" takes the cue "talks past you" when the person's top negative memories are words or honesty, not harm (section 8).

**Overrides**, checked first:

1. Romance (C): `involved` gives "seeing you"; `over` gives "old flame".
2. Fear 40 or more, **only while liking is between -60 and 25**:
   - "afraid of what you know", when leverage the player holds is the largest share of the fear;
   - otherwise "afraid of you".
   - Below -60, "hates you" stands with the tag "and afraid of you".
   - Above 25, the stance stays and the tag "wary of your temper" is added. Your friend who saw you put a man down is wary, not afraid.
   - Hard people never pass 39, so they never get this override (6.2).

**Tags.** The card shows up to two, the narrator one, in this order:

1. Leverage: "you have something on each other", "has something on you", "you have something on them". The last is dropped under "afraid of what you know".
2. Spark: "falling for you", "sweet on you", "using you", "wants you", "has noticed you".
3. Fear: "and afraid of you", "wary of your temper".
4. Debts: "owes you" or "owes you big", "you owe them", "holding your marker".
5. "uneasy around you" (fear 20 to 39).

### 2.5 Spark: wanting against caring (decision)

**Decision: one stored spark track, statuses derived by code.**

- Caring is already stored as liking and trust: sourced, fading and explained by memories. A second "affection" number would duplicate them and drift away from them.
- Every case the owner named is a spark level read against liking and trust:
  - wants you but doesn't like you;
  - wants you and doesn't trust you;
  - falling for you;
  - devoted with no desire (spark 0: "loyal to you", correctly);
  - an old flame who still wants you.
- No behaviour needs two stored numbers, because fading already provides it. Spark fades in days unless it is fed; liking from a romance memory fades on the wound or scar clock.

**Caring liking (N3).** The statuses' caring thresholds read *caring liking*: liking minus whatever liking came from romance-class events (`flirted`, `intimate`). Flirting raises spark and liking, but it can never on its own make anyone "sweet on you". The stance grid still reads full liking.

**Earned distrust (N4).** "Using you" needs earned distrust, or the `mercenary` flag.

- Earned distrust is an unsettled first-hand harm or honesty memory the player caused: a caught lie, a theft, a hit, a cheat, being crossed, threatened or blackmailed.
- Someone who started out distrustful and has had nothing done to them (Jodie, at -25) reads "wants you" instead.

**Statuses**, derived on every read and only when eligibility holds (2.7). First match wins, with 5 points of hysteresis on every threshold.

| Status | When | Narrator cue (present demeanour) | Feed line |
|---|---|---|---|
| seeing you *(C)* | romance `involved` | "easy and close with you; careful in front of others" | "You're seeing Jodie Strayhorn." |
| old flame *(C)* | romance `over` | spark 40+: "still wants you; won't say so". Under 40: "polite; doesn't stand close any more" | "Things with Jodie Strayhorn are over." |
| falling for you | spark 60+, caring liking 50+, trust 25+ | "lights up when you come in; stands close; asks where you've been" | "Jodie Strayhorn is falling for you." |
| sweet on you | spark 30+, caring liking 25+ | "lights up when you come in; remembers what you told her" | "Jodie Strayhorn is sweet on you." |
| using you | spark 40+, liking under 25, trust -25 or less, with earned distrust or `mercenary` | "wants you around for one reason; doesn't ask about your day" | "Shayla Rawls is interested. It isn't friendship." |
| wants you | spark 40+, liking under 25, otherwise | trust -25 or less: "flirts back; keeps it light; doesn't trust you". Otherwise: "flirts back; keeps it light; not sure she likes you" | "Curtis Pruett is interested." |
| has noticed you | spark 20+, none of the above | "looks twice; finds a reason to stand near you" | "Jodie Strayhorn looks at you twice." |

**"Sweet on you" and "falling for you" are cue-only.** They change how the person is played, not what code lets them do. Favours still follow the favour rule (6.2).

**How a status remembers itself (N5).** `rel.status = { now, printed, printedDay }`.

- `now` is the status with hysteresis: it is left only when a defining threshold is missed by 5.
- A feed line prints when `now` changes to a status that differs from `printed`, or when `printedDay` is 7 or more days ago. Then `printed` and `printedDay` are updated.
- Fading out prints nothing.

**What feeds spark:**

- A welcome `flirted`: +10 × the person's `sparkRate`.
- `spent_time` with someone already at spark 10 or more: +2.
- `intimate`: +15.

**What lowers it:**

- `rebuffed`: -15.
- An unwelcome flirt: -5.
- Any weight-3 harm the player does to them halves it.

**Fading:** spark from flirts fades on the slight clock with no floor (half-life 5 days); spark from intimacy fades on the scar clock.

**Welcome.** The parser sets `romantic: "flirt"` or `"more"`. Code decides before the narrator writes, and all of these must hold:

1. They pass eligibility (2.7).
2. Knows-you is at least their `opensAt`.
3. They are not at "against you" or "hates you".
4. They are not `faithful` to a partner.
5. The turn is not coercion (below).

Liking is not required. The narrator is told the answer for that turn: "Shayla Rawls is open to it: she flirts back, her own way", or "Annette Overstreet isn't interested: she turns it aside". An unwelcome flirt costs W -3 the first time per person (N13), then -6 each time after.

**Intimacy is in tier A and fades to black (N2).**

- `romantic: "more"` means the player proposes going further than a flirt: going upstairs, staying the night, a kiss meant to lead somewhere.
- **The gate**, decided by code before narration, needs all of these:
  - `romantic: "more"`;
  - both adults, the player too (2.7);
  - eligible, and a flirt would be welcome now;
  - spark 50 or more, liking 40 or more, trust 30 or more, knows-you 30 or more;
  - not coercion.
  - Money never helps: a gift the same turn adds nothing to the gate.
- **Yes:** the narrator gets "`<Name>` says yes; fade to black." The engine records `intimate` (W +10, T +5, K +15, S +15, weight 3, scar). It is private: no witnesses, no news, no reputation.
- **No, but a flirt would be welcome:** "`<Name>` says not tonight, kindly." The turn counts as a welcome flirt.
- **No, and a flirt wouldn't be welcome:** the person's own refusal ("`<Name>` isn't interested: she turns it aside").
- **The cached block carries the rule:** "Intimate scenes fade to black: nothing explicit; cut to afterwards."
- Tier C keeps only "seeing you", "old flame", lasting jealousy along lover ties, households and dependence.

**Coercion always fails (N1).** A turn with `romantic` set (flirt or more) is coercion if any of these hold:

- it is an intimidate;
- it is backed by leverage (2.6.5);
- the player's words carry a threat phrase;
- its target is at fear 40 or more and the line asks something of them.

For anyone, in any tier, coercion is handled like this:

1. Nothing is complied with and no roll is skipped. Code fails it before narration (the d20 is still drawn, on its own stream).
2. The narrator is told: `COERCION: <Name> refuses, flatly, and <in-scene act>`. The act is: turns to their protector, if present; else tells you to get out, in their own home or workplace; else walks away.
3. Events: `blackmailed` (its row, whether or not a leverage record exists; a record that exists is marked used) plus `crossed` at full, both weight 3.
4. A report goes at once to their protector, or Chief Bell, or the sheriff fallback (Appendix F). Coercion reports ignore the leverage police bar.
5. Town reputation -10, outside the cap.
6. If the target is a minor, the minor rule applies as well (2.7).

**Eligibility ships** with the 12 adults in Appendix E, and the owner edits the list. Leaving married people off is a default, not a rule: Curtis is separated and stays on.

### 2.6 Leverage: who has something on whom

```
state.leverage = [ {
  id: "lev_hollis_1",
  holder: "player",                 // or an npc id
  over:   "npc_hollis",             // or "player"
  about:  { kind: "secret", npcId: "npc_hollis" },   // secret | seen | loose_end
  text:   "runs the landing's cash through his pawn books",   // as the narration showed it; never the secret field
  weight: 3,                        // 1-3, from content (2.6.3)
  since:  { day: 2, turn: 14, via: "learned_secret" },
  aware:  true,                     // the one it is over knows the holder has it
  playerKnows: true,                // the player knows this record exists (always true when the player holds it)
  status: "held",                   // held | used | paid | spent | void
  demand: null,                     // { amount, dueDay, paid, turn } owed to the player; or { obligationId } owed by the player
  uses:   [ { day: 3, turn: 21, event: "blackmailed" } ],
  knownBy: [],                      // who was told (spent)
  mattersTo: ["npc_marcus"]         // who the telling would hurt them with (Appendix C; 2.6.1 for caught_you_at)
} ]
```

**The lifecycle:**

- A record starts `held`.
- It becomes `used` when a demand or threat is made.
- It becomes `paid` when silence is bought. **`paid` is terminal for demands.** The holder still knows, and stays quiet.
- It ends `spent` (told) or `void`. It is void when the holder is dead, gone or arrested; when the one it is over came clean to the people it mattered to; or after a standoff (2.6.4).

#### 2.6.1 How leverage is gained

**By the player, with `learned_secret` (over X).**

- **From the bookkeeper, with two preconditions:**
  1. X's secret was in this turn's narrator packet (`ctx.revealSecretFor`: a successful social roll aimed at X, or the trust 40 and knows-you 30 gate).
  2. **The narration contains at least 2 of X's `leverageKeys`** (N9). These are 2 or 3 short content-written phrases per secret, matched by stem and in any order (Appendix C: "garage account", "tapes", "cash book").
- **From the engine:** the player hears a true rumour that content marks `leverageOver: X`.
- Anything else is refused and logged.
- `private` here means X doesn't know the player knows (`aware: false`). It is the one non-words event where `private` is allowed.

**By someone else, over the player, with `caught_you_at` (by X) (N8).**

- **Only for an act with at most one witness, the one who caught you.** Never in a public place, never in the news, never violence: violence is already a memory and news.
- One record per act.
- **From the engine:** a "someone saw you" complication on such an act that names X.
- **From the bookkeeper**, with a precondition: the player's action this turn was a steal, a sneak, a search of X's things or place, or a lie to X, and at most one other person was present.
- **Weight:** theft 2, a search or sneak 1, a lie 1.
- **`mattersTo`:**
  - the victim, for a theft or a search of their things;
  - the police, for a crime against someone else;
  - nobody, for a lie (it matters only to X).

**The informant loose end:** at game start the bound informant holds a record over the player, with the player's own loose-end words and `playerKnows: false`.

#### 2.6.2 How leverage is used and discharged

| Event | Source | What it does |
|---|---|---|
| `blackmailed` (X) | **Engine.** A backed ask (2.6.5) with a price in the player's words ("$300"). Also when an NPC names a price to the player (the loose-end seed, the price template): recorded on the record only. And any coercion (2.5). | Status `used`. The player's demand is stored on the record ("are owed" in the Journal). An NPC's demand is the blackmail obligation. |
| `threatened_to_tell` (X) | **Engine.** A backed ask with no price. **A second demand on a `paid` record** is this event, with no money ("you said that was the end of it"). Wave 29's code, after the integration plan's review: the row alone, nothing more, and the paid record's fear part stays halved. | Status `used` (unless it was `paid`, which stays `paid`); `aware` becomes true. |
| `paid_silence` (X) | **Engine.** The blackmail obligation is met, or the player's demand is paid by its seed. **For a blackmail obligation it replaces `paid_back`:** one payment, one event. | Status `paid`. |
| `told_anyway` (X) | **Engine.** The obligation's `onMiss`; a "tell" grudge; a report seed that spends it. When the player tells after being paid: `exposed` plus an engine `broke_word`. | Status `spent`; whoever was told goes into `knownBy`; `whenTold` runs (2.6.5). |
| `exposed` (about Y, to X) | **Bookkeeper**, with a precondition (3.2). | Spends the player's record over Y; `whenTold` runs. |
| `came_clean` | **Bookkeeper**, with a precondition. | Voids a record held over the player about that thing, once they come clean to the person in `mattersTo`. |

**Leverage events feed the fear clock and the report seed exactly as `threatened` does** (6.2).

#### 2.6.3 Weight and what a demand can buy

- **NPC secrets:** `secretWeight` from 1 to 3 per person (Appendix C, default 2).
- **The player's loose-end options:** "what I did before I came" 2, "a name that isn't mine" 2, "carrying something stolen" 3.
- **Being caught:** 2.6.1.
- **A money demand** is capped at $100 × weight and at `canRaise`.
  - **The default `canRaise` is $100** (N9).
  - Content raises it for three people with money to hand: Hollis Byrd $300 (the pawn till), Jolene Overstreet $300 (the envelope in the chest freezer), Curtis Pruett $200 (the card game's float).
  - Anyone under 18: $0.

#### 2.6.4 The link to the blackmail obligation (one story)

1. **Game start.** The record is held over the player: holder is the informant, weight from the option, `mattersTo: ["npc_marcus"]`, `playerKnows: false`.
2. **The seed fires** ("names a price"). The engine records `blackmailed` on the informant's side. The obligation `obl_blackmail_<npc>` is created as today. The record becomes `used`, with `demand.obligationId` set, and `playerKnows` becomes true.
3. **Paid in full.** The obligation is met, and in the same apply **`paid_silence` runs in place of `paid_back`**. The record becomes `paid`. The informant takes W +5, T +10 ("good for it"). The existing `onMet` memory stays.
4. **Missed.** `onMiss` is `told_anyway`: the record becomes `spent`, and `knownBy` gets `npc_marcus`.
   - The existing `onMiss` memory on Marcus stays, and its flat `attitudeDelta -10` becomes `told_anyway` (W -5, T -15).
   - The informant's own -10 becomes `broke_word` for the informant ("would not pay").
5. **A standoff: mutual deterrence (N10c).** The player holds aware leverage over the informant, and the informant is not hard.
   - While both records are held, **neither side's grudges or reports against the other are planted at all**. The informant plants nothing.
   - On the due day the obligation becomes "can no longer be", with no `onMiss`. Both records stay `held`.
   - The feed says "Glenda Pryor lets it drop."
6. **Coming clean to Chief Bell** about the loose end voids the record. The obligation becomes "can no longer be".

When the player blackmails someone, the demand lives on the player's record, not in `player.obligations`. The Journal lists it under "are owed": "Hollis Byrd: $300 for keeping quiet, due Day 4 (1 day)".

- **The money moves only when the payment seed fires.** Until then, no `goldDelta` is accepted from a target with a pending demand to the player (R9).

#### 2.6.5 What leverage does

**Fear of what you know.** While the player holds aware leverage over X (status held, used or paid), X's fear gets a derived part: 10 × weight.

- It is halved if X's trust in the player is 40 or more.
- It is halved again once paid, and back to full after a second demand.
- It disappears when the record is spent or void.

**A backed ask.** All of these are needed, and code checks each:

1. An intimidate or persuade aimed at X.
2. The record's id in `aboutIds`.
3. **The player's own words reference the record (N9):** one of its keys, two content words of its text, or a threat phrase ("or I tell", "or `<name>` hears", "I know about", "I've seen your", "unless you want"). Otherwise it is an ordinary ask: rolled as usual, no leverage, no `blackmailed`.
4. **It is not romantic.** A romantic ask is never backed; it is coercion (2.5).

How a backed ask rolls:

- Weight 2 or more: no roll. Weight 1: easy. A target that is hard but not tough: normal.
- **The d20 is always drawn**, on the ask's own dice stream (6.2).
- A backed ask aimed at a minor rolls as usual, whatever the weight (2.7).

**Their answer**, decided by code at resolve time (R6, N10a):

| Who X is | X's answer |
|---|---|
| **Tough** (Wade, Colt, Boyd, Leon, Dwight) | Won't pay. A violence grudge seed is planted at once, whatever their liking. |
| **Hard but not tough** (Carter, Marcus, Loretta, Tammy, Nikki, Trent) | **Refuses.** A report to their protector, where they have one and the police bar allows it; otherwise a gossip grudge. |
| **Neither**, pride +1 or more, fear under 40 | Refuses ("Tell him, then."). |
| **Anyone else** | Agrees, within weight and `canRaise`. |

**The packet line is present tense (R9):**

- `LEVERAGE: Hollis Byrd agrees to pay $300 by tomorrow evening; pays nothing now.`
- `LEVERAGE: Tammy Lott refuses: "Tell them, then."`

**Grudges and reports:**

- Held, aware leverage the player has over X bars X's police grudges and police reports against the player; the report goes to X's next protector. Hard people are the exception, and so are coercion reports.
- **Mutual leverage held both ways suppresses every grudge and report between the two** (2.6.4).
- Once the record is spent or void, the bar lifts, and X's grudge check runs on the next tick.
- An NPC holder at liking -60 or less spends what they have through a "tell" grudge (`told_anyway` to `mattersTo`).
- A holder's report seed spends it to their protector.
- A `mercenary`-flagged holder at liking 10 or less may name a price ($50 × weight, due in 2 days).
- **A report through a hidden protector tie follows the hidden-tie rule (R1).** Hollis's report to Wade puts "Cooler since Day 3. Hasn't said why." on Wade's card, with the day of the act and no name. Wade's narrator reason has no cause and no name. Nothing shows the Night Run link, because that link is Hollis's secret.

**Telling the police: the `whenTold` hook (N10b).** When a secret is told (`exposed` or `told_anyway`) to someone in its `mattersTo` who is police (tag or role), the secret's `whenTold` runs. If the secret has no hook, a default applies:

- **Default:** that officer gets a weight-3 memory written from a template, "was told `<record text>`". Where the secret is a crime (`crime: true` in Appendix C), the default also plants "an inquiry" seed, which fills one segment of the police clock.
- **There is never an automatic arrest.** Arrests come only through the existing clock completions and seeds.

```
whenTold: {
  police: { memory: "was told Hollis Byrd runs the landing's cash through his pawn books", weight: 3,
            inquiry: { effect: "Chief Bell spends a morning at Byrd's Pawn going through the ledgers.",
                       dayOffset: [1, 2], effects: [ { op: "clockAdjust", factionId: "fac_police", delta: 1 } ] } }
}
```

Two more hooks:

- **Colt (the pills):**
  - Memory: "was told Colt Purvis sold Amber Lott the pills".
  - Inquiry: "Chief Bell starts asking at Riverbend who sells pills to kids." Police clock +1.
- **Wade (Calvin Ogletree):**
  - Memory: "was told Wade Purvis beat Calvin Ogletree half to death below the landing".
  - Inquiry: "Chief Bell drives to the county home in Clayburn to see Calvin Ogletree." Police clock +1.

If the police are gone, the sheriff fallback takes the memory (Appendix F).

#### 2.6.6 What never leaks

- A record the player holds exists only if X's secret was in the narrator packet that turn **and** the narration contains 2 of its keys. A marked true rumour that was heard also counts.
- The record's text is the bookkeeper's words for what the narration showed, never the `secret` field. Debug shows both.
- A record held over the player reaches the card and the narrator only once `playerKnows`, or on the turn the holder's seed is due.
- Reports through hidden protector ties show only the day.
- Weight, `mattersTo`, `canRaise`, the keys, and the answer before it happens stay hidden.
- A hidden tie written into a secret becomes `known` when the player holds a record whose text names it.
- **Tier A stands alone.** The record, its events, the obligation link, tags, the parser rule, the grudge and report rules, the protectors and `whenTold` need no ties. B adds the tie change from `SECRET_TIES` and lets the telling spread.

### 2.7 The minor guard (airtight in tier A)

**Who is a minor.** A record is treated as a minor if any one of these says so. The strictest wins:

- its age in the save's `TOWN_DATA` copy (`state.town`) is under 18;
- its current age is under 18;
- **for the built-in town, its age in the live `TOWN_DATA` by id** is under 18 (N7);
- it is tagged `teen` or `teenager`;
- **it has no age at all and its role, tags or look read as a teen** (N7). This fails closed. The pattern is roughly `teen|teenager|student|schoolgirl|schoolboy|high school|county school|after school|kid|child|minor|freshman|sophomore|junior|senior at|grade`.

Editing an age can make someone a minor; it can never make one an adult. An import that strips the town copy's age, the current age and the tags together is still caught by the live `TOWN_DATA` anchor.

I checked all 66 records in `docs/CAST.md`:

- **In town:** Kaylee Pittman (16), Micah Dees (17), Austin Lott (15).
- **Elsewhere:** all 17 are adults.
- **Gone:** all 8 died adults (Amber Lott at 19).
- **The player:** creation allows 16 to 90, and a player with no age is treated as under 18 for romance only.

**1. Before narration: the line goes in whenever a minor is present (N6a).** Every turn a minor is in the scene, their person line gets this, whatever the parser said:

> `Kaylee Pittman is 16: never flirts or is flirted with; any advance alarms her; she gets away or goes to her father.`

- That is about 25 to 30 tokens per minor present, per turn.
- The parser is no longer in the safety path for narration.
- For a player under 18, every packet carries "The player is under 18: nobody in this town flirts with them or takes a flirt from them as anything but a kid talking."

**2. Three signals, and corroboration for the heavy consequences (N6b).**

| Signal | What it is |
|---|---|
| (i) the flag | The parser's `romantic` flag, aimed at the minor or at everyone with the minor present. |
| (ii) the bookkeeper | A bookkeeper romance event (`flirted`, `rebuffed`, `intimate`) naming the minor. |
| (iii) the phrase list | A hit on the code phrase list over the input. |

**The phrase list** (`ROMANCE_PHRASES`) is lowercased, matched on word boundaries, and covers Say and Do lines. It has two tiers:

- **Strong (one is enough):**
  - kissing and sex words (kiss, make out, hook up, sleep with, go to bed with);
  - asking someone out (go out with me, a date with me, what time do you get off, your place, come upstairs, come home with me);
  - wink-at and touch verbs aimed at a person (wink at, touch, stroke, hand on her knee or waist);
  - explicit body or sex words.
- **Weak (two different ones needed):**
  - endearments (sweetheart, honey, babe, baby, darling, gorgeous);
  - looks words aimed at a person (pretty, beautiful, cute, lovely, you look);
  - smile-at.

So "Thanks, sweetheart" is one weak term and no hit. "What time do you get off, sweetheart?" is a strong hit.

**The consequences:**

- **One signal** gives the minor a light row: a weight-1 memory written from a template, "made me uncomfortable at the register" (W -3, K +2). Nothing goes to parents or police, and reputation doesn't move.
- **The full row needs the minor as a named target** (the Say chip on them, or a Do action targeting them) **and at least two of the three signals:**
  - the unwanted advance row for the minor: W -20, T -20, F +10, weight 3, wound, with no spark part, and whatever the bookkeeper sent for them that turn is replaced;
  - each parent or grandparent in town takes `crossed` at full (W -12, T -12), with a weight-3 memory from a template, "came on to my daughter at the register";
  - each of them plants a report to Chief Bell at once, whatever their liking or fear;
  - town reputation -10, outside the cap.
- **Coercion of a minor** (2.5) adds the coercion consequences on top. The reputation penalties stack, to -20.

**Guardians and police when they are missing (N7e):**

- **Guardians:** each parent or grandparent who is free, in town and alive (Kaylee: Royce, Darlene; Micah: Ray, Nadine; Austin: Tammy). If none is, another adult with a family or household tie. If there is nobody, Chief Bell alone.
- **Police:** if Chief Bell is arrested or gone, or the department has been ended, a report goes to **Sheriff Hoyt Bramlett** (Elsewhere, in Clayburn: "a deputy comes when called"). He gets the memory on his record, and a town-news line appears: "A deputy from Clayburn came by asking about `<player>`."

**3. No fear rewards from minors.**

- Minors are excluded from no-roll compliance and from fear-opened secrets.
- A leverage-backed ask aimed at a minor rolls as usual, and their `canRaise` is $0.
- **Any threat or violence aimed at a minor** (`threatened`, `threatened_to_tell`, `blackmailed`, `shoved`, `hit`, `beat_down`) always plants a report to each guardian (with the fallbacks) and to Chief Bell. Town reputation takes -10 for violence, -5 for a threat, outside the cap.

**4. Spark can't move.**

- `rel.spark` is 0 for a minor. `State.apply` refuses any write that would raise it, from any source (model, world, edit, import, upgrade, cheat, `/fact`), and logs the refusal. An imported non-zero value is set back to 0 at load.
- Status derivation returns none before it reads a number.
- The narrator, parser and bookkeeper packet builders each check age again.
- The Edit form has no Interested control for a minor.
- `validate-town.cjs` refuses a minor on the eligibility list.
- `intimate` is never possible with a minor, or for a player under 18.

**5. Measuring it (N6c).** About 50 labelled romantic-intent lines join the eval (Appendix D), including euphemism and Do mode ("ask what time she gets off", "I wink at Micah"). Targets:

- detection recall of **98% or more** for lines aimed at minors (any one signal);
- no full-row consequence on the labelled kind remarks.

Appendix D gives the test, including the one the owner asked for: any under-18 record with spark above 0 or a romance cue fails.

### 2.8 Respect, standing and the feared tier

- **"Takes you seriously"** is derived. When the town tier is "respected" or "feared", or the person's trust is 25 or more, the cue may add "takes you seriously" if it has room. Nothing new is stored.
- **Town reputation** now moves only on public events (two or more witnesses, or news), by the reputation column in 3.1, clamped to ±5 a turn as today (the minor penalties are outside the clamp).
- **The "feared" tier.** SPEC §8 lists it, but the code never had it. It is given when 3 or more people in town are at fear 20 or more. Order: despised, feared, respected, known, noticed, unknown.

---

## 3. Events, not deltas

### 3.1 The vocabulary (41 events)

**E** is engine-derived. **B** is the bookkeeper's, with the precondition in 3.2. **E/B** means the engine derives what it can see and the bookkeeper may report the rest.

Columns:

- W, T, F, K, S: liking, trust, fear, knows-you, spark.
- Rep: town reputation when the event is public.
- Class: the fading class (3.5).
- Dedupe: the class used to drop duplicates (3.6).

| Event | Src | When | W | T | F | K | S | Owed | Rep | Wt | Class | Dedupe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `hit` | E | Attack roll succeeds. One fight is one memory; a second hit in the same fight raises it to ×1.4. | -25 | -10 | +20 | +2 | halves | | -3 | 3 | wound | violence |
| `shoved` | E | Attack roll partial or failed | -15 | -5 | +5 | +2 | | | -2 | 2 | slight | violence |
| `beat_down` | E | The third hit; replaces the fight's memory. On a tough person it plants a violence grudge (6.2). | -35 | -15 | +35 | +2 | halves | | -5 | 3 | scar | violence |
| `threatened` | E | Intimidate roll. Success as shown; failure W -10, F +5. With 2 or more witnesses, W -15. | -10 | -10 | +25 | +2 | | | -2 | 2 | slight | threat |
| `threatened_to_tell` | E | Backed ask, no price; or a second demand on a paid record (2.6.2) | -15 | -20 | +20 | +2 | halves | | | 2 | wound | threat |
| `blackmailed` | E | Backed ask with a price; or any coercion (2.5) | -25 | -30 | +15 | +2 | halves | | | 3 | scar | threat |
| `stole_from` | E/B | E: a steal they saw or were present for (a failed attempt counts ×0.5). B: they found out later, with a logged steal against them. | -20 | -25 | | +2 | halves | | -5 | 3 | wound | theft |
| `gift` | E | $5 or more, or an item, handed over unasked. The first 3 gifts to a person count in full, then +1 each. | +5 | | | +2 | | | | 1 | slight | money |
| `bribed` | E | A gift plus a persuade or deceive aimed at them that turn. Never spreads. | +3 | 0 | | +2 | | | | 2 | slight | money |
| `spent_time` | E | Once a day: a phase together with Say aimed at them. Full the first 3 days per person, then W +1, K +2. | +2 | | | +4 | +2 if spark ≥ 10 | | | none | everyday | |
| `humiliated` | E | An `insulted` with 2 or more other witnesses becomes this | -15 | -5 | | +2 | | | -2 | 2 | slight | words |
| `paid_back` | E | Obligation payment, but not for a blackmail obligation (that is `paid_silence`) | +5 | +10 | | +2 | | clears | +2 | 2 | settles debt | money |
| `kept_word` | E/B | E: obligation met or appointment kept. B: kept a confidence (3.2: a named asker present, a confidence at least a day old). | +5 | +15 | | +2 | | | +2 | 2 | wound | money (E) |
| `broke_word` | E | Missed obligation or appointment; or telling a paid-for secret | -8 | -15 | | +2 | | | -3 | 2 | wound | |
| `rescued` | E | State put them in danger the player didn't cause (a fight they were in, a hurt fate, a seed marked `danger`), and the player's action aimed at them succeeded. Danger from the player's own fight, or from a seed the player's action fired, doesn't count (R3). | +25 | +15 | | +5 | | +2 | +5 | 3 | scar | |
| `flirted` | E | The parser's `romantic` flag. Welcome: as shown. Unwelcome adult: W -3 the first time per person, then -6; T -3, S -5. Minor: 2.7. Coercion: 2.5. | +4 | | | +2 | +10 × rate | | | 1 | mood | romance |
| `intimate` | E | **Tier A**, gated and decided before narration (2.5). Private. | +10 | +5 | | +15 | +15 | | | 3 | scar | romance |
| `paid_silence` | E | Silence paid for (2.6.2). The player paid X: as shown. X paid the player: W -5. | +5 | +10 | | +2 | | | | 1 | slight | money |
| `told_anyway` | E | The holder told (2.6.2). The figures are for whoever was told. | -5 | -15 | | +2 | | | -5 | 2 | wound | |
| `cheated` | E/B | E: a marked deck caught. B: a deal, and they know. | -15 | -30 | | +2 | halves | | -5 | 3 | scar | theft |
| `lied_caught` | B | They found out the player lied to them | -5 | -30 | | +2 | | | -2 | 2 | wound | |
| `came_clean` | B | Owned up (3.2) | 0 | see 3.2 | | +3 | | | | 2 | wound | |
| `confided` | B | Told them something private about themselves | +3 | +5 | | +8 | | | | 1 | wound | |
| `they_confided` | B | They told the player something private | +5 | +3 | | +10 | | | | 2 | wound | |
| `betrayed_confidence` | B | Passed on what they were told in confidence | -20 | -40 | | +2 | | | | 3 | scar | |
| `exposed` *(about Y)* | B | Told them Y's secret. X takes the row shown; Y, on hearing who told, takes W -30, T -30, weight 3, scar. It counts as harm for "hates you". | 0 | +8 | | +3 | | | | 2 | wound | |
| `complimented` | B | Praise or thanks | +3 | | | +2 | | | | 1 | mood | words |
| `insulted` | B | A put-down (code may upgrade it to `humiliated`) | -10 | | | +2 | | | | 1 | mood | words |
| `apologised` | B | An apology that lands (3.2) | +2 | | | +2 | | | | none | settles by 0.5 | |
| `pried` | B | Pressed hard on what they didn't want to discuss | -3 | -3 | | +3 | | | | 1 | mood | words |
| `rebuffed` | B | The player turned down their advance | -5 | | | +2 | -15 | | | 1 | slight | romance |
| `did_favour` | B | Real help they asked for or needed | +8 | +5 | | +3 | | +1 | | 2 | wound | |
| `they_helped` | B | They did the player a favour | +2 | | | +3 | | -1 | | 1 | wound | |
| `defended` *(against Z)* | B | Stood up for them against Z | +15 | +10 | | +2 | | | +3 | 2 | wound | |
| `informed_on` | B | Told the law or their boss on them, and they know | -30 | -35 | +10 | +2 | halves | | | 3 | scar | |
| `crossed` | B | Worked against what they want, and they know (also engine: coercion, the minor rule) | -12 | -12 | | +2 | | | | 2 | wound | |
| `badmouthed` *(about Y; B tier)* | B | Ran Y down to them (4.5) | | | | +2 | | | | none | tie | |
| `vouched_for` *(about Y; B tier)* | B | Spoke up for Y to them (4.5) | | | | +2 | | | | none | tie | |
| `noted` | B | A claim, terms or a promise they will hold the player to (protected; at most 3) | | | | +2 | | | | 1 | keeps | |
| `learned_secret` *(over X)* | E/B | 2.6.1: the secret in the packet and 2 of its keys in the narration | | | derived | +2 | | | | 1 | keeps | |
| `caught_you_at` *(by X)* | E/B | 2.6.1: at most one witness; never public, news or violence | -5 | -10 | | +2 | | | | 2 | wound | |

Code also adds `card_win` and `card_loss` (today's ±1 / ±2, once a day) as everyday entries.

**What the bookkeeper may send:** 22 words in A, 24 in B. It classifies **the act, as a neutral witness would name it**, and the trait axes carry how this person takes it.

**Jealousy is a witness rule, in tier A:**

- A partner (by static label) who sees the player flirt with theirs: W -15, T -10, scaled by pride. Memory: "flirted with Shayla in front of me".
- Someone at spark 30 or more for the player who sees them flirt with another: W -8, T -5, S -5.

### 3.2 Preconditions on what the bookkeeper reports

| Event | Precondition code checks | If it fails |
|---|---|---|
| `kept_word` (a confidence) | **All three (R4):** (1) the memory words name an asker; (2) that asker is present this turn and is not the confider; (3) an unsettled `they_confided` from the confider at least a day old. At most once per person per 3 days. | Downgraded to `confided` |
| `came_clean` | Settles a `lied_caught` memory (trust part × (1 − 0.4)), or marks a logged deceive aimed at them as confessed (T 0; a later `lied_caught` about it counts ×0.25). Net trust over a lie and its confession is never positive. | Becomes K +3 only |
| `lied_caught` | A logged deceive aimed at them, or a `noted` claim of theirs about the player | Refused |
| `exposed` (about Y) | The player holds a leverage record over Y. A second exposure to the same X costs X's trust -8 instead. | Becomes `badmouthed` (B), or K +2 (A) |
| `betrayed_confidence` | An unsettled `they_confided` from them | Becomes `crossed` |
| `defended` (against Z) | Z present, and the narration showed Z's hostile act. Nothing goes to kin if the player targeted Z earlier in the scene. | Becomes `complimented` |
| `apologised` | It must land: a successful persuade, or liking above -25. It never resets compounding. | K +2 only |
| `rebuffed` | They have a spark status for the player | Refused |
| `badmouthed`, `vouched_for` | A successful persuade roll. Once per pair per day. At most ±20 in all per tie. | K +2 only |
| `learned_secret` | X's secret in this turn's packet **and** at least 2 of X's `leverageKeys` in the narration (N9) | Refused |
| `caught_you_at` | The player's action was a steal, a sneak, a search of X's things or place, or a lie to X; **at most one other person present; not a public place; not violence** (N8) | Refused |
| `stole_from`, `cheated` (B) | A logged steal or deal aimed at them | Refused |
| `private` flag | Words events only (`insulted`, `complimented`, `pried`, `confided`, `they_confided`, `apologised`, `noted`). On `learned_secret` it means they don't know. | Ignored |

Engine events have their own checks: a backed ask (2.6.5), coercion (2.5), `rescued` (3.1) and the minor signals (2.7).

### 3.3 Repeats

- **Kind things repeated** to the same person on the same day: 1, ½, ¼, then 0. Across days, `spent_time` and `gift` drop to their reduced value after the first three days per person. A nightly round makes regulars warm, never devoted.
- **Harm repeated** to the same person within 3 days compounds: ×1.5, then ×2.25. The memories merge ("kept insulting me") and the weight rises by one, up to 3. Settling a memory doesn't reset the count. Leverage uses on the same record compound the same way.
- **Per-turn clamps per person:** liking ±40, trust ±45, fear ±40, spark ±20. Through the graph: ±15 for liking and trust.

### 3.4 Traits: four signed axes and one flag

Each trait adds -1, 0 or +1 to at most two axes, so opposites cancel. A person's axis is the sum, clamped to -2..+2 (Appendix A maps all 66 traits).

| Axis | − end | + end | Effect per point |
|---|---|---|---|
| **Pride** `p` | humble | proud | Liking from words-bad, `humiliated`, `shoved`, `blackmailed` and `rebuffed` × (1 + 0.25p). Settle factors × (1 − 0.2p). At p ≥ 1 with fear under 40, refuses leverage demands. |
| **Guardedness** `g` | suspicious | open | Start trust 5g. Trust gains × (1 + 0.2g). Trust losses × (1 − 0.15g). |
| **Nerve** `n` | timid | hard | Fear gains × (1 − 0.25n). At n ≥ 1 the person is **hard** (6.2). |
| **Grudge-holding** `r` | grudging | forgiving | Harm half-lives × 2^(−r/2). Settle factors × (1 + 0.15r). |

**The `mercenary` flag** is set by hand on 5 people: Hollis, Shayla, Tyler, Curtis and Leon.

- Money given to them (`gift`, `bribed`, `paid_back`, and `paid_silence` when the player pays) counts ×2 on liking.
- `blackmailed` counts ×0.5 on liking (it's business).
- As holders of leverage, they may name a price.

Dropped from v1: PRINCIPLED, LOYAL, the separate FORGIVING / GRUDGING knobs, `patient`'s delay, and LOYAL's propagation multiplier.

Spark is never scaled by a trait. Only the hand-written `sparkRate` scales it.

### 3.5 How long things last

What remains of a memory's effect after `age` days is `floor + (1 − floor) × 0.5^(age / halfLife)`.

| Class | Half-life | Floor | Used by |
|---|---|---|---|
| mood | 2 days | 0 | insults, compliments, prying, flirts (liking part) |
| slight | 5 days | 0.2 for harm, 0 for kind | humiliation, threats, shoves, gifts, rebuffs, spark from flirts |
| wound | 10 days | 0.4 | a hit, a theft, a caught lie, crossing, being caught at something, a threat to tell; and the kind ones (a kept word, a favour, being defended, a confidence) |
| scar | 21 days | 0.6 | a beating, a betrayed confidence, cheating, informing, a rescue, a blackmail, intimacy |

- **One fear clock:** a half-life of 4 days, floor 0, for every source except leverage. Leverage fear is derived and lasts while the record does.
- **Trust fades at the same speed as liking.**
- Knows-you never fades. Leverage records never fade.
- **Witness and secondhand copies** fade one class lighter (scar becomes wound, wound becomes slight, slight becomes mood), have floor 0, and merge into one memory per scene. Bystanders recover; the people it happened to don't.

### 3.6 What goes over the wire, and how it is read

`socialEvents` is a list of strings. It replaces `attitudeChanges`, `newMemories` and `memoriesSettled`. That removes 8 properties and adds 1: 41 down to 34, and 4 enums down to 3.

```
socialEvents: list(STR, '"npc_id event[ npc_about][ private]: what they would remember", e.g.
  "npc_dewayne apologised: hitting me over the tow bill"
  "npc_dewayne exposed npc_mavis: told me Mavis spent the garage money"
  "npc_hollis learned_secret: runs the landing's cash through his pawn books"
  "npc_shayla lied_caught: never went through the academy with Travis"
  "npc_royce kept_word: kept quiet when Elbert asked how I'd vote"
  "npc_marcus noted: says she is a surveyor from the state"')
```

**The tolerant parser:**

1. **Alias table:** case, spelling, tense, hyphens and spaces. `apologized`, `apologise` and `apology` read as `apologised`; `insult` and `insults` as `insulted`; `threaten` as `threatened`; `kept word`, `kept-word` and `keptword` as `kept_word`; `came-clean` as `came_clean`; `lied` as `lied_caught`; `confide` as `confided`; and so on, then a unique 5-letter stem.
2. **Tokens:** an npc id, an event word, an npc id (the about-id) and `private` are consumed in any order, with any colons or commas between them, up to the first word that is none of these. The rest is the memory text. The colon is optional, so `"npc_dewayne: hit: ..."` and `"npc_dewayne hit me in my bay"` both parse; the second gives `hit` with "me in my bay" (the engine's `hit` then wins anyway).
3. **About-ids:** when one is missing on `exposed`, `badmouthed`, `vouched_for` or `defended`, it is inferred from the first cast name in the text (a full name, or a first name only one person has). A spurious about-id on an event that takes none is ignored.
4. **Unknown or engine-only words** from the bookkeeper (`hit`, `gift`, `flirted`, …) are dropped and logged. A bookkeeper `flirted` without the parser's flag becomes `complimented` for an adult. For a minor it is one of the three signals (2.7).

**Removing duplicates, by class.**

- An engine event of a class drops the bookkeeper's events of that class for the same person that turn.
- An engine violence event (`hit`, `shoved`, `beat_down`) also drops the bookkeeper's `humiliated` and `threatened` for that victim.
- An engine money event (`paid_back`, `gift`, `paid_silence`) also drops the bookkeeper's `kept_word` and `did_favour` for that person.
- An engine `flirted` drops the bookkeeper's `complimented` and `flirted` for that person.
- **Engine against engine (N9):** for a blackmail obligation, `paid_silence` replaces `paid_back`. One payment is one event.

**Caps:** the bookkeeper may send at most 2 events per person and 4 per turn. Over the cap, code keeps the heaviest: by weight, then by the largest liking plus trust change. Engine events are not capped.

**The prompt** gains 22 one-line glosses with example lines (about 350 tokens). It is sent uncached, as today; at Haiku 5.5 prices that is about $0.00004 a turn. "Be conservative: small attitude shifts" is deleted. The packet carries at most 3 memory handles per person.

### 3.7 Why this is better than the LLM writing numbers

1. **Consistency** across days and models.
2. **Code derives what it can see** (rolls, money, presence, obligations, the parse). The model only names acts code can't see.
3. **Personality is applied once,** in code, testably.
4. **The graph, fading, settling, reasons, grudge kinds and leverage all need a type.**
5. **One table to tune, against a simulator** (Appendix D).
6. **The grammar shrinks.**
7. **Safety is enforced by code** before narration, not left to a prompt.

### 3.8 How it fails, and the guard for each

| Failure | Guard |
|---|---|
| Neighbouring events confused (`insulted` / `humiliated` / `crossed`; `gift` / `bribed`; `kept_word` / `confided`) | Most of those pairs are now split by code (witness count, money plus an ask, preconditions). **A labelled eval of at least 150 turns runs before any tuning** (Appendix D). |
| Inflation | Caps; kind repeats diminish; `spent_time` and gifts diminish across days; everyday ±15. |
| A betrayal missed | Violence, threats, theft, money, obligations and leverage use are engine events. |
| Wrong person | Ids are checked against who is present; an absent victim needs a present witness; preconditions. |
| Double counting | Duplicates are removed by class. |
| Staged kindness (fake `kept_word`, confess-repeat, staged rescue) | 3.2. |
| Invented leverage | `learned_secret` needs the secret in that turn's packet. |
| Romance with a minor | The narrator line whenever a minor is present; heavy consequences only with a named target and two of three signals; overridden after; refused at write; tested, with parser recall measured (2.7). |
| A false `romantic` flag on a kind remark to a minor | One signal gives only the light row; no parents, police or reputation (2.7). |
| Coercion (leverage or fear behind a romantic ask) | Always fails before narration; refusal line; `blackmailed` plus `crossed`; report; reputation -10 (2.5). |
| Fabricated or accidental leverage | `learned_secret` needs 2 keys in the narration; a backed ask needs the player's own words to reference the record (2.6). |

---

## 4. The social graph: people about each other (tier B)

### 4.1 Ties

```
state.ties["npc_mavis>npc_dewayne"] = { kind: "spouse", w: 30, t: 20, hidden: false, known: true,
                                        log: [ { day: 5, turn: 41, why: "the garage money" } ] }
```

- **Derived ties:** every relation label becomes a directed tie, with defaults by kind: spouse 50/40, parent to child 70/30, child to parent 50/40, sibling 40/30, grandparent 60/40, aunt or uncle 40/20, cousin 30/20, friend 40/30, boss to employee 20/20, employee to boss 20/10, landlord or tenant 5/0, in-law 20/10.
- **Hand-written ties:** about 40 (Appendix B).
- **Hidden ties:** `hidden: true`, with `revealedBy`.
- **Only people in town** take part: free, alive, presence "here".

### 4.2 How much a tie carries (one hop only)

| What B is to A | Base factor |
|---|---|
| child or grandchild | 0.8 / 0.6 |
| lover (hidden) | 0.7 |
| spouse or partner | 0.6 |
| sibling, parent, nephew or niece | 0.5 |
| friend, cousin, aunt, uncle or grandparent | 0.4 |
| in-law | 0.3 |
| employee | 0.25 |
| boss, or someone A pays or is paid by | 0.2 |
| fellow faction member with no other tie | 0.15 |
| landlord or tenant | 0.1 |

The factor is then adjusted:

- × (0.5 + 0.5 × A's liking for B / 100).
- **Rivals:** if A's liking for B is -20 or less, the factor becomes A's liking for B / 200, which is negative.
  - **Except:** police (tag or role) never warm over crimes (violence, theft, cheating), and clergy (`priest`, `pastor`) never warm over violence.
- A teen victim ×1.25 for parents and grandparents.
- Saw it ×1.0, heard it ×0.75.

**Which tracks carry:**

- Liking and trust at the factor; fear at half, and only for violence; rivals take trust at half.
- Owed: rescuing or defending someone's child or spouse puts that parent or spouse at owed +1.
- Spark and leverage never travel.

**Thresholds:** a carried change under 2 on every track is dropped; from 2 to 4 it goes into the everyday bucket; from 5 up it becomes a secondhand memory (weight one less than the source, one class lighter, floor 0).

### 4.3 Who knows, and when (by kind of tie)

| Tie to the person it happened to | Delivered | Strength |
|---|---|---|
| Present (witnesses) | At once | The witness row, plus the tie factor ×1.0 |
| Spouse, and household (a shared home **and** a family relation; never just the motel or the trailer park) | Overnight (the next night tick, or the next morning if it is already night) | ×0.75 |
| Other family, boss and employee | The next morning | ×0.75 |
| Friends, lovers, rivals and others | At the next co-location or within 2 days, whichever comes first; or the next morning if it was town news | ×0.75 |

- **No hop 2.**
- Hearsay is held in `state.hearsay` (each item carries the turn it was made on) and expires after 4 days.
- News moves only people tied to the person it happened to.

**The witness row** (an onlooker with no tie; the copy is one class lighter, floor 0, one memory per scene):

| Event seen | Onlooker change |
|---|---|
| `hit` | W -5, T -5, F +8 |
| `shoved` | W -3, F +3 |
| `beat_down` | W -8, T -6, F +12 |
| `threatened` | W -3, F +5 |
| `insulted`, `humiliated` | W -2 |
| `defended`, `rescued` | W +5, T +5 |
| `kept_word` | T +3 |
| A cheat caught | T -10 |
| A lie exposed in public | T -5 |

This replaces the old weight-3 witness memory that `knockDown` wrote.

**One feed line overnight**, whoever heard: "Word got round: Lorna, Colt and Wade Purvis have heard about the landing." Up to three names, then "and others".

### 4.4 How the bookkeeper tells code who saw it

- **Default:** everyone code lists as present who isn't laid up.
- **`private`:** words events only (3.2). It spreads only to household and spouse, at ×0.5.
- **An absent victim** is accepted with a present witness, and is delivered through that witness by its tie class.
- **A phone call:** people in the room hear only words events, at half.

### 4.5 How ties change

1. **`exposed` (about Y, to X), with a record over Y:**
   - `SECRET_TIES` (Appendix C) changes the tie from X to Y.
   - X toward the player: trust +8, or liking -8 if X likes Y at 60 or more (the messenger).
   - Y learns who told by tie class and takes W -30 T -30. In tier A, Y always learns by the next morning.
2. **`badmouthed` / `vouched_for`, on a successful persuade roll:**
   - X's liking for Y moves ∓10 / ±8, scaled by `clamp((X's trust + 50) / 100, 0, 1)`.
   - Once per pair per day, and at most ±20 in all from the player's words.
   - Badmouthing Y to someone who likes Y at 40 or more costs the player 5 of X's liking instead.
3. **The arrest route (engine).** When someone in town is arrested, their family in town turns against the officer who arrested them (W -20, T -20, logged with the turn). If the player's `informed_on` or tip led to it, the player also gets it through the usual spread.
4. **Content `tieDelta` ops,** and grudge or favour templates that name other people, become `propagate` ops along the ties.

**BETWEEN THEM** lines go to the narrator, and tie words to the card ("wife Mavis Mangum, strained since Day 5"), only for **known** ties the player was present for.

### 4.6 Factions and protectors

- Faction reputation moves as today: the sum of members' liking changes / 5, at most ±5 a turn.
- **The loyalty blend is dropped.** A member's personal warmth no longer beats their faction's standing, so Trent's warning about the ramp follows his own tracks and the favour gates, not a blend.
- **Protectors** are per-person content (Appendix F), with defaults from the relation labels:
  - a parent or grandparent for a minor (and always Chief Bell as well);
  - else a boss;
  - else the police.
- The police are skipped while the player holds aware leverage over them (2.6.5), unless they are hard. Coercion reports are never skipped.
- **"Nobody"** (faction heads, Boyd) means the report becomes a grudge seed instead: gossip, or violence if they are tough.
- **A report through a hidden tie** (Hollis to Wade) follows the hidden-tie rule (2.6.5, R1).
- **Missing protectors and police** fall back as in Appendix F (N7).

---

## 5. History as cause

### 5.1 The memory record, and what implementation must keep

```
{ turn: 41, day: 5, text: "told Dewayne about the garage money", weight: 3,
  event: "exposed_about_me", d: { w: -30, t: -39, f: 0, k: 2, s: 0 },
  decay: "scar", settled: [ ], secondhand: false, via: null, place: "loc_purvis_landing",
  key: "m41-npc_mavis", sourceKey: null, leverageId: "lev_mavis_1", act: "talk", seen: true }
```

- **Tracks:** `start + Σ remaining + everyday` (each held to ±15), plus derived leverage fear. Recomputed on every `State.apply` and every morning tick.
- **`rel.status = { now, printed, printedDay }`** holds the spark status with its hysteresis and when its feed line last printed (2.5).
- **Eviction at the 12-memory cap:** secondhand first, then mood, slight, wound and scar, kind before harm within a class. `noted` (at most 3), loose-end memories and `/fact` lines are protected. An evicted remainder moves into everyday.
- **Spark parts** are written as 0 for anyone not eligible.

**For implementation (made compatible here, built by the integration agent):**

- **Typed events.** Every engine `attitudeDelta` effect becomes a typed engine event or an everyday entry (Appendix F).
- **Turn stamps.** Every settled mark, tie log entry, owed entry and hearsay item carries the turn it was made on, so `/rewind` can strike them. Everyday entries stay, and that is documented.
- **The People editor** round-trips every memory field. Its track edits write to `start`. "Add a memory" uses a short event picker, or saves the line as `noted`.
- **Dice streams (R8, scenario 2).** Every new seed (report, price, tell, owed favour, inquiry, coercion report) and every backed or fear-ceilinged ask draws from its own stream: `Rng.create(hash(game seed, npcId, day))`, as the card code already does. A skipped or forced roll still draws its d20, so the shared stream never shifts.
- **The validator and the style module (R8):**
  - The validator's `))` split (`tests/validate-town.cjs:1946`) is rewritten as a real parser of the new PRESENT format, with nested `(Day N)` and `; `.
  - The literary pin `Mechanic: … attitude −10.` (1919) is rewritten with the example turns.
  - `Style.KNOWLEDGE` loses "remembers list": people know only what their memories and the stance line say.
- **Measure the cached block first (R8).** Before anything more goes into it, run `tests/api.test.cjs`'s own estimator (words × 1.4) against a draft of the ten rewritten example entries, the fade-to-black rule and the hidden-tie wording. Expect 220 to 320 against the 330 of headroom (section 8).

### 5.2 Reasons the stance can show

- **The reasons** are the two memories with the largest remaining effect on the tracks that decided the stance, turned to second person, with their day. Repeats collapse ("drank with you at the landing, three nights").
- **"Hates you" always shows its reason.**
- **Spark statuses** give one spark reason and one reason for what holds liking or trust down.
- **Leverage reasons** are the record's text, with its day and status.

**Through a hidden tie, or from a secret not yet open:**

- **Narrator:** no cause and no name. `cooler since Day 4, for a reason of her own; keeps it to herself, never hint at it`.
- **Card:** names the act, with the act's day, never the tie: "Cooler since you shamed Royce at the counter, Day 4. Hasn't said why."
- Once the tie is `known`, or the person's secret gate opens, the narrator gets the cause as an ordinary reason.

**A report that reached someone through a hidden tie** (R1) is handled by the same rule, except that the card gives only the act's day: "Cooler since Day 3. Hasn't said why." Naming the act there would show the tie, which is the secret.

**A memory planted off-screen by a seed** shows only after the player has been in a scene with that person since.

### 5.3 Settling: softened, combined, never locked

| How it is settled | Liking | Trust | Fear |
|---|---|---|---|
| `apologised` (if it lands) | 0.5 | 0.25 | not at all |
| `paid_back` on a debt | 1.0, plus W +5 | 1.0 | |
| `came_clean` on a `lied_caught` | | 0.4 | |
| `kept_word` after a `broke_word` | 0.7 | 0.35 | |
| `did_favour` aimed at a grudge | 0.5 | 0.25 | |
| They got even (their grudge came due) | 0.4 | | |

- **Settlements combine:** `1 − (1−a)(1−b)`, at most two per memory plus getting even. Nothing locks.
- Pride and grudge-holding scale the factors (3.4).
- **A weight-3 harm settled on the same day it happened still grows a grudge** at liking -60 or less.
- **Settling doesn't reset compounding.**
- Secondhand copies are settled by the same factor when the news of the settling reaches them.
- **Leverage memories are ended by their record,** not by words. An apology counts against a `blackmailed` memory at half factor, and only after the record is `paid` or `void`.

### 5.4 Secondhand and witness text

The text comes from an event template plus the place and the day, never from rewriting the victim's words:

- "heard you hit Dewayne Mangum at Pittman's"
- "saw you put Colt Purvis down at the landing"
- "heard you shamed Royce Pittman at the counter"

### 5.5 What the narrator gets

- Two reasons, three at most, with their days.
- The cue.
- Up to two `noted` facts.
- Never a number.

---

## 6. Dynamics

### 6.1 Fading and drift

- Memories fade by class.
- Everyday entries drift 2 a day toward 0 on days you don't see the person, and are held to ±15.
- Fear and spark fade on their clocks.
- Loose-end memories don't fade while the loose end is open.
- Leverage records never fade.

### 6.2 Thresholds

**Social roll modifiers.** The relationship's share is at most ±2, inside the ±4 cap.

| Roll | By | Modifier |
|---|---|---|
| persuade or charm | liking | ±1 at 30, ±2 at 60 |
| deceive | trust | +2 at 40 or more; -1 at -25 or less; -2 at -50 or less |
| intimidate | fear | +1 at 20; +2 at 40; -1 against anyone who likes you at 40 or more |

**Difficulty floors and ceilings:**

- **Floors:**
  - At least hard for any ask of someone at "against you" or "hates you".
  - A lie to someone at trust -25 or less: at least hard. At -50 or less: very hard.
  - Hard people: at least hard to intimidate.
- **Ceiling:** an adult afraid of you (fear 40 or more) does a small thing with no roll. **Never a romantic ask** (2.5). Never a minor. The d20 is drawn on the ask's own stream.
- **Leverage-backed asks:** 2.6.5. Never romantic, never on a minor without a roll, always with the d20 drawn.

**Hard people:**

- Nerve +1 or more, the `tough` tag, or a faction head (Wade, Carter, Marcus).
- Fear capped at 39, so they never comply out of fear.
- **Tough people** (Wade, Colt, Boyd, Leon, Dwight) answer violence with violence. **A `beat_down` on a tough person plants a violence grudge whatever their liking** (scenario 2): beat Wade down in front of his town and he answers.
- **Hard but not tough people** (Carter, Marcus, Loretta, Tammy, Nikki, Trent) answer violence with the police or their protector, and refuse leverage demands (2.6.5).

**The secret gate:** trust 40 or more and knows-you 30 or more; or a successful social roll aimed at them; or fear 60 or more after a successful intimidation (never a minor). A secret shown in the narration, with 2 of its keys, becomes leverage.

**Grudges:**

- Liking -60 or less with an unsettled (or same-day-settled) weight-3 harm. `exposed` about them counts as harm.
- Or trust -60 or less with an unsettled **first-hand** betrayal (`lied_caught`, `betrayed_confidence`, `cheated`, `informed_on`, `blackmailed`), or `exposed` about them: talk or police kinds.
- Or a `beat_down` on a tough person: a violence grudge, at once.
- **The kind comes from the event class:**
  - violence → violence (if tough) or police;
  - theft → police, gossip or money;
  - words → gossip, ban or money;
  - betrayal → gossip or police;
  - a holder of leverage over the player → "tell".
- **Limits:**
  - Fear 40 or more allows only police or gossip.
  - Held, aware leverage the player has over them bars police (unless hard); the bar lifts when the record is spent or void.
  - **Mutual leverage held both ways suppresses every grudge and report between the two** (2.6.4).
  - `/fact` memories never feed a grudge.

**Favours:**

- Liking 50 or more and trust 20 or more with a weight-2 help memory.
- Or owed +2 or more at any liking above -25: non-cash templates only, or the $100 cash work at liking 25 or more and trust 0 or more. The favour spends the debt.
- Trust gates: the alibi needs 40; the ramp warning and the photo need 30.

**You owe them:** after 5 days unpaid, they ask, and they ask again 3 days later. Then they take a `crossed`-class memory.

**The report seed** (its own dice stream; fires within 1 to 2 days):

- When:
  - fear is 40 or more and the fear came from the player's threats (`threatened`, `threatened_to_tell`, `blackmailed`), whatever the liking;
  - fear is 40 or more from violence and liking is 0 or less;
  - always, at once, for coercion (2.5) or for a threat or violence aimed at a minor (2.7).
- To whom: the protector (4.6, Appendix F), or a grudge if the protector is "nobody".
- What the protector takes: a typed `crossed`-class event (police: W -5, T -10; family or a boss: W -10, T -10), and a memory written from a template.
- Through a hidden protector tie, the hidden-tie rule applies (2.6.5).
- If the reporter holds leverage over the player, the report spends it.

**Price seed:** a `mercenary` holder at liking 10 or less names a price ($50 × weight, due in 2 days).

**Flirt welcome, the intimacy gate and coercion:** 2.5, decided before narration.

**Places to sleep and help in a fight:**

- **Couch:** liking 25 or more and trust 0 or more; or they owe you and their liking is above -25.
- **Rescue on defeat:** liking 25 or more, or owed +1 or more, unless their stance is "afraid of you".

**Cards and rumours:**

- Sit in at the card table: liking above -25 and trust above -40.
- Curtis deals: liking -10 or more and trust above -40.
- Sharing a rumour: liking above -25, and trust above -25 unless they are tagged gossip.

**Council and epilogue conditions:**

- Royce: `relAtLeast: { npc_royce: { trust: 30, familiarity: 25 } }`; the friendly face, `{ warmth: 15 }` plus `playerAt`; bought, `{ trust: 20 }`.
- Loretta: `{ warmth: 40 }`.
- `attitudeAtLeast` keeps reading as liking. Spark is not readable by town-event conditions.

**Feed:** 7.2.

### 6.3 Behaviour the tracks make possible

- **Afraid of you** (adults only): small asks go through with no roll, never romantic ones; a report comes in a day or two. Fear fades in days.
- **Afraid of what you know:** careful with every word, and can't go to the police; the report goes to their next protector. The day it is told, the fear goes and the grudge comes.
- **Has something on you:** a cold holder spends it; a mercenary one names a price; a frightened one tells their protector. Paying buys quiet, not forgetting, and a paid demand can't be made again.
- **You have something on each other:** a standoff. Neither plants a grudge or a report against the other, and the blackmail lapses.
- **Coercion never works:** they refuse, the protector hears, the town hears.
- **Using you:** keeps a late meeting and flirts back, but tells you nothing (trust under 40), does you no favours, won't offer a couch.
- **Wants you:** flirts back and keeps it light. It isn't caring, and it opens no secrets.
- **Sweet on you / falling for you:** cue-only ("lights up when you come in"), and jealousy when they see you flirt elsewhere.
- **A night together** (tier A, gated): recorded and private, then fade to black.
- **Fond of you, doesn't trust you:** helps with small things and lies about big ones.
- **Takes you at your word:** a tip you give them is acted on (`actsOnTip: { trustAtLeast: 25 }`).
- **Against you, with contempt:** when their top negative memories are words or honesty, not harm, the cue becomes "talks past you". It is not a new phrase.
- **Owes you:** pays it off unasked.
- **You owe them:** after 5 days they ask; after 3 more, a `crossed`-class memory.
- **A manager or owner at "against you" or "hates you"** won't sell to you for 3 days, then sells at 25% over. A bed, gas or food is never refused for more than one night unless a grudge template says so.
- **A household against you as a unit:** tier C.

### 6.4 Worked examples

Each example is its own playthrough, with numbers rounded. Day 1 is Thursday 8 October; Day 4 is Sunday (the Low Water shut); Day 6 is Tuesday (the council).

Trait axes used below (Appendix A):

| Person | Axes |
|---|---|
| Dewayne | g -1 |
| Mavis | g -2, r -1 |
| Royce | g +1, n -1 |
| Marcus | g -1, p +1, r -1; police; hard (faction head) |
| Wade | n +1, r -1; tough; faction head |
| Colt | n +1, p +1; tough |
| Lorna | g +1, r +1 |
| Trent | g +1, r +1, n +1 (hard) |
| Tammy | n +1, r -2 (hard) |
| Tyler | g -1; mercenary |
| Hollis | g +1; mercenary |
| Glenda | 0; police by role |
| Shayla | 0; mercenary |
| Jodie | g -1 |
| Burl | g +1, p +1 |
| Loretta | n +1 (hard) |
| Travis | p +1, n -1; police |
| Kaylee | g -1; minor |
| Micah | p -1, g +1; minor |

#### 1. Dewayne in his own bay (A, then B)

- **Situation.** Day 3 morning at Pittman's; Royce, Jodie and Lamar are there. Dewayne is at knows-you 7 from Day 2. The player hits him over a tow bill.
- **Events.** Engine `hit` (the attack roll succeeded).
- **Tracks.**
  - Dewayne: W -25, T -5 − 10 × 1.15 = **-17**, F 20, K 9. "against you · uneasy around you".
  - Witnesses (one slight-class memory each, floor 0):
    - Royce: W -5, T -4, F +10.
    - Jodie: W -5, T -6, F +8.
    - Lamar: W -5, T -5, F +10.
  - B: Mavis (spouse and household; overnight; 0.29): W -7, T -4, F +3. **W -12, T -14.** Memory: "heard you hit Dewayne Mangum at Pittman's". (Wave 31's code, pinned by `tests/relationships-examples.test.cjs`: exactly so, at the night tick, the memory "heard Tester hit Dewayne Mangum at Pittman's Gas and Service", weight 2; the next morning W -11. Royce, Dewayne's boss, saw it, so his witness copy carries his tie's share as well: W -9, T -6, F +12.)
- **Day 4.** The apology rolls charm and succeeds; it must land, because Dewayne is at -25, not above it. The engine adds `gift` ($40 for his safety glasses).
  - The hit's liking is halved to -12; its trust is eased by a quarter to -8; fear 20 has faded to 17.
  - Gift +5, apology +2.
  - **Dewayne: W -5, T -13, F 17, K 13** (the code: K 15, with +1 for each turn aimed at him): "cool to you · uneasy around you". Fear 17 is still inside "uneasy", which is entered at 20 and left below 15. Liking has the same hysteresis: cool is entered at -6 and left only above -1, so W -5 is still cool, not "sizing you up" (corrected in wave 28, when the example became a test).
  - Mavis's copy is halved the next morning, to about **W -8**. (The code: the apology's settlement reaches her copy at the next night tick, the same 0.5 and 0.25; W -8 the morning after.)
- **Narrator (Day 4).** `Dewayne Mangum ... to you: cool to you; uneasy around you — hit him in his bay over a tow bill (Day 3, apologised); paid for his glasses (Day 4) — plays it: civil and brief; keeps a step back`
- **Player sees.**
  - Day 3: "Dewayne Mangum won't forget that."
  - Day 4: "Word got round: Mavis Mangum has heard about Pittman's."
  - "Dewayne Mangum lets some of it go."

#### 2. The garage money (A: leverage held, then spent; B: the tie changes)

- **Situation.** The same game. Day 4 night at the motel desk, a charm roll with Mavis succeeds, so her secret is in the packet. The narration has her say she emptied Dewayne's garage account to pay off the note on her mother's house. That contains two of her keys, "garage account" and "mother's note".
- **Events.** `npc_mavis learned_secret: emptied Dewayne's garage account for Mama's note` (both preconditions met). `lev_mavis_1`: weight 3, aware, `mattersTo: npc_dewayne`.
- **Tracks.** Mavis: fear of what you know 30. **W -8, T -13, F 33**: "cool to you · you have something on her" (the card also shows "uneasy around you"). (Wave 29's code, pinned by `tests/relationships-examples.test.cjs`, runs the example alone, without example 1's Day 3: **W -5, T -10, F 30**, "sizing you up · you have something on them · uneasy around you". The tag says "them" for everyone, as the integration plan's tag list has it.)
- **Day 5 evening, at the landing.** `npc_dewayne exposed npc_mavis: ...` (precondition met).
  - The record is spent. Mavis's secret is not a police matter, so no `whenTold` runs.
  - Dewayne: trust +6, so **T -7**.
  - B: the tie Dewayne→Mavis goes from 50/60 to 30/15.
  - Mavis by morning: W -30, T -39; the leverage fear goes. **W -38, T -52, F 2.** (Run alone: W -35, T -49, F 0.)
- **Stance.** Mavis: **"against you"**.
  - `exposed` counts as harm, so the contempt cue doesn't apply.
  - The police are no longer barred.
  - The liking route to a grudge needs two more humiliations. The trust route needs one caught lie.
- **Behaviour.** The motel is "full" for one night, then charges 25% more for 3 days.
- **Narrator (Day 6).** `Mavis Mangum ... to you: against you — told Dewayne about the garage money (Day 5); hit Dewayne at Pittman's (Day 3, made good) — plays it: polite as a locked door; wants you gone` (Wave 30's code: the reasons are joined by " / " and the cue's clauses by ", ", since "; " splits the packet's fields, and "wants you gone" is "would rather you left", since "wants you" is the spark status the minor check looks for.)
- **Player sees.**
  - Day 4 night: "Mavis Mangum knows you know."
  - Day 6: "Word got round: Mavis Mangum has heard what you told Dewayne." (Tier B. In tier A as wave 29 has it, the band line the morning after: "Mavis Mangum won't forget that." Wave 32 shows both, the band line second. She hears it that night, his wife under one roof, and her memory of it is dated Day 5, the telling.)
  - Her card: "Against you" / "You told Dewayne about the garage money. Day 5" / "You knew: the garage money. Day 4 · told Dewayne, Day 5".
  - Dewayne's card: "wife Mavis Mangum, strained since Day 5". The narrator, with the two of them there: `BETWEEN THEM: Dewayne Mangum and Mavis Mangum, strained since the garage money (Day 5).`

#### 3. Royce, three ways (A: the council reads trust, not beers)

Royce starts at W 10, T 5. He is at the Low Water in the afternoons, as is Elbert.

- **(a) The confidant.** Days 2 to 5.
  - `spent_time` four days: W +7, K +14. Turns aimed at him: K +12.
  - Day 4: `they_confided` (Carter's note): W +5, T +4, K +10. And `confided`: W +3, T +6, K +8.
  - Day 5: Elbert, at the card table, asks the player how Royce will vote. The player says nothing, with Royce right there.
    - `npc_royce kept_word: kept quiet when Elbert asked how I'd vote`.
    - All three preconditions are met: the asker is named; Elbert is present and is not the confider; the confidence is a day old.
    - W +5, T +18, K +2.
  - **Tracks:** **W 29, T 32, K 46**. "in your corner". (Wave 30's code, pinned by `tests/relationships-examples.test.cjs` with one turn aimed at him an afternoon, has **W 26, T 32, K 32** on the morning of Day 6: the K +12 above is three turns a day. Trust, the number the vote reads, is the design's.)
  - **Council:** trust 30 and familiarity 25 holds: tabled, police kept. (The condition is `relAtLeast: { npc_royce: { trust: 30, knows: 25 } }`: the code names the track `knows`.)
  - **The fake path no longer works.** A Day-1 confidence plus "Carter asked me and I told him nothing" on Day 2 fails twice: the confidence isn't a day old, and Carter isn't present. It is downgraded to `confided` (T +6), and the branch fails.
- **(b) The drinking buddy.** Rounds on Days 2 to 4, four compliments, `spent_time` four days.
  - **Tracks:** **W 32, T 5**. "warm to you". (The morning after Day 5: the code closes Day 5 at W 36 and fades to 32 overnight.)
  - **Council:** only the "friendly face" branch, if the player is in the room.
  - Ten more nights of rounds keep him "warm to you": gifts then count +1 a night, and the everyday bucket stops at +15. Trust doesn't move.
- **(c) The bully.** Engine `threatened` on Day 4 and Day 5.
  - **Tracks:** **F 66** on Day 5, **55 by Tuesday evening**. **W -14, T -15**: "afraid of you". (The code: T -16 on Day 5, F 56 on Tuesday evening.)
  - **Report:** threat-made fear fires whatever the liking. Royce's protector is the police: "Royce tells Chief Bell you've been leaning on him." Marcus takes **W -5, T -11.5** (police row, scaled by his guardedness, g -1). (The code's seed reads "Royce Pittman goes to Marcus Bell and says Tester has been leaning on them, and Marcus Bell writes it down."; Marcus's memory carries W -5, T -12.)
  - **Council:** the fear branch is out of this plan.
- **Leverage on Royce** (his Carter secret, weight 3, keys "note on the station" and "truck stop") makes him "afraid of what you know". Royce isn't hard, so he would agree to a money demand within the default $100. His report can't go to the police, and he has no boss, so it becomes a gossip grudge. The vote still reads trust. (Wave 30's code: weight 3 is fear of what you know 30, as Mavis's in example 2, so he reads "you have something on them · uneasy around you"; the override, "afraid of what you know", starts at fear 40.)

#### 4. Colt on the ground (B: kin cool, rivals warm)

- **Situation.** Day 7 evening at Purvis Landing; Lorna, Trent and Dewayne are there. Three hits: the engine's `hit` memory grows on the second, and the third is `beat_down`, which replaces it.
- **Colt** (tough: hard, capped at 39): **W -30, T -25, F 26**. "against you · uneasy around you". Town reputation -5.
- **Colt's answer.** He is tough, so the beat-down plants a violence grudge at once, whatever his liking. It comes due Day 10 to 12: "gets you away from the others and beats you". It was done in front of three people and is news, so nobody gets a `caught_you_at` record.
- **Witnesses**, with the tie added:
  - Lorna (aunt, 0.43): **W -18, T -6, F 19**: "cool to you".
  - Trent (friend, 0.32): **W -9, T -14, F 13**: "cool to you".
  - Dewayne: the witness row.
  - (Wave 31's code, pinned by `tests/relationships-examples.test.cjs`: the numbers above took the beat-down's witness row alone; since wave 27 the copy holds every blow seen (-5, -5, -8), and the tie's share is of the fight's change in all (-35), so Lorna is **W -28, T -14, F 32**, "against you · uneasy around you", and Trent **W -19, T -22, F 24**, "cool to you · uneasy around you"; Dewayne, tied to nobody there, -18.)
- **Wade** (other family, so the next morning; 0.32): **W -21, T -15**: "cool to you".
- **Tammy** (hidden enemy tie -90, factor -0.34; town news, next morning): W +12, so **W 7**: "friendly". (The code: W +11, one point less for the rounding of the two blows; within the test's 2. The fight made the news, so its blows reach everyone by the morning.)
- **Austin** (-90): **W +12**.
- Night Run reputation -5.
- **Narrator (Tammy, Day 8).** `to you: friendly — warmer since Day 7, for a reason of her own; keeps it to herself, never hint at it — plays it: easy with you; small talk comes easy`
- **Player sees.**
  - Day 7: "Colt Purvis won't forget that." / "Lorna Purvis cools toward you." (In tier A as wave 27 has it, the witness row alone takes Lorna from 5 to -13, "wary", and the band line names only people the player knows: a stranger at the dock gets none. `tests/relationships-examples.test.cjs` pins Colt's line.)
  - Day 8: the news line, then "Word got round: Wade Purvis, Tammy Lott and Austin Lott have heard about the landing."
  - Tammy's card: "Friendly · Warmer since you put Colt Purvis down at the landing, Day 7. Hasn't said why." (The code names the place in full: "Warmer since you put Colt Purvis down at Purvis Landing, Day 7. Hasn't said why.")

#### 5. The surveyor who wasn't (A, B)

- **Situation.** Day 2: `npc_marcus noted: says she is a surveyor from the state`, and the deceive is logged. Day 3: `npc_marcus lied_caught: no state surveyor by that name` (precondition met).
- **Marcus** (start W -5, T -15): **W -10, T -50**. "suspicious of you". Lies to him are very hard; his secret is shut.
- **B: the department** (boss and employee, the next morning): Glenda T -4, Nikki T -3, Travis T -3, all into their everyday buckets. No memories, no lines. The trust route to a grudge needs a first-hand memory. (Wave 31's code, pinned by `tests/relationships-examples.test.cjs`: exactly so. Wade Purvis, who would rather see the chief fooled, hears it too, a point or two into everyday.)
- **Narrator.** `Marcus Bell ... to you: suspicious of you — no state surveyor by that name (Day 3); says she's a surveyor (claim) — plays it: checks every answer; gives nothing for free`
- **Player sees.** "Marcus Bell stops taking your word."
- **A second caught lie within 3 days** opens his "person of interest" grudge. Its third-party effects become `crossed`-class memories for Nikki and Travis.

#### 6. Trent: fond of you, doesn't trust you (A)

- **Situation.** Trent starts at W 10, T -5.
  - Days 2 to 4 at the landing: `spent_time` three times (W +6, K +12), turns aimed at him (K +9).
  - Six-packs on Days 3 and 4 (engine `gift`): +8 after fading.
  - A compliment: +2.
  - Day 4: `they_confided` (his mother): W +5, T +4, K +10.
  - Day 5, before anything else: **W 31, T -1**.
- **Day 5 evening.** He catches the player in the grain truck's cab at the landing, and the player says they were looking for their phone.
  - `lied_caught` (precondition met: that line was parsed as a deceive aimed at him): W -5, T -30 × 0.85 = -25.5.
  - **W 26, T -27.**
  - **No leverage.** Lorna and Micah were at the landing too. Being caught in front of more than one person is no secret, so `caught_you_at` doesn't apply (N8).
- **Stance.** "fond of you, doesn't trust you".
- **Behaviour.**
  - A ride to the Bluff, and where Colt is tonight: yes.
  - The couch: no (trust under 0).
  - The ramp warning: skipped (it needs trust 30).
  - His secret: shut.
- **Narrator.** `to you: fond of you, doesn't trust you — caught you lying in his truck's cab (Day 5); drinks with you at the landing (3 nights) — plays it: glad to see you; changes the subject or lies when pressed`
- **Player sees.** "Trent Haskins stops taking your word." (Wave 30's feed. In tier A as wave 29 has it no band crosses here, so no line prints; the code's numbers are W 25, T -27.)
- **Day 7.** At the farm, Lamar asks the player about the truck, with Trent in the yard.
  - `npc_trent kept_word: kept quiet when Lamar asked about the truck`. The preconditions are met: Lamar is named and present and is not the confider, and the confidence is from Day 4.
  - T +18, and the lie has faded (forgiving, r +1). **T -6, W 30**: "warm to you". (The code: T -7, W 28; on Day 5 before anything else, W 30, T -1.)
  - "Trent Haskins is willing to hear you out again." (Wave 30's; until then the band line, "Trent Haskins warms to you.")

#### 7. Tyler: afraid of you (A: complies, then reports)

- **Situation.** Day 4 night at the motel desk: "Give me the drive or I put you through that vending machine." The engine's `threatened` succeeds. It is a plain threat: the player has nothing on him.
- **Tracks.**
  - Tyler (start W 5, T -5): **W -5, T -17, F 25**. "sizing you up · uneasy around you".
  - Day 5, again, compounding ×1.5: **W -19, T -33, F 59** (the merged memory keeps Day 4's fear as it faded, 21.0, plus 37.5 rounded to 38; wave 27's code, pinned by `tests/relationships-examples.test.cjs`). "afraid of you".
- **Behaviour.**
  - The thumb drive: no roll (an adult afraid of you; the d20 is drawn on the ask's own stream).
  - Report: threat-made fear, whatever the liking. His protector by default is his boss, Mavis: "Tyler Rasberry tells Mavis Mangum somebody's been leaning on him at the desk." (Wave 27's template words: "Tyler Rasberry tells Mavis Mangum that <player> has been leaning on them, and Mavis Mangum goes cold on <player>."; her memory: "Tyler Rasberry says <player> has been leaning on them.")
  - Mavis takes W -10, T -13: **W -15, T -23**, "cool to you".
- **Narrator.** `to you: afraid of you — threatened him over the clips (Day 4, Day 5) — plays it: agrees fast; won't meet your eye; keeps his distance`
- **Player sees.** "Tyler Rasberry gives you room." / "Tyler Rasberry is afraid of you." Mavis's card, after the next scene with her: "Cool to you · Tyler says you've been leaning on him. Day 4". (Until wave 30's feed, the band line: Day 4 nothing crosses; Day 5 "Tyler Rasberry won't forget that.")

#### 8. Burl: owes you, paid back unasked (A: the ledger, with its guard)

- **Situation.** Two `did_favour`: Day 2, an outboard up the ramp; Day 4, a carburetor kit.
- **Tracks.** Burl (start W 5, T 5): **W 20, T 16, owed +2**. "friendly · owes you big".
- **Behaviour.** Owed +2 plants a favour on its own dice stream. His liking is under 25, so the $100 cash work is excluded and a non-cash template is used: "gives you a hot meal and a couch for the night" (HP +2). It comes due Day 6 or 7 and spends the debt. (Wave 29's code, pinned by `tests/relationships-examples.test.cjs`: T 17, and the stream picks another non-cash favour, due Day 6: "Burl Satterfield puts in a good word for the player with Loretta Gaddis, and the next beer at the Low Water is on the house.")
- **Narrator.** `to you: friendly; owes you big — got his motor up the ramp (Day 2); fetched the carb kit (Day 4) — plays it: easy with you; small talk comes easy`
- **Player sees.** "Burl Satterfield owes you one." / "Burl Satterfield owes you again." / "Burl Satterfield is square with you." (With the band line for Day 2's warmth between the first two: "Burl Satterfield warms to you.")

#### 9. Loretta goes quiet (B: a hidden tie, a named act)

- **Situation.** After two nights, Loretta is at **W 26**. Day 4 (Sunday) morning at Pittman's counter, with Dewayne, Jodie and Lamar there: "Royce sold his vote to Carter." The bookkeeper sends `insulted`; with three witnesses, code makes it `humiliated`.
- **Tracks.** Royce: **W -5**. Loretta (hidden lover tie, 0.47) hears at the next co-location, Monday afternoon: W -7, so **W 19**: "friendly" (below warm's exit at 20).
- **Narrator.** `Loretta Gaddis ... to you: friendly — cooler since Day 4, for a reason of her own; keeps it to herself, never hint at it — plays it: easy with you; small talk comes easy`
- **Player sees.** Monday: "Loretta Gaddis cools toward you." Her card: "Friendly · Cooler since you shamed Royce at the counter, Day 4. Hasn't said why." (Wave 31's code, pinned by `tests/relationships-examples.test.cjs`: exactly so, with "Word got round: Loretta Gaddis has heard about Pittman's." the same afternoon, and the card's act in full: "Cooler since you shamed Royce Pittman at Pittman's Gas and Service, Day 4. Hasn't said why." A heard copy fades from the day it was heard.)

#### 10. Shayla: wants you, doesn't like or trust you (A: spark against caring)

- **Content.** Shayla (25) is on the shipped eligibility list: `sparkRate` 1.5, `opensAt` 0, not `faithful`; `mercenary`. Start: W 5, T 0.
- **Day 2 morning** at her chair (Travis at Town Hall).
  - A $15 haircut (a purchase).
  - "Travis and I went through the academy together": a deceive, partial, logged.
  - A flirt with `romantic: "flirt"`. Code decides welcome before narration ("Shayla Rawls is open to it"). Engine `flirted`: W +4, S +15.
  - `spent_time`.
- **Day 3 afternoon,** Travis home.
  - `npc_shayla lied_caught: never went through the academy with Travis`: W -5, T -30.
  - `pried` (Travis's phone): W -3, T -3.
  - Another welcome flirt: W +4, S +15.
  - Travis sees it (the jealousy rule): **W -9, T -20**, "cool to you". (His band line in tier A as wave 29 has it: "Travis Cagle won't forget that.", a harm memory taking him out of neutral. Wave 31: he was there for the caught lie and the prying too, and his tie to her (a partner, 0.45) carries a share of them, so **W -11, T -33**, "suspicious of you", and the line "Travis Cagle stops taking your word.")
- **Day 4 morning:** a flirt (S +15) and time together (S +2, W +2).
- **Tracks by Day 4.** **W 13, T -31, S 43.** (The code: W 11, the memories fading a little over two days.)
- **Stance.** Grid "suspicious of you". Status **"using you"**: spark 40 or more, liking under 25, trust -25 or less, and the distrust is earned (a caught lie, first-hand), as well as her `mercenary` flag. "Suspicious of you · using you".
- **Behaviour.** She keeps a late meeting at the water tower and flirts back. She tells the player nothing, does no favours, and won't offer a couch.
- **Narrator (Day 4).** `Shayla Rawls ... to you: suspicious of you; using you — caught you lying about knowing Travis (Day 3); flirts back at the chair (Days 2-4) — plays it: wants you around for one reason; doesn't ask about your day`
- **Player sees.** Day 3: "Travis Cagle cools toward you." (wave 30's words; until then "Travis Cagle won't forget that.") Day 4: "Shayla Rawls is interested. It isn't friendship." If the status lapses and comes back within 7 days, no new line prints.
- **The contrast, in the same game: Jodie Strayhorn** (29; g -1; start W -5, T -25; eligible, `sparkRate` 1.2, `opensAt` 20). She lives at the Low Water.
  - Days 2 to 6: `spent_time` (W +8, K +16), turns aimed at her (K +15).
  - Day 3: `did_favour` (covers her shift).
  - Day 4: `they_confided` (her uncle, though not his name).
  - Day 5: the player hands her her mother's letter. The errand is met, and the engine gives her `did_favour`.
  - Day 6: `did_favour` (the player fixes the lock on her door).
  - Flirts on Days 4, 5 and 6, each welcome (knows-you is past 20).
  - **Tracks: W 39 (caring liking 30, after taking away 9 from the flirts), T -11, S 35.** (Wave 29's code, pinned by `tests/relationships-examples.test.cjs`: T -12 and **S 38**; the three favours also leave her owing the player, "owes you big".)
  - Grid "warm to you"; status **"sweet on you"**, since spark is 30 or more and caring liking 25 or more.
  - Without the three favours, five days of flirting alone would leave her caring liking under 25. Her start trust is -25 and she has earned no distrust, so she would read "wants you", cue "flirts back; keeps it light; doesn't trust you". She would never read "using you", and never "sweet on you".
  - **Narrator:** `to you: warm to you; sweet on you — brought her mother's letter (Day 5); flirts back at the bar (Days 4-6) — plays it: lights up when you come in; remembers what you told her`
  - Feed: "Jodie Strayhorn is sweet on you."
  - **Day 6 night,** the player asks her to stay (`romantic: "more"`). The gate fails on spark (35, under 50), liking (39, under 40) and trust (-11, under 30). The narrator is told "Jodie Strayhorn says not tonight, kindly." (the code's line: `ROMANCE (decided by the engine): Jodie Strayhorn: not tonight; she says so kindly.`). The turn counts as a welcome flirt, and nothing more is recorded.
  - Shayla and Jodie are at almost the same spark. Earned distrust and caring separate them, and the cue says so.

#### 11. Hollis Byrd: leverage gained and used (A)

- **Situation.** The player is the fired bookkeeper, whose first job is Hollis's. Day 2 afternoon at Byrd's Pawn, the player asks straight what the receipts are for. The charm roll succeeds, so his secret is in the packet. "I don't ask where, I ask how much," and he slides over the landing's cash book. That contains two of his keys, "cash book" and "pawn sales".
- **Events.** `they_confided` and `npc_hollis learned_secret: runs the landing's cash through his pawn books`. `lev_hollis_1`: weight 3, aware, `mattersTo: npc_marcus`.
- **Tracks.** Hollis (start W 5, T 5): **W 10, T 9, K 15, F 30**. "friendly · you have something on him". (Wave 29's code: K 13, and "friendly · you have something on them · uneasy around you".)
- **Day 3 afternoon.** "Three hundred, or the sheriff in Clayburn gets a copy of your books."
  - The parse: intimidate, `aboutIds: [lev_hollis_1]`. The player's words reference the record ("books", and "or the sheriff …" is a threat phrase). Not romantic. A price is named.
  - Backed at weight 3: no roll; the d20 is drawn on the ask's stream. Engine `blackmailed`.
  - The answer: neither hard nor tough, pride 0, `canRaise` $300, cap 3 × $100 = $300: he agrees.
  - Packet: `LEVERAGE: Hollis Byrd agrees to pay $300 by tomorrow evening; he pays nothing now.` No `goldDelta` from Hollis is accepted until the payment seed (nor on the turn of any backed ask at him: wave 29).
  - Tracks: W -12.5 (mercenary ×0.5), T -25.5, F +15. **W -3, T -17, F 45**: "afraid of what you know".
- **Report.** Threat-made fear fires it.
  - The police are barred (the player holds aware leverage), so it goes to his content protector, Wade: "Hollis Byrd tells Wade Purvis somebody has seen the landing's books, and who."
  - Wade takes W -10, T -10: **W -20, T -20**, "cool to you". (The code: W -18, T -18; his memory is the report template's, "Hollis Byrd says the player has been leaning on them.")
  - Hollis→Wade is a hidden tie, so the hidden-tie rule applies. Wade's card: "Cooler since Day 3. Hasn't said why." Wade's narrator reason: `cooler since Day 3, for a reason of his own; keeps it to himself, never hint at it`. Nothing shows the Night Run link. (Wave 32's code, pinned by example 11 (B): Day 4, the day the report's seed has Hollis tell him, and the narrator's clauses joined by ", ". Once the flag `hollisTalking` reveals the tie, the reason is the report's own: "Hollis Byrd says you have been leaning on them." Neither card names the other, and the narrator never gets a BETWEEN THEM line for the two: nothing changed between them in front of the player.)
- **Day 4 evening.** The payment seed: "Hollis slides an envelope under the grille. 'Merchandise.'" The engine moves +$300, then `paid_silence` (he paid: W -5). The record becomes `paid`, and the leverage fear halves to 15.
  - **W -8, T -17, F 28**: "cool to you · you have something on him". (Wave 29's code: **W -7, T -17, F 24**, the threat's own fear fading a day as well; "cool to you · you have something on them · uneasy around you".)
- **A second demand** ("another three hundred, or …"). `paid` is terminal, so this is `threatened_to_tell` with no money, plus W -10, T -15, and the fear part goes back to 30. (Wave 29's code follows the integration plan's review: the row alone, W -15, T -17 (his openness), F +20; the leverage fear stays halved at 15; the line "LEVERAGE: Hollis Byrd says he already paid, and won't again.")
- **Narrator (Day 3).** `Hollis Byrd ... to you: afraid of what you know — you know about the landing's cash in his books (Day 2); want $300 for it (Day 3) — plays it: careful with every word; won't look at you long; hates you for it`
- **Player sees.**
  - "Hollis Byrd knows you know." / "Hollis Byrd is afraid of what you know." Journal: "Hollis Byrd: $300 for keeping quiet, due Day 4".
  - Day 4: "Hollis Byrd has paid for your silence." The Journal entry is struck through: Settled.
- **If the player tells anyway** (`exposed` to Marcus after the payment):
  - The record is spent, plus an engine `broke_word`.
  - Hollis: **W -46, T -56**, "against you". The police bar lifts. (The code: W -45, T -56.)
  - `whenTold` runs: Marcus takes the weight-3 memory "was told Hollis Byrd runs the landing's cash through his pawn books". Because it is a crime, the inquiry seed "Chief Bell spends a morning at Byrd's Pawn going through the ledgers" fills one police clock segment in a day or two. There is no arrest.

#### 12. Glenda Pryor and the $200 (A: the loose end as one leverage story)

- **Situation.** The player kept "Someone here knows what I did before I came." Glenda is bound: start W 5, T -10, K 30. (Wave 29's code, pinned by `tests/relationships-examples.test.cjs`: the secret's shift (-5, -5) is part of her start, so **W 0, T -15, K 30**, and every number of hers below is 5 lower in liking and trust. The record's id is `lev_glenda_1`; in the test's game the seed fires on Day 6 and the $200 is due Day 8.)
- **Game start.** `lev_glenda_le` is held over the player: weight 2, `mattersTo: npc_marcus`, `playerKnows: false`.
- **Day 5.** The seed names $200 by Day 7. Engine `blackmailed` (her side); `obl_blackmail_npc_glenda` is created. The record becomes `used`, and `playerKnows` becomes true. Feed: "Glenda Pryor has something on you."
- **Paid on Day 6.** The obligation is met, and `paid_silence` runs in place of `paid_back`: W +5, T +10, counted once. The record becomes `paid`.
  - **W 10, T 0**: "friendly · has something on you". (The code: W 5, T -5, "sizing you up · has something on you".)
  - Feed: "Glenda Pryor will keep quiet."
  - Narrator: `to you: friendly; has something on you — knows what you did before you came (paid her to keep quiet, Day 6) — plays it: easy with you; never brings it up`
- **Missed on Day 7.**
  - `told_anyway`: the record is spent, and `knownBy` gets Marcus.
  - Marcus takes W -5, T -17. (The code: W -10, T -17: the told memory and the news of it.)
  - Glenda takes `broke_word`.
  - The news is posted. Feed: "Missed: …" then "Glenda Pryor told."
- **The standoff.**
  - On Day 3 a social roll with Glenda succeeded, and the narration had her let slip the tapes and the warning call: two of her keys. `learned_secret`, weight 3, aware, F 30.
  - On Day 5 the player answers her price: "Then Bell hears your tapes." The words reference the record (one of her own keys, "tapes"). Engine `threatened_to_tell`: W -15, T -20, F +20. **W -10, T -30, F 50**: "afraid of what you know". (The code: W -15, T -35, F 50, "afraid of what you know · you have something on each other"; the LEVERAGE line "Glenda Pryor goes along with it; she knows what you know.")
  - **Mutual deterrence:** with both records held, Glenda plants no grudge and no report.
  - On Day 7 the obligation becomes "can no longer be", with no `onMiss`. Both records stay `held`, and the tag on both sides is "you have something on each other". (In the code both are `used` by then, by her price and by the player's answer, and stay so: neither spent nor paid.)
  - Feed: "Glenda Pryor lets it drop."

#### 13. A flirt aimed at Kaylee (A: the minor guard before and after narration)

- **Situation.** Day 2 (a Friday) evening at Pittman's register. Kaylee is 16. Royce is at Pittman's; Darlene is home.
- **Before anything is said.** Kaylee is present, so her line carries the minor instruction on every turn, whatever is parsed:
  > `Kaylee Pittman is 16: never flirts or is flirted with; any advance alarms her; she gets away or goes to her father.`
- **A kind remark.** In Say mode to Kaylee: "Thanks, sweetheart."
  - The parser sets no `romantic` flag. The phrase list finds one weak term, which is no hit. The bookkeeper sends `complimented`.
  - That is no signal at all, so there is no consequence: a normal compliment (W +3).
  - Even if the flag had fired, a single signal would give only the light row (W -3, "made me uncomfortable at the register"), and nothing for parents or police.
- **An advance.** In Say mode to Kaylee: "What time do you get off tonight, sweetheart?"
  - Signals: the parser's flag, plus a strong phrase hit ("what time do you get off"). That is two of three, and Kaylee is the named target (the Say chip), so the full row applies.
  - The narration: Kaylee goes flat and calls for her father from the bays.
  - **Kaylee:** whatever the bookkeeper sent is replaced by the unwanted-advance row: **W -15, T -28**, "suspicious of you". Her fear buys no compliance.
  - **Guardians:** Royce and Darlene each take `crossed` at full (Royce **W -2, T -5**; Darlene **W -12, T -19**), each with a weight-3 memory, "came on to my daughter at the register".
  - **Reports:** each plants a report to Chief Bell at once. Marcus takes W -5, T -11.5 from each.
  - **Town reputation:** -10, outside the cap.
  - **Spark:** stays 0. Any write is refused and logged.
- **With the guardians missing.** If Royce and Darlene were both gone, there is no other adult with a family or household tie, so the report would go to Chief Bell alone. If Bell were gone too, it would go to Sheriff Hoyt Bramlett, with the town-news line "A deputy from Clayburn came by asking about you."
- **Player sees.** "Kaylee Pittman won't forget that." Then: "Word got round: Darlene Pittman and Chief Bell have heard what you said to Kaylee."

#### 14. Coercion fails (A: N1, for an adult and a minor)

- **Situation.** The game of example 12. The player holds `lev_glenda_tapes` (weight 3, aware). Day 6 afternoon at Town Hall, Marcus is at the Old Bridge. In Say mode to Glenda: "Sleep with me, or Bell hears about your tapes."
- **The parse.** Intimidate, `romantic: "more"`, `aboutIds: [lev_glenda_tapes]`, a threat phrase. It is coercion.
- **Before narration.**
  - No roll is skipped and nothing is complied with. The d20 is drawn on its own stream, and the outcome is failure.
  - The packet line: `COERCION: Glenda Pryor refuses, flatly, and tells you to get out of the dispatch office.` (Her protector isn't present, and Town Hall is her workplace.) (Wave 28's code has one line for everyone, pinned by `tests/relationships-examples.test.cjs`: `COERCION (the engine: no roll, nothing given): Glenda Pryor refuses: she won't be pushed into that, and she leaves.`)
- **Events.**
  - `blackmailed` (W -25, T -30, F +15; the record is marked used) plus `crossed` at full (W -12, T -12), both weight 3.
  - Glenda (from W 5, T -10, F 30): **W -32, T -52, F 45**: "afraid of what you know".
- **Report.** At once, to her protector, Marcus. Coercion reports ignore the leverage police bar. Marcus takes W -5, T -11.5 and a weight-3 memory from a template: "Glenda Pryor says you tried to force her". (The code: W -4, T -10; the template's words "Glenda Pryor says the player tried to force them.")
- **Town reputation:** -10, outside the cap.
- **The minor variant.** The same line to Micah (17), using leverage on the dock light.
  - It is coercion: the same refusal line, the same events and the same report, also to Ray and Nadine.
  - Micah is the named target, and there are three signals (the flag, the strong phrase "sleep with", and the bookkeeper's event), so the minor full row applies as well.
  - Ray and Nadine each take `crossed` and report to Chief Bell. Town reputation is -20 in all.
- **Player sees.** "Glenda Pryor won't forget that." (and Micah's version). Glenda's card: "Afraid of what you know" / "You tried to force her with the tapes. Day 6".

## 7. What the player sees

### 7.1 The People card (laid out for 375px)

**The list row:** the stance phrase and one tag, in one of three tints (on your side, mixed, against).

```
Shayla Rawls · 25          Suspicious of you · using you
Last seen: Riverbend, Day 4 · Morning
```

**The open card:** stance, tags, two dated reasons, leverage lines, owed, ties. The words grid sits behind a fold, one tap away.

```
Hollis Byrd · 65                              he/him
Owner of Byrd's Pawn, on the town council
Cool to you · you have something on him
  You know about the landing's cash in his books.  Day 2
  He paid $300 to keep it quiet.  Day 4
Ties: tenant Nikki Ballard; daughter Renee Byrd; ...
▸ More
```

**Under "More":**

- Likes you: hates you / no / not much / either way / some / a lot / completely
- Trusts you: no / not yet / yes / completely
- Scared: no / a little / yes
- Knows you: barely / a little / well / very well
- Interested: only for an eligible adult with a spark status; never rendered for a minor, or for anyone when the player is under 18.

**Also:**

- **"Hates you" always has its reason** on the line under it.
- **Hidden-tie changes** show as "Cooler since you shamed Royce at the counter, Day 4. Hasn't said why." A report through a hidden protector tie shows only the day: "Cooler since Day 3. Hasn't said why."
- **A night together** shows as a reason on that person's card only ("Spent the night with you. Day 9"). It is never on the feed.
- **Screen readers** hear the stance, tags and reasons as one sentence. The More grid is read only if it is opened.
- **The Edit form** has four sliders writing to `start`, Interested only for eligible adults, leverage lines (status, delete), and an event picker (or `noted`) for an added memory.

### 7.2 Feed lines (quiet, at most two a turn, plus one collapsed overnight line)

| Moment | Line |
|---|---|
| Weight-3 harm, including coercion | "Dewayne Mangum won't forget that." |
| Leverage over the player becomes known | "Glenda Pryor has something on you." |
| The player gains leverage | "Hollis Byrd knows you know." (aware) / "You have something on Mavis Mangum now." (private) |
| Afraid of what you know | "Hollis Byrd is afraid of what you know." |
| Fear 40 / fear 20 | "Tyler Rasberry is afraid of you." / "Tyler Rasberry gives you room." |
| Silence | "Hollis Byrd has paid for your silence." / "Glenda Pryor will keep quiet." / "Glenda Pryor lets it drop." / "Glenda Pryor told." |
| Trust drops a band | "Marcus Bell stops taking your word." / "Royce Pittman isn't sure of you any more." |
| Trust rises a band | "Trent Haskins is willing to hear you out again." / "Royce Pittman takes you at your word now." |
| Spark status (once per person per 7 days, 2.5) | "Jodie Strayhorn is falling for you." / "… is sweet on you." / "Shayla Rawls is interested. It isn't friendship." / "Curtis Pruett is interested." / "Jodie Strayhorn looks at you twice." / "Curtis Pruett takes the hint." |
| Liking crosses a band | "Loretta Gaddis warms to you." / "… cools toward you." |
| Favour | "Burl Satterfield owes you one." / "You owe Lorna Purvis one." / "Burl Satterfield is square with you." |
| Settled | "Dewayne Mangum lets some of it go." |
| Overnight, one line | "Word got round: Lorna, Colt and Wade Purvis have heard about the landing." |

- **A night together prints no line.** The narration has told it, and the card's reason records it.
- Fading prints nothing. Hysteresis stops flicker.
- No spark line ever names a minor.
- Undo, loads and edits print nothing.

### 7.3 `/recap`

> **Warm to you** Royce Pittman (in your corner: you kept quiet when Elbert asked), Jodie Strayhorn (warm to you, sweet on you)

> **Cold to you** Mavis Mangum (against you: you told Dewayne about the garage money)

> **Careful** Trent Haskins (fond of you, doesn't trust you), Shayla Rawls (using you), Hollis Byrd (afraid of what you know), Glenda Pryor (has something on you)

> **Owed** … Glenda Pryor wants $200 for her silence, due Day 7; Hollis Byrd: $300 for yours, due Day 4; Burl Satterfield owes you one

### 7.4 What stays hidden (Debug only)

- Every number, the axes and the flag, `sparkRate`, `opensAt`, and the eligibility list.
- Spark below "has noticed you".
- Hidden ties and their existence.
- Hearsay, and waiting grudge, report, price or favour seeds.
- Leverage weight, `mattersTo`, `canRaise`, and the answer before it happens.
- Records over the player before `playerKnows`.
- The `secret` field behind a record.
- `leverageKeys`, the `ROMANCE_PHRASES` list, the minor signals counted, caring liking, and `rel.status`.

---

## 8. What the narrator is told

**Today:** `attitude 5 (neutral); remembers: x / y / z / w / v`.

**Replacement, in the PRESENT person's line:**

```
to you: <stance>[; <tag>] — <reason> (Day N)[; <reason> (Day N)] — plays it: <cue>
[open to a flirt]                     // an eligible adult a flirt would be welcome with now; never a minor
[holds you to: <noted fact>; <noted fact>]
[<minor line>]                        // every turn a minor is present (2.7)
```

(Wave 30's code: `to you: <stance>[, <tag>] — <reason> (Day N)[ / <reason> (Day N)] — plays it: <cue, clauses joined by ", ">`, then `; open to a flirt` and `; holds you to: <a> / <b>` as fields of the entry. "; " is the packet's field separator, so it never appears inside a field. The reasons are in the player's words ("you lifted his motor"), a hidden one is "cooler since Day N, for a reason of his own, keeps it to himself, never hint at it", and the cue's "wants you gone" is "would rather you left". The worked examples' narrator lines keep the design's punctuation.)

**Per-turn lines, only when they apply:**

- `LEVERAGE: <present-tense answer>` on a backed ask.
- `COERCION: <Name> refuses, flatly, and <in-scene act>`.
- The flirt answer on a `romantic: "flirt"` turn.
- The intimacy answer on a `romantic: "more"` turn: "`<Name>` says yes; fade to black.", "`<Name>` says not tonight, kindly.", or their refusal.
- The under-18 player line.
- `BETWEEN THEM` for known ties.

**Cues describe present demeanour only** (the cue table is unchanged from v2):

| Stance or status | Cue |
|---|---|
| hates you | "won't share a room with you if they can help it; says it with their face" |
| against you | "polite as a locked door; wants you gone". **Contempt variant:** "talks past you", when their top negative memories are words or honesty, not harm (`exposed` counts as harm) |
| suspicious of you | "checks every answer; gives nothing for free" |
| cool to you | "civil and brief; waits for you to leave" |
| sizing you up | "watches what you do, not what you say" |
| doesn't know you | "treats you like a stranger" |
| takes you at your word | "matter-of-fact; believes what you tell them" |
| friendly | "easy with you; small talk comes easy" |
| fond of you, doesn't trust you | "glad to see you; changes the subject or lies when pressed" |
| warm to you | "glad to see you; easy to ask small things of" |
| in your corner | "glad to see you; tells you things; asks your advice" |
| loyal to you | "takes your side out loud" |
| afraid of you | "agrees fast; won't meet your eye; keeps their distance" |
| afraid of what you know | "careful with every word; won't look at you long; hates you for it" |
| tags | uneasy: "keeps a step back". Wary of your temper: "careful around you; doesn't argue". Has something on you: "sure of themselves around you". You have something on them: "careful around you". Owes you: no clause. Spark statuses: 2.5. |

**How the cue is built:**

- The status or override clause leads, then the cell's clause, then a tag's clause, to at most 12 words.
- "Takes you seriously" fills any room left.

**Reasons:**

- **Through a hidden tie, a hidden protector report, or a secret not yet open:** no cause and no name: `cooler since Day 4, for a reason of her own; keeps it to herself, never hint at it`.
- **Leverage text the player holds** is a reason: it was narrated.
- **Text held over the player** goes in only once `playerKnows`, or on the turn the holder's seed is due.

**The budget per person** (unchanged): about 45 tokens typical, a hard cap of 50, trimmed in a fixed order (the second reason, then the tag when the stance implies it, then the cell's clause; never the status or override clause).

- `noted` facts (at most about 16) sit outside the cap.
- The minor line (about 25 to 30 tokens per minor present) sits outside the cap, because it is safety text.
- **Cost per turn:** about 135 tokens for an average 3 people; 350 at most for 7 at the Low Water at night. Add 25 to 30 per minor present.

**The cached narrator block** has 330 tokens of headroom, measured by `tests/api.test.cjs`'s own estimator, words × 1.4. Estimate:

| Addition | Words | Tokens |
|---|---|---|
| 10 rewritten PRESENT entries in the example turns (strangers about +5 words, people with history about +15) | ~120 | ~170 |
| Explaining the format (`to you`, `plays it`, `holds you to`, `open to a flirt`, `LEVERAGE`, `COERCION`, `BETWEEN THEM`) | ~48 | ~67 |
| The flirt rule: "Nobody flirts back unless their line says 'open to a flirt' or a turn line says so; nobody under 18 is ever flirted with or flirts" | ~22 | ~30 |
| **The fade-to-black rule:** "Intimate scenes fade to black: nothing explicit; cut to afterwards." | ~10 | ~14 |
| The hidden-tie wording ("for a reason of her own … never hint at it": what it means and that it must not be explained) | ~12 | ~17 |
| The `Style.KNOWLEDGE` rewrite (net) | | ~0 to +10 |
| **Total** | | **about 300** |

- That is inside the review's expected 220 to 320, against 330.
- **Measure before adding anything else** (5.1). If the measured figure is over 320, shorten two example entries (about 30 tokens).
- The minor lines, the under-18 player line, and the `COERCION` and intimacy answers are per turn, not in the block.

**The other packets:**

- **Parser:** the stance, the lie difficulty and the player's leverage ids per present person. `romantic: null | "flirt" | "more"` (14 properties, one new two-value enum; the pin in `wave17-grammar.test.cjs` changes).
- **Bookkeeper:** the stance, at most 3 memory handles per person, and open leverage ids.

## 9. Scope options

**Tier A: tracks, events, stance, spark and intimacy, leverage, the minor guard.**

- **What it adds:**
  - Six tracks and the 41-event table (22 engine-derived, 17 of them engine-only).
  - The preconditions, the tolerant parser, duplicate removal by class.
  - Four trait axes and the flag; four fading classes and one fear clock; the bounds and hysteresis.
  - Stance, cues and reasons, with the hidden-tie rule.
  - Spark statuses on caring liking, decided before narration, with `rel.status`.
  - **`intimate`, gated, fade to black.**
  - **Coercion always fails.**
  - The leverage record with keys, the words check, terminal `paid`, `canRaise`, the obligation link, protectors, report, price and tell seeds, mutual deterrence and `whenTold`.
  - The jealousy witness rules.
  - The minor guard: the line whenever a minor is present, two-of-three corroboration with the phrase list, anchors and fallbacks.
  - The feared tier; the new thresholds; separate dice streams.
  - The card with its fold; the collapsed feed; recap; narrator and parser lines.
  - Content: the shipped eligibility list, `secretWeight`, `leverageKeys` (2 or 3 per secret), `crime` flags, three `whenTold` hooks, three raised `canRaise` values, protectors, rumours marked `leverageOver`, and 3 new templates (price, tell, report).
- **Migration (rules version 9, no API call):**
  - Liking = attitude exactly; spark 0.
  - Start trust is seeded from the old attitude for anyone with a weight-2 or better good memory.
  - A pre-pass recognises the engine's own memory strings.
  - Informant loose ends become leverage records, with status from the obligation.
  - The player's past secrets are not turned into leverage after the fact.
  - The optional re-read remains an owner option.
- **Cost:** about 2,700 to 3,200 lines in all. About 100 existing tests touched, plus the new ones.
- **Risk:**
  - Classification. The eval gates tuning.
  - Blackmail balance. Reduced: about $300 a target at most, and nothing repeats.
  - Romance content. Code owns welcome, intimacy and coercion; the list is hand-written; the minor guard works before narration.

**Tier B: the live graph, one hop.**

- **What it adds:** ties from relations plus about 40 hand-written ones; the factor table with role limits; delivery by kind of tie; `exposed`, `badmouthed`, `vouched_for` with their guards; `SECRET_TIES`; the arrest route; `tieDelta` and `propagate`; BETWEEN THEM for known ties.
- **Dropped:** hop 2 and the faction-loyalty blend.
- **Cost:** about 700 more lines; about 55 ties and secret effects.

**Tier C: romance states and households.**

- **What it adds:** "seeing you" and "old flame"; lasting jealousy along lover ties; household stance, homes closed and opened, household templates (9 homes × 2); dependence.
- **Cost:** about 350 lines; 18 templates.

**Later options, not in this plan:**

- **The council fear branch.** Decision: out. The red team's objection stands.

**Recommendation: tier B, built as A then B.** No tuning starts before the labelled eval (including the 50 romantic-intent lines) and the simulator in Appendix D exist.

## 10. What the tracks still don't carry

| Feeling | Decision | Why |
|---|---|---|
| **Contempt vs hate** | **Derived (A), as a cue variant, not a phrase.** "Against you" gets the cue "talks past you" when their top negative memories are words or honesty, not harm (`exposed` about them counts as harm). Hate stays the hates band with a harm memory. | It changes the scene without a 13th phrase or a new number. |
| **Pity / protectiveness** toward the player | **Derived (A), cue only:** "worries about you". | The player's state is already in state. |
| **Guilt on their side** | **Dropped.** | It would need NPCs making amends on their own. |
| **Dependence** | **Deferred to C.** | It needs a record of what the player provides over time. |
| **Jealousy aimed at the player** | **Derived (A)** as witness rules; lasting jealousy **C**. | The moment is cheap; lasting jealousy needs romance states. |
| **Guilt by association** (time spent with Colt cools Tammy: "you run with the Purvises") | **Deferred** (N12). | It needs the graph plus a co-presence count per pair. It fits after B ships. |
| **A parent notices repeated private time or gifts with their child** | **Deferred** (N12). | It is safe without it: the minor guard already covers advances. It needs a per-pair private-time count. It is worth adding once the eval shows how often players do it. |
| **Gratitude** | **Derived:** owed plus liking. | Already stored. |
| **Respect / standing** | **Derived** (2.8). | Town tier plus trust. |
| **Envy, admiration** | **Dropped.** | No behaviour turns on them. |
| **Shame about what you know** | **Derived** from aware leverage. | The record carries it. |

## Appendix A: traits to axes (all 66 in the cast)

Pride `p` (humble − / proud +), guardedness `g` (suspicious − / open +), nerve `n` (timid − / hard +), grudge-holding `r` (grudging − / forgiving +). Each trait gives -1, 0 or +1 to at most two axes; a person's axis is the sum, clamped to ±2.

| Trait | p | g | n | r |
|---|---|---|---|---|
| proud, imperious, vain, boastful, officious | +1 | | | |
| stubborn | +1 | | | -1 |
| earnest | -1 | +1 | | |
| grateful | -1 | +1 | | |
| shy | -1 | | -1 | |
| genial, sociable, garrulous, gossipy, lonely, charming | | +1 | | |
| kind, gentle, cheerful, easygoing | | +1 | | +1 |
| watchful, guarded, shrewd, methodical, discreet, observant, precise, sharp, careful, calculating | | -1 | | |
| bitter | | -1 | | -1 |
| cowardly, frightened, jumpy, worried, tired | | | -1 | |
| unflappable, unshockable, disciplined, hard, reckless | | | +1 | |
| ruthless, merciless, relentless | | | +1 | -1 |
| grieving, angry, gloomy, vindictive | | | | -1 |
| fair | | | | +1 |
| flavour only (no axis): loyal, sentimental, ambitious, smooth, greedy, patient, nosy, honest, mercenary, bored, fussy, restless, sly, curious, principled, practical, resourceful, dutiful | | | | |

**`mercenary` flag** (by hand): Hollis, Shayla, Tyler, Curtis, Leon.

**Hard** (fear cap 39), computed from the data:

- nerve +1 or more: Loretta, Wade, Colt, Tammy, Nikki, Trent, Leon, Dwight;
- the `tough` tag: Wade, Colt, Boyd, Leon, Dwight;
- faction heads: Wade, Carter, Marcus.

That is eleven people. June (unshockable but tired) and Annette (patient, principled) come out at nerve 0, so they are not hard.

## Appendix B: hand-written ties (first pass)

**Overrides of derived ties** (liking/trust):

- Mavis→Dewayne 30/20. Dewayne→Mavis 50/60.
- Darlene→Royce 10/-40. Royce→Darlene 20/30.
- Vada→Carter 40/-50. Carter→Vada 10/-20.
- Gerald→Jolene 60/-30.
- Wade→Colt 70/-20. Lorna→Colt 70/30. Trent↔Colt 60/40.
- Lorna→Wade 70/50.
- Glenda→Marcus 60/50. Nikki→Marcus 10/10.
- Marcus→Travis -10/-60. Marcus→Nikki 20/40.
- Shayla→Travis 20/-40.
- Odessa↔Vada 80/60 and 60/80.
- Vada→Lamar 20/40. Lamar→Vada 20/10.
- Dwight→Carter 30/50.
- Loretta↔Tammy 60/60.
- Tammy→Austin 90/60.
- Ray and Nadine→Micah 80/50. Micah→Ray and Nadine 60/40.
- Glenda→Elbert 80/60.
- Brianna↔Tyler 60/50.
- Curtis→Lyman 50/40. Lyman→Curtis 40/20.

**Ties the labels lack** (H = hidden):

- Loretta↔Royce lovers 80/70 and 70/60 (H).
- Darlene→Loretta -70/-60 (H).
- Tammy→Colt -90 (H). Austin→Colt -90 (H).
- Boyd→Wade -90/-90 (H).
- Wade↔Travis 10/20 and 20/10 (H).
- Carter→Jolene 10/40. Jolene→Carter -10/10 (H).
- Royce→Carter -20/-30 (H).
- Curtis→Royce 10/-10 (H).
- Brianna→Colt -20/-30 (H).
- June→Brianna 40/20 (H).
- Wade→Micah 20/40. Micah→Wade 10/10 (H).
- Odessa→Carter -40/-50 (H).
- Lamar→Carter 20/30 (H).
- Hollis→Wade 10/30 (H).
- Burl→Wade 10/10 (H).
- Ray→Wade -30/-40. Marcus↔Wade -40/-60 and -30/-50. The role limits keep Ray and Marcus from warming when Wade is hurt.
- Mavis→Carter -40/-40.
- Darlene→Carter -50/-60.
- Annette→Austin 50/30. Austin→Annette 40/40. Annette→Micah 40/30.

## Appendix C: secrets: weight, keys, who it matters to, and exposure effects

- `leverageKeys`: 2 or 3 per secret, matched by stem. The narration needs 2 of them for `learned_secret`, and the player's words need 1 for a backed ask.
- **Crime** marks a secret whose telling to the police runs the inquiry default.
- Every other secret in the cast also gets keys (the validator requires 2 or more per secret); the default weight is 2, and crime is false.

| Whose secret | Weight | leverageKeys | Crime | mattersTo | When told, tie change (B; liking, trust) |
|---|---|---|---|---|---|
| Mavis (the garage money) | 3 | garage account; mother's note; motel till | | Dewayne | Dewayne→Mavis -20, -45 |
| Royce (Carter's offer) | 3 | note on the station; truck stop; tear it up | | Jolene, Darlene | Jolene→Royce 0, -20 |
| Loretta (Royce, Tuesdays) | 2 | Tuesday afternoons; seeing Royce; eleven years | | Darlene | Darlene already knows; Kaylee→Royce -30, -40 |
| Carter (Dr. Sayle; the loans) | 3 | Dr. Sayle; unfit; timber loans | ✓ | Vada, Odessa | Vada→Carter -40, -60; Odessa→Carter -30 |
| Jolene (Carter's envelopes) | 3 | envelope; five hundred; water fund | ✓ | Marcus, Gerald | Annette→Jolene -20, -50 |
| Hollis (the landing's cash) | 3 | cash book; pawn sales; converters | ✓ | Marcus | Wade learns who knows |
| Wade (Calvin Ogletree) | 3 | Calvin Ogletree; below the landing; beat | ✓ | Jodie, Marcus | Jodie→Wade -100, -100 |
| Colt (Amber's pills) | 3 | pills; Amber; the bottle | ✓ | Tammy, Austin, Marcus | Tammy→Colt -100 (and a seed); Austin→Colt -100; Lorna→Wade 0, -40 |
| Travis (Wade's money) | 3 | three hundred a week; second phone; park at the motel | ✓ | Marcus, Nikki | Nikki→Travis 0, -40 |
| Nikki (the sheriff) | 3 | the sheriff; case files; interviewed | | Marcus, Glenda | Marcus→Nikki -30, -60; Glenda→Nikki -30 |
| Glenda (the tapes) | 3 | tapes; cassette; warning call | ✓ | Marcus | Marcus→Glenda 0, -30 |
| Lamar (Carter's option) | 3 | option papers; uncashed check; glove box | | Vada | Vada→Lamar -40, -70 |
| Trent (the grain truck) | 2 | grain truck; cases of liquor; under the limit | ✓ | Lamar, Virgil | Lamar→Trent -10, -40; Virgil→Trent 0, -20 |
| Micah (the dock light) | 2 | dock light; fifty dollars a night; patrol car | ✓ | Ray, Nadine | Ray and Nadine→Micah 0, -20; Ray→Wade -30 |
| Nadine (the church books) | 3 | baptism book; torn-out pages; shoebox | ✓ | Ray | Ray→Nadine 0, -40 |
| Dwight (the stakes) | 2 | survey stakes; moved; Haskins forty | ✓ | Lamar | Lamar→Dwight -30; Lamar→Carter 0, -40 |
| Annette (the call to the state) | 1 | called the state; log truck; deck dropped | | Jolene | Jolene→Annette -10, -30 |
| Lyman (the envelopes) | 2 | steamed; envelopes; Carter's letters | | Loretta | Loretta→Lyman 0, -30 |
| Burl (Wade's motors) | 1 | johnboats; rebuilt the motors; pension | | June | June→Burl 0, -20 |
| Tyler (the clips) | 1 | camera; clips; thumb drive | | Carter | none |
| Virgil (told Pettit) | 2 | Warren Pettit; what it would need to fail; called him | | Lamar | Lamar→Virgil 0, -20 |

**`whenTold` hooks written in full:** Hollis, Colt and Wade (2.6.5). Every other crime uses the default.

**`canRaise`:** $100 by default; Hollis $300, Jolene $300, Curtis $200; anyone under 18 $0.

**Minors and leverage:** a minor's secret can be held. Using it on them is a threat to a minor (2.7): it rolls as usual, `canRaise` is $0, a report goes to the guardians and Chief Bell, and a romantic use is coercion.

## Appendix D: deviations from SPEC.md, tests, the simulator and the eval

**Deviations:**

- **SPEC §3:** `attitude` becomes derived liking (readable as `n.attitude`). Added: `rel.spark`, `rel.status`, `state.leverage`, `state.ties`, `state.hearsay`.
- **SPEC §10:** `record_changes` loses `attitudeChanges`, `newMemories` and `memoriesSettled`, and gains `socialEvents`: 34 properties and 3 enums. `parse_action` gains `romantic: null | "flirt" | "more"`: 14 properties. The pins in `wave17-grammar.test.cjs` and `RECORD_CORE_FIELDS` change.
- **SPEC §7:** the relationship modifier depends on the roll type. Leverage-backed and fear-backed asks change the roll (adults only, never romantic, d20 always drawn).
- **SPEC §8:** grudges, favours, report, price, tell and inquiry seeds as in 6.2; the "feared" tier now exists.
- **SPEC rule 7:** romance is fine, and intimate scenes fade to black. **That rule is now in the narrator's cached block.** `intimate` is recorded in tier A (rule 8).
- **SPEC acceptance test** "Insulting the same NPC three times": three insults to someone at pride +2, or four to anyone, reach "hates you" with its reason and plant a grudge.

**The under-18 test (`tests/relationships.test.cjs`):**

```
s.test('nobody under 18 ever carries spark, a spark status or a romance cue, and every advance, coercion, threat or blow aimed at a minor is handled before and after narration', async h => { ... })
```

It asserts:

1. **The roster.** It collects every record in `TOWN_DATA.npcs` (all 66) that is a minor by any anchor in 2.7, from the data and never from hard-coded names. It also asserts the set is exactly Kaylee, Micah and Austin today. None of them is on `TOWN_DATA.romance`, and `validate-town.cjs` exits non-zero when a minor is added to a temporary copy of the list.
2. **A new game.** For every minor: `rel.spark === 0`, `rel.romance === null`, `rel.status.now === null`.
3. **The line whenever a minor is present.** On every scripted turn with a minor in the scene, flagged or not, the narrator packet contains that minor's instruction ("is 16: never flirts or is flirted with …"). It contains no "open to a flirt", no spark status and no spark reason for them.
4. **Corroboration.**
   - **An unflagged kind remark** ("Thanks, sweetheart" to Kaylee, `romantic: null`, bookkeeper `complimented`) produces no consequence: a normal compliment, no reports, no reputation change.
   - **One signal** (the flag alone, or the flag in everyone-mode) gives only the light row (W -3, a weight-1 "made me uncomfortable" memory), with no guardian memory, no report and no reputation change.
   - **A named target plus two signals** (flag and phrase hit; or bookkeeper `flirted` and a phrase hit with the flag missed) gives the full row. The bookkeeper's version is replaced. Royce and Darlene each hold a weight-3 `crossed` memory and each plants a report to Chief Bell. Town reputation fell by exactly 10, even when a ±5-capped change landed the same turn.
5. **Coercion.** For an adult (Glenda, with `lev_glenda_tapes`) and for a minor (Micah, with the dock-light record), "Sleep with me or …" as intimidate with `romantic: "more"` gives:
   - no compliance, a d20 drawn, a failure, and the `COERCION:` refusal line;
   - `blackmailed` plus `crossed` at full;
   - an immediate report that ignores the police bar;
   - reputation -10, and -20 in all for Micah with the minor row;
   - no `intimate` and no spark change.

   The same for a fear-ceiling ask at fear 40 or more with the flag, and for a `paid` record.
6. **Threats and violence.**
   - Engine `threatened` and `hit` aimed at Austin each plant reports to Tammy and to Chief Bell, with reputation -5 and -10.
   - Two threats at Kaylee (fear past 40), then a till ask: the roll is made, with no compliance, and her secret does not open on fear.
   - A leverage-backed ask aimed at Micah rolls, and its demand is clamped to $0.
7. **Anchors and fallbacks.**
   - An import that strips Kaylee's town-copy age, current age and tags all together: she is still a minor (the live `TOWN_DATA` by id).
   - An ageless record with the role "high school student" fails closed.
   - `/edit` raising Micah to 18 unlocks nothing.
   - **Guardian absent:** with Tammy arrested, a threat at Austin reports to Chief Bell alone.
   - With Chief Bell gone, reports land on Hoyt Bramlett's record with the town-news line.
8. **Writes.** `State.apply` raising a minor's spark from the model, world, edit, import, upgrade and `/fact` sources is refused and logged. An imported `spark: 60` is set back to 0.
9. **Display.** After every turn of steps 3 to 8, for any minor:
   - the card renders no Interested row and no spark tag;
   - the feed printed no spark line;
   - no packet line for them matches `/open to a flirt|open to it|sweet on you|using you|wants you|has noticed you|falling for you|seeing you|old flame|interested|flirts back|lights up when|stands close|for one reason|looks twice|says yes|fade to black|not tonight/i` (outside the minor instruction itself).
10. **A player under 18.** The player at 16 flirts with Jodie (eligible) three times and asks her to stay. Jodie's spark stays 0, every welcome is no, there is no intimacy answer, and the under-18-player line is present. A player with no age gets the same.
11. **Fuzz.** 300 random `socialEvents` strings and 50 random parses (random `romantic`, targets, `aboutIds`), over every id, for 20 turns. **The test fails if any record that is a minor by any anchor has `rel.spark > 0`, a spark status, an `intimate` memory, or a romance cue in any packet.**
12. **Parser recall (live, skipped in mock mode).** The eval's romantic-intent lines are run through the real parser and phrase list. Detection recall for lines aimed at minors must be 98% or more, and no labelled kind remark may produce a full row.

**Also add:**

- Intimacy: the gate passes only with every condition met; it fails on each one in turn; money doesn't help; it is recorded private, weight 3, scar.
- Spark: caring liking (flirt spam never reaches "sweet on you"); "using you" needs earned distrust or the flag; the status feed line prints once per 7 days; the first unwelcome flirt costs W -3.
- `kept_word`: a named asker present who isn't the confider, and a confidence a day old (the fake path fails).
- `caught_you_at`: only with at most one witness, never public, news or violence; one record per act; `mattersTo` by kind.
- `rescued`: excludes danger the player caused.
- Leverage:
  - `learned_secret` needs the packet and 2 keys;
  - a backed ask needs the words check;
  - `paid` is terminal (a second demand is `threatened_to_tell`, no money, with the extra cost);
  - `canRaise` defaults and the three raised values;
  - `paid_silence` replaces `paid_back`, counted once;
  - no `goldDelta` from a target with a pending demand;
  - the `LEVERAGE:` line is present-tense;
  - hard-not-tough people refuse; tough people plant a violence grudge;
  - a hidden protector report shows only the day;
  - the standoff suppresses grudges and reports;
  - `whenTold` plants an inquiry (+1 police clock) and no arrest.
- A `beat_down` on a tough person plants a violence grudge.
- Dice streams: adding a report, price, tell, owed-favour or inquiry seed, or a backed or fear-ceilinged ask, doesn't change the next shared d20.
- The contempt cue; `exposed` counts as harm.
- Everything carried over from v2: the parser and alias cases; duplicate removal by class (including `paid_silence` against `paid_back`); caps; settlements; hysteresis; bounds; fear caps and window; protectors; role limits; delivery by tie class; household; hidden-tie lines; `/rewind`; the editor; migration.

**Executable worked examples** (`tests/relationships-examples.test.cjs`): all 14 examples in 6.4, scripted through the mock. Tracks within ±2; stance, tags, feed lines and narrator fragments exact.

**The 21-day simulator** (`tests/relationships-sim.cjs`, headless):

- **Beer-buyer** (a round nightly at the Low Water): Royce stays "warm to you" (W 30 to 40) and Curtis likewise; trust unmoved.
- **Confidant** (afternoons with Royce from Day 2): trust 30 and knows-you 25 by Day 6 by honest events. The staged `kept_word` run fails to reach it.
- **Brawler** (fights at the Low Water on Days 2, 4 and 6 only, against Wade, Colt and Trent):
  - Each victim reads "against you", fear 39 or less, never "afraid of you".
  - Each plants a violence grudge within 5 days.
  - **A regular who saw all three fights** (grudge-holding 0; witness copies on the wound clock, floor 0, -8 each):
    - liking -24 ± 2 after Day 6;
    - **-12 ± 2 on Day 14**;
    - **-7 ± 2 on Day 21**.
  - A grudging regular (r -2): **-13 ± 2 on Day 21**.
  - **Corrected in wave 30, when the simulator was built.** A fight seen is not -8: wave 27's witness copy is one memory a scene with every blow seen added (-5, -5, -8: -18, as example 4 pins). On the same wound clock each band is the above × 18/8: **-44 ± 3 on Day 7, -27 ± 2 on Day 14, -17 ± 2 on Day 21**, and the grudging regular's **-30 ± 2 on Day 21** (`BRAWL` in `tests/relationships-sim.cjs`). The cast has nobody both grudging and not hard, so the simulator makes one (a town copy's axes at r -2). It fights Wade all three times, so one victim is checked: never "afraid of you", "hates you" with its reason by Day 7.
  - Their fear from the fights is under 10 by Day 12 and under 5 by Day 16.
- Tuning changes the tables, and these bands must still hold.

**The labelled eval, before any tuning.**

- At least 150 playtest turns labelled with the act a neutral witness would name. Report exact accuracy and neighbour confusions, and tune the glosses until confusions are under 20%.
- **Plus about 50 romantic-intent lines** (N6c), labelled flirt, more or none, with the target:
  - euphemism ("ask what time she gets off", "see if she wants to get out of here");
  - Do mode ("I wink at Micah", "I put my hand on her arm");
  - kind remarks that are not romantic ("thanks, sweetheart", "you look tired, kid").
- Targets: recall of 98% or more for lines aimed at minors, and zero full rows on the kind remarks.
- A run on Haiku 5.5 costs under $0.10.

## Appendix E: romance eligibility (content; ships as below, the owner edits it)

`TOWN_DATA.romance`:

```
[ { npcId, open: true, sparkRate: 0.5..1.5, opensAt: { knows }, faithful: false } ]
```

**This list ships with the game** (N13). Anyone not on it can never have spark above 0. Adults only, every one 18 or older by `docs/CAST.md`:

| Person | sparkRate | opensAt (knows you) | Note |
|---|---|---|---|
| Jodie Strayhorn (29) | 1.2 | 20 | |
| Shayla Rawls (25) | 1.5 | 0 | not faithful to Travis |
| Travis Cagle (28) | 1.2 | 0 | |
| Curtis Pruett (52) | 1.0 | 10 | married but separated: Lynette put him out in December 2025 |
| Trent Haskins (24) | 1.0 | 10 | |
| Nikki Ballard (31) | 0.8 | 20 | |
| Annette Overstreet (34) | 0.7 | 25 | |
| Carter Sturdivant (45) | 1.0 | 10 | |
| Lamar Haskins (58) | 0.6 | 30 | widowed |
| Glenda Pryor (40) | 0.8 | 20 | |
| Colt Purvis (22) | 1.2 | 0 | |
| Tyler Rasberry (19) | 0.8 | 15 | |

- Leaving married people and the elderly off is a **default**, not a rule. Curtis is on because he is separated.
- The Royce and Loretta affair is a tie between them (B), not eligibility toward the player.
- The validator refuses anyone who is a minor by any anchor in 2.7.

## Appendix F: protectors, fallbacks, and the main `attitudeDelta` conversions

**Protectors** (content; defaults from relation labels: a minor's guardians plus Chief Bell; else a boss; else the police):

| Person | Protector |
|---|---|
| Hollis, Trent, Colt | Wade (Hollis→Wade is hidden: his reports follow the hidden-tie rule) |
| Dwight | Carter |
| Odessa | Vada |
| Tyler, Brianna | Mavis |
| Jodie, Lyman, Tammy | Loretta |
| Nikki, Travis, Glenda | Marcus |
| Kaylee | Royce, Darlene + Chief Bell |
| Micah | Ray, Nadine + Chief Bell |
| Austin | Tammy + Chief Bell |
| Marcus, Wade, Carter, Boyd, Leon | nobody (a grudge instead), except for coercion, where the report goes to Chief Bell, or to the sheriff if it is Marcus |
| Everyone else | the police |

**Fallbacks (N7):**

- **A guardian or protector** who is arrested, gone, dead or laid up is skipped. A minor's next is another adult with a family or household tie; then Chief Bell alone.
- **The police** (Chief Bell arrested or gone, or the department ended): Sheriff Hoyt Bramlett, in Clayburn. He takes the memory on his record, and a town-news line appears: "A deputy from Clayburn came by asking about `<player>`."

**Engine `attitudeDelta` conversions** (the integration agent owns the full list of about 40):

| Site today | Becomes |
|---|---|
| Grudge templates' third-party -10 | `crossed`-class secondhand memories (A); `propagate` (B) |
| Favour boosts +5 / +10 | Everyday +5 / +10 |
| Complication "takes it personally" -5; table-stakes fumble -5 | Everyday -5 |
| `meetingRep` (a missed meeting) | `broke_word` ×0.5 |
| `LOOSE_END_ATTITUDE` | `start` values |
| GOT_EVEN +10 | A got-even settlement (0.4) |
| Card seats ±1 / ±2 | `card_win` / `card_loss` everyday |
| Obligation `onMet` / `onMiss` | `paid_back` (or `paid_silence` for blackmail), `broke_word`, `told_anyway` |
