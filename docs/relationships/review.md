# Red-team review: "People who remember"

Reviewed 1 Nov 2026 against `design.md`, `audit.md`, SPEC.md §1, §3, §8 and §10, README "People" and "The story moves", and docs/CAST.md. I spot-checked the code at `index.html` and the tests where a claim depended on them. Section references are to design.md (§) or audit.md (audit §).

The core idea is right. It has three parts: (1) events become typed memories, (2) the tracks are computed from those memories, and (3) the narrator gets a stance plus its reasons. Splitting trust from liking is the single most valuable change. It also fixes pain the audit documents: valence guessed by regex, grudge kinds guessed from words, one number gating 20 behaviours. What follows is what breaks.

---

## Ranked index

| # | Sev | Area | Finding |
|---|---|---|---|
| 1 | **blocker** | A | Hidden-tie reasons go to the narrator with their cause, which bypasses the secret gate. The card's clue also gives the wrong day. |
| 2 | **blocker** | I | The minor guard is not airtight in A or B. It runs after narration and depends on the bookkeeper choosing `flirted`. It keys on 3 ids the editor can age past. In A it relies on a graph that A does not have. Fear compliance works on teenagers. |
| 3 | **blocker** | C/G | Violence is double-counted. Each attack turn's `hit` compounds (×1.5, ×2.25) and then `beat_down` lands on top. Worked example 4 ignores this. Wade, the Night Run's boss, ends up "afraid of you" and reports to the police. |
| 4 | **blocker** | H | The People editor rewrites every memory as `{turn,text,weight,model}`. Under recompute-from-memories, one edit wipes that person's tracks. |
| 5 | serious | B | Self-report exploits (`kept_word`, `came_clean`, `exposed`, `rescued`, `defended`) and an apology that locks a harm so it can never grow a grudge. |
| 6 | serious | G | The everyday bucket is unbounded and the trust cap stops binding by day 3. Beer makes regulars "loyal to you" by day 6 to 10. `noted` facts are the first memories evicted. |
| 7 | serious | G | Fear: the override hides both hatred and friendship. HARD people become "afraid". The report seed has no sane protector for faction heads. The rival rule warms the police chief to a brawler. |
| 8 | serious | H/G | Delivery by schedule co-location is brittle. Marcus is never at Town Hall, so example 5's department never hears. `household()` treats the motel and the trailer park as one house. |
| 9 | serious | C | LLM classification: "as they took it" counts traits twice, the claimed guard is circular, the string format collides with its sibling fields, and spelling and tense drift. |
| 10 | serious | H | Feasibility gaps: about 40 `attitudeDelta` sites with no event type, one shared Rng stream, `/rewind`, the migration typing, the example turns, the validator regexes, about 100 pinned tests (not 30). |
| 11 | serious | A | Cues that promise future acts ("will tell someone after", "means to square it") invite the narrator to pre-empt seeds: invented facts and double payouts. |
| 12 | serious | F | Soft-lock: "won't sell to you" has no expiry, and harm floors keep it all game (motel, gas, pawn). |
| 13 | serious | E | About 650 tunable numbers and phrases. That cannot be tuned by playtest without a headless simulator. |
| 14 | serious | F | Legibility: the card's 2×2 word grid is a stat sheet, bands flicker without hysteresis, the feed cap drops the overnight lines B depends on, and some feed phrases are wrong. |
| 15 | serious | G | Settling: getting even plus "first settlement locks" means a fired grudge can never be softened afterwards. |
| 16 | minor | various | Knob dedupe is unspecified, arithmetic slips in the worked examples, reputation values per event are missing, secondhand text generation is unspecified, the cap drop order is unspecified. |
| 17 | minor | D | The bookkeeper prompt is not cached today, but the cost is trivial. The real budget is the narrator's cached block. |
| 18 | minor | J | Respect, ties that never change, `/fact`, and household behaviour: gaps worth one decision each. |

---

## 1. Hidden-tie reasons leak the affair through the narrator (blocker; A, F)

**Evidence.**
- §5.2 says the narrator gets the cause of a hidden-tie reason, marked "won't say so".
- §6.4 #9 sends `Loretta Gaddis ... sore that you shamed Royce Pittman at the counter (Day 4; never says so)`.
- §6.4 #4 sends `Tammy Lott ... glad you put Colt Purvis down (Day 7; won't say so)`.
- §8 says "Reasons from someone's secret reach the narrator only when the secret itself would". The affair *is* Loretta's secret, and Tammy's hatred of Colt *is* the pills thread. The design contradicts itself.
- Today the secret gate (attitude 50, or a successful roll aimed at them; audit §3, `secretsFor` 19107-19119) exists precisely so the narrator cannot leak what it does not know. Under this design the narrator learns "Loretta cares deeply about Royce" on every turn she is present, with no gate.
- "Won't say so" stops dialogue, not narration: "Her eyes go to the door Royce left by." A player who asks "Is this about Royce?" puts a Sonnet narrator in exactly the position where it confirms.

**Also wrong:** the card's dated clue gives the *delivery* day, not the act's day. Example 9 shames Royce on Day 4 (Sunday), and the card says "Cooler since Day 5". §5.2 then says "a player who remembers what they did on Day 5 works out the clue". They did nothing on Day 5, so the clue points away from the answer.

**Rule 6 is not broken:** the coolness traces to state. The problem is rule 1 and the hidden-field rule via the narrator, and legibility.

**Fix (required).**
- Until the tie is `known` or the person's secret gate opens, a hidden-tie reason reaches the narrator with **no cause and no name**: `toward you: friendly — cooler since Day 4, for a reason of her own (keeps it to herself; never hint at it) — plays it: ...`.
- The card dates the source act: "Cooler since Day 4. Hasn't said why."
- **Owner decision:** whether the card may name the act without the tie ("Cooler since you shamed Royce at the counter, Day 4"). That is a real, earned clue: a bartender caring about a regular is not the affair. Recommended.

## 2. The minor guard is not airtight in A or B (blocker; I)

**Who.** Kaylee 16, Micah 17 and Austin 15 (CAST.md). Tyler is 19. No minor is TIMID: Kaylee is bored/sharp (SUSPICIOUS), Micah earnest/restless (OPEN), Austin watchful/angry (SUSPICIOUS, GRUDGING). The six TIMID traits belong to adults: Royce, Jolene, Travis, Lamar, June, Brianna.

**Holes.**
1. **The guard runs after the narrator.** §3.1: "code decides whether a flirt was welcome" and the bookkeeper reports `flirted`. But by the time the bookkeeper runs, the narrator has already played Kaylee's reaction to the player's flirt with no instruction at all. Today there is no age-aware romance rule anywhere in the narrator prompt: a grep for flirt/romance/minor in `index.html` finds only `MEMORY_RULES` ("a flirt or a compliment that lands", 15330) and the charm help text (28134). "The narrator is never sent a flirting cue for anyone under 18" is a negative guard. What is missing is the positive guard: tell the narrator how a minor reacts.
2. **The guard depends on the classifier.** If the narration shows Kaylee laughing it off, a "how they took it" bookkeeper writes `complimented` (+3 liking). The guard never fires, and repeated flirting *warms* a 16-year-old.
3. **It keys on three ids.** The People editor lets the player change age (README "Editing people"), so a code check on live age is defeatable by `/edit Kaylee`, and a hand list breaks when content changes.
4. **Tier A has no graph,** yet the parent consequence ("through the graph") is the main deterrent. In A, a flirt with a minor costs only W -6, T -10 and reputation -5.
5. **Fear works on minors.** §6.2: at fear 40 or more, someone "hands over what they have, or does a small thing, with no roll". Two successful threats put Kaylee at the register over 40 (25, fading to about 20, plus 37 compounded). She empties the till with no roll. The graph cost to Royce is about W -6 and T -6 (factor 0.8 × 0.85 × 1.25 teen × 0.75 heard ≈ 0.64; fear does not carry for words). That is a mechanical reward for terrorising a 16-year-old.

**Fix (required).**
- **A parser flag.** Add a `romantic` intent to `parse_action`. The parser schema has 13 properties and is nowhere near the grammar limit.
- **Code decides before narration.** With the flag set and a target that is a minor, code sends the narrator a per-turn line: `<Name> is 16: any romantic or sexual advance is unwelcome and alarming; she is uncomfortable, gets away or gets her father; never warm, never flirtatious`.
- **The bookkeeper is overridden.** The event is forced to unwanted whatever it emits.
- **Parents are notified without the graph.** Parents and grandparents get `crossed` through the relation labels, which exist in A.
- **Who counts as a minor:** cast age under 18 in `TOWN_DATA` **or** current age under 18, whichever is stricter. The editor cannot unlock it.
- **No fear rewards from minors.** Minors are excluded from no-roll compliance and from the fear branch of secrets.
- **Certain consequences.** A threat or violence aimed at a minor always plants a report to a parent and to Chief Bell, plus a town reputation hit.
- **Tests for all of it in A,** not just "nobody under 18 is eligible" in C.

## 3. Violence is counted two or three times (blocker; C, G)

**Evidence.**
- README "Fights": three hits over successive attack turns put someone down. Each attack turn's narration shows a hit, so the bookkeeper emits `hit` each time.
- §3.2: harm repeated within 3 days compounds ×1.5, then ×2.25.
- §3.1: the duplicate rule drops "the bookkeeper's copy of the same event", but `hit` is not the same word as `beat_down`.
- Worked example 4 counts only `beat_down` (Colt ends at W -30). By the design's own tables:

**Wade, Day 2 evening at the Low Water** (start W -10, T -10; ruthless gives HARD, fear ×0.5):

| Turn | Event | W | T | F |
|---|---|---|---|---|
| 1 | `hit` | -25 | -10 | +10 |
| 2 | `hit` ×1.5 | -37.5 | -15 | +15 |
| 3 | `beat_down` (model `hit` dropped, no compounding) | -35 | -15 | +17.5 |
| | **Total** | **-100 (clamped)** | **-50** | **42.5** |

- With fear at 40 or more and liking under 25, the stance is **"afraid of you"**.
- §6.2 then limits his grudge to "police or gossip (they won't face you)". The grudge is planted at the next phase tick while fear is still above 40, which locks in that kind.
- The report seed sends him to his "boss, faction head or the police". He *is* the faction head, so it sends him to Chief Bell.
- The boss of the smuggling ring, beaten in a bar, goes to the police. If the model's third `hit` is not dropped, the numbers are worse.

The same applies to the existing engine witness memory. `knockDown` writes "saw p knock n down" at weight 3 for every witness (audit §2.2). The design never says whether that stays alongside the new witness row.

**Fix (required).**
- **Make the rolled physical acts engine events** from the parsed `actionType` and the roll tier: `hit`, `threatened`, `stole_from`. Code already knows the attack, its target and its tier.
  - A partial or failed attack is a shove: `humiliated`-class.
  - A success is `hit`.
  - The third hit is `beat_down` and *replaces* the earlier hits' memories ("beat me down at the Low Water").
- **Dedupe by class.** Any engine violence event suppresses model `hit`, `humiliated` and `threatened` for that victim that turn. Engine `paid_back` suppresses model `kept_word`, `gift` and `paid_back` for that person.
- **Retire the old witness memory.** The `knockDown` weight-3 witness memory is replaced by the witness row.

## 4. The People editor destroys typed memories (blocker; H)

**Evidence.**
- `editBase` maps memories to `{ turn, text, weight, model }` (`index.html:25129`).
- `editChanges` rebuilds them the same way and replaces the whole list whenever anything in it differs (25227-25229; `editPerson` replaces `memories` wholesale, 10196).
- This is the known `day`/`act` bug (audit §11). Under §5.1 it becomes catastrophic: `event`, `d`, `decay`, `settled`, `secondhand`, `via`, `key` and `sourceKey` are all dropped. The tracks recompute to start plus everyday, and every relationship with that person resets on one typo fix.

**The editor's own semantics also fail.**
- §7.1 says a saved value "is written so the tracks land on it". If it is written into `everyday`, it drifts 2 a day toward 0 on days you do not see them (§6.1), so "Likes you: a lot" evaporates in about a week.
- Player-added memories have no event, so they move nothing.
- The editor allows three traits, so editing traits silently changes every future knob.

**Fix (required).**
- The editor round-trips every memory field.
- Edits to tracks write into `start`, which does not drift.
- "Add a memory" either takes an event picker (a short list) or is saved as `noted`.
- Fix the bug before the migration, not after.

## 5. Exploits: guards that do not hold (serious; B)

| Exploit | Guard in the design | Enough? | Fix |
|---|---|---|---|
| **Compliment spam** | Same-day 1, ½, ¼, 0; mood half-life 2 days | **Yes.** A daily compliment converges to about +10 (3 ÷ (1 − 0.5^0.5)). | none |
| **Gift spam** | Same as above; gifts are "slight" (floor 0.2) | Partly. Each gift leaves +1 permanent; MERCENARY ×2 on a $1 gift. | A minimum value for a gift ($5 or an item), and a floor of 0 for kind slights. |
| **`kept_word` self-report** ("Carter asked me about your note and I told him nothing") | none | **No.** It is the largest trust gain: +15, or +21 for OPEN, or about +29 for OPEN and PRINCIPLED (×1.4 × 1.4). Example 3a only works because it is staged. | The model's `kept_word` needs a code-checkable precondition: an unsettled `they_confided` from that person, plus another NPC present who asked. Otherwise downgrade to `confided`. At most once per person per 3 days. |
| **`came_clean`** | Settles a `lied_caught` by 0.4 | **No.** +10 trust (×1.4 OPEN, ×1.4 PRINCIPLED) is paid even when no lie was ever caught. Lie, confess, repeat: up to about +24 a day on Royce. | It pays only when it settles something: a `lied_caught` memory, or a logged `deceive` action aimed at them (code knows those from the parse). Net trust is never positive over the lie-confess pair. |
| **`exposed` as a trust farm** | Y learns "through the graph" and drops W -30, T -30 | **No.** Tell Pearl (not tied to Mavis) Mavis's secret: Mavis never learns, and Pearl gives +8 trust. The bookkeeper also cannot tell a real secret from a made-up accusation. | Valid only when Y's secret is in state *and* the player has had it (a heard rumour, or the secret was in an earlier packet). Otherwise treat it as `badmouthed`. The second and later exposures to the same X *cost* trust ("if you'd tell me theirs..."). |
| **`badmouthed` / `vouched_for`** steering ties | Scaled by X's belief; the messenger rule | **No.** No roll, no repeat rule, no cap. Ten badmouthings take Vada→Carter from 40 to -60 and flip the rival rule. | The tie moves only on a successful persuade roll. Once per pair per day. At most ±20 total from the player's words per tie. |
| **Fear farm** (threaten, apologise, repeat) | Fear fades in 3 days; the report seed | **No.** An apology settles the threat, and settled harm stops compounding, so each cycle nets about W -3, T -7.5, F +37 (TIMID). Gifts keep liking above 0, so the report seed (which needs liking ≤ 0) never fires. Royce sits at "afraid of you", hands over what he has with no roll, and tables the vote if the fear branch exists. | The report fires on fear ≥ 40 whenever the fear came from the player's threats, whatever the liking. A harm settled within 3 days still counts toward compounding. |
| **Hit, then apologise** | "Settled harm can no longer grow a grudge" plus "first settlement locks" | **No.** An apology the next turn makes any beating grudge-proof forever. | A weight-3 harm settled within the same day still grows a grudge at liking ≤ -60. The apology must land: a successful persuade, or liking above -25. |
| **The owed ledger as a money pump** | 7-day feeling cooldown | **Weak.** Today a favour needs attitude 60 plus a weight-2 memory. Now two errands at liking above -25 plant a favour. The $100 cash-work template fits 14 in-town people (merchant, shopkeeper, bartender, mechanic, farmer, landowner, foreman, boatman, manager, owner, outboard; `index.html` FAVOUR_TEMPLATES [3]). | Cut the ledger (cuts below), or keep owed favours to the non-cash templates. |
| **Staged `rescued` / `defended`** | none | **No.** `rescued` gives W +25, T +15 and owed +2, which plants a favour at once. `defended` puts the parent or spouse at owed +1. The player can goad Colt at Micah and then "defend" Micah. | Make `rescued` engine-only: a fight, a hurt fate or a seed puts that person in danger in state. `defended` needs a present aggressor whose hostile act the narration showed, and pays nothing to a parent unless the aggressor was not provoked by the player that scene (code: the player's previous action did not target the aggressor). |
| **`private` as a witness dodge** | The narration must show nobody could see | **No** for physical acts. | `private` is allowed only for words events. Physical events always give present people the witness row. |
| **`noted` as a familiarity pump** | none | Harmless: +1 knows-you, and the memory rules keep trivia out. | none |

## 6. Saturation: the everyday bucket, the trust cap, and `noted` eviction (serious; G)

**Scenario 1: a round nightly for 10 days at the Low Water.** A round is a `gift` to each drinker plus `spent_time`, as in example 3b. Code adds knows-you +1 a turn, at most 3 a day.

- **Royce** (start W 10, T 10, OPEN):
  - Gifts with slight decay: 5 × Σ(0.2 + 0.8 × 0.5^(a/5)) for ages 0 to 9 = **+33**.
  - Everyday `spent_time` +2 a day, never drifting because you see him daily: **+20**.
  - **W ≈ 63 by Day 10**, the devoted row. Trust stays at 10, unsure. The stance reads **"loyal to you"**.
- **Curtis** (MERCENARY ×2 on gifts): W ≈ 64 by **Day 6**, so "loyal to you" by Day 6. That is the man holding your marker.
- **The everyday bucket has no cap anywhere in §2.1 or §6.1.** Over 21 days of daily drinks it adds up to +73 liking (+3.5 a day with diminishing returns, never drifting while seen).
- **Knows-you:** (4 + 3) × 1.25 for OPEN gives about 26 by Day 3, so the trust cap `20 + k` is 46 by Day 3 and over 100 by Day 10. **The cap only binds on Days 1 and 2.**
- **Does everyone end up "in your corner" by Day 8?** No. Nothing in the drinking loop gives trust, so the split works. The failure is the wording ("loyal" from beer) and the unbounded bucket.

**`noted` is evicted first.** §5.1 drops "the memory with the least remaining effect (weight 1, or faded below 2 on every track)" when the 12-memory cap overflows. `noted` memories have weight 1 and a +1 on knows-you only, which is below 2. Yet they are the one class §5.4 says "must stay consistent": "says she is a surveyor", "owes me $40 by Friday". Under propagation, secondhand memories crowd a bartender's list, and the surveyor lie is forgotten first.

**Knows-you is wrong for harm.** `hit`, `stole_from`, `cheated`, `informed_on` and `crossed` give no knows-you. Example 1's Dewayne ends at knows-you 8, which the grid renders as "doesn't know you", not the "sizing you up" the example claims. The man you punched in his own bay "doesn't know you".

**Fix (required).**
- Cap everyday at ±15.
- `spent_time` diminishes per person across days (full value the first 3 days, then +1).
- The devoted row needs trust above 0 before it reads "loyal" or "would go to the wall"; otherwise "warm to you".
- Eviction order: secondhand first, then mood, slight, wound and bond. `noted` is protected (at most 3).
- Every event gives knows-you +2 or more, or the "doesn't know you" label needs zero memories.
- **Decide the trust cap:** either drop it, or make it bind, for example `10 + k/2` or tied to days met.

## 7. Fear produces inverted characters (serious; G)

- **The override hides hatred.** Wade at W -100, F 42 reads "afraid of you", not "hates you".
- **The override hides friendship.** A TIMID friend (Royce) who watches you put someone down takes the witness rows hit, hit and beat_down: F (8 + 8 + 12) × 1.5 = 42. "Would go to the wall for you" becomes "won't cross you" for days. Rescue on defeat "unless they are afraid of you" may then exclude your best friend: it is unclear whether "won't cross you" counts as afraid.
- **HARD ×0.5 does not hold.** Compounding and multiple hits push HARD people past 40 (finding 3).
- **The protector rule does not produce the worked example.** §6.2's protector is "boss, faction head or police, picked from their ties". Example 7's Tyler tells Carter, who is in none of Tyler's ties. Wade, Carter and Marcus have no protector. Kaylee would tell a parent, and parents are not in the list.
- **The rival rule ignores role norms.** Marcus→Wade is -40 (Appendix B), giving a factor of -0.2 × 0.75 heard = -0.15. Over the fight the chief of police warms by about +15 liking (clamped) and +3 trust to someone who committed a bar assault. Ray Dees, the pastor, warms too (Ray→Wade -30).

**Fix (required).**
- HARD, `tough`-tagged people and faction heads cap at 39 ("uneasy") and answer violence in kind.
- The override applies only when liking is between -60 and 25. Below that, "hates you" stands, with the tag "and afraid of you". Above it, the tag "wary of your temper" is added and the stance stays.
- The protector is per-person content with a default from relations: a parent for minors, a boss, the police. "Nobody" means a grudge instead.
- The rival rule never applies to police for crimes (violence, theft), or to clergy for violence.

## 8. Delivery by schedule co-location is brittle (serious; H, G)

**Evidence.**
- Example 5 delivers Marcus's caught lie to "the department, by morning at Town Hall where they share the place". By CAST.md, Marcus is never at Town Hall: home in the morning and at night, the Old Bridge in the afternoon, Pittman's in the evening. Glenda is at Town Hall mornings and afternoons, home otherwise. They never share a place. Under the 4-day expiry, Glenda never hears.
- The schedules were written for who is in a scene, not for who talks to whom.
- `household(a, b)` returns true for anyone with the same home location (`index.html:21678`). Curtis, Lyman, Leon and Boyd share the motor court. Colt, Travis, June, Tyler, Brianna, Shayla, Dwight and Burl share Riverbend.
- §4.3's "B's household (shares a home)" row and hop 2's "household" kind will therefore treat a trailer park as one family if the implementer reuses that helper.

**Fix (required).**
- Deliver by tie class, not by schedule:
  - household and spouse: overnight;
  - other family, boss and employee: the next morning (they see each other at work or by phone);
  - friends and others: the next co-location, or 2 days, whichever comes first.
- Household means a shared home **and** a family relation, not a shared trailer park or motel.
- Drop hop 2 (cuts below).

## 9. LLM classification: the guard is circular (serious; C)

1. **Traits are counted twice.** The narrator receives the person's traits (PRESENT `traits: proud, watchful`), so a proud Darlene's reaction to an insult is already bigger in the prose. A bookkeeper told to classify "as they took it" then picks the heavier event (`humiliated` over `insulted`). Code then applies PROUD ×1.5 on top.
2. **"The narrator decided the reaction from the cue code sent" is circular.** The cue is a stance-level demeanour ("glad to see you; jokes his way out when pressed"). It never tells the narrator how this person takes *this* act. Code did not steer the reaction. The bookkeeper is reading the narrator's free choice, and the multipliers then amplify it.
3. **Expected confusions, grouped by neighbourhood** (each pair differs by 1.5 to 3× in effect or by a decay class):
   - `insulted` / `humiliated` / `crossed` / `pried`;
   - `hit` / `humiliated` (a slap);
   - `threatened` versus a joke;
   - `gift` / `paid_back` / `bribed`;
   - `did_favour` / `spent_time` / `they_helped`;
   - `kept_word` / `came_clean` / `confided`.

   With 34 labels, I would expect one in five or more emitted events to be a neighbour of the right one. That is a guess. **Measure it:** a 150 to 200 turn labelled set from playtest logs costs under $0.10 a run on Haiku 5.5 ($0.10 per million input tokens, about 2,000 to 3,000 tokens a call).
4. **Parse hazards.**
   - The sibling fields `npcFates` and `memoriesSettled` use `"npc_id: text"`. Haiku will write `npc_dewayne: hit: ...` and `npc_dewayne: hit me in my bay` (no event).
   - Haiku defaults to American spelling and tense drift: `apologized`, `insult`, `threaten`, `kept word`, `came-clean`.
   - A colon inside the text ("meet at 10:30") breaks a split-on-first-colon parser if the model omits the colon after the event.
   - The about-id is often missing (`exposed: told me Mavis spent...`) or spurious (`hit npc_royce`).
5. **The caps drop events in emission order.** Two per person and four per turn, with nothing that says which survive.

**Fix (required).**
- Classify **the act, as a neutral witness would name it**, and let the knobs carry personality.
- Make about 10 events engine-derived:
  - `hit` and `beat_down` from attack rolls;
  - `threatened` from intimidate rolls;
  - `stole_from` from steal outcomes;
  - `gift` and `bribed` from the existing `giftIn`/`giftCheck` (plus an ask in the same turn);
  - `spent_time` from co-presence and Say;
  - `humiliated` = insult or threat with 2 or more witnesses;
  - `paid_back`, `kept_word` and `broke_word` from obligations.
- That leaves the bookkeeper about 20 words.
- **A tolerant parser:** an alias table (spelling, tense, spaces, hyphens), id/event/flag tokens consumed before the first non-token, the colon optional, the about-id inferred from a cast name in the text when missing, and spurious about-ids ignored.
- When over the cap, keep the heaviest events.

## 10. Feasibility gaps the estimate does not cover (serious; H)

- **About 40 `attitudeDelta` sites with no memory and no event.** Examples:
  - grudge third-party hits: Wade, Colt and Trent -10; Ray and Nadine -10; Marcus, Nikki and Travis -10;
  - favours: Marcus, Nikki and Travis +5; Loretta +10;
  - complication "takes it personally" -5;
  - the table-stakes fumble -5;
  - `meetingRep`;
  - `LOOSE_END_ATTITUDE`;
  - GOT_EVEN +10;
  - the card seats ±1/2;
  - obligation onMiss and onMet (audit §2.4-2.9).

  Under "track = start + memories + everyday" each needs an event mapping or goes into everyday and drifts away. §4.5 converts the grudge templates only in B. **A needs an op-by-op table.** Recommended: `attitudeDelta` becomes an engine event carrying `{event, npcId}`, and the validator's `checkDelta(...,50)` and the OPS mirror change with it.
- **The Rng is one shared counter.** `Rng.bound` advances `meta.rngCalls` for every pick (`index.html:6638-6651`), and it is the same stream for dice (18974), clocks (13441) and feelings (13744, 13753). New report and owed seeds add draws, and no-roll fear compliance *removes* a d20 draw. Both shift every later roll and clock in seeded tests and playtests. **Fix:** put every new relationship draw on `Rng.create(hash(seed, npcId, day))`, as the card code already does (19451, 19554), and keep the d20 draw when compliance skips the roll.
- **`/rewind` breaks.** It strikes memories by turn and says "how people feel" is not taken back (README:1023). Under recompute, feelings *are* partly taken back (the memories go), but not:
  - `settled` marks a struck apology left on an earlier memory;
  - tie changes (`log` has a day, not a turn);
  - owed entries;
  - queued hearsay;
  - everyday.

  The result is inconsistent. **Fix:** stamp `settled.turn`, tie log turns, owed and hearsay with turns, and drop them on rewind. Document that "small things" in everyday stay.
- **Migration.** `memoryKind` yields 3 kinds (violence, theft, insult) and `memorySense` yields good or bad (audit §3). That is not 34 events.
  - Most old memories become `noted` or a generic harm.
  - Trust then comes out near start for nearly everyone. A mid-game save with Royce at attitude 55 loses his open secret (the new gate is trust 40 and knows-you 30).
  - The two known bugs invert:
    - The captor's "Beat p in a fight and dragged them to the cells" (no `act:'own'`, 22143) types as the player's violence.
    - Editor-stripped "own" memories ("took the phone") type as `stole_from` by the player.
  - Missing `day` falls back to a 30-entry log.

  **Fix:** a pre-pass that recognises the engine's own memory strings. Seed start trust from the old attitude for people with a weight-2 or higher good memory. **Owner decision:** offer the optional Haiku re-read (Upgrade's `rewrite_memories` already exists; 41 people cost cents).
- **The narrator's cached block and the validator.**
  - The 8 casual example turns carry 10 PRESENT entries in the old `attitude N (word)` format (`index.html:6145-6188`).
  - The validator splits PRESENT on `)); ` (`tests/validate-town.cjs:1946`) and pins `/^Mechanic: .*attitude [−-]?\d+\.$/` (1919).
  - `Style.KNOWLEDGE` says people know "only what their 'remembers' list ... say".

  None of this is in the design. The rewrite needs about 8 more tokens per stranger entry, about 20 per entry with history, plus about 100 tokens to explain `toward you`, `plays it`, `holds you to` and `BETWEEN THEM`. Expect 150 to 300 tokens against **330 tokens of headroom** (`tests/api.test.cjs:174`). The new format also nests `(Day 5)` and `; ` inside a `; `-joined, `)`-closed person, so the validator's split needs a real parser.
- **`MEMORY_RULES` is shared word for word** with Upgrade's `SYSTEM.memories` (a test pins this, `upgrade.test` L361). It says "saw them hit the bartender" and defines weights. Both contradict the new scheme, so the two must be forked deliberately.
- **Test count.** The audit finds about 100 tests asserting on this state directly (audit §9), not "about 30". On top of that come the mock bookkeeper (pinned -15 per insult), SPEC acceptance [4], `wave17-grammar`'s 41/4/18/13 pins, `RECORD_CORE_FIELDS`, and `content.test` L492's `attitudeAtLeast.npc_royce >= 25`. The 1,700 to 1,900 line estimate excludes the editor, validator, example turns, mock and migration pre-pass. **Expect about 2× the estimate.**
- **A depends on B.** The report seed's "picked from their ties" and the minor guard's "through the graph" are both B features. A needs a relations-label fallback.
- **New content keys:** `start`, knob overrides, `factionLoyalty`, `TOWN_DATA.ties` and `SECRET_TIES` must be added to the validator whitelist (`validate-town.cjs:1191`).

## 11. Cues that promise future acts make the narrator pre-empt seeds (serious; A)

**Evidence.**
- §8 cue examples: "does what you say, fast; won't meet your eye; **will tell someone after**".
- Burl: "easy with you; **means to square it with you**".
- A cue is a stage direction for *this* turn. A narrator told "will tell someone after" may write Tyler on the phone to Carter as the player leaves. A narrator told "means to square it" may have Burl offer the cash work now. The bookkeeper then records a `goldDelta` of +100, and the seed pays again on Day 6.

**This breaks rule 1 and rule 6:** the narration invents a fact that code has scheduled for later.

**Fix (required).** Cues describe present demeanour only. Future acts live only in seeds and arrive as due events. The tag "owes you" is shown, but the cue says nothing about squaring it.

## 12. "Won't sell to you" can soft-lock the game (serious; F)

**Evidence.**
- §6.3: a manager, owner, merchant, bartender or cashier at "against you" or "hates you" won't sell to you, with no expiry.
- Example 2: Mavis at "against you" closes the motel, which is the only paid bed.
- Harm floors of 0.4 to 0.6 keep a wound or scar at 50 to 80% all game, so "against you" can last to Day 21.
- Royce (merchant) and Kaylee (cashier) close Pittman's, the only gas and food.
- Sleeping rough brings the chief's warnings and then fines (audit §2.2 `sleptRough`).

**Fix (required).** A refusal lasts 3 days, like a ban, and then becomes a 25% markup. Essentials (a bed, gas, food) are never refused for more than a night unless a grudge template says so.

## 13. Too many knobs to tune (serious; E)

**Counted from the design:**

| Part | Count |
|---|---|
| Tracks | 5 |
| Stance phrases (21 cells, 17 distinct, 2 overrides with 4 phrases, 6 tags, the knows-you < 10 rule) | about 28 |
| Event table (34 rows; non-empty numeric cells) plus 34 decay assignments | about 120 + 34 |
| Witness row | 8 rows, 15 numbers |
| Knobs | 10, with about 24 multiplier rules |
| Trait mappings, plus `patient` | about 70 |
| Decay (5 classes × 2, the trust half-speed, 3 fear clocks and a floor) | 15 |
| Repeat rules | 6 |
| Settle table | 12 numbers and the lock |
| Tie defaults (12 kinds × 2) | 24 |
| Factor table | 14 |
| Adjustments | 7 |
| Delivery (5 routes, 3 multipliers, expiry) | about 10 |
| Hand ties | about 90 numbers |
| `SECRET_TIES` | about 35 |
| Messenger and badmouth rules | 6 |
| Faction loyalty | 11 + 3 |
| New thresholds | about 35 |
| Per-turn clamps | 4 |
| Owed, report and feed rules | about 20 |
| **Total** | **about 650** (today: about 40 thresholds) |

One person cannot tune this by playtest. Each live playtest costs real money, is noisy, and moves several of these at once.

**What carries the most behaviour per line:**
- trust as a second axis, with its gates (deceive, secret, alibi, couch, council);
- the event type driving the grudge kind and the reasons (deletes regex guessing, fixes R6 and Q3 class bugs);
- one-hop propagation along spouse, family, lover and boss ties with one factor per kind;
- the stance phrase plus two reasons to the narrator.

**What is ornament:**
- hop 2;
- the faction-loyalty blend (11 values feeding two choices);
- BETWEEN THEM lines;
- knobs 5 to 10 (MERCENARY, PRINCIPLED, LOYAL, and FORGIVING beside GRUDGING; Burl has both);
- five decay classes, trust fading at half speed (trust half-lives of 4 to 42 days are effectively never in 21 days) and three fear clocks;
- the 6-row settle table;
- the owed ledger and its ask-back, broke-word chain;
- knows-you as an event-driven track.

**Fix (required).** Turn the nine worked examples into headless tests. Write a small simulator that runs three canned playstyles (beer-buyer, confidant, brawler) over 21 days and prints every track daily. Tune against that, not against live play.

## 14. What the player sees (serious; F)

- **The card's 2×2 grid is a stat sheet in words.** "Likes you no · Trusts you no · Scared no · Knows you a little" on every card is four meters. "Scared: no" on Ray Dees, the pastor, reads like a goal to fill. Owner's taste: no stat-sheet feel. The stance phrase plus two dated reasons already says it. Keep the grid in Debug, or behind a fold.
- **Band flicker.** Trust at 25 decays to 24 overnight, and "on good terms" silently becomes "friendly". Fading is silent (§7.2), so the card changes with no line, which reads as noise. Add hysteresis: enter at 25, leave at 20, on every band.
- **Wrong phrases.**
  - Example 6 prints "Trent Haskins takes you at your word now" at trust -3 (distrusts to unsure). That is not taking anyone's word.
  - Transitions need their own words, for example "...is willing to hear you out again".
  - 17 distinct phrases, several near-synonyms (cool, cold, suspicious, doesn't believe you, sizing you up), plus a tag. That is about 45 characters, which wraps at 375px beside "Jolene Overstreet · 57".
- **The feed cap fights B.** At most 2 lines a turn and 3 overnight, ranked with "they heard" and the hidden-tie lines *last*. Yet the design's answer to "why did Loretta cool?" is "the overnight line". The Wade fight produces about 8 overnight candidates; 5 are dropped. **Fix:** collapse into one line: "Word got round: Lorna, Colt and Wade's crew have heard about the Low Water."
- **"Hates you" needing an unsettled weight-3 harm** is intelligible *with* the reason shown. Without it, two people at -80 and -61 reading "against you" and "hates you" looks random. Keep it, but always show the reason beside "hates you".
- **Does the town turn all at once?** One bar fight moves about 13 people within 24 hours (worked numbers in the scenario walks below), 3 of them *warmer*: the pastor, the chief and the parolee. For a beating in a town of 800 that is plausible. What is not plausible is that the bystanders never recover (finding 6's floors; scenario 2).

## 15. Getting even plus the lock traps the player (serious; G)

**Evidence.**
- §5.3: "A memory settles once. The first settlement locks it."
- Getting even settles liking × 0.6.
- So after Wade's grudge comes due, nothing the player does (an apology, a favour "to make it up") can soften that memory again.
- At Day 21 a scar keeps 81%: Wade at -73 with no way back except new positive memories, each fighting a 0.6 floor.

**Fix.** Settlements combine: `1 − (1−a)(1−b)`, at most two per memory, plus "got even" for one.

## 16. Smaller errors and gaps (minor)

- **Knob dedupe is unspecified.** "Multipliers multiply" would give Mavis (bitter and shrewd) SUSPICIOUS twice (×1.69), but the examples use ×1.3. Burl gets GRUDGING and FORGIVING. Curtis gets OPEN and SUSPICIOUS. **Fix:** knobs are a set, and opposites cancel.
- **Arithmetic and consistency slips:**
  - Mavis at W -39 is not "one more insult from a grudge": -39 plus -10 is -49, so it takes two humiliations.
  - Royce's fear "about 62 by Tuesday" is 53 to 59 by the design's own decay.
  - Example 1's Dewayne at knows-you 8 reads "doesn't know you".
  - Example 7's protector does not come from the stated rule.
  - Example 9 gives Day 5 for a Day 4 act.
- **Reputation:** "each event row has a small reputation value" (§4.6), but the table has no such column. Town reputation now moves only through these values, so they are not optional.
- **Secondhand text:** "heard you hit Dewayne at the station" requires turning the victim's "hit me in my own bay" into a third person. Unspecified. Generate it from an event template plus the place and day, not by pronoun-rewriting LLM text.
- **Trust-grudge source:** the trust-grudge route (trust ≤ -60 with an unsettled betrayal) has no first-hand condition. Glenda's secondhand `lied_caught` could open a department-wide grudge. Require `secondhand: false`, except `exposed` about them.
- **The flirt event in A and B is self-contradictory.** "Welcome only with an adult the content marks open to it (tier C)" means no one is ever welcome in A or B. So every adult flirt costs -6, even when the narration showed her flirting back, and the next turn the narrator gets "flirted with me (unwelcome)". **Decide:** in A and B, an adult's reaction as narrated stands (`complimented` or `insulted`). Only minors are overridden (finding 2).
- **The couch rule's "or they owe you"** opens a disliking person's house. Add "and liking above -25".
- **A/B prompt scope:** `rebuffed` and `intimate` (C) must be absent from the A and B glosses, and code must reject them.

## 17. Tokens and cost (minor; D)

- **The cost claims are fine but for the wrong reason.**
  - The bookkeeper's system prompt is sent **uncached**, as a plain string, and a test pins it (`tests/api.test.cjs:176`; `index.html:15336`). The design's "a system prompt that can be cached" is not true today.
  - It also does not matter: +450 tokens at Haiku 5.5's $0.10 per million is about $0.00005 a turn, and about $0.001 on the "best" preset's Sonnet 5.5.
  - Haiku 5.5 could cache it (its minimum cacheable prefix is 512 tokens), but saving $0.00004 a turn is not worth changing the pin.
- **Grammar:** the swap removes 8 properties (`attitudeChanges` 3, `newMemories` 4, `memoriesSettled` 1) and adds 1. That is 41 down to **34**, and 4 enums down to 3. That is more headroom than the "about 5" claimed. `RECORD_CORE_FIELDS` and the 41/4/18 pins in `wave17-grammar.test.cjs:63-79` must change.
- **The narrator PRESENT line is roughly even per turn.** A stranger goes from about 7 to about 14 tokens. A person with history goes from about 30 to 67, to about 40 to 50. At the Low Water at night (7 people) expect +50 to +150 tokens, well under the playtest's 12,000-character packet bound and the 1 to 6 cent band.
- **The real constraint** is the cached narrator block's 330 tokens (finding 10). The design does not budget it.
- **The bookkeeper packet:** "short handles of the unsettled memories" for every present person can reach about 600 tokens at a 7-person table. The money is trivial, but a long handle list makes a Haiku classifier worse. Send at most 3 handles per person.

## 18. What is missing (minor to serious; J)

- **Respect.** max(trust, fear) is not standing. In this town, standing is public: you pay what you owe, you keep your word where people saw, you don't welsh, you don't run from a fight. That is reputation, and the design just made reputation move "only on public events" with no values (finding 16). Give each event a public-standing value, and derive "takes you seriously" from the town tier plus personal trust. SPEC §8 lists a "feared" tier that the code never had; the fear track can feed it (3 or more people at fear 20 or more gives "feared"). Optional.
- **Ties are static, not "live".** Ties change only through the player's words, content ops and templates (§4.5). When the player gets Colt arrested, Lorna→Marcus does not change. When Wade's grudge has Colt beat the player, nothing moves between them. Either add one route (an engine fate an NPC caused moves the victim's family toward the cause) or rename it "a social graph" and stop promising "live".
- **`/fact` is undefined.** A story point spent on "Loretta owes me a favour" or "Royce and I go back" should map to owed or knows-you and trust through the parser. Otherwise a paid-for fact has no relationship effect. Today `/fact` memories are weight 3 and can fuel a grudge (audit §11, known bug). **Decide** what a relationship `/fact` buys.
- **The council fear branch.** Recommended: no. As designed, two threats on Days 4 and 5 beat four days of honest confidences, and the costs are conditional (finding 5). If the owner wants it, the report must fire unconditionally and Marcus must open "person of interest".
- **Households (C) versus B.** B's per-person propagation already cools a household, and the 3-line feed cap hides it. The one-line collapse (finding 14) is enough until C.
- **Romance timeline:** C only. Three weeks is enough for "sweet on you" and "old flame". No finding.

---

## Scenario walks (G), using the design's own tables

**Scenario 1: the nice player.** See finding 6.
- Royce reads "loyal to you" by Day 9 or 10; Curtis by Day 6.
- Nobody reaches "in your corner" from drinks alone, because trust never moves.
- The trust cap stops binding after Day 3.
- Everyday adds about 2 a day without limit.

**Scenario 2: one bar fight, Day 2 evening at the Low Water.** In the room: Wade (the victim), Loretta, Tammy, Lyman, Curtis and Carter (CAST schedules; Day 2 is a Friday, so the bar is open).

- **Wade:** W -100, T -50, F 42.5, "afraid of you" (finding 3).
  - At Day 10: the merged hits (wound, 0.745) give -47 and the beat-down (scar, 0.907) gives -32, so **W -88**.
  - At Day 21: 0.56 and 0.81, so **W -73**. Still "hates you". Intended.
- **Each untied witness:** witness rows give W -18, T -16, F +28. That is "uneasy around you" for Carter, Lyman and Curtis. HARD Loretta and Tammy get F +14.
  - Liking by Day 10 is still -15, and -12 at Day 21: the inherited wound and scar floors.
  - Fear is gone by about Day 6.
  - That is 1 to 3 memories each (the spec is unclear whether each witness row becomes a memory). Harmless once. After three fights at the same bar, the regulars carry 6 to 9 secondhand entries and the eviction rule removes their `noted` facts first.
- **By morning:**
  - Lorna (spouse, LOYAL, factor about 0.54): raw -53, clamped to **-15/-15**.
  - Colt (factor about 0.21): **-15** (clamped).
  - Micah (hidden tie): about -8, a memory.
  - Hollis: about -8.
  - Rivals warm: Ray (pastor) **+11**, Marcus (chief) **+15** liking and +3 trust, Boyd (hidden) **+15**.
  - Night Run reputation -5.
- **About 13 people move in 24 hours.** The cold that persists is mostly the right people (Wade, Lorna, Colt). The bystanders' permanent -12 is the floor problem.
- **Fix:** witness and secondhand copies decay one class lighter with floor 0, and are merged into one memory per scene.

**Scenario 3: a stranger reaches the council's trust 30 and knows-you 25 by Day 6.**
- **Honestly, yes, for Royce** (OPEN ×1.4).
  - Start T 10 needs +20.
  - Three of: `did_favour` +7, `they_confided` +4, `confided` +7. Or one `kept_word` +21.
  - Knows-you from four afternoons is about 35 (cap 55).
- **The cap does not stop a Day-1 fake.** A made-up `confided` (+7) and a staged `kept_word` (+21) give T 38, against a Day-1 cap of about 41 (knows-you from code 3.75, `confided` 10, `spent_time` 5 and `kept_word` 2.5).
- Loose-end people start at knows-you 30, so their cap is 50 from turn one.
- **Example 3a leans on the same unguarded `kept_word`** that makes the fake work. With finding 5's precondition the honest path still works at 3 to 4 events over 4 days, which is the right pace, and the fake no longer does.

**Other dynamics checks requested.**
- Decay half-lives against 21 days are sensible for liking. Trust fading at half speed makes trust effectively permanent, which is ornament (finding 13).
- The everyday drift of 2 a day happens only on days you don't see them, so the regulars never drift.
- Secondhand weight-1 can't feed the liking grudge (it needs weight 3). It can feed the trust grudge (finding 16).
- The report seed's protector: finding 7.
- The GOT_EVEN replacement is larger than today's +10 (about +24 on a -60 harm) and then locks the memory (finding 15).

---

## Coverage by section

| Section | Findings |
|---|---|
| A Spec violations | 1 (rule 1 and the hidden-field rule via the narrator), 11 (rule 1 and rule 6 via cues), 16 (the flirt contradiction). Rule 2 holds: code decides that no roll is needed. Rule 4 holds. Rule 6 holds for hidden ties (earned in state). Rule 8 holds, given finding 10's `/rewind` stamping. |
| B Exploits | 5 |
| C LLM reliability | 3, 9 |
| D Tokens and cost | 17. No real cost finding; the risk is the cached block. |
| E Complexity | 13 |
| F Legibility | 1, 12, 14 |
| G Dynamics | 3, 6, 7, 15, and the scenario walks |
| H Feasibility | 4, 8, 10 |
| I Content and safety | 2. Nothing glamorises beyond the fear path, which finding 5 makes cost something. |
| J Missing | 18 |

---

## Verdict

**Approve with changes.** The model at the centre is the right one and should be built:
- the social act is recorded as a typed, decaying, settleable memory;
- liking and trust are separate tracks;
- a code-computed stance phrase plus two dated reasons go to the narrator and the card;
- feelings spread one hop along family, spouse, lover and boss ties.

It fixes documented failures (regex valence, grudge kinds, one scalar gating everything), and the worked examples show the behaviour the owner asked for. It is not ready as written:
- Four blockers would ship real harm: the narrator leaking hidden ties, a minor guard that runs after the fact, violence counted two or three times, and an editor that erases the new state.
- The exploits and saturation problems mean the most efficient play is to stage kindness and to bully.
- About 650 numbers cannot be tuned by a single owner without a simulator.

Approve tier A once the ten changes below are in the design. Send B back for a smaller second draft (one hop, delivery by tie class, no loyalty blend) before its milestone starts.

## The 10 changes required before implementation

1. **Hidden-tie and secret-derived reasons reach the narrator without cause or names** until the tie is known or the secret gate opens. The card dates the act, not the delivery. The owner decides whether the card names the act.
2. **An airtight minor rule in A:**
   - a parser `romantic` flag;
   - a code decision *before* narration, with a per-turn narrator instruction;
   - minor = cast age or current age under 18, whichever is stricter;
   - parents through relation labels;
   - no fear compliance or fear-opened secrets from minors;
   - certain reports for threats or violence to minors;
   - tests in A.
3. **Engine-derive the rolled and code-visible events.** `hit` by roll tier, `beat_down` replacing the hits, `threatened`, `stole_from`, `gift`/`bribed`, `spent_time`, `humiliated` by witness count, obligations. Define dedupe classes. The bookkeeper classifies the *act* from about 20 words, through a tolerant parser with aliases. A labelled eval of 150 turns or more runs before tuning.
4. **Guard the self-report events** with code-checkable preconditions (`kept_word`, `came_clean`, `exposed`, `rescued`, `defended`, `private`). Settlement does not immunise a same-day weight-3 harm and does not reset compounding. Settlements combine rather than lock. The report seed fires on threat-made fear whatever the liking.
5. **Bound the dynamics:**
   - everyday ±15;
   - `spent_time` diminishing across days;
   - the devoted row needs trust above 0;
   - witness and secondhand copies one class lighter with floor 0, merged per scene;
   - eviction secondhand first, `noted` protected;
   - band hysteresis;
   - knows-you from every event;
   - a decision on the trust cap.
6. **Fix fear:** HARD, tough and faction heads cap at 39. The override applies only between liking -60 and 25. A per-person protector with a "nobody leads to a grudge" fallback. No rival warming for police or clergy over crimes.
7. **Deliver hearsay by tie class,** not schedules. Household means a shared home and a family tie. Drop hop 2.
8. **A written feasibility plan:**
   - an op-by-op conversion of about 40 `attitudeDelta` sites;
   - an editor that round-trips typed memories and writes edits to `start` (fix the strip bug first);
   - `Rng.create` sub-streams for all new draws, with the d20 kept when compliance skips a roll;
   - turn stamps for `/rewind`;
   - a migration pre-pass for own-memories, trust seeded from the old attitude, and the optional re-read;
   - a token budget and rewrite for the example turns, `KNOWLEDGE` and the validator's 1919/1946;
   - forked `MEMORY_RULES`;
   - the test estimate rebased to about 100.
9. **Cues state present demeanour only,** with no future acts. "Won't sell" refusals last 3 days and then become a markup, and essentials are never refused for more than a night.
10. **Make the nine worked examples executable tests and add a 21-day headless simulator** (beer-buyer, confidant, brawler). Fix the doc's arithmetic slips. Specify the missing numbers: reputation per event, knob dedupe, and the event drop order at the caps.

## The 5 cuts that keep the goal

1. **The owed ledger.** Derive "owes you" and "you owe them" tags from unsettled `did_favour`, `rescued` and `they_helped` memories, and let favour seeds use the existing (lowered) favour rule. This removes a money pump, the ask-back then broke-word trap, a track and a feed family.
2. **Hop 2, the faction-loyalty blend and BETWEEN THEM.** One hop along family, spouse, lover and boss ties carries the Dewayne-to-Mavis behaviour the owner asked for. Faction reputation stays as today.
3. **Knobs from 10 to 4 signed axes:** pride, guardedness (SUSPICIOUS to OPEN), nerve (TIMID to HARD), grudge-holding (GRUDGING to FORGIVING). Drop MERCENARY, PRINCIPLED and LOYAL. Collapse decay to 3 classes, one fear clock and no trust half-speed.
4. **Knows-you as an event-driven track.** Derive familiarity in code from the days met plus the turns aimed at them. It only gates the stranger cue, the secret and the trust cap, and it needs no column in the event table.
5. **The card's 2×2 word grid, and half the stance grid.** Show the stance plus two dated reasons, with the tracks in Debug. Cut the 21 cells to about 10 phrases (5 liking bands × trusts or not, plus "hates you" and "doesn't know you").
