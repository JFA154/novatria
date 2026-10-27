// ===== Content: Ommelveer =====
// Authored town data for the one-town RPG. Plain browser script: no imports,
// no module syntax. Pasted verbatim into index.html. Validate with:
//   node content/validate.cjs

// ===== TOWN_DATA =====
const TOWN_DATA = {
  name: "Ommelveer",
  setting: "Ommelveer is a brick-and-timber town of about eight hundred people on the north bank of the Ommel, a slow brown river too wide to bridge cheaply and too deep to ford. It lives off the crossing: the flat ferry on its rope, the barges that tie up for the night, and the Weigh House on Scale Square, where every sack and salt cone that changes hands is weighed and taxed. The old stone bridge went down in a flood eleven years ago and took the old Jonker with it; its stumps still stand in the river below the town. Now the Weigh House Guild wants a new toll bridge, the ferrymen who run untaxed salt across after dark mean to stop it, and the underpaid town watch is trying to catch both. People say the healer has a touch and the river keeps its own dead, but nobody you could name has ever seen real magic.",
  startLocationIds: { gate: "loc_land_gate", docks: "loc_ferry_quay" },

  locations: [
    {
      id: "loc_land_gate",
      name: "The Land Gate",
      type: "road",
      description: "The north road comes in through a squat brick gatehouse, one leaf of its gate long off its hinges and propped against the wall. Carters wait in the mud while a watchman pokes their loads with a pole, and behind them the road runs away between flat, wet fields and peat cuttings.",
      exits: ["loc_scale_square", "loc_holtrop_forge"],
      npcIdsBySchedule: {
        morning: ["npc_durk"],
        afternoon: ["npc_durk"],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_scale_square",
      name: "Scale Square",
      type: "market",
      description: "A cobbled square sloping toward the river, ringed with stalls under patched awnings and overlooked by the Weigh House, whose great iron scale hangs from a beam above its open doors. It smells of fish, wet wool and the tar the stallholders paint on their awning poles.",
      exits: ["loc_land_gate", "loc_holtrop_forge", "loc_split_oar", "loc_st_wybrens", "loc_sjaarda_house", "loc_watch_house"],
      npcIdsBySchedule: {
        morning: ["npc_geeske", "npc_hiske", "npc_gerben", "npc_anke"],
        afternoon: ["npc_marrit", "npc_lolke", "npc_wobbe", "npc_anke"],
        evening: [],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_split_oar",
      name: "The Split Oar",
      type: "tavern",
      description: "A low taproom with a sagging ceiling, a peat fire that smokes whenever the wind comes off the river, and a broken ferry oar nailed above the bar. Bargemen drink at the long table by the door, and anyone with private business takes a booth at the back, where it is too dark to see faces.",
      exits: ["loc_scale_square", "loc_ferry_quay"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: ["npc_geeske", "npc_hiske"],
        evening: ["npc_geeske", "npc_hiske", "npc_durk", "npc_okke", "npc_siebe"],
        night: ["npc_geeske"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_ferry_quay",
      name: "Ferry Quay",
      type: "docks",
      description: "Worn stone steps lead down to a timber quay where the flat ferry waits on its rope and barges tie up three deep, their crews shouting prices across the gaps. Pale oak beams for the guild's bridge lie stacked along the quay under tarred canvas, and every boatman who walks past them spits.",
      exits: ["loc_split_oar", "loc_watch_house", "loc_the_silt", "loc_old_piers"],
      npcIdsBySchedule: {
        morning: ["npc_okke", "npc_lolke"],
        afternoon: ["npc_okke", "npc_siebe"],
        evening: ["npc_marrit", "npc_lolke"],
        night: ["npc_durk"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_st_wybrens",
      name: "St Wybren's",
      type: "temple",
      description: "A squat brick temple with a flood line painted waist-high on every wall and the names of the drowned cut into the stones below it. Votive oars hang from the rafters, and the floor stays damp no matter how much sand the priest throws down.",
      exits: ["loc_scale_square", "loc_sjaarda_house", "loc_the_silt"],
      npcIdsBySchedule: {
        morning: ["npc_teake"],
        afternoon: ["npc_fokje"],
        evening: ["npc_teake", "npc_romke"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_sjaarda_house",
      name: "Sjaarda House",
      type: "manor",
      description: "The only stone house in town, three storeys of grey ashlar behind a wall topped with broken pottery, with half its windows shuttered to save on candles. In the front hall the family portraits remain, but the silver candlesticks are gone and pale squares on the plaster show where better paintings used to hang.",
      exits: ["loc_scale_square", "loc_st_wybrens"],
      npcIdsBySchedule: {
        morning: ["npc_romke", "npc_fokje"],
        afternoon: ["npc_romke", "npc_gerben"],
        evening: [],
        night: ["npc_romke"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_holtrop_forge",
      name: "Holtrop's Forge",
      type: "smithy",
      description: "An open-fronted forge just inside the Land Gate, where carters bring their horses to be shod and the anvil starts ringing at first light. The yard is littered with cart tyres, broken hinges and a horse trough the colour of rust.",
      exits: ["loc_land_gate", "loc_scale_square"],
      npcIdsBySchedule: {
        morning: ["npc_bauke"],
        afternoon: ["npc_bauke"],
        evening: ["npc_bauke"],
        night: []
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_watch_house",
      name: "The Watch House",
      type: "watch",
      description: "A narrow brick building between the square and the river, with two barred cells in the cellar and a board of wanted notices by the door, most of them years old. Inside it smells of damp cloaks, lamp oil and the bucket in the cells.",
      exits: ["loc_scale_square", "loc_ferry_quay"],
      npcIdsBySchedule: {
        morning: ["npc_marrit"],
        afternoon: [],
        evening: [],
        night: ["npc_marrit"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_the_silt",
      name: "The Silt",
      type: "slum",
      description: "Timber shacks on stilts crowd the low bank downstream of the quay, joined by plank walks that sink into the mud at every step. Washing hangs between the roofs, children fish for eels from the doorways, and the whole place floods to the knee every spring.",
      exits: ["loc_ferry_quay", "loc_st_wybrens", "loc_old_piers"],
      npcIdsBySchedule: {
        morning: ["npc_wobbe"],
        afternoon: ["npc_teake"],
        evening: ["npc_wobbe", "npc_anke", "npc_fokje"],
        night: ["npc_fokje"]
      },
      discovered: true,
      closed: false
    },
    {
      id: "loc_old_piers",
      name: "The Old Piers",
      type: "riverbank",
      description: "Five stumps of the old bridge stand in the river below the town, green with weed, the current breaking white around them. The mudflat beside them is churned with boot prints and keel marks that the river never quite smooths away.",
      exits: ["loc_ferry_quay", "loc_the_silt"],
      npcIdsBySchedule: {
        morning: [],
        afternoon: [],
        evening: [],
        night: ["npc_wobbe", "npc_siebe"]
      },
      discovered: true,
      closed: false
    }
  ],

  npcs: [
    {
      id: "npc_geeske",
      name: "Geeske Marsema",
      role: "innkeeper of the Split Oar",
      factionId: null,
      tags: ["innkeeper"],
      look: "Broad, red-armed woman in her fifties with a leather apron and a ring of cellar keys on a cord at her hip.",
      voice: "Talks while she works and never stops working; calls people by what they drink ('Small beer, you're in my light') and answers most questions with a price.",
      personality: ["shrewd", "protective of her regulars"],
      goal: "Keep the Split Oar open and neutral ground, so that no faction can close it or own it.",
      secret: "She lets the Night Ferry keep brandy casks in her cellar for a cut of every run, and Siebe Uilenreef's mark is burned into the cask heads.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_hiske",
      name: "Hiske Doornstra",
      role: "moneylender",
      factionId: "fac_weighhouse",
      tags: ["lender", "guild"],
      look: "Small, neat woman in grey wool with ink on her fingertips and a ledger that never leaves her lap.",
      voice: "Soft and exact; states sums to the last copper, never threatens, and repeats your own words back to you as a question.",
      personality: ["patient", "unforgiving"],
      goal: "Hold every note Jonker Romke owes, so the guild can trade them for the bridge charter, and keep a tenth of the bridge tolls for herself.",
      secret: "She bought the Jonker's three largest notes with guild money but wrote them in her own name, so if Gerben Aldersma falls she still owns the Jonker.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_wobbe",
      name: "Wobbe Kalma",
      role: "rag-and-bone man",
      factionId: "fac_nightferry",
      tags: ["fence", "smuggler"],
      look: "Stooped, cheerful man wearing three coats at once, pushing a handcart of rags, bottles and bent spoons.",
      voice: "Chatty and roundabout, never says a thing straight out; calls stolen goods 'orphans' and haggles in jokes.",
      personality: ["sociable", "cowardly"],
      goal: "Put enough by to buy a cottage upriver before the watch or the guild clears the Silt.",
      secret: "He keeps a written list of everyone who has sold him goods, and Captain Venstra's name is on it beside three months of seized brandy.",
      attitude: 10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_marrit",
      name: "Marrit Venstra",
      role: "captain of the town watch",
      factionId: "fac_watch",
      tags: ["watch", "captain"],
      look: "Tall, rawboned woman with a badly set nose, a brass-studded jerkin and a cudgel worn smooth at the grip.",
      voice: "Clipped questions one after another, who, when, where; cuts you off the moment you start explaining yourself.",
      personality: ["dogged", "proud"],
      goal: "Catch the Night Ferry in the act and prove the Weigh House scales are false, so the watch is paid from fines instead of the Jonker's empty purse.",
      secret: "She has not been paid in three months and sells a share of every seizure to Wobbe Kalma before the rest is counted, and Durk Bokkema knows it.",
      attitude: -10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_durk",
      name: "Durk Bokkema",
      role: "watchman",
      factionId: "fac_watch",
      tags: ["watch"],
      look: "Thick-necked young watchman in a new blue coat too good for his pay, turning a silver ring on his finger.",
      voice: "Loud and matey, all back-slaps and 'friend'; laughs at his own jokes before he finishes them and changes the subject whenever money comes up.",
      personality: ["greedy", "easily frightened"],
      goal: "Keep taking Night Ferry silver without the captain catching on, and marry Anke Postma before spring.",
      secret: "Siebe Uilenreef pays him four silver a week to walk his night patrol away from the Old Piers, and he knows the captain sells seized goods to Wobbe Kalma.",
      attitude: 10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_teake",
      name: "Father Teake Nauta",
      role: "priest of St Wybren's",
      factionId: null,
      tags: ["priest"],
      look: "Thin old man in a patched brown habit, wet to the knees from wading out to bless the boats.",
      voice: "Slow and a little deaf; asks you to say things again, louder, and ends every hard truth with 'and there it is.'",
      personality: ["kind", "stubborn"],
      goal: "Raise enough to rebuild the temple's flood wall before the spring water comes into the Silt again.",
      secret: "Jouke Feikema came to him the night before he drowned and said he was taking his tally book to the captain because the Weigh House was selling smuggled salt; Teake has kept it to himself as a confession.",
      attitude: 15,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_romke",
      name: "Jonker Romke Sjaarda",
      role: "lord of Sjaarda House and holder of the ferry charter",
      factionId: null,
      tags: ["noble"],
      look: "Pale man of forty in a velvet coat gone shiny at the elbows, with a handkerchief always in his left hand.",
      voice: "Courteous to the point of mockery, in long careful sentences full of 'one supposes'; never mentions money by name.",
      personality: ["proud", "indecisive"],
      goal: "Keep Sjaarda House and the family name without signing away the ferry charter, which is all he has left.",
      secret: "He is dying of a lung sickness that only Fokje Reitsma knows about, and with no heir his charter will pass to whoever holds his debts.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_bauke",
      name: "Bauke Holtrop",
      role: "smith",
      factionId: null,
      tags: ["smith"],
      look: "Short, enormously wide man with a burn-scarred forearm, a leather cap and hardly any eyebrows left.",
      voice: "Soft-spoken for his size; thinks a long time before answering, says 'happen so' for yes, and looks at your hands instead of your face.",
      personality: ["careful", "guilty"],
      goal: "Pay off the guild loan on his forge and never do Gerben Aldersma's night work again.",
      secret: "He made the Weigh House's light weights for Gerben Aldersma in return for part of his forge loan, and he buried the true town weights under his quench trough.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_okke",
      name: "Okke Wiersma",
      role: "ferryman",
      factionId: "fac_nightferry",
      tags: ["ferryman"],
      look: "Weathered old man with a white beard cut short, rope calluses on both palms and a wool cap pulled down to his eyebrows.",
      voice: "Talks in weather, depth and current; never uses names, only 'the guild man', 'the captain', 'the young one'.",
      personality: ["superstitious", "loyal"],
      goal: "Keep the ferry running long enough to hand the rope to his granddaughter.",
      secret: "He pulled Jouke Feikema out of the river and saw rope marks on his wrists, but told the watch he saw nothing because Siebe Uilenreef asked him to.",
      attitude: -5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_fokje",
      name: "Fokje Reitsma",
      role: "healer and bonesetter",
      factionId: null,
      tags: ["healer"],
      look: "Brisk woman of thirty with cropped hair, rolled sleeves and a satchel that smells of vinegar and crushed mint.",
      voice: "Gives orders in three words or fewer ('Sit. Show me. Hold still.') and asks what you have eaten before she asks your name.",
      personality: ["practical", "secretive"],
      goal: "Keep the Jonker alive and his sickness quiet until he signs the old drying house over to her as a sickroom for the Silt.",
      secret: "She is treating Jonker Romke for a lung sickness that will kill him within the year, and she has told no one, not even Father Teake.",
      attitude: 0,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_lolke",
      name: "Lolke Feikema",
      role: "tally boy on Ferry Quay",
      factionId: null,
      tags: ["informant"],
      look: "Gangly boy of fifteen with chalk on his fingers, a tally board on a string round his neck and a dead man's coat too long for him.",
      voice: "Quick and cheeky, puts a price on everything ('that's worth two coppers, that is') and wants paying before he talks.",
      personality: ["quick-witted", "vengeful"],
      goal: "Find out who drowned his brother Jouke and see them hanged in Scale Square.",
      secret: "He sells what he sees on the docks to both Captain Venstra and Siebe Uilenreef, and he still has Jouke's key to the Weigh House tally room.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_gerben",
      name: "Gerben Aldersma",
      role: "master of the Weigh House Guild",
      factionId: "fac_weighhouse",
      tags: ["merchant", "guild"],
      look: "Heavy, clean-shaven man with a fur collar, a ring on each thumb and the guild's brass scale badge on his chest.",
      voice: "Big warm voice; talks about progress and the town's future, uses your first name too soon, and puts a hand on your shoulder before he asks for anything.",
      personality: ["ambitious", "charming"],
      goal: "Get the bridge charter signed, build a stone toll bridge, and own every crossing of the Ommel for a day's ride either way.",
      secret: "He buys the Night Ferry's untaxed salt and sells it through the Weigh House at full price, and when Jouke Feikema noticed, he asked Siebe Uilenreef to deal with him.",
      attitude: 10,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_siebe",
      name: "Siebe Uilenreef",
      role: "master of the Night Ferry",
      factionId: "fac_nightferry",
      tags: ["smuggler", "boatman"],
      look: "Lean man with a shaved head, a boatman's knife on a cord at his neck and river mud in the creases of his knuckles.",
      voice: "Quiet, almost lazy; lets silences run until you fill them, and says 'maybe' to everything, including things he is sure of.",
      personality: ["calculating", "ruthless"],
      goal: "Kill the bridge before a stone of it is laid, by debt, scandal or fire, and keep the night river his.",
      secret: "His crew drowned Jouke Feikema at Gerben Aldersma's request, and he kept the guild master's note asking for it as a hold over him.",
      attitude: -15,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    },
    {
      id: "npc_anke",
      name: "Anke Postma",
      role: "salt and cloth seller in Scale Square",
      factionId: "fac_weighhouse",
      tags: ["merchant"],
      look: "Round-faced young woman with salt-cracked hands and a striped headscarf, behind a stall of cloth bolts and salt cones.",
      voice: "A nervous rush of words; apologises for everything and drops to a whisper for anything that matters.",
      personality: ["nervous", "generous"],
      goal: "Keep her stall licence and get out of marrying Durk Bokkema, whom her mother has picked for her.",
      secret: "She buys Night Ferry salt from Wobbe Kalma and sells it under the guild price, which would cost her the stall licence if the guild found out.",
      attitude: 5,
      memories: [],
      alive: true,
      knownToPlayer: false,
      status: "free"
    }
  ],

  factions: [
    {
      id: "fac_weighhouse",
      name: "The Weigh House Guild",
      goal: "Get the bridge charter from Jonker Romke and build a stone toll bridge that puts every crossing of the Ommel under the guild's scales.",
      methods: "Buying up debts, selling stall licences, cheap loans that all fall due at once, and short weights on the town scales.",
      clocks: [
        {
          label: "Buy up the Jonker's debts",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Hiske Doornstra lays every note the Jonker owes on his table, and Jonker Romke signs the bridge charter over to the Weigh House Guild in front of witnesses.",
            effects: [
              { op: "setFlag", key: "bridgeCharterSigned", value: true },
              { op: "priceMultiplier", factor: 1.1 },
              { op: "plantSeed", seed: {
                id: "seed_eel_on_the_door",
                cause: "With the charter signed, Siebe Uilenreef means to frighten the Jonker into tearing it up.",
                effect: "Someone has nailed a dead eel to the door of Sjaarda House with a scrap of the bridge charter in its mouth, and Jonker Romke has had the gate barred.",
                trigger: { type: "npc", value: "npc_romke" },
                fired: false,
                hidden: true
              } },
              { op: "addRumour", rumour: {
                id: "rum_charter_signed",
                text: "The Jonker has signed the bridge charter over to the guild, and the market dues have gone up to pay for the stone.",
                true: true,
                sourceNpcId: "npc_anke",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Clear the Silt waterfront",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Guild labourers pull down the shacks along the Silt waterfront for the bridge footings, and Wobbe Kalma loads his handcart and leaves by the north road.",
            effects: [
              { op: "npcStatus", npcId: "npc_wobbe", status: "gone" },
              { op: "npcMove", npcId: "npc_teake", locationId: "loc_st_wybrens", phases: "all" },
              { op: "openThread", thread: {
                id: "thr_silt_evictions",
                title: "The Silt evictions",
                summary: "Guild labourers have pulled down the waterfront shacks in the Silt for the bridge footings. The families are sleeping on the floor of St Wybren's and Father Teake is asking who will feed them.",
                status: "open",
                knownToPlayer: false,
                linkedIds: ["npc_teake", "fac_weighhouse", "loc_the_silt", "loc_st_wybrens"]
              } },
              { op: "addRumour", rumour: {
                id: "rum_silt_cleared",
                text: "The guild pulled down the waterfront shacks in the Silt, and Wobbe Kalma pushed his handcart up the north road without looking back.",
                true: true,
                sourceNpcId: "npc_teake",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Sink the first pier",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "The guild sinks the first stone pier of the new bridge beside the old stumps, fences off the Old Piers and orders the ferry to stop at the end of the month.",
            effects: [
              { op: "closeLocation", locationId: "loc_old_piers" },
              { op: "priceMultiplier", factor: 1.15 },
              { op: "factionRelation", a: "fac_weighhouse", b: "fac_nightferry", delta: -20 },
              { op: "addRumour", rumour: {
                id: "rum_first_pier",
                text: "The first pier of the new bridge is in the river, the Old Piers are fenced off, and the ferry stops at the end of the month.",
                true: true,
                sourceNpcId: "npc_okke",
                heard: false
              } }
            ]
          }
        }
      ],
      activeClock: 0,
      relations: { fac_watch: -20, fac_nightferry: -60 }
    },
    {
      id: "fac_watch",
      name: "The Town Watch",
      goal: "Break the Night Ferry and prove the Weigh House scales are false, so the watch is paid from fines and tolls instead of the Jonker's empty purse.",
      methods: "Gate searches, night patrols along the quay, informers paid in favours, and arrests made in public to make a point.",
      clocks: [
        {
          label: "Find the night landing",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "The watch catches a Night Ferry boat at the Old Piers with forty cones of salt and six casks of brandy, and the cheap salt disappears from the market.",
            effects: [
              { op: "priceMultiplier", factor: 1.1 },
              { op: "factionRelation", a: "fac_watch", b: "fac_nightferry", delta: -15 },
              { op: "attitudeDelta", npcId: "npc_siebe", delta: -10 },
              { op: "addRumour", rumour: {
                id: "rum_landing_raided",
                text: "The watch caught a Night Ferry boat at the Old Piers with forty cones of salt and six casks of brandy aboard.",
                true: true,
                sourceNpcId: "npc_durk",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Turn a crooked watchman",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Captain Venstra arrests Durk Bokkema for taking Night Ferry silver, and on his first night in the cells he names Wobbe Kalma as their fence.",
            effects: [
              { op: "npcStatus", npcId: "npc_durk", status: "arrested" },
              { op: "npcStatus", npcId: "npc_wobbe", status: "arrested" },
              { op: "plantSeed", seed: {
                id: "seed_durk_in_the_cells",
                cause: "Durk Bokkema, frightened in the cells, wants to trade what he knows about the captain for his freedom.",
                effect: "From the cell window, Durk Bokkema calls to anyone passing that he will tell them where Captain Venstra's missing seizures went, if they carry a message to Siebe Uilenreef.",
                trigger: { type: "location", value: "loc_watch_house" },
                fired: false,
                hidden: true
              } },
              { op: "addRumour", rumour: {
                id: "rum_durk_arrested",
                text: "Durk Bokkema is in the cells for taking Night Ferry silver, and they say he gave up Wobbe Kalma the first night.",
                true: true,
                sourceNpcId: "npc_geeske",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Test the Weigh House scales",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Captain Venstra tests the Weigh House weights against the temple standard on market day, finds every one light, and puts Gerben Aldersma in the cells to wait for the magistrate.",
            effects: [
              { op: "npcStatus", npcId: "npc_gerben", status: "arrested" },
              { op: "priceMultiplier", factor: 0.9 },
              { op: "factionRelation", a: "fac_watch", b: "fac_weighhouse", delta: -30 },
              { op: "addRumour", rumour: {
                id: "rum_scales_tested",
                text: "The captain tested the Weigh House weights against the temple standard, every one was light, and Gerben Aldersma is in the cells.",
                true: true,
                sourceNpcId: "npc_anke",
                heard: false
              } }
            ]
          }
        }
      ],
      activeClock: 0,
      relations: { fac_weighhouse: -20, fac_nightferry: -70 }
    },
    {
      id: "fac_nightferry",
      name: "The Night Ferry",
      goal: "Stop the bridge from ever being built and keep the river crossing unwatched after dark.",
      methods: "Untaxed salt and brandy rowed across after midnight, bribed watchmen, goods hidden in cellars, and fire when talking fails.",
      clocks: [
        {
          label: "Buy the night patrols",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Two more watchmen take Night Ferry silver, the river goes unpatrolled after midnight, and untaxed salt is sold openly in the Silt at half the guild price.",
            effects: [
              { op: "setFlag", key: "riverUnwatched", value: true },
              { op: "priceMultiplier", factor: 0.9 },
              { op: "factionRelation", a: "fac_weighhouse", b: "fac_nightferry", delta: -10 },
              { op: "addRumour", rumour: {
                id: "rum_cheap_salt",
                text: "Nobody walks the river after midnight any more, and you can buy salt in the Silt for half the guild price.",
                true: true,
                sourceNpcId: "npc_wobbe",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Burn the bridge timber",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "The guild's bridge oak on Ferry Quay burns in the night, and Captain Venstra moves her post down to the quay to search every boat that lands.",
            effects: [
              { op: "factionRelation", a: "fac_weighhouse", b: "fac_nightferry", delta: -20 },
              { op: "npcMove", npcId: "npc_marrit", locationId: "loc_ferry_quay", phases: "all" },
              { op: "openThread", thread: {
                id: "thr_timber_fire",
                title: "The timber fire",
                summary: "The guild's bridge oak burned on Ferry Quay in the night. Gerben Aldersma is offering fifty silver for the name of whoever lit it, and the captain is searching every boat.",
                status: "open",
                knownToPlayer: false,
                linkedIds: ["fac_nightferry", "npc_gerben", "npc_marrit", "loc_ferry_quay"]
              } },
              { op: "addRumour", rumour: {
                id: "rum_timber_burned",
                text: "Somebody burned the guild's bridge oak on the quay, and Gerben Aldersma is offering fifty silver for a name.",
                true: true,
                sourceNpcId: "npc_lolke",
                heard: false
              } }
            ]
          }
        },
        {
          label: "Break the guild master",
          segments: 6,
          filled: 0,
          onComplete: {
            text: "Siebe Uilenreef has Gerben Aldersma's note about Jouke Feikema read aloud in the Split Oar, and Gerben flees downriver before dawn, taking the bridge plan with him.",
            effects: [
              { op: "npcStatus", npcId: "npc_gerben", status: "gone" },
              { op: "threadStatus", threadId: "thr_bridge_charter", status: "failed" },
              { op: "priceMultiplier", factor: 0.9 },
              { op: "addRumour", rumour: {
                id: "rum_gerben_fled",
                text: "Gerben Aldersma ran downriver before dawn, after someone read out his note about Jouke Feikema in the Split Oar.",
                true: true,
                sourceNpcId: "npc_geeske",
                heard: false
              } }
            ]
          }
        }
      ],
      activeClock: 0,
      relations: { fac_weighhouse: -60, fac_watch: -70 }
    }
  ],

  threads: [
    {
      id: "thr_bridge_charter",
      title: "The bridge charter",
      summary: "The Weigh House Guild is pressing Jonker Romke to sign over the crossing for a stone toll bridge. If it is built, the ferry and everyone who lives off it are finished.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["fac_weighhouse", "fac_nightferry", "npc_romke", "npc_gerben", "npc_hiske"]
    },
    {
      id: "thr_short_weights",
      title: "Short weights",
      summary: "Traders in Scale Square say the Weigh House scales cheat them, and Captain Venstra has started asking who made the guild's weights.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["fac_watch", "fac_weighhouse", "npc_marrit", "npc_gerben", "npc_bauke", "loc_scale_square"]
    },
    {
      id: "thr_drowned_clerk",
      title: "The drowned tally clerk",
      summary: "Jouke Feikema, a Weigh House tally clerk, was pulled out of the river below the Old Piers twelve days ago. The watch called it drink; his brother Lolke says Jouke never drank.",
      status: "open",
      knownToPlayer: false,
      linkedIds: ["npc_lolke", "npc_okke", "npc_siebe", "npc_gerben", "loc_old_piers"]
    }
  ],

  seeds: [
    {
      id: "seed_salt_run",
      cause: "Siebe Uilenreef has planned the biggest salt run of the season and paid Durk Bokkema to walk his night patrol the other way.",
      effect: "The Night Ferry landed a big run of untaxed salt at the Old Piers overnight; now Anke Postma and the Silt stalls are selling salt at half the guild price, and Gerben Aldersma is in Scale Square demanding to know where it came from.",
      trigger: { type: "day", value: 3 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_hiske_ledger",
      cause: "Hiske Doornstra has bought the last of Jonker Romke's notes from a lender upriver and means to show him the whole sum at once.",
      effect: "Hiske Doornstra and Gerben Aldersma went up to Sjaarda House with her ledger, and the Jonker's shouting carried out of an open window into the lane; half the town now knows he owes the guild more than the house is worth.",
      trigger: { type: "day", value: 4 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_ferry_cut_loose",
      cause: "Gerben Aldersma has offered Okke Wiersma the paid post of bridge-keeper if he talks the other ferrymen into accepting the bridge.",
      effect: "Okke Wiersma was seen sharing a jug with Gerben Aldersma at the Split Oar, and in the night someone cut his ferry loose from its rope; it is aground against the Old Piers and nobody crosses until it is hauled back.",
      trigger: { type: "day", value: 6 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_scale_notice",
      cause: "Captain Venstra has written to the magistrate downriver for leave to test the Weigh House scales.",
      effect: "Captain Venstra has nailed a notice to the Weigh House door saying its scales will be tested against the temple's standard weight, and Gerben Aldersma tore it down in front of the whole market.",
      trigger: { type: "day", value: 7 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_forge_loan",
      cause: "Gerben Aldersma needs honest weights on his scales before the watch tests them and suspects Bauke Holtrop kept the old ones; Bauke swears they were melted down.",
      effect: "Gerben Aldersma has called in the loan on Holtrop's Forge, and Bauke Holtrop has hung a board on the forge saying he takes no new work until the guild is paid.",
      trigger: { type: "day", value: 9 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_jonker_collapse",
      cause: "Jonker Romke's lung sickness has gone past what Fokje Reitsma's remedies can hold back.",
      effect: "Jonker Romke collapsed coughing blood at the evening bell in St Wybren's and Fokje Reitsma was fetched from the Silt; now the whole town says he is dying with no heir, and Hiske Doornstra has been up to Sjaarda House twice.",
      trigger: { type: "day", value: 11 },
      fired: false,
      hidden: true
    },
    {
      id: "seed_jouke_tally_book",
      cause: "Jouke Feikema hid his own tally book in a crack in the second pier stump the night before he was drowned.",
      effect: "In a crack in the second pier stump, just above the waterline, is an oilcloth packet holding Jouke Feikema's tally book, which lists salt carried into the Weigh House by night that never paid the ferry toll.",
      trigger: { type: "location", value: "loc_old_piers" },
      fired: false,
      hidden: true
    }
  ],

  rumours: [
    { id: "rum_jonker_debts", text: "The Jonker owes money to half the lenders on the river, and Hiske Doornstra has been buying up his notes one by one.", true: true, sourceNpcId: "npc_lolke", heard: false },
    { id: "rum_short_weights", text: "The Weigh House scales weigh light: you pay for a full measure of salt and carry home nine parts in ten.", true: true, sourceNpcId: "npc_anke", heard: false },
    { id: "rum_dark_boats", text: "Boats with no lanterns tie up at the Old Piers after midnight, and the watch is never there when they do.", true: true, sourceNpcId: "npc_fokje", heard: false },
    { id: "rum_jouke_sober", text: "Jouke Feikema never touched drink, whatever the watch says, and he kept a tally book of his own apart from the guild's.", true: true, sourceNpcId: "npc_okke", heard: false },
    { id: "rum_durk_coat", text: "Durk Bokkema pays his slate in silver these days, and he bought a blue coat that no watchman's wage would cover.", true: true, sourceNpcId: "npc_geeske", heard: false },
    { id: "rum_jonker_cough", text: "The Jonker has coughed through every evening bell for a month and leaves before the end so nobody sees his handkerchief.", true: true, sourceNpcId: "npc_teake", heard: false },
    { id: "rum_forge_after_curfew", text: "Last winter Bauke Holtrop worked his forge after curfew for a week, and Gerben Aldersma himself came by after dark to carry something heavy away.", true: true, sourceNpcId: "npc_durk", heard: false },
    { id: "rum_jonker_ghost", text: "The old Jonker's ghost walks the Old Piers on foggy nights, looking for the men who let his bridge fall.", true: false, sourceNpcId: "npc_siebe", heard: false },
    { id: "rum_captain_bribed", text: "Captain Venstra is the one taking the Night Ferry's money, which is why the watch never catches a single boat.", true: false, sourceNpcId: "npc_wobbe", heard: false },
    { id: "rum_healer_charm", text: "Fokje Reitsma can stop a wound bleeding with a word she learned from a river witch downstream.", true: false, sourceNpcId: "npc_geeske", heard: false }
  ]
};

// ===== TABLES =====
const TABLES = {
  npc: {
    firstNames: [
      "Aaltje", "Ate", "Berend", "Dieuwke", "Eelke", "Feike", "Froukje", "Foppe", "Haije", "Hylke",
      "Imke", "Jelle", "Jitske", "Klaas", "Liekele", "Mintje", "Nyske", "Oene", "Pieke", "Rintje",
      "Sjoerd", "Sytske", "Tamme", "Trijntje", "Uilke", "Wietse", "Wybe", "Ymkje", "Geertje", "Hessel"
    ],
    familyNames: [
      "Algra", "Bergsma", "Bouma", "Dijkhuis", "Elzinga", "Folkerts", "Galema", "Hettinga", "Hoekstra", "Jelsma",
      "Kooistra", "Kuipers", "Lautenbach", "Meinsma", "Rinsma", "Nijholt", "Oosterhof", "Pasma", "Rodenga", "Sikkema",
      "Steenstra", "Terpstra", "Tolsma", "Veenhuis", "Veltkamp", "Visser", "Wybenga", "Ypma", "Zwart", "Haringsma"
    ],
    occupations: [
      "eel catcher", "rope maker", "peat cutter", "bargehand", "tanner", "cooper", "chandler", "net mender", "basket weaver", "carter",
      "miller's boy", "laundress", "tally clerk", "brick maker", "thatcher", "sail patcher", "fishwife", "lamplighter", "gravedigger", "goose girl",
      "pot boy", "candle maker", "rat catcher", "cobbler", "baker", "weaver", "midwife", "bell ringer", "porter", "boatwright"
    ],
    traits: [
      "suspicious", "talkative", "greedy", "pious", "lazy", "nosy", "honest to a fault", "quick-tempered", "shy", "boastful",
      "kind", "bitter", "cheerful", "superstitious", "stingy", "brave", "anxious", "proud", "sly", "gullible",
      "blunt", "patient", "vain", "loyal", "jealous", "careless", "worn out", "flirtatious", "grudging", "curious"
    ],
    wants: [
      "to pay off a debt before the guild calls it in",
      "a dry room for the winter",
      "news of a son who went downriver and never wrote",
      "to marry above their station",
      "revenge on a neighbour who moved a boundary stone",
      "a healer for a sick child",
      "to leave town and never come back",
      "a buyer for a ring they should not have",
      "to be left alone",
      "a cheap boat that does not leak",
      "to get their name off the watch's list",
      "a drink, right now",
      "work that pays in coin, not credit",
      "to find out who their husband is seeing",
      "a stall licence from the guild",
      "to see the bridge built",
      "to see the bridge never built",
      "their dog back",
      "to be taken seriously for once",
      "someone to carry a letter upriver"
    ],
    speechQuirks: [
      "repeats the last word you said",
      "calls everyone 'neighbour'",
      "swears by the saint's wet feet",
      "counts on their fingers while talking",
      "never finishes a sentence",
      "talks to their dog as much as to you",
      "answers questions with questions",
      "whistles through their teeth between sentences",
      "gets your name wrong every time",
      "speaks very formally, as if in court",
      "uses river words for everything",
      "laughs nervously after every sentence",
      "lowers their voice for no reason",
      "quotes their dead mother",
      "ends sentences with 'mind'",
      "spits before saying anything important",
      "talks too loudly, being a little deaf",
      "pauses a long time before answering",
      "uses long words, some of them wrongly",
      "apologises before disagreeing"
    ]
  },
  location: {
    types: [
      "cooperage", "eel smokery", "rope walk", "bakehouse", "chandlery", "boatyard", "tannery", "dye works",
      "brickworks", "peat store", "stable yard", "bathhouse", "pawnshop", "lodging house", "net loft"
    ],
    details: [
      "a dog asleep across the doorway that nobody moves",
      "a flood line painted on the wall at chest height",
      "a cracked bell hung over the door",
      "eels drying on a line across the yard",
      "a smell of wet ash",
      "a shrine to St Wybren with a fresh candle",
      "a slate of debts chalked by the door",
      "an old ferry rope coiled in the corner",
      "a window patched with oiled paper",
      "a cat with one ear",
      "a floor of packed river clay",
      "a stack of salt cones under sacking",
      "a boat scratched into the door by a child",
      "a broken scale hung up as a sign",
      "a rain barrel full to the brim",
      "a goose that hisses at strangers",
      "a chimney that draws badly and fills the room with smoke",
      "a guild notice nailed to the door",
      "a pair of boots left on the step",
      "mud tracked across the floor in a single path"
    ],
    problems: [
      "the roof leaks over the best bed",
      "the owner owes the guild more than the place is worth",
      "rats have got into the stores",
      "a watchman comes by every evening for free drinks",
      "the well has gone brackish",
      "a lodger has not paid in a month",
      "someone has been stealing from the yard at night",
      "last spring's flood left the floor rotten",
      "the two brothers who run it are not speaking",
      "the guild has raised the rent",
      "a child is sick upstairs",
      "the Night Ferry wants to use the back room",
      "something has died under the floorboards",
      "the apprentice ran off with the takings",
      "a neighbour claims half the yard"
    ]
  },
  items: {
    goods: [
      { name: "Rye loaf", price: 1 },
      { name: "Smoked eel", price: 2 },
      { name: "Jug of small beer", price: 1 },
      { name: "Cup of brandy", price: 2 },
      { name: "Hot meal at the Split Oar", price: 2 },
      { name: "Bed for the night at the Split Oar", price: 3 },
      { name: "Salt cone at the guild price", price: 4 },
      { name: "Round of cheese", price: 6 },
      { name: "Dozen tallow candles", price: 2 },
      { name: "Flask of lamp oil", price: 2 },
      { name: "Ten yards of hemp rope", price: 3 },
      { name: "Wool blanket", price: 6 },
      { name: "Waxed cloak", price: 12 },
      { name: "Leather boots", price: 15 },
      { name: "Wool shirt", price: 4 },
      { name: "Knife", price: 3 },
      { name: "Hatchet", price: 5 },
      { name: "Cudgel", price: 2 },
      { name: "Short sword", price: 40 },
      { name: "Boiled leather jerkin", price: 25 },
      { name: "Crossbow", price: 55 },
      { name: "Ten crossbow bolts", price: 6 },
      { name: "Horse shod, four shoes", price: 4 },
      { name: "Set of lockpicks", price: 10 },
      { name: "Crowbar", price: 4 },
      { name: "Shuttered lantern", price: 5 },
      { name: "Fishing line and hooks", price: 1 },
      { name: "Eel trap", price: 3 },
      { name: "Flint and steel", price: 1 },
      { name: "Five sheets of writing paper", price: 3 },
      { name: "Ink and quill", price: 2 },
      { name: "Herb poultice", price: 2 },
      { name: "Pouch of willow bark", price: 1 },
      { name: "Bone set by a healer", price: 5 },
      { name: "Ferry crossing on foot", price: 1 },
      { name: "Ferry crossing with a cart", price: 3 },
      { name: "Rowing boat, hired for a day", price: 6 },
      { name: "Old riding horse", price: 60 },
      { name: "Bone dice", price: 1 },
      { name: "Pack of cards", price: 2 }
    ],
    trinkets: [
      "a brass button stamped with a ship",
      "a child's wooden ferry boat",
      "a lead pilgrim badge of St Wybren",
      "a cracked hand mirror",
      "a lock of hair tied with red thread",
      "a bent copper coin from upriver",
      "an eel-skin purse",
      "a bone die with two sixes",
      "a tin whistle",
      "a dried pike jaw",
      "a love letter with no name on it",
      "a key to a lock nobody remembers",
      "a guild token with the stamp filed off",
      "a pewter spoon with a bite mark",
      "a faded ribbon from a fair",
      "a pressed marsh orchid between two pages",
      "a glass bead the colour of river water",
      "a toll token from the old bridge",
      "a wooden saint with the face worn off",
      "a ring too small for any finger"
    ]
  },
  complications: [
    "someone saw you",
    "it breaks",
    "it costs more than you have on you",
    "it takes far longer than it should",
    "you drop something and it rolls out of reach",
    "you make a noise",
    "a watchman turns the corner",
    "the person you need has just left",
    "you get it, but you are hurt doing it",
    "someone recognises you",
    "it works, but someone else gets the credit",
    "someone who matters takes offence",
    "you leave something of yours behind",
    "the weather turns on you",
    "a dog starts barking",
    "word of it reaches the guild",
    "someone wants a favour in return",
    "you get the wrong one",
    "it starts a rumour about you",
    "you owe someone for it now"
  ],
  weather: {
    spring: [
      "Cold rain blowing in sideways off the river",
      "Grey and still, the river high and brown",
      "Bright and windy, washing snapping on every line",
      "Fog until noon, then thin sun",
      "Warm drizzle that never quite stops",
      "A hard, clear morning with frost on the ferry rope"
    ],
    summer: [
      "Hot and airless, the river low and smelling of mud",
      "Thunder in the afternoon and a short, heavy rain",
      "Clear and dry, dust blowing on the north road",
      "Muggy, with midges in clouds over the water",
      "A warm south wind carrying the smell of peat fires",
      "A long light evening, swallows over the quay"
    ],
    autumn: [
      "Steady rain and a rising river",
      "Wind stripping the leaves into the water",
      "Low fog that sits on the river all day",
      "Cold, bright and blustery",
      "Drizzle, with peat smoke lying low over the roofs",
      "First frost, the mud gone hard in the ruts"
    ],
    winter: [
      "Sleet driving across the square",
      "Hard frost, ice at the edges of the river",
      "Snow on the roofs, slush in the lanes by noon",
      "A bitter wind off the fields, the ferry fighting the current",
      "Freezing fog that rimes every rope and railing",
      "A thaw, meltwater running in the gutters"
    ]
  }
};

// ===== BACKGROUNDS =====
const BACKGROUNDS = [
  {
    id: "bg_ex_soldier",
    name: "Ex-soldier",
    blurb: "You marched for a lord upriver until the war ended and the pay stopped.",
    stats: { might: 2, wits: 0, charm: 0, stealth: 1 },
    gold: 15,
    items: [
      { id: "item_old_short_sword", name: "Old short sword", qty: 1, notes: "Notched, but it holds an edge." },
      { id: "item_discharge_paper", name: "Discharge paper", qty: 1, notes: "Signed by a captain who is now dead." }
    ],
    arrival: "gate"
  },
  {
    id: "bg_runaway_apprentice",
    name: "Runaway apprentice",
    blurb: "You broke your indenture to a boatwright downriver and took his best chisels with you.",
    stats: { might: 1, wits: 1, charm: -1, stealth: 2 },
    gold: 5,
    items: [
      { id: "item_stolen_chisels", name: "Roll of chisels", qty: 1, notes: "Your old master's mark is burned into every handle." },
      { id: "item_hard_bread", name: "Hard bread", qty: 3, notes: "Three days old and getting older." }
    ],
    arrival: "docks"
  },
  {
    id: "bg_disgraced_clerk",
    name: "Disgraced clerk",
    blurb: "You kept the books for a merchant house until a missing sum was laid at your door.",
    stats: { might: -1, wits: 3, charm: 1, stealth: 0 },
    gold: 25,
    items: [
      { id: "item_writing_kit", name: "Writing kit", qty: 1, notes: "Quills, ink and a penknife in a wooden case." },
      { id: "item_reference_letter", name: "Letter of reference", qty: 1, notes: "Forged, but the seal is good." }
    ],
    arrival: "gate"
  },
  {
    id: "bg_river_trader",
    name: "River trader",
    blurb: "You have bought and sold up and down the Ommel for years and know most of the lock-keepers by name.",
    stats: { might: 0, wits: 1, charm: 2, stealth: 0 },
    gold: 40,
    items: [
      { id: "item_pocket_scales", name: "Pocket scales", qty: 1, notes: "Brass, with your own set of weights." },
      { id: "item_untaxed_salt", name: "Salt cone", qty: 4, notes: "Untaxed. Keep them away from the guild." }
    ],
    arrival: "docks"
  },
  {
    id: "bg_temple_foundling",
    name: "Temple foundling",
    blurb: "You were left on a temple step as a baby and raised on charity, chores and prayers.",
    stats: { might: 0, wits: 1, charm: 1, stealth: 1 },
    gold: 8,
    items: [
      { id: "item_pilgrim_badge", name: "Lead pilgrim badge", qty: 1, notes: "St Wybren of the Crossing, pinned to your blanket when they found you." },
      { id: "item_prayer_cord", name: "Knotted prayer cord", qty: 1, notes: "Worn smooth from years in your pocket." }
    ],
    arrival: "gate"
  },
  {
    id: "bg_card_sharp",
    name: "Card sharp",
    blurb: "You make your living at tavern tables, and the last three towns made it clear you were not welcome back.",
    stats: { might: -1, wits: 1, charm: 1, stealth: 2 },
    gold: 20,
    items: [
      { id: "item_marked_deck", name: "Marked deck", qty: 1, notes: "The marks are in the corner scrollwork." },
      { id: "item_loaded_dice", name: "Loaded dice", qty: 2, notes: "They favour sixes." }
    ],
    arrival: "docks"
  }
];

// ===== FLAWS =====
const FLAWS = [
  "Gambles whenever there is a game going.",
  "Can't back down from a challenge.",
  "Lies easily, even when the truth would do.",
  "Owes a little money to everyone.",
  "Drinks to steady the nerves, and the nerves are never steady.",
  "Can't keep a secret that would make a good story.",
  "Holds a grudge long after it stops being useful.",
  "Takes whatever isn't nailed down."
];

// ===== LOOSE_ENDS =====
const LOOSE_ENDS = {
  debt: {
    label: "A debt",
    options: [
      "I owe a moneylender in this town more than I can pay.",
      "I borrowed against my name, and the note was sold to someone here.",
      "I lost a bet I couldn't cover and swore I'd pay within the month."
    ],
    link: { tag: "lender" },
    newNpc: {
      role: "moneylender",
      look: "Thin man in a good coat with a clerk's stoop and a pocketbook tied shut with string.",
      voice: "Polite and slow, and mentions the interest in every other sentence.",
      personality: ["patient", "merciless"],
      goal: "Collect what the newcomer owes, with interest, before winter.",
      secret: "He bought the debt for a third of its value and would settle for half if pressed."
    },
    seed: {
      dayOffset: [3, 5],
      effect: "{npc} sits down across from {player} uninvited, opens a ledger at the page with {player}'s name on it, and says the debt falls due in three days.",
      trigger: "day"
    }
  },
  enemy: {
    label: "An enemy",
    options: [
      "Someone I wronged has followed me here.",
      "A man I informed on is out of prison and wants me found.",
      "I shamed someone in public, and they swore I would pay for it."
    ],
    link: null,
    newNpc: {
      role: "old enemy",
      look: "Big, quiet man with a healed scar through one eyebrow and a boathook he carries like a walking stick.",
      voice: "Says very little, all of it polite, and always uses your full name.",
      personality: ["patient", "vindictive"],
      goal: "Settle an old score with the newcomer, quietly and for good.",
      secret: "He has already spent the money he was paid to do it, so he cannot go home until it is done."
    },
    seed: {
      dayOffset: [4, 7],
      effect: "{npc} steps off the ferry asking for {player} by name and description, and takes a bed at the Split Oar to wait.",
      trigger: "day"
    }
  },
  secret: {
    label: "A secret",
    options: [
      "Someone here knows what I did before I came.",
      "I am travelling under a name that isn't mine.",
      "I am carrying something stolen, and its owner wants it back."
    ],
    link: { tag: "informant" },
    newNpc: {
      role: "dock gossip",
      look: "Wiry woman with a clay pipe clenched in her teeth and a basket of eels on her hip.",
      voice: "Talks out of the corner of her mouth and never looks at you while she does it.",
      personality: ["nosy", "greedy"],
      goal: "Turn what she knows into coin before someone else does.",
      secret: "She has already sold the same secret to someone else."
    },
    seed: {
      dayOffset: [3, 6],
      effect: "{npc} catches {player} alone, repeats one true detail of {player}'s secret, and names a price for keeping it quiet.",
      trigger: "day"
    }
  },
  lost: {
    label: "Someone lost",
    options: [
      "I am looking for my brother, who came here last year and stopped writing.",
      "I want to know who left me at a temple door, and why.",
      "My closest friend took a barge down the Ommel and never came home."
    ],
    link: { tag: "priest" },
    newNpc: {
      role: "temple register keeper",
      look: "Plump, short-sighted woman in a grey apron, with candle soot on her cheek and a ring of keys.",
      voice: "Fussy and precise; reads everything aloud twice and loses her place in between.",
      personality: ["fussy", "kind"],
      goal: "Keep the temple register in order and match every lost name to a living one.",
      secret: "She lets people pay to have entries in the register changed."
    },
    seed: {
      dayOffset: [4, 8],
      effect: "{npc} sends word that the temple register holds an entry {player} will want to see, and asks {player} to come to St Wybren's after the evening bell.",
      trigger: "day"
    }
  },
  promise: {
    label: "A promise",
    options: [
      "I promised a dying man I would deliver his letter to someone here.",
      "I swore I would repay the family who hid me when I needed it.",
      "I promised to bring someone home from this town."
    ],
    link: { tag: "innkeeper" },
    newNpc: {
      role: "lodging-house keeper",
      look: "Grey-haired man with one arm, a stained waistcoat and a guest book tucked under the other.",
      voice: "Gloomy and dry; expects the worst of everyone and says so politely.",
      personality: ["gloomy", "honest"],
      goal: "Keep his rooms full and his guests out of trouble.",
      secret: "He reads every letter left in his care before he hands it over."
    },
    seed: {
      dayOffset: [2, 4],
      effect: "{npc} hands {player} a folded note a bargeman left at the bar, unsigned, that says only: you gave your word, and the time to keep it is now.",
      trigger: "day"
    }
  }
};

// ===== GRUDGE_TEMPLATES =====
const GRUDGE_TEMPLATES = [
  { effect: "{npc} tells the watch that {player} was seen near a theft, and a watchman starts stopping {player} in the street to search their bags.", dayOffset: [2, 4] },
  { effect: "{npc} tells the stallholders in Scale Square that {player} is a cheat, and they all charge {player} a third more.", dayOffset: [2, 3] },
  { effect: "{npc} pays two bargehands to catch {player} alone after dark and give them a beating as a warning.", dayOffset: [3, 5] },
  { effect: "{npc} spreads the story that {player} informs for the watch, and people in the Silt go quiet whenever {player} comes near.", dayOffset: [2, 4] },
  { effect: "{npc} gets {player}'s name chalked on the Split Oar's slate of people who are not to be served.", dayOffset: [2, 3] },
  { effect: "{npc} finds out where {player} sleeps and has their things searched while they are out.", dayOffset: [3, 5] },
  { effect: "{npc} sends a letter upriver naming {player} and saying where they can be found.", dayOffset: [3, 5] },
  { effect: "{npc} accuses {player}, in front of witnesses, of a theft that {npc} knows {player} did not commit.", dayOffset: [2, 5] }
];

// ===== FAVOUR_TEMPLATES =====
const FAVOUR_TEMPLATES = [
  { effect: "{npc} quietly warns {player} that the watch has been asking about them, and says which watchman.", dayOffset: [2, 3] },
  { effect: "{npc} sells {player} what they need at the old price, whatever the guild says.", dayOffset: [2, 4] },
  { effect: "{npc} introduces {player} to someone in town who can help with what {player} came here to do.", dayOffset: [3, 5] },
  { effect: "{npc} leaves word for {player} at the Split Oar about a day's work that pays ten silver and asks no questions.", dayOffset: [2, 4] },
  { effect: "{npc} tells {player} something true and damaging about a person who has wronged {player}.", dayOffset: [3, 5] },
  { effect: "{npc} speaks up for {player} when they are accused of something, and is believed.", dayOffset: [2, 5] },
  { effect: "{npc} lends {player} a rowing boat for one night and does not ask what it is for.", dayOffset: [2, 4] },
  { effect: "{npc} gives {player} a hot meal and a dry bed for the night and will not take payment.", dayOffset: [2, 3] }
];

if (typeof module !== 'undefined') { module.exports = { TOWN_DATA, TABLES, BACKGROUNDS, FLAWS, LOOSE_ENDS, GRUDGE_TEMPLATES, FAVOUR_TEMPLATES }; }
