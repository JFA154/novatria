# Novatria

Two games live here, each one self-contained HTML file with no build step.

- **`index.html`: Last Call** (the front page). A hidden-role table game of
  lying and deduction at the Low Water, with Claude at every other seat. See
  [Last Call](#last-call-indexhtml) below.
- **`town.html`: the one-town text RPG** (Lockett's Ferry). It is kept here,
  whole and tested, but hidden for now: nothing on the front page links to
  it. Open the file directly to play it. Everything from the next heading
  down to "Last Call" is about it.

# One-Town Text RPG: Lockett's Ferry

A single-player text RPG set in one town: Lockett's Ferry, a present-day river
town of about eight hundred people where the state highway crosses the Lusk
River on an old steel bridge. A land company, a smuggling crew and a
three-officer police department each want something from the town, and the
player arrives with three loose ends of their own. You type any action and
Claude narrates it. The game's code owns every fact, number and dice roll.
Claude only describes what the game state says is there, and the town keeps
moving on its own: faction plans advance, debts fall due, grudges and favours
come due, news spreads, the council votes on the bridge on the first Tuesday,
and the town's story reaches an ending by the third week.

## How to play

1. Open `town.html` in a browser. It is one self-contained file, so it works
   straight from disk (`file://`) or from any static host. No build step, no
   server.
2. **New game** first asks how you want to play, until you have chosen:
   - **Play with Claude (paste your API key)**: paste an Anthropic API key
     from [console.anthropic.com](https://console.anthropic.com) and press
     Continue. The browser calls `https://api.anthropic.com/v1/messages`
     directly with your key, and `https://api.anthropic.com/v1/models` when
     you press **Check key** in Settings. The page's content security policy
     refuses every other host, so nothing goes anywhere else.
   - **Try the offline demo (canned replies)**: a built-in dummy parser,
     narrator and bookkeeper run the whole turn loop with no key, no calls and
     no cost. The replies are canned and tagged "Mock narration", so the story
     barely moves, but the controls, the dice, the commands and the living
     town all work. It is a demo of the game, not the game: while it is on, a
     slim bar under the top bar says "Offline demo: replies are canned." with
     a button to add a key.

   Entering a key anywhere (that view, Settings, or the chip on the title
   screen that says which way you are playing) turns the demo off, with the
   note "Offline demo off: playing with Claude." The demo switch itself is in
   Settings under **Advanced**.

   **Remember on this device**, beside the key field, ticked: the key is kept
   in this browser's `localStorage` and survives closing the browser. Other
   HTML files you open from this computer in the same browser can read it, so
   tick it only on your own device. Unticked: it is kept in `sessionStorage`
   and forgotten when the tab closes. The key is never written into a save or
   an export.
3. **Character creation** asks for a name, a background and age, one stat
   point to move, a goal and a flaw, and three loose ends, or **Random
   character** fills in all of it (see Character creation). Then press
   **Begin**.
4. Type what you do and press Enter (Shift+Enter for a new line). The **Do /
   Say** switch at the left of the input says whether you are doing something
   or saying something (see below). Type `/`, or press the **⋯** button beside
   the switch (on a phone, at the end of the tab row above the input, or
   beside the switch while you type), for the commands. The side panel (on a
   phone, the tab row above the input) has Character, People, Journal,
   Objectives and Places. After the first narration of your first game a three-line tip says
   this again; × closes it.
5. While a turn runs, a line above the input says what is happening
   ("Reading your action…", "Writing…", "Updating the town…") and **Send**
   becomes **Stop**. Stop before the narration is in cancels the turn:
   nothing changes and your words go back in the box. Once the narration is
   in, the box is yours again while the town is updated. With the box empty
   the button stays **Stop**: it keeps the story you read and skips
   recording what changed (a quiet line says so; nothing is retried). Type
   the next line and the button is **Send**: the line waits, shown above the
   box as "Next: “…”" with **×** to take it back, and runs as soon as the
   turn is done. A third line typed while one waits stays in the box, and
   the line above it says "One line is already waiting. Press × to change
   it." A turn that fails says why, keeps your words in the box and
   offers **Try again** (and **Open Settings** when the key or a model name
   is the trouble).

## Do and Say

The switch at the left of the input box has two buttons.

- **Do** (the default): you type what you do. "I run away" means you run
  away. Anything in quotes inside the line is part of what you do.
- **Say**: you type only your words, exactly as you say them. "Run away" means
  you tell someone to run away. You stay where you are, and the person you
  speak to answers first. Talking, persuading, lying and threatening are all
  Say; the game decides from your words whether a roll is needed.

In Say mode a row of buttons appears above the input: **Everyone**, plus one
button for each person here, by name, or by what they do for someone you have
not met ("the mechanic"). One is always picked: the only person
here if there is just one, otherwise Everyone. Tap another to talk to them.
The row changes with the scene (after each turn, when you move, when you load
a game), and your pick is forgotten when you go somewhere else. On a phone the
row is one line that scrolls sideways; with more than four people here it is
a single "To: Everyone ▾" picker instead, which lists everyone here. On a
phone on its side, while you type, the top bar steps aside and the row is that
picker alone, narrow, beside the box, so the story keeps its room; it stays
that way while the picker is open, and tapping the picker with the keyboard
down brings it on too (on an iPhone the picker wheel takes the keyboard's
place). The box takes three lines at most there, then scrolls.

In the story, a Say line shows your words in quotes and who you said them to:
`“Run.” — to Royce Pittman` or `“Anybody here hiring?” — to everyone`.

**Quote shortcut.** In Do mode, a line that is only a quote is said, not done:
`"Run."`, `say "Run."` or `I say "Run."` all go out as Say, to whoever is
picked in the Say row (by default the only person here, or everyone). The
quotes are dropped. A quote anywhere else in the line, as in
`I shove past him and yell "Run!"`, keeps it a Do line. The switch itself
stays where it was.

Commands (`/look`, `/undo` and the rest) work in either mode. The switch is
remembered in this browser; who you were talking to is not.

**Wait, ⋯ and Undo.** Enter on an empty box does nothing. With the box empty,
the button beside it reads **Wait** (a plain button, not the bright Send):
pressing it is a paid turn in which you say and do nothing and let the people
here act (`/pass`). The **⋯** button (on a phone at the end of the tab row, or
beside the Do / Say switch while you type, and Menu → Actions and commands)
lists Look around, Wait until… (the other three phases), Sleep, Recap, Undo
last turn, Spend a story point (it fills in `/fact ` for you to finish) and
Commands help (the command list, as `/help` prints it); on a phone on its
side the list is two columns, read down the first and then the second (the
arrow keys follow that order, and go across a row). The newest line you
typed carries a small **Undo** link too (outside the story's live region, so a
screen reader does not announce it with every turn); its name says how many
turns can be taken back ("Undo the last turn (5 can be taken back)"), and it
is there while a hand is open at cards too, where it takes that turn back,
free (see Cards; Undo last turn in the ⋯ list does the same). `/undo 3` and
`/undo all` take back several turns at once and `/redo` puts them back. For
turns older than the undo history (a game played before the history was
kept, say), `/rewind` is the approximate tool: it strikes them from the
story but leaves money and feelings as they are. A turn started from the
list, the Undo link or a Go there button never drops the focus: it stays on
that control, or on what stands in for it (the ⋯ button once the list closes,
the box once the Undo link goes), while the turn runs, and on a laptop the box
has it after. Quiet lines in the story ("Added to the map", "Edited …",
damage) are saved with their turn, so they survive a reload, and an undo takes
them back with it. After a reload or an undo the story is drawn in the order
it was shown: a line printed under a new phase's divider ("won't forget
that", "Clock set …", "Meanwhile in town …") stays under it, and one printed
before the narration (damage, "Missed: …" after a night) stays before it.

**You have only what you carry.** Every turn the narrator is told exactly what
you carry and how much money you have, and that you have nothing else. That
figure is yours alone: nobody in the scene can see into your pocket, so a
person knows only what you show them, hand over or say, and a spoken line that
names your total or what you have left is sent back to be written again. When you
try something that needs a thing you do not have and that is not lying here ("I
stab Royce" with no knife, "I drive off" with no car; a grease gun or gun oil
is no gun), the turn still plays, but as what you can do without it: bare
hands, a bluff, or finding out you have nothing. The roll counts no item, and
the bookkeeper records no use of the thing. Every background starts with a
prepaid phone (one bar, by the water tower), so the people who live elsewhere
can be called. A drink, a meal, a haircut or a night at the motel is had where
you pay for it and never carried. A thing you look for that the town has not
written in is made only when the roll for it succeeds (a search for it always
rolls); a failed search turns up nothing.

**Taking things.** You pick up only what is lying here (what the scene lists):
"I pick up the pistol" with none in the scene makes nothing, even after a
search, and "a rifle and a box of shells" is two things. A search finds only
what fits the place: guns and shells where guns are kept (the pawn shop, the
police, a farm, a home), a boat by the river, a car where one would be parked,
explosives nowhere; a `/fact` can still make one true.

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
the built-in story pack, `packs/low-water.json`, in households (the Mangums, the Pittmans, the
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
or written to, but they never walk in. The validator's `engine.mention.*`
rules fail the town check on any capitalised name, "the <kind of place>" or made-up crowd ("two
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

**Who is here, as faces.** Above the story is a strip of the people where you
are, each with a face drawn from who they are: their hair, glasses, beard or
cap where their description says, grey with age, a smile once they are warm
to you, a frown when they are not, a blush once there is a spark. The same
face is on their People card. An adult who has noticed you has hearts under
their name, one for each step: has noticed you, wants you (or is using you),
sweet on you, falling for you. Tap a face for what you can do with them in
one tap, nothing typed: **Talk** (Say mode, to them), **Spend time**,
**Flirt** (a flirt, settled exactly as one you type: the charm roll, their
answer), **Play cards** (the dealer) and **Profile** (their card). The strip
steps aside while a table is open and while a phone's keyboard is up.

**Time with someone.** **Spend time** (the strip, or their open People card)
is played at a table in the story, the way a hand of cards is: their face,
how they stand and their hearts, your read of them ("Jodie keeps things to
herself"), five pips for how it is going, and their tracks as bars (Knows
you, Likes you, Trusts you, Spark, Romance, with ticks where something
opens: a flirt being taken as one, each step of the hearts, the night). It
is four moments; at each you pick a move and the game settles it on the
spot, the die shown:

- **Ask about them** (Wits; easy with someone open, hard with someone
  guarded until they trust you): they talk and you listen; on a 20 they tell
  you something private; a failure is prying.
- **Make them laugh** (Charm; easy with the kind, hard with the proud and
  the gloomy): a 1 is a joke that lands wrong.
- **Tell them something true** (no roll, once): a confidence.
- **Treat them** ($8, no roll, once, and once a day as any gift is).
- **Flirt with them** (Charm, at how hard they are to win over, by the same
  rule as a flirt you type): "Hold their eye" once there is a spark of 20,
  "Kiss them" at 40. It is not offered until they know you well enough (the
  button says "Too soon"), a no closes it for the sitting, and whoever is
  sweet on you and watching minds.

Each button says its stat and your chance. Things going well make the next
roll easier; going badly, harder; at nothing they find somewhere else to
be. **Leave it there** ends it early, and so does Stop; what happened
stands. `/undo` takes the whole of it back. When it ends the table shows
what moved ("Spark +10 · Likes you +7 · Knows you +5"), the story tells all
of it in one go, and an hour or more has passed. It is worth one very good
turn and no more: the game's own limits on what one turn and one day can
move still hold. You can spend time with someone once in a morning,
afternoon, evening or night, if they are an adult (and you are), are free,
and do not dislike you. Nobody under 18 ever has hearts, Spark, Romance,
Spend time or Flirt, and with you under 18 nobody does.

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

**Cards.** When Curtis Pruett is at the Low Water (afternoons, evenings and
nights), there is a card game at the back table, played at a table the story
shows you: five-card draw or Texas hold'em, the one with two cards each and
five on the board. Tap Curtis in the strip of faces and **Play cards** to
sit in with nothing typed, and when a hand is over **Deal again ($20)** is
under the story: the next hand at the same stake, at once, told in one plain
line with no wait for the story, so you can play hand after hand; type
anything and the story picks up again. If you say something with the bet
("I will kick your ass, let's play"), you are answered first, in a line or
two above the table, then the hand is played and told; a line that is only
the bet ("Deal me in for twenty") opens the table at once. Or say you bet, in Do or in Say mode ("I put $50 in", "deal
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
| API key, Check key, Remember on this device | Your Anthropic key and where it is kept (see How to play), with the warning beside Remember. **Check key** asks the API whether the key works (`GET /v1/models`, no tokens spent); a key with a space or a hidden character in it is caught before any call. |
| This session | The line at the top: "This session: 23 turns · $0.61", from the token counts the API reports. |
| Quality | **Thrifty**: Sonnet 5.5 narrates, Haiku 5.5 reads your action and keeps the books, all at low effort; about 1 cent a turn. **Standard** (the default): Opus 5.5 narrates at medium effort, Sonnet 5.5 parses at low and keeps the books at medium; about 4 to 5 cents a turn once warm (see What a turn costs). **Best**: Opus 5.5 and Sonnet 5.5 at high effort (the parser at medium); slower and dearer. Settings that match none of these show as Custom. |
| Advanced | The offline demo switch; the narrator model (writes the story, streamed) and the parser model (reads your action, records what changed after each turn as the bookkeeper, and writes the chronicle); the effort per role (narrator, parser, bookkeeper, chronicle: `low` / `medium` / `high`, sent as `output_config.effort`; higher means more thinking, slower and dearer). |
| Show dice rolls | Shows the quiet roll line, e.g. `Wits 14 + 2 = 16 vs 15 · Success`. |
| Narration style | **Casual** (the default): plain and direct, like someone running the game at the table, with short sentences, no similes and little scenery. **Literary**: the original style guide, tighter and more like a novel. Takes effect from the next narration. |
| Permadeath | Off by default. Off: at 0 HP you are robbed, captured, left in a gutter or rescued, chosen from the scene. On: the story ends. |
| Theme | Dark or Parchment. The first load follows the system's light or dark setting. |
| Text size | Small, Medium or Large reading text (16, 18 or 20 px). |
| Game: Re-read this game with the latest rules | Brings the game you have open up to the latest rules again: rewrites what people remember in the current short form, adds places people told you about, sets the clock back if it ran ahead of the story, fixes people the game made up, brings in the town's full cast, fills in the lived-in town, and gives the game its arc: the calendar, the council meeting, the ending and what loose ends still to come will cost (see Updating an older game). About four API calls. |

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

The **⋯** button lists the everyday ones (see Do and Say). While a turn runs
the Send button is **Stop**, and once the narration is in, a line you send
waits its turn (see How to play). `/undo`, loads, edits and updates wait
until no turn is running.

## Saves, export and import

- **Autosave** after every turn, in this browser's `localStorage`.
  **Continue** on the title screen picks it up, with a line under it saying
  who, which day and where ("Tomas Reed · Day 3 · The Low Water"). While
  there is an autosave, Continue is the first button and New game comes
  after it.
- **Undo history** (wave 16): the last 20 steps of the game in the autosave
  are kept in this browser's IndexedDB as well (a step is the whole game, too
  big for `localStorage`), written a moment after each step and when the page
  is hidden, so a phone that reloads a tab left in the background can still
  `/undo` after **Continue**. Only the game in the autosave has one: a new
  game, a slot, an import or the previous autosave start it empty. `/redo`
  is never kept.
- **Three named slots** in Save / Load (laptop: Save in the top bar; phone:
  Menu → Save / Load), or with `/save <name>`. A slot saved with its name
  left blank is named after you and the day ("Tomas Reed, Day 3").
- **Nothing is replaced without a copy.** Before the autosave is written with
  a different game, the old one is kept as the previous autosave: Save / Load
  lists it as "Previous autosave" with **Restore previous** (the two
  swap, so nothing is lost). New game, Load, Import and a slot's Update over
  an autosave that is in no slot ask first ("Replace the autosave?", with
  Keep it and Go ahead). A loaded game is drawn before anything is saved: if
  it cannot be shown, the game that was open comes back and nothing of the
  new one is written.
- **Two tabs.** When another tab writes the autosave, this one goes read only,
  with the bar "This game is open in another tab, so this tab is read-only."
  Nothing there plays a turn or changes the game (the box, Send, Wait, the ⋯
  list, Undo, Go there, Edit and the pronoun buttons are off; trying says once
  "This game is open in another tab. Press "Play here instead" to play it in
  this one."). **Play here instead** first loads the game as the other tab
  saved it, then plays it here, which makes the other tab the read-only one;
  an autosave it cannot read is kept as the previous autosave, and the banner
  says so. Loading or starting a game in a read-only tab plays it there.
- **Export current game** downloads a `.json` file named for the town, you
  and the day (`locketts-ferry-tomas-reed-day-3.json`), holding the full state
  and the town data, never the API key; Save / Load says when you last did
  ("Last exported: 3 days ago", or never). **Import from file** loads one on
  any device, so a game moves between laptop and phone. Saves carry their own
  copy of the town, so editing the town later does not break old saves.
- **Import checks.** A file over 5 MB is refused before it is read. A save
  whose shape is wrong is refused with the first problem found, and nothing
  changes: a record without its id or name, a list that is not a list, or a
  string longer than the game ever writes one (a history over 400 characters,
  a narration over 6,000, anything else over 4,000, the town's own history or
  setting over 8,000).
- **A damaged autosave** is explained on the title screen with **Download
  it**, which saves the stored text exactly as it is, as
  `damaged-autosave.json`.
- **A save from a newer build** of the game says so under Continue on the
  title screen and loads with a one-line warning ("Saved by a newer version;
  it may not play right here.") and is never updated.
- The game asks the browser once to keep its storage. If the browser refuses
  storage (private mode, full disk), a warning banner appears. Export to keep
  your game.

## Updating an older game

The rules for what people remember changed on 28 Oct 2026. People now
remember only what they would hold against you or thank you for later, as a
short line in their own words ("flirted with me", "told me to fuck off",
"lied about car trouble to get Dewayne outside"). Games saved before then hold
the old kind: long play-by-play accounts of whole scenes. Later rule changes
added steps of their own, listed below.

- **You don't have to do anything.** An older save loads and plays exactly as
  it is. Only new memories follow the new rules.
- **Update this game.** When the autosave is older, the title screen says
  "This game was saved under older rules" and shows **Update this game** next
  to **Continue**; Save / Load marks each older slot and gives it an
  **Update** button. Either one loads the game and re-reads everyone's
  memories: someone with old long ones keeps at most twelve short lines, the
  ones that matter to them, repeats merged on the earliest turn; someone whose
  lines are all short already (twelve words or fewer, twelve at most) is left
  alone, and loose ends and `/fact` lines stay exactly as they were. The feed
  says what happened ("Rewrote memories for 5 people: 23 memories became 9.");
  the game is autosaved, and an updated slot is saved back under its own name.
- **Settings → Game → Re-read this game with the latest rules** does the same
  for the game you have open, and you can run it again at any time.
- **Cost:** about one call to the parser model ($0.005 for two people with
  eight memories, live on 28 Oct 2026); more than about 40 memories go in a
  few calls. The offline demo rewrites by a fixed rule and makes no calls.
- **Step by step.** Each step stamps the game's rules version as it completes.
  If a step fails or is refused (no key, a network error, a refusal), only
  that step is taken back and the feed says which; the details are in the
  Debug tab. The whole update is one `/undo` step.

The steps after the memory rewrite, each added when the rules changed, run in
the same update and each says in the feed what it did ("Added 1 place people
told you about: Dewayne's house.", "The clock matches the story."):

| Rules version | Step | What it does to an older game | Calls |
|---|---|---|---|
| 3 (28 Oct 2026) | Places people told you about | Reads the story so far for places people named and adds them as "heard of" | One to the parser model; the offline demo by a fixed rule |
| 4 (29 Oct 2026) | Clock follows the story | Sets the clock back when the last six turns are clearly still earlier (the night before, say); never forward, and the town does not move on | One, none on a first morning |
| 5 (29 Oct 2026) | People match the story | Corrects anyone the game made up ("Mavis Toler", a man, whom the story calls Dewayne's wife) to what the characters say about them | One, none when nobody was made up |
| 6 (29 Oct 2026) | A full cast | Adds every cast member and home the game lacks and folds each made-up person into the cast member they were (Mavis Toler is Mavis Mangum), with their memories and feelings; anyone nobody matches is kept and named | None |
| 7 (29 Oct 2026) | A lived-in town | Fills in ages, histories, the dead, the people elsewhere, the new places and the places out of town, never over what the game has | None |
| 9 (1 Nov 2026) | People who remember | Gives everyone's feelings about you their reasons: each memory gets the kind of thing it was and how long it lasts; trust, fear and how well they know you are worked out from them, and anyone who would have told you their secret still will; how much they like you stays exactly as it was. Someone who was holding your secret over you now has a record of it. A council or ending still to come weighs trust | None |
| 10 (1 Nov 2026) | A town that talks | Ties between people (family, work, friends and the town's secrets) start to count: from now on what you do to someone reaches the people close to them, overnight for a husband or wife, by the next morning for family and work; nothing that already happened is spread again | None |
| 11 (9 Nov 2026) | A story pack | Names the story pack the game plays from (its id, version and fingerprint), so the game keeps its own story whatever is in your library later: a game of Lockett's Ferry plays from the built-in pack, Low Water 1.0.0; a game of a town of your own plays from that town under the built-in rules. Nothing in the game changes. The feed says "This game now plays from the story pack Low Water 1.0.0." | None |

- **An arc** (added 30 Oct 2026, rules version 8). Games from before this
  change have no calendar, council meeting, ending, ledger of what you owe or
  town news. The update gives the game's copy of the town the calendar, the
  town events and the ending, its rumours their tellers and threads, and its
  threads their rewards, filling in only what is missing (a town of your own
  is never overwritten), and starts the news, obligations, bans and events
  lists. A loose end whose moment has not come yet gets the obligation its
  option now carries (an undelivered letter goes into your pocket); one that
  has come gets nothing, since a debt invented now would contradict the story.
  A grudge or favour still to come gets its template's effects, and a seed
  still to come the words the town and its loose ends now give it. It also
  gives
  the town's plans as the town now writes them (each clock's ending, what it
  checks first and what happens instead), so an older game's council does not
  vote before its meeting; a game updated earlier gets them from a Re-read.
  The feed says, for example, "2 loose ends still to come now carry
  obligations. 14 of the town's plans now check the story before they
  happen." No call.

A ban saved by an earlier build ends a day earlier than it did: since 30 Oct
2026 "until day N" means welcome again on day N.

What people hold (1 Nov 2026) needs no step: an older game loads with nobody
holding anything over anyone and no secret shown yet; the romance list and
what its people hold (how heavy a secret is, its words, what they can raise)
come from the built-in town wherever the game's copy has none; a secret loose
end tied before then holds nothing over you beyond the blackmail it already
carries (version 9 gives it its record), and that blackmail, met, is silence
paid for.

**People who remember** (version 9) is worked out from what the game already
holds, with no call: the game's own lines ("knocked me down in a fight at the
Low Water", "let the four hundred go past due, so I took the phone") are
recognised as what they were before any line is read by its words, so a
repo man's own line is never your theft. The feed says what it did ("People
now remember why: 5 people's memories now carry what they did to how they
feel. 1 person has something on you. The council now weighs trust."), and a
game already up to date says "People already remember why." **What does not
reach an older game:** a secret shown before the update (nobody holds it
over anyone), jealousy and fear from before it, trust built by confidences
before it (beyond the trust worked out from how much they liked you, and the
secret anyone would have told you), and what you asked people before it (so
a lie of yours the bookkeeper catches later needs one told after the update,
or a claim on record). **Rewrite memories in the short form first**
(Settings → Game, off by default) makes Update and Re-read run the memory
rewrite (version 2's step, a call to the parser model, cents for the whole
cast) before version 9, so very long old lines become short ones first.

**A town that talks** (version 10) makes the ties a new game starts with, for
the people in town: both sides of every relation, the town's own ties (its
secrets among them) and the people of one faction; a tie the game already
has is never changed. Nothing that already happened is spread again: a fight
from before the update reaches nobody new, and until the update nothing
travels at all. The feed says "People now feel for each other: 121 ties
between 40 people. What you do from now on reaches the people close to them."
(a game already up to date: "People already feel for each other."). No call.

**A kiss lands on the one kissed** (3 Nov 2026) needs no step and changes no
version: from the next turn a flirt finds its target as People says. A kiss
already in an older game's story before then is not read again, so someone
who kissed you back then may show no interest on their card; set
Spark (then "Interested") on the person's card (Edit) to where the story is.

**Anyone can be won over, some the hard way** (3 Nov 2026) needs no step and
changes no version: an older game's town copy reads its romance list as
tuning from the next turn (an old `open: false` no longer shuts anyone out,
an old `faithful: true` is very hard), every adult has Interested on the
Edit form, and from then on a flirt rolls charm as People says.

**Romance is its own track** (3 Nov 2026) needs no step and changes no
version: an older game loads with romance 0 for everyone and everything
else as it was. Someone who was "sweet on you" by the old reading (a spark
and real liking) may read "wants you" or "has noticed you" until romance
grows; set Romance on their card (Edit) to where the story is.

**A story pack** (version 11, wave 37) names the pack a game plays from.
Since wave 37 a save also carries a reference to its pack (`saveVersion` 2:
the pack's id, version and fingerprint), a local save of a story other than
Low Water keeps a frozen copy of that exact pack on the device, and an
exported save carries the whole pack, so it plays on another device even
if that device has never seen the story. An older save loads as it always
did. Two things change for a game of Low Water from wave 37 on: a night
together rolls the intimacy roll (charm at normal; the yes stands, the roll
shapes the night), which also moves the seeded dice after it, and the
story is rated adult, so Continue asks the 18+ question once before the
first turn. See Creator Mode.

Behind the scenes a save carries `state.meta.rulesVersion` (11 now; a save
without it reads as 1). The steps that bring a game up to date are listed in
`Upgrade.MIGRATIONS` in `index.html`.

The bookkeeper's reply format gained three fields with this change (people
hurt, arrested, gone or dead; memories a turn settled; obligations met). Since
wave 28 its people are one field, `socialEvents` (one line each, "npc_id
event: the memory"), in place of the three it had for attitudes, memories and
what a turn settled: 34 properties and 3 enums (41 and 4 before, the shape
known to pass the API's grammar limit), with an 11-field core to fall back
on; the parser's reply is 14 fields with `romantic`. Neither has been sent to
the live API yet (see Verified against the live API).

## What a turn costs

The defaults (the Standard preset) are set for the best play-through, not the
cheapest. Prices are those in `docs/API_NOTES.md`: Opus 5.5 at $4 / $20 per
million input / output tokens, Sonnet 5.5 at $2 / $10, both $0.20 for a
cache read; Haiku 5.5 at $0.10 / $0.50.

Every narration carries three cached system blocks: the style guide (since
wave 28 with the one-line fade-to-black rule, about 18 tokens), the town and
the cast. Together they are about 12,700 tokens by the api suite's
estimate of 1.4 tokens a word (it fails over 13,000), nearer 15,000 at 3.5
characters a token. Read from the cache they cost about 0.3 cents a
narration; writing them costs twice the input price on Opus, about 10 to 12
cents.

**Warm and cold.** The cache is kept for an hour (`ttl: '1h'`), so the write
(about 25 times a read) is paid once a session and again only after an hour
away, not after every five-minute pause; coming back after more than 50
minutes, the game warms the cache with a one-token call while your action is
being read, so the narration finds it warm.

These figures come from the playtest suite's cost test, which measures the
packets the game builds over a 15-input mock session and prices them at the
default models (tokens estimated at 3.5 characters each, output assumed):

| Call | Input per turn | Output assumed |
|---|---|---|
| Parser | ~5,500 tokens (packet ~12,000 characters, system prompt 4,200, schema 3,000) | ~90 |
| Narrator | ~2,000 tokens of packet (7,100 characters on average, at most 9,500) plus the cached blocks | ~120 |
| Bookkeeper | ~4,700 tokens (packet ~6,900 characters, system prompt 4,700 with the events' rubric, schema 4,900) | ~180 |
| Chronicle (every ten turns or so) | ~1,100 tokens | ~110 |

- A warm turn is about **3.7 cents** with no thinking and about 4.3 cents with
  some 150 thinking tokens a call; at medium effort the models often think
  longer, so expect 4 to 5 cents. A hundred warm turns are about $3.65 to
  $4.25 plus the cache writes.
- The first narration of a session, or the first after an hour away, adds
  the cache write: about 12 cents.
- `/look`, `/rest`, `/wait` and `/skip` call only the narrator (plus the
  bookkeeper when they tell something due, such as the morning's visitor
  after a sleep: one more call then): about 1.4 to 1.7 cents.
- A narration with a hard style problem (more than 15 words over the length
  limit, a past invented on day 1, "What do you do?" outside dialogue, a
  person or place the town does not have) is rewritten once, one more narrator
  call. Softer problems (a simile, a banned phrase, a few words over, a
  capitalised word nothing marks as a name, such as a brand) never cause a
  rewrite on their own. The first draft stays on screen, dimmed, until the
  rewrite is in (and stays if it fails).
- Thrifty is about 1 cent a turn; Best costs more for the extra thinking.
- None of this was measured against the live API this round. The Debug tab
  shows the real token counts and cost for the turn and the session, a
  retried call included, and Settings shows the session's total.

**When a call fails or stalls.** A reply that stops arriving gives up after
45 seconds with nothing new (two minutes in all for the parser and the
bookkeeper). A busy or failing API (429, 500, 502, 503, 504, 529, a network
error, a stream cut short) is tried once more, after the wait the API asks
for (at most 10 seconds) or 1.5 seconds. A reply cut off by its length limit
is asked for again with twice the room and is never saved half finished.
Either way, if the turn fails, nothing changes and your words go back in the
box.

## Creator Mode

Since wave 37 the game plays story packs: one JSON file holds a whole story
(the town, its people and what is going on, who the player can be, how it
opens, and dials for how the narrator writes and how the rules play), and the
one engine plays any of them. The owner wanted to "convert the story to a
json" with "No hard coded story allowed", and the story itself kept
human-written: "ideally as little as possible generative AI in the creator
mode". So the editor's forms need no AI and no key, and the one AI feature,
the Story to Pack converter, only sorts the author's own prose into fields,
quoting the sentence each value came from, and invents nothing.

- **Create** on the title screen opens the Library: a card for each story,
  with Play this story and Open in Creator. New story starts a blank draft;
  Open in Creator on Low Water opens a copy of it to learn from; Import a
  .json reads a pack someone gave you.
- **The editor** has a tab for each part of a pack (Overview, World,
  Player, Opening, Narrator, Directions, Rules, Freedom, Prompts), the pack
  as JSON, Prompt view (exactly what the models would be sent, nothing
  sent), and Test (a real game from the draft, with the Dev tab in play). A
  meter in its header shows the cached prompt against the 13,000-token
  budget. Drafts save themselves on the device; Save puts the pack in the
  Library.
- **Two packs.** Low Water, built in (`packs/low-water.json`, inlined into
  `index.html` by `node tests/pack-inline.cjs`), and a starport sample,
  `packs/starport.json`, a second, smaller story (credits after the number,
  a security chief for the law, a brig), shipped as a file to import so the
  page stays its size.
- **Sharing is by file only.** Export opens a share sheet (Download, Share,
  Copy JSON); import cleans and checks every pack first and refuses one with
  an error, naming where. A pack never holds a key or a save, and there is
  no server: every player uses their own key or the offline demo.
- **Some rules no pack can change**: the code rolls the dice and owns every
  number, the narrator describes only what the game has, every data call
  uses a schema, a pack is data, a refusal stays a refusal, and an author's
  text goes in labelled slots with the engine's rules after it. A story
  rated adult asks the player's 18+ yes once before it plays.

**`docs/CREATOR_GUIDE.md`** is the guide for writing a pack: every tab and
every field with an example, the fixed rules, who wins between the engine,
the pack and the player's per-story Settings, the budget, testing, the
rating gate, sharing, the converter and troubleshooting. Its field list is
generated from the format's own definition (`node tests/guide-doc.cjs`), so
it never falls behind. The engineering notes are `docs/notes/creator-mode.md`.

## Editing the town

The town is the built-in story pack, one JSON file, `packs/low-water.json`:
its `world` (places, people, factions and their clocks, threads, seeds,
rumours, the calendar, town events and the ending, the random `tables` and
the grudge and favour templates) and its `player` (backgrounds, flaws, loose
ends and goal suggestions). There are two ways to change it.

- **In the game**: Create, then Open in Creator on Low Water, edits a copy
  with the editor (see Creator Mode and `docs/CREATOR_GUIDE.md`). Export it
  to keep it as a file. The built-in story itself never changes in the app.
- **By hand, for the built-in story**: edit `packs/low-water.json`, never the
  copy in `index.html`; `node tests/pack-inline.cjs` inlines it into the page
  (CI runs it with `--check`, which fails when the two differ), and `node
  tests/validate-pack.cjs` validates it (`node tests/validate-pack.cjs
  my-pack.json` validates any pack file).

Every field of the format, with what it takes and an example, is in
`docs/CREATOR_GUIDE.md` ("Every field", generated from the format's
definition); the effect ops' fields are in `docs/BUILD_PLAN.md` ("Effect
ops"). The paths below are the pack's.

The fields that make the town move:

- `world.calendar = { season, startDate }` (day 1 is that date); a
  place's `closedOn: ["Sunday"]`; a person's `awayOn: { days, phases, where }`
  (school days).
- Faction clocks of 4 to 10 `segments`, and on a clock's `onComplete`
  and on a seed, `requires: { npcFree, npcAt, flagsSet, flagsUnset,
  obligationOpen }` with an `alt: { text, effects }` for when it does not
  hold. Seeds also take `effects` (applied when they fire), `notBeforeDay`
  and a list of places or people as a trigger's value (any of them).
- Effect ops beyond the original thirteen: `playerGold`, `playerHp`,
  `giveItem`, `takeItem`, `addCondition`, `banFrom`, `playerPrice`,
  `addMemory`, `clockAdjust`, `threadUpdate`, `addObligation`,
  `settleObligation` and `addNews`. Placeholders (`{npc}`, `{npcId}`,
  `{playerName}`) only in loose ends and templates. Wave 29 adds
  `owedSettle` (`{ npcId, dir? }`: a favour owed cleared, either way) and
  `leverageSet` (`{ id, status?, aware?, playerKnows?, knownBy?, tell?,
  use? }`: a leverage record's change; `id` may be `{leverageId}` in a
  template).
- `world.events` (the council meeting: a day, phase, place, `attendees`,
  and `branches` of `{ when, text, effects }` with a `default`; the first
  branch whose `when` holds wins) and `world.epilogue` (`onDay`,
  `orFlagsSet`, the same branches).
- Rumours: `tellerIds` (at least two people besides the source who can tell
  it), `threadId`, `factionId`. Threads: `reward` (the stat it raises).
- `player.looseEnds.<kind>.obligation` (the kind's default) and `obligations` (one
  per option, lined up with `options`): `{ kind, amount, dueOffset, text,
  itemName, onStart, onMiss, onMet }`.
- `player.backgrounds[].hook = { npcId, text, dayOffset, trigger }`, the first lead
  for a background.
- Grudge and favour templates: `effects`, `public`, `forTags` and
  `notForTags` (who can hold it).
- Goods: `kind` (`good`, `service`, `drink` or `food`); only goods are
  carried. Complications: objects `{ text, tiers, kinds, needsPerson,
  notDay1, effects }`.
- How people take things (wave 27): the `socialEvent` op (`{ npcId, event,
  text, weight?, act?, d?, scale?, secondhand?, public? }`, an event of the
  relationship table, `d` overriding the row within +/-50), which loose
  ends' obligations and the grudge templates use for a word kept or broken
  and what a third party hears. A person's `protector` (whom they go to when
  you frighten or hurt them: an id, a list, `"nobody"`, or `{ npcId, hidden:
  true }` for a tie the town does not know); `world.policeHead` (and `world.law.headNpcId`) (whom a
  report to the police goes to); a seed's `danger: true` (someone in trouble
  the player can step in on: the people its words name after the first, the
  one doing it; it needs a location trigger and `requires.npcFree` for
  everyone it names); grudge templates of kind `report`, with `to`
  (`police` or `family`), `about` (`threat` or `violence`), a 1 to 2 day
  `dayOffset` and `{protector}` / `{protectorId}`.
- What people hold (wave 29): `world.romance` (wave 34: how easily each
  adult is won over, `{ npcId, sparkRate, opensAt: { knows }, difficulty }`:
  `sparkRate` 0.1 to 2 scales a welcome flirt's spark (and, wave 35, what
  grows romance, unless an optional `romanceRate` 0.1 to 2 says otherwise), `opensAt.knows` is
  how well they must know the player before a flirt is taken as one,
  `difficulty` (`easy`, `normal`, `hard`, `very_hard`) is the charm roll a
  flirt makes with them; adults only. Every adult can be interested whether
  listed or not; anyone not listed is rate 0.5, opens at knows 10, hard.
  Add an entry for anyone to make them easier or harder. `open` is gone;
  `faithful: true` still reads as `very_hard`), and on a person
  `secretWeight` (1 to 3: how heavy their secret is to hold over them),
  `leverageKeys` (the words that show it in a narration, two needed),
  `mattersTo` (whom it would be told to), `whenTold` (`{ memory, crime,
  inquiry, news }`: what the police do when it is told them), `canRaise`
  (what they can pay for silence: $100 by default, at most three above 100,
  $0 for anyone under 18) and `mercenary: true` (money counts double with
  them, blackmail half, and they name prices). A true rumour's
  `leverageOver` (the person a hearer holds it over). Grudge templates of
  kind `tell` and `price` (what a holder does with what they hold: `{leverageId}`,
  `{price}`, `{amount}`) and favour templates of kind `ask` (a favour the
  player owes, asked back, by the holder's tags).
- Where people stand (wave 30), in an event's or the ending's `when` and in
  a `requires`: `relAtLeast` and `relBelow`, `{ npcId: { liking, trust,
  fear, knows } }` (liking and trust -100 to 100, fear and knows 0 to 100;
  every track named must hold). The council reads them: Royce tables the vote with
  `relAtLeast: { npc_royce: { trust: 30, knows: 25 } }`, gives the friendly
  face from the back row at `{ liking: 15 }` with `playerAt`, and has second
  thoughts after Carter bought him at `{ trust: 20 }`; the ending's Loretta
  line is `{ liking: 40 }`. `attitudeAtLeast` still works and reads liking.
  Spark is not readable by a condition, and there is no branch on fear.
- How people feel about each other (wave 31): `world.ties`, `[{ from,
  to, kind?, w, t, hidden?, revealedBy?: { rumours?, flags? }, why? }]`.
  Every relation in the cast is already a tie both ways with its kind's
  liking and trust (`w`, `t`, -100 to 100: a parent toward a child 70/30, a
  child toward a parent 50/40, a husband or wife 50/40, a boss toward an
  employee 20/20, and so on); an entry for two people with a relation sets
  one side's numbers, one for two without names its `kind` (`lover`,
  `enemy`, `payer`, `friend`, `other` or any relation kind). `hidden: true`
  is a tie the town does not know (news travels through it and nobody says
  why), and it needs `revealedBy`: rumour ids that show it when heard, or
  flag names that show it when set (a leverage record whose words name it
  does too). One entry a direction; `why` says it in plain words, naming
  only the cast. A clock's arrest may name its officer: `npcStatus` with
  `by` (someone tagged police; else the police head), whose arrest turns the
  family of the arrested against them.
- Ties that change (wave 32): `world.secretTies`, `[{ secretOf,
  learnedBy, ties: [{ from, to, w?, t? }], why, seed? }]`: when the player
  tells `learnedBy` what they hold over `secretOf` (who must have a secret),
  each tie listed moves by liking `w` and trust `t` (whole numbers within
  +/-100), known from then on; `why` is the few words the narrator gets
  ("the garage money"); `seed: { effect, dayOffset: [lo, hi] }` is what it
  sets going. One entry a secret and a listener. Effect ops: `tieDelta`
  (`{ fromId, toId, w?, t?, known?, why }`: a change in how one person feels
  about another, `why` 80 characters at most; a clock's completion may carry
  one besides its five) and `propagate` (`{ npcId, event, factor?, via?,
  text? }`: what someone says or does reaches the people tied to them, as if
  the event had been done to them; `via` `now`, `overnight`, `morning` or
  `meet`, else by each tie; `text` what they would remember). Three grudge
  templates (the gossip at the landing, at Wednesday supper and in the
  department) pass the word along their holder's ties this way.

After editing, run:

```
node tests/validate-pack.cjs
```

It checks every field and cross-reference. For the cast: unique ids and
names, pronouns that match the look, a real role, relations written on both
sides with matching words, homes, a place in every phase, ages that fit looks
and families, histories, the dead and the people elsewhere. For places:
symmetric exits, homes reachable from the map, details, hours and history,
hours that name a shut day matched by `closedOn`, someone in every public
place. For the moving parts: the calendar, school days for the teacher and
the teenagers, rumours (10 to 20, two tellers each), clock lengths (4 to
10), `requires` and `alt`, events and the ending, every flag a condition
reads set somewhere, every effect op and its fields, obligations, a grudge
and a favour for everyone in town and no beating from the old, the young or
the police, no template that assumes your phone or a vehicle, the
backgrounds' phone and hook, goods' kinds, the goal suggestions and the
narrator's example turns. Its `engine.mention.*` rules fail a name, a place
or a crowd the content mentions with no record. It lists every problem
it finds and exits 1. After changing the cast, regenerate the roster:

```
node tests/cast-doc.cjs           # rewrites docs/CAST.md from the data
node tests/cast-doc.cjs --check   # exits 1 when docs/CAST.md is out of date (the content suite runs this)
node tests/guide-doc.cjs          # rewrites the field list of docs/CREATOR_GUIDE.md after a change to Pack.SCHEMA
node tests/guide-doc.cjs --check  # exits 1 when it is out of date or an example names a field the format lacks (tests/run.cjs runs this)
```

A game already in progress keeps the town it started with.

## Last Call (`index.html`)

The front page: a hidden-role game of lying and deduction at one table, the
doors shut for the night. The other seats have the names and faces of the
town game's adults and nothing else of it. Some of the people shut in are
**Knives**.
Each night the Knives take one person out of the game; each day the table
talks and then votes one person out, whose role is shown. Town wins when
every Knife is out; the Knives win when they are as many as everyone else.

- **Seats and roles**: 6 (one Knife), 8 (two) or 10 (three). One of the Town
  is the **Witness**, who learns each night whether one person is a Knife.
  At eight seats or more one is the **Watch**, who guards one person a
  night. **Wild cards** (on unless you turn them off): at eight a **Fool**,
  on nobody's side, who wins alone the moment the table votes them out; at
  ten a **Hothead** too, who is Town and takes one person with them when
  they go. You can ask for a role or be dealt one. If you are a Knife your
  fellow Knife whispers who they would take, and you choose.
- **The table is the screen**: everyone's face round it, yours at the foot.
  Tap a face to aim at them, to mark them (Suspect or Trust, a ring only you
  see), to pick them at night or to vote for them. **Call the vote** is in
  the middle of the table (on a phone, under the strip of faces).
- **A live table**: the day is not rounds. The table talks on by itself,
  like a group chat, and you say something whenever you like; nothing waits
  for you and there is nothing to pass. Whoever is typing is shown typing
  (a ring on their seat, their face and three dots under the last message),
  sometimes two at once. The talk ends when you call the vote, when more
  than half of the seats have said they would vote, or when it gets late
  (two messages a seat and two more, a few more when you talk). The table
  holds a moment while you are typing, about four seconds after a question
  is put to you, and while the page is not being looked at. On the first
  screen **The talk** can be set to **In turns** instead: you speak or
  pass, then two or three of them do.
- **Who speaks follows the talk, not a rota**: whoever you spoke to
  answers you (two of the table at once, neither seeing the other's, when
  you spoke to everyone); the morning's first words are about the night;
  whoever is accused or asked answers; otherwise anyone, by how much each
  of them talks (each is dealt that: some never stop, some lurk). Nobody
  speaks twice running, and two who have gone at each other three times
  are cut in on.
- **They write like people in a group chat**: each seat is dealt a way of
  typing for the game (all lowercase, capitals and full stops like a text
  to the boss, as few words as possible, CAPS on the one word, trailing
  off, swearing, fast and unfixed) and told to write the way people really
  type, never the way a book or an assistant does: fragments, no names in
  every line, nothing that sounds written. Lower case and the dropped last
  full stop are also done to what comes back, so the table reads as eight
  hands. About one message in five, when nobody is owed an answer, is only
  a reaction ("ugh", "can we just vote"); a seat may send a second short
  message straight after its first.
- **They play like people who want to win**: nobody at the table is a
  detective giving a summing-up, and nobody is a fool. Each seat is dealt a
  temperament for the game (trusts a read of people, takes an accusation
  personally, builds on a point sooner than start a fight, wary, keeps it
  light, quiet, confident, dislikes a pile-on, pushes, no patience for
  waffle; one, and only one, keeps track of the votes). It is a lean on a
  sharp player, never a script. A few have a slight hunch in the morning,
  to be dropped when the table gives them something better. Each is told
  every turn how much to send, and a seat that goes on anyway is cut off.
- **They carry things**: each seat is told what it is carrying into the
  day (who voted to put it out yesterday, whether its own vote was right,
  who came after it and who stood up for it) and is given back how it said
  it felt, privately, the last time it spoke.
- **One tap says it**: under the chat is a row of quick replies aimed at
  whoever you picked (tap their face, or anything they said) or chose to
  answer: **It's you. Liar. Why? I'm with you. Not me.** Each is said at
  once, by name. Or type your own in the box and **Send**.
- **A phone first**: the story is a chat. Everyone else's messages are on
  the left under their name (a colour each), yours on the right. While the
  table talks, a phone (or any short window) folds the round table to a
  strip: the others' faces in a row (two rows at ten seats) over one line
  with the count and **Call the vote**, so the chat has the screen. A face
  in the strip is the seat it was: tap it to aim or to mark. The round
  table is back for the night, the morning and the vote. With the keyboard
  up the table steps aside altogether.
- **It is told like a night at the table**: a host has one line in the
  morning (who is found, and where) and one at the vote. The night is
  played step by step (everyone shuts their eyes, the Knives open theirs,
  the Witness looks, the Watch keeps a door). Someone accused scowls and
  gets a mark over their seat until they answer. At the vote everyone
  points at once and the lines are drawn across the table one by one.
  Whoever is voted out has their **last words** before their role is
  shown (you too: the table waits for yours). When it is over, **The
  reveal** shows every role, how each went, how each voted and what each
  was privately thinking.
- **Waiting on you**: anything put to you, a question or an accusation, is
  marked "to you" in the story, puts a mark on that person's seat, and is
  listed above the box until you deal with it. Tap one to aim the quick
  replies and the box at that person; a reply to them, or a line that names
  them, answers theirs; × sets one aside; the vote clears the rest.
- **The table is all there is**: the seats are told that the only evidence
  is what happens at the table (what is said, who accuses and defends whom,
  the votes, who is taken and what they were, what is claimed). Nobody saw
  anything in the night, and where anyone was or was going means nothing,
  and nobody can see anybody's face, so they do not ask and do not say who
  is sweating. They are given no town either: to the others a seat is a
  name, with no job, no ties and no life outside the room, and it is told
  to talk about the game and nothing else.
- **Who plays the others**: with an Anthropic API key, Claude does, one call
  for each seat each time it speaks, votes or chooses in the night, in that
  person's own way of talking. A
  seat is told the public record, its own role and its own private
  knowledge and nothing else, so a Town seat has to work it out as you do
  and a Knife has to lie. The host is a call of its own, told only what
  everyone can see, and what it says is colour: it is never given to a seat
  as evidence. The code deals the roles, counts the votes and decides who
  is out and who has won; nothing a model says can change that. The key the
  town game remembers is used if there is one; a key typed here is kept for
  the tab only and is never saved with the game. The line under the box
  shows the model, the calls so far and what they have cost; a game is
  roughly 80 to 150 short calls. The model is Claude Opus 5.5 unless you
  pick another.
- **Offline demo**: no key and no calls; the others follow a simple script
  (they point at whoever has been pointed at, defend themselves, read the
  last vote) and the host reads from a short list. It teaches the game; it
  does not play it well. A seat whose call fails plays from the same script
  for that turn, and one line says so.
- **Out of the game** you see every role and can watch the rest, or **Skip
  to the end** (played by the script at once, with no calls). A table you
  leave is kept: **Continue** on the first screen picks it up.

## Running the tests

```
node tests/run.cjs              # everything: the pack check and the guide check, then every tests/*.test.cjs
node tests/run.cjs acceptance   # only files whose name contains "acceptance"
TEST_FILTER='\[4\]' node tests/acceptance.test.cjs     # tests whose title matches
PLAYTEST_TRANSCRIPT=1 node tests/playtest.test.cjs     # print the 30-turn playtest's story
UI_SHOTS=/some/folder node tests/ui-fixes.test.cjs     # keep the screenshots the UI suite takes there
ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs       # the live grammar probe (needs a key; not part of run.cjs)
```

The tests drive the game in headless Chromium with Playwright, in mock mode,
from `file://`, with the network blocked. Playwright is preinstalled in the
build environment. Elsewhere, install it outside this folder (as the CI
workflow does) and point `NODE_PATH` at it, because
`tests/constraints.test.cjs` checks there is no `package.json` here. There is
nothing else to install. The whole run is about 836 tests and takes fifteen to
twenty minutes. `tests/wave30-rel-people.test.cjs` builds its older save from
commit `56e69f5`'s `index.html`, so it needs the git history (a shallow clone
fails it with a message saying so; the CI checkout fetches it all).

- `acceptance`: the twelve acceptance checks of SPEC.md section 14.
  `playtest`: a scripted 30+ turn game, the pacing reports, and the cost
  estimate, which fails outside a band (1 to 6 cents a warm turn, under 8
  with thinking, a cache write under 12). `mobile`: phone sizes. `constraints`:
  the single-file rules (no `innerHTML`; `fetch` only to the two API
  endpoints). `upgrade`: every update step, in mock mode and against canned
  API replies. `content`: the cast, the calendar, loose ends binding in a
  real game, grudges and favours, the council meeting and the ending, and
  `docs/CAST.md` up to date.
- One suite per area of the review fixes: `engine-state-fixes`,
  `engine-world-fixes`, `prompts-fixes`, `transport-fixes` and `ui-fixes`,
  `wave2-fixes` to `wave9-fixes` for the later rounds, `wave10-cards`
  for the card table, and `integration` for the seams between them.
- `shell`, `state`, `pipeline`, `api`, `world`, `map` and `settings`: the
  milestone suites.
- `wave22-appointments`, `wave25-arrivals` and `wave26-objectives` for
  meetings kept, narrated arrivals and the Objectives tab (main's own wave
  26, built alongside the relationship branch's);
- `lastcall` for Last Call (`index.html`): the deal and the wild cards, the
  rules, a whole scripted game with the host and the reveal, last words, the
  Fool and the Hothead, what is waiting on the player and the quick replies,
  what the player says being answered, the temperaments, the ways of
  typing and the lengths (a seat that goes on is cut off), a live table
  talking on by itself (who is typing, the player speaking meanwhile, two
  answering at once, the vote dropping what was being typed, a reload in
  the middle of it), what a seat carries from one day to the next, the talk
  ending when most would vote, two at each other being cut in on, the
  Claude path against a stand-in API (the request, what each seat and the
  host are told, a failed call), the player out, phone widths, the table
  as a strip of faces while a phone's table talks, and the keyboard up;
- `wave38-date` for the faces, the strip of who is here, the date table,
  Deal again and the one-tap flirt; `wave39-table-talk` for words said with
  a bet being answered before the cards;
- `wave26-rel-tracks`, `wave27-rel-engine`, `wave28-social-events`,
  `wave29-rel-hold` and `wave30-rel-people` for the relationship system by
  wave (wave 30: the People card, the editor, the feed, `/recap`, the
  narrator's "to you" line and the cached blocks, the council, rules version
  9 on a save built by the 56e69f5 build's own code from
  `tests/fixtures/make-v8-save.cjs`, and the simulator's eight-day guard),
  `wave31-town-ties` (the ties, word getting round by the kind of tie, the
  household rule, the police and clergy's limits, the arrest route, rules
  version 10), `wave32-ties-change` (a secret told changing a tie and who
  told reaching the one it was about, badmouthing and vouching, a grudge's
  gossip along the ties, the town's standing, BETWEEN THEM);
  `relationships` for its permanent checks (the minor rule and coercion, the
  anchors, the fallbacks, a fuzz of the wire); `relationships-examples` for
  the design's worked examples played through.
- `tests/probe-grammar.cjs` is not a test file: it sends the bookkeeper's
  and the parser's schemas to the live API (`PROBE_DRY=1` builds the
  requests and stops before the network; `PROBE_MODELS=a,b` picks the
  models).
- `tests/relationships-sim.cjs` is the 21-day simulator: three playstyles
  (a round nightly for Royce and Curtis, Royce's confidant, a brawler at the
  Low Water) played in mock mode, each person's tracks and stance printed
  every morning. `node tests/relationships-sim.cjs beer --days 8` runs one;
  `--assert` exits 1 when a band fails. Its eight-day cut runs in the suite.
- `tests/eval-classify.cjs` is the labelled eval of the bookkeeper's acts and
  the romantic-intent lines, against `tests/eval/labelled.jsonl`. It ships
  empty: turn on Settings → Advanced → "Keep bookkeeper packets", play, press
  **Export bookkeeper turns** in Debug, and label each line by hand with the
  act a neutral witness would name (`"labels": [{ "npcId": "npc_royce",
  "event": "insulted" }]`, an empty list for none; the script's header has the
  whole shape). `EVAL_DRY=1` (or no key) builds every request and stops; with
  `ANTHROPIC_API_KEY` set it reports exact accuracy, the neighbour
  confusions, the romantic recall for minors and the cost.

`.github/workflows/tests.yml` runs `node tests/run.cjs` on every push and pull
request (Node 20, Playwright and Chromium installed outside the checkout).

## Deliberate deviations from SPEC.md

From `docs/BUILD_PLAN.md`:

- API version header is `2026-10-21`, not `2023-06-01` (`docs/API_NOTES.md`).
- JSON comes from structured outputs, not forced tool use, because forced
  `tool_choice` is rejected on Sonnet 5.5 and Opus 5.5 and the models are
  user-editable.
- `max_tokens` are larger than the spec's because thinking tokens count toward
  them; narration length is enforced by prompt and style check.
- All milestones are built in one session with a commit per milestone, instead
  of pausing for manual testing between them, because the session runs
  unattended. Each milestone is verified by Playwright tests instead.

Also from `docs/BUILD_PLAN.md` ("Setting change: modern day"): the town is
present-day, not low fantasy. The narrator's example turns are modern scenes,
and money is shown as dollars (the state field is still `player.gold`).

And from `docs/BUILD_PLAN.md` ("Direction changes"): narration is casual by
default, with the SPEC.md style guide kept as the Literary option, and the
input has the Do / Say switch described above. Direction change 8 (a full
cast): every person is written by hand and the game never creates one in play,
so SPEC.md's NPC creation in "check and create" (and the bookkeeper's new
people) is gone; loose ends tie to cast members instead of new NPCs. Direction
change 10 (the approved review, 30 Oct 2026): the offline demo is no longer
the default; the town keeps a calendar and an arc (obligations with due days,
town news, a council meeting on day 6 and an ending by day 21); seeds, clocks
and templates carry their effects in code; the retry lock no longer stops a
fight, and a success locks nothing (wave 2); the chronicle waits for 16 turns
and keeps the newest 6, so the narrator always has its last turns; the
narrator's cache lasts an hour instead of five minutes; and the casual example
turns are eight, written in the packet's own format.

And from the relationship plan (`docs/RELATIONSHIPS_PLAN.md`, waves 26 to 29):
the bookkeeper (SPEC.md section 10) no longer sends attitude deltas or
memories. It names what a person will remember of the turn as an event
(`socialEvents`, "npc_id event: the memory"), and the game decides what that
does to their liking, trust, fear and how well they know you; the parser
also says whether an action is romantic (`romantic`). The dice (SPEC.md
section 7) read trust as well as liking: a lie is harder to someone who
distrusts you and easier to someone who trusts you, anyone against you is at
least hard to ask, and someone afraid of you does a small thing with no
roll. Acceptance check 4 (three insults) holds with the numbers the events
give: insults compound (-10, -15, -22), a humiliation in front of others is
heavier, and the grudge comes at liking or trust -60.

Wave 29 (what people hold) adds to SPEC.md section 8's seeds: besides the
grudges and favours that grow from how someone feels, the engine plants seeds
from what people hold (a payment for silence the day after it is agreed, a
holder telling what they know or naming a price, an inquiry when a crime is
told to the police) and from favours owed (paid back unasked, or asked for
back), each on a dice stream of its own, so the shared dice and the clocks
stay exactly as they were. A spark and a night together are the engine's to
decide before narration, not the narrator's.

Wave 30 (what people show) changes what is shown of the numbers. SPEC.md
section 3's `attitude` stays on each person as the stored name for liking,
beside the record of all six tracks (`rel`). The narrator (sections 6 and 10)
is no longer sent "attitude -35": each person present has a "to you" line,
where they stand and up to two dated reasons, then how they play it now
("to you: cool to you, has something on you — you owe her four hundred
(Day 1) — plays it: civil and brief"), at most about 50 tokens a person, and
the example turn's "(Smith: gruff, short sentences, attitude −10.)" (section
9) reads "cool to you" in the example sets. The People panel (section 11)
shows that stance in words with its reasons, not a one-word attitude, and the
editor sets four tracks, not one number. A council or ending that read
attitude now reads trust where trust is the point.

Wave 31 (the town is a graph) adds to SPEC.md section 3's state the ties
between people (`ties`) and the news of the player on its way along them
(`hearsay`), and to section 8's living world one hop of it: what you do to
someone reaches the people tied to them, by the kind of tie and at most 15
of liking and of trust a turn through it, without an API call and without a
roll.

## Verified against the live API

**This round (30 Oct 2026) was not checked against the live API.** It was
verified in mock mode and against canned API replies served inside the
browser (`tests/api.test.cjs`, `tests/transport-fixes.test.cjs`). Before
relying on it with a key, a short live session should confirm:

- the bookkeeper's `record_changes`, now 34 properties and 3 enums (with its
  11-field core), and the parser's `parse_action`, now 14 fields with
  `romantic`, compile (the API refused 47 properties in an earlier probe with
  "compiled grammar too large"; 46 passed, and 41 since wave 17).
  `ANTHROPIC_API_KEY=… node tests/probe-grammar.cjs` posts the three and the
  41-property control from before wave 28 to the Standard and Thrifty
  models; it has not been run yet (it needs a key), and wave 28 waits on it;
- the 1-hour cache is accepted as `cache_control: { "type": "ephemeral",
  "ttl": "1h" }` on the narrator's system blocks, and the usage reports the
  write under `cache_creation.ephemeral_1h_input_tokens` (on the second
  narration `cache_read_input_tokens` should be above zero);
- **Check key** (`GET /v1/models` with the key) answers 200 for a good key and
  401 for a bad one, from `file://` under the page's content security policy;
- the real narrator with the newer packets: `TIME PASSED` ("… until morning,
  Day 4"), `ARREST`, a `DUE EVENT` that is the scene itself (the council
  meeting), `SINCE THE LAST TURN` (who came and went while time passed), and
  the narration read beside the "Meanwhile in town" lines and the Resolved
  lines held until their news is told;
- the real bookkeeper with money in Say mode: a part payment ("Here's fifty.
  I'll get you the rest Friday."), an order that buys ("I'll take a beer")
  and a gift ("Get yourself a beer"). The mock never moves money on a Say
  line, so only a live session shows what the bookkeeper sends there;
- how often the name check sends a narration back to be written again (the
  Debug tab's style entries), now that a first name and a surname before "is"
  or after "you watch" count as someone;
- what a turn really costs (the Debug tab's session cost, with the 1-hour
  cache writes).

The first live turns of this round (31 Oct 2026, on the Say-mode money rule)
found one thing the mock could not: told the player's cash on the CARRYING
line, the narrator had Jodie say "You've got five bucks left to your name"
after a $20 tip from $25. The packet now marks the cash as the player's alone,
both style guides forbid anyone naming it, and a spoken line that knows the
total is a hard style problem and is rewritten. Still to confirm live: the
rest of the list above, and that the rewrite rarely fires.

Earlier rounds were checked live: on 28 Oct 2026 an arrival, several turns,
the casual style and the Do / Say switch (every call 200, the cache read on
every narration after the first); on 29 Oct 2026 the clock fix through
**Update this game** (10 calls, $0.088).

If a request fails, the feed shows a short message and your typed action stays
in the box. Type `/debug` and look in the Debug tab:

- **API errors**: each failure with its role (parser, narrator, bookkeeper,
  chronicle), HTTP status, `request-id` and the API's own message, verbatim.
  A stall reads "timed out after 45 s with no data".
- **Last raw responses**: the latest exchanges, with status, request-id,
  stop reason, token usage and the reply.
- **API (claude)**: token and cost totals for the turn and the session, the
  1-hour cache writes after the cost, and the narrator's `cache_control`. On
  the second narration, "cache read" should be above zero.

Usual causes: 401, a bad key (Settings → Check key); 404, a model name the
API does not know (check the model fields under Advanced); 400, a request the
API rejects (the message says what; please report it); 429, 5xx or 529,
busy, already retried once, so try again. To keep playing while you sort it
out, turn on the offline demo under Settings → Advanced.
