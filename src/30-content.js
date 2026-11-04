// ===== BEGIN CONTENT =====
// ===== Content: Lockett's Ferry (present day) =====
// Authored town data for the one-town RPG, modern setting. Plain data only:
// double-quoted strings, no functions, plain ASCII. Edit by hand, then
// validate with:
//   node tests/validate-town.cjs

// ===== TOWN_DATA =====
const TOWN_DATA = {
  name: "Lockett's Ferry",
  setting: "Lockett's Ferry is a river town of about eight hundred people where the state highway drops off the bluff and crosses the Lusk River on a narrow green steel bridge built in 1938. The state line runs down the middle of the river, the county on the far side is dry and taxes cigarettes hard, and for as long as anyone can remember, cartons and cases have gone across at night, by johnboat from Purvis Landing or in pickups light enough for the bridge's five-ton limit. Now the state has rated the bridge critical and will pay for one new crossing, either here or five miles downstream on Sturdivant land, and the town council votes on the site next Tuesday. Carter Sturdivant wants it downstream, the Night Run wants the old bridge open and the river dark, and the three-officer police department needs an arrest big enough to stop the mayor disbanding it. Cell signal is patchy in the valley, one bar if you stand by the water tower on the hill, so business here is done face to face: at the bar, at the pumps, at the ramp. People tell stories about what the river takes, but nobody you would believe has ever seen anything in it but mud and catfish.",
  currency: { symbol: "$", name: "dollars" },
  startLocationIds: { gate: "loc_pittmans", docks: "loc_purvis_landing" },
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
  romance: [
    { npcId: "npc_jodie", sparkRate: 1.2, opensAt: { knows: 20 }, difficulty: "easy" },
    { npcId: "npc_shayla", sparkRate: 1.5, opensAt: { knows: 0 }, difficulty: "easy" },
    { npcId: "npc_travis", sparkRate: 1.2, opensAt: { knows: 0 }, difficulty: "normal" },
    { npcId: "npc_curtis", sparkRate: 1.0, opensAt: { knows: 10 }, difficulty: "normal" },
    { npcId: "npc_trent", sparkRate: 1.0, opensAt: { knows: 10 }, difficulty: "normal" },
    { npcId: "npc_nikki", sparkRate: 0.8, opensAt: { knows: 20 }, difficulty: "normal" },
    { npcId: "npc_annette", sparkRate: 0.7, opensAt: { knows: 25 }, difficulty: "normal" },
    { npcId: "npc_carter", sparkRate: 1.0, opensAt: { knows: 10 }, difficulty: "normal" },
    { npcId: "npc_lamar", sparkRate: 0.6, opensAt: { knows: 30 }, difficulty: "normal" },
    { npcId: "npc_glenda", sparkRate: 0.8, opensAt: { knows: 20 }, difficulty: "normal" },
    { npcId: "npc_colt", sparkRate: 1.2, opensAt: { knows: 0 }, difficulty: "normal" },
    { npcId: "npc_tyler", sparkRate: 0.8, opensAt: { knows: 15 }, difficulty: "normal" }
  ],
  // Wave 27: whom a report goes to when it goes to the police (Rel.policeHead; else the first police chief in the cast).
  policeHead: "npc_marcus",
  // Wave 28: the law outside town when the town's own cannot hear it (Rel.policeFallback): the county sheriff in Clayburn.
  policeFallback: "npc_hoyt",
  /* Wave 31: how people feel about each other beyond what their relations
     say (design Appendix B; Rel.tiesPlan). Every relation is a tie both
     ways already, with its kind's liking and trust (w, t); an entry here
     sets one side's numbers (an override: the kind stays the relation's)
     or adds a tie the relations lack (kind: lover, enemy, payer, other).
     hidden: the town does not know of it, and revealedBy says what would
     let the player find it out (a rumour heard, a flag set; a leverage
     record whose words name it does too). News travels through a hidden
     tie all the same, and nobody says why. */
  ties: [
    { from: "npc_mavis", to: "npc_dewayne", w: 30, t: 20 },
    { from: "npc_dewayne", to: "npc_mavis", w: 50, t: 60 },
    { from: "npc_darlene", to: "npc_royce", w: 10, t: -40, why: "She has known about Royce Pittman and Loretta Gaddis for years." },
    { from: "npc_royce", to: "npc_darlene", w: 20, t: 30 },
    { from: "npc_vada", to: "npc_carter", w: 40, t: -50, why: "She loves her son and does not trust him with the bottomland." },
    { from: "npc_carter", to: "npc_vada", w: 10, t: -20 },
    { from: "npc_gerald", to: "npc_jolene", w: 60, t: -30, why: "He found her envelope of cash in the chest freezer." },
    { from: "npc_wade", to: "npc_colt", w: 70, t: -20 },
    { from: "npc_lorna", to: "npc_colt", w: 70, t: 30 },
    { from: "npc_trent", to: "npc_colt", w: 60, t: 40 },
    { from: "npc_colt", to: "npc_trent", w: 60, t: 40 },
    { from: "npc_lorna", to: "npc_wade", w: 70, t: 50 },
    { from: "npc_glenda", to: "npc_marcus", w: 60, t: 50 },
    { from: "npc_nikki", to: "npc_marcus", w: 10, t: 10 },
    { from: "npc_marcus", to: "npc_travis", w: -10, t: -60, why: "He knows Travis Cagle takes Night Run money." },
    { from: "npc_marcus", to: "npc_nikki", w: 20, t: 40 },
    { from: "npc_shayla", to: "npc_travis", w: 20, t: -40 },
    { from: "npc_odessa", to: "npc_vada", w: 80, t: 60 },
    { from: "npc_vada", to: "npc_odessa", w: 60, t: 80 },
    { from: "npc_vada", to: "npc_lamar", w: 20, t: 40 },
    { from: "npc_lamar", to: "npc_vada", w: 20, t: 10 },
    { from: "npc_dwight", to: "npc_carter", w: 30, t: 50 },
    { from: "npc_loretta", to: "npc_tammy", w: 60, t: 60 },
    { from: "npc_tammy", to: "npc_loretta", w: 60, t: 60 },
    { from: "npc_tammy", to: "npc_austin", w: 90, t: 60 },
    { from: "npc_ray", to: "npc_micah", w: 80, t: 50 },
    { from: "npc_nadine", to: "npc_micah", w: 80, t: 50 },
    { from: "npc_micah", to: "npc_ray", w: 60, t: 40 },
    { from: "npc_micah", to: "npc_nadine", w: 60, t: 40 },
    { from: "npc_glenda", to: "npc_elbert", w: 80, t: 60 },
    { from: "npc_brianna", to: "npc_tyler", w: 60, t: 50 },
    { from: "npc_tyler", to: "npc_brianna", w: 60, t: 50 },
    { from: "npc_curtis", to: "npc_lyman", w: 50, t: 40 },
    { from: "npc_lyman", to: "npc_curtis", w: 40, t: 20 },
    { from: "npc_loretta", to: "npc_royce", kind: "lover", w: 80, t: 70, hidden: true, revealedBy: { rumours: ["rum_royce_photos", "rum_royce_revote"] }, why: "She has been seeing Royce Pittman on Tuesday afternoons for eleven years." },
    { from: "npc_royce", to: "npc_loretta", kind: "lover", w: 70, t: 60, hidden: true, revealedBy: { rumours: ["rum_royce_photos", "rum_royce_revote"] }, why: "He has been seeing Loretta Gaddis for eleven years." },
    { from: "npc_darlene", to: "npc_loretta", kind: "enemy", w: -70, t: -60, hidden: true, revealedBy: { rumours: ["rum_royce_photos", "rum_royce_revote"] }, why: "She keeps a folder of dates and photographs on Loretta Gaddis and her husband." },
    { from: "npc_tammy", to: "npc_colt", kind: "enemy", w: -90, t: -90, hidden: true, revealedBy: { rumours: ["rum_colt_pills"] }, why: "She knows the bottle Amber Lott died with came from Colt Purvis." },
    { from: "npc_austin", to: "npc_colt", kind: "enemy", w: -90, t: -90, hidden: true, revealedBy: { rumours: ["rum_colt_pills"] }, why: "He has followed Colt Purvis on his bike for weeks." },
    { from: "npc_boyd", to: "npc_wade", kind: "enemy", w: -90, t: -90, hidden: true, revealedBy: { flags: ["boydCameForWade"] }, why: "He came to town for Wade Purvis." },
    { from: "npc_wade", to: "npc_travis", kind: "payer", w: 10, t: 20, hidden: true, revealedBy: { rumours: ["rum_travis_boat"] }, why: "He pays Travis Cagle to park at the motel during the runs." },
    { from: "npc_travis", to: "npc_wade", kind: "payer", w: 20, t: 10, hidden: true, revealedBy: { rumours: ["rum_travis_boat"] }, why: "He takes Wade Purvis's money every week." },
    { from: "npc_carter", to: "npc_jolene", kind: "payer", w: 10, t: 40, hidden: true, revealedBy: { rumours: ["rum_motel_envelope"] }, why: "He pays Jolene Overstreet five hundred dollars a month." },
    { from: "npc_jolene", to: "npc_carter", kind: "payer", w: -10, t: 10, hidden: true, revealedBy: { rumours: ["rum_motel_envelope"] }, why: "She takes Carter Sturdivant's envelope every month." },
    { from: "npc_royce", to: "npc_carter", kind: "other", w: -20, t: -30, hidden: true, revealedBy: { rumours: ["rum_royce_note"] }, why: "Carter Sturdivant holds the note on his station." },
    { from: "npc_curtis", to: "npc_royce", kind: "other", w: 10, t: -10, hidden: true, revealedBy: { flags: ["royceOwesCurtis"] }, why: "Royce Pittman owes him eleven hundred dollars from the card game." },
    { from: "npc_brianna", to: "npc_colt", kind: "other", w: -20, t: -30, hidden: true, revealedBy: { rumours: ["rum_colt_pills"] }, why: "She still owes Colt Purvis forty dollars for the pills." },
    { from: "npc_june", to: "npc_brianna", kind: "other", w: 40, t: 20, hidden: true, revealedBy: { flags: ["juneOverdoses"] }, why: "She brought Brianna Tolliver back from an overdose this fall." },
    { from: "npc_wade", to: "npc_micah", kind: "payer", w: 20, t: 40, hidden: true, revealedBy: { rumours: ["rum_micah_landing"] }, why: "He pays Micah Dees fifty dollars a night to flash the dock light." },
    { from: "npc_micah", to: "npc_wade", kind: "payer", w: 10, t: 10, hidden: true, revealedBy: { rumours: ["rum_micah_landing"] }, why: "He sits in the dark bait shop for Wade Purvis." },
    { from: "npc_odessa", to: "npc_carter", kind: "other", w: -40, t: -50, hidden: true, revealedBy: { rumours: ["rum_odessa_offer"] }, why: "Carter Sturdivant has been after her to lie about his mother." },
    { from: "npc_lamar", to: "npc_carter", kind: "other", w: 20, t: 30, hidden: true, revealedBy: { rumours: ["rum_lamar_check"] }, why: "He signed Carter Sturdivant's option papers." },
    { from: "npc_hollis", to: "npc_wade", kind: "other", w: 10, t: 30, hidden: true, revealedBy: { flags: ["hollisTalking"] }, why: "He runs the Night Run's cash through his books." },
    { from: "npc_burl", to: "npc_wade", kind: "payer", w: 10, t: 10, hidden: true, revealedBy: { flags: ["burlMotors"] }, why: "He rebuilt the motors on Wade Purvis's johnboats for cash." },
    { from: "npc_ray", to: "npc_wade", kind: "enemy", w: -30, t: -40, why: "He preaches against the Night Run every Sunday." },
    { from: "npc_marcus", to: "npc_wade", kind: "enemy", w: -40, t: -60 },
    { from: "npc_wade", to: "npc_marcus", kind: "enemy", w: -30, t: -50 },
    { from: "npc_mavis", to: "npc_carter", kind: "other", w: -40, t: -40, why: "Sturdivant Land and Timber held the note on her mother's house." },
    { from: "npc_darlene", to: "npc_carter", kind: "other", w: -50, t: -60 },
    { from: "npc_annette", to: "npc_austin", kind: "other", w: 50, t: 30, why: "She taught Austin Lott." },
    { from: "npc_austin", to: "npc_annette", kind: "other", w: 40, t: 40 },
    { from: "npc_annette", to: "npc_micah", kind: "other", w: 40, t: 30 }
  ],
  /* Wave 32: what a secret told does between people (design Appendix C;
     Rel.secretTiesFor, State's exposeTo). When the player tells learnedBy
     what they hold over secretOf, each tie listed moves by w and t (liking,
     trust) on a line of its log the player was there for, and the tie is
     known; seed is what it sets going ({ effect, dayOffset }: a day or two
     on). One entry a secret and a listener; the one the secret was about
     hears who told by the tie between them. */
  secretTies: [
    { secretOf: "npc_mavis", learnedBy: "npc_dewayne", ties: [{ from: "npc_dewayne", to: "npc_mavis", w: -20, t: -45 }], why: "the garage money" },
    { secretOf: "npc_royce", learnedBy: "npc_jolene", ties: [{ from: "npc_jolene", to: "npc_royce", t: -20 }], why: "Carter Sturdivant's offer on the station" },
    { secretOf: "npc_loretta", learnedBy: "npc_kaylee", ties: [{ from: "npc_kaylee", to: "npc_royce", w: -30, t: -40 }], why: "her father and Loretta Gaddis" },
    { secretOf: "npc_carter", learnedBy: "npc_vada", ties: [{ from: "npc_vada", to: "npc_carter", w: -40, t: -60 }], why: "Dr. Sayle and the timber loans" },
    { secretOf: "npc_carter", learnedBy: "npc_odessa", ties: [{ from: "npc_odessa", to: "npc_carter", w: -30 }], why: "what Carter Sturdivant asked of Dr. Sayle" },
    { secretOf: "npc_jolene", learnedBy: "npc_annette", ties: [{ from: "npc_annette", to: "npc_jolene", w: -20, t: -50 }], why: "the envelopes and the water fund" },
    { secretOf: "npc_wade", learnedBy: "npc_jodie", ties: [{ from: "npc_jodie", to: "npc_wade", w: -100, t: -100 }], why: "what happened to Calvin Ogletree" },
    { secretOf: "npc_colt", learnedBy: "npc_tammy", ties: [{ from: "npc_tammy", to: "npc_colt", w: -100 }], why: "the bottle Amber Lott died with",
      seed: { effect: "Tammy Lott goes after Colt Purvis with a tire iron at Riverbend, and it takes Lorna Purvis to pull her off him.", dayOffset: [1, 2] } },
    { secretOf: "npc_colt", learnedBy: "npc_austin", ties: [{ from: "npc_austin", to: "npc_colt", w: -100 }], why: "the bottle Amber Lott died with" },
    { secretOf: "npc_colt", learnedBy: "npc_lorna", ties: [{ from: "npc_lorna", to: "npc_wade", t: -40 }], why: "what Wade Purvis let Colt Purvis do" },
    { secretOf: "npc_travis", learnedBy: "npc_nikki", ties: [{ from: "npc_nikki", to: "npc_travis", t: -40 }], why: "Wade Purvis's money" },
    { secretOf: "npc_nikki", learnedBy: "npc_marcus", ties: [{ from: "npc_marcus", to: "npc_nikki", w: -30, t: -60 }], why: "the sheriff and the case files" },
    { secretOf: "npc_nikki", learnedBy: "npc_glenda", ties: [{ from: "npc_glenda", to: "npc_nikki", w: -30 }], why: "the sheriff and the case files" },
    { secretOf: "npc_glenda", learnedBy: "npc_marcus", ties: [{ from: "npc_marcus", to: "npc_glenda", t: -30 }], why: "the tapes and the warning call" },
    { secretOf: "npc_lamar", learnedBy: "npc_vada", ties: [{ from: "npc_vada", to: "npc_lamar", w: -40, t: -70 }], why: "Carter Sturdivant's option papers" },
    { secretOf: "npc_trent", learnedBy: "npc_lamar", ties: [{ from: "npc_lamar", to: "npc_trent", w: -10, t: -40 }], why: "the liquor in the grain truck" },
    { secretOf: "npc_trent", learnedBy: "npc_virgil", ties: [{ from: "npc_virgil", to: "npc_trent", t: -20 }], why: "the liquor in the grain truck" },
    { secretOf: "npc_micah", learnedBy: "npc_ray", ties: [{ from: "npc_ray", to: "npc_micah", t: -20 }, { from: "npc_ray", to: "npc_wade", w: -30 }], why: "the dock light at the landing" },
    { secretOf: "npc_micah", learnedBy: "npc_nadine", ties: [{ from: "npc_nadine", to: "npc_micah", t: -20 }], why: "the dock light at the landing" },
    { secretOf: "npc_nadine", learnedBy: "npc_ray", ties: [{ from: "npc_ray", to: "npc_nadine", t: -40 }], why: "the church books" },
    { secretOf: "npc_dwight", learnedBy: "npc_lamar", ties: [{ from: "npc_lamar", to: "npc_dwight", w: -30 }, { from: "npc_lamar", to: "npc_carter", t: -40 }], why: "the survey stakes" },
    { secretOf: "npc_annette", learnedBy: "npc_jolene", ties: [{ from: "npc_jolene", to: "npc_annette", w: -10, t: -30 }], why: "the call to the state" },
    { secretOf: "npc_lyman", learnedBy: "npc_loretta", ties: [{ from: "npc_loretta", to: "npc_lyman", t: -30 }], why: "the steamed envelopes" },
    { secretOf: "npc_burl", learnedBy: "npc_june", ties: [{ from: "npc_june", to: "npc_burl", t: -20 }], why: "the money from Wade Purvis's motors" },
    { secretOf: "npc_virgil", learnedBy: "npc_lamar", ties: [{ from: "npc_lamar", to: "npc_virgil", t: -20 }], why: "what Virgil Odom told Warren Pettit" }
  ],
  year: 2026,
  // Day 1 is Thursday 8 October 2026 (CONTRACTS section 1): the weekday and the season come from here.
  calendar: { season: "autumn", startDate: "2026-10-08" },
  history: "A man named Lockett ran a flatboat ferry across the Lusk here in the 1820s, and the town grew up around his landing. The Gentrys bought the ferry after the Civil War and ran it until 1938, when Amos Sturdivant fought the state into building the green steel bridge and the ferry was cut loose. For fifty years the town lived on the highway traffic and the paper mill nine miles downstream. Then it lost them one at a time: the children went to the county school in Clayburn in 1987, the bypass opened twelve miles east in 1994 after a fight that split the council three to two and took the trucks with it, the mill shut in 2016 and the old county hospital in Clayburn in 2019. What is left is the bar, the station, the motel, the church, the river trade after dark and about eight hundred people who argue about the bridge: whether it is sound, whether the new one goes here or on the Sturdivant bottomland downstream, and whether a town this size can keep its own police.",
  recent: [
    { when: "January 2024", what: "Ruth Haskins died of cancer at forty-seven, and her father Virgil Odom moved out to the Haskins Farm that spring." },
    { when: "March 2024", what: "Wiley Tackett died, and his garage on Front Street was chained shut." },
    { when: "October 2024", what: "Renee Byrd married Scott Lindell in Calder and did not invite her father." },
    { when: "February 2025", what: "Inez Crocker died in her house up the river road, where her daughter Mavis and Dewayne Mangum still live." },
    { when: "April 2025", what: "The river crested at thirty-one feet, the worst flood since 1973. Riverbend went under to the windows and the Low Water took water to the line by the door." },
    { when: "November 2025", what: "The drugstore on Front Street closed, leaving Byrd's Pawn the last store open on that side of Front Street." },
    { when: "December 2025", what: "Lynette Pruett put Curtis out of their house in Clayburn, and he took a room at the Riverview Motor Court." },
    { when: "April 2026", what: "An engineer from Calder inspected the old bridge, and his report rated it critical. The state offered to pay for one new crossing, here or on the Sturdivant bottomland." },
    { when: "July 2026", what: "Leah Dees went into the Willows in Calder, and her son Micah moved into the Parsonage with his grandparents." },
    { when: "August 2026", what: "Amber Lott died of an overdose at Riverbend at nineteen; her funeral filled Riverside Baptist." },
    { when: "September 2026", what: "The council set its vote on the bridge site for its meeting on Tuesday, October 13." }
  ],
  // The town map in the Places tab (an SVG in viewBox units; see docs/BUILD_PLAN.md, "Map").
  // Each location below has map: { x, y, label, anchor }; roads between places are drawn from exits.
  map: {
    width: 360,
    height: 300,
    riverWidth: 34,
    river: "M0,226 C60,222 96,252 160,252 C224,252 280,232 360,244",
    riverLabel: { text: "Lusk River", x: 186, y: 255, rotate: -3 },
    bridges: ["M266,216 L270,266"],
    roads: [
      "M264,0 C262,22 254,38 250,56",
      "M270,266 C271,280 272,290 273,300"
    ],
    labels: [
      { text: "dry county", x: 120, y: 288 }
    ]
  },

  locations: [
    {
      id: "loc_pittmans",
      name: "Pittman's Gas and Service",
      type: "gas",
      map: { x: 250, y: 56, label: "Pittman's", anchor: "e" },
      description: "Four pumps under a buzzing canopy where the state highway meets the river road, with a bus-stop sign bolted to the ice machine and a hand-lettered board out front that reads CRICKETS, NIGHT CRAWLERS, CARTONS. Out back, two open service bays smell of hot oil and tire rubber, and a radio plays gospel to whatever truck is up on the lift.",
      details: "The counter sells crickets, cartons, scratch-offs, boiled peanuts and two-dollar coffee under Clyde Pittman's photo, and a flyer on the door calls the town to the council's bridge vote on Tuesday, October 13. Lamar Haskins drinks his coffee by the window most mornings, and Kaylee Pittman works the register after school.",
      hours: "6 a.m. to 10 p.m. every day; the service bays close at 5",
      history: "Clyde Pittman built the station in 1966, when the highway still brought the trucks through town, and Royce took it over when his daddy died at the pumps in 2009.",
      aka: ["the station", "the gas station", "the pumps"],
      exits: ["loc_motor_court", "loc_town_hall", "loc_byrds_pawn", "loc_sturdivant_house", "loc_mangum_house", "loc_pittman_place", "loc_bluff", "loc_river_road"],
      npcIdsBySchedule: {
        morning: ["npc_royce", "npc_dewayne", "npc_jodie", "npc_lamar"],
        afternoon: ["npc_dewayne", "npc_darlene", "npc_kaylee", "npc_trent"],
        evening: ["npc_royce", "npc_marcus", "npc_kaylee", "npc_leon", "npc_dwight"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_low_water",
      name: "The Low Water",
      type: "bar",
      map: { x: 184, y: 170, label: "Low Water", anchor: "s" },
      description: "A cinderblock bar on Front Street with neon beer signs in the window, a pool table with a slow lean and a flood line drawn in marker beside the door. On weekends the gravel lot fills with car tags from the dry county, and the kitchen hatch at the back sends out catfish baskets and the smell of old fryer grease.",
      details: "A beer is three dollars, a catfish basket nine, and the jukebox still takes quarters. Dollar bills signed by regulars are stapled over the bar, and the card game runs at the back table most nights under a lamp nobody else sits under.",
      hours: "11 a.m. to 2 a.m., Monday to Saturday; closed Sundays",
      closedOn: ["Sunday"],
      history: "Loretta Gaddis bought the Low Water in 1994, the year the bypass opened, and has kept it open through every flood since; the marker line by the door is from April 2025.",
      aka: ["the bar"],
      exits: ["loc_motor_court", "loc_town_hall", "loc_byrds_pawn", "loc_riverside_church", "loc_old_bridge", "loc_purvis_landing", "loc_gentry_house", "loc_front_street"],
      npcIdsBySchedule: {
        morning: ["npc_loretta"],
        afternoon: ["npc_loretta", "npc_royce", "npc_tammy", "npc_elbert", "npc_curtis", "npc_jodie"],
        evening: ["npc_loretta", "npc_carter", "npc_wade", "npc_tammy", "npc_lyman", "npc_curtis", "npc_jodie"],
        night: ["npc_loretta", "npc_lyman", "npc_curtis", "npc_jodie"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_motor_court",
      name: "The Riverview Motor Court",
      type: "motel",
      map: { x: 118, y: 94, label: "Motor Court", anchor: "n" },
      description: "Twelve rooms in a single-story L around a cracked parking lot, under a sign that says VACANCY in every season and a name that promises a view you only get from behind the dumpster. The office smells of burnt coffee and air freshener, and a monitor on the counter shows the lot in four gray squares.",
      details: "A room is forty-nine dollars a night or two hundred a week, cash preferred. Lyman Coker, Leon Varner and Curtis Pruett rent theirs by the week, and Boyd Teague has had Room 9 since last week. The office has a coffee pot and a bell nobody answers before dark.",
      hours: "Office open 6 p.m. to 6 a.m.; checkout at 11",
      history: "The Riverview went up in 1962 for the highway trade and has had five owners since the bypass took the trucks away; Stanley Wexler bought it in 2019.",
      aka: ["the motel", "the motor court", "the Riverview"],
      exits: ["loc_pittmans", "loc_low_water", "loc_haskins_farm"],
      npcIdsBySchedule: {
        morning: ["npc_lyman", "npc_curtis", "npc_brianna", "npc_boyd", "npc_leon"],
        afternoon: ["npc_lyman", "npc_brianna"],
        evening: ["npc_tyler", "npc_mavis", "npc_boyd"],
        night: ["npc_tyler", "npc_travis", "npc_mavis", "npc_leon", "npc_boyd"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_riverside_church",
      name: "Riverside Baptist Church",
      type: "church",
      map: { x: 84, y: 142, label: "Church", anchor: "n" },
      description: "A white clapboard church on the slope above Front Street, with a steeple that leans a little toward the river and a marquee sign out front that reads PRAY FOR OUR BRIDGE. Inside, the pews smell of lemon polish and old hymnals, and the fellowship hall out back keeps a coffee urn and a box of donated coats going all week.",
      details: "Thirty pews, the piano Nadine Dees plays every Sunday, and a board in the fellowship hall with the prayer list and the pantry schedule. The coffee is free, and the coats in the box by the door are for whoever needs one.",
      hours: "Sunday school 9:45, service at 11; supper and prayer Wednesdays at 6",
      history: "Riverside Baptist was built in 1911 on land the Gentrys gave, and Ray Dees has been its pastor since 1994; the new roof went on this summer.",
      aka: ["the church", "Riverside Baptist", "the fellowship hall"],
      exits: ["loc_low_water", "loc_riverbend", "loc_sturdivant_house", "loc_parsonage", "loc_gentry_house", "loc_cemetery"],
      npcIdsBySchedule: {
        morning: ["npc_ray", "npc_nadine", "npc_pearl"],
        afternoon: ["npc_vada", "npc_june", "npc_nadine"],
        evening: ["npc_ray", "npc_jolene", "npc_annette"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_town_hall",
      name: "Town Hall",
      type: "police",
      map: { x: 262, y: 146, label: "Town Hall", anchor: "e" },
      description: "A two-story brick building with the mayor's office upstairs and the police department downstairs, one patrol car out front and a second up on blocks behind it. The station is a front counter, three desks and a single holding cell, and the window unit drips onto a box of unpaid parking tickets.",
      details: "Upstairs is the council room with its folding chairs and the mayor's office; downstairs is the station, three desks, a holding cell with a steel bench and a coffee maker older than Officer Ballard. A board by the door posts the council agendas and the parking fines.",
      hours: "Clerk's office 8 to 4:30 on weekdays; the police answer the door day and night",
      history: "Town Hall went up in 1956, when the town still had money, and the police department moved into its ground floor in 1978.",
      aka: ["the police station", "the station house", "the mayor's office"],
      exits: ["loc_pittmans", "loc_byrds_pawn", "loc_low_water", "loc_old_bridge", "loc_overstreet_house", "loc_front_street"],
      npcIdsBySchedule: {
        morning: ["npc_carter", "npc_jolene", "npc_marcus", "npc_travis", "npc_glenda"],
        afternoon: ["npc_jolene", "npc_pearl", "npc_glenda", "npc_nikki"],
        evening: [],
        night: ["npc_marcus"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_byrds_pawn",
      name: "Byrd's Pawn",
      type: "pawn",
      map: { x: 222, y: 104, label: "Byrd's Pawn", anchor: "w" },
      description: "A narrow storefront between two empty ones, its window crowded with chainsaws, guitars and fishing reels behind a security grille that never goes all the way up. Inside it smells of gun oil and stale smoke, and a glass counter of rings and phones sits under a hand-lettered sign that says NO REFUNDS NO STORIES.",
      details: "Chainsaws, guitars, rifles, fishing reels and wedding rings, each with a paper tag and a price Hollis will argue about. Loans run thirty days at twenty-five percent, and the back room is off limits.",
      hours: "9 to 6, Monday to Saturday",
      closedOn: ["Sunday"],
      history: "Hollis Byrd opened the pawn shop in 1988 in what had been the auto parts store, and it is the last store open on its side of Front Street.",
      aka: ["the pawn shop", "the pawnshop"],
      exits: ["loc_pittmans", "loc_town_hall", "loc_low_water", "loc_byrd_apartment", "loc_front_street"],
      npcIdsBySchedule: {
        morning: ["npc_hollis"],
        afternoon: ["npc_hollis"],
        evening: ["npc_hollis"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_riverbend",
      name: "Riverbend Trailer Park",
      type: "trailerpark",
      map: { x: 40, y: 190, label: "Riverbend", anchor: "n" },
      description: "Thirty-odd trailers on the low ground downstream of the landing, some with flower boxes and some with blue tarps on the roofs, strung along a gravel loop that floods to the axles every spring. Dogs bark on chains, a trampoline rusts in the middle of the loop, and a cross of plastic flowers is wired to the fence by the mailboxes.",
      details: "Lot rent is two hundred and fifty a month, paid into a Sturdivant Land and Timber box at the gate. June Satterfield's porch light stays on all night, Shayla Rawls does hair in her trailer for fifteen dollars, and the cross by the mailboxes is for Amber Lott.",
      hours: "Always open",
      history: "Riverbend was a fish camp until 1974, when the Sturdivants cut it into trailer lots; it floods every spring and went under to the windows in April 2025.",
      aka: ["Riverbend", "the trailer park", "the Riverbend loop"],
      exits: ["loc_purvis_landing", "loc_riverside_church", "loc_lott_trailer"],
      npcIdsBySchedule: {
        morning: ["npc_june", "npc_colt", "npc_tyler", "npc_shayla"],
        afternoon: ["npc_colt", "npc_ray", "npc_tyler", "npc_travis", "npc_austin", "npc_leon", "npc_shayla"],
        evening: ["npc_june", "npc_brianna", "npc_shayla", "npc_burl"],
        night: ["npc_june", "npc_brianna", "npc_shayla", "npc_dwight", "npc_burl"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_purvis_landing",
      name: "Purvis Landing",
      type: "marina",
      map: { x: 102, y: 212, label: "Purvis Landing", anchor: "n" },
      description: "A bait shop on stilts, a fuel pump and a floating dock of aluminum johnboats and bass boats, beside the concrete public ramp that runs straight down into the water. At night the dock lights stay off, and every morning the mud at the foot of the ramp is cut with fresh trailer tracks.",
      details: "Crickets are three dollars a tube, minnows four dollars a dozen and gas a quarter over the station's price. Lorna Purvis keeps the shop, and Burl Satterfield fixes outboards on the dock in the afternoons. A flyer taped to the drink cooler calls the town to the council's bridge vote on Tuesday, October 13.",
      hours: "5 a.m. to 7 p.m.; the ramp is open all night",
      history: "The Purvis family has run the landing since 1952 on land leased from the Sturdivants, at the spot where the Gentry ferry used to tie up.",
      aka: ["the landing", "the ramp", "the boat ramp", "the bait shop", "the public ramp", "the river", "the Lusk", "the Lusk River"],
      exits: ["loc_low_water", "loc_old_bridge", "loc_riverbend"],
      npcIdsBySchedule: {
        morning: ["npc_wade", "npc_lorna"],
        afternoon: ["npc_wade", "npc_micah", "npc_lorna", "npc_burl"],
        evening: ["npc_colt", "npc_dewayne", "npc_trent", "npc_lorna"],
        night: ["npc_hollis", "npc_wade", "npc_micah", "npc_trent", "npc_lorna"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_sturdivant_house",
      name: "Sturdivant House",
      type: "bighouse",
      map: { x: 60, y: 66, label: "Sturdivant House", anchor: "n" },
      description: "A white two-story house with eight columns on the hill above town, its lawn mowed in stripes and its paint peeling on the side nobody sees from the road. At the end of the drive by the water tower you can get the town's one bar of cell signal, which is why so many trucks go up past the house after dark.",
      details: "Portraits of three generations of Sturdivants line the stairs, the parlor smells of furniture wax and old roses, and the clocks all run a little slow. Odessa Fairley answers the door and decides who gets past it.",
      hours: "Callers by invitation; Miss Vada receives in the evening",
      history: "Amos Sturdivant built the house in 1926, and Vada was born in its front bedroom in 1946.",
      aka: ["the big house", "the house on the hill"],
      exits: ["loc_pittmans", "loc_riverside_church", "loc_water_tower"],
      npcIdsBySchedule: {
        morning: ["npc_vada", "npc_odessa", "npc_dwight"],
        afternoon: ["npc_odessa"],
        evening: ["npc_vada", "npc_odessa"],
        night: ["npc_vada", "npc_carter", "npc_odessa"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_old_bridge",
      name: "The Old Bridge",
      type: "bridge",
      map: { x: 266, y: 212, label: "Old Bridge", anchor: "e" },
      description: "A narrow green steel truss from 1938, two lanes and no shoulder, posted at five tons and rattling under every pickup that crosses toward the dry county. Halfway over, a sign on the rail marks the state line, and Virgil Odom fishes off the concrete pier below the first span most afternoons.",
      details: "A bronze plaque at the town end names the 1938 highway commission and Amos Sturdivant. The deck rattles under every truck, the rail is scratched with initials and dates, and the pier below the first span is the best catfish hole on this stretch of river.",
      hours: "Always open; five-ton limit",
      history: "The bridge opened in October 1938 after Amos Sturdivant's three-year fight with the state, put the Gentry ferry out of business, and has been posted at five tons since 2019.",
      aka: ["the old bridge", "the bridge", "the green bridge"],
      exits: ["loc_town_hall", "loc_low_water", "loc_purvis_landing"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: ["npc_carter", "npc_marcus", "npc_virgil", "npc_boyd", "npc_dwight"],
        evening: ["npc_austin", "npc_virgil"],
        night: ["npc_colt"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_front_street",
      name: "Front Street",
      type: "street",
      map: { x: 206, y: 136, label: "Front Street", anchor: "w" },
      description: "Two blocks of brick storefronts between the Low Water and Byrd's Pawn, most of them empty, with plywood over the windows of the old drugstore and the old bank. Halfway down, Wiley Tackett's garage sits with its bay doors chained under a faded sign that still says TACKETT AUTO REPAIR.",
      details: "The empty garage has a for-sale sign from Sturdivant Land and Timber in the office window and an oil stain in each bay. The old bank's vault door still shows through the plywood, and Elbert Gentry and Burl Satterfield sit on the bench outside the old drugstore most mornings.",
      hours: "Always open",
      history: "Front Street was the main street when the trucks still came through, and its stores closed one at a time after the bypass opened in 1994.",
      aka: ["the main street", "the empty garage", "the Front Street garage", "the garage on Front Street", "Tackett's garage", "the old garage", "the garage", "the old bank", "the old drugstore"],
      exits: ["loc_low_water", "loc_byrds_pawn", "loc_town_hall"],
      npcIdsBySchedule: {
        morning: ["npc_elbert", "npc_burl"],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_cemetery",
      name: "Riverside Cemetery",
      type: "cemetery",
      map: { x: 130, y: 120, label: "Cemetery", anchor: "e" },
      description: "A sloping acre beside Riverside Baptist with cedar trees, a chain-link fence and graves going back to the 1840s, the oldest with their names worn off. The newest is a mound of red clay under a metal funeral-home marker, covered in plastic flowers and a stuffed bear.",
      details: "Amber Lott's grave is the fresh one by the back fence, and Ruth Haskins lies under a stone with room on it for Lamar. Amos Sturdivant has the tallest monument, a gray obelisk, and Tammy Lott sits by Amber's grave most mornings before her shift.",
      hours: "Always open",
      history: "The town buried its dead here before there was a church to bury them from, and the Gentrys, the Sturdivants and the Pittmans each have a corner.",
      aka: ["the cemetery", "the graveyard", "the church cemetery"],
      exits: ["loc_riverside_church"],
      npcIdsBySchedule: {
        morning: ["npc_tammy"],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_water_tower",
      name: "The Water Tower",
      type: "tower",
      map: { x: 60, y: 16, label: "Water tower", anchor: "e" },
      description: "A silver tank on four legs at the top of the hill above town, with the town's name painted around it and a gravel turnaround at its feet where the Sturdivant drive ends. Stand by the fence and your phone finds one bar, which is the whole reason anybody drives up here.",
      details: "Beer cans and cigarette butts in the gravel, initials painted on the legs, and a view of the bridge, the river and the lights of the dry county. After dark Kaylee Pittman drives her daddy's truck up here most nights for the signal.",
      hours: "Always open",
      history: "The town put the tower up in 1964 and painted it every ten years until the money ran out; the class of 2019 painted over the last coat.",
      aka: ["the water tower", "the hill", "the tower"],
      exits: ["loc_sturdivant_house"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: ["npc_kaylee"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_bluff",
      name: "The Bluff",
      type: "highway",
      map: { x: 250, y: 14, label: "The Bluff", anchor: "e" },
      description: "A pull-off on the state highway at the top of the bluff, where the road comes out of the pine woods and drops toward Pittman's in two switchbacks. A green sign by the guardrail says LOCKETT'S FERRY POP 812, and from the rail you can see the whole town, the bridge and the river bending away downstream.",
      details: "A historical marker about the Gentry ferry stands by the guardrail, half hidden in kudzu. Log trucks downshift loud here all night, and Travis Cagle parks the patrol car behind the sign to run radar at the start of his shift.",
      hours: "Always open",
      history: "The highway came down the bluff in 1938 to meet the new bridge, and the state widened the switchbacks in 1971 after a log truck went over the rail.",
      aka: ["the bluff", "the state highway", "the highway", "the road out", "the switchbacks"],
      exits: ["loc_pittmans"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: ["npc_travis"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_river_road",
      name: "The River Road",
      type: "road",
      map: { x: 318, y: 84, label: "River road", anchor: "s" },
      description: "A two-lane blacktop that leaves the highway at Pittman's and follows the river upstream past the Mangum House, a string of fish camps and a row of mailboxes on posts. It has no shoulder and deep ditches, and the deer come out on it at dusk.",
      details: "A hand-painted sign for fresh eggs, a speed limit sign shot full of holes and a low spot past the Mangum House where the water crosses every spring. Nikki Ballard runs it every morning.",
      hours: "Always open",
      history: "It was the wagon road to the upriver fish camps long before the bridge, and the county paved it in 1961 as far as the last camp.",
      aka: ["the river road", "the blacktop"],
      exits: ["loc_pittmans", "loc_mangum_house"],
      npcIdsBySchedule: {
        morning: ["npc_nikki"],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_mangum_house",
      name: "The Mangum House",
      type: "house",
      map: { x: 330, y: 118, label: "Mangum house", anchor: "w" },
      description: "A white frame house about a mile up the river road from Pittman's, on the left, with a carport full of engine parts and a porch light left on for whoever gets home last. In the daytime it is dim and quiet, blackout curtains drawn over the bedroom where Mavis sleeps off the night shift.",
      details: "The front room is still Inez's, with her plastic-covered sofa and church fans, and the kitchen is Dewayne's, with engine parts soaking in the sink. The blackout curtains in the back bedroom stay shut all day.",
      hours: "A private home",
      history: "It was Inez Crocker's house for forty years; her daughter Mavis and Dewayne Mangum moved in to look after her in 2021 and stayed after she died.",
      aka: ["the white house", "the white frame house"],
      exits: ["loc_pittmans", "loc_river_road"],
      npcIdsBySchedule: {
        morning: ["npc_mavis"],
        afternoon: ["npc_mavis"],
        evening: [],
        night: ["npc_dewayne"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_pittman_place",
      name: "The Pittman Place",
      type: "house",
      map: { x: 306, y: 30, label: "Pittman place", anchor: "w" },
      description: "A brick ranch house up the bluff behind the station, with a basketball hoop over the garage, a bass boat on a trailer and the station's ledgers spread across the kitchen table. The curtains are always half shut, and from the back steps you can see every truck that stops at the pumps.",
      details: "Kaylee's softball trophies fill the den, the kitchen table is covered in the station's ledgers, and the living room curtains are always half shut. The bass boat in the drive has not been in the water since spring.",
      hours: "A private home",
      history: "Royce and Darlene Pittman built the ranch house in 1998 on a lot behind the station that Clyde Pittman gave them as a wedding present.",
      aka: ["the Pittman house", "the brick ranch house"],
      exits: ["loc_pittmans"],
      npcIdsBySchedule: {
        morning: ["npc_darlene", "npc_kaylee"],
        afternoon: [],
        evening: ["npc_darlene"],
        night: ["npc_royce", "npc_darlene"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_parsonage",
      name: "The Parsonage",
      type: "house",
      map: { x: 30, y: 108, label: "Parsonage", anchor: "e" },
      description: "A small white house beside Riverside Baptist that the church owns, with a porch swing, a vegetable garden gone to seed and the church van parked on the grass. Inside it smells of coffee and cough drops, and the front room is stacked with boxes of canned goods for the pantry.",
      details: "The front room is stacked with canned goods for the pantry, and Micah has his mother's old room at the back. Nadine keeps a pot of coffee on from six in the morning.",
      hours: "A private home; the pastor answers the door at any hour",
      history: "The church built the parsonage in 1952, and the Dees family has lived in it since Ray took the pulpit in 1994.",
      aka: ["the pastor's house"],
      exits: ["loc_riverside_church"],
      npcIdsBySchedule: {
        morning: ["npc_micah"],
        afternoon: [],
        evening: ["npc_nadine", "npc_micah"],
        night: ["npc_ray", "npc_nadine"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_lott_trailer",
      name: "The Lott Trailer",
      type: "trailer",
      map: { x: 20, y: 158, label: "Lott trailer", anchor: "e" },
      description: "A single-wide at the far end of the Riverbend loop, with a wind chime of bent spoons on the porch and a girl's pink bicycle chained to the steps that nobody rides now. A handmade sign taped inside the front window says JUSTICE FOR AMBER in marker.",
      details: "Amber's photos are taped all around the TV, her room is the way she left it, and the kitchen smells of fryer grease from Tammy's work shirts. A coffee can by the door collects money for a headstone.",
      hours: "A private home",
      history: "Tammy Lott has rented the single-wide since 2008, and Amber grew up in its front bedroom.",
      aka: ["Tammy's trailer"],
      exits: ["loc_riverbend"],
      npcIdsBySchedule: {
        morning: ["npc_austin"],
        afternoon: [],
        evening: [],
        night: ["npc_tammy", "npc_austin"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_byrd_apartment",
      name: "The Apartment over Byrd's",
      type: "apartment",
      map: { x: 192, y: 76, label: "Apartment", anchor: "n" },
      description: "Two rooms up an outside staircase above Byrd's Pawn, rented by the month, with a dripping window unit, a police radio on the counter and a view straight down into the alley where trucks stop after dark. The landlord's boxes of unclaimed merchandise still fill the hall closet.",
      details: "Rent is four hundred a month, and Hollis collects it in person. The window unit drips into a bucket, the police radio is never off, and the only thing on the walls is a framed academy photo of Nikki in uniform.",
      hours: "A private home",
      history: "Hollis Byrd raised his daughter Renee in these two rooms and has rented them by the month since she left; Nikki Ballard moved in two years ago.",
      aka: ["the apartment"],
      exits: ["loc_byrds_pawn"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: ["npc_nikki"],
        night: ["npc_nikki"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_haskins_farm",
      name: "The Haskins Farm",
      type: "farm",
      map: { x: 188, y: 40, label: "Haskins farm", anchor: "w" },
      description: "A tin-roofed farmhouse at the end of a gravel road north of town, with a grain truck under the shed, soybean stubble out to the tree line and a hand-painted sign by the mailbox that once said NO NEW BRIDGE and has been painted over. The kitchen table is covered in seed bills and a county map with the downstream bridge route drawn on it in pencil.",
      details: "Ruth Haskins's recipe cards are still in a tin by the stove, and Virgil Odom's tackle and old bridge reports fill the back porch. Seed bills are stuck to the refrigerator with feed store magnets.",
      hours: "A private home",
      history: "The Haskins family has farmed here since 1931 and has leased the Sturdivant bottomland since 1960.",
      aka: ["the farm", "the Haskins place"],
      exits: ["loc_motor_court"],
      npcIdsBySchedule: {
        morning: ["npc_virgil", "npc_trent"],
        afternoon: ["npc_lamar"],
        evening: ["npc_lamar"],
        night: ["npc_virgil", "npc_lamar"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_overstreet_house",
      name: "The Overstreet House",
      type: "house",
      map: { x: 310, y: 166, label: "Overstreet house", anchor: "s" },
      description: "A neat yellow house on the rise behind Town Hall, with a flag on the porch, a scanner squawking in the front window and a chest freezer humming in the carport. The front room is full of the mayor's binders and council minutes, and somebody is always home.",
      details: "Council binders cover the dining table, the scanner in the window is never off, and Gerald's mill union plaques hang in the hall. The chest freezer in the carport is full of deer meat.",
      hours: "A private home",
      history: "Gerald and Jolene Overstreet bought the yellow house in 1991, the year they married, and Annette moved back into her old room in 2022.",
      aka: ["the yellow house", "the mayor's house"],
      exits: ["loc_town_hall"],
      npcIdsBySchedule: {
        morning: ["npc_annette", "npc_gerald"],
        afternoon: ["npc_annette", "npc_gerald"],
        evening: ["npc_gerald"],
        night: ["npc_jolene", "npc_annette", "npc_gerald"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_gentry_house",
      name: "The Gentry House",
      type: "house",
      map: { x: 128, y: 152, label: "Gentry house", anchor: "e" },
      description: "The oldest house in town, a gray two-story with a deep porch on the slope between the church and Front Street, built by the family that ran the ferry before there was a bridge. Photographs of the river in flood cover every wall, and three rocking chairs on the porch face the water.",
      details: "Every wall is covered in photographs of the river in flood, each labeled with the year and the height in Elbert's hand. The house smells of pipe smoke and mothballs, and Pearl's newspaper clippings fill a whole bedroom.",
      hours: "A private home; Elbert is on the porch most evenings",
      history: "Asa Gentry built the house in 1890 with ferry money, and it is the oldest building in town; Elbert was born in it in 1938, the year the ferry ended.",
      aka: ["the oldest house in town"],
      exits: ["loc_riverside_church", "loc_low_water"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: ["npc_elbert", "npc_pearl", "npc_glenda"],
        night: ["npc_elbert", "npc_pearl", "npc_glenda"]
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_clayburn",
      name: "Clayburn",
      type: "town",
      away: true,
      distance: "twenty-six miles north up the state highway, about forty minutes by car",
      description: "The county seat, a town of six thousand around a domed courthouse, with the sheriff's office in its basement, a grocery, two banks and the county home. People from Lockett's Ferry drive up for court dates, paperwork, school and anything a gas station does not sell.",
      details: "The courthouse square has a diner, a pharmacy and two banks, and the title-loan office is out on the highway with repossessed trucks behind it. The county home is four blocks off the square, and the county school is on the north edge of town.",
      hours: "Courthouse 8 to 4:30 on weekdays",
      history: "Clayburn took the county seat from Lockett's Ferry in an election in 1871, and Elbert Gentry still says it was stolen.",
      aka: ["the county seat", "the courthouse"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_sheriffs_office",
      name: "The Sheriff's Office",
      type: "office",
      away: true,
      distance: "in the courthouse basement in Clayburn, twenty-six miles north",
      description: "The county sheriff's office and jail in the basement of the Clayburn courthouse, with a front counter behind thick glass and twenty-two beds in the jail behind it. Eleven deputies cover the whole county from here, and it takes one of them an hour or more to reach Lockett's Ferry.",
      details: "Wanted posters, a coffee machine and a sign-in book for jail visitors. The dispatcher answers the phone with the sheriff's campaign slogan.",
      hours: "Open day and night",
      history: "Sheriff Hoyt Bramlett has run it since 2006, and his deputies and the Lockett's Ferry police have not trusted each other since an arrest at the bridge went wrong in 2011.",
      aka: ["the sheriff's office", "the county jail", "the jail", "the sheriff's department"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_county_home",
      name: "The County Home",
      type: "care",
      away: true,
      distance: "four blocks off the courthouse square in Clayburn, twenty-six miles north",
      description: "The county nursing home, a one-story brick building in Clayburn with sixty beds, a dayroom television that is never off and a lot full of aides' cars. In Lockett's Ferry, going to the county home means you have nobody left.",
      details: "The halls smell of disinfectant and cafeteria gravy, and the visiting hours are taped to the door.",
      hours: "Visiting 1 to 7 every day",
      history: "It opened in 1968 to replace the county poor farm and has been short of staff every year since.",
      aka: ["the county home", "the nursing home"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_county_school",
      name: "The County School",
      type: "school",
      away: true,
      distance: "on the north edge of Clayburn, fifty minutes on the school bus",
      description: "The county's middle and high school together, two long brick wings and a football field on the north edge of Clayburn, with eleven hundred students. The bus for Lockett's Ferry leaves the Riverbend mailboxes at ten to seven.",
      details: "Annette Overstreet teaches seventh grade in the middle school wing, and Kaylee Pittman pitches for the softball team. The trophy case by the gym has one plaque with a Lockett's Ferry name on it.",
      hours: "School days 7:45 to 3:15",
      history: "Children from Lockett's Ferry have ridden the bus to Clayburn since 1987.",
      aka: ["the county school", "the county middle school", "the school", "the high school", "the middle school"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_old_hospital",
      name: "The Old County Hospital",
      type: "hospital",
      away: true,
      distance: "on the south side of Clayburn, twenty-six miles north",
      description: "A three-story brick hospital in Clayburn with its windows boarded and its sign taken down, closed since 2019. Since it shut, the nearest emergency room has been Calder Regional, forty miles away.",
      details: "The parking lot is fenced and the ambulance bay is chained. A banner on the fence still says THANK YOU HEALTHCARE HEROES.",
      hours: "Closed",
      history: "It opened in 1952, delivered most of the people in Lockett's Ferry under seventy, and closed in March 2019 when the company that bought it went bankrupt; June Satterfield nursed there for twenty-six years.",
      aka: ["the old county hospital", "the county hospital", "the old hospital"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_calder",
      name: "Calder",
      type: "city",
      away: true,
      distance: "forty miles north, past Clayburn on the state highway, about an hour",
      description: "The city, as people in Lockett's Ferry say it: forty thousand people, a regional hospital, lawyers, doctors, a mall and a treatment center. Anyone who leaves Lockett's Ferry for good seems to end up here first.",
      details: "The courthouse square has the law offices and a private lender's office over a bank, and the hospital and the clinics are out by the interstate.",
      hours: "A city",
      history: "Calder grew on the railroad and the paper trade, and it has been taking Lockett's Ferry's young people and business for sixty years.",
      aka: ["the city"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_regional",
      name: "Calder Regional",
      type: "hospital",
      away: true,
      distance: "forty miles north in Calder, an hour by car and longer by ambulance",
      description: "The regional medical center in Calder, with the nearest emergency room to Lockett's Ferry, a helicopter pad and a waiting room that is full every night. The ambulance from Clayburn takes an hour to get to the river and another to get back.",
      details: "The emergency room has forty chairs and a vending machine, and the night nurses know June Satterfield's voice from years of phone calls.",
      hours: "Emergency room open day and night",
      history: "It took over the county's patients when the old county hospital closed in 2019.",
      aka: ["the hospital", "the emergency room", "the regional hospital"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_treatment",
      name: "The Willows",
      type: "clinic",
      away: true,
      distance: "on the edge of Calder, forty miles north",
      description: "A treatment center for drugs and alcohol on the edge of Calder, in an old motel with a fence around it and a garden the patients keep. It has a waiting list of three months and allows one phone call a week.",
      details: "Sunday visits are in the dayroom from 1 to 4, with coffee in paper cups and a wall of photos of the people who finished.",
      hours: "Visiting Sundays 1 to 4",
      history: "It opened in 2015 in the old Willows motel and is where families from three counties send the people they cannot help any more.",
      aka: ["the treatment program", "the treatment center", "the Willows", "rehab"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_state_pen",
      name: "The State Penitentiary",
      type: "prison",
      away: true,
      distance: "a hundred and forty miles north, three hours each way",
      description: "The state's maximum-security prison, cellblocks and cotton fields behind two fences in the flat country to the north. Visiting is the second and fourth Saturday, and the trip from Lockett's Ferry takes all day.",
      details: "The visiting room has vending machines, plastic chairs and a guard at each door. A collect call costs three dollars for fifteen minutes.",
      hours: "Visiting the second and fourth Saturday, 9 to 3",
      history: "Half the men in Lockett's Ferry over fifty know someone who did time there, and Dale Purvis has been there since 2018.",
      aka: ["the state penitentiary", "the penitentiary", "the pen", "prison"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_bottomland",
      name: "The Sturdivant Bottomland",
      type: "fields",
      away: true,
      distance: "five miles downstream by the county road past Riverbend, ten minutes by truck",
      description: "Two thousand acres of flat river bottom five miles downstream, soybeans and cotton out to the tree line, where the state would build the new bridge if the council picks the downstream site. Survey stakes with orange flags run across the fields to the water.",
      details: "A gravel farm road runs down to the river past the forty acres the Haskins family owns outright, the soybean stubble is cut close, and a culvert by the road marks where the new interchange would go.",
      hours: "Private land",
      history: "Amos Sturdivant bought the bottomland in 1924, and the Haskins family has farmed it on a lease since 1960.",
      aka: ["the bottomland", "the downstream site", "the downstream bridge site", "the new interchange", "Sturdivant land", "Sturdivant bottomland"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_timber",
      name: "The Sturdivant Timber",
      type: "woods",
      away: true,
      distance: "upriver and inland, twenty to forty minutes by logging road",
      description: "Eleven thousand acres of planted pine upriver and inland, cut on a thirty-year rotation by Sturdivant Land and Timber's crews. Logging roads, a skidder yard and a deer camp are about all there is out there.",
      details: "The skidder yard smells of diesel and cut pine, the deer camp has a sign-in board, and a white cross for Harlan Voss is nailed to a pine at the yard gate.",
      hours: "Crews work dawn to dusk, six days a week",
      history: "Harlan Voss bought most of it in the 1980s and died out there in 2014; Dwight Spann's crew cuts it now.",
      aka: ["the timber", "the timber land", "the timber woods", "the pine tracts"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_paper_mill",
      name: "The Old Paper Mill",
      type: "mill",
      away: true,
      distance: "nine miles downstream by the county road past Riverbend",
      description: "A closed paper mill nine miles downstream, a mile of rusting sheds, smokestacks and settling ponds behind a fence with the company's name painted out. It employed four hundred people until it shut in 2016.",
      details: "The gate has a scrapper's padlock, the guard shack windows are broken, and the union hall across the road is a church now.",
      hours: "Closed",
      history: "The mill opened in 1958 and kept Lockett's Ferry going for fifty years; Gerald Overstreet ran its paper machines for thirty-three of them.",
      aka: ["the paper mill", "the mill", "the old mill"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_bypass",
      name: "The Bypass",
      type: "highway",
      away: true,
      distance: "twelve miles east; the long way round to the dry county takes forty minutes",
      description: "The four-lane highway that runs north and south twelve miles east of town, with the nearest other bridge over the Lusk. It is why the trucks stopped coming through Lockett's Ferry, and if the old bridge closes it is how everyone will get to the dry county.",
      details: "A truck stop, a fireworks stand and a weigh station at the exit, and a billboard for a lawyer in Calder.",
      hours: "Always open",
      history: "It opened in 1994 after a fight that split the council three to two; Loretta Gaddis and Clyde Pittman led the side that lost.",
      aka: ["the bypass", "the four-lane", "the long way round"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_dry_county",
      name: "The Dry County",
      type: "county",
      away: true,
      distance: "across the old bridge, over the state line",
      description: "The county across the river in the next state, dry since 1907, with a cigarette tax twice this side's and a sheriff who does not come across. Its people drive over the old bridge for beer, cartons and the Low Water.",
      details: "Its first gas station is a mile past the bridge and sells nothing stronger than root beer.",
      hours: "Always open",
      history: "It voted itself dry in 1907, and somebody in Lockett's Ferry has made money on the difference ever since.",
      aka: ["the dry county", "the far side", "across the river"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    },
    {
      id: "loc_coast",
      name: "The Coast",
      type: "coast",
      away: true,
      distance: "three hundred miles down the river, a long day's drive",
      description: "Where the Lusk meets the Gulf, three hundred miles downriver: casinos, condos, shrimp boats and the place people in Lockett's Ferry talk about retiring to. The towboats that pass the old bridge end their runs there.",
      details: "Nobody from Lockett's Ferry lives there yet.",
      hours: "Always open",
      history: "Towboats have run down the river to the coast since before the bridge, and the deckhands still talk about it as the end of the line.",
      aka: ["the coast", "the Gulf"],
      exits: [],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: []
      },
      discovered: false,
      closed: false
    }
  ],

  npcs: [
    {
      id: "npc_loretta",
      name: "Loretta Gaddis",
      pronouns: "she",
      age: 60,
      presence: "here",
      role: "owner and bartender of the Low Water",
      factionId: null,
      tags: ["bartender"],
      look: "Rail-thin woman of sixty with frosted hair, reading glasses on a beaded chain and a bar towel over one shoulder.",
      voice: "Flat and unhurried; calls everybody 'hon', answers a question she doesn't like by asking what you're drinking, and never says a name out loud if she can point instead.",
      personality: ["unflappable", "loyal"],
      goal: "Keep the old bridge open, because half her trade drives over from the dry county and none of it will drive the long way round.",
      secret: "She has been seeing Royce Pittman on Tuesday afternoons for eleven years, and she is the reason he has not promised his vote to Carter Sturdivant.",
      secretWeight: 2,
      leverageKeys: ["Tuesday afternoons", "seeing Royce", "eleven years"],
      mattersTo: ["npc_darlene"],
      history: "Loretta Gaddis grew up at Riverbend, tended bar in Calder in her twenties and came home in 1991. She and Clyde Pittman led the losing side of the bypass fight, and she bought the Low Water in 1994, the year the bypass opened, with what she had saved. She lives in the two rooms behind the bar and has kept it open through every flood since.",
      attitude: 5,
      relations: [{ npcId: "npc_tammy", relation: "employee" }, { npcId: "npc_lyman", relation: "employee" }, { npcId: "npc_jodie", relation: "employee" }],
      home: "loc_low_water",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_royce",
      name: "Royce Pittman",
      pronouns: "he",
      age: 56,
      presence: "here",
      role: "owner of Pittman's Gas and Service and the swing vote on the town council",
      factionId: null,
      tags: ["council", "merchant", "cardplayer"],
      look: "Big, soft-bellied man in his fifties in a feed-store cap and a short-sleeved dress shirt, with a pen behind each ear.",
      voice: "Folksy and slippery; dodges a straight answer, now and then with a story about his daddy; once in a while hedges with 'now, I'm not saying'; laughs to fill a silence.",
      personality: ["genial", "cowardly"],
      goal: "Get out from under the note on his station without having to pick a side where anybody can see him do it.",
      secret: "Carter Sturdivant holds the note on the station and has offered to tear it up and give him the truck stop lease at the new interchange in return for a yes vote.",
      secretWeight: 3,
      leverageKeys: ["note on the station", "truck stop", "tear it up"],
      mattersTo: ["npc_jolene", "npc_darlene"],
      history: "Royce Pittman grew up behind the counter of the station his daddy built and took it over when Clyde Pittman died at the pumps in 2009. He has sat on the town council for twelve years and is known for never saying how he will vote until he has to. He coaches Kaylee's softball team in the spring.",
      attitude: 10,
      relations: [{ npcId: "npc_darlene", relation: "wife" }, { npcId: "npc_kaylee", relation: "daughter" }, { npcId: "npc_dewayne", relation: "employee" }, { npcId: "npc_clyde", relation: "father" }],
      home: "loc_pittman_place",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_vada",
      name: "Vada Sturdivant",
      pronouns: "she",
      age: 80,
      presence: "here",
      role: "widow who owns Sturdivant House and the bottomland downstream",
      factionId: null,
      tags: ["owner", "landowner", "elderly"],
      look: "Small, straight-backed woman of eighty in a cardigan and pearls, with garden dirt under her nails and a cane she points with more than she leans on.",
      voice: "Crisp and formal, with an old schoolteacher's diction; calls grown men 'son', corrects your grammar mid-sentence, and answers questions about money by asking who your people are.",
      personality: ["imperious", "sentimental"],
      goal: "Keep the old bridge her father fought the state for in 1938, and keep the bottomland out of Carter's hands while she is alive.",
      secret: "The Sturdivant money started with her father running whiskey into the dry county, and Wade Purvis still brings her an envelope every month, which is why the landing lease has never gone up.",
      history: "Vada Sturdivant was born in Sturdivant House in 1946, the daughter of Amos Sturdivant, and taught school in Clayburn for thirty years. She married Harlan Voss in 1977, kept her own name and gave it to their son, and has been a widow since 2014. The house, the hill and the bottomland are still in her name.",
      attitude: 0,
      start: { trust: -10 },
      relations: [{ npcId: "npc_carter", relation: "son" }, { npcId: "npc_odessa", relation: "employee" }, { npcId: "npc_lamar", relation: "tenant" }, { npcId: "npc_amos", relation: "father" }, { npcId: "npc_harlan", relation: "husband" }],
      home: "loc_sturdivant_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_carter",
      name: "Carter Sturdivant",
      pronouns: "he",
      age: 45,
      presence: "here",
      role: "head of Sturdivant Land and Timber, who holds half the town's paper",
      factionId: "fac_sturdivant",
      tags: ["lender", "landowner", "cardplayer"],
      look: "Trim, tanned man of forty-five in a quarter-zip pullover and pressed khakis, turning a truck key fob over and over in his fingers.",
      voice: "Fast and friendly, like a salesman closing; uses your first name too soon and too often, talks about 'the future of this town', and states every sum to the dollar.",
      personality: ["ambitious", "smooth"],
      goal: "Get the new bridge built downstream on Sturdivant bottomland, sell the state the right-of-way and own the truck stop at the new interchange.",
      secret: "He is two years behind on the family's timber loans, and he has asked Dr. Phillip Sayle in Calder to find his mother Vada unfit so he can sign the bottomland over himself.",
      secretWeight: 3,
      leverageKeys: ["Dr. Sayle", "unfit", "timber loans"],
      mattersTo: ["npc_vada", "npc_odessa"],
      whenTold: { crime: true },
      history: "Carter Sturdivant grew up in Sturdivant House, went to college in Calder and came home in 2014 to run the business when his father died in the timber woods. He lives with his mother and drives a new truck every two years. Half the notes and leases in town are in his company's name.",
      attitude: 10,
      start: { trust: -10 },
      relations: [{ npcId: "npc_vada", relation: "mother" }, { npcId: "npc_dwight", relation: "employee" }, { npcId: "npc_amos", relation: "grandfather" }, { npcId: "npc_harlan", relation: "father" }],
      protector: "nobody",
      home: "loc_sturdivant_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_jolene",
      name: "Jolene Overstreet",
      pronouns: "she",
      age: 57,
      presence: "here",
      role: "mayor and town clerk",
      factionId: "fac_sturdivant",
      tags: ["council", "mayor", "records"],
      look: "Heavy-set woman in her fifties in a cardigan over a church T-shirt, with a lanyard of keys and a phone she keeps checking for a signal it never finds.",
      voice: "Brisk and procedural; cites ordinances by number, says 'that's a council matter' to shut a subject, and drops to a whisper to say anything kind.",
      personality: ["officious", "frightened"],
      goal: "Get the downstream bridge approved and the police department dissolved before the town's money runs out in January.",
      secret: "Carter Sturdivant pays her five hundred dollars a month in cash, handed over in the motel parking lot, and she used the first year of it to cover money missing from the water fund.",
      secretWeight: 3,
      leverageKeys: ["envelope", "five hundred", "water fund"],
      mattersTo: ["npc_marcus", "npc_gerald"],
      whenTold: { crime: true },
      canRaise: 300,
      history: "Jolene Overstreet has been town clerk since 1998 and mayor since 2018, the year nobody else filed. She married Gerald in 1991, and they raised Annette in the yellow house behind Town Hall. She runs the council by the book and the town's money with a calculator and a prayer.",
      attitude: 0,
      relations: [{ npcId: "npc_gerald", relation: "husband" }, { npcId: "npc_annette", relation: "daughter" }],
      home: "loc_overstreet_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_hollis",
      name: "Hollis Byrd",
      pronouns: "he",
      age: 65,
      presence: "here",
      role: "owner of Byrd's Pawn and a member of the town council",
      factionId: "fac_nightrun",
      tags: ["fence", "merchant", "lender", "council"],
      look: "Stooped, pot-bellied man of sixty-five in suspenders and a fishing vest, with a jeweler's loupe on a cord and a toothpick that never leaves his mouth.",
      voice: "Slow and sideways, never a straight yes or no; calls everything 'merchandise', prices things before you ask, and says 'I don't ask where, I ask how much.'",
      personality: ["sociable", "greedy"],
      goal: "Sell the shop and retire to the coast before the bridge closes and the building is worth nothing.",
      secret: "He runs the Night Run's cash through his books as pawn sales, and the catalytic converters stacked behind the shop came off cars in three counties.",
      secretWeight: 3,
      leverageKeys: ["cash book", "pawn sales", "converters"],
      mattersTo: ["npc_marcus"],
      whenTold: { memory: "was told Hollis Byrd runs the landing's cash through his pawn books", crime: true, inquiry: "Chief Bell spends a morning at Byrd's Pawn going through the ledgers.", news: "Chief Bell spent a morning at Byrd's Pawn going through the ledgers." },
      canRaise: 300,
      mercenary: true,
      history: "Hollis Byrd has run the pawn shop on Front Street since 1988, raised his daughter Renee on his own in the apartment over it and has sat on the town council since 2002. He fishes off the landing at night and knows the price of everything in three counties. He has not spoken to Renee since 2023, and she did not ask him to her wedding.",
      attitude: 5,
      relations: [{ npcId: "npc_nikki", relation: "tenant" }, { npcId: "npc_renee", relation: "daughter" }, { npcId: "npc_scott", relation: "son-in-law" }],
      protector: { npcId: "npc_wade", hidden: true },
      home: "loc_byrds_pawn",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_wade",
      name: "Wade Purvis",
      pronouns: "he",
      age: 57,
      presence: "here",
      role: "owner of Purvis Landing and boss of the Night Run",
      factionId: "fac_nightrun",
      tags: ["boatman", "smuggler", "tough", "cardplayer"],
      look: "Lean, sunburnt man in his fifties with a gray ponytail, a faded camouflage cap and the tip of one finger missing.",
      voice: "Quiet and dry; lets you talk yourself out, answers in river terms like stage, chop and slack water, and never says the word police, only 'the law'.",
      personality: ["patient", "ruthless"],
      goal: "Keep the old bridge open and the river unwatched after dark, and keep his nephew out of prison.",
      secret: "He knows Colt is selling pills on the side and has not stopped him, because Colt was there the night Wade beat Calvin Ogletree half to death below the landing for cutting in on the run, and could send him to prison for it.",
      secretWeight: 3,
      leverageKeys: ["Calvin Ogletree", "below the landing", "beat"],
      mattersTo: ["npc_jodie", "npc_marcus"],
      whenTold: { memory: "was told Wade Purvis beat Calvin Ogletree half to death below the landing", crime: true, inquiry: "Chief Bell drives to the county home in Clayburn to see Calvin Ogletree.", news: "Chief Bell drove to Clayburn to see Calvin Ogletree in the county home." },
      history: "Wade Purvis grew up at the landing and has run it since 1989, with Lorna beside him since they married in 1993. His younger brother Dale is in the state penitentiary, and Wade has looked out for Dale's boy Colt since he was fourteen. He drinks one beer at the Low Water every evening and is back at the landing by dark.",
      attitude: -10,
      relations: [{ npcId: "npc_lorna", relation: "wife" }, { npcId: "npc_colt", relation: "nephew" }, { npcId: "npc_dale", relation: "brother" }],
      protector: "nobody",
      home: "loc_purvis_landing",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_colt",
      name: "Colt Purvis",
      pronouns: "he",
      age: 22,
      presence: "here",
      role: "deckhand on the Night Run",
      factionId: "fac_nightrun",
      tags: ["boatman", "smuggler", "dealer", "tough"],
      look: "Wiry kid of twenty-two in a sleeveless shirt and white rubber boots, with a fresh tattoo still peeling on his forearm.",
      voice: "Fast and jumpy; talks over you, calls men 'bro' and women 'ma'am', brags about money he doesn't have, and laughs at things that aren't funny.",
      personality: ["reckless", "boastful"],
      goal: "Make enough money to quit working for his uncle and buy a truck in his own name.",
      secret: "He sells pain pills bought across the river to people at Riverbend, and the bottle Amber Lott died with came from him.",
      secretWeight: 3,
      leverageKeys: ["pills", "Amber", "the bottle"],
      mattersTo: ["npc_tammy", "npc_austin", "npc_marcus"],
      whenTold: { memory: "was told Colt Purvis sold Amber Lott the pills", crime: true, inquiry: "Chief Bell starts asking at Riverbend who sells pills to kids.", news: "Chief Bell has been asking at Riverbend who sells pills to kids." },
      history: "Colt Purvis was fourteen when his father Dale went to the state penitentiary, and he grew up between his uncle's landing and a trailer at Riverbend. He quit school at sixteen to work the boats for Wade. He gets a new tattoo every few months and talks about the truck he is going to buy.",
      attitude: 5,
      relations: [{ npcId: "npc_wade", relation: "uncle" }, { npcId: "npc_lorna", relation: "aunt" }, { npcId: "npc_trent", relation: "friend" }, { npcId: "npc_dale", relation: "father" }],
      protector: "npc_wade",
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_marcus",
      name: "Marcus Bell",
      pronouns: "he",
      age: 50,
      presence: "here",
      role: "chief of police",
      factionId: "fac_police",
      tags: ["police", "watch", "chief"],
      look: "Tall, heavy-shouldered man of fifty in a pressed uniform shirt gone tight at the buttons, with a shaved head and a limp he hides badly.",
      voice: "Courteous and relentless; says 'sir' and 'ma'am', asks the same question three different ways, and writes your answers in a pocket notebook while you watch him do it.",
      personality: ["methodical", "stubborn"],
      goal: "Make a bust big enough to save his department before the council votes to dissolve it, and prove the bridge report was bought.",
      secret: "He has known for months that Travis Cagle takes Night Run money and has let it go on, because he needs Travis on the payroll until the vote and on the witness stand after it.",
      history: "Marcus Bell left the Calder police for the chief's job in Lockett's Ferry in 2010, after a knee injury ended his patrol days. He lives in a room behind the station and calls his sister Celeste every Sunday night. The council has tried to cut his budget every year he has been here.",
      attitude: -5,
      relations: [{ npcId: "npc_travis", relation: "employee" }, { npcId: "npc_nikki", relation: "employee" }, { npcId: "npc_glenda", relation: "employee" }, { npcId: "npc_celeste", relation: "sister" }],
      protector: "nobody",
      home: "loc_town_hall",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_travis",
      name: "Travis Cagle",
      pronouns: "he",
      age: 28,
      presence: "here",
      role: "night-shift police officer",
      factionId: "fac_police",
      tags: ["police", "watch"],
      look: "Thick-necked man of twenty-eight in a uniform with the sleeves rolled, a dip of tobacco in his lip and a new watch too nice for his pay.",
      voice: "Loud and buddy-buddy, all 'my man' and 'hoss'; talks about his boat, laughs before his own punchlines, and goes quiet the second anyone mentions money.",
      personality: ["vain", "jumpy"],
      goal: "Keep taking Wade Purvis's money until his boat is paid off, then get on with the county before anyone looks closely.",
      secret: "Wade Purvis pays him three hundred dollars a week to park at the motel during the runs, and he keeps Wade's texts on a second phone in case he ever needs to trade them.",
      secretWeight: 3,
      leverageKeys: ["three hundred a week", "second phone", "park at the motel"],
      mattersTo: ["npc_marcus", "npc_nikki"],
      whenTold: { crime: true },
      history: "Travis Cagle grew up at Riverbend, played linebacker at the county school and joined the town police in 2019. He works nights, lives with Shayla Rawls in her trailer and spends his days off on the river in his bass boat.",
      attitude: 10,
      relations: [{ npcId: "npc_marcus", relation: "boss" }, { npcId: "npc_shayla", relation: "girlfriend" }],
      protector: "npc_marcus",
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_ray",
      name: "Ray Dees",
      pronouns: "he",
      age: 65,
      presence: "here",
      role: "pastor of Riverside Baptist Church",
      factionId: null,
      tags: ["priest", "pastor", "records"],
      look: "Round-faced man of sixty-five in a short-sleeved white shirt and clip-on tie, with a hearing aid and a pocket full of peppermints.",
      voice: "Slow and warm, with a preacher's rhythm even at the gas pump; sometimes answers a hard question with a Bible story, and somehow gets the answer out of you instead.",
      personality: ["kind", "nosy"],
      goal: "Keep the Riverbend families housed and fed through the winter, and bury no more young people this year.",
      secret: "The church's new roof was paid for by an anonymous cash gift that he knows came from Wade Purvis, and he has preached against the Night Run every Sunday since without giving a dollar of it back.",
      history: "Ray Dees has been pastor of Riverside Baptist since 1994 and has married, baptized or buried most of the town. He and Nadine raised their daughter Leah in the Parsonage, and now they are raising her son Micah while she is in treatment in Calder. He drives a trunk full of groceries out to Riverbend every afternoon.",
      attitude: 15,
      relations: [{ npcId: "npc_nadine", relation: "wife" }, { npcId: "npc_micah", relation: "grandson" }, { npcId: "npc_leah", relation: "daughter" }],
      home: "loc_parsonage",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_june",
      name: "June Satterfield",
      pronouns: "she",
      age: 60,
      presence: "here",
      role: "retired nurse who patches people up at her kitchen table",
      factionId: null,
      tags: ["healer", "nurse"],
      look: "Stout woman of sixty in scrub pants and a sweatshirt from a hospital that closed, with her gray hair in a clip and a canvas bag that rattles.",
      voice: "Blunt and clinical; asks what you took and how much before she asks your name, swears mildly, and never tells anyone not to worry.",
      personality: ["unshockable", "tired"],
      goal: "Keep Riverbend's people out of an emergency room forty miles away, and get the pills off the lot without anyone she knows going to prison.",
      secret: "She has reversed four overdoses at Riverbend this fall without reporting one, and three of the four told her they bought from Colt Purvis.",
      history: "June Satterfield was a nurse at the old county hospital in Clayburn for twenty-six years, until it closed in 2019. She and Burl have lived at Riverbend since, and her kitchen table is where Riverbend goes for stitches, blood pressure and bad news. She keeps a bag of supplies by the door.",
      attitude: 5,
      relations: [{ npcId: "npc_burl", relation: "husband" }],
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_dewayne",
      name: "Dewayne Mangum",
      pronouns: "he",
      age: 40,
      presence: "here",
      role: "mechanic in the service bays at Pittman's",
      factionId: null,
      tags: ["mechanic"],
      look: "Short, broad man of forty with grease worked into every knuckle, safety glasses pushed up on a bald head and a shop rag in his back pocket.",
      voice: "Few words, all of them about engines; says 'mm-hm' for yes and 'well' for no, and talks to the truck he's working on more than to you.",
      personality: ["careful", "honest"],
      goal: "Save enough to buy the empty garage on Front Street and stop working out of Royce Pittman's bays.",
      secret: "On the morning of the bridge inspection he towed the engineer's rental car out of a ditch and watched Carter Sturdivant drive the man off to lunch, though the report says he spent the whole day under the spans.",
      history: "Dewayne Mangum learned engines under Wiley Tackett on Front Street and has worked the service bays at Pittman's since 2012. He married Mavis in 2008, and they moved into her mother Inez's house up the river road in 2021 to look after her. He fishes at Purvis Landing most evenings and says about ten words a day.",
      attitude: 0,
      relations: [{ npcId: "npc_mavis", relation: "wife" }, { npcId: "npc_royce", relation: "boss" }, { npcId: "npc_inez", relation: "mother-in-law" }],
      home: "loc_mangum_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_tyler",
      name: "Tyler Rasberry",
      pronouns: "he",
      age: 19,
      presence: "here",
      role: "night clerk at the Riverview Motor Court",
      factionId: null,
      tags: ["informant", "clerk"],
      look: "Gangly young man of nineteen with a patchy beard, a gaming headset round his neck and a phone with a cracked screen always in his hand.",
      voice: "Mumbles and deflects with internet jokes and never meets your eye, then turns precise the moment cash is on the counter: plates, times, room numbers.",
      personality: ["observant", "mercenary"],
      goal: "Save enough cash to leave Lockett's Ferry for good and never work another night shift.",
      secret: "The motel's parking-lot camera has caught Carter Sturdivant handing Jolene Overstreet an envelope every month since spring, and Tyler has copied the clips to a thumb drive he is trying to sell.",
      secretWeight: 1,
      leverageKeys: ["camera", "clips", "thumb drive"],
      mattersTo: ["npc_carter"],
      mercenary: true,
      history: "Tyler Rasberry finished at the county school in May and took the night desk at the motor court because it was the only job going. He shares a trailer at Riverbend with his cousin Brianna, who cleans the rooms he rents out, and plays games online on the motel wifi until dawn.",
      attitude: 5,
      relations: [{ npcId: "npc_mavis", relation: "boss" }, { npcId: "npc_brianna", relation: "cousin" }],
      protector: "npc_mavis",
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_tammy",
      name: "Tammy Lott",
      pronouns: "she",
      age: 42,
      presence: "here",
      role: "cook at the Low Water",
      factionId: null,
      tags: ["cook", "bereaved"],
      look: "Hollow-eyed woman of forty-two in a hairnet and a stained Low Water T-shirt, with her daughter's name tattooed fresh on the inside of her wrist.",
      voice: "Hoarse and short; says exactly what she thinks in as few words as possible, swears at the grill, and goes very calm and polite when she is angriest.",
      personality: ["grieving", "relentless"],
      goal: "See whoever sold Amber the pills that killed her locked up or run out of town.",
      secret: "She took a tire iron to Colt Purvis's truck the week after the funeral, and Wade Purvis paid for the windshield himself and told her the next one would cost her more.",
      history: "Tammy Lott has cooked at the Low Water since 2010 and raised Amber and Austin on her own in the Lott Trailer. Since Amber died in August she has worked every shift Loretta will give her. She put up the cross by the Riverbend mailboxes and the sign in her front window.",
      attitude: -5,
      start: { trust: -15 },
      relations: [{ npcId: "npc_loretta", relation: "boss" }, { npcId: "npc_austin", relation: "son" }, { npcId: "npc_amber", relation: "daughter" }],
      protector: "npc_loretta",
      home: "loc_lott_trailer",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_mavis",
      name: "Mavis Mangum",
      pronouns: "she",
      age: 41,
      presence: "here",
      role: "night manager at the Riverview Motor Court",
      factionId: null,
      tags: ["clerk", "manager"],
      look: "Small, sharp-faced woman of forty-one with dyed black hair scraped into a clip, a motel key ring on a coiled cord around her wrist and an unlit cigarette behind one ear.",
      voice: "Clipped and sour; tells you what a thing will cost her before she says yes or no, calls people mister or miss like a complaint, and jingles her keys when she wants you gone.",
      personality: ["bitter", "shrewd"],
      goal: "Keep the motor court open and her job with it, which means keeping the old bridge, and talk Dewayne out of the Front Street garage.",
      secret: "In the spring she emptied the account Dewayne was saving for the garage to pay off a note Sturdivant Land and Timber held on her late mother's house, and she has been putting it back out of the motel till one cash room at a time.",
      secretWeight: 3,
      leverageKeys: ["garage account", "mother's note", "motel till"],
      mattersTo: ["npc_dewayne"],
      history: "Mavis Mangum, born Mavis Crocker, grew up in the white frame house up the river road and has run the motor court's night desk since 2016. She married Dewayne in 2008, came home in 2021 to care for her mother Inez and kept the house when Inez died. She answers to Stanley Wexler by email and to nobody in person.",
      attitude: -5,
      relations: [{ npcId: "npc_dewayne", relation: "husband" }, { npcId: "npc_tyler", relation: "employee" }, { npcId: "npc_brianna", relation: "employee" }, { npcId: "npc_inez", relation: "mother" }, { npcId: "npc_stanley", relation: "boss" }],
      home: "loc_mangum_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_darlene",
      name: "Darlene Pittman",
      pronouns: "she",
      age: 54,
      presence: "here",
      role: "Royce's wife, who keeps the books at Pittman's",
      factionId: null,
      tags: ["bookkeeper"],
      look: "Tall, careful woman in her fifties with a short silver bob, a blouse buttoned to the collar and a pencil she taps against her teeth while she adds.",
      voice: "Polite and exact; answers questions about Royce with figures instead of feelings, slips into talking about him in the past tense, and excuses herself to get back to the books.",
      personality: ["proud", "watchful"],
      goal: "Keep the station and the house out of Carter Sturdivant's hands, however Royce votes.",
      secret: "She has known about Royce and Loretta Gaddis for years and keeps a folder of dates and photographs in the station safe, to use the day Royce tries to sign anything without her.",
      history: "Darlene Pittman grew up in Clayburn, married Royce in 1996 and has kept the station's books ever since. She runs the church flower committee, never misses one of Kaylee's games and is the one in the family who reads the fine print.",
      attitude: 0,
      relations: [{ npcId: "npc_royce", relation: "husband" }, { npcId: "npc_kaylee", relation: "daughter" }],
      home: "loc_pittman_place",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_kaylee",
      name: "Kaylee Pittman",
      pronouns: "she",
      age: 16,
      presence: "here",
      role: "Royce's daughter, who works the register after school",
      factionId: null,
      tags: ["teenager", "cashier", "teen"],
      look: "Sixteen-year-old girl with a long brown ponytail, a softball team hoodie and nails painted the green of the station sign.",
      voice: "Deadpan; answers in as few words as she can get away with, then says out loud the one thing about you nobody else noticed.",
      personality: ["bored", "sharp"],
      goal: "Win a softball scholarship and get out of town before her parents stop pretending.",
      secret: "She drives her father's truck up to the water tower at night for signal, and she has seen Travis Cagle's patrol car parked dark behind the motor court every night the boats go across.",
      history: "Kaylee Pittman is a junior at the county school and the starting pitcher on its softball team. She works the register at the station after school and on weekends. Her grandfather Clyde's photo over the register is the one thing at the station she will not let anyone move.",
      attitude: 5,
      relations: [{ npcId: "npc_royce", relation: "father" }, { npcId: "npc_darlene", relation: "mother" }, { npcId: "npc_clyde", relation: "grandfather" }],
      home: "loc_pittman_place",
      awayOn: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], phases: ["morning", "afternoon"], where: "at the county school in Clayburn" },
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_nadine",
      name: "Nadine Dees",
      pronouns: "she",
      age: 63,
      presence: "here",
      role: "church secretary and pianist at Riverside Baptist",
      factionId: null,
      tags: ["records", "secretary", "gossip"],
      look: "Plump, bright-eyed woman of sixty-three in a holiday sweater whatever the season, with reading glasses pushed up into her curls.",
      voice: "Chirpy and thorough; reads records aloud in full, including the parts you did not ask for, and says bless you when she means go away.",
      personality: ["fussy", "kind"],
      goal: "Keep the church records straight and the fellowship hall pantry stocked through the winter.",
      secret: "For forty dollars a time she has changed names and dates in the baptism and membership books for people who needed a different past, and the torn-out pages, the oldest one torn out for her own daughter Leah, are in a shoebox in the parsonage closet that Ray has never opened.",
      secretWeight: 3,
      leverageKeys: ["baptism book", "torn-out pages", "shoebox"],
      mattersTo: ["npc_ray"],
      whenTold: { crime: true },
      history: "Nadine Dees has been church secretary and pianist at Riverside Baptist since 1994. She keeps the baptism and membership books, runs the pantry in the fellowship hall and knows everybody's birthday. Since July she has been raising her grandson Micah while her daughter Leah is in treatment.",
      attitude: 10,
      relations: [{ npcId: "npc_ray", relation: "husband" }, { npcId: "npc_micah", relation: "grandson" }, { npcId: "npc_leah", relation: "daughter" }],
      home: "loc_parsonage",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_micah",
      name: "Micah Dees",
      pronouns: "he",
      age: 17,
      presence: "here",
      role: "Ray's grandson, who works the Purvis Landing bait shop",
      factionId: null,
      tags: ["teenager", "lookout", "teen"],
      look: "Lanky seventeen-year-old boy with a grown-out buzz cut, a church camp T-shirt and fish scales dried on his jeans.",
      voice: "Says yes ma'am and no sir on reflex, then mumbles the true answer right after, as if he hopes you missed it.",
      personality: ["earnest", "restless"],
      goal: "Pay for another month of his mother's treatment program in the city without his grandparents finding out where the money comes from.",
      secret: "Wade Purvis pays him fifty dollars a night to sit in the dark bait shop and flash the dock light twice when a patrol car comes down the river road.",
      secretWeight: 2,
      leverageKeys: ["dock light", "fifty dollars a night", "patrol car"],
      mattersTo: ["npc_ray", "npc_nadine"],
      whenTold: { crime: true },
      history: "Micah Dees moved into the Parsonage with his grandparents in July, when his mother Leah went into the Willows in Calder. He is a senior at the county school and works the bait shop at Purvis Landing for Lorna Purvis. He goes to see his mother every Sunday his grandfather can drive him.",
      attitude: 5,
      relations: [{ npcId: "npc_ray", relation: "grandfather" }, { npcId: "npc_nadine", relation: "grandmother" }, { npcId: "npc_lorna", relation: "boss" }, { npcId: "npc_leah", relation: "mother" }],
      home: "loc_parsonage",
      awayOn: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], phases: ["morning", "afternoon"], where: "at the county school in Clayburn" },
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_austin",
      name: "Austin Lott",
      pronouns: "he",
      age: 15,
      presence: "here",
      role: "Tammy's son, Amber Lott's little brother",
      factionId: null,
      tags: ["teenager", "teen", "bereaved"],
      look: "Skinny fifteen-year-old boy in a hand-me-down Army jacket, with a bike he never locks and his sister's name written on his sneakers in marker.",
      voice: "Says almost nothing to grown-ups, then asks one question too exact for his age, like what time somebody's truck usually leaves.",
      personality: ["watchful", "angry"],
      goal: "Prove that Colt Purvis sold Amber the pills and put the proof in front of someone who will act on it.",
      secret: "He has followed Colt on his bike for weeks and knows about the tackle box on the girder under the first span of the old bridge, but he will not tell anyone until he can hand it to the state police himself.",
      history: "Austin Lott is a freshman at the county school when he goes, and rides his bike everywhere else. Since his sister Amber died in August he has stopped talking to most grown-ups. Annette Overstreet is the one teacher who still gets an answer out of him.",
      attitude: 0,
      start: { trust: -15 },
      relations: [{ npcId: "npc_tammy", relation: "mother" }, { npcId: "npc_amber", relation: "sister" }],
      home: "loc_lott_trailer",
      awayOn: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], phases: ["morning", "afternoon"], where: "at the county school in Clayburn" },
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_odessa",
      name: "Odessa Fairley",
      pronouns: "she",
      age: 66,
      presence: "here",
      role: "housekeeper and companion to Vada Sturdivant",
      factionId: null,
      tags: ["housekeeper"],
      look: "Tall, gray-haired woman of sixty-six in a starched apron over a church dress, with a small silver cross at her throat and shoes that make no sound.",
      voice: "Soft and exact; says Miss Vada says when she means herself, and hums a hymn under her breath when she disapproves of what you just said.",
      personality: ["discreet", "stubborn"],
      goal: "Keep Miss Vada in her own house to the end, the way she promised her.",
      secret: "Carter has offered her five thousand dollars to tell Dr. Sayle that Vada wanders at night and leaves the stove on, and she has not said no yet, because Sturdivant Land and Timber holds the note on her sister's house.",
      history: "Odessa Fairley grew up in Clayburn and has kept house for Vada Sturdivant since 1979, the year Amos Sturdivant died. She lives in the back bedroom of Sturdivant House, sings in the choir at Riverside Baptist and drives to see her sister Corinne on her Sunday afternoons off.",
      attitude: 0,
      start: { trust: -10 },
      relations: [{ npcId: "npc_vada", relation: "boss" }, { npcId: "npc_corinne", relation: "sister" }],
      protector: "npc_vada",
      home: "loc_sturdivant_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_lyman",
      name: "Lyman Coker",
      pronouns: "he",
      age: 70,
      presence: "here",
      role: "night bartender at the Low Water",
      factionId: null,
      tags: ["bartender", "elderly", "cardplayer"],
      look: "Gaunt man of seventy in a pearl-snap shirt, with an oxygen tube looped over his ears and a ledger of bar tabs in his shirt pocket.",
      voice: "Gloomy and courteous; expects the worst of everyone and thanks you, sincerely, when you prove him right.",
      personality: ["gloomy", "honest"],
      goal: "Keep his regulars paid up and out of trouble, and keep the job long enough to never see the county home.",
      secret: "He reads every letter and package anyone leaves with him before he hands it over, and he has steamed open two envelopes Carter Sturdivant left at the bar for Jolene Overstreet.",
      secretWeight: 2,
      leverageKeys: ["steamed", "envelopes", "Carter's letters"],
      mattersTo: ["npc_loretta"],
      history: "Lyman Coker drove a log truck for thirty years until his lungs gave out, and has tended bar nights at the Low Water since 2015. He rents a room by the week at the motor court and plays cribbage with Curtis Pruett between customers.",
      attitude: 0,
      relations: [{ npcId: "npc_loretta", relation: "boss" }, { npcId: "npc_curtis", relation: "friend" }],
      protector: "npc_loretta",
      home: "loc_motor_court",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_elbert",
      name: "Elbert Gentry",
      pronouns: "he",
      age: 88,
      presence: "here",
      role: "the oldest man in town and on the town council, whose granddaddy ran the last ferry",
      factionId: null,
      tags: ["oldtimer", "council", "elderly", "cardplayer"],
      look: "Bent, bright-eyed man of eighty-eight in suspenders and a cap from the 1982 bass tournament, with a cane carved from a cypress knee.",
      voice: "Tells you the year of everything, and corrects other people's stories about the river with the date it really happened and who drowned.",
      personality: ["sly", "garrulous"],
      goal: "See the old bridge stand until he is buried, because his granddaddy lost the ferry to it and made his peace.",
      secret: "As a boy after the war he rowed whiskey across the river for Amos Sturdivant, and the Gentry family Bible on his nightstand holds a page in his granddaddy Asa's hand naming who Amos paid at the state highway department in 1938.",
      history: "Elbert Gentry was born in the Gentry House in 1938, the year the bridge opened and his granddaddy Asa's ferry closed. He worked at the paper mill for forty years, has sat on the town council since 1983 and spends his mornings on the Front Street bench and his afternoons at the Low Water. His sister Pearl and his granddaughter Glenda live with him.",
      attitude: 10,
      relations: [{ npcId: "npc_pearl", relation: "sister" }, { npcId: "npc_glenda", relation: "granddaughter" }, { npcId: "npc_asa", relation: "grandfather" }],
      home: "loc_gentry_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_pearl",
      name: "Pearl Gentry",
      pronouns: "she",
      age: 79,
      presence: "here",
      role: "columnist for the county weekly",
      factionId: null,
      tags: ["records", "writer", "gossip", "elderly"],
      look: "Tiny woman of seventy-nine in a lavender pantsuit, with a steno pad in her purse and a pencil stuck through her white bun.",
      voice: "Talks in newspaper headlines, asks for the spelling of your name before she asks anything else, and writes your answers down whether you like it or not.",
      personality: ["nosy", "fair"],
      goal: "Write the true story of the bridge vote before somebody from the city writes a wrong one.",
      secret: "She has kept every birth, marriage and death notice the town printed in fifty years, with the ones families paid her to leave out, and one of those is about Carter Sturdivant.",
      history: "Pearl Gentry has written the Lockett's Ferry column in the county weekly since 1975: births, deaths, church news and who had company. She clerked at the courthouse in Clayburn for thirty years and moved back into the Gentry House with her brother Elbert when she retired. She walks down to Town Hall every afternoon to read the council papers.",
      attitude: 5,
      relations: [{ npcId: "npc_elbert", relation: "brother" }, { npcId: "npc_asa", relation: "grandfather" }],
      home: "loc_gentry_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_glenda",
      name: "Glenda Pryor",
      pronouns: "she",
      age: 40,
      presence: "here",
      role: "police dispatcher and clerk at Town Hall",
      factionId: "fac_police",
      tags: ["dispatcher", "informant"],
      look: "Broad, freckled woman of forty with a dispatch headset pushed back in her red hair and a cardigan pocket full of pens.",
      voice: "Talks in radio shorthand out of habit, ten-four and what is your twenty, and repeats the last thing you said back to you as a question.",
      personality: ["curious", "loyal"],
      goal: "Keep her job, and her grandfather's medicine paid for, when the council votes on the police.",
      secret: "She tapes every call that comes into the station on a cassette recorder under the desk, including the one that warned Wade Purvis's people the chief was on his way to the ramp.",
      secretWeight: 3,
      leverageKeys: ["tapes", "cassette", "warning call"],
      mattersTo: ["npc_marcus"],
      whenTold: { crime: true },
      history: "Glenda Pryor grew up in the Gentry House with her grandfather Elbert and has dispatched for the town police since 2007. She knows every voice that calls the station and most of what they want. She keeps Elbert's medicines straight and drives him to his appointments in Calder.",
      attitude: 5,
      relations: [{ npcId: "npc_elbert", relation: "grandfather" }, { npcId: "npc_marcus", relation: "boss" }],
      protector: "npc_marcus",
      home: "loc_gentry_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_nikki",
      name: "Nikki Ballard",
      pronouns: "she",
      age: 31,
      presence: "here",
      role: "day-shift police officer",
      factionId: "fac_police",
      tags: ["police", "watch"],
      look: "Compact, sunburned woman of thirty-one with a tight braid, a vest one size too big and mirrored sunglasses she takes off to look at you.",
      voice: "Brisk and dry; asks for your ID before small talk, answers a joke with the single word noted, and never fills a silence.",
      personality: ["disciplined", "ambitious"],
      goal: "Keep a badge when the department dissolves, here or with the county.",
      secret: "She has already interviewed with the county sheriff and promised to bring him Chief Bell's case files if the council votes the department out.",
      secretWeight: 3,
      leverageKeys: ["the sheriff", "case files", "interviewed"],
      mattersTo: ["npc_marcus", "npc_glenda"],
      history: "Nikki Ballard came from the police academy two years ago and is the department's only day officer. She rents the apartment over Byrd's Pawn from Hollis Byrd, runs five miles on the river road every morning and keeps to herself.",
      attitude: -5,
      relations: [{ npcId: "npc_marcus", relation: "boss" }, { npcId: "npc_hollis", relation: "landlord" }],
      protector: "npc_marcus",
      home: "loc_byrd_apartment",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_virgil",
      name: "Virgil Odom",
      pronouns: "he",
      age: 72,
      presence: "here",
      role: "retired state bridge inspector who fishes the pier",
      factionId: null,
      tags: ["inspector", "fisherman", "elderly"],
      look: "Lean, stooped man of seventy-two in a faded state highway cap, with a rusty tape measure clipped to his belt and a bucket of cut bait.",
      voice: "Speaks in load ratings and rust, ends an opinion with that is not my opinion, that is steel, and taps whatever he leans on to listen to it.",
      personality: ["precise", "lonely"],
      goal: "Get someone to read his own inspection reports before the state tears down a bridge he says is good for twenty more years.",
      secret: "Warren Pettit, the engineer the state sent, called him the week before the inspection to ask what the bridge would need to fail, and Virgil told him, and has been ashamed of it every day since.",
      secretWeight: 2,
      leverageKeys: ["Warren Pettit", "what it would need to fail", "called him"],
      mattersTo: ["npc_lamar"],
      history: "Virgil Odom inspected bridges for the state highway department for thirty-four years and inspected the old bridge eleven times. His daughter Ruth died three winters ago, and he moved out to the Haskins Farm with Lamar and Trent the next spring. He fishes off the pier under the first span most afternoons.",
      attitude: 5,
      relations: [{ npcId: "npc_lamar", relation: "son-in-law" }, { npcId: "npc_trent", relation: "grandson" }, { npcId: "npc_ruth", relation: "daughter" }],
      home: "loc_haskins_farm",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_annette",
      name: "Annette Overstreet",
      pronouns: "she",
      age: 34,
      presence: "here",
      role: "seventh-grade teacher at the county middle school",
      factionId: null,
      tags: ["teacher"],
      look: "Slight woman of thirty-four with short dark hair, chalk dust on one sleeve and a tote bag of ungraded papers she carries everywhere.",
      voice: "Patient and precise; explains things in numbered steps whether you asked or not, and checks with make sense? before she lets you go.",
      personality: ["patient", "principled"],
      goal: "Keep Austin Lott in school through the spring, and keep Micah Dees from quitting before he graduates.",
      secret: "She is the one who called the state about the bridge, after a loaded log truck passed her on the first span and she felt the deck drop under her car, and she has never told anyone in town, least of all Jolene.",
      secretWeight: 1,
      leverageKeys: ["called the state", "log truck", "deck dropped"],
      mattersTo: ["npc_jolene"],
      history: "Annette Overstreet teaches seventh grade at the county school in Clayburn and came home to the yellow house in 2022 after six years teaching in Calder. She tutors Austin Lott and Micah Dees at the church on Wednesday nights. She and her mother disagree about almost everything.",
      attitude: 5,
      relations: [{ npcId: "npc_jolene", relation: "mother" }, { npcId: "npc_gerald", relation: "father" }],
      home: "loc_overstreet_house",
      awayOn: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], phases: ["morning", "afternoon"], where: "at the county school in Clayburn" },
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_gerald",
      name: "Gerald Overstreet",
      pronouns: "he",
      age: 61,
      presence: "here",
      role: "Jolene's husband, retired from the paper mill",
      factionId: null,
      tags: ["retired", "gossip"],
      look: "Big, slow man of sixty-one in house slippers and a mill union jacket, with a police scanner clipped to his belt and turned up loud.",
      voice: "Starts half of what he says with scanner says, repeats every call he heard that day, and calls his wife the mayor even at supper.",
      personality: ["gossipy", "gentle"],
      goal: "Get Jolene to quit before whatever she is mixed up in comes out.",
      secret: "He found Jolene's envelope of cash in the chest freezer last spring, counted it and put it back, and he has written down every date it got fatter.",
      history: "Gerald Overstreet ran the paper machines at the mill for thirty-three years until it closed in 2016. He married Jolene in 1991, keeps the house and the scanner going and repeats the day's calls at supper. He has not been much past the end of the drive since his knees went.",
      attitude: 5,
      relations: [{ npcId: "npc_jolene", relation: "wife" }, { npcId: "npc_annette", relation: "daughter" }],
      home: "loc_overstreet_house",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_lamar",
      name: "Lamar Haskins",
      pronouns: "he",
      age: 58,
      presence: "here",
      role: "farmer and council member who leases Sturdivant land",
      factionId: null,
      tags: ["farmer", "council"],
      look: "Thick, weathered man of fifty-eight in a seed company cap and mud-caked boots, with a farmer's tan that stops at his sleeves.",
      voice: "Slow and careful; talks in acres, bushels and inches of rain, and checks the sky before he answers anything hard.",
      personality: ["practical", "worried"],
      goal: "Get the downstream bridge built across the fields he leases, because Carter promised him a buyout that would clear his equipment loans.",
      secret: "He has already signed Carter's option papers on the lease, which he had no right to do while Vada is alive, and the check is sitting uncashed in his glove box.",
      secretWeight: 3,
      leverageKeys: ["option papers", "uncashed check", "glove box"],
      mattersTo: ["npc_vada"],
      history: "Lamar Haskins has farmed the family land and the leased Sturdivant bottomland since he was twenty, and has sat on the town council for eight years. His wife Ruth died three winters ago, and he lives at the farm with their son Trent and Ruth's father Virgil.",
      attitude: 0,
      relations: [{ npcId: "npc_trent", relation: "son" }, { npcId: "npc_virgil", relation: "father-in-law" }, { npcId: "npc_vada", relation: "landlady" }, { npcId: "npc_ruth", relation: "wife" }],
      home: "loc_haskins_farm",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_trent",
      name: "Trent Haskins",
      pronouns: "he",
      age: 24,
      presence: "here",
      role: "Lamar's son, who drives the farm's grain truck",
      factionId: "fac_nightrun",
      tags: ["driver", "smuggler"],
      look: "Broad, easygoing man of twenty-four in a sleeveless camo shirt and a feed-store cap turned backward, with a sunburned neck and a cooler always in reach.",
      voice: "Easy and friendly; calls everybody cuz, is always halfway out the door on some errand, and laughs off a question with gotta run.",
      personality: ["easygoing", "reckless"],
      goal: "Keep his father and his grandfather from finding out what the grain truck carries at night.",
      secret: "Twice a week he drives cases of liquor across the old bridge in the grain truck for Wade Purvis, a hundred pounds under the limit, and his own father's bridge vote would put him out of that work.",
      secretWeight: 2,
      leverageKeys: ["grain truck", "cases of liquor", "under the limit"],
      mattersTo: ["npc_lamar", "npc_virgil"],
      whenTold: { crime: true },
      history: "Trent Haskins drives the farm's grain truck and does whatever hauling anyone will pay for. He was two years ahead of Colt Purvis at the county school and has been his best friend since. His mother Ruth's death hit him hardest of the three men at the farm.",
      attitude: 10,
      relations: [{ npcId: "npc_lamar", relation: "father" }, { npcId: "npc_virgil", relation: "grandfather" }, { npcId: "npc_colt", relation: "friend" }, { npcId: "npc_ruth", relation: "mother" }],
      protector: "npc_wade",
      home: "loc_haskins_farm",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_leon",
      name: "Leon Varner",
      pronouns: "he",
      age: 47,
      presence: "here",
      role: "repo man who buys bad debts for a title-loan outfit",
      factionId: null,
      tags: ["collector", "repo", "enemy", "tough"],
      look: "Heavy man of forty-seven in a golf shirt and wraparound sunglasses, with a clipboard under one arm and a tow truck he never turns off.",
      voice: "Polite and slow; calls you friend and works the late fees into every other sentence, the way another man would mention the weather.",
      personality: ["patient", "merciless"],
      goal: "Clear his list of overdue accounts in the county before the month is out, with fees.",
      secret: "He bought most of the debts on his list for a dime on the dollar from the lender Carter Sturdivant uses, and he would settle any of them for half if somebody pushed.",
      mercenary: true,
      history: "Leon Varner has repossessed trucks and collected bad debts in the south end of the county for six years, for Wendell Strunk's title-loan office in Clayburn. He rents a room by the week at the motor court while he works through his list, and nobody is glad to see his tow truck.",
      attitude: -5,
      start: { trust: -15 },
      relations: [{ npcId: "npc_wendell", relation: "boss" }],
      protector: "nobody",
      home: "loc_motor_court",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_curtis",
      name: "Curtis Pruett",
      pronouns: "he",
      age: 52,
      presence: "here",
      role: "insurance man who runs the card game at the Low Water",
      factionId: null,
      tags: ["bookie", "gambler"],
      look: "Dapper man of fifty-two in a short-sleeved dress shirt and a bolo tie, with a pinky ring and a deck of cards he shuffles one-handed.",
      voice: "Puts odds on everything, offers to settle any argument with a bet, and never says a number without saying what it pays.",
      personality: ["charming", "calculating"],
      goal: "Win back the house his wife put him out of, one Friday game at a time.",
      secret: "He takes bets on the bridge vote from both sides, and Royce Pittman owes him eleven hundred dollars he lost on the game in October.",
      canRaise: 200,
      mercenary: true,
      history: "Curtis Pruett sells insurance out of his truck across three counties and has run the card game at the Low Water for fifteen years. His wife Lynette put him out of their house in Clayburn last winter, and he has had a room at the motor court since.",
      attitude: 5,
      relations: [{ npcId: "npc_lyman", relation: "friend" }, { npcId: "npc_lynette", relation: "wife" }],
      home: "loc_motor_court",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_boyd",
      name: "Boyd Teague",
      pronouns: "he",
      age: 50,
      presence: "here",
      role: "stranger who has had Room 9 at the motor court a week",
      factionId: null,
      tags: ["enemy", "parolee", "stranger", "tough"],
      look: "Big, quiet man of fifty in a pressed denim shirt, with a healed scar through one eyebrow and knuckles like walnuts.",
      voice: "Says very little, all of it polite, and always uses a person's full name, first and last, as if he were reading it off a list.",
      personality: ["patient", "vindictive"],
      goal: "Settle an old account with someone in Lockett's Ferry, quietly, and be gone before the law notices him.",
      secret: "He left his parole two states over without permission, so one phone call would send him back; he came for Wade Purvis, who gave his name to the law in 2018 to keep his own out of Dale's case, and Wade's is the first name on his list.",
      history: "Boyd Teague checked into Room 9 at the motor court a week ago and paid two weeks in cash. Nobody in town knows where he came from or what he wants, and he has not said. He keeps to his room in the mornings and walks out on the old bridge every afternoon to look down at the landing.",
      attitude: -10,
      start: { trust: -40 },
      axes: { g: -2 },
      relations: [],
      protector: "nobody",
      home: "loc_motor_court",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_jodie",
      name: "Jodie Strayhorn",
      pronouns: "she",
      age: 29,
      presence: "here",
      role: "new waitress at the Low Water",
      factionId: null,
      tags: ["waitress", "stranger", "runaway"],
      look: "Wiry woman of twenty-nine with bleached hair growing out dark, a Low Water apron and a fading bruise she covers with makeup.",
      voice: "Quick and bright with the customers, then flat and careful the second anyone asks where she is from, and she changes the subject to the specials.",
      personality: ["guarded", "resourceful"],
      goal: "Find out who beat her uncle half to death below the landing, and leave before anyone learns her real name.",
      secret: "Her real name is Jodie Ogletree: she is Bernice Ogletree's daughter, she skipped bail in the next state over, and she took the job at the Low Water to find out who beat her uncle Calvin below the landing.",
      history: "Jodie Strayhorn turned up at the Low Water three weeks ago asking for work, and Loretta hired her that night. She sleeps in the back room of the bar, works every shift she can get and says she is from up north when anyone asks.",
      attitude: -5,
      start: { trust: -25 },
      relations: [{ npcId: "npc_loretta", relation: "boss" }],
      protector: "npc_loretta",
      home: "loc_low_water",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_lorna",
      name: "Lorna Purvis",
      pronouns: "she",
      age: 55,
      presence: "here",
      role: "Wade's wife, who runs the bait shop at Purvis Landing",
      factionId: null,
      tags: ["shopkeeper", "witness"],
      look: "Round, cheerful woman of fifty-five in rubber clogs, with a fishing-lure earring in one ear and a tub of crickets on the counter beside her.",
      voice: "Bait-shop chatter about what is biting and where, and the moment you ask about Wade, a bright you would have to ask him.",
      personality: ["cheerful", "loyal"],
      goal: "Keep the landing, the shop and her husband out of court until they can sell up and go.",
      secret: "Calvin Ogletree, the man Wade beat half to death for cutting in on the run, is alive in the county home in Clayburn, and she sends his sister Bernice two hundred dollars every month out of the bait shop till.",
      history: "Lorna Purvis married Wade in 1993 and has run the bait shop at the landing ever since. She knows what is biting, who caught it and who is lying about it. She has fed her nephew Colt since his father Dale went away, and pays Micah Dees to help in the shop.",
      attitude: 5,
      relations: [{ npcId: "npc_wade", relation: "husband" }, { npcId: "npc_colt", relation: "nephew" }, { npcId: "npc_micah", relation: "employee" }, { npcId: "npc_dale", relation: "brother-in-law" }],
      home: "loc_purvis_landing",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_brianna",
      name: "Brianna Tolliver",
      pronouns: "she",
      age: 23,
      presence: "here",
      role: "housekeeper at the Riverview Motor Court",
      factionId: null,
      tags: ["maid"],
      look: "Pale, thin young woman of twenty-three in a motel smock, with chipped nail polish and a hospital bracelet she has not cut off.",
      voice: "Soft and quick; apologizes before she says anything, sorry, sorry, and says thank you twice for anything at all.",
      personality: ["shy", "grateful"],
      goal: "Stay clean, keep the job and save enough for a used car that runs.",
      secret: "She is one of the four people June Satterfield brought back from an overdose this fall, and she still owes Colt Purvis forty dollars for the pills.",
      history: "Brianna Tolliver grew up at Riverbend with her cousin Tyler, shares a trailer there with him and has cleaned rooms at the motor court since the spring. She is saving for a car and walks to work along the highway in the meantime.",
      attitude: 5,
      relations: [{ npcId: "npc_mavis", relation: "boss" }, { npcId: "npc_tyler", relation: "cousin" }],
      protector: "npc_mavis",
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_shayla",
      name: "Shayla Rawls",
      pronouns: "she",
      age: 25,
      presence: "here",
      role: "hairdresser who works out of her trailer at Riverbend",
      factionId: null,
      tags: ["hairdresser", "informant"],
      look: "Pretty, round-faced woman of twenty-five in a hairdresser's smock, with a vape pen in one hand and two phones in the other.",
      voice: "Sweet and sticky; calls you sugar and asks three personal questions for every one you answer.",
      personality: ["nosy", "greedy"],
      goal: "Turn what she hears in her chair into enough cash to open a real salon at the county seat.",
      secret: "She found Travis's second phone and photographed every text on it, and she is deciding whether to sell the pictures to Chief Bell or to Wade Purvis.",
      mercenary: true,
      history: "Shayla Rawls went to beauty school in Calder and came back to do hair out of her trailer at Riverbend for fifteen dollars a cut. Travis Cagle has lived with her since last year, and half the town's news passes through her chair.",
      attitude: 5,
      relations: [{ npcId: "npc_travis", relation: "boyfriend" }],
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_dwight",
      name: "Dwight Spann",
      pronouns: "he",
      age: 49,
      presence: "here",
      role: "timber foreman for Sturdivant Land and Timber",
      factionId: "fac_sturdivant",
      tags: ["foreman", "tough"],
      look: "Rangy man of forty-nine in a hi-vis vest over a flannel shirt, with a can of survey paint in his hand and sunflower-seed shells on his boots.",
      voice: "Few words and a lot of spat sunflower seeds; never says Carter, only Mr. Sturdivant, and answers anything else with that is above my pay.",
      personality: ["dutiful", "hard"],
      goal: "Keep his crew working through the winter by doing whatever Mr. Sturdivant asks.",
      secret: "On Carter's orders he moved the survey stakes for the downstream bridge off the Haskins forty and onto the Sturdivant bottomland the night before the state crew came, so the state would have to buy its right-of-way from the Sturdivants.",
      secretWeight: 2,
      leverageKeys: ["survey stakes", "moved", "Haskins forty"],
      mattersTo: ["npc_lamar"],
      whenTold: { crime: true },
      history: "Dwight Spann has run a Sturdivant Land and Timber crew in the pine upriver for eighteen years, since Harlan Voss hired him. He lives alone in a trailer at Riverbend and goes up to Sturdivant House every morning for his orders.",
      attitude: -5,
      start: { trust: -10 },
      relations: [{ npcId: "npc_carter", relation: "boss" }],
      protector: "npc_carter",
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_burl",
      name: "Burl Satterfield",
      pronouns: "he",
      age: 66,
      presence: "here",
      role: "June's husband, who fixes outboard motors",
      factionId: null,
      tags: ["outboard", "retired"],
      look: "Wide, red-faced man of sixty-six in bib overalls, with a lineman's scarred hands and a bent outboard propeller he files smooth while he talks.",
      voice: "Talks too loud after forty years around power lines, says what's that? and then answers what he thought you said.",
      personality: ["cheerful", "stubborn"],
      goal: "Keep June from wearing herself out on everybody at Riverbend.",
      secret: "He rebuilt the motors on two of Wade Purvis's johnboats this fall for cash and told June the money came from his pension.",
      secretWeight: 1,
      leverageKeys: ["johnboats", "rebuilt the motors", "pension"],
      mattersTo: ["npc_june"],
      history: "Burl Satterfield climbed power poles for the co-op for forty years and retired in 2019 with a pension and bad hearing. He and June moved to Riverbend that year, and he fixes outboard motors for anyone at the landing who brings him one. Wiley Tackett was his best friend.",
      attitude: 5,
      relations: [{ npcId: "npc_june", relation: "wife" }, { npcId: "npc_wiley", relation: "friend" }],
      home: "loc_riverbend",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_amber",
      name: "Amber Lott",
      pronouns: "she",
      age: 19,
      presence: "dead",
      died: "August 2026, an overdose at Riverbend",
      buried: "loc_cemetery",
      role: "Tammy's daughter, who died at nineteen",
      factionId: null,
      tags: ["dead"],
      look: "Remembered as a freckled girl of nineteen with a pink streak dyed in her hair, a nose ring and a laugh you could hear from the far end of the Riverbend loop.",
      voice: "Talked fast and loud and called everybody by a nickname she had made up for them, and her mother still uses a few of them without meaning to.",
      personality: ["funny", "restless"],
      goal: "Wanted to finish a nursing assistant course in Clayburn and get herself and her brother out of Riverbend.",
      secret: "She had been clean for two months when she died, and the pills that killed her were the first she had bought since telling June Satterfield she was done with them.",
      history: "Amber grew up in the Lott Trailer and worked a drive-through window in Clayburn after she quit school. She died at Riverbend in August, at nineteen, and is buried in Riverside Cemetery under a funeral-home marker until there is money for a stone.",
      attitude: 0,
      relations: [{ npcId: "npc_tammy", relation: "mother" }, { npcId: "npc_austin", relation: "brother" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_ruth",
      name: "Ruth Haskins",
      pronouns: "she",
      age: 47,
      presence: "dead",
      died: "January 2024, cancer",
      buried: "loc_cemetery",
      role: "Lamar's late wife and Virgil's daughter",
      factionId: null,
      tags: ["dead"],
      look: "Remembered as a tall, sunburned woman of forty-seven in a seed company cap, who drove the grain truck herself at harvest.",
      voice: "Laughed at her own jokes before she got to the end of them, and said well, bless it whenever anything broke on the farm.",
      personality: ["capable", "warm"],
      goal: "Wanted to see the farm paid off and Trent settled before she was fifty.",
      secret: "The year before she died she told her father the farm was two seasons from losing its equipment, and made him promise never to let Lamar sell out to the Sturdivants.",
      history: "Ruth was Virgil Odom's only daughter and married Lamar Haskins at twenty-two. She kept the farm's books, drove the grain truck at harvest and taught Sunday school at Riverside Baptist until the cancer. She died three winters ago, and her father moved out to the farm the spring after.",
      attitude: 0,
      relations: [{ npcId: "npc_lamar", relation: "husband" }, { npcId: "npc_virgil", relation: "father" }, { npcId: "npc_trent", relation: "son" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_amos",
      name: "Amos Sturdivant",
      pronouns: "he",
      age: 74,
      presence: "dead",
      died: "spring of 1979, a stroke",
      buried: "loc_cemetery",
      role: "Vada's father, who fought the state for the bridge in 1938",
      factionId: null,
      tags: ["dead"],
      look: "Known from one photograph in Town Hall: a lean man in a white suit at the bridge ribbon-cutting in 1938, hat in hand and squinting at the camera.",
      voice: "Said to have talked like a preacher and bargained like a horse trader, and never to have written down a promise he could make out loud.",
      personality: ["shrewd", "proud"],
      goal: "Wanted a bridge at Lockett's Ferry with the Sturdivant name on the plaque, and got both.",
      secret: "He ran whiskey into the dry county from the 1920s into the 1950s, the last years with Elbert Gentry rowing it, and the cash he paid the state highway department in 1938 is why the bridge was built here and not somewhere else.",
      history: "Amos Sturdivant bought the bottomland and the hill in the 1920s and built Sturdivant House. He spent three years fighting the state for a bridge and stood on it the day it opened in 1938. His name is on the plaque at the town end of the old bridge.",
      attitude: 0,
      relations: [{ npcId: "npc_vada", relation: "daughter" }, { npcId: "npc_carter", relation: "grandson" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_harlan",
      name: "Harlan Voss",
      pronouns: "he",
      age: 71,
      presence: "dead",
      died: "October 2014, a heart attack in the timber woods",
      buried: "loc_cemetery",
      role: "Vada's late husband and Carter's father, who ran the timber side of the business",
      factionId: null,
      tags: ["dead"],
      look: "Remembered as a heavy, red-faced man of seventy-one in khaki work clothes and a straw hat, with a tally book in his shirt pocket and mud to the knees.",
      voice: "Talked timber prices to anyone who would listen, called every man buddy, and could not tell a story without starting it in the woods.",
      personality: ["hardworking", "blustering"],
      goal: "Wanted Sturdivant Land and Timber to outlast him with Carter at the head of it.",
      secret: "In his last years he borrowed against the timber from Garland Teasley without telling Vada, and the loans Carter is behind on now are his.",
      history: "Harlan Voss came from upriver to buy timber, married Vada Sturdivant in 1977 and ran the timber side of the business for thirty years. Vada kept her name, and their son carries it. He died in the timber woods in 2014 and is buried beside her father.",
      attitude: 0,
      relations: [{ npcId: "npc_vada", relation: "wife" }, { npcId: "npc_carter", relation: "son" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_inez",
      name: "Inez Crocker",
      pronouns: "she",
      age: 69,
      presence: "dead",
      died: "February 2025, heart failure",
      buried: "loc_cemetery",
      role: "Mavis's late mother, whose house the Mangums live in",
      factionId: null,
      tags: ["dead"],
      look: "Remembered as a small, sharp woman of sixty-nine in a quilted housecoat, with a church fan in one hand and the TV remote in the other.",
      voice: "Told everybody exactly what she thought of them, to their face, and called it being honest.",
      personality: ["sharp", "proud"],
      goal: "Wanted to die in her own house, owing nobody, with Mavis there.",
      secret: "She signed a contract for deed with Sturdivant Land and Timber on the house in 2016 to pay her hospital bills, and Mavis never knew until the papers came after the funeral.",
      history: "Inez Crocker lived in the white frame house up the river road for forty years and worked in the office at the paper mill until it closed. Mavis and Dewayne moved in to look after her in 2021. She died in that house in February of last year.",
      attitude: 0,
      relations: [{ npcId: "npc_mavis", relation: "daughter" }, { npcId: "npc_dewayne", relation: "son-in-law" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_asa",
      name: "Asa Gentry",
      pronouns: "he",
      age: 83,
      presence: "dead",
      died: "winter of 1951, pneumonia",
      buried: "loc_cemetery",
      role: "Elbert's granddaddy, who ran the last ferry",
      factionId: null,
      tags: ["dead"],
      look: "Known from the photographs in the Gentry House: a bent, white-bearded man in a slouch hat, standing at the ferry's sweep with the river high behind him.",
      voice: "Said to have answered every question with the river's height that morning, and to have charged strangers double and widows nothing.",
      personality: ["stubborn", "fair"],
      goal: "Wanted the ferry to last as long as he did, and it nearly did.",
      secret: "He took Amos Sturdivant's money to stop fighting the bridge in 1937, and the Gentrys have called it a fair price ever since.",
      history: "Asa Gentry ran the Gentry ferry across the Lusk for fifty years, until the bridge opened in 1938 and the ferry was cut loose. He built the Gentry House, sat on its porch watching the bridge traffic for thirteen more years and died in the winter of 1951.",
      attitude: 0,
      relations: [{ npcId: "npc_elbert", relation: "grandson" }, { npcId: "npc_pearl", relation: "granddaughter" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_wiley",
      name: "Wiley Tackett",
      pronouns: "he",
      age: 77,
      presence: "dead",
      died: "March 2024, lung cancer",
      buried: "loc_cemetery",
      role: "the mechanic who ran the garage on Front Street for forty-five years",
      factionId: null,
      tags: ["dead"],
      look: "Remembered as a short, bowlegged man of seventy-seven in a work shirt with his name over the pocket, never without a cigarette.",
      voice: "Talked to engines like they were mules, cussed them the same, and taught half the boys in town to change their own oil.",
      personality: ["patient", "ornery"],
      goal: "Wanted Dewayne Mangum to have the garage when he was gone.",
      secret: "He told Burl Satterfield he had left the garage to Dewayne, but the Sturdivants held the note on the building, and the will he left gave it back to them.",
      history: "Wiley Tackett fixed cars in the garage on Front Street from 1979 until he got too sick to stand. Dewayne Mangum learned the trade under him before he went to work for Royce Pittman. The bay doors have been chained since he died, three springs ago.",
      attitude: 0,
      relations: [{ npcId: "npc_burl", relation: "friend" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_clyde",
      name: "Clyde Pittman",
      pronouns: "he",
      age: 69,
      presence: "dead",
      died: "summer of 2009, a heart attack at the pumps",
      buried: "loc_cemetery",
      role: "Royce's late daddy, who opened Pittman's in 1966",
      factionId: null,
      tags: ["dead"],
      look: "Remembered as a big, bald man of sixty-nine in a white station shirt, with a cigar he never lit and a ring of keys on his belt.",
      voice: "Told the same six stories at the register for forty years, and Royce tells them now, word for word, as if they happened to him.",
      personality: ["genial", "shrewd"],
      goal: "Wanted the station to stay a Pittman's for as long as the highway ran past it.",
      secret: "He borrowed against the station from Harlan Voss in 1998 to get through a bad year, and that note, rolled over and over, is the one Carter Sturdivant holds on Royce now.",
      history: "Clyde Pittman built the station in 1966, when the highway still brought the trucks through town, and ran it until the day he died at the pumps in 2009. His photo still hangs over the register.",
      attitude: 0,
      relations: [{ npcId: "npc_royce", relation: "son" }, { npcId: "npc_kaylee", relation: "granddaughter" }],
      home: null,
      memories: [],
      alive: false,
      knownToPlayer: false,
      status: "dead"
    },
    {
      id: "npc_dale",
      name: "Dale Purvis",
      pronouns: "he",
      age: 49,
      presence: "away",
      where: "the state penitentiary, eight years into a fifteen-year sentence",
      reach: "letters, and a collect call on Sunday nights; visiting is the second and fourth Saturday",
      role: "Wade's younger brother and Colt's father, in the state penitentiary",
      factionId: null,
      tags: ["prisoner"],
      look: "Lean, gray-stubbled man of forty-nine in prison whites, with his brother's face gone harder and a cross tattooed on the back of each hand.",
      voice: "Talks fast on the phone because the call is timed, asks about the river before he asks about anyone, and never says goodbye, only later.",
      personality: ["charming", "bitter"],
      goal: "Make parole in two years and come home to the job on the river his brother has promised him.",
      secret: "He took the whole charge that sent him away, a trailer load of stolen outboard motors, so that Wade would not go down with him, and his letters have started asking what that bought him.",
      history: "Dale ran the river with Wade from the time they were boys. He was sentenced in 2018 over a trailer load of stolen outboard motors and has done eight years of fifteen at the state penitentiary. Colt was fourteen when he went in.",
      attitude: 0,
      relations: [{ npcId: "npc_wade", relation: "brother" }, { npcId: "npc_colt", relation: "son" }, { npcId: "npc_lorna", relation: "sister-in-law" }],
      home: "loc_state_pen",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_warren",
      name: "Warren Pettit",
      pronouns: "he",
      age: 51,
      presence: "away",
      where: "Calder, at his engineering firm on the courthouse square",
      reach: "by email to his firm; he has stopped taking calls about the bridge",
      role: "the consulting engineer from Calder who wrote the report that condemned the old bridge",
      factionId: null,
      tags: ["engineer"],
      look: "Soft, pale man of fifty-one in a pressed polo shirt with his firm's logo on it, rimless glasses and a hard hat that has never been dirty.",
      voice: "Talks in percentages and section numbers, says per the report instead of yes, and ends every call by saying he has another one.",
      personality: ["careful", "weak"],
      goal: "Get through the council meeting without being asked a question under oath, and get paid for the downstream design work.",
      secret: "He wrote most of the bridge report from Virgil Odom's answers on the phone and the state's old files, and spent inspection day at lunch with Carter Sturdivant instead of under the spans.",
      history: "Warren Pettit runs a two-man engineering firm in Calder that does bridge and culvert work for the state. He inspected the old bridge in April, and his report rated it critical. He has not been back to Lockett's Ferry since.",
      attitude: 0,
      relations: [],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_renee",
      name: "Renee Byrd",
      pronouns: "she",
      age: 38,
      presence: "away",
      where: "Calder, where she cleans teeth at a dental office near the hospital",
      reach: "her number is in Hollis's phone, and she lets it ring",
      role: "Hollis's daughter, a dental hygienist in Calder",
      factionId: null,
      tags: ["hygienist"],
      look: "Tidy, dark-haired woman of thirty-eight in navy scrubs, with her father's heavy eyebrows and a ring she turns when she is nervous.",
      voice: "Polite and final; says I'm not doing this with you today, and means it.",
      personality: ["private", "resentful"],
      goal: "Keep her own family clear of her father's business.",
      secret: "She knows what goes through Hollis's books because she kept them for him at sixteen, and that is the reason she stopped speaking to him.",
      history: "Renee grew up in the apartment over the pawn shop and left for Calder at eighteen. She stopped speaking to her father in 2023, and when she married Scott Lindell in October 2024 she did not invite him.",
      attitude: 0,
      relations: [{ npcId: "npc_hollis", relation: "father" }, { npcId: "npc_scott", relation: "husband" }],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_scott",
      name: "Scott Lindell",
      pronouns: "he",
      age: 40,
      presence: "away",
      where: "Calder, where he runs the pharmacy counter at a drugstore by the interstate",
      reach: "the pharmacy phone, or through Renee",
      role: "Renee's husband, a pharmacist in Calder",
      factionId: null,
      tags: ["pharmacist"],
      look: "Lanky, balding man of forty in a white pharmacy coat, with a lanyard of keys, rimless reading glasses and the careful smile of a man who counts pills.",
      voice: "Mild and exact; repeats your question back before he answers it, and says let me check on that when he means no.",
      personality: ["mild", "loyal"],
      goal: "Keep Renee happy and her father out of their life.",
      secret: "He has met Hollis Byrd once, without Renee knowing: Hollis came to the pharmacy in the spring to ask about her, and Scott told him to go home.",
      history: "Scott Lindell grew up in Calder and has run a pharmacy counter there for twelve years. He married Renee Byrd in October 2024 at a courthouse wedding with twenty guests and none of her family.",
      attitude: 0,
      relations: [{ npcId: "npc_renee", relation: "wife" }, { npcId: "npc_hollis", relation: "father-in-law" }],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_celeste",
      name: "Celeste Bell",
      pronouns: "she",
      age: 46,
      presence: "away",
      where: "Calder, where she works nights in the emergency room at Calder Regional",
      reach: "she calls her brother on Sunday nights, after her shift",
      role: "Marcus Bell's sister, a nurse at Calder Regional",
      factionId: null,
      tags: ["nurse"],
      look: "Tall, broad-shouldered woman of forty-six in green scrubs and running shoes, with short gray curls and her brother's heavy jaw.",
      voice: "Tired and teasing; calls her brother Chief as if it were a private joke, and asks whether he is eating.",
      personality: ["steady", "protective"],
      goal: "Get her brother to quit before the job kills him, and come live near her in Calder.",
      secret: "She has a spare room ready and a hospital security job lined up for Marcus, and she has not told him because she knows he would say no.",
      history: "Celeste and Marcus are all that is left of the Bell family. She has worked nights in the emergency room at Calder Regional for twenty years and drives down to see him at Christmas.",
      attitude: 0,
      relations: [{ npcId: "npc_marcus", relation: "brother" }],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_leah",
      name: "Leah Dees",
      pronouns: "she",
      age: 38,
      presence: "away",
      where: "the Willows, a treatment program in Calder, since July",
      reach: "one phone call a week on Thursday nights, and family visits on Sunday afternoons",
      role: "Ray and Nadine's daughter and Micah's mother, in a treatment program in Calder",
      factionId: null,
      tags: ["patient"],
      look: "Thin, freckled woman of thirty-eight in a borrowed sweatshirt, with her mother's curls cut short and a plastic program bracelet on her wrist.",
      voice: "Quiet and careful on the phone; says I'm doing the work when anyone asks how she is, and asks about Micah first.",
      personality: ["fragile", "determined"],
      goal: "Finish the program this time and come home to Micah clean.",
      secret: "She knows the program costs more each month than her parents have, she has guessed where Micah's money comes from, and she has said nothing.",
      history: "Leah grew up in the Parsonage and had Micah at twenty-one. She has been in and out of treatment since he was small, and went into the Willows in Calder in July. Micah has lived with her parents since.",
      attitude: 0,
      relations: [{ npcId: "npc_ray", relation: "father" }, { npcId: "npc_nadine", relation: "mother" }, { npcId: "npc_micah", relation: "son" }],
      home: "loc_treatment",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_stanley",
      name: "Stanley Wexler",
      pronouns: "he",
      age: 63,
      presence: "away",
      where: "Calder, where he owns two car washes and a laundromat besides the motor court",
      reach: "by email; he answers within a day and never by phone",
      role: "owner of the Riverview Motor Court, who runs it by email from Calder",
      factionId: null,
      tags: ["owner"],
      look: "Pink, heavyset man of sixty-three in a golf visor and a pastel shirt, known in town from one visit two years ago and the photo on his emails.",
      voice: "Writes in capital letters and short lines, signs every email with his first name, and asks about the occupancy rate before anything else.",
      personality: ["absent", "tight"],
      goal: "Sell the motor court for what he paid for it before the bridge question drags its price down.",
      secret: "He already has an offer on the motor court from Carter Sturdivant, good only if the council votes for the downstream site, and he has not told Mavis.",
      history: "Stanley Wexler bought the Riverview Motor Court in 2019 as an investment and has been on the lot once since. He runs it through Mavis Mangum by email and wants the nightly counts by six every morning.",
      attitude: 0,
      relations: [{ npcId: "npc_mavis", relation: "employee" }],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_calvin",
      name: "Calvin Ogletree",
      pronouns: "he",
      age: 44,
      presence: "away",
      where: "the county home in Clayburn, since the winter of 2021",
      reach: "visiting hours every afternoon; he cannot use a phone",
      role: "a former river hand who has been in the county home since a beating",
      factionId: null,
      tags: ["patient"],
      look: "Thin man of forty-four in a wheelchair by the window, with a dent in his skull under hair that grew back white.",
      voice: "Speaks a word or two at a time, smiles at whoever comes in, and calls every visitor by his sister's name.",
      personality: ["gentle", "confused"],
      goal: "Wants to go home, and asks his sister every visit when they are going.",
      secret: "Before the beating he had started running cartons across the river on his own at night, under the Night Run's prices.",
      history: "Calvin decked on towboats up and down the river in his twenties and came home to work the river and the timber. He was found beaten nearly to death below Purvis Landing one night in December 2021, and nobody was ever charged. He has lived at the county home since, and his sister visits every Sunday.",
      attitude: 0,
      relations: [{ npcId: "npc_bernice", relation: "sister" }],
      home: "loc_county_home",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_bernice",
      name: "Bernice Ogletree",
      pronouns: "she",
      age: 50,
      presence: "away",
      where: "Clayburn, in a rented duplex four blocks from the county home",
      reach: "she has a phone and answers it; she sees her brother every Sunday",
      role: "Calvin's sister, who looks after him at the county home",
      factionId: null,
      tags: ["caregiver"],
      look: "Wiry, tired woman of fifty in a grocery store cashier's vest, with reading glasses pushed up on her head and her brother's photo on her phone.",
      voice: "Flat and wary; asks who sent you before she answers anything, and says nobody from Lockett's Ferry ever came to see him.",
      personality: ["wary", "devoted"],
      goal: "Find out who beat her brother and see them answer for it, and get her daughter Jodie home before the law finds her.",
      secret: "A money order for two hundred dollars comes to her every month with no name on it, postmarked Lockett's Ferry, and she has kept every stub; her daughter Jodie, who skipped bail this summer, has written once from the same town under another name.",
      history: "Bernice works the register at the grocery in Clayburn and has spent every Sunday afternoon at the county home since her brother was hurt. She has asked the sheriff about his case so often that the front desk knows her voice.",
      attitude: 0,
      relations: [{ npcId: "npc_calvin", relation: "brother" }],
      home: "loc_clayburn",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_hoyt",
      name: "Hoyt Bramlett",
      pronouns: "he",
      age: 61,
      presence: "away",
      where: "Clayburn, at the sheriff's office in the courthouse basement",
      reach: "the sheriff's office line; a deputy comes when called, in an hour or two",
      role: "the county sheriff, at the courthouse in Clayburn",
      factionId: null,
      tags: ["sheriff"],
      look: "Barrel-chested man of sixty-one in a tan uniform and a gray felt cowboy hat, with a toothpick, a campaign pin and a belly over his belt buckle.",
      voice: "Slow and friendly, like a man running for office, which he always is; calls everybody young man or young lady and promises to look into it.",
      personality: ["political", "lazy"],
      goal: "Win the contract to patrol Lockett's Ferry, with the money and the deputies that come with it, before the next election.",
      secret: "He has wanted Marcus Bell's department gone for years, and he has told the mayor the county will patrol the town for half what the police cost, which it cannot.",
      history: "Hoyt Bramlett has been sheriff since 2006 and runs eleven deputies across the county from the courthouse in Clayburn. He comes to Lockett's Ferry for funerals and elections, and his deputies and the town police do not get along.",
      attitude: 0,
      start: { trust: -15 },
      axes: { p: 1, g: 1 },
      relations: [],
      home: "loc_sheriffs_office",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_phillip",
      name: "Phillip Sayle",
      pronouns: "he",
      age: 58,
      presence: "away",
      where: "Calder, at a clinic for older patients near Calder Regional",
      reach: "through his office, by appointment",
      role: "a doctor in Calder who examines old people for the courts",
      factionId: null,
      tags: ["doctor"],
      look: "Neat, silver-haired man of fifty-eight in a sport coat over a golf shirt, with a leather folder of forms and a soft voice made for bad news.",
      voice: "Gentle and professional; uses your first name, asks what year it is as if it were small talk, and writes while you answer.",
      personality: ["smooth", "obliging"],
      goal: "Keep the guardianship work the lawyers in Calder send him.",
      secret: "Neal Haverty has sent him eleven cases in five years, and he has found every one of the old people unfit.",
      history: "Dr. Sayle runs a small practice for older patients in Calder and testifies in guardianship cases in three counties. People in Lockett's Ferry know him only by name.",
      attitude: 0,
      relations: [],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_neal",
      name: "Neal Haverty",
      pronouns: "he",
      age: 60,
      presence: "away",
      where: "Calder, in an office over the bank on the courthouse square",
      reach: "his office phone; his paralegal returns calls",
      role: "the Sturdivants' lawyer in Calder",
      factionId: null,
      tags: ["lawyer"],
      look: "Long-faced man of sixty in a gray suit, with half-glasses on a cord and a fountain pen he points like a finger.",
      voice: "Dry and courteous; begins every sentence with as I understand it, and never says anything on the phone he would not say in court.",
      personality: ["patient", "cold"],
      goal: "Get the downstream right-of-way through before the state's money goes somewhere else, and bill Carter for every hour of it.",
      secret: "He drew up Lamar Haskins's option papers knowing they are worthless while Vada is alive, and told Carter to keep the uncashed check as leverage.",
      history: "Neal Haverty has handled Sturdivant business since Harlan Voss's day, from an office over the bank in Calder. He writes the letters people in Lockett's Ferry do not want to get.",
      attitude: 0,
      relations: [],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_corinne",
      name: "Corinne Bolden",
      pronouns: "she",
      age: 70,
      presence: "away",
      where: "Clayburn, in the house she and Odessa grew up in, behind the courthouse",
      reach: "Odessa drives over on her Sunday afternoons off; Corinne has a phone and a bad hip",
      role: "Odessa's older sister, a retired school cook in Clayburn",
      factionId: null,
      tags: ["retired"],
      look: "Heavy, slow-moving woman of seventy in a church hat and orthopedic shoes, with a walker and her sister's same quiet way of watching.",
      voice: "Talks about her hip, her pastor and her sister in that order, and calls Odessa baby girl though she is sixty-six.",
      personality: ["talkative", "proud"],
      goal: "Keep the family house and be buried from it.",
      secret: "She signed a contract for deed with Sturdivant Land and Timber to keep the house, and she has missed four payments that Odessa has quietly made for her.",
      history: "Corinne cooked in the county school cafeteria in Clayburn for thirty-one years. She has lived alone in the family house behind the courthouse since 2020, and Odessa visits on her Sundays off.",
      attitude: 0,
      relations: [{ npcId: "npc_odessa", relation: "sister" }],
      home: "loc_clayburn",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_lynette",
      name: "Lynette Pruett",
      pronouns: "she",
      age: 50,
      presence: "away",
      where: "Clayburn, in the brick house she and Curtis bought in 2004",
      reach: "she answers the phone when it is not Curtis",
      role: "Curtis's wife, who put him out of their house in Clayburn",
      factionId: null,
      tags: ["teller"],
      look: "Petite, blonde woman of fifty in a bank teller's blazer, with a careful manicure and the patience of somebody who counts other people's money all day.",
      voice: "Sweet as pie and twice as hard; says I'm sure you mean well, and hangs up.",
      personality: ["patient", "unforgiving"],
      goal: "Keep the house and get Curtis to sign the divorce papers before the end of the year.",
      secret: "She knows about the eleven hundred dollars Royce Pittman owes Curtis, and she has asked a lawyer whether it counts as marital property.",
      history: "Lynette has been a teller at the bank in Clayburn for twenty-five years. She put Curtis out of their house last winter over his card games and his debts, and he has had a room at the Riverview Motor Court since.",
      attitude: 0,
      relations: [{ npcId: "npc_curtis", relation: "husband" }],
      home: "loc_clayburn",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_wendell",
      name: "Wendell Strunk",
      pronouns: "he",
      age: 59,
      presence: "away",
      where: "Clayburn, behind the counter of his title-loan office on the highway",
      reach: "his office phone; he calls back the same day",
      role: "owner of the title-loan outfit in Clayburn that Leon Varner collects for",
      factionId: null,
      tags: ["loans"],
      look: "Short, sun-spotted man of fifty-nine in a short-sleeved dress shirt and a clip-on tie, with a calculator watch and a gap in his front teeth.",
      voice: "Cheerful about terrible news; says it's just business, buddy, and reads out an interest rate like a weather report.",
      personality: ["cheerful", "ruthless"],
      goal: "Turn every bad note in the county into a truck on his lot or a check in his drawer.",
      secret: "He buys his bad debts from Garland Teasley through Leon Varner at a dime on the dollar, and he knows Teasley is selling because Teasley means to call in the Sturdivant loans soon.",
      history: "Wendell Strunk opened his title-loan office on the highway in Clayburn in 2009 and keeps a lot of repossessed trucks behind it. Leon Varner has done his collecting in the south end of the county for six years.",
      attitude: 0,
      relations: [{ npcId: "npc_leon", relation: "employee" }],
      home: "loc_clayburn",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_garland",
      name: "Garland Teasley",
      pronouns: "he",
      age: 74,
      presence: "away",
      where: "Calder, in a private office above a bank on the courthouse square",
      reach: "by letter; he does not take calls from people who owe him",
      role: "a private lender in Calder who carries the Sturdivant timber loans",
      factionId: null,
      tags: ["moneylender"],
      look: "Frail, immaculate man of seventy-four in a three-piece suit and a hearing aid, with a cane, a pocket watch and a hand that shakes until he signs something.",
      voice: "Soft and precise; speaks of debts as obligations and people as accounts, and has never in his life raised his voice.",
      personality: ["patient", "exacting"],
      goal: "Get his money out of Sturdivant Land and Timber before the bridge vote decides what the land is worth.",
      secret: "He means to call in the timber loans the week after the vote, whichever way it goes, and he has been selling off his small notes to raise cash first.",
      history: "Garland Teasley has lent money privately out of the same office in Calder since 1975. He lent to Harlan Voss for thirty years, and now Carter Sturdivant drives up to see him every quarter.",
      attitude: 0,
      relations: [],
      home: "loc_calder",
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    },
    {
      id: "npc_teresa",
      name: "Teresa Gaines",
      pronouns: "she",
      age: 44,
      presence: "away",
      where: "a parole office two states over",
      reach: "her office line; she returns calls within the week",
      role: "a parole officer two states over",
      factionId: null,
      tags: ["parole"],
      look: "Square, short-haired woman of forty-four in a polo shirt with a state seal, with a lanyard, a coffee thermos and a caseload of ninety.",
      voice: "Flat and fast; reads out conditions in the same tone as the weather and says I have ninety of you.",
      personality: ["overworked", "dogged"],
      goal: "Find the parolees who stopped reporting before their warrants become somebody else's problem.",
      secret: "Boyd Teague is on her caseload, he missed his check-in last week, and the violation she filed means one call from anyone in Lockett's Ferry would bring a warrant.",
      history: "Teresa Gaines has supervised parolees for fifteen years out of a county office two states over. Nobody in Lockett's Ferry has heard of her.",
      attitude: 0,
      relations: [],
      home: null,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "gone"
    }
  ],

  // Three factions on staggered clocks (police 5 segments, Sturdivant 6, the
  // Night Run 8), so their completions spread out over three weeks. Each
  // completion may carry requires and alt (CONTRACTS section 3): what must
  // still be true when it lands, and what happens instead, so the texts hold
  // in either order. clockAdjust sets a rival back (or forward).
  factions: [
    {
      id: "fac_sturdivant",
      name: "Sturdivant Land and Timber",
      goal: "Get the old bridge closed and the new state bridge built five miles downstream on Sturdivant bottomland, then sell the state the right-of-way and put a truck stop at the new interchange.",
      methods: "Private loans and contracts for deed that can be called in on a week's notice, a mayor paid in cash, a bridge report bought from the engineer the state sent, and Neal Haverty, a lawyer in Calder.",
      clocks: [
        {
          label: "Buy the swing vote",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Carter Sturdivant tears up the note on Pittman's Gas and Service in front of Royce Pittman, and Royce promises him his vote for the downstream site at Tuesday's council meeting.",
            requires: { flagsUnset: ["councilVoted", "royceTurned"] },
            effects: [
              { op: "setFlag", key: "royceBought", value: true },
              { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -15 },
              { op: "clockAdjust", factionId: "fac_nightrun", delta: -1 },
              { op: "addRumour", rumour: {
                id: "rum_royce_bought",
                text: "Carter Sturdivant tore up the note on Royce Pittman's station, and Royce has promised him his vote on the bridge.",
                true: true,
                sourceNpcId: "npc_loretta",
                heard: false
              } }
            ],
            alt: {
              text: "Carter Sturdivant tears up the note on Pittman's Gas and Service in front of Royce Pittman anyway, and Royce takes it without a word about which way he will vote.",
              effects: [
                { op: "setFlag", key: "royceBought", value: true },
                { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -10 },
                { op: "addRumour", rumour: {
                  id: "rum_royce_bought_late",
                  text: "Carter Sturdivant tore up the note on Royce Pittman's station, and nobody can say any more which way Royce will vote.",
                  true: true,
                  sourceNpcId: "npc_loretta",
                  heard: false
                } }
              ]
            }
          }
        },
        {
          label: "Pull the landing lease",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Carter Sturdivant refuses to renew the lease on Purvis Landing, a notice from Neal Haverty goes up on the bait shop door, and Wade Purvis starts putting his boats in off the bank at Riverbend after dark.",
            requires: { npcFree: ["npc_wade"] },
            effects: [
              { op: "npcMove", npcId: "npc_wade", locationId: "loc_riverbend", phases: ["night"] },
              { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -20 },
              { op: "clockAdjust", factionId: "fac_nightrun", delta: -1 },
              { op: "plantSeed", seed: {
                id: "seed_vada_envelope",
                cause: "Vada Sturdivant has found out that Carter pulled the Purvis Landing lease, which ends an arrangement with Wade Purvis that she has never told her son about.",
                effect: "Vada Sturdivant, white with anger at her son, asks whoever is in front of her to carry a sealed envelope down to Wade Purvis and put it in his hand and nobody else's.",
                trigger: { type: "npc", value: "npc_vada" },
                fired: false,
                hidden: true
              } },
              { op: "addRumour", rumour: {
                id: "rum_lease_pulled",
                text: "Carter Sturdivant pulled the lease on Purvis Landing, and Wade Purvis is putting his boats in off the bank at Riverbend now.",
                true: true,
                sourceNpcId: "npc_hollis",
                heard: false
              } }
            ],
            alt: {
              text: "Carter Sturdivant refuses to renew the lease on Purvis Landing, and Lorna Purvis tapes Neal Haverty's notice to the bait shop window with WE ARE STILL OPEN written under it in marker.",
              effects: [
                { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -20 },
                { op: "clockAdjust", factionId: "fac_nightrun", delta: -1 },
                { op: "addRumour", rumour: {
                  id: "rum_lease_pulled_lorna",
                  text: "Carter Sturdivant pulled the lease on Purvis Landing, and Lorna Purvis says she will keep the bait shop open until they carry her out.",
                  true: true,
                  sourceNpcId: "npc_lorna",
                  heard: false
                } }
              ]
            }
          }
        },
        {
          label: "Get the bridge posted closed",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "A state crew sets concrete barriers across both ends of the old bridge, and every trip to the dry county is now forty minutes round by the bypass.",
            requires: { flagsUnset: ["bridgeReportVoid"] },
            effects: [
              { op: "closeLocation", locationId: "loc_old_bridge" },
              { op: "priceMultiplier", factor: 1.15 },
              { op: "threadStatus", threadId: "thr_bridge_vote", status: "failed" },
              { op: "setFlag", key: "oldBridgeClosed", value: true },
              { op: "addRumour", rumour: {
                id: "rum_bridge_closed",
                text: "The state has put concrete barriers across the old bridge, and the drive to the dry county is forty minutes round by the bypass now.",
                true: true,
                sourceNpcId: "npc_royce",
                heard: false
              } }
            ],
            alt: {
              text: "With the bridge report thrown out, the state orders a second inspection of the old bridge instead of closing it, and Carter Sturdivant's downstream site goes back to the end of the line.",
              effects: [
                { op: "setFlag", key: "secondInspectionOrdered", value: true },
                { op: "factionRelation", a: "fac_sturdivant", b: "fac_police", delta: -10 },
                { op: "clockAdjust", factionId: "fac_nightrun", delta: 1 },
                { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "The state threw out the bought bridge report and ordered a second inspection, so the old bridge stays open for now. Carter Sturdivant's downstream site waits on the new inspector." },
                { op: "addRumour", rumour: {
                  id: "rum_second_inspection",
                  text: "The state threw out the bridge report and is sending its own inspector, so the old bridge stays open for now.",
                  true: true,
                  sourceNpcId: "npc_virgil",
                  heard: false
                } }
              ]
            }
          }
        }
      ],
      activeClock: 0,
      relations: { fac_police: -30, fac_nightrun: -50 }
    },
    {
      id: "fac_police",
      name: "The Town Police",
      goal: "Make an arrest big enough to save the department before the council votes to dissolve it, and prove that the bridge report was bought.",
      methods: "Traffic stops at the bridge approach, twenty dollars a tip to Tyler Rasberry on the motel desk, sitting dark above the boat ramp, and leaning on anyone with an open warrant.",
      clocks: [
        {
          label: "Catch a boat at the ramp",
          segments: 5,
          filled: 0,
          onComplete: {
            text: "Chief Bell catches Colt Purvis at the foot of the ramp at three in the morning with a johnboat full of cartons and a pocket full of pills, and the Night Run pulls its boats up on the bank for a while.",
            requires: { npcFree: ["npc_colt", "npc_marcus"] },
            effects: [
              { op: "npcStatus", npcId: "npc_colt", status: "arrested" },
              { op: "setFlag", key: "boatsPulledUp", value: true },
              { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -15 },
              { op: "clockAdjust", factionId: "fac_nightrun", delta: -2 },
              { op: "addRumour", rumour: {
                id: "rum_colt_caught",
                text: "Chief Bell caught Colt Purvis at the ramp with a boat full of cartons and a pocket full of pills.",
                true: true,
                sourceNpcId: "npc_travis",
                heard: false
              } }
            ],
            alt: {
              text: "Nikki Ballard catches Trent Haskins on the bridge approach at three in the morning with liquor cases under a tarp in the grain truck, and the Night Run pulls its boats up on the bank for a while.",
              effects: [
                { op: "npcStatus", npcId: "npc_trent", status: "arrested", by: "npc_nikki" },
                { op: "setFlag", key: "boatsPulledUp", value: true },
                { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -15 },
                { op: "clockAdjust", factionId: "fac_nightrun", delta: -2 },
                { op: "addRumour", rumour: {
                  id: "rum_trent_caught",
                  text: "Nikki Ballard caught Trent Haskins on the bridge with a grain truck full of liquor, and Lamar is beside himself.",
                  true: true,
                  sourceNpcId: "npc_glenda",
                  heard: false
                } }
              ]
            }
          }
        },
        {
          label: "Flip the pawnbroker",
          segments: 5,
          filled: 0,
          onComplete: {
            text: "Chief Bell arrests Hollis Byrd over a stack of stolen catalytic converters behind the shop, and by morning Hollis is talking about whose cash goes through his books.",
            requires: { npcFree: ["npc_hollis", "npc_marcus"] },
            effects: [
              { op: "npcStatus", npcId: "npc_hollis", status: "arrested" },
              { op: "closeLocation", locationId: "loc_byrds_pawn" },
              { op: "clockAdjust", factionId: "fac_nightrun", delta: -1 },
              { op: "plantSeed", seed: {
                id: "seed_hollis_deal",
                cause: "Hollis Byrd, in the holding cell, wants to trade what he knows about the Night Run's money before Wade Purvis hears he is talking.",
                effect: "From the holding cell, Hollis Byrd calls out to anyone who comes into the station that he will say where the Night Run keeps its cash if they get word to his daughter in Calder first.",
                trigger: { type: "location", value: "loc_town_hall" },
                fired: false,
                hidden: true
              } },
              { op: "addRumour", rumour: {
                id: "rum_hollis_arrested",
                text: "Hollis Byrd is in the holding cell over a stack of stolen catalytic converters, and they say he is talking.",
                true: true,
                sourceNpcId: "npc_dewayne",
                heard: false
              } }
            ],
            alt: {
              text: "Nikki Ballard arrests Hollis Byrd over a stack of stolen catalytic converters behind the shop, and by morning he is talking about whose cash goes through his books.",
              effects: [
                { op: "npcStatus", npcId: "npc_hollis", status: "arrested", by: "npc_nikki" },
                { op: "closeLocation", locationId: "loc_byrds_pawn" },
                { op: "clockAdjust", factionId: "fac_nightrun", delta: -1 },
                { op: "addRumour", rumour: {
                  id: "rum_hollis_arrested_nikki",
                  text: "Nikki Ballard put Hollis Byrd in the holding cell over a stack of stolen catalytic converters, and they say he is talking.",
                  true: true,
                  sourceNpcId: "npc_dewayne",
                  heard: false
                } }
              ]
            }
          }
        },
        {
          label: "Prove the report was bought",
          segments: 5,
          filled: 0,
          onComplete: {
            text: "Chief Bell lays the motel camera footage and the engineer's lunch receipt in front of the council and walks Jolene Overstreet down to the holding cell in handcuffs.",
            requires: { npcFree: ["npc_marcus", "npc_jolene"] },
            effects: [
              { op: "npcStatus", npcId: "npc_jolene", status: "arrested" },
              { op: "setFlag", key: "bridgeReportVoid", value: true },
              { op: "factionRelation", a: "fac_police", b: "fac_sturdivant", delta: -30 },
              { op: "clockAdjust", factionId: "fac_sturdivant", delta: -2 },
              { op: "addRumour", rumour: {
                id: "rum_mayor_arrested",
                text: "Chief Bell walked Jolene Overstreet down to the holding cell in handcuffs, and it was over the bridge report.",
                true: true,
                sourceNpcId: "npc_ray",
                heard: false
              } }
            ],
            alt: {
              text: "With Chief Bell gone, Nikki Ballard lays the motel camera footage and the engineer's lunch receipt in front of the council and walks Jolene Overstreet down to the holding cell herself.",
              effects: [
                { op: "npcStatus", npcId: "npc_jolene", status: "arrested", by: "npc_nikki" },
                { op: "setFlag", key: "bridgeReportVoid", value: true },
                { op: "factionRelation", a: "fac_police", b: "fac_sturdivant", delta: -30 },
                { op: "clockAdjust", factionId: "fac_sturdivant", delta: -2 },
                { op: "addRumour", rumour: {
                  id: "rum_mayor_arrested_nikki",
                  text: "Nikki Ballard walked Jolene Overstreet down to the holding cell in handcuffs, and it was over the bridge report.",
                  true: true,
                  sourceNpcId: "npc_ray",
                  heard: false
                } }
              ]
            }
          }
        }
      ],
      activeClock: 0,
      relations: { fac_sturdivant: -30, fac_nightrun: -60 }
    },
    {
      id: "fac_nightrun",
      name: "The Night Run",
      goal: "Keep the old bridge open and the river unwatched after dark, so cartons and cases keep crossing into the dry county the way they have for sixty years.",
      methods: "Johnboats with no running lights, pickups kept under the weight limit, cash to the night-shift officer, and photographs of anyone who votes the wrong way.",
      clocks: [
        {
          label: "Turn the swing vote",
          segments: 8,
          filled: 0,
          onComplete: {
            text: "Somebody leaves photographs of Royce Pittman and Loretta Gaddis on the seat of Royce's truck, and Royce tells the mayor he will not vote for the downstream site.",
            requires: { flagsUnset: ["councilVoted", "royceBought"] },
            effects: [
              { op: "setFlag", key: "royceTurned", value: true },
              { op: "tieDelta", fromId: "npc_darlene", toId: "npc_loretta", t: -20, known: true, why: "the photographs in Royce's truck" },
              { op: "npcMove", npcId: "npc_royce", locationId: "loc_pittmans", phases: ["afternoon"] },
              { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -20 },
              { op: "clockAdjust", factionId: "fac_sturdivant", delta: -2 },
              { op: "addRumour", rumour: {
                id: "rum_royce_photos",
                text: "Somebody left photographs of Royce Pittman and Loretta Gaddis in his truck, and now he says he will not vote for the downstream bridge.",
                true: true,
                sourceNpcId: "npc_tyler",
                heard: false
              } }
            ],
            alt: {
              text: "Somebody leaves photographs of Royce Pittman and Loretta Gaddis on the seat of Royce's truck, and Royce stops answering his phone and says he will not be pushed either way again.",
              effects: [
                { op: "setFlag", key: "royceTurned", value: true },
                { op: "tieDelta", fromId: "npc_darlene", toId: "npc_loretta", t: -20, known: true, why: "the photographs in Royce's truck" },
                { op: "npcMove", npcId: "npc_royce", locationId: "loc_pittmans", phases: ["afternoon"] },
                { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -20 },
                { op: "clockAdjust", factionId: "fac_sturdivant", delta: -2 },
                { op: "addRumour", rumour: {
                  id: "rum_royce_revote",
                  text: "Somebody left photographs of Royce Pittman and Loretta Gaddis in his truck, and now Royce will not say which way he will vote on anything.",
                  true: true,
                  sourceNpcId: "npc_tyler",
                  heard: false
                } }
              ]
            }
          }
        },
        {
          label: "Buy the night shift",
          segments: 8,
          filled: 0,
          onComplete: {
            text: "Travis Cagle stops patrolling after midnight altogether, and Wade Purvis is buying every carton and case Pittman's can order.",
            requires: { npcFree: ["npc_travis"] },
            effects: [
              { op: "setFlag", key: "riverUnwatched", value: true },
              { op: "priceMultiplier", factor: 1.1 },
              { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -10 },
              { op: "clockAdjust", factionId: "fac_police", delta: -1 },
              { op: "addRumour", rumour: {
                id: "rum_night_shift_bought",
                text: "Nobody patrols after midnight any more, and Wade Purvis is buying every carton and case Pittman's can order.",
                true: true,
                sourceNpcId: "npc_dewayne",
                heard: false
              } }
            ],
            alt: {
              text: "With Travis Cagle off the night shift, nobody patrols after midnight at all, and Wade Purvis is buying every carton and case Pittman's can order.",
              effects: [
                { op: "setFlag", key: "riverUnwatched", value: true },
                { op: "priceMultiplier", factor: 1.1 },
                { op: "clockAdjust", factionId: "fac_police", delta: -1 },
                { op: "addRumour", rumour: {
                  id: "rum_night_shift_empty",
                  text: "Nobody is on the night shift since Travis Cagle went, and Wade Purvis is buying every carton and case Pittman's can order.",
                  true: true,
                  sourceNpcId: "npc_dewayne",
                  heard: false
                } }
              ]
            }
          }
        },
        {
          label: "Get the chief out",
          segments: 8,
          filled: 0,
          onComplete: {
            text: "After an anonymous call, the county sheriff finds three cartons and a bottle of pills under the seat of Chief Bell's truck, the mayor suspends him, and he leaves to stay with his sister in Calder.",
            requires: { npcFree: ["npc_marcus", "npc_jolene"] },
            effects: [
              { op: "npcStatus", npcId: "npc_marcus", status: "gone" },
              { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -30 },
              { op: "clockAdjust", factionId: "fac_police", delta: -2 },
              { op: "plantSeed", seed: {
                id: "seed_travis_phone",
                cause: "Travis Cagle knows the Night Run made the call that ended Chief Bell, and he is afraid of what Wade Purvis will ask of him next.",
                effect: "Travis Cagle, acting chief now and sweating through his shirt, asks to talk somewhere private and wants someone outside the department to keep his second phone, the one with Wade Purvis's texts on it.",
                trigger: { type: "npc", value: "npc_travis" },
                fired: false,
                hidden: true
              } },
              { op: "addRumour", rumour: {
                id: "rum_chief_suspended",
                text: "The county sheriff found cartons and pills under the seat of Chief Bell's truck, and the mayor suspended him the same night.",
                true: true,
                sourceNpcId: "npc_jolene",
                heard: false
              } }
            ],
            alt: {
              text: "After an anonymous call, the county sheriff finds three cartons and a bottle of pills under the seat of Chief Bell's truck, the council suspends him at an emergency meeting, and he leaves to stay with his sister in Calder.",
              effects: [
                { op: "npcStatus", npcId: "npc_marcus", status: "gone" },
                { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -30 },
                { op: "clockAdjust", factionId: "fac_police", delta: -2 },
                { op: "addRumour", rumour: {
                  id: "rum_chief_suspended_council",
                  text: "The county sheriff found cartons and pills under the seat of Chief Bell's truck, and the council suspended him at an emergency meeting.",
                  true: true,
                  sourceNpcId: "npc_glenda",
                  heard: false
                } }
              ]
            }
          }
        }
      ],
      activeClock: 0,
      relations: { fac_sturdivant: -50, fac_police: -60 }
    }
  ],

  // reward: the stat the player gains the first time they resolve the thread (CONTRACTS section 9).
  threads: [
    {
      id: "thr_bridge_vote",
      title: "The bridge vote",
      summary: "The state has rated the old bridge critical and will pay for one new crossing, either in town or five miles downstream on Sturdivant bottomland. The council votes on the site at its meeting on Tuesday evening, and Royce Pittman is the one vote nobody can count.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["fac_sturdivant", "fac_nightrun", "npc_carter", "npc_royce", "npc_vada", "npc_lamar", "npc_hollis", "npc_elbert", "npc_dewayne", "npc_virgil", "loc_old_bridge"],
      reward: "charm"
    },
    {
      id: "thr_police_vote",
      title: "Disbanding the police",
      summary: "Mayor Jolene Overstreet wants to dissolve the three-officer police department and pay the county sheriff to patrol the town instead. It is item four on the agenda for Tuesday's council meeting, and Chief Bell has until then to show the council what his department is worth.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["fac_police", "fac_sturdivant", "npc_marcus", "npc_jolene", "npc_nikki", "npc_glenda", "npc_travis", "loc_town_hall"],
      reward: "wits"
    },
    {
      id: "thr_riverbend_pills",
      title: "Pills at Riverbend",
      summary: "Amber Lott, nineteen, died of an overdose at Riverbend in August, and four more people there have overdosed on the same pain pills since and lived. The chief says the pills come across the river; her mother says everybody knows who sells them.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["npc_tammy", "npc_colt", "npc_june", "npc_marcus", "npc_austin", "npc_brianna", "loc_riverbend"],
      reward: "stealth"
    }
  ],

  // Starting seeds. effects apply when a seed fires; requires and alt keep
  // its text true in either order (CONTRACTS section 3); notBeforeDay holds a
  // seed back (the tackle box can be found from the landing, a start place).
  seeds: [
    {
      id: "seed_lease_letter",
      cause: "Carter Sturdivant has had Neal Haverty write to Wade Purvis that the Purvis Landing lease will not be renewed at the new year.",
      effect: "Wade Purvis read Neal Haverty's letter out loud at the Low Water last night and told Carter Sturdivant, in front of the whole bar, that the Sturdivants made their money on the same river.",
      trigger: { type: "day", value: 3 },
      effects: [
        { op: "addNews", text: "Wade Purvis read a lawyer's letter about the landing lease out loud at the Low Water and told Carter Sturdivant off in front of the whole bar.", factionId: "fac_nightrun", public: true },
        { op: "clockAdjust", factionId: "fac_nightrun", delta: 1 }
      ],
      fired: false,
      hidden: true
    },
    {
      id: "seed_big_run",
      cause: "Wade Purvis has bought two hundred cartons and forty cases of liquor for the biggest run of the fall, and paid Travis Cagle to sit in the motel lot all night.",
      effect: "The Night Run took a full load across the river overnight; Chief Bell is down at Purvis Landing photographing fresh trailer tracks on the ramp, and Wade Purvis is watching him from the bait shop with a cup of coffee.",
      trigger: { type: "day", value: 4 },
      requires: { npcFree: ["npc_marcus", "npc_wade", "npc_colt"], flagsUnset: ["boatsPulledUp"] },
      effects: [
        { op: "clockAdjust", factionId: "fac_nightrun", delta: 1 }
      ],
      alt: {
        text: "Wade Purvis has two hundred cartons and forty cases of liquor stacked in the back of the bait shop for the biggest run of the fall, and the run has not gone; nobody at the landing will say when it will."
      },
      fired: false,
      hidden: true
    },
    {
      id: "seed_engineer",
      cause: "Warren Pettit, the engineer who wrote the bridge report, has been asked to answer questions at Tuesday's council meeting, and Carter Sturdivant does not want him answering any.",
      effect: "Warren Pettit canceled his appearance at Tuesday's council meeting by email, and Dewayne Mangum told Royce Pittman at the counter that he towed that man's rental car out of a ditch on the morning of the inspection.",
      trigger: { type: "day", value: 4 },
      effects: [
        { op: "setFlag", key: "engineerNoShow", value: true },
        { op: "addNews", text: "The engineer who wrote the bridge report will not come to Tuesday's council meeting after all.", public: true },
        { op: "clockAdjust", factionId: "fac_sturdivant", delta: -1 }
      ],
      fired: false,
      hidden: true
    },
    {
      id: "seed_council_agenda",
      cause: "Jolene Overstreet has put the police budget on Tuesday's council agenda without telling Chief Bell.",
      effect: "A typed agenda taped to the Town Hall door lists the bridge site as item three and the dissolution of the police department as item four for Tuesday night's meeting, and Chief Bell has been seen standing in front of it with his notebook out.",
      trigger: { type: "day", value: 5 },
      effects: [
        { op: "threadUpdate", threadId: "thr_police_vote", knownToPlayer: true },
        { op: "addNews", text: "The agenda for Tuesday night's council meeting is up on the Town Hall door: the bridge site is item three, and item four is whether to keep the police.", public: true }
      ],
      fired: false,
      hidden: true
    },
    {
      id: "seed_overdose",
      cause: "Colt Purvis has a new bottle of pills from across the river and is selling them at Riverbend for less than before.",
      effect: "June Satterfield brought Brianna Tolliver back from an overdose last night with the nasal spray she keeps in her purse and did not call it in; Tammy Lott is telling everyone at the Low Water that the pills were Colt Purvis's.",
      trigger: { type: "day", value: 7 },
      requires: { npcFree: ["npc_colt", "npc_brianna"] },
      effects: [
        { op: "addNews", text: "Brianna Tolliver nearly died on pills at Riverbend last night, and June Satterfield brought her back.", public: true }
      ],
      alt: {
        text: "June Satterfield brought Brianna Tolliver back from an overdose last night and did not call it in; with Colt Purvis locked up, Tammy Lott is telling everyone at the Low Water that Trent Haskins has been selling Colt's pills for him.",
        effects: [
          { op: "addNews", text: "Brianna Tolliver nearly died on pills at Riverbend last night, and Tammy Lott is blaming Trent Haskins for selling them.", public: true }
        ]
      },
      fired: false,
      hidden: true
    },
    {
      id: "seed_vada_doctor",
      cause: "Carter Sturdivant has asked Dr. Phillip Sayle in Calder to find his mother unfit, so that he can sign the bottomland over to the state himself.",
      effect: "Carter brought Dr. Sayle up to Sturdivant House yesterday, and Vada Sturdivant threw them both out and drove herself to Riverside Baptist to ask Pastor Dees to witness a new will.",
      trigger: { type: "day", value: 11 },
      requires: { npcFree: ["npc_vada", "npc_carter"] },
      effects: [
        { op: "setFlag", key: "vadaNewWill", value: true }
      ],
      fired: false,
      hidden: true
    },
    {
      id: "seed_tackle_box",
      cause: "Colt Purvis keeps his pills and his sales phone in a tackle box wedged on a girder under the first span of the old bridge, where his uncle never looks.",
      effect: "On a girder ledge under the first span of the old bridge, reachable from the riverbank below the landing, is a tackle box holding three pill bottles with a pharmacy label from across the river and a cheap prepaid phone full of texts from Riverbend numbers.",
      // There to be taken from where the player found it (wave 4, playtest R10).
      effects: [
        { op: "placeItem", name: "Tackle box", notes: "Three pill bottles with a pharmacy label from across the river, and a cheap prepaid phone full of texts from Riverbend numbers." }
      ],
      trigger: { type: "location", value: ["loc_old_bridge", "loc_purvis_landing"] },
      notBeforeDay: 3,
      fired: false,
      hidden: true
    },
    // Wave 27: someone in trouble the player can step in on (danger: the people its words name after the first, the one doing it,
    // are in danger there for this phase and the next; a successful action aimed at them, or an attack on the one doing it, rescues them).
    {
      id: "seed_landing_short_count",
      cause: "Colt Purvis is sure Trent Haskins shorted him on his cut of the last run across the river.",
      effect: "Colt Purvis has Trent Haskins backed up against the ice machine outside the bait shop over a short count on the last run, one fist in his shirt, and nobody on the dock is stepping in.",
      trigger: { type: "location", value: "loc_purvis_landing" },
      notBeforeDay: 8,
      requires: { npcFree: ["npc_colt", "npc_trent"] },
      danger: true,
      fired: false,
      hidden: true
    },
    {
      id: "seed_room_nine",
      cause: "Boyd Teague is sure somebody has been into Room 9 while he is out at the bridge, and Tyler Rasberry has the keys.",
      effect: "Boyd Teague has Tyler Rasberry by the collar against the motel office door, wanting to know who has been in Room 9, and Tyler cannot get a word out.",
      trigger: { type: "location", value: "loc_motor_court" },
      notBeforeDay: 9,
      requires: { npcFree: ["npc_boyd", "npc_tyler"] },
      danger: true,
      fired: false,
      hidden: true
    },
    {
      id: "seed_riverbend_note",
      cause: "Leon Varner has a title-loan note with Shayla Rawls's name on it and means to collect on it at her trailer.",
      effect: "Leon Varner has Shayla Rawls backed against her own trailer step at Riverbend over a note he says she signed, and he will not let her go back inside.",
      trigger: { type: "location", value: "loc_riverbend" },
      notBeforeDay: 10,
      requires: { npcFree: ["npc_leon", "npc_shayla"] },
      danger: true,
      fired: false,
      hidden: true
    }
  ],

  // The town's talk at the start. threadId: the thread it bears on (hearing
  // it can reveal that thread); factionId: whose people know it; tellerIds:
  // the people besides the source who can pass it on.
  rumours: [
    { id: "rum_lunch_inspection", text: "Warren Pettit, the engineer who condemned the bridge, spent inspection day eating catfish at the Low Water with Carter Sturdivant, not under the spans.", true: true, sourceNpcId: "npc_loretta", tellerIds: ["npc_tammy", "npc_dewayne"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_motel_envelope", text: "The mayor meets Carter Sturdivant in the motel parking lot once a month after dark, and she never goes inside.", true: true, sourceNpcId: "npc_tyler", tellerIds: ["npc_brianna", "npc_lyman"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_travis_boat", text: "Travis Cagle bought a new bass boat this summer and pays the note down in cash every month, and nobody pays for a boat like that on a night-shift salary.", true: true, sourceNpcId: "npc_dewayne", tellerIds: ["npc_shayla", "npc_burl"], threadId: "thr_police_vote", heard: false },
    { id: "rum_colt_pills", text: "The pills at Riverbend come from Colt Purvis, and his uncle Wade either does not know or does not want to.", true: true, sourceNpcId: "npc_tammy", tellerIds: ["npc_june", "npc_austin"], threadId: "thr_riverbend_pills", heard: false },
    { id: "rum_royce_note", text: "Royce Pittman owes the Sturdivants on the station, which is why he still will not say how he will vote.", true: true, sourceNpcId: "npc_hollis", tellerIds: ["npc_curtis", "npc_leon"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_vada_wont_sign", text: "Miss Vada will not sign the bottomland over for the new bridge, and Carter cannot sell it without her.", true: true, sourceNpcId: "npc_ray", tellerIds: ["npc_odessa", "npc_nadine"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_police_budget", text: "The mayor wants to get rid of the police and hand the town to the county sheriff before Christmas.", true: true, sourceNpcId: "npc_travis", factionId: "fac_police", tellerIds: ["npc_gerald"], threadId: "thr_police_vote", heard: false },
    { id: "rum_seventh_year", text: "Something in the deep hole under the old bridge pulls a swimmer down every seven years, and this is the seventh year.", true: false, sourceNpcId: "npc_wade", tellerIds: ["npc_elbert", "npc_lorna"], heard: false },
    { id: "rum_loretta_sold", text: "Loretta Gaddis has already sold the Low Water to the Sturdivants and is only waiting for the bridge to close to tell anyone.", true: false, sourceNpcId: "npc_jolene", tellerIds: ["npc_mavis", "npc_shayla"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_june_license", text: "June Satterfield lost her nursing license for stealing pills from the hospital, and that is where the Riverbend pills come from.", true: false, sourceNpcId: "npc_colt", tellerIds: ["npc_trent"], threadId: "thr_riverbend_pills", heard: false },
    { id: "rum_mavis_cash_rooms", text: "Mavis Mangum rings up a cash room at the motor court now and then that never makes it into the book.", true: true, sourceNpcId: "npc_brianna", tellerIds: ["npc_tyler"], leverageOver: "npc_mavis", heard: false },
    { id: "rum_odessa_offer", text: "Carter Sturdivant has been after Odessa Fairley to tell Dr. Sayle in Calder that his mother is losing her mind.", true: true, sourceNpcId: "npc_pearl", tellerIds: ["npc_nadine", "npc_shayla"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_nikki_sheriff", text: "Nikki Ballard drove up to the sheriff's office in Clayburn on her day off, and it was not to pay a ticket.", true: true, sourceNpcId: "npc_glenda", tellerIds: ["npc_gerald"], threadId: "thr_police_vote", heard: false },
    { id: "rum_lamar_check", text: "Lamar Haskins has a check from Carter Sturdivant in his glove box that he has never cashed.", true: true, sourceNpcId: "npc_trent", tellerIds: ["npc_virgil"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_micah_landing", text: "Micah Dees is down at the landing past midnight most nights, and the pastor thinks he is asleep in his bed.", true: true, sourceNpcId: "npc_colt", tellerIds: ["npc_lorna"], leverageOver: "npc_micah", heard: false },
    { id: "rum_darlene_folder", text: "Darlene Pittman keeps a folder in the station safe that Royce is not allowed to open.", true: true, sourceNpcId: "npc_kaylee", tellerIds: ["npc_dewayne"], threadId: "thr_bridge_vote", leverageOver: "npc_darlene", heard: false },
    { id: "rum_curtis_deck", text: "Curtis Pruett holds every deck up to the lamp before he deals his Friday game, and he says the next marked deck he finds goes in the river.", true: true, sourceNpcId: "npc_lyman", tellerIds: ["npc_loretta", "npc_curtis"], heard: false },
    { id: "rum_wade_cartons", text: "Wade Purvis buys cartons for cash at the landing, a dollar a pack over what Pittman's charges, and asks no questions.", true: true, sourceNpcId: "npc_trent", factionId: "fac_nightrun", tellerIds: ["npc_hollis"], heard: false },
    { id: "rum_dwight_stakes", text: "Dwight Spann was out on the bottomland with a flashlight and a can of survey paint the night before the state crew came to look at it.", true: true, sourceNpcId: "npc_lamar", tellerIds: ["npc_trent", "npc_virgil"], threadId: "thr_bridge_vote", heard: false },
    { id: "rum_nadine_books", text: "For forty dollars, Nadine Dees will write a baptism into the church book any way you need it, and the county takes a church record as proof of birth.", true: true, sourceNpcId: "npc_shayla", tellerIds: ["npc_pearl"], heard: false }
  ],

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
  events: [
    {
      id: "evt_council_meeting",
      day: 6,
      phase: "evening",
      locationId: "loc_town_hall",
      title: "The council meeting",
      attendees: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert", "npc_marcus"],
      branches: [
        {
          when: { flagsSet: ["bridgeReportVoid"], npcFree: ["npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "With the bridge report thrown out and the mayor's chair empty, Royce Pittman chairs the meeting in her place. The council votes four to nothing to table the bridge site until the state's second inspector reports, and item four, ending the police, dies without a second.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With the bridge report thrown out, the council tabled the bridge site until the state's second inspection. The old bridge stays open for now." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council let the vote to end the police die without a second. Chief Bell's department stays." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote was tabled until a second inspection, and the vote to end the police died without a second.", public: true }
          ]
        },
        {
          when: { flagsSet: ["bridgeReportVoid"], npcFree: ["npc_royce", "npc_lamar", "npc_elbert"] },
          text: "With the bridge report thrown out and two chairs empty, the mayor's and Hollis Byrd's, Royce Pittman chairs the meeting. The council votes three to nothing to table the bridge site until the state's second inspector reports, and item four, ending the police, dies without a second.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With the bridge report thrown out, the council tabled the bridge site until the state's second inspection. The old bridge stays open for now." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council let the vote to end the police die without a second. Chief Bell's department stays." },
            { op: "addNews", text: "At Tuesday's council meeting, with two seats empty, the bridge vote was tabled until a second inspection, and the vote to end the police died without a second.", public: true }
          ]
        },
        {
          when: { relAtLeast: { npc_royce: { trust: 30, knows: 25 } }, npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman, who has had somebody to talk it through with all week, stands up before the vote and moves to table the bridge site until the engineer answers questions in person, and Hollis Byrd and Elbert Gentry carry it with him, three to two. On item four he votes with Elbert and Lamar Haskins to keep the police, three to two, and the mayor adjourns without looking at him.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: -1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman moved to table the bridge site until the engineer answers questions in person, and it carried three to two. Carter Sturdivant needs his vote again." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to two to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting Royce Pittman moved to table the bridge vote, and it carried three to two; the vote to end the police failed three to two.", public: true }
          ]
        },
        {
          when: { relAtLeast: { npc_royce: { trust: 30, knows: 25 } }, npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman, who has had somebody to talk it through with all week, moves to table the bridge site until the engineer answers questions in person; with Hollis Byrd's chair empty it ties two to two, the downstream site ties the same way, and the bridge goes over to the next meeting. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to one.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: -1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With Hollis Byrd's seat empty, the bridge site tied two to two and went over to the next meeting. Carter Sturdivant still needs Royce Pittman's vote." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to one to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote tied two to two and went over to the next meeting, and the vote to end the police failed three to one.", public: true }
          ]
        },
        {
          when: { obligationStatus: { obl_debt_npc_curtis: "met" }, npcFree: ["npc_curtis", "npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Curtis Pruett, flush with the four hundred dollars he was paid this week, has told Royce Pittman his marker can wait, and Royce, with nobody squeezing him now, goes back on whatever he promised about the bridge: he moves to table the site, and Hollis Byrd and Elbert Gentry carry it with him, three to two. On item four he votes with Elbert and Lamar Haskins to keep the police, three to two.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman moved to table the bridge site, and it carried three to two. Carter Sturdivant needs his vote again." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to two to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote was tabled three to two, and the vote to end the police failed three to two.", public: true }
          ]
        },
        {
          when: { obligationStatus: { obl_debt_npc_curtis: "met" }, npcFree: ["npc_curtis", "npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Curtis Pruett, flush with the four hundred dollars he was paid this week, has told Royce Pittman his marker can wait, and Royce, with nobody squeezing him now, moves to table the bridge site; with Hollis Byrd's chair empty it ties two to two, and the bridge goes over to the next meeting. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to one.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With Hollis Byrd's seat empty, the bridge site tied two to two and went over to the next meeting. Carter Sturdivant still needs Royce Pittman's vote." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to one to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote tied two to two and went over to the next meeting, and the vote to end the police failed three to one.", public: true }
          ]
        },
        {
          when: { playerAt: "loc_town_hall", relAtLeast: { npc_royce: { liking: 15 } }, npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman looks down the rows of folding chairs, finds you in the back, and stands up before the vote to move that the bridge site be tabled until the engineer answers questions in public; Hollis Byrd and Elbert Gentry carry it with him, three to two. On item four he votes with Elbert and Lamar Haskins to keep the police, three to two, and the mayor adjourns without looking at him.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: -1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With a friendly face in the back row, Royce Pittman moved to table the bridge site until the engineer answers questions in public, and it carried three to two. Carter Sturdivant needs his vote again." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to two to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting Royce Pittman moved to table the bridge vote until the engineer answers questions in public, and it carried three to two; the vote to end the police failed three to two.", public: true }
          ]
        },
        {
          when: { playerAt: "loc_town_hall", relAtLeast: { npc_royce: { liking: 15 } }, npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman looks down the rows of folding chairs, finds you in the back, and moves to table the bridge site until the engineer answers questions in public; with Hollis Byrd's chair empty it ties two to two, the downstream site ties the same way, and the bridge goes over to the next meeting. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to one.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: -1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With a friendly face in the back row and Hollis Byrd's seat empty, Royce Pittman moved to table the bridge site; it tied two to two and went over to the next meeting. Carter Sturdivant still needs his vote." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to one to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote tied two to two and went over to the next meeting, and the vote to end the police failed three to one.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceBought"], relAtLeast: { npc_royce: { trust: 20 } }, npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman has Carter Sturdivant's torn-up note in his pocket and too many second thoughts from the talks he has had this week, so he abstains on the bridge, and it ties two to two and goes over to the next meeting. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to two.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman abstained, the bridge site tied two to two, and it went over to the next meeting. Carter Sturdivant paid for a vote he did not get." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to two to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "Royce Pittman abstained on the bridge at Tuesday's council meeting, so it tied two to two and was put off, and the vote to end the police failed three to two.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceBought"], relAtLeast: { npc_royce: { trust: 20 } }, npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman has Carter Sturdivant's torn-up note in his pocket and too many second thoughts to use it, so he abstains on the bridge, and with Hollis Byrd's chair empty the downstream site passes two to one over Elbert Gentry. On item four he votes with Elbert and Lamar Haskins to keep the police, three to one.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "councilBackedDownstream", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: 1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With Royce Pittman abstaining and Hollis Byrd's seat empty, the council voted two to one for the downstream bridge site. Now the state has to close the old bridge." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to one to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "With Royce Pittman abstaining, the council voted two to one on Tuesday for the downstream bridge site, and three to one to keep the police.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceBought", "royceTurned"], npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman, with Carter Sturdivant's torn-up note in one pocket and the photographs in the other, abstains on everything. The bridge vote ties two to two and is tabled to the next meeting, item four ties too, and the police stay for now.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman abstained, the council tied two to two, and the bridge site was tabled. Carter Sturdivant and the Night Run both still have a hold on him." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The vote to end the police tied two to two and failed. Chief Bell's department stays, for now." },
            { op: "addNews", text: "Royce Pittman abstained at Tuesday's council meeting, both votes tied two to two, and the bridge site was tabled.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceBought", "royceTurned"], npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman, with Carter Sturdivant's torn-up note in one pocket and the photographs in the other, abstains on everything, and with Hollis Byrd's chair empty the downstream site passes two to one over Elbert Gentry. Item four fails one to two, and the police stay.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "councilBackedDownstream", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: 1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With Royce Pittman abstaining and Hollis Byrd's seat empty, the council voted two to one for the downstream bridge site. Now the state has to close the old bridge." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The vote to end the police failed one to two. Chief Bell's department stays, for now." },
            { op: "addNews", text: "With Royce Pittman abstaining, the council voted two to one on Tuesday for the downstream bridge site, and the vote to end the police failed one to two.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceTurned"], npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman, gray in the face, votes with Hollis Byrd and Elbert Gentry, and the council backs a new bridge in town, three to two, over the mayor and Lamar Haskins. On item four he votes with the mayor and Hollis to end the police department at the end of the month, three to two.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "councilBackedInTown", value: true },
            { op: "setFlag", key: "policeDissolutionPassed", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: -2 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "The council voted three to two for the new bridge in town, not downstream. Carter Sturdivant's plan now rests on the state closing the old bridge anyway." },
            { op: "threadUpdate", threadId: "thr_police_vote", summary: "The council voted three to two to end the police department at the end of October. Chief Bell has until then." },
            { op: "addNews", text: "The council voted three to two on Tuesday for a new bridge in town, and three to two to end the police department at the end of the month.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceTurned"], npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman, gray in the face, votes with Elbert Gentry for a new bridge in town, but with Hollis Byrd's chair empty it ties two to two and goes over to the next meeting. On item four he votes with the mayor to end the police, and that ties two to two and fails.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: -1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With Hollis Byrd's seat empty, the vote for a bridge in town tied two to two and went over to the next meeting. Royce Pittman has turned against the downstream site." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The vote to end the police tied two to two and failed. Chief Bell's department stays, for now." },
            { op: "addNews", text: "Both votes tied two to two at Tuesday's council meeting with Hollis Byrd's seat empty: the bridge went over to the next meeting, and the police stay.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceBought"], npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman votes with the mayor and Lamar Haskins, and the council backs the downstream bridge site three to two over Hollis Byrd and Elbert Gentry. On item four he votes with the mayor and Hollis to end the police department at the end of the month, three to two.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "councilBackedDownstream", value: true },
            { op: "setFlag", key: "policeDissolutionPassed", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: 1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "The council voted three to two for the downstream bridge site, with Royce Pittman the third vote. Now the state has to close the old bridge." },
            { op: "threadUpdate", threadId: "thr_police_vote", summary: "The council voted three to two to end the police department at the end of October. Chief Bell has until then." },
            { op: "addNews", text: "The council voted three to two on Tuesday for the downstream bridge site, and three to two to end the police department at the end of the month.", public: true }
          ]
        },
        {
          when: { flagsSet: ["royceBought"], npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman votes with the mayor and Lamar Haskins, and with Hollis Byrd's chair empty the council backs the downstream bridge site three to one over Elbert Gentry. On item four he votes with the mayor to end the police, but it ties two to two and fails.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "councilBackedDownstream", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: 1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "The council voted three to one for the downstream bridge site, with Royce Pittman the third vote. Now the state has to close the old bridge." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The vote to end the police tied two to two and failed. Chief Bell's department stays, for now." },
            { op: "addNews", text: "The council voted three to one on Tuesday for the downstream bridge site; the vote to end the police tied two to two and failed.", public: true }
          ]
        },
        {
          when: { clockAtLeast: { fac_sturdivant: 4 }, flagsUnset: ["royceBought", "royceTurned"], npcFree: ["npc_carter", "npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Carter Sturdivant spends the whole meeting at Royce Pittman's elbow, and Royce, very nearly his, asks for two more weeks; the bridge site is tabled three to two. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to two.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: 1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman asked for two more weeks, and the bridge site was tabled three to two. Carter Sturdivant has nearly got him." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to two to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting Royce Pittman asked for two more weeks on the bridge, and the vote to end the police failed three to two.", public: true }
          ]
        },
        {
          when: { clockAtLeast: { fac_sturdivant: 4 }, flagsUnset: ["royceBought", "royceTurned"], npcFree: ["npc_carter", "npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Carter Sturdivant spends the whole meeting at Royce Pittman's elbow, and Royce, very nearly his, asks for two more weeks; with Hollis Byrd's chair empty the motion ties two to two, nothing else passes, and the bridge goes over to the next meeting. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to one.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "clockAdjust", factionId: "fac_sturdivant", delta: 1 },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman asked for two more weeks, and with Hollis Byrd's seat empty the bridge site went over to the next meeting. Carter Sturdivant has nearly got him." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to one to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting Royce Pittman asked for two more weeks on the bridge, and the vote to end the police failed three to one.", public: true }
          ]
        },
        {
          when: { npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
          text: "Royce Pittman still will not say how he will vote, so he moves to table the bridge site to the next meeting, and Hollis Byrd and Elbert Gentry carry it with him, three to two. On item four he votes with Elbert and Lamar Haskins to keep the police, three to two, and the mayor adjourns early.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman would not commit, and the bridge site was tabled three to two. Carter Sturdivant still needs his vote." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to two to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote was tabled three to two, and the vote to end the police failed three to two.", public: true }
          ]
        },
        {
          when: { npcFree: ["npc_jolene", "npc_royce", "npc_lamar", "npc_elbert"] },
          text: "Royce Pittman still will not say how he will vote, and with Hollis Byrd's chair empty his motion to table ties two to two; nothing passes, and the bridge goes over to the next meeting. On item four he votes with Elbert Gentry and Lamar Haskins to keep the police, three to one.",
          effects: [
            { op: "setFlag", key: "councilVoted", value: true },
            { op: "setFlag", key: "bridgeVoteTabled", value: true },
            { op: "setFlag", key: "policeKept", value: true },
            { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "Royce Pittman would not commit, and with Hollis Byrd's seat empty the bridge site went over to the next meeting. Carter Sturdivant still needs his vote." },
            { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", summary: "The council voted three to one to keep the police. Chief Bell's department stays, for now." },
            { op: "addNews", text: "At Tuesday's council meeting the bridge vote went over to the next meeting, and the vote to end the police failed three to one.", public: true }
          ]
        }
      ],
      default: {
        text: "With empty chairs at the table and nobody sure of the count, the council puts the bridge site off to its next meeting, and item four goes over with it.",
        effects: [
          { op: "setFlag", key: "councilVoted", value: true },
          { op: "setFlag", key: "bridgeVoteTabled", value: true },
          { op: "setFlag", key: "policeKept", value: true },
          { op: "threadUpdate", threadId: "thr_bridge_vote", summary: "With seats empty, the council put the bridge site off to its next meeting. Nothing about the bridge is settled." },
          { op: "threadUpdate", threadId: "thr_police_vote", summary: "The vote on ending the police went over to the next meeting. Chief Bell's department stays, for now." },
          { op: "addNews", text: "With seats empty at Tuesday's council meeting, the bridge site and the vote on the police both went over to the next meeting.", public: true }
        ]
      }
    }
  ],

  // The ending (CONTRACTS section 11): told on day 21, or as soon as the
  // bridge story is decided (the barriers go up, or the state orders a
  // second inspection), so a text never says how long it has been except
  // the default, which only day 21 reaches. The first branch whose when
  // holds; then the player can keep playing. Each ending settles the two
  // vote threads (resolved when the town kept what the thread was about,
  // failed when it lost it) and plants what happens next, so the town does
  // not stand still afterwards: seeds planted here may wait for a day after
  // the latest ending (21 to 30).
  epilogue: {
    onDay: 21,
    orFlagsSet: ["oldBridgeClosed", "secondInspectionOrdered"],
    branches: [
      {
        when: { flagsSet: ["bridgeReportVoid", "policeKept"], flagsUnset: ["oldBridgeClosed"] },
        text: "The old bridge is still open and still rattling under every pickup. The state threw out the report Carter Sturdivant paid for and is sending its own inspector in the spring, Jolene Overstreet has a court date in Clayburn, and the town police are still in Town Hall. The Low Water's Saturday lot is full of dry-county tags again, and Loretta Gaddis tells anybody who will listen that she always said the bridge was good for twenty more years, which is not true, but nobody argues with her.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "resolved", knownToPlayer: true, summary: "The state threw out the bought bridge report and is sending its own inspector in the spring. The old bridge stays open." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", knownToPlayer: true, summary: "The council kept the town police, and the mayor who wanted them gone has a court date in Clayburn." },
          { op: "plantSeed", seed: {
            id: "seed_after_inspectors",
            cause: "The state has moved its own inspection of the old bridge up from the spring, and Carter Sturdivant knows what it will find.",
            effect: "A state crew spends the day under the first span of the old bridge with flashlights and a camera, and Carter Sturdivant watches them from his truck at the top of the hill.",
            trigger: { type: "day", value: 23 },
            requires: { npcFree: ["npc_carter"] },
            effects: [
              { op: "addNews", text: "A state crew spent the day under the old bridge with flashlights, and Carter Sturdivant watched them from his truck.", public: true }
            ],
            alt: {
              text: "A state crew spends the day under the first span of the old bridge with flashlights and a camera, and nobody from Sturdivant House comes down to watch."
            },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_bell_pills",
            cause: "With his department safe, Marcus Bell means to go after whoever sells pills at Riverbend.",
            effect: "Chief Bell, with his department safe and the mayor's case on its way to Clayburn, says the next thing on his list is whoever is selling pills at Riverbend, and he could use somebody who listens.",
            trigger: { type: "location", value: "loc_town_hall" },
            requires: { npcFree: ["npc_marcus"] },
            effects: [
              { op: "threadUpdate", threadId: "thr_riverbend_pills", knownToPlayer: true }
            ],
            alt: {
              text: "Nikki Ballard, with the department safe for now, says the next thing on her list is whoever is selling pills at Riverbend, and she could use somebody who listens.",
              effects: [
                { op: "threadUpdate", threadId: "thr_riverbend_pills", knownToPlayer: true }
              ]
            },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_carter_cash",
            cause: "Carter Sturdivant has a note due in Calder and no bridge money coming to pay it.",
            effect: "Carter Sturdivant, his note in Calder due and the state's inspector coming, asks to talk somewhere private and offers cash to anyone who will tell him what the police have on him.",
            trigger: { type: "npc", value: "npc_carter" },
            fired: false,
            hidden: true
          } }
        ]
      },
      {
        when: { flagsSet: ["bridgeReportVoid", "policeDissolutionPassed"], flagsUnset: ["oldBridgeClosed"] },
        text: "The old bridge is still open and still rattling under every pickup. The state threw out the report Carter Sturdivant paid for and is sending its own inspector in the spring, and Jolene Overstreet has a court date in Clayburn, but the council's vote to end the town police still stands, and the department is done at the end of the month. At the Low Water they say the town saved its bridge and lost its police in the same month.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "resolved", knownToPlayer: true, summary: "The state threw out the bought bridge report and is sending its own inspector in the spring. The old bridge stays open." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "failed", knownToPlayer: true, summary: "The council's vote to end the town police stands, and the department is finished at the end of October." },
          { op: "plantSeed", seed: {
            id: "seed_after_packing",
            cause: "The town police are packing up Town Hall for the end of the month.",
            effect: "The police office at Town Hall is half packed into boxes, and Glenda Pryor is carrying the old radio logs out to her car rather than see them thrown away.",
            trigger: { type: "location", value: "loc_town_hall" },
            requires: { npcFree: ["npc_glenda"] },
            alt: {
              text: "The police office at Town Hall is half packed into boxes for the end of the month, and nobody is answering the radio."
            },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_wade_plans",
            cause: "Wade Purvis means to run the river the night the town police are gone.",
            effect: "Wade Purvis, who has heard the town police are finished at the end of the month, is asking around the landing for somebody who knows the river to help plan the first run after they are gone.",
            trigger: { type: "npc", value: "npc_wade" },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_carter_report",
            cause: "Carter Sturdivant wants to know who helped throw out his report.",
            effect: "Carter Sturdivant, his note in Calder due and the state's inspector coming, asks to talk somewhere private and offers cash to anyone who will tell him who in town helped throw out his report.",
            trigger: { type: "npc", value: "npc_carter" },
            fired: false,
            hidden: true
          } }
        ]
      },
      {
        when: { flagsSet: ["oldBridgeClosed", "policeDissolutionPassed"] },
        text: "The barriers are up on the old bridge, and the town police are finished at the end of the month; after that a county deputy is supposed to drive through twice a week. Carter Sturdivant has the closed bridge he paid for and a note in Calder he still cannot pay, and the Low Water's Saturday crowd is half what it was. The boats still go across at night, because soon nobody will be left to watch them.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "failed", knownToPlayer: true, summary: "The state closed the old bridge, and every trip to the dry county is forty minutes round by the bypass now." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "failed", knownToPlayer: true, summary: "The council's vote to end the town police stands, and the department is finished at the end of October." },
          { op: "plantSeed", seed: {
            id: "seed_after_deputy",
            cause: "The town police hand Lockett's Ferry over to the county sheriff on the last day of October.",
            effect: "On the last day of October the town police hand their keys to the county, and a sheriff's deputy from Clayburn parks at Pittman's for ten minutes and drives off again.",
            trigger: { type: "day", value: 24 },
            effects: [
              { op: "addNews", text: "The town police are finished; a county deputy from Clayburn is to drive through twice a week.", public: true }
            ],
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_wade_river",
            cause: "With the bridge shut and the police going, the river is the Night Run's only road.",
            effect: "Wade Purvis says that with the bridge shut and the town police finished, the river is the only road left to the dry county, and he offers two hundred dollars a night to anyone who will run a boat across it.",
            trigger: { type: "npc", value: "npc_wade" },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_bar_for_sale",
            cause: "Loretta Gaddis is losing the Low Water's Saturday trade to the bypass.",
            effect: "Loretta Gaddis is adding up a week of thin receipts at the end of the bar, and asks whoever is on the next stool whether they know anybody who wants to buy a bar.",
            trigger: { type: "location", value: "loc_low_water" },
            requires: { npcFree: ["npc_loretta"] },
            fired: false,
            hidden: true
          } }
        ]
      },
      {
        when: { flagsSet: ["oldBridgeClosed"], obligationStatus: { obl_debt_npc_curtis: "missed" }, npcFree: ["npc_curtis"] },
        text: "The barriers are up on the old bridge, and every trip to the dry county is forty minutes round by the bypass. The police hang on downstairs at Town Hall, Carter Sturdivant has the closed bridge he paid for, and at the Low Water Curtis Pruett still tells the story of the stranger who welshed on four hundred dollars, a little bigger every Friday.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "failed", knownToPlayer: true, summary: "The state closed the old bridge, and every trip to the dry county is forty minutes round by the bypass now." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", knownToPlayer: true, summary: "The council kept the town police, and Chief Bell's department hangs on at Town Hall." },
          { op: "plantSeed", seed: {
            id: "seed_after_curtis_square",
            cause: "Curtis Pruett would rather have some of the four hundred than tell the story another Friday.",
            effect: "Curtis Pruett lets it be known that he would call the old four hundred square for two hundred cash, and not a dollar less.",
            trigger: { type: "npc", value: "npc_curtis" },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_royce_sign",
            cause: "Pittman's Gas and Service lives on the traffic the closed bridge took away.",
            effect: "Royce Pittman has taped a hand-lettered sign in the window at Pittman's that says the station stays open, bridge or no bridge, and he is selling gas at a loss to the few cars still coming through.",
            trigger: { type: "location", value: "loc_pittmans" },
            requires: { npcFree: ["npc_royce"] },
            fired: false,
            hidden: true
          } }
        ]
      },
      {
        when: { flagsSet: ["oldBridgeClosed"], relAtLeast: { npc_loretta: { liking: 40 } }, npcFree: ["npc_loretta"] },
        text: "The barriers are up on the old bridge and the Low Water's Saturday lot is half empty, but Loretta Gaddis has kept the doors open through floods before and says she will keep them open through this. Carter Sturdivant has the closed bridge he paid for, the police are still in Town Hall for whatever that is worth, and there is a stool at the end of the bar Loretta keeps for somebody who stayed.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "failed", knownToPlayer: true, summary: "The state closed the old bridge, and every trip to the dry county is forty minutes round by the bypass now." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", knownToPlayer: true, summary: "The council kept the town police, and Chief Bell's department hangs on at Town Hall." },
          { op: "plantSeed", seed: {
            id: "seed_after_loretta_stool",
            cause: "Loretta Gaddis has decided the stranger who stayed is one of hers.",
            effect: "Loretta Gaddis sets a cold beer in front of the stool at the end of the bar before anybody asks, says it is on the house, and asks whether the stranger who stayed means to stay through the winter.",
            trigger: { type: "location", value: "loc_low_water" },
            requires: { npcFree: ["npc_loretta"] },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_hearing",
            cause: "The state has called a public hearing in Clayburn about the closed bridge.",
            effect: "A notice for a public hearing in Clayburn about the closed bridge goes up on the Town Hall door, and Royce Pittman tapes a copy in the window at Pittman's.",
            trigger: { type: "day", value: 23 },
            requires: { npcFree: ["npc_royce"] },
            effects: [
              { op: "addNews", text: "There is to be a public hearing in Clayburn about the closed bridge.", public: true }
            ],
            alt: {
              text: "A notice for a public hearing in Clayburn about the closed bridge goes up on the Town Hall door.",
              effects: [
                { op: "addNews", text: "There is to be a public hearing in Clayburn about the closed bridge.", public: true }
              ]
            },
            fired: false,
            hidden: true
          } }
        ]
      },
      {
        when: { flagsSet: ["oldBridgeClosed"] },
        text: "The barriers are up on the old bridge, and every trip to the dry county is forty minutes round by the bypass. Carter Sturdivant has the closed bridge he paid for and a note in Calder he still cannot pay, the police are still in Town Hall for whatever that is worth, and Elbert Gentry sits on the Front Street bench telling anybody who stops that he was born the year the ferry went and now he has seen the bridge go too.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "failed", knownToPlayer: true, summary: "The state closed the old bridge, and every trip to the dry county is forty minutes round by the bypass now." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", knownToPlayer: true, summary: "The council kept the town police, and Chief Bell's department hangs on at Town Hall." },
          { op: "plantSeed", seed: {
            id: "seed_after_elbert_bench",
            cause: "Elbert Gentry has outlived the ferry and now the bridge, and wants somebody to hear about it.",
            effect: "Elbert Gentry, on the Front Street bench, says the town held on when the ferry stopped the year he was born, and asks whoever sits down beside him whether it will hold on now.",
            trigger: { type: "npc", value: "npc_elbert" },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_barriers",
            cause: "The state means to keep the old bridge shut until the new one is built, and Carter Sturdivant means to be the first to speak at its hearing.",
            effect: "A state crew comes back with a flatbed and chains the barriers on the old bridge together, and staples a notice to the guardrail about a public hearing in Clayburn.",
            trigger: { type: "day", value: 23 },
            effects: [
              { op: "addNews", text: "A state crew chained the barriers on the old bridge together, and there is to be a public hearing in Clayburn.", public: true }
            ],
            fired: false,
            hidden: true
          } }
        ]
      },
      {
        when: { flagsSet: ["policeDissolutionPassed"], flagsUnset: ["oldBridgeClosed"] },
        text: "Nothing is settled. The old bridge is still open and still posted at five tons, the state has not said when it will close it, and Carter Sturdivant drives up to Calder every week and comes back looking worse. The town police are packing up Town Hall for the end of the month, and at the Low Water the bridge, the boats and the police are still the only things anybody talks about.",
        effects: [
          { op: "threadUpdate", threadId: "thr_bridge_vote", status: "failed", knownToPlayer: true, summary: "Three weeks on, the old bridge is still open and the state has not said when it will close it; nobody settled the bridge while there was time." },
          { op: "threadUpdate", threadId: "thr_police_vote", status: "failed", knownToPlayer: true, summary: "The council's vote to end the town police stands, and the department is finished at the end of October." },
          { op: "plantSeed", seed: {
            id: "seed_after_carter_note",
            cause: "Carter Sturdivant has a note due in Calder and the old bridge is still open.",
            effect: "Carter Sturdivant, back from another trip to Calder and looking worse, asks to talk somewhere private and offers cash to anyone who can tell him what it would take to get the old bridge closed before his note comes due.",
            trigger: { type: "npc", value: "npc_carter" },
            fired: false,
            hidden: true
          } },
          { op: "plantSeed", seed: {
            id: "seed_after_wade_run",
            cause: "Wade Purvis is tired of waiting on the council and the state.",
            effect: "Wade Purvis, tired of waiting on the council, is asking around the landing for somebody to help him run a full load across while the bridge is still open.",
            trigger: { type: "npc", value: "npc_wade" },
            fired: false,
            hidden: true
          } }
        ]
      }
    ],
    default: {
      text: "Three weeks in, nothing is settled. The old bridge is still open and still posted at five tons, the state has not said when it will close it, and Carter Sturdivant drives up to Calder every week and comes back looking worse. The town police are still in Town Hall, kept for now, and at the Low Water the bridge, the boats and the police are still the only things anybody talks about.",
      effects: [
        { op: "threadUpdate", threadId: "thr_bridge_vote", status: "failed", knownToPlayer: true, summary: "Three weeks on, the old bridge is still open and the state has not said when it will close it; nobody settled the bridge while there was time." },
        { op: "threadUpdate", threadId: "thr_police_vote", status: "resolved", knownToPlayer: true, summary: "The council kept the town police, for now, and Chief Bell's department hangs on at Town Hall." },
        { op: "plantSeed", seed: {
          id: "seed_after_carter_worse",
          cause: "Carter Sturdivant has a note due in Calder and the old bridge is still open.",
          effect: "Carter Sturdivant, back from another trip to Calder and looking worse, asks to talk somewhere private and offers cash to anyone who can tell him what it would take to get the old bridge closed before his note comes due.",
          trigger: { type: "npc", value: "npc_carter" },
          fired: false,
          hidden: true
        } },
        { op: "plantSeed", seed: {
          id: "seed_after_wade_load",
          cause: "Wade Purvis is tired of waiting on the council and the state.",
          effect: "Wade Purvis, tired of waiting on the council, is asking around the landing for somebody to help him run a full load across while the bridge is still open.",
          trigger: { type: "npc", value: "npc_wade" },
          fired: false,
          hidden: true
        } }
      ]
    }
  }
};

// ===== TABLES =====
const TABLES = {
  npc: {
    firstNames: [
      "Ashley", "Bobby", "Brandi", "Clint", "Crystal", "Darrell", "Dakota", "Dusty", "Earl", "Faye",
      "Gary", "Heather", "Jamal", "Jesse", "Keisha", "Kenny", "Lacey", "Lonnie", "Opal", "Misty",
      "Odell", "Patsy", "Randy", "Rhonda", "Shawn", "Terrell", "Trina", "Vernon", "Wanda", "Wesley"
    ],
    occupations: [
      "long-haul trucker", "dollar store manager", "home health aide", "catfish farmer", "logger", "school bus driver", "lineman for the power co-op", "prison guard", "welder", "roofer",
      "crop duster", "hairdresser", "rural mail carrier", "deer processor", "bait shop clerk", "tow truck driver", "substitute teacher", "pharmacy tech", "oil change tech", "line cook",
      "part-time preacher", "barge deckhand", "game warden", "insurance agent", "feed store clerk", "nursing home aide", "used car salesman", "septic tank pumper", "church secretary", "night stocker"
    ]
  },
  location: {
    types: [
      "dollar store", "laundromat", "feed store", "hair salon", "deer processing shed", "storage units", "salvage yard", "veterans' hall",
      "boarded-up bank", "fireworks stand", "tire shop", "barbecue shack", "volunteer fire station", "fish camp", "car wash"
    ],
    details: [
      "a dog asleep across the doorway that nobody moves",
      "a flood line drawn in marker at chest height",
      "a bell on the door that sticks halfway",
      "a window unit dripping onto the sidewalk",
      "a smell of fryer grease and bleach",
      "a church calendar three years out of date",
      "a list of bad checks taped beside the register",
      "a mounted bass on the wall with a cigarette in its mouth",
      "a cracked window patched with duct tape",
      "a one-eared cat asleep on the counter",
      "a floor that slopes toward the river",
      "cartons of cigarettes stacked behind the counter",
      "a faded drawing of the bridge taped to the door",
      "a security camera with its cable cut, still pointed at the door",
      "a pit bull mix that wants its ears scratched",
      "a radio tuned to the farm report",
      "a SAVE OUR BRIDGE sign in the window",
      "a pair of muddy boots left on the step",
      "a single path of mud tracked across the floor",
      "a coffee can by the register collecting for Amber Lott's headstone"
    ],
    problems: [
      "the roof leaks over the cash register",
      "Sturdivant Land and Timber has been asking about the note on it",
      "the delivery truck stopped coming when the bridge got posted",
      "Travis Cagle stops by after his shift for free food",
      "the well water has gone bad",
      "the power bill is two months behind",
      "the window unit died in August and nothing has replaced it",
      "last spring's flood left the floor soft",
      "the sign blew down in the last storm and is still in the weeds",
      "the rent went up when the bridge vote was announced",
      "the freezer died and took a month of stock with it",
      "the Night Run wants to use the back room",
      "something has died under the floor",
      "a week's takings went missing from the register",
      "the power gets cut off on Friday unless somebody pays"
    ]
  },
  items: {
    // What the player can buy, priced as the places' details say. kind
    // (CONTRACTS section 7): a good is carried; a drink, a food or a service is
    // had on the spot and never kept in the inventory ("Night at the motel"
    // is the lodging). Names never say where: you buy it where you are.
    goods: [
      { name: "Pack of cigarettes", price: 9, kind: "good" },
      { name: "Carton of cigarettes", price: 72, kind: "good" },
      { name: "Fifth of bourbon", price: 28, kind: "good" },
      { name: "Case of beer", price: 26, kind: "good" },
      { name: "Bottle of beer", price: 3, kind: "drink" },
      { name: "Shot of whiskey", price: 6, kind: "drink" },
      { name: "Catfish basket", price: 9, kind: "food" },
      { name: "Cheeseburger and fries", price: 11, kind: "food" },
      { name: "Sausage biscuit", price: 3, kind: "food" },
      { name: "Night at the motel", price: 49, kind: "service" },
      { name: "Gallon of gas", price: 3, kind: "service" },
      { name: "Five-gallon can of outboard gas", price: 22, kind: "good" },
      { name: "Bag of ice", price: 3, kind: "good" },
      { name: "Energy drink", price: 4, kind: "drink" },
      { name: "Prepaid phone", price: 45, kind: "good" },
      { name: "Phone charger", price: 12, kind: "good" },
      { name: "Thirty days of prepaid minutes", price: 35, kind: "service" },
      { name: "Flashlight", price: 15, kind: "good" },
      { name: "Pocketknife", price: 18, kind: "good" },
      { name: "Lighter", price: 2, kind: "good" },
      { name: "Deck of cards", price: 4, kind: "good" },
      { name: "Lottery scratch-off", price: 5, kind: "good" },
      { name: "Tube of crickets", price: 3, kind: "good" },
      { name: "Dozen night crawlers", price: 5, kind: "good" },
      { name: "Rod and reel", price: 49, kind: "good" },
      { name: "Johnboat rented for a night", price: 60, kind: "service" },
      { name: "Outboard tune-up", price: 150, kind: "service" },
      { name: "Haircut", price: 15, kind: "service" },
      { name: "Cup of coffee", price: 2, kind: "drink" },
      { name: "Tire patch", price: 20, kind: "service" },
      { name: "Crowbar", price: 18, kind: "good" },
      { name: "Bolt cutters", price: 35, kind: "good" },
      { name: "Roll of duct tape", price: 7, kind: "good" },
      { name: "Rain jacket", price: 35, kind: "good" },
      { name: "Work boots", price: 95, kind: "good" },
      { name: "Pawned wedding ring", price: 120, kind: "good" },
      { name: "Pawned guitar", price: 90, kind: "good" },
      { name: "Used shotgun", price: 240, kind: "good" },
      { name: "Naloxone nasal spray", price: 45, kind: "good" },
      { name: "First aid kit", price: 22, kind: "good" }
    ],
    trinkets: [
      "a wedding ring with the stone missing",
      "a commemorative coin from the bridge's fiftieth anniversary",
      "a high school class ring with the year worn off",
      "a cracked phone with a photo still on the lock screen",
      "a hand-carved wooden fishing lure",
      "a cardboard church fan with a funeral home ad on the back",
      "a laminated prayer card",
      "a motel key on a plastic diamond tag",
      "a casino chip from a riverboat downriver",
      "an instant photo of two girls on a tailgate",
      "a dog tag on a bead chain",
      "a cassette tape labeled in marker",
      "a lighter engraved with someone else's initials",
      "a key to a storage unit",
      "a bottle cap from a beer nobody makes any more",
      "a child's hospital bracelet",
      "a rabbit's foot on a keychain",
      "a matchbook from a strip club off the interstate",
      "a state fair ribbon for third place",
      "a ring too small for any finger"
    ]
  },
  /* What a partial costs and how a failure turns (Dice.complication picks
     one that fits; the engine's table, docs/notes/engine-world.md). tiers:
     partial (a cost), failure (a twist), both. kinds: social, physical,
     stealth, any (Dice.COMPLICATION_KIND maps action types to kinds).
     needsPerson: only rolled with someone present, who is {witness} in the
     text and "{witnessId}" in the effects; notDay1: not on the first day.
     effects run through State.apply when the pipeline applies the roll.
     Nobody here is made up: a person is always someone in the scene. */
  complications: [
    { text: "it takes far longer than it should", tiers: ["both"], kinds: ["any"] },
    { text: "you get it, but you get hurt doing it", tiers: ["partial"], kinds: ["physical"],
      effects: [{ op: "playerHp", delta: -1 }] },
    { text: "it costs more than you meant to spend", tiers: ["partial"], kinds: ["social"] },
    { text: "{witness} goes along with it, but wants a favor back", tiers: ["partial"], kinds: ["social"], needsPerson: true },
    { text: "you make more noise than you meant to", tiers: ["partial"], kinds: ["stealth", "physical"] },
    { text: "{witness} notices more than you'd like", tiers: ["partial"], kinds: ["social", "stealth"], needsPerson: true },
    { text: "you drop something and it rolls out of reach", tiers: ["partial"], kinds: ["physical", "stealth"] },
    { text: "you say more than you meant to", tiers: ["partial"], kinds: ["social"] },
    { text: "{witness} takes it personally", tiers: ["failure"], kinds: ["social"], needsPerson: true,
      effects: [{ op: "attitudeDelta", npcId: "{witnessId}", delta: -5 }] },
    { text: "{witness} catches you at it", tiers: ["failure"], kinds: ["stealth"], needsPerson: true,
      effects: [{ op: "socialEvent", npcId: "{witnessId}", event: "caught_you_at", text: "caught {playerName} sneaking around {place}", weight: 2 }] },
    { text: "{witness} starts telling people about it", tiers: ["failure"], kinds: ["social", "physical"], needsPerson: true,
      effects: [{ op: "addRumour", rumour: { text: "The newcomer {playerName} has been making trouble at {place}.", true: true, sourceNpcId: "{witnessId}", heard: false } }] },
    { text: "{witness} reports it to the police", tiers: ["failure"], kinds: ["stealth", "physical"], needsPerson: true,
      effects: [{ op: "addNews", text: "{witness} reported {playerName} to the police after trouble at {place}.", public: false }] },
    { text: "{witness} sees it, and will know your face from now on", tiers: ["failure"], kinds: ["social", "stealth"], needsPerson: true, notDay1: true },
    { text: "{witness} gets it on video", tiers: ["failure"], kinds: ["stealth", "physical"], needsPerson: true },
    { text: "it breaks", tiers: ["failure"], kinds: ["physical"] },
    { text: "you lose your footing and go down hard", tiers: ["failure"], kinds: ["physical"] },
    { text: "it sets off an alarm", tiers: ["failure"], kinds: ["stealth", "physical"] },
    { text: "a dog starts barking", tiers: ["failure"], kinds: ["stealth"] },
    { text: "a motion light snaps on", tiers: ["failure"], kinds: ["stealth"] },
    { text: "you say the wrong thing and it lands badly", tiers: ["failure"], kinds: ["social"] }
  ],
  weather: {
    spring: [
      "Warm rain coming in sideways off the river",
      "Gray and still, the river high and brown over the low ground",
      "Bright and windy, pollen yellow on every windshield",
      "Fog on the water until ten, then hard sun",
      "Thunderstorms building all afternoon",
      "A cool clear morning with mist coming off the ramp"
    ],
    summer: [
      "Hot and airless, the river low and smelling of mud",
      "A thunderstorm at four o'clock and steam off the asphalt after",
      "Clear and dry, dust blowing off the gravel lots",
      "Muggy, with mosquitoes thick over the water at dusk",
      "Heat lightning all night and no rain",
      "A long hot evening, cicadas loud in the trees"
    ],
    autumn: [
      "Steady rain and a rising river",
      "Wind stripping the pecan trees into the water",
      "Low fog that sits on the river all morning",
      "Cool, bright and blustery",
      "Drizzle, with smoke from a burn pile lying low over the trailers",
      "First frost, the pickups white with it at dawn"
    ],
    winter: [
      "Cold rain blowing down Front Street",
      "Hard frost, ice at the edges of the boat ramp",
      "A dusting of snow that is slush by noon",
      "A raw north wind and the bridge humming in it",
      "Freezing fog on every rail and wire",
      "Three warm days in a row, the river brown and fast with runoff"
    ]
  }
};

// ===== BACKGROUNDS =====
// Each background carries two things of its own and a cheap prepaid phone
// (one bar by the water tower, so the people who live elsewhere can be
// reached). hook: the first lead the town offers this kind of stranger,
// from someone in the cast (npcId), told when the trigger meets (an npc
// trigger fires when the player is with that person), not before day
// 1 + dayOffset.
const BACKGROUNDS = [
  {
    id: "bg_veteran",
    name: "Veteran",
    blurb: "You did two tours overseas, came home to a town that had moved on without you, and have been drifting south on buses ever since.",
    age: 34,
    stats: { might: 2, wits: 0, charm: 0, stealth: 1 },
    gold: 140,
    items: [
      { id: "item_folding_knife", name: "Folding knife", qty: 1, notes: "Kept sharp out of habit." },
      { id: "item_dog_tags", name: "Dog tags", qty: 1, notes: "Yours, and one from a friend who did not come home." },
      { id: "item_phone_veteran", name: "Prepaid phone", qty: 1, notes: "A cheap flip phone with forty minutes left on it. It finds one bar by the water tower and none anywhere else." }
    ],
    arrival: "gate",
    hook: {
      npcId: "npc_marcus",
      text: "Chief Marcus Bell clocks the way {player} stands, asks where {player} served, and says he could use somebody nobody in town knows yet to sit above the boat ramp one night and tell him what goes on down there.",
      dayOffset: 0,
      trigger: { type: "npc", value: "npc_marcus" }
    }
  },
  {
    id: "bg_dropout",
    name: "Dropout",
    blurb: "You walked out of a welding apprenticeship and your uncle's house on the same night, and took his good tools with you.",
    age: 19,
    stats: { might: 1, wits: 1, charm: -1, stealth: 2 },
    gold: 35,
    items: [
      { id: "item_socket_set", name: "Socket set", qty: 1, notes: "Your uncle's initials are engraved on the case." },
      { id: "item_gas_station_sandwich", name: "Gas station sandwich", qty: 2, notes: "Bought yesterday, two states back." },
      { id: "item_phone_dropout", name: "Prepaid phone", qty: 1, notes: "Bought at a truck stop on the way down, with your uncle's number already blocked." }
    ],
    arrival: "docks",
    hook: {
      npcId: "npc_dewayne",
      text: "Dewayne Mangum turns {player}'s socket set over, reads the initials on the case, and says he could use a hand in the service bays at Pittman's for a few days, twelve dollars an hour, cash.",
      dayOffset: 0,
      trigger: { type: "npc", value: "npc_dewayne" }
    }
  },
  {
    id: "bg_fired_bookkeeper",
    name: "Fired bookkeeper",
    blurb: "You kept the books for a car dealership until forty thousand dollars went missing and everyone looked at you.",
    age: 38,
    stats: { might: -1, wits: 3, charm: 1, stealth: 0 },
    gold: 220,
    items: [
      { id: "item_thumb_drive", name: "Thumb drive", qty: 1, notes: "A copy of the dealership's real books, taken on your last day." },
      { id: "item_reference_letter", name: "Reference letter", qty: 1, notes: "On dealership letterhead, and you wrote it yourself." },
      { id: "item_phone_bookkeeper", name: "Prepaid phone", qty: 1, notes: "A new number nobody from the dealership has. It finds one bar by the water tower." }
    ],
    arrival: "gate",
    hook: {
      npcId: "npc_hollis",
      text: "Hollis Byrd hears that {player} used to keep books and says he has a shoebox of receipts that need to add up to a pawn shop's books by the end of the month, cash for the work and no questions either way.",
      dayOffset: 0,
      trigger: { type: "npc", value: "npc_hollis" }
    }
  },
  {
    id: "bg_river_deckhand",
    name: "River deckhand",
    blurb: "You worked towboats up and down the river for years and know every lock keeper and bait shop between here and the coast.",
    age: 36,
    stats: { might: 1, wits: 1, charm: 1, stealth: 0 },
    gold: 320,
    items: [
      { id: "item_rain_gear", name: "Rain gear", qty: 1, notes: "Orange bibs and jacket, stiff with river mud." },
      { id: "item_carton_cigarettes", name: "Carton of cigarettes", qty: 2, notes: "Bought cheap on this side of the line, worth double across the river." },
      { id: "item_phone_deckhand", name: "Prepaid phone", qty: 1, notes: "A cheap prepaid in a zip bag. It holds a charge for days and finds no signal on the river." }
    ],
    arrival: "docks",
    hook: {
      npcId: "npc_wade",
      text: "Wade Purvis looks at {player}'s hands and river-burned neck, asks which boats {player} worked, and says he could use a deckhand who knows the water for one night's run across, two hundred dollars cash.",
      dayOffset: 1,
      trigger: { type: "npc", value: "npc_wade" }
    }
  },
  {
    id: "bg_group_home_kid",
    name: "Group home kid",
    blurb: "You grew up in a church group home two counties over, on donated clothes, chores and Sunday services.",
    age: 18,
    stats: { might: 0, wits: 1, charm: 1, stealth: 1 },
    gold: 45,
    items: [
      { id: "item_pocket_bible", name: "Pocket Bible", qty: 1, notes: "Your name is written inside the cover in a housemother's hand." },
      { id: "item_birth_certificate", name: "Birth certificate", qty: 1, notes: "The space for the father's name is blank." },
      { id: "item_phone_group_home", name: "Prepaid phone", qty: 1, notes: "The group home gave it to you the day you aged out, with its office number already in it." }
    ],
    arrival: "gate",
    hook: {
      npcId: "npc_nadine",
      text: "Nadine Dees sees the group home's name stamped inside {player}'s pocket Bible, says she knows the housemother whose handwriting that is, and asks {player} to come by the Parsonage for supper on Wednesday evening.",
      dayOffset: 0,
      trigger: { type: "npc", value: "npc_nadine" }
    }
  },
  {
    id: "bg_poker_hustler",
    name: "Poker hustler",
    blurb: "You make your living in back-room card games, and two riverboat casinos downriver keep your photo behind the cashier's cage.",
    age: 31,
    stats: { might: -1, wits: 1, charm: 1, stealth: 2 },
    gold: 380,
    items: [
      { id: "item_marked_deck", name: "Marked deck", qty: 1, notes: "Pricked on the backs where only your thumb can find it." },
      { id: "item_fake_license", name: "Fake driver's license", qty: 1, notes: "Good enough for a bartender, not for a cop." },
      { id: "item_phone_hustler", name: "Prepaid phone", qty: 1, notes: "A burner with three numbers in it, none of which you would call from here." }
    ],
    arrival: "docks",
    hook: {
      npcId: "npc_curtis",
      text: "Curtis Pruett watches {player} shuffle, smiles, and invites {player} to his Friday night game at the back table of the Low Water, hundred-dollar buy-in, house rules.",
      dayOffset: 0,
      trigger: { type: "npc", value: "npc_curtis" }
    }
  }
];

// ===== FLAWS =====
const FLAWS = [
  "Can't pass a scratch-off ticket or a card game without buying in.",
  "Can't let an insult go, even from a man with a badge.",
  "Lies out of habit, even when the truth would do.",
  "Owes money to half the people in their phone.",
  "Drinks to steady the nerves, and it hasn't worked yet.",
  "Talks too much after the second beer.",
  "Can't stand a cop and never hides it.",
  "Pockets things that aren't locked down."
];

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
const LOOSE_ENDS = {
  debt: {
    label: "A debt",
    options: [
      "I owe a man in this town six hundred dollars I don't have.",
      "I took out a title loan I couldn't cover, and the note was sold to someone here.",
      "I lost four hundred dollars at cards and swore I'd pay it inside a week."
    ],
    link: { tag: "lender", optionTags: ["lender", "collector", "bookie"] },
    seed: {
      dayOffset: [3, 4],
      effect: "{npc} walks up to you, reads your name off a folded paper with a number written under it, and says the money is due in three days.",
      trigger: "day"
    },
    obligation: {
      kind: "debt",
      amount: 400,
      dueOffset: 3,
      text: "Pay {npc} the four hundred dollars you owe.",
      missText: "{npc} came looking for the four hundred dollars and took {playerName}'s phone as a start on it.",
      onMiss: [
        { op: "takeItem", name: "Prepaid phone" },
        { op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -15 }, text: "{playerName} let the four hundred go past due, so I took the phone as a start.", weight: 3, act: "own" },
        { op: "addNews", text: "{npc} came looking for the four hundred dollars and took {playerName}'s phone as a start on it.", public: false }
      ],
      onMet: [
        { op: "socialEvent", npcId: "{npcId}", event: "paid_back", d: { w: 10 }, text: "{playerName} paid the four hundred in full and on time.", weight: 2 }
      ]
    },
    obligations: [
      {
        kind: "debt",
        amount: 600,
        dueOffset: 3,
        text: "Pay {npc} the six hundred dollars you owe.",
        missText: "{npc} came looking for the six hundred dollars and took {playerName}'s phone as a down payment.",
        onMiss: [
          { op: "takeItem", name: "Prepaid phone" },
          { op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -15 }, text: "{playerName} let the six hundred go past due, so I took the phone as a start.", weight: 3, act: "own" },
          { op: "addNews", text: "{npc} came looking for the six hundred dollars and took {playerName}'s phone as a down payment.", public: false }
        ],
        onMet: [
          { op: "socialEvent", npcId: "{npcId}", event: "paid_back", d: { w: 10 }, text: "{playerName} paid the six hundred in full and on time.", weight: 2 }
        ]
      },
      {
        kind: "debt",
        amount: 300,
        dueOffset: 3,
        text: "Pay {npc} the three hundred dollars on the title-loan note.",
        missText: "{npc} caught up with {playerName} about the title-loan note and took what cash there was, and the phone.",
        onMiss: [
          { op: "obligationPaid", id: "{obligationId}", amount: 150, take: true },
          { op: "takeItem", name: "Prepaid phone" },
          { op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -10 }, text: "{playerName} let the title-loan note go past due, so I took what cash there was and the phone.", weight: 3, act: "own" },
          { op: "addNews", text: "{npc} caught up with {playerName} about the title-loan note and took what cash there was, and the phone.", public: false }
        ],
        onMet: [
          { op: "socialEvent", npcId: "{npcId}", event: "paid_back", d: { w: 10 }, text: "{playerName} paid off the title-loan note, fees and all.", weight: 2 }
        ]
      },
      {
        kind: "debt",
        amount: 400,
        dueOffset: 3,
        text: "Pay {npc} the four hundred dollars from the card game.",
        missText: "{npc} came looking for the four hundred dollars from the card game and went away without it, and now Loretta Gaddis won't serve {playerName} at the Low Water.",
        onMiss: [
          { op: "banFrom", locationId: "loc_low_water", days: 3, byNpcId: "{npcId}" },
          { op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -20 }, text: "{playerName} welshed on four hundred dollars, and I made sure Loretta heard.", weight: 3, act: "own", public: true },
          { op: "addNews", text: "{npc} is telling everybody at the Low Water that {playerName} welshed on four hundred dollars, and Loretta Gaddis won't serve a welsher.", public: true }
        ],
        onMet: [
          { op: "socialEvent", npcId: "{npcId}", event: "paid_back", d: { w: 10 }, text: "{playerName} paid the four hundred from the card game, every dollar.", weight: 2 }
        ]
      }
    ]
  },
  enemy: {
    label: "An enemy",
    options: [
      "Someone I wronged is already here, waiting for me.",
      "A man I testified against is out on parole, and he's already here waiting for me.",
      "I humiliated someone in public, and they're already here waiting for me."
    ],
    link: { tag: "enemy", optionTags: ["enemy", "parolee", "enemy"] },
    seed: {
      dayOffset: [4, 7],
      effect: "{npc} steps in front of you, says your full name, first and last, slow, and says the waiting is over and it gets settled before the week is out.",
      trigger: "day"
    },
    // Wave 5 (the round-4 playtest): three to five days after that, while the loose end is open and they still hold it against you, they come for you.
    followUp: {
      dayOffset: [3, 5],
      effect: "{npc} comes up on you from the side, puts you against the nearest wall and hits you twice, hard, and says that was the first part of it.",
      effects: [
        { op: "playerHp", delta: -2 },
        { op: "addCondition", name: "Bruised ribs", effect: "-1 might", days: 2 },
        { op: "addMemory", npcId: "{npcId}", text: "Put {playerName} against a wall and hit them twice, the first part of what they have coming.", weight: 3, act: "own" }
      ],
      alt: {
        text: "{npc} passes you close enough to touch, looks at you a long moment, and keeps walking."
      }
    }
  },
  secret: {
    label: "A secret",
    options: [
      "Someone here knows what I did before I came.",
      "I'm going by a name that isn't mine.",
      "I'm carrying something stolen, and someone here knows it."
    ],
    link: { tag: "informant" },
    seed: {
      dayOffset: [3, 6],
      effect: "{npc} gets you to one side, repeats one true detail of your secret, and names a price for keeping it quiet: two hundred dollars, by the day after tomorrow.",
      trigger: "day"
    },
    obligation: {
      kind: "blackmail",
      amount: 200,
      dueOffset: 2,
      text: "Pay {npc} two hundred dollars to keep your secret quiet.",
      missText: "{npc} did not get the two hundred dollars and has told Chief Bell what {playerName} is hiding, and comes by to say so.",
      onMiss: [
        { op: "socialEvent", npcId: "npc_marcus", event: "told_anyway", d: { w: -10 }, text: "{npc} told me what {playerName} is hiding.", weight: 2 },
        { op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -10 }, text: "{playerName} would not pay, so I told Chief Bell what {playerName} is hiding.", weight: 3, act: "own" },
        { op: "addNews", text: "{npc} has been telling people what {playerName} is hiding.", public: true }
      ],
      onMet: [
        { op: "socialEvent", npcId: "{npcId}", event: "paid_silence", text: "{playerName} paid me two hundred dollars to keep quiet.", weight: 2 }
      ]
    }
  },
  lost: {
    label: "Someone lost",
    options: [
      "Amber Lott, a girl I knew, died here in August, and I want to know who sold her the pills.",
      "I want to know who left me at a church group home, and why.",
      "An old friend of mine from the towboats came home to this town years ago, and nobody has heard from him since."
    ],
    link: { tag: "records", optionTags: ["bereaved", "secretary", "witness"] },
    seed: {
      dayOffset: [4, 8],
      effect: "{npc} draws you aside and says, low, that there is something to tell about what you came here to find out, but not here and not now.",
      trigger: "day"
    }
  },
  promise: {
    label: "A promise",
    options: [
      "I promised a woman in Clayburn I'd put her letter in her daughter's hand.",
      "I promised a man in the state pen I'd look in on his boy here.",
      "I promised a woman I'd bring her daughter home from this town."
    ],
    link: { tag: "bartender", optionTags: ["runaway", "dealer", "runaway"] },
    seed: {
      dayOffset: [2, 4],
      effect: "{npc} catches you looking a second too long, and asks, flat and careful, who sent you to Lockett's Ferry.",
      trigger: "day"
    },
    obligation: {
      kind: "promise",
      dueOffset: 4,
      text: "Keep your word to {npc}.",
      missText: "{npc} finds {playerName} and asks, flat, what happened to the promise {playerName} made.",
      onMiss: [
        { op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -10 }, text: "{playerName} made me a promise and let the day go by.", weight: 2 }
      ],
      onMet: [
        { op: "socialEvent", npcId: "{npcId}", event: "kept_word", d: { w: 10 }, text: "{playerName} kept the promise they made me.", weight: 2 }
      ]
    },
    obligations: [
      {
        kind: "errand",
        dueOffset: 4,
        text: "Put the letter in {npc}'s hand.",
        itemName: "Letter for {npc}",
        owedTo: "npc_bernice",
        missText: "The letter for {npc} is still in {playerName}'s pocket, and the day {playerName} promised to put it in {npc}'s hand has come and gone.",
        onStart: [
          { op: "giveItem", name: "Letter for {npc}", notes: "Sealed, addressed in a careful hand, and not yours to open." }
        ],
        onMiss: [
          { op: "addMemory", npcId: "npc_bernice", text: "{playerName} promised to put my letter in my daughter's hand and never did.", weight: 2 },
          { op: "addNews", text: "The letter for {npc} is still in {playerName}'s pocket.", public: false }
        ],
        onMet: [
          { op: "socialEvent", npcId: "{npcId}", event: "kept_word", d: { w: 15 }, text: "{playerName} brought me a letter from home.", weight: 3 }
        ]
      },
      {
        kind: "promise",
        dueOffset: 4,
        text: "Look in on {npc} for his father, the way you promised.",
        owedTo: "npc_dale",
        missText: "The day {playerName} promised Dale Purvis has come and gone without {playerName} looking in on {npc}.",
        onMiss: [
          { op: "addMemory", npcId: "npc_dale", text: "{playerName} promised to look in on my boy and never wrote.", weight: 2 }
        ],
        onMet: [
          { op: "socialEvent", npcId: "{npcId}", event: "kept_word", d: { w: 10 }, text: "{playerName} came around because my daddy asked them to.", weight: 2 }
        ]
      },
      {
        kind: "promise",
        dueOffset: 5,
        text: "Get {npc} to go home, the way you promised.",
        owedTo: "npc_bernice",
        missText: "The day {playerName} promised {npc}'s mother has come and gone, and {npc} is still in Lockett's Ferry.",
        onMiss: [
          { op: "addMemory", npcId: "npc_bernice", text: "{playerName} promised to bring my daughter home and has not.", weight: 2 }
        ],
        onMet: [
          { op: "socialEvent", npcId: "{npcId}", event: "kept_word", d: { w: 10 }, text: "{playerName} kept their word to my mother and got me home.", weight: 2 },
          { op: "addMemory", npcId: "npc_bernice", text: "{playerName} brought my daughter home.", weight: 3 }
        ]
      }
    ]
  }
};

// ===== GRUDGE_TEMPLATES =====
// What someone with a grudge does about it. effect: the text the narrator
// gets when it fires; kind: what sort of answer it is (violence, police,
// gossip, money or ban: a grudge answers in kind, World.grudgeKind);
// effects: what it does to the player, in code (CONTRACTS section 2);
// public: whether the town hears of it. forTags: only someone
// with one of these tags holds it; notForTags: nobody with one of these. The
// old, the young and the law never beat anyone (the law uses its own ways),
// and nobody assumes the player has a phone or a vehicle.
const GRUDGE_TEMPLATES = [
  {
    effect: "{npc} tells Chief Bell that {player} was seen hanging around where things went missing, and the police start keeping an eye on {player}.",
    kind: "police",
    // Wave 6 (the round-5 playtest's design note): a theft's answer; a beating is reported as what it was (the next).
    about: ["theft"],
    dayOffset: [2, 4],
    effects: [
      { op: "socialEvent", npcId: "npc_marcus", event: "crossed", d: { w: -10, t: -10 }, text: "{npc} says {playerName} was hanging around where things went missing.", weight: 2, secondhand: true }
    ],
    public: false,
    notForTags: ["police"]
  },
  {
    effect: "{npc} tells everyone at the counter at Pittman's that {player} is a thief, and for days every register in town charges {player} more and watches their hands.",
    kind: "money",
    dayOffset: [2, 3],
    effects: [
      { op: "playerPrice", factor: 1.25, days: 5 },
      { op: "reputationDelta", key: "town", delta: -5 }
    ],
    public: true
  },
  {
    effect: "{npc} puts {player}'s name on the list by the register of people the Low Water will not serve.",
    kind: "ban",
    dayOffset: [2, 3],
    effects: [
      { op: "banFrom", locationId: "loc_low_water", days: 3, byNpcId: "{npcId}" }
    ],
    public: true,
    forTags: ["bartender"]
  },
  {
    effect: "{npc} complains about {player} to Loretta Gaddis until she puts {player}'s name on the list by the register of people the Low Water will not serve.",
    kind: "ban",
    dayOffset: [2, 4],
    effects: [
      { op: "banFrom", locationId: "loc_low_water", days: 3, byNpcId: "npc_loretta" },
      { op: "socialEvent", npcId: "npc_loretta", event: "crossed", d: { w: -5, t: -5 }, text: "{npc} kept on at me about {playerName} until I put their name on the list.", secondhand: true }
    ],
    public: true,
    notForTags: ["bartender", "teen", "police"]
  },
  {
    effect: "{npc} gets {player} away from the others for a minute and beats them, quick and quiet, as a warning.",
    kind: "violence",
    dayOffset: [3, 5],
    effects: [
      { op: "playerHp", delta: -3 },
      { op: "addCondition", name: "Beaten", effect: "-1 might", days: 2 }
    ],
    public: false,
    forTags: ["tough"],
    notForTags: ["elderly", "teen", "police"]
  },
  {
    effect: "{npc} shoves {player} into a wall in front of people and dares them to do something about it.",
    kind: "violence",
    dayOffset: [2, 4],
    effects: [
      { op: "playerHp", delta: -1 },
      { op: "reputationDelta", key: "town", delta: -3 }
    ],
    public: true,
    forTags: ["smuggler", "driver", "mechanic", "farmer", "cook", "boatman"],
    notForTags: ["elderly", "teen", "police"]
  },
  {
    effect: "{npc} finds out where {player} has been sleeping and goes through their things while they are out, and takes the first thing worth anything.",
    kind: "money",
    dayOffset: [3, 5],
    effects: [
      { op: "takeItem", name: "Prepaid phone" }
    ],
    public: false,
    notForTags: ["elderly", "teen", "police"]
  },
  {
    // Wave 32: the gossip goes along {npc}'s own ties (propagate), not to a fixed list.
    effect: "{npc} tells everyone close to them that {player} has been talking to the police, and nobody in the Night Run will look at {player} after that.",
    kind: "gossip",
    dayOffset: [2, 5],
    effects: [
      { op: "propagate", npcId: "{npcId}", event: "crossed", factor: 2, text: "heard from {npc} that {playerName} has been talking to the police" },
      { op: "reputationDelta", key: "fac_nightrun", delta: -10 }
    ],
    public: false,
    notForTags: ["police", "elderly"]
  },
  {
    // Wave 32: the people close to {npc} hear it (propagate), not a fixed pair.
    effect: "{npc} tells everybody at Wednesday supper that {player} is not to be trusted, and the people close to {npc} go cool on {player}.",
    kind: "gossip",
    dayOffset: [2, 5],
    effects: [
      { op: "propagate", npcId: "{npcId}", event: "crossed", factor: 2, text: "heard from {npc} at Wednesday supper that {playerName} is not to be trusted" },
      { op: "reputationDelta", key: "town", delta: -5 }
    ],
    public: true,
    forTags: ["elderly", "records", "housekeeper"],
    notForTags: ["priest", "secretary"]
  },
  {
    effect: "{npc} tells anybody at Pittman's who will listen that {player} is a creep, and the looks follow {player} around town for days.",
    kind: "gossip",
    dayOffset: [2, 4],
    effects: [
      { op: "reputationDelta", key: "town", delta: -5 }
    ],
    public: true,
    forTags: ["teen"]
  },
  {
    effect: "{npc} stops {player} in front of everybody, runs their name, and writes them a fifty-dollar ticket for loitering.",
    kind: "police",
    dayOffset: [2, 4],
    effects: [
      { op: "playerGold", delta: -50 }
    ],
    public: true,
    forTags: ["police"]
  },
  {
    // Wave 32: the department is whoever {npc} works with (propagate along their ties).
    effect: "{npc} tells the rest of the department that {player} is a person of interest, and every officer who passes takes a long look.",
    kind: "police",
    dayOffset: [2, 5],
    effects: [
      { op: "propagate", npcId: "{npcId}", event: "crossed", factor: 2, text: "heard from {npc} that {playerName} is a person of interest" },
      { op: "reputationDelta", key: "fac_police", delta: -10 }
    ],
    public: false,
    forTags: ["police", "dispatcher"]
  },
  {
    effect: "{npc} tells Shayla Rawls in her chair that {player}'s story about where {player} came from does not add up, and by the end of the week half of Riverbend has heard it.",
    kind: "gossip",
    dayOffset: [2, 5],
    effects: [
      { op: "socialEvent", npcId: "npc_shayla", event: "crossed", d: { w: -5, t: -5 }, text: "heard from {npc} that the story {playerName} tells about where they came from does not add up", secondhand: true },
      { op: "reputationDelta", key: "town", delta: -5 }
    ],
    public: true,
    notForTags: ["hairdresser", "elderly"]
  },
  // Wave 6 (the round-5 playtest's design note): a beating reported as what it was (added last: a seed keeps its template by index).
  {
    effect: "{npc} goes to Chief Bell about what {player} did to them, and the police start keeping an eye on {player}.",
    kind: "police",
    about: ["violence"],
    dayOffset: [2, 4],
    effects: [
      { op: "socialEvent", npcId: "npc_marcus", event: "crossed", d: { w: -10, t: -10 }, text: "{npc} reported {playerName} for putting hands on them.", weight: 2, secondhand: true }
    ],
    public: false,
    notForTags: ["police"]
  },
  /* Wave 27: a report, someone the player has frightened or hurt telling
     whoever looks out for them (World's plantReport, never a grudge's
     template; added last: a seed keeps its template by index). to: whom it
     goes to (police, or family for a parent, a boss or anyone else); about:
     what it is about (a threat or violence). {protector} and {protectorId}
     are that person; the engine runs the effects once for each protector,
     with the template that suits them. */
  {
    effect: "{npc} tells {protector} that {player} has been leaning on them, and {protector} goes cold on {player}.",
    kind: "report",
    to: "family",
    about: ["threat"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -10, t: -10 }, text: "{npc} says {playerName} has been leaning on them.", secondhand: true }
    ],
    public: false
  },
  {
    effect: "{npc} goes to {protector} and says {player} has been leaning on them, and {protector} writes it down.",
    kind: "report",
    to: "police",
    about: ["threat"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -5, t: -10 }, text: "{npc} came to me saying {playerName} has been leaning on them.", secondhand: true }
    ],
    public: false
  },
  {
    effect: "{npc} tells {protector} that {player} put hands on them, and {protector} goes cold on {player}.",
    kind: "report",
    to: "family",
    about: ["violence"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -10, t: -10 }, text: "{npc} says {playerName} put hands on them.", secondhand: true }
    ],
    public: false
  },
  {
    effect: "{npc} goes to {protector} about {player} putting hands on them, and {protector} writes it down.",
    kind: "report",
    to: "police",
    about: ["violence"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -5, t: -10 }, text: "{npc} came to me saying {playerName} put hands on them.", secondhand: true }
    ],
    public: false
  },
  /* Wave 28: a parent or grandparent telling the police that the player came
     on to their child (World.minorAdvance), and someone telling whoever looks
     out for them that the player tried to force them (World.coercion). */
  {
    effect: "{npc} goes to {protector} about {player} coming on to their child, and {protector} writes it down.",
    kind: "report",
    to: "police",
    about: ["advance"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -5, t: -10 }, text: "{npc} came to me about {playerName} coming on to their child.", weight: 3, secondhand: true }
    ],
    public: false
  },
  {
    effect: "{npc} goes to {protector} and says {player} tried to force them, and {protector} writes it down.",
    kind: "report",
    to: "police",
    about: ["coercion"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -5, t: -10 }, text: "{npc} says {playerName} tried to force them.", weight: 3, secondhand: true }
    ],
    public: false
  },
  {
    effect: "{npc} tells {protector} that {player} tried to force them, and {protector} goes cold on {player}.",
    kind: "report",
    to: "family",
    about: ["coercion"],
    dayOffset: [1, 2],
    effects: [
      { op: "socialEvent", npcId: "{protectorId}", event: "crossed", d: { w: -10, t: -10 }, text: "{npc} says {playerName} tried to force them.", weight: 3, secondhand: true }
    ],
    public: false
  },
  /* Wave 29: what someone does with what they hold over the player
     (World.plantHolders, each on a draw of its own, once a record). tell,
     at liking -60 or less: they tell it to whoever it matters to (the
     record spent; told_anyway for each of them). price, a mercenary holder
     at liking 10 or less: a blackmail of {price} ($50 a weight), due in two
     days, on the record ({leverageId}): paid, they keep quiet; missed, they
     tell. */
  {
    effect: "{npc} has told what they know about {player} to the people it matters to.",
    kind: "tell",
    dayOffset: [1, 3],
    effects: [
      { op: "leverageSet", id: "{leverageId}", status: "spent", knownBy: "mattersTo", tell: true }
    ],
    public: false
  },
  {
    effect: "{npc} gets {player} alone and names a price for keeping quiet about what they saw: {price}, by the day after tomorrow.",
    kind: "price",
    dayOffset: [1, 2],
    effects: [
      { op: "addObligation", kind: "blackmail", npcId: "{npcId}", amount: "{amount}", dueOffset: 2, leverageId: "{leverageId}", text: "Pay {npc} {price} to keep quiet.",
        missText: "{npc} did not get the {price} and has told what they saw.",
        onMet: [{ op: "socialEvent", npcId: "{npcId}", event: "paid_silence", text: "{playerName} paid me {price} to keep quiet.", weight: 2 }],
        onMiss: [{ op: "socialEvent", npcId: "{npcId}", event: "broke_word", d: { w: -10 }, text: "{playerName} would not pay, so I told what I saw.", weight: 2, act: "own" }] }
    ],
    public: false
  }
];

// ===== FAVOUR_TEMPLATES =====
// What someone who likes the player does for them; the same fields as the
// grudges. A favour is private unless it says otherwise.
const FAVOUR_TEMPLATES = [
  {
    effect: "{npc} finds {player} and says quietly that the police have been asking about them, and which officer.",
    dayOffset: [2, 3],
    effects: [
      { op: "addNews", text: "{npc} warned {playerName} that the police have been asking about them.", public: false }
    ],
    public: false,
    notForTags: ["police"]
  },
  {
    effect: "{npc} sells {player} what they need at cost and tells them to keep quiet about the price.",
    dayOffset: [2, 4],
    effects: [
      { op: "playerPrice", factor: 0.8, days: 3 }
    ],
    public: false,
    forTags: ["merchant", "shopkeeper", "bartender", "cashier", "manager", "fence"]
  },
  {
    effect: "{npc} tells {player} the name of somebody in town who can help with what {player} came here to do, and where to find them.",
    dayOffset: [3, 5],
    effects: [
      { op: "addMemory", npcId: "{npcId}", text: "Pointed {playerName} toward somebody in town who could help them.", weight: 1, act: "own" }
    ],
    public: false
  },
  {
    effect: "{npc} finds {player} a day of cash work hauling and cleaning, and pays a hundred dollars at the end of it, no questions asked.",
    dayOffset: [2, 4],
    effects: [
      { op: "playerGold", delta: 100 }
    ],
    public: false,
    forTags: ["merchant", "shopkeeper", "bartender", "mechanic", "farmer", "landowner", "foreman", "boatman", "manager", "owner", "outboard"],
    notForTags: ["teen"]
  },
  {
    effect: "{npc} pulls out a phone and shows {player} a photo of someone who has wronged {player}, taken somewhere that person should not have been.",
    dayOffset: [3, 5],
    effects: [
      { op: "addNews", text: "{npc} showed {playerName} a photo worth remembering.", public: false }
    ],
    public: false,
    forTags: ["informant", "teen", "gossip", "clerk"],
    // Wave 28: a favour that has to be believed needs trust (Rel.meets; World.templateFits).
    needs: { trust: 30 }
  },
  {
    effect: "{npc} gives {player} an alibi for the whole night and makes it stick with the police.",
    dayOffset: [2, 5],
    effects: [
      { op: "addMemory", npcId: "npc_marcus", text: "{npc} vouched for {playerName} and said they were together all night.", weight: 2 },
      { op: "attitudeDelta", npcId: "npc_marcus", delta: 5 }
    ],
    public: false,
    notForTags: ["police", "teen"],
    needs: { trust: 40 }
  },
  {
    effect: "{npc} warns {player} quietly not to be at the ramp after dark tonight, and will not say why.",
    dayOffset: [2, 4],
    effects: [
      { op: "addNews", text: "{npc} warned {playerName} to stay away from the ramp after dark.", public: false }
    ],
    public: false,
    forTags: ["smuggler", "boatman", "informant", "police", "lookout", "shopkeeper"],
    needs: { trust: 30 }
  },
  {
    effect: "{npc} gives {player} a hot meal and a couch for the night and will not take a dollar for it.",
    dayOffset: [2, 3],
    effects: [
      { op: "playerHp", delta: 2 }
    ],
    public: false,
    notForTags: ["teen", "stranger"]
  },
  {
    effect: "{npc} tells {player} about something going on in town that no grown-up has noticed, and swears it is true.",
    dayOffset: [2, 4],
    effects: [
      { op: "addNews", text: "{npc} told {playerName} something no grown-up in town has noticed.", public: false }
    ],
    public: false,
    forTags: ["teen"]
  },
  {
    effect: "{npc} lets {player} off with a warning they did not earn, and makes sure the rest of the department hears {player} is all right.",
    dayOffset: [2, 4],
    effects: [
      { op: "attitudeDelta", npcId: "npc_marcus", delta: 5 },
      { op: "attitudeDelta", npcId: "npc_nikki", delta: 5 },
      { op: "attitudeDelta", npcId: "npc_travis", delta: 5 }
    ],
    public: false,
    forTags: ["police", "dispatcher"]
  },
  {
    effect: "{npc} tells {player} a story about the river from before {player} was born that turns out to bear on what {player} is after.",
    dayOffset: [3, 5],
    effects: [
      { op: "addMemory", npcId: "{npcId}", text: "Told {playerName} the old story about the river, the true one.", weight: 1, act: "own" }
    ],
    public: false,
    forTags: ["elderly", "oldtimer", "records"]
  },
  {
    effect: "{npc} puts in a good word for {player} with Loretta Gaddis, and the next beer at the Low Water is on the house.",
    dayOffset: [2, 4],
    effects: [
      { op: "attitudeDelta", npcId: "npc_loretta", delta: 10 }
    ],
    public: false,
    notForTags: ["bartender", "teen"]
  },
  /* Wave 29: someone the player owes a favour asks for it back
     (World.owedAsk: after five days unpaid, again three days later; never
     an ordinary favour), by their tags, else the plain one. */
  {
    effect: "{npc} needs a hand pulling an engine Saturday and asks {player} to come by, since {player} owes them one.",
    kind: "ask",
    dayOffset: [1, 1],
    effects: [
      { op: "addMemory", npcId: "{npcId}", text: "Asked {playerName} for a hand with an engine, the favour owed me.", weight: 1, act: "own" }
    ],
    public: false,
    forTags: ["mechanic", "outboard"]
  },
  {
    effect: "{npc} needs the Friday delivery carried in and asks {player} to do it, since {player} owes them one.",
    kind: "ask",
    dayOffset: [1, 1],
    effects: [
      { op: "addMemory", npcId: "{npcId}", text: "Asked {playerName} to carry in the Friday delivery, the favour owed me.", weight: 1, act: "own" }
    ],
    public: false,
    forTags: ["bartender", "shopkeeper", "merchant", "cashier"]
  },
  {
    effect: "{npc} reminds {player}, plainly, of the favour {player} owes them, and asks for a hand with something this week.",
    kind: "ask",
    dayOffset: [1, 1],
    effects: [
      { op: "addMemory", npcId: "{npcId}", text: "Asked {playerName} for the favour owed me.", weight: 1, act: "own" }
    ],
    public: false,
    notForTags: ["mechanic", "outboard", "bartender", "shopkeeper", "merchant", "cashier", "teen"]
  }
];

// ===== GOAL_PRESETS =====
// One-line goals the character creation form offers as suggestions, each
// tied to one of the town's threads.
const GOAL_PRESETS = [
  "Find out who sold Amber Lott the pills that killed her.",
  "Prove the bridge report was bought before the council votes.",
  "Make enough cash on the river to leave clean.",
  "Keep the town's police from being shut down.",
  "Help Miss Vada keep the bottomland out of her son's hands.",
  "Find a place in Lockett's Ferry where nobody asks about the past."
];

if (typeof module !== 'undefined') { module.exports = { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES, GOAL_PRESETS }; }
// ===== END CONTENT =====
