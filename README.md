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

1. Open `index.html` in a browser. It is one self-contained file, so it works
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
   phone, the tab row above the input) has Character, People, Journal and
   Places. After the first narration of your first game a three-line tip says
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
screen reader does not announce it with every turn). A turn started from the
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

**The narrator knows who people are to you.** Every turn it is told your goal
and flaw, the traits of each person here and what they want (never to be
said outright), your loose ends from the other person's side ("tied to you by
a debt"), the town's open stories and what you owe, and the latest town news.
So the man you owe money greets you as the man you owe money, from the first
turn. Someone's secret reaches the narrator only after a social roll aimed at
them succeeds, or once they like you (attitude 50 or more).

The People tab lists who is here now, who you have met, with how they feel
about you, where you last saw them and what they remember, then the people you
have only heard of. A search box at the top (name, job, or a place you saw
them or they live) stays put while the list scrolls, and the people you know
can be sorted by last seen, attitude or name. Everyone has an age and pronouns
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

When someone you know crosses a line in how they feel about you, a quiet line
says so after the turn: "Loretta Gaddis warms to you.", "... cools toward
you." or "... won't forget that."

**Editing people.** Anything else wrong about someone, you can fix yourself:
open their card (anyone you have met, or heard of) and tap **Edit** beside the
pronouns, or type `/edit Mavis`. The form has their name, age, pronouns, role,
up to three traits, how they feel about you (-100 to 100), who they are to
whom, their home, whether they are free, arrested, gone or dead, and what they
remember about you; look, voice and history sit folded under their own
heading, and their goal and secret under "Hidden from you". **Save** checks
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
  ("Settled", or "Settled late") or can no longer be.
- **Notes**: the lines the bookkeeper writes each turn, with the day and
  phase.

`/recap` (or Recap in the ⋯ list) prints the gist in the story with no API
call, under the heading "Where things stand", one line each with its kind in
bold: where and when, **Here**, **Open** (the threads you know), **Owed** (due
days, missed ones still owed ("missed Day 7, still owed"), part payments),
**Warm to you** and **Cold to you** (three each, among people you have met, are
tied to by a loose end, or who remember something of you; with the attitude
word and at most one reason that fits the side: "your loose end: a debt", or
"remembers you fixed the fuel pump"), **Heard** (the last three rumours) and
**In town** (the last two news items, by day). Here and Open are always there,
the rest only when they have something; long text is cut at a word with "…". It
also shows after Continue and after `/rest` (there without In town when
"Overnight in town" is just above it). Once the ending has been told, a second
line says "The story has reached an ending; you can keep playing.", and the
recap after `/rest` is just those two lines.

## Character

The Character tab shows your name and age, background, stats, HP, cash, story
points with a **Spend** button beside them (it fills in `/fact ` for you to
finish), a **Standing** line for the town and for each faction,
your goal and flaw, **Grown** (the threads you resolved and what each gave
you, as its quiet line said), your conditions with what each does and how
long it has left ("Tired (−1 to all) · until you rest") and what you carry.

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
the scene runs. Morning comes when you `/rest` (sleep), `/wait morning`,
`/skip` ahead, or do something that takes hours. `/wait` and `/skip` arrive at
the start of the phase you asked for. The narrator and the bookkeeper are
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
between where it began and where it ends.

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
| A secret | $200 for the blackmailer's silence | two days after they name the price |
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
whether the bridge report still stands, how Royce feels about you, whether you
are in the room (at 15 or more, seeing you in the back, he moves to table the
bridge) and whether you paid Curtis Pruett. A member in the holding cell does
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
week, and a grudge that comes due leaves them less angry (they got even).
Feelings with no fresh serious memory behind them for five days, and no open
loose end with you, drift back 2 points a day toward where they started.

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
narration: they are hurt and laid up at home for two days, they and everyone
who saw it remember, and in a public place it is news. Fight with the police
there, or at Town Hall, and that narration has you taken in: a night in the
holding cell, a fine of up to $50, any weapon or ammunition you carry taken
off you (by what the thing is: a grease gun, gun oil, a butter knife, copper
wire, 18 gauge or a can of Colt 45 is not one; a .38, a 12-gauge, a Smith &
Wesson, a box of 9mm, .38 rounds or buckshot is), and Chief Bell remembers. An
attack, a plea or picking the pocket of someone who is not here rolls
nothing; stealing from their register or their things while they are away
still rolls stealth.

**Cards.** When Curtis Pruett is at the Low Water (afternoons, evenings and
nights), there is a card game at the back table: five-card draw, you against
Curtis, at a table the story shows you. Say you bet, in Do or in Say mode
("I put $50 in", "deal me in", "I'm in for fifty", "another hand", "I go all
in"; said in Say mode to Curtis or to everyone): the stake is what you name,
in figures or in words ("fifty dollars", "a hundred bucks"; whole dollars, so
"$2.50" is $2), all your cash for "everything" or "all in", $20 if you name
nothing (or $0, or less), and never more than your cash. When the stake is all you
have, or is the usual $20 because what you named was no stake, the table's
heading says so ("stake $140, all you have"). Nobody at the table? The story
says when Curtis deals. The table appears under your line ("Curtis Pruett's
table · stake $20 · pot $40"), Curtis's five cards face down and yours face
up. Tap the cards you want to keep (or Space or Enter on them; each says
Hold), then **Draw** (it says how many it replaces: "Draw 3", or "Stand pat"
with all five held) to replace the rest, or **Fold** (it says what it costs:
"Fold −$10"). Curtis draws by a fixed rule (he stands on a straight or
better, keeps three of a kind, two pair or a pair, then four to a flush or a
straight, else his two highest cards), both hands turn up with their names
("Two pair, kings and sevens", "Pair of aces"), the cards that were drawn are
marked New, the table says how many Curtis drew ("Curtis draws 3", "Curtis
stands pat"), and the better poker hand wins: a win pays the stake, a loss
costs it, a tie splits the pot (nothing moves), and a fold costs half the
stake, rounded up ($10 of $20, $13 of $25, $1 of $1). The game moves the
money itself (the cash in the top bar and the Character panel changes as the
hand is played), the result line gives your cash after, and the narration
tells the moment and the people without listing the cards again. Your wits
are a read on Curtis, not the result: the line over his cards says "Your
read: Curtis has something" (he ends the hand with a pair or better) or "Your
read: Curtis is bluffing", it is right 60% of the time plus 12% for each
point of wits (a condition such as Tired counts), never under 50% or over
95%, and after the showdown it says whether you were right. The deck is
shuffled from the game's seed and the turn, so a hand taken back with
`/undo` is dealt again the same way, by design, when you send the same line.
With a marked deck on you, Curtis's cards are face up while you draw (you
read the marks, so there is no read), and once the hand is played one wits
roll at normal difficulty, +2 for the deck, says whether he notices ("Does
Curtis spot the marks? Wits 17 + 3 = 20 vs 12 · Success", under the table):
on a fumble he catches you (the hand is void and you lose the stake; he keeps
the deck, puts you out on Front Street, remembers it hard, you are barred for
three days, today counted, the story names the first day the bar is open
after that ("back on Monday, Day 5"), and the town hears of it). After that
he will not deal to you for a week, nor while he is colder to you than -10
("Curtis Pruett won't deal to you"), and what he had coming for you (a
background's invitation to his Friday game) waits until he would. Without a
marked deck nothing is rolled and nobody is accused. No complication is
rolled at cards. Once the cards are dealt the ante is in: while a hand is
open the box waits as it does during any turn, **Stop** folds the hand (at
the fold price, the table's hint says so, and with a marked deck the catch
roll is still made), and the turn is kept, told in one plain line; closing
the page does not take it back either (the next time the game is loaded, a
hand left open is folded and one already played stands as it was played);
Menu → Title screen waits until you Draw or Fold. After the showdown the
hand is final: if the narrator fails, is stopped or declines, the turn is
still kept and the hand told in a plain line ("The hand is played: your two pair, kings
and sevens, beats Curtis Pruett's pair of aces. You win $50."). A reload or
`/undo` draws a finished table again where it was in the story.
`/cheat cards` stacks the deck so you win the next hand. With no game here,
nobody dealing, or the bar shut for the day, nothing is bet and no table is
dealt.

**What one turn can do.** The bookkeeper that records each turn is held to
what a turn can do: $500 in or out (a payment toward what you owe, up to
what is still owed), 3 HP, two things gained, one new plan, a
condition of three days at most, and nobody dies, is arrested or leaves town
without a roll against them that succeeded. A thing bought is refused when
the money for it was. HP never reaches 0 from what it writes unless you
attacked and the roll failed. If the bookkeeper fails, the story you read
stands: a quiet line says what changed was not recorded yet, and it is asked
once more in the background.

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
| `/fact <statement>` | Spend a story point to make something true ("/fact the mechanic owes me a favour") | Parser |
| `/recap` | Where and when you are, who is here, what is open, what you owe, who is warm or cold to you, what you heard (see Journal) | None |
| `/sheet` `/people` `/journal` `/places` | Open that panel | None |
| `/undo` | Take back the last turn exactly (up to 20 turns); a turn and the ending it brought are one step. The history is for this sitting only: a reload, **Continue** or **Play here instead** starts it empty | None |
| `/reroll` | Cheat: take back the last turn and roll its dice again, as often as you like, ignoring the no-retry rule. The same action replays with a fresh die, and the story says "Rerolled." After a hand at cards only the marked deck's catch roll is new: the hand replays as it was played (the same cards and holds, nothing to tap); with no marked deck it says "Nothing to reroll: the cards were dealt." | Narrator, bookkeeper |
| `/cheat success` (or `partial`, `fail`, `crit`, `fumble`, a number 1-20) | Cheat: redo the last roll with that outcome; the story says "Cheat: success" (or the number). After a hand at cards with a marked deck, the hand replays as it was played and only the catch roll takes that outcome. With no roll to redo, it arms your next roll instead ("Cheat armed: your next roll will be a success."; after a hand with no marked deck, "Nothing to reroll: the cards were dealt." first). `/cheat` alone lists these | Narrator, bookkeeper |
| `/cheat cards` | Cheat: stack the deck so you win your next hand at cards ("Cheat armed: the next hand is yours."; typed again, "Already armed: the next hand is yours."): you are dealt a full house and Curtis draws to nothing, so you win however you draw. No roll, even with a marked deck, and nothing about cheating is recorded. The armed cheat is kept in the game, so a reload keeps it and `/undo` of another turn does not lose it; the hand it is spent on is spent even if you fold it or Stop folds it, and `/undo` of that hand arms it again ("The cards cheat is armed again"). `/help` lists it in the `/cheat` row | None (the hand is part of the turn that bets) |
| `/cheat time <phase> [day]` (also `/cheat night`, `/cheat morning 2`) | Cheat: set the clock to the start of that phase, on that day (today if none), forward only ("The clock only goes forward: it is Day 3 · Morning now."). The world does not tick and nothing is narrated; the story shows the new day and phase and "Clock set to Day 4 · Night." What the clock jumps past happens at once and in order, each on its own day: a "Meanwhile in town, Day 3: …" line for each day with town news or an event elsewhere, and each morning's "Missed: …" (what fell due) and "Condition over: …"; a town event at your own place happens in front of you in the next narration, and what came due for you (a loose end's moment, say) in the narrations that follow, oldest first. One `/undo` takes it back, with an ending it reached | None |
| `/pronouns <who> <she\|he\|they>` | Set someone's pronouns ("/pronouns Mavis she"); the chips on their People card do the same. A gendered relation, their ties, look and voice turn with it (Dewayne's husband becomes Dewayne's wife; "husband of Dewayne Mangum" becomes "wife of Dewayne Mangum", or "spouse" for they) | None |
| `/edit <name>` | Open the People panel with that person's card in edit mode ("/edit Mavis"; a first name is enough): anything about them, saved as one `/undo` step (see Editing people) | None |
| `/save <name>` | Save to a named slot (no name opens Save / Load) | None |
| `/load <name>` | Load a named slot (no name opens Save / Load) | None |
| `/help` (or `/commands`) | List every command with what it does, one a line in the story under a "Commands" heading (Commands help in the ⋯ list does the same) | None |
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

Behind the scenes a save carries `state.meta.rulesVersion` (8 now; a save
without it reads as 1). The steps that bring a game up to date are listed in
`Upgrade.MIGRATIONS` in `index.html`.

The bookkeeper's reply format gained three fields with this change (people
hurt, arrested, gone or dead; memories a turn settled; obligations met), for
45 properties against the API's grammar limit of 46. It passes the canned-API
tests but has not been sent to the live API yet (see Verified against the
live API).

## What a turn costs

The defaults (the Standard preset) are set for the best play-through, not the
cheapest. Prices are those in `docs/API_NOTES.md`: Opus 5.5 at $4 / $20 per
million input / output tokens, Sonnet 5.5 at $2 / $10, both $0.20 for a
cache read; Haiku 5.5 at $0.10 / $0.50.

Every narration carries three cached system blocks: the style guide, the town
and the cast. Together they are about 12,500 tokens by the api suite's
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
| Parser | ~5,200 tokens (packet ~12,000 characters, system prompt 3,500, schema 2,700) | ~90 |
| Narrator | ~2,000 tokens of packet (7,100 characters on average, at most 9,500) plus the cached blocks | ~120 |
| Bookkeeper | ~4,400 tokens (packet ~6,700 characters, system prompt 2,900, schema 5,700) | ~180 |
| Chronicle (every ten turns or so) | ~1,100 tokens | ~110 |

- A warm turn is about **3.5 cents** with no thinking and about 4.2 cents with
  some 150 thinking tokens a call; at medium effort the models often think
  longer, so expect 4 to 5 cents. A hundred warm turns are about $3.60 to
  $4.20 plus the cache writes.
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

## Editing the town

The whole town lives in `index.html` between the markers
`// ===== BEGIN CONTENT =====` and `// ===== END CONTENT =====`: `TOWN_DATA`
(places, people, factions and their clocks, threads, seeds, rumours, the
calendar, town events and the ending), `TABLES` (random tables),
`BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`, `GRUDGE_TEMPLATES`, `FAVOUR_TEMPLATES`
and `GOAL_PRESETS`. It is plain data with double-quoted strings. The shape is
in `docs/BUILD_PLAN.md` under "Shared data contract". The fields that make
the town move:

- `TOWN_DATA.calendar = { season, startDate }` (day 1 is that date); a
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
  `{playerName}`) only in loose ends and templates.
- `TOWN_DATA.events` (the council meeting: a day, phase, place, `attendees`,
  and `branches` of `{ when, text, effects }` with a `default`; the first
  branch whose `when` holds wins) and `TOWN_DATA.epilogue` (`onDay`,
  `orFlagsSet`, the same branches).
- Rumours: `tellerIds` (at least two people besides the source who can tell
  it), `threadId`, `factionId`. Threads: `reward` (the stat it raises).
- `LOOSE_ENDS[kind].obligation` (the kind's default) and `obligations` (one
  per option, lined up with `options`): `{ kind, amount, dueOffset, text,
  itemName, onStart, onMiss, onMet }`.
- `BACKGROUNDS[].hook = { npcId, text, dayOffset, trigger }`, the first lead
  for a background.
- Grudge and favour templates: `effects`, `public`, `forTags` and
  `notForTags` (who can hold it).
- Goods: `kind` (`good`, `service`, `drink` or `food`); only goods are
  carried. Complications: objects `{ text, tiers, kinds, needsPerson,
  notDay1, effects }`.

After editing, run:

```
node tests/validate-town.cjs
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
narrator's example turns. It runs `tests/mentions.cjs`, so a name, a place
or a crowd the content mentions with no record fails. It lists every problem
it finds and exits 1. After changing the cast, regenerate the roster:

```
node tests/cast-doc.cjs           # rewrites docs/CAST.md from the data
node tests/cast-doc.cjs --check   # exits 1 when docs/CAST.md is out of date (the content suite runs this)
```

A game already in progress keeps the town it started with.

## Running the tests

```
node tests/run.cjs              # everything: the town check, then every tests/*.test.cjs
node tests/run.cjs acceptance   # only files whose name contains "acceptance"
TEST_FILTER='\[4\]' node tests/acceptance.test.cjs     # tests whose title matches
PLAYTEST_TRANSCRIPT=1 node tests/playtest.test.cjs     # print the 30-turn playtest's story
UI_SHOTS=/some/folder node tests/ui-fixes.test.cjs     # keep the screenshots the UI suite takes there
```

The tests drive the game in headless Chromium with Playwright, in mock mode,
from `file://`, with the network blocked. Playwright is preinstalled in the
build environment. Elsewhere, install it outside this folder (as the CI
workflow does) and point `NODE_PATH` at it, because
`tests/constraints.test.cjs` checks there is no `package.json` here. There is
nothing else to install. The whole run is about 600 tests and takes about
ten minutes.

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

## Verified against the live API

**This round (30 Oct 2026) was not checked against the live API.** It was
verified in mock mode and against canned API replies served inside the
browser (`tests/api.test.cjs`, `tests/transport-fixes.test.cjs`). Before
relying on it with a key, a short live session should confirm:

- the `record_changes` schema, now 45 properties, compiles (the API refused
  47 in an earlier probe with "compiled grammar too large"; 46 passed);
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
