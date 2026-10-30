# The cast of Lockett's Ferry

Everyone the story can mention: 66 people, every one written by hand in `TOWN_DATA` in `content/town.js` (built into `index.html`), with an age, pronouns, a role, a look, a voice, two traits, a goal, a secret, a history and who they are to whom. 41 live in town, with a home and a place in every phase of the day; 17 live elsewhere and 8 are dead: the story can talk about them, but they never appear. The game never makes a person up: anyone the story or the player mentions is one of these people or does not exist (see "The cast" in README.md).

The town has 38 places. 15 are on the map from the start; 8 are homes the player finds when someone tells them about one (they then show on the map as "heard of" until visited); 15 are out of town, talked about and never gone to.

This file is generated from the data: after editing the cast or the places, run `node tests/cast-doc.cjs` (and `node tests/validate-town.cjs`). Looks, voices, goals and secrets are in `index.html` only, so this roster spoils nothing.

## The Low Water

A cinderblock bar on Front Street with neon beer signs in the window, a pool table with a slow lean and a flood line drawn in marker beside the door.

- **Loretta Gaddis** (60, she/her), owner and bartender of the Low Water. Boss of Tammy Lott; boss of Lyman Coker; boss of Jodie Strayhorn. Usually: home (all day and night). `npc_loretta`
- **Jodie Strayhorn** (29, she/her), new waitress at the Low Water. Employee of Loretta Gaddis. Usually: Pittman's Gas and Service (morning), home (afternoon, evening, night). `npc_jodie`

## The Riverview Motor Court

Twelve rooms in a single-story L around a cracked parking lot, under a sign that says VACANCY in every season and a name that promises a view you only get from behind the dumpster.

- **Lyman Coker** (70, he/him), night bartender at the Low Water. Employee of Loretta Gaddis; friend of Curtis Pruett. Usually: home (morning, afternoon), the Low Water (evening, night). `npc_lyman`
- **Leon Varner** (47, he/him), repo man who buys bad debts for a title-loan outfit. Employee of Wendell Strunk (lives elsewhere). Usually: Pittman's Gas and Service (morning, evening), Riverbend Trailer Park (afternoon), home (night). `npc_leon`
- **Curtis Pruett** (52, he/him), insurance man who runs the card game at the Low Water. Friend of Lyman Coker; husband of Lynette Pruett (lives elsewhere). Usually: home (morning), the Low Water (afternoon, evening, night). `npc_curtis`
- **Boyd Teague** (50, he/him), stranger who has had Room 9 at the motor court a week. Usually: Pittman's Gas and Service (morning), the Old Bridge (afternoon), home (evening, night). `npc_boyd`

## Town Hall

A two-story brick building with the mayor's office upstairs and the police department downstairs, one patrol car out front and a second up on blocks behind it.

- **Marcus Bell** (50, he/him), chief of police. Boss of Travis Cagle; boss of Glenda Pryor; boss of Nikki Ballard; brother of Celeste Bell (lives elsewhere). The Town Police. Usually: home (morning, night), the Old Bridge (afternoon), Pittman's Gas and Service (evening). `npc_marcus`

## Byrd's Pawn

A narrow storefront between two empty ones, its window crowded with chainsaws, guitars and fishing reels behind a security grille that never goes all the way up.

- **Hollis Byrd** (65, he/him), owner of Byrd's Pawn. Landlord of Nikki Ballard; father of Renee Byrd (lives elsewhere); father-in-law of Scott Lindell (lives elsewhere). The Night Run. Usually: home (morning, afternoon, evening), Purvis Landing (night). `npc_hollis`

## Riverbend Trailer Park

Thirty-odd trailers on the low ground downstream of the landing, some with flower boxes and some with blue tarps on the roofs, strung along a gravel loop that floods to the axles every spring.

- **Colt Purvis** (22, he/him), deckhand on the Night Run. Nephew of Wade Purvis; friend of Trent Haskins; nephew of Lorna Purvis; son of Dale Purvis (lives elsewhere). The Night Run. Usually: home (morning, afternoon), Purvis Landing (evening), the Old Bridge (night). `npc_colt`
- **Travis Cagle** (28, he/him), night-shift police officer. Employee of Marcus Bell; boyfriend of Shayla Rawls. The Town Police. Usually: Town Hall (morning), home (afternoon), Pittman's Gas and Service (evening), the Riverview Motor Court (night). `npc_travis`
- **June Satterfield** (60, she/her), retired nurse who patches people up at her kitchen table. Wife of Burl Satterfield. Usually: home (morning, evening, night), Riverside Baptist Church (afternoon). `npc_june`
- **Tyler Rasberry** (19, he/him), night clerk at the Riverview Motor Court. Employee of Mavis Mangum; cousin of Brianna Tolliver. Usually: home (morning, afternoon), the Riverview Motor Court (evening, night). `npc_tyler`
- **Brianna Tolliver** (23, she/her), housekeeper at the Riverview Motor Court. Cousin of Tyler Rasberry; employee of Mavis Mangum. Usually: the Riverview Motor Court (morning, afternoon), home (evening, night). `npc_brianna`
- **Shayla Rawls** (25, she/her), hairdresser who works out of her trailer at Riverbend. Girlfriend of Travis Cagle. Usually: home (all day and night). `npc_shayla`
- **Dwight Spann** (49, he/him), timber foreman for Sturdivant Land and Timber. Employee of Carter Sturdivant. Sturdivant Land and Timber. Usually: Sturdivant House (morning), the Old Bridge (afternoon), Pittman's Gas and Service (evening), home (night). `npc_dwight`
- **Burl Satterfield** (66, he/him), June's husband, who fixes outboard motors. Husband of June Satterfield; friend of Wiley Tackett (dead). Usually: home (morning, evening, night), Purvis Landing (afternoon). `npc_burl`

## Purvis Landing

A bait shop on stilts, a fuel pump and a floating dock of aluminum johnboats and bass boats, beside the concrete public ramp where the river road runs straight down into the water.

- **Wade Purvis** (57, he/him), owner of Purvis Landing and boss of the Night Run. Uncle of Colt Purvis; husband of Lorna Purvis; brother of Dale Purvis (lives elsewhere). The Night Run. Usually: home (morning, afternoon, night), the Low Water (evening). `npc_wade`
- **Lorna Purvis** (55, she/her), Wade's wife, who runs the bait shop at Purvis Landing. Wife of Wade Purvis; aunt of Colt Purvis; boss of Micah Dees; sister-in-law of Dale Purvis (lives elsewhere). Usually: home (all day and night). `npc_lorna`

## Sturdivant House

A white two-story house with eight columns on the hill above town, its lawn mowed in stripes and its paint peeling on the side nobody sees from the road.

- **Vada Sturdivant** (80, she/her), widow who owns Sturdivant House and the bottomland downstream. Mother of Carter Sturdivant; boss of Odessa Fairley; landlady of Lamar Haskins; daughter of Amos Sturdivant (dead); wife of Harlan Voss (dead). Usually: home (morning, evening, night), Riverside Baptist Church (afternoon). `npc_vada`
- **Carter Sturdivant** (45, he/him), head of Sturdivant Land and Timber, who holds half the town's paper. Son of Vada Sturdivant; boss of Dwight Spann; grandson of Amos Sturdivant (dead); son of Harlan Voss (dead). Sturdivant Land and Timber. Usually: Town Hall (morning), the Old Bridge (afternoon), the Low Water (evening), home (night). `npc_carter`
- **Odessa Fairley** (66, she/her), housekeeper and companion to Vada Sturdivant. Employee of Vada Sturdivant; sister of Corinne Bolden (lives elsewhere). Usually: home (morning, afternoon, night), Riverside Baptist Church (evening). `npc_odessa`

## The Mangum House (a home to find)

A white frame house about a mile up the river road from Pittman's, on the left, with a carport full of engine parts and a porch light left on for whoever gets home last.

- **Dewayne Mangum** (40, he/him), mechanic in the service bays at Pittman's. Employee of Royce Pittman; husband of Mavis Mangum; son-in-law of Inez Crocker (dead). Usually: Pittman's Gas and Service (morning, afternoon), Purvis Landing (evening), home (night). `npc_dewayne`
- **Mavis Mangum** (41, she/her), night manager at the Riverview Motor Court. Wife of Dewayne Mangum; boss of Tyler Rasberry; boss of Brianna Tolliver; daughter of Inez Crocker (dead); employee of Stanley Wexler (lives elsewhere). Usually: home (morning, afternoon), the Riverview Motor Court (evening, night). `npc_mavis`

## The Pittman Place (a home to find)

A brick ranch house up the bluff behind the station, with a basketball hoop over the garage, a bass boat on a trailer and the station's ledgers spread across the kitchen table.

- **Royce Pittman** (56, he/him), owner of Pittman's Gas and Service and the swing vote on the town council. Boss of Dewayne Mangum; husband of Darlene Pittman; father of Kaylee Pittman; son of Clyde Pittman (dead). Usually: Pittman's Gas and Service (morning, evening), the Low Water (afternoon), home (night). `npc_royce`
- **Darlene Pittman** (54, she/her), Royce's wife, who keeps the books at Pittman's. Wife of Royce Pittman; mother of Kaylee Pittman. Usually: home (morning, evening, night), Pittman's Gas and Service (afternoon). `npc_darlene`
- **Kaylee Pittman** (16, she/her), Royce's daughter, who works the register after school. Daughter of Royce Pittman; daughter of Darlene Pittman; granddaughter of Clyde Pittman (dead). Usually: home (morning, night), Pittman's Gas and Service (afternoon, evening). `npc_kaylee`

## The Parsonage (a home to find)

A small white house beside Riverside Baptist that the church owns, with a porch swing, a vegetable garden gone to seed and the church van parked on the grass.

- **Ray Dees** (65, he/him), pastor of Riverside Baptist Church. Husband of Nadine Dees; grandfather of Micah Dees; father of Leah Dees (lives elsewhere). Usually: Riverside Baptist Church (morning, evening), Riverbend Trailer Park (afternoon), home (night). `npc_ray`
- **Nadine Dees** (63, she/her), church secretary and pianist at Riverside Baptist. Wife of Ray Dees; grandmother of Micah Dees; mother of Leah Dees (lives elsewhere). Usually: Riverside Baptist Church (morning, afternoon), home (evening, night). `npc_nadine`
- **Micah Dees** (17, he/him), Ray's grandson, who works the Purvis Landing bait shop. Grandson of Ray Dees; grandson of Nadine Dees; employee of Lorna Purvis; son of Leah Dees (lives elsewhere). Usually: home (morning, evening), Purvis Landing (afternoon, night). `npc_micah`

## The Lott Trailer (a home to find)

A single-wide at the far end of the Riverbend loop, with a wind chime of bent spoons on the porch and a girl's pink bicycle chained to the steps that nobody rides now.

- **Tammy Lott** (42, she/her), cook at the Low Water. Employee of Loretta Gaddis; mother of Austin Lott; mother of Amber Lott (dead). Usually: home (morning, night), the Low Water (afternoon, evening). `npc_tammy`
- **Austin Lott** (15, he/him), Tammy's son, Amber Lott's little brother. Son of Tammy Lott; brother of Amber Lott (dead). Usually: home (morning, night), Riverbend Trailer Park (afternoon), the Old Bridge (evening). `npc_austin`

## The Apartment over Byrd's (a home to find)

Two rooms up an outside staircase above Byrd's Pawn, rented by the month, with a dripping window unit, a police radio on the counter and a view straight down into the alley where trucks stop after dark.

- **Nikki Ballard** (31, she/her), day-shift police officer. Tenant of Hollis Byrd; employee of Marcus Bell. The Town Police. Usually: Town Hall (morning, afternoon), home (evening, night). `npc_nikki`

## The Haskins Farm (a home to find)

A tin-roofed farmhouse at the end of a gravel road north of town, with a grain truck under the shed, soybean stubble out to the tree line and a hand-painted sign by the mailbox that once said NO NEW BRIDGE and has been painted over.

- **Virgil Odom** (72, he/him), retired state bridge inspector who fishes the pier. Father-in-law of Lamar Haskins; grandfather of Trent Haskins; father of Ruth Haskins (dead). Usually: home (morning, night), the Old Bridge (afternoon, evening). `npc_virgil`
- **Lamar Haskins** (58, he/him), farmer and council member who leases Sturdivant land. Tenant of Vada Sturdivant; son-in-law of Virgil Odom; father of Trent Haskins; husband of Ruth Haskins (dead). Usually: home (morning, evening, night), Pittman's Gas and Service (afternoon). `npc_lamar`
- **Trent Haskins** (24, he/him), Lamar's son, who drives the farm's grain truck. Friend of Colt Purvis; grandson of Virgil Odom; son of Lamar Haskins; son of Ruth Haskins (dead). The Night Run. Usually: home (morning), Pittman's Gas and Service (afternoon), Purvis Landing (evening, night). `npc_trent`

## The Overstreet House (a home to find)

A neat yellow house on the rise behind Town Hall, with a flag on the porch, a scanner squawking in the front window and a chest freezer humming in the carport.

- **Jolene Overstreet** (57, she/her), mayor and town clerk. Mother of Annette Overstreet; wife of Gerald Overstreet. Sturdivant Land and Timber. Usually: Town Hall (morning, afternoon), Riverside Baptist Church (evening), home (night). `npc_jolene`
- **Annette Overstreet** (34, she/her), seventh-grade teacher at the county middle school. Daughter of Jolene Overstreet; daughter of Gerald Overstreet. Usually: home (morning, afternoon, night), Riverside Baptist Church (evening). `npc_annette`
- **Gerald Overstreet** (61, he/him), Jolene's husband, retired from the paper mill. Husband of Jolene Overstreet; father of Annette Overstreet. Usually: home (all day and night). `npc_gerald`

## The Gentry House (a home to find)

The oldest house in town, a gray two-story with a deep porch on the slope between the church and Front Street, built by the family that ran the ferry before there was a bridge.

- **Elbert Gentry** (88, he/him), the oldest man in town, whose granddaddy ran the last ferry. Brother of Pearl Gentry; grandfather of Glenda Pryor; grandson of Asa Gentry (dead). Usually: Riverside Baptist Church (morning), the Low Water (afternoon), home (evening, night). `npc_elbert`
- **Pearl Gentry** (79, she/her), columnist for the county weekly. Sister of Elbert Gentry; granddaughter of Asa Gentry (dead). Usually: Riverside Baptist Church (morning), Town Hall (afternoon), home (evening, night). `npc_pearl`
- **Glenda Pryor** (40, she/her), police dispatcher and clerk at Town Hall. Employee of Marcus Bell; granddaughter of Elbert Gentry. The Town Police. Usually: Town Hall (morning, afternoon), home (evening, night). `npc_glenda`

## Elsewhere

Alive and living out of town. The narrator is told where they are and how they can be reached; they are never scheduled and never in a scene.

- **Dale Purvis** (49, he/him), Wade's younger brother and Colt's father, in the state penitentiary. Brother of Wade Purvis; father of Colt Purvis; brother-in-law of Lorna Purvis. Lives: the state penitentiary, eight years into a fifteen-year sentence. Reached by: letters, and a collect call on Sunday nights; visiting is the second and fourth Saturday. `npc_dale`
- **Warren Pettit** (51, he/him), the consulting engineer from Calder who wrote the report that condemned the old bridge. Lives: Calder, at his engineering firm on the courthouse square. Reached by: by email to his firm; he has stopped taking calls about the bridge. `npc_warren`
- **Renee Byrd** (38, she/her), Hollis's daughter, a dental hygienist in Calder. Daughter of Hollis Byrd; wife of Scott Lindell (lives elsewhere). Lives: Calder, where she cleans teeth at a dental office near the hospital. Reached by: her number is in Hollis's phone, and she lets it ring. `npc_renee`
- **Scott Lindell** (40, he/him), Renee's husband, a pharmacist in Calder. Son-in-law of Hollis Byrd; husband of Renee Byrd (lives elsewhere). Lives: Calder, where he runs the pharmacy counter at a drugstore by the interstate. Reached by: the pharmacy phone, or through Renee. `npc_scott`
- **Celeste Bell** (46, she/her), Marcus Bell's sister, a nurse at Calder Regional. Sister of Marcus Bell. Lives: Calder, where she works nights in the emergency room at Calder Regional. Reached by: she calls her brother on Sunday nights, after her shift. `npc_celeste`
- **Leah Dees** (38, she/her), Ray and Nadine's daughter and Micah's mother, in a treatment program in Calder. Daughter of Ray Dees; daughter of Nadine Dees; mother of Micah Dees. Lives: the Willows, a treatment program in Calder, since July. Reached by: one phone call a week on Thursday nights, and family visits on Sunday afternoons. `npc_leah`
- **Stanley Wexler** (63, he/him), owner of the Riverview Motor Court, who runs it by email from Calder. Boss of Mavis Mangum. Lives: Calder, where he owns two car washes and a laundromat besides the motor court. Reached by: by email; he answers within a day and never by phone. `npc_stanley`
- **Calvin Ogletree** (44, he/him), a former river hand who has been in the county home since a beating. Brother of Bernice Ogletree (lives elsewhere). Lives: the county home in Clayburn, since the winter of 2021. Reached by: visiting hours every afternoon; he cannot use a phone. `npc_calvin`
- **Bernice Ogletree** (50, she/her), Calvin's sister, who looks after him at the county home. Sister of Calvin Ogletree (lives elsewhere). Lives: Clayburn, in a rented duplex four blocks from the county home. Reached by: she has a phone and answers it; she sees her brother every Sunday. `npc_bernice`
- **Hoyt Bramlett** (61, he/him), the county sheriff, at the courthouse in Clayburn. Lives: Clayburn, at the sheriff's office in the courthouse basement. Reached by: the sheriff's office line; a deputy comes when called, in an hour or two. `npc_hoyt`
- **Phillip Sayle** (58, he/him), a doctor in Calder who examines old people for the courts. Lives: Calder, at a clinic for older patients near Calder Regional. Reached by: through his office, by appointment. `npc_phillip`
- **Neal Haverty** (60, he/him), the Sturdivants' lawyer in Calder. Lives: Calder, in an office over the bank on the courthouse square. Reached by: his office phone; his paralegal returns calls. `npc_neal`
- **Corinne Bolden** (70, she/her), Odessa's older sister, a retired school cook in Clayburn. Sister of Odessa Fairley. Lives: Clayburn, in the house she and Odessa grew up in, behind the courthouse. Reached by: Odessa drives over on her Sunday afternoons off; Corinne has a phone and a bad hip. `npc_corinne`
- **Lynette Pruett** (50, she/her), Curtis's wife, who put him out of their house in Clayburn. Wife of Curtis Pruett. Lives: Clayburn, in the brick house she and Curtis bought in 2004. Reached by: she answers the phone when it is not Curtis. `npc_lynette`
- **Wendell Strunk** (59, he/him), owner of the title-loan outfit in Clayburn that Leon Varner collects for. Boss of Leon Varner. Lives: Clayburn, behind the counter of his title-loan office on the highway. Reached by: his office phone, which a clerk answers. `npc_wendell`
- **Garland Teasley** (74, he/him), a private lender in Calder who carries the Sturdivant timber loans. Lives: Calder, in a private office above a bank on the courthouse square. Reached by: by letter; he does not take calls from people who owe him. `npc_garland`
- **Teresa Gaines** (44, she/her), a parole officer two states over. Lives: a parole office two states over. Reached by: her office line; she returns calls within the week. `npc_teresa`

## Gone

The dead, with their age when they died. People remember them; they never appear.

- **Amber Lott** (19, she/her), Tammy's daughter, who died at nineteen. Daughter of Tammy Lott; sister of Austin Lott. Died: August 2026, an overdose at Riverbend. Buried: Riverside Cemetery. `npc_amber`
- **Ruth Haskins** (47, she/her), Lamar's late wife and Virgil's daughter. Daughter of Virgil Odom; wife of Lamar Haskins; mother of Trent Haskins. Died: January 2024, cancer. Buried: Riverside Cemetery. `npc_ruth`
- **Amos Sturdivant** (74, he/him), Vada's father, who fought the state for the bridge in 1938. Father of Vada Sturdivant; grandfather of Carter Sturdivant. Died: spring of 1979, a stroke. Buried: Riverside Cemetery. `npc_amos`
- **Harlan Voss** (71, he/him), Vada's late husband and Carter's father, who ran the timber side of the business. Husband of Vada Sturdivant; father of Carter Sturdivant. Died: October 2014, a heart attack in the timber woods. Buried: Riverside Cemetery. `npc_harlan`
- **Inez Crocker** (69, she/her), Mavis's late mother, whose house the Mangums live in. Mother-in-law of Dewayne Mangum; mother of Mavis Mangum. Died: February 2025, heart failure. Buried: Riverside Cemetery. `npc_inez`
- **Asa Gentry** (83, he/him), Elbert's granddaddy, who ran the last ferry. Grandfather of Elbert Gentry; grandfather of Pearl Gentry. Died: winter of 1951, pneumonia. Buried: Riverside Cemetery. `npc_asa`
- **Wiley Tackett** (77, he/him), the mechanic who ran the garage on Front Street for forty-five years. Friend of Burl Satterfield. Died: March 2024, lung cancer. Buried: Riverside Cemetery. `npc_wiley`
- **Clyde Pittman** (69, he/him), Royce's late daddy, who opened Pittman's in 1966. Father of Royce Pittman; grandfather of Kaylee Pittman. Died: summer of 2009, a heart attack at the pumps. Buried: Riverside Cemetery. `npc_clyde`

## The town

A man named Lockett ran a flatboat ferry across the Lusk here in the 1820s, and the town grew up around his landing. The Gentrys bought the ferry after the Civil War and ran it until 1938, when Amos Sturdivant fought the state into building the green steel bridge and the ferry was cut loose. For fifty years the town lived on the highway traffic and the paper mill nine miles downstream. Then it lost them one at a time: the children went to the county school in Clayburn in 1987, the bypass opened twelve miles east in 1994 after a fight that split the council three to two and took the trucks with it, the mill shut in 2016 and the old county hospital in Clayburn in 2019. What is left is the bar, the station, the motel, the church, the river trade after dark and about eight hundred people who argue about the bridge: whether it is sound, whether the new one goes here or on the Sturdivant bottomland downstream, and whether a town this size can keep its own police.

* January 2024: Ruth Haskins died of cancer at forty-seven, and her father Virgil Odom moved out to the Haskins Farm that spring.
* March 2024: Wiley Tackett died, and his garage on Front Street was chained shut.
* October 2024: Renee Byrd married Scott Lindell in Calder and did not invite her father.
* February 2025: Inez Crocker died in her house up the river road, where her daughter Mavis and Dewayne Mangum still live.
* April 2025: The river crested at thirty-one feet, the worst flood since 1973. Riverbend went under to the windows and the Low Water took water to the line by the door.
* November 2025: The drugstore on Front Street closed, leaving Byrd's Pawn the last store open on that side of Front Street.
* December 2025: Lynette Pruett put Curtis out of their house in Clayburn, and he took a room at the Riverview Motor Court.
* April 2026: An engineer from Calder inspected the old bridge, and his report rated it critical. The state offered to pay for one new crossing, here or on the Sturdivant bottomland.
* July 2026: Leah Dees went into the Willows in Calder, and her son Micah moved into the Parsonage with his grandparents.
* August 2026: Amber Lott died of an overdose at Riverbend at nineteen; her funeral filled Riverside Baptist.
* September 2026: The council set its vote on the bridge site for this month.

## Places

Every place, with how it came to be and when it is open. On the map from the start, a home to find, or out of town (never a destination).

- **Pittman's Gas and Service** (gas; on the map). Clyde Pittman built the station in 1966, when the highway still brought the trucks through town, and Royce took it over when his daddy died at the pumps in 2009. Hours: 6 a.m. to 10 p.m. every day; the service bays close at 5. `loc_pittmans`
- **The Low Water** (bar; on the map). Loretta Gaddis bought the Low Water in 1994, the year the bypass opened, and has kept it open through every flood since; the marker line by the door is from April 2025. Hours: 11 a.m. to 2 a.m., Monday to Saturday; closed Sundays. `loc_low_water`
- **The Riverview Motor Court** (motel; on the map). The Riverview went up in 1962 for the highway trade and has had five owners since the bypass took the trucks away; Stanley Wexler bought it in 2019. Hours: Office open 6 p.m. to 6 a.m.; checkout at 11. `loc_motor_court`
- **Riverside Baptist Church** (church; on the map). Riverside Baptist was built in 1911 on land the Gentrys gave, and Ray Dees has been its pastor since 1994; the new roof went on this summer. Hours: Sunday school 9:45, service at 11; supper and prayer Wednesdays at 6. `loc_riverside_church`
- **Town Hall** (police; on the map). Town Hall went up in 1956, when the town still had money, and the police department moved into its ground floor in 1978. Hours: Clerk's office 8 to 4:30 on weekdays; the police answer the door day and night. `loc_town_hall`
- **Byrd's Pawn** (pawn; on the map). Hollis Byrd opened the pawn shop in 1988 in what had been the auto parts store, and it is the last store open on its side of Front Street. Hours: 9 to 6, Monday to Saturday. `loc_byrds_pawn`
- **Riverbend Trailer Park** (trailerpark; on the map). Riverbend was a fish camp until 1974, when the Sturdivants cut it into trailer lots; it floods every spring and went under to the windows in April 2025. Hours: Always open. `loc_riverbend`
- **Purvis Landing** (marina; on the map). The Purvis family has run the landing since 1952 on land leased from the Sturdivants, at the spot where the Gentry ferry used to tie up. Hours: 5 a.m. to 7 p.m.; the ramp is open all night. `loc_purvis_landing`
- **Sturdivant House** (bighouse; on the map). Amos Sturdivant built the house in 1926, and Vada was born in its front bedroom in 1946. Hours: Callers by invitation; Miss Vada receives in the evening. `loc_sturdivant_house`
- **The Old Bridge** (bridge; on the map). The bridge opened in October 1938 after Amos Sturdivant's three-year fight with the state, put the Gentry ferry out of business, and has been posted at five tons since 2019. Hours: Always open; five-ton limit. `loc_old_bridge`
- **Front Street** (street; on the map). Front Street was the main street when the trucks still came through, and its stores closed one at a time after the bypass opened in 1994. Hours: Always open. `loc_front_street`
- **Riverside Cemetery** (cemetery; on the map). The town buried its dead here before there was a church to bury them from, and the Gentrys, the Sturdivants and the Pittmans each have a corner. Hours: Always open. `loc_cemetery`
- **The Water Tower** (tower; on the map). The town put the tower up in 1964 and painted it every ten years until the money ran out; the class of 2019 painted over the last coat. Hours: Always open. `loc_water_tower`
- **The Bluff** (highway; on the map). The highway came down the bluff in 1938 to meet the new bridge, and the state widened the switchbacks in 1971 after a log truck went over the rail. Hours: Always open. `loc_bluff`
- **The River Road** (road; on the map). It was the road to the ferry landing before there was a bridge, and the county paved it in 1961; downstream it runs past Riverbend to the public ramp at Purvis Landing. Hours: Always open. `loc_river_road`
- **The Mangum House** (house; a home to find). It was Inez Crocker's house for forty years; her daughter Mavis and Dewayne Mangum moved in to look after her in 2021 and stayed after she died. Hours: A private home. `loc_mangum_house`
- **The Pittman Place** (house; a home to find). Royce and Darlene Pittman built the ranch house in 1998 on a lot behind the station that Clyde Pittman gave them as a wedding present. Hours: A private home. `loc_pittman_place`
- **The Parsonage** (house; a home to find). The church built the parsonage in 1952, and the Dees family has lived in it since Ray took the pulpit in 1994. Hours: A private home; the pastor answers the door at any hour. `loc_parsonage`
- **The Lott Trailer** (trailer; a home to find). Tammy Lott has rented the single-wide since 2008, and Amber grew up in its front bedroom. Hours: A private home. `loc_lott_trailer`
- **The Apartment over Byrd's** (apartment; a home to find). Hollis Byrd raised his daughter Renee in these two rooms and has rented them by the month since she left; Nikki Ballard moved in two years ago. Hours: A private home. `loc_byrd_apartment`
- **The Haskins Farm** (farm; a home to find). The Haskins family has farmed here since 1931 and has leased the Sturdivant bottomland since 1960. Hours: A private home. `loc_haskins_farm`
- **The Overstreet House** (house; a home to find). Gerald and Jolene Overstreet bought the yellow house in 1991, the year they married, and Annette moved back into her old room in 2022. Hours: A private home. `loc_overstreet_house`
- **The Gentry House** (house; a home to find). Asa Gentry built the house in 1890 with ferry money, and it is the oldest building in town; Elbert was born in it in 1938, the year the ferry ended. Hours: A private home; Elbert is on the porch most evenings. `loc_gentry_house`
- **Clayburn** (town; out of town: twenty-six miles north up the state highway, about forty minutes by car). Clayburn took the county seat from Lockett's Ferry in an election in 1871, and Elbert Gentry still says it was stolen. Hours: Courthouse 8 to 4:30 on weekdays. `loc_clayburn`
- **The Sheriff's Office** (office; out of town: in the courthouse basement in Clayburn, twenty-six miles north). Sheriff Hoyt Bramlett has run it since 2006, and his deputies and the Lockett's Ferry police have not trusted each other since an arrest at the bridge went wrong in 2011. Hours: Open day and night. `loc_sheriffs_office`
- **The County Home** (care; out of town: four blocks off the courthouse square in Clayburn, twenty-six miles north). It opened in 1968 to replace the county poor farm and has been short of staff every year since. Hours: Visiting 1 to 7 every day. `loc_county_home`
- **The County School** (school; out of town: on the north edge of Clayburn, fifty minutes on the school bus). Children from Lockett's Ferry have ridden the bus to Clayburn since 1987. Hours: School days 7:45 to 3:15. `loc_county_school`
- **The Old County Hospital** (hospital; out of town: on the south side of Clayburn, twenty-six miles north). It opened in 1952, delivered most of the people in Lockett's Ferry under seventy, and closed in March 2019 when the company that bought it went bankrupt; June Satterfield nursed there for twenty-six years. Hours: Closed. `loc_old_hospital`
- **Calder** (city; out of town: forty miles north, past Clayburn on the state highway, about an hour). Calder grew on the railroad and the paper trade, and it has been taking Lockett's Ferry's young people and business for sixty years. Hours: A city. `loc_calder`
- **Calder Regional** (hospital; out of town: forty miles north in Calder, an hour by car and longer by ambulance). It took over the county's patients when the old county hospital closed in 2019. Hours: Emergency room open day and night. `loc_regional`
- **The Willows** (clinic; out of town: on the edge of Calder, forty miles north). It opened in 2015 in the old Willows motel and is where families from three counties send the people they cannot help any more. Hours: Visiting Sundays 1 to 4. `loc_treatment`
- **The State Penitentiary** (prison; out of town: a hundred and forty miles north, three hours each way). Half the men in Lockett's Ferry over fifty know someone who did time there, and Dale Purvis has been there since 2018. Hours: Visiting the second and fourth Saturday, 9 to 3. `loc_state_pen`
- **The Sturdivant Bottomland** (fields; out of town: five miles downstream on the river road, ten minutes by truck). Amos Sturdivant bought the bottomland in 1924, and the Haskins family has farmed it on a lease since 1960. Hours: Private land. `loc_bottomland`
- **The Sturdivant Timber** (woods; out of town: upriver and inland, twenty to forty minutes by logging road). Harlan Voss bought most of it in the 1980s and died out there in 2014; Dwight Spann's crew cuts it now. Hours: Crews work dawn to dusk, six days a week. `loc_timber`
- **The Old Paper Mill** (mill; out of town: nine miles downstream on the river road). The mill opened in 1958 and kept Lockett's Ferry going for fifty years; Gerald Overstreet ran its paper machines for thirty-three of them. Hours: Closed. `loc_paper_mill`
- **The Bypass** (highway; out of town: twelve miles east; the long way round to the dry county takes forty minutes). It opened in 1994 after a fight that split the council three to two; Loretta Gaddis and Clyde Pittman led the side that lost. Hours: Always open. `loc_bypass`
- **The Dry County** (county; out of town: across the old bridge, over the state line). It voted itself dry in 1907, and somebody in Lockett's Ferry has made money on the difference ever since. Hours: Always open. `loc_dry_county`
- **The Coast** (coast; out of town: three hundred miles down the river, a long day's drive). Towboats have run down the river to the coast since before the bridge, and the deckhands still talk about it as the end of the line. Hours: Always open. `loc_coast`

## Loose ends

Each loose end the player picks binds to someone in the cast: a free person carrying the tag of the option they kept, else the loose end's own tag (picked with the seeded dice, never someone already tied to another loose end while anyone else is left).

- **A debt** (lender: Carter Sturdivant, Hollis Byrd; collector: Leon Varner; bookie: Curtis Pruett)
- **An enemy** (enemy: Boyd Teague, Jodie Strayhorn; parolee: Boyd Teague)
- **A secret** (informant: Tyler Rasberry, Glenda Pryor, Shayla Rawls)
- **Someone lost** (records: Jolene Overstreet, Ray Dees, Nadine Dees, Pearl Gentry)
- **A promise** (bartender: Loretta Gaddis, Lyman Coker)
