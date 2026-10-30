# One-Town Text RPG: Lockett's Ferry

A single-player text RPG set in one town: Lockett's Ferry, a present-day river
town of about eight hundred people where the state highway crosses the Lusk
River on an old steel bridge. A land company, a smuggling crew and a
three-officer police department each want something from the town, and the
player arrives with three loose ends of their own. You type any action and
Claude narrates it. The game's code owns every fact, number and dice roll.
Claude only describes what the game state says is there, and the town keeps
moving on its own: faction plans advance, grudges and favours come due, and
news spreads.

## How to play

1. Open `index.html` in a browser. It is one self-contained file, so it works
   straight from disk (`file://`) or from any static host. No build step, no
   server.
2. **Settings → API key**: paste an Anthropic API key from
   [console.anthropic.com](https://console.anthropic.com). The browser calls
   `https://api.anthropic.com/v1/messages` directly with your key. Nothing goes
   anywhere else.
   - **Remember on this device** ticked: the key is kept in this browser's
     `localStorage` and survives closing the browser, on this device only.
     Unticked: it is kept in `sessionStorage` and forgotten when the tab closes.
     The key is never written into a save or an export.
3. **Mock mode** is on by default. In mock mode a built-in dummy parser,
   narrator and bookkeeper run the whole turn loop offline. You can try the game,
   the dice, the commands and the living world without a key or any tokens.
   Mock narration is tagged "Mock narration" in the feed. Untick it in Settings
   to play with Claude. So that nobody takes the placeholder story for the
   game, a strip at the top of the story says which narrator you have:
   - No key: "Offline: the story is placeholder text. Add an API key in
     Settings for the real narrator." **Settings** opens Settings with the key
     field ready to paste into.
   - A key, but mock mode on: "Mock mode is on: the story is placeholder text
     and your key is not used." **Turn on the narrator** unticks mock mode, so
     your next turn goes to Claude.
   - Mock mode off and no key (a key not remembered on this device is
     forgotten when the tab closes): "No API key: mock mode is off, so turns
     will fail." with **Settings**.

   The × (or Escape) hides that message until you next open the game (a
   different one still shows). The title screen says the same in one line
   under the buttons. With a key and mock mode off, neither appears.
4. **New game** walks you through character creation: name, background and
   age, one stat point to move, a goal, a flaw and three loose ends. Each
   loose end ties to someone already in town (see The cast). Then press
   **Begin**.
5. Type what you do and press Enter (Shift+Enter for a new line). The
   **Do / Say** switch at the left of the input says whether you are doing
   something or saying something (see below). Type `/` to list the commands.
   Once your turn's story is on screen you can type your next move while
   the game finishes recording what happened; Send (and Enter) comes back
   when it is done, with what you typed still in the box.
   The side panel (on a phone, the tab bar above the input) has Character,
   People, Journal and Places.

## Do and Say

The switch at the left of the input box has two buttons.

- **Do** (the default): you type what you do. "I run away" means you run
  away. Anything in quotes inside the line is part of what you do.
- **Say**: you type only your words, exactly as you say them. "Run away" means
  you tell someone to run away. You stay where you are, and the person you
  speak to answers first. Talking, persuading, lying and threatening are all
  Say; the game decides from your words whether a roll is needed.

In Say mode a row of buttons appears above the input: **Everyone**, plus one
button for each person here, by name. One is always picked: the only person
here if there is just one, otherwise Everyone. Tap another to talk to them.
The row changes with the scene (after each turn, when you move, when you load
a game), and your pick is forgotten when you go somewhere else.

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

**You have only what you carry.** Every turn the narrator is told exactly
what you carry and how much money you have, and that you have nothing else.
When you try something that needs a thing you do not have and that is not
lying here ("I stab Royce" with no knife, "I drive off" with no car), the
turn still plays, but as what you can do without it: bare hands, a bluff,
or finding out you have nothing. The roll counts no item, and the
bookkeeper records no use of the thing.

## Character creation

The background step also asks your age, 16 to 90. Each background starts
at its own age (a veteran at 34, a dropout at 19, a fired bookkeeper at 38,
a river deckhand at 36, a group home kid at 18, a poker hustler at 31), and
picking a background fills it in until you type your own. The summary card
and the Character tab show it beside your name ("Tomas Reed · 34") with what
your background means, and the narrator and the parser hear it with your
name every turn.

## Places and the map

The map starts with the town's fifteen public places, from Pittman's and the
Low Water to Front Street, Riverside Cemetery, the Water Tower, the Bluff
where the highway comes in and the River Road. The homes the cast lives
in (eight of them: the Mangum House, the Pittman Place, the Parsonage and the
rest) are written into the town but start off the map, until someone tells
you about one. When someone names a specific place you could walk to
("Dewayne's is the white house about a mile up the river road"), the home
the cast has written for that person appears on the map, in the Places list
and on the roads, with a quiet "Added to the map" line in the story. It
shows with a dashed marker, marked "heard of", until you visit. Walk there
like anywhere else ("I head to Dewayne's house", or tap it on the map). A
place the town does not have (a fishing camp up the creek) is added as a new
place in the same way; the game adds at most one place a turn and twelve new
ones a game (the written homes do not count).

**Places tab.** Under the map, **Places you know** lists every place you have
been or heard of. Tap one to open its sheet: what it is, what you notice
inside, when it is open, how it came to be, who lives there, who works there
or drinks there, who is buried there and who is there right now.

**Out of town.** Fifteen more places are written into the town because
people talk about them: Clayburn, the county seat twenty-six miles north,
with the sheriff's office, the county home, the county school and the old
county hospital; Calder, with Calder Regional and the Willows treatment
program; the state penitentiary; the Sturdivant bottomland and timber; the
old paper mill; the bypass; the dry county across the bridge; and the
coast. They are listed under **Out of town** with how far away they are and
their history, but they are never on the map and the story never goes
there. Asking to go ("I drive to Clayburn", or the parser picking one)
costs nothing and says so plainly: "Clayburn is out of town (twenty-six
miles north up the state highway, about forty minutes by car). The story
stays in Lockett's Ferry: you can talk about it, but you can't go there."

## Work

Cash has a use and a way in. Seven people in town pay for a few hours'
work, each at their own place and time of day:

| Work | Where, for whom | When | Pay | Roll |
|---|---|---|---|---|
| A shift in the service bays | Pittman's, Dewayne Mangum | morning, afternoon | $60 to $80 | might, normal |
| A shift at the bait shop | Purvis Landing, Lorna Purvis | morning, afternoon | $40 to $55 | might, easy |
| A night on a johnboat | Purvis Landing, Wade Purvis | night | $150 to $250 | stealth, hard |
| A day's hauling | the Haskins farm, Lamar Haskins | morning | $50 to $70, once only | might, normal |
| Turning over rooms | the motor court, Mavis Mangum | evening | $30 to $45 | none |
| A seat at the card game | the Low Water, Curtis Pruett | evening, night | win or lose $40 to $120 | charm, normal |
| A day in the back room | Byrd's Pawn, Hollis Byrd | morning, afternoon | $40 to $60 | wits, normal |

**Taking it.** Be there when the person who gives it is, and ask: "I ask
Dewayne for a shift", "I look for work", "Hire me", or in Say mode "Deal me
in." The game rolls if the work has a roll, pays you in cash, and the work
takes the rest of the phase. A success pays a sum in the range, a natural 20 the
top of it, a partial the low end and a failure nothing (a natural 1 can
also leave a lasting consequence, as any roll can). Turning over rooms has
no roll and always pays a sum in the range. A quiet line says what you were
paid ("You are paid $70 (cash $210).") and the Journal gets "A shift in the
service bays at Pittman's for Dewayne Mangum: paid $70." The narrator is
told what the work was and what it paid, and nothing else is paid, won or
lost in the telling. Before you take it, the narrator is told what is on
offer where you stand while the person giving it is there, so they can
bring it up or answer if you ask whether they are hiring; nothing is settled
by talk alone.

**The card game is a stake.** You need the low end, $40, to sit in. A win
pays the way any work does, and a failure loses a sum in the range (the top
of it on a natural 1), never more than you have. The flaw "Can't pass a
scratch-off ticket or a card game without buying in" is written for it.

**Once a day.** Work you have done is not on offer to you again until the
next day (the night on a johnboat: three days), and the farm's day of
hauling is one job, done once. When you cannot take the work, a plain line
says why and nothing is spent: the wrong time of day ("The mechanic hires
for a shift in the service bays at Pittman's in the morning and afternoon,
not in the evening."), its giver somewhere else, arrested or gone, someone
cold to you (attitude -25 or worse) who will not take you on, work done
today, too little cash to sit in, or nobody hiring where you are ("Nobody
at the Old Bridge is hiring right now. The Places tab shows the work in
town (or type /jobs).").

**Some work changes things.** A good night on the johnboat raises your
standing with the Night Run; a bad one lowers it, and Travis Cagle saw a
johnboat with no lights hung up below the bridge with a stranger in it, a
rumour that spreads like any other. A good day on the farm warms Lamar
Haskins to you.

**Where to look.** A place's sheet on the Places tab lists "Work here: A
shift in the service bays at Pittman's (for Dewayne Mangum, morning and
afternoon)", the giver by their label until you meet them, with "done for
today" once you have. `/jobs` lists the work at every place you know (the
Haskins farm is a home to find, so its work shows once someone has told you
where it is).

**Trouble that comes to you.** Someone with a grudge can now come at you
themselves. One of the eight grudges is a fight: "Royce Pittman has had
enough of Tomas and comes straight at them with both fists, done talking."
When it comes due, on the turn it is told, that person is brought to
wherever you are and you defend: a might roll at normal difficulty, +2
with a knife or a gun on you. A failure costs 1 to 3 HP (3 on a natural 1)
and at 0 HP you are defeated as in any fight, with them as the one who did
it; a success and they get nowhere. The narrator is told who came at you,
why (the grudge's memory: "a grudge: "insulted me twice""), and how your
defence went. The quiet roll line shows it like any roll.

## The cast

Everyone who can appear in Lockett's Ferry is written by hand: 41 people in
`TOWN_DATA` in `index.html`, in households (the Mangums, the Pittmans, the
Deeses at the parsonage, the Overstreets, the Gentrys, the Haskins farm, the
Lotts' trailer, the Sturdivant house, the motor court's long-stay rooms) and
the regulars, staff and loose-end people around them: a dispatcher, a
day-shift officer, a retired nurse, a teacher, a farmer, a bookie, a repo man, a
parolee, a waitress with a grudge, teenagers and an old-timer. Each one has
pronouns, a real job or place in town (never just "man" or "woman"), a
look, a voice, two traits, a goal, a secret, how they feel about strangers,
who they are to whom (written on both sides: Mavis Mangum's husband is
Dewayne, and Dewayne's wife is Mavis), a home, a place in every phase of
the day, an age that fits their look and their family (a parent is 16 to 60
years older than their child), and a history of two or three sentences:
where they come from, what happened to them and how they came to be where
they are.

**Everyone the town mentions exists.** Anyone the written town names, even
once and only by name, is a record: 25 more people who never appear. Eight
are dead (Clyde Pittman, who opened Pittman's in 1966 and died at the pumps
in 2009; Ruth Haskins; Inez Crocker, whose house the Mangums live in; Amber
Lott, at nineteen), each with when and how they died and where they are
buried. Seventeen live elsewhere (Dale Purvis in the state penitentiary,
Sheriff Hoyt Bramlett in Clayburn, Stanley Wexler, who runs the motor court
by email from Calder, and Leah Dees at the Willows), each with where they
are and how they can be reached. They can be talked about, called or written
to in the story, but they never walk in. `tests/mentions.cjs` scans every
line of the content for capitalised names and "the <kind of place>" phrases
that are not records (with a short list of words like Mr, Bible and the
months), and the town check fails on any.

**The town has a past.** The narrator is told how Lockett's Ferry came to be
(the ferry, the 1938 bridge, the school, the bypass and the mill leaving),
eleven things that happened in the last three years (from Ruth Haskins's
death in January 2024 to the council setting its bridge vote in September
2026), and every place's history and hours. It is 2026.

`docs/CAST.md` is the roster, by household, then the people who live
elsewhere, the dead, the town's history and every place; it gives ages and
histories but leaves out looks, goals and secrets, so it spoils nothing.

- **The game never makes a person up.** Not the narrator, not the parser,
  not the bookkeeper, not the loose ends, not a story point. Anyone the story
  or you mention is one of the cast or does not exist (see People). A
  `/fact` can make something true about someone in town ("the mechanic owes
  me a favour") but cannot add anyone.
- **The narrator knows everyone.** Every narration carries the town and the
  whole cast as two cached system blocks after the style guide: the town's
  history, recent events and places, then one line for each person here
  ("Mavis Mangum (41, she/her; ...)", with who they are to whom, where they
  usually are and their history), then the dead and the people who live
  elsewhere, one short line each. So a person the story mentions is always
  the same person, with the same name, age, spouse and job.
- **The narrator knows what the people in front of you want.** Everyone in
  the scene comes with their two traits, what they want and their secret,
  under one rule: a secret is never told or hinted at in the narration. It
  decides what that person dodges, lies about or bristles at, and they let
  part of it slip only when you have earned it, caught them out or found
  proof; nobody else in the scene knows it. The people at a place you are
  walking to, the cast list and everyone else never carry a goal or a
  secret, so a secret is in play only while its keeper is in front of you.
- **The narrator knows why you came.** Every narration carries your goal,
  your flaw (it colours what tempts or needles you; the narrator never acts
  on it for you) and the threads you know are open, your loose ends with
  their people among them. The arrival is told why you came, so the opening
  can hint at it.
- **Loose ends are people in the cast.** Each loose end you pick at creation
  ties to someone already written who fits the option you kept: a debt to
  someone who lends, a repo man or a bookie; someone looking for you to a
  parolee or a stranger with a grudge; a secret to someone in town who
  trades in them; something lost to someone who keeps old records; a
  promise to a bartender. Nobody is tied to two loose ends
  while anyone else is free.
- **Loose ends come to you, wherever you are.** Each one's person comes
  looking for you on a day of their own: the debt on day 3 to 5, someone
  looking for you on day 4 to 7, and so on. The first loose end you picked
  does not wait: it comes on day 1, after your second turn, so the third
  narration has that person in front of you (a creditor with a printout
  of what you owe, say). They find you wherever you stand, so what they do
  names no place: no booth, no motel desk, no bar. "Carter Sturdivant comes
  straight up to Tomas without a hello, holds out a folded printout with
  Tomas's name and the amount on it, and says the money is due in three
  days."
- **Homes to find.** The cast's eight homes start off the map and appear
  when someone tells you where a person lives (see Places and the map).

## People

People know about you only what they have seen since you came to town and
what their own memory list says. Someone from a loose end remembers the
past you share from the first morning, in a short line of their own: a
creditor "owes me more money than they can pay", the man you testified
against "testified against me, and I did years for it". It is on their
People card, and a game saved before 30 Oct 2026 gets the same line in
place of its old "Loose end with ..." note when it loads. The narrator is
told this every turn, with how long you have been in town, and on your
first day a spoken line that invents a past with you ("I've known a while",
"he called me last night") is sent back to be rewritten, unless someone tied
to one of your loose ends is in the scene: they do share a past with you, so
"I knew you'd show up" is theirs to say.

What has happened in front of them is the scene you are in: the narrator
gets every turn since you came to the place you are in (up to twelve turns,
about 700 words), the three turns before when you have only just arrived,
and the chronicle (STORY SO FAR) for the rest, so a long conversation does
not lose its thread after the third exchange.

The People tab lists who you have met, with how they feel about you, where
you last saw them and what they remember, then the people you have only
heard of. Everyone has an age and pronouns (he/him, she/her or they/them),
shown beside their name on the card ("Mavis Mangum · 41", she/her), and the
narrator gets the same age and pronouns right after each person's name, so
the story and the sheet always agree. An open card also shows their age,
home, ties and history. Someone the story names who is dead or lives
elsewhere (Clyde Pittman, Dale Purvis) is listed under **Gone** or
**Elsewhere** once their name comes up, with when they died and where they
are buried, or where they live and how to reach them. If the sheet has someone wrong, open their card and tap
the right pronouns (or type `/pronouns Mavis she`): the story follows from
the next turn, and a relation that carries a gendered word turns with it
("Dewayne's husband" becomes "Dewayne's wife"), as do the look and voice
lines ("A man with a bitter look about him." becomes "A woman with a bitter
look about her."; words in quotes are left alone).

**Editing people.** Anything else wrong about someone, you can fix yourself:
open their card (anyone you have met, or heard of) and tap **Edit** beside
the pronouns, or type `/edit Mavis`. The card turns into a form with their
name, age (0 to 120, or blank), pronouns, role, look, voice, history (up to
400 characters), up to three personality traits, how they
feel about you (a slider from -100 to 100, with the word the card shows),
who they are to whom (someone else in the game and the relation, such as
wife or boss), their home (any place you know, or nowhere: off-screen when
nothing else has them), whether they are free, arrested, gone or dead (dead
takes them off the map; free brings them back to their usual places and
home), and what they remember about you (change, add or remove lines, each
small, notable or serious). Their goal and secret sit folded away under
"Hidden from you": they are the game's secrets about this person, and
reading them spoils the story. **Save** checks everything first (a name
someone else has, say, is refused with the reason and the form stays as you
typed it), changes only what you changed, and says so in the story ("Edited
Mavis Mangum: pronouns, role, home."); **Cancel** or Escape leaves them as
they were, and Enter in a field never saves by accident. One `/undo` takes
a whole edit back. The narrator, the parser and the map use the new record
from the next turn. Editing waits while a turn is running.

**People the story names are the cast.** When someone mentions a person
("his wife's gonna be thrilled", "my wife Mavis works the night counter"),
that is someone already written: Dewayne's wife is Mavis Mangum, with her
own name, job, voice and home, and the narrator has known her from the
first turn. Nobody is added to the game, however the story phrases it, and
the bookkeeper is not even asked for new people.

**People you ask for are the cast's.** Asking for someone ("I knock and ask
for Mavis", "I ask about Dewayne's wife", "I wave the bartender over") finds
them in the cast by name, by who they are to someone or by their job, never
the wrong person in the scene. If they are somewhere else right now, the
narrator is told they are not here. Someone nobody in the cast answers to
("the woman by the jukebox") is simply not there: the narrator is told they
do not exist in this town, nothing is rolled from tables and no call is
made.

The People tab card shows who someone's people are ("Ties: wife Mavis
Mangum; boss Royce Pittman"), from the cast and from anything you set in the
editor.

## Time

A day has four phases: morning, afternoon, evening and night, shown in the
top bar. Talking and looking take no time. A short action (minutes to half an
hour: a walk across town, a search, a chore) takes a third of a phase, so
three of them move the clock on. A long one (an hour or more) takes a whole
phase. The town moves on at every change of phase (see The living world).

**Night lasts until you sleep.** Short actions never carry the clock from
night into morning: after the third one it stays at night, late, however long
the scene runs. Morning comes when you `/rest` (sleep), `/wait morning`,
`/skip` ahead, or do something that takes hours. The narrator and the
bookkeeper are told where in the phase the scene is (early, mid or late), at
night that you have not slept yet, and on a morning you reached without
sleeping that you had no sleep last night.

## The living world

The town moves whether or not you do. The land company, the smugglers and
the police each work through two or three plans in order, and each plan is a
clock of six segments (the Debug tab shows them).

- **Clocks fill twice a day.** When the morning starts and when the evening
  starts, every faction with a plan running rolls a die, and a 5 or 6 fills
  a segment. A plan takes about nine days on average. Over 200 seeded runs
  (the playtest's pacing report) a faction's first plan completes on day 9.6
  on average (day 6 to 13 in eight runs out of ten), the first completion
  anywhere in town comes around day 7, and no run finishes every plan in two
  weeks (54 of 200 finish them all by day 29). Before, the clocks rolled at
  every change of phase and the whole plot was over by about day 14 with no
  help from you. What you do can still move a clock one segment either way
  in a turn: the bookkeeper decides (sabotage the smugglers and their clock
  loses one).
- **A finished plan changes the town**: a place closes, someone is arrested
  or leaves, prices go up. If it happens where you are, or to someone
  standing with you, a quiet line in the story says so and the Journal gets
  the same text as "Around town: ...". Otherwise it happens off-screen, and
  you hear of it the way you hear anything else.
- **Seeds are events.** The town has seven surprises of its own waiting,
  from a night of smuggling on day 3 to a tackle box hidden under the
  bridge, and more get planted as you play: by your loose ends, by grudges
  and favours, by finished plans. When one comes due, the next narration
  works it in, and the town changes to match what it says. "Chief Bell is
  down at Purvis Landing photographing fresh trailer tracks, and Wade Purvis
  is watching him from the bait shop": both are at the landing that phase
  (and in the phase it is told in, if you slept first), so walking down
  there finds them. "On a girder ledge under the first span ... is a tackle
  box": it lies at the Old Bridge until you take it ("I pick up the tackle
  box"). The agenda taped to the Town Hall door puts Chief Bell in front of
  it. The others set a fact the game keeps (the police vote on the agenda,
  the engineer backing out, Miss Vada's new will) or sour the land company
  and the smugglers on each other. Someone a seed would move who is
  arrested, gone or dead stays where they are, and so does anyone standing
  with you (nobody vanishes from your scene); a loose end, grudge or
  favour whose person can no longer act changes nothing at all; and a seed
  the bookkeeper plants for something you did is told but moves nobody.
  The Debug tab lists each seed with what it will change.
- **Rumours spread.** A rumour starts with the person it comes from (the news
  of a finished plan also with the faction's own people). Every morning it
  moves one step: each person who is at the same place at the same time of
  day as someone who knows it may pick it up (1 in 2, and two new people a
  rumour a morning at most), and the town's gossips (the two bartenders at
  the Low Water, the motor court's night clerk, the hairdresser and the
  police dispatcher) pick up everything said at their place. The dead, the
  people who live elsewhere and anyone in the cells hear nothing and tell
  nothing. A false rumour travels as fast as a true one. In the pacing
  report the town's ten rumours are each known by about 4 people on the
  morning of day 2, 10 on day 4, 17 on day 7 and 32 on day 14, and from
  about day 7 nearly everyone in town knows something you have not heard.
- **You hear them by talking.** When you talk to someone who knows a rumour
  you have not heard, the narrator may have them bring it up (fresh news
  first, then what they started themselves, then what they picked up).
  Anyone who dislikes you (cold or worse) keeps it to themselves, and nobody
  brings one up on a turn where you push an ask that failed or repeat one
  already granted (see Dice): nothing is gained on those. Once you
  have heard it, it stops spreading, the Journal gets "Around town: <what
  you heard> (from <who told you>)." on that turn, and the teller's People
  card lists it under "Told you". In the 37-turn playtest you hear three of
  them (it was one before rumours spread).

## Dice

A roll is a d20 plus a stat and small modifiers against a difficulty, made
only when the outcome is uncertain (**Show dice rolls** shows the line). The
same roll is never made twice in a row, whatever it came to: the same kind of
action at the same person or thing, in the same place and phase, waits until
something changes (you move, time passes, or you try something different). A
failed attempt tried again gets "You already tried that here. Change something
first: ..." and costs nothing; in conversation the person holds their ground
instead. **A granted ask stays granted**: ask the same person for the same
thing again and there is no roll and nothing more to gain. They note it is
already settled ("I said yes") and think no better of you for asking twice.
An ask counts as the same when most of its words are, leaving out names,
filler and words like "persuade" or "ask": "Come on, put in a good word for
me" repeats "I persuade Lyman to put in a good word for me", while "lend me
twenty dollars until Friday" is a new ask and rolls. Something you have
already done that is not an ask (a lock picked, a search made) gets the
notice if you do it again. `/reroll` and `/cheat` ignore the rule.

## Settings

| Field | What it does |
|---|---|
| API key, Remember on this device | Your Anthropic key; where it is kept (see above). |
| Mock mode | On: the built-in placeholder narrator (and parser and bookkeeper), no API calls, free. Off: Claude narrates with your key. On by default. While it is on, or while there is no key, the game screen shows a strip saying so and the title screen a line under the buttons (see How to play, step 3). |
| Narrator model | Writes the story (streamed). Default `claude-opus-5-5`, the current Opus. |
| Parser model | Turns your text into an action, before anything is narrated. Default `claude-haiku-5-5`: a short, fixed job, so the fast, cheap model is the default (until 29 Oct 2026 this one field drove the bookkeeper and the chronicle too, at `claude-sonnet-5-5`). |
| Bookkeeper model | Records what changed after each turn (the bookkeeper), writes the chronicle every 10 turns, and does the calls of **Re-read this game** and **Update this game**. Default `claude-sonnet-5-5`. Settings saved with the old single field move over by themselves: left at its old default, you get the two new defaults; a model you typed there is kept for both fields. |
| Effort (narrator, parser, bookkeeper, chronicle) | `low` / `medium` / `high` per role, sent as `output_config.effort`. Defaults: narrator, bookkeeper and chronicle `medium`, parser `low`. Higher effort means more thinking tokens: slower and dearer. |
| Show dice rolls | Shows the quiet roll line, e.g. `Wits 14 + 2 = 16 vs 15 · Success`. |
| Narration style | **Casual** (the default): plain and direct, like someone running the game at the table, with short sentences, no similes and little scenery. **Literary**: the original style guide, tighter and more like a novel. Takes effect from the next narration. |
| Permadeath | Off by default. Off: at 0 HP you are robbed, captured, left in a gutter or rescued, chosen from the scene. On: the story ends. |
| Theme | Dark or Parchment. The first load follows the system's light or dark setting. |
| Text size | Small, Medium or Large reading text (16, 18 or 20 px). |
| Game: Re-read this game with the latest rules | Brings the game you have open up to the latest rules again: rewrites what people remember in the current short form, adds places people told you about, sets the clock back if it ran ahead of the story, fixes people the game made up so they match the story, brings in the town's full cast, folding anyone the game made up into the person they were, and fills in the lived-in town: ages, histories, the dead, the people who live elsewhere and the places out of town (see Updating an older game). About four API calls. |

When time passes while you stay put, anyone who arrives at or leaves your place is worked into the next scene as it happens: a truck pulling in, a door, a goodbye.

## Commands

| Command | What it does | API calls |
|---|---|---|
| `/look` | Describe the whole scene, with the longer zoom length | Narrator |
| `/zoom <action>` | Play the action as a normal turn with the longer limit, for big moments | Parser, narrator, bookkeeper |
| `/skip <goal>` | Jump ahead to a place and/or time ("/skip to the bar at night"). The world ticks once for each phase skipped; naming the phase it already is moves you with no time passing | Narrator |
| `/pass` (or press **Wait**: the Send button with nothing typed) | Say and do nothing for a few minutes and let the people here act, speak or react to your silence | Narrator, bookkeeper |
| `/rest` | Sleep until morning, heal 3 HP. The world ticks through the night. Night lasts until you sleep (see Time) | Narrator |
| `/wait <phase>` | Wait where you are until morning, afternoon, evening or night | Narrator |
| `/fact <statement>` | Spend a story point to make something true ("/fact the mechanic owes me a favour") | Parser |
| `/sheet` `/people` `/journal` `/places` | Open that panel | None |
| `/jobs` | List the paid work at the places you know: what, for whom, when, and whether you have done it today (see Work) | None |
| `/undo` | Take back the last turn exactly (up to 20 turns) | None |
| `/reroll` | Cheat: take back the last turn and roll its dice again, as often as you like, ignoring the no-retry rule (see Dice). The same action replays with a fresh die | Narrator, bookkeeper |
| `/cheat success` (or `partial`, `fail`, `crit`, `fumble`, a number 1-20) | Cheat: redo the last roll with that outcome. With no roll to redo, it arms your next roll instead. `/cheat` alone lists these | Narrator, bookkeeper |
| `/cheat time <phase> [day]` (also `/cheat night`, `/cheat morning 2`) | Cheat: set the clock to the start of that phase, on that day (today if none). The world does not tick and nothing is narrated; the story shows the new day and phase and "Clock set to day 1, night." One `/undo` takes it back | None |
| `/pronouns <name> <pronoun>` | Set someone's pronouns ("/pronouns Mavis she"); the chips on their People card do the same. A gendered relation, look and voice turn with it (Dewayne's husband becomes Dewayne's wife) | None |
| `/edit <name>` | Open the People panel with that person's card in edit mode ("/edit Mavis"; a first name is enough): anything about them, saved as one `/undo` step (see Editing people) | None |
| `/save <name>` | Save to a named slot (no name opens the Saves screen) | None |
| `/load <name>` | Load a named slot (no name opens the Saves screen) | None |
| `/debug` | Toggle the Debug tab: secrets, seeds, faction clocks, rumour truth and how many people know each rumour, rejected changes, token totals and the last raw API responses | None |

Story points: you start with 2. You earn 1 when a thread resolves or on a
natural 20, up to 3.

## Saves, export and import

- **Autosave** after every turn, in this browser's `localStorage`. **Continue**
  on the title screen picks it up.
- **Three named slots** on the Saves screen (laptop: Save in the top bar; phone:
  Menu → Save / Load), or with `/save <name>`.
- **Export current game** downloads a `.json` file holding the full state and
  the town data, never the API key. **Import from file** loads one on any
  device, so a game moves between laptop and phone. Saves carry their own
  copy of the town, so editing the town later does not break old saves.
- If the browser refuses storage (private mode, full disk), a warning banner
  appears. Export to keep your game.

## Updating an older game

The rules for what people remember changed on 28 Oct 2026. People now
remember only what they would hold against you or thank you for later, as a
short line in their own words ("flirted with me", "told me to fuck off",
"lied about car trouble to get Dewayne outside"). Games saved before then hold
the old kind: long play-by-play accounts of whole scenes.

- **You don't have to do anything.** An older save loads and plays exactly as
  it is. Only new memories follow the new rules.
- **Update this game.** When the autosave is older, the title screen says
  "This game was saved under older rules" and shows **Update this game** next
  to **Continue**. The Saves screen marks each older slot "Saved under older
  rules" and gives it an **Update** button. Either one loads the game and
  re-reads everyone's memories. Each person keeps at most six short lines,
  only the ones that matter to them. Repeats are merged, and each line keeps
  the turn of the earliest memory it came from. Loose ends and `/fact` lines
  stay exactly as they were. The feed then says what happened, for example
  "Rewrote memories for 5 people: 23 memories became 9." The game stays loaded
  and is autosaved, and an updated slot is saved back under its own name.
- **Settings → Game → Re-read this game with the latest rules** does the same
  for the game you have open, and you can run it again at any time.
- **Cost:** about one call to the bookkeeper model (Sonnet 5.5 by default, at
  the bookkeeper's effort; it was the parser model's job until 29 Oct 2026).
  Measured live on 28 Oct 2026: two people with eight memories cost $0.005
  (1,682 tokens in, 183 out). A game with more than about 40 memories is
  sent in a few calls. Mock mode rewrites by a fixed rule instead and makes
  no calls.
- **If it fails** (no key, a network error, a refusal), nothing changes and
  the feed says why. The details are in the Debug tab. An update counts as one
  step for `/undo`, so `/undo` straight after it brings the old memories back.
- **Places people told you about** (added 28 Oct 2026, rules version 3). The
  same update also reads the game's story so far for places people named
  that are not on the map yet, and adds them as "heard of" places (see Places
  and the map). The feed says, for example, "Added 1 place people told you
  about: Dewayne's house." or "No new places to add." This is one more call
  to the bookkeeper model; mock mode finds a quoted line like "Dewayne's is the
  white house" by a fixed rule instead.
- **Clock follows the story** (added 29 Oct 2026, rules version 4). In older
  games a run of short actions could tick the clock from night into morning
  in the middle of a night scene. The update reads the clock and the last six
  turns and, when the story is clearly still earlier (the night before, say),
  sets the clock back to it, late in that phase. The feed says, for example,
  "Set the clock back to day 1, night: the story had not reached morning." or
  "The clock matches the story." It never moves the clock forward and the
  town does not move on. One more call to the bookkeeper model (none for a game
  still on its first morning); mock mode sets a morning clock back to the
  night before when the last scene has a lamp, a bed or a bedroom in it, or
  says night or tonight.
- **People match the story** (added 29 Oct 2026, rules version 5). Older
  games could hold someone the game made up from its random tables before
  the story said who they were: "Mavis Toler", recorded as a man, whom the
  story calls Dewayne's wife. Loading such a game gives everyone pronouns
  (from the town's own data, else from their look); the update then reads
  what the story says about each person the game made up and corrects their
  record to match: name, pronouns, role, look, voice, who they are to whom,
  going by what the characters state about them (a stated "his wife" or
  "my brother" outranks the pronouns the narration used later, which
  followed the wrong record, and outranks the player's own corrections),
  with the lines from just before the person was named included,
  and where they live (they move in there). Memories stay. The feed says,
  for example, "Fixed 1 person to match the story: Mavis Toler is Dewayne's
  wife (she/her)." or "People already match the story." One more call to the
  bookkeeper model (none when nobody the game made up is in the story); mock
  mode reads "his wife Mavis" and "she" near the name by a fixed rule.
- **A full cast** (added 29 Oct 2026, rules version 6). Games from before
  the cast was written had about fifteen people and made the rest up as the
  story went. The update adds every cast member and home the game lacks (the
  homes start off the map, as in a new game), puts everyone where the cast's
  schedule has them whenever they were nowhere, and folds each person the
  game made up into the cast member they were: by who they are to someone
  (the made-up "Mavis Toler", Dewayne's wife, is Mavis Mangum), else by
  name, else by first name and job. The cast member keeps their own written
  record and takes over the made-up person's memories, how they feel about
  you, having met you and every line and reference that pointed at them (who
  you spoke to in the story, threads, seeds, loose ends, visits); the
  made-up record goes. A home someone told you about becomes the home the
  cast wrote ("Dewayne's house" is the Mangum House), still heard of. The
  feed says, for example, "Added the rest of the town's cast, written by
  hand: 26 people and 7 homes to find. Dewayne's house is the Mangum House.
  Mavis Toler is now Mavis Mangum (Dewayne's wife)." Anyone made up whom
  nobody in the cast matches is kept and named ("Kept 1 person the game made
  up who is not in the cast: ... Edit or remove them on the People tab.").
  From then on the game is marked as having a fixed cast. No call, in mock
  mode or with Claude; `/undo` takes it back like the rest of the update.
- **A lived-in town** (added 29 Oct 2026, rules version 7). The update fills
  in what older games lack from the town's own data: everyone's age and
  history, and every place's history, what you notice inside and its hours.
  It adds the dead and the people who live elsewhere, the new town places
  (on the map, as in a new game) and the places out of town, and gives you
  the age your background starts at (a veteran is 34). Anything already in
  the game (a name, a home, memories, an edit you made) stays as it is. The
  feed says, for example, "Added 25 people the story names (8 dead, 17
  living elsewhere) and 20 places (5 in town, 15 out of town). Filled in the
  ages and histories of 41 people and the history, details and hours of 18
  places. Tomas Reed is 34, the age a veteran starts at." or "The town is
  already lived in." No call, in mock mode or with Claude; `/undo` takes it
  back like the rest of the update.

Behind the scenes a save carries `state.meta.rulesVersion` (7 now; a save
without it reads as 1). The steps that bring a game up to date are listed in
`Upgrade.MIGRATIONS` in `index.html`.

## What a turn costs

The defaults are set for the best play-through, not the cheapest: Opus 5.5 narrates, Haiku 5.5 parses, Sonnet 5.5 bookkeeps, with medium effort where judgement matters. At those settings a turn is roughly 2 to 2.6 cents, so about $2.10 to $2.60 per 100 turns (the playtest's estimate; see "Faster, cheaper turns" below). The measured figures below were taken with the original cheap defaults (Sonnet 5.5 narrator, Haiku 5.5 parser, all effort low), which you can set in Settings if you want them back.

Measured against the live API on 28 Oct 2026, in a 4-turn run (the arrival
plus three turns) at the default models and effort `low` for every role. The
prices are those in `docs/API_NOTES.md`: Sonnet 5.5 at $2 / $10 per million
input / output tokens ($0.20 cache read), Haiku 5.5 at $0.10 / $0.50.

| Call | Input (measured) | Output (measured) |
|---|---|---|
| Parser | ~1,800 tokens | ~125 |
| Narrator | ~900 to 1,200 tokens of packet + ~830 cached system tokens | 160 to 510 |
| Bookkeeper | ~3,300 tokens | 180 to 340 |

- The whole run (arrival plus three turns) cost **$0.0297**: about
  **$0.0075 per turn**, so **100 turns is roughly $0.75**. Most of that is
  the narrator.
- The prompt cache was read on every narration after the first. The first
  narration of a session pays a little extra to write it, and the cache lasts
  about five minutes between turns.
- `/look`, `/rest`, `/wait` and `/skip` call only the narrator. A narration
  that fails the style check is written a second time, which adds one
  narrator call. Since the narrator packet ends with an explicit LENGTH
  line, six live turns on 28 Oct 2026 (talks, walk-and-talks, a persuade
  roll and a plain move) gave first drafts of 70 to 89 words, all within the
  90-word limit, so none was rewritten ($0.0301 for the six turns).
- Since the lived-in town (rules version 7), every narration carries three
  cached system blocks: the style guide (about 650 tokens), the town (its
  history, recent events and places, about 2,600) and the cast (everyone
  here with their history, then the dead and the people elsewhere, about
  8,200): about 11,500 tokens in all by the tests' estimate of 1.4 tokens a
  word (they fail over 12,000). That is written to the cache once a session
  (about 6 cents with Opus 5.5) and then read at $0.20 per million, about a
  quarter of a cent a narration. The parser and bookkeeper packets listed
  the people not met yet, one short line each (about 1,100 and 700 tokens,
  not cached): roughly 0.4 cents a turn on Sonnet 5.5. Since 29 Oct 2026
  those lists are cached too (see "Faster, cheaper turns" below). Nobody is
  ever made in play, so there is no call for it.
- Since 30 Oct 2026 the narrator's packet (not cached) also carries the
  traits, goal and secret of everyone in the scene (about 90 tokens a
  person, and one rule line of about 110), your goal, flaw and open threads
  (about 190 tokens with three loose ends), and every turn of the scene you
  are in instead of the last three (up to twelve turns and about 700
  words, so up to about 1,000 tokens in a long scene). The cached blocks
  are unchanged. The playtest's cost report, over the same 15 mixed inputs
  in mock mode, measures the packet at 8,202 characters on average (11,455
  at most), about 2,340 tokens, where it was 5,189 (7,559 at most), about
  1,480. Priced at Opus 5.5 and Sonnet 5.5 that puts an ordinary turn at
  $0.0319 to $0.0380 (it was $0.0284 to $0.0346) and 100 turns at about
  $3.19 to $3.80 (was $2.84 to $3.46). Mock narrations are short; real ones
  make a long scene cost a little more, up to the 700-word cap.
- Since the town talks (see The living world), no call and no packet line
  is added: the one RUMOUR line a turn was already there and the journal's
  news is written by the game. The same 15 inputs meet a slightly
  different town (the clocks roll half as often and the morning spread
  uses the dice too), and the report now measures the packet at 8,168
  characters on average (11,455 at most), about 2,330 tokens: an ordinary
  turn $0.0318 to $0.0380, 100 turns about $3.18 to $3.80.
- Since seeds are events (see The living world), no call and no packet
  line is added either, but the first loose end now comes on day 1: the
  report's game picks the debt first, so on the third of its 15 inputs the
  creditor comes into the scene (one more person in PRESENT while they
  stay, and one DUE EVENT). It measures the narrator packet at 8,339
  characters on average (11,980 at most), about 2,380 tokens.
- **Faster, cheaper turns** (29 Oct 2026). Three changes, measured by the
  playtest's cost report over the same 15 inputs in mock mode (the API was
  not called; see "Verified against the live API"):
  - Haiku 5.5 parses ($0.10 / $0.50 per million tokens, cache read $0.01)
    and Sonnet 5.5 keeps the bookkeeper and the chronicle (Settings: Parser
    model, Bookkeeper model).
  - The lists that do not change from turn to turn left the parser's and
    the bookkeeper's messages for a cached system block after their prompt,
    each read at the cache rate once the session's first call has written
    it. The parser's block (everyone in town with pronouns, job and ties,
    the dead and the people elsewhere, the places out of town: 9,739
    characters) and its prompt (1,939) are about 3,340 tokens; its message
    fell from 10,980 characters on average (11,236 at most) to 2,785 (3,293).
    The bookkeeper's block (everyone in town and the factions: 3,580) and
    its prompt (1,195) are about 1,360 tokens; its message fell from 5,462
    (5,713) to 2,895 (3,314). Both prefixes are over the 512-token minimum
    for caching. The structured-output schemas (2,150 and 4,575 characters)
    are still priced at the full input rate.
  - The report now also counts the narrator's town block, which it had left
    out: the narrator's cached blocks are about 13,670 tokens at the
    report's 3.5 characters a token (style 2,598 characters, town 10,588,
    cast 34,668).

  Per call without thinking: parser $0.0002, narrator $0.0145, bookkeeper
  $0.0063. An ordinary turn is $0.0213 without thinking and $0.0261 with
  about 150 thinking tokens a call (it was $0.0318 to $0.0380 with Sonnet
  parsing and nothing cached for the parser and bookkeeper); the same turn
  at the new models with the lists still uncached in the messages would be
  $0.0241 to $0.0288. 100 turns: about $2.13 to $2.61. A narrator-only
  command (`/look`, `/rest`, `/wait`, `/skip`) is about $0.0145 to $0.0175.
  The first call of a session (or the first after five idle minutes) writes
  each cache instead of reading it: narrator +$0.0656, parser +$0.0004,
  bookkeeper +$0.0031.
  The cast blocks stay the same from turn to turn until the cast itself
  changes (an edit, a merge, a death), so they are read from the cache
  every turn of a session; meeting someone, moving or a change of attitude
  does not touch them.
- Since work and trouble (see Work), the parser's message carries a WORK ON
  OFFER HERE line where work is on offer (about 45 tokens a job) and its
  prompt one sentence about it, and `work` is in the parser's action list.
  Over the same 15 inputs (the game starts at Pittman's, where Dewayne hires in the
  morning) the report measures the parser's message at 2,887 characters on
  average (3,447 at most), where it was 2,799 (3,293), its prompt at 2,139
  (1,939) and its schema at 2,157 (2,150): about 1,440 tokens at the input
  rate and 3,390 cached. An ordinary turn is unchanged at the report's
  precision: $0.0216 without thinking, $0.0263 with, 100 turns $2.16 to
  $2.63. A turn of work adds the JOB line to the narrator's packet (about
  95 tokens) and a note to the bookkeeper's (about 40), and a fight that
  comes to you the ATTACKED line (about 65); no call is added.
- The felt wait: once the narration has streamed in, the input takes your
  next move while the bookkeeper finishes (a few seconds), and the parser
  in front of the narration is Haiku, the fastest of the three.
- The chronicle (bookkeeper model, every 10 turns) was not part of the run;
  it is estimated at about 1,000 input and 110 output tokens. Higher effort
  or the Opus model costs more. The Debug tab shows the real token counts
  and cost for the turn and the session, and per role and model (for
  example `parser claude-haiku-5-5`) with each role's cache reads.

## Editing the town

The whole town lives in `index.html` between the markers
`// ===== BEGIN CONTENT =====` and `// ===== END CONTENT =====`: `TOWN_DATA`
(places, people, factions and their clocks, threads, seeds, rumours), `TABLES`
(random tables), `BACKGROUNDS`, `FLAWS`, `LOOSE_ENDS`, `GRUDGE_TEMPLATES`,
`FAVOUR_TEMPLATES` and `JOBS` (the paid work; see Work). It is plain data
with double-quoted strings. The shape is
in `docs/BUILD_PLAN.md` under "Shared data contract". After editing, run:

```
node tests/validate-town.cjs
```

It checks every field and cross-reference: ids, symmetric exits, schedules,
clock effects, seed effects (a known op, ids that exist, a `visit` only by
someone in town, a `placeItem` thing with a short lower-case name) and seed
triggers, and for the cast: unique ids and names,
pronouns that match the look, a real role, relations written on both sides
with matching words ("husband" one way, "wife" the other), a home that
exists, a place in every phase, and every home to find reachable from a
place on the map. It checks ages against looks and family (parents 16 to 60
years older, grandparents at least 32, spouses within 20 years, siblings
within 25), histories of two or three sentences, the dead (when they died,
never scheduled) and the people elsewhere (where, how to reach them), places
out of town (no exits, no map, never discovered), every place's details,
hours and history, the jobs (6 to 8, each giver at the job's place in
every phase it is offered, a pay range, a roll or none, a cooldown, and
effects checked like a seed's), a grudge or favour template's effects
(`{npc}` for its person), and runs `tests/mentions.cjs`, so a name or a place the
content mentions with no record fails. It lists every problem it finds and
exits 1. After
changing the cast, regenerate the roster:

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
```

The tests drive the game in headless Chromium with Playwright, in mock mode,
from `file://`, with the network blocked. Playwright is preinstalled in the
build environment. Elsewhere, run `npm i playwright` and
`npx playwright install chromium` in this folder first. There is no
`package.json` and nothing else to install.

- `tests/acceptance.test.cjs`: the twelve acceptance checks of SPEC.md section 14.
- `tests/playtest.test.cjs`: a scripted 30+ turn game, the pacing reports
  (faction clocks and rumour spread over 200 seeded runs, insult-to-grudge
  timing), the cost estimate, and the mock parser rules.
- `tests/mobile.test.cjs`: 375x740 and 390x844 checks for tap targets, input
  size, overflow and safe areas, the narrator strip included.
- `tests/constraints.test.cjs`: the single-file rules.
- `tests/upgrade.test.cjs`: updating an older game (rules version, the
  Update buttons, the memory rewrite, the places re-read, the clock check,
  people matching the story and the full cast, in mock mode and against
  canned API replies, failure, refusal and `/undo`).
- `tests/content.test.cjs` also checks the cast: 40 to 45 people, everyone
  somewhere in every phase, relations both ways, homes, a new game with
  nobody made, and `docs/CAST.md` up to date.
- `shell`, `state`, `pipeline`, `api`, `world` and `content`: the milestone suites.

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
present-day, not low fantasy. The narrator's three example turns are
rewritten as modern scenes, and money is shown as dollars (the state field is
still `player.gold`).

And from `docs/BUILD_PLAN.md` ("Direction changes"): narration is casual by
default, with the SPEC.md style guide kept as the Literary option, and the
input has the Do / Say switch described above. Direction change 8 (a full
cast): every person is written by hand and the game never creates one in
play, so SPEC.md's NPC creation in "check and create" (and the bookkeeper's
new people) is gone; loose ends tie to cast members instead of new NPCs.

And from `docs/BUILD_PLAN.md` ("Direction changes, second round", 10):
SPEC.md section 10 says never to send hidden NPC secrets. The narrator
packet sends the secret, goal and traits of each person in the scene, with
one rule that a secret is never told or hinted at and only shapes what that
person dodges, lies about or lets slip once the player has earned it,
because without it the narrator cannot write an evasion, a lie or a slip.
Nobody else's secret is ever sent, and the cached cast block carries none.
The packet's LAST 3 TURNS (section 10's example) is THIS SCENE, every turn
since the player came to the place they are in (capped), with BEFORE THIS
SCENE on a fresh arrival.

And from `docs/BUILD_PLAN.md` ("Direction changes, second round", 12):
SPEC.md section 8 rolls the faction clocks at every phase change. They roll
at the morning and evening ticks only (two rolls a day), because at four a
day the town's whole plot finished by about day 14 in every seeded run, with
no help from the player. Section 8's "someone likely to know" a rumour is
now whoever has heard it: rumours spread each morning between people who
share a place (see The living world).

And from `docs/BUILD_PLAN.md` ("Direction changes, second round", 14):
SPEC.md section 5's example plants a seed so the lender "come[s] to collect
around day 3", and section 14's acceptance test 5 reads "A debt loose end
from character creation → the lender confronts the player around day 3".
The first loose end the player picks now comes on day 1, after the second
turn, because nothing pulled on the player for the first two days; the
other two keep their windows, so a debt picked second or third still comes
around day 3 (acceptance test 5 picks it second and also checks the day-1
visit of the first). Section 8's fired seed "becomes a due event for the
next narration"; an engine seed may now also carry effects that change the
town when it fires (someone at a place for that phase, a thing to find, a
flag), so the world matches what the narration is told.

And from `docs/BUILD_PLAN.md` ("Direction changes, second round", 15):
SPEC.md sections 6 and 13 give one parser model to the parser, the
bookkeeper and the chronicle. Settings has a Parser model (the parser only;
Haiku 5.5 by default, the model SPEC.md named) and a Bookkeeper model (the
bookkeeper, the chronicle and the updates of older games; Sonnet 5.5),
because the parser's short, fixed job runs before anything is shown and
wants the fastest model, while what the bookkeeper records is worth the
dearer one. The parser's and the bookkeeper's lists of people and places
go in a cached system block rather than the message (section 13 caches
only the narrator's style guide).

And from `docs/BUILD_PLAN.md` ("Direction changes, second round", 16):
SPEC.md section 10's `parse_action` lists eighteen action types; it has a
nineteenth, `work` (taking paid work on offer, `JOBS`), and the parser's
message a WORK ON OFFER HERE line. Section 7's fights are still a roll at a
time, but they no longer start only with the player: the `fight` effect
(one of the grudges) brings someone to the player, who defends with might.

## Verified against the live API on 28 Oct 2026

The live path was checked on 28 Oct 2026 with the default models at effort
`low`: an arrival plus several turns, including a walk and an action in one
line ("I head to the bar and ask the bartender..."). Every call returned 200,
and the narrator's prompt cache was read on every narration after the first.
The automated tests still run in mock mode, or against canned API responses
served inside the browser (`tests/api.test.cjs`).

The casual style and the Do / Say switch were checked live the same day at
the current defaults (Opus 5.5 narrator at medium effort, Sonnet 5.5 parser):
an arrival and three Do turns in the casual style (no similes, no rewrites),
Say "Run." to one person (the player stayed, he answered), Say "Anybody here
hiring?" to everyone (both people answered) and Do "I run away from Royce."
(the player ran off to another place).

The clock fix was checked live on 29 Oct 2026. A save at rules version 3
whose clock had ticked into day 2 morning in the middle of the night at
Dewayne's house went through **Update this game**. The parser model answered
`{"behind":true,"phase":"night","dayOffset":-1,...}`, and the clock went back
to day 1, night (late). Three short actions after that all stayed at night.
The whole check took 10 calls and cost $0.088.

Not re-verified live: faster, cheaper turns (29 Oct 2026; Haiku 5.5 as the
parser, the Bookkeeper model setting, and the parser's and bookkeeper's cast
lists sent as a cached system block). They were built in a session with no
API key and checked only against mock mode and the canned API responses in
`tests/api.test.cjs`, which check the request shape (the system prompt as two
text blocks with `cache_control` on the second) but not the API's answer to
it. To check them live: turn mock mode off, play two turns, type `/debug`
and look under **API (claude)**. The `parser claude-haiku-5-5` and
`bookkeeper claude-sonnet-5-5` lines should show "cache write" above zero
after the first turn and "cache read" above zero from the second parse and
bookkeeping of the session on (within five minutes of each other). A 400
that names `system` or `cache_control` means the request shape needs fixing.

If a request fails, the feed shows a short message and your typed action stays
in the box. Type `/debug` and look in the Debug tab:

- **API errors**: each failure with its role (parser, narrator, bookkeeper,
  chronicle), HTTP status, `request-id` and the API's own message, verbatim.
- **Last raw responses**: the last four exchanges, with status, request-id,
  stop reason, token usage and the reply.
- **API (claude)**: token and cost totals for the turn and the session, then
  the session per role and model. On the second narration, parse and
  bookkeeping, "cache read" should be above zero.

Usual causes: 401, a bad key (check Settings); 404, a model name the API does
not know (check the three model fields); 400, a request the API rejects (the
message says what; please report it); 429 or 529, busy, already retried once,
so try again. To keep playing while you sort it out, tick Mock mode.
