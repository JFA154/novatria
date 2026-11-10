# Writing a story pack

This guide is for someone who has seen a story pack, perhaps the built-in
Low Water or the starport sample, and wants to write one. It covers what a
pack is, how to start one, every tab of the editor and every field of the
format, the rules no pack can change, how a pack is shared, and what to do
when something goes wrong. Creator Mode arrived in wave 37; the engineering
notes are in `docs/notes/creator-mode.md`.

Contents:

1. [What a story pack is, and what it is not](#what-a-story-pack-is-and-what-it-is-not)
2. [Starting a story](#starting-a-story)
3. [The editor, tab by tab](#the-editor-tab-by-tab)
4. [Ids and renaming](#ids-and-renaming)
5. [Effects, conditions and placeholders](#effects-conditions-and-placeholders)
6. [The fixed rules no pack can change](#the-fixed-rules-no-pack-can-change)
7. [Who wins: the engine, the pack or the player](#who-wins-the-engine-the-pack-or-the-player)
8. [The token budget and the meter](#the-token-budget-and-the-meter)
9. [Show me the prompt](#show-me-the-prompt)
10. [Testing a draft, and the Developer overlay](#testing-a-draft-and-the-developer-overlay)
11. [The rating gate](#the-rating-gate)
12. [Sharing a story by file](#sharing-a-story-by-file)
13. [The Story to Pack converter](#the-story-to-pack-converter)
14. [What a refusal looks like in play](#what-a-refusal-looks-like-in-play)
15. [What the engine used to assume about Low Water](#what-the-engine-used-to-assume-about-low-water)
16. [Why every player needs their own key](#why-every-player-needs-their-own-key)
17. [Troubleshooting](#troubleshooting)
18. [Every field](#every-field)
19. [Examples, by path](#examples-by-path)

## What a story pack is, and what it is not

A story pack is one JSON file that holds a whole story: the town (or the
station, or the village) with its places, people, factions and what is
already going on; who the player can be and how they arrive; how the story
opens; and the dials that set how the narrator writes and how the rules
play. The game has one engine and plays any pack. The built-in story, Low
Water (the town of Lockett's Ferry), is itself a pack: `packs/low-water.json`,
copied into `index.html` so the game still runs from a file on disk. The
owner asked for exactly that: "convert Low Water to a JSON so it can be used
as a story pack. No hard coded story allowed."

The story is yours. The AI narrates it, turn by turn, from what the game's
code says is there, and if you choose, it structures your own words into the
editor's fields (the Story to Pack converter). It never writes your world.
The owner put it this way: "I want to keep the story itself away from AI
generated, yes I know the narration is AI, but that's what's going to make
my tool different, ideally as little as possible generative AI in the
creator mode." So the editor's forms need no AI and no key at all, and there
is no button that drafts a town, writes people or invents example turns.

A pack is data, never code. It cannot run a script, reach the network, read
the player's key or change the game's rules beyond the dials it is given
(see [the fixed rules](#the-fixed-rules-no-pack-can-change)). It travels as
a file: there is no store and no server.

A pack is not a save. A save is one game of a story, with everything that
has happened in it; it carries a reference to its pack (and an exported save
carries the whole pack, so it plays on another device). Editing a pack never
changes a game already started from it: each game keeps a frozen copy of the
exact pack it began with.

## Starting a story

Tap **Create** on the title screen. Creator Mode opens on **Your stories**,
the Library: one card per story, the built-in story first, then the packs on
this device by title, then your drafts. Each card shows the title, the author
and version, a rating chip, the premise, a ring that fills as the story's
sections are filled, and a badge (Built in, Imported, From a save, Copy,
Saved, Draft). Its buttons: **Play this story** (it becomes the story New
game starts), **Open in Creator**, and under them **Export**, **Duplicate**
and **Delete**.

Three ways to start:

- **New story** (the Library's toolbar) opens a blank draft with the few
  fields a pack must have.
- **Open in Creator** on Low Water puts a copy of it in your Library (badge
  Copy, with an id of its own) and opens that as a draft ("Opened a copy; the
  built-in story cannot be changed."). This is the quickest way to learn the
  format: every field is filled, and you can change one thing, test it and
  see what it does. **Duplicate** makes such a copy of any story without
  opening it; Open in Creator on a pack of your own opens its draft.
- **Import a .json** reads a pack file someone gave you into the Library
  (see [sharing](#sharing-a-story-by-file)). The starport sample,
  `packs/starport.json` in the repository, is imported this way: it is a
  second, smaller sample pack (a starport where money is credits, written
  after the number, the law is a security chief, and the arrested are held
  in a brig), shipped as a file rather than built into the page so that
  every load of the game stays its size.

A draft is your working copy. It saves itself to this device as you type
(and at once when you leave the page), so closing the tab loses nothing.
**Save** (Save as pack) checks the whole story; with no errors it raises the
version's last number and puts the pack in your Library, where Play this
story can start it. A draft with errors still saves as a draft, never as a
pack.

If this device cannot keep packs and drafts (a private window, storage
blocked), the Library says so: "Packs and drafts can't be kept on this
device; export your work before you leave."

## The editor, tab by tab

The editor's header card shows the story's title, author and version, the
token meter (see [the budget](#the-token-budget-and-the-meter)), **Undo** and
**Redo** (twenty steps; each accepted change is one step), **Test** and
**Save**. Under it the tab strip; a number on a tab counts the errors on it.
Every field shows its problems underneath it as you type (checked about a
third of a second after you stop, in a quiet moment), and the Overview's
Problems list gathers them all: tap one to go to its field.

Each form field has its label above it and a line of help beneath; most
sections fold their longer explanation under "More about this". The full
list of fields, with what each takes, is [Every field](#every-field), and an
example of each is in [Examples, by path](#examples-by-path).

**Overview** is about the story as a whole: the title, author, version,
rating, description, content warnings, tags, language and lint sets
(`meta`); the setting (`setting`: era, a one-sentence blurb, names and
brands the style check should let through, the world's vocabulary and the
names of the four times of day); the suggested settings (`suggestedSettings`:
models, effort and narration style a player is offered at New game, never
applied without their tap); **Your story, in your words** (`meta.storyText`,
up to 40,000 characters, kept in the pack and never sent to the game's
narrator), with the converter's card under it; and Problems.

**World** has its own strip of lists:

- **Town**: the town's name, setting (the paragraph the narrator reads every
  turn), history, year, calendar, money, where a new arrival starts, the
  police head and fallback, the law, the gates, and the Romance list. Ties,
  secret ties, the map, recent events and the people offstage are edited on
  the JSON tab.
- **Places** (`world.locations`): name, type, description, details, hours,
  history, the days it is shut, exits (both ways: adding an exit offers the
  way back), whether it is known at the start, out of town and how far.
- **People** (`world.npcs`): name, pronouns, age, presence (here, away or
  dead), role, faction, tags, look, voice, traits, goal, secret, history,
  home, relations (with the reverse relation offered), and the rest of what
  people hold and how they take things. A "Starting state" fold holds the
  attitude and whether they are alive and known.
- **Schedules**: a grid of places by the four times of day, with the people
  in each cell. Every living person here needs a place in every phase.
- **Factions and Clocks** (`world.factions`): each faction's goal, methods,
  relations and its clocks (4 to 10 segments, what happens when one fills,
  `requires` and what happens otherwise).
- **Threads**, **Rumours**, **Events and Seeds** (the town's planned events,
  its hidden seeds and the ending) and **Goods** (what can be bought and
  what a partial success can cost).

**Player** is who the player can be: backgrounds (stats, money, three
things, how they arrive, a first hook), flaws, goal suggestions, loose ends
(each binds to a real person of your cast by tag), the four stats' names and
descriptions, health and story points at the start, the age range, the two
arrivals and the steps of character creation.

**Opening** is how the story begins: the premise New game and the story
card show, the opening text, and what the narrator is told about the first
turn, each up to 1,200 characters with a live count. Low Water has none of
its own and plays the engine's default opening.

**Narrator** is how the narrator writes (`narration`): the style (casual,
literary or your own guide), banned phrases (the engine's list is shown
greyed; adding your first phrase starts your list from the engine's, so
nothing is dropped by surprise), the style checks a story may switch off,
example turns (write your own, or use the style's), what a good turn does,
lengths in words, and the point of view. A point of view other than second
person present switches off the checks that assume it ("As you", the
invented past); the money and name checks always run.

**Directions** (`directions`) are what the narrator is told at particular
moments: intimate scenes first, then combat, defeat, death, arrival, a time
skip, gambling, the epilogue, the first turn, a refusal by someone, a failed
roll and a critical roll, each up to 1,500 characters. Each field shows the
engine's default as its placeholder, with **Show the default** and **Use the
default**. A direction you write reaches the packet as its own line with a
short ENGINE line after it (see [fixed rule 7](#the-fixed-rules-no-pack-can-change)).

**Rules** (`rules`) are the numbers the code decides by, in thirteen cards:
when to roll, the difficulty numbers, the floors (how hard asking and lying
get with someone who distrusts the player), health and damage, criticals,
permadeath, showing rolls, story points and `/fact`, time, prices, the law
(fines, rough sleeping), cheats and undo, romance (with the intimacy roll)
and the card game. Every field shows the engine's default as its
placeholder; emptying a field gives the default back.

**Freedom** (`freedom`) is how far play may leave what you wrote. Three
presets: **sandbox** (the default: the story may reveal places and things,
travel goes anywhere, nothing steers, `/skip` works anywhere), **guided**
(places and things the narration names, travel only to places the player
knows, a nudge toward an open thread) and **rails** (nothing created, travel
only to the places you listed, the scene steered toward the thread, actions
outside the story refused with your reason, no `/skip`). Each dial shows
its effective value; one you set yourself carries an "overrides the preset"
chip, and **Follow the preset** gives it back. People are never created by
play (`freedom.create.people` is accepted only as false).

**Prompts** (`prompts`) are three notes added to the game's own
prompts: one for the narrator (1,500 characters), one for the parser and one
for the bookkeeper (600 each). The ENGINE RULES text each note is followed
by is shown read-only beneath it. Use these sparingly: most of what a story
needs belongs in the Narrator and Directions tabs.

**JSON** is your story as the file: the formatted pack, live, with its line
count and size, **Copy JSON**, **Download .json** (the share sheet) and
**Import** (replace this draft from a file). This is where the fields the
forms do not draw are edited: the map, ties and secret ties, recent events,
the people offstage, the random tables, the grudge and favour templates, a
loose end's follow-up and an obligation's effect lists.

**Prompt view** is [Show me the prompt](#show-me-the-prompt); **Test** is
[Test from a draft](#testing-a-draft-and-the-developer-overlay).

## Ids and renaming

Every person, place, faction, thread, seed, rumour, event, background and
thing has an id: a lowercase slug with a prefix for its kind (`npc_`, `loc_`,
`fac_`, `thr_`, `seed_`, `rum_`, `evt_`, `bg_`, `item_`), such as `npc_jodie`
or `loc_low_water`. The editor makes the id once, from the first name you
type (`npc_` and the first name; `loc_` and the name without "The"; `_2`,
`_3` when it is taken), and shows it read-only. Renaming someone never
changes their id, because saves, relations, schedules, rumours and effects
all point at it.

When an id must change, **Change id…** on the record rewrites every
reference to it across the whole pack in one step (one Undo). The new id
keeps its kind's prefix and must not be taken. The pack's own id
(`meta.id`) is made from the title and never changes: saves and files name
the story by it, so a renamed story is still the same story. A copy
(Duplicate, or Open in Creator on the built-in story) gets an id of its own,
so it never overwrites the story it came from.

## Effects, conditions and placeholders

The parts of a story that change the town are lists of effects: what a
filled clock does, what a seed does when it fires, an event's branches, the
ending, a complication, a grudge or favour, a loose end's obligation. Each
effect is `{ "op": ..., fields }`, applied by the code through the same
checks as everything else. The ops are `closeLocation`, `openLocation`,
`npcStatus`, `npcMove`, `tieDelta`, `propagate`, `attitudeDelta`,
`priceMultiplier`, `openThread`, `threadStatus`, `addRumour`, `plantSeed`,
`factionRelation`, `setFlag`, `reputationDelta`, `playerGold`, `playerHp`,
`giveItem`, `placeItem`, `takeItem`, `addCondition`, `banFrom`,
`playerPrice`, `addMemory`, `clockAdjust`, `threadUpdate`, `addObligation`,
`settleObligation`, `obligationPaid`, `addNews`, `socialEvent`,
`owedSettle` and `leverageSet`. Their fields are in the effect-ops table of
`docs/BUILD_PLAN.md` ("Effect ops"); the editor's Effects editor offers
each op with its fields, and the validator checks every op, every field and
every id it names.

A condition (`requires` on a seed or a clock's completion, `when` on an
event's or the ending's branch) holds when every part of it holds:
`flagsSet`, `flagsUnset`, `npcFree`, `npcAt`, `clockAtLeast` (the segments a
faction has filled in all its clocks), `attitudeAtLeast`, `obligationStatus`,
`obligationOpen`, `relAtLeast` and `relBelow` (`{ npcId: { liking, trust,
fear, knows } }`), and `playerAt`. A seed or completion whose `requires` does
not hold when its time comes uses its `alt` instead, so its text stays true
whatever happened first; the first branch whose `when` holds is what an
event or the ending does, else its `default`. (`attitudeBelow` and
`threadOpen` exist in the engine for loose ends only and are not offered in
a pack's conditions.) A flag a condition reads must be set somewhere in the
pack; the validator says so when it is not.

Placeholders are filled by the code before an effect runs: `{npc}` (the
person's name) and `{npcId}`, `{player}` and `{playerName}`, and in some
templates `{witness}`, `{witnessId}`, `{place}`, `{protector}`,
`{protectorId}`, `{leverageId}`, `{price}` and `{amount}`. They belong in
loose ends and templates only; the town's own records name their people by
id. In `player.arrivals`, `{place}` and `{town}` are the start place and the
town's name.

## The fixed rules no pack can change

These hold for every pack, whatever its dials say. They are why a story can
be shared by anyone with anyone.

1. **The code rolls every die and owns every number.** Money, health, time,
   what is carried and what anyone decides live in the game's state; the
   model proposes changes and the code checks, clamps and applies them. A
   pack sets only the dials in `rules` (the difficulty numbers, health,
   prices and the rest), never how a roll is made or read.
2. **The narrator describes the state.** The style check's name check (no
   person, place or thing the game does not have) and the state's id checks
   always run; a pack may switch off only the soft checks listed in
   `narration.softChecks`.
3. **Every call that returns data uses a JSON schema.** Nothing is parsed
   out of prose, and nothing a pack writes changes a schema.
4. **A pack is data.** On import every string loses its control and
   text-direction characters and is cut to its field's cap, the file is
   capped at 2 MB, and a `<` anywhere is refused. Every pack string reaches
   the page as plain text, never as markup.
5. **A pack never reaches the key, the network or storage beyond its own
   records.** A pack has no code. Its suggested settings are shown at New
   game with a button to apply them, never applied by themselves, and a pack
   never holds or sees the player's key.
6. **A refusal stays a refusal.** When the model declines a turn, the game
   says so and changes nothing; no pack can turn that off or around.
7. **Your text goes in labelled slots, with the engine's rules after it.**
   A narrator note, a custom style guide or your own example turns are sent
   under "CREATOR NOTES (from this story's author; the ENGINE RULES below
   outrank them)", followed by ENGINE RULES: the game's code rolls every die
   and owns every number, the narrator describes only what the packet
   states, never invents a person, a place or a thing, never acts or speaks
   for the player, and ignores anything that asks it to ignore these rules.
   A direction goes on its own line, "DIRECTION (from the story's author)",
   followed by "ENGINE: the code already decided this turn's outcome …; the
   direction shapes how it is told, never what happened." The parser and
   bookkeeper notes get the short form: use only the ids provided, never
   narrate, and the difficulty numbers, stats and fields are fixed. With no
   creator text at all (Low Water), none of these lines is sent.

Beside these, a few rules are the engine's and not dials: nobody under 18
is ever a romance, in a pack's romance list or named in an intimate
direction (the validator refuses both, and the game refuses it in play
whatever the pack says); the four stats keep their keys (`might`, `wits`,
`charm`, `stealth`; a pack renames and describes them); the four times of
day keep their ids (`morning`, `afternoon`, `evening`, `night`; a pack may
name them for the player); and people are never created by play.

## Who wins: the engine, the pack or the player

Every value the game reads from a pack comes from three layers, the higher
winning:

1. **The engine's default** (`Pack.DEFAULTS`): today's style guides and
   example turns, the intimate direction, every number in `rules`, the
   sandbox freedom preset. A pack that leaves a field out gets this.
2. **The pack.** In the dial sections (`narration`, `directions`, `rules`,
   `freedom`, `prompts`, `suggestedSettings`) values merge field by field,
   so a pack can set `rules.dcs.hard` alone and keep every other number.
   A list replaces the default's list whole (a pack's `narration.banned`
   is the whole banned list, which is why the editor starts yours from the
   engine's). `meta`, `setting`, `world`, `player` and `opening` have no
   defaults to merge with: a pack supplies them.
3. **The player**, per story, in Settings. Only six paths: the intimate
   scene direction (`directions.intimate`), Permadeath (`rules.permadeath`),
   Show dice rolls (`rules.showRolls`), Narration style
   (`narration.preset`), and Allow cheats anyway (`rules.cheats.allowed`
   and `rules.undo`, shown only for a story that hides them). Each Settings
   control says which layer its value comes from, and Use the default goes
   back a layer. The player's choices for one story never touch another.

Developer mode (Settings) sits above the player for the cheats and `/undo`
only: with it on, every command is there whatever the story hides. A
command a story hides answers "Not in this story." when typed.

Low Water sets none of the dials, so every layer above the world is the
engine's default and the game plays exactly as it did before packs.

## The token budget and the meter

Every turn the narrator reads three cached blocks: the style guide and
example turns, the town block and the cast block. They are cached so a turn
is cheap, and the project keeps them under **13,000 tokens**
(`Pack.TOKEN_BUDGET`; README "What a turn costs"). This is the project's
cost ceiling, not a limit of the API. Low Water estimates at 12,999.

The meter in the editor's header is that estimate for your draft, rebuilt
about 0.4 seconds after you stop typing, exactly as a game of the draft would
send the blocks (`Pack.budgetEstimate`: about 1.4 tokens a word, the total
rounded once). It counts the style guide (or yours) with its banned phrases,
the example turns, the good-turn note and your narrator note with its ENGINE
RULES; the town's name, setting, history, recent events and every place on
the map; and the cast block, one line for each person the narrator may meet
or hear of. It does not count the per-turn packet, the parser or the
bookkeeper.

Over 13,000 the meter turns red and the validator reports `engine.budget`,
anchored at the first author text it can shorten (the narrator note, the
custom guide, the example turns, the history). It is a warning: a story over
the budget still saves and plays, and costs more a turn. To shrink it,
shorten the town's history and the places' histories, tighten looks, voices
and histories in the cast, drop people who never appear, use the style's
own example turns rather than longer ones, and keep the narrator note to
what the guide does not already say. Low Water is at the ceiling, so any
narrator note on a copy of it goes over.

## Show me the prompt

The **Prompt view** tab shows exactly what the models would be sent for
your draft, in eleven situations: an ordinary turn, a zoomed turn, an
arrival, an intimate scene, combat, defeat, the epilogue, gambling, a failed
roll, a critical roll and the first turn. For each: the narrator's system
prompt, the town block, the cast block and a sample packet, with a token
count on each and Copy, and the parser's and bookkeeper's prompts. It builds
them in a sandbox from a throwaway game of the draft: nothing is sent to any
model, and the game you are playing and its autosave are untouched. Use it
to see where your directions and notes land and what a cast line says about
someone.

## Testing a draft, and the Developer overlay

The **Test** tab (and the Test button in the header) starts a real game
from the draft: choose the mode Settings uses (the offline demo or Claude),
a background from the draft's own (the test character is called "Tester"),
and a seed (empty for a random game; the same number gives the same
weather, dice and draws again), then **Start a test game**. Errors block it,
with a button to the Problems list; warnings do not. If you have an unsaved
game of another story, the game asks before replacing the autosave.

A test game says "Testing: <title>" above the feed, with **Back to the
editor**; Settings' Quit says the same. Its autosave keeps playing from the
version of the story you tested, even after you change the draft, so start a
new test to see a change.

In a test game (and in any game with Developer mode on in Settings) the game
panel has a **Dev** tab: the last packet sent with its token estimate and
Copy, the narrator's last reply (its status, request id and why it stopped),
the style check, **Force the next roll** (any of the five tiers, or a d20
number), **Set the clock**, **Place someone here**, and buttons for `/debug`,
`/reroll`, `/cheat` and `/edit`. Every command works in a test game, whatever
the story hides. The overlay changes the game only through the engine's own
paths, so what you see after forcing a critical is what a player would see
after rolling one.

## The rating gate

`meta.rating` is `general`, `teen`, `mature` or `adult`. A story rated
`adult`, or one that writes its own intimate scene direction (a
`directions.intimate` of its own, whatever its rating), needs the player's
yes before it plays. The first time such a story is started (New game, Play
this story, Test, Continue, Load or importing a save of it), the game shows
its title, rating chip and content warnings (up to twelve, each cut at 120
characters), "This story has adult content. To play it, confirm you are 18
or older.", an "I am 18 or older" box that enables Continue, and Not now.
The yes is remembered for that story on that device (Settings shows it, with
Forget) and is the player's alone: no pack and no file can set it. Without
it, no turn of the story reaches a model.

Low Water is rated adult, with six content warnings (sex, violence, drug
deaths, drug dealing, smuggling, blackmail), so every player is asked once.
Give your story honest content warnings: they are what the player reads
before saying yes.

## Sharing a story by file

There is no store and no server: a story moves as a `.json` file.

**Export.** The Library card's Export, or Download .json on the JSON tab,
opens the share sheet. It names the file (`<id>-<version>.json`) and its
size, and offers **Download**, **Share** (where the device can share a file,
as a phone can) and **Copy JSON**. It says plainly that a pack never holds
your key or a save.

**Import.** **Import a .json** in the Library reads the file, cleans it and
checks it before anything is kept:

- A file over 2 MB, a file that is not JSON, a saved game ("That file is a
  saved game, not a story pack. Import it from Save / Load."), a pack made
  for a newer format, and anything without `packFormat` and `meta` are
  refused with a sentence saying which.
- Every string loses control characters and text-direction marks, is cut
  to its field's cap (500 for a one-line field, a text field's own cap, 600
  for notes, 2,000 for a field the format does not know); keys are cut at
  64 characters, lists at 2,000 entries, and nothing below twelve levels of
  nesting is kept. Each change is listed as a warning.
- The pack is then validated as a game would play it. An error refuses the
  import and the message names the first three by path ("That story pack
  has a problem at world.npcs[3].home: …"). A `<` anywhere is always an
  error. Warnings (a person on no schedule, a field the format does not
  know, the cleaning above) are listed in a sheet with **Import anyway**.
- Fields the format does not know are kept, flagged `lint.unknownField` ("it
  is kept, and the game ignores it"), so a pack written for a later version
  of the game loses nothing passing through this one.

The JSON tab's Import replaces the open draft from a file. It is gentler: a
draft may be unfinished, so only a `<` refuses it and every other problem
shows in Problems.

**Saves and packs.** A save made on this device names its pack and keeps a
frozen copy of it, so it plays the same even if you edit or delete the pack
later. An exported save carries the whole pack; importing it on another
device adds the pack to that Library (badge "From a save") and plays it.

## The Story to Pack converter

On the Overview, under **Your story, in your words**, the card **Turn your
words into a story** holds the one AI feature in Creator Mode. Write your
story first, in any form: the place, the people, what is going on, how it
can end. Then tap **Convert** (it needs 40 words or more, and a key unless
you are in the offline demo).

The converter reads only your text, in seven calls, one kind of record at a
time, so a later kind can name an earlier one: places, people (given the
places found), factions, threads, rumours, seeds and the opening. Each call
uses a schema derived from the pack format with a `source` on every record:
the sentence it came from, copied word for word. Its instructions begin:
"Extract only what the text states. Never invent a name, a place, a trait, a
number or a fact. Where the text is silent, return null or an empty list."
The model never makes an id; the editor gives each record one.

Nothing changes until you accept. The review lists each proposed record
with its fields and, beside them in italics, the quoted sentence. A record
whose quote is not in your text (nine in ten of its words, in order) is
marked **not in your text** and left unticked. A record that would break the
story is shown with the reason and left out. **Accept all**, **Accept
ticked** or **Reject**; accepted records are written one at a time, so Undo
takes them back one at a time.

**Gaps** lists what the story needs that your text did not give: a person
with no schedule, a place with no exits, no start place, no ending. Each is a
button to the tab where you fill it in.

The converter never produces clock effects, events, the ending's branches,
effects of any kind or ids: those are your design work in the forms. If the
model declines, the card says "The model declined to read this text, so
nothing was changed." and nothing is.

## What a refusal looks like in play

A model may decline a turn. When the narrator declines, the feed says "The
narrator declined that one. Try it another way.", the player's typed input
goes back in the box, and the game's state is exactly as before the turn:
no roll is kept, no time passes. The parser's refusal reads the same way
("The parser declined that one."); when the bookkeeper declines, the story
stands but what changed is not recorded, and the feed says so. A pack can
shape how a refusal by a person in the story is told (the `refusedByNpc`
direction), but a refusal by the model is never turned into something else
(fixed rule 6).

A story with `freedom.scopeRefusal` on refuses actions outside its scope
itself, before any narration: the player reads the reason you wrote, once,
in the feed. A command the story hides answers "Not in this story." A story
that needs the 18+ yes and does not have it plays no turn: "This story needs
your 18+ confirmation first; start it again from the title screen, which
asks."

## What the engine used to assume about Low Water

Before wave 37 the engine knew it was playing Lockett's Ferry in many small
ways. Each was found and either made into pack data or made generic, so that
no Low Water name, price or place is left in the engine's code (the legacy
updater for old Low Water saves keeps its own, behind a check that the save
is Low Water):

- **The town's name as a test of "is this the built-in game"** (twenty
  places) became a check of the game's pack id.
- **The eight content constants** the engine read (the town, the tables, the
  backgrounds, flaws, loose ends, grudge and favour templates and goal
  presets) are now read from the pack that plays: `world`, `world.tables`,
  `world.grudgeTemplates`, `world.favourTemplates`, `player.backgrounds`,
  `player.flaws`, `player.looseEnds`, `player.goalPresets`.
- **Place labels** the UI kept for two places became each place's own
  `typeLabel`.
- **The council and ending thresholds** became `world.gates`.
- **The police**: who heads it, who stands in, where the arrested are held,
  the faction it is and the news line of an inquiry ("Chief Bell has been
  asking questions about …") became `world.law` (`factionId`, `headNpcId`,
  `fallbackNpcId`, `arrestPlaceId`, `newsTemplate`). A starport's law is its
  security chief, and its arrest place a brig.
- **The dollar sign**, in some twenty-five patterns that read amounts, became
  `world.currency` (`symbol`, `name`, `before`, `words`): a currency after
  the number ("40 cr") reaches the status bar, what the player carries, the
  money checks and `/cheat cash`.
- **The parser's difficulty numbers and stat sentences** became
  `rules.dcs`, `rules.floors`, `rules.hp` and `player.stats` (the four keys
  fixed, the labels and descriptions yours); the parser's prompt is built
  from them, word for word Low Water's when they are the defaults.
- **Health, story points, the card game's stake, time per phase, fines,
  rough sleeping, how many due events a turn tells, permadeath and showing
  rolls** became `player.start` and `rules` (`storyPoints`, `gamble`,
  `time`, `law`, `narration.maxDue`, `permadeath`, `showRolls`).
- **Romance gates and defaults** became `rules.romance` (with the intimacy
  roll, on in Low Water too, the owner's choice).
- **The cheats and `/undo`** became `rules.cheats.allowed` and `rules.undo`.
- **Names and brands the style check lets through** became
  `setting.locale` (`nameAllow`, `brandPhrases`, `givenNames`).
- **Words the engine matched**: the words that make someone the law by their
  role (police, sheriff, deputy, officer and the like), the things a shop
  that is against the player still sells after one night (a bed, fuel, a
  meal), the words that mark someone with no age written as a minor, and the
  words for a paid place to sleep became `setting.vocabulary.police`,
  `.essentials`, `.teen` and `.lodging`. A list you write replaces the
  engine's English list for that kind; an empty list keeps the engine's.
  The minor rule itself (under 18, by age) is fixed.
- **Goods' other names** (a beer is a drink, a round, a cold one) became each
  good's `synonyms`.
- **The times of day as the player reads them** can be named in
  `setting.phaseLabels` ("First shift" for morning on a station): the
  toolbar, the feed's day dividers and the map's title use them. The
  narrator's packet keeps the engine's own words (morning, afternoon,
  evening, night), so the four fixed times stay unambiguous to the model.
- **Arrivals** ("By road", "By river", the opening line of each), the stat
  descriptions on the Create screen and the steps of character creation
  became `player.arrivals`, `player.stats` and `player.creation.steps`. The
  two arrival keys stay `gate` and `docks`; a pack names them (a starport's
  might be "By shuttle" and "Off a freighter").
- **Hints that named Low Water people** (the Settings hint, `/pronouns` and
  `/edit` examples, the `/fact` notice) are built from the playing pack.
- **The offline demo's canned replies** (what the bar sells, the stakes at
  the card table) read the playing pack: its goods and prices in its
  currency, its dealer by the `cards` tag, its stake, its people and places.
- **The card game** is on when `rules.gamble.enabled` is true and the cast
  has someone tagged `cards`.
- **The parser's and bookkeeper's example sentences** keep their Low Water
  names (they show the form of an answer, not the story), with the currency
  written in the pack's own.

## Why every player needs their own key

There is no backend. The game is one file that runs in the player's browser
and calls the model directly with the player's own key; that is what lets
anyone open it from a file or any static host. So every player of your story
needs their own key (or plays the offline demo). A hosted proxy, where one
server holds one key and players use the game without theirs, would need a
server to run, a key held for everyone, per-player quotas so one player
cannot spend everyone's money, and accounts or other auth to know who is
who. That is a different product and out of scope; packs are shared by
file, and nothing in a pack can hold or reach a key.

## Troubleshooting

**The meter is red, or Problems says the story is over the token budget.**
The three cached blocks estimate over 13,000 tokens. Shorten the town's and
the places' histories, the cast's looks, voices and histories, and any
narrator note or custom guide; drop people who never appear. The story
still plays; it costs more a turn. See [the budget](#the-token-budget-and-the-meter).

**A command answers "Not in this story."** The story hides it
(`rules.cheats.allowed` false hides `/cheat` and `/reroll`; `rules.undo`
false hides `/undo`, `/redo` and `/rewind`; `rules.storyPoints.factAllowed`
false hides `/fact`). The player can tick Allow cheats anyway in Settings
for that story; Developer mode always has them; a test game has everything.

**A pack will not import.** Read the message: it names the first problems
by path. "That file is not valid JSON" is a broken file (a missing comma or
bracket); "a saved game, not a story pack" means it belongs in Save / Load;
"made for a newer version of the game" needs a newer game; "too big to be a
story pack" is over 2 MB. "That story pack has a problem at …" is a
validation error: open the file in a text editor, or import it on the JSON
tab of a blank draft, which keeps it and lists every problem in place, fix
them, and Save as pack.

**A save cannot find its pack.** "This save needs the story pack … which is
not on this device." The save was made on another device, or the pack was
deleted and its frozen copy cleared with the site's data. Import that
device's export of the save (an export carries its pack), or import the pack
itself and Continue. "The story pack changed since this save; it plays with
the pack you have now." means the frozen copy was gone and the Library's
newer version is playing.

**A save of a pack says it has a problem.** "This save's story pack …
cannot be played: it has a problem at …": the pack the save carries fails
the game's basic checks (usually a `<` in a string). Fix the pack, and
export a new save from it.

**The converter's button is greyed.** It needs 40 words of your own text and
a key (or the offline demo). The reason is written beside it.

**A field on the JSON tab is not in the forms.** Some fields (the map, ties,
the random tables, the grudge and favour templates, a loose end's
follow-up, an obligation's effect lists) are edited on the JSON tab only.
[Every field](#every-field) marks the tables and templates "not in the
forms".

**The story asks for an 18+ yes every time.** The yes is kept on the device
in Settings. A private window, or clearing the site's data, forgets it.

## Every field

The list below is generated from the format's own definition (`Pack.SCHEMA`
in `index.html`, which the editor's forms and the validator read), so it
cannot fall behind the game: `node tests/guide-doc.cjs` rewrites it, and the
test suite fails when it differs. The meaning of the less obvious fields,
which the old content block carried as comments (they are kept in
`docs/notes/low-water-comments.md`), is given after the list, and an example
of each field is in [Examples, by path](#examples-by-path).

<!-- generated: fields -->

<!-- Written by node tests/guide-doc.cjs from Pack.SCHEMA in index.html; do not edit by hand (tests/run.cjs runs it with --check). -->

Every field of pack format 1: 450 fields in 113 sections and records, in the order the editor shows them. In a path, `[]` is any entry of a list and `{}` any value of a map. Each entry gives the path, what it takes, the editor's label in bold and its help. Every section and record may also carry `notes` (text, up to 600 characters): a remark for you and other authors, shown in the editor and never sent to a prompt. "Not in the forms" marks what the editor shows only on the JSON tab; "read-only" what it shows and never lets you type over.

#### `packFormat`: Pack format

A whole number, always 1. The pack format this file is written in; this game reads format 1. Not in the forms.

#### `meta`: About this story

A section. What the story card, the title screen and New game show. Needs `id`, `title`.

- `meta.title`: one line of text, up to 500 characters. **Title**. The name on the story card and the title screen.
- `meta.id`: an id, in the form `^[a-z][a-z0-9-]{1,40}$`. **Pack id**. Made once from the title. Saves and files name the story by it, so renaming the story never changes it. (read-only)
- `meta.author`: one line of text, up to 500 characters. **Author**. Your name, or the name you write under.
- `meta.version`: one line of text, up to 500 characters, in the form `^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$`. **Version**. Three numbers, like 1.0.0. Save as pack raises the last one each time.
- `meta.rating`: one of `general`, `teen`, `mature`, `adult`. **Rating**. Who the story is for. Adult stories ask the player's age before they start.
- `meta.description`: text, up to 600 characters. **Description**. A few sentences for someone choosing a story.
- `meta.storyText`: text, up to 40,000 characters. **Your story, in your words**. The place, the people, what is going on and how it can end, in any form. It stays in the pack and is never sent to the game's narrator.
- `meta.contentWarnings`: a list, each one line of text, up to 500 characters. **Content warnings**. Anything a player should know before starting, one to a chip.
- `meta.tags`: a list, each one line of text, up to 500 characters. **Tags**. Words to find the story by.
- `meta.language`: one line of text, up to 500 characters. **Language**. The language the story is written in, as a short code such as en.
- `meta.lints`: a list, each one line of text, up to 500 characters. **Lint sets**. Extra checks for this story (the built-in story uses lockett-house). Leave it empty unless you want one.
- `meta.minGameVersion`: one line of text, up to 500 characters. **Needs game version**. The oldest game version this story needs. Leave it empty for any.

#### `setting`: Setting

A section. The kind of world the story is set in.

- `setting.era`: one of `modern`, `historic`, `future`, `fantasy`. **Era**. When the story feels set: modern, historic, future or fantasy.
- `setting.blurb`: one line of text, up to 500 characters. **Blurb**. The era and the place in one sentence. The story card shows it when there is no premise.
- `setting.locale`: a section. **Names and brands**. Words the style check lets through: names of your world, brands that belong in it.
- `setting.locale.nameAllow`: a list, each one line of text, up to 500 characters. **Names allowed**.
- `setting.locale.brandPhrases`: a list, each one line of text, up to 500 characters. **Brand phrases**.
- `setting.locale.givenNames`: a list, each one line of text, up to 500 characters. **Given names**.
- `setting.vocabulary`: a section. **Vocabulary**. The words this world uses for a few things the game talks about.
- `setting.vocabulary.police`: a list, each one line of text, up to 500 characters. **Words for the police**.
- `setting.vocabulary.essentials`: a list, each one line of text, up to 500 characters. **Everyday essentials**.
- `setting.vocabulary.teen`: a list, each one line of text, up to 500 characters. **Teenage words**.
- `setting.vocabulary.lodging`: a list, each one line of text, up to 500 characters. **Words for a place to stay**.
- `setting.phaseLabels`: a section. **Names for the times of day**. Leave a time empty to keep morning, afternoon, evening or night.
- `setting.phaseLabels.morning`: one line of text, up to 500 characters. **Morning**.
- `setting.phaseLabels.afternoon`: one line of text, up to 500 characters. **Afternoon**.
- `setting.phaseLabels.evening`: one line of text, up to 500 characters. **Evening**.
- `setting.phaseLabels.night`: one line of text, up to 500 characters. **Night**.

#### `world`: World

A section. The town: its places, people, factions and what is going on. Needs `name`, `locations`, `npcs`.

- `world.name`: one line of text, up to 500 characters. **Town name**. The town's name, as the narrator says it.
- `world.setting`: text, up to 8,000 characters. **Setting**. The town and its life in a paragraph or two; the narrator reads it every turn.
- `world.currency`: a section. **Money**.
- `world.currency.symbol`: one line of text, up to 500 characters. **Symbol**.
- `world.currency.name`: one line of text, up to 500 characters. **Name**.
- `world.currency.before`: true or false. **Symbol before the number**.
- `world.currency.words`: a list, each one line of text, up to 500 characters. **Words for money**. What people call the money aloud, such as dollars or bucks.
- `world.startLocationIds`: a section. **Where a new arrival starts**.
- `world.startLocationIds.gate`: the id of a place. **By road**.
- `world.startLocationIds.docks`: the id of a place. **By river**.
- `world.romance`: a list of records. **Romance**.
- `world.romance[]`: one record.
- `world.romance[].npcId`: the id of a person. **Person**.
- `world.romance[].sparkRate`: a number, 0.1 to 2. **Spark rate**.
- `world.romance[].romanceRate`: a number, 0.1 to 2. **Romance rate**.
- `world.romance[].opensAt`: a section.
- `world.romance[].opensAt.knows`: a whole number, 0 to 100. **Knows you**.
- `world.romance[].difficulty`: one of `easy`, `normal`, `hard`, `very_hard`. **Difficulty**.
- `world.romance[].open`: true or false. **Open**.
- `world.romance[].faithful`: true or false. **Faithful**.
- `world.policeHead`: the id of a person. **Police head**.
- `world.policeFallback`: the id of a person. **Police fallback**.
- `world.ties`: a list of records. **Ties between people**.
- `world.ties[]`: one record.
- `world.ties[].from`: the id of a person. **From**.
- `world.ties[].to`: the id of a person. **To**.
- `world.ties[].kind`: one line of text, up to 500 characters. **Kind**.
- `world.ties[].w`: a whole number, -100 to 100. **Liking**.
- `world.ties[].t`: a whole number, -100 to 100. **Trust**.
- `world.ties[].hidden`: true or false. **Hidden**.
- `world.ties[].revealedBy`: a section. **Revealed by**.
- `world.ties[].revealedBy.rumours`: a list of ids of rumours. **Rumours**.
- `world.ties[].revealedBy.flags`: a list of flag names. **Flags**.
- `world.ties[].why`: one line of text, up to 500 characters. **Why**.
- `world.secretTies`: a list of records. **Secret ties**.
- `world.secretTies[]`: one record.
- `world.secretTies[].secretOf`: the id of a person. **Whose secret**.
- `world.secretTies[].learnedBy`: the id of a person. **Told to**.
- `world.secretTies[].ties`: a list of records. **Ties**.
- `world.secretTies[].ties[]`: one record.
- `world.secretTies[].ties[].from`: the id of a person. **From**.
- `world.secretTies[].ties[].to`: the id of a person. **To**.
- `world.secretTies[].ties[].w`: a whole number, -100 to 100. **Liking**.
- `world.secretTies[].ties[].t`: a whole number, -100 to 100. **Trust**.
- `world.secretTies[].why`: one line of text, up to 500 characters. **Why**.
- `world.secretTies[].seed`: a section.
- `world.secretTies[].seed.effect`: text, up to 1,000 characters. **Effect**.
- `world.secretTies[].seed.dayOffset`: a list, each a whole number, 1 to 2 entries. **Days later**. One day, or [lowest, highest] days later.
- `world.year`: a whole number. **Year**.
- `world.calendar`: a section. **Calendar**.
- `world.calendar.season`: one of `spring`, `summer`, `autumn`, `winter`. **Season**.
- `world.calendar.startDate`: one line of text, up to 500 characters, in the form `^\d{4}-\d{2}-\d{2}$`. **Day 1**.
- `world.history`: text, up to 8,000 characters. **History**.
- `world.recent`: a list of records. **Recent events**.
- `world.recent[]`: one record.
- `world.recent[].when`: one line of text, up to 500 characters. **When**.
- `world.recent[].what`: text, up to 1,000 characters. **What happened**.
- `world.offstage`: a list of records. **People offstage**.
- `world.offstage[]`: one record.
- `world.offstage[].name`: one line of text, up to 500 characters. **Name**.
- `world.offstage[].about`: one line of text, up to 500 characters. **About**.
- `world.map`: a section. **Map**.
- `world.map.width`: a number. **Width**.
- `world.map.height`: a number. **Height**.
- `world.map.river`: one line of text, up to 4,000 characters. **River path**.
- `world.map.riverWidth`: a number. **River width**.
- `world.map.riverLabel`: a section. **River label**.
- `world.map.riverLabel.text`: one line of text, up to 500 characters. **Text**.
- `world.map.riverLabel.x`: a number. **x**.
- `world.map.riverLabel.y`: a number. **y**.
- `world.map.riverLabel.rotate`: a number. **Rotate**.
- `world.map.bridges`: a list, each one line of text, up to 4,000 characters. **Bridge paths**.
- `world.map.roads`: a list, each one line of text, up to 4,000 characters. **Road paths**.
- `world.map.labels`: a list of records. **Map labels**.
- `world.map.labels[]`: one record.
- `world.map.labels[].text`: one line of text, up to 500 characters. **Text**.
- `world.map.labels[].x`: a number. **x**.
- `world.map.labels[].y`: a number. **y**.
- `world.map.labels[].anchor`: one of `start`, `middle`, `end`. **Anchor**.
- `world.locations`: a list of records. **Places**.
- `world.locations[]`: one record.
- `world.locations[].id`: an id starting `loc_`. **Id**.
- `world.locations[].name`: one line of text, up to 500 characters. **Name**.
- `world.locations[].type`: one line of text, up to 500 characters. **Type**.
- `world.locations[].typeLabel`: one line of text, up to 500 characters. **Type label**. The word shown for the place when its type would misname it.
- `world.locations[].map`: a section. **On the map**.
- `world.locations[].map.x`: a number. **x**.
- `world.locations[].map.y`: a number. **y**.
- `world.locations[].map.label`: one line of text, up to 500 characters. **Map label**.
- `world.locations[].map.anchor`: one of `n`, `s`, `e`, `w`. **Label side**.
- `world.locations[].description`: text, up to 1,000 characters. **Description**.
- `world.locations[].details`: text, up to 1,000 characters. **Details**.
- `world.locations[].hours`: one line of text, up to 500 characters. **Hours**.
- `world.locations[].history`: text, up to 8,000 characters. **History**.
- `world.locations[].aka`: a list, each one line of text, up to 500 characters. **Also called**.
- `world.locations[].exits`: a list of ids of places. **Exits**.
- `world.locations[].npcIdsBySchedule`: a section. **Who is here when**.
- `world.locations[].npcIdsBySchedule.morning`: a list of ids of people. **Morning**.
- `world.locations[].npcIdsBySchedule.afternoon`: a list of ids of people. **Afternoon**.
- `world.locations[].npcIdsBySchedule.evening`: a list of ids of people. **Evening**.
- `world.locations[].npcIdsBySchedule.night`: a list of ids of people. **Night**.
- `world.locations[].discovered`: true or false. **Known at the start**.
- `world.locations[].closed`: true or false. **Closed**.
- `world.locations[].closedOn`: a list, each one of `Sunday`, `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`. **Closed on**.
- `world.locations[].away`: true or false. **Out of town**.
- `world.locations[].distance`: one line of text, up to 500 characters. **How far**.
- `world.npcs`: a list of records. **People**.
- `world.npcs[]`: one record.
- `world.npcs[].id`: an id starting `npc_`. **Id**.
- `world.npcs[].name`: one line of text, up to 500 characters. **Name**.
- `world.npcs[].pronouns`: one of `he`, `she`, `they`. **Pronouns**.
- `world.npcs[].age`: a whole number, 0 to 120. **Age**.
- `world.npcs[].presence`: one of `here`, `away`, `dead`. **Presence**.
- `world.npcs[].role`: one line of text, up to 500 characters. **Role**.
- `world.npcs[].factionId`: the id of a faction, or null. **Faction**.
- `world.npcs[].tags`: a list, each one line of text, up to 500 characters. **Tags**.
- `world.npcs[].look`: one line of text, up to 500 characters. **Look**.
- `world.npcs[].voice`: one line of text, up to 500 characters. **Voice**.
- `world.npcs[].personality`: a list, each one line of text, up to 500 characters. **Traits**.
- `world.npcs[].goal`: one line of text, up to 500 characters. **Goal**.
- `world.npcs[].secret`: one line of text, up to 500 characters. **Secret**.
- `world.npcs[].secretWeight`: a whole number, 1 to 3. **Secret weight**.
- `world.npcs[].leverageKeys`: a list, each one line of text, up to 500 characters. **Leverage words**.
- `world.npcs[].mattersTo`: a list of ids of people. **Matters to**.
- `world.npcs[].history`: text, up to 8,000 characters. **History**.
- `world.npcs[].attitude`: a whole number, -100 to 100. **Attitude**.
- `world.npcs[].relations`: a list of records. **Relations**.
- `world.npcs[].relations[]`: one record.
- `world.npcs[].relations[].npcId`: the id of a person. **Person**.
- `world.npcs[].relations[].relation`: one line of text, up to 500 characters. **Relation**.
- `world.npcs[].home`: the id of a place, or null. **Home**.
- `world.npcs[].memories`: a list of records. **Memories**.
- `world.npcs[].memories[]`: one record.
- `world.npcs[].memories[].turn`: a whole number. **Turn**.
- `world.npcs[].memories[].text`: one line of text, up to 500 characters. **Memory**.
- `world.npcs[].memories[].weight`: a whole number, 1 to 3. **Weight**.
- `world.npcs[].memories[].event`: one line of text, up to 500 characters. **Event**.
- `world.npcs[].memories[].act`: one line of text, up to 500 characters. **Act**.
- `world.npcs[].alive`: true or false. **Alive**.
- `world.npcs[].knownToPlayer`: true or false. **Known to the player**.
- `world.npcs[].status`: one of `free`, `arrested`, `gone`, `dead`. **Status**.
- `world.npcs[].awayOn`: a section. **Away**.
- `world.npcs[].awayOn.days`: a list, each one of `Sunday`, `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `Saturday`. **Away on**.
- `world.npcs[].awayOn.phases`: a list, each one of `morning`, `afternoon`, `evening`, `night`. **Away in**.
- `world.npcs[].awayOn.where`: one line of text, up to 500 characters. **Where**.
- `world.npcs[].start`: a section. **How they feel about you at the start**.
- `world.npcs[].start.liking`: a whole number, -100 to 100. **Liking**.
- `world.npcs[].start.trust`: a whole number, -100 to 100. **Trust**.
- `world.npcs[].start.fear`: a whole number, 0 to 100. **Fear**.
- `world.npcs[].start.knows`: a whole number, 0 to 100. **Knows you**.
- `world.npcs[].protector`: a free value. **Protector**. Whom they go to: a person id, a list of them, "nobody", or { npcId, hidden: true }.
- `world.npcs[].whenTold`: a section. **When told**.
- `world.npcs[].whenTold.memory`: one line of text, up to 500 characters. **Memory**.
- `world.npcs[].whenTold.crime`: true or false. **A crime**.
- `world.npcs[].whenTold.inquiry`: one line of text, up to 500 characters. **Inquiry**.
- `world.npcs[].whenTold.news`: one line of text, up to 500 characters. **News**.
- `world.npcs[].canRaise`: a whole number, 0 to 1000. **Can raise**.
- `world.npcs[].mercenary`: true or false. **Mercenary**.
- `world.npcs[].axes`: a section. **Temper**.
- `world.npcs[].axes.p`: a whole number, -2 to 2. **Pride**.
- `world.npcs[].axes.g`: a whole number, -2 to 2. **Guardedness**.
- `world.npcs[].axes.n`: a whole number, -2 to 2. **Nerve**.
- `world.npcs[].axes.r`: a whole number, -2 to 2. **Grudge-holding**.
- `world.npcs[].died`: one line of text, up to 500 characters. **Died**.
- `world.npcs[].buried`: one line of text, up to 500 characters. **Buried**.
- `world.npcs[].where`: one line of text, up to 500 characters. **Where they are**.
- `world.npcs[].reach`: one line of text, up to 500 characters. **How to reach them**.
- `world.factions`: a list of records. **Factions**.
- `world.factions[]`: one record.
- `world.factions[].id`: an id starting `fac_`. **Id**.
- `world.factions[].name`: one line of text, up to 500 characters. **Name**.
- `world.factions[].goal`: one line of text, up to 500 characters. **Goal**.
- `world.factions[].methods`: one line of text, up to 500 characters. **Methods**.
- `world.factions[].odds`: a whole number, 1 to 6. **Odds**.
- `world.factions[].clocks`: a list of records. **Clocks**.
- `world.factions[].clocks[]`: one record.
- `world.factions[].clocks[].label`: one line of text, up to 500 characters. **Label**.
- `world.factions[].clocks[].segments`: a whole number, 4 to 10. **Segments**.
- `world.factions[].clocks[].filled`: a whole number, at least 0. **Filled**.
- `world.factions[].clocks[].odds`: a whole number, 1 to 6. **Odds**.
- `world.factions[].clocks[].onComplete`: a section. **When it fills**.
- `world.factions[].clocks[].onComplete.text`: text, up to 2,000 characters. **Text**.
- `world.factions[].clocks[].onComplete.effects`: a list, each a free value. **Effects**.
- `world.factions[].clocks[].onComplete.requires`: a free value. **Condition**. A when or requires condition (flagsSet, flagsUnset, npcFree, npcAt, clockAtLeast, attitudeAtLeast, attitudeBelow, obligationStatus, obligationOpen, relAtLeast, relBelow, threadOpen, playerAt); PackRules (M1-C2) checks it field by field.
- `world.factions[].clocks[].onComplete.alt`: a section. **Otherwise**.
- `world.factions[].clocks[].onComplete.alt.text`: text, up to 2,000 characters. **Text instead**.
- `world.factions[].clocks[].onComplete.alt.effects`: a list, each a free value. **Effects**.
- `world.factions[].activeClock`: a whole number, at least -1. **Active clock**.
- `world.factions[].relations`: values keyed by a name, each a whole number, -100 to 100, keys in the form `^fac_[a-z0-9_]+$`. **Relations with other factions**.
- `world.threads`: a list of records. **Threads**.
- `world.threads[]`: one record.
- `world.threads[].id`: an id starting `thr_`. **Id**.
- `world.threads[].title`: one line of text, up to 500 characters. **Title**.
- `world.threads[].summary`: text, up to 1,000 characters. **Summary**.
- `world.threads[].status`: one of `open`, `resolved`, `failed`. **Status**.
- `world.threads[].knownToPlayer`: true or false. **Known to the player**.
- `world.threads[].linkedIds`: a list of ids of any kind. **Linked ids**. Ids of any kind the thread is about.
- `world.threads[].reward`: one of `might`, `wits`, `charm`, `stealth`. **Reward**. The stat its first resolution raises.
- `world.seeds`: a list of records. **Seeds**.
- `world.seeds[]`: one record.
- `world.seeds[].id`: an id starting `seed_`. **Id**.
- `world.seeds[].cause`: text, up to 1,000 characters. **Cause**.
- `world.seeds[].effect`: text, up to 1,000 characters. **Effect**.
- `world.seeds[].trigger`: a section. **Trigger**.
- `world.seeds[].trigger.type`: one of `day`, `location`, `npc`, `clock`. **Trigger**.
- `world.seeds[].trigger.value`: a free value. **Value**. day: a whole day; location: a place id or a list of them; npc: a person id or a list; clock: "fac_x:3".
- `world.seeds[].notBeforeDay`: a whole number, at least 1. **Not before day**.
- `world.seeds[].effects`: a list, each a free value. **Effects**.
- `world.seeds[].requires`: a free value. **Condition**. A when or requires condition (flagsSet, flagsUnset, npcFree, npcAt, clockAtLeast, attitudeAtLeast, attitudeBelow, obligationStatus, obligationOpen, relAtLeast, relBelow, threadOpen, playerAt); PackRules (M1-C2) checks it field by field.
- `world.seeds[].alt`: a section. **Otherwise**.
- `world.seeds[].alt.text`: text, up to 2,000 characters. **Text instead**.
- `world.seeds[].alt.effects`: a list, each a free value. **Effects**.
- `world.seeds[].fired`: true or false. **Fired**.
- `world.seeds[].hidden`: true or false. **Hidden**.
- `world.seeds[].danger`: true or false. **Someone in danger**.
- `world.rumours`: a list of records. **Rumours**.
- `world.rumours[]`: one record.
- `world.rumours[].id`: an id starting `rum_`. **Id**.
- `world.rumours[].text`: text, up to 1,000 characters. **Text**.
- `world.rumours[].true`: true or false. **True**.
- `world.rumours[].sourceNpcId`: the id of a person. **Source**.
- `world.rumours[].heard`: true or false. **Heard**.
- `world.rumours[].tellerIds`: a list of ids of people. **Who can tell it**.
- `world.rumours[].threadId`: the id of a thread. **Thread it reveals**.
- `world.rumours[].factionId`: the id of a faction. **Whose people know it**.
- `world.rumours[].leverageOver`: the id of a person. **Leverage over**.
- `world.events`: a list of records. **Events**.
- `world.events[]`: one record.
- `world.events[].id`: an id starting `evt_`. **Id**.
- `world.events[].day`: a whole number, at least 1. **Day**.
- `world.events[].phase`: one of `morning`, `afternoon`, `evening`, `night`. **Phase**.
- `world.events[].locationId`: the id of a place. **Place**.
- `world.events[].title`: one line of text, up to 500 characters. **Title**.
- `world.events[].attendees`: a list of ids of people. **Attendees**.
- `world.events[].branches`: a list of records. **Branches**.
- `world.events[].branches[]`: one record.
- `world.events[].branches[].when`: a free value. **Condition**. A when or requires condition (flagsSet, flagsUnset, npcFree, npcAt, clockAtLeast, attitudeAtLeast, attitudeBelow, obligationStatus, obligationOpen, relAtLeast, relBelow, threadOpen, playerAt); PackRules (M1-C2) checks it field by field.
- `world.events[].branches[].text`: text, up to 2,000 characters. **Text**.
- `world.events[].branches[].effects`: a list, each a free value. **Effects**.
- `world.events[].default`: a section. **Otherwise**.
- `world.events[].default.text`: text, up to 2,000 characters. **Text**.
- `world.events[].default.effects`: a list, each a free value. **Effects**.
- `world.epilogue`: a section. **Epilogue**.
- `world.epilogue.onDay`: a whole number, at least 1. **On day**.
- `world.epilogue.orFlagsSet`: a list of flag names. **Or when set**.
- `world.epilogue.branches`: a list of records. **Branches**.
- `world.epilogue.branches[]`: one record.
- `world.epilogue.branches[].when`: a free value. **Condition**. A when or requires condition (flagsSet, flagsUnset, npcFree, npcAt, clockAtLeast, attitudeAtLeast, attitudeBelow, obligationStatus, obligationOpen, relAtLeast, relBelow, threadOpen, playerAt); PackRules (M1-C2) checks it field by field.
- `world.epilogue.branches[].text`: text, up to 2,000 characters. **Text**.
- `world.epilogue.branches[].effects`: a list, each a free value. **Effects**.
- `world.epilogue.default`: a section. **Otherwise**.
- `world.epilogue.default.text`: text, up to 2,000 characters. **Text**.
- `world.epilogue.default.effects`: a list, each a free value. **Effects**.
- `world.tables`: a section. **Tables**. (not in the forms)
- `world.tables.npc`: a section. **People**. (not in the forms)
- `world.tables.npc.firstNames`: a list, each one line of text, up to 500 characters. **First names**. (not in the forms)
- `world.tables.npc.occupations`: a list, each one line of text, up to 500 characters. **Occupations**. (not in the forms)
- `world.tables.location`: a section. **Places**. (not in the forms)
- `world.tables.location.types`: a list, each one line of text, up to 500 characters. **Types**. (not in the forms)
- `world.tables.location.details`: a list, each one line of text, up to 500 characters. **Details**. (not in the forms)
- `world.tables.location.problems`: a list, each one line of text, up to 500 characters. **Problems**. (not in the forms)
- `world.tables.items`: a section. **Goods**. (not in the forms)
- `world.tables.items.goods`: a list of records. **Goods**. (not in the forms)
- `world.tables.items.goods[]`: one record. (not in the forms)
- `world.tables.items.goods[].name`: one line of text, up to 500 characters. **Name**. (not in the forms)
- `world.tables.items.goods[].price`: a whole number, at least 0. **Price**. (not in the forms)
- `world.tables.items.goods[].kind`: one of `good`, `service`, `drink`, `food`. **Kind**. (not in the forms)
- `world.tables.items.goods[].synonyms`: a list, each one line of text, up to 500 characters. **Also called**. (not in the forms)
- `world.tables.items.trinkets`: a list, each one line of text, up to 500 characters. **Trinkets**. (not in the forms)
- `world.tables.complications`: a list of records. **Complications**. (not in the forms)
- `world.tables.complications[]`: one record. (not in the forms)
- `world.tables.complications[].text`: one line of text, up to 500 characters. **Text**. (not in the forms)
- `world.tables.complications[].tiers`: a list, each one of `partial`, `failure`, `both`. **On**. (not in the forms)
- `world.tables.complications[].kinds`: a list, each one of `social`, `physical`, `stealth`, `any`. **For**. (not in the forms)
- `world.tables.complications[].needsPerson`: true or false. **Needs someone present**. (not in the forms)
- `world.tables.complications[].notDay1`: true or false. **Not on day 1**. (not in the forms)
- `world.tables.complications[].effects`: a list, each a free value. **Effects**. (not in the forms)
- `world.tables.weather`: a section. **Weather**. (not in the forms)
- `world.tables.weather.spring`: a list, each one line of text, up to 500 characters. **Spring**. (not in the forms)
- `world.tables.weather.summer`: a list, each one line of text, up to 500 characters. **Summer**. (not in the forms)
- `world.tables.weather.autumn`: a list, each one line of text, up to 500 characters. **Autumn**. (not in the forms)
- `world.tables.weather.winter`: a list, each one line of text, up to 500 characters. **Winter**. (not in the forms)
- `world.grudgeTemplates`: a list of records. **Grudges**. (not in the forms)
- `world.grudgeTemplates[]`: one record. (not in the forms)
- `world.grudgeTemplates[].effect`: text, up to 1,000 characters. **Effect**. (not in the forms)
- `world.grudgeTemplates[].kind`: one line of text, up to 500 characters. **Kind**. (not in the forms)
- `world.grudgeTemplates[].about`: a list, each one line of text, up to 500 characters. **About**. (not in the forms)
- `world.grudgeTemplates[].dayOffset`: a list, each a whole number, 1 to 2 entries. **Days later**. One day, or [lowest, highest] days later. (not in the forms)
- `world.grudgeTemplates[].effects`: a list, each a free value. **Effects**. (not in the forms)
- `world.grudgeTemplates[].public`: true or false. **Town news**. (not in the forms)
- `world.grudgeTemplates[].forTags`: a list, each one line of text, up to 500 characters. **For tags**. (not in the forms)
- `world.grudgeTemplates[].notForTags`: a list, each one line of text, up to 500 characters. **Not for tags**. (not in the forms)
- `world.grudgeTemplates[].to`: one of `police`, `family`. **Reported to**. (not in the forms)
- `world.grudgeTemplates[].needs`: a section. **How they feel about you at the start**. (not in the forms)
- `world.grudgeTemplates[].needs.liking`: a whole number, -100 to 100. **Liking**. (not in the forms)
- `world.grudgeTemplates[].needs.trust`: a whole number, -100 to 100. **Trust**. (not in the forms)
- `world.grudgeTemplates[].needs.fear`: a whole number, 0 to 100. **Fear**. (not in the forms)
- `world.grudgeTemplates[].needs.knows`: a whole number, 0 to 100. **Knows you**. (not in the forms)
- `world.favourTemplates`: a list of records. **Favours**. (not in the forms)
- `world.favourTemplates[]`: one record. (not in the forms)
- `world.favourTemplates[].effect`: text, up to 1,000 characters. **Effect**. (not in the forms)
- `world.favourTemplates[].kind`: one line of text, up to 500 characters. **Kind**. (not in the forms)
- `world.favourTemplates[].about`: a list, each one line of text, up to 500 characters. **About**. (not in the forms)
- `world.favourTemplates[].dayOffset`: a list, each a whole number, 1 to 2 entries. **Days later**. One day, or [lowest, highest] days later. (not in the forms)
- `world.favourTemplates[].effects`: a list, each a free value. **Effects**. (not in the forms)
- `world.favourTemplates[].public`: true or false. **Town news**. (not in the forms)
- `world.favourTemplates[].forTags`: a list, each one line of text, up to 500 characters. **For tags**. (not in the forms)
- `world.favourTemplates[].notForTags`: a list, each one line of text, up to 500 characters. **Not for tags**. (not in the forms)
- `world.favourTemplates[].to`: one of `police`, `family`. **Reported to**. (not in the forms)
- `world.favourTemplates[].needs`: a section. **How they feel about you at the start**. (not in the forms)
- `world.favourTemplates[].needs.liking`: a whole number, -100 to 100. **Liking**. (not in the forms)
- `world.favourTemplates[].needs.trust`: a whole number, -100 to 100. **Trust**. (not in the forms)
- `world.favourTemplates[].needs.fear`: a whole number, 0 to 100. **Fear**. (not in the forms)
- `world.favourTemplates[].needs.knows`: a whole number, 0 to 100. **Knows you**. (not in the forms)
- `world.law`: a section. **The law**.
- `world.law.factionId`: the id of a faction. **Police faction**.
- `world.law.headNpcId`: the id of a person. **Head**.
- `world.law.fallbackNpcId`: the id of a person. **Fallback**.
- `world.law.arrestPlaceId`: the id of a place. **Where the arrested are held**.
- `world.law.newsTemplate`: one line of text, up to 500 characters. **News line**. {npc} is the person asked about.
- `world.gates`: a section. **Gates**.
- `world.gates.council`: records keyed by a name you choose. **The council**.
- `world.gates.council{}`: one record. **How they feel about you at the start**.
- `world.gates.council{}.liking`: a whole number, -100 to 100. **Liking**.
- `world.gates.council{}.trust`: a whole number, -100 to 100. **Trust**.
- `world.gates.council{}.fear`: a whole number, 0 to 100. **Fear**.
- `world.gates.council{}.knows`: a whole number, 0 to 100. **Knows you**.
- `world.gates.epilogue`: records keyed by a name you choose. **The epilogue**.
- `world.gates.epilogue{}`: one record. **How they feel about you at the start**.
- `world.gates.epilogue{}.liking`: a whole number, -100 to 100. **Liking**.
- `world.gates.epilogue{}.trust`: a whole number, -100 to 100. **Trust**.
- `world.gates.epilogue{}.fear`: a whole number, 0 to 100. **Fear**.
- `world.gates.epilogue{}.knows`: a whole number, 0 to 100. **Knows you**.

#### `player`: Player

A section. Who the player can be, and how they arrive.

- `player.backgrounds`: a list of records. **Backgrounds**.
- `player.backgrounds[]`: one record.
- `player.backgrounds[].id`: an id starting `bg_`. **Id**.
- `player.backgrounds[].name`: one line of text, up to 500 characters. **Name**.
- `player.backgrounds[].blurb`: one line of text, up to 500 characters. **Blurb**.
- `player.backgrounds[].age`: a whole number, 16 to 90. **Age**.
- `player.backgrounds[].stats`: a section. **Stats**.
- `player.backgrounds[].stats.might`: a whole number, -1 to 3. **Might**.
- `player.backgrounds[].stats.wits`: a whole number, -1 to 3. **Wits**.
- `player.backgrounds[].stats.charm`: a whole number, -1 to 3. **Charm**.
- `player.backgrounds[].stats.stealth`: a whole number, -1 to 3. **Stealth**.
- `player.backgrounds[].gold`: a whole number, at least 0. **Money**.
- `player.backgrounds[].items`: a list of records. **Things they carry**.
- `player.backgrounds[].items[]`: one record.
- `player.backgrounds[].items[].id`: an id starting `item_`. **Id**.
- `player.backgrounds[].items[].name`: one line of text, up to 500 characters. **Name**.
- `player.backgrounds[].items[].qty`: a whole number, at least 1. **How many**.
- `player.backgrounds[].items[].notes`: one line of text, up to 500 characters. **Notes**.
- `player.backgrounds[].arrival`: one of `gate`, `docks`. **Arrives**.
- `player.backgrounds[].hook`: a section. **Hook**.
- `player.backgrounds[].hook.npcId`: the id of a person. **Person**.
- `player.backgrounds[].hook.text`: one line of text, up to 500 characters. **Text**.
- `player.backgrounds[].hook.dayOffset`: a whole number, at least 0. **Days later**.
- `player.backgrounds[].hook.trigger`: a section. **Trigger**.
- `player.backgrounds[].hook.trigger.type`: one of `day`, `location`, `npc`, `clock`. **Trigger**.
- `player.backgrounds[].hook.trigger.value`: a free value. **Value**. day: a whole day; location: a place id or a list of them; npc: a person id or a list; clock: "fac_x:3".
- `player.flaws`: a list, each one line of text, up to 500 characters. **Flaws**.
- `player.goalPresets`: a list, each one line of text, up to 140 characters. **Goals**.
- `player.looseEnds`: records keyed by a name you choose, keys in the form `^[a-z][a-z0-9_]*$`. **Loose ends**.
- `player.looseEnds{}`: one record.
- `player.looseEnds{}.label`: one line of text, up to 500 characters. **Label**.
- `player.looseEnds{}.options`: a list, each one line of text, up to 500 characters. **Options**.
- `player.looseEnds{}.link`: a section. **Link**.
- `player.looseEnds{}.link.tag`: one line of text, up to 500 characters. **Tag**.
- `player.looseEnds{}.link.optionTags`: a list, each one line of text, up to 500 characters. **Tags**.
- `player.looseEnds{}.seed`: a section. **Seed**.
- `player.looseEnds{}.seed.dayOffset`: a list, each a whole number, 1 to 2 entries. **Days later**. One day, or [lowest, highest] days later.
- `player.looseEnds{}.seed.effect`: text, up to 1,000 characters. **Effect**.
- `player.looseEnds{}.seed.trigger`: one line of text, up to 500 characters. **Trigger**.
- `player.looseEnds{}.obligation`: a section. **Obligation**.
- `player.looseEnds{}.obligation.kind`: one of `debt`, `blackmail`, `promise`, `errand`, `lodging`. **Kind**.
- `player.looseEnds{}.obligation.amount`: a whole number, at least 0. **Amount**.
- `player.looseEnds{}.obligation.dueOffset`: a whole number, at least 0. **Due, days after it starts**.
- `player.looseEnds{}.obligation.text`: one line of text, up to 500 characters. **What is owed**.
- `player.looseEnds{}.obligation.missText`: one line of text, up to 500 characters. **When it is missed**.
- `player.looseEnds{}.obligation.itemName`: one line of text, up to 500 characters. **The thing owed**.
- `player.looseEnds{}.obligation.owedTo`: one line of text, up to 500 characters. **Owed to**.
- `player.looseEnds{}.obligation.onStart`: a list, each a free value. **Effects**.
- `player.looseEnds{}.obligation.onMiss`: a list, each a free value. **Effects**.
- `player.looseEnds{}.obligation.onMet`: a list, each a free value. **Effects**.
- `player.looseEnds{}.obligations`: a list of records. **Obligations**.
- `player.looseEnds{}.obligations[]`: one record. **Obligation**.
- `player.looseEnds{}.obligations[].kind`: one of `debt`, `blackmail`, `promise`, `errand`, `lodging`. **Kind**.
- `player.looseEnds{}.obligations[].amount`: a whole number, at least 0. **Amount**.
- `player.looseEnds{}.obligations[].dueOffset`: a whole number, at least 0. **Due, days after it starts**.
- `player.looseEnds{}.obligations[].text`: one line of text, up to 500 characters. **What is owed**.
- `player.looseEnds{}.obligations[].missText`: one line of text, up to 500 characters. **When it is missed**.
- `player.looseEnds{}.obligations[].itemName`: one line of text, up to 500 characters. **The thing owed**.
- `player.looseEnds{}.obligations[].owedTo`: one line of text, up to 500 characters. **Owed to**.
- `player.looseEnds{}.obligations[].onStart`: a list, each a free value. **Effects**.
- `player.looseEnds{}.obligations[].onMiss`: a list, each a free value. **Effects**.
- `player.looseEnds{}.obligations[].onMet`: a list, each a free value. **Effects**.
- `player.looseEnds{}.followUp`: a section. **Follow-up**.
- `player.looseEnds{}.followUp.dayOffset`: a list, each a whole number, 1 to 2 entries. **Days later**. One day, or [lowest, highest] days later.
- `player.looseEnds{}.followUp.effect`: text, up to 1,000 characters. **Effect**.
- `player.looseEnds{}.followUp.effects`: a list, each a free value. **Effects**.
- `player.looseEnds{}.followUp.alt`: a section. **Otherwise**.
- `player.looseEnds{}.followUp.alt.text`: text, up to 2,000 characters. **Text instead**.
- `player.looseEnds{}.followUp.alt.effects`: a list, each a free value. **Effects**.
- `player.stats`: a section. **Stats**. The four stats stay; a story renames and describes them.
- `player.stats.might`: a section.
- `player.stats.might.label`: one line of text, up to 500 characters. **Label**.
- `player.stats.might.blurb`: one line of text, up to 500 characters. **Blurb**.
- `player.stats.wits`: a section.
- `player.stats.wits.label`: one line of text, up to 500 characters. **Label**.
- `player.stats.wits.blurb`: one line of text, up to 500 characters. **Blurb**.
- `player.stats.charm`: a section.
- `player.stats.charm.label`: one line of text, up to 500 characters. **Label**.
- `player.stats.charm.blurb`: one line of text, up to 500 characters. **Blurb**.
- `player.stats.stealth`: a section.
- `player.stats.stealth.label`: one line of text, up to 500 characters. **Label**.
- `player.stats.stealth.blurb`: one line of text, up to 500 characters. **Blurb**.
- `player.start`: a section. **At the start**.
- `player.start.hp`: a whole number, at least 1. **Health**.
- `player.start.storyPoints`: a whole number, 0 to 3. **Story points**.
- `player.ageRange`: a list, each a whole number, exactly 2. **Age range**. The youngest and the oldest a player may be.
- `player.arrivals`: a section. **Arrivals**.
- `player.arrivals.gate`: a section. **By road**.
- `player.arrivals.gate.label`: one line of text, up to 500 characters. **Label**.
- `player.arrivals.gate.opening`: text, up to 1,200 characters. **Opening**.
- `player.arrivals.gate.summary`: one line of text, up to 500 characters. **Summary**.
- `player.arrivals.docks`: a section. **By road**.
- `player.arrivals.docks.label`: one line of text, up to 500 characters. **Label**.
- `player.arrivals.docks.opening`: text, up to 1,200 characters. **Opening**.
- `player.arrivals.docks.summary`: one line of text, up to 500 characters. **Summary**.
- `player.creation`: a section. **Character creation**.
- `player.creation.steps`: a list of records. **Steps**.
- `player.creation.steps[]`: one record.
- `player.creation.steps[].id`: one line of text, up to 500 characters. **Step**.
- `player.creation.steps[].title`: one line of text, up to 500 characters. **Title**.
- `player.creation.steps[].sub`: one line of text, up to 500 characters. **Subtitle**.

#### `opening`: Opening

A section. How the story begins.

- `opening.premise`: text, up to 1,200 characters. **Premise**. One or two sentences shown at New game and on the story card.
- `opening.text`: text, up to 1,200 characters. **Opening text**. The first scene, before the player types anything.
- `opening.firstTurn`: text, up to 1,200 characters. **First turn**.

#### `narration`: Narration

A section. How the narrator writes.

- `narration.preset`: one of `casual`, `literary`, `custom`. **Style**.
- `narration.customGuide`: text, up to 6,000 characters. **Your style guide**.
- `narration.banned`: a list, each one line of text, up to 500 characters. **Banned phrases**.
- `narration.alsoAvoid`: a list, each one line of text, up to 500 characters. **Also avoid**.
- `narration.softChecks`: a section. **Style checks**. The checks a story may switch off. The name check always runs.
- `narration.softChecks.simile`: true or false. **Similes**.
- `narration.softChecks.asYou`: true or false. **"As you"**.
- `narration.softChecks.inventedPast`: true or false. **Invented past**.
- `narration.softChecks.moneyLeak`: true or false. **Money leak**.
- `narration.softChecks.repeat`: true or false. **Repeats**.
- `narration.examples`: a list of records. **Example turns**.
- `narration.examples[]`: one record.
- `narration.examples[].input`: one line of text, up to 500 characters. **Player types**.
- `narration.examples[].context`: text, up to 2,000 characters. **Packet**.
- `narration.examples[].narration`: text, up to 6,000 characters. **Narration**.
- `narration.goodTurn`: text, up to 1,500 characters. **What a good turn does**.
- `narration.lengths`: a section. **Lengths in words**.
- `narration.lengths.normal`: a whole number. **Normal**.
- `narration.lengths.zoom`: a whole number. **Zoom**.
- `narration.lengths.intimate`: a whole number. **Intimate**.
- `narration.lengths.intimateMin`: a whole number. **Intimate, at least**.
- `narration.lengths.hardOver`: a whole number. **Hard over**.
- `narration.pointOfView`: one of `second-present`, `second-past`, `first-present`, `first-past`, `third-present`, `third-past`. **Point of view**.

#### `directions`: Directions

A section. What the narrator is told for particular moments.

- `directions.intimate`: text, up to 1,500 characters. **Intimate scenes**.
- `directions.combat`: text, up to 1,500 characters. **Combat**.
- `directions.defeat`: text, up to 1,500 characters. **Defeat**.
- `directions.death`: text, up to 1,500 characters. **Death**.
- `directions.arrival`: text, up to 1,500 characters. **Arrival**.
- `directions.timeSkip`: text, up to 1,500 characters. **Time skip**.
- `directions.gamble`: text, up to 1,500 characters. **Gambling**.
- `directions.epilogue`: text, up to 1,500 characters. **Epilogue**.
- `directions.firstTurn`: text, up to 1,500 characters. **First turn**.
- `directions.refusedByNpc`: text, up to 1,500 characters. **Refused**.
- `directions.rollFailure`: text, up to 1,500 characters. **A failed roll**.
- `directions.rollCritical`: text, up to 1,500 characters. **A critical roll**.

#### `rules`: Rules

A section. The dice, health, time, money and the law.

- `rules.rolls`: a section. **When to roll**.
- `rules.rolls.always`: a list, each one line of text, up to 500 characters. **Always roll**.
- `rules.rolls.never`: a list, each one line of text, up to 500 characters. **Never roll**.
- `rules.rolls.alwaysPhrases`: a list, each one line of text, up to 500 characters. **Always roll on**.
- `rules.rolls.neverPhrases`: a list, each one line of text, up to 500 characters. **Never roll on**.
- `rules.dcs`: a section. **Difficulty numbers**.
- `rules.dcs.easy`: a whole number. **Easy**.
- `rules.dcs.normal`: a whole number. **Normal**.
- `rules.dcs.hard`: a whole number. **Hard**.
- `rules.dcs.very_hard`: a whole number. **Very hard**.
- `rules.floors`: a section. **Floors**.
- `rules.floors.ask`: one of `easy`, `normal`, `hard`, `very_hard`. **Asking**.
- `rules.floors.lie`: a list, each a free value. **Lying**.
- `rules.floors.intimidateHard`: one of `easy`, `normal`, `hard`, `very_hard`. **Intimidating the hard**.
- `rules.hp`: a section. **Health**.
- `rules.hp.start`: a whole number. **Start**.
- `rules.hp.max`: a whole number. **Most**.
- `rules.hp.damage`: a section. **Damage**.
- `rules.hp.damage.failure`: a list, each a whole number. **On a failure**. The least and the most.
- `rules.hp.damage.partial`: a whole number. **Partial**.
- `rules.hp.damage.critical_failure`: a whole number. **Critical failure**.
- `rules.crits`: true or false. **Criticals**.
- `rules.permadeath`: true or false. **Permadeath**. When the player dies the game ends, with no way back.
- `rules.showRolls`: true or false. **Show rolls**.
- `rules.storyPoints`: a section. **Story points**.
- `rules.storyPoints.start`: a whole number. **Start**.
- `rules.storyPoints.max`: a whole number. **Most**.
- `rules.storyPoints.factAllowed`: true or false. **/fact allowed**.
- `rules.time`: a section. **Time**.
- `rules.time.shortsPerPhase`: a whole number. **Shorts a phase**.
- `rules.time.costs`: values keyed by a name, each one of `instant`, `short`, `long`, `rest`. **Costs**.
- `rules.prices`: a section. **Prices**.
- `rules.prices.factor`: a number. **Price factor**.
- `rules.law`: a section. **The law**.
- `rules.law.fine`: a whole number. **Fine**.
- `rules.law.roughSleeping`: true or false. **Rough sleeping**.
- `rules.law.roughNights`: a whole number. **Nights**.
- `rules.law.roughFine`: a whole number. **Fine**.
- `rules.law.roughForgiven`: a whole number. **Forgiven after**.
- `rules.cheats`: a section. **Cheats**.
- `rules.cheats.allowed`: true or false. **Cheats allowed**.
- `rules.cheats.debugView`: true or false. **Debug view**.
- `rules.undo`: true or false. **/undo allowed**.
- `rules.romance`: a section. **Romance**.
- `rules.romance.enabled`: true or false. **Romance**.
- `rules.romance.gates`: a section. **Gates**.
- `rules.romance.gates.spark`: a whole number. **Spark**.
- `rules.romance.gates.romance`: a whole number. **Romance**.
- `rules.romance.gates.trust`: a whole number. **Trust**.
- `rules.romance.gates.knows`: a whole number. **Knows you**.
- `rules.romance.defaults`: a section. **Defaults**.
- `rules.romance.defaults.sparkRate`: a number. **Spark rate**.
- `rules.romance.defaults.opensAt`: a whole number. **Opens at**.
- `rules.romance.defaults.difficulty`: one of `easy`, `normal`, `hard`, `very_hard`. **Difficulty**.
- `rules.romance.intimacyRoll`: a section. **Intimacy roll**.
- `rules.romance.intimacyRoll.enabled`: true or false. **Intimacy roll**.
- `rules.romance.intimacyRoll.stat`: one of `might`, `wits`, `charm`, `stealth`. **Stat**.
- `rules.romance.intimacyRoll.difficulty`: one of `easy`, `normal`, `hard`, `very_hard`. **Difficulty**.
- `rules.gamble`: a section. **Cards**.
- `rules.gamble.enabled`: true or false. **Card game**.
- `rules.gamble.stake`: a whole number. **Stake**.
- `rules.narration`: a section. **Narration**.
- `rules.narration.maxDue`: a whole number. **Due events a turn tells**.

#### `freedom`: Freedom

A section. How far the player may go beyond what you wrote.

- `freedom.preset`: one of `sandbox`, `guided`, `rails`. **Freedom**.
- `freedom.create`: a section. **What the player may add**.
- `freedom.create.places`: true or false. **Places**.
- `freedom.create.things`: true or false. **Things**.
- `freedom.create.people`: true or false. **People**.
- `freedom.create.perGame`: a whole number. **In a game**.
- `freedom.travel`: one of `anywhere`, `known`, `listed`. **Travel**.
- `freedom.steer`: one of `none`, `nudge`, `steer`. **Steer**.
- `freedom.scopeRefusal`: a section. **Out of scope**.
- `freedom.scopeRefusal.on`: true or false. **Refuse out of scope**.
- `freedom.scopeRefusal.reason`: one line of text, up to 500 characters. **Reason**.
- `freedom.skipAnywhere`: true or false. **Skip time anywhere**.

#### `prompts`: Prompts

A section. Notes added to the game's own prompts.

- `prompts.narratorExtra`: text, up to 1,500 characters. **Narrator notes**.
- `prompts.parserExtra`: text, up to 600 characters. **Parser notes**.
- `prompts.bookkeeperExtra`: text, up to 600 characters. **Bookkeeper notes**.

#### `suggestedSettings`: Suggested settings

A section. Shown at New game as a suggestion, never applied by itself.

- `suggestedSettings.narratorModel`: one line of text, up to 500 characters. **Narrator model**.
- `suggestedSettings.parserModel`: one line of text, up to 500 characters. **Parser model**.
- `suggestedSettings.effort`: values keyed by a name, each one line of text, up to 500 characters. **Effort**.
- `suggestedSettings.narrationStyle`: one of `casual`, `literary`. **Narration style**.

<!-- /generated -->

### What the fields mean

The labels and help above say what most fields are. These need more:

- **`world.setting`, `world.history`, `world.recent`.** The setting is what
  the narrator reads every turn: the town and its life now. The history and
  recent events are what came before, read into the cached town block (and
  counted in the budget). Write them as the town would tell them.
- **`world.locations[]`.** `discovered: false` is a home or a place the
  player finds when someone tells them about it (then "heard of" on the
  map until visited). `away: true` is out of town: talked about, never gone
  to, with `distance` saying how far. `closedOn` lists the weekdays it is
  shut; `hours` must name them too. Exits go both ways. `map` places it on
  the town map (an SVG in the map's own units; roads are drawn between
  exits). `npcIdsBySchedule` is who is there in each of the four phases.
- **`world.npcs[]`.** `presence` is `here` (scheduled, met in scenes),
  `away` (alive and elsewhere: `where` and `reach` say where and how) or
  `dead` (`died` and `buried`). A minor (under 18) is never a romance. The
  `start` tracks are how they feel about a stranger (trust, fear) when not
  zero. `axes` are their temper: pride, guardedness, nerve and
  grudge-holding, -2 to 2. `protector` is whom they go to when the player
  frightens or hurts them (an id, a list, `"nobody"`, or `{ "npcId": ...,
  "hidden": true }` for a tie the town does not know). `secretWeight` (1 to
  3) is how heavy their secret is to hold over them; `leverageKeys` are the
  words that show it in a narration (two needed); `mattersTo` whom it would
  be told to; `whenTold` what the law does when it is told them; `canRaise`
  what they can pay for silence (100 by default, 0 for anyone under 18);
  `mercenary: true` means money counts double with them and blackmail half.
  `awayOn` is a regular absence (school days).
- **`world.romance[]`.** Every adult can be interested in the player whether
  listed or not; an entry makes someone easier or harder. `sparkRate` (0.1
  to 2) scales a welcome flirt's spark, `romanceRate` what grows romance
  (the spark rate by default), `opensAt.knows` how well they must know the
  player before a flirt is taken as one, `difficulty` the charm roll a flirt
  makes with them. Anyone not listed: rate 0.5, opens at 10, hard
  (`rules.romance.defaults`). `faithful: true` reads as `very_hard`; `open`
  is retired.
- **`world.ties[]`.** Every relation is a tie both ways already, with its
  kind's liking and trust (`w`, `t`). An entry sets one side's numbers, or
  adds a tie the relations lack (`kind`: lover, enemy, payer, friend, other).
  `hidden: true` is a tie the town does not know (news travels through it
  and nobody says why); it needs `revealedBy` (rumours heard or flags set
  that show it). `why` names only the cast.
- **`world.secretTies[]`.** When the player tells `learnedBy` what they hold
  over `secretOf`, each tie listed moves by `w` and `t`, known from then on;
  `why` is the few words the narrator gets; `seed` is what it sets going a
  day or two later.
- **`world.factions[]`.** Clocks of 4 to 10 segments; each time the town
  moves on, the running clock (`activeClock`) fills a segment on a d6 at or
  above its `odds` (the clock's, else the faction's, else 5). Stagger the
  lengths so completions spread over the story. `onComplete` may carry
  `requires` and `alt` so its text holds in either order; `clockAdjust`
  sets a rival back or forward.
- **`world.threads[]`.** `reward` is the stat the player gains the first
  time they resolve it.
- **`world.seeds[]`.** A seed's `trigger` is a day, a place (or several), a
  person (or several: it fires when the player is with them) or a clock
  (`"fac_x:3"`). `notBeforeDay` holds it back. `effects` apply when it
  fires. `danger: true` is someone in trouble the player can step in on: the
  people its words name after the first (the one doing it) are in danger
  there for this phase and the next; it needs a place trigger and
  `requires.npcFree` for everyone it names.
- **`world.rumours[]`.** `tellerIds` are the people besides the source who
  can pass it on (two or more); `threadId` the thread hearing it can reveal;
  `factionId` whose people know it; a true rumour's `leverageOver` the
  person a hearer holds it over.
- **`world.events[]` and `world.epilogue`.** An event happens on its day and
  phase at its place, with the `attendees` who are free; the first branch
  whose `when` holds is what happens, and its news is public. The ending is
  told on `onDay`, or as soon as a flag in `orFlagsSet` is set; then play
  goes on. Let each ending settle the threads and plant what happens next,
  so the town does not stand still afterwards.
- **`world.tables`.** Goods (`kind`: a `good` is carried; a `drink`, `food`
  or `service` is had on the spot; a service named "Night at …" is a paid
  night). Complications are what a partial costs and how a failure turns:
  `tiers` (partial, failure, both), `kinds` (social, physical, stealth,
  any), `needsPerson` (only with someone present, who is `{witness}`),
  `notDay1`. Weather is by season, read each morning. The name and
  occupation lists are read by the person matcher only: nothing makes a
  person.
- **`world.grudgeTemplates` and `world.favourTemplates`.** What someone with
  a grudge does about it, and what someone who likes the player does for
  them. `kind` is the sort of answer (violence, police, gossip, money, ban;
  `report` to `police` or `family`; `tell` and `price` for what someone holds
  over the player; `ask` for a favour owed asked back); `forTags` and
  `notForTags` say who holds it; `public` whether the town hears; `needs`
  the tracks a favour needs (a favour that has to be believed needs trust).
  The old, the young and the law never beat anyone, and nothing assumes the
  player has a phone or a vehicle. A seed keeps its template by index, so
  add new templates last.
- **`player.backgrounds[]`.** Stats from -1 to 3; `gold` is in the story's
  currency; `items` are three things (in Low Water one is a prepaid phone,
  so the people who live elsewhere can be reached); `arrival` is `gate` or
  `docks`; `hook` is the first lead the town offers this kind of stranger,
  from someone in the cast, not before day 1 plus `dayOffset`.
- **`player.looseEnds{}`.** Each binds to a real person of the cast:
  `link.tag` names who it can be (the first free one, drawn by the seeded
  dice), and `optionTags`, one per preset option, narrow it when the player
  keeps that option's words. When its `seed` fires, that person comes to the
  player. `obligation` (the kind's own) or `obligations` (one per option)
  is what it binds the player to, due `dueOffset` days later, with `onStart`,
  `onMiss` and `onMet`, a `missText` and an `owedTo` when the person owed is
  not the one it binds. `followUp` is what comes after, while the loose end
  is open.
- **`world.law`, `world.gates`.** See [the assumptions](#what-the-engine-used-to-assume-about-low-water):
  `gates` are the named thresholds the council and the ending read (Low
  Water's `royce`, `friendly`, `bought`, `loretta`).

## Examples, by path

Each example below is real: from Low Water (`packs/low-water.json`, long
text shortened with "…"), or, where Low Water takes the engine's default, the
default it takes, or a value a starport might write. `node tests/guide-doc.cjs
--check` reads every block: each must be JSON, at a path the format has, with
only fields the format knows, and it counts the fields the examples show. The
few with no example of their own share a shape shown here: a template's
`needs` and an entry of `world.gates` take the four tracks of a person's
`start` (`liking`, `trust`, `fear`, `knows`); an entry of a loose end's
`obligations` takes the fields of its `obligation`; a follow-up's `alt` is a
seed's; a map label's `anchor` is described under `world.map`; a favour's
`about`, `to` and `notForTags` are a grudge's.

<!-- examples -->

#### `packFormat`

Every pack starts with the format it is written in.

```json
1
```

#### `meta` (Low Water)

```json
{
  "id": "low-water",
  "title": "Low Water",
  "author": "Joe",
  "version": "1.0.0",
  "description": "Lockett's Ferry is a river town of about eight hundred people where the state highway drops off the bluff and crosses the Lusk River on a narrow green steel bri…",
  "language": "en",
  "rating": "adult",
  "contentWarnings": ["sex", "violence", "drug deaths", "drug dealing", "smuggling", "blackmail"],
  "tags": ["modern", "small town", "crime", "river"],
  "lints": ["lockett-house"]
}
```

#### `meta` (a starport: its own prose, a note, no lint set)

```json
{
  "id": "starport",
  "rating": "teen",
  "lints": [],
  "minGameVersion": "",
  "storyText": "A transfer station at the edge of the system, the week the dock master's contract comes up for renewal. Security keeps a brig on the lower ring…",
  "notes": "The second sample pack. Shorter histories than Low Water's, to stay well under the budget."
}
```

#### `setting` (Low Water)

```json
{
  "era": "modern",
  "blurb": "A present-day river town of about eight hundred people on a state line, where the highway crosses the Lusk River on a failing 1938 bridge."
}
```

#### `setting` (a starport: names, vocabulary and shift names)

```json
{
  "era": "future",
  "locale": { "nameAllow": ["Ring Three", "the Belt"], "brandPhrases": ["ration bar"], "givenNames": ["Ines", "Tomas"] },
  "vocabulary": {
    "police": ["security", "marshal", "watch"],
    "essentials": ["berth", "air", "meal", "water"],
    "teen": ["cadet", "apprentice", "school deck"],
    "lodging": ["berth", "bunk", "cabin"]
  },
  "phaseLabels": { "morning": "First shift", "afternoon": "Second shift", "evening": "Third shift", "night": "Sleep cycle" }
}
```

#### `world` (Low Water's town fields)

```json
{
  "name": "Lockett's Ferry",
  "setting": "Lockett's Ferry is a river town of about eight hundred people where the state highway drops off the bluff and crosses the Lusk River on a narrow green steel bridge built in 1938…",
  "currency": { "symbol": "$", "name": "dollars" },
  "startLocationIds": { "gate": "loc_pittmans", "docks": "loc_purvis_landing" },
  "policeHead": "npc_marcus",
  "policeFallback": "npc_hoyt",
  "year": 2026,
  "calendar": { "season": "autumn", "startDate": "2026-10-08" },
  "history": "A man named Lockett ran a flatboat ferry across the Lusk here in the 1820s, and the town grew up around his landing…"
}
```

Low Water's currency has no `before` or `words` of its own: the symbol goes
before the number by default, and the words for money are the engine's. A
starport writes credits after the number, which reads "40 cr":

#### `world.currency` (a starport)

```json
{ "symbol": "cr", "name": "credits", "before": false, "words": ["credit", "credits", "cr"] }
```

#### `world.romance[]` (Low Water)

```json
{ "npcId": "npc_jodie", "sparkRate": 1.2, "opensAt": { "knows": 20 }, "difficulty": "easy" }
```

#### `world.romance[]` (a starport: someone slow to warm, and someone married and faithful)

```json
{ "npcId": "npc_quartermaster", "sparkRate": 0.4, "romanceRate": 0.8, "opensAt": { "knows": 40 }, "difficulty": "very_hard" }
```

```json
{ "npcId": "npc_medic", "faithful": true, "open": false }
```

#### `world.ties[]` (Low Water, a hidden tie)

```json
{
  "from": "npc_loretta", "to": "npc_royce", "kind": "lover", "w": 80, "t": 70, "hidden": true,
  "revealedBy": { "rumours": ["rum_royce_photos", "rum_royce_revote"] },
  "why": "She has been seeing Royce Pittman on Tuesday afternoons for eleven years."
}
```

#### `world.ties[]` (Low Water, a hidden tie a flag shows)

```json
{ "from": "npc_boyd", "to": "npc_wade", "kind": "enemy", "w": -90, "t": -90, "hidden": true, "revealedBy": { "flags": ["boydCameForWade"] }, "why": "He came to town for Wade Purvis." }
```

#### `world.secretTies[]` (Low Water)

```json
{ "secretOf": "npc_mavis", "learnedBy": "npc_dewayne", "ties": [{ "from": "npc_dewayne", "to": "npc_mavis", "w": -20, "t": -45 }], "why": "the garage money" }
```

```json
{
  "secretOf": "npc_colt", "learnedBy": "npc_tammy",
  "ties": [{ "from": "npc_tammy", "to": "npc_colt", "w": -100 }],
  "why": "the bottle Amber Lott died with",
  "seed": { "effect": "Tammy Lott goes after Colt Purvis with a tire iron at Riverbend, and it takes Lorna Purvis to pull her off him…", "dayOffset": [1, 2] }
}
```

#### `world.recent[]` (Low Water)

```json
{ "when": "September 2026", "what": "The council set its vote on the bridge site for its meeting on Tuesday, October 13." }
```

#### `world.offstage[]` (a starport)

```json
{ "name": "the old station master", "about": "retired to the inner system, writes to nobody" }
```

#### `world.map` (Low Water, shortened)

```json
{
  "width": 360, "height": 300, "riverWidth": 34,
  "river": "M0,226 C60,222 96,252 160,252 C224,252 280,232 360,244",
  "riverLabel": { "text": "Lusk River", "x": 186, "y": 255, "rotate": -3 },
  "bridges": ["M266,216 L270,266"],
  "roads": ["M264,0 C262,22 254,38 250,56"],
  "labels": [{ "text": "dry county", "x": 120, "y": 288 }]
}
```

A label's `anchor` (`start`, `middle` or `end`) sets which end of the text sits on its point; Low Water's labels all take the default.

#### `world.locations[]` (Low Water's bar)

```json
{
  "id": "loc_low_water",
  "name": "The Low Water",
  "type": "bar",
  "map": { "x": 184, "y": 170, "label": "Low Water", "anchor": "s" },
  "description": "A cinderblock bar on Front Street with neon beer signs in the window, a pool table with a slow lean and a flood line drawn in marker beside …",
  "details": "A beer is three dollars, a catfish basket nine, and the jukebox still takes quarters…",
  "hours": "11 a.m. to 2 a.m., Monday to Saturday; closed Sundays",
  "closedOn": ["Sunday"],
  "history": "Loretta Gaddis bought the Low Water in 1994, the year the bypass opened, and has kept it open through every flood since…",
  "aka": ["the bar"],
  "exits": ["loc_motor_court", "loc_town_hall", "loc_byrds_pawn", "loc_riverside_church", "loc_old_bridge", "loc_purvis_landing", "loc_gentry_house", "loc_front_street"],
  "npcIdsBySchedule": {
    "morning": ["npc_loretta"],
    "afternoon": ["npc_loretta", "npc_royce", "npc_tammy", "npc_elbert", "npc_curtis", "npc_jodie"],
    "evening": ["npc_loretta", "npc_carter", "npc_wade", "npc_tammy", "npc_lyman", "npc_curtis", "npc_jodie"],
    "night": ["npc_loretta", "npc_lyman", "npc_curtis", "npc_jodie"]
  },
  "discovered": true,
  "closed": false
}
```

#### `world.locations[]` (Low Water: a type label, and a place out of town)

```json
{ "id": "loc_town_hall", "name": "Town Hall", "type": "police", "typeLabel": "Town hall" }
```

```json
{
  "id": "loc_clayburn", "name": "Clayburn", "type": "town", "away": true,
  "distance": "twenty-six miles north up the state highway, about forty minutes by car",
  "exits": [], "discovered": false
}
```

#### `world.npcs[]` (Low Water's Jodie Strayhorn)

```json
{
  "id": "npc_jodie",
  "name": "Jodie Strayhorn",
  "pronouns": "she",
  "age": 29,
  "presence": "here",
  "role": "new waitress at the Low Water",
  "factionId": null,
  "tags": ["waitress", "stranger", "runaway"],
  "look": "Wiry woman of twenty-nine with bleached hair growing out dark, a Low Water apron and a fading bruise she covers with makeup.",
  "voice": "Quick and bright with the customers, then flat and careful the second anyone asks where she is from…",
  "personality": ["guarded", "resourceful"],
  "goal": "Find out who beat her uncle half to death below the landing, and leave before anyone learns her real name.",
  "secret": "Her real name is Jodie Ogletree: she is Bernice Ogletree's daughter, she skipped bail in the next state over…",
  "history": "Jodie Strayhorn turned up at the Low Water three weeks ago asking for work, and Loretta hired her that night…",
  "attitude": -5,
  "start": { "trust": -25 },
  "relations": [{ "npcId": "npc_loretta", "relation": "boss" }],
  "protector": "npc_loretta",
  "home": "loc_low_water",
  "memories": [],
  "alive": true,
  "knownToPlayer": false,
  "status": "free"
}
```

#### `world.npcs[]` (Low Water's Hollis Byrd: what he holds, and what he fears)

```json
{
  "id": "npc_hollis",
  "secretWeight": 3,
  "leverageKeys": ["cash book", "pawn sales", "converters"],
  "mattersTo": ["npc_marcus"],
  "whenTold": {
    "memory": "was told Hollis Byrd runs the landing's cash through his pawn books",
    "crime": true,
    "inquiry": "Chief Bell spends a morning at Byrd's Pawn going through the ledgers.",
    "news": "Chief Bell spent a morning at Byrd's Pawn going through the ledgers."
  },
  "canRaise": 300,
  "mercenary": true,
  "protector": { "npcId": "npc_wade", "hidden": true }
}
```

#### `world.npcs[]` (Low Water's Hoyt Bramlett, and a starport's temper written out in full)

```json
{ "id": "npc_hoyt", "axes": { "p": 1, "g": 1 } }
```

```json
{ "id": "npc_dock_master", "start": { "liking": -10, "trust": -20, "fear": 0, "knows": 5 }, "axes": { "p": 2, "g": 1, "n": 1, "r": 2 } }
```

#### `world.npcs[]` (Low Water: someone with school days, someone elsewhere, someone gone)

```json
{ "id": "npc_austin", "age": 15, "awayOn": { "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "phases": ["morning", "afternoon"], "where": "at the county school in Clayburn" } }
```

```json
{
  "id": "npc_dale", "name": "Dale Purvis", "presence": "away", "home": "loc_state_pen",
  "where": "the state penitentiary, eight years into a fifteen-year sentence",
  "reach": "letters, and a collect call on Sunday nights; visiting is the second and fourth Saturday",
  "status": "gone"
}
```

```json
{ "id": "npc_amber", "name": "Amber Lott", "age": 19, "presence": "dead", "died": "August 2026, an overdose at Riverbend", "buried": "loc_cemetery", "alive": false, "status": "dead", "home": null }
```

#### `world.npcs[].memories[]` (what a save's person carries; a pack's start empty)

```json
{ "turn": 12, "text": "paid the four hundred in full and on time", "weight": 2, "event": "paid_back", "act": "own" }
```

#### `world.factions[]` (Low Water's land company, one clock of three)

```json
{
  "id": "fac_sturdivant",
  "name": "Sturdivant Land and Timber",
  "goal": "Get the old bridge closed and the new state bridge built five miles downstream on Sturdivant bottomland…",
  "methods": "Private loans and contracts for deed that can be called in on a week's notice, a mayor paid in cash…",
  "clocks": [{
    "label": "Buy the swing vote",
    "segments": 6,
    "filled": 0,
    "onComplete": {
      "text": "Carter Sturdivant tears up the note on Pittman's Gas and Service in front of Royce Pittman, and Royce promises him his v…",
      "requires": { "flagsUnset": ["councilVoted", "royceTurned"] },
      "effects": [
        { "op": "setFlag", "key": "royceBought", "value": true },
        { "op": "factionRelation", "a": "fac_sturdivant", "b": "fac_nightrun", "delta": -15 },
        { "op": "clockAdjust", "factionId": "fac_nightrun", "delta": -1 }
      ],
      "alt": {
        "text": "Carter Sturdivant tears up the note on Pittman's Gas and Service in front of Royce Pittman anyway, and Royce takes it wi…",
        "effects": [{ "op": "setFlag", "key": "royceBought", "value": true }]
      }
    }
  }],
  "activeClock": 0,
  "relations": { "fac_police": -30, "fac_nightrun": -50 }
}
```

Low Water's factions take the engine's odds (a segment fills on a 5 or 6). A
faction that moves faster sets its own, or one clock's:

#### `world.factions[]` (a starport)

```json
{ "id": "fac_dock_office", "name": "The Dock Master's Office", "odds": 4, "clocks": [{ "label": "Raise the berth fees", "segments": 5, "odds": 3 }] }
```

#### `world.threads[]` (Low Water)

```json
{
  "id": "thr_bridge_vote",
  "title": "The bridge vote",
  "summary": "The state has rated the old bridge critical and will pay for one new crossing, either in town or five miles downstream o…",
  "status": "open",
  "knownToPlayer": false,
  "linkedIds": ["fac_sturdivant", "fac_nightrun", "npc_carter", "npc_royce", "loc_old_bridge"],
  "reward": "charm"
}
```

#### `world.seeds[]` (Low Water: a day trigger with requires and alt)

```json
{
  "id": "seed_big_run",
  "cause": "Wade Purvis has bought two hundred cartons and forty cases of liquor for the biggest run of the fall…",
  "effect": "The Night Run took a full load across the river overnight; Chief Bell is down at Purvis Landing photographing fresh trai…",
  "trigger": { "type": "day", "value": 4 },
  "requires": { "npcFree": ["npc_marcus", "npc_wade", "npc_colt"], "flagsUnset": ["boatsPulledUp"] },
  "effects": [{ "op": "clockAdjust", "factionId": "fac_nightrun", "delta": 1 }],
  "alt": { "text": "Wade Purvis has two hundred cartons and forty cases of liquor stacked in the back of the bait shop for the biggest run o…" },
  "fired": false,
  "hidden": true
}
```

#### `world.seeds[].alt` (Low Water: what happens instead, with effects of its own)

```json
{
  "text": "June Satterfield brought Brianna Tolliver back from an overdose last night and did not call it in; w…",
  "effects": [{ "op": "addNews", "text": "Brianna Tolliver nearly died on pills at Riverbend last night, and Tammy Lott is blaming Trent Haski…", "public": true }]
}
```

#### `world.seeds[]` (Low Water: someone in danger, at a place)

```json
{
  "id": "seed_landing_short_count",
  "cause": "Colt Purvis is sure Trent Haskins shorted him on his cut of the last run across the river.",
  "effect": "Colt Purvis has Trent Haskins backed up against the ice machine outside the bait shop over a short c…",
  "trigger": { "type": "location", "value": "loc_purvis_landing" },
  "notBeforeDay": 8,
  "requires": { "npcFree": ["npc_colt", "npc_trent"] },
  "danger": true,
  "fired": false,
  "hidden": true
}
```

#### `world.rumours[]` (Low Water)

```json
{
  "id": "rum_police_budget",
  "text": "The mayor wants to get rid of the police and hand the town to the county sheriff before Christmas.",
  "true": true,
  "sourceNpcId": "npc_travis",
  "factionId": "fac_police",
  "tellerIds": ["npc_gerald"],
  "threadId": "thr_police_vote",
  "heard": false
}
```

```json
{
  "id": "rum_mavis_cash_rooms",
  "text": "Mavis Mangum rings up a cash room at the motor court now and then that never makes it into the book.",
  "true": true, "sourceNpcId": "npc_brianna", "tellerIds": ["npc_tyler"], "leverageOver": "npc_mavis", "heard": false
}
```

#### `world.events[]` (Low Water's council meeting, one branch of several)

```json
{
  "id": "evt_council_meeting",
  "day": 6,
  "phase": "evening",
  "locationId": "loc_town_hall",
  "title": "The council meeting",
  "attendees": ["npc_jolene", "npc_royce", "npc_lamar", "npc_hollis", "npc_elbert", "npc_marcus"],
  "branches": [{
    "when": { "flagsSet": ["bridgeReportVoid"], "npcFree": ["npc_royce", "npc_lamar", "npc_hollis", "npc_elbert"] },
    "text": "With the bridge report thrown out and the mayor's chair empty, Royce Pittman chairs the meeting in her place…",
    "effects": [
      { "op": "setFlag", "key": "councilVoted", "value": true },
      { "op": "addNews", "text": "At Tuesday's council meeting the bridge vote was tabled until a second inspection…", "public": true }
    ]
  }],
  "default": {
    "text": "With empty chairs at the table and nobody sure of the count, the council puts the bridge site off to its next …",
    "effects": [{ "op": "setFlag", "key": "councilVoted", "value": true }]
  }
}
```

#### `world.epilogue` (Low Water, one branch of several)

```json
{
  "onDay": 21,
  "orFlagsSet": ["oldBridgeClosed", "secondInspectionOrdered"],
  "branches": [{
    "when": { "flagsSet": ["bridgeReportVoid", "policeKept"], "flagsUnset": ["oldBridgeClosed"] },
    "text": "The old bridge is still open and still rattling under every pickup. The state threw out the report Carter Sturdivant pai…",
    "effects": [{ "op": "threadUpdate", "threadId": "thr_bridge_vote", "status": "resolved", "knownToPlayer": true, "summary": "The state threw out the bought bridge report…" }]
  }],
  "default": {
    "text": "Three weeks in, nothing is settled. The old bridge is still open and still posted at five tons…",
    "effects": [{ "op": "threadUpdate", "threadId": "thr_bridge_vote", "status": "failed", "knownToPlayer": true }]
  }
}
```

#### `world.tables` (Low Water, a few of each; a starport's synonyms)

```json
{
  "npc": { "firstNames": ["Ashley", "Bobby", "Brandi"], "occupations": ["long-haul trucker", "dollar store manager"] },
  "location": { "types": ["dollar store", "laundromat"], "details": ["a dog asleep across the doorway that nobody moves"], "problems": ["the roof leaks over the cash register"] },
  "items": {
    "goods": [
      { "name": "Pack of cigarettes", "price": 9, "kind": "good" },
      { "name": "Bottle of beer", "price": 3, "kind": "drink" },
      { "name": "Catfish basket", "price": 9, "kind": "food" },
      { "name": "Night at the motel", "price": 49, "kind": "service" }
    ],
    "trinkets": ["a wedding ring with the stone missing"]
  },
  "complications": [
    { "text": "{witness} sees it, and will know your face from now on", "tiers": ["failure"], "kinds": ["social", "stealth"], "needsPerson": true, "notDay1": true },
    { "text": "you get it, but you get hurt doing it", "tiers": ["partial"], "kinds": ["physical"], "effects": [{ "op": "playerHp", "delta": -1 }] }
  ],
  "weather": {
    "spring": ["Warm rain coming in sideways off the river"],
    "summer": ["Hot and airless, the river low and smelling of mud"],
    "autumn": ["Steady rain and a rising river"],
    "winter": ["Cold rain blowing down Front Street"]
  }
}
```

Low Water's goods have no `synonyms` (the engine knows a beer is a drink, a
round or a cold one). A starport names its own:

#### `world.tables.items.goods[]` (a starport)

```json
{ "name": "Berth for the night", "price": 40, "kind": "service", "synonyms": ["bunk", "cabin", "rack"] }
```

#### `world.grudgeTemplates[]` (Low Water)

```json
{
  "effect": "{npc} tells Chief Bell that {player} was seen hanging around where things went missing, and the police start k…",
  "kind": "police",
  "about": ["theft"],
  "dayOffset": [2, 4],
  "effects": [{ "op": "socialEvent", "npcId": "npc_marcus", "event": "crossed", "d": { "w": -10, "t": -10 }, "text": "{npc} says {playerName} was hanging around where things went missing.", "weight": 2, "secondhand": true }],
  "public": false,
  "notForTags": ["police"]
}
```

```json
{
  "effect": "{npc} tells {protector} that {player} has been leaning on them, and {protector} goes cold on {player}.",
  "kind": "report", "to": "family", "about": ["threat"], "dayOffset": [1, 2],
  "effects": [{ "op": "socialEvent", "npcId": "{protectorId}", "event": "crossed", "d": { "w": -10, "t": -10 }, "text": "{npc} says {playerName} has been leaning on them.", "secondhand": true }],
  "public": false
}
```

#### `world.grudgeTemplates[]` (Low Water: a ban, held only by a bartender)

```json
{
  "effect": "{npc} puts {player}'s name on the list by the register of people the Low Water will not serve.",
  "kind": "ban", "dayOffset": [2, 3],
  "effects": [{ "op": "banFrom", "locationId": "loc_low_water", "days": 3, "byNpcId": "{npcId}" }],
  "public": true, "forTags": ["bartender"]
}
```

#### `world.favourTemplates[]` (Low Water: a favour owed, asked back)

```json
{
  "effect": "{npc} needs a hand pulling an engine Saturday and asks {player} to come by, since {player} owes them…",
  "kind": "ask", "dayOffset": [1, 1],
  "effects": [{ "op": "addMemory", "npcId": "{npcId}", "text": "Asked {playerName} for a hand with an engine, the favour owed me.", "weight": 1, "act": "own" }],
  "public": false, "forTags": ["mechanic", "outboard"]
}
```

#### `world.favourTemplates[]` (Low Water)

```json
{
  "effect": "{npc} pulls out a phone and shows {player} a photo of someone who has wronged {player}, taken somewhere that p…",
  "dayOffset": [3, 5],
  "effects": [{ "op": "addNews", "text": "{npc} showed {playerName} a photo worth remembering.", "public": false }],
  "public": false,
  "forTags": ["informant", "teen", "gossip", "clerk"],
  "needs": { "trust": 30 }
}
```

#### `world.law` (Low Water; a starport names its security chief and its brig)

```json
{
  "factionId": "fac_police",
  "headNpcId": "npc_marcus",
  "fallbackNpcId": "npc_hoyt",
  "arrestPlaceId": "loc_town_hall",
  "newsTemplate": "Chief Bell has been asking questions about {npc}."
}
```

#### `world.gates` (Low Water)

```json
{
  "council": { "royce": { "trust": 30, "knows": 25 }, "friendly": { "liking": 15 }, "bought": { "trust": 20 } },
  "epilogue": { "loretta": { "liking": 40 } }
}
```

#### `player.backgrounds[]` (Low Water)

```json
{
  "id": "bg_veteran",
  "name": "Veteran",
  "blurb": "You did two tours overseas, came home to a town that had moved on without you, and have been drifting south on…",
  "age": 34,
  "stats": { "might": 2, "wits": 0, "charm": 0, "stealth": 1 },
  "gold": 140,
  "items": [
    { "id": "item_folding_knife", "name": "Folding knife", "qty": 1, "notes": "Kept sharp out of habit." },
    { "id": "item_dog_tags", "name": "Dog tags", "qty": 1, "notes": "Yours, and one from a friend who did not come home." },
    { "id": "item_phone_veteran", "name": "Prepaid phone", "qty": 1, "notes": "A cheap flip phone with forty minutes left on it…" }
  ],
  "arrival": "gate",
  "hook": {
    "npcId": "npc_marcus",
    "text": "Chief Marcus Bell clocks the way {player} stands, asks where {player} served, and says he could use somebody n…",
    "dayOffset": 0,
    "trigger": { "type": "npc", "value": "npc_marcus" }
  }
}
```

#### `player` (Low Water: flaws, goals, stats, start, ages, arrivals, creation)

```json
{
  "flaws": ["Can't pass a scratch-off ticket or a card game without buying in.", "Lies out of habit, even when the truth would do."],
  "goalPresets": ["Find out who sold Amber Lott the pills that killed her."],
  "stats": {
    "might": { "label": "Might", "blurb": "Strength and toughness: fights, lifting, holding a door shut." },
    "wits": { "label": "Wits", "blurb": "Noticing, figuring out, remembering, fixing things." },
    "charm": { "label": "Charm", "blurb": "Talking people round: persuading, lying, calming, flirting." },
    "stealth": { "label": "Stealth", "blurb": "Not being seen: sneaking, picking pockets and locks, slipping off." }
  },
  "start": { "hp": 10, "storyPoints": 2 },
  "ageRange": [16, 90],
  "arrivals": {
    "gate": { "label": "By road", "opening": "You come in on foot by the road and stop at {place}, on the edge of {town}.", "summary": "arriving by the road" },
    "docks": { "label": "By river", "opening": "You step off a river boat onto {place} in {town}, your pack on your shoulder.", "summary": "arriving by the river" }
  },
  "creation": {
    "steps": [
      { "id": "name", "title": "Name", "sub": "What people in town will call you." },
      { "id": "background", "title": "Background and age", "sub": "Sets your starting stats, money, three things (one a prepaid phone), and whether you arrive by road or river…" },
      { "id": "stats", "title": "Stats", "sub": "You can move one point: take it from one stat with −, give it to another with +…" },
      { "id": "goal", "title": "Goal and flaw", "sub": "Why you came to this town, in one line, and the habit that gets you into trouble." },
      { "id": "loose", "title": "Three loose ends", "sub": "Pick three. Each becomes a real person in town, with consequences." }
    ]
  }
}
```

#### `player.looseEnds{}` (Low Water's debt, one obligation of three, the effect lists shortened)

```json
{
  "label": "A debt",
  "options": ["I owe a man in this town six hundred dollars I don't have.", "I took out a title loan I couldn't cover, and the note was sold to someone here.", "I lost four hundred dollars at cards and swore I'd pay it inside a week."],
  "link": { "tag": "lender", "optionTags": ["lender", "collector", "bookie"] },
  "seed": { "dayOffset": [3, 4], "effect": "{npc} walks up to you, reads your name off a folded paper with a number written under it, and says the money i…", "trigger": "day" },
  "obligation": {
    "kind": "debt", "amount": 400, "dueOffset": 3,
    "text": "Pay {npc} the four hundred dollars you owe.",
    "missText": "{npc} came looking for the four hundred dollars and took {playerName}'s phone as a start on it.",
    "onMiss": [{ "op": "takeItem", "name": "Prepaid phone" }],
    "onMet": [{ "op": "socialEvent", "npcId": "{npcId}", "event": "paid_back", "d": { "w": 10 }, "text": "{playerName} paid the four hundred in full and on time.", "weight": 2 }]
  },
  "obligations": [{
    "kind": "debt", "amount": 600, "dueOffset": 3,
    "text": "Pay {npc} the six hundred dollars you owe.",
    "missText": "{npc} came looking for the six hundred dollars and took {playerName}'s phone as a down payment.",
    "onMiss": [{ "op": "takeItem", "name": "Prepaid phone" }],
    "onMet": [{ "op": "socialEvent", "npcId": "{npcId}", "event": "paid_back", "d": { "w": 10 }, "text": "{playerName} paid the six hundred in full and on time.", "weight": 2 }]
  }]
}
```

#### `player.looseEnds{}` (Low Water's enemy: the follow-up)

```json
{
  "link": { "tag": "enemy", "optionTags": ["enemy", "parolee", "enemy"] },
  "followUp": {
    "dayOffset": [3, 5],
    "effect": "{npc} comes up on you from the side, puts you against the nearest wall and hits you twice, hard…",
    "effects": [
      { "op": "playerHp", "delta": -2 },
      { "op": "addCondition", "name": "Bruised ribs", "effect": "-1 might", "days": 2 }
    ],
    "alt": { "text": "{npc} passes you close enough to touch, looks at you a long moment, and keeps walking." }
  }
}
```

#### `player.looseEnds{}.obligation` (Low Water: an errand, a letter given at the start and owed to someone else)

```json
{
  "kind": "errand",
  "itemName": "Letter for {npc}",
  "owedTo": "npc_bernice",
  "onStart": [{ "op": "giveItem", "name": "Letter for {npc}", "notes": "Sealed, addressed in a careful hand, and not yours to open." }]
}
```

#### `opening` (a starport; Low Water has none of its own)

```json
{
  "premise": "A transfer station at the edge of the system, the week its dock master's contract comes up for renewal. You came in on the last freighter with a debt and a name you would rather not use.",
  "text": "The lock cycles and the dock ring opens in front of you: cold air, a long curve of berths, a security post with its shutter half down.",
  "firstTurn": "The player has just stepped off the freighter onto the dock ring; nobody here knows them yet."
}
```

#### `narration` (the engine's defaults Low Water takes, with one example turn and a starport's banned phrases)

```json
{
  "preset": "casual",
  "customGuide": "",
  "banned": ["a testament to", "the hum of the station"],
  "alsoAvoid": ["starlight as a metaphor"],
  "softChecks": { "simile": true, "asYou": true, "inventedPast": true, "moneyLeak": true, "repeat": true },
  "examples": [{
    "input": "ask the bartender who runs the card game",
    "context": "PLACE: the cantina. PRESENT: the bartender. ROLL: none.",
    "narration": "She keeps wiping the same glass. \"Back table, after second shift. Bring cash, not questions.\""
  }],
  "goodTurn": "WHAT A GOOD TURN DOES: something moves. Someone wants something and says it, or gives one concrete thing (a name, a place, a time, a price) or a plain reason they won't…",
  "lengths": { "normal": 90, "zoom": 150, "intimate": 450, "intimateMin": 250, "hardOver": 15 },
  "pointOfView": "second-present"
}
```

#### `directions` (the engine's intimate direction, which Low Water takes, shortened)

```json
{
  "intimate": "INTIMATE SCENE. This turn is the scene itself, the exception to the guide's length, its one-detail rule and its no mood-setting: immerse the player in it. Write it out from the moment it tips, slowly, beat by beat, in paragraphs…"
}
```

#### `directions` (a starport's; an empty one is no direction, as every one but intimate is by default)

```json
{
  "arrival": "Arrivals on the dock ring: one sound, one smell, one person who notices. No sweeping view of the station.",
  "combat": "Fights are short and close; the hull is never breached by a fist.",
  "defeat": "", "death": "", "timeSkip": "", "gamble": "", "epilogue": "",
  "firstTurn": "", "refusedByNpc": "", "rollFailure": "", "rollCritical": ""
}
```

#### `rules` (the engine's defaults Low Water takes; a starport sets its stake and fine in credits)

```json
{
  "rolls": { "always": [], "never": [], "alwaysPhrases": [], "neverPhrases": [] },
  "dcs": { "easy": 8, "normal": 12, "hard": 15, "very_hard": 18 },
  "floors": { "ask": "hard", "lie": [[-25, "hard"], [-50, "very_hard"]], "intimidateHard": "hard" },
  "hp": { "start": 10, "max": 10, "damage": { "failure": [1, 3], "partial": 1, "critical_failure": 3 } },
  "crits": true,
  "permadeath": false,
  "showRolls": true,
  "storyPoints": { "start": 2, "max": 3, "factAllowed": true },
  "time": { "shortsPerPhase": 3, "costs": { "move": "short" } },
  "prices": { "factor": 1 },
  "law": { "fine": 50, "roughSleeping": true, "roughNights": 2, "roughFine": 25, "roughForgiven": 7 },
  "cheats": { "allowed": true, "debugView": true },
  "undo": true,
  "romance": {
    "enabled": true,
    "gates": { "spark": 50, "romance": 40, "trust": 30, "knows": 30 },
    "defaults": { "sparkRate": 0.5, "opensAt": 10, "difficulty": "hard" },
    "intimacyRoll": { "enabled": true, "stat": "charm", "difficulty": "normal" }
  },
  "gamble": { "enabled": true, "stake": 20 },
  "narration": { "maxDue": 3 }
}
```

#### `freedom` (a starport's guided story; Low Water is the sandbox)

```json
{
  "preset": "guided",
  "create": { "places": true, "things": true, "people": false, "perGame": 12 },
  "travel": "known",
  "steer": "nudge",
  "scopeRefusal": { "on": false, "reason": "This story stays on the station." },
  "skipAnywhere": true
}
```

#### `prompts` (a starport; Low Water has none)

```json
{
  "narratorExtra": "Station people say \"the ring\" for the dock ring and never say \"space\".",
  "parserExtra": "\"Cycle the lock\" is moving to the dock ring.",
  "bookkeeperExtra": ""
}
```

#### `suggestedSettings` (a starport; Low Water has none)

```json
{ "narratorModel": "claude-sonnet-5-5", "parserModel": "claude-haiku-5-5", "effort": { "narrator": "medium" }, "narrationStyle": "casual" }
```

<!-- /examples -->
