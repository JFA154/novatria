# Lockett's Ferry: the manual

Everything the game does, for players. The README has the pitch, the
five-minute quickstart ([How to play](../README.md#how-to-play) and
[Do and Say](../README.md#do-and-say)) and updating an older game; saves,
costs and everything for maintainers are in [MAINTAINING.md](MAINTAINING.md).
A "see X" below names a section of this file unless it says otherwise.

- [Character creation](#character-creation)
- [Places and the map](#places-and-the-map)
- [The cast](#the-cast)
- [People](#people)
- [Journal](#journal)
- [Objectives](#objectives)
- [Character](#character)
- [Time](#time)
- [The story moves](#the-story-moves)
- [Settings](#settings)
- [Accessibility](#accessibility)
- [Commands](#commands)

## Character creation

On a phone creation is five steps; on a laptop, one page. **Random
character** at the top fills in every step (a name nobody in town has, a
background, maybe a moved stat point, a suggested goal, a flaw and three loose
ends) and goes to the summary, where everything can still be changed.

- **Background and age.** The background step also asks your age, 16 to 90.
  Each background starts at its own age (a veteran at 34, a dropout at 19, a
  fired bookkeeper at 38, a river deckhand at 36, a group home kid at 18, a
  poker hustler at 31) until you type your own; the summary card and the
  Character tab show it beside your name ("Tomas Reed · 34"), and the narrator
  and the parser hear it every turn. Each background starts with three things,
  one of them the prepaid phone, and someone in town has a first job or
  question for it, raised when you are first with them: Chief Marcus Bell for
  the veteran, Dewayne Mangum for the dropout, Hollis Byrd for the fired
  bookkeeper, Wade Purvis for the river deckhand (from day 2), Nadine Dees for
  the group home kid and Curtis Pruett for the poker hustler.
- **Stats.** Might, wits, charm and stealth are tiles, each with a line on
  what it is for, and − / + steppers: you take one point from one stat and
  give it to another.
- **Goal and flaw** share a step. The goal has six suggestions from the
  town's own stories to tap, or you type your own.
- **Loose ends.** Pick three kinds. Each is one line you can edit, with the
  kind's three options as suggestions to tap (each shows its first words;
  tapping it puts the whole line in the field). Each option means someone in
  the cast (see The cast and The story moves).

Random character over a form you have started asks first (Keep mine or
Replace it). **Review character** with something missing says what to fix
and puts you on the first field to fix.

## Places and the map

The map starts with the town's fifteen public places, from Pittman's and the
Low Water to Front Street, the Water Tower, the Bluff and the River Road. The
cast's eight homes (the Mangum House, the Pittman Place, the Parsonage and
the rest) start off the map until someone tells you about one ("Dewayne's is
the white house about a mile up the river road"), or something you are told
names it (Nadine's supper invitation names the Parsonage): then it appears on
the map, in the Places list and on the roads, with a quiet "Added to the map"
line, dashed and marked "heard of" until you visit. A place the town does not
have (a fishing camp up the creek) is added the same way, at most one a turn
and twelve a game. Walking to a place nobody has told you about yet says
"You don't know where that is yet. Ask around." and spends nothing.

Each label sits where it hides the fewest markers and other labels; where you
are shows as a ring and a bold label. **Expand map** (phone and laptop) opens
the map larger, over everything else, filling the screen below its bar: a
phone covers it and pans (sideways held upright, up and down on its side), a
laptop shows the whole town with land to the edges, and after a resize or a
turn of the phone it is drawn again, centred on you (Close map or Escape to go
back).

**Places tab.** Under the map, **Places you know** lists every place you have
been or heard of, with what kind of place it is in words (Gas station, Trailer
park, Big house, Town hall, Bluff), and **Exits from here** only the places you
know of (a home nobody has told you about is no exit yet). Tap a place to open
its sheet: what it is, what you notice inside, when it is open ("Closed
Sundays" beside the hours, unless the hours already say so), how it came to be,
who lives, works, drinks or is buried there and who is there now. Each exit and
each sheet has a **Go there** button, the same Do turn as tapping the place on
the map and then its "Go to" chip ("I head to the Low Water."). A place shut
today is marked "(closed today)", and one you are barred from says "You are
banned until Day 9." (you are welcome again on Day 9); walking to either is a
walk to a shut door, and the narrator is told why. A place shut for the day
(the Low Water on a Sunday) holds only the people who live there (and anyone
who came to find you) and no card game, and a night there is rough unless a
friend lives there, or owns it and is there (see Time).

**Out of town.** Fifteen more places are written into the town because
people talk about them: Clayburn, the county seat (the sheriff, the county
home, the county school), Calder with its hospital and the Willows, the state
penitentiary, the Sturdivant bottomland, the old mill, the bypass, the dry
county across the bridge and the coast. They are listed under **Out of
town** with how far away they are and their history, but the story never
goes there. Asking to go costs nothing and says so: "Clayburn is out of town
(...). The story stays in Lockett's Ferry: you can talk about it, but you
can't go there."

## The cast

Everyone who can appear in Lockett's Ferry is written by hand: 41 people in
`TOWN_DATA` in `index.html`, in households (the Mangums, the Pittmans, the
Deeses at the parsonage, the Overstreets, the Gentrys, the Haskins farm, the
Lotts' trailer, the Sturdivant house, the motor court's long-stay rooms) and
the regulars, staff and loose-end people around them: a dispatcher, a
day-shift officer, a retired nurse, a teacher, a farmer, a bookie, a repo man,
a parolee, a waitress with a grudge, teenagers and an old-timer. Each one has
pronouns, a real job or place in town (never just "man" or "woman"), a look, a
voice, two traits, a goal, a secret, how they feel about strangers, who they
are to whom (written on both sides: Mavis Mangum's husband is Dewayne, and
Dewayne's wife is Mavis), a home, a place in every phase of the day, an age
that fits their look and their family (a parent is 16 to 60 years older than
their child), and a history of two or three sentences: where they come from,
what happened to them and how they came to be where they are. The council has
five seats: Mayor Jolene Overstreet, Royce Pittman, Lamar Haskins, Hollis Byrd
and Elbert Gentry.

**Everyone the town mentions exists.** Anyone the written town names, even
once, is a record: 25 more people who never appear. Eight are dead (Clyde
Pittman, who died at the pumps in 2009; Amber Lott, at nineteen), each with
when and how they died and where they are buried. Seventeen live elsewhere
(Dale Purvis in the state penitentiary, Leah Dees at the Willows), each with
where they are and how they can be reached: they can be talked about, called
or written to, but they never walk in. `tests/mentions.cjs` fails the town
check on any capitalised name, "the <kind of place>" or made-up crowd ("two
other boys", "the night clerk") in the content that is not a record.

**The town has a past.** The narrator is told how Lockett's Ferry came to be
(the ferry, the 1938 bridge, the school, the bypass and the mill leaving),
eleven things that happened in the last three years (from Ruth Haskins's
death in January 2024 to the council setting its bridge vote in September
2026), and every place's history and hours. The story starts on Thursday 8
October 2026.

`docs/CAST.md` is the roster, by household, then the people who live
elsewhere, the dead, the town's history and every place; it gives ages and
histories but leaves out looks, goals and secrets, so it spoils nothing.

- **The game never makes a person up.** Not the narrator, not the parser, not
  the bookkeeper, not the loose ends, not a story point. Anyone the story or
  you mention is one of the cast or does not exist (see People). A `/fact` can
  make something true about someone in town ("the mechanic owes me a favour")
  but cannot add anyone. A narration that names someone or somewhere the town
  does not have ("Miss Earline says", "at the Shack") is sent back to be
  written again; a brand or a regional word ("a Mountain Dew", "a John Deere
  cap", "the Saints", "Red Seal is cheap here.") is not a name and passes,
  and neither is a common word at a sentence start ("Silence answers."),
  what a sign, a cap or the radio "says" ("The sign says Closed") or an
  adverb before a name ("Slowly Royce nods"). Two unknown words the story points at as someone ("You notice Earl
  Hux at the bar"), a first name and a surname before what a person is or
  does ("Earl Hux is cheap, Royce says.", "You watch Earl Hux playing
  pool."), and a name a person says ("Royce finally says Darnell took it"),
  are a name.
- **The narrator knows everyone.** Every narration carries the town (history,
  recent events, places) and the whole cast (one line each: "Mavis Mangum
  (41, she/her; ...)", with ties, usual places and history; then the dead and
  the people elsewhere) as cached system blocks, so a person the story
  mentions is always the same person.
- **Loose ends are people in the cast.** Each option you keep ties to the
  person its words mean: the card debt to the man who runs the card game,
  the title loan to the repo man, the letter to the young woman it is
  addressed to, the girl who died in August to the people who loved her.
  Words you write yourself tie to someone who fits the kind. Nobody is tied
  to two loose ends while anyone else is free.
- **Homes to find.** The cast's eight homes start off the map and appear
  when someone tells you where a person lives (see Places and the map).

## People

People know about you only what they have seen since you came to town and
what their own memory list says (someone from a loose end, like a creditor,
remembers the past you share). The narrator is told this every turn, with how
long you have been in town, and on your first day a spoken line that invents
a past with you ("I've known a while", "he called me last night") is sent back
to be rewritten.

### Who people are to you

**The narrator knows who people are to you.** Every turn it is told your goal
and flaw, the traits of each person here and what they want (never to be
said outright), your loose ends from the other person's side ("tied to you by
a debt"), the town's open stories and what you owe, and the latest town news.
So the man you owe money greets you as the man you owe money, from the first
turn. Someone's secret reaches the narrator only after a social roll aimed at
them succeeds, once they trust you and know you (trust 40 and knows-you 30),
or when a threat that worked has left them badly afraid of you (fear 60);
nobody under 18 gives one up out of fear.

The People tab lists who is here now, who you have met, with where they stand
with you, where you last saw them and what they remember, then the people you
have only heard of. A search box at the top (name, job, or a place you saw
them or they live) stays put while the list scrolls, and the people you know
can be sorted by last seen, how they feel or name. Everyone has an age and pronouns
(he/him, she/her or they/them), shown beside their name on the card ("Mavis
Mangum · 41", she/her), and the narrator gets the same age and pronouns right
after each person's name, so the story and the sheet always agree. An open
card also shows their age, home, ties ("Ties: wife Mavis Mangum; boss Royce
Pittman") and history, and what is up with them today: "Hurt until Day 5"
(about again on Day 5; it stands alone, with no note of where they would
have been, and the narrator is told the same), "At the county school in
Clayburn until evening", "Banned you from the Low Water until Day 9"
(welcome again on Day 9). Someone
the story names who is dead or lives elsewhere (Clyde Pittman, Dale Purvis) is
listed under **Gone** or **Elsewhere** once their name comes up, with when
they died and where they are buried, or where they live and how to reach them;
both groups start folded away and open for a search that finds someone in
them. If the sheet has someone wrong, open their card and tap the right
pronouns (or type `/pronouns Mavis she`): the story follows from the next
turn, and a relation that carries a gendered word turns with it ("Dewayne's
husband" becomes "Dewayne's wife"), as do their ties wherever they are shown,
on the cards and to the narrator (after `/pronouns Mavis he` she is "husband
of Dewayne Mangum, son of the late Inez Crocker", and Dewayne's card reads
"Ties: husband Mavis Mangum"; they gives "spouse", "child", "parent",
"sibling"), and the look and voice lines ("A man with a bitter look about
him." becomes "A woman with a bitter look about her."; words in quotes are
left alone).

### Where they stand

**Where they stand, in words.** A card's row says where someone stands with
you, never a number: "warm to you", "sizing you up", "suspicious of you",
"afraid of you", "fond of you, doesn't trust you", tinted by the side it
falls on (on yours, mixed, against you), with one thing more beside it
("owes you", "uneasy around you", "has something on you"). Open the card and
it says why: up to two things they remember, each with its day and how it
was made good if it was ("You called him a cheat in his own shop. Day 2 ·
you apologised"), what is held between you ("You know: runs the landing's
cash through his pawn books."), what is owed either way, their ties and
notes. Something they heard through someone the town doesn't know they are
close to names what you did and when, and no more: "Cooler since you shamed
Royce Pittman at Pittman's Gas and Service, Day 4. Hasn't said why." (a
report that went that way shows only its day: "Cooler since Day 3. Hasn't
said why."). **More** opens each side of it
in a word, all seven for an adult: Likes you, Trusts you, Scared, Knows
you, Spark, Romance and Owes ("owes you one", "even", "you owe them a
lot"); for anyone under 18, and for everyone when you are, the five that
apply, never Spark or Romance. Something said where you weren't stays off the
card until you see them again.

When someone you know crosses a line in how they feel about you, a quiet line
says so after the turn, at most two a turn, the one that matters most first,
one a person: "... won't forget that." (a serious harm, first-hand), "... is
afraid of you." or "... gives you room.", "... stops taking your word." or
"... takes you at your word now.", "Loretta Gaddis warms to you." or "...
cools toward you.", "... lets some of it go." (an apology or amends that
landed). Quiet lines also say what people come to want of you, what they hold
and what is owed ("Jodie Strayhorn is sweet on you.", "Hollis Byrd knows you
know.", "Burl Satterfield owes you one."), each status line at most once a
week a person. Overnight fading, `/undo` and your own edits print none.

### What people remember, and how they take it

**People remember what you did for what it was.** The game itself sees a good
deal and records it as what happened, not as a number: a blow in a fight, a
threat, a theft, money or a thing handed over, a debt paid or let go, a
promise kept or broken, a meeting kept or missed, being caught cheating at
cards, stepping in when someone was in trouble, and the turns you spend
talking to someone (once a day, a little warmer, and they get to know you).
Each person takes it their own way (pride, how guarded they are, their nerve,
how long they hold a grudge), and it changes more than whether they like you:
whether they trust you, whether they are afraid of you, how well they know
you. **A memory fades** by what it was: a sharp word in a couple of days, a
shove or a gift in about a week, a blow or a theft over weeks but never all
the way, a beating or a cheat for good. Fear fades in days. The small things
too slight to remember drift back two a day on days you don't see them; what
you set in the editor and what was true before you came never drift.
**People who saw it** take a lighter copy, one for the whole scene however
many blows they watched, which fades faster and leaves nothing behind: the
people it happened to don't recover the way bystanders do. Something done in
front of two people or more, or that makes the news, moves the town's opinion
of you (at most 5 a turn), and when three people in town are afraid of you
the town's word for you is **feared**. Someone afraid of you (not a hard man,
never anyone under 18) does a small thing you ask with no roll; the dice
still turn over, so nothing else in the game shifts. A shop that is against
you won't sell to you for three days, then charges you a quarter over; a bed,
gas or a meal is never refused for more than one night.

**How people take what you say.** What is said is the bookkeeper's to name,
as a neutral witness would: an insult (a humiliation when two or more others
hear it), an apology, a lie caught, a confidence shared or kept, a compliment,
prying, help or a favour, a claim you made ("says she is a surveyor from the
state"). It names one of 22 things and the memory in a few words, never a
number, and the game checks each one before it counts: the person has to be
here; a caught lie needs a lie or a claim of yours on record, a kept
confidence one given a day before and someone else there who asked, an
apology to land (a roll that worked, or they are not against you); anything
else is written down as something smaller or not at all. At most two of
these count for one person in a turn and four in all, the heaviest kept, and
none ever stands in for what the game saw itself. An apology that lands
softens what it names, or the latest harm of the last three days (liking
halved, trust eased a quarter); one that does not land only shows them a
little more of you. **Trust now decides things.** A lie to someone who distrusts you is harder (hard at trust
-25, very hard at -50, and 1 or 2 off the dice), and one to someone who
trusts you (40) goes down easier; anyone against you is at least hard to ask
for anything. A couch for the night needs liking 25 and some trust (or that
they owe you); a favour needs liking 50 and trust 20, and an alibi or a
loaned ramp more trust still; nobody at trust -25 or below passes you a
rumour (a gossip tells anyone), and at -40 or below nobody deals you in or
sits at your table. The bookkeeper is told each person's stance toward you
("sizing you up", "suspicious of you") and their latest few memories of
you, to name an apology or a caught lie after; the parser is told the stance
and how hard a lie to them is.

### Nobody under 18, and no coercion

**Nobody under 18.** Nobody under 18 is ever part of a romance, whatever the
story or a model says, and the game decides this before the story is told.
Every turn someone under 18 is in the scene, the narrator is told their age
and that any romantic or sexual advance is unwelcome and alarming: they are
uncomfortable and get away or go to their parent. A flirt or more aimed at
them (the parser's flag, the words themselves, or the bookkeeper naming it,
with two of those pointing at someone named) is an unwanted advance: they
hold it against you as the worst kind of harm, and fear of you buys nothing
from them; their parents (or, with none in town, Chief Bell) hold it against
you too, each parent reports it to the police, and the town's opinion of you
drops 10, outside the usual cap of 5. With the department gone the report
goes to the sheriff in Clayburn ("A deputy from Clayburn came by asking about
you."). One signal alone, a remark that might have been meant that way, is
only noted ("said something that made me uncomfortable"). A hit or a threat
on someone under 18 is reported the same way. A threat or blackmail inside a
romantic ask, aimed at anyone, is coercion: no roll and nothing given, they
refuse and leave or call for someone, and it is reported. If you are under
18, or an older save has no age for you, nobody in town flirts with you or
takes a flirt from you as one, and nothing intimate is ever answered yes. An
intimate scene between adults fades to black before anything explicit.

**However the line is put.** The coercion rule holds however the line is
put: a romantic line at someone afraid of you (fear 40 or more), or someone
you hold something over, is refused as coerced whether you say it, walk them
to a motel room, or hand them a gift. Every person named is checked, and a
threatening line to the whole room is refused by every adult there (one -10
to your standing). A clean theft nobody saw may still be noticed a day or
three later.

### Wanting and romance

**What people hold: wanting, leverage and favours.** Everyone over 18 can be
interested in you, and some are easier to win over than others: Jodie and
Shayla are easy, the other ten on the town's romance list (Travis, Curtis,
Trent, Nikki, Annette, Carter, Lamar, Glenda, Colt and Tyler) normal, and
everyone else hard, each at their own pace and once they know you well
enough. A flirt rolls charm against how hard they are, easier as they warm
to it (one step easier once there is a spark of 20, two at 40), and how
well they like you helps or hurts the dice as it does when you persuade
them: "Charm 14 + 1 = 15 vs 15 · Success". The roll decides before the
story is told: a success and they are open to it ("Shayla Rawls is open to
it"; a 20 sparks more), a near miss and they turn it aside, kindly, with
nothing lost, a failure and they aren't interested, which costs a little,
the next ones more (a 1 is awkward, and they remember it). Before they know
you well enough a flirt is only turned aside, kindly, with no roll: the
first time costs nothing. A flirt goes to the one it was aimed at: "kiss her" is aimed at the one woman
in the room (or the one the story just walked in); a flirt the game cannot
place goes to whoever the bookkeeper names, if they are there; and it never
goes to everyone unless you say it to everyone.

Wanting and caring are two things. A **spark** is wanting you; **romance**
is caring about you that way, and each is kept on its own. A flirt is
mostly spark (romance only a little); romance grows out of wanting plus
substance: time together, a confidence either way, a favour, standing up
for them, getting them out of trouble, a word kept, each counting only
once they have noticed you (a spark of 20), so flirting alone never makes
anyone sweet on you, and kindness to someone who doesn't want you is just
kindness. Turning them down, a lie they catch, a broken word or a
confidence betrayed costs romance, and it fades over weeks where a spark
fades in days. How they stand reads both: "looks at you twice" (a spark),
"wants you" (a strong spark and little romance), "using you" (the same
from someone who has reason not to trust you, or cares only for money),
"sweet on you" (romance), "falling for you" (a lot of romance and a strong
spark). A partner who sees you flirt with someone else cools, and someone
who wanted you loses a little of both. A night together needs everything
at once: both of you adults, someone who knows you well enough, a strong
spark, romance, trust and knowing you; then it fades to black and they
remember it, with no roll. One short rolls as a flirt, and if it lands it
is "not tonight", said kindly. A beating or worse halves a spark and a
romance, and a spark fades in days unless it is fed. Nobody under 18 has
either, ever, and with you under 18 nobody does.

### Leverage and favours owed

**Leverage** is knowing something about someone. A secret the narrator was
given (a social roll that worked, or trust) counts only when the story shows
it, two of its own words in the narration, and then you hold it ("Hollis
Byrd knows you know."); a true rumour about someone is one too, held
privately ("You have something on Mavis Mangum now."). Someone you hold
something over is uneasy around you and won't go to the police about you. An
intimidation that uses it in your own words needs no roll at all (the dice
still turn over); name a price and they agree to pay it tomorrow, never on
the spot, up to what they can raise ($100, Hollis and Jolene $300, Curtis
$200, anyone under 18 nothing), unless they are hard (they refuse and talk
or report it) or tough (they come for you). Once paid it is paid: a second
demand only costs you. Tell anyway and it is spent: they hold it against you
for good, the police bar lifts, and a crime told to the police it matters to
sends the chief looking (an inquiry, never an arrest). It works the other
way too: someone who catches you at something with nobody else there holds
it over you, and so does your secret loose end's informant from the start.
Pay their price and they keep quiet; miss it and they tell; hold something
over them as well and neither of you moves ("Glenda Pryor lets it drop.").

**Favours owed.** Two favours done for someone and they pay you back unasked
within a few days, in cash only if they like and trust you ("Burl
Satterfield is square with you."); a favour you owe someone, they ask for
back, twice, and then hold it against you.

### Word gets around

**Word gets around.** People are tied to each other: every relation the cast
has (a wife, a son, an uncle, a boss, a tenant), friends, people of one
faction, and some the town doesn't know about. What you do to someone
reaches the people close to them, once and no further: a wife or a husband,
and anyone else of the family under the same roof, hears that night (the
motel and the trailer park are not one roof); other family, a boss and the
people they work for by the next morning; a friend, a lover or a rival the
next time they see them, or within two days, or the next morning if it made
the town's news. Hit Dewayne Mangum in his bay at Pittman's and Mavis, his
wife, hears it that night: the next morning "Word got round: Mavis Mangum has
heard about Pittman's.", and her card is "Cool to you", with what she heard
and its day; apologise to him and that reaches her the next night too. How
much carries depends on who it is to them (a child most, a landlord least)
and how they feel about them: someone who can't stand the person you hurt
warms to you for it (never the police over a crime, nor the pastor over a
beating), and someone who saw it happen takes it at once, on top of what any
bystander would. Small things go into how they feel without a memory and
without a line; anything more is a memory one class lighter than the one the
person it happened to keeps, and one line in the morning names who you know
has heard ("Word got round: Lorna, Colt and Wade Purvis have heard about the
landing.", up to three names, then "and others"). **A tie the town doesn't
know about** carries it all the same and nobody says why: shame Royce
Pittman at his own counter and Loretta Gaddis is cooler with you the next
time she sees him, and her card says "Cooler since you shamed Royce Pittman
at Pittman's Gas and Service, Day 4. Hasn't said why." That is a clue: who
would care about Royce that much? A rumour heard or a secret you hold that
names it shows you the tie, and from then on she is cooler for the reason
she is. When someone in town is arrested, their family turns against the
officer who did it.

**Secrets between people.** What you hold over someone can change how
others see them. Tell Dewayne Mangum what Mavis did with the garage money
and his trust in her drops from 60 to 15 then and there; she hears who told
him that night (a husband or wife and anyone under the same roof
overnight, family and work by the next morning, anyone else when they next
meet), takes it as the worst kind of harm, and turns against you: the
motel she runs is suddenly full. The one you tell trusts you a little more
for it, unless they love the person it is about (60 or more): then they
take it out on you instead. A second secret about the same person to the
same listener costs you their trust. Some secrets set something going
(Tammy Lott, told whose pills killed her daughter, goes after Colt Purvis).
**Badmouthing and vouching.** Run someone down to a listener, or speak up
for them, and if the persuading works (the roll), the listener's liking for
them moves: 10 against, 8 for, as far as the listener trusts you (all of it
at trust 50, none at -50), once a day for the same two people and 20 in all
from your words; badmouthing someone to a listener who likes them at 40 or
more costs you 5 of the listener's liking instead. Either way they know you
a little better. **What the narrator is told between two people.** When two
people here have a tie you saw change, and the town knows of it, the
narrator gets one line ("BETWEEN THEM: Dewayne Mangum and Mavis Mangum,
strained since the garage money (Day 5).", two pairs at most); a tie the
town doesn't know is never told. Their cards say it too: Dewayne's Ties
read "wife Mavis Mangum, strained since Day 5".

### Editing people

**Editing people.** Anything else wrong about someone, you can fix yourself:
open their card (anyone you have met, or heard of) and tap **Edit** beside the
pronouns, or type `/edit Mavis`. The form has their name, age, pronouns, role,
up to three traits, how they feel about you (seven sliders, each with its
word as you drag: Likes and Trusts from -100 to 100, Scared and Knows from 0
to 100, Spark and Romance from 0 to 100 for every adult, held at 0 and shut
for anyone under 18 and left out when you are under 18, and Owes you from
-3 to 3, the favours between you, for everyone), who
they are to whom, their home, whether they are free, arrested, gone or dead,
and what they remember about you (each line keeps what it was, shown beside
it, and a line you add picks what it was from a list); what is held between
you can be deleted, and then it is gone for good. Look, voice and history sit
folded under their own heading, and their goal and secret under "Hidden from
you". A number you set stays exactly as set; deleting a memory leaves the
numbers where they were. **Save** checks
everything first (a name someone else has is refused with the reason, and the
form stays as typed), changes only what you changed, and says so in the story
("Edited Mavis Mangum: pronouns, role, home."); Cancel or Escape leaves them
as they were. One `/undo` takes a whole edit back. Editing waits while a turn
is running.

### The cast in play, and rumours

**People the story names are the cast.** When someone mentions a person
("his wife's gonna be thrilled", "my wife Mavis works the night counter"),
that is someone already written: Dewayne's wife is Mavis Mangum, with her
own name, job, voice and home, and the narrator has known her from the
first turn. Nobody is added to the game, however the story phrases it, and
the bookkeeper is not even asked for new people.

**People you ask for are the cast's.** Asking for someone finds them in the
cast by name, by what they are ("the cop", "the preacher", "the kid", "the
old man", "the dispatcher"), by who they are to someone ("Colt's dad",
"Kaylee's mom", "Dewayne's wife") or by title ("Mrs. Pittman"), and someone
here comes first. If they are somewhere else right now, the narrator is told
they are not here. Someone nobody in the cast answers to ("the guy at the
counter") is simply not there: the narrator is told they do not exist in this
town, nothing is rolled from tables and no call is made. Asking someone about
a person or a place ("ask Loretta about Wade") is talk about them, not a
search for them.

**Rumours spread.** Each of the town's starting rumours has its source and at
least two other people who can pass it on, and from day 3 the town's gossips
and the source's own household can tell it too. Hearing a rumour can show
you the story it belongs to (it joins the Journal's threads).

## Journal

The Journal tab has five parts:

- **Story so far**: the town news you have heard, with its day, and the
  chronicle (the summary of older turns), newest first.
- **Leads**: every rumour you have heard, with who told you and when
  ("Loretta Gaddis told you, Day 2").
- **Threads**: the town's stories you know of, open, resolved or failed, with
  the people each one links as buttons that open their People card.
- **You owe / are owed**: each obligation with its day ("due Day 7 (2
  days)") and what is paid so far, red once it is overdue. A missed debt,
  blackmail or undelivered letter stays here ("missed Day 7, still owed")
  until you make it good; it is struck through once it is settled
  ("Settled", or "Settled late") or can no longer be ("Dropped": a blackmail
  in a standoff, or one you came clean about). What people owe you for
  keeping quiet is here too ("Hollis Byrd: $300 for keeping quiet, due Day 4
  (tomorrow)"), struck through, Settled, once their money comes.
- **Notes**: the lines the bookkeeper writes each turn, with the day and
  phase.

`/recap` (or Recap in the ⋯ list) prints the gist in the story with no API
call, under the heading "Where things stand", one line each with its kind in
bold: where and when, **Here**, **Open** (the threads you know), **Asked of
you** (what people asked of you in the story and when it comes due, one line,
only when there is something; see Objectives), **Owed** (due
days, missed ones still owed ("missed Day 7, still owed"), part payments, and
what people owe you for keeping quiet: "Hollis Byrd: $300 for keeping quiet,
due Day 4 (1 day)", and favours either way: "Burl Satterfield owes you one",
"you owe Lorna Purvis one"),
**Warm to you** and **Cold to you** (three each, among people you have met, are
tied to by a loose end, or who remember something of you; with where they
stand and at most one reason that fits the side: "Royce Pittman (warm to you:
you bought him a round)", "Mavis Mangum (against you: you told Dewayne about
the garage money)", "your loose end: a debt"), **Careful** (three at most:
someone mixed about you, fond but not trusting, using you, afraid of you or of
what you know, or holding something over you: "Glenda Pryor (has something on
you)"), **Heard** (the last three rumours) and
**In town** (the last two news items, by day). Here and Open are always there,
the rest only when they have something; long text is cut at a word with "…". It
also shows after Continue and after `/rest` (there without In town when
"Overnight in town" is just above it). Once the ending has been told, a second
line says "The story has reached an ending; you can keep playing.", and the
recap after `/rest` is just those two lines.

## Objectives

The Objectives tab, after Journal, keeps what you know you have to do, with a
grey line at the top: "What you know of. The story keeps the rest." Its label
counts what someone is waiting on you for ("Objectives · 4": things asked of
you, meetings and what you owe). Where the tab row is too narrow for every
label whole (a 320-pixel phone, or the laptop's panel with Debug on), the row
first tightens and then says "Goals" instead (narrower still, "You" for
Character). Five parts, each only when it has something, newest first:

- **Asked of you**: a favour or a job someone asked of you in the story, as
  the bookkeeper recorded it: who, what, by when ("by Day 6 (Tuesday) · in 5
  days", "when you next see Travis Cagle", "at the Low Water") and the reward
  or threat ("Stakes: $500 cash, and deny knowing him if caught"); "(no longer
  in town)" when the person has died or left.
- **Meetings**: a meeting agreed in the story and still to come ("Jodie
  Strayhorn at the Low Water, this morning (back door, half past ten)").
- **Owed**: what you owe and have not settled, with its day and how it
  stands ("by Day 3 (Saturday) · in 2 days · $150 paid"; overdue in red).
- **Threads you know of**: the open stories you know, title and summary.
- **Loose ends**: your background's loose ends still open.

Each entry opens (tap or click; on a laptop they start open) on its details:
the whole text, the person (a button to their People card when you have
one), the place, the day and, for something asked or agreed, the day and
phase it was said with that turn's journal line (or your words then). Nothing
here can be edited: an entry goes when the story settles it (what was asked
comes due, a debt is paid, a thread resolves), and `/undo` brings it back
with its turn. The People card says it too, under "Meeting you": "Asked you:
the outboard part from you by Day 3 (Saturday)".

## Character

The Character tab shows your name and age, background, stats, HP, cash, story
points with a **Spend** button beside them (it fills in `/fact ` for you to
finish), a **Standing** line for the town and for each faction,
your goal and flaw, **Grown** (the threads you resolved and what each gave
you, as its quiet line said), your conditions with what each does and how
long it has left ("Tired (−1 to all) · until you rest") and what you carry.
Standing keeps its words, and the town's moves only on what is done in
public (a fight in front of two people or more, a grudge or favour done in
public): word of it getting round the ties, what you say about someone to
one person, and a change between two people move none of it.

Story points: you start with 2 and hold at most 3. You earn one on a natural
20 and the first time a thread resolves (setting a thread back to open and
resolving it again earns nothing). Resolving a thread you know about for the
first time also makes you better: +1 to the stat the thread rewards (the
bridge vote charm, the police vote wits, the pills at Riverbend stealth; no
stat goes above +3), or +2 max HP (up to 16) when that stat is already +3.
A quiet line per thread says so: "Resolved: The bridge vote. +1 Charm." A
loose end's thread gives the story point only, no stat or max HP. A thread
settled by a town event you did not see is told, and earned, when you hear of
it (see The council meeting): until then the Journal, the recap and the
narrator still have it as you last knew it, open and with its old summary.
One the ending settles changes, and is earned, after the ending's narration
(a thread the ending tells you of joins the Journal then), and an ending that
could not be told holds its Resolved lines, and the Journal, until it is.

## Time

A day has four phases: morning, afternoon, evening and night. The top bar
shows the weekday, day and phase ("Fri · Day 2 · Evening"; on a phone under
the place, beside HP and your cash, which a very narrow phone puts on a third
line), and the story's dividers the same ("Day 2 · Friday · Evening"). A
short action (minutes to half an hour: a walk across town, a search, a chore)
takes a third of a phase, so three of them move the clock on. A long one (an
hour or more) takes a whole phase. Talking and looking take only moments, but
the clock follows talk too: every six of those instant actions make a short. (The narration of
`/rest`, `/wait`, `/skip`, an arrival, a defeat, an arrest or an ending does
not count.) The town moves on at every change of phase.

The top bar shows how far into the town's three weeks you are ('Thu · Day 3
of 21 · Morning'; on a phone 'Day 3/21'); once the ending is told it reads
'Day 22, after the ending'. On a laptop the next town event still to come
sits beside it ('council meeting Tue, Day 6').

**The calendar.** Day 1 is Thursday 8 October 2026, in autumn, and the
narrator and the parser are told the weekday and date every turn ("DAY 2
(Friday 9 October), EVENING"). The town keeps to it. The Low Water and Byrd's
Pawn are shut on Sundays. Annette Overstreet, the teacher, and the three
teenagers (Kaylee Pittman, Austin Lott and Micah Dees) are at the county
school in Clayburn on weekday mornings and afternoons, so they are nowhere in
town then, and their People cards say where they are. The council meets on
Tuesday evening, day 6 (see The story moves).

**Night lasts until you sleep.** Short actions never carry the clock from
night into morning: after the third one it stays at night, late, however long
the scene runs. Something that takes hours at night (waiting until last call,
a long talk out back) lands in the small hours, still that night, with the
people of the scene still there; a second such thing brings the morning, with
no sleep. Morning also comes when you `/rest` (sleep), `/wait morning` or
`/skip` ahead. `/wait` and `/skip` arrive at the start of the phase you asked
for. The narrator and the bookkeeper are
told where in the phase the scene is (early, mid or late), at night that you
have not slept yet, and on a morning you reached without sleeping that you
had no sleep last night.

**Sleep.** Where you sleep matters. A bed heals 3 HP; sleeping rough heals 1
and leaves you Stiff (-1 might) for the day. A bed is a night you paid for at
the motor court (buy "a night at the motel", $49; sleeping there uses it), or
anywhere someone who lives there and is there now or tonight, or owns the
place and is there, likes you (attitude 25 or more: Loretta's couch at the
Low Water; not Hollis's pawn shop at night, when he is fishing at the
landing). Anywhere else is
rough, and so is a place shut that day unless that friend lives or is there.
Two nights running sleeping rough in the same public place (Town Hall, the
church, Front Street; not a place someone lives, such as Loretta's Low
Water), Chief Bell finds you the second morning and tells you to move along,
and remembers it. A third night running there, or the next time he finds you
like that, costs a $25 fine (or the cash you have, or nothing when you have
none). A bed, a night awake or a night in the holding cell starts the count
again, and once more than a week has gone by since he last found you he lets
it go: the next time is a warning again. A morning you
reach without sleeping leaves you Tired (-1 to everything) until you rest.
Being knocked out until morning in a defeat is not a night without sleep.

When time passes while you stay put, anyone who arrives at or leaves your
place is worked into the next scene as it happens: a truck pulling in, a
door, a goodbye. A `/wait` over several phases tells who came and went
between where it began and where it ends. When that next scene is a hand of
cards, the people who sat at the table for it are not told as arriving
after it; anyone else who came in still is.

## The story moves

### Loose ends and what you owe

**Loose ends that know you.** The person each loose end ties to knows you from
the first turn, and comes to you in the first week or so: the creditor on day
3 or 4, the person from your past on day 4 to 7, and so on. Someone you
wronged comes back three to five days after that first meeting and hits you
twice (-2 HP, and Bruised ribs, -1 might, for two days), unless that loose end
is settled by then or they no longer dislike you: then they pass you close and
keep walking. Some come with a number and a day:

| Loose end | What you owe | Due |
|---|---|---|
| A debt | $600 to the lender, $300 on the title-loan note, or the $400 card debt to Curtis Pruett, by the option you kept | three days after they come to collect |
| A secret | $200 for the blackmailer's silence (they hold what they know over you from the start; holding something over them too lets it drop, and coming clean to the chief ends it) | two days after they name the price |
| The letter you promised to deliver | the letter itself, which is in your pocket from the start | four days after its addressee asks who sent you |
| Any other promise | your word, kept in front of the person it is about | four or five days after they ask |

The Journal, `/recap` and the narrator all know what you owe and when. A debt
or the blackmail is settled once the person has had the whole amount from you,
at once or over several turns (money spent buying something, even from them
and in Say mode, pays nothing). In Say mode, money handed to the person you
speak to pays what you owe them (else it is a gift) unless the line orders
something sold ("I'll take a beer", "two beers, please") or what you get is
something sold; words about the rest, what's left or what you owe
always pay ("Here's fifty. Give me till Friday for the rest." pays $50), and
"get yourself a beer" is a gift. Handing the letter to its addressee settles
the errand; a promise is kept when the story shows you keeping it in front of
them (a turn whose ask of them failed settles nothing with them).
Settling a loose end's debt, blackmail, letter or promise, on time or late,
closes that loose end (it leaves Open). Miss the
day and it costs you, the next morning: the lender takes your phone, the repo
man $150 of your cash (or what there is), counted toward the note (which
still counts as missed, even when that pays it off), and the phone, the
bookie gets you
barred from the Low Water for three days and tells the town you welshed, the
blackmailer tells Chief Bell what you are hiding, and whoever asked the favour
remembers you broke your word. The "Missed: …" line says what was taken
("Leon Varner took $150 toward it and your Prepaid phone."). A missed debt,
blackmail or letter is still owed, and paying or handing it over late settles
it late. The person owed comes looking if they live in town and are free (the
letter's writer and Dale Purvis live elsewhere: the day going by is told
without them).

### What comes due, meetings and asks

**What comes due is told where you are.** A loose end's moment, a background's
first lead, a missed day or a town event in front of you is told in the next
narration wherever you are by then (walk away and it meets you there, its
person with it): at most three a turn, the scene in front of you first, and
everything waiting after a sleep, `/wait` or `/skip`, including what that
sleep or wait brought (the morning's visitor is in that narration). A plan
that finishes in front of you while you sleep or wait is told by the
narration that follows. An
arrest's narration tells nothing else; what was due waits for the next one. A
walk's narration introduces the people where it ends, as they are when you get
there, so the next turn tells nobody coming or going that it showed.

**Meetings are kept.** When someone in the story agrees to meet you
somewhere ("Low Water, back door, half past ten"), the bookkeeper records it
and the engine keeps it: that person is at that place when they said (the
time words make it a phase: half past ten is the morning, supper the
evening, last call the night; with no time named, the rest of that day), and
someone with you whose meeting elsewhere is in this phase and no later one
leaves now (the next narration shows them going). The narrator
is told of it until you get there ("APPOINTMENTS: Jodie Strayhorn at the Low
Water (back door, half past ten) this morning, as agreed"), their People card
says "Meeting you: the Low Water, this morning (back door, half past ten)",
and when you walk in during that time the meeting is on in that narration. A
meeting on a later day puts them there that morning. Let the time pass
without going and they waited for nothing: they remember it, think a little
less of you, and a quiet line says so ("Jodie Strayhorn waited at the Low
Water and you never came."). Someone arrested, hurt or gone by then keeps no
meeting, and nothing is said. `/undo` takes a meeting back with its turn;
`/rewind` strikes one made on a struck turn. In the demo, saying "meet me at
the Low Water tonight" to someone here has them agree.

**What people ask of you is kept.** When someone in the story asks you for
something (to fetch, find out, deliver, keep quiet about, say or do
something; an offer with a reward, a warning with a threat), the bookkeeper
records it as a plan: due on its deadline's day when there is one ("before
the council vote" is the day of the vote), else when you next meet the
person who asked. It goes under **Asked of you** in the Objectives tab, in
`/recap` and on their People card ("Asked you: …") until it comes due, when
the story brings it up as it does any plan. In the demo, asking someone here
"what do you want from me?" in Say mode has them ask for the outboard part by
the day after tomorrow.

**Someone the story walks in is in the scene.** The narrator is told who is
here and never invents anyone, but when the story has set it up (someone
said they would come by in ten minutes) it writes the person walking in, and
the game follows: "Jodie slips in with her hood dripping" puts Jodie in the
room for the rest of that part of the day, in the Say chips and on the
People tab, as a visit. Only someone who could come counts (not the dead,
the gone, the arrested or the laid up), only outside quoted speech ("Curtis
saw me come in" brings nobody), and only with the person's name as the one
arriving.

### Town news, the council and the ending

**Town news.** What the town does becomes news: a faction's plan coming off,
the council meeting, a grudge or favour done in public, a fight in a public
place, someone caught cheating at cards. On each new morning the news you have
not heard yet shows as one quiet line under the new day's divider, "Overnight
in town: …", and goes into the Journal's Story so far. What a narration
already told you, or is still to tell you (a loose end's moment, a grudge or
favour done in public), is not told again overnight, though a grudge or favour
whose moment never reached you is. The
narrator hears the last five items every turn and is told they are newer than
anything in the town it was given at the start. The three factions move at
different speeds, and each step of a plan checks the town before it happens: if
someone it needs is arrested, dead or gone, or the vote has already been taken,
something else happens instead, and a step for one side sets the others back.
Once the ending is told, the town's plans stop; people's own business (a
loose end's follow-up, a grudge, a favour) still comes due.

**The council meeting.** A flyer on the door at Pittman's and at the bait shop
calls the town to the bridge vote, and from Monday (day 5) the agenda on the
Town Hall door adds a second vote: whether to keep the police. The council
meets on Tuesday evening, day 6, at Town Hall, with its five members and Chief
Bell in the room. Be there and it happens in front of you (`/skip to Town Hall
in the evening`, or a walk that gets you there as the evening starts; not a
night slept through there); otherwise you hear it the next morning. What the
council does depends on who has got to Royce Pittman, the swing vote, first,
whether the bridge report still stands, where Royce stands with you, whether
you are in the room and whether you paid Curtis Pruett. It weighs trust, not
beers: someone he trusts and who knows him (trust 30, knows you 25) has been
somebody to talk it through with, and he moves to table the bridge wherever
you are; liking alone (15 or more) only moves him when he sees you in the
back; after Carter has bought him, second thoughts need trust 20. Frightening
him buys nothing. A member in the holding cell does
not vote, and every outcome settles the police vote too: one that keeps the
police settles that story (Disbanding the police) at the meeting. Its
Resolved line, its gain and the Journal's change come when you hear of the
meeting: after the narration that tells it in front of you, or with the next
morning's news.

**The ending.** On day 21, or as soon as the bridge story is decided (the old
bridge closes, or the state orders a second inspection), one turn tells how
the town came out of it: one of eight endings, picked by what happened. It
settles the bridge and police threads (resolved or failed; with the bridge
still open and nothing settled, the police stay "for now", unless the council
voted to end them) and plants what happens next (a state crew under the
bridge, the police office half packed, a hearing in Clayburn). The Resolved
lines of the turn that brought it (and the recap, after `/rest`) follow its
narration, then a quiet line: "This is one ending. You can keep playing."
One `/undo` takes back the ending with that turn. An ending that could not be
told is told after your next turn.

### Grudges, favours, reports and trouble

**Grudges and favours.** Someone who comes to hate you (attitude -60 or below,
with a serious memory of what you did) acts on it a few days later; someone
who comes to like you that much (60 or more, with a memory of something that
mattered) does you a good turn. Each does something real: on the cold side,
prices up a quarter for five days, three days barred from the Low Water, a
beating (3 HP and Beaten, -1 might, for two days; never from the old, the
young or the police), a word to Chief Bell, a $50 police ticket; on the warm
side, a day of cash work that pays $100, goods at cost, a meal and a couch (2
HP), an alibi, a warning. A grudge answers in kind, by the turn its memory
came from (an attack, a theft, or words): violence with a beating or the
police (told of the assault), a theft with the police (told you were seen
where things went missing), talk or money, an insult with talk, a ban or
money. What someone did to you (a beating, a seizure, a night in the cell)
starts no grudge of theirs. What is done in public becomes news. One
feeling per offence: after one comes due, that person starts no other for a
week, and a grudge that comes due softens the memory it grew from (they got
even: it weighs less from then on; an older memory that carries no numbers
gives back 10). The serious memory has to be a harm still unsettled (or
settled only the same day), and its kind decides the answer: violence by
violence only from someone tough (Wade, Colt, Boyd, Leon, Dwight), else the
police; someone afraid of you answers only with the police or talk. **A
beating of someone tough is answered whatever they feel:** knock Wade down in
front of his town and a few days later he gets you alone. What people hold
has its own answers: someone with something on you who comes to hate you
(liking -60) tells it to whoever it matters to, and one who cares only for
money names a price once they don't much like you (a blackmail of $50 for
each step of how much it weighs, due in two days); someone you have
something on never sends the police after you while you hold it (unless
they are hard), and while each of you has something on the other, neither
plants a grudge or a report. A favour you owe is asked for back on its own
clock.

**Reports.** Someone you have frightened (fear 40 or more) because you
threatened them, or because you hurt them and they don't like you, tells
whoever looks out for them within a day or two: a boss (Tyler goes to Mavis
Mangum), their own (Trent and Colt to Wade Purvis, the police to Chief Bell,
Odessa to Miss Vada), a minor's parents and the chief, else the police. That
person cools on you (family or a boss: liking and trust -10; the police:
liking -5, trust -10). Some go to someone nobody knows they would (Hollis
Byrd tells Wade); then nothing names it and their card will only say they
cooled. Faction heads and loners (Chief Bell, Wade, Carter, Boyd, Leon) have
nobody to tell: for them it would be a grudge instead. Hard people (nerve, the
tough, the heads) never get frightened enough to report in the first place.

**People in trouble.** Now and then someone is in trouble where you are
(Colt Purvis has Trent against the ice machine at the landing; Boyd Teague
has Tyler by the collar at the motel; Leon Varner has Shayla at her trailer
step). Step in and it works (a roll aimed at them, or at the one doing it,
that succeeds, that phase or the next) and they owe you for it, and the people
watching see it. It never counts when you started the trouble yourself.

### Asking again, and fights

**Asking again.** A roll that fails can't be retried in the same place and
phase: change something first (a different approach, something to offer,
another place, or let time pass). In a fight you can keep swinging at someone
who is still there. A roll that succeeds locks nothing: you can ask the same
person again, but the same ask that already worked this phase earns less
goodwill each time (half, then a quarter, then none), and a second gift to the
same person in one day earns none (money toward what you owe them is a
payment, not a gift, and so is a purchase). Said to everyone, money is a
gift only when one person is there.

**Fights.** Who you fight sets how hard it is, whatever the action says: the
police and anyone tough or armed are hard, the old, the young and the frail
easy. A partial costs you 1 HP, a failure 1 to 3, a fumble 3. Three hits on
one person in one fight (the same person and place, attack after attack,
across a change of phase too; partials count) put them down in that turn's
narration: they are hurt and laid up at home for two days, and in a public
place it is news. A fight is one memory for the one you fight: a clean hit,
then a second that makes it worse, then the beating that replaces it (a swing
that misses is a shove); everyone watching takes one lighter memory for the
scene; in front of two people or more it costs your standing in town once,
by its heaviest blow (a beating -5). Fight with the police
there, or at Town Hall, and that narration has you taken in: a night in the
holding cell, a fine of up to $50, any weapon or ammunition you carry taken
off you (by what the thing is: a grease gun, gun oil, a butter knife, copper
wire, 18 gauge or a can of Colt 45 is not one; a .38, a 12-gauge, a Smith &
Wesson, a box of 9mm, .38 rounds or buckshot is), and Chief Bell remembers. An
attack, a plea or picking the pocket of someone who is not here rolls
nothing; stealing from their register or their things while they are away
still rolls stealth.

### Cards

**Cards.** When Curtis Pruett is at the Low Water (afternoons, evenings and
nights), there is a card game at the back table, played at a table the story
shows you: five-card draw or Texas hold'em, the one with two cards each and
five on the board. Say you bet, in Do or in Say mode ("I put $50 in", "deal
me in", "I'm in for fifty", "another hand", "I go all in", "I bet $20", "I
bet twenty on the next hand", "deal me in at hold'em", "a hand of draw", "I
sit down with Curtis for a hand of cards, five dollars", "Mind if I sit
in?", "Mind if I join you for a hand?", "I take a seat at the card table";
said in Say mode to Curtis or to everyone). A bet names the cards, the
hand, the game or the pot, or is a bare stake: "I bet he is lying" or "I bet
you ten bucks it rains tomorrow" is talk, and no hand is dealt. The game is
the one you name ("hold'em", "holdem", "hold em", "Texas"; "draw",
"five-card", "5-card", "draw poker"; the last one named, so "hold'em? no,
five card draw" is draw, unless it is put down: "I play texas hold'em, draw
poker is for old men" is hold'em; drawing cards is not the game: "I'll draw
to an inside straight", "I draw two"), else the one you played last; the first
time, with neither, the table opens with a chooser before any card is dealt
(Curtis and the house rules, **Five-card draw** and **Texas hold'em**, and
"Stop leaves the table (nothing lost)": Stop there calls the turn off at no
cost and puts your line back; the status line says "Choose the game: …").
The game you choose or name is remembered; the game changes only between
hands, so the chooser and the newest finished table say how to switch
("Next hand: name the game in your words to switch (hold'em or draw)"), not
an open hand.
You are not always alone with Curtis: the Low Water's card players (Royce
Pittman and Elbert Gentry in the afternoon, Carter Sturdivant, Wade Purvis
and Lyman Coker in the evening, Lyman at night) sit in when they are there
and on good enough terms with you (warmer than -25); each hand none, one or
two of them do, so some hands are heads up and some three or four handed.
"Deal everyone in" (or "everyone in") seats all of them who are there, three
at most; "heads up", "just me and Curtis" or "just us" seats nobody else.
The stake is your buy-in: what you name, in figures or in words ("fifty
dollars", "a hundred bucks", "a fiver"; whole dollars, so "$2.50" is $2),
all your cash for "everything" or "all in", half of it (rounded down, at
least $1) for "half my money", $20 if you name nothing (or less than $1;
"another hand" or "one more hand" with no stake named plays at the stake
of your last hand at Curtis's table that day, $20 if there was none),
and never more than your cash. It is the chips you bring to the table and
the most you can lose in a hand; every seat sits with the same, so the
stacks start equal and there are no side pots. You name a new stake between
hands; there is no adding money in the middle of one. The house rules come
from the stake: everyone antes a twentieth of it (at least $1: $1 at $20,
$5 at $100), and the table's bet is a fifth of it ($4 at $20, $20 at $100).
The table's heading says them, with why the stake is what it is ("Curtis
Pruett's table · Texas hold'em · $20 to sit · $1 ante · $4 limit · pot $2";
"$140 to sit, all you have", "$20 to sit, the usual: $0.50 is no stake"),
and the first hint of a hand (or the chooser's) says them in words once
("Twenty to sit, a dollar ante, four-dollar limit."); when the stake or
the structure differs from your last hand at his table (your first hand
there, another stake, or table stakes after the limit), Curtis says them
in the story as you sit down. Nobody at the table?
The story says when Curtis deals. The table appears under your line, one
row a seat: the name (Curtis marked "(deals)"), the cards (face down until
the showdown, yours face up) and what that seat did this round ("checks",
"bets $8", "raises to $24", "calls $24", "all in $19", the amount it has
put in on the round; each new round starts with them cleared, while a
seat that folded keeps "folds on the flop" and one all in keeps "all in";
at the end its hand's name, and "takes the pot" for the winner; two hands
of the same name are told apart by the cards that decide them, "Pair of
aces, nine kicker" against "Pair of aces, eight kicker", "Flush, ace-king
high" against "Flush, ace-queen high", and the hands of one name are named
to the same depth from the top kicker, "Pair of aces, king-jack kickers",
"king-ten kickers", "nine-eight kickers"), with a pot line ("Pot $56 ·
you're in for $20 · $0 left": what you have put in and what you have left
of your buy-in). **Betting.** On your turn you **Check** or **Bet**, or,
facing a bet, **Call** (it says its price, "Call $8", and "(all in)" when
it is all you have left), **Raise** or **Fold**. Curtis's house game is
limit: every bet is the table's bet and every raise one more of it ("Bet
$4", "Raise to $8"), four raises a round at most, and all in only when
what you have left is short of a bet ("All in $3"). Type more than that
("all in", "bet 20", "raise to 40", "I push my chips in") and Curtis
holds you to the house rules in character, at no cost ("Curtis taps the
felt. "Four-dollar bets at this table.""); your words stay in the box,
the status line names the buttons as they read and says "Ask Curtis for
table stakes if you want a bigger game" ("Four-dollar limit: Call $4, All
in $19 or Fold. …"), and the story notes how many times (kept through a
reload).
**Table stakes.** Between hands, at his table with him there, ask Curtis
for a bigger game ("no limit", "table stakes", "take the limit off", "lift
the limit", "raise the stakes", "a bigger game", "play for real", "can we
bet what we like", "let's take the limit off", "Curtis, table stakes?",
"Can we play no limit?", "deal me in, no limit"): the words alone are
enough, said to him (or to everyone) in Say mode, or typed as an action
with nobody else named or aimed at. Asking takes no time. Words that only
sound like it are talk: a limit that is someone's ("your limit"), one
something has, knows or is, or one without ("There's no limit to what I'd
do for her", "Does your greed know no limit, Curtis?", "Curtis, your greed
has no limit.", "He'll play without a limit, that one.", "I bet he plays
without a limit"), and "bigger game than this town"; and a line meant for
someone else (said to Loretta, "Loretta, no limit tonight?", or a whiskey
ordered from her "with no limit on the whiskey") is never an ask.
He weighs an ask with a Charm roll at normal difficulty (the roll line shows;
how he feels about you counts as for any persuasion). Yes, and his table is
no limit for the rest of the day ("Table stakes, then. Don't cry to me
after."); no, and he says so ("House rules," and the limit stays), and
asked again the same day he repeats himself without a roll; a fumble is a
no that costs you a little of his goodwill (5 points) and he will not hear
it again that day; colder to you than neutral, he refuses without a roll
("Not with you."); already no limit, he says so, and a line that sits down
("deal me in for $50, no limit", "I bet $20 at no-limit hold'em") deals
the hand instead. At table stakes the
heading says "no limit", and under the buttons is the amount: a field with
what you bet or raise to on the round, − and + by the table's bet, and
**Min**, **½ pot**, **Pot** and **All in**. The Bet or Raise button reads
what it will do ("Bet $8", "Raise to $24", "All in $19"); bets go in
multiples of the table's bet ($4, $8, $12… at $20), a raise is to at least
the bet plus the last raise, and all in is whatever you have left. An
amount the table does not allow is fixed: the button reads what it comes
to and the line under the field says each change ("Bets go in fours: $5
rounds up to $8.", "The least bet is $4.", "That's more than you have, so
it is all in $19.", "Bets go in twenties: $70 rounds up to $80. That would
leave you less than a bet, so it is all in $95."; a minus is the least,
"Bets are at least $4.", and cents are cut, "Whole dollars at this table:
$60."), and + or ½ pot or Pot
that comes to all in says so too ("Half the pot ($60) would leave you less
than a bet, so it is all in $75."). Enter in the field bets only what the
field and the button both show: an amount the table changes goes in the
field first, with its reason, and the next Enter bets it. The hint says
your choice in words ("Check, or bet $4, $8, $12 up to all in ($19)",
"Call $40, raise to $120 or all in ($190), or fold"), what Stop costs and
the Win (cheat) control; on a screen under 600px tall it is one short line,
the choice and the Win (cheat) ("Check or bet.", "Call, raise or fold.",
"Hold, then Draw."), so the Win stays in view with your cards, the buttons
and the amount, and what Stop costs is on the status line ("Your hand ·
Stop folds it (−$5)") and in the buttons' tooltip, with the house rules
on the first deal.
With a hand open you can also type the move in the box instead of pressing
it: "check", "call", "fold" (or "I check", "I call", "I'm calling", "I
see your bet", "I see it", "I'll see that", "I fold"), "call $8" (the
call's price; another amount is answered with what the call is), "all in"
(or "I'm all in", "I'm going all in", "I go all in", "shove", "I push my
chips in", "I shove all my chips at Curtis"),
"bet 10", "bet ten dollars", "raise to 30", "raise it to 30", "raise by
10", "make it 30", or a bare "$30"; at the draw "stand pat", "fold" or
"draw 3" ("draw three", "I draw two", "draw a card": Draw, when it
replaces that many; otherwise "Tap the cards you keep, then Draw (it says
how many)."). An amount is fixed as the field fixes it (the status line
says so once the move is made, and when that move ended the hand it keeps
saying so until the story's first words arrive; the finished table keeps
it under the result: "Your $70 went in as all in $95: that would have
left you less than a bet."), and a move the table does not offer is
answered on the status line ("There's a bet to you: call $8, raise or
fold.") with your words left in the box; a line that is no move leaves the
hand's nudge. The status line follows each move at once. Right after a
hand at Curtis's table (the same day), those betting words are no new
hand: "all in",
"shove", "bet 10", "raise 30", "call", "check" or "fold" typed then gets a
notice ("No hand is on the table. 'Another hand' or 'deal me in for $20'
starts one.", with your last stake, which "another hand" plays at), your
words stay in the box and nothing is spent ("I push my chips toward
Curtis" too); name the game, the hand, the table or Curtis ("I go all in
at cards", "all in, Curtis", "I bet $20, Curtis", "all in at the table")
to sit down with them, as after any other turn (the demo reads "shove" or
"push" as a fight only with a person as what is shoved: "I shove Loretta",
"push him", never "I push my chips toward Curtis" or "I push past Curtis
to the bar"). The others
bet, raise, call and bluff by their hand, the price and their nature
(Carter, sly Elbert and Curtis bet, raise and bluff more; careful Lyman and
Royce call down or fold), from the hand's own dice, so the same moves meet
the same answers.
The money goes in as you bet it (the cash in the top bar and the Character
panel follows each bet), a bet nobody calls comes back to whoever made it,
and when everyone left is all in the rest of the cards are dealt out to the
showdown. **Five-card draw:** everyone antes and gets five cards. Tap the
cards you want to keep (or Space or Enter on them; each says Hold), then
**Draw** (it says how many it replaces: "Draw 3", or "Stand pat" with all
five held) to replace the rest, or **Fold** (it costs the ante: "Fold
−$1"). Curtis and the others draw by a fixed rule (they stand on a straight
or better, keep three of a kind, two pair or a pair, then four to a flush
or a straight, else their two highest cards); then one round of betting
after the draw, you first: your five face up with the new cards marked and
named, and each other seat's draw said ("Curtis draws 3"). Every hand still
in turns up with its name at the showdown ("Two pair, kings and sevens",
"Pair of aces"), and the best poker hand takes the pot, split on a tie (a
remainder to you); a hand that takes the pot because everyone else folded
stays face down. Folding before the draw costs only the ante; heads up the
hand ends there (Curtis's cards shown as dealt), and with others at the
table they draw and check it down among themselves. **Texas hold'em:** you
get two cards; then four rounds of betting: before the flop, then after the
flop (three cards turned on the board), the turn (one more) and the river
(the last), you first each round. If everyone else folds, the pot is yours
at once, and the board stays on the round it stopped on; if you fold (or
Stop folds, or the page closed), anyone who still owes a bet on the table
calls or folds it as they would, nobody bets again, the rest of the board is
dealt and they check it down to a showdown among themselves (the board's
label then says "Showdown"): a seat that never matched a bet cannot win it,
and you lose what you had put in. At the showdown the best five of each
seat's seven cards wins, the pot split on a tie (the odd dollar to you).
The game moves the money itself, the result line gives your cash after
("You win $44 · cash $184"), and the narration tells the big moments ("you
raised to $120 before the flop, Curtis Pruett went all in and you called")
and the people without listing the cards again, each fold once ("you bet $4
on the flop and Curtis Pruett folded; the $2 pot is yours"). A card player
who puts $10 or more into a pot you take remembers it and likes you a
little less (2 points); one who takes $10 or more of your money in a pot
remembers that and likes you a little more (1 point); only the first of
these a day counts for each of them, so small hands cannot be used to win
or lose anyone over (Curtis keeps his game: his feelings only change if you
cheat, or push him too hard for table stakes). Your wits are a read on the
others, not the result: at draw the line over Curtis's cards says "Your
read: Curtis has something" (he ends the hand with a pair or better) or
"Your read: Curtis is bluffing"; at hold'em a read appears by a seat when
it first bets or raises ("Your read: Carter is bluffing"). A read is right
60% of the time plus 12% for each point of wits (a condition such as
Tired counts), never under 50% or over 95%, and at the end it says whether
you were right wherever that seat's cards were shown (a seat that folded
keeps its cards face down, and its read has no verdict). The deck is
shuffled from the game's seed and the turn, so a hand taken back with
`/undo` is dealt again the same way, by design, when you send the same line
(at hold'em too: the same seats, the same two cards each and the same
board). With a marked deck on you, everyone else's cards are face up while
you play (you read the marks, so there is no read), and once the hand is
played one wits roll at normal difficulty, +2 for the deck, says whether you
keep the marks from Curtis ("Keeping the marks from Curtis: Wits 17 + 3 = 20
vs 12 · Success", under the table; a success means he did not notice): on a
fumble he catches you (the hand is void and you lose the stake; he keeps the
deck, puts you out on Front Street, remembers it hard, you are barred for
three days, today counted, and the town hears of it). Every line about the
ban names the first day the bar is open after it ("back on Monday, Day 5" in
the story, "not welcome there until Day 5" at its door, on his People card
and on the place's card). After that he will not deal to you for a week, nor
while he is colder to you than -10 ("Curtis Pruett won't deal to you"), and
what he had coming for you (a background's invitation to his Friday game)
waits for as long as he will not deal, for either reason. Without a marked
deck nothing is rolled at the table and nobody is accused. No complication
is rolled at cards. Once the cards are dealt the ante is in: while a hand is
open the box waits as it does during any turn (a bet typed in it plays, as
above), **Stop** folds the hand (losing what you have put in: the ante
before the draw; the table's hint says so, the notice names it, "Stopped: a
hand on the table is folded, and the $15 you put in is gone." or "…and the
$1 ante is gone.", and with a marked deck the catch roll is still made), and
the turn is kept, told in one plain line. `/undo` is the way out at no cost:
typed with a hand open (or the Undo link, or Undo last turn in the ⋯ list),
it takes back the whole turn that dealt it, at the chooser, at draw or on
any hold'em street, whatever was bet, with a marked deck too: the table and
your line leave the story, every bet comes back, nothing is rolled or
remembered, your line goes back in the box and a cheat the hand spent is
armed again ("You took back the last turn; the hand is off the table. 3 more
can be taken back."); `/undo 3` takes that turn and two before it. Closing
the page does not take it back either (the next time that game is loaded, a
hand left open is folded where you left it, with the bets made so far, "You
left the table, so you fold: −$1" (so is a draw hand left open before
hold'em came in: never the chooser), and one already played stands as it was
played; loading an older save of the game, another game or a new one drops
it instead, so a hand you never played is never folded). If another tab
takes the game over while a hand is open, the table in the first tab is void
("Another tab took over; this hand is void here.") and the tab that took
over folds it; with the chooser open nothing was dealt, so the first tab
takes that turn back ("Another tab took over; the table is closed here.",
your line back in the box) and nothing is lost in either tab. While a hand
is open, typing `/cheat win` is the **Win (cheat)** button, `/cheat cards`
says "The cards are dealt: use Win (cheat) or type /cheat win.", `/help`
lists the commands as ever (the hand stays open), `/undo` (and `/rewind`)
take the turn back as above; other commands wait with the hand's own nudge,
which says what you can type. After a reload the fold on load is one step
like any turn: `/undo` goes back to before the bet. When it is dealt and
after each press the table keeps your cards, its buttons and the amount in
view (its heading at the top only when the whole table fits; on a phone it
never jumps back to the heading; on a 320px phone the board's cards are
smaller and the board a short scroll above), and after a press the keyboard
focus is on its first button.
Menu → Title screen waits until the hand is played (the notice shows above
the table). After the showdown the hand is final: if the narrator fails, is
stopped or declines, the turn is still kept and the hand told in a plain
line ("The hand is played: your two pair, kings and sevens, beats Curtis
Pruett's pair of aces. You win $5.", after the big moment of the betting if
there was one), with a notice that says what happened ("The narrator could
not be reached. The hand stands: you win $5."). Once the hand is played the
story is followed again, on a phone too. A reload or `/undo` draws a
finished table again where it was in the story, with its house rules and
whether it was limit or table stakes. Two cheats: `/cheat cards` stacks the
deck so you win the next hand (you still play it; the winning hand varies,
at hold'em a set, the nut flush, a straight, a full house or four of a
kind, at draw a full house, a flush or a straight, and the others hold
hands that lose, at hold'em each a different one when the deck allows; at
hold'em nobody folds before the flop and at draw nobody folds to your bets,
so the pot is worth having), and `/cheat win` wins the next hand without
playing it: the table appears already finished (every seat's cards face up,
the board complete, your hand the best, everyone all in: you win the stake
from each other seat, in either game), and the story tells it as a plain
win. Every open table (the chooser too) also has a small **Win (cheat)**
button at the end of its hint (on a phone it is as tall as the other
buttons) that does the same at once: what is already in the pot stays
there, the others still in call the bet on the table, and only cards you
have not seen are dealt so your hand is the best (at hold'em the rest of
the board and, with no marked deck, the others' face-down cards; at draw
only the cards drawn, every hand as dealt staying, and after the draw only
the others' draws, if you cannot see them). When nothing can make your hand
the best (a pat four aces you can see, a royal flush on the board), the
others fold to you instead, and you take the pot as it stands (a bet you
faced called first); no tie and no weaker hand ever takes it. Neither cheat
rolls or puts anything about cheating on record. With no game here, nobody
dealing, or the bar shut for the day, nothing is bet and no table is dealt.

### What one turn can do

**What one turn can do.** The bookkeeper that records each turn is held to
what a turn can do: $500 gained (what you hand over is held only by what
you carry, so a payment the story shows counted out goes in full), 3 HP,
two things gained, one new plan (a job asked of you, a meeting or another
later event), a
condition of three days at most, and nobody dies, is arrested or leaves town
without a roll against them that succeeded. A thing bought is refused when
the money for it was. HP never reaches 0 from what it writes unless you
attacked and the roll failed. If the bookkeeper fails, the story you read
stands: a quiet line says what changed was not recorded yet, and it is asked
once more in the background. What the game saw itself (a fight, a threat, a
theft, a gift, a debt, a meeting or a flirt) is recorded by the game and
counts once: the bookkeeper is told never to name it, and anything it names
of the same kind for that person that turn gives way to it. It names at most
two things for a person and four in all (see People), and in one turn
nobody's liking moves more than 40, their trust 45 or their fear 40 from what
happened to them.

## Settings

| Field | What it does |
|---|---|
| API key, Check key, Remember on this device | Your Anthropic key and where it is kept (see [How to play](../README.md#how-to-play)), with the warning beside Remember. **Check key** asks the API whether the key works (`GET /v1/models`, no tokens spent); a key with a space or a hidden character in it is caught before any call. |
| This session | The line at the top: "This session: 23 turns · $0.61", from the token counts the API reports; with a model the game has no price for, "This session: N turns · $X.XX (no price known for <model>: cost not counted)". |
| Spending | This game's total and this session's ("This game: $1.23 over 31 turns · this session: $0.40"), about what a turn costs and roughly what the rest of the three weeks will cost at your pace (20 turns a day until half a day has passed), and **Pause and ask at** Off (the default), $5, $10, $20 or a custom amount. The chip in the top bar opens it. |
| Quality | **Thrifty**: Sonnet 5.5 narrates, Haiku 5.5 reads your action and keeps the books, all at low effort; about 1 cent a turn. **Standard** (the default): Opus 5.5 narrates at medium effort, Sonnet 5.5 parses at low and keeps the books at medium; about 4 to 5 cents a turn once warm (see [What a turn costs](MAINTAINING.md#what-a-turn-costs)). **Best**: Opus 5.5 and Sonnet 5.5 at high effort (the parser at medium); slower and dearer. Settings that match none of these show as Custom. |
| Advanced | The offline demo switch; the narrator model (writes the story, streamed) and the parser model (reads your action, records what changed after each turn as the bookkeeper, and writes the chronicle); the effort per role (narrator, parser, bookkeeper, chronicle: `low` / `medium` / `high`, sent as `output_config.effort`; higher means more thinking, slower and dearer). Its hint names the build: "Build: wave 51 · rules v10. Name it in a bug report." |
| Show dice rolls | Shows the quiet roll line, e.g. `Wits 14 + 2 = 16 vs 15 · Success`. |
| Narration style | **Casual** (the default): plain and direct, like someone running the game at the table, with short sentences, no similes and little scenery. **Literary**: the original style guide, tighter and more like a novel. Takes effect from the next narration. |
| Permadeath | Off by default. Off: at 0 HP you are robbed, captured, left in a gutter or rescued, chosen from the scene. On: the story ends. |
| Theme | Dark or Parchment. The first load follows the system's light or dark setting. |
| Text size | Small, Medium or Large reading text (16, 18 or 20 px at the browser's default size). Text size sets the story's size; Large also makes the interface an eighth bigger (not on screens 600px tall or less). All text follows your browser's own default text size. |
| Game: Re-read this game with the latest rules | Brings the game you have open up to the latest rules again: rewrites what people remember in the current short form, adds places people told you about, sets the clock back if it ran ahead of the story, fixes people the game made up, brings in the town's full cast, fills in the lived-in town, and gives the game its arc: the calendar, the council meeting, the ending and what loose ends still to come will cost (see [Updating an older game](../README.md#updating-an-older-game)). About four API calls. |
| This device | **Forget key** takes the API key out of this browser (localStorage and sessionStorage) and clears the field; games and settings stay, and New game asks again how you want to play. **Delete all game data on this device** asks first, naming what goes, then deletes the autosave and previous autosave, the three slots, the undo history (IndexedDB), the settings and the key, and starts again at the title screen as on a first visit. Exported files are not touched. |

## Accessibility

On the game screen, the first Tab stop is a "Skip to the story" link that
takes you to the input. Screen readers get a heading for each turn ("Turn
3"), so you can move through the story turn by turn with the headings list.
The line above the input ("Reading your action…", "Writing…") is announced
politely. Text size follows the browser's own default size (see Settings).

## Commands

| Command | What it does | API calls |
|---|---|---|
| `/look` | Describe the whole scene, with the longer zoom length | Narrator (and the bookkeeper when something due happens in it) |
| `/zoom <action>` | Play the action as a normal turn with the longer limit, for big moments | Parser, narrator, bookkeeper |
| `/skip <where or when>` | Jump ahead to a place and/or time ("/skip to the bar at night"). The world ticks once for each phase skipped, and you arrive at the start of the phase; naming the phase it already is moves you with no time passing. A place and a time go there first and then wait, so what happens there happens in front of you; skipping to the place you are in, at a later phase, is a wait there. A place shut or barred to you on the day you would get there refuses before anything passes ("You are not welcome at the Low Water until Day 9.": welcome again on Day 9); one shut now but open by then is walked to after the wait | Narrator (and the bookkeeper when something due happens) |
| `/pass` (or **Wait**: the button beside the box while it is empty) | Say and do nothing for a few minutes and let the people here act, speak or react to your silence | Narrator, bookkeeper |
| `/rest` | Sleep until morning: 3 HP in a bed, 1 sleeping rough (see Time). The world ticks through the night. The recap follows | Narrator (and the bookkeeper when something due happens) |
| `/wait <phase>` | Wait where you are until the start of morning, afternoon, evening or night | Narrator (and the bookkeeper when something due happens) |
| `/fact <statement>` | Spend a story point to make a statement true in the world ("/fact the mechanic owes me a favour", "/fact Jodie grew up in Clayburn"): the narrator and the bookkeeper treat it as so from then on, and it is kept on the person's card as a protected memory (it never grows a grudge). What it says about how someone stands with you was so before you came: "owes me" puts them in your debt (one favour), "go back", "old friend" or "grew up with" means they know you, "trusts me" adds 15 of trust and "likes me" 10 of liking (to 40 at most); never fear. It is not a question: "/fact how to seduce Jodie" or anything ending in "?" is refused at no cost, with a pointer to asking someone in the story instead | Parser |
| `/recap` | Where and when you are, who is here, what is open, what you owe and are owed (what people owe you for keeping quiet and favours among it), who is warm, cold or careful with you, what you heard (see Journal) | None |
| `/sheet` `/people` `/journal` `/places` | Open that panel | None |
| `/undo` (also `/undo 3`, `/undo all`) | Take back the last turn exactly, or that many (up to 20 steps, fewer only if they would pass about 8 MB); a turn and the ending it brought are one step, and so is a `/cheat time`, a `/cheat cash`, an edit, an update or a `/rewind`. The notice ends with how many more can be taken back ("You took back 3 turns. 2 more can be taken back."; "Nothing more can be taken back."). The history is kept in this browser (IndexedDB) for the game in the autosave, so it survives a reload: **Continue** and **Play here instead** bring it back (only its steps up to the turn the autosave was saved at); a new game, a loaded slot, an import or the previous autosave start it empty. Where IndexedDB is off or fails (some private windows, some browsers opening the file from disk) nothing is said and the history is for this page only, as before; a tab another tab has taken over never writes it. Asked for more than there is, it takes back what it can and says `/rewind` can strike the rest ("You took back 4 turns. Only 4 turns could be taken back exactly; /rewind 6 strikes earlier turns from the story (money and feelings stay)."). A hand at cards taken back is dealt again the same way when you send the same line (by design, at draw and at hold'em), and a cheat that hand spent (`/cheat cards`, `/cheat win`) is armed again. With a hand open it takes back the turn that dealt it, free: "You took back the last turn; the hand is off the table." (see Cards) | None |
| `/redo` (also `/redo 2`, `/redo all`) | Put back what `/undo` took back, in order ("You put back 2 turns. 1 more can be put back."). For this page only (a reload, a load or a new game empties it, and it is never kept with the undo history), and emptied by the next turn played (or a `/cheat time`, `/cheat cash`, edit, update or `/rewind`); a turn that fails, is refused or is taken back with its hand still open leaves it. A cheat armed before stays armed | None |
| `/rewind <n>` (also `/rewind to turn 12`, `/rewind day 2`) | Strike the last n turns from the story, for turns `/undo` cannot reach (played before the undo history was kept, or older than it); the first turn of the story always stays. It works from what records a turn number: those turns' story and the memories, notes, progression and last-seen marks they left go; whoever was first met then is not met (the narrator describes them again); a person or place first named then goes unless something else refers to it, and a home the cast wrote that was found then is unfound again (unless you are in it); and the clock goes back to the start of the phase the first struck turn began in (as that time passes again, the town's clocks roll for it again). Not taken back (nothing records it by turn): money, health, things carried, how people feel, where you are, what you heard, the town's clocks, loose ends and threads (one settled then stays settled, with what it gave you). The notice says so: "Rewound to turn 5 (Day 2, evening): 3 turns struck from the story. Not taken back: money, health, things carried and how people feel, nor where you are or what you heard. /cheat cash <amount> sets your cash." One `/undo` step, so `/undo` brings the struck turns back. The turn count goes on (the next turn is numbered after the struck ones). With a hand open, its turn is taken back first, free | None |
| `/reroll` | Cheat: take back the last turn and roll its dice again, as often as you like, ignoring the no-retry rule. The same action replays with a fresh die, and the story says "Rerolled." After a hand at cards only the marked deck's catch roll is new: the hand replays as it was played (the same cards and holds, nothing to tap); with no marked deck it says "Nothing to reroll: the cards were dealt.", and after a hand the win cheat ended "Nothing to reroll: that hand was yours." (the cheat stays spent: only `/undo` arms it again; a cheat armed and not yet used stays armed through a `/reroll`) | Narrator, bookkeeper |
| `/cheat success` (or `partial`, `fail`, `crit`, `fumble`, a number 1-20) | Cheat: redo the last roll with that outcome; the story says "Cheat: success" (or the number). After a hand at cards with a marked deck, the hand replays as it was played and only the catch roll takes that outcome. With no roll to redo, it arms your next roll instead ("Cheat armed: your next roll will be a success."; after a hand with no marked deck, "Nothing to reroll: the cards were dealt." first, or "Nothing to reroll: that hand was yours." after a win-cheat hand). `/cheat` alone lists these | Narrator, bookkeeper |
| `/cheat cards` | Cheat: stack the deck so you win your next hand at cards ("Cheat armed: the next hand is yours."; typed again, "Already armed: the next hand is yours."). You still play it: at draw you are dealt a made hand (a full house, a flush or a straight, by the deal) whose draw keeps at least a pair, and the others draw to nothing and call your bets after the draw, so you win however you draw; at hold'em your two cards and the board make the best hand at the table (a set, the nut flush, a straight, a full house or four of a kind, by the deal), the others holding hands that lose to it, and nobody folds before the flop, so the pot is worth having (you can still fold it away). Typed while a hand is open it says "The cards are dealt: use Win (cheat) or type /cheat win." No roll, even with a marked deck, and nothing about cheating is recorded. The armed cheat is kept in the game, so a reload keeps it and `/undo` of another turn does not lose it; the hand it is spent on is spent even if you fold it or Stop folds it, and `/undo` of that hand arms it again ("The cards cheat is armed again"). `/help` lists it in the `/cheat` row | None (the hand is part of the turn that bets) |
| `/cheat win` | Cheat: win your next hand at cards without playing it ("Cheat armed: the next hand is yours without playing."; typed again, "Already armed: the next hand is yours without playing."). The next bet is not played: the table appears already finished, every seat's cards face up, the board complete, your hand the best and everyone all in, so you win the stake from each other seat, in either game; the cash moves and the story tells it as a plain win. No chooser (with no game named or remembered it is hold'em), no roll even with a marked deck, nothing about cheating recorded; the other players remember losing as after any win. Kept in the game like `/cheat cards` (a reload keeps it, `/undo` of the hand arms it again: "The win cheat is armed again"). The same at once from any open table: its small **Win (cheat)** button (on the chooser, a draw hand or any hold'em round; what is already in the pot stays there and the others still in call the bet on the table), or `/cheat win` typed while the hand is open. Mid-hand it never changes a card you have seen (your own, the board so far, and every seat's with a marked deck): only what is still hidden is dealt so your hand is the best, and when nothing can do that the others fold to you and you take the pot as it stands ("Curtis Pruett folds to you on the river"); no tie and no weaker hand ever takes the pot. `/help` lists it in the `/cheat` row. (`/cheat success` is the roll cheat; "win" is no longer one of its words.) | None (the hand is part of the turn that bets) |
| `/cheat cash <amount>` | Cheat: set your cash to a whole-dollar amount from 0 to $1,000,000 ("/cheat cash 25": "Cheat: your cash is $25 now."; the same amount again: "Your cash is already $25."). No roll and nothing in the story; one `/undo` step. Handy after a `/rewind`, which leaves the cash as it was. `/help` lists it in the `/cheat` row | None |
| `/cheat time <phase> [day]` (also `/cheat night`, `/cheat morning 2`) | Cheat: set the clock to the start of that phase, on that day (today if none), forward or back. The world does not tick and nothing is narrated; the story shows the new day and phase and "Clock set to Day 4 · Night." Going back ("/cheat time night 1" from Day 2 morning, to pick a scene the clock left behind) shows "Clock set back to Day 1 · Night. What has already happened stays in the story.": nothing is caught up on the way back and nothing told is untold (news, a missed obligation and a ban stay as they are); `/undo` takes it back. What the clock jumps past happens at once and in order, each on its own day: a "Meanwhile in town, Day 3: …" line for each day with town news or an event elsewhere, and each morning's "Missed: …" (what fell due) and "Condition over: …"; a town event at your own place happens in front of you in the next narration, and what came due for you (a loose end's moment, say) in the narrations that follow, oldest first. One `/undo` takes it back, with an ending it reached | None |
| `/pronouns <who> <she\|he\|they>` | Set someone's pronouns ("/pronouns Mavis she"); the chips on their People card do the same. A gendered relation, their ties, look and voice turn with it (Dewayne's husband becomes Dewayne's wife; "husband of Dewayne Mangum" becomes "wife of Dewayne Mangum", or "spouse" for they) | None |
| `/edit <name>` | Open the People panel with that person's card in edit mode ("/edit Mavis"; a first name is enough): anything about them, saved as one `/undo` step (see Editing people) | None |
| `/save <name>` | Save to a named slot (no name opens Save / Load) | None |
| `/load <name>` | Load a named slot (no name opens Save / Load) | None |
| `/help` (or `/commands`) | List every command with what it does, one a line in the story under a "Commands" heading (Commands help in the ⋯ list does the same); with a hand open at cards too, the hand staying open | None |
| `/debug` | Toggle the Debug tab: town news, obligations, bans and town events fired, secrets, seeds, faction clocks, rumour truth, rejected changes, token totals (with 1-hour cache writes) and session cost, and the last raw API responses | None |

The **⋯** button lists the everyday ones (see [Do and Say](../README.md#do-and-say)). While a turn runs
the Send button is **Stop**, and once the narration is in, a line you send
waits its turn (see [How to play](../README.md#how-to-play)). `/undo`, loads, edits and updates wait
until no turn is running.
