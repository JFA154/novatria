# Content pass (wave 1): what changed, what the engine must read

The content agent's share of the approved review (REVIEW.md section 4 and the
content parts of sections 2 and 3), written to the shapes in CONTRACTS.md
sections 1 to 5, 7, 9 and 11. Everything below is data in the `BEGIN CONTENT`
block of `index.html`, checked by `tests/validate-town.cjs`; the engine that
reads it is other agents' work (checklist at the end).

## What changed

### A. Calendar and weekdays
- `TOWN_DATA.calendar = { season: "autumn", startDate: "2026-10-08" }`: day 1
  is Thursday 8 October 2026. The September 2026 "recent" entry now sets the
  vote "for its meeting on Tuesday, October 13" (day 6); the setting says the
  council votes "next Tuesday". Royce losing $1,100 "in October" stays (it is
  October).
- `closedOn: ["Sunday"]` on the Low Water and Byrd's Pawn (the two places
  whose hours name a shut day).
- `awayOn: { days: [Mon..Fri], phases: ["morning", "afternoon"], where: "at
  the county school in Clayburn" }` on Annette (teacher), Kaylee, Austin and
  Micah.
- Schedules: Nikki runs the River Road in the morning (Town Hall in the
  afternoon); Odessa is at Sturdivant House every phase, so she answers
  Vada's door in the evening; Lamar drinks his coffee at Pittman's in the
  morning (Pittman's details now say so) and is at the farm from the
  afternoon. The five public places that were always empty now have people
  their own text puts there: Kaylee at the Water Tower at night, Nikki on the
  River Road in the morning, Elbert and Burl on the Front Street bench in the
  morning, Tammy at Amber's grave in the morning, Travis running radar at the
  Bluff in the evening. Boyd and Leon, the two people the enemy loose end
  can be, keep to the motor court in the mornings (neither stands at
  Pittman's, the gate start place, on the player's first morning).

### B. Facts that disagreed
- Wiley died "three springs ago"; Ruth stays "three winters ago".
- Travis's rumour: he "bought a new bass boat this summer and pays the note
  down in cash every month", which agrees with his goal (keep taking money
  until the boat is paid off).
- Dwight moved the stakes "off the Haskins forty and onto the Sturdivant
  bottomland" (the bottomland's details now say the Haskins family owns forty
  acres outright at its edge).
- Virgil's secret: "Warren Pettit, the engineer the state sent".
- Pills thread: Amber died in August and "four more people there have
  overdosed on the same pain pills since and lived" (June's four reversals).
- Police clock 3: "Chief Bell ... walks Jolene Overstreet down to the holding
  cell in handcuffs" (arrested puts her in Town Hall's cell, not out of it).
- Prices agree with the places: beer $3, catfish basket $9, a night at the
  motel $49, crickets $3 a tube, coffee $2.
- The River Road runs upriver only (its exits); its history no longer sends
  it past Riverbend to the ramp, the landing's ramp is not "where the river
  road runs into the water", and the bottomland and the mill are reached "by
  the county road past Riverbend".
- Amos ran whiskey "from the 1920s into the 1950s, the last years with
  Elbert Gentry rowing it" (Elbert, born 1938, rowed it "as a boy after the
  war"); Elbert's Bible page is in his granddaddy Asa's hand.
- The school bus goes north to Clayburn and never crossed the bridge:
  Annette called the state after a loaded log truck passed her car on the
  first span and the deck dropped.
- Teresa's secret: Boyd "missed his check-in last week" (he has been here a
  week, not two months).
- Loretta "came home in 1991" from tending bar in Calder, so she was here to
  lead the losing side of the bypass fight with Clyde Pittman before she
  bought the Low Water in 1994.
- The council has five seats for its "three to two": Jolene (mayor), Royce
  (swing), Lamar, and the two "no" seats, Hollis Byrd (since 2002) and Elbert
  Gentry (since 1983), both tagged `council` with their roles and histories
  saying so. Why them: Hollis is the Night Run's man and a Front Street
  merchant, so he votes to keep the crossing in town and to end the police;
  Elbert wants the bridge his granddaddy made his peace with to stand, and
  his granddaughter Glenda's dispatcher job pays for his medicine, so he
  votes to keep the police. That makes Royce the swing on both votes, and
  Lamar (who wants the police kept) the reason the police vote is close.

### C. Nobody who does not exist
- Tyler shares a trailer with his cousin Brianna (not "two other boys").
- The day-7 overdose is Brianna Tolliver (Colt's customer, already one of
  June's four), not "a boy at Riverbend".
- Place details name the cast: Lamar at Pittman's window, Kaylee at the
  register; Lyman, Leon, Curtis and Boyd as the motel's weekly roomers; Burl
  fixing outboards on the dock; Travis running radar at the Bluff (not
  sheriff's deputies); Kaylee at the water tower (not "the teenagers"); Elbert
  and Burl on the Front Street bench (not "the old men"); Virgil on the pier
  (not "fishermen"). The made-in-play places' `TABLES.location.problems` no
  longer name "two brothers", "a kid", "the cashier" or "a tenant", and a
  detail's sick-child jar is the coffee can for Amber's headstone.
- Grudge templates never hire anyone: the NPC acts alone or through a named
  cast member (Loretta's bar list, Chief Bell, Shayla's chair).
- The enemy seed no longer asks "the night clerk"; every loose-end seed has
  the person come to the player with no setting assumed.
- Jodie's secret writes her real name: Jodie Ogletree, Bernice Ogletree's
  daughter, Calvin's niece, who skipped bail and took the job at the Low
  Water to find out who beat her uncle. (Not written as relations, so her
  People card and CAST.md do not give it away; Bernice's goal and secret say
  it from her side.)
- Boyd's secret writes his target: Wade Purvis, who gave Boyd's name to the
  law in 2018 to keep his own out of Dale's case; "Wade's is the first name
  on his list" (room for the player when the enemy loose end binds him).
- Wade's and Lorna's secrets name Calvin Ogletree as the man Wade beat; Carter,
  Odessa and the Vada seed name Dr. Phillip Sayle; the lease seed names Neal
  Haverty; the police methods name Tyler.
- Front Street gains `aka` "the old bank" and "the old drugstore".
- `tests/mentions.cjs` gains a `NOBODY` list (a made-up crowd: "two other
  boys", "pays two men", "the farmers", "a boy at Riverbend", "the night
  clerk", "a doctor in the city" ...), reported by the validator as `"..."
  puts someone in the story who is not in the cast`.

### D. Loose ends
- Every preset option binds, by its own tag, to the cast member it means:
  - debt: lender (Carter, Hollis) $600; collector (Leon) $300 title loan;
    bookie (Curtis) $400 card game.
  - enemy: all three options say the person is "already here waiting for
    me"; `enemy` is carried by Boyd and Leon (Jodie is no longer an enemy:
    she is the promise's daughter), `parolee` by Boyd.
  - secret: informant (Tyler, Glenda, Shayla), blackmail $200 in 2 days.
  - lost: the brother is replaced by "Amber Lott, a girl I knew, died here in
    August, and I want to know who sold her the pills" (`bereaved`: Tammy,
    Austin); the group-home kid's past binds to Nadine (`secretary`; her
    shoebox's oldest page is "one she tore out for her own daughter Leah");
    the towboat friend is Calvin, through Lorna (`witness`), who pays his
    sister Bernice.
  - promise: the letter's recipient and the daughter to bring home are Jodie
    (`runaway`); "a man in the state pen" asking the player to look in on his
    boy is Dale and Colt (`dealer`).
- `obligation` (the kind's default) and `obligations` (one per option, lined
  up with `options` like `link.optionTags`): `{ kind, amount?, dueOffset,
  text, itemName?, onStart?, onMiss, onMet }`, placeholders `{npcId}`,
  `{npc}`, `{playerName}`. The debt seed now comes on day 3 or 4 and says the
  money is due in three days (`dueOffset: 3`); a missed debt takes the phone,
  cash or the Low Water (Curtis); missed blackmail goes to Chief Bell; the
  letter is an `errand` whose `onStart` gives the player "Letter for {npc}".
- `GOAL_PRESETS` (six one-line goals from the threads) is a top-level const
  in the content block and in its `module.exports`.

### E. Backgrounds
- Every background carries a third item, "Prepaid phone" (its own id and
  notes), so the 17 people elsewhere can be reached by phone (one bar by the
  water tower).
- `hook: { npcId, text, dayOffset, trigger }` per background: veteran → Chief
  Bell (sit above the boat ramp one night); dropout → Dewayne (a hand in the
  bays, $12 an hour); fired bookkeeper → Hollis (receipts that need to look
  like a pawn shop's); river deckhand → Wade (one night's run, $200;
  dayOffset 1, because he is at the docks on arrival); group home kid →
  Nadine (she knows the housemother's hand, come to Wednesday supper); poker
  hustler → Curtis (the Friday game). Triggers are `npc` (the person's own
  id). The text uses `{player}`.
- The item hooks are answered by rumours: Curtis checks every deck for marks
  (`rum_curtis_deck`), Wade buys cartons at the landing (`rum_wade_cartons`),
  Nadine will write a baptism into the church book (`rum_nadine_books`, and
  her secret).

### F. Grudges and favours
- 13 grudges, 12 favours, each `{ effect, dayOffset, effects, public,
  forTags?, notForTags? }`. Prices up 5 days (`playerPrice 1.25`), barred from
  the Low Water 3 days (`banFrom`), a beating (`playerHp -3` + `addCondition
  Beaten "-1 might" 2 days`, `forTags: ["tough"]`, never elderly, teen or
  police), a shove (`playerHp -1`), a police ticket (`playerGold -50`,
  police only), the cash work (`playerGold +100` when it fires), tip-offs as
  private `addNews`/`addMemory`. No template assumes the player's phone or
  vehicle. New tags for the filters: `elderly` (Vada, Elbert, Pearl, Lyman,
  Virgil), `teen` (Kaylee, Austin, Micah), `tough` (Wade, Colt, Boyd, Leon,
  Dwight). The validator checks that every person in town can hold at least
  one grudge and one favour, and that nobody old, young or police can hold a
  beating.

### G. Clocks, seeds, the council meeting, the epilogue
- Staggered: police 5 segments a clock, Sturdivant 6, Night Run 8 (medians
  from a quick simulation: police days 4.8 / 8.5 / 12.3, Sturdivant 5.5 / 10
  / 14.5, Night Run about 7 / 13 / 19).
- The Night Run's clocks are reordered so "Turn the swing vote" (the
  photographs) is first: it races Carter's "Buy the swing vote" to Tuesday's
  meeting (about 79% and 46% done by then), which is what the meeting
  branches on.
- `requires` and `alt` on completions: S0 and N0 need `councilVoted` unset
  (alt: after the vote); S1 needs Wade free (alt: Lorna keeps the shop open);
  S2 needs `bridgeReportVoid` unset (alt: "the state orders a second
  inspection", `secondInspectionOrdered`, a `clockAdjust` for the Night Run
  and a `threadUpdate`); P0 needs Colt and the chief free (alt: Nikki catches
  Trent); P1 and P2 need the chief free (alt: Nikki); P2 also needs Jolene
  free; N1 needs Travis free; N2 needs the chief and Jolene free (alt: "the
  council suspends him at an emergency meeting").
- `clockAdjust` reactions: P0 sets the Night Run back 2, P1 back 1, P2 sets
  Sturdivant back 2, S0 and S1 set the Night Run back 1, N0 sets Sturdivant
  back 2, N1 the police back 1, N2 the police back 2. A completion never
  adjusts its own faction (the validator refuses it); S2's alt deliberately
  does not set Sturdivant back, because the same alt would fire again on the
  next completion and loop.
- New flags set by content: `royceBought`, `royceTurned`, `riverUnwatched`,
  `coltArrested`, `bridgeReportVoid`, `oldBridgeClosed`,
  `secondInspectionOrdered`, `engineerNoShow`, `vadaNewWill`, and from the
  meeting `councilVoted`, `councilBackedDownstream`, `councilBackedInTown`,
  `bridgeVoteTabled`, `policeDissolutionPassed`, `policeKept`. The validator
  checks every flag a condition reads is set somewhere.
- Seeds: lease letter day 3 (Saturday, about Friday night at the bar), big
  run day 4 (requires the chief and Wade free), engineer day 4 (before
  Tuesday; sets `engineerNoShow`), council agenda day 5 (Monday; makes the
  police thread known), overdose day 7 (requires Colt and Brianna free; alt:
  Tammy blames Trent Haskins), Vada's doctor day 11 (requires Vada and Carter
  free), tackle box on `["loc_old_bridge", "loc_purvis_landing"]` with
  `notBeforeDay: 3` (the landing is the docks start place). Public seeds
  carry an `addNews` effect.
- `reward` on the threads: the bridge vote `charm`, the police `wits`, the
  pills `stealth`.
- `TOWN_DATA.events`: `evt_council_meeting`, day 6, evening, Town Hall, with
  seven branches and a default, first match wins: the report already thrown
  out (tabled, police kept); Royce's attitude to the player at least 40 (he
  tables it, keeps the police); both Carter's money and the photographs
  (Royce abstains, ties); the photographs alone (bridge in town, police
  dissolved at the end of the month); Curtis's debt `met` and Royce not
  bought (Curtis lets Royce's marker ride; tabled, kept); Carter's money
  alone (downstream, police dissolved); Carter close (`clockAtLeast
  { fac_sturdivant: 4 }`, tabled, kept); default (tabled, kept). The police
  dissolution is item four on the same agenda in every branch. Each branch
  sets `councilVoted`, updates both threads and adds a public news line.
- `TOWN_DATA.epilogue`: `onDay: 21`, `orFlagsSet: ["oldBridgeClosed",
  "secondInspectionOrdered"]`, five branches (report void; closed and police
  gone; closed and Curtis's debt missed; closed and Loretta at 40 or more;
  closed) and a default (nothing settled), in the casual voice, no effects.

### H. Rumours
- 20 rumours (17 true, 3 false). Ten new: Mavis's cash rooms, Carter after
  Odessa, Nikki at the sheriff's office, Lamar's uncashed check, Micah at the
  landing past midnight, Darlene's folder, Curtis's marked-deck rule, Wade
  buying cartons, Nadine's church book, Dwight on the bottomland with survey
  paint. People in town who appear in no clock, seed, rumour, thread, event
  or hook: 26 before, 3 now (Annette, and Boyd and Jodie, who are loose-end
  people).
- Every starting rumour has `tellerIds` (people besides the source who can
  tell it), most have `threadId`, two have `factionId`; the validator
  requires at least two possible tellers each.
- Gerald, Pearl and Nadine are tagged `gossip`.

### I. Goods
- Every `TABLES.items.goods` entry has `kind` (`good`, `service`, `drink`,
  `food`) and no place in its name ("Bottle of beer", "Night at the motel",
  "Used shotgun", "Outboard tune-up"). "Used tire" and "Tow to Pittman's"
  (no car to use them on) became "Haircut" (Shayla's $15) and "Cup of
  coffee" (Pittman's $2); "Biscuit and coffee" became "Sausage biscuit".

### J. Dead lists
- `TABLES.npc.familyNames`, `traits`, `wants` and `speechQuirks` are gone
  (grep: no reader outside `Tables.npc()`, which nothing in the game calls).
  `firstNames` and `occupations` stay (the person matcher reads them);
  `trinkets` stays. `Tables.npc()` would now produce a broken record if
  called: engine-world should delete it in the cleanup wave.

## What the player sees
- A Thursday in October, with the bar and the pawn shop shut on Sunday and
  the teacher and the students away at school on weekday mornings and
  afternoons (once the engine reads the calendar).
- A flyer at Pittman's and at the bait shop for Tuesday's council vote; the
  agenda on the Town Hall door on Monday; the meeting itself on Tuesday
  evening at Town Hall, decided by who got to Royce first and by what the
  player did; an ending around day 14 to 21.
- A creditor, blackmailer or promise with a number and a day on it, and a
  real cost for missing it.
- A first lead for each background from someone in town, a phone in the
  pocket, and people where their stories say they are.

## README text to fold in (docs pass)
> **The town's calendar.** The story starts on Thursday 8 October 2026, in
> autumn. The Low Water and Byrd's Pawn shut on Sundays; the teacher and the
> three teenagers are at the county school in Clayburn on weekday mornings
> and afternoons. The council votes on the bridge site, and on whether to
> keep the police, at its meeting on Tuesday evening (day 6) at Town Hall.
> The town's story ends around day 14 to 21, when the old bridge is closed or
> saved; you can keep playing after it.
>
> **Loose ends bind and bite.** Each preset loose end is someone in the cast:
> the bet you lost is Curtis Pruett's $400, due three days after he comes to
> collect; the blackmailer wants $200 in two days; the letter you promised to
> deliver is in your pocket. Miss the day and it costs you (your phone, your
> cash, a door at the Low Water, a word to the chief).
>
> **Everyone starts with a prepaid phone** (one bar, by the water tower), and
> someone in town has a first job or question for each background.

BUILD_PLAN "Content notes" to add: flags used by content are listed above
(section G); the council has five members (Jolene, Royce, Lamar, Hollis,
Elbert); the factions run 5, 6 and 8 segments; seeds may carry `effects`,
`requires`, `alt` and `notBeforeDay`, and a location trigger may name several
places.

## Checklist: new fields the engine must read

engine-state (State):
- [ ] `TOWN_DATA.calendar` (`season`, `startDate`) for `State.season()`,
  `State.weekday()`, `State.dateLine()`.
- [ ] `location.closedOn` in `State.isClosed`; `npc.awayOn` in `State.npcsAt`
  and `State.absentNote` (Annette, Kaylee, Austin, Micah).
- [ ] The 13 new ops in `EFFECTS` and `State.EFFECT_OPS` exactly as
  `tests/validate-town.cjs` lists them in `OPS` (the state suite compares the
  two): `playerGold`, `playerHp`, `giveItem`, `takeItem`, `addCondition`,
  `banFrom` (with optional `byNpcId`), `playerPrice`, `addMemory`,
  `clockAdjust`, `threadUpdate`, `addObligation`, `settleObligation`,
  `addNews`. Optional fields per op are in `OPS_OPTIONAL` there.
- [ ] Loose-end obligations: `LOOSE_ENDS[kind].obligations[i]` (lined up
  with `options`, like `link.optionTags`) else `LOOSE_ENDS[kind].obligation`
  (the kind's default, also for words the player wrote). Options stay plain
  strings, so the creation UI is unchanged. Copy it onto the seed as an
  `addObligation` effect with `dueDay = firing day + dueOffset`; `itemName`
  for an errand; `onStart` effects applied when the loose end is tied at
  creation (the letter, "Letter for {npc}", filled with the bound person).
- [ ] Obligation ids: content assumes `obl_<kind>_<npc id>` with the full id,
  for example `obl_debt_npc_curtis` (the council meeting and the epilogue
  read it). If engine-state uses the bare name (`obl_debt_curtis`), tell the
  content side and it changes two strings.
- [ ] `normaliseSeed` keeps `requires`, `alt`, `effects` and
  `notBeforeDay`, and accepts an array of location ids as a location
  trigger's value (the tackle box); `validateShape` must not refuse them.
- [ ] `TABLES.items.goods[].kind`: drinks, food and services are not kept;
  "Night at the motel" is the lodging service.
- [ ] `clockAdjust` on a faction whose clocks are all done, `takeItem` of
  something not carried, and `addMemory` on someone who lives elsewhere
  (Bernice, Dale: a missed promise is remembered by the person who asked)
  should be quiet no-ops or accepted, not rejections: the playtest and
  acceptance suites fail on any rejected diff.
- [ ] Tags read by rules: `elderly`, `teen`, `tough`, `police` (and `armed`
  if wanted; nobody carries it yet).

engine-world (World, Town, Tables):
- [ ] `Town.validate` (in-page): accept the new ops (it reads
  `State.EFFECT_OPS`), clocks of 5 and 8 segments, onComplete `requires` and
  `alt` (their effects too), seed `effects`/`requires`/`alt`/`notBeforeDay`,
  location triggers with an array value, `events`, `epilogue`, `calendar`.
  Until it does, `tests/content.test.cjs` "the inlined town is the only
  town" and `tests/state.test.cjs` "effect ops ... one list" fail on
  `unknown op clockAdjust` and `unknown loc loc_old_bridge,loc_purvis_landing`.
- [ ] `triggerMet` for a location trigger whose value is an array (any of),
  and the same in `dueSeeds` (a place's event waits until the player is at
  that place: any place in the array), `mergePlaces` and the debug list.
- [ ] `requires`/`alt` on seeds and on `onComplete` (CONTRACTS section 3);
  seed `effects` applied on firing; `World.fillEffects` placeholders.
- [ ] Grudge/favour templates: `effects` applied when the seed fires (filled),
  `public` (news when true), `forTags`/`notForTags` when picking a template
  for an NPC (a template whose filters exclude the NPC is never theirs).
- [ ] `TOWN_DATA.events` and `TOWN_DATA.epilogue` (CONTRACTS section 11).
  `when.clockAtLeast { fac_x: n }`: content means the faction's total
  progress (segments filled in its completed clocks plus the active one);
  the one branch that uses it also requires that clock's completion flag
  unset, so "the active clock's filled" reads the same there.
- [ ] `BACKGROUNDS[].hook`: plant it at new game as a hidden seed for the
  hook's NPC with the trigger given, `notBeforeDay = 1 + dayOffset`, effect
  the text with `{player}` filled; the person comes to the player like a
  loose end's. (Shape from the brief: `{ npcId, text, dayOffset: 0|1,
  trigger: { type: 'npc'|'day'|'location', value } }`.)
- [ ] `Tables.npc()` has no word lists left; delete it (no game caller).

prompts:
- [ ] `wouldKnow`: a starting rumour's `tellerIds` know it like its source
  (score 3); `factionId` on a starting rumour as on a clock's; `threadId`
  can reveal the thread when the rumour is heard.
- [ ] `GOSSIP_TAGS` gains `gossip` (Gerald, Pearl, Nadine).
- [ ] CARRYING must stop saying "no phone": every player starts with a
  "Prepaid phone" (one bar by the water tower; the people elsewhere are
  reachable by `reach`).
- [ ] The narrator may use `awayOn.where` and `closedOn` in DESTINATION and
  PLACE lines; the epilogue texts are written as town news in the casual
  voice.

ui:
- [ ] `GOAL_PRESETS` (top-level const in the page script, six strings, at
  most 140 characters each) for the Goal field's suggestions; add it to
  `Game.data` if the UI or tests read it from there (the content test checks
  it matches when present).
- [ ] Places sheet: "Closed Sundays" from `closedOn`; People card/absent note
  from `awayOn.where`.

transport:
- [ ] Nothing new beyond CONTRACTS (news, epilogue turn). The council
  meeting's event fires at day 6 evening; a move to a place shut today is a
  shut door (`closedOn`).

## Seams: what fails in this branch until the others land
- `tests/content.test.cjs` "the inlined town is the only town" and
  `tests/state.test.cjs` "town data passes validation" assert
  `Town.validate(TOWN_DATA)` is empty: it reports `unknown op clockAdjust`
  (engine-state's op) and `unknown loc loc_old_bridge,loc_purvis_landing`
  (the tackle box's two places; engine-world's trigger check).
- `tests/state.test.cjs` "effect ops ... in one list": `validate-town.cjs`
  lists the 26 ops CONTRACTS section 2 names; `State.EFFECT_OPS` has 13.
- `tests/playtest.test.cjs` "a 30+ turn scripted playtest": a clock
  completion's `clockAdjust` is rejected by today's `State.apply`. With the
  `clockAdjust` lines stripped locally, the playtest passes.
- Not failing, but inert until the engine reads them: calendar, closedOn,
  awayOn, requires/alt, seed effects, events, epilogue, hooks, obligations,
  template effects and filters, tellerIds, goods kinds.

## Tests
- `tests/validate-town.cjs`: checks every new field (calendar date and
  season; `closedOn` weekdays and that hours naming a shut day have it;
  `awayOn`, and that teachers and teens have weekday school; public places
  someone is at; rumours 10 to 20 with two tellers each; staggered segments
  4 to 10; `requires`/`alt`; events and epilogue; flags read are flags set;
  the 13 new ops and their fields, with placeholders only in loose ends and
  templates; obligations; templates' effects, filters, no beating by the old,
  the young or the law, no player phone or vehicle; backgrounds' phone and
  hook; goods' kind and no place names; `GOAL_PRESETS`; the `NOBODY` scan).
- `tests/content.test.cjs`: 11 new tests (calendar, schedules, facts,
  nobody made up, loose ends binding in a real game, backgrounds' phone in
  the inventory, grudges and favours, clocks, the council meeting and the
  epilogue, rumours, goods and presets), each with a validator refusal where
  it applies. The cast test now exempts someone whose `awayOn` covers today
  (once `State.weekday` exists).
- `tests/state.test.cjs`, edited because the asserted shape changed by
  design: the contract-shape test accepts `calendar`, `events`, `epilogue`,
  `closedOn`, `awayOn`, `requires`/`alt` on completions, goods `kind`, three
  background items and a `hook`, loose-end `obligation(s)`, template
  `effects`/`public`/`forTags`/`notForTags`, and `TABLES.npc` of
  `firstNames` and `occupations`; the Tables test and the pronoun test no
  longer call `Tables.npc()` (its word lists are gone).
- The state suite's "effect ops ... in one list" test compares
  `validate-town.cjs`'s `OPS` with `State.EFFECT_OPS`: it fails until
  engine-state's 13 ops land, then passes.

## Integration (after the six merges)

- Obligation ids are `obl_<kind>_<npc id>` with the full id, as content
  assumed (`obl_debt_npc_curtis`); nothing in content changed for it.
- Loose ends read `obligations[i]` (lined up with `options`), the kind's
  `obligation` for words the player typed, and apply `onStart` when the loose
  end is tied (the letter is in the pocket from the start).
- `evt_council_meeting` gains `attendees` (Jolene, Royce, Lamar, Hollis,
  Elbert, Chief Bell): they are at Town Hall that evening, so the meeting has
  its people. `tests/validate-town.cjs` accepts the field (ids of people who
  live in town, no repeats).
- `GOAL_PRESETS` is on `Game.data`.
- The validator no longer reads `TABLES.npc.familyNames` (gone).

## Wave 2 (the QA playtest and the second review)

Items: B9 and B18 (content halves), §3.3 and §3.4, the ending's threads and
aftermath, the council's weighting, pronouns in seed texts, Curtis's Friday
game. All data in the content block, checked by `tests/validate-town.cjs`,
tested in `tests/content.test.cjs` (three new tests, two changed).

### The council meeting counts who is free (B9)

- The five seats and how each votes: Jolene (downstream, end the police),
  Lamar (downstream, keep the police), Hollis (in town, end the police),
  Elbert (in town, keep the police), Royce the swing on both.
- Every branch that counts votes names its voters in `when.npcFree`; the
  branch right after each "all five" branch is the same outcome with
  Hollis Byrd's chair empty (he is the one the police clocks can put in the
  cell by Tuesday: 10% of passive games), with the count that makes:
  bought alone passes downstream three to one but the police vote ties and
  fails; the photographs alone tie two to two and go over; both abstentions
  pass downstream two to one. The report-void branches chair the meeting
  with "the mayor's chair empty" (four to nothing, or three to nothing with
  Hollis's chair empty too). The default names nobody: "With empty chairs at
  the table and nobody sure of the count", tabled, police kept. Carter and
  Curtis are in `npcFree` of the branches that have them acting.
- The validator refuses an event branch whose text has someone acting (a
  full name or a name only they have, not an owner's possessive like
  "Hollis Byrd's chair") who is not in its `npcFree`.

### What decides it (the weighting)

Order (first match): the report thrown out; Royce's attitude to the player
at least 30 (he tables it, bought or turned); Curtis's card debt paid (he
lets Royce's marker ride and Royce goes back on whatever he promised); a
bought Royce at least 20 (he abstains: a tie); both bought and turned
(abstains on everything); turned (in town, police ended); bought
(downstream, police ended); Carter close (`clockAtLeast` 4: two more weeks);
undecided. Each with its Hollis-out twin.

The race to Royce is closer: the lease letter (day 3) and the big run when
it goes (day 4) push the Night Run's photographs on (`clockAdjust +1`), and
the engineer's no-show (day 4) sets Carter's money back (`-1`). Simulated
over 80 passive games (seeds fired each phase, as turns fire them):
downstream with the police ended 31% (was 70% over 40 games in the QA
run), downstream with the police kept 15% (Hollis out), in town 19%,
tabled 35%. With Royce at 20 no game ends downstream with the police ended;
at 30 all 40 table it; with Curtis paid all 20 table it.

Attendance is not yet a lever: the engine's conditions have no "the player
is here" (see the engine needs below).

### The ending (§3.3)

- Only the default (which only day 21 reaches) says how long it has been
  ("Three weeks in"); the branches a flag can bring early say nothing of
  weeks, and the police "are finished at the end of the month" (the ending
  comes by October 28). Jolene "has a court date in Clayburn" (true in the
  cell or out of it). "The barriers are up" (not "still up": the ending can
  come the tick they go up). "Carter Sturdivant has the closed bridge he
  paid for" (not "his downstream site", which the council may not have
  given him).
- Branches: report void and police kept; report void and police ended;
  closed and police ended; closed and Curtis's debt missed (Curtis free);
  closed and Loretta at 40 (Loretta free); closed. Each sets
  `thr_bridge_vote` and `thr_police_vote` resolved (the town kept it) or
  failed (it lost it), with `knownToPlayer: true` and a summary. The
  default leaves the bridge open and settles the police by a seed the next
  day (`requires` the dissolution flag: failed; `alt`: resolved).
- Each plants two or three aftermath seeds, so the town keeps moving: a
  state crew under the bridge (day 23), Chief Bell turning to the pills at
  Town Hall (Nikki if he is gone; makes the pills thread known), Carter
  offering cash, the police office half packed, Wade planning the first run
  without police, the deputy from Clayburn on the last day of October (day
  24), Loretta asking who wants to buy a bar, Curtis calling the four
  hundred square for two hundred, Royce's sign at Pittman's, Loretta's
  stool, a public hearing in Clayburn, Elbert on the bench, the barriers
  chained.
- The validator: an epilogue branch may resolve a thread (only the ending:
  clocks, seeds and events still may not); it must set a thread resolved or
  failed, plant two or three seeds, and not say how long it has been; seeds
  the ending plants may wait for a day from 21 to 30 (`ENDING_DAYS`), and
  the ending must come by day 21.

### The big run waits on the boats (§3.4)

- "Catch a boat at the ramp" sets `boatsPulledUp` in both its outcomes (it
  replaces `coltArrested` in the main one: nothing read it, Colt's arrest is
  his status, and a completion holds five effects).
- `seed_big_run` requires Chief Bell, Wade and Colt free and
  `boatsPulledUp` unset; its alt: the cartons stacked in the bait shop and
  the run not gone.
- `seed_overdose`'s alt says Trent "has been selling Colt's pills for him"
  (true with Trent in the cell too).

### Obligations say what happens when they are missed (B18)

- Every loose-end obligation has `missText`: the due event when its day
  goes by, in place of "<name> came looking: <the task>". Debts: the
  creditor came and took the phone, the cash, or the Low Water's door;
  blackmail: the blackmailer has told Chief Bell and comes by to say so;
  the letter: it is still in the pocket; the promises: the day came and
  went.
- `owedTo`: the person owed when it is not the person the loose end binds:
  the letter and the daughter brought home are owed to Bernice Ogletree,
  the look-in to Dale Purvis (both live elsewhere, so nobody comes looking).
  The validator requires it on an errand.
- The person owed remembers a miss: every `onMiss` has an `addMemory` for
  them (new: the $400 default debt, the title loan Leon collected, the
  blackmailer, the default promise).

### Pronouns, "you", and the Friday game

- Loose-end seeds no longer call the person "they": the enemy says "the
  waiting is over", the lost-one lead says "there is something to tell".
  Templates: a phone pulled out (not "their own phone"), an alibi for the
  whole night (not "with them"), something going on in town (not "something
  they saw"), "is a creep" (not "gives them the creeps").
- The five loose-end seeds are told to the player: "{npc} walks up to you,
  reads your name off a folded paper" (no `{player}`), so the due event
  reads the same in the packet and the narration. The validator requires
  "you" and refuses `{player}` there. Hooks and templates keep `{player}`
  (the mock tells them as "you", see prompts.md).
- Curtis's hook already named "his Friday night game at the back table of
  the Low Water"; the mock deals the game there on a Friday ("At Curtis
  Pruett's Friday game at the back table, ..."). A town event for the first
  Friday was tried and left out: it adds a bookkept scene to a narrator-only
  turn, which `tests/playtest.test.cjs`'s cost measure ("one bookkeeping
  call per parsed turn") refuses, and town news every Friday is noise.

### Engine needs (other agents)

1. Attendance. `World.conditionsMet` (and `Town.validate`'s `checkWhen`)
   gain `playerAt: "<locationId>"`: true when `State.current.player.
   locationId === playerAt` when the condition is read (for an event, the
   tick that fires it). For the council meeting it must be the player's
   place at the start of that evening: a move that crosses into the evening
   moves the player before `World.tick` fires the event. Content will then
   add, before the bought branches, `{ playerAt: "loc_town_hall",
   attitudeAtLeast: { npc_royce: 15 }, npcFree: [...] }` (Royce sees a
   friendly face in the room) and its Hollis-out twin; the validator's
   `checkWhen` adds the key.
2. `missText` and `owedTo`. `Town.resolveLooseEnd` copies both into the
   `addObligation` effect (`missText` filled like `text`; `owedTo` filled,
   so "{npcId}" becomes the bound id; absent means the bound person).
   `State` `addObligation` keeps them (`missText` cleaned to 300
   characters; `owedTo` an npc id), and `validateShape`/import accept them.
   `World.missedObligations`: the news line and the due event are
   `o.missText` when set (else today's "came looking" line); the person
   brought to the player is `owedTo`'s, only if free and living in town
   (`presence` "here"); otherwise the due event is told with nobody
   brought. `Upgrade`'s obligation copy (`anArc`) copies both too.
3. The epilogue's `threadUpdate ... status: "resolved"` pays a story point
   and the thread's reward (if known): content assumes that is wanted at the
   ending. After the ending, the recap should say the story has reached an
   ending rather than repeating.
4. `TABLES.complications`: "{witness} recognizes you from somewhere"
   contradicts the knowledge rule (nobody knew the player before day 1):
   reword as "{witness} sees it, and will know your face from now on" or
   drop it (the review's risk; the table is the engine's to change).
5. B9's engine half: one news item per event (the branch text and its
   `addNews` both land today), and news told in front of the player is not
   told again overnight.

## Integration (wave 2)

- Engine needs 1 and 2 are in. `playerAt` is read by `World.conditionsMet`
  (false for a phase slept or waited through elsewhere, or jumped over), by
  `Town.validate` and by `validate-town.cjs` (a town place on the map). The
  council meeting has the attendance pair, placed before the bought
  branches: Royce at 15 or more with the player at Town Hall tables the
  bridge (three to two, police kept, Carter set back a segment), and its
  Hollis-out twin (two to two, over to the next meeting; police kept three
  to one). Passive games never reach it.
- `owedTo` and `missText` ride from `LOOSE_ENDS` through `Town.obligationFor`
  onto the obligation; the miss's due event is `missText` (with nobody
  brought when the person owed lives elsewhere), and its news is the
  obligation's own `onMiss` addNews when it has one, so a miss is told once.
- Need 4: the complication now reads "{witness} sees it, and will know your
  face from now on".
- Two background hooks named the player and then "they" ("asks where they
  served", "which boats they worked"); they name the player twice now, so
  the mock tells them as "you".
- `tests/content.test.cjs`, changed by design: the live meeting reads the
  branch's own news (the engine tells an event once, by its addNews, not by
  its text as well); the validator test also refuses a `playerAt` that is
  no place.

## Wave 3

The second playtest's N13, N14, N16 and Nadine's hook. Checked by
`tests/validate-town.cjs` and `tests/mentions.cjs`; tested in
`tests/wave3-fixes.test.cjs`.

- `seed_after_packing`: "Glenda Pryor" (was "Glenda Gentry", nobody).
  `tests/mentions.cjs` now refuses a "First Last" pair of one person's first
  name and another's family name that is nobody's name (`PAIR_ALLOW`: Mavis
  Crocker, Jodie Ogletree, names used on purpose); the validator reports it.
- The hustler's hook invites `{player}` (was "them"), so the mock tells it
  as "you".
- The Shayla Rawls grudge says the player's story about where they came from
  does not add up (no "they say they are").
- Nadine's hook asks the player to come by the Parsonage for supper on
  Wednesday evening (she is there then; nothing happens at the church).
- The debt `onMet` memories still say "in full and on time"; the engine
  rewrites them as late when the debt is paid after it was missed
  (engine-state.md, Wave 3).

## Wave 4

The third playtest's R6, R10, R11 and the README's ending. Checked by
`tests/validate-town.cjs`; tested in `tests/wave4-fixes.test.cjs`.

- Every grudge template says what kind of answer it is (`kind`: violence,
  police, gossip, money, ban; World.grudgeKind reads it). The rumour that
  the player "has been talking to the police" is gossip, not the police.
  The validator requires a kind on a grudge, and a violent one hurts the
  player; `state.test.cjs`' contract shape allows the key (changed by
  design).
- `seed_tackle_box` leaves the tackle box where the player finds it
  (`placeItem`, a new effect op: engine-state.md), so it can be picked up.
- Loose ends: the secret's seed "gets you to one side" (was "catches you
  alone") and the lost seed "draws you aside" (was "finds you alone"): the
  person may come into a crowd. `content.test.cjs`' fixture follows.
- The default ending closes the bridge thread as failed ("nobody settled the
  bridge while there was time"), so every ending settles the bridge and the
  police threads, as the README says.
- Nadine's hook needs no change: a due event that names a place in town not
  found yet reveals it (engine-world.md, Wave 4).

## Wave 5

The round-4 playtest's Q6, Q9, Q13 and design notes. Checked by
`tests/validate-town.cjs`; tested in `tests/wave5-fixes.test.cjs`.

- **The ending settles the police both ways** (Q6): the open-bridge ending
  is two now, a branch for a council vote that ended the police (police
  thread failed, "Nothing is settled.": it can come before day 21) and the
  default, which keeps them "for now" (police thread resolved).
  `seed_after_police_word` is gone. The validator allows seven branches.
- **The council keeps the police, the thread is resolved** (design note):
  every meeting branch that keeps the police resolves `thr_police_vote`.
  The validator lets a town event's branch settle a thread (`settles`).
- **The swing vote** (design note): "Buy the swing vote" needs
  `royceTurned` unset and "Turn the swing vote" `royceBought` unset; their
  alternatives (the vote taken, or the other side got to Royce first) tell
  Royce taking the note without a word or refusing to be pushed, and never
  ask for the bridge vote again (Q9: it may be shut).
- **The repo man's seizure counts** (design note): the title-loan note's
  `onMiss` takes up to $150 with `obligationPaid` (`"{obligationId}"`),
  credited against the note.
- **An enemy follows up** (design note): `LOOSE_ENDS.enemy.followUp`, three
  to five days after the first beat: two blows (-2 HP, Bruised ribs), a
  memory; its alt: they pass close and keep walking. The validator checks
  a `followUp`.
- **The beating grudge** (Q13) is "gets {player} away from the others for a
  minute", not "alone after dark" (told in any phase, in a crowd).
- Q9's plans after the ending are the engine's (engine-world.md, Wave 5).

## Wave 6

The round-5 playtest's R3 and its design note. Checked by
`tests/validate-town.cjs`; tested in `tests/wave6-fixes.test.cjs`.

- **What someone did to the player** (R3): the memories content writes of
  what a person did to the player carry `act: "own"`, so no grudge grows
  from them and none is read as the player's offence: the enemy's
  follow-up ("Put {playerName} against a wall and hit them twice …"), the
  lender's and the repo man's seizures ("so I took … the phone"), the
  bookie's ("I made sure Loretta heard"), the blackmailer's ("so I told
  Chief Bell"). The validator allows `act` on `addMemory`, only `"own"`.
- **A beating is reported as a beating** (design note): the grudge
  template that tells Chief Bell the player "was seen hanging around where
  things went missing" answers a theft only (`about: ["theft"]`); a new one,
  added last so a seed keeps its template by index, "goes to Chief Bell
  about what {player} did to them" (`about: ["violence"]`, police, not for
  the police). The validator allows `about` on a grudge template (violence,
  theft or insult). 14 grudges now. `tests/state.test.cjs` follows (changed
  by design: a template may carry `about`).
- The ending's threads hold their reward until the ending is told
  (engine-state.md, Wave 6): `tests/content.test.cjs` follows (changed by
  design: the story point comes once the ending's news is seen).
