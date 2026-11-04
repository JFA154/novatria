# Changelog

What changed for players in each wave of work on Lockett's Ferry, newest
first. The build you are playing is on the title screen's footer and in
Settings under Advanced ("Build: wave 52 · rules v10"); name it in a bug
report. A wave that changed only the tests or the tooling says so.

## Wave 52 · 2026-11-04

The guard that keeps anyone under 18 out of a romance now recognises
propositions put in plain words ("after dark, just us", "somewhere quiet
where nobody can see", "want a girlfriend?") even when the parser misses
them. Check key says when the API may have refused the key instead of
blaming your connection (from a browser the two look the same). The first
live session after the overnight round, the grammar probe and the labelled
eval are written up in the maintainer's guide and the known issues.

## Wave 51 · 2026-11-04

No change in play. The README is a short guide for players, the full manual
and the maintainer's guide are in docs/, and known issues are listed in one
place.

## Wave 50 · 2026-11-04

No change in play. The game is now edited in small source files and joined
into the same one-file index.html, which still plays with no build.

## Wave 49 · 2026-11-04

No change in play. The tests share their helpers and wait on what they are
waiting for rather than on a clock.

## Wave 48 · 2026-11-04

A long game keeps its undo history and its saves without filling the
device: a turn writes only its own step, and the town is stored once. If the
device does run out of room, the game plays on and says so once.

## Wave 47 · 2026-11-04

No change in play. The offline demo's stand-in narrator is its own part of
the code, and the game decides who counts as police the same way
everywhere.

## Wave 46 · 2026-11-04

The reading font, Literata, is inside the page now: nothing is fetched from
Google or anywhere else when the game opens, and the font works offline. On a
host, Add to Home Screen installs the game with its own name and a bridge
icon, and the build you are playing is shown on the title screen, in
Settings and in Debug.

## Wave 45 · 2026-11-04

Screen readers and larger text work: the first Tab stop on the game screen
skips to the story, each turn has its own heading, the status line above
the input is announced, and every size follows your browser's text size.

## Wave 44 · 2026-11-04

A new player is shown how to get a key in four steps, sees no dead
Continue on a first visit, and after the first narration gets two or three
things to try right there. Settings can forget the key or delete everything
the game keeps on this device.

## Wave 43 · 2026-11-04

The top bar says where you are in the three weeks ('Day 3 of 21') and what
this game has cost so far; the save keeps the total, and Settings can pause
and ask once you reach an amount you choose.

## Wave 42 · 2026-11-04

No change in play. The narrator's standing instructions say each thing
once, which leaves room for the next rule or person without costing more.

## Wave 41 · 2026-11-04

A busy API no longer fails the turn: the game waits as long as the API asks
(up to a minute), counts down above the input, and Stop cancels the wait and
keeps your words. Each turn costs a little less, because more of the prompt
is cached.

## Wave 40 · 2026-11-03

Fear or leverage never buys a romantic yes, however the line is put: a walk
to the motor court, a gift or a use is refused like a word would be, every
person named is checked, and a threat to the whole room is refused by
everyone in it. A clean theft nobody saw can still be noticed in the days
after.

## Wave 39 · 2026-11-03

No change in play. Real saves from every older rules version are kept with
the game, so updating an old game is tested against the real thing.

## Wave 38 · 2026-11-03

No change in play. The 21-day simulator now courts someone and blackmails
the town, so changes to romance and leverage are measured before they ship.

## Wave 37 · 2026-11-03

No change in play. The check of how the bookkeeper names what you did has
a labelled set of 216 turns, ready for a live run.

## Wave 36 · 2026-11-03

No change in play. The tests run faster and in parallel, and the game is
checked from a web server as well as from a file on disk.

## Wave 35 · 2026-11-03

Romance is its own track: seven sliders on a person's Edit form, and the
statuses read wanting and caring. Romance grows slowly out of wanting plus
time and confidences, and fades over weeks.

## Wave 34 · 2026-11-03

Anyone can be won over, some the hard way: every adult can be romanced, a
flirt rolls charm, and some people (Jodie, Shayla) are easier than others.

## Wave 33 · 2026-11-03

A kiss lands on the one kissed: a romantic line that names nobody is aimed at
the person you mean, not the whole room. The Objectives tab and the
relationship system were joined up the same day.

## Wave 32 · 2026-11-02

What you say about people changes how they see each other: telling someone a
secret you hold over another moves their tie, and the other hears who told.

## Wave 31 · 2026-11-01

What you do to someone reaches the people close to them: a husband or wife by
the next night, family and work by the next morning. The town has ties of
its own, some of them hidden.

## Wave 30 · 2026-11-01

People show where they stand and why: the People card says it in words with
two dated reasons, never a number, and older games learn it too.

## Wave 29 · 2026-11-01

People want you, hold things over you and owe you favours, and the People
card shows what is held and what is owed.

## Wave 28 · 2026-11-01

The bookkeeper names what people will remember, and nobody under 18 is part
of a romance, decided before the story is told.

## Wave 27 · 2026-11-01

People remember what the engine saw them go through: a fight, a threat, a
theft, a gift or time spent is one memory for what it was.

## Wave 26 · 2026-11-01

An Objectives tab tracks what people asked of you, by when and for what, as
far as you know it. Underneath, people carry six tracks under the one number
the game shows.

## Wave 25 · 2026-11-01

Someone the story walks in is in the scene: if the narration has Jodie slip
into your room, you can talk to her.

## Wave 24 · 2026-11-01

What you hand over is held only by what you carry: a big payment the story
counts as paid now leaves your pocket.

## Wave 23 · 2026-11-01

/fact refuses a question at no cost and says what a fact is for: making a
statement true, not asking about someone.

## Wave 22 · 2026-11-01

Meetings agreed in the story are kept: the person is there at the place and
time they named.

## Wave 21 · 2026-10-31

Night holds a long action before dawn, so the people at last call are still
there. /cheat time may go back as well as forward, and /cheat success gives a
full success.

## Wave 20 · 2026-10-31

The betting table's words after its second QA: asks, shoves, notes and a
short screen read right, and the status line forgets a table once its hand
is done.

## Wave 19 · 2026-10-31

The card table after the betting QA: clearer asks, notices, layout and
telling, with the money exact throughout.

## Wave 18 · 2026-10-31

The card table bets for real: raise, call or go all in, a limit set by the
house, and table stakes when you ask for them.

## Wave 17 · 2026-10-31

What changed each turn is recorded again: the bookkeeper's schema fits the
API's limit, with a smaller fallback if it ever does not.

## Wave 16 · 2026-10-31

Undo reaches back many turns, to the start of a card game, and old turns with
no undo step can be struck from the story.

## Wave 15 · 2026-10-31

The card table's last rough spots: an old open draw hand folds on load, and
kickers line up.

## Wave 14 · 2026-10-31

The win cheat never changes a card you have seen, a fold plays out the bet,
and the table keeps your hand in view.

## Wave 13 · 2026-10-31

Texas hold'em beside five-card draw, more seats at the table, and a cheat
that wins the hand without playing it.

## Wave 12 · 2026-10-31

The story follows after a hand on a phone, and a stored hand is bound to its
game.

## Wave 11 · 2026-10-31

At the card table a dealt hand is final, a bet said aloud deals, and stakes
are said in words.

## Wave 10 · 2026-10-31

Five-card draw at a table you can see in the story, and /cheat cards.

## Wave 9 · 2026-10-31

Nobody in the scene can see the player's money: people no longer say how
much cash you have left.

## Wave 8 · 2026-10-30

The last items of the final pass: /pronouns turns a person's ties with them
("husband", "son"), and a missed debt's news is told once.

## Wave 7 · 2026-10-30

A thread settled out of sight keeps its old Journal line until the news is
told.

## Wave 6 · 2026-10-30

Polish: the feed after a reload or /undo is drawn in the order it was shown,
"Meanwhile in town" reads as news, and the phone typing row is tidier.

## Wave 5 · 2026-10-30

Phone, focus and accessibility fixes; a rough night after a shut door costs
the fine on the third night running.

## Wave 4 · 2026-10-30

The third review's fixes: the Character tab's Grown line, a queued line is
never lost, and a police place is a police station.

## Wave 3 · 2026-10-30

The second review's fixes: payments, bans and due events at the end of a
walk; /help styled properly.

## Wave 2 · 2026-10-30

A read-only second tab plays nothing and can take over safely, a phone
composer that keeps its width, a larger map, and contrast in both themes.

## Wave 1 · 2026-10-30

The first build and the first review's fixes, from 27 Oct: the town of
Lockett's Ferry with a full hand-written cast, character creation, the turn
pipeline, Do and Say modes, casual narration, person cards, a map with
tap-to-travel, /undo, /reroll and /cheat, updating older games, and the
home-screen tags for iOS.
