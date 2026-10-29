# The cast of Lockett's Ferry

Everyone who can appear in the game: 41 people, every one written by hand in `TOWN_DATA` in `index.html`, with pronouns, a role, a look, a voice, two traits, a goal, a secret, who they are to whom, a home and a place in every phase of the day. The game never makes a person up: anyone the story or the player mentions is one of these people or does not exist (see "The cast" in README.md).

The town has 18 places. 10 are on the map from the start; the other 8 are homes the player finds when someone tells them about one (they then show on the map as "heard of" until visited).

This file is generated from the data: after editing the cast, run `node tests/cast-doc.cjs` (and `node tests/validate-town.cjs`). Looks, voices, goals and secrets are in `index.html` only, so this roster spoils nothing.

## The Low Water

A cinderblock bar on Front Street with neon beer signs in the window, a pool table with a slow lean and a flood line drawn in marker beside the door.

- **Loretta Gaddis** (she/her), owner and bartender of the Low Water. Boss of Tammy Lott; boss of Lyman Coker; boss of Jodie Strayhorn. Usually: home (all day and night). `npc_loretta`
- **Jodie Strayhorn** (she/her), new waitress at the Low Water. Employee of Loretta Gaddis. Usually: Pittman's Gas and Service (morning), home (afternoon, evening, night). `npc_jodie`

## The Riverview Motor Court

Twelve rooms in a single-story L around a cracked parking lot, under a sign that says VACANCY in every season and a name that promises a view you only get from behind the dumpster.

- **Lyman Coker** (he/him), night bartender at the Low Water. Employee of Loretta Gaddis; friend of Curtis Pruett. Usually: home (morning, afternoon), the Low Water (evening, night). `npc_lyman`
- **Leon Varner** (he/him), repo man who buys bad debts for a title-loan outfit. Usually: Pittman's Gas and Service (morning, evening), Riverbend Trailer Park (afternoon), home (night). `npc_leon`
- **Curtis Pruett** (he/him), insurance man who runs the card game at the Low Water. Friend of Lyman Coker. Usually: home (morning), the Low Water (afternoon, evening, night). `npc_curtis`
- **Boyd Teague** (he/him), stranger who has had Room 9 at the motor court a week. Usually: Pittman's Gas and Service (morning), the Old Bridge (afternoon), home (evening, night). `npc_boyd`

## Town Hall

A two-story brick building with the mayor's office upstairs and the police department downstairs, one patrol car out front and a second up on blocks behind it.

- **Marcus Bell** (he/him), chief of police. Boss of Travis Cagle; boss of Glenda Pryor; boss of Nikki Ballard. The Town Police. Usually: home (morning, night), the Old Bridge (afternoon), Pittman's Gas and Service (evening). `npc_marcus`

## Byrd's Pawn

A narrow storefront between two empty ones, its window crowded with chainsaws, guitars and fishing reels behind a security grille that never goes all the way up.

- **Hollis Byrd** (he/him), owner of Byrd's Pawn. Landlord of Nikki Ballard. The Night Run. Usually: home (morning, afternoon, evening), Purvis Landing (night). `npc_hollis`

## Riverbend Trailer Park

Thirty-odd trailers on the low ground downstream of the landing, some with flower boxes and some with blue tarps on the roofs, strung along a gravel loop that floods to the axles every spring.

- **Colt Purvis** (he/him), deckhand on the Night Run. Nephew of Wade Purvis; friend of Trent Haskins; nephew of Lorna Purvis. The Night Run. Usually: home (morning, afternoon), Purvis Landing (evening), the Old Bridge (night). `npc_colt`
- **Travis Cagle** (he/him), night-shift police officer. Employee of Marcus Bell; boyfriend of Shayla Rawls. The Town Police. Usually: Town Hall (morning), home (afternoon), Pittman's Gas and Service (evening), the Riverview Motor Court (night). `npc_travis`
- **June Satterfield** (she/her), retired nurse who patches people up at her kitchen table. Wife of Burl Satterfield. Usually: home (morning, evening, night), Riverside Baptist Church (afternoon). `npc_june`
- **Tyler Rasberry** (he/him), night clerk at the Riverview Motor Court. Employee of Mavis Mangum; cousin of Brianna Tolliver. Usually: home (morning, afternoon), the Riverview Motor Court (evening, night). `npc_tyler`
- **Brianna Tolliver** (she/her), housekeeper at the Riverview Motor Court. Cousin of Tyler Rasberry; employee of Mavis Mangum. Usually: the Riverview Motor Court (morning, afternoon), home (evening, night). `npc_brianna`
- **Shayla Rawls** (she/her), hairdresser who works out of her trailer at Riverbend. Girlfriend of Travis Cagle. Usually: home (all day and night). `npc_shayla`
- **Dwight Spann** (he/him), timber foreman for Sturdivant Land and Timber. Employee of Carter Sturdivant. Sturdivant Land and Timber. Usually: Sturdivant House (morning), the Old Bridge (afternoon), Pittman's Gas and Service (evening), home (night). `npc_dwight`
- **Burl Satterfield** (he/him), June's husband, who fixes outboard motors. Husband of June Satterfield. Usually: home (morning, evening, night), Purvis Landing (afternoon). `npc_burl`

## Purvis Landing

A bait shop on stilts, a fuel pump and a floating dock of aluminum johnboats and bass boats, beside the concrete public ramp where the river road runs straight down into the water.

- **Wade Purvis** (he/him), owner of Purvis Landing and boss of the Night Run. Uncle of Colt Purvis; husband of Lorna Purvis. The Night Run. Usually: home (morning, afternoon, night), the Low Water (evening). `npc_wade`
- **Lorna Purvis** (she/her), Wade's wife, who runs the bait shop at Purvis Landing. Wife of Wade Purvis; aunt of Colt Purvis; boss of Micah Dees. Usually: home (all day and night). `npc_lorna`

## Sturdivant House

A white two-story house with eight columns on the hill above town, its lawn mowed in stripes and its paint peeling on the side nobody sees from the road.

- **Vada Sturdivant** (she/her), widow who owns Sturdivant House and the bottomland downstream. Mother of Carter Sturdivant; boss of Odessa Fairley; landlady of Lamar Haskins. Usually: home (morning, evening, night), Riverside Baptist Church (afternoon). `npc_vada`
- **Carter Sturdivant** (he/him), head of Sturdivant Land and Timber, who holds half the town's paper. Son of Vada Sturdivant; boss of Dwight Spann. Sturdivant Land and Timber. Usually: Town Hall (morning), the Old Bridge (afternoon), the Low Water (evening), home (night). `npc_carter`
- **Odessa Fairley** (she/her), housekeeper and companion to Vada Sturdivant. Employee of Vada Sturdivant. Usually: home (morning, afternoon, night), Riverside Baptist Church (evening). `npc_odessa`

## The Mangum House (a home to find)

A white frame house about a mile up the river road from Pittman's, on the left, with a carport full of engine parts and a porch light left on for whoever gets home last.

- **Dewayne Mangum** (he/him), mechanic in the service bays at Pittman's. Employee of Royce Pittman; husband of Mavis Mangum. Usually: Pittman's Gas and Service (morning, afternoon), Purvis Landing (evening), home (night). `npc_dewayne`
- **Mavis Mangum** (she/her), night manager at the Riverview Motor Court. Wife of Dewayne Mangum; boss of Tyler Rasberry; boss of Brianna Tolliver. Usually: home (morning, afternoon), the Riverview Motor Court (evening, night). `npc_mavis`

## The Pittman Place (a home to find)

A brick ranch house up the bluff behind the station, with a basketball hoop over the garage, a bass boat on a trailer and the station's ledgers spread across the kitchen table.

- **Royce Pittman** (he/him), owner of Pittman's Gas and Service and the swing vote on the town council. Boss of Dewayne Mangum; husband of Darlene Pittman; father of Kaylee Pittman. Usually: Pittman's Gas and Service (morning, evening), the Low Water (afternoon), home (night). `npc_royce`
- **Darlene Pittman** (she/her), Royce's wife, who keeps the books at Pittman's. Wife of Royce Pittman; mother of Kaylee Pittman. Usually: home (morning, evening, night), Pittman's Gas and Service (afternoon). `npc_darlene`
- **Kaylee Pittman** (she/her), Royce's daughter, who works the register after school. Daughter of Royce Pittman; daughter of Darlene Pittman. Usually: home (morning, night), Pittman's Gas and Service (afternoon, evening). `npc_kaylee`

## The Parsonage (a home to find)

A small white house beside Riverside Baptist that the church owns, with a porch swing, a vegetable garden gone to seed and the church van parked on the grass.

- **Ray Dees** (he/him), pastor of Riverside Baptist Church. Husband of Nadine Dees; grandfather of Micah Dees. Usually: Riverside Baptist Church (morning, evening), Riverbend Trailer Park (afternoon), home (night). `npc_ray`
- **Nadine Dees** (she/her), church secretary and pianist at Riverside Baptist. Wife of Ray Dees; grandmother of Micah Dees. Usually: Riverside Baptist Church (morning, afternoon), home (evening, night). `npc_nadine`
- **Micah Dees** (he/him), Ray's grandson, who works the Purvis Landing bait shop. Grandson of Ray Dees; grandson of Nadine Dees; employee of Lorna Purvis. Usually: home (morning, evening), Purvis Landing (afternoon, night). `npc_micah`

## The Lott Trailer (a home to find)

A single-wide at the far end of the Riverbend loop, with a wind chime of bent spoons on the porch and a girl's pink bicycle chained to the steps that nobody rides now.

- **Tammy Lott** (she/her), cook at the Low Water. Employee of Loretta Gaddis; mother of Austin Lott. Usually: home (morning, night), the Low Water (afternoon, evening). `npc_tammy`
- **Austin Lott** (he/him), Tammy's son, Amber Lott's little brother. Son of Tammy Lott. Usually: home (morning, night), Riverbend Trailer Park (afternoon), the Old Bridge (evening). `npc_austin`

## The Apartment over Byrd's (a home to find)

Two rooms up an outside staircase above Byrd's Pawn, rented by the month, with a dripping window unit, a police radio on the counter and a view straight down into the alley where trucks stop after dark.

- **Nikki Ballard** (she/her), day-shift police officer. Tenant of Hollis Byrd; employee of Marcus Bell. The Town Police. Usually: Town Hall (morning, afternoon), home (evening, night). `npc_nikki`

## The Haskins Farm (a home to find)

A tin-roofed farmhouse at the end of a gravel road north of town, with a grain truck under the shed, soybean stubble out to the tree line and a hand-painted sign by the mailbox that once said NO NEW BRIDGE and has been painted over.

- **Virgil Odom** (he/him), retired state bridge inspector who fishes the pier. Father-in-law of Lamar Haskins; grandfather of Trent Haskins. Usually: home (morning, night), the Old Bridge (afternoon, evening). `npc_virgil`
- **Lamar Haskins** (he/him), farmer and council member who leases Sturdivant land. Tenant of Vada Sturdivant; son-in-law of Virgil Odom; father of Trent Haskins. Usually: home (morning, evening, night), Pittman's Gas and Service (afternoon). `npc_lamar`
- **Trent Haskins** (he/him), Lamar's son, who drives the farm's grain truck. Friend of Colt Purvis; grandson of Virgil Odom; son of Lamar Haskins. The Night Run. Usually: home (morning), Pittman's Gas and Service (afternoon), Purvis Landing (evening, night). `npc_trent`

## The Overstreet House (a home to find)

A neat yellow house on the rise behind Town Hall, with a flag on the porch, a scanner squawking in the front window and a chest freezer humming in the carport.

- **Jolene Overstreet** (she/her), mayor and town clerk. Mother of Annette Overstreet; wife of Gerald Overstreet. Sturdivant Land and Timber. Usually: Town Hall (morning, afternoon), Riverside Baptist Church (evening), home (night). `npc_jolene`
- **Annette Overstreet** (she/her), seventh-grade teacher at the county middle school. Daughter of Jolene Overstreet; daughter of Gerald Overstreet. Usually: home (morning, afternoon, night), Riverside Baptist Church (evening). `npc_annette`
- **Gerald Overstreet** (he/him), Jolene's husband, retired from the paper mill. Husband of Jolene Overstreet; father of Annette Overstreet. Usually: home (all day and night). `npc_gerald`

## The Gentry House (a home to find)

The oldest house in town, a gray two-story with a deep porch on the slope between the church and Front Street, built by the family that ran the ferry before there was a bridge.

- **Elbert Gentry** (he/him), the oldest man in town, whose granddaddy ran the last ferry. Brother of Pearl Gentry; grandfather of Glenda Pryor. Usually: Riverside Baptist Church (morning), the Low Water (afternoon), home (evening, night). `npc_elbert`
- **Pearl Gentry** (she/her), columnist for the county weekly. Sister of Elbert Gentry. Usually: Riverside Baptist Church (morning), Town Hall (afternoon), home (evening, night). `npc_pearl`
- **Glenda Pryor** (she/her), police dispatcher and clerk at Town Hall. Employee of Marcus Bell; granddaughter of Elbert Gentry. The Town Police. Usually: Town Hall (morning, afternoon), home (evening, night). `npc_glenda`

## Talked about, never in town

People the story can mention who never appear (the dead, the far away). The narrator is told about them with the cast.

- **Amber Lott**: Tammy's daughter and Austin's sister, nineteen, who died of an overdose at Riverbend in August.
- **Dale Purvis**: Wade's younger brother and Colt's father, eight years into a sentence at the state penitentiary.
- **the bridge engineer**: the consulting engineer from the city who wrote the report that condemned the old bridge; he does not come back to town.
- **Renee Byrd**: Hollis's daughter, a dental hygienist in the city who has not spoken to him in three years.
- **the chief's sister**: Marcus Bell's sister, a nurse in the city and the only family he has left.
- **Leah Dees**: Ray and Nadine's daughter and Micah's mother, in a treatment program in the city since the summer.
- **Ruth Haskins**: Lamar's wife and Virgil's daughter, who died three winters ago.
- **the motor court's owner**: a man in the city who has not set foot on the lot in two years and runs it by email.
- **Vada's father**: the Sturdivant who ran whiskey across the river and fought the state for the bridge in 1938, long dead.

## Loose ends

Each loose end the player picks binds to someone in the cast: a free person carrying the tag of the option they kept, else the loose end's own tag (picked with the seeded dice, never someone already tied to another loose end while anyone else is left).

- **A debt** (lender: Carter Sturdivant, Hollis Byrd; collector: Leon Varner; bookie: Curtis Pruett)
- **An enemy** (enemy: Boyd Teague, Jodie Strayhorn; parolee: Boyd Teague)
- **A secret** (informant: Tyler Rasberry, Glenda Pryor, Shayla Rawls)
- **Someone lost** (records: Jolene Overstreet, Ray Dees, Nadine Dees, Pearl Gentry)
- **A promise** (bartender: Loretta Gaddis, Lyman Coker)
