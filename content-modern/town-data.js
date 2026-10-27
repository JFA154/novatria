// ===== Content: Lockett's Ferry (present day) =====
// Authored town data for the one-town RPG, modern setting. Plain browser
// script: no imports, no module syntax. Pasted verbatim into index.html.
// Validate with:
//   node content-modern/validate.cjs

// ===== TOWN_DATA =====
const TOWN_DATA = {
  name: "Lockett's Ferry",
  setting: "Lockett's Ferry is a river town of about eight hundred people where the state highway drops off the bluff and crosses the Lusk River on a narrow green steel bridge built in 1938. The state line runs down the middle of the river, the county on the far side is dry and taxes cigarettes hard, and for as long as anyone can remember, cartons and cases have gone across at night, by johnboat from Purvis Landing or in pickups light enough for the bridge's five-ton limit. Now the state has rated the bridge critical and will pay for one new crossing, either here or five miles downstream on Sturdivant land, and the town council votes on the site this month. Carter Sturdivant wants it downstream, the Night Run wants the old bridge open and the river dark, and the three-officer police department needs an arrest big enough to stop the mayor disbanding it. Cell signal is patchy in the valley, one bar if you stand by the water tower on the hill, so business here is done face to face: at the bar, at the pumps, at the ramp. People tell stories about what the river takes, but nobody you would believe has ever seen anything in it but mud and catfish.",
  currency: { symbol: "$", name: "dollars" },
  startLocationIds: { gate: "loc_pittmans", docks: "loc_purvis_landing" },

  locations: [
    {
      id: "loc_pittmans",
      name: "Pittman's Gas and Service",
      type: "gas",
      description: "Four pumps under a buzzing canopy where the state highway meets the river road, with a bus-stop sign bolted to the ice machine and a hand-lettered board out front that reads CRICKETS, NIGHT CRAWLERS, CARTONS. Out back, two open service bays smell of hot oil and tire rubber, and a radio plays gospel to whatever truck is up on the lift.",
      exits: ["loc_motor_court", "loc_town_hall", "loc_byrds_pawn", "loc_sturdivant_house"],
      npcIdsBySchedule: {
        morning: ["npc_royce", "npc_dewayne"],
        afternoon: ["npc_dewayne"],
        evening: ["npc_royce", "npc_marcus", "npc_travis"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_low_water",
      name: "The Low Water",
      type: "bar",
      description: "A cinderblock bar on Front Street with neon beer signs in the window, a pool table with a slow lean and a flood line drawn in marker beside the door. On weekends the gravel lot fills with car tags from the dry county, and the kitchen hatch at the back sends out catfish baskets and the smell of old fryer grease.",
      exits: ["loc_motor_court", "loc_town_hall", "loc_byrds_pawn", "loc_riverside_church", "loc_old_bridge", "loc_purvis_landing"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: ["npc_loretta", "npc_royce", "npc_tammy"],
        evening: ["npc_loretta", "npc_carter", "npc_wade", "npc_tammy"],
        night: ["npc_loretta"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_motor_court",
      name: "The Riverview Motor Court",
      type: "motel",
      description: "Twelve rooms in a single-story L around a cracked parking lot, under a sign that says VACANCY in every season and a name that promises a view you only get from behind the dumpster. The office smells of burnt coffee and air freshener, and a monitor on the counter shows the lot in four gray squares.",
      exits: ["loc_pittmans", "loc_low_water"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: ["npc_tyler"],
        night: ["npc_tyler", "npc_travis"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_riverside_church",
      name: "Riverside Baptist Church",
      type: "church",
      description: "A white clapboard church on the slope above Front Street, with a steeple that leans a little toward the river and a marquee sign out front that reads PRAY FOR OUR BRIDGE. Inside, the pews smell of lemon polish and old hymnals, and the fellowship hall out back keeps a coffee urn and a box of donated coats going all week.",
      exits: ["loc_low_water", "loc_riverbend", "loc_sturdivant_house"],
      npcIdsBySchedule: {
        morning: ["npc_ray"],
        afternoon: ["npc_vada", "npc_june"],
        evening: ["npc_ray", "npc_jolene"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_town_hall",
      name: "Town Hall",
      type: "police",
      description: "A two-story brick building with the mayor's office upstairs and the police department downstairs, one patrol car out front and a second up on blocks behind it. The station is a front counter, three desks and a single holding cell, and the window unit drips onto a box of unpaid parking tickets.",
      exits: ["loc_pittmans", "loc_byrds_pawn", "loc_low_water", "loc_old_bridge"],
      npcIdsBySchedule: {
        morning: ["npc_carter", "npc_jolene", "npc_marcus", "npc_travis"],
        afternoon: ["npc_jolene"],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_byrds_pawn",
      name: "Byrd's Pawn",
      type: "pawn",
      description: "A narrow storefront between two empty ones, its window crowded with chainsaws, guitars and fishing reels behind a security grille that never goes all the way up. Inside it smells of gun oil and stale smoke, and a glass counter of rings and phones sits under a hand-lettered sign that says NO REFUNDS NO STORIES.",
      exits: ["loc_pittmans", "loc_town_hall", "loc_low_water"],
      npcIdsBySchedule: {
        morning: ["npc_hollis"],
        afternoon: ["npc_hollis"],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_riverbend",
      name: "Riverbend Trailer Park",
      type: "trailerpark",
      description: "Thirty-odd trailers on the low ground downstream of the landing, some with flower boxes and some with blue tarps on the roofs, strung along a gravel loop that floods to the axles every spring. Dogs bark on chains, a trampoline rusts in the middle of the loop, and a cross of plastic flowers is wired to the fence by the mailboxes.",
      exits: ["loc_purvis_landing", "loc_riverside_church"],
      npcIdsBySchedule: {
        morning: ["npc_june", "npc_tammy"],
        afternoon: ["npc_colt", "npc_ray", "npc_tyler"],
        evening: ["npc_june"],
        night: ["npc_june", "npc_tammy"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_purvis_landing",
      name: "Purvis Landing",
      type: "marina",
      description: "A bait shop on stilts, a fuel pump and a floating dock of aluminum johnboats and bass boats, beside the concrete public ramp where the river road runs straight down into the water. At night the dock lights stay off, and every morning the mud at the foot of the ramp is cut with fresh trailer tracks.",
      exits: ["loc_low_water", "loc_old_bridge", "loc_riverbend"],
      npcIdsBySchedule: {
        morning: ["npc_wade"],
        afternoon: ["npc_wade"],
        evening: ["npc_colt", "npc_dewayne"],
        night: ["npc_hollis", "npc_wade"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_sturdivant_house",
      name: "Sturdivant House",
      type: "bighouse",
      description: "A white two-story house with eight columns on the hill above town, its lawn mowed in stripes and its paint peeling on the side nobody sees from the road. At the end of the drive by the water tower you can get the town's one bar of cell signal, and there is usually a truck parked there with someone holding a phone up to the sky.",
      exits: ["loc_pittmans", "loc_riverside_church"],
      npcIdsBySchedule: {
        morning: ["npc_vada"],
        afternoon: [],
        evening: ["npc_vada"],
        night: ["npc_vada", "npc_carter"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_old_bridge",
      name: "The Old Bridge",
      type: "bridge",
      description: "A narrow green steel truss from 1938, two lanes and no shoulder, posted at five tons and rattling under every pickup that crosses toward the dry county. Halfway over, a sign on the rail marks the state line, and fishermen leave cut bait and beer cans on the concrete pier below the first span.",
      exits: ["loc_town_hall", "loc_low_water", "loc_purvis_landing"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: ["npc_carter", "npc_marcus"],
        evening: [],
        night: ["npc_colt"]
      },
      discovered: true,
      closed: false
    }
  ],

  npcs: [
    {
      id: "npc_loretta",
      name: "Loretta Gaddis",
      role: "owner and bartender of the Low Water",
      factionId: null,
      tags: ["bartender"],
      look: "Rail-thin woman of sixty with frosted hair, reading glasses on a beaded chain and a bar towel over one shoulder.",
      voice: "Flat and unhurried; calls everybody 'hon', answers a question she doesn't like by asking what you're drinking, and never says a name out loud if she can point instead.",
      personality: ["unflappable", "loyal"],
      goal: "Keep the old bridge open, because half her trade drives over from the dry county and none of it will drive the long way round.",
      secret: "She has been seeing Royce Pittman on Tuesday afternoons for eleven years, and she is the reason he has not promised his vote to Carter Sturdivant.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_royce",
      name: "Royce Pittman",
      role: "owner of Pittman's Gas and Service and the swing vote on the town council",
      factionId: null,
      tags: ["council", "merchant"],
      look: "Big, soft-bellied man in his fifties in a feed-store cap and a short-sleeved dress shirt, with a pen behind each ear.",
      voice: "Folksy and slippery; tells a story about his daddy instead of answering, says 'now, I'm not saying' right before he says it, and laughs to fill any silence.",
      personality: ["genial", "cowardly"],
      goal: "Get out from under the note on his station without having to pick a side where anybody can see him do it.",
      secret: "Carter Sturdivant holds the note on the station and has offered to tear it up and give him the truck stop lease at the new interchange in return for a yes vote.",
      attitude: 10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_vada",
      name: "Vada Sturdivant",
      role: "widow who owns Sturdivant House and the bottomland downstream",
      factionId: null,
      tags: ["owner", "landowner"],
      look: "Small, straight-backed woman of eighty in a cardigan and pearls, with garden dirt under her nails and a cane she points with more than she leans on.",
      voice: "Crisp and formal, with an old schoolteacher's diction; calls grown men 'son', corrects your grammar mid-sentence, and answers questions about money by asking who your people are.",
      personality: ["imperious", "sentimental"],
      goal: "Keep the old bridge her father fought the state for in 1938, and keep the bottomland out of Carter's hands while she is alive.",
      secret: "The Sturdivant money started with her father running whiskey into the dry county, and Wade Purvis still brings her an envelope every month, which is why the landing lease has never gone up.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_carter",
      name: "Carter Sturdivant",
      role: "head of Sturdivant Land and Timber, who holds half the town's paper",
      factionId: "fac_sturdivant",
      tags: ["lender", "landowner"],
      look: "Trim, tanned man of forty-five in a quarter-zip pullover and pressed khakis, turning a truck key fob over and over in his fingers.",
      voice: "Fast and friendly, like a salesman closing; uses your first name in every sentence, talks about 'the future of this town', and states every sum to the dollar.",
      personality: ["ambitious", "smooth"],
      goal: "Get the new bridge built downstream on Sturdivant bottomland, sell the state the right-of-way and own the truck stop at the new interchange.",
      secret: "He is two years behind on the family's timber loans, and he has asked a doctor in the city to find his mother Vada unfit so he can sign the bottomland over himself.",
      attitude: 10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_jolene",
      name: "Jolene Overstreet",
      role: "mayor and town clerk",
      factionId: "fac_sturdivant",
      tags: ["council", "mayor"],
      look: "Heavy-set woman in her fifties in a cardigan over a church T-shirt, with a lanyard of keys and a phone she keeps checking for a signal it never finds.",
      voice: "Brisk and procedural; cites ordinances by number, says 'that's a council matter' to shut a subject, and drops to a whisper to say anything kind.",
      personality: ["officious", "frightened"],
      goal: "Get the downstream bridge approved and the police department dissolved before the town's money runs out in January.",
      secret: "Carter Sturdivant pays her five hundred dollars a month in cash, handed over in the motel parking lot, and she used the first year of it to cover money missing from the water fund.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_hollis",
      name: "Hollis Byrd",
      role: "owner of Byrd's Pawn",
      factionId: "fac_nightrun",
      tags: ["fence", "merchant"],
      look: "Stooped, pot-bellied man of sixty-five in suspenders and a fishing vest, with a jeweler's loupe on a cord and a toothpick that never leaves his mouth.",
      voice: "Slow and sideways, never a straight yes or no; calls everything 'merchandise', prices things before you ask, and says 'I don't ask where, I ask how much.'",
      personality: ["sociable", "greedy"],
      goal: "Sell the shop and retire to the coast before the bridge closes and the building is worth nothing.",
      secret: "He runs the Night Run's cash through his books as pawn sales, and the catalytic converters stacked behind the shop came off cars in three counties.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_wade",
      name: "Wade Purvis",
      role: "owner of Purvis Landing and boss of the Night Run",
      factionId: "fac_nightrun",
      tags: ["boatman", "smuggler"],
      look: "Lean, sunburnt man in his fifties with a gray ponytail, a faded camouflage cap and the tip of one finger missing.",
      voice: "Quiet and dry; lets you talk yourself out, answers in river terms like stage, chop and slack water, and never says the word police, only 'the law'.",
      personality: ["patient", "ruthless"],
      goal: "Keep the old bridge open and the river unwatched after dark, and keep his nephew out of prison.",
      secret: "He knows Colt is selling pills on the side and has not stopped him, because Colt was there the night Wade beat a man half to death for cutting in on the run, and could send him to prison for it.",
      attitude: -10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_colt",
      name: "Colt Purvis",
      role: "deckhand on the Night Run",
      factionId: "fac_nightrun",
      tags: ["boatman", "smuggler", "dealer"],
      look: "Wiry kid of twenty-two in a sleeveless shirt and white rubber boots, with a fresh tattoo still peeling on his forearm.",
      voice: "Fast and jumpy; talks over you, calls men 'bro' and women 'ma'am', brags about money he doesn't have, and laughs at things that aren't funny.",
      personality: ["reckless", "boastful"],
      goal: "Make enough money to quit working for his uncle and buy a truck in his own name.",
      secret: "He sells pain pills bought across the river to people at Riverbend, and the bottle Amber Lott died with came from him.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_marcus",
      name: "Marcus Bell",
      role: "chief of police",
      factionId: "fac_police",
      tags: ["police", "watch", "chief"],
      look: "Tall, heavy-shouldered man of fifty in a pressed uniform shirt gone tight at the buttons, with a shaved head and a limp he hides badly.",
      voice: "Courteous and relentless; says 'sir' and 'ma'am', asks the same question three different ways, and writes your answers in a pocket notebook while you watch him do it.",
      personality: ["methodical", "stubborn"],
      goal: "Make a bust big enough to save his department before the council votes to dissolve it, and prove the bridge report was bought.",
      secret: "He has known for months that Travis Cagle takes Night Run money and has let it go on, because he needs Travis on the payroll until the vote and on the witness stand after it.",
      attitude: -5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_travis",
      name: "Travis Cagle",
      role: "night-shift police officer",
      factionId: "fac_police",
      tags: ["police", "watch"],
      look: "Thick-necked man of twenty-eight in a uniform with the sleeves rolled, a dip of tobacco in his lip and a new watch too nice for his pay.",
      voice: "Loud and buddy-buddy, all 'my man' and 'hoss'; talks about his boat, laughs before his own punchlines, and goes quiet the second anyone mentions money.",
      personality: ["vain", "jumpy"],
      goal: "Keep taking Wade Purvis's money until his boat is paid off, then get on with the county before anyone looks closely.",
      secret: "Wade Purvis pays him three hundred dollars a week to park at the motel during the runs, and he keeps Wade's texts on a second phone in case he ever needs to trade them.",
      attitude: 10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_ray",
      name: "Ray Dees",
      role: "pastor of Riverside Baptist Church",
      factionId: null,
      tags: ["priest", "pastor"],
      look: "Round-faced man of sixty-five in a short-sleeved white shirt and clip-on tie, with a hearing aid and a pocket full of peppermints.",
      voice: "Slow and warm, with a preacher's rhythm even at the gas pump; answers a hard question with a Bible story and somehow gets the answer out of you instead.",
      personality: ["kind", "nosy"],
      goal: "Keep the Riverbend families housed and fed through the winter, and bury no more young people this year.",
      secret: "The church's new roof was paid for by an anonymous cash gift that he knows came from Wade Purvis, and he has preached against the Night Run every Sunday since without giving a dollar of it back.",
      attitude: 15,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_june",
      name: "June Satterfield",
      role: "retired nurse who patches people up at her kitchen table",
      factionId: null,
      tags: ["healer", "nurse"],
      look: "Stout woman of sixty in scrub pants and a sweatshirt from a hospital that closed, with her gray hair in a clip and a canvas bag that rattles.",
      voice: "Blunt and clinical; asks what you took and how much before she asks your name, swears mildly and constantly, and never tells anyone not to worry.",
      personality: ["unshockable", "tired"],
      goal: "Keep Riverbend's people out of an emergency room forty miles away, and get the pills off the lot without anyone she knows going to prison.",
      secret: "She has reversed four overdoses at Riverbend this fall without reporting one, and three of the four told her they bought from Colt Purvis.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_dewayne",
      name: "Dewayne Mangum",
      role: "mechanic in the service bays at Pittman's",
      factionId: null,
      tags: ["mechanic"],
      look: "Short, broad man of forty with grease worked into every knuckle, safety glasses pushed up on a bald head and a shop rag in his back pocket.",
      voice: "Few words, all of them about engines; says 'mm-hm' for yes and 'well' for no, and talks to the truck he's working on more than to you.",
      personality: ["careful", "honest"],
      goal: "Save enough to buy the empty garage on Front Street and stop working out of Royce Pittman's bays.",
      secret: "On the morning of the bridge inspection he towed the engineer's rental car out of a ditch and watched Carter Sturdivant drive the man off to lunch, though the report says he spent the whole day under the spans.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_tyler",
      name: "Tyler Rasberry",
      role: "night clerk at the Riverview Motor Court",
      factionId: null,
      tags: ["informant", "clerk"],
      look: "Gangly young man of nineteen with a patchy beard, a gaming headset round his neck and a phone with a cracked screen always in his hand.",
      voice: "Mumbles and deflects with internet jokes and never meets your eye, then turns precise the moment cash is on the counter: plates, times, room numbers.",
      personality: ["observant", "mercenary"],
      goal: "Save enough cash to leave Lockett's Ferry for good and never work another night shift.",
      secret: "The motel's parking-lot camera has caught Carter Sturdivant handing Jolene Overstreet an envelope every month since spring, and Tyler has copied the clips to a thumb drive he is trying to sell.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_tammy",
      name: "Tammy Lott",
      role: "cook at the Low Water",
      factionId: null,
      tags: ["cook"],
      look: "Hollow-eyed woman of forty-two in a hairnet and a stained Low Water T-shirt, with her daughter's name tattooed fresh on the inside of her wrist.",
      voice: "Hoarse and short; says exactly what she thinks in as few words as possible, swears at the grill, and goes very calm and polite when she is angriest.",
      personality: ["grieving", "relentless"],
      goal: "See whoever sold Amber the pills that killed her locked up or run out of town.",
      secret: "She took a tire iron to Colt Purvis's truck the week after the funeral, and Wade Purvis paid for the windshield himself and told her the next one would cost her more.",
      attitude: -5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    }
  ],

  factions: [
    {
      id: "fac_sturdivant",
      name: "Sturdivant Land and Timber",
      goal: "Get the old bridge closed and the new state bridge built five miles downstream on Sturdivant bottomland, then sell the state the right-of-way and put a truck stop at the new interchange.",
      methods: "Private loans and contracts for deed that can be called in on a week's notice, a mayor paid in cash, a bridge report bought from a consulting engineer, and a lawyer in the city.",
      clocks: [
        {
          label: "Buy the swing vote",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Royce Pittman votes with the mayor, the council backs the downstream bridge site three to two, and the state puts the old bridge on its closure list.",
            effects: [
              { op: "setFlag", key: "councilBackedDownstream", value: true },
              { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -15 },
              { op: "addRumour", rumour: {
                id: "rum_vote_downstream",
                text: "The council voted three to two for the downstream bridge, and Royce Pittman was the third vote.",
                true: true,
                sourceNpcId: "npc_loretta",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Pull the landing lease",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Carter Sturdivant refuses to renew the lease on Purvis Landing, a lawyer's notice goes up on the bait shop door, and Wade Purvis starts putting his boats in off the bank at Riverbend after dark.",
            effects: [
              { op: "npcMove", npcId: "npc_wade", locationId: "loc_riverbend", phases: ["night"] },
              { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -20 },
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
            ]
          }
        },
        {
          label: "Get the bridge posted closed",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "A state crew sets concrete barriers across both ends of the old bridge, and every trip to the dry county is now forty minutes round by the highway.",
            effects: [
              { op: "closeLocation", locationId: "loc_old_bridge" },
              { op: "priceMultiplier", factor: 1.15 },
              { op: "threadStatus", threadId: "thr_bridge_vote", status: "failed" },
              { op: "addRumour", rumour: {
                id: "rum_bridge_closed",
                text: "The state has put concrete barriers across the old bridge, and the drive to the dry county is forty minutes round by the highway now.",
                true: true,
                sourceNpcId: "npc_royce",
                heard: false
              } }
            ]
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
      methods: "Traffic stops at the bridge approach, a motel clerk paid twenty dollars a tip, sitting dark above the boat ramp, and leaning on anyone with an open warrant.",
      clocks: [
        {
          label: "Catch a boat at the ramp",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Chief Bell catches Colt Purvis at the foot of the ramp at three in the morning with a johnboat full of cartons and a pocket full of pills, and the Night Run pulls its boats up on the bank.",
            effects: [
              { op: "npcStatus", npcId: "npc_colt", status: "arrested" },
              { op: "priceMultiplier", factor: 0.9 },
              { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -15 },
              { op: "addRumour", rumour: {
                id: "rum_colt_caught",
                text: "Chief Bell caught Colt Purvis at the ramp with a boat full of cartons and a pocket full of pills.",
                true: true,
                sourceNpcId: "npc_travis",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Flip the pawnbroker",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Chief Bell arrests Hollis Byrd over a stack of stolen catalytic converters behind the shop, and by morning Hollis is talking about whose cash goes through his books.",
            effects: [
              { op: "npcStatus", npcId: "npc_hollis", status: "arrested" },
              { op: "closeLocation", locationId: "loc_byrds_pawn" },
              { op: "plantSeed", seed: {
                id: "seed_hollis_deal",
                cause: "Hollis Byrd, in the holding cell, wants to trade what he knows about the Night Run's money before Wade Purvis hears he is talking.",
                effect: "From the holding cell, Hollis Byrd calls out to anyone who comes into the station that he will say where the Night Run keeps its cash if they get word to his daughter in the city first.",
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
            ]
          }
        },
        {
          label: "Prove the report was bought",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Chief Bell lays the motel camera footage and the engineer's lunch receipt in front of the council, and the state police take Jolene Overstreet out of Town Hall in handcuffs.",
            effects: [
              { op: "npcStatus", npcId: "npc_jolene", status: "arrested" },
              { op: "setFlag", key: "bridgeReportVoid", value: true },
              { op: "factionRelation", a: "fac_police", b: "fac_sturdivant", delta: -30 },
              { op: "addRumour", rumour: {
                id: "rum_mayor_arrested",
                text: "The state police walked Jolene Overstreet out of Town Hall in handcuffs, and it was over the bridge report.",
                true: true,
                sourceNpcId: "npc_ray",
                heard: false
              } }
            ]
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
          label: "Buy the night shift",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Travis Cagle stops patrolling after midnight altogether, the boats cross every night, and Wade Purvis is buying every carton and case Pittman's can order.",
            effects: [
              { op: "setFlag", key: "riverUnwatched", value: true },
              { op: "priceMultiplier", factor: 1.1 },
              { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -10 },
              { op: "addRumour", rumour: {
                id: "rum_night_shift_bought",
                text: "Nobody patrols after midnight any more, and Wade Purvis is buying every carton and case Pittman's can order.",
                true: true,
                sourceNpcId: "npc_dewayne",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Turn the swing vote",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Somebody leaves photographs of Royce Pittman and Loretta Gaddis on the seat of Royce's truck, and the next day he takes back his support for the downstream bridge and asks for a new vote.",
            effects: [
              { op: "setFlag", key: "royceWantsRevote", value: true },
              { op: "npcMove", npcId: "npc_royce", locationId: "loc_pittmans", phases: ["afternoon"] },
              { op: "factionRelation", a: "fac_sturdivant", b: "fac_nightrun", delta: -20 },
              { op: "addRumour", rumour: {
                id: "rum_royce_photos",
                text: "Somebody left photographs of Royce Pittman and Loretta Gaddis in his truck, and now he wants a new vote on the bridge.",
                true: true,
                sourceNpcId: "npc_tyler",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Get the chief out",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "After an anonymous call, the county sheriff finds three cartons and a bottle of pills under the seat of Chief Bell's truck, and the mayor suspends him and he leaves to stay with his sister in the city.",
            effects: [
              { op: "npcStatus", npcId: "npc_marcus", status: "gone" },
              { op: "factionRelation", a: "fac_police", b: "fac_nightrun", delta: -30 },
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
            ]
          }
        }
      ],
      activeClock: 0,
      relations: { fac_sturdivant: -50, fac_police: -60 }
    }
  ],

  threads: [
    {
      id: "thr_bridge_vote",
      title: "The bridge vote",
      summary: "The state has rated the old bridge critical and will pay for one new crossing, either in town or five miles downstream on Sturdivant bottomland. The council votes on the site this month, and Royce Pittman is the one vote nobody can count.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["fac_sturdivant", "fac_nightrun", "npc_carter", "npc_royce", "npc_vada", "loc_old_bridge"]
    },
    {
      id: "thr_police_vote",
      title: "Disbanding the police",
      summary: "Mayor Jolene Overstreet wants to dissolve the three-officer police department and pay the county sheriff to patrol the town instead. Chief Bell has until the budget meeting to show the council what his department is worth.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["fac_police", "fac_sturdivant", "npc_marcus", "npc_jolene", "loc_town_hall"]
    },
    {
      id: "thr_riverbend_pills",
      title: "Pills at Riverbend",
      summary: "Two people at Riverbend have overdosed on pain pills since August, and one of them, nineteen-year-old Amber Lott, died. The chief says the pills come across the river; her mother says everybody knows who sells them.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["npc_tammy", "npc_colt", "npc_june", "npc_marcus", "loc_riverbend"]
    }
  ],

  seeds: [
    {
      id: "seed_big_run",
      cause: "Wade Purvis has bought two hundred cartons and forty cases of liquor for the biggest run of the fall, and paid Travis Cagle to sit in the motel lot all night.",
      effect: "The Night Run took a full load across the river overnight; Chief Bell is down at Purvis Landing photographing fresh trailer tracks on the ramp, and Wade Purvis is watching him from the bait shop with a cup of coffee.",
      trigger: { type: "day", value: 3 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_lease_letter",
      cause: "Carter Sturdivant has had a lawyer in the city write to Wade Purvis that the Purvis Landing lease will not be renewed at the new year.",
      effect: "Wade Purvis read the lawyer's letter out loud at the Low Water last night and told Carter Sturdivant, in front of the whole bar, that the Sturdivants made their money on the same river.",
      trigger: { type: "day", value: 4 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_council_agenda",
      cause: "Jolene Overstreet has put the police budget on the next council agenda without telling Chief Bell.",
      effect: "A typed agenda taped to the Town Hall door lists the dissolution of the police department as item four, and Chief Bell has been seen standing in front of it with his notebook out.",
      trigger: { type: "day", value: 6 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_overdose",
      cause: "Colt Purvis has a new bottle of pills from across the river and is selling them at Riverbend for less than before.",
      effect: "June Satterfield brought a boy at Riverbend back from an overdose last night with the nasal spray she keeps in her purse and did not call it in; Tammy Lott is telling everyone at the Low Water that the pills were Colt Purvis's.",
      trigger: { type: "day", value: 7 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_engineer",
      cause: "The consulting engineer who wrote the bridge report has been asked to answer questions at the council meeting, and Carter Sturdivant does not want him answering any.",
      effect: "The engineer canceled his appearance at the council meeting by email, and Dewayne Mangum told the counter at Pittman's that he towed that man's rental car out of a ditch on the morning of the inspection.",
      trigger: { type: "day", value: 9 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_vada_doctor",
      cause: "Carter Sturdivant has asked a doctor in the city to find his mother unfit, so that he can sign the bottomland over to the state himself.",
      effect: "Carter brought a doctor up to Sturdivant House yesterday, and Vada Sturdivant threw them both out and drove herself to Riverside Baptist to ask Pastor Dees to witness a new will.",
      trigger: { type: "day", value: 11 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_tackle_box",
      cause: "Colt Purvis keeps his pills and his sales phone in a tackle box wedged on a girder under the first span of the old bridge, where his uncle never looks.",
      effect: "On a girder ledge under the first span, reachable from the riverbank, is a tackle box holding three pill bottles with a pharmacy label from across the river and a cheap prepaid phone full of texts from Riverbend numbers.",
      trigger: { type: "location", value: "loc_old_bridge" },
      fired: false,
      hidden: true
    }
  ],

  rumours: [
    { id: "rum_lunch_inspection", text: "The engineer who condemned the bridge spent inspection day eating catfish at the Low Water with Carter Sturdivant, not under the spans.", true: true, sourceNpcId: "npc_loretta", heard: false },
    { id: "rum_motel_envelope", text: "The mayor meets Carter Sturdivant in the motel parking lot once a month after dark, and she never goes inside.", true: true, sourceNpcId: "npc_tyler", heard: false },
    { id: "rum_travis_boat", text: "Travis Cagle paid cash for a new bass boat this summer, and nobody buys a boat like that on a night-shift salary.", true: true, sourceNpcId: "npc_dewayne", heard: false },
    { id: "rum_colt_pills", text: "The pills at Riverbend come from Colt Purvis, and his uncle Wade either does not know or does not want to.", true: true, sourceNpcId: "npc_tammy", heard: false },
    { id: "rum_royce_note", text: "Royce Pittman owes the Sturdivants on the station, which is why he still will not say how he will vote.", true: true, sourceNpcId: "npc_hollis", heard: false },
    { id: "rum_vada_wont_sign", text: "Miss Vada will not sign the bottomland over for the new bridge, and Carter cannot sell it without her.", true: true, sourceNpcId: "npc_ray", heard: false },
    { id: "rum_police_budget", text: "The mayor wants to get rid of the police and hand the town to the county sheriff before Christmas.", true: true, sourceNpcId: "npc_travis", heard: false },
    { id: "rum_seventh_year", text: "Something in the deep hole under the old bridge pulls a swimmer down every seven years, and this is the seventh year.", true: false, sourceNpcId: "npc_wade", heard: false },
    { id: "rum_loretta_sold", text: "Loretta Gaddis has already sold the Low Water to the Sturdivants and is only waiting for the bridge to close to tell anyone.", true: false, sourceNpcId: "npc_jolene", heard: false },
    { id: "rum_june_license", text: "June Satterfield lost her nursing license for stealing pills from the hospital, and that is where the Riverbend pills come from.", true: false, sourceNpcId: "npc_colt", heard: false }
  ]
};

// ===== TABLES =====
const TABLES = {
  npc: {
    firstNames: [
      "Ashley", "Bobby", "Brandi", "Clint", "Crystal", "Darrell", "Dakota", "Dusty", "Earl", "Faye",
      "Gary", "Heather", "Jamal", "Jesse", "Keisha", "Kenny", "Lacey", "Lonnie", "Mavis", "Misty",
      "Odell", "Patsy", "Randy", "Rhonda", "Shawn", "Terrell", "Trina", "Vernon", "Wanda", "Wesley"
    ],
    familyNames: [
      "Akins", "Bounds", "Boyette", "Cooley", "Crump", "Dukes", "Ezell", "Faulk", "Gandy", "Hux",
      "Ivey", "Jernigan", "Kimbrough", "Ladner", "Mabry", "McRae", "Moak", "Nettles", "Pace", "Raybon",
      "Sandifer", "Shows", "Spikes", "Sumrall", "Toler", "Tubb", "Varnado", "Walley", "Whitfield", "Yarbrough"
    ],
    occupations: [
      "long-haul trucker", "dollar store manager", "home health aide", "catfish farmer", "logger", "school bus driver", "lineman for the power co-op", "prison guard", "welder", "roofer",
      "crop duster", "hairdresser", "rural mail carrier", "deer processor", "bait shop clerk", "tow truck driver", "substitute teacher", "pharmacy tech", "oil change tech", "line cook",
      "part-time preacher", "barge deckhand", "game warden", "insurance agent", "feed store clerk", "nursing home aide", "used car salesman", "septic tank pumper", "church secretary", "night stocker"
    ],
    traits: [
      "suspicious", "chatty", "greedy", "churchgoing", "lazy", "nosy", "honest to a fault", "hot-tempered", "shy", "braggy",
      "kind", "bitter", "cheerful", "superstitious", "tight with money", "brave", "nervous", "proud", "sly", "gullible",
      "blunt", "patient", "vain", "loyal", "jealous", "careless", "worn out", "flirty", "stubborn", "always on the hustle"
    ],
    wants: [
      "to make the truck payment before the repo man comes back",
      "a ride to the hospital in the city",
      "news of a son who went to work offshore and stopped calling",
      "to get their name off a warrant in the next county",
      "to sell the family land before the bridge closes",
      "to keep the bridge open no matter what it costs",
      "a few hundred dollars by Friday",
      "to get custody of their kids back",
      "to quit pills for good this time",
      "to leave town and never come back",
      "a buyer for a ring they should not have",
      "to be left alone",
      "a boat motor that starts on the first pull",
      "to find out who their wife is texting",
      "work that pays in cash",
      "their dog back from whoever took it",
      "a place to stay that is not a car",
      "to be taken seriously for once",
      "someone to carry a package across the river",
      "to win the bass tournament in the spring"
    ],
    speechQuirks: [
      "says 'I tell you what' before every opinion",
      "calls everyone 'baby' or 'sugar'",
      "answers questions with questions",
      "checks their phone between sentences though it never has signal",
      "never finishes a sentence",
      "talks to their dog as much as to you",
      "quotes scripture, mostly wrong",
      "says 'no offense' right before the offense",
      "gets your name wrong every time",
      "talks like a TV lawyer when nervous",
      "uses fishing words for everything",
      "laughs nervously after every sentence",
      "lowers their voice for no reason",
      "quotes their late mama",
      "ends sentences with 'you know it'",
      "spits tobacco before saying anything important",
      "talks too loud from years around engines",
      "pauses a long time before answering",
      "uses long words, some of them wrong",
      "apologizes before disagreeing"
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
      "a child's drawing of the bridge taped to the door",
      "a security camera with its cable cut, still pointed at the door",
      "a pit bull mix that wants its ears scratched",
      "a radio tuned to the farm report",
      "a SAVE OUR BRIDGE sign in the window",
      "a pair of muddy boots left on the step",
      "a single path of mud tracked across the floor",
      "a jar by the register for a sick child's medical bills"
    ],
    problems: [
      "the roof leaks over the cash register",
      "the owner owes the Sturdivants more than the place is worth",
      "someone has been siphoning gas from the trucks at night",
      "a police officer comes by every evening for free food",
      "the well water has gone bad",
      "a tenant has not paid in two months",
      "someone stole the air conditioner off the back wall",
      "last spring's flood left the floor soft",
      "the two brothers who run it are not speaking",
      "the rent went up when the bridge vote was announced",
      "a kid is sick in the back room and nobody can pay the doctor",
      "the Night Run wants to use the back room",
      "something has died under the floor",
      "the cashier ran off with a week's takings",
      "the power gets cut off on Friday unless somebody pays"
    ]
  },
  items: {
    goods: [
      { name: "Pack of cigarettes", price: 9 },
      { name: "Carton of cigarettes", price: 72 },
      { name: "Fifth of bourbon", price: 28 },
      { name: "Case of beer", price: 26 },
      { name: "Bottle of beer at the Low Water", price: 4 },
      { name: "Shot of whiskey at the Low Water", price: 6 },
      { name: "Catfish basket at the Low Water", price: 13 },
      { name: "Cheeseburger and fries", price: 11 },
      { name: "Biscuit and coffee at Pittman's", price: 5 },
      { name: "Night at the Riverview Motor Court", price: 59 },
      { name: "Gallon of gas", price: 3 },
      { name: "Five-gallon can of outboard gas", price: 22 },
      { name: "Bag of ice", price: 3 },
      { name: "Energy drink", price: 4 },
      { name: "Prepaid phone", price: 45 },
      { name: "Phone charger", price: 12 },
      { name: "Thirty days of prepaid minutes", price: 35 },
      { name: "Flashlight", price: 15 },
      { name: "Pocketknife", price: 18 },
      { name: "Lighter", price: 2 },
      { name: "Deck of cards", price: 4 },
      { name: "Lottery scratch-off", price: 5 },
      { name: "Box of crickets", price: 4 },
      { name: "Dozen night crawlers", price: 5 },
      { name: "Rod and reel", price: 49 },
      { name: "Johnboat rented for a night", price: 60 },
      { name: "Outboard tune-up at Pittman's", price: 150 },
      { name: "Tire patched at Pittman's", price: 20 },
      { name: "Used tire", price: 45 },
      { name: "Tow to Pittman's", price: 90 },
      { name: "Crowbar", price: 18 },
      { name: "Bolt cutters", price: 35 },
      { name: "Roll of duct tape", price: 7 },
      { name: "Rain jacket", price: 35 },
      { name: "Work boots", price: 95 },
      { name: "Pawned wedding ring", price: 120 },
      { name: "Pawned guitar", price: 90 },
      { name: "Used shotgun at Byrd's", price: 240 },
      { name: "Naloxone nasal spray", price: 45 },
      { name: "First aid kit", price: 22 }
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
  complications: [
    "someone saw you",
    "someone filmed it on their phone",
    "a car pulls in",
    "it sets off an alarm",
    "a dog starts barking",
    "a motion light snaps on",
    "it breaks",
    "it costs more than you have on you",
    "it takes far longer than it should",
    "you drop something and it rolls out of reach",
    "a patrol car rolls past",
    "the person you need just drove off",
    "you get it, but you get hurt doing it",
    "someone recognizes you",
    "you leave something with your name on it behind",
    "someone who matters takes it personally",
    "it starts a rumor about you",
    "someone wants a favor for it",
    "you get the wrong one",
    "you owe someone for it now"
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
const BACKGROUNDS = [
  {
    id: "bg_veteran",
    name: "Veteran",
    blurb: "You did two tours overseas, came home to a town that had moved on without you, and have been drifting south on buses ever since.",
    stats: { might: 2, wits: 0, charm: 0, stealth: 1 },
    gold: 140,
    items: [
      { id: "item_folding_knife", name: "Folding knife", qty: 1, notes: "Kept sharp out of habit." },
      { id: "item_dog_tags", name: "Dog tags", qty: 1, notes: "Yours, and one from a friend who did not come home." }
    ],
    arrival: "gate"
  },
  {
    id: "bg_dropout",
    name: "Dropout",
    blurb: "You walked out of a welding apprenticeship and your uncle's house on the same night, and took his good tools with you.",
    stats: { might: 1, wits: 1, charm: -1, stealth: 2 },
    gold: 35,
    items: [
      { id: "item_socket_set", name: "Socket set", qty: 1, notes: "Your uncle's initials are engraved on the case." },
      { id: "item_gas_station_sandwich", name: "Gas station sandwich", qty: 2, notes: "Bought yesterday, two states back." }
    ],
    arrival: "docks"
  },
  {
    id: "bg_fired_bookkeeper",
    name: "Fired bookkeeper",
    blurb: "You kept the books for a car dealership until forty thousand dollars went missing and everyone looked at you.",
    stats: { might: -1, wits: 3, charm: 1, stealth: 0 },
    gold: 220,
    items: [
      { id: "item_thumb_drive", name: "Thumb drive", qty: 1, notes: "A copy of the dealership's real books, taken on your last day." },
      { id: "item_reference_letter", name: "Reference letter", qty: 1, notes: "On dealership letterhead, and you wrote it yourself." }
    ],
    arrival: "gate"
  },
  {
    id: "bg_river_deckhand",
    name: "River deckhand",
    blurb: "You worked towboats up and down the river for years and know every lock keeper and bait shop between here and the coast.",
    stats: { might: 1, wits: 1, charm: 1, stealth: 0 },
    gold: 320,
    items: [
      { id: "item_rain_gear", name: "Rain gear", qty: 1, notes: "Orange bibs and jacket, stiff with river mud." },
      { id: "item_carton_cigarettes", name: "Carton of cigarettes", qty: 2, notes: "Bought cheap on this side of the line, worth double across the river." }
    ],
    arrival: "docks"
  },
  {
    id: "bg_group_home_kid",
    name: "Group home kid",
    blurb: "You grew up in a church group home two counties over, on donated clothes, chores and Sunday services.",
    stats: { might: 0, wits: 1, charm: 1, stealth: 1 },
    gold: 45,
    items: [
      { id: "item_pocket_bible", name: "Pocket Bible", qty: 1, notes: "Your name is written inside the cover in a housemother's hand." },
      { id: "item_birth_certificate", name: "Birth certificate", qty: 1, notes: "The space for the father's name is blank." }
    ],
    arrival: "gate"
  },
  {
    id: "bg_poker_hustler",
    name: "Poker hustler",
    blurb: "You make your living in back-room card games, and two riverboat casinos downriver keep your photo behind the cashier's cage.",
    stats: { might: -1, wits: 1, charm: 1, stealth: 2 },
    gold: 380,
    items: [
      { id: "item_marked_deck", name: "Marked deck", qty: 1, notes: "Pricked on the backs where only your thumb can find it." },
      { id: "item_fake_license", name: "Fake driver's license", qty: 1, notes: "Good enough for a bartender, not for a cop." }
    ],
    arrival: "docks"
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
const LOOSE_ENDS = {
  debt: {
    label: "A debt",
    options: [
      "I owe a man in this town more money than I can pay.",
      "I took out a loan I couldn't cover, and the note was sold to someone here.",
      "I lost a bet I couldn't cover and swore I'd pay by the end of the month."
    ],
    link: { tag: "lender" },
    newNpc: {
      role: "debt collector",
      look: "Heavy man in a golf shirt and wraparound sunglasses, with a clipboard and a company truck he never turns off.",
      voice: "Polite and slow, calls you 'friend', and mentions the late fees in every other sentence.",
      personality: ["patient", "merciless"],
      goal: "Collect what the newcomer owes, with fees, before the end of the month.",
      secret: "He bought the debt for a fraction of its value and would settle for half if pressed."
    },
    seed: {
      dayOffset: [3, 5],
      effect: "{npc} slides into the booth across from {player} uninvited, sets down a folded printout with {player}'s name on it, and says the money is due in three days.",
      trigger: "day"
    }
  },
  enemy: {
    label: "An enemy",
    options: [
      "Someone I wronged has followed me here.",
      "A man I testified against is out on parole and wants me found.",
      "I humiliated someone in public, and they swore I would pay for it."
    ],
    link: null,
    newNpc: {
      role: "old enemy",
      look: "Big, quiet man in a pressed denim shirt, with a healed scar through one eyebrow and knuckles like walnuts.",
      voice: "Says very little, all of it polite, and always uses your full name.",
      personality: ["patient", "vindictive"],
      goal: "Settle an old score with the newcomer, quietly and for good.",
      secret: "He has already spent the money he was paid to find the newcomer, so he cannot go home until it is done."
    },
    seed: {
      dayOffset: [4, 7],
      effect: "{npc} takes a room at the Riverview Motor Court, shows the night clerk a photo of {player}, and asks where {player} has been sleeping.",
      trigger: "day"
    }
  },
  secret: {
    label: "A secret",
    options: [
      "Someone here knows what I did before I came.",
      "I am going by a name that isn't mine.",
      "I am carrying something stolen, and its owner wants it back."
    ],
    link: { tag: "informant" },
    newNpc: {
      role: "small-town gossip",
      look: "Wiry woman in a hairdresser's smock, with a vape pen in one hand and two phones in the other.",
      voice: "Sweet and sticky; calls you 'sugar' and asks three personal questions for every one you answer.",
      personality: ["nosy", "greedy"],
      goal: "Turn what she knows into cash before someone else does.",
      secret: "She has already sold the same secret to someone else."
    },
    seed: {
      dayOffset: [3, 6],
      effect: "{npc} catches {player} alone, repeats one true detail of {player}'s secret, and names a price in cash for keeping it quiet.",
      trigger: "day"
    }
  },
  lost: {
    label: "Someone lost",
    options: [
      "I'm looking for my brother, who came here last year and stopped answering his phone.",
      "I want to know who left me at a church group home, and why.",
      "My best friend took a job on a towboat out of this town and never came home."
    ],
    link: { tag: "priest" },
    newNpc: {
      role: "church secretary",
      look: "Plump, short-sighted woman in a holiday sweater, with a lanyard of keys and a stack of Sunday bulletins.",
      voice: "Chirpy and thorough; reads records aloud in full, including the parts you didn't ask for, and says 'bless you' when she means 'go away'.",
      personality: ["fussy", "kind"],
      goal: "Keep the church records straight and match every lost name to a living one.",
      secret: "She has let people pay to have entries in the baptism and membership records changed."
    },
    seed: {
      dayOffset: [4, 8],
      effect: "{npc} leaves word at the Low Water that the church records hold a name {player} will want to see, and asks {player} to come by Riverside Baptist after Wednesday supper.",
      trigger: "day"
    }
  },
  promise: {
    label: "A promise",
    options: [
      "I promised a dying man I'd deliver his letter to someone here.",
      "I swore I'd pay back the family who took me in when I had nowhere to go.",
      "I promised a woman I'd bring her daughter home from this town."
    ],
    link: { tag: "bartender" },
    newNpc: {
      role: "night bartender",
      look: "Gaunt man of seventy in a pearl-snap shirt, with an oxygen tube over his ears and a ledger of tabs on the bar.",
      voice: "Gloomy and courteous; expects the worst of everyone and thanks you for proving him right.",
      personality: ["gloomy", "honest"],
      goal: "Keep his regulars paid up and out of trouble.",
      secret: "He reads every letter and package left in his care before he hands it over."
    },
    seed: {
      dayOffset: [2, 4],
      effect: "{npc} hands {player} an envelope a trucker left behind the bar, unsigned, that says only: you gave your word, and the time to keep it is now.",
      trigger: "day"
    }
  }
};

// ===== GRUDGE_TEMPLATES =====
const GRUDGE_TEMPLATES = [
  { effect: "{npc} calls the police and says {player} was seen near a break-in, and an officer starts pulling {player} aside to ask where they were.", dayOffset: [2, 4] },
  { effect: "{npc} drives up to the water tower for signal and posts about {player} on the county community page, and by morning half the town has read it.", dayOffset: [2, 3] },
  { effect: "{npc} pays a couple of kids from Riverbend to slash the tires on whatever {player} has been riding in and leave a note under the wiper.", dayOffset: [2, 4] },
  { effect: "{npc} tells the counter at Pittman's that {player} is a thief, and every register in town starts charging {player} more and watching their hands.", dayOffset: [2, 3] },
  { effect: "{npc} gets {player}'s name added to the list by the register of people the Low Water will not serve.", dayOffset: [2, 3] },
  { effect: "{npc} pays two men to catch {player} alone after dark behind the Low Water and give them a beating as a warning.", dayOffset: [3, 5] },
  { effect: "{npc} finds out where {player} is sleeping and has their things gone through while they are out.", dayOffset: [3, 5] },
  { effect: "{npc} tells the Night Run that {player} has been talking to the police, and nobody at the ramp will look at {player} after that.", dayOffset: [2, 5] }
];

// ===== FAVOUR_TEMPLATES =====
const FAVOUR_TEMPLATES = [
  { effect: "{npc} drives up to the water tower for signal and texts {player} that the police have been asking about them, and which officer.", dayOffset: [2, 3] },
  { effect: "{npc} sells {player} what they need at cost and tells them to keep quiet about the price.", dayOffset: [2, 4] },
  { effect: "{npc} gives {player} the real name and phone number of someone who can help with what {player} came here to do.", dayOffset: [3, 5] },
  { effect: "{npc} leaves word for {player} at the Low Water about a day of cash work that pays a hundred dollars and asks no questions.", dayOffset: [2, 4] },
  { effect: "{npc} shows {player} a photo on their phone of someone who has wronged {player}, taken somewhere that person should not have been.", dayOffset: [3, 5] },
  { effect: "{npc} tells the police {player} was with them all night, and makes it stick.", dayOffset: [2, 5] },
  { effect: "{npc} warns {player} quietly not to be at the ramp after dark tonight, and will not say why.", dayOffset: [2, 4] },
  { effect: "{npc} gives {player} a hot meal and a couch for the night and will not take a dollar for it.", dayOffset: [2, 3] }
];

if (typeof module !== 'undefined') { module.exports = { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES }; }
