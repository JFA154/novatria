# Low Water: the comments of the old content block

Wave 37, Creator Mode. The town used to be eight JavaScript constants between
`// ===== BEGIN CONTENT =====` and `// ===== END CONTENT =====` in index.html
(lines 1690 to 6532 of 74cd698:index.html). It is now
`packs/low-water.json`, and JSON has no comments. These are every comment that block held,
with its line in 74cd698:index.html, the key path written last before it ("after") and
the key path it sits above ("before"; most comments explain that one). Field semantics
move to docs/CREATOR_GUIDE.md in milestone 9 (plan decision A). Written once by
`tests/pack-extract.cjs`; edit freely.

37 comments (115 counting each // line on its own).

## The header above the block (line 1682)

```js
/* ==========================================================================
   CONTENT: the town of Lockett's Ferry (present day) and the character-creation data
   (TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES,
   FAVOUR_TEMPLATES), following docs/BUILD_PLAN.md "Shared data contract".
   This block is meant to be edited by hand. After editing, run
   node tests/validate-town.cjs: it reads the text between the BEGIN and END
   CONTENT markers and checks every field and cross-reference.
   ========================================================================== */
```

## Line 1691, before `TOWN_DATA`

After `(start of block)`.

```js
// ===== Content: Lockett's Ferry (present day) =====
// Authored town data for the one-town RPG, modern setting. Plain data only:
// double-quoted strings, no functions, plain ASCII. Edit by hand, then
// validate with:
//   node tests/validate-town.cjs
```

## Line 1697, before `TOWN_DATA`

After `(start of block)`.

```js
// ===== TOWN_DATA =====
```

## Line 1703, before `TOWN_DATA.romance`

After `TOWN_DATA.startLocationIds.docks`.

```js
/* Wave 29, retuned in wave 34: how each person takes to the player's
     interest (Rel.tuningOf; design Appendix E, for the owner to edit).
     Every adult can be interested in the player whether listed here or
     not (Rel.eligible: nobody under 18, and nobody at all for a player
     under 18; the validator refuses anyone under 18 here). An entry only
     makes someone easier or harder: sparkRate (0.1 to 2) scales a welcome
     flirt's spark (10 x the rate); opensAt.knows is how well they must
     know the player before a flirt is even taken as one; difficulty (easy,
     normal, hard, very_hard) is the charm roll a flirt makes with them,
     easier as they warm to it. Anyone not listed: sparkRate 0.5, opensAt
     knows 10, hard (Rel.ROMANCE_DEFAULTS). faithful: true still reads as
     very_hard. Curtis is separated (Lynette put him out in December 2025). */
```

## Line 1729, before `TOWN_DATA.policeHead`

After `TOWN_DATA.romance[11].difficulty`.

```js
// Wave 27: whom a report goes to when it goes to the police (Rel.policeHead; else the first police chief in the cast).
```

## Line 1731, before `TOWN_DATA.policeFallback`

After `TOWN_DATA.policeHead`.

```js
// Wave 28: the law outside town when the town's own cannot hear it (Rel.policeFallback): the county sheriff in Clayburn.
```

## Line 1733, before `TOWN_DATA.ties`

After `TOWN_DATA.policeFallback`.

```js
/* Wave 31: how people feel about each other beyond what their relations
     say (design Appendix B; Rel.tiesPlan). Every relation is a tie both
     ways already, with its kind's liking and trust (w, t); an entry here
     sets one side's numbers (an override: the kind stays the relation's)
     or adds a tie the relations lack (kind: lover, enemy, payer, other).
     hidden: the town does not know of it, and revealedBy says what would
     let the player find it out (a rumour heard, a flag set; a leverage
     record whose words name it does too). News travels through a hidden
     tie all the same, and nobody says why. */
```

## Line 1806, before `TOWN_DATA.secretTies`

After `TOWN_DATA.ties[61].t`.

```js
/* Wave 32: what a secret told does between people (design Appendix C;
     Rel.secretTiesFor, State's exposeTo). When the player tells learnedBy
     what they hold over secretOf, each tie listed moves by w and t (liking,
     trust) on a line of its log the player was there for, and the tie is
     known; seed is what it sets going ({ effect, dayOffset }: a day or two
     on). One entry a secret and a listener; the one the secret was about
     hears who told by the tie between them. */
```

## Line 1842, before `TOWN_DATA.calendar`

After `TOWN_DATA.year`.

```js
// Day 1 is Thursday 8 October 2026 (CONTRACTS section 1): the weekday and the season come from here.
```

## Line 1858, before `TOWN_DATA.map`

After `TOWN_DATA.recent[10].what`.

```js
// The town map in the Places tab (an SVG in viewBox units; see docs/BUILD_PLAN.md, "Map").
// Each location below has map: { x, y, label, anchor }; roads between places are drawn from exits.
```

## Line 4343, before `TOWN_DATA.factions`

After `TOWN_DATA.npcs[65].status`.

```js
// Three factions on staggered clocks (police 5 segments, Sturdivant 6, the
// Night Run 8), so their completions spread out over three weeks. Each
// completion may carry requires and alt (CONTRACTS section 3): what must
// still be true when it lands, and what happens instead, so the texts hold
// in either order. clockAdjust sets a rival back (or forward).
```

## Line 4738, before `TOWN_DATA.threads`

After `TOWN_DATA.factions[2].relations.fac_police`.

```js
// reward: the stat the player gains the first time they resolve the thread (CONTRACTS section 9).
```

## Line 4769, before `TOWN_DATA.seeds`

After `TOWN_DATA.threads[2].reward`.

```js
// Starting seeds. effects apply when a seed fires; requires and alt keep
// its text true in either order (CONTRACTS section 3); notBeforeDay holds a
// seed back (the tackle box can be found from the landing, a start place).
```

## Line 4859, before `TOWN_DATA.seeds[6].effects`

After `TOWN_DATA.seeds[6].effect`.

```js
// There to be taken from where the player found it (wave 4, playtest R10).
```

## Line 4868, before `TOWN_DATA.seeds[7].id`

After `TOWN_DATA.seeds[6].hidden`.

```js
// Wave 27: someone in trouble the player can step in on (danger: the people its words name after the first, the one doing it,
// are in danger there for this phase and the next; a successful action aimed at them, or an attack on the one doing it, rescues them).
```

## Line 4905, before `TOWN_DATA.rumours`

After `TOWN_DATA.seeds[9].hidden`.

```js
// The town's talk at the start. threadId: the thread it bears on (hearing
// it can reveal that thread); factionId: whose people know it; tellerIds:
// the people besides the source who can pass it on.
```

## Line 4931, before `TOWN_DATA.events`

After `TOWN_DATA.rumours[19].heard`.

```js
// Town events (CONTRACTS section 11): the council meeting on Tuesday,
// day 6, in the evening at Town Hall. The first branch whose when holds is
// what happens; its news is public. clockAtLeast counts the segments a
// faction has filled in all its clocks so far. obl_<kind>_<npc id> is the
// obligation a loose end made (CONTRACTS section 4). attendees: the people
// who are at the place for that phase when it happens (the five council
// seats and the chief whose department is on the agenda), if they are free.
// The five seats: Jolene (the mayor: downstream, end the police), Lamar
// (downstream, keep the police), Hollis (in town, end the police), Elbert
// (in town, keep the police) and Royce, the swing on both. Every branch
// that counts votes names who votes and needs them free (npcFree); the
// branch after it is the same outcome with Hollis Byrd's chair empty (he
// is the one the police clocks can lock up by Tuesday), and the default
// counts nobody. What the player can move: the report thrown out (the
// police clocks), Royce's feeling for the player (30: he tables it; 20: a
// Royce who sold his vote abstains), Curtis Pruett's card debt paid.
```

## Line 5223, before `TOWN_DATA.epilogue`

After `TOWN_DATA.events[0].default.effects[5].public`.

```js
// The ending (CONTRACTS section 11): told on day 21, or as soon as the
// bridge story is decided (the barriers go up, or the state orders a
// second inspection), so a text never says how long it has been except
// the default, which only day 21 reaches. The first branch whose when
// holds; then the player can keep playing. Each ending settles the two
// vote threads (resolved when the town kept what the thread was about,
// failed when it lost it) and plants what happens next, so the town does
// not stand still afterwards: seeds planted here may wait for a day after
// the latest ending (21 to 30).
```

## Line 5495, before `TABLES`

After `TOWN_DATA.epilogue.default.effects[3].seed.hidden`.

```js
// ===== TABLES =====
```

## Line 5555, before `TABLES.items.goods`

After `TABLES.items`.

```js
// What the player can buy, priced as the places' details say. kind
// (CONTRACTS section 7): a good is carried; a drink, a food or a service is
// had on the spot and never kept in the inventory ("Night at the motel"
// is the lodging). Names never say where: you buy it where you are.
```

## Line 5624, before `TABLES.complications`

After `TABLES.items.trinkets[0]`.

```js
/* What a partial costs and how a failure turns (Dice.complication picks
     one that fits; the engine's table, docs/notes/engine-world.md). tiers:
     partial (a cost), failure (a twist), both. kinds: social, physical,
     stealth, any (Dice.COMPLICATION_KIND maps action types to kinds).
     needsPerson: only rolled with someone present, who is {witness} in the
     text and "{witnessId}" in the effects; notDay1: not on the first day.
     effects run through State.apply when the pipeline applies the roll.
     Nobody here is made up: a person is always someone in the scene. */
```

## Line 5695, before `BACKGROUNDS`

After `TABLES.weather.winter[0]`.

```js
// ===== BACKGROUNDS =====
// Each background carries two things of its own and a cheap prepaid phone
// (one bar by the water tower, so the people who live elsewhere can be
// reached). hook: the first lead the town offers this kind of stranger,
// from someone in the cast (npcId), told when the trigger meets (an npc
// trigger fires when the player is with that person), not before day
// 1 + dayOffset.
```

## Line 5825, before `FLAWS`

After `BACKGROUNDS[5].hook.trigger.value`.

```js
// ===== FLAWS =====
```

## Line 5837, before `LOOSE_ENDS`

After `FLAWS[0]`.

```js
// ===== LOOSE_ENDS =====
// Every loose end binds to a person in the cast above: link.tag names the
// people it can be (the first free one not already tied to the player, drawn
// by the seeded dice), and optionTags, one per preset option, narrow it when
// the player keeps that option's words (a note sold to someone here is the
// repo man, a lost bet is the man who runs the card game, a letter for a
// daughter is the waitress who is not who she says). The game never makes a
// person for a loose end. When its seed fires, the person comes to the
// player, wherever they are.
// obligation / obligations (CONTRACTS section 4): what the loose end binds
// the player to, made when the seed fires, due dueOffset days later.
// obligations lines up with options (like optionTags); obligation is the
// kind's own, for an option and for words the player wrote. onStart applies
// when the loose end is tied at character creation (the letter an errand
// delivers). Placeholders: {npcId}, {npc} (their name) and {playerName}.
// An obligation (CONTRACTS section 4) may also carry missText, what happens
// when its day goes by (the due event and its news, in place of "came
// looking: <the task>"; placeholders as in its effects), and owedTo, the
// person it is owed to when that is not the person it binds: the woman who
// wrote the letter, not the daughter it is for, who does not know it exists.
// Nobody who lives elsewhere comes looking; the person owed gets the memory.
```

## Line 5949, before `LOOSE_ENDS.enemy.followUp`

After `LOOSE_ENDS.enemy.seed.trigger`.

```js
// Wave 5 (the round-4 playtest): three to five days after that, while the loose end is open and they still hold it against you, they come for you.
```

## Line 6081, before `GRUDGE_TEMPLATES`

After `LOOSE_ENDS.promise.obligations[2].onMet[1].weight`.

```js
// ===== GRUDGE_TEMPLATES =====
// What someone with a grudge does about it. effect: the text the narrator
// gets when it fires; kind: what sort of answer it is (violence, police,
// gossip, money or ban: a grudge answers in kind, World.grudgeKind);
// effects: what it does to the player, in code (CONTRACTS section 2);
// public: whether the town hears of it. forTags: only someone
// with one of these tags holds it; notForTags: nobody with one of these. The
// old, the young and the law never beat anyone (the law uses its own ways),
// and nobody assumes the player has a phone or a vehicle.
```

## Line 6094, before `GRUDGE_TEMPLATES[0].about`

After `GRUDGE_TEMPLATES[0].kind`.

```js
// Wave 6 (the round-5 playtest's design note): a theft's answer; a beating is reported as what it was (the next).
```

## Line 6169, before `GRUDGE_TEMPLATES[7].effect`

After `GRUDGE_TEMPLATES[6].notForTags[0]`.

```js
// Wave 32: the gossip goes along {npc}'s own ties (propagate), not to a fixed list.
```

## Line 6181, before `GRUDGE_TEMPLATES[8].effect`

After `GRUDGE_TEMPLATES[7].notForTags[0]`.

```js
// Wave 32: the people close to {npc} hear it (propagate), not a fixed pair.
```

## Line 6214, before `GRUDGE_TEMPLATES[11].effect`

After `GRUDGE_TEMPLATES[10].forTags[0]`.

```js
// Wave 32: the department is whoever {npc} works with (propagate along their ties).
```

## Line 6236, before `GRUDGE_TEMPLATES[13].effect`

After `GRUDGE_TEMPLATES[12].notForTags[0]`.

```js
// Wave 6 (the round-5 playtest's design note): a beating reported as what it was (added last: a seed keeps its template by index).
```

## Line 6248, before `GRUDGE_TEMPLATES[14].effect`

After `GRUDGE_TEMPLATES[13].notForTags[0]`.

```js
/* Wave 27: a report, someone the player has frightened or hurt telling
     whoever looks out for them (World's plantReport, never a grudge's
     template; added last: a seed keeps its template by index). to: whom it
     goes to (police, or family for a parent, a boss or anyone else); about:
     what it is about (a threat or violence). {protector} and {protectorId}
     are that person; the engine runs the effects once for each protector,
     with the template that suits them. */
```

## Line 6299, before `GRUDGE_TEMPLATES[18].effect`

After `GRUDGE_TEMPLATES[17].public`.

```js
/* Wave 28: a parent or grandparent telling the police that the player came
     on to their child (World.minorAdvance), and someone telling whoever looks
     out for them that the player tried to force them (World.coercion). */
```

## Line 6335, before `GRUDGE_TEMPLATES[21].effect`

After `GRUDGE_TEMPLATES[20].public`.

```js
/* Wave 29: what someone does with what they hold over the player
     (World.plantHolders, each on a draw of its own, once a record). tell,
     at liking -60 or less: they tell it to whoever it matters to (the
     record spent; told_anyway for each of them). price, a mercenary holder
     at liking 10 or less: a blackmail of {price} ($50 a weight), due in two
     days, on the record ({leverageId}): paid, they keep quiet; missed, they
     tell. */
```

## Line 6365, before `FAVOUR_TEMPLATES`

After `GRUDGE_TEMPLATES[22].public`.

```js
// ===== FAVOUR_TEMPLATES =====
// What someone who likes the player does for them; the same fields as the
// grudges. A favour is private unless it says otherwise.
```

## Line 6413, before `FAVOUR_TEMPLATES[4].needs`

After `FAVOUR_TEMPLATES[4].forTags[0]`.

```js
// Wave 28: a favour that has to be believed needs trust (Rel.meets; World.templateFits).
```

## Line 6484, before `FAVOUR_TEMPLATES[12].effect`

After `FAVOUR_TEMPLATES[11].notForTags[0]`.

```js
/* Wave 29: someone the player owes a favour asks for it back
     (World.owedAsk: after five days unpaid, again three days later; never
     an ordinary favour), by their tags, else the plain one. */
```

## Line 6519, before `GOAL_PRESETS`

After `FAVOUR_TEMPLATES[14].notForTags[0]`.

```js
// ===== GOAL_PRESETS =====
// One-line goals the character creation form offers as suggestions, each
// tied to one of the town's threads.
```
