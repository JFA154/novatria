# Relationship system audit: Novatria (Lockett's Ferry)

Audited read-only on 2026-11-01 against `/home/user/novatria` at `56e69f5`. Every reference is `index.html:LINE` unless another file is named. Line numbers are current; the brief's landmarks had drifted by about 100 to 200 lines (State starts at 7619, World at 13236, Pipeline at 18203, Upgrade at 17520).

## Summary of the current model in 15 lines

1. Each NPC has one integer, `attitude` (-100..100), which means only "how this person feels about the player". It starts at the cast's hand-written value (-10..+15; the validator allows -20..20) and loose ends shift it at character creation.
2. Each NPC also has `memories[]`, at most 12, shaped `{ turn, day, text, weight 1|2|3, model?, act? }`. Weight is the only intensity and nothing stores valence. `act` records the kind of turn (attack, steal, talk..., or 'own').
3. NPC-to-NPC state is static `relations[{npcId, relation}]` labels, written on both sides. There are no per-pair feelings. Faction-to-faction `relations{}` numbers are written by clocks, but nothing in gameplay reads them.
4. Player-side state is `reputation{town, fac_*}`, derived from summed attitude deltas (÷5, capped at ±5 a turn) and template effects, plus `looseEnds[]` and `obligations[]`. The narrator only ever sees the one-word town tier.
5. Writers: the bookkeeper's `attitudeChanges` (±25 a turn per NPC; positive deltas scaled 1/½/¼/0 for repeat asks, 0 for a second gift that day), engine `attitudeDelta` ops (uncapped), and editPerson (absolute).
6. Engine deltas: complication -5; obligation onMiss -10..-20 and onMet +10/+15; grudge templates -5/-10 on third parties; favours +5/+10; "got even" +10; missed appointment -3; card seats -2/+1; caught cheating -20; table-stakes fumble -5; first meeting a faction member: reputation ÷ 5.
7. Drift: each morning, 2 points back toward the town-copy baseline. It pauses only for a weight-3 memory from the last 5 days or an open loose end.
8. Grudge: attitude ≤ -60 plus a fresh weight-3 memory that is not 'own'. Favour: ≥ +60 plus a fresh weight ≥2 memory. Each plants a dated seed from a template (answered in kind), with a 7-day cooldown and one feeling per memory.
9. Thresholds are hard-coded across modules: ±50 dice and secrets; 25 bed and rescue; -25 seats, rumours and "hard" parse; -10 dealer; 0 stakes; Royce 15/20/30; Loretta 40; recap ±5; and the band and word cuts.
10. Words: hostile ≤-60, cold ≤-25, wary <-5, neutral ≤5, friendly <25, warm <60, loyal. The UI collapses these into 5 meter levels, and feed lines fire only across the 4 inner cuts.
11. Narrator PRESENT gives each person `attitude N (word)` and up to 5 picked memories plus any loose-end line, all in the uncached per-turn message. The cached cast block has ties and schedules but no feelings.
12. Bookkeeper input: present people with `attitude N` and their last 3 memories raw, plus every known NPC's attitude. Its rubric is one sentence ("±5 to ±15 unless something major") plus MEMORY_RULES. The schema is at a 41-property grammar edge.
13. Saves carry their own town copy (`State.town`). Upgrades are `Upgrade.MIGRATIONS` steps at `RULES_VERSION` 8 that fill only what is missing. Old saves keep their own events, thresholds and drift baselines unless a migration replaces them.
14. 170 test bodies in 35 files mention this state, and about 100 of them assert on it directly. Pinned numbers include -15 per insult, the ±25 cap, -60/60 and not 59, +10, 2 a day, -3, -2/+1, -10, 0, 25, 50, the band lines, 41 schema properties, and the cached-block budget (12,671 of 13,000 estimated tokens).
15. Weak spots: a single scalar drives 20+ unrelated gates. There is no NPC-to-NPC opinion. Reputation ignores engine changes. Drift erases warmth. Valence is guessed by regex. The People editor strips memory `day`/`act`. The bookkeeper may move anyone's attitude, present or not. The docs disagree with the code on the band cuts and recency.

---

## 1. Data model

### 1.1 NPC record: authored fields (TOWN_DATA, `index.html:2470-4045`)

Example record: Loretta at 2471-2493. The validator's key whitelist is `tests/validate-town.cjs:1191`. Required keys: `id, name, pronouns, age, presence, role, factionId, tags, look, voice, personality, goal, secret, history, attitude, relations, home, memories, alive, knownToPlayer, status`. Optional: `where, reach, died, buried, awayOn`. **Any new authored NPC field must be added to this whitelist, or the validator fails with "unexpected field".**

| Field | Relationship role | Notes / refs |
|---|---|---|
| `attitude` | the only feeling (toward the player) | int; cast range -10..+15 today (Boyd and Wade -10; Ray +15; Loretta 5; Royce 10; Curtis 5); validator `-20..20` (`tests/validate-town.cjs:1265`); 25 away/dead at 0. In state: clamp -100..100 everywhere. |
| `memories` | what they hold against or thank the player for | `[]` in content (validator 1266 requires empty) |
| `relations` | static NPC↔NPC labels | `[{ npcId, relation }]`, meaning "npcId is this person's relation" (7558-7560). **Written on both sides** in content, with answering words (wife/husband) and gendered words matching pronouns: `Town.validate` 12856-12861; `tests/validate-town.cjs:1295-1340`. |
| `factionId` | ties to reputation | 11 members: Carter, Jolene, Dwight (fac_sturdivant); Hollis, Wade, Colt, Trent (fac_nightrun); Marcus, Travis, Glenda, Nikki (fac_police) |
| `tags` | gates templates, loose ends, cards, gossip | e.g. `cardplayer` (Royce 2502, Carter 2548, Wade 2617, Lyman 2988, Elbert 3011), `bookie` (Curtis 3242), `police`/`watch`, `elderly`, `teen`, `gossip`, `informant`, `bartender` |
| `personality`, `goal`, `secret` | steer the narrator (traits, "wants", secret) | exactly 2 traits in content (validator) |
| `knownToPlayer` | false in content | |
| `status` | `free \| arrested \| gone \| dead` (NPC_STATUSES 6196) | gates grudges (isFree 13343), seats, events (`npcFree`) |
| `presence`, `alive` | `here \| away \| dead` | the dead "remember nothing" (addMemory no-op, 9559) |
| `home` | location id → `{ locationId, phases }` in state (12176-12186) | household detection for rumours (21676-21681) |

`Town.instantiate` defaults (12182-12188): `{ tags: [], memories: [], alive: true, knownToPlayer: false, status: 'free', attitude: 0, relations: [] }`. Factions default to `relations: {}` (12189).

### 1.2 NPC record: fields added in play

| Field | Writer | Meaning |
|---|---|---|
| `metTurn` | `npcKnownToPlayer` when the id is in `present` (10732-10733) | met face to face; the narrator stops sending `look` (21644); the recap's "dealt with" test (23360) |
| `repApplied` | `meetingRep` (11492-11501) | the faction-reputation shift on first meeting has been applied (once) |
| `hurtUntilDay` | `npcFates` hurt (10824) | laid up |
| `created` | peopleRevealed / editPerson (7545-7548, 7514-7515, 10173-10177) | `{ turn, day, by: story\|edit\|..., relationToNpcId, relation, locationId?, byNpcId? }`: a **one-sided** relation (editPerson never writes `relations[]`) |
| `unnamed` | peopleRevealed | "Dewayne's wife" with no name yet |
| `memories[].feelingPlanted` | **no writer** (read at 13657; `docs/notes/engine-world.md:163, 229`) | World derives "already grew a feeling" from the seed's cause instead |

### 1.3 Memory shape and rules

- Shape (written by `remember`, 9114): `{ turn, day, text, weight, model?: true, act? }`.
  - `model` is set only for bookkeeper memories.
  - `act` is one of `MEMORY_ACTS = ['attack','steal','talk','persuade','deceive','intimidate','own']` (9093).
  - `day` dates from wave 4 (9113). Older memories fall back to the log (`World.memoryDay` 13983-13989).
- `MEMORY_MAX = 12` (7771). `MEMORY_TEXT_MAX = 120` (7772, model text only). `MEMORY_STALE_TURNS = 30` (7773).
- `PROTECTED_MEMORIES` (7817): `/^Loose end with /i` and `/^Fact \(a story point\):/i`. These are never settled and never rewritten by Upgrade.
- `checkMemories` (9983-9996) is the full-list validator used by setMemories and editPerson. Turn 0..meta.turn, weight 1..3, text up to 400 (strict for the player). It keeps `day`, `model` and `act` if present.

### 1.4 Player-side state

- `player.reputation = { town: 0, fac_sturdivant: 0, fac_police: 0, fac_nightrun: 0 }` (11595-11596, 11607). Each value is clamped to -100..100 (9451-9459).
- `player.looseEnds[] = { kind, label, text, npcId, seedId, threadId, created }` (11392-11400). Kinds: `debt, enemy, secret, lost, promise` (6197).
- `player.obligations[] = { id: obl_<kind>_<npcId>, kind: debt|blackmail|promise|errand|lodging, npcId, text, amount, dueDay, itemName, status: open|met|missed, onMiss[], onMet[], createdTurn, createdDay, paid?, missText?, owedTo?, settledDay?, late? }` (the `addObligation` op, 9599-9640; id at 9624; OBLIGATION_KINDS 7832). onMiss and onMet carry the attitude and memory effects (§2.6).
- Other per-NPC bookkeeping that touches the relationship:

  | Field | Meaning | Ref |
  |---|---|---|
  | `state.seen[npcId]` | where the player last saw them | 7517-7519 |
  | `meta.gifts = { day, ids }` | today's gifts | 10948-10954 |
  | `flags['cardsMark.<id>']` | the day a seat's memory and attitude last moved | 20826 |
  | `flags['cardsCaught.<id>']`, `flags['cardsAsked.<id>']`, `flags['cardsNoLimit.<id>']` | dealer state | 21300, 21066, 21065 |
  | `bans[].byNpcId` | who barred the player | 9532 |
  | `rumours[].sourceNpcId`, `.heardFrom`, `.tellerIds` | who told what | |
  | `log[].to` | the Say addressee | |
  | `seeds[].origin = { kind: grudge\|favour\|loose_end\|..., npcId, template }` | SEED_ORIGINS 7820 | |
  | the in-memory `ledger.attitude` | per-turn cap counter, not saved; reset per turn and on load | 7846, 11912 |

### 1.5 Factions

- Static values: `fac_sturdivant.relations = { fac_police: -30, fac_nightrun: -50 }` (4175); `fac_police: { fac_sturdivant: -30, fac_nightrun: -60 }` (4305); `fac_nightrun: { fac_sturdivant: -50, fac_police: -60 }` (4434).
- Writer: the `factionRelation` op, symmetric and clamped (9429-9441), used only in clock completions (4066, 4080, 4101, 4122, 4159, 4193, 4208, 4275, 4290, 4323, 4338, 4361, 4397, 4419).
- **Readers: only the debug view (26390) and the validators (12917).** No gameplay code reads faction-to-faction relations.

### 1.6 Per-pair NPC↔NPC state: confirmed none

A grep for opinion, regard, toward and similar fields finds nothing beyond the following:

- The static `relations` labels.
- The one-sided `created.relationToNpcId/relation`.
- Derived checks: `household(a,b)` (shared home, or a household relation word: 21676-21681) and same-faction "mates" (21685), both used only for rumour spread (`wouldKnow` 21682-21693).
- `tiesOf(n)` reads both directions (8673-8692).

Nothing records how A feels about B, or how A's feeling changes because of something B did.

---

## 2. Every write path

### 2.1 Primitive ops (State)

| Path | Ref | Rule |
|---|---|---|
| `attitudeDelta` effect op | 9405-9412 | `delta` integer; clamp the result to -100..100; **no per-turn cap**. Every engine and content change goes through it. The validator caps an authored delta at \|50\| (`tests/validate-town.cjs:807-809`, `checkDelta(...,50)`). |
| `attitudeChanges` (record_changes field, any source) | 10588-10601 | 0 is ignored. **Per NPC per turn ±`LIMITS.attitudePerTurn` = 25** (7825), counted in `ledger.attitude[id]` across every attitudeChanges entry that turn (not attitudeDelta). The excess is clamped and logged as "delta X clamped to Y". **No presence check:** the model may move anyone's attitude. |
| `meetingRep` | 11490-11501, called from 10734 | On the first meeting (`metTurn` set while present; or, with no present list, a model's first mention) a faction member gets `+= round(reputation[factionId] / 5)`, once (`repApplied`). Uncapped, not in the ledger. Fires from `noteIntroductions` too (21493, engine source, before the bookkeeper). |
| `editPerson` (source 'player') | 10069-10200; attitude 10107-10110, 10170 | Absolute value, clamped to ±100, "no per-turn limit" (7503-7504). Also replaces the whole `memories` list (10196). The relation goes to `created` only (10171-10182). |
| `mergePeople` (Upgrade 6) | 10410-10431 | The cast member takes the made-up person's attitude only if "fresh" (not known, no memories). Memories are concatenated oldest-first and capped by dropping the lightest. |
| `setMemories` (Upgrade 2) | 11403-11410 | The list is replaced outright (`checkMemories`, non-strict). |
| `/rewind` | 11137 | Memories with `turn` later than the kept turn are dropped. |
| `World.forceAttitude` (test/debug) | 14579-14585 | Sets an absolute value through `attitudeDelta`. |

### 2.2 Memory writers (`remember`, 9094-9120)

**`remember` rules, in order:**
1. **model:** at most one model memory per person per turn. A heavier one replaces the same-turn lighter one; otherwise it is rejected: "already has a memory this turn".
2. **fade:** every weight-1 memory older than 30 turns is dropped whenever *any* new memory arrives for that person.
3. **merge** (model and the addMemory op): an existing memory with the same first five words (`memoryKey` 9076-9078) is removed. The new one takes the newer words, the max weight and this turn.
4. **push** `{turn, day, text, weight, model?, act?}`.
5. **cap at 12:** drop the first entry with the minimum weight, which is the oldest of the lightest.

**Writers:**

| Writer | Ref | Text / weight / act |
|---|---|---|
| `newMemories` (record field) | 10602-10610 | Model text goes through `shortMemory` (11505-11509: strip "Remembers:" and the full stop; 120 characters cut at a word). Engine text is 400. `act` = the turn's `actionType` for the model, `m.act` or actionType for the engine. No presence check. |
| `addMemory` op | 9555-9562 | Text 400; weight 1..3 (default 1); merge; `act` validated. Dead → no-op; away still remembers. |
| `memoriesSettled` (remove) | 10832-10843 | The model needs the person present. The first non-protected memory whose text contains the words (or is contained in them), at least 6 characters. |
| Loose end at creation | 13099 | `"Loose end with {player} ({label}): {text}"`, weight 2, protected. |
| `/fact` | 22724-22729 | `"Fact (a story point): ..."`, **weight 3**, protected. Counts for drift's `heldHard`, and is not 'own', so it can feed a grudge or favour. |
| Critical failure on a social roll | 18938-18946 | The present target gets `"Watched {p} fail badly: {summary}"`, w2 (no act). |
| Complication "{witness} catches you at it" | 5309-5310 | `"caught {playerName} sneaking around {place}"`, w2. |
| `knockDown` | 14388-14391 | Victim `"knocked me down in a fight at {place}"` w3; every witness `"saw {p} knock {n} down at {place}"` w3; act 'attack'. |
| `arrestPlayer` | 14528 | Chief `"locked {p} up overnight for fighting at {place}[, and took ...]"` w3, act 'own'. |
| `sleptRough` | 14486-14490 | Chief w2 on the first warning, w3 with a fine; act 'own'. |
| `defeat` | 22142-22143 | Rescuer `"Found {p} beaten senseless and helped them"` w2. Captor `"Beat {p} in a fight and dragged them to the cells"` w3, **no act 'own'** (see §11). |
| Card seats (`seatMarks`) | 20825, 20829 | `"lost $X to {p} at cards at {place}"` w1 / `"took a pot off {p} at cards at {place}"` w1. |
| Caught cheating | 21297 | Dealer `"caught {p} cheating at cards in {place}"` w3. |
| Missed appointment | 14139 | `"waited for {p} at {place} and they never came"` w1. |
| Obligations, templates | §2.6, §2.7 | |

### 2.3 Bookkeeper attitude: caps and scaling (Pipeline)

**Pipeline order** (per turn): `cleanDiff` (22257-22283), then `State.apply(clean, { source: 'model', present, rollSuccess, attacked, targets, actionType, bought, paying, rolled, asked })` (22295), then `giftGiven` (22298), then `World.driftReputation(before)` (22305).

- **Repeated asks.** The ask is the same family plus target, place, day and phase (`Dice.lockKey`; FAMILIES 6709-6712). Pipeline counts its earlier successes with `Dice.successes(key)` before the roll (19225). On a social-family success with `before > 0` it sets `ctx.diminish = { npcId, times, factor: Dice.diminishing(times) }` (19234-19238).
  - `DIMINISHING = [1, 0.5, 0.25]`, then 0 (6715, 6931).
  - The narrator also gets `ASKED BEFORE: ... It works again, but it wears thinner: less warmth, a look, a shorter answer.` (19237).
  - `cleanDiff` multiplies only **positive** deltas for that NPC and rounds. A result ≤0 is dropped (22269-22276).
- **Gifts.** The first gift of the day to a person is unscaled; any later gift that day scales to 0.
  - `giftCheck` (19049-19061) runs unless the action is in `NOT_GIFTS = ['buy','sell','gamble','steal','attack']` (18997) or the turn bought something. Said to everyone, it is a gift only with one person present.
  - `giftIn` (19076-19087) needs the diff to hand money (`goldDelta<0`) or things (`itemsLost`).
  - It is no gift if: a Say diff gains a good; or the money goes toward an owed debt or blackmail; or the thing goes toward an owed errand (`owedTo` 19069-19073).
  - `times` comes from `meta.gifts` (today's ids). `times>0` → factor 0 (22268). The gift is recorded only after it is handed over (22297-22298).
- **Payments vs gifts.** `PAYING_WORDS` (19019) always make Say money a payment (`ctx.paying`). `GIFT_PHRASES` (19021) make "buy yourself lunch" a gift. A purchase is never a gift (`boughtIn` 19042-19048). A payment moves no attitude of itself: the obligation's onMet does (§2.6).
- **Engine "already applied" lines** tell the bookkeeper to record no attitude:
  - TABLE STAKES: "record no attitude change, flag or goldDelta" (21081).
  - CARD GAME: "record no memory or attitude change for the hand" (21291-21292).
  - SAME ASK AGAIN *suggests* "a small attitude drop (-5 to -10) for the person pushed" (22066).

### 2.4 Complications (TABLES.complications, 5289-5320; applied at roll time, 19091-19098)

- `"{witness} takes it personally"`: failure tier, social, needs a person → `attitudeDelta {witnessId} -5` (5307-5308).
- `"{witness} catches you at it"`: failure tier, stealth → w2 memory (5309-5310).

The witness is the target if present, else someone present (`docs/notes/engine-world.md:52-60`). The other 18 entries carry no feeling effect.

### 2.5 Loose ends (Town.resolveLooseEnd, 12960-13104)

- `LOOSE_END_ATTITUDE = { debt: -10, enemy: -40, secret: -5, lost: 10, promise: 5 }` (12972), applied once as `attitudeDelta` (13091-13094). Measured with seed 12345: Carter 10→0 (debt), Boyd -10→-50 (enemy), Tyler 5→0 (secret).
- Memory w2 (protected), `npcKnownToPlayer` (no `present` → no meetingRep).
- The enemy follow-up seed (13078-13090) has `requires: { threadOpen: [threadId], attitudeBelow: { npcId: 0 } }` (13087). It fires only while the person still holds it against the player.
- While the loose end's thread is open, drift is suspended for that person (`tied`, 14006).

### 2.6 Obligation effects (LOOSE_ENDS content, 5523-5757; run by `settle` 9286 / `tickObligations` 9238 / World `missedObligations` 13584)

| Obligation | onMiss | onMet |
|---|---|---|
| debt $400 (default), $600 | `takeItem` phone, **-15**, w3 own `"...let the ... go past due, so I took the phone as a start."`, news | **+10**, w2 "paid ... in full and on time" |
| title note $300 | `obligationPaid` 150 take, phone, **-10**, w3 own | **+10**, w2 |
| card debt $400 | ban Low Water 3 days, **-20**, w3 own "welshed...", public news | **+10**, w2 |
| blackmail $200 | Marcus w2 + **Marcus -10**; blackmailer **-10** + w3 own; public news | w2 "paid me two hundred dollars to keep quiet" |
| promise (default) | **-10**, w2 | **+10** |
| errand (letter) | Bernice w2 | **+15**, w3 "brought me a letter from home" |
| promise (Dale's boy) | Dale w2 | **+10**, w2 |
| promise (bring daughter home) | Bernice w2 | **+10** (bound person) and Bernice w3 |

A late payment rewrites "on time" memories (`lateText`, 9324-9331).

### 2.7 Grudge and favour template effects (5759-6047), at seed fire (14211-14214)

- **Grudges** (14 templates, by index):
  - [0] theft/police: Marcus w2 + **Marcus -10**.
  - [1] money: price ×1.25 for 5 days, town rep **-5**.
  - [2] ban (bartender): ban 3 days.
  - [3] ban via Loretta: ban + **Loretta -5**.
  - [4] violence: -3 HP, Beaten.
  - [5] violence (shove): -1 HP, town **-3**.
  - [6] money: take the phone.
  - [7] gossip: **Wade/Colt/Trent -10 each**, fac_nightrun **-10**.
  - [8] gossip: **Ray/Nadine -10**, town **-5**.
  - [9] gossip (teen): town **-5**.
  - [10] police ticket: -$50.
  - [11] police/dispatcher: **Marcus/Nikki/Travis -10**, fac_police **-10**.
  - [12] gossip: **Shayla -5**, town **-5**.
  - [13] violence/police: Marcus w2 + **Marcus -10**.
- **Favours** (12 templates):
  - [0] warning news.
  - [1] price ×0.8 for 3 days.
  - [2] self w1 "Pointed {p} toward somebody...".
  - [3] +$100.
  - [4] photo news.
  - [5] alibi: Marcus w2 + **Marcus +5**.
  - [6] ramp warning.
  - [7] +2 HP.
  - [8] teen news.
  - [9] police favour: **Marcus/Nikki/Travis +5**.
  - [10] self w1 "Told {p} the old story about the river...".
  - [11] **Loretta +10**.
- When a grudge fires the holder gets **+10 `GOT_EVEN`** (13244, 14232-14233). A favour that fires changes the holder's attitude by nothing.

### 2.8 World tick writers

- **Drift** (step g, mornings only; 14002-14017, called at 14033):
  - Applies to every NPC not dead, including gone, arrested and never-met NPCs.
  - Baseline: the save's town copy `(State.town || TOWN_DATA).npcs[id].attitude`, else 0.
  - Skipped when at baseline, `tied` (an open loose end), or `heldHard` (any weight-3 memory dated within the last `DRIFT_QUIET_DAYS = 5` days; 13995-14001).
  - Step: `sign(gap) * min(DRIFT_PER_DAY = 2, |gap|)` via `attitudeDelta`.
  - Weight-2 memories do not hold drift. Drift is symmetric for warm and cold.
- **Missed appointment** (step h; 14120-14147): `addMemory` w1 plus **-3**, and the quiet line "`{Name} waited at {place} and you never came.`" (14142).

### 2.9 Card table writers (Pipeline)

- **Seats** (`seatMarks` 20795-20839; `SEAT_MARK_MIN = 10`): applies to the other seats only, never the dealer, and only the first change per seat per day (flag `cardsMark.<id>`).
  - A seat that put $10 or more into a pot the player took: **-2**, w1.
  - A seat that took $10 or more of the player's money: **+1**, w1.
- **Caught cheating** (21293-21302): dealer **-20**, w3 memory, `banFrom` for `CAUGHT_BAN_DAYS = 3` (19283), `cardsCaught` (no deal for `DEALER_GRUDGE_DAYS = 7`, 19285), public news.
- **Table-stakes ask** (21031-21083): a fumble costs **-5** (21066). The yes/no/again outcomes change no attitude.

### 2.10 Reputation writers

- The `reputationDelta` op (9451-9459): templates (§2.7) only. No TOWN_DATA clock or seed uses it (grep: none in 1650-5160).
- `World.driftReputation(before)` (14538-14563), only after the bookkeeper diff (22291, 22305):
  - Sums the attitude change of every **knownToPlayer** NPC across that `State.apply` call.
  - `round(sum / REP_DIVISOR = 5)`, clamped to `±REP_CAP = 5` per turn (13240-13241).
  - Moves `town`, plus each member's faction by the faction's own sum.
- **Not counted:** drift, complications (applied at roll time), cards, obligations, grudges, appointments, `noteIntroductions`' meetingRep, and editPerson.

### 2.11 Town events

No TOWN_DATA event, clock or seed writes attitude or memories (grep). Events only *read* attitude (§3).

### 2.12 Mock bookkeeper (`Api.mockBookkeep`, 16784-16930)

Tests run in mock mode, so these numbers are pinned.

- One attitude change and one memory per person (`feel`/`remember`, 16806-16807).
- Values:
  - Say insult: **-15**, w2; a repeat is "...again" w3 (16815-16827).
  - Threat: **-20**, w3 "threatened me".
  - Persuade success: **+8** (16829).
  - Apology that lands: settles the latest grudge memory, **+10** (16831-16834).
  - Attack: **-20**, w3 "attacked me" (16836-16841).
  - Failed steal: **-20**, w3 "{p} tried to steal from me".
  - Gift of money or a thing: **+5**, w2 "gave me ..." (16919-16928).
  - Debt paid in full: **+10**, w2, only when the obligation's onMet has no memory (16914).

---

## 3. Every read path / threshold

| Gate | Threshold (exact) | Ref | What it does |
|---|---|---|---|
| Dice social modifier | `> 50` → +2; `< -50` → -2 (strict); total mods capped ±4 (`MOD_CAP` 6706) | 6753-6769 | Social = stat charm, or actionType in `SOCIAL_ACTIONS` [talk, persuade, deceive, intimidate, buy, sell, give] (6708), vs `npcTarget` = the first present target (19188) |
| Secret reveal | `>= 50` for anyone aimed at and present; or any successful social roll aimed at them | 19107-19119 (`secretsFor`), 21655 | adds `secret (it can come out now, if the talk goes there): ...` to PRESENT |
| `State.attitudeWord(a)` | `<=-60 hostile`, `<=-25 cold`, `<-5 wary`, `<=5 neutral`, `<25 friendly`, `<60 warm`, else `loyal`. Ranges: hostile -100..-60, cold -59..-25, wary -24..-6, neutral -5..5, friendly 6..24, warm 25..59, loyal 60..100 | 12126-12134 | narrator PRESENT, recap, People meter, editor, debug |
| `State.reputationTier(key='town')` | `>=50 respected`, `>=20 known`, `<=-50 despised`, `<=-20 disliked`, `\|v\|>=5 noticed`, else `unknown` | 12116-12125 | narrator PLAYER line (town only), Character Standing |
| Grudge plant | `attitude <= GRUDGE_AT (-60)` and `freshMemory(n, 3)` (weight ≥3, `act !== 'own'`, no feeling yet) | 13238, 13771 | §6 |
| Favour plant | `attitude >= FAVOUR_AT (60)` and `freshMemory(n, 2)` | 13239, 13772 | §6 |
| Feeling cooldown | none planted while one is waiting; none until `lastFiredTriggerDay + FEELING_COOLDOWN (7)` | 13243, 13766-13768 | |
| Card seat sits in | `attitude > SEAT_COLD (-25)` (strict) and tagged `cardplayer` (or the built-in town's record says so) | 19480, 19527-19532 | |
| Curtis deals | refuses while `attitude < DEALER_COLD (-10)` (deals at -10 or above); also for 7 days after catching the player | 19286, 19332-19338 | |
| Table stakes | `attitude < STAKES_COLD (0)` → "Not with you." with no roll; else a Charm/normal roll (the Dice modifier applies) | 20990, 21046 | |
| Bed / host | anyone free with `attitude >= 25` who lives there (and is there now or tonight) or owns it and is there | 9810-9838 (9833) | "bed" heals 3 vs rough 1 |
| Defeat rescue | a present non-foe with `attitude >= 25`, the highest first | 22129-22130 | outcome 'rescued' + w2 memory |
| Rumour sharing | the pool is only people with `attitude > -25` | 21700 (comment 21671-21672) | one fresh rumour per social turn |
| Council (day 6 evening) | Royce `>= 30` tables it (4646, 4659); `playerAt loc_town_hall` + Royce `>= 15` tables it (4696, 4709); `royceBought` + Royce `>= 20` abstains (4722, 4734) | events 4596-4870; `conditionsMet` 13402 | branch order: report void → R≥30 → Curtis debt met → at hall R≥15 → bought R≥20 → bought+turned → turned → bought → clock≥4 → default (each with a Hollis-out twin) |
| Epilogue | `oldBridgeClosed` + Loretta `>= 40` → "a stool ... for somebody who stayed" | 5048 | |
| Seed requires | `attitudeBelow { npcId: n }` → `<` (strict); `attitudeAtLeast` → `>=` | 13402-13404 | only use: the enemy loose end follow-up, `attitudeBelow 0` (13087) |
| Parser difficulty | text rubric: "hard (15) ... when asking anything of someone at attitude -25 or below" | 15335 | model-judged; the parser sees `attitude to the player N on -100..100` (18625) |
| Narrator PRESENT | `attitude N (word)` | 21653 | §4 |
| Bookkeeper packet | `attitude N` for present and other known people | 22039 | §5 |
| `/recap` | Warm `> 5`, Cold `< -5`; top 3 each, sorted by attitude; only people "dealt with" (metTurn, a loose end, or a w≥2 unprotected memory), known, alive, in town | 23359-23366 | `Name (word, reason)` |
| People tab sort | `attitude` sort is descending attitude, then last-seen turn, then order | 26182, 26263-26270 | |
| People meter | `ATTITUDE_LEVEL = { hostile:1, cold:1, wary:2, neutral:3, friendly:4, warm:5, loyal:5 }`; 5 segments | 24939-24948, 25076 | shown only for in-town people who are met (not heard-of or absent) |
| Feed band lines | level change between turn start and end (the turn is batched: 11538-11551), cuts at -25/-24, -6/-5, 5/6, 24/25; nothing at ±60 | 28973-28991; `UI.attitudeLevel` 28600 | §8 |
| Drift baseline | equality with the town-copy value | 14005, 14011 | |
| Reputation drift | attitude deltas of known NPCs | 14548-14553 | |
| Mock greeting | `<=-60` "turns away and will not look at you."; `<=-25` "gives you a cold look. "What now?""; `<-5` wary variants; `<=5` neutral; `<60` nod; else "greets you warmly" | 16161-16169 | pinned by acceptance [4] |
| Mock insult reaction | `<= -25` "has heard enough. "Get out of my sight."" | 16274, 16533 | |
| Debug tab | `att N (word)`, memories `(w, tN) text`, factions' relations, reputation numbers | 26390-26410 | |

**Memory reads (non-attitude):**

| Reader | What it reads | Ref |
|---|---|---|
| `pickMemories` | narrator and People card | 21397-21414 |
| `freshMemory` | grudge/favour source | 13662-13666 |
| `heldHard` | drift hold | 13995 |
| `memoryKind` | grudge kind, from `act` or regex | 13703-13712 |
| `recapReason` + `memorySense` | the recap reason, valence guessed by regex `MEMORY_BAD`/`MEMORY_GOOD` | 23270-23319 |
| UI `hasMet` | any memory makes a person "met" on People and the map | 24914-24919 |
| recap `dealt` | the dealt-with filter | 23360 |
| bookkeeper packet | the last 3 memories | 22041 |
| mock `said()` | repeat detection | 16808 |

**Reputation reads:**

| Reader | What it reads | Ref |
|---|---|---|
| narrator PLAYER line | `Reputation: <town tier>` | 21859 |
| Character Standing | one row per key in `player.reputation` | 26203-26227 |
| `meetingRep` | the faction value | 11495 |
| debug | raw values | 26410 |

`ctx.reputation` (22305) is stored and read by nothing. Faction reputation never reaches a model except through meetingRep.

---

## 4. The narrator packet

### 4.1 The PRESENT line (`Pipeline.npcLine`, 21627-21657; assembled at 21813-21863)

The format is fixed. Parts are joined with `; `, people with `; `, and the line ends with `.`:

```
PRESENT: <Name> (<age>, <he/him|she/her|they/them>; <role>[; <relationNote: "Darlene's husband">][; <hasWords: "wife: Darlene Pittman, daughter: Kaylee Pittman, father: the late Clyde Pittman, employee: Dewayne Mangum">][; hurt: laid up until Day N][; look: <look, until metTurn>][; not met yet: the player has heard of them by this name from others, but has never met them | ; not yet introduced: the player does not know this name; go by the look until they give it][; voice (a habit, not every line): <voice>][; traits: a, b][; wants (never say this outright; it steers what they push for and dodge): <goal>]; attitude <N> (<word>)[; remembers: <m1> / <m2> / tied to <Player> by a debt (see LOOSE ENDS)][; secret (it can come out now, if the talk goes there): <secret>]); <next person> ...
```

- `relationNote` (8700-8715) gives the one family phrase. A created relation comes first, then household, then family, preferring the living. It is omitted when the role already says it.
- `hasWords` (18302-18304) lists the people this person *has*, top 5, ranked household > family > other. The dead read "the late X" and the away "X [lives elsewhere]" (`tieName` 18298).
- `brief` (DESTINATION, 21879) leaves out memories, traits, wants and the secret.
- Example strings the model sees in the cached style block: 6148-6183 (e.g. `PRESENT: Charlene Voight (58, she/her; owns the Tip Top; voice ...; wants ...; attitude -20 (wary); remembers: owes me four hundred)`).

### 4.2 Memory selection (`pickMemories`, 21397-21414)

| Caller | Options | Ref |
|---|---|---|
| Narrator | `{ w3: 3, w2: 2, w1: 1, recent: 10, cap: 5, looseEnds: true }` | 21634 |
| People card | `{ w3: 4, w2: 3, w1: 1, recent: 10, cap: 8 }`, no loose ends | 24983 |

The algorithm:
1. Set aside loose-end memories.
2. Keep the newest 3 weight-3, the newest 2 weight-2, and the newest 1 weight-1 if it is from the last 10 turns.
3. Order oldest-first and keep the last 5.
4. For the narrator, add every loose-end memory on top of the cap. They are rendered as `tied to <P> by <label> (see LOOSE ENDS)` (`memoryText` 21619-21622).

Facts (`Fact (a story point): ...`) pass through as plain memories. The comment says "SPEC section 13: ... last 20 turns" (21623) and SPEC.md:371 says 20; the code uses **10**.

### 4.3 Ties, reputation, wants and secrets elsewhere in the packet

- **Cached cast block** (`castBlock` 18325-18373): `id — Name (age, pron; role; <tieWords: what they are to others, top 4, "husband of Darlene Pittman">; usually at X (phases); home: Y[; under arrest...]) History: ...`. The dead and the away follow under NOT IN TOWN. **No attitude, memories, wants or secrets.** It is byte-identical until the cast changes (an edit, merge, arrest or death).
- **Reputation** appears only as `PLAYER: <name> (...). Reputation: <town tier>. ...` (21859).
- **LOOSE ENDS** (21576-21616), written from the NPC's side: "`<npc> is owed money by <p> from before <p> came here, and wants it`" (and enemy, secret, lost, promise variants), then `(here now|not here|dead; ...state; <p>'s own words: "...")`.
- **WHAT PEOPLE KNOW** (21765-21772): "Only X, Y and Z knew of <p> before". The rule text is in the cached style block (`Style.KNOWLEDGE` 14610: "Each person knows about the player only what their "remembers" list and LOOSE ENDS say...").
- **Wants** (the goal) appear in PRESENT (not brief) and in the parser's NPCS PRESENT (`wants: ...`, 18627). Never in the cast block.
- **Secrets** appear only via `ctx.revealSecretFor` (19107-19119). The People editor folds them away (25186-25190), and the debug tab shows them.

### 4.4 Cached vs per-turn

- **System** (cached, `ephemeral`, `ttl: 1h`; 15619, 17238-17242): `[Style.systemPrompt (guide + KNOWLEDGE + examples), townBlock, castBlock]`.
- **User message** (per turn, uncached): the whole `narratorPacket` (STORY SO FAR ... PRESENT ... MODE/LENGTH), plus `ctx.narratorLines` spliced after COMPLICATION (21935-21948).
- **Budget** (measured with `Game.Style.systemPrompt()` etc.): style 1,238 + town 1,904 + cast 5,909 words = 9,051 words × 1.4 = **12,671 estimated tokens against the 13,000 limit** (`tests/api.test.cjs:171-174`). That leaves about 330 tokens (about 235 words) of headroom.
- The narrator packet must stay under 12,000 characters (`tests/playtest.test.cjs:482-483`). The playtest's warm-turn cost band is 1-6 cents (478).

### 4.5 Per-turn cost of PRESENT for three people (measured, seed 12345, headless, `Pipeline.npcLine`)

| Case | Loretta | Royce | Curtis | Total |
|---|---|---|---|---|
| Not met, no memories (look sent) | 799 ch | 871 ch | 741 ch | **2,411 ch ≈ 600 tok (4 ch/tok) ≈ 690 tok (the repo's 3.5 ch/tok)** |
| Met (no look), 3 memories each | 745 | 812 | 667 | **2,224 ch ≈ 560-635 tok** |

- The relationship part is small. `attitude N (word)` is about 6-7 tokens a person. Each memory is about 10-12 tokens (up to 5, plus loose ends). Ties run about 15-30 tokens a person.
- The bulk is voice and wants (about 60-80 tokens each).
- The bookkeeper's NPCS PRESENT rows (`npc_x — Name (pron; role; attitude N) remembers: a / b / c`) are about 250 characters a person, so about 190-220 tokens for three. OTHER KNOWN NPCS adds about 100 characters per acquaintance, every turn.

---

## 5. The bookkeeper

### 5.1 System prompt (`Api.SYSTEM.bookkeeper`, 15336)

> "You record what changed in the game world after this turn. Use only the ids provided. Only record changes the narration actually shows. Be conservative: small attitude shifts (±5 to ±15) unless something major happened. " + RECORD_RULES + " " + PLACE_RULE + " At most one per turn. " + MEMORY_RULES

That one sentence is the whole attitude rubric. `RECORD_RULES` (15333) says nothing about attitude. On people it says:

> "npcKnownToPlayer only for people the player met face to face this turn, or whose name they heard while that person was there. ... npcFates only when the narration shows it happening to someone present: arrested, gone (left town for good), dead, or hurt (beaten badly enough to be laid up for days). memoriesSettled when this turn settles something a present person remembers (a debt paid, a grudge made up, a promise kept): their id and the memory as their remembers list words it. obligationsSettled: the id of an OPEN obligation the narration shows being met..."

`MEMORY_RULES` (15330, quoted word for word by Upgrade's `SYSTEM.memories`):

> "A memory is only something this person would still hold against the player, thank them for, or hold them to later: an insult, a threat, a lie caught, a favour, a flirt or a compliment that lands, a promise, a debt, a gift, a fight, a secret shared, what the player claimed about themselves (a name, a job, a story about why they are here), and terms agreed, with the amount and the deadline kept ('owes me $40 by Friday'). Someone who only saw something serious happen (a fight, a theft, a threat) can remember that too ('saw them hit the bartender'). Ordinary talk, questions, small talk and the mechanics of a scene are not memories, and neither is anything already on that person's remembers list. At most one memory per person per turn, written as a short plain line from that person's point of view, under twelve words, with no scene detail (good: 'flirted with me', 'told me to fuck off', 'lied about car trouble to get Dewayne outside', 'says he is a surveyor from the state'). Weight 1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help)."

### 5.2 Schema (`Api.SCHEMAS.record_changes`, 15383-15425)

People fields:

| Field | Schema | Ref |
|---|---|---|
| `attitudeChanges` | `list(obj({ npcId: STR, delta: INT }))`, **no description**; the `reason` field was dropped for the grammar limit | 15398 |
| `newMemories` | `list(obj({ npcId, text: "Under twelve words, from this person's point of view, only for something they would hold against the player or thank them for later; no scene detail.", weight: enum [1,2,3] "1 small, 2 notable, 3 serious (a threat, a betrayal, a fight, real help)" }))` | 15399 |
| `npcKnownToPlayer` | list(STR), "NPC ids the player has now met or learned the name of" | 15406 |
| `rumoursHeard` | | 15419 |
| `npcFates` | strings "npc_id: status" | 15421 |
| `memoriesSettled` | strings "npc_id: the memory as their remembers list words it" | 15422 |
| `obligationsSettled` | | 15423 |

- Grammar limit: "kept to the shape that is known to pass live: 41 properties and three enums outside the nullables" (15383-15396; `docs/notes/prompts.md:680-715`; test `tests/wave17-grammar.test.cjs:63` counts 41 properties and four enums).
- On "compiled grammar is too large" the call is retried once with `record_changes_core` (`RECORD_CORE_FIELDS` 15465-15466: attitudeChanges, newMemories, goldDelta, hpDelta, itemsGained, itemsLost, playerLocationId, npcKnownToPlayer, rumoursHeard, npcFates, memoriesSettled, obligationsSettled, journalEntry; 17255-17266).
- `recordFromWire` (15469+) turns the strings into objects.

### 5.3 Bookkeeper packet (`bookkeeperPacket`, 22027-22093, plus `ctx.bookLines` 22536)

- `NPCS PRESENT: npc_id — Name (pron; role; attitude N)[ (no name yet)] remembers: <last 3 memories raw, any weight, loose-end and fact lines included>` (22039-22043, 22073).
- `OTHER KNOWN NPCS: <npcRow with attitude>` (22074). `NAMED IN THE NARRATION (not here)` (22077). `EVERYONE ELSE IN TOWN` (no attitude, 22081).
- `ALREADY APPLIED BY THE ENGINE (do not record again): ...` includes the complication's effects (`the complication's effects: <op lines>`) and the lasting consequence (22044-22062).
- Situational lines: `SAME ASK AGAIN ... a small attitude drop (-5 to -10) ...` (22066), `KNOCKED DOWN BY THE ENGINE` (19152), `ARRESTED BY THE ENGINE` (19166), `TABLE STAKES` (21081), `CARD GAME` (21291-21292).

### 5.4 Validation of a model diff

1. `cleanDiff` applies diminishing and gift scaling (§2.3).
2. `State.apply` (source 'model') accepts only `RECORD_KEYS` (7806-7808; 10531-10535).
3. Per-field rules:

   | Field | Rule |
   |---|---|
   | `attitudeChanges` | ±25 per NPC per turn; no presence check |
   | `newMemories` | one per person per turn; `shortMemory`; first-five-words merge; no presence check |
   | `memoriesSettled` | the person must be present; protected memories are never settled |
   | `npcFates` | present only, one a turn, non-hurt fates need `rollSuccess` (10812-10827) |
   | `npcKnownToPlayer` | `metTurn` only if present |
   | `obligationsSettled` | refused for the person a failed talk/persuade/deceive/intimidate was aimed at (`failedAsk` 10525, 10880-10881) |

4. `driftReputation` runs last.
5. A failed bookkeeper is retried in the background. The late diff is applied only while that turn is still the newest (22311-22356).

---

## 6. World tick steps e, g, h

Order: `tick()` at 14036-14064, with the comment at 13140-13196. Steps: a clocks, b completions, c missed obligations (mornings), d homes, **e `plantFeelings(to.day)` (every phase)**, f events and epilogue, **g `newMorning` → weather, conditions, `driftAttitudes` (mornings)**, **h `settleAppointments`**, then `appointmentVisits` (mornings).

### 6.1 Step e: grudges and favours (13650-13778)

- **Template shape.**
  - GRUDGE (5768-5930): `{ effect: "text with {npc} {player}", kind: violence|police|gossip|money|ban, about?: [violence|theft|insult], dayOffset: [lo, hi], effects: [ops], public: bool, forTags?, notForTags? }`.
  - FAVOUR (5935-6046): the same without `kind` and `about`.
  - The validator (`tests/validate-town.cjs:1827-1879`) requires: at least 8 templates; `kind` on grudges; violence must have a `playerHp` effect; dayOffset within 2..5; 1-4 effects; nobody elderly, teen or police may hold a beating; no phone or vehicle assumed (`PLAYER_GEAR`); every in-town person can hold at least one grudge and one favour.
- **Who.** Every NPC in `st().npcs` that is `isFree` (alive, status free).
  - Skipped while they have an unfired feeling seed (`hasOpenFeeling` 13652), and while `day < lastFeelingDay + 7` (13667-13676, 13768).
  - Grudge: `attitude <= -60` and `freshMemory(n, 3)`. Favour: `>= 60` and `freshMemory(n, 2)` (13771-13772).
- **`freshMemory(n, minWeight)`** (13662-13666): the newest memory with weight ≥ min, `act !== 'own'`, and not `feelingPlanted`. `feelingPlanted` (13656-13660) is true when `m.feelingPlanted === true`, or some feeling seed of theirs has `[feelingMark(m)]` in its cause. `feelingMark(m) = "m<turn>:<slugify(text).slice(0,24)>"` (13655).
- **Choosing a template** (`plantFeeling` 13728-13762):
  1. Fit by `templateFits`. `feelingTags` adds `elderly` at age ≥70, `teenager`/`teen` under 18, and `police` from the role regex (13679-13691).
  2. Grudges only: `about = memoryKind(memory)`. A template with `about` must include it (13735-13736).
  3. Prefer templates this NPC has not used (by index; 13733, 13738-13739).
  4. Grudges only: prefer templates whose `grudgeKind` is in `GRUDGE_FOR[about]` (13741-13743).
  5. `Rng.pick`. Trigger day = `day + Rng.int(lo, hi)`, clamped to 1..30, default [2,5] (13746-13753).
  6. The seed is `{ id: seed_<kind>_<slug>, cause: "Grudge [mark]: <Name> (attitude N) remembers "<text>"", effect: filled, trigger: day, hidden, origin: { kind, npcId, template: i } }`.
  - **Rng draws** (pick and int) shift every later seeded number.
- **"Answers in kind."**
  - `memoryKind(m)` (13703-13712): `act` first (`ACT_KIND = { attack: violence, steal: theft, talk|persuade|deceive|intimidate: insult }`; `own` → null). Otherwise regex on the text, insult words first, then violence, then theft.
  - `grudgeKind(t)` (13715-13723): `t.kind`, else inferred from effects (playerHp → violence; Marcus, fac_police or playerGold → police; banFrom → ban; playerPrice or takeItem → money; else gossip).
  - `GRUDGE_FOR = { violence: [violence, police], theft: [police, gossip, money], insult: [gossip, ban, money] }` (13714).
- **`act: 'own'`** (9089-9093) marks what the NPC did to the player (the enemy's beating, the repo seizure, the chief's cell). `freshMemory` and `memoryKind` skip it, so no grudge grows from it. It still counts for drift's `heldHard`.
- **Firing** (`fire` 14194-14240):
  - If the NPC is not free, the seed is a no-op.
  - Effects: the seed's own `effects` (copied in by Upgrade 8), else `GRUDGE/FAVOUR_TEMPLATES[origin.template].effects`, filled with `{npc}`, `{npcId}`, `{playerName}`.
  - A due event (`dueAdd`). If public, town news with `eventId`, told once.
  - A grudge adds `+10` (14232-14233).
- **Template order is load-bearing:** "a seed keeps its template by index" (5917). Append only.

### 6.2 Step g: drift

See §2.8. The rationale is in `docs/notes/engine-world.md:171-178`: "Deliberately toward the town's own number rather than flat 0". The playtest R5 fix is at engine-world.md:450-452.

### 6.3 Step h: appointments (wave 22; 14066-14147)

- A seed with `appointment = { npcId, locationId, day, phase, phases, spot?, hour? }`, built by `State.appointmentOf` from a bookkeeper `newSeeds` entry (10778-10788).
- Settling (14120-14147):
  - The person can't keep it (arrested, gone, dead, laid up) → dropped silently.
  - The player is there as a covered phase ends → fires (kept).
  - Otherwise missed: `seedsDropped`, `addMemory` w1 "waited for <p> at <place> and they never came", `attitudeDelta -3`, and a tick notice.
- A kept meeting moves no feeling; "a warm memory is the bookkeeper's" (`docs/notes/engine-world.md` wave 22).

---

## 7. Save compatibility

- **Versioning.** `meta.rulesVersion`; a save without it reads as 1 (`rulesVersion` 11510-11518). `State.RULES_VERSION = 8` (7774-7798, with a one-line history per version).
- **Migrations.** `Upgrade.MIGRATIONS` (18158-18166) lists versions 2 to 8, all `rerun: true`: 2 Memories that matter, 3 Places, 4 Clock, 5 People match, 6 A full cast, 7 A lived-in town, 8 An arc.
  - `Pipeline.updateGame` runs the steps as one batch and one `/undo` step. Each step is stamped as it completes. A save from a newer build is never updated (17516-17519, 17536-17546).
  - The UI shows "Update this game" and Settings → Re-read (README "Updating an older game", `README.md:1098-1171`).
  - When the rules change: bump RULES_VERSION, add a MIGRATIONS entry, add a README table row, and add a paragraph to the Upgrade header comment (17420-17519).
- **Three patterns past waves used to add per-NPC data to old saves:**
  1. **Load-time fill, no version bump** (`State.load` 11865-11916: "Fill fields older saves may lack (no-ops for current saves)"). Example: `fillPronouns(s, townData)` (8877, 11901); invalid ages and histories dropped (11885-11889); array defaults (11877-11892).
  2. **A migration step built on an engine-only op that fills from the town data and never overwrites.** Examples:
     - `addCast` (10213-10265): relations and home for people who lack them; also updates the save's town copy.
     - `livedIn` (10266-10330): PERSON_FIELDS age, presence, history, where, reach, died, buried; and written relations.
     - `arcFill` (11290-11360): fills the town copy's calendar, events and epilogue only if missing. It *does* overwrite clock `onComplete` and unfired seeds' requires and alt.
     - The ops are listed in `ENGINE_KEYS` (7809-7813), so the model can never send them.
  3. **Read-time fallback to the live `TOWN_DATA` by id** when `meta.townName === TOWN_DATA.name`, with no migration. Examples: `cardPeople` (19527-19532: "A game saved before wave 13 has the cast without the tag"); `State.castTown()` / `inCast` (10201-10212).
- **Defensive reads everywhere:** `(n.memories || [])`, `toInt(n.attitude) || 0`, `Array.isArray(n.relations)`.
- **Shape checks.**
  - `shapeProblem`/`typeProblem` (11700-11805) check `attitude` (number-like), `memories` (list of `{text, weight number-like}`), `relations` (a list with `npcId`), and `hurtUntilDay`.
  - `coerceNumbers` (11808-11822) converts `attitude` and `memories[].weight` written as text.
  - A new numeric field needs both.
  - The town copy is checked too (`townTypeProblem` 11826+).
- **The town copy.**
  - `State.newGame` keeps `town = deepCopy(townData)` (11627).
  - The save envelope is `{ kind: 'novatria-save', saveVersion: 1, name, savedAt, summary, state, town }` (23459, 23610). Load restores `town = deepCopy(townData || TOWN_DATA)` (11909). An import without a town gets TOWN_DATA (23641).
- **What TOWN_DATA changes reach in an existing save:**

  | Kind of change | Reaches an old save? |
  |---|---|
  | `state.npcs` (attitude, relations, tags...) | No; frozen at creation (fills only via migrations) |
  | Drift baseline | Reads `State.town` (14004), so **a new starting attitude in TOWN_DATA does not move an old save's drift target** |
  | Town events and epilogue (Royce/Loretta thresholds) | Read from `State.town.events` (13818-13826); **a changed branch does not reach an old save** unless a migration replaces it (arcFill adds only if missing) |
  | `GRUDGE_TEMPLATES`, `FAVOUR_TEMPLATES`, `LOOSE_ENDS`, `TABLES.complications` | Global code constants: **reach old saves immediately**. Unfired feeling seeds resolve effects by template index at fire time, unless Upgrade 8 copied effects onto the seed (18127-18134) |
  | Cast block, cards | `castTown()` returns live TOWN_DATA for the built-in town (cast checks, cards) |

  README: "A game already in progress keeps the town it started with." (`README.md:1303`).
- **Content checks** (`node tests/validate-town.cjs`, run first by `tests/run.cjs`; it also runs `tests/mentions.cjs`):

  | Rule | Ref (`tests/validate-town.cjs`) |
  |---|---|
  | NPC key whitelist | 1191 |
  | attitude -20..20 | 1265 |
  | `memories` must be `[]` | 1266 |
  | `knownToPlayer` false | 1267 |
  | Relations both sides with inverse words and gendered pronouns, family age maths | 1295-1345 |
  | OPS list mirrors `State.EFFECT_OPS` (`tests/state.test.cjs:980` keeps them equal) | 607-640 |
  | attitudeDelta \|delta\| ≤ 50 | 807-809 |
  | Event `when` keys whitelist `['flagsSet','flagsUnset','clockAtLeast','npcFree','attitudeAtLeast','obligationStatus','playerAt']`; **no attitudeBelow** | 743 |
  | attitudeAtLeast values must be NPC ids, -100..100 | 760-765 |
  | Template rules | 1827-1879 |
  | Example-turn shape: the casual "two people present" check splits PRESENT on `)); `, which depends on `attitude N (word))` closing each person | 1946 |
  | The literary mechanic example must match `/^Mechanic: .*attitude [−-]?\d+\.$/` | 1919 |

  `tests/mentions.cjs` fails on any capitalised name or "the <place>" in content strings with no record (header 1-23). New template or memory text must name real cast members.
  After cast changes, `node tests/cast-doc.cjs` must be rerun (`--check` runs in the content suite).

---

## 8. UI

- **People card** (`personCard` 25047-25088).
  - Head: monogram, name, `· age`, pronouns. Role line `Role · relationNote · status`. Meta: `attitudeMeter(word)` (5 segments + word; `data-att`, `data-level`) and "Here now" / "Last seen: <place>, Day N · Phase". Flags: Hurt until, away today, "Banned you from X until Day N", "Meeting you: ...".
  - Open body: look; facts (Home or Lives, Reach, Buried, `Ties: wife Mavis Mangum; boss Royce Pittman`, History); Notes. Notes are "Told you: <rumour>", "Remembers: <plainMemory: player name → "you">, Day N" (pickMemories w3:4, w2:3, w1:1, recent:10, cap:8, no loose ends), known threads, and the loose end (`personNotes` 24976-24997).
  - Never shows goal, secret, faction or seeds (26243-26250). Absent or heard-of people show no meter.
- **CSS** (69-80 dark, 115-118 light): `--att-cold #8eaac0`, `--att-cool #9aa6ac`, `--att-mild #c99c76`, `--att-warm #e09a68`. `.att[data-level=1..5]` maps 1 cold, 2 cool, 3 muted (default `--tone`), 4 mild, 5 warm. Hostile and loyal words are bold (800-809).
- **Edit form** (`editForm` 25133-25195, `editBase` 25121-25132, `editChanges` 25214-25231).
  - Feeling fields: **"Attitude to you"**, a range -100..100 step 1 with output `+5 · neutral` (25149-25152, 25176). **Memories**: each a textarea (400) with a weight select "1 small / 2 notable / 3 serious" and Remove; "Add a memory" (new: this turn, weight 2; disabled at 12). **Related to** (select) + **Relation** text (writes `created` only). Status radio. The hidden fold "Hidden from you: goal and secret".
  - Save sends one `editPerson` and the quiet line "Edited <Name>: attitude, memories." (29244).
  - **`editBase` keeps only `{turn, text, weight, model}`, so editing the memory list strips every memory's `day` and `act`** (25129, 25227).
- **Quiet feed lines** (`App.noteBands` 28973-28991, registered on `State.onChange` 28995-29000):
  - It compares the levels of known, alive people at turn start and end. A turn is one batch, so only the net change across the parse, bookkeeper and tick counts.
  - New level higher → "`<Name> warms to you.`". Lower and now ≤2 (wary or cold) → "`<Name> won't forget that.`". Lower and now ≥3 → "`<Name> cools toward you.`".
  - Loads, undos and edits only take note. Moves within level 1 (hostile↔cold) or level 5 (warm↔loyal) give no line.
- **Character tab Standing** (26198-26227): `h3 Standing` with one row per key of `player.reputation` (`li[data-faction]`: faction name or "Town", `rep-tier` = capitalised tier). The `Reputation` kv row appears only if there is no `town` key.
- **/recap** (`recapText` 23333-23380):

  ```
  Day N (date), phase, at <place>.
  [The story has reached an ending; you can keep playing.]
  Here: ...
  Open: ...
  Owed: ...
  Warm to you: <Name> (<word>[, <reason>]), ...   (attitude > 5, top 3)
  Cold to you: ...                                (attitude < -5, top 3)
  Heard: ...
  In town: ...
  ```

  The reason is "your loose end: <label>" or the newest w≥2 memory whose regex sense fits the side, retold as "remembers you called him a liar" (23256-23319).
- **Other.** Map pins list met people (`hasMet`). The debug tab shows raw attitude, memories with weights, faction relations and reputation (26390-26430).

---

## 9. Tests that assert on attitude, memories, reputation or grudges

A broad scan of `tests/*.cjs` (each `test(...)` body checked for attitude, memor, reputation, grudge, favour, relations or the band words) matches 170 test bodies in 35 files (the scan: every `test(` body in `tests/*.cjs` searched for those words). Grouped here, most load-bearing first; the memory-only matches are incidental.

- **acceptance.test.cjs** L198 `[4] Insulting the same NPC three times → attitude drops, their greeting turns cold, and a grudge seed is planted once attitude reaches −60.` Pins -15 per insult, merged weights `[2,3]`, "gives you a cold look", one grudge in day+2..+6, "turns away and will not look at you". (SPEC.md:391.)
- **state.test.cjs** (15):
  - L117 `Dice applies item, attitude and condition modifiers from state`
  - L152 `State.apply rejects unknown ids and leaves state untouched`
  - L183 `attitude changes are clamped to ±25 per turn and to ±100 overall`
  - L322 `effect ops from the build plan all work through State.apply`
  - L592 `town data passes validation and every content constant has the contract shape`
  - L678 `character creation turns every loose end into an NPC, a memory, a thread and a hidden seed`
  - L980 `effect ops, reserved flags and social actions each live in one list ...`
  - L1029 `memories: the model gets one per person per turn (heavier replaces lighter), text is short, trivial ones fade and serious ones survive the cap`
  - L1207 `pronouns ...`; L1257 `peopleRevealed ...`
  - L1545 `editPerson: the player edits anything about anyone (... attitude, relation, home, status, memories) ...`
  - L1631 `editPerson refuses bad values ...`
  - L1784 `the cast's ties: tiesOf reads both sides ...`
  - L1915 `the version 6 ops are the engine's ...`
- **world.test.cjs**:
  - L312 `three insults turn an NPC cold; at -60 with a weight-3 memory they plant exactly one grudge seed, which fires on its day`
  - L367 `a favour seed at attitude 60 or more, once the NPC remembers something the player did; not at 59, not unearned`
  - L531 `news spreads ...`
  - L581 `the narrator packet never carries secrets, goals, ... and keeps to the SPEC section 13 limits`
  - L699 `a 30-turn scripted run: ... insults plant a grudge ...`
- **engine-world-fixes.test.cjs**:
  - L595 `grudges: one per weight-3 memory, a template that fits the person, its effects and public news when it fires, +10 got even, then a 7-day cooldown`
  - L652 `attitudes drift two a day back toward the town's own, except for someone with a fresh weight-3 memory or an open loose end ...`
  - L688 `knockDown: a weight-3 memory ...`
  - L416 seeds; L724 fillEffects; L300 people
- **engine-state-fixes.test.cjs**:
  - L466 `metTurn only for people present, and a faction member's first meeting moves their attitude by reputation / 5 once; memoriesSettled drops a memory; model memories merge`
  - L844 `... reputation -20 reads "disliked" ...`
  - L25 new effect ops; L148 obligations; L256 loose-end obligation; L415 npcFates; L578 bed/host
- **pipeline.test.cjs**:
  - L574 `the packet carries only relevant memories and one fresh rumour ...`
  - L633 `insults lower attitude, leave a memory and turn the greeting cold; persuasion warms on a success`
  - L1453 `... the parser sees attitudes`
  - L1894 People editor
  - L241 defeat; L455 /fact; L2061 WHAT PEOPLE KNOW; L146 the cast
- **prompts-fixes.test.cjs**:
  - L96 `the narrator knows the story: ... an attitude word ... a secret only through revealSecretFor` (asserts `attitude N (word)` in PRESENT)
  - L331 parser packet and rubric (asserts the exact DIFFICULTY sentence with "attitude -25 or below", L380)
  - L383 `record_changes: ... 41 properties ...` (asserts attitudeChanges keys `['npcId','delta']`, L412)
  - L419 bookkeeper packet, last memories
  - L444 mock bookkeeper (pins `{delta:-15}`, `'called me a liar|2'`, L505)
  - L541 rumours spread
- **transport-fixes.test.cjs**:
  - L574 `/recap: ... who is warm or cold and why ...`
  - L610 `feed lines when an attitude crosses a band, both ways`
  - L678 `a successful social roll aimed at someone, or their attitude at 50 or more, lets the narrator hear their secret`
  - L700 card game; L762 and L805 Upgrade (v8 grudge template effects); L473 defeat
- **ui-fixes.test.cjs**:
  - L381 `a known person whose attitude crosses a band after a turn gets a quiet line (warms, won't forget); an edit does not`
  - L592 `Character: a standing row per faction ...`
  - L1024 sort chip focus; L1866 read-only edit; L3140 feed order incl. "won't forget that"
- **shell.test.cjs**:
  - L718 `People: cards for the people met, with monogram, name, role and attitude ...`
  - L789 card notes; L647 text rendering
- **content.test.cjs**:
  - L484 `the council meeting ... turns on ... Royce's regard for the player ...` (asserts some `attitudeAtLeast.npc_royce >= 25` (L492) and an ending reading attitudes (L507); helper sets Royce via attitudeDelta, L572-579)
  - L409 `grudges and favours do something ...`
  - L75, L128, L317 relations/mentions; L168 loose ends; L539 goods
- **integration.test.cjs**:
  - L324 `wave 2: playerAt: the council meeting with the player in the room and Royce warm to them ...`
  - L176, L222, L393, L527 (memories)
- **wave2-fixes**:
  - L28 `bug 1: ... the same ask that worked earns less each time (Dice.diminishing)`
  - L781 `gifts: a second gift to the same person the same day earns no warmth`
  - L752 recap; L421 memoriesSettled protection; L113 missed debt memory; L878 caught cheating (colder); L713 save types
- **wave3-fixes**:
  - L813 `design: a grudge answers in kind ...`
  - L733 `the owner of a place who likes the player (25 or more) gives a bed there ...`
  - L752 recap dealt-with; L233 recap grammar; L381 merge moves gifts/relations; L422 gift handed over; L101 late memory; L776 arrest memory
- **wave4-fixes**:
  - L493 `R5: every memory made now carries its day, and attitudes drift back once no serious memory is newer than five days ...`
  - L529 `R6: a grudge for violence answers with violence or the police ...`
  - L34 Say purchase not a gift; L298 owner's bed; L126 public grudge told once; L222/L240 memory text
- **wave5-fixes**:
  - L449 `Q3: a grudge reads the kind of turn its memory was made in ...`
  - L76 `Q2: a gift in Say mode ... earns no warmth`
  - L563 friend's bed; L618 recap "tried to steal"; L700 enemy follow-up; L346 public grudge news; L217 rewrite keeps day; L232 recap; L298 rough nights; L632, L654
- **wave6-fixes**:
  - L547 `R3: what someone did to the player (act "own" ...) grows no grudge ...`
  - L570 `a grudge for an assault reports the assault ...`
  - L121 / L133 Say gifts; L146 seizure; L382, L472, L525
- **Cards**:
  - wave10 L330 (fumble caught: colder), L396
  - wave11 L338, L587 (`nor while he is colder than -10`)
  - wave12 L192 (`colder than -10`)
  - wave13 L221 (`$10 or more does`), L404, L635
  - wave14 L271 `#3 a $1 hand moves nobody ..., a seat that takes $10 or more ... likes them 1 more, a $20 loss ... costs a seat 2, and only the first such change a day counts`
  - wave18 L431 (`a fumble costs 5 of his warmth ... cold he refuses without a roll`)
  - wave19 L144, L199 (warmth kept); wave20 L201
- **wave22-appointments**: L192 `missed: ... the person remembers waiting (weight 1) and is 3 colder, and a quiet line says so`; L28, L227, L248.
- **wave17-grammar**: L63 `the schema: 41 properties and four enums ...`; L82, L107, L131.
- **upgrade.test.cjs** (15, mostly memories): L140 memory rewrite (protected lines untouched); L334 chunking; L361 real provider (memory rules word for word); L920 / L1003 merge keeps memories; L553 v1→8 chain.
- **playtest.test.cjs**:
  - L74 30+ turn scripted playtest (every system, no rejected diffs)
  - L356 `pacing report: ... insult-to-grudge timing in play`
  - The cost band (478-480) and packet sizes (482-483) fail if PRESENT balloons.
- **api.test.cjs**: L463 cast block; cached blocks under 13,000 estimated tokens (L171-174).
- Also memory-incidental: map L146, mobile L54, wave16 L120 / L418 (/rewind strips later memories), wave21 L106 (/fact).
- **Validators** (not test files but run first): `tests/validate-town.cjs` and `tests/mentions.cjs`, rules in §7.

---

## 10. Docs conventions the plan must fit

- **README.md** (authoritative, player-facing, about 1,430 lines).
  - Second person, present tense, concrete numbers inline, and the game's exact lines quoted in double quotes. For example: "When someone you know crosses a line in how they feel about you, a quiet line says so after the turn: "Loretta Gaddis warms to you.", "... cools toward you." or "... won't forget that."" (`README.md:357-359`). Grudges are in `README.md:643-660`: "Someone who comes to hate you (attitude -60 or below, with a serious memory of what you did) acts on it a few days later...".
  - Paragraphs open with a bold lead phrase: **Grudges and favours.**, **Asking again.**, **What one turn can do.**
  - Mechanics name real cast members and places as examples (Loretta's couch, Curtis Pruett, the Low Water).
  - Sections: How to play, Do and Say, People (311), Journal, Character (430), Time, The story moves (514), Settings, Commands (a table: `| /cmd | What it does | Model |`), Saves, **Updating an older game (1098; a table: `| Rules version | Step | What it does to an older game | Calls |`)**, What a turn costs (1173; token tables), Editing the town (1234; lists the fields that make the town move and the validator rules in prose), Running the tests (1305), Deliberate deviations from SPEC.md (1342).
  - A rules change adds a README row and bullet with the date.
- **docs/notes/<module>.md wave entries.**
  - Heading `## Wave N (D Mon YYYY): <short plain title>`, e.g. `## Wave 22 (1 Nov 2026): meetings are kept`. Earlier waves are just `## Wave N`, with `## Integration (wave N)` sections after merges.
  - Body: one paragraph of why (often the owner's own words or the QA/playtest item id, e.g. "playtest R5", "QA #3"), cross-links to the sibling module's notes, and `Tests: tests/<file>.test.cjs`.
  - Then bullets with **bold lead phrases** that name the exact functions, constants, fields and quoted strings (`seedsDropped: [seedId]`, `appointmentWords(seed)`), what changed for old saves, and `/undo` and `/rewind` behaviour.
  - Wave 1 files have fixed sections: What changed, What the player sees, Needs from others, Tests, README / BUILD_PLAN text to fold in, Not done, and why.
- **docs/BUILD_PLAN.md.**
  - "Shared data contract": TOWN_DATA as an annotated JS block (56-178), with the NPC shape at 74-91.
  - The effect ops table (`| op | fields | result |`, 141-171; e.g. `| \`attitudeDelta\` | \`npcId\`, \`delta\` | clamped to -100..100 |`, and `addMemory` with `act?` explained). Then "`State.EFFECT_OPS` is the list (28 ...)".
  - "Game state" additions as a JS block (239-260). "Module responsibilities" table (307-323).
  - "Direction changes (owner, 28 Oct)" (447+): numbered bold entries `N. **Title** (owner, date: "quote")` with a paragraph each. Entry 10 carries `- **Wave N** (date). The owner: "..."` sub-bullets that summarise each wave and point to notes and tests (e.g. 1560-1603).
  - A new rules version, op or field is expected to appear in the contract block, the ops table, the module table if a module's job changes, and a direction-change sub-bullet.

---

## 11. Known pain points and gaps (documented, and found in the code)

**Documented history around the single number:**

- **Gifts and money bought feelings** ("playtest: money bought feelings, +5 a gift all day", 18987). This took three waves to settle: "the final design, after three waves that each over-corrected" (19000-19018).
- **Repeat asks** became diminishing returns rather than a lock, because a lock "would also refuse a second, different favour from the same person" (`docs/notes/engine-world.md:38-46`).
- **Drift never worked for active players** until wave 4 (R5: "nobody drifted", engine-world.md:450-452). Drift targets the town's number "or the cast's written first impressions ... would be gone in a week" (171-178).
- **Grudges answered with the wrong kind** (R6, Q3). `act` was added to memories (wave 5) and `'own'` (wave 6, R3) because a single attitude plus free text could not tell a beating from an insult (engine-world.md:453-456; content.md:639-703).
- **SPEC's polish milestone** already says "tune difficulty and attitude swings" (SPEC.md:384).
- No doc explicitly asks for a richer model. The complaints are all about mis-attributed or mis-scaled single-number changes.

**Structural limits a richer design will meet:**

1. **One scalar gates more than 20 unrelated behaviours**, with thresholds scattered across Dice, State, World, Pipeline, Api, content and the mock (§3). There is no shared table: `SEAT_COLD`, `DEALER_COLD` and `STAKES_COLD` are local constants, while 25 and 50 are literals at 9833, 22129 and 19117.
2. **No NPC↔NPC opinion.** Relation labels are static. Faction relations are written by clocks but never read by gameplay (§1.5). Third-party effects in templates are hand-listed ids (Marcus, Nikki, Travis; Wade, Colt, Trent; Ray, Nadine), not derived from relations.
3. **Reputation counts only bookkeeper deltas of known people** (÷5, ±5 a turn). Engine changes never move it. The narrator sees only the town tier. Faction standing acts only once per NPC (meetingRep), and that shift is itself an attitude change.
4. **Drift is symmetric and erases earned warmth.** Only a weight-3 memory from the last 5 days, or an open loose end, holds it, so weight-2 kindnesses fade at 2 a day. The baseline comes from the save's town copy.
5. **Memories have weight but no valence or target.** The recap guesses valence with the `MEMORY_BAD`/`MEMORY_GOOD` regexes (23273-23279). The grudge kind relies on `act` or a regex. `feelingPlanted` has no writer.
6. **The bookkeeper may change anyone's attitude and add memories for absent people** (no presence check on `attitudeChanges`/`newMemories`; 10588, 10602). Its only attitude guidance is "±5 to ±15", and the `reason` field was dropped for the grammar limit (15393).
7. **Grammar budget.** `record_changes` is at 41 properties, "the shape known to pass" (15383-15396). Any new person field risks a 400; the core fallback must keep the essentials. README:1168-1170 and 1382 still say 45 properties against a limit of 46, which is stale.
8. **Cached-block budget.** About 330 estimated tokens of headroom under the api test's 13,000. Feelings that change per turn must stay out of `castBlock` anyway, or the 1-hour cache is broken every turn. The PRESENT format is copied in the cached example turns (6145-6188), and the validator parses `))` and `attitude N` there.
9. **Save drift.** Events and epilogue thresholds and drift baselines live in each save's town copy. Template effects are resolved by index from code at fire time, so templates can only be appended. `plantFeeling` draws from the seeded `Rng`, so changing feeling logic shifts seeded tests.
10. **Possible bugs and inconsistencies to verify:**

    | Issue | Ref | Effect |
    |---|---|---|
    | The People editor drops `day` and `act` from every memory when the list is edited | 25129, 25227 | drift's `heldHard` and the grudge kind regress to the log or regex fallback |
    | The defeat "captured" memory is weight 3 with no `act: 'own'` | 22143 | it can seed a grudge against the player for what the NPC did, against the wave 6 R3 rule |
    | `/fact` memories are weight 3 | 22728 | they block drift and can fuel a grudge or favour |
    | `attitudeChanges` is capped at ±25 a turn but `meetingRep` and engine ops are uncapped | | |
    | Band lines compare only turn start and end, and skip hostile and loyal | 28977-28990 | |
    | `ctx.reputation` is computed and unused | 22305 | |

11. **Docs that disagree with the code:**

    | Doc | Says | Code |
    |---|---|---|
    | `docs/notes/transport.md:181` | band lines at "−60, −25, 25 or 60" | levels cut at -25/-5/5/25 |
    | SPEC.md:371, the 21623 comment, the 24977 comment | memories "from the last 20 turns" | `recent: 10` |
    | `docs/notes/content.md:205` | Royce "at least 40" | 30 (content.md:458 is right) |
    | README "What one turn can do" (982-991) | omits the ±25 attitude cap | |
    | README:1168-1170 and 1382 | the property count (45, against a limit of 46) | 41 |

The token and character counts in §4.5 and §4.4 were measured by loading `index.html` headless with the test harness (`tests/helpers.cjs`, `quickStart` with seed 12345) and calling `Pipeline.npcLine`, `Style.systemPrompt()`, `Pipeline.townBlock()` and `Pipeline.castBlock()` through `page.evaluate`, the way `tests/api.test.cjs` does.
